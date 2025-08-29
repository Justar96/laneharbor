import { ServerUnaryCall, ServerReadableStream, ServerWritableStream, sendUnaryData, Metadata } from '@grpc/grpc-js'
import { S3StorageProvider } from '../providers/s3.provider.js'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'

// Progress tracking
class ProgressTracker extends EventEmitter {
  private operations: Map<string, any> = new Map()

  startOperation(operationId: string, totalBytes: number) {
    this.operations.set(operationId, {
      operationId,
      status: 'in_progress',
      progress: 0,
      bytesProcessed: 0,
      bytesTotal: totalBytes,
      startTime: Date.now(),
      message: 'Operation started',
    })
  }

  updateProgress(operationId: string, bytesProcessed: number, message?: string) {
    const op = this.operations.get(operationId)
    if (!op) return

    op.bytesProcessed = bytesProcessed
    op.progress = (bytesProcessed / op.bytesTotal) * 100
    if (message) op.message = message

    const elapsed = (Date.now() - op.startTime) / 1000
    op.speedBps = elapsed > 0 ? bytesProcessed / elapsed : 0
    op.etaSeconds = op.speedBps > 0 ? (op.bytesTotal - bytesProcessed) / op.speedBps : 0

    this.emit('progress', operationId, op)
  }

  completeOperation(operationId: string, message?: string) {
    const op = this.operations.get(operationId)
    if (!op) return

    op.status = 'completed'
    op.progress = 100
    op.message = message || 'Operation completed'
    this.emit('progress', operationId, op)
    
    // Clean up after a delay
    setTimeout(() => this.operations.delete(operationId), 60000)
  }

  failOperation(operationId: string, error: string) {
    const op = this.operations.get(operationId)
    if (!op) return

    op.status = 'failed'
    op.error = error
    op.message = 'Operation failed'
    this.emit('progress', operationId, op)
  }

  getOperation(operationId: string) {
    return this.operations.get(operationId)
  }
}

export class StorageServiceImplementation {
  private storage: S3StorageProvider
  private progressTracker: ProgressTracker
  private uploadBuffers: Map<string, Buffer[]> = new Map()

  constructor(storage: S3StorageProvider) {
    this.storage = storage
    this.progressTracker = new ProgressTracker()
  }

  // Initiate upload
  async initiateUpload(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const request = call.request
      const { filename, app_name, version, platform, file_size, content_type } = request

      // For large files, use multipart upload
      if (file_size > 5 * 1024 * 1024) { // 5MB threshold
        const { uploadId, key } = await this.storage.initiateMultipartUpload(
          app_name,
          version,
          platform,
          filename,
          content_type
        )

        // Start progress tracking
        this.progressTracker.startOperation(uploadId, file_size)

        callback(null, {
          upload_id: uploadId,
          chunk_size: 5 * 1024 * 1024, // 5MB chunks
          total_chunks: Math.ceil(file_size / (5 * 1024 * 1024)),
          use_multipart: true,
        })
      } else {
        // For smaller files, generate presigned URL
        const uploadUrl = await this.storage.getPresignedUploadUrl(
          app_name,
          version,
          platform,
          filename,
          content_type
        )

        const uploadId = `direct-${Date.now()}`
        this.progressTracker.startOperation(uploadId, file_size)

        callback(null, {
          upload_id: uploadId,
          upload_url: uploadUrl,
          use_multipart: false,
        })
      }
    } catch (error) {
      callback({
        code: 13,
        message: error instanceof Error ? error.message : 'Failed to initiate upload',
      })
    }
  }

  // Stream upload chunks
  async uploadChunk(
    call: ServerReadableStream<any, any>,
    callback: sendUnaryData<any>
  ) {
    let uploadId: string | null = null
    let partNumber = 0
    let totalBytesReceived = 0
    const parts: Array<{ ETag: string; PartNumber: number }> = []

    call.on('data', async (chunk: any) => {
      try {
        if (!uploadId) {
          uploadId = chunk.upload_id
        }

        partNumber++
        const data = Buffer.from(chunk.data)
        totalBytesReceived += data.length

        // Upload part to S3
        const { etag } = await this.storage.uploadPart(
          uploadId,
          partNumber,
          data,
          chunk.checksum
        )

        parts.push({ ETag: etag, PartNumber: partNumber })

        // Update progress
        this.progressTracker.updateProgress(
          uploadId,
          totalBytesReceived,
          `Uploaded part ${partNumber}`
        )

        if (chunk.is_final) {
          // Complete the upload
          await this.completeMultipartUpload(uploadId, parts)
        }
      } catch (error) {
        console.error('Upload chunk error:', error)
        if (uploadId) {
          this.progressTracker.failOperation(uploadId, 
            error instanceof Error ? error.message : 'Upload failed')
        }
      }
    })

    call.on('end', () => {
      if (uploadId) {
        callback(null, {
          upload_id: uploadId,
          chunks_received: partNumber,
          bytes_received: totalBytesReceived,
          completed: true,
          message: 'Upload completed successfully',
        })
      } else {
        callback({
          code: 13,
          message: 'No upload ID received',
        })
      }
    })

    call.on('error', (error) => {
      console.error('Upload stream error:', error)
      if (uploadId) {
        this.progressTracker.failOperation(uploadId, error.message)
        this.storage.abortMultipartUpload(uploadId).catch(console.error)
      }
      callback({
        code: 13,
        message: error.message,
      })
    })
  }

  // Complete upload
  async completeUpload(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { upload_id, final_sha256 } = call.request

      const { location, etag } = await this.storage.completeMultipartUpload(upload_id)
      
      // Mark operation as complete
      this.progressTracker.completeOperation(upload_id, 'Upload completed')

      // Generate download URL
      const downloadUrl = await this.storage.getPresignedDownloadUrl(
        call.request.app_name || '',
        call.request.version || '',
        call.request.platform || '',
        call.request.filename || '',
        3600
      )

      callback(null, {
        file_id: etag,
        download_url: downloadUrl,
        metadata: {
          id: etag,
          sha256: final_sha256,
          created_at: new Date().toISOString(),
        },
      })
    } catch (error) {
      callback({
        code: 13,
        message: error instanceof Error ? error.message : 'Failed to complete upload',
      })
    }
  }

  // Stream download
  async initiateDownload(
    call: ServerWritableStream<any, any>
  ) {
    try {
      const request = call.request
      const { app_name, version, platform, file_id, start_byte, end_byte } = request

      // Get file metadata first
      const metadata = await this.storage.getFileMetadata(
        app_name,
        version,
        platform,
        file_id
      )

      const operationId = `download-${Date.now()}`
      this.progressTracker.startOperation(operationId, metadata.size)

      // Stream the file
      const stream = await this.storage.downloadStream(
        app_name,
        version,
        platform,
        file_id,
        start_byte && end_byte ? { start: start_byte, end: end_byte } : undefined
      )

      let chunkNumber = 0
      let totalBytesSent = 0
      const chunkSize = 1024 * 1024 // 1MB chunks

      stream.on('data', (data: Buffer) => {
        chunkNumber++
        totalBytesSent += data.length

        call.write({
          data: data,
          chunk_number: chunkNumber,
          total_size: metadata.size,
          is_final: false,
        })

        this.progressTracker.updateProgress(
          operationId,
          totalBytesSent,
          `Sent ${totalBytesSent} bytes`
        )
      })

      stream.on('end', () => {
        call.write({
          data: Buffer.alloc(0),
          chunk_number: chunkNumber + 1,
          total_size: metadata.size,
          is_final: true,
        })
        call.end()
        
        this.progressTracker.completeOperation(operationId, 'Download completed')
      })

      stream.on('error', (error) => {
        console.error('Download stream error:', error)
        this.progressTracker.failOperation(operationId, error.message)
        call.destroy(error)
      })
    } catch (error) {
      console.error('Download error:', error)
      call.destroy(error instanceof Error ? error : new Error('Download failed'))
    }
  }

  // Get download URL
  async getDownloadUrl(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { app_name, version, platform, file_id, expires_in_seconds } = call.request

      const downloadUrl = await this.storage.getPresignedDownloadUrl(
        app_name,
        version,
        platform,
        file_id,
        expires_in_seconds || 3600
      )

      const expiresAt = new Date(Date.now() + (expires_in_seconds || 3600) * 1000)

      callback(null, {
        download_url: downloadUrl,
        expires_at: expiresAt.toISOString(),
      })
    } catch (error) {
      callback({
        code: 13,
        message: error instanceof Error ? error.message : 'Failed to generate download URL',
      })
    }
  }

  // List files
  async listFiles(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { app_name, version, platform, max_results, next_token } = call.request

      const result = await this.storage.listFiles(
        app_name,
        version,
        platform,
        max_results || 100,
        next_token
      )

      const files = result.files.map(f => ({
        id: f.etag,
        filename: f.key.split('/').pop(),
        app_name,
        version,
        platform,
        size: f.size,
        created_at: f.lastModified.toISOString(),
      }))

      callback(null, {
        files,
        next_token: result.nextToken,
        total_count: files.length,
      })
    } catch (error) {
      callback({
        code: 13,
        message: error instanceof Error ? error.message : 'Failed to list files',
      })
    }
  }

  // Delete file
  async deleteFile(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { app_name, version, platform, file_id } = call.request

      await this.storage.deleteFile(app_name, version, platform, file_id)

      callback(null, {
        success: true,
        message: 'File deleted successfully',
      })
    } catch (error) {
      callback({
        code: 13,
        message: error instanceof Error ? error.message : 'Failed to delete file',
      })
    }
  }

  // Get file metadata
  async getFileMetadata(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { app_name, version, platform, file_id } = call.request

      const metadata = await this.storage.getFileMetadata(
        app_name,
        version,
        platform,
        file_id
      )

      callback(null, {
        id: metadata.etag,
        filename: file_id,
        app_name,
        version,
        platform,
        size: metadata.size,
        content_type: metadata.contentType,
        created_at: metadata.lastModified.toISOString(),
        metadata: metadata.metadata,
      })
    } catch (error) {
      callback({
        code: 13,
        message: error instanceof Error ? error.message : 'Failed to get file metadata',
      })
    }
  }

  // Stream upload progress
  async getUploadProgress(
    call: ServerWritableStream<any, any>
  ) {
    const { operation_id } = call.request

    const sendProgress = (operationId: string, progress: any) => {
      if (operationId === operation_id) {
        call.write({
          operation_id: operationId,
          status: progress.status,
          progress: progress.progress,
          bytes_processed: progress.bytesProcessed,
          bytes_total: progress.bytesTotal,
          message: progress.message,
          error: progress.error,
          speed_bps: progress.speedBps,
          eta_seconds: progress.etaSeconds,
        })

        if (progress.status === 'completed' || progress.status === 'failed') {
          call.end()
        }
      }
    }

    this.progressTracker.on('progress', sendProgress)

    // Send initial status
    const currentOp = this.progressTracker.getOperation(operation_id)
    if (currentOp) {
      sendProgress(operation_id, currentOp)
    }

    call.on('cancelled', () => {
      this.progressTracker.removeListener('progress', sendProgress)
    })
  }

  // Stream download progress
  async getDownloadProgress(
    call: ServerWritableStream<any, any>
  ) {
    // Same implementation as getUploadProgress
    this.getUploadProgress(call)
  }

  // Helper to complete multipart upload
  private async completeMultipartUpload(uploadId: string, parts: Array<{ ETag: string; PartNumber: number }>) {
    try {
      await this.storage.completeMultipartUpload(uploadId)
      this.progressTracker.completeOperation(uploadId, 'Upload completed')
    } catch (error) {
      this.progressTracker.failOperation(uploadId, 
        error instanceof Error ? error.message : 'Failed to complete upload')
      throw error
    }
  }
}

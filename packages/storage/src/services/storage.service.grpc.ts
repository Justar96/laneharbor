import { 
  ServerUnaryCall, 
  ServerReadableStream, 
  ServerWritableStream, 
  ServerDuplexStream,
  sendUnaryData, 
  Metadata 
} from '@grpc/grpc-js'
import { GCSStorageProvider } from '../providers/gcs.provider.js'
import { EventEmitter } from 'node:events'
import { createHash } from 'node:crypto'
import { Readable, PassThrough } from 'node:stream'

// Progress tracking for gRPC operations
class ProgressTracker extends EventEmitter {
  private operations: Map<string, any> = new Map()

  startOperation(operationId: string, totalBytes: number = 0) {
    const operation = {
      id: operationId,
      status: 'in_progress',
      progress: 0,
      bytesProcessed: 0,
      bytesTotal: totalBytes,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      speedBps: 0,
      etaSeconds: 0
    }
    
    this.operations.set(operationId, operation)
    this.emit('operation_started', operation)
    return operation
  }

  updateOperation(operationId: string, bytesProcessed: number, message?: string) {
    const operation = this.operations.get(operationId)
    if (!operation) return

    operation.bytesProcessed = bytesProcessed
    operation.progress = operation.bytesTotal > 0 ? (bytesProcessed / operation.bytesTotal) * 100 : 0
    operation.lastUpdate = Date.now()
    operation.message = message

    // Calculate speed and ETA
    const elapsed = (operation.lastUpdate - operation.startTime) / 1000
    operation.speedBps = elapsed > 0 ? bytesProcessed / elapsed : 0
    operation.etaSeconds = operation.speedBps > 0 ? (operation.bytesTotal - bytesProcessed) / operation.speedBps : 0

    this.operations.set(operationId, operation)
    this.emit('operation_updated', operation)
  }

  completeOperation(operationId: string, message?: string) {
    const operation = this.operations.get(operationId)
    if (!operation) return

    operation.status = 'completed'
    operation.progress = 100
    operation.message = message || 'Operation completed'
    operation.endTime = Date.now()

    this.operations.set(operationId, operation)
    this.emit('operation_completed', operation)
  }

  failOperation(operationId: string, error: string) {
    const operation = this.operations.get(operationId)
    if (!operation) return

    operation.status = 'failed'
    operation.error = error
    operation.endTime = Date.now()

    this.operations.set(operationId, operation)
    this.emit('operation_failed', operation)
  }

  getOperation(operationId: string) {
    return this.operations.get(operationId)
  }
}

export class StorageServiceImplementation {
  private storage: GCSStorageProvider
  private progressTracker: ProgressTracker
  private uploadBuffers: Map<string, Buffer[]> = new Map()

  constructor(storage: GCSStorageProvider) {
    this.storage = storage
    this.progressTracker = new ProgressTracker()
  }

  // Initiate upload - unary call
  async initiateUpload(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { filename, app_name, version, platform, file_size, content_type } = call.request
      
      console.log(`🔄 Initiating upload: ${filename} for ${app_name}/${version}/${platform}`)
      
      const uploadResult = await this.storage.initiateUpload({
        filename,
        appName: app_name,
        version,
        platform,
        fileSize: file_size,
        contentType: content_type
      })

      // Start progress tracking
      const operationId = uploadResult.uploadId
      this.progressTracker.startOperation(operationId, file_size || 0)

      callback(null, {
        upload_id: uploadResult.uploadId,
        upload_url: uploadResult.uploadUrl || '',
        chunk_size: 64 * 1024, // 64KB chunks
        total_chunks: Math.ceil((file_size || 0) / (64 * 1024)),
        use_multipart: uploadResult.useMultipart
      })
      
      console.log(`✅ Upload initiated with ID: ${operationId}`)
    } catch (error: any) {
      console.error('❌ Upload initiation error:', error)
      callback({
        code: 13,
        message: error.message || 'Failed to initiate upload',
      })
    }
  }

  // Upload chunk - client streaming (client sends chunks, server responds once)
  uploadChunk(call: ServerReadableStream<any, any>, callback: sendUnaryData<any>) {
    let uploadId: string | undefined
    let chunks: Buffer[] = []
    let totalBytes = 0
    let chunkCount = 0

    console.log('🔄 Starting chunk upload stream...')

    call.on('data', (chunk: any) => {
      if (!uploadId && chunk.upload_id) {
        uploadId = chunk.upload_id
        console.log(`📦 Upload chunk stream for ID: ${uploadId}`)
      }

      if (chunk.data && Buffer.isBuffer(chunk.data)) {
        chunks.push(chunk.data)
        totalBytes += chunk.data.length
        chunkCount++
        
        // Update progress if we have uploadId
        if (uploadId) {
          this.progressTracker.updateOperation(uploadId, totalBytes, `Received chunk ${chunkCount}`)
        }
        
        console.log(`📥 Received chunk ${chunkCount}, size: ${chunk.data.length}, total: ${totalBytes}`)
      }

      if (chunk.is_final && uploadId) {
        console.log(`✅ Final chunk received for ${uploadId}, total chunks: ${chunkCount}`)
        // Store chunks for completion
        this.uploadBuffers.set(uploadId, chunks)
        
        // Send final response via callback
        callback(null, {
          upload_id: uploadId,
          chunks_received: chunkCount,
          bytes_received: totalBytes,
          completed: true
        })
      }
    })

    call.on('end', () => {
      console.log('📤 Upload chunk stream ended')
    })

    call.on('error', (error: any) => {
      console.error('❌ Upload chunk error:', error)
      if (uploadId) {
        this.progressTracker.failOperation(uploadId, error.message)
      }
      callback({
        code: 13,
        message: error.message || 'Upload chunk failed'
      })
    })
  }

  // Complete upload - unary call
  async completeUpload(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { upload_id, final_sha256 } = call.request
      console.log(`🔄 Completing upload: ${upload_id}`)
      
      const chunks = this.uploadBuffers.get(upload_id)
      
      if (!chunks) {
        throw new Error('Upload chunks not found')
      }

      // Combine all chunks into single buffer
      const fileBuffer = Buffer.concat(chunks)
      console.log(`📦 Combined ${chunks.length} chunks into ${fileBuffer.length} bytes`)

      // Verify SHA256 if provided
      if (final_sha256) {
        const hash = createHash('sha256')
        hash.update(fileBuffer)
        const actualSha256 = hash.digest('hex')
        
        if (actualSha256 !== final_sha256) {
          throw new Error(`SHA256 mismatch. Expected: ${final_sha256}, Got: ${actualSha256}`)
        }
        console.log(`✅ SHA256 verified: ${actualSha256}`)
      }

      // Upload to GCS
      const objectKey = upload_id // Use upload_id as object key
      const uploadResult = await this.storage.uploadData(objectKey, fileBuffer, {
        contentType: 'application/octet-stream'
      })

      // Clean up
      this.uploadBuffers.delete(upload_id)
      this.progressTracker.completeOperation(upload_id, 'Upload completed successfully')

      console.log(`✅ Upload completed: ${uploadResult.location}`)

      callback(null, {
        file_id: objectKey,
        download_url: this.storage.getPublicUrl(objectKey)
      })
    } catch (error: any) {
      console.error('❌ Upload completion error:', error)
      callback({
        code: 13,
        message: error.message || 'Failed to complete upload',
      })
    }
  }

  // Initiate download - server streaming (server sends file chunks to client)
  async initiateDownload(call: ServerWritableStream<any, any>) {
    try {
      const { file_id, app_name, version, platform, start_byte, end_byte } = call.request
      const operationId = `download_${Date.now()}_${Math.random().toString(36).substring(2)}`
      
      console.log(`🔄 Starting download: ${file_id}`)

      // Get file metadata first
      const metadata = await this.storage.getFileMetadata(file_id)
      console.log(`📋 File metadata: ${metadata.name}, size: ${metadata.size}`)
      
      // Start progress tracking
      this.progressTracker.startOperation(operationId, metadata.size)

      // Create download stream from GCS
      const downloadStream = await this.storage.downloadStream(file_id)
      let bytesProcessed = 0
      let chunkNumber = 0

      downloadStream.on('data', (chunk: Buffer) => {
        bytesProcessed += chunk.length
        chunkNumber++
        
        this.progressTracker.updateOperation(operationId, bytesProcessed, `Streaming chunk ${chunkNumber}`)
        
        // Send chunk to client
        call.write({
          data: chunk,
          chunk_number: chunkNumber,
          total_size: metadata.size,
          is_final: false
        })
        
        console.log(`📤 Sent chunk ${chunkNumber}, size: ${chunk.length}, progress: ${bytesProcessed}/${metadata.size}`)
      })

      downloadStream.on('end', () => {
        // Send final marker
        call.write({
          data: Buffer.alloc(0),
          chunk_number: -1,
          total_size: metadata.size,
          is_final: true
        })
        
        call.end()
        this.progressTracker.completeOperation(operationId, 'Download completed')
        console.log(`✅ Download completed: ${file_id}`)
      })

      downloadStream.on('error', (error: any) => {
        console.error('❌ Download stream error:', error)
        this.progressTracker.failOperation(operationId, error.message)
        call.destroy(error)
      })
    } catch (error: any) {
      console.error('❌ Download initiation error:', error)
      call.destroy(error instanceof Error ? error : new Error('Download failed'))
    }
  }

  // Get download URL - unary call
  async getDownloadUrl(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { file_id, expires_in_seconds } = call.request
      
      console.log(`🔄 Generating download URL for: ${file_id}`)
      
      const downloadUrl = await this.storage.getDownloadUrl(file_id, expires_in_seconds || 3600)
      const expiresAt = new Date(Date.now() + (expires_in_seconds || 3600) * 1000).toISOString()
      
      console.log(`✅ Download URL generated, expires: ${expiresAt}`)
      
      callback(null, {
        download_url: downloadUrl,
        expires_at: expiresAt
      })
    } catch (error: any) {
      console.error('❌ Get download URL error:', error)
      callback({
        code: 13,
        message: error.message || 'Failed to generate download URL',
      })
    }
  }

  // List files - unary call
  async listFiles(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { app_name, version, platform, max_results, next_token } = call.request

      const prefix = platform ? `${app_name}/${version}/${platform}/` : `${app_name}/${version}/`
      console.log(`🔄 Listing files with prefix: ${prefix}`)
      
      const result = await this.storage.listFiles({
        prefix,
        maxResults: max_results || 100,
        pageToken: next_token
      })

      const files = result.files.map((f: any) => ({
        id: f.name,
        filename: f.name.split('/').pop() || f.name,
        app_name,
        version,
        platform,
        size: f.size,
        created_at: f.updated,
      }))

      console.log(`✅ Listed ${files.length} files`)

      callback(null, {
        files,
        next_token: result.nextPageToken || '',
        total_count: files.length
      })
    } catch (error: any) {
      console.error('❌ List files error:', error)
      callback({
        code: 13,
        message: error.message || 'Failed to list files',
      })
    }
  }

  // Delete file - unary call
  async deleteFile(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { file_id } = call.request
      
      console.log(`🔄 Deleting file: ${file_id}`)
      
      const success = await this.storage.deleteFile(file_id)
      
      console.log(`${success ? '✅' : '❌'} Delete result: ${success}`)
      
      callback(null, { success })
    } catch (error: any) {
      console.error('❌ Delete file error:', error)
      callback({
        code: 13,
        message: error.message || 'Failed to delete file',
      })
    }
  }

  // Get file metadata - unary call
  async getFileMetadata(
    call: ServerUnaryCall<any, any>,
    callback: sendUnaryData<any>
  ) {
    try {
      const { file_id } = call.request
      
      console.log(`🔄 Getting metadata for: ${file_id}`)
      
      const metadata = await this.storage.getFileMetadata(file_id)
      
      callback(null, {
        id: file_id,
        filename: metadata.name.split('/').pop() || metadata.name,
        size: metadata.size,
        content_type: metadata.contentType,
        created_at: metadata.updated
      })
      
      console.log(`✅ Retrieved metadata for: ${metadata.name}`)
    } catch (error: any) {
      console.error('❌ Get file metadata error:', error)
      callback({
        code: 13,
        message: error.message || 'Failed to get file metadata',
      })
    }
  }

  // Get upload progress - server streaming
  getUploadProgress(call: ServerWritableStream<any, any>) {
    const { operation_id } = call.request
    
    console.log(`🔄 Streaming upload progress for: ${operation_id}`)
    
    const sendProgress = () => {
      const operation = this.progressTracker.getOperation(operation_id)
      if (operation) {
        call.write({
          operation_id,
          status: operation.status,
          progress: Math.round(operation.progress),
          bytes_processed: operation.bytesProcessed,
          bytes_total: operation.bytesTotal,
          message: operation.message || '',
          error: operation.error || '',
          speed_bps: Math.round(operation.speedBps),
          eta_seconds: Math.round(operation.etaSeconds),
        })

        if (operation.status === 'completed' || operation.status === 'failed') {
          call.end()
          console.log(`✅ Progress streaming ended for: ${operation_id} (${operation.status})`)
          return
        }
      }

      // Continue streaming progress updates every 500ms
      setTimeout(sendProgress, 500)
    }

    sendProgress()
  }

  // Get download progress - server streaming
  getDownloadProgress(call: ServerWritableStream<any, any>) {
    // Reuse the same progress tracking logic as upload
    this.getUploadProgress(call)
  }
}
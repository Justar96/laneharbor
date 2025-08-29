import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { EventEmitter } from 'node:events'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load protobuf definition (shared with storage service)
const PROTO_PATH = join(__dirname, '..', '..', '..', 'storage', 'proto', 'storage.proto')

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})

const storageProto = grpc.loadPackageDefinition(packageDefinition) as any

export class StorageClient extends EventEmitter {
  private client: any
  private metadata: grpc.Metadata

  constructor(host: string = 'localhost', port: string = '50051') {
    super()
    
    // Create gRPC client
    this.client = new storageProto.storage.StorageService(
      `${host}:${port}`,
      grpc.credentials.createInsecure()
    )

    // Default metadata
    this.metadata = new grpc.Metadata()
    this.metadata.add('client', 'backend-service')
  }

  // Initiate upload
  async initiateUpload(params: {
    filename: string
    appName: string
    version: string
    platform: string
    fileSize: number
    contentType?: string
    sha256?: string
  }): Promise<{
    uploadId: string
    uploadUrl?: string
    chunkSize?: number
    totalChunks?: number
    useMultipart: boolean
  }> {
    return new Promise((resolve, reject) => {
      this.client.initiateUpload({
        filename: params.filename,
        app_name: params.appName,
        version: params.version,
        platform: params.platform,
        file_size: params.fileSize,
        content_type: params.contentType,
        sha256: params.sha256,
      }, this.metadata, (error: any, response: any) => {
        if (error) {
          reject(error)
        } else {
          resolve({
            uploadId: response.upload_id,
            uploadUrl: response.upload_url,
            chunkSize: response.chunk_size,
            totalChunks: response.total_chunks,
            useMultipart: response.use_multipart,
          })
        }
      })
    })
  }

  // Stream upload chunks
  uploadChunks(uploadId: string): {
    stream: any
    sendChunk: (data: Buffer, chunkNumber: number, isFinal?: boolean) => void
    end: () => Promise<{
      uploadId: string
      chunksReceived: number
      bytesReceived: number
      completed: boolean
    }>
  } {
    const stream = this.client.uploadChunk(this.metadata, (error: any, response: any) => {
      if (error) {
        this.emit('error', error)
      } else {
        this.emit('upload-complete', response)
      }
    })

    return {
      stream,
      sendChunk: (data: Buffer, chunkNumber: number, isFinal: boolean = false) => {
        stream.write({
          upload_id: uploadId,
          chunk_number: chunkNumber,
          data: data,
          is_final: isFinal,
        })
      },
      end: () => {
        return new Promise((resolve, reject) => {
          stream.end()
          this.once('upload-complete', resolve)
          this.once('error', reject)
        })
      }
    }
  }

  // Complete upload
  async completeUpload(params: {
    uploadId: string
    finalSha256?: string
  }): Promise<{
    fileId: string
    downloadUrl: string
  }> {
    return new Promise((resolve, reject) => {
      this.client.completeUpload({
        upload_id: params.uploadId,
        final_sha256: params.finalSha256,
      }, this.metadata, (error: any, response: any) => {
        if (error) {
          reject(error)
        } else {
          resolve({
            fileId: response.file_id,
            downloadUrl: response.download_url,
          })
        }
      })
    })
  }

  // Stream download
  downloadFile(params: {
    fileId: string
    appName: string
    version: string
    platform: string
    startByte?: number
    endByte?: number
  }): EventEmitter {
    const emitter = new EventEmitter()
    
    const stream = this.client.initiateDownload({
      file_id: params.fileId,
      app_name: params.appName,
      version: params.version,
      platform: params.platform,
      start_byte: params.startByte,
      end_byte: params.endByte,
      stream: true,
    }, this.metadata)

    stream.on('data', (chunk: any) => {
      emitter.emit('data', {
        data: chunk.data,
        chunkNumber: chunk.chunk_number,
        totalSize: chunk.total_size,
        isFinal: chunk.is_final,
      })
    })

    stream.on('end', () => {
      emitter.emit('end')
    })

    stream.on('error', (error: any) => {
      emitter.emit('error', error)
    })

    return emitter
  }

  // Get download URL
  async getDownloadUrl(params: {
    fileId: string
    appName: string
    version: string
    platform: string
    expiresIn?: number
  }): Promise<{
    downloadUrl: string
    expiresAt: string
  }> {
    return new Promise((resolve, reject) => {
      this.client.getDownloadUrl({
        file_id: params.fileId,
        app_name: params.appName,
        version: params.version,
        platform: params.platform,
        expires_in_seconds: params.expiresIn || 3600,
      }, this.metadata, (error: any, response: any) => {
        if (error) {
          reject(error)
        } else {
          resolve({
            downloadUrl: response.download_url,
            expiresAt: response.expires_at,
          })
        }
      })
    })
  }

  // List files
  async listFiles(params: {
    appName?: string
    version?: string
    platform?: string
    maxResults?: number
    nextToken?: string
  }): Promise<{
    files: Array<{
      id: string
      filename: string
      size: number
      createdAt: string
    }>
    nextToken?: string
    totalCount: number
  }> {
    return new Promise((resolve, reject) => {
      this.client.listFiles({
        app_name: params.appName,
        version: params.version,
        platform: params.platform,
        max_results: params.maxResults || 100,
        next_token: params.nextToken,
      }, this.metadata, (error: any, response: any) => {
        if (error) {
          reject(error)
        } else {
          resolve({
            files: response.files.map((f: any) => ({
              id: f.id,
              filename: f.filename,
              size: f.size,
              createdAt: f.created_at,
            })),
            nextToken: response.next_token,
            totalCount: response.total_count,
          })
        }
      })
    })
  }

  // Delete file
  async deleteFile(params: {
    fileId: string
    appName: string
    version: string
    platform: string
  }): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.client.deleteFile({
        file_id: params.fileId,
        app_name: params.appName,
        version: params.version,
        platform: params.platform,
      }, this.metadata, (error: any, response: any) => {
        if (error) {
          reject(error)
        } else {
          resolve(response.success)
        }
      })
    })
  }

  // Get file metadata
  async getFileMetadata(params: {
    fileId: string
    appName: string
    version: string
    platform: string
  }): Promise<{
    id: string
    filename: string
    size: number
    contentType: string
    createdAt: string
  }> {
    return new Promise((resolve, reject) => {
      this.client.getFileMetadata({
        file_id: params.fileId,
        app_name: params.appName,
        version: params.version,
        platform: params.platform,
      }, this.metadata, (error: any, response: any) => {
        if (error) {
          reject(error)
        } else {
          resolve({
            id: response.id,
            filename: response.filename,
            size: response.size,
            contentType: response.content_type,
            createdAt: response.created_at,
          })
        }
      })
    })
  }

  // Stream upload progress
  subscribeToUploadProgress(operationId: string): EventEmitter {
    const emitter = new EventEmitter()
    
    const stream = this.client.getUploadProgress({
      operation_id: operationId,
    }, this.metadata)

    stream.on('data', (progress: any) => {
      emitter.emit('progress', {
        operationId: progress.operation_id,
        status: progress.status,
        progress: progress.progress,
        bytesProcessed: progress.bytes_processed,
        bytesTotal: progress.bytes_total,
        message: progress.message,
        error: progress.error,
        speedBps: progress.speed_bps,
        etaSeconds: progress.eta_seconds,
      })
    })

    stream.on('end', () => {
      emitter.emit('end')
    })

    stream.on('error', (error: any) => {
      emitter.emit('error', error)
    })

    return emitter
  }

  // Stream download progress
  subscribeToDownloadProgress(operationId: string): EventEmitter {
    const emitter = new EventEmitter()
    
    const stream = this.client.getDownloadProgress({
      operation_id: operationId,
    }, this.metadata)

    stream.on('data', (progress: any) => {
      emitter.emit('progress', {
        operationId: progress.operation_id,
        status: progress.status,
        progress: progress.progress,
        bytesProcessed: progress.bytes_processed,
        bytesTotal: progress.bytes_total,
        message: progress.message,
        error: progress.error,
        speedBps: progress.speed_bps,
        etaSeconds: progress.eta_seconds,
      })
    })

    stream.on('end', () => {
      emitter.emit('end')
    })

    stream.on('error', (error: any) => {
      emitter.emit('error', error)
    })

    return emitter
  }

  // Close the client connection
  close() {
    // gRPC clients don't need explicit closing in most cases
    // But we can remove listeners
    this.removeAllListeners()
  }
}

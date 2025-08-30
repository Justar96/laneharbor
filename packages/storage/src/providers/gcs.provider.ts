import { Storage, Bucket } from '@google-cloud/storage'
import { Readable } from 'node:stream'

interface GCSConfig {
  projectId: string
  bucketName: string
  keyFilename?: string // Path to service account key file
  credentials?: object // Service account credentials object
}

export class GCSStorageProvider {
  private storage: Storage
  private bucket: Bucket
  private bucketName: string

  constructor(config: GCSConfig) {
    this.bucketName = config.bucketName

    // Initialize Google Cloud Storage client
    const storageOptions: any = {
      projectId: config.projectId,
    }

    // Use either key file path or credentials object
    if (config.keyFilename) {
      storageOptions.keyFilename = config.keyFilename
    } else if (config.credentials) {
      storageOptions.credentials = config.credentials
    }
    // If neither is provided, will use default credentials (e.g., from GOOGLE_APPLICATION_CREDENTIALS env var)

    this.storage = new Storage(storageOptions)
    this.bucket = this.storage.bucket(this.bucketName)
  }

  // Health check
  async healthCheck(): Promise<{ status: string; bucketExists: boolean }> {
    try {
      const [exists] = await this.bucket.exists()
      return {
        status: 'healthy',
        bucketExists: exists
      }
    } catch (error: any) {
      throw new Error(`GCS health check failed: ${error.message}`)
    }
  }

  // Initialize upload session
  async initiateUpload(params: {
    filename: string
    appName: string
    version: string
    platform: string
    fileSize?: number
    contentType?: string
  }): Promise<{
    uploadId: string
    uploadUrl?: string
    useMultipart: boolean
  }> {
    const objectPath = `${params.appName}/${params.version}/${params.platform}/${params.filename}`
    const uploadId = `${Date.now()}-${Math.random().toString(36).substring(2)}`
    
    return {
      uploadId,
      uploadUrl: objectPath, // We'll use this as the object key
      useMultipart: false // GCS handles this internally
    }
  }

  // Upload file data
  async uploadData(
    objectKey: string,
    data: Buffer | Readable,
    options?: {
      contentType?: string
      metadata?: Record<string, string>
    }
  ): Promise<{
    location: string
    etag?: string
  }> {
    const file = this.bucket.file(objectKey)
    
    const uploadOptions: any = {
      metadata: {
        contentType: options?.contentType || 'application/octet-stream',
        metadata: options?.metadata || {}
      },
      resumable: false // Use simple upload for smaller files
    }

    try {
      if (Buffer.isBuffer(data)) {
        await file.save(data, uploadOptions)
      } else {
        // Stream upload
        const stream = file.createWriteStream(uploadOptions)
        await new Promise((resolve, reject) => {
          data.pipe(stream)
          stream.on('error', reject)
          stream.on('finish', resolve)
        })
      }

      const [metadata] = await file.getMetadata()
      
      return {
        location: `gs://${this.bucketName}/${objectKey}`,
        etag: metadata.etag
      }
    } catch (error: any) {
      throw new Error(`Upload failed: ${error.message}`)
    }
  }

  // Get download URL
  async getDownloadUrl(
    objectKey: string,
    expiresIn: number = 3600 // 1 hour default
  ): Promise<string> {
    const file = this.bucket.file(objectKey)
    
    const options = {
      version: 'v4' as const,
      action: 'read' as const,
      expires: Date.now() + expiresIn * 1000,
    }

    try {
      const [url] = await file.getSignedUrl(options)
      return url
    } catch (error: any) {
      throw new Error(`Failed to generate download URL: ${error.message}`)
    }
  }

  // Get public URL (if bucket allows public access)
  getPublicUrl(objectKey: string): string {
    return `https://storage.googleapis.com/${this.bucketName}/${objectKey}`
  }

  // Download file as stream
  async downloadStream(objectKey: string): Promise<Readable> {
    const file = this.bucket.file(objectKey)
    return file.createReadStream()
  }

  // Download file as buffer
  async downloadBuffer(objectKey: string): Promise<Buffer> {
    const file = this.bucket.file(objectKey)
    const [data] = await file.download()
    return data
  }

  // List files
  async listFiles(options?: {
    prefix?: string
    maxResults?: number
    pageToken?: string
  }): Promise<{
    files: Array<{
      name: string
      size: number
      updated: string
      contentType: string
    }>
    nextPageToken?: string
  }> {
    const [files, , metadata] = await this.bucket.getFiles({
      prefix: options?.prefix,
      maxResults: options?.maxResults,
      pageToken: options?.pageToken,
    })

    return {
      files: files.map(file => ({
        name: file.name,
        size: parseInt(String(file.metadata.size || '0')),
        updated: file.metadata.updated || new Date().toISOString(),
        contentType: file.metadata.contentType || 'application/octet-stream'
      })),
      nextPageToken: (metadata as any)?.nextPageToken
    }
  }

  // Delete file
  async deleteFile(objectKey: string): Promise<boolean> {
    try {
      const file = this.bucket.file(objectKey)
      await file.delete()
      return true
    } catch (error: any) {
      if (error.code === 404) {
        return false // File doesn't exist
      }
      throw new Error(`Delete failed: ${error.message}`)
    }
  }

  // Get file metadata
  async getFileMetadata(objectKey: string): Promise<{
    name: string
    size: number
    contentType: string
    updated: string
    etag: string
  }> {
    const file = this.bucket.file(objectKey)
    const [metadata] = await file.getMetadata()

    return {
      name: file.name,
      size: parseInt(String(metadata.size || '0')),
      contentType: metadata.contentType || 'application/octet-stream',
      updated: metadata.updated || new Date().toISOString(),
      etag: metadata.etag || ''
    }
  }

  // Check if file exists
  async fileExists(objectKey: string): Promise<boolean> {
    const file = this.bucket.file(objectKey)
    const [exists] = await file.exists()
    return exists
  }

  // Create bucket if it doesn't exist
  async ensureBucket(): Promise<void> {
    const [exists] = await this.bucket.exists()
    if (!exists) {
      console.log(`Creating GCS bucket: ${this.bucketName}`)
      await this.bucket.create()
      console.log(`✅ GCS bucket created: ${this.bucketName}`)
    }
  }
}
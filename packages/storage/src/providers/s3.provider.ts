import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Upload } from '@aws-sdk/lib-storage'
import { Readable } from 'node:stream'
import { createHash } from 'node:crypto'

export interface S3Config {
  region: string
  bucketName: string
  accessKeyId?: string
  secretAccessKey?: string
  endpoint?: string
}

export interface UploadSession {
  uploadId: string
  key: string
  parts: Array<{ ETag: string; PartNumber: number }>
  bytesUploaded: number
  startTime: Date
}

export class S3StorageProvider {
  private client: S3Client
  private bucket: string
  private uploadSessions: Map<string, UploadSession> = new Map()

  constructor(config: S3Config) {
    this.bucket = config.bucketName
    this.client = new S3Client({
      region: config.region,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      } : undefined,
      endpoint: config.endpoint,
    })
  }

  // Generate S3 key from app metadata
  private generateKey(appName: string, version: string, platform: string, filename: string): string {
    return `apps/${appName}/${version}/${platform}/${filename}`
  }

  // Initiate multipart upload
  async initiateMultipartUpload(
    appName: string,
    version: string,
    platform: string,
    filename: string,
    contentType?: string
  ): Promise<{ uploadId: string; key: string }> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
      Metadata: {
        appName,
        version,
        platform,
        uploadTime: new Date().toISOString(),
      },
    })

    const response = await this.client.send(command)
    
    if (!response.UploadId) {
      throw new Error('Failed to initiate multipart upload')
    }

    // Store upload session
    const session: UploadSession = {
      uploadId: response.UploadId,
      key,
      parts: [],
      bytesUploaded: 0,
      startTime: new Date(),
    }
    
    this.uploadSessions.set(response.UploadId, session)
    
    return { uploadId: response.UploadId, key }
  }

  // Upload part for multipart upload
  async uploadPart(
    uploadId: string,
    partNumber: number,
    data: Buffer,
    checksum?: string
  ): Promise<{ etag: string; bytesUploaded: number }> {
    const session = this.uploadSessions.get(uploadId)
    if (!session) {
      throw new Error('Upload session not found')
    }

    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: session.key,
      UploadId: uploadId,
      PartNumber: partNumber,
      Body: data,
      ContentMD5: checksum,
    })

    const response = await this.client.send(command)
    
    if (!response.ETag) {
      throw new Error('Failed to upload part')
    }

    // Update session
    session.parts.push({ ETag: response.ETag, PartNumber: partNumber })
    session.bytesUploaded += data.length
    
    return { etag: response.ETag, bytesUploaded: session.bytesUploaded }
  }

  // Complete multipart upload
  async completeMultipartUpload(uploadId: string): Promise<{ location: string; etag: string }> {
    const session = this.uploadSessions.get(uploadId)
    if (!session) {
      throw new Error('Upload session not found')
    }

    // Sort parts by part number
    session.parts.sort((a, b) => a.PartNumber - b.PartNumber)

    const command = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: session.key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: session.parts,
      },
    })

    const response = await this.client.send(command)
    
    // Clean up session
    this.uploadSessions.delete(uploadId)
    
    return {
      location: response.Location || `s3://${this.bucket}/${session.key}`,
      etag: response.ETag || '',
    }
  }

  // Abort multipart upload
  async abortMultipartUpload(uploadId: string): Promise<void> {
    const session = this.uploadSessions.get(uploadId)
    if (!session) {
      return
    }

    const command = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: session.key,
      UploadId: uploadId,
    })

    await this.client.send(command)
    this.uploadSessions.delete(uploadId)
  }

  // Simple single-part upload for smaller files
  async uploadFile(
    appName: string,
    version: string,
    platform: string,
    filename: string,
    data: Buffer | Readable,
    contentType?: string
  ): Promise<{ key: string; etag: string }> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: data,
      ContentType: contentType || 'application/octet-stream',
      Metadata: {
        appName,
        version,
        platform,
        uploadTime: new Date().toISOString(),
      },
    })

    const response = await this.client.send(command)
    
    return {
      key,
      etag: response.ETag || '',
    }
  }

  // Stream download
  async downloadStream(
    appName: string,
    version: string,
    platform: string,
    filename: string,
    range?: { start: number; end: number }
  ): Promise<Readable> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Range: range ? `bytes=${range.start}-${range.end}` : undefined,
    })

    const response = await this.client.send(command)
    
    if (!response.Body) {
      throw new Error('File not found')
    }

    return response.Body as Readable
  }

  // Generate pre-signed download URL
  async getPresignedDownloadUrl(
    appName: string,
    version: string,
    platform: string,
    filename: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    return getSignedUrl(this.client, command, { expiresIn })
  }

  // Generate pre-signed upload URL
  async getPresignedUploadUrl(
    appName: string,
    version: string,
    platform: string,
    filename: string,
    contentType?: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType || 'application/octet-stream',
      Metadata: {
        appName,
        version,
        platform,
        uploadTime: new Date().toISOString(),
      },
    })

    return getSignedUrl(this.client, command, { expiresIn })
  }

  // List files
  async listFiles(
    appName?: string,
    version?: string,
    platform?: string,
    maxResults: number = 100,
    continuationToken?: string
  ): Promise<{
    files: Array<{
      key: string
      size: number
      lastModified: Date
      etag: string
    }>
    nextToken?: string
  }> {
    let prefix = 'apps/'
    if (appName) {
      prefix += `${appName}/`
      if (version) {
        prefix += `${version}/`
        if (platform) {
          prefix += `${platform}/`
        }
      }
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxResults,
      ContinuationToken: continuationToken,
    })

    const response = await this.client.send(command)
    
    const files = (response.Contents || []).map(obj => ({
      key: obj.Key || '',
      size: obj.Size || 0,
      lastModified: obj.LastModified || new Date(),
      etag: obj.ETag || '',
    }))

    return {
      files,
      nextToken: response.NextContinuationToken,
    }
  }

  // Delete file
  async deleteFile(
    appName: string,
    version: string,
    platform: string,
    filename: string
  ): Promise<void> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    await this.client.send(command)
  }

  // Get file metadata
  async getFileMetadata(
    appName: string,
    version: string,
    platform: string,
    filename: string
  ): Promise<{
    size: number
    contentType: string
    lastModified: Date
    etag: string
    metadata: Record<string, string>
  }> {
    const key = this.generateKey(appName, version, platform, filename)
    
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    const response = await this.client.send(command)
    
    return {
      size: response.ContentLength || 0,
      contentType: response.ContentType || 'application/octet-stream',
      lastModified: response.LastModified || new Date(),
      etag: response.ETag || '',
      metadata: response.Metadata || {},
    }
  }

  // Get upload progress
  getUploadProgress(uploadId: string): {
    bytesUploaded: number
    startTime: Date
    speed: number
  } | null {
    const session = this.uploadSessions.get(uploadId)
    if (!session) {
      return null
    }

    const elapsed = (Date.now() - session.startTime.getTime()) / 1000
    const speed = elapsed > 0 ? session.bytesUploaded / elapsed : 0

    return {
      bytesUploaded: session.bytesUploaded,
      startTime: session.startTime,
      speed,
    }
  }
}

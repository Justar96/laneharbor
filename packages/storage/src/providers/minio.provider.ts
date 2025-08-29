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
  CreateBucketCommand,
  BucketLocationConstraint,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Readable } from 'node:stream'
import { S3StorageProvider, S3Config } from './s3.provider.js'

export interface MinIOConfig {
  endpoint: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
  region?: string
  useSSL?: boolean
  publicEndpoint?: string
}

export class MinIOStorageProvider extends S3StorageProvider {
  private publicEndpoint?: string

  constructor(config: MinIOConfig) {
    // Parse endpoint URL to determine SSL and host
    const endpointUrl = new URL(config.endpoint)
    const useSSL = config.useSSL ?? endpointUrl.protocol === 'https:'
    
    // Create S3 client configured for MinIO
    const s3Config: S3Config = {
      region: config.region || 'us-east-1',
      bucketName: config.bucketName,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      endpoint: config.endpoint,
    }

    super(s3Config)
    
    this.publicEndpoint = config.publicEndpoint
    
    // Ensure bucket exists
    this.ensureBucket(config.bucketName).catch(err => {
      console.error('Failed to ensure bucket exists:', err)
    })
  }

  // Ensure bucket exists (MinIO specific)
  private async ensureBucket(bucketName: string): Promise<void> {
    try {
      const client = this.getClient()
      await client.send(new CreateBucketCommand({
        Bucket: bucketName,
      }))
      console.log(`✅ Bucket '${bucketName}' created or already exists`)
    } catch (error: any) {
      if (error.name === 'BucketAlreadyOwnedByYou' || error.name === 'BucketAlreadyExists') {
        console.log(`✅ Bucket '${bucketName}' already exists`)
      } else {
        console.error(`Failed to create bucket '${bucketName}':`, error)
        throw error
      }
    }
  }

  // Override to use public endpoint for download URLs if available
  async getPresignedDownloadUrl(
    appName: string,
    version: string,
    platform: string,
    filename: string,
    expiresIn: number = 3600
  ): Promise<string> {
    if (this.publicEndpoint) {
      // Generate public URL directly if we have a public endpoint
      const key = this.generateKey(appName, version, platform, filename)
      return `${this.publicEndpoint}/${this.getBucket()}/${key}`
    }
    
    // Otherwise use the parent implementation
    return super.getPresignedDownloadUrl(appName, version, platform, filename, expiresIn)
  }

  // Helper to get S3Client (protected in parent)
  protected getClient(): S3Client {
    // This is a workaround - in real implementation, make client protected in parent
    return (this as any).client
  }

  // Helper to get bucket name
  protected getBucket(): string {
    return (this as any).bucket
  }

  // Helper to generate key
  protected generateKey(appName: string, version: string, platform: string, filename: string): string {
    return `apps/${appName}/${version}/${platform}/${filename}`
  }
}

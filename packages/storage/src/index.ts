import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config } from 'dotenv'
import { StorageServiceImplementation } from './services/storage.service.grpc.js'
import { GCSStorageProvider } from './providers/gcs.provider.js'

// Load environment variables
config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load protobuf definition
const PROTO_PATH = join(__dirname, '..', 'proto', 'storage.proto')

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
})

const storageProto = grpc.loadPackageDefinition(packageDefinition) as any

// Initialize GCS configuration
const getGCSConfig = () => {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GCP_PROJECT_ID
  const bucketName = process.env.GCS_BUCKET_NAME || 'laneharbor'
  
  if (!projectId) {
    console.error('❌ Google Cloud Project ID not configured!')
    console.error('Please set GOOGLE_CLOUD_PROJECT_ID environment variable.')
    throw new Error('Google Cloud Project ID not configured')
  }

  const config: any = {
    projectId,
    bucketName
  }

  // Debug: List all GCS-related environment variables
  console.log('🔍 Checking environment variables:')
  console.log(`  GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS ? 'SET' : 'NOT SET'}`)
  console.log(`  GCS_SERVICE_ACCOUNT_KEY: ${process.env.GCS_SERVICE_ACCOUNT_KEY ? 'SET (length: ' + process.env.GCS_SERVICE_ACCOUNT_KEY.length + ')' : 'NOT SET'}`)
  console.log(`  GCS_SERVICE_ACCOUNT_KEY_BASE64: ${process.env.GCS_SERVICE_ACCOUNT_KEY_BASE64 ? 'SET (length: ' + process.env.GCS_SERVICE_ACCOUNT_KEY_BASE64.length + ')' : 'NOT SET'}`)

  // Check for service account credentials
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('✅ Using service account key file from GOOGLE_APPLICATION_CREDENTIALS')
    config.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS
  } else if (process.env.GCS_SERVICE_ACCOUNT_KEY) {
    console.log('✅ Using service account credentials from environment variable')
    try {
      config.credentials = JSON.parse(process.env.GCS_SERVICE_ACCOUNT_KEY)
    } catch (error) {
      console.error('❌ Failed to parse GCS_SERVICE_ACCOUNT_KEY as JSON')
      throw new Error('Invalid GCS_SERVICE_ACCOUNT_KEY format')
    }
  } else if (process.env.GCS_SERVICE_ACCOUNT_KEY_BASE64) {
    console.log('✅ Using base64-encoded service account credentials')
    console.log(`   Base64 length: ${process.env.GCS_SERVICE_ACCOUNT_KEY_BASE64.length}`)
    try {
      const decodedKey = Buffer.from(process.env.GCS_SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8')
      console.log(`   Decoded JSON length: ${decodedKey.length}`)
      config.credentials = JSON.parse(decodedKey)
      console.log(`   Parsed credentials for project: ${config.credentials.project_id}`)
    } catch (error: any) {
      console.error('❌ Failed to decode and parse GCS_SERVICE_ACCOUNT_KEY_BASE64')
      console.error(`   Error: ${error.message}`)
      throw new Error('Invalid GCS_SERVICE_ACCOUNT_KEY_BASE64 format')
    }
  } else {
    console.log('⚠️  No explicit credentials provided, using default authentication')
    console.log('   This will work if running on Google Cloud or with gcloud configured')
  }

  return config
}

let gcsConfig: any

try {
  gcsConfig = getGCSConfig()
} catch (error: any) {
  console.error('❌ Failed to initialize GCS configuration:', error.message)
  if (process.env.RAILWAY_ENVIRONMENT) {
    console.error('For Railway deployment, you need to:')
    console.error('1. Set GOOGLE_CLOUD_PROJECT_ID to your GCP project ID')
    console.error('2. Set GCS_SERVICE_ACCOUNT_KEY_BASE64 to your base64-encoded service account JSON')
    console.error('3. Set GCS_BUCKET_NAME to your bucket name (optional, defaults to "laneharbor")')
    console.error('')
    console.error('To encode your service account key:')
    console.error('cat path/to/service-account-key.json | base64 -w 0')
  }
  process.exit(1)
}

console.log('🔧 Google Cloud Storage Configuration:')
console.log(`  Project ID: ${gcsConfig.projectId}`)
console.log(`  Bucket: ${gcsConfig.bucketName}`)
console.log(`  Credentials: ${gcsConfig.keyFilename ? '✅ Key file' : gcsConfig.credentials ? '✅ Environment' : '✅ Default'}`)

const storageProvider = new GCSStorageProvider(gcsConfig)

// Create HTTP server for health checks
import { createServer } from 'node:http'

const healthServer = createServer(async (req, res) => {
  if (req.url === '/health') {
    try {
      // Test GCS connectivity
      const health = await storageProvider.healthCheck()
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        gcs: health
      }))
    } catch (error: any) {
      res.writeHead(503, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      }))
    }
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' })
    res.end('Not Found')
  }
})

// Create gRPC server
const server = new grpc.Server()

// Add storage service implementation
const storageService = new StorageServiceImplementation(storageProvider)

server.addService(storageProto.storage.StorageService.service, {
  // Upload operations
  initiateUpload: storageService.initiateUpload.bind(storageService),
  uploadChunk: storageService.uploadChunk.bind(storageService),
  completeUpload: storageService.completeUpload.bind(storageService),
  
  // Download operations
  initiateDownload: storageService.initiateDownload.bind(storageService),
  getDownloadUrl: storageService.getDownloadUrl.bind(storageService),
  
  // File management
  listFiles: storageService.listFiles.bind(storageService),
  deleteFile: storageService.deleteFile.bind(storageService),
  getFileMetadata: storageService.getFileMetadata.bind(storageService),
  
  // Progress tracking
  getUploadProgress: storageService.getUploadProgress.bind(storageService),
  getDownloadProgress: storageService.getDownloadProgress.bind(storageService),
})

// Start the gRPC server
const GRPC_PORT = parseInt(process.env.STORAGE_GRPC_PORT || '50051', 10)
const HOST = process.env.STORAGE_GRPC_HOST || '0.0.0.0'

// For Railway, use PORT for health checks, STORAGE_GRPC_PORT for gRPC
const HEALTH_PORT = parseInt(process.env.PORT || '8080', 10)

server.bindAsync(
  `${HOST}:${GRPC_PORT}`,
  grpc.ServerCredentials.createInsecure(),
  async (error, port) => {
    if (error) {
      console.error('Failed to start storage gRPC server:', error)
      process.exit(1)
    }
    
    console.log(`🚀 Storage gRPC server running on ${HOST}:${port}`)
    console.log(`📦 Using GCS bucket: ${gcsConfig.bucketName}`)
    console.log(`🔗 GCS project: ${gcsConfig.projectId}`)
    if (process.env.RAILWAY_ENVIRONMENT) {
      console.log(`🚂 Railway environment: ${process.env.RAILWAY_ENVIRONMENT}`)
    }
    
    // Ensure bucket exists
    try {
      await storageProvider.ensureBucket()
      console.log(`✅ GCS bucket ready: ${gcsConfig.bucketName}`)
    } catch (error: any) {
      console.warn(`⚠️  GCS bucket check failed: ${error.message}`)
    }
    
    // Start health check server
    healthServer.listen(HEALTH_PORT, HOST, () => {
      console.log(`🌡️ Health check server running on ${HOST}:${HEALTH_PORT}/health`)
    })
  }
)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down storage gRPC server...')
  server.tryShutdown(() => {
    console.log('Storage gRPC server shut down successfully')
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\nShutting down storage gRPC server...')
  server.tryShutdown(() => {
    console.log('Storage gRPC server shut down successfully')
    process.exit(0)
  })
})

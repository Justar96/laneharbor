import * as grpc from '@grpc/grpc-js'
import * as protoLoader from '@grpc/proto-loader'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config } from 'dotenv'
import { StorageServiceImplementation } from './services/storage.service.js'
import { MinIOStorageProvider } from './providers/minio.provider.js'

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

// Initialize MinIO storage provider
const storageProvider = new MinIOStorageProvider({
  endpoint: process.env.MINIO_ENDPOINT || process.env.MINIO_PRIVATE_ENDPOINT || 'http://localhost:9000',
  publicEndpoint: process.env.MINIO_PUBLIC_ENDPOINT,
  bucketName: process.env.MINIO_BUCKET_NAME || 'laneharbor',
  accessKeyId: process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY,
  secretAccessKey: process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY,
  region: process.env.MINIO_REGION || 'us-east-1',
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
const PORT = process.env.STORAGE_GRPC_PORT || '50051'
const HOST = process.env.STORAGE_GRPC_HOST || '0.0.0.0'

server.bindAsync(
  `${HOST}:${PORT}`,
  grpc.ServerCredentials.createInsecure(),
  (error, port) => {
    if (error) {
      console.error('Failed to start storage gRPC server:', error)
      process.exit(1)
    }
    
    console.log(`🚀 Storage gRPC server running on ${HOST}:${port}`)
    console.log(`📦 Using MinIO bucket: ${process.env.MINIO_BUCKET_NAME || 'laneharbor'}`)
    console.log(`🔗 MinIO endpoint: ${process.env.MINIO_ENDPOINT || process.env.MINIO_PRIVATE_ENDPOINT || 'http://localhost:9000'}`)
    if (process.env.MINIO_PUBLIC_ENDPOINT) {
      console.log(`🌐 Public endpoint: ${process.env.MINIO_PUBLIC_ENDPOINT}`)
    }
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

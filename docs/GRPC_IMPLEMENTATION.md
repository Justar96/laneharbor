# gRPC Implementation with Google Cloud Storage

## Overview

The LaneHarbor storage service implements a full gRPC server with streaming support, backed by Google Cloud Storage. This provides high-performance file operations with real-time progress tracking.

## gRPC Service Methods

### Unary Calls (Request-Response)

1. **`initiateUpload`** - Start an upload session
2. **`completeUpload`** - Finalize an upload with all chunks
3. **`getDownloadUrl`** - Generate signed download URLs
4. **`listFiles`** - List files with pagination
5. **`deleteFile`** - Remove files from storage
6. **`getFileMetadata`** - Get file information

### Streaming Calls

1. **`uploadChunk`** - Client streaming: Client sends file chunks, server responds once
2. **`initiateDownload`** - Server streaming: Server streams file data to client
3. **`getUploadProgress`** - Server streaming: Real-time upload progress
4. **`getDownloadProgress`** - Server streaming: Real-time download progress

## Key Features

### ✅ Streaming File Uploads
- **Client-side streaming**: Upload large files in chunks
- **Progress tracking**: Real-time upload progress with ETA
- **Integrity verification**: SHA256 hash validation
- **Efficient memory usage**: Chunked processing

```typescript
// Example upload flow:
// 1. Call initiateUpload() -> get upload_id
// 2. Stream chunks via uploadChunk()
// 3. Call completeUpload() -> file stored in GCS
```

### ✅ Streaming File Downloads
- **Server-side streaming**: Download large files efficiently
- **Range support**: Partial file downloads
- **Progress tracking**: Real-time download progress
- **Memory efficient**: Streaming directly from GCS

### ✅ Real-time Progress
- **Live updates**: Progress streams every 500ms
- **Detailed metrics**: Bytes processed, speed, ETA
- **Status tracking**: in_progress, completed, failed
- **Operation correlation**: Track multiple concurrent operations

### ✅ GCS Integration
- **Native GCS support**: Uses Google Cloud Storage SDK
- **Bucket auto-creation**: Creates bucket if doesn't exist
- **Signed URLs**: Secure temporary download links
- **Metadata preservation**: Content-Type, file size, timestamps

## Architecture

```
┌─────────────┐    gRPC        ┌─────────────────┐    GCS SDK    ┌─────────────┐
│   Backend   │ ◄────────────► │ Storage Service │ ◄───────────► │     GCS     │
│ (gRPC Client)│                │  (gRPC Server)  │               │   Bucket    │
└─────────────┘                └─────────────────┘               └─────────────┘
                                        │
                                        ▼
                               ┌─────────────────┐
                               │ Progress Tracker│
                               │ (EventEmitter)  │
                               └─────────────────┘
```

## Benefits of This Architecture

### 🚀 **Performance**
- **Streaming**: No memory buffering of entire files
- **Concurrent operations**: Multiple uploads/downloads simultaneously
- **Efficient networking**: gRPC binary protocol
- **Chunked processing**: Handles large files without memory issues

### 📊 **Observability**
- **Real-time progress**: Live updates during operations
- **Detailed logging**: Every operation logged with context
- **Error tracking**: Comprehensive error handling and reporting
- **Metrics**: Speed, ETA, success rates

### 🔄 **Scalability**
- **Stateless service**: No persistent connections required
- **Horizontal scaling**: Multiple service instances
- **Auto-scaling GCS**: Google handles storage scaling
- **Connection pooling**: Efficient gRPC connection reuse

### 🛡️ **Reliability**
- **Automatic retries**: gRPC built-in retry mechanisms
- **Error recovery**: Graceful handling of network issues
- **Data integrity**: SHA256 verification
- **Transaction safety**: Upload/download operations are atomic

## Production Considerations

### Authentication
- Uses GCS service account for authentication
- Credentials passed via environment variables
- No user credentials stored in service

### Security
- All gRPC communications are internal (Railway private network)
- Signed URLs for temporary external access
- No public file access unless explicitly signed

### Monitoring
- Comprehensive logging for all operations
- Progress tracking with detailed metrics
- Error reporting with stack traces
- Performance metrics (speed, duration)

### Deployment
- **Railway**: Internal gRPC service on port 50051
- **Health checks**: HTTP endpoint on port 8080
- **Auto-scaling**: Railway handles container scaling
- **Zero downtime**: Rolling deployments supported

## Example Usage

### Upload Flow
```
1. Backend → initiateUpload(filename, size) → Storage
2. Backend → uploadChunk(chunks...) → Storage  
3. Backend → completeUpload(upload_id) → Storage
4. Storage → uploads to GCS → Success
```

### Download Flow
```
1. Backend → initiateDownload(file_id) → Storage
2. Storage → streams from GCS → Backend
3. Backend → forwards to Frontend via WebSocket
```

### Progress Tracking
```
1. Backend → getUploadProgress(operation_id) → Storage
2. Storage → streams progress updates → Backend
3. Backend → forwards via WebSocket → Frontend
```

This implementation provides a robust, scalable file storage solution with the performance benefits of gRPC streaming and the reliability of Google Cloud Storage.
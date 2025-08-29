# Railway Microservices Deployment Guide

## Architecture Overview

Your LaneHarbor application now consists of 4 interconnected services on Railway:

1. **MinIO Bucket Service** (Already deployed)
   - Storage backend for files
   - Private URL: `bucket.railway.internal`
   - Public URL: `bucket-production-ef5c.up.railway.app`

2. **Storage Service** (New - gRPC)
   - Handles file operations via gRPC
   - Connects to MinIO for storage
   - Private communication with Backend

3. **Backend Service** (REST + WebSocket)
   - Main API server
   - WebSocket for real-time updates
   - Connects to Storage Service via gRPC
   - Public URL: `api.justarr.com`

4. **Frontend Service** (Remix)
   - Web application
   - Connects to Backend via REST/WebSocket
   - Public URL: `laneharbor.justarr.com`

## Service Communication Flow

```
[Browser] 
    ↓ (REST/WebSocket)
[Frontend Service]
    ↓ (REST/WebSocket)
[Backend Service]
    ↓ (gRPC)
[Storage Service]
    ↓ (S3 API)
[MinIO Bucket]
```

## Deployment Steps

### 1. Deploy Storage Service

#### Create New Service in Railway
1. In your Railway project, click "New Service"
2. Select "GitHub Repo" and choose your repository
3. Name it "Storage"
4. Set the root directory to `/packages/storage`

#### Configure Storage Service
Add these environment variables:

```env
# Auto-configured by Railway
PORT=50051

# Reference MinIO credentials (from Bucket service)
MINIO_ENDPOINT=${{Bucket.MINIO_PRIVATE_ENDPOINT}}
MINIO_PUBLIC_ENDPOINT=${{Bucket.MINIO_PUBLIC_ENDPOINT}}
MINIO_ROOT_USER=${{Bucket.MINIO_ROOT_USER}}
MINIO_ROOT_PASSWORD=${{Bucket.MINIO_ROOT_PASSWORD}}
MINIO_BUCKET_NAME=laneharbor

# gRPC Settings
STORAGE_GRPC_HOST=0.0.0.0
STORAGE_GRPC_PORT=${{PORT}}
```

#### Deploy Storage Service
1. Railway will automatically build and deploy
2. Note the private domain (e.g., `storage.railway.internal`)

### 2. Update Backend Service

#### Add Storage Service Connection
Add these environment variables to your existing Backend service:

```env
# Storage Service Connection
STORAGE_SERVICE_HOST=${{Storage.RAILWAY_PRIVATE_DOMAIN}}
STORAGE_SERVICE_PORT=${{Storage.PORT}}
```

#### Redeploy Backend
The backend will automatically redeploy with the new configuration.

### 3. Verify Frontend Service

Ensure your Frontend service has:

```env
API_BASE_URL=https://api.justarr.com
WS_URL=wss://api.justarr.com/ws
```

## Service Dependencies

Railway will handle the service dependencies automatically:

- **Storage** depends on → **Bucket** (MinIO)
- **Backend** depends on → **Storage**
- **Frontend** depends on → **Backend**

## Testing the Deployment

### 1. Test Storage Service Health
The Storage service exposes a gRPC endpoint. You can verify it's running by checking Railway logs.

### 2. Test Backend Connection
```bash
curl https://api.justarr.com/healthz
```

### 3. Test WebSocket Connection
```javascript
// In browser console
const ws = new WebSocket('wss://api.justarr.com/ws');
ws.onmessage = (event) => console.log('Message:', event.data);
ws.onopen = () => console.log('Connected!');
```

### 4. Test File Upload Flow
1. Visit your frontend at `https://laneharbor.justarr.com`
2. Try uploading a file
3. Monitor real-time progress via WebSocket

## Environment Variables Summary

### Storage Service
```env
PORT=50051
STORAGE_GRPC_HOST=0.0.0.0
STORAGE_GRPC_PORT=${{PORT}}
MINIO_ENDPOINT=${{Bucket.MINIO_PRIVATE_ENDPOINT}}
MINIO_PUBLIC_ENDPOINT=${{Bucket.MINIO_PUBLIC_ENDPOINT}}
MINIO_ROOT_USER=${{Bucket.MINIO_ROOT_USER}}
MINIO_ROOT_PASSWORD=${{Bucket.MINIO_ROOT_PASSWORD}}
MINIO_BUCKET_NAME=laneharbor
```

### Backend Service (Additional)
```env
STORAGE_SERVICE_HOST=${{Storage.RAILWAY_PRIVATE_DOMAIN}}
STORAGE_SERVICE_PORT=${{Storage.PORT}}
```

### Frontend Service
```env
API_BASE_URL=https://api.justarr.com
WS_URL=wss://api.justarr.com/ws
```

## MinIO Bucket Configuration

Your MinIO is already configured with:
- Root User: `w4tj0GHCO5gE8Fys0L23mFLyxxggYMhh`
- Console URL: `https://console-production-77f2.up.railway.app`

### Create Bucket via MinIO Console
1. Access MinIO console at the URL above
2. Login with the root credentials
3. Create a bucket named `laneharbor`
4. Set bucket policy to allow public read for downloads (optional)

## Monitoring & Debugging

### View Service Logs
In Railway dashboard, click on each service to view real-time logs.

### Common Issues & Solutions

#### Storage Service Can't Connect to MinIO
- Verify MinIO service is running
- Check that environment variables are correctly referenced
- Ensure private networking is enabled

#### Backend Can't Connect to Storage Service
- Verify Storage service is running
- Check gRPC port configuration
- Ensure `STORAGE_SERVICE_HOST` uses private domain

#### WebSocket Connection Fails
- Ensure backend is running with WebSocket support
- Check CORS configuration allows your frontend domain
- Verify WSS protocol is used in production

## Performance Optimization

### MinIO Settings
- Enable caching for frequently accessed files
- Configure lifecycle policies for old files
- Use multipart upload for large files (>5MB)

### gRPC Tuning
- Adjust chunk size for optimal transfer
- Enable compression for gRPC calls
- Use streaming for large file transfers

### WebSocket Configuration
- Implement heartbeat/ping-pong
- Set appropriate timeout values
- Use binary frames for file data

## Security Considerations

1. **Private Networking**: All inter-service communication uses Railway's private network
2. **gRPC Security**: Currently using insecure connections internally (secure via private network)
3. **MinIO Access**: Root credentials are only accessible to Storage service
4. **WebSocket**: Implement authentication tokens for WebSocket connections
5. **CORS**: Backend configured to only accept requests from your frontend domain

## Next Steps

1. **Add Authentication**: Implement JWT or session-based auth
2. **Add Rate Limiting**: Protect against abuse
3. **Setup Monitoring**: Add application metrics and alerts
4. **Backup Strategy**: Configure MinIO backup policies
5. **CDN Integration**: Add CDN for static file delivery

## Rollback Strategy

If issues occur:
1. Railway maintains deployment history
2. Click "Rollback" on any service to previous version
3. Services are independent - roll back only affected service

## Support

- Railway Documentation: https://docs.railway.app
- MinIO Documentation: https://min.io/docs/
- gRPC Documentation: https://grpc.io/docs/

Your microservices architecture is now ready for production deployment on Railway! 🚀

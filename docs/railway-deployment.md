# Railway Deployment Guide

This guide covers how to deploy LaneHarbor services to Railway with proper MinIO configuration and private networking.

## Prerequisites

1. **Railway Account**: Sign up at [railway.app](https://railway.app)
2. **Railway CLI**: Install via `npm install -g @railway/cli` or `brew install railway`
3. **Private Networking**: Enabled in your Railway project settings (required for internal service communication)

## Project Structure on Railway

Your Railway project should contain the following services:

- **minio**: MinIO S3-compatible storage service
- **storage**: gRPC storage service (connects to MinIO)
- **backend**: REST API service (connects to storage via gRPC)
- **frontend**: Remix frontend application (connects to backend)

## Service Configuration

### 1. MinIO Service

Create the MinIO service first as it's a dependency for the storage service.

**File**: `railway-minio.json` (at project root)
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "name": "minio",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile.minio"
  },
  "deploy": {
    "startCommand": "minio server /data --console-address \":9001\"",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/minio/health/ready",
    "healthcheckTimeout": 300
  },
  "envVars": {
    "MINIO_ROOT_USER": "laneharbor-storage",
    "MINIO_ROOT_PASSWORD": {
      "generate": true
    },
    "MINIO_BROWSER_REDIRECT_URL": "https://minio-console.railway.internal",
    "MINIO_SERVER_URL": "https://minio.railway.internal"
  },
  "ports": [
    {
      "port": 9000,
      "public": false,
      "protocol": "http"
    },
    {
      "port": 9001,
      "public": false,
      "protocol": "http"
    }
  ]
}
```

**Key Points**:
- Port 9000: MinIO API (kept private for internal service access)
- Port 9001: MinIO console (kept private; expose publicly only if needed)
- Health check on `/minio/health/ready` ensures Railway waits for readiness
- Credentials are automatically generated and shared with storage service

### 2. Storage Service

**File**: `packages/storage/railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10,
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  },
  "envVars": {
    "NODE_ENV": "production",
    "STORAGE_GRPC_HOST": "0.0.0.0",
    "STORAGE_GRPC_PORT": {
      "$env": "PORT"
    },
    "MINIO_ENDPOINT": {
      "portRef": {
        "service": "minio",
        "port": 9000,
        "protocol": "http"
      }
    },
    "MINIO_ACCESS_KEY": "laneharbor-storage",
    "MINIO_SECRET_KEY": {
      "generate": true
    },
    "MINIO_BUCKET": "laneharbor",
    "MINIO_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "$MINIO_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY": "$MINIO_SECRET_KEY",
    "AWS_REGION": "$MINIO_REGION",
    "AWS_S3_FORCE_PATH_STYLE": "true"
  }
}
```

**Key Points**:
- `MINIO_ENDPOINT` uses `portRef` to reference the MinIO service's port 9000
- Credentials must match between MinIO and storage services
- AWS SDK environment variables are mapped for compatibility
- Path-style addressing is enforced for MinIO compatibility

### 3. Backend Service

**File**: `packages/backend/railway.json`
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "name": "laneharbor-backend",
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "startCommand": "npm start",
    "port": 8787,
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 300,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  },
  "env": {
    "NODE_ENV": "production",
    "PORT": "8787",
    "LH_ENABLE_API": "true",
    "LH_ENABLE_FRONTEND_SSR": "false",
    "LH_DATA_DIR": "./storage",
    "LH_DEFAULT_CHANNEL": "stable",
    "LH_FRONTEND_ORIGIN": "https://your-frontend-domain.railway.app",
    "API_BASE_URL": "https://your-backend-domain.railway.app",
    "STORAGE_SERVICE_HOST": {
      "$ref": "Storage.RAILWAY_PRIVATE_DOMAIN"
    },
    "STORAGE_SERVICE_PORT": {
      "$ref": "Storage.PORT"
    }
  }
}
```

## Deployment Steps

### 1. Initial Setup

1. **Create Railway Project**:
   ```bash
   railway login
   railway new laneharbor
   cd laneharbor
   ```

2. **Enable Private Networking**:
   - Go to your Railway project dashboard
   - Navigate to Settings → Networking
   - Enable "Private Networking"

### 2. Deploy Services in Order

**Deploy MinIO first** (other services depend on it):

```bash
# Deploy MinIO service
railway service create --name minio
railway up --service minio --config railway-minio.json

# Wait for MinIO to be ready
railway logs --service minio --follow
```

**Deploy Storage service** (depends on MinIO):

```bash
cd packages/storage
railway service create --name storage
railway up --service storage

# Check health
railway logs --service storage --follow
```

**Deploy Backend service** (depends on Storage):

```bash
cd packages/backend
railway service create --name backend
railway up --service backend

# Check health
railway logs --service backend --follow
```

**Deploy Frontend service**:

```bash
cd packages/frontend
railway service create --name frontend
railway up --service frontend
```

### 3. Environment Variables

After deployment, verify that environment variables are correctly resolved:

```bash
# Check storage service environment
railway shell --service storage
env | grep MINIO
# Should show resolved MINIO_ENDPOINT (e.g., http://minio.railway.internal:9000)

# Test MinIO connectivity
curl $MINIO_ENDPOINT/minio/health/ready
# Should return HTTP 200
```

### 4. Verification

1. **Check Service Health**:
   ```bash
   # Storage service health
   curl https://your-storage-service.railway.app/health
   
   # Backend service health  
   curl https://your-backend-service.railway.app/healthz
   ```

2. **Test File Operations**:
   ```bash
   # Test file upload via backend API
   curl -X POST https://your-backend-service.railway.app/v1/upload \
     -F "file=@test.txt" \
     -H "Content-Type: multipart/form-data"
   ```

## Environment Variables Reference

### Storage Service Variables

| Variable | Description | Source |
|----------|-------------|---------|
| `MINIO_ENDPOINT` | Internal MinIO API URL | Railway portRef to minio:9000 |
| `MINIO_ACCESS_KEY` | MinIO access credentials | Match MinIO service `MINIO_ROOT_USER` |
| `MINIO_SECRET_KEY` | MinIO secret credentials | Match MinIO service `MINIO_ROOT_PASSWORD` |
| `MINIO_BUCKET` | Target bucket name | Static value (e.g., "laneharbor") |
| `MINIO_REGION` | AWS region for S3 SDK | Static value (e.g., "us-east-1") |
| `AWS_ACCESS_KEY_ID` | AWS SDK access key | Maps to `MINIO_ACCESS_KEY` |
| `AWS_SECRET_ACCESS_KEY` | AWS SDK secret key | Maps to `MINIO_SECRET_KEY` |
| `AWS_S3_FORCE_PATH_STYLE` | Force path-style URLs | Always "true" for MinIO |

### MinIO Service Variables

| Variable | Description | Value |
|----------|-------------|-------|
| `MINIO_ROOT_USER` | MinIO admin username | "laneharbor-storage" |
| `MINIO_ROOT_PASSWORD` | MinIO admin password | Railway-generated |
| `MINIO_BUCKET` | Default bucket to create | "laneharbor" |

## Troubleshooting

### Common Issues

1. **"MINIO_ENDPOINT is required" Error**:
   - Ensure MinIO service is deployed and running
   - Verify both services are in the same Railway environment
   - Check that Private Networking is enabled
   - Confirm `portRef` configuration is correct in `railway.json`

2. **Connection Refused Errors**:
   - Check MinIO service logs: `railway logs --service minio`
   - Verify MinIO health check: `curl $MINIO_ENDPOINT/minio/health/ready`
   - Ensure ports 9000/9001 are properly configured

3. **Bucket Not Found Errors**:
   - Check MinIO initialization logs
   - Verify bucket creation in MinIO console (if accessible)
   - Ensure `MINIO_BUCKET` variable matches expected bucket name

4. **Authentication Errors**:
   - Verify `MINIO_ACCESS_KEY` and `MINIO_SECRET_KEY` match between services
   - Check that credentials are properly generated and shared
   - Review Railway environment variable resolution

### Debug Commands

```bash
# Check service environment variables
railway shell --service storage --command "env | grep MINIO"

# Test MinIO connectivity from storage service
railway shell --service storage --command "curl -v \$MINIO_ENDPOINT/minio/health/ready"

# Check storage service health
railway shell --service storage --command "curl -v localhost:\$PORT/health"

# View service logs
railway logs --service minio --tail 100
railway logs --service storage --tail 100
```

### Health Check Endpoints

| Service | Endpoint | Purpose |
|---------|----------|---------|
| MinIO | `/minio/health/ready` | MinIO server readiness |
| Storage | `/health` | Storage service + MinIO connectivity |
| Backend | `/healthz` | Backend service health |
| Frontend | `/` | Frontend application |

## Security Considerations

1. **Private Networking**: Keep MinIO ports (9000/9001) private unless console access is needed
2. **Credentials**: Use Railway's secure environment variable generation for passwords
3. **Bucket Policies**: Configure appropriate bucket policies for your security requirements
4. **HTTPS**: Use HTTPS endpoints for all public-facing services

## Performance Optimization

1. **Resource Allocation**: Allocate sufficient resources for MinIO service based on storage needs
2. **Persistent Storage**: Configure Railway persistent storage for MinIO data directory
3. **CDN**: Consider using Railway's CDN features for file downloads
4. **Monitoring**: Set up Railway's monitoring and alerting for service health

## Next Steps

After successful deployment:

1. Configure your domain names in Railway
2. Set up SSL certificates
3. Configure monitoring and alerting
4. Set up backup strategies for MinIO data
5. Review and optimize resource allocations

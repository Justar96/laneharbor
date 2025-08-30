# Railway Deployment Guide for LaneHarbor

## Quick Fix for Current Issue

**You need to manually add these environment variables in Railway's dashboard for the Storage Service:**

### Critical Variables to Add in Railway Dashboard NOW:

For **Storage Service** (`laneharbor-storage`), go to Variables tab and add:

```
MINIO_ENDPOINT=http://bucket.railway.internal:9000
```

Replace with one of these if bucket.railway.internal doesn't work:
- `http://minio.railway.internal:9000`
- `http://[your-minio-service-name].railway.internal:9000`

And add these MinIO credentials (get from your MinIO service variables):
```
MINIO_ROOT_USER=[copy from MinIO service]
MINIO_ROOT_PASSWORD=[copy from MinIO service]
```

**After adding these, redeploy the storage service.**

---

## Complete Setup Guide

### Step 1: Get MinIO Service Information

1. Go to your MinIO service in Railway
2. Click on "Variables" tab
3. Copy the values for:
   - `MINIO_ROOT_USER` 
   - `MINIO_ROOT_PASSWORD`

### Step 2: Configure Storage Service

Add these environment variables to your **Storage Service**:

```bash
# MinIO Connection (CRITICAL - must be exact URL)
MINIO_ENDPOINT=http://bucket.railway.internal:9000

# MinIO Credentials (copy from MinIO service)
MINIO_ROOT_USER=[paste MinIO service MINIO_ROOT_USER value]
MINIO_ROOT_PASSWORD=[paste MinIO service MINIO_ROOT_PASSWORD value]

# These should already be set from railway.json:
NODE_ENV=production
STORAGE_GRPC_HOST=0.0.0.0
STORAGE_GRPC_PORT=50051
MINIO_BUCKET=laneharbor
MINIO_REGION=us-east-1
AWS_S3_FORCE_PATH_STYLE=true
```

### Step 3: Configure Backend Service

Add these environment variables to your **Backend Service**:

```bash
# Storage Service Connection
STORAGE_SERVICE_HOST=laneharbor-storage.railway.internal
STORAGE_SERVICE_PORT=50051

# These should already be set from railway.json:
NODE_ENV=production
PORT=8787
LH_ENABLE_API=true
LH_DATA_DIR=/app/storage
LH_DEFAULT_CHANNEL=stable
LH_FRONTEND_ORIGIN=https://laneharbor.justarr.com
LH_BASE_URL=https://api.justarr.com
```

### Step 4: Configure Frontend Service

```bash
NODE_ENV=production
LH_BACKEND_URL=http://laneharbor-api.railway.internal:8787
LH_BACKEND_PORT=8787
```

## Deployment Order

Deploy services in this order to ensure dependencies are available:

1. **MinIO** - Deploy first and wait for it to be healthy
2. **Storage Service** - Deploy second, it depends on MinIO
3. **Backend Service** - Deploy third, it depends on Storage Service
4. **Frontend Service** - Deploy last, it depends on Backend

## Troubleshooting

### Storage Service Can't Connect to MinIO

1. Check that MinIO service is running and healthy
2. Verify the MinIO service name matches the reference in MINIO_ENDPOINT
3. Check Railway logs for the actual RAILWAY_PRIVATE_DOMAIN value
4. Ensure both services are in the same Railway environment

### Backend Can't Connect to Storage Service

1. Check that Storage Service is running and healthy
2. Verify the storage service name matches the reference in STORAGE_SERVICE_HOST
3. Check that port 50051 is correct for gRPC
4. Ensure both services are in the same Railway environment

### Health Check Failures

- **Storage Service**: Health check is on `/health` on the PORT environment variable (default 8080)
- **Backend Service**: Health check is on `/healthz` on port 8787
- **MinIO**: Health check is on `/minio/health/ready` on port 9000

### Alternative: Direct Internal URLs

If Railway references don't work, you can use direct internal URLs:

```bash
# For Storage Service
MINIO_ENDPOINT=http://minio.railway.internal:9000

# For Backend Service  
STORAGE_SERVICE_HOST=laneharbor-storage.railway.internal
```

## Checking Service Connectivity

You can check if services can reach each other by looking at the logs:

1. **Storage Service** should show:
   - "✅ Using configured MinIO endpoint: http://..."
   - "🚀 Storage gRPC server running on 0.0.0.0:50051"
   - "🌡️ Health check server running on 0.0.0.0:8080/health"

2. **Backend Service** should show:
   - "📦 Connected to Storage Service at ..."
   - "🚀 LaneHarbor Backend API listening on http://0.0.0.0:8787"

## Creating MinIO Bucket

The storage service expects a bucket named `laneharbor`. You can create it:

1. Access MinIO console through Railway's provided URL
2. Login with the generated credentials
3. Create a bucket named `laneharbor`
4. Set the bucket policy to public if you need external access

Or the service will try to create it automatically on first run.
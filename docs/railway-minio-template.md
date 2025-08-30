# Railway Deployment with MinIO Template

This guide shows how to deploy LaneHarbor services to Railway using the official MinIO template.

## Step 1: Deploy MinIO Template

1. **Deploy MinIO using Railway Template**:
   - Go to [Railway MinIO Template](https://railway.com/deploy/SMKOEA)
   - Click "Deploy Now"
   - This will create a MinIO service in your Railway project

2. **Note the MinIO service name**:
   - After deployment, check your Railway dashboard
   - The service might be named "bucket", "minio", or similar
   - Note this exact name for later configuration

## Step 2: Configure Storage Service

The storage service has been updated to automatically discover MinIO services in Railway. It will try these approaches:

### Environment Variables to Set

In your Railway storage service, set these environment variables:

**Required:**
- `MINIO_BUCKET`: `laneharbor` (or your preferred bucket name)
- `MINIO_REGION`: `us-east-1`
- `AWS_S3_FORCE_PATH_STYLE`: `true`

**Optional (for manual override):**
- `MINIO_ENDPOINT`: Only set this if auto-discovery fails
- `MINIO_ACCESS_KEY`: Override default credentials
- `MINIO_SECRET_KEY`: Override default credentials

### Auto-Discovery Process

The storage service will automatically try to find MinIO using:

1. **Environment variables** (if set manually):
   - `MINIO_ENDPOINT`
   - `BUCKET_URL`
   - `MINIO_URL`

2. **Railway service references**:
   - `BUCKET_PRIVATE_URL`
   - `MINIO_PRIVATE_URL`

3. **Railway internal networking**:
   - `http://bucket.railway.internal:9000`
   - `http://minio.railway.internal:9000`

4. **Default Railway MinIO credentials**:
   - Access Key: `minioadmin`
   - Secret Key: `minioadmin`

## Step 3: Deploy Storage Service

Deploy your storage service after MinIO is running:

```bash
cd packages/storage
railway up
```

The service will now:
- Automatically discover the MinIO endpoint
- Use appropriate credentials
- Create the bucket if it doesn't exist
- Provide detailed logging about what it found

## Step 4: Connect Storage to Backend

Update your backend service to reference the storage service:

```json
{
  "envVars": {
    "STORAGE_SERVICE_HOST": {
      "$ref": "storage.RAILWAY_PRIVATE_DOMAIN"
    },
    "STORAGE_SERVICE_PORT": {
      "$ref": "storage.PORT"
    }
  }
}
```

## Troubleshooting

### Check Storage Service Logs

```bash
railway logs --service storage
```

Look for these log messages:
- `🔍 Found potential MinIO endpoints: ...`
- `⚠️  No MinIO endpoint found. Available environment variables:`
- `🚀 Storage gRPC server running on...`

### Debug Environment Variables

The storage service will log all MinIO/bucket-related environment variables when it can't find an endpoint. Check the logs to see what Railway provides.

### Manual Override

If auto-discovery fails, manually set the MinIO endpoint:

1. Find your MinIO service's internal URL in Railway dashboard
2. Set `MINIO_ENDPOINT` environment variable in storage service
3. Example: `http://bucket.railway.internal:9000`

### Test Connectivity

Use the storage service health check:

```bash
curl https://your-storage-service.railway.app/health
```

This will test MinIO connectivity and show detailed error information.

## Expected Railway Service Names

The Railway MinIO template typically creates services named:
- `bucket` (most common)
- `minio`
- `minio-bucket`

The storage service tries all common patterns automatically.

## Environment Variables Reference

| Variable | Purpose | Auto-detected | Manual Override |
|----------|---------|---------------|-----------------|
| `MINIO_ENDPOINT` | MinIO API URL | ✅ | ✅ |
| `MINIO_ACCESS_KEY` | Access credentials | ✅ (defaults) | ✅ |
| `MINIO_SECRET_KEY` | Secret credentials | ✅ (defaults) | ✅ |
| `MINIO_BUCKET` | Bucket name | ❌ | ✅ Required |
| `MINIO_REGION` | AWS region | ❌ | ✅ Required |

## Next Steps

1. Deploy MinIO template first
2. Deploy storage service (it will auto-configure)
3. Deploy backend service with storage references
4. Deploy frontend service
5. Test end-to-end functionality

The storage service is now much more flexible and should work with Railway's MinIO template out of the box.

# Google Cloud Storage Deployment Guide for LaneHarbor

## Benefits of Using GCS Instead of MinIO

✅ **No additional service to manage** - eliminates MinIO complexity  
✅ **Better Railway compatibility** - no service interconnection issues  
✅ **Automatic scaling** - Google handles all infrastructure  
✅ **Built-in CDN** - global edge caching included  
✅ **Cost-effective** - pay only for what you use  
✅ **Enterprise reliability** - Google's SLA and uptime guarantees  

## Prerequisites

### 1. Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Note your **Project ID** (you'll need this for Railway)

### 2. Create Service Account

1. In Google Cloud Console, go to **IAM & Admin > Service Accounts**
2. Click **Create Service Account**
3. Name it: `laneharbor-storage`
4. Description: `Service account for LaneHarbor storage operations`
5. Click **Create and Continue**

### 3. Grant Permissions

Add these roles to your service account:
- **Storage Admin** (recommended) or
- **Storage Object Admin** (minimum required)

### 4. Generate Service Account Key

1. Click on your created service account
2. Go to **Keys** tab
3. Click **Add Key > Create new key**
4. Choose **JSON** format
5. Download the JSON file
6. **Keep this file secure** - it contains sensitive credentials

## Railway Configuration

### Step 1: Configure Storage Service

In Railway, go to your **Storage Service** and add these environment variables:

```bash
# Required: Your GCP Project ID
GOOGLE_CLOUD_PROJECT_ID=your-actual-project-id

# Required: Bucket name (will be created automatically if doesn't exist)  
GCS_BUCKET_NAME=laneharbor

# Required: Service Account Credentials (paste entire JSON content)
GCS_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"your-project","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"laneharbor-storage@your-project.iam.gserviceaccount.com","client_id":"...","auth_uri":"https://accounts.google.com/o/oauth2/auth","token_uri":"https://oauth2.googleapis.com/token","auth_provider_x509_cert_url":"https://www.googleapis.com/oauth2/v1/certs","client_x509_cert_url":"..."}

# These are already set in railway.json:
NODE_ENV=production
STORAGE_GRPC_HOST=0.0.0.0
STORAGE_GRPC_PORT=50051
```

### Step 2: Configure Backend Service

Your backend service configuration remains the same:

```bash
# Storage Service Connection
STORAGE_SERVICE_HOST=laneharbor-storage.railway.internal
STORAGE_SERVICE_PORT=50051

# These are already set in railway.json:
NODE_ENV=production
PORT=8787
LH_ENABLE_API=true
LH_DATA_DIR=/app/storage
LH_DEFAULT_CHANNEL=stable
LH_FRONTEND_ORIGIN=https://laneharbor.justarr.com
LH_BASE_URL=https://api.justarr.com
```

## Quick Setup Instructions

### For Railway (Immediate Fix):

1. **Remove MinIO Service** from Railway (you don't need it anymore)
2. **Add GCS variables** to Storage Service:
   - `GOOGLE_CLOUD_PROJECT_ID` = your GCP project ID
   - `GCS_BUCKET_NAME` = laneharbor
   - `GCS_SERVICE_ACCOUNT_KEY` = entire JSON content from downloaded file
3. **Redeploy Storage Service**
4. **Redeploy Backend Service**

### Expected Success Logs

After configuration, your storage service should show:
```
🔧 Google Cloud Storage Configuration:
  Project ID: your-project-id
  Bucket: laneharbor
  Credentials: ✅ Environment
🚀 Storage gRPC server running on 0.0.0.0:50051
✅ GCS bucket ready: laneharbor
🌡️ Health check server running on 0.0.0.0:8080/health
```

## Local Development

For local development, you have two options:

### Option 1: Service Account Key File
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"
export GCS_BUCKET_NAME="laneharbor-dev"
```

### Option 2: Environment Variable
```bash
export GOOGLE_CLOUD_PROJECT_ID="your-project-id"
export GCS_BUCKET_NAME="laneharbor-dev"
export GCS_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```

## Security Best Practices

1. **Use separate buckets** for different environments (dev, staging, prod)
2. **Rotate service account keys** regularly
3. **Use least privilege** - only grant necessary permissions
4. **Enable bucket versioning** for data protection
5. **Set up lifecycle policies** to manage costs

## Cost Optimization

1. **Use Standard storage class** for frequently accessed files
2. **Enable lifecycle rules** to move old files to cheaper storage
3. **Set up monitoring** to track usage and costs
4. **Use CDN** for global distribution (Cloud CDN or Cloud Storage's built-in CDN)

## Troubleshooting

### "Project ID not configured"
- Ensure `GOOGLE_CLOUD_PROJECT_ID` is set correctly
- Check the project ID matches your GCP project exactly

### "Invalid GCS_SERVICE_ACCOUNT_KEY format"
- Ensure the JSON is properly formatted
- Check for any missing quotes or brackets
- Make sure the entire JSON is on one line for Railway

### "Permission denied" errors
- Verify service account has Storage Admin or Storage Object Admin role
- Check that the service account key is valid and not expired

### "Bucket not found" errors
- The service will automatically create the bucket if it doesn't exist
- Ensure your service account has bucket creation permissions

## Migration from MinIO

Your data in MinIO can be migrated to GCS using:

1. **Google Cloud Transfer Service** (recommended)
2. **gsutil rsync** command
3. **Custom migration script** using both storage APIs

The storage service API remains the same, so your frontend/backend code doesn't need changes.

## Additional Features

GCS provides additional features you can leverage:
- **Signed URLs** for temporary access
- **Object versioning** for data protection  
- **Lifecycle management** for cost optimization
- **Event notifications** for real-time processing
- **Global CDN** for fast content delivery
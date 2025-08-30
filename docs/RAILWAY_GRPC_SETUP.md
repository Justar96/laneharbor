# Railway gRPC Setup Guide

## The Issue

Your backend service is trying to connect to the storage service via gRPC, but it's using `localhost` which doesn't work in Railway's containerized environment.

## Quick Fix

### Step 1: Check Your Service Names in Railway

1. Go to your Railway project dashboard
2. Note the exact names of your services:
   - Backend service (probably `laneharbor-api` or `laneharbor-backend`)
   - Storage service (probably `laneharbor-storage`)

### Step 2: Add Environment Variables to Backend Service

In Railway, go to your **Backend Service** → **Variables** tab and add:

```bash
STORAGE_SERVICE_HOST=laneharbor-storage.railway.internal
STORAGE_SERVICE_PORT=50051
```

**Important:** Replace `laneharbor-storage` with your actual storage service name if it's different.

### Step 3: Alternative Service Names to Try

If `laneharbor-storage.railway.internal` doesn't work, try these:

1. **Match exact service name**: `[your-storage-service-name].railway.internal`
2. **Short name**: `laneharbor-storage`  
3. **With Railway suffix**: `laneharbor-storage.railway.internal`

## How to Find Your Exact Service Name

### Method 1: Railway Dashboard
- The service name is shown in the service card title
- Use exactly what's shown (case-sensitive)

### Method 2: Railway CLI
```bash
railway status
```

### Method 3: Check Logs
Deploy with different names and check which one works in the logs.

## Expected Success Logs

After fixing, your **backend service** should show:
```
🔧 Storage Service Configuration:
  Host: laneharbor-storage.railway.internal
  Port: 50051
🚂 Railway environment detected: production
📦 Storage client initialized for laneharbor-storage.railway.internal:50051
   (Connection will be established on first use)
🚀 LaneHarbor Backend API listening on http://0.0.0.0:8787
```

## Debugging Connection Issues

### Check Backend Logs
Look for:
- ✅ `Storage client initialized` - good
- ❌ `Failed to initialize storage client` - bad
- ⚠️  `WARNING: Using localhost` - needs fixing

### Check Storage Service Logs  
Should show:
```
🚀 Storage gRPC server running on 0.0.0.0:50051
🌡️ Health check server running on 0.0.0.0:8080/health
```

### Test gRPC Connection
The backend will test the connection when you make API calls that need storage.

## Common Railway Networking Patterns

Railway internal networking follows these patterns:

1. **Standard**: `service-name.railway.internal`
2. **Port**: Always use the internal port (50051 for gRPC)
3. **Protocol**: Use HTTP/gRPC directly (no HTTPS for internal)

## If Still Not Working

### Option 1: Manual Variable Override
In Railway, you can manually override the environment variables:
- Go to Backend Service → Variables
- Add `STORAGE_SERVICE_HOST` with the correct internal hostname

### Option 2: Service References (Advanced)
Railway supports service references in railway.json:
```json
{
  "variables": {
    "STORAGE_SERVICE_HOST": {
      "serviceRef": {
        "serviceName": "laneharbor-storage",
        "property": "RAILWAY_PRIVATE_DOMAIN"
      }
    }
  }
}
```

But the manual approach is simpler and more reliable.

## Deployment Order

Deploy in this order:
1. **Storage Service** (with GCS configured)  
2. **Backend Service** (with storage host configured)
3. **Frontend Service**

The backend needs the storage service to be running before it can connect to it.
# Railway GCS Setup Guide

## Problem
Railway doesn't support setting JSON directly in environment variables, which is required for Google Cloud Service Account credentials.

## Solution
Use base64-encoded credentials instead of raw JSON.

## Setup Steps

### 1. Encode Your Service Account Key

```bash
# Convert your service account JSON to base64
cat path/to/your-service-account-key.json | base64 -w 0
```

This will output a long base64 string (no line breaks).

### 2. Railway Environment Variables

Set these variables in your Railway project:

**Required:**
- `GOOGLE_CLOUD_PROJECT_ID` - Your Google Cloud Project ID
- `GCS_SERVICE_ACCOUNT_KEY_BASE64` - The base64 string from step 1

**Optional:**
- `GCS_BUCKET_NAME` - Bucket name (defaults to "laneharbor")

### 3. Example Railway Variables

```
GOOGLE_CLOUD_PROJECT_ID=your-project-id-here
GCS_SERVICE_ACCOUNT_KEY_BASE64=eyJ0eXBlIjoic2VydmljZV9hY2NvdW50IiwicHJvamVjdF9pZCI6InlvdXItcHJvamVjdC1pZCIsInByaXZhdGVfa2V5X2lkIjoiYWJjMTIzLi4uIiwicHJpdmF0ZV9rZXkiOi0tLS0tQkVHSU4gUFJJVkFURSBLRVktLS0tLQ==
GCS_BUCKET_NAME=laneharbor
```

### 4. Verification

The storage service will log which authentication method it's using:

```
✅ Using base64-encoded service account credentials
🔧 Google Cloud Storage Configuration:
  Project ID: your-project-id
  Bucket: laneharbor
  Credentials: ✅ Environment
```

## Alternative Methods

The storage service supports multiple authentication methods in this order:

1. **File Path**: `GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json`
2. **Raw JSON**: `GCS_SERVICE_ACCOUNT_KEY={"type":"service_account",...}` (not supported in Railway)
3. **Base64 JSON**: `GCS_SERVICE_ACCOUNT_KEY_BASE64=eyJ0eXBlIjoi...` (Railway compatible)
4. **Default**: Uses default Google Cloud authentication (works on GCP instances)

## Troubleshooting

### Invalid Base64 Format
```
❌ Failed to decode and parse GCS_SERVICE_ACCOUNT_KEY_BASE64
```
- Ensure the base64 string has no line breaks
- Verify the original JSON is valid
- Use `base64 -w 0` to avoid line wrapping

### Missing Project ID
```
❌ Google Cloud Project ID not configured!
```
- Set `GOOGLE_CLOUD_PROJECT_ID` environment variable
- Find your project ID in Google Cloud Console

### Bucket Access Issues
```
⚠️  GCS bucket check failed: Access denied
```
- Verify service account has Storage Admin role
- Check bucket name is correct
- Ensure billing is enabled on GCP project
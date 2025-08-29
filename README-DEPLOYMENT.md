# LaneHarbor Railway Deployment Guide

This guide covers deploying LaneHarbor as separate backend and frontend services on Railway.

## Architecture

LaneHarbor can run as:
1. **Single Service** (default) - Combined API + Frontend
2. **Split Services** - Separate API and Frontend services

## Split Service Deployment

### 1. Backend Service (API + WebSocket)

**Service Name:** `laneharbor-api`

**Environment Variables:**
```
LH_ENABLE_API=true
LH_ENABLE_FRONTEND_SSR=false
LH_FRONTEND_ORIGIN=https://your-frontend-domain.railway.app
LH_DATA_DIR=./storage
LH_DEFAULT_CHANNEL=stable
PORT=3000
NODE_ENV=production
```

**Railway Configuration:**
- Use `railway-api.json` as deployment config
- Build: `bun install && bun run build`
- Start: `bun run start`
- Health: `/healthz`

**Endpoints:**
- `/v1/apps` - List applications
- `/v1/apps/:app/releases` - Get app releases
- `/v1/apps/:app/releases/:version/download` - Download files
- `/healthz` - Health check
- `/ws` - WebSocket for real-time updates

### 2. Frontend Service (Remix SSR)

**Service Name:** `laneharbor-frontend`

**Environment Variables:**
```
LH_ENABLE_API=false
LH_ENABLE_FRONTEND_SSR=true
LH_BASE_URL=https://your-api-domain.railway.app
PORT=3000
NODE_ENV=production
```

**Railway Configuration:**
- Use `railway-frontend.json` as deployment config
- Build: `bun install && bun run build`
- Start: `bun run start`
- Health: `/healthz`

**Endpoints:**
- `/` - Main application UI
- `/assets/*` - Client-side assets
- `/ui` - Legacy UI
- `/healthz` - Health check

## Deployment Steps

### Option 1: Railway CLI

1. **Deploy API Service:**
```bash
# Clone repo and navigate to project
git clone <your-repo>
cd laneharbor

# Deploy API service
railway login
railway project create laneharbor-api
railway service create api
railway up --service api

# Set environment variables
railway variables set LH_ENABLE_API=true --service api
railway variables set LH_ENABLE_FRONTEND_SSR=false --service api
railway variables set LH_FRONTEND_ORIGIN=https://your-frontend.railway.app --service api
```

2. **Deploy Frontend Service:**
```bash
# Deploy frontend service
railway service create frontend
railway up --service frontend

# Set environment variables
railway variables set LH_ENABLE_API=false --service frontend
railway variables set LH_ENABLE_FRONTEND_SSR=true --service frontend
railway variables set LH_BASE_URL=https://your-api.railway.app --service frontend
```

### Option 2: Railway Dashboard

1. **Create API Service:**
   - Create new project: `laneharbor-api`
   - Connect GitHub repo
   - Set environment variables as listed above
   - Deploy

2. **Create Frontend Service:**
   - Create new project: `laneharbor-frontend`
   - Connect same GitHub repo
   - Set environment variables as listed above
   - Deploy

## Single Service Deployment (Default)

For simpler deployment, use the existing `railway.json`:

**Environment Variables:**
```
LH_ENABLE_API=true
LH_ENABLE_FRONTEND_SSR=true
LH_DATA_DIR=./storage
LH_DEFAULT_CHANNEL=stable
PORT=3000
NODE_ENV=production
```

This runs both API and frontend in one service.

## Environment Variable Reference

| Variable | Description | API Service | Frontend Service |
|----------|-------------|-------------|------------------|
| `LH_ENABLE_API` | Enable API routes | `true` | `false` |
| `LH_ENABLE_FRONTEND_SSR` | Enable Remix SSR | `false` | `true` |
| `LH_BASE_URL` | API service URL | - | `https://api.railway.app` |
| `LH_FRONTEND_ORIGIN` | Frontend CORS origin | `https://frontend.railway.app` | - |
| `LH_DATA_DIR` | Storage directory | `./storage` | - |
| `LH_DEFAULT_CHANNEL` | Default release channel | `stable` | - |
| `PORT` | Server port | `3000` | `3000` |
| `NODE_ENV` | Environment | `production` | `production` |

## Troubleshooting

### CORS Issues
- Ensure `LH_FRONTEND_ORIGIN` is set correctly on API service
- Check that frontend calls the correct `LH_BASE_URL`

### Health Check Failures
- Both services respond to `/healthz`
- API service shows storage status
- Frontend service shows build status

### Build Issues
- Ensure `bun run build` completes successfully
- Check that `build/` directory contains client and server assets

### WebSocket Connection Issues
- WebSocket endpoint is `/ws` on API service
- Frontend converts HTTP URL to WebSocket URL automatically

## Monitoring

- API service logs show "API routes enabled"
- Frontend service logs show "Frontend SSR enabled"
- Health endpoints provide service status
- Check Railway logs for startup messages

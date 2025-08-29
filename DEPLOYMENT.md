# LaneHarbor Deployment Guide

This guide covers deploying the LaneHarbor monorepo with separate backend and frontend services.

## Service URLs

- **Backend API**: `https://api.justarr.com`
- **Frontend Web**: `https://laneharbor.justarr.com`

## Local Development

### Environment Setup
Both services have their own environment files:

**Backend** (`packages/backend/.env.development`):
```
NODE_ENV=development
PORT=8787
LH_ENABLE_API=true
LH_ENABLE_FRONTEND_SSR=false
LH_DATA_DIR=./storage
LH_DEFAULT_CHANNEL=stable
LH_FRONTEND_ORIGIN=http://localhost:3000
LH_BASE_URL=http://localhost:8787
```

**Frontend** (`packages/frontend/.env.development`):
```
NODE_ENV=development
PORT=3000
API_BASE_URL=http://localhost:8787
```

### Running Locally
```bash
# Install dependencies
npm install

# Start both services
npm run dev

# Or start individually:
cd packages/backend && npm run dev
cd packages/frontend && npm run dev
```

## Production Deployment on Railway

### Prerequisites
1. Install Railway CLI: `npm install -g @railway/cli`
2. Login: `railway login`

### Backend Service (api.justarr.com)
```bash
cd packages/backend
railway link  # Select or create the backend service
```

Set environment variables:
```bash
railway variables set NODE_ENV=production
railway variables set PORT=8787
railway variables set LH_ENABLE_API=true
railway variables set LH_ENABLE_FRONTEND_SSR=false
railway variables set LH_DATA_DIR=./storage
railway variables set LH_DEFAULT_CHANNEL=stable
railway variables set LH_FRONTEND_ORIGIN=https://laneharbor.justarr.com
railway variables set LH_BASE_URL=https://api.justarr.com
```

Deploy:
```bash
railway up
```

### Frontend Service (laneharbor.justarr.com)
```bash
cd packages/frontend
railway link  # Select or create the frontend service
```

Set environment variables:
```bash
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set API_BASE_URL=https://api.justarr.com
```

Deploy:
```bash
railway up
```

### Custom Domain Setup
In Railway dashboard:
1. **Backend service**: Add custom domain `api.justarr.com`
2. **Frontend service**: Add custom domain `laneharbor.justarr.com`

## Environment Variables Reference

### Backend Variables
| Variable | Development | Production |
|----------|-------------|------------|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `8787` | `8787` |
| `LH_ENABLE_API` | `true` | `true` |
| `LH_ENABLE_FRONTEND_SSR` | `false` | `false` |
| `LH_DATA_DIR` | `./storage` | `./storage` |
| `LH_DEFAULT_CHANNEL` | `stable` | `stable` |
| `LH_FRONTEND_ORIGIN` | `http://localhost:3000` | `https://laneharbor.justarr.com` |
| `LH_BASE_URL` | `http://localhost:8787` | `https://api.justarr.com` |

### Frontend Variables
| Variable | Development | Production |
|----------|-------------|------------|
| `NODE_ENV` | `development` | `production` |
| `PORT` | `3000` | `3000` |
| `API_BASE_URL` | `http://localhost:8787` | `https://api.justarr.com` |

## Health Checks
- **Backend**: `https://api.justarr.com/healthz`
- **Frontend**: `https://laneharbor.justarr.com/` (React app loads)

## Deployment Process
1. Both services are built from the monorepo root
2. Railway runs the workspace-specific build commands
3. Each service starts independently with its own environment
4. Services communicate via the configured URLs

## Troubleshooting

### CORS Issues
Ensure `LH_FRONTEND_ORIGIN` is correctly set in the backend to allow frontend requests.

### Environment Variable Issues
Check Railway dashboard for proper environment variable configuration.

### Build Issues
Ensure all dependencies are correctly specified in each service's `package.json`.

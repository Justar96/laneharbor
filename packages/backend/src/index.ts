import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { timeout } from 'hono/timeout'
import type { Context } from 'hono'
import { env } from './config.js'
import { registerRoutes } from './routes.js'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createServer } from 'node:http'
import { WebSocketService } from './services/websocket.service.js'
import { StorageClient } from './clients/storage.client.js'

const app = new Hono()

// Request timeout middleware (30 seconds)
app.use('*', timeout(30000))

// CORS middleware with secure defaults
app.use('*', cors({
  origin: env.LH_FRONTEND_ORIGIN || '*', // Restrict to frontend origin in production
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'Range', 'If-None-Match', 'If-Modified-Since'],
  exposeHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'X-File-SHA256'],
  credentials: false
}))

// Request logging with enhanced format
app.use('*', logger((message, ...rest) => {
  console.log(`[${new Date().toISOString()}] ${message}`, ...rest)
}))

// Request validation middleware
app.use('*', async (c, next) => {
  // Basic security headers (Railway-compatible)
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Handle Railway's proxy headers
  const forwardedProto = c.req.header('x-forwarded-proto')
  const forwardedHost = c.req.header('x-forwarded-host')
  
  // Prevent redirect loops on Railway
  if (forwardedProto === 'https' && forwardedHost) {
    c.header('X-Forwarded-Proto', 'https')
    c.header('X-Forwarded-Host', forwardedHost)
  }
  
  // Rate limiting (basic implementation)
  const ip = c.req.header('x-forwarded-for') || 
            c.req.header('x-real-ip') || 
            'unknown'
  
  c.header('X-Rate-Limit-IP', ip)
  
  await next()
})

// Enhanced health check with system status
app.get('/healthz', async (c: Context) => {
  try {
    // Check storage directory accessibility
    const { getDataDir, getAppsList } = await import('./storage.js')
    const dataDir = getDataDir()
    
    // Verify storage is accessible
    let storageStatus = 'ok'
    let appsCount = 0
    
    try {
      const apps = await getAppsList()
      appsCount = apps.length
    } catch (storageError) {
      console.error('Storage health check failed:', storageError)
      storageStatus = 'error'
    }
    
    const health = {
      status: storageStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      version: '1.0.0', // You might want to read this from package.json
      storage: {
        status: storageStatus,
        dataDir: dataDir,
        appsCount: appsCount
      },
      system: {
        uptime: process.uptime(),
        memory: {
          used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
        },
        platform: process.platform,
        nodeVersion: process.version
      }
    }
    
    const statusCode = health.status === 'ok' ? 200 : 503
    return c.json(health, statusCode)
    
  } catch (error) {
    console.error('Health check error:', error)
    return c.json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    }, 503)
  }
})

// Support HEAD health checks (some platforms use HEAD)
app.on('HEAD', '/healthz', (c: Context) => {
  return c.text('', 200)
})

// Register API routes (conditionally enabled)
if (env.LH_ENABLE_API) {
  registerRoutes(app)
  console.log('API routes enabled')
} else {
  console.log('API routes disabled')
}

// API service root endpoint
app.get('/', (c: Context) => {
  return c.json({
    service: 'LaneHarbor Backend API',
    version: '1.0.0',
    endpoints: {
      apps: '/v1/apps',
      health: '/healthz',
      websocket: '/ws'
    }
  });
});

// 404 handler
app.get('*', (c: Context) => {
  return c.json({ error: 'Not Found' }, 404);
});

const port = Number(process.env.PORT || env.PORT || 8787)

// Initialize storage client (connects to storage service via gRPC)
const storageHost = process.env.STORAGE_SERVICE_HOST || 'localhost'
const storagePort = process.env.STORAGE_SERVICE_PORT || '50051'
const storageClient = new StorageClient(storageHost, storagePort)

// Create HTTP server for both Hono and WebSocket
const server = serve({
  fetch: app.fetch,
  port,
  hostname: '0.0.0.0',
  createServer
})

// Initialize WebSocket service
const wsService = new WebSocketService(server, storageClient)

// Make services available globally in app context
app.use('*', async (c, next) => {
  c.set('storageClient', storageClient)
  c.set('wsService', wsService)
  await next()
})

console.log(`🚀 LaneHarbor Backend API listening on http://0.0.0.0:${port}`)
console.log(`🔌 WebSocket service available at ws://0.0.0.0:${port}/ws`)
console.log(`📦 Connected to Storage Service at ${storageHost}:${storagePort}`)

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down services...')
  wsService.shutdown()
  storageClient.close()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\nShutting down services...')
  wsService.shutdown()
  storageClient.close()
  process.exit(0)
})

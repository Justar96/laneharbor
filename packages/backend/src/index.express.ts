import express from 'express'
import cors from 'cors'
import { createServer } from 'node:http'
import { WebSocketService } from './websocket.js'
import { StorageClient } from './clients/storage.client.js'
import { registerExpressRoutes } from './routes.express.js'
import { env } from './config.js'

const app = express()

// ===============================================
// HEALTH CHECKS FIRST - NO MIDDLEWARE BEFORE THIS
// ===============================================

// Railway Health Check - Absolute priority, no middleware
app.get('/health', (req, res) => {
  const host = req.get('host') || 'no-host'
  console.log(`[HEALTH] Request from: ${host}`)
  res.status(200).send('OK')
})

// Frontend compatibility health check
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'healthy', service: 'LaneHarbor Backend' })
})

// Debug health check with detailed info
app.get('/debug/health', (req, res) => {
  const debugInfo = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    headers: {
      host: req.get('host') || 'no-host',
      origin: req.get('origin') || 'no-origin',
      'x-forwarded-host': req.get('x-forwarded-host') || 'no-x-forwarded-host',
      'x-forwarded-for': req.get('x-forwarded-for') || 'no-x-forwarded-for',
      'x-forwarded-proto': req.get('x-forwarded-proto') || 'no-x-forwarded-proto',
      'user-agent': req.get('user-agent') || 'no-user-agent'
    },
    environment: {
      railway_environment: process.env.RAILWAY_ENVIRONMENT || 'not-set',
      node_env: process.env.NODE_ENV || 'not-set',
      port: process.env.PORT || 'not-set',
      service_name: 'laneharbor-backend'
    },
    uptime: process.uptime(),
    memory: process.memoryUsage()
  }
  
  console.log('[DEBUG HEALTH CHECK]', JSON.stringify(debugInfo, null, 2))
  res.json(debugInfo)
})

// ===============================================
// MIDDLEWARE - APPLIED AFTER HEALTH CHECKS
// ===============================================

// Request timeout middleware - only for API routes
const timeoutMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const path = req.path
  
  // Skip timeout for health checks (already handled above)
  if (path === '/health' || path === '/healthz' || path === '/debug/health') {
    return next()
  }
  
  // Set 30 second timeout for API routes
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({
        error: 'request_timeout',
        message: 'Request timed out after 30 seconds',
        path: req.path,
        timestamp: new Date().toISOString()
      })
    }
  }, 30000)
  
  // Clear timeout when response is sent
  const originalSend = res.send
  res.send = function(data) {
    clearTimeout(timeout)
    return originalSend.call(this, data)
  }
  
  const originalJson = res.json
  res.json = function(obj) {
    clearTimeout(timeout)
    return originalJson.call(this, obj)
  }
  
  next()
}

app.use(timeoutMiddleware)

// CORS middleware with secure defaults
app.use(cors({
  origin: process.env.LH_FRONTEND_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'If-None-Match', 'If-Modified-Since'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length', 'X-File-SHA256'],
  credentials: false
}))

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString()
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.get('user-agent')}`)
  next()
})

// JSON body parsing for POST requests
app.use(express.json({ limit: '10mb' }))

// Form data parsing
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Request validation middleware for API routes
app.use('/v1', (req, res, next) => {
  // Log API requests with enhanced details
  const clientInfo = {
    ip: req.get('x-forwarded-for') || req.get('x-real-ip') || req.ip || 'unknown',
    userAgent: req.get('user-agent') || 'unknown',
    origin: req.get('origin') || 'none',
    method: req.method,
    path: req.path,
    query: req.query
  }
  
  console.log(`[API] ${req.method} ${req.path}`, clientInfo)
  next()
})

// ===============================================
// STATUS ENDPOINT WITH DETAILED INFO
// ===============================================

app.get('/status', (req, res) => {
  const status = {
    service: 'LaneHarbor Backend API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    environment: {
      node_env: process.env.NODE_ENV || 'development',
      railway_env: process.env.RAILWAY_ENVIRONMENT || 'local',
      port: process.env.PORT || '8787'
    },
    features: {
      api_enabled: env.LH_ENABLE_API,
      frontend_origin: env.LH_FRONTEND_ORIGIN,
      storage_service: {
        host: process.env.STORAGE_SERVICE_HOST || 'localhost',
        port: process.env.STORAGE_SERVICE_PORT || '50051'
      }
    }
  }
  
  res.json(status)
})

// ===============================================
// MAIN SERVER SETUP
// ===============================================

async function startServer() {
  const port = parseInt(process.env.PORT || '8787', 10)
  const host = '0.0.0.0'
  
  console.log('🔧 Railway Environment Configuration:')
  console.log(`  PORT: ${port} (Railway required)`)
  console.log(`  RAILWAY_ENVIRONMENT: ${process.env.RAILWAY_ENVIRONMENT || 'not set'}`)
  console.log(`  NODE_ENV: ${process.env.NODE_ENV || 'not set'}`)

  // Initialize storage client
  let storageClient: StorageClient | null = null
  
  try {
    const storageHost = process.env.STORAGE_SERVICE_HOST || 'localhost'
    const storagePort = process.env.STORAGE_SERVICE_PORT || '50051'
    
    console.log('🔧 Storage Service Configuration:')
    console.log(`  Host: ${storageHost}`)
    console.log(`  Port: ${storagePort}`)
    
    if (process.env.RAILWAY_ENVIRONMENT && storageHost === 'localhost') {
      console.warn('⚠️  Warning: Using localhost for storage service in Railway environment')
      console.warn('   Consider using: laneharbor-storage.railway.internal')
    }
    
    storageClient = new StorageClient(storageHost, storagePort)
    console.log(`📦 Storage client initialized for ${storageHost}:${storagePort}`)
    console.log('   (Connection will be established on first use)')
  } catch (error) {
    console.error('❌ Storage client initialization failed:', error)
    console.error('   API will continue without storage functionality')
  }

  // Register API routes if enabled
  if (env.LH_ENABLE_API) {
    try {
      await registerExpressRoutes(app, storageClient)
      console.log('✅ API routes enabled')
    } catch (error) {
      console.error('❌ Failed to register API routes:', error)
      console.error('   Server will continue with health checks only')
    }
  } else {
    console.log('ℹ️  API routes disabled (LH_ENABLE_API=false)')
  }

  // Create HTTP server
  const server = createServer(app)

  // Initialize WebSocket service if storage client is available
  let wsService: WebSocketService | null = null
  
  if (storageClient) {
    try {
      wsService = new WebSocketService(server, storageClient)
      console.log('🔌 WebSocket service available at ws://0.0.0.0:${port}/ws')
    } catch (error) {
      console.error('❌ WebSocket service initialization failed:', error)
      console.error('   Server will continue without WebSocket support')
    }
  } else {
    console.log('⚠️  WebSocket service disabled (no storage client)')
  }

  // Start server
  server.listen(port, host, () => {
    console.log(`🚀 LaneHarbor Backend API listening on http://${host}:${port}`)
    console.log(`🌡️  Railway health checks: http://${host}:${port}/health`)
    console.log(`📋  Status endpoint: http://${host}:${port}/status`)
    console.log(`🔍  Debug health: http://${host}:${port}/debug/health`)
  })

  // Graceful shutdown
  const shutdown = (signal: string) => {
    console.log(`\n${signal} received. Shutting down gracefully...`)
    
    server.close(() => {
      console.log('HTTP server closed')
      
      if (wsService) {
        wsService.shutdown()
      }
      
      if (storageClient) {
        storageClient.close()
      }
      
      console.log('Shutdown complete')
      process.exit(0)
    })
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

// Start the server
startServer().catch((error) => {
  console.error('💥 Server startup failed:', error)
  process.exit(1)
})
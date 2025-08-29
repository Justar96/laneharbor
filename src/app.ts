import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import { cors } from 'hono/cors'
import { timeout } from 'hono/timeout'
import type { Context } from 'hono'
import { env } from './config'
import { registerRoutes } from './routes'
import { createRequestHandler } from '@remix-run/node'

const app = new Hono()

// Request timeout middleware (30 seconds)
app.use('*', timeout(30000))

// CORS middleware with secure defaults
app.use('*', cors({
  origin: env.LH_BASE_URL ? [env.LH_BASE_URL] : ['http://localhost:3000'],
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
  // Basic security headers
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('X-XSS-Protection', '1; mode=block')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  
  // Rate limiting (basic implementation)
  const ip = c.req.header('x-forwarded-for') || 
            c.req.header('x-real-ip') || 
            'unknown'
  
  // Simple rate limiting: 1000 requests per hour per IP
  const rateKey = `rate_${ip}_${Math.floor(Date.now() / 3600000)}`
  
  // In a production environment, you'd use Redis or similar
  // For now, we'll just set a header for monitoring
  c.header('X-Rate-Limit-IP', ip)
  
  await next()
})

// Enhanced health check with system status
app.get('/healthz', async (c: Context) => {
  try {
    // Check storage directory accessibility
    const { getDataDir, getAppsList } = await import('./storage')
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

// Register API routes first
registerRoutes(app)

// Legacy static frontend (served from ./public at /ui)
app.get('/ui', serveStatic({ path: './public/index.html' }))
app.use('/ui/assets/*', serveStatic({ root: './public' }))

// Serve Remix client assets
app.use('/assets/*', serveStatic({ root: './build/client' }))

// Mount Remix SSR middleware for all other routes
let build: any;
try {
  // In development, we'll need to handle the case where build doesn't exist yet
  build = await import('../build/server/index.js' as any).catch(() => null);
} catch {
  build = null;
}

if (build) {
  const remixHandler = createRequestHandler(build);

  app.use('*', async (c: Context) => {
    const response = await remixHandler(c.req.raw);
    return response;
  });
} else {
  // Fallback for development when Remix build doesn't exist yet
  app.get('*', (c: Context) => {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>LaneHarbor - Building...</title>
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; }
            .container { max-width: 600px; margin: 0 auto; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚢 LaneHarbor</h1>
            <p>Remix app is building... Please run <code>npm run build</code> first.</p>
            <p><a href="/ui">Use legacy UI</a> | <a href="/v1/apps">API</a></p>
          </div>
        </body>
      </html>
    `);
  });
}

const port = Number(process.env.PORT || env.PORT || 3000)

const server = Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`LaneHarbor listening on http://0.0.0.0:${server.port}`)

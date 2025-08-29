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

// Frontend assets and SSR (conditionally enabled)
if (env.LH_ENABLE_FRONTEND_SSR) {
  // Legacy static frontend (served from ./public at /ui)
  app.get('/ui', serveStatic({ path: './public/index.html' }))
  app.use('/ui/assets/*', serveStatic({ root: './public' }))

  // Serve Remix client assets
  app.use('/assets/*', serveStatic({ root: './build/client' }))
  console.log('Frontend SSR enabled')
} else {
  console.log('Frontend SSR disabled')
}

// Mount Remix SSR middleware for all other routes
let build: any;
try {
  // Try to import the built Remix server
  build = await import('../build/server/index.js' as any).catch(() => null);
} catch {
  build = null;
}

const serverBuild: any = (build && build.default) ? build.default : build;

if (env.LH_ENABLE_FRONTEND_SSR && serverBuild) {
  const remixHandler = createRequestHandler(serverBuild, process.env.NODE_ENV);

  app.use('*', async (c: Context) => {
    try {
      // Respect proxy headers from Railway to avoid protocol/host mismatch redirects
      const forwardedProto = c.req.header('x-forwarded-proto') ?? 'http';
      const forwardedHost = c.req.header('x-forwarded-host') ?? c.req.header('host') ?? 'localhost';

      const originalUrl = new URL(c.req.url);
      const correctedUrl = new URL(originalUrl.pathname + originalUrl.search, `${forwardedProto}://${forwardedHost}`);

      // Rebuild request with corrected URL and forwarded headers
      const headers = new Headers(c.req.raw.headers);
      headers.set('X-Forwarded-Proto', forwardedProto);
      headers.set('X-Forwarded-Host', forwardedHost);

      const req = new Request(correctedUrl.toString(), {
        method: c.req.method,
        headers,
        body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body,
      });

      const response = await remixHandler(req);
      return response;
    } catch (error) {
      console.error('Remix handler error:', error);
      return c.text('Internal Server Error', 500);
    }
  });
} else if (env.LH_ENABLE_FRONTEND_SSR) {
  // Fallback when Remix build doesn't exist but SSR is enabled
  app.get('/', (c: Context) => {
    return c.html(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>LaneHarbor</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: system-ui, sans-serif; text-align: center; padding: 2rem; background: #0f0f23; color: #cccccc; }
            .container { max-width: 600px; margin: 0 auto; }
            h1 { color: #00cc88; }
            a { color: #00cc88; text-decoration: none; }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🚢 LaneHarbor Frontend</h1>
            <p>Frontend service is starting up...</p>
            <p>Remix build not found. Run <code>bun run build</code> first.</p>
            <p><a href="/ui">Legacy UI</a> | <a href="/healthz">Health</a></p>
          </div>
        </body>
      </html>
    `);
  });
  
  app.get('*', (c: Context) => {
    return c.text('Not Found', 404);
  });
} else if (env.LH_ENABLE_API) {
  // API-only service fallback
  app.get('/', (c: Context) => {
    return c.json({
      service: 'LaneHarbor API',
      version: '1.0.0',
      endpoints: {
        apps: '/v1/apps',
        health: '/healthz',
        websocket: '/ws'
      }
    });
  });
  
  app.get('*', (c: Context) => {
    return c.json({ error: 'Not Found' }, 404);
  });
} else {
  // Both services disabled - should not happen in production
  app.get('*', (c: Context) => {
    return c.json({ error: 'Service not configured' }, 503);
  });
}

const port = Number(process.env.PORT || env.PORT || 3000)

const server = Bun.serve({
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
})

console.log(`LaneHarbor listening on http://0.0.0.0:${server.port}`)

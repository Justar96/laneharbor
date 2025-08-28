import { Hono } from 'hono'
import { logger } from 'hono/logger'
import { serveStatic } from 'hono/bun'
import type { Context } from 'hono'
import { env } from './config'
import { registerRoutes } from './routes'
import { createRequestHandler } from '@remix-run/node'

const app = new Hono()

// Request logging
app.use(logger())

// Health check
app.get('/healthz', (c: Context) => c.json({ status: 'ok' }))

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
  build = await import('../build/server/index.js').catch(() => null);
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

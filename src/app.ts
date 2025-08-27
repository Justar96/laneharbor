import { Hono } from 'hono'
import type { Context } from 'hono'
import { env } from './config'
import { registerRoutes } from './routes'

const app = new Hono()

app.get('/healthz', (c: Context) => c.json({ status: 'ok' }))

// Register API routes
registerRoutes(app)

const port = Number(process.env.PORT || env.PORT || 3000)

const server = Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`LaneHarbor listening on http://0.0.0.0:${server.port}`)

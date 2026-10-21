import { env } from './env'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { health } from './routes/health'
import { runs } from './routes/runs'
import { demo } from './routes/demo'
import { library } from './routes/library'
import { apiGuard } from './security/guard'

const app = new Hono()
app.use('/api/*', apiGuard({ port: env.port, allowedOrigins: process.env.ALLOWED_ORIGINS }))
app.route('/api', health)
app.route('/api', runs)
app.route('/api', demo)
app.route('/api', library)

// Production: serve the built client from dist/client (Vite dev server proxies /api in development).
if (existsSync('./dist/client')) {
  app.use('/*', serveStatic({ root: './dist/client' }))
  app.get('*', serveStatic({ path: './dist/client/index.html' }))
}

// Loopback only unless HOST says otherwise (the Docker image sets HOST=0.0.0.0).
const host = process.env.HOST || '127.0.0.1'
serve({ fetch: app.fetch, port: env.port, hostname: host }, info => {
  console.log(`PaperTrail server on http://${host}:${info.port}`)
})

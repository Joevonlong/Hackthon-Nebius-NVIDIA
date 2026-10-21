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
import { getDb } from './data/db'

// Open the database and run migrations now: a refused or failed migration is a clear startup error, not a 500 on a later request.
getDb()

const app = new Hono()
app.use('/api/*', apiGuard({
  port: env.port,
  dataDir: env.dataDir,
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  devClient: import.meta.url.endsWith('.ts'), // true under tsx (pnpm dev), false in the built bundle; admits the Vite proxy origin
}))
app.route('/api', health)
app.route('/api', runs)
app.route('/api', demo)
app.route('/api', library)

// Production: serve the built client from dist/client (Vite dev server proxies /api in development).
if (existsSync('./dist/client')) {
  app.use('/*', serveStatic({ root: './dist/client' }))
  app.get('*', serveStatic({ path: './dist/client/index.html' }))
}

// Loopback only unless PAPERTRAIL_HOST says otherwise (the Docker image sets PAPERTRAIL_HOST=0.0.0.0). Not HOST: csh/tcsh export it.
const host = process.env.PAPERTRAIL_HOST || '127.0.0.1'
serve({ fetch: app.fetch, port: env.port, hostname: host }, info => {
  console.log(`PaperTrail server on http://${host}:${info.port}`)
})

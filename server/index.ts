import { env } from './env'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'node:fs'
import { health } from './routes/health'
import { runs } from './routes/runs'
import { demo } from './routes/demo'
import { library } from './routes/library'
import { accessTokenProblem } from './security/auth'
import { inlineScriptHashes } from './security/headers'
import { wireSecurity } from './security/wire'
import { getDb } from './data/db'

// Loopback only unless PAPERTRAIL_HOST says otherwise (the Docker image sets PAPERTRAIL_HOST=0.0.0.0). Not HOST: csh/tcsh export it.
// Beyond loopback an access token is required (#35): without one the server does not start.
const host = process.env.PAPERTRAIL_HOST || '127.0.0.1'
const accessToken = process.env.PAPERTRAIL_ACCESS_TOKEN || ''
const tokenProblem = accessTokenProblem(host, accessToken)
if (tokenProblem) { console.error(`PaperTrail cannot start: ${tokenProblem}`); process.exit(1) }

// Open the database and run migrations now: a refused or failed migration is a clear startup error, not a 500 on a later request.
try { getDb() } catch (e) { console.error(`PaperTrail cannot start: ${(e as Error).message}`); process.exit(1) }

const app = new Hono()
// CSP allows the one inline script of the built index.html by hash
let scriptHashes: string[] = []
try { scriptHashes = inlineScriptHashes(readFileSync('./dist/client/index.html', 'utf8')) } catch { /* no built client (dev) */ }
wireSecurity(app, {
  port: env.port,
  dataDir: env.dataDir,
  accessToken,
  allowedOrigins: process.env.ALLOWED_ORIGINS,
  devClient: import.meta.url.endsWith('.ts'), // true under tsx (pnpm dev), false in the built bundle; admits the Vite proxy origin
  scriptHashes,
})
app.route('/api', health)
app.route('/api', runs)
app.route('/api', demo)
app.route('/api', library)

// Production: serve the built client from dist/client (Vite dev server proxies /api in development).
if (existsSync('./dist/client')) {
  app.use('/*', serveStatic({ root: './dist/client' }))
  app.get('*', serveStatic({ path: './dist/client/index.html' }))
}

serve({ fetch: app.fetch, port: env.port, hostname: host }, info => {
  console.log(`PaperTrail server on http://${host}:${info.port}`)
})

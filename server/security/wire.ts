// The security middleware stack in its production order, shared by server/index.ts and the tests that exercise the real wiring.
import type { Hono } from 'hono'
import { accessAuth, tokenExchange } from './auth'
import { apiGuard } from './guard'
import { securityHeaders } from './headers'

export interface WireOptions {
  port: number
  dataDir?: string
  accessToken: string
  allowedOrigins?: string
  devClient?: boolean
  scriptHashes?: string[]
}

export function wireSecurity(app: Hono, o: WireOptions): void {
  app.use('*', securityHeaders({ scriptHashes: o.scriptHashes }))
  app.use('/api/*', accessAuth({ token: o.accessToken, port: o.port }))
  app.use('*', tokenExchange({ token: o.accessToken, port: o.port, allowedOrigins: o.allowedOrigins }))
  app.use('/api/*', apiGuard({ port: o.port, dataDir: o.dataDir, allowedOrigins: o.allowedOrigins, devClient: o.devClient, tokenMode: !!o.accessToken }))
}

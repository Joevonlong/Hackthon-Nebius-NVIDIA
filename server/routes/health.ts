import { Hono } from 'hono'
import { env } from '../env'

export const health = new Hono()
health.get('/health', c => c.json({
  ok: true,
  version: '0.1.0',
  models: env.models,
  keys: { tokenFactory: !!env.tokenFactoryKey, tavily: !!env.tavilyKey, openalex: !!env.openalexKey },
}))

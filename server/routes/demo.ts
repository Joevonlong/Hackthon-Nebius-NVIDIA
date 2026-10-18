// Owner: lane D (infra). GET /api/demo and ?demo=1 replay of server/demo/recordings/*.json.
import { Hono } from 'hono'
export const demo = new Hono()

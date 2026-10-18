// Owner: lane A1 (pipeline). Implements POST /api/runs, GET /api/runs/:id/stream (SSE), GET /api/runs/:id,
// POST /api/seeds/resolve, GET /api/papers/:id — see shared/contracts.ts.
import { Hono } from 'hono'
export const runs = new Hono()

import { vi } from 'vitest'
import { hashText } from '../vault'

/** In-memory stand-in for the server's question folders (server/routes/library.ts). Shared by the vault tests. */
export function fakeServer() {
  const folders = new Map<string, Map<string, { content: string; updatedAt: number }>>()
  const calls: { method: string; url: string; keepalive?: boolean }[] = []
  // online: false = network error; failPut: next N PUTs get a 500; status: every write (PUT/DELETE/PATCH) gets this status (0 = off);
  // gate: when set, the next PUT waits for it (an in-flight save)
  const state = { online: true, failPut: 0, putStatus: 0, status: 0, gate: null as Promise<void> | null, listGate: null as Promise<void> | null }
  const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status })
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); const method = init?.method ?? 'GET'
    calls.push({ method, url, keepalive: init?.keepalive })
    if (!state.online) throw new TypeError('offline')
    const hdr = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (method === 'PUT' && state.gate) { const g = state.gate; state.gate = null; await g }
    if (method !== 'GET' && state.status) return res(state.status)
    if (url === '/api/questions') {
      if (method === 'GET') return res(200, { questions: [...folders.keys()].map(id => ({ id })) })
      if (folders.has(body.id)) return res(409)
      folders.set(body.id, new Map([['Question.md', { content: body.content, updatedAt: Date.now() }]])); return res(200, { id: body.id })
    }
    const m = url.match(/^\/api\/questions\/([^/]+)(?:\/notes(?:\/(.+))?)?$/)
    if (!m) return res(404)
    const q = decodeURIComponent(m[1]); const rel = m[2] && decodeURIComponent(m[2])
    if (!rel && url.endsWith('/notes') && folders.has(q)) { const snapshot = res(200, { notes: [...folders.get(q)!].map(([path, v]) => ({ path, ...v })) }); if (state.listGate) { const g = state.listGate; state.listGate = null; await g } return snapshot }
    if (!rel && url.endsWith('/notes')) return folders.has(q) ? res(200, { notes: [...folders.get(q)!].map(([path, v]) => ({ path, ...v })) }) : res(404)
    if (!rel) {
      if (method === 'DELETE') return folders.delete(q) ? res(200) : res(404)
      if (method === 'PATCH') { const f = folders.get(q); if (!f) return res(404); if (body.name.length > 60) return res(400); if (folders.has(body.name)) return res(409); folders.delete(q); folders.set(body.name, f); return res(200) }
    }
    if (method === 'PUT') {
      if (state.putStatus) return res(state.putStatus)
      if (state.failPut > 0) { state.failPut--; return res(500) }
      const f = folders.get(q); if (!f) return res(400)
      const cur = f.get(rel!)?.content
      const match = hdr.get('if-match')?.replace(/^"|"$/g, '')
      if ((match !== undefined && (cur === undefined || hashText(cur) !== match)) || (hdr.get('if-none-match') === '*' && cur !== undefined)) return res(412, { content: cur, hash: cur === undefined ? undefined : hashText(cur) })
      f.set(rel!, { content: body.content, updatedAt: Date.now() }); return res(200)
    }
    if (method === 'DELETE') {
      const cur = folders.get(q)?.get(rel!)?.content; const match = hdr.get('if-match')?.replace(/^"|"$/g, '')
      if (cur !== undefined && match !== undefined && hashText(cur) !== match) return res(412, { content: cur })
    }
    if (method === 'DELETE') return folders.get(q)?.delete(rel!) ? res(200) : res(404)
    return res(404)
  })
  return { folders, calls, state, fetchMock, put: (q: string, rel: string, content: string) => folders.get(q)!.set(rel, { content, updatedAt: Date.now() }) }
}

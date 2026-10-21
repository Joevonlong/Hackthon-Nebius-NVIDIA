// Upstream and parser error text stays on the server (#35): clients get a generic message plus a code, the details go to the server log.
const SECRET = /((?:api[_-]?key|key|token|mailto|email)=)[^&\s"']+|(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi

/** Logs an error with its context, key-like values removed. */
export function logServerError(where: string, e: unknown): void {
  const msg = (e instanceof Error ? e.message : String(e)).replace(SECRET, (_m, a, b) => `${a ?? b}***`).slice(0, 500)
  console.error(`[${where}] ${msg}`)
}

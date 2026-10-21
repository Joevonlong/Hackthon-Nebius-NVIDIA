import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const KEY = 'sk-test-SECRET-1234567890'
const SECRET_PROMPT = 'Does AXL drive resistance in melanoma? PRIVATE-QUESTION'
const SECRET_REPLY = 'The paper reports PRIVATE-ANSWER'
let dir = ''

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pt-trace-'))
  vi.stubEnv('LOG_DIR', dir)
  vi.stubEnv('TRACE_CONSOLE', '0')
  vi.stubEnv('TOKEN_FACTORY_API_KEY', KEY)
  vi.resetModules()
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }) })

const logText = () => {
  const root = join(dir, 'server')
  return readdirSync(root).map(f => readFileSync(join(root, f), 'utf8')).join('\n')
}

async function oneChatCall() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    choices: [{ message: { content: SECRET_REPLY } }], usage: { prompt_tokens: 11, completion_tokens: 5 },
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
  const { tfFetch } = await import('./ai/http')
  await tfFetch('chat/completions', { model: 'm1', messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: SECRET_PROMPT }] }, 5000)
}

describe('LOG_PROMPTS', () => {
  it('metadata mode keeps prompt and response text out of llm.jsonl but keeps model, status, timing and usage', async () => {
    vi.stubEnv('LOG_PROMPTS', 'metadata')
    await oneChatCall()
    const text = logText()
    expect(text).not.toContain('PRIVATE-QUESTION')
    expect(text).not.toContain('PRIVATE-ANSWER')
    expect(text).not.toContain('be brief')
    const rec = JSON.parse(text.trim().split('\n')[0])
    expect(rec).toMatchObject({ endpoint: 'chat/completions', model: 'm1', status: 200, usage: { prompt_tokens: 11, completion_tokens: 5 } })
    expect(typeof rec.ms).toBe('number')
    expect(rec.prompt).toEqual({ chars: SECRET_PROMPT.length })
    expect(rec.response).toEqual({ chars: SECRET_REPLY.length })
  })

  it('default mode still logs the text (for debugging)', async () => {
    await oneChatCall()
    expect(logText()).toContain('PRIVATE-QUESTION')
  })

  it('metadata mode also strips the chat channel', async () => {
    vi.stubEnv('LOG_PROMPTS', 'metadata')
    const { trace } = await import('./trace')
    trace('chat', { type: 'turn', prompt: SECRET_PROMPT, reply: SECRET_REPLY, model: 'm1', ms: 5 }, undefined)
    const text = logText()
    expect(text).not.toContain('PRIVATE')
    expect(text).toContain('"model":"m1"')
  })

  it('never writes the API key, in either mode', async () => {
    for (const mode of ['metadata', 'full']) {
      vi.stubEnv('LOG_PROMPTS', mode)
      await oneChatCall()
    }
    expect(logText()).not.toContain(KEY)
    const { scrubUrl } = await import('./trace')
    expect(scrubUrl('https://x.org/w?api_key=' + KEY + '&q=1')).not.toContain(KEY)
  })
})

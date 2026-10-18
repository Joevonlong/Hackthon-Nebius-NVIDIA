// Smoke test for Token Factory models. Run: pnpm exec tsx scripts/smoke-models.ts
// Prints a compact table; never prints keys.
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateText, tool, isStepCount } from 'ai'
import { z } from 'zod'
import { resolveConfig } from '../shared/config'
import { env } from '../server/env'
import { embed, rerank, judge, facets, expandQueries } from '../server/ai/index'
import { baseUrl, lastError, tfFetch } from '../server/ai/http'
import { tavilySearch } from '../server/sources/tavily'

const cfg = resolveConfig('demo', env.raw)
const rows: [string, string, string, string][] = []
const row = (check: string, model: string, ok: boolean | string, detail: string) => {
  rows.push([check, model, ok === true ? 'OK' : ok === false ? 'FAIL' : ok, detail])
  console.log(`${ok === true ? 'OK  ' : ok === false ? 'FAIL' : ok.padEnd(4)} ${check.padEnd(16)} ${model.padEnd(44)} ${detail}`)
}
const t0 = () => performance.now()
const ms = (t: number) => `${Math.round(performance.now() - t)} ms`
const errStr = () => (lastError ? `${lastError.status} ${lastError.body.slice(0, 160)}` : '')

const ABSTRACT = `To explore the distinct genotypic and phenotypic states of melanoma tumors, we applied single-cell RNA sequencing (RNA-seq) to 4645 single cells isolated from 19 patients, profiling malignant, immune, stromal, and endothelial cells. Malignant cells within the same tumor displayed transcriptional heterogeneity associated with the cell cycle, spatial context, and a drug-resistance program. In particular, all tumors harbored malignant cells from two distinct transcriptional cell states, such that tumors characterized by high levels of the MITF transcription factor also contained cells with low MITF and elevated levels of the AXL kinase.`

function nearest(id: string, ids: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const a = norm(id)
  const tokens = id.toLowerCase().split(/[\/\-_.]/).filter(t => t.length > 2)
  return ids
    .map(x => ({ x, s: tokens.filter(t => x.toLowerCase().includes(t)).length + (norm(x).includes(a.slice(0, 6)) ? 1 : 0) }))
    .filter(o => o.s > 0).sort((p, q) => q.s - p.s).slice(0, 4).map(o => o.x)
}

async function main() {
  console.log(`base ${baseUrl()} · key ${env.tokenFactoryKey ? 'present' : 'MISSING'} · tavily ${env.tavilyKey ? 'present' : 'missing'} · openalex ${env.openalexKey ? 'present' : 'missing'}\n`)
  if (!env.tokenFactoryKey) { console.log('No TOKEN_FACTORY_API_KEY in .env.local; nothing to test.'); return }

  // 1. models
  let t = t0()
  const models = await tfFetch<any>('models', undefined, 20000)
  const ids: string[] = (models?.data ?? []).map((m: any) => m.id)
  row('GET /models', '-', ids.length > 0, `${ids.length} models (${ms(t)})`)
  for (const [role, id] of Object.entries(env.models)) {
    if (role === 'embedDims') continue
    const exists = ids.includes(String(id))
    row(`model:${role}`, String(id), exists, exists ? 'listed' : `not listed; nearest: ${nearest(String(id), ids).join(', ') || '-'}`)
  }
  if (process.argv.includes('--list')) console.log(ids.join('\n'))

  // 2. embeddings
  t = t0()
  const raw = await tfFetch<any>('embeddings', { model: env.models.embed, input: ['melanoma single-cell', 'MITF AXL drug resistance'], dimensions: env.models.embedDims, encoding_format: 'float' }, 30000)
  row('embed raw dims', env.models.embed, !!raw, raw ? `asked ${env.models.embedDims}, got ${raw.data?.[0]?.embedding?.length} (${ms(t)})` : errStr())
  const docs64 = Array.from({ length: 64 }, (_, i) => `${ABSTRACT} Variant ${i}.`)
  t = t0()
  const e64 = await embed(docs64, 'document', cfg)
  row('embed 64 docs', env.models.embed, !!e64, e64 ? `${e64.length}×${e64[0].length}, |v|=${Math.hypot(...e64[0]).toFixed(3)} (${ms(t)})` : errStr())
  const q = await embed(['How do melanoma cell states drive drug resistance?'], 'query', cfg)
  if (q && e64) row('embed query cos', env.models.embed, true, `cos(query, doc)=${q[0].reduce((s, x, i) => s + x * e64[0][i], 0).toFixed(3)}`)

  // 3. rerank
  const rdocs = [ABSTRACT, 'A recipe for sourdough bread with long fermentation.', 'Single-cell RNA-seq of glioblastoma reveals plasticity of cellular states.']
  t = t0()
  const r3 = await rerank('melanoma cell states and drug resistance', rdocs, cfg)
  row('rerank 3', env.models.rerank, !!r3, r3 ? `${r3.map(x => x.toFixed(3)).join(' / ')} (${ms(t)})` : errStr())
  const docs60 = Array.from({ length: 60 }, (_, i) => (i % 3 === 0 ? ABSTRACT : rdocs[i % 3]) + ` (${i})`)
  t = t0()
  const r60 = await rerank('melanoma cell states and drug resistance', docs60, cfg)
  row('rerank 60', env.models.rerank, !!r60, r60 ? `${r60.length} scores (${ms(t)})` : errStr())

  // 4. planner + judge
  t = t0()
  const fs = await facets('Which transcriptional cell states in melanoma drive resistance to targeted therapy?', [], cfg)
  row('facets', env.models.planner, fs[0].query !== fs[1].query, `${fs.map(f => `${f.key}="${f.query}"`).join(' ')} (${ms(t)})`)
  t = t0()
  const qs = await expandQueries('Which transcriptional cell states in melanoma drive resistance to targeted therapy?', fs, cfg)
  row('expandQueries', env.models.planner, qs.length >= 2, `${qs.length}: ${qs.join(' | ')} (${ms(t)})`)
  const paper = { id: 'W2332292689', doi: '10.1126/science.aad0501', pmid: null, pmcid: null, title: 'Dissecting the multicellular ecosystem of metastatic melanoma by single-cell RNA-seq', authors: ['Tirosh I'], year: 2016, publicationDate: null, venue: 'Science', type: 'article', citedByCount: 4000, citationPct: 0.99, isRetracted: false, isOa: true, oaUrl: null, abstract: ABSTRACT, abstractSource: 'openalex' as const, referencedWorks: [], url: 'https://openalex.org/W2332292689' }
  const features = { links: 1, out: [], in: [1], coupling: null, eSeed: null, eQuestion: null, eFacets: null, rerank: null, impact: 0.99, pubmedRank: null }
  const seeds = [{ ...paper, id: 'W1', n: 1, label: 'S1', shortName: 'Jerby-Arnon 2018', input: 'x', title: 'A cancer cell program promotes T cell exclusion and resistance to checkpoint blockade' }]
  t = t0()
  const j = await judge({ question: 'Which transcriptional cell states in melanoma drive resistance to targeted therapy?', facets: fs, seeds, paper, features }, cfg)
  row('judge 1', env.models.judge, !!j, j ? `rel=${j.relevance} f=${j.facets.topic}/${j.facets.method}/${j.facets.population} ${j.paperType} verified=${j.verified} (${ms(t)})` : errStr())
  if (j) console.log('     why:', j.why, '\n     quote:', j.quote)

  // 5. judge with a raw json_schema call per model (checks json_schema support + think tags)
  for (const role of ['judge', 'planner'] as const) {
    const model = env.models[role]
    for (const think of [false, true]) {
      t = t0()
      const res = await tfFetch<any>('chat/completions', {
        model, temperature: 0, max_tokens: 300,
        messages: [{ role: 'user', content: 'Return JSON {"ok": true, "n": 3}.' }],
        response_format: { type: 'json_schema', json_schema: { name: 'x', strict: true, schema: { type: 'object', additionalProperties: false, required: ['ok', 'n'], properties: { ok: { type: 'boolean' }, n: { type: 'integer' } } } } },
        ...(think ? {} : { chat_template_kwargs: { enable_thinking: false } }),
      }, 30000)
      const content: string = res?.choices?.[0]?.message?.content ?? ''
      row(`json_schema ${think ? 'think' : 'nothink'}`, model, !!res, res ? `${JSON.stringify(content.slice(0, 80))} think=${/<think>/i.test(content) || !!res?.choices?.[0]?.message?.reasoning_content} tok=${res?.usage?.completion_tokens} (${ms(t)})` : errStr())
    }
  }

  // 6. tool calling per model
  const provider = createOpenAICompatible({ name: 'tokenfactory', baseURL: baseUrl().replace(/\/$/, ''), apiKey: env.tokenFactoryKey })
  for (const role of ['judge', 'planner', 'scout'] as const) {
    const model = env.models[role]
    t = t0()
    try {
      let called = ''
      const res = await generateText({
        model: provider.chatModel(model),
        prompt: 'Look up the DOI 10.1126/science.aad0501 with the lookup tool, then answer with its title.',
        tools: { lookup: tool({ description: 'Look up a paper by DOI', inputSchema: z.object({ doi: z.string() }), execute: async ({ doi }) => { called = doi; return { title: 'Dissecting the multicellular ecosystem of metastatic melanoma' } } }) },
        stopWhen: isStepCount(3), maxRetries: 0, abortSignal: AbortSignal.timeout(40000),
      })
      row(`tools:${role}`, model, !!called, called ? `called lookup(${called}); steps=${res.steps.length}; answer=${JSON.stringify(res.text.slice(0, 60))} (${ms(t)})` : `no tool call; text=${JSON.stringify(res.text.slice(0, 80))}`)
    } catch (e: any) {
      row(`tools:${role}`, model, false, String(e?.message || e).slice(0, 160))
    }
  }

  // 7. tavily
  if (env.tavilyKey) {
    t = t0()
    const hits = await tavilySearch('melanoma MITF AXL single-cell preprint', { includeDomains: ['biorxiv.org', 'nature.com'] })
    row('tavily', '-', hits.length > 0, `${hits.length} hits (${ms(t)})`)
  }

  console.log('\n| check | model | ok | detail |\n|---|---|---|---|')
  for (const r of rows) console.log(`| ${r.join(' | ').replace(/\n/g, ' ')} |`)
}

main().catch(e => { console.error('smoke failed:', e?.message || e); process.exit(1) })

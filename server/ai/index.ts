// Owner: lane A2 (AI). The pipeline (A1) calls ONLY these functions. Every function must degrade
// gracefully: with no TOKEN_FACTORY_API_KEY or on timeout it returns null / [] and the pipeline continues.
import type { Facet, Features, Judgement, Paper, Seed } from '@shared/contracts'
import type { RunConfig } from '@shared/config'
import { embed as embedImpl, rerank as rerankImpl } from './embed'
import { facets as facetsImpl, expandQueries as expandImpl, fallbackFacets } from './planner'
import { judge as judgeImpl } from './judge'
import { scout as scoutImpl } from './scout'

export interface JudgeInput { question: string; facets: Facet[]; seeds: Seed[]; paper: Paper; features: Features }
export interface ScoutStep { step: number; tool: string; input: string; output: string }
export interface ScoutResult { dois: string[]; openalexIds: string[]; webSources: { url: string; title: string; snippet: string; query: string }[] }

/** Embeds texts. kind 'query' adds the Qwen3 instruction prefix. Returns unit-normalized vectors or null. */
export async function embed(texts: string[], kind: 'query' | 'document', cfg: RunConfig): Promise<number[][] | null> {
  try { return await embedImpl(texts, kind, cfg) } catch { return null }
}
/** Reranker scores (0..1) for each doc against the query, same order as docs; null if unavailable. */
export async function rerank(query: string, docs: string[], cfg: RunConfig): Promise<number[] | null> {
  try { return await rerankImpl(query, docs, cfg) } catch { return null }
}
/** Splits the question into topic / method / population facets. Fallback: three facets copied from the question. */
export async function facets(question: string, seeds: Seed[], cfg: RunConfig): Promise<Facet[]> {
  try { return await facetsImpl(question, seeds, cfg) } catch { return fallbackFacets(question) }
}
/** R4: 2–4 search queries derived from the question + facets. */
export async function expandQueries(question: string, facets: Facet[], cfg: RunConfig): Promise<string[]> {
  try { return await expandImpl(question, facets, cfg) } catch { return [] }
}
/** LLM judge + verbatim quote verification (verified=false if the quote is not found in paper.abstract). */
export async function judge(input: JudgeInput, cfg: RunConfig): Promise<Judgement | null> {
  try { return await judgeImpl(input, cfg) } catch { return null }
}
/** R5 Scout: bounded tool loop (Tavily, OpenAlex search, DOI lookup). Emits onStep per tool call. */
export async function scout(question: string, seeds: Seed[], facets: Facet[], cfg: RunConfig, onStep: (s: ScoutStep) => void): Promise<ScoutResult> {
  try { return await scoutImpl(question, seeds, facets, cfg, onStep) } catch { return { dois: [], openalexIds: [], webSources: [] } }
}

export { verifyQuote } from './verify'

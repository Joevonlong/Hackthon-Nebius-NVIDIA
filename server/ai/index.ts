// Owner: lane A2 (AI). The pipeline (A1) calls ONLY these functions. Every function must degrade
// gracefully: with no TOKEN_FACTORY_API_KEY or on timeout it returns null / [] and the pipeline continues.
import type { Facet, Features, Judgement, Paper, Seed } from '@shared/contracts'
import type { RunConfig } from '@shared/config'

export interface JudgeInput { question: string; facets: Facet[]; seeds: Seed[]; paper: Paper; features: Features }
export interface ScoutStep { step: number; tool: string; input: string; output: string }
export interface ScoutResult { dois: string[]; openalexIds: string[]; webSources: { url: string; title: string; snippet: string; query: string }[] }

/** Embeds texts. kind 'query' adds the Qwen3 instruction prefix. Returns unit-normalized vectors or null. */
export async function embed(_texts: string[], _kind: 'query' | 'document', _cfg: RunConfig): Promise<number[][] | null> { return null }
/** Reranker scores (0..1) for each doc against the query, same order as docs; null if unavailable. */
export async function rerank(_query: string, _docs: string[], _cfg: RunConfig): Promise<number[] | null> { return null }
/** Splits the question into topic / method / population facets. Fallback: three facets copied from the question. */
export async function facets(question: string, _seeds: Seed[], _cfg: RunConfig): Promise<Facet[]> {
  return [
    { key: 'topic', label: 'Topic', query: question },
    { key: 'method', label: 'Method', query: question },
    { key: 'population', label: 'Population', query: question },
  ]
}
/** R4: 2–4 search queries derived from the question + facets. */
export async function expandQueries(_question: string, _facets: Facet[], _cfg: RunConfig): Promise<string[]> { return [] }
/** LLM judge + verbatim quote verification (verified=false if the quote is not found in paper.abstract). */
export async function judge(_input: JudgeInput, _cfg: RunConfig): Promise<Judgement | null> { return null }
/** R5 Scout: bounded tool loop (Tavily, OpenAlex search, PubMed similar, DOI lookup). */
export async function scout(_question: string, _seeds: Seed[], _facets: Facet[], _cfg: RunConfig, _onStep: (s: ScoutStep) => void): Promise<ScoutResult> {
  return { dois: [], openalexIds: [], webSources: [] }
}

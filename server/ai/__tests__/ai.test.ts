import { describe, expect, it } from 'vitest'
import { verifyQuote } from '../verify'
import { parseJsonLoose, stripThink, retryAfterMs } from '../http'
import { JudgeOut, finalizeJudgement } from '../judge'
import { fitDims, l2normalize, queryPrefix } from '../embed'
import { classifyUrl, cleanDoi, extractDoi, extractNct, extractPmid, extractPmcid, identify } from '../../sources/tavily'

const ABS = `Malignant cells within the same tumor displayed transcriptional heterogeneity associated with the cell cycle,  spatial context, and a drug‑resistance program. Tumors with “high MITF” also contained cells with low MITF and elevated levels of the AXL kinase.`

describe('verifyQuote', () => {
  it('exact substring gives offsets into the original', () => {
    const q = 'displayed transcriptional heterogeneity associated with the cell cycle'
    const m = verifyQuote(q, ABS)
    expect(m.verified).toBe(true)
    expect(m.method).toBe('exact')
    expect(ABS.slice(m.start, m.end)).toBe(q)
  })
  it('tolerates whitespace, case, curly quotes and dashes', () => {
    const q = 'the cell cycle, spatial context, and a DRUG-resistance program'
    const m = verifyQuote(q, ABS)
    expect(m.verified).toBe(true)
    expect(ABS.slice(m.start, m.end)).toBe('the cell cycle,  spatial context, and a drug‑resistance program')
    const m2 = verifyQuote('Tumors with "high MITF" also contained cells with low MITF', ABS)
    expect(m2.verified).toBe(true)
    expect(m2.text).toContain('“high MITF”')
  })
  it('strips wrapping quotes and ellipses', () => {
    expect(verifyQuote('"…elevated levels of the AXL kinase."', ABS).verified).toBe(true)
  })
  it('accepts a ≥90% contiguous match (one typo) as fuzzy', () => {
    const m = verifyQuote('contained cells with low MITF and elevatd levels of the AXL kinase', ABS)
    expect(m.verified).toBe(true)
    expect(m.method).toBe('fuzzy')
    expect(m.text).toBe('contained cells with low MITF and elevated levels of the AXL kinase')
  })
  it('rejects paraphrases, misses and empty input', () => {
    expect(verifyQuote('tumours show many different expression programs linked to resistance', ABS).verified).toBe(false)
    expect(verifyQuote('BRAF inhibitors were given to all patients in the cohort', ABS).verified).toBe(false)
    expect(verifyQuote(null, ABS).verified).toBe(false)
    expect(verifyQuote('AXL kinase', ABS).verified).toBe(false) // too short
    expect(verifyQuote('a long enough quote here', null).verified).toBe(false)
  })
})

describe('identifier extraction', () => {
  it('DOIs from URLs, meta and text', () => {
    expect(extractDoi('https://www.biorxiv.org/content/10.1101/2023.05.01.538912v2.full')).toBe('10.1101/2023.05.01.538912')
    expect(extractDoi('https://www.science.org/doi/10.1126/science.aad0501')).toBe('10.1126/science.aad0501')
    expect(extractDoi('https://doi.org/10.1016/J.CELL.2018.09.006')).toBe('10.1016/j.cell.2018.09.006')
    expect(extractDoi('https://www.nature.com/articles/s41586-023-06812-z')).toBe('10.1038/s41586-023-06812-z')
    expect(extractDoi('https://onlinelibrary.wiley.com/doi/full/10.1002/ijc.33456')).toBe('10.1002/ijc.33456')
    expect(extractDoi('https://example.org/page', '<meta name="citation_doi" content="10.1158/2159-8290.CD-20-1234">')).toBe('10.1158/2159-8290.cd-20-1234')
    expect(extractDoi('https://news.example.com/x', 'Published in Cell (doi: 10.1016/j.cell.2016.02.065).')).toBe('10.1016/j.cell.2016.02.065')
    expect(extractDoi('https://example.org/none', 'no identifiers here')).toBeNull()
    expect(cleanDoi('https://doi.org/10.1038/nature12345.')).toBe('10.1038/nature12345')
  })
  it('PMID, PMCID and NCT', () => {
    expect(extractPmid('https://pubmed.ncbi.nlm.nih.gov/27124452/')).toBe('27124452')
    expect(extractPmid('https://europepmc.org/article/MED/30388455')).toBe('30388455')
    expect(extractPmid('https://x.org', 'PMID: 12345678')).toBe('12345678')
    expect(extractPmcid('https://pmc.ncbi.nlm.nih.gov/articles/PMC4944528/')).toBe('PMC4944528')
    expect(extractNct('https://clinicaltrials.gov/study/NCT04123456')).toBe('NCT04123456')
    expect(extractNct('https://x.org', 'registered as nct0123456')).toBeNull()
  })
  it('classifies URLs', () => {
    expect(classifyUrl('https://www.biorxiv.org/content/10.1101/2023.05.01.538912v2')).toBe('preprint')
    expect(classifyUrl('https://pmc.ncbi.nlm.nih.gov/articles/PMC4944528/')).toBe('pmc')
    expect(classifyUrl('https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4944528/')).toBe('pmc')
    expect(classifyUrl('https://pubmed.ncbi.nlm.nih.gov/27124452/')).toBe('pubmed')
    expect(classifyUrl('https://clinicaltrials.gov/study/NCT04123456')).toBe('trial')
    expect(classifyUrl('https://www.nature.com/articles/s41586-023-06812-z')).toBe('publisher')
    expect(classifyUrl('https://www.nature.com/articles/d41586-024-00001-1')).toBe('news')
    expect(classifyUrl('https://www.sciencedaily.com/releases/2024/01/x.htm')).toBe('news')
    expect(classifyUrl('https://someblog.example.com/post')).toBe('other')
    expect(classifyUrl('not a url')).toBe('other')
    expect(identify('https://clinicaltrials.gov/study/NCT04123456').nct).toBe('NCT04123456')
  })
})

describe('judge output parsing', () => {
  const reply = `<think>The paper is about melanoma states. Grade 3.</think>
\`\`\`json
{"relevance": 3, "facets": {"topic": 3, "method": "2", "population": 2.6}, "paperType": "Method/Tool", "why": "Defines MITF-low / AXL-high states linked to resistance.", "quote": "elevated levels of the AXL kinase", "uncertainty": "", "seedLinks": [{"seedN": 1, "relation": "cited by"}, {"seedN": 9, "relation": "bogus"}]}
\`\`\``
  it('strips <think> and parses fenced JSON', () => {
    expect(stripThink('<think>x</think> hi')).toBe('hi')
    expect(stripThink('reasoning only</think>{"a":1}')).toBe('{"a":1}')
    const data = parseJsonLoose(reply)
    expect(data.relevance).toBe(3)
    expect(parseJsonLoose('Sure! {"a": {"b": "}"}} trailing')).toEqual({ a: { b: '}' } })
    expect(parseJsonLoose('not json')).toBeNull()
  })
  it('coerces into a contract Judgement and verifies the quote', () => {
    const out = JudgeOut.parse(parseJsonLoose(reply))
    expect(out.facets).toEqual({ topic: 3, method: 2, population: 3 })
    expect(out.paperType).toBe('method_tool')
    const paper: any = { abstract: ABS, abstractSource: 'pubmed' }
    const seeds: any = [{ n: 1, label: 'S1', shortName: 'A 2020' }]
    const j = finalizeJudgement(out, paper, 'm', seeds)
    expect(j.verified).toBe(true)
    expect(j.quoteRef?.source).toBe('pubmed')
    expect(ABS.slice(j.quoteRef!.start, j.quoteRef!.end)).toBe('elevated levels of the AXL kinase')
    expect(j.seedLinks).toEqual([{ seedN: 1, relation: 'cited by' }])
  })
  it('unverified quote keeps the text but no quoteRef', () => {
    const out = JudgeOut.parse({ relevance: 1, facets: { topic: 1, method: 0, population: 0 }, paperType: 'primary', why: 'x', quote: 'not present anywhere in the abstract text', uncertainty: 'u', seedLinks: [] })
    const j = finalizeJudgement(out, { abstract: ABS, abstractSource: null } as any, 'm', [])
    expect(j.verified).toBe(false)
    expect(j.quoteRef).toBeNull()
  })
})

describe('embedding helpers and retry', () => {
  it('normalizes and truncates', () => {
    expect(Math.hypot(...l2normalize([3, 4]))).toBeCloseTo(1)
    const v = fitDims([1, 2, 3, 4], 2)
    expect(v.length).toBe(2)
    expect(Math.hypot(...v)).toBeCloseTo(1)
    expect(queryPrefix('q')).toBe('Instruct: Given a biomedical research question, retrieve relevant paper abstracts\nQuery: q')
  })
  it('Retry-After seconds are honoured and capped', () => {
    expect(retryAfterMs('2', 0)).toBe(2000)
    expect(retryAfterMs('120', 0)).toBe(10000)
    expect(retryAfterMs(null, 0)).toBeLessThan(1000)
  })
})

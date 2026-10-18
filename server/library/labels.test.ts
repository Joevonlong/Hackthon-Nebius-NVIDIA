import { describe, expect, it } from 'vitest'
import { Labels } from '@shared/library'
import { kindOf, labelRecord, recencyOf, studyDesignOf } from './labels'
import { mkRecord, testGoals } from './test-records'

describe('kind precedence', () => {
  it('PubMed review family overrides everything', () => {
    expect(kindOf(mkRecord('W1', { extra: { pubmedTypes: ['Journal Article', 'Meta-Analysis', 'Review'] } }))).toBe('meta-analysis')
    expect(kindOf(mkRecord('W1', { extra: { pubmedTypes: ['Systematic Review'] } }))).toBe('systematic-review')
    expect(kindOf(mkRecord('W1', { paper: { type: 'review' } }))).toBe('review')
    expect(kindOf(mkRecord('W1', { paper: { type: 'preprint', title: 'A systematic review of X' } }))).toBe('systematic-review')
  })
  it('venue type, arXiv and OpenAlex types', () => {
    expect(kindOf(mkRecord('W1', { venue: { type: 'conference' } }))).toBe('conference-paper')
    expect(kindOf(mkRecord('W1', { venue: { type: 'repository' } }))).toBe('preprint')
    expect(kindOf(mkRecord('W1', { venue: { type: null }, extra: { arxiv: { id: '2101.00001', primaryCategory: 'q-bio.GN', categories: ['q-bio.GN'], journalRef: null, comment: null } } }))).toBe('preprint')
    expect(kindOf(mkRecord('W1', { extra: { arxiv: { id: '2101.00001', primaryCategory: null, categories: [], journalRef: 'Nature 1 (2021)', comment: null } } }))).toBe('journal-article')
    expect(kindOf(mkRecord('W1', { paper: { type: 'book-chapter' }, venue: { type: 'book series' } }))).toBe('book-chapter')
    expect(kindOf(mkRecord('W1', { paper: { type: 'dissertation' }, venue: { type: null } }))).toBe('thesis')
    expect(kindOf(mkRecord('W1', { paper: { type: 'dataset' }, venue: { type: 'repository' } }))).toBe('dataset')
    expect(kindOf(mkRecord('W1', { paper: { type: 'editorial' } }))).toBe('editorial')
    expect(kindOf(mkRecord('W1', { paper: { type: 'article' } }))).toBe('journal-article')
  })
})

describe('labels', () => {
  it('study designs from PubMed types', () => {
    expect(studyDesignOf(['Journal Article', 'Randomized Controlled Trial', 'Clinical Trial, Phase III', 'Research Support, N.I.H., Extramural', 'Case Reports', 'Observational Study']))
      .toEqual(['randomized-controlled-trial', 'clinical-trial', 'clinical-trial-phase-iii', 'case-report', 'observational-study'])
  })
  it('recency buckets', () => {
    const now = new Date('2026-10-18')
    expect(recencyOf('2026-01-01', 2026, now)).toBe('fresh')
    expect(recencyOf('2023-01-01', 2023, now)).toBe('recent')
    expect(recencyOf(null, 2015, now)).toBe('established')
    expect(recencyOf(null, 1990, now)).toBe('classic')
  })
  it('full label set matches the contract, with tags and subtopics', () => {
    const r = mkRecord('W1', {
      paper: { title: 'scTool: a software pipeline for melanoma T cell states', isRetracted: false, abstract: null },
      extra: { grants: ['National Cancer Institute', 'Wellcome'], oaStatus: 'gold', primaryTopic: { topic: 'Single-cell', subfield: 'Cancer Research', field: 'Medicine', domain: 'Health' }, language: 'de', mesh: ['Melanoma'] },
      hits: [{ source: 'pubmed', via: 'subtopic', query: 'q', rank: 2, url: 'u' }, { source: 'openalex', via: 'keyword', query: 'q', rank: 1, url: 'u' }],
    })
    const l = labelRecord(r, testGoals(), { now: new Date('2026-10-18') })
    expect(Labels.safeParse(l).success).toBe(true)
    expect(l.tags).toEqual(expect.arrayContaining(['method/tool', 'funded:National Cancer Institute', 'funded:Wellcome', 'no-abstract', 'non-english']))
    expect(l.sources).toEqual(['pubmed', 'openalex'])
    expect(l.peerReviewed).toBe(true)
    expect(l.openAccess).toBe('gold')
    expect(l.field).toBe('Medicine')
    expect(l.subtopics).toEqual(['T cell states'])
    expect(l.hasAbstract).toBe(false)
  })
})

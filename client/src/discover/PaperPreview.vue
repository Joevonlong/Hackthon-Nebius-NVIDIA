<script setup lang="ts">
// Preview of the literature note a candidate would become. Owner: lane C.
import { computed } from 'vue'
import { ROUTE_LABEL } from '@shared/contracts'
import { useDiscovery, REJECT_REASONS, type RejectReason } from '../stores/discovery'
import { useUi } from '../stores/ui'
import { useVault } from '../stores/vault'
import { safeUrl } from '../util/safeUrl'
import { abstractSourceLabel, buildLiteratureNote, doiUrl, pubmedUrl, seedNoteName, seedNotePath, signalLine } from './literatureNote'

const props = defineProps<{ paperId: string }>()
const disc = useDiscovery(), ui = useUi(), vault = useVault()

const c = computed(() => disc.byId(props.paperId))
const p = computed(() => c.value?.paper)
const j = computed(() => c.value?.judgement ?? null)
const note = computed(() => c.value ? buildLiteratureNote(c.value, { seeds: disc.seeds, runId: disc.runId }) : null)
const saved = computed(() => vault.byPaper(props.paperId))
const fb = computed(() => disc.feedback[props.paperId])
const frontMatter = computed(() => note.value?.content.match(/^---\n([\s\S]*?)\n---/)?.[1].split('\n').map(l => { const i = l.indexOf(':'); return { k: l.slice(0, i), v: l.slice(i + 1).trim() } }) ?? [])

/** Abstract split around the quote span: offsets from quoteRef when they match, else a verbatim search. */
const abstractParts = computed(() => {
  const a = p.value?.abstract
  if (!a) return null
  const q = j.value?.quote
  let s = -1, e = -1
  const ref = j.value?.quoteRef
  if (ref && ref.start >= 0 && ref.end <= a.length && ref.end > ref.start) { s = ref.start; e = ref.end }
  else if (q) { s = a.indexOf(q); e = s >= 0 ? s + q.length : -1 }
  if (s < 0) return { before: a, mark: '', after: '' }
  return { before: a.slice(0, s), mark: a.slice(s, e), after: a.slice(e) }
})

const judgeState = computed(() => {
  if (j.value) return 'judged'
  if (disc.status === 'running' && disc.stages.find(s => s.name === 'judge')?.status !== 'done') return 'pending'
  return 'none'
})

const seedLink = (n: number) => { const s = disc.seeds.find(x => x.n === n); return s ? seedNoteName(s) : 'S' + n }
const trail = computed(() => (c.value?.signals ?? []).map(sig => ({ sig, text: signalLine(sig, n => `[[${seedLink(n)}]]`) })))

function openSeed(n: number) {
  const s = disc.seeds.find(x => x.n === n); if (!s) return
  ui.openNote(seedNotePath(s), seedNoteName(s))
}
async function addToVault() {
  if (!c.value || !note.value) return
  await vault.upsert({ path: note.value.path, kind: 'lit', title: note.value.title, content: note.value.content, paperId: c.value.paper.id })
  ui.openNote(note.value.path, note.value.title)
}
function openSaved() { if (saved.value) ui.openNote(saved.value.path, saved.value.title) }
const keep = () => disc.setFeedback(props.paperId, fb.value?.verdict === 'keep' ? null : 'keep')
const reject = (reason?: RejectReason) => disc.setFeedback(props.paperId, 'reject', reason)
const clearFb = () => disc.setFeedback(props.paperId, null)
</script>

<template>
  <div class="doc">
    <div v-if="!c && disc.status === 'running'" class="state" aria-busy="true">
      <div class="skel h" /><div class="skel" /><div class="skel" /><p class="muted">Loading this paper from the running discovery…</p>
    </div>
    <div v-else-if="!c" class="state">
      <h4>Paper not in the current run</h4>
      <p class="muted">Run discovery in the sidebar, then pick a candidate to preview the note it would create.</p>
    </div>
    <template v-else-if="p && note">
      <div class="docbar">
        <button v-if="!saved" class="btn primary" type="button" @click="addToVault">Add to vault</button>
        <button v-else class="btn" type="button" @click="openSaved">In vault · open note</button>
        <button class="btn" type="button" :aria-pressed="fb?.verdict === 'keep'" :class="{ on: fb?.verdict === 'keep' }" @click="keep">👍 Keep</button>
        <button class="btn" type="button" :aria-pressed="fb?.verdict === 'reject'" :class="{ on: fb?.verdict === 'reject' }" @click="fb?.verdict === 'reject' ? clearFb() : reject()">👎 Not relevant</button>
        <a v-if="safeUrl(p.url)" class="tag" :href="safeUrl(p.url)!" target="_blank" rel="noopener">OpenAlex ↗</a>
        <a v-if="p.doi" class="tag" :href="doiUrl(p.doi)" target="_blank" rel="noopener">DOI ↗</a>
        <a v-if="p.pmid" class="tag" :href="pubmedUrl(p.pmid)" target="_blank" rel="noopener">PubMed ↗</a>
      </div>
      <div v-if="fb?.verdict === 'reject'" class="reasons" role="group" aria-label="Reason">
        <span class="muted small">Why?</span>
        <button v-for="r in REJECT_REASONS" :key="r" type="button" class="rchip" :aria-pressed="fb.reason === r" @click="reject(r)">{{ r }}</button>
      </div>
      <p v-if="fb?.verdict === 'keep'" class="muted small">Kept: “Grow again” in the sidebar adds it as a seed for the next round.</p>
      <p v-if="!saved" class="muted small hint">Preview of the note this would create · <span class="mono">{{ note.path }}</span></p>
      <div v-if="p.isRetracted" class="retr" role="note">Retracted · flagged by OpenAlex. Never recommended.</div>

      <pre class="fm">---
<template v-for="l in frontMatter" :key="l.k"><span class="k">{{ l.k }}:</span> {{ l.v }}
</template>---</pre>
      <h1>{{ p.title }}</h1>
      <p class="meta">{{ p.authors.slice(0, 3).join(', ') }}{{ p.authors.length > 3 ? ' et al.' : '' }} · {{ p.year }} · {{ p.venue || p.type }} · {{ p.citedByCount.toLocaleString('en') }} citations · <span class="lane">{{ c.lane }} #{{ c.rank }}</span></p>

      <div v-if="judgeState === 'judged' && j" class="slot">
        <b>WHY READ IT · {{ j.model }} · relevance {{ j.relevance }}/3</b>
        <p>{{ j.why }}</p>
        <p class="facets mono">topic {{ j.facets.topic }}/3 · method {{ j.facets.method }}/3 · population {{ j.facets.population }}/3 · {{ j.paperType }}</p>
      </div>
      <div v-else class="slot pend"><b>WHY READ IT</b><p>{{ judgeState === 'pending' ? 'Judge pending…' : 'Not judged in this run (outside the judge’s top-K). Ranked by seed links.' }}</p></div>

      <div class="slot" :class="{ pend: !j?.quote }">
        <b>EVIDENCE
          <template v-if="j?.quote && j.verified">· <span class="ok">✓ verified · source {{ abstractSourceLabel(j.quoteRef?.source ?? p.abstractSource) }}{{ j.quoteRef ? ` · chars ${j.quoteRef.start}–${j.quoteRef.end}` : '' }}</span></template>
          <template v-else-if="j?.quote">· <span class="warn">⚠ unverified: not found word for word in the abstract</span></template>
          <template v-else-if="judgeState === 'pending'">· judge pending</template>
        </b>
        <blockquote v-if="j?.quote">{{ j.quote }}</blockquote>
        <p v-if="abstractParts" class="abstract"><span class="muted small">Abstract ({{ abstractSourceLabel(p.abstractSource) }}): </span>{{ abstractParts.before }}<mark v-if="abstractParts.mark" :class="{ unv: !j?.verified }">{{ abstractParts.mark }}</mark>{{ abstractParts.after }}</p>
        <p v-else class="muted">No abstract available from OpenAlex or PubMed.</p>
      </div>

      <div v-if="j" class="slot"><b>UNCERTAINTY</b><p>{{ j.uncertainty }}</p></div>

      <h2>Paper trail</h2>
      <ul class="trail">
        <li v-for="(t, i) in trail" :key="i">
          <template v-if="t.sig.seedNs.length && (t.sig.kind === 'cites_seed' || t.sig.kind === 'cited_by_seed')">
            {{ t.sig.kind === 'cites_seed' ? 'cites' : 'cited by' }}
            <template v-for="(n, k) in t.sig.seedNs" :key="n"><a class="wl" href="#" @click.prevent="openSeed(n)">[[{{ seedLink(n) }}]]</a>{{ k < t.sig.seedNs.length - 1 ? ', ' : '' }}</template>
            · <span class="route">{{ t.sig.route }}</span> {{ ROUTE_LABEL[t.sig.route] }}
          </template>
          <template v-else>{{ t.text }}</template>
          · <a v-if="safeUrl(t.sig.source.url)" :href="safeUrl(t.sig.source.url)!" target="_blank" rel="noopener" class="src">{{ t.sig.source.name }} ↗</a><span v-else class="src">{{ t.sig.source.name }}</span>
        </li>
        <li v-if="!trail.length" class="muted">No recorded signals.</li>
      </ul>

      <h2>Why ranked here</h2>
      <p class="mono why">{{ c.whyRanked }}</p>

      <h2>My notes</h2>
      <p class="muted">Write here after adding to the vault. Link other notes with [[wikilinks]].</p>
    </template>
  </div>
</template>

<style scoped>
.doc{padding:18px 22px 28px;overflow:auto;height:100%;contain:size;min-width:0;color:var(--fg);background:var(--surface)}
.state{display:flex;flex-direction:column;gap:10px;max-width:640px}
.state h4{font:600 20px/1.25 var(--font-display);margin:0}
.docbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px}
.btn{font:600 12.5px/1 var(--font-body);border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:8px 12px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.btn.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.btn.on{border-color:var(--cand);background:var(--cand-soft)}
.tag{font:500 11.5px var(--font-mono);color:var(--muted);border:1px solid var(--line);border-radius:4px;padding:3px 6px;text-decoration:none}
.tag:hover{color:var(--fg);border-color:var(--line-2)}
.reasons{display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:8px}
.rchip{font:500 11px var(--font-mono);border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:4px 8px;cursor:pointer}
.rchip[aria-pressed="true"]{border-color:var(--warn);color:var(--warn)}
.small{font-size:12px}
.muted{color:var(--muted)}
.mono{font-family:var(--font-mono)}
.hint{margin:0 0 10px}
.fm{margin:0 0 14px;font:12px/1.65 var(--font-mono);color:var(--muted);background:var(--surface-2);border-radius:6px;padding:10px 12px;white-space:pre-wrap;overflow-wrap:anywhere}
.fm .k{color:var(--seed)}
h1{font:600 22px/1.25 var(--font-display);margin:0 0 6px}
h2{font:600 15px/1.3 var(--font-display);margin:18px 0 6px}
.meta{margin:0 0 12px;font-size:13px;color:var(--muted)}
.lane{font:600 11px var(--font-mono);color:var(--fg)}
.slot{border:1px solid var(--line);border-radius:6px;padding:8px 10px;font-size:13.5px;margin:0 0 8px}
.slot.pend{border-style:dashed;border-color:var(--line-2);color:var(--muted)}
.slot b{font:600 11px var(--font-mono);letter-spacing:.06em;color:var(--fg)}
.slot p{margin:4px 0 0}
.facets{font-size:11.5px;color:var(--muted)}
blockquote{margin:6px 0;padding:4px 10px;border-left:3px solid var(--cand);font-style:italic}
.abstract{font-size:13px;line-height:1.55}
mark{background:var(--cand-soft);color:var(--fg);box-shadow:inset 0 -2px 0 var(--cand);border-radius:2px}
mark.unv{background:color-mix(in srgb,var(--warn) 16%,transparent);box-shadow:inset 0 -2px 0 var(--warn)}
.ok{color:var(--ok)}
.warn{color:var(--warn)}
.retr{border:1px solid var(--crit);color:var(--crit);border-radius:6px;padding:6px 10px;font-size:12.5px;margin-bottom:10px}
.trail{margin:0 0 8px;padding-left:18px;font-size:13.5px;display:flex;flex-direction:column;gap:3px}
.wl{color:var(--seed);text-decoration:none;border-bottom:1px dotted var(--seed);cursor:pointer}
.route{font:600 11px var(--font-mono)}
.src{color:var(--muted);font-size:12px}
.why{font-size:12px;overflow-wrap:anywhere}
.skel{height:14px;border-radius:4px;background:var(--surface-2)}
.skel.h{height:26px;width:70%}
</style>

<script setup lang="ts">
// Library sidebar (lane L3, D-20/D-23): seeds, controls, run, stage trail, goals, sources, top results.
import { computed, ref } from 'vue'
import { SourceName } from '@shared/library'
import { useLibrary, LIB_STAGE_LABEL, SOURCE_LABEL } from '../stores/library'
import { useVault } from '../stores/vault'
import { useUi } from '../stores/ui'
import { noteName } from '../stores/vault-utils'
import { COMPONENT_KEYS, COMPONENT_META, f2, weightSum, type ComponentKey } from './score'
import { shortTitle } from '../discover/literatureNote'
import ScoreBar from './ScoreBar.vue'

const lib = useLibrary()
const vault = useVault()
const ui = useUi()

const running = computed(() => lib.status === 'running')
const seedText = ref('')
const seedCount = computed(() => vault.notes.filter(n => n.kind === 'seed').length)
const modeLabel = computed(() => lib.mode === 'mock' ? 'dev mock' : lib.mode === 'live' ? 'live' : '')

const toggleSource = (s: SourceName) => {
  const i = lib.sources.indexOf(s)
  if (i >= 0) { if (lib.sources.length > 1) lib.sources.splice(i, 1) } else lib.sources.push(s)
}
const llmLowest = computed(() => COMPONENT_KEYS.filter(k => k !== 'llm').every(k => lib.weights[k] >= lib.weights.llm))
const share = (k: ComponentKey) => { const s = weightSum(lib.weights); return s > 0 ? lib.weights[k] / s : 0 }
const topKModel = computed({ get: () => lib.topK, set: (v: number) => { lib.topK = Math.max(5, Math.min(200, Math.round(Number(v) || 30))) } })

function run() { ui.openLibrary(); void lib.start() }
async function addSeeds() { await lib.addSeeds(seedText.value); if (!lib.seedErrors.length) seedText.value = '' }
function openNote(path: string) { const n = vault.byPath(path); if (n) ui.openNote(n.path, noteName(n.path)) }
const goalEvidence = (i: number) => lib.goals?.evidence[i] || null
const callsBySource = computed(() => SourceName.options.map(s => ({ s, calls: lib.calls.filter(c => c.source === s) })).filter(x => x.calls.length))
const stageCls = (st: string) => st === 'done' ? 'done' : st === 'start' ? 'live' : st === 'error' ? 'err' : st === 'skipped' ? 'skip' : 'pend'
</script>

<template>
  <div class="side">
    <section class="block">
      <h4>Library <small>the whole vault is one research topic</small><span v-if="modeLabel" class="mode" :class="lib.mode">{{ modeLabel }}</span></h4>
      <p class="muted small">An agent reads all {{ vault.notes.length }} notes, derives goals, searches every source, labels and scores each paper with evidence, and returns the best {{ lib.topK }}.</p>
    </section>

    <details class="block seeds">
      <summary><b>Add seed papers</b> <small>{{ seedCount }} seed notes in the vault</small></summary>
      <textarea v-model="seedText" class="qbox mono" rows="4" spellcheck="false" placeholder="One DOI, PMID, arXiv or OpenAlex id per line" :disabled="lib.seedBusy" />
      <div class="runrow">
        <button class="btn" type="button" :disabled="lib.seedBusy || !seedText.trim()" @click="addSeeds">{{ lib.seedBusy ? 'Resolving…' : 'Add to Seeds/' }}</button>
        <small class="muted">Their ids become known papers for the next build.</small>
      </div>
      <ul v-if="lib.seedAdded.length || lib.seedErrors.length" class="seedres">
        <li v-for="p in lib.seedAdded" :key="p"><button type="button" class="lnk" @click="openNote(p)">{{ noteName(p) }}</button></li>
        <li v-for="(e, i) in lib.seedErrors" :key="'e' + i" class="bad">{{ e.input ? e.input + ': ' : '' }}{{ e.message }}</li>
      </ul>
    </details>

    <section class="block">
      <h4><label for="topk">Papers to return</label></h4>
      <div class="pair">
        <input id="topk" v-model.number="topKModel" type="range" min="5" max="200" step="1" aria-label="Papers to return (slider)" />
        <input v-model.number="topKModel" type="number" min="5" max="200" class="num" aria-label="Papers to return" />
      </div>
      <h4><label for="thr">Threshold <small>total score needed to join the citation graph</small></label></h4>
      <div class="pair">
        <input id="thr" v-model.number="lib.threshold" type="range" min="0" max="1" step="0.01" />
        <b class="num ro">{{ f2(lib.threshold) }}</b>
      </div>

      <h4>Sources</h4>
      <div class="srcs">
        <button v-for="s in SourceName.options" :key="s" type="button" class="src" :aria-pressed="lib.sources.includes(s)" :disabled="running" @click="toggleSource(s)"
                :title="s === 'scholar' ? 'Google Scholar runs only via SerpAPI when SERPAPI_KEY is set (never scraped)' : 'Search ' + SOURCE_LABEL[s]">
          {{ SOURCE_LABEL[s] }}<small v-if="s === 'scholar' && lib.scholarSkipped" class="need">needs SERPAPI_KEY</small>
        </button>
      </div>

      <h4>Weights <small>sum {{ f2(weightSum(lib.weights)) }} · normalized when scoring</small>
        <button type="button" class="reset" @click="lib.resetWeights()">reset to defaults</button></h4>
      <div class="weights">
        <div v-for="k in COMPONENT_KEYS" :key="k" class="w" :class="{ low: k === 'llm' }">
          <label :for="'w-' + k"><i :style="{ background: COMPONENT_META[k].color }" />{{ COMPONENT_META[k].label }}</label>
          <input :id="'w-' + k" v-model.number="lib.weights[k]" type="range" min="0" max="0.5" step="0.01" />
          <b class="num ro" :title="`raw weight ${f2(lib.weights[k])} · share of the total ${Math.round(share(k) * 100)}%`">{{ f2(lib.weights[k]) }}</b>
        </div>
        <p class="small" :class="llmLowest ? 'muted' : 'warnline'">{{ llmLowest ? 'LLM read has the lowest weight, by design.' : 'The LLM read is weighted above another signal; the spec keeps it lowest.' }}</p>
      </div>
      <p v-if="lib.reweighted && lib.status === 'done'" class="notice small">Scores re-computed in the browser with your weights and threshold (same rule as the server). Run again to search with them.</p>

      <div class="runrow">
        <button class="btn primary" type="button" :class="{ busy: running }" :disabled="running || !vault.notes.length" @click="run">
          {{ running ? 'Building library…' : 'Build library from vault' }}
        </button>
        <button v-if="lib.status === 'done' || lib.papers.length" class="btn" type="button" @click="ui.openLibrary()">Open results</button>
      </div>
      <p v-if="lib.notice" class="notice small">{{ lib.notice }}</p>
      <div v-if="lib.status === 'error'" class="errbox" role="alert"><b>Library build failed.</b> {{ lib.error }} <button class="btn" type="button" @click="run">Try again</button></div>
    </section>

    <section v-if="lib.status !== 'idle'" class="block">
      <h4>Steps <small v-if="lib.ms != null">{{ (lib.ms / 1000).toFixed(1) }} s</small></h4>
      <div class="steps">
        <span v-for="st in lib.stages" :key="st.name" class="step" :class="stageCls(st.status)" :title="st.message || st.status">
          <i />{{ LIB_STAGE_LABEL[st.name] }}<b v-if="st.count != null">{{ st.count.toLocaleString('en') }}</b>
        </span>
      </div>
    </section>

    <section v-if="lib.status === 'running' && !lib.goals" class="block"><div class="skel" /><div class="skel" /></section>

    <section v-if="lib.goals" class="block card">
      <h4>Goals <small>{{ lib.goals.model ? 'planner ' + lib.goals.model : 'no planner model (mock / fallback)' }}</small></h4>
      <p class="topic">{{ lib.goals.topic }}</p>
      <p class="q">{{ lib.goals.question }}</p>
      <ol class="goals">
        <li v-for="(g, i) in lib.goals.goals" :key="i">
          {{ g }}
          <template v-if="goalEvidence(i)">
            <blockquote>“{{ goalEvidence(i)!.quote }}”</blockquote>
            <button type="button" class="lnk" @click="openNote(goalEvidence(i)!.notePath)">{{ goalEvidence(i)!.notePath }}</button>
          </template>
          <small v-else class="muted"> · no verified quote from the notes</small>
        </li>
      </ol>
      <h4>Subtopics</h4>
      <ul class="subs"><li v-for="s in lib.goals.subtopics" :key="s.name"><b>{{ s.name }}</b> <code>{{ s.query }}</code></li></ul>
      <h4>Keywords</h4>
      <div class="kw"><span v-for="k in lib.goals.keywords" :key="k">{{ k }}</span></div>
      <h4>Known papers in the vault <small>{{ lib.goals.knownPapers.length }}</small></h4>
      <p v-if="!lib.goals.knownPapers.length" class="muted small">None: add seed papers above so the graph component can link to them.</p>
      <div v-else class="kw mono"><span v-for="k in lib.goals.knownPapers" :key="k">{{ k }}</span></div>
    </section>

    <section v-if="lib.calls.length" class="block">
      <h4>Sources <small>{{ lib.calls.length }} calls</small></h4>
      <table class="calls">
        <thead><tr><th>source</th><th>query</th><th>n</th><th>ms</th></tr></thead>
        <tbody>
          <template v-for="g in callsBySource" :key="g.s">
            <tr v-for="(c, i) in g.calls" :key="g.s + i" :class="{ bad: c.error }">
              <td>{{ i === 0 ? SOURCE_LABEL[c.source] : '' }}</td>
              <td class="qry" :title="c.query">{{ c.query }}<small v-if="c.error" class="err">{{ c.error }}</small></td>
              <td class="n">{{ c.count }}</td><td class="n">{{ c.ms }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>

    <section v-if="lib.top.length" class="block">
      <h4>Top papers <small>{{ lib.top.length }} of {{ lib.total.toLocaleString('en') }} scored · {{ lib.passedTop.length }} passed</small></h4>
      <button v-for="p in lib.top.slice(0, 8)" :key="p.paper.id" type="button" class="mini" @click="ui.openLibPaper(p.paper.id, shortTitle(p.paper))">
        <span class="rk">#{{ p.rank }}</span><span class="tt">{{ p.paper.title }}</span>
        <ScoreBar :paper="p" :threshold="lib.threshold" />
      </button>
      <button type="button" class="more" @click="ui.openLibrary()">All {{ lib.top.length }} with filters and evidence →</button>
    </section>
    <section v-else-if="lib.status === 'idle'" class="empty">No library yet. Set the controls and press <b>Build library from vault</b>. Seed papers are optional; they let the graph component link results to your own papers.</section>
  </div>
</template>

<style scoped>
.side{padding:12px;display:flex;flex-direction:column;gap:12px;overflow:auto;height:100%;min-height:0;contain:size;background:var(--surface);color:var(--fg)}
.block{display:flex;flex-direction:column;gap:6px}
h4{margin:4px 0 0;font:500 10.5px/1.3 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
h4 small{letter-spacing:0;text-transform:none;font-size:10.5px;margin-left:4px}
.mode{margin-left:auto;letter-spacing:0;text-transform:none;border:1px solid var(--warn);color:var(--warn);border-radius:99px;padding:1px 6px}
.mode.live{border-color:var(--ok);color:var(--ok)}
.small{font-size:11.5px;margin:0}
.muted{color:var(--muted)}
.qbox{font:11.5px/1.4 var(--font-mono);border:1px solid var(--line);border-radius:6px;padding:8px 10px;background:var(--surface-2);color:var(--fg);resize:vertical;width:100%}
.seeds summary{cursor:pointer;font-size:12.5px}
.seeds summary small{color:var(--muted);font-weight:400}
.seeds[open]{gap:6px}
.seedres{margin:0;padding-left:16px;font-size:11.5px}
.seedres .bad{color:var(--crit)}
.pair{display:flex;align-items:center;gap:8px}
.pair input[type=range],.w input{flex:1;accent-color:var(--cand);min-width:0}
.num{width:58px;font:600 12px var(--font-mono);font-variant-numeric:tabular-nums;border:1px solid var(--line);border-radius:5px;padding:3px 5px;background:var(--surface-2);color:var(--fg)}
.num.ro{border-color:transparent;background:transparent;text-align:right;width:40px;cursor:help}
.srcs{display:flex;flex-wrap:wrap;gap:4px}
.src{font:500 11.5px var(--font-body);border:1px solid var(--line-2);border-radius:99px;padding:4px 9px;background:var(--surface);color:var(--muted);cursor:pointer;display:inline-flex;gap:5px;align-items:center}
.src[aria-pressed="true"]{border-color:var(--seed);color:var(--fg);background:var(--seed-soft)}
.src:disabled{opacity:.6;cursor:default}
.need{font:500 9.5px var(--font-mono);color:var(--warn)}
.reset{margin-left:auto;border:0;background:transparent;color:var(--seed);font:500 11px var(--font-body);text-transform:none;letter-spacing:0;cursor:pointer;padding:0}
.weights{display:flex;flex-direction:column;gap:2px}
.w{display:grid;grid-template-columns:150px 1fr 40px;align-items:center;gap:6px;font-size:12px}
.w label{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w label i{width:8px;height:8px;border-radius:2px;flex:none}
.w.low label{color:var(--muted)}
.warnline{color:var(--warn)}
.runrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{font:600 12.5px/1 var(--font-body);border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:8px 12px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.btn.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.btn:disabled{opacity:.55;cursor:default}
.btn.primary.busy{opacity:1;cursor:progress}
.notice{color:var(--warn);border:1px dashed var(--warn);border-radius:6px;padding:6px 8px}
.errbox{display:flex;flex-direction:column;gap:6px;align-items:flex-start;font-size:12.5px;border:1px solid var(--crit);border-radius:7px;padding:8px 10px;background:color-mix(in srgb,var(--crit) 8%,var(--surface))}
.steps{display:flex;flex-wrap:wrap;gap:4px}
.step{display:inline-flex;gap:5px;align-items:center;white-space:nowrap;font:500 10.5px/1 var(--font-mono);padding:5px 7px;border-radius:99px;border:1px solid var(--line-2);color:var(--muted);background:var(--surface);cursor:help}
.step i{width:6px;height:6px;border-radius:50%;background:var(--line-2)}
.step b{color:var(--fg)}
.step.done{color:var(--fg);border-color:var(--seed)}
.step.done i{background:var(--seed)}
.step.live{color:var(--fg);border-color:var(--cand)}
.step.live i{background:var(--cand);animation:blink 1s ease-in-out infinite}
.step.pend{border-style:dashed}
.step.skip{opacity:.7}
.step.err{border-color:var(--crit);color:var(--crit)}
@keyframes blink{50%{opacity:.3}}
.skel{height:48px;border-radius:7px;border:1px solid var(--line);background:linear-gradient(90deg,var(--surface-2) 0%,var(--surface) 50%,var(--surface-2) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.card{border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--surface-2)}
.topic{margin:0;font:600 16px/1.3 var(--font-display)}
.q{margin:0;font-size:12.5px;color:var(--muted)}
.goals{margin:0;padding-left:18px;font-size:12.5px;display:flex;flex-direction:column;gap:6px}
blockquote{margin:3px 0 1px;padding:2px 0 2px 8px;border-left:2px solid var(--seed);color:var(--muted);font-size:11.5px;font-style:italic}
.lnk{border:0;background:transparent;padding:0;color:var(--seed);font:500 11px var(--font-mono);cursor:pointer;text-align:left;text-decoration:underline}
.subs{margin:0;padding-left:16px;font-size:12px;display:flex;flex-direction:column;gap:2px}
.subs code{font:10.5px var(--font-mono);color:var(--muted)}
.kw{display:flex;flex-wrap:wrap;gap:3px}
.kw span{font:500 10.5px/1 var(--font-mono);padding:3px 5px;border-radius:4px;border:1px solid var(--line-2);background:var(--surface)}
.calls{width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed}
.calls th{font:500 10px var(--font-mono);text-transform:uppercase;color:var(--muted);text-align:left;border-bottom:1px solid var(--line);padding:2px 3px}
.calls th:nth-child(1){width:70px}.calls th:nth-child(3),.calls th:nth-child(4){width:42px;text-align:right}
.calls td{padding:2px 3px;border-bottom:1px solid var(--line);vertical-align:top}
.calls .qry{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono);font-size:10.5px}
.calls .err{display:block;color:var(--warn);white-space:normal}
.calls .n{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.mini{display:grid;grid-template-columns:auto 1fr;gap:2px 6px;text-align:left;border:1px solid var(--line);border-radius:6px;padding:6px 8px;background:var(--surface);color:var(--fg);cursor:pointer;font:inherit}
.mini:hover{border-color:var(--line-2)}
.mini .rk{font:600 11px var(--font-mono);color:var(--muted)}
.mini .tt{font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mini .sb{grid-column:1 / -1}
.more{border:0;background:transparent;color:var(--seed);font:500 11.5px var(--font-mono);cursor:pointer;text-align:left;padding:2px 0}
.empty{font-size:12.5px;color:var(--muted);border:1px dashed var(--line-2);border-radius:7px;padding:10px}
.mono{font-family:var(--font-mono)}
@media (prefers-reduced-motion: reduce){.skel,.step.live i{animation:none}}
</style>

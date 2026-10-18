<script setup lang="ts">
// Library sidebar (lanes L3, U1, W2; D-20/D-23/D-33/D-35/D-36): research question switcher, question box + Build (F-51),
// seeds of the current question (F-62), History (F-61), pass rule (F-49), controls, stage trail, goals, sources, top results.
import { computed, ref, watch } from 'vue'
import { SourceName } from '@shared/library'
import { useLibrary, lastOpened, LIB_SETTINGS_KEY, LIB_STAGE_LABEL, SOURCE_LABEL, UI_SOURCES } from '../stores/library'
import { useVault } from '../stores/vault'
import { useUi } from '../stores/ui'
import { noteName } from '../stores/vault-utils'
import { COMPONENT_KEYS, COMPONENT_META, f2, weightSum, type ComponentKey } from './score'
import { readQuestion, writeQuestion } from './question'
import { shortTitle } from '../discover/literatureNote'
import Verdict from './Verdict.vue'
import PassRule from './PassRule.vue'
import WhyRelevant from './WhyRelevant.vue'
import CountUp from '../discover/CountUp.vue'
import QuestionSwitcher from './questions/QuestionSwitcher.vue'
import SeedPanel from './seeds/SeedPanel.vue'
import HistoryList from './history/HistoryList.vue'

const lib = useLibrary()
const vault = useVault()
const ui = useUi()

const running = computed(() => lib.status === 'running')
const seedsOpen = ref(true)
const historyOpen = ref(true)
const delay = (i: number) => ({ '--i': i })
const cur = computed(() => vault.currentQuestion)
const seedCount = computed(() => cur.value ? vault.seedsIn(cur.value.id).length : 0)
const modeLabel = computed(() => lib.mode === 'mock' ? 'dev mock' : lib.mode === 'demo' ? 'Replay of a recorded real run' : lib.mode === 'live' ? 'live' : '')
const QUESTION_PLACEHOLDER = 'Which single-cell methods help study melanoma immune cells?'

// F-51 / D-33: the question box edits the CURRENT question's Questions/<name>/Question.md (question paragraph only).
const question = ref('')
let touched = false
const syncQuestion = () => { if (!touched) question.value = readQuestion(cur.value ? vault.byPath(cur.value.path)?.content : '') }
watch(() => [vault.ready, cur.value?.path, cur.value ? vault.byPath(cur.value.path)?.content : ''], syncQuestion, { immediate: true })
watch(() => cur.value?.id, () => { touched = false; syncQuestion() })
async function saveQuestion() {
  const q = question.value.trim(); const c = cur.value
  if (!q || !c) return
  const ex = vault.byPath(c.path)
  if (ex && readQuestion(ex.content) !== q) await vault.upsert({ path: ex.path, kind: ex.kind, title: ex.title, paperId: ex.paperId, content: writeQuestion(ex.content, q) })
  touched = false
}
async function build() {
  if (!question.value.trim() || running.value || !cur.value) return
  await saveQuestion()
  ui.openLibrary()
  await lib.start()
}
const onQuestionKey = (e: KeyboardEvent) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void build() } }

// D-35: History of the current question; the last opened library of that question reopens (also after a reload, Q-1).
async function reopenFor(qid: string | null) {
  await lib.loadHistory(qid)
  if (lib.status === 'running' || lib.mode === 'demo' || lib.mode === 'mock') return
  if (lib.libraryId && lib.questionId === qid) return
  const last = lastOpened(qid)
  if (!last || !lib.history.some(h => h.libraryId === last)) { if (lib.questionId !== qid) lib.reset(); return }
  // openStored restores this library's saved pass rule / weights / filters / topK (Q-1); chat history is keyed by libraryId
  if (await lib.openStored(last, qid)) { if (!ui.tabs.some(t => t.ref === 'lib:results')) ui.openLibrary() }
  else if (lib.questionId !== qid) lib.reset()
}
watch(() => [vault.ready, vault.current] as const, ([ready, q]) => { if (ready) void reopenFor(q ?? null) }, { immediate: true })
// Q-1: remember the pass rule, weights, filters and topK per library so a reload restores them.
watch(() => lib.libraryId && lib.status === 'done' ? JSON.stringify({ weights: lib.weights, topPercent: lib.topPercent, threshold: lib.threshold, filters: lib.filters, topK: lib.topK }) : null, v => {
  if (!v || !lib.libraryId || lib.mode !== 'live') return
  try { localStorage.setItem(LIB_SETTINGS_KEY(lib.libraryId), v) } catch { /* storage blocked */ }
})

const toggleSource = (s: SourceName) => {
  const i = lib.sources.indexOf(s)
  if (i >= 0) { if (lib.sources.length > 1) lib.sources.splice(i, 1) } else lib.sources.push(s)
}
const llmLowest = computed(() => COMPONENT_KEYS.filter(k => k !== 'llm').every(k => lib.weights[k] >= lib.weights.llm))
const share = (k: ComponentKey) => { const s = weightSum(lib.weights); return s > 0 ? lib.weights[k] / s : 0 }
const topKModel = computed({ get: () => lib.topK, set: (v: number) => { lib.topK = Math.max(5, Math.min(200, Math.round(Number(v) || 30))) } })

function openNote(path: string) { const n = vault.byPath(path); if (n) ui.openNote(n.path, noteName(n.path)) }
const goalEvidence = (i: number) => lib.goals?.evidence[i] || null
// J-4: the Tavily row stays visible even before (or without) Tavily calls.
const callsBySource = computed(() => SourceName.options.map(s => ({ s, calls: lib.calls.filter(c => c.source === s) })).filter(x => x.calls.length || x.s === 'tavily'))
const tavilyFound = computed(() => lib.papers.filter(p => p.hits.some(h => h.source === 'tavily')).length)
const stageCls = (st: string) => st === 'done' ? 'done' : st === 'start' ? 'live' : st === 'error' ? 'err' : st === 'skipped' ? 'skip' : 'pend'
</script>

<template>
  <div class="side">
    <header class="block rv" :style="delay(0)">
      <div class="eyebrow">Research library<span v-if="modeLabel" class="mode" :class="lib.mode">{{ modeLabel }}</span></div>
      <h2 class="title">Library</h2>
      <p class="prose">One research question is one folder. An agent reads only that folder ({{ cur ? vault.notesIn(cur.id).length : 0 }} notes, {{ seedCount }} seeds), derives goals, searches every source, labels and scores each paper with evidence, and returns the best {{ lib.topK }}.</p>
    </header>

    <QuestionSwitcher class="rv" :style="delay(1)" />

    <template v-if="cur">
    <section class="block rv" :style="delay(1)">
      <div class="eyebrow"><label for="rq">Research question</label><span class="sub">saved to {{ cur.path }}</span></div>
      <textarea id="rq" v-model="question" class="qbox ask" rows="3" :placeholder="QUESTION_PLACEHOLDER" :disabled="running" @input="touched = true" @blur="saveQuestion" @keydown="onQuestionKey" />
      <div class="runrow">
        <button class="pill primary" type="button" :class="{ busy: running }" :disabled="running || !question.trim()" @click="build">
          <i v-if="running" class="dot live" />{{ running ? 'Building library…' : 'Build library' }}
        </button>
        <button v-if="lib.status === 'done' || lib.papers.length" class="pill" type="button" @click="ui.openLibrary()">Open results</button>
      </div>
      <p v-if="!seedCount" class="small hint">No seed papers for this question yet. Add some below so results link to papers you trust.</p>
      <p v-if="lib.notice" class="notice small">{{ lib.notice }}</p>
      <div v-if="lib.status === 'error'" class="errbox" role="alert"><b>Library build failed.</b> {{ lib.error }} <button class="pill" type="button" @click="build">Retry</button></div>
    </section>

    <section class="block rv" :style="delay(1)">
      <button type="button" class="eyebrow tog" :aria-expanded="seedsOpen" @click="seedsOpen = !seedsOpen">
        <span class="plus" :class="{ open: seedsOpen }" aria-hidden="true" />Seed papers<span class="sub">{{ seedCount }} in {{ cur.name }}/seeds</span>
      </button>
      <div class="more" :class="{ open: seedsOpen }"><div class="more-in"><div class="stack">
        <SeedPanel :question="cur.id" />
      </div></div></div>
    </section>

    <section class="block rv" :style="delay(2)">
      <button type="button" class="eyebrow tog" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">
        <span class="plus" :class="{ open: historyOpen }" aria-hidden="true" />History<span class="sub">{{ lib.history.length }} saved librar{{ lib.history.length === 1 ? 'y' : 'ies' }} for this question</span>
      </button>
      <div class="more" :class="{ open: historyOpen }"><div class="more-in"><div class="stack">
        <HistoryList :question-id="cur.id" />
      </div></div></div>
    </section>
    </template>

    <template v-if="cur">

    <section class="block rv" :style="delay(2)">
      <div class="eyebrow"><label for="topk">Papers to return</label></div>
      <div class="pair">
        <input id="topk" v-model.number="topKModel" type="range" min="5" max="200" step="1" aria-label="Papers to return (slider)" />
        <input v-model.number="topKModel" type="number" min="5" max="200" class="num" aria-label="Papers to return" />
      </div>
      <div class="eyebrow gap">Pass rule<span class="sub">passed papers join the citation graph</span></div>
      <PassRule dense />
    </section>

    <section class="block rv" :style="delay(3)">
      <div class="eyebrow">Sources</div>
      <div class="chips">
        <button v-for="s in UI_SOURCES" :key="s" type="button" class="chip" :aria-pressed="lib.sources.includes(s)" :disabled="running" @click="toggleSource(s)" :title="'Search ' + SOURCE_LABEL[s]">
          <span class="roll"><span>{{ SOURCE_LABEL[s] }}</span><span aria-hidden="true">{{ SOURCE_LABEL[s] }}</span></span>
        </button>
      </div>
    </section>

    <section class="block rv" :style="delay(4)">
      <div class="eyebrow">Weights<span class="sub">sum {{ f2(weightSum(lib.weights)) }} · normalized when scoring</span>
        <button type="button" class="reset" @click="lib.resetWeights()">reset to defaults</button></div>
      <div class="weights">
        <div v-for="k in COMPONENT_KEYS" :key="k" class="w" :class="{ low: k === 'llm' }">
          <label :for="'w-' + k">{{ COMPONENT_META[k].label }}</label>
          <input :id="'w-' + k" v-model.number="lib.weights[k]" type="range" min="0" max="0.5" step="0.01" />
          <b class="num ro" :title="`raw weight ${f2(lib.weights[k])} · share of the total ${Math.round(share(k) * 100)}%`">{{ f2(lib.weights[k]) }}</b>
        </div>
        <p class="small" :class="llmLowest ? 'faint' : 'warnline'">{{ llmLowest ? 'LLM read has the lowest weight, by design.' : 'The LLM read is weighted above another signal; the spec keeps it lowest.' }}</p>
      </div>
      <p v-if="lib.reweighted && lib.status === 'done'" class="notice small">Scores re-computed in the browser with your weights (same rule as the server). Build again to search with them.</p>
    </section>

    <section v-if="lib.status !== 'idle'" class="block rv" :style="delay(6)">
      <div class="eyebrow">Steps<span v-if="lib.ms != null" class="sub num-m">{{ (lib.ms / 1000).toFixed(1) }} s</span></div>
      <div class="steps">
        <span v-for="st in lib.stages" :key="st.name" class="step" :class="stageCls(st.status)" :title="st.message || st.status">
          <i class="dot" />{{ LIB_STAGE_LABEL[st.name] }}<b v-if="st.count != null">{{ st.count.toLocaleString('en') }}</b>
        </span>
      </div>
    </section>

    <section v-if="lib.status === 'running' && !lib.goals" class="block rv" :style="delay(7)"><div class="skel" /><div class="skel" /></section>

    <section v-if="lib.goals" class="block rv" :style="delay(7)">
      <div class="eyebrow">Goals<span class="sub">{{ lib.goals.model ? 'planner ' + lib.goals.model : 'no planner model (mock / fallback)' }}</span></div>
      <p class="topic">{{ lib.goals.topic }}</p>
      <p class="prose">{{ lib.goals.question }}</p>
      <ol class="goals">
        <li v-for="(g, i) in lib.goals.goals" :key="i">
          {{ g }}
          <template v-if="goalEvidence(i)">
            <blockquote>“{{ goalEvidence(i)!.quote }}”</blockquote>
            <button type="button" class="lnk" @click="openNote(goalEvidence(i)!.notePath)">{{ goalEvidence(i)!.notePath }}</button>
          </template>
          <small v-else class="faint"> · no verified quote from the notes</small>
        </li>
      </ol>
    </section>

    <section v-if="lib.goals" class="block rv" :style="delay(8)">
      <div class="eyebrow">Subtopics</div>
      <ul class="subs"><li v-for="s in lib.goals.subtopics" :key="s.name"><b>{{ s.name }}</b> <code>{{ s.query }}</code></li></ul>
    </section>

    <section v-if="lib.goals" class="block rv" :style="delay(9)">
      <div class="eyebrow">Keywords</div>
      <div class="chips"><span v-for="k in lib.goals.keywords" :key="k" class="chip static">{{ k }}</span></div>
    </section>

    <section v-if="lib.goals" class="block rv" :style="delay(10)">
      <div class="eyebrow">Known papers in the vault<span class="sub">{{ lib.goals.knownPapers.length }}</span></div>
      <p v-if="!lib.goals.knownPapers.length" class="faint small">None: add seed papers above so the graph component can link to them.</p>
      <div v-else class="chips mono"><span v-for="k in lib.goals.knownPapers" :key="k" class="chip static">{{ k }}</span></div>
    </section>

    <section v-if="lib.calls.length" class="block rv" :style="delay(11)">
      <div class="eyebrow">Source calls<span class="sub">{{ lib.calls.length }} calls · Tavily {{ lib.calls.filter(c => c.source === 'tavily').length }} · {{ tavilyFound }} papers found via Tavily</span></div>
      <table class="calls">
        <thead><tr><th>source</th><th>query</th><th>n</th><th>ms</th></tr></thead>
        <tbody>
          <template v-for="g in callsBySource" :key="g.s">
            <tr v-if="!g.calls.length"><td>{{ SOURCE_LABEL[g.s] }}</td><td class="qry faint">{{ lib.sources.includes(g.s) ? (running ? 'waiting for web search…' : 'no calls in this build') : 'source switched off' }}</td><td class="n">0</td><td class="n" /></tr>
            <tr v-for="(c, i) in g.calls" :key="g.s + i" :class="{ bad: c.error }">
              <td>{{ i === 0 ? SOURCE_LABEL[c.source] : '' }}</td>
              <td class="qry" :title="c.query">{{ c.query }}<small v-if="c.error" class="err">{{ c.error }}</small></td>
              <td class="n">{{ c.count }}</td><td class="n">{{ c.ms }}</td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>

    <section v-if="lib.top.length" class="block rv" :style="delay(12)">
      <div class="eyebrow">Top papers<span class="sub"><CountUp :value="lib.passedCount" /> of <CountUp :value="lib.eligibleCount" /> pass · showing <CountUp :value="Math.min(8, lib.top.length)" /></span></div>
      <button v-for="(p, i) in lib.top.slice(0, 8)" :key="p.paper.id" type="button" class="card rv" :style="delay(13 + i)" @click="ui.openLibPaper(p.paper.id, shortTitle(p.paper))">
        <span class="rk">#{{ p.rank }}</span><span class="tt">{{ p.paper.title }}</span>
        <Verdict :paper="p" compact :move="lib.rankMove(p.paper.id, p.rank)" />
        <WhyRelevant :paper="p" compact />
      </button>
      <button type="button" class="pill ghost" @click="ui.openLibrary()">All {{ lib.top.length }} with filters and evidence →</button>
    </section>
    <section v-else-if="lib.status === 'idle'" class="empty rv" :style="delay(7)">No library yet. Type your research question above and press <b>Build library</b>. Seed papers are optional; they let the graph component link results to your own papers.</section>
    </template>
  </div>
</template>

<style scoped>
.side{padding:20px 18px 40px;display:flex;flex-direction:column;gap:0;overflow-y:auto;overflow-x:hidden;height:100%;min-height:0;contain:size;background:var(--paper-2);color:var(--ink);font-family:var(--font-sans);-webkit-font-smoothing:antialiased}
.rv{animation:revealFade .66s var(--reveal) both;animation-delay:calc(var(--i,0) * 52ms)}
@keyframes revealFade{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes ruleGrow{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes titleReveal{from{opacity:0;transform:translateY(14px);letter-spacing:-.06em}to{opacity:1;transform:none;letter-spacing:-.035em}}
.block{position:relative;display:flex;flex-direction:column;gap:10px;padding:18px 0 4px;min-width:0}
.block::before{content:"";position:absolute;top:0;left:0;right:0;height:1px;background:var(--hair);transform-origin:left;animation:ruleGrow .9s var(--reveal) both;animation-delay:calc(var(--i,0) * 52ms + 120ms)}
.block:first-child{padding-top:0}.block:first-child::before{display:none}
.eyebrow{font:700 .6rem/1.3 var(--font-sans);letter-spacing:.2em;text-transform:uppercase;color:var(--ink-46);display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0}
.eyebrow.gap{margin-top:8px}
.eyebrow .sub{letter-spacing:.02em;text-transform:none;font-weight:500;font-size:.68rem;color:var(--ink-38)}
.eyebrow .sub .cu{color:var(--ink-64)}
.num-m{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.title{margin:0;font:700 2rem/1 var(--font-sans);letter-spacing:-.035em;color:var(--ink);animation:titleReveal .8s var(--reveal) both}
.prose{margin:0;font-size:.8rem;line-height:1.55;color:var(--ink-64)}
.small{font-size:.72rem;margin:0}
.faint{color:var(--ink-46)}
.mode{margin-left:auto;letter-spacing:.02em;text-transform:none;font-weight:600;border:1px solid var(--ink-26);color:var(--ink-64);border-radius:99px;padding:2px 8px}
.mode.live{border-color:var(--accent);color:var(--accent)}
.tog{background:none;border:0;padding:0;cursor:pointer;text-align:left;font-family:inherit;width:100%;align-items:center;color:var(--ink-64)}
.tog:hover{color:var(--ink)}
.plus{width:10px;height:10px;position:relative;flex:none;align-self:center}
.plus::before,.plus::after{content:"";position:absolute;left:0;top:4.5px;width:10px;height:1px;background:currentColor;transition:transform .35s var(--drawer)}
.plus::after{transform:rotate(90deg)}.plus.open::after{transform:rotate(0)}
.more{display:grid;grid-template-rows:0fr;transition:grid-template-rows .45s var(--drawer)}
.more.open{grid-template-rows:1fr}
.more-in{overflow:hidden;min-height:0}
.stack{display:flex;flex-direction:column;gap:8px;padding-top:4px}
.qbox{font:.7rem/1.45 var(--font-mono);border:1px solid var(--ink-26);border-radius:10px;padding:9px 11px;background:var(--paper);color:var(--ink);resize:vertical;width:100%}
.qbox:focus{outline:none;border-color:var(--ink-64)}
.qbox.ask{font:500 .86rem/1.45 var(--font-sans);border-radius:12px;padding:10px 12px}
.qbox.ask::placeholder{color:var(--ink-38)}
.hint{color:var(--ink-64)}
.lnk.inl{font:600 .72rem var(--font-sans);color:var(--ink);word-break:normal}
.seedres{margin:0;padding-left:16px;font-size:.72rem}
.seedres .bad{color:var(--accent)}
.pair{display:flex;align-items:center;gap:10px}
input[type=range]{flex:1;min-width:0;accent-color:var(--ink);height:14px;margin:0}
.num{width:58px;font:600 .72rem var(--font-mono);font-variant-numeric:tabular-nums;border:1px solid var(--ink-26);border-radius:99px;padding:4px 8px;background:transparent;color:var(--ink);text-align:right}
.num.ro{border-color:transparent;width:36px;padding:0;cursor:help}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font:500 .72rem/1 var(--font-sans);border:1px solid var(--ink-26);border-radius:99px;padding:6px 11px;background:transparent;color:var(--ink-80);cursor:pointer;display:inline-flex;gap:6px;align-items:center;transition:border-color .2s,background .2s,color .2s}
.chip:hover:not(:disabled){border-color:var(--ink-64)}
.chip[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--paper)}
.chip:disabled{opacity:.55;cursor:default}
.chip[aria-pressed="true"]:disabled{opacity:1;background:var(--ink-16);border-color:var(--ink-26);color:var(--ink-80)}
.chip.static{cursor:default;padding:5px 10px;font-size:.68rem;color:var(--ink-80)}
.chips.mono .chip{font-family:var(--font-mono);font-size:.64rem}
.roll{display:inline-grid;overflow:hidden;line-height:1.15}
.roll>span{grid-area:1/1;transition:transform .4s var(--reveal)}
.roll>span:last-child{transform:translateY(110%)}
.chip:hover:not(:disabled) .roll>span:first-child{transform:translateY(-110%)}
.chip:hover:not(:disabled) .roll>span:last-child{transform:none}
.need{font:500 .56rem var(--font-mono);opacity:.8}
.reset{margin-left:auto;border:0;background:transparent;color:var(--ink-64);font:500 .68rem var(--font-sans);text-transform:none;letter-spacing:0;cursor:pointer;padding:0;text-decoration:underline;text-underline-offset:3px}
.reset:hover{color:var(--ink)}
.weights{display:flex;flex-direction:column;gap:4px}
.w{display:grid;grid-template-columns:minmax(0,118px) 1fr 34px;align-items:center;gap:8px;font-size:.72rem;color:var(--ink-80)}
.w label{display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.w label i{width:7px;height:7px;border-radius:50%;flex:none}
.w.low label{color:var(--ink-55)}
.warnline{color:var(--accent)}
.runrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.pill{font:600 .74rem/1 var(--font-sans);border:1px solid var(--ink-26);background:transparent;color:var(--ink);border-radius:99px;padding:10px 16px;cursor:pointer;display:inline-flex;gap:8px;align-items:center;transition:border-color .2s,background .2s,transform .2s var(--reveal)}
.pill:hover:not(:disabled){border-color:var(--ink-64)}
.pill:active:not(:disabled){transform:scale(.97)}
.pill.primary{background:var(--ink);color:var(--paper);border-color:var(--ink)}
.pill.primary:hover:not(:disabled){background:var(--ink-86)}
.pill.ghost{border-color:transparent;padding-left:0;color:var(--ink-64);align-self:flex-start}
.pill.ghost:hover{color:var(--ink)}
.pill:disabled{opacity:.5;cursor:default}
.pill.primary.busy{opacity:1;cursor:progress}
.notice{color:var(--ink-64);border:1px dashed var(--ink-26);border-radius:10px;padding:8px 10px;line-height:1.5}
.errbox{display:flex;flex-direction:column;gap:8px;align-items:flex-start;font-size:.76rem;border:1px solid var(--accent);border-radius:12px;padding:10px 12px;color:var(--ink)}
.dot{width:6px;height:6px;border-radius:50%;background:var(--ink-26);flex:none;display:inline-block}
.dot.live{background:var(--accent);animation:pulse 1.1s ease-in-out infinite}
.steps{display:flex;flex-wrap:wrap;gap:6px}
.step{display:inline-flex;gap:6px;align-items:center;white-space:nowrap;font:500 .66rem/1 var(--font-sans);padding:6px 10px;border-radius:99px;border:1px solid var(--ink-16);color:var(--ink-46);cursor:help}
.step b{font:600 .64rem var(--font-mono);color:var(--ink);font-variant-numeric:tabular-nums}
.step.done{color:var(--ink);border-color:var(--ink-38)}
.step.done .dot{background:var(--ink)}
.step.live{color:var(--ink);border-color:var(--accent)}
.step.live .dot{background:var(--accent);animation:pulse 1.1s ease-in-out infinite}
.step.pend{border-style:dashed}
.step.skip{opacity:.6}
.step.err{border-color:var(--accent);color:var(--accent)}
@keyframes pulse{50%{opacity:.25;transform:scale(.7)}}
.skel{height:48px;border-radius:12px;border:1px solid var(--hair);background:linear-gradient(90deg,var(--ink-8) 0%,transparent 50%,var(--ink-8) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.topic{margin:0;font:700 1.45rem/1.15 var(--font-sans);letter-spacing:-.03em;text-wrap:balance;color:var(--ink)}
.goals{margin:0;padding-left:18px;font-size:.78rem;line-height:1.5;color:var(--ink-86);display:flex;flex-direction:column;gap:10px}
.goals li::marker{color:var(--ink-38);font-weight:700}
blockquote{margin:4px 0 2px;padding:1px 0 1px 10px;border-left:1px solid var(--ink-38);color:var(--ink-55);font-size:.72rem;font-style:italic;line-height:1.5}
.lnk{border:0;background:transparent;padding:0;color:var(--ink-64);font:500 .66rem var(--font-mono);cursor:pointer;text-align:left;text-decoration:underline;text-underline-offset:3px;word-break:break-all}
.lnk:hover{color:var(--ink)}
.subs{margin:0;padding:0;list-style:none;font-size:.76rem;display:flex;flex-direction:column;gap:8px}
.subs li{display:flex;flex-direction:column;gap:2px}
.subs code{font:.64rem/1.4 var(--font-mono);color:var(--ink-46);word-break:break-word}
.calls{width:100%;border-collapse:collapse;font-size:.68rem;table-layout:fixed}
.calls th{font:700 .54rem var(--font-sans);letter-spacing:.16em;text-transform:uppercase;color:var(--ink-46);text-align:left;border-bottom:1px solid var(--hair);padding:4px 4px}
.calls th:nth-child(1){width:64px}.calls th:nth-child(3),.calls th:nth-child(4){width:38px;text-align:right}
.calls td{padding:5px 4px;border-bottom:1px solid var(--ink-8);vertical-align:top;color:var(--ink-80)}
.calls .qry{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono);font-size:.62rem}
.calls .err{display:block;color:var(--accent);white-space:normal}
.calls .n{text-align:right;font-family:var(--font-mono);font-variant-numeric:tabular-nums}
.card{display:grid;grid-template-columns:auto 1fr;gap:8px 10px;align-items:center;text-align:left;border:1px solid var(--hair);border-radius:12px;padding:11px 12px;background:transparent;color:var(--ink);cursor:pointer;font:inherit;transition:border-color .25s,background .25s,transform .35s var(--reveal)}
.card:hover{border-color:var(--ink-46);background:var(--ink-8);transform:translateY(-1px)}
.card .rk{font:700 .6rem var(--font-mono);letter-spacing:.04em;border:1px solid var(--ink-26);border-radius:99px;padding:3px 7px;color:var(--ink-64)}
.card .tt{font-size:.76rem;font-weight:600;line-height:1.3;letter-spacing:-.005em;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.card :deep(.vd),.card :deep(.wr){grid-column:1 / -1}
.empty{font-size:.78rem;line-height:1.55;color:var(--ink-55);border:1px dashed var(--ink-26);border-radius:12px;padding:12px 14px;margin-top:18px}
.empty b{color:var(--ink)}
.mono{font-family:var(--font-mono)}
@media (prefers-reduced-motion: reduce){.rv,.title,.block::before,.dot.live,.step.live .dot,.skel{animation:none}.more,.roll>span,.plus::before,.plus::after{transition:none}}
</style>

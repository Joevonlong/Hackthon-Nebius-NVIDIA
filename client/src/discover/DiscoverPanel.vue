<script setup lang="ts">
// Discover sidebar: question, seeds, preset, run, step trail, lens, lanes. Owner: lane C.
import { computed, onMounted, reactive, ref } from 'vue'
import type { Lane } from '@shared/contracts'
import { PRESETS } from '@shared/config'
import { useDiscovery, sortLane, laneLensSource, STAGE_LABEL, type LensSource } from '../stores/discovery'
import { useUi } from '../stores/ui'
import { isDemo, isMock } from '../api'
import CandidateCard from './CandidateCard.vue'
import CountUp from './CountUp.vue'
import Icon from '../workspace/Icon.vue'

const disc = useDiscovery()
const ui = useUi()

const seedText = computed({
  get: () => disc.seedInputs.join('\n'),
  set: (v: string) => { disc.seedInputs = v.split('\n') },
})
const seedCount = computed(() => disc.seedInputs.filter(s => s.trim().length >= 3).length)
const presetInfo = (k: 'demo' | 'deep') => { const c = PRESETS[k]; return `rerank ${c.rerankTopK}${c.rerankFacets ? '×facets' : ''} · judge ${c.judgeTopK}+${c.judgeExtraK} · embed ${c.embedMaxDocs} · scout ${c.scoutMaxCalls}` }

const lens = computed({ get: () => Math.round(ui.lens * 100), set: (v: number) => { ui.lens = v / 100 } })

const LANES: { key: Lane; sub: string; sw: string }[] = [
  { key: 'Core', sub: '≥ 2 seed links', sw: 'var(--o1)' },
  { key: 'Fresh', sub: '≤ 18 months, < 2 links', sw: 'var(--cand)' },
  { key: 'Linked', sub: '1 seed link', sw: 'var(--o2)' },
  { key: 'Bridges', sub: 'no citation link', sw: 'var(--o3)' },
]
const PAGE = 6
const shown = reactive<Record<string, number>>({})
const laneItems = (lane: Lane) => sortLane(disc.inLane(lane), ui.lens)
const visible = (lane: Lane) => laneItems(lane).slice(0, shown[lane] ?? PAGE)
const countOf = (lane: string) => disc.counts[lane] ?? disc.inLane(lane as Lane).length
const fmt = (n: number) => n.toLocaleString('en')

const running = computed(() => disc.status === 'running')
const haveCands = computed(() => disc.candidates.length > 0)
const retracted = computed(() => disc.inLane('Retracted'))
const anyJudged = computed(() => disc.judgedCount > 0)
const LENS_LABEL: Record<LensSource, string> = { judge: 'judge facets', embed: 'embedding facets', keywords: 'title keywords (judge pending)' }
const lensSrc = computed<LensSource>(() => anyJudged.value ? 'judge' : disc.candidates.some(c => c.features.eFacets) ? 'embed' : 'keywords')
const laneSrc = (lane: Lane) => laneLensSource(disc.inLane(lane))

// AI stages need TOKEN_FACTORY_API_KEY on the server; /api/health says whether it is set.
const AI_STAGES = new Set(['r4', 'scout', 'embed', 'rerank', 'judge', 'verify'])
const aiKey = ref<boolean | null>(null)
onMounted(async () => {
  try { const h = await (await fetch('/api/health')).json() as { keys?: { tokenFactory?: boolean } }; aiKey.value = !!h?.keys?.tokenFactory }
  catch { aiKey.value = null }
})
const aiSkipped = computed(() => disc.stages.filter(s => AI_STAGES.has(s.name) && s.status === 'skipped'))
const aiSkippedNames = computed(() => aiSkipped.value.map(st => STAGE_LABEL[st.name]).join(', '))
const aiSkippedWhy = computed(() => aiSkipped.value.map(st => STAGE_LABEL[st.name] + (st.message ? ' (' + st.message + ')' : '')).join(', '))
const routeCounts = computed(() => disc.stages.filter(s => s.name === 'r1' || s.name === 'r2' || s.name === 'r3'))
const traceOpen = ref(false)
const modeLabel = computed(() => disc.mode === 'mock' || (!disc.mode && isMock()) ? 'dev mock' : disc.mode === 'demo' || (!disc.mode && isDemo()) ? 'demo replay' : disc.mode === 'live' ? 'live' : '')
const fresh = computed(() => disc.inLane('Fresh').length === 0)
const r45ran = computed(() => disc.stages.some(s => (s.name === 'r4' || s.name === 'scout') && s.status === 'done' && (s.count ?? 0) > 0))

function run() { void disc.start() }
</script>

<template>
  <div class="side">
    <section v-if="disc.status === 'idle'" class="proof" aria-label="Why PubMed alone is not enough">
      <b>PubMed:</b><span><b>15</b> results for this question</span><i>·</i><span><b>999</b> for keywords</span>
    </section>
    <section class="block">
      <h4><label for="q">Question</label></h4>
      <textarea id="q" v-model="disc.question" class="qbox" rows="2" :disabled="running" />
      <h4><label for="seeds">Seeds <small>{{ seedCount }} · one DOI, PMID or OpenAlex id per line</small></label></h4>
      <textarea id="seeds" v-model="seedText" class="qbox mono" rows="5" :disabled="running" spellcheck="false" />
      <div v-if="disc.seeds.length" class="chips">
        <span v-for="s in disc.seeds" :key="s.n" class="chip" :title="s.title">{{ s.label }} {{ s.shortName }}</span>
      </div>
      <div class="presets" role="radiogroup" aria-label="Run size">
        <button v-for="k in (['demo', 'deep'] as const)" :key="k" type="button" role="radio" :aria-checked="disc.preset === k" class="preset" :disabled="running" @click="disc.preset = k">
          <b>{{ k }}</b><small>{{ presetInfo(k) }}</small>
        </button>
      </div>
      <div class="runrow">
        <button class="btn primary" type="button" :disabled="running" @click="run">{{ running ? 'Running…' : disc.status === 'idle' ? 'Run discovery' : 'Run again' }}</button>
        <button v-if="disc.kept.length" class="btn" type="button" :disabled="running" :title="'Adds ' + disc.kept.length + ' kept papers as seeds'" @click="disc.growAgain()">Grow again · +{{ disc.kept.length }} seeds</button>
        <button class="btn" :class="running ? 'live' : 'ghost'" type="button" :aria-pressed="ui.activeTab?.kind === 'graph'" :title="running ? 'Watch candidates grow out of the seeds' : 'Open the graph view'" @click="ui.openGraph()"><Icon name="graph" />Graph</button>
        <span v-if="modeLabel" class="muted small">{{ modeLabel }}</span>
      </div>
      <p v-if="disc.notice" class="notice">{{ disc.notice }}</p>
    </section>

    <section v-if="disc.status !== 'idle'" class="block">
      <h4>Steps <small v-if="disc.ms">{{ (disc.ms / 1000).toFixed(1) }} s</small></h4>
      <div class="steps">
        <span v-for="s in disc.stages" :key="s.name" class="step" :class="{ done: s.status === 'done', live: s.status === 'start', pend: s.status === 'pending' || s.status === 'skipped', err: s.status === 'error', skip: s.status === 'skipped' }" :title="s.message || s.status">
          <i />{{ STAGE_LABEL[s.name] }}<b v-if="s.count != null && s.status !== 'skipped'"><CountUp :value="s.count" /></b><small v-if="s.status === 'skipped'">skipped</small><small v-else-if="s.ms != null">{{ s.ms < 1000 ? s.ms + 'ms' : (s.ms / 1000).toFixed(1) + 's' }}</small>
        </span>
      </div>
      <p v-if="aiSkipped.length" class="ai-note">
        <template v-if="aiKey === false">AI stages skipped — add <span class="mono">TOKEN_FACTORY_API_KEY</span> on the server to enable {{ aiSkippedNames }}. Lanes and order come from citation routes.</template>
        <template v-else>AI stages skipped this run: {{ aiSkippedWhy }}.</template>
      </p>
    </section>

    <section v-if="disc.status === 'error'" class="err" role="alert">
      <b>Run failed{{ disc.errorStage ? ' at ' + STAGE_LABEL[disc.errorStage] : '' }}.</b> {{ disc.error }}
      <button class="btn" type="button" @click="run">Retry</button>
    </section>

    <section v-if="disc.status === 'idle'" class="empty">
      Paste seed DOIs and press <b>Run discovery</b>. Each seed becomes a note in <span class="mono">Seeds/</span>; candidates arrive in four lanes ordered by seed links.
      <span v-if="aiKey === false" class="ai-off">AI stages off — add <span class="mono">TOKEN_FACTORY_API_KEY</span> for embed, rerank, judge and verified quotes. Citation routes run without it.</span>
    </section>

    <section v-if="haveCands" class="block">
      <div class="lens">
        <h4><label for="lens">Lens</label> <small class="lens-src" :class="lensSrc">Lens: {{ LENS_LABEL[lensSrc] }}</small></h4>
        <input id="lens" v-model.number="lens" type="range" min="0" max="100" aria-label="Lens from Evidence to Method">
        <div class="ends"><span>Evidence</span><span class="mono">{{ lens }}%</span><span>Method</span></div>
        <p class="muted small lens-help">Re-sorts within each lane; papers never change lanes.<template v-if="lensSrc === 'keywords'"> Title keywords stand in until the judge grades topic and method.</template></p>
      </div>
    </section>

    <section v-if="running && !haveCands" class="block" aria-busy="true">
      <p class="live-ct muted small">
        <span class="pulse" />Found so far:
        <template v-for="(r, i) in routeCounts" :key="r.name"><template v-if="i"> · </template>{{ STAGE_LABEL[r.name].split(' ')[0] }} <b class="mono"><CountUp v-if="r.count != null" :value="r.count" /><template v-else>…</template></b></template>
      </p>
      <div v-for="l in LANES" :key="l.key" class="lane">
        <div class="lane-h"><i class="sw" :style="{ background: l.sw }" />{{ l.key }} <small>{{ l.sub }}</small><span class="ct">…</span></div>
        <div v-for="k in 2" :key="k" class="skel" />
      </div>
    </section>

    <template v-if="haveCands">
      <section v-for="l in LANES" :key="l.key" class="lane">
        <div class="lane-h"><i class="sw" :style="{ background: l.sw }" />{{ l.key }} <small>{{ l.sub }}</small><small v-if="laneSrc(l.key) !== lensSrc && disc.inLane(l.key).length" class="lane-src" :title="'Lens uses ' + LENS_LABEL[laneSrc(l.key)] + ' in this lane'">{{ laneSrc(l.key) === 'keywords' ? 'kw' : laneSrc(l.key) }}</small><span class="ct"><CountUp :value="countOf(l.key)" /></span></div>
        <div v-if="l.key === 'Fresh' && fresh" class="lane-empty">
          0 in this run. Fresh papers come from query expansion (R4) and the Scout (R5){{ r45ran ? '' : ', which found nothing new this run' }}.
        </div>
        <div v-else-if="!disc.inLane(l.key).length" class="lane-empty">No papers in this lane.</div>
        <template v-else>
          <CandidateCard v-for="(c, i) in visible(l.key)" :key="c.paper.id" :c="c" :pos="i + 1" :seed-count="disc.seeds.length || 5" />
          <button v-if="laneItems(l.key).length > (shown[l.key] ?? PAGE)" type="button" class="more" @click="shown[l.key] = (shown[l.key] ?? PAGE) + PAGE">
            Show {{ Math.min(PAGE, laneItems(l.key).length - (shown[l.key] ?? PAGE)) }} more of {{ laneItems(l.key).length }} sent
          </button>
        </template>
      </section>

      <div v-for="r in retracted" :key="r.paper.id" class="retr" role="note">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 16H3z" /><path d="M12 10v4M12 17h.01" /></svg>
        <span><b>Retracted</b> · {{ r.paper.title }} ({{ r.paper.year }}). Flagged by OpenAlex; never recommended.</span>
      </div>
      <div class="muted small">Not assessable: <b class="mono">{{ fmt(countOf('NotAssessable')) }}</b> <span>(no abstract and fewer than 3 seed links)</span></div>
    </template>

    <section v-if="disc.agent.length || disc.stages.find(s => s.name === 'scout')?.status === 'start'" class="block">
      <button type="button" class="trace-h" :aria-expanded="traceOpen" @click="traceOpen = !traceOpen">
        {{ traceOpen ? '▾' : '▸' }} Scout agent trace <small>{{ disc.agent.length }} steps</small>
      </button>
      <ol v-if="traceOpen" class="trace">
        <li v-for="a in disc.agent" :key="a.step"><b class="mono">{{ a.step }} · {{ a.tool }}</b><span class="mono">{{ a.input }}</span><span class="muted">→ {{ a.output }}</span></li>
        <li v-if="!disc.agent.length" class="muted">Waiting for the first tool call…</li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.side{padding:12px;display:flex;flex-direction:column;gap:12px;overflow:auto;height:100%;min-height:0;contain:size;background:var(--surface);color:var(--fg)}
.block{display:flex;flex-direction:column;gap:6px}
h4{margin:4px 0 0;font:500 10.5px/1.3 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
h4 small{letter-spacing:0;text-transform:none;font-size:10.5px;margin-left:4px}
.qbox{font:13px/1.4 var(--font-body);border:1px solid var(--line);border-radius:6px;padding:8px 10px;background:var(--surface-2);color:var(--fg);resize:vertical;width:100%}
.qbox.mono,.mono{font-family:var(--font-mono)}
.qbox.mono{font-size:11.5px}
.chips{display:flex;gap:4px;flex-wrap:wrap}
.chip{font:600 10.5px/1 var(--font-mono);padding:4px 6px;border-radius:4px;border:1px solid var(--seed);color:var(--seed);background:var(--seed-soft)}
.presets{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.preset{display:flex;flex-direction:column;gap:2px;text-align:left;border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:7px;padding:6px 8px;cursor:pointer;font:inherit}
.preset b{font:600 12px var(--font-mono)}
.preset small{font:400 10px/1.3 var(--font-mono);color:var(--muted)}
.preset[aria-checked="true"]{border-color:var(--cand);background:var(--cand-soft)}
.runrow{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.btn{font:600 12.5px/1 var(--font-body);border:1px solid var(--line-2);background:var(--surface);color:var(--fg);border-radius:99px;padding:8px 12px;cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.btn.primary{background:var(--fg);color:var(--bg);border-color:var(--fg)}
.btn.ghost{border-color:transparent;color:var(--muted)}
.btn:disabled{opacity:.55;cursor:default}
.small{font-size:11.5px}
.muted{color:var(--muted)}
.notice{margin:0;font-size:11.5px;color:var(--warn);border:1px dashed var(--warn);border-radius:6px;padding:6px 8px}
.empty{font-size:12.5px;color:var(--muted);border:1px dashed var(--line-2);border-radius:7px;padding:10px}
.steps{display:flex;flex-wrap:wrap;gap:4px}
.step{display:inline-flex;gap:5px;align-items:center;white-space:nowrap;font:500 10.5px/1 var(--font-mono);padding:5px 7px;border-radius:99px;border:1px solid var(--line-2);color:var(--muted);background:var(--surface)}
.step i{width:6px;height:6px;border-radius:50%;background:var(--line-2)}
.step b{color:var(--fg)}
.step small{font-size:9.5px;color:var(--muted)}
.step.done{color:var(--fg);border-color:var(--seed)}
.step.done i{background:var(--seed)}
.step.live{color:var(--fg);border-color:var(--cand)}
.step.live i{background:var(--cand);animation:blink 1s ease-in-out infinite}
.step.pend{border-style:dashed}
.step.skip{opacity:.7}
.step.err{border-color:var(--crit);color:var(--crit)}
.step.err i{background:var(--crit)}
@keyframes blink{50%{opacity:.3}}
.err{display:flex;flex-direction:column;gap:6px;align-items:flex-start;font-size:12.5px;border:1px solid var(--crit);border-radius:7px;padding:8px 10px;background:color-mix(in srgb,var(--crit) 8%,var(--surface))}
.lens{display:flex;flex-direction:column;gap:4px}
.lens input{width:100%;accent-color:var(--cand)}
.ends{display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted)}
.lane{display:flex;flex-direction:column;gap:6px}
.lane-h{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600}
.lane-h .sw{width:10px;height:10px;border-radius:2px;flex:none}
.lane-h .ct{margin-left:auto;font:500 12px var(--font-mono);font-variant-numeric:tabular-nums}
.lane-h small{font-weight:400;color:var(--muted);font-size:11.5px}
.lane-empty{font-size:12px;color:var(--muted);border:1px dashed var(--line-2);border-radius:6px;padding:8px 10px}
.skel{height:58px;border-radius:7px;border:1px solid var(--line);background:linear-gradient(90deg,var(--surface-2) 0%,var(--surface) 50%,var(--surface-2) 100%);background-size:200% 100%;animation:shimmer 1.2s linear infinite}
@keyframes shimmer{to{background-position:-200% 0}}
.more{border:0;background:transparent;color:var(--muted);font:500 11.5px var(--font-mono);cursor:pointer;text-align:left;padding:2px 4px}
.more:hover{color:var(--fg)}
.retr{display:flex;gap:8px;align-items:flex-start;border:1px solid var(--crit);border-radius:7px;padding:8px 10px;font-size:12px;background:color-mix(in srgb,var(--crit) 8%,var(--surface))}
.retr svg{width:16px;height:16px;flex:none;stroke:var(--crit);fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;margin-top:1px}
.retr b{color:var(--crit)}
.trace-h{border:0;background:transparent;color:var(--fg);font:500 12px var(--font-body);cursor:pointer;text-align:left;padding:0}
.trace-h small{color:var(--muted)}
.trace{margin:0;padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:11.5px}
.trace li{display:flex;flex-direction:column;gap:1px;border-left:2px solid var(--line-2);padding-left:8px}
.proof{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 6px;font:500 11.5px/1.45 var(--font-mono);color:var(--muted);border:1px solid var(--line);border-left:3px solid var(--gap);border-radius:6px;padding:7px 10px;background:var(--surface-2)}
.proof b{color:var(--fg);font-weight:600}
.proof i{font-style:normal;color:var(--line-2)}
.btn.live{border-color:var(--cand);color:var(--cand);background:var(--cand-soft)}
.btn .ic{width:13px;height:13px}
.ai-note{margin:2px 0 0;font-size:11.5px;line-height:1.45;color:var(--muted);border-left:2px solid var(--warn);padding:2px 0 2px 8px}
.ai-off{display:block;margin-top:6px;font-size:11.5px;color:var(--warn)}
.lens-src{font-family:var(--font-mono)}
.lens-src.keywords{color:var(--warn)}
.lens-src.judge{color:var(--ok)}
.lens-help{margin:0}
.lane-src{font:500 10px var(--font-mono);color:var(--warn);border:1px solid currentColor;border-radius:4px;padding:0 4px}
.live-ct{margin:0;display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.live-ct b{color:var(--fg)}
.pulse{width:7px;height:7px;border-radius:50%;background:var(--cand);animation:blink 1s ease-in-out infinite}
@media (prefers-reduced-motion: reduce){.skel,.step.live i,.pulse{animation:none}}
</style>

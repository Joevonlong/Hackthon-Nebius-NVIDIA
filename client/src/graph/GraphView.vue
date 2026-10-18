<script setup lang="ts">
// Vault graph. Owner: lane C. Force layout ported from Zettlr's GraphView (source/win-stats/GraphView.vue, GPL-3.0):
// d3 forceSimulation with link / charge / collide / x / y forces and keyed joins; adds zoom/pan via d3.zoom,
// ghost nodes for run candidates not yet in the vault, and enter animations while a run streams.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { Candidate } from '@shared/contracts'
import type { LibPaper } from '@shared/library'
import { useLibrary } from '../stores/library'
import DirectedGraph from './directed-graph'
import { useVault, type Note } from '../stores/vault'
import { useDiscovery } from '../stores/discovery'
import { useUi } from '../stores/ui'
import { extractLinks, noteName, resolveLink } from '../stores/vault-utils'
import { shortTitle } from '../discover/literatureNote'

type Kind = 'seed' | 'lit' | 'note' | 'ghost' | 'bridge' | 'lib'
interface GNode extends d3.SimulationNodeDatum { id: string; kind: Kind; label: string; sub: string; note?: Note; cand?: Candidate; lib?: LibPaper; component?: string }
interface GLink extends d3.SimulationLinkDatum<GNode> { source: string | GNode; target: string | GNode; kind: 'wiki' | 'cite' }

const MAX_GHOSTS = 25
const MAX_LIB = 60
const vault = useVault(), disc = useDiscovery(), ui = useUi(), lib = useLibrary()

// Library papers that passed the threshold (D-20/D-23: the candidate layer). Papers already kept as notes show as notes.
const libNodes = computed(() => lib.passedTop.filter(p => !vault.byPaper(p.paper.id)).slice(0, MAX_LIB))
/** Vault note for a known paper id (OpenAlex id, DOI, PMID or arXiv id): by note.paperId, else by the id in its text. */
function noteForPaper(id: string): Note | undefined {
  const k = id.toLowerCase()
  return vault.notes.find(n => n.paperId?.toLowerCase() === k) || (k.length >= 6 ? vault.notes.find(n => n.content.toLowerCase().includes(k)) : undefined)
}
const wrap = ref<HTMLDivElement | null>(null)
const svgEl = ref<SVGSVGElement | null>(null)
const tip = ref<{ x: number; y: number; title: string; sub: string } | null>(null)
const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const ghosts = computed(() => {
  const order = ['Core', 'Fresh', 'Linked', 'Bridges']
  return disc.candidates
    .filter(c => order.includes(c.lane) && !vault.byPaper(c.paper.id))
    .sort((a, b) => order.indexOf(a.lane) - order.indexOf(b.lane) || a.rank - b.rank)
    .reduce<Candidate[]>((acc, c) => {
      // keep every lane visible: at most 10 per lane, MAX_GHOSTS total
      if (acc.filter(x => x.lane === c.lane).length < 10 && acc.length < MAX_GHOSTS) acc.push(c)
      return acc
    }, [])
})

/** Graph data: vault notes + ghost candidates; edges = wikilinks + candidate↔seed citation links. */
const data = computed(() => {
  const DG = new DirectedGraph()
  DG.startOperation()
  const nodes = new Map<string, GNode>()
  const notes = vault.notes
  for (const n of notes) {
    const id = 'note:' + n.path
    nodes.set(id, { id, kind: n.kind === 'seed' ? 'seed' : n.kind === 'lit' ? 'lit' : 'note', label: noteName(n.path), sub: n.path, note: n })
    DG.addVertex(id, noteName(n.path))
  }
  const links: GLink[] = []
  const seen = new Set<string>()
  const addLink = (a: string, b: string, kind: GLink['kind']) => {
    const key = a < b ? a + '|' + b : b + '|' + a
    if (a === b || seen.has(key)) return
    seen.add(key); links.push({ source: a, target: b, kind }); DG.addArc(a, b)
  }
  for (const n of notes) for (const t of extractLinks(n.content)) {
    const to = resolveLink(t, notes); if (to) addLink('note:' + n.path, 'note:' + to.path, 'wiki')
  }
  const seedNode = (sn: number) => {
    const s = disc.seeds.find(x => x.n === sn); if (!s) return null
    const note = vault.byPaper(s.id); return note ? 'note:' + note.path : null
  }
  for (const c of ghosts.value) {
    const id = 'paper:' + c.paper.id
    nodes.set(id, { id, kind: c.lane === 'Bridges' ? 'bridge' : 'ghost', label: shortTitle(c.paper), sub: `${c.lane} #${c.rank} · ${c.paper.title}`, cand: c })
    DG.addVertex(id, c.paper.title)
    for (const sn of [...c.features.out, ...c.features.in]) { const sid = seedNode(sn); if (sid) addLink(id, sid, 'cite') }
  }
  // Library papers: edges to the vault notes they cite / are cited by, and to other passed library papers.
  const libIds = new Set(libNodes.value.map(p => p.paper.id))
  for (const p of libNodes.value) {
    const id = 'lib:' + p.paper.id
    nodes.set(id, { id, kind: 'lib', label: shortTitle(p.paper), sub: `Library #${p.rank} · score ${p.total.toFixed(2)} · ${p.paper.title}`, lib: p })
    DG.addVertex(id, p.paper.title)
  }
  for (const p of [...libNodes.value, ...lib.passedTop.filter(x => vault.byPaper(x.paper.id))]) {
    const from = libIds.has(p.paper.id) ? 'lib:' + p.paper.id : 'note:' + vault.byPaper(p.paper.id)!.path
    for (const r of p.relations) {
      if (r.type !== 'cites' && r.type !== 'cited_by') continue
      if (libIds.has(r.paperId)) { addLink(from, 'lib:' + r.paperId, 'cite'); continue }
      const n = noteForPaper(r.paperId); if (n) addLink(from, 'note:' + n.path, 'cite')
    }
  }
  // Kept literature notes also link to their seeds through the run's features when the note has no wikilinks yet.
  for (const n of notes) if (n.kind === 'lit' && n.paperId) {
    const c = disc.byId(n.paperId); if (!c) continue
    for (const sn of [...c.features.out, ...c.features.in]) { const sid = seedNode(sn); if (sid) addLink('note:' + n.path, sid, 'cite') }
  }
  DG.endOperation()
  for (const v of DG.graph.nodes) { const g = nodes.get(v.id); if (g) g.component = v.component }
  return { nodes: [...nodes.values()], links }
})

const counts = computed(() => {
  const k = { seed: 0, lit: 0, note: 0, ghost: 0, lib: 0 }
  for (const n of data.value.nodes) { if (n.kind === 'bridge' || n.kind === 'ghost') k.ghost++; else k[n.kind]++ }
  return k
})

let sim: d3.Simulation<GNode, GLink> | null = null
let zoomLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let ro: ResizeObserver | null = null
let zoomer: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let userZoomed = false
const pos = new Map<string, { x: number; y: number; vx?: number; vy?: number }>()
const R: Record<Kind, number> = { seed: 9, lit: 7, note: 6, ghost: 5.5, bridge: 5.5, lib: 6 }

function openNode(d: GNode) {
  if (d.note) ui.openNote(d.note.path, noteName(d.note.path))
  else if (d.cand) ui.openPreview(d.cand.paper.id, shortTitle(d.cand.paper))
  else if (d.lib) ui.openLibPaper(d.lib.paper.id, shortTitle(d.lib.paper))
}

function render(animate: boolean) {
  if (!svgEl.value || !zoomLayer) return
  const { nodes: rawNodes, links: rawLinks } = data.value
  // Deep copies (d3 mutates the objects), keeping positions of nodes that already exist.
  const nodes: GNode[] = rawNodes.map(n => {
    const p = pos.get(n.id)
    if (p) return { ...n, ...p }
    // new nodes start next to a linked node, else near the center
    const l = rawLinks.find(x => x.source === n.id || x.target === n.id)
    const other = l ? pos.get((l.source === n.id ? l.target : l.source) as string) : undefined
    const j = () => (Math.random() - 0.5) * 30
    return { ...n, x: (other?.x ?? 0) + j(), y: (other?.y ?? 0) + j() }
  })
  const links: GLink[] = rawLinks.map(l => ({ ...l }))
  const isNew = (id: string) => !pos.has(id)
  // Stagger new nodes so candidates grow out of the seeds one by one (Core first, then Fresh, Linked, Bridges):
  // each element animates <= 280 ms, the whole wave is capped at ~1 s and then the graph holds still.
  const order = new Map<string, number>()
  if (animate) nodes.filter(n => isNew(n.id)).forEach((n, i) => order.set(n.id, i))
  const delay = (id: string) => Math.min((order.get(id) ?? 0) * 30, 750) + 'ms'
  const idOf = (e: string | GNode) => typeof e === 'string' ? e : e.id

  const linkSel = zoomLayer.select<SVGGElement>('g.edges').selectAll<SVGLineElement, GLink>('line')
    .data(links, d => `${idOf(d.source)}|${idOf(d.target)}`)
    .join(enter => enter.append('line').attr('class', d => 'ge ' + d.kind + (animate ? ' grow' : ''))
      .style('animation-delay', d => animate ? delay(order.has(idOf(d.source)) ? idOf(d.source) : idOf(d.target)) : null))

  const nodeSel = zoomLayer.select<SVGGElement>('g.nodes').selectAll<SVGGElement, GNode>('g.gn')
    .data(nodes, d => d.id)
    .join(
      enter => {
        const g = enter.append('g').attr('class', d => 'gn' + (animate && isNew(d.id) ? ' grow' : '')).attr('tabindex', 0).attr('role', 'button')
        g.append('circle').style('animation-delay', d => animate ? delay(d.id) : null)
        g.append('text').attr('class', 'glbl')
        return g
      },
      update => update,
      exit => exit.remove(),
    )
  nodeSel.attr('aria-label', d => d.label)
  nodeSel.select('circle').attr('r', d => R[d.kind]).attr('class', d => 'nd nd-' + d.kind)
  nodeSel.select<SVGTextElement>('text').text(d => (d.kind === 'seed' || d.kind === 'lit' || d.kind === 'note') ? (d.label.length > 26 ? d.label.slice(0, 25) + '…' : d.label) : '')
    .attr('class', d => 'glbl' + (d.kind === 'seed' ? ' glbl-seed' : ''))
  nodeSel
    .on('click', (_e, d) => openNode(d))
    .on('keydown', (e: KeyboardEvent, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(d) } })
    .on('mouseenter', (e: MouseEvent, d) => {
      const r = wrap.value!.getBoundingClientRect()
      tip.value = { x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, title: d.cand ? d.cand.paper.title : d.lib ? d.lib.paper.title : d.label, sub: d.cand ? `${d.cand.lane} #${d.cand.rank} · not in vault · click to preview` : d.lib ? `Library #${d.lib.rank} · score ${d.lib.total.toFixed(2)} ≥ ${lib.threshold.toFixed(2)} · ${d.lib.relations.filter(r => r.type === 'cites' || r.type === 'cited_by').length} citation links · click for the evidence` : d.sub }
      linkSel.classed('hot', l => (l.source as GNode).id === d.id || (l.target as GNode).id === d.id)
    })
    .on('mouseleave', () => { tip.value = null; linkSel.classed('hot', false) })
    .call(d3.drag<SVGGElement, GNode>()
      .on('start', (e, d) => { if (!e.active && !reduce) sim?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; if (reduce) { d.x = e.x; d.y = e.y; ticked() } })
      .on('end', (e, d) => { if (!e.active) sim?.alphaTarget(0); d.fx = null; d.fy = null }))

  function ticked() {
    linkSel
      .attr('x1', d => (d.source as GNode).x!).attr('y1', d => (d.source as GNode).y!)
      .attr('x2', d => (d.target as GNode).x!).attr('y2', d => (d.target as GNode).y!)
    nodeSel.select('circle').attr('cx', d => d.x!).attr('cy', d => d.y!)
    nodeSel.select('text').attr('x', d => d.x! + R[d.kind] + 3).attr('y', d => d.y! + 3.5)
    for (const n of nodes) pos.set(n.id, { x: n.x!, y: n.y! })
  }

  const forceLink = d3.forceLink<GNode, GLink>(links).id(d => d.id).distance(l => l.kind === 'wiki' ? 60 : 75).strength(l => l.kind === 'wiki' ? 0.6 : 0.25)
  if (!sim) {
    sim = d3.forceSimulation<GNode, GLink>(nodes)
      .force('link', forceLink)
      .force('charge', d3.forceManyBody<GNode>().strength(d => d.kind === 'seed' ? -260 : -110))
      .force('collide', d3.forceCollide<GNode>(d => R[d.kind] + 4))
      .force('x', d3.forceX<GNode>().strength(0.06))
      .force('y', d3.forceY<GNode>().strength(0.06))
  } else {
    sim.nodes(nodes).force('link', forceLink)
  }
  // Fit once the layout is mostly settled (~1 s), not when the simulation fully stops several seconds later.
  let fitted = false
  sim.on('tick', () => { ticked(); if (!fitted && sim!.alpha() < 0.12) { fitted = true; fit(nodes) } })
  if (reduce) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); ticked(); fit(nodes) }
  else sim.alpha(animate ? 0.7 : 0.5).restart()
}

/** Zooms so the whole graph fills the view once the layout settles (until the user zooms or pans themselves). */
function fit(nodes: GNode[]) {
  if (!svgEl.value || !wrap.value || !zoomer || userZoomed || nodes.length < 2) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) { x0 = Math.min(x0, n.x!); y0 = Math.min(y0, n.y!); x1 = Math.max(x1, n.x! + 120 * (n.kind === 'seed' ? 1 : 0)); y1 = Math.max(y1, n.y!) }
  const { width, height } = wrap.value.getBoundingClientRect()
  const k = Math.max(0.4, Math.min(1.8, (width - 80) / Math.max(1, x1 - x0), (height - 120) / Math.max(1, y1 - y0)))
  const t = d3.zoomIdentity.scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2 + 10 / k)
  const sel = d3.select(svgEl.value)
  if (reduce) sel.call(zoomer.transform, t)
  else sel.transition().duration(300).ease(d3.easeCubicOut).call(zoomer.transform, t)
}

function resize() {
  if (!svgEl.value || !wrap.value) return
  const { width, height } = wrap.value.getBoundingClientRect()
  d3.select(svgEl.value).attr('viewBox', [-width / 2, -height / 2, width, height].join(' '))
}

onMounted(() => {
  if (!svgEl.value) return
  const svg = d3.select(svgEl.value)
  zoomLayer = svg.append('g').attr('class', 'layer')
  zoomLayer.append('g').attr('class', 'edges')
  zoomLayer.append('g').attr('class', 'nodes')
  zoomer = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5]).on('zoom', e => {
    if (e.sourceEvent) userZoomed = true
    zoomLayer!.attr('transform', e.transform.toString())
  })
  svg.call(zoomer)
  resize()
  ro = new ResizeObserver(() => requestAnimationFrame(resize))
  if (wrap.value) ro.observe(wrap.value)
  render(false)
})
onBeforeUnmount(() => { sim?.stop(); sim = null; ro?.disconnect() })

// Re-render on structural change only (node ids + edges), animating while a run streams.
const signature = computed(() => data.value.nodes.map(n => n.id + ':' + n.kind).join(',') + '#' + data.value.links.length)
watch(signature, () => render(true))
</script>

<template>
  <div ref="wrap" class="graphwrap">
    <svg ref="svgEl" role="img" aria-label="Vault graph: seeds, kept notes and candidates" />
    <div v-if="!data.nodes.length" class="empty">
      <template v-if="disc.status === 'running'"><b>Resolving seeds…</b> Seed notes appear here first, then candidates grow out of them.</template>
      <template v-else><b>The graph is empty.</b> Build a library from the Library tab: papers above the threshold appear here, linked to the notes they cite.</template>
    </div>
    <div v-if="lib.status === 'running'" class="g-live" role="status"><i />Library building · passed papers appear when scoring finishes</div>
    <div v-if="disc.status === 'running'" class="g-live" role="status"><i />Run streaming · {{ counts.seed }} seeds · {{ counts.ghost }} candidates shown</div>
    <div class="g-legend">
      <span><i style="background:var(--seed)" />Seed note · {{ counts.seed }}</span>
      <span><i style="background:var(--cand)" />Kept note · {{ counts.lit }}</span>
      <span><i style="background:var(--line-2)" />Note · {{ counts.note }}</span>
      <span><i class="lib" />Library paper ≥ {{ lib.threshold.toFixed(2) }} · {{ counts.lib }}<template v-if="libNodes.length === MAX_LIB"> (first {{ MAX_LIB }})</template></span>
      <template v-if="counts.ghost"><span><i class="hollow" />Seed-run candidate · {{ counts.ghost }}</span>
      <span><i class="hollow dashed" />Bridge (no citation link)</span></template>
    </div>
    <div class="g-hint">scroll to zoom · drag to pan · click a node to open</div>
    <div v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }"><b>{{ tip.title }}</b><small>{{ tip.sub }}</small></div>
  </div>
</template>

<style scoped>
.graphwrap{position:relative;height:100%;contain:size;min-height:440px;overflow:hidden;background:var(--surface)}
svg{width:100%;height:100%;display:block;cursor:grab}
svg:active{cursor:grabbing}
.empty{position:absolute;inset:40% 20% auto;text-align:center;color:var(--muted);font-size:13px}
.g-legend{position:absolute;left:10px;bottom:8px;display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);background:color-mix(in srgb,var(--surface) 88%,transparent);padding:5px 8px;border-radius:6px}
.g-legend span{display:inline-flex;gap:5px;align-items:center}
.g-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}
.g-legend i.hollow{border:1.5px solid var(--cand);background:var(--surface)}
.g-legend i.dashed{border-style:dashed}
.g-legend i.lib{background:color-mix(in srgb,var(--warn) 35%,var(--surface));border:1.5px solid var(--warn)}
.g-live{position:absolute;left:10px;top:8px;display:inline-flex;align-items:center;gap:6px;font:500 11px var(--font-mono);color:var(--fg);background:var(--cand-soft);border:1px solid var(--cand);border-radius:99px;padding:3px 9px}
.g-live i{width:7px;height:7px;border-radius:50%;background:var(--cand);animation:blink 1s ease-in-out infinite}
@keyframes blink{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.g-live i{animation:none}}
.g-hint{position:absolute;right:10px;top:8px;font:500 10.5px var(--font-mono);color:var(--muted)}
.tip{position:absolute;pointer-events:none;max-width:320px;background:var(--surface);border:1px solid var(--line-2);border-radius:6px;padding:6px 8px;font-size:12px;display:flex;flex-direction:column;gap:2px;box-shadow:0 4px 14px color-mix(in srgb,var(--fg) 12%,transparent);z-index:2}
.tip small{color:var(--muted);font-family:var(--font-mono);font-size:10.5px}
:deep(.ge){stroke:var(--line-2);stroke-width:1}
:deep(.ge.cite){stroke-dasharray:2 2}
:deep(.ge.hot){stroke:var(--cand);stroke-width:1.6}
:deep(.gn){cursor:pointer;outline:none}
:deep(.gn:focus-visible circle){stroke:var(--fg);stroke-width:2}
:deep(.nd-seed){fill:var(--seed)}
:deep(.nd-lit){fill:var(--cand)}
:deep(.nd-note){fill:var(--line-2)}
:deep(.nd-ghost){fill:var(--surface);stroke:var(--cand);stroke-width:1.6}
:deep(.nd-lib){fill:color-mix(in srgb,var(--warn) 35%,var(--surface));stroke:var(--warn);stroke-width:1.6}
:deep(.nd-bridge){fill:var(--surface);stroke:var(--cand);stroke-width:1.4;stroke-dasharray:3 2}
:deep(.glbl){font:500 10px var(--font-mono);fill:var(--muted);pointer-events:none}
:deep(.glbl-seed){font-weight:600;fill:var(--fg)}
:deep(.gn.grow circle){transform-box:fill-box;transform-origin:center;animation:pop .28s cubic-bezier(.23,1,.32,1) both}
:deep(.ge.grow){animation:fadein .28s ease-out both}
@keyframes pop{from{opacity:0;transform:scale(.3)}}
@keyframes fadein{from{opacity:0}}
@media (prefers-reduced-motion: reduce){:deep(.gn.grow circle),:deep(.ge.grow){animation:none}}
</style>

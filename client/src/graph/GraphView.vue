<script setup lang="ts">
// Vault graph. Owner: lane C. Force layout ported from Zettlr's GraphView (source/win-stats/GraphView.vue, GPL-3.0):
// d3 forceSimulation with link / charge / collide / x / y forces and keyed joins; adds zoom/pan via d3.zoom,
// ghost nodes for run candidates not yet in the vault, and enter animations while a run streams.
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { Candidate } from '@shared/contracts'
import DirectedGraph from './directed-graph'
import { useVault, type Note } from '../stores/vault'
import { useDiscovery } from '../stores/discovery'
import { useUi } from '../stores/ui'
import { extractLinks, noteName, resolveLink } from '../stores/vault-utils'
import { shortTitle } from '../discover/literatureNote'

type Kind = 'seed' | 'lit' | 'note' | 'ghost' | 'bridge'
interface GNode extends d3.SimulationNodeDatum { id: string; kind: Kind; label: string; sub: string; note?: Note; cand?: Candidate; component?: string }
interface GLink extends d3.SimulationLinkDatum<GNode> { source: string | GNode; target: string | GNode; kind: 'wiki' | 'cite' }

const MAX_GHOSTS = 25
const vault = useVault(), disc = useDiscovery(), ui = useUi()
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
  const k = { seed: 0, lit: 0, note: 0, ghost: 0 }
  for (const n of data.value.nodes) { if (n.kind === 'bridge' || n.kind === 'ghost') k.ghost++; else k[n.kind]++ }
  return k
})

let sim: d3.Simulation<GNode, GLink> | null = null
let zoomLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let ro: ResizeObserver | null = null
const pos = new Map<string, { x: number; y: number; vx?: number; vy?: number }>()
const R: Record<Kind, number> = { seed: 9, lit: 7, note: 6, ghost: 5.5, bridge: 5.5 }

function openNode(d: GNode) {
  if (d.note) ui.openNote(d.note.path, noteName(d.note.path))
  else if (d.cand) ui.openPreview(d.cand.paper.id, shortTitle(d.cand.paper))
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

  const linkSel = zoomLayer.select<SVGGElement>('g.edges').selectAll<SVGLineElement, GLink>('line')
    .data(links, d => `${typeof d.source === 'string' ? d.source : d.source.id}|${typeof d.target === 'string' ? d.target : d.target.id}`)
    .join(enter => enter.append('line').attr('class', d => 'ge ' + d.kind + (animate ? ' grow' : '')))

  const nodeSel = zoomLayer.select<SVGGElement>('g.nodes').selectAll<SVGGElement, GNode>('g.gn')
    .data(nodes, d => d.id)
    .join(
      enter => {
        const g = enter.append('g').attr('class', d => 'gn' + (animate && isNew(d.id) ? ' grow' : '')).attr('tabindex', 0).attr('role', 'button')
        g.append('circle')
        g.append('text').attr('class', 'glbl')
        return g
      },
      update => update,
      exit => exit.remove(),
    )
  nodeSel.attr('aria-label', d => d.label)
  nodeSel.select('circle').attr('r', d => R[d.kind]).attr('class', d => 'nd nd-' + d.kind)
  nodeSel.select<SVGTextElement>('text').text(d => (d.kind === 'seed' || d.kind === 'lit' || d.kind === 'note') ? d.label : '')
    .attr('class', d => 'glbl' + (d.kind === 'seed' ? ' glbl-seed' : ''))
  nodeSel
    .on('click', (_e, d) => openNode(d))
    .on('keydown', (e: KeyboardEvent, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(d) } })
    .on('mouseenter', (e: MouseEvent, d) => {
      const r = wrap.value!.getBoundingClientRect()
      tip.value = { x: e.clientX - r.left + 12, y: e.clientY - r.top + 12, title: d.cand ? d.cand.paper.title : d.label, sub: d.cand ? `${d.cand.lane} #${d.cand.rank} · not in vault · click to preview` : d.sub }
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
  sim.on('tick', ticked)
  if (reduce) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); ticked() }
  else sim.alpha(animate ? 0.7 : 0.5).restart()
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
  svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5]).on('zoom', e => zoomLayer!.attr('transform', e.transform.toString())))
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
      <b>The graph is empty.</b> Run discovery: seed notes appear first, then candidates grow out of them as ghost nodes.
    </div>
    <div class="g-legend">
      <span><i style="background:var(--seed)" />Seed note · {{ counts.seed }}</span>
      <span><i style="background:var(--cand)" />Kept note · {{ counts.lit }}</span>
      <span><i style="background:var(--line-2)" />Note · {{ counts.note }}</span>
      <span><i class="hollow" />Candidate · {{ counts.ghost }}</span>
      <span><i class="hollow dashed" />Bridge (no citation link)</span>
    </div>
    <div class="g-hint">scroll to zoom · drag to pan · click a node to open</div>
    <div v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }"><b>{{ tip.title }}</b><small>{{ tip.sub }}</small></div>
  </div>
</template>

<style scoped>
.graphwrap{position:relative;height:100%;min-height:440px;overflow:hidden;background:var(--surface)}
svg{width:100%;height:100%;display:block;cursor:grab}
svg:active{cursor:grabbing}
.empty{position:absolute;inset:40% 20% auto;text-align:center;color:var(--muted);font-size:13px}
.g-legend{position:absolute;left:10px;bottom:8px;display:flex;gap:10px;flex-wrap:wrap;font-size:11.5px;color:var(--muted);background:color-mix(in srgb,var(--surface) 88%,transparent);padding:5px 8px;border-radius:6px}
.g-legend span{display:inline-flex;gap:5px;align-items:center}
.g-legend i{width:9px;height:9px;border-radius:50%;display:inline-block}
.g-legend i.hollow{border:1.5px solid var(--cand);background:var(--surface)}
.g-legend i.dashed{border-style:dashed}
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
:deep(.nd-bridge){fill:var(--surface);stroke:var(--cand);stroke-width:1.4;stroke-dasharray:3 2}
:deep(.glbl){font:500 10px var(--font-mono);fill:var(--muted);pointer-events:none}
:deep(.glbl-seed){font-weight:600;fill:var(--fg)}
:deep(.gn.grow circle){transform-box:fill-box;transform-origin:center;animation:pop .32s cubic-bezier(.23,1,.32,1) both}
:deep(.ge.grow){animation:fadein .4s ease-out both}
@keyframes pop{from{opacity:0;transform:scale(.3)}}
@keyframes fadein{from{opacity:0}}
@media (prefers-reduced-motion: reduce){:deep(.gn.grow circle),:deep(.ge.grow){animation:none}}
</style>

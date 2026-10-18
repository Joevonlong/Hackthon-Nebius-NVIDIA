<script setup lang="ts">
// Vault graph. Owner: lane C. Force layout ported from Zettlr's GraphView (source/win-stats/GraphView.vue, GPL-3.0):
// d3 forceSimulation with link / charge / collide / x / y forces and keyed joins; adds zoom/pan via d3.zoom,
// ghost nodes for run candidates not yet in the vault, and enter animations while a run streams.
import { computed, onActivated, onBeforeUnmount, onDeactivated, onMounted, ref, watch } from 'vue'
import * as d3 from 'd3'
import type { Candidate } from '@shared/contracts'
import type { LibPaper } from '@shared/library'
import { useLibrary } from '../stores/library'
import DirectedGraph from './directed-graph'
import { buildCitationEdges, notePaperKeys, paperKeys, type PoolPaper } from './edges'
import { useVault, type Note } from '../stores/vault'
import { useDiscovery } from '../stores/discovery'
import { useUi } from '../stores/ui'
import { extractLinks, noteName, resolveLink } from '../stores/vault-utils'
import { firstAuthor, lastName, shortTitle } from '../discover/literatureNote'

defineOptions({ name: 'GraphView' }) // kept alive by EditorArea (CR-6: zoom, layout and selection survive a jump)

type Kind = 'seed' | 'lit' | 'note' | 'ghost' | 'bridge' | 'lib'
interface GNode extends d3.SimulationNodeDatum { id: string; kind: Kind; label: string; sub: string; note?: Note; cand?: Candidate; lib?: LibPaper; component?: string }
interface GLink extends d3.SimulationLinkDatum<GNode> { source: string | GNode; target: string | GNode; kind: 'wiki' | 'cite' | 'seed' }

const MAX_GHOSTS = 25
const MAX_LIB = 60
const vault = useVault(), disc = useDiscovery(), ui = useUi(), lib = useLibrary()

// Library papers that pass the rule (D-20/D-23/D-27: the candidate layer). Papers already kept as notes show as notes.
// CR-10: "kept as a note" matches any id form (OpenAlex id, DOI, PMID, arXiv), not only note.paperId.
const noteIdKeys = computed(() => new Set(vault.notes.flatMap(n => notePaperKeys({ paperId: n.paperId, content: n.content, seed: n.kind === 'seed' }))))
const libNodes = computed(() => lib.passedAll.filter(p => !vault.byPaper(p.paper.id) && !paperKeys(p.paper).some(k => noteIdKeys.value.has(k))).slice(0, MAX_LIB))
// F-45: library node radius ∝ total score (4 px at 0 → 16 px at 1); vault notes keep their fixed size. Read live from
// the store so a re-score resizes nodes without re-running the layout.
const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const libRadius = (total: number) => 4 + 12 * clamp01(total)
const libR = computed(() => new Map(libNodes.value.map(p => ['lib:' + p.paper.id, libRadius(p.total)])))
// CR-12: fill follows the same score domain as the radius (0 → lightest blue, 1 → darkest blue), so size and colour agree.
// The ramp itself is CSS (--ramp-lo / --ramp-hi, per theme); each node only carries its position t on it.
const libT = computed(() => new Map(libNodes.value.map(p => ['lib:' + p.paper.id, clamp01(p.total)])))
const rampPct = (t: number) => Math.round(clamp01(t) * 100) + '%'
/** Measured min–max total score of the drawn library nodes (legend). */
const scoreRange = computed(() => {
  const ts = libNodes.value.map(p => p.total)
  return ts.length ? { min: Math.min(...ts), max: Math.max(...ts) } : null
})
const legendEl = ref<HTMLDivElement | null>(null)
const SCALE = [0.5, 0.75, 1]
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

/** Graph data: vault notes + ghost candidates + library papers; edges = wikilinks + citation links (CR-10 E-1). */
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
    // an edge touching a seed note is a seed edge
    const k = kind !== 'wiki' && (nodes.get(a)?.kind === 'seed' || nodes.get(b)?.kind === 'seed') ? 'seed' : kind
    seen.add(key); links.push({ source: a, target: b, kind: k }); DG.addArc(a, b)
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
  // Library papers (CR-10 E-1): citation edges from referencedWorks and cites / cited_by relations, resolved through one id
  // index (OpenAlex id, DOI, PMID, arXiv) over the drawn library papers and the vault notes.
  for (const p of libNodes.value) {
    const id = 'lib:' + p.paper.id
    nodes.set(id, { id, kind: 'lib', label: `${lastName(firstAuthor(p.paper))} ${p.paper.year ?? ''}`.trim(), // J-5: short "Author Year"
       sub: `Library #${p.rank} · score ${p.total.toFixed(2)} · ${p.paper.title}`, lib: p })
    DG.addVertex(id, p.paper.title)
  }
  const pool: PoolPaper[] = [...lib.papers, ...disc.seeds, ...disc.candidates.map(c => c.paper)]
  const cites = buildCitationEdges({
    libs: libNodes.value.map(p => ({ node: 'lib:' + p.paper.id, lib: p })),
    notes: notes.map(n => ({ node: 'note:' + n.path, paperId: n.paperId, content: n.content, seed: n.kind === 'seed' })),
    pool,
  })
  for (const e of cites.edges) addLink(e.source, e.target, e.kind)
  // Kept literature notes also link to their seeds through the run's features when the note has no wikilinks yet.
  for (const n of notes) if (n.kind === 'lit' && n.paperId) {
    const c = disc.byId(n.paperId); if (!c) continue
    for (const sn of [...c.features.out, ...c.features.in]) { const sid = seedNode(sn); if (sid) addLink('note:' + n.path, sid, 'cite') }
  }
  DG.endOperation()
  for (const v of DG.graph.nodes) { const g = nodes.get(v.id); if (g) g.component = v.component }
  return { nodes: [...nodes.values()], links }
})
/** Measured counts for the header and legend: paper nodes drawn and citation links among them. */
const edgeCounts = computed(() => {
  let cite = 0, seed = 0
  for (const l of data.value.links) { if (l.kind === 'cite') cite++; else if (l.kind === 'seed') seed++ }
  return { cite, seed, all: cite + seed }
})

const counts = computed(() => {
  const k = { seed: 0, lit: 0, note: 0, ghost: 0, lib: 0 }
  for (const n of data.value.nodes) { if (n.kind === 'bridge' || n.kind === 'ghost') k.ghost++; else k[n.kind]++ }
  return { ...k, papers: k.lib + k.ghost + k.seed + data.value.nodes.filter(n => n.kind === 'lit' || (n.kind === 'note' && n.note?.paperId)).length }
})

// F-40 / D-24: IMS Dictionary look and motion. The d3 force simulation only lays out; a rAF loop owns what is drawn
// (intro bloom, drift, hover star, ring, particles, label declutter). Colours are CSS variables, so the theme switch
// recolours through CSS transitions (~0.4 s) without re-reading anything.
interface NState { born: number; ox: number; oy: number; x: number; y: number; offx: number; offy: number; fz: number; dim: number; lbl: number; ph: number; hot: number }
let sim: d3.Simulation<GNode, GLink> | null = null
let zoomLayer: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let ro: ResizeObserver | null = null
let zoomer: d3.ZoomBehavior<SVGSVGElement, unknown> | null = null
let userZoomed = false
let raf = 0, lastT = 0, frameNo = 0
let cur: GNode[] = []
let curLinks: GLink[] = []
let nodeSel: d3.Selection<SVGGElement, GNode, SVGGElement, unknown> | null = null
let linkSel: d3.Selection<SVGLineElement, GLink, SVGGElement, unknown> | null = null
let ringEl: SVGCircleElement | null = null
let partG: d3.Selection<SVGGElement, unknown, null, undefined> | null = null
let parts: { el: SVGCircleElement; a: string; b: string; ph: number }[] = []
let adj = new Map<string, string[]>()
let transform = d3.zoomIdentity
let active: string | null = null
let ringA = 0
const pos = new Map<string, { x: number; y: number; vx?: number; vy?: number }>()
const st = new Map<string, NState>()
const R: Record<Kind, number> = { seed: 9, lit: 6.5, note: 5, ghost: 5.5, bridge: 5.5, lib: 6 }
const rad = (n: GNode) => n.kind === 'lib' ? (libR.value.get(n.id) ?? R.lib) : R[n.kind]
const BLOOM_MS = 900, BLOOM_TOTAL = 2400
const easeOutExpo = (t: number) => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
const idOf = (e: string | GNode) => typeof e === 'string' ? e : e.id
const linkKey = (l: GLink) => `${idOf(l.source)}|${idOf(l.target)}`
const PRIORITY: Record<Kind, number> = { seed: 300, lit: 200, note: 150, lib: 100, ghost: 50, bridge: 40 }

// CR-6: the clicked node stays selected (ring + star) so Back lands on the same zoom and the same node.
let selected: string | null = null
let inactive = false
let starTimer: ReturnType<typeof setTimeout> | undefined
let W = 0, H = 0
function select(id: string | null) { selected = id; ui.saveView('graph', { selected: id }); setActive(id) }
function openNode(d: GNode) {
  select(d.id)
  const from = { from: 'graph' as const }
  if (d.note) ui.openNote(d.note.path, noteName(d.note.path), from)
  else if (d.cand) ui.openPreview(d.cand.paper.id, shortTitle(d.cand.paper), from)
  else if (d.lib) ui.openLibPaper(d.lib.paper.id, shortTitle(d.lib.paper), from)
}
/** Applies the zoom/pan and selection stored in ui.viewState.graph (set by a Back/Forward restore). */
function applyView() {
  const v = ui.viewState.graph
  if (v?.zoom && svgEl.value && zoomer) {
    const z = v.zoom
    if (Math.abs(z.k - transform.k) > 1e-4 || Math.abs(z.x - transform.x) > 0.5 || Math.abs(z.y - transform.y) > 0.5) {
      userZoomed = true
      d3.select(svgEl.value).interrupt().call(zoomer.transform, d3.zoomIdentity.translate(z.x, z.y).scale(z.k))
    }
  }
  selected = v?.selected && st.has(v.selected) ? v.selected : null
  // The star around the selected node shows for a moment on return; the node keeps its selection ring after that.
  active = '__'; setActive(selected)
  clearTimeout(starTimer)
  const s = selected
  if (s) starTimer = setTimeout(() => { if (active === s) setActive(null) }, 2500)
}

function setActive(id: string | null) {
  if (active === id) return
  active = id
  // particles flow along the active node's edges
  parts.forEach(p => p.el.remove()); parts = []
  if (id && !reduce && partG) {
    for (const l of curLinks) {
      const a = idOf(l.source), b = idOf(l.target)
      if (a !== id && b !== id) continue
      for (let i = 0; i < 2 && parts.length < 40; i++) {
        const el = document.createElementNS('http://www.w3.org/2000/svg', 'circle'); el.setAttribute('r', '1.8'); el.setAttribute('class', 'particle')
        partG.node()!.appendChild(el); parts.push({ el, a: id, b: a === id ? b : a, ph: i / 2 + Math.random() * 0.2 })
      }
    }
  }
}

function render(animate: boolean, replay = false) {
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
  cur = nodes; curLinks = links
  adj = new Map()
  for (const l of links) {
    const a = idOf(l.source), b = idOf(l.target)
    ;(adj.get(a) ?? adj.set(a, []).get(a)!).push(b); (adj.get(b) ?? adj.set(b, []).get(b)!).push(a)
  }
  // Bloom: new nodes (all of them on mount / replay) emerge from the centre or their linked node, staggered over ~2.4 s.
  const now = performance.now()
  const fresh = nodes.filter(n => replay || !st.has(n.id))
  const step = Math.min(30, (BLOOM_TOTAL - BLOOM_MS) / Math.max(1, fresh.length))
  fresh.forEach((n, i) => {
    const linked = adj.get(n.id)?.map(id => pos.get(id)).find(Boolean)
    const prev = st.get(n.id)
    st.set(n.id, { born: now + i * step, ox: linked?.x ?? 0, oy: linked?.y ?? 0, x: linked?.x ?? 0, y: linked?.y ?? 0, offx: 0, offy: 0, fz: prev?.fz ?? 0, dim: 1, lbl: 0, ph: prev?.ph ?? Math.random() * 6.28, hot: 0 })
    void animate
  })
  for (const id of [...st.keys()]) if (!nodes.some(n => n.id === id)) st.delete(id)
  if (active && !st.has(active)) setActive(null)

  linkSel = zoomLayer.select<SVGGElement>('g.edges').selectAll<SVGLineElement, GLink>('line')
    .data(links, linkKey)
    .join(enter => enter.append('line'))
    .attr('class', d => 'ge ' + d.kind)

  nodeSel = zoomLayer.select<SVGGElement>('g.nodes').selectAll<SVGGElement, GNode>('g.gn')
    .data(nodes, d => d.id)
    .join(
      enter => {
        const g = enter.append('g').attr('class', 'gn').attr('tabindex', 0).attr('role', 'button')
        g.append('circle'); g.append('text').attr('class', 'glbl')
        return g
      },
      update => update,
      exit => exit.remove(),
    )
  nodeSel.attr('aria-label', d => d.label)
  nodeSel.select('circle').attr('r', d => rad(d)).attr('class', d => 'nd nd-' + d.kind)
  nodeSel.select<SVGTextElement>('text').text(d => d.label.length > 28 ? d.label.slice(0, 27) + '…' : d.label)
  nodeSel
    .on('click', (e: MouseEvent, d) => { e.stopPropagation(); openNode(d) })
    .on('keydown', (e: KeyboardEvent, d) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openNode(d) } })
    .on('focus', (_e, d) => setActive(d.id))
    .on('blur', () => setActive(null))
    .on('mouseenter', (e: MouseEvent, d) => {
      const r = wrap.value!.getBoundingClientRect()
      tip.value = { x: e.clientX - r.left + 14, y: e.clientY - r.top + 14, title: d.cand ? d.cand.paper.title : d.lib ? d.lib.paper.title : d.label, sub: d.cand ? `${d.cand.lane} #${d.cand.rank} · not in vault · click to preview` : d.lib ? `Library #${d.lib.rank} · score ${d.lib.total.toFixed(2)} · passed (top ${lib.topPercent}%, ≥ ${lib.threshold.toFixed(2)}) · ${adj.get(d.id)?.length ?? 0} citation links drawn · click for the evidence` : d.sub }
      setActive(d.id)
    })
    .on('mousemove', (e: MouseEvent) => { if (tip.value) { const r = wrap.value!.getBoundingClientRect(); tip.value = { ...tip.value, x: e.clientX - r.left + 14, y: e.clientY - r.top + 14 } } })
    .on('mouseleave', () => { tip.value = null; setActive(null) })
    .call(d3.drag<SVGGElement, GNode>()
      .on('start', (e, d) => { if (!e.active && !reduce) sim?.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
      .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; if (reduce) { d.x = e.x; d.y = e.y } })
      .on('end', (e, d) => { if (!e.active) sim?.alphaTarget(0); d.fx = null; d.fy = null }))

  // CR-10: hundreds of citation edges would pull everything into one blob at a fixed strength; scale each edge by the
  // busier end's degree (d3's default idea) and keep cite edges weaker than wikilinks / seed edges so linked papers cluster.
  const deg = (id: string) => adj.get(id)?.length ?? 1
  const forceLink = d3.forceLink<GNode, GLink>(links).id(d => d.id)
    .distance(l => l.kind === 'wiki' ? 60 : l.kind === 'seed' ? 80 : 90)
    .strength(l => { const m = Math.max(1, Math.min(deg(idOf(l.source)), deg(idOf(l.target)))); return (l.kind === 'wiki' ? 0.6 : l.kind === 'seed' ? 0.5 : 0.22) / Math.sqrt(m) })
  if (!sim) {
    sim = d3.forceSimulation<GNode, GLink>(nodes)
      .force('link', forceLink)
      .force('charge', d3.forceManyBody<GNode>().strength(d => d.kind === 'seed' ? -260 : d.kind === 'lib' ? -170 : -110))
      .force('collide', d3.forceCollide<GNode>(d => rad(d) + 4))
      .force('x', d3.forceX<GNode>().strength(0.06))
      .force('y', d3.forceY<GNode>().strength(0.06))
  } else {
    sim.nodes(nodes).force('link', forceLink)
  }
  // Fit once the layout is mostly settled (~1 s), not when the simulation fully stops several seconds later.
  let fitted = false
  sim.on('tick', () => { for (const n of nodes) pos.set(n.id, { x: n.x!, y: n.y! }); if (!fitted && sim!.alpha() < 0.12) { fitted = true; fit(nodes) } })
  if (reduce) { sim.stop(); for (let i = 0; i < 300; i++) sim.tick(); for (const n of nodes) pos.set(n.id, { x: n.x!, y: n.y! }); fit(nodes) }
  else sim.alpha(animate ? 0.7 : 0.5).restart()
  if (!raf && !inactive) { lastT = performance.now(); raf = requestAnimationFrame(frame) }
}

const approx = (s: string) => s.length * 5.4 + 4

function frame(nowT: number) {
  raf = requestAnimationFrame(frame)
  if (!nodeSel || !linkSel) return
  const dt = Math.min(0.05, (nowT - lastT) / 1000); lastT = nowT; frameNo++
  const k = (tau: number) => reduce ? 1 : 1 - Math.exp(-dt / tau)
  const secs = nowT / 1000
  const nb = new Set(active ? adj.get(active) ?? [] : [])
  // pass 1: base position (bloom + drift)
  const base = new Map<string, { x: number; y: number }>()
  for (const n of cur) {
    const s = st.get(n.id); if (!s) continue
    const e = reduce ? 1 : easeOutExpo(Math.max(0, Math.min(1, (nowT - s.born) / BLOOM_MS)))
    const frozen = active !== null && nb.has(n.id)
    s.fz += ((frozen ? 1 : 0) - s.fz) * k(0.25)
    const amp = reduce ? 0 : 3 * (1 - s.fz)
    const dx = Math.sin(secs * 0.6 + s.ph) * amp, dy = Math.cos(secs * 0.5 + s.ph * 1.3) * amp
    base.set(n.id, { x: s.ox + (n.x! - s.ox) * e + dx, y: s.oy + (n.y! - s.oy) * e + dy })
    ;(s as NState & { e?: number }).e = e
  }
  // pass 2: star targets around the active node
  const targets = new Map<string, { x: number; y: number }>()
  const a = active ? base.get(active) : undefined
  if (active && a && !reduce) {
    const ids = [...nb].filter(id => base.has(id) && id !== active)
    ids.sort((p, q) => Math.atan2(base.get(p)!.y - a.y, base.get(p)!.x - a.x) - Math.atan2(base.get(q)!.y - a.y, base.get(q)!.x - a.x))
    const rr = Math.max(64, ids.length * 9)
    const a0 = ids.length ? Math.atan2(base.get(ids[0])!.y - a.y, base.get(ids[0])!.x - a.x) : 0
    ids.forEach((id, i) => { const ang = a0 + (i / ids.length) * Math.PI * 2; targets.set(id, { x: a.x + Math.cos(ang) * rr, y: a.y + Math.sin(ang) * rr }) })
  }
  for (const n of cur) {
    const s = st.get(n.id), b = base.get(n.id); if (!s || !b) continue
    const t = targets.get(n.id)
    s.offx += ((t ? t.x - b.x : 0) - s.offx) * k(0.18); s.offy += ((t ? t.y - b.y : 0) - s.offy) * k(0.18)
    s.x = b.x + s.offx; s.y = b.y + s.offy
    s.dim += ((active && n.id !== active && !nb.has(n.id) ? 0.25 : 1) - s.dim) * k(0.2)
  }
  // edges: faint at rest, straight and strong for the active node
  const kk = transform.k
  linkSel.each(function (l) {
    const a1 = idOf(l.source), b1 = idOf(l.target), sa = st.get(a1), sb = st.get(b1)
    if (!sa || !sb) return
    const hot = active !== null && (a1 === active || b1 === active)
    const el = this as SVGLineElement
    const rest = l.kind === 'cite' ? 0.13 : l.kind === 'seed' ? 0.18 : 0.22 // CR-10: faint at rest, strong for the active node
    const prev = +(el.dataset.o ?? String(rest)), want = active ? (hot ? 0.8 : 0.03) : rest
    const o = prev + (want - prev) * k(0.2); el.dataset.o = String(o)
    el.setAttribute('x1', String(sa.x)); el.setAttribute('y1', String(sa.y)); el.setAttribute('x2', String(sb.x)); el.setAttribute('y2', String(sb.y))
    el.style.opacity = String(o * Math.min(sa.dim, sb.dim, (sa as NState & { e?: number }).e ?? 1, (sb as NState & { e?: number }).e ?? 1) / (active && !hot ? 1 : 1))
    el.classList.toggle('hot', hot)
  })
  // ring + particles
  const as = active ? st.get(active) : undefined
  ringA += ((as ? 1 : 0) - ringA) * k(0.2)
  if (ringEl) {
    if (as) { ringEl.setAttribute('cx', String(as.x)); ringEl.setAttribute('cy', String(as.y)); ringEl.setAttribute('r', String(Math.max(64, nb.size * 9) / 1 + 0)) }
    ringEl.style.opacity = String(ringA * 0.9)
  }
  for (const p of parts) {
    const sa = st.get(p.a), sb = st.get(p.b); if (!sa || !sb) continue
    const u = (secs * 0.45 + p.ph) % 1
    p.el.setAttribute('cx', String(sa.x + (sb.x - sa.x) * u)); p.el.setAttribute('cy', String(sa.y + (sb.y - sa.y) * u))
    p.el.style.opacity = String(Math.sin(u * Math.PI))
  }
  // labels: priority declutter every few frames (screen space), eased visibility
  if (frameNo % 6 === 0 || reduce) {
    const sx = (x: number) => x * transform.k + transform.x, sy = (y: number) => y * transform.k + transform.y
    const order = [...cur].sort((p, q) => score(q) - score(p))
    function score(n: GNode) { return (n.id === active ? 1000 : nb.has(n.id) ? 500 : 0) + PRIORITY[n.kind] + (adj.get(n.id)?.length ?? 0) }
    const placed: { x0: number; y0: number; x1: number; y1: number; id?: string }[] = cur.map(n => {
      const s = st.get(n.id); const r = (rad(n) + 1) * transform.k
      return s ? { x0: sx(s.x) - r, y0: sy(s.y) - r, x1: sx(s.x) + r, y1: sy(s.y) + r, id: n.id } : { x0: 0, y0: 0, x1: 0, y1: 0, id: n.id }
    })
    for (const n of order) {
      const s = st.get(n.id); if (!s) continue
      const lw = approx(n.label.length > 28 ? n.label.slice(0, 28) : n.label), lh = 13
      // Q-11: a label that would leave the canvas on the right goes to the node's left instead.
      const gap = (rad(n) + 4) * transform.k
      const flip = W > 0 && sx(s.x) + gap + lw > W / 2 - 8
      const x0 = flip ? sx(s.x) - gap - lw : sx(s.x) + gap, y0 = sy(s.y) - lh / 2
      ;(s as NState & { flip?: boolean }).flip = flip
      const box = { x0, y0, x1: x0 + lw, y1: y0 + lh }
      const clash = placed.some(p => p.id !== n.id && box.x0 < p.x1 + 4 && box.x1 > p.x0 - 4 && box.y0 < p.y1 && box.y1 > p.y0)
      // Q-11: labels stay inside the canvas; a node off the edge keeps its dot but not a clipped label.
      const inside = W <= 0 || (box.x0 >= -W / 2 + 4 && box.x1 <= W / 2 - 4 && box.y0 >= -H / 2 + 4 && box.y1 <= H / 2 - 4)
      const show = inside && (n.id === active || !clash)
      if (show) placed.push({ ...box, id: '#' + n.id })
      ;(s as NState & { want?: number }).want = show ? 1 : 0
    }
  }
  nodeSel.each(function (n) {
    const s = st.get(n.id); if (!s) return
    const e = (s as NState & { e?: number }).e ?? 1
    const want = (s as NState & { want?: number }).want ?? 0
    s.lbl += (want - s.lbl) * k(0.15)
    const breathe = reduce ? 1 : 1 + 0.05 * Math.sin(nowT / 1000 * 0.9 + s.ph)
    const g = this as SVGGElement
    const c = g.firstChild as SVGCircleElement, t = g.lastChild as SVGTextElement
    if (n.kind === 'lib') { const v = rampPct(libT.value.get(n.id) ?? 0.5); if (c.dataset.t !== v) { c.dataset.t = v; c.style.setProperty('--t', v) } }
    c.setAttribute('cx', String(s.x)); c.setAttribute('cy', String(s.y)); c.setAttribute('r', String(rad(n) * breathe * (n.id === active ? 1.35 : 1) * (0.4 + 0.6 * e)))
    c.style.opacity = String(Math.min(1, e * 1.5) * s.dim)
    const flip = (s as NState & { flip?: boolean }).flip
    t.setAttribute('x', String(flip ? s.x - rad(n) - 4 / transform.k : s.x + rad(n) + 4 / transform.k)); t.setAttribute('y', String(s.y + 3.6 / transform.k))
    t.setAttribute('text-anchor', flip ? 'end' : 'start')
    c.classList.toggle('sel', n.id === selected)
    t.style.opacity = String(Math.min(1, e * 1.5) * s.dim * s.lbl)
    t.classList.toggle('on', n.id === active)
  })
}

/** Zooms so the whole graph fills the view once the layout settles (until the user zooms or pans themselves). */
function fit(nodes: GNode[]) {
  if (!svgEl.value || !wrap.value || !zoomer || userZoomed || nodes.length < 2) return
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) { x0 = Math.min(x0, n.x!); y0 = Math.min(y0, n.y!); x1 = Math.max(x1, n.x! + 120 * (n.kind === 'seed' ? 1 : 0)); y1 = Math.max(y1, n.y!) }
  const { width, height } = wrap.value.getBoundingClientRect()
  if (width <= 0 || height <= 0) return // hidden (kept alive behind another tab)
  // Q2-14: the free area is between the header row (~52 px) and the legend panel at the bottom left.
  const top = 52, bottom = (legendEl.value?.offsetHeight ?? 0) + 24
  const k = Math.max(0.4, Math.min(1.3, (width - 120) / Math.max(1, x1 - x0), (height - top - bottom - 40) / Math.max(1, y1 - y0)))
  const t = d3.zoomIdentity.translate(0, (top - bottom) / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
  const sel = d3.select(svgEl.value)
  if (reduce) sel.call(zoomer.transform, t)
  else sel.transition().duration(900).ease(d3.easeCubicOut).call(zoomer.transform, t)
}

function fitNow() { userZoomed = false; fit(cur) }
function replay() { userZoomed = false; render(true, true); fitNow() }

function resize() {
  if (!svgEl.value || !wrap.value) return
  const { width, height } = wrap.value.getBoundingClientRect()
  if (width <= 0 || height <= 0) return
  W = width; H = height
  d3.select(svgEl.value).attr('viewBox', [-width / 2, -height / 2, width, height].join(' '))
}

onMounted(() => {
  if (!svgEl.value) return
  const svg = d3.select(svgEl.value)
  zoomLayer = svg.append('g').attr('class', 'layer')
  zoomLayer.append('g').attr('class', 'edges')
  partG = zoomLayer.append('g').attr('class', 'parts')
  ringEl = zoomLayer.append('circle').attr('class', 'ring').node()
  zoomLayer.append('g').attr('class', 'nodes')
  zoomer = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 5]).on('zoom', e => {
    if (e.sourceEvent) userZoomed = true
    transform = e.transform
    if (!inactive) ui.saveView('graph', { zoom: { x: e.transform.x, y: e.transform.y, k: e.transform.k } })
    svgEl.value!.style.setProperty('--fs', 10.5 / e.transform.k + 'px')
    zoomLayer!.attr('transform', e.transform.toString())
  })
  svg.call(zoomer).on('dblclick.zoom', null)
  svg.on('click.select', (e: MouseEvent) => { if (e.target === svgEl.value) select(null) })
  resize()
  ro = new ResizeObserver(() => requestAnimationFrame(resize))
  if (wrap.value) ro.observe(wrap.value)
  render(false)
  if (ui.viewState.graph?.zoom) applyView()
})
onBeforeUnmount(() => { sim?.stop(); sim = null; ro?.disconnect(); cancelAnimationFrame(raf); raf = 0 })
onDeactivated(() => { inactive = true; cancelAnimationFrame(raf); raf = 0; tip.value = null })
onActivated(() => {
  if (!inactive) return
  inactive = false
  resize()
  applyView()
  if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(frame) }
})
watch(() => ui.restoreSeq, () => { if (!inactive && ui.activeTabId === 'graph') applyView() })

// Re-render on structural change only (node ids + edges); new nodes bloom in from the centre or their linked node.
const signature = computed(() => data.value.nodes.map(n => n.id + ':' + n.kind).join(',') + '#' + data.value.links.length)
watch(signature, () => render(true))
</script>

<template>
  <div ref="wrap" class="graphwrap">
    <svg ref="svgEl" role="img" aria-label="Vault graph: seeds, kept notes and candidates" />
    <div class="grain" aria-hidden="true" />
    <div class="g-top">
      <button class="g-back" type="button" :disabled="!ui.canBack" :title="ui.backEntry ? 'Back to ' + ui.backEntry.tab.title + ' (⌘[ or Alt+←)' : 'Nothing to go back to'" @click="ui.back()">
        <span aria-hidden="true">←</span> <span class="bt">{{ ui.backEntry ? ui.backEntry.tab.title : 'Back' }}</span>
      </button>
      <div class="eyebrow">Graph · {{ counts.papers }} papers · {{ edgeCounts.all }} citation links<span class="sub"> · {{ counts.seed + counts.lit + counts.note }} notes · {{ counts.lib }} library<template v-if="counts.ghost"> · {{ counts.ghost }} candidates</template></span></div>
    </div>
    <div v-if="!data.nodes.length" class="empty">
      <template v-if="disc.status === 'running'"><b>Resolving seeds…</b> Seed notes appear here first, then candidates grow out of them.</template>
      <template v-else><b>The graph is empty.</b> Build a library from the Library tab: papers above the threshold appear here, linked to the notes they cite.</template>
    </div>
    <div class="g-status">
      <div v-if="lib.status === 'running'" class="g-live" role="status"><i />Library building · passed papers appear when scoring finishes</div>
      <div v-if="disc.status === 'running'" class="g-live" role="status"><i />Run streaming · {{ counts.seed }} seeds · {{ counts.ghost }} candidates shown</div>
      <div v-if="counts.papers > 1 && !edgeCounts.all && lib.status !== 'running' && disc.status !== 'running'" class="g-noedges" role="note">No citation links found: the sources returned no reference lists for these papers (OpenAlex rate-limited?)</div>
    </div>
    <div ref="legendEl" class="g-legend">
      <span><i class="d seed" />Seed note · {{ counts.seed }}</span>
      <span><i class="d note" />Note · {{ counts.lit + counts.note }}</span>
      <span><i class="d lib" />Library · passed top {{ lib.topPercent }}%, ≥ {{ lib.threshold.toFixed(2) }} · {{ counts.lib }}<template v-if="libNodes.length === MAX_LIB"> (first {{ MAX_LIB }})</template></span>
      <span v-if="counts.lib" class="scale" aria-label="Library node size is proportional to the total score: 4 px at 0, 16 px at 1">
        <svg :width="SCALE.length * 34 + 4" height="34" aria-hidden="true"><g v-for="(v, i) in SCALE" :key="v"><circle class="sc" :style="{ '--t': rampPct(v) }" :cx="i * 34 + 17" cy="17" :r="libRadius(v)" /></g></svg>
        <span class="sclbl">size and blue ∝ score · <template v-for="(v, i) in SCALE" :key="v">{{ i ? ' · ' : '' }}{{ v.toFixed(2) }}</template><br>4 px at 0 → 16 px at 1 · vault notes fixed</span>
      </span>
      <span v-if="scoreRange" class="ramp" :aria-label="`Library node colour: light blue = lowest score, dark blue = highest; drawn nodes score ${scoreRange.min.toFixed(2)} to ${scoreRange.max.toFixed(2)}`">
        {{ scoreRange.min.toFixed(2) }}
        <i class="bar" :style="{ '--a': rampPct(scoreRange.min), '--b': rampPct(scoreRange.max) }" />
        {{ scoreRange.max.toFixed(2) }} · score range drawn
      </span>
      <span v-if="counts.ghost"><i class="d ghost" />Candidate · {{ counts.ghost }}</span>
      <span class="lgi" title="Citation link between two papers (one cites the other)"><svg width="22" height="8" aria-hidden="true"><line class="lg cite" x1="1" y1="4" x2="21" y2="4" /></svg>Citation · {{ edgeCounts.cite }}</span>
      <span class="lgi" title="Citation link to or from a seed note"><svg width="22" height="8" aria-hidden="true"><line class="lg seed" x1="1" y1="4" x2="21" y2="4" /></svg>Seed link · {{ edgeCounts.seed }}</span>
    </div>
    <div class="corner">
      <button class="icon-btn" type="button" title="Zoom to fit" aria-label="Zoom to fit" @click="fitNow">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M1.5 5.5v-4h4M10.5 1.5h4v4M14.5 10.5v4h-4M5.5 14.5h-4v-4" /></svg>
      </button>
      <button class="icon-btn" type="button" title="Replay bloom" aria-label="Replay bloom" @click="replay">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M13.5 8a5.5 5.5 0 1 1-1.8-4.1M13 1.5v3h-3" /></svg>
      </button>
    </div>
    <div v-if="tip" class="tip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }"><b>{{ tip.title }}</b><small>{{ tip.sub }}</small></div>
  </div>
</template>

<style scoped>
.graphwrap{position:relative;height:100%;contain:size;min-height:440px;overflow:hidden;background:var(--paper);color:var(--ink);font-family:var(--font-sans);transition:background .4s var(--reveal)}
svg{width:100%;height:100%;display:block;cursor:grab}
svg:active{cursor:grabbing}
.grain{position:absolute;inset:0;pointer-events:none;mix-blend-mode:soft-light;opacity:.5;z-index:1;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.eyebrow,.g-legend,.g-live{font:500 10.5px/1.2 var(--font-mono);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-64)}
.g-top{position:absolute;left:14px;top:12px;z-index:2;display:flex;align-items:center;gap:12px;max-width:calc(100% - 28px)}
.eyebrow{pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-back{display:inline-flex;align-items:center;gap:6px;max-width:240px;border:1px solid var(--ink-26);background:var(--paper-2);color:var(--ink);border-radius:99px;padding:5px 12px 5px 10px;font:600 12px/1 var(--font-sans);cursor:pointer;flex:none;transition:background .4s var(--reveal),border-color .4s var(--reveal)}
.g-back:hover:not(:disabled){background:var(--ink-8);border-color:var(--ink-46)}
.g-back:disabled{opacity:.45;cursor:default}
.g-back:focus-visible{outline:1px solid var(--ink);outline-offset:2px}
.g-back .bt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.empty{position:absolute;inset:42% 20% auto;text-align:center;color:var(--ink-64);font-size:13px;z-index:2}
.empty b{color:var(--ink)}
.g-status{position:absolute;left:18px;top:50px;z-index:2;display:flex;flex-direction:column;gap:6px}
.g-live{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--hair);border-radius:99px;padding:4px 10px;background:var(--paper-2)}
.g-live i{width:6px;height:6px;border-radius:50%;background:var(--accent);animation:blink 1s ease-in-out infinite}
@keyframes blink{50%{opacity:.3}}
@media (prefers-reduced-motion: reduce){.g-live i{animation:none}}
.g-legend{position:absolute;left:12px;bottom:12px;max-width:calc(100% - 140px);z-index:2;display:flex;flex-wrap:wrap;column-gap:16px;row-gap:7px;align-items:center;pointer-events:none;padding:8px 10px;border-radius:8px;border:1px solid var(--hair);background:color-mix(in srgb,var(--paper-2) 94%,transparent);box-shadow:0 1px 6px color-mix(in srgb,var(--ink) 8%,transparent)}
.g-legend span{display:inline-flex;gap:9px;align-items:center}
.g-legend .d{width:9px;height:9px;border-radius:50%;display:inline-block;box-sizing:border-box}
.g-legend .d.seed{background:var(--ink)}
.g-legend .d.note{background:var(--ink-64);width:7px;height:7px;margin:0 1px}
.g-legend .d.lib{border:1px solid var(--ramp-stroke);background:color-mix(in oklch,var(--ramp-hi) 60%,var(--ramp-lo))}
.g-legend .ramp{gap:7px}
.g-legend .ramp .bar{display:inline-block;width:72px;height:9px;border-radius:2px;border:1px solid var(--ramp-stroke);background:linear-gradient(in oklch to right,color-mix(in oklch,var(--ramp-hi) var(--a),var(--ramp-lo)),color-mix(in oklch,var(--ramp-hi) var(--b),var(--ramp-lo)))}
.g-legend .d.ghost{border:1.2px solid var(--ink-64);background:var(--paper)}
.g-legend .scale{gap:8px;align-items:center}
.g-legend .sc{fill:color-mix(in oklch,var(--ramp-hi) var(--t,50%),var(--ramp-lo));stroke:var(--ramp-stroke);stroke-width:1}
.g-legend .sclbl{letter-spacing:.06em;line-height:1.5;text-transform:none}
.corner{position:absolute;right:18px;bottom:16px;z-index:2;display:flex;gap:8px}
.icon-btn{width:2.4rem;height:2.4rem;border-radius:50%;border:1px solid var(--ink-26);background:transparent;color:var(--ink);display:grid;place-items:center;cursor:pointer;transition:background .4s var(--reveal),border-color .4s var(--reveal),transform .4s var(--reveal)}
.icon-btn:hover{background:var(--ink-8);border-color:var(--ink-46)}
.icon-btn:active{transform:scale(.94)}
.icon-btn:focus-visible{outline:1px solid var(--ink);outline-offset:2px}
.tip{position:absolute;pointer-events:none;max-width:300px;background:var(--paper-2);border:1px solid var(--hair);border-radius:4px;padding:8px 10px;font-size:12px;line-height:1.35;color:var(--ink);display:flex;flex-direction:column;gap:3px;z-index:3}
.tip small{color:var(--ink-64);font:500 10px/1.3 var(--font-mono);letter-spacing:.04em}
:deep(.ge){stroke:var(--ink);stroke-width:1;fill:none;transition:stroke .4s var(--reveal)}
:deep(.ge.seed){stroke:var(--accent)}
:deep(.ge.hot){stroke-width:1.2}
.g-legend .lgi{white-space:nowrap;gap:7px}
.g-legend .lg{stroke-width:1.4}
.g-legend .lg.cite{stroke:var(--ink-46)}
.g-legend .lg.seed{stroke:var(--accent)}
.eyebrow .sub{color:var(--ink-46)}
.g-noedges{max-width:420px;border:1px solid var(--hair);border-radius:6px;padding:6px 10px;background:var(--paper-2);color:var(--ink-64);font-size:12px;line-height:1.4}
:deep(.ring){fill:none;stroke:var(--ink-26);stroke-width:1;stroke-dasharray:2 4;pointer-events:none;opacity:0}
:deep(.particle){fill:var(--ink);pointer-events:none}
:deep(.gn){cursor:pointer;outline:none}
:deep(.gn:focus-visible circle){stroke:var(--ink);stroke-width:2}
:deep(.nd.sel){stroke:var(--ink);stroke-width:2.2;paint-order:stroke}
:deep(.nd){transition:fill .4s var(--reveal),stroke .4s var(--reveal)}
:deep(.nd-seed){fill:var(--ink)}
:deep(.nd-lit){fill:var(--ink-80)}
:deep(.nd-note){fill:var(--ink-64)}
:deep(.nd-ghost){fill:var(--paper);stroke:var(--ink-64);stroke-width:1.2}
:deep(.nd-bridge){fill:var(--paper);stroke:var(--ink-64);stroke-width:1.2;stroke-dasharray:2.5 2}
:deep(.nd-lib){fill:color-mix(in oklch,var(--ramp-hi) var(--t,50%),var(--ramp-lo));stroke:var(--ramp-stroke);stroke-width:1}
:deep(.glbl){font:400 var(--fs,10px) var(--font-sans);fill:var(--ink-64);pointer-events:none;transition:fill .4s var(--reveal)}
:deep(.glbl.on){font-weight:700;fill:var(--ink)}
</style>

<style>
/* CR-12: one sequential blue ramp for library nodes (lightest = lowest score, darkest = highest). Light theme: a thin darker
   stroke keeps the lightest blue visible on the paper; dark theme: a lighter stroke keeps the darkest blue visible. */
.graphwrap{--ramp-lo:oklch(0.9 0.05 235);--ramp-hi:oklch(0.36 0.15 262);--ramp-stroke:oklch(0.34 0.12 262 / 0.75)}
@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]) .graphwrap{--ramp-lo:oklch(0.88 0.07 235);--ramp-hi:oklch(0.45 0.18 262);--ramp-stroke:oklch(0.9 0.05 235 / 0.7)} }
:root[data-theme="dark"] .graphwrap{--ramp-lo:oklch(0.88 0.07 235);--ramp-hi:oklch(0.45 0.18 262);--ramp-stroke:oklch(0.9 0.05 235 / 0.7)}
</style>

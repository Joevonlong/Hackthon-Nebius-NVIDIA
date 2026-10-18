"""Seeds -> candidates -> graph + semantic scores -> ranked, explained results."""
from __future__ import annotations

import asyncio
import logging
import re
import time
from collections import defaultdict

from .llm import TokenFactory
from .openalex import OpenAlex, short_id
from .text import abstract_from_index, cosine, norm_title, tfidf_similarity, tokens

log = logging.getLogger(__name__)

# How strongly each kind of link ties a candidate to one seed (the strongest link per seed counts).
RELATION_WEIGHT = {"cites_seed": 1.0, "cited_by_seed": 1.0, "shared_refs": 0.6, "related": 0.4}
RELATION_TEXT = {
    "cites_seed": "cites",
    "cited_by_seed": "is cited by",
    "shared_refs": "shares references with",
    "related": "is listed as related to",
}
GRAPH_WEIGHT, SEMANTIC_WEIGHT = 0.6, 0.4
MAX_POOL = 300
SHARED_REFS_MIN = 3
EXCLUDED_TYPES = {"paratext", "erratum", "retraction", "editorial", "letter"}


def to_paper(w: dict) -> dict:
    ids = w.get("ids") or {}
    loc = w.get("primary_location") or {}
    pmid = re.search(r"(\d+)$", ids.get("pmid") or "")
    authors = [a["author"]["display_name"] for a in w.get("authorships", []) if a.get("author")]
    return {
        "id": short_id(w["id"]),
        "title": w.get("display_name") or "",
        "year": w.get("publication_year"),
        "authors": authors[:6],
        "n_authors": len(authors),
        "venue": (loc.get("source") or {}).get("display_name"),
        "type": w.get("type"),
        "doi": w.get("doi"),
        "pmid": pmid.group(1) if pmid else None,
        "pubmed_url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid.group(1)}/" if pmid else None,
        "openalex_url": w["id"],
        "landing_url": loc.get("landing_page_url"),
        "cited_by_count": w.get("cited_by_count", 0),
        "abstract": abstract_from_index(w.get("abstract_inverted_index")),
    }


async def discover(question: str, raw_seeds: list[str], top_k: int = 12) -> dict:
    t0 = time.time()
    oa, tf = OpenAlex(), TokenFactory()
    try:
        return await _discover(oa, tf, question, raw_seeds, top_k, t0)
    finally:
        await oa.close()


async def _discover(oa: OpenAlex, tf: TokenFactory, question: str, raw_seeds: list[str], top_k: int, t0: float) -> dict:
    # 1. Resolve seeds.
    resolved = await asyncio.gather(*(oa.resolve(s) for s in raw_seeds))
    seeds, unresolved = [], []
    for raw, w in zip(raw_seeds, resolved):
        (seeds if w else unresolved).append(w if w else raw)
    if not seeds:
        raise ValueError("None of the seed papers could be found in OpenAlex.")
    seed_ids = {short_id(s["id"]) for s in seeds}
    seed_dois = {s.get("doi") for s in seeds if s.get("doi")}
    seed_titles = {norm_title(s.get("display_name") or "") for s in seeds}
    seed_refs = [set(map(short_id, s.get("referenced_works", []))) for s in seeds]

    # 2. Expand: references, citing papers, related works.
    links: dict[str, dict[int, str]] = defaultdict(dict)  # candidate -> {seed index: strongest relation}
    meta: dict[str, dict] = {}

    def link(cid: str, seed_idx: int, relation: str) -> None:
        if cid in seed_ids:
            return
        current = links[cid].get(seed_idx)
        if current is None or RELATION_WEIGHT[relation] > RELATION_WEIGHT[current]:
            links[cid][seed_idx] = relation

    citing_lists = await asyncio.gather(*(oa.citing(s["id"]) for s in seeds))
    for i, (seed, citing) in enumerate(zip(seeds, citing_lists)):
        for ref in seed.get("referenced_works", []):
            link(short_id(ref), i, "cited_by_seed")
        for rel in seed.get("related_works", []):
            link(short_id(rel), i, "related")
        for w in citing:
            cid = short_id(w["id"])
            meta[cid] = w
            link(cid, i, "cites_seed")

    def graph_score(cid: str) -> float:
        return sum(RELATION_WEIGHT[r] for r in links[cid].values())

    # 3. Keep the best-connected pool and fetch any missing metadata.
    pool = sorted(links, key=graph_score, reverse=True)[:MAX_POOL]
    missing = [c for c in pool if c not in meta]
    for w in await oa.works(missing):
        meta[short_id(w["id"])] = w

    # Bibliographic coupling: candidate and seed cite several of the same papers.
    for cid in pool:
        refs = set(map(short_id, (meta.get(cid) or {}).get("referenced_works", [])))
        for i, srefs in enumerate(seed_refs):
            if len(refs & srefs) >= SHARED_REFS_MIN:
                link(cid, i, "shared_refs")

    # 4. Build candidate records; drop seeds, duplicates, and non-research items.
    candidates, seen_titles, seen_dois = [], set(), set()
    for cid in pool:
        w = meta.get(cid)
        if not w or not w.get("display_name") or w.get("type") in EXCLUDED_TYPES:
            continue
        p = to_paper(w)
        nt = norm_title(p["title"])
        if p["doi"] in seed_dois or nt in seed_titles or nt in seen_titles or (p["doi"] and p["doi"] in seen_dois):
            continue
        seen_titles.add(nt)
        if p["doi"]:
            seen_dois.add(p["doi"])
        p["connections"] = [{"seed": i, "relation": r} for i, r in sorted(links[cid].items())]
        p["connection_text"] = describe_connections(p["connections"], seeds)
        p["graph"] = graph_score(cid)
        candidates.append(p)

    # 5. Semantic score against the question plus seed titles.
    query = question + "\n" + "\n".join(s.get("display_name") or "" for s in seeds)
    docs = [f"{c['title']}. {c['abstract']}" for c in candidates]
    vectors = await tf.embed([query] + docs) if candidates else None
    if vectors:
        sims = [cosine(vectors[0], v) for v in vectors[1:]]
        semantic_mode = f"token-factory:{tf.embed_model}"
    else:
        sims = tfidf_similarity(query, docs)
        semantic_mode = "local-tfidf"

    max_graph = max((c["graph"] for c in candidates), default=1.0) or 1.0
    lo, hi = (min(sims), max(sims)) if sims else (0.0, 1.0)
    for c, s in zip(candidates, sims):
        graph = c.pop("graph")
        g_norm = graph / max_graph
        s_norm = (s - lo) / (hi - lo) if hi > lo else 0.0
        c["scores"] = {
            "graph": round(graph, 2),
            "graph_norm": round(g_norm, 3),
            "semantic": round(s, 4),
            "semantic_norm": round(s_norm, 3),
            "final": round(GRAPH_WEIGHT * g_norm + SEMANTIC_WEIGHT * s_norm, 4),
        }
    candidates.sort(key=lambda c: c["scores"]["final"], reverse=True)
    top = candidates[:top_k]

    # 6. Grounded explanations for the top results.
    seed_title_list = [s.get("display_name") or "" for s in seeds]
    explanations = await asyncio.gather(*(tf.explain(question, seed_title_list, c) for c in top))
    for rank, (c, exp) in enumerate(zip(top, explanations), start=1):
        c["rank"] = rank
        c["explanation"] = exp or template_explanation(c, question)

    return {
        "question": question,
        "seeds": [{**to_paper(s), "index": i} for i, s in enumerate(seeds)],
        "unresolved": unresolved,
        "results": top,
        "stats": {
            "candidates_considered": len(candidates),
            "with_abstract": sum(1 for c in candidates if c["abstract"]),
            "semantic_mode": semantic_mode,
            "explanation_mode": f"token-factory:{tf.chat_model}" if tf.enabled else "template (no Token Factory key)",
            "elapsed_s": round(time.time() - t0, 1),
        },
    }


def describe_connections(conns: list[dict], seeds: list[dict]) -> str:
    by_rel: dict[str, list[str]] = defaultdict(list)
    for c in conns:
        by_rel[c["relation"]].append(f"seed {c['seed'] + 1} ({(seeds[c['seed']].get('display_name') or '')[:60]})")
    parts = [f"{RELATION_TEXT[r]} {', '.join(v)}" for r, v in by_rel.items()]
    return "This paper " + "; ".join(parts) + "." if parts else "No direct link to the seeds."


def template_explanation(c: dict, question: str) -> dict:
    """Used when Token Factory is unavailable or the paper has no abstract."""
    overlap = sorted(set(tokens(question)) & set(tokens(c["title"] + " " + c["abstract"])))
    reason = c["connection_text"]
    if overlap:
        reason += " Shares terms with your question: " + ", ".join(overlap[:6]) + "."
    return {
        "verdict": None,
        "reason": reason,
        "evidence_quote": "",
        "quote_verified": False,
        "uncertainty": "No abstract available, so relevance is inferred from citation links only."
        if not c["abstract"] else "Not assessed by a language model; based on citation links and term overlap.",
        "model": None,
    }

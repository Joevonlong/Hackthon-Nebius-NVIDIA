"""Text helpers: abstract reconstruction, local similarity fallback, quote verification."""
from __future__ import annotations

import math
import re
from collections import Counter

STOP = set("""
a an and are as at be by for from has have in into is it its of on or that the their this to was
were which with we our these those using use used via than between within among also can may not
study studies paper results result show shows shown here based both two one new
""".split())


def abstract_from_index(index: dict | None) -> str:
    """OpenAlex stores abstracts as {word: [positions]}; rebuild the text."""
    if not index:
        return ""
    slots: dict[int, str] = {}
    for word, positions in index.items():
        for p in positions:
            slots[p] = word
    return " ".join(slots[i] for i in sorted(slots))


def tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9][a-z0-9\-]+", text.lower()) if t not in STOP and len(t) > 2]


def tfidf_similarity(query: str, docs: list[str]) -> list[float]:
    """Cosine similarity between query and each doc using TF-IDF over the doc set."""
    doc_toks = [Counter(tokens(d)) for d in docs]
    q = Counter(tokens(query))
    n = len(docs) + 1
    df: Counter = Counter()
    for c in doc_toks + [q]:
        df.update(c.keys())
    idf = {t: math.log(n / df[t]) + 1 for t in df}

    def vec(c: Counter) -> dict[str, float]:
        return {t: f * idf[t] for t, f in c.items()}

    qv = vec(q)
    qn = math.sqrt(sum(v * v for v in qv.values())) or 1.0
    out = []
    for c in doc_toks:
        dv = vec(c)
        dn = math.sqrt(sum(v * v for v in dv.values())) or 1.0
        out.append(sum(qv[t] * dv.get(t, 0.0) for t in qv) / (qn * dn))
    return out


def cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a)) or 1.0
    nb = math.sqrt(sum(y * y for y in b)) or 1.0
    return dot / (na * nb)


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def quote_in_text(quote: str, text: str) -> bool:
    """True when every fragment of the quote (split on ellipses) appears verbatim in text."""
    parts = [p for p in re.split(r"\.\.\.|…", quote) if _norm(p)]
    if not parts:
        return False
    body = _norm(text)
    return all(_norm(p) in body for p in parts)


def norm_title(title: str) -> str:
    return _norm(title)

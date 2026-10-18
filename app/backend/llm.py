"""Nebius Token Factory: embeddings for semantic scoring, Nemotron for grounded explanations."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re

from openai import AsyncOpenAI

from .text import quote_in_text

log = logging.getLogger(__name__)

SYSTEM = (
    "You help a biomedical researcher decide which papers to read next. "
    "Use ONLY the supplied abstract and connection facts. Never invent findings. "
    "Reply with a single JSON object and nothing else."
)

PROMPT = """Research question: {question}

The researcher's seed papers:
{seeds}

Candidate paper: {title} ({year})
How it connects to the seeds: {connections}

Candidate abstract:
\"\"\"{abstract}\"\"\"

Return JSON with these keys:
- "verdict": one of "useful", "uncertain", "not_useful" for answering the research question
- "reason": at most two sentences on why this paper matters for the question, grounded in the abstract
- "evidence_quote": one short passage (under 40 words) copied EXACTLY from the abstract that supports the reason, or "" if none
- "uncertainty": one sentence on what the abstract does not let you assess
"""


class TokenFactory:
    def __init__(self) -> None:
        key = os.getenv("TOKEN_FACTORY_API_KEY") or os.getenv("NEBIUS_API_KEY")
        self.enabled = bool(key)
        self.chat_model = os.getenv("CHAT_MODEL", "nvidia/Nemotron-3_5-Lightning")
        self.embed_model = os.getenv("EMBED_MODEL", "Qwen/Qwen3-Embedding-8B")
        self.embed_ok = self.enabled
        self.client = AsyncOpenAI(
            base_url=os.getenv("TOKEN_FACTORY_BASE_URL", "https://api.tokenfactory.nebius.com/v1/"),
            api_key=key,
        ) if key else None
        self.sem = asyncio.Semaphore(int(os.getenv("LLM_CONCURRENCY", "6")))

    async def embed(self, texts: list[str]) -> list[list[float]] | None:
        """Embed texts in batches; returns None (caller falls back) if embeddings are unavailable."""
        if not self.embed_ok or not self.client:
            return None
        out: list[list[float]] = []
        try:
            for i in range(0, len(texts), 64):
                batch = [t[:4000] or " " for t in texts[i:i + 64]]
                resp = await self.client.embeddings.create(model=self.embed_model, input=batch)
                out.extend(d.embedding for d in resp.data)
            return out
        except Exception as exc:  # noqa: BLE001 - any failure means "use the local fallback"
            log.warning("Embeddings unavailable (%s); using local similarity", exc)
            self.embed_ok = False
            return None

    async def explain(self, question: str, seed_titles: list[str], cand: dict) -> dict | None:
        if not self.client or not cand["abstract"]:
            return None
        prompt = PROMPT.format(
            question=question,
            seeds="\n".join(f"- {t}" for t in seed_titles),
            title=cand["title"],
            year=cand["year"] or "n.d.",
            connections=cand["connection_text"],
            abstract=cand["abstract"][:6000],
        )
        try:
            async with self.sem:
                resp = await self.client.chat.completions.create(
                    model=self.chat_model,
                    max_tokens=1200,
                    temperature=0.2,
                    messages=[{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
                )
            data = parse_json(resp.choices[0].message.content or "")
        except Exception as exc:  # noqa: BLE001
            log.warning("Explanation failed for %s: %s", cand["id"], exc)
            return None
        if not data:
            return None
        quote = str(data.get("evidence_quote") or "").strip().strip('"“”')
        return {
            "verdict": data.get("verdict", "uncertain"),
            "reason": data.get("reason", ""),
            "evidence_quote": quote,
            "quote_verified": bool(quote) and quote_in_text(quote, cand["abstract"]),
            "uncertainty": data.get("uncertainty", ""),
            "model": self.chat_model,
        }


def parse_json(text: str) -> dict | None:
    """Pull the first JSON object out of a model reply, ignoring any <think> block or code fences."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.S)
    match = re.search(r"\{.*\}", text, flags=re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None

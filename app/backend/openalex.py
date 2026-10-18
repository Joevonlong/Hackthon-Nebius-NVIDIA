"""OpenAlex client with a file cache, so repeated demo queries are fast and survive rate limits."""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
from pathlib import Path

import httpx

log = logging.getLogger(__name__)

BASE = "https://api.openalex.org"
SELECT = ",".join([
    "id", "doi", "ids", "display_name", "publication_year", "type",
    "authorships", "primary_location", "abstract_inverted_index",
    "cited_by_count", "referenced_works", "related_works",
])
BATCH = 50


def short_id(openalex_url: str) -> str:
    """'https://openalex.org/W123' -> 'W123'."""
    return openalex_url.rsplit("/", 1)[-1]


class OpenAlex:
    def __init__(self) -> None:
        self.cache_dir = Path(os.getenv("CACHE_DIR", ".cache"))
        self.api_key = os.getenv("OPENALEX_API_KEY")
        self.mailto = os.getenv("OPENALEX_MAILTO")
        self.client = httpx.AsyncClient(timeout=30, headers={"User-Agent": "seed2discover/0.1"})
        self.sem = asyncio.Semaphore(5)

    async def close(self) -> None:
        await self.client.aclose()

    async def get(self, path: str, params: dict | None = None) -> dict | None:
        params = dict(params or {})
        key = hashlib.sha1((path + json.dumps(params, sort_keys=True)).encode()).hexdigest()
        cached = self.cache_dir / f"{key}.json"
        if cached.exists():
            return json.loads(cached.read_text())

        if self.api_key:
            params["api_key"] = self.api_key
        if self.mailto:
            params["mailto"] = self.mailto

        for attempt in range(3):
            async with self.sem:
                resp = await self.client.get(BASE + path, params=params)
            if resp.status_code == 404:
                return None
            if resp.status_code == 429 and attempt < 2:
                await asyncio.sleep(2 * (attempt + 1))
                continue
            resp.raise_for_status()
            data = resp.json()
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            cached.write_text(json.dumps(data))
            return data
        return None

    async def resolve(self, raw: str) -> dict | None:
        """Resolve a DOI, DOI URL, PMID, PubMed URL, OpenAlex ID, or title to an OpenAlex work."""
        s = raw.strip()
        if not s:
            return None
        doi = re.search(r"(10\.\d{4,9}/\S+)", s)
        pmid = re.search(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d+)", s) or re.fullmatch(r"(?:pmid:)?(\d{5,9})", s, re.I)
        oa = re.search(r"\b(W\d+)\b", s)
        if doi:
            return await self.get(f"/works/doi:{doi.group(1).rstrip('.,;')}", {"select": SELECT})
        if pmid:
            return await self.get(f"/works/pmid:{pmid.group(1)}", {"select": SELECT})
        if oa:
            return await self.get(f"/works/{oa.group(1)}", {"select": SELECT})
        found = await self.get("/works", {"search": s, "per_page": 1, "select": SELECT})
        return (found or {}).get("results", [None])[0]

    async def citing(self, work_id: str, n: int = 50) -> list[dict]:
        """Papers that cite the given work, most-cited first."""
        data = await self.get("/works", {
            "filter": f"cites:{short_id(work_id)}",
            "per_page": n,
            "sort": "cited_by_count:desc",
            "select": SELECT,
        })
        return (data or {}).get("results", [])

    async def works(self, ids: list[str]) -> list[dict]:
        """Batch-fetch metadata for many OpenAlex IDs."""
        chunks = [ids[i:i + BATCH] for i in range(0, len(ids), BATCH)]

        async def one(chunk: list[str]) -> list[dict]:
            data = await self.get("/works", {
                "filter": "openalex:" + "|".join(short_id(i) for i in chunk),
                "per_page": BATCH,
                "select": SELECT,
            })
            return (data or {}).get("results", [])

        out: list[dict] = []
        for part in await asyncio.gather(*(one(c) for c in chunks)):
            out.extend(part)
        return out

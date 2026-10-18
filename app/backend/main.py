"""FastAPI app: serves the single-page UI and the /api/discover endpoint."""
from __future__ import annotations

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, HTTPException  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from .llm import TokenFactory  # noqa: E402
from .pipeline import discover  # noqa: E402

logging.basicConfig(level=logging.INFO)
logging.getLogger("httpx").setLevel(logging.WARNING)
FRONTEND = Path(__file__).resolve().parent.parent / "frontend"

EXAMPLE = {
    "question": "Which single-cell methods help study melanoma immune cells?",
    "seeds": [
        "https://doi.org/10.1126/science.aad0501",
        "https://doi.org/10.1016/j.cell.2018.10.038",
        "https://doi.org/10.1038/s41586-021-03704-y",
        "https://doi.org/10.1038/s41586-022-04682-5",
        "https://doi.org/10.1158/1078-0432.CCR-21-1694",
    ],
}

app = FastAPI(title="Seed2Discover")


class DiscoverRequest(BaseModel):
    question: str = Field(min_length=3)
    seeds: list[str] = Field(min_length=1, max_length=10)
    top_k: int = Field(default=12, ge=1, le=30)


@app.get("/api/health")
def health() -> dict:
    tf = TokenFactory()
    return {
        "ok": True,
        "token_factory": tf.enabled,
        "chat_model": tf.chat_model,
        "embed_model": tf.embed_model,
        "openalex_key": bool(os.getenv("OPENALEX_API_KEY")),
    }


@app.get("/api/example")
def example() -> dict:
    return EXAMPLE


@app.post("/api/discover")
async def run_discover(req: DiscoverRequest) -> dict:
    seeds = [s for s in req.seeds if s.strip()]
    try:
        return await discover(req.question.strip(), seeds, req.top_k)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


app.mount("/", StaticFiles(directory=FRONTEND, html=True), name="frontend")

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
from contextlib import asynccontextmanager

import faiss
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from services.analysis import CONFIDENCE_THRESHOLD, analyze_rfi
from services.storage import (
    add_audit_log,
    create_rfi,
    get_rfi,
    initialize_database,
    list_audit_logs,
    list_rfis,
    update_review,
)


API_DIR = Path(__file__).resolve().parent
CHUNKS_FILE = API_DIR / "data" / "chunks.json"

@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(
    title="RFI Pre-Screener API",
    description="Evidence-first construction RFI screening API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class RFIRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    question: str = Field(min_length=1, max_length=10_000)
    trade: str = Field(min_length=1, max_length=100)
    drawing_reference: str = Field(default="", max_length=200)
    urgency: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"


class ReviewRequest(BaseModel):
    rfi_id: str = Field(min_length=1)
    decision: Literal["APPROVED", "DEFLECTED"]
    reviewer: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=5_000)
    edited_draft: dict[str, str] | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _public_item(item: dict) -> dict:
    analysis = item["analysis"]
    return {
        **{key: item[key] for key in (
            "id", "title", "question", "trade", "drawing_reference",
            "urgency", "status", "created_at",
        )},
        "updated_at": item.get("updated_at", item["created_at"]),
        "analysis": analysis,
        "audit_logs": list_audit_logs(item["id"]),
    }


@app.get("/health")
def health_check():
    return {"success": True, "message": "RFI Pre-Screener API is running"}


@app.get("/faiss-check")
def faiss_check():
    vectors = np.array([[1, 0], [0, 1]], dtype="float32")
    index = faiss.IndexFlatIP(2)
    index.add(vectors)
    scores, ids = index.search(np.array([[1, 0]], dtype="float32"), 1)
    return {
        "success": True,
        "faiss_version": faiss.__version__,
        "nearest_vector_id": int(ids[0][0]),
        "similarity": float(scores[0][0]),
    }


@app.get("/api/specs")
def specs():
    if not CHUNKS_FILE.exists():
        raise HTTPException(status_code=500, detail="Specification metadata is missing.")
    chunks = json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))
    return {"success": True, "count": len(chunks), "specs": chunks}


@app.post("/api/rfi/analyze", status_code=201)
def analyze(request: RFIRequest):
    try:
        analysis = analyze_rfi(
            request.question, request.trade, request.drawing_reference
        )
        item = create_rfi({
            "id": str(uuid.uuid4()),
            "title": request.title.strip(),
            "question": request.question.strip(),
            "trade": request.trade.strip(),
            "drawing_reference": request.drawing_reference.strip(),
            "urgency": request.urgency,
            "analysis": analysis,
            "status": "PENDING_REVIEW",
            "created_at": _now(),
        })
        return {"success": True, "inquiry": _public_item(item)}
    except Exception as error:
        print(f"RFI analysis failed: {type(error).__name__}: {error}")
        raise HTTPException(
            status_code=502,
            detail="RFI analysis could not be completed. Check backend configuration.",
        ) from error


@app.get("/api/rfi/queue")
def queue():
    items = [_public_item(item) for item in list_rfis()]
    return {"success": True, "count": len(items), "inquiries": items}


@app.post("/api/rfi/review")
def review(request: ReviewRequest):
    item = get_rfi(request.rfi_id)
    if not item:
        raise HTTPException(status_code=404, detail="RFI inquiry not found.")
    if item["status"] != "PENDING_REVIEW":
        raise HTTPException(status_code=409, detail="This RFI has already been reviewed.")

    analysis = dict(item["analysis"])
    if request.edited_draft is not None:
        required = {
            "subject", "clarified_question", "suggested_solution",
            "cost_impact", "schedule_impact",
        }
        if set(request.edited_draft) != required or not all(
            isinstance(value, str) for value in request.edited_draft.values()
        ):
            raise HTTPException(status_code=400, detail="The edited RFI draft is invalid.")
        analysis["draft"] = request.edited_draft

    if (
        request.decision == "DEFLECTED"
        and (
            float(analysis.get("confidence", 0)) < CONFIDENCE_THRESHOLD
            or not any(quote.get("verified") for quote in analysis.get("supporting_quotes", []))
        )
    ):
        raise HTTPException(
            status_code=400,
            detail="Deflection requires confidence of at least 0.80 and verified evidence.",
        )

    previous_status = item["status"]
    update_review(request.rfi_id, analysis, request.decision, request.notes.strip())
    add_audit_log({
        "id": str(uuid.uuid4()),
        "rfi_id": request.rfi_id,
        "action": "REVIEWED",
        "reviewer": request.reviewer.strip(),
        "notes": request.notes.strip() or "No additional notes.",
        "previous_status": previous_status,
        "new_status": request.decision,
        "timestamp": _now(),
    })
    updated = get_rfi(request.rfi_id)
    return {
        "success": True,
        "message": f"RFI {request.decision.lower()} successfully.",
        "inquiry": _public_item(updated) if updated else None,
    }

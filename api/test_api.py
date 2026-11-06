from pathlib import Path

from fastapi.testclient import TestClient

import main
from services import storage
from services.analysis import verify_quote


def test_quote_verification_is_exact_after_whitespace_normalization():
    source = "Concrete shall be placed in accordance with the approved mix design."
    assert verify_quote("Concrete   shall be placed in accordance with the approved mix design.", source)
    assert not verify_quote("Concrete shall always be placed by a licensed engineer.", source)


def test_rfi_lifecycle_persists_review_and_audit(tmp_path: Path, monkeypatch):
    database_file = tmp_path / "rfi.sqlite3"
    monkeypatch.setattr(storage, "SQLITE_FILE", database_file)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("NEON_DATABASE_URL", raising=False)
    monkeypatch.setattr(
        main,
        "analyze_rfi",
        lambda *_args: {
            "provider": "FALLBACK",
            "fallback_reason": "test",
            "preliminary_assessment": "FALLBACK",
            "recommendation": "VALID_GAP_ESCALATE_TO_ARCHITECT",
            "confidence": 0.79,
            "specification_sections": [],
            "supporting_quotes": [],
            "relevance_explanation": "test",
            "potential_gaps": [],
            "follow_up_questions": [],
            "human_review_recommendation": "Required",
            "draft": {
                "subject": "Test",
                "clarified_question": "Test question",
                "suggested_solution": "Review",
                "cost_impact": "Unknown",
                "schedule_impact": "Unknown",
            },
        },
    )

    with TestClient(main.app) as client:
        response = client.post(
            "/api/rfi/analyze",
            json={"title": "Test RFI", "question": "Test question", "trade": "Concrete"},
        )
        assert response.status_code == 201
        rfi_id = response.json()["inquiry"]["id"]

        review = client.post(
            "/api/rfi/review",
            json={
                "rfi_id": rfi_id,
                "decision": "APPROVED",
                "reviewer": "Test reviewer",
                "notes": "Reviewed.",
            },
        )
        assert review.status_code == 200
        assert review.json()["inquiry"]["status"] == "APPROVED"
        assert len(review.json()["inquiry"]["audit_logs"]) == 1

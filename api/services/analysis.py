import json
import os
import re
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from services.retrieval import API_DIR, retrieve_relevant_specs


CONFIDENCE_THRESHOLD = 0.80


def _env_value(name: str, default: str) -> str:
    value = os.getenv(name)
    if value:
        return value

    env_file = API_DIR.parent / ".env.local"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith(f"{name}="):
                return line.split("=", 1)[1].strip().strip('"').strip("'") or default
    return default


def _normalize_quote(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def verify_quote(quote: str | None, source_text: str) -> bool:
    return bool(quote and _normalize_quote(quote) in _normalize_quote(source_text))


def _fallback(question: str, trade: str, drawing_reference: str,
              retrieved: list[dict[str, Any]], reason: str) -> dict[str, Any]:
    best = retrieved[0] if retrieved else None
    quote = best["text"] if best else None
    verified = verify_quote(quote, best["text"]) if best else False
    return {
        "provider": "FALLBACK",
        "fallback_reason": reason,
        "preliminary_assessment": (
            "FALLBACK: deterministic screening only; a human reviewer must assess "
            "the RFI before any project decision."
        ),
        "recommendation": "VALID_GAP_ESCALATE_TO_ARCHITECT",
        "confidence": min(float(best["similarity"]), 0.79) if best else 0.0,
        "specification_sections": retrieved,
        "supporting_quotes": [
            {
                "quote": quote,
                "section_id": best["section_id"] if best else None,
                "verified": verified,
            }
        ] if best else [],
        "relevance_explanation": (
            "Retrieved specification text is shown as context. No generation model "
            "interpretation was available."
        ),
        "potential_gaps": ["Confirm the project-specific condition and design intent."],
        "follow_up_questions": ["What exact field condition or drawing detail needs resolution?"],
        "human_review_recommendation": "Required. This result is FALLBACK output.",
        "draft": {
            "subject": f"RFI - {trade} - {drawing_reference or 'No drawing reference'}",
            "clarified_question": question,
            "suggested_solution": "Please review the condition and provide direction.",
            "cost_impact": "To be determined by the project team.",
            "schedule_impact": "To be determined by the project team.",
        },
    }


def _generate_with_gemini(question: str, retrieved: list[dict[str, Any]]) -> dict[str, Any]:
    api_key = _env_value("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is not configured.")

    model = _env_value("GEMINI_GENERATION_MODEL", "gemini-2.5-flash").strip()
    evidence = "\n\n".join(
        f"[{item['section_id']} - {item['title']}]\n{item['text']}"
        for item in retrieved
    )
    prompt = f"""Analyze this construction RFI using only the supplied evidence.
Do not invent project facts, clause numbers, or quotes. Every supporting quote must
be copied exactly from the evidence. Return JSON matching this shape:
{{
  "preliminary_assessment": "string",
  "recommendation": "DEFLECT_ALREADY_IN_SPECS | VALID_GAP_ESCALATE_TO_ARCHITECT",
  "confidence": 0.0,
  "supporting_quotes": [{{"quote": "string", "section_id": "string"}}],
  "relevance_explanation": "string",
  "potential_gaps": ["string"],
  "follow_up_questions": ["string"],
  "human_review_recommendation": "string",
  "draft": {{"subject": "string", "clarified_question": "string",
    "suggested_solution": "string", "cost_impact": "string",
    "schedule_impact": "string"}}
}}

RFI question:
{question}

Retrieved specification evidence:
{evidence}
"""
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "responseMimeType": "application/json",
            "temperature": 0.1,
        },
    }
    request = Request(
        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=60) as response:
            result = json.loads(response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError) as error:
        raise RuntimeError(f"Gemini generation failed: {error}") from error

    text = result["candidates"][0]["content"]["parts"][0]["text"]
    parsed = json.loads(text)
    parsed["provider"] = "GEMINI"
    parsed["specification_sections"] = retrieved
    return parsed


def analyze_rfi(
    question: str, trade: str, drawing_reference: str
) -> dict[str, Any]:
    retrieved = retrieve_relevant_specs(question, top_k=5)
    if not retrieved:
        return _fallback(
            question, trade, drawing_reference, [], "No specification evidence was retrieved."
        )

    try:
        result = _generate_with_gemini(question, retrieved)
    except (RuntimeError, ValueError, KeyError, json.JSONDecodeError) as error:
        return _fallback(
            question, trade, drawing_reference, retrieved, str(error)
        )

    valid_sections = {item["section_id"]: item["text"] for item in retrieved}
    verified_quotes = []
    for item in result.get("supporting_quotes", []):
        quote = item.get("quote") if isinstance(item, dict) else None
        section_id = item.get("section_id") if isinstance(item, dict) else None
        source = valid_sections.get(section_id, "")
        verified_quotes.append({
            "quote": quote,
            "section_id": section_id,
            "verified": verify_quote(quote, source),
        })
    result["supporting_quotes"] = verified_quotes
    result["confidence"] = max(0.0, min(1.0, float(result.get("confidence", 0))))
    if result["confidence"] < CONFIDENCE_THRESHOLD:
        result["human_review_recommendation"] = (
            "Required: confidence is below the 0.80 threshold."
        )
    return result

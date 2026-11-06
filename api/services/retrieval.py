
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

import faiss
import numpy as np


API_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = API_DIR / "data"

INDEX_FILE = DATA_DIR / "index.faiss"
CHUNKS_FILE = DATA_DIR / "chunks.json"

MODEL = os.getenv("GEMINI_EMBEDDING_MODEL", "models/gemini-embedding-2")
DIMENSIONS = 768


def load_api_key():
    if os.getenv("GEMINI_API_KEY"):
        return os.environ["GEMINI_API_KEY"]

    root_dir = API_DIR.parent
    env_file = root_dir / ".env.local"

    if not env_file.exists():
        raise FileNotFoundError(".env.local not found.")

    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("GEMINI_API_KEY="):
            key = line.split("=", 1)[1].strip().strip('"').strip("'")
            if key:
                return key

    raise ValueError("GEMINI_API_KEY is missing.")


def generate_embedding(text: str) -> np.ndarray:
    api_key = load_api_key()

    url = (
        "https://generativelanguage.googleapis.com/"
        "v1beta/models/gemini-embedding-2:embedContent"
    )

    payload = {
        "model": MODEL,
        "content": {
            "parts": [{"text": text}]
        },
        "outputDimensionality": DIMENSIONS,
    }

    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": api_key,
        },
        method="POST",
    )

    with urlopen(request, timeout=60) as response:
        result = json.loads(response.read().decode("utf-8"))

    vector = np.array(
        result["embedding"]["values"],
        dtype="float32",
    )

    if vector.shape[0] != DIMENSIONS:
        raise ValueError("Unexpected embedding dimensions.")

    vector = vector.reshape(1, -1)
    faiss.normalize_L2(vector)

    return vector


def retrieve_relevant_specs(
    query: str,
    top_k: int = 5,
) -> list[dict]:
    if not query.strip():
        raise ValueError("RFI question cannot be empty.")

    if not INDEX_FILE.exists() or not CHUNKS_FILE.exists():
        raise FileNotFoundError("FAISS index or chunks.json is missing.")

    index = faiss.read_index(str(INDEX_FILE))

    with CHUNKS_FILE.open("r", encoding="utf-8") as file:
        chunks = json.load(file)

    if index.ntotal != len(chunks):
        raise ValueError("FAISS index and chunk metadata do not match.")

    query_vector = generate_embedding(query)

    k = min(top_k, index.ntotal)
    scores, ids = index.search(query_vector, k)

    results = []

    for score, chunk_id in zip(scores[0], ids[0]):
        if chunk_id < 0:
            continue

        chunk = chunks[int(chunk_id)]

        results.append({
            **chunk,
            "similarity": round(float(score), 4),
        })

    return results

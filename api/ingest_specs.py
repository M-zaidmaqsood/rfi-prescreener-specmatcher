
import json
import time
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

import faiss
import numpy as np


ROOT_DIR = Path(__file__).resolve().parents[1]
SPECS_FILE = ROOT_DIR / "data" / "specs.json"
OUTPUT_DIR = ROOT_DIR / "api" / "data"

MODEL = "models/gemini-embedding-2"
DIMENSIONS = 768


def load_api_key():
    env_file = ROOT_DIR / ".env.local"

    if not env_file.exists():
        raise FileNotFoundError(".env.local not found.")

    for line in env_file.read_text(encoding="utf-8").splitlines():
        if line.strip().startswith("GEMINI_API_KEY="):
            key = line.split("=", 1)[1].strip().strip('"').strip("'")
            if key:
                return key

    raise ValueError("GEMINI_API_KEY is missing.")


def generate_embedding(text, api_key):
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

    if len(vector) != DIMENSIONS:
        raise ValueError(
            f"Expected {DIMENSIONS} dimensions, got {len(vector)}."
        )

    return vector


def main():
    api_key = load_api_key()

    if not SPECS_FILE.exists():
        raise FileNotFoundError(f"Specifications not found: {SPECS_FILE}")

    specs = json.loads(SPECS_FILE.read_text(encoding="utf-8"))

    if not specs:
        raise ValueError("No specifications found.")

    vectors = []
    chunks = []

    print(f"Found {len(specs)} specification sections.")

    for number, spec in enumerate(specs, start=1):
        section_number = spec["sectionNumber"]
        title = spec["title"]
        content = spec["content"]

        # Include section information to give Gemini context.
        embedding_text = (
            f"Section: {section_number}\n"
            f"Title: {title}\n"
            f"Specification: {content}"
        )

        print(f"Embedding {number}/{len(specs)}: {section_number}")

        vector = generate_embedding(embedding_text, api_key)
        vectors.append(vector)

        chunks.append({
            "id": spec["id"],
            "section_id": section_number,
            "title": title,
            "clause_ref": None,
            "text": content,
        })

        # Small delay between API requests.
        if number < len(specs):
            time.sleep(1)

    # FAISS inner product becomes cosine similarity
    # when all vectors are L2-normalized.
    vector_matrix = np.array(vectors, dtype="float32")
    faiss.normalize_L2(vector_matrix)

    index = faiss.IndexFlatIP(DIMENSIONS)
    index.add(vector_matrix)

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    index_path = OUTPUT_DIR / "index.faiss"
    chunks_path = OUTPUT_DIR / "chunks.json"

    faiss.write_index(index, str(index_path))

    chunks_path.write_text(
        json.dumps(chunks, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    print("\nSpecification ingestion: SUCCESS")
    print(f"Sections indexed: {index.ntotal}")
    print(f"Embedding dimensions: {DIMENSIONS}")
    print(f"FAISS index: {index_path}")
    print(f"Chunk metadata: {chunks_path}")


if __name__ == "__main__":
    try:
        main()
    except HTTPError as error:
        print(f"Gemini API error: HTTP {error.code}")
        print(error.read().decode("utf-8"))
    except URLError as error:
        print(f"Network error: {error.reason}")
    except Exception as error:
        print(f"Ingestion failed: {error}")
        raise

import faiss
import numpy as np

from fastapi import FastAPI

app = FastAPI(
    title="RFI Pre-Screener API",
    description="Backend API for construction RFI analysis",
    version="0.1.0",
)


@app.get("/health")
def health_check():
    return {
        "success": True,
        "message": "RFI Pre-Screener API is running",
    }


@app.get("/faiss-check")
def faiss_check():
    vectors = np.array(
        [[1, 0], [0, 1]],
        dtype="float32",
    )

    index = faiss.IndexFlatIP(2)
    index.add(vectors)

    query = np.array([[1, 0]], dtype="float32")

    scores, ids = index.search(query, 1)

    return {
        "success": True,
        "faiss_version": faiss.__version__,
        "nearest_vector_id": int(ids[0][0]),
        "similarity": float(scores[0][0]),
    }
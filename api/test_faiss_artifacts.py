import json
import sys
from pathlib import Path

import faiss


API_DIR = Path(__file__).resolve().parent
INDEX_FILE = API_DIR / "data" / "index.faiss"
CHUNKS_FILE = API_DIR / "data" / "chunks.json"


def main() -> int:
    try:
        index = faiss.read_index(str(INDEX_FILE))
        chunks = json.loads(CHUNKS_FILE.read_text(encoding="utf-8"))
    except Exception:
        print("FAISS artifact validation: FAILED")
        print("Error category: unable to load artifacts")
        return 1

    checks = [
        ("Index dimension is 768", index.d == 768),
        ("Index contains exactly five vectors", index.ntotal == 5),
        ("Metadata contains exactly five records", len(chunks) == 5),
        ("Index and metadata counts match", index.ntotal == len(chunks)),
    ]

    failed = False
    for description, passed in checks:
        print(f"{description}: {'PASS' if passed else 'FAIL'}")
        failed = failed or not passed

    print(f"FAISS artifact validation: {'FAILED' if failed else 'SUCCESS'}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

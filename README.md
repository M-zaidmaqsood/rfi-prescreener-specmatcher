# RFI Pre-Screener & Spec-Matcher

An evidence-first MVP for screening construction RFIs and routing them to a human
reviewer. It retrieves illustrative specification evidence with Gemini embeddings
and FAISS, then optionally generates a structured preliminary analysis with Gemini.
It is not affiliated with, endorsed by, or integrated with Procore.

## Architecture

- `api/`: FastAPI REST API, Gemini services, FAISS retrieval, and persistence.
- `frontend/`: Next.js App Router dashboard and server-side API proxy routes.
- `data/specs.json`: five illustrative sample specification sections.
- `api/data/index.faiss` and `api/data/chunks.json`: synchronized retrieval artifacts.
- PostgreSQL/Neon stores `rfi_items` and `audit_log`. Without `DATABASE_URL`, local
  development uses the persistent `api/data/rfi.sqlite3` file.

The RAG flow embeds the submitted question with the configured 768-dimensional
Gemini embedding model, searches normalized FAISS vectors, and passes the top five
chunks to the generation model. Supporting quotes are then checked deterministically
against the original retrieved text; the model cannot mark its own quote as verified.

## Local setup

### Backend

```powershell
cd api
..\.venv\Scripts\python.exe -m pip install -r requirements.txt
..\.venv\Scripts\python.exe -m uvicorn index:app --reload --port 8000
```

Set server-side values in the repository `.env.local` (never commit it):

```text
GEMINI_API_KEY=...
GEMINI_EMBEDDING_MODEL=models/gemini-embedding-2
GEMINI_GENERATION_MODEL=gemini-2.5-flash
DATABASE_URL=postgresql://...?sslmode=require
```

`DATABASE_URL` is required for Neon persistence. If omitted locally, the API uses
SQLite so the MVP can be tested without an external account. The first API startup
creates both required tables automatically.

### Frontend

```powershell
cd frontend
npm install
$env:BACKEND_API_URL="http://127.0.0.1:8000"
npm run dev
```

Open `http://localhost:3000`. The Next.js route handlers proxy requests to FastAPI;
they do not maintain a competing analysis or in-memory persistence implementation.

## API

- `GET /health` and `GET /faiss-check`: operational checks.
- `GET /api/specs`: indexed specification metadata and original text.
- `POST /api/rfi/analyze`: validates, retrieves, analyzes, and persists an RFI.
- `GET /api/rfi/queue`: returns persisted RFIs, analyses, and audit history.
- `POST /api/rfi/review`: records an explicit human approval or deflection and audit row.

All generation failures return a visibly labelled `FALLBACK` analysis. Confidence
below `0.80` requires additional review; deflection also requires verified evidence.

## Testing

```powershell
cd api
..\.venv\Scripts\python.exe -m pytest
cd ..\frontend
npm run lint
npm run build
```

The retrieval test requires the configured Gemini key. API integration tests can use
the local SQLite fallback; Neon persistence should be smoke-tested with a configured
`DATABASE_URL`.

## Deployment

Deploy `api/` as the existing Vercel Python root and provide `GEMINI_API_KEY`,
`GEMINI_EMBEDDING_MODEL`, `GEMINI_GENERATION_MODEL`, and `DATABASE_URL` in the
backend project. Deploy `frontend/` as the Next.js root and set `BACKEND_API_URL` to
the deployed FastAPI URL. Do not run Vercel CLI from this repository.

## Limitations and safety

The sample specifications are illustrative and not licensed project specifications.
This MVP does not upload files, process drawings/PDFs, authenticate users, integrate
with Procore, or make autonomous engineering decisions. Every analysis and decision
must be reviewed and explicitly approved by a qualified human.

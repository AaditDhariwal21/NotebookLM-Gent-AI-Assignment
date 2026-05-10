# NotebookRAG

A Google NotebookLM–inspired Retrieval-Augmented Generation (RAG) web app.
Upload a PDF or TXT file and ask natural-language questions; the assistant
answers **only** from the contents of your documents and shows the chunks it
used as citations. If the answer is not in the document, it explicitly says so.

```
┌─────────────────────────┐      ┌──────────────────────────────────────────┐
│  React (Vite) frontend  │ ───▶ │  Express backend                         │
│   • upload UI           │      │   • PDF / TXT extraction (pdf-parse)     │
│   • chat & history      │      │   • Recursive chunker (chars, w/ overlap)│
│   • source citations    │      │   • OpenAI embeddings                    │
└─────────────────────────┘      │   • In-memory vector store (cosine)      │
                                 │   • OpenAI chat completion (grounded)    │
                                 └──────────────────────────────────────────┘
```

- **Backend:** Node.js + Express
- **Frontend:** React + Vite
- **Embeddings & LLM:** OpenAI (`text-embedding-3-small`, `gpt-4o-mini`)
- **Vector DB:** lightweight on-disk JSON store with cosine similarity
  (drop-in replaceable with ChromaDB / FAISS / Pinecone — see
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md))

## Features

- Upload one or many `.pdf` / `.txt` files (drag-and-drop or click).
- Recursive character text splitter with paragraph-aware separators and
  configurable overlap.
- Strictly grounded answers — the system prompt forbids outside knowledge and
  forces the literal refusal sentence when context is insufficient.
- Inline citation markers `[1] [2]` linked to expandable source cards that show
  the retrieved chunk, its document, and the cosine similarity score.
- Multiple-document support — pick which documents to query against, or query
  across all of them.
- Conversation history persists in `localStorage` between page reloads.
- Vector store persists to disk (`backend/data/vector-store.json`) so embeddings
  survive a restart.

## Project layout

```
.
├── backend/         # Express API + RAG pipeline
│   ├── src/
│   │   ├── index.js           # app entry
│   │   ├── config.js          # env-driven config
│   │   ├── routes/
│   │   │   ├── documents.js   # upload / list / delete
│   │   │   └── chat.js        # ask & retrieve
│   │   └── services/
│   │       ├── extractor.js   # PDF / TXT → text
│   │       ├── chunker.js     # recursive char splitter
│   │       ├── embeddings.js  # OpenAI embeddings (batched)
│   │       ├── vectorStore.js # cosine search w/ disk persistence
│   │       ├── llm.js         # grounded prompt + chat completion
│   │       └── openaiClient.js
│   └── package.json
├── frontend/        # React + Vite UI
│   └── src/
│       ├── App.jsx
│       ├── api.js
│       └── components/
│           ├── DocumentPanel.jsx
│           ├── ChatPanel.jsx
│           └── Message.jsx
└── docs/
    ├── ARCHITECTURE.md
    └── CHUNKING.md
```

## Prerequisites

- Node.js 18+ (uses native `fetch`, top-level `await`, ESM).
- An OpenAI API key with access to embeddings + chat completion.

## Quickstart

### 1. Backend

```bash
cd backend
# create backend/.env with at minimum:
#   OPENAI_API_KEY=sk-...
# (other vars below are optional — defaults are sensible)
npm install
npm run dev                 # http://localhost:8787
```

Health check: `curl http://localhost:8787/api/health`

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Vite proxies `/api/*` to `http://localhost:8787` during development, so the
frontend runs same-origin against the backend without CORS configuration.

### 3. Use it

1. Open `http://localhost:5173`.
2. Drop a PDF or TXT file into the sidebar (or click to choose).
3. Wait for it to chunk + embed (the chunk count appears under the filename).
4. Tick the documents you want to query (or leave none ticked to query all).
5. Ask questions in the chat box. Answers cite their sources as `[n]`.

## Configuration (backend/.env)

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_API_KEY` | — | **Required.** Despite the name, this also accepts a Gemini key when `OPENAI_BASE_URL` points at Gemini's OpenAI-compatible endpoint. |
| `OPENAI_BASE_URL` | _(unset)_ | Set to `https://generativelanguage.googleapis.com/v1beta/openai/` to use Gemini, or leave unset to use OpenAI directly. |
| `PORT` | `8787` | Backend port. |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI: `text-embedding-3-small`. Gemini: `gemini-embedding-001`. |
| `CHAT_MODEL` | `gpt-4o-mini` | OpenAI: `gpt-4o-mini`. Gemini: `gemini-2.0-flash`. |
| `CHUNK_SIZE` | `1200` | Characters per chunk. |
| `CHUNK_OVERLAP` | `200` | Overlap between adjacent chunks. |
| `TOP_K` | `5` | How many chunks are passed to the LLM. |
| `DATA_DIR` | `data` | Where uploads + vector store live (relative to `backend/`). |

### Using Gemini (free tier)

The default `backend/.env` is preconfigured for Gemini. Get a free key at
https://aistudio.google.com/app/apikey and paste it as `OPENAI_API_KEY`.
Everything else (embeddings, chat, citations, refusal sentence) works
unchanged — the OpenAI SDK speaks to Gemini via its OpenAI-compatible layer.

### Using OpenAI

Comment out `OPENAI_BASE_URL` (or remove it) and switch the model names back to
`text-embedding-3-small` and `gpt-4o-mini`.

## API

| Method | Path | Body | Response |
| --- | --- | --- | --- |
| `GET` | `/api/health` | — | `{ ok, documents, chunks }` |
| `GET` | `/api/documents` | — | `{ documents: [...] }` |
| `POST` | `/api/documents` | multipart `file` | `{ document, stats }` |
| `DELETE` | `/api/documents/:id` | — | `{ ok }` |
| `POST` | `/api/chat` | `{ question, documentIds?, history? }` | `{ answer, sources, retrieved }` |

## Production build

```bash
# Frontend → static files
cd frontend && npm run build      # outputs to frontend/dist
# Serve dist/ from any static host (Vercel, Netlify, S3, nginx, …).

# Backend → run with a process manager
cd backend && npm start
```

Common deployment shapes:

- **Single host:** put nginx in front. Static `frontend/dist` at `/`, reverse
  proxy `/api/` to the Node process.
- **Split host:** deploy frontend to Vercel/Netlify, backend to Render/Fly/Railway.
  Set `VITE_BACKEND_URL` at build time so the proxy targets your API origin
  during dev; in production, configure the host to forward `/api`.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — end-to-end data flow, design
  choices, where to swap in a real vector DB.
- [docs/CHUNKING.md](docs/CHUNKING.md) — chunking strategy, parameters, and
  trade-offs.

## License

MIT.

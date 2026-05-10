# Architecture

NotebookRAG is a small, deliberately boring RAG pipeline: a single-process
Express backend, a Vite-built React frontend, and OpenAI for both embeddings
and generation. Everything else is a thin wrapper around those three things.

## End-to-end flow

```
                          ┌──────────────────────────────┐
 PDF / TXT upload ───────▶│ extractor.js  pdf-parse / fs │
                          └──────────────┬───────────────┘
                                         │  raw text
                                         ▼
                          ┌──────────────────────────────┐
                          │ chunker.js                   │
                          │  recursive char split        │
                          │  + overlap                   │
                          └──────────────┬───────────────┘
                                         │  chunks: string[]
                                         ▼
                          ┌──────────────────────────────┐
                          │ embeddings.js                │
                          │  OpenAI batched embeddings   │
                          └──────────────┬───────────────┘
                                         │  vectors: number[][]
                                         ▼
                          ┌──────────────────────────────┐
                          │ vectorStore.js               │
                          │  in-memory + JSON persist    │
                          └──────────────────────────────┘

  user question ─▶ embed ─▶ cosine search ─▶ top-K chunks ─▶ llm.js (grounded prompt)
                                                                    │
                                                                    ▼
                                                            { answer, sources }
```

Every box maps to a single file under [backend/src](../backend/src):

| Step | File | Responsibility |
| --- | --- | --- |
| 1. Extract | [`services/extractor.js`](../backend/src/services/extractor.js) | Parse `.pdf` via `pdf-parse`, read `.txt` directly, normalize whitespace. |
| 2. Chunk | [`services/chunker.js`](../backend/src/services/chunker.js) | Recursive character text splitter with overlap. See [CHUNKING.md](CHUNKING.md). |
| 3. Embed | [`services/embeddings.js`](../backend/src/services/embeddings.js) | Batches up to 64 chunks per OpenAI request. |
| 4. Store | [`services/vectorStore.js`](../backend/src/services/vectorStore.js) | In-memory `{documents, chunks}` persisted as JSON; serialized writes via a promise chain to avoid concurrent-upload corruption. |
| 5. Retrieve | `services/vectorStore.js#search` | Brute-force cosine over filtered chunks. |
| 6. Generate | [`services/llm.js`](../backend/src/services/llm.js) | Strict system prompt forcing grounded answers + literal refusal sentence. |

## Routes

| Route | Description |
| --- | --- |
| `GET  /api/health` | Liveness + index size. |
| `GET  /api/documents` | List uploaded documents. |
| `POST /api/documents` | Multipart upload → extract → chunk → embed → store. |
| `DELETE /api/documents/:id` | Remove document + all its chunks. |
| `POST /api/chat` | `{ question, documentIds?, history? }` → grounded answer + sources. |

## Why a hand-rolled vector store?

The brief recommends ChromaDB. We deliberately ship an in-memory + JSON store
instead, for two reasons:

1. **Operational simplicity.** Chroma's JS client connects to a separate
   Chroma server. Bundling that into a hosted demo means orchestrating two
   processes (or a Docker compose stack) just to ask one question. A single
   `npm start` is a better DX for evaluators.
2. **Right-sized.** A brute-force cosine scan over ~10k chunks (≈ 50 MB of
   float32) is well under 50 ms on a laptop. RAG workloads only justify an
   ANN index — and the operational cost of a vector DB — once the corpus
   stops fitting comfortably in memory.

The store's surface area (`addDocument`, `search`, `listDocuments`,
`deleteDocument`, `stats`) is intentionally shaped like a vector-DB client, so
swapping it out is a localized change. To use Chroma instead:

```js
// services/vectorStore.js
import { ChromaClient } from 'chromadb';
const client = new ChromaClient({ path: process.env.CHROMA_URL });
const collection = await client.getOrCreateCollection({ name: 'notebookrag' });

export async function addDocument({ name, chunks, embeddings }) {
  const id = randomUUID();
  await collection.add({
    ids: chunks.map((_, i) => `${id}:${i}`),
    documents: chunks,
    embeddings,
    metadatas: chunks.map((_, i) => ({ documentId: id, name, index: i })),
  });
  // store the document meta wherever you keep it (Postgres, Redis, JSON file)
  return { id, name, createdAt: new Date().toISOString(), chunkCount: chunks.length };
}

export async function search(queryEmbedding, { topK, documentIds }) {
  const where = documentIds?.length ? { documentId: { $in: documentIds } } : undefined;
  const result = await collection.query({
    queryEmbeddings: [queryEmbedding],
    nResults: topK,
    where,
  });
  // shape into the same object the rest of the app already expects
  return result.documents[0].map((text, i) => ({
    documentId: result.metadatas[0][i].documentId,
    documentName: result.metadatas[0][i].name,
    index: result.metadatas[0][i].index,
    text,
    score: 1 - result.distances[0][i],
  }));
}
```

No other file in the project changes.

## Grounding strategy

The system prompt in [`services/llm.js`](../backend/src/services/llm.js):

- forbids outside knowledge,
- requires the literal sentence `"I could not find this information in the
  uploaded document."` when the context is insufficient,
- asks the model to emit `Sources: [n], [m]` listing only the citations it
  actually used.

Two further safeguards:

- `temperature: 0` to minimize creative hallucination.
- The chat handler short-circuits and returns the refusal sentence directly
  if zero chunks are retrieved — the LLM is never even consulted in that case.

## Frontend

A two-pane layout in [App.jsx](../frontend/src/App.jsx):

- **DocumentPanel** — drag-and-drop upload, document list with selection
  checkboxes, delete button per document.
- **ChatPanel** — scrolling history, composer with `Enter` to send /
  `Shift+Enter` for newline, persists history to `localStorage`.
- **Message** — renders `[n]` markers as buttons that expand the matching
  source card showing the retrieved chunk text and cosine score.

Selection (which docs are scoped) and chat history both persist in
`localStorage`, keyed under `notebookrag.*.v1`.

## Failure modes & how they're handled

| Failure | Behaviour |
| --- | --- |
| Scanned PDF with no embedded text | 422 with a clear "OCR not supported" message. |
| File too large (>25 MB) | Multer rejects with 400. Bump the limit in `routes/documents.js` if needed. |
| OpenAI errors (rate limit, network) | Bubble up as 500 with the OpenAI message; UI shows it inline. |
| Concurrent uploads | `persist()` chains writes through a serialized promise queue; no torn JSON. |
| Question with empty index | Refusal sentence returned directly, no LLM call. |

## Tunable knobs (env)

See [README.md](../README.md#configuration-backendenv). The interesting ones:

- `CHUNK_SIZE` / `CHUNK_OVERLAP` — see [CHUNKING.md](CHUNKING.md).
- `TOP_K` — increase to give the LLM more context (raises cost and the chance
  of needle-in-haystack distraction); decrease for short, focused docs.
- `EMBEDDING_MODEL` — `text-embedding-3-small` is the price/quality default.
  `text-embedding-3-large` doubles dimensionality and cost.

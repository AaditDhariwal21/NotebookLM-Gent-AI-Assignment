# Chunking Strategy

Chunking is the most consequential design choice in a RAG pipeline. Chunks
that are too small starve the LLM of context; chunks that are too large blunt
retrieval (the embedding becomes a "soup" of unrelated topics). We use a
**recursive character text splitter with overlap**, the strategy popularized
by LangChain.

Source: [`backend/src/services/chunker.js`](../backend/src/services/chunker.js).

## Algorithm

1. If the text already fits in `chunkSize`, return it unchanged.
2. Otherwise, split on the **largest semantic boundary** that the text contains:
   ```
   "\n\n"  →  paragraph
   "\n"    →  line
   ". "    →  sentence
   "? "    →  sentence
   "! "    →  sentence
   "; "    →  clause
   ", "    →  clause
   " "     →  word
   ""      →  character (last resort)
   ```
3. For each piece that's still larger than `chunkSize`, recurse with the next
   smaller separator.
4. Greedily glue the resulting small pieces back together up to `chunkSize`,
   then start a new chunk **seeded with the last `chunkOverlap` characters of
   the previous chunk** so information that straddles a boundary survives in
   at least one chunk.

This keeps chunks aligned with paragraph and sentence boundaries whenever the
text allows it, and only falls through to word/character splits for
adversarial inputs (e.g. a 5000-character single-sentence run-on).

## Defaults & rationale

| Parameter | Default | Rationale |
| --- | --- | --- |
| `chunkSize` | **1200 chars** (~300 tokens) | Big enough to hold a substantive paragraph or two, small enough that an embedding still captures a single coherent topic. Empirically a sweet spot for `text-embedding-3-small` on prose documents. |
| `chunkOverlap` | **200 chars** (~17%) | Common rule of thumb is 10–20%. 200 chars is roughly 2–3 sentences — enough that an entity introduced at the end of chunk *N* is still present at the start of chunk *N+1*. |
| `topK` | **5** | Five chunks at 1200 chars each ≈ 6 KB of context, fits comfortably in `gpt-4o-mini`'s window with room for the question, history, and the system prompt. |

All three are tunable via `backend/.env`.

## Trade-offs

- **Bigger chunks** → fewer embeddings (cheaper + faster ingest) and richer
  context per match, but each embedding represents a broader topic, so
  retrieval becomes less precise.
- **Smaller chunks** → sharper retrieval, but the LLM sees less context per
  hit and may need a higher `topK` to compensate, which raises generation cost.
- **More overlap** → fewer "split mid-sentence" failures at the cost of more
  chunks (and more embeddings to pay for).

## When this strategy is *not* what you want

The recursive splitter is content-agnostic. If you're indexing structured
content, a content-aware splitter usually wins:

- **Markdown / HTML** — split on headings so each chunk is one section.
- **Source code** — split on function or class boundaries via tree-sitter.
- **Tables / CSV** — never let the splitter break a row in half; chunk by row
  groups instead.

Swapping in a different strategy is one file: replace `recursiveSplit` in
[`services/chunker.js`](../backend/src/services/chunker.js); the rest of the
pipeline is unchanged.

## Verifying chunk quality

A quick sanity check after ingesting a new document:

```bash
curl -s http://localhost:8787/api/health
# → { "ok": true, "documents": 1, "chunks": 47 }
```

Or open the document in the sidebar — each row shows the chunk count under
the filename. Aim for somewhere in the 20–200 range for a typical paper or
book chapter; well outside that range is a hint to retune `chunkSize`.

import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/**
 * Lightweight on-disk vector store.
 *
 * Why hand-rolled instead of ChromaDB? Chroma's JS client requires running a
 * separate Chroma server, which complicates one-command deployment. For a
 * corpus of dozens of documents and tens of thousands of chunks, a brute-force
 * cosine scan in memory is well under 50 ms — fast enough that swapping in
 * Chroma would be premature. The shape of this module mirrors a typical
 * vector-DB surface (addDocument / search / listDocuments / deleteDocument)
 * so swapping the backend later is a localized change.
 */

let state = null; // { documents: Record<string, DocMeta>, chunks: Chunk[] }
let loadPromise = null;
let writeQueue = Promise.resolve();

async function load() {
  if (state) return state;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    await fs.mkdir(path.dirname(config.storeFile), { recursive: true });
    try {
      const raw = await fs.readFile(config.storeFile, 'utf8');
      state = JSON.parse(raw);
      if (!state.documents) state.documents = {};
      if (!state.chunks) state.chunks = [];
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      state = { documents: {}, chunks: [] };
    }
    return state;
  })();
  return loadPromise;
}

function persist() {
  // Serialize writes so two parallel uploads cannot interleave a partial JSON.
  writeQueue = writeQueue.then(async () => {
    const tmp = `${config.storeFile}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state));
    await fs.rename(tmp, config.storeFile);
  });
  return writeQueue;
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s);
}

function cosine(a, b) {
  const denom = norm(a) * norm(b);
  return denom === 0 ? 0 : dot(a, b) / denom;
}

export async function addDocument({ name, chunks, embeddings }) {
  await load();
  if (chunks.length !== embeddings.length) {
    throw new Error('chunks and embeddings length mismatch');
  }
  const id = randomUUID();
  const meta = {
    id,
    name,
    createdAt: new Date().toISOString(),
    chunkCount: chunks.length,
  };
  state.documents[id] = meta;
  for (let i = 0; i < chunks.length; i++) {
    state.chunks.push({
      id: randomUUID(),
      documentId: id,
      index: i,
      text: chunks[i],
      embedding: embeddings[i],
    });
  }
  await persist();
  return meta;
}

export async function listDocuments() {
  await load();
  return Object.values(state.documents).sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export async function deleteDocument(id) {
  await load();
  if (!state.documents[id]) return false;
  delete state.documents[id];
  state.chunks = state.chunks.filter((c) => c.documentId !== id);
  await persist();
  return true;
}

/**
 * Brute-force cosine search restricted to the supplied documentIds.
 * Pass null/undefined to search across all stored documents.
 */
export async function search(queryEmbedding, { topK = 5, documentIds = null } = {}) {
  await load();
  const filter =
    Array.isArray(documentIds) && documentIds.length > 0 ? new Set(documentIds) : null;
  const scored = [];
  for (const chunk of state.chunks) {
    if (filter && !filter.has(chunk.documentId)) continue;
    scored.push({
      id: chunk.id,
      documentId: chunk.documentId,
      documentName: state.documents[chunk.documentId]?.name ?? 'Unknown',
      index: chunk.index,
      text: chunk.text,
      score: cosine(queryEmbedding, chunk.embedding),
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

export async function stats() {
  await load();
  return {
    documents: Object.keys(state.documents).length,
    chunks: state.chunks.length,
  };
}

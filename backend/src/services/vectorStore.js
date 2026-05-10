import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from '../config.js';

/**
 * Lightweight vector store with two interchangeable backends:
 *
 *   • Upstash Redis (HTTP) — used in production. Detected via the env vars
 *     that Vercel's Upstash integration injects (KV_REST_API_URL +
 *     KV_REST_API_TOKEN, or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).
 *     Survives function cold starts; required because Vercel's serverless
 *     filesystem is per-invocation.
 *
 *   • Local JSON file — used in development and on hosts with a writable
 *     disk. State is persisted as a single JSON document.
 *
 * The interface (addDocument / search / listDocuments / deleteDocument /
 * stats) is identical across backends, so the rest of the app is oblivious
 * to which one is in use.
 */

const STATE_KEY = 'marginalia:store';

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useKV = !!(REDIS_URL && REDIS_TOKEN);

let kvClient = null;
async function getKv() {
  if (!kvClient) {
    const { Redis } = await import('@upstash/redis');
    kvClient = new Redis({ url: REDIS_URL, token: REDIS_TOKEN });
  }
  return kvClient;
}

const empty = () => ({ documents: {}, chunks: [] });

let state = null;
let loadPromise = null;
let writeQueue = Promise.resolve();

async function load() {
  if (state) return state;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (useKV) {
      const kv = await getKv();
      state = (await kv.get(STATE_KEY)) || empty();
    } else {
      await fs.mkdir(path.dirname(config.storeFile), { recursive: true });
      try {
        const raw = await fs.readFile(config.storeFile, 'utf8');
        state = JSON.parse(raw);
        if (!state.documents) state.documents = {};
        if (!state.chunks) state.chunks = [];
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
        state = empty();
      }
    }
    return state;
  })();
  return loadPromise;
}

function persist() {
  // Serialize writes so two parallel uploads cannot interleave.
  writeQueue = writeQueue.then(async () => {
    if (useKV) {
      const kv = await getKv();
      await kv.set(STATE_KEY, state);
    } else {
      const tmp = `${config.storeFile}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(state));
      await fs.rename(tmp, config.storeFile);
    }
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
    backend: useKV ? 'kv' : 'fs',
  };
}

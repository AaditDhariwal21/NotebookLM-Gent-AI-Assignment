import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

function int(value, fallback) {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
}

export const config = {
  port: int(process.env.PORT, 8787),
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiBaseUrl: process.env.OPENAI_BASE_URL || '',
  embeddingModel: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
  chatModel: process.env.CHAT_MODEL || 'gpt-4o-mini',
  chunkSize: int(process.env.CHUNK_SIZE, 1200),
  chunkOverlap: int(process.env.CHUNK_OVERLAP, 200),
  topK: int(process.env.TOP_K, 5),
  dataDir: path.resolve(backendRoot, process.env.DATA_DIR || 'data'),
  uploadsDir: path.resolve(backendRoot, process.env.DATA_DIR || 'data', 'uploads'),
  storeFile: path.resolve(backendRoot, process.env.DATA_DIR || 'data', 'vector-store.json'),
};

export function assertConfig() {
  if (!config.openaiApiKey) {
    throw new Error(
      'OPENAI_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.',
    );
  }
}

import { config } from '../config.js';
import { getOpenAI } from './openaiClient.js';
import { withRetry, sleep } from './retry.js';

const BATCH_SIZE = 64;
// Gentle pacing between embedding batches — Gemini's free tier caps embedding
// requests at a few per minute, so we sleep a beat between batches to avoid
// burning through the bucket on a single large upload.
const INTER_BATCH_DELAY_MS = 1200;

/**
 * Embed an array of strings, batching to stay within provider request limits.
 * Returns an array of number[] vectors aligned 1:1 with the input.
 */
export async function embedTexts(texts) {
  if (!Array.isArray(texts) || texts.length === 0) return [];
  const openai = getOpenAI();
  const out = new Array(texts.length);
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await withRetry(
      () =>
        openai.embeddings.create({
          model: config.embeddingModel,
          input: batch,
        }),
      { label: `embeddings[${i}-${i + batch.length}]` },
    );
    response.data.forEach((row, j) => {
      out[i + j] = row.embedding;
    });
    if (i + BATCH_SIZE < texts.length) await sleep(INTER_BATCH_DELAY_MS);
  }
  return out;
}

export async function embedQuery(text) {
  const [vec] = await embedTexts([text]);
  return vec;
}

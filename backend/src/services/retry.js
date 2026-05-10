/**
 * Retry an async operation on transient failures (429 / 5xx).
 * Uses exponential backoff with jitter, and honors a Retry-After header
 * if the server provided one.
 */
export async function withRetry(fn, { retries = 4, baseDelayMs = 1500, label = 'request' } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = extractStatus(err);
      const retryable = status === 429 || (status >= 500 && status < 600);
      if (!retryable || attempt >= retries) throw err;

      const retryAfterSec = Number(err?.headers?.['retry-after']);
      const backoff = baseDelayMs * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 400);
      const wait = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? retryAfterSec * 1000
        : Math.min(backoff + jitter, 30000);

      console.warn(
        `[retry] ${label} failed with ${status}; retry ${attempt + 1}/${retries} in ${wait}ms`,
      );
      await sleep(wait);
      attempt += 1;
    }
  }
}

function extractStatus(err) {
  return (
    err?.status ??
    err?.response?.status ??
    err?.cause?.status ??
    0
  );
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

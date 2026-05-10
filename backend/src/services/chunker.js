/**
 * Recursive Character Text Splitter.
 *
 * Mirrors the strategy popularized by LangChain: try to split on the largest
 * semantic boundary first (paragraph), and fall back to smaller separators
 * (line, sentence, word, character) only when a piece is still too large.
 * Adjacent chunks share a configurable character overlap so that information
 * straddling a boundary is preserved in at least one chunk.
 *
 * Defaults are tuned for OpenAI text-embedding-3-small:
 *   chunkSize    = 1200 chars  (~300 tokens)
 *   chunkOverlap = 200  chars  (~17% overlap)
 */
const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', '? ', '! ', '; ', ', ', ' ', ''];

export function recursiveSplit(text, { chunkSize = 1200, chunkOverlap = 200 } = {}) {
  if (chunkOverlap >= chunkSize) {
    throw new Error('chunkOverlap must be smaller than chunkSize');
  }
  if (!text || !text.trim()) return [];

  const pieces = splitRecursive(text, chunkSize, DEFAULT_SEPARATORS);
  return mergeWithOverlap(pieces, chunkSize, chunkOverlap);
}

function splitRecursive(text, chunkSize, separators) {
  if (text.length <= chunkSize) return [text];
  const [sep, ...rest] = separators;
  if (sep === undefined) return hardSplit(text, chunkSize);

  const parts = sep === '' ? Array.from(text) : text.split(sep);
  const out = [];
  for (const part of parts) {
    const piece = sep === '' ? part : part + sep;
    if (piece.length <= chunkSize) {
      out.push(piece);
    } else {
      out.push(...splitRecursive(piece, chunkSize, rest));
    }
  }
  return out.filter((p) => p.length > 0);
}

function hardSplit(text, chunkSize) {
  const out = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize));
  }
  return out;
}

/**
 * Greedily concatenate small pieces back up to chunkSize, then start a new
 * chunk seeded with the tail of the previous one to create the overlap.
 */
function mergeWithOverlap(pieces, chunkSize, overlap) {
  const chunks = [];
  let buffer = '';

  const flush = () => {
    const trimmed = buffer.trim();
    if (trimmed) chunks.push(trimmed);
  };

  for (const piece of pieces) {
    if (buffer.length + piece.length <= chunkSize) {
      buffer += piece;
      continue;
    }
    flush();
    const tail = overlap > 0 ? buffer.slice(Math.max(0, buffer.length - overlap)) : '';
    buffer = tail + piece;
    // A single piece may itself exceed chunkSize after we glued the tail on;
    // hard-split it to keep the invariant.
    while (buffer.length > chunkSize) {
      chunks.push(buffer.slice(0, chunkSize).trim());
      buffer = buffer.slice(chunkSize - overlap);
    }
  }
  flush();
  return chunks;
}

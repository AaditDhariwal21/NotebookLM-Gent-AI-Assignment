import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
// pdf-parse ships an index.js that runs a debug block on import; require its lib entry directly.
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

/**
 * Extract raw text from an uploaded file. Supports PDF and plain text.
 * Returns a normalized string with collapsed whitespace.
 */
export async function extractText(filePath, mimeType, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  const isPdf = mimeType === 'application/pdf' || ext === '.pdf';
  const isText =
    mimeType === 'text/plain' ||
    ext === '.txt' ||
    ext === '.md' ||
    mimeType === 'text/markdown';

  if (!isPdf && !isText) {
    throw new Error(`Unsupported file type: ${mimeType || ext}. Only .pdf and .txt are accepted.`);
  }

  const buffer = await fs.readFile(filePath);
  let raw;
  if (isPdf) {
    const parsed = await pdfParse(buffer);
    raw = parsed.text || '';
  } else {
    raw = buffer.toString('utf8');
  }
  return normalize(raw);
}

function normalize(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/ /g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { extractText } from '../services/extractor.js';
import { recursiveSplit } from '../services/chunker.js';
import { embedTexts } from '../services/embeddings.js';
import { addDocument, deleteDocument, listDocuments } from '../services/vectorStore.js';

const upload = multer({
  dest: config.uploadsDir,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

export const documentsRouter = Router();

documentsRouter.get('/', async (_req, res, next) => {
  try {
    res.json({ documents: await listDocuments() });
  } catch (err) {
    next(err);
  }
});

documentsRouter.post('/', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded. Use the "file" form field.' });
  }
  const tmpPath = req.file.path;
  try {
    const text = await extractText(tmpPath, req.file.mimetype, req.file.originalname);
    if (!text || text.length < 20) {
      return res.status(422).json({
        error:
          'No usable text could be extracted from this file. If it is a scanned PDF, OCR is required (not supported).',
      });
    }
    const chunks = recursiveSplit(text, {
      chunkSize: config.chunkSize,
      chunkOverlap: config.chunkOverlap,
    });
    const embeddings = await embedTexts(chunks);
    const meta = await addDocument({
      name: req.file.originalname,
      chunks,
      embeddings,
    });
    res.status(201).json({
      document: meta,
      stats: {
        characters: text.length,
        chunks: chunks.length,
      },
    });
  } catch (err) {
    next(err);
  } finally {
    fs.unlink(tmpPath).catch(() => {});
  }
});

documentsRouter.delete('/:id', async (req, res, next) => {
  try {
    const ok = await deleteDocument(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Document not found.' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Make multer error messages friendlier (e.g. file too large).
documentsRouter.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

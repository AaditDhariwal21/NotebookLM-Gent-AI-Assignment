import { Router } from 'express';
import multer from 'multer';
import { extractText } from '../services/extractor.js';
import { recursiveSplit } from '../services/chunker.js';
import { embedTexts } from '../services/embeddings.js';
import { addDocument, deleteDocument, listDocuments } from '../services/vectorStore.js';
import { config } from '../config.js';

// memoryStorage keeps the uploaded bytes in RAM rather than on disk — required
// for serverless platforms (Vercel) where /tmp is per-invocation.
const upload = multer({
  storage: multer.memoryStorage(),
  // 4 MB matches Vercel Hobby's body-size limit. Bump if running on a host
  // with a larger limit (Render, self-host, Vercel Pro).
  limits: { fileSize: 4 * 1024 * 1024 },
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
  try {
    const text = await extractText(req.file.buffer, req.file.mimetype, req.file.originalname);
    if (!text || text.length < 20) {
      return res.status(422).json({
        error:
          'No usable text could be extracted. If this is a scanned PDF, OCR is required (not supported).',
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

documentsRouter.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        error:
          'File is too large. Hosted demo accepts files up to 4 MB; trim the document or run locally for larger uploads.',
      });
    }
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

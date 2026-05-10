import express from 'express';
import cors from 'cors';
import fs from 'node:fs/promises';
import { config, assertConfig } from './config.js';
import { documentsRouter } from './routes/documents.js';
import { chatRouter } from './routes/chat.js';
import { stats } from './services/vectorStore.js';

assertConfig();
await fs.mkdir(config.uploadsDir, { recursive: true });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  res.json({ ok: true, ...(await stats()) });
});

app.use('/api/documents', documentsRouter);
app.use('/api/chat', chatRouter);

app.use((err, _req, res, _next) => {
  console.error('[error]', err);
  const upstreamStatus = err.status ?? err.response?.status;
  if (upstreamStatus === 429) {
    return res.status(429).json({
      error:
        'The model provider rate-limited the request. Free tiers have tight per-minute quotas — wait ~60 seconds and try again.',
    });
  }
  if (err.code === 'EAI_AGAIN' || err.cause?.code === 'EAI_AGAIN') {
    return res.status(503).json({
      error:
        'Could not reach the model provider (DNS lookup failed). Check your internet / VPN and retry.',
    });
  }
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

app.listen(config.port, () => {
  console.log(`RAG backend listening on http://localhost:${config.port}`);
});

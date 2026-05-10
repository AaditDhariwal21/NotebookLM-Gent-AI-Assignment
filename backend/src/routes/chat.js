import { Router } from 'express';
import { config } from '../config.js';
import { embedQuery } from '../services/embeddings.js';
import { search } from '../services/vectorStore.js';
import { answerWithContext, REFUSAL_MESSAGE } from '../services/llm.js';

export const chatRouter = Router();

chatRouter.post('/', async (req, res, next) => {
  try {
    const { question, documentIds, history } = req.body ?? {};
    if (!question || typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Field "question" is required.' });
    }

    const queryEmbedding = await embedQuery(question.trim());
    const matches = await search(queryEmbedding, {
      topK: config.topK,
      documentIds: Array.isArray(documentIds) ? documentIds : null,
    });

    if (matches.length === 0) {
      return res.json({
        answer: REFUSAL_MESSAGE,
        sources: [],
        retrieved: 0,
      });
    }

    const { answer, provider } = await answerWithContext({
      question: question.trim(),
      chunks: matches,
      history,
    });

    res.json({
      answer,
      provider, // "primary" or "groq" — frontend uses this to show a fallback badge.
      sources: matches.map((m, i) => ({
        citation: i + 1,
        documentId: m.documentId,
        documentName: m.documentName,
        chunkIndex: m.index,
        score: Number(m.score.toFixed(4)),
        snippet: m.text.length > 320 ? m.text.slice(0, 320) + '…' : m.text,
      })),
      retrieved: matches.length,
    });
  } catch (err) {
    next(err);
  }
});

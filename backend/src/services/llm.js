import { config } from '../config.js';
import { getOpenAI } from './openaiClient.js';
import { getGroq, hasGroqFallback } from './groqClient.js';
import { withRetry } from './retry.js';

const REFUSAL = 'I could not find this information in the uploaded document.';

const SYSTEM_PROMPT = `You are a careful research assistant. Answer the user's question using ONLY the information in the supplied context passages.

Strict rules:
- If the answer cannot be derived from the context, reply with EXACTLY this sentence and nothing else: "${REFUSAL}"
- Never use outside knowledge, never speculate, never invent citations.
- Be concise. Quote the document only when it materially helps.
- After your answer, on a new line, include "Sources:" followed by a comma-separated list of the [#] citation numbers you actually used (e.g. "Sources: [1], [3]"). Omit the Sources line if the answer is the refusal sentence.`;

function buildContext(chunks) {
  return chunks
    .map((c, i) => `[${i + 1}] (from "${c.documentName}", chunk ${c.index})\n${c.text}`)
    .join('\n\n---\n\n');
}

function buildHistory(history = []) {
  return history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.content)
    .slice(-6) // keep prompts bounded; recent turns are usually sufficient
    .map((m) => ({ role: m.role, content: String(m.content) }));
}

function callChat(client, model, messages) {
  return client.chat.completions.create({
    model,
    temperature: 0,
    messages,
  });
}

function isRetryableUpstreamFailure(err) {
  const status = err?.status ?? err?.response?.status ?? 0;
  return status === 429 || (status >= 500 && status < 600);
}

export async function answerWithContext({ question, chunks, history }) {
  if (!chunks || chunks.length === 0) {
    return { answer: REFUSAL, provider: 'none' };
  }

  const userPrompt = `Context passages:\n\n${buildContext(chunks)}\n\nQuestion: ${question}`;
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...buildHistory(history),
    { role: 'user', content: userPrompt },
  ];

  let response;
  let provider = 'primary';

  try {
    response = await withRetry(
      () => callChat(getOpenAI(), config.chatModel, messages),
      { label: `chat[${config.chatModel}]` },
    );
  } catch (err) {
    const groq = getGroq();
    if (groq && isRetryableUpstreamFailure(err)) {
      console.warn(
        `[fallback] primary chat exhausted retries (status ${err.status ?? '?'}); switching to Groq (${config.groqChatModel})`,
      );
      response = await withRetry(
        () => callChat(groq, config.groqChatModel, messages),
        { label: `chat[groq:${config.groqChatModel}]` },
      );
      provider = 'groq';
    } else {
      throw err;
    }
  }

  const answer = response.choices?.[0]?.message?.content?.trim() ?? REFUSAL;
  return { answer, provider };
}

export const REFUSAL_MESSAGE = REFUSAL;
export { hasGroqFallback };

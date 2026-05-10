import OpenAI from 'openai';
import { config } from '../config.js';

// Groq exposes an OpenAI-compatible endpoint, so we can reuse the OpenAI SDK.
// Endpoint reference: https://console.groq.com/docs/openai
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

let client;

export function getGroq() {
  if (!config.groqApiKey) return null;
  if (!client) {
    client = new OpenAI({
      apiKey: config.groqApiKey,
      baseURL: GROQ_BASE_URL,
    });
  }
  return client;
}

export function hasGroqFallback() {
  return !!config.groqApiKey;
}

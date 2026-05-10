import OpenAI from 'openai';
import { config } from '../config.js';

let client;

export function getOpenAI() {
  if (!client) {
    // baseURL lets us point at any OpenAI-compatible endpoint
    // (e.g. Gemini's compatibility layer at
    //  https://generativelanguage.googleapis.com/v1beta/openai/).
    client = new OpenAI({
      apiKey: config.openaiApiKey,
      ...(config.openaiBaseUrl ? { baseURL: config.openaiBaseUrl } : {}),
    });
  }
  return client;
}

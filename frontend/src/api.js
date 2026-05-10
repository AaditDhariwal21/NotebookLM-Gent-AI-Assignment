// All endpoints are same-origin via Vite's dev proxy / static hosting.
const BASE = '/api';

async function jsonOrThrow(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Request failed with status ${res.status}`);
  }
  return body;
}

export async function listDocuments() {
  return jsonOrThrow(await fetch(`${BASE}/documents`));
}

export async function uploadDocument(file) {
  const form = new FormData();
  form.append('file', file);
  return jsonOrThrow(
    await fetch(`${BASE}/documents`, {
      method: 'POST',
      body: form,
    }),
  );
}

export async function deleteDocument(id) {
  return jsonOrThrow(
    await fetch(`${BASE}/documents/${id}`, { method: 'DELETE' }),
  );
}

export async function askQuestion({ question, documentIds, history }) {
  return jsonOrThrow(
    await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, documentIds, history }),
    }),
  );
}

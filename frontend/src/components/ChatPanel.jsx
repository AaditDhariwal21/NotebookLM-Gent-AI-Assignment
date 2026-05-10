import { useEffect, useRef, useState } from 'react';
import { askQuestion } from '../api.js';
import Message from './Message.jsx';

const SUGGESTIONS = [
  'Walk me through the structure',
  "What's the central argument?",
  'Pull a key quote',
];

export default function ChatPanel({ documents, selectedIds }) {
  const [messages, setMessages] = useState(() => loadHistory());
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const scrollRef = useRef(null);
  const composerRef = useRef(null);

  useEffect(() => saveHistory(messages), [messages]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const noSources = documents.length === 0;
  const activeCount =
    selectedIds.length > 0 ? selectedIds.length : documents.length;
  const canSend = input.trim().length > 0 && !sending && !noSources;

  async function send(question) {
    if (!question || sending || noSources) return;
    const userMsg = { id: cryptoId(), role: 'user', content: question };
    const placeholder = {
      id: cryptoId(),
      role: 'assistant',
      content: '',
      pending: true,
    };
    setMessages((m) => [...m, userMsg, placeholder]);
    setInput('');
    setSending(true);
    setError('');

    try {
      const history = messages
        .filter((m) => !m.pending)
        .map(({ role, content }) => ({ role, content }));
      const result = await askQuestion({
        question,
        documentIds: selectedIds.length > 0 ? selectedIds : null,
        history,
      });
      setMessages((m) =>
        m.map((msg) =>
          msg.id === placeholder.id
            ? {
                ...msg,
                pending: false,
                content: result.answer,
                sources: result.sources || [],
                provider: result.provider,
              }
            : msg,
        ),
      );
    } catch (err) {
      setError(err.message);
      setMessages((m) => m.filter((msg) => msg.id !== placeholder.id));
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!canSend) return;
    send(input.trim());
  }

  function pickSuggestion(text) {
    setInput(text);
    composerRef.current?.focus();
  }

  function clearHistory() {
    if (!messages.length) return;
    if (!confirm('Close this thread and start over?')) return;
    setMessages([]);
    setError('');
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <div>
          <span className="label">Reading room</span>
          <h1 className="chat-title">
            {noSources ? (
              <>
                Nothing on the <em>shelf yet</em>
              </>
            ) : (
              <>
                Open across{' '}
                <em>
                  {activeCount} {activeCount === 1 ? 'paper' : 'papers'}
                </em>
              </>
            )}
          </h1>
        </div>
        <button
          type="button"
          className="chat-clear"
          onClick={clearHistory}
          disabled={messages.length === 0}
        >
          close thread
        </button>
      </header>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 ? (
          <div className="empty">
            <h2 className="empty-headline">
              Every answer,
              <br />
              <em>with the receipts.</em>
            </h2>
            <p className="empty-sub">
              Ask anything about what's on your shelf. Each claim links back to the exact
              passage it was drawn from — no outside knowledge, no guesswork.
            </p>
            <span className="label">Try asking</span>
            <div className="suggestion-row">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="suggestion"
                  onClick={() => pickSuggestion(s)}
                  disabled={noSources}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="composer-wrap">
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={composerRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={
              noSources ? 'Add a paper to start reading…' : 'Pose a question…'
            }
            rows={1}
            disabled={noSources || sending}
          />
          <button type="submit" className="send-btn" disabled={!canSend}>
            {sending ? (
              'Reading…'
            ) : (
              <>
                Ask <span className="send-arrow" aria-hidden="true">→</span>
              </>
            )}
          </button>
        </form>
        <div className="composer-helper">
          <span>↵ to ask · shift + ↵ for a new line</span>
          <span>every reply is sourced</span>
        </div>
      </div>
    </section>
  );
}

const HISTORY_KEY = 'marginalia.history.v1';

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => !m.pending) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(messages.filter((m) => !m.pending)),
    );
  } catch {
    /* quota exceeded — ignore */
  }
}

function cryptoId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

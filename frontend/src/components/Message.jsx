import { useState } from 'react';

const CITATION_RE = /\[(\d+)\]/g;

/**
 * Render an assistant message body with [n] markers turned into superscript
 * pills that scroll to / highlight the matching source card.
 */
function renderWithCitations(text, sources, onCite) {
  if (!text) return null;
  const valid = new Set(sources.map((s) => String(s.citation)));
  const parts = [];
  let last = 0;
  let m;
  while ((m = CITATION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const n = m[1];
    if (valid.has(n)) {
      parts.push(
        <button
          key={`c-${m.index}`}
          type="button"
          className="cite"
          onClick={() => onCite?.(Number(n))}
          aria-label={`Jump to source ${n}`}
        >
          {n}
        </button>,
      );
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function Message({ message }) {
  const [openSource, setOpenSource] = useState(null);

  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-body">{message.content}</div>
      </div>
    );
  }

  const sources = message.sources || [];

  return (
    <div className="msg msg-assistant">
      <div className="msg-body">
        {message.pending ? (
          <span className="thinking">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </span>
        ) : (
          renderWithCitations(message.content, sources, (n) => setOpenSource(n))
        )}
      </div>
      {message.provider === 'groq' && (
        <span className="provider-badge" title="Primary provider rate-limited; this answer was served by the Groq fallback.">
          served by groq
        </span>
      )}
      {sources.length > 0 && (
        <div className="sources">
          <span className="label">Sources</span>
          <div className="sources-list">
            {sources.map((s) => (
              <details
                key={s.citation}
                className="source-card"
                open={openSource === s.citation}
                onToggle={(e) => {
                  if (!e.currentTarget.open && openSource === s.citation) {
                    setOpenSource(null);
                  }
                }}
              >
                <summary>
                  <span className="source-num">[{s.citation}]</span>
                  <span className="source-name" title={s.documentName}>
                    {s.documentName}
                  </span>
                  <span className="source-score">score {s.score.toFixed(3)}</span>
                </summary>
                <p className="source-snippet">{s.snippet}</p>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

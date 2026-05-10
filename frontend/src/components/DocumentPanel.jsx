import { useRef, useState } from 'react';
import { uploadDocument, deleteDocument } from '../api.js';

export default function DocumentPanel({
  documents,
  selectedIds,
  onToggleSelect,
  onChange,
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progressMsg, setProgressMsg] = useState('');
  const fileRef = useRef(null);

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setBusy(true);
    setError('');
    try {
      for (const file of files) {
        setProgressMsg(`Reading ${file.name}…`);
        await uploadDocument(file);
      }
      setProgressMsg('');
      await onChange();
    } catch (err) {
      setError(err.message);
      setProgressMsg('');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Take "${name}" off the shelf? Its embeddings will be removed.`)) return;
    try {
      await deleteDocument(id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  const totalChunks = documents.reduce((sum, d) => sum + d.chunkCount, 0);
  const docCountLabel = String(documents.length).padStart(2, '0');

  return (
    <aside className="sidebar">
      <header>
        <div className="brand">
          <span className="brand-dot" aria-hidden="true" />
          <span className="brand-name">Marginalia</span>
        </div>
        <span className="label sidebar-tagline">read · ask · cite</span>
      </header>

      <label
        className={`upload-box ${busy ? 'is-busy' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.currentTarget.classList.add('drag');
        }}
        onDragLeave={(e) => e.currentTarget.classList.remove('drag')}
        onDrop={(e) => {
          e.preventDefault();
          e.currentTarget.classList.remove('drag');
          handleFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,application/pdf,text/plain"
          multiple
          disabled={busy}
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div className="upload-title">
          {busy ? (
            progressMsg || 'Working…'
          ) : (
            <>
              Bring in a <em>new source</em>
            </>
          )}
        </div>
        <div className="upload-sub">PDF or TXT · up to 4 MB</div>
      </label>

      {error && <div className="error sidebar-error">{error}</div>}

      <div className="sources-head">
        <span className="label">Shelf</span>
        {documents.length > 0 && (
          <span className="sources-count">
            {docCountLabel}
            <em>·</em>
            {totalChunks} {totalChunks === 1 ? 'passage' : 'passages'}
          </span>
        )}
      </div>

      <ul className="doc-list">
        {documents.length === 0 && (
          <li className="doc-empty">The shelf is bare. Add a paper to begin.</li>
        )}
        {documents.map((doc) => {
          const checked = selectedIds.includes(doc.id);
          return (
            <li key={doc.id} className={`doc-item ${checked ? 'is-selected' : ''}`}>
              <label className="doc-row">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggleSelect(doc.id)}
                />
                <span className="doc-meta">
                  <span className="doc-name" title={doc.name}>
                    {doc.name}
                  </span>
                  <span className="doc-sub">
                    {doc.chunkCount} {doc.chunkCount === 1 ? 'passage' : 'passages'}
                  </span>
                </span>
              </label>
              <button
                type="button"
                className="doc-delete"
                onClick={() => handleDelete(doc.id, doc.name)}
                aria-label={`Remove ${doc.name}`}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-footer">
        <span>gemini · cosine</span>
        <span>build 0.2</span>
      </div>
    </aside>
  );
}

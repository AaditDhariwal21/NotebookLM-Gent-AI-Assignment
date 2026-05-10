import { useCallback, useEffect, useState } from 'react';
import DocumentPanel from './components/DocumentPanel.jsx';
import ChatPanel from './components/ChatPanel.jsx';
import { listDocuments } from './api.js';

const SELECTED_KEY = 'marginalia.selected.v1';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => {
    try {
      const raw = localStorage.getItem(SELECTED_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [bootError, setBootError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const { documents } = await listDocuments();
      setDocuments(documents);
      // Drop selections for documents that no longer exist.
      setSelectedIds((ids) => ids.filter((id) => documents.some((d) => d.id === id)));
    } catch (err) {
      setBootError(err.message);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    localStorage.setItem(SELECTED_KEY, JSON.stringify(selectedIds));
  }, [selectedIds]);

  function toggleSelect(id) {
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
    );
  }

  return (
    <div className="layout">
      <DocumentPanel
        documents={documents}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
        onChange={refresh}
      />
      <ChatPanel documents={documents} selectedIds={selectedIds} />
      {bootError && <div className="boot-error">Backend unreachable: {bootError}</div>}
    </div>
  );
}

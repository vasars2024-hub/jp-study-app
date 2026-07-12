import { useRef, useState } from 'react';
import { parseCsvText } from '../../shared/csvEditor';
import {
  deckBookId,
  guessColumnMapping,
  parsePlainTextImport,
  rowsToDeckEntries,
} from '../../shared/deckImport';
import { importDeckFromEntries } from '../flashcardDeck';

type Props = {
  onImported?: () => void;
};

export default function DeckImportPanel({ onImported }: Props) {
  const [title, setTitle] = useState('imported-deck');
  const [status, setStatus] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function importRaw(text: string, fileName?: string): void {
    const deckTitle = fileName?.replace(/\.[^.]+$/, '') || title.trim() || 'Imported deck';
    if (fileName) setTitle(deckTitle);

    const trimmed = text.trim();
    if (!trimmed) {
      setStatus('Nothing to import.');
      return;
    }

    let count = 0;
    const looksCsv = trimmed.includes(',') || trimmed.includes('\t') || trimmed.includes(';');
    if (looksCsv && trimmed.split('\n').length > 1) {
      const table = parseCsvText(trimmed);
      const mapping = guessColumnMapping(table.headers);
      const entries = rowsToDeckEntries(table, mapping, deckTitle, 'import');
      count = entries.length;
      if (count) importDeckFromEntries(entries);
    } else {
      const entries = parsePlainTextImport(trimmed, deckTitle);
      count = entries.length;
      if (count) importDeckFromEntries(entries);
    }

    if (count) {
      setStatus(`Imported ${count} cards as “${deckTitle}” (${deckBookId(deckTitle)}).`);
      onImported?.();
    } else {
      setStatus('No valid rows found. Use CSV/TSV or one word per line.');
    }
  }

  return (
    <section className="anki-card deck-import-panel">
      <div className="flash-strip-head">
        <h2 className="flash-section-title">Import deck</h2>
        <span className="muted">CSV, TSV, TXT — paste or open a file</span>
      </div>
      <div className="deck-import-grid">
        <label>
          Deck name
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="my-deck" />
        </label>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Open file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.tab,text/csv,text/plain,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void f.text().then((t) => importRaw(t, f.name));
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        className="deck-import-paste"
        placeholder="Paste vocabulary list, CSV, or TSV here…"
        rows={5}
        spellCheck={false}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain');
          if (!text.trim()) return;
          e.preventDefault();
          importRaw(text);
        }}
      />
      <p className="muted deck-import-hint">Paste auto-imports. Re-importing the same deck name replaces that deck.</p>
      {status && <p className={`deck-import-status${status.startsWith('Imported') ? ' ok' : ''}`}>{status}</p>}
    </section>
  );
}

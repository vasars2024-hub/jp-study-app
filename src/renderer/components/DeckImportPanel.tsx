import { useEffect, useRef, useState } from 'react';
import type { TVars } from '../../shared/i18n/core';
import { parseCsvText } from '../../shared/csvEditor';
import {
  deckBookId,
  guessColumnMapping,
  parsePlainTextImport,
  rowsToDeckEntries,
} from '../../shared/deckImport';
import { importDeckFromEntries } from '../flashcardDeck';
import { useT } from '../i18n';
import { getActiveProfile } from '../profileState';

type Props = {
  onImported?: () => void;
};

export default function DeckImportPanel({ onImported }: Props) {
  const { t } = useT();
  const [title, setTitle] = useState('imported-deck');
  const [status, setStatus] = useState<{
    key: string;
    vars?: TVars;
    kind: 'pending' | 'success' | 'error';
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const readGeneration = useRef(0);
  useEffect(() => () => { readGeneration.current++; }, []);

  function importRaw(text: string, fileName?: string): void {
    const deckTitle = fileName?.replace(/\.[^.]+$/, '') || title.trim() || 'Imported deck';
    if (fileName) setTitle(deckTitle);

    const trimmed = text.trim();
    if (!trimmed) {
      setStatus({ key: 'flash.import.nothing', kind: 'error' });
      return;
    }

    let count = 0;
    const looksCsv = trimmed.includes(',') || trimmed.includes('\t') || trimmed.includes(';');
    if (looksCsv && trimmed.split('\n').length > 1) {
      const table = parseCsvText(trimmed);
      // Rows too: a pasted list usually has no header row to name its columns.
      const mapping = guessColumnMapping(table.headers, table.rows);
      const entries = rowsToDeckEntries(table, mapping, deckTitle, 'import');
      count = entries.length;
      if (count) importDeckFromEntries(entries);
    } else {
      const entries = parsePlainTextImport(trimmed, deckTitle);
      count = entries.length;
      if (count) importDeckFromEntries(entries);
    }

    if (count) {
      setStatus({
        key: 'flash.import.success',
        kind: 'success',
        vars: {
          count,
          title: deckTitle,
          id: deckBookId(deckTitle),
        },
      });
      onImported?.();
    } else {
      setStatus({ key: 'flash.import.noRows', kind: 'error' });
    }
  }

  return (
    <section className="anki-card deck-import-panel">
      <div className="flash-strip-head">
        <h2 className="flash-section-title">{t('flash.import.title')}</h2>
        <span className="muted">{t('flash.import.hint')}</span>
      </div>
      <div className="deck-import-grid">
        <label>
          {t('flash.import.deckName')}
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('flash.import.deckNamePlaceholder')}
          />
        </label>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {t('flash.import.openFile')}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.tsv,.txt,.tab,text/csv,text/plain,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const generation = ++readGeneration.current;
            setStatus({ key: 'common.loading', kind: 'pending' });
            void f.text().then((raw) => {
              if (generation === readGeneration.current) importRaw(raw, f.name);
            }).catch(() => {
              if (generation === readGeneration.current) {
                setStatus({ key: 'flash.import.readFailed', kind: 'error' });
              }
            });
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        className="deck-import-paste"
        placeholder={t('flash.import.pastePlaceholder')}
        aria-label={t('flash.import.pastePlaceholder')}
        rows={5}
        spellCheck={false}
        lang={getActiveProfile().targetLang}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain');
          if (!text.trim()) return;
          e.preventDefault();
          readGeneration.current++;
          importRaw(text);
        }}
      />
      <p className="muted deck-import-hint">{t('flash.import.autoHint')}</p>
      {status && (
        <p className={`deck-import-status${status.kind === 'success' ? ' ok' : ''}`} role={status.kind === 'error' ? 'alert' : 'status'}>
          {t(status.key, status.vars)}
        </p>
      )}
    </section>
  );
}

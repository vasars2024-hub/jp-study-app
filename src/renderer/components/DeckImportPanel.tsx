import { useRef, useState } from 'react';
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
  const [status, setStatus] = useState('');
  const [statusOk, setStatusOk] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function importRaw(text: string, fileName?: string): void {
    const deckTitle = fileName?.replace(/\.[^.]+$/, '') || title.trim() || 'Imported deck';
    if (fileName) setTitle(deckTitle);

    const trimmed = text.trim();
    if (!trimmed) {
      setStatusOk(false);
      setStatus(t('flash.import.nothing'));
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
      setStatusOk(true);
      setStatus(
        t('flash.import.success', {
          count,
          title: deckTitle,
          id: deckBookId(deckTitle),
        }),
      );
      onImported?.();
    } else {
      setStatusOk(false);
      setStatus(t('flash.import.noRows'));
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
            void f.text().then((raw) => importRaw(raw, f.name));
            e.target.value = '';
          }}
        />
      </div>
      <textarea
        className="deck-import-paste"
        placeholder={t('flash.import.pastePlaceholder')}
        rows={5}
        spellCheck={false}
        lang={getActiveProfile().targetLang}
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain');
          if (!text.trim()) return;
          e.preventDefault();
          importRaw(text);
        }}
      />
      <p className="muted deck-import-hint">{t('flash.import.autoHint')}</p>
      {status && <p className={`deck-import-status${statusOk ? ' ok' : ''}`}>{status}</p>}
    </section>
  );
}

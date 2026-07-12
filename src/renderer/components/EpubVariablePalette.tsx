import { useEffect, useState } from 'react';
import { langNativeLabel } from '../../shared/langs';
import CollapsibleSection from './CollapsibleSection';

/** Essential variables for EPUB mining — no Tatoeba examples or pair blocks. */
export const EPUB_BASE_VARS: ReadonlyArray<{ key: string; label: string; hint: string }> = [
  { key: 'expression', label: 'Expression', hint: 'Headword from the book (Japanese)' },
  { key: 'reading', label: 'Reading', hint: 'Kana reading when available' },
  { key: 'meaning', label: 'Meaning', hint: 'Dictionary gloss (English by default)' },
  { key: 'sentence', label: 'Context sentence', hint: 'Sentence from the EPUB where the word appeared' },
  { key: 'frequency', label: 'Frequency', hint: 'Dictionary rank or book occurrence count' },
];

/** Reading is Japanese-only — translating a reading is meaningless (removed). */
export const EPUB_TRANSLATABLE_BASES: readonly string[] = [
  'expression',
  'sentence',
  'meaning',
];

const DEFAULT_PALETTE_LANGS: readonly string[] = ['ja', 'zh', 'en', 'ru'];

export default function EpubVariablePalette({ onInsert }: { onInsert: (token: string) => void }) {
  const [langs, setLangs] = useState<readonly string[]>(DEFAULT_PALETTE_LANGS);

  // Adding a dictionary for a new language (e.g. German) automatically adds
  // its column to the palette — those fields are dictionary-served.
  useEffect(() => {
    let alive = true;
    window.api
      .dictAvailableLangs()
      .then((available) => {
        if (!alive || !available.length) return;
        const merged = [...DEFAULT_PALETTE_LANGS];
        for (const code of available) {
          if (!merged.includes(code)) merged.push(code);
        }
        setLangs(merged);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return (
    <CollapsibleSection title="Variable palette" summary="Insert {placeholders} into Front or Back" defaultOpen>
      <p className="muted collapse-lead">
        Focus Front or Back above, then click a tag. Language tags show which language each field uses
        (e.g. {`{expression:ja}`} = Japanese term from the book, {`{meaning:en}`} = English definition).
        Word fields resolve from your dictionaries first; Qwen fills only what they miss.
      </p>
      <div className="fm-palette" aria-label="Insert a base variable">
        <span className="fm-palette-label">Base</span>
        {EPUB_BASE_VARS.map((v) => (
          <button
            key={v.key}
            type="button"
            className="fm-chip"
            title={v.hint}
            onClick={() => onInsert(v.key)}
          >
            {`{${v.key}}`}
          </button>
        ))}
      </div>

      <div className="fm-translated" aria-label="Insert a language-tagged variable">
        <span className="fm-palette-label">By language</span>
        <div className="fm-translated-grid">
          {langs.map((code) => (
            <div key={code} className="fm-lang-col">
              <span className="fm-lang-head">{langNativeLabel(code)}</span>
              {(code === 'ja' ? ['expression', 'reading', 'sentence', 'meaning'] : EPUB_TRANSLATABLE_BASES).map(
                (base) => (
                  <button
                    key={`${base}:${code}`}
                    type="button"
                    className="fm-chip fm-chip-lang"
                    title={`${base} — ${langNativeLabel(code)}`}
                    onClick={() => onInsert(`${base}:${code}`)}
                  >
                    {`{${base}:${code}}`}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </CollapsibleSection>
  );
}

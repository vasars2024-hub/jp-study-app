import { useEffect, useMemo, useState } from 'react';
import { langNativeLabel } from '../../shared/langs';
import { useT } from '../i18n';
import CollapsibleSection from './CollapsibleSection';

/** Essential variables for EPUB mining — no Tatoeba examples or pair blocks. */
export const EPUB_BASE_VAR_KEYS = ['expression', 'reading', 'meaning', 'sentence', 'frequency'] as const;

/** Reading is Japanese-only — translating a reading is meaningless (removed). */
export const EPUB_TRANSLATABLE_BASES: readonly string[] = [
  'expression',
  'sentence',
  'meaning',
];

const DEFAULT_PALETTE_LANGS: readonly string[] = ['ja', 'zh', 'en', 'ru'];

export default function EpubVariablePalette({ onInsert }: { onInsert: (token: string) => void }) {
  const { t, lang } = useT();
  const [langs, setLangs] = useState<readonly string[]>(DEFAULT_PALETTE_LANGS);

  const baseVars = useMemo(
    () =>
      EPUB_BASE_VAR_KEYS.map((key) => ({
        key,
        hint: t(`epub.vars.${key}.hint`),
      })),
    [t, lang],
  );

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
    <CollapsibleSection title={t('epub.vars.title')} summary={t('epub.vars.summary')} defaultOpen>
      <p className="muted collapse-lead">{t('epub.vars.lead')}</p>
      <div className="fm-palette" aria-label={t('epub.vars.aria.base')}>
        <span className="fm-palette-label">{t('epub.vars.base')}</span>
        {baseVars.map((v) => (
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

      <div className="fm-translated" aria-label={t('epub.vars.aria.lang')}>
        <span className="fm-palette-label">{t('epub.vars.byLanguage')}</span>
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

import { useMemo } from 'react';
import {
  MINING_LANGS,
  MINING_TRANSLATABLE_BASES,
  MINING_VARS,
} from '../../shared/anki';
import { langNativeLabel } from '../../shared/langs';
import { useT } from '../i18n';
import CollapsibleSection from './CollapsibleSection';

export default function MiningVariablePalette({
  onInsert,
  extraTokens = [],
}: {
  onInsert: (token: string) => void;
  extraTokens?: string[];
}) {
  const { t, lang } = useT();

  const baseVars = useMemo(
    () =>
      MINING_VARS.map((v) => ({
        key: v.key,
        hint: t(`mining.vars.${v.key}.hint`),
      })),
    [t, lang],
  );

  return (
    <CollapsibleSection
      title={t('epub.vars.title')}
      summary={t('mining.vars.summary')}
      defaultOpen
    >
      <p className="muted collapse-lead">{t('mining.vars.lead')}</p>
      <div className="fm-palette" aria-label={t('mining.vars.aria.base')}>
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
        {extraTokens.map((token) => (
          <button
            key={token}
            type="button"
            className="fm-chip fm-chip-extra"
            onClick={() => onInsert(token.slice(1, -1))}
          >
            {token}
          </button>
        ))}
      </div>

      <div className="fm-translated" aria-label={t('mining.vars.aria.translated')}>
        <span className="fm-palette-label">{t('mining.vars.translated')}</span>
        <div className="fm-translated-grid">
          {MINING_LANGS.map((ml) => (
            <div key={ml.code} className="fm-lang-col">
              <span className="fm-lang-head">{langNativeLabel(ml.code)}</span>
              {(ml.code === 'ja'
                ? ['reading', ...MINING_TRANSLATABLE_BASES]
                : [...MINING_TRANSLATABLE_BASES]
              ).map((base) => (
                <button
                  key={`${base}:${ml.code}`}
                  type="button"
                  className="fm-chip fm-chip-lang"
                  title={t('mining.vars.translatedEmpty', { base })}
                  onClick={() => onInsert(`${base}:${ml.code}`)}
                >
                  {`{${base}:${ml.code}}`}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="fm-palette" aria-label={t('mining.vars.aria.pairs')}>
        <span className="fm-palette-label">{t('mining.vars.pairs')}</span>
        <button type="button" className="fm-chip" onClick={() => onInsert('example-pairs:ru:ja')}>
          {`{example-pairs:ru:ja}`}
        </button>
        <button type="button" className="fm-chip" onClick={() => onInsert('example-pairs:en:ja')}>
          {`{example-pairs:en:ja}`}
        </button>
        <button type="button" className="fm-chip" onClick={() => onInsert('example-pairs:zh:ja')}>
          {`{example-pairs:zh:ja}`}
        </button>
      </div>
    </CollapsibleSection>
  );
}

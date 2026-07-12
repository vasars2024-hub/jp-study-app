import {
  MINING_LANGS,
  MINING_TRANSLATABLE_BASES,
  MINING_VARS,
} from '../../shared/anki';
import CollapsibleSection from './CollapsibleSection';

export default function MiningVariablePalette({
  onInsert,
  extraTokens = [],
}: {
  onInsert: (token: string) => void;
  extraTokens?: string[];
}) {
  return (
    <CollapsibleSection title="Variable palette" summary="Insert {placeholders} into templates" defaultOpen>
      <p className="muted collapse-lead">
        Focus front or back above, then click a tag. EPUB mining fills expression, reading, sentence, and
        frequency from book text only.
      </p>
      <div className="fm-palette" aria-label="Insert a variable">
        <span className="fm-palette-label">Base</span>
        {MINING_VARS.map((v) => (
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

      <div className="fm-translated" aria-label="Insert a translated variable">
        <span className="fm-palette-label">Translated</span>
        <div className="fm-translated-grid">
          {MINING_LANGS.map((lang) => (
            <div key={lang.code} className="fm-lang-col">
              <span className="fm-lang-head">{lang.label}</span>
              {(lang.code === 'ja'
                ? ['reading', ...MINING_TRANSLATABLE_BASES]
                : [...MINING_TRANSLATABLE_BASES]
              ).map((base) => (
                <button
                  key={`${base}:${lang.code}`}
                  type="button"
                  className="fm-chip fm-chip-lang"
                  title={`${base} — empty unless you add dictionary data later`}
                  onClick={() => onInsert(`${base}:${lang.code}`)}
                >
                  {`{${base}:${lang.code}}`}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="fm-palette" aria-label="Insert a pair variable">
        <span className="fm-palette-label">Pairs</span>
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

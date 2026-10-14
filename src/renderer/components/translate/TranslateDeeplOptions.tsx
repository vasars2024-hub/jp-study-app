/**
 * DeepL's formality and context, edited next to the engine picker while DeepL
 * is the pair's engine (W1-A). Main stores them (`translate/deepl-options.json`)
 * and reads them when it sends, so what is shown here is what the next DeepL
 * request carries; nothing is kept in renderer storage.
 *
 * The formality select saves at once. The context box saves when it loses
 * focus (or on Save), so a half-typed sentence is never sent with a translation
 * that happens to start while the learner is still writing it.
 */
import { useEffect, useId, useState } from 'react';
import { useT } from '../../i18n';
import {
  DEEPL_CONTEXT_MAX_CHARS,
  DEEPL_FORMALITIES,
  DEFAULT_DEEPL_OPTIONS,
  normalizeDeeplOptions,
  type DeeplFormality,
  type DeeplOptions,
} from '../../../shared/translateDeeplOptions';

type SaveState = 'idle' | 'saved' | 'failed';

const FORMALITY_KEYS: Record<DeeplFormality, string> = {
  default: 'xlate2.deepl.formality.default',
  more: 'xlate2.deepl.formality.more',
  less: 'xlate2.deepl.formality.less',
};

export function TranslateDeeplOptions({ id, disabled }: { id: string; disabled?: boolean }) {
  const { t } = useT();
  const fieldId = useId();
  const [stored, setStored] = useState<DeeplOptions | null>(null);
  const [context, setContext] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    let alive = true;
    const get = window.api?.translateDeeplOptions;
    if (typeof get !== 'function') {
      setStored({ ...DEFAULT_DEEPL_OPTIONS });
      return undefined;
    }
    get()
      .then((options) => {
        if (!alive) return;
        const next = normalizeDeeplOptions(options);
        setStored(next);
        setContext(next.context);
      })
      .catch(() => {
        if (alive) setStored({ ...DEFAULT_DEEPL_OPTIONS });
      });
    return () => {
      alive = false;
    };
  }, []);

  const save = (patch: Partial<DeeplOptions>): void => {
    const set = window.api?.translateSetDeeplOptions;
    const next = normalizeDeeplOptions({ ...(stored ?? DEFAULT_DEEPL_OPTIONS), context, ...patch });
    if (typeof set !== 'function') {
      setSaveState('failed');
      return;
    }
    set(next)
      .then((saved) => {
        const normalized = normalizeDeeplOptions(saved);
        setStored(normalized);
        setContext(normalized.context);
        setSaveState('saved');
      })
      .catch(() => setSaveState('failed'));
  };

  const busy = disabled || !stored;
  const contextDirty = stored ? context.trim() !== stored.context : false;

  return (
    <div className="xlate2-deepl" id={id} role="group" aria-labelledby={`${fieldId}-title`}>
      <p className="xlate2-deepl-title" id={`${fieldId}-title`}>
        <strong>{t('xlate2.deepl.title')}</strong>
      </p>
      <label className="xlate2-deepl-row" htmlFor={`${fieldId}-formality`}>
        <span>{t('xlate2.deepl.formality')}</span>
        <select
          id={`${fieldId}-formality`}
          value={stored?.formality ?? 'default'}
          disabled={busy}
          aria-describedby={`${fieldId}-formality-hint`}
          onChange={(e) => save({ formality: e.target.value as DeeplFormality })}
        >
          {DEEPL_FORMALITIES.map((formality) => (
            <option key={formality} value={formality}>{t(FORMALITY_KEYS[formality])}</option>
          ))}
        </select>
      </label>
      <p className="xlate2-note muted" id={`${fieldId}-formality-hint`}>{t('xlate2.deepl.formalityHint')}</p>
      <label className="xlate2-deepl-context" htmlFor={`${fieldId}-context`}>
        <span>{t('xlate2.deepl.context')}</span>
        <textarea
          id={`${fieldId}-context`}
          rows={2}
          value={context}
          maxLength={DEEPL_CONTEXT_MAX_CHARS}
          disabled={busy}
          placeholder={t('xlate2.deepl.contextPlaceholder')}
          aria-describedby={`${fieldId}-context-hint`}
          onChange={(e) => {
            setContext(e.target.value);
            setSaveState('idle');
          }}
          onBlur={() => {
            if (contextDirty) save({});
          }}
        />
      </label>
      <p className="xlate2-note muted" id={`${fieldId}-context-hint`}>{t('xlate2.deepl.contextHint')}</p>
      <div className="xlate2-deepl-actions">
        <button type="button" className="btn ghost" disabled={busy || !contextDirty} onClick={() => save({})}>
          {t('common.save')}
        </button>
        <span className={`xlate2-deepl-status${saveState === 'failed' ? ' is-error' : ''}`} role="status">
          {saveState === 'saved' ? t('xlate2.deepl.saved') : saveState === 'failed' ? t('xlate2.deepl.saveFailed') : ''}
        </span>
      </div>
    </div>
  );
}

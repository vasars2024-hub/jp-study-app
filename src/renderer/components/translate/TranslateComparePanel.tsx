/**
 * Side-by-side engine comparison (W1-A): the passage in the source box,
 * translated by every engine the learner ticks, each in its own column with
 * how long it took — LunaTranslator's core feature, and the quickest way to
 * decide which engine a language pair should use.
 *
 * Every column is an ordinary `translate:run` with an explicit engine, all
 * started together. No new channel and no new trust: main still refuses a
 * cloud engine without consent, so this panel only OFFERS the engines that are
 * ready and allowed, and lists the others with the reason they are not.
 *
 * A cloud engine that fails is shown as failed, with its reason. Main may have
 * fallen back to the offline model for it (the learner's fallback setting);
 * that answer is the offline model's, not the engine's, so it is not shown in
 * the engine's column — the offline column already has it.
 *
 * Nothing here is saved to the history: a comparison is a question about
 * engines, not a translation the learner asked to keep.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { translateTo } from '../../translator';
import {
  TRANSLATE_FALLBACK_KEYS,
  TRANSLATE_PROVIDERS,
  isCloudTranslateProvider,
  translateProviderLabel,
  type TranslateProviderId,
  type TranslateResultMeta,
} from '../../../shared/translateProviders';
import { glossaryTermsForText } from '../../../shared/translateGlossary';
import { loadTranslateGlossary } from '../../translateGlossaryStore';
import { translateProviderAvailability, useTranslateProviders } from '../../translateProviderClient';
import { copyText, type TranslateController } from './TranslateContent';
import { translateErrorText } from './translateErrorText';

interface CompareRow {
  provider: TranslateProviderId;
  status: 'busy' | 'done' | 'error';
  text?: string;
  error?: string;
  ms?: number;
  /** Answered from main's cache of recent translations: nothing was sent. */
  cached?: boolean;
}

/** Why an engine cannot take part, as a catalog key; null when it can. */
function unavailableKey(
  ready: boolean,
  reason: 'no-key' | 'not-installed' | undefined,
  cloud: boolean,
  consented: boolean,
): string | null {
  if (!ready) return reason === 'no-key' ? 'xlate2.engine.needsKey' : 'xlate2.engine.notInstalled';
  if (cloud && !consented) return 'xlate2.compare.notAllowed';
  return null;
}

export function TranslateComparePanel({ id, state }: { id: string; state: TranslateController }) {
  const { t } = useT();
  const { source, target } = state;
  const engines = useTranslateProviders(source, target);
  const { snapshot, provider: pairEngine } = engines;
  const pairLabel = `${source.toUpperCase()} → ${target.toUpperCase()}`;

  const options = useMemo(() => TRANSLATE_PROVIDERS.map((def) => {
    const availability = translateProviderAvailability(snapshot, def.id);
    const cloud = isCloudTranslateProvider(def.id);
    const ready = availability ? availability.ready : def.id === 'local';
    const blocked = unavailableKey(ready, availability?.reason, cloud, availability?.consented === true);
    return { id: def.id, label: translateProviderLabel(def.id, t), blocked };
  }), [snapshot, t]);

  const eligible = useMemo(() => options.filter((option) => !option.blocked).map((option) => option.id), [options]);
  const [picked, setPicked] = useState<Set<TranslateProviderId> | null>(null);
  // Every eligible engine is ticked until the learner changes the selection.
  const chosen = useMemo(
    () => (picked ? eligible.filter((engine) => picked.has(engine)) : eligible),
    [picked, eligible],
  );

  const [rows, setRows] = useState<CompareRow[]>([]);
  const [notice, setNotice] = useState('');
  const runRef = useRef<AbortController | null>(null);
  const running = rows.some((row) => row.status === 'busy');

  useEffect(() => () => runRef.current?.abort(), []);
  // A different pair is a different comparison.
  useEffect(() => {
    runRef.current?.abort();
    setRows([]);
    setNotice('');
  }, [source, target]);

  const toggle = (engine: TranslateProviderId, on: boolean): void => {
    const next = new Set(chosen);
    if (on) next.add(engine);
    else next.delete(engine);
    setPicked(next);
  };

  const run = (): void => {
    const text = state.input.trim();
    if (!text) {
      setNotice(t('xlate2.compare.needText'));
      return;
    }
    if (!chosen.length) {
      setNotice(t('xlate2.compare.needEngine'));
      return;
    }
    runRef.current?.abort();
    const controller = new AbortController();
    runRef.current = controller;
    setNotice('');
    setRows(chosen.map((engine) => ({ provider: engine, status: 'busy' })));
    const glossary = glossaryTermsForText(loadTranslateGlossary(), text, source, target);
    const update = (engine: TranslateProviderId, row: Omit<CompareRow, 'provider'>): void => {
      if (controller.signal.aborted) return;
      setRows((prev) => prev.map((existing) => (existing.provider === engine ? { provider: engine, ...row } : existing)));
    };
    for (const engine of chosen) {
      const started = performance.now();
      let meta: TranslateResultMeta | null = null;
      void translateTo(text, source, target, undefined, undefined, {
        provider: engine,
        style: state.style,
        ...(glossary.length ? { glossary } : {}),
        signal: controller.signal,
        onMeta: (m) => { meta = m; },
      }).then((result) => {
        const ms = performance.now() - started;
        const answered = meta as TranslateResultMeta | null;
        if (answered?.fallbackFrom === engine) {
          // The offline model stood in: say why this engine failed instead.
          update(engine, {
            status: 'error',
            ms,
            error: t('xlate2.error.cloud', {
              provider: translateProviderLabel(engine, t),
              reason: t(TRANSLATE_FALLBACK_KEYS[answered.fallbackCode ?? 'other']),
            }),
          });
          return;
        }
        update(engine, { status: 'done', text: result, ms, ...(answered?.cached ? { cached: true } : {}) });
      }).catch((error: unknown) => {
        if (controller.signal.aborted) return;
        update(engine, { status: 'error', error: translateErrorText(error, t), ms: performance.now() - started });
      });
    }
  };

  const stop = (): void => {
    runRef.current?.abort();
    runRef.current = null;
    setRows((prev) => prev.filter((row) => row.status !== 'busy'));
    setNotice(t('xlate2.compare.stopped'));
  };

  return (
    <section className="xlate2-compare" id={id} aria-labelledby={`${id}-title`}>
      <h3 className="xlate2-compare-title" id={`${id}-title`}>{t('xlate2.compare.title')}</h3>
      <p className="xlate2-note muted">{t('xlate2.compare.intro')}</p>
      <fieldset className="xlate2-compare-engines">
        <legend>{t('xlate2.compare.choose')}</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className={`xlate2-compare-engine${option.blocked ? ' is-blocked' : ''}`}
            data-provider={option.id}
          >
            <input
              type="checkbox"
              checked={!option.blocked && chosen.includes(option.id)}
              disabled={Boolean(option.blocked) || running}
              onChange={(e) => toggle(option.id, e.target.checked)}
            />
            <span>{option.label}</span>
            {option.blocked && <span className="muted"> — {t(option.blocked)}</span>}
          </label>
        ))}
      </fieldset>
      <div className="xlate2-compare-actions">
        <button type="button" className="btn primary" disabled={running} onClick={run}>
          {t('xlate2.compare.run')}
        </button>
        {running && (
          <button type="button" className="btn ghost" onClick={stop}>
            {t('xlate2.compare.stop')}
          </button>
        )}
        <span className="muted" role="status">{notice}</span>
      </div>
      {rows.length > 0 && (
        <ul className="xlate2-compare-grid" aria-label={t('xlate2.compare.results')}>
          {rows.map((row) => {
            const name = translateProviderLabel(row.provider, t);
            const inUse = pairEngine === row.provider;
            return (
              <li key={row.provider} className={`xlate2-compare-cell is-${row.status}`} data-provider={row.provider}>
                <div className="xlate2-compare-head">
                  <strong>{name}</strong>
                  {row.cached ? (
                    <span className="muted" title={t('xlate2.result.cachedHint')}>{t('xlate2.result.cached')}</span>
                  ) : row.ms !== undefined && (
                    <span className="muted">{t('xlate2.compare.time', { seconds: (row.ms / 1000).toFixed(1) })}</span>
                  )}
                </div>
                {row.status === 'busy' && <p className="muted" role="status">{t('xlate2.compare.working')}</p>}
                {row.status === 'error' && <p className="xlate2-compare-error" role="status">{row.error}</p>}
                {row.status === 'done' && (
                  <>
                    <p className="xlate2-compare-text" lang={target}>{row.text}</p>
                    <div className="xlate2-compare-cell-actions">
                      <button
                        type="button"
                        className="btn ghost"
                        aria-label={`${t('xlate2.compare.copy')} — ${name}`}
                        onClick={() => void copyText(row.text ?? '')}
                      >
                        {t('xlate2.compare.copy')}
                      </button>
                      {inUse ? (
                        <span className="muted">{t('xlate2.compare.inUse', { pair: pairLabel })}</span>
                      ) : (
                        <button
                          type="button"
                          className="btn ghost"
                          aria-label={`${t('xlate2.compare.use', { pair: pairLabel })} — ${name}`}
                          onClick={() => void engines.setPairProvider(row.provider)}
                        >
                          {t('xlate2.compare.use', { pair: pairLabel })}
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

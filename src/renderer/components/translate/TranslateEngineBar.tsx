/**
 * The engine picker for the Translate workbench: offline (default), offline at
 * higher quality, or an opt-in cloud provider — chosen per language pair, with
 * an explicit consent step before any provider is sent text.
 *
 * Choosing a cloud provider the user has not agreed to does NOT select it: it
 * opens the consent note in place, and only "Allow" both records the consent and
 * switches the pair. Main enforces the same rule (`translateRouter.ts`), so this
 * component being wrong could hide a provider, never leak text to one.
 *
 * Shared by Study OS's `TranslateView` (both layouts) and Blanc's panel through
 * `TranslateOptionsBar`, so it imports no `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { useId, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import {
  TRANSLATE_FALLBACK_KEYS,
  TRANSLATE_PROVIDERS,
  isCloudTranslateProvider,
  translateProviderDefinition,
  translateProviderLabel,
  type TranslateCloudProviderId,
  type TranslateProviderAvailability,
  type TranslateProviderId,
  type TranslateResultMeta,
} from '../../../shared/translateProviders';
import { translateProviderAvailability, useTranslateProviders } from '../../translateProviderClient';

const REASON_KEYS: Record<NonNullable<TranslateProviderAvailability['reason']>, string> = {
  'no-key': 'xlate2.engine.needsKey',
  'not-installed': 'xlate2.engine.notInstalled',
};

/** The larger model the hint names; the first the catalog prefers (`LARGE_TRANSLATE_MODEL_IDS`). */
const LARGE_MODEL_HINT_FILE = 'Qwen3-8B.gguf';

export function TranslateEngineBar({ source, target, disabled }: { source: string; target: string; disabled?: boolean }) {
  const { t, lang } = useT();
  const engines = useTranslateProviders(source, target);
  const { snapshot, provider } = engines;
  const [asking, setAsking] = useState<TranslateCloudProviderId | null>(null);
  const consentId = useId();
  const pairLabel = `${source.toUpperCase()} → ${target.toUpperCase()}`;

  const options = useMemo(() => TRANSLATE_PROVIDERS.map((def) => {
    const availability = translateProviderAvailability(snapshot, def.id);
    // Before main has answered, only the offline engine is offered: readiness of the rest is unknown.
    const ready = availability ? availability.ready : def.id === 'local';
    const reason = availability?.reason;
    const name = translateProviderLabel(def.id, t);
    return {
      id: def.id,
      ready,
      label: !ready && reason ? `${name} — ${t(REASON_KEYS[reason])}` : name,
    };
  }), [snapshot, t, lang]);

  const current = translateProviderAvailability(snapshot, provider);
  const fallbackToLocal = snapshot?.settings.fallbackToLocal ?? true;

  const choose = (id: TranslateProviderId): void => {
    setAsking(null);
    if (isCloudTranslateProvider(id) && !translateProviderAvailability(snapshot, id)?.consented) {
      setAsking(id);
      return;
    }
    void engines.setPairProvider(id);
  };

  const askingDef = asking ? translateProviderDefinition(asking) : null;
  const askingName = asking ? translateProviderLabel(asking, t) : '';

  return (
    <div className="xlate2-engine">
      <label className="xlate2-engine-pick" title={t('xlate2.engine.hint', { pair: pairLabel })}>
        <span>{t('xlate2.engine.label')}</span>
        <select
          value={asking ?? provider}
          disabled={disabled}
          onChange={(e) => choose(e.target.value as TranslateProviderId)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id} disabled={!option.ready && option.id !== provider}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="xlate2-engine-fallback" title={t('xlate2.engine.fallbackHint')}>
        <input
          type="checkbox"
          checked={fallbackToLocal}
          disabled={!snapshot}
          onChange={(e) => void engines.setFallback(e.target.checked)}
        />
        {t('xlate2.engine.fallback')}
      </label>

      {provider === 'local-large' && current && !current.ready && (
        <p className="xlate2-note muted">{t('xlate2.engine.largeMissing', { file: LARGE_MODEL_HINT_FILE })}</p>
      )}
      {provider === 'local-large' && current?.ready && current.modelFileName && (
        <p className="xlate2-note muted">{t('xlate2.engine.largeReady', { file: current.modelFileName })}</p>
      )}
      {isCloudTranslateProvider(provider) && current?.consented && !asking && (
        <p className="xlate2-note muted">
          {t('xlate2.engine.cloudActive', {
            provider: translateProviderLabel(provider, t),
            host: translateProviderDefinition(provider).host ?? '',
          })}{' '}
          <button
            type="button"
            className="btn ghost xlate2-revoke"
            onClick={() => void engines.setConsent(provider, false)}
          >
            {t('xlate2.consent.revoke', { provider: translateProviderLabel(provider, t) })}
          </button>
        </p>
      )}

      {asking && askingDef && (
        <div className="xlate2-consent" role="group" aria-labelledby={`${consentId}-title`}>
          <p className="xlate2-consent-title" id={`${consentId}-title`}>
            <strong>{t('xlate2.consent.title', { provider: askingName })}</strong>
          </p>
          <p>{t('xlate2.consent.body', { provider: askingName, host: askingDef.host ?? '' })}</p>
          <p className="muted">{t('xlate2.consent.scope')}</p>
          <p className="muted">
            {askingDef.engine === 'mt' ? t('xlate2.consent.billingMt') : t('xlate2.consent.billingLlm')}
          </p>
          <div className="xlate2-consent-actions">
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                const id = asking;
                setAsking(null);
                void engines.setConsent(id, true).then(() => engines.setPairProvider(id));
              }}
            >
              {t('xlate2.consent.allow', { provider: askingName })}
            </button>
            <button type="button" className="btn ghost" onClick={() => setAsking(null)}>
              {t('xlate2.consent.decline')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Who translated the result on screen, whether the offline model stood in, and
 * which glossary terms the result honours. Rendered with every finished result.
 */
export function TranslateResultSource({ meta }: { meta: TranslateResultMeta | null | undefined }) {
  const { t } = useT();
  if (!meta) return null;
  const glossary = meta.glossary;
  const total = glossary ? glossary.applied.length + glossary.missing.length : 0;
  return (
    <div className="xlate2-source">
      <span className="xlate2-source-chip">
        {t('xlate2.result.by', { provider: translateProviderLabel(meta.provider, t) })}
      </span>
      {meta.fallbackFrom && (
        <span className="xlate2-fallback" role="status">
          {t('xlate2.result.fellBack', {
            provider: translateProviderLabel(meta.fallbackFrom, t),
            reason: t(TRANSLATE_FALLBACK_KEYS[meta.fallbackCode ?? 'other']),
          })}
        </span>
      )}
      {glossary && total > 0 && (
        <span className="xlate2-glossary-report muted">
          {t('xlate2.glossary.report', { count: glossary.applied.length, total })}
          {glossary.missing.length > 0 && ` ${t('xlate2.glossary.missing', { terms: glossary.missing.join(', ') })}`}
        </span>
      )}
    </div>
  );
}

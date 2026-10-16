/**
 * "Read text with AI" — the one control for a vision model as an OCR engine
 * (`shared/aiOcrVision.ts`), shown in Settings > AI and in the Snips settings.
 *
 * Order matters and is the order of the questions: which model reads (and
 * whether it can read pictures at all), where the pictures would go, the
 * explicit "Allow sending pictures" opt-in, and only then when to use it. The
 * modes stay disabled until pictures may be sent, so choosing "Always" can
 * never be the thing that silently starts uploading snips.
 */
import { useId } from 'react';
import { useT } from '../../i18n';
import { AI_PROVIDERS, providerById, type AiProviderId } from '../../../shared/aiProviders';
import { AI_OCR_VISION_MODES, type AiOcrVisionStatus } from '../../../shared/aiOcrVision';
import { aiOcrProviderName, useAiOcrVision } from '../../aiOcrVisionClient';
import { openAiSettings } from '../../aiSetupClient';
import { Toggle } from '../ui/Toggle';
import './aiSetup.css';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

function providerName(id: AiProviderId, t: TFn): string {
  return aiOcrProviderName(id, providerById(id).label, t);
}

function optionLabel(status: AiOcrVisionStatus, id: AiProviderId, t: TFn): string {
  const entry = status.providers.find((p) => p.id === id);
  const provider = providerName(id, t);
  if (!entry?.vision) return t('aiProv.ocr.provider.textOnly', { provider });
  return entry.configured ? t('aiProv.ocr.provider.reads', { provider }) : t('aiProv.ocr.provider.noKey', { provider });
}

export default function AiOcrVisionSettings({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const ids = useId();
  const { status, update, setConsent } = useAiOcrVision();
  if (!status) return null;

  const provider = providerName(status.effectiveProviderId, t);
  const usesLocal = status.effectiveProviderId === 'openai-compatible';
  const canSend = status.available && status.consent;
  const blocked = status.blocked && status.blocked !== 'no-consent' ? status.blocked : null;
  // Vision first, then the rest, so the picker reads as "these can do it".
  const order = [...AI_PROVIDERS].sort((a, b) => Number(!status.providers.find((p) => p.id === a.id)?.vision)
    - Number(!status.providers.find((p) => p.id === b.id)?.vision));

  return (
    <div className={`ai-ocr-vision${compact ? ' is-compact' : ''}`} data-testid="ai-ocr-vision" data-ai-entry="">
      {compact && <h4 className="ai-ocr-vision-title">{t('aiProv.ocr.title')}</h4>}
      {compact && <p className="muted os-set-hint">{t('aiProv.ocr.desc')}</p>}
      <div className="ai-page-grid">
        <label htmlFor={`${ids}-provider`}>{t('aiProv.ocr.provider')}</label>
        <select
          id={`${ids}-provider`}
          className="set-select"
          data-testid="ai-ocr-provider"
          value={status.providerId}
          onChange={(event) => void update({ providerId: event.currentTarget.value as AiProviderId | '' })}
        >
          <option value="">{t('aiProv.ocr.provider.follow', { provider })}</option>
          {order.map((entry) => (
            <option key={entry.id} value={entry.id}>{optionLabel(status, entry.id, t)}</option>
          ))}
        </select>
      </div>
      {usesLocal && (
        <>
          <Toggle
            className="os-toggle os-toggle-compact"
            data-testid="ai-ocr-compat-vision"
            checked={status.compatVision}
            onChange={(event) => void update({ compatVision: event.currentTarget.checked })}
            label={t('aiProv.ocr.compatVision')}
          />
          <p className="muted os-set-hint">{t('aiProv.ocr.compatVision.hint')}</p>
        </>
      )}

      {blocked ? (
        <div className="ai-page-key-row">
          <p className="ai-page-status muted" role="status" data-testid="ai-ocr-status">
            {t(`aiProv.ocr.status.${blocked}`, { provider })}
          </p>
          {blocked !== 'no-vision' && (
            <button type="button" className="btn small" onClick={() => openAiSettings('ai-provider')}>
              {t('aiProv.ocr.openSettings')}
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="os-set-hint ai-ocr-privacy" data-testid="ai-ocr-privacy">
            {status.local
              ? t('aiProv.ocr.privacyLocal', { host: status.host })
              : t('aiProv.ocr.privacy', { provider, host: status.host })}
          </p>
          <Toggle
            className="os-toggle os-toggle-compact"
            data-testid="ai-ocr-consent"
            checked={status.consent}
            onChange={(event) => void setConsent(event.currentTarget.checked)}
            label={t('aiProv.ocr.consent', { provider })}
          />
        </>
      )}

      <div
        className="sp-seg"
        role="radiogroup"
        aria-label={t('aiProv.ocr.mode')}
        aria-describedby={`${ids}-mode-hint`}
      >
        {AI_OCR_VISION_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={status.mode === mode}
            data-testid={`ai-ocr-mode-${mode}`}
            className={`sp-seg-btn ${status.mode === mode ? 'active' : ''}`}
            // Off is always reachable; the others wait for a provider that may be sent pictures.
            disabled={mode !== 'off' && !canSend}
            onClick={() => void update({ mode })}
          >
            {t(`aiProv.ocr.mode.${mode}`)}
          </button>
        ))}
      </div>
      <p id={`${ids}-mode-hint`} className="muted os-set-hint">
        {t(`aiProv.ocr.mode.${status.mode}.hint`)}
        {!blocked && !status.consent && ` ${t('aiProv.ocr.status.no-consent')}`}
      </p>
      {canSend && (
        <p className="ai-page-status is-ok" role="status" data-testid="ai-ocr-status">
          {t('aiProv.ocr.status.ready', { provider })}
        </p>
      )}
      <p className="muted os-set-hint">{t('aiProv.ocr.cost')}</p>
    </div>
  );
}

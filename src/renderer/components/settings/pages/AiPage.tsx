import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import { AI_PROVIDERS, providerById, type AiProviderId } from '../../../../shared/aiProviders';
import { aiKeySetFor } from '../../../../shared/aiSetup';
import {
  AGENT_PROVIDER_DEFAULT_PRICING,
  normalizeAgentProviderPrice,
} from '../../../../shared/agentProviderPricing';
import {
  notifyAiSetupChanged,
  setAiFeaturesEnabled,
  useAiReadiness,
  useAiSetupStatus,
} from '../../../aiSetupClient';
import {
  loadUserAgentProviderPricing,
  onAgentProviderPricingChanged,
  saveAgentProviderPrice,
} from '../../../agentProviderPricingStore';
import {
  loadLocalAgentSettings,
  onLocalAgentSettingsChanged,
  saveLocalAgentSettings,
} from '../../../localAgentSettingsStore';
import { AiModelInstallControl } from '../../ai/AiModelInstall';
import { AgentAutomationEditor } from '../../agent/AgentAutomationEditor';
import { AgentSpendPanel } from '../../agent/AgentSpendPanel';
import '../../ai/aiSetup.css';

/**
 * Settings > AI — every AI decision in one place.
 *
 * Before this page the switches were spread over AI Card Studio (the only
 * control for the engine and provider that analysis used), the EPUB miner, the
 * Agent composer, three key fields and Blanc — the only home of the Agent's
 * model picker and its schedule editor. Now: the master switch, the engine,
 * the provider and its key (the existing encrypted vault), the offline model
 * (installed from here), the Agent's switch, model and schedules, and what the
 * cloud may cost. Every "Set up AI" link in the app lands here.
 *
 * The engine, provider and key keep their owner in main (`ai:setEngine`,
 * `ai:setProvider`, `ai:setApiKey`); this page only writes through them and then
 * tells every window to re-read readiness.
 */
export default function AiPage() {
  const { t } = useT();
  const status = useAiSetupStatus();
  const readiness = useAiReadiness();
  const [agent, setAgent] = useState(loadLocalAgentSettings);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyMessage, setKeyMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  useEffect(() => onLocalAgentSettingsChanged(setAgent), []);

  const enabled = status?.enabled ?? true;
  const engine = status?.engine ?? 'cloud';
  const providerId = status?.providerId ?? AI_PROVIDERS[0].id;
  const provider = providerById(providerId);
  const keySaved = status ? aiKeySetFor(providerId, status.apiKeysSet) : false;

  const setEngine = async (next: 'cloud' | 'local-qwen'): Promise<void> => {
    await window.api.aiSetEngine(next).catch(() => undefined);
    notifyAiSetupChanged();
  };

  const setProvider = async (next: AiProviderId): Promise<void> => {
    await window.api.aiSetProvider(next).catch(() => undefined);
    setKeyDraft('');
    setKeyMessage(null);
    notifyAiSetupChanged();
  };

  const saveKey = async (): Promise<void> => {
    const draft = keyDraft.trim();
    if (!draft) {
      setKeyMessage({ kind: 'error', text: t('settings.ai.key.empty') });
      return;
    }
    setSavingKey(true);
    try {
      const result = await window.api.aiSetApiKey({ provider: provider.keyBucket, apiKey: draft });
      if (!result.ok) {
        setKeyMessage({ kind: 'error', text: t('settings.ai.key.failed') });
        return;
      }
      setKeyDraft('');
      setKeyMessage({ kind: 'ok', text: t('settings.ai.key.saved', { provider: provider.label }) });
      notifyAiSetupChanged();
    } catch {
      setKeyMessage({ kind: 'error', text: t('settings.ai.key.failed') });
    } finally {
      setSavingKey(false);
    }
  };

  const writeAgent = (patch: Parameters<typeof saveLocalAgentSettings>[0]): void => {
    setAgent(saveLocalAgentSettings(patch));
  };

  const models = status?.models ?? [];
  const pickedMissing = Boolean(agent.modelFileName)
    && !models.some((model) => model.fileName.toLocaleLowerCase() === agent.modelFileName.toLocaleLowerCase());

  return (
    <>
      <SettingsCard
        id="ai-enabled"
        title={t('settings.ai.enabled.title')}
        description={t('settings.ai.enabled.desc')}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            data-testid="ai-enabled"
            checked={enabled}
            disabled={!status}
            onChange={(event) => void setAiFeaturesEnabled(event.currentTarget.checked)}
          />
          <span>{t('settings.ai.enabled.label')}</span>
        </label>
        <p className="muted os-set-hint">
          {enabled ? t('settings.ai.enabled.onNote') : t('settings.ai.enabled.offNote')}
        </p>
      </SettingsCard>

      {enabled && (
        <>
          <SettingsCard
            id="ai-engine"
            title={t('settings.ai.engine.title')}
            description={t('settings.ai.engine.desc')}
          >
            <div className="sp-seg" role="radiogroup" aria-label={t('settings.ai.engine.title')}>
              {(['local-qwen', 'cloud'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  role="radio"
                  aria-checked={engine === choice}
                  className={`sp-seg-btn ${engine === choice ? 'active' : ''}`}
                  onClick={() => void setEngine(choice)}
                >
                  {t(choice === 'cloud' ? 'settings.ai.engine.cloud' : 'settings.ai.engine.local')}
                </button>
              ))}
            </div>
            <p className={`ai-page-status${readiness.ready ? ' is-ok' : ' muted'}`} role="status" data-testid="ai-readiness">
              {readiness.ready
                ? t('settings.ai.ready')
                : engine === 'cloud'
                  ? t('settings.ai.notReady.key')
                  : t('settings.ai.notReady.model')}
            </p>
          </SettingsCard>

          <SettingsCard
            id="ai-provider"
            title={t('settings.ai.provider.title')}
            description={t('settings.ai.provider.desc')}
          >
            <div className="ai-page-grid">
              <label htmlFor="ai-provider-select">{t('settings.ai.provider.label')}</label>
              <select
                id="ai-provider-select"
                className="set-select"
                value={providerId}
                onChange={(event) => void setProvider(event.currentTarget.value as AiProviderId)}
              >
                {AI_PROVIDERS.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.label}</option>
                ))}
              </select>
              <label htmlFor="ai-key-input">{t('settings.ai.key.label')}</label>
              <div className="ai-page-key-row">
                <input
                  id="ai-key-input"
                  className="os-input"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  placeholder={keySaved
                    ? t('settings.ai.key.replacePlaceholder')
                    : t('settings.ai.key.placeholder', { provider: provider.label })}
                  onChange={(event) => setKeyDraft(event.currentTarget.value)}
                />
                <button type="button" className="btn primary" disabled={savingKey} onClick={() => void saveKey()}>
                  {t('settings.ai.key.save')}
                </button>
                <button type="button" className="btn small" onClick={() => void window.api.openExternal(provider.keyUrl)}>
                  {t('settings.ai.key.get')}
                </button>
              </div>
            </div>
            <p className={`ai-page-status${keySaved ? ' is-ok' : ' muted'}`}>
              {keySaved ? t('settings.ai.key.isSaved') : t('settings.ai.key.none')}
            </p>
            {keyMessage && (
              <p className={`ai-page-status${keyMessage.kind === 'ok' ? ' is-ok' : ' ai-model-install-status is-error'}`} role="status">
                {keyMessage.text}
              </p>
            )}
            <p className="muted os-set-hint">{t('settings.ai.key.vaultNote')}</p>
          </SettingsCard>

          <SettingsCard
            id="ai-model"
            title={t('settings.ai.model.title')}
            description={t('settings.ai.model.desc')}
          >
            <AiModelInstallControl />
            <p className="muted os-set-hint">{t('settings.ai.model.manualNote')}</p>
          </SettingsCard>

          <SettingsCard
            id="ai-agent"
            title={t('settings.ai.agent.title')}
            description={t('settings.ai.agent.desc')}
          >
            <label className="os-toggle">
              <input
                type="checkbox"
                data-testid="ai-agent-enabled"
                checked={agent.enabled}
                onChange={(event) => writeAgent({
                  enabled: event.currentTarget.checked,
                  // A backend left at `disabled` forces `enabled` back off in
                  // `normalizeLocalAgentSettings`; turning the Agent on here
                  // means the local backend too.
                  ...(event.currentTarget.checked ? { backend: 'local-gguf' as const } : {}),
                })}
              />
              <span>{t('settings.ai.agent.enable')}</span>
            </label>
            <p className="muted os-set-hint">
              {agent.enabled
                ? readiness.agentCanPlan
                  ? t('settings.ai.agent.onReady')
                  : t('settings.ai.agent.onNotReady')
                : t('settings.ai.agent.offNote')}
            </p>
            <div className="ai-page-grid">
              <label htmlFor="ai-agent-model">{t('settings.ai.agent.model')}</label>
              <select
                id="ai-agent-model"
                data-testid="ai-agent-model"
                className="set-select"
                value={agent.modelFileName}
                onChange={(event) => writeAgent({ modelFileName: event.currentTarget.value })}
              >
                <option value="">{t('settings.ai.agent.modelAuto')}</option>
                {models.map((model) => (
                  <option key={model.fileName} value={model.fileName}>{model.fileName}</option>
                ))}
                {pickedMissing && (
                  <option value={agent.modelFileName}>
                    {t('settings.ai.agent.modelMissing', { name: agent.modelFileName })}
                  </option>
                )}
              </select>
            </div>
            {pickedMissing && (
              <p className="ai-model-install-status is-error">{t('settings.ai.agent.modelMissingNote')}</p>
            )}
          </SettingsCard>

          <SettingsCard
            id="ai-schedules"
            title={t('settings.ai.schedules.title')}
            description={t('settings.ai.schedules.desc')}
          >
            <AgentAutomationEditor variant="settings" />
          </SettingsCard>

          <SettingsCard
            id="ai-spend"
            title={t('settings.ai.spend.title')}
            description={t('settings.ai.spend.desc')}
          >
            <AiRatesEditor />
            <AgentSpendPanel />
          </SettingsCard>
        </>
      )}
    </>
  );
}

/**
 * The per-provider rates. Every row shows the figure that governs it; a row the
 * user has not overridden is labelled as the built-in estimate, and clearing an
 * override returns to it.
 */
function AiRatesEditor() {
  const { t, lang } = useT();
  const [userRates, setUserRates] = useState(loadUserAgentProviderPricing);
  const [drafts, setDrafts] = useState<Record<string, { input: string; output: string }>>({});

  useEffect(() => onAgentProviderPricingChanged(() => setUserRates(loadUserAgentProviderPricing())), []);

  const number = useMemo(
    () => new Intl.NumberFormat(LANG_TAGS[lang], { maximumFractionDigits: 4 }),
    [lang],
  );

  const commit = (providerId: AiProviderId): void => {
    const draft = drafts[providerId];
    if (!draft) return;
    const price = normalizeAgentProviderPrice({
      inputPerMillionTokens: Number(draft.input),
      outputPerMillionTokens: Number(draft.output),
    });
    if (!price || draft.input.trim() === '' || draft.output.trim() === '') return;
    saveAgentProviderPrice(providerId, price);
    setDrafts((current) => {
      const next = { ...current };
      delete next[providerId];
      return next;
    });
  };

  return (
    <div className="ai-rates">
      <p className="muted os-set-hint">{t('settings.ai.rates.note')}</p>
      <table className="ai-page-rates">
        <thead>
          <tr>
            <th>{t('settings.ai.provider.label')}</th>
            <th>{t('settings.ai.rates.input')}</th>
            <th>{t('settings.ai.rates.output')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {AI_PROVIDERS.map((entry) => {
            const own = userRates[entry.id];
            const governing = own ?? AGENT_PROVIDER_DEFAULT_PRICING[entry.id];
            const draft = drafts[entry.id] ?? {
              input: String(governing.inputPerMillionTokens),
              output: String(governing.outputPerMillionTokens),
            };
            const edit = (half: 'input' | 'output', value: string): void => {
              setDrafts((current) => ({ ...current, [entry.id]: { ...draft, [half]: value } }));
            };
            return (
              <tr key={entry.id} data-provider={entry.id}>
                <td>
                  {entry.label}
                  <div className="ai-page-rate-tag">
                    {own
                      ? t('settings.ai.rates.yours')
                      : t('settings.ai.rates.estimate', {
                        input: number.format(governing.inputPerMillionTokens),
                        output: number.format(governing.outputPerMillionTokens),
                      })}
                  </div>
                </td>
                <td>
                  <input
                    className="os-input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    aria-label={t('settings.ai.rates.inputFor', { provider: entry.label })}
                    value={draft.input}
                    onChange={(event) => edit('input', event.currentTarget.value)}
                    onBlur={() => commit(entry.id)}
                  />
                </td>
                <td>
                  <input
                    className="os-input"
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    aria-label={t('settings.ai.rates.outputFor', { provider: entry.label })}
                    value={draft.output}
                    onChange={(event) => edit('output', event.currentTarget.value)}
                    onBlur={() => commit(entry.id)}
                  />
                </td>
                <td>
                  {own && (
                    <button type="button" className="btn small" onClick={() => saveAgentProviderPrice(entry.id, null)}>
                      {t('settings.ai.rates.reset')}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

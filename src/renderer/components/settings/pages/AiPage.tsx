import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import {
  AI_PROVIDER_KEY_BUCKETS,
  AI_PROVIDERS,
  OPENAI_COMPATIBLE_PRESETS,
  normalizeAiModelName,
  normalizeCompatibleBaseUrl,
  providerById,
  type AiProviderId,
  type AiProviderKeyBucket,
} from '../../../../shared/aiProviders';
import {
  AI_CLOUD_FEATURES,
  aiKeySetFor,
  type AiFeatureSettingsPatch,
  type AiSetupStatus,
} from '../../../../shared/aiSetup';
import {
  aiErrorMessageKey,
  normalizeAiConnectionTestResult,
  type AiConnectionTestResult,
} from '../../../../shared/aiConnectionTest';
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
import AiOcrVisionSettings from '../../ai/AiOcrVisionSettings';
import { loadAiImmersePrefs, onAiImmersePrefsChanged, saveAiImmersePrefs } from '../../../aiImmersePrefs';
import { AgentAutomationEditor } from '../../agent/AgentAutomationEditor';
import { AgentSpendPanel } from '../../agent/AgentSpendPanel';
import '../../ai/aiSetup.css';
import { Toggle } from '../../ui';

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
  const [immersePrefs, setImmersePrefs] = useState(loadAiImmersePrefs);
  useEffect(() => onAiImmersePrefsChanged(setImmersePrefs), []);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiConnectionTestResult | null>(null);
  const [optionsError, setOptionsError] = useState(false);

  const enabled = status?.enabled ?? true;
  const engine = status?.engine ?? 'cloud';
  const providerId = status?.providerId ?? AI_PROVIDERS[0].id;
  const provider = providerById(providerId);
  const vendor = provider.keyBucket;
  const vendorModels = AI_PROVIDERS.filter((entry) => entry.keyBucket === vendor && !entry.modelConfigurable);
  /** Usable: a key, or for the local server its URL and model. */
  const keySaved = status ? aiKeySetFor(providerId, status.apiKeysSet) : false;
  const keyStored = provider.keyOptional ? false : keySaved;
  const modelHintKey = MODEL_HINT_KEYS[providerId];

  useEffect(() => setTestResult(null), [providerId]);

  // Setters used to swallow every failure (`.catch(() => undefined)`), so a
  // write main refused looked like it had worked. They say so now.
  const setEngine = async (next: 'cloud' | 'local-qwen'): Promise<void> => {
    try {
      await window.api.aiSetEngine(next);
      setOptionsError(false);
    } catch {
      setOptionsError(true);
    }
    notifyAiSetupChanged();
  };

  const setProvider = async (next: AiProviderId): Promise<void> => {
    try {
      await window.api.aiSetProvider(next);
      setOptionsError(false);
    } catch {
      setOptionsError(true);
    }
    setKeyDraft('');
    setKeyMessage(null);
    notifyAiSetupChanged();
  };

  /** A vendor change picks its first (cheapest) model, or keeps the current one. */
  const setVendor = async (next: AiProviderKeyBucket): Promise<void> => {
    if (next === vendor) return;
    const first = AI_PROVIDERS.find((entry) => entry.keyBucket === next);
    if (first) await setProvider(first.id);
  };

  const updateOptions = async (patch: AiFeatureSettingsPatch): Promise<void> => {
    try {
      await window.api.aiSetupUpdate(patch);
      setOptionsError(false);
    } catch {
      setOptionsError(true);
    }
    notifyAiSetupChanged();
  };

  const testConnection = async (): Promise<void> => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(normalizeAiConnectionTestResult(await window.api.aiSetupTestConnection(providerId)));
    } catch {
      setTestResult({ ok: false, code: 'generic' });
    } finally {
      setTesting(false);
    }
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
      setKeyMessage({ kind: 'ok', text: t('settings.ai.key.saved', { provider: vendorLabel(vendor, t) }) });
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
        <Toggle
          className="os-toggle"
          data-testid="ai-enabled"
          checked={enabled}
          disabled={!status}
          onChange={(event) => void setAiFeaturesEnabled(event.currentTarget.checked)}
          label={t('settings.ai.enabled.label')}
        />
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
            {optionsError && (
              <p className="ai-model-install-status is-error" role="status" data-testid="ai-save-failed">
                {t('aiProv.saveFailed')}
              </p>
            )}
          </SettingsCard>

          <SettingsCard
            id="ai-provider"
            title={t('settings.ai.provider.title')}
            description={t('settings.ai.provider.desc')}
          >
            <div className="ai-page-grid">
              <label htmlFor="ai-vendor-select">{t('settings.ai.provider.label')}</label>
              <select
                id="ai-vendor-select"
                data-testid="ai-vendor"
                className="set-select"
                value={vendor}
                onChange={(event) => void setVendor(event.currentTarget.value as AiProviderKeyBucket)}
              >
                {AI_PROVIDER_KEY_BUCKETS.map((bucket) => (
                  <option key={bucket} value={bucket}>{vendorLabel(bucket, t)}</option>
                ))}
              </select>
              {vendorModels.length > 1 && (
                <>
                  <label htmlFor="ai-provider-select">{t('aiProv.model.label')}</label>
                  <select
                    id="ai-provider-select"
                    data-testid="ai-model"
                    className="set-select"
                    value={providerId}
                    onChange={(event) => void setProvider(event.currentTarget.value as AiProviderId)}
                  >
                    {vendorModels.map((entry) => (
                      <option key={entry.id} value={entry.id}>{entry.label}</option>
                    ))}
                  </select>
                </>
              )}
              {vendor === 'openai' && status && (
                <>
                  <label htmlFor="ai-openai-model">{t('aiProv.model.label')}</label>
                  <ModelField
                    id="ai-openai-model"
                    value={status.openaiModel}
                    placeholder={provider.model}
                    onCommit={(openaiModel) => updateOptions({ openaiModel })}
                  />
                </>
              )}
              {vendor === 'openai-compatible' && status && (
                <LocalServerFields status={status} onCommit={updateOptions} />
              )}
              <label htmlFor="ai-key-input">
                {provider.keyOptional ? t('aiProv.key.optional') : t('settings.ai.key.label')}
              </label>
              <div className="ai-page-key-row">
                <input
                  id="ai-key-input"
                  className="ui-input"
                  type="password"
                  autoComplete="off"
                  value={keyDraft}
                  placeholder={keyStored
                    ? t('settings.ai.key.replacePlaceholder')
                    : t('settings.ai.key.placeholder', { provider: vendorLabel(vendor, t) })}
                  onChange={(event) => setKeyDraft(event.currentTarget.value)}
                />
                <button type="button" className="btn primary" disabled={savingKey} onClick={() => void saveKey()}>
                  {t('settings.ai.key.save')}
                </button>
                {!provider.keyOptional && (
                  <button type="button" className="btn small" onClick={() => void window.api.openExternal(provider.keyUrl)}>
                    {t('settings.ai.key.get')}
                  </button>
                )}
              </div>
            </div>
            {modelHintKey && <p className="muted os-set-hint" data-testid="ai-model-hint">{t(modelHintKey)}</p>}
            <p className={`ai-page-status${keySaved ? ' is-ok' : ' muted'}`}>
              {provider.keyOptional
                ? keySaved ? t('aiProv.local.ready') : t('aiProv.local.notReady')
                : keySaved ? t('settings.ai.key.isSaved') : t('settings.ai.key.none')}
            </p>
            {keyMessage && (
              <p className={`ai-page-status${keyMessage.kind === 'ok' ? ' is-ok' : ' ai-model-install-status is-error'}`} role="status">
                {keyMessage.text}
              </p>
            )}
            <div className="ai-page-key-row">
              <button
                type="button"
                className="btn"
                data-testid="ai-test-connection"
                disabled={testing || !keySaved}
                onClick={() => void testConnection()}
              >
                {testing ? t('aiProv.test.running') : t('aiProv.test.button')}
              </button>
              {testResult && (
                <span
                  className={`ai-page-status${testResult.ok ? ' is-ok' : ' ai-model-install-status is-error'}`}
                  role="status"
                  data-testid="ai-test-result"
                >
                  {testResultText(testResult, t)}
                </span>
              )}
            </div>
            <p className="muted os-set-hint">{t('settings.ai.key.vaultNote')}</p>
            <p className="muted os-set-hint">{t('aiProv.test.note')}</p>
          </SettingsCard>

          <SettingsCard
            id="ai-cloud-features"
            title={t('aiProv.features.title')}
            description={t('aiProv.features.desc')}
          >
            {AI_CLOUD_FEATURES.map((feature) => (
              <div key={feature.id} className="ai-page-feature">
                <Toggle
                  className="os-toggle"
                  data-testid={`ai-cloud-${feature.id}`}
                  checked={status?.cloudFeatures[feature.id] ?? feature.defaultAllowed}
                  disabled={!status}
                  onChange={(event) => updateOptions({ cloudFeatures: { [feature.id]: event.currentTarget.checked } })}
                  label={t(feature.labelKey)}
                />
                <p className="muted os-set-hint">{t(feature.descKey)}</p>
              </div>
            ))}
            {/* Not a cloud opt-in but the one AI action that may run without a press,
                so it sits with them: off by default, and it uses whichever engine
                (and, for the cloud, the "Translate VN lines" opt-in above) applies. */}
            <div className="ai-page-feature" data-ai-immerse-auto="">
              <Toggle
                className="os-toggle"
                data-testid="ai-immerse-vn-auto-translate"
                checked={immersePrefs.vnAutoTranslate}
                onChange={(event) => setImmersePrefs(saveAiImmersePrefs({ vnAutoTranslate: event.currentTarget.checked }))}
                label={t('aiImmerse.settings.vnAutoTranslate')}
              />
              <p className="muted os-set-hint">{t('aiImmerse.settings.vnAutoTranslate.desc')}</p>
            </div>
          </SettingsCard>

          <SettingsCard id="ai-ocr-vision" title={t('aiProv.ocr.title')} description={t('aiProv.ocr.desc')}>
            <AiOcrVisionSettings />
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
            <Toggle
              className="os-toggle"
              data-testid="ai-agent-enabled"
              checked={agent.enabled}
              onChange={(event) => writeAgent({
                enabled: event.currentTarget.checked,
                // A backend left at `disabled` forces `enabled` back off in
                // `normalizeLocalAgentSettings`; turning the Agent on here
                // means the local backend too.
                ...(event.currentTarget.checked ? { backend: 'local-gguf' as const } : {}),
              })}
              label={t('settings.ai.agent.enable')}
            />
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

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** Vendor names are brands (rendered as-is); only the local server is app chrome. */
const VENDOR_BRANDS: Partial<Record<AiProviderKeyBucket, string>> = {
  gemini: 'Google Gemini',
  deepseek: 'DeepSeek',
  anthropic: 'Anthropic Claude',
  openai: 'OpenAI',
};

function vendorLabel(bucket: AiProviderKeyBucket, t: TFn): string {
  return VENDOR_BRANDS[bucket] ?? t('aiProv.vendor.local');
}

/** What each fixed model is for, so the choice is not a guess between names. */
const MODEL_HINT_KEYS: Partial<Record<AiProviderId, string>> = {
  'claude-haiku-5-5': 'aiProv.modelHint.haiku',
  'claude-sonnet-5-5': 'aiProv.modelHint.sonnet',
  'claude-opus-5-5': 'aiProv.modelHint.opus',
  'deepseek-v4-flash': 'aiProv.modelHint.deepseekFlash',
  'deepseek-v4-pro': 'aiProv.modelHint.deepseekPro',
  openai: 'aiProv.modelHint.openai',
  'openai-compatible': 'aiProv.modelHint.local',
};

function testResultText(result: AiConnectionTestResult, t: TFn): string {
  if (result.ok) {
    return result.model
      ? t('aiProv.test.okModel', { model: result.model, ms: result.latencyMs })
      : t('aiProv.test.ok', { ms: result.latencyMs });
  }
  const reason = t(aiErrorMessageKey(result.code));
  return result.status !== undefined ? t('aiProv.test.failedStatus', { reason, status: result.status }) : reason;
}

/** A model-name field that saves on blur or Enter, and refuses what no server accepts. */
function ModelField({
  id,
  value,
  placeholder,
  onCommit,
}: {
  id: string;
  value: string;
  placeholder: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const invalid = draft.trim() !== '' && !normalizeAiModelName(draft);
  const commit = (): void => {
    if (invalid || draft.trim() === value) return;
    onCommit(draft.trim());
  };
  return (
    <div className="ai-page-key-row">
      <input
        id={id}
        className="ui-input"
        type="text"
        spellCheck={false}
        autoComplete="off"
        value={draft}
        placeholder={placeholder}
        aria-invalid={invalid}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
        }}
      />
      {invalid && <span className="ai-model-install-status is-error">{t('aiProv.model.invalid')}</span>}
    </div>
  );
}

/**
 * The OpenAI-compatible server: its base URL (with Ollama / LM Studio presets)
 * and the model it should run. Nothing here is a secret; an optional key goes
 * in the key field below, never in the URL (the URL field refuses one).
 */
function LocalServerFields({
  status,
  onCommit,
}: {
  status: AiSetupStatus;
  onCommit: (patch: AiFeatureSettingsPatch) => void;
}) {
  const { t } = useT();
  const [urlDraft, setUrlDraft] = useState(status.compatBaseUrl);
  useEffect(() => setUrlDraft(status.compatBaseUrl), [status.compatBaseUrl]);
  const normalized = normalizeCompatibleBaseUrl(urlDraft);
  const invalid = urlDraft.trim() !== '' && !normalized;
  const commitUrl = (value: string): void => {
    const next = normalizeCompatibleBaseUrl(value);
    if (value.trim() && !next) return;
    if (next === status.compatBaseUrl) return;
    onCommit({ compatBaseUrl: next });
  };
  return (
    <>
      <label htmlFor="ai-compat-url">{t('aiProv.local.url')}</label>
      <div className="ai-page-key-row">
        <input
          id="ai-compat-url"
          data-testid="ai-compat-url"
          className="ui-input"
          type="url"
          spellCheck={false}
          autoComplete="off"
          value={urlDraft}
          placeholder="http://localhost:11434/v1"
          aria-invalid={invalid}
          onChange={(event) => setUrlDraft(event.currentTarget.value)}
          onBlur={() => commitUrl(urlDraft)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitUrl(urlDraft);
          }}
        />
        {OPENAI_COMPATIBLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="btn small"
            onClick={() => {
              setUrlDraft(preset.baseUrl);
              commitUrl(preset.baseUrl);
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {invalid && <p className="ai-model-install-status is-error">{t('aiProv.local.urlInvalid')}</p>}
      <label htmlFor="ai-compat-model">{t('aiProv.model.label')}</label>
      <ModelField
        id="ai-compat-model"
        value={status.compatModel}
        placeholder="qwen3:8b"
        onCommit={(compatModel) => onCommit({ compatModel })}
      />
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
              input: governing ? String(governing.inputPerMillionTokens) : '',
              output: governing ? String(governing.outputPerMillionTokens) : '',
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
                      : governing
                        ? t('settings.ai.rates.estimate', {
                          input: number.format(governing.inputPerMillionTokens),
                          output: number.format(governing.outputPerMillionTokens),
                        })
                        : t('aiProv.rates.none')}
                  </div>
                </td>
                <td>
                  <input
                    className="ui-input"
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
                    className="ui-input"
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

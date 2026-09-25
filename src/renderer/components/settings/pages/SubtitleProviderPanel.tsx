/**
 * Subtitle providers and discovery behaviour.
 *
 * Two stores sit behind this panel, deliberately:
 *   §8's `subtitleStore` holds *preferences* — which languages the user likes,
 *     which style, which translators. Renderer-local, no secrets.
 *   The discovery settings hold *permissions* — whether to search at all, and
 *     what confidence is enough to attach without asking. Owned by main, because
 *     that is where the searching happens.
 * API keys are in neither: they live encrypted in the main process, and this
 * panel only ever learns whether one is present.
 */

import { LANG_TAGS } from '../../../../shared/i18n/core';
import { useCallback, useEffect, useState } from 'react';
import { useT } from '../../../i18n';
import SettingsCard from '../SettingsCard';
import { listSupportedSubtitleLanguages, type SubtitlePreferences } from '../../../../shared/subtitleManagement';
import { loadSubtitleManagementDocument, updateSubtitlePreferences } from '../../../subtitleStore';
import {
  DEFAULT_SUBTITLE_DISCOVERY_SETTINGS,
  SUBTITLE_TRANSLATION_ENGINE_PREFERENCES,
  isNetworkSubtitleProvider,
  type SubtitleDiscoverySettings,
  type SubtitleProviderCredentialState,
  type SubtitleProviderExecutionId,
  type SubtitleTranslationEnginePreference,
} from '../../../../shared/subtitleDiscoveryIpc';
import type { SubtitleAutoNotices } from '../../../../shared/subtitleDiscoveryStatus';
import { subtitleLangMatches } from '../../../../shared/subtitleDiscoveryPick';
import { useStudyLanguage } from '../../../useStudyLanguage';

const STYLES: SubtitlePreferences['style'][] = ['full', 'signs-songs', 'forced'];

/** Where the user gets a key, shown beside the field rather than buried in docs. */
const KEY_URLS: Partial<Record<SubtitleProviderExecutionId, string>> = {
  jimaku: 'https://jimaku.cc/login',
  opensubtitles: 'https://www.opensubtitles.com/consumers',
};

export default function SubtitleProviderPanel() {
  const { t, lang } = useT();
  const studyLang = useStudyLanguage().lang;
  const [management, setManagement] = useState(loadSubtitleManagementDocument);
  const [settings, setSettings] = useState<SubtitleDiscoverySettings>(DEFAULT_SUBTITLE_DISCOVERY_SETTINGS);
  const [credentials, setCredentials] = useState<SubtitleProviderCredentialState[]>([]);
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({});
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; detail?: string }>>({});
  const [notices, setNotices] = useState<SubtitleAutoNotices>({ active: [], quotaResetAt: null });

  const preferences = management.preferences;
  const languages = listSupportedSubtitleLanguages(preferences);
  const updatePreferences = (patch: Partial<SubtitlePreferences>): void =>
    setManagement(updateSubtitlePreferences(patch));

  useEffect(() => {
    void window.api.getSubtitleDiscoverySettings().then(setSettings).catch(() => undefined);
    void window.api.subtitleProviderCredentials().then(setCredentials).catch(() => undefined);
    // Fixable conditions the automation ran into — no translation engine, no
    // OpenSubtitles key, the daily quota — said here once, not as a toast per episode.
    void window.api.subtitleAutoNotices?.().then(setNotices).catch(() => undefined);
    return window.api.onSubtitleAutoNotices?.(setNotices);
  }, []);

  const dismissNotice = (id: string): void => {
    void window.api.dismissSubtitleAutoNotice(id)
      .then((next) => {
        setNotices(next);
        // The dismissal is stored in the same settings file this panel saves
        // whole; re-read it so the next toggle does not write the notice back.
        return window.api.getSubtitleDiscoverySettings().then(setSettings);
      })
      .catch(() => undefined);
  };

  /** Persists immediately; a settings page that needs a Save button gets stale. */
  const persist = useCallback((next: SubtitleDiscoverySettings) => {
    setSettings(next);
    void window.api.saveSubtitleDiscoverySettings(next).then(setSettings).catch(() => undefined);
  }, []);

  const setProviderEnabled = (id: SubtitleProviderExecutionId, enabled: boolean): void =>
    persist({
      ...settings,
      providers: settings.providers.map((provider) =>
        (provider.id === id ? { ...provider, enabled } : provider)),
    });

  /** Swaps a provider with its neighbour, then renumbers so priorities stay dense. */
  const moveProvider = (id: SubtitleProviderExecutionId, delta: -1 | 1): void => {
    const ordered = [...settings.providers].sort((a, b) => a.priority - b.priority);
    const index = ordered.findIndex((provider) => provider.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    persist({ ...settings, providers: ordered.map((provider, i) => ({ ...provider, priority: i })) });
  };

  const toggleAutoLanguage = (lang: string): void => {
    const active = settings.autoDownloadLanguages.includes(lang);
    persist({
      ...settings,
      autoDownloadLanguages: active
        ? settings.autoDownloadLanguages.filter((entry) => entry !== lang)
        : [...settings.autoDownloadLanguages, lang],
    });
  };

  const saveKey = async (id: SubtitleProviderExecutionId): Promise<void> => {
    setCredentials(await window.api.setSubtitleProviderKey(id, keyDrafts[id] ?? ''));
    setKeyDrafts((prev) => ({ ...prev, [id]: '' }));
  };

  const testProvider = async (id: SubtitleProviderExecutionId): Promise<void> => {
    setTesting(id);
    try {
      const result = await window.api.testSubtitleProvider(id);
      setTestResults((prev) => ({ ...prev, [id]: { ok: result.ok, detail: result.detail } }));
    } finally {
      setTesting(null);
    }
  };

  const ordered = [...settings.providers].sort((a, b) => a.priority - b.priority);
  const credentialFor = (id: string): SubtitleProviderCredentialState | undefined =>
    credentials.find((entry) => entry.id === id);

  return (
    <SettingsCard id="subtitle-providers" title={t('subtitle.title')} description={t('subtitle.desc')}>
      {notices.active.map((id) => (
        <div key={id} role="status" className="credential-warning subtitle-auto-notice">
          <span>
            {t(`subtitle.notice.${id}`, {
              time: notices.quotaResetAt ? new Date(notices.quotaResetAt).toLocaleString(LANG_TAGS[lang]) : '',
            })}
          </span>
          <button type="button" onClick={() => dismissNotice(id)}>{t('subtitle.notice.dismiss')}</button>
        </div>
      ))}
      <fieldset className="unified-search-controls">
        <legend>{t('subtitle.providers')}</legend>
        <ol className="subtitle-provider-list">
          {ordered.map((provider, index) => {
            const credential = credentialFor(provider.id);
            const needsKey = isNetworkSubtitleProvider(provider.id);
            const test = testResults[provider.id];
            return (
              <li key={provider.id} className="subtitle-provider-row">
                <div className="subtitle-provider-head">
                  <label className="subtitle-provider-toggle">
                    <input
                      type="checkbox"
                      checked={provider.enabled}
                      onChange={(e) => setProviderEnabled(provider.id, e.currentTarget.checked)}
                    />
                    <span>
                      <strong>{t(`subtitle.provider.${provider.id}`)}</strong>
                      <small className="muted">{t(`subtitle.provider.${provider.id}.desc`)}</small>
                    </span>
                  </label>
                  <div className="subtitle-provider-order">
                    <button
                      type="button"
                      aria-label={t('subtitle.moveUp')}
                      disabled={index === 0}
                      onClick={() => moveProvider(provider.id, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={t('subtitle.moveDown')}
                      disabled={index === ordered.length - 1}
                      onClick={() => moveProvider(provider.id, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>

                {needsKey && (
                  <div className="subtitle-provider-key">
                    <label htmlFor={`subtitle-key-${provider.id}`}>
                      {credential?.hasKey ? t('subtitle.keyStored') : t('subtitle.keyMissing')}
                    </label>
                    <input
                      id={`subtitle-key-${provider.id}`}
                      type="password"
                      autoComplete="off"
                      placeholder={credential?.hasKey ? '••••••••' : t('subtitle.keyPlaceholder')}
                      value={keyDrafts[provider.id] ?? ''}
                      onChange={(e) => setKeyDrafts((prev) => ({ ...prev, [provider.id]: e.currentTarget.value }))}
                    />
                    <button type="button" onClick={() => void saveKey(provider.id)}>
                      {(keyDrafts[provider.id] ?? '').trim() ? t('subtitle.keySave') : t('subtitle.keyClear')}
                    </button>
                    <button
                      type="button"
                      disabled={testing === provider.id || !credential?.hasKey}
                      onClick={() => void testProvider(provider.id)}
                    >
                      {testing === provider.id ? t('subtitle.testing') : t('subtitle.test')}
                    </button>
                    {KEY_URLS[provider.id] && (
                      <button
                        type="button"
                        className="subtitle-provider-link"
                        onClick={() => window.api.openExternal(KEY_URLS[provider.id] as string)}
                      >
                        {t('subtitle.getKey')}
                      </button>
                    )}
                    {test && (
                      <span role="status" className={test.ok ? 'subtitle-test-ok' : 'subtitle-test-fail'}>
                        {test.ok ? t('subtitle.testOk') : t(`subtitle.testFail.${test.detail ?? 'error'}`)}
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('subtitle.discovery')}</legend>
        <label className="os-set-toggle-row">
          <span>
            <strong>{t('subtitle.autoDiscover')}</strong>
            <small className="muted">{t('subtitle.autoDiscoverDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.autoDiscover}
            onChange={(e) => persist({ ...settings, autoDiscover: e.currentTarget.checked })}
          />
        </label>

        <div className="field-row">
          <span>{t('subtitle.autoDownload')}</span>
          <div className="subtitle-language-chips">
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                className="medialib-chip"
                aria-pressed={settings.autoDownloadLanguages.includes(lang)}
                onClick={() => toggleAutoLanguage(lang)}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
        <small className="muted">{t('subtitle.autoDownloadDesc')}</small>

        <div className="field-row">
          <label htmlFor="subtitle-confidence">
            {t('subtitle.minConfidence', { percent: settings.minConfidence })}
          </label>
          <input
            id="subtitle-confidence"
            type="range"
            min={0}
            max={100}
            step={5}
            value={settings.minConfidence}
            onChange={(e) => persist({ ...settings, minConfidence: Number(e.currentTarget.value) })}
          />
        </div>
        <small className="muted">{t('subtitle.minConfidenceDesc')}</small>

        <label className="os-set-toggle-row">
          <span>
            <strong>{t('subtitle.autoTranscribe')}</strong>
            <small className="muted">{t('subtitle.autoTranscribeDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.autoTranscribe}
            onChange={(e) => persist({ ...settings, autoTranscribe: e.currentTarget.checked })}
          />
        </label>

        <div className="field-row">
          <label htmlFor="subtitle-helper-language">{t('subtitle.helperLanguage')}</label>
          <select
            id="subtitle-helper-language"
            className="media-model-select"
            value={settings.helperLanguage ?? ''}
            onChange={(e) => persist({ ...settings, helperLanguage: e.currentTarget.value || null })}
          >
            <option value="">{t('subtitle.helperNone')}</option>
            {[...new Set(['en', ...(settings.helperLanguage ? [settings.helperLanguage] : []), ...languages])]
              // Any language but the one studied: the helper line explains the study line.
              .filter((lang) => !subtitleLangMatches(lang, studyLang))
              .map((language) => (
              <option key={language} value={language}>{language}</option>
            ))}
          </select>
        </div>
        <small className="muted">{t('subtitle.helperLanguageDesc')}</small>

        <label className="os-set-toggle-row">
          <span>
            <strong>{t('subtitle.autoTranslate')}</strong>
            <small className="muted">{t('subtitle.autoTranslateDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.autoTranslate}
            onChange={(e) => persist({ ...settings, autoTranslate: e.currentTarget.checked })}
          />
        </label>

        <div className="field-row">
          <label htmlFor="subtitle-translation-engine">{t('subtitle.translationEngine')}</label>
          <select
            id="subtitle-translation-engine"
            className="media-model-select"
            value={settings.translationEngine}
            disabled={!settings.autoTranslate}
            onChange={(e) => persist({
              ...settings,
              translationEngine: e.currentTarget.value as SubtitleTranslationEnginePreference,
            })}
          >
            {SUBTITLE_TRANSLATION_ENGINE_PREFERENCES.map((engine) => (
              <option key={engine} value={engine}>{t(`subtitle.translationEngine.${engine}`)}</option>
            ))}
          </select>
        </div>

        <label className="os-set-toggle-row">
          <span>
            <strong>{t('subtitle.autoStudyTrack')}</strong>
            <small className="muted">{t('subtitle.autoStudyTrackDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={settings.autoStudyTrack}
            onChange={(e) => persist({ ...settings, autoStudyTrack: e.currentTarget.checked })}
          />
        </label>

        <div className="field-row">
          <label htmlFor="subtitle-retry">{t('subtitle.retryAfter')}</label>
          <input
            id="subtitle-retry"
            type="number"
            min={0}
            max={365}
            value={settings.retryAfterDays}
            onChange={(e) => persist({ ...settings, retryAfterDays: Number(e.currentTarget.value) })}
          />
        </div>
      </fieldset>

      <fieldset className="unified-search-controls">
        <legend>{t('subtitle.preferences')}</legend>
        <div className="field-row">
          <label htmlFor="subtitle-primary">{t('subtitle.primary')}</label>
          <select
            id="subtitle-primary"
            className="media-model-select"
            value={preferences.primaryLanguage ?? ''}
            onChange={(e) => updatePreferences({ primaryLanguage: e.currentTarget.value || null })}
          >
            <option value="">{t('subtitle.none')}</option>
            {languages.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="subtitle-secondary">{t('subtitle.secondary')}</label>
          <select
            id="subtitle-secondary"
            className="media-model-select"
            value={preferences.secondaryLanguage ?? ''}
            onChange={(e) => updatePreferences({ secondaryLanguage: e.currentTarget.value || null })}
          >
            <option value="">{t('subtitle.none')}</option>
            {languages.map((language) => <option key={language} value={language}>{language}</option>)}
          </select>
        </div>
        <div className="field-row">
          <label htmlFor="subtitle-style">{t('subtitle.style')}</label>
          <select
            id="subtitle-style"
            className="media-model-select"
            value={preferences.style}
            onChange={(e) => updatePreferences({ style: e.currentTarget.value as SubtitlePreferences['style'] })}
          >
            {STYLES.map((style) => <option key={style} value={style}>{t(`subtitle.style.${style}`)}</option>)}
          </select>
        </div>
        <label className="os-set-toggle-row">
          <span>
            <strong>{t('subtitle.hearingImpaired')}</strong>
            <small className="muted">{t('subtitle.hearingImpairedDesc')}</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.allowHearingImpaired}
            onChange={(e) => updatePreferences({ allowHearingImpaired: e.currentTarget.checked })}
          />
        </label>
      </fieldset>
    </SettingsCard>
  );
}

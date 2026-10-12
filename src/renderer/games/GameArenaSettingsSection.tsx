import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  loadGameArenaSettings,
  migrateMirrorApiKey,
  onGameArenaSettingsChanged,
  saveGameArenaSettings,
  type ArenaLevelOverride,
  type GameArenaSettings,
  type MirrorEvaluatorBackend,
} from './settings';
import type { SourceLang } from './types';
import { segButton as seg } from '../components/ui/segButton';
import { Toggle } from '../components/ui';
import { useAiReadiness } from '../aiSetupClient';
import { MIRROR_CREDENTIAL_ID } from '../../shared/mirrorEvaluatorIpc';

const LEVELS: ArenaLevelOverride[] = ['auto', 1, 2, 3, 4, 5, 6, 7];
const SOURCE_LANGS: SourceLang[] = ['en', 'ru', 'zh'];


export default function GameArenaSettingsSection() {
  const { t } = useT();
  const [settings, setSettings] = useState<GameArenaSettings>(loadGameArenaSettings);
  const ai = useAiReadiness();
  const appAiReady = ai.loaded && ai.enabled && ai.ready;

  useEffect(() => onGameArenaSettingsChanged(() => setSettings(loadGameArenaSettings())), []);

  const patch = (next: Partial<GameArenaSettings>): void => {
    setSettings(saveGameArenaSettings(next));
  };

  return (
    <div className="game-settings-section">
      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <label className="field compact">
          <span>{t('games.settings.length')}</span>
          <input
            type="number"
            min={3}
            max={12}
            value={settings.gameLength}
            onChange={(e) => patch({ gameLength: Number(e.target.value) })}
          />
        </label>
        <Toggle
          className="os-toggle"
          checked={settings.sounds}
          onChange={(e) => patch({ sounds: e.target.checked })}
          label={t('games.settings.sounds')}
        />
        <Toggle
          className="os-toggle"
          checked={settings.adaptive}
          onChange={(e) => patch({ adaptive: e.target.checked })}
          label={t('games2.settings.adaptive')}
        />
        <Toggle
          className="os-toggle"
          checked={settings.arcadeStudyGate}
          onChange={(e) => patch({ arcadeStudyGate: e.target.checked })}
          label={t('games2.settings.arcadeGate')}
        />
      </div>
      <p className="muted os-set-hint">{t('games2.settings.arcadeGateHint')}</p>

      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <Toggle
          className="os-toggle"
          checked={settings.gradeDueCards}
          onChange={(e) => patch({ gradeDueCards: e.target.checked })}
          label={t('srs3.games.gradeDue')}
        />
      </div>
      <p className="muted os-set-hint">{t('srs3.games.gradeDueHint')}</p>

      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <span className="muted">{t('games.settings.sourceLang')}</span>
        {SOURCE_LANGS.map((lang) => (
          <button
            key={lang}
            type="button"
            {...seg(settings.sourceLang === lang)}
            onClick={() => patch({ sourceLang: lang })}
          >
            {t(`games.lang.${lang}`)}
          </button>
        ))}
      </div>

      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <span className="muted">{t('games.settings.level')}</span>
        {LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            {...seg(settings.levelOverride === level)}
            onClick={() => patch({ levelOverride: level })}
          >
            {level === 'auto' ? t('games.level.auto') : t('games.level.n', { level })}
          </button>
        ))}
      </div>

      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <span className="muted">{t('games.settings.mirrorBackend')}</span>
        {MIRROR_BACKENDS.map(({ id, labelKey }) => (
          <button
            key={id}
            type="button"
            {...seg(settings.mirrorBackend === id)}
            onClick={() => patch({ mirrorBackend: id, mirrorBackendChosen: true })}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {settings.mirrorBackend === 'app-ai' && (
        <p className="muted os-set-hint" data-testid="mirror-app-ai-note">
          {appAiReady ? t('aiProv.mirror.appAiNote') : t('aiProv.mirror.appAiNotReady')}
        </p>
      )}

      {settings.mirrorBackend === 'api' && <MirrorEndpointFields settings={settings} patch={patch} />}

      <p className="muted os-set-hint">{t('games.settings.privacy')}</p>
    </div>
  );
}

const MIRROR_BACKENDS: readonly { id: MirrorEvaluatorBackend; labelKey: string }[] = [
  { id: 'local', labelKey: 'games.mirror.backend.local' },
  { id: 'app-ai', labelKey: 'aiProv.mirror.backend.appAi' },
  { id: 'api', labelKey: 'games.mirror.backend.api' },
];

/**
 * The custom endpoint: URL, model, and a write-only key field. The key goes to
 * the encrypted credential vault and never comes back to this side — the field
 * shows whether one is saved, not what it is.
 */
function MirrorEndpointFields({
  settings,
  patch,
}: {
  settings: GameArenaSettings;
  patch: (next: Partial<GameArenaSettings>) => void;
}) {
  const { t } = useT();
  const [keySaved, setKeySaved] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState(false);

  const refresh = async (): Promise<void> => {
    const snapshot = await window.api.credentialStatus?.().catch(() => null);
    setKeySaved(Boolean(snapshot?.statuses.find((entry) => entry.id === MIRROR_CREDENTIAL_ID)?.configured));
  };

  useEffect(() => {
    // A key an older build kept in localStorage moves into the vault first.
    void migrateMirrorApiKey(MIRROR_CREDENTIAL_ID).finally(() => void refresh());
  }, []);

  const saveKey = async (): Promise<void> => {
    const value = keyDraft.trim();
    if (!value) return;
    const result = await window.api.setCredentialSecret(MIRROR_CREDENTIAL_ID, 'apiKey', value).catch(() => null);
    setKeyError(!result?.ok);
    if (result?.ok) setKeyDraft('');
    await refresh();
  };

  const removeKey = async (): Promise<void> => {
    await window.api.clearCredential(MIRROR_CREDENTIAL_ID).catch(() => null);
    await refresh();
  };

  return (
    <>
      <label className="field">
        <span>{t('games.settings.apiUrl')}</span>
        <input
          className="ui-input"
          type="url"
          value={settings.mirrorApiUrl}
          placeholder="http://localhost:11434/v1"
          onChange={(e) => patch({ mirrorApiUrl: e.target.value })}
        />
      </label>
      <p className="muted os-set-hint">{t('aiProv.mirror.urlHint')}</p>

      <label className="field">
        <span>{t('aiProv.mirror.model')}</span>
        <input
          className="ui-input"
          type="text"
          value={settings.mirrorApiModel}
          placeholder="gpt-5-mini · qwen3:8b"
          onChange={(e) => patch({ mirrorApiModel: e.target.value })}
        />
      </label>
      <p className="muted os-set-hint">{t('aiProv.mirror.modelHint')}</p>

      <label className="field">
        <span>{t('games.settings.apiKey')}</span>
        <input
          className="ui-input"
          type="password"
          autoComplete="off"
          value={keyDraft}
          placeholder={t('aiProv.mirror.keyPlaceholder')}
          onChange={(e) => setKeyDraft(e.target.value)}
        />
      </label>
      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <button type="button" className="btn small" disabled={!keyDraft.trim()} onClick={() => void saveKey()}>
          {t('aiProv.mirror.keySave')}
        </button>
        {keySaved && (
          <button type="button" className="btn small" onClick={() => void removeKey()}>
            {t('aiProv.mirror.keyRemove')}
          </button>
        )}
        <span className="muted" role="status">
          {keyError ? t('aiProv.mirror.keyFailed') : keySaved ? t('aiProv.mirror.keySaved') : t('aiProv.mirror.keyNone')}
        </span>
      </div>
    </>
  );
}

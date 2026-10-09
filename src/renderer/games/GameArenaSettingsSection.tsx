import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import {
  loadGameArenaSettings,
  onGameArenaSettingsChanged,
  saveGameArenaSettings,
  type ArenaLevelOverride,
  type GameArenaSettings,
} from './settings';
import type { SourceLang } from './types';
import { segButton as seg } from '../components/ui/segButton';
import { Toggle } from '../components/ui';

const LEVELS: ArenaLevelOverride[] = ['auto', 1, 2, 3, 4, 5, 6, 7];
const SOURCE_LANGS: SourceLang[] = ['en', 'ru', 'zh'];


export default function GameArenaSettingsSection() {
  const { t } = useT();
  const [settings, setSettings] = useState<GameArenaSettings>(loadGameArenaSettings);

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
        <button
          type="button"
          {...seg(settings.mirrorBackend === 'local')}
          onClick={() => patch({ mirrorBackend: 'local' })}
        >
          {t('games.mirror.backend.local')}
        </button>
        <button
          type="button"
          {...seg(settings.mirrorBackend === 'api')}
          onClick={() => patch({ mirrorBackend: 'api' })}
        >
          {t('games.mirror.backend.api')}
        </button>
      </div>

      <label className="field">
        <span>{t('games.settings.apiUrl')}</span>
        <input
          className="ui-input"
          type="url"
          value={settings.mirrorApiUrl}
          placeholder="https://localhost:8000/v1/chat/completions"
          onChange={(e) => patch({ mirrorApiUrl: e.target.value })}
        />
      </label>

      <label className="field">
        <span>{t('games.settings.apiKey')}</span>
        <input
          className="ui-input"
          type="password"
          value={settings.mirrorApiKey}
          onChange={(e) => patch({ mirrorApiKey: e.target.value })}
        />
      </label>

      <p className="muted os-set-hint">{t('games.settings.privacy')}</p>
    </div>
  );
}

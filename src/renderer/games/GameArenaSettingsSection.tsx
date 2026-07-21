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

const LEVELS: ArenaLevelOverride[] = ['auto', 1, 2, 3, 4, 5, 6, 7];
const SOURCE_LANGS: SourceLang[] = ['en', 'ru', 'zh'];

function seg(active: boolean): string {
  return `btn small ${active ? 'primary' : ''}`;
}

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
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={settings.sounds}
            onChange={(e) => patch({ sounds: e.target.checked })}
          />
          <span>{t('games.settings.sounds')}</span>
        </label>
      </div>

      <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
        <span className="muted">{t('games.settings.sourceLang')}</span>
        {SOURCE_LANGS.map((lang) => (
          <button
            key={lang}
            type="button"
            className={seg(settings.sourceLang === lang)}
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
            className={seg(settings.levelOverride === level)}
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
          className={seg(settings.mirrorBackend === 'local')}
          onClick={() => patch({ mirrorBackend: 'local' })}
        >
          {t('games.mirror.backend.local')}
        </button>
        <button
          type="button"
          className={seg(settings.mirrorBackend === 'api')}
          onClick={() => patch({ mirrorBackend: 'api' })}
        >
          {t('games.mirror.backend.api')}
        </button>
      </div>

      <label className="field">
        <span>{t('games.settings.apiUrl')}</span>
        <input
          type="url"
          value={settings.mirrorApiUrl}
          placeholder="https://localhost:8000/v1/chat/completions"
          onChange={(e) => patch({ mirrorApiUrl: e.target.value })}
        />
      </label>

      <label className="field">
        <span>{t('games.settings.apiKey')}</span>
        <input
          type="password"
          value={settings.mirrorApiKey}
          onChange={(e) => patch({ mirrorApiKey: e.target.value })}
        />
      </label>

      <p className="muted os-set-hint">{t('games.settings.privacy')}</p>
    </div>
  );
}

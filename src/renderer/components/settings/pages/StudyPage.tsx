import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { ProfileSettingsSection, DictionarySettingsSection } from '../../../views/SettingsView';
import { LevelSettingsSection } from '../../LevelMeter';
import GameArenaSettingsSection from '../../../games/GameArenaSettingsSection';
import StudyLanguageSection from './StudyLanguageSection';
import ExtensionBridgeSection from './ExtensionBridgeSection';
import SystemDictionarySection from './SystemDictionarySection';
import ReadingLensSection from './ReadingLensSection';
import AiAnalysisSection from './AiAnalysisSection';
import SubtitleStyleCard from './SubtitleStyleCard';
import AnkiSchedulingCard from './AnkiSchedulingCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import {
  focusLockOptions,
  loadFocusMode,
  loadFocusSettings,
  onFocusModeChanged,
  onFocusSettingsChanged,
  saveFocusSettings,
  setFocusMode,
  type FocusLockMinutes,
  type FocusTabId,
} from '../../../focusMode';
import { segButton as seg } from '../../ui/segButton';
import { Toggle } from '../../ui';


export default function StudyPage() {
  const { t } = useT();
  const { focusSettingId } = useSettings();
  const [focus, setFocus] = useState(loadFocusMode);
  const [cfg, setCfg] = useState(loadFocusSettings);

  useEffect(() => onFocusModeChanged(setFocus), []);
  useEffect(() => onFocusSettingsChanged(setCfg), []);

  const patch = (p: Partial<typeof cfg>) => setCfg(saveFocusSettings(p));

  const tabOptions: { id: FocusTabId; labelKey: string }[] = [
    { id: 'library', labelKey: 'focus.tab.library' },
    { id: 'dictionary', labelKey: 'focus.tab.dictionary' },
    { id: 'anki', labelKey: 'focus.tab.anki' },
  ];

  return (
    <>
      <StudyLanguageSection />
      <ExtensionBridgeSection />

      <SettingsCard
        id="focus-mode"
        title={t('focus.settings.title')}
        description={t('focus.settings.desc')}
        highlight={focusSettingId === 'focus-mode'}
        trailing={
          <Toggle
            className="os-toggle os-toggle-compact"
            checked={focus}
            onChange={(e) => setFocusMode(e.target.checked)}
            aria-label={t('focus.settings.enable')}
            label={focus ? t('common.on') : t('common.off')}
          />
        }
      >
        <p className="muted os-set-hint">{t('focus.settings.shortcutHint')}</p>
      </SettingsCard>

      <SettingsCard
        id="focus-lock"
        title={t('focus.lock.title')}
        description={t('focus.lock.desc')}
        highlight={focusSettingId === 'focus-lock'}
      >
        <div className="os-viz-row" style={{ flexWrap: 'wrap' }}>
          {focusLockOptions().map(({ minutes, labelKey }) => (
            <button
              key={minutes}
              type="button"
              {...seg(cfg.lockMinutes === minutes)}
              onClick={() => patch({ lockMinutes: minutes as FocusLockMinutes })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <p className="muted os-set-hint">{t('focus.lock.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="focus-default-tab"
        title={t('focus.defaultTab.title')}
        description={t('focus.defaultTab.desc')}
        highlight={focusSettingId === 'focus-default-tab'}
      >
        <div className="os-viz-row">
          {tabOptions.map(({ id, labelKey }) => (
            <button
              key={id}
              type="button"
              {...seg(cfg.defaultTab === id)}
              onClick={() => patch({ defaultTab: id })}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <Toggle
          className="os-toggle"
          checked={cfg.restoreLastTab}
          onChange={(e) => patch({ restoreLastTab: e.target.checked })}
          label={t('focus.restoreTab.label')}
        />
        <p className="muted os-set-hint">{t('focus.restoreTab.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="focus-distractions"
        title={t('focus.distractions.title')}
        description={t('focus.distractions.desc')}
        highlight={focusSettingId === 'focus-distractions'}
      >
        <Toggle
          className="os-toggle"
          checked={cfg.hideMusicBar}
          onChange={(e) => patch({ hideMusicBar: e.target.checked })}
          label={t('focus.hideMusic.label')}
        />
        <Toggle
          className="os-toggle"
          checked={cfg.minimalChrome}
          onChange={(e) => patch({ minimalChrome: e.target.checked })}
          label={t('focus.minimalChrome.label')}
        />
      </SettingsCard>

      <SettingsCard
        id="focus-auto-enter"
        title={t('focus.autoEnter.title')}
        description={t('focus.autoEnter.desc')}
        highlight={focusSettingId === 'focus-auto-enter'}
      >
        <Toggle
          className="os-toggle"
          checked={cfg.autoEnterOnLaunch}
          onChange={(e) => patch({ autoEnterOnLaunch: e.target.checked })}
          label={t('focus.autoEnter.label')}
        />
        <p className="muted os-set-hint">{t('focus.autoEnter.hint')}</p>
      </SettingsCard>

      <SettingsCard
        id="level"
        title={t('settings.study.level.title')}
        description={t('settings.study.level.desc')}
        highlight={focusSettingId === 'level'}
      >
        <LevelSettingsSection />
      </SettingsCard>
      <SettingsCard
        id="game-arena"
        title={t('games.settings.title')}
        description={t('games.settings.desc')}
        highlight={focusSettingId === 'game-arena'}
      >
        <GameArenaSettingsSection />
      </SettingsCard>
      <SettingsCard
        id="profile"
        title={t('search.profile')}
        description={t('search.profile.desc')}
        highlight={focusSettingId === 'profile'}
      >
        <ProfileSettingsSection />
      </SettingsCard>
      <AnkiSchedulingCard />
      <SettingsCard
        id="dictionary"
        title={t('search.dictionary')}
        description={t('search.dictionary.desc')}
        highlight={focusSettingId === 'dictionary'}
      >
        <DictionarySettingsSection />
      </SettingsCard>
      <SettingsCard
        id="system-dictionary"
        title={t('settings.sysDict.title')}
        description={t('settings.sysDict.desc')}
        highlight={focusSettingId === 'system-dictionary'}
      >
        <SystemDictionarySection />
      </SettingsCard>
      <SettingsCard
        id="ai-analysis"
        title={t('settings.analysis.title')}
        description={t('settings.analysis.desc')}
        highlight={focusSettingId === 'ai-analysis'}
      >
        <AiAnalysisSection />
      </SettingsCard>
      <SettingsCard
        id="reading-lens"
        title={t('settings.lens.title')}
        description={t('settings.lens.desc')}
        highlight={focusSettingId === 'reading-lens'}
      >
        <ReadingLensSection />
      </SettingsCard>
      <SubtitleStyleCard />
    </>
  );
}

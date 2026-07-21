import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadPersonalization,
  onPersonalizationChanged,
  savePersonalization,
  type OsPersonalization,
} from '../../osPersonalization';
import {
  loadDesktopPrefs,
  onDesktopPrefsChanged,
  saveDesktopPrefs,
  type DesktopPrefs,
} from '../../desktopPrefs';
import {
  loadEnvironment,
  onEnvironmentChanged,
  saveEnvironment,
  type EnvironmentSettings,
} from '../../environment';
import { loadVizSettings, saveVizSettings, type VizSettings } from '../../visualizerSettings';
import { loadSettings as loadReaderSettings, saveSettings as saveReaderSettings } from '../../readerSettings';
import {
  loadWhisperDevice,
  loadWhisperModelTier,
  setWhisperDevice,
  setWhisperModelTier,
  type WhisperDevice,
  type WhisperModelTier,
} from '../../whisperSettings';
import { loadLyricsSettings, onLyricsSettingsChanged, setUseAlbumInSearch } from '../../lyricsSettings';
import { applyTheme, loadThemeId, onThemeChanged } from '../../theme';
import { bumpZoom, loadZoom, onZoomChanged, setZoom } from '../../appZoom';
import { loadCustomCss, onCustomCssChanged } from '../../customCss';
import { registerCommandHandler } from '../../keyboardShortcuts';
import { SettingsProvider } from './SettingsContext';
import SettingsNav from './SettingsNav';
import SettingsSearch from './SettingsSearch';
import SettingsHome from './SettingsHome';
import { groupLabelKey, pageMeta } from './settingsRegistry';
import { useT } from '../../i18n';
import { pushRecentPage } from './settingsRecent';
import type { SettingsController, SettingsPageId, SettingsWallProps } from './types';
import Icon from '../Icons';
import {
  AppChrome,
  Button,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../ui';
import AppearancePage from './pages/AppearancePage';
import WallpaperPage from './pages/WallpaperPage';
import AtmospherePage from './pages/AtmospherePage';
import CompanionsPage from './pages/CompanionsPage';
import DesktopLayoutPage from './pages/DesktopLayoutPage';
import ShortcutsPage from './pages/ShortcutsPage';
import StudyPage from './pages/StudyPage';
import ProfileRulesPage from './pages/ProfileRulesPage';
import ReadingPage from './pages/ReadingPage';
import TranscriptionPage from './pages/TranscriptionPage';
import StoragePage from './pages/StoragePage';
import VisualizerPage from './pages/VisualizerPage';
import DisplayPage from './pages/DisplayPage';
import MotionPage from './pages/MotionPage';
import MemoryPage from './pages/MemoryPage';
import MiniModePage from './pages/MiniModePage';
import LockscreenPage from './pages/LockscreenPage';
import SpecialPage from './pages/SpecialPage';
import {
  loadMiniMode,
  onMiniModeChanged,
  saveMiniMode,
  type MiniModeSettings,
} from '../../miniMode';
import {
  applySettingsAdvancedClass,
  loadSettingsAdvanced,
  onSettingsAdvancedChanged,
  setSettingsAdvanced,
} from '../../settingsAdvanced';

const MOTION_KEY = 'jp-os-reduce-motion';

function applyMotion(reduce: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

export default function SettingsApp(props: SettingsWallProps) {
  const { t } = useT();
  const aero = useAeroMaterials();
  const [page, setPage] = useState<SettingsPageId>('home');
  const [focusSettingId, setFocusSettingId] = useState<string | null>(null);
  const [look, setLook] = useState<OsPersonalization>(loadPersonalization);
  const [deskPrefs, setDeskPrefs] = useState<DesktopPrefs>(loadDesktopPrefs);
  const [env, setEnv] = useState<EnvironmentSettings>(loadEnvironment);
  const [userCss, setUserCss] = useState(loadCustomCss);
  const [cssMsg, setCssMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState(loadThemeId);
  const [zoom, setZoomState] = useState(loadZoom);
  const [reduce, setReduce] = useState(() => localStorage.getItem(MOTION_KEY) === '1');
  const [viz, setViz] = useState<VizSettings>(loadVizSettings);
  const [readerSettings, setReaderSettings] = useState(loadReaderSettings);
  const [whisperDevice, setWhisperDeviceState] = useState<WhisperDevice>(loadWhisperDevice);
  const [whisperModelTier, setWhisperModelTierState] = useState<WhisperModelTier>(() =>
    loadWhisperModelTier('ja'),
  );
  const [lyricsSettings, setLyricsSettings] = useState(loadLyricsSettings);
  const [mini, setMini] = useState<MiniModeSettings>(() => loadMiniMode());
  const [advancedMode, setAdvancedModeState] = useState(() => loadSettingsAdvanced());
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback((next: SettingsPageId, settingId?: string) => {
    setPage(next);
    pushRecentPage(next);
    setFocusSettingId(settingId ?? null);
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    applySettingsAdvancedClass();
  }, []);
  useEffect(() => onZoomChanged(setZoomState), []);
  useEffect(() => onLyricsSettingsChanged(setLyricsSettings), []);
  useEffect(() => onPersonalizationChanged(setLook), []);
  useEffect(() => onDesktopPrefsChanged(setDeskPrefs), []);
  useEffect(() => onEnvironmentChanged(setEnv), []);
  useEffect(() => onThemeChanged(setTheme), []);
  useEffect(() => onCustomCssChanged(setUserCss), []);
  useEffect(() => onMiniModeChanged(setMini), []);
  useEffect(() => onSettingsAdvancedChanged(setAdvancedModeState), []);

  useEffect(() => {
    return registerCommandHandler('settings.focusSearch', () => {
      searchRef.current?.focus();
      searchRef.current?.select();
    });
  }, []);

  // Companion menu “Configure routines” → Settings Companions
  useEffect(() => {
    const onNav = (ev: Event) => {
      const d = (ev as CustomEvent<{ page?: SettingsPageId; settingId?: string }>).detail;
      if (!d?.page) return;
      navigate(d.page, d.settingId);
    };
    window.addEventListener('settings:navigate', onNav);
    return () => window.removeEventListener('settings:navigate', onNav);
  }, [navigate]);

  // Clear highlight after a short beat so re-navigation can re-trigger
  useEffect(() => {
    if (!focusSettingId) return;
    const t = window.setTimeout(() => setFocusSettingId(null), 2200);
    return () => clearTimeout(t);
  }, [focusSettingId, page]);

  const ctrl: SettingsController = useMemo(
    () => ({
      ...props,
      page,
      navigate,
      focusSettingId,
      clearFocusSetting: () => setFocusSettingId(null),
      look,
      patchLook: (p) => setLook(savePersonalization(p)),
      deskPrefs,
      patchDesk: (p) => setDeskPrefs(saveDesktopPrefs(p)),
      env,
      patchEnv: (p) => setEnv(saveEnvironment(p)),
      viz,
      patchViz: (p) => {
        const next = { ...viz, ...p };
        setViz(next);
        saveVizSettings(next);
      },
      theme,
      chooseTheme: (id: string) => {
        setTheme(id);
        applyTheme(id);
        if (look.autoTheme) setLook(savePersonalization({ autoTheme: false }));
      },
      zoom,
      setZoomValue: (n) => setZoomState(setZoom(n)),
      bumpZoomBy: (d) => setZoomState(bumpZoom(d)),
      reduce,
      toggleMotion: () => {
        const next = !reduce;
        setReduce(next);
        localStorage.setItem(MOTION_KEY, next ? '1' : '0');
        applyMotion(next);
      },
      readerSettings,
      changeReaderSettings: (rs) => {
        setReaderSettings(rs);
        saveReaderSettings(rs);
      },
      whisperDevice,
      chooseWhisperDevice: (d) => {
        setWhisperDeviceState(d);
        setWhisperDevice(d);
      },
      whisperModelTier,
      chooseWhisperModelTier: (tier) => {
        setWhisperModelTierState(tier);
        setWhisperModelTier(tier);
      },
      lyricsSettings,
      setLyricsAlbumSearch: (on) => setLyricsSettings(setUseAlbumInSearch(on)),
      userCss,
      setUserCss,
      cssMsg,
      setCssMsg,
      mini,
      patchMini: (p) => setMini(saveMiniMode(p)),
      advancedMode,
      setAdvancedMode: (on: boolean) => setAdvancedModeState(setSettingsAdvanced(on)),
      seg: (active: boolean) => `btn small ${active ? 'primary' : ''}`,
    }),
    [
      props,
      page,
      navigate,
      focusSettingId,
      look,
      deskPrefs,
      env,
      viz,
      theme,
      zoom,
      reduce,
      readerSettings,
      whisperDevice,
      whisperModelTier,
      lyricsSettings,
      userCss,
      cssMsg,
      mini,
      advancedMode,
    ],
  );

  const meta = pageMeta(page);
  const reduceMotion = typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');
  const pageLabel = meta?.label ?? 'Control Center';
  const pageGroup = meta?.group ?? 'Settings';
  const toggleAdvanced = () => setAdvancedModeState(setSettingsAdvanced(!advancedMode));
  const focusSearch = () => {
    searchRef.current?.focus();
    searchRef.current?.select();
  };
  const settingsMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        {
          id: 'home',
          label: 'Control Center Home',
          icon: <Icon name="settings" size={14} />,
          disabled: page === 'home',
          onSelect: () => navigate('home'),
        },
        {
          id: 'find-setting',
          label: 'Find a setting',
          icon: <Icon name="search" size={14} />,
          onSelect: focusSearch,
        },
        { id: 'file-sep-1', separator: true, label: '' },
        {
          id: 'display',
          label: 'Open Display',
          icon: <Icon name="monitor" size={14} />,
          disabled: page === 'display',
          onSelect: () => navigate('display'),
        },
        {
          id: 'lockscreen',
          label: 'Open Lockscreen',
          icon: <Icon name="lock" size={14} />,
          disabled: page === 'lockscreen',
          onSelect: () => navigate('lockscreen'),
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        {
          id: 'standard',
          label: advancedMode ? 'Hide advanced pages' : 'Show advanced pages',
          icon: <Icon name="wrench" size={14} />,
          onSelect: toggleAdvanced,
        },
        {
          id: 'desktop-layout',
          label: 'Desktop layout',
          icon: <Icon name="app" size={14} />,
          disabled: page === 'desktop-layout',
          onSelect: () => navigate('desktop-layout'),
        },
        {
          id: 'shortcuts',
          label: 'Keyboard shortcuts',
          icon: <Icon name="keyboard" size={14} />,
          disabled: page === 'shortcuts',
          onSelect: () => navigate('shortcuts'),
        },
      ],
    },
    {
      id: 'page',
      label: 'Page',
      items: [
        {
          id: 'appearance',
          label: 'Appearance',
          icon: <Icon name="brush" size={14} />,
          disabled: page === 'appearance',
          onSelect: () => navigate('appearance'),
        },
        {
          id: 'reading',
          label: 'Reading',
          icon: <Icon name="novels" size={14} />,
          disabled: page === 'reading',
          onSelect: () => navigate('reading'),
        },
        {
          id: 'transcription',
          label: 'Transcription',
          icon: <Icon name="caption" size={14} />,
          disabled: page === 'transcription',
          onSelect: () => navigate('transcription'),
        },
        {
          id: 'memory',
          label: 'Memory and storage',
          icon: <Icon name="folder" size={14} />,
          disabled: page === 'memory',
          onSelect: () => navigate('memory'),
        },
        {
          id: 'special',
          label: 'Special modules',
          icon: <Icon name="sparkle" size={14} />,
          disabled: page === 'special',
          onSelect: () => navigate('special'),
        },
      ],
    },
  ];
  const settingsStatus = (
    <>
      <StatusBarField>{pageLabel}</StatusBarField>
      <StatusBarField>{pageGroup}</StatusBarField>
      <StatusBarSpacer />
      <StatusBarField>{advancedMode ? 'Advanced pages visible' : 'Standard pages'}</StatusBarField>
      <StatusBarField title={`Theme: ${theme}`}>{theme}</StatusBarField>
      <StatusBarField>{Math.round(zoom * 100)}%</StatusBarField>
    </>
  );

  // If user turns Advanced off while on an advanced-only page, bounce home.
  useEffect(() => {
    if (!advancedMode && meta?.advanced && page !== 'home') {
      navigate('home');
    }
  }, [advancedMode, meta?.advanced, page, navigate]);

  return (
    <SettingsProvider value={ctrl}>
      <AppChrome menus={settingsMenus} status={settingsStatus} className="aero-settings-chrome">
        <div className={`os-settings os-settings-v2${advancedMode ? ' is-advanced' : ''}${aero ? ' aero-settings' : ''}`}>
          <div className="os-set-top">
            <SettingsSearch ref={searchRef} onNavigate={navigate} />
            {aero && (
              <Toolbar className="aero-settings-commandbar" aria-label="Settings commands">
                <Button
                  size="sm"
                  disabled={page === 'home'}
                  leftIcon={<Icon name="settings" size={14} />}
                  onClick={() => navigate('home')}
                >
                  Home
                </Button>
                <Button size="sm" leftIcon={<Icon name="search" size={14} />} onClick={focusSearch}>
                  Find
                </Button>
                <Button
                  size="sm"
                  disabled={page === 'display'}
                  leftIcon={<Icon name="monitor" size={14} />}
                  onClick={() => navigate('display')}
                >
                  Display
                </Button>
                <Button
                  size="sm"
                  disabled={page === 'lockscreen'}
                  leftIcon={<Icon name="lock" size={14} />}
                  onClick={() => navigate('lockscreen')}
                >
                  Lock
                </Button>
                <ToolbarSpacer />
                <Button
                  size="sm"
                  variant={advancedMode ? 'primary' : 'default'}
                  leftIcon={<Icon name="wrench" size={14} />}
                  onClick={toggleAdvanced}
                  aria-pressed={advancedMode}
                >
                  Advanced
                </Button>
              </Toolbar>
            )}
          </div>
          <div className="os-set-body">
            <SettingsNav
              page={page}
              onNavigate={(id) => navigate(id)}
              advancedMode={advancedMode}
              onToggleAdvanced={toggleAdvanced}
            />
            <div
              ref={contentRef}
              className={`os-set-pane-v2${reduceMotion ? '' : ' os-set-pane-anim'}`}
              key={page}
              role="main"
              aria-label={meta ? t(meta.labelKey) : t('settings.appTitle')}
            >
              {page !== 'home' && meta && (
                <header className="os-set-page-head">
                  <p className="os-set-breadcrumb muted">
                    {meta.group ? (
                      <>
                        <span>{t(groupLabelKey(meta.group))}</span>
                        <span className="os-set-breadcrumb-sep" aria-hidden>
                          /
                        </span>
                      </>
                    ) : null}
                    <span>{t(meta.labelKey)}</span>
                    {meta.advanced && <span className="os-set-adv-badge">Advanced</span>}
                  </p>
                  <h2 className="os-set-page-title">{t(meta.labelKey)}</h2>
                  {meta.descKey && <p className="os-set-page-intro muted">{t(meta.descKey)}</p>}
                </header>
              )}
              {page === 'home' && <SettingsHome />}
              {page === 'appearance' && <AppearancePage />}
              {page === 'wallpaper' && <WallpaperPage />}
              {page === 'atmosphere' && <AtmospherePage />}
              {page === 'companions' && <CompanionsPage />}
              {page === 'desktop-layout' && <DesktopLayoutPage />}
              {page === 'shortcuts' && <ShortcutsPage />}
              {page === 'mini' && <MiniModePage />}
              {page === 'lockscreen' && <LockscreenPage />}
              {page === 'study' && <StudyPage />}
              {page === 'profile-rules' && <ProfileRulesPage />}
              {page === 'reading' && <ReadingPage />}
              {page === 'transcription' && <TranscriptionPage />}
              {page === 'visualizer' && <VisualizerPage />}
              {page === 'special' && <SpecialPage />}
              {page === 'display' && <DisplayPage />}
              {page === 'motion' && <MotionPage />}
              {page === 'storage' && <StoragePage />}
              {page === 'memory' && <MemoryPage />}
            </div>
          </div>
        </div>
      </AppChrome>
    </SettingsProvider>
  );
}

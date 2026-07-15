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
import { loadWhisperDevice, setWhisperDevice, type WhisperDevice } from '../../whisperSettings';
import { loadLyricsSettings, onLyricsSettingsChanged, setUseAlbumInSearch } from '../../lyricsSettings';
import { applyTheme, loadThemeId } from '../../theme';
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
import AppearancePage from './pages/AppearancePage';
import WallpaperPage from './pages/WallpaperPage';
import AtmospherePage from './pages/AtmospherePage';
import CompanionsPage from './pages/CompanionsPage';
import DesktopLayoutPage from './pages/DesktopLayoutPage';
import ShortcutsPage from './pages/ShortcutsPage';
import StudyPage from './pages/StudyPage';
import ReadingPage from './pages/ReadingPage';
import TranscriptionPage from './pages/TranscriptionPage';
import StoragePage from './pages/StoragePage';
import VisualizerPage from './pages/VisualizerPage';
import DisplayPage from './pages/DisplayPage';
import MemoryPage from './pages/MemoryPage';

const MOTION_KEY = 'jp-os-reduce-motion';

function applyMotion(reduce: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

export default function SettingsApp(props: SettingsWallProps) {
  const { t } = useT();
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
  const [lyricsSettings, setLyricsSettings] = useState(loadLyricsSettings);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback((next: SettingsPageId, settingId?: string) => {
    setPage(next);
    pushRecentPage(next);
    setFocusSettingId(settingId ?? null);
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  useEffect(() => onZoomChanged(setZoomState), []);
  useEffect(() => onLyricsSettingsChanged(setLyricsSettings), []);
  useEffect(() => onPersonalizationChanged(setLook), []);
  useEffect(() => onDesktopPrefsChanged(setDeskPrefs), []);
  useEffect(() => onEnvironmentChanged(setEnv), []);
  useEffect(() => onCustomCssChanged(setUserCss), []);

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
      lyricsSettings,
      setLyricsAlbumSearch: (on) => setLyricsSettings(setUseAlbumInSearch(on)),
      userCss,
      setUserCss,
      cssMsg,
      setCssMsg,
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
      lyricsSettings,
      userCss,
      cssMsg,
    ],
  );

  const meta = pageMeta(page);
  const reduceMotion = typeof document !== 'undefined' && document.documentElement.classList.contains('reduce-motion');

  return (
    <SettingsProvider value={ctrl}>
      <div className="os-settings os-settings-v2">
        <div className="os-set-top">
          <SettingsSearch ref={searchRef} onNavigate={navigate} />
        </div>
        <div className="os-set-body">
          <SettingsNav page={page} onNavigate={(id) => navigate(id)} />
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
            {page === 'study' && <StudyPage />}
            {page === 'reading' && <ReadingPage />}
            {page === 'transcription' && <TranscriptionPage />}
            {page === 'visualizer' && <VisualizerPage />}
            {page === 'display' && <DisplayPage />}
            {page === 'storage' && <StoragePage />}
            {page === 'memory' && <MemoryPage />}
          </div>
        </div>
      </div>
    </SettingsProvider>
  );
}

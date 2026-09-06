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
import { ContextualSurface } from '../liquid/LiquidSurface';
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
import ScraperPage from './pages/ScraperPage';
import StoragePage from './pages/StoragePage';
import VisualizerPage from './pages/VisualizerPage';
import DisplayPage from './pages/DisplayPage';
import FileDropsPage from './pages/FileDropsPage';
import ApiKeysPage from './pages/ApiKeysPage';
import MotionPage from './pages/MotionPage';
import HelpPage from './pages/HelpPage';
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
import { getReduceMotion, setReduceMotion } from '../../displayPrefs';
import {
  AGENT_NAVIGATION_CHANNELS,
  type AgentSettingsNavigationDelivery,
} from '../../../shared/agentNavigationBridge';
import {
  AGENT_SETTINGS_ACK_BUDGET_MS,
  agentSettingsRenderedTarget,
  createAgentSettingsAckScheduler,
  focusAgentSettingsRenderedTarget,
  normalizeAgentSettingsNavigationLink,
} from './agentSettingsNavigation';
import { handOffToAgent, settingsRouteAgentContext } from '../../agentContextHandoff';
import {
  openFilesAppForMemory,
  openFilesAppForSystemCard,
} from '../filesapp/filesAppScope';

/**
 * Appearance is the heaviest Settings page: its isolated preview and complete theme grid mount
 * together. Let the destination header and navigation state paint first, then fill the page on
 * the following frame. This keeps the click acknowledgement immediate without removing or
 * simplifying any controls, and unmounting before that frame cancels the deferred work.
 */
function DeferredAppearancePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return ready ? <AppearancePage /> : null;
}

function applyMotion(reduce: boolean): void {
  document.documentElement.classList.toggle('reduce-motion', reduce);
}

export default function SettingsApp(props: SettingsWallProps) {
  const { t } = useT();
  const aero = useAeroMaterials();
  const [page, setPage] = useState<SettingsPageId>('home');
  const [focusSettingId, setFocusSettingId] = useState<string | null>(null);
  const [guidedPage, setGuidedPage] = useState<SettingsPageId | null>(null);
  // Kept beside `guidedPage` rather than read off `focusSettingId`, which the
  // highlight effect nulls after 2200 ms. The coordinate is what a hand-off back
  // to the Agent needs, and it stays true for as long as the user is still on
  // the page the Agent sent them to — not for 2.2 seconds.
  const [guidedControlId, setGuidedControlId] = useState<string | null>(null);
  const [look, setLook] = useState<OsPersonalization>(loadPersonalization);
  const [deskPrefs, setDeskPrefs] = useState<DesktopPrefs>(loadDesktopPrefs);
  const [env, setEnv] = useState<EnvironmentSettings>(loadEnvironment);
  const [userCss, setUserCss] = useState(loadCustomCss);
  const [cssMsg, setCssMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState(loadThemeId);
  const [zoom, setZoomState] = useState(loadZoom);
  const [reduce, setReduce] = useState(getReduceMotion);
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

  const navigate = useCallback((
    next: SettingsPageId,
    settingId?: string,
    options?: { guided?: boolean },
  ) => {
    /**
     * Gate 8 / decision 1. `memory` is no longer a Settings page: memory and
     * statistics moved to the Files app, which is now their only home.
     *
     * The redirect lives HERE rather than in the search box because four
     * callers reach this function — the search box, the nav rail, the agent's
     * guided navigation and the recent-pages list — and a redirect in one of
     * them would leave the other three dead-ending on a page that renders
     * nothing. The card id is carried across, so a hit for "factory reset"
     * lands on the factory-reset card rather than merely on the app.
     */
    if (next === 'memory') {
      if (!(settingId && openFilesAppForSystemCard(settingId))) openFilesAppForMemory();
      return;
    }
    /**
     * v1.0 audit 5.2. `monitors` merged INTO `display` — same reasoning as the
     * redirect above, and deliberately the same place: all four callers reach
     * this function, so redirecting anywhere else would leave three of them
     * dead-ending on a page that renders nothing.
     *
     * The id stays a real coordinate rather than being deleted, because a
     * stored recent-pages entry, a deep link or the agent's index may still
     * carry it. `settingId` is passed through untouched, so a hit for
     * "simulated displays" still lands on the `monitors-simulated` card, which
     * now lives further down the Display page.
     */
    const target: SettingsPageId = next === 'monitors' ? 'display' : next;
    // An explicit cross-surface route is allowed to land on an advanced page without
    // changing the user's global Advanced preference. Keep that destination guided until
    // they navigate away; otherwise the guard below immediately bounces a valid deep link
    // back Home and the originating control is functionally dead.
    setGuidedPage(options?.guided ? target : null);
    setGuidedControlId(options?.guided ? settingId ?? null : null);
    setPage(target);
    pushRecentPage(target);
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
      navigate(d.page, d.settingId, { guided: true });
    };
    window.addEventListener('settings:navigate', onNav);
    return () => window.removeEventListener('settings:navigate', onNav);
  }, [navigate]);

  // Main delivers only a destination it has freshly re-resolved from the
  // persisted action and live route context. Settings still validates the
  // shared static page/control registry and acknowledges only after the exact
  // page/control has rendered with its visible highlight.
  useEffect(() => {
    const scheduler = createAgentSettingsAckScheduler({
      visibility: () => document.visibilityState,
      requestFrame: (callback) => window.requestAnimationFrame(() => callback()),
      cancelFrame: (handle) => window.cancelAnimationFrame(handle),
      setTimer: (callback, ms) => window.setTimeout(callback, ms),
      clearTimer: (handle) => window.clearTimeout(handle),
    });
    // Main re-offers the same destination until it is acknowledged, so a later
    // delivery supersedes any attempt still looking for the previous one.
    let generation = 0;
    const onAgentNavigation = (event: Event): void => {
      const detail = (event as CustomEvent<AgentSettingsNavigationDelivery>).detail;
      if (!detail || typeof detail.handled !== 'function') return;
      detail.handled();
      const destination = normalizeAgentSettingsNavigationLink({
        section: detail.section,
        ...(detail.page ? { page: detail.page } : {}),
        ...(detail.controlId ? { controlId: detail.controlId } : {}),
        ...(detail.highlight === true ? { highlight: true } : {}),
      });
      if (
        !destination
        || !pageMeta(destination.page as SettingsPageId)
      ) {
        event.preventDefault();
        // A judgement about the destination, not about this moment: final.
        detail.reject('invalid');
        return;
      }

      const mine = ++generation;
      const nextPage = destination.page as SettingsPageId;
      setGuidedPage(nextPage);
      setGuidedControlId(destination.controlId ?? null);
      setPage(nextPage);
      pushRecentPage(nextPage);
      setFocusSettingId(destination.controlId ?? null);
      contentRef.current?.scrollTo({ top: 0 });

      const deadline = Date.now() + AGENT_SETTINGS_ACK_BUDGET_MS;
      const acknowledgeRenderedTarget = (): void => {
        if (mine !== generation) return;
        const rendered = agentSettingsRenderedTarget(contentRef.current, destination);
        if (!rendered) {
          if (Date.now() < deadline) scheduler.schedule(acknowledgeRenderedTarget);
          // Says nothing about the destination — this window just cannot answer
          // yet, and main is free to offer it again.
          else detail.reject('not-ready');
          return;
        }
        focusAgentSettingsRenderedTarget(rendered);
        detail.accept();
      };
      scheduler.schedule(acknowledgeRenderedTarget);
    };
    window.addEventListener(AGENT_NAVIGATION_CHANNELS.settingsDelivery, onAgentNavigation);
    return () => {
      window.removeEventListener(AGENT_NAVIGATION_CHANNELS.settingsDelivery, onAgentNavigation);
      scheduler.cancelAll();
    };
  }, []);

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
        setReduceMotion(next);
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
  /**
   * Hands the Agent the page the user is on — and the exact control, when the
   * Agent's own guided navigation put them here.
   *
   * The place *is* the material for this surface, so it goes in as the item
   * rather than as the decoration: there is nothing else the user is looking at.
   * Naming the control matters more than it looks — a route item carrying a
   * page/control coordinate is what authorizes a guided destination through the
   * provenance path, which was unreachable until a producer could emit one.
   */
  const askAgent = (): void => {
    // Only claim the control while the user is still on the page the Agent sent
    // them to. After they navigate away it is someone else's coordinate, and a
    // route item that names a control the user is not looking at would authorize
    // a destination they never agreed to.
    const controlId = guidedPage === page ? guidedControlId ?? undefined : undefined;
    void handOffToAgent(
      settingsRouteAgentContext(page, pageLabel, controlId),
      t('agent.conversation.fromSettings', { label: pageLabel }),
    );
  };

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
          // Gate 8: the destination is the Files app now, so this can never be
          // the page you are already on — `navigate` redirects it there.
          id: 'memory',
          label: 'Memory and storage',
          icon: <Icon name="folder" size={14} />,
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
    if (!advancedMode && meta?.advanced && page !== 'home' && guidedPage !== page) {
      navigate('home');
    }
  }, [advancedMode, meta?.advanced, page, guidedPage, navigate]);

  return (
    <SettingsProvider value={ctrl}>
      <AppChrome menus={settingsMenus} status={settingsStatus} className="aero-settings-chrome">
        <div className={`os-settings os-settings-v2${advancedMode ? ' is-advanced' : ''}${aero ? ' aero-settings' : ''}`}>
          <div className="os-set-top">
            <SettingsSearch ref={searchRef} onNavigate={navigate} />
            {/*
              Beside the search rather than in the command bar below: that bar is
              rendered only under `aero &&`, so a button placed there is missing
              from the ordinary Settings window — including every pop-out, which
              is the one the Agent itself opens.
            */}
            <Button
              className="os-set-ask-agent"
              leftIcon={<Icon name="sparkle" size={14} />}
              onClick={askAgent}
            >
              {t('settings.action.askAgent')}
            </Button>
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
              data-settings-page={page}
              tabIndex={-1}
              role="main"
              aria-label={meta ? t(meta.labelKey) : t('settings.appTitle')}
            >
              {page !== 'home' && meta && (
                <ContextualSurface as="header" className="os-set-page-head">
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
                </ContextualSurface>
              )}
              {page === 'home' && <SettingsHome />}
              {page === 'appearance' && <DeferredAppearancePage />}
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
              {page === 'scraper' && <ScraperPage />}
              {page === 'visualizer' && <VisualizerPage />}
              {page === 'special' && <SpecialPage />}
              {page === 'file-drops' && <FileDropsPage />}
              {page === 'api-keys' && <ApiKeysPage />}
              {page === 'display' && <DisplayPage />}
              {page === 'motion' && <MotionPage />}
              {page === 'storage' && <StoragePage />}
              {page === 'help' && <HelpPage />}
            </div>
          </div>
        </div>
      </AppChrome>
    </SettingsProvider>
  );
}

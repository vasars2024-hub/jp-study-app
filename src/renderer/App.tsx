import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import DesktopShell from './components/DesktopShell';
import BootScreen from './components/BootScreen';
import AppSection from './components/AppSection';
import CommandPalette from './components/CommandPalette';
import ClipboardHistoryPanel from './components/ClipboardHistoryPanel';
import FocusShell from './components/FocusShell';
import NovelReader from './views/NovelReader';
import MangaReader from './views/MangaReader';
import type { LibraryItem } from '../shared/types';
import type { DesktopWinSection } from '../shared/desktop';
import CompanionHostView from './environment/CompanionHostView';
import PerfOverlay from './components/PerfOverlay';
import SecretAeroTrigger from './theme/SecretAeroTrigger';
import {
  loadFocusMode,
  onFocusModeChanged,
  toggleFocusMode,
} from './focusMode';
import { loadMiniMode, onMiniModeChanged, type MiniModeSettings } from './miniMode';
import { applySettingsAdvancedClass } from './settingsAdvanced';
import MiniShell from './components/MiniShell';
import Lockscreen from './components/Lockscreen';
import { registerCommandHandler } from './keyboardShortcuts';
import { shouldShowLockscreen, consumePendingAeroBoot, AERO_ENTRY_LOCKED_EVENT } from './lockscreenSettings';
import { loadThemeId } from './theme/engine';
import { AERO_THEME_ID } from './theme/frutiger-aero';
import { bootPillarboxSettings } from './pillarboxSettings';
import { bootAeroEnvironmentIfNeeded } from './aeroEnvironment';

const AERO_VIEWPORT_WIDTH = 1280;
const AERO_VIEWPORT_HEIGHT = 960;
const STUDY_OS_REBOOT_EVENT = 'shell:studyOsReboot';

function AeroViewport({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const update = (): void => {
      const next = Math.min(
        stage.clientWidth / AERO_VIEWPORT_WIDTH,
        stage.clientHeight / AERO_VIEWPORT_HEIGHT,
      );
      setScale(Number.isFinite(next) && next > 0 ? next : 1);
    };

    update();
    const ro = 'ResizeObserver' in window ? new ResizeObserver(update) : null;
    ro?.observe(stage);
    window.addEventListener('resize', update);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const style = {
    '--os-viewport-scale': String(scale),
  } as CSSProperties;

  return (
    <div ref={stageRef} className="os-viewport-stage" style={style}>
      <div className="os-viewport-ambience" aria-hidden="true" />
      <div className="os-viewport-frame">{children}</div>
    </div>
  );
}

function ToastHost() {
  const [toasts, setToasts] = useState<{ id: number; message: string; kind: string }[]>([]);
  useEffect(() => {
    let n = 0;
    const onToast = (e: Event) => {
      const d = (e as CustomEvent<{ message?: string; kind?: string }>).detail;
      const message = d?.message?.trim();
      if (!message) return;
      const id = ++n;
      const kind = d?.kind ?? 'ok';
      setToasts((t) => [...t.slice(-4), { id, message, kind }]);
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 2800);
    };
    window.addEventListener('os:toast', onToast);
    return () => window.removeEventListener('os:toast', onToast);
  }, []);
  if (!toasts.length) return null;
  return (
    <div className="os-toast-host" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`os-toast ${t.kind}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Main window while Mini Widget is active — spawn/focus the floating widget. */
function MiniMainBridge() {
  useEffect(() => {
    if (!loadMiniMode().enabled) return;
    void window.api.miniOpen();
  }, []);
  return null;
}

// Sections that may be shown alone in a pop-out window. Mirrors POPOUT_SECTIONS
// in the main process (src/main.ts). `player`→Media and `city`→Noctis match the
// desktop's app labels.
const POPOUT_LABELS: Partial<Record<DesktopWinSection, string>> = {
  library: 'Library',
  novels: 'Novels',
  dictionary: 'Dictionary',
  grammar: 'Grammar',
  translate: 'Translate',
  player: 'Media',
  music: 'Music',
  musicwidget: '',
  anki: 'Anki',
  flashcards: 'Flashcards',
  stats: 'Statistics',
  resources: 'Resources',
  settings: 'Settings',
  city: 'Noctis',
  immersion: 'Immersion',
  calendar: 'Calendar',
};

// Read `?popout=<section>` off the URL of this window. Present only in the
// borderless second windows opened by createPopoutWindow (main process).
function popoutSection(): DesktopWinSection | null {
  const raw = new URLSearchParams(window.location.search).get('popout');
  return raw && raw in POPOUT_LABELS ? (raw as DesktopWinSection) : null;
}

function isCompanionHostWindow(): boolean {
  return new URLSearchParams(window.location.search).get('companionHost') === '1';
}

/** Dedicated borderless Mini Widget OS window (`?miniWidget=1`). */
function isMiniWidgetWindow(): boolean {
  return new URLSearchParams(window.location.search).get('miniWidget') === '1';
}

/** Dedicated borderless transparent lock widget (`?lockscreen=1`). */
function isLockscreenWindow(): boolean {
  return new URLSearchParams(window.location.search).get('lockscreen') === '1';
}

/** Main window spawns the floating lock widget while PIN is required. */
function LockscreenBridge({ onUnlocked }: { onUnlocked: () => void }) {
  useEffect(() => {
    void window.api.lockscreenOpen();
    const off = window.api.onLockscreenUnlocked(() => {
      markLockscreenUnlocked();
      onUnlocked();
    });
    return off;
  }, [onUnlocked]);
  return null;
}

// Study OS: the desktop shell is the whole app. Opening a book/manga takes over
// the window with the reader; closing it returns to the desktop. A pop-out
// window (?popout=…) instead shows just one app, full-window.
export default function App() {
  const [reading, setReading] = useState<LibraryItem | null>(null);
  const [focusMode, setFocusModeState] = useState(loadFocusMode);
  const [mini, setMini] = useState<MiniModeSettings>(() => loadMiniMode());
  const [locked, setLocked] = useState(() => shouldShowLockscreen());
  const [skipDefaultBoot] = useState(() => loadThemeId() === AERO_THEME_ID);
  const [studyBootNonce, setStudyBootNonce] = useState(0);
  const popout = popoutSection();

  const handleLockscreenUnlocked = useCallback(() => {
    setLocked(false);
    if (consumePendingAeroBoot()) {
      window.dispatchEvent(new CustomEvent('shell:softReboot'));
    }
  }, []);

  useEffect(() => onFocusModeChanged(setFocusModeState), []);
  useEffect(() => {
    const unsub = onMiniModeChanged((s) => {
      setMini(s);
    });
    return unsub;
  }, []);
  useEffect(() => {
    applySettingsAdvancedClass();
    bootPillarboxSettings();
    bootAeroEnvironmentIfNeeded(loadThemeId() === AERO_THEME_ID);
  }, []);

  useEffect(() => {
    const onStudyReboot = () => {
      try {
        sessionStorage.removeItem('jp-booted');
      } catch {
        /* storage unavailable */
      }
      setStudyBootNonce((n) => n + 1);
    };
    window.addEventListener(STUDY_OS_REBOOT_EVENT, onStudyReboot);
    return () => window.removeEventListener(STUDY_OS_REBOOT_EVENT, onStudyReboot);
  }, []);

  // Secret OS entry: show lockscreen immediately (boot splash runs after unlock).
  useEffect(() => {
    const onEntryLocked = () => setLocked(true);
    window.addEventListener(AERO_ENTRY_LOCKED_EVENT, onEntryLocked);
    return () => window.removeEventListener(AERO_ENTRY_LOCKED_EVENT, onEntryLocked);
  }, []);

  // Books handed off from the Mini Widget (too small for the reader).
  useEffect(() => {
    if (isMiniWidgetWindow()) return;
    try {
      const raw = sessionStorage.getItem('jp-mini-pending-book');
      if (!raw) return;
      sessionStorage.removeItem('jp-mini-pending-book');
      const item = JSON.parse(raw) as LibraryItem;
      if (item && typeof item.id === 'string') setReading(item);
    } catch {
      /* ignore */
    }
  }, []);

  // Global toggle — desktop and focus shell both honor this command
  useEffect(() => {
    return registerCommandHandler('study.focusMode', () => {
      toggleFocusMode();
      return false;
    });
  }, []);

  // Transparent OS overlay for desktop pets (L4) — skip chrome / boot entirely.
  if (isCompanionHostWindow()) {
    return <CompanionHostView />;
  }

  // Floating Mini Widget window — only the craft panel (transparent OS chrome).
  if (isMiniWidgetWindow()) {
    return (
      <>
        <MiniShell widgetMode />
        <ToastHost />
      </>
    );
  }

  // Floating lock widget — frameless transparent PIN panel only.
  if (isLockscreenWindow()) {
    return (
      <>
        <Lockscreen
          widgetMode
          onUnlocked={() => {
            void window.api.lockscreenUnlock();
          }}
        />
        <ToastHost />
      </>
    );
  }

  // PIN gate — main window stays hidden; the lock widget owns the OS chrome.
  // In Aero mode, show full-screen lock directly instead of spawning widget.
  if (locked && !popout) {
    const isAero = loadThemeId() === AERO_THEME_ID;
    if (isAero) {
      return (
        <>
          <Lockscreen onUnlocked={handleLockscreenUnlocked} />
          <ToastHost />
        </>
      );
    }
    return (
      <>
        <LockscreenBridge onUnlocked={handleLockscreenUnlocked} />
        <ToastHost />
      </>
    );
  }

  // Focus mode: no desktop / living layer / clipboard chrome
  if (focusMode && !popout) {
    return (
      <>
        <FocusShell
          initialBook={reading}
          onInitialBookConsumed={() => setReading(null)}
        />
        <ToastHost />
      </>
    );
  }

  // Main window: if Mini is enabled, spawn/focus the widget and stay hidden.
  // Do not paint MiniShell into the large desktop canvas.
  if (mini.enabled && !popout && !reading) {
    return (
      <>
        <MiniMainBridge />
        <ToastHost />
      </>
    );
  }

  if (reading) {
    const close = () => setReading(null);
    return (
      <>
        {reading.kind === 'book' ? (
          <NovelReader item={reading} onClose={close} />
        ) : (
          <MangaReader item={reading} onClose={close} />
        )}
        <CommandPalette />
        <ClipboardHistoryPanel />
        <ToastHost />
      </>
    );
  }

  if (popout) {
    // The OS window itself is borderless (frame: false), so we supply our own
    // thin drag strip + window buttons — the Noctis-style frameless look.
    const flush = popout === 'music' || popout === 'city' || popout === 'musicwidget' || popout === 'settings';
    return (
      <div className="popout-root">
        <PopoutChrome label={POPOUT_LABELS[popout] ?? popout} />
        <div className={`popout-body ${flush ? 'popout-body-flush' : ''}`}>
          <AppSection section={popout} onOpenBook={setReading} />
        </div>
        <CommandPalette />
        <ClipboardHistoryPanel />
        <ToastHost />
      </div>
    );
  }

  return (
    <>
      {!skipDefaultBoot && !locked && <BootScreen />}
      {studyBootNonce > 0 && <BootScreen key={`study-reboot-${studyBootNonce}`} />}
      <div className="desktop-root">
        <AeroViewport>
          <DesktopShell onOpenBook={setReading} />
        </AeroViewport>
      </div>
      <CommandPalette />
      <ClipboardHistoryPanel />
      <PerfOverlay />
      <SecretAeroTrigger />
      <ToastHost />
    </>
  );
}

// Chrome for a borderless pop-out window: a drag strip (the OS drag itself is
// done in CSS via -webkit-app-region: drag) and min/max/close buttons that drive
// this very window through the main process.
function PopoutChrome({ label }: { label: string }) {
  return (
    <div className="popout-bar">
      <div className={`popout-drag ${label ? '' : 'popout-drag-icon'}`}>
        {label}
      </div>
      <div className="popout-controls">
        <button className="popout-btn" title="Minimize" onClick={() => void window.api.popoutControl('minimize')}>
          ─
        </button>
        <button className="popout-btn" title="Maximize" onClick={() => void window.api.popoutControl('maximize')}>
          ▢
        </button>
        <button className="popout-btn popout-close" title="Close" onClick={() => void window.api.popoutControl('close')}>
          ×
        </button>
      </div>
    </div>
  );
}

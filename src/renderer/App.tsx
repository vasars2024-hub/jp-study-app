import { lazy, Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import DesktopShell from './components/DesktopShell';
import BootScreen from './components/BootScreen';
import ConsentScreen from './components/ConsentScreen';
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
  bootFocusModeIfNeeded,
  loadFocusMode,
  onFocusModeChanged,
  toggleFocusMode,
} from './focusMode';
import { loadMiniMode, onMiniModeChanged, type MiniModeSettings } from './miniMode';
import { applySettingsAdvancedClass } from './settingsAdvanced';
import MiniShell from './components/MiniShell';
import Lockscreen from './components/Lockscreen';
// Lazy since Blanc got its own entry point (BLANC_REFINEMENT_PLAN.md Pillar 1).
// The Blanc window now loads blanc.html, so this branch is only a fallback for
// index.html?blanc=1 — and importing it eagerly cost the Study OS window the
// entire ~1.5 MB Blanc chunk on every cold start.
const BlancShell = lazy(() => import('./components/blanc/BlancShell'));
const BlancLockscreen = lazy(() =>
  import('./components/blanc/BlancShell').then((m) => ({ default: m.BlancLockscreen })),
);
import ToastHost from './components/ToastHost';
import SeanimeDevPanel from './components/SeanimeDevPanel';
import MediaWorkspaceHost from '../media/MediaWorkspaceHost';
import GlobalDictionaryOverlay from './components/GlobalDictionaryOverlay';
import { registerCommandHandler } from './keyboardShortcuts';
import { addDeckCards } from './flashcardDeck';
import { recordClipboardEntry, loadClipboardHistory, type ClipboardEntryType } from './clipboardHistory';
import { getLevel, setLevel, type WkLevel } from './knownWords';
import { estimateLevelFromText } from './bookLevelEstimate';
import { getStudyLang } from './studyEnvironment';
import { compactLevelBadge, resolvePageLevelLang } from '../shared/pageLevelDetect';
import { handleExtensionUiOpen } from './extensionBridgeUi';
import { appendNotebookEvent } from './notebookTimeline';
import { appendTranslationHistory } from './translationHistory';
import { scoreTextComprehensibility, knownPercent } from './comprehensibility';
import { matchGrammarPatterns } from './grammarMatch';
import {
  shouldShowLockscreen,
  consumePendingAeroBoot,
  consumePendingWiredBoot,
  markLockscreenUnlocked,
  AERO_ENTRY_LOCKED_EVENT,
} from './lockscreenSettings';
import { loadThemeId } from './theme/engine';
import { AERO_THEME_ID } from './theme/frutiger-aero';
import { WIRED_ARCHIVE_THEME_ID } from './theme/wired-archive';
import { bootPillarboxSettings } from './pillarboxSettings';
import { bootAeroEnvironmentIfNeeded, installAeroEnvironmentBridge } from './aeroEnvironment';
import MainWindowChrome from './components/shell/MainWindowChrome';
import { useWindowChromeMode } from './windowChrome';
import { requestWiredArchiveEntryBoot } from './wiredArchiveLifecycle';
import { isBlancWindow, loadBlancMode, onBlancModeChanged, type BlancModeSettings } from './blancMode';

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

/** Main window while Mini Widget is active — spawn/focus the floating widget. */
function MiniMainBridge() {
  useEffect(() => {
    if (!loadMiniMode().enabled) return;
    void window.api.miniOpen();
  }, []);
  // Fallback canvas if the floating widget fails to open — avoids a blank main window.
  return <MiniShell />;
}

// Sections that may be shown alone in a pop-out window. Mirrors POPOUT_SECTIONS
// in the main process (src/main.ts). `player`→Media and `city`→Noctis match the
// desktop's app labels.
const POPOUT_LABELS: Partial<Record<DesktopWinSection, string>> = {
  library: 'Library',
  novels: 'Novels',
  reading: 'Reading Finder',
  dictionary: 'Dictionary',
  grammar: 'Grammar',
  notebook: 'Notebook',
  translate: 'Translate',
  player: 'Media',
  video: 'Video',
  music: 'Music',
  musicwidget: '',
  anki: 'Anki',
  flashcards: 'Flashcards',
  games: 'Game Arena',
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

// Study OS: the desktop shell is the whole app. Opening a book/manga takes over
// the window with the reader; closing it returns to the desktop. A pop-out
// window (?popout=…) instead shows just one app, full-window.
export default function App() {
  const [reading, setReading] = useState<LibraryItem | null>(null);
  const [focusMode, setFocusModeState] = useState(loadFocusMode);
  const [mini, setMini] = useState<MiniModeSettings>(() => loadMiniMode());
  const [blanc, setBlanc] = useState<BlancModeSettings>(() => loadBlancMode());
  const [locked, setLocked] = useState(() => shouldShowLockscreen());
  const chromeMode = useWindowChromeMode();
  const [skipDefaultBoot] = useState(() => {
    const theme = loadThemeId();
    return theme === AERO_THEME_ID || theme === WIRED_ARCHIVE_THEME_ID;
  });
  const [studyBootNonce, setStudyBootNonce] = useState(0);
  const popout = popoutSection();
  const showMainChrome =
    chromeMode === 'borderless' &&
    !locked &&
    !popout &&
    !isMiniWidgetWindow() &&
    !isLockscreenWindow() &&
    !isBlancWindow() &&
    !isCompanionHostWindow();

  const handleLockscreenUnlocked = useCallback(() => {
    markLockscreenUnlocked();
    const pendingAeroBoot = consumePendingAeroBoot();
    const pendingWiredBoot = consumePendingWiredBoot();
    // Lockscreen replaces the boot splash on cold launch — don't replay it on unlock.
    if (!pendingAeroBoot && !pendingWiredBoot) {
      try {
        sessionStorage.setItem('jp-booted', '1');
      } catch {
        /* ignore */
      }
    }
    setLocked(false);
    // Ensure the main window is visible if a prior floating lock widget hid it.
    void window.api.lockscreenUnlock();
    if (pendingAeroBoot) {
      window.dispatchEvent(new CustomEvent('shell:softReboot'));
    } else if (pendingWiredBoot) {
      requestWiredArchiveEntryBoot();
    }
  }, []);

  useEffect(() => onFocusModeChanged(setFocusModeState), []);
  useEffect(() => onBlancModeChanged(setBlanc), []);
  useEffect(() => {
    if (!blanc.enabled || popout || isBlancWindow()) return;
    void window.api.blancOpen({ width: 560, height: 460 });
  }, [blanc.enabled, popout]);
  useEffect(() => {
    if (locked) return;
    bootFocusModeIfNeeded();
    setFocusModeState(loadFocusMode());
  }, [locked]);
  useEffect(() => {
    const unsub = onMiniModeChanged((s) => {
      setMini(s);
    });
    return unsub;
  }, []);
  useEffect(() => {
    applySettingsAdvancedClass();
    bootPillarboxSettings();
    installAeroEnvironmentBridge();
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

  // Chrome extension selection mining → local flashcard collection (Phase 9).
  useEffect(() => {
    return window.api.onExtensionMined((payload) => {
      const text = (payload.text || '').trim();
      const term =
        (payload.term || '').trim() ||
        text
          .split(/[\s。．！？!?]+/)
          .find((s) => s.trim().length > 0)
          ?.trim()
          .slice(0, 40) ||
        text.slice(0, 40);
      if (!term) return;
      const mode =
        payload.mode === 'word' || payload.mode === 'sentence'
          ? payload.mode
          : text.length > 40 || /[。．！？!?]/.test(text)
            ? 'sentence'
            : 'word';
      const folder =
        typeof payload.folder === 'string' && payload.folder.trim()
          ? payload.folder.trim().slice(0, 40)
          : 'Extension';
      addDeckCards([
        {
          word: term.slice(0, 80),
          reading: '',
          meaning: '',
          sentence: mode === 'sentence' ? (payload.sentence || text).slice(0, 2000) : undefined,
          source: 'extension',
          folder,
          audioDataUrl:
            typeof payload.audioDataUrl === 'string' && payload.audioDataUrl.startsWith('data:')
              ? payload.audioDataUrl
              : undefined,
        },
      ]);
      const isAudio = folder === 'audio' || !!payload.audioDataUrl;
      appendNotebookEvent({
        stream: isAudio ? 'audio' : folder.toLowerCase().includes('ocr') ? 'ocr' : 'extension',
        title: term.slice(0, 80),
        detail: mode === 'sentence' ? (payload.sentence || text).slice(0, 400) : undefined,
        folder: isAudio ? 'Audio' : folder.toLowerCase().includes('ocr') ? 'OCR' : 'Mined',
        origin: 'extension',
        href: 'flashcards',
      });
    });
  }, []);

  // Extension audio → Whisper (installed model in renderer worker).
  useEffect(() => {
    return window.api.onExtensionTranscribeRequest(({ id, pcmBase64 }) => {
      void (async () => {
        try {
          const raw = atob(pcmBase64);
          const bytes = new Uint8Array(raw.length);
          for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
          const audio = new Float32Array(bytes.buffer);
          if (!audio.length) {
            window.api.replyExtensionTranscribe(id, { ok: false, error: 'Empty audio PCM' });
            return;
          }
          const { loadWhisperDevice, loadWhisperModelTier, whisperHfId } = await import('./whisperSettings');
          const { getStudyLang } = await import('./studyEnvironment');
          const studyLang = getStudyLang() === 'zh' ? 'zh' : 'ja';
          const worker = new Worker(new URL('./whisperWorker.ts', import.meta.url), { type: 'module' });
          const chunks: string[] = [];
          const finish = (ok: boolean, text?: string, error?: string): void => {
            worker.terminate();
            window.api.replyExtensionTranscribe(id, ok ? { ok: true, text: text || '' } : { ok: false, error: error || 'Transcription failed' });
          };
          worker.onmessage = (ev: MessageEvent) => {
            const m = ev.data as { type?: string; cues?: Array<{ text?: string }>; message?: string };
            if (m.type === 'partial' && Array.isArray(m.cues)) {
              for (const c of m.cues) {
                if (c?.text?.trim()) chunks.push(c.text.trim());
              }
            } else if (m.type === 'done') {
              finish(true, chunks.join(' ').trim());
            } else if (m.type === 'error') {
              finish(false, undefined, m.message || 'Whisper error');
            }
          };
          worker.onerror = (err) => finish(false, undefined, err.message || 'Whisper worker failed');
          worker.postMessage(
            {
              audio,
              model: whisperHfId(loadWhisperModelTier(studyLang)),
              prefer: loadWhisperDevice(),
              lang: studyLang,
            },
            [audio.buffer],
          );
        } catch (err) {
          window.api.replyExtensionTranscribe(id, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    });
  }, []);

  // Extension → app clipboard history
  useEffect(() => {
    return window.api.onExtensionClipboardAppend((payload) => {
      const text = (payload.text || '').trim();
      if (!text) return;
      const rawType = payload.type;
      const type: ClipboardEntryType =
        rawType === 'word' ||
        rawType === 'sentence' ||
        rawType === 'paragraph' ||
        rawType === 'dictionary' ||
        rawType === 'reader' ||
        rawType === 'manual' ||
        rawType === 'text'
          ? rawType
          : 'text';
      recordClipboardEntry(text, {
        type,
        readerMeta: payload.title || payload.url
          ? { book: payload.title || 'Web', chapter: payload.url }
          : undefined,
      });
    });
  }, []);

  // Extension deep-links (options / popup "Open in JP Study")
  useEffect(() => {
    return window.api.onExtensionUiOpen((payload) => {
      handleExtensionUiOpen(payload?.target || '', payload);
    });
  }, []);

  // Extension learning-tint: reply with known-word levels
  useEffect(() => {
    return window.api.onKnownLevelsRequest(({ id, terms }) => {
      const levels: Record<string, number> = {};
      for (const term of terms || []) {
        if (typeof term === 'string' && term) levels[term] = getLevel(term);
      }
      window.api.replyKnownLevels(id, levels);
    });
  }, []);

  useEffect(() => {
    return window.api.onKnownLevelSet(({ id, term, level }) => {
      try {
        const lv = ([0, 1, 2, 3].includes(level) ? level : 0) as WkLevel;
        setLevel(String(term || '').trim(), lv, true);
        window.api.replyKnownLevelSet(id, { ok: true });
      } catch (err) {
        window.api.replyKnownLevelSet(id, {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }, []);

  useEffect(() => {
    return window.api.onComprehensibilityRequest(({ id, text }) => {
      void (async () => {
        try {
          const score = await scoreTextComprehensibility(text || '');
          window.api.replyComprehensibility(id, {
            ok: true,
            percent: knownPercent(score),
            known: score.knownWords,
            total: score.totalWords,
          });
        } catch (err) {
          window.api.replyComprehensibility(id, {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    });
  }, []);

  useEffect(() => {
    return window.api.onGrammarMatchRequest(({ id, text }) => {
      try {
        const matches = matchGrammarPatterns(text || '', 8);
        window.api.replyGrammarMatch(id, { ok: true, matches });
      } catch (err) {
        window.api.replyGrammarMatch(id, {
          ok: false,
          matches: [],
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }, []);

  useEffect(() => {
    return window.api.onExtensionTranslationResult((payload) => {
      if (!payload?.sourceText || !payload?.resultText) return;
      appendTranslationHistory({
        sourceLang: payload.sourceLang || 'ja',
        targetLang: payload.targetLang || 'en',
        sourceText: payload.sourceText,
        resultText: payload.resultText,
        origin: 'extension',
      });
      appendNotebookEvent({
        stream: 'translations',
        title: payload.sourceText.slice(0, 80),
        detail: payload.resultText.slice(0, 120),
        folder: 'Translations',
        origin: 'extension',
        href: 'translate',
      });
    });
  }, []);

  // Extension page-level badge: JLPT/HSK from Settings vocab bands (same as EPUB covers)
  useEffect(() => {
    return window.api.onLevelEstimateRequest(({ id, text }) => {
      void (async () => {
        try {
          const studyLang = getStudyLang();
          const lang = resolvePageLevelLang(text || '', studyLang);
          if (!lang) {
            window.api.replyLevelEstimate(id, {
              ok: true,
              badge: 'X',
              empty: true,
              lang: null,
              scheme: null,
            });
            return;
          }
          const estimate = await estimateLevelFromText(text || '', lang);
          if (!estimate) {
            window.api.replyLevelEstimate(id, {
              ok: true,
              badge: '—',
              noLists: true,
              lang,
              scheme: lang === 'zh' ? 'hsk' : 'jlpt',
            });
            return;
          }
          const badge = compactLevelBadge(estimate.label);
          window.api.replyLevelEstimate(id, {
            ok: true,
            badge: badge || '—',
            lang,
            scheme: estimate.scheme,
            label: estimate.label,
            confidence: estimate.confidence,
          });
        } catch (err) {
          window.api.replyLevelEstimate(id, {
            ok: false,
            badge: '—',
            error: err instanceof Error ? err.message : String(err),
          });
        }
      })();
    });
  }, []);

  // Extension clipboard history list
  useEffect(() => {
    return window.api.onClipboardListRequest(({ id }) => {
      const entries = loadClipboardHistory()
        .slice(0, 40)
        .map((e) => ({
          id: e.id,
          type: e.type,
          text: e.text.slice(0, 500),
          createdAt: e.createdAt,
        }));
      window.api.replyClipboardList(id, entries);
    });
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

  if (isBlancWindow()) {
    return (
      <>
        <Suspense fallback={<div className="blanc-loading">Loading...</div>}>
          {locked ? (
            <BlancLockscreen onUnlocked={handleLockscreenUnlocked} />
          ) : (
            <BlancShell
              initialBook={reading}
              onInitialBookConsumed={() => setReading(null)}
            />
          )}
        </Suspense>
        <GlobalDictionaryOverlay />
        <ToastHost />
      </>
    );
  }

  // PIN gate — full-screen lock UI over a pre-mounted desktop so the unlock
  // fade never reveals an empty black canvas behind it.
  if (locked && !popout) {
    return (
      <>
        <div className="desktop-root desktop-root--lock-prewarm" inert aria-hidden="true">
          <AeroViewport>
            <DesktopShell onOpenBook={setReading} />
          </AeroViewport>
        </div>
        <Lockscreen onUnlocked={handleLockscreenUnlocked} />
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
        <GlobalDictionaryOverlay />
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
        <GlobalDictionaryOverlay />
        <ToastHost />
      </>
    );
  }

  if (popout) {
    // The OS window itself is borderless (frame: false), so we supply our own
    // thin drag strip + window buttons — the Noctis-style frameless look.
    const flush = popout === 'music' || popout === 'city' || popout === 'musicwidget' || popout === 'settings' || popout === 'games';
    return (
      <div className="popout-root">
        <PopoutChrome label={POPOUT_LABELS[popout] ?? popout} />
        <div className={`popout-body ${flush ? 'popout-body-flush' : ''}`}>
          <AppSection section={popout} onOpenBook={setReading} />
        </div>
        <CommandPalette />
        <ClipboardHistoryPanel />
        <GlobalDictionaryOverlay />
        <ToastHost />
      </div>
    );
  }

  return (
    <>
      {showMainChrome && <MainWindowChrome />}
      {!skipDefaultBoot && !locked && <BootScreen />}
      {studyBootNonce > 0 && <BootScreen key={`study-reboot-${studyBootNonce}`} />}
      {!locked && <ConsentScreen />}
      <div className="desktop-root">
        <AeroViewport>
          <DesktopShell onOpenBook={setReading} />
        </AeroViewport>
      </div>
      <CommandPalette />
      <ClipboardHistoryPanel />
      <PerfOverlay />
      <SecretAeroTrigger />
      <GlobalDictionaryOverlay />
      <ToastHost />
      {/* Phase-1 Seanime proof. Self-hides unless the sidecar flag is armed. */}
      <SeanimeDevPanel />
      {/* Phase-2 MEDIA workspace (adopted library/lists). Same self-hiding rule. */}
      <MediaWorkspaceHost />
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

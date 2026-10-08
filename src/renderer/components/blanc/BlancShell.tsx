import { Activity, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LibraryItem } from '../../../shared/types';
import {
  BLANC_TRIM_EVENT,
  FlowStatusChip,
  InboxChip,
  RamChip,
  captureToInbox,
  useBlancMechSettings,
  useBlancMechanicsHotkeys,
  useWarmTools,
} from './BlancMechanicsChrome';
import { leaveToolbox, toolboxUnmounted, touchWarmTool, unloadWarmTool } from './blancWarmTools';
import { saveBlancMechSettings } from './blancMechSettings';
import {
  BLANC_OPEN_FLOW_EVENT,
  BLANC_OPEN_INBOX_EVENT,
  BLANC_QUICK_NOTES_EVENT,
} from './blancMechBus';
import { detectCaptureKind } from './blancCaptureInbox';
import type { BlancVerbId } from './blancVerbs';
import type { CollectedToolsStore } from '../../../shared/collectedTools';
import {
  BLANC_TABS,
  type BlancTabId,
} from '../../../shared/blancMode';
import { AUTOMATION_BUILDER } from '../../../shared/automationBuilder';
import { getToolboxModule, listToolboxModules, type ToolboxModuleId } from '../../../shared/toolboxRegistry';
import type { BlancOnlyToolId } from '../../../shared/blancTools';
import type { AppMemoryReport, AppProcessMemory, AppProcessRole } from '../../../shared/appMemory';
import { isRegistryGovernedTool, isToolLaunchable, mergeFavoriteTools } from './blancToolVisibility';
import { isDeveloperOnlyTool, useBlancDeveloperTools } from './blancDeveloperTools';
import { blancToolLabel, blancToolLabelKey } from './blancToolLabels';
import { markSectionOpenHandled } from '../../sectionSurface';
import { ensureStudyOsCompat, studyOsCompatLoaded } from '../../blancStudyOsCompat';
import { BlancToolErrorBoundary } from './BlancToolErrorBoundary';
import {
  focusTimerActive,
  focusTimerSeconds,
  getFocusTimer,
  pauseFocusTimer,
  recordFocusTimerLap,
  resetFocusTimer,
  setFocusTimerFinishHandler,
  setFocusTimerMinutes,
  setFocusTimerMode,
  setFocusTimerNotify,
  subscribeFocusTimer,
  toggleFocusTimer,
  type FocusTimerState,
} from './blancFocusTimer';
import {
  TOOLBOX_UNITS,
  calculateToolboxExpression,
  convertToolboxUnit,
  formatToolboxNumber,
  type ToolboxUnit,
} from '../../../shared/toolboxUtilities';
import type { ToolboxFileSearchResult } from '../../../shared/toolboxFileSearch';
import { LANG_LABELS, LANG_TAGS, UI_LANGS, type UiLang } from '../../../shared/i18n/core';
import Icon, { type IconName } from '../Icons';
import VirtualList from '../VirtualList';
import { retryableLazy } from '../../retryableLazy';
import { useVisibleInterval } from '../../useVisibleInterval';
import { writeLocalStorage } from '../../localStorageWrite';
import FocusMusicBar from '../FocusMusicBar';
import ClipboardHistoryPanel from '../ClipboardHistoryPanel';
import BlancMasterSearch, { searchBlancMasterIndex } from './BlancMasterSearch';
import {
  blancMasterSettings,
  requestBlancDictionaryQuery,
  requestBlancTranslate,
  appDrawerMasterContent,
  blancMasterSourceLabels,
  deckCardMasterContent,
  dictionaryEntryMasterContent,
  grammarPointMasterContent,
  libraryItemMasterContent,
  savedWordMasterContent,
} from './blancMasterSources';
import {
  loadBlancMode,
  loadBlancMemory,
  onBlancModeChanged,
  onBlancMemoryChanged,
  resetBlancMemory,
  saveBlancMemory,
  setBlancAdvanced,
  setBlancDarkMode,
  setBlancLastTab,
  setBlancModeEnabled,
  type BlancMemorySettings,
  type BlancModeSettings,
} from '../../blancMode';
import { getUiLang, setUiLang, t as translate, useT } from '../../i18n';
import { commandLabel, commandNote } from '../../commandI18n';
import {
  exportCurrentToolboxSettings,
  importCurrentToolboxSettings,
  loadToolboxSettings,
  onToolboxSettingsChanged,
  resetAllToolboxSettings,
  resetToolboxSettingsCategory,
  saveToolboxSettings,
} from '../../toolboxSettings';
import { applyBlancTheme } from '../../blancThemeApply';
import { applyBlancCustomCss } from '../../blancCustomCssApply';
import { loadBlancThemeHistory, recordBlancThemeHistory, undoBlancThemeHistory } from '../../blancThemeHistoryStore';
import { MAX_CUSTOM_CSS_LENGTH } from '../../../shared/blancCustomCss';
import {
  BLANC_THEME_PRESETS,
  BLANC_THEME_TOKENS,
  exportTheme,
  isSafeThemeColor,
  parseThemeExport,
  presetById,
} from '../../../shared/blancTheme';
import {
  moveToolInOrder,
  orderToolIds,
  type ToolboxSettings,
  type ToolboxSettingsCategory,
} from '../../../shared/toolboxSettings';
import {
  TOOLBOX_SHORTCUT_COMMANDS,
  generateToolboxShortcutMarkdown,
  validateToolboxShortcutRegistry,
} from '../../../shared/toolboxShortcuts';
import {
  chordFromEvent,
  formatKeysDisplay,
  getBindings,
  onShortcutsChanged,
  registerCommandHandler,
  resetBinding,
  runCommand,
  setBinding,
  type BindingRow,
} from '../../keyboardShortcuts';
import { clearLockscreenPin, hasLockscreenPin, loadLockscreen, saveLockscreen, setLockscreenPin } from '../../lockscreenSettings';
import { getActiveProfile } from '../../profileState';
import { loadSaved, type SavedWord } from '../../savedWords';
import { loadLookupHistory, type LookupHistoryEntry } from '../../lookupHistory';
import { getStudyLang, setStudyLang } from '../../studyEnvironment';
import { normalizeStudyLang, studyLangOfText } from '../../../shared/studyLang';
import type { NormalizedGrammarPoint } from '../../data/grammar';
import {
  addDeckCards,
  loadDeck,
  onDeckChanged,
  removeDeckCard,
  updateDeckCard,
  type DeckFlashcard,
} from '../../flashcardDeck';
import { ProfileSwitcher } from '../ProfileSwitcher';
import { BlancStudySettings } from './BlancStudySettings';

// Every BlancReadyToolPanels export is lazy. That module reaches the agent tool
// registry, and through it `mediaStudyOrchestrator` and the whole grammar data
// set (~2 MB built) — a static import here put all of it, plus the Study OS
// stylesheet it pulls, into Blanc's startup. `blancBootGraph.test.ts` guards it.
const readyPanels = () => import('./BlancReadyToolPanels');
const BatchConverterPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.BatchConverterPanel })));
const BlancModelsPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.BlancModelsPanel })));
const BlancYoutubePanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.BlancYoutubePanel })));
const RecorderLauncherPanel = retryableLazy(() => import('../../recorder/RecorderLauncherPanel'));
const DifficultyAnalyzerPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.DifficultyAnalyzerPanel })));
const FrequencyExplorerPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.FrequencyExplorerPanel })));
const ImmersionTrackerPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.ImmersionTrackerPanel })));
const KanjiInspectorPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.KanjiInspectorPanel })));
const LocalAgentPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.LocalAgentPanel })));
const NotificationCenterPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.NotificationCenterPanel })));
const SubtitleImporterPanel = retryableLazy(() => readyPanels().then((m) => ({ default: m.SubtitleImporterPanel })));

// Pillar 1: these five were static imports, so the Blanc window paid for both
// readers and both mining panels before it painted. Every heavy view is lazy now.
const MangaReader = retryableLazy(withStudyOsCompat(() => import('../../views/MangaReader')));
const NovelReader = retryableLazy(withStudyOsCompat(() => import('../../views/NovelReader')));
const EpubMiningPanel = retryableLazy(withStudyOsCompat(() => import('../EpubMiningPanel')));
const EpubMiningSimplePanel = retryableLazy(withStudyOsCompat(() => import('../EpubMiningSimplePanel')));

/**
 * A lazy loader for a panel that renders Study OS class names. The Study OS
 * class-name sheet (`studyos-compat.css`, ~500 KB) is fetched alongside the
 * panel's chunk and the panel renders only once both are in, so it never
 * paints unstyled and a Blanc session that opens only Blanc-native tools never
 * fetches the sheet. Panels that render only `blanc-*` classes do not use this.
 */
function withStudyOsCompat<T>(load: () => Promise<T>): () => Promise<T> {
  return () => Promise.all([load(), ensureStudyOsCompat()]).then(([module]) => module);
}

// One module per panel (each lazy chunk carries only its own content stack).
// Pillar 0: Blanc-native panels composing shared `*Content` components, never
// Study OS `*View`s.
const BlancMediaPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancMediaPanels').then((m) => ({ default: m.BlancMediaPanel })),
));
const BlancFlashcardsPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancFlashcardsPanel').then((m) => ({ default: m.BlancFlashcardsPanel })),
));
const BlancStatisticsPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancStatisticsPanel').then((m) => ({ default: m.BlancStatisticsPanel })),
));
const BlancAnkiPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancAnkiPanel').then((m) => ({ default: m.BlancAnkiPanel })),
));
const BlancNotebookPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancNotebookPanel').then((m) => ({ default: m.BlancNotebookPanel })),
));
const BlancTranslatePanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancTranslatePanel').then((m) => ({ default: m.BlancTranslatePanel })),
));
const BlancMusicPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancMusicPanel').then((m) => ({ default: m.BlancMusicPanel })),
));
const BlancDictionaryPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancDictionaryPanels').then((m) => ({ default: m.BlancDictionaryPanel })),
));
const BlancGrammarPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancGrammarPanel').then((m) => ({ default: m.BlancGrammarPanel })),
));
const BlancClipboardPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancDictionaryPanels').then((m) => ({ default: m.BlancClipboardPanel })),
));
const BlancResourcesPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancResourcesPanel').then((m) => ({ default: m.BlancResourcesPanel })),
));
const BlancCalendarPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancCalendarPanel').then((m) => ({ default: m.BlancCalendarPanel })),
));
const BlancReadingFinderPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancReadingFinderPanel').then((m) => ({ default: m.BlancReadingFinderPanel })),
));

const BlancNovelsPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancNovelsPanel').then((m) => ({ default: m.BlancNovelsPanel })),
));
const BlancFilesPanel = retryableLazy(() =>
  import('./BlancFilesPanel').then((m) => ({ default: m.BlancFilesPanel })),
);
const BlancCentralAgentPanel = retryableLazy(() =>
  import('./BlancCentralAgentPanel').then((m) => ({ default: m.BlancCentralAgentPanel })),
);
const BlancDiscoverPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancDiscoverPanel').then((m) => ({ default: m.BlancDiscoverPanel })),
));
const BlancGamesPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancGamesPanel').then((m) => ({ default: m.BlancGamesPanel })),
));
const BlancImmersionPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancImmersionPanel').then((m) => ({ default: m.BlancImmersionPanel })),
));
const BlancVisualizerPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancVisualizerPanel').then((m) => ({ default: m.BlancVisualizerPanel })),
));
const BlancVisualNovelsPanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancVisualNovelsPanel').then((m) => ({ default: m.BlancVisualNovelsPanel })),
));

// Study-native toolbox track — see BlancStudyNativePanels.tsx.
const BlancFuriganaPanel = retryableLazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancFuriganaPanel })),
);
const BlancCounterPanel = retryableLazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancCounterPanel })),
);
const BlancConjugationPanel = retryableLazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancConjugationPanel })),
);
const BlancForecastPanel = retryableLazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancForecastPanel })),
);
const BlancPitchPanel = retryableLazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancPitchPanel })),
);
const BlancConsolePanel = retryableLazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancConsolePanel })),
);
// Its cue lines are the shared `SubtitleCueLine`, styled by the Study OS sheet.
const BlancAudioMinePanel = retryableLazy(withStudyOsCompat(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancAudioMinePanel })),
));

// Pillar 3 — App Drawer. Supersedes workspace-launcher (retired below).
const BlancAppDrawerPanel = retryableLazy(() => import('./BlancAppDrawerPanel'));

// Blanc mechanics overlays: lazy, so a session that never runs a Flow or opens
// the inbox never pays for them (blancBootGraph.test.ts).
const BlancFlowRunner = retryableLazy(() => import('./BlancFlowRunner'));
const BlancCaptureInboxDialog = retryableLazy(() => import('./BlancCaptureInboxPanel'));
const BlancMechanicsSettings = retryableLazy(() =>
  import('./BlancMechanicsSettings').then((m) => ({ default: m.BlancMechanicsSettings })),
);

// Labels are catalog KEYS, resolved with t() at render (module-level tables
// cannot call useT()).
const TAB_META: Record<BlancTabId, { labelKey: string; icon: IconName }> = {
  read: { labelKey: 'blanc.shell.tab.read', icon: 'library' },
  mine: { labelKey: 'blanc.shell.tab.mine', icon: 'scan' },
  deck: { labelKey: 'blanc.shell.tab.deck', icon: 'anki' },
  flashcards: { labelKey: 'blanc.shell.tab.cards', icon: 'flashcards' },
  media: { labelKey: 'blanc.shell.tab.media', icon: 'player' },
  stats: { labelKey: 'blanc.shell.tab.stats', icon: 'stats' },
  tools: { labelKey: 'blanc.shell.tab.toolbox', icon: 'wrench' },
  settings: { labelKey: 'blanc.shell.tab.settings', icon: 'settings' },
};

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

export default function BlancShell({
  initialBook,
  onInitialBookConsumed,
}: {
  initialBook: LibraryItem | null;
  onInitialBookConsumed: () => void;
}) {
  const { t, lang } = useT();
  const blancTools = useBlancTools();
  const [settings, setSettings] = useState<BlancModeSettings>(() => loadBlancMode());
  const [memory, setMemory] = useState<BlancMemorySettings>(() => loadBlancMemory());
  const [workspaceFull, setWorkspaceFull] = useState(false);
  const [taskbarHidden, setTaskbarHidden] = useState(false);
  const [compactToolsOpen, setCompactToolsOpen] = useState(false);
  const deferredNavFrame = useRef<number | null>(null);
  const [tab, setTab] = useState<BlancTabId>(() => {
    const savedMemory = loadBlancMemory();
    return savedMemory.rememberLastTab ? loadBlancMode().lastTab : 'read';
  });
  const [book, setBook] = useState<LibraryItem | null>(initialBook);
  const [masterSearchOpen, setMasterSearchOpen] = useState(false);
  const [masterDrawer, setMasterDrawer] = useState<CollectedToolsStore>(() => ({
    version: 1,
    tools: [],
    folders: [],
  }));
  const [masterSavedWords, setMasterSavedWords] = useState<SavedWord[]>([]);
  const [masterDeckCards, setMasterDeckCards] = useState<DeckFlashcard[]>([]);
  const [masterDictionaryEntries, setMasterDictionaryEntries] = useState<LookupHistoryEntry[]>([]);
  const [masterGrammarPoints, setMasterGrammarPoints] = useState<NormalizedGrammarPoint[]>([]);
  const [masterLibraryItems, setMasterLibraryItems] = useState<LibraryItem[]>([]);
  const [masterDeckRequest, setMasterDeckRequest] = useState<{ query: string; key: number } | null>(null);
  const [masterGrammarRequest, setMasterGrammarRequest] = useState<{ id: string; key: number } | null>(null);
  // Which tool an out-of-toolbox deep link asked for. `key` is what re-triggers
  // it, so asking for the same tool twice still reopens it.
  const [toolRequest, setToolRequest] = useState<{ id: BlancToolId; key: number } | null>(null);
  // Blanc mechanics: the Flow run and the Capture inbox are overlays (lazy
  // chunks); the warm-tool budget decides whether the toolbox stays mounted.
  const [flowOpen, setFlowOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(false);
  const warmTools = useWarmTools();
  const clock = useMinuteClock();
  const masterCommandShortcuts = useMemo(
    () => new Map(getBindings().map((binding) => [binding.id, binding.keys])),
    [masterSearchOpen],
  );
  const masterSourceLabels = useMemo(() => blancMasterSourceLabels(t), [lang, t]);
  const masterContent = useMemo(
    () => [
      ...appDrawerMasterContent(masterDrawer.tools, masterDrawer.folders, masterSourceLabels.unfiled),
      ...blancMasterSettings(t),
      ...savedWordMasterContent(masterSavedWords, t('blanc.masterSearch.group.savedWords')),
      ...deckCardMasterContent(masterDeckCards, masterSourceLabels),
      ...dictionaryEntryMasterContent(masterDictionaryEntries, masterSourceLabels),
      ...grammarPointMasterContent(masterGrammarPoints, masterSourceLabels),
      ...libraryItemMasterContent(masterLibraryItems, masterSourceLabels),
    ],
    [
      masterDeckCards,
      masterDictionaryEntries,
      masterDrawer.folders,
      masterDrawer.tools,
      masterGrammarPoints,
      masterLibraryItems,
      masterSavedWords,
      masterSourceLabels,
      lang,
    ],
  );

  useEffect(() => {
    // The renderer's index.html title ("Gum") would otherwise override
    // the BrowserWindow title, making the side window indistinguishable.
    // In the UI language: it is the window's name in the taskbar and Alt+Tab.
    document.title = t('blanc.refine.windowTitle');
  }, [lang]);
  useEffect(() => onBlancModeChanged(setSettings), []);
  useEffect(() => onBlancMemoryChanged(setMemory), []);
  useEffect(() => {
    const openFlow = (): void => setFlowOpen(true);
    const openInbox = (): void => setInboxOpen(true);
    // Trim: the Master search corpora are released with the palette already;
    // this makes sure nothing is left referenced if it was open meanwhile.
    const onTrim = (): void => {
      setMasterSearchOpen(false);
      setMasterSavedWords([]);
      setMasterDeckCards([]);
      setMasterDictionaryEntries([]);
      setMasterGrammarPoints([]);
      setMasterLibraryItems([]);
      setMasterDrawer({ version: 1, tools: [], folders: [] });
    };
    window.addEventListener(BLANC_OPEN_FLOW_EVENT, openFlow);
    window.addEventListener(BLANC_OPEN_INBOX_EVENT, openInbox);
    window.addEventListener(BLANC_TRIM_EVENT, onTrim);
    return () => {
      window.removeEventListener(BLANC_OPEN_FLOW_EVENT, openFlow);
      window.removeEventListener(BLANC_OPEN_INBOX_EVENT, openInbox);
      window.removeEventListener(BLANC_TRIM_EVENT, onTrim);
    };
  }, []);
  // F = Flow (not over a book: readers bind letters), Ctrl+Shift+X = capture.
  useBlancMechanicsHotkeys({ flowEnabled: !book, onFlow: () => setFlowOpen(true) });
  // "Restore reader on launch" (Settings > Memory) had no consumer. The book
  // open when Blanc last closed is remembered here and reopened at mount.
  const [restoreBookId] = useState<string | null>(() => {
    if (initialBook || !loadBlancMemory().restoreReaderOnLaunch) return null;
    try {
      return window.localStorage.getItem(BLANC_LAST_BOOK_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (!restoreBookId) return undefined;
    let alive = true;
    void window.api.listLibrary()
      .then((items) => {
        const item = items.find((candidate) => candidate.id === restoreBookId);
        if (alive && item) setBook((current) => current ?? item);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [restoreBookId]);
  const bookTracked = useRef(false);
  useEffect(() => {
    // The first run is the mount, before any restore landed: no book yet is
    // not the user closing one, so it must not erase what is being restored.
    const firstRun = !bookTracked.current;
    bookTracked.current = true;
    try {
      if (book) writeLocalStorage(BLANC_LAST_BOOK_KEY, book.id);
      // Closing the reader (or leaving it for a tab) means "not reading now".
      else if (!firstRun) window.localStorage.removeItem(BLANC_LAST_BOOK_KEY);
    } catch {
      /* storage unavailable: restoring is best effort */
    }
  }, [book]);
  // The Memory section's scratchpad duplicated Quick Notes; its text moves there once.
  useEffect(() => {
    migrateScratchpadToQuickNotes();
  }, []);
  useEffect(() => () => {
    if (deferredNavFrame.current !== null) window.cancelAnimationFrame(deferredNavFrame.current);
  }, []);
  useEffect(() => {
    void window.api.blancSetFullScreen(workspaceFull);
  }, [workspaceFull]);
  useEffect(
    () => () => {
      void window.api.blancSetFullScreen(false);
    },
    [],
  );
  useEffect(() => {
    if (!initialBook) return;
    setBook(initialBook);
    onInitialBookConsumed();
  }, [initialBook, onInitialBookConsumed]);
  useEffect(() => {
    const onToolboxCommand = (event: Event): void => {
      const command = (event as CustomEvent<string>).detail;
      if (command === 'toolbox.search' || command === 'toolbox.commandPalette') {
        setMasterSearchOpen(true);
        return;
      }
      // Alt+1..9: the user's first nine launcher tools, read at the keypress so
      // a reorder or a hidden tool applies immediately.
      const slot = typeof command === 'string' ? /^toolbox\.openSlot([1-9])$/.exec(command) : null;
      if (slot) {
        const target = launcherToolOrder(blancToolsRef.current, loadToolboxSettings())[Number(slot[1]) - 1];
        if (target) requestToolRef.current(target.id);
      }
    };
    window.addEventListener('toolbox:command', onToolboxCommand);
    return () => window.removeEventListener('toolbox:command', onToolboxCommand);
  }, []);
  useEffect(() => {
    // The focus timer lives outside its panel (blancFocusTimer.ts), so its
    // shortcuts and its completion notice are the shell's: they work, and the
    // notice fires, whichever tool is open.
    setFocusTimerFinishHandler(() => {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: translate('blanc.tb.timerDone'), kind: 'ok' } }));
    });
    const offStart = registerCommandHandler('focusTimer.startPause', () => {
      toggleFocusTimer();
      return true;
    });
    const offReset = registerCommandHandler('focusTimer.reset', () => {
      resetFocusTimer();
      return true;
    });
    return () => {
      setFocusTimerFinishHandler(null);
      offStart();
      offReset();
    };
  }, []);
  useEffect(() => {
    // The clipboard history overlay renders Study OS class names. Its open event
    // is held (capture phase, so the panel never sees it early) until the sheet
    // has loaded, then re-sent — it never paints unstyled, and a session that
    // never opens it never fetches the sheet.
    const onClipboardOpen = (event: Event): void => {
      if (studyOsCompatLoaded()) return;
      event.stopImmediatePropagation();
      const resend = (): void => {
        window.dispatchEvent(new CustomEvent('clipboard:open', { detail: (event as CustomEvent).detail }));
      };
      void ensureStudyOsCompat().then(resend, resend);
    };
    window.addEventListener('clipboard:open', onClipboardOpen, true);
    return () => window.removeEventListener('clipboard:open', onClipboardOpen, true);
  }, []);
  useEffect(() => {
    // Blanc's claim on the shared section bus. Dictionary links, novels mining,
    // game-arena settings links, context results and `nav.settings` all
    // dispatch `os:open`, and only Study OS's desktop and Mini listened — so in
    // Blanc every one of them was a dead button, and the sections Blanc DOES
    // have opened a full Study OS pop-out instead. A separate listener from
    // `onOpenTool` below, which keeps its own pinned contract.
    const onSectionOpen = (event: Event): void => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (typeof detail !== 'string' || !detail) return;
      const route = BLANC_SECTION_ROUTES[detail];
      if (!route) {
        // Not a surface Blanc has. A cancelable sender (`openSectionSurface`)
        // falls back to a pop-out itself; a plain one expects a host, so give
        // it the same pop-out rather than nothing.
        // Main validates the section and ignores anything that is not one.
        if (!event.cancelable) {
          void window.api.popOut(detail as Parameters<typeof window.api.popOut>[0]).catch(() => undefined);
        }
        return;
      }
      if ('tab' in route) chooseTab(route.tab);
      else requestToolRef.current(route.tool);
      markSectionOpenHandled(event);
    };
    // `nav.palette`, `nav.search` and `toolbox.commandPalette` all ask for the
    // palette; in Blanc that is Master search.
    const onPaletteOpen = (): void => setMasterSearchOpen(true);
    // Retired tool ids that a saved shortcut, pin or App Drawer entry can still
    // name. `context-search` became Master search, which reaches the same
    // sources plus a direct dictionary lookup.
    const onRetiredTool = (event: Event): void => {
      if ((event as CustomEvent<unknown>).detail !== 'context-search') return;
      setMasterSearchOpen(true);
      markSectionOpenHandled(event);
    };
    window.addEventListener('os:open', onSectionOpen);
    window.addEventListener('palette:open', onPaletteOpen);
    window.addEventListener('toolbox:open-tool', onRetiredTool);
    return () => {
      window.removeEventListener('os:open', onSectionOpen);
      window.removeEventListener('palette:open', onPaletteOpen);
      window.removeEventListener('toolbox:open-tool', onRetiredTool);
    };
  }, [memory.rememberLastTab]);
  useEffect(() => {
    if (!masterSearchOpen) {
      // Release the corpora when the palette closes: the grammar set, the whole
      // deck and the library list otherwise stay referenced (and resident) for
      // the rest of the session after one search.
      setMasterSavedWords([]);
      setMasterDeckCards([]);
      setMasterDictionaryEntries([]);
      setMasterGrammarPoints([]);
      setMasterLibraryItems([]);
      setMasterDrawer({ version: 1, tools: [], folders: [] });
      return;
    }
    let current = true;
    setMasterSavedWords(loadSaved());
    setMasterDeckCards(loadDeck());
    setMasterDictionaryEntries(loadLookupHistory());
    setMasterGrammarPoints([]);
    setMasterLibraryItems([]);
    setMasterDrawer({ version: 1, tools: [], folders: [] });
    void window.api.toolsList().then((store) => {
      if (current) setMasterDrawer(store);
    }).catch(() => {
      if (current) setMasterDrawer({ version: 1, tools: [], folders: [] });
    });
    void window.api.listLibrary().then((items) => {
      if (current) setMasterLibraryItems(items);
    }).catch(() => {
      if (current) setMasterLibraryItems([]);
    });
    void import('../../data/grammar').then(({ GRAMMAR }) => {
      if (current) setMasterGrammarPoints(GRAMMAR);
    }).catch(() => {
      if (current) setMasterGrammarPoints([]);
    });
    return () => {
      current = false;
    };
  }, [masterSearchOpen]);
  useEffect(() => {
    const onSelectTab = (event: Event): void => {
      const next = (event as CustomEvent<BlancTabId>).detail;
      if (BLANC_TABS.includes(next)) chooseTab(next);
    };
    const onOpenTool = (event: Event): void => {
      const feature = (event as CustomEvent<ToolboxModuleId>).detail;
      if (!feature) return;
      const directTabs: Partial<Record<ToolboxModuleId, BlancTabId>> = {
        media: 'media',
        flashcards: 'flashcards',
        statistics: 'stats',
        'epub-mining': 'mine',
        'anki-deck': 'deck',
      };
      const direct = directTabs[feature];
      if (direct) {
        chooseTab(direct);
        markSectionOpenHandled(event);
        return;
      }
      if (BLANC_TOOL_IDS.includes(feature as BlancToolId)) {
        setBook(null);
        setTab('tools');
        // Cancelled only where Blanc actually took the request, never at the
        // top of the handler: a caller that falls back when nobody claims the
        // event must not have its fallback suppressed by a host that did
        // nothing. Same contract as `os:open`; see sectionSurface.ts.
        markSectionOpenHandled(event);
        // Carried as a PROP, not as a `toolbox:select-tool` event, because the
        // listener does not exist yet when we arrive from another tab: the
        // toolbox mounts with `tools`, and it registers in a `useEffect`, which
        // React runs after paint. Measured on the Blanc harness — open-tool at
        // t=801.1 ms, next animation frame at t=819.4 ms, listener registered
        // at t=825.7 ms — so even a deferred dispatch lands 6.3 ms early and
        // the tab switches while the previously open tool stays put.
        setToolRequest((previous) => ({ id: feature as BlancToolId, key: (previous?.key ?? 0) + 1 }));
      }
    };
    window.addEventListener('blanc:select-tab', onSelectTab);
    window.addEventListener('toolbox:open-tool', onOpenTool);
    return () => {
      window.removeEventListener('blanc:select-tab', onSelectTab);
      window.removeEventListener('toolbox:open-tool', onOpenTool);
    };
  }, [memory.rememberLastTab]);

  const chooseTab = (next: BlancTabId): void => {
    setTab(next);
    setBook(null);
    setWorkspaceFull(false);
    if (memory.rememberLastTab) setSettings(setBlancLastTab(next));
  };

  /** Open a toolbox tool from anywhere in the shell, as a keyed request prop. */
  const requestTool = (id: BlancToolId): void => {
    chooseTab('tools');
    setToolRequest((previous) => ({ id, key: (previous?.key ?? 0) + 1 }));
  };
  // The listeners below register once; they reach the latest render through these.
  const requestToolRef = useRef(requestTool);
  requestToolRef.current = requestTool;
  const blancToolsRef = useRef(blancTools);
  blancToolsRef.current = blancTools;

  const chooseNavTab = (next: BlancTabId): void => {
    if (deferredNavFrame.current !== null) {
      window.cancelAnimationFrame(deferredNavFrame.current);
      deferredNavFrame.current = null;
    }
    if (next !== 'settings') {
      chooseTab(next);
      return;
    }
    // Settings owns the shell's largest synchronous mount. Let the pressed nav control paint
    // before beginning that work; deep links still use chooseTab directly so their next-frame
    // focus and scroll contract is unchanged.
    deferredNavFrame.current = window.requestAnimationFrame(() => {
      deferredNavFrame.current = null;
      chooseTab(next);
    });
  };

  // The toolbox stays mounted (hidden, effects paused) while another tab or a
  // book is on screen, as long as the memory budget keeps tools warm; Trim or a
  // budget of 0 releases it. That is what makes coming back instant.
  const toolsVisible = !book && tab === 'tools';
  const keepToolboxMounted = toolsVisible || warmTools.toolboxRetained;
  useEffect(() => {
    if (!keepToolboxMounted) toolboxUnmounted();
  }, [keepToolboxMounted]);

  const mechToast = (message: string, kind: 'ok' | 'error' = 'ok'): void => {
    window.dispatchEvent(new CustomEvent('os:toast', { detail: { message, kind } }));
  };

  /** Master search command verbs (`d 猫`, `t …`, `m …`, `r`, `g …`, `n …`, `o …`, `c`, `i`). */
  const runVerb = (verb: BlancVerbId, arg: string): void => {
    setMasterSearchOpen(false);
    if (verb === 'd') {
      requestBlancDictionaryQuery(arg);
      requestTool('dictionary');
    } else if (verb === 't') {
      requestBlancTranslate(arg);
      requestTool('translate');
    } else if (verb === 'm') {
      // The ordinary mining path: a local card first, toasted by mineToStudy.
      const word = detectCaptureKind(arg) === 'word';
      void import('../../studyMining')
        .then(({ mineToStudy }) => mineToStudy({
          word: arg,
          sentence: word ? undefined : arg,
          source: word ? 'dictionary' : 'analysis',
          studyKind: word ? 'vocabulary' : 'sentence',
          studyLang: studyLangOfText(arg, getStudyLang()),
        }))
        .catch(() => mechToast(t('blanc.mech.verb.m.failed'), 'error'));
    } else if (verb === 'r') {
      setFlowOpen(true);
    } else if (verb === 'g') {
      const loaded = masterGrammarPoints;
      const labels = masterSourceLabels;
      const pick = (points: readonly NormalizedGrammarPoint[]): void => {
        const hit = searchBlancMasterIndex(arg, [], [], grammarPointMasterContent(points, labels), 1).results[0];
        if (hit) setMasterGrammarRequest((previous) => ({ id: hit.id, key: (previous?.key ?? 0) + 1 }));
        else mechToast(t('blanc.mech.verb.g.none', { arg }), 'error');
        requestTool('grammar');
      };
      if (loaded.length) pick(loaded);
      else void import('../../data/grammar').then(({ GRAMMAR }) => pick(GRAMMAR)).catch(() => requestTool('grammar'));
    } else if (verb === 'n') {
      try {
        const current = window.localStorage.getItem(BLANC_QUICK_NOTES_KEY) ?? '';
        const next = current.trim() ? `${current.replace(/\s+$/, '')}\n${arg}` : arg;
        if (writeLocalStorage(BLANC_QUICK_NOTES_KEY, next)) {
          window.dispatchEvent(new CustomEvent(BLANC_QUICK_NOTES_EVENT));
          mechToast(t('blanc.mech.verb.n.done'));
        }
      } catch {
        /* storage unavailable: writeLocalStorage already reported it */
      }
    } else if (verb === 'o') {
      const hit = searchBlancMasterIndex(arg, blancTools, [], [], 1).results[0];
      if (hit && isBlancToolId(hit.id)) requestTool(hit.id);
      else mechToast(t('blanc.mech.verb.o.none', { arg }), 'error');
    } else if (verb === 'c') {
      void captureToInbox(arg || undefined);
    } else if (verb === 'i') {
      setInboxOpen(true);
    }
  };

  const title = book ? t('blanc.shell.reader') : t(TAB_META[tab].labelKey);
  const canExpandWorkspace = book || tab === 'mine' || tab === 'flashcards' || tab === 'media' || tab === 'stats' || tab === 'tools';

  return (
    <div className={`blanc-root${settings.darkMode ? ' is-dark' : ''}${workspaceFull ? ' is-workspace-full' : ''}${taskbarHidden ? ' is-taskbar-hidden' : ''}`}>
      <aside
        className="blanc-taskbar lq-liquid"
        data-lq-role="liquid"
        aria-label={t('blanc.shell.sections')}
      >
        {/* No in-window "Blanc" brand: the window title already names the window,
            and repeating it here only cost the taskbar a row (design brief). */}
        <button
          type="button"
          className="blanc-nav-btn blanc-taskbar-toggle"
          onClick={() => setTaskbarHidden(true)}
          title={t('blanc.shell.hideTaskbar')}
        >
          <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} />
          <span>{t('blanc.shell.hide')}</span>
        </button>
        <nav className="blanc-nav">
          {BLANC_TABS.map((id) => (
            <button
              key={id}
              type="button"
              className={`blanc-nav-btn${!book && tab === id ? ' active' : ''}`}
              // Which section is current was stated only in paint (the `active` class), so a
              // screen-reader user could reach all nine routes and never learn which one they
              // were on. The Study OS taskbar had the same gap and closed it with the same
              // shared declaration in a2e9c1ce; `aria-current="page"` is the standard spelling
              // for a navigation landmark, which this <nav> is.
              aria-current={!book && tab === id ? 'page' : undefined}
              onClick={() => chooseNavTab(id)}
              title={t(TAB_META[id].labelKey)}
            >
              <Icon name={TAB_META[id].icon} size={16} />
              <span>{t(TAB_META[id].labelKey)}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="blanc-exit"
          onClick={() => void setBlancModeEnabled(false)}
        >
          {t('blanc.shell.exit')}
        </button>
      </aside>

      <main className="blanc-main">
        <header className="blanc-top lq-liquid" data-lq-role="liquid">
          <div className="blanc-title">
            {book && (
              <button type="button" className="blanc-small-btn" onClick={() => setBook(null)}>
                {t('blanc.shell.back')}
              </button>
            )}
            <span>{title}</span>
          </div>
          {/* Out of the disclosure, because the disclosure now closes at every width and the
              time is the one thing in the top bar that is read rather than operated. A <time>
              is not a control, so keeping it visible costs the default view nothing. */}
          <time className="blanc-clock">
            {clock.toLocaleTimeString(LANG_TAGS[lang], { hour: '2-digit', minute: '2-digit' })}
          </time>
          <FocusTimerChip onOpen={() => requestTool('focus-timer')} />
          <FlowStatusChip overlayOpen={flowOpen} onOpen={() => setFlowOpen(true)} />
          <InboxChip onOpen={() => setInboxOpen(true)} />
          <RamChip activeTool={warmTools.active} />
          {/* Blanc mechanics: one keyboard run through the day's work (F). */}
          <button
            type="button"
            className="blanc-mech-flow-btn"
            title={t('blanc.mech.flow.startTitle')}
            aria-keyshortcuts="F"
            onClick={() => setFlowOpen(true)}
          >
            <Icon name="skip-forward" size={14} />
            <span>{t('blanc.mech.flow.button')}</span>
          </button>
          {/* Blanc's one cross-tool capability (6b488974) and its dominant way in, so it stays
              in the bar rather than one click inside the drawer: a Ctrl+F affordance that has
              to be uncovered first is not an affordance. `primary` is the declaration the
              shared vocabulary uses for "this is the way in" — the taskbar is the map, this is
              the action. */}
          <button
            type="button"
            className="blanc-icon-btn primary blanc-top-search"
            title={t('blanc.shell.searchTitle')}
            aria-label={t('blanc.shell.search')}
            onClick={() => setMasterSearchOpen(true)}
          >
            <Icon name="search" size={15} />
          </button>
          <button
            type="button"
            className="blanc-compact-tools-toggle"
            aria-expanded={compactToolsOpen}
            aria-controls="blanc-top-context"
            onClick={() => setCompactToolsOpen((open) => !open)}
          >
            {t('blanc.shell.contextTools')}
          </button>
          <div
            id="blanc-top-context"
            className={`blanc-top-context${compactToolsOpen ? ' is-open' : ''}`}
          >
            <FocusMusicBar />
            <div className="blanc-top-tools">
            {canExpandWorkspace && (
              <button
                type="button"
                className="blanc-icon-btn"
                title={workspaceFull ? t('blanc.shell.exitFullscreenWorkspace') : t('blanc.shell.fullscreenWorkspace')}
                aria-label={workspaceFull ? t('blanc.shell.exitFullscreenWorkspace') : t('blanc.shell.fullscreenWorkspace')}
                onClick={() => setWorkspaceFull((current) => !current)}
              >
                <Icon name={workspaceFull ? 'app' : 'monitor'} size={15} />
              </button>
            )}
            <LanguageSelect />
            {/* Advanced and Dark used to sit here as well as in Settings > Interface:
                the same two checkboxes in two places, one of them a step behind
                the other. They live in Settings only. */}
            </div>
          </div>
        </header>

        <section className={`blanc-content${book ? ' is-reader' : ''}`}>
          {/* The toolbox, kept mounted while the memory budget holds warm tools:
              hidden in an <Activity> (state kept, effects paused) when another
              tab or a book is on screen, released by Trim or a budget of 0. */}
          {keepToolboxMounted && (
            <Activity mode={toolsVisible ? 'visible' : 'hidden'}>
              <BlancToolErrorBoundary key="tab:tools" toolId="tools" label={t(TAB_META.tools.labelKey)}>
                <Suspense fallback={<div className="blanc-loading">{t('blanc.shell.loading')}</div>}>
                  <BlancToolsPanel
                    onOpenBook={setBook}
                    grammarRequest={masterGrammarRequest}
                    toolRequest={toolRequest}
                    visible={toolsVisible}
                  />
                </Suspense>
              </BlancToolErrorBoundary>
            </Activity>
          )}
          {/* Read, Mine, Deck, Cards, Media, Stats and Settings get the same
              per-surface crash guard the toolbox tools have: a tab that throws
              (or whose chunk fails to load) loses only itself, and "Try again"
              re-imports a failed chunk. Keyed so switching tabs starts fresh. */}
          {!toolsVisible && (
          <BlancToolErrorBoundary key={book ? `book:${book.id}` : `tab:${tab}`} toolId={book ? 'reader' : tab} label={title}>
          <Suspense fallback={<div className="blanc-loading">{t('blanc.shell.loading')}</div>}>
          {book?.kind === 'manga' ? (
            <MangaReader item={book} onClose={() => setBook(null)} />
          ) : book ? (
            <NovelReader item={book} onClose={() => setBook(null)} />
          ) : tab === 'read' ? (
            <BlancReadPanel onOpenBook={setBook} />
          ) : tab === 'mine' ? (
            <BlancMinePanel advanced={settings.advanced} />
          ) : tab === 'deck' ? (
            <BlancDeckPanel advanced={settings.advanced} />
          ) : tab === 'flashcards' ? (
            <BlancFlashcardsPanel searchRequest={masterDeckRequest} />
          ) : tab === 'media' ? (
            <BlancMediaPanel />
          ) : tab === 'stats' ? (
            <BlancStatisticsPanel />
          ) : tab === 'tools' ? null : (
            <BlancSettingsPanel settings={settings} onPatch={setSettings} />
          )}
          </Suspense>
          </BlancToolErrorBoundary>
          )}
        </section>
      </main>
      {workspaceFull && (
        <button
          type="button"
          className="blanc-fullscreen-exit"
          title={t('blanc.shell.exitFullscreenWorkspace')}
          onClick={() => setWorkspaceFull(false)}
        >
          <Icon name="app" size={15} />
          <span>{t('blanc.shell.exitFullscreen')}</span>
        </button>
      )}
      {taskbarHidden && !workspaceFull && (
        <button
          type="button"
          className="blanc-taskbar-reveal"
          title={t('blanc.shell.showTaskbar')}
          aria-label={t('blanc.shell.showTaskbarAria')}
          onClick={() => setTaskbarHidden(false)}
        >
          <Icon name="chevron" size={15} />
        </button>
      )}
      <BlancMasterSearch
        open={masterSearchOpen}
        tools={blancTools}
        content={masterContent}
        commands={TOOLBOX_SHORTCUT_COMMANDS.map((command) => ({
          ...command,
          shortcut: masterCommandShortcuts.get(command.id) ?? command.defaultShortcut,
        }))}
        onClose={() => setMasterSearchOpen(false)}
        onRunVerb={runVerb}
        onOpenTool={(id) => {
          if (!isBlancToolId(id)) return;
          setMasterSearchOpen(false);
          // Through the same keyed request a deep link uses, not a deferred
          // `toolbox:select-tool`: the toolbox may not be mounted yet, and its
          // listener registers after paint (measured 6.3 ms after the frame).
          requestTool(id);
        }}
        onRunCommand={(id) => {
          setMasterSearchOpen(false);
          runCommand(id);
        }}
        onOpenContent={(result) => {
          setMasterSearchOpen(false);
          if (result.kind === 'shortcut') {
            const shortcut = masterDrawer.tools.find((item) => item.id === result.id);
            if (!shortcut) return;
            if (shortcut.kind === 'tool') {
              window.requestAnimationFrame(() => {
                window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: shortcut.url }));
              });
              return;
            }
            void window.api.launchTarget(shortcut.url).then((failure) => {
              if (failure) {
                window.dispatchEvent(new CustomEvent('os:toast', {
                  detail: { message: t('blanc.refine.error.detail', { detail: failure }), kind: 'error' },
                }));
              }
            }).catch(() => undefined);
            return;
          }
          if (result.kind === 'setting') {
            chooseTab('settings');
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                const section = document.querySelector<HTMLElement>(
                  `[data-blanc-setting="${result.id}"]`,
                );
                section?.scrollIntoView({ block: 'start' });
                section?.focus({ preventScroll: true });
              });
            });
            return;
          }
          if (result.kind === 'library-item') {
            const item = masterLibraryItems.find((candidate) => candidate.id === result.id);
            if (item) setBook(item);
            return;
          }
          if (result.kind === 'deck-card') {
            const card = masterDeckCards.find((candidate) => candidate.id === result.id);
            if (!card) return;
            setMasterDeckRequest((previous) => ({ query: card.word || card.front || '', key: (previous?.key ?? 0) + 1 }));
            chooseTab('flashcards');
            return;
          }
          if (result.kind === 'grammar-point') {
            setMasterGrammarRequest((previous) => ({ id: result.id, key: (previous?.key ?? 0) + 1 }));
            requestTool('grammar');
            return;
          }
          if (result.kind === 'dictionary-entry' && result.language) {
            setStudyLang(result.language);
          }
          // Held as state for a Dictionary panel that has not mounted yet, and
          // announced for one that has — no animation-frame race either way.
          requestBlancDictionaryQuery(result.kind === 'dictionary-entry' ? result.title : result.id);
          requestTool('dictionary');
        }}
      />
      <ClipboardHistoryPanel />
      {flowOpen && (
        <BlancToolErrorBoundary key="mech:flow" toolId="flow" label={t('blanc.mech.flow.title')}>
          <Suspense fallback={null}>
            <BlancFlowRunner onClose={() => setFlowOpen(false)} onOpenBook={setBook} />
          </Suspense>
        </BlancToolErrorBoundary>
      )}
      {inboxOpen && (
        <BlancToolErrorBoundary key="mech:inbox" toolId="capture-inbox" label={t('blanc.mech.inbox.titleShort')}>
          <Suspense fallback={null}>
            <BlancCaptureInboxDialog onClose={() => setInboxOpen(false)} />
          </Suspense>
        </BlancToolErrorBoundary>
      )}
    </div>
  );
}

function LanguageSelect() {
  const { t } = useT();
  const [lang, setLang] = useState<UiLang>(() => getUiLang());
  return (
    <label className="blanc-lang">
      <span>{t('blanc.shell.language')}</span>
      <select
        value={lang}
        onChange={(event) => {
          const next = event.target.value as UiLang;
          setLang(next);
          setUiLang(next);
        }}
      >
        {UI_LANGS.map((id) => (
          <option key={id} value={id} lang={LANG_TAGS[id]}>
            {LANG_LABELS[id]}
          </option>
        ))}
      </select>
    </label>
  );
}

function BlancReadPanel({ onOpenBook }: { onOpenBook: (item: LibraryItem) => void }) {
  const { t } = useT();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [watchFolder, setWatchFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [status, setStatus] = useState('');

  const refresh = useCallback(async () => {
    const [library, folderList, watch] = await Promise.all([
      window.api.syncLibrary(),
      window.api.getLibraryFolders(),
      window.api.getWatchFolder(),
    ]);
    setItems(library);
    setFolders(folderList);
    setWatchFolder(watch);
  }, []);

  useEffect(() => {
    void refresh();
    return window.api.onLibraryChanged(setItems);
  }, [refresh]);

  const visible = useMemo(() => {
    if (activeFolder === 'all') return items;
    if (activeFolder === 'unfiled') return items.filter((item) => !item.folder || !folders.includes(item.folder));
    return items.filter((item) => item.folder === activeFolder);
  }, [activeFolder, folders, items]);

  const runBusy = async (work: () => Promise<void>): Promise<void> => {
    setBusy(true);
    setStatus('');
    try {
      await work();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const createFolder = async (): Promise<void> => {
    const name = newFolder.trim();
    if (!name) return;
    const result = await window.api.setLibraryFolders([...folders, name]);
    setFolders(result.folders);
    setItems(result.items);
    setActiveFolder(name);
    setNewFolder('');
  };

  return (
    <div className="blanc-panel blanc-read">
      <fieldset>
        <legend>{t('blanc.shell.read.library')}</legend>
        <div className="blanc-toolbar">
          <button type="button" disabled={busy} onClick={() => void runBusy(async () => setItems(await window.api.importFiles()))}>
            {t('blanc.shell.read.uploadFile')}
          </button>
          <button type="button" disabled={busy} onClick={() => void runBusy(async () => setItems(await window.api.importFolder()))}>
            {t('blanc.shell.read.uploadFolder')}
          </button>
          <button type="button" disabled={busy} onClick={() => void runBusy(refresh)}>
            {t('blanc.shell.refresh')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void runBusy(async () => {
                const result = await window.api.setWatchFolder();
                setWatchFolder(result.folder);
                setItems(result.items);
              })
            }
          >
            {watchFolder ? t('blanc.shell.read.changeWatchFolder') : t('blanc.shell.read.setWatchFolder')}
          </button>
        </div>
        {watchFolder && (
          <p className="blanc-note">
            {t('blanc.shell.read.autoImportFolder')} <code>{watchFolder}</code>
          </p>
        )}
        {status && <p className="blanc-error">{status}</p>}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.shell.read.folders')}</legend>
        <div className="blanc-folder-row">
          <select value={activeFolder} onChange={(event) => setActiveFolder(event.target.value)}>
            <option value="all">{t('blanc.shell.read.allCount', { count: items.length })}</option>
            <option value="unfiled">{t('blanc.shell.read.unfiled')}</option>
            {folders.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newFolder}
            placeholder={t('blanc.shell.read.newFolder')}
            aria-label={t('blanc.shell.read.newFolder')}
            onChange={(event) => setNewFolder(event.target.value)}
            onKeyDown={(event) => {
              // Enter confirms an IME conversion; it must not create the folder yet.
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (event.key === 'Enter') void createFolder();
            }}
          />
          <button type="button" onClick={() => void createFolder()}>
            {t('blanc.shell.read.add')}
          </button>
        </div>
      </fieldset>

      <div className="blanc-table-wrap">
        <table className="blanc-table">
          <thead>
            <tr>
              <th>{t('blanc.shell.col.title')}</th>
              <th>{t('blanc.shell.col.type')}</th>
              <th>{t('blanc.shell.col.progress')}</th>
              <th>{t('blanc.shell.col.folder')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => {
              const pct = Math.round((item.progress?.percent ?? 0) * 100);
              return (
                <tr key={item.id}>
                  <td>
                    <button type="button" className="blanc-link-btn" onClick={() => onOpenBook(item)}>
                      {item.title}
                    </button>
                  </td>
                  <td>{item.kind === 'manga' ? t('blanc.shell.read.kindManga') : item.epubFile?.endsWith('.pdf') ? 'PDF' : 'EPUB'}</td>
                  <td>{new Intl.NumberFormat(LANG_TAGS[getUiLang()], { style: 'percent', maximumFractionDigits: 0 }).format(pct / 100)}</td>
                  <td>
                    <select
                      value={item.folder && folders.includes(item.folder) ? item.folder : ''}
                      onChange={(event) =>
                        void window.api.setItemFolder(item.id, event.target.value || null).then(setItems)
                      }
                    >
                      <option value="">{t('blanc.shell.read.unfiled')}</option>
                      {folders.map((folder) => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" onClick={() => onOpenBook(item)}>
                      {t('blanc.shell.open')}
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5}>{t('blanc.shell.read.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BlancMinePanel({ advanced }: { advanced: boolean }) {
  return (
    <div className="blanc-panel blanc-mine">
      {advanced ? <EpubMiningPanel /> : <EpubMiningSimplePanel />}
    </div>
  );
}

function BlancDeckPanel({ advanced }: { advanced: boolean }) {
  const { t } = useT();
  const [cards, setCards] = useState<DeckFlashcard[]>(() => loadDeck());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('');
  const [decks, setDecks] = useState<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [deck, setDeck] = useState(() => getActiveProfile().anki.deckName ?? '');
  const [term, setTerm] = useState('');
  const [reading, setReading] = useState('');
  const [meaning, setMeaning] = useState('');
  const [sentence, setSentence] = useState('');

  useEffect(() => onDeckChanged(() => setCards(loadDeck())), []);
  useEffect(() => {
    // Asked once per visit, not on every deck change (picking a deck re-queried
    // AnkiConnect each time), and not at all when the advanced Anki panel is
    // shown instead. A rejected IPC reads as "not connected", not as an
    // unhandled rejection.
    if (advanced) return undefined;
    let alive = true;
    void window.api.ankiStatus()
      .then((next) => {
        if (!alive) return;
        setConnected(!!next.connected);
        setDecks(next.decks ?? []);
        setDeck((current) => current || next.decks?.[0] || '');
      })
      .catch(() => {
        if (!alive) return;
        setConnected(false);
        setDecks([]);
      });
    return () => {
      alive = false;
    };
  }, [advanced]);

  if (advanced) return <BlancAnkiPanel />;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendCard = async (
    card: Pick<DeckFlashcard, 'id' | 'word' | 'reading' | 'meaning' | 'sentence' | 'studyLang'>,
  ): Promise<boolean> => {
    const result = await window.api.ankiMineNote({
      // The card's own language routes it (absent is Japanese, as stored).
      route: { source: 'other', cardKind: card.sentence ? 'sentence' : 'word', language: normalizeStudyLang(card.studyLang) },
      term: card.word,
      reading: card.reading || undefined,
      meaning: card.meaning || undefined,
      sentence: card.sentence || undefined,
      deckName: deck || undefined,
    });
    const ok = result.ok || result.error === 'duplicate';
    if (card.id) {
      updateDeckCard(card.id, {
        ankiExported: ok,
        ankiExportedAt: ok ? Date.now() : undefined,
        ankiNoteId: result.noteId,
        ankiExportError: ok ? undefined : result.error ?? t('blanc.shell.deck.exportFailed'),
        ankiDeck: deck || undefined,
      });
      setCards(loadDeck());
    }
    return ok;
  };

  const exportSelected = async (): Promise<void> => {
    const targets = cards.filter((card) => selected.has(card.id));
    if (!targets.length) {
      setStatus(t('blanc.shell.deck.selectFirst'));
      return;
    }
    setStatus(t('blanc.shell.deck.exporting', { count: targets.length }));
    let ok = 0;
    for (const card of targets) {
      if (await sendCard(card)) ok += 1;
    }
    setStatus(t('blanc.shell.deck.exported', { ok, total: targets.length }));
  };

  const addManual = async (): Promise<void> => {
    const word = term.trim();
    if (!word) return;
    const payload = {
      word,
      reading: reading.trim(),
      meaning: meaning.trim(),
      sentence: sentence.trim() || undefined,
      front: word,
      back: meaning.trim(),
      source: 'epub' as const,
      // Absent means Japanese on a stored card; anything else is said.
      ...(studyLangOfText(word, getStudyLang()) !== 'ja' ? { studyLang: studyLangOfText(word, getStudyLang()) } : {}),
    };
    const created = addDeckCards([payload])[0];
    setCards(loadDeck());
    setTerm('');
    setReading('');
    setMeaning('');
    setSentence('');
    if (connected && created) {
      const ok = await sendCard(created);
      setStatus(ok ? t('blanc.shell.deck.savedExported') : t('blanc.shell.deck.savedExportFailed'));
    } else {
      setStatus(t('blanc.shell.deck.savedLocal'));
    }
  };

  return (
    <div className="blanc-panel">
      <ProfileSwitcher compact showHeading={false} />
      <fieldset>
        <legend>Anki</legend>
        <div className="blanc-toolbar">
          <span className={`blanc-status-dot${connected ? ' ok' : ''}`} />
          <span>{connected ? t('blanc.shell.deck.connected') : t('blanc.shell.deck.notConnected')}</span>
          <select value={deck} aria-label={t('blanc.shell.deck.deck')} onChange={(event) => setDeck(event.target.value)}>
            {deck && !decks.includes(deck) && <option value={deck}>{deck}</option>}
            <option value="">{t('blanc.shell.deck.profileDefault')}</option>
            {decks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void exportSelected()}>
            {t('blanc.shell.deck.exportSelected')}
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      <fieldset>
        <legend>{t('blanc.shell.deck.manualCard')}</legend>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.shell.deck.word')}
            <input value={term} lang="ja" onChange={(event) => setTerm(event.target.value)} />
          </label>
          <label>
            {t('blanc.shell.deck.reading')}
            <input value={reading} lang="ja" onChange={(event) => setReading(event.target.value)} />
          </label>
          <label>
            {t('blanc.shell.deck.meaning')}
            <input value={meaning} onChange={(event) => setMeaning(event.target.value)} />
          </label>
          <label>
            {t('blanc.shell.deck.sentence')}
            <input value={sentence} lang="ja" onChange={(event) => setSentence(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={() => void addManual()} disabled={!term.trim()}>
          {t('blanc.shell.deck.addCard')}
        </button>
      </fieldset>

      <div className="blanc-table-wrap">
        <table className="blanc-table">
          <thead>
            <tr>
              <th />
              <th>{t('blanc.shell.deck.word')}</th>
              <th>{t('blanc.shell.deck.meaning')}</th>
              <th>{t('blanc.shell.deck.source')}</th>
              <th>Anki</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(card.id)}
                    aria-label={t('blanc.shell.deck.selectCard', { word: card.word })}
                    onChange={() => toggle(card.id)}
                  />
                </td>
                <td lang="ja">{card.word}</td>
                <td>{card.meaning || card.back}</td>
                <td>{card.bookTitle || card.source}</td>
                <td>{card.ankiExported ? t('blanc.shell.deck.stateExported') : card.ankiExportError ? t('blanc.shell.deck.stateFailed') : t('blanc.shell.deck.stateLocal')}</td>
                <td>
                  <button type="button" onClick={() => {
                    removeDeckCard(card.id);
                    setCards(loadDeck());
                  }}>
                    {t('blanc.shell.remove')}
                  </button>
                </td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr>
                <td colSpan={6}>{t('blanc.shell.deck.empty')}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/**
 * Blanc-only tool ids (shared/blancTools.ts) — surfaces Blanc has that the
 * shared toolbox registry does not model — plus the registry modules Blanc
 * renders itself.
 */
type BlancToolId =
  | BlancOnlyToolId
  | Extract<
  ToolboxModuleId,
  | 'clipboard'
  | 'automation-builder'
  | 'calculator'
  | 'unit-converter'
  | 'focus-timer'
  | 'system-monitor'
  | 'quick-notes'
  | 'file-search'
  | 'hash-checker'
  | 'image-converter'
  | 'batch-converter'
  | 'app-drawer'
  | 'dictionary'
  | 'grammar'
  | 'reading-finder'
  | 'resources'
  | 'calendar'
  | 'notification-center'
  | 'difficulty-analyzer'
  | 'immersion-tracker'
  | 'frequency-explorer'
  | 'subtitle-importer'
  | 'kanji-inspector'
  | 'youtube-library'
  | 'screen-recorder'
  | 'furigana'
  | 'counter-reader'
  | 'conjugation-drill'
  | 'review-forecast'
  | 'pitch-accent'
  | 'dev-console'
  | 'audio-mine'
  | 'mono-blocks'
>;


/**
 * Current value of a Blanc token, as a #rrggbb string for <input type="color">.
 *
 * The tokens are defined in blanc.css and can be rgba() or hsl(), which a colour
 * input cannot display. Reading the computed value and normalising it means the
 * swatch always shows what is actually on screen rather than an empty black box.
 */
function readComputedToken(token: string): string {
  if (typeof document === 'undefined') return '#000000';
  const root = document.querySelector('.blanc-root') ?? document.documentElement;
  const raw = getComputedStyle(root).getPropertyValue(`--blanc-${token}`).trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  const m = raw.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (!m) return '#000000';
  const hex = (n: string): string => Number(n).toString(16).padStart(2, '0');
  return `#${hex(m[1])}${hex(m[2])}${hex(m[3])}`;
}

/**
 * Every Blanc tool, in default launcher order: study first (the default tool is
 * the dictionary), then reading and watching, then mining and review, then the
 * general utilities. `context-search` is retired — Master search (Ctrl+K)
 * reaches the same commands, saved words, deck cards and grammar points, plus a
 * direct dictionary lookup.
 */
const BLANC_TOOL_IDS: BlancToolId[] = [
  // Study
  'dictionary',
  'grammar',
  'translate',
  'clipboard',
  'furigana',
  'pitch-accent',
  'conjugation-drill',
  'counter-reader',
  'kanji-inspector',
  'frequency-explorer',
  'difficulty-analyzer',
  'notebook',
  // Read & watch
  'novels',
  'visual-novels',
  'reading-finder',
  'immersion',
  'discover',
  'youtube-library',
  'music',
  'visualizer',
  'resources',
  'immersion-tracker',
  // Mine & review
  'audio-mine',
  'subtitle-importer',
  'screen-recorder',
  'review-forecast',
  'games',
  'mono-blocks',
  // Utilities
  'quick-notes',
  'focus-timer',
  'calendar',
  'files',
  'file-search',
  'app-drawer',
  'calculator',
  'unit-converter',
  'hash-checker',
  'image-converter',
  'batch-converter',
  'system-monitor',
  'notification-center',
  'agent',
  'local-agent',
  'automation-builder',
  'dev-console',
  'coverage',
];

const BLANC_TOOL_ICONS: Record<BlancToolId, IconName> = {
  agent: 'sparkle',
  files: 'folder-open',
  furigana: 'note',
  'counter-reader': 'app',
  'conjugation-drill': 'dice',
  'review-forecast': 'stats',
  'pitch-accent': 'music',
  'dev-console': 'wrench',
  'audio-mine': 'caption',
  'local-agent': 'sparkle',
  coverage: 'stats',
  notebook: 'note',
  translate: 'globe',
  music: 'music',
  novels: 'library',
  'visual-novels': 'library',
  discover: 'sparkle',
  games: 'dice',
  immersion: 'globe',
  visualizer: 'music',
  clipboard: 'clipboard',
  'automation-builder': 'wrench',
  calculator: 'app',
  'unit-converter': 'refresh',
  'focus-timer': 'calendar',
  'system-monitor': 'monitor',
  'quick-notes': 'note',
  'file-search': 'search',
  'hash-checker': 'check',
  'image-converter': 'image',
  'batch-converter': 'image',
  'app-drawer': 'folder',
  dictionary: 'dictionary',
  grammar: 'grammar',
  'reading-finder': 'search',
  resources: 'resources',
  calendar: 'calendar',
  'notification-center': 'bell',
  'difficulty-analyzer': 'chart-bar',
  'immersion-tracker': 'globe',
  'frequency-explorer': 'dictionary',
  'subtitle-importer': 'caption',
  'kanji-inspector': 'scan',
  'youtube-library': 'player',
  'screen-recorder': 'video',
  'mono-blocks': 'app',
};

type BlancToolCategory = 'study' | 'read-watch' | 'mine-review' | 'utilities';

interface BlancToolEntry {
  id: BlancToolId;
  label: string;
  icon: IconName;
  category: BlancToolCategory;
  description: string;
  shortcut?: string;
}

const TOOL_CATEGORY_LABEL_KEYS: Record<BlancToolCategory, string> = {
  study: 'blanc.refine.category.study',
  'read-watch': 'blanc.refine.category.readWatch',
  'mine-review': 'blanc.refine.category.mineReview',
  utilities: 'blanc.refine.category.utilities',
};

const TOOL_CATEGORY_ORDER: BlancToolCategory[] = ['study', 'read-watch', 'mine-review', 'utilities'];

/** Launcher group per tool. Names and descriptions are catalog keys (blancToolLabels.ts). */
const TOOL_CATEGORY: Record<BlancToolId, BlancToolCategory> = {
  dictionary: 'study',
  grammar: 'study',
  translate: 'study',
  clipboard: 'study',
  furigana: 'study',
  'pitch-accent': 'study',
  'conjugation-drill': 'study',
  'counter-reader': 'study',
  'kanji-inspector': 'study',
  'frequency-explorer': 'study',
  'difficulty-analyzer': 'study',
  notebook: 'study',
  novels: 'read-watch',
  'visual-novels': 'read-watch',
  'reading-finder': 'read-watch',
  immersion: 'read-watch',
  discover: 'read-watch',
  'youtube-library': 'read-watch',
  music: 'read-watch',
  visualizer: 'read-watch',
  resources: 'read-watch',
  'immersion-tracker': 'read-watch',
  'audio-mine': 'mine-review',
  'subtitle-importer': 'mine-review',
  'screen-recorder': 'mine-review',
  'review-forecast': 'mine-review',
  games: 'mine-review',
  'mono-blocks': 'mine-review',
  'quick-notes': 'utilities',
  'focus-timer': 'utilities',
  calendar: 'utilities',
  files: 'utilities',
  'file-search': 'utilities',
  'app-drawer': 'utilities',
  calculator: 'utilities',
  'unit-converter': 'utilities',
  'hash-checker': 'utilities',
  'image-converter': 'utilities',
  'batch-converter': 'utilities',
  'system-monitor': 'utilities',
  'notification-center': 'utilities',
  agent: 'utilities',
  'local-agent': 'utilities',
  'automation-builder': 'utilities',
  'dev-console': 'utilities',
  coverage: 'utilities',
};

/**
 * Where a Study OS section id lands in Blanc (`os:open`). Tab ids take a whole
 * tab; everything else opens a toolbox tool. Ids that are not here are not
 * Blanc surfaces, and the event is left for the caller's pop-out fallback.
 */
type BlancSectionRoute = { tab: BlancTabId } | { tool: BlancToolId };
const BLANC_SECTION_ROUTES: Record<string, BlancSectionRoute> = {
  library: { tab: 'read' },
  read: { tab: 'read' },
  stats: { tab: 'stats' },
  statistics: { tab: 'stats' },
  player: { tab: 'media' },
  video: { tab: 'media' },
  media: { tab: 'media' },
  anki: { tab: 'deck' },
  'anki-deck': { tab: 'deck' },
  deck: { tab: 'deck' },
  flashcards: { tab: 'flashcards' },
  'epub-mining': { tab: 'mine' },
  mining: { tab: 'mine' },
  settings: { tab: 'settings' },
  toolbox: { tab: 'tools' },
  reading: { tool: 'reading-finder' },
  'reading-finder': { tool: 'reading-finder' },
  youtube: { tool: 'youtube-library' },
  'youtube-library': { tool: 'youtube-library' },
  note: { tool: 'quick-notes' },
  notes: { tool: 'quick-notes' },
  'quick-notes': { tool: 'quick-notes' },
  notebook: { tool: 'notebook' },
  scraper: { tool: 'discover' },
  discover: { tool: 'discover' },
  dictionary: { tool: 'dictionary' },
  grammar: { tool: 'grammar' },
  translate: { tool: 'translate' },
  music: { tool: 'music' },
  calendar: { tool: 'calendar' },
  resources: { tool: 'resources' },
  clipboard: { tool: 'clipboard' },
  games: { tool: 'games' },
  'mono-blocks': { tool: 'mono-blocks' },
  blocks: { tool: 'mono-blocks' },
  immersion: { tool: 'immersion' },
  visualizer: { tool: 'visualizer' },
  files: { tool: 'files' },
  novels: { tool: 'novels' },
  visualnovels: { tool: 'visual-novels' },
  'visual-novels': { tool: 'visual-novels' },
  agent: { tool: 'agent' },
};

interface BlancToolDef {
  id: BlancToolId;
  icon: IconName;
  category: BlancToolCategory;
}

const BLANC_TOOL_DEFS: BlancToolDef[] = BLANC_TOOL_IDS.map((id) => ({
  id,
  icon: BLANC_TOOL_ICONS[id],
  category: TOOL_CATEGORY[id],
}));

/** Blanc's tools with their name and description in the active UI language. */
function useBlancTools(): BlancToolEntry[] {
  const { t, lang } = useT();
  const developerTools = useBlancDeveloperTools();
  return useMemo(
    () =>
      BLANC_TOOL_DEFS.filter((def) => developerTools || !isDeveloperOnlyTool(def.id)).map((def) => ({
        ...def,
        label: blancToolLabel(t, def.id),
        description: t(`${blancToolLabelKey(def.id) ?? def.id}.desc`),
      })),
    [lang, developerTools],
  );
}

/** The tool Blanc opens when nothing else says which: study first. */
const DEFAULT_BLANC_TOOL: BlancToolId = 'dictionary';

function isBlancToolId(value: unknown): value is BlancToolId {
  return typeof value === 'string' && BLANC_TOOL_IDS.includes(value as BlancToolId);
}

/** How many launcher positions Alt+1..9 (`toolbox.openSlotN`) reach. */
const LAUNCHER_SLOTS = 9;

/**
 * The launcher's browse order — exactly what the rail shows with no query:
 * visible tools only, grouped by the user's section order, the user's tool
 * order within each group. Alt+1..9 open the first nine of THIS list, so the
 * shortcuts follow whatever the user arranged rather than nine fixed utilities.
 */
function launcherToolOrder(tools: readonly BlancToolEntry[], settings: ToolboxSettings): BlancToolEntry[] {
  const visible = tools.filter((item) => isToolLaunchable(item.id, settings, false));
  const byId = new Map(visible.map((item) => [item.id, item]));
  const ordered = orderToolIds(visible.map((item) => item.id), settings.toolOrder).flatMap((id) => {
    const item = byId.get(id);
    return item ? [item] : [];
  });
  return orderToolIds(TOOL_CATEGORY_ORDER, settings.categoryOrder).flatMap((category) =>
    ordered.filter((item) => item.category === category),
  );
}

const BLANC_LAST_TOOL_KEY = 'jp-study.blanc.toolbox.lastTool';
const BLANC_FAVORITE_TOOLS_KEY = 'jp-study.blanc.toolbox.favoriteTools';
const BLANC_RECENT_TOOLS_KEY = 'jp-study.blanc.toolbox.recentTools';
const BLANC_OPEN_TABS_KEY = 'jp-study.blanc.toolbox.openTabs';

/** Loose subsequence match: every query character appears in order. */
function fuzzyIncludes(haystack: string, needle: string): boolean {
  let i = 0;
  for (const char of haystack) {
    if (char === needle[i]) i += 1;
    if (i >= needle.length) return true;
  }
  return needle.length === 0;
}

function readToolList(key: string): BlancToolId[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is BlancToolId => BLANC_TOOL_IDS.includes(id as BlancToolId));
  } catch {
    return [];
  }
}

/**
 * The pinned tools, reassembled from settings (registry-governed ids) and
 * Blanc's own list (which is the only store able to hold a Blanc-only id).
 */
function readFavorites(fromSettings: readonly string[]): BlancToolId[] {
  return mergeFavoriteTools(fromSettings, readToolList(BLANC_FAVORITE_TOOLS_KEY)).filter(
    (id): id is BlancToolId => BLANC_TOOL_IDS.includes(id as BlancToolId),
  );
}

function writeToolList(key: string, value: BlancToolId[]): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

function renderBlancTool(
  tool: BlancToolId,
  onOpenBook: (item: LibraryItem) => void,
  grammarRequest: { id: string; key: number } | null,
): JSX.Element {
  if (tool === 'coverage') return <ToolboxCoveragePanel />;
  if (tool === 'agent') return <BlancCentralAgentPanel />;
  if (tool === 'files') return <BlancFilesPanel />;
  if (tool === 'furigana') return <BlancFuriganaPanel />;
  if (tool === 'counter-reader') return <BlancCounterPanel />;
  if (tool === 'conjugation-drill') return <BlancConjugationPanel />;
  if (tool === 'review-forecast') return <BlancForecastPanel />;
  if (tool === 'pitch-accent') return <BlancPitchPanel />;
  if (tool === 'dev-console') return <BlancConsolePanel />;
  if (tool === 'audio-mine') return <BlancAudioMinePanel />;
  if (tool === 'notebook') return <BlancNotebookPanel />;
  if (tool === 'translate') return <BlancTranslatePanel />;
  if (tool === 'music') return <BlancMusicPanel />;
  if (tool === 'novels') return <BlancNovelsPanel />;
  if (tool === 'discover') return <BlancDiscoverPanel />;
  if (tool === 'games') return <BlancGamesPanel />;
  if (tool === 'immersion') return <BlancImmersionPanel />;
  if (tool === 'visualizer') return <BlancVisualizerPanel />;
  if (tool === 'local-agent') return <LocalAgentPanel />;
  if (tool === 'clipboard') return <BlancClipboardPanel />;
  if (tool === 'automation-builder') return <AutomationBuilderPanel />;
  if (tool === 'calculator') return <CalculatorPanel />;
  if (tool === 'unit-converter') return <UnitConverterPanel />;
  if (tool === 'focus-timer') return <FocusTimerPanel />;
  if (tool === 'system-monitor') return <SystemMonitorPanel />;
  if (tool === 'quick-notes') return <QuickNotesPanel />;
  if (tool === 'file-search') return <FileSearchPanel />;
  if (tool === 'hash-checker') return <HashCheckerPanel />;
  if (tool === 'image-converter') return <ImageConverterPanel />;
  if (tool === 'batch-converter') return <BatchConverterPanel />;
  if (tool === 'app-drawer') return <BlancAppDrawerPanel />;
  if (tool === 'dictionary') return <BlancDictionaryPanel />;
  if (tool === 'grammar') return <BlancGrammarPanel focusRequest={grammarRequest} />;
  if (tool === 'reading-finder') return <BlancReadingFinderPanel onOpenBook={onOpenBook} />;
  if (tool === 'resources') return <BlancResourcesPanel />;
  if (tool === 'notification-center') return <NotificationCenterPanel />;
  if (tool === 'difficulty-analyzer') return <DifficultyAnalyzerPanel />;
  if (tool === 'immersion-tracker') return <ImmersionTrackerPanel />;
  if (tool === 'frequency-explorer') return <FrequencyExplorerPanel />;
  if (tool === 'subtitle-importer') return <SubtitleImporterPanel />;
  if (tool === 'kanji-inspector') return <KanjiInspectorPanel />;
  if (tool === 'youtube-library') return <BlancYoutubePanel />;
  if (tool === 'screen-recorder') return <RecorderLauncherPanel />;
  if (tool === 'mono-blocks') return <MonoBlocks />;
  if (tool === 'visual-novels') return <BlancVisualNovelsPanel />;
  return <BlancCalendarPanel />;
}

/**
 * One loaded tool: its own crash boundary (keyed on the tool, so a failure
 * never follows you to the next one) OUTSIDE its Suspense — a lazy chunk that
 * fails to load throws while the boundary's child renders, and a boundary
 * nested under the fallback would never see it.
 */
function BlancToolSlot({
  tool,
  label,
  onOpenBook,
  grammarRequest,
}: {
  tool: BlancToolId;
  label: string;
  onOpenBook: (item: LibraryItem) => void;
  grammarRequest: { id: string; key: number } | null;
}) {
  const { t } = useT();
  return (
    <BlancToolErrorBoundary key={tool} toolId={tool} label={label}>
      <Suspense fallback={<div className="blanc-loading">{t('blanc.tb.loading')}</div>}>
        {renderBlancTool(tool, onOpenBook, grammarRequest)}
      </Suspense>
    </BlancToolErrorBoundary>
  );
}

function BlancToolsPanel({
  onOpenBook,
  grammarRequest,
  toolRequest,
  visible = true,
}: {
  onOpenBook: (item: LibraryItem) => void;
  grammarRequest: { id: string; key: number } | null;
  toolRequest: { id: BlancToolId; key: number } | null;
  /** False while the shell keeps the toolbox mounted behind another tab. */
  visible?: boolean;
}) {
  const { t } = useT();
  const blancTools = useBlancTools();
  const mechSettings = useBlancMechSettings();
  const warm = useWarmTools();
  const [toolboxSettings, setToolboxSettings] = useState<ToolboxSettings>(() => loadToolboxSettings());
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() => loadToolboxSettings().sidebarExpanded);
  const [favorites, setFavorites] = useState<BlancToolId[]>(() =>
    readFavorites(loadToolboxSettings().favoriteTools),
  );
  const [recent, setRecent] = useState<BlancToolId[]>(() => readToolList(BLANC_RECENT_TOOLS_KEY));
  // The tool to land on when nothing more specific applies: the user's default
  // tool (any Blanc tool, not only registry modules), else the dictionary.
  const fallbackTool = (): BlancToolId => {
    const configured = loadToolboxSettings().defaultTool;
    return isBlancToolId(configured) ? configured : DEFAULT_BLANC_TOOL;
  };
  const [tool, setTool] = useState<BlancToolId>(() => {
    try {
      const savedSettings = loadToolboxSettings();
      if (!savedSettings.restoreLastTool) return fallbackTool();
      const saved = window.localStorage.getItem(BLANC_LAST_TOOL_KEY);
      return isBlancToolId(saved) ? saved : fallbackTool();
    } catch {
      return DEFAULT_BLANC_TOOL;
    }
  });
  const [openTabs, setOpenTabs] = useState<BlancToolId[]>(() => {
    try {
      if (!loadToolboxSettings().restoreTabs) return [];
      const savedTabs = readToolList(BLANC_OPEN_TABS_KEY);
      if (savedTabs.length) return savedTabs.slice(-6);
      const saved = window.localStorage.getItem(BLANC_LAST_TOOL_KEY);
      return [isBlancToolId(saved) ? saved : fallbackTool()];
    } catch {
      return [DEFAULT_BLANC_TOOL];
    }
  });
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (haystack: string): boolean =>
    toolboxSettings.fuzzySearch
      ? fuzzyIncludes(haystack.toLowerCase(), normalizedQuery)
      : haystack.toLowerCase().includes(normalizedQuery);
  const activeTool = blancTools.find((item) => item.id === tool) ?? blancTools[0];
  const matchingTools = blancTools.filter((item) => {
    // The enabled/hidden lists are `ToolboxModuleId[]` and are re-sanitised
    // against TOOLBOX_MODULES on every load, so a Blanc-only id can never be a
    // member of one. Gating on them by name hid all nine Pillar 2 ports; see
    // blancToolVisibility.ts for the measurement and the negative control.
    if (!isToolLaunchable(item.id, toolboxSettings, Boolean(normalizedQuery))) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      toolboxSettings.searchToolsByTitle ? item.label : '',
      toolboxSettings.searchToolDescriptions ? item.description : '',
      t(TOOL_CATEGORY_LABEL_KEYS[item.category]),
    ].join(' ');
    return matches(haystack);
  });
  // The user's rail order (Pillar 4) applies to browsing, not to searching:
  // reordering search hits before the maxSearchResults cap would let a pinned
  // tool push a better match off the end.
  const orderedTools = normalizedQuery
    ? matchingTools
    : (() => {
      const byId = new Map(matchingTools.map((item) => [item.id, item]));
      return orderToolIds(
        matchingTools.map((item) => item.id),
        toolboxSettings.toolOrder,
      ).flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    })();
  const visibleTools = orderedTools.slice(0, normalizedQuery ? toolboxSettings.maxSearchResults : undefined);
  // Section order is a user preference too (Pillar 4). Same partial-order rule
  // as tools: a category the user never moved keeps its default slot, so adding
  // one to TOOL_CATEGORY_ORDER later does not require touching saved settings.
  const orderedCategories = orderToolIds(TOOL_CATEGORY_ORDER, toolboxSettings.categoryOrder);
  // Alt+N labels, from the same list the slot commands open.
  const slotLabels = useMemo(() => {
    const labels = new Map<BlancToolId, string>();
    const bindings = new Map(getBindings().map((row) => [row.id, row.keys]));
    launcherToolOrder(blancTools, toolboxSettings).slice(0, LAUNCHER_SLOTS).forEach((item, index) => {
      const keys = bindings.get(`toolbox.openSlot${index + 1}`);
      if (keys) labels.set(item.id, formatKeysDisplay(keys));
    });
    return labels;
  }, [blancTools, toolboxSettings]);
  const commandBindings = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of getBindings()) map.set(row.id, row.keys);
    return map;
  }, [normalizedQuery]);
  const commandResults = normalizedQuery && toolboxSettings.searchCommands
    ? TOOLBOX_SHORTCUT_COMMANDS.filter((command) =>
      matches(`${command.name} ${command.description} ${command.id}`),
    ).slice(0, toolboxSettings.maxSearchResults)
    : [];

  useEffect(() => onToolboxSettingsChanged(setToolboxSettings), []);
  useEffect(() => {
    if (toolboxSettings.restoreTabs) writeToolList(BLANC_OPEN_TABS_KEY, openTabs);
  }, [openTabs, toolboxSettings.restoreTabs]);

  useEffect(() => {
    setFavorites(readFavorites(toolboxSettings.favoriteTools));
    if (!toolboxSettings.rememberSidebarState) setSidebarOpen(toolboxSettings.sidebarExpanded);
  }, [toolboxSettings]);

  const chooseTool = (next: BlancToolId): void => {
    setTool(next);
    setOpenTabs((current) => {
      if (!toolboxSettings.openToolsInTabs) return [next];
      const nextTabs = current.includes(next) ? current : [...current, next];
      return nextTabs.slice(-6);
    });
    const nextRecent = [next, ...recent.filter((id) => id !== next)].slice(0, toolboxSettings.maxRecentTools);
    setRecent(nextRecent);
    writeToolList(BLANC_RECENT_TOOLS_KEY, nextRecent);
    try {
      window.localStorage.setItem(BLANC_LAST_TOOL_KEY, next);
    } catch {
      /* ignore */
    }
  };

  // A deep link from outside the toolbox arrives as a prop rather than an
  // event, so it cannot be missed while this panel is still mounting. Keyed on
  // the request, never on `chooseTool`'s identity: that changes every render,
  // which would reopen the requested tool forever and pin the user to it.
  const toolRequestKey = toolRequest?.key ?? null;
  const toolRequestId = toolRequest?.id ?? null;
  // The panel can stay mounted behind another tab (memory budget), and its
  // effects re-run each time it is shown again: a request is applied once.
  const appliedToolRequest = useRef<number | null>(null);
  useEffect(() => {
    if (toolRequestKey === null || !toolRequestId || appliedToolRequest.current === toolRequestKey) return;
    appliedToolRequest.current = toolRequestKey;
    chooseTool(toolRequestId);
  }, [toolRequestKey, toolRequestId]);

  // Memory budget: the tool on screen is touched (most recent first); tools
  // past the warm window unload. Re-applied when the budget settings change.
  const pendingUnload = useRef<BlancToolId[]>([]);
  useEffect(() => {
    if (!visible) return undefined;
    touchWarmTool(tool);
    for (const id of pendingUnload.current.splice(0)) unloadWarmTool(id);
    return () => leaveToolbox();
  }, [tool, visible, mechSettings.warmToolLimit, mechSettings.keepWarm]);
  // Loaded = rendered. The tool on screen always is; hidden tools stay mounted
  // only while the budget keeps them. Stable (launcher) order, so a switch
  // never moves a mounted tool's DOM — an iframe would reload if it moved.
  const mountedTools = useMemo(() => {
    const ids = new Set<string>(warm.loaded);
    if (visible) ids.add(tool);
    return BLANC_TOOL_IDS.filter((id) => ids.has(id));
  }, [warm.loaded, tool, visible]);
  const keepWarmPinned = mechSettings.keepWarm.includes(tool);
  const toggleKeepWarm = (): void => {
    saveBlancMechSettings({
      keepWarm: keepWarmPinned
        ? mechSettings.keepWarm.filter((id) => id !== tool)
        : [...mechSettings.keepWarm, tool],
    });
  };

  const closeToolTab = (closing: BlancToolId): void => {
    // Closing a tab means done with it: unload it rather than keep it warm.
    if (closing === tool) pendingUnload.current.push(closing);
    else unloadWarmTool(closing);
    setOpenTabs((current) => {
      const nextTabs = current.filter((id) => id !== closing);
      if (closing === tool) {
        const fallback = nextTabs[nextTabs.length - 1] ?? fallbackTool();
        setTool(fallback);
        try {
          window.localStorage.setItem(BLANC_LAST_TOOL_KEY, fallback);
        } catch {
          /* ignore */
        }
        return nextTabs.length ? nextTabs : [fallback];
      }
      return nextTabs.length ? nextTabs : [fallbackTool()];
    });
  };

  // Pinning a Blanc-only tool is no longer refused: `favoriteTools` cannot
  // name one, so Blanc's own list carries it and `mergeFavoriteTools` puts the
  // two back together on read. Only the ids the settings schema can represent
  // are written to settings; sending the rest would be sanitised away and the
  // resulting change event would undo the pin a tick after the click.
  const toggleFavorite = (id: BlancToolId): void => {
    const next = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [id, ...favorites].slice(0, 8);
    setFavorites(next);
    writeToolList(BLANC_FAVORITE_TOOLS_KEY, next);
    saveToolboxSettings({
      favoriteTools: next.filter((item): item is ToolboxModuleId => isRegistryGovernedTool(item)),
    });
  };

  const setSidebar = (open: boolean): void => {
    setSidebarOpen(open);
    if (toolboxSettings.rememberSidebarState) saveToolboxSettings({ sidebarExpanded: open });
  };

  useEffect(() => {
    const onSelectTool = (event: Event): void => {
      const next = (event as CustomEvent<BlancToolId>).detail;
      if (BLANC_TOOL_IDS.includes(next)) chooseTool(next);
    };
    const onFocusSearch = (): void => {
      document.querySelector<HTMLInputElement>('.blanc-tool-search input')?.focus();
    };
    const onCommand = (event: Event): void => {
      const id = (event as CustomEvent<string>).detail;
      // `toolbox.search` is the shell's: it opens Master search. Focusing the
      // launcher field as well made one Ctrl+F do two things at once.
      if (id === 'toolbox.focusSidebar') document.querySelector<HTMLButtonElement>('.blanc-tool-launch')?.focus();
      if (id === 'toolbox.openRecent') document.querySelector<HTMLButtonElement>('.blanc-tool-recent button')?.focus();
      if (id === 'toolbox.openFavorites') document.querySelector<HTMLButtonElement>('.blanc-tool-strip button')?.focus();
      if (id === 'toolbox.toggleCompactMode') setSidebar(!sidebarOpen);
      if (id === 'toolbox.nextTool' && openTabs.length > 1) {
        const index = openTabs.indexOf(tool);
        chooseTool(openTabs[(index + 1) % openTabs.length]);
      }
      if (id === 'toolbox.previousTool' && openTabs.length > 1) {
        const index = openTabs.indexOf(tool);
        chooseTool(openTabs[(index - 1 + openTabs.length) % openTabs.length]);
      }
      if (id === 'toolbox.closeActiveTool') closeToolTab(tool);
      if (id === 'toolbox.reopenLastTool') {
        const last = recent.find((id) => id !== tool);
        if (last) chooseTool(last);
      }
    };
    window.addEventListener('toolbox:select-tool', onSelectTool);
    window.addEventListener('toolbox:focus-search', onFocusSearch);
    window.addEventListener('toolbox:command', onCommand);
    return () => {
      window.removeEventListener('toolbox:select-tool', onSelectTool);
      window.removeEventListener('toolbox:focus-search', onFocusSearch);
      window.removeEventListener('toolbox:command', onCommand);
    };
  }, [tool, openTabs, recent, sidebarOpen, toolboxSettings]);

  const tip = (text: string): string | undefined => (toolboxSettings.showTooltips ? text : undefined);

  // The tab strip is workspace chrome, never content: it must live OUTSIDE
  // .blanc-embedded-view, whose `> *` children stretch to full height.
  const tabStrip = (
    <div className="blanc-tool-tabs" role="tablist" aria-label={t('blanc.tb.openTools')}>
      {openTabs.map((id) => {
        const item = blancTools.find((candidate) => candidate.id === id);
        if (!item) return null;
        // The close control is a real button BESIDE the tab, not a
        // `span role="button"` nested inside it: interactive content inside a
        // <button> is invalid and screen readers flatten it into the tab name.
        // Delete on a focused tab closes it as well.
        return (
          <div key={id} role="presentation" className="blanc-tool-tab">
            <button
              type="button"
              role="tab"
              aria-selected={tool === id}
              className={tool === id ? 'active' : ''}
              title={tip(t('blanc.tb.switchTo', { name: item.label }))}
              onClick={() => chooseTool(id)}
              onKeyDown={(event) => {
                if (event.key !== 'Delete') return;
                event.preventDefault();
                closeToolTab(id);
              }}
            >
              {toolboxSettings.showTabIcons && <Icon name={item.icon} size={13} />}
              <span>{item.label}</span>
            </button>
            <button
              type="button"
              className="blanc-tab-close"
              title={tip(t('blanc.tb.closeTab', { name: item.label }))}
              aria-label={t('blanc.tb.closeTab', { name: item.label })}
              onClick={() => closeToolTab(id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );

  if (!toolboxSettings.enabled) {
    return (
      <div className="blanc-panel blanc-tools-panel">
        <fieldset>
          <legend>{t('blanc.tb.disabledTitle')}</legend>
          <p className="blanc-note">{t('blanc.tb.disabledNote')}</p>
          <div className="blanc-row-actions">
            <button type="button" onClick={() => saveToolboxSettings({ enabled: true })}>
              {t('blanc.tb.enable')}
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: 'settings' }))}
            >
              {t('blanc.tb.openSettings')}
            </button>
          </div>
        </fieldset>
      </div>
    );
  }

  return (
    <div
      className={`blanc-panel blanc-tools-panel${sidebarOpen ? '' : ' is-rail'} density-${toolboxSettings.density} launcher-${toolboxSettings.launcherStyle}`}
      style={{ '--blanc-tool-sidebar-width': `${toolboxSettings.sidebarWidth}px` } as CSSProperties}
    >
      {/* The panel title is already shown in the Blanc top strip; repeating
          "Toolbox" here wasted a header row, especially in narrow windows. */}
      <header className="blanc-toolbox-header">
        <label className="blanc-tool-search">
          <Icon name="search" size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('blanc.tb.searchPlaceholder')}
            aria-label={t('blanc.tb.searchAria')}
          />
        </label>
        {/* Icon-only buttons carry an aria-label: `title` is dropped when
            tooltips are off, which left them with no accessible name. */}
        <button
          type="button"
          className="blanc-icon-btn"
          title={tip(sidebarOpen ? t('blanc.tb.collapseLauncher') : t('blanc.tb.expandLauncher'))}
          aria-label={sidebarOpen ? t('blanc.tb.collapseLauncher') : t('blanc.tb.expandLauncher')}
          aria-expanded={sidebarOpen}
          onClick={() => setSidebar(!sidebarOpen)}
        >
          <Icon name="settings" size={15} />
        </button>
      </header>

      <div className="blanc-workbench">
        <aside className="blanc-tool-launcher" aria-label={t('blanc.tb.launcher')}>
          {toolboxSettings.showFavoritesSection && favorites.length > 0 && (
            <div className="blanc-tool-strip" aria-label={t('blanc.tb.favorites')}>
              {favorites.map((id) => {
                const item = blancTools.find((candidate) => candidate.id === id);
                if (!item) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={tool === id ? 'active' : ''}
                    title={tip(t('blanc.tb.favorite', { name: item.label }))}
                    aria-label={t('blanc.tb.favorite', { name: item.label })}
                    aria-pressed={tool === id}
                    onClick={() => chooseTool(id)}
                  >
                    <Icon name={item.icon} size={15} />
                  </button>
                );
              })}
            </div>
          )}

          {toolboxSettings.showRecentToolsSection && recent.length > 0 && (
            <div className="blanc-tool-recent">
              <span>{t('blanc.tb.recent')}</span>
              {recent.map((id) => {
                const item = blancTools.find((candidate) => candidate.id === id);
                if (!item) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={tool === id ? 'active' : ''}
                    title={tip(item.label)}
                    onClick={() => chooseTool(id)}
                  >
                    <Icon name={item.icon} size={14} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {orderedCategories.map((category) => {
            const tools = visibleTools.filter((item) => item.category === category);
            if (!tools.length) return null;
            return (
              <section key={category} className="blanc-tool-section">
                {toolboxSettings.showCategoryHeaders && <h3>{t(TOOL_CATEGORY_LABEL_KEYS[category])}</h3>}
                {tools.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`blanc-tool-launch${tool === item.id ? ' active' : ''}`}
                    title={tip(`${item.label}: ${item.description}`)}
                    aria-current={tool === item.id ? 'true' : undefined}
                    onClick={() => chooseTool(item.id)}
                  >
                    <Icon name={item.icon} size={16} />
                    <span>
                      <strong>{item.label}</strong>
                      {toolboxSettings.showToolDescriptions && <small>{item.description}</small>}
                    </span>
                    {item.id !== tool && mountedTools.includes(item.id) && (
                      <span className="blanc-warm-dot" title={t('blanc.mech.warm.warm')}>
                        <span className="sr-only">{t('blanc.mech.warm.loadedSr')}</span>
                      </span>
                    )}
                    {!normalizedQuery && slotLabels.get(item.id) && <kbd>{slotLabels.get(item.id)}</kbd>}
                  </button>
                ))}
              </section>
            );
          })}

          {commandResults.length > 0 && (
            <section className="blanc-tool-section" aria-label={t('blanc.tb.matchingCommands')}>
              {toolboxSettings.showCategoryHeaders && <h3>{t('blanc.tb.commands')}</h3>}
              {commandResults.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  className="blanc-tool-launch blanc-command-result"
                  title={tip(commandNote(command.id, command.description, t) ?? command.description)}
                  onClick={() => runCommand(command.id)}
                >
                  <Icon name="wrench" size={16} />
                  <span>
                    <strong>{commandLabel(command.id, command.name, t)}</strong>
                    {toolboxSettings.showCommandDescriptions && <small>{commandNote(command.id, command.description, t) ?? command.description}</small>}
                  </span>
                  {toolboxSettings.showCommandShortcutLabels && commandBindings.get(command.id) && (
                    <kbd>{formatKeysDisplay(commandBindings.get(command.id) ?? '')}</kbd>
                  )}
                </button>
              ))}
            </section>
          )}

          {normalizedQuery && visibleTools.length === 0 && commandResults.length === 0 && (
            <p className="blanc-note">{t('blanc.tb.noMatch', { query: query.trim() })}</p>
          )}
        </aside>

        <section className="blanc-tool-workspace" aria-label={activeTool.label}>
          <header className="blanc-active-tool-head">
            <div>
              <span className="blanc-tool-kicker">{t(TOOL_CATEGORY_LABEL_KEYS[activeTool.category])}</span>
              <h2>{activeTool.label}</h2>
            {toolboxSettings.showToolDescriptions && <p>{activeTool.description}</p>}
            </div>
            <div className="blanc-row-actions">
              <button
                type="button"
                className={`blanc-icon-btn${favorites.includes(activeTool.id) ? ' active' : ''}`}
                title={tip(t(favorites.includes(activeTool.id) ? 'blanc.tb.unpin' : 'blanc.tb.pin', { name: activeTool.label }))}
                aria-label={t(favorites.includes(activeTool.id) ? 'blanc.tb.unpin' : 'blanc.tb.pin', { name: activeTool.label })}
                aria-pressed={favorites.includes(activeTool.id)}
                onClick={() => toggleFavorite(activeTool.id)}
              >
                <Icon name="bookmark" size={15} />
              </button>
              {/* Memory budget: keep this tool loaded whatever the warm window says. */}
              <button
                type="button"
                className={`blanc-icon-btn${keepWarmPinned ? ' active' : ''}`}
                title={tip(t(keepWarmPinned ? 'blanc.mech.warm.unpinNamed' : 'blanc.mech.warm.pinNamed', { name: activeTool.label }))}
                aria-label={t(keepWarmPinned ? 'blanc.mech.warm.unpinNamed' : 'blanc.mech.warm.pinNamed', { name: activeTool.label })}
                aria-pressed={keepWarmPinned}
                onClick={toggleKeepWarm}
              >
                <Icon name="pin" size={15} />
              </button>
              <span className="blanc-warm-count" aria-live="polite">
                {t('blanc.mech.warm.count', { count: mountedTools.length })}
              </span>
            </div>
          </header>
          {toolboxSettings.openToolsInTabs && toolboxSettings.tabPosition === 'top' && tabStrip}
          <div className="blanc-embedded-view">
            {/*
              The boundary is INSIDE the tool detail and keyed on the tool, so a
              panel that throws loses only itself: the rail, the tabs and the
              other 43 tools survive, and switching tools mounts a fresh
              boundary rather than showing the previous tool's failure. It sits
              OUTSIDE `Suspense` on purpose — a lazy chunk that fails to load
              throws during render of the boundary's child, and a boundary
              nested under the fallback would never see it.

              Each loaded tool has its own boundary inside an <Activity>: the one
              on screen is visible, warm ones are hidden (state and DOM kept,
              effects torn down until shown again). Unloaded tools are not here.
            */}
            {mountedTools.map((id) => (
              <Activity key={id} mode={id === tool && visible ? 'visible' : 'hidden'}>
                <BlancToolSlot
                  tool={id}
                  label={blancTools.find((item) => item.id === id)?.label ?? id}
                  onOpenBook={onOpenBook}
                  grammarRequest={grammarRequest}
                />
              </Activity>
            ))}
          </div>
          {toolboxSettings.openToolsInTabs && toolboxSettings.tabPosition === 'bottom' && tabStrip}
        </section>
      </div>
    </div>
  );
}

function ToolboxCoveragePanel() {
  const { t } = useT();
  const modules = useMemo(() => listToolboxModules(), []);
  const ready = modules.filter((module) => module.status === 'ready').length;
  const experimental = modules.filter((module) => module.status === 'experimental').length;
  const adapterNeeded = modules.filter((module) => module.status === 'adapter-needed').length;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.refine.coverage.legend')}</legend>
        <p className="blanc-note">{t('blanc.refine.coverage.note')}</p>
        <div className="blanc-status-row">
          <span>{t('blanc.refine.coverage.ready', { count: ready })}</span>
          <span>{t('blanc.refine.coverage.experimental', { count: experimental })}</span>
          <span>{t('blanc.refine.coverage.adapterNeeded', { count: adapterNeeded })}</span>
          <span>{t('blanc.refine.coverage.total', { count: modules.length })}</span>
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('blanc.refine.coverage.modules')}</legend>
        <div className="blanc-table-scroll">
          <table className="blanc-coverage-table">
            <thead>
              <tr>
                <th>{t('blanc.refine.coverage.col.feature')}</th>
                <th>{t('blanc.refine.coverage.col.status')}</th>
                <th>{t('blanc.settings.col.category')}</th>
                <th>{t('blanc.refine.coverage.col.blanc')}</th>
                <th>{t('blanc.refine.coverage.col.studyOs')}</th>
                <th>{t('blanc.refine.coverage.col.side')}</th>
                <th>{t('blanc.refine.coverage.col.shortcut')}</th>
                <th>{t('blanc.refine.coverage.col.automation')}</th>
                <th>{t('blanc.refine.coverage.col.adapter')}</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module.id}>
                  <td>{blancToolLabel(t, module.id)}</td>
                  <td><span className={`blanc-status ${module.status}`}>{moduleStatusLabel(module.status, t)}</span></td>
                  <td>{t(`blanc.tb.modcat.${module.category}`)}</td>
                  <td>{module.appearsInBlanc ? t('blanc.refine.coverage.yes') : t('blanc.refine.coverage.later')}</td>
                  <td>{module.appearsInNormalOs ? t('blanc.refine.coverage.yes') : t('blanc.refine.coverage.later')}</td>
                  <td>{module.launchContexts.includes('side-agent') ? t('blanc.refine.coverage.yes') : '-'}</td>
                  <td>{module.supportsGlobalShortcut ? t('blanc.refine.coverage.yes') : '-'}</td>
                  <td>{module.supportsAutomation ? t('blanc.refine.coverage.yes') : '-'}</td>
                  {/* The adapter strategy is an identifier (built-in, existing-service …), kept verbatim. */}
                  <td><code>{module.externalAdapter.strategy}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  );
}

function CalculatorPanel() {
  const { t } = useT();
  const [expression, setExpression] = useState('2 + 2');
  const result = useMemo(() => calculateToolboxExpression(expression), [expression]);
  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.calculator')}</legend>
        <label>
          {t('blanc.tb.expression')}
          <input
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder={t('blanc.tb.expressionExample')}
          />
        </label>
        <div className="blanc-result-box">
          {result.ok && typeof result.value === 'number'
            ? formatToolboxNumber(result.value)
            : toolboxErrorText(result.error, t)}
        </div>
        <p className="blanc-note">{t('blanc.tb.calcNote')}</p>
      </fieldset>
    </div>
  );
}

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/**
 * The shared Toolbox helpers (toolboxUtilities / toolboxSettings) return their
 * errors in English; these are the ones the panels below show, in the UI
 * language. An unknown message passes through unchanged.
 */
const TOOLBOX_ERROR_KEYS: Record<string, string> = {
  'Enter an expression.': 'blanc.tb.err.enterExpression',
  'Only numbers and basic operators are supported.': 'blanc.tb.err.onlyBasic',
  'Invalid exponent operator.': 'blanc.tb.err.exponent',
  'Expression did not produce a finite number.': 'blanc.tb.err.notFinite',
  'Invalid expression.': 'blanc.tb.err.invalid',
  'Enter a finite value.': 'blanc.tb.err.finiteValue',
  'Choose units from the same category.': 'blanc.tb.err.sameCategory',
  'Not a Toolbox settings export.': 'blanc.tb.err.settingsExport',
};

function toolboxErrorText(message: string | undefined, t: TFn): string {
  if (!message) return '';
  const key = TOOLBOX_ERROR_KEYS[message];
  return key ? t(key) : message;
}

/** A unit's name in the UI language (the registry label is English). */
function unitLabel(id: string, fallback: string, t: TFn): string {
  const key = `blanc.unit.${id}`;
  const out = t(key);
  return out === key ? fallback : out;
}

/** `t(key)`, or the given English when the catalogue has no such key (module data added later). */
function keyOr(t: TFn, key: string, fallback: string): string {
  const out = t(key);
  return out === key ? fallback : out;
}

const MODULE_STATUS_KEYS: Record<string, string> = {
  ready: 'blanc.tb.status.ready',
  existing: 'blanc.tb.status.existing',
  planned: 'blanc.tb.status.planned',
  'adapter-needed': 'blanc.tb.status.adapterNeeded',
  experimental: 'blanc.tb.status.experimental',
};

function moduleStatusLabel(status: string, t: TFn): string {
  const key = MODULE_STATUS_KEYS[status];
  return key ? t(key) : status;
}

const UNIT_OPTIONS = Object.entries(TOOLBOX_UNITS) as Array<[ToolboxUnit, (typeof TOOLBOX_UNITS)[ToolboxUnit]]>;

function UnitConverterPanel() {
  const { t } = useT();
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState<ToolboxUnit>('m');
  const [to, setTo] = useState<ToolboxUnit>('cm');
  const numericValue = Number(value);
  const result = convertToolboxUnit(numericValue, from, to);
  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.unitConverter')}</legend>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.tb.value')}
            <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            {t('blanc.tb.from')}
            <select value={from} onChange={(event) => setFrom(event.target.value as ToolboxUnit)}>
              {UNIT_OPTIONS.map(([id, unit]) => (
                <option key={id} value={id}>{unitLabel(id, unit.label, t)}</option>
              ))}
            </select>
          </label>
          <label>
            {t('blanc.tb.to')}
            <select value={to} onChange={(event) => setTo(event.target.value as ToolboxUnit)}>
              {UNIT_OPTIONS.map(([id, unit]) => (
                <option key={id} value={id}>{unitLabel(id, unit.label, t)}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="blanc-result-box">
          {result.ok && typeof result.value === 'number'
            ? t('blanc.refine.unitResult', {
              value: formatToolboxNumber(result.value),
              unit: unitLabel(to, TOOLBOX_UNITS[to].label, t),
            })
            : toolboxErrorText(result.error, t)}
        </div>
        <p className="blanc-note">{t('blanc.tb.unitNote')}</p>
      </fieldset>
    </div>
  );
}

function formatTimerSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * The focus timer's live state, re-rendering once a second only while it runs
 * and the window is visible (a hidden window has nothing to repaint; the
 * deadline keeps the time exact regardless).
 */
function useFocusTimer(): FocusTimerState {
  const [timer, setTimer] = useState<FocusTimerState>(() => getFocusTimer());
  const [, setTick] = useState(0);
  useEffect(() => subscribeFocusTimer(setTimer), []);
  useEffect(() => {
    if (!timer.running) return undefined;
    let id: number | null = null;
    const start = (): void => {
      if (id === null && !document.hidden) id = window.setInterval(() => setTick((n) => n + 1), 1000);
    };
    const stop = (): void => {
      if (id !== null) window.clearInterval(id);
      id = null;
    };
    const onVisibility = (): void => {
      if (document.hidden) stop();
      else {
        setTick((n) => n + 1);
        start();
      }
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timer.running]);
  return timer;
}

/** The running/paused focus timer in the top bar, so it is visible from any tool. */
function FocusTimerChip({ onOpen }: { onOpen: () => void }) {
  const { t } = useT();
  const timer = useFocusTimer();
  if (!focusTimerActive(timer)) return null;
  const time = formatTimerSeconds(focusTimerSeconds(timer));
  return (
    <button
      type="button"
      className={`blanc-timer-chip${timer.running ? '' : ' is-paused'}`}
      onClick={onOpen}
      aria-label={t(timer.running ? 'blanc.refine.timerChipRunning' : 'blanc.refine.timerChipPaused', { time })}
      title={t(timer.running ? 'blanc.refine.timerChipRunning' : 'blanc.refine.timerChipPaused', { time })}
    >
      <Icon name="calendar" size={13} />
      <time>{time}</time>
    </button>
  );
}

function FocusTimerPanel() {
  const { t } = useT();
  const timer = useFocusTimer();
  const { mode, minutes, running, laps, notify } = timer;
  const seconds = focusTimerSeconds(timer);

  return (
    <div className="blanc-focus-workspace">
      <section className="blanc-focus-main">
        <div className="blanc-segmented" role="group" aria-label={t('blanc.tb.timerMode')}>
          <button type="button" className={mode === 'countdown' ? 'active' : ''} aria-pressed={mode === 'countdown'} onClick={() => setFocusTimerMode('countdown')} title={t('blanc.tb.countdown')}>{t('blanc.tb.countdown')}</button>
          <button type="button" className={mode === 'stopwatch' ? 'active' : ''} aria-pressed={mode === 'stopwatch'} onClick={() => setFocusTimerMode('stopwatch')} title={t('blanc.tb.stopwatch')}>{t('blanc.tb.stopwatch')}</button>
        </div>
        <div className="blanc-timer-display" role="timer" aria-live="off">{formatTimerSeconds(seconds)}</div>
        <div className="blanc-focus-actions">
          <button type="button" className="blanc-primary-action" onClick={toggleFocusTimer} title={running ? t('blanc.tb.pauseTimer') : t('blanc.tb.startTimer')}>
            {running ? t('blanc.tb.pause') : t('blanc.tb.start')}
          </button>
          <button type="button" onClick={resetFocusTimer} title={t('blanc.tb.resetTimer')}>{t('blanc.tb.reset')}</button>
          <button type="button" onClick={recordFocusTimerLap} title={t('blanc.tb.recordLap')}>{t('blanc.tb.lap')}</button>
        </div>
        <p className="blanc-note">{t('blanc.tb.timerKeys', { startPause: 'Ctrl+Shift+Space', reset: 'Ctrl+Shift+Backspace' })}</p>
        <p className="blanc-note">{t('blanc.refine.timerKeepsRunning')}</p>
      </section>

      <aside className="blanc-focus-side">
        <section>
          <h3>{t('blanc.tb.presets')}</h3>
          <div className="blanc-preset-grid">
            {[5, 15, 25, 45].map((preset) => (
              <button
                key={preset}
                type="button"
                className={minutes === preset && mode === 'countdown' ? 'active' : ''}
                aria-pressed={minutes === preset && mode === 'countdown'}
                onClick={() => {
                  if (mode !== 'countdown') setFocusTimerMode('countdown');
                  if (getFocusTimer().running) pauseFocusTimer();
                  setFocusTimerMinutes(preset);
                  resetFocusTimer();
                }}
                title={t('blanc.tb.presetTitle', { count: preset })}
              >
                {t('blanc.tb.presetLabel', { count: preset })}
              </button>
            ))}
          </div>
          {mode === 'countdown' && (
            <label className="blanc-focus-custom">
              {t('blanc.tb.customMinutes')}
              <input
                type="number"
                min={1}
                max={240}
                value={minutes}
                onChange={(event) => setFocusTimerMinutes(Number(event.target.value) || 1)}
              />
            </label>
          )}
        </section>
        <section>
          <h3>{t('blanc.tb.options')}</h3>
          <label className="blanc-check">
            <input type="checkbox" checked={notify} onChange={(event) => setFocusTimerNotify(event.target.checked)} />
            <span>{t('blanc.tb.completionNotice')}</span>
          </label>
        </section>
        <section>
          <h3>{t('blanc.tb.laps')}</h3>
          {laps.length ? (
            <ol className="blanc-lap-list">
              {laps.map((lap, index) => (
                <li key={`${lap}-${index}`}>{formatTimerSeconds(lap)}</li>
              ))}
            </ol>
          ) : (
            <p className="blanc-note">{t('blanc.tb.noLaps')}</p>
          )}
        </section>
      </aside>
    </div>
  );
}

interface BlancSystemMetrics {
  cpuLoad: number;
  freemem: number;
  totalmem: number;
  platform: string;
  uptime: number;
  battery?: number | null;
  onBattery?: boolean | null;
}

interface BlancStorageEstimate {
  usage: number;
  quota: number;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

function formatUptime(seconds: number, t: TFn): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  // The unit letters were English ("3d 4h 5m") in every UI language.
  if (days > 0) return t('blanc.refine.uptime.dhm', { d: days, h: hours, m: minutes });
  if (hours > 0) return t('blanc.refine.uptime.hm', { h: hours, m: minutes });
  return t('blanc.refine.uptime.m', { m: minutes });
}

function BlancMeter({
  label,
  value,
  detail,
}: {
  label: string;
  value: number;
  detail: string;
}) {
  const pct = clampPercent(value);
  return (
    <div className="blanc-meter">
      <div className="blanc-meter-head">
        <span>{label}</span>
        <span>{Math.round(pct)}%</span>
      </div>
      <progress value={pct} max={100} aria-label={label} />
      <span className="blanc-note">{detail}</span>
    </div>
  );
}

function SystemMonitorPanel() {
  const { t } = useT();
  const [metrics, setMetrics] = useState<BlancSystemMetrics | null>(null);
  const [storage, setStorage] = useState<BlancStorageEstimate | null>(null);
  const [appMemory, setAppMemory] = useState<AppMemoryReport | null>(null);
  const [status, setStatus] = useState(() => t('blanc.tb.metricsLoading'));

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.systemGetMetrics();
      setMetrics(next);
      setStatus(t('blanc.tb.metricsRefreshed'));
    } catch {
      setMetrics(null);
      setStatus(t('blanc.tb.metricsUnavailable'));
    }
    try {
      setAppMemory(await window.api.appMemoryMetrics());
    } catch {
      setAppMemory(null);
    }
    try {
      const estimate = await navigator.storage?.estimate?.();
      setStorage(
        estimate?.usage != null && estimate.quota != null
          ? { usage: estimate.usage, quota: estimate.quota }
          : null,
      );
    } catch {
      setStorage(null);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);
  // Polls only while the window is visible: a monitor that burns CPU in a
  // minimised window measures itself.
  useVisibleInterval(() => void refresh(), 3000);

  const [battery, setBattery] = useState<{ level: number; charging: boolean } | null>(null);
  useEffect(() => {
    type BatteryLike = EventTarget & { level: number; charging: boolean; chargingTime: number };
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
    let alive = true;
    let manager: BatteryLike | null = null;
    const read = (): void => {
      if (!alive || !manager) return;
      // Chromium reports a computer with no battery as full, charging and done
      // charging (chargingTime 0) — that is "no battery", not a 100% meter.
      const none = manager.charging && manager.level === 1 && manager.chargingTime === 0;
      setBattery(none ? null : { level: manager.level, charging: manager.charging });
    };
    void nav.getBattery?.()
      .then((result) => {
        manager = result;
        read();
        result.addEventListener('levelchange', read);
        result.addEventListener('chargingchange', read);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      manager?.removeEventListener('levelchange', read);
      manager?.removeEventListener('chargingchange', read);
    };
  }, []);

  const ramUsed = metrics ? Math.max(0, metrics.totalmem - metrics.freemem) : 0;
  const ramPct = metrics && metrics.totalmem > 0 ? (ramUsed / metrics.totalmem) * 100 : 0;
  const cpuPct = metrics ? metrics.cpuLoad * 100 : 0;
  const storagePct = storage && storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0;
  // Main cannot read a battery level (Electron exposes only on/off battery), so
  // the level comes from the renderer's Battery API when main has none.
  const batteryPct =
    metrics?.battery != null ? metrics.battery * 100 : battery ? battery.level * 100 : null;
  const batteryOnPower = metrics?.battery != null ? !metrics.onBattery : (battery?.charging ?? true);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.systemMonitor')}</legend>
        <p className="blanc-note">{t('blanc.tb.systemNote')}</p>
        {metrics ? (
          <div className="blanc-monitor-grid">
            <BlancMeter label={t('blanc.tb.cpu')} value={cpuPct} detail={t('blanc.tb.cpuDetail')} />
            <BlancMeter
              label={t('blanc.tb.ram')}
              value={ramPct}
              detail={t('blanc.tb.usedOf', { used: formatBytes(ramUsed), total: formatBytes(metrics.totalmem) })}
            />
            {storage && (
              <BlancMeter
                label={t('blanc.tb.storage')}
                value={storagePct}
                detail={t('blanc.tb.storageDetail', { used: formatBytes(storage.usage), total: formatBytes(storage.quota) })}
              />
            )}
            {batteryPct != null && (
              <BlancMeter
                label={t('blanc.tb.battery')}
                value={batteryPct}
                detail={batteryOnPower ? t('blanc.tb.pluggedIn') : t('blanc.tb.onBattery')}
              />
            )}
          </div>
        ) : (
          <p className="blanc-error">{status}</p>
        )}
        <div className="blanc-status-row">
          {metrics && <span>{t('blanc.tb.platform', { name: metrics.platform })}</span>}
          {metrics && <span>{t('blanc.tb.uptime', { time: formatUptime(metrics.uptime, t) })}</span>}
          <span>{status}</span>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void refresh()}>{t('blanc.tb.refresh')}</button>
        </div>
      </fieldset>
      <AppMemoryReadout report={appMemory} />
    </div>
  );
}

const APP_PROCESS_ROLE_KEYS: Record<AppProcessRole, string> = {
  'study-os': 'blanc.refine.memory.role.studyOs',
  blanc: 'blanc.refine.memory.role.blanc',
  popout: 'blanc.refine.memory.role.popout',
  window: 'blanc.refine.memory.role.window',
  browser: 'blanc.refine.memory.role.browser',
  gpu: 'blanc.refine.memory.role.gpu',
  utility: 'blanc.refine.memory.role.utility',
  other: 'blanc.refine.memory.role.other',
};

/**
 * What THIS app is using, per process (Electron's `app.getAppMetrics()`), with
 * each renderer named by the window it draws — so "is Blanc actually lighter?"
 * has an answer on screen rather than in Task Manager.
 */
function AppMemoryReadout({ report }: { report: AppMemoryReport | null }) {
  const { t, lang } = useT();
  // Memory reads in whole megabytes (one decimal above a gigabyte), in the UI
  // language's number format — the generic byte formatter printed 9 decimals.
  const formatMemory = (bytes: number): string => {
    const nf = new Intl.NumberFormat(LANG_TAGS[lang], { maximumFractionDigits: bytes >= 1024 ** 3 ? 1 : 0 });
    return bytes >= 1024 ** 3 ? `${nf.format(bytes / 1024 ** 3)} GB` : `${nf.format(bytes / 1024 ** 2)} MB`;
  };
  const blanc = report?.processes.filter((p) => p.role === 'blanc') ?? [];
  const studyOs = report?.processes.filter((p) => p.role === 'study-os' || p.role === 'popout') ?? [];
  const sum = (rows: AppProcessMemory[]): number => rows.reduce((total, row) => total + row.workingSetBytes, 0);
  return (
    <fieldset>
      <legend>{t('blanc.refine.memory.legend')}</legend>
      {!report ? (
        <p className="blanc-note">{t('blanc.refine.memory.unavailable')}</p>
      ) : (
        <>
          <div className="blanc-status-row">
            <span>{t('blanc.refine.memory.total', { size: formatMemory(report.totalWorkingSetBytes) })}</span>
            {blanc.length > 0 && <span>{t('blanc.refine.memory.blancWindow', { size: formatMemory(sum(blanc)) })}</span>}
            <span>
              {studyOs.length > 0
                ? t('blanc.refine.memory.studyOsWindow', { size: formatMemory(sum(studyOs)) })
                : t('blanc.refine.memory.studyOsClosed')}
            </span>
          </div>
          <div className="blanc-table-scroll">
            <table className="blanc-memory-table">
              <thead>
                <tr>
                  <th>{t('blanc.refine.memory.colProcess')}</th>
                  <th className="num">{t('blanc.refine.memory.colMemory')}</th>
                  <th className="num">{t('blanc.refine.memory.colCpu')}</th>
                </tr>
              </thead>
              <tbody>
                {report.processes.map((process) => (
                  <tr key={process.pid}>
                    <td>
                      {t(APP_PROCESS_ROLE_KEYS[process.role])}
                      {(process.role === 'window' || process.role === 'popout') && process.label ? ` · ${process.label}` : ''}
                    </td>
                    <td className="num">{formatMemory(process.workingSetBytes)}</td>
                    <td className="num">{`${formatToolboxNumber(Math.round(process.cpuPercent * 10) / 10)}%`}</td>
                  </tr>
                ))}
                <tr className="is-total">
                  <td>{t('blanc.refine.memory.allProcesses')}</td>
                  <td className="num">{formatMemory(report.totalWorkingSetBytes)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
          <p className="blanc-note">{t('blanc.refine.memory.note')}</p>
        </>
      )}
    </fieldset>
  );
}

const BLANC_QUICK_NOTES_KEY = 'jp-study.blanc.quickNotes';
/** The book open when Blanc last closed ("Restore reader on launch"). */
const BLANC_LAST_BOOK_KEY = 'jp-study.blanc.lastBook';

/**
 * Settings > Memory had a "scratchpad" textarea that duplicated Quick Notes.
 * Its text is appended to Quick Notes once and the scratchpad emptied, so
 * nothing the user wrote is lost when the duplicate goes.
 */
function migrateScratchpadToQuickNotes(): void {
  const scratchpad = loadBlancMemory().scratchpad.trim();
  if (!scratchpad) return;
  try {
    const notes = window.localStorage.getItem(BLANC_QUICK_NOTES_KEY) ?? '';
    const merged = notes.trim() ? `${notes.replace(/\s+$/, '')}\n\n${scratchpad}` : scratchpad;
    // Cleared only once the merged text is safely written.
    if (writeLocalStorage(BLANC_QUICK_NOTES_KEY, merged)) saveBlancMemory({ scratchpad: '' });
  } catch {
    /* storage unavailable: leave the scratchpad where it is */
  }
}

function QuickNotesPanel() {
  const { t } = useT();
  const [notes, setNotes] = useState(() => {
    try {
      return window.localStorage.getItem(BLANC_QUICK_NOTES_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [saved, setSaved] = useState(false);
  const save = (next: string): void => {
    setNotes(next);
    try {
      window.localStorage.setItem(BLANC_QUICK_NOTES_KEY, next);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    } catch {
      setSaved(false);
    }
  };

  useEffect(() => registerCommandHandler('quickNotes.newNote', () => {
    save('');
    return true;
  }), []);
  // The `n` verb appends from Master search; a warm (kept-mounted) panel must
  // pick that up, or its next keystroke would write the old text back over it.
  useEffect(() => {
    const reload = (): void => {
      try {
        setNotes(window.localStorage.getItem(BLANC_QUICK_NOTES_KEY) ?? '');
      } catch {
        /* storage unavailable */
      }
    };
    reload();
    window.addEventListener(BLANC_QUICK_NOTES_EVENT, reload);
    return () => window.removeEventListener(BLANC_QUICK_NOTES_EVENT, reload);
  }, []);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.quickNotes')}</legend>
        <p className="blanc-warning">{t('blanc.tb.quickNotesWarning')}</p>
        <textarea
          rows={12}
          value={notes}
          aria-label={t('blanc.tb.quickNotes')}
          placeholder={t('blanc.tb.quickNotesPlaceholder')}
          onChange={(event) => save(event.target.value)}
        />
        <div className="blanc-row-actions">
          <button type="button" onClick={() => save('')}>{t('blanc.tb.clear')}</button>
          <span className="blanc-note">{saved ? t('blanc.tb.saved') : t('blanc.tb.characters', { count: notes.length })}</span>
        </div>
      </fieldset>
    </div>
  );
}

function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  return new Date(ms).toLocaleString(LANG_TAGS[getUiLang()], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function parseExtensions(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().replace(/^\./, '').toLowerCase())
    .filter(Boolean);
}

// toolboxFileSearch caps at up to 500 results (sanitizeToolboxFileSearchRequest)
// with honest truncation reporting; VirtualList keeps only the visible rows
// mounted regardless of how close to that cap a search lands.
const FILE_SEARCH_ROW_HEIGHT = 38;
const FILE_SEARCH_LIST_MAX_HEIGHT = 420;

function FileSearchPanel() {
  const { t } = useT();
  const [root, setRoot] = useState('');
  const [query, setQuery] = useState('');
  const [extensions, setExtensions] = useState('');
  const [results, setResults] = useState<ToolboxFileSearchResult[]>([]);
  const [scanned, setScanned] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(() => t('blanc.tb.fileSearchIdle'));

  const chooseFolder = async (): Promise<void> => {
    const picked = await window.api.toolboxPickSearchFolder();
    if (!picked) return;
    setRoot(picked);
    setStatus(t('blanc.tb.folderSelected'));
  };

  const search = async (): Promise<void> => {
    setBusy(true);
    setStatus(t('blanc.tb.searching'));
    setResults([]);
    try {
      const response = await window.api.toolboxFileSearch({
        root,
        query,
        extensions: parseExtensions(extensions),
        maxResults: 200,
        maxScanned: 30_000,
      });
      if (!response.ok) {
        // Main's reason is English and technical; it is kept as the detail of
        // a translated sentence rather than shown bare.
        setStatus(response.error ? t('blanc.refine.error.detail', { detail: response.error }) : t('blanc.tb.searchFailed'));
        return;
      }
      setResults(response.results ?? []);
      setScanned(response.scanned ?? 0);
      setTruncated(response.truncated === true);
      const summary = t('blanc.tb.searchSummary', { count: response.results?.length ?? 0, scanned: response.scanned ?? 0 });
      setStatus(t(response.truncated ? 'blanc.tb.searchCapped' : 'blanc.tb.searchDone', { summary }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('blanc.tb.searchFailed'));
    } finally {
      setBusy(false);
    }
  };

  const copyPath = async (filePath: string): Promise<void> => {
    await navigator.clipboard.writeText(filePath);
    setStatus(t('blanc.tb.pathCopied'));
  };

  const openPath = async (filePath: string): Promise<void> => {
    const error = await window.api.launchTarget(filePath);
    setStatus(error ? t('blanc.refine.error.detail', { detail: error }) : t('blanc.tb.opened'));
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.fileSearch')}</legend>
        <p className="blanc-note">{t('blanc.tb.fileSearchNote')}</p>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.tb.folder')}
            <input value={root} onChange={(event) => setRoot(event.target.value)} placeholder={t('blanc.tb.folderPlaceholder')} />
          </label>
          <label>
            {t('blanc.tb.nameContains')}
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('blanc.tb.namePlaceholder')} />
          </label>
          <label>
            {t('blanc.tb.extensions')}
            <input value={extensions} onChange={(event) => setExtensions(event.target.value)} placeholder={t('blanc.tb.extensionsPlaceholder')} />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void chooseFolder()}>{t('blanc.tb.chooseFolder')}</button>
          <button type="button" disabled={busy || !root.trim() || !query.trim()} onClick={() => void search()}>
            {busy ? t('blanc.tb.searching') : t('blanc.tb.search')}
          </button>
          <span className="blanc-note">{status}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.tb.results')}</legend>
        {results.length > 0 ? (
          // A plain <table> here would put up to 500 raw <tr> rows in the DOM
          // at once (toolboxFileSearch's cap) — VirtualList only keeps the
          // rows intersecting the viewport mounted, so this renders as a
          // CSS-grid row list instead of an HTML table.
          <div className="blanc-file-search-results">
            <div className="blanc-file-search-row blanc-file-search-header">
              <span>{t('blanc.tb.colName')}</span>
              <span>{t('blanc.tb.colType')}</span>
              <span>{t('blanc.tb.colSize')}</span>
              <span>{t('blanc.tb.colModified')}</span>
              <span>{t('blanc.tb.colActions')}</span>
            </div>
            <VirtualList
              items={results}
              itemHeight={FILE_SEARCH_ROW_HEIGHT}
              overscan={8}
              getKey={(result) => result.path}
              className="blanc-file-search-vlist"
              listRole="list"
              itemRole="listitem"
              style={{ height: Math.min(results.length * FILE_SEARCH_ROW_HEIGHT, FILE_SEARCH_LIST_MAX_HEIGHT) }}
              renderItem={(result) => (
                <div className="blanc-file-search-row">
                  <span className="blanc-file-search-name" title={result.path}>{result.name}</span>
                  <span>{result.isDirectory ? t('blanc.tb.typeFolder') : result.ext || t('blanc.tb.typeFile')}</span>
                  <span>{result.isDirectory ? '-' : formatBytes(result.size)}</span>
                  <span>{formatDateTime(result.modifiedMs)}</span>
                  <span className="blanc-row-actions">
                    <button type="button" onClick={() => void openPath(result.path)}>{t('blanc.tb.open')}</button>
                    <button type="button" onClick={() => void copyPath(result.path)}>{t('blanc.tb.copyPath')}</button>
                  </span>
                </div>
              )}
            />
          </div>
        ) : (
          <p className="blanc-note">{t('blanc.tb.noResults')}</p>
        )}
        <p className="blanc-note">
          {t('blanc.tb.scanned', { count: scanned })} {truncated ? t('blanc.tb.capHit') : t('blanc.tb.capOk')}
        </p>
      </fieldset>
    </div>
  );
}

async function sha256File(file: File): Promise<string> {
  const hash = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeHash(value: string): string {
  return value.trim().toLowerCase().replace(/^sha-?256[:=\s]+/i, '').replace(/\s+/g, '');
}

function HashCheckerPanel() {
  const { t } = useT();
  const [fileName, setFileName] = useState('');
  const [hash, setHash] = useState('');
  const [expected, setExpected] = useState('');
  const [status, setStatus] = useState('');
  const normalizedExpected = normalizeHash(expected);
  const hashMatches = Boolean(hash && normalizedExpected && hash === normalizedExpected);
  const hashMismatch = Boolean(hash && normalizedExpected && normalizedExpected.length >= 32 && hash !== normalizedExpected);

  const pickFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setFileName(file.name);
    setHash('');
    setStatus(t('blanc.tb.hashing'));
    try {
      setHash(await sha256File(file));
      setStatus(t('blanc.tb.hashReady'));
    } catch {
      setStatus(t('blanc.tb.hashFailed'));
    }
  };

  const copyHash = async (): Promise<void> => {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    setStatus(t('blanc.tb.hashCopied'));
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.hashChecker')}</legend>
        <p className="blanc-note">{t('blanc.tb.hashNote')}</p>
        <label>
          {t('blanc.tb.file')}
          <input type="file" onChange={(event) => void pickFile(event.target.files?.[0])} />
        </label>
        {fileName && <p className="blanc-note">{t('blanc.tb.selected', { name: fileName })}</p>}
        <label>
          {t('blanc.tb.expectedHash')}
          <input
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder={t('blanc.tb.expectedHashPlaceholder')}
          />
        </label>
        <div className="blanc-result-box is-wrap">
          {hash || status || t('blanc.tb.noHash')}
        </div>
        <div className="blanc-row-actions">
          <button type="button" disabled={!hash} onClick={() => void copyHash()}>{t('blanc.tb.copyHash')}</button>
          {hashMatches && <span className="blanc-status ready">{t('blanc.tb.match')}</span>}
          {hashMismatch && <span className="blanc-status adapter-needed">{t('blanc.tb.mismatch')}</span>}
          <span className="blanc-note">{status}</span>
        </div>
      </fieldset>
    </div>
  );
}

type ImageOutputFormat = 'image/png' | 'image/jpeg' | 'image/webp';

const IMAGE_FORMAT_EXT: Record<ImageOutputFormat, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

function imageOutputName(fileName: string, format: ImageOutputFormat): string {
  const base = fileName.replace(/\.[^.]+$/, '') || 'converted-image';
  return `${base}.${IMAGE_FORMAT_EXT[format]}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${formatToolboxNumber(bytes / 1024)} KB`;
  return `${formatToolboxNumber(bytes / 1024 ** 2)} MB`;
}

function ImageConverterPanel() {
  const { t } = useT();
  const [sourceName, setSourceName] = useState('');
  const [sourceSize, setSourceSize] = useState(0);
  const [sourceUrl, setSourceUrl] = useState('');
  const [outputUrl, setOutputUrl] = useState('');
  const [outputSize, setOutputSize] = useState(0);
  const [format, setFormat] = useState<ImageOutputFormat>('image/webp');
  const [quality, setQuality] = useState(0.86);
  const [status, setStatus] = useState(() => t('blanc.tb.chooseImage'));

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  }, [sourceUrl, outputUrl]);

  const chooseFile = (file: File | undefined): void => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus(t('blanc.tb.chooseImageFile'));
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setSourceName(file.name);
    setSourceSize(file.size);
    setSourceUrl(URL.createObjectURL(file));
    setOutputUrl('');
    setOutputSize(0);
    setStatus(t('blanc.tb.readyToConvert'));
  };

  const convert = async (): Promise<void> => {
    if (!sourceUrl) {
      setStatus(t('blanc.tb.chooseImageFirst'));
      return;
    }
    setStatus(t('blanc.tb.converting'));
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = sourceUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error(t('blanc.refine.image.canvasUnavailable'));
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
      });
      if (!blob) throw new Error(t('blanc.tb.convertFailed'));
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      setOutputSize(blob.size);
      setStatus(t('blanc.tb.converted'));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('blanc.tb.convertFailed'));
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tb.imageConverter')}</legend>
        <p className="blanc-note">{t('blanc.tb.imageNote')}</p>
        <label>
          {t('blanc.tb.image')}
          <input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
        <div className="blanc-form-grid">
          <label>
            {t('blanc.tb.output')}
            <select value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select>
          </label>
          <label>
            {t('blanc.tb.quality')}
            <input
              type="range"
              min={0.4}
              max={1}
              step={0.01}
              value={quality}
              disabled={format === 'image/png'}
              onChange={(event) => setQuality(Number(event.target.value))}
            />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" disabled={!sourceUrl} onClick={() => void convert()}>{t('blanc.tb.convert')}</button>
          {outputUrl && (
            <a className="blanc-file-link" href={outputUrl} download={imageOutputName(sourceName, format)}>
              {t('blanc.tb.saveFile', { name: imageOutputName(sourceName, format) })}
            </a>
          )}
          <span className="blanc-note">{status}</span>
        </div>
      </fieldset>
      {sourceUrl && (
        <fieldset>
          <legend>{t('blanc.tb.preview')}</legend>
          <div className="blanc-image-preview">
            <img src={sourceUrl} alt={sourceName} />
          </div>
          <p className="blanc-note">
            {t('blanc.tb.sourceSize', { name: sourceName, size: formatBytes(sourceSize) })}
            {outputSize ? t('blanc.tb.outputSize', { size: formatBytes(outputSize) }) : ''}
          </p>
        </fieldset>
      )}
    </div>
  );
}

function AutomationBuilderPanel() {
  const { t } = useT();
  const developerTools = useBlancDeveloperTools();
  const [copied, setCopied] = useState(false);
  const [launchMsg, setLaunchMsg] = useState('');
  // Resolved from this install rather than a baked-in constant. That constant
  // held a developer's own home directory, so the command shown here — and
  // copied to the clipboard — was wrong on every machine but one (audit F9).
  const [command, setCommand] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void window.api.automationBuilderCommand().then((resolved) => {
      if (alive) setCommand(resolved);
    });
    return () => {
      alive = false;
    };
  }, []);

  const copyCommand = async (): Promise<void> => {
    if (!command) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };
  const launchBuilder = useCallback(async (): Promise<void> => {
    const result = await window.api.launchAutomationBuilder();
    setLaunchMsg(
      result.ok
        ? result.pid
          ? t('blanc.tb.ab.launchedPid', { pid: result.pid, key: AUTOMATION_BUILDER.stopKey })
          : t('blanc.tb.ab.launched', { key: AUTOMATION_BUILDER.stopKey })
        : result.error ? t('blanc.refine.error.detail', { detail: result.error }) : t('blanc.tb.ab.launchFailed'),
    );
  }, [t]);

  useEffect(() => registerCommandHandler('automation.runSelected', () => {
    void launchBuilder();
    return true;
  }), [launchBuilder]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.tool.automationBuilder')}</legend>
        <p className="blanc-note">{t('blanc.tb.ab.intro')}</p>
        <div className="blanc-command-row">
          <input
            readOnly
            value={command ?? t('blanc.tb.ab.notFound')}
            aria-label={t('blanc.tb.ab.commandAria')}
          />
          <button type="button" onClick={() => void launchBuilder()}>
            {t('blanc.tb.ab.launch')}
          </button>
          <button type="button" onClick={() => void copyCommand()} disabled={!command}>
            {copied ? t('blanc.tb.ab.copied') : t('blanc.tb.ab.copy')}
          </button>
        </div>
        {launchMsg && <p className="blanc-note">{launchMsg}</p>}
      </fieldset>
      <div className="blanc-grid two">
        <fieldset>
          <legend>{t('blanc.tb.ab.capabilities')}</legend>
          <table>
            <tbody>
              {AUTOMATION_BUILDER.capabilities.map((item, index) => (
                <tr key={item}>
                  <td>{t(`blanc.tb.ab.cap.${index}`)}</td>
                  <td>{t('blanc.tb.ab.available')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
        <fieldset>
          <legend>{t('blanc.tb.ab.safety')}</legend>
          <ul className="blanc-plain-list">
            {AUTOMATION_BUILDER.safetyNotes.map((note, index) => (
              <li key={note}>
                {t(`blanc.tb.ab.safe.${index}`, { key: AUTOMATION_BUILDER.stopKey, folder: AUTOMATION_BUILDER.configDir })}
              </li>
            ))}
          </ul>
        </fieldset>
      </div>
      <fieldset>
        <legend>{t('blanc.tb.ab.configs')}</legend>
        <p className="blanc-note">{t('blanc.tb.ab.configFolder', { folder: AUTOMATION_BUILDER.configDir })}</p>
        {/* The migration notes are the adapter roadmap — developer reading, so they
            show only with Blanc's developer tools on. */}
        {developerTools && (
          <ul className="blanc-plain-list">
            {AUTOMATION_BUILDER.migrationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </fieldset>
    </div>
  );
}

/** Toolbox boolean settings. Keys only — labels resolve through t() at render. */
const TOOLBOX_TOGGLE_KEYS = [
  'rememberSidebarState',
  'rememberWindowBounds',
  'showTooltips',
  'showToolDescriptions',
  'showCategoryHeaders',
  'showFavoritesSection',
  'showRecentToolsSection',
  'openToolsInTabs',
  'showTabIcons',
  'showHiddenToolsInSearch',
  'fuzzySearch',
  'searchCommands',
  'showCommandShortcutLabels',
  'showCommandDescriptions',
] as const;

function BlancSettingsPanel({
  settings,
  onPatch,
}: {
  settings: BlancModeSettings;
  onPatch: (settings: BlancModeSettings) => void;
}) {
  const { t } = useT();
  const blancTools = useBlancTools();
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [lockOn, setLockOn] = useState(() => loadLockscreen().enabled);
  const [pinSet, setPinSet] = useState(() => hasLockscreenPin());
  const [memory, setMemory] = useState<BlancMemorySettings>(() => loadBlancMemory());
  const [toolboxSettings, setToolboxSettings] = useState<ToolboxSettings>(() => loadToolboxSettings());
  const [themeHistoryCount, setThemeHistoryCount] = useState(() => loadBlancThemeHistory().length);
  const [settingsImport, setSettingsImport] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  // Draft for the custom-CSS textarea, committed on Apply rather than per
  // keystroke: applying re-injects two stylesheets, not worth doing on every key.
  // Re-syncs when the persisted value changes elsewhere (import / clear).
  const [cssDraft, setCssDraft] = useState(() => loadToolboxSettings().customCss);

  useEffect(() => onBlancMemoryChanged(setMemory), []);
  useEffect(() => onToolboxSettingsChanged(setToolboxSettings), []);
  useEffect(() => setCssDraft(toolboxSettings.customCss), [toolboxSettings.customCss]);
  // The launch preference lives in main (it is read before any window exists).
  const [launchPrefs, setLaunchPrefs] = useState<{ blancOnly: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    void window.api.blancGetLaunchPrefs?.()
      .then((prefs) => {
        if (alive) setLaunchPrefs(prefs);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const patchMemory = (patch: Partial<BlancMemorySettings>): void => {
    setMemory(saveBlancMemory(patch));
  };

  const patchToolbox = (patch: Partial<ToolboxSettings>): void => {
    if ('themePreset' in patch || 'themeOverrides' in patch) {
      recordBlancThemeHistory(loadToolboxSettings());
      setThemeHistoryCount(loadBlancThemeHistory().length);
    }
    setToolboxSettings(saveToolboxSettings(patch));
  };

  // Every tool can be switched off — the calculator included (it used to be
  // locked on, a generic utility the user could not remove from a study launcher).
  const toggleTool = (id: ToolboxModuleId, enabled: boolean): void => {
    const next = enabled
      ? [...toolboxSettings.enabledTools, id]
      : toolboxSettings.enabledTools.filter((toolId) => toolId !== id);
    patchToolbox({ enabledTools: next });
  };

  // Theme (Pillar 4). Applied on every settings change and once on mount, so a
  // saved theme survives a reload and a switch takes effect without one.
  useEffect(() => {
    applyBlancTheme(toolboxSettings.themePreset, toolboxSettings.themeOverrides);
  }, [toolboxSettings.themePreset, toolboxSettings.themeOverrides]);

  // Custom CSS (Pillar 4 escape hatch). Live-apply while editing here; boot-apply
  // for every other tab lives in blancMain.tsx. Both go through the same guarded
  // applier, so the lockout guard is re-asserted on every change.
  useEffect(() => {
    applyBlancCustomCss(toolboxSettings.customCss);
  }, [toolboxSettings.customCss]);

  const activePresetOverrides = presetById(toolboxSettings.themePreset)?.overrides ?? {};

  const setThemePreset = (id: string): void => {
    // Switching preset clears per-token overrides: keeping them would silently
    // carry a colour from the old palette into the new one, which reads as the
    // preset being broken rather than as an override surviving.
    patchToolbox({ themePreset: id, themeOverrides: {} });
  };

  const setThemeToken = (token: string, value: string): void => {
    if (!isSafeThemeColor(value)) return;
    patchToolbox({ themeOverrides: { ...toolboxSettings.themeOverrides, [token]: value } });
  };

  const clearThemeToken = (token: string): void => {
    const next = { ...toolboxSettings.themeOverrides };
    delete next[token];
    patchToolbox({ themeOverrides: next });
  };

  // Launcher order (Pillar 4). Buttons rather than drag: they are keyboard- and
  // screen-reader-operable, and a pointer-only reorder would make this the one
  // Blanc setting you cannot change without a mouse. Drag is worth adding on
  // top later; it is not worth having instead.
  // Every tool the launcher can show is orderable — Blanc-only tools included,
  // which the settings schema could not store before (shared/blancTools.ts).
  const orderableTools: BlancToolId[] = orderToolIds(
    blancTools.map((item) => item.id).filter((id) => isToolLaunchable(id, toolboxSettings, false)),
    toolboxSettings.toolOrder,
  );

  const moveCategory = (category: BlancToolCategory, delta: -1 | 1): void => {
    patchToolbox({
      categoryOrder: moveToolInOrder(
        orderToolIds(TOOL_CATEGORY_ORDER, toolboxSettings.categoryOrder),
        category,
        delta,
        toolboxSettings.categoryOrder,
      ),
    });
  };

  const moveTool = (id: BlancToolId, delta: -1 | 1): void => {
    patchToolbox({ toolOrder: moveToolInOrder(orderableTools, id, delta, toolboxSettings.toolOrder) });
  };

  const resetToolOrder = (): void => {
    patchToolbox({ toolOrder: [] });
    // Plain string, not a t() key: adding one would mean editing all four
    // catalog files, which a parallel session is currently writing to. Blanc
    // chrome is outside the i18n sweep by policy anyway (plan, Pillar 8).
    setSettingsMsg(t('blanc.tb.launcherOrderReset'));
  };

  const resetToolboxCategory = (category: ToolboxSettingsCategory): void => {
    setToolboxSettings(resetToolboxSettingsCategory(category));
    setSettingsMsg(t('blanc.settings.resetCategoryDone', { category: t(`blanc.settings.category.${category}`) }));
  };

  const savePin = (): void => {
    // Hashed in main (scrypt), so saving is async.
    void setLockscreenPin(pin).then((next) => {
      if (!next) {
        setPinMsg(t('blanc.settings.pinFourDigits'));
        return;
      }
      setPin('');
      setPinSet(true);
      setPinMsg(t('blanc.settings.pinSaved'));
    });
  };

  const toggleLock = (on: boolean): void => {
    if (on && !hasLockscreenPin()) {
      setPinMsg(t('blanc.settings.pinFirst'));
      setLockOn(false);
      return;
    }
    const next = saveLockscreen({ enabled: on });
    setLockOn(next.enabled);
    setPinMsg(next.enabled ? t('blanc.settings.lockEnabled') : t('blanc.settings.lockDisabled'));
  };

  return (
    <div className="blanc-panel blanc-settings-panel">
      <fieldset data-blanc-setting="interface" tabIndex={-1}>
        <legend>{t('blanc.settings.interface')}</legend>
        <LanguageSelect />
        <label className="blanc-check">
          <input
            type="checkbox"
            checked={settings.darkMode}
            onChange={(event) => onPatch(setBlancDarkMode(event.target.checked))}
          />
          <span>{t('blanc.settings.darkMode')}</span>
        </label>
        <label className="blanc-check">
          <input
            type="checkbox"
            checked={settings.advanced}
            onChange={(event) => onPatch(setBlancAdvanced(event.target.checked))}
          />
          <span>{t('blanc.settings.advanced')}</span>
        </label>
      </fieldset>

      <BlancStudySettings
        onOpenDeck={() => window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: 'deck' }))}
      />

      <Suspense fallback={<div className="blanc-loading">{t('blanc.shell.loading')}</div>}>
        <BlancMechanicsSettings />
      </Suspense>

      <fieldset data-blanc-setting="models" tabIndex={-1}>
        <legend>{t('blanc.settings.models')}</legend>
        <p className="blanc-note">{t('blanc.settings.modelsDesc')}</p>
        <Suspense fallback={<div className="blanc-loading">{t('blanc.shell.loading')}</div>}>
          <BlancModelsPanel />
        </Suspense>
      </fieldset>

      <fieldset data-blanc-setting="memory" tabIndex={-1}>
        <legend>{t('blanc.settings.memory')}</legend>
        <p className="blanc-warning">
          {t('blanc.settings.memoryWarning')}
        </p>
        <label className="blanc-check">
          <input
            type="checkbox"
            checked={memory.rememberLastTab}
            onChange={(event) => patchMemory({ rememberLastTab: event.target.checked })}
          />
          <span>{t('blanc.settings.rememberLastTab')}</span>
        </label>
        {/* Reopens the last book on launch — BlancShell reads it at mount. */}
        <label className="blanc-check">
          <input
            type="checkbox"
            checked={memory.restoreReaderOnLaunch}
            onChange={(event) => patchMemory({ restoreReaderOnLaunch: event.target.checked })}
          />
          <span>{t('blanc.settings.restoreReader')}</span>
        </label>
        {/* "Local review limit" is gone: nothing read it (review sessions are
            sized by the Cards tab's own settings), and a setting with no
            consumer is a lie. The scratchpad merged into Quick Notes, which it
            duplicated; its text was carried over the first time Blanc opened. */}
        <p className="blanc-note">{t('blanc.refine.memory.notesMoved')}</p>
        <button type="button" onClick={() => setMemory(resetBlancMemory())}>
          {t('blanc.settings.resetMemory')}
        </button>
      </fieldset>

      <fieldset data-blanc-setting="lockscreen" tabIndex={-1}>
        <legend>{t('blanc.settings.lockscreen')}</legend>
        <div className="blanc-folder-row">
          <input
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={pin}
            aria-label={pinSet ? t('blanc.settings.changePin') : t('blanc.settings.newPin')}
            placeholder={pinSet ? t('blanc.settings.changePin') : t('blanc.settings.newPin')}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <button type="button" onClick={savePin} disabled={pin.length !== 4}>
            {t('blanc.settings.savePin')}
          </button>
          <button
            type="button"
            onClick={() => {
              clearLockscreenPin();
              setPinSet(false);
              setLockOn(false);
              setPinMsg(t('blanc.settings.pinCleared'));
            }}
          >
            {t('blanc.settings.clearPin')}
          </button>
        </div>
        <label className="blanc-check">
          <input type="checkbox" checked={lockOn} onChange={(event) => toggleLock(event.target.checked)} />
          <span>{t('blanc.settings.requirePin')}</span>
        </label>
        {pinMsg && <p className="blanc-note">{pinMsg}</p>}
      </fieldset>

      <fieldset data-blanc-setting="control-center" tabIndex={-1}>
        <legend>{t('blanc.settings.controlCenter')}</legend>
        {/* The settings-search box and the "setting definitions" table it
            filtered are gone: the table repeated the controls on this page in
            English developer prose. Master search (Ctrl+K) finds every
            section of this page. */}
        <div className="blanc-settings-toolbar">
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(exportCurrentToolboxSettings());
              setSettingsMsg(t('blanc.settings.exported'));
            }}
          >
            {t('blanc.settings.export')}
          </button>
          <button
            type="button"
            onClick={() => {
              const result = importCurrentToolboxSettings(settingsImport);
              if (result.ok) {
                setToolboxSettings(result.settings);
                setSettingsImport('');
                setSettingsMsg(t('blanc.settings.imported'));
              } else {
                setSettingsMsg(toolboxErrorText(result.error, t));
              }
            }}
            disabled={!settingsImport.trim()}
          >
            {t('blanc.settings.import')}
          </button>
          <button
            type="button"
            onClick={() => {
              setToolboxSettings(resetAllToolboxSettings());
              setSettingsMsg(t('blanc.settings.resetAllDone'));
            }}
          >
            {t('blanc.settings.resetAll')}
          </button>
        </div>
        <textarea
          rows={3}
          value={settingsImport}
          onChange={(event) => setSettingsImport(event.target.value)}
          aria-label={t('blanc.settings.import')}
          placeholder={t('blanc.settings.importPlaceholder')}
        />
        {settingsMsg && <p className="blanc-note">{settingsMsg}</p>}

        <div className="blanc-settings-grid">
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={toolboxSettings.enabled}
              onChange={(event) => patchToolbox({ enabled: event.target.checked })}
            />
            <span>{t('blanc.settings.enableToolbox')}</span>
          </label>
          <label>
            {t('blanc.settings.defaultTool')}
            <select
              value={toolboxSettings.defaultTool}
              onChange={(event) => {
                if (isBlancToolId(event.target.value)) patchToolbox({ defaultTool: event.target.value });
              }}
            >
              {/* Every Blanc tool, not only the registry's modules. */}
              {blancTools.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={toolboxSettings.restoreLastTool}
              onChange={(event) => patchToolbox({ restoreLastTool: event.target.checked })}
            />
            <span>{t('blanc.settings.restoreLastTool')}</span>
          </label>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={toolboxSettings.restoreTabs}
              onChange={(event) => patchToolbox({ restoreTabs: event.target.checked })}
            />
            <span>{t('blanc.settings.restoreTabs')}</span>
          </label>
          <label>
            {t('blanc.settings.density')}
            <select
              value={toolboxSettings.density}
              onChange={(event) => patchToolbox({ density: event.target.value as ToolboxSettings['density'] })}
            >
              <option value="compact">{t('blanc.settings.density.compact')}</option>
              <option value="comfortable">{t('blanc.settings.density.comfortable')}</option>
              <option value="spacious">{t('blanc.settings.density.spacious')}</option>
            </select>
          </label>
          <label>
            {t('blanc.settings.launcherStyle')}
            <select
              value={toolboxSettings.launcherStyle}
              onChange={(event) => patchToolbox({ launcherStyle: event.target.value as ToolboxSettings['launcherStyle'] })}
            >
              <option value="list">{t('blanc.settings.launcher.list')}</option>
              <option value="compact-list">{t('blanc.settings.launcher.compactList')}</option>
              <option value="grid">{t('blanc.settings.launcher.grid')}</option>
              <option value="categorized-grid">{t('blanc.settings.launcher.categorizedGrid')}</option>
            </select>
          </label>
          <label className="blanc-range-row">
            <span>{t('blanc.settings.sidebarWidth')}</span>
            <input
              type="number"
              min={160}
              max={320}
              value={toolboxSettings.sidebarWidth}
              onChange={(event) => patchToolbox({ sidebarWidth: Number(event.target.value) })}
            />
          </label>
          <label className="blanc-range-row">
            <span>{t('blanc.settings.recentLimit')}</span>
            <input
              type="number"
              min={0}
              max={12}
              value={toolboxSettings.maxRecentTools}
              onChange={(event) => patchToolbox({ maxRecentTools: Number(event.target.value) })}
            />
          </label>
        </div>

        <div className="blanc-settings-grid">
          {TOOLBOX_TOGGLE_KEYS.map((key) => (
            <label key={key} className="blanc-check">
              <input
                type="checkbox"
                checked={Boolean(toolboxSettings[key as keyof ToolboxSettings])}
                onChange={(event) => patchToolbox({ [key]: event.target.checked } as Partial<ToolboxSettings>)}
              />
              <span>{t(`blanc.settings.toggle.${key}`)}</span>
            </label>
          ))}
        </div>

        <div className="blanc-row-actions">
          {(['general', 'layout', 'search', 'keyboard-shortcuts'] as ToolboxSettingsCategory[]).map((category) => (
            <button key={category} type="button" onClick={() => resetToolboxCategory(category)}>
              {t('blanc.settings.resetCategory', { category: t(`blanc.settings.category.${category}`) })}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset data-blanc-setting="theme" tabIndex={-1}>
        <legend>{t('blanc.tb.theme')}</legend>
        <div className="blanc-segmented">
          {BLANC_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={keyOr(t, `blanc.refine.theme.preset.${preset.id}.desc`, preset.description)}
              aria-pressed={toolboxSettings.themePreset === preset.id}
              className={toolboxSettings.themePreset === preset.id ? 'active' : ''}
              onClick={() => setThemePreset(preset.id)}
            >
              {keyOr(t, `blanc.refine.theme.preset.${preset.id}`, preset.label)}
            </button>
          ))}
        </div>
        <p className="blanc-note">
          {presetById(toolboxSettings.themePreset)
            ? keyOr(t, `blanc.refine.theme.preset.${toolboxSettings.themePreset}.desc`, presetById(toolboxSettings.themePreset)?.description ?? '')
            : t('blanc.tb.customPalette')}
        </p>

        <div className="blanc-theme-grid">
          {BLANC_THEME_TOKENS.map((token) => {
            const overridden = toolboxSettings.themeOverrides[token.id];
            // Colour inputs only accept #rrggbb, so a preset's rgba() value
            // cannot be shown in the swatch — read the resolved value off the
            // element instead, which is what the user is actually looking at.
            const shown =
              overridden && /^#[0-9a-f]{6}$/i.test(overridden)
                ? overridden
                : readComputedToken(token.id);
            return (
              <label key={token.id} className="blanc-theme-row">
                <input
                  type="color"
                  value={shown}
                  onChange={(event) => setThemeToken(token.id, event.target.value)}
                  aria-label={keyOr(t, `blanc.refine.theme.token.${token.id}`, token.label)}
                />
                <span className="blanc-theme-label">{keyOr(t, `blanc.refine.theme.token.${token.id}`, token.label)}</span>
                {overridden ? (
                  <button type="button" onClick={() => clearThemeToken(token.id)} title={t('blanc.tb.resetColour')} aria-label={t('blanc.tb.resetColour')}>
                    ×
                  </button>
                ) : (
                  <span className="blanc-theme-inherit">
                    {activePresetOverrides[token.id] ? t('blanc.tb.inheritPreset') : t('blanc.tb.inheritDefault')}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="blanc-status-row">
          <span>
            {t('blanc.tb.customisedCount', { count: Object.keys(toolboxSettings.themeOverrides).length, total: BLANC_THEME_TOKENS.length })}
          </span>
          <button
            type="button"
            disabled={!Object.keys(toolboxSettings.themeOverrides).length}
            onClick={() => patchToolbox({ themeOverrides: {} })}
          >
            {t('blanc.tb.clearCustom')}
          </button>
          <button
            type="button"
            disabled={!themeHistoryCount}
            onClick={() => {
              const previous = undoBlancThemeHistory();
              if (!previous) return;
              const next = saveToolboxSettings({ themePreset: previous.preset, themeOverrides: previous.overrides });
              setToolboxSettings(next);
              setThemeHistoryCount(loadBlancThemeHistory().length);
              setSettingsMsg(t('blanc.tb.themeRestored'));
            }}
          >
            {t('blanc.tb.undoTheme')}
          </button>
          <button
            type="button"
            onClick={() => {
              const json = JSON.stringify(
                exportTheme(toolboxSettings.themePreset, toolboxSettings.themeOverrides),
                null,
                2,
              );
              void navigator.clipboard.writeText(json);
              setSettingsMsg(t('blanc.tb.themeCopied'));
            }}
          >
            {t('blanc.tb.copyTheme')}
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.readText().then((text) => {
                const parsed = parseThemeExport(text);
                if (!parsed) {
                  setSettingsMsg(t('blanc.tb.noThemeInClipboard'));
                  return;
                }
                patchToolbox({ themePreset: parsed.preset, themeOverrides: parsed.overrides });
                setSettingsMsg(t('blanc.tb.themePasted'));
              });
            }}
          >
            {t('blanc.tb.pasteTheme')}
          </button>
        </div>
        <p className="blanc-note">{t('blanc.tb.themeSafety')}</p>
      </fieldset>

      <fieldset data-blanc-setting="custom-css" tabIndex={-1}>
        <legend>{t('blanc.settings.customCss.legend')}</legend>
        <p className="blanc-note">{t('blanc.settings.customCss.intro')}</p>
        <textarea
          className="blanc-custom-css"
          value={cssDraft}
          spellCheck={false}
          maxLength={MAX_CUSTOM_CSS_LENGTH}
          onChange={(event) => setCssDraft(event.target.value)}
          placeholder={t('blanc.settings.customCss.placeholder')}
          aria-label={t('blanc.settings.customCss.legend')}
        />
        <div className="blanc-status-row">
          <span className="blanc-custom-css-count">
            {cssDraft.length} / {MAX_CUSTOM_CSS_LENGTH}
          </span>
          <button
            type="button"
            disabled={cssDraft === toolboxSettings.customCss}
            onClick={() => {
              patchToolbox({ customCss: cssDraft });
              setSettingsMsg(t('blanc.settings.customCss.applied'));
            }}
          >
            {t('blanc.settings.customCss.apply')}
          </button>
          <button
            type="button"
            disabled={!toolboxSettings.customCss && !cssDraft}
            onClick={() => {
              setCssDraft('');
              patchToolbox({ customCss: '' });
              setSettingsMsg(t('blanc.settings.customCss.cleared'));
            }}
          >
            {t('blanc.settings.customCss.clear')}
          </button>
        </div>
        <p className="blanc-note">{t('blanc.settings.customCss.guardNote')}</p>
      </fieldset>

      <fieldset data-blanc-setting="launcher-order" tabIndex={-1}>
        <legend>{t('blanc.tb.launcherOrder')}</legend>
        <p className="blanc-note">{t('blanc.tb.launcherOrderNote')}</p>
        <ol className="blanc-order-list">
          {orderableTools.map((id, index) => {
            const entry = blancTools.find((item) => item.id === id);
            return (
              <li key={id}>
                <span className="blanc-order-index">{index + 1}</span>
                <span className="blanc-order-label">{entry?.label ?? id}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={t('blanc.tb.moveUp', { name: entry?.label ?? id })}
                  onClick={() => moveTool(id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === orderableTools.length - 1}
                  aria-label={t('blanc.tb.moveDown', { name: entry?.label ?? id })}
                  onClick={() => moveTool(id, 1)}
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
        <div className="blanc-status-row">
          <span>{t('blanc.tb.toolCount', { count: orderableTools.length })}</span>
          <button type="button" disabled={!toolboxSettings.toolOrder.length} onClick={resetToolOrder}>
            {t('blanc.tb.resetOrder')}
          </button>
        </div>

        <p className="blanc-note">{t('blanc.tb.sectionOrderNote')}</p>
        <ol className="blanc-order-list">
          {orderToolIds(TOOL_CATEGORY_ORDER, toolboxSettings.categoryOrder).map((category, index, list) => (
            <li key={category}>
              <span className="blanc-order-index">{index + 1}</span>
              <span className="blanc-order-label">{t(TOOL_CATEGORY_LABEL_KEYS[category])}</span>
              <button
                type="button"
                disabled={index === 0}
                aria-label={t('blanc.tb.moveSectionUp', { name: t(TOOL_CATEGORY_LABEL_KEYS[category]) })}
                onClick={() => moveCategory(category, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === list.length - 1}
                aria-label={t('blanc.tb.moveSectionDown', { name: t(TOOL_CATEGORY_LABEL_KEYS[category]) })}
                onClick={() => moveCategory(category, 1)}
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
        <div className="blanc-status-row">
          <button
            type="button"
            disabled={!toolboxSettings.categoryOrder.length}
            onClick={() => {
              patchToolbox({ categoryOrder: [] });
              setSettingsMsg(t('blanc.tb.sectionOrderReset'));
            }}
          >
            {t('blanc.tb.resetSectionOrder')}
          </button>
        </div>
      </fieldset>

      <fieldset data-blanc-setting="tool-visibility" tabIndex={-1}>
        <legend>{t('blanc.settings.toolVisibility')}</legend>
        <p className="blanc-note">{t('blanc.refine.visibilityNote')}</p>
        <div className="blanc-tool-management">
          {/* Every Blanc tool. Registry modules can be switched off entirely
              (Enabled); every tool — Blanc-only ones included — can be hidden
              from the launcher and still reached through search when the user
              asks for that. Nothing is locked: the calculator used to be. */}
          {blancTools.map((item) => {
            const module = getToolboxModule(item.id as ToolboxModuleId);
            const hidden = toolboxSettings.hiddenTools.includes(item.id);
            return (
              <div key={item.id} className="blanc-tool-management-row">
                <div>
                  <strong>{item.label}</strong>
                  <span>
                    {t(TOOL_CATEGORY_LABEL_KEYS[item.category])}
                    {module ? ` · ${moduleStatusLabel(module.status, t)}` : ''}
                  </span>
                </div>
                {module && (
                  <label className="blanc-check">
                    <input
                      type="checkbox"
                      checked={toolboxSettings.enabledTools.includes(module.id)}
                      onChange={(event) => toggleTool(module.id, event.target.checked)}
                    />
                    <span>{t('blanc.settings.toolEnabled')}</span>
                  </label>
                )}
                <label className="blanc-check">
                  <input
                    type="checkbox"
                    checked={hidden}
                    onChange={(event) => {
                      const hiddenTools = event.target.checked
                        ? [...toolboxSettings.hiddenTools, item.id]
                        : toolboxSettings.hiddenTools.filter((id) => id !== item.id);
                      patchToolbox({ hiddenTools });
                    }}
                  />
                  <span>{t('blanc.settings.toolHidden')}</span>
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <ToolboxShortcutSettingsPanel />

      <fieldset data-blanc-setting="mode" tabIndex={-1}>
        <legend>{t('blanc.settings.mode')}</legend>
        <p className="blanc-note">{t('blanc.settings.modeNote')}</p>
        <label className="blanc-check">
          <input
            type="checkbox"
            checked={launchPrefs?.blancOnly === true}
            disabled={launchPrefs === null}
            onChange={(event) => {
              const blancOnly = event.target.checked;
              void window.api.blancSetLaunchPrefs({ blancOnly })
                .then(setLaunchPrefs)
                .catch(() => setSettingsMsg(t('blanc.refine.mode.launchSaveFailed')));
            }}
          />
          <span>{t('blanc.refine.mode.blancOnly')}</span>
        </label>
        <p className="blanc-note">{t('blanc.refine.mode.blancOnlyNote')}</p>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void window.api.blancOpenStudyOs().catch(() => undefined)}>
            {t('blanc.refine.mode.openStudyOs')}
          </button>
          <button type="button" onClick={() => void setBlancModeEnabled(false)}>
            {t('blanc.settings.exitBlanc')}
          </button>
        </div>
      </fieldset>
    </div>
  );
}

function ToolboxShortcutSettingsPanel() {
  const { t } = useT();
  const developerTools = useBlancDeveloperTools();
  const [bindings, setBindings] = useState<BindingRow[]>(() =>
    getBindings().filter((row) => TOOLBOX_SHORTCUT_COMMANDS.some((command) => command.id === row.id)),
  );
  const [capturing, setCapturing] = useState<string | null>(null);
  const [pendingConflict, setPendingConflict] = useState<{ id: string; chord: string; conflicts: string[] } | null>(null);
  const [shortcutMsg, setShortcutMsg] = useState('');
  const [query, setQuery] = useState('');
  const validation = validateToolboxShortcutRegistry(TOOLBOX_SHORTCUT_COMMANDS.map((command) => command.id));
  const markdown = useMemo(() => generateToolboxShortcutMarkdown(), []);

  const refreshBindings = useCallback((): void => {
    setBindings(getBindings().filter((row) => TOOLBOX_SHORTCUT_COMMANDS.some((command) => command.id === row.id)));
  }, []);

  useEffect(
    () =>
      onShortcutsChanged(() => {
        refreshBindings();
      }),
    [refreshBindings],
  );

  useEffect(() => {
    if (!capturing) return;
    const onKey = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setCapturing(null);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        setBinding(capturing, '');
        setPendingConflict(null);
        setShortcutMsg(t('blanc.shortcuts.removed'));
        setCapturing(null);
        return;
      }
      const chord = chordFromEvent(event);
      if (!chord) return;
      const conflicts = setBinding(capturing, chord);
      if (conflicts.length > 0) {
        setPendingConflict({ id: capturing, chord, conflicts });
        setShortcutMsg(
          t('blanc.shortcuts.assignedConflict', {
            keys: formatKeysDisplay(chord),
            commands: conflicts.join(', '),
          }),
        );
      } else {
        setPendingConflict(null);
        setShortcutMsg(t('blanc.shortcuts.assigned', { keys: formatKeysDisplay(chord) }));
      }
      setCapturing(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [capturing]);

  const replacePendingConflicts = (): void => {
    if (!pendingConflict) return;
    pendingConflict.conflicts.forEach((id) => setBinding(id, ''));
    setBinding(pendingConflict.id, pendingConflict.chord);
    setShortcutMsg(t('blanc.shortcuts.replaced', { keys: formatKeysDisplay(pendingConflict.chord) }));
    setPendingConflict(null);
    refreshBindings();
  };

  const visible = bindings.filter((row) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [row.id, row.label, row.category, row.note ?? '', row.keys].join(' ').toLowerCase().includes(q);
  });

  return (
    <fieldset data-blanc-setting="shortcuts" tabIndex={-1}>
      <legend>{t('blanc.shortcuts.title')}</legend>
      <p className={validation.ok ? 'blanc-note' : 'blanc-warning'}>
        {t('blanc.shortcuts.registry', {
          status: validation.ok ? t('blanc.shortcuts.valid') : t('blanc.shortcuts.needsAttention'),
          count: TOOLBOX_SHORTCUT_COMMANDS.length,
        })}
      </p>
      {!validation.ok && (
        <ul className="blanc-plain-list">
          {validation.conflicts.map((conflict) => (
            <li key={`${conflict.scope}-${conflict.shortcut}`}>
              {t('blanc.shortcuts.conflict', {
                shortcut: conflict.shortcut,
                scope: conflict.scope,
                commands: conflict.commandIds.join(', '),
              })}
            </li>
          ))}
          {validation.missingReadyFeatureCommands.map((id) => (
            <li key={id}>{t('blanc.shortcuts.missingReady', { id })}</li>
          ))}
        </ul>
      )}
      <div className="blanc-settings-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('blanc.shortcuts.search')}
          aria-label={t('blanc.shortcuts.search')}
        />
        <button type="button" onClick={() => bindings.forEach((row) => resetBinding(row.id))}>
          {t('blanc.shortcuts.restoreDefaults')}
        </button>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(markdown);
          }}
        >
          {t('blanc.shortcuts.copyDocs')}
        </button>
        {pendingConflict && (
          <button type="button" onClick={replacePendingConflicts}>
            {t('blanc.shortcuts.replaceConflicts')}
          </button>
        )}
      </div>
      {shortcutMsg && <p className={pendingConflict ? 'blanc-warning' : 'blanc-note'}>{shortcutMsg}</p>}
      <div className="blanc-shortcut-list">
        {visible.map((row) => {
          const meta = TOOLBOX_SHORTCUT_COMMANDS.find((command) => command.id === row.id);
          return (
            <div key={row.id} className={`blanc-shortcut-row${row.conflictsWith.length ? ' conflict' : ''}`}>
              <div>
                {/* Translated through the commands catalogue, like the launcher's
                    command results; the raw id/scope line is developer detail. */}
                <strong>{commandLabel(row.id, row.label, t)}</strong>
                {developerTools && <span>{row.id} / {meta?.scope ?? 'toolbox'}</span>}
                {row.note && <small>{commandNote(row.id, meta?.description ?? row.note, t) ?? row.note}</small>}
                {row.conflictsWith.length > 0 && (
                  <small>{t('blanc.shortcuts.conflictsWith', { commands: row.conflictsWith.join(', ') })}</small>
                )}
              </div>
              <button type="button" onClick={() => setCapturing(row.id)}>
                {capturing === row.id
                  ? t('blanc.shortcuts.press')
                  : formatKeysDisplay(row.keys) || t('blanc.shortcuts.unbound')}
              </button>
              {!row.isDefault && (
                <button type="button" onClick={() => resetBinding(row.id)}>
                  {t('blanc.shortcuts.reset')}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <details>
        <summary>{t('blanc.shortcuts.generatedDocs')}</summary>
        <textarea rows={10} readOnly value={markdown} />
      </details>
    </fieldset>
  );
}

// The lockscreen lives in its own module; re-exported for the entry that imports it from here.
export { BlancLockscreen } from './BlancLockscreen';

type MonoColor = 'black';
type MonoShape = 'i' | 'o' | 't' | 's' | 'z' | 'j' | 'l';

interface MonoPiece {
  key: MonoShape;
  x: number;
  y: number;
  rot: number;
}

interface MonoState {
  grid: (MonoColor | null)[];
  piece: MonoPiece;
  score: number;
  lines: number;
  level: number;
  ticks: number;
  over: boolean;
}

const MONO_W = 10;
const MONO_H = 18;
const MONO_SHAPES: Record<MonoShape, number[][]> = {
  i: [[0, 1], [1, 1], [2, 1], [3, 1]],
  o: [[1, 0], [2, 0], [1, 1], [2, 1]],
  t: [[1, 0], [0, 1], [1, 1], [2, 1]],
  s: [[1, 0], [2, 0], [0, 1], [1, 1]],
  z: [[0, 0], [1, 0], [1, 1], [2, 1]],
  j: [[0, 0], [0, 1], [1, 1], [2, 1]],
  l: [[2, 0], [0, 1], [1, 1], [2, 1]],
};
const MONO_KEYS: MonoShape[] = ['i', 'o', 't', 's', 'z', 'j', 'l'];
// Naive box rotation moves each shape to a different sub-range of its 4x4
// bounding box per orientation, so a bare same-position rotation attempt
// fails constantly near walls/landed blocks. Try a small set of horizontal
// (and one floor) kicks, first that fits wins — same idea as SRS wall kicks.
const MONO_ROTATION_KICKS: number[][] = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1]];

function monoIndex(x: number, y: number): number {
  return y * MONO_W + x;
}

function rotateCell(point: number[], rot: number): number[] {
  let x = point[0] ?? 0;
  let y = point[1] ?? 0;
  for (let i = 0; i < rot % 4; i += 1) {
    const nextX = 3 - y;
    y = x;
    x = nextX;
  }
  return [x, y];
}

function makeMonoPiece(seed: number): MonoPiece {
  return { key: MONO_KEYS[Math.abs(seed) % MONO_KEYS.length]!, x: 3, y: -1, rot: 0 };
}

function monoCells(piece: MonoPiece): { x: number; y: number }[] {
  return MONO_SHAPES[piece.key].map((point) => {
    const [x, y] = rotateCell(point, piece.key === 'o' ? 0 : piece.rot);
    return { x: piece.x + x, y: piece.y + y };
  });
}

function canPlaceMono(grid: (MonoColor | null)[], piece: MonoPiece): boolean {
  return monoCells(piece).every(
    (cell) =>
      cell.x >= 0 &&
      cell.x < MONO_W &&
      cell.y < MONO_H &&
      (cell.y < 0 || !grid[monoIndex(cell.x, cell.y)]),
  );
}

function initialMono(): MonoState {
  return {
    grid: Array.from({ length: MONO_W * MONO_H }, () => null),
    piece: makeMonoPiece(1),
    score: 0,
    lines: 0,
    level: 1,
    ticks: 0,
    over: false,
  };
}

function MonoBlocks() {
  const { t } = useT();
  const [state, setState] = useState<MonoState>(() => initialMono());
  const keys = useRef(new Set<string>());
  const rotateLatch = useRef(false);
  const dropLatch = useRef(false);

  // Paused while the window is hidden or unfocused: the game ticks every 62 ms,
  // which is real CPU for a background window, and pieces should not fall
  // while the player is elsewhere.
  const [paused, setPaused] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const editable = (target: EventTarget | null): boolean =>
      target instanceof HTMLElement &&
      Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'));
    const down = (event: KeyboardEvent): void => {
      // Typing elsewhere (Master search, a settings field) must keep its
      // arrows, letters and spaces: only keys aimed at the page drive the game.
      if (editable(event.target)) return;
      const key = event.code === 'Space' ? ' ' : event.key;
      if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'w', 'W', 'x', 'X', 'z', 'Z', ' '].includes(key)) {
        event.preventDefault();
        keys.current.add(key);
      }
    };
    const up = (event: KeyboardEvent): void => {
      const key = event.code === 'Space' ? ' ' : event.key;
      keys.current.delete(key);
    };
    const onBlur = (): void => {
      keys.current.clear();
      setPaused(true);
    };
    const onFocus = (): void => setPaused(document.hidden);
    const onVisibility = (): void => {
      keys.current.clear();
      setPaused(document.hidden || !document.hasFocus());
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      keys.current.clear();
    };
  }, []);

  useEffect(() => {
    // No interval at all once the game is over or paused (it used to keep
    // ticking after game over, forever).
    if (state.over || paused) return undefined;
    const timer = window.setInterval(() => {
      setState((current) => {
        if (current.over) return current;
        let piece = current.piece;
        let grid = current.grid;
        const tryPiece = (candidate: MonoPiece): boolean => {
          if (!canPlaceMono(grid, candidate)) return false;
          piece = candidate;
          return true;
        };

        if (keys.current.has('ArrowLeft')) tryPiece({ ...piece, x: piece.x - 1 });
        if (keys.current.has('ArrowRight')) tryPiece({ ...piece, x: piece.x + 1 });
        if (keys.current.has('ArrowDown')) tryPiece({ ...piece, y: piece.y + 1 });
        const rotateRight = keys.current.has('ArrowUp') || keys.current.has('w') || keys.current.has('W') || keys.current.has('x') || keys.current.has('X');
        const rotateLeft = keys.current.has('z') || keys.current.has('Z');
        if (rotateRight || rotateLeft) {
          if (!rotateLatch.current) {
            const nextRot = rotateLeft ? (piece.rot + 3) % 4 : (piece.rot + 1) % 4;
            for (const [dx, dy] of MONO_ROTATION_KICKS) {
              if (tryPiece({ ...piece, rot: nextRot, x: piece.x + dx, y: piece.y + dy })) break;
            }
          }
          rotateLatch.current = true;
        } else {
          rotateLatch.current = false;
        }
        if (keys.current.has(' ')) {
          if (!dropLatch.current) {
            while (tryPiece({ ...piece, y: piece.y + 1 })) {
              /* hard drop */
            }
          }
          dropLatch.current = true;
        } else {
          dropLatch.current = false;
        }

        let score = current.score;
        let lines = current.lines;
        let level = current.level;
        let over = false;
        const falling = current.ticks % Math.max(2, 8 - level) === 0;
        if (falling && !tryPiece({ ...piece, y: piece.y + 1 })) {
          const nextGrid = [...grid];
          monoCells(piece).forEach((cell) => {
            if (cell.y >= 0) nextGrid[monoIndex(cell.x, cell.y)] = 'black';
          });
          const kept: (MonoColor | null)[][] = [];
          let cleared = 0;
          for (let y = 0; y < MONO_H; y += 1) {
            const row = nextGrid.slice(y * MONO_W, y * MONO_W + MONO_W);
            if (row.every(Boolean)) cleared += 1;
            else kept.push(row);
          }
          while (kept.length < MONO_H) kept.unshift(Array.from({ length: MONO_W }, () => null));
          grid = kept.flat();
          if (cleared) {
            lines += cleared;
            score += [0, 40, 100, 300, 1200][cleared]! * level;
            level = 1 + Math.floor(lines / 5);
          } else {
            score += 1;
          }
          piece = makeMonoPiece(current.ticks + score + lines);
          if (!canPlaceMono(grid, piece)) over = true;
        }
        return { grid, piece, score, lines, level, ticks: current.ticks + 1, over };
      });
    }, 62);
    return () => window.clearInterval(timer);
  }, [state.over, paused]);

  const cells = useMemo(() => {
    const overlay = new Set<number>();
    monoCells(state.piece).forEach((cell) => {
      if (cell.y >= 0) overlay.add(monoIndex(cell.x, cell.y));
    });
    return state.grid.map((cell, index) => overlay.has(index) || !!cell);
  }, [state.grid, state.piece]);

  return (
    <div className="blanc-panel mono-blocks">
      <fieldset>
        <legend>{t('blanc.tb.monoBlocks')}</legend>
        <div className="mono-hud">
          <span>{t('blanc.tb.score', { count: state.score })}</span>
          <span>{t('blanc.tb.lines', { count: state.lines })}</span>
          <span>{t('blanc.tb.level', { count: state.level })}</span>
          <button type="button" onClick={() => setState(initialMono())}>
            {t('blanc.tb.restart')}
          </button>
        </div>
      </fieldset>
      <div className="mono-board" aria-label={t('blanc.tb.blocksBoard')}>
        {cells.map((filled, index) => (
          <span key={index} className={filled ? 'filled' : ''} />
        ))}
      </div>
      <p className="blanc-note">{t('blanc.tb.blocksKeys')}</p>
      {paused && !state.over && <p className="blanc-note" role="status">{t('blanc.refine.blocksPaused')}</p>}
      {state.over && <p className="blanc-error">{t('blanc.tb.gameOver')}</p>}
    </div>
  );
}

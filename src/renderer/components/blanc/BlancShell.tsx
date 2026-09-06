import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { LibraryItem } from '../../../shared/types';
import type { CollectedToolsStore } from '../../../shared/collectedTools';
import {
  BLANC_TABS,
  type BlancTabId,
} from '../../../shared/blancMode';
import { AUTOMATION_BUILDER } from '../../../shared/automationBuilder';
import { getToolboxModule, listBlancToolboxModules, listToolboxModules, type ToolboxModuleId } from '../../../shared/toolboxRegistry';
import { isRegistryGovernedTool, isToolLaunchable, mergeFavoriteTools } from './blancToolVisibility';
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
import FocusMusicBar from '../FocusMusicBar';
import ClipboardHistoryPanel from '../ClipboardHistoryPanel';
import BlancMasterSearch from './BlancMasterSearch';
import {
  BLANC_DICTIONARY_QUERY_EVENT,
  BLANC_MASTER_SETTINGS,
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
import { getUiLang, setUiLang, useT } from '../../i18n';
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
  TOOLBOX_SETTING_DEFINITIONS,
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
import { clearLockscreenPin, hasLockscreenPin, loadLockscreen, saveLockscreen, setLockscreenPin, verifyLockscreenPin } from '../../lockscreenSettings';
import { getActiveProfile } from '../../profileState';
import { loadSaved, type SavedWord } from '../../savedWords';
import { loadLookupHistory, type LookupHistoryEntry } from '../../lookupHistory';
import { setStudyLang } from '../../studyEnvironment';
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
import {
  BatchConverterPanel,
  BlancModelsPanel,
  BlancYoutubePanel,
  ContextSearchPanel,
  DifficultyAnalyzerPanel,
  FrequencyExplorerPanel,
  ImmersionTrackerPanel,
  KanjiInspectorPanel,
  LocalAgentPanel,
  NotificationCenterPanel,
  SubtitleImporterPanel,
} from './BlancReadyToolPanels';

// Pillar 1: these five were static imports, so the Blanc window paid for both
// readers and both mining panels before it painted. Every heavy view is lazy now.
const MangaReader = lazy(() => import('../../views/MangaReader'));
const NovelReader = lazy(() => import('../../views/NovelReader'));
const EpubMiningPanel = lazy(() => import('../EpubMiningPanel'));
const EpubMiningSimplePanel = lazy(() => import('../EpubMiningSimplePanel'));

// Owned by the Media & Cards work stream — see BlancMediaPanels.tsx. The shell
// imports these two names and nothing else from that file, so that stream can
// rebuild both panels Blanc-native without editing BlancShell.
const BlancMediaPanel = lazy(() =>
  import('./BlancMediaPanels').then((m) => ({ default: m.BlancMediaPanel })),
);
const BlancFlashcardsPanel = lazy(() =>
  import('./BlancMediaPanels').then((m) => ({ default: m.BlancFlashcardsPanel })),
);
// Pillar 0: Blanc-native panels, not Study OS `*View`s. See BlancStudyPanels.tsx.
const BlancStatisticsPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancStatisticsPanel })),
);
const BlancAnkiPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancAnkiPanel })),
);
const BlancNotebookPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancNotebookPanel })),
);
const BlancTranslatePanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancTranslatePanel })),
);
const BlancMusicPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancMusicPanel })),
);
const BlancDictionaryPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancDictionaryPanel })),
);
const BlancGrammarPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancGrammarPanel })),
);
const BlancClipboardPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancClipboardPanel })),
);
const BlancResourcesPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancResourcesPanel })),
);
const BlancCalendarPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancCalendarPanel })),
);
const BlancReadingFinderPanel = lazy(() =>
  import('./BlancStudyPanels').then((m) => ({ default: m.BlancReadingFinderPanel })),
);

// Owned by the Library & Arcade work stream — see BlancLibraryPanels.tsx. All
// four surfaces are new Blanc-only tool ids registered below.
const BlancNovelsPanel = lazy(() =>
  import('./BlancLibraryPanels').then((m) => ({ default: m.BlancNovelsPanel })),
);
const BlancDiscoverPanel = lazy(() =>
  import('./BlancLibraryPanels').then((m) => ({ default: m.BlancDiscoverPanel })),
);
const BlancGamesPanel = lazy(() =>
  import('./BlancLibraryPanels').then((m) => ({ default: m.BlancGamesPanel })),
);
const BlancImmersionPanel = lazy(() =>
  import('./BlancLibraryPanels').then((m) => ({ default: m.BlancImmersionPanel })),
);
const BlancVisualizerPanel = lazy(() =>
  import('./BlancLibraryPanels').then((m) => ({ default: m.BlancVisualizerPanel })),
);

// Study-native toolbox track — see BlancStudyNativePanels.tsx.
const BlancFuriganaPanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancFuriganaPanel })),
);
const BlancCounterPanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancCounterPanel })),
);
const BlancConjugationPanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancConjugationPanel })),
);
const BlancForecastPanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancForecastPanel })),
);
const BlancPitchPanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancPitchPanel })),
);
const BlancConsolePanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancConsolePanel })),
);
const BlancAudioMinePanel = lazy(() =>
  import('./BlancStudyNativePanels').then((m) => ({ default: m.BlancAudioMinePanel })),
);

// Pillar 3 — App Drawer. Supersedes workspace-launcher (retired below).
const BlancAppDrawerPanel = lazy(() => import('./BlancAppDrawerPanel'));

const TAB_META: Record<BlancTabId, { label: string; icon: IconName }> = {
  read: { label: 'Read', icon: 'library' },
  mine: { label: 'Mine', icon: 'scan' },
  deck: { label: 'Deck', icon: 'anki' },
  flashcards: { label: 'Cards', icon: 'flashcards' },
  media: { label: 'Media', icon: 'player' },
  stats: { label: 'Stats', icon: 'stats' },
  tools: { label: 'Toolbox', icon: 'wrench' },
  blocks: { label: 'Blocks', icon: 'app' },
  settings: { label: 'Settings', icon: 'settings' },
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
  const clock = useMinuteClock();
  const masterCommandShortcuts = useMemo(
    () => new Map(getBindings().map((binding) => [binding.id, binding.keys])),
    [masterSearchOpen],
  );
  const masterSourceLabels = useMemo(() => blancMasterSourceLabels(t), [lang, t]);
  const masterContent = useMemo(
    () => [
      ...appDrawerMasterContent(masterDrawer.tools, masterDrawer.folders),
      ...BLANC_MASTER_SETTINGS,
      ...savedWordMasterContent(masterSavedWords),
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
    ],
  );

  useEffect(() => {
    // The renderer's index.html title ("日本語 Study") would otherwise override
    // the BrowserWindow title, making the side window indistinguishable.
    document.title = 'Blanc Toolbox';
  }, []);
  useEffect(() => onBlancModeChanged(setSettings), []);
  useEffect(() => onBlancMemoryChanged(setMemory), []);
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
      }
    };
    window.addEventListener('toolbox:command', onToolboxCommand);
    return () => window.removeEventListener('toolbox:command', onToolboxCommand);
  }, []);
  useEffect(() => {
    if (!masterSearchOpen) return;
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
        'mono-blocks': 'blocks',
      };
      const direct = directTabs[feature];
      if (direct) {
        chooseTab(direct);
        return;
      }
      if (BLANC_TOOL_IDS.includes(feature as BlancToolId)) {
        setBook(null);
        setTab('tools');
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

  const patchDark = (on: boolean): void => {
    setSettings(setBlancDarkMode(on));
  };

  const patchAdvanced = (on: boolean): void => {
    setSettings(setBlancAdvanced(on));
  };

  const title = book ? 'Reader' : TAB_META[tab].label;
  const canExpandWorkspace = book || tab === 'mine' || tab === 'flashcards' || tab === 'media' || tab === 'stats' || tab === 'tools';

  return (
    <div className={`blanc-root${settings.darkMode ? ' is-dark' : ''}${workspaceFull ? ' is-workspace-full' : ''}${taskbarHidden ? ' is-taskbar-hidden' : ''}`}>
      <aside
        className="blanc-taskbar lq-liquid"
        data-lq-role="liquid"
        aria-label="Blanc Mode sections"
      >
        <div className="blanc-brand">
          <span className="blanc-brand-mark" aria-hidden />
          <span>Blanc</span>
        </div>
        <button
          type="button"
          className="blanc-nav-btn blanc-taskbar-toggle"
          onClick={() => setTaskbarHidden(true)}
          title="Hide taskbar"
        >
          <Icon name="chevron" size={16} style={{ transform: 'rotate(180deg)' }} />
          <span>Hide</span>
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
              title={TAB_META[id].label}
            >
              <Icon name={TAB_META[id].icon} size={16} />
              <span>{TAB_META[id].label}</span>
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="blanc-exit"
          onClick={() => void setBlancModeEnabled(false)}
        >
          Exit Blanc
        </button>
      </aside>

      <main className="blanc-main">
        <header className="blanc-top lq-liquid" data-lq-role="liquid">
          <div className="blanc-title">
            {book && (
              <button type="button" className="blanc-small-btn" onClick={() => setBook(null)}>
                Back
              </button>
            )}
            <span>{title}</span>
          </div>
          {/* Out of the disclosure, because the disclosure now closes at every width and the
              time is the one thing in the top bar that is read rather than operated. A <time>
              is not a control, so keeping it visible costs the default view nothing. */}
          <time className="blanc-clock">
            {clock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </time>
          {/* Blanc's one cross-tool capability (6b488974) and its dominant way in, so it stays
              in the bar rather than one click inside the drawer: a Ctrl+F affordance that has
              to be uncovered first is not an affordance. `primary` is the declaration the
              shared vocabulary uses for "this is the way in" — the taskbar is the map, this is
              the action. */}
          <button
            type="button"
            className="blanc-icon-btn primary blanc-top-search"
            title="Search Blanc (Ctrl+F)"
            aria-label="Search Blanc"
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
            Context tools
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
                title={workspaceFull ? 'Exit fullscreen workspace' : 'Fullscreen workspace'}
                onClick={() => setWorkspaceFull((current) => !current)}
              >
                <Icon name={workspaceFull ? 'app' : 'monitor'} size={15} />
              </button>
            )}
            <LanguageSelect />
            <label className="blanc-check">
              <input
                type="checkbox"
                checked={settings.advanced}
                onChange={(event) => patchAdvanced(event.target.checked)}
              />
              <span>Advanced</span>
            </label>
            <label className="blanc-check">
              <input
                type="checkbox"
                checked={settings.darkMode}
                onChange={(event) => patchDark(event.target.checked)}
              />
              <span>Dark</span>
            </label>
            </div>
          </div>
        </header>

        <section className={`blanc-content${book ? ' is-reader' : ''}`}>
          <Suspense fallback={<div className="blanc-loading">Loading...</div>}>
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
          ) : tab === 'tools' ? (
            <BlancToolsPanel
              onOpenBook={setBook}
              grammarRequest={masterGrammarRequest}
              toolRequest={toolRequest}
            />
          ) : tab === 'blocks' ? (
            <MonoBlocks />
          ) : (
            <BlancSettingsPanel settings={settings} onPatch={setSettings} />
          )}
          </Suspense>
        </section>
      </main>
      {workspaceFull && (
        <button
          type="button"
          className="blanc-fullscreen-exit"
          title="Exit fullscreen workspace"
          onClick={() => setWorkspaceFull(false)}
        >
          <Icon name="app" size={15} />
          <span>Exit Fullscreen</span>
        </button>
      )}
      {taskbarHidden && !workspaceFull && (
        <button
          type="button"
          className="blanc-taskbar-reveal"
          title="Show taskbar"
          aria-label="Show Blanc taskbar"
          onClick={() => setTaskbarHidden(false)}
        >
          <Icon name="chevron" size={15} />
        </button>
      )}
      <BlancMasterSearch
        open={masterSearchOpen}
        tools={BLANC_TOOLS}
        content={masterContent}
        commands={TOOLBOX_SHORTCUT_COMMANDS.map((command) => ({
          ...command,
          shortcut: masterCommandShortcuts.get(command.id) ?? command.defaultShortcut,
        }))}
        onClose={() => setMasterSearchOpen(false)}
        onOpenTool={(id) => {
          if (!BLANC_TOOL_IDS.includes(id as BlancToolId)) return;
          setMasterSearchOpen(false);
          setBook(null);
          chooseTab('tools');
          window.requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('toolbox:select-tool', { detail: id }));
          });
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
                  detail: { message: failure, kind: 'error' },
                }));
              }
            });
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
            chooseTab('tools');
            window.requestAnimationFrame(() => {
              window.dispatchEvent(new CustomEvent('toolbox:select-tool', { detail: 'grammar' }));
            });
            return;
          }
          if (result.kind === 'dictionary-entry' && result.language) {
            setStudyLang(result.language);
          }
          chooseTab('tools');
          window.requestAnimationFrame(() => {
            window.dispatchEvent(new CustomEvent('toolbox:select-tool', { detail: 'dictionary' }));
            window.requestAnimationFrame(() => {
              const query = result.kind === 'dictionary-entry' ? result.title : result.id;
              window.dispatchEvent(new CustomEvent(BLANC_DICTIONARY_QUERY_EVENT, { detail: query }));
            });
          });
        }}
      />
      <ClipboardHistoryPanel />
    </div>
  );
}

function LanguageSelect() {
  const [lang, setLang] = useState<UiLang>(() => getUiLang());
  return (
    <label className="blanc-lang">
      <span>Language</span>
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
        <legend>Library</legend>
        <div className="blanc-toolbar">
          <button type="button" disabled={busy} onClick={() => void runBusy(async () => setItems(await window.api.importFiles()))}>
            Upload file
          </button>
          <button type="button" disabled={busy} onClick={() => void runBusy(async () => setItems(await window.api.importFolder()))}>
            Upload folder
          </button>
          <button type="button" disabled={busy} onClick={() => void runBusy(refresh)}>
            Refresh
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
            {watchFolder ? 'Change watch folder' : 'Set watch folder'}
          </button>
        </div>
        {watchFolder && (
          <p className="blanc-note">
            Auto-import folder: <code>{watchFolder}</code>
          </p>
        )}
        {status && <p className="blanc-error">{status}</p>}
      </fieldset>

      <fieldset>
        <legend>Folders</legend>
        <div className="blanc-folder-row">
          <select value={activeFolder} onChange={(event) => setActiveFolder(event.target.value)}>
            <option value="all">All ({items.length})</option>
            <option value="unfiled">Unfiled</option>
            {folders.map((folder) => (
              <option key={folder} value={folder}>
                {folder}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newFolder}
            placeholder="New folder"
            onChange={(event) => setNewFolder(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createFolder();
            }}
          />
          <button type="button" onClick={() => void createFolder()}>
            Add
          </button>
        </div>
      </fieldset>

      <div className="blanc-table-wrap">
        <table className="blanc-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Type</th>
              <th>Progress</th>
              <th>Folder</th>
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
                  <td>{item.kind === 'manga' ? 'Manga' : item.epubFile?.endsWith('.pdf') ? 'PDF' : 'EPUB'}</td>
                  <td>{pct}%</td>
                  <td>
                    <select
                      value={item.folder && folders.includes(item.folder) ? item.folder : ''}
                      onChange={(event) =>
                        void window.api.setItemFolder(item.id, event.target.value || null).then(setItems)
                      }
                    >
                      <option value="">Unfiled</option>
                      {folders.map((folder) => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" onClick={() => onOpenBook(item)}>
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={5}>No readable items in this folder.</td>
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
    void window.api.ankiStatus().then((next) => {
      setConnected(!!next.connected);
      setDecks(next.decks ?? []);
      if (!deck && next.decks?.[0]) setDeck(next.decks[0]);
    });
  }, [deck]);

  if (advanced) return <BlancAnkiPanel />;

  const toggle = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sendCard = async (card: Pick<DeckFlashcard, 'id' | 'word' | 'reading' | 'meaning' | 'sentence'>): Promise<boolean> => {
    const result = await window.api.ankiMineNote({
      route: { source: 'other', cardKind: card.sentence ? 'sentence' : 'word' },
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
        ankiExportError: ok ? undefined : result.error ?? 'Export failed',
        ankiDeck: deck || undefined,
      });
      setCards(loadDeck());
    }
    return ok;
  };

  const exportSelected = async (): Promise<void> => {
    const targets = cards.filter((card) => selected.has(card.id));
    if (!targets.length) {
      setStatus('Select cards first.');
      return;
    }
    setStatus(`Exporting ${targets.length} cards...`);
    let ok = 0;
    for (const card of targets) {
      if (await sendCard(card)) ok += 1;
    }
    setStatus(`Exported ${ok}/${targets.length}.`);
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
    };
    const created = addDeckCards([payload])[0];
    setCards(loadDeck());
    setTerm('');
    setReading('');
    setMeaning('');
    setSentence('');
    if (connected && created) {
      const ok = await sendCard(created);
      setStatus(ok ? 'Card saved and exported.' : 'Card saved locally; Anki export failed.');
    } else {
      setStatus('Card saved locally.');
    }
  };

  return (
    <div className="blanc-panel">
      <ProfileSwitcher compact showHeading={false} />
      <fieldset>
        <legend>Anki</legend>
        <div className="blanc-toolbar">
          <span className={`blanc-status-dot${connected ? ' ok' : ''}`} />
          <span>{connected ? 'Connected' : 'Not connected'}</span>
          <select value={deck} onChange={(event) => setDeck(event.target.value)}>
            {deck && !decks.includes(deck) && <option value={deck}>{deck}</option>}
            <option value="">Profile default</option>
            {decks.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => void exportSelected()}>
            Export selected
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      <fieldset>
        <legend>Manual card</legend>
        <div className="blanc-form-grid">
          <label>
            Word
            <input value={term} lang="ja" onChange={(event) => setTerm(event.target.value)} />
          </label>
          <label>
            Reading
            <input value={reading} lang="ja" onChange={(event) => setReading(event.target.value)} />
          </label>
          <label>
            Meaning
            <input value={meaning} onChange={(event) => setMeaning(event.target.value)} />
          </label>
          <label>
            Sentence
            <input value={sentence} lang="ja" onChange={(event) => setSentence(event.target.value)} />
          </label>
        </div>
        <button type="button" onClick={() => void addManual()} disabled={!term.trim()}>
          Add card
        </button>
      </fieldset>

      <div className="blanc-table-wrap">
        <table className="blanc-table">
          <thead>
            <tr>
              <th />
              <th>Word</th>
              <th>Meaning</th>
              <th>Source</th>
              <th>Anki</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <tr key={card.id}>
                <td>
                  <input type="checkbox" checked={selected.has(card.id)} onChange={() => toggle(card.id)} />
                </td>
                <td lang="ja">{card.word}</td>
                <td>{card.meaning || card.back}</td>
                <td>{card.bookTitle || card.source}</td>
                <td>{card.ankiExported ? 'Exported' : card.ankiExportError ? 'Failed' : 'Local'}</td>
                <td>
                  <button type="button" onClick={() => {
                    removeDeckCard(card.id);
                    setCards(loadDeck());
                  }}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {cards.length === 0 && (
              <tr>
                <td colSpan={6}>No cards yet. Mine from the reader or add one manually.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


/**
 * Blanc-only tool ids — surfaces Blanc has that the shared toolbox registry
 * does not model. `coverage` established this pattern; Pillar 2 ports reuse it
 * rather than adding entries to `TOOLBOX_MODULES`, which Study OS also reads.
 */
type BlancOnlyToolId = 'coverage' | 'notebook' | 'translate' | 'music' | 'novels' | 'discover' | 'games' | 'immersion' | 'visualizer' | 'local-agent';

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
  | 'context-search'
  | 'kanji-inspector'
  | 'youtube-library'
  | 'furigana'
  | 'counter-reader'
  | 'conjugation-drill'
  | 'review-forecast'
  | 'pitch-accent'
  | 'dev-console'
  | 'audio-mine'
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

const BLANC_TOOL_IDS: BlancToolId[] = [
  'furigana',
  'counter-reader',
  'conjugation-drill',
  'review-forecast',
  'pitch-accent',
  'dev-console',
  'audio-mine',
  'local-agent',
  'coverage',
  'notebook',
  'translate',
  'music',
  'novels',
  'discover',
  'games',
  'immersion',
  'visualizer',
  'clipboard',
  'automation-builder',
  'calculator',
  'unit-converter',
  'focus-timer',
  'system-monitor',
  'quick-notes',
  'file-search',
  'hash-checker',
  'image-converter',
  'batch-converter',
  'app-drawer',
  'dictionary',
  'grammar',
  'reading-finder',
  'resources',
  'calendar',
  'notification-center',
  'difficulty-analyzer',
  'immersion-tracker',
  'frequency-explorer',
  'subtitle-importer',
  'context-search',
  'kanji-inspector',
  'youtube-library',
];

const BLANC_TOOL_ICONS: Record<BlancToolId, IconName> = {
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
  'context-search': 'search',
  'kanji-inspector': 'scan',
  'youtube-library': 'player',
};

type BlancToolCategory = 'quick' | 'productivity' | 'system' | 'language';

interface BlancToolEntry {
  id: BlancToolId;
  label: string;
  icon: IconName;
  category: BlancToolCategory;
  description: string;
  shortcut?: string;
}

const TOOL_CATEGORY_LABELS: Record<BlancToolCategory, string> = {
  quick: 'Quick Tools',
  productivity: 'Productivity',
  system: 'System',
  language: 'Language',
};

const TOOL_CATEGORY_ORDER: BlancToolCategory[] = ['quick', 'productivity', 'system', 'language'];

const TOOL_DESCRIPTIONS: Record<BlancToolId, { category: BlancToolCategory; description: string; shortcut?: string }> = {
  furigana: { category: 'language', description: 'Paste Japanese text and get ruby, Anki bracket furigana, or kana — offline.' },
  'counter-reader': { category: 'language', description: 'Numbers, counters, dates, and clock times to kana — 3本 → さんぼん, with audio.' },
  'dev-console': { category: 'system', description: 'Append-only event log — mining, deck writes, toasts, and errors, with copy-for-report.' },
  'pitch-accent': { category: 'language', description: 'Pitch-accent contour for a word, with the pattern named and spoken aloud.' },
  'audio-mine': { category: 'language', description: 'Transcribe a local audio or video file with Whisper, then click any word to look it up and mine it.' },
  'review-forecast': { category: 'language', description: 'Week-ahead review load from Anki, plus local backlog and knowledge bands — read-only.' },
  'conjugation-drill': { category: 'language', description: 'Drill ます, て, た, potential, passive, causative and more across all verb classes.' },
  coverage: { category: 'system', description: 'Implementation map and remaining toolbox adapters.' },
  notebook: { category: 'language', description: 'Everything you saved, mined, looked up, and read — one timeline with lineage.' },
  translate: { category: 'language', description: 'Offline JA/ZH/EN/RU translation with history, re-run, and mine-to-deck.' },
  music: { category: 'language', description: 'Song library, karaoke lyrics, and click-to-look-up — shares the app-wide player.' },
  novels: { category: 'language', description: 'Search Jiten and the local catalogue, plan to read, and import or mine EPUBs.' },
  discover: { category: 'language', description: 'What to watch next at your level, ranked against your library, with the reasons spelled out.' },
  games: { category: 'language', description: 'The full Game Arena — sentence builder, cloze, match, kana sprint, and more; XP and mistakes sync app-wide.' },
  immersion: { category: 'language', description: 'The full immersion browser — live guest, Reader Mode, sites rail, and click-to-look-up; feeds reading stats.' },
  visualizer: { category: 'productivity', description: 'Live music visualizer with style, colour, and sensitivity controls — shared with the desktop wallpaper.' },
  'local-agent': { category: 'system', description: 'Offline local assistant with reviewed plans, permissions, confirmations, and task progress.' },
  calculator: { category: 'quick', description: 'Offline arithmetic with a compact result display.', shortcut: 'Alt+1' },
  'unit-converter': { category: 'quick', description: 'Static length, weight, temperature, and data conversions.', shortcut: 'Alt+2' },
  'hash-checker': { category: 'quick', description: 'Generate SHA-256 and compare downloaded files.', shortcut: 'Alt+3' },
  'image-converter': { category: 'quick', description: 'Convert PNG, JPEG, and WebP without leaving Blanc.', shortcut: 'Alt+4' },
  'batch-converter': { category: 'quick', description: 'Queue many images through the same canvas conversion.' },
  'focus-timer': { category: 'productivity', description: 'Countdown, stopwatch, presets, and session rhythm.', shortcut: 'Alt+5' },
  'quick-notes': { category: 'productivity', description: 'Local scratch notes that stay inside Blanc.', shortcut: 'Alt+6' },
  clipboard: { category: 'productivity', description: 'Clipboard history and Japanese capture handoff.', shortcut: 'Alt+7' },
  calendar: { category: 'productivity', description: 'Study calendar and local scheduling tools.' },
  'system-monitor': { category: 'system', description: 'CPU, RAM, storage, uptime, and battery at a glance.', shortcut: 'Alt+8' },
  'file-search': { category: 'system', description: 'Capped local filename search with open/copy actions.', shortcut: 'Alt+9' },
  'automation-builder': { category: 'system', description: 'Launch the existing Windows automation builder.' },
  'app-drawer': { category: 'system', description: 'Folders of apps, files, links, and Blanc tools — launch a whole folder in one click.' },
  dictionary: { category: 'language', description: 'Lookup, dictionaries, examples, and study actions.' },
  grammar: { category: 'language', description: 'Deterministic Japanese grammar reference.' },
  'reading-finder': { category: 'language', description: 'Find and import readable Japanese sources.' },
  resources: { category: 'language', description: 'Curated study resources and collected tools.' },
  'notification-center': { category: 'system', description: 'Persistent notification history with dismiss and clear actions.' },
  'difficulty-analyzer': { category: 'language', description: 'Paste text to estimate exam level and comprehension.' },
  'immersion-tracker': { category: 'language', description: 'Read-only immersion site totals, streaks, and character counts.' },
  'frequency-explorer': { category: 'language', description: 'Lookup corpus frequency ranks from installed dictionaries.' },
  'subtitle-importer': { category: 'language', description: 'Parse subtitle files and send lines to the flashcard deck.' },
  'context-search': { category: 'language', description: 'Search commands, saved words, deck cards, and grammar.' },
  'kanji-inspector': { category: 'language', description: 'Inspect one kanji against radicals and dictionary senses.' },
  'youtube-library': { category: 'language', description: 'Compact playlist manager with download and plan-to-watch toggles.' },
};

/** Labels for the Blanc-only ids, which have no `TOOLBOX_MODULES` entry to read. */
const BLANC_ONLY_LABELS: Record<BlancOnlyToolId, string> = {
  coverage: 'Coverage',
  notebook: 'Notebook',
  translate: 'Translate',
  music: 'Music',
  novels: 'Novels',
  discover: 'Discover',
  games: 'Games',
  immersion: 'Immersion',
  visualizer: 'Visualizer',
  'local-agent': 'Local AI Agent',
};

const BLANC_TOOLS: BlancToolEntry[] = BLANC_TOOL_IDS.map((id) => ({
  id,
  label: BLANC_ONLY_LABELS[id as BlancOnlyToolId] ?? getToolboxModule(id)?.label ?? id,
  icon: BLANC_TOOL_ICONS[id],
  category: TOOL_DESCRIPTIONS[id].category,
  description: TOOL_DESCRIPTIONS[id].description,
  shortcut: TOOL_DESCRIPTIONS[id].shortcut,
}));

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
  if (tool === 'context-search') return <ContextSearchPanel />;
  if (tool === 'kanji-inspector') return <KanjiInspectorPanel />;
  if (tool === 'youtube-library') return <BlancYoutubePanel />;
  return <BlancCalendarPanel />;
}

function BlancToolsPanel({
  onOpenBook,
  grammarRequest,
  toolRequest,
}: {
  onOpenBook: (item: LibraryItem) => void;
  grammarRequest: { id: string; key: number } | null;
  toolRequest: { id: BlancToolId; key: number } | null;
}) {
  const [toolboxSettings, setToolboxSettings] = useState<ToolboxSettings>(() => loadToolboxSettings());
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(() => loadToolboxSettings().sidebarExpanded);
  const [favorites, setFavorites] = useState<BlancToolId[]>(() =>
    readFavorites(loadToolboxSettings().favoriteTools),
  );
  const [recent, setRecent] = useState<BlancToolId[]>(() => readToolList(BLANC_RECENT_TOOLS_KEY));
  const [tool, setTool] = useState<BlancToolId>(() => {
    try {
      const savedSettings = loadToolboxSettings();
      if (!savedSettings.restoreLastTool) {
        return BLANC_TOOL_IDS.includes(savedSettings.defaultTool as BlancToolId)
          ? (savedSettings.defaultTool as BlancToolId)
          : 'calculator';
      }
      const saved = window.localStorage.getItem(BLANC_LAST_TOOL_KEY) as BlancToolId | null;
      return saved && BLANC_TOOL_IDS.includes(saved) ? saved : 'calculator';
    } catch {
      return 'calculator';
    }
  });
  const [openTabs, setOpenTabs] = useState<BlancToolId[]>(() => {
    try {
      if (!loadToolboxSettings().restoreTabs) return [];
      const savedTabs = readToolList(BLANC_OPEN_TABS_KEY);
      if (savedTabs.length) return savedTabs.slice(-6);
      const saved = window.localStorage.getItem(BLANC_LAST_TOOL_KEY) as BlancToolId | null;
      return [saved && BLANC_TOOL_IDS.includes(saved) ? saved : 'calculator'];
    } catch {
      return ['calculator'];
    }
  });
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (haystack: string): boolean =>
    toolboxSettings.fuzzySearch
      ? fuzzyIncludes(haystack.toLowerCase(), normalizedQuery)
      : haystack.toLowerCase().includes(normalizedQuery);
  const activeTool = BLANC_TOOLS.find((item) => item.id === tool) ?? BLANC_TOOLS[0];
  const matchingTools = BLANC_TOOLS.filter((item) => {
    // The enabled/hidden lists are `ToolboxModuleId[]` and are re-sanitised
    // against TOOLBOX_MODULES on every load, so a Blanc-only id can never be a
    // member of one. Gating on them by name hid all nine Pillar 2 ports; see
    // blancToolVisibility.ts for the measurement and the negative control.
    if (!isToolLaunchable(item.id, toolboxSettings, Boolean(normalizedQuery))) return false;
    if (!normalizedQuery) return true;
    const haystack = [
      toolboxSettings.searchToolsByTitle ? item.label : '',
      toolboxSettings.searchToolDescriptions ? item.description : '',
      TOOL_CATEGORY_LABELS[item.category],
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
  useEffect(() => {
    if (toolRequestKey === null || !toolRequestId) return;
    chooseTool(toolRequestId);
  }, [toolRequestKey, toolRequestId]);

  const closeToolTab = (closing: BlancToolId): void => {
    setOpenTabs((current) => {
      const nextTabs = current.filter((id) => id !== closing);
      if (closing === tool) {
        const fallback = nextTabs[nextTabs.length - 1] ?? 'calculator';
        setTool(fallback);
        try {
          window.localStorage.setItem(BLANC_LAST_TOOL_KEY, fallback);
        } catch {
          /* ignore */
        }
        return nextTabs.length ? nextTabs : [fallback];
      }
      return nextTabs.length ? nextTabs : ['calculator'];
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
      if (id === 'toolbox.search') onFocusSearch();
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
    <div className="blanc-tool-tabs" role="tablist" aria-label="Open toolbox tools">
      {openTabs.map((id) => {
        const item = BLANC_TOOLS.find((candidate) => candidate.id === id);
        if (!item) return null;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tool === id}
            className={tool === id ? 'active' : ''}
            title={tip(`Switch to ${item.label}`)}
            onClick={() => chooseTool(id)}
          >
            {toolboxSettings.showTabIcons && <Icon name={item.icon} size={13} />}
            <span>{item.label}</span>
            <span
              role="button"
              tabIndex={0}
              className="blanc-tab-close"
              title={tip(`Close ${item.label} tab`)}
              aria-label={`Close ${item.label} tab`}
              onClick={(event) => {
                event.stopPropagation();
                closeToolTab(id);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                event.stopPropagation();
                closeToolTab(id);
              }}
            >
              x
            </span>
          </button>
        );
      })}
    </div>
  );

  if (!toolboxSettings.enabled) {
    return (
      <div className="blanc-panel blanc-tools-panel">
        <fieldset>
          <legend>Toolbox</legend>
          <p className="blanc-note">The Toolbox is disabled in Toolbox settings. Tools stay installed; only this launcher is off.</p>
          <div className="blanc-row-actions">
            <button type="button" onClick={() => saveToolboxSettings({ enabled: true })}>
              Enable Toolbox
            </button>
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: 'settings' }))}
            >
              Open Settings
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
            placeholder="Search tools"
            aria-label="Search toolbox tools"
          />
        </label>
        <button
          type="button"
          className="blanc-icon-btn"
          title={tip(sidebarOpen ? 'Collapse tool launcher' : 'Expand tool launcher')}
          onClick={() => setSidebar(!sidebarOpen)}
        >
          <Icon name="settings" size={15} />
        </button>
      </header>

      <div className="blanc-workbench">
        <aside className="blanc-tool-launcher" aria-label="Tool launcher">
          {toolboxSettings.showFavoritesSection && favorites.length > 0 && (
            <div className="blanc-tool-strip" aria-label="Favorite tools">
              {favorites.map((id) => {
                const item = BLANC_TOOLS.find((candidate) => candidate.id === id);
                if (!item) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className={tool === id ? 'active' : ''}
                    title={tip(`Favorite: ${item.label}`)}
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
              <span>Recent</span>
              {recent.map((id) => {
                const item = BLANC_TOOLS.find((candidate) => candidate.id === id);
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
                {toolboxSettings.showCategoryHeaders && <h3>{TOOL_CATEGORY_LABELS[category]}</h3>}
                {tools.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`blanc-tool-launch${tool === item.id ? ' active' : ''}`}
                    title={tip(`${item.label}: ${item.description}`)}
                    onClick={() => chooseTool(item.id)}
                  >
                    <Icon name={item.icon} size={16} />
                    <span>
                      <strong>{item.label}</strong>
                      {toolboxSettings.showToolDescriptions && <small>{item.description}</small>}
                    </span>
                    {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  </button>
                ))}
              </section>
            );
          })}

          {commandResults.length > 0 && (
            <section className="blanc-tool-section" aria-label="Matching commands">
              {toolboxSettings.showCategoryHeaders && <h3>Commands</h3>}
              {commandResults.map((command) => (
                <button
                  key={command.id}
                  type="button"
                  className="blanc-tool-launch blanc-command-result"
                  title={tip(command.description)}
                  onClick={() => runCommand(command.id)}
                >
                  <Icon name="wrench" size={16} />
                  <span>
                    <strong>{command.name}</strong>
                    {toolboxSettings.showCommandDescriptions && <small>{command.description}</small>}
                  </span>
                  {toolboxSettings.showCommandShortcutLabels && commandBindings.get(command.id) && (
                    <kbd>{formatKeysDisplay(commandBindings.get(command.id) ?? '')}</kbd>
                  )}
                </button>
              ))}
            </section>
          )}

          {normalizedQuery && visibleTools.length === 0 && commandResults.length === 0 && (
            <p className="blanc-note">No tools or commands match "{query.trim()}".</p>
          )}
        </aside>

        <section className="blanc-tool-workspace" aria-label={activeTool.label}>
          <header className="blanc-active-tool-head">
            <div>
              <span className="blanc-tool-kicker">{TOOL_CATEGORY_LABELS[activeTool.category]}</span>
              <h2>{activeTool.label}</h2>
            {toolboxSettings.showToolDescriptions && <p>{activeTool.description}</p>}
            </div>
            <div className="blanc-row-actions">
              <button
                type="button"
                className={`blanc-icon-btn${favorites.includes(activeTool.id) ? ' active' : ''}`}
                title={tip(favorites.includes(activeTool.id) ? `Unpin ${activeTool.label}` : `Pin ${activeTool.label}`)}
                onClick={() => toggleFavorite(activeTool.id)}
              >
                <Icon name="bookmark" size={15} />
              </button>
            </div>
          </header>
          {toolboxSettings.openToolsInTabs && toolboxSettings.tabPosition === 'top' && tabStrip}
          <div className="blanc-embedded-view">
            <Suspense fallback={<div className="blanc-loading">Loading...</div>}>
              {renderBlancTool(tool, onOpenBook, grammarRequest)}
            </Suspense>
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
        <legend>Feature Coverage</legend>
        <p className="blanc-note">
          Not every requested toolbox feature is fully implemented yet. This table shows what is already real in Blanc, what is experimental, and what is still planned for shared service or GitHub/OSS adapter work.
        </p>
        <div className="blanc-status-row">
          <span>Ready: {ready}</span>
          <span>Experimental: {experimental}</span>
          <span>Adapter needed: {adapterNeeded}</span>
          <span>Total tracked: {modules.length}</span>
        </div>
      </fieldset>
      <fieldset>
        <legend>Modules</legend>
        <div className="blanc-table-scroll">
          <table className="blanc-coverage-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Status</th>
                <th>{t('blanc.settings.col.category')}</th>
                <th>Blanc</th>
                <th>Normal OS</th>
                <th>Side</th>
                <th>Shortcut</th>
                <th>Automation</th>
                <th>Adapter</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((module) => (
                <tr key={module.id}>
                  <td>{module.label}</td>
                  <td><span className={`blanc-status ${module.status}`}>{module.status}</span></td>
                  <td>{module.category}</td>
                  <td>{module.appearsInBlanc ? 'Yes' : 'Later'}</td>
                  <td>{module.appearsInNormalOs ? 'Yes' : 'Later'}</td>
                  <td>{module.launchContexts.includes('side-agent') ? 'Yes' : '-'}</td>
                  <td>{module.supportsGlobalShortcut ? 'Yes' : '-'}</td>
                  <td>{module.supportsAutomation ? 'Yes' : '-'}</td>
                  <td>{module.externalAdapter.strategy}</td>
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
  const [expression, setExpression] = useState('2 + 2');
  const result = useMemo(() => calculateToolboxExpression(expression), [expression]);
  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Calculator</legend>
        <label>
          Expression
          <input
            value={expression}
            onChange={(event) => setExpression(event.target.value)}
            placeholder="Example: (12.5 + 4) / 3"
          />
        </label>
        <div className="blanc-result-box">
          {result.ok && typeof result.value === 'number'
            ? formatToolboxNumber(result.value)
            : result.error}
        </div>
        <p className="blanc-note">Offline basic arithmetic only: +, -, *, /, %, parentheses, and ^ for exponent.</p>
      </fieldset>
    </div>
  );
}

const UNIT_OPTIONS = Object.entries(TOOLBOX_UNITS) as Array<[ToolboxUnit, (typeof TOOLBOX_UNITS)[ToolboxUnit]]>;

function UnitConverterPanel() {
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState<ToolboxUnit>('m');
  const [to, setTo] = useState<ToolboxUnit>('cm');
  const numericValue = Number(value);
  const result = convertToolboxUnit(numericValue, from, to);
  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Unit Converter</legend>
        <div className="blanc-form-grid">
          <label>
            Value
            <input value={value} onChange={(event) => setValue(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            From
            <select value={from} onChange={(event) => setFrom(event.target.value as ToolboxUnit)}>
              {UNIT_OPTIONS.map(([id, unit]) => (
                <option key={id} value={id}>{unit.label}</option>
              ))}
            </select>
          </label>
          <label>
            To
            <select value={to} onChange={(event) => setTo(event.target.value as ToolboxUnit)}>
              {UNIT_OPTIONS.map(([id, unit]) => (
                <option key={id} value={id}>{unit.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="blanc-result-box">
          {result.ok && typeof result.value === 'number'
            ? `${formatToolboxNumber(result.value)} ${to}`
            : result.error}
        </div>
        <p className="blanc-note">Static offline units only. Currency is intentionally not included here because rates need dated online data.</p>
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

function FocusTimerPanel() {
  const [mode, setMode] = useState<'countdown' | 'stopwatch'>('countdown');
  const [minutes, setMinutes] = useState(25);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    if (!running) return undefined;
    const id = window.setInterval(() => {
      setSeconds((current) => {
        if (mode === 'stopwatch') return current + 1;
        if (current <= 1) {
          setRunning(false);
          if (soundOn) {
            try {
              window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: 'Focus timer finished.', kind: 'ok' } }));
            } catch {
              /* ignore */
            }
          }
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [mode, running, soundOn]);

  const reset = (): void => {
    setRunning(false);
    setSeconds(mode === 'countdown' ? minutes * 60 : 0);
    setLaps([]);
  };

  const switchMode = (next: 'countdown' | 'stopwatch'): void => {
    setMode(next);
    setRunning(false);
    setSeconds(next === 'countdown' ? minutes * 60 : 0);
    setLaps([]);
  };

  const setPreset = (next: number): void => {
    setMinutes(next);
    setRunning(false);
    setSeconds(next * 60);
    setLaps([]);
  };

  const recordLap = (): void => {
    setLaps((current) => [seconds, ...current].slice(0, 8));
  };

  useEffect(() => {
    const offStart = registerCommandHandler('focusTimer.startPause', () => {
      setRunning((current) => !current);
      return true;
    });
    const offReset = registerCommandHandler('focusTimer.reset', () => {
      reset();
      return true;
    });
    return () => {
      offStart();
      offReset();
    };
  }, [mode, minutes]);

  return (
    <div className="blanc-focus-workspace">
      <section className="blanc-focus-main">
        <div className="blanc-segmented" role="group" aria-label="Timer mode">
          <button type="button" className={mode === 'countdown' ? 'active' : ''} onClick={() => switchMode('countdown')} title="Countdown mode">Countdown</button>
          <button type="button" className={mode === 'stopwatch' ? 'active' : ''} onClick={() => switchMode('stopwatch')} title="Stopwatch mode">Stopwatch</button>
        </div>
        <div className="blanc-timer-display">{formatTimerSeconds(seconds)}</div>
        <div className="blanc-focus-actions">
          <button type="button" className="blanc-primary-action" onClick={() => setRunning((current) => !current)} title={running ? 'Pause timer' : 'Start timer'}>
            {running ? 'Pause' : 'Start'}
          </button>
          <button type="button" onClick={reset} title="Reset timer">Reset</button>
          <button type="button" onClick={recordLap} title="Record current time">Lap</button>
        </div>
        <p className="blanc-note">Shortcuts: Ctrl+Shift+Space start/pause, Ctrl+Shift+Backspace reset. Controls remain fully reachable by keyboard focus.</p>
      </section>

      <aside className="blanc-focus-side">
        <section>
          <h3>Presets</h3>
          <div className="blanc-preset-grid">
            {[5, 15, 25, 45].map((preset) => (
              <button key={preset} type="button" className={minutes === preset && mode === 'countdown' ? 'active' : ''} onClick={() => setPreset(preset)} title={`${preset} minute preset`}>
                {preset}m
              </button>
            ))}
          </div>
          {mode === 'countdown' && (
            <label className="blanc-focus-custom">
              Custom minutes
              <input
                type="number"
                min={1}
                max={240}
                value={minutes}
                onChange={(event) => {
                  const next = Math.max(1, Math.min(240, Number(event.target.value) || 1));
                  setMinutes(next);
                  if (!running) setSeconds(next * 60);
                }}
              />
            </label>
          )}
        </section>
        <section>
          <h3>Options</h3>
          <label className="blanc-check">
            <input type="checkbox" checked={soundOn} onChange={(event) => setSoundOn(event.target.checked)} />
            <span>Completion notice</span>
          </label>
        </section>
        <section>
          <h3>Laps</h3>
          {laps.length ? (
            <ol className="blanc-lap-list">
              {laps.map((lap, index) => (
                <li key={`${lap}-${index}`}>{formatTimerSeconds(lap)}</li>
              ))}
            </ol>
          ) : (
            <p className="blanc-note">No laps recorded.</p>
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

function formatUptime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const days = Math.floor(safe / 86400);
  const hours = Math.floor((safe % 86400) / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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
  const [metrics, setMetrics] = useState<BlancSystemMetrics | null>(null);
  const [storage, setStorage] = useState<BlancStorageEstimate | null>(null);
  const [status, setStatus] = useState('Loading system metrics...');

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const next = await window.api.systemGetMetrics();
      setMetrics(next);
      setStatus('Live metrics refreshed.');
    } catch {
      setMetrics(null);
      setStatus('System metrics are unavailable.');
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
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const ramUsed = metrics ? Math.max(0, metrics.totalmem - metrics.freemem) : 0;
  const ramPct = metrics && metrics.totalmem > 0 ? (ramUsed / metrics.totalmem) * 100 : 0;
  const cpuPct = metrics ? metrics.cpuLoad * 100 : 0;
  const storagePct = storage && storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0;
  const batteryPct = metrics?.battery != null ? metrics.battery * 100 : null;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>System Monitor</legend>
        <p className="blanc-note">
          Local CPU, RAM, uptime, battery, and browser storage. GPU/process details stay planned until a native adapter is added.
        </p>
        {metrics ? (
          <div className="blanc-monitor-grid">
            <BlancMeter label="CPU" value={cpuPct} detail="Current sampled load" />
            <BlancMeter
              label="RAM"
              value={ramPct}
              detail={`${formatBytes(ramUsed)} used of ${formatBytes(metrics.totalmem)}`}
            />
            {storage && (
              <BlancMeter
                label="Storage"
                value={storagePct}
                detail={`${formatBytes(storage.usage)} used of ${formatBytes(storage.quota)} browser quota`}
              />
            )}
            {batteryPct != null && (
              <BlancMeter
                label="Battery"
                value={batteryPct}
                detail={metrics.onBattery ? 'On battery power' : 'Plugged in'}
              />
            )}
          </div>
        ) : (
          <p className="blanc-error">{status}</p>
        )}
        <div className="blanc-status-row">
          {metrics && <span>Platform: {metrics.platform}</span>}
          {metrics && <span>Uptime: {formatUptime(metrics.uptime)}</span>}
          <span>{status}</span>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void refresh()}>Refresh</button>
        </div>
      </fieldset>
    </div>
  );
}

const BLANC_QUICK_NOTES_KEY = 'jp-study.blanc.quickNotes';

function QuickNotesPanel() {
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

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Quick Notes</legend>
        <p className="blanc-warning">Blanc quick notes are local to Blanc. They do not transfer to the main app memory/settings yet.</p>
        <textarea
          rows={12}
          value={notes}
          placeholder="Plain toolbox notes, source links, capture ideas, small checklists..."
          onChange={(event) => save(event.target.value)}
        />
        <div className="blanc-row-actions">
          <button type="button" onClick={() => save('')}>Clear</button>
          <span className="blanc-note">{saved ? 'Saved' : `${notes.length} characters`}</span>
        </div>
      </fieldset>
    </div>
  );
}

function formatDateTime(ms: number): string {
  if (!Number.isFinite(ms)) return '-';
  return new Date(ms).toLocaleString([], {
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
  const [root, setRoot] = useState('');
  const [query, setQuery] = useState('');
  const [extensions, setExtensions] = useState('');
  const [results, setResults] = useState<ToolboxFileSearchResult[]>([]);
  const [scanned, setScanned] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Choose a folder and enter a filename search.');

  const chooseFolder = async (): Promise<void> => {
    const picked = await window.api.toolboxPickSearchFolder();
    if (!picked) return;
    setRoot(picked);
    setStatus('Folder selected.');
  };

  const search = async (): Promise<void> => {
    setBusy(true);
    setStatus('Searching...');
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
        setStatus(response.error ?? 'Search failed.');
        return;
      }
      setResults(response.results ?? []);
      setScanned(response.scanned ?? 0);
      setTruncated(response.truncated === true);
      setStatus(
        `${response.results?.length ?? 0} result(s), ${response.scanned ?? 0} files scanned${response.truncated ? ', capped' : ''}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  };

  const copyPath = async (filePath: string): Promise<void> => {
    await navigator.clipboard.writeText(filePath);
    setStatus('Path copied.');
  };

  const openPath = async (filePath: string): Promise<void> => {
    const error = await window.api.launchTarget(filePath);
    setStatus(error ?? 'Opened.');
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>File Search</legend>
        <p className="blanc-note">
          Capped local filename search. This does not index file contents yet, so it stays fast and predictable inside Blanc.
        </p>
        <div className="blanc-form-grid">
          <label>
            Folder
            <input value={root} onChange={(event) => setRoot(event.target.value)} placeholder="Choose or paste a folder path" />
          </label>
          <label>
            Name contains
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="anki, book, .srt..." />
          </label>
          <label>
            Extensions
            <input value={extensions} onChange={(event) => setExtensions(event.target.value)} placeholder="Optional: epub, srt, mp3" />
          </label>
        </div>
        <div className="blanc-row-actions">
          <button type="button" onClick={() => void chooseFolder()}>Choose folder</button>
          <button type="button" disabled={busy || !root.trim() || !query.trim()} onClick={() => void search()}>
            {busy ? 'Searching...' : 'Search'}
          </button>
          <span className="blanc-note">{status}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>Results</legend>
        {results.length > 0 ? (
          // A plain <table> here would put up to 500 raw <tr> rows in the DOM
          // at once (toolboxFileSearch's cap) — VirtualList only keeps the
          // rows intersecting the viewport mounted, so this renders as a
          // CSS-grid row list instead of an HTML table.
          <div className="blanc-file-search-results">
            <div className="blanc-file-search-row blanc-file-search-header">
              <span>Name</span>
              <span>Type</span>
              <span>Size</span>
              <span>Modified</span>
              <span>Actions</span>
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
                  <span>{result.isDirectory ? 'Folder' : result.ext || 'file'}</span>
                  <span>{result.isDirectory ? '-' : formatBytes(result.size)}</span>
                  <span>{formatDateTime(result.modifiedMs)}</span>
                  <span className="blanc-row-actions">
                    <button type="button" onClick={() => void openPath(result.path)}>Open</button>
                    <button type="button" onClick={() => void copyPath(result.path)}>Copy path</button>
                  </span>
                </div>
              )}
            />
          </div>
        ) : (
          <p className="blanc-note">No results yet.</p>
        )}
        <p className="blanc-note">
          Scanned {scanned} file(s). {truncated ? 'Search stopped at the safety cap; narrow the folder or query.' : 'Results are within the safety cap.'}
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
    setStatus('Hashing...');
    try {
      setHash(await sha256File(file));
      setStatus('SHA-256 ready.');
    } catch {
      setStatus('Could not hash this file.');
    }
  };

  const copyHash = async (): Promise<void> => {
    if (!hash) return;
    await navigator.clipboard.writeText(hash);
    setStatus('Hash copied.');
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Hash Checker</legend>
        <p className="blanc-note">
          Generate SHA-256 for a local file and compare it with an expected hash. A match verifies identity against that supplied value, not general safety.
        </p>
        <label>
          File
          <input type="file" onChange={(event) => void pickFile(event.target.files?.[0])} />
        </label>
        {fileName && <p className="blanc-note">Selected: {fileName}</p>}
        <label>
          Expected SHA-256
          <input
            value={expected}
            onChange={(event) => setExpected(event.target.value)}
            placeholder="Paste expected hash"
          />
        </label>
        <div className="blanc-result-box is-wrap">
          {hash || status || 'No file hashed yet.'}
        </div>
        <div className="blanc-row-actions">
          <button type="button" disabled={!hash} onClick={() => void copyHash()}>Copy hash</button>
          {hashMatches && <span className="blanc-status ready">Match</span>}
          {hashMismatch && <span className="blanc-status adapter-needed">Mismatch</span>}
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
  const [sourceName, setSourceName] = useState('');
  const [sourceSize, setSourceSize] = useState(0);
  const [sourceUrl, setSourceUrl] = useState('');
  const [outputUrl, setOutputUrl] = useState('');
  const [outputSize, setOutputSize] = useState(0);
  const [format, setFormat] = useState<ImageOutputFormat>('image/webp');
  const [quality, setQuality] = useState(0.86);
  const [status, setStatus] = useState('Choose an image.');

  useEffect(() => () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
  }, [sourceUrl, outputUrl]);

  const chooseFile = (file: File | undefined): void => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setStatus('Choose an image file.');
      return;
    }
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    if (outputUrl) URL.revokeObjectURL(outputUrl);
    setSourceName(file.name);
    setSourceSize(file.size);
    setSourceUrl(URL.createObjectURL(file));
    setOutputUrl('');
    setOutputSize(0);
    setStatus('Ready to convert.');
  };

  const convert = async (): Promise<void> => {
    if (!sourceUrl) {
      setStatus('Choose an image first.');
      return;
    }
    setStatus('Converting...');
    try {
      const image = new Image();
      image.decoding = 'async';
      image.src = sourceUrl;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');
      if (format === 'image/jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, format, format === 'image/png' ? undefined : quality);
      });
      if (!blob) throw new Error('Conversion failed.');
      if (outputUrl) URL.revokeObjectURL(outputUrl);
      setOutputUrl(URL.createObjectURL(blob));
      setOutputSize(blob.size);
      setStatus('Converted.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not convert this image.');
    }
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Image Converter</legend>
        <p className="blanc-note">Local image conversion through browser canvas. PNG, JPEG, and WebP are supported here; heavier batch formats can use OSS adapters later.</p>
        <label>
          Image
          <input type="file" accept="image/*" onChange={(event) => chooseFile(event.target.files?.[0])} />
        </label>
        <div className="blanc-form-grid">
          <label>
            Output
            <select value={format} onChange={(event) => setFormat(event.target.value as ImageOutputFormat)}>
              <option value="image/webp">WebP</option>
              <option value="image/png">PNG</option>
              <option value="image/jpeg">JPEG</option>
            </select>
          </label>
          <label>
            Quality
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
          <button type="button" disabled={!sourceUrl} onClick={() => void convert()}>Convert</button>
          {outputUrl && (
            <a className="blanc-file-link" href={outputUrl} download={imageOutputName(sourceName, format)}>
              Save {imageOutputName(sourceName, format)}
            </a>
          )}
          <span className="blanc-note">{status}</span>
        </div>
      </fieldset>
      {sourceUrl && (
        <fieldset>
          <legend>Preview</legend>
          <div className="blanc-image-preview">
            <img src={sourceUrl} alt={sourceName} />
          </div>
          <p className="blanc-note">
            Source: {sourceName} ({formatBytes(sourceSize)})
            {outputSize ? ` | Output: ${formatBytes(outputSize)}` : ''}
          </p>
        </fieldset>
      )}
    </div>
  );
}

function AutomationBuilderPanel() {
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
        ? `Launched${result.pid ? `, pid ${result.pid}` : ''}. Stop session recording with ${AUTOMATION_BUILDER.stopKey}.`
        : result.error ?? 'Automation Builder could not be launched.',
    );
  }, []);

  useEffect(() => registerCommandHandler('automation.runSelected', () => {
    void launchBuilder();
    return true;
  }), [launchBuilder]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{AUTOMATION_BUILDER.name}</legend>
        <p className="blanc-note">
          Existing Windows automation builder detected as a PowerShell side tool. It records cursor movement, clicks, keys, waits, and session configs without adding AI to Blanc.
        </p>
        <div className="blanc-command-row">
          <input
            readOnly
            value={command ?? 'automation-builder.ps1 was not found in this install.'}
            aria-label="Automation Builder launch command"
          />
          <button type="button" onClick={() => void launchBuilder()}>
            Launch
          </button>
          <button type="button" onClick={() => void copyCommand()} disabled={!command}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        {launchMsg && <p className="blanc-note">{launchMsg}</p>}
      </fieldset>
      <div className="blanc-grid two">
        <fieldset>
          <legend>Capabilities</legend>
          <table>
            <tbody>
              {AUTOMATION_BUILDER.capabilities.map((item) => (
                <tr key={item}>
                  <td>{item}</td>
                  <td>Available</td>
                </tr>
              ))}
            </tbody>
          </table>
        </fieldset>
        <fieldset>
          <legend>Safety</legend>
          <ul className="blanc-plain-list">
            {AUTOMATION_BUILDER.safetyNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </fieldset>
      </div>
      <fieldset>
        <legend>Migration</legend>
        <p className="blanc-note">
          Config folder: <code>{AUTOMATION_BUILDER.configDir}</code>. This is separate from Blanc memory and from the main Study OS settings.
        </p>
        <ul className="blanc-plain-list">
          {AUTOMATION_BUILDER.migrationNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
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
  const [pin, setPin] = useState('');
  const [pinMsg, setPinMsg] = useState('');
  const [lockOn, setLockOn] = useState(() => loadLockscreen().enabled);
  const [pinSet, setPinSet] = useState(() => hasLockscreenPin());
  const [memory, setMemory] = useState<BlancMemorySettings>(() => loadBlancMemory());
  const [toolboxSettings, setToolboxSettings] = useState<ToolboxSettings>(() => loadToolboxSettings());
  const [themeHistoryCount, setThemeHistoryCount] = useState(() => loadBlancThemeHistory().length);
  const [settingsQuery, setSettingsQuery] = useState('');
  const [settingsImport, setSettingsImport] = useState('');
  const [settingsMsg, setSettingsMsg] = useState('');
  // Draft for the custom-CSS textarea, committed on Apply rather than per
  // keystroke: applying re-injects two stylesheets, not worth doing on every key.
  // Re-syncs when the persisted value changes elsewhere (import / clear).
  const [cssDraft, setCssDraft] = useState(() => loadToolboxSettings().customCss);

  useEffect(() => onBlancMemoryChanged(setMemory), []);
  useEffect(() => onToolboxSettingsChanged(setToolboxSettings), []);
  useEffect(() => setCssDraft(toolboxSettings.customCss), [toolboxSettings.customCss]);

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

  const toggleTool = (id: ToolboxModuleId, enabled: boolean): void => {
    if (id === 'calculator' && !enabled) {
      setSettingsMsg(t('blanc.settings.calculatorLocked'));
      return;
    }
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
  const orderableTools = orderToolIds(
    BLANC_TOOLS.map((item) => item.id).filter((id): id is ToolboxModuleId =>
      id !== 'coverage' && toolboxSettings.enabledTools.includes(id as ToolboxModuleId),
    ),
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

  const moveTool = (id: ToolboxModuleId, delta: -1 | 1): void => {
    patchToolbox({ toolOrder: moveToolInOrder(orderableTools, id, delta, toolboxSettings.toolOrder) });
  };

  const resetToolOrder = (): void => {
    patchToolbox({ toolOrder: [] });
    // Plain string, not a t() key: adding one would mean editing all four
    // catalog files, which a parallel session is currently writing to. Blanc
    // chrome is outside the i18n sweep by policy anyway (plan, Pillar 8).
    setSettingsMsg('Launcher order reset to the default.');
  };

  const resetToolboxCategory = (category: ToolboxSettingsCategory): void => {
    setToolboxSettings(resetToolboxSettingsCategory(category));
    setSettingsMsg(t('blanc.settings.resetCategoryDone', { category: t(`blanc.settings.category.${category}`) }));
  };

  const visibleDefinitions = TOOLBOX_SETTING_DEFINITIONS.filter((definition) => {
    const query = settingsQuery.trim().toLowerCase();
    if (!query) return true;
    return [definition.id, definition.category, definition.description, ...definition.keywords]
      .join(' ')
      .toLowerCase()
      .includes(query);
  });

  const savePin = (): void => {
    const next = setLockscreenPin(pin);
    if (!next) {
      setPinMsg(t('blanc.settings.pinFourDigits'));
      return;
    }
    setPin('');
    setPinSet(true);
    setPinMsg(t('blanc.settings.pinSaved'));
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

      <fieldset data-blanc-setting="models" tabIndex={-1}>
        <legend>{t('blanc.settings.models')}</legend>
        <p className="blanc-note">{t('blanc.settings.modelsDesc')}</p>
        <BlancModelsPanel />
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
        <label className="blanc-check">
          <input
            type="checkbox"
            checked={memory.restoreReaderOnLaunch}
            onChange={(event) => patchMemory({ restoreReaderOnLaunch: event.target.checked })}
          />
          <span>{t('blanc.settings.restoreReader')}</span>
        </label>
        <label className="blanc-range-row">
          <span>{t('blanc.settings.reviewLimit')}</span>
          <input
            type="number"
            min={5}
            max={200}
            value={memory.localReviewLimit}
            onChange={(event) => patchMemory({ localReviewLimit: Number(event.target.value) })}
          />
        </label>
        <label>
          {t('blanc.settings.scratchpad')}
          <textarea
            rows={4}
            value={memory.scratchpad}
            placeholder={t('blanc.settings.scratchpadPlaceholder')}
            onChange={(event) => patchMemory({ scratchpad: event.target.value })}
          />
        </label>
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
        <div className="blanc-settings-toolbar">
          <input
            value={settingsQuery}
            onChange={(event) => setSettingsQuery(event.target.value)}
            placeholder={t('blanc.settings.searchSettings')}
            aria-label={t('blanc.settings.searchSettings')}
          />
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
                setSettingsMsg(result.error);
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
              onChange={(event) => patchToolbox({ defaultTool: event.target.value as ToolboxModuleId })}
            >
              {listBlancToolboxModules().map((module) => (
                <option key={module.id} value={module.id}>
                  {module.label}
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

        <details>
          <summary>{t('blanc.settings.definitions', { count: visibleDefinitions.length })}</summary>
          <div className="blanc-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('blanc.settings.col.setting')}</th>
                  <th>Category</th>
                  <th>{t('blanc.settings.col.description')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleDefinitions.map((definition) => (
                  <tr key={definition.id}>
                    <td>{definition.id}</td>
                    <td>{definition.category}</td>
                    <td>{definition.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </fieldset>

      <fieldset data-blanc-setting="theme" tabIndex={-1}>
        <legend>Theme</legend>
        <div className="blanc-segmented">
          {BLANC_THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              title={preset.description}
              className={toolboxSettings.themePreset === preset.id ? 'active' : ''}
              onClick={() => setThemePreset(preset.id)}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <p className="blanc-note">
          {presetById(toolboxSettings.themePreset)?.description ?? 'Custom palette.'}
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
                  aria-label={token.label}
                />
                <span className="blanc-theme-label">{token.label}</span>
                {overridden ? (
                  <button type="button" onClick={() => clearThemeToken(token.id)} title="Reset this colour">
                    ×
                  </button>
                ) : (
                  <span className="blanc-theme-inherit">
                    {activePresetOverrides[token.id] ? 'preset' : 'default'}
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <div className="blanc-status-row">
          <span>
            {Object.keys(toolboxSettings.themeOverrides).length} of {BLANC_THEME_TOKENS.length} customised
          </span>
          <button
            type="button"
            disabled={!Object.keys(toolboxSettings.themeOverrides).length}
            onClick={() => patchToolbox({ themeOverrides: {} })}
          >
            Clear customisations
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
              setSettingsMsg('Previous theme restored.');
            }}
          >
            Undo theme change
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
              setSettingsMsg('Theme copied to the clipboard as JSON.');
            }}
          >
            Copy theme
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.readText().then((text) => {
                const parsed = parseThemeExport(text);
                if (!parsed) {
                  setSettingsMsg('Clipboard does not contain a Blanc theme.');
                  return;
                }
                patchToolbox({ themePreset: parsed.preset, themeOverrides: parsed.overrides });
                setSettingsMsg('Theme applied from the clipboard.');
              });
            }}
          >
            Paste theme
          </button>
        </div>
        <p className="blanc-note">
          Colours are validated before they reach the stylesheet — only hex, rgb(), hsl(), and a few
          keywords are accepted, so a pasted theme cannot inject CSS or hide Blanc&rsquo;s own
          controls.
        </p>
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
        <legend>Launcher order</legend>
        <p className="blanc-note">
          The order tools appear in the launcher. Only enabled tools are listed; search results are
          left in relevance order. Tools you never move keep their default position, so anything
          added to Blanc later still shows up.
        </p>
        <ol className="blanc-order-list">
          {orderableTools.map((id, index) => {
            const entry = BLANC_TOOLS.find((item) => item.id === id);
            return (
              <li key={id}>
                <span className="blanc-order-index">{index + 1}</span>
                <span className="blanc-order-label">{entry?.label ?? id}</span>
                <button
                  type="button"
                  disabled={index === 0}
                  aria-label={`Move ${entry?.label ?? id} up`}
                  onClick={() => moveTool(id, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === orderableTools.length - 1}
                  aria-label={`Move ${entry?.label ?? id} down`}
                  onClick={() => moveTool(id, 1)}
                >
                  ↓
                </button>
              </li>
            );
          })}
        </ol>
        <div className="blanc-status-row">
          <span>{orderableTools.length} tools</span>
          <button type="button" disabled={!toolboxSettings.toolOrder.length} onClick={resetToolOrder}>
            Reset to default order
          </button>
        </div>

        <p className="blanc-note">Category sections, in the order they appear:</p>
        <ol className="blanc-order-list">
          {orderToolIds(TOOL_CATEGORY_ORDER, toolboxSettings.categoryOrder).map((category, index, list) => (
            <li key={category}>
              <span className="blanc-order-index">{index + 1}</span>
              <span className="blanc-order-label">{TOOL_CATEGORY_LABELS[category]}</span>
              <button
                type="button"
                disabled={index === 0}
                aria-label={`Move the ${TOOL_CATEGORY_LABELS[category]} section up`}
                onClick={() => moveCategory(category, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                disabled={index === list.length - 1}
                aria-label={`Move the ${TOOL_CATEGORY_LABELS[category]} section down`}
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
              setSettingsMsg('Category order reset to the default.');
            }}
          >
            Reset section order
          </button>
        </div>
      </fieldset>

      <fieldset data-blanc-setting="tool-visibility" tabIndex={-1}>
        <legend>{t('blanc.settings.toolVisibility')}</legend>
        <div className="blanc-tool-management">
          {listBlancToolboxModules().map((module) => (
            <div key={module.id} className="blanc-tool-management-row">
              <div>
                <strong>{module.label}</strong>
                <span>{module.category} / {module.status}</span>
              </div>
              <label className="blanc-check">
                <input
                  type="checkbox"
                  checked={toolboxSettings.enabledTools.includes(module.id)}
                  onChange={(event) => toggleTool(module.id, event.target.checked)}
                />
                <span>{t('blanc.settings.toolEnabled')}</span>
              </label>
              <label className="blanc-check">
                <input
                  type="checkbox"
                  checked={toolboxSettings.hiddenTools.includes(module.id)}
                  onChange={(event) => {
                    const hiddenTools = event.target.checked
                      ? [...toolboxSettings.hiddenTools, module.id]
                      : toolboxSettings.hiddenTools.filter((id) => id !== module.id);
                    patchToolbox({ hiddenTools });
                  }}
                />
                <span>{t('blanc.settings.toolHidden')}</span>
              </label>
            </div>
          ))}
        </div>
      </fieldset>

      <ToolboxShortcutSettingsPanel />

      <fieldset data-blanc-setting="mode" tabIndex={-1}>
        <legend>{t('blanc.settings.mode')}</legend>
        <p className="blanc-note">{t('blanc.settings.modeNote')}</p>
        <button type="button" onClick={() => void setBlancModeEnabled(false)}>
          {t('blanc.settings.exitBlanc')}
        </button>
      </fieldset>
    </div>
  );
}

function ToolboxShortcutSettingsPanel() {
  const { t } = useT();
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
                <strong>{row.label}</strong>
                <span>{row.id} / {meta?.scope ?? 'toolbox'}</span>
                {row.note && <small>{row.note}</small>}
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

export function BlancLockscreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const now = useMinuteClock();

  const submit = (pin: string): void => {
    if (pin.length !== 4) return;
    if (!verifyLockscreenPin(pin)) {
      setDigits('');
      setError('Wrong PIN');
      return;
    }
    onUnlocked();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (/^\d$/.test(event.key)) {
        setDigits((prev) => {
          const next = (prev + event.key).slice(0, 4);
          if (next.length === 4) window.setTimeout(() => submit(next), 40);
          return next;
        });
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        setDigits((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="blanc-lock">
      <section className="blanc-lock-box" role="dialog" aria-modal="true" aria-label="Blanc lockscreen">
        <time className="blanc-lock-time">
          {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </time>
        <div className="blanc-lock-date">
          {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
        </div>
        <label>
          PIN
          <input
            autoFocus
            type="password"
            inputMode="numeric"
            maxLength={4}
            value={digits}
            onChange={(event) => {
              const next = event.target.value.replace(/\D/g, '').slice(0, 4);
              setDigits(next);
              setError('');
              if (next.length === 4) submit(next);
            }}
          />
        </label>
        <div className="blanc-lock-dots" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={i < digits.length ? 'filled' : ''} />
          ))}
        </div>
        {error && <p className="blanc-error">{error}</p>}
      </section>
    </div>
  );
}

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
  const [state, setState] = useState<MonoState>(() => initialMono());
  const keys = useRef(new Set<string>());
  const rotateLatch = useRef(false);
  const dropLatch = useRef(false);

  useEffect(() => {
    const down = (event: KeyboardEvent): void => {
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
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      keys.current.clear();
    };
  }, []);

  useEffect(() => {
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
  }, []);

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
        <legend>Mono Blocks</legend>
        <div className="mono-hud">
          <span>Score {state.score}</span>
          <span>Lines {state.lines}</span>
          <span>Level {state.level}</span>
          <button type="button" onClick={() => setState(initialMono())}>
            Restart
          </button>
        </div>
      </fieldset>
      <div className="mono-board" aria-label="Mono Blocks board">
        {cells.map((filled, index) => (
          <span key={index} className={filled ? 'filled' : ''} />
        ))}
      </div>
      <p className="blanc-note">Move: arrow keys. Rotate: Up, W, X. Reverse rotate: Z. Space hard-drops.</p>
      {state.over && <p className="blanc-error">Game over. Press Restart.</p>}
    </div>
  );
}

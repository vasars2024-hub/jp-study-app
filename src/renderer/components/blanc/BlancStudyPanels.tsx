/**
 * Blanc-native ports of Study OS study surfaces.
 *
 * Pillar 0 rule (BLANC_REFINEMENT_PLAN.md): never mount a Study OS `*View`
 * inside Blanc. These panels compose the same inner content components and the
 * same data layer, wrapped in Blanc chrome (`blanc-tool-detail` +
 * `fieldset`/`legend`). `AppChrome`, `MenuBar`, and `StatusBar` must never be
 * imported here.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import DictionaryResults, { type DictLang } from '../DictionaryResults';
import { getStudyLang, onStudyLangChanged, setStudyLang } from '../../studyEnvironment';
import {
  loadClipboardHistory,
  loadClipboardSettings,
  onClipboardHistoryChanged,
  saveClipboardSettings,
  type ClipboardEntry,
} from '../../clipboardHistory';
import type { LibraryItem } from '../../../shared/types';
import {
  ALL_LEVELS,
  ContinueReadingRow,
  ReadingFinderControls,
  ReadingSiteDetail,
  ReadingSiteGrid,
  levelRangeLabel,
  useReadingFinder,
} from '../reading/ReadingFinderContent';
import {
  ResourceBundleDetail,
  ResourceBundles,
  ResourceGroups,
  ResourceMyTools,
  ResourceNewSection,
  useResources,
} from '../resources/ResourcesContent';
import {
  CalendarBody,
  CalendarNav,
  EventModal,
  toKey,
  useCalendar,
} from '../calendar/CalendarContent';
import { GRAMMAR } from '../../data/grammar';
import { dedupeGrammarByTitle, type PracticeFilters } from '../../data/grammar/practiceFilters';
import GrammarExplorer from '../grammar/GrammarExplorer';
import GrammarPracticePanel from '../grammar/GrammarPracticePanel';
import GrammarCurationPanel from '../grammar/GrammarCurationPanel';
import {
  GrammarDetail,
  GuidesBrowser,
  parsePracticeDeepLink,
} from '../grammar/GrammarContent';
import {
  StatsBooks,
  StatsCards,
  StatsChart,
  StatsShows,
  WordKnowledge,
  useStats,
} from '../stats/StatsContent';
import { formatDuration, formatNumber } from '../../stats';
import {
  AnkiDeckNoteType,
  AnkiDisconnected,
  AnkiFieldMapping,
  AnkiManualCardForm,
  AnkiNoteCss,
  AnkiPreviewPane,
  useAnkiConfig,
} from '../anki/AnkiContent';
import { ProfileSwitcher } from '../ProfileSwitcher';
import {
  LANG_LABELS,
  LANG_ORDER,
  PLACEHOLDERS,
  TranslateHistoryList,
  copyText,
  useTranslate,
} from '../translate/TranslateContent';
import type { TransLang } from '../../translator';
import {
  MusicControls,
  MusicLyricsPane,
  MusicNowPlaying,
  MusicSearchBox,
  MusicSongList,
  MusicYoutubeRow,
  useMusic,
  type SortBy,
} from '../music/MusicContent';
import DictionaryPopup from '../DictionaryPopup';
import {
  NotebookFolders,
  NotebookStreamCounts,
  NotebookTimeline,
  NotebookViewTabs,
  TIMELINE_CAP,
  useNotebook,
} from '../notebook/NotebookContent';

// This panel renders Study OS class names, whose rules live in styles.css.
// Imported here rather than in the boot entry so the 468 KB sheet rides this
// lazy chunk instead of Blanc's boot. See theme/studyos-compat.css.
void import('../../theme/studyos-compat.css');

export function BlancDictionaryPanel() {
  const [lang, setLang] = useState<DictLang>(() => getStudyLang());
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => onStudyLangChanged(setLang), []);

  const isZh = lang === 'zh';

  function submit(e: FormEvent) {
    e.preventDefault();
    setQuery(input.trim());
  }

  function pickLang(next: DictLang) {
    setStudyLang(next);
    setLang(next);
  }

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Lookup</legend>
        <form className="blanc-command-row" onSubmit={submit}>
          <input
            autoFocus
            type="text"
            value={input}
            lang={lang}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isZh ? 'Word or English, e.g. 你好' : 'Word or English, e.g. 食べる'}
          />
          <button type="submit" disabled={!input.trim()}>
            Search
          </button>
          <span className="blanc-segmented">
            <button
              type="button"
              className={!isZh ? 'active' : ''}
              onClick={() => pickLang('ja')}
            >
              日本語
            </button>
            <button
              type="button"
              className={isZh ? 'active' : ''}
              onClick={() => pickLang('zh')}
            >
              中文
            </button>
          </span>
        </form>
        <div className="blanc-status-row">
          <span>{isZh ? 'Chinese' : 'Japanese'}</span>
          <span>{isZh ? 'CC-CEDICT (offline)' : 'JMdict / Jisho'}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>Results</legend>
        {query ? (
          <DictionaryResults query={query} variant="page" lang={lang} />
        ) : (
          <p className="blanc-note">
            {isZh
              ? 'Offline Chinese↔English lookup. Results show pinyin with tone marks; star a result to save it to Flashcards.'
              : 'Search a Japanese word or an English gloss. Star a result to save it to Flashcards.'}
          </p>
        )}
      </fieldset>
    </div>
  );
}

/** Longest run of Japanese script in a clipboard entry, for auto-lookup. */
function japaneseFragment(text: string): string {
  const runs = text.match(/[぀-ヿ㐀-䶿一-鿿]+/g);
  if (!runs || runs.length === 0) return '';
  return runs.sort((a, b) => b.length - a.length)[0];
}

/**
 * Study-native item 1 + the Pillar 0 fix for the `clipboard` tool, which used
 * to host Study OS's `ClipboardWidget` in a bare div.
 *
 * Deliberately does NOT start its own poller or keep its own store: it reads
 * `clipboardHistory`, whose monitor already enforces the ≥4s interval and the
 * skip-while-dragging rule. A second watcher would violate both.
 */
export function BlancClipboardPanel() {
  const [entries, setEntries] = useState<ClipboardEntry[]>(() => loadClipboardHistory());
  const [monitoring, setMonitoring] = useState(() => loadClipboardSettings().monitoringEnabled);
  const [autoLookup, setAutoLookup] = useState(true);
  const [manual, setManual] = useState<string | null>(null);

  useEffect(() => onClipboardHistoryChanged(() => setEntries(loadClipboardHistory())), []);

  const latest = entries[0];
  const autoTerm = useMemo(() => {
    if (!autoLookup || !latest) return '';
    return latest.dictMeta?.expression ?? japaneseFragment(latest.text);
  }, [autoLookup, latest]);

  const term = manual ?? autoTerm;

  function toggleMonitoring(next: boolean) {
    saveClipboardSettings({ monitoringEnabled: next });
    setMonitoring(next);
  }

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Watch</legend>
        <div className="blanc-row-actions">
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={monitoring}
              onChange={(e) => toggleMonitoring(e.target.checked)}
            />
            <span>Watch clipboard</span>
          </label>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={autoLookup}
              onChange={(e) => {
                setAutoLookup(e.target.checked);
                setManual(null);
              }}
            />
            <span>Auto-lookup copied text</span>
          </label>
        </div>
        <p className="blanc-note">
          {monitoring
            ? 'Copy Japanese text in any app; the newest capture is looked up below. Polling is shared with clipboard history (every ~4.5s, paused while a window is being dragged).'
            : 'Watching is off — history and auto-lookup will not update until you re-enable it.'}
        </p>
      </fieldset>

      <fieldset>
        <legend>Recent captures</legend>
        {entries.length === 0 ? (
          <p className="blanc-note">Nothing captured yet.</p>
        ) : (
          <ul className="blanc-plain-list">
            {entries.slice(0, 8).map((e) => {
              const label = e.dictMeta?.expression ?? e.text;
              const pick = e.dictMeta?.expression ?? japaneseFragment(e.text);
              return (
                <li key={e.id}>
                  <button
                    type="button"
                    className="blanc-link-btn"
                    disabled={!pick}
                    onClick={() => setManual(pick)}
                    title={pick ? `Look up ${pick}` : 'No Japanese text in this entry'}
                  >
                    {label.slice(0, 80)}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <fieldset>
        <legend>Lookup</legend>
        {term ? (
          <>
            <div className="blanc-status-row">
              <span lang="ja">{term}</span>
              {manual && (
                <button type="button" onClick={() => setManual(null)}>
                  Follow clipboard again
                </button>
              )}
            </div>
            <DictionaryResults query={term} variant="page" lang="ja" />
          </>
        ) : (
          <p className="blanc-note">
            {autoLookup
              ? 'Copy some Japanese text, or pick a capture above.'
              : 'Auto-lookup is off — pick a capture above to look it up.'}
          </p>
        )}
      </fieldset>
    </div>
  );
}

export function BlancReadingFinderPanel({
  onOpenBook,
}: {
  onOpenBook: (item: LibraryItem) => void;
}) {
  const state = useReadingFinder();

  return (
    <div className="blanc-tool-detail">
      {state.continueReading.length > 0 && (
        <fieldset>
          <legend>Continue reading</legend>
          <ContinueReadingRow state={state} onOpenBook={onOpenBook} />
        </fieldset>
      )}

      <fieldset>
        <legend>Filters</legend>
        <ReadingFinderControls state={state} />
        <div className="blanc-status-row">
          <span>{state.list.length} sites</span>
          <span>
            Level:{' '}
            {levelRangeLabel(state.levels.size ? [...state.levels] : ALL_LEVELS)}
          </span>
          <button type="button" onClick={state.resetFilters}>
            Reset filters
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Sites</legend>
        <ReadingSiteGrid state={state} />
      </fieldset>

      {state.selected && (
        <ReadingSiteDetail
          site={state.selected}
          onClose={() => state.setSelected(null)}
          onOpenBook={onOpenBook}
        />
      )}
    </div>
  );
}

export function BlancResourcesPanel() {
  const state = useResources();

  if (state.selectedBundle) {
    return (
      <div className="blanc-tool-detail">
        <fieldset>
          <legend>Bundle</legend>
          <div className="blanc-row-actions">
            <button type="button" onClick={state.closeBundle}>
              Back to catalogue
            </button>
          </div>
          <ResourceBundleDetail state={state} />
        </fieldset>
      </div>
    );
  }

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Catalogue</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={state.query}
            onChange={(e) => state.setQuery(e.target.value)}
            placeholder="Find a resource…"
          />
          <button
            type="button"
            onClick={() => void state.doRefresh()}
            disabled={state.refreshState === 'refreshing'}
          >
            {state.refreshState === 'refreshing' ? 'Refreshing…' : 'Refresh'}
          </button>
          <button type="button" onClick={() => state.setFilter('All')} disabled={state.filter === 'All'}>
            All
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{state.total} visible</span>
          <span>{state.allTotal} indexed</span>
          <span>{state.bundles.length} bundles</span>
          {state.refreshState === 'offline' && <span>Offline — showing cached catalogue</span>}
        </div>
      </fieldset>

      <fieldset>
        <legend>Categories</legend>
        <div className="blanc-segmented">
          <button
            type="button"
            className={state.filter === 'All' ? 'active' : ''}
            onClick={() => state.setFilter('All')}
          >
            All
          </button>
          {state.allCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={state.filter === cat.id ? 'active' : ''}
              onClick={() => state.setFilter(cat.id)}
              title={cat.blurb}
            >
              {cat.title} ({cat.items.length})
            </button>
          ))}
        </div>
      </fieldset>

      {state.showLanding && state.bundles.length > 0 && (
        <fieldset>
          <legend>Bundles</legend>
          <ResourceBundles state={state} />
        </fieldset>
      )}

      {state.showLanding && state.tools.length > 0 && (
        <fieldset>
          <legend>My tools</legend>
          <ResourceMyTools state={state} />
        </fieldset>
      )}

      {state.showLanding && state.newEntries.length > 0 && (
        <fieldset>
          <legend>Recently added</legend>
          <ResourceNewSection state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>Resources</legend>
        <ResourceGroups state={state} />
      </fieldset>
    </div>
  );
}

export function BlancCalendarPanel() {
  const state = useCalendar();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Navigate</legend>
        <CalendarNav state={state} />
        <div className="blanc-status-row">
          <span>{state.headerLabel}</span>
          <span>{state.events.length} events</span>
          {state.agendaOverdue.length > 0 && <span>{state.agendaOverdue.length} overdue</span>}
          <button type="button" onClick={() => state.openNew(toKey(state.cursor))}>
            New event
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{state.modeLabels[state.mode]}</legend>
        <CalendarBody state={state} />
      </fieldset>

      {state.modal && <EventModal initial={state.modal} onClose={() => state.setModal(null)} />}
    </div>
  );
}

/**
 * Pillar 2 port of `MusicView` — Blanc previously had only the `FocusMusicBar`
 * taskbar widget, no library surface. Playback goes through the same
 * `playerBus`, so opening this panel does not fight the mini-player or the
 * Study OS window: they are one transport.
 *
 * The song list is the shared `VirtualList` build, which is what keeps a
 * thousand-track library from dropping frames while the window is dragged.
 */
export function BlancMusicPanel() {
  const state = useMusic();
  const { ps, currentMeta } = state;
  const lyrics = state.liveLyrics.lyrics;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Library</legend>
        <MusicSearchBox state={state} />
        <div className="blanc-status-row">
          <span>{state.baseSongs.length} songs</span>
          <span>{state.rows.length} rows</span>
          <select
            value={state.sortBy}
            onChange={(e) => state.setSortBy(e.target.value as SortBy)}
            aria-label="Sort songs"
          >
            <option value="recent">Recent</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="folder">Folder</option>
          </select>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={state.likedOnly}
              onChange={() => state.setLikedOnly((v) => !v)}
            />
            <span>Liked only</span>
          </label>
        </div>
        <div className="blanc-music-list">
          <MusicSongList state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Now playing</legend>
        {state.error && <p className="blanc-note">{state.error}</p>}
        <MusicControls state={state} />
        <MusicNowPlaying state={state} />
        {!ps.current && <p className="blanc-note">Pick a song above to start playback.</p>}
      </fieldset>

      <fieldset>
        <legend>
          Lyrics{lyrics.kind === 'synced' ? ` (${lyrics.cues.length} cues)` : ''}
        </legend>
        <div className="blanc-music-lyrics">
          <MusicLyricsPane state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Add from YouTube</legend>
        <MusicYoutubeRow state={state} />
      </fieldset>

      {state.popup && (
        <DictionaryPopup
          query={state.popup.query}
          context={state.activeCueText}
          x={state.popup.x}
          y={state.popup.y}
          onClose={() => state.setPopup(null)}
        />
      )}
    </div>
  );
}

/**
 * Pillar 2 port of `TranslateView` — Blanc had no translate surface at all.
 * Shares `useTranslate` and the history list; the panes are Blanc-native.
 */
export function BlancTranslatePanel() {
  const state = useTranslate();
  const { source, target, input, output, busy, msg, error } = state;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Direction</legend>
        <div className="blanc-command-row">
          <select
            value={source}
            onChange={(e) => state.pickSource(e.target.value as TransLang)}
            aria-label="Source language"
          >
            {LANG_ORDER.filter((l) => l !== target).map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
          <button type="button" onClick={state.swap} title="Swap languages">
            ⇄
          </button>
          <select
            value={target}
            onChange={(e) => state.pickTarget(e.target.value as TransLang)}
            aria-label="Target language"
          >
            {LANG_ORDER.filter((l) => l !== source).map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
          <span className="blanc-segmented">
            <button
              type="button"
              className={state.tab === 'translate' ? 'active' : ''}
              onClick={() => state.setTab('translate')}
            >
              Translate
            </button>
            <button
              type="button"
              className={state.tab === 'history' ? 'active' : ''}
              onClick={() => state.setTab('history')}
            >
              History ({state.history.length})
            </button>
          </span>
        </div>
        <div className="blanc-status-row">
          <span>{input.length} source chars</span>
          <span>Runs locally — the model downloads on first use.</span>
        </div>
      </fieldset>

      {state.tab === 'history' ? (
        <fieldset>
          <legend>History</legend>
          <div className="tr-history">
            <TranslateHistoryList
              state={state}
              onOpenNotebook={() =>
                window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: 'notebook' }))
              }
            />
          </div>
        </fieldset>
      ) : (
        <>
          <fieldset>
            <legend>{LANG_LABELS[source]} source</legend>
            <textarea
              lang={source}
              rows={6}
              value={input}
              onChange={(e) => state.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void state.run();
              }}
              placeholder={`${PLACEHOLDERS[source]}  (Ctrl+Enter)`}
            />
            <div className="blanc-row-actions">
              <button type="button" onClick={() => void state.run()} disabled={busy || !input.trim()}>
                {busy ? 'Working…' : 'Translate'}
              </button>
              <button type="button" onClick={state.clear} disabled={!input && !output}>
                Clear
              </button>
              {busy && <span className="blanc-note">{msg}</span>}
            </div>
            {error && <p className="blanc-note">{error}</p>}
          </fieldset>

          <fieldset>
            <legend>{LANG_LABELS[target]} output</legend>
            <div className="blanc-output" lang={target}>
              {output || <span className="blanc-note">Translation appears here.</span>}
            </div>
            {output && (
              <div className="blanc-row-actions">
                <button type="button" onClick={() => void copyText(output)}>
                  Copy
                </button>
              </div>
            )}
          </fieldset>
        </>
      )}
    </div>
  );
}

/**
 * Pillar 2 port of `NotebookView`. Blanc previously had only `quick-notes`,
 * which the plan keeps deliberately separate (a local scratchpad, not the
 * aggregated notebook).
 *
 * Navigation is Blanc-specific: Study OS's `os:open` bus does not move Blanc's
 * tabs, so hrefs are translated onto the `toolbox:open-tool` /
 * `blanc:select-tab` buses the shell already listens to. A target Blanc has no
 * surface for is reported rather than silently doing nothing.
 */
const NOTEBOOK_HREF_TO_BLANC_TOOL: Record<string, string> = {
  dictionary: 'dictionary',
  grammar: 'grammar',
  clipboard: 'clipboard',
  resources: 'resources',
  calendar: 'calendar',
  notebook: 'notebook',
  immersion: 'immersion-tracker',
};

const NOTEBOOK_HREF_TO_BLANC_TAB: Record<string, string> = {
  flashcards: 'flashcards',
  anki: 'deck',
  'anki-deck': 'deck',
  statistics: 'stats',
  stats: 'stats',
  media: 'media',
  player: 'media',
  video: 'media',
  'epub-mining': 'mine',
  library: 'read',
  novels: 'read',
};

export function BlancNotebookPanel() {
  const state = useNotebook();
  const [unreachable, setUnreachable] = useState<string | null>(null);

  const onOpen = (href?: string): void => {
    if (!href) return;
    const tool = NOTEBOOK_HREF_TO_BLANC_TOOL[href];
    if (tool) {
      setUnreachable(null);
      window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: tool }));
      return;
    }
    const tab = NOTEBOOK_HREF_TO_BLANC_TAB[href];
    if (tab) {
      setUnreachable(null);
      window.dispatchEvent(new CustomEvent('blanc:select-tab', { detail: tab }));
      return;
    }
    setUnreachable(href);
  };

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>View</legend>
        <NotebookViewTabs state={state} />
        <div className="blanc-status-row">
          <span>{state.visible.length} entries</span>
          <span>{state.folders.length} folders</span>
          {state.truncated && <span>showing first {TIMELINE_CAP}</span>}
          <button type="button" onClick={state.refresh}>
            Refresh
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Streams</legend>
        <NotebookStreamCounts state={state} />
      </fieldset>

      <fieldset>
        <legend>Folders</legend>
        <div className="gx-notebook-folders">
          <NotebookFolders state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>Timeline</legend>
        {unreachable && (
          <p className="blanc-note">
            Blanc has no surface for “{unreachable}” — open it from the Study OS window.
          </p>
        )}
        <NotebookTimeline state={state} onOpen={onOpen} />
      </fieldset>
    </div>
  );
}

/**
 * Pillar 0 fix for the `anki` bail-out — the Deck tab's advanced branch used to
 * mount `AnkiView`. Same hook, same IPC, same field-mapping and CSS editors;
 * Blanc supplies `fieldset`/`legend` framing instead of `AppChrome` + the
 * `anki-card` stack, and uses `ProfileSwitcher` rather than Study OS's
 * `ProfileSettingsSection`.
 */
export function BlancAnkiPanel() {
  const state = useAnkiConfig();
  const { status, loading, active, model } = state;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Connection</legend>
        <ProfileSwitcher compact showHeading={false} />
        <div className="blanc-status-row">
          <span className={`blanc-status-dot${status?.connected ? ' ok' : ''}`} />
          <span>{state.connLabel}</span>
          {active.label && <span>Profile: {active.label}</span>}
          <button type="button" onClick={() => void state.check()} disabled={loading}>
            {loading ? 'Checking…' : 'Recheck'}
          </button>
        </div>
        {!loading && status && !status.connected && <AnkiDisconnected state={state} />}
        {!loading && status?.connected && (
          <p className="blanc-note">
            {status.decks.length} decks, {status.models.length} note types available.
          </p>
        )}
      </fieldset>

      {!loading && status?.connected && (
        <>
          <fieldset>
            <legend>Deck and note type</legend>
            <AnkiDeckNoteType state={state} />
          </fieldset>

          <fieldset>
            <legend>Field mapping</legend>
            <p className="blanc-note">
              Mapped onto <b>{model || '—'}</b>. Templates use the same variables mining does.
            </p>
            <AnkiFieldMapping state={state} />
          </fieldset>

          <fieldset>
            <legend>Card styling</legend>
            <AnkiNoteCss state={state} />
          </fieldset>

          <fieldset>
            <legend>Manual card</legend>
            <AnkiManualCardForm state={state} />
          </fieldset>

          {state.fields.length > 0 && (
            <fieldset>
              <legend>Preview</legend>
              <AnkiPreviewPane state={state} />
            </fieldset>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Pillar 0 fix for the `stats` tab bail-out, which mounted `StatisticsView`
 * (and therefore `AppChrome`) inside `BlancViewHost`. Read-only: the one
 * mutating action, Reset, keeps the same `confirmDialog` guard Study OS uses.
 */
export function BlancStatisticsPanel() {
  const state = useStats();
  const s = state.summary;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Totals</legend>
        <div className="blanc-status-row">
          <span>{formatDuration(s.totalSeconds)} total</span>
          <span>{formatNumber(s.totalChars)} chars</span>
          <span>{s.daysActive} active days</span>
          <button type="button" onClick={state.refresh}>
            Refresh
          </button>
          <button type="button" disabled={!state.hasData} onClick={() => void state.resetAllStats()}>
            Reset
          </button>
        </div>
        {state.hasData ? (
          <StatsCards state={state} />
        ) : (
          <p className="blanc-note">
            No reading samples recorded yet. Open a book in the reader and the totals start here.
          </p>
        )}
      </fieldset>

      {state.hasData && (
        <fieldset>
          <legend>Last 14 days</legend>
          <StatsChart state={state} />
        </fieldset>
      )}

      {s.books.length > 0 && (
        <fieldset>
          <legend>By book</legend>
          <StatsBooks state={state} />
        </fieldset>
      )}

      {s.shows.length > 0 && (
        <fieldset>
          <legend>By show</legend>
          <StatsShows state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>Word knowledge</legend>
        <WordKnowledge />
      </fieldset>
    </div>
  );
}

const GRAMMAR_MODES = [
  { id: 'grammar', label: 'Points' },
  { id: 'practice', label: 'Practice' },
  { id: 'guides', label: 'Guides' },
  { id: 'review', label: 'Review' },
] as const;

type GrammarMode = (typeof GRAMMAR_MODES)[number]['id'];

export function BlancGrammarPanel() {
  const [mode, setMode] = useState<GrammarMode>('grammar');
  const [practiceSeed, setPracticeSeed] = useState<Partial<PracticeFilters> | undefined>();
  const corpusSize = useMemo(() => dedupeGrammarByTitle(GRAMMAR).length, []);

  // Same deep link Study OS honours, so `grammar:open-practice` works from
  // either shell.
  useEffect(() => {
    const onPractice = (ev: Event) => {
      setPracticeSeed(parsePracticeDeepLink((ev as CustomEvent).detail));
      setMode('practice');
    };
    window.addEventListener('grammar:open-practice', onPractice);
    return () => window.removeEventListener('grammar:open-practice', onPractice);
  }, []);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Mode</legend>
        <div className="blanc-segmented">
          {GRAMMAR_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'active' : ''}
              onClick={() => setMode(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
        <div className="blanc-status-row">
          <span>{corpusSize} grammar points</span>
          <span>Deterministic corpus — no model calls</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>{GRAMMAR_MODES.find((m) => m.id === mode)?.label}</legend>
        {mode === 'grammar' ? (
          <GrammarExplorer renderDetail={(point) => <GrammarDetail key={point.id} point={point} />} />
        ) : mode === 'practice' ? (
          <GrammarPracticePanel initialFilters={practiceSeed} />
        ) : mode === 'review' ? (
          <GrammarCurationPanel />
        ) : (
          <GuidesBrowser />
        )}
      </fieldset>
    </div>
  );
}

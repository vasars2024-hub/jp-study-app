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
import { BLANC_DICTIONARY_QUERY_EVENT, readBlancDictionaryQuery } from './blancMasterSources';
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
import { useT } from '../../i18n';
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
import { formatDuration } from '../../stats';
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
  const { t } = useT();
  const [lang, setLang] = useState<DictLang>(() => getStudyLang());
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => onStudyLangChanged(setLang), []);
  useEffect(() => {
    const onMasterSearchQuery = (event: Event): void => {
      const next = readBlancDictionaryQuery(event);
      if (!next) return;
      setInput(next);
      setQuery(next);
    };
    window.addEventListener(BLANC_DICTIONARY_QUERY_EVENT, onMasterSearchQuery);
    return () => window.removeEventListener(BLANC_DICTIONARY_QUERY_EVENT, onMasterSearchQuery);
  }, []);

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
        <legend>{t('blanc.study.lookup')}</legend>
        <form className="blanc-command-row" onSubmit={submit}>
          <input
            autoFocus
            type="text"
            value={input}
            lang={lang}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isZh ? t('blanc.study.dict.placeholderZh') : t('blanc.study.dict.placeholderJa')}
          />
          <button type="submit" disabled={!input.trim()}>
            {t('blanc.study.dict.search')}
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
          <span>{isZh ? t('blanc.study.dict.langZh') : t('blanc.study.dict.langJa')}</span>
          {/* JMdict / Jisho are product names, identical in every language. */}
          <span>{isZh ? t('blanc.study.dict.sourceZh') : 'JMdict / Jisho'}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.dict.results')}</legend>
        {query ? (
          <DictionaryResults query={query} variant="page" lang={lang} />
        ) : (
          <p className="blanc-note">
            {isZh ? t('blanc.study.dict.hintZh') : t('blanc.study.dict.hintJa')}
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
  const { t } = useT();
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
        <legend>{t('blanc.study.clip.watch')}</legend>
        <div className="blanc-row-actions">
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={monitoring}
              onChange={(e) => toggleMonitoring(e.target.checked)}
            />
            <span>{t('blanc.study.clip.watchClipboard')}</span>
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
            <span>{t('blanc.study.clip.autoLookup')}</span>
          </label>
        </div>
        <p className="blanc-note">
          {monitoring ? t('blanc.study.clip.watchingOn') : t('blanc.study.clip.watchingOff')}
        </p>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.clip.recent')}</legend>
        {entries.length === 0 ? (
          <p className="blanc-note">{t('blanc.study.clip.empty')}</p>
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
                    title={
                      pick
                        ? t('blanc.study.clip.lookUpItem', { term: pick })
                        : t('blanc.study.clip.noJapanese')
                    }
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
        <legend>{t('blanc.study.lookup')}</legend>
        {term ? (
          <>
            <div className="blanc-status-row">
              <span lang="ja">{term}</span>
              {manual && (
                <button type="button" onClick={() => setManual(null)}>
                  {t('blanc.study.clip.follow')}
                </button>
              )}
            </div>
            <DictionaryResults query={term} variant="page" lang="ja" />
          </>
        ) : (
          <p className="blanc-note">
            {autoLookup ? t('blanc.study.clip.promptAuto') : t('blanc.study.clip.promptManual')}
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
  const { t } = useT();
  const state = useReadingFinder();

  return (
    <div className="blanc-tool-detail">
      {state.continueReading.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.reading.continue')}</legend>
          <ContinueReadingRow state={state} onOpenBook={onOpenBook} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('blanc.study.reading.filters')}</legend>
        <ReadingFinderControls state={state} />
        <div className="blanc-status-row">
          <span>{t('blanc.study.reading.siteCount', { count: state.list.length })}</span>
          <span>
            {t('blanc.study.reading.level', {
              range: levelRangeLabel(t, state.levels.size ? [...state.levels] : ALL_LEVELS),
            })}
          </span>
          <button type="button" onClick={state.resetFilters}>
            {t('blanc.study.reading.resetFilters')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.reading.sites')}</legend>
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
  const { t } = useT();
  const state = useResources();

  if (state.selectedBundle) {
    return (
      <div className="blanc-tool-detail">
        <fieldset>
          <legend>{t('blanc.study.res.bundle')}</legend>
          <div className="blanc-row-actions">
            <button type="button" onClick={state.closeBundle}>
              {t('blanc.study.res.back')}
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
        <legend>{t('blanc.study.res.catalogue')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={state.query}
            onChange={(e) => state.setQuery(e.target.value)}
            placeholder={t('blanc.study.res.find')}
          />
          <button
            type="button"
            onClick={() => void state.doRefresh()}
            disabled={state.refreshState === 'refreshing'}
          >
            {state.refreshState === 'refreshing'
              ? t('blanc.study.res.refreshing')
              : t('blanc.study.refresh')}
          </button>
          <button type="button" onClick={() => state.setFilter('All')} disabled={state.filter === 'All'}>
            {t('blanc.study.res.all')}
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{t('blanc.study.res.visible', { count: state.total })}</span>
          <span>{t('blanc.study.res.indexed', { count: state.allTotal })}</span>
          <span>{t('blanc.study.res.bundleCount', { count: state.bundles.length })}</span>
          {state.refreshState === 'offline' && <span>{t('blanc.study.res.offline')}</span>}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.res.categories')}</legend>
        <div className="blanc-segmented">
          <button
            type="button"
            className={state.filter === 'All' ? 'active' : ''}
            onClick={() => state.setFilter('All')}
          >
            {t('blanc.study.res.all')}
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
          <legend>{t('blanc.study.res.bundles')}</legend>
          <ResourceBundles state={state} />
        </fieldset>
      )}

      {state.showLanding && state.tools.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.res.myTools')}</legend>
          <ResourceMyTools state={state} />
        </fieldset>
      )}

      {state.showLanding && state.newEntries.length > 0 && (
        <fieldset>
          <legend>{t('blanc.study.res.recent')}</legend>
          <ResourceNewSection state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('blanc.study.res.resources')}</legend>
        <ResourceGroups state={state} />
      </fieldset>
    </div>
  );
}

export function BlancCalendarPanel() {
  const { t } = useT();
  const state = useCalendar();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.cal.navigate')}</legend>
        <CalendarNav state={state} />
        <div className="blanc-status-row">
          <span>{state.headerLabel}</span>
          <span>{t('blanc.study.cal.eventCount', { count: state.events.length })}</span>
          {state.agendaOverdue.length > 0 && (
            <span>{t('blanc.study.cal.overdue', { count: state.agendaOverdue.length })}</span>
          )}
          <button type="button" onClick={() => state.openNew(toKey(state.cursor))}>
            {t('blanc.study.cal.newEvent')}
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
  const { t } = useT();
  const state = useMusic();
  const { ps, currentMeta } = state;
  const lyrics = state.liveLyrics.lyrics;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.music.library')}</legend>
        <MusicSearchBox state={state} />
        <div className="blanc-status-row">
          <span>{t('blanc.study.music.songCount', { count: state.baseSongs.length })}</span>
          <span>{t('blanc.study.music.rowCount', { count: state.rows.length })}</span>
          <select
            value={state.sortBy}
            onChange={(e) => state.setSortBy(e.target.value as SortBy)}
            aria-label={t('music.sortSelect.title')}
          >
            <option value="recent">{t('music.sort.recent')}</option>
            <option value="title">{t('music.sort.byTitle')}</option>
            <option value="artist">{t('music.sort.byArtist')}</option>
            <option value="folder">{t('music.sort.byFolder')}</option>
          </select>
          <label className="blanc-check">
            <input
              type="checkbox"
              checked={state.likedOnly}
              onChange={() => state.setLikedOnly((v) => !v)}
            />
            <span>{t('blanc.study.music.likedOnly')}</span>
          </label>
        </div>
        <div className="blanc-music-list">
          <MusicSongList state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('mediaCenter.music.nowPlaying')}</legend>
        {state.error && <p className="blanc-note">{state.error}</p>}
        <MusicControls state={state} />
        <MusicNowPlaying state={state} />
        {!ps.current && <p className="blanc-note">{t('blanc.study.music.pickSong')}</p>}
      </fieldset>

      <fieldset>
        <legend>
          {lyrics.kind === 'synced'
            ? t('blanc.study.music.lyricsCues', { count: lyrics.cues.length })
            : t('music.controls.lyrics')}
        </legend>
        <div className="blanc-music-lyrics">
          <MusicLyricsPane state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.music.addYoutube')}</legend>
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
  const { t } = useT();
  const state = useTranslate();
  const { source, target, input, output, busy, msg, error } = state;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.translate.direction')}</legend>
        <div className="blanc-command-row">
          <select
            value={source}
            onChange={(e) => state.pickSource(e.target.value as TransLang)}
            aria-label={t('translate.lang.sourceGroup')}
          >
            {LANG_ORDER.filter((l) => l !== target).map((l) => (
              <option key={l} value={l}>
                {LANG_LABELS[l]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={state.swap}
            title={t('translate.menu.swap')}
            aria-label={t('translate.menu.swap')}
          >
            ⇄
          </button>
          <select
            value={target}
            onChange={(e) => state.pickTarget(e.target.value as TransLang)}
            aria-label={t('translate.lang.targetGroup')}
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
              {t('translate.tab.translate')}
            </button>
            <button
              type="button"
              className={state.tab === 'history' ? 'active' : ''}
              onClick={() => state.setTab('history')}
            >
              {t('blanc.study.translate.historyCount', { count: state.history.length })}
            </button>
          </span>
        </div>
        <div className="blanc-status-row">
          <span>{t('translate.status.sourceChars', { count: input.length })}</span>
          <span>{t('blanc.study.translate.runsLocally')}</span>
        </div>
      </fieldset>

      {state.tab === 'history' ? (
        <fieldset>
          <legend>{t('translate.tab.history')}</legend>
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
            <legend>{t('translate.pane.sourceHeader', { lang: LANG_LABELS[source] })}</legend>
            <textarea
              lang={source}
              rows={6}
              value={input}
              onChange={(e) => state.setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void state.run();
              }}
              placeholder={t('blanc.study.translate.inputPlaceholder', { hint: PLACEHOLDERS[source] })}
            />
            <div className="blanc-row-actions">
              <button type="button" onClick={() => void state.run()} disabled={busy || !input.trim()}>
                {busy ? t('translate.working') : t('translate.menu.translate')}
              </button>
              <button type="button" onClick={state.clear} disabled={!input && !output}>
                {t('blanc.study.clear')}
              </button>
              {busy && <span className="blanc-note">{msg}</span>}
            </div>
            {error && <p className="blanc-note">{error}</p>}
          </fieldset>

          <fieldset>
            <legend>{t('translate.pane.outputHeader', { lang: LANG_LABELS[target] })}</legend>
            <div className="blanc-output" lang={target}>
              {output || <span className="blanc-note">{t('translate.outputPlaceholder')}</span>}
            </div>
            {output && (
              <div className="blanc-row-actions">
                <button type="button" onClick={() => void copyText(output)}>
                  {t('translate.history.copy')}
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
  const { t } = useT();
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
        <legend>{t('blanc.study.notebook.view')}</legend>
        <NotebookViewTabs state={state} />
        <div className="blanc-status-row">
          <span>{t('blanc.study.notebook.entryCount', { count: state.visible.length })}</span>
          <span>{t('blanc.study.notebook.folderCount', { count: state.folders.length })}</span>
          {state.truncated && (
            <span>{t('blanc.study.notebook.showingFirst', { count: TIMELINE_CAP })}</span>
          )}
          <button type="button" onClick={state.refresh}>
            {t('blanc.study.refresh')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.notebook.streams')}</legend>
        <NotebookStreamCounts state={state} />
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.notebook.folders')}</legend>
        <div className="gx-notebook-folders">
          <NotebookFolders state={state} />
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('blanc.study.notebook.timeline')}</legend>
        {unreachable && (
          <p className="blanc-note">
            {t('blanc.study.notebook.unreachable', { target: unreachable })}
          </p>
        )}
        <NotebookTimeline state={state} onOpen={onOpen} />
      </fieldset>
    </div>
  );
}

/**
 * "Mapped onto <b>model</b>. ..." as one catalog sentence, with the model name
 * bolded wherever the language places it.
 */
function MappedOnto({ model }: { model: string }) {
  const { t } = useT();
  const slot = '\u0000';
  const [before, after = ''] = t('blanc.study.anki.mappedOnto', { model: slot }).split(slot);
  return (
    <>
      {before}
      <b>{model}</b>
      {after}
    </>
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
  const { t } = useT();
  const state = useAnkiConfig();
  const { status, loading, active, model } = state;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.anki.connection')}</legend>
        <ProfileSwitcher compact showHeading={false} />
        <div className="blanc-status-row">
          <span className={`blanc-status-dot${status?.connected ? ' ok' : ''}`} />
          <span>{state.connLabel}</span>
          {active.label && <span>{t('blanc.study.anki.profile', { name: active.label })}</span>}
          <button type="button" onClick={() => void state.check()} disabled={loading}>
            {loading ? t('anki.checking') : t('anki.recheck')}
          </button>
        </div>
        {!loading && status && !status.connected && <AnkiDisconnected state={state} />}
        {!loading && status?.connected && (
          <p className="blanc-note">
            {t('blanc.study.anki.available', {
              decks: t('blanc.study.anki.deckCount', { count: status.decks.length }),
              models: t('blanc.study.anki.noteTypeCount', { count: status.models.length }),
            })}
          </p>
        )}
      </fieldset>

      {!loading && status?.connected && (
        <>
          <fieldset>
            <legend>{t('blanc.study.anki.deckNoteType')}</legend>
            <AnkiDeckNoteType state={state} />
          </fieldset>

          <fieldset>
            <legend>{t('anki.fieldMapping.title')}</legend>
            <p className="blanc-note">
              <MappedOnto model={model || '—'} />
            </p>
            <AnkiFieldMapping state={state} />
          </fieldset>

          <fieldset>
            <legend>{t('blanc.study.anki.cardStyling')}</legend>
            <AnkiNoteCss state={state} />
          </fieldset>

          <fieldset>
            <legend>{t('blanc.study.anki.manualCard')}</legend>
            <AnkiManualCardForm state={state} />
          </fieldset>

          {state.fields.length > 0 && (
            <fieldset>
              <legend>{t('blanc.study.anki.preview')}</legend>
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
  const { t } = useT();
  const state = useStats();
  const s = state.summary;

  return (
    <div className="blanc-tool-detail blanc-statistics-panel">
      <fieldset>
        <legend>{t('blanc.study.stats.totals')}</legend>
        <div className="blanc-status-row">
          <span>{t('blanc.study.stats.totalTime', { duration: formatDuration(s.totalSeconds) })}</span>
          <span>{t('blanc.study.stats.charCount', { count: Math.round(s.totalChars) })}</span>
          <span>{t('blanc.study.stats.activeDays', { count: s.daysActive })}</span>
          <button type="button" onClick={state.refresh}>
            {t('blanc.study.refresh')}
          </button>
          <button type="button" disabled={!state.hasData} onClick={() => void state.resetAllStats()}>
            {t('common.reset')}
          </button>
        </div>
        {state.hasData ? (
          <StatsCards state={state} showRestDayToggle />
        ) : (
          <p className="blanc-note">
            {t('blanc.study.stats.empty')}
          </p>
        )}
      </fieldset>

      {state.hasData && (
        <fieldset>
          <legend>{t('blanc.study.stats.last14')}</legend>
          <StatsChart state={state} />
        </fieldset>
      )}

      {s.books.length > 0 && (
        <fieldset>
          <legend>{t('stats.byBook')}</legend>
          <StatsBooks state={state} />
        </fieldset>
      )}

      {s.shows.length > 0 && (
        <fieldset>
          <legend>{t('stats.byShow')}</legend>
          <StatsShows state={state} />
        </fieldset>
      )}

      <fieldset>
        <legend>{t('stats.wk.title')}</legend>
        <WordKnowledge />
      </fieldset>
    </div>
  );
}

/** Labels are catalog keys, resolved with `t()` at render. */
const GRAMMAR_MODES = [
  { id: 'grammar', labelKey: 'blanc.study.grammar.points' },
  { id: 'practice', labelKey: 'grammar.mode.practice' },
  { id: 'guides', labelKey: 'blanc.study.grammar.guides' },
  { id: 'review', labelKey: 'grammar.mode.review' },
] as const;

type GrammarMode = (typeof GRAMMAR_MODES)[number]['id'];

export function BlancGrammarPanel({
  focusRequest,
}: {
  focusRequest?: { id: string; key: number } | null;
}) {
  const { t } = useT();
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

  useEffect(() => {
    if (focusRequest) setMode('grammar');
  }, [focusRequest]);

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.study.grammar.mode')}</legend>
        <div className="blanc-segmented">
          {GRAMMAR_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={mode === m.id ? 'active' : ''}
              onClick={() => setMode(m.id)}
            >
              {t(m.labelKey)}
            </button>
          ))}
        </div>
        <div className="blanc-status-row">
          <span>{t('blanc.study.grammar.pointCount', { count: corpusSize })}</span>
          <span>{t('blanc.study.grammar.deterministic')}</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>
          {t(GRAMMAR_MODES.find((m) => m.id === mode)?.labelKey ?? 'blanc.study.grammar.points')}
        </legend>
        {mode === 'grammar' ? (
          <GrammarExplorer
            focusRequest={focusRequest}
            renderDetail={(point) => <GrammarDetail key={point.id} point={point} />}
          />
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

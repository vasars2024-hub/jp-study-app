/**
 * Scraper app — discovery console body.
 *
 * State and panels live here (rather than in `views/ScraperView.tsx`) so the
 * same console can be composed into Blanc chrome later without dragging the
 * Study OS shell with it, following the ReadingFinder/Resources split.
 *
 * The console does one job: given the library the user already has and the JLPT
 * band they study at, propose titles worth watching next, and explain why. All
 * ranking is `shared/mediaDiscovery.ts` — this file renders it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icons';
import type { MediaItem } from '../../../shared/types';
import {
  DISCOVERY_FEEDS,
  STUDY_LEVELS,
  buildDiscoveryProfile,
  discoveryCandidateId,
  inferLevelFromLibrary,
  isStudyLevel,
  rankDiscoveryCandidates,
  type DiscoveryCandidate,
  type DiscoveryFeedId,
  type DiscoveryFeedProvenance,
  type DiscoveryFeedResult,
  type DiscoveryRanking,
  type DiscoveryReason,
  type DiscoveryMediaType,
  type StudyLevel,
} from '../../../shared/mediaDiscovery';
import {
  addToShortlist,
  loadMediaShortlist,
  onShortlistChanged,
  removeFromShortlist,
  type MediaShortlistEntry,
} from '../../discoveryShortlistStore';
import { useT } from '../../i18n';
import MangaProviderBrowser from '../reading/MangaProviderBrowser';
import MalDownloadDialog from './MalDownloadDialog';
import {
  YoutubeDiscoveryControls,
  YoutubeDiscoveryInspector,
  YoutubeDiscoveryResults,
  useYoutubeDiscovery,
  type YoutubeDiscoveryState,
} from './YoutubeDiscoveryPanel';

// ---------------------------------------------------------------------------
// Persisted console preferences
// ---------------------------------------------------------------------------

const PREFS_KEY = 'jp-discovery-prefs-v1';

interface DiscoveryPrefs {
  level: StudyLevel | null;
  hideOwned: boolean;
  feed: DiscoveryFeedId;
  mediaType: DiscoveryMediaType;
}

const DEFAULT_PREFS: DiscoveryPrefs = {
  level: null,
  hideOwned: false,
  feed: 'seasonal',
  mediaType: 'anime',
};

function readPrefs(): DiscoveryPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PREFS;
    const candidate = parsed as Partial<DiscoveryPrefs>;
    return {
      level: isStudyLevel(candidate.level) ? candidate.level : null,
      hideOwned: candidate.hideOwned === true,
      feed: DISCOVERY_FEEDS.includes(candidate.feed as DiscoveryFeedId)
        ? (candidate.feed as DiscoveryFeedId)
        : 'seasonal',
      mediaType: candidate.mediaType === 'manga' ? 'manga' : 'anime',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function writePrefs(prefs: DiscoveryPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Preferences are a convenience; losing them must never block the console.
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * `youtube` is a peer of `browse`, not a new page.
 *
 * Three surfaces render these panels — the Scraper's Discover page, Blanc's
 * discover panel, and the Media Center's discover tab — and all three compose
 * exactly `<DiscoveryControls>`, `<DiscoveryTabs>`, `<DiscoveryResults>` and
 * `<DiscoveryInspector>`. Adding the YouTube console as a tab therefore reaches
 * all three without editing any of them.
 */
export type DiscoveryTab = 'browse' | 'youtube' | 'shortlist';
type LoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface DiscoveryState {
  tab: DiscoveryTab;
  setTab: (tab: DiscoveryTab) => void;
  query: string;
  setQuery: (value: string) => void;
  submitQuery: () => void;
  clearQuery: () => void;
  feed: DiscoveryFeedId;
  setFeed: (feed: DiscoveryFeedId) => void;
  level: StudyLevel;
  setLevel: (level: StudyLevel) => void;
  hideOwned: boolean;
  setHideOwned: (value: boolean) => void;
  loadState: LoadState;
  loadMessage: string;
  mediaType: DiscoveryMediaType;
  setMediaType: (mediaType: DiscoveryMediaType) => void;
  /** Which catalogue answered the current feed; null during a search. */
  provenance: DiscoveryFeedProvenance | null;
  /** True while a search query, rather than a feed, is driving the list. */
  searching: boolean;
  results: DiscoveryRanking[];
  /** Catalogue titles only; YouTube videos live on {@link youtube}. */
  shortlist: MediaShortlistEntry[];
  shortlistIds: Set<string>;
  /** The YouTube console, rendered by the same three panels under its own tab. */
  youtube: YoutubeDiscoveryState;
  selected: DiscoveryRanking | null;
  select: (entry: DiscoveryRanking | null) => void;
  toggleShortlist: (candidate: DiscoveryCandidate) => void;
  /**
   * The entry the download dialog is open for; null when it is closed.
   *
   * It lives on the console state rather than inside one panel because both the
   * result rows and the inspector open the same dialog, and two copies of it
   * would each carry their own half-finished selection.
   */
  downloadFor: DiscoveryCandidate | null;
  openDownload: (candidate: DiscoveryCandidate) => void;
  closeDownload: () => void;
  refresh: () => void;
  libraryCount: number;
}

export function useDiscovery(enabled = true): DiscoveryState {
  const initialPrefs = useRef(readPrefs()).current;

  const [tab, setTab] = useState<DiscoveryTab>('browse');
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [feed, setFeedState] = useState<DiscoveryFeedId>(initialPrefs.feed);
  const [mediaType, setMediaTypeState] = useState<DiscoveryMediaType>(initialPrefs.mediaType);
  const [level, setLevelState] = useState<StudyLevel>(initialPrefs.level ?? 'N4');
  const [levelPinned, setLevelPinned] = useState(initialPrefs.level !== null);
  const [hideOwned, setHideOwnedState] = useState(initialPrefs.hideOwned);
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  /** Null only on the manga path, whose provider returns a bare list. */
  const [provenance, setProvenance] = useState<DiscoveryFeedProvenance | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [loadMessage, setLoadMessage] = useState('');
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [shortlist, setShortlist] = useState<MediaShortlistEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [downloadFor, setDownloadFor] = useState<DiscoveryCandidate | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Every fetch stamps a token; a late reply from an abandoned feed or query is
  // dropped rather than overwriting the list the user is actually looking at.
  const requestToken = useRef(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void window.api?.listMedia?.().then((items) => {
      if (alive) setLibrary(items ?? []);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [enabled]);

  useEffect(() => {
    setShortlist(loadMediaShortlist());
    return onShortlistChanged(() => setShortlist(loadMediaShortlist()));
  }, []);

  // Seed the level from the library only until the user states one; after that
  // their answer wins, even if the library later says otherwise.
  useEffect(() => {
    if (levelPinned || library.length === 0) return;
    const inferred = inferLevelFromLibrary(library);
    if (inferred) setLevelState(inferred);
  }, [library, levelPinned]);

  useEffect(() => {
    if (!enabled) return;
    const token = requestToken.current + 1;
    requestToken.current = token;
    setLoadState('loading');
    setLoadMessage('');
    // Anime search and anime feeds both return rows plus the provenance that
    // says which catalogue actually answered; manga search still returns a bare
    // list. All three are normalized here so the rest of the view never has to
    // care which path it came from.
    const request: Promise<DiscoveryCandidate[] | DiscoveryFeedResult> | undefined =
      mediaType === 'manga'
        ? window.api?.readingMangaSearch?.({
          search: activeQuery,
          page: 1,
          perPage: 25,
        }).then((reply) => {
          if (reply.state !== 'ready' || !reply.data) {
            throw new Error(reply.message || reply.state);
          }
          return reply.data.items.map((item): DiscoveryCandidate => ({
            provider: 'anilist',
            id: item.mediaId,
            mediaType: 'manga',
            title: item.title,
            nativeTitle: item.titleNative || undefined,
            synopsis: item.description || undefined,
            year: item.year ?? undefined,
            format: item.format || undefined,
            status: item.status || undefined,
            chapterCount: item.chapterCount ?? undefined,
            genres: item.genres,
            rating: item.meanScore == null ? undefined : item.meanScore / 10,
            posterUrl: item.coverUrl || undefined,
          }));
        })
        : activeQuery
          ? window.api?.searchDiscovery?.(activeQuery)
          : window.api?.browseDiscovery?.(feed, 1);
    if (!request) {
      setLoadState('error');
      return;
    }
    void request
      .then((reply) => {
        if (requestToken.current !== token) return;
        const list = Array.isArray(reply) ? reply : reply?.candidates ?? [];
        setCandidates(list);
        setProvenance(Array.isArray(reply) ? null : reply?.provenance ?? null);
        setLoadState(list.length > 0 ? 'ready' : 'empty');
      })
      .catch((error: unknown) => {
        if (requestToken.current !== token) return;
        setCandidates([]);
        setProvenance(null);
        setLoadMessage(error instanceof Error ? error.message : String(error));
        setLoadState('error');
      });
  }, [activeQuery, enabled, feed, mediaType, reloadToken]);

  const profile = useMemo(
    () => buildDiscoveryProfile(
      library.map((item) => ({ title: item.title, genres: item.genres, jlptLevel: item.jlptLevel })),
      level,
    ),
    [library, level],
  );

  const results = useMemo(
    () => rankDiscoveryCandidates(candidates, profile, { hideInLibrary: hideOwned }),
    [candidates, profile, hideOwned],
  );

  const shortlistIds = useMemo(() => new Set(shortlist.map((entry) => entry.id)), [shortlist]);

  const shortlistRankings = useMemo(
    () => rankDiscoveryCandidates(shortlist.map((entry) => entry.candidate), profile),
    [shortlist, profile],
  );

  const visible = tab === 'shortlist' ? shortlistRankings : results;

  const selected = useMemo(
    () => visible.find((entry) => discoveryCandidateId(entry.candidate) === selectedId) ?? null,
    [visible, selectedId],
  );

  const setFeed = useCallback((next: DiscoveryFeedId) => {
    setFeedState(next);
    setQuery('');
    setActiveQuery('');
    setTab('browse');
    writePrefs({ ...readPrefs(), feed: next });
  }, []);

  const setMediaType = useCallback((next: DiscoveryMediaType) => {
    setMediaTypeState(next);
    setQuery('');
    setActiveQuery('');
    setSelectedId(null);
    setTab('browse');
    writePrefs({ ...readPrefs(), mediaType: next });
  }, []);

  const setLevel = useCallback((next: StudyLevel) => {
    setLevelState(next);
    setLevelPinned(true);
    writePrefs({ ...readPrefs(), level: next });
  }, []);

  const setHideOwned = useCallback((next: boolean) => {
    setHideOwnedState(next);
    writePrefs({ ...readPrefs(), hideOwned: next });
  }, []);

  const submitQuery = useCallback(() => {
    setActiveQuery(query.trim());
    setTab('browse');
  }, [query]);

  const clearQuery = useCallback(() => {
    setQuery('');
    setActiveQuery('');
  }, []);

  const toggleShortlist = useCallback((candidate: DiscoveryCandidate) => {
    const id = discoveryCandidateId(candidate);
    if (loadMediaShortlist().some((entry) => entry.id === id)) removeFromShortlist(id);
    else addToShortlist(candidate);
    setShortlist(loadMediaShortlist());
  }, []);

  const openDownload = useCallback((candidate: DiscoveryCandidate) => setDownloadFor(candidate), []);
  const closeDownload = useCallback(() => setDownloadFor(null), []);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  const select = useCallback(
    (entry: DiscoveryRanking | null) => setSelectedId(entry ? discoveryCandidateId(entry.candidate) : null),
    [],
  );

  // Shares the level selector with the catalogue console — the band the learner
  // studies at is one fact about them, not one per content type. Enabled only on
  // its own tab so switching to Discover never spawns a yt-dlp process.
  const youtube = useYoutubeDiscovery(level, enabled && tab === 'youtube');

  return {
    tab,
    setTab,
    query,
    setQuery,
    submitQuery,
    clearQuery,
    feed,
    setFeed,
    level,
    setLevel,
    hideOwned,
    setHideOwned,
    loadState,
    loadMessage,
    mediaType,
    setMediaType,
    provenance,
    searching: activeQuery.length > 0,
    results: visible,
    shortlist,
    shortlistIds,
    youtube,
    selected,
    select,
    toggleShortlist,
    downloadFor,
    openDownload,
    closeDownload,
    refresh,
    libraryCount: library.length,
  };
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Score band, used for the meter colour. Thresholds are presentation-only. */
function scoreBand(score: number): 'high' | 'mid' | 'low' {
  if (score >= 70) return 'high';
  if (score >= 45) return 'mid';
  return 'low';
}

function reasonLabel(reason: DiscoveryReason, t: (key: string, vars?: Record<string, string | number>) => string): string {
  switch (reason.code) {
    case 'genre-affinity':
      return t('scraper.reason.genreAffinity', { genre: reason.detail ?? '' });
    case 'short-commitment':
      return t('scraper.reason.shortCommitment', { count: Number(reason.detail ?? 0) });
    case 'long-commitment':
      return t('scraper.reason.longCommitment', { count: Number(reason.detail ?? 0) });
    case 'highly-rated':
      return t('scraper.reason.highlyRated', { score: reason.detail ?? '' });
    case 'level-stretch':
      return t('scraper.reason.levelStretch');
    case 'level-easy':
      return t('scraper.reason.levelEasy');
    case 'already-in-library':
      return t('scraper.reason.alreadyInLibrary');
    case 'level-match':
    default:
      return t('scraper.reason.levelMatch');
  }
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

export function DiscoveryControls({ state }: { state: DiscoveryState }) {
  const { t } = useT();
  const {
    query, setQuery, submitQuery, clearQuery, feed, setFeed, level, setLevel,
    hideOwned, setHideOwned, refresh, loadState, searching, mediaType, setMediaType,
  } = state;

  // One search box on screen at a time: the YouTube console brings its own, and
  // two would leave the user guessing which one their query goes to.
  if (state.tab === 'youtube') {
    return (
      <div className="disc-controls-youtube">
        <YoutubeDiscoveryControls state={state.youtube} />
        <div className="disc-filterline">
          <label className="disc-field">
            <span>{t('scraper.level.label')}</span>
            <select value={level} onChange={(e) => setLevel(e.target.value as StudyLevel)}>
              {STUDY_LEVELS.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="disc-controls">
      <div className="disc-searchline">
        <div className="disc-searchbox">
          <Icon name="search" size={13} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitQuery();
            }}
            placeholder={t(mediaType === 'manga'
              ? 'scraper.search.placeholderManga'
              : 'scraper.search.placeholder')}
            aria-label={t('scraper.search.label')}
          />
          {query ? (
            <button
              type="button"
              className="disc-searchclear"
              onClick={clearQuery}
              title={t('scraper.search.clear')}
              aria-label={t('scraper.search.clear')}
            >
              <Icon name="close" size={11} />
            </button>
          ) : null}
        </div>
        <button type="button" className="disc-btn disc-btn-primary" onClick={submitQuery} disabled={!query.trim()}>
          {t('scraper.search.run')}
        </button>
        <button
          type="button"
          className="disc-btn"
          onClick={refresh}
          disabled={loadState === 'loading'}
          title={t('scraper.action.refresh')}
        >
          <Icon name="refresh" size={12} />
          {t('scraper.action.refresh')}
        </button>
      </div>

      <div className="disc-filterline">
        <div className="disc-segment" role="group" aria-label={t('scraper.mediaType.label')}>
          {(['anime', 'manga'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={`disc-seg-btn ${mediaType === id ? 'active' : ''}`}
              // The active segment is signalled by colour alone otherwise, which
              // neither a screen reader nor a colour-blind user can read.
              aria-pressed={mediaType === id}
              onClick={() => setMediaType(id)}
            >
              {t(`scraper.mediaType.${id}`)}
            </button>
          ))}
        </div>

        {mediaType === 'anime' ? (
          <div className="disc-segment" role="group" aria-label={t('scraper.feed.label')}>
            {DISCOVERY_FEEDS.map((id) => (
              <button
                key={id}
                type="button"
                className={`disc-seg-btn ${!searching && feed === id ? 'active' : ''}`}
                onClick={() => setFeed(id)}
              >
                {t(`scraper.feed.${id}`)}
              </button>
            ))}
          </div>
        ) : null}

        <label className="disc-field">
          <span>{t('scraper.level.label')}</span>
          <select value={level} onChange={(e) => setLevel(e.target.value as StudyLevel)}>
            {STUDY_LEVELS.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </label>

        <label className="disc-check">
          <input type="checkbox" checked={hideOwned} onChange={(e) => setHideOwned(e.target.checked)} />
          <span>{t('scraper.filter.hideOwned')}</span>
        </label>
      </div>
    </div>
  );
}

export function DiscoveryResults({ state }: { state: DiscoveryState }) {
  const { t } = useT();
  const {
    results, selected, select, loadState, loadMessage, tab, shortlistIds,
    toggleShortlist, mediaType, downloadFor, openDownload, closeDownload, provenance,
  } = state;

  /**
   * Which catalogues never replied, as brand names.
   *
   * Only meaningful together with `loadState === 'empty'`, which is set from the
   * *raw* candidate count — so a list emptied by the level filter or by "hide
   * titles in my library" can never be blamed on a provider outage.
   */
  const downProviders = (provenance?.failures ?? [])
    .map((id) => (id === 'jikan' ? 'MyAnimeList' : 'AniList'));

  // The dialog is a portal, and it is mounted here rather than behind the early
  // returns below: a download opened from the inspector must survive the list
  // going empty underneath it — a refresh, or a search that finds nothing.
  const dialog = downloadFor ? (
    <MalDownloadDialog candidate={downloadFor} onClose={closeDownload} />
  ) : null;

  if (tab === 'youtube') {
    return (
      <>
        <YoutubeDiscoveryResults state={state.youtube} />
        {dialog}
      </>
    );
  }

  if (tab === 'browse' && loadState === 'loading') {
    return <div className="disc-placeholder">{t('scraper.state.loading')}{dialog}</div>;
  }
  if (tab === 'browse' && loadState === 'error') {
    return (
      <div className="disc-placeholder disc-placeholder-error">
        {t('scraper.state.error')}{loadMessage ? ` — ${loadMessage}` : ''}
        {dialog}
      </div>
    );
  }
  if (results.length === 0) {
    // "Nothing matched" is a claim about the catalogue's contents, and it is a
    // lie when nothing was ever asked. Measured 2026-08-16: Jikan at 504 and
    // AniList at 403 rendered a search for a 1,100-episode series as no results.
    const outage = tab === 'browse' && loadState === 'empty' && downProviders.length > 0;
    return (
      <div className={`disc-placeholder${outage ? ' disc-placeholder-error' : ''}`}>
        {tab === 'shortlist'
          ? t('scraper.state.shortlistEmpty')
          : outage
            ? t('scraper.state.providersDown', { providers: downProviders.join(' · ') })
            : t('scraper.state.empty')}
        {dialog}
      </div>
    );
  }

  const selectedId = selected ? discoveryCandidateId(selected.candidate) : null;

  return (
    <div className="disc-table" role="table" aria-label={t('scraper.results.label')}>
      <div className="disc-row disc-row-head" role="row">
        <span>{t('scraper.column.rank')}</span>
        <span>{t('scraper.column.title')}</span>
        <span>{t('scraper.column.match')}</span>
        <span>{t('scraper.column.level')}</span>
        <span>{t('scraper.column.format')}</span>
        <span>{t(mediaType === 'manga' ? 'scraper.column.chapters' : 'scraper.column.episodes')}</span>
        <span>{t('scraper.column.rating')}</span>
        <span />
      </div>
      {results.map((entry, index) => {
        const id = discoveryCandidateId(entry.candidate);
        const shortlisted = shortlistIds.has(id);
        return (
          <div
            key={id}
            role="row"
            className={`disc-row ${selectedId === id ? 'selected' : ''}`}
            onClick={() => select(entry)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                select(entry);
              }
            }}
            tabIndex={0}
          >
            <span className="disc-cell-rank">{index + 1}</span>
            <span className="disc-cell-title">
              <strong>{entry.candidate.title}</strong>
              {entry.candidate.nativeTitle ? <small>{entry.candidate.nativeTitle}</small> : null}
            </span>
            <span className="disc-cell-match">
              <span className={`disc-meter disc-meter-${scoreBand(entry.matchScore)}`}>
                <span style={{ width: `${entry.matchScore}%` }} />
              </span>
              <em>{Math.round(entry.matchScore)}</em>
            </span>
            <span className="disc-cell-level"><span className="disc-badge">{entry.estimatedLevel}</span></span>
            <span className="disc-cell-dim">{entry.candidate.format ?? '—'}</span>
            <span className="disc-cell-dim">
              {mediaType === 'manga'
                ? entry.candidate.chapterCount ?? '—'
                : entry.candidate.episodeCount ?? '—'}
            </span>
            <span className="disc-cell-dim">
              {typeof entry.candidate.rating === 'number' ? entry.candidate.rating.toFixed(2) : '—'}
            </span>
            <span className="disc-cell-action">
              <button
                type="button"
                className="disc-pin"
                title={t('malDownload.action.open')}
                aria-label={t('scraper.action.downloadRow', { title: entry.candidate.title })}
                onClick={(e) => {
                  e.stopPropagation();
                  select(entry);
                  openDownload(entry.candidate);
                }}
              >
                <Icon name="download" size={12} />
              </button>
              <button
                type="button"
                className={`disc-pin ${shortlisted ? 'active' : ''}`}
                title={shortlisted ? t('scraper.action.unshortlist') : t('scraper.action.shortlist')}
                aria-label={t(
                  shortlisted ? 'scraper.action.unshortlistRow' : 'scraper.action.shortlistRow',
                  { title: entry.candidate.title },
                )}
                aria-pressed={shortlisted}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleShortlist(entry.candidate);
                }}
              >
                <Icon name="bookmark" size={12} />
              </button>
            </span>
          </div>
        );
      })}
      {dialog}
    </div>
  );
}

export function DiscoveryInspector({ state }: { state: DiscoveryState }) {
  const { t } = useT();
  const { selected, shortlistIds, toggleShortlist, level, openDownload, tab } = state;
  const [showMangaSources, setShowMangaSources] = useState(false);

  // Sort only — the labels themselves are resolved through `t()` down in the
  // JSX, so they re-render on a language switch without this memo knowing about
  // the language at all.
  const reasons = useMemo(
    () => (selected ? [...selected.reasons].sort((a, b) => b.points - a.points) : []),
    [selected],
  );

  if (tab === 'youtube') return <YoutubeDiscoveryInspector state={state.youtube} />;

  if (!selected) {
    return (
      <aside className="disc-inspector disc-inspector-empty" aria-label={t('scraper.inspector.label')}>
        <p>{t('scraper.inspector.hint')}</p>
      </aside>
    );
  }

  const { candidate } = selected;
  const id = discoveryCandidateId(candidate);
  const shortlisted = shortlistIds.has(id);
  const sourceUrl = candidate.provider === 'jikan'
    ? `https://myanimelist.net/${candidate.mediaType === 'manga' ? 'manga' : 'anime'}/${candidate.id}`
    : `https://anilist.co/${candidate.mediaType === 'manga' ? 'manga' : 'anime'}/${candidate.id}`;

  return (
    <aside className="disc-inspector" aria-label={t('scraper.inspector.label')}>
      <div className="disc-insp-head">
        {candidate.posterUrl ? (
          <img src={candidate.posterUrl} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <div className="disc-insp-noart"><Icon name="image" size={18} /></div>
        )}
        <div>
          <h2>{candidate.title}</h2>
          {candidate.nativeTitle ? <p className="disc-insp-native">{candidate.nativeTitle}</p> : null}
          <p className="disc-insp-meta">
            {[candidate.format, candidate.year, candidate.studio].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
      </div>

      <div className="disc-insp-score">
        <span className={`disc-meter disc-meter-${scoreBand(selected.matchScore)}`}>
          <span style={{ width: `${selected.matchScore}%` }} />
        </span>
        <strong>{Math.round(selected.matchScore)}</strong>
        <small>{t('scraper.inspector.matchFor', { level })}</small>
      </div>

      <section className="disc-insp-block">
        <h3>{t('scraper.inspector.why')}</h3>
        <ul className="disc-reasons">
          {reasons.map((reason) => (
            <li key={reason.code} className={reason.points < 0 ? 'negative' : ''}>
              <span>{reasonLabel(reason, t)}</span>
              <em>{reason.points > 0 ? `+${reason.points}` : reason.points}</em>
            </li>
          ))}
        </ul>
        <p className="disc-insp-note">{t('scraper.inspector.estimateNote')}</p>
      </section>

      {candidate.genres.length > 0 ? (
        <section className="disc-insp-block">
          <h3>{t('scraper.inspector.genres')}</h3>
          <div className="disc-chips">
            {candidate.genres.map((genre) => <span key={genre} className="disc-chip">{genre}</span>)}
          </div>
        </section>
      ) : null}

      {candidate.synopsis ? (
        <section className="disc-insp-block">
          <h3>{t('scraper.inspector.synopsis')}</h3>
          <p className="disc-insp-synopsis">{candidate.synopsis}</p>
        </section>
      ) : null}

      <div className="disc-insp-actions">
        <button
          type="button"
          className="disc-btn disc-btn-primary"
          onClick={() => openDownload(candidate)}
        >
          <Icon name="download" size={12} />
          {t('malDownload.action.open')}
        </button>
        {candidate.mediaType === 'manga' ? (
          <button
            type="button"
            className="disc-btn"
            onClick={() => setShowMangaSources(true)}
          >
            <Icon name="library" size={12} />
            {t('reading.sources.find')}
          </button>
        ) : null}
        <button
          type="button"
          className="disc-btn"
          onClick={() => toggleShortlist(candidate)}
        >
          <Icon name="bookmark" size={12} />
          {shortlisted ? t('scraper.action.unshortlist') : t('scraper.action.shortlist')}
        </button>
        <button
          type="button"
          className="disc-btn"
          onClick={() => void window.api?.openExternal?.(sourceUrl)}
        >
          <Icon name="external" size={12} />
          {t('scraper.action.openSource')}
        </button>
      </div>
      {showMangaSources ? (
        <MangaProviderBrowser
          candidate={candidate}
          onClose={() => setShowMangaSources(false)}
        />
      ) : null}
    </aside>
  );
}

export function DiscoveryTabs({ state }: { state: DiscoveryState }) {
  const { t } = useT();
  const { tab, setTab, shortlist, youtube } = state;
  return (
    <div className="disc-tabs" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'browse'}
        className={`disc-tab ${tab === 'browse' ? 'active' : ''}`}
        onClick={() => setTab('browse')}
      >
        {t('scraper.tab.browse')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'youtube'}
        className={`disc-tab ${tab === 'youtube' ? 'active' : ''}`}
        onClick={() => setTab('youtube')}
      >
        {t('scraper.tab.youtube')}
        {youtube.shortlist.length > 0 ? (
          <span className="disc-tab-count">{youtube.shortlist.length}</span>
        ) : null}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === 'shortlist'}
        className={`disc-tab ${tab === 'shortlist' ? 'active' : ''}`}
        onClick={() => setTab('shortlist')}
      >
        {t('scraper.tab.shortlist')}
        {shortlist.length > 0 ? <span className="disc-tab-count">{shortlist.length}</span> : null}
      </button>
    </div>
  );
}

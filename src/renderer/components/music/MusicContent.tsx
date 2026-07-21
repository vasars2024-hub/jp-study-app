/**
 * Music library, playback wiring, and the karaoke lyrics pane — shared by Study
 * OS's `MusicView` and Blanc's `BlancMusicPanel`.
 *
 * Pillar 2 (BLANC_REFINEMENT_PLAN.md): Blanc had only the `FocusMusicBar`
 * taskbar widget, no library surface. Playback already lived in the shared
 * `playerBus` (so the mini-player and visualizers stay in sync regardless of
 * which shell is open) and the tree/search in `musicLibrary`; what was
 * view-local was the song list, the lyrics pane, and the transport controls.
 *
 * The song list stays on `VirtualList` in both shells — a library of thousands
 * of tracks must not drop frames while the window is dragged (CLAUDE.md
 * performance rule, and Pillar 1 item 4).
 *
 * Nothing here may import `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icons';
import VirtualList from '../VirtualList';
import type { MediaItem } from '../../../shared/types';
import { guessSongMeta, type SongMeta } from '../../lyrics';
import { useLiveLyrics } from '../../liveLyrics';
import * as player from '../../playerBus';
import { coverFor } from '../../albumArt';
import { isLiked, onLikedChanged, toggleLiked } from '../../likedSongs';
import {
  loadLyricsSettings,
  onLyricsSettingsChanged,
  toggleUseAlbumInSearch,
} from '../../lyricsSettings';
import { useDebouncedValue } from '../../hooks';
import {
  buildMusicTree,
  buildSearchIndex,
  flattenMusicTree,
  searchSongs,
  type MusicRow,
} from '../../musicLibrary';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../../wordLookup';
import { useT } from '../../i18n';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;
const ROW_HEIGHT = 32;
const COLLAPSED_KEY = 'jp-music-collapsed';

export type SortBy = 'recent' | 'title' | 'artist' | 'folder';

const EMPTY_SET: ReadonlySet<string> = new Set();

function loadCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

export function fmt(sec: number): string {
  if (!isFinite(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export interface MusicState {
  items: MediaItem[];
  setItems: (items: MediaItem[]) => void;
  ps: ReturnType<typeof player.getState>;
  baseSongs: MediaItem[];
  metaMap: Map<string, SongMeta>;
  rows: MusicRow[];
  sortBy: SortBy;
  setSortBy: (s: SortBy) => void;
  likedOnly: boolean;
  setLikedOnly: (fn: (v: boolean) => boolean) => void;
  likedTick: number;
  bumpLikedTick: () => void;
  query: string;
  setQuery: (q: string) => void;
  searchActive: boolean;
  debouncedQuery: string;
  useAlbumInSearch: boolean;
  setUseAlbumInSearch: (v: boolean) => void;
  toggleFolder: (key: string) => void;
  play: (item: MediaItem) => Promise<void>;
  error: string;
  art: string | null;
  currentMeta: SongMeta | null;
  liveLyrics: ReturnType<typeof useLiveLyrics>;
  activeIndex: number;
  activeCueText: string | undefined;
  activeLineRef: React.RefObject<HTMLDivElement>;
  userScrollUntil: React.MutableRefObject<number>;
  popup: { query: string; x: number; y: number } | null;
  setPopup: (p: { query: string; x: number; y: number } | null) => void;
  popupRef: React.MutableRefObject<{ query: string; x: number; y: number } | null>;
  popupOpenOnDownRef: React.MutableRefObject<boolean>;
  lookupAt: (e: React.MouseEvent) => void;
  pickLrcFile: () => Promise<void>;
  ytUrl: string;
  setYtUrl: (u: string) => void;
  yt: { stage: string; percent: number } | null;
  ytError: string;
  downloadYt: () => Promise<void>;
  emptyMessage: string;
}

export function useMusic(): MusicState {
  const { t } = useT();
  const activeLineRef = useRef<HTMLDivElement>(null);
  /** Suppress auto-scroll for a moment after the user scrolls the lyrics. */
  const userScrollUntil = useRef(0);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [ps, setPs] = useState(player.getState);
  const [popup, setPopup] = useState<{ query: string; x: number; y: number } | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>(
    () => (localStorage.getItem('jp-music-sort') as SortBy) || 'recent',
  );
  const [likedOnly, setLikedOnly] = useState(false);
  const [likedTick, setLikedTick] = useState(0);
  const [art, setArt] = useState<string | null>(null);
  const [ytUrl, setYtUrl] = useState('');
  const [yt, setYt] = useState<{ stage: string; percent: number } | null>(null);
  const [ytError, setYtError] = useState('');
  const [query, setQuery] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [useAlbumInSearch, setUseAlbumInSearch] = useState(
    () => loadLyricsSettings().useAlbumInSearch,
  );

  useEffect(() => player.subscribe(setPs), []);
  useEffect(() => onLikedChanged(() => setLikedTick((n) => n + 1)), []);
  useEffect(() => onLyricsSettingsChanged((s) => setUseAlbumInSearch(s.useAlbumInSearch)), []);
  useEffect(() => setPopup(null), [ps.current?.id]);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsed)));
  }, [collapsed]);

  // Filter to audio + the liked-only toggle. Recomputes on likedTick so
  // hearting a song updates the list immediately when likedOnly is active.
  const baseSongs = useMemo(() => {
    void likedTick;
    let list = items.filter((it) => AUDIO_EXT.test(it.fileName));
    if (likedOnly) list = list.filter((it) => isLiked(it.id));
    return list;
  }, [items, likedOnly, likedTick]);

  // Cached once per song-list change — NOT on every keystroke or scroll tick.
  const metaMap = useMemo(() => {
    const m = new Map<string, SongMeta>();
    for (const s of baseSongs) m.set(s.id, guessSongMeta(s));
    return m;
  }, [baseSongs]);

  const compareBy = useCallback(
    (f: (s: MediaItem) => string) => (a: MediaItem, b: MediaItem) =>
      f(a).localeCompare(f(b), undefined, { sensitivity: 'base' }) ||
      (metaMap.get(a.id)?.title ?? '').localeCompare(metaMap.get(b.id)?.title ?? ''),
    [metaMap],
  );
  const titleCompare = useMemo(
    () => compareBy((s) => metaMap.get(s.id)?.title ?? ''),
    [compareBy, metaMap],
  );

  const flatSorted = useMemo(() => {
    const list = baseSongs.slice();
    if (sortBy === 'title') list.sort(titleCompare);
    else if (sortBy === 'artist') list.sort(compareBy((s) => metaMap.get(s.id)?.artist ?? ''));
    else if (sortBy !== 'folder')
      list.sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
    return list;
  }, [baseSongs, sortBy, compareBy, metaMap, titleCompare]);

  const tree = useMemo(() => buildMusicTree(baseSongs), [baseSongs]);

  const searchIndex = useMemo(
    () => buildSearchIndex(baseSongs, (s) => metaMap.get(s.id) ?? guessSongMeta(s)),
    [baseSongs, metaMap],
  );
  const debouncedQuery = useDebouncedValue(query, 80);
  const searchActive = debouncedQuery.trim().length > 0;
  const searchResults = useMemo(
    () => (searchActive ? searchSongs(searchIndex, debouncedQuery) : []),
    [searchIndex, debouncedQuery, searchActive],
  );

  const toggleFolder = useCallback((key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  // Rows actually handed to the virtual list. Search always wins (flat,
  // instant); otherwise it's either the interactive folder tree or a flat
  // sorted list, per the "Folder" option in the sort dropdown.
  const rows: MusicRow[] = useMemo(() => {
    if (searchActive) {
      return searchResults.map((s) => ({ kind: 'song', key: s.id, song: s, depth: 0 }) as const);
    }
    if (sortBy === 'folder') return flattenMusicTree(tree, collapsed, titleCompare);
    return flatSorted.map((s) => ({ kind: 'song', key: s.id, song: s, depth: 0 }) as const);
  }, [searchActive, searchResults, sortBy, tree, collapsed, titleCompare, flatSorted]);

  // The play queue tracks the full browsable order (ignoring which folders
  // happen to be collapsed right now), so next/prev/shuffle stay stable while
  // the user folds and unfolds the tree.
  const queueSongs = useMemo(() => {
    if (searchActive) return searchResults;
    if (sortBy === 'folder') {
      return flattenMusicTree(tree, EMPTY_SET, titleCompare)
        .filter((r): r is Extract<MusicRow, { kind: 'song' }> => r.kind === 'song')
        .map((r) => r.song);
    }
    return flatSorted;
  }, [searchActive, searchResults, sortBy, tree, titleCompare, flatSorted]);

  useEffect(() => {
    window.api.listMedia().then(setItems);
    return window.api.onMediaChanged(setItems);
  }, []);

  useEffect(() => player.setQueue(queueSongs), [queueSongs]);
  useEffect(() => window.api.onYoutubeProgress(setYt), []);
  useEffect(() => localStorage.setItem('jp-music-sort', sortBy), [sortBy]);

  // Album art thumb for "now playing".
  useEffect(() => {
    const id = ps.current?.id;
    if (!id) {
      setArt(null);
      return;
    }
    let alive = true;
    void coverFor(id).then((u) => alive && setArt(u));
    return () => {
      alive = false;
    };
  }, [ps.current?.id]);

  const liveLyrics = useLiveLyrics(ps.current, ps.duration, ps.time);
  const { activeIndex } = liveLyrics;

  // Keep the active line centered (unless the user just scrolled by hand).
  // Scroll inside the lyrics pane only — scrollIntoView can nudge ancestor
  // scrollers and, with zoom + vh padding, shift the whole desktop shell.
  useEffect(() => {
    if (activeIndex < 0 || Date.now() < userScrollUntil.current) return;
    const line = activeLineRef.current;
    const pane = line?.closest('.music-lyrics') as HTMLElement | null;
    if (!line || !pane) return;
    const reduce = document.documentElement.classList.contains('reduce-motion');
    const lineTop = line.offsetTop;
    const target = lineTop - pane.clientHeight / 2 + line.offsetHeight / 2;
    pane.scrollTo({ top: Math.max(0, target), behavior: reduce ? 'auto' : 'smooth' });
  }, [activeIndex]);

  const play = useCallback(async (item: MediaItem) => {
    setError('');
    const err = await player.playItem(item);
    if (err) setError(err);
  }, []);

  const downloadYt = useCallback(async () => {
    const u = ytUrl.trim();
    if (!u) return;
    setYtError('');
    setYt({ stage: 'starting', percent: 0 });
    const res = await window.api.downloadYouTube(u, true);
    setYt(null);
    if ('error' in res) {
      setYtError(res.error);
      return;
    }
    setYtUrl('');
    setItems(await window.api.listMedia());
    void play(res.item);
  }, [ytUrl, play]);

  const lookupAt = useCallback((e: React.MouseEvent) => {
    const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
    const hit = lookupWordFromMouseUp(e);
    if (hit && !hit.translate) setPopup({ query: hit.query, x: hit.x, y: hit.y });
    else if (dismissOnly) setPopup(null);
  }, []);

  const pickLrcFile = useCallback(async () => {
    if (!ps.current) return;
    const picked = await window.api.pickSubtitle();
    if (!picked) return;
    liveLyrics.loadFromFile(picked.text);
  }, [ps.current, liveLyrics]);

  const lyrics = liveLyrics.lyrics;
  const activeCueText =
    lyrics.kind === 'synced' && activeIndex >= 0 ? lyrics.cues[activeIndex]?.text : undefined;

  const emptyMessage = searchActive
    ? t('music.empty.noMatch', { query: debouncedQuery })
    : likedOnly
      ? t('music.empty.noLiked')
      : t('music.empty.noAudio');

  return {
    items,
    setItems,
    ps,
    baseSongs,
    metaMap,
    rows,
    sortBy,
    setSortBy,
    likedOnly,
    setLikedOnly,
    likedTick,
    bumpLikedTick: () => setLikedTick((n) => n + 1),
    query,
    setQuery,
    searchActive,
    debouncedQuery,
    useAlbumInSearch,
    setUseAlbumInSearch,
    toggleFolder,
    play,
    error,
    art,
    currentMeta: ps.current ? guessSongMeta(ps.current) : null,
    liveLyrics,
    activeIndex,
    activeCueText,
    activeLineRef,
    userScrollUntil,
    popup,
    setPopup,
    popupRef,
    popupOpenOnDownRef,
    lookupAt,
    pickLrcFile,
    ytUrl,
    setYtUrl,
    yt,
    ytError,
    downloadYt,
    emptyMessage,
  };
}

/** The virtualized song list. Identical in both shells. */
export function MusicSongList({ state }: { state: MusicState }) {
  const { t } = useT();
  const { ps, metaMap, likedTick, toggleFolder, play } = state;

  const renderRow = useCallback(
    (row: MusicRow) => {
      if (row.kind === 'folder') {
        return (
          <button
            className="music-row music-row-folder"
            style={{ paddingLeft: 10 + row.depth * 14 }}
            onClick={() => toggleFolder(row.key)}
          >
            <Icon
              name="chevron"
              size={12}
              style={{
                flexShrink: 0,
                transition: 'transform 0.15s ease',
                transform: row.collapsed ? undefined : 'rotate(90deg)',
              }}
            />
            <Icon name="folder" size={13} style={{ flexShrink: 0 }} />
            <span className="music-row-folder-name">{row.name || t('music.folder.untitled')}</span>
            <span className="muted music-row-folder-count">{row.count}</span>
          </button>
        );
      }
      const s = row.song;
      const meta = metaMap.get(s.id) ?? guessSongMeta(s);
      return (
        <button
          className={`music-row music-song ${ps.current?.id === s.id ? 'active' : ''}`}
          style={{ paddingLeft: 10 + row.depth * 14 }}
          onClick={() => void play(s)}
          title={s.fileName}
        >
          {isLiked(s.id) && <Icon name="heart" size={11} fill style={{ flexShrink: 0 }} />}
          <span className="music-song-title">{meta.title}</span>
          {meta.artist && <span className="music-song-artist muted">{meta.artist}</span>}
        </button>
      );
      // `likedTick` is a deliberate dependency: hearting a song must re-render
      // its row even though the row data itself did not change.
    },
    [ps.current?.id, metaMap, toggleFolder, play, likedTick, t],
  );

  return (
    <VirtualList
      items={state.rows}
      itemHeight={ROW_HEIGHT}
      getKey={(row) => row.key}
      renderItem={renderRow}
      className="music-vlist"
      emptyState={<p className="muted music-empty">{state.emptyMessage}</p>}
    />
  );
}

/** Search field above the list. */
export function MusicSearchBox({ state }: { state: MusicState }) {
  const { t } = useT();
  return (
    <div className="music-search">
      <Icon name="search" size={13} />
      <input
        type="text"
        value={state.query}
        onChange={(e) => state.setQuery(e.target.value)}
        placeholder={t('music.search.placeholder')}
        aria-label={t('music.search.ariaLabel')}
      />
      {state.query && (
        <button
          className="music-search-clear"
          onClick={() => state.setQuery('')}
          title={t('music.search.clear')}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** YouTube audio-grab row. */
export function MusicYoutubeRow({ state }: { state: MusicState }) {
  const { t } = useT();
  const { yt, ytError } = state;
  return (
    <div className="music-yt">
      <input
        type="text"
        className="music-yt-input"
        placeholder={t('music.yt.placeholder')}
        value={state.ytUrl}
        onChange={(e) => state.setYtUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && void state.downloadYt()}
        disabled={!!yt}
      />
      <button
        className="btn small"
        disabled={!!yt || !state.ytUrl.trim()}
        onClick={() => void state.downloadYt()}
      >
        <Icon name="download" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
        {yt ? `${yt.stage} ${Math.round(yt.percent)}%` : t('music.yt.getAudio')}
      </button>
      {ytError && <div className="lib-import-err music-yt-err">{ytError}</div>}
    </div>
  );
}

/** Karaoke lyrics pane, including click-to-look-up wiring. */
export function MusicLyricsPane({ state }: { state: MusicState }) {
  const { t } = useT();
  const { ps, liveLyrics, activeIndex } = state;
  const lyrics = liveLyrics.lyrics;

  return (
    <div
      className="music-lyrics"
      onWheel={() => (state.userScrollUntil.current = Date.now() + 3000)}
      onMouseDown={(e) => {
        state.popupOpenOnDownRef.current = !!state.popupRef.current;
        noteLookupPointerDown(e);
      }}
      onMouseUp={state.lookupAt}
      data-dict-owner=""
      title={t('music.lyricsClickHint')}
    >
      {!ps.current && (
        <div className="music-hint muted">
          <Icon name="music" size={44} />
          <p>{t('music.hint.pickSong')}</p>
        </div>
      )}
      {ps.current && lyrics.kind === 'loading' && (
        <p className="muted music-hint">{t('music.lyricsLoading')}</p>
      )}
      {ps.current && lyrics.kind === 'missing' && (
        <div className="music-hint muted">
          <p>
            {lyrics.error
              ? t('music.noLyricsWithError', { error: lyrics.error })
              : t('music.noLyrics')}
          </p>
          <div className="music-hint-btns">
            <button className="btn small" onClick={liveLyrics.reload}>
              <Icon name="refresh" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('music.searchAgain')}
            </button>
            <button className="btn small" onClick={() => void state.pickLrcFile()}>
              <Icon name="note" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
              {t('music.loadLrcFile')}
            </button>
          </div>
        </div>
      )}
      {lyrics.kind === 'synced' &&
        lyrics.cues.map((c, i) => (
          <div
            key={i}
            ref={i === activeIndex ? state.activeLineRef : undefined}
            className={`music-line ${i === activeIndex ? 'active' : ''} ${i < activeIndex ? 'past' : ''}`}
            onDoubleClick={() => player.seek(c.start)}
            title={t('music.doubleClickJump')}
          >
            {c.text}
          </div>
        ))}
      {lyrics.kind === 'plain' && (
        <>
          <p className="muted music-plain-note">{t('music.notSynced')}</p>
          {lyrics.lines.map((l, i) => (
            <div key={i} className="music-line plain">
              {l}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** Transport: shuffle, prev/play/next, repeat, like, seek, volume. */
export function MusicControls({
  state,
  onOpenWidget,
}: {
  state: MusicState;
  onOpenWidget?: () => void;
}) {
  const { t } = useT();
  const { ps } = state;

  return (
    <div className="music-controls">
      <button
        className={`btn small ${ps.shuffle ? 'primary' : ''}`}
        onClick={player.toggleShuffle}
        title={t('music.controls.shuffle')}
      >
        <Icon name="shuffle" size={15} />
      </button>
      <button
        className="btn small"
        onClick={player.prev}
        disabled={!ps.current}
        title={t('music.controls.previous')}
      >
        <Icon name="skip-back" size={15} />
      </button>
      <button className="btn primary music-play" onClick={player.toggle} disabled={!ps.current}>
        <Icon name={ps.playing ? 'pause' : 'player'} size={16} />
      </button>
      <button
        className="btn small"
        onClick={player.next}
        disabled={!ps.current}
        title={t('music.controls.next')}
      >
        <Icon name="skip-forward" size={15} />
      </button>
      <button
        className={`btn small music-repeat-btn ${ps.repeat !== 'off' ? 'primary' : ''}`}
        onClick={player.cycleRepeat}
        title={t('music.controls.repeatTitle', { mode: t(`music.repeat.${ps.repeat}`) })}
      >
        <Icon name="repeat" size={15} />
        {ps.repeat === 'one' && <span className="music-repeat-one">1</span>}
      </button>
      <button
        className="btn small"
        onClick={() => ps.current && (toggleLiked(ps.current.id), state.bumpLikedTick())}
        disabled={!ps.current}
        title={t('music.controls.addToLiked')}
      >
        <Icon name="heart" size={15} fill={!!ps.current && isLiked(ps.current.id)} />
      </button>
      <span className="music-time muted">{fmt(ps.time)}</span>
      <input
        type="range"
        className="music-seek"
        min={0}
        max={ps.duration || 1}
        step={0.1}
        value={Math.min(ps.time, ps.duration || 1)}
        onChange={(e) => player.seek(Number(e.target.value))}
        disabled={!ps.current}
      />
      <span className="music-time muted">{fmt(ps.duration)}</span>
      <Icon name="volume" size={15} style={{ flexShrink: 0 }} />
      <input
        type="range"
        className="music-volume"
        min={0}
        max={1}
        step={0.05}
        value={ps.volume}
        onChange={(e) => player.setVolume(Number(e.target.value))}
        title={t('music.controls.volume')}
      />
      {onOpenWidget && (
        <button className="btn small" onClick={onOpenWidget} title={t('music.controls.openWidget')}>
          <Icon name="window" size={15} />
        </button>
      )}
    </div>
  );
}

/** Now-playing strip with album art. */
export function MusicNowPlaying({ state }: { state: MusicState }) {
  const { ps, currentMeta, art } = state;
  if (!ps.current || !currentMeta) return null;

  return (
    <div className="music-nowplaying muted" title={ps.current.fileName}>
      {art ? (
        <img className="music-now-art" src={art} alt="" />
      ) : (
        <Icon name="music" size={13} style={{ marginRight: 6, verticalAlign: '-2px' }} />
      )}
      {currentMeta.artist ? `${currentMeta.artist} — ` : ''}
      {currentMeta.title}
    </div>
  );
}

export { toggleUseAlbumInSearch };

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
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import Icon from '../Icons';
import VirtualList from '../VirtualList';
import { AnchorSurface, ContextualSurface } from '../liquid/LiquidSurface';
import type { MediaItem } from '../../../shared/types';
import { guessSongMeta, type SongMeta } from '../../lyrics';
import { useLiveLyrics } from '../../liveLyrics';
import * as player from '../../playerBus';
import { coverFor } from '../../albumArt';
import { isLiked, onLikedChanged, toggleLiked } from '../../likedSongs';
import {
  addTracksToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  listPlaylists,
  moveTrackInPlaylist,
  onPlaylistPlayRequested,
  onPlaylistsChanged,
  PLAYLIST_NAME_MAX,
  removeTrackFromPlaylist,
  renamePlaylist,
  resolvePlaylistTracks,
  takePendingPlaylistPlay,
  type MusicPlaylist,
} from '../../musicPlaylists';
import { ContextMenu, type MenuItem } from '../ui/ContextMenu';
import {
  loadLyricsSettings,
  onLyricsSettingsChanged,
  toggleUseAlbumInSearch,
} from '../../lyricsSettings';
import {
  buildMusicTree,
  buildSearchIndex,
  flattenMusicTree,
  searchSongs,
  type MusicRow,
} from '../../musicLibrary';
import { lookupWordFromMouseUp, isLookupClick, noteLookupPointerDown } from '../../wordLookup';
import { registerCommandHandler } from '../../keyboardShortcuts';
import { useT } from '../../i18n';
import { useWiredMaterials } from '../ui/AppChrome';
import WiredOscilloscope from '../wired/WiredOscilloscope';
import { useMusicMining } from './useMusicMining';
import MusicStudyBar from './MusicStudyBar';
import DictionaryPopup from '../DictionaryPopup';
import { useMusicStudyPrefs } from '../../musicStudyPrefs';
import { recordLinesStudied } from '../../stats';
import { createLyricStudyLog } from '../../../shared/musicLyricStudy';

// music2: known-word colouring brings the tokenizer, so the coloured line loads on demand.
const MusicLyricText = lazy(() => import('./MusicLyricText'));
import {
  musicCueReplaySec,
  musicCueStepSec,
  musicTransportCues,
  type MusicLyricsKind,
  type MusicMiningLine,
} from '../../../shared/musicMining';

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
  /** The user's playlists, and the one the list is showing (null: the whole library). */
  playlists: MusicPlaylist[];
  playlistId: string | null;
  activePlaylist: MusicPlaylist | undefined;
  setPlaylistId: (id: string | null) => void;
  /** Show a playlist and play it from its first track. */
  playPlaylist: (id: string) => void;
  /** The last playlist action, for a polite status line. */
  playlistNote: string;
  setPlaylistNote: (note: string) => void;
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
  /** The queue was arranged by hand (Play next, Add to queue, reorder). */
  queueArranged: boolean;
  /** Hand the queue back to the list's own order (the library, search or playlist shown). */
  restoreListOrder: () => void;
  /** Count a lyric line toward "lines studied" (once per line per session). */
  noteLyricLineStudied: (index: number) => void;
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
  const [playlists, setPlaylists] = useState(listPlaylists);
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [playlistNote, setPlaylistNote] = useState('');
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const activePlaylist = getPlaylistFrom(playlists, playlistId);
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
  useEffect(() => onPlaylistsChanged(() => setPlaylists(listPlaylists())), []);
  // A deleted playlist (here or in another window) drops the view back to the library.
  useEffect(() => {
    if (playlistId && !activePlaylist) setPlaylistId(null);
  }, [playlistId, activePlaylist]);
  useEffect(() => onLyricsSettingsChanged((s) => setUseAlbumInSearch(s.useAlbumInSearch)), []);
  useEffect(() => setPopup(null), [ps.current?.id]);
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsed)));
  }, [collapsed]);

  // Filter to audio + the liked-only toggle. Recomputes on likedTick so
  // hearting a song updates the list immediately when likedOnly is active.
  // A playlist narrows the library to its tracks, in the playlist's own order.
  const baseSongs = useMemo(() => {
    void likedTick;
    let list = items.filter((it) => AUDIO_EXT.test(it.fileName));
    if (activePlaylist) list = resolvePlaylistTracks(activePlaylist, list);
    if (likedOnly) list = list.filter((it) => isLiked(it.id));
    return list;
  }, [items, likedOnly, likedTick, activePlaylist]);

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
    // A playlist's order is the user's; the library sorts do not apply to it.
    if (activePlaylist) return list;
    if (sortBy === 'title') list.sort(titleCompare);
    else if (sortBy === 'artist') list.sort(compareBy((s) => metaMap.get(s.id)?.artist ?? ''));
    else if (sortBy !== 'folder')
      list.sort((a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt));
    return list;
  }, [baseSongs, sortBy, compareBy, metaMap, titleCompare, activePlaylist]);

  const tree = useMemo(() => buildMusicTree(baseSongs), [baseSongs]);

  const searchIndex = useMemo(
    () => buildSearchIndex(baseSongs, (s) => metaMap.get(s.id) ?? guessSongMeta(s)),
    [baseSongs, metaMap],
  );
  // MusicSearchBox commits its lightweight draft after the user pauses, so the library/lyrics/
  // transport tree does not re-render for every character. Keep the effective query named here
  // because it is part of MusicState's public shape and downstream search logic reads it.
  const debouncedQuery = query;
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
    if (sortBy === 'folder' && !activePlaylist) return flattenMusicTree(tree, collapsed, titleCompare);
    return flatSorted.map((s) => ({ kind: 'song', key: s.id, song: s, depth: 0 }) as const);
  }, [searchActive, searchResults, sortBy, tree, collapsed, titleCompare, flatSorted, activePlaylist]);

  // The play queue tracks the full browsable order (ignoring which folders
  // happen to be collapsed right now), so next/prev/shuffle stay stable while
  // the user folds and unfolds the tree.
  const queueSongs = useMemo(() => {
    if (searchActive) return searchResults;
    if (sortBy === 'folder' && !activePlaylist) {
      return flattenMusicTree(tree, EMPTY_SET, titleCompare)
        .filter((r): r is Extract<MusicRow, { kind: 'song' }> => r.kind === 'song')
        .map((r) => r.song);
    }
    return flatSorted;
  }, [searchActive, searchResults, sortBy, tree, titleCompare, flatSorted, activePlaylist]);

  useEffect(() => {
    window.api.listMedia().then((next) => {
      setItems(next);
      setItemsLoaded(true);
    });
    return window.api.onMediaChanged(setItems);
  }, []);

  // A queue the user arranged by hand is theirs: sorting or searching the list must not
  // replace it. Any explicit `setQueue` (a playlist, "Use list order") hands it back.
  const queueArranged = !!ps.queueArranged;
  useEffect(() => {
    if (!player.getState().queueArranged) player.setQueue(queueSongs);
  }, [queueSongs, queueArranged]);
  const queueSongsRef = useRef(queueSongs);
  queueSongsRef.current = queueSongs;
  const restoreListOrder = useCallback(() => player.setQueue(queueSongsRef.current), []);
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

  // "Lines studied": a lyric line the learner replays, looks into or mines counts once per
  // session, the way the video overlay counts a subtitle line (shared/musicLyricStudy.ts).
  const lyricStudyLogRef = useRef<ReturnType<typeof createLyricStudyLog> | null>(null);
  const lyricStudySourceRef = useRef({ trackId: '', lyrics: liveLyrics.lyrics });
  lyricStudySourceRef.current = { trackId: ps.current?.id ?? '', lyrics: liveLyrics.lyrics };
  const noteLyricLineStudied = useCallback((index: number) => {
    const { trackId, lyrics: sheet } = lyricStudySourceRef.current;
    const text = sheet.kind === 'synced'
      ? sheet.cues[index]?.text
      : sheet.kind === 'plain' ? sheet.lines[index] : undefined;
    if (!trackId || typeof text !== 'string') return;
    lyricStudyLogRef.current ??= createLyricStudyLog((count) => recordLinesStudied(count));
    lyricStudyLogRef.current.note(trackId, index, text);
  }, []);

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
    // In a hand-arranged queue a track from outside it joins after the current one
    // instead of leaving the player with no place in the queue to continue from.
    const now = player.getState();
    if (now.queueArranged && !now.queue.some((q) => q.id === item.id)) player.queueTrackNext(item);
    const err = await player.playItem(item);
    if (err) setError(err);
  }, []);

  // Show the playlist and start it from the top. The queue is set here rather than left to
  // the queue effect, so the first track plays against the playlist's order immediately.
  const playPlaylist = useCallback(
    (id: string) => {
      const playlist = getPlaylist(id);
      if (!playlist) return;
      setPlaylistId(id);
      setQuery('');
      const tracks = resolvePlaylistTracks(playlist, items.filter((it) => AUDIO_EXT.test(it.fileName)));
      if (tracks.length === 0) {
        setPlaylistNote(t('musicUi.playlists.nothingToPlay'));
        return;
      }
      player.setQueue(tracks);
      void play(tracks[0]);
    },
    [items, play, t],
  );

  // "Play playlist" from the palette: claimed once, after the library has loaded.
  const playPlaylistRef = useRef(playPlaylist);
  playPlaylistRef.current = playPlaylist;
  useEffect(() => {
    if (!itemsLoaded) return undefined;
    const claim = (): void => {
      const id = takePendingPlaylistPlay();
      if (id) playPlaylistRef.current(id);
    };
    claim();
    return onPlaylistPlayRequested(claim);
  }, [itemsLoaded]);

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
    if (hit && !hit.translate) {
      setPopup({ query: hit.query, x: hit.x, y: hit.y });
      // A word looked up in a lyric line is that line studied.
      const line = (e.target as Element | null)?.closest?.('[data-lyric-line]');
      const index = Number(line?.getAttribute('data-lyric-line'));
      if (line && Number.isInteger(index)) noteLyricLineStudied(index);
    } else if (dismissOnly) setPopup(null);
  }, [noteLyricLineStudied]);

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
    : activePlaylist
      ? t('musicUi.playlists.empty')
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
    playlists,
    playlistId: activePlaylist ? playlistId : null,
    activePlaylist,
    setPlaylistId,
    playPlaylist,
    playlistNote,
    setPlaylistNote,
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
    queueArranged,
    restoreListOrder,
    noteLyricLineStudied,
  };
}

function getPlaylistFrom(list: MusicPlaylist[], id: string | null): MusicPlaylist | undefined {
  return id ? list.find((p) => p.id === id) : undefined;
}

/**
 * The song menu: "Add to <playlist>" for each playlist and "New playlist with this song"
 * in the library; move and remove inside a playlist. Built from `state` so both shells
 * that host the list get the same menu.
 */
function songMenuItems(
  state: MusicState,
  song: MediaItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
  moves: Map<string, { up?: number; down?: number }>,
): MenuItem[] {
  // Queue actions lead the menu in every view (library, search, playlist): they are the
  // ones a listener reaches for while something is already playing.
  const title = state.metaMap.get(song.id)?.title ?? song.title ?? song.fileName;
  const isCurrent = state.ps.current?.id === song.id;
  const queueItems: MenuItem[] = [
    {
      id: 'play-next',
      label: t('fu1.queue.playNext'),
      disabled: isCurrent,
      onSelect: () => {
        player.queueTrackNext(song);
        state.setPlaylistNote(t('fu1.queue.queuedNext', { title }));
      },
    },
    {
      id: 'add-to-queue',
      label: t('fu1.queue.addToQueue'),
      disabled: isCurrent,
      onSelect: () => {
        player.queueTrackLast(song);
        state.setPlaylistNote(t('fu1.queue.queuedLast', { title }));
      },
    },
    { separator: true, label: '' },
  ];
  const playlist = state.activePlaylist;
  if (playlist) {
    const { up, down } = moves.get(song.id) ?? {};
    return [
      ...queueItems,
      {
        id: 'up',
        label: t('musicUi.playlists.moveUp'),
        disabled: up === undefined,
        onSelect: () => up !== undefined && moveTrackInPlaylist(playlist.id, song.id, up),
      },
      {
        id: 'down',
        label: t('musicUi.playlists.moveDown'),
        disabled: down === undefined,
        onSelect: () => down !== undefined && moveTrackInPlaylist(playlist.id, song.id, down),
      },
      { separator: true, label: '' },
      {
        id: 'remove',
        label: t('musicUi.playlists.remove'),
        danger: true,
        onSelect: () => removeTrackFromPlaylist(playlist.id, song.id),
      },
    ];
  }
  const items: MenuItem[] = [...queueItems];
  const playlistItems: MenuItem[] = state.playlists.map((p) => {
    const has = p.trackIds.includes(song.id);
    return {
      id: `add-${p.id}`,
      label: has ? t('musicUi.playlists.alreadyIn', { name: p.name }) : t('musicUi.playlists.addTo', { name: p.name }),
      disabled: has,
      onSelect: () => {
        if (addTracksToPlaylist(p.id, [song.id]) > 0) state.setPlaylistNote(t('musicUi.playlists.added', { name: p.name }));
      },
    };
  });
  if (playlistItems.length) items.push(...playlistItems, { separator: true, label: '' });
  items.push({
    id: 'new',
    label: t('musicUi.playlists.newWithSong'),
    onSelect: () => {
      const created = createPlaylist(
        '',
        t('musicUi.playlists.defaultName', { n: state.playlists.length + 1 }),
        [song.id],
      );
      state.setPlaylistNote(t('musicUi.playlists.added', { name: created.name }));
    },
  });
  return items;
}

/** The virtualized song list. Identical in both shells. */
export function MusicSongList({ state }: { state: MusicState }) {
  const { t } = useT();
  const { ps, metaMap, likedTick, toggleFolder, play, activePlaylist } = state;
  const [menu, setMenu] = useState<{ x: number; y: number; song: MediaItem } | null>(null);
  // Move past the adjacent visible song, skipping missing or filtered tracks.
  // Build the destinations once for the virtual list and its context menu.
  const moves = useMemo(() => {
    const result = new Map<string, { up?: number; down?: number }>();
    if (!activePlaylist) return result;
    const positions = new Map(activePlaylist.trackIds.map((id, index) => [id, index]));
    const ids = state.rows.flatMap((row) => row.kind === 'song' ? [row.song.id] : []);
    ids.forEach((id, index) => result.set(id, {
      up: positions.get(ids[index - 1]),
      down: positions.get(ids[index + 1]),
    }));
    return result;
  }, [activePlaylist, state.rows]);

  const openMenu = useCallback((song: MediaItem, x: number, y: number) => setMenu({ song, x, y }), []);
  const onMenuKey = useCallback(
    (song: MediaItem) => (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key !== 'ContextMenu' && !(e.shiftKey && e.key === 'F10')) return;
      e.preventDefault();
      const r = e.currentTarget.getBoundingClientRect();
      openMenu(song, r.left + 16, r.bottom);
    },
    [openMenu],
  );

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
      const songButton = (
        <button
          className={`music-row music-song ${ps.current?.id === s.id ? 'active' : ''}`}
          style={{ paddingLeft: 10 + row.depth * 14 }}
          onClick={() => void play(s)}
          onContextMenu={(e) => {
            e.preventDefault();
            openMenu(s, e.clientX, e.clientY);
          }}
          onKeyDown={onMenuKey(s)}
          title={s.fileName}
        >
          {isLiked(s.id) && <Icon name="heart" size={11} fill style={{ flexShrink: 0 }} />}
          <span className="music-song-title">{meta.title}</span>
          {meta.artist && <span className="music-song-artist muted">{meta.artist}</span>}
        </button>
      );
      if (!activePlaylist) return songButton;
      // Inside a playlist the order is the user's, so moving and removing sit on the row
      // itself (the same commands are on the row's menu for the keyboard).
      const { up, down } = moves.get(s.id) ?? {};
      return (
        <div className="music-playlist-row">
          {songButton}
          <span className="music-playlist-row__actions lq-hit-scope">
            <button
              type="button"
              aria-label={t('musicUi.playlists.moveUp')}
              title={t('musicUi.playlists.moveUp')}
              disabled={up === undefined}
              onClick={() => up !== undefined && moveTrackInPlaylist(activePlaylist.id, s.id, up)}
            >
              <Icon name="chevron" size={12} style={{ transform: 'rotate(-90deg)' }} />
            </button>
            <button
              type="button"
              aria-label={t('musicUi.playlists.moveDown')}
              title={t('musicUi.playlists.moveDown')}
              disabled={down === undefined}
              onClick={() => down !== undefined && moveTrackInPlaylist(activePlaylist.id, s.id, down)}
            >
              <Icon name="chevron" size={12} style={{ transform: 'rotate(90deg)' }} />
            </button>
            <button
              type="button"
              aria-label={t('musicUi.playlists.remove')}
              title={t('musicUi.playlists.remove')}
              onClick={() => removeTrackFromPlaylist(activePlaylist.id, s.id)}
            >
              <Icon name="close" size={12} />
            </button>
          </span>
        </div>
      );
      // `likedTick` is a deliberate dependency: hearting a song must re-render
      // its row even though the row data itself did not change.
    },
    [ps.current?.id, metaMap, toggleFolder, play, likedTick, t, activePlaylist, moves, openMenu, onMenuKey],
  );

  return (
    <>
      <VirtualList
        items={state.rows}
        itemHeight={ROW_HEIGHT}
        getKey={(row) => row.key}
        renderItem={renderRow}
        className="music-vlist"
        listRole="list"
        itemRole="listitem"
        emptyState={
          <div className="music-empty">
            <p className="muted">{state.emptyMessage}</p>
            {!state.searchActive && !state.likedOnly && !activePlaylist ? (
              <MusicAddFolderButton onItems={state.setItems} />
            ) : null}
          </div>
        }
      />
      {menu ? (
        <ContextMenu
          open
          x={menu.x}
          y={menu.y}
          items={songMenuItems(state, menu.song, t, moves)}
          onClose={() => setMenu(null)}
        />
      ) : null}
    </>
  );
}

/**
 * The playlist picker and its actions, above the song list: pick "All songs" or a
 * playlist, play it, create, rename or delete one. Names are edited inline (Electron has
 * no `prompt()`), and delete asks once in place, the way the scheduling reset does.
 */
export function MusicPlaylistBar({ state }: { state: MusicState }) {
  const { t } = useT();
  const { playlists, activePlaylist } = state;
  const [editing, setEditing] = useState<'new' | 'rename' | null>(null);
  const [name, setName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setConfirmDelete(false), [activePlaylist?.id]);

  const startEdit = (mode: 'new' | 'rename'): void => {
    setEditing(mode);
    setName(mode === 'rename' ? activePlaylist?.name ?? '' : '');
    setConfirmDelete(false);
  };
  const submit = (): void => {
    if (editing === 'new') {
      const created = createPlaylist(name, t('musicUi.playlists.defaultName', { n: playlists.length + 1 }));
      state.setPlaylistId(created.id);
    } else if (editing === 'rename' && activePlaylist) {
      renamePlaylist(activePlaylist.id, name);
    }
    setEditing(null);
  };
  const remove = (): void => {
    if (!activePlaylist) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deletePlaylist(activePlaylist.id);
    state.setPlaylistId(null);
    setConfirmDelete(false);
  };

  return (
    <div className="music-playlists" role="group" aria-label={t('musicUi.playlists.label')}>
      <div className="music-playlists__row">
        <label className="music-playlists__pick">
          <span className="music-visually-hidden">{t('musicUi.playlists.label')}</span>
          <select
            value={activePlaylist?.id ?? ''}
            onChange={(e) => {
              state.setPlaylistId(e.target.value || null);
              setEditing(null);
            }}
          >
            <option value="">{t('musicUi.playlists.allSongs')}</option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {t('musicUi.playlists.option', { name: p.name, count: p.trackIds.length })}
              </option>
            ))}
          </select>
        </label>
        {activePlaylist ? (
          <>
            <button type="button" className="btn small primary" onClick={() => state.playPlaylist(activePlaylist.id)}>
              {t('musicUi.playlists.play')}
            </button>
            <button type="button" className="btn small" onClick={() => startEdit('rename')}>
              {t('musicUi.playlists.rename')}
            </button>
            <button type="button" className="btn small" onClick={remove}>
              {confirmDelete
                ? t('musicUi.playlists.deleteConfirm', { name: activePlaylist.name })
                : t('musicUi.playlists.delete')}
            </button>
          </>
        ) : null}
        <button type="button" className="btn small" onClick={() => startEdit('new')}>
          <Icon name="plus" size={12} /> {t('musicUi.playlists.new')}
        </button>
      </div>
      {editing ? (
        <form
          className="music-playlists__row"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={PLAYLIST_NAME_MAX}
            aria-label={t('musicUi.playlists.nameLabel')}
            placeholder={
              editing === 'new' ? t('musicUi.playlists.defaultName', { n: playlists.length + 1 }) : undefined
            }
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                setEditing(null);
              }
            }}
          />
          <button type="submit" className="btn small primary" disabled={editing === 'rename' && !name.trim()}>
            {t('musicUi.playlists.save')}
          </button>
          <button type="button" className="btn small" onClick={() => setEditing(null)}>
            {t('musicUi.playlists.cancel')}
          </button>
        </form>
      ) : null}
      <p className="music-playlists__note muted" role="status">
        {state.playlistNote}
      </p>
    </div>
  );
}

/**
 * The empty library offers the import itself instead of only describing where
 * files could go: one folder dialog, and the songs show up in the list.
 */
function MusicAddFolderButton({ onItems }: { onItems: (items: MediaItem[]) => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const add = async () => {
    setBusy(true);
    setNote('');
    try {
      const r = await window.api.addMediaFolder();
      onItems(r.items);
      if (r.added === 0) setNote(t('musicUi.empty.noneAdded'));
    } catch {
      setNote(t('musicUi.empty.addFailed'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button type="button" className="btn primary small" disabled={busy} onClick={() => void add()}>
        <Icon name="folder" size={13} />
        {t('musicUi.empty.addFolder')}
      </button>
      {note ? (
        <p className="muted" role="status">
          {note}
        </p>
      ) : null}
    </>
  );
}

/** Search field above the list. */
export function MusicSearchBox({ state }: { state: MusicState }) {
  const { t } = useT();
  const [draft, setDraft] = useState(state.query);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
  }, []);

  const updateDraft = (value: string): void => {
    setDraft(value);
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      commitTimer.current = null;
      state.setQuery(value);
    }, 80);
  };

  const clearDraft = (): void => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = null;
    setDraft('');
    state.setQuery('');
  };

  return (
    // Filtering the library is a contextual tool over it, not dense work in it,
    // so it takes the Liquid role. Inert until the window is Liquid.
    <ContextualSurface className="music-search">
      <Icon name="search" size={13} />
      <input
        type="text"
        value={draft}
        onChange={(e) => updateDraft(e.target.value)}
        placeholder={t('music.search.placeholder')}
        aria-label={t('music.search.ariaLabel')}
      />
      {draft && (
        <button
          className="music-search-clear"
          onClick={clearDraft}
          title={t('music.search.clear')} aria-label={t('music.search.clear')}
        >
          ×
        </button>
      )}
    </ContextualSurface>
  );
}

/** YouTube audio-grab row. */
export function MusicYoutubeRow({ state }: { state: MusicState }) {
  const { t } = useT();
  const { yt, ytError } = state;
  return (
    // A URL the user types is data ENTRY, so this stays an opaque anchor rather
    // than becoming glass — literally the "toolbar's URL field" case `bare` names.
    <AnchorSurface bare className="music-yt">
      <input
        type="text"
        className="music-yt-input"
        placeholder={t('music.yt.placeholder')}
        value={state.ytUrl}
        onChange={(e) => state.setYtUrl(e.target.value)}
        onKeyDown={(e) => {
          // Enter confirms an IME conversion; it must not start the download yet.
          if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
          if (e.key === 'Enter') void state.downloadYt();
        }}
        disabled={!!yt}
      />
      <button
        className="btn small"
        disabled={!!yt || !state.ytUrl.trim()}
        onClick={() => void state.downloadYt()}
      >
        <Icon name="download" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
        {yt
          ? yt.stage === 'merging'
            ? t('media.yt.merging')
            : t('media.yt.downloading', { percent: Math.round(yt.percent) })
          : t('music.yt.getAudio')}
      </button>
      {ytError && <div className="lib-import-err music-yt-err">{ytError}</div>}
    </AnchorSurface>
  );
}

/**
 * music2 — the lyric lookup's popup, for hosts that render the pane but not the popup.
 *
 * The pane is `data-dict-owner`, so the global overlay deliberately skips it, and only
 * Blanc rendered `state.popup` (with these same props): in the Media Center a click on a
 * lyric set the popup state and nothing ever drew it.
 */
export function MusicLookupPopup({ state }: { state: MusicState }) {
  if (!state.popup) return null;
  return (
    <DictionaryPopup
      query={state.popup.query}
      context={state.activeCueText}
      x={state.popup.x}
      y={state.popup.y}
      onClose={() => state.setPopup(null)}
    />
  );
}

/** Karaoke lyrics pane, including click-to-look-up wiring. */
export function MusicLyricsPane({ state }: { state: MusicState }) {
  const { t } = useT();
  const { ps, liveLyrics, activeIndex } = state;
  const lyrics = liveLyrics.lyrics;
  // Slice 17: music joins the study loop video already had. The card goes through the same
  // draft/request/history path, so a mined lyric appears in Review with no extra wiring.
  const mining = useMusicMining(ps.current ?? null);
  // music2: the lyric study switches (pause after line, repeat, colour, reading aid).
  const studyPrefs = useMusicStudyPrefs();
  const colourLines = studyPrefs.knownHighlight || studyPrefs.readingAid;
  /** One lyric line's text: coloured by knowledge when asked, plain otherwise. */
  const lyricText = (text: string): ReactElement =>
    colourLines ? (
      <Suspense fallback={<span className="music-line-text">{text}</span>}>
        <MusicLyricText text={text} knownHighlight={studyPrefs.knownHighlight} readingAid={studyPrefs.readingAid} />
      </Suspense>
    ) : (
      <span className="music-line-text">{text}</span>
    );

  /**
   * Slice 20 — cue navigation, in the shape video already uses.
   *
   * Only synced lyrics can be navigated: a plain sheet has no timestamps to seek to. The
   * conversion, the stepping and the replay target all live in `shared/musicMining.ts`
   * next to `musicStudyCue`, which the Mine button already goes through — so a line the
   * transport will move to and a line the user can mine are decided by the same code, and
   * the rule for "which line am I on" stays `adjacentStudyCue`'s, the video overlay's own.
   * These were three inline closures here; they were untestable in that form, which is why
   * this feature sat in the tree with no gate on it.
   */
  const studyCues = useMemo(
    () => (lyrics.kind === 'synced'
      ? musicTransportCues(lyrics.cues.map((c, i) => ({
        index: i, text: c.text, startSec: c.start, endSec: c.end,
      })))
      : []),
    [lyrics],
  );

  const stepCue = (direction: -1 | 1): void => {
    const target = musicCueStepSec(studyCues, ps.time ?? 0, direction);
    if (target != null) player.seek(target);
  };

  /** Restart the line being sung, which is the one thing stepping cannot express. */
  const replayCue = (): void => {
    const target = musicCueReplaySec(studyCues, activeIndex);
    if (target == null) return;
    player.seek(target);
    state.noteLyricLineStudied(activeIndex);
  };
  const noteStudiedRef = useRef(state.noteLyricLineStudied);
  noteStudiedRef.current = state.noteLyricLineStudied;

  /**
   * The same three gestures from the keyboard, on `music.*` ids of their own.
   *
   * Slice 20 left this as the deliberate decision to take, and named the trap: these must
   * NOT reuse `video.replayLine`/`prevLine`/`nextLine`. `registerCommandHandler` keeps a
   * stack per id and the last registrant wins, and `MediaWorkspaceHost` mounts at App
   * level — so the lyrics pane and the video overlay are mounted together whenever the
   * media workspace is open over Music, and sharing an id would hand one surface both
   * gestures according to mount order.
   *
   * Registered once, reading through refs. The three handlers close over the cue sheet and
   * the playhead, both of which change on every tick; re-registering on each change would
   * churn the stack many times a second and, because the stack is last-wins, would keep
   * re-taking the id from whatever else is mounted.
   *
   * Registering unconditionally — including while the sheet is empty — is deliberate. A
   * plain (unsynced) sheet has nothing to seek to, so the handler does nothing, which is
   * the same answer the buttons give by not rendering. Gating the registration instead
   * would mean the id is unowned for unsynced tracks and some other stack entry would
   * answer for it.
   */
  const cueNavRef = useRef({ studyCues, activeIndex, time: ps.time ?? 0 });
  cueNavRef.current = { studyCues, activeIndex, time: ps.time ?? 0 };
  useEffect(() => {
    const step = (direction: -1 | 1) => (): void => {
      const { studyCues: cues, time } = cueNavRef.current;
      const target = musicCueStepSec(cues, time, direction);
      if (target != null) player.seek(target);
    };
    const offs = [
      registerCommandHandler('music.prevLine', step(-1)),
      registerCommandHandler('music.nextLine', step(1)),
      registerCommandHandler('music.replayLine', () => {
        const { studyCues: cues, activeIndex: index } = cueNavRef.current;
        const target = musicCueReplaySec(cues, index);
        if (target == null) return;
        player.seek(target);
        noteStudiedRef.current(index);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  const mineLabel = (index: number): string => {
    const { outcome } = mining;
    // `idle` carries no index, so the narrowing has to happen before the comparison —
    // reading `outcome.index` first would be a type error and, worse, would label every
    // line with whatever the last outcome was.
    if (outcome.kind === 'idle' || outcome.index !== index) return t('music.mine');
    // Recording plays the line through in real time, so it must say so — otherwise the
    // player appears to jump and stutter for no stated reason.
    if (outcome.kind === 'recording') return t('music.mineRecording');
    if (outcome.kind === 'busy') return t('music.mining');
    if (outcome.kind === 'done') {
      return outcome.withAudio ? t('music.minedWithAudio') : t('music.mined');
    }
    if (outcome.kind === 'duplicate') return t('music.mineDuplicate');
    if (outcome.kind === 'saved') {
      return outcome.anki === 'queued' ? t('music.minedAnkiLater') : t('music.minedToDeck');
    }
    return t('music.mineFailed');
  };

  /** The button is per-line so the user mines what they are reading, not what is playing. */
  const mineButton = (line: MusicMiningLine, kind: MusicLyricsKind): ReactElement => (
    <button
      type="button"
      className="music-line-mine"
      // The lyrics pane turns a mouse-up into a dictionary lookup; without this a click on
      // the button would also open the popup over the card the user just made.
      onMouseUp={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={() => {
        state.noteLyricLineStudied(line.index);
        void mining.mine(line, kind, ps.time ?? 0);
      }}
      disabled={mining.outcome.kind === 'busy' || mining.outcome.kind === 'recording'}
      title={t('music.mineHint')}
      aria-label={t('music.mineHint')}
    >
      <Icon name="sparkle" size={12} />
      <span className="music-line-mine-label">{mineLabel(line.index)}</span>
    </button>
  );

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
      {/* Cue transport. Synced only — a plain sheet has nothing to seek to.

          Buttons rather than key bindings, and the reason has CHANGED. It used to be that
          the video overlay bound W/S/R on `document` without capture, so a second
          uncaptured set here would fire both. Slice 19 deleted that switch: the overlay
          registers the catalog's own `video.replayLine`/`prevLine`/`nextLine` ids now, and
          there is one dispatcher. The reason buttons are still right is a different one.
          `registerCommandHandler` keeps a STACK per id and `runCommand` takes
          `stack[stack.length - 1]` — the LAST registrant wins. A music surface registering
          those same ids would therefore silently take them away from the video overlay
          whenever it happened to mount later, which is mount-order-dependent ownership:
          exactly the invisible second owner slice 19 collapsed. Music keyboard nav needs
          its OWN catalog rows (`music.*`, rebindable, listed in Settings → Shortcuts), and
          that is a decision to take deliberately rather than smuggle in here. */}
      {lyrics.kind === 'synced' && studyCues.length > 0 && (
        <div className="music-cue-nav" role="group" aria-label={t('music.cueNav')}>
          {/* The three per-button classes carry no styling — `.music-cue-nav button` styles
              all of them. They exist so `music-mining-harness.mjs` can click a NAMED button
              instead of `querySelectorAll(...)[0]`, which would keep passing while pressing
              the wrong control if this row were ever reordered (RTL, or next-before-prev).
              `musicMining.test.ts` fails if the two files stop agreeing on the names. */}
          <button
            type="button"
            className="music-cue-prev"
            onClick={() => stepCue(-1)}
            title={t('music.prevLine')}
          >
            <Icon name="skip-back" size={13} />
            <span>{t('music.prevLine')}</span>
          </button>
          <button
            type="button"
            className="music-cue-replay"
            onClick={replayCue}
            disabled={activeIndex < 0}
            title={t('music.replayLine')}
          >
            <Icon name="refresh" size={13} />
            <span>{t('music.replayLine')}</span>
          </button>
          <button
            type="button"
            className="music-cue-next"
            onClick={() => stepCue(1)}
            title={t('music.nextLine')}
          >
            <span>{t('music.nextLine')}</span>
            <Icon name="skip-forward" size={13} />
          </button>
        </div>
      )}
      {ps.current && (lyrics.kind === 'synced' || lyrics.kind === 'plain') && (
        <MusicStudyBar
          cues={studyCues}
          trackKey={ps.current.id}
          seek={player.seek}
          mineDisabled={mining.outcome.kind === 'busy' || mining.outcome.kind === 'recording'}
          onMineCurrent={() => {
            // The line being sung now; nothing to mine between lines or on a plain sheet.
            if (lyrics.kind !== 'synced' || activeIndex < 0) return;
            const c = lyrics.cues[activeIndex];
            if (!c) return;
            state.noteLyricLineStudied(activeIndex);
            void mining.mine({ index: activeIndex, text: c.text, startSec: c.start, endSec: c.end }, 'synced', ps.time ?? 0);
          }}
        />
      )}
      {(lyrics.kind === 'synced' || lyrics.kind === 'plain') && lyrics.source && (
        <p className="muted music-lyrics-source">
          {t(`music.lyricsSource.${lyrics.source}`)}
          {' · '}
          <button type="button" className="music-lyrics-fix" onClick={() => void state.pickLrcFile()}>
            {t('music.lyricsCorrect')}
          </button>
        </p>
      )}
      {lyrics.kind === 'synced' &&
        lyrics.cues.map((c, i) => (
          <div
            key={i}
            ref={i === activeIndex ? state.activeLineRef : undefined}
            className={`music-line ${i === activeIndex ? 'active' : ''} ${i < activeIndex ? 'past' : ''}`}
            data-lyric-line={i}
            onDoubleClick={() => player.seek(c.start)}
            title={t('music.doubleClickJump')}
          >
            {lyricText(c.text)}
            {mineButton({ index: i, text: c.text, startSec: c.start, endSec: c.end }, 'synced')}
          </div>
        ))}
      {lyrics.kind === 'plain' && (
        <>
          <p className="muted music-plain-note">{t('music.notSynced')}</p>
          {lyrics.lines.map((l, i) => (
            <div key={i} className="music-line plain" data-lyric-line={i}>
              {lyricText(l)}
              {/* No timestamp exists for a plain line, so provenance records the listening
                  position instead — see shared/musicMining.ts. */}
              {mineButton({ index: i, text: l }, 'plain')}
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
    // `lq-hit-scope` raises the transport buttons to the 32px pointer floor via a
    // transparent `::after`, so it changes no pixel and no layout. Applied on the
    // shared component rather than only in Media Center because these are the same
    // six buttons in the widget and in Blanc, and a bigger target cannot regress a
    // host that has not been scored yet.
    <ContextualSurface className="music-controls lq-hit-scope">
      <button
        className={`btn small ${ps.shuffle ? 'primary' : ''}`}
        aria-pressed={ps.shuffle}
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
      {/* The transport's most important control had no accessible name in either
          host: an icon-only button with no title and no label announces as
          "button". Named from state, and the name is the one the widget uses. */}
      <button
        className="btn primary music-play"
        onClick={player.toggle}
        disabled={!ps.current}
        title={t(ps.playing ? 'music.controls.pause' : 'music.controls.play')}
        aria-label={t(ps.playing ? 'music.controls.pause' : 'music.controls.play')}
      >
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
        aria-pressed={ps.repeat !== 'off'}
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
        aria-label={t('a11y.slider.trackPosition')}
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
        aria-label={t('music.controls.volume')}
      />
      {onOpenWidget && (
        <button className="btn small" onClick={onOpenWidget} title={t('music.controls.openWidget')}>
          <Icon name="window" size={15} />
        </button>
      )}
    </ContextualSurface>
  );
}

/** Now-playing strip with album art (+ the AUD-DAT oscilloscope under Wired). */
export function MusicNowPlaying({ state }: { state: MusicState }) {
  const { ps, currentMeta, art } = state;
  const wired = useWiredMaterials();
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
      {wired && <WiredOscilloscope className="music-osc" />}
    </div>
  );
}

export { toggleUseAlbumInSearch };

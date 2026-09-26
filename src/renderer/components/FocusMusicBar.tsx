/**
 * Minimal music controls + song picker for Focus Mode.
 * No visualizer / full Music app chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import Icon from './Icons';
import * as player from '../playerBus';
import { guessSongMeta } from '../lyrics';
import { useT } from '../i18n';
import { songListWindow, SONG_ROW_HEIGHT } from './focusMusicWindow';

const AUDIO_EXT = /\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i;

function fmt(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function labelOf(item: MediaItem): { title: string; artist: string } {
  const meta = guessSongMeta(item);
  return {
    title: meta.title || item.title || item.fileName,
    artist: meta.artist || '',
  };
}

export default function FocusMusicBar() {
  const { t } = useT();
  const [s, setS] = useState(player.getState);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(320);

  useEffect(() => player.subscribe(setS), []);

  const loadLibrary = useCallback(async () => {
    try {
      const items = await window.api.listMedia();
      setLibrary(items.filter((it) => AUDIO_EXT.test(it.fileName)));
    } catch {
      setLibrary([]);
    }
  }, []);

  useEffect(() => {
    void loadLibrary();
    return window.api.onMediaChanged((items) => {
      setLibrary(items.filter((it) => AUDIO_EXT.test(it.fileName)));
    });
  }, [loadLibrary]);

  // Keep player queue in sync with library when empty or stale
  useEffect(() => {
    if (!library.length) return;
    const q = player.getState().queue;
    if (!q.length) player.setQueue(library);
  }, [library]);

  const songs = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = library.slice();
    list.sort(
      (a, b) => (b.lastPlayedAt ?? b.addedAt) - (a.lastPlayedAt ?? a.addedAt),
    );
    if (!q) return list;
    return list.filter((it) => {
      const { title, artist } = labelOf(it);
      return (
        title.toLowerCase().includes(q) ||
        artist.toLowerCase().includes(q) ||
        it.fileName.toLowerCase().includes(q)
      );
    });
  }, [library, query]);

  useEffect(() => {
    if (!pickerOpen) return;
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 40);
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [pickerOpen]);

  const playSong = async (item: MediaItem) => {
    setError('');
    setBusy(true);
    try {
      // Queue = full library so next/prev work
      player.setQueue(library.length ? library : [item]);
      const err = await player.playItem(item);
      if (err) setError(err);
      else setPickerOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const title = s.current
    ? labelOf(s.current).title
    : library.length
      ? t('focusMusic.chooseSong')
      : t('focusMusic.noSongs');
  const artist = s.current ? labelOf(s.current).artist : '';
  const win = songListWindow(songs.length, scrollTop, viewHeight);

  return (
    <div className="focus-music-bar" ref={rootRef}>
      <button
        type="button"
        className="btn small focus-music-btn"
        disabled={(!s.queue.length && !s.current) || busy}
        onClick={() => player.prev()}
        aria-label={t('focusMusic.prev')}
      >
        <Icon name="skip-back" size={14} />
      </button>
      <button
        type="button"
        className="btn small focus-music-btn"
        disabled={(!s.current && !library.length) || busy}
        onClick={() => {
          if (!s.current && library[0]) void playSong(library[0]);
          else player.toggle();
        }}
        aria-label={s.playing ? t('focusMusic.pause') : t('focusMusic.play')}
      >
        <Icon name={s.playing ? 'pause' : 'player'} size={14} />
      </button>
      <button
        type="button"
        className="btn small focus-music-btn"
        disabled={(!s.queue.length && !s.current) || busy}
        onClick={() => player.next()}
        aria-label={t('focusMusic.next')}
      >
        <Icon name="skip-forward" size={14} />
      </button>
      <button
        type="button"
        className={`btn small focus-music-btn focus-music-mix${s.shuffle ? ' active' : ''}`}
        disabled={(!s.queue.length && !s.current) || busy}
        onClick={() => player.toggleShuffle()}
        aria-pressed={s.shuffle}
        aria-label={s.shuffle ? t('focusMusic.mixOn') : t('focusMusic.mixOff')}
        title={s.shuffle ? t('focusMusic.mixOn') : t('focusMusic.mixOff')}
      >
        <Icon name="shuffle" size={14} />
      </button>

      <button
        type="button"
        className="focus-music-now"
        onClick={() => {
          setPickerOpen((o) => !o);
          void loadLibrary();
        }}
        title={s.current ? `${title}${artist ? ` — ${artist}` : ''}` : t('focusMusic.selectSong')}
        aria-expanded={pickerOpen}
        aria-haspopup="listbox"
      >
        <span className="focus-music-title">{title}</span>
        {artist ? <span className="focus-music-artist muted">{artist}</span> : null}
        {s.current ? (
          <span className="focus-music-time muted">
            {fmt(s.time)} / {fmt(s.duration)}
          </span>
        ) : (
          <span className="focus-music-artist muted">
            {library.length ? t('focusMusic.trackCount', { count: library.length }) : t('focusMusic.importHint')}
          </span>
        )}
      </button>

      <label className="focus-music-vol">
        <Icon name="volume" size={13} />
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={s.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          aria-label={t('focusMusic.volume')}
        />
        <span className="focus-music-vol-value">{Math.round(s.volume * 100)}</span>
      </label>

      {pickerOpen && (
        <div className="focus-music-picker">
          <div className="focus-music-picker-head">
            <input
              ref={searchRef}
              type="search"
              className="focus-music-search"
              placeholder={t('focusMusic.searchPlaceholder')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setScrollTop(0);
                if (listRef.current) listRef.current.scrollTop = 0;
              }}
              aria-label={t('focusMusic.searchAria')}
            />
            <button
              type="button"
              className="btn small"
              onClick={() => setPickerOpen(false)}
              aria-label={t('focusMusic.closeList')}
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          {/* Only the rows in view are mounted: a library of thousands of songs
              used to render every one of them each time the list opened. */}
          <div
            className="focus-music-list"
            role="listbox"
            aria-label={t('focusMusic.songList')}
            ref={(el) => {
              listRef.current = el;
              if (el && el.clientHeight && el.clientHeight !== viewHeight) setViewHeight(el.clientHeight);
            }}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
          >
            {!songs.length && (
              <p className="focus-music-empty muted">
                {library.length ? t('focusMusic.noMatches') : t('focusMusic.emptyLibrary')}
              </p>
            )}
            {songs.length > 0 && (
              <div style={{ height: songs.length * SONG_ROW_HEIGHT, position: 'relative' }}>
                {songs.slice(win.start, win.end).map((item, i) => {
                  const { title: rowTitle, artist: rowArtist } = labelOf(item);
                  const active = s.current?.id === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      aria-setsize={songs.length}
                      aria-posinset={win.start + i + 1}
                      className={`focus-music-row${active ? ' active' : ''}`}
                      style={{ position: 'absolute', top: (win.start + i) * SONG_ROW_HEIGHT, height: SONG_ROW_HEIGHT }}
                      disabled={busy}
                      onClick={() => void playSong(item)}
                    >
                      <span className="focus-music-row-title">{rowTitle}</span>
                      {rowArtist ? <span className="focus-music-row-artist muted">{rowArtist}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {error ? (
            <p className="focus-music-error focus-music-error--inline" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
      {/* Errors show whether or not the list is open (Play with the list closed
          used to fail silently). */}
      {error && !pickerOpen ? (
        <p className="focus-music-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Minimal music controls + song picker for Focus Mode.
 * No visualizer / full Music app chrome.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../shared/types';
import Icon from './Icons';
import * as player from '../playerBus';
import { guessSongMeta } from '../lyrics';

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
  const [s, setS] = useState(player.getState);
  const [library, setLibrary] = useState<MediaItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

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
    let list = library.slice();
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
    const t = window.setTimeout(() => searchRef.current?.focus(), 40);
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setPickerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
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
      ? 'Choose a song'
      : 'No songs in library';
  const artist = s.current ? labelOf(s.current).artist : '';

  return (
    <div className="focus-music-bar" ref={rootRef}>
      <button
        type="button"
        className="btn small focus-music-btn"
        disabled={(!s.queue.length && !s.current) || busy}
        onClick={() => player.prev()}
        aria-label="Previous track"
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
        aria-label={s.playing ? 'Pause' : 'Play'}
      >
        <Icon name={s.playing ? 'pause' : 'player'} size={14} />
      </button>
      <button
        type="button"
        className="btn small focus-music-btn"
        disabled={(!s.queue.length && !s.current) || busy}
        onClick={() => player.next()}
        aria-label="Next track"
      >
        <Icon name="skip-forward" size={14} />
      </button>

      <button
        type="button"
        className="focus-music-now"
        onClick={() => {
          setPickerOpen((o) => !o);
          void loadLibrary();
        }}
        title={s.current ? `${title}${artist ? ` — ${artist}` : ''}` : 'Select a song'}
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
            {library.length ? `${library.length} tracks · click to pick` : 'Import audio in Music app'}
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
          aria-label="Volume"
        />
      </label>

      {pickerOpen && (
        <div className="focus-music-picker" role="listbox" aria-label="Song list">
          <div className="focus-music-picker-head">
            <input
              ref={searchRef}
              type="search"
              className="focus-music-search"
              placeholder="Search songs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search songs"
            />
            <button
              type="button"
              className="btn small"
              onClick={() => setPickerOpen(false)}
              aria-label="Close song list"
            >
              <Icon name="close" size={12} />
            </button>
          </div>
          <div className="focus-music-list">
            {!songs.length && (
              <p className="focus-music-empty muted">
                {library.length
                  ? 'No matches.'
                  : 'No audio in the media library yet. Open the Music app from the desktop (exit focus) and import files or a folder.'}
              </p>
            )}
            {songs.map((item) => {
              const { title: t, artist: a } = labelOf(item);
              const active = s.current?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  className={`focus-music-row${active ? ' active' : ''}`}
                  disabled={busy}
                  onClick={() => void playSong(item)}
                >
                  <span className="focus-music-row-title">{t}</span>
                  {a ? <span className="focus-music-row-artist muted">{a}</span> : null}
                </button>
              );
            })}
          </div>
          {error ? <p className="focus-music-error">{error}</p> : null}
        </div>
      )}
    </div>
  );
}

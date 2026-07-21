// Shared lyrics-loading + karaoke-index hook, used by both the Music app's
// full lyrics pane and the mini-player widget's compact two-line display.
// Both read/write the same localStorage cache (lyrics.ts), so whichever one
// mounts first pays the network lookup and the other gets it for free.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaItem } from '../shared/types';
import { parseSubtitles, type Cue } from './subtitles';
import { markWiredDiscovered } from './wiredDiscovery';
import {
  cachedLyrics,
  clearLyrics,
  fetchLyrics,
  guessSongMeta,
  hasFreshNoLyrics,
  markNoLyrics,
  saveLyrics,
  type LyricsResult,
} from './lyrics';
import { loadLyricsSettings, onLyricsSettingsChanged } from './lyricsSettings';

export type LyricsState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'missing'; error?: string }
  | { kind: 'synced'; cues: Cue[] }
  | { kind: 'plain'; lines: string[] };

export interface LiveLyrics {
  lyrics: LyricsState;
  /** Index of the currently-live cue when lyrics.kind === 'synced', else -1. */
  activeIndex: number;
  /** Force a fresh network lookup, bypassing the cache ("Search again"). */
  reload: () => void;
  /** Adopt lyrics text picked from a local .lrc file. */
  loadFromFile: (text: string) => void;
}

function toLyricsState(res: LyricsResult): LyricsState {
  if (res.lrc) {
    const cues = parseSubtitles(res.lrc);
    if (cues.length) return { kind: 'synced', cues };
  }
  const plain = res.plain ?? res.lrc ?? '';
  const lines = plain.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? { kind: 'plain', lines } : { kind: 'missing' };
}

export function useLiveLyrics(current: MediaItem | null, duration: number, time: number): LiveLyrics {
  const [lyrics, setLyrics] = useState<LyricsState>({ kind: 'none' });
  const [activeIndex, setActiveIndex] = useState(-1);
  const [useAlbumInSearch, setUseAlbumInSearch] = useState(() => loadLyricsSettings().useAlbumInSearch);
  const lyricsForRef = useRef<string | null>(null);

  const albumSettingInit = useRef(false);
  useEffect(() => onLyricsSettingsChanged((s) => setUseAlbumInSearch(s.useAlbumInSearch)), []);

  const load = useCallback(async (item: MediaItem, durationSec: number, force: boolean) => {
    if (force) clearLyrics(item.id);
    const cached = cachedLyrics(item.id);
    if (cached) {
      setLyrics(toLyricsState(cached));
      return;
    }
    if (!force && hasFreshNoLyrics(item.id)) {
      // Cached "nothing found" — don't hammer the API on every play.
      setLyrics({ kind: 'missing' });
      return;
    }
    setLyrics({ kind: 'loading' });
    try {
      const res = await fetchLyrics(guessSongMeta(item, useAlbumInSearch), durationSec);
      if (res) {
        saveLyrics(item.id, res);
        markWiredDiscovered();
        setLyrics(toLyricsState(res));
      } else {
        markNoLyrics(item.id);
        setLyrics({ kind: 'missing' });
      }
    } catch (err) {
      setLyrics({ kind: 'missing', error: err instanceof Error ? err.message : String(err) });
    }
  }, [useAlbumInSearch]);

  // Re-search the current song when album/folder lookup is toggled.
  useEffect(() => {
    if (!albumSettingInit.current) {
      albumSettingInit.current = true;
      return;
    }
    if (!current || duration <= 0) return;
    lyricsForRef.current = null;
    setActiveIndex(-1);
    void load(current, duration, true);
  }, [useAlbumInSearch]);

  // Load lyrics when the current song (and its duration) becomes known.
  useEffect(() => {
    if (!current || duration <= 0) return;
    if (lyricsForRef.current === current.id) return;
    lyricsForRef.current = current.id;
    setActiveIndex(-1);
    void load(current, duration, false);
  }, [current, current?.id, duration, load]);

  // Karaoke: which line is live?
  useEffect(() => {
    if (lyrics.kind !== 'synced') {
      setActiveIndex(-1);
      return;
    }
    const cues = lyrics.cues;
    let idx = -1;
    for (let i = 0; i < cues.length; i++) {
      if (cues[i].start <= time) idx = i;
      else break;
    }
    setActiveIndex(idx);
  }, [time, lyrics]);

  const reload = useCallback(() => {
    if (current) void load(current, duration, true);
  }, [current, duration, load]);

  const loadFromFile = useCallback(
    (text: string) => {
      if (!current) return;
      const res: LyricsResult = { lrc: text, source: 'file' };
      saveLyrics(current.id, res);
      markWiredDiscovered();
      setLyrics(toLyricsState(res));
    },
    [current],
  );

  return { lyrics, activeIndex, reload, loadFromFile };
}

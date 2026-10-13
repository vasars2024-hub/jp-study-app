// Shared lyrics-loading + karaoke-index hook, used by both the Music app's
// full lyrics pane and the mini-player widget's compact two-line display.
// Both read/write the same localStorage cache (lyrics.ts), so whichever one
// mounts first pays the network lookup and the other gets it for free.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../shared/types';
import { parseSubtitles, type Cue } from './subtitles';
import {
  attachLrcWords,
  lyricCompanions,
  lyricPositionAt,
  lyricWordAt,
  shiftWords,
  type LyricWord,
} from '../shared/lrcKaraoke';
import { shiftCues } from '../shared/subtitleSync';
import {
  LYRICS_OFFSET_STEP_MS,
  loadLyricsOffset,
  nudgeLyricsOffset,
  onLyricsOffsetChanged,
  saveLyricsOffset,
} from './lyricsOffset';
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

/**
 * Where a set of lyrics came from, carried so the UI can attribute them. `file` is a
 * .lrc the user picked; `sidecar` and `embedded` travel with the audio file itself
 * (see `shared/musicLocalLyrics.ts`).
 */
export type LyricsSource = 'lrclib' | 'file' | 'sidecar' | 'embedded' | 'folder';

export type LyricsState =
  | { kind: 'none' }
  | { kind: 'loading' }
  | { kind: 'missing'; error?: string }
  | {
    kind: 'synced';
    cues: Cue[];
    /** Enhanced-LRC word times per cue (null where a line has none); absent when no line has any. */
    words?: Array<LyricWord[] | null>;
    source?: LyricsSource;
  }
  | { kind: 'plain'; lines: string[]; source?: LyricsSource };

export interface LiveLyrics {
  /** The sheet, with this song's timing nudge already applied to every time. */
  lyrics: LyricsState;
  /**
   * The ANCHOR line: the last one that has started (synced only, else -1). It stays
   * on the line just sung through an instrumental break, so a view scrolled to it
   * holds still, and Replay / Mine act on what was just heard.
   */
  activeIndex: number;
  /** The line being sung right now (`start <= t < end`); -1 in a break. This is the one to light. */
  sungIndex: number;
  /** The word being sung in `sungIndex`, when that line has enhanced-LRC word times; else -1. */
  wordIndex: number;
  /** Per cue: the index of the line it translates (same time tag), or -1. */
  companions: number[];
  /** This song's saved timing nudge in ms (positive: lyrics later). */
  offsetMs: number;
  /** Nudge this song's lyrics by `deltaMs` (±100 ms per press), saved per song. */
  nudgeOffset: (deltaMs: number) => void;
  resetOffset: () => void;
  /** Force a fresh network lookup, bypassing the cache ("Search again"). */
  reload: () => void;
  /** Adopt lyrics text picked from a local .lrc file. */
  loadFromFile: (text: string) => void;
}

export function toLyricsState(res: { lrc?: string; plain?: string; source?: LyricsSource }): LyricsState {
  const source = res.source;
  if (res.lrc) {
    const cues = parseSubtitles(res.lrc);
    if (cues.length) {
      const words = attachLrcWords(cues, res.lrc);
      return words.some(Boolean) ? { kind: 'synced', cues, words, source } : { kind: 'synced', cues, source };
    }
  }
  const plain = res.plain ?? res.lrc ?? '';
  // Stray LRC header tags ([ar:…], [ti:…]) are metadata, not lyrics lines.
  const lines = plain
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[a-z]+:[^\]]*\]$/i.test(l));
  return lines.length ? { kind: 'plain', lines, source } : { kind: 'missing' };
}

/**
 * Lyrics stored with the audio file (a sidecar .lrc, or embedded tags), or null. Never
 * throws: a host without the IPC (an older preload, a test) simply has none.
 */
export async function readLocalLyrics(id: string): Promise<LyricsState | null> {
  try {
    const local = await window.api.musicLocalLyrics?.(id);
    if (!local || !local.text) return null;
    const state = toLyricsState({ lrc: local.text, source: local.source });
    return state.kind === 'missing' ? null : state;
  } catch {
    return null;
  }
}

/**
 * In-flight network lookups, one per song and search mode, shared by every
 * mounted consumer: the Music app, the mini-player and both finding overlays
 * all run this hook for the same song, and each used to send its own request.
 */
const lookups = new Map<string, Promise<LyricsResult | null>>();

/**
 * Look a song up on the network (or join the lookup already running for it) and
 * write the outcome to the shared cache. A .lrc the user picked while the lookup
 * was out wins: the network answer neither overwrites it nor is shown.
 */
function lookUpLyrics(item: MediaItem, useAlbumInSearch: boolean, durationSec: number): Promise<LyricsResult | null> {
  const key = `${item.id}|${useAlbumInSearch ? 'album' : 'plain'}`;
  const running = lookups.get(key);
  if (running) return running;
  const lookup = fetchLyrics(guessSongMeta(item, useAlbumInSearch), durationSec)
    .then((res) => {
      const picked = cachedLyrics(item.id);
      if (picked?.source === 'file') return picked;
      if (res) {
        saveLyrics(item.id, res);
        markWiredDiscovered();
      } else {
        markNoLyrics(item.id);
      }
      return res;
    })
    .finally(() => {
      lookups.delete(key);
    });
  lookups.set(key, lookup);
  return lookup;
}

/** Test seam: forget lookups still in flight. */
export function resetLyricsLookupsForTests(): void {
  lookups.clear();
}

const NO_COMPANIONS: number[] = [];

export function useLiveLyrics(current: MediaItem | null, duration: number, time: number): LiveLyrics {
  const [sheet, setLyrics] = useState<LyricsState>({ kind: 'none' });
  const [useAlbumInSearch, setUseAlbumInSearch] = useState(() => loadLyricsSettings().useAlbumInSearch);
  const lyricsForRef = useRef<string | null>(null);
  /**
   * Bug 22: bumped by every load, every song change and every picked file. A load
   * re-checks it after each await and drops its answer once it no longer
   * matches, so skipping during a lookup can never show the previous song's
   * lyrics (nor a slow lookup overwrite a file the user just picked).
   */
  const requestRef = useRef(0);

  const albumSettingInit = useRef(false);
  useEffect(() => onLyricsSettingsChanged((s) => setUseAlbumInSearch(s.useAlbumInSearch)), []);

  const load = useCallback(async (item: MediaItem, durationSec: number, force: boolean) => {
    const request = ++requestRef.current;
    const stale = (): boolean => request !== requestRef.current;
    if (force) clearLyrics(item.id);
    const cached = cachedLyrics(item.id);
    // A .lrc the user picked by hand is their correction and outranks everything.
    // Otherwise lyrics that ship with the file beat a guess from the network.
    if (cached?.source !== 'file') {
      const local = await readLocalLyrics(item.id);
      if (stale()) return;
      if (local) {
        setLyrics(local);
        return;
      }
    }
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
      const res = await lookUpLyrics(item, useAlbumInSearch, durationSec);
      if (stale()) return;
      setLyrics(res ? toLyricsState(res) : { kind: 'missing' });
    } catch (err) {
      if (stale()) return;
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
    // Marked as this song's load, so the effect below does not start a second one.
    lyricsForRef.current = current.id;
    void load(current, duration, true);
  }, [useAlbumInSearch]);

  // A different song (or none): whatever is loading belongs to the old one.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (lyricsForRef.current === currentId) return;
    requestRef.current += 1;
    lyricsForRef.current = null;
    // Until the new song's duration is known its lookup cannot start; the old
    // song's lines must not stay up (and karaoke along) in the meantime.
    setLyrics(currentId ? { kind: 'loading' } : { kind: 'none' });
  }, [currentId]);

  // Load lyrics when the current song (and its duration) becomes known.
  useEffect(() => {
    if (!current || duration <= 0) return;
    if (lyricsForRef.current === current.id) return;
    lyricsForRef.current = current.id;
    void load(current, duration, false);
  }, [current, current?.id, duration, load]);

  // This song's timing nudge, shared live with every other consumer of the hook.
  const [offset, setOffset] = useState(() => ({ id: currentId, ms: loadLyricsOffset(currentId) }));
  const offsetMs = offset.id === currentId ? offset.ms : loadLyricsOffset(currentId);
  useEffect(() => {
    setOffset({ id: currentId, ms: loadLyricsOffset(currentId) });
    return onLyricsOffsetChanged((id, ms) => {
      if (id === currentId) setOffset({ id, ms });
    });
  }, [currentId]);
  const nudgeOffset = useCallback((deltaMs: number) => {
    if (!currentId || !deltaMs) return;
    // One press is one step; a caller cannot jump the sheet by seconds at once.
    nudgeLyricsOffset(currentId, Math.sign(deltaMs) * Math.min(Math.abs(deltaMs), LYRICS_OFFSET_STEP_MS));
  }, [currentId]);
  const resetOffset = useCallback(() => {
    if (currentId) saveLyricsOffset(currentId, 0);
  }, [currentId]);

  // The nudge moves the sheet itself, so a seek, a loop, a replay and a mined clip
  // all land on the corrected times, not just the highlight.
  const lyrics = useMemo<LyricsState>(() => {
    if (sheet.kind !== 'synced' || !offsetMs) return sheet;
    const sec = offsetMs / 1000;
    return {
      ...sheet,
      cues: shiftCues(sheet.cues, sec),
      ...(sheet.words ? { words: shiftWords(sheet.words, sec) } : {}),
    };
  }, [sheet, offsetMs]);

  const companions = useMemo(
    () => (lyrics.kind === 'synced' ? lyricCompanions(lyrics.cues) : NO_COMPANIONS),
    [lyrics],
  );

  // Karaoke: a line is lit from its start to its END (a blank stamp, its closing
  // word time or the next tag), so an instrumental break lights nothing. It used to
  // be `start <= time` alone, which kept the last sung line lit through every break.
  // The anchor (the line just finished) is what views scroll to, so they hold still.
  const position = lyrics.kind === 'synced'
    ? lyricPositionAt(lyrics.cues, time, companions)
    : { sung: -1, anchor: -1 };
  const wordIndex = lyrics.kind === 'synced' && position.sung >= 0
    ? lyricWordAt(lyrics.words?.[position.sung], time)
    : -1;

  const reload = useCallback(() => {
    if (current) void load(current, duration, true);
  }, [current, duration, load]);

  const loadFromFile = useCallback(
    (text: string) => {
      if (!current) return;
      // The user's pick wins over a lookup still out for this song.
      requestRef.current += 1;
      const res: LyricsResult = { lrc: text, source: 'file' };
      saveLyrics(current.id, res);
      markWiredDiscovered();
      setLyrics(toLyricsState(res));
    },
    [current],
  );

  return {
    lyrics,
    activeIndex: position.anchor,
    sungIndex: position.sung,
    wordIndex,
    companions,
    offsetMs,
    nudgeOffset,
    resetOffset,
    reload,
    loadFromFile,
  };
}

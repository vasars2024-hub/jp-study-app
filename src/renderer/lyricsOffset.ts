/**
 * Per-song lyric timing nudge, in milliseconds. Positive shows the lyrics LATER.
 *
 * A sheet from LRCLIB or a tagger is often a few hundred ms off for one particular
 * rip of a song. The fix belongs to that song, survives restarts, and is shared by
 * every mounted lyrics consumer (the Music pane, the mini-player, the overlays), so
 * it lives in localStorage with a change signal rather than in component state.
 *
 * Kept under its own prefix: "Clear lyrics cache" (`clearAllLyrics`, prefix
 * `jp-lyrics-`) forgets downloaded sheets, not the user's own corrections.
 */

const PREFIX = 'jp-lyric-offset-ms:';
export const LYRICS_OFFSET_STEP_MS = 100;
export const LYRICS_OFFSET_LIMIT_MS = 10_000;

const listeners = new Set<(mediaId: string, ms: number) => void>();

function clamp(ms: number): number {
  if (!Number.isFinite(ms)) return 0;
  const rounded = Math.round(ms / 10) * 10;
  return Math.max(-LYRICS_OFFSET_LIMIT_MS, Math.min(LYRICS_OFFSET_LIMIT_MS, rounded));
}

export function loadLyricsOffset(mediaId: string | null | undefined): number {
  if (!mediaId) return 0;
  try {
    const raw = localStorage.getItem(PREFIX + mediaId);
    return raw === null ? 0 : clamp(Number(raw));
  } catch {
    return 0;
  }
}

export function saveLyricsOffset(mediaId: string, ms: number): number {
  const value = clamp(ms);
  try {
    if (value === 0) localStorage.removeItem(PREFIX + mediaId);
    else localStorage.setItem(PREFIX + mediaId, String(value));
  } catch {
    /* storage unavailable: the nudge still applies for this session */
  }
  for (const l of listeners) l(mediaId, value);
  return value;
}

export function nudgeLyricsOffset(mediaId: string, deltaMs: number): number {
  return saveLyricsOffset(mediaId, loadLyricsOffset(mediaId) + deltaMs);
}

export function onLyricsOffsetChanged(cb: (mediaId: string, ms: number) => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent): void => {
    if (e.key?.startsWith(PREFIX)) cb(e.key.slice(PREFIX.length), loadLyricsOffset(e.key.slice(PREFIX.length)));
  };
  // Another window (the detached mini-player) nudged the same song.
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/** "+0.3 s" / "−0.1 s" / "0.0 s" for the readout. */
export function formatLyricsOffset(ms: number): string {
  const s = Math.abs(ms) / 1000;
  const sign = ms > 0 ? '+' : ms < 0 ? '−' : '';
  return `${sign}${s.toFixed(1)} s`;
}

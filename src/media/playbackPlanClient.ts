/**
 * One `media:playbackPlan` per open, shared by everything that asks during it.
 *
 * The host wants the plan for the opening frame (title, poster) the instant a request lands;
 * the player slice wants the same plan a moment later to decide disk vs media server. One
 * IPC (and one library read and one probe in main) serves both: an in-flight or very recent
 * answer for the same path is handed out again.
 *
 * Kept free of React and of the adopted bundle: the host is in the Study OS boot graph.
 */
import type { PlaybackPlan } from '../shared/playbackPlan';

/** Long enough to cover one open; short enough that a moved file is noticed on the next. */
const FRESH_MS = 8000;

const recent = new Map<string, { at: number; plan: Promise<PlaybackPlan | null> }>();

export function playbackPathKey(filePath: string): string {
  return filePath.trim().replace(/\\/g, '/').toLowerCase();
}

export function getPlaybackPlan(filePath: string): Promise<PlaybackPlan | null> {
  const key = playbackPathKey(filePath);
  const now = Date.now();
  const hit = recent.get(key);
  if (hit && now - hit.at < FRESH_MS) return hit.plan;
  const ask = typeof window !== 'undefined' ? window.api?.mediaPlaybackPlan : undefined;
  const plan = typeof ask === 'function'
    ? ask(filePath).catch(() => null)
    : Promise.resolve(null);
  recent.set(key, { at: now, plan });
  // Never let the map grow past a handful of entries.
  if (recent.size > 16) {
    for (const [k, v] of recent) if (now - v.at >= FRESH_MS) recent.delete(k);
  }
  return plan;
}

/** Drop a cached answer (a retry must look at the disk again). */
export function forgetPlaybackPlan(filePath: string): void {
  recent.delete(playbackPathKey(filePath));
}

/** "Series · Episode 3", the library title, or the file name. */
export function playbackTitle(
  filePath: string,
  plan: PlaybackPlan | null,
  episodeLabel: (n: number) => string,
): string {
  const item = plan?.item;
  if (item) {
    const series = item.seriesTitle || item.title;
    if (series) return item.episode && item.episode > 0 ? `${series} · ${episodeLabel(item.episode)}` : series;
  }
  const base = filePath.slice(Math.max(filePath.lastIndexOf('\\'), filePath.lastIndexOf('/')) + 1);
  return base.replace(/\.[^.]+$/, '');
}

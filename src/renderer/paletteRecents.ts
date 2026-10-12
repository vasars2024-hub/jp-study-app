/**
 * kbd5 — what the command palette remembers: the rows a user picked, when, and
 * how often. Two uses:
 *
 *  - the empty palette opens on a "Recently used" group, so the second time a
 *    keyboard user wants the same thing it is one Enter away;
 *  - a typed query ranks a row the user has picked before a little higher, by
 *    frecency (count, decayed by age), so "op" settles on the "Open …" command
 *    they actually use rather than the alphabetically first one.
 *
 * Keyed by the palette's own row keys (`cmd-<id>`, `sec-<id>`, `set-<id>`, …),
 * never by label, so a language switch does not forget anything.
 */

import { writeLocalStorageJson } from './localStorageWrite';

export const PALETTE_RECENTS_KEY = 'jp-palette-recents-v1';
const MAX_ENTRIES = 40;
/** How many recent rows the empty palette shows. */
export const RECENT_SHOWN = 5;
/** Largest frecency lift, in fuzzy-score points (a tier is 100). */
export const MAX_RECENCY_BOOST = 140;
const HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PaletteRecent {
  key: string;
  at: number;
  count: number;
}

function isRecent(value: unknown): value is PaletteRecent {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PaletteRecent>;
  return typeof v.key === 'string' && typeof v.at === 'number' && Number.isFinite(v.at) && typeof v.count === 'number';
}

export function loadPaletteRecents(): PaletteRecent[] {
  try {
    const raw = localStorage.getItem(PALETTE_RECENTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isRecent).slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

/** Record a pick; the newest is first. */
export function recordPaletteUse(key: string, now: number = Date.now()): PaletteRecent[] {
  const list = loadPaletteRecents();
  const prev = list.find((r) => r.key === key);
  const next = [
    { key, at: now, count: Math.min(999, (prev?.count ?? 0) + 1) },
    ...list.filter((r) => r.key !== key),
  ].slice(0, MAX_ENTRIES);
  writeLocalStorageJson(PALETTE_RECENTS_KEY, next);
  return next;
}

export function clearPaletteRecents(): void {
  writeLocalStorageJson(PALETTE_RECENTS_KEY, []);
}

/**
 * Score lift for a row with this history: grows with use (log-shaped, so the
 * tenth pick matters less than the second) and halves every week of disuse.
 */
export function recencyBoost(recent: PaletteRecent | undefined, now: number = Date.now()): number {
  if (!recent) return 0;
  const age = Math.max(0, now - recent.at);
  const decay = Math.pow(0.5, age / HALF_LIFE_MS);
  const use = Math.min(1, Math.log2(1 + recent.count) / 4);
  return Math.round(MAX_RECENCY_BOOST * decay * (0.45 + 0.55 * use));
}

/** Rank `items` for `query`: fuzzy score plus frecency; ties keep input order. */
export function rankWithRecency<T extends { key: string }>(
  items: readonly T[],
  score: (item: T) => number | null,
  recents: readonly PaletteRecent[],
  now: number = Date.now(),
): T[] {
  const byKey = new Map(recents.map((r) => [r.key, r]));
  const scored: { item: T; score: number; index: number }[] = [];
  items.forEach((item, index) => {
    const s = score(item);
    if (s == null) return;
    scored.push({ item, score: s + recencyBoost(byKey.get(item.key), now), index });
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  return scored.map((s) => s.item);
}

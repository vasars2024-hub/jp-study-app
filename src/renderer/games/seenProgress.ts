// Which content items (words, kana, sentences) the player has actually met in
// each game at each level — the numerator of the per-game "you have gone
// through X% of this level's material" bar. Distinct from stats.ts (XP,
// badges, high scores): this measures coverage of material, not performance.

import type { LevelTier, StudyLang } from '../../shared/levelScale';
import { writeLocalStorageJson } from '../localStorageWrite';
import type { GameId } from './types';

const KEY = 'jp-game-arena-seen-v1';
export const SEEN_PROGRESS_EVENT = 'game-arena-seen-changed';

/** Per game+level cap so one enormous deck cannot bloat localStorage. */
const MAX_KEYS_PER_BUCKET = 4000;

type SeenMap = Record<string, string[]>;

/**
 * Japanese keeps the original bucket name so progress recorded before other
 * study languages existed still counts; Chinese and Russian get their own.
 */
function bucketKey(gameId: GameId, level: LevelTier, lang: StudyLang = 'ja'): string {
  return lang === 'ja' ? `${gameId}|${level}` : `${gameId}|${level}|${lang}`;
}

function load(): SeenMap {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as SeenMap) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function persist(map: SeenMap): void {
  // A full store only degrades the progress display; play is unaffected.
  writeLocalStorageJson(KEY, map);
  window.dispatchEvent(new CustomEvent(SEEN_PROGRESS_EVENT));
}

export function markItemSeen(gameId: GameId, level: LevelTier, itemKey: string, lang: StudyLang = 'ja'): void {
  if (!itemKey) return;
  const map = load();
  const key = bucketKey(gameId, level, lang);
  const bucket = map[key] ?? [];
  if (bucket.includes(itemKey)) return;
  map[key] = [...bucket, itemKey].slice(-MAX_KEYS_PER_BUCKET);
  persist(map);
}

export function seenCount(gameId: GameId, level: LevelTier, lang: StudyLang = 'ja'): number {
  return (load()[bucketKey(gameId, level, lang)] ?? []).length;
}

/** The items met so far, so a new session can prefer the ones not met yet. */
export function seenItems(gameId: GameId, level: LevelTier, lang: StudyLang = 'ja'): Set<string> {
  return new Set(load()[bucketKey(gameId, level, lang)] ?? []);
}

export interface SeenProgress {
  seen: number;
  total: number;
  pct: number;
}

/**
 * Coverage of a game's pool at a level. The pool can shrink after items were
 * seen (deck edited, kana scope narrowed), so `seen` is clamped to `total` —
 * a bar past 100% would read as a bug, not an achievement.
 */
export function seenProgress(
  gameId: GameId,
  level: LevelTier,
  poolSize: number,
  lang: StudyLang = 'ja',
): SeenProgress {
  const seen = Math.min(seenCount(gameId, level, lang), poolSize);
  return {
    seen,
    total: poolSize,
    pct: poolSize > 0 ? (seen / poolSize) * 100 : 0,
  };
}

export function onSeenProgressChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(SEEN_PROGRESS_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(SEEN_PROGRESS_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

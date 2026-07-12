import type {
  EnvironmentSettings,
  ResolvedWall,
  RotationRule,
  WallpaperItem,
  WallpaperPlaylist,
} from './types';
import { getTodayOccurrences } from '../calendar';
import { emitCompanionEvent } from './companionEvents';

function hourInRange(hour: number, from: number, to: number): boolean {
  if (from === to) return true;
  if (from < to) return hour >= from && hour < to;
  return hour >= from || hour < to;
}

function todayCategories(env: EnvironmentSettings): Set<string> {
  if (!env.calendarWallsEnabled) return new Set();
  try {
    const occ = getTodayOccurrences();
    return new Set(occ.map((o) => o.category).filter(Boolean));
  } catch {
    return new Set();
  }
}

function ruleMatches(rule: RotationRule, now: Date, env: EnvironmentSettings): boolean {
  if (rule.when.type === 'timeOfDay') {
    return hourInRange(now.getHours() + now.getMinutes() / 60, rule.when.fromHour, rule.when.toHour);
  }
  if (rule.when.type === 'calendarCategory') {
    if (!env.calendarWallsEnabled) return false;
    return todayCategories(env).has(rule.when.category);
  }
  return false;
}

export function getActivePlaylist(env: EnvironmentSettings): WallpaperPlaylist | null {
  return env.playlists.find((p) => p.id === env.activePlaylistId) ?? env.playlists[0] ?? null;
}

export function findItem(playlist: WallpaperPlaylist, itemId: string): WallpaperItem | null {
  return playlist.items.find((i) => i.id === itemId) ?? null;
}

/**
 * Pick the wallpaper item for `now` using calendar + time-of-day rules
 * (highest priority wins). Falls back to day-slice playlist pick.
 */
export function resolveWall(env: EnvironmentSettings, now: Date = new Date()): ResolvedWall | null {
  if (!env.enabled || !env.rotationEnabled) return null;
  const playlist = getActivePlaylist(env);
  if (!playlist || !playlist.items.length) return null;

  const matched = env.rules
    .filter((r) => ruleMatches(r, now, env))
    .sort((a, b) => b.priority - a.priority);

  for (const rule of matched) {
    const item = findItem(playlist, rule.itemId);
    if (item) {
      let reason = 'Rule match';
      if (rule.when.type === 'timeOfDay') {
        reason = `Time of day ${rule.when.fromHour}:00–${rule.when.toHour}:00`;
      } else if (rule.when.type === 'calendarCategory') {
        reason = `Calendar · ${rule.when.category}`;
      }
      return { item, playlist, reason };
    }
  }

  const mins = now.getHours() * 60 + now.getMinutes();
  const slot = Math.floor((mins / (24 * 60)) * playlist.items.length) % playlist.items.length;
  const item = playlist.items[slot];
  return { item, playlist, reason: 'Day cycle fallback' };
}

export function wallItemKey(item: WallpaperItem): string {
  return `${item.kind}:${item.ref}:${item.id}`;
}

let lastCalendarPulseKey = '';

/** Notify companions when today's calendar has study/exam energy (once per day+category). */
export function pulseCalendarCompanions(env: EnvironmentSettings): void {
  if (!env.enabled || !env.companionsEnabled || !env.calendarWallsEnabled) return;
  try {
    const cats = todayCategories(env);
    const now = new Date();
    const day = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    let note: string | null = null;
    if (cats.has('exam')) note = 'Exam day';
    else if (cats.has('study')) note = 'Study session on calendar';
    else if (cats.has('assignment')) note = 'Assignment due';
    if (!note) return;
    const key = `${day}:${note}`;
    if (key === lastCalendarPulseKey) return;
    lastCalendarPulseKey = key;
    emitCompanionEvent('calendar', note);
  } catch {
    /* ignore */
  }
}

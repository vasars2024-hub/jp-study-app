import type { SettingsPageId } from './types';

const KEY = 'jp-os-settings-recent-v1';
const MAX_PAGES = 8;
const MAX_QUERIES = 5;

interface RecentStore {
  pages: SettingsPageId[];
  queries: string[];
}

function load(): RecentStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { pages: [], queries: [] };
    const p = JSON.parse(raw) as Partial<RecentStore>;
    return {
      // Keep history reachable after Monitors merged into Display, without
      // showing the same destination twice or rewriting storage during a read.
      pages: Array.isArray(p.pages)
        ? [...new Set(p.pages.filter(Boolean).map((id) => id === 'monitors' ? 'display' : id))]
        : [],
      queries: Array.isArray(p.queries) ? p.queries.filter((q) => typeof q === 'string') : [],
    };
  } catch {
    return { pages: [], queries: [] };
  }
}

function save(s: RecentStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

export function getRecentPages(): SettingsPageId[] {
  return load().pages;
}

export function getRecentQueries(): string[] {
  return load().queries;
}

export function pushRecentPage(id: SettingsPageId): void {
  if (id === 'home') return;
  if (id === 'monitors') id = 'display';
  const s = load();
  s.pages = [id, ...s.pages.filter((p) => p !== id)].slice(0, MAX_PAGES);
  save(s);
}

/*
 * Recently changed settings (set2). Kept under its own key so the page/query
 * store above keeps its shape. One row per setting id, newest first; a burst of
 * changes to one slider is one row with the latest time.
 */
const CHANGES_KEY = 'jp-os-settings-changed-v1';
const MAX_CHANGES = 6;

export interface RecentSettingChange {
  id: string;
  at: number;
}

export function getRecentChanges(): RecentSettingChange[] {
  try {
    const raw = localStorage.getItem(CHANGES_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    return list
      .filter((row): row is RecentSettingChange =>
        !!row && typeof (row as RecentSettingChange).id === 'string' && typeof (row as RecentSettingChange).at === 'number')
      .slice(0, MAX_CHANGES);
  } catch {
    return [];
  }
}

export function pushRecentChange(id: string, at: number = Date.now()): void {
  const key = id.trim();
  if (!key) return;
  const next = [{ id: key, at }, ...getRecentChanges().filter((row) => row.id !== key)].slice(0, MAX_CHANGES);
  try {
    localStorage.setItem(CHANGES_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function clearRecentChanges(): void {
  try {
    localStorage.removeItem(CHANGES_KEY);
  } catch {
    /* ignore */
  }
}

export function pushRecentQuery(q: string): void {
  const t = q.trim();
  if (t.length < 2) return;
  const s = load();
  s.queries = [t, ...s.queries.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_QUERIES);
  save(s);
}

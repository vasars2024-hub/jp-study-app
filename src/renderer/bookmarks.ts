// Per-book bookmarks. The reader already auto-saves your last position (in
// library.json, so a book reopens where you left off); these are *explicit*
// marks you can name and jump back to. Hot path: localStorage; durable mirror: IDB.

import { IDB_KEYS, mirrorToIdb } from './storage/storage';
import { kvGet } from './storage/db';

export interface Bookmark {
  /** epub.js CFI — a precise pointer to a spot in the book. */
  cfi: string;
  /** A short human label (a snippet of the text, or a percentage). */
  label: string;
  /** 0..1 progress through the book, for sorting + display. */
  percent: number;
  createdAt: number;
}

const PREFIX = 'jp-bookmarks-';

function key(itemId: string): string {
  return `${PREFIX}${itemId}`;
}

export function collectAllBookmarksMap(): Record<string, Bookmark[]> {
  const out: Record<string, Bookmark[]> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(PREFIX)) continue;
      const id = k.slice(PREFIX.length);
      if (!id) continue;
      try {
        const list = JSON.parse(localStorage.getItem(k) ?? '[]') as Bookmark[];
        if (Array.isArray(list) && list.length) out[id] = list;
      } catch {
        /* skip */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

function mirrorAllBookmarks(): void {
  mirrorToIdb(IDB_KEYS.bookmarks, collectAllBookmarksMap());
}

export function loadBookmarks(itemId: string): Bookmark[] {
  try {
    const raw = localStorage.getItem(key(itemId));
    const arr = raw ? (JSON.parse(raw) as Bookmark[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function restoreBookmarksFromIdb(): Promise<void> {
  try {
    const map = await kvGet<Record<string, Bookmark[]>>(IDB_KEYS.bookmarks);
    if (!map || typeof map !== 'object') return;
    for (const [id, list] of Object.entries(map)) {
      if (!id || !Array.isArray(list) || !list.length) continue;
      try {
        if (!localStorage.getItem(key(id))) {
          localStorage.setItem(key(id), JSON.stringify(list));
        }
      } catch {
        /* quota */
      }
    }
  } catch {
    /* ignore */
  }
}

function save(itemId: string, list: Bookmark[]): void {
  try {
    if (list.length === 0) localStorage.removeItem(key(itemId));
    else localStorage.setItem(key(itemId), JSON.stringify(list));
  } catch {
    /* storage unavailable — bookmarks just won't persist */
  }
  mirrorAllBookmarks();
}

export function addBookmark(itemId: string, bm: Bookmark): Bookmark[] {
  const list = loadBookmarks(itemId);
  if (list.some((b) => b.cfi === bm.cfi)) return list; // already bookmarked
  const next = [...list, bm].sort((a, b) => a.percent - b.percent);
  save(itemId, next);
  return next;
}

export function removeBookmark(itemId: string, cfi: string): Bookmark[] {
  const next = loadBookmarks(itemId).filter((b) => b.cfi !== cfi);
  save(itemId, next);
  return next;
}

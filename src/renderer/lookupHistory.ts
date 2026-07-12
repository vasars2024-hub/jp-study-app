// Ring buffer of recent dictionary lookups for the Recent Lookups widget.

export interface LookupHistoryEntry {
  query: string;
  at: number;
}

const KEY = 'jp-lookup-history';
const MAX = 40;
export const LOOKUP_HISTORY_EVENT = 'lookup-history-changed';

export function loadLookupHistory(): LookupHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LookupHistoryEntry[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.query === 'string') : [];
  } catch {
    return [];
  }
}

function persist(list: LookupHistoryEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(LOOKUP_HISTORY_EVENT));
  } catch {
    /* tests */
  }
}

/** Record a lookup (dedupes consecutive identical queries). */
export function recordLookup(query: string): void {
  const q = query.trim().slice(0, 80);
  if (!q) return;
  const prev = loadLookupHistory();
  if (prev[0]?.query === q) {
    prev[0] = { query: q, at: Date.now() };
    persist(prev);
    return;
  }
  persist([{ query: q, at: Date.now() }, ...prev.filter((e) => e.query !== q)]);
}

export function clearLookupHistory(): void {
  persist([]);
}

export function onLookupHistoryChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(LOOKUP_HISTORY_EVENT, h);
  return () => window.removeEventListener(LOOKUP_HISTORY_EVENT, h);
}

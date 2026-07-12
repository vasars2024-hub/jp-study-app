// Per-word knowledge tracking (LingQ / Kalba style). Words are keyed by their
// LEMMA (dictionary form) so 食べた・食べません・食べる all count as one word.
// Levels: 0 = new/unknown (not stored), 1 = learning, 2 = familiar, 3 = known.
// Entries remember whether they were set manually — the Anki auto-sync never
// overwrites a manual choice.

export const WK_LEVELS = ['New', 'Learning', 'Familiar', 'Known'] as const;
export type WkLevel = 0 | 1 | 2 | 3;

interface Entry {
  l: WkLevel;
  /** 1 = set by hand (Anki sync must not touch it). */
  m?: 1;
}

const KEY = 'jp-word-knowledge';
const EVENT = 'word-knowledge-changed';

let cache: Record<string, Entry> | null = null;

function db(): Record<string, Entry> {
  if (!cache) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, Entry>;
    } catch {
      cache = {};
    }
  }
  return cache;
}

function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(db()));
  } catch {
    /* storage unavailable */
  }
}

function emit(words: string[]): void {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: words }));
}

// The native 'storage' event fires in *other* windows (e.g. a popped-out
// Dictionary or Reader) whenever this key changes here — but only if their
// in-memory `cache` gets thrown out first, otherwise they'd keep serving the
// stale copy forever. Registered at module load, so it always runs before any
// component's own onKnowledgeChanged listener (added later, in an effect).
window.addEventListener('storage', (e) => {
  if (e.key === null || e.key === KEY) cache = null;
});

export function getLevel(word: string): WkLevel {
  return db()[word]?.l ?? 0;
}

export function setLevel(word: string, level: WkLevel, manual = true): void {
  if (!word) return;
  const d = db();
  if (level === 0 && manual) delete d[word];
  else d[word] = { l: level, ...(manual ? { m: 1 as const } : {}) };
  persist();
  emit([word]);
}

export function cycleLevel(word: string): WkLevel {
  const next = ((getLevel(word) + 1) % 4) as WkLevel;
  setLevel(word, next, true);
  return next;
}

/**
 * Bulk update from an Anki sync: `levels` maps word → inferred level. Words the
 * user set manually are skipped. Returns how many entries changed.
 */
export function bulkSetFromAnki(levels: Record<string, WkLevel>): number {
  const d = db();
  let changed = 0;
  const touched: string[] = [];
  for (const [word, level] of Object.entries(levels)) {
    if (!word || d[word]?.m) continue;
    if (d[word]?.l === level) continue;
    if (level === 0) delete d[word];
    else d[word] = { l: level };
    changed += 1;
    touched.push(word);
  }
  if (changed) {
    persist();
    emit(touched);
  }
  return changed;
}

export function knowledgeCounts(): Record<WkLevel, number> {
  const out: Record<WkLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const e of Object.values(db())) out[e.l] += 1;
  return out;
}

/** Subscribe to knowledge changes, including from other windows (returns unsubscribe). */
export function onKnowledgeChanged(cb: (words: string[]) => void): () => void {
  const h = (e: Event): void => cb((e as CustomEvent<string[]>).detail ?? []);
  // Cross-window change: we don't know which words, so pass none — every
  // caller today just re-derives its view from the store, not from this list.
  const storageHandler = (e: Event): void => {
    const se = e as StorageEvent;
    if (se.key !== null && se.key !== KEY) return;
    cb([]);
  };
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener('storage', storageHandler);
  };
}

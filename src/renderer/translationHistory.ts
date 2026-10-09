/** Translation History store for GrammarX Translate + Notebook. */

import { writeLocalStorageJson } from './localStorageWrite';
import { capTranslationHistory, translationHistoryKey } from '../shared/translateWorkbench';

export type TranslationOrigin = 'app' | 'extension';

export interface TranslationHistoryEntry {
  id: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  resultText: string;
  ts: number;
  origin: TranslationOrigin;
  /** Kept at the top of the list and never evicted by the size cap. */
  pinned?: boolean;
  /** The engine that produced `resultText` (a `TranslateProviderId`). Absent on rows from before engines were selectable. */
  provider?: string;
}

/** Exported for the Files app's location column — see `lookupHistory.ts`. */
export const TRANSLATION_HISTORY_STORAGE_KEY = 'jp-grammarx-translation-history-v1';
const KEY = TRANSLATION_HISTORY_STORAGE_KEY;
const MAX = 200;
export const TRANSLATION_HISTORY_EVENT = 'translation-history-changed';

function newId(): string {
  return `tr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadTranslationHistory(): TranslationHistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as TranslationHistoryEntry[];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function persist(list: TranslationHistoryEntry[]): void {
  // The guarded writer: localStorage IS this store's home, so a refused write
  // (quota) has to be said rather than dropped in a `catch {}`.
  writeLocalStorageJson(KEY, capTranslationHistory(list, MAX));
  try {
    window.dispatchEvent(new CustomEvent(TRANSLATION_HISTORY_EVENT));
  } catch {
    /* tests */
  }
}

/**
 * Record a translation. Re-translating the same text in the same direction
 * replaces its row (moved to the top, pin kept) instead of stacking a copy per
 * run — a learner re-running one sentence ten times has one history row.
 */
export function appendTranslationHistory(
  entry: Omit<TranslationHistoryEntry, 'id' | 'ts'> & { ts?: number },
): TranslationHistoryEntry {
  const prev = loadTranslationHistory();
  const key = translationHistoryKey(entry);
  const same = prev.find((e) => translationHistoryKey(e) === key);
  const full: TranslationHistoryEntry = {
    id: same?.id ?? newId(),
    ts: entry.ts ?? Date.now(),
    sourceLang: entry.sourceLang,
    targetLang: entry.targetLang,
    sourceText: entry.sourceText.slice(0, 8000),
    resultText: entry.resultText.slice(0, 8000),
    origin: entry.origin,
    ...(same?.pinned || entry.pinned ? { pinned: true } : {}),
    ...(typeof entry.provider === 'string' && entry.provider ? { provider: entry.provider.slice(0, 40) } : {}),
  };
  persist([full, ...prev.filter((e) => e !== same)]);
  return full;
}

/** Pin or unpin one row. Returns the new pinned state, or null when the row is gone. */
export function togglePinTranslationHistory(id: string): boolean | null {
  const list = loadTranslationHistory();
  const row = list.find((e) => e.id === id);
  if (!row) return null;
  const pinned = !row.pinned;
  persist(list.map((e) => {
    if (e.id !== id) return e;
    const next: TranslationHistoryEntry = { ...e };
    if (pinned) next.pinned = true;
    else delete next.pinned;
    return next;
  }));
  return pinned;
}

export function removeTranslationHistory(id: string): void {
  persist(loadTranslationHistory().filter((e) => e.id !== id));
}

/** Clears the history. Pinned rows are kept unless `includePinned`. */
export function clearTranslationHistory(includePinned = false): void {
  persist(includePinned ? [] : loadTranslationHistory().filter((e) => e.pinned));
}

export function onTranslationHistoryChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(TRANSLATION_HISTORY_EVENT, h);
  return () => window.removeEventListener(TRANSLATION_HISTORY_EVENT, h);
}

/** Translation History store for GrammarX Translate + Notebook. */

export type TranslationOrigin = 'app' | 'extension';

export interface TranslationHistoryEntry {
  id: string;
  sourceLang: string;
  targetLang: string;
  sourceText: string;
  resultText: string;
  ts: number;
  origin: TranslationOrigin;
}

const KEY = 'jp-grammarx-translation-history-v1';
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
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(TRANSLATION_HISTORY_EVENT));
  } catch {
    /* tests */
  }
}

export function appendTranslationHistory(
  entry: Omit<TranslationHistoryEntry, 'id' | 'ts'> & { ts?: number },
): TranslationHistoryEntry {
  const full: TranslationHistoryEntry = {
    id: newId(),
    ts: entry.ts ?? Date.now(),
    sourceLang: entry.sourceLang,
    targetLang: entry.targetLang,
    sourceText: entry.sourceText.slice(0, 8000),
    resultText: entry.resultText.slice(0, 8000),
    origin: entry.origin,
  };
  const prev = loadTranslationHistory();
  persist([full, ...prev]);
  return full;
}

export function removeTranslationHistory(id: string): void {
  persist(loadTranslationHistory().filter((e) => e.id !== id));
}

export function clearTranslationHistory(): void {
  persist([]);
}

export function onTranslationHistoryChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(TRANSLATION_HISTORY_EVENT, h);
  return () => window.removeEventListener(TRANSLATION_HISTORY_EVENT, h);
}

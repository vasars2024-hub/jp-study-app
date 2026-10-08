/**
 * Blanc's Capture inbox: one hotkey drops the selection (or the clipboard)
 * into a list, and the list is triaged later, keyboard-first — `a` adds a card
 * through the normal mining path, `x` discards, `e` edits. Mining without
 * opening a tool, and without breaking whatever you were reading.
 *
 * The reducer and the word/sentence detector are pure (blancCaptureInbox.test.ts).
 * The store persists through the guarded writer; it is the inbox's only home.
 */
import { writeLocalStorageJson } from '../../localStorageWrite';

export type CaptureKind = 'word' | 'sentence';
export type CaptureOrigin = 'selection' | 'clipboard' | 'typed';

export interface CaptureItem {
  id: string;
  text: string;
  kind: CaptureKind;
  reading?: string;
  meaning?: string;
  /** Set once a lookup was attempted (found or not), so it is not repeated. */
  lookedUp?: boolean;
  origin: CaptureOrigin;
  capturedAt: number;
}

export const CAPTURE_INBOX_MAX = 200;
export const CAPTURE_TEXT_MAX = 2000;

/**
 * Word or sentence. A word is short, single-token text with no sentence
 * punctuation — the same shape `reviewKnowledgeWord` accepts as one lemma, so
 * what the inbox calls a word is what the deck will treat as one.
 */
export function detectCaptureKind(text: string): CaptureKind {
  const value = text.trim();
  if (!value) return 'word';
  if (value.length > 16) return 'sentence';
  if (/[\s\u3000。．.、，,！？!?「」『』()（）:：;；]/u.test(value)) return 'sentence';
  return 'word';
}

/** Collapse whitespace; captures are text, not layout. */
export function normalizeCaptureText(text: string): string {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t\u3000]+/g, ' ').replace(/\n{2,}/g, '\n').trim().slice(0, CAPTURE_TEXT_MAX);
}

function sameText(a: string, b: string): boolean {
  return a.normalize('NFKC').toLowerCase() === b.normalize('NFKC').toLowerCase();
}

export type CaptureAction =
  | { type: 'add'; id: string; text: string; origin: CaptureOrigin; at: number }
  | { type: 'remove'; id: string }
  | { type: 'update'; id: string; patch: Partial<Pick<CaptureItem, 'text' | 'reading' | 'meaning' | 'lookedUp' | 'kind'>> }
  | { type: 'clear' };

/**
 * The inbox after one action. Newest first. Capturing text already in the
 * inbox moves it to the top instead of adding a duplicate; editing the text
 * re-detects word/sentence and forgets a lookup made for the old text.
 */
export function captureInboxReducer(items: readonly CaptureItem[], action: CaptureAction): CaptureItem[] {
  switch (action.type) {
    case 'add': {
      const text = normalizeCaptureText(action.text);
      if (!text) return [...items];
      const existing = items.find((item) => sameText(item.text, text));
      if (existing) {
        return [{ ...existing, capturedAt: action.at }, ...items.filter((item) => item !== existing)];
      }
      const item: CaptureItem = {
        id: action.id,
        text,
        kind: detectCaptureKind(text),
        origin: action.origin,
        capturedAt: action.at,
      };
      return [item, ...items].slice(0, CAPTURE_INBOX_MAX);
    }
    case 'remove':
      return items.filter((item) => item.id !== action.id);
    case 'update':
      return items.map((item) => {
        if (item.id !== action.id) return item;
        const next: CaptureItem = { ...item, ...action.patch };
        if (action.patch.text !== undefined) {
          next.text = normalizeCaptureText(action.patch.text) || item.text;
          if (next.text !== item.text) {
            if (action.patch.kind === undefined) next.kind = detectCaptureKind(next.text);
            if (action.patch.lookedUp === undefined) next.lookedUp = false;
          }
        }
        return next;
      });
    case 'clear':
      return [];
    default:
      return [...items];
  }
}

/**
 * Where the selection lands after the selected item leaves the list: the item
 * that took its place, or the new last one; -1 for an empty list.
 */
export function nextCaptureIndex(length: number, removedIndex: number): number {
  if (length <= 0) return -1;
  return Math.min(Math.max(0, removedIndex), length - 1);
}

function isCaptureItem(value: unknown): value is CaptureItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<CaptureItem>;
  return typeof item.id === 'string' && typeof item.text === 'string' && item.text.length > 0
    && (item.kind === 'word' || item.kind === 'sentence')
    && typeof item.capturedAt === 'number';
}

// ---------------------------------------------------------------------------
// Store

const KEY = 'jp-study.blanc.captureInbox.v1';
type Listener = (items: readonly CaptureItem[]) => void;
const listeners = new Set<Listener>();
let cache: CaptureItem[] | null = null;
let seq = 0;

export function loadCaptureInbox(): readonly CaptureItem[] {
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown;
    cache = Array.isArray(parsed)
      ? parsed.filter(isCaptureItem).map((item): CaptureItem => ({
        ...item,
        reading: typeof item.reading === 'string' ? item.reading : undefined,
        meaning: typeof item.meaning === 'string' ? item.meaning : undefined,
        origin: item.origin === 'clipboard' || item.origin === 'typed' ? item.origin : 'selection',
      })).slice(0, CAPTURE_INBOX_MAX)
      : [];
  } catch {
    cache = [];
  }
  return cache ?? [];
}

export function dispatchCapture(action: CaptureAction): readonly CaptureItem[] {
  const next = captureInboxReducer(loadCaptureInbox(), action);
  cache = next;
  writeLocalStorageJson(KEY, next);
  for (const listener of listeners) listener(next);
  return next;
}

export function subscribeCaptureInbox(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Add text to the inbox. Returns the stored item, or null for empty text. */
export function captureText(text: string, origin: CaptureOrigin, now = Date.now()): CaptureItem | null {
  const normalized = normalizeCaptureText(text);
  if (!normalized) return null;
  seq += 1;
  const items = dispatchCapture({ type: 'add', id: `cap-${now.toString(36)}-${seq}`, text: normalized, origin, at: now });
  return items[0] ?? null;
}

/** Test seam. */
export function resetCaptureInboxForTests(): void {
  cache = null;
  listeners.clear();
  seq = 0;
}

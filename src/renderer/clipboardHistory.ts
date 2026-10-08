// Global clipboard history — a productivity utility independent of any single
// view. Records plain text, reader copies (word/sentence/paragraph),
// dictionary entries, and background clipboard monitoring. Same
// localStorage-cache + IndexedDB-mirror pattern as flashcardDeck.ts.

import { IDB_KEYS, LS_KEYS, mirrorToIdb } from './storage/storage';
import type { FlashcardSource } from './flashcardDeck';
import { mineToStudy, type MineToStudyInput } from './studyMining';
import { studyLangOfText } from '../shared/studyLang';
import { getStudyLang } from './studyEnvironment';

export type ClipboardEntryType =
  | 'text'
  | 'word'
  | 'sentence'
  | 'paragraph'
  | 'dictionary'
  | 'reader'
  | 'manual';

export interface ClipboardReaderMeta {
  book?: string;
  chapter?: string;
  /** Reading position at copy time, e.g. "42%". */
  position?: string;
  language?: string;
}

export interface ClipboardDictMeta {
  expression: string;
  reading?: string;
  meaning?: string;
}

export interface ClipboardEntry {
  id: string;
  type: ClipboardEntryType;
  text: string;
  createdAt: number;
  pinned?: boolean;
  favorite?: boolean;
  readerMeta?: ClipboardReaderMeta;
  dictMeta?: ClipboardDictMeta;
}

export interface ClipboardSettings {
  maxSize: number;
  dedupeConsecutive: boolean;
  clearOnExit: boolean;
  monitoringEnabled: boolean;
}

const KEY = LS_KEYS.clipboardHistory;
const SETTINGS_KEY = 'jp-clipboard-settings';
const EVENT = 'clipboard-history-changed';
const SETTINGS_EVENT = 'clipboard-settings-changed';

/** Bounds of the history size setting (the Settings box shows the same). */
export const CLIPBOARD_MAX_SIZE_MIN = 10;
export const CLIPBOARD_MAX_SIZE_MAX = 2000;

/**
 * A history size inside the bounds. The number box declared max=2000 but
 * nothing enforced it: typing 100000 stored 100000, and the unvirtualized list
 * then rendered every entry.
 */
export function clampClipboardMaxSize(value: unknown, fallback = 200): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(CLIPBOARD_MAX_SIZE_MAX, Math.max(CLIPBOARD_MAX_SIZE_MIN, Math.round(n)));
}

const DEFAULT_SETTINGS: ClipboardSettings = {
  maxSize: 200,
  dedupeConsecutive: true,
  clearOnExit: false,
  monitoringEnabled: true,
};

function newId(): string {
  return `cb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readList(): ClipboardEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as ClipboardEntry[]) : [];
    // Older histories grouped pins first. Recording/deduplication needs copy
    // order; the panel applies its own pinned-first display order.
    return Array.isArray(list)
      ? list.filter((e) => e && typeof e.id === 'string').sort((a, b) => b.createdAt - a.createdAt)
      : [];
  } catch {
    return [];
  }
}

function writeList(list: ClipboardEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* localStorage full — the IndexedDB mirror below still persists it */
  }
  mirrorToIdb(IDB_KEYS.clipboardHistory, list);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function loadClipboardHistory(): ClipboardEntry[] {
  return readList();
}

export function loadClipboardSettings(): ClipboardSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const stored = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<ClipboardSettings>) };
    return { ...stored, maxSize: clampClipboardMaxSize(stored.maxSize, DEFAULT_SETTINGS.maxSize) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveClipboardSettings(patch: Partial<ClipboardSettings>): ClipboardSettings {
  const previous = loadClipboardSettings();
  const merged = { ...previous, ...patch };
  const next = { ...merged, maxSize: clampClipboardMaxSize(merged.maxSize, DEFAULT_SETTINGS.maxSize) };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  // Bust monitor settings cache
  cachedMonitorEnabled = next.monitoringEnabled;
  cachedMonitorAt = Date.now();
  if (next.maxSize < previous.maxSize) {
    writeList(applyCap(readList(), next.maxSize));
  }
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT));
  return next;
}

export function onClipboardHistoryChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function onClipboardSettingsChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(SETTINGS_EVENT, h);
  return () => window.removeEventListener(SETTINGS_EVENT, h);
}

function applyCap(
  list: ClipboardEntry[],
  maxSize = loadClipboardSettings().maxSize,
  keepId?: string,
): ClipboardEntry[] {
  const pinned = list.filter((e) => e.pinned);
  let remaining = Math.max(0, maxSize - pinned.length);
  // `keepId` always survives and spends a slot first, so older copies make way for it.
  if (keepId && list.some((e) => e.id === keepId && !e.pinned)) remaining -= 1;
  return list.filter((e) => e.pinned || e.id === keepId || remaining-- > 0);
}

export interface RecordClipboardOptions {
  type?: ClipboardEntryType;
  readerMeta?: ClipboardReaderMeta;
  dictMeta?: ClipboardDictMeta;
}

/** Record a new clipboard entry. Returns null for empty text. */
export function recordClipboardEntry(text: string, opts: RecordClipboardOptions = {}): ClipboardEntry | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const settings = loadClipboardSettings();
  const list = readList();
  if (settings.dedupeConsecutive && list[0] && list[0].text === trimmed && list[0].type === (opts.type ?? 'manual')) {
    return list[0];
  }
  const entry: ClipboardEntry = {
    id: newId(),
    type: opts.type ?? 'manual',
    text: trimmed,
    createdAt: Date.now(),
    readerMeta: opts.readerMeta,
    dictMeta: opts.dictMeta,
  };
  writeList(applyCap([entry, ...list]));
  return entry;
}

export function recordDictionaryEntry(expression: string, reading?: string, meaning?: string): ClipboardEntry | null {
  const text = [expression, reading, meaning].filter(Boolean).join(' — ');
  return recordClipboardEntry(text, { type: 'dictionary', dictMeta: { expression, reading, meaning } });
}

export function recordReaderCopy(
  text: string,
  kind: 'word' | 'sentence' | 'paragraph',
  meta?: ClipboardReaderMeta,
): ClipboardEntry | null {
  return recordClipboardEntry(text, { type: kind, readerMeta: meta });
}

export function togglePin(id: string): ClipboardEntry[] {
  // Pins can exceed the cap. Once unpinned, an entry uses the same retention
  // budget as other copies, without waiting for another clipboard change — but the
  // entry just unpinned is never the one dropped: with more pins than the limit
  // there is no room at all, and unpinning would silently delete what was clicked.
  const list = applyCap(readList().map((e) => (e.id === id ? { ...e, pinned: !e.pinned } : e)), undefined, id);
  writeList(list);
  return list;
}

export function toggleFavorite(id: string): ClipboardEntry[] {
  const list = readList().map((e) => (e.id === id ? { ...e, favorite: !e.favorite } : e));
  writeList(list);
  return list;
}

export function deleteEntry(id: string): ClipboardEntry[] {
  const list = readList().filter((e) => e.id !== id);
  writeList(list);
  return list;
}

export function deleteEntries(ids: Set<string>): ClipboardEntry[] {
  const list = readList().filter((e) => !ids.has(e.id));
  writeList(list);
  return list;
}

/** Delete every unpinned entry (used by "Clear Unpinned Entries" and clear-on-exit). */
export function clearUnpinned(): ClipboardEntry[] {
  const list = readList().filter((e) => e.pinned);
  writeList(list);
  return list;
}

export function clearAll(): ClipboardEntry[] {
  writeList([]);
  return [];
}

/** Best-effort clear on quit, gated by settings.clearOnExit. */
export function clearOnExitIfConfigured(): void {
  if (loadClipboardSettings().clearOnExit) clearUnpinned();
}

/** Send clipboard entries into the existing Flashcard Collection (no duplicate storage). */
export function sendEntriesToFlashcards(entries: ClipboardEntry[], source: FlashcardSource = 'import'): void {
  // Fire and forget: the clipboard panel stays responsive. Each entry goes
  // through mineToStudy, so a copy sent twice finds its card instead of adding
  // another; mineToStudy also runs the user's auto-enrich preference.
  void (async () => {
    for (const input of clipboardStudyInputs(entries, source)) {
      await mineToStudy(input).catch(() => undefined);
    }
  })();
}

/** The study cards a set of clipboard entries becomes (one per entry). */
export function clipboardStudyInputs(entries: ClipboardEntry[], source: FlashcardSource = 'import'): MineToStudyInput[] {
  return entries.map((e) => {
    const word = e.dictMeta?.expression ?? e.text.slice(0, 120);
    // Plain clipboard copies also need their full text when the word preview
    // is shortened, otherwise sending a passage to the deck loses its ending.
    const sentence = e.type === 'sentence' || e.type === 'paragraph' || (!e.dictMeta && e.text.length > 120)
      ? e.text
      : undefined;
    return {
      word,
      reading: e.dictMeta?.reading ?? '',
      meaning: e.dictMeta?.meaning ?? '',
      sentence,
      source,
      ...(e.readerMeta?.book ? { sourceTitle: e.readerMeta.book } : {}),
      studyLang: studyLangOfText(`${word} ${sentence ?? ''}`, getStudyLang()),
      notify: false,
    };
  });
}

// ---------------------------------------------------------------------------
// Background clipboard monitoring — polls the system clipboard through the
// main process (navigator.clipboard.readText needs focus/permissions that a
// background poll can't reliably hold) and records changes as plain-text
// "manual" copies. Gated by settings.monitoringEnabled.
// Interval kept ≥4s and skipped while the user is dragging / tab is hidden —
// a 2s IPC+storage cycle was a major cause of periodic UI freezes.
// ---------------------------------------------------------------------------
let monitorId: number | null = null;
let lastSeen = '';
let monitorBusy = false;
let cachedMonitorEnabled: boolean | null = null;
let cachedMonitorAt = 0;

export function startClipboardMonitor(intervalMs = 4500): () => void {
  if (monitorId != null) return stopClipboardMonitor;
  const tick = async () => {
    if (document.hidden) return;
    if (document.documentElement.classList.contains('os-interacting')) return;
    if (monitorBusy) return;
    const now = Date.now();
    if (cachedMonitorEnabled == null || now - cachedMonitorAt > 5000) {
      cachedMonitorEnabled = loadClipboardSettings().monitoringEnabled;
      cachedMonitorAt = now;
    }
    if (!cachedMonitorEnabled) return;
    monitorBusy = true;
    try {
      const t = (await window.api.clipboardReadText()).trim();
      // The setting can change while IPC is pending. Recheck before retaining
      // either the entry or lastSeen, including changes made in another window.
      if (!loadClipboardSettings().monitoringEnabled) return;
      if (!t || t === lastSeen) return;
      lastSeen = t;
      recordClipboardEntry(t, { type: 'manual' });
    } catch {
      /* IPC unavailable */
    } finally {
      monitorBusy = false;
    }
  };
  void tick();
  monitorId = window.setInterval(tick, Math.max(4000, intervalMs));
  return stopClipboardMonitor;
}

export function stopClipboardMonitor(): void {
  if (monitorId != null) {
    window.clearInterval(monitorId);
    monitorId = null;
  }
}

export const CLIPBOARD_TYPE_LABELS: Record<ClipboardEntryType, string> = {
  text: 'Text',
  word: 'Word',
  sentence: 'Sentence',
  paragraph: 'Paragraph',
  dictionary: 'Dictionary',
  reader: 'Reader',
  manual: 'Manual Copy',
};

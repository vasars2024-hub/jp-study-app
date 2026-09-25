/**
 * Extension / OCR / audio notebook events (aggregate hub also reads other stores).
 */

export type NotebookStream =
  | 'saved-words'
  | 'lookups'
  | 'flashcards'
  | 'anki'
  | 'mining'
  | 'known'
  | 'translations'
  | 'plan'
  | 'highlights'
  | 'ocr'
  | 'audio'
  | 'clipboard'
  | 'extension'
  | 'media'
  /** Captured Windows Live Captions sessions, one entry per dated script. */
  | 'transcript';

export interface NotebookTimelineEntry {
  id: string;
  stream: NotebookStream;
  title: string;
  detail?: string;
  folder?: string;
  ts: number;
  origin?: 'app' | 'extension';
  /** Optional deep-link hint for UI (section / bookId / grammar id). */
  href?: string;
  meta?: Record<string, string | number | boolean | undefined>;
}

/**
 * Stable persistence key shared with the Files app migration.
 *
 * Notebook used to own this key privately. Exporting the existing key, rather
 * than teaching Files a second literal, keeps the migration pointed at the
 * store that current producers still write while the old route is being
 * absorbed.
 */
export const NOTEBOOK_TIMELINE_STORAGE_KEY = 'jp-grammarx-notebook-timeline-v1';
const MAX = 500;
export const NOTEBOOK_TIMELINE_EVENT = 'notebook-timeline-changed';

function newId(): string {
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Parse the persisted timeline without changing its legacy acceptance rule.
 *
 * Older Notebook builds only required a string id when reading. Keeping that
 * rule here is deliberate: tightening it during the Files migration could
 * make an existing note disappear before the migration can report its count.
 */
export function parseNotebookTimeline(raw: string | null): NotebookTimelineEntry[] {
  try {
    if (!raw) return [];
    const list = JSON.parse(raw) as NotebookTimelineEntry[];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

export function loadNotebookTimeline(): NotebookTimelineEntry[] {
  try {
    return parseNotebookTimeline(localStorage.getItem(NOTEBOOK_TIMELINE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(list: NotebookTimelineEntry[]): void {
  try {
    localStorage.setItem(NOTEBOOK_TIMELINE_STORAGE_KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(NOTEBOOK_TIMELINE_EVENT));
  } catch {
    /* tests */
  }
}

export function appendNotebookEvent(
  entry: Omit<NotebookTimelineEntry, 'id' | 'ts'> & { ts?: number; id?: string },
): NotebookTimelineEntry {
  const full: NotebookTimelineEntry = {
    id: entry.id ?? newId(),
    ts: entry.ts ?? Date.now(),
    stream: entry.stream,
    title: entry.title.slice(0, 200),
    detail: entry.detail?.slice(0, 4000),
    folder: entry.folder,
    origin: entry.origin,
    href: entry.href,
    meta: entry.meta,
  };
  persist([full, ...loadNotebookTimeline()]);
  return full;
}

export function onNotebookTimelineChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(NOTEBOOK_TIMELINE_EVENT, h);
  return () => window.removeEventListener(NOTEBOOK_TIMELINE_EVENT, h);
}

/** One timeline entry by id, or `null`. */
export function findNotebookEntry(id: string): NotebookTimelineEntry | null {
  return loadNotebookTimeline().find((e) => e.id === id) ?? null;
}

/**
 * Edit a saved note's title or body in place (the note viewer's Save). Same
 * limits `appendNotebookEvent` applies; `null` when the entry is gone.
 */
export function updateNotebookEntry(
  id: string,
  patch: Partial<Pick<NotebookTimelineEntry, 'title' | 'detail'>>,
): NotebookTimelineEntry | null {
  const list = loadNotebookTimeline();
  const at = list.findIndex((e) => e.id === id);
  if (at < 0) return null;
  const next: NotebookTimelineEntry = {
    ...list[at],
    ...(patch.title !== undefined ? { title: patch.title.slice(0, 200) } : {}),
    ...(patch.detail !== undefined ? { detail: patch.detail.slice(0, 4000) } : {}),
  };
  const updated = list.slice();
  updated[at] = next;
  persist(updated);
  return next;
}

/**
 * "Save as note" from the translation history: one note per translation.
 *
 * It used to append a fresh timeline row on every click — and every completed
 * translation had already appended one — so the same translation appeared two,
 * three, four times. The note is keyed by the history entry's id
 * (`meta.translationId`), a second click returns the note already saved, and
 * it carries both texts in full rather than the 120-character preview.
 */
export function saveTranslationNote(entry: {
  id: string;
  sourceText: string;
  resultText: string;
  origin?: 'app' | 'extension';
}): NotebookTimelineEntry {
  const existing = loadNotebookTimeline().find((e) => e.meta?.translationId === entry.id);
  if (existing) return existing;
  return appendNotebookEvent({
    stream: 'translations',
    title: entry.sourceText.slice(0, 80),
    detail: `${entry.sourceText}\n\n${entry.resultText}`,
    folder: 'Translations',
    origin: entry.origin,
    href: 'translate',
    meta: { translationId: entry.id },
  });
}

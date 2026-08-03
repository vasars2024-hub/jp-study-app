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

const KEY = 'jp-grammarx-notebook-timeline-v1';
const MAX = 500;
export const NOTEBOOK_TIMELINE_EVENT = 'notebook-timeline-changed';

function newId(): string {
  return `nb-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function loadNotebookTimeline(): NotebookTimelineEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as NotebookTimelineEntry[];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function persist(list: NotebookTimelineEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
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

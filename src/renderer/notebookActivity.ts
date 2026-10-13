/**
 * The Notebook's automatic activity log, and `appendNotebookEvent` — the part
 * of `notebookTimeline.ts` the startup path needs.
 *
 * The extension bridge (`studyBackgroundJobs.ts`) and the analysis actions log
 * events at boot. Most are automatic events, which go to the capped
 * localStorage list here; a note goes to the notes store through
 * `userNotesHandoff.ts`, journaled synchronously, with the store itself
 * (IndexedDB, merging, history: `userNotesStore.ts` + `shared/userNotes.ts`)
 * loaded on demand rather than in every window's boot graph.
 *
 * `notebookTimeline.ts` re-exports all of this and adds what needs the notes
 * store loaded (the merged reader, edits, the legacy migration); import from
 * there anywhere off the boot path.
 */
import { writeLocalStorage } from './localStorageWrite';
import { ACTIVITY_TIMELINE_CAP, isUserNoteEntry } from '../shared/userNoteKinds';
import { NOTEBOOK_TIMELINE_EVENT, handNoteToStore } from './userNotesHandoff';

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
  | 'transcript'
  /** Free-standing notes written in the Notes app or Blanc Quick Notes. */
  | 'notes';

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
 * absorbed. Since the notes fix it holds automatic events only (plus any old
 * note not yet moved out).
 */
export const NOTEBOOK_TIMELINE_STORAGE_KEY = 'jp-grammarx-notebook-timeline-v1';
const MAX = ACTIVITY_TIMELINE_CAP;
/** Automatic events keep the old limits (they are previews, not the learner's text). */
const EVENT_TITLE_MAX = 200;
const EVENT_DETAIL_MAX = 4000;

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

/** The automatic-event list as stored (and any old note not yet moved out of it). */
export function loadActivityTimeline(): NotebookTimelineEntry[] {
  try {
    return parseNotebookTimeline(localStorage.getItem(NOTEBOOK_TIMELINE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function dispatchChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(NOTEBOOK_TIMELINE_EVENT));
  } catch {
    /* tests */
  }
}

/**
 * Write the automatic-event list. The cap counts automatic events only: an
 * old note still in the list (not moved yet) is kept whatever its age.
 */
export function persistActivity(list: readonly NotebookTimelineEntry[]): void {
  const kept: NotebookTimelineEntry[] = [];
  let events = 0;
  for (const entry of list) {
    if (isUserNoteEntry(entry)) kept.push(entry);
    else if (events < MAX) {
      kept.push(entry);
      events += 1;
    }
  }
  writeLocalStorage(NOTEBOOK_TIMELINE_STORAGE_KEY, JSON.stringify(kept));
  dispatchChanged();
}

/**
 * Add an entry. A note (see `isUserNoteEntry`) goes to the notes store in
 * full — synchronously into its journal when the store has not loaded yet; an
 * automatic event goes to the capped activity list.
 */
export function appendNotebookEvent(
  entry: Omit<NotebookTimelineEntry, 'id' | 'ts'> & { ts?: number; id?: string },
): NotebookTimelineEntry {
  if (isUserNoteEntry(entry)) {
    return handNoteToStore({
      id: entry.id,
      stream: entry.stream,
      title: entry.title,
      detail: entry.detail,
      folder: entry.folder,
      origin: entry.origin,
      href: entry.href,
      meta: entry.meta,
      ts: entry.ts,
    }) as unknown as NotebookTimelineEntry;
  }
  const full: NotebookTimelineEntry = {
    id: entry.id ?? newId(),
    ts: entry.ts ?? Date.now(),
    stream: entry.stream,
    title: entry.title.slice(0, EVENT_TITLE_MAX),
    detail: entry.detail?.slice(0, EVENT_DETAIL_MAX),
    folder: entry.folder,
    origin: entry.origin,
    href: entry.href,
    meta: entry.meta,
  };
  persistActivity([full, ...loadActivityTimeline()]);
  return full;
}

/**
 * Every window used to load the notes store at boot and, right after, hydrate
 * it and move old notes out of the shared list (`startUserNotes`). It still
 * does, once the window is idle: the store drains anything left in its journal
 * into IndexedDB, and the migration keeps running on every start.
 */
function startNotesWhenIdle(): void {
  const start = (): void => {
    void import('./notebookTimeline').then(
      (timeline) => timeline.startUserNotes(),
      (err: unknown) => console.warn('[notes] the notes store did not load:', err instanceof Error ? err.message : String(err)),
    );
  };
  // Called as a method: a detached `requestIdleCallback` throws "Illegal invocation".
  const host = globalThis as { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (typeof host.requestIdleCallback === 'function') host.requestIdleCallback(start, { timeout: 5_000 });
  else setTimeout(start, 1_000);
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') startNotesWhenIdle();

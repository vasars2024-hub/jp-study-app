/**
 * The boot-time doorway into the notes store.
 *
 * `userNotesStore.ts` (with `shared/userNotes.ts` behind it, ~52 KB of source)
 * used to load in every window at startup, only because `appendNotebookEvent`
 * — reached at boot from the extension bridge and the analysis actions — may
 * have to save a note. It is now a dynamic import. This module is what boot
 * keeps: the store's event names and journal key, and the one write boot can
 * make before the store is there.
 *
 * Durability does not wait for the store. A note handed over before the store
 * has loaded is written synchronously to the store's own write-ahead journal
 * (`USER_NOTES_JOURNAL_KEY`, same format), which the store reads at module
 * load and drains into IndexedDB on hydrate, exactly as it does for a change
 * left in the journal by a window that closed mid-write. So a note survives
 * even if the store never loads in this session. The store is then imported
 * and adopts the note (memory, other windows, IndexedDB).
 *
 * Once the store module has been evaluated anywhere in the window it binds
 * itself here, and every later note goes straight to `createUserNote`, as before.
 */
import { writeLocalStorage } from './localStorageWrite';
import type { UserNote as SharedUserNote } from '../shared/userNotes';

/** Fired on any change to the merged timeline (notes or automatic events). */
export const NOTEBOOK_TIMELINE_EVENT = 'notebook-timeline-changed';
/** Fired on any change to the notes store (including the trash and save states). */
export const USER_NOTES_EVENT = 'user-notes-changed';
/** localStorage write-ahead journal: changes not yet confirmed by IndexedDB. */
export const USER_NOTES_JOURNAL_KEY = 'jp-user-notes-journal-v1';

/** A stored note, as the store keeps it (`changedAt` orders merges). */
export type HandedNote = SharedUserNote & { changedAt?: number };

/** What `appendNotebookEvent` hands over: the fields of a timeline row. */
export interface HandedNoteInput {
  id?: string;
  stream: string;
  title: string;
  detail?: string;
  folder?: string;
  origin?: 'app' | 'extension';
  href?: string;
  meta?: Record<string, string | number | boolean | undefined>;
  ts?: number;
}

/** The slice of the store this module calls. */
export interface UserNotesStoreLink {
  createUserNote(input: HandedNoteInput): HandedNote;
  adoptHandedNote(note: HandedNote, journaled: boolean): void;
}

let bound: UserNotesStoreLink | null = null;

/** Called by `userNotesStore.ts` when it loads. */
export function bindUserNotesStore(link: UserNotesStoreLink): void {
  bound = link;
}

/** The store, if it has loaded in this window. */
export function boundUserNotesStore(): UserNotesStoreLink | null {
  return bound;
}

/** Load the notes store (once). */
export function loadUserNotesStore(): Promise<UserNotesStoreLink> {
  return bound ? Promise.resolve(bound) : import('./userNotesStore').then((store) => bound ?? store);
}

let handSeq = 0;
function handedNoteId(): string {
  handSeq += 1;
  // `note-` like the store's own ids; `h` marks one created before the store loaded.
  return `note-${Date.now().toString(36)}-h${handSeq.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Add `note` to the store's journal (read-modify-write, as the store's own
 * `editJournal` does: another window may have written it). False when
 * localStorage refused.
 */
function journalNote(note: HandedNote): boolean {
  try {
    const raw = localStorage.getItem(USER_NOTES_JOURNAL_KEY);
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      // The store reads an unparsable journal as empty and overwrites it too.
      parsed = null;
    }
    const notes = isRecord(parsed) && isRecord(parsed.notes) ? parsed.notes : {};
    const purged = isRecord(parsed) && isRecord(parsed.purged) ? parsed.purged : {};
    notes[note.id] = note;
    delete purged[note.id];
    return writeLocalStorage(USER_NOTES_JOURNAL_KEY, JSON.stringify({ notes, purged }));
  } catch {
    return false;
  }
}

function emit(): void {
  try {
    window.dispatchEvent(new CustomEvent(USER_NOTES_EVENT));
    window.dispatchEvent(new CustomEvent(NOTEBOOK_TIMELINE_EVENT));
  } catch {
    /* no window (tests in node) */
  }
}

/**
 * Save a new note, synchronously durable. With the store loaded this is
 * `createUserNote`; before that, the note (built as `createUserNote` builds
 * one) goes to the journal now and to the store when it has loaded.
 *
 * An explicit `id` naming a note that only IndexedDB holds yet cannot be told
 * apart before the store loads: the journal copy is the newer change, as for
 * any journaled edit. (`createUserNote` would have kept the old text as a
 * version.) No caller passes an id.
 */
export function handNoteToStore(input: HandedNoteInput): HandedNote {
  if (bound) return bound.createUserNote(input);
  const at = Date.now();
  const note: HandedNote = {
    id: input.id ?? handedNoteId(),
    stream: input.stream,
    title: input.title ?? '',
    ts: input.ts ?? at,
    updatedAt: at,
    changedAt: at,
  };
  if (input.detail !== undefined) note.detail = input.detail;
  if (input.folder) note.folder = input.folder;
  if (input.href) note.href = input.href;
  if (input.origin) note.origin = input.origin;
  if (input.meta) note.meta = input.meta;
  const journaled = journalNote(note);
  emit();
  void loadUserNotesStore().then(
    (store) => store.adoptHandedNote(note, journaled),
    (err: unknown) =>
      console.warn(
        `[notes] the notes store did not load; ${journaled ? 'the note waits in the journal' : 'the note could not be saved'}:`,
        err instanceof Error ? err.message : String(err),
      ),
  );
  return note;
}

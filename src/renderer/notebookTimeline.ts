/**
 * The Notebook timeline: the automatic activity log (extension / OCR / audio /
 * translation events), merged on read with the learner's notes.
 *
 * Two stores since the notes fix (docs/SCORECARD.md bugs 5 and 6):
 *
 * - **Automatic events** stay in localStorage under
 *   `NOTEBOOK_TIMELINE_STORAGE_KEY`, capped at `ACTIVITY_TIMELINE_CAP` (500).
 *   The cap applies to automatic events only.
 * - **Notes** (anything `isUserNoteEntry` says the learner wrote or chose to
 *   keep) live in `userNotesStore.ts` (IndexedDB, no cap, no length limit).
 *   `appendNotebookEvent` routes a note there, so callers did not change.
 *
 * Notes still in the old shared list (written before this change) are moved
 * out by `migrateLegacyNotebookNotes`, which first copies the whole old list to
 * IndexedDB as a backup, is safe to run any number of times, and removes a note
 * from the old list only after IndexedDB holds it. Until then the old list
 * never caps a note away.
 *
 * The activity list and `appendNotebookEvent` live in `notebookActivity.ts`
 * (re-exported here), so the startup path that logs events does not load the
 * notes store; a note it saves is journaled and handed to the store once that
 * loads (`userNotesHandoff.ts`). Everything below needs the store loaded.
 */
import { idbWritesBlocked, kvGet, kvScanPrefix, kvSet } from './storage/db';
import { isUserNoteEntry, normalizeUserNote, type UserNote as SharedUserNote } from '../shared/userNotes';
import {
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  appendNotebookEvent,
  loadActivityTimeline,
  parseNotebookTimeline,
  persistActivity,
  type NotebookTimelineEntry,
} from './notebookActivity';
import {
  NOTEBOOK_TIMELINE_EVENT,
  USER_NOTE_KEY_PREFIX,
  USER_NOTES_META_PREFIX,
  adoptLegacyNotes,
  createUserNote,
  getUserNote,
  allUserNotes,
  restoreUserNote,
  trashUserNote,
  updateUserNote,
  whenUserNotesReady,
} from './userNotesStore';

export { NOTEBOOK_TIMELINE_EVENT };
export {
  NOTEBOOK_TIMELINE_STORAGE_KEY,
  appendNotebookEvent,
  loadActivityTimeline,
  parseNotebookTimeline,
  type NotebookStream,
  type NotebookTimelineEntry,
} from './notebookActivity';

/** IndexedDB key prefix of the verbatim copies of the old shared list, one per distinct content. */
export const NOTEBOOK_LEGACY_BACKUP_PREFIX = `${USER_NOTES_META_PREFIX}legacy-timeline:`;
/** IndexedDB key of the last migration's summary. */
export const NOTEBOOK_MIGRATION_MARK_KEY = `${USER_NOTES_META_PREFIX}timeline-migration`;

function tsOf(entry: { ts?: unknown }): number {
  return typeof entry.ts === 'number' && Number.isFinite(entry.ts) ? entry.ts : 0;
}

/**
 * Everything the Notebook shows: live notes and automatic events, newest
 * first. A note in the trash is left out; a row of the old list that the notes
 * store already holds (live or trashed) is not shown twice.
 */
export function loadNotebookTimeline(): NotebookTimelineEntry[] {
  const activity = loadActivityTimeline();
  const notes = allUserNotes() as unknown as NotebookTimelineEntry[];
  if (!notes.length) return activity.filter((e) => !getUserNote(e.id));
  const rest = activity.filter((e) => !getUserNote(e.id));
  return [...notes, ...rest].sort((a, b) => tsOf(b) - tsOf(a));
}

function asTimelineEntry(note: SharedUserNote): NotebookTimelineEntry {
  return note as unknown as NotebookTimelineEntry;
}

function noteFromLegacyRow(entry: NotebookTimelineEntry, now = Date.now()): SharedUserNote | null {
  const ts = tsOf(entry) || now;
  return normalizeUserNote({ ...entry, title: typeof entry.title === 'string' ? entry.title : '', ts, updatedAt: ts }, now);
}

/**
 * Remove one entry — the Files app's Delete on a note. A note goes to the
 * notes trash (restorable), never straight to nothing; an automatic event is
 * removed. Unknown ids change nothing.
 */
export function removeNotebookEntry(id: string): boolean {
  const list = loadActivityTimeline();
  const legacy = list.find((entry) => entry.id === id);
  let changed = false;
  if (getUserNote(id)) {
    changed = trashUserNote(id);
  } else if (legacy && isUserNoteEntry(legacy)) {
    // An old note not moved yet: move it now, straight into the trash.
    const note = noteFromLegacyRow(legacy);
    if (note) {
      createUserNote(note);
      changed = trashUserNote(note.id);
    }
  }
  if (legacy) {
    persistActivity(list.filter((entry) => entry.id !== id));
    changed = true;
  }
  return changed;
}

export function onNotebookTimelineChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(NOTEBOOK_TIMELINE_EVENT, h);
  return () => window.removeEventListener(NOTEBOOK_TIMELINE_EVENT, h);
}

/** One live entry by id (a note in the trash is not), or `null`. */
export function findNotebookEntry(id: string): NotebookTimelineEntry | null {
  const note = getUserNote(id);
  if (note) return note.deletedAt ? null : asTimelineEntry(note);
  return loadActivityTimeline().find((e) => e.id === id) ?? null;
}

/**
 * Edit a saved note's title or body in place (the note viewer's Save). Nothing
 * is shortened. Editing an automatic event makes it the learner's note: it
 * moves to the notes store, out of reach of the activity cap. `null` when the
 * entry is gone.
 */
export function updateNotebookEntry(
  id: string,
  patch: Partial<Pick<NotebookTimelineEntry, 'title' | 'detail'>>,
): NotebookTimelineEntry | null {
  const note = getUserNote(id);
  if (note) {
    if (note.deletedAt) return null;
    const next = updateUserNote(id, patch, { checkpoint: true });
    return next ? asTimelineEntry(next) : null;
  }
  const list = loadActivityTimeline();
  const entry = list.find((e) => e.id === id);
  if (!entry) return null;
  const base = noteFromLegacyRow(entry);
  if (!base) return null;
  const created = createUserNote({
    ...base,
    meta: { ...(base.meta ?? {}), userNote: true },
  });
  const next = updateUserNote(created.id, patch, { checkpoint: true }) ?? created;
  persistActivity(list.filter((e) => e.id !== id));
  return asTimelineEntry(next);
}

/**
 * "Save as note" from the translation history: one note per translation.
 *
 * It used to append a fresh timeline row on every click — and every completed
 * translation had already appended one — so the same translation appeared two,
 * three, four times. The note is keyed by the history entry's id
 * (`meta.translationId`), a second click returns the note already saved (from
 * the trash too, restored), and it carries both texts in full rather than the
 * 120-character preview.
 */
export function saveTranslationNote(entry: {
  id: string;
  sourceText: string;
  resultText: string;
  origin?: 'app' | 'extension';
}): NotebookTimelineEntry {
  const existing = allUserNotes({ includeTrashed: true }).find((e) => e.meta?.translationId === entry.id);
  if (existing) {
    if (existing.deletedAt) restoreUserNote(existing.id);
    return asTimelineEntry(getUserNote(existing.id) ?? existing);
  }
  const legacy = loadActivityTimeline().find((e) => e.meta?.translationId === entry.id);
  if (legacy) return legacy;
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

// ── migration out of the shared list ───────────────────────────────────────

/** FNV-1a over the text, with its length: names one distinct old list. */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}-${hash.toString(16)}`;
}

export interface NotebookMigrationResult {
  /** Notes found in the old shared list. */
  found: number;
  /** Notes now held by IndexedDB and removed from the old list. */
  moved: number;
  /** Where the verbatim copy of the old list is, or null when there was nothing to move. */
  backupKey: string | null;
  /** Why nothing moved, when something should have. The notes stay in the old list, uncapped. */
  skipped?: 'idb-unavailable' | 'backup-failed';
}

/**
 * Move the learner's notes out of the old shared list. Safe to run any number
 * of times, from any number of windows:
 *
 * 1. the old list is copied verbatim to IndexedDB (`NOTEBOOK_LEGACY_BACKUP_PREFIX`
 *    + a fingerprint of its text) and read back; no backup, no migration;
 * 2. every note in it (however many entries the list holds) is added to the
 *    notes store under its own id; a note already there keeps its content and
 *    gains the old text as a version if they differ;
 * 3. only the notes IndexedDB is confirmed to hold are removed from the old
 *    list, which is re-read right before that write.
 */
export async function migrateLegacyNotebookNotes(): Promise<NotebookMigrationResult> {
  await whenUserNotesReady();
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(NOTEBOOK_TIMELINE_STORAGE_KEY);
  } catch {
    return { found: 0, moved: 0, backupKey: null };
  }
  const legacyNotes = parseNotebookTimeline(raw).filter(isUserNoteEntry);
  if (!raw || !legacyNotes.length) return { found: 0, moved: 0, backupKey: null };
  let blocked: boolean;
  try {
    blocked = idbWritesBlocked();
  } catch {
    blocked = true;
  }
  // A restore in progress drops IndexedDB writes silently: nothing may move now.
  if (blocked) return { found: legacyNotes.length, moved: 0, backupKey: null, skipped: 'idb-unavailable' };

  const backupKey = NOTEBOOK_LEGACY_BACKUP_PREFIX + fingerprint(raw);
  try {
    const existing = await kvGet<{ raw?: string }>(backupKey);
    if (existing?.raw !== raw) {
      await kvSet(backupKey, { key: NOTEBOOK_TIMELINE_STORAGE_KEY, savedAt: Date.now(), entries: legacyNotes.length, raw });
      const check = await kvGet<{ raw?: string }>(backupKey);
      if (check?.raw !== raw) throw new Error('backup did not read back');
    }
  } catch {
    return { found: legacyNotes.length, moved: 0, backupKey: null, skipped: 'backup-failed' };
  }

  const now = Date.now();
  const notes = legacyNotes.map((entry) => noteFromLegacyRow(entry, now)).filter((n): n is SharedUserNote => n !== null);
  let durable: Set<string>;
  try {
    const adopted = await adoptLegacyNotes(notes);
    // Trust only what IndexedDB returns, not the write's own report.
    const stored = new Set((await kvScanPrefix(USER_NOTE_KEY_PREFIX)).map(([key]) => key.slice(USER_NOTE_KEY_PREFIX.length)));
    durable = new Set(adopted.filter((id) => stored.has(id) || !getUserNote(id)));
  } catch {
    return { found: legacyNotes.length, moved: 0, backupKey, skipped: 'idb-unavailable' };
  }
  if (durable.size) {
    const current = loadActivityTimeline();
    const next = current.filter((e) => !durable.has(e.id));
    if (next.length !== current.length) persistActivity(next);
  }
  try {
    await kvSet(NOTEBOOK_MIGRATION_MARK_KEY, { version: 1, at: now, found: legacyNotes.length, moved: durable.size, backupKey });
  } catch {
    /* the mark is informational */
  }
  return { found: legacyNotes.length, moved: durable.size, backupKey, skipped: durable.size < legacyNotes.length ? 'idb-unavailable' : undefined };
}

let started: Promise<void> | null = null;

/** Load the notes store and move old notes out of the shared list. Once per window. */
export function startUserNotes(): Promise<void> {
  if (!started) {
    started = whenUserNotesReady()
      .then(() => migrateLegacyNotebookNotes())
      .then(
        (result) => {
          if (result.moved) console.info(`[notes] moved ${result.moved} note(s) out of the activity timeline (backup: ${result.backupKey}).`);
        },
        (err: unknown) => console.warn('[notes] migration did not run:', err instanceof Error ? err.message : String(err)),
      );
  }
  return started;
}

/** Tests: let `startUserNotes` run again. */
export function resetNotebookStartForTests(): void {
  started = null;
}

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  setTimeout(() => void startUserNotes(), 0);
}

/**
 * Blanc Quick Notes, moved into the notes store.
 *
 * Quick Notes used to be one localStorage text box (`BLANC_QUICK_NOTES_KEY`)
 * that only Blanc could see; "New note" (Ctrl+N) and "Clear" emptied it with
 * no confirmation and no undo. Quick Notes is now the Notes app, inline, on
 * the same store as every other shell. The old text becomes one note:
 *
 * - its id is derived from the text's fingerprint, so running this again (a
 *   second window, a crash before the key was cleared) finds the same note
 *   instead of making a copy;
 * - the text is first copied verbatim to IndexedDB
 *   (`user-notes.blanc-quick-notes:<fingerprint>`) and read back;
 * - the old key is removed only once IndexedDB holds both the backup and the
 *   note, and only if the text has not changed meanwhile (then the changed
 *   text is moved on the next run, as its own note).
 */
import { kvGet, kvSet } from '../../storage/db';
import {
  USER_NOTES_META_PREFIX,
  createUserNote,
  flushUserNotes,
  getUserNote,
  userNoteSaveState,
  whenUserNotesReady,
} from '../../userNotesStore';
import { USER_NOTE_STREAM } from '../../../shared/userNotes';
import { BLANC_QUICK_NOTES_KEY } from './blancMechBus';

export const BLANC_QUICK_NOTES_BACKUP_PREFIX = `${USER_NOTES_META_PREFIX}blanc-quick-notes:`;
/** Tag on notes that came from Blanc Quick Notes (the old text, and `n` from Master search). */
export const BLANC_QUICK_NOTE_TAG = 'quick';

function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length.toString(36)}-${hash.toString(36)}`;
}

/** First non-empty line, as a title (the body keeps every line). */
export function quickNoteTitle(text: string): string {
  const line = text.split(/\r?\n/).find((l) => l.trim()) ?? '';
  const clean = line.trim().replace(/^#+\s*/, '');
  return clean.length > 80 ? `${clean.slice(0, 79)}…` : clean;
}

/** Move the old Quick Notes text into a note. Resolves with its id, or null when there was none. */
export async function migrateBlancQuickNotes(folder: string): Promise<string | null> {
  let text: string | null;
  try {
    text = localStorage.getItem(BLANC_QUICK_NOTES_KEY);
  } catch {
    return null;
  }
  if (!text || !text.trim()) return null;
  await whenUserNotesReady();
  const fp = fingerprint(text);
  const id = `quick-notes-${fp}`;
  const backupKey = BLANC_QUICK_NOTES_BACKUP_PREFIX + fp;
  let backedUp = false;
  try {
    const existing = await kvGet<{ text?: string }>(backupKey);
    if (existing?.text !== text) await kvSet(backupKey, { key: BLANC_QUICK_NOTES_KEY, savedAt: Date.now(), text });
    backedUp = (await kvGet<{ text?: string }>(backupKey))?.text === text;
  } catch {
    backedUp = false;
  }
  if (!getUserNote(id)) {
    createUserNote({ id, stream: USER_NOTE_STREAM, title: quickNoteTitle(text), detail: text, folder, tags: [BLANC_QUICK_NOTE_TAG] });
  }
  await flushUserNotes();
  if (backedUp && userNoteSaveState(id) === 'saved') {
    try {
      if (localStorage.getItem(BLANC_QUICK_NOTES_KEY) === text) localStorage.removeItem(BLANC_QUICK_NOTES_KEY);
    } catch {
      /* the next run finds the same note by id */
    }
  }
  return id;
}

/** Master search's `n <text>`: a new quick note (it used to append to the one text box). */
export function addQuickNote(text: string, folder: string): string {
  return createUserNote({
    stream: USER_NOTE_STREAM,
    title: quickNoteTitle(text),
    detail: text,
    folder,
    tags: [BLANC_QUICK_NOTE_TAG],
  }).id;
}

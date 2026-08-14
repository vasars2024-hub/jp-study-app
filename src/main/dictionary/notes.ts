// Read and write the user's own note on a word.
//
// Pure with respect to Electron: everything takes the `SqliteDb` handle, so the
// tests below run against the real engine on a temp file rather than a mock.
//
// The identity rule and the reason for it are in `shared/lexiconNotes.ts` and in
// migration 6. In one line: a note is keyed on language + normalised written form
// + normalised reading, never on `headwords.id`, because a re-import destroys
// every headword row and hands its id to a different word.

import type { SqliteDb } from './db';
import { normalizeForLookup } from './dictService';
import {
  noteIsEmpty,
  normalizeNoteKey,
  parseNoteTags,
  serializeNoteTags,
  type LexiconNote,
  type LexiconNoteIdentity,
  type LexiconNoteInput,
} from '../../shared/lexiconNotes';

interface NoteRow {
  lang: string;
  text: string;
  reading: string | null;
  note: string | null;
  tags: string | null;
  updated_at: number;
}

interface NoteKey {
  lang: string;
  norm: string;
  readingNorm: string;
}

/**
 * The stored key for a word.
 *
 * `normalizeForLookup` is used for the written form rather than
 * `normalizeNoteKey` so the key provably matches `headwords.norm`; the two apply
 * the same rule, and calling the index's own function here means they cannot
 * drift apart silently. The reading goes through the shared helper because no
 * headword column is being matched — it is only the second half of the key.
 */
export function noteKey(identity: LexiconNoteIdentity): NoteKey | null {
  const lang = identity.lang.trim().toLowerCase();
  const norm = normalizeForLookup(identity.text);
  if (!lang || !norm) return null;
  return { lang, norm, readingNorm: normalizeNoteKey(identity.reading ?? '') };
}

function toNote(row: NoteRow): LexiconNote {
  return {
    lang: row.lang,
    text: row.text,
    reading: row.reading ?? '',
    note: row.note ?? '',
    tags: parseNoteTags(row.tags),
    updatedAt: Number(row.updated_at) || 0,
  };
}

/** The note on this word, or `null` when the user has never written one. */
export function readUserNote(db: SqliteDb, identity: LexiconNoteIdentity): LexiconNote | null {
  const key = noteKey(identity);
  if (!key) return null;
  const row = db
    .prepare(`
      select lang, text, reading, note, tags, updated_at from user_notes
      where lang = ? and norm = ? and reading_norm = ?
    `)
    .get(key.lang, key.norm, key.readingNorm) as NoteRow | undefined;
  return row ? toNote(row) : null;
}

/**
 * Store the note on this word, or remove it when the user has emptied it.
 *
 * Returns the note as stored, or `null` when there is now none — the caller
 * renders that return value, so "saved" and "cleared" are the same round trip
 * and the surface can never show a note the database does not have.
 *
 * Delete-then-insert rather than an upsert: the identity index is partial, and a
 * conflict target has to restate the partial predicate to match it. Two
 * statements in one transaction say the same thing without depending on that.
 */
export function writeUserNote(
  db: SqliteDb,
  identity: LexiconNoteIdentity,
  input: LexiconNoteInput,
  now: number = Date.now(),
): LexiconNote | null {
  const key = noteKey(identity);
  if (!key) return null;
  const remove = db.prepare('delete from user_notes where lang = ? and norm = ? and reading_norm = ?');
  const insert = db.prepare(`
    insert into user_notes (headword_id, lang, text, norm, reading, reading_norm, note, tags, starred, updated_at)
    values (0, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  const empty = noteIsEmpty(input);
  const stored = empty ? null : {
    lang: key.lang,
    text: identity.text.trim(),
    reading: identity.reading.trim(),
    note: input.note,
    tags: [...input.tags],
    updatedAt: Math.max(0, Math.floor(now)),
  } satisfies LexiconNote;

  db.transaction(() => {
    remove.run(key.lang, key.norm, key.readingNorm);
    if (!stored) return;
    insert.run(
      stored.lang,
      stored.text,
      key.norm,
      stored.reading,
      key.readingNorm,
      stored.note,
      serializeNoteTags(stored.tags),
      stored.updatedAt,
    );
  })();

  return stored;
}

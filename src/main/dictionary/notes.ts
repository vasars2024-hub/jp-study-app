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
  type LexiconNoteListQuery,
  type LexiconNoteListResult,
} from '../../shared/lexiconNotes';

interface NoteRow {
  lang: string;
  text: string;
  reading: string | null;
  note: string | null;
  tags: string | null;
  starred: number | null;
  updated_at: number;
}

/** Every column a note is rebuilt from, named once so the two readers cannot drift. */
const NOTE_COLUMNS = 'lang, text, reading, note, tags, starred, updated_at';

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
    // Every row written before this column had a writer holds the schema default
    // 0, so an old note reads back as unstarred rather than as undefined.
    starred: Number(row.starred) === 1,
    updatedAt: Number(row.updated_at) || 0,
  };
}

/** The note on this word, or `null` when the user has never written one. */
export function readUserNote(db: SqliteDb, identity: LexiconNoteIdentity): LexiconNote | null {
  const key = noteKey(identity);
  if (!key) return null;
  const row = db
    .prepare(`
      select ${NOTE_COLUMNS} from user_notes
      where lang = ? and norm = ? and reading_norm = ?
    `)
    .get(key.lang, key.norm, key.readingNorm) as NoteRow | undefined;
  return row ? toNote(row) : null;
}

/**
 * A `like` pattern that matches this text anywhere, with the wildcards the user
 * typed treated as literal characters.
 *
 * Without this a note containing `%` is unfindable and a filter of `_` matches
 * everything. `\` is escaped first, or escaping the wildcards would re-escape it.
 */
function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

/**
 * One page of the user's notes, newest first.
 *
 * This is the only reader that does not know the word in advance, which is the
 * whole point: a note written months ago is otherwise reachable only by looking
 * up the exact word again, and nothing tells the reader which words those were.
 *
 * The filter matches the written form and the reading through the *normalised*
 * columns, so it folds width and case the same way the lookup index does, and
 * matches the body and the tags with `like` on the stored text. `like` folds
 * ASCII case only, so a Cyrillic capital typed into the filter finds the word but
 * not a mention of it inside an English-cased note body; the word and reading are
 * the filter's primary targets and they are the pair that folds properly.
 *
 * Rows left orphaned by migration 6 have `lang is null` and are excluded here for
 * the same reason the partial index skips them: there is no word to show.
 */
export function listUserNotes(db: SqliteDb, query: LexiconNoteListQuery): LexiconNoteListResult {
  const where: string[] = ['lang is not null'];
  const params: (string | number)[] = [];
  if (query.lang) {
    where.push('lang = ?');
    params.push(query.lang.trim().toLowerCase());
  }
  // No parameter: the column is an integer flag this file is the only writer of,
  // and `= 1` also excludes the nulls a hand-edited database could hold.
  if (query.starredOnly) where.push('starred = 1');
  const filter = query.filter.trim();
  if (filter) {
    where.push(
      "(norm like ? escape '\\' or reading_norm like ? escape '\\'"
      + " or note like ? escape '\\' or tags like ? escape '\\')",
    );
    const normPattern = containsPattern(normalizeForLookup(filter) || normalizeNoteKey(filter));
    const rawPattern = containsPattern(filter);
    params.push(normPattern, containsPattern(normalizeNoteKey(filter)), rawPattern, rawPattern);
  }
  const clause = `where ${where.join(' and ')}`;
  const total = Number(
    (db.prepare(`select count(*) as n from user_notes ${clause}`).get(...params) as { n: number } | undefined)?.n ?? 0,
  );
  const rows = db
    .prepare(`
      select ${NOTE_COLUMNS} from user_notes
      ${clause}
      order by updated_at desc, text asc
      limit ? offset ?
    `)
    .all(...params, query.limit, query.offset) as NoteRow[];
  return { notes: rows.map(toNote), total };
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
    values (0, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const empty = noteIsEmpty(input);
  const stored = empty ? null : {
    lang: key.lang,
    text: identity.text.trim(),
    reading: identity.reading.trim(),
    note: input.note,
    tags: [...input.tags],
    starred: input.starred,
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
      stored.starred ? 1 : 0,
      stored.updatedAt,
    );
  })();

  return stored;
}

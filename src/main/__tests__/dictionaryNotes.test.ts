// @vitest-environment node
//
// Against the real better-sqlite3 the app ships, like the rest of the dictionary
// database tests: a unique-index or migration assertion is worth nothing against
// a stub.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let tempRoot = '';

vi.mock('electron', () => ({
  app: { getPath: () => tempRoot },
}));

import { closeDictionaryDb, migrateDictionaryDb, openDictionaryDb, type SqliteDb } from '../dictionary/db';
import { MIGRATIONS } from '../dictionary/schema';
import { normalizeForLookup } from '../dictionary/dictService';
import { listUserNotes, noteKey, readUserNote, writeUserNote } from '../dictionary/notes';
import {
  NOTE_LIST_DEFAULT_LIMIT,
  NOTE_LIST_MAX_LIMIT,
  normalizeNoteKey,
  normalizeNoteTags,
  readNoteIdentity,
  readNoteListQuery,
} from '../../shared/lexiconNotes';

let db: SqliteDb;
let dir = '';

const TABERU = { lang: 'ja', text: '食べる', reading: 'たべる' };

/** One dictionary with one headword, returning the row id the caller must not rely on. */
function seedHeadword(
  handle: SqliteDb,
  opts: { dict?: string; lang?: string; text: string; reading?: string },
): number {
  const dictId = opts.dict ?? 'd1';
  if (!handle.prepare('select 1 from dictionaries where id = ?').get(dictId)) {
    handle
      .prepare('insert into dictionaries (id, title, source_lang, target_langs) values (?, ?, ?, ?)')
      .run(dictId, 'Test dict', opts.lang ?? 'ja', 'en');
  }
  const reading = opts.reading ?? '';
  const row = handle
    .prepare('insert into headwords (dict_id, lang, text, norm, reading, reading_norm) values (?, ?, ?, ?, ?, ?)')
    .run(
      dictId,
      opts.lang ?? 'ja',
      opts.text,
      normalizeForLookup(opts.text),
      reading,
      normalizeForLookup(reading),
    );
  return Number(row.lastInsertRowid);
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-dictnotes-'));
  dir = path.join(tempRoot, 'dictionary');
  db = openDictionaryDb({ dir });
});

afterEach(() => {
  if (db && db.open) db.close();
  closeDictionaryDb();
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe('user notes — storing and reading', () => {
  it('reads back the note it stored', () => {
    writeUserNote(db, TABERU, { note: 'transitive pair is 食べさせる', tags: ['verbs'] }, 1_700_000_000_000);
    expect(readUserNote(db, TABERU)).toEqual({
      lang: 'ja',
      text: '食べる',
      reading: 'たべる',
      note: 'transitive pair is 食べさせる',
      tags: ['verbs'],
      updatedAt: 1_700_000_000_000,
    });
  });

  it('has no note for a word nobody annotated', () => {
    expect(readUserNote(db, TABERU)).toBeNull();
  });

  it('replaces rather than duplicates when the same word is written twice', () => {
    writeUserNote(db, TABERU, { note: 'first', tags: [] });
    writeUserNote(db, TABERU, { note: 'second', tags: [] });
    expect(db.prepare('select count(*) c from user_notes').get()).toEqual({ c: 1 });
    expect(readUserNote(db, TABERU)?.note).toBe('second');
  });

  it('deletes the row when both fields are cleared, so "gone" is not stored as ""', () => {
    writeUserNote(db, TABERU, { note: 'temporary', tags: ['x'] });
    expect(writeUserNote(db, TABERU, { note: '', tags: [] })).toBeNull();
    expect(db.prepare('select count(*) c from user_notes').get()).toEqual({ c: 0 });
    expect(readUserNote(db, TABERU)).toBeNull();
  });

  it('keeps a tags-only note, because a tag is content too', () => {
    expect(writeUserNote(db, TABERU, { note: '', tags: ['jlpt-n5'] })?.tags).toEqual(['jlpt-n5']);
    expect(readUserNote(db, TABERU)?.tags).toEqual(['jlpt-n5']);
  });

  it('round-trips several tags through the single stored column', () => {
    writeUserNote(db, TABERU, { note: 'x', tags: ['verbs', 'JLPT N5', 'ichidan'] });
    expect(readUserNote(db, TABERU)?.tags).toEqual(['verbs', 'JLPT N5', 'ichidan']);
  });

  it('refuses an identity that does not name a word, and writes nothing', () => {
    expect(writeUserNote(db, { lang: 'ja', text: '   ', reading: '' }, { note: 'x', tags: [] })).toBeNull();
    expect(writeUserNote(db, { lang: '', text: '食べる', reading: '' }, { note: 'x', tags: [] })).toBeNull();
    expect(db.prepare('select count(*) c from user_notes').get()).toEqual({ c: 0 });
  });
});

describe('user notes — browsing every note without knowing the word', () => {
  /** The whole page, which is what the browse surface asks for on open. */
  const ALL = { lang: '', filter: '', limit: NOTE_LIST_DEFAULT_LIMIT, offset: 0 };

  function seedNotes(): void {
    writeUserNote(db, TABERU, { note: 'ichidan verb', tags: ['verbs'] }, 3_000);
    writeUserNote(db, { lang: 'ja', text: '猫', reading: 'ねこ' }, { note: 'everyday word', tags: ['animals'] }, 1_000);
    writeUserNote(db, { lang: 'zh', text: '生物', reading: '' }, { note: 'shēngwù', tags: [] }, 2_000);
  }

  it('lists every note newest first, with the word each one belongs to', () => {
    seedNotes();
    const result = listUserNotes(db, ALL);
    expect(result.total).toBe(3);
    expect(result.notes.map((note) => note.text)).toEqual(['食べる', '生物', '猫']);
    expect(result.notes[0]).toEqual({
      lang: 'ja',
      text: '食べる',
      reading: 'たべる',
      note: 'ichidan verb',
      tags: ['verbs'],
      updatedAt: 3_000,
    });
  });

  it('says nothing rather than something for a user who has never annotated a word', () => {
    expect(listUserNotes(db, ALL)).toEqual({ notes: [], total: 0 });
  });

  it('drops a note from the list the moment it is cleared', () => {
    seedNotes();
    writeUserNote(db, TABERU, { note: '', tags: [] });
    expect(listUserNotes(db, ALL).notes.map((note) => note.text)).toEqual(['生物', '猫']);
  });

  it('scopes to one language when asked, so a Chinese note stays out of a Japanese list', () => {
    seedNotes();
    const ja = listUserNotes(db, { ...ALL, lang: 'ja' });
    expect(ja.total).toBe(2);
    expect(ja.notes.every((note) => note.lang === 'ja')).toBe(true);
  });

  it('filters on the word, the reading, the body and the tags alike', () => {
    seedNotes();
    expect(listUserNotes(db, { ...ALL, filter: '猫' }).notes.map((n) => n.text)).toEqual(['猫']);
    expect(listUserNotes(db, { ...ALL, filter: 'たべ' }).notes.map((n) => n.text)).toEqual(['食べる']);
    expect(listUserNotes(db, { ...ALL, filter: 'ichidan' }).notes.map((n) => n.text)).toEqual(['食べる']);
    expect(listUserNotes(db, { ...ALL, filter: 'animals' }).notes.map((n) => n.text)).toEqual(['猫']);
  });

  it('folds the filter the same way the lookup index does, so ＣＡＴ finds cat', () => {
    writeUserNote(db, { lang: 'en', text: 'cat', reading: '' }, { note: 'x', tags: [] }, 1);
    expect(listUserNotes(db, { ...ALL, filter: 'ＣＡＴ' }).notes.map((n) => n.text)).toEqual(['cat']);
  });

  it('treats a wildcard the user typed as a character, not as "match everything"', () => {
    seedNotes();
    writeUserNote(db, { lang: 'ja', text: '％', reading: '' }, { note: 'percent sign', tags: [] }, 4_000);
    expect(listUserNotes(db, { ...ALL, filter: '%' }).notes.map((n) => n.text)).toEqual(['％']);
    expect(listUserNotes(db, { ...ALL, filter: '_' }).total).toBe(0);
  });

  it('reports the total behind the page, so the surface can offer the rest', () => {
    seedNotes();
    const page = listUserNotes(db, { ...ALL, limit: 2 });
    expect(page.notes.map((note) => note.text)).toEqual(['食べる', '生物']);
    expect(page.total).toBe(3);
    expect(listUserNotes(db, { ...ALL, limit: 2, offset: 2 }).notes.map((n) => n.text)).toEqual(['猫']);
  });

  it('never lists a note migration 6 could not give a word back', () => {
    seedNotes();
    db.prepare("update user_notes set lang = null where text = '猫'").run();
    expect(listUserNotes(db, ALL).total).toBe(2);
    expect(listUserNotes(db, ALL).notes.map((note) => note.text)).toEqual(['食べる', '生物']);
  });

  it('clamps a page an untrusted caller asked for instead of refusing it', () => {
    expect(readNoteListQuery(undefined)).toEqual({
      lang: '',
      filter: '',
      limit: NOTE_LIST_DEFAULT_LIMIT,
      offset: 0,
    });
    expect(readNoteListQuery({ limit: 10_000 }).limit).toBe(NOTE_LIST_MAX_LIMIT);
    expect(readNoteListQuery({ limit: 0 }).limit).toBe(1);
    expect(readNoteListQuery({ offset: -5 }).offset).toBe(0);
    expect(readNoteListQuery({ limit: Number.NaN }).limit).toBe(NOTE_LIST_DEFAULT_LIMIT);
    expect(readNoteListQuery({ lang: ' JA ' }).lang).toBe('ja');
    expect(readNoteListQuery({ filter: 'x'.repeat(500) }).filter).toHaveLength(64);
    expect(readNoteListQuery('nonsense')).toEqual({
      lang: '',
      filter: '',
      limit: NOTE_LIST_DEFAULT_LIMIT,
      offset: 0,
    });
  });
});

describe('user notes — the identity a note is keyed on', () => {
  // The whole reason migration 6 exists. `headwords.id` is an autoincrement row
  // number, and a re-import destroys every headword and hands its ids out again.
  it('survives the dictionary it was written against being re-imported', () => {
    seedHeadword(db, { text: '食べる', reading: 'たべる' });
    writeUserNote(db, TABERU, { note: 'mine', tags: [] });

    db.prepare('delete from dictionaries where id = ?').run('d1');
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
    seedHeadword(db, { text: '食べる', reading: 'たべる' });

    expect(readUserNote(db, TABERU)?.note).toBe('mine');
  });

  it('is still readable with no headword at all, which is why the word is stored on the row', () => {
    writeUserNote(db, TABERU, { note: 'mine', tags: [] });
    expect(db.prepare('select count(*) c from headwords').get()).toEqual({ c: 0 });
    expect(readUserNote(db, TABERU)?.text).toBe('食べる');
  });

  it('finds the note through the same normalisation the headword index uses', () => {
    writeUserNote(db, { lang: 'en', text: 'Cat', reading: '' }, { note: 'mine', tags: [] });
    expect(readUserNote(db, { lang: 'en', text: 'CAT', reading: '' })?.note).toBe('mine');
    // NFKC: the full-width form is the same headword to the index, so it must be
    // the same note here.
    writeUserNote(db, { lang: 'ja', text: 'ＡＢＣ', reading: '' }, { note: 'wide', tags: [] });
    expect(readUserNote(db, { lang: 'ja', text: 'abc', reading: '' })?.note).toBe('wide');
  });

  it('keys on the language, so the same spelling in two languages is two notes', () => {
    writeUserNote(db, { lang: 'ja', text: '愛', reading: '' }, { note: 'japanese', tags: [] });
    writeUserNote(db, { lang: 'zh', text: '愛', reading: '' }, { note: 'chinese', tags: [] });
    expect(readUserNote(db, { lang: 'ja', text: '愛', reading: '' })?.note).toBe('japanese');
    expect(readUserNote(db, { lang: 'zh', text: '愛', reading: '' })?.note).toBe('chinese');
  });

  it('keys on the reading, so two homographs do not share one note', () => {
    writeUserNote(db, { lang: 'ja', text: '生物', reading: 'せいぶつ' }, { note: 'organism', tags: [] });
    writeUserNote(db, { lang: 'ja', text: '生物', reading: 'なまもの' }, { note: 'raw food', tags: [] });
    expect(readUserNote(db, { lang: 'ja', text: '生物', reading: 'せいぶつ' })?.note).toBe('organism');
    expect(readUserNote(db, { lang: 'ja', text: '生物', reading: 'なまもの' })?.note).toBe('raw food');
  });

  it('does not fold katakana into hiragana the way the neighbour list does', () => {
    // A neighbour list must not return ネコ as a neighbour of ねこ; a note is
    // written against the spelling on screen and must not be shown under another.
    writeUserNote(db, { lang: 'ja', text: 'ネコ', reading: '' }, { note: 'katakana', tags: [] });
    expect(readUserNote(db, { lang: 'ja', text: 'ねこ', reading: '' })).toBeNull();
  });

  it('normalises the stored key with the index rule rather than a private copy', () => {
    for (const word of ['食べる', 'Cat', 'ＡＢＣ', 'ｶﾞ', ' spaced ']) {
      expect(normalizeNoteKey(word)).toBe(normalizeForLookup(word));
      expect(noteKey({ lang: 'ja', text: word, reading: '' })?.norm).toBe(normalizeForLookup(word));
    }
  });
});

describe('user notes — bounding untrusted input', () => {
  it('rejects an identity that is not an object naming a language and a word', () => {
    for (const raw of [null, undefined, [], 'x', 5, {}, { lang: 'ja' }, { text: '猫' }, { lang: ' ', text: '猫' }]) {
      expect(readNoteIdentity(raw)).toBeNull();
    }
    expect(readNoteIdentity({ lang: 'JA', text: ' 猫 ', reading: ' ねこ ' })).toEqual({
      lang: 'ja',
      text: '猫',
      reading: 'ねこ',
    });
  });

  it('drops empty, duplicate and non-string tags and caps how many are kept', () => {
    expect(normalizeNoteTags(['a', ' a ', 'A', '', '  ', 5, null])).toEqual(['a']);
    expect(normalizeNoteTags(Array.from({ length: 40 }, (_, i) => `t${i}`))).toHaveLength(12);
    expect(normalizeNoteTags('not an array')).toEqual([]);
    expect(normalizeNoteTags(['x'.repeat(80)])[0]).toHaveLength(32);
  });
});

// A file that already exists on a user's disk is at version 5, and the columns a
// note is keyed on do not exist in it yet.
describe('schema 6 — giving existing notes a word to hang off', () => {
  /** A database built by every step up to 5 and stopped there. */
  function openV5(): SqliteDb {
    const v5Dir = path.join(tempRoot, 'v5');
    const handle = openDictionaryDb({ dir: v5Dir, readonly: true });
    for (const step of MIGRATIONS) {
      if (step.version > 5) break;
      step.up(handle);
    }
    handle.pragma('user_version = 5');
    return handle;
  }

  let old: SqliteDb;

  beforeEach(() => {
    old = openV5();
  });

  afterEach(() => {
    if (old && old.open) old.close();
  });

  it('starts without the identity columns, which is the state being repaired', () => {
    const columns = (old.pragma('table_info(user_notes)') as { name: string }[]).map((c) => c.name);
    expect(columns).not.toContain('norm');
    expect(columns).toContain('headword_id');
  });

  it('backfills a legacy note from the headword it still points at', () => {
    const headwordId = seedHeadword(old, { text: '食べる', reading: 'たべる' });
    old.prepare('insert into user_notes (headword_id, note, updated_at) values (?, ?, ?)')
      .run(headwordId, 'legacy', 7);

    expect(migrateDictionaryDb(old)).toBe(6);

    expect(readUserNote(old, TABERU)).toEqual({
      lang: 'ja',
      text: '食べる',
      reading: 'たべる',
      note: 'legacy',
      tags: [],
      updatedAt: 7,
    });
  });

  it('keeps an already-orphaned note in the table but never reads it back as a word', () => {
    old.prepare('insert into user_notes (headword_id, note, updated_at) values (?, ?, ?)')
      .run(9_999, 'orphan', 7);

    expect(migrateDictionaryDb(old)).toBe(6);

    // Not deleted — the text is the user's — but it names no word, so no lookup
    // can attach it to one it does not belong to.
    expect(old.prepare('select count(*) c from user_notes').get()).toEqual({ c: 1 });
    expect(old.prepare('select count(*) c from user_notes where lang is not null').get()).toEqual({ c: 0 });
  });

  it('survives two legacy notes that resolve to the same word instead of failing the ladder', () => {
    // Two dictionaries supply the same headword; each carried its own note. The
    // identity index would refuse the pair, and a throwing step would strand the
    // whole database on version 5.
    const first = seedHeadword(old, { dict: 'a', text: '食べる', reading: 'たべる' });
    const second = seedHeadword(old, { dict: 'b', text: '食べる', reading: 'たべる' });
    const insert = old.prepare('insert into user_notes (headword_id, note, updated_at) values (?, ?, ?)');
    insert.run(first, 'older', 1);
    insert.run(second, 'newer', 2);

    expect(migrateDictionaryDb(old)).toBe(6);

    expect(old.prepare('select count(*) c from user_notes').get()).toEqual({ c: 2 });
    expect(readUserNote(old, TABERU)?.note).toBe('newer');
  });

  it('refuses a second row for one word once the identity index exists', () => {
    expect(migrateDictionaryDb(old)).toBe(6);
    const insert = old.prepare(`
      insert into user_notes (headword_id, lang, text, norm, reading, reading_norm, note, tags, starred, updated_at)
      values (0, 'ja', '食べる', '食べる', 'たべる', 'たべる', ?, '', 0, 0)
    `);
    insert.run('first');
    expect(() => insert.run('second')).toThrow();
  });
});

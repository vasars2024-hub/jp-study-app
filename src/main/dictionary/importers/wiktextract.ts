// Wiktextract (kaikki.org) JSONL → the dictionary database.
//
// The professional-dictionary plan names Wiktextract in its importer list, and it
// is the only listed source that is genuinely multilingual: one extraction carries
// Japanese, Chinese, English and Russian headwords with glosses in the extraction
// language, so it is what makes the schema's any-to-any claim reachable with real
// data rather than with fixtures.
//
// ## Why this importer, and not another CEDICT-shaped one
//
// `inflections` has had a reader since the unified-lookup work — `lookup()` probes
// it before the looser reading and prefix passes — and has had **no writer at all**.
// `dictService.ts`'s own header says as much ("a lemma table that no importer
// supplies yet"). Wiktextract's `forms[]` is that table: it carries the Russian
// declension grid and the Japanese/Chinese irregulars that `candidateForms()`'s
// suffix heuristic cannot derive. Landing it turns an already-tested code path from
// dead data into a working one.
//
// ## What is deliberately not imported
//
// Only the four tables that have live readers: `headwords`, `senses`, `glosses`,
// `inflections`. Wiktextract also carries etymology, synonym/antonym cross
// references, IPA and translations, and the schema has `etymology`/`xrefs` tables
// for two of those — but nothing reads either one yet, and writing rows no query
// consults is how a database grows data that is never wrong because it is never
// used. Those land with their readers.

import fs from 'node:fs';
import type { SqliteDb } from '../db';
import { normalizeForLookup } from '../dictService';
import { pinyinSearchKey } from '../../../shared/pinyin';

/** One JSONL record, reduced to the fields this importer reads. */
export interface WiktextractRecord {
  word?: string;
  lang_code?: string;
  pos?: string;
  senses?: { glosses?: string[]; raw_glosses?: string[]; tags?: string[] }[];
  forms?: { form?: string; tags?: string[]; source?: string }[];
}

export interface WiktextractImportOptions {
  /** Row id in `dictionaries`. */
  dictId?: string;
  title?: string;
  revision?: string;
  /**
   * Which `lang_code` values to keep. Defaults to the four study languages.
   *
   * Not cosmetic: a full English-Wiktionary extraction covers thousands of
   * languages, and importing all of them would multiply the database by an order
   * of magnitude for headwords no surface in this app can search.
   */
  langs?: string[];
  /** The language the definitions are written in. */
  glossLang?: string;
  priority?: number;
  licence?: string;
  attribution?: string;
  /** Called every `progressEvery` lines so a long import can report itself. */
  onProgress?: (lines: number) => void;
  progressEvery?: number;
  /**
   * Cooperative cancellation, checked on the same cadence as `onProgress`.
   *
   * Returning true aborts the transaction, so SQLite rolls the whole import back
   * and the previous copy of the dictionary — or its absence — is what remains. A
   * half-imported dictionary is worse than none: a lookup that misses reads as
   * "this word does not exist" rather than as "the import was cancelled".
   */
  shouldCancel?: () => boolean;
}

export interface WiktextractImportCounts {
  dictId: string;
  /** Records that parsed and were in a requested language. */
  entries: number;
  /** Lines skipped: blank, unparseable JSON, no word, or another language. */
  skipped: number;
  headwords: number;
  senses: number;
  glosses: number;
  inflections: number;
  /** True when `shouldCancel` fired and the transaction was rolled back. */
  cancelled: boolean;
}

export const WIKTEXTRACT_LICENCE = 'CC BY-SA 4.0';
export const WIKTEXTRACT_ATTRIBUTION = 'Wiktionary via wiktextract — https://kaikki.org/';

/** The study languages. Anything else in a dump is dropped unless asked for. */
export const WIKTEXTRACT_DEFAULT_LANGS = ['ja', 'zh', 'en', 'ru'];

/** Thrown internally to abort the transaction; never escapes `importWiktextract`. */
const CANCELLED = Symbol('wiktextract-cancelled');

/**
 * Tag values that mark a `forms[]` row as inflection-table scaffolding rather than
 * a word form. Wiktextract emits these verbatim, with placeholder `form` strings
 * like `no-table-tags` or the template name, and storing them would put junk in
 * front of every de-inflected lookup.
 */
const FORM_SCAFFOLD_TAGS = new Set(['table-tags', 'inflection-template', 'class', 'error-unknown-tag']);

/**
 * Tags whose form is written in another script than the headword. A romanization
 * is not a surface form a learner types in the source language, and indexing it as
 * one makes `byInflection` answer Latin queries with Japanese headwords.
 */
const FORM_TRANSLITERATION_TAGS = new Set(['romanization', 'romanisation', 'transliteration', 'romaji']);

/** Tags that mark a form as the headword's reading rather than an inflection of it. */
const FORM_READING_TAGS = new Set(['hiragana', 'kana', 'pinyin']);

/**
 * The index key for an inflected form.
 *
 * `normalizeForLookup` is NFKC + lower case, and NFKC preserves combining marks.
 * Wiktextract's Russian forms carry the stress accent (`соба́ки`, U+0301) that no
 * user ever types, so a form stored as written would never be found. Only U+0300
 * and U+0301 are stripped: they are stress notation in every language here, while
 * U+0308 is not — `ё` and `е` are different Russian letters.
 *
 * The marks are written as escapes rather than as themselves. A combining
 * character in a character class is invisible in an editor and indistinguishable
 * from a typo that deleted it.
 */
const STRESS_MARKS = /[\u0300\u0301]/g;

export function inflectionKey(form: string): string {
  return normalizeForLookup(form).normalize('NFD').replace(STRESS_MARKS, '').normalize('NFC');
}

/**
 * A tone-marked pinyin reading → the same spaceless toneless key CC-CEDICT stores.
 *
 * `pinyinSearchKey` strips *numeric* tones, because CC-CEDICT writes `gou3`.
 * Wiktextract writes `gǒu`, so the numeric stripper leaves the mark in place and
 * the reading index answers nothing a learner can type. Decomposing and removing
 * the four tone marks first is what makes the two importers agree on one key.
 *
 * U+0308 is deliberately not in that set: in pinyin it is the `ü` of `lǜ`, a
 * distinct vowel, and `pinyinToneless` already preserves it on the CC-CEDICT side.
 */
export function pinyinReadingKey(reading: string): string {
  const toneless = reading
    .normalize('NFD')
    .replace(/[\u0300\u0301\u0304\u030c]/g, '')
    .normalize('NFC');
  return pinyinSearchKey(toneless);
}

/**
 * Splits a record's `forms[]` into the reading it declares and the inflected forms
 * worth indexing.
 *
 * Exported because the filtering, not the SQL, is where this importer can be wrong:
 * a dump mixes real paradigm rows with template scaffolding and transliterations in
 * the same array, distinguished only by their tags.
 */
export function classifyForms(
  record: WiktextractRecord,
): { reading: string; inflections: { form: string; tags: string[] }[] } {
  const word = record.word ?? '';
  let reading = '';
  const inflections: { form: string; tags: string[] }[] = [];
  const seen = new Set<string>();

  for (const entry of record.forms ?? []) {
    const form = entry?.form?.trim();
    if (!form || form === word) continue;
    const tags = (entry.tags ?? []).filter((tag): tag is string => typeof tag === 'string');
    if (tags.some((tag) => FORM_SCAFFOLD_TAGS.has(tag))) continue;

    if (tags.some((tag) => FORM_READING_TAGS.has(tag))) {
      if (!reading) reading = form;
      continue;
    }
    if (tags.some((tag) => FORM_TRANSLITERATION_TAGS.has(tag))) continue;
    // A form with no tags at all carries no paradigm information, so it would be
    // indexed as an inflection whose reason chain is empty — indistinguishable in
    // the UI from an exact match that arrived by the wrong route.
    if (tags.length === 0) continue;

    const key = inflectionKey(form);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    inflections.push({ form: key, tags });
  }

  return { reading, inflections };
}

/**
 * Imports Wiktextract JSONL lines, replacing any previous import of the same id.
 *
 * Takes an iterable of lines rather than one string: a language-filtered kaikki
 * dump runs to several gigabytes, past what a single JavaScript string can hold,
 * so the caller has to be able to stream. `readJsonlLines` below is the file-backed
 * implementation; a test can pass an array.
 *
 * The whole import is one transaction, for the same reason CC-CEDICT's is.
 */
export function importWiktextract(
  db: SqliteDb,
  lines: Iterable<string>,
  options: WiktextractImportOptions = {},
): WiktextractImportCounts {
  const dictId = options.dictId ?? 'wiktextract';
  const glossLang = options.glossLang ?? 'en';
  const langs = new Set(options.langs ?? WIKTEXTRACT_DEFAULT_LANGS);
  const progressEvery = options.progressEvery ?? 20_000;
  const counts: WiktextractImportCounts = {
    dictId, entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, inflections: 0, cancelled: false,
  };

  const run = db.transaction(() => {
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`
      insert into dictionaries (id, title, revision, source_lang, target_langs, priority,
                                enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, ?, ?, ?, ?, 1, 'term', ?, ?, 0, 0, 0)
    `).run(
      dictId,
      options.title ?? 'Wiktionary (wiktextract)',
      options.revision ?? '',
      // The dump is multilingual, so no single value is right. `source_lang` is
      // descriptive here; `headwords.lang` is what every query actually filters on.
      [...langs].join(','),
      glossLang,
      options.priority ?? 0,
      options.licence ?? WIKTEXTRACT_LICENCE,
      options.attribution ?? WIKTEXTRACT_ATTRIBUTION,
    );

    const insertHeadword = db.prepare(`
      insert into headwords (dict_id, lang, text, norm, reading, reading_norm, score)
      values (?, ?, ?, ?, ?, ?, 0)
    `);
    const insertSense = db.prepare('insert into senses (headword_id, ord, pos, tags) values (?, ?, ?, ?)');
    const insertGloss = db.prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, ?)');
    const insertInflection = db.prepare(
      'insert into inflections (headword_id, form, name, tags) values (?, ?, null, ?)',
    );

    let line = 0;
    for (const raw of lines) {
      line += 1;
      if (progressEvery > 0 && line % progressEvery === 0) {
        options.onProgress?.(line);
        if (options.shouldCancel?.()) throw CANCELLED;
      }

      const record = parseRecord(raw);
      if (!record || !langs.has(record.lang_code ?? '')) {
        counts.skipped += 1;
        continue;
      }
      writeRecord(record);
    }

    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.entries, dictId);

    function writeRecord(record: WiktextractRecord): void {
      const word = (record.word ?? '').trim();
      const lang = record.lang_code as string;
      const { reading, inflections } = classifyForms(record);
      // A record with no usable definition is a stub page, not an entry. Writing it
      // would produce a headword whose every sense the gloss-language filter drops,
      // which `lookup()` then has to discard on every single query.
      const senses = (record.senses ?? [])
        .map((sense) => ({
          tags: (sense.tags ?? []).filter((tag): tag is string => typeof tag === 'string'),
          glosses: (sense.glosses ?? sense.raw_glosses ?? [])
            .filter((gloss): gloss is string => typeof gloss === 'string' && gloss.trim().length > 0),
        }))
        .filter((sense) => sense.glosses.length > 0);
      if (!senses.length) {
        counts.skipped += 1;
        return;
      }

      counts.entries += 1;
      // Chinese readings are pinyin and are searched spaceless and toneless, the
      // same key CC-CEDICT's import writes; every other language's reading is
      // already in the script it is searched in.
      const readingNorm = reading
        ? (lang === 'zh' ? pinyinReadingKey(reading) : normalizeForLookup(reading))
        : '';
      const headwordId = Number(
        insertHeadword.run(dictId, lang, word, normalizeForLookup(word), reading, readingNorm).lastInsertRowid,
      );
      counts.headwords += 1;

      senses.forEach((sense, ord) => {
        const senseId = Number(
          insertSense.run(headwordId, ord, record.pos ?? '', sense.tags.join(',')).lastInsertRowid,
        );
        counts.senses += 1;
        sense.glosses.forEach((gloss, glossOrd) => {
          insertGloss.run(senseId, glossLang, gloss, glossOrd);
          counts.glosses += 1;
        });
      });

      for (const inflection of inflections) {
        // `name` stays null and the paradigm lives in `tags`. `collectInflectionReasons`
        // concatenates name with the split tags, so a readable name here would
        // duplicate every tag it is built from in the displayed reason chain.
        insertInflection.run(headwordId, inflection.form, inflection.tags.join(','));
        counts.inflections += 1;
      }
    }
  });

  try {
    run();
  } catch (err) {
    if (err !== CANCELLED) throw err;
    // Every count is zero because every row was rolled back. Reporting the tallies
    // the aborted pass had reached would describe rows that are not in the database.
    return { dictId, entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, inflections: 0, cancelled: true };
  }
  return counts;
}

function parseRecord(raw: string): WiktextractRecord | null {
  const text = raw.trim();
  if (!text || text.startsWith('#')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as WiktextractRecord;
  if (typeof record.word !== 'string' || !record.word.trim()) return null;
  if (typeof record.lang_code !== 'string') return null;
  return record;
}

/**
 * Reads a file as lines, synchronously and in chunks.
 *
 * `readline` is the obvious tool and cannot be used: `better-sqlite3` transactions
 * are synchronous, so an async iterator cannot drive one. `readFileSync().split()`
 * is what the CC-CEDICT importer does and does not survive here — a filtered kaikki
 * dump exceeds V8's maximum string length. This yields one line at a time and never
 * holds more than `chunkBytes` plus the current line in memory.
 *
 * The leftover is carried as **bytes**, not as a decoded string. A 1 MiB read ends
 * wherever it ends, routinely in the middle of a multi-byte character, and decoding
 * each chunk on its own turns that character into U+FFFD — silent mojibake in
 * exactly the CJK and Cyrillic headwords this importer exists for.
 */
export function* readJsonlLines(filePath: string, chunkBytes = 1 << 20): Generator<string> {
  const NEWLINE = 0x0a;
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(chunkBytes);
    let pending = Buffer.alloc(0);
    for (;;) {
      const read = fs.readSync(fd, buffer, 0, chunkBytes, null);
      if (read <= 0) break;
      // `buffer` is reused by the next read, so the tail has to be copied out.
      const chunk = Buffer.from(buffer.subarray(0, read));
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      let newline = pending.indexOf(NEWLINE);
      while (newline !== -1) {
        yield pending.toString('utf8', 0, newline);
        pending = pending.subarray(newline + 1);
        newline = pending.indexOf(NEWLINE);
      }
    }
    if (pending.length) yield pending.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

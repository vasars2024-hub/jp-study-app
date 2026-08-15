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
// Only the tables that have live readers: `headwords`, `senses`, `glosses`,
// `inflections`, `etymology` — whose reader landed with it, in
// `findLexiconEtymology` — and now `xrefs`, which lands with `findLexiconXrefs`
// on the same terms this note originally set: writing rows no query consults is
// how a database grows data that is never wrong because it is never used. IPA
// and translations are still out for exactly that reason.

import fs from 'node:fs';
import type { SqliteDb } from '../db';
import { normalizeForLookup } from '../dictService';
import { pinyinSearchKey } from '../../../shared/pinyin';
import { type LexiconXrefKind, normalizeXrefKind, normalizeXrefText } from '../../../shared/lexiconXrefs';

/** One JSONL record, reduced to the fields this importer reads. */
/**
 * One cross-reference entry as kaikki writes it.
 *
 * The `word` field is the only one this importer reads. Kaikki also emits `sense`
 * (a gloss fragment disambiguating *which* sense the link belongs to) and
 * `english`; both are prose about the link rather than the link, and `xrefs` has
 * one text column.
 */
export interface WiktextractXrefEntry {
  word?: string;
}

/** One `senses[]` element, reduced to the fields this importer reads. */
export interface WiktextractSense {
  glosses?: string[];
  raw_glosses?: string[];
  tags?: string[];
  synonyms?: WiktextractXrefEntry[];
  antonyms?: WiktextractXrefEntry[];
  related?: WiktextractXrefEntry[];
  coordinate_terms?: WiktextractXrefEntry[];
  see_also?: (WiktextractXrefEntry | string)[];
}

export interface WiktextractRecord {
  word?: string;
  lang_code?: string;
  pos?: string;
  senses?: WiktextractSense[];
  forms?: { form?: string; tags?: string[]; source?: string }[];
  /** The origin paragraph, plain text. Absent on most entries. */
  etymology_text?: string;
  /**
   * The same paragraph split into sections, on the minority of entries that have
   * one. Kaikki emits both fields when it emits either, and `etymology_text` is
   * the joined form — so this is read only when the joined form is missing, never
   * in addition to it.
   */
  etymology_texts?: string[];
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
  /** Origin paragraphs written to the `etymology` table. */
  etymologies: number;
  /** Cross-reference rows written to the `xrefs` table. */
  xrefs: number;
  /** True when `shouldCancel` fired and the transaction was rolled back. */
  cancelled: boolean;
}

/**
 * An etymology longer than this is dropped rather than stored.
 *
 * Truncating would be worse than omitting: a paragraph cut mid-clause reads as a
 * complete claim the source never made, and this surface's entire value is that
 * every sentence in it is verbatim. Wiktionary's real etymologies sit far under
 * this; anything past it is a transcluded table or a citation dump.
 */
export const MAX_ETYMOLOGY_CHARS = 4000;

/**
 * The origin paragraph a record carries, or an empty string.
 *
 * Exported for the same reason `classifyForms` is: the choice of which field to
 * read, and when, is where this can be wrong. `etymology_texts` is a *split* of
 * `etymology_text`, not extra material, so reading both would store the same
 * prose twice — once joined and once per section — and the reader would show a
 * paragraph followed by its own halves.
 */
export function etymologyText(record: WiktextractRecord): string {
  const joined = typeof record.etymology_text === 'string' ? record.etymology_text.trim() : '';
  const text = joined || (record.etymology_texts ?? [])
    .filter((part): part is string => typeof part === 'string')
    .map((part) => part.trim())
    .filter(Boolean)
    .join('\n\n');
  return text.length > MAX_ETYMOLOGY_CHARS ? '' : text;
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
 * Which kaikki `senses[]` field carries which stored `xrefs.kind`.
 *
 * `related` and `coordinate_terms` both collapse to `cf`, which is a real loss of
 * detail and the honest one available: the schema documents four kinds, and
 * "coordinate term" is neither a synonym nor a synonym-adjacent enough relation to
 * file as one. `cf` claims only "compare", which is true of both.
 */
const XREF_SOURCE_FIELDS: readonly (keyof WiktextractSense)[] = [
  'synonyms', 'antonyms', 'see_also', 'related', 'coordinate_terms',
];

/**
 * An xref target longer than this is a sentence, not a word.
 *
 * Wiktionary's link lists routinely carry a parenthetical or a whole usage note
 * where a word belongs. Such a row could never resolve against `headwords.norm`,
 * so it would render as permanently unresolvable text under a "synonyms" heading —
 * worse than being absent, because the surface would look broken rather than empty.
 */
const MAX_XREF_TARGET_CHARS = 32;

/**
 * The cross references one sense states, as `(kind, target)` pairs.
 *
 * Exported for the same reason `classifyForms` is: the SQL is trivial and the
 * filtering is where this can be wrong. A kaikki link list mixes bare words with
 * templated prose, and only the shape distinguishes them.
 *
 * Self references are dropped. Wiktionary pages list the headword among its own
 * "related terms" often enough that leaving them in would give most entries a
 * cross reference pointing at the page the reader is already on.
 */
export function classifyXrefs(
  sense: WiktextractSense,
  word: string,
): { kind: LexiconXrefKind; text: string }[] {
  const out: { kind: LexiconXrefKind; text: string }[] = [];
  const seen = new Set<string>();
  const self = normalizeXrefText(word);

  for (const field of XREF_SOURCE_FIELDS) {
    const kind = normalizeXrefKind(field);
    if (!kind) continue;
    const entries = sense[field];
    if (!Array.isArray(entries)) continue;

    for (const entry of entries) {
      // `see_also` is the one field kaikki emits as bare strings as well as as
      // objects, depending on how the source page was templated.
      const raw = typeof entry === 'string' ? entry : entry?.word;
      if (typeof raw !== 'string') continue;
      const text = normalizeXrefText(raw);
      if (!text || text === self) continue;
      if ([...text].length > MAX_XREF_TARGET_CHARS) continue;
      const key = `${kind} ${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ kind, text });
    }
  }

  return out;
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
    dictId, entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, inflections: 0,
    etymologies: 0, xrefs: 0, cancelled: false,
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
    // `source` carries the record's own part of speech, not the dump's name. The
    // dictionary a row came from is already recoverable through `headwords.dict_id`,
    // whereas the part of speech is the one thing that distinguishes two genuinely
    // different origins Wiktionary files under one spelling.
    const insertEtymology = db.prepare(
      'insert into etymology (headword_id, lang, text, source) values (?, ?, ?, ?)',
    );
    const insertXref = db.prepare('insert into xrefs (from_sense, to_text, kind) values (?, ?, ?)');

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
          // Cross references hang off the sense that states them, so they are
          // classified here and written once the sense has an id. A sense the
          // filter below drops takes its references with it: an xref whose
          // `from_sense` does not exist is a row no reader can reach.
          xrefs: classifyXrefs(sense, word),
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
        for (const xref of sense.xrefs) {
          insertXref.run(senseId, xref.text, xref.kind);
          counts.xrefs += 1;
        }
      });

      const etymology = etymologyText(record);
      if (etymology) {
        insertEtymology.run(headwordId, lang, etymology, record.pos ?? null);
        counts.etymologies += 1;
      }

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
    return {
      dictId, entries: 0, skipped: 0, headwords: 0, senses: 0, glosses: 0, inflections: 0,
      etymologies: 0, xrefs: 0, cancelled: true,
    };
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

// CC-CEDICT → the dictionary database.
//
// Parsing lives in `shared/pinyin.ts`, which the renderer's `chineseDict.ts` now
// also uses: one line format, one tone-mark table, no divergence.
//
// The one design decision worth stating is how the two scripts are stored. CEDICT
// gives every entry a traditional and a simplified form, and a learner may look up
// either. Storing the pair as two independent headwords doubles the senses and makes
// "how many entries does this dictionary have" a meaningless number; storing only
// one makes half the lookups miss. So: the **simplified** form carries the senses,
// the traditional form is a headword whose `variant_of` points at it, and the lookup
// service follows that link. That is the plan's own instruction — "simplified and
// traditional as headwords linked by variant_of" — and the reason the column exists.

import type { SqliteDb } from '../db';
import { parseCedictLine, pinyinSearchKey, pinyinToneMarks, type CedictEntry } from '../../../shared/pinyin';

export interface CedictImportOptions {
  /** Row id in `dictionaries`. Defaults to the managed asset's id. */
  dictId?: string;
  title?: string;
  revision?: string;
  /** Gloss language. CC-CEDICT is English-only, but the column is not. */
  glossLang?: string;
  priority?: number;
  /** Called every `progressEvery` lines so a long import can report itself. */
  onProgress?: (lines: number) => void;
  progressEvery?: number;
}

export interface CedictImportCounts {
  dictId: string;
  /** Lines that parsed. */
  entries: number;
  /** Lines skipped as comments or malformed. */
  skipped: number;
  /** Rows in `headwords`, including the traditional variants. */
  headwords: number;
  /** Of those, the ones that are variants rather than sense-carriers. */
  variants: number;
  senses: number;
  glosses: number;
}

export const CEDICT_LICENCE = 'CC BY-SA 4.0';
export const CEDICT_ATTRIBUTION = 'CC-CEDICT — https://cc-cedict.org/';

/**
 * Imports a CC-CEDICT `.u8` file's text, replacing any previous import.
 *
 * The whole file is one transaction. That is not an optimisation detail: a partial
 * dictionary is worse than no dictionary, because a lookup that misses reads as
 * "this word does not exist" rather than as "the import failed".
 */
export function importCedict(db: SqliteDb, text: string, options: CedictImportOptions = {}): CedictImportCounts {
  const dictId = options.dictId ?? 'cc-cedict';
  const glossLang = options.glossLang ?? 'en';
  const progressEvery = options.progressEvery ?? 20_000;
  const counts: CedictImportCounts = {
    dictId, entries: 0, skipped: 0, headwords: 0, variants: 0, senses: 0, glosses: 0,
  };

  const run = db.transaction(() => {
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`
      insert into dictionaries (id, title, revision, source_lang, target_langs, priority,
                                enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, ?, 'zh', ?, ?, 1, 'term', ?, ?, 0, ?, 0)
    `).run(
      dictId,
      options.title ?? 'CC-CEDICT',
      options.revision ?? '',
      glossLang,
      options.priority ?? 0,
      CEDICT_LICENCE,
      CEDICT_ATTRIBUTION,
      text.length,
    );

    const insertHeadword = db.prepare(`
      insert into headwords (dict_id, lang, text, norm, reading, reading_norm, variant_of, score)
      values (?, 'zh', ?, ?, ?, ?, ?, 0)
    `);
    const insertSense = db.prepare('insert into senses (headword_id, ord, pos, tags) values (?, 0, ?, ?)');
    const insertGloss = db.prepare('insert into glosses (sense_id, lang, text, ord) values (?, ?, ?, ?)');

    let line = 0;
    for (const raw of text.split('\n')) {
      line += 1;
      if (progressEvery > 0 && line % progressEvery === 0) options.onProgress?.(line);

      const entry = parseCedictLine(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
      if (!entry) {
        counts.skipped += 1;
        continue;
      }
      counts.entries += 1;
      writeEntry(entry);
    }

    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.entries, dictId);

    function writeEntry(entry: CedictEntry): void {
      const reading = pinyinToneMarks(entry.pinyin);
      // Spaceless on purpose. `reading_norm` is a search key, never a display
      // string — `reading` holds the readable `chuán tǒng`. Learners type both
      // "chuan tong" and "chuantong", and only one of them can be an index hit
      // unless BOTH sides collapse spaces. Storing the spaced form and stripping
      // at query time would need `replace(reading_norm,' ','')`, which is a
      // function on the column and defeats the index entirely.
      const readingNorm = pinyinSearchKey(entry.pinyin);

      const headwordId = Number(
        insertHeadword.run(dictId, entry.simp, entry.simp, reading, readingNorm, null).lastInsertRowid,
      );
      counts.headwords += 1;

      // CEDICT has no sense divisions: every slash-separated gloss belongs to the
      // one sense. Splitting them into separate senses would invent structure the
      // source does not have, and Phase 5's merge would then rank fictional senses.
      const senseId = Number(insertSense.run(headwordId, '', '').lastInsertRowid);
      counts.senses += 1;
      entry.defs.forEach((definition, ord) => {
        insertGloss.run(senseId, glossLang, definition, ord);
        counts.glosses += 1;
      });

      if (entry.trad && entry.trad !== entry.simp) {
        insertHeadword.run(dictId, entry.trad, entry.trad, reading, readingNorm, headwordId);
        counts.headwords += 1;
        counts.variants += 1;
      }
    }
  });

  run();
  return counts;
}

/**
 * The headword a lookup should read senses from — itself, or what it is a variant of.
 *
 * Traditional headwords carry no senses by design, so every reader must resolve
 * through this. Returning the id rather than the row keeps it usable as a subquery.
 */
export function resolveVariant(db: SqliteDb, headwordId: number): number {
  const row = db.prepare('select variant_of from headwords where id = ?').get(headwordId) as
    | { variant_of: number | null }
    | undefined;
  return row?.variant_of ?? headwordId;
}

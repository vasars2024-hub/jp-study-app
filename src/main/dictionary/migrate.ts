// Migrating the existing `userData/yomitan/<id>/index.json` stores into the database.
//
// The source plan calls this the scariest change in the document, and it is right:
// the JSON stores are the only copy of dictionaries the user may have spent an hour
// downloading. So the rules here are narrow on purpose.
//
//   * **Nothing is deleted.** The JSON stays where it is. This function only ever
//     adds rows, and re-running it replaces that dictionary's rows rather than
//     appending a second copy. "Rebuild index" is therefore safe to press twice.
//   * **A broken store is skipped, not fatal.** One unparseable index.json must not
//     stop the other five from migrating, and it must be named in the result.
//   * **The migration is lossless with respect to what the JSON holds** — terms,
//     pitch and frequency all land somewhere. That is what makes the parity test
//     meaningful: anything the old Map could answer, the database can answer.
//
// Everything is synchronous because better-sqlite3 is; the caller is expected to run
// it off the main thread for a large store (Phase 1's utilityProcess), which is why
// progress is reported through a callback rather than an event bus.

import fs from 'node:fs';
import path from 'node:path';
import type { DictSense, YomitanDictInfo } from '../../shared/types';
import type { SqliteDb } from './db';
import { DEFAULT_SOURCE_LANG, resolveGlossLangs, resolveSourceLang } from './glossLang';

/**
 * Separator between term and reading in the legacy pitch/freq key format.
 *
 * Written as an escape rather than as the raw byte it is: a literal 0x01 in source
 * survives most tools and is silently eaten by some, and split('') — what is left
 * when it is eaten — splits into characters and quietly indexes single letters.
 */
export const LEGACY_KEY_SEP = '\u0001';

/** The on-disk shape written by `yomitan.ts`. Duplicated deliberately: this module
 *  reads a *file format*, and must keep reading old files even if that module's
 *  internal types move on. */
export interface LegacyGlossaryEntry {
  word: string;
  reading: string;
  score: number;
  senses: DictSense[];
  glossaryHtml?: string;
  source?: string;
  langs?: string[];
}

export interface LegacyPitchEntry {
  reading: string;
  positions: number[];
}

export interface LegacyDictIndex {
  version: 1;
  info: YomitanDictInfo;
  terms?: Record<string, LegacyGlossaryEntry[]>;
  pitch?: Record<string, LegacyPitchEntry>;
  freq?: Record<string, number>;
}

export interface ImportedCounts {
  dictId: string;
  headwords: number;
  senses: number;
  glosses: number;
  pitch: number;
  freq: number;
}

export interface MigrationProgress {
  /** 1-based index of the store being read. */
  current: number;
  total: number;
  dictId: string;
  title: string;
}

export interface MigrationResult {
  imported: ImportedCounts[];
  /** Stores that could not be read, with the reason. Never throws for these. */
  skipped: { dictId: string; reason: string }[];
  /** Set when `shouldCancel` fired; `imported` is then a partial, honest list. */
  cancelled?: boolean;
}

interface LegacySourceProvenance {
  licence: string;
  attribution: string;
}

/**
 * Provenance for stores provisioned by this application before the legacy
 * index format had licence fields. Keep this keyed by the app-owned stable id:
 * titles are user-editable/format-dependent, while assigning metadata to an
 * arbitrary user-imported Yomitan archive would be an unsafe guess.
 */
const BUNDLED_LEGACY_PROVENANCE: Readonly<Record<string, LegacySourceProvenance>> = {
  'bundled-jmdict-en': {
    licence: 'CC BY-SA 4.0',
    attribution: 'JMdict — Electronic Dictionary Research and Development Group (EDRDG) — https://www.edrdg.org/jmdict/j_jmdict.html',
  },
  'bundled-jmdict-ru': {
    licence: 'CC BY-SA 4.0',
    attribution: 'JMdict — Electronic Dictionary Research and Development Group (EDRDG) — https://www.edrdg.org/jmdict/j_jmdict.html',
  },
  'bundled-kanjium-pitch': {
    licence: 'CC BY-SA 4.0',
    attribution: 'Kanjium pitch accent data — Uros O. — https://github.com/mifunetoshiro/kanjium',
  },
  'bundled-moedict-zh': {
    licence: 'CC BY-ND 3.0 TW',
    attribution: 'Ministry of Education, Taiwan dictionaries — https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html',
  },
};

/**
 * Which of the three legacy payloads a store carries, in the order the legacy
 * format itself resolves them: a store that has terms is a term dictionary even
 * if it also ships accents.
 */
export function legacyKindOf(info: Pick<YomitanDictInfo, 'hasTerms' | 'hasPitch'>): 'term' | 'pitch' | 'freq' {
  return info.hasTerms ? 'term' : info.hasPitch ? 'pitch' : 'freq';
}

/**
 * The number a source list should print next to this dictionary.
 *
 * `entry_count` used to be `counts.headwords` unconditionally, which is right
 * for a term dictionary and a lie for the other two kinds: the bundled Kanjium
 * store owns 107,978 accent rows and no headwords at all, so Settings rendered
 * "pitch · 0" for a dictionary that is fully populated and actively answering
 * lookups. Count the rows the kind actually owns. Reading the kind rather than
 * taking the largest count keeps the number stable for a hypothetical store
 * that carries two payloads — it stays the count of the thing the row claims
 * to be.
 */
export function legacyEntryCount(
  kind: 'term' | 'pitch' | 'freq',
  counts: Pick<ImportedCounts, 'headwords' | 'pitch' | 'freq'>,
): number {
  if (kind === 'pitch') return counts.pitch;
  if (kind === 'freq') return counts.freq;
  return counts.headwords;
}

/**
 * Every gloss language a dictionary's definitions are written in, best evidence
 * first. Legacy stores predate `glossLangs`, so an empty list here is common and
 * is precisely where the language used to be lost — see `./glossLang`.
 */
export function glossLangsOf(info: YomitanDictInfo): string[] {
  return resolveGlossLangs(info);
}

/**
 * The single language every gloss row of a dictionary is stored under.
 *
 * `'en'` is the last-resort default rather than a guess: an unknown language has
 * to be written as *something*, and English is what the rest of the app assumes
 * when a source declares nothing. It is only reached once the id and the title
 * have both failed to identify the dictionary.
 */
export function glossLangOf(info: YomitanDictInfo): string {
  return glossLangsOf(info)[0] ?? 'en';
}

/**
 * The language a dictionary's headwords are written in.
 *
 * Japanese is the last-resort default for the same reason `'en'` is on the gloss
 * side: the legacy format declares no source language, so an unknown one has to be
 * written as *something*, and every legacy store this app provisions is Japanese-
 * first apart from the bundled Chinese one. It is reached only once the id has
 * failed to identify the dictionary. The title deliberately does not get a vote —
 * see `./glossLang`.
 */
export function sourceLangOf(info: YomitanDictInfo): string {
  return resolveSourceLang(info) ?? DEFAULT_SOURCE_LANG;
}

/**
 * Writes one parsed `index.json` into the database, replacing any previous import
 * of the same dictionary id.
 *
 * The replace is a single `DELETE FROM dictionaries` — the schema's cascades take
 * out the headwords, senses, glosses and pitch rows, and the FTS triggers retract
 * their index entries. Doing it any other way is how a re-import leaves a search
 * index answering with rows that no longer exist.
 */
class LegacyMigrationCancelled extends Error {}

const LEGACY_DELETE_BATCH = 1_000;

/**
 * Remove the rows owned by a legacy source in bounded statements. A single
 * `delete from dictionaries` asks SQLite to cascade through hundreds of
 * thousands of headwords without returning to JavaScript, which makes the
 * utility-process cancel marker impossible to observe during a rebuild.
 *
 * This still runs inside the caller's replacement transaction. Cancellation
 * throws, so every completed batch is rolled back and the old source remains
 * byte-for-byte queryable.
 */
function deleteLegacySourceRows(db: SqliteDb, dictId: string, shouldCancel?: () => boolean): void {
  const exists = db.prepare('select 1 as present from dictionaries where id = ?').get(dictId);
  if (!exists) return;

  const checkCancelled = (): void => {
    if (shouldCancel?.()) throw new LegacyMigrationCancelled();
  };
  const deleteBatch = (sql: string, value: string): void => {
    const statement = db.prepare(sql);
    let changes: number;
    do {
      checkCancelled();
      const result = statement.run(value);
      changes = result.changes;
      checkCancelled();
    } while (changes === LEGACY_DELETE_BATCH);
  };

  deleteBatch(
    `delete from headwords where id in (
       select id from headwords where dict_id = ? limit ${LEGACY_DELETE_BATCH}
     )`,
    dictId,
  );
  deleteBatch(
    `delete from pitch where rowid in (
       select rowid from pitch where dict_id = ? limit ${LEGACY_DELETE_BATCH}
     )`,
    dictId,
  );
  deleteBatch(
    `delete from freq_corpora where rowid in (
       select rowid from freq_corpora where corpus = ? limit ${LEGACY_DELETE_BATCH}
     )`,
    dictId,
  );
  db.prepare('delete from dictionaries where id = ?').run(dictId);
  checkCancelled();
}

export function importLegacyIndex(
  db: SqliteDb,
  index: LegacyDictIndex,
  shouldCancel?: () => boolean,
): ImportedCounts {
  const info = index.info;
  const dictId = info.id;
  const glossLangs = glossLangsOf(info);
  const glossLang = glossLangs[0] ?? 'en';
  // Every row this import writes carries the same source language, so the
  // dictionary's own `source_lang` can never disagree with the headwords it owns —
  // `dict_pair_priority` joins the two together (`pp.source_lang = h.lang`) and a
  // disagreement makes a pair override silently stop applying.
  const sourceLang = sourceLangOf(info);
  const provenance = BUNDLED_LEGACY_PROVENANCE[dictId];
  const kind = legacyKindOf(info);
  const counts: ImportedCounts = { dictId, headwords: 0, senses: 0, glosses: 0, pitch: 0, freq: 0 };

  const run = db.transaction(() => {
    deleteLegacySourceRows(db, dictId, shouldCancel);
    db.prepare(`
      insert into dictionaries (id, title, revision, source_lang, target_langs, priority,
                                enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      dictId,
      info.title,
      info.revision ?? '',
      sourceLang,
      // The same resolution the gloss rows use, so `target_langs` can never
      // advertise a language the glosses were not written under.
      (glossLangs.length ? glossLangs : [glossLang]).join(','),
      info.priority ?? 0,
      info.enabled === false ? 0 : 1,
      kind,
      provenance?.licence ?? null,
      provenance?.attribution ?? null,
      info.importedAt ?? 0,
    );

    const insertHeadword = db.prepare(`
      insert into headwords (dict_id, lang, text, norm, reading, reading_norm, score)
      values (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSense = db.prepare('insert into senses (headword_id, ord, pos, tags) values (?, ?, ?, ?)');
    const insertGloss = db.prepare('insert into glosses (sense_id, lang, text, html, ord) values (?, ?, ?, ?, ?)');

    for (const [norm, entries] of Object.entries(index.terms ?? {})) {
      for (const entry of entries) {
        if (shouldCancel?.()) throw new LegacyMigrationCancelled();
        const headwordId = Number(
          insertHeadword.run(
            dictId,
            sourceLang,
            entry.word,
            norm,
            entry.reading ?? '',
            entry.reading ?? '',
            entry.score ?? 0,
          ).lastInsertRowid,
        );
        counts.headwords += 1;

        entry.senses.forEach((sense, senseOrd) => {
          const senseId = Number(
            insertSense.run(
              headwordId,
              senseOrd,
              (sense.partsOfSpeech ?? []).join(','),
              (sense.tags ?? []).join(','),
            ).lastInsertRowid,
          );
          counts.senses += 1;
          // The structured HTML belongs to the entry, not to one definition, so it
          // rides on the first gloss of the first sense — the only place a reader
          // can find it again without a second table.
          const html = senseOrd === 0 ? entry.glossaryHtml ?? null : null;
          (sense.definitions ?? []).forEach((definition, glossOrd) => {
            insertGloss.run(senseId, glossLang, definition, glossOrd === 0 ? html : null, glossOrd);
            counts.glosses += 1;
          });
        });
      }
    }

    const insertPitch = db.prepare(`
      insert or replace into pitch (dict_id, lang, norm, reading, positions)
      values (?, ?, ?, ?, ?)
    `);
    for (const [key, value] of Object.entries(index.pitch ?? {})) {
      if (shouldCancel?.()) throw new LegacyMigrationCancelled();
      const [term] = key.split(LEGACY_KEY_SEP);
      insertPitch.run(dictId, sourceLang, term, value.reading ?? '', (value.positions ?? []).join(','));
      counts.pitch += 1;
    }

    const insertFreq = db.prepare(`
      insert into freq_corpora (lang, norm, corpus, rank, per_million)
      values (?, ?, ?, ?, null)
    `);
    for (const [key, rank] of Object.entries(index.freq ?? {})) {
      if (shouldCancel?.()) throw new LegacyMigrationCancelled();
      const [term] = key.split(LEGACY_KEY_SEP);
      insertFreq.run(sourceLang, term, dictId, rank);
      counts.freq += 1;
    }

    db.prepare('update dictionaries set entry_count = ? where id = ?')
      .run(legacyEntryCount(kind, counts), dictId);
  });

  run();
  return counts;
}

/**
 * Reads a migrated dictionary back in the legacy shape.
 *
 * This exists so the parity test can be a literal round trip — JSON in, the same
 * objects out — rather than a hand-written comparison that agrees with whatever the
 * migration happened to do. Phase 3's lookup service will not use it.
 */
export function readMigratedEntries(db: SqliteDb, dictId: string, norm: string): LegacyGlossaryEntry[] {
  const heads = db
    .prepare('select id, text, reading, score from headwords where dict_id = ? and norm = ? order by id')
    .all(dictId, norm) as { id: number; text: string; reading: string; score: number }[];

  return heads.map((head) => {
    const senses = db
      .prepare('select id, pos, tags from senses where headword_id = ? order by ord, id')
      .all(head.id) as { id: number; pos: string | null; tags: string | null }[];
    const glossaryHtml = db
      .prepare(`
        select g.html as html from glosses g
        join senses s on s.id = g.sense_id
        where s.headword_id = ? and g.html is not null
        order by s.ord, g.ord limit 1
      `)
      .get(head.id) as { html: string } | undefined;

    return {
      word: head.text,
      reading: head.reading,
      score: head.score,
      senses: senses.map((sense) => ({
        partsOfSpeech: sense.pos ? sense.pos.split(',') : [],
        definitions: (db
          .prepare('select text from glosses where sense_id = ? order by ord, id')
          .all(sense.id) as { text: string }[]).map((row) => row.text),
        tags: sense.tags ? sense.tags.split(',') : [],
      })),
      ...(glossaryHtml ? { glossaryHtml: glossaryHtml.html } : {}),
    };
  });
}

/** `userData/yomitan` — where the legacy stores live. */
export function legacyYomitanRoot(userDataDir: string): string {
  return path.join(userDataDir, 'yomitan');
}

/**
 * Migrates every `userData/yomitan/<id>/index.json` found under `root`.
 *
 * Returns what landed and what did not. It never throws for a bad store: one
 * corrupt file must not block the other dictionaries, and the caller needs the
 * list to tell the user which one to re-import.
 */
export function migrateLegacyYomitanStores(
  db: SqliteDb,
  root: string,
  onProgress?: (progress: MigrationProgress) => void,
  shouldCancel?: () => boolean,
): MigrationResult {
  const result: MigrationResult = { imported: [], skipped: [] };
  if (!fs.existsSync(root)) return result;

  const dirs = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  dirs.forEach((dirName, position) => {
    // Cancellation is per store, not per row: each store is its own transaction,
    // so the honest stopping point is a whole-dictionary boundary. The stores
    // already imported stay — `result.imported` says exactly which.
    if (result.cancelled || shouldCancel?.()) {
      result.cancelled = true;
      return;
    }
    const file = path.join(root, dirName, 'index.json');
    if (!fs.existsSync(file)) {
      result.skipped.push({ dictId: dirName, reason: 'no index.json' });
      return;
    }
    let parsed: LegacyDictIndex;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as LegacyDictIndex;
    } catch (err) {
      result.skipped.push({ dictId: dirName, reason: `unreadable index.json: ${(err as Error).message}` });
      return;
    }
    if (!parsed?.info?.id) {
      result.skipped.push({ dictId: dirName, reason: 'index.json has no info.id' });
      return;
    }
    onProgress?.({ current: position + 1, total: dirs.length, dictId: parsed.info.id, title: parsed.info.title });
    try {
      const counts = importLegacyIndex(db, parsed, shouldCancel);
      const bytes = fs.statSync(file).size;
      db.prepare('update dictionaries set bytes = ? where id = ?').run(bytes, parsed.info.id);
      result.imported.push(counts);
    } catch (err) {
      if (err instanceof LegacyMigrationCancelled) {
        result.cancelled = true;
        return;
      }
      result.skipped.push({ dictId: parsed.info.id, reason: `import failed: ${(err as Error).message}` });
    }
  });

  return result;
}

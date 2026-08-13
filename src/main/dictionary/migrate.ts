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

/** The gloss language a dictionary's definitions are written in. */
export function glossLangOf(info: YomitanDictInfo): string {
  const override = info.glossLangOverride?.trim();
  if (override) return override;
  const detected = info.glossLangs?.find((lang) => typeof lang === 'string' && lang.trim());
  return detected?.trim() || 'en';
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
export function importLegacyIndex(db: SqliteDb, index: LegacyDictIndex): ImportedCounts {
  const info = index.info;
  const dictId = info.id;
  const glossLang = glossLangOf(info);
  const provenance = BUNDLED_LEGACY_PROVENANCE[dictId];
  const counts: ImportedCounts = { dictId, headwords: 0, senses: 0, glosses: 0, pitch: 0, freq: 0 };

  const run = db.transaction(() => {
    db.prepare('delete from dictionaries where id = ?').run(dictId);
    db.prepare(`
      insert into dictionaries (id, title, revision, source_lang, target_langs, priority,
                                enabled, kind, licence, attribution, entry_count, bytes, imported_at)
      values (?, ?, ?, 'ja', ?, ?, ?, ?, ?, ?, 0, 0, ?)
    `).run(
      dictId,
      info.title,
      info.revision ?? '',
      (info.glossLangs ?? [glossLang]).join(','),
      info.priority ?? 0,
      info.enabled === false ? 0 : 1,
      info.hasTerms ? 'term' : info.hasPitch ? 'pitch' : 'freq',
      provenance?.licence ?? null,
      provenance?.attribution ?? null,
      info.importedAt ?? 0,
    );

    const insertHeadword = db.prepare(`
      insert into headwords (dict_id, lang, text, norm, reading, reading_norm, score)
      values (?, 'ja', ?, ?, ?, ?, ?)
    `);
    const insertSense = db.prepare('insert into senses (headword_id, ord, pos, tags) values (?, ?, ?, ?)');
    const insertGloss = db.prepare('insert into glosses (sense_id, lang, text, html, ord) values (?, ?, ?, ?, ?)');

    for (const [norm, entries] of Object.entries(index.terms ?? {})) {
      for (const entry of entries) {
        const headwordId = Number(
          insertHeadword.run(
            dictId,
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
      values (?, 'ja', ?, ?, ?)
    `);
    for (const [key, value] of Object.entries(index.pitch ?? {})) {
      const [term] = key.split(LEGACY_KEY_SEP);
      insertPitch.run(dictId, term, value.reading ?? '', (value.positions ?? []).join(','));
      counts.pitch += 1;
    }

    const insertFreq = db.prepare(`
      insert into freq_corpora (lang, norm, corpus, rank, per_million)
      values ('ja', ?, ?, ?, null)
    `);
    for (const [key, rank] of Object.entries(index.freq ?? {})) {
      const [term] = key.split(LEGACY_KEY_SEP);
      insertFreq.run(term, dictId, rank);
      counts.freq += 1;
    }

    db.prepare('update dictionaries set entry_count = ? where id = ?').run(counts.headwords, dictId);
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
      const counts = importLegacyIndex(db, parsed);
      const bytes = fs.statSync(file).size;
      db.prepare('update dictionaries set bytes = ? where id = ?').run(bytes, parsed.info.id);
      result.imported.push(counts);
    } catch (err) {
      result.skipped.push({ dictId: parsed.info.id, reason: `import failed: ${(err as Error).message}` });
    }
  });

  return result;
}

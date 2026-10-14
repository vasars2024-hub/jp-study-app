// The electron-free .apkg readers behind "import as cards" and the Level
// Meter's word list — the two reads that used to run inline on Electron's main
// loop (round-2 audit F, Anki item 13).
//
// Moved out of `apkgImport.ts` for the reason `apkgCollection.ts` was: that
// file imports `ipcMain`/`dialog`, so nothing in it can run in the utility
// process (`apkgReadWorker.ts`) where a large deck's zip + sql.js parse belongs.
// The same functions are the in-process fallback, so the two paths cannot drift.
//
// Also new here: the card read keeps what the old one silently dropped where
// the local deck has room for it — each note's first card's schedule (for the
// local SRS), its first cited audio and image (stored as managed media) — and
// counts everything it could not keep, so the renderer can say exactly what
// did not come across.
//
// And the two things an Anki user's history is made of beyond the schedule:
// each first card's review log (`revlog`), which the renderer merges into the
// local review log so Statistics, the optimiser and the memory replay see the
// years of answers behind an imported card, and the FSRS parameters of the
// deck options those cards were studied under, which Settings offers to adopt.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import AdmZip from 'adm-zip';
import type { Database } from 'sql.js';
import {
  extractExpressions,
  looksLikeUpgradeStub,
  modelsFromNormalizedRows,
  parseModels,
  type ApkgImportResult,
} from '../../shared/apkgParse';
import {
  ankiScheduleToLocalSrs,
  notesToCards,
  pickAnkiFsrsWeights,
  type AnkiCardSchedule,
  type AnkiRevlogRow,
  type ApkgCardsResult,
  type ApkgFsrsSettings,
  type RawNote,
} from '../../shared/apkgCards';
import { decodeDeckConfigFsrs, decodeNormalDeckKind, type AnkiDeckConfigFsrs } from './ankiProtoConfig';
import { COMPRESSED_HELP, getSql, readCollection, readMediaManifest } from './apkgCollection';
import { MINED_MEDIA_EXTENSIONS, writeMinedMediaBytes } from '../minedMediaStore';

/**
 * Largest package either reader opens. AdmZip holds the whole file and sql.js
 * the whole collection in memory; past this a deck is refused by name instead
 * of taking the app down. Anki's own shared decks top out far below it.
 */
export const APKG_IMPORT_MAX_BYTES = 1024 * 1024 * 1024;

export type ApkgReadProgress = (stage: 'notes' | 'media', done: number, total: number) => void;

function checkSize(filePath: string): void {
  const size = fs.statSync(filePath).size;
  if (size > APKG_IMPORT_MAX_BYTES) throw new Error(`file-too-large:${size}:${APKG_IMPORT_MAX_BYTES}`);
}

/**
 * Note types, from whichever schema this collection uses.
 *
 * Shared by the card importer and the level-meter path so both resolve fields
 * identically — two copies of this ladder would drift, and the failure mode is
 * silent (a wrong field imported as the studied word).
 *
 * The legacy `col.models` blob first, then the normalized `notetypes`/`fields`
 * tables — chosen on whether models were actually FOUND, not on whether the
 * column looked non-blank: `'{}'` parses to an empty map, and with no models no
 * field matches by name and the importer mines a positional guess (audit F10).
 */
function readModels(db: Database): ReturnType<typeof parseModels> {
  const readNormalizedModels = () => {
    const normalized = db.exec(`
      SELECT n.id, n.name, f.ord, f.name
      FROM notetypes n
      JOIN fields f ON f.ntid = n.id
      ORDER BY n.id, f.ord
    `);
    const rows = normalized[0]?.values ?? [];
    return modelsFromNormalizedRows(rows.map((row) => ({
      mid: String(row[0]),
      modelName: String(row[1] ?? ''),
      ord: Number(row[2] ?? 0),
      fieldName: String(row[3] ?? ''),
    })));
  };

  const modelsRes = db.exec('SELECT models FROM col LIMIT 1');
  const modelsJson = (modelsRes[0]?.values?.[0]?.[0] as string | undefined) ?? '';
  let models: ReturnType<typeof parseModels> = {};
  if (modelsJson.trim()) {
    try {
      models = parseModels(modelsJson);
    } catch {
      models = {};
    }
  }
  if (Object.keys(models).length === 0) models = readNormalizedModels();
  return models;
}

/** Read (mid, flds) note rows out of an open collection, for the Level Meter. */
export function readNotes(db: Database): ApkgImportResult {
  const models = readModels(db);
  const notesRes = db.exec('SELECT mid, flds FROM notes');
  const rows = notesRes[0]?.values ?? [];
  const notes = rows.map((r) => ({ mid: String(r[0]), flds: String(r[1] ?? '') }));
  const { expressions, noteCount } = extractExpressions(notes, models);
  // If we somehow read the legacy decoy, say so rather than importing its
  // single "upgrade Anki" note as vocabulary.
  if (looksLikeUpgradeStub(expressions, noteCount)) throw new Error(COMPRESSED_HELP);
  return { ok: true, expressions, noteCount };
}

/**
 * Deck id -> deck name, from either schema. A deck name is a nicety for
 * grouping, so every failure here degrades to "no deck name".
 */
function readDeckNames(db: Database): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const res = db.exec('SELECT id, name FROM decks');
    for (const row of res[0]?.values ?? []) out.set(String(row[0]), String(row[1] ?? ''));
    if (out.size) return out;
  } catch {
    /* no normalized decks table — try the legacy blob */
  }
  try {
    const res = db.exec('SELECT decks FROM col LIMIT 1');
    const raw = res[0]?.values?.[0]?.[0];
    if (typeof raw === 'string' && raw.trim()) {
      const parsed = JSON.parse(raw) as Record<string, { name?: unknown }>;
      for (const [id, deck] of Object.entries(parsed)) {
        if (typeof deck?.name === 'string') out.set(id, deck.name);
      }
    }
  } catch {
    /* leave the map empty */
  }
  return out;
}

function collectionCreated(db: Database): number {
  try {
    const res = db.exec('SELECT crt FROM col LIMIT 1');
    const crt = Number(res[0]?.values?.[0]?.[0]);
    return Number.isFinite(crt) && crt > 0 ? crt : 0;
  } catch {
    return 0;
  }
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The review log of the given cards, oldest first per card. A collection
 * without a `revlog` table (hand-built, or a stripped shared deck) has no
 * history, which is an answer, not an error.
 */
function readRevlog(db: Database, cardIds: ReadonlySet<number>): Map<number, AnkiRevlogRow[]> {
  const out = new Map<number, AnkiRevlogRow[]>();
  if (!cardIds.size) return out;
  let rows: unknown[][] = [];
  try {
    rows = db.exec('SELECT id, cid, ease, ivl, lastIvl, factor, time, type FROM revlog ORDER BY id')[0]?.values ?? [];
  } catch {
    return out;
  }
  for (const r of rows) {
    const cid = num(r[1]);
    if (!cardIds.has(cid)) continue;
    const row: AnkiRevlogRow = {
      id: num(r[0]),
      ease: num(r[2]),
      ivl: num(r[3]),
      lastIvl: num(r[4]),
      factor: num(r[5]),
      time: num(r[6]),
      type: num(r[7]),
    };
    const list = out.get(cid);
    if (list) list.push(row);
    else out.set(cid, [row]);
  }
  return out;
}

/** Every options preset in the collection, by id: schema 18's table, else schema 11's JSON. */
function readDeckConfigs(db: Database): Map<number, AnkiDeckConfigFsrs & { name?: string }> {
  const out = new Map<number, AnkiDeckConfigFsrs & { name?: string }>();
  try {
    for (const row of db.exec('SELECT id, name, config FROM deck_config')[0]?.values ?? []) {
      const decoded = decodeDeckConfigFsrs(row[2]);
      if (decoded) out.set(num(row[0]), { ...decoded, ...(typeof row[1] === 'string' && row[1] ? { name: row[1] } : {}) });
    }
    if (out.size) return out;
  } catch {
    /* no schema-18 table — try the legacy JSON */
  }
  try {
    const raw = db.exec('SELECT dconf FROM col LIMIT 1')[0]?.values?.[0]?.[0];
    if (typeof raw !== 'string' || !raw.trim()) return out;
    const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
    // A value that is not a number (a NaN written out as null) is not a parameter: NaN, refused later.
    const floats = (value: unknown): number[] => (Array.isArray(value) ? value.map((v) => (typeof v === 'number' ? v : Number.NaN)) : []);
    for (const [id, conf] of Object.entries(parsed)) {
      const retention = Number(conf?.desiredRetention);
      const maximum = Number((conf?.rev as { maxIvl?: unknown } | undefined)?.maxIvl);
      out.set(Number(id), {
        // Anki's schema-11 names (`DeckConfSchema11`): `fsrsWeights` is FSRS-4.5's.
        params6: floats(conf?.fsrsParams6),
        params5: floats(conf?.fsrsParams5),
        ...(Number.isFinite(retention) && retention > 0 ? { desiredRetention: retention } : {}),
        ...(Number.isFinite(maximum) && maximum > 0 ? { maximumReviewInterval: Math.floor(maximum) } : {}),
        ...(typeof conf?.name === 'string' && conf.name ? { name: conf.name } : {}),
      });
    }
  } catch {
    /* leave the map empty */
  }
  return out;
}

/** Deck id -> its options preset id and per-deck retention override, from either schema. */
function readDeckConfigIds(db: Database): Map<number, { configId: number; desiredRetention?: number }> {
  const out = new Map<number, { configId: number; desiredRetention?: number }>();
  try {
    for (const row of db.exec('SELECT id, kind FROM decks')[0]?.values ?? []) {
      const kind = decodeNormalDeckKind(row[1]);
      if (kind) out.set(num(row[0]), kind);
    }
    if (out.size) return out;
  } catch {
    /* no schema-18 decks table — try the legacy JSON */
  }
  try {
    const raw = db.exec('SELECT decks FROM col LIMIT 1')[0]?.values?.[0]?.[0];
    if (typeof raw !== 'string' || !raw.trim()) return out;
    const parsed = JSON.parse(raw) as Record<string, { conf?: unknown; dyn?: unknown }>;
    for (const [id, deck] of Object.entries(parsed)) {
      const conf = Number(deck?.conf);
      if (!deck?.dyn && Number.isFinite(conf)) out.set(Number(id), { configId: conf });
    }
  } catch {
    /* leave the map empty */
  }
  return out;
}

/**
 * The FSRS parameters the imported cards were studied under: the options
 * preset of the deck holding most of them, when Anki had parameters for it (a
 * preset never optimised, or a collection on SM-2, has none and yields
 * nothing). Never throws: a collection this cannot read simply has no
 * parameters to offer.
 */
function readFsrsSettings(
  db: Database,
  deckCounts: ReadonlyMap<number, number>,
  deckNames: ReadonlyMap<string, string>,
): ApkgFsrsSettings | undefined {
  try {
    const top = [...deckCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (!top) return undefined;
    const deck = readDeckConfigIds(db).get(top[0]);
    const configs = readDeckConfigs(db);
    const config = configs.get(deck?.configId ?? 1);
    if (!config) return undefined;
    const weights = pickAnkiFsrsWeights(config.params6, config.params5);
    if (!weights) return undefined;
    const retention = deck?.desiredRetention ?? config.desiredRetention;
    const deckName = deckNames.get(String(top[0]));
    return {
      weights,
      ...(retention !== undefined && retention >= 0.5 && retention < 1 ? { desiredRetention: Math.round(retention * 1000) / 1000 } : {}),
      ...(config.maximumReviewInterval ? { maximumIntervalDays: config.maximumReviewInterval } : {}),
      ...(config.name ? { presetName: config.name } : {}),
      ...(deckName ? { deckName } : {}),
    };
  } catch {
    return undefined;
  }
}

/**
 * Whole notes — expression, reading, meaning, sentence, deck, tags, media refs
 * and the first card's schedule. The deck and schedule come from the note's
 * first card (by card id), which matches how Anki's browser files a note.
 */
export function readCards(db: Database, nowMs = Date.now()): ApkgCardsResult {
  const models = readModels(db);
  const deckNames = readDeckNames(db);
  const crt = collectionCreated(db);

  let rows: unknown[][] = [];
  let withSchedule = true;
  const scheduleQuery = (columns: string) => db.exec(`
      SELECT n.mid, n.flds, n.tags, c.did, c.type, c.queue, c.due, c.ivl, c.factor, c.reps, c.lapses, c.id${columns}
      FROM notes n
      LEFT JOIN cards c ON c.id = (SELECT MIN(c2.id) FROM cards c2 WHERE c2.nid = n.id)
    `);
  try {
    // `c.data` carries Anki's FSRS memory state; a hand-built collection may lack the column.
    let res;
    try {
      res = scheduleQuery(', c.data');
    } catch {
      res = scheduleQuery('');
    }
    rows = res[0]?.values ?? [];
  } catch {
    // No cards table (or an unexpected shape) — fall back to notes alone.
    withSchedule = false;
    const res = db.exec('SELECT mid, flds, tags FROM notes');
    rows = res[0]?.values ?? [];
  }

  const firstCardIds = new Set<number>();
  const deckCounts = new Map<number, number>();
  if (withSchedule) {
    for (const r of rows) {
      if (r[11] != null) firstCardIds.add(num(r[11]));
      if (r[3] != null) deckCounts.set(num(r[3]), (deckCounts.get(num(r[3])) ?? 0) + 1);
    }
  }
  const revlog = readRevlog(db, firstCardIds);

  const notes: RawNote[] = rows.map((r) => {
    const schedule: AnkiCardSchedule | undefined =
      withSchedule && r[4] != null
        ? {
            type: num(r[4]),
            queue: num(r[5]),
            due: num(r[6]),
            ivl: num(r[7]),
            factor: num(r[8]),
            reps: num(r[9]),
            lapses: num(r[10]),
            ...(typeof r[12] === 'string' && r[12] ? { data: r[12] } : {}),
          }
        : undefined;
    const ankiCardId = withSchedule && r[11] != null ? num(r[11]) : undefined;
    const history = ankiCardId !== undefined ? revlog.get(ankiCardId) : undefined;
    return {
      mid: String(r[0]),
      flds: String(r[1] ?? ''),
      tags: typeof r[2] === 'string' ? r[2] : undefined,
      deck: withSchedule && r[3] != null ? deckNames.get(String(r[3])) : undefined,
      ...(schedule ? { schedule } : {}),
      ...(ankiCardId !== undefined ? { ankiCardId } : {}),
      ...(history?.length ? { history } : {}),
    };
  });

  const { cards, noteCount, report } = notesToCards(notes, models);
  // Same decoy guard as the level path: a modern .apkg carries a legacy
  // `collection.anki2` holding one "please upgrade" note.
  if (looksLikeUpgradeStub(cards.map((c) => c.word), noteCount)) throw new Error(COMPRESSED_HELP);

  for (const card of cards) {
    const srs = crt ? ankiScheduleToLocalSrs(card.schedule, crt, nowMs) : undefined;
    if (srs) {
      card.srs = srs;
      report.scheduledCards += 1;
    }
    delete card.schedule;
    report.historyReviews += card.history?.filter((row) => row.ease >= 1 && row.ease <= 4 && row.type < 4).length ?? 0;
  }
  const fsrs = withSchedule ? readFsrsSettings(db, deckCounts, deckNames) : undefined;
  return { ok: true, cards, noteCount, report, ...(fsrs ? { fsrs } : {}) };
}

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];

function entryBytes(zip: AdmZip, key: string): Buffer | null {
  const data = zip.getEntry(key)?.getData() ?? null;
  if (!data) return null;
  // Newer packages store each media file zstd-compressed.
  if (data.length >= 4 && ZSTD_MAGIC.every((b, i) => data[i] === b)) {
    const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer }).zstdDecompressSync;
    if (typeof zstd !== 'function') return null;
    try {
      return zstd(data);
    } catch {
      return null;
    }
  }
  return data;
}

/**
 * Store each card's first cited audio and first cited image as managed media
 * and point the card at them. Everything else a note cites is counted as
 * skipped (the local card holds one of each) or missing (not in the package).
 */
function keepMedia(
  zip: AdmZip,
  result: ApkgCardsResult,
  mediaDir: string,
  onProgress?: ApkgReadProgress,
): void {
  const cards = result.cards ?? [];
  const report = result.report;
  if (!report) return;
  const cited = cards.some((c) => c.audioRefs?.length || c.imageRefs?.length);
  if (!cited) return;
  const manifest = readMediaManifest(zip);
  if (!manifest) {
    report.mediaUnreadable = true;
    for (const card of cards) {
      report.mediaSkipped += (card.audioRefs?.length ?? 0) + (card.imageRefs?.length ?? 0);
      delete card.audioRefs;
      delete card.imageRefs;
    }
    return;
  }
  const byName = new Map<string, string>();
  for (const [key, name] of manifest) byName.set(name, key);
  const stored = new Map<string, string | null>();
  const store = (name: string): string | null | undefined => {
    if (stored.has(name)) return stored.get(name);
    const key = byName.get(name);
    if (key === undefined) return undefined;
    const ext = path.extname(name).toLowerCase();
    let out: string | null = null;
    if (MINED_MEDIA_EXTENSIONS.has(ext)) {
      const bytes = entryBytes(zip, key);
      if (bytes) {
        const res = writeMinedMediaBytes(mediaDir, bytes, ext);
        out = res.ok && res.path ? res.path : null;
      }
    }
    stored.set(name, out);
    return out;
  };
  cards.forEach((card, index) => {
    const take = (refs: string[] | undefined): string | undefined => {
      let kept: string | undefined;
      for (const name of refs ?? []) {
        if (kept) {
          report.mediaSkipped += 1;
          continue;
        }
        const res = store(name);
        if (res === undefined) report.mediaMissing += 1;
        else if (res === null) report.mediaSkipped += 1;
        else {
          kept = res;
          report.mediaKept += 1;
        }
      }
      return kept;
    };
    const audio = take(card.audioRefs);
    const image = take(card.imageRefs);
    if (audio) card.audioPath = audio;
    if (image) card.imagePath = image;
    delete card.audioRefs;
    delete card.imageRefs;
    if (onProgress && (index % 200 === 199 || index === cards.length - 1)) {
      onProgress('media', index + 1, cards.length);
    }
  });
}

async function withCollection<T>(filePath: string, read: (db: Database, zip: AdmZip) => T): Promise<T> {
  checkSize(filePath);
  const zip = new AdmZip(filePath);
  const { bytes } = readCollection(zip);
  const SQL = await getSql();
  const db = new SQL.Database(bytes);
  try {
    return read(db, zip);
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
}

/** The Level Meter's read: every note's expression. */
export async function readApkgWordsFile(filePath: string): Promise<ApkgImportResult> {
  try {
    const result = await withCollection(filePath, (db) => readNotes(db));
    return { ...result, fileName: path.basename(filePath) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** The card import's read. `mediaDir` absent: media refs are counted, not stored. */
export async function readApkgCardsFile(
  filePath: string,
  opts: { mediaDir?: string; onProgress?: ApkgReadProgress; nowMs?: number } = {},
): Promise<ApkgCardsResult> {
  try {
    const result = await withCollection(filePath, (db, zip) => {
      const read = readCards(db, opts.nowMs);
      opts.onProgress?.('notes', read.cards?.length ?? 0, read.cards?.length ?? 0);
      if (opts.mediaDir) keepMedia(zip, read, opts.mediaDir, opts.onProgress);
      else if (read.report) {
        for (const card of read.cards ?? []) {
          read.report.mediaSkipped += (card.audioRefs?.length ?? 0) + (card.imageRefs?.length ?? 0);
          delete card.audioRefs;
          delete card.imageRefs;
        }
      }
      return read;
    });
    return { ...result, fileName: path.basename(filePath) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

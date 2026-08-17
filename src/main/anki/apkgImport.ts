// Import an Anki .apkg / .colpkg deck and extract its studied words (Plan 0.5,
// Level Meter). An .apkg is a zip whose SQLite collection (collection.anki21 /
// .anki2, or the newer zstd-compressed .anki21b) holds the notes. We read it
// here in the MAIN process — off the renderer's UI thread, and reusing adm-zip
// plus the shared field heuristics — then hand the raw expressions to the
// renderer, which lemmatizes + dedupes them against kuromoji.
//
// The pure parsing (HTML/furigana stripping, field selection) lives in
// src/shared/apkgParse.ts so it is unit-testable; this file is the I/O shell.

import { ipcMain, dialog, BrowserWindow } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { Database, SqlJsStatic } from 'sql.js';
import {
  extractExpressions,
  looksLikeUpgradeStub,
  modelsFromNormalizedRows,
  parseModels,
  stripFieldHtml,
  type ApkgImportResult,
} from '../../shared/apkgParse';
import { notesToCards, type ApkgCardsResult, type RawNote } from '../../shared/apkgCards';
import {
  ANKI_DRAFT_PAGE_SIZE,
  buildAnkiDraft,
  pageAnkiDraft,
  type ApkgDraftRequest,
  type ApkgDraftResult,
  type RawAnkiMediaEntry,
} from '../../shared/ankiDraft';
import type { CsvDraftRequest } from '../../shared/ankiCsv';
import type { ConnectDraftRequest } from '../../shared/ankiConnectDraft';
import { readRawCollection } from './apkgDraftRead';
import { readCsvDraft } from './csvDraftRead';
import { readConnectDraft } from './connectDraftRead';
import { commitConnectDraft } from './connectCommit';
import type { ConnectCommitRequest } from '../../shared/ankiConnectCommit';
import {
  beginDraftSession,
  cancelDraftSession,
  deleteDraftSession,
  failDraftSession,
  getDraftSession,
  recordDraftSessionPage,
  resumeDraftSession,
  summarizeDraftSessions,
  type BeginDraftSessionRequest,
} from './draftSessionStore';
import type { DraftSessionPageReport } from '../../shared/ankiDraftSession';
import { decodeMediaManifestNames } from './ankiProtoConfig';
import { exportApkg, rememberApkgSource } from './apkgExport';
import type { ApkgExportRequest } from '../../shared/ankiApkgExport';
import { mt } from '../i18n';

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
}

/** The deck file dialog, shared by all three readers so their filters cannot drift. */
async function pickDeckFile(filePath?: string): Promise<string | null> {
  if (filePath) return filePath;
  const win = focusedWindow();
  const opts = {
    title: mt('dialog.importAnkiDeck.title'),
    filters: [{ name: mt('dialog.filter.ankiDeck'), extensions: ['apkg', 'colpkg'] }],
    properties: ['openFile' as const],
  };
  const picked = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
  if (picked.canceled || !picked.filePaths[0]) return null;
  return picked.filePaths[0];
}

// ----- sql.js (cached across imports) ----------------------------------------

// The forge main build emits ESM, so __filename/require are unavailable —
// derive a require from import.meta.url (same pattern as readabilityExtract.ts).
const nodeRequire = createRequire(import.meta.url);
let sqlPromise: Promise<SqlJsStatic> | null = null;

function sqlWasmBinary(): Buffer {
  // sql.js is external (required from node_modules at runtime), so its .wasm
  // sits next to its dist entry. Read the bytes directly rather than relying on
  // emscripten's locateFile URL resolution (which is browser-oriented).
  let wasmPath: string;
  try {
    wasmPath = nodeRequire.resolve('sql.js/dist/sql-wasm.wasm');
  } catch {
    wasmPath = path.join(path.dirname(nodeRequire.resolve('sql.js')), 'sql-wasm.wasm');
  }
  return fs.readFileSync(wasmPath);
}

export function getSql(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    const initSqlJs = nodeRequire('sql.js') as (config?: {
      wasmBinary?: Uint8Array;
    }) => Promise<SqlJsStatic>;
    sqlPromise = initSqlJs({ wasmBinary: sqlWasmBinary() }).catch((err) => {
      sqlPromise = null; // let a later import retry
      throw err;
    });
  }
  return sqlPromise;
}

// ----- collection extraction --------------------------------------------------

const COMPRESSED_HELP =
  'This deck uses Anki’s newer compressed format. In Anki, open File → Export, choose "Anki Deck Package (*.apkg)", CHECK "Support older Anki versions", export, and import that file instead.';

/**
 * Return the raw SQLite bytes for the collection, decompressing zstd if needed.
 *
 * Order matters, and getting it wrong is silent. A modern Anki export contains
 * BOTH the real collection (`collection.anki21b`, zstd) and a decoy
 * `collection.anki2` — a valid SQLite file holding a single note that says
 * "please upgrade Anki", there so old clients show a message instead of
 * crashing. Reading the decoy first "succeeds" and imports exactly one word,
 * which is what "1 cards → 1 words" was. Always try newest → oldest.
 */
export function readCollection(zip: AdmZip): { bytes: Uint8Array; entryName: string } {
  const get = (name: string): Buffer | null => zip.getEntry(name)?.getData() ?? null;

  const compressed = get('collection.anki21b');
  if (compressed) {
    // node:zlib gained zstd support in newer Node; Electron's bundled Node may
    // not have it. Degrade with a clear instruction, never a silent failure.
    const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer })
      .zstdDecompressSync;
    if (typeof zstd !== 'function') throw new Error(COMPRESSED_HELP);
    try {
      return { bytes: zstd(compressed), entryName: 'collection.anki21b' };
    } catch {
      throw new Error(COMPRESSED_HELP);
    }
  }

  for (const entryName of ['collection.anki21', 'collection.anki2']) {
    const plain = get(entryName);
    if (plain) return { bytes: plain, entryName };
  }

  throw new Error('That file is not an Anki deck (no collection database inside).');
}

function readCollectionBytes(zip: AdmZip): Uint8Array {
  return readCollection(zip).bytes;
}

/**
 * Note types, from whichever schema this collection uses.
 *
 * Extracted so the card importer and the level-meter path resolve fields
 * identically — two copies of this ladder would drift, and the failure mode is
 * silent (a wrong field imported as the studied word).
 */
function readModels(db: Database): ReturnType<typeof parseModels> {
  /*
   * The legacy `col.models` blob, then the normalized `notetypes`/`fields`
   * tables — but the fallback is chosen on whether models were actually
   * FOUND, not on whether the column looked non-blank.
   *
   * A real schema-18 collection stores `col.models = ''`, which is falsy, so
   * the old `modelsJson.trim() ? …` test happened to route those correctly.
   * The narrow door it left open is `'{}'`: non-blank, so it took the legacy
   * branch, parsed to an EMPTY model map, and never looked at the normalized
   * tables at all. With no models, no field can be matched by name against
   * `EXPRESSION_FIELD_RE`, so the importer falls back to a positional guess
   * and silently mines the wrong field — a Reading or a Meaning imported as
   * the studied word, with nothing on screen to say so. Audit F10; the
   * standing claim named the wrong mechanism but the risk is real.
   */
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
  // A malformed blob is the same situation as an empty one: something is there
  // but it yields no models, so ask the tables rather than proceeding blind.
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
function readNotes(db: Database): ApkgImportResult {
  const models = readModels(db);

  const notesRes = db.exec('SELECT mid, flds FROM notes');
  const rows = notesRes[0]?.values ?? [];
  const notes = rows.map((r) => ({ mid: String(r[0]), flds: String(r[1] ?? '') }));

  const { expressions, noteCount } = extractExpressions(notes, models);
  // Belt and braces: if we somehow read the legacy decoy, say so rather than
  // importing its single "upgrade Anki" note as vocabulary.
  if (looksLikeUpgradeStub(expressions, noteCount)) throw new Error(COMPRESSED_HELP);
  return { ok: true, expressions, noteCount };
}

/**
 * Deck id -> deck name, from either schema.
 *
 * Legacy collections keep a `col.decks` JSON blob; schema 18+ has a `decks`
 * table. Both are optional as far as this importer is concerned — a deck name is
 * a nicety for grouping, so every failure here degrades to "no deck name"
 * rather than failing the import.
 */
function readDeckNames(db: Database): Map<string, string> {
  const out = new Map<string, string>();
  try {
    const res = db.exec('SELECT id, name FROM decks');
    for (const row of res[0]?.values ?? []) {
      out.set(String(row[0]), String(row[1] ?? ''));
    }
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

/**
 * Read whole notes — expression, reading, meaning, sentence, deck and tags.
 *
 * Separate from `readNotes` on purpose: that one exists to feed the Level Meter
 * and deliberately reduces a note to one string. Widening it would have made the
 * level-check path carry data it does not use, on decks of 30k notes.
 *
 * The deck name comes from the note's first card. A note with cards in several
 * decks is filed under the first, which matches how Anki's own browser shows it.
 */
function readCards(db: Database): ApkgCardsResult {
  const models = readModels(db);
  const deckNames = readDeckNames(db);

  let rows: unknown[][] = [];
  try {
    // The MIN(c.did) subquery keeps this one row per note.
    const res = db.exec(`
      SELECT n.mid, n.flds, n.tags, (SELECT c.did FROM cards c WHERE c.nid = n.id LIMIT 1)
      FROM notes n
    `);
    rows = res[0]?.values ?? [];
  } catch {
    // No cards table (or an unexpected shape) — fall back to notes alone.
    const res = db.exec('SELECT mid, flds, tags FROM notes');
    rows = res[0]?.values ?? [];
  }

  const notes: RawNote[] = rows.map((r) => ({
    mid: String(r[0]),
    flds: String(r[1] ?? ''),
    tags: typeof r[2] === 'string' ? r[2] : undefined,
    deck: r[3] != null ? deckNames.get(String(r[3])) : undefined,
  }));

  const { cards, noteCount } = notesToCards(notes, models);

  // Same decoy guard as the level path: a modern .apkg carries a legacy
  // `collection.anki2` holding one "please upgrade" note.
  if (looksLikeUpgradeStub(cards.map((c) => c.word), noteCount)) throw new Error(COMPRESSED_HELP);

  return { ok: true, cards, noteCount };
}

async function importApkg(filePath?: string): Promise<ApkgImportResult> {
  const file = await pickDeckFile(filePath);
  if (!file) return { ok: false, error: 'cancelled' };

  let db: Database | null = null;
  try {
    const zip = new AdmZip(file);
    const bytes = readCollectionBytes(zip);
    const SQL = await getSql();
    db = new SQL.Database(bytes);
    const result = readNotes(db);
    return { ...result, fileName: path.basename(file) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * Import a deck as CARDS rather than as a word list.
 *
 * Shares the zip/zstd/sql.js ladder with `importApkg` — the hard,
 * failure-prone part of reading an .apkg is getting to the right collection
 * database, and that had already been solved and hardened here.
 */
async function importApkgCards(filePath?: string): Promise<ApkgCardsResult> {
  const file = await pickDeckFile(filePath);
  if (!file) return { ok: false, error: 'cancelled' };

  let db: Database | null = null;
  try {
    const zip = new AdmZip(file);
    const bytes = readCollectionBytes(zip);
    const SQL = await getSql();
    db = new SQL.Database(bytes);
    const result = readCards(db);
    return { ...result, fileName: path.basename(file) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

/**
 * The manifest as a zip-entry-name -> media-file-name map, or `undefined` when
 * the package cannot say.
 *
 * The legacy `media` entry is a JSON map of `{"0": "cat.jpg"}` — the numeric key
 * IS the file's name inside the zip. The newer zstd package stores the same
 * manifest as a zstd-compressed protobuf, read here through
 * `decodeMediaManifestNames`, where position `i` is the entry named `i`. Only a
 * manifest in neither form returns `undefined`, because the draft reports
 * missing media only when it has something to check against and guessing would
 * accuse a complete deck.
 */
function readMediaManifest(zip: AdmZip): Map<string, string> | undefined {
  const entry = zip.getEntry('media');
  if (!entry) return undefined;
  const raw = entry.getData();
  try {
    const parsed = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    const map = new Map<string, string>();
    // Integer-like keys iterate ascending, so this is manifest order — which is
    // what makes the canonical copy of a duplicate group deterministic.
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') map.set(key, value);
    }
    return map;
  } catch {
    /* not the legacy JSON manifest — try the protobuf one below */
  }

  const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer })
    .zstdDecompressSync;
  if (typeof zstd !== 'function') return undefined;
  try {
    // A package with no media at all decompresses to zero bytes, which decodes
    // to an empty list — the honest "it carries none", not "unknown".
    const names = decodeMediaManifestNames(zstd(raw));
    return names ? new Map(names.map((name, i) => [String(i), name])) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The manifest joined to what the archive actually holds — recipe 11's input.
 *
 * Sizes and checksums come from the zip's **central directory**, so this reads
 * no media bytes at all: the largest package on this machine is 22,168 files /
 * 223.5 MB and decompressing it to size it would be indefensible for a filter.
 * `bytes` is therefore what the file occupies *in the package*, which is also
 * the number a user asking "why is this deck 200 MB" wants.
 *
 * A manifest entry the archive does not hold is dropped rather than reported as
 * an empty file: the package does not carry it, so a note citing it reads
 * `missing`, which is the truth about an archive assembled wrong.
 */
function readMediaEntries(zip: AdmZip): RawAnkiMediaEntry[] | undefined {
  const manifest = readMediaManifest(zip);
  if (!manifest) return undefined;
  const out: RawAnkiMediaEntry[] = [];
  for (const [key, name] of manifest) {
    const stored = zip.getEntry(key);
    if (!stored) continue;
    out.push({ name, bytes: stored.header.size, crc32: stored.header.crc });
  }
  return out;
}

/**
 * Read a deck as a full-fidelity draft — the workbench's reader.
 *
 * Sibling of `importApkg`/`importApkgCards`, sharing their zip/zstd/sql.js
 * ladder. It differs in what it keeps: everything, per `shared/ankiDraft.ts`.
 * The response is one PAGE of notes, because the whole point of a workbench is
 * decks too large to hand across IPC in a single message.
 */
async function readApkgDraft(request: ApkgDraftRequest = {}): Promise<ApkgDraftResult> {
  // A resume names its session, never a path: the renderer has never been told
  // where the file is (only its label), and the session store is where the path
  // has been kept all along. Falling through to the dialog when the session is
  // gone would silently ask for a different file, so it is an explicit refusal.
  let requested = request.filePath;
  if (!requested && request.sessionId) {
    requested = getDraftSession(request.sessionId)?.request.filePath;
    if (!requested) return { ok: false, error: 'session-source-unknown' };
  }
  // A path nobody picked in this moment can have gone stale — the session store
  // outlives the file it names. Say which failure that is: the zip reader would
  // otherwise surface a raw ENOENT that reads like a corrupt package, and the
  // one recovery it needs (pick the file again) would not be obvious.
  if (requested && !fs.existsSync(requested)) return { ok: false, error: 'source-missing' };
  const file = await pickDeckFile(requested);
  if (!file) return { ok: false, error: 'cancelled' };

  let db: Database | null = null;
  try {
    const zip = new AdmZip(file);
    const bytes = readCollectionBytes(zip);
    const SQL = await getSql();
    db = new SQL.Database(bytes);

    const fingerprint = `sha1:${crypto.createHash('sha1').update(bytes).digest('hex')}`;
    // The renderer only ever sees the label; the exporter finds its way back to
    // the file through this fingerprint-keyed memory in the main process.
    rememberApkgSource(fingerprint, file);
    const mediaEntries = readMediaEntries(zip);
    const raw = readRawCollection(db, {
      mediaEntries,
      mediaFiles: mediaEntries?.map((e) => e.name),
    });
    const full = buildAnkiDraft(raw, {
      source: {
        kind: file.toLowerCase().endsWith('.colpkg') ? 'colpkg' : 'apkg',
        label: path.basename(file),
        schemaVersion: raw.col?.ver,
        createdAtSec: raw.col?.crt,
        modifiedAtMs: raw.col?.mod,
        // The collection bytes are what was read, so they are what a later commit
        // must find unchanged. Hashing the file would also hash its media.
        fingerprint,
      },
      normalize: stripFieldHtml,
    });

    const offset = Math.max(0, Math.floor(request.noteOffset ?? 0));
    const limit = request.noteLimit ?? ANKI_DRAFT_PAGE_SIZE;
    const page = pageAnkiDraft(full, offset, limit);

    // The session is recorded here rather than by the caller. The channels for
    // doing it from the renderer have existed since Phase 1 and no caller has
    // ever used them, so every session list has been empty and no draft has
    // ever been resumable. Main is also the only side that can record one
    // honestly: it holds the path, the fingerprint and the true total, and a
    // page it served cannot go unrecorded because a caller forgot to say so.
    const sourceKind = full.source.kind === 'colpkg' ? 'colpkg' : 'apkg';
    const session = beginDraftSession({
      sourceKind,
      label: path.basename(file),
      request: { kind: sourceKind, filePath: file, noteLimit: limit },
      fingerprint,
    });
    recordDraftSessionPage(session.id, {
      offset,
      count: page.notes.length,
      totalNotes: full.counts.notes,
      fingerprint,
      diagnosticCodes: page.diagnostics.map((d) => d.code),
    });

    return {
      ok: true,
      draft: page,
      fileName: path.basename(file),
      noteOffset: offset,
      totalNotes: full.counts.notes,
      sessionId: session.id,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    try {
      db?.close();
    } catch {
      /* already closed */
    }
  }
}

export function registerApkgIpc(): void {
  ipcMain.handle('apkg:import', (_e, filePath?: string) => importApkg(filePath));
  ipcMain.handle('apkg:importCards', (_e, filePath?: string) => importApkgCards(filePath));
  ipcMain.handle('apkg:readDraft', (_e, request?: ApkgDraftRequest) => readApkgDraft(request));
  ipcMain.handle('apkg:export', (_e, request: ApkgExportRequest) => exportApkg(request));
  ipcMain.handle('anki:readCsvDraft', (_e, request?: CsvDraftRequest) => readCsvDraft(request));
  ipcMain.handle('anki:readConnectDraft', (_e, request?: ConnectDraftRequest) =>
    readConnectDraft(request),
  );
  ipcMain.handle('anki:commitConnectDraft', (_e, request: ConnectCommitRequest) =>
    commitConnectDraft(request),
  );

  // Resumable draft sessions. `readApkgDraft` records its own pages — a reader
  // that served a page is the one component that cannot forget to say so. These
  // channels remain for a caller driving paging itself (a source main does not
  // read, or a cancel/fail the reader cannot observe).
  ipcMain.handle('anki:draftSessionList', () => summarizeDraftSessions());
  ipcMain.handle('anki:draftSessionBegin', (_e, request: BeginDraftSessionRequest) =>
    beginDraftSession(request),
  );
  ipcMain.handle('anki:draftSessionRecordPage', (_e, id: string, page: DraftSessionPageReport) =>
    recordDraftSessionPage(id, page) ?? null,
  );
  ipcMain.handle('anki:draftSessionCancel', (_e, id: string) => cancelDraftSession(id) ?? null);
  ipcMain.handle('anki:draftSessionFail', (_e, id: string, error: string) =>
    failDraftSession(id, String(error ?? 'unknown')) ?? null,
  );
  ipcMain.handle('anki:draftSessionResume', (_e, id: string, fingerprint?: string) =>
    resumeDraftSession(id, fingerprint),
  );
  ipcMain.handle('anki:draftSessionDelete', (_e, id: string) => deleteDraftSession(id));
}

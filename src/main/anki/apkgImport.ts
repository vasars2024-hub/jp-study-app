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
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { Database, SqlJsStatic } from 'sql.js';
import {
  extractExpressions,
  looksLikeUpgradeStub,
  parseModels,
  type ApkgImportResult,
} from '../../shared/apkgParse';
import { mt } from '../i18n';

function focusedWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
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

function getSql(): Promise<SqlJsStatic> {
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
function readCollectionBytes(zip: AdmZip): Uint8Array {
  const get = (name: string): Buffer | null => zip.getEntry(name)?.getData() ?? null;

  const compressed = get('collection.anki21b');
  if (compressed) {
    // node:zlib gained zstd support in newer Node; Electron's bundled Node may
    // not have it. Degrade with a clear instruction, never a silent failure.
    const zstd = (zlib as unknown as { zstdDecompressSync?: (b: Uint8Array) => Buffer })
      .zstdDecompressSync;
    if (typeof zstd !== 'function') throw new Error(COMPRESSED_HELP);
    try {
      return zstd(compressed);
    } catch {
      throw new Error(COMPRESSED_HELP);
    }
  }

  const plain = get('collection.anki21') ?? get('collection.anki2');
  if (plain) return plain;

  throw new Error('That file is not an Anki deck (no collection database inside).');
}

/** Read (mid, flds) note rows and the models blob out of an open collection. */
function readNotes(db: Database): ApkgImportResult {
  const modelsRes = db.exec('SELECT models FROM col LIMIT 1');
  const modelsJson = (modelsRes[0]?.values?.[0]?.[0] as string | undefined) ?? '{}';
  const models = parseModels(modelsJson);

  const notesRes = db.exec('SELECT mid, flds FROM notes');
  const rows = notesRes[0]?.values ?? [];
  const notes = rows.map((r) => ({ mid: String(r[0]), flds: String(r[1] ?? '') }));

  const { expressions, noteCount } = extractExpressions(notes, models);
  // Belt and braces: if we somehow read the legacy decoy, say so rather than
  // importing its single "upgrade Anki" note as vocabulary.
  if (looksLikeUpgradeStub(expressions, noteCount)) throw new Error(COMPRESSED_HELP);
  return { ok: true, expressions, noteCount };
}

async function importApkg(filePath?: string): Promise<ApkgImportResult> {
  let file = filePath;
  if (!file) {
    const win = focusedWindow();
    const opts = {
      title: mt('dialog.importAnkiDeck.title'),
      filters: [{ name: mt('dialog.filter.ankiDeck'), extensions: ['apkg', 'colpkg'] }],
      properties: ['openFile' as const],
    };
    const picked = win
      ? await dialog.showOpenDialog(win, opts)
      : await dialog.showOpenDialog(opts);
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: 'cancelled' };
    file = picked.filePaths[0];
  }

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

export function registerApkgIpc(): void {
  ipcMain.handle('apkg:import', (_e, filePath?: string) => importApkg(filePath));
}

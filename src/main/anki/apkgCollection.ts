// The electron-free half of the .apkg reader: zip, zstd, sql.js, and the whole
// collection -> paged draft parse.
//
// It was split out of `apkgImport.ts` for one reason, measured rather than
// assumed. `apkgImport.ts` imports `ipcMain`/`dialog`/`BrowserWindow`, so nothing
// that imports it can run anywhere but the main process — and reading a deck is
// exactly the CPU-heavy parse that must NOT run there. On the 100,000-note gate 9
// fixture the read took 6,217 ms and main answered **3** heartbeats in that window
// (max unbroken stall 3,293 ms) against an idle control of 141 beats / 14 ms max.
// A utility process can host this file; it could never host `apkgImport.ts`.
//
// Nothing here touches Electron, so the same functions serve the worker, the
// main-process fallback, and the tests, and there is no second copy of the ladder
// that could drift from the one the fallback uses.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import AdmZip from 'adm-zip';
import type { SqlJsStatic } from 'sql.js';
import { stripFieldHtml } from '../../shared/apkgParse';
import {
  ANKI_DRAFT_PAGE_SIZE,
  buildAnkiDraft,
  pageAnkiDraft,
  type AnkiDraft,
  type RawAnkiMediaEntry,
} from '../../shared/ankiDraft';
import { readRawCollection } from './apkgDraftRead';
import { decodeMediaManifestNames } from './ankiProtoConfig';

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

export function readCollectionBytes(zip: AdmZip): Uint8Array {
  return readCollection(zip).bytes;
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
export function readMediaManifest(zip: AdmZip): Map<string, string> | undefined {
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
export function readMediaEntries(zip: AdmZip): RawAnkiMediaEntry[] | undefined {
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

// ----- the parse itself --------------------------------------------------------

export interface ApkgParsePageRequest {
  filePath: string;
  noteOffset?: number;
  noteLimit?: number;
}

/**
 * One page of a deck, plus the facts the caller needs that the page does not
 * carry: the whole-collection note total, and the fingerprint the exporter finds
 * its way back to the file by.
 */
export interface ApkgParsedPage {
  page: AnkiDraft;
  fingerprint: string;
  totalNotes: number;
  sourceKind: 'apkg' | 'colpkg';
  label: string;
  noteOffset: number;
  noteLimit: number;
}

/**
 * Parse a package into one page of draft.
 *
 * The whole collection is built and then sliced, which is what makes this
 * expensive and is also unavoidable: `buildAnkiDraft` resolves note types, decks
 * and cards across the whole file, so a page cannot be assembled from a LIMIT.
 * That is precisely why the caller should be running this off the main loop.
 */
export async function parseApkgDraftPage(
  request: ApkgParsePageRequest,
): Promise<ApkgParsedPage> {
  const file = request.filePath;
  const zip = new AdmZip(file);
  const bytes = readCollectionBytes(zip);
  const SQL = await getSql();
  const db = new SQL.Database(bytes);
  try {
    const fingerprint = `sha1:${crypto.createHash('sha1').update(bytes).digest('hex')}`;
    const mediaEntries = readMediaEntries(zip);
    const raw = readRawCollection(db, {
      mediaEntries,
      mediaFiles: mediaEntries?.map((e) => e.name),
    });
    const sourceKind = file.toLowerCase().endsWith('.colpkg') ? 'colpkg' : 'apkg';
    const full = buildAnkiDraft(raw, {
      source: {
        kind: sourceKind,
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

    const noteOffset = Math.max(0, Math.floor(request.noteOffset ?? 0));
    const noteLimit = request.noteLimit ?? ANKI_DRAFT_PAGE_SIZE;
    return {
      page: pageAnkiDraft(full, noteOffset, noteLimit),
      fingerprint,
      totalNotes: full.counts.notes,
      sourceKind,
      label: path.basename(file),
      noteOffset,
      noteLimit,
    };
  } finally {
    try {
      db.close();
    } catch {
      /* already closed */
    }
  }
}

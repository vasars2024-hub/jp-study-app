/**
 * The watch-tracking library — the file half, and its IPC.
 *
 * `<userData>/watch-library.json`, one JSON document read and written whole
 * (atomic temp-file + rename). A heavy user is a few thousand titles at under a
 * kilobyte each, so a database would be ceremony; the merge, link and query
 * logic is all in `shared/watchLibrary.ts` and this file only moves bytes.
 *
 * Three other stores feed it, none of which it owns:
 *
 *  - `media.json` (the local file library, `main/media.ts`) is read — never
 *    written — to link titles to files and to resolve the item a player
 *    reports progress for.
 *  - `mal-library.json` (the MAL OAuth sync, `main/malLibrary.ts`) is folded in
 *    lazily: whenever its `lastSyncAt` moves, the rows that sync touched become
 *    `mal-sync` observations. A MAL XML export is written *into* it too, so the
 *    subtitle harvest sees an export user's shows exactly as a synced user's.
 *  - Export files the user picks (`watch:importFile`) — MyAnimeList's
 *    `animelist_*.xml(.gz)` and Letterboxd's `letterboxd-*.zip` or any single
 *    CSV from it. Nothing here signs in anywhere or touches the network.
 */

import { app, BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  applyLocalPlayback,
  applyWatchMetadata,
  applyWatchTitlePatch,
  buildWatchIndex,
  buildWatchViews,
  countWatchStatuses,
  emptyWatchLibrary,
  findWatchTitleForMedia,
  malLibraryEntriesToObservations,
  mergeWatchObservations,
  parseWatchLibraryDocument,
  queryWatchLibrary,
  recordWatchImport,
  removeWatchTitle,
  sanitizeWatchAddInput,
  sanitizeWatchQuery,
  sanitizeWatchTitlePatch,
  watchObservationFromAdd,
  watchObservationFromMedia,
  watchTitleNeedsLookup,
  WATCH_COMPLETE_FRACTION,
  WATCH_LIBRARY_SCHEMA_VERSION,
  WATCH_LIBRARY_STORE_FILE,
  type WatchImportRecord,
  type WatchLibraryDocument,
  type WatchLinkableMedia,
  type WatchMetadataPatch,
  type WatchObservation,
  type WatchPlaybackReason,
  type WatchQueryResult,
  type WatchStatus,
  type WatchTitle,
  type WatchTitleView,
} from '../shared/watchLibrary';
import {
  looksLikeMalExport,
  malExportRowsToListEntries,
  malExportRowsToObservations,
  malExportTimestampFromFileName,
  parseMalExportXml,
} from '../shared/imports/malExport';
import {
  latestLetterboxdDate,
  letterboxdExportTimestampFromFileName,
  letterboxdFilmsToObservations,
  looksLikeLetterboxdCsv,
  parseLetterboxdExport,
  type LetterboxdFile,
  type LetterboxdFileKind,
} from '../shared/imports/letterboxdExport';
import { mergeMalExportEntries } from '../shared/malLibrary';
import { MEDIA_LIBRARY_STORE_FILE, mediaItemsFromStoredDocument } from '../shared/mediaLibraryEntries';
import { malLibraryFilePath, readMalLibrary, writeMalLibrary } from './malLibrary';
import { mt } from './i18n';

// ---------------------------------------------------------------------------
// Paths (overridable for tests)
// ---------------------------------------------------------------------------

const defaultWatchPath = (): string => path.join(app.getPath('userData'), WATCH_LIBRARY_STORE_FILE);
const defaultMediaPath = (): string => path.join(app.getPath('userData'), MEDIA_LIBRARY_STORE_FILE);

let watchPath: () => string = defaultWatchPath;
let mediaPath: () => string = defaultMediaPath;

export function __setWatchLibraryPathsForTests(next: { watch?: () => string; media?: () => string } | null): void {
  watchPath = next?.watch ?? defaultWatchPath;
  mediaPath = next?.media ?? defaultMediaPath;
  documentCache = null;
  mediaCache = null;
  malStatCache = null;
}

// ---------------------------------------------------------------------------
// Document I/O
// ---------------------------------------------------------------------------

interface FileStamp {
  mtimeMs: number;
  size: number;
}

function stampOf(file: string): FileStamp | null {
  try {
    const stat = fs.statSync(file);
    return { mtimeMs: stat.mtimeMs, size: stat.size };
  } catch {
    return null;
  }
}

function sameStamp(a: FileStamp | null, b: FileStamp | null): boolean {
  return !!a && !!b && a.mtimeMs === b.mtimeMs && a.size === b.size;
}

let documentCache: { stamp: FileStamp; document: WatchLibraryDocument } | null = null;

/**
 * Moves an unreadable or newer-schema file aside before it could be overwritten.
 * The library then starts empty, but the old bytes are evidence, not garbage.
 */
function quarantine(file: string, label: string): void {
  try {
    fs.renameSync(file, `${file.replace(/\.json$/i, '')}.${label}-${Date.now()}.json`);
  } catch {
    // If it cannot even be renamed there is nothing safer to do than carry on.
  }
}

export function readWatchLibrary(): WatchLibraryDocument {
  const file = watchPath();
  const stamp = stampOf(file);
  if (!stamp) return emptyWatchLibrary();
  if (documentCache && sameStamp(documentCache.stamp, stamp)) return documentCache.document;
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    quarantine(file, 'corrupt');
    return emptyWatchLibrary();
  }
  const document = parseWatchLibraryDocument(raw);
  if (document.version > WATCH_LIBRARY_SCHEMA_VERSION) {
    // Reading a newer document with older rules would drop what this version
    // does not know and write the loss back on the next change.
    quarantine(file, `v${document.version}`);
    return emptyWatchLibrary();
  }
  documentCache = { stamp, document };
  return document;
}

/** Atomic: rename-over in the same directory, so a crash leaves the previous file. */
export function writeWatchLibrary(document: WatchLibraryDocument): void {
  const target = watchPath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(document, null, 2), 'utf-8');
  fs.renameSync(temp, target);
  const stamp = stampOf(target);
  documentCache = stamp ? { stamp, document } : null;
}

// ---------------------------------------------------------------------------
// Local media (read-only view of media.json)
// ---------------------------------------------------------------------------

let mediaCache: { stamp: FileStamp; items: WatchLinkableMedia[] } | null = null;

function readMediaItems(): WatchLinkableMedia[] {
  const file = mediaPath();
  const stamp = stampOf(file);
  if (!stamp) return [];
  if (mediaCache && sameStamp(mediaCache.stamp, stamp)) return mediaCache.items;
  let items: WatchLinkableMedia[] = [];
  try {
    items = mediaItemsFromStoredDocument(JSON.parse(fs.readFileSync(file, 'utf-8')))
      .filter((item) => item && typeof item.id === 'string') as WatchLinkableMedia[];
  } catch {
    items = [];
  }
  mediaCache = { stamp, items };
  return items;
}

function samePath(a: string, b: string): boolean {
  const x = path.resolve(a);
  const y = path.resolve(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
}

function findMediaItem(input: { mediaItemId?: string; path?: string }): WatchLinkableMedia | undefined {
  const items = readMediaItems();
  if (input.mediaItemId) {
    const hit = items.find((item) => item.id === input.mediaItemId);
    if (hit) return hit;
  }
  if (input.path) return items.find((item) => typeof item.path === 'string' && samePath(item.path, input.path as string));
  return undefined;
}

// ---------------------------------------------------------------------------
// MAL library fold
// ---------------------------------------------------------------------------

let malStatCache: FileStamp | null = null;

/**
 * Folds the rows the last MAL sync(s) touched into the watch library.
 *
 * Incremental on purpose: only rows whose `syncedAt` is newer than the last
 * fold. Re-folding every row would re-apply rows mirrored from an export with
 * their *import* time as `asOf`, which is later than the export itself and
 * would let it overrule a manual edit the export had correctly lost to.
 */
function foldMalLibrary(document: WatchLibraryDocument, now: number): { document: WatchLibraryDocument; changedIds: string[] } {
  const stamp = stampOf(malLibraryFilePath());
  if (!stamp) return { document, changedIds: [] };
  if (malStatCache && sameStamp(malStatCache, stamp) && document.malLibraryLastSyncAt !== null) {
    return { document, changedIds: [] };
  }
  const mal = readMalLibrary();
  malStatCache = stamp;
  if (mal.lastSyncAt === null || mal.lastSyncAt === document.malLibraryLastSyncAt) return { document, changedIds: [] };
  const since = document.malLibraryLastSyncAt;
  const rows = mal.entries.filter((entry) => since === null || entry.syncedAt > since);
  const merged = mergeWatchObservations(document, malLibraryEntriesToObservations(rows), now);
  const changedIds = merged.outcomes
    .filter((entry) => entry.outcome === 'added' || entry.outcome === 'updated')
    .map((entry) => entry.titleId as string);
  return { document: { ...merged.document, malLibraryLastSyncAt: mal.lastSyncAt }, changedIds };
}

// ---------------------------------------------------------------------------
// Change events
// ---------------------------------------------------------------------------

export type WatchChangeReason = 'import' | 'update' | 'add' | 'remove' | 'local-progress' | 'mal-sync' | 'metadata';

export interface WatchChangedEvent {
  reason: WatchChangeReason;
  /** Titles touched, when known and few; absent means "re-query everything". */
  ids?: string[];
  at: number;
}

/** Main-process subscribers — the metadata pass (`watchLibraryMetadata.ts`) listens for imports. */
const mainListeners = new Set<(event: WatchChangedEvent) => void>();

export function onWatchLibraryChanged(listener: (event: WatchChangedEvent) => void): () => void {
  mainListeners.add(listener);
  return () => mainListeners.delete(listener);
}

function broadcast(event: WatchChangedEvent): void {
  const payload = event.ids && event.ids.length > 200 ? { reason: event.reason, at: event.at } : event;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('watch:changed', payload);
  }
  for (const listener of mainListeners) {
    try {
      listener(event);
    } catch {
      /* a subscriber's failure must not break the write that announced it */
    }
  }
}

/**
 * Loads the document with MAL sync rows folded in, persisting and announcing
 * the fold if it changed anything. Every operation starts here.
 */
function loadCurrent(now: number): WatchLibraryDocument {
  const loaded = readWatchLibrary();
  const folded = foldMalLibrary(loaded, now);
  if (folded.document !== loaded) {
    writeWatchLibrary(folded.document);
    if (folded.changedIds.length) broadcast({ reason: 'mal-sync', ids: folded.changedIds, at: now });
  }
  return folded.document;
}

function localIsoDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * One title's view. Linked against the *whole* library, not the one title: a
 * file named like two titles is ambiguous and links to neither, and a file
 * pinned to another title belongs there — a one-title index would see neither.
 */
function viewOf(document: WatchLibraryDocument, id: string): WatchTitleView | null {
  if (!document.titles.some((entry) => entry.id === id)) return null;
  return buildWatchViews(document.titles, readMediaItems()).find((view) => view.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface WatchIpcError {
  ok: false;
  /** English (or current UI language) text for logs and callers without a catalogue. */
  error: string;
  /** i18n key the renderer should resolve with `t(errorKey, errorParams)`. */
  errorKey: string;
  errorParams?: Record<string, string>;
}

function failure(errorKey: string, errorParams?: Record<string, string>): WatchIpcError {
  return { ok: false, error: mt(errorKey, errorParams), errorKey, ...(errorParams ? { errorParams } : {}) };
}

// ---------------------------------------------------------------------------
// Operations (exported so tests and other main modules can call them directly)
// ---------------------------------------------------------------------------

export function listWatchTitles(query: unknown, now: number = Date.now()): WatchQueryResult {
  const document = loadCurrent(now);
  return queryWatchLibrary(document.titles, readMediaItems(), sanitizeWatchQuery(query));
}

export function getWatchTitle(id: unknown, now: number = Date.now()): WatchTitleView | null {
  if (typeof id !== 'string') return null;
  return viewOf(loadCurrent(now), id);
}

export type WatchUpdateResult = { ok: true; title: WatchTitleView } | WatchIpcError;

export function updateWatchTitle(id: unknown, patch: unknown, now: number = Date.now()): WatchUpdateResult {
  const document = loadCurrent(now);
  const index = typeof id === 'string' ? document.titles.findIndex((title) => title.id === id) : -1;
  if (index < 0) return failure('watchLibrary.error.notFound');
  const next = applyWatchTitlePatch(document.titles[index], sanitizeWatchTitlePatch(patch), { now, today: localIsoDate(now) });
  const titles = [...document.titles];
  titles[index] = next;
  const updated = { ...document, titles };
  writeWatchLibrary(updated);
  broadcast({ reason: 'update', ids: [next.id], at: now });
  return { ok: true, title: viewOf(updated, next.id) as WatchTitleView };
}

export type WatchAddResult = { ok: true; title: WatchTitleView; created: boolean } | WatchIpcError;

export function addWatchTitle(input: unknown, now: number = Date.now()): WatchAddResult {
  const request = sanitizeWatchAddInput(input);
  let observation: WatchObservation | undefined;
  if (request.fromMediaItemId) {
    const item = findMediaItem({ mediaItemId: request.fromMediaItemId });
    if (!item) return failure('watchLibrary.error.unknownMedia');
    observation = watchObservationFromMedia(item, now);
    if (!observation) return failure('watchLibrary.error.notTrackable');
    observation = {
      ...observation,
      source: 'manual',
      identity: { ...observation.identity, kind: request.kind ?? observation.identity.kind },
      fields: { ...observation.fields, status: request.status ?? 'plan' },
    };
  } else {
    if (!request.kind || !request.title) return failure('watchLibrary.error.invalidTitle');
    observation = watchObservationFromAdd({ ...request, kind: request.kind, title: request.title }, now);
  }
  const document = loadCurrent(now);
  const merged = mergeWatchObservations(document, [observation], now);
  const outcome = merged.outcomes[0];
  if (!outcome?.titleId) return failure('watchLibrary.error.addFailed');
  writeWatchLibrary(merged.document);
  broadcast({ reason: 'add', ids: [outcome.titleId], at: now });
  return { ok: true, title: viewOf(merged.document, outcome.titleId) as WatchTitleView, created: outcome.outcome === 'added' };
}

export function removeWatchTitleById(id: unknown, now: number = Date.now()): { ok: true } | WatchIpcError {
  if (typeof id !== 'string') return failure('watchLibrary.error.notFound');
  const document = loadCurrent(now);
  const { document: next, removed } = removeWatchTitle(document, id, now);
  if (!removed) return failure('watchLibrary.error.notFound');
  writeWatchLibrary(next);
  broadcast({ reason: 'remove', ids: [id], at: now });
  return { ok: true };
}

export interface WatchLocalProgressInput {
  mediaItemId?: string;
  path?: string;
  positionSec: number;
  durationSec: number;
}

export interface WatchLocalProgressResult {
  ok: true;
  /** The play crossed the watched threshold (90%). */
  counted: boolean;
  /** The library was written. */
  changed: boolean;
  /** A title was created for a file the library did not track yet. */
  created: boolean;
  titleId?: string;
  status?: WatchStatus;
  progress?: number;
  reason?: WatchPlaybackReason | 'unknown-media' | 'not-trackable' | 'invalid-input';
}

/**
 * The player hook: report where playback is. Cheap below the threshold — it
 * returns before touching disk — so it is safe to call on every pause or on a
 * coarse timer, not only at the end.
 */
export function recordWatchLocalProgress(input: unknown, now: number = Date.now()): WatchLocalProgressResult {
  const r = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const positionSec = typeof r.positionSec === 'number' && Number.isFinite(r.positionSec) ? r.positionSec : NaN;
  const durationSec = typeof r.durationSec === 'number' && Number.isFinite(r.durationSec) ? r.durationSec : NaN;
  const idle = { ok: true as const, counted: false, changed: false, created: false };
  if (!(positionSec >= 0) || !(durationSec > 0)) return { ...idle, reason: 'invalid-input' };
  if (positionSec / durationSec < WATCH_COMPLETE_FRACTION) return { ...idle, reason: 'below-threshold' };

  const item = findMediaItem({
    mediaItemId: typeof r.mediaItemId === 'string' ? r.mediaItemId : undefined,
    path: typeof r.path === 'string' ? r.path : undefined,
  });
  if (!item) return { ...idle, reason: 'unknown-media' };

  let document = loadCurrent(now);
  let found = findWatchTitleForMedia(buildWatchIndex(document.titles), item);
  let created = false;
  if (!found) {
    const observation = watchObservationFromMedia(item, now);
    if (!observation) return { ...idle, reason: 'not-trackable' };
    const merged = mergeWatchObservations(document, [observation], now);
    const outcome = merged.outcomes[0];
    const title = outcome?.titleId ? merged.document.titles.find((entry) => entry.id === outcome.titleId) : undefined;
    if (!title) return { ...idle, reason: 'not-trackable' };
    document = merged.document;
    created = outcome.outcome === 'added';
    found = { title, via: 'title' };
  }

  const outcome = applyLocalPlayback(found.title, {
    positionSec,
    durationSec,
    season: item.season,
    episode: item.episode,
    episodeKind: item.episodeKind,
    via: found.via,
    at: now,
    today: localIsoDate(now),
  });
  const changed = outcome.changed || created;
  if (changed) {
    const titles = document.titles.map((title) => (title.id === found?.title.id ? outcome.title : title));
    writeWatchLibrary({ ...document, titles });
    broadcast({ reason: 'local-progress', ids: [outcome.title.id], at: now });
  }
  return {
    ok: true,
    counted: outcome.counted,
    changed,
    created,
    titleId: outcome.title.id,
    status: outcome.title.status,
    progress: outcome.title.progress,
    reason: outcome.reason,
  };
}

/**
 * For the metadata pass (TMDB/TVmaze lookups): fill ids, genres, runtime,
 * poster. Ids only fill gaps; a user's `kind`/`year`/`episodeCount` edit wins.
 */
export function setWatchTitleMetadata(id: string, meta: WatchMetadataPatch, now: number = Date.now()): WatchTitle | null {
  const document = loadCurrent(now);
  const index = document.titles.findIndex((title) => title.id === id);
  if (index < 0) return null;
  const next = applyWatchMetadata(document.titles[index], meta, now);
  if (next === document.titles[index] || next.updatedAt !== now) return document.titles[index];
  const titles = [...document.titles];
  titles[index] = next;
  writeWatchLibrary({ ...document, titles });
  broadcast({ reason: 'metadata', ids: [id], at: now });
  return next;
}

/** Titles with no provider id at all — what a TMDB title+year search should visit. */
export function listWatchTitlesNeedingLookup(): WatchTitle[] {
  return loadCurrent(Date.now()).titles.filter(watchTitleNeedsLookup);
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Anything larger than this is not a list export. */
const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
/** Decompressed ceiling, so a hostile archive cannot exhaust memory. */
const MAX_DECOMPRESSED_BYTES = 256 * 1024 * 1024;

export type WatchImportFormat =
  | 'mal-xml'
  | 'mal-xml-gz'
  | 'mal-zip'
  | 'letterboxd-zip'
  | 'letterboxd-folder'
  | 'letterboxd-csv';

export interface WatchImportUnmatched {
  name?: string;
  year?: number;
  file?: string;
  reason: 'no-name' | 'no-id' | 'favorite-not-in-export' | 'unknown-status';
}

export interface WatchImportSummary {
  ok: true;
  source: 'mal-export' | 'letterboxd';
  format: WatchImportFormat;
  fileName: string;
  /** When the export was made (from its file name, else the file's mtime). */
  exportedAt?: number;
  /** MAL user name / Letterboxd username, when the export names one. */
  username?: string;
  /** Titles in the file that reached the merge. */
  total: number;
  added: number;
  updated: number;
  unchanged: number;
  /** Final status of every title this import touched. */
  byStatus: Partial<Record<WatchStatus, number>>;
  /** Rows that could not become titles (and favourites the export did not contain). Capped at 200. */
  unmatched: WatchImportUnmatched[];
  unmatchedCount: number;
  skipped: {
    /** Manga rows in a MAL export — not imported (see `shared/imports/malExport.ts`). */
    manga: number;
    /** Titles the user removed after this data was true. */
    removed: number;
  };
  /** Imported titles that have at least one local file. */
  linkedToLocal: number;
  /** Imported titles with no provider id — they need a title+year metadata search for posters. */
  needsLookup: number;
  /** A MAL export is mirrored into `mal-library.json`; this is that merge. */
  malLibrary?: { added: number; updated: number; unchanged: number };
  /** Letterboxd: every file read and what it was taken for. */
  files?: { path: string; kind: LetterboxdFileKind; rows: number }[];
}

export type WatchImportResult = WatchImportSummary | WatchIpcError;

function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    swapped.swap16();
    return swapped.toString('utf16le');
  }
  return buffer.toString('utf8');
}

const isGzip = (buffer: Buffer): boolean => buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
const isZip = (buffer: Buffer): boolean => buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

interface ZipText {
  path: string;
  text: string;
}

function readZipTexts(buffer: Buffer, accept: (name: string) => boolean): ZipText[] {
  const zip = new AdmZip(buffer);
  const out: ZipText[] = [];
  let total = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory || !accept(entry.entryName)) continue;
    total += entry.header.size;
    if (total > MAX_DECOMPRESSED_BYTES) throw new Error('archive too large');
    const data = entry.getData();
    const name = entry.entryName.replace(/\\/g, '/');
    out.push({ path: name, text: /\.gz$/i.test(name) ? decodeText(zlib.gunzipSync(data, { maxOutputLength: MAX_DECOMPRESSED_BYTES })) : decodeText(data) });
  }
  return out;
}

function readFolderCsvs(root: string): LetterboxdFile[] {
  const out: LetterboxdFile[] = [];
  let total = 0;
  const walk = (dir: string, depth: number): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 2) walk(full, depth + 1);
        continue;
      }
      if (!/\.csv$/i.test(entry.name)) continue;
      total += fs.statSync(full).size;
      if (total > MAX_DECOMPRESSED_BYTES) throw new Error('folder too large');
      out.push({ path: path.relative(root, full).replace(/\\/g, '/'), text: decodeText(fs.readFileSync(full)) });
    }
  };
  walk(root, 0);
  return out;
}

type Detected =
  | { source: 'mal-export'; format: WatchImportFormat; xml: string }
  | { source: 'letterboxd'; format: WatchImportFormat; files: LetterboxdFile[] }
  | { source: 'none' };

function detect(filePath: string, stat: fs.Stats): Detected {
  if (stat.isDirectory()) {
    const files = readFolderCsvs(filePath);
    return files.some((file) => looksLikeLetterboxdCsv(file.path, file.text))
      ? { source: 'letterboxd', format: 'letterboxd-folder', files }
      : { source: 'none' };
  }
  const buffer = fs.readFileSync(filePath);
  if (isGzip(buffer)) {
    const text = decodeText(zlib.gunzipSync(buffer, { maxOutputLength: MAX_DECOMPRESSED_BYTES }));
    return looksLikeMalExport(text) ? { source: 'mal-export', format: 'mal-xml-gz', xml: text } : { source: 'none' };
  }
  if (isZip(buffer)) {
    const texts = readZipTexts(buffer, (name) => /\.(csv|xml|xml\.gz)$/i.test(name));
    const csvs = texts.filter((entry) => /\.csv$/i.test(entry.path));
    if (csvs.some((entry) => looksLikeLetterboxdCsv(entry.path, entry.text))) {
      return { source: 'letterboxd', format: 'letterboxd-zip', files: csvs };
    }
    const xml = texts.find((entry) => /\.xml(\.gz)?$/i.test(entry.path) && looksLikeMalExport(entry.text));
    return xml ? { source: 'mal-export', format: 'mal-zip', xml: xml.text } : { source: 'none' };
  }
  const text = decodeText(buffer);
  if (looksLikeMalExport(text)) return { source: 'mal-export', format: 'mal-xml', xml: text };
  const name = path.basename(filePath);
  if (looksLikeLetterboxdCsv(name, text)) {
    return { source: 'letterboxd', format: 'letterboxd-csv', files: [{ path: name, text }] };
  }
  return { source: 'none' };
}

const UNMATCHED_CAP = 200;

function summarize(
  document: WatchLibraryDocument,
  merged: ReturnType<typeof mergeWatchObservations>,
): Pick<WatchImportSummary, 'added' | 'updated' | 'unchanged' | 'byStatus' | 'linkedToLocal' | 'needsLookup'> & { removed: number; ids: string[] } {
  const ids = [...new Set(merged.outcomes.map((entry) => entry.titleId).filter((id): id is string => !!id))];
  const idSet = new Set(ids);
  const touched = document.titles.filter((title) => idSet.has(title.id));
  const views = buildWatchViews(document.titles, readMediaItems()).filter((view) => idSet.has(view.id));
  return {
    added: merged.added,
    updated: merged.updated,
    unchanged: merged.unchanged,
    removed: merged.skippedRemoved,
    byStatus: countWatchStatuses(touched),
    linkedToLocal: views.filter((view) => view.onDisk).length,
    needsLookup: touched.filter(watchTitleNeedsLookup).length,
    ids,
  };
}

/**
 * Imports one export file (or an unzipped Letterboxd folder).
 *
 * Detection is by content, not extension: gzip and zip by magic bytes, MAL by
 * its `<myanimelist>` envelope, Letterboxd by file names inside the zip or a
 * lone CSV's header. A renamed file still imports; a wrong file is refused
 * with a reason rather than half-imported.
 */
export function importWatchFile(filePath: unknown, now: number = Date.now()): WatchImportResult {
  if (typeof filePath !== 'string' || !filePath.trim()) return failure('watchLibrary.import.error.notFound');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return failure('watchLibrary.import.error.notFound');
  }
  if (stat.isFile() && stat.size > MAX_IMPORT_BYTES) {
    return failure('watchLibrary.import.error.tooLarge', { size: `${Math.round(stat.size / (1024 * 1024))} MB` });
  }

  let detected: Detected;
  try {
    detected = detect(filePath, stat);
  } catch (error) {
    return failure('watchLibrary.import.error.unreadable', { detail: error instanceof Error ? error.message : String(error) });
  }
  if (detected.source === 'none') return failure('watchLibrary.import.error.unrecognized');

  const fileName = path.basename(filePath);
  const document = loadCurrent(now);

  if (detected.source === 'mal-export') {
    const parsed = parseMalExportXml(detected.xml);
    if (parsed.anime.length === 0) {
      return parsed.manga.length > 0
        ? failure('watchLibrary.import.error.mangaOnly')
        : failure('watchLibrary.import.error.empty');
    }
    const exportedAt = malExportTimestampFromFileName(fileName) ?? (stat.mtimeMs || undefined);
    const observations = malExportRowsToObservations(parsed.anime, exportedAt);
    const merged = mergeWatchObservations(document, observations, now);

    // Mirror into mal-library.json, then record that fold as already seen so
    // the lazy fold does not re-apply these rows as `mal-sync` data.
    const malMerge = mergeMalExportEntries(readMalLibrary(), malExportRowsToListEntries(parsed.anime), now, exportedAt);
    writeMalLibrary(malMerge.document);
    malStatCache = stampOf(malLibraryFilePath());

    const stats = summarize(merged.document, merged);
    const record: WatchImportRecord = {
      at: now, source: 'mal-export', fileName, exportedAt,
      added: stats.added, updated: stats.updated, unchanged: stats.unchanged,
    };
    const final = recordWatchImport({ ...merged.document, malLibraryLastSyncAt: malMerge.document.lastSyncAt }, record);
    writeWatchLibrary(final);
    broadcast({ reason: 'import', ids: stats.ids, at: now });
    const unmatched: WatchImportUnmatched[] = parsed.anime
      .filter((row) => !row.status)
      .map((row) => ({ name: row.title, reason: 'unknown-status' as const }));
    return {
      ok: true,
      source: 'mal-export',
      format: detected.format,
      fileName,
      exportedAt,
      username: parsed.user?.name,
      total: observations.length,
      added: stats.added,
      updated: stats.updated,
      unchanged: stats.unchanged,
      byStatus: stats.byStatus,
      unmatched: unmatched.slice(0, UNMATCHED_CAP),
      unmatchedCount: unmatched.length + parsed.invalid,
      skipped: { manga: parsed.manga.length, removed: stats.removed },
      linkedToLocal: stats.linkedToLocal,
      needsLookup: stats.needsLookup,
      malLibrary: { added: malMerge.added, updated: malMerge.updated, unchanged: malMerge.unchanged },
    };
  }

  const parsed = parseLetterboxdExport(detected.files);
  if (parsed.films.length === 0) return failure('watchLibrary.import.error.empty');
  // The export's own name, else the newest row date (a lower bound — never the
  // file's mtime, which a copy resets to "now" and would make a stale CSV
  // outrank a later, properly-named export).
  const exportedAt = letterboxdExportTimestampFromFileName(fileName) ?? latestLetterboxdDate(parsed.films);
  const observations = letterboxdFilmsToObservations(parsed.films, exportedAt);
  const merged = mergeWatchObservations(document, observations, now);
  const stats = summarize(merged.document, merged);
  const record: WatchImportRecord = {
    at: now, source: 'letterboxd', fileName, exportedAt,
    added: stats.added, updated: stats.updated, unchanged: stats.unchanged,
  };
  writeWatchLibrary(recordWatchImport(merged.document, record));
  broadcast({ reason: 'import', ids: stats.ids, at: now });
  const unmatched: WatchImportUnmatched[] = parsed.unmatched.map((row) => ({
    name: row.name, year: row.year, file: row.file, reason: row.reason,
  }));
  return {
    ok: true,
    source: 'letterboxd',
    format: detected.format,
    fileName,
    exportedAt,
    username: parsed.username,
    total: observations.length,
    added: stats.added,
    updated: stats.updated,
    unchanged: stats.unchanged,
    byStatus: stats.byStatus,
    unmatched: unmatched.slice(0, UNMATCHED_CAP),
    unmatchedCount: unmatched.length,
    skipped: { manga: 0, removed: stats.removed },
    linkedToLocal: stats.linkedToLocal,
    needsLookup: stats.needsLookup,
    files: parsed.files,
  };
}

export function watchImportHistory(): WatchImportRecord[] {
  return readWatchLibrary().imports;
}

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

async function chooseImportFile(): Promise<string | null> {
  const owner = BrowserWindow.getFocusedWindow();
  const options: OpenDialogOptions = {
    title: mt('watchLibrary.import.dialogTitle'),
    properties: ['openFile'],
    filters: [
      { name: mt('watchLibrary.import.filterExports'), extensions: ['zip', 'gz', 'xml', 'csv'] },
      { name: mt('watchLibrary.import.filterAll'), extensions: ['*'] },
    ],
  };
  const picked = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
  return picked.canceled || !picked.filePaths[0] ? null : picked.filePaths[0];
}

/**
 * Registers the `watch:*` channels. Every one is local disk only: nothing here
 * can reach MyAnimeList, Letterboxd or any other service.
 */
export function registerWatchLibraryIpc(): void {
  ipcMain.handle('watch:list', (_event, query: unknown) => listWatchTitles(query));
  ipcMain.handle('watch:get', (_event, id: unknown) => getWatchTitle(id));
  ipcMain.handle('watch:add', (_event, input: unknown) => addWatchTitle(input));
  ipcMain.handle('watch:update', (_event, id: unknown, patch: unknown) => updateWatchTitle(id, patch));
  ipcMain.handle('watch:remove', (_event, id: unknown) => removeWatchTitleById(id));
  ipcMain.handle('watch:recordLocalProgress', (_event, input: unknown) => recordWatchLocalProgress(input));
  ipcMain.handle('watch:importFile', (_event, filePath: unknown) => importWatchFile(filePath));
  ipcMain.handle('watch:chooseImportFile', () => chooseImportFile());
  ipcMain.handle('watch:importHistory', () => watchImportHistory());
}

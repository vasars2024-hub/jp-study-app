// INTEGRATION: recordingFinalize.ts should call setRecordingFinalizer(...)
//
//   import { setRecordingFinalizer } from './extensionRecordings';
//   setRecordingFinalizer(async (filePath, opts) => {
//     // filePath: the assembled upload (e.g. <root>/recordings/Gum tab recording 2026-10-08 13-45-12.webm)
//     // opts: RecordingFinalizeOptions — { title?, url?, durationMs?, mimeType?, transcribe?,
//     //        source: 'extension-tab' | 'extension-mic', crop?, startedAt?, recordingId }
//     // webm -> mp4 via ffmpeg, ingest into the media library, transcribe, open in the player.
//     return { ok: true, mediaId, path: finalPath }; // or { ok: false, error }
//   });
//
// The finalizer owns the assembled file once it is called (it may move or delete
// it). With no finalizer registered, /finish answers `finalized: false` and the
// file stays where it was assembled. The microphone "card" flow registers its own
// handler the same way: setMicRecordingHandler((filePath, meta) => Promise<object>).
//
// Wired (2026-10-08): extensionServer.ts routes /v1/recordings* here before the
// generic body cap, setCors allows PUT/DELETE, and startExtensionServer registers
// the mic handler (setMicRecordingHandler). Still open: the desktop finalizer.

/**
 * Chunked upload of tab / microphone recordings from the Chrome extension.
 *
 * The extension records in an offscreen document (MediaRecorder, ~2 s chunks)
 * and PUTs each chunk here as it arrives, so a long recording never sits in the
 * extension's memory and a crash of either side loses at most one chunk:
 *
 *   POST   /v1/recordings                    open an upload session
 *   PUT    /v1/recordings/:id/chunks/:seq    one chunk, raw bytes, in order
 *   POST   /v1/recordings/:id/finish         concatenate + hand to the finalizer
 *   GET    /v1/recordings/:id/status         progress / outcome
 *   DELETE /v1/recordings/:id                discard the partial upload
 *
 * Chunk bodies are streamed to disk, never buffered whole. A body over the cap
 * is drained and answered 413 — never a reset socket, which the extension reads
 * as "Gum is not running".
 */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { once } from 'node:events';
import { app } from 'electron';
import { isStorageFullError } from '../shared/resilience';

export const RECORDING_CHUNK_MAX_BYTES = 8 * 1024 * 1024;
export const RECORDING_TOTAL_MAX_BYTES = 4 * 1024 * 1024 * 1024;

/** JSON bodies on these routes (create / finish) are tiny. */
const JSON_BODY_MAX_BYTES = 64 * 1024;
/** An upload untouched this long no longer blocks a new one. */
const SESSION_IDLE_MS = 10 * 60 * 1000;
/** Partials and finished records older than this are removed. */
const STALE_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const ID_RE = /^[0-9a-f-]{36}$/;
const SEQ_RE = /^\d{1,7}$/;
const PREFIX = '/v1/recordings';

export type RecordingKind = 'tab' | 'mic';
export type RecordingPurpose = 'recording' | 'card';
export type RecordingState = 'uploading' | 'finishing' | 'finished' | 'failed';

export interface RecordingChunkRecord {
  size: number;
  sha256: string;
}

/** meta.json of an upload session; also the shape of a finished record. */
export interface RecordingMeta {
  version: 1;
  id: string;
  kind: RecordingKind;
  purpose: RecordingPurpose;
  mimeType: string;
  title?: string;
  url?: string;
  crop?: Record<string, number>;
  startedAt?: number;
  createdAt: number;
  touchedAt: number;
  nextSeq: number;
  bytes: number;
  /** Index = seq. Emptied once the chunks are assembled. */
  chunks: RecordingChunkRecord[];
  state: RecordingState;
  durationMs?: number;
  transcribe?: boolean;
  /** The assembled file. */
  path?: string;
  /** The /finish answer, stored so a repeated /finish returns it unchanged. */
  result?: Record<string, unknown>;
  error?: string;
  finishedAt?: number;
}

export interface RecordingFinalizeOptions {
  title?: string;
  url?: string;
  durationMs?: number;
  mimeType?: string;
  transcribe?: boolean;
  source: 'extension-tab' | 'extension-mic';
  crop?: Record<string, number>;
  startedAt?: number;
  recordingId: string;
}

export interface RecordingFinalizeResult {
  ok: boolean;
  mediaId?: string;
  path?: string;
  error?: string;
}

export type RecordingFinalizer = (
  filePath: string,
  opts: RecordingFinalizeOptions,
) => Promise<RecordingFinalizeResult>;

export type MicRecordingHandler = (filePath: string, meta: RecordingMeta) => Promise<Record<string, unknown>>;

export interface RecordingsRouteDeps {
  /** Returns false after answering 401 itself. */
  requireAuth(req: http.IncomingMessage, res: http.ServerResponse): boolean;
  json(res: http.ServerResponse, status: number, body: unknown): void;
  /** Root folder for partial uploads + finished files; default derived from app.getPath('userData'). Injectable for tests. */
  rootDir?: () => string;
  now?: () => number;
  /** Test hooks; default RECORDING_CHUNK_MAX_BYTES / RECORDING_TOTAL_MAX_BYTES. */
  chunkMaxBytes?: number;
  totalMaxBytes?: number;
}

let finalizer: RecordingFinalizer | null = null;
let micHandler: MicRecordingHandler | null = null;

export function setRecordingFinalizer(fn: RecordingFinalizer | null): void {
  finalizer = fn;
}

export function setMicRecordingHandler(fn: MicRecordingHandler | null): void {
  micHandler = fn;
}

// ----- paths ---------------------------------------------------------------

function defaultRoot(): string {
  return path.join(app.getPath('userData'), 'extension-recordings');
}

function partialRoot(root: string): string {
  return path.join(root, 'extension-partial');
}

function finishedRoot(root: string): string {
  return path.join(root, 'extension-finished');
}

function recordingsDir(root: string): string {
  return path.join(root, 'recordings');
}

/** Callers pass only ids that matched ID_RE. */
function partialDir(root: string, id: string): string {
  return path.join(partialRoot(root), id);
}

function finishedFile(root: string, id: string): string {
  return path.join(finishedRoot(root), `${id}.json`);
}

// ----- small helpers -------------------------------------------------------

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errCode(err: unknown): string | undefined {
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  return typeof code === 'string' ? code : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Windows can refuse a rename for a moment while a scanner holds the file. */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      const code = errCode(err);
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EACCES' && code !== 'EBUSY')) throw err;
      await sleep(25 * (attempt + 1));
    }
  }
}

async function writeJsonFileAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fsp.writeFile(tmp, JSON.stringify(value));
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function rmQuiet(p: string): Promise<void> {
  await fsp.rm(p, { force: true, recursive: true }).catch(() => undefined);
}

/** Read and discard whatever is left of a request body. */
function drain(req: http.IncomingMessage): Promise<void> {
  if (req.readableEnded || req.destroyed) return Promise.resolve();
  return new Promise((resolve) => {
    const done = (): void => resolve();
    req.once('end', done);
    req.once('close', done);
    req.once('error', done);
    req.resume();
  });
}

function contentLength(req: http.IncomingMessage): number | null {
  const raw = req.headers['content-length'];
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** Per-key serialisation (one session's chunk commits, finish and delete never interleave). */
const locks = new Map<string, Promise<unknown>>();

async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => undefined).then(fn);
  const tail = run.catch(() => undefined);
  locks.set(key, tail);
  try {
    return await run;
  } finally {
    if (locks.get(key) === tail) locks.delete(key);
  }
}

// ----- body readers --------------------------------------------------------

type JsonBodyResult = { ok: true; value: Record<string, unknown> } | { ok: false; status: number; error: string };

/** A small JSON body, capped; an oversize body is drained, never reset. */
function readJsonBody(req: http.IncomingMessage, max = JSON_BODY_MAX_BYTES): Promise<JsonBodyResult> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > max) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) {
        resolve({ ok: false, status: 413, error: 'Payload too large' });
        return;
      }
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({ ok: true, value: {} });
        return;
      }
      try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          resolve({ ok: false, status: 400, error: 'JSON object expected' });
          return;
        }
        resolve({ ok: true, value: value as Record<string, unknown> });
      } catch {
        resolve({ ok: false, status: 400, error: 'Invalid JSON' });
      }
    });
    req.on('error', () => resolve({ ok: false, status: 400, error: 'Request aborted' }));
  });
}

interface StreamedBody {
  size: number;
  sha256: string;
  tooLarge: boolean;
  writeError: unknown;
}

/**
 * Stream a request body into `file` (created exclusively), hashing it on the way.
 * Over `max` bytes the file is abandoned and the rest of the body drained, so
 * the caller can still answer. A write failure (disk full, folder removed) also
 * drains. Rejects only when the client aborts; the caller removes `file`.
 */
async function streamBodyToFile(req: http.IncomingMessage, file: string, max: number): Promise<StreamedBody> {
  const out = fs.createWriteStream(file, { flags: 'wx' });
  const closed = new Promise<void>((resolve) => out.once('close', () => resolve()));
  let writeError: unknown = null;
  out.on('error', (err) => {
    writeError = err;
    req.resume();
  });
  const hash = crypto.createHash('sha256');
  let size = 0;
  let tooLarge = false;
  try {
    await new Promise<void>((resolve, reject) => {
      let ended = false;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (tooLarge || writeError) return;
        if (size > max) {
          tooLarge = true;
          out.destroy();
          req.resume();
          return;
        }
        hash.update(c);
        if (!out.write(c)) {
          req.pause();
          out.once('drain', () => req.resume());
        }
      });
      req.once('end', () => {
        ended = true;
        resolve();
      });
      req.once('error', (err) => reject(err));
      req.once('close', () => {
        if (!ended) reject(new Error('Request aborted'));
      });
    });
  } catch (err) {
    out.destroy();
    await closed;
    throw err;
  }
  if (tooLarge || writeError) {
    out.destroy();
  } else {
    out.end();
  }
  await closed;
  return { size, sha256: tooLarge ? '' : hash.digest('hex'), tooLarge, writeError };
}

// ----- meta storage --------------------------------------------------------

const STATES: RecordingState[] = ['uploading', 'finishing', 'finished', 'failed'];

function isMetaShape(raw: unknown, id: string): raw is RecordingMeta {
  if (!raw || typeof raw !== 'object') return false;
  const m = raw as Partial<RecordingMeta>;
  return (
    m.id === id &&
    (m.kind === 'tab' || m.kind === 'mic') &&
    Array.isArray(m.chunks) &&
    typeof m.nextSeq === 'number' &&
    typeof m.bytes === 'number' &&
    typeof m.touchedAt === 'number' &&
    typeof m.state === 'string' &&
    STATES.includes(m.state)
  );
}

function parseSessionMeta(raw: unknown, id: string): RecordingMeta | null {
  if (!isMetaShape(raw, id)) return null;
  return raw.nextSeq === raw.chunks.length ? raw : null;
}

function parseFinishedMeta(raw: unknown, id: string): RecordingMeta | null {
  if (!isMetaShape(raw, id)) return null;
  return typeof raw.path === 'string' && typeof raw.finishedAt === 'number' ? raw : null;
}

/** Keyed by the session's partial dir, so different roots (tests) never collide. */
const sessionCache = new Map<string, RecordingMeta>();
const finishedCache = new Map<string, RecordingMeta>();

async function loadSession(root: string, id: string): Promise<RecordingMeta | null> {
  const dir = partialDir(root, id);
  const metaPath = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaPath)) {
    sessionCache.delete(dir);
    return null;
  }
  const cached = sessionCache.get(dir);
  if (cached) return cached;
  try {
    const meta = parseSessionMeta(JSON.parse(await fsp.readFile(metaPath, 'utf8')), id);
    if (meta) sessionCache.set(dir, meta);
    return meta;
  } catch {
    return null;
  }
}

async function saveSession(root: string, meta: RecordingMeta): Promise<void> {
  const dir = partialDir(root, meta.id);
  await writeJsonFileAtomic(path.join(dir, 'meta.json'), meta);
  sessionCache.set(dir, meta);
}

async function loadFinished(root: string, id: string, now: number): Promise<RecordingMeta | null> {
  const file = finishedFile(root, id);
  let rec = finishedCache.get(file) ?? null;
  if (!rec) {
    try {
      rec = parseFinishedMeta(JSON.parse(await fsp.readFile(file, 'utf8')), id);
    } catch {
      rec = null;
    }
    if (rec) finishedCache.set(file, rec);
  }
  if (rec && now - (rec.finishedAt ?? 0) > STALE_MS) return null;
  return rec;
}

async function saveFinished(root: string, rec: RecordingMeta): Promise<void> {
  const file = finishedFile(root, rec.id);
  await fsp.mkdir(finishedRoot(root), { recursive: true });
  await writeJsonFileAtomic(file, rec);
  finishedCache.set(file, rec);
}

// ----- cleanup -------------------------------------------------------------

/**
 * Remove upload partials untouched for more than 24 h (and finished records of
 * the same age). Never touches assembled recordings. Returns the number of
 * partials removed.
 */
export function cleanupStaleRecordingPartials(rootDir?: string, now: number = Date.now()): number {
  const root = rootDir ?? defaultRoot();
  let removed = 0;
  const pRoot = partialRoot(root);
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(pRoot, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
    const dir = path.join(pRoot, entry.name);
    let touchedAt: number | null = null;
    try {
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8')) as { touchedAt?: unknown };
      if (typeof meta.touchedAt === 'number' && Number.isFinite(meta.touchedAt)) touchedAt = meta.touchedAt;
    } catch {
      /* no or broken meta: fall back to the folder's mtime */
    }
    if (touchedAt === null) {
      try {
        touchedAt = fs.statSync(dir).mtimeMs;
      } catch {
        continue;
      }
    }
    if (now - touchedAt <= STALE_MS) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      sessionCache.delete(dir);
      removed++;
    } catch (err) {
      console.warn('[extensionRecordings] could not remove stale partial', dir, errMessage(err));
    }
  }

  const fRoot = finishedRoot(root);
  let finished: string[] = [];
  try {
    finished = fs.readdirSync(fRoot);
  } catch {
    finished = [];
  }
  for (const name of finished) {
    const file = path.join(fRoot, name);
    try {
      if (now - fs.statSync(file).mtimeMs > STALE_MS) {
        fs.rmSync(file, { force: true });
        finishedCache.delete(file);
      }
    } catch {
      /* ignore */
    }
  }
  return removed;
}

const lastCleanupAt = new Map<string, number>();

function maybeCleanup(root: string, now: number): void {
  const last = lastCleanupAt.get(root);
  if (last !== undefined && now - last < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt.set(root, now);
  try {
    cleanupStaleRecordingPartials(root, now);
  } catch (err) {
    console.warn('[extensionRecordings] cleanup failed', errMessage(err));
  }
}

// ----- input sanitising ----------------------------------------------------

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s ? s.slice(0, max) : undefined;
}

function cleanMime(value: unknown, kind: RecordingKind): string {
  const s = typeof value === 'string' ? value.trim().slice(0, 120) : '';
  if (/^[\w.+-]+\/[\w.+-]+(\s*;[\w\s.,=+"'-]*)?$/.test(s)) return s;
  return kind === 'mic' ? 'audio/webm' : 'video/webm';
}

function cleanCrop(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, number> = {};
  let n = 0;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (n >= 16) break;
    if (!/^[A-Za-z][\w]{0,31}$/.test(k) || typeof v !== 'number' || !Number.isFinite(v)) continue;
    out[k] = v;
    n++;
  }
  return n ? out : undefined;
}

function cleanFinite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('mp4')) return m.startsWith('audio/') ? '.m4a' : '.mp4';
  if (m.includes('ogg')) return '.ogg';
  if (m.includes('wav')) return '.wav';
  return '.webm';
}

function sanitizeTitle(raw: string | undefined): string {
  if (!raw) return '';
  // eslint-disable-next-line no-control-regex -- strip control characters from a filename
  let t = raw.replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(t);
  if (chars.length > 60) t = chars.slice(0, 60).join('');
  return t.replace(/[.\s]+$/, '').replace(/^[.\s]+/, '');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function stampOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
}

/** e.g. `Gum tab recording 2026-10-08 13-45-12 - Some page.webm` */
function recordingFileName(meta: RecordingMeta): { stem: string; ext: string } {
  const title = sanitizeTitle(meta.title);
  const stem = `Gum ${meta.kind} recording ${stampOf(meta.startedAt ?? meta.createdAt)}${title ? ` - ${title}` : ''}`;
  return { stem, ext: extensionForMime(meta.mimeType) };
}

function uniquePath(dir: string, stem: string, ext: string): string {
  let candidate = path.join(dir, `${stem}${ext}`);
  for (let i = 2; fs.existsSync(candidate) && i < 1000; i++) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
  }
  return candidate;
}

// ----- assembly + finalize -------------------------------------------------

/** Concatenate the chunks in seq order, streamed, into a new file under `outDir`. */
async function assembleChunks(meta: RecordingMeta, dir: string, outDir: string): Promise<string> {
  await fsp.mkdir(outDir, { recursive: true });
  const tmp = path.join(outDir, `.${meta.id}.assembling`);
  const out = fs.createWriteStream(tmp);
  let outError: unknown = null;
  out.on('error', (err) => {
    outError = err;
  });
  const closed = new Promise<void>((resolve) => out.once('close', () => resolve()));
  try {
    for (let seq = 0; seq < meta.nextSeq; seq++) {
      const part = path.join(dir, `${seq}.part`);
      const st = await fsp.stat(part);
      if (st.size !== meta.chunks[seq].size) throw new Error(`Chunk ${seq} is damaged (size mismatch)`);
      for await (const buf of fs.createReadStream(part)) {
        if (outError) throw outError;
        if (!out.write(buf)) await once(out, 'drain');
      }
    }
    if (outError) throw outError;
    out.end();
    await closed;
    if (outError) throw outError;
    const st = await fsp.stat(tmp);
    if (st.size !== meta.bytes) throw new Error('Assembled recording has the wrong size');
    const { stem, ext } = recordingFileName(meta);
    const finalPath = uniquePath(outDir, stem, ext);
    await renameWithRetry(tmp, finalPath);
    return finalPath;
  } catch (err) {
    out.destroy();
    await closed;
    await rmQuiet(tmp);
    throw err;
  }
}

/** Hand the assembled file to the registered consumer and store the outcome on `rec`. */
async function runConsumer(root: string, rec: RecordingMeta, now: () => number): Promise<void> {
  const filePath = rec.path ?? '';
  const base: Record<string, unknown> = { ok: true, id: rec.id, path: filePath };
  let result: Record<string, unknown>;
  try {
    if (rec.kind === 'mic' && rec.purpose === 'card') {
      if (!micHandler) {
        result = { ...base, finalized: false };
      } else {
        const out = await micHandler(filePath, { ...rec });
        result = { ...base, ...out, id: rec.id };
        if (typeof result.path !== 'string' || !result.path) result.path = filePath;
      }
    } else if (!finalizer) {
      result = { ...base, finalized: false };
    } else {
      const out = await finalizer(filePath, {
        title: rec.title,
        url: rec.url,
        durationMs: rec.durationMs,
        mimeType: rec.mimeType,
        transcribe: rec.transcribe,
        source: rec.kind === 'mic' ? 'extension-mic' : 'extension-tab',
        crop: rec.crop,
        startedAt: rec.startedAt,
        recordingId: rec.id,
      });
      result = {
        ...base,
        ...out,
        ok: out?.ok === true,
        id: rec.id,
        path: out?.path || filePath,
        sourcePath: filePath,
        finalized: out?.ok === true,
      };
    }
  } catch (err) {
    result = { ...base, ok: false, error: errMessage(err) };
  }
  const failed = result.ok === false;
  rec.state = failed ? 'failed' : 'finished';
  rec.result = result;
  rec.error = failed ? String(result.error ?? 'Finalize failed') : undefined;
  rec.touchedAt = now();
  rec.finishedAt = now();
  try {
    await saveFinished(root, rec);
  } catch (err) {
    console.warn('[extensionRecordings] could not store finished record', errMessage(err));
  }
}

/**
 * Finalizers in flight, by recording id. With `async: true` on /finish the
 * route answers 202 at once and the conversion runs here; GET /status reports
 * `finishing` until it settles. One run per id, however often /finish repeats.
 */
const consumersInFlight = new Map<string, Promise<void>>();

function startConsumer(root: string, rec: RecordingMeta, now: () => number): Promise<void> {
  const current = consumersInFlight.get(rec.id);
  if (current) return current;
  const run = runConsumer(root, rec, now)
    .catch((err) => console.warn('[extensionRecordings] finalize failed', errMessage(err)))
    .finally(() => consumersInFlight.delete(rec.id));
  consumersInFlight.set(rec.id, run);
  return run;
}

/** Test hook: resolves once every background finalize has settled. */
export async function __recordingConsumersIdle(): Promise<void> {
  while (consumersInFlight.size) await Promise.all([...consumersInFlight.values()]);
}

function answerPending(deps: RecordingsRouteDeps, res: http.ServerResponse, id: string): void {
  deps.json(res, 202, { ok: true, id, state: 'finishing', pending: true });
}

function answerFinished(deps: RecordingsRouteDeps, res: http.ServerResponse, rec: RecordingMeta): void {
  const body = rec.result ?? { ok: true, id: rec.id, path: rec.path };
  deps.json(res, rec.state === 'failed' ? 500 : 200, body);
}

// ----- routes --------------------------------------------------------------

interface Ctx {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  deps: RecordingsRouteDeps;
  root: string;
  now: () => number;
  chunkMax: number;
  totalMax: number;
}

async function findActiveSession(root: string, now: number): Promise<RecordingMeta | null> {
  let names: string[] = [];
  try {
    names = await fsp.readdir(partialRoot(root));
  } catch {
    return null;
  }
  let best: RecordingMeta | null = null;
  for (const name of names) {
    if (!ID_RE.test(name)) continue;
    const s = await loadSession(root, name);
    if (!s || (s.state !== 'uploading' && s.state !== 'finishing')) continue;
    if (now - s.touchedAt >= SESSION_IDLE_MS) continue;
    if (!best || s.touchedAt > best.touchedAt) best = s;
  }
  return best;
}

async function handleCreate(ctx: Ctx): Promise<void> {
  const { req, res, deps, root } = ctx;
  const parsed = await readJsonBody(req);
  if (parsed.ok === false) {
    deps.json(res, parsed.status, { ok: false, error: parsed.error });
    return;
  }
  const body = parsed.value;
  const kind = body.kind;
  if (kind !== 'tab' && kind !== 'mic') {
    deps.json(res, 400, { ok: false, error: "kind must be 'tab' or 'mic'" });
    return;
  }
  const purpose: RecordingPurpose = body.purpose === 'card' ? 'card' : 'recording';
  await withLock(`create:${root}`, async () => {
    const now = ctx.now();
    const active = await findActiveSession(root, now);
    if (active) {
      deps.json(res, 409, { ok: false, error: 'busy', activeId: active.id });
      return;
    }
    const id = crypto.randomUUID();
    const meta: RecordingMeta = {
      version: 1,
      id,
      kind,
      purpose,
      mimeType: cleanMime(body.mimeType, kind),
      title: cleanString(body.title, 300),
      url: cleanString(body.url, 2048),
      crop: cleanCrop(body.crop),
      startedAt: cleanFinite(body.startedAt),
      createdAt: now,
      touchedAt: now,
      nextSeq: 0,
      bytes: 0,
      chunks: [],
      state: 'uploading',
    };
    await fsp.mkdir(partialDir(root, id), { recursive: true });
    await saveSession(root, meta);
    deps.json(res, 200, { ok: true, id, chunkMax: ctx.chunkMax, nextSeq: 0 });
  });
}

async function handleChunk(ctx: Ctx, id: string, seq: number): Promise<void> {
  const { req, res, deps, root } = ctx;
  const session = await loadSession(root, id);
  if (!session) {
    await drain(req);
    deps.json(res, 404, { ok: false, error: 'Unknown recording' });
    return;
  }
  if (session.state !== 'uploading') {
    await drain(req);
    deps.json(res, 409, { ok: false, error: 'not uploading', state: session.state, nextSeq: session.nextSeq });
    return;
  }
  const declared = contentLength(req);
  if (declared !== null && declared > ctx.chunkMax) {
    await drain(req);
    deps.json(res, 413, { ok: false, error: 'chunk too large' });
    return;
  }
  if (seq > session.nextSeq) {
    await drain(req);
    deps.json(res, 409, { ok: false, error: 'gap', nextSeq: session.nextSeq });
    return;
  }
  if (seq === session.nextSeq && declared !== null && session.bytes + declared > ctx.totalMax) {
    await drain(req);
    deps.json(res, 413, { ok: false, error: 'recording too large', nextSeq: session.nextSeq });
    return;
  }

  const dir = partialDir(root, id);
  const tmp = path.join(dir, `${seq}.${crypto.randomUUID()}.tmp`);
  let body: StreamedBody;
  try {
    body = await streamBodyToFile(req, tmp, ctx.chunkMax);
  } catch {
    // Client went away mid-chunk: nothing was committed.
    await rmQuiet(tmp);
    if (!res.headersSent && !res.destroyed) deps.json(res, 400, { ok: false, error: 'Request aborted' });
    return;
  }
  if (body.tooLarge) {
    await rmQuiet(tmp);
    deps.json(res, 413, { ok: false, error: 'chunk too large' });
    return;
  }
  if (body.writeError) {
    await rmQuiet(tmp);
    if (!(await loadSession(root, id))) {
      deps.json(res, 404, { ok: false, error: 'Unknown recording' });
      return;
    }
    const full = isStorageFullError(body.writeError);
    deps.json(res, full ? 507 : 500, { ok: false, error: full ? 'storage full' : errMessage(body.writeError) });
    return;
  }

  await withLock(id, async () => {
    const s = await loadSession(root, id);
    if (!s) {
      await rmQuiet(tmp);
      deps.json(res, 404, { ok: false, error: 'Unknown recording' });
      return;
    }
    if (s.state !== 'uploading') {
      await rmQuiet(tmp);
      deps.json(res, 409, { ok: false, error: 'not uploading', state: s.state, nextSeq: s.nextSeq });
      return;
    }
    if (seq < s.nextSeq) {
      await rmQuiet(tmp);
      const stored = s.chunks[seq];
      if (stored && stored.size === body.size && stored.sha256 === body.sha256) {
        deps.json(res, 200, { ok: true, duplicate: true, nextSeq: s.nextSeq });
      } else {
        deps.json(res, 409, { ok: false, error: 'conflict', nextSeq: s.nextSeq });
      }
      return;
    }
    if (seq > s.nextSeq) {
      await rmQuiet(tmp);
      deps.json(res, 409, { ok: false, error: 'gap', nextSeq: s.nextSeq });
      return;
    }
    if (s.bytes + body.size > ctx.totalMax) {
      await rmQuiet(tmp);
      deps.json(res, 413, { ok: false, error: 'recording too large', nextSeq: s.nextSeq });
      return;
    }
    try {
      // The chunk only counts once meta.json says so; a crash between the two
      // leaves a .part that the next PUT of this seq simply replaces.
      await renameWithRetry(tmp, path.join(dir, `${seq}.part`));
      const next: RecordingMeta = {
        ...s,
        chunks: [...s.chunks, { size: body.size, sha256: body.sha256 }],
        nextSeq: s.nextSeq + 1,
        bytes: s.bytes + body.size,
        touchedAt: ctx.now(),
      };
      await saveSession(root, next);
      deps.json(res, 200, { ok: true, nextSeq: next.nextSeq, bytes: next.bytes });
    } catch (err) {
      await rmQuiet(tmp);
      const full = isStorageFullError(err);
      deps.json(res, full ? 507 : 500, { ok: false, error: full ? 'storage full' : errMessage(err), nextSeq: s.nextSeq });
    }
  });
}

async function handleFinish(ctx: Ctx, id: string): Promise<void> {
  const { req, res, deps, root } = ctx;
  const parsed = await readJsonBody(req);
  if (parsed.ok === false) {
    deps.json(res, parsed.status, { ok: false, error: parsed.error });
    return;
  }
  const body = parsed.value;
  let totalChunks: number | undefined;
  if (body.totalChunks !== undefined && body.totalChunks !== null) {
    if (typeof body.totalChunks !== 'number' || !Number.isInteger(body.totalChunks) || body.totalChunks < 0) {
      deps.json(res, 400, { ok: false, error: 'totalChunks must be a non-negative integer' });
      return;
    }
    totalChunks = body.totalChunks;
  }
  const durationMs = cleanFinite(body.durationMs);
  const transcribe = typeof body.transcribe === 'boolean' ? body.transcribe : undefined;
  // `async: true` (the extension since round 2): answer 202 and convert in the
  // background; the caller polls GET /status. Without it the request waits for
  // the conversion, as older extension builds expect.
  const asyncFinish = body.async === true;

  await withLock(id, async () => {
    const session = await loadSession(root, id);
    if (!session || session.state === 'finished') {
      const rec = await loadFinished(root, id, ctx.now());
      if (!rec) {
        deps.json(res, 404, { ok: false, error: 'Unknown recording' });
        return;
      }
      // A finalize that crashed or failed is retried on the stored file;
      // one still running is never started twice.
      if (rec.state !== 'finished' && rec.path && fs.existsSync(rec.path)) {
        const run = startConsumer(root, rec, ctx.now);
        if (asyncFinish) {
          answerPending(deps, res, id);
          return;
        }
        await run;
      }
      answerFinished(deps, res, rec);
      return;
    }
    if (totalChunks !== undefined && totalChunks !== session.nextSeq) {
      deps.json(res, 409, { ok: false, error: 'chunk count mismatch', nextSeq: session.nextSeq });
      return;
    }
    if (session.nextSeq === 0) {
      deps.json(res, 400, { ok: false, error: 'no chunks uploaded', nextSeq: 0 });
      return;
    }

    const finishing: RecordingMeta = {
      ...session,
      state: 'finishing',
      touchedAt: ctx.now(),
      durationMs: durationMs ?? session.durationMs,
      transcribe: transcribe ?? session.transcribe,
      error: undefined,
    };
    await saveSession(root, finishing);

    const dir = partialDir(root, id);
    let filePath: string;
    try {
      filePath = await assembleChunks(finishing, dir, recordingsDir(root));
    } catch (err) {
      const full = isStorageFullError(err);
      const failed: RecordingMeta = { ...finishing, state: 'failed', error: errMessage(err), touchedAt: ctx.now() };
      await saveSession(root, failed).catch(() => undefined);
      deps.json(res, full ? 507 : 500, {
        ok: false,
        error: full ? 'storage full' : errMessage(err),
        nextSeq: failed.nextSeq,
      });
      return;
    }

    const rec: RecordingMeta = { ...finishing, chunks: [], path: filePath, finishedAt: ctx.now() };
    try {
      await saveFinished(root, rec);
    } catch (err) {
      // The assembled file exists; keep going, status falls back to memory.
      finishedCache.set(finishedFile(root, id), rec);
      console.warn('[extensionRecordings] could not store finished record', errMessage(err));
    }
    // Marked first, so a partial folder that cannot be removed right now (a
    // scanner holding a chunk) is never assembled a second time.
    await saveSession(root, { ...finishing, state: 'finished', path: filePath, finishedAt: rec.finishedAt }).catch(
      () => undefined,
    );
    await rmQuiet(dir);
    if (!fs.existsSync(dir)) sessionCache.delete(dir);

    const run = startConsumer(root, rec, ctx.now);
    if (asyncFinish) {
      answerPending(deps, res, id);
      return;
    }
    await run;
    answerFinished(deps, res, rec);
  });
}

async function handleStatus(ctx: Ctx, id: string): Promise<void> {
  const { res, deps, root } = ctx;
  const s = await loadSession(root, id);
  if (s && s.state !== 'finished') {
    deps.json(res, 200, {
      ok: true,
      id,
      state: s.state,
      nextSeq: s.nextSeq,
      bytes: s.bytes,
      ...(s.error ? { error: s.error } : {}),
    });
    return;
  }
  const rec = await loadFinished(root, id, ctx.now());
  if (rec) {
    deps.json(res, 200, {
      ok: true,
      id,
      state: rec.state,
      nextSeq: rec.nextSeq,
      bytes: rec.bytes,
      path: rec.path,
      ...(rec.result ? { result: rec.result } : {}),
      ...(rec.error ? { error: rec.error } : {}),
    });
    return;
  }
  deps.json(res, 404, { ok: false, error: 'Unknown recording' });
}

async function handleDelete(ctx: Ctx, id: string): Promise<void> {
  const { res, deps, root } = ctx;
  await withLock(id, async () => {
    const s = await loadSession(root, id);
    if (s) {
      const dir = partialDir(root, id);
      await fsp.rm(dir, { recursive: true, force: true });
      sessionCache.delete(dir);
      deps.json(res, 200, { ok: true });
      return;
    }
    const rec = await loadFinished(root, id, ctx.now());
    if (rec) {
      // Only partial uploads are ever removed here, never a finished file.
      deps.json(res, 409, { ok: false, error: 'already finished', state: rec.state });
      return;
    }
    deps.json(res, 404, { ok: false, error: 'Unknown recording' });
  });
}

function methodNotAllowed(ctx: Ctx, allow: string): void {
  ctx.res.setHeader('Allow', allow);
  ctx.req.resume();
  ctx.deps.json(ctx.res, 405, { ok: false, error: 'Method not allowed' });
}

/** Handles /v1/recordings* routes. Returns true when it answered the request. */
export async function handleRecordingsRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  deps: RecordingsRouteDeps,
): Promise<boolean> {
  if (pathname !== PREFIX && !pathname.startsWith(`${PREFIX}/`)) return false;

  if (!deps.requireAuth(req, res)) {
    req.resume();
    return true;
  }

  const now = deps.now ?? Date.now;
  const ctx: Ctx = {
    req,
    res,
    deps,
    root: deps.rootDir ? deps.rootDir() : defaultRoot(),
    now,
    chunkMax: deps.chunkMaxBytes ?? RECORDING_CHUNK_MAX_BYTES,
    totalMax: deps.totalMaxBytes ?? RECORDING_TOTAL_MAX_BYTES,
  };
  const method = req.method ?? 'GET';

  try {
    maybeCleanup(ctx.root, now());

    if (pathname === PREFIX) {
      if (method !== 'POST') methodNotAllowed(ctx, 'POST');
      else await handleCreate(ctx);
      return true;
    }

    const parts = pathname.slice(PREFIX.length + 1).split('/');
    const id = parts[0] ?? '';
    if (!ID_RE.test(id)) {
      req.resume();
      deps.json(res, 404, { ok: false, error: 'Not found' });
      return true;
    }

    if (parts.length === 1) {
      if (method !== 'DELETE') methodNotAllowed(ctx, 'DELETE');
      else {
        req.resume();
        await handleDelete(ctx, id);
      }
      return true;
    }
    if (parts.length === 2 && parts[1] === 'status') {
      if (method !== 'GET') methodNotAllowed(ctx, 'GET');
      else {
        req.resume();
        await handleStatus(ctx, id);
      }
      return true;
    }
    if (parts.length === 2 && parts[1] === 'finish') {
      if (method !== 'POST') methodNotAllowed(ctx, 'POST');
      else await handleFinish(ctx, id);
      return true;
    }
    if (parts.length === 3 && parts[1] === 'chunks') {
      if (!SEQ_RE.test(parts[2])) {
        req.resume();
        deps.json(res, 400, { ok: false, error: 'Invalid chunk sequence' });
        return true;
      }
      if (method !== 'PUT') methodNotAllowed(ctx, 'PUT');
      else await handleChunk(ctx, id, Number(parts[2]));
      return true;
    }

    req.resume();
    deps.json(res, 404, { ok: false, error: 'Not found' });
    return true;
  } catch (err) {
    console.error('[extensionRecordings] request failed', err);
    req.resume();
    if (!res.headersSent && !res.writableEnded) {
      const full = isStorageFullError(err);
      deps.json(res, full ? 507 : 500, { ok: false, error: full ? 'storage full' : errMessage(err) });
    }
    return true;
  }
}

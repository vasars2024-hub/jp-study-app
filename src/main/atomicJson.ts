/**
 * The one way main-process code persists a JSON store.
 *
 * Audit finding (robust #3): 48 modules read JSON from userData and only three
 * recovered from a damaged file; 19 wrote in place (a crash mid-write leaves a
 * truncated file), 14+ private copies of an "atomic write" existed and none of
 * them fsynced or kept a previous copy, and the common read pattern was
 * `try { JSON.parse(...) } catch { return [] }` — so the next save overwrote a
 * damaged-but-recoverable library.json with an empty list.
 *
 * Contract:
 *
 * - **Atomic write** — data goes to a unique temp file in the same directory,
 *   is fsynced, and is renamed over the target. Windows `EPERM`/`EBUSY` from a
 *   scanner or indexer briefly holding the file is retried with backoff.
 * - **Last-good copy** — before the swap, the current file is copied to
 *   `<file>.bak` (on by default; caches opt out with `backup: false`). A file
 *   this process did not write itself is parsed first and only promoted when it
 *   is intact, so a damaged file never overwrites a good `.bak`.
 * - **Read with fallback** — a file that fails to parse (or fails the caller's
 *   `validate`) is moved aside to `<file>.corrupt-<timestamp>` — never
 *   overwritten — and the `.bak` is served and copied back into place. Only when
 *   both are unusable does the caller's fallback come back, and the damaged copy
 *   is still on disk for manual recovery.
 * - A MISSING primary is not "damaged": it is a first run or a deliberate
 *   delete, so `.bak` is not resurrected for it (use `removeJsonStore` to delete
 *   a store together with its `.bak`).
 * - **Freeze** — a restore swaps files underneath live modules; while frozen,
 *   writes are held instead of landing on disk, then either dropped (restore
 *   committed, app relaunches) or replayed (restore rolled back).
 *
 * Deliberately dependency-free and electron-free so every store and its tests
 * can use it; `setAtomicJsonLogger` wires it to the diagnostics log in main.ts.
 */
import fs from 'node:fs';
import path from 'node:path';

export const LAST_GOOD_SUFFIX = '.bak';
const CORRUPT_INFIX = '.corrupt-';
/** Damaged copies kept per store — enough to recover from, bounded for a full disk. */
const MAX_CORRUPT_COPIES = 3;

export type AtomicJsonLogger = (severity: 'info' | 'warn' | 'error', operation: string, detail: string) => void;

let logger: AtomicJsonLogger = (severity, operation, detail) => {
  if (severity !== 'info') console.warn(`[atomicJson] ${operation}: ${detail}`);
};

export function setAtomicJsonLogger(next: AtomicJsonLogger): void {
  logger = next;
}

export interface AtomicWriteOptions {
  /** File mode for a newly created file (e.g. 0o600 for secrets). */
  mode?: number;
  /** Keep `<file>.bak` as the last-good copy. Default true; caches pass false. */
  backup?: boolean;
}

export interface JsonWriteOptions extends AtomicWriteOptions {
  /** `JSON.stringify` indent. Default 2. */
  space?: number;
}

export interface JsonReadOptions {
  /** Reject a parsed value that has the wrong shape — treated exactly like a parse failure. */
  validate?: (value: unknown) => boolean;
}

export type JsonReadSource = 'primary' | 'backup' | 'missing' | 'fallback';

export interface JsonReadResult<T> {
  value: T;
  source: JsonReadSource;
  /** Where the damaged primary was moved, when it was. */
  quarantinedTo?: string;
  error?: string;
}

const norm = (file: string): string => path.resolve(file).toLowerCase();

/** Files whose current on-disk content this process wrote, so it is known to be intact. */
const writtenThisSession = new Set<string>();

// ── freeze (restore) ─────────────────────────────────────────────────────────

interface HeldWrite {
  file: string;
  data: string | Uint8Array;
  options: AtomicWriteOptions;
}

let frozen = false;
const held = new Map<string, HeldWrite>();

/** Hold every write from now on (a restore is swapping files underneath). */
export function freezeAtomicWrites(): void {
  frozen = true;
}

/** Stop holding writes; `replay` lands the newest held write per file, otherwise they are dropped. */
export function thawAtomicWrites(options: { replay: boolean }): void {
  frozen = false;
  const pending = Array.from(held.values());
  held.clear();
  if (!options.replay) {
    if (pending.length) logger('info', 'held-writes-dropped', `${pending.length} write(s) superseded by restore`);
    return;
  }
  for (const w of pending) {
    try {
      writeFileAtomicSync(w.file, w.data, w.options);
    } catch (err) {
      logger('error', 'held-write-replay-failed', `${w.file}: ${errText(err)}`);
    }
  }
}

export function atomicWritesFrozen(): boolean {
  return frozen;
}

// ── primitives ───────────────────────────────────────────────────────────────

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function errCode(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code?: unknown }).code) : '';
}

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES', 'EAGAIN']);
const RENAME_BACKOFF_MS = [10, 25, 60, 120, 250];

function sleepSync(ms: number): void {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      /* spin — Atomics.wait unavailable */
    }
  }
}

function renameWithRetrySync(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (!RETRYABLE.has(errCode(err)) || attempt >= RENAME_BACKOFF_MS.length) throw err;
      sleepSync(RENAME_BACKOFF_MS[attempt]);
    }
  }
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (err) {
      if (!RETRYABLE.has(errCode(err)) || attempt >= RENAME_BACKOFF_MS.length) throw err;
      await new Promise((r) => setTimeout(r, RENAME_BACKOFF_MS[attempt]));
    }
  }
}

let tmpCounter = 0;
function tempPathFor(file: string): string {
  tmpCounter = (tmpCounter + 1) % 1_000_000;
  return `${file}.${process.pid}.${Date.now().toString(36)}${tmpCounter}.tmp`;
}

function isParseableJson(text: string): boolean {
  try {
    JSON.parse(stripBom(text));
    return true;
  } catch {
    return false;
  }
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Keep only the newest MAX_CORRUPT_COPIES damaged copies of `file`. */
function pruneCorruptCopies(file: string): void {
  try {
    const dir = path.dirname(file);
    const prefix = `${path.basename(file)}${CORRUPT_INFIX}`;
    const copies = fs.readdirSync(dir).filter((n) => n.startsWith(prefix)).sort();
    for (const old of copies.slice(0, Math.max(0, copies.length - MAX_CORRUPT_COPIES))) {
      fs.rmSync(path.join(dir, old), { force: true });
    }
  } catch {
    /* pruning is housekeeping */
  }
}

/** Move a damaged file aside so nothing overwrites it. Returns the new path, or null. */
export function quarantineFile(file: string): string | null {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = `${file}${CORRUPT_INFIX}${stamp}`;
  try {
    renameWithRetrySync(file, target);
    pruneCorruptCopies(file);
    return target;
  } catch (err) {
    if (errCode(err) === 'ENOENT') return null;
    // Could not move it — copy instead so the damaged bytes survive the next write.
    try {
      fs.copyFileSync(file, target);
      pruneCorruptCopies(file);
      return target;
    } catch {
      logger('error', 'quarantine-failed', `${file}: ${errText(err)}`);
      return null;
    }
  }
}

/**
 * Refresh `<file>.bak` from the current file before it is replaced. A file this
 * process didn't write is checked first when `json` is set; a damaged one is
 * quarantined instead of promoted.
 */
function keepLastGood(file: string, json: boolean): void {
  let exists = false;
  try {
    exists = fs.statSync(file).isFile();
  } catch {
    return;
  }
  if (!exists) return;
  if (json && !writtenThisSession.has(norm(file))) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      return;
    }
    if (!isParseableJson(text)) {
      const moved = quarantineFile(file);
      logger('error', 'json-corrupt-before-write', `${file} → ${moved ?? '(could not move)'}`);
      return;
    }
  }
  try {
    fs.copyFileSync(file, `${file}${LAST_GOOD_SUFFIX}`);
  } catch (err) {
    logger('warn', 'last-good-copy-failed', `${file}: ${errText(err)}`);
  }
}

function writeImplSync(file: string, data: string | Uint8Array, options: AtomicWriteOptions, json: boolean): void {
  if (frozen) {
    held.set(norm(file), { file, data, options });
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = tempPathFor(file);
  try {
    const fd = fs.openSync(tmp, 'w', options.mode ?? 0o666);
    try {
      fs.writeFileSync(fd, data);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (options.backup !== false) keepLastGood(file, json);
    renameWithRetrySync(tmp, file);
    writtenThisSession.add(norm(file));
  } finally {
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* the rename consumed it, or it never existed */
    }
  }
}

/** Atomically replace `file` with `data` (temp + fsync + rename, `.bak` kept). */
export function writeFileAtomicSync(file: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): void {
  writeImplSync(file, data, options, false);
}

/** Atomically write `value` as JSON. */
export function writeJsonAtomicSync(file: string, value: unknown, options: JsonWriteOptions = {}): void {
  const text = JSON.stringify(value, null, options.space ?? 2);
  if (text === undefined) throw new TypeError(`writeJsonAtomicSync: value for ${file} is not JSON-serialisable`);
  writeImplSync(file, text, options, true);
}

const chains = new Map<string, Promise<void>>();

async function writeImplAsync(file: string, data: string | Uint8Array, options: AtomicWriteOptions, json: boolean): Promise<void> {
  if (frozen) {
    held.set(norm(file), { file, data, options });
    return;
  }
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const tmp = tempPathFor(file);
  try {
    const handle = await fs.promises.open(tmp, 'w', options.mode ?? 0o666);
    try {
      await handle.writeFile(data);
      await handle.sync();
    } finally {
      await handle.close();
    }
    if (options.backup !== false) keepLastGood(file, json);
    await renameWithRetry(tmp, file);
    writtenThisSession.add(norm(file));
  } finally {
    await fs.promises.rm(tmp, { force: true }).catch(() => undefined);
  }
}

/** Serialise async writes per file so two overlapping saves can't interleave. */
function enqueue(file: string, run: () => Promise<void>): Promise<void> {
  const key = norm(file);
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(run);
  chains.set(key, next);
  void next.finally(() => {
    if (chains.get(key) === next) chains.delete(key);
  }).catch(() => undefined);
  return next;
}

export function writeFileAtomic(file: string, data: string | Uint8Array, options: AtomicWriteOptions = {}): Promise<void> {
  return enqueue(file, () => writeImplAsync(file, data, options, false));
}

export function writeJsonAtomic(file: string, value: unknown, options: JsonWriteOptions = {}): Promise<void> {
  const text = JSON.stringify(value, null, options.space ?? 2);
  if (text === undefined) {
    return Promise.reject(new TypeError(`writeJsonAtomic: value for ${file} is not JSON-serialisable`));
  }
  return enqueue(file, () => writeImplAsync(file, text, options, true));
}

// ── reads ────────────────────────────────────────────────────────────────────

type Attempt =
  | { kind: 'ok'; value: unknown }
  | { kind: 'missing' }
  | { kind: 'bad'; error: string };

function parseAttempt(text: string, validate?: (value: unknown) => boolean): Attempt {
  try {
    const value: unknown = JSON.parse(stripBom(text));
    if (validate && !validate(value)) return { kind: 'bad', error: 'unexpected shape' };
    return { kind: 'ok', value };
  } catch (err) {
    return { kind: 'bad', error: errText(err) };
  }
}

function readAttemptSync(file: string, validate?: (value: unknown) => boolean): Attempt {
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (errCode(err) === 'ENOENT' || errCode(err) === 'ENOTDIR') return { kind: 'missing' };
    return { kind: 'bad', error: errText(err) };
  }
  return parseAttempt(text, validate);
}

async function readAttempt(file: string, validate?: (value: unknown) => boolean): Promise<Attempt> {
  let text: string;
  try {
    text = await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if (errCode(err) === 'ENOENT' || errCode(err) === 'ENOTDIR') return { kind: 'missing' };
    return { kind: 'bad', error: errText(err) };
  }
  return parseAttempt(text, validate);
}

function resolveFallback<T>(fallback: T | (() => T)): T {
  return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
}

/** Decide what to serve after the primary failed; shared by the sync and async readers. */
function recover<T>(
  file: string,
  primary: Exclude<Attempt, { kind: 'ok' }>,
  backup: Attempt | null,
  fallback: T | (() => T),
  quarantinedTo: string | undefined,
): JsonReadResult<T> {
  if (primary.kind === 'missing') {
    return { value: resolveFallback(fallback), source: 'missing' };
  }
  if (backup?.kind === 'ok') {
    logger('warn', 'json-restored-from-last-good', `${file} (damaged copy: ${quarantinedTo ?? 'not moved'})`);
    try {
      // Put the last-good copy back so every other reader sees it too.
      const tmp = tempPathFor(file);
      fs.copyFileSync(`${file}${LAST_GOOD_SUFFIX}`, tmp);
      renameWithRetrySync(tmp, file);
    } catch (err) {
      logger('warn', 'last-good-reinstate-failed', `${file}: ${errText(err)}`);
    }
    return { value: backup.value as T, source: 'backup', quarantinedTo, error: primary.error };
  }
  logger('error', 'json-unrecoverable', `${file}: ${primary.error} (damaged copy: ${quarantinedTo ?? 'not moved'})`);
  return { value: resolveFallback(fallback), source: 'fallback', quarantinedTo, error: primary.error };
}

/** Read a JSON store, falling back to its last-good copy, then to `fallback`. */
export function readJsonDetailedSync<T>(
  file: string,
  fallback: T | (() => T),
  options: JsonReadOptions = {},
): JsonReadResult<T> {
  const primary = readAttemptSync(file, options.validate);
  if (primary.kind === 'ok') return { value: primary.value as T, source: 'primary' };
  const quarantinedTo = primary.kind === 'bad' ? quarantineFile(file) ?? undefined : undefined;
  const backup = primary.kind === 'bad' ? readAttemptSync(`${file}${LAST_GOOD_SUFFIX}`, options.validate) : null;
  return recover(file, primary, backup, fallback, quarantinedTo);
}

export function readJsonSync<T>(file: string, fallback: T | (() => T), options: JsonReadOptions = {}): T {
  return readJsonDetailedSync(file, fallback, options).value;
}

export async function readJsonDetailed<T>(
  file: string,
  fallback: T | (() => T),
  options: JsonReadOptions = {},
): Promise<JsonReadResult<T>> {
  const primary = await readAttempt(file, options.validate);
  if (primary.kind === 'ok') return { value: primary.value as T, source: 'primary' };
  const quarantinedTo = primary.kind === 'bad' ? quarantineFile(file) ?? undefined : undefined;
  const backup = primary.kind === 'bad' ? await readAttempt(`${file}${LAST_GOOD_SUFFIX}`, options.validate) : null;
  return recover(file, primary, backup, fallback, quarantinedTo);
}

export async function readJson<T>(file: string, fallback: T | (() => T), options: JsonReadOptions = {}): Promise<T> {
  return (await readJsonDetailed(file, fallback, options)).value;
}

/** Delete a store together with its last-good copy (a deliberate reset). */
export function removeJsonStore(file: string): void {
  for (const f of [file, `${file}${LAST_GOOD_SUFFIX}`]) {
    try {
      fs.rmSync(f, { force: true });
    } catch (err) {
      logger('warn', 'remove-failed', `${f}: ${errText(err)}`);
    }
  }
  writtenThisSession.delete(norm(file));
}

// ── flush-on-exit registry ───────────────────────────────────────────────────

const flushers = new Set<() => void>();

/** Register a debounced writer's flush; `flushAllJsonWriters` runs them on quit. */
export function registerJsonFlusher(flush: () => void): () => void {
  flushers.add(flush);
  return () => flushers.delete(flush);
}

export function flushAllJsonWriters(): void {
  for (const flush of Array.from(flushers)) {
    try {
      flush();
    } catch (err) {
      logger('error', 'flush-failed', errText(err));
    }
  }
}

/** Test hook. */
export function __resetAtomicJsonForTests(): void {
  writtenThisSession.clear();
  held.clear();
  frozen = false;
  chains.clear();
  // `flushers` stays: modules register once at import time.
}

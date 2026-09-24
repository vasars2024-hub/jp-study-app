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
 *   `validate`) is copied aside to `<file>.corrupt-<timestamp>` — never
 *   overwritten — and the `.bak` is served and copied back over it (temp +
 *   rename, so a failed copy-back leaves the damaged primary, not a hole). Only
 *   when both are unusable does the caller's fallback come back, and the
 *   damaged copy is still on disk for manual recovery.
 * - **I/O errors are not damage** — a read refused by a lock (antivirus,
 *   OneDrive, indexer: EBUSY/EPERM/EACCES/EMFILE…) is retried with backoff and,
 *   if it persists, answered from `.bak` (or the fallback) WITHOUT moving the
 *   healthy primary anywhere.
 * - A missing primary with no `.bak` is a first run. A missing primary WITH a
 *   `.bak` is damage (a copy-back that failed half-way, a crash): the `.bak` is
 *   served and reinstated, and a write that finds that state first copies the
 *   `.bak` aside so the write after it cannot overwrite the only good copy.
 *   Deliberate deletes go through `removeJsonStore`, which removes both.
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

function corruptTarget(file: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let target = `${file}${CORRUPT_INFIX}${stamp}`;
  for (let n = 2; fs.existsSync(target); n++) target = `${file}${CORRUPT_INFIX}${stamp}-${n}`;
  return target;
}

/**
 * Copy a file aside as `<file>.corrupt-<timestamp>`, leaving it in place — the
 * caller replaces it atomically afterwards, so there is never a moment with no
 * primary at all. Returns the copy's path, or null.
 */
export function quarantineCopy(file: string): string | null {
  const target = corruptTarget(file);
  try {
    fs.copyFileSync(file, target);
    pruneCorruptCopies(file);
    return target;
  } catch (err) {
    if (errCode(err) !== 'ENOENT') logger('error', 'quarantine-failed', `${file}: ${errText(err)}`);
    return null;
  }
}

/** Move a damaged file aside so nothing overwrites it. Returns the new path, or null. */
export function quarantineFile(file: string): string | null {
  const target = corruptTarget(file);
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
    exists = false;
  }
  if (!exists) {
    // A `.bak` with no primary is the only good copy left (a copy-back that
    // failed, a crash). This write creates a new primary, and the NEXT write
    // would copy that over the `.bak` — so keep the `.bak` aside first.
    const bak = `${file}${LAST_GOOD_SUFFIX}`;
    if (!writtenThisSession.has(norm(file)) && fs.existsSync(bak)) {
      const kept = quarantineCopy(bak);
      logger('warn', 'last-good-kept-before-write', `${file}: primary missing, .bak copied to ${kept ?? '(could not copy)'}`);
    }
    return;
  }
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
    // A restore may have frozen writes while this one was awaiting the disk.
    // Landing now would overwrite a restored file with a stale in-memory copy.
    if (frozen) {
      held.set(norm(file), { file, data, options });
      return;
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

/**
 * Resolve once every queued async write has settled (landed, failed, or been
 * held by a freeze). A restore freezes first, then waits here, so no write that
 * was already past its freeze check can land after the swap.
 */
export async function drainAtomicWrites(timeoutMs = 15_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (chains.size) {
    const left = deadline - Date.now();
    if (left <= 0) return false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.allSettled(Array.from(chains.values())),
      new Promise((resolve) => {
        timer = setTimeout(resolve, left);
      }),
    ]);
    if (timer) clearTimeout(timer);
    // The finally that removes a settled chain runs a tick later.
    await new Promise((resolve) => setImmediate(resolve));
  }
  return true;
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
  | { kind: 'bad'; error: string }
  /** The file exists but could not be read (lock, handle limit) — not damage. */
  | { kind: 'io'; error: string };

/** Read errors a scanner, sync client or handle limit causes; retried, never treated as damage. */
const TRANSIENT_READ = new Set(['EBUSY', 'EPERM', 'EACCES', 'EAGAIN', 'EMFILE', 'ENFILE']);

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
  for (let attempt = 0; ; attempt++) {
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch (err) {
      const code = errCode(err);
      if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'missing' };
      if (TRANSIENT_READ.has(code) && attempt < RENAME_BACKOFF_MS.length) {
        sleepSync(RENAME_BACKOFF_MS[attempt]);
        continue;
      }
      return { kind: 'io', error: errText(err) };
    }
    return parseAttempt(text, validate);
  }
}

async function readAttempt(file: string, validate?: (value: unknown) => boolean): Promise<Attempt> {
  for (let attempt = 0; ; attempt++) {
    let text: string;
    try {
      text = await fs.promises.readFile(file, 'utf8');
    } catch (err) {
      const code = errCode(err);
      if (code === 'ENOENT' || code === 'ENOTDIR') return { kind: 'missing' };
      if (TRANSIENT_READ.has(code) && attempt < RENAME_BACKOFF_MS.length) {
        await new Promise((r) => setTimeout(r, RENAME_BACKOFF_MS[attempt]));
        continue;
      }
      return { kind: 'io', error: errText(err) };
    }
    return parseAttempt(text, validate);
  }
}

function resolveFallback<T>(fallback: T | (() => T)): T {
  return typeof fallback === 'function' ? (fallback as () => T)() : fallback;
}

/** Put the last-good copy back over `file` (temp + rename). False when it could not. */
function reinstateLastGood(file: string): boolean {
  const tmp = tempPathFor(file);
  try {
    fs.copyFileSync(`${file}${LAST_GOOD_SUFFIX}`, tmp);
    renameWithRetrySync(tmp, file);
    return true;
  } catch (err) {
    logger('warn', 'last-good-reinstate-failed', `${file}: ${errText(err)}`);
    try {
      fs.rmSync(tmp, { force: true });
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * Decide what to serve after the primary failed; shared by the sync and async
 * readers. `backup` is the `.bak` read.
 */
function recover<T>(
  file: string,
  primary: Exclude<Attempt, { kind: 'ok' }>,
  backup: Attempt,
  fallback: T | (() => T),
): JsonReadResult<T> {
  if (primary.kind === 'io') {
    // The primary is there but locked. Never move it: it is most likely fine.
    logger('warn', 'json-read-io-error', `${file}: ${primary.error}`);
    if (backup.kind === 'ok') return { value: backup.value as T, source: 'backup', error: primary.error };
    return { value: resolveFallback(fallback), source: 'fallback', error: primary.error };
  }
  if (primary.kind === 'missing') {
    if (backup.kind !== 'ok') return { value: resolveFallback(fallback), source: 'missing' };
    // No primary but a good `.bak`: a copy-back or a swap that failed half-way.
    logger('warn', 'json-restored-missing-primary', file);
    reinstateLastGood(file);
    return { value: backup.value as T, source: 'backup', error: 'primary missing' };
  }
  if (backup.kind === 'ok') {
    // Copy the damaged bytes aside, then replace them in one rename: a failed
    // copy-back leaves the damaged primary (read again next time), never a hole.
    const quarantinedTo = quarantineCopy(file) ?? undefined;
    logger('warn', 'json-restored-from-last-good', `${file} (damaged copy: ${quarantinedTo ?? 'not kept'})`);
    reinstateLastGood(file);
    return { value: backup.value as T, source: 'backup', quarantinedTo, error: primary.error };
  }
  // Nothing to reinstate: move the damaged file aside so it is kept for manual
  // recovery and the next write cannot be mistaken for it.
  const quarantinedTo = quarantineFile(file) ?? undefined;
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
  const backup = readAttemptSync(`${file}${LAST_GOOD_SUFFIX}`, options.validate);
  return recover(file, primary, backup, fallback);
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
  const backup = await readAttempt(`${file}${LAST_GOOD_SUFFIX}`, options.validate);
  return recover(file, primary, backup, fallback);
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

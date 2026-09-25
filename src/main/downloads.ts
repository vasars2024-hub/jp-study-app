import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { readJson, readJsonSync, writeJsonAtomic, writeJsonAtomicSync } from './atomicJson';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import AdmZip from 'adm-zip';
import {
  ASSET_CATALOG,
  assetDependencyClosure,
  formatBytes,
  mergeRegistry,
  preflightDiskSpace,
  verifyAsset,
  type AssetError,
  type AssetSpec,
  type AssetStatus,
  type VerifyMode,
} from '../shared/assetRegistry';

/**
 * An error carrying its own translated-at-render-time description, so `run()`'s
 * catch block can hand the renderer a `{ key, vars }` pair instead of an
 * English sentence baked in at throw time. Anything thrown that is *not* one of
 * these (a raw network exception, say) still becomes a status the user can
 * read — see the `assetError.generic` fallback in `run()` — it just cannot be
 * localised beyond wrapping whatever detail Node gave us.
 */
class DownloadFailure extends Error {
  readonly assetError: AssetError;
  constructor(assetError: AssetError, message: string) {
    super(message);
    this.assetError = assetError;
  }
}

// Phase 6 — the download manager.
//
// One rule drives the whole design: an asset is either fully installed or it is
// not there at all. Nothing half-written is ever visible under models/<dir>,
// because every download lands in a temp file, gets verified, and is only then
// renamed into place. That is what makes delete → re-download safe to do at any
// moment, including mid-download, which is the acceptance criterion for this phase.

interface InstallRecord {
  version: string;
  /** Hash of the downloaded artifact — recorded even for size-verified assets. */
  sha256: string;
  verifyMode: VerifyMode;
  bytes: number;
  installedAt: number;
}

/** Sidecar for a partial download, so a resume survives an app restart. */
interface PartialMeta {
  url: string;
  version: string;
  totalBytes: number;
  etag?: string;
  lastModified?: string;
}

const MAX_CONCURRENT = 2;
const PROGRESS_INTERVAL_MS = 250;

let catalog: AssetSpec[] = ASSET_CATALOG;
const statuses = new Map<string, AssetStatus>();
const controllers = new Map<string, AbortController>();
const queue: string[] = [];
let active = 0;

/**
 * Consumers register here so a delete can evict a model that is currently
 * mmapped/open. On Windows an in-use file simply refuses to unlink, and it does
 * so intermittently, which is the worst possible failure mode — so deletion
 * *always* asks consumers to let go first, even when nothing is loaded.
 */
const unloadHandlers = new Map<string, Set<() => void | Promise<void>>>();

export function registerAssetUnloadHandler(id: string, fn: () => void | Promise<void>): () => void {
  const set = unloadHandlers.get(id) ?? new Set();
  set.add(fn);
  unloadHandlers.set(id, set);
  return () => set.delete(fn);
}

// ----- paths -------------------------------------------------------------

function modelsRoot(): string {
  return path.join(app.getPath('userData'), 'models');
}

function partialRoot(): string {
  return path.join(modelsRoot(), '.partial');
}

function statePath(): string {
  return path.join(modelsRoot(), 'state.json');
}

function installDirFor(spec: AssetSpec): string {
  return path.join(modelsRoot(), spec.installDir);
}

function partialFor(id: string): string {
  return path.join(partialRoot(), `${id}.part`);
}

function partialMetaFor(id: string): string {
  return path.join(partialRoot(), `${id}.meta.json`);
}

function ensureDirs(): void {
  fs.mkdirSync(modelsRoot(), { recursive: true });
  fs.mkdirSync(partialRoot(), { recursive: true });
}

// ----- install state -----------------------------------------------------

function readState(): Record<string, InstallRecord> {
  return readJsonSync<Record<string, InstallRecord>>(statePath(), () => ({}), {
    validate: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
  });
}

function writeState(state: Record<string, InstallRecord>): void {
  ensureDirs();
  writeJsonAtomicSync(statePath(), state);
}

function recordInstall(id: string, record: InstallRecord): void {
  const state = readState();
  state[id] = record;
  writeState(state);
}

function forgetInstall(id: string): void {
  const state = readState();
  delete state[id];
  writeState(state);
}

// ----- status ------------------------------------------------------------

function blankStatus(spec: AssetSpec): AssetStatus {
  return {
    id: spec.id,
    state: 'not-installed',
    receivedBytes: 0,
    totalBytes: spec.sizeBytes,
    bytesPerSecond: 0,
  };
}

function statusOf(id: string): AssetStatus | undefined {
  return statuses.get(id);
}

function setStatus(id: string, patch: Partial<AssetStatus>): void {
  const current = statuses.get(id);
  if (!current) return;
  statuses.set(id, { ...current, ...patch });
  broadcast(id);
  if (patch.state === 'installed' && current.state !== 'installed') notifyInstalled(id);
}

const installedListeners = new Set<(id: string) => void>();

/**
 * Main-process consumers told when an asset finishes installing — the hook that
 * lets a dictionary drop its cached index (or import itself) wherever the
 * download was started from, instead of only while one Settings page is open.
 */
export function onAssetInstalled(listener: (id: string) => void): () => void {
  installedListeners.add(listener);
  return () => installedListeners.delete(listener);
}

function notifyInstalled(id: string): void {
  for (const listener of installedListeners) {
    try {
      listener(id);
    } catch (error) {
      console.warn('[downloads] installed listener failed:', error);
    }
  }
}

let lastBroadcast = 0;
function broadcast(id: string, force = false): void {
  const now = Date.now();
  const status = statuses.get(id);
  if (!status) return;
  // Throttle the byte-by-byte firehose, but never drop a state change — those
  // are what the UI switches its buttons on.
  const isStateChange = status.state !== 'downloading';
  if (!force && !isStateChange && now - lastBroadcast < PROGRESS_INTERVAL_MS) return;
  lastBroadcast = now;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('assets:status', status);
  }
}

/**
 * Is this asset usable right now? The graceful-degrade contract: every consumer
 * calls this and renders a "Download (size)" button instead of throwing.
 */
export function isInstalled(id: string): boolean {
  return statuses.get(id)?.state === 'installed';
}

export function getAssetStatus(id: string): AssetStatus | undefined {
  return statuses.get(id);
}

/** Absolute path to an installed asset's directory, or null when absent. */
export function assetPath(id: string): string | null {
  if (!isInstalled(id)) return null;
  const spec = catalog.find((a) => a.id === id);
  if (!spec) return null;
  const dir = installDirFor(spec);
  return spec.file ? path.join(dir, spec.file) : dir;
}

// ---- Integrity: re-verify and change detection (audit T6) ----------------
//
// Every install already stores the real hash of what it fetched (`recordInstall`
// below writes `sha256` and `verifyMode`). Until this section existed **nothing
// ever read it back**, so the record was write-only bookkeeping.
//
// Two uses, deliberately different in severity:
//
//   - `reverifyAsset` rehashes the file ON DISK against the record. That catches
//     local corruption and post-install tampering, and needs no cooperation from
//     upstream — it is the one real integrity guarantee available for a floating
//     URL. This is the honest answer to "is my copy still what I installed?".
//   - `compareWithRecordedHash` is for a RE-download: it says whether the bytes
//     upstream is serving now differ from the bytes installed earlier. It
//     **warns, never blocks** — on a mutable URL a change is usually a legitimate
//     upstream release, and a hard failure there is the same trap as pinning
//     (see the `sha256` comment on `comic-text-detector` in assetRegistry.ts).

/**
 * Assets whose upstream bytes changed on the most recent re-download, so the UI
 * can say so. In-memory on purpose: it describes *this* session's observation,
 * and the durable record is `state.json`'s `sha256`, which has already been
 * updated to the new value by the time anyone reads this.
 */
const contentChanged = new Map<string, { previous: string; current: string; at: number }>();

export function getContentChange(id: string): { previous: string; current: string; at: number } | undefined {
  return contentChanged.get(id);
}

export type ReverifyOutcome =
  | { id: string; state: 'ok'; mode: VerifyMode; sha256: string; bytes: number }
  /** File on disk no longer hashes to what was recorded — corruption or tampering. */
  | { id: string; state: 'changed'; mode: VerifyMode; expected: string; actual: string; bytes: number }
  | { id: string; state: 'missing' }
  /** Installed before integrity records existed, so there is nothing to compare. */
  | { id: string; state: 'no-record' }
  | { id: string; state: 'error'; message: string };

async function sha256OfFile(file: string): Promise<{ hash: string; bytes: number }> {
  const hash = crypto.createHash('sha256');
  let bytes = 0;
  const stream = fs.createReadStream(file);
  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
    bytes += (chunk as Buffer).length;
  }
  return { hash: hash.digest('hex'), bytes };
}

/**
 * Rehash an installed asset on disk and compare against its install record.
 *
 * Note this reports `mode` from the record: an asset recorded as `size` was
 * never checksum-verified *against upstream*, and saying otherwise would be the
 * dishonesty T6 is about. What this proves is narrower and still worth having —
 * that the bytes have not changed since installation.
 */
export async function reverifyAsset(id: string): Promise<ReverifyOutcome> {
  const spec = catalog.find((a) => a.id === id);
  if (!spec) return { id, state: 'error', message: 'unknown asset' };
  const record = readState()[id];
  if (!record) return { id, state: 'no-record' };

  const dir = installDirFor(spec);
  const file = spec.file ? path.join(dir, spec.file) : null;
  if (!file) return { id, state: 'no-record' };

  try {
    await fsp.access(file);
  } catch {
    return { id, state: 'missing' };
  }

  try {
    const { hash, bytes } = await sha256OfFile(file);
    if (hash.toLowerCase() === String(record.sha256).toLowerCase()) {
      return { id, state: 'ok', mode: record.verifyMode, sha256: hash, bytes };
    }
    return {
      id,
      state: 'changed',
      mode: record.verifyMode,
      expected: String(record.sha256),
      actual: hash,
      bytes,
    };
  } catch (err) {
    return { id, state: 'error', message: err instanceof Error ? err.message : 'reverify failed' };
  }
}

/**
 * Did upstream's bytes change since this asset was installed?
 *
 * `null` when there is nothing to compare (never installed, or no recorded
 * hash). Returning a shape rather than a boolean so the caller can name both
 * hashes in the message it shows.
 */
/**
 * What the UI needs to describe an asset's integrity **honestly**.
 *
 * `verifyMode` is surfaced verbatim rather than collapsed into a boolean,
 * because the two modes mean very different things and T6's rule is that they
 * must not read alike:
 *
 *   `sha256` — the bytes were compared against a hash pinned in the catalog.
 *   `size`   — only "is this a plausible, non-truncated payload". **Not
 *              verified**, and any UI that labels it "verified" is lying.
 *
 * `pinned` says whether the *catalog* carries a hash at all, which is the thing
 * that decides whether a future download can be checked. Measured 2026-08-05:
 * 1 of 21 specs is pinned, and all 14 installed assets recorded `size`.
 */
export interface AssetIntegrity {
  id: string;
  installed: boolean;
  /** Catalog pins a sha256 for this spec, so downloads are hard-checked. */
  pinned: boolean;
  /** How the installed copy was actually checked at download time. */
  verifyMode: VerifyMode | null;
  recordedSha256: string | null;
  bytes: number | null;
  installedAt: number | null;
  /** Set when a re-download this session brought different bytes. */
  contentChangedSinceInstall: { previous: string; current: string; at: number } | null;
}

export function listIntegrity(): AssetIntegrity[] {
  const state = readState();
  return catalog.map((spec) => {
    const record = state[spec.id];
    return {
      id: spec.id,
      installed: isInstalled(spec.id),
      pinned: Boolean(spec.sha256),
      verifyMode: record?.verifyMode ?? null,
      recordedSha256: record?.sha256 ?? null,
      bytes: record?.bytes ?? null,
      installedAt: record?.installedAt ?? null,
      contentChangedSinceInstall: contentChanged.get(spec.id) ?? null,
    };
  });
}

export function compareWithRecordedHash(
  id: string,
  freshSha256: string,
): { changed: boolean; previous: string; current: string } | null {
  const record = readState()[id];
  if (!record?.sha256) return null;
  const previous = String(record.sha256).toLowerCase();
  const current = String(freshSha256).toLowerCase();
  return { changed: previous !== current, previous, current };
}

/** Find a readable text payload inside an installed asset (CEDICT `.u8`, etc.). */
async function findTextFile(root: string): Promise<string | null> {
  const entries = await fsp.readdir(root, { withFileTypes: true }).catch(() => []);
  const preferred = ['cedict_ts.u8', 'cedict.u8', 'cedict_1_0_ts_utf-8_mdbg.txt'];
  for (const name of preferred) {
    const full = path.join(root, name);
    const st = await fsp.stat(full).catch(() => null);
    if (st?.isFile()) return full;
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      const nested = await findTextFile(full);
      if (nested) return nested;
      continue;
    }
    if (/\.(u8|txt)$/i.test(entry.name)) return full;
  }
  return null;
}

/**
 * Read an installed asset as UTF-8 text. Returns null when missing or unreadable.
 * Used by the ZH dictionary to prefer Phase 6 CC-CEDICT over the bundled copy.
 */
export async function readAssetText(id: string): Promise<string | null> {
  const loc = assetPath(id);
  if (!loc) return null;
  try {
    const st = await fsp.stat(loc);
    if (st.isFile()) return fsp.readFile(loc, 'utf8');
    const file = await findTextFile(loc);
    if (!file) return null;
    return fsp.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

// ----- integrity ---------------------------------------------------------

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await dirSize(full);
    else {
      const stat = await fsp.stat(full).catch(() => null);
      if (stat) total += stat.size;
    }
  }
  return total;
}

/**
 * Reconcile state.json against what is actually on disk. A model the user
 * deleted by hand, or an install truncated by a power cut, is quietly demoted
 * to not-installed rather than crashing the first consumer that opens it.
 */
async function reconcile(): Promise<void> {
  const state = readState();
  let dirty = false;

  for (const spec of catalog) {
    if (!statuses.has(spec.id)) statuses.set(spec.id, blankStatus(spec));
    const record = state[spec.id];
    if (!record) {
      // No record: an orphaned partial may still exist and be resumable.
      const partial = await fsp.stat(partialFor(spec.id)).catch(() => null);
      if (partial && partial.size > 0) {
        setStatus(spec.id, { state: 'paused', receivedBytes: partial.size });
      }
      continue;
    }

    const dir = installDirFor(spec);
    const target = spec.file ? path.join(dir, spec.file) : dir;
    const stat = await fsp.stat(target).catch(() => null);
    if (!stat) {
      delete state[spec.id];
      dirty = true;
      continue;
    }
    const bytes = stat.isDirectory() ? await dirSize(dir) : stat.size;
    if (bytes === 0) {
      delete state[spec.id];
      dirty = true;
      await rmrf(dir);
      continue;
    }

    statuses.set(spec.id, {
      id: spec.id,
      state: 'installed',
      receivedBytes: bytes,
      totalBytes: bytes,
      bytesPerSecond: 0,
      installedVersion: record.version,
    });
  }

  if (dirty) writeState(state);
}

// ----- disk space --------------------------------------------------------

async function freeBytesOnVolume(dir: string): Promise<number> {
  try {
    const stats = await fsp.statfs(dir);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch {
    // No statfs (odd filesystem, network share): do not invent a number and do
    // not block the user — let the download run and handle ENOSPC if it comes.
    return Number.POSITIVE_INFINITY;
  }
}

// ----- download ----------------------------------------------------------

function isEnospc(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'ENOSPC');
}

function isAbort(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as { name?: string }).name === 'AbortError');
}

async function readPartialMeta(id: string): Promise<PartialMeta | null> {
  return readJson<PartialMeta | null>(partialMetaFor(id), null, {
    validate: (v) => !!v && typeof v === 'object',
  });
}

/**
 * Rebuild the running hash from bytes already on disk.
 *
 * Node's crypto hashes cannot be serialised, so a resume across an app restart
 * has to re-read the partial to catch the digest up. It is streamed, never
 * buffered — the whole point of hashing during download is that a multi-GB
 * model never sits in memory.
 */
async function hashExisting(file: string, hash: crypto.Hash): Promise<number> {
  let bytes = 0;
  for await (const chunk of fs.createReadStream(file)) {
    const buf = chunk as Buffer;
    hash.update(buf);
    bytes += buf.length;
  }
  return bytes;
}

async function downloadToPartial(spec: AssetSpec, signal: AbortSignal): Promise<{ file: string; sha256: string; bytes: number }> {
  ensureDirs();
  const partial = partialFor(spec.id);
  const hash = crypto.createHash('sha256');

  let startAt = 0;
  const meta = await readPartialMeta(spec.id);
  const existing = await fsp.stat(partial).catch(() => null);

  // Only resume when the sidecar says the partial came from this same URL and
  // version. A rotated CDN URL or a bumped asset version means the bytes on
  // disk belong to a different file — appending to them would produce a
  // plausible-looking, permanently corrupt model.
  const resumable =
    existing && existing.size > 0 && meta && meta.url === spec.url && meta.version === spec.version;

  if (resumable) {
    startAt = await hashExisting(partial, hash);
  } else if (existing) {
    await fsp.rm(partial, { force: true });
  }

  const headers: Record<string, string> = {
    // HuggingFace rejects bare / empty UAs on some CDN paths; identify ourselves.
    'User-Agent': 'jp-study-app/1.0 (Electron; asset-download)',
    Accept: '*/*',
  };
  if (startAt > 0) {
    headers.Range = `bytes=${startAt}-`;
    // Re-validate before appending: if the artifact changed since we paused,
    // the server tells us here rather than handing us a spliced file.
    if (meta?.etag) headers['If-Range'] = meta.etag;
    else if (meta?.lastModified) headers['If-Range'] = meta.lastModified;
  }

  // Force the content endpoint on HuggingFace resolve URLs (avoids landing on
  // the HTML model card when a redirect goes sideways).
  const url = spec.url.includes('huggingface.co/') && !spec.url.includes('download=')
    ? `${spec.url}${spec.url.includes('?') ? '&' : '?'}download=true`
    : spec.url;

  const res = await fetch(url, { headers, signal, redirect: 'follow' });
  if (!res.ok && res.status !== 206) {
    throw new DownloadFailure(
      { key: 'assetError.httpFailed', vars: { status: res.status } },
      `Download failed (HTTP ${res.status}).`,
    );
  }
  if (!res.body) {
    throw new DownloadFailure({ key: 'assetError.emptyResponse' }, 'Download failed — empty response.');
  }

  // A 200 in reply to a Range request means the server ignored it (or the
  // If-Range failed): start over from zero rather than appending.
  const serverResumed = startAt > 0 && res.status === 206;
  if (startAt > 0 && !serverResumed) {
    await fsp.rm(partial, { force: true });
    return downloadFresh(spec, signal, res);
  }

  const totalBytes =
    Number(res.headers.get('content-length') ?? 0) + (serverResumed ? startAt : 0) || spec.sizeBytes;

  const nextMeta: PartialMeta = {
    url: spec.url,
    version: spec.version,
    totalBytes,
    etag: res.headers.get('etag') ?? undefined,
    lastModified: res.headers.get('last-modified') ?? undefined,
  };
  // Transient resume hint (deleted with the .part), so no `.bak` beside it.
  await writeJsonAtomic(partialMetaFor(spec.id), nextMeta, { space: 0, backup: false });

  const received = await streamToFile(spec.id, res, partial, hash, startAt, totalBytes, serverResumed);
  return { file: partial, sha256: hash.digest('hex'), bytes: received };
}

/** The non-resume path, reusing a response we already have in hand. */
async function downloadFresh(
  spec: AssetSpec,
  _signal: AbortSignal,
  res: Response,
): Promise<{ file: string; sha256: string; bytes: number }> {
  const partial = partialFor(spec.id);
  const hash = crypto.createHash('sha256');
  const totalBytes = Number(res.headers.get('content-length') ?? 0) || spec.sizeBytes;
  const received = await streamToFile(spec.id, res, partial, hash, 0, totalBytes, false);
  return { file: partial, sha256: hash.digest('hex'), bytes: received };
}

async function streamToFile(
  id: string,
  res: Response,
  partial: string,
  hash: crypto.Hash,
  startAt: number,
  totalBytes: number,
  append: boolean,
): Promise<number> {
  let received = startAt;
  let windowBytes = 0;
  let windowStart = Date.now();

  setStatus(id, {
    state: 'downloading',
    receivedBytes: received,
    totalBytes,
    error: undefined,
  });

  const out = fs.createWriteStream(partial, append ? { flags: 'a' } : { flags: 'w' });
  const body = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);

  await pipeline(
    body,
    async function* (source) {
      for await (const chunk of source) {
        const buf = chunk as Buffer;
        hash.update(buf);
        received += buf.length;
        windowBytes += buf.length;

        const now = Date.now();
        const elapsed = now - windowStart;
        if (elapsed >= PROGRESS_INTERVAL_MS) {
          setStatus(id, {
            receivedBytes: received,
            totalBytes,
            bytesPerSecond: Math.round((windowBytes / elapsed) * 1000),
          });
          windowBytes = 0;
          windowStart = now;
        }
        yield buf;
      }
    },
    out,
  );

  setStatus(id, { receivedBytes: received, totalBytes, bytesPerSecond: 0 });
  return received;
}

// ----- install -----------------------------------------------------------

async function rmrf(target: string): Promise<void> {
  // Windows holds handles open a beat longer than the unlink call expects
  // (antivirus scanners are the usual culprit); retry rather than surfacing a
  // spurious EBUSY to the user.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fsp.rm(target, { recursive: true, force: true });
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== 'EBUSY' && code !== 'EPERM' && code !== 'ENOTEMPTY') throw err;
      await new Promise((r) => setTimeout(r, 120 * (attempt + 1)));
    }
  }
  await fsp.rm(target, { recursive: true, force: true });
}

/**
 * Move the verified payload into its final home in one atomic step.
 *
 * Archives are extracted into a staging directory *next to* the destination and
 * then renamed, so a crash halfway through unzipping cannot leave a
 * half-populated model directory that looks installed.
 */
async function installFromPartial(spec: AssetSpec, partial: string): Promise<void> {
  const dest = installDirFor(spec);
  const staging = `${dest}.staging`;

  await rmrf(staging);
  await fsp.mkdir(staging, { recursive: true });

  if (spec.archive === 'zip') {
    const zip = new AdmZip(partial);
    zip.extractAllTo(staging, /* overwrite */ true);
  } else {
    await fsp.rename(partial, path.join(staging, spec.file ?? path.basename(new URL(spec.url).pathname)));
  }

  await rmrf(dest);
  await fsp.rename(staging, dest);
  await fsp.rm(partial, { force: true });
  await fsp.rm(partialMetaFor(spec.id), { force: true });
}

// ----- queue -------------------------------------------------------------

function pump(): void {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    if (statusOf(id)?.state !== 'queued') continue;
    active += 1;
    void run(id).finally(() => {
      active -= 1;
      pump();
    });
  }
}

async function run(id: string): Promise<void> {
  const spec = catalog.find((a) => a.id === id);
  if (!spec) return;

  const controller = new AbortController();
  controllers.set(id, controller);

  try {
    const { file, sha256, bytes } = await downloadToPartial(spec, controller.signal);

    setStatus(id, { state: 'verifying', bytesPerSecond: 0 });
    const outcome = verifyAsset(spec, sha256, bytes);
    if (!outcome.ok) {
      // A failed verification means the bytes are worthless — drop them so the
      // retry is a clean download, not an append onto garbage.
      await fsp.rm(file, { force: true });
      await fsp.rm(partialMetaFor(id), { force: true });
      setStatus(id, { state: 'failed', receivedBytes: 0, error: outcome.reason });
      return;
    }

    // Audit T6: a RE-download of an already-installed asset compares the new
    // bytes against the recorded ones. Warn, never block — on a floating URL a
    // change is usually a legitimate upstream release, so failing here would be
    // the same trap as pinning a mutable URL. The pinned spec (if any) has
    // already had its hard check run above by `verifyAsset`.
    const drift = compareWithRecordedHash(id, outcome.actualSha256);
    if (drift?.changed) {
      contentChanged.set(id, { previous: drift.previous, current: drift.current, at: Date.now() });
      console.warn(
        `[downloads] ${id}: upstream content changed since install ` +
          `(was ${drift.previous.slice(0, 12)}…, now ${drift.current.slice(0, 12)}…)`,
      );
    } else {
      contentChanged.delete(id);
    }

    await installFromPartial(spec, file);
    recordInstall(id, {
      version: spec.version,
      sha256: outcome.actualSha256,
      verifyMode: outcome.mode,
      bytes,
      installedAt: Date.now(),
    });
    setStatus(id, {
      state: 'installed',
      receivedBytes: bytes,
      totalBytes: bytes,
      bytesPerSecond: 0,
      installedVersion: spec.version,
      error: undefined,
    });
    broadcast(id, true);
  } catch (err) {
    if (isAbort(err)) {
      // Pause and cancel both abort; whichever asked has already set the state.
      const state = statusOf(id)?.state;
      if (state === 'downloading') setStatus(id, { state: 'paused', bytesPerSecond: 0 });
      broadcast(id, true);
      return;
    }
    if (isEnospc(err)) {
      // Out of space is not corruption — the partial is still good. Park it as
      // paused so freeing space and hitting Resume just works.
      setStatus(id, {
        state: 'paused',
        bytesPerSecond: 0,
        error: { key: 'assetError.enospc' },
      });
      broadcast(id, true);
      return;
    }
    setStatus(id, {
      state: 'failed',
      bytesPerSecond: 0,
      error:
        err instanceof DownloadFailure
          ? err.assetError
          : {
              key: 'assetError.generic',
              vars: { detail: err instanceof Error ? err.message : String(err) },
            },
    });
    broadcast(id, true);
  } finally {
    controllers.delete(id);
  }
}

// ----- public operations -------------------------------------------------

export interface StartResult {
  ok: boolean;
  error?: AssetError;
}

const UNKNOWN_ASSET: AssetError = { key: 'assetError.unknownAsset' };

async function queueDownload(
  id: string,
  seen: Set<string> = new Set(),
): Promise<StartResult> {
  if (seen.has(id)) return { ok: true };
  seen.add(id);

  const spec = catalog.find((a) => a.id === id);
  if (!spec) return { ok: false, error: UNKNOWN_ASSET };
  const status = statusOf(id);
  if (!status) return { ok: false, error: UNKNOWN_ASSET };
  if (status.state === 'queued' || status.state === 'downloading' || status.state === 'verifying') {
    return { ok: true };
  }

  // Companion graphs (e.g. Manga OCR decoder/vocab) must be queued first so a
  // single "Download" on the parent pulls the whole set.
  for (const depId of spec.requires ?? []) {
    const depStatus = statusOf(depId);
    if (depStatus && depStatus.state !== 'installed') {
      const depResult = await queueDownload(depId, seen);
      if (!depResult.ok) return depResult;
    }
  }

  if (status.state === 'installed') return { ok: true };

  ensureDirs();

  setStatus(id, { state: 'queued', bytesPerSecond: 0, error: undefined });
  broadcast(id, true);
  queue.push(id);
  pump();
  return { ok: true };
}

export async function startDownload(id: string): Promise<StartResult> {
  const spec = catalog.find((asset) => asset.id === id);
  const status = statusOf(id);
  if (!spec || !status) return { ok: false, error: UNKNOWN_ASSET };

  // Pre-flight the visible bundle as one operation. Checking each companion
  // independently against the same free-space number could queue a 401 MB TTS
  // bundle on a volume that only had room for any one of its files.
  const pending = assetDependencyClosure(catalog, id).filter(
    (asset) => statusOf(asset.id)?.state !== 'installed',
  );
  if (pending.length) {
    const payloadBytes = pending.reduce((sum, asset) => sum + asset.sizeBytes, 0);
    const free = await freeBytesOnVolume(modelsRoot());
    const pre = preflightDiskSpace(payloadBytes, free);
    if (!pre.ok) {
      const error: AssetError = {
        key: 'assetError.diskSpace',
        vars: {
          name: spec.name,
          required: formatBytes(pre.requiredBytes),
          free: formatBytes(pre.freeBytes),
          shortfall: formatBytes(pre.shortfallBytes),
        },
      };
      setStatus(id, { state: status.state === 'paused' ? 'paused' : 'not-installed', error });
      broadcast(id, true);
      return { ok: false, error };
    }
  }

  return queueDownload(id);
}

export function pauseDownload(id: string): void {
  const status = statusOf(id);
  if (!status) return;
  if (status.state === 'queued') {
    const at = queue.indexOf(id);
    if (at >= 0) queue.splice(at, 1);
    setStatus(id, { state: 'paused', bytesPerSecond: 0 });
    broadcast(id, true);
    return;
  }
  if (status.state !== 'downloading') return;
  setStatus(id, { state: 'paused', bytesPerSecond: 0 });
  controllers.get(id)?.abort();
}

async function cancelOneDownload(id: string): Promise<void> {
  const status = statusOf(id);
  if (!status) return;
  // Cancel means "stop installing", not "forget an installed file without
  // deleting it". Installed owned companions are handled by removeAsset.
  if (status.state === 'installed') return;
  const at = queue.indexOf(id);
  if (at >= 0) queue.splice(at, 1);
  controllers.get(id)?.abort();
  setStatus(id, { state: 'not-installed', receivedBytes: 0, bytesPerSecond: 0, error: undefined });
  // The abort above may still be flushing a write, so a partial can briefly
  // resist deletion. It is orphaned either way — reconcile() ignores it and the
  // next download overwrites it — so a failure here is not worth surfacing.
  await rmrf(partialFor(id)).catch(() => undefined);
  await rmrf(partialMetaFor(id)).catch(() => undefined);
  broadcast(id, true);
}

export async function cancelDownload(id: string): Promise<void> {
  const spec = catalog.find((asset) => asset.id === id);
  const ids = spec?.ownsRequires
    ? assetDependencyClosure(catalog, id).map((asset) => asset.id)
    : [id];
  await Promise.all(ids.map((assetId) => cancelOneDownload(assetId)));
}

/**
 * Delete an installed asset.
 *
 * Consumers are told to unload *first*. Skipping that is exactly how you get a
 * delete that works on the developer's machine and fails on a user's, because
 * the model happened to be mmapped by a live worker at the time.
 */
async function removeOneAsset(id: string): Promise<StartResult> {
  const spec = catalog.find((a) => a.id === id);
  if (!spec) return { ok: false, error: UNKNOWN_ASSET };

  // An in-flight download is a delete too — stop it and drop the partial.
  if (statusOf(id)?.state !== 'installed') {
    await cancelOneDownload(id);
    return { ok: true };
  }

  for (const handler of unloadHandlers.get(id) ?? []) {
    try {
      await handler();
    } catch {
      // A consumer that fails to unload should not block the delete — the retry
      // loop in rmrf is the backstop.
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('assets:unload', id);
  }

  try {
    await rmrf(installDirFor(spec));
  } catch (err) {
    const error: AssetError =
      err instanceof Error && /EBUSY|EPERM/.test(err.message)
        ? { key: 'assetError.inUse', vars: { name: spec.name } }
        : { key: 'assetError.deleteFailed', vars: { name: spec.name } };
    setStatus(id, { error });
    broadcast(id, true);
    return { ok: false, error };
  }

  forgetInstall(id);
  setStatus(id, {
    state: 'not-installed',
    receivedBytes: 0,
    totalBytes: spec.sizeBytes,
    bytesPerSecond: 0,
    installedVersion: undefined,
    error: undefined,
  });
  broadcast(id, true);
  return { ok: true };
}

export async function removeAsset(id: string): Promise<StartResult> {
  const spec = catalog.find((asset) => asset.id === id);
  if (!spec) return { ok: false, error: UNKNOWN_ASSET };
  const assets = spec.ownsRequires
    ? [...assetDependencyClosure(catalog, id)].reverse()
    : [spec];
  for (const asset of assets) {
    const result = await removeOneAsset(asset.id);
    if (!result.ok) return result;
  }
  return { ok: true };
}

// ----- refreshable registry ---------------------------------------------

const REMOTE_REGISTRY_URL =
  'https://raw.githubusercontent.com/vasars2024-hub/jp-study-app/main/assets/registry.json';

function cachedRegistryPath(): string {
  return path.join(modelsRoot(), 'registry.json');
}

/**
 * URLs rotate and hashes get pinned after an app ships, so the catalog is
 * refreshable: the bundled one is the floor, a cached copy survives offline
 * starts, and a successful fetch updates both. A bad fetch changes nothing.
 */
async function refreshRegistry(): Promise<void> {
  try {
    const cached = await readJson<unknown>(cachedRegistryPath(), null);
    catalog = cached === null ? ASSET_CATALOG : mergeRegistry(ASSET_CATALOG, cached);
  } catch {
    catalog = ASSET_CATALOG;
  }

  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 10_000);
    const res = await fetch(REMOTE_REGISTRY_URL, { signal: ctl.signal }).finally(() =>
      clearTimeout(timer),
    );
    if (!res.ok) return;
    const remote = (await res.json()) as unknown;
    const merged = mergeRegistry(ASSET_CATALOG, remote);
    catalog = merged;
    ensureDirs();
    await writeJsonAtomic(cachedRegistryPath(), remote, { space: 0, backup: false });
  } catch {
    // Offline, or the registry is not published yet — the bundled catalog stands.
  }
}

// ----- ipc ---------------------------------------------------------------

/**
 * `options.catalog` is a test seam: it swaps in a catalog pointing at a local
 * server and skips the network registry fetch, so the download/resume/verify
 * paths can be exercised for real without hitting HuggingFace.
 */
export async function initDownloads(options?: { catalog?: AssetSpec[] }): Promise<void> {
  ensureDirs();
  if (options?.catalog) {
    catalog = options.catalog;
    statuses.clear();
  } else {
    await refreshRegistry();
  }
  for (const spec of catalog) {
    if (!statuses.has(spec.id)) statuses.set(spec.id, blankStatus(spec));
  }
  await reconcile();
}

export function registerDownloadIpc(): void {
  ipcMain.handle('assets:list', (): { assets: AssetSpec[]; statuses: AssetStatus[] } => ({
    assets: catalog,
    statuses: [...statuses.values()],
  }));
  ipcMain.handle('assets:start', (_e, id: unknown) =>
    typeof id === 'string' ? startDownload(id) : { ok: false, error: UNKNOWN_ASSET },
  );
  ipcMain.handle('assets:pause', (_e, id: unknown) => {
    if (typeof id === 'string') pauseDownload(id);
  });
  ipcMain.handle('assets:cancel', (_e, id: unknown) =>
    typeof id === 'string' ? cancelDownload(id) : undefined,
  );
  ipcMain.handle('assets:remove', (_e, id: unknown) =>
    typeof id === 'string' ? removeAsset(id) : { ok: false, error: UNKNOWN_ASSET },
  );
  ipcMain.handle('assets:isInstalled', (_e, id: unknown) =>
    typeof id === 'string' ? isInstalled(id) : false,
  );
  ipcMain.handle('assets:path', (_e, id: unknown) =>
    typeof id === 'string' ? assetPath(id) : null,
  );
  ipcMain.handle('assets:readText', (_e, id: unknown) =>
    typeof id === 'string' ? readAssetText(id) : null,
  );
  // Audit T6. `assets:reverify` rehashes the file on disk against its install
  // record — the one integrity guarantee that needs no upstream cooperation.
  // `assets:integrity` is the read-only view the UI reads to label each asset
  // honestly: an asset checked by size must never be shown as "verified".
  ipcMain.handle('assets:reverify', (_e, id: unknown) =>
    typeof id === 'string'
      ? reverifyAsset(id)
      : Promise.resolve({ id: '', state: 'error' as const, message: 'unknown asset' }),
  );
  ipcMain.handle('assets:integrity', (): AssetIntegrity[] => listIntegrity());

  ipcMain.handle('assets:freeSpace', () => freeBytesOnVolume(modelsRoot()));
  ipcMain.handle('assets:root', () => modelsRoot());
}

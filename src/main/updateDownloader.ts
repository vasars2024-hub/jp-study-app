/**
 * Gum's own download of a Squirrel update, so the panel can show real progress,
 * cancel it, and resume it — none of which Electron's Windows `autoUpdater`
 * exposes (it runs `Update.exe --update <url>` and reports nothing until the end).
 *
 * The design, end to end:
 *   1. GET `<release>/RELEASES` — Squirrel's manifest: `SHA1 filename size` lines.
 *   2. Pick the packages exactly as Squirrel's `UpdateInfo.Create` would: the
 *      deltas newer than the installed version when together they are smaller
 *      than the full package, otherwise the full package (`planSquirrelDownload`).
 *   3. Download each one into a staging folder beside Squirrel's own packages
 *      (`<root>\packages\gum-staged`), with byte progress, an AbortSignal, and an
 *      HTTP Range resume of the `.partial` file after a dropped connection or a
 *      user's cancel.
 *   4. Verify size and SHA1 against RELEASES, then write a RELEASES into the
 *      staging folder that lists only what was downloaded.
 *   5. The caller hands the staging folder to Squirrel as its feed. Update.exe
 *      treats a local directory as a release source ("From Disk": it copies the
 *      named packages into `packages\`, checks their SHA1 again, applies them),
 *      so apply, shortcuts and `--squirrel-updated` stay Squirrel's job.
 *
 * No Electron import and every effect injectable: the decision logic and the
 * HTTP behaviour (Range, 206/200/416, a drop mid-stream, a wrong hash, cancel)
 * are tested in node against a real local server.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions } from '../shared/release';

export interface SquirrelReleaseEntry {
  sha1: string;
  filename: string;
  size: number;
  /** The version in the file name (Squirrel's SemVer 1 form: `1.1.0-beta1`). */
  version: string;
  isDelta: boolean;
}

const LINE_RE = /^([0-9a-fA-F]{40})\s+(\S+)\s+(\d+)\s*$/;
/** A plain file name: no URL, no path, no query — anything else is not ours to fetch. */
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*-(?:full|delta)\.nupkg$/;
const VERSION_RE = /(\d+(?:\.\d+){0,3}(?:-[A-Za-z][0-9A-Za-z-]*)?)-(full|delta)\.nupkg$/;

/**
 * Parse a RELEASES file. `null` when any line is something this downloader does
 * not handle (an absolute URL, a path, a query string): the caller then leaves
 * the whole download to Squirrel, as before.
 */
export function parseSquirrelReleases(text: string): SquirrelReleaseEntry[] | null {
  const out: SquirrelReleaseEntry[] = [];
  for (const raw of String(text ?? '').replace(/^﻿/, '').split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const m = LINE_RE.exec(line);
    if (!m) return null;
    const filename = m[2]!;
    if (!FILE_RE.test(filename)) return null;
    const v = VERSION_RE.exec(filename);
    if (!v) return null;
    const size = Number(m[3]);
    if (!Number.isSafeInteger(size) || size <= 0) return null;
    out.push({ sha1: m[1]!.toUpperCase(), filename, size, version: v[1]!, isDelta: v[2] === 'delta' });
  }
  return out;
}

/** The newest full package a RELEASES lists — what Squirrel calls the current version. */
export function latestFullVersion(entries: readonly SquirrelReleaseEntry[]): string | null {
  let best: string | null = null;
  for (const e of entries) {
    if (e.isDelta) continue;
    if (best === null || compareVersions(e.version, best) > 0) best = e.version;
  }
  return best;
}

export interface SquirrelDownloadPlan {
  /** The version this brings the install to. */
  version: string;
  /** What to download, in apply order. */
  files: SquirrelReleaseEntry[];
  /** What the staging RELEASES lists (Squirrel re-plans from it and must reach `files`). */
  manifest: SquirrelReleaseEntry[];
  deltas: boolean;
  totalBytes: number;
}

/**
 * Squirrel's own choice (`UpdateInfo.Create`), mirrored: with no local version,
 * or `fullOnly`, the newest full package; otherwise every delta newer than the
 * local version when their sizes add up to less than the full one. `null` when
 * the feed has nothing newer than `localVersion`.
 */
export function planSquirrelDownload(
  remote: readonly SquirrelReleaseEntry[],
  localVersion: string | null,
  fullOnly = false,
): SquirrelDownloadPlan | null {
  const latest = latestFullVersion(remote);
  if (!latest) return null;
  const full = remote.find((e) => !e.isDelta && e.version === latest)!;
  if (localVersion && compareVersions(latest, localVersion) <= 0) return null;
  const fullPlan: SquirrelDownloadPlan = { version: latest, files: [full], manifest: [full], deltas: false, totalBytes: full.size };
  if (!localVersion || fullOnly) return fullPlan;
  const deltas = remote
    .filter((e) => e.isDelta && compareVersions(e.version, localVersion) > 0 && compareVersions(e.version, latest) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version));
  const deltaBytes = deltas.reduce((sum, e) => sum + e.size, 0);
  if (deltaBytes > 0 && deltaBytes < full.size) {
    return { version: latest, files: deltas, manifest: [...deltas, full], deltas: true, totalBytes: deltaBytes };
  }
  return fullPlan;
}

export function formatSquirrelReleases(entries: readonly SquirrelReleaseEntry[]): string {
  return entries.map((e) => `${e.sha1} ${e.filename} ${e.size}`).join('\r\n');
}

/** Squirrel's version of a release tag: SemVer 1, so `1.1.0-beta.1` is `1.1.0-beta1`. */
export function squirrelVersionOf(version: string): string {
  const [core = '', ...pre] = String(version).replace(/^v/i, '').split('+')[0]!.split('-');
  return pre.length ? `${core}-${pre.join('-').replace(/\./g, '')}` : core;
}

export type UpdateDownloadErrorCode =
  /** The user pressed Cancel; the `.partial` files stay for a resume. */
  | 'canceled'
  /** Offline, a timeout, a dropped connection — after the retries ran out. */
  | 'network'
  /** A file's size or SHA1 differs from RELEASES, twice. */
  | 'checksum'
  /** The release has no RELEASES / package (404), or its RELEASES is not newer. */
  | 'no-feed'
  /** Not enough free space for the package (and Squirrel's copy of it). */
  | 'disk'
  /** A RELEASES this downloader does not handle: leave the download to Squirrel. */
  | 'unsupported';

export interface UpdateDownloadProgress {
  phase: 'manifest' | 'package' | 'verifying';
  received: number;
  /** null until RELEASES has been read. */
  total: number | null;
}

export type UpdateDownloadResult =
  | { ok: true; stagingDir: string; version: string; deltas: boolean; bytes: number }
  | { ok: false; code: UpdateDownloadErrorCode; message: string; received: number; total: number | null };

export interface UpdateDownloadJob {
  done: Promise<UpdateDownloadResult>;
  cancel(): void;
}

export interface FetchResponseLike {
  status: number;
  ok: boolean;
  headers: { get(name: string): string | null };
  body: ReadableStream<Uint8Array> | null;
  text(): Promise<string>;
}
export type DownloadFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string>; redirect: 'follow' },
) => Promise<FetchResponseLike>;

export interface UpdateDownloadOptions {
  /** Where `RELEASES` and the packages are: `<base>/RELEASES`, `<base>/<file>`. */
  baseUrl: string;
  stagingDir: string;
  /** Squirrel's local current version (`packages\RELEASES`); null = unknown, full package. */
  localVersion: string | null;
  /** The running version: a RELEASES that is not newer than this is `no-feed`. */
  currentVersion: string;
  fullOnly?: boolean;
  onProgress?: (p: UpdateDownloadProgress) => void;
  fetch?: DownloadFetch;
  /** Waits between attempts after a network failure; its length is the retry count. */
  retryDelaysMs?: readonly number[];
  /** Free bytes on the staging volume; null = cannot tell (no check). */
  freeBytes?: (dir: string) => Promise<number | null>;
  /** Quiet time on an open response before it counts as dropped. */
  stallMs?: number;
  userAgent?: string;
}

export const DEFAULT_RETRY_DELAYS_MS = [1_000, 4_000, 15_000] as const;
const DEFAULT_STALL_MS = 60_000;
const MAX_RELEASES_BYTES = 256 * 1024;

class DownloadError extends Error {
  constructor(readonly code: UpdateDownloadErrorCode, message: string, readonly retryable = false) {
    super(message);
  }
}

async function defaultFreeBytes(dir: string): Promise<number | null> {
  try {
    const statfs = (fs.promises as unknown as { statfs?: (p: string) => Promise<{ bavail: number; bsize: number }> }).statfs;
    if (!statfs) return null;
    const s = await statfs(dir);
    return Number(s.bavail) * Number(s.bsize);
  } catch {
    return null;
  }
}

async function sha1Of(file: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha1');
  const stream = fs.createReadStream(file, { highWaterMark: 1 << 20 });
  for await (const chunk of stream) {
    if (signal.aborted) {
      stream.destroy();
      throw new DownloadError('canceled', 'canceled');
    }
    hash.update(chunk as Buffer);
  }
  return hash.digest('hex').toUpperCase();
}

function sizeOf(file: string): number {
  try {
    return fs.statSync(file).size;
  } catch {
    return -1;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DownloadError('canceled', 'canceled'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DownloadError('canceled', 'canceled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function joinUrl(base: string, file: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(file)}`;
}

/** Download, verify, stage. Never throws; `done` says how it ended. */
export function startUpdateDownload(opts: UpdateDownloadOptions): UpdateDownloadJob {
  const ctl = new AbortController();
  const { signal } = ctl;
  const fetchImpl: DownloadFetch = opts.fetch ?? (fetch as unknown as DownloadFetch);
  const delays = opts.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const stallMs = opts.stallMs ?? DEFAULT_STALL_MS;
  const headers = { 'User-Agent': opts.userAgent ?? 'Gum-updater', Accept: '*/*' };
  let received = 0;
  let total: number | null = null;
  const report = (phase: UpdateDownloadProgress['phase']) => {
    try {
      opts.onProgress?.({ phase, received, total });
    } catch {
      /* a closed window */
    }
  };

  /** Run `attempt` with the retry schedule for network-class failures. */
  const withRetries = async <T>(attempt: () => Promise<T>): Promise<T> => {
    for (let i = 0; ; i++) {
      try {
        return await attempt();
      } catch (err) {
        if (signal.aborted) throw new DownloadError('canceled', 'canceled');
        const retryable = err instanceof DownloadError ? err.retryable : true;
        if (!retryable || i >= delays.length) throw err;
        await sleep(delays[i]!, signal);
      }
    }
  };

  const request = async (url: string, extra: Record<string, string> = {}): Promise<FetchResponseLike> => {
    try {
      return await fetchImpl(url, { signal, headers: { ...headers, ...extra }, redirect: 'follow' });
    } catch (err) {
      if (signal.aborted) throw new DownloadError('canceled', 'canceled');
      throw new DownloadError('network', `network: ${err instanceof Error ? err.message : String(err)}`, true);
    }
  };

  const httpError = (res: FetchResponseLike, what: string): DownloadError => {
    if (res.status === 404 || res.status === 410) return new DownloadError('no-feed', `${what}: HTTP ${res.status} (not found)`);
    // 5xx and 429 are worth another try; other 4xx are not.
    return new DownloadError('network', `${what}: HTTP ${res.status}`, res.status >= 500 || res.status === 429 || res.status === 408);
  };

  const readReleases = async (): Promise<string> => {
    const res = await request(joinUrl(opts.baseUrl, 'RELEASES'));
    if (!res.ok) throw httpError(res, 'RELEASES');
    const text = await res.text().catch((err: unknown) => {
      if (signal.aborted) throw new DownloadError('canceled', 'canceled');
      throw new DownloadError('network', `RELEASES: ${err instanceof Error ? err.message : String(err)}`, true);
    });
    if (text.length > MAX_RELEASES_BYTES) throw new DownloadError('unsupported', 'RELEASES is implausibly large');
    return text;
  };

  /** One file into `<staging>/<name>`, resuming `<name>.partial`. Adds to `received`. */
  const downloadOne = async (entry: SquirrelReleaseEntry, url: string): Promise<void> => {
    const target = path.join(opts.stagingDir, entry.filename);
    const partial = `${target}.partial`;
    if (sizeOf(target) === entry.size) {
      // Staged by an earlier run that was not applied (e.g. Squirrel failed): trust only a hash.
      report('verifying');
      if ((await sha1Of(target, signal)) === entry.sha1) {
        received += entry.size;
        return;
      }
      fs.rmSync(target, { force: true });
    }
    let base = received;
    let restartedClean = false;
    for (;;) {
      await withRetries(async () => {
        let have = Math.max(0, sizeOf(partial));
        if (have > entry.size) {
          fs.rmSync(partial, { force: true });
          have = 0;
        }
        received = base + have;
        report('package');
        if (have === entry.size) return;
        const res = await request(url, have > 0 ? { Range: `bytes=${have}-` } : {});
        if (have > 0 && res.status === 416) {
          // The server says the range is past the end: the partial is wrong; start over.
          fs.rmSync(partial, { force: true });
          throw new DownloadError('network', 'range not satisfiable; restarting', true);
        }
        if (!res.ok) throw httpError(res, entry.filename);
        const resumed = have > 0 && res.status === 206;
        if (!resumed) {
          // A 200 is the whole file: the server ignored the Range (or there was none).
          have = 0;
          received = base;
        }
        if (!res.body) throw new DownloadError('network', `${entry.filename}: empty response`, true);
        const fh = await fs.promises.open(partial, resumed ? 'a' : 'w');
        const reader = res.body.getReader();
        let stall: ReturnType<typeof setTimeout> | undefined;
        let stalled = false;
        const arm = () => {
          if (stall) clearTimeout(stall);
          stall = setTimeout(() => {
            stalled = true;
            void reader.cancel().catch(() => undefined);
          }, stallMs);
        };
        try {
          arm();
          for (;;) {
            let chunk: ReadableStreamReadResult<Uint8Array>;
            try {
              chunk = await reader.read();
            } catch (err) {
              if (signal.aborted) throw new DownloadError('canceled', 'canceled');
              throw new DownloadError('network', `${entry.filename}: ${err instanceof Error ? err.message : String(err)}`, true);
            }
            if (chunk.done) break;
            arm();
            const bytes = chunk.value;
            if (have + bytes.byteLength > entry.size) {
              throw new DownloadError('checksum', `${entry.filename}: larger than RELEASES says`);
            }
            await fh.write(bytes);
            have += bytes.byteLength;
            received += bytes.byteLength;
            report('package');
          }
        } finally {
          if (stall) clearTimeout(stall);
          await fh.close().catch(() => undefined);
        }
        if (signal.aborted) throw new DownloadError('canceled', 'canceled');
        if (stalled || have < entry.size) {
          throw new DownloadError('network', `${entry.filename}: connection ended at ${have} of ${entry.size} bytes`, true);
        }
      });
      report('verifying');
      const digest = await sha1Of(partial, signal);
      if (sizeOf(partial) === entry.size && digest === entry.sha1) break;
      fs.rmSync(partial, { force: true });
      if (restartedClean) throw new DownloadError('checksum', `${entry.filename}: SHA1 ${digest} does not match RELEASES`);
      // One clean retry: a resumed file can be wrong where a fresh one is right.
      restartedClean = true;
      received = base;
    }
    fs.renameSync(partial, target);
    base = received;
  };

  const done = (async (): Promise<UpdateDownloadResult> => {
    try {
      fs.mkdirSync(opts.stagingDir, { recursive: true });
      report('manifest');
      const text = await withRetries(readReleases);
      const entries = parseSquirrelReleases(text);
      if (!entries || !entries.length) throw new DownloadError('unsupported', 'RELEASES lists nothing this downloader can fetch');
      let plan = planSquirrelDownload(entries, opts.localVersion, opts.fullOnly);
      if (!plan || compareVersions(plan.version, squirrelVersionOf(opts.currentVersion)) <= 0) {
        throw new DownloadError('no-feed', 'RELEASES has nothing newer than this install');
      }
      total = plan.totalBytes;
      // Anything else in the staging folder is an older attempt's.
      const keep = new Set(plan.files.flatMap((f) => [f.filename, `${f.filename}.partial`]));
      for (const name of fs.readdirSync(opts.stagingDir)) {
        if (!keep.has(name)) fs.rmSync(path.join(opts.stagingDir, name), { force: true, recursive: true });
      }
      const free = await (opts.freeBytes ?? defaultFreeBytes)(opts.stagingDir);
      const already = plan.files.reduce((sum, f) => sum + Math.max(0, sizeOf(path.join(opts.stagingDir, `${f.filename}.partial`))), 0);
      // The package, Squirrel's copy of it in packages\, and the unpacked app beside it.
      if (free !== null && free < (plan.totalBytes - already) + plan.totalBytes * 2) {
        throw new DownloadError('disk', `not enough free space: ${free} bytes free`);
      }
      try {
        for (const file of plan.files) await downloadOne(file, joinUrl(opts.baseUrl, file.filename));
      } catch (err) {
        // GitHub serves only the LATEST release's assets, so a delta further back in the
        // RELEASES chain is a 404 — Update.exe falls back to the full package then, and
        // so does this (also for a delta that will not verify).
        const fallback = err instanceof DownloadError && (err.code === 'no-feed' || err.code === 'checksum');
        if (!plan.deltas || !fallback) throw err;
        plan = planSquirrelDownload(entries, opts.localVersion, true)!;
        total = plan.totalBytes;
        received = 0;
        for (const name of fs.readdirSync(opts.stagingDir)) {
          if (/-delta\.nupkg(\.partial)?$/i.test(name)) fs.rmSync(path.join(opts.stagingDir, name), { force: true });
        }
        for (const file of plan.files) await downloadOne(file, joinUrl(opts.baseUrl, file.filename));
      }
      fs.writeFileSync(path.join(opts.stagingDir, 'RELEASES'), formatSquirrelReleases(plan.manifest), 'utf8');
      return { ok: true, stagingDir: opts.stagingDir, version: plan.version, deltas: plan.deltas, bytes: plan.totalBytes };
    } catch (err) {
      const e = signal.aborted
        ? new DownloadError('canceled', 'canceled')
        : err instanceof DownloadError
          ? err
          : new DownloadError('network', err instanceof Error ? err.message : String(err));
      return { ok: false, code: e.code, message: e.message, received, total };
    }
  })();

  return { done, cancel: () => ctl.abort() };
}

/** Remove the staging folder once Squirrel has taken the packages (or they are stale). */
export function clearStaging(stagingDir: string): void {
  try {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  } catch {
    /* in use or already gone; the next download clears it */
  }
}

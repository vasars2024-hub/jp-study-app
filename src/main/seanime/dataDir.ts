/**
 * Where the sidecar's `--datadir` lives.
 *
 * Phase 1 deliberately made this a throwaway: `fs.mkdtempSync(tmpdir, 'seanime-phase1-')`
 * created a fresh directory on every start and `stop()` removed it. That was the right
 * call while the only thing being proven was lifecycle — it guaranteed no Study OS user
 * data could be touched — but it is also one of the two things standing between the
 * passed G-PLAY gate and retiring the old player (the other is the packaged binary; see
 * `exePath.ts` and `docs/migration/NEXT_SESSION.md`, "What old-player retirement really
 * needs"). A disposable datadir means every launch starts with no settings and no
 * library, so a normal run with `SEANIME_SIDECAR` on would re-scan into a directory that
 * is deleted again on quit, and any installed provider extension would vanish with it.
 *
 * Both blockers are closed, and `SEANIME_SIDECAR` is **on by default** as of 2026-07-31 —
 * so the durable resolution below is now what every ordinary run gets, not just a
 * harness. This file is load-bearing for that flip rather than preparation for it.
 *
 * Resolution order, and why:
 *  1. `SEANIME_DATADIR` — wins outright. Every proof harness runs on an isolated,
 *     pre-scanned profile and must never be silently redirected at the real one.
 *     The caller owns it, which is the documented rollback.
 *  2. `<userData>/seanime` — the durable default. A *subdirectory* of Study OS user data,
 *     never the root: no Study OS file lives under it, so the isolation the Phase 1
 *     header claimed still holds in the sense that matters (nothing shared, nothing
 *     overwritten), while the sidecar keeps its settings, library and extensions across
 *     restarts.
 *
 * Neither is disposable, so `stop()` no longer deletes anything.
 *
 * One-time adoption: a `seanime-phase1-*` directory can still be sitting in the OS temp
 * dir, left behind whenever a temp-datadir run was killed rather than stopped (two exist
 * on the machine this was written on). If the durable datadir has no database yet, the
 * most recently written of those is copied in, so a profile that was already configured
 * and scanned is not thrown away by this change. It is a copy, not a move — the source is
 * temp and the OS reclaims it — and a failure is reported, not thrown: starting empty is
 * always better than not starting.
 *
 * Kept free of `electron` and `node:fs` imports so it is directly testable: the caller
 * supplies the environment and a small filesystem surface.
 */

import path from 'node:path';

export interface SeanimeDataDirContext {
  /** `process.env.SEANIME_DATADIR`, untrimmed. */
  envOverride?: string | undefined;
  /** `app.getPath('userData')`. */
  userDataPath: string;
  /** `os.tmpdir()` — searched for an adoptable legacy datadir. */
  tmpDir: string;
}

/** The filesystem operations resolution needs, injected so tests need no disk. */
export interface SeanimeDataDirIo {
  exists(target: string): boolean;
  isDirectory(target: string): boolean;
  mkdirp(target: string): void;
  readDirNames(target: string): string[];
  /** Last-write time in ms, or 0 when unknown. */
  mtimeMs(target: string): number;
  /** Recursive copy that must skip any path segment named in `skip`. */
  copyDir(from: string, to: string, skip: readonly string[]): void;
}

export interface SeanimeDataDirResolution {
  /** The directory to pass as `--datadir`. */
  dataDir: string;
  /** Which rule chose it. */
  source: 'env' | 'user-data';
  /** Legacy temp datadir adopted on this start, if any. */
  migratedFrom: string | null;
  /** A non-fatal adoption failure, worth surfacing in the log tail. */
  migrationError: string | null;
}

/** The `userData` subdirectory the sidecar owns. Never `userData` itself. */
export const USER_DATA_SUBDIR = 'seanime';
/** Prefix of the Phase 1 throwaway datadirs, kept only to adopt leftovers. */
export const LEGACY_TEMP_PREFIX = 'seanime-phase1-';
/** Presence of this file is what makes a directory a real datadir worth adopting. */
export const DATADIR_DB_FILE = 'seanime.db';
/** Regenerated on demand, so adoption leaves them behind. */
export const MIGRATION_SKIP: readonly string[] = ['logs', 'cache'];

/**
 * The newest leftover Phase 1 datadir that actually holds a database, or null.
 * Ordered by the database's own mtime rather than the directory's: the directory is
 * touched by log writes, the database by real use.
 */
export function findAdoptableLegacyDataDir(
  tmpDir: string,
  io: SeanimeDataDirIo,
): string | null {
  let best: { dir: string; mtime: number } | null = null;
  let names: string[];
  try {
    names = io.readDirNames(tmpDir);
  } catch {
    return null;
  }
  for (const name of names) {
    if (!name.startsWith(LEGACY_TEMP_PREFIX)) continue;
    const dir = path.join(tmpDir, name);
    if (!io.isDirectory(dir)) continue;
    const db = path.join(dir, DATADIR_DB_FILE);
    if (!io.exists(db)) continue;
    const mtime = io.mtimeMs(db);
    if (!best || mtime > best.mtime) best = { dir, mtime };
  }
  return best?.dir ?? null;
}

export function resolveSeanimeDataDir(
  context: SeanimeDataDirContext,
  io: SeanimeDataDirIo,
): SeanimeDataDirResolution {
  const override = context.envOverride?.trim();
  if (override) {
    io.mkdirp(override);
    return { dataDir: override, source: 'env', migratedFrom: null, migrationError: null };
  }

  const dataDir = path.join(context.userDataPath, USER_DATA_SUBDIR);
  io.mkdirp(dataDir);

  // Already a real profile here: never overwrite it from temp residue.
  if (io.exists(path.join(dataDir, DATADIR_DB_FILE))) {
    return { dataDir, source: 'user-data', migratedFrom: null, migrationError: null };
  }

  const legacy = findAdoptableLegacyDataDir(context.tmpDir, io);
  if (!legacy) {
    return { dataDir, source: 'user-data', migratedFrom: null, migrationError: null };
  }
  try {
    io.copyDir(legacy, dataDir, MIGRATION_SKIP);
    return { dataDir, source: 'user-data', migratedFrom: legacy, migrationError: null };
  } catch (err) {
    return {
      dataDir,
      source: 'user-data',
      migratedFrom: null,
      migrationError: `could not adopt the legacy datadir at ${legacy}: ${String(err)}`,
    };
  }
}

/** The line the supervisor puts in its log tail, so a migration is never silent. */
export function seanimeDataDirLogLine(resolution: SeanimeDataDirResolution): string {
  const where = `datadir ${resolution.dataDir} (${resolution.source})`;
  if (resolution.migrationError) return `${where} — ${resolution.migrationError}`;
  if (resolution.migratedFrom) return `${where} — adopted from ${resolution.migratedFrom}`;
  return where;
}

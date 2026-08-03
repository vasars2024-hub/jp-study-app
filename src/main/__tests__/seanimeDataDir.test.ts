import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DATADIR_DB_FILE,
  LEGACY_TEMP_PREFIX,
  MIGRATION_SKIP,
  USER_DATA_SUBDIR,
  findAdoptableLegacyDataDir,
  resolveSeanimeDataDir,
  seanimeDataDirLogLine,
  type SeanimeDataDirIo,
} from '../seanime/dataDir';

const USER_DATA = 'C:/users/x/AppData/Roaming/jp-study-app';
const TMP = 'C:/tmp';

interface FakeDiskOptions {
  /** Absolute paths that exist as files. */
  files?: string[];
  /** Absolute paths that exist as directories. */
  dirs?: string[];
  /** `readdir` results, keyed by directory. */
  entries?: Record<string, string[]>;
  /** mtimes in ms, keyed by path. */
  mtimes?: Record<string, number>;
  /** Make `copyDir` throw, to exercise the non-fatal path. */
  copyFails?: string;
}

interface FakeDisk extends SeanimeDataDirIo {
  made: string[];
  copies: Array<{ from: string; to: string; skip: readonly string[] }>;
}

/**
 * A disk that records what was asked of it. Paths are compared normalized, because the
 * module joins with `path.join` and the fixtures are written with forward slashes.
 */
function fakeDisk(options: FakeDiskOptions = {}): FakeDisk {
  const norm = (p: string): string => path.normalize(p);
  const files = new Set((options.files ?? []).map(norm));
  const dirs = new Set((options.dirs ?? []).map(norm));
  const made: string[] = [];
  const copies: Array<{ from: string; to: string; skip: readonly string[] }> = [];
  return {
    made,
    copies,
    exists: (target) => files.has(norm(target)) || dirs.has(norm(target)),
    isDirectory: (target) => dirs.has(norm(target)),
    mkdirp: (target) => {
      made.push(norm(target));
      dirs.add(norm(target));
    },
    readDirNames: (target) => options.entries?.[norm(target)] ?? [],
    mtimeMs: (target) => options.mtimes?.[norm(target)] ?? 0,
    copyDir: (from, to, skip) => {
      if (options.copyFails) throw new Error(options.copyFails);
      copies.push({ from: norm(from), to: norm(to), skip });
    },
  };
}

const DURABLE = path.join(USER_DATA, USER_DATA_SUBDIR);
const legacy = (suffix: string): string => path.join(TMP, `${LEGACY_TEMP_PREFIX}${suffix}`);
const legacyDb = (suffix: string): string => path.join(legacy(suffix), DATADIR_DB_FILE);

describe('resolveSeanimeDataDir', () => {
  it('defaults to a durable directory under userData and creates it', () => {
    const io = fakeDisk();
    const resolved = resolveSeanimeDataDir(
      { userDataPath: USER_DATA, tmpDir: TMP },
      io,
    );
    expect(resolved.source).toBe('user-data');
    expect(resolved.dataDir).toBe(DURABLE);
    expect(io.made).toContain(DURABLE);
  });

  it('owns a subdirectory, never the Study OS userData root', () => {
    const resolved = resolveSeanimeDataDir(
      { userDataPath: USER_DATA, tmpDir: TMP },
      fakeDisk(),
    );
    // The regression this guards: pointing --datadir at userData itself would put the
    // sidecar's own database next to library.json / profiles.json / media.json.
    expect(path.normalize(resolved.dataDir)).not.toBe(path.normalize(USER_DATA));
    expect(path.dirname(resolved.dataDir)).toBe(path.normalize(USER_DATA));
  });

  it('lets SEANIME_DATADIR win, so a proof profile is never redirected at the real one', () => {
    const io = fakeDisk({ files: [legacyDb('old')], dirs: [legacy('old')] });
    const resolved = resolveSeanimeDataDir(
      {
        envOverride: '  C:/tmp/seanime-phase3-gplay  ',
        userDataPath: USER_DATA,
        tmpDir: TMP,
      },
      io,
    );
    expect(resolved.source).toBe('env');
    expect(resolved.dataDir).toBe('C:/tmp/seanime-phase3-gplay');
    // An override must not trigger an adoption into itself.
    expect(resolved.migratedFrom).toBeNull();
    expect(io.copies).toHaveLength(0);
  });

  it('ignores a blank override rather than passing an empty --datadir', () => {
    const resolved = resolveSeanimeDataDir(
      { envOverride: '   ', userDataPath: USER_DATA, tmpDir: TMP },
      fakeDisk(),
    );
    expect(resolved.source).toBe('user-data');
    expect(resolved.dataDir).toBe(DURABLE);
  });

  it('adopts the newest leftover temp datadir when the durable one is still empty', () => {
    const io = fakeDisk({
      dirs: [legacy('aaa'), legacy('bbb')],
      files: [legacyDb('aaa'), legacyDb('bbb')],
      entries: { [path.normalize(TMP)]: [`${LEGACY_TEMP_PREFIX}aaa`, `${LEGACY_TEMP_PREFIX}bbb`] },
      mtimes: { [legacyDb('aaa')]: 1_000, [legacyDb('bbb')]: 2_000 },
    });
    const resolved = resolveSeanimeDataDir({ userDataPath: USER_DATA, tmpDir: TMP }, io);
    expect(resolved.migratedFrom).toBe(legacy('bbb'));
    expect(io.copies).toEqual([
      { from: legacy('bbb'), to: DURABLE, skip: MIGRATION_SKIP },
    ]);
  });

  it('never overwrites an existing durable profile from temp residue', () => {
    const io = fakeDisk({
      dirs: [DURABLE, legacy('aaa')],
      files: [path.join(DURABLE, DATADIR_DB_FILE), legacyDb('aaa')],
      entries: { [path.normalize(TMP)]: [`${LEGACY_TEMP_PREFIX}aaa`] },
    });
    const resolved = resolveSeanimeDataDir({ userDataPath: USER_DATA, tmpDir: TMP }, io);
    expect(resolved.migratedFrom).toBeNull();
    expect(io.copies).toHaveLength(0);
  });

  it('reports a failed adoption instead of throwing — starting empty beats not starting', () => {
    const io = fakeDisk({
      dirs: [legacy('aaa')],
      files: [legacyDb('aaa')],
      entries: { [path.normalize(TMP)]: [`${LEGACY_TEMP_PREFIX}aaa`] },
      copyFails: 'EPERM',
    });
    const resolved = resolveSeanimeDataDir({ userDataPath: USER_DATA, tmpDir: TMP }, io);
    expect(resolved.dataDir).toBe(DURABLE);
    expect(resolved.migratedFrom).toBeNull();
    expect(resolved.migrationError).toContain('EPERM');
    expect(seanimeDataDirLogLine(resolved)).toContain('EPERM');
  });
});

describe('findAdoptableLegacyDataDir', () => {
  it('skips a directory with no database — an empty start is not a profile', () => {
    const io = fakeDisk({
      dirs: [legacy('empty')],
      entries: { [path.normalize(TMP)]: [`${LEGACY_TEMP_PREFIX}empty`] },
    });
    expect(findAdoptableLegacyDataDir(TMP, io)).toBeNull();
  });

  it('ignores unrelated temp directories', () => {
    const io = fakeDisk({
      dirs: [path.join(TMP, 'seanime-phase3-gplay-20260728')],
      files: [path.join(TMP, 'seanime-phase3-gplay-20260728', DATADIR_DB_FILE)],
      entries: { [path.normalize(TMP)]: ['seanime-phase3-gplay-20260728', 'npm-cache'] },
    });
    // A proof profile is not residue and must not be silently adopted as the user's.
    expect(findAdoptableLegacyDataDir(TMP, io)).toBeNull();
  });

  it('survives an unreadable temp directory', () => {
    const io: SeanimeDataDirIo = {
      ...fakeDisk(),
      readDirNames: () => {
        throw new Error('EACCES');
      },
    };
    expect(findAdoptableLegacyDataDir(TMP, io)).toBeNull();
  });
});

describe('the supervisor no longer disposes of the datadir', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'seanime', 'supervisor.ts'),
    'utf8',
  );

  it('does not mkdtemp a datadir per start', () => {
    // The Phase 1 behaviour this change exists to remove: a fresh empty datadir on
    // every launch, so the library grid was empty and a re-scan ran each time.
    expect(source).not.toContain('mkdtemp');
    expect(source).not.toContain(LEGACY_TEMP_PREFIX);
  });

  it('does not remove the datadir on stop', () => {
    expect(source).not.toContain('rmSync');
  });
});

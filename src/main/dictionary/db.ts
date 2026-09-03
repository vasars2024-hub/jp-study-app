// The dictionary database connection: one file, one handle, opened lazily.
//
// Everything here exists to keep `better-sqlite3` behind a seam. The driver is
// synchronous by design — that is why it is fast enough to call from an IPC
// handler without a worker — but it means a slow query blocks the main process,
// so bulk work (imports) belongs on a utilityProcess and only lookups run here.
//
// The driver is required lazily rather than imported. Two reasons, and the second
// is the one that matters: a top-level import would load a native binary at module
// eval, in every context that touches this module including ones that only want a
// type; and the require path has to survive both runtimes. It does — verified in
// docs/plans/DICTIONARY_BUILD_LOG.md, better-sqlite3 13.x is a Node-API/prebuildify
// module, one `prebuilds/<platform>-<arch>.node` loaded identically by Electron 42
// (NODE_MODULE_VERSION 146) and by node under vitest (137). There is no ABI rebuild
// step and no mock layer: these tests run against the engine that ships.

import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { DICT_SCHEMA_VERSION, MIGRATIONS } from './schema';

/**
 * The slice of better-sqlite3 this codebase uses.
 *
 * Declared structurally rather than imported: `@types/better-sqlite3` is not a
 * dependency, and adding one to describe five methods would be a worse trade than
 * writing the five. It also keeps every call site honest about what it may rely on.
 */
export interface SqliteStatement {
  run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  iterate(...params: unknown[]): IterableIterator<unknown>;
}

export interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  pragma(source: string, options?: { simple?: boolean }): unknown;
  transaction<T extends (...args: never[]) => unknown>(fn: T): T;
  close(): void;
  readonly open: boolean;
  readonly name: string;
}

type DatabaseCtor = new (filename: string, options?: Record<string, unknown>) => SqliteDb;

let driver: DatabaseCtor | null = null;

function loadDriver(): DatabaseCtor {
  if (driver) return driver;
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  driver = require('better-sqlite3') as DatabaseCtor;
  return driver;
}

/** `userData/dictionary` — the directory, not the file. */
export function dictionaryDir(): string {
  return path.join(app.getPath('userData'), 'dictionary');
}

export function dictionaryDbPath(): string {
  return path.join(dictionaryDir(), 'dict.db');
}

/**
 * Applies every migration newer than the file's `user_version`, each in its own
 * transaction, and returns the version landed on.
 *
 * A step that throws rolls back only itself: the ladder stops there and the file
 * stays on the last version that fully applied, rather than half-way through one.
 * That is the difference between a recoverable upgrade and a corrupt database.
 */
export function migrateDictionaryDb(db: SqliteDb): number {
  let current = Number(db.pragma('user_version', { simple: true })) || 0;
  for (const step of MIGRATIONS) {
    if (step.version <= current) continue;
    const apply = db.transaction(() => {
      step.up(db);
      // `user_version` takes no bound parameter, and the value is a number we
      // produced, never user input.
      db.pragma(`user_version = ${step.version}`);
    });
    try {
      apply();
    } catch (err) {
      throw new Error(
        `dictionary migration ${step.version} (${step.name}) failed, database left at version ${current}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    current = step.version;
  }
  return current;
}

export interface OpenDictionaryOptions {
  /** Overrides `userData/dictionary`. Tests pass a temp dir; the app never does. */
  dir?: string;
  /**
   * Opens a connection that CANNOT write: SQLite's own `SQLITE_OPEN_READONLY`,
   * no migration ladder, and none of the pragmas that persist.
   *
   * Until 2026-09-02 this flag did only the middle one, so "readonly" was a
   * naming convention the driver knew nothing about — the handle was
   * `new Database(path)` with default read-write flags and still ran
   * `journal_mode = WAL`, which stamps the file header. The invariant the read
   * worker's comment claims ("this role must never change the file") held only
   * because the dispatch table happened to expose read functions exclusively;
   * an eighth entry that wrote would have been undefended. Now the driver
   * enforces it and a write throws (boss audit 2026-09-02, Finding 5).
   */
  readonly?: boolean;
  /**
   * Opens a normal READ-WRITE handle but does not run the migration ladder.
   *
   * This is the OTHER half of what `readonly` used to mean, and separating them
   * is the rest of Finding 5's repair: one caller — the schema-6 migration
   * suite's `openV5()` — passed `readonly: true` purely to stop the ladder and
   * then drove `MIGRATIONS` by hand and set `user_version` itself. Once
   * `readonly` reached the driver, that caller broke with
   * `SqliteError: unable to open database file` (SQLITE_OPEN_READONLY will not
   * create a file), which is the flag doing its job against a caller that never
   * wanted it. A test that must build a database at an OLD schema version is a
   * legitimate need; asking for it by name is the fix.
   *
   * `readonly` implies this — a connection that cannot write cannot migrate.
   */
  skipMigrations?: boolean;
}

/**
 * Opens (creating if needed) the dictionary database and brings it up to date.
 *
 * Pragmas, and why each one:
 *   journal_mode=WAL   a reader (lookup) and a writer (import) at the same time
 *   foreign_keys=ON    the schema declares cascades; without this they are comments
 *   synchronous=NORMAL safe under WAL, and an order of magnitude faster on import
 *   mmap_size          reads come from the page cache rather than through syscalls
 *   busy_timeout       an import holding a write lock makes a lookup wait, not fail
 */
export function openDictionaryDb(options: OpenDictionaryOptions = {}): SqliteDb {
  const dir = options.dir ?? dictionaryDir();
  fs.mkdirSync(dir, { recursive: true });
  const Database = loadDriver();
  const db = new Database(path.join(dir, 'dict.db'), options.readonly ? { readonly: true } : undefined);

  // `journal_mode` and `synchronous` are the two that reach the FILE: the first
  // rewrites its header to switch journalling modes, the second is stored for the
  // writes this connection makes. A readonly handle may not run either — SQLite
  // rejects the first outright — and needs neither, because it inherits whatever
  // mode the writer already put the file in. The remaining three are per-connection
  // memory and locking settings, valid and useful in both roles.
  if (!options.readonly) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('mmap_size = 268435456'); // 256 MB
  db.pragma('busy_timeout = 5000');

  if (!options.readonly && !options.skipMigrations) migrateDictionaryDb(db);
  return db;
}

let shared: SqliteDb | null = null;

/** The process-wide handle. Opened on first use, reused after. */
export function dictionaryDb(): SqliteDb {
  if (shared && shared.open) return shared;
  shared = openDictionaryDb();
  return shared;
}

export function closeDictionaryDb(): void {
  if (shared && shared.open) shared.close();
  shared = null;
}

/** True when the schema on disk is the one this build expects. */
export function dictionarySchemaIsCurrent(db: SqliteDb): boolean {
  return Number(db.pragma('user_version', { simple: true })) === DICT_SCHEMA_VERSION;
}

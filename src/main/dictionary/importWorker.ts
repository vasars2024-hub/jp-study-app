// The dictionary import utility process: where the slow work actually runs.
//
// ## Why this file exists at all
//
// `service.ts` has carried a comment since Phase 1 saying the imports it exposes
// (`migrateLegacyStoresNow`, `importCedictFileNow`, …) block the calling thread
// for minutes — 140 MB of legacy JSON writes a ~300 MB database — and that the
// `utilityProcess` which would host them was blocked because it needs its own
// build entry point. This is that entry point. `forge.config.ts` builds it as a
// third Vite target alongside `main` and `preload`; that one array element is the
// whole build-config footprint.
//
// ## Why utilityProcess and not worker_threads
//
// `better-sqlite3` is a native Node-API module and this process opens its own
// handle to the same file the main process reads. A `utilityProcess` is a real
// child process, so that handle is genuinely independent (WAL lets a reader and
// a writer coexist — see `db.ts`'s pragmas) and a runaway import can be killed.
// A `worker_threads` Worker would share the main process's heap and its fate.
//
// ## The one Electron subtlety
//
// A utility process is a Node environment with only a sliver of Electron in it:
// `app` does not exist here. That is why every path this file needs — the
// database directory and the legacy store root — arrives in the `start` message
// instead of being resolved locally. `db.ts` is imported for `openDictionaryDb`,
// which takes an explicit `dir` and never reaches its `app`-dependent default.

import { openDictionaryDb, type SqliteDb } from './db';
import { importCedict } from './importers/cedict';
import { importWiktextract, readJsonlLines } from './importers/wiktextract';
import { importDsl, readDslFile } from './importers/dsl';
import { importJmnedict } from './importers/jmnedict';
import { importKanjidic } from './importers/kanjidic';
import { importStarDict } from './importers/stardict';
import { importTatoeba } from './importers/tatoeba';
import { migrateLegacyYomitanStores } from './migrate';
import { runDictionaryRead, type DictionaryReadReply, type DictionaryReadRequest } from './readProtocol';
import { runSourceLangRelabel } from './sourceLang';
import type {
  DictionaryImportKind,
  DictionaryImportRequest,
  DictionaryImportTerminal,
  DictionaryImportWorkerIn,
  DictionaryImportWorkerOut,
} from '../../shared/dictionaryImportJob';
import fs from 'node:fs';

/**
 * `process.parentPort` is Electron's utility-process channel. Typed locally
 * because this module is also loaded by the test suite under plain Node, where
 * the property genuinely is absent.
 */
interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

function parentPort(): ParentPort | null {
  const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
  return port ?? null;
}

/** Progress is sampled, not streamed: one message per this many source lines. */
const PROGRESS_EVERY = 20_000;

/** How long to wait for the parent to reap us before exiting anyway. */
const WORKER_EXIT_GRACE_MS = 30_000;

function numericCounts(source: Record<string, unknown>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) counts[key] = value;
  }
  return counts;
}

export interface RunImportDeps {
  /** Reports progress. The caller decides whether that reaches the main process. */
  onProgress: (lines: number, phase: 'reading' | 'importing' | 'committing', percent?: number) => void;
  /** Polled on the importers' own cadence; true rolls the transaction back. */
  shouldCancel: () => boolean;
  openDb: (dir: string) => SqliteDb;
}

/**
 * Runs one import to completion and describes the outcome.
 *
 * Exported separately from the message plumbing so the decision table — which
 * importer, cancelled versus committed, what counts survive — is testable
 * without an Electron child process.
 */
export function runDictionaryImport(
  request: DictionaryImportRequest,
  dbDir: string,
  legacyRoot: string,
  deps: RunImportDeps,
): DictionaryImportTerminal {
  const db = deps.openDb(dbDir);
  try {
    if (request.kind === 'cedict') {
      // Read before import so a missing file fails as `failed`, not as an empty
      // but "committed" dictionary.
      deps.onProgress(0, 'reading');
      const text = fs.readFileSync(request.filePath as string, 'utf8');
      deps.onProgress(0, 'importing');
      const counts = importCedict(db, text, {
        ...(request.dictId ? { dictId: request.dictId } : {}),
        progressEvery: PROGRESS_EVERY,
        onProgress: (lines) => deps.onProgress(lines, 'importing'),
        shouldCancel: deps.shouldCancel,
      });
      // `numericCounts` drops `dictId` for us: the contract's counts map is
      // numbers only, and the id is already on the snapshot.
      const { cancelled, ...rest } = counts;
      return cancelled
        ? { state: 'cancelled', counts: {} }
        : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'wiktextract') {
      deps.onProgress(0, 'importing');
      const counts = importWiktextract(db, readJsonlLines(request.filePath as string), {
        ...(request.dictId ? { dictId: request.dictId } : {}),
        progressEvery: PROGRESS_EVERY,
        onProgress: (lines) => deps.onProgress(lines, 'importing'),
        shouldCancel: deps.shouldCancel,
      });
      const { cancelled, ...rest } = counts;
      return cancelled
        ? { state: 'cancelled', counts: {} }
        : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'dsl') {
      deps.onProgress(0, 'reading');
      const text = readDslFile(request.filePath as string);
      deps.onProgress(0, 'importing');
      const counts = importDsl(db, text, {
        ...(request.dictId ? { dictId: request.dictId } : {}),
        progressEvery: PROGRESS_EVERY,
        onProgress: (lines) => deps.onProgress(lines, 'importing'),
        shouldCancel: deps.shouldCancel,
      });
      const { cancelled, ...rest } = counts;
      return cancelled ? { state: 'cancelled', counts: {} } : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'jmnedict') {
      deps.onProgress(0, 'reading');
      const xml = fs.readFileSync(request.filePath as string, 'utf8');
      deps.onProgress(0, 'importing');
      const counts = importJmnedict(db, xml, {
        ...(request.dictId ? { dictId: request.dictId } : {}),
        progressEvery: PROGRESS_EVERY,
        onProgress: (entries) => deps.onProgress(entries, 'importing'),
        shouldCancel: deps.shouldCancel,
      });
      const { cancelled, ...rest } = counts;
      return cancelled ? { state: 'cancelled', counts: {} } : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'kanjidic') {
      deps.onProgress(0, 'reading');
      const xml = fs.readFileSync(request.filePath as string, 'utf8');
      deps.onProgress(0, 'importing');
      const counts = importKanjidic(db, xml, {
        ...(request.dictId ? { dictId: request.dictId } : {}),
        progressEvery: PROGRESS_EVERY,
        onProgress: (entries) => deps.onProgress(entries, 'importing'),
        shouldCancel: deps.shouldCancel,
      });
      const { cancelled, ...rest } = counts;
      return cancelled ? { state: 'cancelled', counts: {} } : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'stardict') {
      deps.onProgress(0, 'reading');
      const counts = importStarDict(db, request.filePath as string, {
        ...(request.dictId ? { dictId: request.dictId } : {}),
        progressEvery: PROGRESS_EVERY,
        onProgress: (entries) => deps.onProgress(entries, 'importing'),
        shouldCancel: deps.shouldCancel,
      });
      const { cancelled, ...rest } = counts;
      return cancelled ? { state: 'cancelled', counts: {} } : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'tatoeba') {
      deps.onProgress(0, 'reading');
      const counts = importTatoeba(db, request.filePath as string, request.linksFilePath as string, {
        ...(request.dictId ? { dictId: request.dictId } : {}), progressEvery: PROGRESS_EVERY,
        onProgress: (lines) => deps.onProgress(lines, 'importing'), shouldCancel: deps.shouldCancel,
      });
      const { cancelled, ...rest } = counts;
      return cancelled ? { state: 'cancelled', counts: {} } : { state: 'committed', counts: numericCounts(rest) };
    }

    if (request.kind === 'relabel') {
      // No `shouldCancel` is threaded in, and that is deliberate rather than an
      // omission. The relabel is five UPDATE statements in one transaction: there
      // is no row loop to poll between, and SQLite will not abandon a statement
      // half-way. A cancel button that could only ever fire before the first
      // statement or after the last would be a lie about what it does. The one
      // honest check is before the transaction opens.
      if (deps.shouldCancel()) return { state: 'cancelled', counts: {} };
      deps.onProgress(0, 'committing');
      const outcome = runSourceLangRelabel(db, request.dictId as string, request.toLang as string);
      if (!outcome.ok) {
        // `not-found` is the only failure this can report, and it is a real one:
        // the dictionary was removed between the renderer reading the list and
        // the job reaching the worker.
        return { state: 'failed', error: `No dictionary with id ${request.dictId}.` };
      }
      return { state: 'committed', counts: numericCounts(outcome.counts) };
    }

    const result = migrateLegacyYomitanStores(
      db,
      legacyRoot,
      (progress) => deps.onProgress(progress.current, 'importing', progress.percent),
      deps.shouldCancel,
      // A `dictId` on a legacy request scopes it to that one store — the job a
      // fresh Yomitan import queues for itself.
      request.dictId ? new Set([request.dictId]) : undefined,
    );
    // Each store is its own transaction, so a cancelled legacy migration still
    // committed whole dictionaries. Reporting them is the honest answer; claiming
    // zero would make the next run look like it had nothing to do.
    const counts = {
      stores: result.imported.length,
      skipped: result.skipped.length,
      headwords: result.imported.reduce((sum, entry) => sum + entry.headwords, 0),
      senses: result.imported.reduce((sum, entry) => sum + entry.senses, 0),
      glosses: result.imported.reduce((sum, entry) => sum + entry.glosses, 0),
      xrefs: result.imported.reduce((sum, entry) => sum + entry.xrefs, 0),
    };
    return { state: result.cancelled ? 'cancelled' : 'committed', counts };
  } finally {
    db.close();
  }
}

/** How often the importers' cancel poll really touches the file system. */
export const CANCEL_CHECK_MS = 250;

/**
 * The importers poll `shouldCancel` once per row — over a million times for the
 * bundled stores — and each poll was an `fs.existsSync` on the cancel marker.
 * Checking the clock instead, and the disk at most every `CANCEL_CHECK_MS`,
 * keeps cancel responsive while taking the syscalls out of the hot loop.
 */
export function throttledCancelCheck(check: () => boolean, intervalMs = CANCEL_CHECK_MS, now = Date.now): () => boolean {
  let last = -Infinity;
  let cancelled = false;
  return () => {
    if (cancelled) return true;
    const t = now();
    if (t - last < intervalMs) return false;
    last = t;
    cancelled = check();
    return cancelled;
  };
}

/**
 * Connection settings for a bulk import. The import is one long transaction per
 * store that writes several FTS5 indexes; a larger page cache keeps their b-trees
 * in memory instead of re-reading pages, and temporary structures stay in RAM.
 * Durability is unchanged: the commit is still WAL + synchronous=NORMAL.
 */
export function tuneForImport(db: SqliteDb): SqliteDb {
  try {
    db.pragma('cache_size = -65536'); // 64 MB
    db.pragma('temp_store = MEMORY');
  } catch {
    /* a read-only or exotic handle: import at default settings */
  }
  return db;
}

/**
 * Wires the message channel to `runDictionaryImport` and exits when it is done.
 *
 * One process serves one job. That is what makes a hard `kill()` a safe last
 * resort for a wedged import: there is no second job to lose.
 */
export function attachDictionaryImportWorker(port: ParentPort): void {
  let started = false;
  let cancelRequested = false;

  port.on('message', (event) => {
    const message = event?.data as DictionaryImportWorkerIn | undefined;
    if (!message || typeof message !== 'object') return;

    if (message.type === 'cancel') {
      cancelRequested = true;
      return;
    }
    if (message.type !== 'start' || started) return;
    started = true;

    const { jobId, request, dbDir, legacyRoot, cancelPath } = message;
    const kind: DictionaryImportKind = request.kind;
    const send = (out: DictionaryImportWorkerOut): void => port.postMessage(out);

    let terminal: DictionaryImportTerminal;
    try {
      terminal = runDictionaryImport(request, dbDir, legacyRoot, {
        onProgress: (lines, phase, percent) => send({
          type: 'progress',
          progress: { jobId, kind, lines, phase, ...(percent === undefined ? {} : { percent }) },
        }),
        shouldCancel: throttledCancelCheck(() => cancelRequested || fs.existsSync(cancelPath)),
        openDb: (dir) => tuneForImport(openDictionaryDb({ dir })),
      });
    } catch (error) {
      terminal = { state: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
    send({ type: 'terminal', jobId, kind, terminal });
    // Deliberately does NOT exit here. Measured live on 2026-08-13: sending the
    // terminal message and then calling `process.exit(0)` on a zero-delay timer
    // races the MessagePort flush, and the parent saw the *exit* first — so a
    // failed import reported the generic "stopped before it finished" instead of
    // the real error. The parent kills this process once it has the message
    // (`importJobs.ts`), which is ordered rather than hopeful. The timer below is
    // only a leak guard for a parent that died without reaping us.
    setTimeout(() => process.exit(0), WORKER_EXIT_GRACE_MS).unref?.();
  });
  port.start?.();
}

export interface ReadWorkerDeps {
  openDb: (dir: string) => SqliteDb;
}

/**
 * The other role this bundle can play: a long-lived process answering the main
 * process's dictionary reads on its own SQLite handle, so a cold page fault is
 * taken here rather than on Electron's main loop (`readProtocol.ts` has the
 * measurement). One process, many reads, until the parent kills it.
 *
 * Which role a process has is decided by what it is sent — a read process never
 * receives `start`, an import process never `read` — so both attach to the same
 * port and each ignores the other's messages. Reads are answered strictly in
 * arrival order on one handle: the scan-shaped reads yield between windows, and
 * interleaving two of them on one connection buys nothing the caller can see.
 */
export function attachDictionaryReadWorker(port: ParentPort, deps: ReadWorkerDeps): void {
  let db: SqliteDb | null = null;
  let dbDir = '';
  let queue: Promise<void> = Promise.resolve();

  port.on('message', (event) => {
    const message = event?.data as DictionaryReadRequest | undefined;
    if (!message || typeof message !== 'object' || message.type !== 'read') return;
    queue = queue.then(async () => {
      let reply: DictionaryReadReply;
      try {
        if (!db || !db.open || dbDir !== message.dbDir) {
          if (db?.open) db.close();
          db = deps.openDb(message.dbDir);
          dbDir = message.dbDir;
        }
        const value = await runDictionaryRead(db, message.kind, message.query);
        reply = { type: 'readResult', id: message.id, ok: true, value };
      } catch (error) {
        // An error is an answer. A read that threw and said nothing would look,
        // from the parent, exactly like a process that hung.
        reply = {
          type: 'readResult',
          id: message.id,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      port.postMessage(reply);
    });
  });
  port.start?.();
}

const port = parentPort();
if (port) {
  attachDictionaryImportWorker(port);
  // `readonly` skips the migration ladder: this role must never change the
  // file, and the main process has already brought it up to date at boot.
  attachDictionaryReadWorker(port, { openDb: (dir) => openDictionaryDb({ dir, readonly: true }) });
}

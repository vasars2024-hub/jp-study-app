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
import { migrateLegacyYomitanStores } from './migrate';
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
  onProgress: (lines: number, phase: 'reading' | 'importing' | 'committing') => void;
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

    const result = migrateLegacyYomitanStores(
      db,
      legacyRoot,
      (progress) => deps.onProgress(progress.current, 'importing'),
      deps.shouldCancel,
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
    };
    return { state: result.cancelled ? 'cancelled' : 'committed', counts };
  } finally {
    db.close();
  }
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

    const { jobId, request, dbDir, legacyRoot } = message;
    const kind: DictionaryImportKind = request.kind;
    const send = (out: DictionaryImportWorkerOut): void => port.postMessage(out);

    let terminal: DictionaryImportTerminal;
    try {
      terminal = runDictionaryImport(request, dbDir, legacyRoot, {
        onProgress: (lines, phase) => send({ type: 'progress', progress: { jobId, kind, lines, phase } }),
        shouldCancel: () => cancelRequested,
        openDb: (dir) => openDictionaryDb({ dir }),
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

const port = parentPort();
if (port) attachDictionaryImportWorker(port);

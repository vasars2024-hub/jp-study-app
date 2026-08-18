// Main's side of the .apkg draft-read utility process.
//
// One process per read, forked and reaped. A long-lived pool was considered and
// rejected: a read happens when a human picks a deck, so the ~40 ms fork cost is
// invisible against a multi-second parse, and a pooled process would hold a
// sql.js WASM heap sized for the last deck opened for the rest of the session.
//
// `parseApkgDraftPage` is imported here as well, on purpose. It is the fallback
// whenever the worker never answers — the fork throwing, the fork succeeding on
// a module that is not there, or a child that dies mid-parse — and running it
// in-process is strictly better than refusing to open the deck. It is the SAME
// function the worker runs, so the two paths cannot drift and the fallback
// cannot quietly become a second, differently-behaved reader.
//
// A parse failure is NOT covered by the fallback: a corrupt package answers with
// `{ok:false}` and that message is the user's, so it is passed straight through.

import { utilityProcess } from 'electron';
import path from 'node:path';
import { parseApkgDraftPage, type ApkgParsedPage } from './apkgCollection';
import { APKG_READ_CANCELLED } from '../../shared/ankiDraft';
import type { ApkgReadWorkerIn, ApkgReadWorkerOut } from '../../shared/ankiDraft';

/**
 * Vite names the output after the entry file, so `apkgReadWorker.ts` builds to
 * `<.vite/build>/apkgReadWorker.js` beside `main.js` — the same resolution
 * `dictionary/importJobs.ts` uses for its worker.
 */
export function apkgReadWorkerPath(): string {
  return path.join(__dirname, 'apkgReadWorker.js');
}

/**
 * How long the child gets to say it has the request, NOT how long the parse gets.
 *
 * A deadline over the whole parse would be a guess about deck size — the
 * 100,000-note fixture legitimately reads for 6.2 s and a larger one takes
 * longer — and expiring it would stall the main loop with a duplicate parse,
 * which is exactly the freeze the utility process exists to prevent. The ack
 * arrives after fork + module evaluation only, so this bounds a child that never
 * came alive without ever bounding a deck that is merely big.
 */
export const APKG_READ_STARTUP_TIMEOUT_MS = 10_000;

/** Re-exported so the reader's own callers need one import, not two. */
export { APKG_READ_CANCELLED };

/**
 * The in-process parse, with the one thing a cancel can still do to it.
 *
 * It cannot be interrupted — it holds this event loop until it is done — so a
 * cancel that lands mid-parse cannot stop the work. What it can do is refuse the
 * result, which is what the user actually asked for: no draft, no session, no
 * remembered source. Reporting the page anyway would ignore a decision they made.
 */
function parseInProcess(
  request: ApkgReadWorkerIn,
  signal: AbortSignal | undefined,
): Promise<ApkgParsedPage> {
  return parseApkgDraftPage(request).then((parsed) => {
    if (signal?.aborted) throw new Error(APKG_READ_CANCELLED);
    return parsed;
  });
}

/**
 * A parse that runs somewhere other than this event loop.
 *
 * Resolves with the page, or rejects with the parse's own message. Rejection
 * reasons are kept distinct from parse failures where the caller can tell them
 * apart, because "this package is the compressed format" and "the reader process
 * died" need different instructions.
 */
export function parseApkgDraftPageOffMainLoop(
  request: ApkgReadWorkerIn,
  opts: { signal?: AbortSignal; startupTimeoutMs?: number } = {},
): Promise<ApkgParsedPage> {
  const { signal } = opts;
  // Nothing is forked for a read that was already abandoned — cancelling before
  // the work starts should cost a process, not save one after paying for it.
  if (signal?.aborted) return Promise.reject(new Error(APKG_READ_CANCELLED));

  let child: ReturnType<typeof utilityProcess.fork>;
  try {
    child = utilityProcess.fork(apkgReadWorkerPath(), [], {
      // Parsing a file this process already named has no business reaching the
      // network or inheriting a debug port.
      serviceName: 'jp-apkg-read',
      stdio: 'ignore',
    });
  } catch {
    // No worker to fork. Do the work here rather than refuse the deck; the main
    // loop stalls, which is the pre-existing behaviour, not a new failure.
    return parseInProcess(request, signal);
  }

  return new Promise<ApkgParsedPage>((resolve, reject) => {
    let settled = false;
    /**
     * The same in-process parse the `catch` above runs, reached from a child
     * that started and then said nothing.
     *
     * Measured 2026-08-18 in an isolated Electron: `utilityProcess.fork()` on an
     * absent module does NOT throw — it hands back a child that emits
     * `exit` with code 1. So the synchronous `catch` is dead for the exact
     * packaging fault it was written for, and the fallback has to live here too
     * or a missing `apkgReadWorker.js` refuses the deck with an untranslated
     * `apkg-read-worker-exit:1`.
     */
    const fallBackInProcess = (why: string): void => {
      console.warn(`[apkg-read] worker gave no answer (${why}); parsing on the main loop`);
      parseInProcess(request, signal).then(resolve, reject);
    };
    // Armed once the request is handed over and disarmed by the worker's ack, so
    // it measures startup and never the parse. See APKG_READ_STARTUP_TIMEOUT_MS.
    let startupTimer: ReturnType<typeof setTimeout> | undefined;
    const disarmStartup = (): void => {
      if (startupTimer === undefined) return;
      clearTimeout(startupTimer);
      startupTimer = undefined;
    };
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      disarmStartup();
      // Declared below: the two reference each other, so one order has to read
      // forwards. Only ever reached from a call, long after both are bound.
      signal?.removeEventListener('abort', onAbort);
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      fn();
    };
    // A cancel kills the child and stops. It deliberately does NOT fall back
    // in-process: the user asked for the read to end, not to move.
    const onAbort = (): void => finish(() => reject(new Error(APKG_READ_CANCELLED)));
    signal?.addEventListener('abort', onAbort);

    child.on('message', (value: unknown) => {
      const message = value as ApkgReadWorkerOut | undefined;
      // The ack is not an answer: it disarms the startup watchdog and the child
      // keeps the read. Checked before `ok`, which it deliberately does not carry.
      if (message && (message as { phase?: string }).phase === 'accepted') {
        disarmStartup();
        return;
      }
      if (!message || typeof message.ok !== 'boolean') {
        finish(() => reject(new Error('apkg-read-bad-response')));
        return;
      }
      if (!message.ok) {
        finish(() => reject(new Error(message.error)));
        return;
      }
      const { page, fingerprint, totalNotes, sourceKind, label, noteOffset, noteLimit } = message;
      finish(() =>
        resolve({ page, fingerprint, totalNotes, sourceKind, label, noteOffset, noteLimit }),
      );
    });

    // A worker that exits without answering is not a parse failure and must not
    // be reported as a corrupt package. `code` is carried into the log so a
    // crash stays distinguishable from an orderly exit that simply said nothing.
    child.on('exit', (code: number) => {
      finish(() => fallBackInProcess(`exit:${code}`));
    });

    // A child that has already died rejects the handoff synchronously; that is
    // the same "no worker" condition, not a caller error.
    try {
      child.postMessage(request);
      // Only armed once the request is genuinely in flight. A child that neither
      // acks nor exits is the one failure the `exit` handler cannot see, and it
      // used to leave this promise unsettled forever — the workbench busy with
      // no way out. `unref` so a stuck read cannot hold the process open.
      startupTimer = setTimeout(() => {
        startupTimer = undefined;
        finish(() => fallBackInProcess('no-ack'));
      }, opts.startupTimeoutMs ?? APKG_READ_STARTUP_TIMEOUT_MS);
      startupTimer.unref?.();
    } catch (err) {
      finish(() => fallBackInProcess(err instanceof Error ? err.message : String(err)));
    }
  });
}

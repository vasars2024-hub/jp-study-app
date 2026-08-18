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
 * A parse that runs somewhere other than this event loop.
 *
 * Resolves with the page, or rejects with the parse's own message. Rejection
 * reasons are kept distinct from parse failures where the caller can tell them
 * apart, because "this package is the compressed format" and "the reader process
 * died" need different instructions.
 */
export function parseApkgDraftPageOffMainLoop(
  request: ApkgReadWorkerIn,
): Promise<ApkgParsedPage> {
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
    return parseApkgDraftPage(request);
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
      parseApkgDraftPage(request).then(resolve, reject);
    };
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
      fn();
    };

    child.on('message', (value: unknown) => {
      const message = value as ApkgReadWorkerOut | undefined;
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
    } catch (err) {
      finish(() => fallBackInProcess(err instanceof Error ? err.message : String(err)));
    }
  });
}

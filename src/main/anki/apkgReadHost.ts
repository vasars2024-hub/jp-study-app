// Main's side of the .apkg draft-read utility process.
//
// One process per read, forked and reaped. A long-lived pool was considered and
// rejected: a read happens when a human picks a deck, so the ~40 ms fork cost is
// invisible against a multi-second parse, and a pooled process would hold a
// sql.js WASM heap sized for the last deck opened for the rest of the session.
//
// `parseApkgDraftPage` is imported here as well, on purpose. It is the fallback
// when the worker cannot be forked at all (a packaging or environment fault), and
// running it in-process is strictly better than refusing to open the deck — but
// it is the SAME function the worker runs, so the two paths cannot drift and the
// fallback cannot quietly become a second, differently-behaved reader.

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
    // be reported as a corrupt package. `code` is carried so a crash is
    // distinguishable in a log from an orderly exit that simply said nothing.
    child.on('exit', (code: number) => {
      finish(() => reject(new Error(`apkg-read-worker-exit:${code}`)));
    });

    child.postMessage(request);
  });
}

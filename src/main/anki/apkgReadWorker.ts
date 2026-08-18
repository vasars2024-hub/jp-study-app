// The .apkg draft-read utility process: where the deck parse actually runs.
//
// ## Why this file exists
//
// ANKI_DECK_WORKBENCH_PLAN.md gate 9 asks for the 100,000-note fixture to be
// filtered and previewed "without freezing … Electron's main event loop", and
// before this file the read ran on that loop. Measured on the fixture through the
// debug bridge, with a 20 ms IPC heartbeat as the instrument: main answered
// **3** heartbeats during a 6,217 ms read, longest unbroken stall **3,293 ms**,
// against an idle control on the same machine of 141 beats / 14 ms max / 1 ms p95.
//
// ## Why utilityProcess and not worker_threads
//
// Same answer as `dictionary/importWorker.ts`, for a different reason: sql.js is
// a WASM module whose heap for a 63 MB collection is large and short-lived, and a
// real child process hands it all back to the OS on exit instead of leaving it in
// main's heap. A runaway or corrupt-package parse can also be killed outright,
// which a `worker_threads` Worker sharing main's fate cannot be.
//
// ## The one Electron subtlety
//
// A utility process is a Node environment with only a sliver of Electron in it:
// `app` and `dialog` do not exist here. That is why this file imports
// `apkgCollection.ts` and never `apkgImport.ts` — the parse ladder was split out
// precisely so it could be loaded somewhere `ipcMain` is absent. The file path
// arrives in the message; nothing is resolved locally and no dialog is reachable.

import { parseApkgDraftPage } from './apkgCollection';
import type { ApkgReadWorkerIn, ApkgReadWorkerOut } from '../../shared/ankiDraft';

/**
 * `process.parentPort` is Electron's utility-process channel. Typed locally
 * because this module is also loadable under plain Node, where it is absent.
 */
interface ParentPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

function parentPort(): ParentPort | null {
  return (process as unknown as { parentPort?: ParentPort }).parentPort ?? null;
}

function send(port: ParentPort, message: ApkgReadWorkerOut): void {
  port.postMessage(message);
}

async function handle(port: ParentPort, request: ApkgReadWorkerIn): Promise<void> {
  try {
    const parsed = await parseApkgDraftPage(request);
    send(port, { ok: true, ...parsed });
  } catch (err) {
    // The message is the product's: `readCollection` throws the "export with
    // Support older Anki versions" instruction by hand, and losing it here would
    // turn a recoverable package into an unexplained failure.
    send(port, { ok: false, error: err instanceof Error ? err.message : String(err) });
  }
}

const port = parentPort();
if (port) {
  port.on('message', (event) => {
    const request = event.data as ApkgReadWorkerIn | undefined;
    if (!request || typeof request.filePath !== 'string') {
      send(port, { ok: false, error: 'apkg-read-bad-request' });
      return;
    }
    // Answer first, parse second. This ack is the only thing that distinguishes
    // a child that never came alive from a deck that is simply enormous, and it
    // has to leave before `parseApkgDraftPage` takes this loop for six seconds.
    send(port, { phase: 'accepted' });
    void handle(port, request);
  });
  port.start?.();
}

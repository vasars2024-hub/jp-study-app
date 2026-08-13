// The renderer-facing side of the dictionary import bridge.
//
// Three channels and one push event, deliberately: `start`, `cancel`, and a
// `status` read that answers after a reload. The push exists so a running import
// does not require the renderer to poll; the read exists because a push is lost
// if the window was not alive to hear it, and recovery must not depend on luck.
//
// Everything crossing the boundary is validated by `shared/dictionaryImportJob.ts`
// before it is acted on or rendered — a request from the renderer because it names
// a file path the main process is about to read, and a snapshot on the way out
// because a renderer must never infer a committed import from a malformed message.

import { BrowserWindow, app, ipcMain, utilityProcess } from 'electron';
import path from 'node:path';
import {
  normalizeDictionaryImportRequest,
  type DictionaryImportJobSnapshot,
} from '../../shared/dictionaryImportJob';
import {
  DictionaryImportJobs,
  dictionaryImportWorkerPath,
  type ImportWorkerHandle,
} from './importJobs';
import { legacyYomitanRoot } from './migrate';

export const DICTIONARY_IMPORT_CHANNELS = {
  start: 'dictImport:start',
  cancel: 'dictImport:cancel',
  status: 'dictImport:status',
  changed: 'dictImport:changed',
} as const;

let jobs: DictionaryImportJobs | null = null;

function broadcast(snapshot: DictionaryImportJobSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(DICTIONARY_IMPORT_CHANNELS.changed, snapshot);
  }
}

/**
 * Adapts Electron's `UtilityProcess` to the handle `importJobs` was written
 * against. `postMessage`/`message` are already MessagePort-shaped there, so the
 * only translation is `exit`'s argument.
 */
function spawnWorker(): ImportWorkerHandle {
  const child = utilityProcess.fork(dictionaryImportWorkerPath(), [], {
    // A dictionary import is pure computation over files this process named. It
    // has no business reaching the network or inheriting a debug port.
    serviceName: 'jp-dictionary-import',
    stdio: 'ignore',
  });
  return {
    postMessage: (message) => child.postMessage(message),
    kill: () => child.kill(),
    on: (event: 'message' | 'exit', listener: (payload: never) => void) => {
      child.on(event as 'message', listener as (value: unknown) => void);
    },
  } as ImportWorkerHandle;
}

export function dictionaryImportJobs(): DictionaryImportJobs {
  if (jobs) return jobs;
  jobs = new DictionaryImportJobs({
    spawn: spawnWorker,
    dbDir: () => path.join(app.getPath('userData'), 'dictionary'),
    legacyRoot: () => legacyYomitanRoot(app.getPath('userData')),
    onSnapshot: broadcast,
  });
  return jobs;
}

export function registerDictionaryImportIpc(): void {
  const manager = dictionaryImportJobs();

  ipcMain.handle(DICTIONARY_IMPORT_CHANNELS.start, (_event, raw: unknown) => {
    const request = normalizeDictionaryImportRequest(raw);
    // `unsupported` rather than a thrown error: the renderer asked for something
    // this build cannot import, and that is an answer, not a crash.
    if (!request) return { ok: false, error: 'unsupported' as const };
    return manager.start(request);
  });

  ipcMain.handle(DICTIONARY_IMPORT_CHANNELS.cancel, (_event, jobId?: unknown) =>
    manager.cancel(typeof jobId === 'string' ? jobId : undefined));

  ipcMain.handle(DICTIONARY_IMPORT_CHANNELS.status, () => manager.current());

  app.on('before-quit', () => manager.dispose());
}

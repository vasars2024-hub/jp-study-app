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
import { mt } from '../i18n';
import {
  normalizeDictionaryImportRequest,
  type DictionaryImportJobSnapshot,
} from '../../shared/dictionaryImportJob';
import {
  DictionaryImportJobs,
  dictionaryImportWorkerPath,
  startLegacyMigrationIfPending,
  type ImportWorkerHandle,
} from './importJobs';
import { legacyYomitanRoot } from './migrate';
import { pendingLegacyStores } from './service';

export const DICTIONARY_IMPORT_CHANNELS = {
  start: 'dictImport:start',
  cancel: 'dictImport:cancel',
  status: 'dictImport:status',
  pick: 'dictImport:pick',
  changed: 'dictImport:changed',
} as const;

/** What each file-backed kind's native picker offers. `legacy` reads a tree, so it has none. */
const PICKABLE = {
  cedict: { titleKey: 'dialog.importCedict.title', filterKey: 'dialog.filter.cedict', extensions: ['u8', 'txt'] },
  wiktextract: { titleKey: 'dialog.importWiktextract.title', filterKey: 'dialog.filter.jsonl', extensions: ['jsonl', 'json'] },
  dsl: { titleKey: 'dialog.importDsl.title', filterKey: 'dialog.filter.dsl', extensions: ['dsl', 'txt'] },
  jmnedict: { titleKey: 'dialog.importJmnedict.title', filterKey: 'dialog.filter.jmnedict', extensions: ['xml'] },
  kanjidic: { titleKey: 'dialog.importKanjidic.title', filterKey: 'dialog.filter.kanjidic', extensions: ['xml'] },
  stardict: { titleKey: 'dialog.importStardict.title', filterKey: 'dialog.filter.stardict', extensions: ['ifo'] },
  tatoeba: { titleKey: 'dialog.importTatoeba.title', filterKey: 'dialog.filter.tatoeba', extensions: ['tsv', 'csv'] },
} as const;

type PickableKind = keyof typeof PICKABLE;

function pickableKind(value: unknown): PickableKind | null {
  return value === 'cedict' || value === 'wiktextract' || value === 'dsl' || value === 'jmnedict' || value === 'kanjidic' || value === 'stardict' || value === 'tatoeba' ? value : null;
}

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

/**
 * Starts the first-boot JSON -> SQLite migration after Yomitan provisioning.
 *
 * The caller waits for `initYomitan()` first, so newly downloaded bundled stores
 * are included. The scan is synchronous but only reads directory entries and the
 * dictionaries table; all large JSON parsing remains in the utility process.
 */
export function startPendingLegacyDictionaryMigration(): void {
  const manager = dictionaryImportJobs();
  startLegacyMigrationIfPending(manager, pendingLegacyStores().length);
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

  // A separate channel rather than "start with no path opens a picker":
  // `normalizeDictionaryImportRequest` refuses a cedict/wiktextract request that
  // names no file, and relaxing that would mean a start request no longer says
  // which file it read. The renderer picks first, then starts with the path.
  ipcMain.handle(DICTIONARY_IMPORT_CHANNELS.pick, async (_event, rawKind: unknown) => {
    const kind = pickableKind(rawKind);
    if (!kind) return { canceled: true as const };
    const { dialog } = await import('electron');
    const { titleKey, filterKey, extensions } = PICKABLE[kind];
    const picked = await dialog.showOpenDialog({
      title: mt(titleKey),
      filters: [
        { name: mt(filterKey), extensions: [...extensions] },
        { name: mt('dialog.filter.allFiles'), extensions: ['*'] },
      ],
      properties: ['openFile'],
    });
    const filePath = picked.filePaths[0];
    if (picked.canceled || !filePath) return { canceled: true as const };
    if (kind === 'tatoeba') {
      const links = await dialog.showOpenDialog({
        title: mt('dialog.importTatoebaLinks.title'),
        filters: [{ name: mt('dialog.filter.tatoebaLinks'), extensions: ['tsv', 'csv'] }, { name: mt('dialog.filter.allFiles'), extensions: ['*'] }],
        properties: ['openFile'],
      });
      const linksFilePath = links.filePaths[0];
      if (links.canceled || !linksFilePath) return { canceled: true as const };
      return { canceled: false as const, filePath, linksFilePath };
    }
    return { canceled: false as const, filePath };
  });

  app.on('before-quit', () => manager.dispose());
}

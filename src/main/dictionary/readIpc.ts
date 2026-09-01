// Electron wiring for the dictionary read worker: the process, the fallback and
// the shutdown hook. The state machine is `readClient.ts`, kept free of Electron
// so it can be driven with a fake process; the contract is `readProtocol.ts`.

import { utilityProcess } from 'electron';
import { dictionaryDb, dictionaryDir } from './db';
import { dictionaryImportWorkerPath } from './importJobs';
import { DictionaryReadClient, type ReadWorkerHandle } from './readClient';
import {
  runDictionaryRead,
  type DictionaryReadKind,
  type DictionaryReadQueries,
  type DictionaryReadResults,
} from './readProtocol';

/**
 * The same bundle as the import worker — `forge.config.ts` builds exactly one
 * dictionary utility entry, and adding a second is a build-config change this
 * feature does not need. Which role a process plays is decided by what it is
 * sent: a read process is never sent `start`, an import process never `read`.
 */
function spawnReadWorker(): ReadWorkerHandle {
  const child = utilityProcess.fork(dictionaryImportWorkerPath(), [], {
    // Pure reads over one file this process named. No network, no debug port.
    serviceName: 'jp-dictionary-read',
    stdio: 'ignore',
  });
  return {
    postMessage: (message) => child.postMessage(message),
    kill: () => child.kill(),
    on: (event: 'message' | 'exit', listener: (payload: never) => void) => {
      child.on(event as 'message', listener as (value: unknown) => void);
    },
  } as ReadWorkerHandle;
}

let client: DictionaryReadClient | null = null;

function dictionaryReads(): DictionaryReadClient {
  if (!client) {
    client = new DictionaryReadClient({
      spawn: spawnReadWorker,
      dbDir: dictionaryDir,
      inProcess: <K extends DictionaryReadKind>(kind: K, query: DictionaryReadQueries[K]) =>
        runDictionaryRead(dictionaryDb(), kind, query) as Promise<DictionaryReadResults[K]>,
      onFallback: (reason) => {
        console.warn(`[dictionary] reads stay on the main process for this session: ${reason}`);
      },
    });
  }
  return client;
}

/**
 * One dictionary read: off the main process while the worker is available, on
 * it otherwise. The result is the same either way; only where the page faults
 * land differs, which is the whole point.
 */
export function readDictionary<K extends DictionaryReadKind>(
  kind: K,
  query: DictionaryReadQueries[K],
): Promise<DictionaryReadResults[K]> {
  return dictionaryReads().read(kind, query);
}

/** For app shutdown. Safe when no read ever happened. */
export function disposeDictionaryReads(): void {
  client?.dispose();
}

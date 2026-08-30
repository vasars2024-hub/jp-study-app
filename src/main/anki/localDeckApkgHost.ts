import { utilityProcess } from 'electron';
import path from 'node:path';
import type { LocalDeckApkgRequest, LocalDeckApkgWorkerResponse } from '../../shared/localDeckApkg';

export function localDeckApkgWorkerPath(): string {
  return path.join(__dirname, 'localDeckApkgWorker.js');
}

export function writeLocalDeckApkgOffMain(request: LocalDeckApkgRequest): Promise<Extract<LocalDeckApkgWorkerResponse, { kind: 'complete' }>> {
  return new Promise((resolve, reject) => {
    const child = utilityProcess.fork(localDeckApkgWorkerPath(), [], { serviceName: 'jp-local-deck-apkg' });
    let settled = false;
    const finish = (error?: Error, value?: Extract<LocalDeckApkgWorkerResponse, { kind: 'complete' }>) => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* already exited */ }
      if (error) reject(error); else resolve(value as Extract<LocalDeckApkgWorkerResponse, { kind: 'complete' }>);
    };
    child.on('message', (value: unknown) => {
      const message = value as LocalDeckApkgWorkerResponse | undefined;
      if (!message || message.id !== request.id || message.kind === 'accepted') return;
      if (message.kind === 'complete') finish(undefined, message);
      else finish(new Error(message.error));
    });
    child.on('exit', () => finish(new Error('The Anki package worker exited before completing the export.')));
    child.postMessage(request);
  });
}

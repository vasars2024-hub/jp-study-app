import type { LocalDeckApkgRequest, LocalDeckApkgWorkerResponse } from '../../shared/localDeckApkg';
import { writeLocalDeckApkg } from './localDeckApkgCore';

interface ParentPort {
  postMessage(message: LocalDeckApkgWorkerResponse): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

const port = (process as unknown as { parentPort?: ParentPort }).parentPort;
if (port) {
  port.on('message', (event) => {
    const request = event.data as LocalDeckApkgRequest | undefined;
    if (!request || request.kind !== 'write') return;
    port.postMessage({ kind: 'accepted', id: request.id });
    void writeLocalDeckApkg(request).then(
      (result) => port.postMessage({ kind: 'complete', id: request.id, outputPath: request.outputPath, ...result }),
      (error) => port.postMessage({ kind: 'error', id: request.id, error: error instanceof Error ? error.message : String(error) }),
    );
  });
  port.start?.();
}

/** Dedicated Supertonic utility process: ONNX never enters Electron's main event loop. */
import fs from 'node:fs/promises';
import type {
  SupertonicSynthesisRequest,
  SupertonicWorkerRequest,
  SupertonicWorkerResponse,
} from '../shared/flashcardTtsProtocol';
import { encodePcmWav, loadSupertonicRuntime, type SupertonicRuntime } from './supertonicRuntime';

interface ParentPort {
  postMessage(message: SupertonicWorkerResponse): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  start?(): void;
}

function parentPort(): ParentPort | null {
  return (process as unknown as { parentPort?: ParentPort }).parentPort ?? null;
}

let runtime: SupertonicRuntime | null = null;
let runtimeKey = '';

function modelKey(request: SupertonicSynthesisRequest): string {
  return JSON.stringify({
    durationPredictor: request.paths.durationPredictor,
    textEncoder: request.paths.textEncoder,
    vectorEstimator: request.paths.vectorEstimator,
    vocoder: request.paths.vocoder,
    config: request.paths.config,
    unicodeIndexer: request.paths.unicodeIndexer,
  });
}

async function handle(port: ParentPort, request: SupertonicWorkerRequest): Promise<void> {
  port.postMessage({ kind: 'accepted', id: request.id });
  const partialPath = `${request.outputPath}.${process.pid}.partial`;
  try {
    const key = modelKey(request);
    if (!runtime || runtimeKey !== key) {
      runtime = await loadSupertonicRuntime(request.paths);
      runtimeKey = key;
    }
    const audio = await runtime.synthesize(
      request.text,
      request.paths.voiceStyle,
      request.steps,
      request.speed,
    );
    await fs.writeFile(partialPath, encodePcmWav(audio, runtime.sampleRate));
    await fs.rename(partialPath, request.outputPath);
    port.postMessage({
      kind: 'complete',
      id: request.id,
      outputPath: request.outputPath,
      durationSec: audio.length / runtime.sampleRate,
      sampleRate: runtime.sampleRate,
    });
  } catch (error) {
    await fs.rm(partialPath, { force: true }).catch(() => undefined);
    port.postMessage({
      kind: 'error',
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const port = parentPort();
if (port) {
  port.on('message', (event) => {
    const request = event.data as SupertonicWorkerRequest | undefined;
    if (!request || request.kind !== 'synthesize' || typeof request.id !== 'string') return;
    void handle(port, request);
  });
  port.start?.();
  port.postMessage({ kind: 'ready' });
}

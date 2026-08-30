import { utilityProcess } from 'electron';
import path from 'node:path';
import type {
  SupertonicSynthesisRequest,
  SupertonicWorkerResponse,
} from '../shared/flashcardTtsProtocol';

type Child = ReturnType<typeof utilityProcess.fork>;

interface Pending {
  request: SupertonicSynthesisRequest;
  resolve(value: Extract<SupertonicWorkerResponse, { kind: 'complete' }>): void;
  reject(error: Error): void;
}

let child: Child | null = null;
let active: Pending | null = null;
const queue: Pending[] = [];
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let stopped = false;

const IDLE_EXIT_MS = 120_000;

export function flashcardTtsWorkerPath(): string {
  return path.join(__dirname, 'flashcardTtsWorker.js');
}

function error(message: string, name?: string): Error {
  const result = new Error(message);
  if (name) result.name = name;
  return result;
}

function clearIdleTimer(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
}

function armIdleExit(): void {
  clearIdleTimer();
  if (!child || active || queue.length) return;
  idleTimer = setTimeout(() => {
    const idle = child;
    child = null;
    try { idle?.kill(); } catch { /* Already exited. */ }
  }, IDLE_EXIT_MS);
  idleTimer.unref?.();
}

function onMessage(owner: Child, value: unknown): void {
  if (child !== owner) return;
  const message = value as SupertonicWorkerResponse | undefined;
  if (!message || message.kind === 'ready' || message.kind === 'accepted') return;
  if (!active || message.id !== active.request.id) return;
  const settled = active;
  active = null;
  if (message.kind === 'complete') settled.resolve(message);
  else settled.reject(error(message.error));
  pump();
}

function onExit(owner: Child): void {
  if (child !== owner) return;
  child = null;
  if (active) {
    const interrupted = active;
    active = null;
    interrupted.reject(error('The Japanese neural voice process exited before producing audio.'));
  }
  pump();
}

function ensureChild(): Child {
  if (stopped) throw error('The Japanese neural voice process is shutting down.');
  if (child) return child;
  const forked = utilityProcess.fork(flashcardTtsWorkerPath(), [], {
    serviceName: 'jp-supertonic-tts',
  });
  child = forked;
  forked.on('message', (value: unknown) => onMessage(forked, value));
  forked.on('exit', () => onExit(forked));
  return forked;
}

function pump(): void {
  clearIdleTimer();
  if (active || !queue.length) {
    armIdleExit();
    return;
  }
  const next = queue.shift();
  if (!next) return;
  let owner: Child;
  try {
    owner = ensureChild();
    active = next;
    owner.postMessage(next.request);
  } catch (cause) {
    active = null;
    next.reject(cause instanceof Error ? cause : error(String(cause)));
    queueMicrotask(pump);
  }
}

/** Queue one request. The singleton worker retains its ONNX sessions between deck cards. */
export function synthesizeWithSupertonic(
  request: SupertonicSynthesisRequest,
): Promise<Extract<SupertonicWorkerResponse, { kind: 'complete' }>> {
  // `shutdownSupertonicHost` is also the asset-manager unload hook. Removing
  // and reinstalling the bundle must therefore be reversible without an app
  // restart: the next real request reopens the host with the new files.
  stopped = false;
  if (active?.request.id === request.id || queue.some((entry) => entry.request.id === request.id)) {
    return Promise.reject(error(`Duplicate Japanese neural voice request: ${request.id}`));
  }
  return new Promise((resolve, reject) => {
    queue.push({ request, resolve, reject });
    pump();
  });
}

/** Cancel one active/queued request without losing the remaining deck queue. */
export function cancelSupertonicSynthesis(requestId: string): boolean {
  const queuedIndex = queue.findIndex((entry) => entry.request.id === requestId);
  if (queuedIndex >= 0) {
    const [cancelled] = queue.splice(queuedIndex, 1);
    cancelled.reject(error('Offline audio generation was cancelled.', 'AbortError'));
    return true;
  }
  if (active?.request.id !== requestId) return false;
  const cancelled = active;
  const interrupted = child;
  active = null;
  child = null;
  cancelled.reject(error('Offline audio generation was cancelled.', 'AbortError'));
  try { interrupted?.kill(); } catch { /* Exit is already the desired state. */ }
  queueMicrotask(pump);
  return true;
}

/** Model removal and app quit reclaim native ONNX memory through process exit. */
export function shutdownSupertonicHost(): void {
  stopped = true;
  clearIdleTimer();
  const reason = error('The Japanese neural voice process was stopped.');
  active?.reject(reason);
  active = null;
  for (const waiting of queue.splice(0)) waiting.reject(reason);
  const running = child;
  child = null;
  try { running?.kill(); } catch { /* Already exited. */ }
}

/** Tests may reopen a deliberately stopped host without reaching into module state. */
export function resetSupertonicHostForTests(): void {
  stopped = false;
}

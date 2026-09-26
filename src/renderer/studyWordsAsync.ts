/**
 * Word profiles of a text sample, computed in a Web Worker
 * (`workers/studyWords.worker.ts`) so tokenizing never blocks the UI thread.
 *
 * The worker is created on first use and terminated once it has been idle for a
 * while: for Japanese it holds its own kuromoji dictionary, which is worth
 * keeping between the books of one Library pass and not for the rest of the
 * session. If the worker cannot be created or dies, profiles are computed on
 * the page instead, one per idle period (a 2k-character sample tokenizes in a
 * few milliseconds), so scores still arrive — just not in parallel.
 */
import type { StudyLang } from '../shared/studyLang';
import {
  buildStudyWordProfile,
  segmentedProfileTokens,
  type StudyWordProfile,
} from '../shared/studyWordProfile';
import type { StudyWordsReply } from './workers/studyWords.worker';

/** Release the worker (and its dictionary) after this long without work. */
const WORKER_IDLE_MS = 20_000;

let worker: Worker | null = null;
let workerBroken = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (p: StudyWordProfile) => void; reject: (e: Error) => void }>();

function stopWorker(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  worker?.terminate();
  worker = null;
}

function armIdleStop(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = pending.size ? null : setTimeout(stopWorker, WORKER_IDLE_MS);
}

function failAll(message: string): void {
  for (const entry of pending.values()) entry.reject(new Error(message));
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./workers/studyWords.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<StudyWordsReply>) => {
      const entry = pending.get(e.data.id);
      if (!entry) return;
      pending.delete(e.data.id);
      if (e.data.ok) entry.resolve(e.data.profile);
      else entry.reject(new Error(e.data.error));
      armIdleStop();
    };
    worker.onerror = () => {
      workerBroken = true;
      failAll('study-words worker failed');
      stopWorker();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

function nextIdle(): Promise<void> {
  return new Promise((resolve) => {
    const ric = (globalThis as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    }).requestIdleCallback;
    if (typeof ric === 'function') ric(() => resolve(), { timeout: 1000 });
    else setTimeout(resolve, 16);
  });
}

/** The page-side fallback: same result, one idle period at a time. */
async function profileOnPage(text: string, lang: StudyLang): Promise<StudyWordProfile> {
  await nextIdle();
  if (lang !== 'ja') return buildStudyWordProfile(segmentedProfileTokens(text, lang), lang);
  const { getTokenizer, tokenizeSync } = await import('./tokenizer');
  await getTokenizer();
  await nextIdle();
  return buildStudyWordProfile(tokenizeSync(text), lang);
}

/** The word profile of `text` read as `lang`. */
export async function studyWordProfile(text: string, lang: StudyLang): Promise<StudyWordProfile> {
  const w = getWorker();
  if (!w) return profileOnPage(text, lang);
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  const id = nextId++;
  try {
    return await new Promise<StudyWordProfile>((resolve, reject) => {
      pending.set(id, { resolve, reject });
      w.postMessage({ id, text, lang });
    });
  } catch {
    // The worker could not tokenize (no dictionary in its context, or it died):
    // answer on the page rather than dropping the score, and stop asking it.
    workerBroken = true;
    if (!pending.size) stopWorker();
    return profileOnPage(text, lang);
  }
}

/** Test seam. */
export function resetStudyWordsWorkerForTests(): void {
  stopWorker();
  workerBroken = false;
  failAll('reset');
}

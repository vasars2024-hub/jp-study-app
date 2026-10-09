/**
 * What the setup's download step offers per study language, and the small
 * pieces of state it needs that outlive the dialog.
 *
 * The dictionary and OCR rows are ordinary catalog assets — main's download
 * manager owns them, so they keep downloading after the dialog closes, and
 * Settings > Storage shows the same progress. Whisper is different: the
 * Transformers.js prefetch runs in a renderer worker, so its handle is held
 * here, at module scope, rather than in component state that a step change
 * or a closed dialog would throw away (and with it the user's download).
 */
import type { AssetStatus } from '../../../shared/assetRegistry';
import type { StudyLang } from '../../../shared/studyLang';
import type { WhisperModelTier } from '../../../shared/whisperModels';

/** The dictionary a language cannot look anything up without. */
export function dictionaryAssetFor(lang: StudyLang): string {
  if (lang === 'zh') return 'cc-cedict';
  if (lang === 'ru') return 'wiktionary-ru';
  return 'jmdict-yomitan';
}

/** The optional OCR bundle for reading text in images, manga and games. */
export function ocrAssetFor(lang: StudyLang): string {
  if (lang === 'zh') return 'paddle-ocr-zh';
  if (lang === 'ru') return 'paddle-ocr-ru';
  return 'manga-ocr';
}

export type BundleState = AssetStatus['state'];

export interface BundleProgress {
  state: BundleState;
  received: number;
  total: number;
  error: AssetStatus['error'];
}

/**
 * One row's state across an asset and every companion it requires — the same
 * aggregation Settings > Storage shows, so the two never disagree.
 */
export function bundleProgress(
  closure: ReadonlyArray<{ id: string; sizeBytes: number }>,
  statusOf: (id: string) => AssetStatus | undefined,
): BundleProgress {
  if (closure.length === 0) return { state: 'not-installed', received: 0, total: 0, error: undefined };
  const states = closure.map((spec) => statusOf(spec.id)?.state ?? 'not-installed');
  const failed = closure.map((spec) => statusOf(spec.id)).find((status) => status?.state === 'failed');
  const state: BundleState = states.every((s) => s === 'installed')
    ? 'installed'
    : failed
      ? 'failed'
      : states.includes('downloading')
        ? 'downloading'
        : states.includes('verifying')
          ? 'verifying'
          : states.includes('queued')
            ? 'queued'
            : states.includes('paused')
              ? 'paused'
              : 'not-installed';
  const total = closure.reduce((sum, spec) => sum + spec.sizeBytes, 0);
  const received = closure.reduce((sum, spec) => {
    const status = statusOf(spec.id);
    if (!status) return sum;
    return sum + (status.state === 'installed' ? status.totalBytes || spec.sizeBytes : status.receivedBytes);
  }, 0);
  return { state, received, total, error: failed?.error };
}

export function percentOf(received: number, total: number): number {
  if (!total) return 0;
  return Math.max(0, Math.min(100, Math.round((received / total) * 100)));
}

/* ------------------------------------------------------------------ *
 * Whisper prefetch jobs (renderer worker, held at module scope).
 * ------------------------------------------------------------------ */

export interface WhisperJob {
  tier: WhisperModelTier;
  percent: number;
  error: string | null;
  running: boolean;
  cancel: () => void;
}

const jobs = new Map<WhisperModelTier, WhisperJob>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const cb of listeners) cb();
}

export function whisperJob(tier: WhisperModelTier): WhisperJob | null {
  return jobs.get(tier) ?? null;
}

export function onWhisperJobsChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Start (or no-op if already running) a Whisper prefetch. `start` is injected
 * so the module never imports the worker-owning cache eagerly and tests can
 * drive it without a Worker.
 */
export function startWhisperJob(
  tier: WhisperModelTier,
  start: (onProgress: (percent: number) => void) => { done: Promise<void>; cancel(): void },
): void {
  const existing = jobs.get(tier);
  if (existing?.running) return;
  const job: WhisperJob = { tier, percent: 0, error: null, running: true, cancel: () => undefined };
  jobs.set(tier, job);
  const handle = start((percent) => {
    job.percent = percent;
    emit();
  });
  job.cancel = () => {
    handle.cancel();
    jobs.delete(tier);
    emit();
  };
  emit();
  handle.done
    .then(() => {
      jobs.delete(tier);
      emit();
    })
    .catch((err: unknown) => {
      job.running = false;
      job.error = err instanceof Error ? err.message : String(err);
      emit();
    });
}

/** Test seam. */
export function resetWhisperJobsForTests(): void {
  jobs.clear();
  listeners.clear();
}

/**
 * Web Worker: the FSRS optimiser off the renderer's main thread.
 *
 * A fit replays every review history several times with forward-mode
 * gradients over nineteen weights; on a large log that is seconds of CPU, which
 * on the UI thread froze the whole Study OS window with the button stuck on
 * "Optimizing...". Here it reports progress as it goes, and the caller cancels
 * by terminating the worker. The optimiser itself stays pure and deterministic
 * (`shared/fsrsOptimizer.ts`); this file only carries messages.
 */
import { optimizeFsrsWithHoldout, type FsrsHoldoutOptions, type FsrsLogEntryLike } from '../../shared/fsrsOptimizer';

export interface FsrsOptimizeRequest {
  id: number;
  entries: FsrsLogEntryLike[];
  options: Omit<FsrsHoldoutOptions, 'onProgress'>;
}

const post = (message: unknown): void => (self as unknown as Worker).postMessage(message);

self.onmessage = (e: MessageEvent<FsrsOptimizeRequest>) => {
  const { id, entries, options } = e.data;
  let lastPercent = -1;
  try {
    const result = optimizeFsrsWithHoldout(entries, {
      ...options,
      onProgress: (fraction) => {
        // Whole percents only: hundreds of descent steps need not be hundreds of messages.
        const percent = Math.floor(fraction * 100);
        if (percent === lastPercent) return;
        lastPercent = percent;
        post({ id, kind: 'progress' as const, fraction });
      },
    });
    post({ id, kind: 'done' as const, result });
  } catch (error) {
    post({ id, kind: 'error' as const, message: error instanceof Error ? error.message : String(error) });
  }
};

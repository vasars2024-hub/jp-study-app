/**
 * Why a batch translation came back empty.
 *
 * `runTranslationBatch` reports a failed item as an empty string rather than
 * throwing, which is right for a long run (one bad chunk must not sink the
 * rest) and wrong for the person reading: the manga reader could only say
 * "Translation failed." with nothing about whether the model is missing, would
 * not start, ran out of time, or answered with something that was not a
 * translation — and each of those has a different fix. So a failed item now
 * carries a reason, and a batch where nothing translated carries the dominant
 * one.
 *
 * Pure and shared: main classifies, the renderer words it.
 */

export type TranslateFailureReason = 'model-missing' | 'engine' | 'timeout' | 'rejected';

export interface TranslateBatchFailure {
  reason: TranslateFailureReason;
  /** The underlying message, for a "details" line — never the headline. */
  detail?: string;
}

export interface TranslateBatchItemResult {
  id: string;
  text: string;
  /** Set only when `text` is empty because the item failed. */
  reason?: TranslateFailureReason;
  detail?: string;
}

/** Classify an error thrown by the local translation engine. */
export function classifyTranslateError(err: unknown): TranslateBatchFailure {
  const detail = err instanceof Error ? err.message : String(err ?? '');
  // `LocalModelMissingError` (main/localModelFiles.ts) carries a code; its
  // message ("No offline AI model is installedâ€¦") matches no pattern below.
  const code = err && typeof err === 'object' ? (err as { code?: unknown }).code : undefined;
  if (code === 'local-model-missing' || /model not found|ENOENT|no such file|not installed/i.test(detail)) {
    return { reason: 'model-missing', detail };
  }
  if (/timed? ?out|timeout|aborted/i.test(detail)) return { reason: 'timeout', detail };
  return { reason: 'engine', detail };
}

/**
 * The reason a batch translated nothing, or `null` when anything translated
 * (or nothing was asked). The most frequent reason wins; ties go to the one
 * with the more actionable fix, in the order of `TranslateFailureReason`.
 */
export function summarizeTranslateFailure(
  results: readonly TranslateBatchItemResult[],
): TranslateBatchFailure | null {
  if (!results.length) return null;
  if (results.some((r) => r.text.trim() !== '')) return null;
  const order: TranslateFailureReason[] = ['model-missing', 'engine', 'timeout', 'rejected'];
  const counts = new Map<TranslateFailureReason, { n: number; detail?: string }>();
  for (const r of results) {
    const reason = r.reason ?? 'rejected';
    const entry = counts.get(reason) ?? { n: 0, detail: r.detail };
    entry.n += 1;
    counts.set(reason, entry);
  }
  let best: TranslateFailureReason = 'rejected';
  let bestN = -1;
  for (const reason of order) {
    const entry = counts.get(reason);
    if (entry && entry.n > bestN) {
      best = reason;
      bestN = entry.n;
    }
  }
  const detail = counts.get(best)?.detail;
  return { reason: best, ...(detail ? { detail } : null) };
}

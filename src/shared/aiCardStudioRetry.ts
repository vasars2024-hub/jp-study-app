/**
 * Card Studio partial results: the failed-item placeholder main returns in
 * place of a word or invent batch that failed, and the two renderer helpers
 * that retry exactly those items and fold the answers back in.
 *
 * Pure (no IPC, no React), so the rules are testable on their own.
 */
import type {
  AiDeckGenerationRequest,
  AiEnrichmentResult,
  AiGenerationItemFailure,
} from './miningTypes';

/** An item with no cards, standing in for one that failed. */
export function failedAiEnrichmentResult(input: {
  presetId: string;
  formatId: string;
  failure: AiGenerationItemFailure;
}): AiEnrichmentResult {
  const retry = input.failure.retry;
  return {
    presetId: input.presetId,
    formatId: input.formatId,
    expression: retry.kind === 'term' ? retry.term : '',
    reading: retry.kind === 'term' ? retry.reading ?? '' : '',
    meaning: '',
    nuance: '',
    sentence: retry.kind === 'term' ? retry.sentence ?? '' : '',
    sentenceTranslationEn: '',
    sentenceTranslationRu: '',
    sentenceTranslationZh: '',
    meaningRu: '',
    meaningZh: '',
    grammarBreakdown: '',
    culturalContext: '',
    properNameNotes: '',
    toponymNotes: '',
    tags: [],
    imageQuery: '',
    imageHtml: '',
    suggestedFront: '',
    suggestedBack: '',
    cards: [],
    csv: '',
    frequencies: {},
    rawJson: '',
    failure: input.failure,
  };
}

export function isFailedAiResult(result: AiEnrichmentResult): boolean {
  return Boolean(result.failure);
}

/** How many items a batch still owes: one per failed word, N per failed invent batch. */
export function failedAiItemCount(results: readonly AiEnrichmentResult[]): number {
  let count = 0;
  for (const result of results) {
    const retry = result.failure?.retry;
    if (!retry) continue;
    count += retry.kind === 'invent' ? Math.max(1, retry.count) : 1;
  }
  return count;
}

type RetryBase = Omit<AiDeckGenerationRequest, 'source' | 'terms' | 'wordCount' | 'avoidExpressions'>;

/** The settings of the run being retried — preset, format, provider, languages — without its items. */
function retryBaseOf(request: AiDeckGenerationRequest | RetryBase): RetryBase {
  const base: RetryBase = { presetId: request.presetId };
  if (request.formatId !== undefined) base.formatId = request.formatId;
  if (request.cardCount !== undefined) base.cardCount = request.cardCount;
  if (request.outputFormat !== undefined) base.outputFormat = request.outputFormat;
  if (request.providerId !== undefined) base.providerId = request.providerId;
  if (request.frontLang !== undefined) base.frontLang = request.frontLang;
  if (request.backLang !== undefined) base.backLang = request.backLang;
  if (request.reverse !== undefined) base.reverse = request.reverse;
  if (request.backGlossLangs !== undefined) base.backGlossLangs = request.backGlossLangs;
  return base;
}

/**
 * The `ai:generateDeck` requests that make the failed items again, and only
 * them: the failed words as one dictionary run, the missing invented items as
 * one preset run that avoids every expression the batch already holds.
 * `previous` is the request the batch came from; only its settings are reused.
 */
export function aiRetryRequests(
  results: readonly AiEnrichmentResult[],
  previous: AiDeckGenerationRequest | RetryBase,
): AiDeckGenerationRequest[] {
  const base = retryBaseOf(previous);
  const terms: NonNullable<AiDeckGenerationRequest['terms']> = [];
  let inventCount = 0;
  const avoid = new Set<string>();
  for (const result of results) {
    const retry = result.failure?.retry;
    if (!retry) {
      if (result.expression.trim()) avoid.add(result.expression.trim());
      continue;
    }
    if (retry.kind === 'term') {
      terms.push({
        term: retry.term,
        ...(retry.reading ? { reading: retry.reading } : {}),
        ...(retry.sentence ? { sentence: retry.sentence } : {}),
      });
    } else {
      inventCount += Math.max(1, retry.count);
      for (const expression of retry.avoid) if (expression.trim()) avoid.add(expression.trim());
    }
  }
  const requests: AiDeckGenerationRequest[] = [];
  if (terms.length) requests.push({ ...base, source: 'dictionary', terms });
  if (inventCount > 0) {
    requests.push({
      ...base,
      source: 'preset',
      wordCount: inventCount,
      ...(avoid.size ? { avoidExpressions: [...avoid] } : {}),
    });
  }
  return requests;
}

/**
 * Folds a retry's answer into the batch: the failures that request covered are
 * replaced by what came back (which may itself hold new failures); every
 * finished item stays exactly where it was.
 */
export function mergeAiRetryResults(
  previous: readonly AiEnrichmentResult[],
  retried: readonly AiEnrichmentResult[],
  request: Pick<AiDeckGenerationRequest, 'source' | 'terms'>,
): AiEnrichmentResult[] {
  const retriedTerms = new Set((request.terms ?? []).map((entry) => entry.term));
  const covered = (result: AiEnrichmentResult): boolean => {
    const retry = result.failure?.retry;
    if (!retry) return false;
    return request.source === 'dictionary'
      ? retry.kind === 'term' && retriedTerms.has(retry.term)
      : retry.kind === 'invent';
  };
  return [...previous.filter((result) => !covered(result)), ...retried];
}

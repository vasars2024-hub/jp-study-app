/**
 * Card Studio retries exactly the items a run could not make, and folds the
 * answers back without touching the finished ones.
 */
import { describe, expect, it } from 'vitest';
import {
  aiRetryRequests,
  failedAiEnrichmentResult,
  failedAiItemCount,
  mergeAiRetryResults,
} from '../aiCardStudioRetry';
import type { AiDeckGenerationRequest, AiEnrichmentResult } from '../miningTypes';

const ok = (expression: string): AiEnrichmentResult => ({
  ...failedAiEnrichmentResult({
    presetId: 'p',
    formatId: 'f',
    failure: { message: '', retry: { kind: 'term', term: expression } },
  }),
  failure: undefined,
  cards: [{ formatId: 'f', label: 'L', front: expression, back: 'b', tags: [] }],
});
const failedTerm = (term: string, reading?: string) =>
  failedAiEnrichmentResult({ presetId: 'p', formatId: 'f', failure: { message: 'x', code: 'timeout', retry: { kind: 'term', term, ...(reading ? { reading } : {}) } } });
const failedInvent = (count: number, avoid: string[]) =>
  failedAiEnrichmentResult({ presetId: 'p', formatId: 'f', failure: { message: 'x', retry: { kind: 'invent', count, avoid } } });

const LAST: AiDeckGenerationRequest = {
  source: 'preset',
  wordCount: 12,
  presetId: 'p',
  formatId: 'f',
  cardCount: 2,
  providerId: 'gemini-2.5-flash',
  frontLang: 'ja',
  backLang: 'en',
};

describe('failed items', () => {
  it('carry no cards and count what is owed', () => {
    const batch = [ok('猫'), failedTerm('犬'), failedInvent(3, ['猫'])];
    expect(batch[1].cards).toEqual([]);
    expect(batch[1].expression).toBe('犬');
    expect(failedAiItemCount(batch)).toBe(4);
    expect(failedAiItemCount([ok('猫')])).toBe(0);
  });
});

describe('aiRetryRequests', () => {
  it('asks for the failed words as one dictionary run and the missing items as one preset run', () => {
    const batch = [ok('猫'), failedTerm('犬', 'いぬ'), failedInvent(3, ['猫']), failedTerm('鳥')];
    const requests = aiRetryRequests(batch, LAST);
    expect(requests).toEqual([
      {
        source: 'dictionary',
        presetId: 'p',
        formatId: 'f',
        cardCount: 2,
        providerId: 'gemini-2.5-flash',
        frontLang: 'ja',
        backLang: 'en',
        terms: [{ term: '犬', reading: 'いぬ' }, { term: '鳥' }],
      },
      {
        source: 'preset',
        presetId: 'p',
        formatId: 'f',
        cardCount: 2,
        providerId: 'gemini-2.5-flash',
        frontLang: 'ja',
        backLang: 'en',
        wordCount: 3,
        avoidExpressions: ['猫'],
      },
    ]);
  });

  it('asks for nothing when nothing failed', () => {
    expect(aiRetryRequests([ok('猫')], LAST)).toEqual([]);
  });
});

describe('mergeAiRetryResults', () => {
  it('replaces the covered failures and leaves every finished item where it was', () => {
    const batch = [ok('猫'), failedTerm('犬'), ok('魚'), failedInvent(2, [])];
    const merged = mergeAiRetryResults(batch, [ok('犬')], { source: 'dictionary', terms: [{ term: '犬' }] });
    expect(merged.map((r) => [r.expression, Boolean(r.failure)])).toEqual([
      ['猫', false],
      ['魚', false],
      ['', true],
      ['犬', false],
    ]);
    const all = mergeAiRetryResults(merged, [ok('新'), failedInvent(1, [])], { source: 'preset' });
    expect(all.filter((r) => r.failure)).toHaveLength(1);
    expect(all.filter((r) => !r.failure).map((r) => r.expression)).toEqual(['猫', '魚', '犬', '新']);
  });
});

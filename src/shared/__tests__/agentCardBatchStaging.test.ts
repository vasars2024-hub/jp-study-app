import { describe, expect, it } from 'vitest';

import type { AiEnrichmentResult } from '../miningTypes';
import {
  AGENT_CARD_BATCH_BYTES_LIMIT,
  AGENT_CARD_BATCH_CARDS_PER_RESULT_LIMIT,
  AGENT_CARD_BATCH_RESULT_LIMIT,
  AGENT_CARD_BATCH_STAGING_CHANNELS,
  agentCardBatchBytes,
  agentCardBatchCardCount,
  normalizeAgentCardBatchStageRequest,
  normalizeAgentCardBatchStageResult,
  normalizeAgentCardBatchTakeResult,
  shouldClaimAgentCardBatch,
  type AgentCardBatchStageRequest,
} from '../agentCardBatchStaging';

const result = (expression: string, cards = 1): Partial<AiEnrichmentResult> => ({
  expression,
  reading: `${expression}-reading`,
  meaning: `${expression}-meaning`,
  cards: Array.from({ length: cards }, (_entry, index) => ({
    formatId: 'f',
    label: `card-${index}`,
    front: expression,
    back: `back-${index}`,
    tags: [],
  })),
});

const request = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  deckLabel: 'Preset studio',
  source: 'preset',
  results: [result('珈琲')],
  ...patch,
});

describe('normalizeAgentCardBatchStageRequest', () => {
  it('accepts a well-formed batch and keeps the fields the studio reads', () => {
    const normalized = normalizeAgentCardBatchStageRequest(request());
    expect(normalized?.deckLabel).toBe('Preset studio');
    expect(normalized?.source).toBe('preset');
    expect(normalized?.results).toHaveLength(1);
    expect(normalized?.results[0].expression).toBe('珈琲');
  });

  it('refuses a batch with no deck label, so no claim can name an unnamed deck', () => {
    expect(normalizeAgentCardBatchStageRequest(request({ deckLabel: '   ' }))).toBeNull();
    expect(normalizeAgentCardBatchStageRequest(request({ deckLabel: 42 }))).toBeNull();
  });

  it('refuses an empty batch rather than lighting the studio for nothing', () => {
    expect(normalizeAgentCardBatchStageRequest(request({ results: [] }))).toBeNull();
    expect(normalizeAgentCardBatchStageRequest(request({ results: 'nope' }))).toBeNull();
    // A result with no cards is not a preview row; dropping it empties the batch.
    expect(
      normalizeAgentCardBatchStageRequest(request({ results: [{ expression: '猫', cards: [] }] })),
    ).toBeNull();
  });

  it('refuses non-objects and arrays', () => {
    for (const value of [null, undefined, 'x', 7, [], [request()]]) {
      expect(normalizeAgentCardBatchStageRequest(value)).toBeNull();
    }
  });

  /**
   * The field this slice added, and the reason it exists: `deckBookId` is the
   * collision-free id `miningDeckIdentity` derived from the library item id.
   * Re-deriving it from a Japanese title is what `deckBookId`'s ASCII-only slug
   * cannot do.
   */
  it('carries a deck book id when the stager supplies one, and omits it otherwise', () => {
    expect(normalizeAgentCardBatchStageRequest(request())?.deckBookId).toBeUndefined();
    expect(
      normalizeAgentCardBatchStageRequest(request({ deckBookId: 'ai-item-1-ch3-7' }))?.deckBookId,
    ).toBe('ai-item-1-ch3-7');
    // Not a string, so absent rather than coerced into a group key.
    expect(normalizeAgentCardBatchStageRequest(request({ deckBookId: 5 }))?.deckBookId)
      .toBeUndefined();
  });

  it('caps the result count and the cards per result', () => {
    const many = Array.from({ length: AGENT_CARD_BATCH_RESULT_LIMIT + 8 }, (_e, index) =>
      result(`word-${index}`));
    expect(normalizeAgentCardBatchStageRequest(request({ results: many }))?.results)
      .toHaveLength(AGENT_CARD_BATCH_RESULT_LIMIT);

    const wide = normalizeAgentCardBatchStageRequest(
      request({ results: [result('猫', AGENT_CARD_BATCH_CARDS_PER_RESULT_LIMIT + 5)] }),
    );
    expect(wide?.results[0].cards).toHaveLength(AGENT_CARD_BATCH_CARDS_PER_RESULT_LIMIT);
  });

  it('drops a card with neither face rather than staging an empty preview row', () => {
    const normalized = normalizeAgentCardBatchStageRequest(
      request({
        results: [{
          expression: '猫',
          cards: [{ front: '  ', back: '' }, { front: '猫', back: 'cat' }],
        }],
      }),
    );
    expect(normalized?.results[0].cards).toHaveLength(1);
    expect(normalized?.results[0].cards[0].back).toBe('cat');
  });

  /**
   * `rawJson` is the model's unparsed reply. Nothing in the renderer reads it and
   * its size is the model's to decide, so it is the one field deliberately not
   * carried — but it is emitted as `''` so a claimed batch is still a complete
   * `AiEnrichmentResult` and no consumer has to special-case one.
   */
  it('drops rawJson but still emits the field', () => {
    const normalized = normalizeAgentCardBatchStageRequest(
      request({ results: [{ ...result('猫'), rawJson: 'x'.repeat(50_000) }] }),
    );
    expect(normalized?.results[0].rawJson).toBe('');
  });

  it('bounds an open-ended frequency map by key count and drops non-finite values', () => {
    const frequencies: Record<string, unknown> = { bad: Number.NaN, good: 12 };
    for (let index = 0; index < 40; index += 1) frequencies[`corpus-${index}`] = index;
    const normalized = normalizeAgentCardBatchStageRequest(
      request({ results: [{ ...result('猫'), frequencies }] }),
    );
    const out = normalized?.results[0].frequencies ?? {};
    expect(Object.keys(out).length).toBeLessThanOrEqual(24);
    expect(out.bad).toBeUndefined();
  });
});

/** A fixture the normalizer accepted, so a measurement test cannot silently
 * measure `null`. */
const accepted = (patch: Record<string, unknown> = {}): AgentCardBatchStageRequest => {
  const normalized = normalizeAgentCardBatchStageRequest(request(patch));
  if (!normalized) throw new Error('the fixture was refused by the normalizer');
  return normalized;
};

describe('agentCardBatchBytes', () => {
  it('measures what would be retained, so the ceiling is not an estimate', () => {
    const normalized = accepted();
    expect(agentCardBatchBytes(normalized)).toBe(JSON.stringify(normalized.results).length);
  });

  it('a normal batch is far inside the ceiling', () => {
    expect(agentCardBatchBytes(accepted())).toBeLessThan(AGENT_CARD_BATCH_BYTES_LIMIT);
  });
});

describe('agentCardBatchCardCount', () => {
  it('counts cards and not words — the number the studio shows', () => {
    const normalized = accepted({ results: [result('猫', 3), result('犬', 2)] });
    expect(agentCardBatchCardCount(normalized.results)).toBe(5);
  });
});

/**
 * The claim rule, held here rather than in the component's conditional. Adopting
 * over a preview the user is looking at would delete unsaved work with nothing
 * to restore it from.
 */
describe('shouldClaimAgentCardBatch', () => {
  it('claims only into an empty preview', () => {
    expect(shouldClaimAgentCardBatch(0)).toBe(true);
    expect(shouldClaimAgentCardBatch(1)).toBe(false);
    expect(shouldClaimAgentCardBatch(12)).toBe(false);
  });
});

describe('normalizeAgentCardBatchTakeResult', () => {
  it('treats an empty slot as success, because almost every mount finds one', () => {
    expect(normalizeAgentCardBatchTakeResult({ ok: true, batch: null }))
      .toEqual({ ok: true, batch: null });
  });

  it('re-normalizes the batch main handed back rather than trusting the IPC', () => {
    const taken = normalizeAgentCardBatchTakeResult({
      ok: true,
      batch: { id: 'b1', deckLabel: 'Studio', source: 'preset', results: [result('猫')] },
    });
    expect(taken.ok && taken.batch?.id).toBe('b1');
    // The same bounds main applied — a preview count and a saved count cannot disagree.
    expect(taken.ok && taken.batch?.results[0].rawJson).toBe('');
  });

  it('reports a batch with no id or label as absent rather than adopting it', () => {
    const taken = normalizeAgentCardBatchTakeResult({
      ok: true,
      batch: { deckLabel: 'Studio', results: [result('猫')] },
    });
    expect(taken.ok && taken.batch).toBeNull();
  });

  it('maps a malformed reply to bridge-unavailable', () => {
    for (const value of [null, 'x', 5, []]) {
      expect(normalizeAgentCardBatchTakeResult(value)).toEqual({
        ok: false,
        code: 'bridge-unavailable',
      });
    }
    expect(normalizeAgentCardBatchTakeResult({ ok: false, code: 'weird' }))
      .toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(normalizeAgentCardBatchTakeResult({ ok: false, code: 'too-large' }))
      .toEqual({ ok: false, code: 'too-large' });
  });
});

describe('normalizeAgentCardBatchStageResult', () => {
  it('accepts a complete success and keeps the replaced flag', () => {
    expect(
      normalizeAgentCardBatchStageResult({ ok: true, results: 2, cards: 5, replacedUnclaimed: true }),
    ).toEqual({ ok: true, results: 2, cards: 5, replacedUnclaimed: true });
  });

  it('refuses a success missing its counts, so a caller cannot report a number it was not told', () => {
    expect(normalizeAgentCardBatchStageResult({ ok: true, results: 2 }))
      .toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(normalizeAgentCardBatchStageResult({ ok: true, results: 1.5, cards: 2 }))
      .toEqual({ ok: false, code: 'bridge-unavailable' });
  });

  it('defaults replacedUnclaimed to false rather than to undefined', () => {
    const parsed = normalizeAgentCardBatchStageResult({ ok: true, results: 1, cards: 1 });
    expect(parsed).toEqual({ ok: true, results: 1, cards: 1, replacedUnclaimed: false });
  });
});

describe('channels', () => {
  it('are distinct from the image lane, which shares the same shape', () => {
    const names = Object.values(AGENT_CARD_BATCH_STAGING_CHANNELS);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name.startsWith('agentCardBatchStaging:')).toBe(true);
  });
});

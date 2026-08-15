import { describe, expect, it } from 'vitest';
import {
  AI_ADDITIONS_CHUNK_SIZE,
  AI_ADDITIONS_MAX_NOTES,
  buildAiAdditionsPrompt,
  describeAiAdditionsDisclosure,
  normalizeAiAdditionsRequest,
  parseAiAdditionsResponse,
  type AiAdditionsRequest,
} from '../ankiAiPrompt';

const base = {
  kind: 'example-sentence',
  notes: [
    { noteId: 'n1', term: '猫', gloss: 'cat' },
    { noteId: 'n2', term: '走る', gloss: 'to run' },
  ],
  variantCount: 2,
  sendGloss: true,
  explainLanguage: 'en',
};

function req(patch: Record<string, unknown> = {}): AiAdditionsRequest {
  const normalized = normalizeAiAdditionsRequest({ ...base, ...patch });
  if (!normalized) throw new Error('fixture did not normalize');
  return normalized;
}

describe('normalizeAiAdditionsRequest', () => {
  it('keeps the gloss when the user opted in', () => {
    expect(req().notes[0].gloss).toBe('cat');
  });

  // The privacy control is the normalizer, not the form — a UI that forgets to
  // clear the glosses still must not send them.
  it('strips every gloss when sendGloss is off, even though the caller supplied them', () => {
    const normalized = req({ sendGloss: false });
    expect(normalized.notes.map((n) => n.gloss)).toEqual([undefined, undefined]);
    expect(buildAiAdditionsPrompt(normalized, normalized.notes)).not.toContain('cat');
  });

  it('drops notes with no word rather than asking a blank question', () => {
    const normalized = req({
      notes: [{ noteId: 'n1', term: '  ' }, { noteId: 'n2', term: '猫' }],
    });
    expect(normalized.notes.map((n) => n.noteId)).toEqual(['n2']);
  });

  it('returns null when nothing is left to ask', () => {
    expect(normalizeAiAdditionsRequest({ ...base, notes: [] })).toBeNull();
    expect(normalizeAiAdditionsRequest({ ...base, kind: 'not-a-kind' })).toBeNull();
  });

  it('clamps the variant count and the selection size', () => {
    expect(req({ variantCount: 99 }).variantCount).toBe(4);
    expect(req({ variantCount: 0 }).variantCount).toBe(1);
    const many = req({
      notes: Array.from({ length: AI_ADDITIONS_MAX_NOTES + 10 }, (_, i) => ({
        noteId: `n${i}`,
        term: '語',
      })),
    });
    expect(many.notes).toHaveLength(AI_ADDITIONS_MAX_NOTES);
  });
});

describe('buildAiAdditionsPrompt', () => {
  it('numbers the words and never names a note id', () => {
    const normalized = req();
    const prompt = buildAiAdditionsPrompt(normalized, normalized.notes);
    expect(prompt).toContain('1. 猫 (cat)');
    expect(prompt).toContain('2. 走る (to run)');
    expect(prompt).not.toContain('n1');
  });

  it('asks for the requested number of alternatives', () => {
    const normalized = req({ variantCount: 3 });
    expect(buildAiAdditionsPrompt(normalized, normalized.notes)).toContain('exactly 3 distinct');
  });
});

describe('parseAiAdditionsResponse', () => {
  const notes = req().notes;

  it('maps indices back onto the chunk', () => {
    const raw = JSON.stringify({
      results: [
        { index: 2, variants: ['毎朝走る。'] },
        { index: 1, variants: ['猫が寝ている。', '猫を飼っている。'] },
      ],
    });
    expect(parseAiAdditionsResponse(raw, notes, 2)).toEqual([
      { noteId: 'n1', variants: ['猫が寝ている。', '猫を飼っている。'] },
      { noteId: 'n2', variants: ['毎朝走る。'] },
    ]);
  });

  it('drops an index the request never asked about', () => {
    const raw = JSON.stringify({ results: [{ index: 9, variants: ['x'] }] });
    expect(parseAiAdditionsResponse(raw, notes, 2)).toEqual([
      { noteId: 'n1', variants: [] },
      { noteId: 'n2', variants: [] },
    ]);
  });

  it('reports a skipped word as empty rather than borrowing another word answer', () => {
    const raw = JSON.stringify({ results: [{ index: 1, variants: ['猫が寝ている。'] }] });
    const parsed = parseAiAdditionsResponse(raw, notes, 2);
    expect(parsed[1]).toEqual({ noteId: 'n2', variants: [] });
  });

  it('de-duplicates identical variants and honours the cap', () => {
    const raw = JSON.stringify({
      results: [{ index: 1, variants: ['同じ', '同じ', ' 別 ', '三つ目'] }],
    });
    expect(parseAiAdditionsResponse(raw, notes, 2)[0].variants).toEqual(['同じ', '別']);
  });
});

describe('describeAiAdditionsDisclosure', () => {
  it('names the provider, the fields sent, and the number of calls', () => {
    const normalized = req({
      notes: Array.from({ length: AI_ADDITIONS_CHUNK_SIZE + 1 }, (_, i) => ({
        noteId: `n${i}`,
        term: '語',
        gloss: 'word',
      })),
    });
    const disclosure = describeAiAdditionsDisclosure(normalized, 'gemini-2.5-flash');
    expect(disclosure.provider).toBe('gemini');
    expect(disclosure.model).toBe('gemini-2.5-flash');
    expect(disclosure.providerLabel).toContain('Gemini');
    expect(disclosure.sent).toEqual(['term', 'gloss']);
    expect(disclosure.requests).toBe(2);
    expect(disclosure.noteCount).toBe(AI_ADDITIONS_CHUNK_SIZE + 1);
    expect(disclosure.estimatedInputTokens).toBeGreaterThan(0);
  });

  it('says only the word is sent when the gloss is off', () => {
    expect(describeAiAdditionsDisclosure(req({ sendGloss: false }), 'deepseek-v4-pro').sent)
      .toEqual(['term']);
  });

  // Zero would read as free; the honest answer for an unpriced provider is nothing.
  it('reports no cost at all when the user has entered no price', () => {
    expect(describeAiAdditionsDisclosure(req(), 'gemini-2.5-flash').estimatedCostUsd)
      .toBeUndefined();
  });

  it('reports a cost once a price exists', () => {
    const disclosure = describeAiAdditionsDisclosure(req(), 'gemini-2.5-flash', {
      'gemini-2.5-flash': { inputPerMillionTokens: 0.3, outputPerMillionTokens: 2.5 },
    });
    expect(disclosure.estimatedCostUsd).toBeGreaterThan(0);
  });
});

import { describe, expect, it } from 'vitest';
import {
  LEXICON_HANDOFF_TEXT_MAX,
  lexiconHandoffFromCapture,
  lexiconHandoffRejection,
  normalizeLexiconHandoffRequest,
  normalizeLexiconHandoffStageResult,
  normalizeLexiconHandoffTakeResult,
} from '../lexiconHandoff';
import { normalizeReadingLensCapture } from '../readingLens';
import type { ReadingLensCapture } from '../readingLens';

function capture(text: string, source = 'screen'): ReadingLensCapture {
  const value = normalizeReadingLensCapture({ text, source }, 1_000);
  if (!value) throw new Error(`unbuildable capture: ${text}`);
  return value;
}

describe('lexicon handoff request', () => {
  it('accepts a word and reports the scale it resolved', () => {
    const staged = normalizeLexiconHandoffRequest({ text: ' 食べる ', source: 'screen' }, 5_000);
    expect(staged).toMatchObject({
      route: 'lexicon',
      text: '食べる',
      kind: 'word',
      lens: 'lookup',
      source: 'screen',
      stagedAt: 5_000,
    });
  });

  it('refuses a sentence until Workbench analysis has a real receiver', () => {
    const request = { text: '今日は寒いですね。' };
    expect(normalizeLexiconHandoffRequest(request)).toBeNull();
    expect(lexiconHandoffRejection(request)).toBe('not-lexicon-scale');
  });

  it('refuses a paragraph, which belongs to the Reading workspace target', () => {
    const paragraph = 'これは一つ目の文です。これは二つ目の文です。これは三つ目の文です。';
    expect(normalizeLexiconHandoffRequest({ text: paragraph })).toBeNull();
    expect(lexiconHandoffRejection({ text: paragraph })).toBe('not-lexicon-scale');
  });

  it('refuses oversized text before it is ever classified', () => {
    const huge = 'あ'.repeat(LEXICON_HANDOFF_TEXT_MAX + 1);
    expect(normalizeLexiconHandoffRequest({ text: huge })).toBeNull();
    expect(lexiconHandoffRejection({ text: huge })).toBe('not-lexicon-scale');
  });

  it('refuses empty and malformed input as invalid rather than out of scale', () => {
    expect(normalizeLexiconHandoffRequest({ text: '   ' })).toBeNull();
    expect(lexiconHandoffRejection({ text: '   ' })).toBe('invalid-request');
    expect(normalizeLexiconHandoffRequest(null)).toBeNull();
    expect(lexiconHandoffRejection(null)).toBe('invalid-request');
    expect(lexiconHandoffRejection({ text: 42 })).toBe('invalid-request');
  });

  it('bounds a source label and falls back for an unknown source', () => {
    const staged = normalizeLexiconHandoffRequest({
      text: '猫',
      source: 'not-a-source',
      sourceLabel: 'x'.repeat(400),
    });
    expect(staged?.source).toBe('text');
    expect(staged?.sourceLabel).toHaveLength(120);
  });
});

describe('lexiconHandoffFromCapture', () => {
  it('produces a request for a word-scale capture, carrying its source', () => {
    expect(lexiconHandoffFromCapture(capture('食べる'))).toEqual({
      text: '食べる',
      source: 'screen',
      sourceLabel: 'screen',
    });
  });

  it('returns null for a paragraph capture, so the surface hides the gesture', () => {
    const paragraph = capture('これは一つ目の文です。これは二つ目の文です。これは三つ目の文です。');
    // The workflow itself is what refuses, which is the point: this is the
    // consumer that makes `resolveReadingLensWorkflow`'s lexicon target real.
    expect(lexiconHandoffFromCapture(paragraph)).toBeNull();
  });

  it('returns null for a sentence capture, which belongs to the future Workbench receiver', () => {
    expect(lexiconHandoffFromCapture(capture('今日は寒いですね。'))).toBeNull();
  });

  it('agrees with the boundary: anything it produces is accepted by main', () => {
    for (const text of ['猫', '食べる', 'hello world']) {
      const request = lexiconHandoffFromCapture(capture(text, 'clipboard'));
      expect(request, text).not.toBeNull();
      expect(normalizeLexiconHandoffRequest(request), text).not.toBeNull();
    }
  });
});

describe('result normalizers', () => {
  it('treats an empty claim as success with no handoff', () => {
    expect(normalizeLexiconHandoffTakeResult({ ok: true, handoff: null }))
      .toEqual({ ok: true, handoff: null });
  });

  it('round-trips a staged handoff through the claim', () => {
    const staged = normalizeLexiconHandoffRequest({ text: '猫', source: 'image' }, 7);
    expect(normalizeLexiconHandoffTakeResult({ ok: true, handoff: staged }))
      .toEqual({ ok: true, handoff: staged });
  });

  it('drops a claimed payload that is not a lexicon route or scale', () => {
    const base = { route: 'lexicon', text: '猫', kind: 'word', lens: 'lookup', stagedAt: 1 };
    expect(normalizeLexiconHandoffTakeResult({ ok: true, handoff: { ...base, route: 'reading' } }))
      .toEqual({ ok: true, handoff: null });
    expect(normalizeLexiconHandoffTakeResult({ ok: true, handoff: { ...base, kind: 'document' } }))
      .toEqual({ ok: true, handoff: null });
    expect(normalizeLexiconHandoffTakeResult({ ok: true, handoff: { ...base, lens: 'guess' } }))
      .toEqual({ ok: true, handoff: null });
  });

  it('maps an absent or unrecognised reply to bridge-unavailable', () => {
    expect(normalizeLexiconHandoffTakeResult(undefined)).toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(normalizeLexiconHandoffStageResult(undefined)).toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(normalizeLexiconHandoffStageResult({ ok: false, code: 'nonsense' }))
      .toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(normalizeLexiconHandoffStageResult({ ok: false, code: 'not-lexicon-scale' }))
      .toEqual({ ok: false, code: 'not-lexicon-scale' });
  });

  it('refuses a stage result whose success fields are missing', () => {
    expect(normalizeLexiconHandoffStageResult({ ok: true }))
      .toEqual({ ok: false, code: 'bridge-unavailable' });
    expect(normalizeLexiconHandoffStageResult({ ok: true, kind: 'word', lens: 'lookup' }))
      .toEqual({ ok: true, kind: 'word', lens: 'lookup' });
  });
});

import { describe, expect, it } from 'vitest';
import { lexiconHandoffFromCapture } from '../lexiconHandoff';
import { normalizeReadingLensCapture, type ReadingLensCapture } from '../readingLens';
import {
  READING_PASSAGE_HANDOFF_TEXT_MAX,
  normalizeReadingPassageHandoffRequest,
  normalizeReadingPassageHandoffStageResult,
  normalizeReadingPassageHandoffTakeResult,
  readingPassageHandoffFromCapture,
  readingPassageHandoffRejection,
} from '../readingPassageHandoff';

/** A sentence, a word and a paragraph, so scale is decided by the text alone. */
const WORD = '図書館';
const SENTENCE = '彼は図書館で本を読んでいた。';
const PARAGRAPH = [
  '彼は図書館で本を読んでいた。',
  '窓の外では雨が降り続いていて、誰も帰ろうとしなかった。',
  '司書は静かに棚のあいだを歩き、時々こちらを見た。',
  'その日の午後は、ただそれだけのことで過ぎていった。',
].join('');

function capture(text: string, lines: string[] = []): ReadingLensCapture {
  return normalizeReadingLensCapture({
    source: 'screen',
    sourceLabel: 'Notepad',
    capturedAt: 1_700_000_000_000,
    language: 'ja',
    engine: 'auto',
    text,
    lines: lines.map((line, index) => ({
      text: line,
      box: [0, index * 20, 200, 18],
      vertical: false,
      confidence: 0.9,
    })),
  });
}

describe('readingPassageHandoffFromCapture', () => {
  it('accepts a paragraph capture and carries its OCR lines', () => {
    const request = readingPassageHandoffFromCapture(
      capture(PARAGRAPH, ['彼は図書館で', '本を読んでいた。']),
    );
    expect(request).not.toBeNull();
    expect(request?.source).toBe('screen');
    expect(request?.sourceLabel).toBe('Notepad');
    expect(request?.lines).toEqual(['彼は図書館で', '本を読んでいた。']);
  });

  it('is the exact complement of the Lexicon lane', () => {
    for (const text of [WORD, SENTENCE]) {
      expect(readingPassageHandoffFromCapture(capture(text))).toBeNull();
      expect(lexiconHandoffFromCapture(capture(text))).not.toBeNull();
    }
    expect(readingPassageHandoffFromCapture(capture(PARAGRAPH))).not.toBeNull();
    expect(lexiconHandoffFromCapture(capture(PARAGRAPH))).toBeNull();
  });

  it('refuses an empty capture, which has nothing to read', () => {
    // `normalizeReadingLensCapture` already returns null for blank text, so an
    // empty capture only reaches this function hand-built — which is exactly the
    // caller a producer bug would look like.
    const blank = { ...capture(WORD), text: '   ', lines: [] } as ReadingLensCapture;
    expect(readingPassageHandoffFromCapture(blank)).toBeNull();
  });
});

describe('normalizeReadingPassageHandoffRequest', () => {
  it('normalizes a paragraph request and stamps the workspace route', () => {
    const handoff = normalizeReadingPassageHandoffRequest(
      { text: PARAGRAPH, source: 'screen', sourceLabel: 'Notepad', captureId: 'c1', lines: ['a'] },
      42,
    );
    expect(handoff?.kind).toBe('paragraph');
    expect(handoff?.route.section).toBe('captures');
    expect(handoff?.captureId).toBe('c1');
    expect(handoff?.stagedAt).toBe(42);
    expect(handoff?.language).toBe('ja');
  });

  it('refuses lookup-scale text with a distinct code', () => {
    expect(normalizeReadingPassageHandoffRequest({ text: SENTENCE })).toBeNull();
    expect(readingPassageHandoffRejection({ text: SENTENCE })).toBe('not-passage-scale');
    expect(readingPassageHandoffRejection({ text: '   ' })).toBe('invalid-request');
    expect(readingPassageHandoffRejection(null)).toBe('invalid-request');
  });

  it('rejects text past the ceiling before classifying it', () => {
    const huge = 'あ'.repeat(READING_PASSAGE_HANDOFF_TEXT_MAX + 1);
    expect(normalizeReadingPassageHandoffRequest({ text: huge })).toBeNull();
    expect(readingPassageHandoffRejection({ text: huge })).toBe('not-passage-scale');
  });

  it('drops an unknown source to text rather than trusting it', () => {
    const handoff = normalizeReadingPassageHandoffRequest({ text: PARAGRAPH, source: 'ftp' });
    expect(handoff?.source).toBe('text');
  });
});

describe('IPC reply normalizers', () => {
  it('keeps an empty claim ok', () => {
    expect(normalizeReadingPassageHandoffTakeResult({ ok: true, handoff: null }))
      .toEqual({ ok: true, handoff: null });
  });

  it('turns a malformed handoff into a failure rather than a half-record', () => {
    expect(normalizeReadingPassageHandoffTakeResult({ ok: true, handoff: { text: '' } }))
      .toEqual({ ok: false, code: 'invalid-request' });
    expect(normalizeReadingPassageHandoffTakeResult(undefined))
      .toEqual({ ok: false, code: 'invalid-request' });
  });

  it('preserves the scale refusal across the bridge', () => {
    expect(normalizeReadingPassageHandoffStageResult({ ok: false, code: 'not-passage-scale' }))
      .toEqual({ ok: false, code: 'not-passage-scale' });
    expect(normalizeReadingPassageHandoffStageResult({ ok: true, kind: 'paragraph', captureId: 'c' }))
      .toEqual({ ok: true, kind: 'paragraph', captureId: 'c' });
    expect(normalizeReadingPassageHandoffStageResult({ ok: true, kind: 'word' }))
      .toEqual({ ok: false, code: 'invalid-request' });
  });
});

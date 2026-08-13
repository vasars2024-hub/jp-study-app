import { describe, expect, it } from 'vitest';
import {
  alignLexiconMorphemes,
  attachLexiconPartOfSpeech,
  lexiconWordClass,
  type LexiconMorpheme,
} from '../lexiconPartOfSpeech';
import type { LexiconInterlinearPart, LexiconInterlinearResult } from '../lexiconInterlinear';

function passage(parts: LexiconInterlinearPart[]): LexiconInterlinearResult {
  return {
    text: parts.map((part) => part.text).join(''),
    detectedLangs: ['ja'],
    glossLangs: ['en'],
    parts,
    tokenCount: parts.filter((part) => part.kind === 'token').length,
    matchedCount: 0,
    truncated: false,
  };
}

function token(text: string, start: number): LexiconInterlinearPart {
  return { kind: 'token', text, start, end: start + text.length };
}

function separator(text: string, start: number): LexiconInterlinearPart {
  return { kind: 'separator', text, start, end: start + text.length };
}

/**
 * The IPADIC analysis of 昨日は学校で面白い本を読んだ。 — the passage the live
 * difficulty panel was measured on, morpheme for morpheme.
 */
const SENTENCE: LexiconMorpheme[] = [
  { surface: '昨日', pos: '名詞', detail: '副詞可能' },
  { surface: 'は', pos: '助詞', detail: '係助詞' },
  { surface: '学校', pos: '名詞', detail: '一般' },
  { surface: 'で', pos: '助詞', detail: '格助詞' },
  { surface: '面白い', pos: '形容詞', detail: '自立' },
  { surface: '本', pos: '名詞', detail: '一般' },
  { surface: 'を', pos: '助詞', detail: '格助詞' },
  { surface: '読ん', pos: '動詞', detail: '自立' },
  { surface: 'だ', pos: '助動詞', detail: '*' },
  { surface: '。', pos: '記号', detail: '句点' },
];

describe('lexiconWordClass', () => {
  it('calls particles and auxiliaries grammar, not vocabulary', () => {
    expect(lexiconWordClass('助詞', '格助詞')).toBe('function');
    expect(lexiconWordClass('助動詞', '*')).toBe('function');
    expect(lexiconWordClass('接続詞')).toBe('function');
    expect(lexiconWordClass('接頭詞', '名詞接続')).toBe('function');
  });

  it('keeps the words a learner studies', () => {
    expect(lexiconWordClass('名詞', '一般')).toBe('content');
    expect(lexiconWordClass('動詞', '自立')).toBe('content');
    expect(lexiconWordClass('形容詞', '自立')).toBe('content');
    expect(lexiconWordClass('副詞', '一般')).toBe('content');
    expect(lexiconWordClass('感動詞')).toBe('content');
  });

  it('separates a proper noun from both vocabulary and grammar', () => {
    expect(lexiconWordClass('名詞', '固有名詞')).toBe('name');
  });

  it('treats the auxiliary use of a real verb as grammar', () => {
    // The いる of している carries aspect, not meaning.
    expect(lexiconWordClass('動詞', '非自立')).toBe('function');
    expect(lexiconWordClass('形容詞', '非自立')).toBe('function');
  });

  it('follows the skip list the rest of the app already uses for nouns', () => {
    for (const detail of ['数', '非自立', '接尾', '代名詞', '特殊']) {
      expect(lexiconWordClass('名詞', detail)).toBe('function');
    }
  });

  it('has no opinion about a tag it does not know, rather than guessing grammar', () => {
    // Load-bearing: `scoreLexiconDifficulty` drops only `function`, so an
    // unknown tag must never be able to delete a real word from a profile.
    expect(lexiconWordClass('フィラー')).toBe('other');
    expect(lexiconWordClass('記号', '句点')).toBe('other');
    expect(lexiconWordClass('')).toBe('other');
    expect(lexiconWordClass('未知の品詞')).toBe('other');
  });
});

describe('alignLexiconMorphemes', () => {
  it('locates every morpheme of a real sentence at its own offsets', () => {
    const text = '昨日は学校で面白い本を読んだ。';
    const spans = alignLexiconMorphemes(text, SENTENCE);
    expect(spans).toHaveLength(SENTENCE.length);
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(
        SENTENCE[spans.indexOf(span)].surface,
      );
    }
    expect(spans.map((span) => span.wordClass)).toEqual([
      'content', 'function', 'content', 'function', 'content',
      'content', 'function', 'content', 'function', 'other',
    ]);
  });

  it('survives an analyser that drops the whitespace between morphemes', () => {
    const spans = alignLexiconMorphemes('猫 が 鳴く', [
      { surface: '猫', pos: '名詞', detail: '一般' },
      { surface: 'が', pos: '助詞', detail: '格助詞' },
      { surface: '鳴く', pos: '動詞', detail: '自立' },
    ]);
    expect(spans.map((span) => [span.start, span.end])).toEqual([[0, 1], [2, 3], [4, 6]]);
  });

  it('keeps offsets on a passage containing a surrogate pair', () => {
    // A character-counted position would put every later morpheme one unit
    // early here; scanning for the surface cannot drift.
    const text = '𠮟る声';
    const spans = alignLexiconMorphemes(text, [
      { surface: '𠮟る', pos: '動詞', detail: '自立' },
      { surface: '声', pos: '名詞', detail: '一般' },
    ]);
    expect(spans.map((span) => text.slice(span.start, span.end))).toEqual(['𠮟る', '声']);
  });

  it('skips a morpheme it cannot find instead of guessing a position', () => {
    const spans = alignLexiconMorphemes('猫が', [
      { surface: '猫', pos: '名詞', detail: '一般' },
      { surface: '犬', pos: '名詞', detail: '一般' },
      { surface: 'が', pos: '助詞', detail: '格助詞' },
    ]);
    expect(spans.map((span) => span.tag)).toEqual(['名詞', '助詞']);
  });

  it('drops the placeholder detail rather than storing a literal asterisk', () => {
    const [span] = alignLexiconMorphemes('だ', [{ surface: 'だ', pos: '助動詞', detail: '*' }]);
    expect(span.detail).toBeUndefined();
    expect(span.wordClass).toBe('function');
  });
});

describe('attachLexiconPartOfSpeech', () => {
  const text = '昨日は学校で面白い本を読んだ。';

  it('labels each token of the passage with what it was doing there', () => {
    const result = attachLexiconPartOfSpeech(
      passage([
        token('昨日', 0), token('は', 2), token('学校', 3), token('で', 5),
        token('面白い', 6), token('本', 9), token('を', 10), token('読んだ', 11),
        separator('。', 14),
      ]),
      alignLexiconMorphemes(text, SENTENCE),
    );
    const classes = result.parts
      .filter((part) => part.kind === 'token')
      .map((part) => (part.kind === 'token' ? part.pos?.wordClass : undefined));
    expect(classes).toEqual([
      'content', 'function', 'content', 'function',
      'content', 'content', 'function', 'content',
    ]);
  });

  it('classifies a merged token by its stem, not by the ending trailing it', () => {
    // 読んだ is one interlinear token over 読ん (動詞) + だ (助動詞): a token that
    // starts with a verb is a verb however many endings follow.
    const result = attachLexiconPartOfSpeech(
      passage([token('読んだ', 0)]),
      alignLexiconMorphemes('読んだ', SENTENCE.slice(7, 9)),
    );
    const part = result.parts[0];
    expect(part.kind === 'token' && part.pos).toEqual({
      tag: '動詞',
      detail: '自立',
      wordClass: 'content',
    });
  });

  it('steps over a symbol so the word inside a bracket still decides the class', () => {
    const result = attachLexiconPartOfSpeech(
      passage([token('「猫」', 0)]),
      alignLexiconMorphemes('「猫」', [
        { surface: '「', pos: '記号', detail: '括弧開' },
        { surface: '猫', pos: '名詞', detail: '一般' },
        { surface: '」', pos: '記号', detail: '括弧閉' },
      ]),
    );
    const part = result.parts[0];
    expect(part.kind === 'token' && part.pos?.wordClass).toBe('content');
  });

  it('leaves a token no morpheme covers unlabelled rather than defaulting it', () => {
    const result = attachLexiconPartOfSpeech(
      passage([token('猫', 0), token('cat', 1)]),
      alignLexiconMorphemes('猫cat', [{ surface: '猫', pos: '名詞', detail: '一般' }]),
    );
    const second = result.parts[1];
    expect(second.kind === 'token' && second.pos).toBeUndefined();
  });

  it('returns the passage untouched when nothing analysed it', () => {
    const input = passage([token('猫', 0)]);
    expect(attachLexiconPartOfSpeech(input, [])).toBe(input);
  });

  it('does not mutate the result it was given', () => {
    const input = passage([token('猫', 0)]);
    attachLexiconPartOfSpeech(
      input,
      alignLexiconMorphemes('猫', [{ surface: '猫', pos: '名詞', detail: '一般' }]),
    );
    const part = input.parts[0];
    expect(part.kind === 'token' && part.pos).toBeUndefined();
  });
});

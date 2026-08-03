import { describe, expect, it } from 'vitest';
import {
  alignAnnotations,
  buildSentenceAnalysisPrompt,
  isAnalyzableText,
  normalizeAnalysisText,
  parseSentenceAnalysis,
  primaryTranslation,
  sentencePieces,
  type SentenceAnalysisResult,
  type UnalignedAnnotation,
} from '../sentenceAnalysisCore';

const SENTENCE = '人生は選択の連続だ。その一つ一つが、未来を作っていく。';

function annotation(text: string, over: Partial<UnalignedAnnotation> = {}): UnalignedAnnotation {
  return {
    text,
    category: 'vocabulary',
    meaning: `meaning of ${text}`,
    explanation: `explanation of ${text}`,
    examples: [],
    vocabulary: [],
    ...over,
  };
}

describe('normalizeAnalysisText', () => {
  it('collapses the line breaks OCR puts between boxes', () => {
    expect(normalizeAnalysisText('人生は\n選択の\n連続だ。')).toBe('人生は 選択の 連続だ。');
  });

  it('trims and caps runaway input', () => {
    expect(normalizeAnalysisText(`  ${'あ'.repeat(900)}  `)).toHaveLength(600);
  });

  it('treats a single character as too short to analyze', () => {
    expect(isAnalyzableText('あ')).toBe(false);
    expect(isAnalyzableText('あい')).toBe(true);
  });
});

describe('alignAnnotations', () => {
  it('places spans at their real offsets', () => {
    const aligned = alignAnnotations(SENTENCE, [annotation('人生'), annotation('未来')]);
    expect(aligned.map((a) => [a.text, a.start, a.end])).toEqual([
      ['人生', 0, 2],
      ['未来', 18, 20],
    ]);
  });

  it('maps a repeated span to successive occurrences, not all to the first', () => {
    const aligned = alignAnnotations('猫が猫を見た', [annotation('猫'), annotation('猫')]);
    expect(aligned.map((a) => a.start)).toEqual([0, 2]);
  });

  it('still finds a span the model returned out of order', () => {
    const aligned = alignAnnotations(SENTENCE, [annotation('未来'), annotation('人生')]);
    expect(aligned.map((a) => a.text)).toEqual(['人生', '未来']);
  });

  it('drops a span that is not in the sentence at all', () => {
    const aligned = alignAnnotations(SENTENCE, [annotation('人生'), annotation('猫')]);
    expect(aligned.map((a) => a.text)).toEqual(['人生']);
  });

  it('keeps the longer span when two overlap', () => {
    const aligned = alignAnnotations(SENTENCE, [
      annotation('一つ一つが', { category: 'grammar' }),
      annotation('一つ'),
    ]);
    expect(aligned).toHaveLength(1);
    expect(aligned[0].text).toBe('一つ一つが');
  });

  it('never returns overlapping spans', () => {
    const aligned = alignAnnotations(SENTENCE, [
      annotation('人生は'),
      annotation('は', { category: 'particle' }),
      annotation('選択の連続'),
      annotation('連続'),
    ]);
    for (let i = 1; i < aligned.length; i += 1) {
      expect(aligned[i].start).toBeGreaterThanOrEqual(aligned[i - 1].end);
    }
  });
});

describe('sentencePieces', () => {
  it('reproduces the sentence exactly', () => {
    const aligned = alignAnnotations(SENTENCE, [
      annotation('人生は'),
      annotation('一つ一つが', { category: 'grammar' }),
      annotation('作っていく', { category: 'grammar' }),
    ]);
    const pieces = sentencePieces(SENTENCE, aligned);
    expect(pieces.map((p) => p.text).join('')).toBe(SENTENCE);
  });

  it('indexes annotations so a click maps back to the right one', () => {
    const aligned = alignAnnotations(SENTENCE, [annotation('人生は'), annotation('未来')]);
    const pieces = sentencePieces(SENTENCE, aligned);
    const annotated = pieces.filter((p) => p.kind === 'annotation');
    expect(annotated.map((p) => (p.kind === 'annotation' ? p.index : -1))).toEqual([0, 1]);
  });

  it('handles a sentence with no annotations', () => {
    expect(sentencePieces(SENTENCE, [])).toEqual([{ kind: 'plain', text: SENTENCE }]);
  });
});

describe('parseSentenceAnalysis', () => {
  const payload = {
    translations: {
      en: 'Life is a series of choices.',
      ja: '人生は選ぶことの積み重ねだ。',
      zh: '人生是一连串的选择。',
    },
    literal: 'life / TOPIC / choice / of / series / is',
    formality: { level: 'Casual (plain form)', note: 'Written or spoken to a peer.' },
    difficulty: 'N3',
    structure: 'Two sentences; the second takes その as its topic.',
    annotations: [
      {
        text: '人生は',
        category: 'particle',
        meaning: 'marks 人生 as the topic',
        explanation: 'は sets what the sentence is about.',
        level: 'N5',
        examples: [{ text: '私は学生だ。', translation: 'I am a student.' }],
        vocabulary: [{ term: '人生', reading: 'じんせい', gloss: 'life' }],
      },
      {
        text: '一つ一つが',
        category: 'grammar',
        headword: '一つ一つ（ひとつひとつ）',
        meaning: 'each and every one',
        explanation: 'Emphasises the items individually.',
        level: 'N3',
      },
    ],
    nuance: ['Reads as a maxim rather than a report.'],
    pitfalls: ['Do not read だ as polite.'],
  };

  it('parses and aligns a full response', () => {
    const result = parseSentenceAnalysis(JSON.stringify(payload), SENTENCE);
    expect(result.sentence).toBe(SENTENCE);
    expect(result.translations.zh).toBe('人生是一连串的选择。');
    expect(result.formality?.level).toBe('Casual (plain form)');
    expect(result.annotations.map((a) => a.text)).toEqual(['人生は', '一つ一つが']);
    expect(result.annotations[0].start).toBe(0);
    expect(result.annotations[1].category).toBe('grammar');
  });

  it('unwraps a markdown-fenced response', () => {
    const result = parseSentenceAnalysis('```json\n' + JSON.stringify(payload) + '\n```', SENTENCE);
    expect(result.translations.en).toBe('Life is a series of choices.');
  });

  it('falls back to a known category when the model invents one', () => {
    const odd = { ...payload, annotations: [{ ...payload.annotations[0], category: 'sparkle' }] };
    const result = parseSentenceAnalysis(JSON.stringify(odd), SENTENCE);
    expect(result.annotations[0].category).toBe('vocabulary');
  });

  it('drops an annotation that is missing its meaning rather than rendering it blank', () => {
    const partial = {
      ...payload,
      annotations: [{ text: '人生は', category: 'particle', explanation: 'x' }],
    };
    const result = parseSentenceAnalysis(JSON.stringify(partial), SENTENCE);
    expect(result.annotations).toEqual([]);
  });

  it('survives a response that dropped every optional field', () => {
    const bare = { translations: { en: 'Life is choices.' }, annotations: [] };
    const result = parseSentenceAnalysis(JSON.stringify(bare), SENTENCE);
    expect(result.translations.en).toBe('Life is choices.');
    expect(result.formality).toBeUndefined();
    expect(result.nuance).toEqual([]);
  });

  it('throws on malformed JSON so the caller can offer a retry', () => {
    expect(() => parseSentenceAnalysis('not json', SENTENCE)).toThrow(/malformed/i);
  });

  it('throws when there is nothing at all to show', () => {
    expect(() => parseSentenceAnalysis('{"translations":{},"annotations":[]}', SENTENCE)).toThrow(
      /empty/i,
    );
  });
});

describe('primaryTranslation', () => {
  const result = {
    translations: { en: 'English', ja: '日本語', zh: '中文' },
  } as SentenceAnalysisResult;

  it('prefers the UI language', () => {
    expect(primaryTranslation(result, 'zh', 'ja')).toBe('中文');
  });

  it('never leads with the sentence own language', () => {
    expect(primaryTranslation(result, 'ja', 'ja')).toBe('English');
  });

  it('falls back when the preferred language is missing', () => {
    const partial = { translations: { en: 'English' } } as SentenceAnalysisResult;
    expect(primaryTranslation(partial, 'ru', 'ja')).toBe('English');
  });
});

describe('buildSentenceAnalysisPrompt', () => {
  it('asks for verbatim, non-overlapping spans — the whole feature depends on it', () => {
    const prompt = buildSentenceAnalysisPrompt({ text: SENTENCE, lang: 'ja' });
    expect(prompt).toContain('EXACTLY');
    expect(prompt).toContain('NOT overlap');
  });

  it('asks for a paraphrase, not a translation, in the sentence own language', () => {
    const prompt = buildSentenceAnalysisPrompt({ text: SENTENCE, lang: 'ja' });
    expect(prompt).toMatch(/"ja": the sentence restated in simple Japanese/);
    expect(prompt).toMatch(/"en": a natural, idiomatic English translation/);
  });

  it('offers JLPT bands for Japanese and HSK bands for Chinese', () => {
    expect(buildSentenceAnalysisPrompt({ text: SENTENCE, lang: 'ja' })).toContain('N5, N4, N3');
    expect(buildSentenceAnalysisPrompt({ text: '人生是选择', lang: 'zh' })).toContain('HSK1, HSK2');
  });

  it('keeps context out of the analysis target', () => {
    const prompt = buildSentenceAnalysisPrompt({
      text: SENTENCE,
      lang: 'ja',
      context: 'chapter one',
    });
    expect(prompt).toContain('do NOT analyze it');
  });
});

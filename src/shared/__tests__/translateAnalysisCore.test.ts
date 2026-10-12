import { describe, expect, it } from 'vitest';
import {
  TranslateAnalysisParseError,
  analysisCompleteness,
  buildAnalysisPrompt,
  buildAnalysisSchema,
  computeAnalysisFlags,
  parseAnalysisResponse,
  type AnalysisFlags,
} from '../translateAnalysisCore';

const ALL_FLAGS: AnalysisFlags = {
  formality: true,
  particlesJa: true,
  declensionRu: true,
  measureWordZh: true,
};

describe('computeAnalysisFlags', () => {
  it('formality is always on', () => {
    expect(computeAnalysisFlags('en', 'de').formality).toBe(true);
    expect(computeAnalysisFlags('ja', 'ru').formality).toBe(true);
  });

  it('particle flag when Japanese is source or target', () => {
    expect(computeAnalysisFlags('ja', 'en').particlesJa).toBe(true);
    expect(computeAnalysisFlags('en', 'ja').particlesJa).toBe(true);
    expect(computeAnalysisFlags('zh', 'ru').particlesJa).toBe(false);
  });

  // F8: keyed to the language on either side, so a Russian or Chinese SOURCE
  // (the learner's study language) gets its own section too.
  it('declension when Russian is source or target', () => {
    expect(computeAnalysisFlags('ja', 'ru').declensionRu).toBe(true);
    expect(computeAnalysisFlags('ru', 'en').declensionRu).toBe(true);
    expect(computeAnalysisFlags('ja', 'en').declensionRu).toBe(false);
  });

  it('measure words when Chinese is source or target', () => {
    expect(computeAnalysisFlags('en', 'zh').measureWordZh).toBe(true);
    expect(computeAnalysisFlags('zh', 'en').measureWordZh).toBe(true);
    expect(computeAnalysisFlags('zh-Hant', 'en').measureWordZh).toBe(true);
    expect(computeAnalysisFlags('ja', 'en').measureWordZh).toBe(false);
  });
});

describe('buildAnalysisSchema', () => {
  function keys(flags: AnalysisFlags): string[] {
    const schema = buildAnalysisSchema(flags) as { properties: Record<string, unknown> };
    return Object.keys(schema.properties);
  }

  it('includes only the keys for active flags', () => {
    expect(keys({ formality: true, particlesJa: false, declensionRu: false, measureWordZh: false }))
      .toEqual(['formality']);
    expect(keys({ formality: true, particlesJa: true, declensionRu: false, measureWordZh: false }))
      .toEqual(['formality', 'particleNotes']);
    expect(keys(ALL_FLAGS)).toEqual([
      'formality',
      'particleNotes',
      'declension',
      'measureWords',
      'aspectNotes',
    ]);
  });

  it('marks formality required when active', () => {
    const schema = buildAnalysisSchema(ALL_FLAGS) as { required: string[] };
    expect(schema.required).toContain('formality');
  });
});

describe('buildAnalysisPrompt', () => {
  const req = {
    sourceText: '猫が魚を食べた。',
    translatedText: 'Кошка съела рыбу.',
    source: 'ja',
    target: 'ru',
    jaParticleTokens: ['が', 'を'],
  };

  it('names both languages and includes both sentences', () => {
    const prompt = buildAnalysisPrompt(req, computeAnalysisFlags('ja', 'ru'));
    expect(prompt).toContain('Japanese');
    expect(prompt).toContain('Russian');
    expect(prompt).toContain('猫が魚を食べた。');
    expect(prompt).toContain('Кошка съела рыбу.');
  });

  it('lists particles in order and asks for that exact count', () => {
    const prompt = buildAnalysisPrompt(req, computeAnalysisFlags('ja', 'ru'));
    expect(prompt).toContain('1. が');
    expect(prompt).toContain('2. を');
    expect(prompt).toContain('exactly 2 strings');
  });

  it('omits inactive panels', () => {
    const prompt = buildAnalysisPrompt(
      { sourceText: 'Hello', translatedText: 'Hallo', source: 'en', target: 'de' },
      computeAnalysisFlags('en', 'de'),
    );
    expect(prompt).toContain('formality');
    expect(prompt).not.toContain('particleNotes');
    expect(prompt).not.toContain('declension');
    expect(prompt).not.toContain('measureWords');
  });
});

describe('parseAnalysisResponse', () => {
  it('parses a well-formed full response', () => {
    const raw = JSON.stringify({
      formality: { casual: 'a', polite: 'b', businessSafe: 'c' },
      particleNotes: ['marks the subject', 'marks the object'],
      declension: [
        {
          word: 'кошка',
          dictionaryForm: 'кошка',
          pos: 'noun',
          gender: 'feminine',
          caseUsed: 'nominative',
          singular: { nominative: 'кошка', genitive: 'кошки' },
        },
        {
          word: 'съела',
          dictionaryForm: 'съесть',
          pos: 'verb',
          verbAspect: 'perfective',
          verbTense: 'past',
          verbAgreement: 'feminine singular (-ла)',
        },
      ],
      measureWords: [{ noun: '鱼', classifier: '条', pinyin: 'tiáo', reason: 'long thin animals' }],
      aspectNotes: [{ particle: '了', afterWord: '吃', reason: 'completed action' }],
    });
    const result = parseAnalysisResponse(raw, ALL_FLAGS);
    expect(result.formality?.polite).toBe('b');
    expect(result.particleNotes).toHaveLength(2);
    expect(result.declension?.[0].singular?.genitive).toBe('кошки');
    expect(result.declension?.[1].verbAgreement).toBe('feminine singular (-ла)');
    expect(result.measureWords?.[0].classifier).toBe('条');
    expect(result.aspectNotes?.[0].particle).toBe('了');
  });

  it('strips <think> blocks before parsing', () => {
    const raw = '<think>hmm</think>\n{"formality":{"casual":"a","polite":"b","businessSafe":"c"}}';
    expect(parseAnalysisResponse(raw, ALL_FLAGS).formality?.casual).toBe('a');
  });

  // F2: a reply that is not a JSON object used to become `{}`, which main then
  // cached as a successful analysis. It throws now, and nothing is cached.
  it('malformed JSON throws a coded parse error instead of returning {}', () => {
    expect(() => parseAnalysisResponse('sure, here you go:', ALL_FLAGS)).toThrow(TranslateAnalysisParseError);
    expect(() => parseAnalysisResponse('{"formality":', ALL_FLAGS)).toThrow(TranslateAnalysisParseError);
    expect(() => parseAnalysisResponse('[1,2,3]', ALL_FLAGS)).toThrow(TranslateAnalysisParseError);
  });

  it('reads a fenced JSON reply', () => {
    const raw = '```json\n{"formality":{"casual":"a","polite":"b","businessSafe":"c"}}\n```';
    expect(parseAnalysisResponse(raw, ALL_FLAGS).formality?.polite).toBe('b');
  });

  it('drops malformed fields but keeps valid ones', () => {
    const raw = JSON.stringify({
      formality: { casual: 'a' }, // missing polite/businessSafe → dropped
      particleNotes: ['note'],
      declension: [{ word: 'x' }], // missing dictionaryForm/pos → dropped
      measureWords: 'nope',
    });
    const result = parseAnalysisResponse(raw, ALL_FLAGS);
    expect(result.formality).toBeUndefined();
    expect(result.particleNotes).toEqual(['note']);
    expect(result.declension).toBeUndefined();
    expect(result.measureWords).toBeUndefined();
  });

  it('ignores fields whose flag is off', () => {
    const raw = JSON.stringify({
      formality: { casual: 'a', polite: 'b', businessSafe: 'c' },
      declension: [{ word: 'кошка', dictionaryForm: 'кошка', pos: 'noun' }],
    });
    const flags: AnalysisFlags = {
      formality: true,
      particlesJa: false,
      declensionRu: false,
      measureWordZh: false,
    };
    const result = parseAnalysisResponse(raw, flags);
    expect(result.formality).toBeDefined();
    expect(result.declension).toBeUndefined();
  });

  it('rejects invalid enum values (aspect particle, pos, case)', () => {
    const raw = JSON.stringify({
      aspectNotes: [
        { particle: '吗', afterWord: 'x', reason: 'r' },
        { particle: '过', afterWord: 'y', reason: 'r' },
      ],
      declension: [{ word: 'a', dictionaryForm: 'b', pos: 'preposition' }],
    });
    const result = parseAnalysisResponse(raw, ALL_FLAGS);
    expect(result.aspectNotes).toHaveLength(1);
    expect(result.aspectNotes?.[0].particle).toBe('过');
    expect(result.declension).toBeUndefined();
  });
});

describe('analysisCompleteness (F2: only complete analyses are cached)', () => {
  const flags = computeAnalysisFlags('ja', 'en');
  const formality = { casual: 'a', polite: 'b', businessSafe: 'c' };

  it('an empty result is empty', () => {
    expect(analysisCompleteness({}, flags, {})).toBe('empty');
  });

  it('a missing required section is partial', () => {
    expect(analysisCompleteness({ particleNotes: ['x'] }, flags, { jaParticleTokens: ['は'] })).toBe('partial');
  });

  it('particle notes that do not cover every particle are partial', () => {
    expect(analysisCompleteness({ formality, particleNotes: ['x'] }, flags, { jaParticleTokens: ['は', 'が'] })).toBe('partial');
    expect(analysisCompleteness({ formality, particleNotes: ['x', 'y'] }, flags, { jaParticleTokens: ['は', 'が'] })).toBe('complete');
  });
});

describe('the prompt follows the study language on either side (F8)', () => {
  it('asks for measure words about the Chinese SOURCE, in the UI language', () => {
    const req = { sourceText: '我买了三本书。', translatedText: 'I bought three books.', source: 'zh', target: 'en', explainIn: 'ru' };
    const prompt = buildAnalysisPrompt(req, computeAnalysisFlags('zh', 'en'));
    expect(prompt).toContain('Chinese text (我买了三本书。)');
    expect(prompt).toContain('Russian');
    expect(prompt).not.toContain('Chinese translation');
  });
});
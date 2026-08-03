import { describe, expect, it } from 'vitest';
import {
  buildMediaStudyAssistantPrompt,
  normalizeMediaStudyAssistantRequest,
  parseMediaStudyAssistantResult,
} from '../mediaStudyAssistant';

describe('media study assistant contract', () => {
  it('normalizes bounded on-demand requests', () => {
    expect(normalizeMediaStudyAssistantRequest({
      mode: 'explain-grammar',
      text: '  雨が降っている。  ',
      context: 'Episode 1',
      jlptLevel: ' N3 ',
    })).toEqual({
      mode: 'explain-grammar',
      text: '雨が降っている。',
      context: 'Episode 1',
      jlptLevel: 'N3',
    });
    expect(normalizeMediaStudyAssistantRequest({ mode: 'invalid', text: '日本語' })).toBeNull();
    expect(normalizeMediaStudyAssistantRequest({ mode: 'explain-dialogue', text: ' ' })).toBeNull();
  });

  it('builds a task-specific prompt without inventing missing context', () => {
    const prompt = buildMediaStudyAssistantPrompt({
      mode: 'simplify-japanese',
      text: '致し方あるまい。',
      context: 'Historical drama',
      jlptLevel: 'N2',
    });
    expect(prompt).toContain('Rewrite the line in simpler natural Japanese');
    expect(prompt).toContain('Japanese: 致し方あるまい。');
    expect(prompt).toContain('Estimated content level: N2');
    expect(prompt).toContain('Do not invent plot facts');
  });

  it('sanitizes provider JSON into a stable result', () => {
    const result = parseMediaStudyAssistantResult(JSON.stringify({
      summary: 'A resigned statement.',
      translation: 'It cannot be helped.',
      simplifiedJapanese: '仕方がない。',
      grammar: [{ pattern: '〜まい', explanation: 'Negative volition.', level: 'N2' }],
      vocabulary: [{ word: '致し方', reading: 'いたしかた', meaning: 'way or means' }],
      examples: [{ japanese: 'もう戻るまい。', translation: 'I will not return.' }],
      notes: ['Formal or literary register.'],
      ignored: 'not retained',
    }), 'explain-dialogue');

    expect(result).toMatchObject({
      mode: 'explain-dialogue',
      summary: 'A resigned statement.',
      simplifiedJapanese: '仕方がない。',
    });
    expect(result.grammar[0]).toEqual({
      pattern: '〜まい',
      explanation: 'Negative volition.',
      level: 'N2',
    });
  });
});

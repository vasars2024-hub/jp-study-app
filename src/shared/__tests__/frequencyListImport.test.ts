import { describe, expect, it } from 'vitest';
import { detectListLanguage, parseFrequencyText } from '../frequencyListImport';
import { REMOTE_BUNDLED_FREQUENCY_DICTIONARIES } from '../bundledFrequencyDicts';

describe('parseFrequencyText — the list files people actually have', () => {
  it('a "word count" list (FrequencyWords) ranks by count', () => {
    expect(parseFrequencyText('я 100\nне 80\nчто 90\nдом 70\n')).toEqual({ я: 1, что: 2, не: 3, дом: 4 });
  });

  it('a CSV with a header and a rank column ranks by rank', () => {
    expect(parseFrequencyText('word,rank\n的,1\n是,3\n了,2\n')).toEqual({ 的: 1, 了: 2, 是: 3 });
  });

  it('a bare word list ranks by line order, skipping comments and blank lines', () => {
    expect(parseFrequencyText('# top words\nкнига\n\nдом\n')).toEqual({ книга: 1, дом: 2 });
  });

  it('a leading rank column and a reading column are both understood', () => {
    expect(parseFrequencyText('1\t食べる\tたべる\n2\t猫\tねこ\n')).toMatchObject({
      食べる: 1, '食べる\u0001たべる': 1, 猫: 2,
    });
  });
});

describe('detectListLanguage', () => {
  it('names the list language by its words', () => {
    expect(detectListLanguage(['я', 'не', 'что'], 'ja')).toBe('ru');
    expect(detectListLanguage(['的', 'は', '猫'], 'zh')).toBe('ja');
    const chinese = Array.from({ length: 40 }, (_, i) => `词${i}`);
    expect(detectListLanguage(chinese, 'ja')).toBe('zh');
    expect(detectListLanguage(['the', 'of'], 'ru')).toBeUndefined();
  });
});

describe('the catalogued large lists', () => {
  it('Chinese and Russian each have one, with their licence recorded', () => {
    for (const lang of ['zh', 'ru'] as const) {
      const def = REMOTE_BUNDLED_FREQUENCY_DICTIONARIES.find((entry) => entry.language === lang);
      expect(def?.format).toBe('word-count');
      expect(def?.licence).toBe('CC BY-SA 4.0');
      expect(def?.url).toMatch(/^https:\/\//);
    }
  });
});

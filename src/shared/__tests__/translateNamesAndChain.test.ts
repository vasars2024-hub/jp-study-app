// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { romanizeNameReading, suggestNameTerms } from '../translateGlossary';
import {
  TRANSLATE_FALLBACK_KEYS,
  isTranslateFallbackCode,
  sanitizeTranslateResultMeta,
  sanitizeTranslateRouteFailure,
  translateFallbackCodeFor,
} from '../translateProviders';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { ru } from '../i18n/catalogs/ru';
import { zh } from '../i18n/catalogs/zh';

const tok = (surface: string, reading?: string, proper = false) => ({ surface, reading, proper });

describe('romanizeNameReading', () => {
  it('writes names the way English text does: no long-vowel marks, capitalised', () => {
    expect(romanizeNameReading('サトウ')).toBe('Sato');
    expect(romanizeNameReading('トウキョウ')).toBe('Tokyo');
    expect(romanizeNameReading('オオサカ')).toBe('Osaka');
    expect(romanizeNameReading('ハルカ')).toBe('Haruka');
    expect(romanizeNameReading('ユウキ')).toBe('Yuki');
  });

  it('refuses a reading that is not plain kana', () => {
    expect(romanizeNameReading('田中')).toBeNull();
    expect(romanizeNameReading('')).toBeNull();
  });
});

describe('suggestNameTerms', () => {
  const passage = [
    tok('田中', 'タナカ', true), tok('太郎', 'タロウ', true), tok('は', 'ハ'),
    tok('東京', 'トウキョウ', true), tok('に', 'ニ'), tok('住ん', 'スン'), tok('で', 'デ'), tok('いる', 'イル'),
    tok('。', '。'),
  ];

  it('offers each name run once, family and given name together, longest first', () => {
    expect(suggestNameTerms(passage, 'en', [])).toEqual([
      { source: '田中太郎', target: 'Tanaka Taro' },
      { source: '東京', target: 'Tokyo' },
    ]);
  });

  it('skips names already in the glossary and non-English targets', () => {
    expect(suggestNameTerms(passage, 'en', [{ source: '東京', target: 'Tokyo' }]).map((t) => t.source)).toEqual(['田中太郎']);
    expect(suggestNameTerms(passage, 'ru', [])).toEqual([]);
    expect(suggestNameTerms(passage, 'zh', [])).toEqual([]);
  });

  it('ignores ordinary nouns and kana-only words even when tagged', () => {
    expect(suggestNameTerms([tok('猫', 'ネコ'), tok('さくら', 'サクラ', true)], 'en', [])).toEqual([]);
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => [tok(`名${'前'.repeat(i)}`, 'ナ', true), tok('と', 'ト')]).flat();
    expect(suggestNameTerms(many, 'en', [], 3)).toHaveLength(3);
  });
});

describe('offline as a reason, and the engine chain', () => {
  it('has an offline code with a catalog key in all four languages', () => {
    expect(isTranslateFallbackCode('offline')).toBe(true);
    expect(translateFallbackCodeFor('offline')).toBe('offline');
    for (const catalog of [en, ja, zh, ru]) expect(catalog[TRANSLATE_FALLBACK_KEYS.offline]).toBeTruthy();
    for (const key of ['xlate2.error.chain', 'xlate2.error.attempt', 'xlate2.result.cached']) {
      for (const catalog of [en, ja, zh, ru]) expect(catalog[key], key).toBeTruthy();
    }
  });

  it('keeps a failure chain across IPC, and drops malformed links', () => {
    expect(sanitizeTranslateRouteFailure({
      provider: 'deepl',
      code: 'quota',
      attempts: [{ provider: 'deepl', code: 'quota' }, { provider: 'local', code: 'not-installed' }, { provider: 'evil', code: 'x' }],
    })).toEqual({
      provider: 'deepl',
      code: 'quota',
      attempts: [{ provider: 'deepl', code: 'quota' }, { provider: 'local', code: 'not-installed' }],
    });
    // A one-link chain is just the failure itself.
    expect(sanitizeTranslateRouteFailure({ provider: 'deepl', code: 'auth', attempts: [{ provider: 'deepl', code: 'auth' }] }))
      .toEqual({ provider: 'deepl', code: 'auth' });
  });

  it('keeps attempts and the cache flag on a result, and nothing it does not know', () => {
    expect(sanitizeTranslateResultMeta({
      provider: 'local',
      fallbackFrom: 'deepl',
      fallbackCode: 'offline',
      attempts: [{ provider: 'deepl', code: 'offline' }],
      cached: true,
      apiKey: 'should-not-survive',
    })).toEqual({
      provider: 'local',
      fallbackFrom: 'deepl',
      fallbackCode: 'offline',
      attempts: [{ provider: 'deepl', code: 'offline' }],
      cached: true,
    });
    expect(sanitizeTranslateResultMeta({ provider: 'local', cached: 'yes' })).toEqual({ provider: 'local' });
  });
});

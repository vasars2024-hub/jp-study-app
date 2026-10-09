// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  TRANSLATE_FALLBACK_KEYS,
  TRANSLATE_PROVIDERS,
  buildCloudTranslatePrompt,
  createCloudLineStream,
  deeplApiBase,
  deeplEstimatedCostUsd,
  deeplLangCode,
  defaultTranslateProviderSettings,
  hasTranslateConsent,
  isCloudTranslateProvider,
  joinTranslatedSentences,
  normalizeTranslateProviderSettings,
  parseCloudTranslateLines,
  parseDeeplTranslations,
  providerForPair,
  sanitizeTranslateResultMeta,
  sanitizeTranslateRouteFailure,
  translateFallbackCodeFor,
  translateProviderLabel,
  withPairProvider,
  withTranslateConsent,
} from '../translateProviders';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { ru } from '../i18n/catalogs/ru';
import { zh } from '../i18n/catalogs/zh';

describe('settings', () => {
  it('defaults every pair to the offline engine with fallback on', () => {
    const s = defaultTranslateProviderSettings();
    expect(providerForPair(s, 'ja', 'en')).toBe('local');
    expect(s.fallbackToLocal).toBe(true);
  });

  it('normalizes what was on disk: unknown providers and malformed keys are dropped, never coerced to cloud', () => {
    const s = normalizeTranslateProviderSettings({
      pairs: { 'ja>en': 'deepl', 'zh>en': 'openai-gpt', 'bad key': 'deepl', 'ja>ru': 'local' },
      consent: { deepl: 5, 'gemini-2.5-flash': 'yes', local: 9, nope: 1 },
      fallbackToLocal: false,
    });
    expect(s.pairs).toEqual({ 'ja>en': 'deepl' });
    expect(s.consent).toEqual({ deepl: 5 });
    expect(s.fallbackToLocal).toBe(false);
    expect(normalizeTranslateProviderSettings('garbage')).toEqual(defaultTranslateProviderSettings());
  });

  it('keeps the choice per language pair', () => {
    let s = withTranslateConsent(defaultTranslateProviderSettings(), 'deepl', true, 10);
    s = withPairProvider(s, 'ja', 'en', 'deepl');
    expect(providerForPair(s, 'ja', 'en')).toBe('deepl');
    expect(providerForPair(s, 'ja', 'ru')).toBe('local');
    expect(providerForPair(withPairProvider(s, 'ja', 'en', 'local'), 'ja', 'en')).toBe('local');
  });

  it('consent is per provider, local needs none, and revoking returns its pairs to offline', () => {
    let s = withTranslateConsent(defaultTranslateProviderSettings(), 'deepl', true, 10);
    expect(hasTranslateConsent(s, 'deepl')).toBe(true);
    expect(hasTranslateConsent(s, 'gemini-2.5-flash')).toBe(false);
    expect(hasTranslateConsent(s, 'local')).toBe(true);
    expect(hasTranslateConsent(s, 'local-large')).toBe(true);
    s = withPairProvider(withPairProvider(s, 'ja', 'en', 'deepl'), 'zh', 'en', 'deepl');
    s = withTranslateConsent(s, 'deepl', false, 20);
    expect(s.pairs).toEqual({});
    expect(s.consent.deepl).toBeUndefined();
  });

  it('only the cloud rows are cloud, and an unknown id is not', () => {
    expect(TRANSLATE_PROVIDERS.filter((p) => isCloudTranslateProvider(p.id)).map((p) => p.id)).toEqual([
      'deepl', 'gemini-2.5-flash', 'deepseek-v4-flash', 'deepseek-v4-pro',
    ]);
    expect(isCloudTranslateProvider('openai')).toBe(false);
    for (const p of TRANSLATE_PROVIDERS) if (p.kind === 'cloud') expect(p.host).toBeTruthy();
  });
});

describe('labels and catalog keys', () => {
  it('local rows resolve through the catalog, cloud rows are brand names', () => {
    const t = (key: string) => `T(${key})`;
    expect(translateProviderLabel('local', t)).toBe('T(xlate2.provider.local)');
    expect(translateProviderLabel('deepl', t)).toBe('DeepL API');
  });

  it('every fallback key and local label exists in all four catalogs', () => {
    const keys = [
      ...Object.values(TRANSLATE_FALLBACK_KEYS),
      ...TRANSLATE_PROVIDERS.flatMap((p) => (p.labelKey ? [p.labelKey] : [])),
      'xlate2.error.cloud',
      'xlate2.result.by',
      'xlate2.result.fellBack',
    ];
    for (const catalog of [en, ja, zh, ru]) {
      for (const key of keys) expect(catalog[key], key).toBeTruthy();
    }
  });
});

describe('fallback codes', () => {
  it('maps runtime error codes to what the UI explains', () => {
    expect(translateFallbackCodeFor('missing-credential')).toBe('no-key');
    expect(translateFallbackCodeFor('authentication')).toBe('auth');
    expect(translateFallbackCodeFor('rate-limit')).toBe('rate-limit');
    expect(translateFallbackCodeFor('spend-budget')).toBe('spend');
    expect(translateFallbackCodeFor('cost-budget')).toBe('spend');
    expect(translateFallbackCodeFor('output-truncated')).toBe('invalid');
    expect(translateFallbackCodeFor('input-budget')).toBe('too-long');
    expect(translateFallbackCodeFor('whatever')).toBe('other');
  });

  it('sanitizes meta and failures that crossed IPC', () => {
    expect(sanitizeTranslateResultMeta({ provider: 'deepl', glossary: { applied: ['a', 3], missing: [] } }))
      .toEqual({ provider: 'deepl', glossary: { applied: ['a'], missing: [] } });
    expect(sanitizeTranslateResultMeta({ provider: 'local', fallbackFrom: 'deepl', fallbackCode: 'quota' }))
      .toEqual({ provider: 'local', fallbackFrom: 'deepl', fallbackCode: 'quota' });
    expect(sanitizeTranslateResultMeta({ provider: 'gpt' })).toBeNull();
    expect(sanitizeTranslateRouteFailure({ provider: 'deepl', code: 'auth' })).toEqual({ provider: 'deepl', code: 'auth' });
    expect(sanitizeTranslateRouteFailure({ provider: 'deepl', code: 'nope' })).toBeNull();
  });
});

describe('cloud prompt and streamed lines', () => {
  it('numbers the sentences, asks for context-aware rendering, and carries glossary terms', () => {
    const prompt = buildCloudTranslatePrompt(['猫が好き。', '犬も。'], 'ja', 'en', 'literal', [{ text: '先輩', gloss: 'senpai' }]);
    expect(prompt).toContain('[1] 猫が好き。\n[2] 犬も。');
    expect(prompt).toMatch(/omitted subjects/);
    expect(prompt).toMatch(/keigo/);
    expect(prompt).toMatch(/literally/);
    expect(prompt).toContain('先輩 -> senpai');
  });

  it('parses one line per sentence, ignoring chatter, quotes and out-of-range numbers', () => {
    const parsed = parseCloudTranslateLines('Here you go:\n[1] "I like cats."\n[3] extra\n[2]   Dogs too.\n[1] dup', 2);
    expect([...parsed]).toEqual([[0, 'I like cats.'], [1, 'Dogs too.']]);
  });

  it('reports each line once, as soon as its newline arrives, and the last on flush', () => {
    const seen: Array<[number, string]> = [];
    const stream = createCloudLineStream(3, (i, text) => seen.push([i, text]));
    stream.push('[1] One');
    expect(seen).toEqual([]);
    stream.push(' line.\n[2] Two');
    expect(seen).toEqual([[0, 'One line.']]);
    stream.push('.\n[2] Two again.\n[3] Three.');
    expect(seen).toEqual([[0, 'One line.'], [1, 'Two.']]);
    stream.flush();
    expect(seen).toEqual([[0, 'One line.'], [1, 'Two.'], [2, 'Three.']]);
  });

  it('joins sentences without spaces only for CJK targets', () => {
    expect(joinTranslatedSentences(['A.', '', 'B.'], 'en')).toBe('A. B.');
    expect(joinTranslatedSentences(['猫。', '犬。'], 'ja')).toBe('猫。犬。');
  });
});

describe('DeepL wire details', () => {
  it('routes Free keys to the Free host and prices them at zero', () => {
    expect(deeplApiBase('abc:fx')).toBe('https://api-free.deepl.com');
    expect(deeplApiBase('abc')).toBe('https://api.deepl.com');
    expect(deeplEstimatedCostUsd('abc:fx', 1000)).toBe(0);
    expect(deeplEstimatedCostUsd('abc', 1_000_000)).toBeCloseTo(25);
  });

  it('maps language codes, with the target variants DeepL requires', () => {
    expect(deeplLangCode('ja', 'source')).toBe('JA');
    expect(deeplLangCode('en', 'target')).toBe('EN-US');
    expect(deeplLangCode('zh', 'target')).toBe('ZH-HANS');
    expect(deeplLangCode('ru', 'target')).toBe('RU');
    expect(deeplLangCode('xx', 'source')).toBeNull();
  });

  it('reads translations in order and rejects a body of the wrong shape', () => {
    expect(parseDeeplTranslations({ translations: [{ text: 'a' }, { text: 'b' }] }, 2)).toEqual(['a', 'b']);
    expect(parseDeeplTranslations({ translations: [{ text: 'a' }] }, 2)).toBeNull();
    expect(parseDeeplTranslations({ message: 'quota' }, 1)).toBeNull();
  });
});

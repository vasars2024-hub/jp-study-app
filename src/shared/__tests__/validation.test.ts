import { describe, expect, it } from 'vitest';
import { isValidCrossLangTranslation, isUsableTemplateValue } from '../epubEnrichment';
import { hasMixedScriptWord, textMatchesLang } from '../langs';
import { makeCandidate } from './testUtils';

describe('isValidCrossLangTranslation', () => {
  it('rejects a kana leak (人間 → ニンゲン for en)', () => {
    expect(isValidCrossLangTranslation('ja', 'en', '人間', 'ニンゲン')).toBe(false);
  });

  it('rejects an untranslated echo (友 → 友)', () => {
    expect(isValidCrossLangTranslation('ja', 'ru', '友', '友')).toBe(false);
  });

  it('rejects wrong script per target (Latin answer for ru)', () => {
    expect(isValidCrossLangTranslation('ja', 'ru', '人間', 'human being')).toBe(false);
    expect(isValidCrossLangTranslation('ja', 'zh', '人間', 'human')).toBe(false);
  });

  it('rejects mixed-script garbage ("сacrificed") for both ru and en', () => {
    expect(isValidCrossLangTranslation('en', 'ru', 'sacrificed', 'сacrificed')).toBe(false);
    expect(isValidCrossLangTranslation('ja', 'en', '犠牲', 'сacrificed')).toBe(false);
  });

  it('accepts correct-script output for each known target', () => {
    expect(isValidCrossLangTranslation('ja', 'en', '人間', 'human being')).toBe(true);
    expect(isValidCrossLangTranslation('ja', 'ru', '人間', 'человек')).toBe(true);
    expect(isValidCrossLangTranslation('ja', 'zh', '人間', '人类')).toBe(true);
    expect(isValidCrossLangTranslation('en', 'ja', 'human', '人間')).toBe(true);
    expect(isValidCrossLangTranslation('ja', 'ko', '人間', '인간')).toBe(true);
  });

  it('unknown language codes get relaxed validation (non-empty, no kana, not echo)', () => {
    expect(isValidCrossLangTranslation('ja', 'xx', '人間', 'insan')).toBe(true);
    expect(isValidCrossLangTranslation('ja', 'xx', '人間', 'ニンゲン')).toBe(false);
    expect(isValidCrossLangTranslation('ja', 'xx', '人間', '')).toBe(false);
  });
});

describe('script helpers', () => {
  it('hasMixedScriptWord flags Cyrillic+Latin inside one word only', () => {
    expect(hasMixedScriptWord('сacrificed')).toBe(true);
    expect(hasMixedScriptWord('человек (human)')).toBe(false);
    expect(hasMixedScriptWord('normal text')).toBe(false);
  });

  it('textMatchesLang separates Chinese (han, no kana) from Japanese', () => {
    expect(textMatchesLang('zh', '人类')).toBe(true);
    expect(textMatchesLang('zh', '人間のニンゲン')).toBe(false);
    expect(textMatchesLang('ja', 'にんげん')).toBe(true);
  });
});

describe('isUsableTemplateValue', () => {
  const candidate = makeCandidate();

  it('rejects a JA leak stored in a foreign slot', () => {
    expect(isUsableTemplateValue('expression:ru', 'ニンゲン', candidate)).toBe(false);
    expect(isUsableTemplateValue('expression:ru', '人間', candidate)).toBe(false);
  });

  it('accepts real values and all :ja slots', () => {
    expect(isUsableTemplateValue('expression:ru', 'человек', candidate)).toBe(true);
    expect(isUsableTemplateValue('reading:ja', 'にんげん', candidate)).toBe(true);
    expect(isUsableTemplateValue('sentence:ja', candidate.sampleSentence, candidate)).toBe(true);
  });
});

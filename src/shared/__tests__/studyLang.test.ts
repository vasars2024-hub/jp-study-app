import { describe, expect, it } from 'vitest';
import {
  STUDY_LANGS,
  isStudyLang,
  normalizeStudyLang,
  studyLangFromTag,
  studyLangTag,
  WHISPER_LANGUAGE,
} from '../studyLang';
import {
  RU_SLOTS,
  guessLevelSlot,
  slotsForLang,
  tierName,
  tiersForLang,
  deriveUserLevel,
} from '../levelScale';
import { badgeForTier, levelLabel, levelLabelKey, schemeForLang } from '../levelEstimate';
import { examSlotsForLang } from '../bookLevelEstimate';
import { ASSET_CATALOG, assetsForLang, findAsset, starterAssetIds } from '../assetRegistry';
import { defaultWhisperTier } from '../whisperModels';

describe('study language', () => {
  it('lists all three study languages', () => {
    expect(STUDY_LANGS).toEqual(['ja', 'zh', 'ru']);
    for (const lang of STUDY_LANGS) expect(isStudyLang(lang)).toBe(true);
    expect(isStudyLang('en')).toBe(false);
  });

  it('keeps Russian instead of coercing it to Japanese (the old `=== zh ? zh : ja`)', () => {
    expect(normalizeStudyLang('ru')).toBe('ru');
    expect(normalizeStudyLang('zh')).toBe('zh');
    expect(normalizeStudyLang('ja')).toBe('ja');
    expect(normalizeStudyLang(null)).toBe('ja');
    expect(normalizeStudyLang('xx', 'ru')).toBe('ru');
  });

  it('reads BCP-47 and ISO 639-2/3 tags', () => {
    expect(studyLangFromTag('ru-RU')).toBe('ru');
    expect(studyLangFromTag('rus')).toBe('ru');
    expect(studyLangFromTag('zh-Hant')).toBe('zh');
    expect(studyLangFromTag('zh_TW')).toBe('zh');
    expect(studyLangFromTag('cmn')).toBe('zh');
    expect(studyLangFromTag('jpn')).toBe('ja');
    expect(studyLangFromTag('en')).toBeNull();
  });

  it('tags Chinese content with its script', () => {
    expect(studyLangTag('zh')).toBe('zh-Hans');
    expect(studyLangTag('zh', 'traditional')).toBe('zh-Hant');
    expect(studyLangTag('ru', 'traditional')).toBe('ru');
    expect(studyLangTag('ja')).toBe('ja');
  });

  it('names a whisper language for every study language', () => {
    expect(WHISPER_LANGUAGE.ru).toBe('russian');
    expect(defaultWhisperTier('ru')).toBe('whisper-small');
  });
});

describe('Russian level scale (CEFR, TORFL in the labels)', () => {
  it('has six CEFR slots at tiers 1..6 with TORFL names', () => {
    expect(slotsForLang('ru')).toBe(RU_SLOTS);
    expect(RU_SLOTS.map((s) => s.short)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
    expect(RU_SLOTS.map((s) => s.tier)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(RU_SLOTS[2].label).toContain('ТРКИ-1');
    expect(tiersForLang('ru')).toHaveLength(7);
    expect(tierName('ru', 4)).toBe('B2');
  });

  it('guesses a slot from a deck name in CEFR or TORFL terms', () => {
    expect(guessLevelSlot('Russian B1 core', 'ru')?.id).toBe('cefr-b1');
    expect(guessLevelSlot('cefr_c2.txt', 'ru')?.id).toBe('cefr-c2');
    expect(guessLevelSlot('ТРКИ-2 лексика', 'ru')?.id).toBe('cefr-b2');
    expect(guessLevelSlot('ТЭУ минимум', 'ru')?.id).toBe('cefr-a1');
    expect(guessLevelSlot('JLPT N3', 'ru')).toBeNull();
  });

  it('derives a level and badges on the CEFR scheme', () => {
    const { level } = deriveUserLevel('ru', { coverageBySlot: { 'cefr-a1': 0.9, 'cefr-a2': 0.85 } });
    expect(level).toBe(2);
    expect(schemeForLang('ru')).toBe('cefr');
    expect(badgeForTier('ru', 3)).toBe('B1');
    expect(levelLabel('ru', 7)).toBe('Advanced');
    expect(levelLabelKey('ru', 7)).toBe('level.tier.advanced');
    expect(examSlotsForLang('ru').map((s) => s.short)).toEqual(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  });
});

describe('Russian starter assets', () => {
  it('offers the Wiktionary Russian dictionary as the starter set', () => {
    expect(starterAssetIds('ru')).toEqual(['wiktionary-ru']);
    const spec = findAsset(ASSET_CATALOG, 'wiktionary-ru');
    expect(spec?.lang).toBe('ru');
    expect(spec?.kind).toBe('dictionary');
    expect(spec?.url).toMatch(/^https:\/\/kaikki\.org\//);
    expect(spec?.sizeBytes).toBeGreaterThan(50_000_000);
    expect(assetsForLang(ASSET_CATALOG, 'ru').some((a) => a.id === 'wiktionary-ru')).toBe(true);
    expect(assetsForLang(ASSET_CATALOG, 'ja').some((a) => a.id === 'wiktionary-ru')).toBe(false);
  });
});

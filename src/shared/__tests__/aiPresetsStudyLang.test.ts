/**
 * Card Studio presets follow the study language. Every original preset is
 * about kanji, kana, keigo or JLPT; a Chinese learner was offered only those
 * while the prompt asked for Chinese items.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_MINING_FORMATS,
  AI_PROMPT_PRESETS,
  formatsForPreset,
  presetFitsStudyLang,
  presetStudyLang,
  presetsForStudyLang,
} from '../aiMiningCatalog';
import { buildAiFormatSampleValues, buildAiPromptPreview } from '../aiPromptBuilder';
import { SEED_PROFILES } from '../seedProfiles';

describe('presets by study language', () => {
  it('maps study languages onto the two preset sets', () => {
    expect(presetStudyLang('zh')).toBe('zh');
    expect(presetStudyLang('zh-Hant')).toBe('zh');
    expect(presetStudyLang('ja')).toBe('ja');
    expect(presetStudyLang(undefined)).toBe('ja');
  });

  it('a Chinese learner gets only Chinese presets, a Japanese learner none of them', () => {
    const zh = presetsForStudyLang(AI_PROMPT_PRESETS, 'zh');
    const ja = presetsForStudyLang(AI_PROMPT_PRESETS, 'ja');
    expect(zh.length).toBeGreaterThanOrEqual(4);
    expect(zh.map((p) => p.id)).toEqual(expect.arrayContaining(['zh-chengyu', 'zh-measure-words', 'zh-tones-pinyin', 'zh-hsk-core']));
    expect(zh.some((p) => p.id === 'idiom-slang' || p.id === 'keigo-levels')).toBe(false);
    expect(ja.some((p) => p.id.startsWith('zh-'))).toBe(false);
    expect(ja.length + zh.length).toBe(AI_PROMPT_PRESETS.length);
    // Both lists have a core preset to land on.
    expect(zh.some((p) => p.category === 'core')).toBe(true);
    expect(ja.some((p) => p.category === 'core')).toBe(true);
  });

  it('every Chinese preset writes into a Chinese note type, never a Japanese one', () => {
    for (const preset of presetsForStudyLang(AI_PROMPT_PRESETS, 'zh')) {
      expect(presetFitsStudyLang(preset, 'zh')).toBe(true);
      const formats = formatsForPreset(preset.id);
      expect(formats.length).toBeGreaterThan(0);
      for (const format of formats) {
        const profile = SEED_PROFILES[format.profileId as keyof typeof SEED_PROFILES];
        expect(profile?.targetLang, `${format.id} -> ${format.profileId}`).toBe('zh');
      }
      expect(`${preset.instruction} ${preset.description}`).not.toMatch(/Japanese|kanji|kana|JLPT/i);
    }
    expect(new Set(AI_MINING_FORMATS.map((f) => f.id)).size).toBe(AI_MINING_FORMATS.length);
  });
});

describe('Chinese prompts and previews', () => {
  const preset = AI_PROMPT_PRESETS.find((p) => p.id === 'zh-chengyu')!;
  const format = formatsForPreset(preset.id)[0];
  const langOptions = { frontLang: 'zh' as const, backLang: 'en' as const, reverse: false, backGlossLangs: [] };

  it('asks for Chinese items with pinyin', () => {
    const prompt = buildAiPromptPreview({
      mode: 'preset',
      preset,
      localizedFormat: format,
      langOptions,
      cardCount: 1,
      outputFormat: 'anki',
      templateFront: format.cardTemplates[0].front,
      templateBack: format.cardTemplates[0].back,
      targetLang: 'zh',
      wordCount: 5,
    });
    expect(prompt).toContain('Chinese (Mandarin) items');
    expect(prompt).toContain('pinyin with tone marks');
  });

  it('previews a Chinese sample card, not 勉強する', () => {
    const values = buildAiFormatSampleValues(preset.id, langOptions, 'zh');
    expect(values.expression).toBe('画蛇添足');
    expect(values.reading).toMatch(/huà/);
    expect(buildAiFormatSampleValues('zh-hsk-core', langOptions, 'zh').expression).toBe('学习');
    expect(buildAiFormatSampleValues('idiom-slang', undefined, 'ja').expression).toBe('猫の手も借りたい');
  });
});

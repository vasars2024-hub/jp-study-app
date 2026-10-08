/**
 * The machine-translation track label is written in main, and main has its own `mt()`.
 * It used to be an English template literal, so a Japanese, Chinese or Russian UI showed
 * "EN · machine translation of …" in the track picker.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { translate } from '../../shared/i18n/core';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';

const source = readFileSync(resolve(__dirname, '../subtitleDiscoveryAuto.ts'), 'utf8');

describe('machine-translation track label', () => {
  it('goes through the main-process translator, not an English literal', () => {
    expect(source).toContain("mt('studyLoop2.subtitle.machineTranslationOf'");
    expect(source).not.toMatch(/`[^`]*machine translation of/);
  });

  it('renders in the interface language with both languages filled in', () => {
    const vars = { lang: 'EN', source: 'Show.E01.ja.srt' };
    expect(translate('studyLoop2.subtitle.machineTranslationOf', vars, { lang: 'en', catalog: en, fallback: en }))
      .toBe('EN · machine translation of Show.E01.ja.srt');
    const japanese = translate('studyLoop2.subtitle.machineTranslationOf', vars, { lang: 'ja', catalog: ja, fallback: en });
    expect(japanese).toContain('機械翻訳');
    expect(japanese).toContain('Show.E01.ja.srt');
  });
});

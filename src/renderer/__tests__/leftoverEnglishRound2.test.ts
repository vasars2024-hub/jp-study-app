/**
 * V12: English that showed in the Japanese and Russian UI — the Immersion
 * starter names ("Wikipedia JP") and the Library's "Inbox" folder.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { IMMERSION_STARTERS } from '../../shared/immersion';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

describe('Immersion starters', () => {
  it('name every translatable destination through the catalogue', () => {
    const keyed = IMMERSION_STARTERS.filter((s) => s.labelKey);
    expect(keyed.map((s) => s.label)).toContain('Japanese Wikipedia');
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      for (const s of keyed) expect(typeof cat[s.labelKey!], `${lang}:${s.labelKey}`).toBe('string');
    }
    expect((CATALOGS.ja as Record<string, string>)['immersion.starter.wikipediaJa']).not.toMatch(/Wikipedia JP/);
  });
});

describe('Library Inbox folder', () => {
  it('is shown by its translated name wherever a folder name is printed', () => {
    const src = readFileSync(path.join(__dirname, '..', 'views', 'LibraryView.tsx'), 'utf8');
    expect(src).toContain("f === INBOX_FOLDER ? t('library.toolbar.inbox') : f");
    expect(src).not.toMatch(/>\s*\{f\}\s*</);
    expect(src).not.toMatch(/\{ name: f[ ,}]/);
  });
});

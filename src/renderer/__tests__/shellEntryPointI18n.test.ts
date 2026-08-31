import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const desktopSource = readFileSync(
  resolve(__dirname, '..', 'components', 'DesktopShell.tsx'),
  'utf8',
).replace(/\r\n?/g, '\n');
const paletteSource = readFileSync(
  resolve(__dirname, '..', 'components', 'CommandPalette.tsx'),
  'utf8',
).replace(/\r\n?/g, '\n');

const keys = [
  'desktop.context.newNote',
  'desktop.context.newShortcut',
  'desktop.context.widgets',
  'desktop.context.personalize',
  'desktop.context.displaySettings',
  'palette.toolboxPlaceholder',
] as const;

describe('shared shell entry-point localization', () => {
  it('routes desktop context actions and the Toolbox prompt through shared keys', () => {
    for (const key of keys.slice(0, 5)) {
      expect(desktopSource).toContain(`t('${key}')`);
    }
    expect(paletteSource).toContain("t('palette.toolboxPlaceholder')");

    expect(desktopSource).not.toMatch(/label:\s*['"](?:New sticky note|New app shortcut|Widgets…|Personalize…|Desktop & display settings)/);
    expect(paletteSource).not.toContain("? 'Search Toolbox commands'");
  });

  it('keeps every new key complete and genuinely localized in all four catalogs', () => {
    for (const key of keys) {
      const english = en[key];
      expect(english).toBeTruthy();
      for (const catalog of [ja, zh, ru]) {
        expect(catalog[key]).toBeTruthy();
        expect(catalog[key]).not.toBe(english);
      }
    }
  });
});

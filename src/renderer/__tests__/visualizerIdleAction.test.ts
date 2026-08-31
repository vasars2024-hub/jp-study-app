import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const content = readFileSync(
  resolve(__dirname, '..', 'components', 'visualizer', 'VisualizerContent.tsx'),
  'utf8',
);
const section = readFileSync(resolve(__dirname, '..', 'components', 'AppSection.tsx'), 'utf8');

describe('Visualizer idle recovery action', () => {
  it('uses the shared localized Music command and a real Study OS navigation action', () => {
    expect(content).toContain("t('commands.nav.open.music')");
    expect(content).not.toContain('play a song in Music');
    expect(content).toMatch(/onOpenMusic\s*\?\s*<button[^>]*onClick=\{onOpenMusic\}/);
    expect(section).toContain("new CustomEvent('os:open', { detail: 'music' })");
  });

  it('keeps the reused label complete in every shared locale', () => {
    const key = 'commands.nav.open.music' as const;
    for (const catalog of [en, ja, zh, ru]) expect(catalog[key]).toBeTruthy();
  });
});

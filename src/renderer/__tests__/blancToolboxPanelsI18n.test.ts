/**
 * Blanc round 2, part 2: the Toolbox's own panels (calculator, units, timer,
 * system monitor, notes, file search, hash, image, theme and launcher order,
 * lockscreen, Mono Blocks) read the catalogue, and the Blanc window reopens at
 * its remembered size.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { BLANC_UI_EN } from '../../shared/i18n/blancUi/en';

const shell = readFileSync(path.join(__dirname, '..', 'components', 'blanc', 'BlancShell.tsx'), 'utf8');

describe('Blanc Toolbox panels', () => {
  it('print none of the English they used to', () => {
    for (const literal of [
      '>Countdown<',
      'Offline basic arithmetic only',
      'Choose or paste a folder path',
      'Copy hash</button>',
      'Clear customisations\n',
      '`Move ${entry?.label ?? id} up`',
      'Game over. Press Restart.',
      "setError('Wrong PIN')",
      '<span>{module.category} / {module.status}</span>',
      '<td>{definition.id}</td>',
    ]) {
      expect(shell, literal).not.toContain(literal);
    }
  });

  it('has every blanc.tb / blanc.unit key in all four languages', () => {
    const keys = Object.keys(BLANC_UI_EN).filter((k) => k.startsWith('blanc.tb.') || k.startsWith('blanc.unit.'));
    expect(keys.length).toBeGreaterThan(200);
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      expect(keys.filter((k) => cat[k] === undefined), lang).toEqual([]);
    }
  });

  it('uses the UI language for dates on the lockscreen and in file search', () => {
    expect(shell).not.toMatch(/toLocale(Date|Time)?String\(\[\]/);
  });
});

describe('Blanc window size', () => {
  it('every opener goes through blancOpenSize, which omits the size when it is remembered', () => {
    const app = readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(app).toContain('window.api.blancOpen(blancOpenSize())');
    expect(app).not.toContain('blancOpen({ width: 560, height: 460 })');
    const mode = readFileSync(path.join(__dirname, '..', 'blancMode.ts'), 'utf8');
    expect(mode).toMatch(/rememberWindowBounds \? undefined : \{ width: 560, height: 460 \}/);
  });
});

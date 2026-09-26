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

describe('Blanc audio mining, Automation Builder and Notebook', () => {
  const native = readFileSync(path.join(__dirname, '..', 'components', 'blanc', 'BlancStudyNativePanels.tsx'), 'utf8');
  const notebook = readFileSync(path.join(__dirname, '..', 'components', 'notebook', 'NotebookContent.tsx'), 'utf8');

  it('the audio-mining panel reads the catalogue', () => {
    for (const literal of ["'Japanese' : 'Chinese'", '<legend>Model</legend>', 'Choose a file to get started.']) {
      expect(native, literal).not.toContain(literal);
    }
  });

  it('the Automation Builder shows its roadmap notes to developers only', () => {
    expect(shell).not.toContain('<legend>Migration</legend>');
    expect(shell).toMatch(/\{developerTools && \(\s*<ul className="blanc-plain-list">\s*\{AUTOMATION_BUILDER\.migrationNotes/);
  });

  it('the Notebook refreshes on changes and names its own folders in the UI language', () => {
    expect(notebook).toContain('onDeckChanged(bump)');
    expect(notebook).toContain('[sources, tick]');
    expect(notebook).toContain('notebookFolderLabel(f.label, t)');
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      expect(typeof (CATALOGS[lang] as Record<string, unknown>)['notebook.folder.planToRead'], lang).toBe('string');
    }
  });
});

describe('Blanc settings toggles', () => {
  it('Advanced and Dark live in Settings only, not also in the header', () => {
    expect(shell).not.toContain('patchAdvanced(event.target.checked)');
    expect(shell).not.toContain('patchDark(event.target.checked)');
    expect(shell).toContain('onPatch(setBlancAdvanced(event.target.checked))');
  });

  it('the calculator, which cannot be turned off, is shown as locked rather than stuck', () => {
    expect(shell).toContain("disabled={module.id === 'calculator'}");
  });
});

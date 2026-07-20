import { describe, expect, it } from 'vitest';
import {
  TOOLBOX_MODULES,
  getToolboxModule,
  isToolboxModuleReady,
  listBlancToolboxModules,
  listReadyToolboxModules,
  listToolboxModules,
} from '../toolboxRegistry';

describe('toolbox registry', () => {
  it('uses unique module ids', () => {
    const ids = TOOLBOX_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes existing practical Blanc modules as ready', () => {
    const blancIds = listBlancToolboxModules().map((module) => module.id);

    expect(blancIds).toContain('clipboard');
    expect(blancIds).toContain('dictionary');
    expect(blancIds).toContain('media');
    expect(blancIds).toContain('flashcards');
    expect(blancIds).toContain('statistics');
    expect(blancIds).toContain('system-monitor');
    expect(blancIds).toContain('file-search');
    expect(blancIds).toContain('notification-center');
    expect(blancIds).toContain('difficulty-analyzer');
    expect(blancIds).toContain('immersion-tracker');
    expect(blancIds).toContain('frequency-explorer');
    expect(blancIds).toContain('subtitle-importer');
    expect(blancIds).toContain('context-search');
    expect(blancIds).toContain('kanji-inspector');
    expect(blancIds).toContain('youtube-library');
    expect(blancIds).toContain('batch-converter');
  });

  it('retired unknown-word-detector into difficulty-analyzer', () => {
    expect(TOOLBOX_MODULES.map((module) => module.id)).not.toContain('unknown-word-detector');
    expect(getToolboxModule('difficulty-analyzer')?.status).toBe('ready');
    expect(getToolboxModule('difficulty-analyzer')?.label).toBe('Level & Difficulty Checker');
  });

  it('keeps planned GitHub-friendly adapters out of the live Blanc tab', () => {
    expect(getToolboxModule('screen-recorder')?.externalAdapter.strategy).toBe('github-preferred');
    expect(isToolboxModuleReady('screen-recorder')).toBe(false);
    expect(listBlancToolboxModules().map((module) => module.id)).not.toContain('screen-recorder');
  });

  it('describes launch and migration contract for every module', () => {
    for (const module of TOOLBOX_MODULES) {
      expect(module.label).toBeTruthy();
      expect(module.capabilities.length).toBeGreaterThan(0);
      expect(module.launchContexts.length).toBeGreaterThan(0);
      expect(module.implementation).toBeTruthy();
      expect(module.externalAdapter.notes).toBeTruthy();
      expect(module.migrationNotes).toBeTruthy();
    }
  });

  it('can list ready modules by category and status', () => {
    expect(listReadyToolboxModules().every((module) => module.status === 'ready')).toBe(true);
    expect(listToolboxModules({ category: 'study', status: 'ready' }).length).toBeGreaterThan(0);
  });
});

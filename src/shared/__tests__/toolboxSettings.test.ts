import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOLBOX_SETTINGS,
  TOOLBOX_SETTING_DEFINITIONS,
  exportToolboxSettings,
  importToolboxSettings,
  resetToolboxSettingsSection,
  sanitizeToolboxSettings,
  searchToolboxSettingDefinitions,
} from '../toolboxSettings';

describe('toolbox settings schema', () => {
  it('sanitizes invalid persisted values', () => {
    const settings = sanitizeToolboxSettings({
      defaultTool: 'not-real',
      sidebarWidth: 999,
      maxRecentTools: -10,
      enabledTools: ['calculator', 'screen-recorder', 'calculator'],
      hiddenTools: ['calculator', 'dictionary'],
      density: 'huge',
    });

    expect(settings.defaultTool).toBe(DEFAULT_TOOLBOX_SETTINGS.defaultTool);
    expect(settings.sidebarWidth).toBe(320);
    expect(settings.maxRecentTools).toBe(0);
    expect(settings.enabledTools).toEqual(['calculator']);
    // The calculator is hideable like every other tool (it used to be exempt).
    expect(settings.hiddenTools).toEqual(['calculator', 'dictionary']);
    expect(settings.density).toBe(DEFAULT_TOOLBOX_SETTINGS.density);
  });

  it('opens on the dictionary by default — Blanc is study-first', () => {
    expect(DEFAULT_TOOLBOX_SETTINGS.defaultTool).toBe('dictionary');
  });

  it('lets launcher-wide preferences name Blanc-only tools, and only real ones', () => {
    // Hidden, order and the default tool apply to EVERY tool the launcher
    // shows. They used to be sanitised against the registry alone, so 13 Blanc
    // tools could not be hidden, reordered or made the default.
    const settings = sanitizeToolboxSettings({
      defaultTool: 'novels',
      hiddenTools: ['games', 'not-a-tool'],
      toolOrder: ['visual-novels', 'dictionary', 'nope'],
    });
    expect(settings.defaultTool).toBe('novels');
    expect(settings.hiddenTools).toEqual(['games']);
    expect(settings.toolOrder).toEqual(['visual-novels', 'dictionary']);
    // Enable/disable stays registry-only: a Blanc-only tool has no "not ready" state.
    expect(sanitizeToolboxSettings({ enabledTools: ['games', 'calculator'] }).enabledTools).toEqual(['calculator']);
  });

  it('resets one section without resetting all settings', () => {
    const custom = sanitizeToolboxSettings({
      density: 'spacious',
      restoreTabs: false,
      maxRecentTools: 2,
    });
    const reset = resetToolboxSettingsSection(custom, 'layout');

    expect(reset.density).toBe(DEFAULT_TOOLBOX_SETTINGS.density);
    expect(reset.maxRecentTools).toBe(DEFAULT_TOOLBOX_SETTINGS.maxRecentTools);
    expect(reset.restoreTabs).toBe(false);
  });

  it('imports and exports settings safely', () => {
    const exported = exportToolboxSettings({
      ...DEFAULT_TOOLBOX_SETTINGS,
      density: 'comfortable',
    }, '2026-01-01T00:00:00.000Z');
    const imported = importToolboxSettings(exported);

    expect(imported.ok).toBe(true);
    if (imported.ok) expect(imported.settings.density).toBe('comfortable');
    expect(importToolboxSettings('{bad json').ok).toBe(false);
  });

  it('searches setting definitions by id, category, and keywords', () => {
    expect(searchToolboxSettingDefinitions('sidebar').some((definition) => definition.id === 'sidebarWidth')).toBe(true);
    expect(searchToolboxSettingDefinitions('shortcut').some((definition) => definition.category === 'keyboard-shortcuts')).toBe(true);
  });

  it('drops unknown or stale keys instead of persisting them forever', () => {
    const settings = sanitizeToolboxSettings({
      density: 'spacious',
      openMode: 'separate-window',
      pinnedTools: ['calculator'],
      totallyUnknownKey: true,
    });

    expect(settings.density).toBe('spacious');
    expect('openMode' in settings).toBe(false);
    expect('pinnedTools' in settings).toBe(false);
    expect('totallyUnknownKey' in settings).toBe(false);
  });

  it('ignores values whose type does not match the schema', () => {
    const settings = sanitizeToolboxSettings({ showTooltips: 'yes', restoreTabs: false });

    expect(settings.showTooltips).toBe(DEFAULT_TOOLBOX_SETTINGS.showTooltips);
    expect(settings.restoreTabs).toBe(false);
  });

  it('has a definition entry for every settings key (no dead toggles)', () => {
    const defined = new Set(TOOLBOX_SETTING_DEFINITIONS.map((definition) => definition.id as string));
    for (const key of Object.keys(DEFAULT_TOOLBOX_SETTINGS)) {
      if (key === 'version') continue;
      expect(defined.has(key), `settings key "${key}" has no definition`).toBe(true);
    }
  });
});

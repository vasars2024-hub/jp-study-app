import { describe, expect, it } from 'vitest';
import {
  TOOLBOX_SHORTCUT_COMMANDS,
  exportToolboxShortcutMappings,
  findToolboxShortcutConflicts,
  generateToolboxShortcutMarkdown,
  getToolboxCommandsForFeature,
  importToolboxShortcutMappings,
  isShortcutReserved,
  migrateToolboxShortcutMappings,
  normalizeShortcutLabel,
  validateToolboxShortcutRegistry,
} from '../toolboxShortcuts';

describe('toolbox shortcut registry', () => {
  it('uses unique command ids and non-conflicting defaults', () => {
    const validation = validateToolboxShortcutRegistry(TOOLBOX_SHORTCUT_COMMANDS.map((command) => command.id));

    expect(validation.duplicateCommandIds).toEqual([]);
    expect(validation.conflicts).toEqual([]);
    expect(validation.documentedMissingCommands).toEqual([]);
    expect(validation.undocumentedCommands).toEqual([]);
    expect(validation.missingReadyFeatureCommands).toEqual([]);
    expect(validation.ok).toBe(true);
  });

  it('normalizes shortcuts and rejects reserved combinations', () => {
    expect(normalizeShortcutLabel('control + shift + p')).toBe('Ctrl+Shift+P');
    expect(normalizeShortcutLabel('cmd+k|alt+1')).toBe('Meta+K|Alt+1');
    expect(isShortcutReserved('Alt+F4')).toBe(true);
    expect(isShortcutReserved('Ctrl+Alt+B')).toBe(false);
  });

  it('detects same-scope conflicts', () => {
    const [first, second] = TOOLBOX_SHORTCUT_COMMANDS.slice(0, 2).map((command) => ({
      ...command,
      defaultShortcut: 'Ctrl+J',
      scope: 'toolbox' as const,
    }));

    expect(findToolboxShortcutConflicts([first, second])).toEqual([
      { shortcut: 'Ctrl+J', scope: 'toolbox', commandIds: [first.id, second.id] },
    ]);
  });

  it('imports and exports user mappings safely', () => {
    const exported = exportToolboxShortcutMappings({
      'toolbox.open': 'control+alt+b',
      'missing.command': 'Ctrl+M',
    }, '2026-01-01T00:00:00.000Z');
    const imported = importToolboxShortcutMappings(exported);

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.mappings).toEqual({ 'toolbox.open': 'Ctrl+Alt+B' });
    }
    expect(importToolboxShortcutMappings(JSON.stringify({
      version: 1,
      mappings: { 'toolbox.open': 'Alt+F4' },
    })).ok).toBe(false);
  });

  it('migrates early Toolbox command ids during import', () => {
    expect(migrateToolboxShortcutMappings({
      'toolbox.openStats': 'Alt+8',
      'toolbox.openSearch': 'Alt+9',
      'toolbox.open': 'Ctrl+Alt+B',
    })).toEqual({
      'toolbox.openStatistics': 'Alt+8',
      'toolbox.openFileSearch': 'Alt+9',
      'toolbox.open': 'Ctrl+Alt+B',
    });

    const imported = importToolboxShortcutMappings(JSON.stringify({
      version: 1,
      mappings: { 'toolbox.openEpubMiner': 'ctrl+shift+e' },
    }));

    expect(imported.ok).toBe(true);
    if (imported.ok) {
      expect(imported.mappings).toEqual({ 'toolbox.openEpubMining': 'Ctrl+Shift+E' });
    }
  });

  it('generates documentation from the registry', () => {
    const markdown = generateToolboxShortcutMarkdown();

    expect(markdown).toContain('# Toolbox Shortcuts');
    expect(markdown).toContain('`toolbox.open`');
    expect(markdown).toContain('Default shortcut');
    expect(getToolboxCommandsForFeature('focus-timer').map((command) => command.id)).toContain('focusTimer.startPause');
  });
});

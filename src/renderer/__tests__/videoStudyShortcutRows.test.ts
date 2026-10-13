// @vitest-environment jsdom
/**
 * Video study round 2 added "Previous / next line starts now" and "Condensed audio" to the
 * player with no shortcut rows: nothing to rebind in Settings › Shortcuts and nothing in the
 * player's "?" help. They are catalog rows now, registered by the study overlay.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

import { COMMAND_CATALOG, getBindings, splitChords } from '../keyboardShortcuts';
import { commandLabel } from '../commandI18n';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { studyKeyHelpRows } from '../../media/studyKeyHelp';

const NEW_ROWS = {
  'video.alignPrevLine': 'Shift+W',
  'video.alignNextLine': 'Shift+S',
  'video.condensedAudio': '',
} as const;

describe('video study round-2 shortcut rows', () => {
  it('are Video rows with their defaults, listed in Settings › Shortcuts', () => {
    const bindings = getBindings();
    for (const [id, keys] of Object.entries(NEW_ROWS)) {
      const row = COMMAND_CATALOG.find((command) => command.id === id);
      expect(row, id).toBeDefined();
      expect(row?.category).toBe('Video');
      expect(row?.defaultKeys).toBe(keys);
      expect(bindings.find((binding) => binding.id === id)?.keys).toBe(keys);
    }
  });

  it('do not take a chord any other built-in command defaults to', () => {
    for (const [id, keys] of Object.entries(NEW_ROWS)) {
      if (!keys) continue;
      const clash = COMMAND_CATALOG
        .filter((command) => command.id !== id)
        .filter((command) => splitChords(command.defaultKeys).includes(keys))
        .map((command) => command.id);
      expect(clash, id).toEqual([]);
    }
  });

  it('are in the player keyboard help, bound or not', () => {
    const ids = studyKeyHelpRows(getBindings()).map((row) => row.id);
    for (const id of Object.keys(NEW_ROWS)) expect(ids).toContain(id);
  });

  it('have a label and a note in every UI language', () => {
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const catalog = CATALOGS[lang] as Record<string, string>;
      const t = (key: string): string => catalog[key] ?? key;
      for (const id of Object.keys(NEW_ROWS)) {
        expect(commandLabel(id, '', t), `${lang}:${id}`).not.toBe('');
        expect(typeof catalog[`cmd.note.${id}`], `${lang}:${id} note`).toBe('string');
      }
    }
  });

  it('are registered by the study overlay against the same handlers as its buttons', () => {
    const overlay = readFileSync(resolve(__dirname, '../../media/VideoCoreStudyOverlay.tsx'), 'utf8');
    expect(overlay).toMatch(/registerCommandHandler\('video\.alignPrevLine', \(\) => alignLineToNow\('previous'\)\)/);
    expect(overlay).toMatch(/registerCommandHandler\('video\.alignNextLine', \(\) => alignLineToNow\('next'\)\)/);
    expect(overlay).toMatch(/registerCommandHandler\('video\.condensedAudio', \(\) => makeCondensedAudio\(\)\)/);
  });
});

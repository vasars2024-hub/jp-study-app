// @vitest-environment jsdom
/**
 * V5 notes: the explanation under each command in Settings > Shortcuts was
 * English in every language (no cmd.note.* key existed). Every built-in note,
 * including the Toolbox's description + scope, now resolves in each language.
 */
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

import { COMMAND_CATALOG } from '../keyboardShortcuts';
import { commandNote, commandNoteKey } from '../commandI18n';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import { TOOLBOX_SHORTCUT_COMMANDS } from '../../shared/toolboxShortcuts';

const withNotes = COMMAND_CATALOG.filter((c) => typeof c.note === 'string' && c.note.length > 0);

describe('command notes', () => {
  for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
    it(`every built-in note has a ${lang} translation`, () => {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      expect(withNotes.filter((c) => typeof cat[commandNoteKey(c.id)] !== 'string').map((c) => c.id)).toEqual([]);
      for (const scope of new Set(TOOLBOX_SHORTCUT_COMMANDS.map((c) => c.scope))) {
        expect(typeof cat[`shortcut.scope.${scope}`], `${lang}:${scope}`).toBe('string');
      }
    });
  }

  it('the English key says what the catalog note says (non-Toolbox commands)', () => {
    const en = CATALOGS.en as Record<string, string>;
    const drift = withNotes
      .filter((c) => c.category !== 'Toolbox' && en[commandNoteKey(c.id)] !== c.note)
      .map((c) => c.id);
    expect(drift).toEqual([]);
  });

  it('a Toolbox note is its description plus the translated scope', () => {
    const ru = CATALOGS.ru as Record<string, string>;
    const t = (key: string) => ru[key] ?? key;
    const cmd = TOOLBOX_SHORTCUT_COMMANDS.find((c) => c.id === 'toolbox.search')!;
    const note = commandNote(cmd.id, `${cmd.description} Scope: ${cmd.scope}.`, t, cmd.scope);
    expect(note).toBe(`${ru['cmd.note.toolbox.search']} ${ru[`shortcut.scope.${cmd.scope}`]}`);
    expect(note).not.toMatch(/Scope:/);
  });
});

// @vitest-environment jsdom
/**
 * V5: every built-in command (the shortcut catalog and the Toolbox's) has a translated
 * label in every UI language. 78 of them had none, so the palette and Settings >
 * Shortcuts printed English in a Japanese, Chinese or Russian UI.
 */
import { describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

import { COMMAND_CATALOG } from '../keyboardShortcuts';
import { commandLabel, commandLabelKeys } from '../commandI18n';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

describe('command labels', () => {
  for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
    it(`every built-in command has a ${lang} label`, () => {
      const catalog = CATALOGS[lang] as Record<string, unknown>;
      const missing = COMMAND_CATALOG.filter((c) => !commandLabelKeys(c.id).some((key) => typeof catalog[key] === 'string'))
        .map((c) => c.id);
      expect(missing).toEqual([]);
    });
  }

  it('resolves the second-generation key when the first does not exist', () => {
    const ru = CATALOGS.ru as Record<string, string>;
    const t = (key: string): string => ru[key] ?? key;
    expect(commandLabel('video.replayLine', 'Replay subtitle line', t)).toBe('Повторить строку субтитров');
  });
});

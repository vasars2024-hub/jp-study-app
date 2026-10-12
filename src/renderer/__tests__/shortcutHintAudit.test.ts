// @vitest-environment jsdom
/**
 * kbd5 — every tooltip, hint or note that names a rebindable command's key now
 * reads the live binding. The audit found the strings below hard-coding a
 * chord; four of them were wrong out of the box (the default had moved and the
 * text had not). This pins: none of them carries a chord any more, the
 * placeholder is in every language, and the text follows a rebind.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

import { CATALOGS } from '../../shared/i18n/catalogs/all';
import * as ks from '../keyboardShortcuts';
import { NOTE_KEY_REFS, keysOrUnset, shortcutKeys, withShortcut } from '../shortcutHints';
import { commandNote } from '../commandI18n';

const LANGS = ['en', 'ja', 'zh', 'ru'] as const;
const CHORD = /\b(Ctrl|Alt|Shift|Meta|Win)\+\S/;

/** UI strings whose chord moved out of the text and into `withShortcut` / `{keys}`. */
const AUDITED_UI_KEYS = [
  'novel.reader.collectShortcut',
  'perf.hint',
  'focus.exitHint',
  'focus.settings.shortcutHint',
  'desktop.clipboardHistory',
  'manga.translate.toggleVisibility',
  'epub.translate.toggleVisibility',
  'immersion.saveSite',
  'immersion.hint',
  'flash.undoRating.hint',
  'blanc.shell.searchTitle',
];

beforeEach(() => {
  localStorage.clear();
  ks.resetAllBindings();
});

describe('hard-coded key hints', () => {
  it('no audited string carries a chord in any language', () => {
    const offenders: string[] = [];
    const keys = [...AUDITED_UI_KEYS, ...Object.keys(NOTE_KEY_REFS).map((id) => `cmd.note.${id}`)];
    for (const lang of LANGS) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      for (const key of keys) {
        const value = cat[key];
        if (typeof value !== 'string') offenders.push(`${lang}:${key} missing`);
        else if (CHORD.test(value)) offenders.push(`${lang}:${key} = ${value}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every note that names another command keeps its {keys} placeholder in every language', () => {
    for (const lang of LANGS) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      for (const id of Object.keys(NOTE_KEY_REFS)) {
        expect(String(cat[`cmd.note.${id}`]), `${lang}:${id}`).toContain('{keys}');
      }
    }
  });

  it('every referenced command exists', () => {
    const ids = new Set(ks.COMMAND_CATALOG.map((c) => c.id));
    for (const [id, ref] of Object.entries(NOTE_KEY_REFS)) {
      expect(ids.has(id), id).toBe(true);
      expect(ids.has(ref), ref).toBe(true);
    }
  });
});

describe('hints follow the keymap', () => {
  it('withShortcut appends the live binding and drops it when unbound', () => {
    expect(withShortcut('Clipboard history', 'clipboard.open')).toBe('Clipboard history (Ctrl+Alt+Shift+V)');
    ks.setBinding('clipboard.open', 'Ctrl+Alt+Y');
    expect(withShortcut('Clipboard history', 'clipboard.open')).toBe('Clipboard history (Ctrl+Alt+Y)');
    ks.setBinding('clipboard.open', '');
    expect(withShortcut('Clipboard history', 'clipboard.open')).toBe('Clipboard history');
    expect(keysOrUnset('clipboard.open')).toBe('no key set');
  });

  it('a command note names the other command\'s current keys', () => {
    const t = (key: string) => (CATALOGS.en as Record<string, string>)[key] ?? key;
    const palette = ks.COMMAND_CATALOG.find((c) => c.id === 'nav.palette')!;
    expect(commandNote(palette.id, palette.note, t)).toBe('Ctrl+P opens the same palette in search mode.');
    ks.setBinding('nav.search', 'Ctrl+Alt+Shift+P');
    expect(commandNote(palette.id, palette.note, t)).toBe('Ctrl+Alt+Shift+P opens the same palette in search mode.');
    expect(shortcutKeys('nav.search')).toBe('Ctrl+Alt+Shift+P');
  });

  it('the hints that were wrong out of the box now say the real default', () => {
    // Each pair: the command the hint is about, and the chord the stale text claimed.
    const stale: Array<[string, string]> = [
      ['reader.toggleTranslation', 'Ctrl+Shift+T'],
      ['immersion.bookmark', 'Ctrl+D'],
      ['perf.toggleOverlay', 'Ctrl+Shift+F'],
      ['reader.saveToCollection', 'Ctrl+Shift+S'],
    ];
    for (const [id, claimed] of stale) expect(shortcutKeys(id), id).not.toBe(claimed);
  });

  it('the perf HUD no longer listens for the reader\'s Ctrl+Shift+F itself', () => {
    const source = readFileSync(resolve(__dirname, '../components/PerfOverlay.tsx'), 'utf8');
    expect(source).not.toMatch(/addEventListener\('keydown'/);
    expect(source).toMatch(/registerCommandHandler\('perf\.toggleOverlay'/);
  });
});

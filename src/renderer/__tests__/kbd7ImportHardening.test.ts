// @vitest-environment jsdom
/**
 * kbd7 — a damaged keymap can no longer stop Gum from starting.
 *
 * Measured before this fix: importing a keymap whose custom command was
 * `{ action: { type: 'runCommands' } }` (no `commandIds`) passed the import's only check
 * ("has an action"), was written to localStorage, and THEN threw from
 * `describeCustomAction` while announcing the change — so the import reported a raw
 * English `TypeError` while the bad data stayed saved. On the next launch `loadStore`
 * kept it too, `installKeyboardShortcuts()` threw at the top level of `main.tsx` /
 * `blancMain.tsx`, and the window never rendered. A custom command without
 * `defaultKeys` threw from `effectiveKeys` the same way.
 *
 * Pinned here:
 * - one validator covers every `CustomAction` type and the command's own fields;
 * - an import is all-or-nothing and its refusal is worded by the catalogs, not `err.message`;
 * - a store poisoned before launch still boots, with the bad entries dropped and backed up;
 * - the readers survive a bad entry that slips past the gate;
 * - `installKeyboardShortcutsSafely` backs up, resets only the shortcut store, retries and
 *   posts a translated notice;
 * - a held key (`e.repeat`) is one step, both in "Record a sequence" and "Find by keys".
 */
import { act, createElement, type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, click, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';
import { PRODUCT5_UI_EN } from '../../shared/i18n/product5Ui/en';
import { PRODUCT5_UI_JA } from '../../shared/i18n/product5Ui/ja';
import { PRODUCT5_UI_RU } from '../../shared/i18n/product5Ui/ru';
import { PRODUCT5_UI_ZH } from '../../shared/i18n/product5Ui/zh';
import type { CustomAction } from '../keyboardShortcuts';

type KS = typeof import('../keyboardShortcuts');
type KE = typeof import('../keymapEditor');

const KEY = 'jp-shortcuts-v1';
const BACKUP_KEY = 'jp-shortcuts-backup-v1';
const PLAYER_KEY = 'sea-video-core-keybindings';
/** A little over the editor's 1200 ms step pause. */
const PAUSE = 1350;

const BAD_STACK = { id: 'custom.bad', label: 'Bad', defaultKeys: 'Ctrl+Alt+Shift+B', action: { type: 'runCommands' } };
const NO_KEYS = { id: 'custom.nokeys', label: 'No keys', action: { type: 'openApp', appId: 'music' } };
const GOOD = { id: 'custom.good', label: 'Good', defaultKeys: 'Ctrl+Alt+Shift+G', action: { type: 'openApp', appId: 'music' } };

installJsdomShims();

/** One renderer boot over whatever localStorage holds now: fresh module graph. */
async function boot(): Promise<{ ks: KS; ke: KE }> {
  vi.resetModules();
  stubBridge({});
  const ks = await import('../keyboardShortcuts');
  const ke = await import('../keymapEditor');
  return { ks, ke };
}

const disposers: (() => void)[] = [];

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  while (disposers.length) (disposers.pop() as () => void)();
  await cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the custom command validator', () => {
  /** Valid and invalid shapes for EVERY action type; the Record makes a new type a type error here. */
  const CASES: Record<CustomAction['type'], { ok: unknown[]; bad: unknown[] }> = {
    openApp: {
      ok: [{ type: 'openApp', appId: 'music' }],
      bad: [{ type: 'openApp' }, { type: 'openApp', appId: '' }, { type: 'openApp', appId: 7 }],
    },
    runCommand: {
      ok: [{ type: 'runCommand', commandId: 'nav.palette' }],
      bad: [{ type: 'runCommand' }, { type: 'runCommand', commandId: '  ' }, { type: 'runCommand', commandId: ['nav.palette'] }],
    },
    runCommands: {
      ok: [{ type: 'runCommands', commandIds: [] }, { type: 'runCommands', commandIds: ['nav.palette', 'nav.search'] }],
      bad: [
        { type: 'runCommands' },
        { type: 'runCommands', commandIds: 'nav.palette' },
        { type: 'runCommands', commandIds: ['nav.palette', 3] },
        { type: 'runCommands', commandIds: null },
      ],
    },
    dispatch: {
      ok: [{ type: 'dispatch', event: 'os:widgets' }, { type: 'dispatch', event: 'os:open', detail: 'music' }],
      bad: [{ type: 'dispatch' }, { type: 'dispatch', event: '' }, { type: 'dispatch', event: 'os:open', detail: 5 }],
    },
  };

  it('accepts every well-formed action type and refuses every malformed one', async () => {
    const { ks } = await boot();
    for (const [type, { ok, bad }] of Object.entries(CASES)) {
      for (const action of ok) expect(ks.customActionProblem(action), `${type} ok ${JSON.stringify(action)}`).toBeNull();
      for (const action of bad) expect(ks.customActionProblem(action), `${type} bad ${JSON.stringify(action)}`).not.toBeNull();
    }
  });

  it('refuses a missing or unknown action', async () => {
    const { ks } = await boot();
    for (const action of [undefined, null, 'openApp', [], {}, { type: 'launchMissiles' }, { type: 'toString' }]) {
      expect(ks.customActionProblem(action), JSON.stringify(action)).not.toBeNull();
    }
  });

  it('checks the command fields: id, label and a string defaultKeys', async () => {
    const { ks } = await boot();
    expect(ks.customCommandProblem(GOOD)).toBeNull();
    expect(ks.customCommandProblem({ ...GOOD, defaultKeys: '' })).toBeNull();
    expect(ks.customCommandProblem(NO_KEYS)).toBe('defaultKeys');
    expect(ks.customCommandProblem({ ...GOOD, defaultKeys: 5 })).toBe('defaultKeys');
    expect(ks.customCommandProblem({ ...GOOD, label: undefined })).toBe('label');
    expect(ks.customCommandProblem({ ...GOOD, id: '' })).toBe('id');
    expect(ks.customCommandProblem(BAD_STACK)).toBe('runCommands.commandIds');
    expect(ks.customCommandProblem(null)).not.toBeNull();
    expect(ks.isValidCustomCommand(GOOD)).toBe(true);
    expect(ks.isValidCustomCommand(BAD_STACK)).toBe(false);
  });
});

describe('importing a damaged keymap', () => {
  async function seeded() {
    const booted = await boot();
    booted.ks.setBinding('nav.widgets', 'Ctrl+Alt+Shift+W');
    const added = booted.ks.addCustomCommand({ label: 'Mine', keys: 'Ctrl+Alt+Shift+M', action: { type: 'openApp', appId: 'music' } });
    expect(added.ok).toBe(true);
    booted.ke.setEntryChords('player.mute', ['Y']);
    return { ...booted, raw: localStorage.getItem(KEY), player: localStorage.getItem(PLAYER_KEY) };
  }

  it('is refused whole: nothing is written, nothing is announced, nothing throws', async () => {
    const { ks, raw } = await seeded();
    const changed = vi.fn();
    const off = ks.onShortcutsChanged(changed);
    const res = ks.importShortcuts(
      JSON.stringify({
        active: 'Default',
        profiles: { Default: { 'nav.widgets': 'Ctrl+Alt+Shift+X' } },
        customCommands: [GOOD, BAD_STACK],
      }),
    );
    off();
    expect(res).toEqual({ ok: false, error: 'invalidCustom', label: 'Bad' });
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(changed).not.toHaveBeenCalled();
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Alt+Shift+W');
    expect(ks.listCustomCommands().map((c) => c.label)).toEqual(['Mine']);
    expect(() => ks.getBindings()).not.toThrow();
  });

  it('refuses a custom command without defaultKeys, and a customCommands that is not a list', async () => {
    const { ks, raw } = await seeded();
    expect(ks.importShortcuts(JSON.stringify({ profiles: { Default: {} }, customCommands: [NO_KEYS] }))).toEqual({
      ok: false,
      error: 'invalidCustom',
      label: 'No keys',
    });
    expect(ks.importShortcuts(JSON.stringify({ profiles: { Default: {} }, customCommands: { a: GOOD } }))).toEqual({
      ok: false,
      error: 'invalidCustom',
    });
    expect(localStorage.getItem(KEY)).toBe(raw);
  });

  it('reports codes, never English text', async () => {
    const { ks } = await seeded();
    expect(ks.importShortcuts('{nope')).toEqual({ ok: false, error: 'notJson' });
    expect(ks.importShortcuts('{"hello":1}')).toEqual({ ok: false, error: 'notShortcuts' });
  });

  it('through the keymap document: refused before the player keys are touched', async () => {
    const { ke, raw, player } = await seeded();
    const doc = JSON.parse(ke.exportKeymap()) as { shortcuts: { customCommands: unknown[] }; player: Record<string, unknown> };
    doc.shortcuts.customCommands = [BAD_STACK];
    doc.player = { mute: { key: 'KeyQ' } };
    expect(ke.importKeymap(JSON.stringify(doc))).toEqual({ ok: false, error: 'invalidCustom', detail: 'Bad' });
    expect(localStorage.getItem(KEY)).toBe(raw);
    expect(localStorage.getItem(PLAYER_KEY)).toBe(player);
    expect(ke.entryChords('player.mute')).toEqual(['Y']);
  });

  it('a good import still applies, and the next launch reads it back', async () => {
    const { ks } = await seeded();
    expect(ks.importShortcuts(JSON.stringify({ profiles: { Default: {} }, customCommands: [GOOD] }))).toEqual({ ok: true });
    const again = await boot();
    expect(again.ks.listCustomCommands().map((c) => c.id)).toEqual(['custom.good']);
    expect(again.ks.effectiveKeys('custom.good')).toBe('Ctrl+Alt+Shift+G');
  });
});

describe('a store poisoned before launch', () => {
  it('boots: bad entries are dropped with a warning, backed up, and the clean store is saved', async () => {
    const poisoned = JSON.stringify({
      active: 'Default',
      profiles: { Default: { 'nav.widgets': 'Ctrl+Alt+Shift+W', 'nav.search': 42 }, Broken: 'nope' },
      customCommands: [BAD_STACK, NO_KEYS, GOOD, null],
      defaultsVersion: 2,
    });
    localStorage.setItem(KEY, poisoned);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ks } = await boot();
    let dispose: () => void = () => undefined;
    expect(() => {
      dispose = ks.installKeyboardShortcuts();
    }).not.toThrow();
    disposers.push(dispose);
    expect(() => ks.getBindings()).not.toThrow();
    expect(ks.listCustomCommands().map((c) => c.id)).toEqual(['custom.good']);
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Alt+Shift+W');
    expect(ks.effectiveKeys('nav.search')).toBe('Ctrl+P');
    expect(ks.listShortcutProfiles().names).toEqual(['Default']);
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('dropped a damaged custom command'))).toHaveLength(3);
    expect(localStorage.getItem(BACKUP_KEY)).toBe(poisoned);
    const saved = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { customCommands: { id: string }[] };
    expect(saved.customCommands.map((c) => c.id)).toEqual(['custom.good']);
  });

  it('installKeyboardShortcutsSafely boots the exact store the audit found', async () => {
    localStorage.setItem(KEY, JSON.stringify({ active: 'Default', profiles: { Default: {} }, customCommands: [BAD_STACK] }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { ks } = await boot();
    let dispose: () => void = () => undefined;
    expect(() => {
      dispose = ks.installKeyboardShortcutsSafely();
    }).not.toThrow();
    disposers.push(dispose);
    expect(ks.listCustomCommands()).toEqual([]);
  });
});

describe('the readers survive a bad entry that slips past the gate', () => {
  it('a custom command that lost its defaultKeys reads as unbound', async () => {
    const { ks } = await boot();
    const added = ks.addCustomCommand({ label: 'Mine', keys: 'Ctrl+Alt+Shift+M', action: { type: 'openApp', appId: 'music' } });
    if (!added.ok) throw new Error('add failed');
    delete (ks.listCustomCommands()[0] as Partial<{ defaultKeys: string }>).defaultKeys;
    expect(() => ks.effectiveKeys(added.id)).not.toThrow();
    expect(ks.effectiveKeys(added.id)).toBe('');
    expect(() => ks.getBindings()).not.toThrow();
    expect(ks.normalizeChord(undefined as unknown as string)).toBe('');
  });

  it('a runCommands stack that lost its commandIds is described as nothing and runs as nothing', async () => {
    const { ks } = await boot();
    const added = ks.addCustomCommand({ label: 'Stack', keys: 'Ctrl+Alt+Shift+K', action: { type: 'runCommands', commandIds: ['nav.widgets'] } });
    if (!added.ok) throw new Error('add failed');
    (ks.listCustomCommands()[0] as { action: unknown }).action = { type: 'runCommands' };
    expect(() => ks.getBindings()).not.toThrow();
    expect(ks.getBindings().find((r) => r.id === added.id)?.note).toBe('');
    expect(() => ks.runCommand(added.id)).not.toThrow();
    expect(ks.runCommand(added.id)).toBe(false);
  });

  it('adding or editing a custom command never stores a malformed action', async () => {
    const { ks } = await boot();
    expect(ks.addCustomCommand({ label: 'X', action: { type: 'runCommands' } as unknown as CustomAction }).ok).toBe(false);
    const added = ks.addCustomCommand({ label: 'Y', action: { type: 'openApp', appId: 'music' } });
    if (!added.ok) throw new Error('add failed');
    ks.updateCustomCommand(added.id, { action: { type: 'dispatch' } as unknown as CustomAction });
    expect(ks.listCustomCommands()[0]?.action).toEqual({ type: 'openApp', appId: 'music' });
  });
});

describe('boot recovery (installKeyboardShortcutsSafely)', () => {
  let toasts: { message: string; kind: string }[] = [];
  const onToast = (e: Event): void => {
    toasts.push((e as CustomEvent<{ message: string; kind: string }>).detail);
  };
  beforeEach(() => {
    toasts = [];
    window.addEventListener('os:toast', onToast);
  });
  afterEach(() => {
    window.removeEventListener('os:toast', onToast);
  });

  /** A store this build cannot read, whatever the reason: reading a custom id throws. */
  function poisonInMemory(ks: KS): void {
    const first = ks.listCustomCommands()[0];
    if (!first) throw new Error('nothing to poison');
    Object.defineProperty(first, 'id', {
      get() {
        throw new Error('unreadable');
      },
    });
  }

  it('backs up and resets only the shortcut store, installs once, and posts a translated notice', async () => {
    localStorage.setItem('ui-lang', 'ja');
    localStorage.setItem('jp-unrelated-setting', 'keep me');
    localStorage.setItem(KEY, JSON.stringify({ active: 'Default', profiles: { Default: { 'nav.widgets': 'Ctrl+Alt+Shift+W' } }, customCommands: [GOOD], defaultsVersion: 2 }));
    const before = localStorage.getItem(KEY);
    const { ks } = await boot();
    const i18n = await import('../i18n');
    await i18n.initI18n();
    const notifications = await import('../notificationStore');
    poisonInMemory(ks);
    expect(() => ks.installKeyboardShortcuts()).toThrow('unreadable');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const dispose = ks.installKeyboardShortcutsSafely();
    disposers.push(dispose);
    expect(error).toHaveBeenCalled();
    expect(localStorage.getItem(BACKUP_KEY)).toBe(before);
    expect(localStorage.getItem('jp-unrelated-setting')).toBe('keep me');
    expect(ks.listCustomCommands()).toEqual([]);
    expect(ks.effectiveKeys('nav.widgets')).toBe('');

    // Listeners exist exactly once: Ctrl+K opens the palette once.
    const palette = vi.fn();
    window.addEventListener('palette:open', palette);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }));
    window.removeEventListener('palette:open', palette);
    expect(palette).toHaveBeenCalledTimes(1);

    const expected = PRODUCT5_UI_JA['kbd7.boot.storeReset'];
    await vi.waitFor(() => {
      expect(notifications.getNotifications().find((n) => n.clientId === ks.SHORTCUTS_RESET_NOTICE_ID)?.message).toBe(expected);
    });
    await vi.waitFor(() => expect(toasts.map((x) => x.message)).toEqual([expected]), { timeout: 5000 });
  });

  it('never throws, even when the defaults cannot install', async () => {
    const { ks } = await boot();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(window, 'addEventListener').mockImplementation(() => {
      throw new Error('no listeners here');
    });
    let dispose: (() => void) | null = null;
    expect(() => {
      dispose = ks.installKeyboardShortcutsSafely();
    }).not.toThrow();
    vi.restoreAllMocks();
    expect(typeof dispose).toBe('function');
  });
});

describe('the import error is translated', () => {
  const KEYS = ['kbd7.import.invalidCustom', 'kbd7.import.invalidCustomNamed', 'kbd7.import.saveFailed', 'kbd7.boot.storeReset'];

  it('every kbd7 string exists in en/ja/zh/ru and is not English outside en', () => {
    for (const key of KEYS) {
      const en = PRODUCT5_UI_EN[key];
      expect(typeof en, key).toBe('string');
      for (const cat of [PRODUCT5_UI_JA, PRODUCT5_UI_ZH, PRODUCT5_UI_RU]) {
        expect(typeof cat[key], key).toBe('string');
        expect(cat[key], key).not.toBe(en);
      }
    }
    for (const cat of [PRODUCT5_UI_EN, PRODUCT5_UI_JA, PRODUCT5_UI_ZH, PRODUCT5_UI_RU]) {
      expect(cat['kbd7.import.invalidCustomNamed']).toContain('{name}');
    }
  });

  async function importThroughSettings(lang: 'en' | 'ja'): Promise<{ text: string; t: (k: string, v?: Record<string, unknown>) => string; ks: KS }> {
    localStorage.setItem('ui-lang', lang);
    const { ks } = await boot();
    const i18n = await import('../i18n');
    await i18n.initI18n();
    const Settings = (await import('../components/ShortcutSettings')).default as (p: { embedded?: boolean }) => ReactElement;
    const { host } = await mount(createElement(Settings, { embedded: true }));
    const t = i18n.t as (k: string, v?: Record<string, unknown>) => string;
    const importBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === t('settings.shortcuts.import'));
    await click(importBtn);
    await typeInto(
      host.querySelector('.sc-import textarea') as HTMLTextAreaElement,
      JSON.stringify({ profiles: { Default: {} }, customCommands: [BAD_STACK] }),
    );
    await click(host.querySelector('.sc-import button'));
    return { text: host.querySelector('.sc-msg')?.textContent ?? '', t, ks };
  }

  it('in English: names the command and says nothing changed — no raw error message', async () => {
    const { text, t, ks } = await importThroughSettings('en');
    expect(text).toBe(
      t('settings.shortcuts.importFail', {
        error: t('kbd5.io.error.rejected', { detail: t('kbd7.import.invalidCustomNamed', { name: 'Bad' }) }),
      }),
    );
    expect(text).toContain('“Bad”');
    expect(text).not.toMatch(/TypeError|undefined|Cannot read|commandIds/);
    expect(localStorage.getItem(KEY) ?? '').not.toContain('custom.bad');
    expect(ks.listCustomCommands()).toEqual([]);
  });

  it('in Japanese: the same refusal, in Japanese', async () => {
    const { text } = await importThroughSettings('ja');
    expect(text).toContain(PRODUCT5_UI_JA['kbd7.import.invalidCustomNamed']?.toString().replace('{name}', 'Bad'));
    expect(text).not.toMatch(/TypeError|undefined|Cannot read|commandIds/);
  });
});

describe('a held key is one step in shortcut capture', () => {
  let ks: KS;
  let Settings: (p: { embedded?: boolean }) => ReactElement;

  beforeEach(async () => {
    ({ ks } = await boot());
    Settings = (await import('../components/ShortcutSettings')).default as typeof Settings;
  });

  async function press(init: KeyboardEventInit): Promise<void> {
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    });
  }

  async function openNavigation(host: ParentNode): Promise<void> {
    const toggle = host.querySelector<HTMLButtonElement>('[data-sc-toggle="Navigation"]');
    if (toggle?.getAttribute('aria-expanded') !== 'true') await click(toggle);
  }

  const F12 = { key: 'F12', code: 'F12', ctrlKey: true, shiftKey: true };

  it('Record a sequence: auto-repeat of the held first key is not a second step', async () => {
    const { host } = await mount(createElement(Settings, { embedded: true }));
    await click(host.querySelector('[data-sc-record-sequence]'));
    await openNavigation(host);
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press(F12);
    await press({ ...F12, repeat: true });
    await press({ ...F12, repeat: true });
    await press({ key: 'q', code: 'KeyQ' });
    await settle(PAUSE);
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Shift+F12 Q');
  });

  it('Record a sequence: holding one key and pausing records it once', async () => {
    const { host } = await mount(createElement(Settings, { embedded: true }));
    await click(host.querySelector('[data-sc-record-sequence]'));
    await openNavigation(host);
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press(F12);
    await press({ ...F12, repeat: true });
    await settle(PAUSE);
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Shift+F12');
  });

  it('single-chord capture: a repeat from a key held before capture started binds nothing', async () => {
    const { host } = await mount(createElement(Settings, { embedded: true }));
    await openNavigation(host);
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press({ ...F12, repeat: true });
    expect(ks.effectiveKeys('nav.widgets')).toBe('');
    await press(F12);
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Shift+F12');
  });

  it('Find by keys: a held chord is looked up once', async () => {
    const { host } = await mount(createElement(Settings, { embedded: true }));
    await click(host.querySelector('[data-sc-find-keys]'));
    await press({ key: 'p', code: 'KeyP', ctrlKey: true });
    await press({ key: 'p', code: 'KeyP', ctrlKey: true, repeat: true });
    await press({ key: 'p', code: 'KeyP', ctrlKey: true, repeat: true });
    expect(host.querySelector('[data-sc-key-filter]')?.getAttribute('data-sc-key-filter')).toBe('Ctrl+P');
  });
});

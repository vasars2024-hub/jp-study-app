// @vitest-environment jsdom
/**
 * kbd5 — Settings > Shortcuts as the unified editor, driven for real: capture a
 * chord that collides and settle it with swap / replace / keep; edit a custom
 * shortcut in place (D264); rebind the video player's own keys; the Chrome
 * extension card; search across every group.
 */
import { act, type ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, click, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';

type KS = typeof import('../keyboardShortcuts');
type KE = typeof import('../keymapEditor');

let ks: KS;
let ke: KE;
let ShortcutSettings: (props: { embedded?: boolean }) => ReactElement;

beforeAll(async () => {
  installJsdomShims();
  stubBridge({});
  ks = await import('../keyboardShortcuts');
  ke = await import('../keymapEditor');
  ShortcutSettings = (await import('../components/ShortcutSettings')).default as typeof ShortcutSettings;
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  ks.resetAllBindings();
  ke.resetAllPlayerBindings();
  for (const c of ks.listCustomCommands()) ks.removeCustomCommand(c.id);
});

afterEach(async () => {
  await cleanup();
});

async function openGroup(root: ParentNode, cat: string): Promise<void> {
  const toggle = root.querySelector<HTMLButtonElement>(`[data-sc-toggle="${cat}"]`);
  if (toggle?.getAttribute('aria-expanded') !== 'true') await click(toggle);
}

async function press(init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

describe('capture with conflict resolution', () => {
  it('holds a colliding chord and replaces on request', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Navigation');
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press({ key: 'k', code: 'KeyK', ctrlKey: true });
    const panel = host.querySelector('[data-sc-resolve="nav.widgets"]');
    expect(panel, 'a resolver appears instead of a silent double binding').not.toBeNull();
    expect(panel?.textContent).toContain('Open command palette');
    // Nothing was committed yet.
    expect(ks.effectiveKeys('nav.widgets')).toBe('');
    await click(panel?.querySelector('[data-sc-resolution="replace"]'));
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+K');
    expect(ks.effectiveKeys('nav.palette')).toBe('');
    expect(host.querySelector('[data-sc-resolve]')).toBeNull();
  });

  it('offers swap when the row had keys, and swaps', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Navigation');
    await click(host.querySelector('[data-shortcut-capture="nav.settings"]'));
    await press({ key: 'k', code: 'KeyK', ctrlKey: true });
    await click(host.querySelector('[data-sc-resolve="nav.settings"] [data-sc-resolution="swap"]'));
    expect(ks.effectiveKeys('nav.settings')).toBe('Ctrl+K');
    expect(ks.effectiveKeys('nav.palette')).toBe('Ctrl+,');
  });

  it('cancel leaves everything as it was', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Navigation');
    await click(host.querySelector('[data-shortcut-capture="nav.settings"]'));
    await press({ key: 'k', code: 'KeyK', ctrlKey: true });
    await click(host.querySelector('[data-sc-resolution="cancel"]'));
    expect(ks.effectiveKeys('nav.settings')).toBe('Ctrl+,');
    expect(ks.effectiveKeys('nav.palette')).toBe('Ctrl+K');
  });

  it('warns live while a chord is typed by hand', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Navigation');
    const row = host.querySelector('[data-shortcut-id="nav.widgets"]') as HTMLElement;
    const typeBtn = [...row.querySelectorAll('button')].find((b) => b.textContent === 'Type');
    await click(typeBtn);
    await typeInto(row.querySelector('.sc-manual-input') as HTMLInputElement, 'Ctrl+P');
    expect(row.querySelector('.sc-live')?.textContent).toContain('Global search');
  });
});

describe('custom shortcuts edited in place (D264)', () => {
  it('renames and re-targets without losing the binding', async () => {
    const res = ks.addCustomCommand({ label: 'Opne music', keys: 'Ctrl+Alt+Shift+1', action: { type: 'openApp', appId: 'music' } });
    const id = (res as { id: string }).id;
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Custom');
    await click(host.querySelector(`[data-sc-edit="${id}"]`));
    const form = host.querySelector('.sc-edit') as HTMLElement;
    expect(form).not.toBeNull();
    await typeInto(form.querySelector('input') as HTMLInputElement, 'Open library');
    const select = [...form.querySelectorAll('select')][1] as HTMLSelectElement;
    await act(async () => {
      select.value = 'library';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await click([...form.querySelectorAll('button')].find((b) => b.textContent === 'Save changes'));
    const def = ks.listCustomCommands().find((c) => c.id === id)!;
    expect(def.label).toBe('Open library');
    expect(def.action).toEqual({ type: 'openApp', appId: 'library' });
    expect(ks.effectiveKeys(id)).toBe('Ctrl+Alt+Shift+1');
  });
});

describe('the video player group', () => {
  it('rebinds a player key, and refuses a modified chord', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Player');
    const capture = host.querySelector('[data-shortcut-capture="player.mute"]');
    expect(capture).not.toBeNull();
    await click(capture);
    await press({ key: 'y', code: 'KeyY', ctrlKey: true });
    expect(host.querySelector('.sc-msg')?.textContent).toMatch(/single key without Ctrl/);
    expect(ke.entryChords('player.mute')).toEqual(['M']);
    await click(host.querySelector('[data-shortcut-capture="player.mute"]'));
    await press({ key: 'y', code: 'KeyY' });
    expect(ke.entryChords('player.mute')).toEqual(['Y']);
    await settle();
    expect(host.querySelector('[data-sc-reset="player.mute"]')).not.toBeNull();
  });
});

describe('the Chrome extension card', () => {
  it('lists every extension command and says where to change them', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Extension');
    for (const cmd of ke.CHROME_KEY_COMMANDS) {
      expect(host.querySelector(`[data-shortcut-id="extension.${cmd.name}"]`), cmd.name).not.toBeNull();
    }
    expect(host.textContent).toContain('chrome://extensions/shortcuts');
    expect(host.querySelector('[data-sc-copy-chrome]')).not.toBeNull();
  });
});

describe('search', () => {
  it('reaches the player and extension groups too', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await typeInto(host.querySelector('.sc-search') as HTMLInputElement, 'mute');
    expect(host.querySelector('[data-shortcut-id="player.mute"]')).not.toBeNull();
    await typeInto(host.querySelector('.sc-search') as HTMLInputElement, 'action wheel');
    expect(host.querySelector('[data-shortcut-id="extension.action-wheel"]')).not.toBeNull();
  });
});

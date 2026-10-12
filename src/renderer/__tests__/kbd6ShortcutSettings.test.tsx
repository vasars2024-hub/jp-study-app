// @vitest-environment jsdom
/**
 * kbd6 — Settings > Shortcuts, driven for real:
 *
 * - the text search reads "ctrl k" as keys;
 * - "Find by keys" narrows the list to what a pressed chord (or sequence) is bound to,
 *   shows the filter as a removable chip, and Escape puts things back;
 * - "Record a sequence" captures several steps and commits after a pause; Escape
 *   cancels; a sequence that starts with another command's chord is held as a
 *   prefix clash and explained on both rows.
 */
import { act, type ReactElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, click, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';

type KS = typeof import('../keyboardShortcuts');
type KE = typeof import('../keymapEditor');

let ks: KS;
let ke: KE;
let ShortcutSettings: (props: { embedded?: boolean }) => ReactElement;

/** A little over the editor's 1200 ms step pause. */
const PAUSE = 1350;

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

async function press(init: KeyboardEventInit): Promise<void> {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  });
}

async function openGroup(root: ParentNode, cat: string): Promise<void> {
  const toggle = root.querySelector<HTMLButtonElement>(`[data-sc-toggle="${cat}"]`);
  if (toggle?.getAttribute('aria-expanded') !== 'true') await click(toggle);
}

const has = (root: ParentNode, id: string): boolean => root.querySelector(`[data-shortcut-id="${id}"]`) != null;

describe('chord-aware text search', () => {
  it('"ctrl k" finds the row bound to Ctrl+K', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await typeInto(host.querySelector('.sc-search') as HTMLInputElement, 'ctrl k');
    expect(has(host, 'nav.palette')).toBe(true);
    expect(has(host, 'nav.search')).toBe(false);
  });
});

describe('Find by keys', () => {
  it('filters to the pressed chord, shows a removable chip, and clears', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    const find = host.querySelector<HTMLButtonElement>('[data-sc-find-keys]');
    expect(find?.textContent).toBe('Find by keys');
    expect(find?.getAttribute('title')).toBeTruthy();
    await click(find);
    expect(find?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-sc-find-status]')?.getAttribute('role')).toBe('status');
    await press({ key: 'p', code: 'KeyP', ctrlKey: true });
    const chip = host.querySelector('[data-sc-key-filter]');
    expect(chip?.getAttribute('data-sc-key-filter')).toBe('Ctrl+P');
    expect(chip?.textContent).toContain('Keys: Ctrl+P');
    expect(chip?.textContent).toMatch(/\d+ shortcuts? uses? Ctrl\+P/);
    expect(has(host, 'nav.search')).toBe(true);
    expect(has(host, 'nav.palette')).toBe(false);
    // The pause ends the reading.
    await settle(PAUSE);
    expect(find?.getAttribute('aria-pressed')).toBe('false');
    const clear = host.querySelector<HTMLButtonElement>('[data-sc-clear-key-filter]');
    expect(clear?.getAttribute('aria-label')).toBe('Clear the key filter (Ctrl+P)');
    await click(clear);
    expect(host.querySelector('[data-sc-key-filter]')).toBeNull();
    await openGroup(host, 'Navigation');
    expect(has(host, 'nav.palette')).toBe(true);
  });

  it('narrows step by step through a sequence', async () => {
    ks.setBinding('nav.widgets', 'Ctrl+K W');
    const { host } = await mount(<ShortcutSettings embedded />);
    await click(host.querySelector('[data-sc-find-keys]'));
    await press({ key: 'k', code: 'KeyK', ctrlKey: true });
    expect(has(host, 'nav.palette')).toBe(true);
    expect(has(host, 'nav.widgets')).toBe(true);
    await press({ key: 'w', code: 'KeyW' });
    expect(host.querySelector('[data-sc-key-filter]')?.getAttribute('data-sc-key-filter')).toBe('Ctrl+K W');
    expect(has(host, 'nav.palette')).toBe(false);
    expect(has(host, 'nav.widgets')).toBe(true);
  });

  it('Escape stops listening and leaves no filter', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    const find = host.querySelector<HTMLButtonElement>('[data-sc-find-keys]');
    await click(find);
    await press({ key: 'p', code: 'KeyP', ctrlKey: true });
    await press({ key: 'Escape', code: 'Escape' });
    expect(find?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-sc-key-filter]')).toBeNull();
  });
});

describe('Record a sequence', () => {
  it('is a labelled checkbox, off by default', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    const box = host.querySelector<HTMLInputElement>('[data-sc-record-sequence]');
    expect(box?.type).toBe('checkbox');
    expect(box?.checked).toBe(false);
    expect(box?.closest('label')?.textContent).toBe('Record a sequence');
  });

  it('captures steps and commits after a pause', async () => {
    const seq = 'Ctrl+Shift+F12 Q';
    expect(ke.findConflicts('nav.widgets', seq).filter((c) => c.overlapping)).toEqual([]);
    const { host } = await mount(<ShortcutSettings embedded />);
    await click(host.querySelector('[data-sc-record-sequence]'));
    await openGroup(host, 'Navigation');
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press({ key: 'F12', code: 'F12', ctrlKey: true, shiftKey: true });
    // Not committed on the first step; the hint shows the steps so far.
    expect(ks.effectiveKeys('nav.widgets')).toBe('');
    expect(host.querySelector('.sc-capture-hint')?.textContent).toContain('Ctrl+Shift+F12');
    await press({ key: 'q', code: 'KeyQ' });
    expect(host.querySelector('.sc-capture-hint')?.textContent).toContain('Ctrl+Shift+F12, then Q');
    await settle(PAUSE);
    expect(ks.effectiveKeys('nav.widgets')).toBe(seq);
    expect(host.querySelector('[data-shortcut-capture="nav.widgets"]')?.textContent).toBe('Ctrl+Shift+F12, then Q');
  });

  it('Escape cancels a half-recorded sequence', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await click(host.querySelector('[data-sc-record-sequence]'));
    await openGroup(host, 'Navigation');
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press({ key: 'F12', code: 'F12', ctrlKey: true, shiftKey: true });
    await press({ key: 'Escape', code: 'Escape' });
    await settle(PAUSE);
    expect(ks.effectiveKeys('nav.widgets')).toBe('');
  });

  it('holds a sequence that starts with another command’s chord, and explains it on both rows', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await click(host.querySelector('[data-sc-record-sequence]'));
    await openGroup(host, 'Navigation');
    await click(host.querySelector('[data-shortcut-capture="nav.widgets"]'));
    await press({ key: 'k', code: 'KeyK', ctrlKey: true });
    await press({ key: 'w', code: 'KeyW' });
    await settle(PAUSE);
    const panel = host.querySelector('[data-sc-resolve="nav.widgets"]');
    expect(panel, 'a prefix clash is held for a decision').not.toBeNull();
    expect(panel?.textContent).toContain('Open command palette uses Ctrl+K, which starts this sequence');
    expect(ks.effectiveKeys('nav.widgets')).toBe('');
    await click(panel?.querySelector('[data-sc-resolution="keep"]'));
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+K W');
    await settle();
    const paletteRow = host.querySelector('[data-shortcut-id="nav.palette"]');
    expect(paletteRow?.querySelector('[data-sc-prefix-conflict]')?.textContent).toBe(
      'Ctrl+K starts the sequence Ctrl+K, then W for Open widget gallery',
    );
    expect(host.querySelector('[data-shortcut-id="nav.widgets"] [data-sc-prefix-conflict]')).not.toBeNull();
  });

  it('the Type field accepts a sequence', async () => {
    const { host } = await mount(<ShortcutSettings embedded />);
    await openGroup(host, 'Navigation');
    const row = host.querySelector('[data-shortcut-id="nav.widgets"]') as HTMLElement;
    const typeBtn = [...row.querySelectorAll('button')].find((b) => b.textContent === 'Type');
    await click(typeBtn);
    const input = row.querySelector('.sc-manual-input') as HTMLInputElement;
    await typeInto(input, 'ctrl+shift+f12  q');
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    await settle();
    expect(ks.effectiveKeys('nav.widgets')).toBe('Ctrl+Shift+F12 Q');
  });
});

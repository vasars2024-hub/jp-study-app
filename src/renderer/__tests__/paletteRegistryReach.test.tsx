// @vitest-environment jsdom
/**
 * kbd5 — the command palette reaches every command in the registry (the
 * built-in catalog, the Toolbox rows in Toolbox mode, and the user's custom
 * shortcuts, which were missing), ranks by fuzzy match plus recency, opens on
 * "Recently used", describes the highlighted command, and is driven entirely
 * from the keyboard.
 */
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let host: HTMLDivElement;
let root: Root;
let CommandPalette: ComponentType;
type KS = typeof import('../keyboardShortcuts');
let ks: KS;
let commandLabel: typeof import('../commandI18n').commandLabel;
let t: (key: string) => string;

function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on') ? () => () => undefined : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

async function type(input: HTMLInputElement, query: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function open(mode: string, query = ''): Promise<HTMLElement[]> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: mode }));
  });
  const input = document.querySelector<HTMLInputElement>('.palette-input');
  expect(input).not.toBeNull();
  await type(input as HTMLInputElement, query);
  return [...document.querySelectorAll<HTMLElement>('.palette-row')];
}

async function key(k: string, init: KeyboardEventInit = {}): Promise<void> {
  await act(async () => {
    document.querySelector('.palette-input')?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { value: () => undefined, configurable: true });
  ks = await import('../keyboardShortcuts');
  ({ commandLabel } = await import('../commandI18n'));
  ({ t } = await import('../i18n'));
  ({ default: CommandPalette } = await import('../components/CommandPalette'));
  // Warm the lazily imported settings registry (see paletteSettingsReach.test.tsx).
  await import('../components/settings/settingsRegistry');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CommandPalette />));
}, 60_000);

afterAll(async () => {
  await act(async () => root.unmount());
  host.remove();
});

beforeEach(async () => {
  localStorage.removeItem('jp-palette-recents-v1');
  await key('Escape');
});

describe('every registry command is reachable', () => {
  it('each built-in command is found by its own label in commands mode', async () => {
    const missing: string[] = [];
    for (const c of ks.COMMAND_CATALOG) {
      if (c.category === 'Toolbox') continue;
      const rows = await open('commands', commandLabel(c.id, c.label, t));
      if (!rows.some((r) => r.dataset.paletteKey === `cmd-${c.id}`)) missing.push(c.id);
      await key('Escape');
    }
    expect(missing).toEqual([]);
  }, 120_000);

  it('each Toolbox command is found in Toolbox mode', async () => {
    const missing: string[] = [];
    for (const c of ks.COMMAND_CATALOG.filter((x) => x.category === 'Toolbox')) {
      const rows = await open('toolbox', commandLabel(c.id, c.label, t));
      if (!rows.some((r) => r.dataset.paletteKey === `cmd-${c.id}`)) missing.push(c.id);
      await key('Escape');
    }
    expect(missing).toEqual([]);
  }, 120_000);

  it('a custom shortcut is a palette command too', async () => {
    const res = ks.addCustomCommand({ label: 'Morning routine', action: { type: 'openApp', appId: 'flashcards' } });
    const id = (res as { id: string }).id;
    try {
      const rows = await open('commands', 'Morning routine');
      expect(rows[0]?.dataset.paletteKey).toBe(`cmd-${id}`);
    } finally {
      ks.removeCustomCommand(id);
    }
  });
});

describe('ranking and recency', () => {
  it('opens on what was picked last, under "Recently used"', async () => {
    let rows = await open('commands', 'Open Statistics');
    const opened: string[] = [];
    const onOpen = (e: Event) => opened.push(String((e as CustomEvent).detail));
    window.addEventListener('os:open', onOpen);
    try {
      await act(async () => {
        rows.find((r) => r.dataset.paletteKey === 'cmd-nav.open.stats')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    } finally {
      window.removeEventListener('os:open', onOpen);
    }
    expect(opened).toContain('stats');

    rows = await open('commands', '');
    expect(rows[0]?.dataset.paletteKey).toBe('cmd-nav.open.stats');
    expect(rows[0]?.querySelector('.palette-group')?.textContent).toBe('Recently used');
    // Recency lifts it among equally good matches for a typed query too.
    await key('Escape');
    rows = await open('commands', 'open');
    const keys = rows.map((r) => r.dataset.paletteKey);
    expect(keys.indexOf('cmd-nav.open.stats')).toBeLessThan(keys.indexOf('cmd-nav.open.dictionary'));
  });
});

describe('keyboard-only flow', () => {
  it('moves by page, jumps to the ends, describes the highlighted command and runs it with Enter', async () => {
    await open('commands', '');
    const selected = () => document.querySelector('.palette-row[aria-selected="true"]') as HTMLElement | null;
    await key('PageDown');
    expect(selected()?.dataset.idx).toBe('8');
    await key('End', { ctrlKey: true });
    const last = document.querySelectorAll('.palette-row').length - 1;
    expect(selected()?.dataset.idx).toBe(String(last));
    await key('Home', { ctrlKey: true });
    expect(selected()?.dataset.idx).toBe('0');
    expect(document.querySelector('.palette-keys-hint')?.textContent).toMatch(/Enter/);

    await type(document.querySelector('.palette-input') as HTMLInputElement, 'Undo last action');
    expect(selected()?.dataset.paletteKey).toBe('cmd-nav.undo');
    // The description is the command's own Settings note, tied to the row.
    const desc = document.querySelector('.palette-desc');
    expect(desc?.textContent).toMatch(/Reverses the last recorded action/);
    expect(selected()?.getAttribute('aria-describedby')).toBe(desc?.id);

    const toasts: string[] = [];
    const onToast = (e: Event) => toasts.push(String((e as CustomEvent).detail?.message));
    window.addEventListener('os:toast', onToast);
    try {
      await key('Enter');
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    } finally {
      window.removeEventListener('os:toast', onToast);
    }
    expect(document.querySelector('.palette')).toBeNull();
    expect(toasts.length).toBeGreaterThan(0);
  });
});

// @vitest-environment jsdom
//
// L10 bullet 3 — "ensure the command palette and search expose moved
// secondary/expert actions".
//
// Before this, the palette offered commands, pages, widgets, saved words,
// flashcards and grammar, and no settings at all: every card L8 moved behind a
// progressive disclosure was reachable only from Settings' own search box.
// These cases drive the REAL component (a standalone-mounted stub could not see
// the lazy registry import land) and assert three things — the row exists, it
// routes to its own card rather than to the front of Settings, and an entry
// whose card does not render is NOT offered.
import { act, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

let host: HTMLDivElement;
let root: Root;
let CommandPalette: ComponentType;

function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

/**
 * Assigning `.value` and firing `input` does NOT type into a React input —
 * React's own value tracker sees no change and dedupes the event away, leaving
 * the query empty and the first 40 unfiltered items on screen. That reads
 * exactly like "the palette has no settings". Go through the native setter.
 */
async function type(input: HTMLInputElement, query: string): Promise<void> {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setValue?.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

/** Open in `mode` and type `query`, letting the lazy registry import land first. */
async function open(mode: string, query: string): Promise<HTMLElement[]> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: mode }));
  });
  // The registry is imported on open; its `.then` resolves later, so the first
  // render after the event still has zero settings rows.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const input = document.querySelector<HTMLInputElement>('.palette-input');
  expect(input).not.toBeNull();
  await type(input as HTMLInputElement, query);
  return [...document.querySelectorAll<HTMLElement>('.palette-row')];
}

const search = (query: string) => open('search', query);

function settingsRows(rows: HTMLElement[]): { label: string; row: HTMLElement }[] {
  return rows
    .filter((r) => r.querySelector('.palette-group')?.textContent === 'Settings')
    .map((r) => ({ label: r.querySelector('.palette-label')?.textContent ?? '', row: r }));
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  ({ default: CommandPalette } = await import('../components/CommandPalette'));
  // Warm the registry the palette imports lazily. Vitest transforms that 1,700-
  // line module on first request, which took longer than any fixed wait here
  // and made the FIRST case in the file read as "the palette has no settings"
  // while later cases passed off the module cache.
  await import('../components/settings/settingsRegistry');
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    value: () => undefined,
    configurable: true,
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<CommandPalette />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  document.documentElement.classList.remove('settings-advanced');
});

describe('command palette exposes settings cards', () => {
  it('offers a settings card and lands on the card, not the front of Settings', async () => {
    const rows = settingsRows(await search('Reset desktop'));
    const hit = rows.find((r) => r.label === 'Reset desktop');
    expect(hit).toBeDefined();

    const opened: string[] = [];
    const navigated: { page?: string; settingId?: string }[] = [];
    const onOpen = (e: Event) => opened.push(String((e as CustomEvent).detail));
    const onNav = (e: Event) => navigated.push((e as CustomEvent).detail);
    window.addEventListener('os:open', onOpen);
    window.addEventListener('settings:navigate', onNav);
    try {
      await act(async () => {
        hit?.row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      // `pick` defers the action past the overlay's unmount, and the route
      // itself waits 80 ms so SettingsApp's listener is mounted first.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 140));
      });
    } finally {
      window.removeEventListener('os:open', onOpen);
      window.removeEventListener('settings:navigate', onNav);
    }

    expect(opened).toContain('settings');
    expect(navigated).toEqual([{ page: 'desktop-layout', settingId: 'desktop-reset' }]);
  });

  it('matches on the entry English keywords, not only its translated title', async () => {
    // 'clear widgets' is a keyword of `desktop-reset` and appears in neither its
    // title nor its description — the reason `Item.terms` is scored but not shown.
    const rows = settingsRows(await search('clear widgets'));
    expect(rows.map((r) => r.label)).toContain('Reset desktop');
  });

  it('NEGATIVE CONTROL: withholds an entry whose card does not render', async () => {
    // `custom-css` is `advanced: true`. With Advanced Mode off its card is not
    // on the Appearance page, so offering it would navigate to a page that
    // highlights nothing — the misroute the registry gates exist to prevent.
    const off = settingsRows(await search('Custom CSS'));
    expect(off.map((r) => r.label)).not.toContain('Custom CSS');

    // Same query, same component, Advanced Mode on: the row appears. Without
    // this half the assertion above would also pass on a palette that offers no
    // settings whatsoever.
    document.documentElement.classList.add('settings-advanced');
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => root.render(<CommandPalette />));
    const on = settingsRows(await search('Custom CSS'));
    expect(on.map((r) => r.label)).toContain('Custom CSS');
  });

  it('keeps the EMPTY commands list the command catalog', async () => {
    // Ctrl+Space-style commands mode opens on the command catalog; 160 settings
    // cards would bury the commands that mode exists for (L10 bullet 1).
    const rows = await open('commands', '');
    expect(rows.length).toBeGreaterThan(0);
    const groups = rows.map((r) => r.querySelector('.palette-group')?.textContent);
    expect(groups).not.toContain('Settings');
    expect(groups).toContain('Commands');
  });

  it('J9: commands mode finds settings once something is typed', async () => {
    // "the palette finds no settings" — the default chord opens commands mode.
    const rows = settingsRows(await open('commands', 'Reset desktop'));
    expect(rows.map((r) => r.label)).toContain('Reset desktop');
  });

  it('J9: "backup" ranks Backup & restore first, and not Wallpaper', async () => {
    for (const mode of ['commands', 'search']) {
      const rows = await open(mode, 'backup');
      const labels = rows.map((r) => r.querySelector('.palette-label')?.textContent);
      expect(labels[0]).toBe('Backup & restore');
      expect(labels).not.toContain('Wallpaper');
      await act(async () => {
        document.querySelector('.palette-input')?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        );
      });
    }
  });

  it('J9: the moved Backup card routes to the Files app through its card id', async () => {
    const hit = settingsRows(await open('commands', 'backup')).find((r) => r.label === 'Backup & restore');
    expect(hit).toBeDefined();
    expect(hit?.row.querySelector('.palette-sub')?.textContent).toBe('Setting · Files');
    const navigated: { page?: string; settingId?: string }[] = [];
    const onNav = (e: Event) => navigated.push((e as CustomEvent).detail);
    window.addEventListener('settings:navigate', onNav);
    try {
      await act(async () => {
        hit?.row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 140));
      });
    } finally {
      window.removeEventListener('settings:navigate', onNav);
    }
    // `SettingsApp.navigate` forwards `memory` + the card id into the Files app.
    expect(navigated).toEqual([{ page: 'memory', settingId: 'backup' }]);
  });

  it('J9: "subtitle style" finds the Subtitle style card on the Study page', async () => {
    const rows = settingsRows(await open('commands', 'subtitle style'));
    expect(rows[0]?.label).toBe('Subtitle style');
  });
});

// @vitest-environment jsdom
/**
 * kbd6 — the command palette says where each command's keys are heard.
 *
 * - availability is a snapshot taken as the palette opens, BEFORE focus moves into
 *   its input (after that every scoped surface reports it lost the keyboard);
 * - each command row carries a scope chip and "Works here" / "Open X first" as text
 *   inside the option, so the option's accessible name includes them;
 * - the empty list leads (after Recent) with "In this view";
 * - a query that spells keys ranks what is bound to them first.
 */
import { act, type ComponentType } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, installJsdomShims, mount, settle, stubBridge, typeInto } from './helpers/axeHarness';

type KS = typeof import('../keyboardShortcuts');
type KQ = typeof import('../keyQuery');
let ks: KS;
let kq: KQ;
let CommandPalette: ComponentType;
const offs: Array<() => void> = [];

beforeAll(async () => {
  installJsdomShims();
  stubBridge({});
  ks = await import('../keyboardShortcuts');
  kq = await import('../keyQuery');
  CommandPalette = (await import('../components/CommandPalette')).default;
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  ks.resetAllBindings();
});

afterEach(async () => {
  while (offs.length) offs.pop()?.();
  await cleanup();
});

/** A reader surface with the keyboard on it, plus a manga surface that does not have it. */
function surfaces(): { readerButton: HTMLButtonElement } {
  const reader = document.createElement('div');
  reader.setAttribute('data-command-scope', 'kbd6-reader');
  const readerButton = document.createElement('button');
  readerButton.textContent = 'page';
  reader.append(readerButton);
  const manga = document.createElement('div');
  manga.setAttribute('data-command-scope', 'kbd6-manga');
  document.body.append(reader, manga);
  offs.push(ks.registerCommandHandler('reader.pageNext', () => true, { scope: 'kbd6-reader' }));
  offs.push(ks.registerCommandHandler('manga.nextPage', () => true, { scope: 'kbd6-manga' }));
  return { readerButton };
}

async function openPalette(): Promise<HTMLInputElement> {
  await act(async () => {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: 'commands' }));
  });
  await settle(20);
  const input = document.querySelector<HTMLInputElement>('.palette-input');
  expect(input).not.toBeNull();
  return input as HTMLInputElement;
}

function row(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-palette-key="cmd-${id}"]`);
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.palette-row')];
}

describe('availability snapshot', () => {
  it('is taken before the palette takes focus', async () => {
    const { readerButton } = surfaces();
    await mount(<CommandPalette />);
    readerButton.focus();
    expect(kq.commandAvailability('reader.pageNext')).toBe('here');
    const input = await openPalette();
    expect(document.activeElement).toBe(input);
    // Live, the reader no longer has the keyboard — the palette must not have asked now.
    expect(kq.commandAvailability('reader.pageNext')).toBe('elsewhere');
    const reader = row('reader.pageNext');
    expect(reader?.querySelector('.kbd6-avail')?.textContent).toBe('Works here');
    expect(reader?.querySelector('.kbd6-avail')?.getAttribute('data-avail')).toBe('here');
  });

  it('labels each command row with its scope and what to do first', async () => {
    const { readerButton } = surfaces();
    await mount(<CommandPalette />);
    readerButton.focus();
    const input = await openPalette();
    await typeInto(input, 'page');
    const reader = row('reader.pageNext');
    const manga = row('manga.nextPage');
    const prev = row('reader.pagePrev');
    expect(reader?.querySelector('.kbd6-scope-chip')?.textContent).toBe('Reader');
    expect(manga?.querySelector('.kbd6-scope-chip')?.textContent).toBe('Manga reader');
    expect(manga?.querySelector('.kbd6-avail')?.textContent).toBe('Switch to Manga reader first');
    expect(prev?.querySelector('.kbd6-avail')?.textContent).toBe('Open Reader first');
    // The chips are plain text inside the option: no focusable children were added.
    for (const r of [reader, manga, prev]) {
      expect(r?.getAttribute('role')).toBe('option');
      expect(r?.querySelector('button, a, input, [tabindex]')).toBeNull();
      expect(r?.textContent).toContain(r?.querySelector('.kbd6-scope-chip')?.textContent ?? '\u0000');
    }
  });

  it('a built-in needs no note beyond its scope chip', async () => {
    await mount(<CommandPalette />);
    const input = await openPalette();
    await typeInto(input, 'widget gallery');
    const widgets = row('nav.widgets');
    expect(widgets?.querySelector('.kbd6-scope-chip')?.textContent).toBe('Anywhere in Gum');
    expect(widgets?.querySelector('.kbd6-avail')).toBeNull();
  });
});

describe('"In this view"', () => {
  it('leads the empty list, after Recent, with the commands that work here', async () => {
    const { readerButton } = surfaces();
    await mount(<CommandPalette />);
    readerButton.focus();
    await openPalette();
    const list = rows();
    const first = list[0];
    expect(first?.getAttribute('data-palette-key')).toBe('cmd-reader.pageNext');
    expect(first?.querySelector('.palette-group')?.textContent).toBe('In this view');
    // Listed once, not again further down.
    expect(list.filter((r) => r.getAttribute('data-palette-key') === 'cmd-reader.pageNext')).toHaveLength(1);
    // The manga command is registered but not focused: not "in this view".
    const manga = list.find((r) => r.getAttribute('data-palette-key') === 'cmd-manga.nextPage');
    expect(manga?.querySelector('.palette-group')?.textContent ?? '').not.toBe('In this view');
  });

  it('is absent when nothing view-scoped works here', async () => {
    await mount(<CommandPalette />);
    await openPalette();
    expect(rows().some((r) => r.querySelector('.palette-group')?.textContent === 'In this view')).toBe(false);
  });
});

describe('search by key', () => {
  it('puts the commands bound to the typed keys first', async () => {
    await mount(<CommandPalette />);
    const input = await openPalette();
    await typeInto(input, 'ctrl+p');
    const first = rows()[0];
    expect(first?.getAttribute('data-palette-key')).toBe('cmd-nav.search');
    expect(first?.querySelector('.palette-group')?.textContent).toBe('Bound to Ctrl+P');
  });

  it('"ctrl k" finds Ctrl+K and the sequences that start with it, label or not', async () => {
    ks.setBinding('nav.widgets', 'Ctrl+K W');
    await mount(<CommandPalette />);
    const input = await openPalette();
    await typeInto(input, 'ctrl k');
    const keys = rows()
      .slice(0, 2)
      .map((r) => r.getAttribute('data-palette-key'))
      .sort();
    expect(keys).toEqual(['cmd-nav.palette', 'cmd-nav.widgets']);
    expect(row('nav.widgets')?.querySelector('.palette-kbd')?.textContent).toBe('Ctrl+K, then W');
  });

  it('an ordinary word is still a text search', async () => {
    await mount(<CommandPalette />);
    const input = await openPalette();
    await typeInto(input, 'settings');
    expect(rows().some((r) => (r.querySelector('.palette-group')?.textContent ?? '').startsWith('Bound to'))).toBe(false);
  });
});

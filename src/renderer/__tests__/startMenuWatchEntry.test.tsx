// @vitest-environment jsdom
/**
 * One clear way in from Start: a single "Watch" entry into the Media Center.
 *
 * The design audit found Start's MEDIA group below the fold, holding two entries —
 * "Media" (`player`) and "Video" (`video`) — that opened the same Media Center on
 * different tabs, and "Media" wore YouTube's play glyph. `player` is now the one
 * entry, named "Watch" with the camera glyph, in the first group; `video` stays a
 * real section (saved layouts, `os:open 'video'`, pop-outs) but is not offered.
 *
 * DesktopShell half is a source scan, for the reason `desktopStartAppHints.test.ts`
 * gives: it pulls the whole shell tree at module eval. The palette half renders,
 * because Start's search box IS the palette — "video", "media", "watch" and 動画 must
 * all still find the entry there.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';
import { ensureCatalog } from '../../shared/i18n/catalogs';
import { setUiLang } from '../i18n';

const REPO = resolve(__dirname, '../../..');
const read = (rel: string): string => readFileSync(resolve(REPO, rel), 'utf8');
/** Comments out, so prose can never satisfy an assertion. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SHELL = code(read('src/renderer/components/DesktopShell.tsx'));

/** The source text of `const NAME … ];` (or `…);` for a Set). */
function block(name: string, end = '];'): string {
  const at = SHELL.indexOf(`const ${name}`);
  expect(at, `${name} is gone — was it renamed?`).toBeGreaterThan(-1);
  return SHELL.slice(at, SHELL.indexOf(end, at) + end.length);
}

describe('Start offers one Watch entry', () => {
  it('names `player` Watch, with a glyph YouTube does not share', () => {
    const apps = block('APPS');
    const player = /\{ id: 'player', labelKey: '([^']+)', glyph: '([^']+)' \}/.exec(apps);
    const youtube = /\{ id: 'youtube', labelKey: '[^']+', glyph: '([^']+)' \}/.exec(apps);
    expect(player?.[1]).toBe('palette.section.watch');
    expect(player?.[2]).toBe('video');
    expect(youtube?.[1]).toBeTruthy();
    expect(player?.[2]).not.toBe(youtube?.[1]);
  });

  it('keeps `video` as a section but hides it from both Start variants', () => {
    // Still in APPS: window titles, taskbar glyphs and saved layouts resolve through it.
    expect(block('APPS')).toContain("{ id: 'video',");
    expect(block('START_HIDDEN_SECTIONS', ');')).toContain("'video'");
    // Legacy grid: no group lists it, and the fall-through bucket is pre-claimed with it.
    expect(block('START_GROUPS')).not.toContain("'video'");
    expect(SHELL).toContain('const claimed = new Set<WinSection>(START_HIDDEN_SECTIONS);');
    // Aero / Wired menu: neither the programs column nor the places column.
    expect(block('START_PRIMARY_SECTIONS')).not.toContain("'video'");
    expect(SHELL).toMatch(/startPlaceApps = desktopApps\.filter\([\s\S]*?!START_HIDDEN_SECTIONS\.has\(app\.id\)/);
  });

  it('puts the media group first, so Watch is visible without scrolling', () => {
    const groups = block('START_GROUPS');
    const first = /id: '([^']+)'/.exec(groups);
    expect(first?.[1]).toBe('media');
    expect(groups).toMatch(/id: 'media'[^\n]*sections: \['player'/);
    // Control: the Aero programs column leads with it too.
    expect(/'([a-z]+)'/.exec(block('START_PRIMARY_SECTIONS'))?.[1]).toBe('player');
  });

  it('still opens the Media Center on its Library tab', () => {
    const appSection = code(read('src/renderer/components/AppSection.tsx'));
    expect(appSection).toMatch(/case 'player':\s*view = <MediaCenterView initialTab="library" \/>;/);
  });

  it('has a real name in every language', () => {
    for (const catalog of [en, ja, zh, ru]) {
      expect(catalog['palette.section.watch']).toBeTruthy();
      expect(catalog['palette.section.watchTerms']).toBeTruthy();
    }
    expect(en['palette.section.watch']).toBe('Watch');
    expect(ja['palette.section.watch']).toBe('視聴');
    expect(zh['palette.section.watch']).toBe('观看');
    expect(ru['palette.section.watch']).toBe('Смотреть');
  });
});

/* ------------------------------------------------------------------------------------ *
 * Start's search box opens the palette in search mode, so this is where "search in Start"
 * is actually answered.
 * ------------------------------------------------------------------------------------ */

let host: HTMLDivElement | null = null;
let root: Root | null = null;

/** `CommandPalette` → `playerBus` calls `window.api` at module eval; see continueWatchingPalette. */
function stubApi(): void {
  const api = new Proxy({}, {
    get: (_target, prop) => (typeof prop === 'string' && prop.startsWith('on')
      ? () => () => undefined
      : () => Promise.resolve(null)),
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await ensureCatalog('ja');
});

beforeEach(() => {
  stubApi();
  localStorage.clear();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  setUiLang('en');
  await ensureCatalog('en');
});

async function search(query: string): Promise<HTMLElement> {
  const { default: CommandPalette } = await import('../components/CommandPalette');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root?.render(createElement(CommandPalette, {})); });
  await act(async () => {
    window.dispatchEvent(new CustomEvent('palette:open', { detail: 'search' }));
  });
  const input = document.querySelector<HTMLInputElement>('.palette-input');
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    if (input && setValue) {
      setValue.call(input, query);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  return host;
}

/** Page rows (not commands, widgets or settings) whose label is exactly `label`. */
function pageRows(el: HTMLElement, label: string, pages: string): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('.palette-row')].filter((row) =>
    row.querySelector('.palette-label')?.textContent === label
    && row.querySelector('.palette-group')?.textContent === pages);
}

describe('Start search finds Watch', () => {
  it.each(['video', 'media', 'watch', '動画'])('finds it by "%s" in English', async (query) => {
    const el = await search(query);
    expect(pageRows(el, 'Watch', en['palette.group.pages'] as string)).toHaveLength(1);
    // One way in: the old "Video" page row is gone rather than listed beside it.
    expect(pageRows(el, 'Video', en['palette.group.pages'] as string)).toHaveLength(0);
  });

  it.each(['動画', 'メディア', '視聴', 'video'])('finds it by "%s" in Japanese', async (query) => {
    setUiLang('ja');
    await ensureCatalog('ja');
    const el = await search(query);
    expect(pageRows(el, '視聴', ja['palette.group.pages'] as string)).toHaveLength(1);
  });

  it('opens the `player` section, which lands on the Library tab', async () => {
    const el = await search('watch');
    const seen: unknown[] = [];
    const listener = (event: Event): void => { seen.push((event as CustomEvent).detail); };
    window.addEventListener('os:open', listener);
    await act(async () => { pageRows(el, 'Watch', en['palette.group.pages'] as string)[0]?.click(); });
    // `pick` defers the action a macrotask so focus lands after the overlay unmounts.
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    window.removeEventListener('os:open', listener);
    expect(seen).toEqual(['player']);
  });
});

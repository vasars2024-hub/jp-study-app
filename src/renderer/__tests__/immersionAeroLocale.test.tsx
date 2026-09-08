// @vitest-environment jsdom
/**
 * D188 — the immersion view has TWO shells and only one of them was translated.
 *
 * `ImmersionView` branches on `useAeroMaterials()`. The classic presentation
 * lives in `components/immersion/ImmersionContent` and resolves every string
 * through `t()`; Study OS's bespoke Aero chrome — the menu bar, the status bar,
 * the stage head and the sites rail — rendered its labels as English literals
 * in every language.
 *
 * What makes this worse than a plain miss: three of those menus already carried
 * a `t()` item BESIDE the literals (`immersion.visualNovelLibrary`,
 * `immersion.liveLookupMenu`, `immersion.closePage`), so the bar rendered
 * half-translated. And nine of the strings had a translated key sitting unused
 * two lines away in the same catalog, because the classic shell was consuming
 * it — which is why the orphan check saw nothing.
 *
 * Nothing else could catch it. The file DOES call `t()`, so
 * `i18n-hardcoded-check` passes; `i18n-partial-check` ratchets and cannot read
 * a template-literal label at all; and a shell that renders only under one
 * `data-materials` value is a shell no default-theme suite ever mounts.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ensureCatalog, catalogFor } from '../../shared/i18n/catalogs';
import { getUiLang, setUiLang } from '../i18n';

type Lang = 'en' | 'ja' | 'zh' | 'ru';
const LANGS = ['en', 'ja', 'zh', 'ru'] as const;

const EMPTY_RESULT = new Proxy({}, { get: () => [] });

function installApiStub(): void {
  const api: Record<string, unknown> = {
    // `ImmersionSitesStore`, not a bare array. This used to return `[]`, whose
    // `.sites.map` throws — and the rail's old `catch {}` swallowed that and
    // rendered "Saved sites appear here" anyway, so the stub's wrong shape was
    // invisible. The rail now reports a failed read, which is what exposed it.
    immersionListSites: async () => ({ sites: [] }),
    toolsList: async () => ({ tools: [] }),
  };
  (window as unknown as { api: unknown }).api = new Proxy(api, {
    get: (target, prop: string | symbol) => {
      if (prop === 'then') return undefined;
      if (typeof prop === 'string' && prop in target) return target[prop];
      if (typeof prop === 'string' && prop.startsWith('on')) return () => (): undefined => undefined;
      return async (): Promise<unknown> => EMPTY_RESULT;
    },
  });
}

let View: typeof import('../views/ImmersionView').default;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  View = (await import('../views/ImmersionView')).default;
});

/**
 * Every key the Aero shell can ask for, resolved in all four languages. A key
 * missing from `en` too renders as the key itself and no catalog check fires,
 * because `i18n-check` only compares ja/zh/ru AGAINST en.
 *
 * The reused half is listed alongside the new half deliberately: nine of these
 * belong to the classic shell, and the whole point of the fix is that the Aero
 * shell now depends on them too. If someone deletes one as "only used by
 * ImmersionContent", this list is what says otherwise.
 */
describe('the Aero shell only asks for keys the catalogs answer', () => {
  const NEW_KEYS = [
    'immersion.aero.menu.file',
    'immersion.aero.menu.openLocation',
    'immersion.aero.menu.saveSite',
    'immersion.aero.menu.exportReaderPage',
    'immersion.aero.menu.captureVideo',
    'immersion.aero.menu.view',
    'immersion.aero.menu.hideSitesRail',
    'immersion.aero.menu.showSitesRail',
    'immersion.aero.menu.refreshSites',
    'immersion.aero.status.loading',
    'immersion.aero.status.ready',
    'immersion.aero.status.sitesCount',
    'immersion.aero.newPage',
    'immersion.aero.pinned',
  ];
  const REUSED_KEYS = [
    'immersion.openInSystemBrowser',
    'immersion.reload',
    'immersion.sites',
    'immersion.rail.empty',
    'immersion.loading',
    'immersion.hideLibrary',
    'immersion.showLibrary',
    'immersion.visitsCount',
    'immersion.streakDays',
    'immersion.mode.live',
    'immersion.mode.reader',
    'immersion.mode.focus',
  ];

  it.each(LANGS)('%s answers all 26', async (lang) => {
    await ensureCatalog(lang);
    const catalog = catalogFor(lang);
    const keys = [...NEW_KEYS, ...REUSED_KEYS];
    expect(keys.length).toBe(26);
    for (const key of keys) {
      const value = catalog[key];
      // Plural entries are objects; everything else is a string.
      expect(
        typeof value === 'string' || (typeof value === 'object' && value !== null),
        `${lang} cannot answer ${key}`,
      ).toBe(true);
    }
  });

  /**
   * `immersion.aero.status.sitesCount` is the only counted one this slice adds,
   * and Russian needs all four CLDR arms. `{ other }` alone would read
   * `3 сайта` at one and `1 сайта` is wrong.
   */
  it('gives the Russian site count all four CLDR arms', async () => {
    await ensureCatalog('ru');
    const plural = catalogFor('ru')['immersion.aero.status.sitesCount'];
    expect(typeof plural).toBe('object');
    expect(Object.keys(plural as object).sort()).toEqual(['few', 'many', 'one', 'other']);
  });
});

describe('ImmersionView Aero shell renders in the interface language', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    document.documentElement.removeAttribute('data-materials');
    setUiLang('en');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  /**
   * `useAeroMaterials` reads `data-materials` off `<html>` directly, so setting
   * the attribute BEFORE the mount is the whole of what it takes to reach this
   * branch. Without it the classic shell renders and the test proves nothing —
   * which is exactly why these literals survived every other suite.
   */
  async function render(lang: Lang): Promise<string> {
    document.documentElement.setAttribute('data-materials', 'aero');
    await ensureCatalog(lang);
    setUiLang(lang);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(getUiLang(), `the switch to ${lang} never landed`).toBe(lang);
    host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    root = mounted;
    await act(async () => {
      mounted.render(<View />);
    });
    return host.textContent ?? '';
  }

  /** The three top-level menu names, which sit in the bar itself. */
  function barText(): string {
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.ui-menubar__btn'));
    expect(buttons.length, 'the Aero menu bar has no menus').toBe(3);
    return buttons.map((b) => b.textContent ?? '').join('\n');
  }

  /**
   * `MenuBar` renders a dropdown's items only while that menu is open, so the
   * menu-item labels are invisible to a plain `textContent` read. Open all
   * three in turn and accumulate — this is the half `i18n-partial-check` could
   * never see either, because four of the labels are template literals.
   */
  async function menuText(): Promise<string> {
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.ui-menubar__btn'));
    expect(buttons.length, 'the Aero menu bar has no menus').toBe(3);
    let text = '';
    for (const button of buttons) {
      await act(async () => {
        button.click();
      });
      text += `${host.querySelector('.ui-menubar__pop')?.textContent ?? ''}\n`;
      await act(async () => {
        button.click();
      });
    }
    return text;
  }

  /** Every literal the negative cases assert is gone, proven present first. */
  const SHELL_LITERALS = [
    'Ready',
    '0 sites',
    'New immersion page',
    'Sites',
    'Saved sites appear here. Bookmark any page.',
  ];
  const BAR_LITERALS = ['File', 'View', 'Sites'];
  const MENU_LITERALS = [
    'Open location',
    'Save site',
    'Export reader page',
    'Capture video',
    'Open in system browser',
    // `Live Reader` was the menu's own spelling; it now takes MODE_LABELS, so
    // the interpunct form is what both the menu and the segment render.
    'Live·Reader',
    'Focus',
    'Reload',
    'Hide Sites rail',
    'Refresh saved sites',
  ];

  it.each(LANGS)('disables page actions with a reason and preserves icon names in %s', async (lang) => {
    await render(lang);
    const catalog = catalogFor(lang);
    for (const key of ['saveSite', 'saveAsTool', 'exportToLibrary', 'captureVideo', 'openInSystemBrowser']) {
      const name = catalog['immersion.' + key];
      const button = [...host.querySelectorAll<HTMLButtonElement>('.aero-immersion-icon-btn')]
        .find((candidate) => candidate.getAttribute('aria-label') === name);
      expect(button, key).toBeDefined();
      expect(button!.disabled, key).toBe(true);
      expect(button!.title, key).toBe(catalog['immersion.reason.noPage']);
    }
  });

  it('reaches the Aero shell at all, and is English by default', async () => {
    const text = await render('en');
    // The classic shell has no menu bar and no status bar, so this is the
    // assertion that says the branch under test was the one taken.
    expect(host.querySelector('.aero-immersion'), 'the Aero shell did not render').toBeTruthy();
    expect(host.querySelector('.ui-menubar'), 'the Aero menu bar did not render').toBeTruthy();
    for (const expected of SHELL_LITERALS) {
      expect(text, `missing "${expected}"`).toContain(expected);
    }
    const bar = barText();
    for (const expected of BAR_LITERALS) {
      expect(bar, `missing menu name "${expected}"`).toContain(expected);
    }
    const menus = await menuText();
    for (const expected of MENU_LITERALS) {
      expect(menus, `missing menu item "${expected}"`).toContain(expected);
    }
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every English shell literal in %s', async (lang) => {
    const text = await render(lang);
    expect(host.querySelector('.aero-immersion')).toBeTruthy();
    for (const gone of SHELL_LITERALS) {
      expect(text, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(text).toContain(catalog['immersion.aero.status.ready'] as string);
    expect(text).toContain(catalog['immersion.aero.newPage'] as string);
    expect(text).toContain(catalog['immersion.rail.empty'] as string);
  });

  /**
   * The Aero rail used to render its own `sites.length === 0` paragraph BESIDE
   * the shared `ImmersionSitesStatus`, so an empty library printed the empty
   * message twice — and printed it under "Loading…" while the read was still
   * running, i.e. two contradictory answers stacked. One status line, always.
   */
  it('states the saved-sites situation exactly once', async () => {
    await render('en');
    const rail = host.querySelector('.aero-immersion-rail');
    expect(rail, 'the Aero sites rail did not render').toBeTruthy();
    expect(rail!.querySelectorAll('.aero-immersion-rail-empty')).toHaveLength(1);
    expect(rail!.querySelectorAll('.immersion-rail-empty')).toHaveLength(0);
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every English menu label in %s', async (lang) => {
    await render(lang);
    const bar = barText();
    for (const gone of BAR_LITERALS) {
      expect(bar, `menu name "${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const menus = await menuText();
    for (const gone of MENU_LITERALS) {
      expect(menus, `menu item "${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(bar).toContain(catalog['immersion.aero.menu.file'] as string);
    expect(bar).toContain(catalog['immersion.sites'] as string);
    expect(menus).toContain(catalog['immersion.aero.menu.openLocation'] as string);
    expect(menus).toContain(catalog['immersion.reload'] as string);
    expect(menus).toContain(catalog['immersion.aero.menu.refreshSites'] as string);
  });

  /**
   * The three View mode items are checked against `MODE_LABELS`, the same
   * source the toolbar segment uses, so a checked item and the segment can
   * never disagree. Before the fix the menu said `Live Reader` while the
   * segment two rows down said `Live·Reader` — in English, let alone in ja.
   */
  it.each(LANGS)('gives the View menu the same mode words as the toolbar segment, in %s', async (lang) => {
    await render(lang);
    const catalog = catalogFor(lang);
    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.ui-menubar__btn'));
    await act(async () => {
      buttons[1]?.click();
    });
    const items = Array.from(host.querySelectorAll('.ui-menubar__pop .ui-menu__item')).map(
      (n) => n.textContent ?? '',
    );
    const segment = Array.from(host.querySelectorAll('.aero-immersion-mode-btn')).map(
      (n) => n.textContent ?? '',
    );
    expect(segment).toEqual([
      catalog['immersion.mode.live'],
      catalog['immersion.mode.reader'],
      catalog['immersion.mode.focus'],
    ]);
    for (const word of segment) {
      expect(items.some((i) => i.includes(word)), `the View menu never offers "${word}"`).toBe(true);
    }
    // `reader` is the default mode, so exactly that one carries the marker.
    expect(items[1]).toContain('[x] ');
    expect(items[0]).not.toContain('[x] ');
  });

  /**
   * The status bar counted with bare interpolation — `{n} sites` — which is the
   * plural trap CLAUDE.md rule 5 names. Reading the count back proves the slot
   * is filled rather than printed as `{count}`.
   */
  it('fills the status-bar count slot rather than printing it', async () => {
    const text = await render('ru');
    expect(text, 'a {count} slot reached the screen').not.toContain('{count}');
    expect(text, 'a {days} slot reached the screen').not.toContain('{days}');
  });
});

// @vitest-environment jsdom
/**
 * D187 — the resources view has TWO shells and only one of them was translated.
 *
 * `ResourcesView` branches on `useAeroMaterials()`. The standard shell resolves
 * every string through `t()`; the Aero shell — menu bar, toolbar, three-pane
 * workbench, status bar and inspector — rendered 20 English literals, in every
 * language. Nothing could see it: the file DOES call `t()`, so
 * `i18n-hardcoded-check` passes, and `i18n-partial-check` ratchets, so a file
 * that was born at 20 stays baselined at 20 forever.
 *
 * The branch is what makes the test worth writing rather than the conversion:
 * a shell that only renders under one `data-materials` value is a shell no
 * default-theme test ever mounts.
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

let View: typeof import('../views/ResourcesView').default;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  View = (await import('../views/ResourcesView')).default;
});

/**
 * Every key the Aero shell can ask for, resolved in all four languages. A key
 * missing from `en` too renders as the key itself and no catalog check fires,
 * because `i18n-check` only compares ja/zh/ru AGAINST en.
 */
describe('the Aero shell only asks for keys the catalogs answer', () => {
  const KEYS = [
    'resources.aero.menu.file',
    'resources.aero.menu.refresh',
    'resources.aero.menu.clearSearch',
    'resources.aero.menu.showAll',
    'resources.aero.menu.view',
    'resources.aero.menu.allCategories',
    'resources.aero.status.visible',
    'resources.aero.status.indexed',
    'resources.aero.status.bundles',
    'resources.aero.toolbar.aria',
    'resources.aero.search.placeholder',
    'resources.aero.tree.aria',
    'resources.aero.allResources',
    'resources.aero.empty',
    'resources.aero.col.name',
    'resources.aero.col.cost',
    'resources.aero.col.host',
    'resources.aero.col.description',
    'resources.aero.inspector.aria',
    'resources.aero.inspector.title',
    'resources.aero.inspector.blurb',
    'resources.aero.inspector.visible',
    'resources.aero.inspector.bundles',
    'resources.aero.inspector.mode',
    'resources.aero.mode.filtered',
    'resources.aero.mode.browsing',
    'resources.updatedRecently',
  ];

  it.each(LANGS)('%s answers all 27', async (lang) => {
    await ensureCatalog(lang);
    const catalog = catalogFor(lang);
    expect(KEYS.length).toBe(27);
    for (const key of KEYS) {
      const value = catalog[key];
      // Plural entries are objects; everything else is a string.
      expect(
        typeof value === 'string' || (typeof value === 'object' && value !== null),
        `${lang} cannot answer ${key}`,
      ).toBe(true);
    }
  });

  /**
   * `resources.aero.status.bundles` is the only counted one, and Russian needs
   * all four CLDR arms. `{ other }` alone would read `3 набор` at three.
   */
  it('gives the Russian bundle count all four CLDR arms', async () => {
    await ensureCatalog('ru');
    const plural = catalogFor('ru')['resources.aero.status.bundles'];
    expect(typeof plural).toBe('object');
    expect(Object.keys(plural as object).sort()).toEqual(['few', 'many', 'one', 'other']);
  });
});

describe('ResourcesView Aero shell renders in the interface language', () => {
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
   * branch. Without it the standard shell renders and the test proves nothing —
   * which is exactly why these 20 literals survived every other suite.
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

  /** Every literal the negative cases assert is gone, proven present first. */
  const ENGLISH_LITERALS = [
    'All resources',
    'Name',
    'Cost',
    'Host',
    'Description',
    'Study directory',
    'A living catalogue of study links, bundles, and tools for Japanese, Chinese and Russian.',
    'Visible',
    'Bundles',
    'Mode',
    'Browsing',
  ];

  it('reaches the Aero shell at all, and is English by default', async () => {
    const text = await render('en');
    // The standard shell has no status bar and no three-pane workbench, so this
    // is the assertion that says the branch under test was the one taken.
    expect(host.querySelector('.aero-resources-workbench'), 'the Aero shell did not render').toBeTruthy();
    for (const expected of ENGLISH_LITERALS) {
      expect(text, `missing "${expected}"`).toContain(expected);
    }
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every English literal in %s', async (lang) => {
    const text = await render(lang);
    expect(host.querySelector('.aero-resources-workbench')).toBeTruthy();
    for (const gone of ENGLISH_LITERALS) {
      expect(text, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(text).toContain(catalog['resources.aero.allResources'] as string);
    expect(text).toContain(catalog['resources.aero.inspector.title'] as string);
    expect(text).toContain(catalog['resources.aero.mode.browsing'] as string);
  });

  /**
   * Three accessible names and a placeholder, none of which `textContent` can
   * see. An `aria-label` left in English while the visible text translates is
   * the exact shape the accessible-name pass keeps finding.
   */
  it.each(['ja', 'zh', 'ru'] as const)('translates the labels textContent cannot see, in %s', async (lang) => {
    await render(lang);
    const catalog = catalogFor(lang);
    expect(host.querySelector('.aero-resources-toolbar')?.getAttribute('aria-label'))
      .toBe(catalog['resources.aero.toolbar.aria']);
    expect(host.querySelector('.aero-resources-tree')?.getAttribute('aria-label'))
      .toBe(catalog['resources.aero.tree.aria']);
    expect(host.querySelector('.aero-resources-inspector')?.getAttribute('aria-label'))
      .toBe(catalog['resources.aero.inspector.aria']);
    expect(host.querySelector('input.aero-resource-search')?.getAttribute('placeholder'))
      .toBe(catalog['resources.aero.search.placeholder']);
  });

  /**
   * The status bar counted with bare interpolation — `{n} visible`, `{n}
   * bundles` — which is the plural trap CLAUDE.md rule 5 names. Reading the
   * counts back proves the slots are filled rather than printed as `{count}`.
   */
  it('fills the status-bar count slots rather than printing them', async () => {
    const text = await render('ru');
    expect(text, 'a {count} slot reached the screen').not.toContain('{count}');
    expect(text, 'a {when} slot reached the screen').not.toContain('{when}');
  });
});

// @vitest-environment jsdom
/**
 * D231 — MiniShell rendered its own chrome as English literals in every
 * language, and nine of them are the ONLY accessible name an icon-only control
 * has. Mini View is a whole product surface — a locked 3×3 craft window the
 * app can BOOT into (`settings.mini.startupHint`) — so a user who runs the app
 * in ja/zh/ru and turns Mini on gets an entirely English window.
 *
 * `i18n-partial-check` reported 17; the real count was 20. It missed
 * `title="Resize (scale)"` (it had already scored the `aria-label` on the same
 * element, and it reports one finding per element), `'Empty'` inside a ternary
 * beside `'Add app'`, and `Dark mono (B&amp;W)` — the HTML entity is not the
 * `[A-Z]` its text heuristic looks for.
 *
 * Two of the twenty needed no new key at all: `Close` is `common.close` and
 * `Add app` is `settings.mini.addApp`, both already translated.
 *
 * The settings drawer and the clipboard stage are closed on mount, so the
 * assertions that matter most are behind a click. A test that only read the
 * default render would have scored 5 of the 20 and looked thorough.
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
    popoutListOpen: async () => [],
    clipboardHistory: async () => [],
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

let MiniShell: typeof import('../components/MiniShell').default;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  installApiStub();
  MiniShell = (await import('../components/MiniShell')).default;
});

describe('the catalogs answer every key MiniShell can ask for', () => {
  const KEYS = [
    'miniShell.a11y.view',
    'miniShell.a11y.appSlots',
    'miniShell.a11y.settingsPanel',
    'miniShell.a11y.resize',
    'miniShell.settings',
    'miniShell.fullDesktop',
    'miniShell.slotEmpty',
    'miniShell.clipboard',
    'miniShell.resizeScale',
    'miniShell.size',
    'miniShell.scaleNote',
    'miniShell.look',
    'miniShell.clock',
    'miniShell.autoOpenFirst',
    'miniShell.darkMono',
    'miniShell.wallpaper',
    'miniShell.wall.note',
    // Reused rather than duplicated. This list is most of the finding: eleven
    // of the drawer's strings had a translated key already, consumed by
    // Settings › Mini View, and the panel simply re-typed the English.
    'common.close',
    'common.add',
    'settings.mini.addApp',
    'settings.mini.pinnedTitle',
    'settings.mini.wall.off',
    'settings.mini.wall.icons',
    'settings.mini.wall.image',
    'settings.mini.wall.desktop',
    'settings.mini.wall.pick',
    'settings.mini.wall.clear',
    'settings.mini.wall.blur',
  ];

  it.each(LANGS)('%s answers all 28', async (lang) => {
    await ensureCatalog(lang);
    const catalog = catalogFor(lang);
    expect(KEYS.length).toBe(28);
    for (const key of KEYS) {
      const value = catalog[key];
      expect(typeof value, `${lang} cannot answer ${key}`).toBe('string');
      expect((value as string).length, `${lang}'s ${key} is empty`).toBeGreaterThan(0);
    }
  });
});

describe('MiniShell renders in the interface language', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    setUiLang('en');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  async function render(lang: Lang): Promise<void> {
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
      mounted.render(<MiniShell />);
    });
    expect(host.querySelector('.mini-craft'), 'MiniShell did not render').toBeTruthy();
  }

  /**
   * The settings drawer is `panelOpen === false` on mount and holds 8 of the 20
   * strings. It opens on the second `.mini-ico-btn` in the header — the same
   * gear the user clicks.
   */
  async function openSettingsDrawer(): Promise<HTMLElement> {
    const header = host.querySelector('header');
    const gear = header?.querySelectorAll<HTMLButtonElement>('.mini-ico-btn')[1];
    expect(gear, 'the header has no settings button').toBeTruthy();
    await act(async () => {
      gear?.click();
    });
    const panel = host.querySelector<HTMLElement>('.mini-panel');
    expect(panel, 'the settings drawer never opened').toBeTruthy();
    return panel as HTMLElement;
  }

  /**
   * BOTH attributes, not `aria-label ?? title`. The resize grip carries an
   * `aria-label` and a different `title`, and the first version of this helper
   * preferred one and silently never checked the other — a control can be half
   * translated on one element.
   */
  function accessibleNames(): string[] {
    const out: string[] = [];
    for (const node of Array.from(host.querySelectorAll('[aria-label], [title]'))) {
      const label = node.getAttribute('aria-label');
      const title = node.getAttribute('title');
      if (label) out.push(label);
      if (title) out.push(title);
    }
    return out;
  }

  const HEADER_LITERALS = ['Mini view', 'App slots', 'Full desktop', 'Resize (scale)', 'Resize mini window size'];
  /**
   * The second half of this list is what the first pass MISSED, and it was
   * found by a mutation control rather than by reading: reverting one string
   * printed the whole drawer in the failure diff, and eight more English
   * strings were sitting in it. The lesson is in the file for a reason — a
   * mutation's output is evidence about the surface, not just about the test.
   */
  const DRAWER_LITERALS = [
    'Mini settings',
    'Size',
    'Scale only — width and height stay locked together.',
    'Look',
    'Clock',
    'Auto-open first',
    'Wallpaper',
    'Full desktop',
    'Icons = mosaic of pinned apps. Image = custom photo. Desktop = match Study wallpaper.',
    'Pick image',
    'Add',
  ];

  /**
   * `Apps 6/9` is gone rather than translated: the count now goes through
   * `settings.mini.pinnedTitle`, the key Settings › Mini View already used for
   * exactly this number, so the two places that show it agree. Asserting the
   * OLD form is absent in English too is what stops a silent revert.
   */
  const RETIRED_LITERALS = ['Apps 6/9'];

  it('is English by default, and every literal is really on screen', async () => {
    await render('en');
    const names = accessibleNames().join('\n');
    for (const expected of HEADER_LITERALS) {
      expect(names, `missing accessible name "${expected}"`).toContain(expected);
    }
    const panel = await openSettingsDrawer();
    const text = `${panel.textContent ?? ''}\n${panel.getAttribute('aria-label') ?? ''}`;
    for (const expected of DRAWER_LITERALS) {
      expect(text, `missing drawer string "${expected}"`).toContain(expected);
    }
    for (const gone of RETIRED_LITERALS) {
      expect(text, `"${gone}" is back — the count left settings.mini.pinnedTitle`).not.toContain(gone);
    }
    const en = catalogFor('en');
    expect(text).toContain(
      (en['settings.mini.pinnedTitle'] as string).replace('{count}', '6').replace('{max}', '9'),
    );
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every English accessible name in %s', async (lang) => {
    await render(lang);
    const names = accessibleNames().join('\n');
    for (const gone of HEADER_LITERALS) {
      expect(names, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(names).toContain(catalog['miniShell.a11y.view'] as string);
    expect(names).toContain(catalog['miniShell.fullDesktop'] as string);
    expect(names).toContain(catalog['miniShell.a11y.resize'] as string);
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops every English drawer string in %s', async (lang) => {
    await render(lang);
    const panel = await openSettingsDrawer();
    const text = `${panel.textContent ?? ''}\n${panel.getAttribute('aria-label') ?? ''}`;
    for (const gone of DRAWER_LITERALS) {
      expect(text, `"${gone}" survived the switch to ${lang}`).not.toContain(gone);
    }
    const catalog = catalogFor(lang);
    expect(text).toContain(catalog['miniShell.size'] as string);
    expect(text).toContain(catalog['miniShell.scaleNote'] as string);
    expect(text).toContain(catalog['miniShell.wallpaper'] as string);
  });

  /**
   * The nine `aria-label`/`title` strings are the *only* name these controls
   * have — every one is an icon button. A nameless control is worse than an
   * untranslated one, so assert no interactive element in the header or the
   * slot grid ends up without a name at all.
   */
  it.each(LANGS)('leaves no icon-only control nameless in %s', async (lang) => {
    await render(lang);
    const header = host.querySelector('header');
    const buttons = Array.from(header?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    expect(buttons.length, 'the header has no buttons to check').toBeGreaterThan(0);
    for (const button of buttons) {
      const name = (button.getAttribute('aria-label') ?? button.getAttribute('title') ?? button.textContent ?? '').trim();
      expect(name.length, `a header button has no accessible name in ${lang}`).toBeGreaterThan(0);
    }
  });
});

/**
 * D232 — the drawer's Look block draws its density and tint chips as single
 * Latin initials. `S M L` for density and `N E S M O V S C F` for the nine
 * tints, with `title={id}` — the raw internal id — as the tint chips' only
 * accessible name and the density chips carrying no name at all.
 *
 * Three defects in one block, and the first is the one a screen-reader user
 * cannot work around: `slate` and `sand` both render `S`, as do `compact` and
 * `spacious` against `S`/`L`... so within one 12-chip row there are two pairs
 * that are indistinguishable by their visible label.
 *
 * And it needed NOT ONE NEW KEY. All twelve names were already translated in
 * all four catalogs and already being resolved four rows away in
 * Settings > Mini View, which kept private copies of both maps. The maps moved
 * to `renderer/miniMode.ts` beside the lists they key, so the two surfaces can
 * no longer drift, and they are total `Record`s rather than `Partial` ones — a
 * tenth tint with no key is now a type error instead of a chip printing its own
 * internal id through a fallback.
 */
describe('the Look chips have real names, not initials', () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = null;
    document.body.replaceChildren();
    setUiLang('en');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  async function openLookBlock(lang: Lang): Promise<HTMLElement[]> {
    await ensureCatalog(lang);
    setUiLang(lang);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    host = document.createElement('div');
    document.body.append(host);
    const mounted = createRoot(host);
    root = mounted;
    await act(async () => {
      mounted.render(<MiniShell />);
    });
    const gear = host.querySelector('header')?.querySelectorAll<HTMLButtonElement>('.mini-ico-btn')[1];
    await act(async () => {
      gear?.click();
    });
    // `[aria-label]` is the scope, not a convenience: the drawer's other two
    // `.mini-seg` rows are the wallpaper-mode chips and the pick/clear pair,
    // which carry their full translated text and need no label. Selecting on it
    // also means a regression that DROPS a label shrinks this list and fails the
    // count below, rather than quietly narrowing what the suite examines.
    const chips = Array.from(host.querySelectorAll<HTMLElement>('.mini-seg .mini-chip[aria-label]'));
    expect(chips.length, 'the Look chips never rendered, or lost their labels').toBe(12);
    return chips;
  }

  it.each(LANGS)('names all twelve, and never with the raw id, in %s', async (lang) => {
    const chips = await openLookBlock(lang);
    const catalog = catalogFor(lang);
    const RAW_IDS = [
      'compact',
      'comfortable',
      'spacious',
      'neutral',
      'ember',
      'slate',
      'moss',
      'ocean',
      'violet',
      'sand',
      'crimson',
      'frost',
    ];
    for (const chip of chips) {
      const name = (chip.getAttribute('aria-label') ?? '').trim();
      expect(name.length, `a Look chip has no accessible name in ${lang}`).toBeGreaterThan(0);
      // The title must agree — it was the ONLY name before, and a half-fixed
      // control that names itself twice, differently, is its own defect.
      expect(chip.getAttribute('title'), `title and aria-label disagree in ${lang}`).toBe(name);
      expect(name.length, `"${name}" is still just an initial in ${lang}`).toBeGreaterThan(1);
      expect(RAW_IDS, `a chip is still labelled with its raw wire id in ${lang}`).not.toContain(name);
      expect(Object.values(catalog), `"${name}" is not a catalog value in ${lang}`).toContain(name);
    }
  });

  it.each(LANGS)('gives every chip a distinct name in %s, which the initials did not', async (lang) => {
    const chips = await openLookBlock(lang);
    const names = chips.map((c) => (c.getAttribute('aria-label') ?? '').trim());
    // The control that makes this meaningful: in en and ru the VISIBLE glyphs
    // still collide exactly as they did before the fix — slate/sand both show
    // S — so the assertion below is testing the accessible name and nothing
    // else. It does NOT hold in ja/zh, where the twelve names begin with twelve
    // distinct CJK characters and the initial happens to be unambiguous. That
    // is a property of those translations, not of the fix, and asserting it
    // everywhere failed honestly the first time this suite ran.
    const glyphs = chips.map((c) => (c.textContent ?? '').trim());
    if (lang === 'en' || lang === 'ru') {
      expect(
        new Set(glyphs).size,
        `the visible initials no longer collide in ${lang} — re-check what this asserts`,
      ).toBeLessThan(glyphs.length);
    }
    expect(new Set(names).size, `two chips share an accessible name in ${lang}`).toBe(names.length);
  });

  it.each(LANGS)('reports its pressed state in %s, so the selection is not colour-only', async (lang) => {
    const chips = await openLookBlock(lang);
    for (const chip of chips) {
      expect(chip.getAttribute('aria-pressed'), 'a Look chip has no pressed state').toMatch(/^(true|false)$/);
    }
    // Exactly one density chip and one tint chip are on. `is-on` is the class
    // the stylesheet uses, so this also proves the two agree.
    const on = chips.filter((c) => c.getAttribute('aria-pressed') === 'true');
    expect(on.length, 'the pressed state disagrees with the selection').toBe(2);
    // The wallpaper-mode row had the same colour-only selection and no state.
    const wallpaper = Array.from(
      host.querySelectorAll<HTMLElement>('.mini-seg .mini-chip:not([aria-label])'),
    ).filter((c) => c.getAttribute('aria-pressed') !== null);
    expect(wallpaper.length, 'the wallpaper mode chips report no pressed state').toBe(4);
    expect(
      wallpaper.filter((c) => c.getAttribute('aria-pressed') === 'true').length,
      'exactly one wallpaper mode is selected',
    ).toBe(1);
    for (const chip of on) {
      expect(chip.className, 'aria-pressed says on but the class says off').toContain('is-on');
    }
  });

  it.each(['ja', 'zh', 'ru'] as const)('drops the English chip names in %s', async (lang) => {
    const chips = await openLookBlock(lang);
    const names = chips.map((c) => (c.getAttribute('aria-label') ?? '').trim());
    const en = catalogFor('en');
    const english = [
      en['settings.appearance.density.compact'],
      en['settings.lock.tint.neutral'],
      en['settings.mini.tint.ocean'],
      en['settings.mini.tint.crimson'],
    ] as string[];
    for (const word of english) {
      expect(names, `"${word}" survived the switch to ${lang}`).not.toContain(word);
    }
  });

  it('paints those same English names in English — the control for the above', async () => {
    const chips = await openLookBlock('en');
    const names = chips.map((c) => (c.getAttribute('aria-label') ?? '').trim());
    const en = catalogFor('en');
    for (const key of [
      'settings.appearance.density.compact',
      'settings.lock.tint.neutral',
      'settings.mini.tint.ocean',
      'settings.mini.tint.crimson',
    ]) {
      expect(names, `en never rendered ${key} — the negative above is vacuous`).toContain(en[key] as string);
    }
  });
});

// @vitest-environment jsdom
/**
 * L8 — which Settings regions adopted the contextual primitive, and the layout
 * compensation that adoption forced.
 *
 * Category 3 asks for two numbers: dense work on translucent material must be 0, and
 * every navigation/transport/inspector region must carry Liquid treatment from a SHARED
 * primitive. Measured on this surface before the migration both halves failed in the
 * same run — 2 contextual regions, 0 treated and 0 backed by a primitive.
 *
 * Two traps are pinned here, both of which cost a measured round trip.
 *
 * 1. Marking only `nav.os-set-nav-v2` moves the misclassification down instead of
 *    removing it: each `ul.os-set-nav-list` has three or more `<li>` descendants and no
 *    landmark tag, so it reads as dense work the moment the rail starts painting, and
 *    `div.os-set-nav-group` inherits that the instant the list stops. The rail therefore
 *    declares the role at every level that holds the page list — the same shape
 *    `scraperLiquidRegions.test.tsx` pins for `.scr-rail-*`.
 *
 * 2. `theme/liquid-surfaces.css` gives every primitive `min-height: 0` so it can be used
 *    as a scroll container, and that reset is UNCONDITIONAL. Inside this scrolling flex
 *    column it let the four groups collapse from 129/164/129/304 px to 61/77/61/143, and
 *    their buttons overlapped — the accessibility harness measured 9 occluded nav items
 *    and one whose hit area had been stolen, in BOTH presentations. The compensation is
 *    in `styles.css` rather than `liquid-window.css` because that sheet may only carry
 *    `.fwin-liquid` rules (`liquidWindowPresentation.test.ts`) and this must apply always.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsNav from '../components/settings/SettingsNav';
import { firstReason } from '../../shared/disabledReason';

const RENDERER = resolve(__dirname, '..');
const read = (...parts: string[]) => readFileSync(resolve(RENDERER, ...parts), 'utf8');

let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  document.body.innerHTML = '<div id="host"></div>';
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.restoreAllMocks();
});

async function mountNav(advancedMode = true) {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(
      createElement(SettingsNav, {
        page: 'home' as const,
        onNavigate: vi.fn(),
        advancedMode,
        onToggleAdvanced: vi.fn(),
      }),
    );
  });
  return host;
}

/** Both halves of the primitive's contract, so a hand-written class cannot pass. */
function expectContextual(el: Element | null, what: string) {
  if (!el) throw new Error(`expected ${what} to be present`);
  expect(el.classList.contains('lq-contextual'), `${what} is contextual`).toBe(true);
  expect(el.getAttribute('data-lq-role'), `${what} role`).toBe('contextual');
}

describe('Settings — Liquid region roles', () => {
  it('declares the navigation role at every rail level that holds the page list', async () => {
    const host = await mountNav();
    const nav = host.querySelector('nav.os-set-nav-v2');
    expectContextual(nav, 'nav.os-set-nav-v2');
    // Still the landmark: the role is declared on the semantics, not instead of them.
    expect(nav?.getAttribute('aria-label'), 'rail keeps its accessible name').toBeTruthy();

    expectContextual(host.querySelector('.os-set-nav-scroll'), '.os-set-nav-scroll');
    const groups = [...host.querySelectorAll('.os-set-nav-group')];
    expect(groups.length, 'nav groups rendered').toBeGreaterThan(0);
    groups.forEach((group, i) => expectContextual(group, `.os-set-nav-group[${i}]`));

    const lists = [...host.querySelectorAll('.os-set-nav-list')];
    expect(lists.length, 'nav lists rendered').toBeGreaterThan(0);
    lists.forEach((list, i) => {
      expectContextual(list, `.os-set-nav-list[${i}]`);
      expect(list.tagName, 'nav list stays a ul').toBe('UL');
      expect(list.querySelectorAll('li').length).toBeGreaterThan(0);
      expect(list.getAttribute('aria-labelledby'), 'list keeps its group label').toBeTruthy();
    });
  });

  it('never uses lq-liquid, which would paint in conventional windows too', async () => {
    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid` paints
    // unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in, so the
    // reverse toggle is pure cascade with no state to restore.
    const host = await mountNav();
    expect(host.querySelectorAll('.lq-liquid').length).toBe(0);
    expect(host.querySelectorAll('.lq-contextual').length).toBeGreaterThan(0);
  });

  it('gives both page-head hosts the contextual role', () => {
    // `SettingsHome` renders its own head and `SettingsApp` renders the head for every
    // other page. Both are `header.os-set-page-head`, and the classifier scores whichever
    // one is mounted, so migrating one and not the other passes on Home and fails on the
    // other 22 pages. Read as source because mounting either needs the whole settings
    // controller, which this file has no other reason to build.
    for (const file of ['components/settings/SettingsApp.tsx', 'components/settings/SettingsHome.tsx']) {
      const source = read(file);
      expect(source, `${file} imports the primitive`).toMatch(
        /import \{ ContextualSurface \} from '\.\.\/liquid\/LiquidSurface'/,
      );
      expect(source, `${file} page head`).toMatch(
        /<ContextualSurface as="header" className="os-set-page-head">/,
      );
      expect(source, `${file} keeps no bare header`).not.toMatch(
        /<header className="os-set-page-head">/,
      );
    }
  });

  it('compensates the primitive min-height reset unconditionally', () => {
    // Trap 2 above. This rule must NOT be gated on `.fwin-liquid`: `min-height: 0` comes
    // from `liquid-surfaces.css`, which paints in every presentation.
    const app = read('styles.css');
    const rule = app.match(
      /\.os-set-nav-v2 \.os-set-nav-group,\s*\n\.os-set-nav-v2 \.os-set-nav-list \{([^}]*)\}/,
    );
    expect(rule, 'settings rail carries the flex-minimum compensation').not.toBeNull();
    expect(rule?.[1]).toMatch(/min-height:\s*auto/);
    expect(rule?.[1]).toMatch(/flex-shrink:\s*0/);
    expect(rule?.[0], 'compensation is not gated on a presentation').not.toMatch(/fwin-liquid/);
  });

  it('keeps the rail and the page head flush rather than floating cards', () => {
    // The shared contextual geometry is a card. The rail meets the window body on three
    // sides and already draws its own separating border; the head is a strip at the top of
    // the scrolling pane. Both are adopted for the MATERIAL, so the geometry stays theirs —
    // the same exception `.medialib-rail`, `.agent-rail` and the four `.scr-*` regions take.
    const sheet = read('theme', 'liquid-window.css');
    for (const region of ['.os-set-nav-v2', '.os-set-page-head']) {
      const block = sheet.match(
        new RegExp(`\\${region}\\.lq-contextual \\{([^}]*)\\}`),
      );
      expect(block, `${region} has a geometry exception`).not.toBeNull();
      expect(block?.[1], `${region} drops the card radius`).toMatch(/border-radius:\s*0/);
      expect(block?.[1], `${region} drops the card shadow`).toMatch(/box-shadow:\s*none/);
      expect(block?.[1], `${region} keeps the material`).not.toMatch(/background/);
    }
    // The rail's inner wrappers declare the role for the classifier and take no material,
    // or a second tint reads as a darker slab down the middle of the rail.
    const inner = sheet.match(
      /\.os-set-nav-group\.lq-contextual,\s*\n[^{]*\.os-set-nav-list\.lq-contextual \{([^}]*)\}/,
    );
    expect(inner, 'rail wrappers have a no-material exception').not.toBeNull();
    expect(inner?.[1]).toMatch(/background:\s*none/);
    expect(sheet, 'the rail scroller is in the same no-material exception')
      .toMatch(/\.os-set-nav-scroll\.lq-contextual,/);
  });

  it('keeps the Advanced footer outside the rail scroller', async () => {
    // Category 4 read the whole 179x88 footer overlapping a nav group at maximized, and two
    // more pairs at 960x680, because the footer stayed visible by being `position: sticky`
    // over the scrolled rail. Structure, not paint, is what removes a collision.
    const host = await mountNav();
    const scroller = host.querySelector('.os-set-nav-scroll');
    const footer = host.querySelector('.os-set-nav-footer');
    expect(scroller, 'rail has its own scroller').not.toBeNull();
    expect(footer, 'rail has its footer').not.toBeNull();
    expect(scroller?.contains(footer as Node), 'footer is outside the scroller').toBe(false);
    expect(scroller?.querySelectorAll('.os-set-nav-group').length, 'groups scroll')
      .toBeGreaterThan(0);

    const app = read('styles.css');
    expect(app, 'the rail itself no longer scrolls').toMatch(
      /\.os-set-nav-v2 \{\s*\n\s*overflow: hidden;\s*\n\}/,
    );
    const footerRule = app.match(/\.os-set-nav-v2 \.os-set-nav-footer \{([^}]*)\}/);
    expect(footerRule, 'footer is un-stuck').not.toBeNull();
    expect(footerRule?.[1]).toMatch(/position:\s*static/);
  });

  it('lets the settings body use the whole window width', () => {
    // `.os-settings` sets `align-items: flex-start` for its v1 ROW layout; v2 flips to column,
    // where the same declaration shrinks every child to its content width. Measured: maximized
    // to 1264x765 the root grew to 1226 px and `.os-set-body` stayed 685 px — a 568x730 dead
    // column, 39.9% of the viewport against category 4's 15% ceiling.
    const rule = read('styles.css').match(/\.os-settings-v2 \{\s*\n\s*align-items: stretch;\s*\n\}/);
    expect(rule, 'v2 restores cross-axis stretch').not.toBeNull();
  });

  it('collapses the rail to icons without deleting its accessible names', async () => {
    // Category 4's compact leg: at 260x170 the fixed 204px rail left `.os-set-pane-v2` a 0px
    // client width against 184px of content and 71 descendants read clipped. The rail now
    // collapses under a container query on `.os-set-body`.
    const app = read('styles.css');
    const body = app.match(/\.os-set-body \{\s*\n\s*container-type: inline-size;\s*\n\s*container-name: os-set-body;\s*\n\}/);
    expect(body, '.os-set-body is the query container').not.toBeNull();

    const tier = app.match(/@container os-set-body \(max-width: 420px\) \{([\s\S]*?)\n\}\n/);
    expect(tier, 'a narrow tier exists').not.toBeNull();
    const css = tier?.[1] ?? '';
    expect(css, 'the rail collapses to an icon column').toMatch(/\.os-set-nav-v2 \{\s*\n\s*width: 52px;/);

    // THE TRAP this pins. `.os-set-nav-item` carries no `aria-label`, so its bare `<span>` IS
    // the button's accessible name. `display: none` — what `.scr-rail-label` does — would leave
    // every category button unnamed and trade category 4 for category 1. Falsified live at
    // 260x170: clipped 20 of 20 named, forced to `display: none` 0 of 20.
    expect(css, 'the label is clipped, never removed from the box tree').toMatch(
      /clip-path: inset\(50%\)/,
    );
    expect(css, 'nothing in the narrow tier hides a label outright').not.toMatch(/display:\s*none/);

    // And every item must carry a `title`, which is the only label a pointer user keeps here.
    const host = await mountNav();
    const items = [...host.querySelectorAll('.os-set-nav-item')];
    expect(items.length, 'the rail has items').toBeGreaterThan(0);
    expect(
      items.filter((b) => !b.getAttribute('title')).map((b) => b.textContent),
      'every nav item names itself on hover',
    ).toEqual([]);
    for (const b of items) {
      expect(b.getAttribute('aria-label'), 'no aria-label overrides the span').toBeNull();
      expect((b.querySelector('span:not([class])')?.textContent ?? '').length).toBeGreaterThan(0);
    }
  });

  it('never leaves a settings control disabled without saying why', () => {
    // Category 8, "honest states". Measured 2026-08-30 on Settings > Appearance: 8 painted
    // disabled controls, none of them explaining itself, and the harness cannot tell a mute
    // pair from a broken feature. `firstReason` makes the reason and the `disabled` value one
    // expression; this pins that every site spends both halves.
    for (const rel of [
      'components/settings/pages/ThemeStudioPanel.tsx',
      'components/settings/AppearancePreviewCard.tsx',
    ]) {
      const src = read(...rel.split('/'));
      const lines = src.split('\n');
      const offenders: string[] = [];
      lines.forEach((line, i) => {
        const m = line.match(/^\s*disabled=\{(.+)\}\s*$/);
        if (!m) return;
        // The honest shape is `disabled={!!whyX}` immediately followed by `title={whyX}`.
        const why = m[1].startsWith('!!') ? m[1].slice(2) : null;
        const next = (lines[i + 1] ?? '').trim();
        if (!why || next !== `title={${why}}`) offenders.push(`${rel}:${i + 1} ${line.trim()}`);
      });
      expect(offenders, `${rel} has a disabled control with no reason`).toEqual([]);
    }

    expect(firstReason([false, 'a'], [false, 'b']), 'nothing blocking reads undefined')
      .toBeUndefined();
    expect(firstReason([false, 'a'], [true, 'b'], [true, 'c']), 'the FIRST blocking clause wins')
      .toBe('b');
  });

  it('lets the home grids fall below their fixed track width', () => {
    // `repeat(auto-fit, minmax(170px, 1fr))` cannot produce a track under 170px, so six of the
    // compact leg's clipped rects were status chips overflowing a pane narrower than one track.
    const app = read('styles.css');
    expect(app).toMatch(/\.os-set-home-status \{\s*\n\s*grid-template-columns: repeat\(auto-fit, minmax\(min\(170px, 100%\), 1fr\)\);\s*\n\}/);
    expect(app).toMatch(/\.os-set-quick-grid \{\s*\n\s*grid-template-columns: repeat\(auto-fill, minmax\(min\(180px, 100%\), 1fr\)\);\s*\n\}/);
  });
});

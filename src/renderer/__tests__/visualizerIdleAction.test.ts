import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';

const content = readFileSync(
  resolve(__dirname, '..', 'components', 'visualizer', 'VisualizerContent.tsx'),
  'utf8',
);
const section = readFileSync(resolve(__dirname, '..', 'components', 'AppSection.tsx'), 'utf8');
const settingsApp = readFileSync(
  resolve(__dirname, '..', 'components', 'settings', 'SettingsApp.tsx'),
  'utf8',
);
const dockCss = readFileSync(
  resolve(__dirname, '..', 'components', 'visualizer', 'visualizerWidgetLiquid.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');
const sharedSurfaces = readFileSync(
  resolve(__dirname, '..', 'theme', 'liquid-surfaces.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('Visualizer idle recovery action', () => {
  it('uses the shared localized Music command and a real Study OS navigation action', () => {
    expect(content).toContain("t('commands.nav.open.music')");
    expect(content).not.toContain('play a song in Music');
    expect(content).toContain('data-viz-action="music"');
    expect(content).toContain('onClick={onOpenMusic}');
    expect(content).toContain('<span className={classes.hint}>{hint}</span>');
    // Was `new CustomEvent('os:open', …)` until L9's Music-widget slice. That
    // dispatch is real on the desktop and a DEAD BUTTON inside
    // `?popout=visualizer`/`?popout=musicwidget`, which mount no DesktopShell.
    // `openSectionSurface` keeps the desktop route and adds the pop-out
    // fallback, so the assertion moved rather than being dropped.
    expect(section).toContain("openSectionSurface('music')");
  });

  it('keeps navigation in one labelled contextual edge dock', () => {
    expect(content).toContain('className="viz-widget-dock"');
    expect(content).toContain('role="toolbar"');
    expect(content).toContain('data-viz-action="settings"');
    expect(section).toContain("detail: { page: 'visualizer', settingId: 'visualizer' }");
    // Visualizer is an advanced Settings page. A direct event that calls ordinary navigate
    // is bounced straight back Home when Advanced mode is off, so the route must carry the
    // same temporary guided exemption as the Agent's explicit settings handoff.
    expect(settingsApp).toContain("navigate(d.page, d.settingId, { guided: true })");
    expect(settingsApp).toContain('setGuidedPage(options?.guided ? next : null)');
  });

  it('anchors the dock to the stage against the shared role class it shares an element with', () => {
    /*
     * `ContextualSurface` renders `lq-contextual viz-widget-dock`, and
     * `theme/liquid-surfaces.css` declares `position: relative` on `.lq-contextual`
     * at the SAME (0,1,0) specificity from a sheet that loads later — the collision
     * `components/liquid/readingCanvas.css` records for `.lq-anchor`/`.lq-liquid`.
     *
     * Measured live through the debug bridge before the fix: the dock computed
     * `position: relative`, so `right/bottom: 8px` became a relative OFFSET rather
     * than an anchor and moved the dock UP and LEFT out of the stage — rect
     * (121,110) 78x42 against a `.viz-widget` parent at (129,118) 378x165, i.e.
     * painted on `.fwin-bar` and 8px off the window's left edge onto the desktop.
     * Both dock buttons were then occluded: the hit walk read 29.5x29.5 on a 32x32
     * rect with blockers `div.fwin-bar` and `section.fwin.fwin-viz`. After the
     * child combinator: `position: absolute`, rect (421,233), inside the parent,
     * and both buttons 32.5x32.5.
     *
     * `toMatch(/position:\s*absolute/)` passed the whole time it was broken — a
     * declaration existing is not a declaration winning — so this reads both files.
     */
    const roleBlocks = [...sharedSurfaces.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, selector]) => selector.split(',').some((s) => s.trim() === '.lq-contextual'))
      .map(([, , body]) => body)
      .join('\n');
    // The premise, asserted rather than assumed.
    expect(roleBlocks, '.lq-contextual no longer sets position').toMatch(
      /(^|[;\s])position\s*:/m,
    );

    const winners = [...dockCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(
      ([, selector, body]) =>
        selector.split(',').some((s) => s.trim().endsWith('.viz-widget-dock')) &&
        /(^|[;\s])position\s*:/m.test(body),
    );
    expect(winners.length, 'nothing declares position for .viz-widget-dock').toBeGreaterThan(0);
    for (const [, selector] of winners) {
      for (const one of selector
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.endsWith('.viz-widget-dock'))) {
        // Named, not counted: a failure here has to say which rule lost.
        expect({ selector: one, beatsRoleClass: (one.match(/\./g) ?? []).length > 1 }).toEqual({
          selector: one,
          beatsRoleClass: true,
        });
      }
    }
  });

  it('names the style control the way the dock names its routes', () => {
    // The visualizer stage has no in-window heavy control — both dock actions navigate away —
    // so the one repeatable load that leaves the window in place is a style change, and
    // category 7 has to address that control without depending on its position in the row or
    // on its translated label, which differ in each of the four locales.
    const page = readFileSync(
      resolve(__dirname, '..', 'components', 'settings', 'pages', 'VisualizerPage.tsx'),
      'utf8',
    );
    expect(page).toContain('data-viz-style={st.id}');
    expect(page).toContain('onClick={() => patchViz({ style: st.id })}');
  });

  it('keeps the reused label complete in every shared locale', () => {
    const key = 'commands.nav.open.music' as const;
    for (const catalog of [en, ja, zh, ru]) expect(catalog[key]).toBeTruthy();
  });
});

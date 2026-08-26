/**
 * Liquid Workplace L3.2 — the shell seam and the sheet.
 *
 * L3's gate is verbatim: "an unchanged sample app can switch modes and back
 * with byte-for-byte app data and equivalent observable state." L3.1 proved
 * that for the pure commands. This proves it across the SHELL's own conversion,
 * which is where the two field vocabularies (`max`/`rect`/`min` versus
 * `maximized`/`restoreRect`/`visible`) meet and where a round trip is normally
 * lost — a dropped key here would make the schema's guarantee unobservable.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { parsePresentation } from '../../shared/liquidWindowState';
import {
  canPresentLiquid,
  isWinLiquid,
  presentationFromSnapshot,
  presentationToSnapshot,
  toggleWinPresentation,
} from '../liquidWindowPresentation';

const SHEET = resolve(__dirname, '..', 'theme', 'liquid-window.css');

/**
 * The two Liquid hosts, as the sheet writes them.
 *
 * `.fwin` is the floating desktop window; `.popout-root` is the same app in its
 * own borderless OS window (`?popout=<section>`), which is not a `.fwin` at all.
 * Only the INTERIOR rules name both — a pop-out's frame is the OS window and
 * takes no material (`popoutPresentation.ts` decision 1) — so `FRAME_HOST` and
 * `INTERIOR_HOST` are deliberately different constants rather than one.
 */
const FRAME_HOST = '.fwin.fwin-liquid';
const INTERIOR_HOST = ':is(.fwin.fwin-liquid, .popout-root.popout-liquid)';

/**
 * Whether a selector is anchored on `host`.
 *
 * Written as a prefix test rather than a `^host\b` regex on purpose:
 * `INTERIOR_HOST` ends in `)`, and `\b` needs a word character on one side, so
 * the regex form silently never matched a descendant selector. The three
 * continuations below are the only ones that keep the host's own specificity —
 * the whole selector, a further compound (`.fwin-max`), or a descendant.
 */
function anchoredOn(selector: string, host: string): boolean {
  return selector === host || selector.startsWith(`${host} `) || selector.startsWith(`${host}.`);
}

/**
 * The sheet with comments removed and line endings NORMALIZED.
 *
 * The `\r` strip is load-bearing, not tidiness. This repo has
 * `core.autocrlf=true` and no `.gitattributes`, so a fresh checkout writes this
 * sheet CRLF (9,398 bytes) while a long-lived working tree holds it LF (9,211) —
 * the same 187 lines, 187 bytes apart. Any assertion below that compares a
 * multi-line selector against a template literal containing a bare `\n` then
 * passes in the tree it was written in and fails in every fresh clone, CI job
 * and new worktree, where it reads as a regression someone just caused.
 * Normalize here; never "fix" the CSS.
 */
function readRules(): string {
  return readFileSync(SHEET, 'utf8')
    .replace(/\r\n?/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

/** A `Win` as `DesktopShell` actually holds one, including the keys this module must not touch. */
function win(over: Record<string, unknown> = {}) {
  return {
    id: 'w1',
    section: 'dictionary',
    x: 120,
    y: 80,
    w: 640,
    h: 480,
    z: 7,
    min: false,
    pin: true,
    rect: { x: 10, y: 20, w: 300, h: 200 },
    ...over,
  } as Record<string, unknown> & {
    x: number; y: number; w: number; h: number; max?: boolean;
    presentation?: import('../../shared/liquidWindowState').LiquidPresentationState;
  };
}

describe('liquid window presentation — the shell seam', () => {
  it('a fresh window is conventional, and conventional is the ABSENCE of the key', () => {
    const w = win();
    expect(isWinLiquid(w)).toBe(false);
    expect('presentation' in w).toBe(false);
    // NOT `toEqual({})`: that passes for `{presentation: undefined}` too, and
    // an undefined-valued key is precisely the failure this module is written
    // to avoid. A mutation making `presentationToSnapshot` unconditional
    // survived the `toEqual` form. Assert on the key set.
    expect(Object.keys(presentationToSnapshot(w))).toEqual([]);
  });

  it('makes a window liquid without moving it', () => {
    const w = win();
    const liquid = toggleWinPresentation(w);
    expect(isWinLiquid(liquid)).toBe(true);
    // Presentation only. Entering Liquid is not a layout command.
    expect([liquid.x, liquid.y, liquid.w, liquid.h]).toEqual([120, 80, 640, 480]);
    expect(liquid.presentation?.standardRect).toEqual({ x: 120, y: 80, w: 640, h: 480 });
  });

  it('round-trips key-for-key, not merely equivalently', () => {
    const w = win();
    const back = toggleWinPresentation(toggleWinPresentation(w));
    // `toEqual` cannot see a residual `presentation: undefined`; the key set can.
    expect(Object.keys(back).sort()).toEqual(Object.keys({ ...w, max: false }).sort());
    expect(JSON.stringify(back)).toBe(JSON.stringify({ ...w, max: false }));
  });

  it('does not touch z, pin, min, section or restoreRect across a round trip', () => {
    const w = win();
    const liquid = toggleWinPresentation(w);
    for (const key of ['id', 'section', 'z', 'min', 'pin', 'rect'] as const) {
      expect(liquid[key]).toEqual(w[key]);
    }
    const back = toggleWinPresentation(liquid);
    for (const key of ['id', 'section', 'z', 'min', 'pin', 'rect'] as const) {
      expect(back[key]).toEqual(w[key]);
    }
  });

  it('a window dragged while liquid returns to where it came from', () => {
    const liquid = toggleWinPresentation(win());
    const dragged = { ...liquid, x: 900, y: 600, w: 1200, h: 700 };
    const back = toggleWinPresentation(dragged);
    expect([back.x, back.y, back.w, back.h]).toEqual([120, 80, 640, 480]);
    expect('presentation' in back).toBe(false);
  });

  it('going liquid twice does not overwrite the way home', () => {
    const once = toggleWinPresentation(win());
    // The shell can only toggle, but a re-entrant command or a replayed event
    // reaches `makeLiquid` on an already-liquid window; the captured rect must
    // survive it, or the original geometry is gone silently and permanently.
    const moved = { ...once, x: 900, y: 600 };
    expect(toggleWinPresentation(toggleWinPresentation(moved)).presentation?.standardRect).toEqual({
      x: 120, y: 80, w: 640, h: 480,
    });
  });

  it('restores the maximized flag it captured, and normalises absent to false', () => {
    const fromMax = toggleWinPresentation(win({ max: true }));
    expect(fromMax.presentation?.standardMaximized).toBe(true);
    expect(toggleWinPresentation(fromMax).max).toBe(true);
    // A window with no `max` key at all persists as `maximized: false` either
    // way (`winToSnapshot` does `!!win.max`), so the blob still round-trips.
    expect(toggleWinPresentation(toggleWinPresentation(win())).max).toBe(false);
  });
});

describe('liquid window presentation — loading a persisted blob', () => {
  it('keeps a valid liquid blob', () => {
    const parsed = presentationFromSnapshot({
      v: 1, mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 }, standardMaximized: false,
    });
    expect(parsed?.mode).toBe('liquid');
    expect(parsed?.standardRect).toEqual({ x: 1, y: 2, w: 3, h: 4 });
  });

  it.each([
    ['liquid with no rect to come back to', { v: 1, mode: 'liquid' }],
    ['liquid with a zero-size rect', { v: 1, mode: 'liquid', standardRect: { x: 0, y: 0, w: 0, h: 9 } }],
    ['a stored standard, which is normalised away', { v: 1, mode: 'standard' }],
    ['a version this build cannot read', { v: 99, mode: 'liquid', standardRect: { x: 1, y: 2, w: 3, h: 4 } }],
    ['an unknown mode', { v: 1, mode: 'frosted', standardRect: { x: 1, y: 2, w: 3, h: 4 } }],
    ['an array', []],
    ['null', null],
    ['a string', 'liquid'],
  ])('loads %s as a conventional window', (_label, blob) => {
    expect(presentationFromSnapshot(blob)).toBeUndefined();
    // And the shell then writes NO key at all, so corruption is not persisted forward.
    expect(Object.keys(presentationToSnapshot({ presentation: presentationFromSnapshot(blob) }))).toEqual([]);
  });
});

/**
 * Boss audit 2026-08-17, finding 2. The shell carried two hand-written section
 * lists for "renders liquid" and "can leave liquid" and they differed by
 * `visualizer`: that window rendered `.fwin-liquid` with no control to leave it.
 * Both now derive from `canPresentLiquid`, and the converter is gated on it too,
 * so a blob on a non-presentable section is dropped rather than written back.
 */
describe('presentability and reversibility are the same predicate', () => {
  const LIQUID = { v: 1 as const, mode: 'liquid' as const, standardRect: { x: 1, y: 2, w: 3, h: 4 } };

  it.each(['note', 'city', 'visualizer'])('%s can never present liquid', (section) => {
    expect(canPresentLiquid(section)).toBe(false);
    // The state the audit found reachable from a hand-edited layout file: a
    // well-formed blob that `parsePresentation` accepts. The gate is the
    // converter, so it cannot survive one save cycle.
    expect(parsePresentation(LIQUID)).toBeDefined();
    expect(Object.keys(presentationToSnapshot({ section, presentation: LIQUID }))).toEqual([]);
  });

  it.each(['dictionary', 'video', 'settings', 'musicwidget', 'agent'])(
    '%s presents liquid and keeps its key',
    (section) => {
      expect(canPresentLiquid(section)).toBe(true);
      expect(presentationToSnapshot({ section, presentation: LIQUID })).toEqual({ presentation: LIQUID });
    },
  );

  it('a window with no section at all is presentable, not silently stripped', () => {
    // Pop-outs and fixtures use `PresentableWin` structurally, without a
    // section. Defaulting those to NOT presentable would delete the field for
    // every such caller — the L3.2 defect over again, in the other direction.
    expect(canPresentLiquid(undefined)).toBe(true);
    expect(presentationToSnapshot({ presentation: LIQUID })).toEqual({ presentation: LIQUID });
  });

  it('the musicwidget stays presentable — this is not a widget blanket', () => {
    // `DesktopShell` treats the music widget as a real app for pop-out too.
    // The excluded three are excluded for having no conventional chrome to
    // swap, not for being small.
    expect(canPresentLiquid('musicwidget')).toBe(true);
  });
});

describe('liquid-window.css', () => {
  const rules = readRules();

  it('paints nothing outside the opt-in class', () => {
    // At-rule wrappers are unwrapped, not skipped, and that is the difference
    // between a stronger guard and a hole. `split('}')` alone hands back
    // `@container (max-width: 640px)` as if it were a selector — which fails —
    // while the rule nested INSIDE it never becomes a token at all, so filtering
    // `@` out would have stopped checking the very selectors the wrapper hides.
    // Dropping the `@…{` opener promotes each nested selector to a token of its
    // own; the orphaned closing brace only yields an empty string, which the
    // filter below already discards.
    const selectors = rules
      .replace(/@[a-z-]+[^{]*\{/g, '')
      .split('}')
      .map((block) => block.split('{')[0]?.trim())
      .filter((s): s is string => Boolean(s));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector).toMatch(/\.fwin-liquid|\.fwin-b-liquid/);
    }
  });

  it('pins window CONTENT to the opaque anchor surface — Liquid is selective', () => {
    expect(rules).toMatch(/\.fwin-liquid \.fwin-body\s*\{[^}]*--lq-anchor-bg/);
    // The failure this guards: a body given the liquid fill, which is where
    // "universal glass" costs a contrast measurement on reading and forms.
    expect(rules).not.toMatch(/\.fwin-liquid \.fwin-body\s*\{[^}]*--lq-liquid-bg/);
  });

  it('carries the blur on .fwin-liquid itself, never on a descendant', () => {
    // `.fwin` has `transform: translateZ(0)`, which makes it a backdrop root
    // for its descendants: a backdrop-filter on `.fwin-bar` would sample the
    // window's own interior and be silently inert.
    for (const block of rules.split('}')) {
      if (!/backdrop-filter/.test(block)) continue;
      const selector = block.split('{')[0]?.trim() ?? '';
      expect(selector).toBe('.fwin.fwin-liquid');
    }
    expect(rules).toMatch(/backdrop-filter/);
  });

  it('outranks the theme rules it overrides, measured not assumed', () => {
    // The live gate caught this: the shell's own bar rule is
    // `:where(html:not(…)) .fwin:where(…) .fwin-bar`, and `:where()` adds ZERO
    // specificity — so it scores `.fwin .fwin-bar` (0,2,0), a TIE with a plain
    // `.fwin-liquid .fwin-bar`, and won on import order. The window went
    // translucent while its title bar stayed opaque and covered it: blur that
    // is live in the computed style and invisible on screen. Every rule that
    // restyles an element the shell already styles is a compound `.fwin.fwin-liquid`.
    //
    // Widened for the second host and NOT loosened: `:is()` takes the
    // specificity of its most specific branch, so `INTERIOR_HOST` still scores
    // (0,2,0) exactly as `FRAME_HOST` does. The assertion is that a selector
    // starts with one of these two literals — a bare `.popout-liquid` branch,
    // or a `:where()` written by mistake, would drop to (0,1,0) and lose the
    // same tie this test was written for.
    const overrides = rules
      .split('}')
      .map((block) => block.split('{')[0]?.trim())
      .filter((s): s is string => Boolean(s) && s.includes('.fwin-liquid'));
    expect(overrides.length).toBeGreaterThanOrEqual(6);
    for (const selector of overrides) {
      expect(
        anchoredOn(selector, FRAME_HOST) || anchoredOn(selector, INTERIOR_HOST),
        selector,
      ).toBe(true);
    }
    // Vacuity guard: at least one rule really is on the widened host, or the
    // loop above degenerates into the old single-host assertion and the pop-out
    // could silently lose its destination again.
    expect(overrides.filter((s) => s.startsWith(INTERIOR_HOST)).length).toBeGreaterThanOrEqual(4);
  });

  it('gives the pop-out the INTERIOR material and never the frame', () => {
    // The failure this pins: `.popout-root` is `frame: false` but opaque, with the
    // desktop compositor behind it rather than anything this process paints — a
    // `backdrop-filter` there is the inert glass rule 2 forbids on `.fwin-bar`,
    // and it would still measure as translucent.
    const blocks = rules
      .split('}')
      .map((b) => ({ selector: b.split('{')[0]?.trim() ?? '', body: b.split('{')[1] ?? '' }))
      .filter((b) => b.selector.includes('.popout-'));
    expect(blocks.length).toBeGreaterThanOrEqual(4);
    for (const b of blocks) {
      expect(b.body, b.selector).not.toMatch(/backdrop-filter/);
    }
    // The frame rules stay single-host: a pop-out never takes `--lq-liquid-bg`
    // on its own root or bar.
    const frameOnly = rules
      .split('}')
      .map((b) => b.split('{')[0]?.trim() ?? '')
      .filter((s) => /\.fwin-bar|\.fwin-title|\.fwin-body|\.fwin-max/.test(s));
    expect(frameOnly.length).toBeGreaterThanOrEqual(4);
    for (const selector of frameOnly) {
      expect(selector, selector).not.toMatch(/popout/);
    }
  });

  it('leaves body text color to the conventional cascade', () => {
    // Setting `color` here made the same text render at a different value in
    // Liquid than in standard, which is a contrast delta the presentation
    // toggle has no business introducing. The opaque anchor fill is what makes
    // Liquid safe for reading; the text is not this sheet's to change.
    expect(rules).not.toMatch(/\.fwin\.fwin-liquid \.fwin-body\s*\{[^}]*\bcolor\s*:/);
  });

  it('paints .lq-contextual, and only under an opted-in window', () => {
    // L5. The measured gap this closes: on the Liquid Dictionary window
    // `denseWorkOnTranslucent` was 0 but `liquidTreatedEligible` was 0 of 9 — the
    // frame was Liquid and every navigation/contextual region inside it was not.
    const owning = rules
      .split('}')
      .map((block) => ({ selector: block.split('{')[0]?.trim() ?? '', body: block.split('{')[1] ?? '' }))
      .filter((b) => b.selector.includes('.lq-contextual'));
    const base = owning.filter((b) => b.selector === `${INTERIOR_HOST} .lq-contextual`);
    expect(base.length).toBe(1);
    expect(base[0].body).toMatch(/background:\s*var\(--lq-liquid-bg\)/);
    // NEGATIVE, and the reason the rule looks under-specified: `.fwin` carries
    // `transform: translateZ(0)`, so it is a backdrop root for its descendants and a
    // backdrop-filter here would sample the window's own opaque body — inert glass
    // that still measures as translucent. The frame behind it supplies the blur.
    expect(base[0].body).not.toMatch(/backdrop-filter/);

    // Any OTHER `.lq-contextual` rule is a per-region geometry exception (a flush column
    // is not a floating card), and it may adjust the box but must never restate the
    // material: a second `background`/`backdrop-filter` here is how one region quietly
    // stops sharing the language the primitive exists to carry.
    for (const exception of owning.filter((b) => b.selector !== `${INTERIOR_HOST} .lq-contextual`)) {
      expect(anchoredOn(exception.selector, INTERIOR_HOST), exception.selector).toBe(true);
      expect(exception.body, exception.selector).not.toMatch(/background\s*:/);
      expect(exception.body, exception.selector).not.toMatch(/backdrop-filter/);
    }
  });

  it('keeps the media library rail flush rather than a floating card', () => {
    // `nav.medialib-rail` spans the full height of the Media workspace (measured 224x585 in
    // an 1080x700 Video window), so the shared card geometry would round it against three
    // edges it meets and re-pad a column that already sets its own. It keeps the material.
    const block = rules
      .split('}')
      .map((b) => ({ selector: b.split('{')[0]?.trim() ?? '', body: b.split('{')[1] ?? '' }))
      .find((b) => b.selector === `${INTERIOR_HOST} .medialib-rail.lq-contextual`);
    expect(block, 'no flush-rail rule in liquid-window.css').toBeTruthy();
    expect(block?.body).toMatch(/border-radius:\s*0/);
    expect(block?.body).toMatch(/box-shadow:\s*none/);
    expect(block?.body).toMatch(/padding:\s*var\(--lq-space-4\)\s+var\(--lq-space-3\)/);
  });

  it('uses only --lq-* tokens for material, never a shell color literal', () => {
    for (const decl of rules.matchAll(/(background|border-color|box-shadow|color)\s*:\s*([^;]+);/g)) {
      const value = decl[2].trim();
      if (/^(transparent|none|inherit|currentColor)$/.test(value)) continue;
      // The toggle's pressed state is an accent affordance, not window material.
      if (/var\(--accent\)/.test(value)) continue;
      expect(value, `${decl[1]}: ${value}`).toMatch(/var\(--lq-/);
    }
  });
});

describe('liquid-window.css — the Dictionary contextual band (L5.3)', () => {
  const rules = readRules();
  const block = (selector: string): string => {
    const found = rules
      .split('}')
      .map((b) => ({ sel: b.split('{')[0]?.trim() ?? '', body: b.split('{')[1] ?? '' }))
      .find((b) => b.sel === selector);
    if (!found) throw new Error(`no rule for ${selector}`);
    return found.body;
  };

  it('pairs exactly the two contextual siblings, and nothing else', () => {
    // Measured live, maximized 1264x765 with the disclosure panels collapsed: the
    // largest dead rectangle was 947x201 = 18.3% of the viewport against a 15% bar,
    // and it was three short full-width rows stacked. Pairing the two that ARE
    // siblings took it to 379x237 = 8.7%.
    const paired = block(
      `${INTERIOR_HOST} .dict-view > .dict-saved-searches,\n${INTERIOR_HOST} .dict-view > .lexicon-notes-browser`,
    );
    expect(paired).toMatch(/grid-column:\s*auto/);
    expect(block(`${INTERIOR_HOST} .dict-view > *`)).toMatch(/grid-column:\s*1\s*\/\s*-1/);
  });

  it('sizes the columns by the CONTENT box, never by a viewport media query', () => {
    // The window is not the viewport. A `@media (min-width: …)` would pair these two
    // inside an 820px window, where 772px of content cannot hold two 28rem columns —
    // measured: the track resolves to `772px` (one column) at the default size and
    // `602px 602px` at maximized.
    expect(block(`${INTERIOR_HOST} .dict-view`)).toMatch(
      /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(28rem,\s*100%\),\s*1fr\)\)/,
    );
    const banded = rules
      .split('}')
      .filter((b) => /\.dict-view/.test(b.split('{')[0] ?? ''));
    expect(banded.length).toBe(3);
    // Comment-stripped on purpose: a `@media` written in prose inside a CSS
    // comment is not a viewport media query, and matching the raw sheet would
    // fail on one.
    expect(rules.slice(rules.indexOf(`${INTERIOR_HOST} .dict-view`))).not.toMatch(/@media/);
  });

  it('never halves the results — dense work keeps the full measure', () => {
    // §2.3. A two-column result list is a different feature, not a spacing fix, and
    // `.lexicon-workbench` is the one child that must always span.
    const spanAll = block(`${INTERIOR_HOST} .dict-view > *`);
    expect(spanAll).toMatch(/grid-column:\s*1\s*\/\s*-1/);
    expect(rules).not.toMatch(/\.lexicon-workbench\s*\{[^}]*grid-column:\s*auto/);
  });
});

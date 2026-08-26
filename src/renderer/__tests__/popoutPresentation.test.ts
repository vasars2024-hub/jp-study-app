// @vitest-environment jsdom
/**
 * Liquid Workplace L3.2 — the pop-out as the SECOND Liquid host.
 *
 * The gap this closes is measured, not stylistic: `L5_CORE_STUDY_TOOLS.md:211`
 * recorded that "the Agent pop-out mounts outside `.fwin` — no chrome, no
 * `Make Liquid`, no `data-presentation` — so that host has no Liquid
 * destination". Every interior rule in `theme/liquid-window.css` was scoped to
 * `.fwin.fwin-liquid`, so the four apps that adopted `ContextualSurface` in L5
 * had that region language permanently inert the moment the same app was popped
 * out — an enable flow whose destination did not exist.
 *
 * L3's gate is byte-for-byte reversibility, so the round trip is asserted on
 * the stored BLOB and the key set, never on "looks the same".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  POPOUT_PRESENTATION_KEY,
  readPopoutPresentation,
  togglePopoutPresentation,
  writePopoutPresentation,
} from '../popoutPresentation';

const SECTION = 'agent' as const;

beforeEach(() => {
  localStorage.clear();
  // `screenX`/`outerWidth` are 0 in jsdom, which is exactly the shape
  // `parsePresentation` rejects (a zero-size rect is not a geometry a window can
  // be restored into). The module clamps the size to >= 1; pin real values here
  // so the tests measure the module and not jsdom's defaults.
  Object.defineProperty(window, 'screenX', { value: 240, configurable: true });
  Object.defineProperty(window, 'screenY', { value: 120, configurable: true });
  Object.defineProperty(window, 'outerWidth', { value: 980, configurable: true });
  Object.defineProperty(window, 'outerHeight', { value: 720, configurable: true });
});

describe('pop-out presentation state', () => {
  it('a pop-out that was never toggled is conventional, and stores nothing', () => {
    expect(readPopoutPresentation(SECTION)).toBeUndefined();
    expect(localStorage.getItem(POPOUT_PRESENTATION_KEY)).toBeNull();
  });

  it('going liquid captures the live OS window rect', () => {
    const state = togglePopoutPresentation(SECTION, undefined);
    expect(state?.mode).toBe('liquid');
    expect(state?.standardRect).toEqual({ x: 240, y: 120, w: 980, h: 720 });
    expect(readPopoutPresentation(SECTION)?.mode).toBe('liquid');
  });

  it('returning to standard leaves the store byte-identical to before', () => {
    // Not "equivalent": the whole key is gone, so a later read cannot tell a
    // toggled-and-returned section from one nobody ever touched. A residual
    // `{mode:'standard'}` would round-trip visually and still grow the blob.
    const before = localStorage.getItem(POPOUT_PRESENTATION_KEY);
    const liquid = togglePopoutPresentation(SECTION, undefined);
    expect(localStorage.getItem(POPOUT_PRESENTATION_KEY)).not.toBe(before);
    const back = togglePopoutPresentation(SECTION, liquid);
    expect(back).toBeUndefined();
    expect(localStorage.getItem(POPOUT_PRESENTATION_KEY)).toBe(before);
  });

  it('a second section is untouched by the first', () => {
    togglePopoutPresentation(SECTION, undefined);
    expect(readPopoutPresentation('dictionary')).toBeUndefined();
    const dict = togglePopoutPresentation('dictionary', undefined);
    expect(dict?.mode).toBe('liquid');
    expect(readPopoutPresentation(SECTION)?.mode).toBe('liquid');
    togglePopoutPresentation('dictionary', dict);
    expect(readPopoutPresentation('dictionary')).toBeUndefined();
    expect(readPopoutPresentation(SECTION)?.mode).toBe('liquid');
  });

  it.each([
    ['a corrupt JSON body', '{not json'],
    ['an array', '[]'],
    ['a liquid state with no rect to come back to', '{"agent":{"v":1,"mode":"liquid"}}'],
    ['a zero-size rect', '{"agent":{"v":1,"mode":"liquid","standardRect":{"x":0,"y":0,"w":0,"h":9}}}'],
    ['a version this build cannot read', '{"agent":{"v":99,"mode":"liquid","standardRect":{"x":1,"y":2,"w":3,"h":4}}}'],
  ])('reads %s as a conventional pop-out', (_label, raw) => {
    localStorage.setItem(POPOUT_PRESENTATION_KEY, raw);
    expect(readPopoutPresentation(SECTION)).toBeUndefined();
  });

  it('a non-presentable section can never enter Liquid', () => {
    // Same predicate the shell uses, so the two hosts cannot disagree about
    // which sections have chrome to swap — the boss-audit-2026-08-17 failure.
    expect(togglePopoutPresentation('note', undefined)).toBeUndefined();
    expect(togglePopoutPresentation('visualizer', undefined)).toBeUndefined();
    expect(localStorage.getItem(POPOUT_PRESENTATION_KEY)).toBeNull();
  });

  it('a stored blob for a section that later stops being presentable is ignored', () => {
    writePopoutPresentation(SECTION, {
      v: 1,
      mode: 'liquid',
      standardRect: { x: 1, y: 2, w: 3, h: 4 },
    });
    expect(readPopoutPresentation(SECTION)?.mode).toBe('liquid');
    expect(readPopoutPresentation('note')).toBeUndefined();
  });
});

describe('the pop-out host is wired to the sheet', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

  it('App.tsx renders the opt-in class and data-presentation on .popout-root', () => {
    const app = src('src/renderer/App.tsx');
    expect(app).toMatch(/popoutLiquid \? 'popout-liquid' : ''/);
    expect(app).toMatch(/data-presentation=\{popoutPresentable \?/);
  });

  it('the pop-out bar carries a reversible toggle, not a one-way switch', () => {
    // Every enable flow needs its disable path in the same chrome. The label
    // flips with the state and `aria-pressed` carries it for assistive tech.
    const app = src('src/renderer/App.tsx');
    expect(app).toMatch(/popout-btn-liquid/);
    expect(app).toMatch(/liquid \? t\('desktop\.returnToStandard'\) : t\('desktop\.makeLiquid'\)/);
    expect(app).toMatch(/aria-pressed=\{liquid\}/);
  });

  it('the sheet paints the interior on every host and the frame on none of them', () => {
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    // The interior rules a popped-out study app depends on. Asserted against the
    // WHOLE `:is()` list rather than a `.popout-root…)` suffix: the reader joined
    // that list as the third host, and a suffix match would have read "the
    // pop-out host is gone" the moment anything was appended after it.
    const hosts = ':is(.fwin.fwin-liquid, .popout-root.popout-liquid, .reader.reader-liquid)';
    for (const region of ['.lq-contextual', '.agent-rail.lq-contextual', '.dict-view']) {
      expect(sheet, region).toContain(`${hosts} ${region}`);
    }
    // NEGATIVE: the pop-out's frame is the OS window and takes no material.
    // Without this the widening would have been a blanket find-and-replace, and
    // `.popout-root` would have grown an inert `backdrop-filter`.
    expect(sheet).not.toMatch(/popout-root\.popout-liquid\s*\{/);
    expect(sheet).not.toMatch(/popout-bar/);
  });
});

// @vitest-environment jsdom
/**
 * Liquid Workplace L3.2 — the full-screen reader as the THIRD Liquid host.
 *
 * The gap this closes is measured, not stylistic. `L1_SURFACE_ROLES.md` records
 * that L1 category 3's last two cells are Novels and manga, both `@.reader`,
 * and that `App.tsx` returns the reader as the WHOLE app render — it is inside
 * neither `.fwin` nor `.popout-root`, the app's only two Liquid destinations. So
 * no region inside a reader could ever be treated, and a category-3 PASS there
 * could only have come from `eligibleTotal === 0`. Same defect class the pop-out
 * host fixed one host earlier: an enable flow whose destination does not exist.
 *
 * L3's gate is byte-for-byte reversibility, so the round trip is asserted on the
 * stored BLOB and the key set, never on "looks the same".
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  READER_PRESENTATION_KEY,
  readReaderPresentation,
  toggleReaderPresentation,
  writeReaderPresentation,
} from '../readerPresentation';

beforeEach(() => {
  localStorage.clear();
  // `screenX`/`outerWidth` are 0 in jsdom, which is exactly the shape
  // `parsePresentation` rejects (a zero-size rect is not a geometry a window can
  // be restored into). Pin real values so these tests measure the module rather
  // than jsdom's defaults.
  Object.defineProperty(window, 'screenX', { value: 64, configurable: true });
  Object.defineProperty(window, 'screenY', { value: 32, configurable: true });
  Object.defineProperty(window, 'outerWidth', { value: 1280, configurable: true });
  Object.defineProperty(window, 'outerHeight', { value: 800, configurable: true });
});

describe('reader presentation state', () => {
  it('a reader that was never toggled is conventional, and stores nothing', () => {
    expect(readReaderPresentation('book')).toBeUndefined();
    expect(readReaderPresentation('manga')).toBeUndefined();
    expect(localStorage.getItem(READER_PRESENTATION_KEY)).toBeNull();
  });

  it('going liquid captures the live main-window rect', () => {
    const state = toggleReaderPresentation('book', undefined);
    expect(state?.mode).toBe('liquid');
    expect(state?.standardRect).toEqual({ x: 64, y: 32, w: 1280, h: 800 });
    expect(readReaderPresentation('book')?.mode).toBe('liquid');
  });

  it('returning to standard leaves the store byte-identical to before', () => {
    // Not "equivalent": the whole key is gone, so a later read cannot tell a
    // toggled-and-returned reader from one nobody ever touched. A residual
    // `{mode:'standard'}` would round-trip visually and still grow the blob.
    const before = localStorage.getItem(READER_PRESENTATION_KEY);
    const liquid = toggleReaderPresentation('manga', undefined);
    expect(localStorage.getItem(READER_PRESENTATION_KEY)).not.toBe(before);
    const back = toggleReaderPresentation('manga', liquid);
    expect(back).toBeUndefined();
    expect(localStorage.getItem(READER_PRESENTATION_KEY)).toBe(before);
  });

  it('the two reader kinds are independent — decision 3, stored per kind', () => {
    // Novels carries a seek/chapter footer and manga a page scrubber, so the two
    // genuinely have different chrome. A shared key would make the toggle read as
    // random: liquid on the book you just left, liquid on the manga you did not.
    const book = toggleReaderPresentation('book', undefined);
    expect(book?.mode).toBe('liquid');
    expect(readReaderPresentation('manga')).toBeUndefined();
    const manga = toggleReaderPresentation('manga', undefined);
    expect(readReaderPresentation('book')?.mode).toBe('liquid');
    toggleReaderPresentation('book', book);
    expect(readReaderPresentation('book')).toBeUndefined();
    expect(readReaderPresentation('manga')?.mode).toBe('liquid');
    expect(manga?.mode).toBe('liquid');
  });

  it('the reader store is its own key, so it cannot collide with the pop-out one', () => {
    toggleReaderPresentation('book', undefined);
    expect(READER_PRESENTATION_KEY).toBe('lq.reader.presentation');
    expect(localStorage.getItem('lq.popout.presentation')).toBeNull();
  });

  it.each([
    ['a corrupt JSON body', '{not json'],
    ['an array', '[]'],
    ['a liquid state with no rect to come back to', '{"book":{"v":1,"mode":"liquid"}}'],
    ['a zero-size rect', '{"book":{"v":1,"mode":"liquid","standardRect":{"x":0,"y":0,"w":0,"h":9}}}'],
    ['a version this build cannot read', '{"book":{"v":99,"mode":"liquid","standardRect":{"x":1,"y":2,"w":3,"h":4}}}'],
  ])('reads %s as a conventional reader', (_label, raw) => {
    localStorage.setItem(READER_PRESENTATION_KEY, raw);
    expect(readReaderPresentation('book')).toBeUndefined();
  });

  it('a written blob survives a read, so the toggle is not write-only', () => {
    writeReaderPresentation('manga', {
      v: 1,
      mode: 'liquid',
      standardRect: { x: 1, y: 2, w: 3, h: 4 },
    });
    // `standardMaximized` comes back explicit: `parsePresentation` normalizes the
    // absent flag to `false` on read. Asserted rather than loosened, because the
    // round-trip test above is what guarantees the STORED blob still shrinks back
    // to nothing — a normalizing reader and a growing writer are different bugs.
    expect(readReaderPresentation('manga')).toEqual({
      v: 1,
      mode: 'liquid',
      standardRect: { x: 1, y: 2, w: 3, h: 4 },
      standardMaximized: false,
    });
    writeReaderPresentation('manga', undefined);
    expect(localStorage.getItem(READER_PRESENTATION_KEY)).toBeNull();
  });
});

/**
 * The live-rect regression, measured through the bridge on 2026-08-26 and NOT
 * reproducible with this file's jsdom defaults above — which is exactly why it
 * survived in the shipped pop-out host.
 *
 * In the real Electron renderer `screenX`, `screenY`, `outerWidth` and
 * `outerHeight` all read 0 while `innerWidth`/`innerHeight` read 1264x821. The
 * old `Math.max(1, Math.round(window.outerWidth))` turned that into
 * `{x:0,y:0,w:1,h:1}` and stored it. `parseRect`'s floor is `w <= 0`, so 1
 * clears it by one and the blob VALIDATES — confirmed on disk the same day,
 * where `lq.reader.presentation` held exactly that rect and the reader still
 * came back `.reader-liquid` after a full reload. The clamp stepped over the
 * guard instead of tripping it, which is why nothing ever reported it.
 */
const setGeometry = (g: Partial<Record<'screenX' | 'screenY' | 'outerWidth' | 'outerHeight' | 'innerWidth' | 'innerHeight', number>>) => {
  for (const [key, value] of Object.entries(g)) {
    Object.defineProperty(window, key, { value, configurable: true });
  }
};

describe('the captured rect is measured, never clamped into existence', () => {
  it('falls back to the inner box when the outer globals read 0 — the live shape', () => {
    setGeometry({ screenX: 0, screenY: 0, outerWidth: 0, outerHeight: 0, innerWidth: 1264, innerHeight: 821 });
    const state = toggleReaderPresentation('book', undefined);
    expect(state?.standardRect).toEqual({ x: 0, y: 0, w: 1264, h: 821 });
  });

  it('refuses to ENTER Liquid when no rect can be measured at all', () => {
    // The negative control for the clamp. Before the fix this stored
    // `{x:0,y:0,w:1,h:1}` and reported success.
    setGeometry({ screenX: 0, screenY: 0, outerWidth: 0, outerHeight: 0, innerWidth: 0, innerHeight: 0 });
    expect(toggleReaderPresentation('book', undefined)).toBeUndefined();
    expect(localStorage.getItem(READER_PRESENTATION_KEY)).toBeNull();
  });

  it('still RETURNS to standard when no rect can be measured', () => {
    // Leaving needs no measurement — the rect it goes back to is already inside
    // the blob — so the refusal above must not become a one-way door.
    setGeometry({ outerWidth: 900, outerHeight: 600, innerWidth: 900, innerHeight: 600 });
    const liquid = toggleReaderPresentation('manga', undefined);
    expect(liquid?.mode).toBe('liquid');
    setGeometry({ outerWidth: 0, outerHeight: 0, innerWidth: 0, innerHeight: 0 });
    expect(toggleReaderPresentation('manga', liquid)).toBeUndefined();
    expect(localStorage.getItem(READER_PRESENTATION_KEY)).toBeNull();
  });

  it('stores the measured box and never the clamp’s 1x1, through the round trip', () => {
    setGeometry({ screenX: 0, screenY: 0, outerWidth: 0, outerHeight: 0, innerWidth: 1264, innerHeight: 821 });
    toggleReaderPresentation('book', undefined);
    // Read back through the store rather than from the return value: the 1x1
    // rect PASSED `parseRect`, so a round trip that only checks `mode` is
    // green either way. The rect itself is the regression.
    const stored = readReaderPresentation('book');
    expect(stored?.mode).toBe('liquid');
    expect(stored?.standardRect).toEqual({ x: 0, y: 0, w: 1264, h: 821 });
    expect(stored?.standardRect).not.toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});

describe('the reader host is wired to the sheet', () => {
  const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const HOSTS = ':is(.fwin.fwin-liquid, .popout-root.popout-liquid, .reader.reader-liquid)';

  it.each(['NovelReader', 'MangaReader'])(
    '%s renders the opt-in class and data-presentation on .reader',
    (view) => {
      const source = src(`src/renderer/views/${view}.tsx`);
      expect(source).toMatch(/presentation\.liquid \? ' reader-liquid' : ''/);
      expect(source).toMatch(/data-presentation=\{presentation\.dataPresentation\}/);
      expect(source).toMatch(/useReaderPresentation\('(book|manga)'\)/);
    },
  );

  it.each(['NovelReader', 'MangaReader'])(
    '%s carries the reversible toggle in its own bar',
    (view) => {
      // Every enable flow needs its disable path in the same chrome, or entering
      // Liquid is one-way from inside the surface that entered it.
      const source = src(`src/renderer/views/${view}.tsx`);
      expect(source).toMatch(/<ReaderLiquidToggle[\s\S]{0,120}onToggle=\{presentation\.toggle\}/);
    },
  );

  it('NovelReader routes both chrome strips through the shared contextual primitive', () => {
    /**
     * Category 3 scored `@.reader` FAIL with `eligibleTotal: 0` before this: the
     * reader's bar and footer were plain `div`s, so the rubric's classifier saw
     * no navigation/transport region at all and the surface could not be scored
     * rather than scoring badly. `ContextualSurface` supplies both halves the
     * category needs — the semantic landmark for the denominator, and
     * `.lq-contextual` for "backed by a shared primitive, not a local copy".
     *
     * `as="header"` / `as="footer"` and not a bare div: the classifier's
     * landmark list is what makes these the regions Liquid is FOR, and a
     * `div.lq-contextual` would pass the harness while telling assistive tech
     * nothing.
     */
    const source = src('src/renderer/views/NovelReader.tsx');
    expect(source).toMatch(/<ContextualSurface as="header" className="reader-bar">/);
    expect(source).toMatch(/<ContextualSurface as="footer" className="reader-footer">/);
    expect(source).toMatch(/import \{ ContextualSurface \} from '\.\.\/components\/liquid\/LiquidSurface'/);
    // The strips must not carry their own translucency: §2 non-negotiable 1 is
    // that a conventional reader renders the conventional pixels, and
    // `liquid-window.css` is the only sheet allowed to paint `.lq-contextual`.
    expect(source).not.toMatch(/reader-(bar|footer)[\s\S]{0,200}backdrop-filter/);
  });

  it('MangaReader routes its three transport regions through the same primitive', () => {
    /**
     * The manga reader has one region the novel reader does not:
     * `.reader-seek-wrap`, a wrapper around a single `input[type=range]`. The
     * classifier's "a single control is not a region" skip reaches the control
     * and not its wrapper, so it measured as dense WORK (`forms >= 1`) sitting
     * on the footer's translucent material — the one bar the surface failed.
     * It is the scrubber, so it declares transport like the strips around it.
     */
    const source = src('src/renderer/views/MangaReader.tsx');
    expect(source).toMatch(/<ContextualSurface as="header" className="reader-bar">/);
    expect(source).toMatch(/<ContextualSurface\s+as="footer"\s+className=\{`reader-footer lq-hit-scope/);
    expect(source).toMatch(/<ContextualSurface className="reader-seek-wrap">/);
  });

  it('the scrubber adopts the primitive for its meaning and not its geometry', () => {
    // Without this the footer's 0.72 tint gets a second 0.72 slab inside it and
    // a card border around a slider — the "stack of unrelated cards" §2 rejects.
    // Same exception the two flush rails take, and it must stay host-scoped so a
    // conventional reader is untouched.
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sheet).toContain(`${HOSTS} .reader-seek-wrap.lq-contextual`);
    const block = sheet.slice(sheet.indexOf('.reader-seek-wrap.lq-contextual'));
    const body = block.slice(block.indexOf('{'), block.indexOf('}'));
    for (const off of ['background: none', 'border: 0', 'padding: 0', 'box-shadow: none']) {
      expect(body, off).toContain(off);
    }
  });

  it('the toggle flips its own label and carries aria-pressed', () => {
    const toggle = src('src/renderer/components/liquid/ReaderLiquidToggle.tsx');
    expect(toggle).toMatch(/liquid \? t\('desktop\.returnToStandard'\) : t\('desktop\.makeLiquid'\)/);
    expect(toggle).toMatch(/aria-pressed=\{liquid\}/);
    // Reuses the two other hosts' strings, so the three cannot drift apart.
    expect(toggle).not.toMatch(/'(Make Liquid|Return to standard)'/);
  });

  it('the sheet paints the interior on the reader and the frame on nothing', () => {
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const region of ['.lq-contextual', '.agent-rail.lq-contextual', '.dict-view']) {
      expect(sheet, region).toContain(`${HOSTS} ${region}`);
    }
    // NEGATIVE, and the reason the widening was not a blanket find-and-replace:
    // the reader fills the main OS window edge to edge with no box of its own, so
    // a `backdrop-filter` on `.reader` would sample the desktop compositor and
    // paint nothing — inert glass that still measures as a pass.
    expect(sheet).not.toMatch(/\.reader\.reader-liquid\s*\{/);
    expect(sheet).not.toMatch(/reader-bar/);
    expect(sheet).not.toMatch(/reader-stage/);
  });

  it('the reader toggle shares the measured accent fill rather than restating it', () => {
    // The 16% fill is a contrast sweep across thirteen palettes, recorded in the
    // sheet. A second rule for a third host is a second measurement waiting to
    // disagree with the first.
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sheet).toMatch(
      /\.fwin-b-liquid\.is-liquid,\s*\.popout-btn-liquid\.is-liquid,\s*\.reader-btn-liquid\.is-liquid\s*\{/,
    );
    expect(sheet.match(/\.reader-btn-liquid/g)?.length).toBe(2);
  });
});

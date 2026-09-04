/**
 * The video tab's study surface, as a layout contract.
 *
 * With an episode open the overlay puts five things on the picture at once: the
 * grammar card, the mining panel, the transcript, the control dock and the
 * subtitle line. Each of them used to pick an edge and anchor to it, which is
 * fine until two of them pick the same one. Measured in the dev harness
 * (`video-study-harness.html`, cases V13–V17) before this landed:
 *
 *   1024×622, everything open      grammar × mining   12 × 294px
 *   1280×522, controls expanded    grammar × dock    336 × 172px
 *                                  mining  × dock    336 ×  74px
 *                                  dock    × cue     644 ×  69px  ← subtitle gone
 *   620×622,  everything open      mining ran through all three
 *
 * The fix has three parts, and this file guards all three, because none of them
 * can be seen by a DOM-structural test and jsdom has no layout at all:
 *
 *   · one right-hand column (`.study-side-rail`) owns mining AND the transcript,
 *     so the rail opening no longer shoves mining sideways into the grammar card;
 *   · the dock's real height is published to CSS as `--study-dock-height`, so
 *     what sits above it stops guessing;
 *   · the columns declare their width once (`--study-column`) and the subtitle
 *     centres in what they leave (`--study-left/right-gutter`).
 *
 * Source-level assertions on purpose. `VideoCoreStudyOverlay.tsx` imports the
 * adopted player's jotai atoms and cannot be imported by a test — the same
 * reason `directstreamOpenRecovery.test.ts` reads it as text — and a CSS
 * geometry contract is not observable in jsdom at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const OVERLAY = resolve(SRC, 'media/VideoCoreStudyOverlay.tsx');
const CSS = resolve(SRC, 'media/mediaWorkspace.css');

/**
 * Comments out before any source sweep.
 *
 * Load-bearing here rather than tidy: the rules being asserted are the ones whose
 * comments quote the defect they replaced — the rail's own comment says
 * "position, width and stacking", and the mining panel's says "no longer places
 * itself". A raw substring search reads every one of those explanations as the
 * thing it warns about.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** The declarations of one rule, by exact selector. Brace-counted, not regexed. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for \`${selector}\``).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated rule for \`${selector}\``);
}

const overlay = code(readFileSync(OVERLAY, 'utf8'));
const css = code(readFileSync(CSS, 'utf8'));

describe('the study surface is one column layout, not four anchored panels', () => {
  it('renders mining and the transcript inside the rail', () => {
    const at = overlay.indexOf('<div className="study-side-rail">');
    expect(at, 'the rail wrapper is gone').toBeGreaterThan(-1);
    const rail = overlay.slice(at, overlay.indexOf('</div>', at));
    expect(rail).toContain('<VideoCoreMiningPanel');
    expect(rail).toContain('<VideoCoreTranscriptPanel');
  });

  it('puts mining above the transcript, so the transcript takes the remainder', () => {
    const at = overlay.indexOf('<div className="study-side-rail">');
    const rail = overlay.slice(at, overlay.indexOf('</div>', at));
    expect(rail.indexOf('<VideoCoreMiningPanel'))
      .toBeLessThan(rail.indexOf('<VideoCoreTranscriptPanel'));
  });

  it('lets the column place both panels — neither positions itself', () => {
    for (const selector of ['.study-mining-panel', '.study-transcript-panel']) {
      const rule = block(css, `#media-workspace ${selector}`);
      // Both assertions below are negative, so prove first that `block` found a
      // real rule and is not handing them an empty string to succeed against.
      expect(rule, `${selector} resolved to an empty rule`).toMatch(/padding:\s*0\.8rem/);
      expect(rule, `${selector} anchors itself again`).not.toMatch(/\bposition:/);
      expect(rule, `${selector} anchors itself again`).not.toMatch(/^\s*(top|right|bottom|left):/m);
    }
  });

  it('is a flex column, because a percentage cap dies in an auto grid track', () => {
    /*
      Not a style preference. As `grid-template-rows: auto minmax(0, 1fr)` the
      mining panel's `max-height: min(21rem, 60%)` is cyclic during track sizing,
      so Chromium drops it: measured, the mining row took 583 of the column's
      592px and left the transcript a 24px stub. A flex item resolves the same
      percentage against the container's definite height.
    */
    const rail = block(css, '#media-workspace .study-side-rail');
    expect(rail).toMatch(/display:\s*flex/);
    expect(rail).toMatch(/flex-direction:\s*column/);
    expect(rail).not.toMatch(/grid-template-rows/);
  });
});

describe('the dock publishes its height instead of being guessed at', () => {
  it('observes the dock and writes the variable onto the slice', () => {
    expect(overlay).toMatch(/ref=\{dockRef\}/);
    expect(overlay).toMatch(/new ResizeObserver\(publish\)/);
    expect(overlay).toMatch(/setProperty\('--study-dock-height'/);
    // On the slice, so a pop-out workspace cannot overwrite the main window's.
    expect(overlay).toMatch(/closest\('\.study-player-slice'\)/);
  });

  it('removes it on unmount, so no stale height outlives the dock', () => {
    expect(overlay).toMatch(/removeProperty\('--study-dock-height'\)/);
  });

  it('degrades to the collapsed height when there is no observer', () => {
    const slice = block(css, '#media-workspace .study-player-slice');
    expect(slice).toMatch(/--study-dock-height:\s*3\.5rem/);
  });
});

describe('the surface declares its geometry once', () => {
  const slice = block(css, '#media-workspace .study-player-slice');

  it('names the column width and derives the gutter from it', () => {
    expect(slice).toMatch(/--study-column:\s*24rem/);
    expect(slice).toMatch(/--study-gutter:\s*calc\(var\(--study-column\) \+ 1rem\)/);
  });

  it('starts with no gutter and claims one per panel that reaches the cue band', () => {
    expect(slice).toMatch(/--study-left-gutter:\s*0rem/);
    expect(slice).toMatch(/--study-right-gutter:\s*0rem/);
    expect(block(css, '#media-workspace .study-player-slice:has(.study-grammar-panel)'))
      .toMatch(/--study-left-gutter:\s*var\(--study-gutter\)/);
    expect(block(css, '#media-workspace .study-player-slice:has(.study-transcript-panel)'))
      .toMatch(/--study-right-gutter:\s*var\(--study-gutter\)/);
  });

  it('centres the subtitle between the gutters rather than in the slice', () => {
    const cue = block(css, '#media-workspace .study-cue-overlay');
    expect(cue).toMatch(/--study-left-gutter/);
    expect(cue).toMatch(/--study-right-gutter/);
    expect(cue, 'centred on the whole slice again').not.toMatch(/left:\s*50%/);
  });

  it('keeps the subtitle above the dock, with the transport bar as the floor', () => {
    expect(slice).toMatch(/--study-cue-bottom:\s*max\(9\.25rem,\s*calc\(var\(--study-dock-height\)/);
    expect(block(css, '#media-workspace .study-cue-overlay'))
      .toMatch(/bottom:\s*var\(--study-cue-bottom\)/);
  });

  it('bounds the grammar card by the dock, not by the slice', () => {
    expect(block(css, '#media-workspace .study-grammar-panel'))
      .toMatch(/max-height:.*var\(--study-dock-height\)/);
  });

  it('narrows both columns together where three do not fit across', () => {
    // 48rem of furniture out of a 64rem window leaves the subtitle 176px.
    expect(css).toMatch(/@media \(max-width: 1180px\)/);
    const narrow = css.slice(css.indexOf('@media (max-width: 1180px)'));
    expect(narrow.slice(0, 200)).toMatch(/--study-column:\s*19rem/);
  });
});

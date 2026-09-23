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
 *   · one column owns mining AND the transcript, so the rail opening no longer
 *     shoves mining sideways into the grammar card;
 *   · the dock's real height is published to CSS as `--study-dock-height`, so
 *     what sits above it stops guessing;
 *   · the columns declare their width once (`--study-column`) and the subtitle
 *     centres in what they leave (`--study-left/right-gutter`).
 *
 * ## The first part moved, 2026-09-03
 *
 * `d076b9b3` replaced the hand-written `.study-side-rail` with the workspace's
 * dock system: the overlay now publishes a `blockRenderers` map and `StudyDocks`
 * decides which side each block lands on. The three assertions that named the
 * rail's JSX were left pointing at a wrapper the overlay no longer renders, so
 * the branch tip carried 3 deterministic failures while the shared working tree
 * hid them behind a newer uncommitted copy of this file.
 *
 * They are re-pointed here rather than deleted, and at the same defect. The
 * collision the rail prevented is prevented now by `.study-dock`: one flex
 * column per side, ordered by the workspace rather than by JSX. So the successor
 * assertions are that the overlay places NEITHER panel itself (exactly one JSX
 * occurrence each, inside the block map) and that the dock does the stacking.
 * That is strictly stronger than the rail check, which could not see a second
 * copy of a panel rendered somewhere else on the surface.
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
const DOCKS = resolve(SRC, 'media/StudyDocks.tsx');
const BAR = resolve(SRC, 'media/StudyBottomBar.tsx');
const CSS = resolve(SRC, 'media/mediaWorkspace.css');
const DOCK_CSS = resolve(SRC, 'media/studyWorkspace.css');

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

/**
 * The body of a braced construct opened by `header`. Brace-counted, like `block`.
 *
 * Every caller below proves the count terminated where it should — a runaway that
 * swallowed the component's whole return would make the `toContain` assertions
 * pass for the wrong reason, which is exactly how the rail assertions kept
 * looking healthy in the shared tree.
 */
function braced(text: string, header: string): string {
  const at = text.indexOf(header);
  expect(at, `no \`${header}\``).toBeGreaterThan(-1);
  const open = text.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error(`unterminated \`${header}\``);
}

const overlay = code(readFileSync(OVERLAY, 'utf8'));
const docks = code(readFileSync(DOCKS, 'utf8'));
const bar = code(readFileSync(BAR, 'utf8'));
const css = code(readFileSync(CSS, 'utf8'));
const dockCss = code(readFileSync(DOCK_CSS, 'utf8'));

describe('the study surface is one column layout, not four anchored panels', () => {
  it('hands mining and the transcript to the dock instead of placing them', () => {
    const map = braced(overlay, 'const blockRenderers: BlockRenderers =');
    // The count stopped at the map's own closing brace and not at the end of the
    // component, so the two `toContain`s below mean what they say.
    expect(map, 'the block map ran past its own closing brace').not.toContain('<StudyDocks');
    expect(map).toContain('<VideoCoreMiningPanel');
    expect(map).toContain('<VideoCoreTranscriptPanel');
    expect(overlay).toContain('<StudyDocks renderers={blockRenderers} />');

    // The successor to the rail check, and the part that actually guards the
    // collision: a panel the overlay renders a SECOND time, outside the map, is
    // placing itself again no matter what the dock decides.
    for (const tag of ['<VideoCoreMiningPanel', '<VideoCoreTranscriptPanel']) {
      expect(overlay.split(tag).length - 1, `${tag} is also rendered outside the block map`)
        .toBe(1);
    }
  });

  it('lets the dock stack a side, ordered by the workspace and not by JSX', () => {
    // One container per side, every block of that side inside it, sorted — the three
    // properties `.study-side-rail` used to supply by being hand-written.
    expect(docks).toMatch(/className="study-dock"/);
    expect(docks).toMatch(/data-dock=\{side\}/);
    expect(docks).toMatch(/list\.sort\(\(a, b\) => a\.order - b\.order\)/);
    const dock = block(dockCss, '#media-workspace .study-dock');
    expect(dock).toMatch(/display:\s*flex/);
    expect(dock).toMatch(/flex-direction:\s*column/);
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
    // The ref now crosses a component boundary — `d076b9b3` split the bar out — so
    // follow it across, which the old single-file `ref={dockRef}` could not.
    expect(overlay).toMatch(/barRef=\{dockRef\}/);
    expect(bar).toMatch(/ref=\{props\.barRef\}/);
    expect(overlay).toMatch(/new ResizeObserver\(publish\)/);
    // The BAR's height; the stylesheet adds the player's transport under it.
    expect(overlay).toMatch(/setProperty\('--study-bar-height'/);
    // CSS pixels, not the zoomed bounding box (0.8 app zoom under-measured it by 20%).
    expect(overlay).toMatch(/dock\.offsetHeight/);
    // On the slice, so a pop-out workspace cannot overwrite the main window's.
    expect(overlay).toMatch(/closest\('\.study-player-slice'\)/);
  });

  it('removes it on unmount, so no stale height outlives the dock', () => {
    expect(overlay).toMatch(/removeProperty\('--study-bar-height'\)/);
  });

  it('degrades to the collapsed height when there is no observer', () => {
    const slice = block(css, '#media-workspace .study-player-slice');
    expect(slice).toMatch(/--study-bar-height:\s*3\.5rem/);
  });

  it('stacks the study bar on the player transport, never over it', () => {
    // Over it, the bar sat in VideoCore's hover band: play/pause never came up (2026-09-23).
    const slice = block(css, '#media-workspace .study-player-slice');
    expect(slice).toMatch(/--study-transport-height:\s*5rem/);
    expect(slice).toMatch(
      /--study-dock-height:\s*calc\(var\(--study-transport-height\) \+ var\(--study-bar-height\)/,
    );
  });
});

describe('the surface declares its geometry once', () => {
  const slice = block(css, '#media-workspace .study-player-slice');

  it('names the column width and derives the gutter from it', () => {
    expect(slice).toMatch(/--study-column:\s*24rem/);
    expect(slice).toMatch(/--study-gutter:\s*calc\(var\(--study-column\) \+ 1rem\)/);
  });

  it('starts with no gutter and claims one per visible dock that reaches the cue band', () => {
    expect(slice).toMatch(/--study-left-gutter:\s*0rem/);
    expect(slice).toMatch(/--study-right-gutter:\s*0rem/);
    // Panels can live in either dock, a sheet, or float, so the gutter is asked of the dock.
    // `:not([hidden])`: a dock kept mounted but hidden must not reserve a column.
    expect(block(css, "#media-workspace .study-player-slice:has(.study-dock[data-dock='left']:not([hidden]))"))
      .toMatch(/--study-left-gutter:\s*var\(--study-gutter\)/);
    expect(block(css, "#media-workspace .study-player-slice:has(.study-dock[data-dock='right']:not([hidden]))"))
      .toMatch(/--study-right-gutter:\s*var\(--study-gutter\)/);
    expect(css, 'a panel-named gutter rule came back').not.toMatch(/:has\(\.study-grammar-panel\)\s*\{/);
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

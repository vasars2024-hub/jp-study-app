import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = resolve(__dirname, '..', 'views', 'mediaCenter.css');
const CSS = readFileSync(CSS_PATH, 'utf8');

/**
 * The `--mc-*` literals in `.mc-root` are the DEFAULT dark palette; the two theme blocks at
 * the bottom of the sheet re-source them. That contract only holds for values the shell
 * expresses as a token — a rule that writes its own hex or rgba is unreachable from either
 * block, which is exactly how the Music window measured 24 failing text runs in
 * `classic-light` on 2026-08-30 (`.mc-music-head h1` 1.23:1, `.mc-album-copy h2` 1.01:1,
 * `.mc-button` 1.04:1, `.mc-player-info strong` 1.19:1, and the two contextual asides keeping
 * a dark rgba slab under text that had correctly turned dark). Two earlier rounds of the same
 * defect are argued in the sheet's own comments; this guard is what stops a fourth.
 *
 * TWO SHAPES, AND THE SECOND IS A RATCHET RATHER THAN A BAN. The Music surface's own rules are
 * asserted positively — those were measured live, fixed, and re-measured to 0 failing runs in
 * both themes. The sheet-wide counts are a CEILING, because the Media Center's other five
 * sections still carry 44 near-white ink literals and 16 dark slabs of exactly this shape and
 * none of them has been driven live yet. Banning them outright would either fail this suite or
 * push a worker into a blind sheet-wide rewrite of surfaces whose contrast nobody has measured.
 * The number may fall and may never rise; when a section is scored and fixed, lower it here.
 *
 * Deliberately NOT a blanket ban on literals even at the ceiling. Accent-tinted fills,
 * hairlines and shadows are palette-independent by intent and stay literal. The two families
 * that must stay tokenised are the ones a light palette inverts: near-white INK, and near-black
 * translucent SLABS opaque enough to be read as the background of the text on them.
 */
const INK_CEILING = 42;
const SLAB_CEILING = 16;

const TOKEN_BLOCK_END = CSS.indexOf('.mc-root,\n.mc-root * {');
/** The `.mc-root` token declarations, where the dark defaults are supposed to live. */
const defaults = CSS.slice(0, TOKEN_BLOCK_END);
/** Everything after them: real rules, plus the two theme remap blocks. */
const rules = CSS.slice(TOKEN_BLOCK_END);

/** Near-white: every channel at or above 0xc0. That is ink, not a tint. */
const isNearWhiteHex = (hex: string): boolean => {
  const full = hex.length === 4
    ? hex.slice(1).split('').map((c) => c + c).join('')
    : hex.slice(1);
  const channels = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return channels.every((c) => c >= 0xc0);
};

/** The rule body for a selector, so an assertion names the rule rather than the whole sheet. */
const ruleBody = (selector: string): string => {
  const at = CSS.indexOf(selector);
  expect(at, `${selector} is not in mediaCenter.css`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
};

describe('Media Center theme ink and material tokens', () => {
  it('lets the album stage use the extra space in a wide three-pane workspace', () => {
    const wide = ruleBody('@container mc (min-width: 1160px) {');
    expect(wide).toContain('.mc-album-art');
    expect(wide).toContain('width: 132px');
    expect(wide).toContain('height: 132px');
  });

  it('reserves no footprint for the removed corner launcher', () => {
    // The media workspace no longer puts a pill over the desktop's corner, so the player
    // bar must not keep 200px of empty padding for it.
    expect(CSS).not.toContain('seanime-host-launcher');
  });

  it('sources every ink and material the Music surface paints from a token', () => {
    expect(ruleBody('.mc-music-head h1 {')).toMatch(/color:\s*var\(--mc-hero-ink/);
    expect(ruleBody('.mc-album-copy h2 {')).toMatch(/color:\s*var\(--mc-album-ink/);
    expect(ruleBody('.mc-button {')).toMatch(/color:\s*var\(--mc-btn-ink/);
    expect(ruleBody('.mc-panel-title strong,')).toMatch(/color:\s*var\(--mc-title-ink/);
    expect(ruleBody('.mc-track-queue strong {')).toMatch(/color:\s*var\(--mc-row-ink/);
    expect(ruleBody('.mc-player-info strong {')).toMatch(/color:\s*var\(--mc-row-ink/);
    expect(ruleBody('.mc-queue-summary strong {')).toMatch(/color:\s*var\(--mc-row-ink/);
    expect(ruleBody('.mc-music-library,\n.mc-music-queue {\n  background'))
      .toMatch(/background:\s*var\(--mc-panel-glass/);
    // Was anchored on `.mc-music-now .music-controls`, the inline transport that
    // duplicated `.mc-playerbar`. That element no longer renders in the Media Center,
    // so the guard follows the surviving inset slab on the same pane rather than
    // certifying a rule nothing can match.
    expect(ruleBody('.mc-music-now .music-nowplaying {'))
      .toMatch(/background:\s*var\(--mc-inset-glass/);
    expect(ruleBody('.mc-queue-summary {')).toMatch(/background:\s*var\(--mc-inset-glass-soft/);
  });

  it('sources the tile and row TITLE ink the Video surface paints from a token', () => {
    // Measured live 2026-08-31 on the Video empty state: both rules hardcoded #dfe0e6, so in
    // `classic-light` the seven recent-media titles painted rgb(223,224,230) on the white
    // `--mc-stage-plate` at 1.09:1 against a 4.5 bar. After: cat5 Q5 reports 0 failing runs in
    // both themes across 89 measured runs.
    expect(ruleBody('.mc-tile-copy strong {')).toMatch(/color:\s*var\(--mc-tile-ink/);
    expect(ruleBody('.mc-study-row-copy strong {')).toMatch(/color:\s*var\(--mc-tile-ink/);
  });

  it('keeps the active nav row\'s sub-label on its own ink', () => {
    // `--mc-dim` measured 4.46:1 on the accent-tinted active row in forest-night and
    // `--mc-muted` 4.40:1 in classic-light — both under the 4.5 floor, both from the tint.
    expect(ruleBody('.mc-nav button.is-active small,'))
      .toMatch(/color:\s*var\(--mc-nav-active-sub-ink/);
  });

  it('does not add a near-white `color:` literal outside the token defaults', () => {
    const offenders: string[] = [];
    for (const match of rules.matchAll(/color:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
      if (isNearWhiteHex(match[1])) offenders.push(match[1]);
    }
    expect(offenders.length).toBeLessThanOrEqual(INK_CEILING);
  });

  it('does not add a near-black translucent slab outside the token defaults', () => {
    const offenders: string[] = [];
    for (const match of rules.matchAll(/background:\s*rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)\s*;/g)) {
      const [r, g, b] = [match[1], match[2], match[3]].map(Number);
      if (r <= 0x40 && g <= 0x40 && b <= 0x40 && Number(match[4]) >= 0.3) {
        offenders.push(match[0].trim());
      }
    }
    expect(offenders.length).toBeLessThanOrEqual(SLAB_CEILING);
  });

  it('remaps every ink and material token in both theme blocks', () => {
    const light = CSS.slice(CSS.indexOf(":root[data-theme='classic-light'] .mc-root"));
    const lightBlock = light.slice(0, light.indexOf('}'));
    const hc = CSS.slice(CSS.indexOf(":root[data-theme='high-contrast'] .mc-root"));
    const hcBlock = hc.slice(0, hc.indexOf('}'));

    const declared = [...defaults.matchAll(/(--mc-(?:[a-z-]*ink|panel-glass[a-z-]*|inset-glass[a-z-]*)):/g)]
      .map((m) => m[1]);
    // The sweep has to have found the tokens it is guarding, or an empty list passes.
    expect(declared.length).toBeGreaterThanOrEqual(10);

    /*
     * THEME-INVARIANT INK, exempt by the same argument `--mc-stage-plate` above it already
     * won. The rule this guard enforces is "a light palette inverts the surface, so the ink
     * on it must invert too". `.mc-video-stage` is the one surface where the premise is
     * false: it is a fixed #05070b letterbox behind a video in EVERY palette, so ink that
     * followed the palette would be the defect — it measured 3.18:1 in classic-light on
     * 2026-09-03 for exactly that reason, and the fix was to stop it following.
     *
     * Listed literally rather than matched by prefix, so exempting a third token stays a
     * deliberate act with an argument attached. Every other ink token is still swept.
     */
    const THEME_INVARIANT = new Set(['--mc-stage-ink', '--mc-stage-ink-muted']);

    for (const token of declared.filter((tk) => !THEME_INVARIANT.has(tk))) {
      expect(lightBlock, `${token} is not remapped for the light palettes`).toContain(`${token}:`);
      expect(hcBlock, `${token} is not remapped for high contrast`).toContain(`${token}:`);
    }
  });
});

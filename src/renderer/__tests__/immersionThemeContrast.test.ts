/**
 * Immersion's stage and mode segment have to survive a light palette.
 *
 * `.immersion-root` is `var(--panel)` with `var(--text)` on it, both of which
 * follow the theme — but the stage under them was a hardcoded `#121118` and the
 * three active mode labels were fixed pale tints. In a dark theme that is
 * invisible; in `classic-light` it is the surface failing. Measured live through
 * the debug bridge, forest-night vs classic-light on one 58-run scene:
 *
 *   .immersion-stage  #121118 under rgb(30,30,30) labels   1.13:1   (bar 4.5)
 *   p.muted           rgb(95,95,102) on the same stage     2.96:1
 *   mode-btn-reader   rgb(110,231,183) on rgb(209,237,227) 1.23:1
 *
 * Eight failing text runs, every one of them only in the light theme, and after
 * the fix zero in either — worst 5.30 dark / 5.46 light.
 *
 * Guarded from source because contrast is a *palette* property: a jsdom render
 * resolves no theme variables at all, so the only thing a unit test can hold is
 * the rule that makes the colour follow the palette. The ratios above come from
 * `probes/cat5-ui-clarity.cjs`, which sweeps both themes on the live surface.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Normalised: this tree is LF and a fresh worktree checks out CRLF, so a matcher
// that spans lines otherwise passes only where it was written.
const CSS = readFileSync(resolve(__dirname, '../styles.css'), 'utf8').replace(/\r\n/g, '\n');

/** The declaration block for a selector, up to its closing brace. */
function block(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `${selector} not found`).toBeGreaterThan(-1);
  return CSS.slice(at, CSS.indexOf('}', at));
}

describe('immersion survives a light palette', () => {
  it('paints the stage from a theme token, never a fixed near-black', () => {
    const rule = block('.immersion-stage');
    expect(rule).toContain('background: var(--panel-2);');
    // The declaration, not the block: the comment above it names the old literal
    // on purpose, and a bare `toContain` would fail on the explanation.
    expect(rule).not.toMatch(/background:\s*#121118/);
  });

  it('mixes every active mode label toward --text so it inverts with the theme', () => {
    // All three, not only the one that was observable: exactly one mode is active
    // at a time, so the other two carried the same defect unpainted.
    for (const mode of ['live', 'reader', 'focus']) {
      const rule = block(`.immersion-mode-btn-${mode}.active`);
      expect(rule, mode).toMatch(/color: color-mix\(in srgb, [^;]*40%|45%/);
      expect(rule, mode).toContain('var(--text)');
    }
  });

  it('does not reintroduce a pale fixed label on a palette-mixed background', () => {
    // The background already mixes into `var(--panel-2)`, so it goes pale in a
    // light theme; a fixed pale foreground goes with it and the pair vanishes.
    for (const literal of ['color: #93c5fd', 'color: #6ee7b7', 'color: color-mix(in srgb, var(--accent) 85%, white)']) {
      expect(CSS).not.toContain(literal);
    }
  });
});

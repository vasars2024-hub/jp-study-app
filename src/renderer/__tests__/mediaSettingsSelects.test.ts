// @vitest-environment node
/**
 * The Media Settings pane's "Subtitle position" select offered `bottom | middle | top`
 * while the stored vocabulary is `SubtitleVerticalPosition = 'top' | 'center' | 'bottom'`,
 * whose DEFAULT is `center`. Measured live 2026-09-06 on the user's own profile, pid 14128:
 *
 *   stored `subtitlePosition` = "center"  ->  the select displayed **Bottom**
 *   picking **Middle**                    ->  stored stayed "center" (nothing written)
 *   picking **Top** (the CONTROL)         ->  stored became "top"
 *
 * So the control was broken in both directions: it showed a position the user had never
 * chosen, and one of its three options was inert.
 *
 * The assertion below is deliberately a ROUND TRIP through the real normalizer rather than
 * a string match on the option list: an option the store rejects is the defect, whatever it
 * happens to be called.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DEFAULT_PLAYER_PREFERENCES, normalizePlayerPreferences } from '../../shared/playerPreferences';

const VIEW = resolve(__dirname, '..', 'views', 'MediaCenterView.tsx');
const src = readFileSync(VIEW, 'utf8');

/** The `<option value="...">` values of the select whose `value` prop is `expr`. */
function optionValuesOf(expr: string): string[] {
  const at = src.indexOf(expr);
  expect(at, `no select bound to ${expr}`).toBeGreaterThan(-1);
  const close = src.indexOf('</select>', at);
  expect(close, `unterminated select for ${expr}`).toBeGreaterThan(at);
  return [...src.slice(at, close).matchAll(/<option value="([^"]*)"/g)].map((m) => m[1]);
}

describe('the subtitle-position select speaks the store\'s vocabulary', () => {
  const values = optionValuesOf('value={state.subtitlePosition}');

  it('offers three positions', () => {
    expect(values).toHaveLength(3);
  });

  it('every option survives the store round trip', () => {
    for (const value of values) {
      expect(
        normalizePlayerPreferences({ subtitlePosition: value }).subtitlePosition,
        `picking "${value}" does not persist as "${value}"`,
      ).toBe(value);
    }
  });

  it('the DEFAULT position is one of them, so an untouched profile reads true', () => {
    // This is the half that was wrong for every user who had never opened the control.
    expect(values).toContain(DEFAULT_PLAYER_PREFERENCES.subtitlePosition);
  });
});

describe('every select in a mc-setting-row carries its own accessible name', () => {
  it('names all four', () => {
    // The visible label sits in a sibling `<span>`, not a `<label>`, so without this the
    // control announces only its value. The range input in the same row pattern already
    // carried `aria-label` and was the control that proved the omission.
    //
    // Scoped to the settings grid on purpose: the Music pane's sort select above it is
    // wrapped in a real `<label>` and needs no `aria-label`. It is the NEGATIVE case, and
    // asserting over the whole file would have demanded a redundant attribute on it.
    const grid = src.indexOf('className="mc-settings-grid"');
    expect(grid, 'no mc-settings-grid').toBeGreaterThan(-1);
    const selects = [...src.slice(grid).matchAll(/<select\b[\s\S]*?>/g)].map((m) => m[0]);
    expect(selects.length).toBeGreaterThanOrEqual(4);
    const unnamed = selects.filter((tag) => !tag.includes('aria-label='));
    expect(unnamed, `selects with no accessible name: ${unnamed.join(' | ')}`).toHaveLength(0);
  });
});

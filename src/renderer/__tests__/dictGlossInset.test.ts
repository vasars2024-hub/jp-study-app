// @vitest-environment node
/**
 * The popup's definition-language chips and its "other languages are hidden"
 * note sit in the entries' content column (round-4 journeys audit).
 *
 * Measured on the packaged app (EPUB reader → click a word): `.dict-gloss-langs`
 * and `.dict-gloss-hidden` had 0 px inline padding inside `.dict-results.popup`,
 * so the English / Русский chips and the hint text ran flush against the
 * popup's left border while every entry below them was inset by
 * `.dict-popup .dict-entry`'s 10 px. jsdom applies no stylesheet, so the
 * contract is read from the rules themselves.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');

/** The declarations of the last rule whose selector list is exactly `selector`. */
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = [...css.matchAll(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'gm'))];
  return matches.length ? matches[matches.length - 1][1] : '';
}

/** Inline (left/right) padding a rule declares, in px, from `padding-inline` or `padding`. */
function inlinePadding(body: string): number | null {
  const inline = body.match(/padding-inline:\s*(\d+)px/);
  if (inline) return Number(inline[1]);
  const shorthand = body.match(/(?:^|;|\s)padding:\s*([^;]+);/);
  if (!shorthand) return null;
  const parts = shorthand[1].trim().split(/\s+/).map((p) => Number.parseFloat(p));
  return parts.length === 1 ? parts[0] : parts[1];
}

describe('dictionary popup gloss chips and hint', () => {
  it('are inset like the popup entries', () => {
    const entry = inlinePadding(rule('.dict-popup .dict-entry'));
    expect(entry, 'popup entries declare an inline padding').toBe(10);
    expect(inlinePadding(rule('.dict-popup .dict-gloss-langs'))).toBe(entry);
    expect(inlinePadding(rule('.dict-popup .dict-gloss-hidden'))).toBe(entry);
  });

  it('are inset like full-size entries in the Dictionary window', () => {
    const entry = inlinePadding(rule('.dict-entry'));
    expect(entry).toBe(14);
    expect(inlinePadding(rule('.dict-gloss-langs'))).toBe(entry);
    expect(inlinePadding(rule('.dict-gloss-hidden'))).toBe(entry);
  });
});

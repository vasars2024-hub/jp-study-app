/**
 * A sticky note paints its own title bar in one of five pastel `NOTE_COLORS`, so the standard
 * chrome ink — tuned for a dark bar — is invisible on it. The title and the close button each
 * carried their own copy of the same `isNote && !liquid ? { color: '#3a3320' }` ternary; the
 * Liquid toggle, added later between them, carried none.
 *
 * Measured live through the debug bridge on 2026-09-03, on a `#fff3a3` note: the `◇` glyph
 * painted **1.2:1** against a 4.5 bar while its two neighbours in the same bar sat at 11.1:1.
 * Category 1 failed the surface on that one run. The repair hoists the predicate to a single
 * `noteInk` const and applies it at all three sites, because two copies were two chances for a
 * third control to be missed and that is exactly what happened.
 *
 * A source scan rather than a render, for the reason `desktopNoteCloseConfirm.test.ts` gives:
 * `vitest.config.ts` is `environment: 'node'` and `DesktopShell.tsx` pulls the whole shell tree
 * at module eval. Two things stop that scan from passing vacuously:
 *
 *  - **Comments are stripped before every scan.** The repair's own comment names `noteInk` and
 *    `#3a3320` in prose, and a raw-text scan would count that prose as a fourth call site. This
 *    repo has already published a false "closed" that way (`source-ratchet-reads-comments`).
 *  - **A mutation control**: the `style={noteInk}` removed from the Liquid toggle in a copy of
 *    the real source must make the real assertion fail. Without it "all three carry it" is
 *    satisfied by a file that renders no buttons at all.
 *
 * The contrast case is not a ratchet: it recomputes WCAG 2.1 relative luminance from the ink
 * and from `NOTE_COLORS` as the source actually declares them, so a future palette change that
 * reintroduces the defect fails here rather than in a live sweep three weeks later.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');
const SHELL = 'src/renderer/components/DesktopShell.tsx';

function shellSource(): string {
  return readFileSync(resolve(REPO, SHELL), 'utf8');
}

/** Block and line comments removed, so prose about the fix can never satisfy a scan. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** The `.fwin-bar` JSX of the floating-window component, where the three note glyphs live. */
function titleBarJsx(source: string): string {
  const start = source.indexOf('className="fwin-bar"');
  if (start < 0) return '';
  const end = source.indexOf('{isGarden && (', start);
  return end < 0 ? source.slice(start) : source.slice(start, end);
}

/** Elements in the title bar that apply `style={noteInk}`, keyed by the class that names them. */
function inkedChrome(source: string): string[] {
  const bar = titleBarJsx(stripComments(source));
  const out: string[] = [];
  for (const cls of ['fwin-title', 'fwin-b-liquid', 'fwin-close']) {
    // Each element opens at its className and ends at the next `>` that closes the tag; the
    // `style` prop must sit inside THAT element, not merely somewhere in the bar.
    const at = bar.indexOf(cls);
    if (at < 0) continue;
    const tagStart = bar.lastIndexOf('<', at);
    const tagEnd = bar.indexOf('>', at);
    if (tagStart < 0 || tagEnd < 0) continue;
    if (bar.slice(tagStart, tagEnd).includes('style={noteInk}')) out.push(cls);
  }
  return out;
}

const HEX = /^#([0-9a-f]{6})$/i;

function luminance(hex: string): number {
  const m = HEX.exec(hex);
  if (!m) throw new Error(`not a 6-digit hex colour: ${hex}`);
  const channels = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `NOTE_COLORS` as the shell declares it, read rather than duplicated. */
function noteColors(source: string): string[] {
  const m = /const NOTE_COLORS = \[([^\]]*)\]/.exec(stripComments(source));
  if (!m) return [];
  return [...m[1].matchAll(/'(#[0-9a-f]{6})'/gi)].map((x) => x[1]);
}

/** The ink `noteInk` actually applies. */
function noteInkColor(source: string): string | null {
  const m = /const noteInk = isNote && !liquid \? \{ color: '(#[0-9a-f]{6})' \} : undefined/i
    .exec(stripComments(source));
  return m ? m[1] : null;
}

describe('sticky-note title-bar ink', () => {
  it('declares the predicate exactly once, gated on isNote and standard presentation', () => {
    const stripped = stripComments(shellSource());
    expect(noteInkColor(shellSource())).toBe('#3a3320');
    // The drift the defect came from: an inline copy of the same ternary at a call site.
    const inlineCopies = [...stripped.matchAll(/isNote && !liquid \? \{ color:/g)].length;
    expect(inlineCopies).toBe(1);
  });

  it('applies it to all three glyphs a note paints on its own bar', () => {
    expect(inkedChrome(shellSource())).toEqual(['fwin-title', 'fwin-b-liquid', 'fwin-close']);
  });

  it('MUTATION CONTROL — dropping it from the Liquid toggle fails the assertion above', () => {
    const bar = titleBarJsx(stripComments(shellSource()));
    const at = bar.indexOf('fwin-b-liquid');
    const tagEnd = bar.indexOf('>', at);
    const tag = bar.slice(bar.lastIndexOf('<', at), tagEnd);
    // The control must attack the term the test scores: the toggle's OWN style prop.
    expect(tag).toContain('style={noteInk}');
    const mutated = shellSource().replace(tag, tag.replace('style={noteInk}', ''));
    expect(mutated).not.toBe(shellSource());
    expect(inkedChrome(mutated)).toEqual(['fwin-title', 'fwin-close']);
  });

  it('clears the 4.5:1 bar on every colour a note can actually be', () => {
    const source = shellSource();
    const ink = noteInkColor(source);
    const colors = noteColors(source);
    expect(ink).toBeTruthy();
    expect(colors.length).toBeGreaterThanOrEqual(5);
    const ratios = colors.map((c) => ({ color: c, ratio: Number(contrast(ink as string, c).toFixed(2)) }));
    expect(ratios.filter((r) => r.ratio < 4.5)).toEqual([]);
    // The measured live value on the default note, so a drift is visible as a number.
    expect(ratios[0]).toEqual({ color: '#fff3a3', ratio: 11.11 });
  });

  it('MUTATION CONTROL — the chrome ink the note does NOT use would fail that bar', () => {
    // `.fwin-b`'s own colour is what the Liquid toggle inherited before the repair; it is a
    // near-white tuned for a dark bar. Against `#fff3a3` it is the 1.2:1 that was measured.
    const ratios = noteColors(shellSource()).map((c) => contrast('#e8ecf5', c));
    expect(ratios.every((r) => r < 4.5)).toBe(true);
  });
});

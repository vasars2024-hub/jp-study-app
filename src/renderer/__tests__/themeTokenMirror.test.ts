// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOKEN_GROUPS, cssVar, duration, easing, elevation, fontSize, zIndex } from '../theme/tokens';

/**
 * `theme/tokens.ts` is the typed mirror of `theme/tokens.css`, and the source
 * `docs/frutiger-aero/THEME_TOKEN_REFERENCE.md` is generated from. Two plan documents
 * (PHASE_1_IMPLEMENTATION_PLAN.md, UI_UX_CORE_SHELL_EXECUTION_PLAN.md §12) say to keep
 * the two in sync by hand.
 *
 * Nothing imported it, so nothing noticed when they drifted — `architecture-audit.cjs`
 * reported it as an orphan. Deleting it would contradict both plans; the right fix is
 * to make the mirror a checked contract instead of a promise. This is that check.
 */

const CSS = readFileSync(resolve(__dirname, '..', 'theme', 'tokens.css'), 'utf8');

/** Every `--name:` declared anywhere in tokens.css. */
const declared = new Set(
  [...CSS.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((match) => match[1]),
);

describe('theme token mirror', () => {
  it('reads a tokens.css that actually declares tokens', () => {
    // Guards the assertions below from passing vacuously on a bad read or a moved file.
    expect(declared.size).toBeGreaterThan(50);
    expect(TOKEN_GROUPS.length).toBeGreaterThan(3);
  });

  it('declares every mirrored token in tokens.css', () => {
    const missing: string[] = [];
    for (const group of TOKEN_GROUPS) {
      for (const token of group.tokens) {
        if (!declared.has(token.name)) missing.push(`${group.tier}: ${token.name}`);
      }
    }
    expect(
      missing,
      'tokens.ts documents tokens that tokens.css does not declare — the mirror has drifted.',
    ).toEqual([]);
  });

  it('gives every mirrored token a description, since the reference doc is generated from them', () => {
    const undocumented: string[] = [];
    for (const group of TOKEN_GROUPS) {
      expect(group.tier.trim().length, 'a token group has no tier name').toBeGreaterThan(0);
      for (const token of group.tokens) {
        if (!token.description?.trim()) undocumented.push(token.name);
      }
    }
    expect(undocumented).toEqual([]);
  });

  it('never lists the same token twice', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const group of TOKEN_GROUPS) {
      for (const token of group.tokens) {
        if (seen.has(token.name)) duplicates.push(token.name);
        seen.add(token.name);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('points its typed helpers at tokens that exist', () => {
    const referenced = [
      ...Object.values(fontSize),
      ...Object.values(duration),
      ...Object.values(easing),
      ...Object.values(elevation),
      ...Object.values(zIndex),
    ].filter((value): value is string => typeof value === 'string');

    const broken = referenced
      .flatMap((value) => [...value.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))
      .filter((name) => !declared.has(name));
    expect([...new Set(broken)], 'a typed helper references an undeclared custom property').toEqual([]);
  });

  it('builds a var() reference, with and without a fallback', () => {
    expect(cssVar('--font-size-md')).toBe('var(--font-size-md)');
    expect(cssVar('--font-size-md', '14px')).toBe('var(--font-size-md, 14px)');
  });
});

import { describe, expect, it } from 'vitest';

import { GRAMMAR_FUNCTION_IDS } from '../data/grammar/functions';
import {
  CATEGORY_BY_ID,
  CATEGORY_GROUP_IDS,
  CATEGORY_IDS,
  GRAMMAR_CATEGORIES,
  LEGACY_ALIASES,
  categoriesByGroup,
  categoriesForLang,
  resolveCategories,
} from '../data/grammar/taxonomy';

/*
 * These guard the two ways a taxonomy silently loses data: an unmapped legacy
 * id (records quietly drop out of every filter) and an alias pointing at a
 * category that does not exist (a filter chip that can never match).
 */
describe('grammar taxonomy', () => {
  it('maps every legacy function id', () => {
    const missing = GRAMMAR_FUNCTION_IDS.filter((id) => !(id in LEGACY_ALIASES));
    expect(missing).toEqual([]);
  });

  it('has no alias keys outside the legacy id list', () => {
    const extra = Object.keys(LEGACY_ALIASES).filter(
      (k) => !(GRAMMAR_FUNCTION_IDS as readonly string[]).includes(k),
    );
    expect(extra).toEqual([]);
  });

  it('only ever resolves to real categories', () => {
    const bad: string[] = [];
    for (const [legacy, targets] of Object.entries(LEGACY_ALIASES)) {
      for (const target of targets) {
        if (!CATEGORY_BY_ID.has(target)) bad.push(`${legacy} -> ${target}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('has unique category ids', () => {
    expect(new Set(CATEGORY_IDS).size).toBe(CATEGORY_IDS.length);
  });

  it('files every category under a declared group', () => {
    const bad = GRAMMAR_CATEGORIES.filter(
      (c) => !(CATEGORY_GROUP_IDS as readonly string[]).includes(c.group),
    );
    expect(bad).toEqual([]);
  });

  it('derives label and description keys from the id, never a literal', () => {
    for (const c of GRAMMAR_CATEGORIES) {
      expect(c.labelKey).toBe(`grammar.cat.${c.id}`);
      expect(c.descKey).toBe(`grammar.cat.${c.id}.desc`);
    }
  });

  it('points confusableWith at real categories', () => {
    const bad: string[] = [];
    for (const c of GRAMMAR_CATEGORIES) {
      for (const other of c.confusableWith ?? []) {
        if (!CATEGORY_BY_ID.has(other)) bad.push(`${c.id} -> ${other}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('leaves no category unreachable from the legacy corpus', () => {
    // A category no alias points at can only ever be populated by newly
    // authored data — worth knowing about deliberately rather than by accident.
    const referenced = new Set(Object.values(LEGACY_ALIASES).flat());
    const unreachable = CATEGORY_IDS.filter((id) => !referenced.has(id));
    expect(unreachable).toEqual([]);
  });

  describe('resolveCategories', () => {
    it('returns [] for the "other" fallback rather than inventing a category', () => {
      expect(resolveCategories(['other'])).toEqual([]);
    });

    it('dedupes when two legacy ids share a canonical target', () => {
      // both map to emphasis.negation
      const out = resolveCategories(['emphasize-negative', 'emphasize-the-negative']);
      expect(out.filter((c) => c === 'emphasis.negation')).toHaveLength(1);
    });

    it('expands a legacy id that spans several functions', () => {
      expect(resolveCategories(['location-method-cause']).sort()).toEqual(
        ['cause.reason', 'method.means', 'space.location'].sort(),
      );
    });

    it('ignores unknown ids instead of throwing', () => {
      expect(resolveCategories(['not-a-real-id' as never])).toEqual([]);
    });

    it('returns [] for empty/undefined input', () => {
      expect(resolveCategories([])).toEqual([]);
      expect(resolveCategories(undefined)).toEqual([]);
    });
  });

  describe('language gating', () => {
    it('keeps Japanese-only categories out of the Chinese taxonomy', () => {
      const zh = categoriesForLang('zh').map((c) => c.id);
      expect(zh).not.toContain('register.honorific');
      expect(zh).not.toContain('voice.benefactive');
    });

    it('offers honorific/humble for Japanese', () => {
      const ja = categoriesForLang('ja').map((c) => c.id);
      expect(ja).toContain('register.honorific');
    });

    it('omits empty groups when grouping for a language', () => {
      for (const g of categoriesByGroup('zh')) {
        expect(g.categories.length).toBeGreaterThan(0);
      }
    });
  });
});

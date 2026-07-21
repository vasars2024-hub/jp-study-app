import { describe, expect, it } from 'vitest';
import { isResourcesCatalog, type ResourcesCatalog } from '../resourcesCatalog';
import { CATALOG_FALLBACK } from '../../renderer/data/catalogFallback';

describe('isResourcesCatalog', () => {
  it('accepts a minimal valid catalogue', () => {
    const cat: ResourcesCatalog = {
      schemaVersion: 1,
      updatedAt: '2026-07-16',
      bundles: [],
      newSection: [],
    };
    expect(isResourcesCatalog(cat)).toBe(true);
  });

  it('rejects wrong schema version', () => {
    expect(isResourcesCatalog({ schemaVersion: 2, bundles: [], newSection: [] })).toBe(false);
  });

  it('rejects missing arrays', () => {
    expect(isResourcesCatalog({ schemaVersion: 1, bundles: [] })).toBe(false);
    expect(isResourcesCatalog({ schemaVersion: 1, newSection: [] })).toBe(false);
  });

  it('rejects non-objects', () => {
    expect(isResourcesCatalog(null)).toBe(false);
    expect(isResourcesCatalog('nope')).toBe(false);
    expect(isResourcesCatalog(42)).toBe(false);
  });
});

describe('bundled fallback catalogue', () => {
  it('is itself a valid catalogue', () => {
    expect(isResourcesCatalog(CATALOG_FALLBACK)).toBe(true);
  });

  it('has at least 10 bundles, each well-formed', () => {
    expect(CATALOG_FALLBACK.bundles.length).toBeGreaterThanOrEqual(10);
    for (const b of CATALOG_FALLBACK.bundles) {
      expect(b.id).toBeTruthy();
      expect(b.gem).toBeTruthy();
      expect(b.color).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      expect(b.icon).toBeTruthy();
      expect(b.title).toBeTruthy();
      expect(b.items.length).toBeGreaterThan(0);
      for (const r of b.items) {
        expect(r.name).toBeTruthy();
        expect(r.url).toMatch(/^https?:\/\//);
        expect(['Free', 'Freemium', 'Paid']).toContain(r.cost);
      }
      for (const c of b.checklist ?? []) {
        expect(c.id).toBeTruthy();
        expect(c.text).toBeTruthy();
      }
    }
  });

  it('has unique bundle ids and unique checklist ids within each bundle', () => {
    const ids = CATALOG_FALLBACK.bundles.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of CATALOG_FALLBACK.bundles) {
      const cids = (b.checklist ?? []).map((c) => c.id);
      expect(new Set(cids).size).toBe(cids.length);
    }
  });
});

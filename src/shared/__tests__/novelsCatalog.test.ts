import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { isNovelsCatalog, NOVELS_URL } from '../resourcesCatalog';

describe('isNovelsCatalog', () => {
  it('accepts a valid novels catalogue', () => {
    expect(isNovelsCatalog({ schemaVersion: 1, updatedAt: '2026-07-16', novels: [] })).toBe(true);
  });
  it('rejects wrong version / shape', () => {
    expect(isNovelsCatalog({ schemaVersion: 2, novels: [] })).toBe(false);
    expect(isNovelsCatalog({ schemaVersion: 1 })).toBe(false);
    expect(isNovelsCatalog(null)).toBe(false);
  });
  it('points NOVELS_URL at novels.json in the catalog repo', () => {
    expect(NOVELS_URL).toMatch(/\/novels\.json$/);
  });
});

describe('generated novels.json (if built)', () => {
  const file = path.join(process.cwd(), 'catalog-repo', 'novels.json');
  it('passes the schema guard and has well-formed entries', () => {
    if (!existsSync(file)) {
      // Build artifact is optional in CI; skip when absent.
      expect(true).toBe(true);
      return;
    }
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as unknown;
    expect(isNovelsCatalog(parsed)).toBe(true);
    const cat = parsed as { novels: Array<Record<string, unknown>> };
    expect(cat.novels.length).toBeGreaterThan(0);
    const DIFFS = ['Beginner', 'Easy', 'Moderate', 'Hard', 'Very Hard'];
    for (const nv of cat.novels) {
      expect(typeof nv.titleJp).toBe('string');
      expect(typeof nv.author).toBe('string');
      expect(DIFFS).toContain(nv.difficulty);
      expect(Array.isArray(nv.links)).toBe(true);
    }
  });
});

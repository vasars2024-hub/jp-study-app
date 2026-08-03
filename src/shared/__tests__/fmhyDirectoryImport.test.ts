import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHTML } from 'linkedom';
import { describe, expect, it } from 'vitest';
import { createEmptyVerifiedSitesDocument, normalizeVerifiedSitesDocument } from '../verifiedSites';
import { applyFmhyDirectoryReconciliation, mergeFmhyDirectoryEntries, parseFmhyVideoDirectory, reconcileFmhyDirectoryEntries } from '../fmhyDirectoryImport';

const fixture = readFileSync(join(process.cwd(), 'src/shared/__tests__/fixtures/fmhy-video.html'), 'utf8');

describe('FMHY video directory metadata connector', () => {
  it('extracts direct displayed links with their nearest section and skips encoded links', () => {
    const { document } = parseHTML(fixture);
    const result = parseFmhyVideoDirectory(document.documentElement);
    expect(result.entries).toEqual([
      { name: 'Cineby', category: 'Stream Aggregators', url: 'https://cineby.example' },
      { name: 'Cineplay', category: 'Stream Aggregators', url: 'https://cineplay.example' },
      { name: 'Direct Site', category: 'Dedicated-Server', url: 'https://direct.example/path' },
    ]);
    expect(result.skippedEncoded).toBe(3);
    expect(result.skippedDuplicate).toBe(1);
  });

  it('merges as inactive unverified FMHY records and preserves existing URLs', () => {
    const { document } = parseHTML(fixture);
    const parsed = parseFmhyVideoDirectory(document.documentElement);
    const first = mergeFmhyDirectoryEntries(createEmptyVerifiedSitesDocument(), parsed.entries, '2026-07-22T00:00:00.000Z');
    const second = mergeFmhyDirectoryEntries(first.value, parsed.entries, '2026-07-23T00:00:00.000Z');
    expect(first.imported).toBe(3);
    expect(first.value.sites[0]).toMatchObject({ status: 'unverified', active: false, source: 'fmhy', sourceCategory: 'Stream Aggregators', reliabilityScore: 0 });
    expect(second.imported).toBe(0);
    expect(second.duplicates).toBe(3);
  });

  it('retains a cross-source URL collision for user-controlled reconciliation', () => {
    const builtIn = normalizeVerifiedSitesDocument({ sites: [{
      id: 'built-in', name: 'Built in', baseUrl: 'https://cineby.example', source: 'built-in', status: 'verified',
    }] }, '2026-07-20T00:00:00.000Z').value;
    const merged = mergeFmhyDirectoryEntries(builtIn, [{ name: 'FMHY copy', category: 'Video', url: 'https://cineby.example' }], '2026-07-22T00:00:00.000Z');
    expect(merged.imported).toBe(1);
    expect(merged.value.sites.map((site) => site.source)).toEqual(['built-in', 'fmhy']);
  });

  it('previews and applies metadata reconciliation without deleting absent entries or resetting verification', () => {
    const initial = mergeFmhyDirectoryEntries(createEmptyVerifiedSitesDocument(), [
      { name: 'Old name', category: 'Old section', url: 'https://kept.example' },
      { name: 'Absent', category: 'Old section', url: 'https://absent.example' },
    ], '2026-07-20T00:00:00.000Z').value;
    initial.sites[0] = { ...initial.sites[0], status: 'verified', active: true, reliabilityScore: 88 };
    const preview = reconcileFmhyDirectoryEntries(initial, [
      { name: 'New name', category: 'New section', url: 'https://kept.example' },
      { name: 'Added', category: 'New section', url: 'https://added.example' },
    ]);
    expect(preview).toMatchObject({ added: [{ name: 'Added' }], changed: [{ previousName: 'Old name' }], absent: [{ name: 'Absent' }] });
    const applied = applyFmhyDirectoryReconciliation(initial, preview, '2026-07-22T00:00:00.000Z');
    expect(applied).toMatchObject({ added: 1, updated: 1 });
    expect(applied.value.sites.find((site) => site.baseUrl === 'https://kept.example')).toMatchObject({ name: 'New name', sourceCategory: 'New section', status: 'verified', active: true, reliabilityScore: 88 });
    expect(applied.value.sites.some((site) => site.baseUrl === 'https://absent.example')).toBe(true);
  });
});

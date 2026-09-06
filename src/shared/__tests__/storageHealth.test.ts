// @vitest-environment node
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_STORAGE_BUDGET,
  entryBytes,
  inspectStorageHealth,
  isQuotaExceededError,
  measureStorage,
  scanOverEncoded,
  type ReadableStorage,
} from '../storageHealth';

function makeStorage(entries: Record<string, string>): ReadableStorage {
  const keys = Object.keys(entries);
  return {
    getItem: (k: string) => (k in entries ? entries[k] : null),
    key: (i: number) => keys[i] ?? null,
    get length() {
      return keys.length;
    },
  };
}

/** `n` layers of encoding over `value`, the way 6.A accumulated them per boot. */
function overEncode(value: unknown, layers: number): string {
  let out = JSON.stringify(value);
  for (let i = 1; i < layers; i += 1) out = JSON.stringify(out);
  return out;
}

describe('measureStorage', () => {
  it('counts UTF-16 bytes including the key, and ranks largest first', () => {
    const storage = makeStorage({ a: 'x'.repeat(100), bb: 'y'.repeat(10) });
    const footprint = measureStorage(storage);

    expect(footprint.keyCount).toBe(2);
    // (1 + 100) * 2 + (2 + 10) * 2
    expect(footprint.totalBytes).toBe(202 + 24);
    expect(footprint.largest.map((e) => e.key)).toEqual(['a', 'bb']);
    expect(footprint.largest[0].bytes).toBe(entryBytes('a', 'x'.repeat(100)));
  });

  it('caps the largest list without changing the total', () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i < 25; i += 1) entries[`k${i}`] = 'v'.repeat(i + 1);
    const footprint = measureStorage(makeStorage(entries), 3);

    expect(footprint.keyCount).toBe(25);
    expect(footprint.largest).toHaveLength(3);
    expect(footprint.largest[0].key).toBe('k24');
  });
});

describe('scanOverEncoded', () => {
  it('finds the 6.A signature and reports its layer count', () => {
    const storage = makeStorage({
      'jp-flashcard-deck': overEncode({ cards: [1, 2, 3] }, 9),
      healthy: JSON.stringify({ cards: [] }),
    });

    const found = scanOverEncoded(storage);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe('jp-flashcard-deck');
    expect(found[0].layers).toBe(9);
  });

  // The peeling limit named in overEncodedJson's own header: nothing in the
  // text distinguishes a quoted number from an extra encoding layer. Reporting
  // jp-app-zoom as corrupt every boot would make the guard unusable.
  it('does not flag bare scalars, which peel more than once by construction', () => {
    const storage = makeStorage({
      'jp-app-zoom': '1.1',
      'quoted-number': JSON.stringify('42'),
      'quoted-string': JSON.stringify('hello'),
      'jp-study-flag': 'true',
    });
    expect(scanOverEncoded(storage)).toEqual([]);
  });

  it('does not flag a quarantine copy, which is damaged text kept on purpose', () => {
    const damaged = overEncode({ table: {} }, 18);
    const storage = makeStorage({ 'jp-study-csv-editor-v1.corrupt-backup': damaged });
    expect(scanOverEncoded(storage)).toEqual([]);
  });

  it('ignores absent and empty values rather than counting them as keys', () => {
    expect(scanOverEncoded(makeStorage({ empty: '' }))).toEqual([]);
  });
});

describe('inspectStorageHealth', () => {
  it('reports ok for the post-repair baseline shape', () => {
    const health = inspectStorageHealth(
      makeStorage({ 'jp-scraper-settings-v1': JSON.stringify({ profiles: [] }) }),
    );
    expect(health.status).toBe('ok');
    expect(health.reasons).toEqual([]);
    expect(health.oversizedKeys).toEqual([]);
  });

  it('is critical on over-encoding at any size, ahead of the budget alarms', () => {
    // Deliberately tiny: the defect is the encoding, not the byte count.
    const health = inspectStorageHealth(makeStorage({ k: overEncode({ a: 1 }, 3) }));
    expect(health.status).toBe('critical');
    expect(health.reasons).toEqual(['over-encoded']);
    expect(health.footprint.totalBytes).toBeLessThan(1024);
  });

  it('warns — not criticals — when the whole store crosses its growth budget', () => {
    const half = DEFAULT_STORAGE_BUDGET.totalBudgetBytes / 2;
    const health = inspectStorageHealth(
      makeStorage({ a: 'x'.repeat(half / 2), b: 'y'.repeat(half / 2) }),
    );
    expect(health.status).toBe('warn');
    expect(health.reasons).toContain('total-over-budget');
  });

  it('names the single key that crossed the per-key budget', () => {
    const big = 'x'.repeat(DEFAULT_STORAGE_BUDGET.keyBudgetBytes);
    const health = inspectStorageHealth(makeStorage({ small: 'v', 'jp-big-v1': big }));

    expect(health.status).toBe('warn');
    expect(health.reasons).toContain('key-over-budget');
    expect(health.oversizedKeys.map((e) => e.key)).toEqual(['jp-big-v1']);
  });

  it('honours a caller-supplied budget instead of the default', () => {
    const storage = makeStorage({ k: 'v'.repeat(1000) });
    expect(inspectStorageHealth(storage).status).toBe('ok');
    expect(
      inspectStorageHealth(storage, { totalBudgetBytes: 100, keyBudgetBytes: 100 }).status,
    ).toBe('warn');
  });
});

describe('isQuotaExceededError', () => {
  it('recognises the names and legacy codes browsers actually throw', () => {
    expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError({ code: 1014 })).toBe(true);
  });

  it('does not claim an unrelated failure was a full disk', () => {
    expect(isQuotaExceededError(new TypeError('circular structure'))).toBe(false);
    expect(isQuotaExceededError({ name: 'SecurityError', code: 18 })).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
  });
});

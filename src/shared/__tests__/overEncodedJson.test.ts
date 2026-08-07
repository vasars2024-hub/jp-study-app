import { describe, expect, it } from 'vitest';
import { QUARANTINE_SUFFIX, isOverEncoded, quarantineIfUnrepaired, unwrapOverEncoded } from '../overEncodedJson';

function fakeStorage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const wrap = (value: unknown, times: number): string => {
  let out = JSON.stringify(value);
  for (let i = 1; i < times; i += 1) out = JSON.stringify(out);
  return out;
};

describe('unwrapOverEncoded', () => {
  it('leaves a healthy single-layer value alone', () => {
    const deck = { folders: ['Extension'], cards: [{ id: 'fc-1' }] };
    const r = unwrapOverEncoded<typeof deck>(JSON.stringify(deck));
    expect(r.layers).toBe(1);
    expect(r.value).toEqual(deck);
    expect(isOverEncoded(r.layers)).toBe(false);
  });

  it('peels the nine layers measured on the live profile', () => {
    const deck = { folders: ['Extension'], cards: [{ id: 'fc-1' }, { id: 'fc-2' }] };
    const r = unwrapOverEncoded<typeof deck>(wrap(deck, 9));
    expect(r.layers).toBe(9);
    expect(r.value).toEqual(deck);
    expect(isOverEncoded(r.layers)).toBe(true);
  });

  it('reproduces the failure it fixes: one parse of a 9-layer value is a string', () => {
    const deck = { folders: [], cards: [{ id: 'fc-1' }] };
    const once = JSON.parse(wrap(deck, 9)) as unknown;
    expect(typeof once).toBe('string');
    expect((once as { cards?: unknown[] }).cards).toBeUndefined();
  });

  it('stops at a legitimately stored string instead of over-peeling', () => {
    // '"hi"' parses to 'hi', which parses no further — one layer, value intact.
    const r = unwrapOverEncoded<string>(JSON.stringify('hi'));
    expect(r.layers).toBe(1);
    expect(r.value).toBe('hi');
  });

  it('DOES coerce a numeric-looking string — the known limit of peeling blind', () => {
    // '"42"' parses to '42' (string), which parses again to 42 (number). Nothing
    // in the text distinguishes "a string that happens to look like a number"
    // from "one extra encoding layer", so the peel cannot preserve it. Safe for
    // the two keys this is applied to (both store objects); documented in the
    // module so nobody points it at a key whose payload is a bare scalar.
    const r = unwrapOverEncoded(JSON.stringify('42'));
    expect(r.value).toBe(42);
    expect(r.layers).toBe(2);
  });

  it('returns the raw text as a string when the value was never JSON', () => {
    const r = unwrapOverEncoded('not json at all');
    expect(r.layers).toBe(0);
    expect(r.value).toBe('not json at all');
  });

  it('handles empty and absent values', () => {
    expect(unwrapOverEncoded(null)).toEqual({ value: null, layers: 0 });
    expect(unwrapOverEncoded(undefined)).toEqual({ value: null, layers: 0 });
    expect(unwrapOverEncoded('')).toEqual({ value: null, layers: 0 });
  });

  it('terminates on the deepest value that can actually be built', () => {
    // Each layer roughly doubles the text, so the MAX_LAYERS cap is unreachable
    // in practice — `wrap(x, 60)` throws `RangeError: Invalid string length`
    // before it can be tested. 15 layers is ~230 KB and is the realistic shape.
    const deck = { folders: ['a'], cards: [{ id: 'fc-1' }] };
    const r = unwrapOverEncoded<typeof deck>(wrap(deck, 15));
    expect(r.layers).toBe(15);
    expect(r.value).toEqual(deck);
  });

  it('isOverEncoded respects an explicit expected depth', () => {
    expect(isOverEncoded(1)).toBe(false);
    expect(isOverEncoded(2)).toBe(true);
    expect(isOverEncoded(2, 2)).toBe(false);
  });
});

describe('quarantineIfUnrepaired', () => {
  it('copies a damaged value aside before the caller lets it be overwritten', () => {
    const s = fakeStorage({ 'jp-x': 'damaged-blob' });
    expect(quarantineIfUnrepaired(s, 'jp-x', 5)).toBe('quarantined');
    expect(s.getItem(`jp-x${QUARANTINE_SUFFIX}`)).toBe('damaged-blob');
    expect(s.getItem('jp-x')).toBe('damaged-blob');
  });

  it('does nothing for a healthy single-layer value', () => {
    const s = fakeStorage({ 'jp-x': '{"a":1}' });
    expect(quarantineIfUnrepaired(s, 'jp-x', 1)).toBe('skipped');
    expect(s.getItem(`jp-x${QUARANTINE_SUFFIX}`)).toBeNull();
  });

  it('keeps the FIRST damaged copy — a re-run must not overwrite it', () => {
    const s = fakeStorage({ 'jp-x': 'original-damage' });
    expect(quarantineIfUnrepaired(s, 'jp-x', 6)).toBe('quarantined');
    s.map.set('jp-x', 'already-defaulted');
    expect(quarantineIfUnrepaired(s, 'jp-x', 6)).toBe('skipped');
    expect(s.getItem(`jp-x${QUARANTINE_SUFFIX}`)).toBe('original-damage');
  });

  it('skips when there is nothing stored', () => {
    const s = fakeStorage();
    expect(quarantineIfUnrepaired(s, 'jp-missing', 9)).toBe('skipped');
  });

  it('reports failure instead of throwing when the write is refused', () => {
    const s = {
      getItem: (k: string) => (k.endsWith(QUARANTINE_SUFFIX) ? null : 'damaged'),
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(quarantineIfUnrepaired(s, 'jp-x', 4)).toBe('failed');
  });
});

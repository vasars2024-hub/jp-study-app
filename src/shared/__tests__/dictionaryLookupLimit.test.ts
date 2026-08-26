// The page-size contract both ends of the dictionary IPC read from.
//
// It matters that these agree: if the renderer can ask for a page main will
// quietly shrink, "Show more" renders as a button that changes nothing on
// screen, which is the honest-states failure the truncation row exists to fix.
import { describe, expect, it } from 'vitest';
import {
  DICT_LOOKUP_LIMIT,
  DICT_LOOKUP_MAX_LIMIT,
  clampLookupLimit,
  nextLookupLimit,
} from '../dictionaryLookup';

describe('clampLookupLimit', () => {
  it('falls back to the default for anything that is not a usable number', () => {
    expect(clampLookupLimit(undefined)).toBe(DICT_LOOKUP_LIMIT);
    expect(clampLookupLimit(Number.NaN)).toBe(DICT_LOOKUP_LIMIT);
    expect(clampLookupLimit(Number.POSITIVE_INFINITY)).toBe(DICT_LOOKUP_LIMIT);
  });

  it('bounds a hostile or absurd page size', () => {
    // `limit` arrives over IPC. An unbounded one is a synchronous read of a
    // 650k-row database on the main event loop.
    expect(clampLookupLimit(1_000_000)).toBe(DICT_LOOKUP_MAX_LIMIT);
    expect(clampLookupLimit(0)).toBe(1);
    expect(clampLookupLimit(-5)).toBe(1);
  });

  it('keeps a legitimate page size and floors a fractional one', () => {
    expect(clampLookupLimit(40)).toBe(40);
    expect(clampLookupLimit(12.9)).toBe(12);
  });
});

describe('nextLookupLimit', () => {
  it('grows the page multiplicatively so a long tail is a few clicks, not forty', () => {
    expect(nextLookupLimit(DICT_LOOKUP_LIMIT)).toBe(40);
    expect(nextLookupLimit(40)).toBe(200);
  });

  it('lands exactly on the maximum rather than overshooting it', () => {
    // Overshooting would hand main a limit it clamps, so the surface would think
    // it had asked for more than it received.
    expect(nextLookupLimit(DICT_LOOKUP_MAX_LIMIT)).toBe(DICT_LOOKUP_MAX_LIMIT);
    expect(clampLookupLimit(nextLookupLimit(150))).toBe(nextLookupLimit(150));
  });
});

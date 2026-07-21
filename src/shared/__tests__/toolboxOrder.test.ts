import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOLBOX_SETTINGS,
  moveToolInOrder,
  orderToolIds,
  sanitizeToolboxSettings,
} from '../toolboxSettings';

const IDS = ['a', 'b', 'c', 'd'] as const;

describe('orderToolIds', () => {
  it('keeps the given order when there is no preference', () => {
    expect(orderToolIds(IDS, [])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('puts named ids first, in the order named', () => {
    expect(orderToolIds(IDS, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('keeps unnamed ids in their original relative order behind the rest', () => {
    expect(orderToolIds(IDS, ['d'])).toEqual(['d', 'a', 'b', 'c']);
  });

  it('ignores ids that are not present', () => {
    // The whole point of a partial order: a preference naming a tool that was
    // removed, disabled, or hidden must not break the list.
    expect(orderToolIds(IDS, ['zz', 'c'])).toEqual(['c', 'a', 'b', 'd']);
  });

  it('surfaces a tool added to the registry after the preference was saved', () => {
    // The failure mode a full-snapshot design would have: 'e' is new and absent
    // from the saved order, and must still appear.
    const withNew = ['a', 'b', 'c', 'd', 'e'] as const;
    expect(orderToolIds(withNew, ['c', 'a'])).toEqual(['c', 'a', 'b', 'd', 'e']);
  });

  it('ignores duplicates in the preference', () => {
    expect(orderToolIds(IDS, ['b', 'b', 'a'])).toEqual(['b', 'a', 'c', 'd']);
  });

  it('handles an empty id list', () => {
    expect(orderToolIds([], ['a'])).toEqual([]);
  });
});

describe('moveToolInOrder', () => {
  it('moves a tool up', () => {
    expect(moveToolInOrder(IDS, 'c', -1, [])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves a tool down', () => {
    expect(moveToolInOrder(IDS, 'b', 1, [])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('refuses to move past either end rather than wrapping', () => {
    expect(moveToolInOrder(IDS, 'a', -1, [])).toEqual(['a', 'b', 'c', 'd']);
    expect(moveToolInOrder(IDS, 'd', 1, [])).toEqual(['a', 'b', 'c', 'd']);
  });

  it('moves relative to the already-applied order, not the raw list', () => {
    // Displayed order is c,a,b,d — moving 'a' up must swap it with 'c'.
    expect(moveToolInOrder(IDS, 'a', -1, ['c', 'a'])).toEqual(['a', 'c', 'b', 'd']);
  });

  it('returns the current order untouched for an unknown id', () => {
    expect(moveToolInOrder(IDS, 'zz' as 'a', 1, ['b'])).toEqual(['b', 'a', 'c', 'd']);
  });

  it('round-trips through orderToolIds', () => {
    const next = moveToolInOrder(IDS, 'd', -1, []);
    expect(orderToolIds(IDS, next)).toEqual(next);
  });
});

describe('toolOrder setting', () => {
  it('defaults to empty, meaning registry order', () => {
    expect(DEFAULT_TOOLBOX_SETTINGS.toolOrder).toEqual([]);
  });

  it('survives sanitization and drops unknown ids', () => {
    const s = sanitizeToolboxSettings({ ...DEFAULT_TOOLBOX_SETTINGS, toolOrder: ['calculator', 'not-a-tool'] });
    expect(s.toolOrder).toEqual(['calculator']);
  });

  it('drops duplicates', () => {
    const s = sanitizeToolboxSettings({ ...DEFAULT_TOOLBOX_SETTINGS, toolOrder: ['calculator', 'calculator'] });
    expect(s.toolOrder).toEqual(['calculator']);
  });

  it('falls back to empty for a non-array', () => {
    const s = sanitizeToolboxSettings({ ...DEFAULT_TOOLBOX_SETTINGS, toolOrder: 'calculator' });
    expect(s.toolOrder).toEqual([]);
  });
});

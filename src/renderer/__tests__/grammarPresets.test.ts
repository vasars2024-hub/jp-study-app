import { describe, expect, it } from 'vitest';
import {
  MAX_PRESETS,
  addPreset,
  parsePresets,
  removePreset,
  type FilterPreset,
} from '../grammarPresets';
import {
  DEFAULT_PRACTICE_FILTERS,
  type PracticeFilters,
} from '../data/grammar/practiceFilters';

const filters = (over: Partial<PracticeFilters> = {}): PracticeFilters => ({
  ...DEFAULT_PRACTICE_FILTERS,
  ...over,
});

describe('addPreset', () => {
  it('stores a snapshot, not a live reference', () => {
    const f = filters({ levels: ['N3'] });
    const [saved] = addPreset([], 'N3 only', f, 1);
    f.levels.push('N2');
    expect(saved.filters.levels).toEqual(['N3']);
  });

  it('overwrites by name rather than accumulating duplicates', () => {
    let list = addPreset([], 'Reading', filters({ levels: ['N3'] }), 1);
    list = addPreset(list, 'reading', filters({ levels: ['N1'] }), 2);
    expect(list).toHaveLength(1);
    expect(list[0].filters.levels).toEqual(['N1']);
    expect(list[0].name).toBe('reading');
  });

  it('ignores a blank name', () => {
    expect(addPreset([], '   ', filters(), 1)).toEqual([]);
  });

  it('caps the list', () => {
    let list: FilterPreset[] = [];
    for (let i = 0; i < MAX_PRESETS + 5; i++) {
      list = addPreset(list, `preset ${i}`, filters(), i + 1);
    }
    expect(list).toHaveLength(MAX_PRESETS);
    // The oldest are dropped, not the newest.
    expect(list[list.length - 1].name).toBe(`preset ${MAX_PRESETS + 4}`);
  });
});

describe('removePreset', () => {
  it('removes only the named id', () => {
    const list = addPreset(addPreset([], 'a', filters(), 1), 'b', filters(), 2);
    const out = removePreset(list, list[0].id);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('b');
  });
});

describe('parsePresets', () => {
  it('does not share arrays with DEFAULT_PRACTICE_FILTERS', () => {
    // A shallow merge would hand the preset the module-level default arrays,
    // putting shared state one in-place edit from corruption.
    const [p] = parsePresets(JSON.stringify([{ id: 'p', name: 'n', filters: {} }]));
    expect(p.filters.levels).not.toBe(DEFAULT_PRACTICE_FILTERS.levels);
    expect(p.filters.categories).not.toBe(DEFAULT_PRACTICE_FILTERS.categories);
  });

  it('fills fields added since a preset was saved', () => {
    // An old preset that predates `excludeCategories` must still apply cleanly
    // rather than handing undefined to code that expects an array.
    const raw = JSON.stringify([
      { id: 'p1', name: 'old', filters: { levels: ['N3'] }, createdAt: 5 },
    ]);
    const [p] = parsePresets(raw);
    expect(p.filters.levels).toEqual(['N3']);
    expect(p.filters.excludeCategories).toEqual([]);
    expect(p.filters.sort).toBe(DEFAULT_PRACTICE_FILTERS.sort);
  });

  it('drops malformed entries without losing good ones', () => {
    const raw = JSON.stringify([
      { id: 'ok', name: 'keep', filters: {}, createdAt: 1 },
      { id: '', name: 'no id', filters: {} },
      { id: 'x', name: '   ', filters: {} },
      { id: 'y', name: 'no filters' },
      'nonsense',
    ]);
    expect(parsePresets(raw).map((p) => p.name)).toEqual(['keep']);
  });

  it('survives absent and malformed storage', () => {
    expect(parsePresets(null)).toEqual([]);
    expect(parsePresets('{{{')).toEqual([]);
    expect(parsePresets('{"not":"an array"}')).toEqual([]);
  });
});

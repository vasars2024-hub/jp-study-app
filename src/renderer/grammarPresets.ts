/**
 * Saved filter presets for the grammar Explorer.
 *
 * The filter model is wide — language, levels, categories, exclusions,
 * registers, two trust gates and a sort — which is what makes it useful and
 * also what makes it tedious to re-enter. A preset is just a named snapshot of
 * `PracticeFilters`.
 *
 * Presets store the filter *values*, not a query. If the taxonomy later drops a
 * category id, the preset keeps naming it and simply matches nothing, rather
 * than failing to load — `coerce` in practiceFilters.ts already tolerates
 * unknown ids, and a preset that silently disappeared would be worse than one
 * that returns an empty list you can see and fix.
 */

import {
  DEFAULT_PRACTICE_FILTERS,
  type PracticeFilters,
} from './data/grammar/practiceFilters';

/**
 * Detach a preset from the live filter state.
 *
 * A spread alone is shallow, so `levels`, `categories`, `excludeCategories` and
 * `registers` would stay shared by reference with whatever object was passed
 * in — a "snapshot" that follows later edits is not a snapshot.
 */
export function snapshotFilters(f: PracticeFilters): PracticeFilters {
  return {
    ...f,
    levels: [...f.levels],
    categories: [...f.categories],
    excludeCategories: [...f.excludeCategories],
    registers: [...f.registers],
    familiarity: [...f.familiarity],
    lists: [...(f.lists ?? [])],
  };
}

/**
 * Do two filter sets describe the same query?
 *
 * Structural, because `setFilters` always produces a fresh object — an
 * identity check would report "different" on the very render that applied a
 * preset. Array fields compare element-wise in order: the Explorer builds them
 * from a fixed taxonomy order, so two equal selections are always equal
 * sequences, and treating them as sets would need a sort on every keystroke.
 *
 * Used to decide whether the preset dropdown may still name a preset (T4).
 */
export function sameFilters(a: PracticeFilters, b: PracticeFilters): boolean {
  const keys = Object.keys(DEFAULT_PRACTICE_FILTERS) as (keyof PracticeFilters)[];
  return keys.every((key) => {
    const left = a[key];
    const right = b[key];
    if (Array.isArray(left) && Array.isArray(right)) {
      return left.length === right.length && left.every((item, i) => item === right[i]);
    }
    return left === right;
  });
}

export interface FilterPreset {
  id: string;
  name: string;
  filters: PracticeFilters;
  createdAt: number;
}

export const PRESETS_KEY = 'jp-grammarx-explorer-presets-v1';
export const MAX_PRESETS = 30;
export const MAX_NAME_LENGTH = 60;

export function parsePresets(raw: string | null): FilterPreset[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: FilterPreset[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const p = item as Partial<FilterPreset>;
      if (typeof p.id !== 'string' || !p.id) continue;
      if (typeof p.name !== 'string' || !p.name.trim()) continue;
      if (!p.filters || typeof p.filters !== 'object') continue;
      out.push({
        id: p.id,
        name: p.name.slice(0, MAX_NAME_LENGTH),
        // Merge over defaults so a preset saved by an older build, missing a
        // field added since, still applies cleanly instead of yielding
        // undefined where the filter code expects an array. Snapshotted because
        // a plain spread would leave the preset sharing DEFAULT_PRACTICE_FILTERS'
        // own arrays — module-level state one in-place edit from corruption.
        filters: snapshotFilters({ ...DEFAULT_PRACTICE_FILTERS, ...p.filters } as PracticeFilters),
        createdAt: Number(p.createdAt) || 0,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export function loadPresets(): FilterPreset[] {
  try {
    return parsePresets(localStorage.getItem(PRESETS_KEY));
  } catch {
    return [];
  }
}

export function savePresets(presets: readonly FilterPreset[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

/**
 * Add or overwrite by name.
 *
 * Saving twice under one name replaces rather than accumulating: a list of
 * three identically-named presets is not something anyone chose to have.
 */
export function addPreset(
  presets: readonly FilterPreset[],
  name: string,
  filters: PracticeFilters,
  now: number = Date.now(),
): FilterPreset[] {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  if (!trimmed) return [...presets];
  const existing = presets.find((p) => p.name.toLowerCase() === trimmed.toLowerCase());
  const entry: FilterPreset = {
    id: existing?.id ?? `preset-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: trimmed,
    filters: snapshotFilters(filters),
    createdAt: now,
  };
  const rest = presets.filter((p) => p.id !== entry.id);
  return [...rest, entry].slice(-MAX_PRESETS);
}

export function removePreset(presets: readonly FilterPreset[], id: string): FilterPreset[] {
  return presets.filter((p) => p.id !== id);
}

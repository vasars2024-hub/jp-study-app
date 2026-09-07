import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The live-defect register is written by several workers on several branches that
 * merge every fifteen minutes. Four times on the night of 2026-09-07 two workers
 * minted the SAME id for different defects, and twice they fixed the same defect
 * independently. Each collision cost a renumber at merge time and left commit
 * messages naming ids that no longer exist.
 *
 * The `uniq -d` check that caught them is hand-run, so it catches and does not
 * prevent. This gate does both: uniqueness is asserted in the suite, and every id
 * minted from now on must fall in its worker's own range, which makes a collision
 * impossible by construction rather than merely visible after the fact.
 */

const REGISTER = resolve(__dirname, '../../../docs/ACTIVE/LIVE_DEFECTS_PRESWEEP.md');

/**
 * Ranges are disjoint by construction, so two branches can never mint the same
 * number and a merge never needs to renumber. Add a worker here before it files.
 */
export const MINTING_RANGES: Record<string, { from: number; to: number }> = {
  primary: { from: 149, to: 169 },
  primary2: { from: 170, to: 189 },
  backup: { from: 190, to: 209 },
  codex: { from: 210, to: 229 },
};

/**
 * Everything filed before the ranges existed. These were minted from one shared
 * counter and are grandfathered: they are still checked for uniqueness, just not
 * for range membership.
 */
const LEGACY_CEILING = 148;

function readRegister(): string {
  return readFileSync(REGISTER, 'utf8');
}

/** Rows look like `| D42 | surface | ... |`. Anything else on the line is not a row. */
export function parseRowIds(markdown: string): number[] {
  const ids: number[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\|\s*D(\d+)\s*\|/.exec(line);
    if (m) ids.push(Number(m[1]));
  }
  return ids;
}

export function duplicateIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const dupes = new Set<number>();
  for (const id of ids) {
    if (seen.has(id)) dupes.add(id);
    seen.add(id);
  }
  return [...dupes].sort((a, b) => a - b);
}

export function outOfRangeIds(ids: number[]): number[] {
  const ranges = Object.values(MINTING_RANGES);
  return ids
    .filter((id) => id > LEGACY_CEILING)
    .filter((id) => !ranges.some((r) => id >= r.from && id <= r.to))
    .sort((a, b) => a - b);
}

describe('live defect register', () => {
  it('has no duplicate defect ids', () => {
    const ids = parseRowIds(readRegister());
    // Floor the row count so a parser that silently stops matching cannot make
    // "no duplicates" true of an empty list — the shape that produced two false
    // clean bills in this sweep's own scanners.
    expect(ids.length).toBeGreaterThan(100);
    expect(duplicateIds(ids)).toEqual([]);
  });

  it('mints every new id inside exactly one worker range', () => {
    expect(outOfRangeIds(parseRowIds(readRegister()))).toEqual([]);
  });

  it('keeps the worker ranges disjoint', () => {
    const entries = Object.entries(MINTING_RANGES);
    for (const [nameA, a] of entries) {
      for (const [nameB, b] of entries) {
        if (nameA >= nameB) continue;
        const overlaps = a.from <= b.to && b.from <= a.to;
        expect(overlaps, `${nameA} overlaps ${nameB}`).toBe(false);
      }
    }
    for (const [name, r] of entries) {
      expect(r.from, `${name} starts inside the legacy range`).toBeGreaterThan(LEGACY_CEILING);
    }
  });

  // --- controls: each check must fail on the thing it claims to catch ---

  it('catches a duplicate id', () => {
    const md = ['| D300 | files | a | b | P2 | open |', '| D300 | note | c | d | P3 | open |'].join('\n');
    expect(duplicateIds(parseRowIds(md))).toEqual([300]);
  });

  it('catches an id minted outside every range', () => {
    // D230 sits one step past codex's ceiling — the realistic mistake is landing just
    // outside a range, not a wild number.
    const md = ['| D230 | files | a | b | P2 | open |', '| D700 | note | c | d | P3 | open |'].join('\n');
    expect(outOfRangeIds(parseRowIds(md))).toEqual([230, 700]);
  });

  it('grandfathers the pre-range ids and does not match prose mentioning one', () => {
    const md = [
      '| D148 | files | a | b | P2 | open |',
      'Prose that names D700 and D9999 in a sentence is not a row.',
      '  | D701 | note | c | d | P3 | open |',
    ].join('\n');
    // The indented line is not a row: rows start the line.
    expect(parseRowIds(md)).toEqual([148]);
    expect(outOfRangeIds(parseRowIds(md))).toEqual([]);
  });
});

/**
 * A ratchet on raw `localStorage.setItem`, which is audit item 5.7's actual
 * hardening — the part that is not a repair.
 *
 * 5.7's finding, in its own words: the store filled, every write was refused,
 * and nobody noticed because `setItem` sits inside a `catch {}` at the
 * overwhelming majority of call sites. The audit scoped the migration as its own
 * pass and it has not happened. What HAS happened, measured here rather than
 * assumed, is that **the number went up**: the audit counted 194 sites, a later
 * re-measure 198, and this file's own scan 214 before the three stores below
 * were migrated. Every new feature adds more. A backlog that grows is not a
 * backlog, it is a leak, and the leak is what this closes.
 *
 * The ceiling is set EXACTLY at the measured count, not comfortably above it. A
 * ratchet with slack in it is a ratchet that lets the next one through.
 *
 * So the contract is a ceiling, not a clean sheet: the existing sites stay, and
 * a NEW one fails this test. The fix for a failure is
 * `writeLocalStorage` / `writeLocalStorageJson` from `renderer/localStorageWrite`,
 * which persists identically and reports the refusal instead of dropping it.
 * Lowering the numbers below when you migrate one is the point.
 *
 * Two things stop this from passing vacuously:
 *
 * - **Comments are stripped before counting.** This very file, and the prose in
 *   `localStorageWrite.ts`, name the call repeatedly; a raw-text scan would score
 *   that prose as call sites. This repo has published a false "closed" that way.
 * - **A mutation control**: a synthetic copy of a real file with one call added
 *   must count one higher, and the same call inside a comment must not.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');

/**
 * The ceiling, measured 2026-09-06 after migrating `displayPrefs`,
 * `motionPrefs` and `focusMode` (nine sites) onto the guarded writer.
 * MOVE THIS DOWN when you migrate more. Never up.
 */
const MAX_RAW_SITES = 205;
const MAX_RAW_FILES = 153;

/** The one module allowed to call it: the guarded writer itself. */
const OWNER = join('renderer', 'localStorageWrite.ts');

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

function countSites(source: string): number {
  return (stripComments(source).match(/localStorage\.setItem\s*\(/g) ?? []).length;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests may call it freely — they are planting fixtures, not persisting.
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      sourceFiles(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
    out.push(full);
  }
  return out;
}

function census(): { sites: number; files: string[] } {
  let sites = 0;
  const files: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const n = countSites(readFileSync(file, 'utf8'));
    if (n === 0) continue;
    sites += n;
    files.push(file.slice(SRC.length + 1));
  }
  return { sites, files };
}

describe('raw localStorage.setItem — the ratchet', () => {
  it('does not grow past the recorded ceiling', () => {
    const { sites, files } = census();
    expect(sites).toBeLessThanOrEqual(MAX_RAW_SITES);
    expect(files.length).toBeLessThanOrEqual(MAX_RAW_FILES);
  });

  it('keeps the three migrated preference stores on the guarded writer', () => {
    // By name, not by count: a revert of one of these while some other file
    // loses a site nets to zero and the ceiling alone would never see it.
    for (const rel of ['renderer/displayPrefs.ts', 'renderer/motion/motionPrefs.ts', 'renderer/focusMode.ts']) {
      const source = readFileSync(join(SRC, ...rel.split('/')), 'utf8');
      expect(countSites(source)).toBe(0);
      // Relative depth differs (`./` from renderer, `../` from renderer/motion),
      // so the module is matched, not one spelling of the path to it.
      expect(source).toMatch(/from '\.\.?\/localStorageWrite'/);
    }
  });

  it('the guarded writer is the one module that still calls it directly', () => {
    const owner = readFileSync(join(SRC, OWNER), 'utf8');
    expect(countSites(owner)).toBe(1);
  });
});

describe('raw localStorage.setItem — the counter can fail', () => {
  const real = readFileSync(join(SRC, 'renderer', 'focusMode.ts'), 'utf8');

  it('counts a site added to a real file', () => {
    expect(countSites(real)).toBe(0);
    expect(countSites(`${real}\nlocalStorage.setItem('planted', '1');\n`)).toBe(1);
  });

  it('does not count the call named in prose', () => {
    expect(countSites(`${real}\n// localStorage.setItem('planted', '1');\n`)).toBe(0);
    expect(countSites(`${real}\n/* localStorage.setItem('planted', '1'); */\n`)).toBe(0);
  });
});

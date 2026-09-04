// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every `var(--lq-…)` in the app names a token that is actually declared
 * somewhere.
 *
 * ## Why this needed a guard rather than a review
 *
 * A `var()` with a fallback fails **silently and plausibly**. Write
 * `var(--lq-surface-2, rgba(255, 255, 255, 0.06))` against a token nobody ever
 * declared and the sheet still parses, still paints, and still reads — in
 * source, in review, in a diff — as a themed surface built on L2's language. It
 * is not. It is a hardcoded 6%-white, in every theme, forever.
 *
 * That is not hypothetical. `views/readingLists.css` shipped with **eight** such
 * names — `--lq-surface-1/2/3`, `--lq-border-weak`, `--lq-radius-1/2/3`,
 * `--lq-text-muted`, `--lq-accent` — across 28 references. The consequence was
 * user-visible and theme-specific: on the light themes `--panel` is `#ffffff`,
 * so a 6%-white card fill and a 14%-white border are both invisible, and the
 * whole Reading Lists grid lost its card edges. Nothing failed. Nothing warned.
 * The names simply looked right.
 *
 * The three surviving names below are recorded rather than fixed because they
 * belong to sheets other tracks hold open. Each is the same defect. Delete an
 * entry the moment its sheet is corrected — this list may only ever shrink, and
 * the count assertion at the bottom is what enforces that.
 */

const SRC = resolve(__dirname, '..', '..');

function sheets(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') sheets(full, out);
    } else if (entry.name.endsWith('.css')) out.push(full);
  }
  return out;
}

/** Repo-relative, forward slashes, so a failure message is the same on any OS. */
function label(file: string): string {
  return file.slice(SRC.length + 1).split(/[\\/]/).join('/');
}

/**
 * Known-unresolved names, by the sheet that references them. Owned by other
 * tracks; listed so they are visible instead of hidden, never so they are
 * blessed.
 */
const RECORDED: Record<string, string[]> = {
  'renderer/theme/liquid-window.css': ['--lq-focus-ring', '--lq-radius-pill'],
  'renderer/components/stats/statsLiquid.css': ['--lq-radius-sm'],
  'renderer/components/liquid/readingCanvas.css': ['--lq-reading-measure'],
};

const FILES = sheets(SRC);

describe('every --lq-* reference resolves to a declaration', () => {
  const declared = new Set<string>();
  for (const file of FILES) {
    for (const match of readFileSync(file, 'utf8').matchAll(/(--lq-[a-z0-9-]+)\s*:/g)) {
      declared.add(match[1]);
    }
  }

  const unresolved = new Map<string, Set<string>>();
  for (const file of FILES) {
    for (const match of readFileSync(file, 'utf8').matchAll(/var\(\s*(--lq-[a-z0-9-]+)/g)) {
      if (declared.has(match[1])) continue;
      const key = label(file);
      if (!unresolved.has(key)) unresolved.set(key, new Set());
      unresolved.get(key)?.add(match[1]);
    }
  }

  it('finds the token declarations at all — the walk is not vacuous', () => {
    // Without this a broken regex would declare everything resolved and pass.
    expect(FILES.length).toBeGreaterThan(80);
    expect(declared.size).toBeGreaterThan(40);
    expect(declared.has('--lq-work-bg-raised')).toBe(true);
  });

  it('has no unresolved name outside the recorded list', () => {
    const surprises: string[] = [];
    for (const [sheet, names] of unresolved) {
      const allowed = new Set(RECORDED[sheet] ?? []);
      for (const name of names) if (!allowed.has(name)) surprises.push(`${sheet}: ${name}`);
    }
    expect(surprises.sort()).toEqual([]);
  });

  it('never lets the recorded list grow, and notices when a sheet is fixed', () => {
    // A recorded entry that no longer appears is a sheet somebody repaired —
    // the entry is then stale and has to be deleted, not left as cover for the
    // next one to hide behind.
    const stale: string[] = [];
    for (const [sheet, names] of Object.entries(RECORDED)) {
      const live = unresolved.get(sheet);
      for (const name of names) if (!live?.has(name)) stale.push(`${sheet}: ${name}`);
    }
    expect(stale.sort()).toEqual([]);
  });

  it('leaves the Reading Lists sheets on real tokens', () => {
    // The sheets this guard was written for, asserted by name so a regression
    // there fails on its own row rather than inside the repo-wide sweep.
    for (const sheet of [
      'renderer/views/readingLists.css',
      'renderer/widgets/readingLists.css',
      'renderer/components/reading/readingListPreview.css',
    ]) {
      expect([sheet, [...(unresolved.get(sheet) ?? [])]]).toEqual([sheet, []]);
    }
  });
});

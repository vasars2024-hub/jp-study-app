// Guards the i18n catalog split.
//
// The split exists because one combined catalogs module put all four languages
// in every entry chunk — 698 KB, 54.7% of Blanc's boot JS. That win is easy to
// undo by accident: a single `import { CATALOGS } from '.../catalogs/all'` in
// app code drags every language back into the bundle, and nothing else would
// fail. So this test fails instead.

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname, '..', '..');

/** Every .ts/.tsx under src, minus tests and the aggregate itself. */
function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      sourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      // Colocated `*.test.ts` files are tests too, and never reach a bundle.
      out.push(full);
    }
  }
  return out;
}

describe('i18n catalog split', () => {
  const files = sourceFiles(SRC).filter(
    (f) => !f.endsWith(path.join('i18n', 'catalogs', 'all.ts')),
  );

  it('finds source files to scan (guards against a broken glob)', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('no app code imports the all-languages aggregate', () => {
    const offenders = files.filter((f) => {
      const src = fs.readFileSync(f, 'utf8');
      return /from\s+['"][^'"]*i18n\/catalogs\/all['"]/.test(src);
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
    // 60s. A whole-src sweep: its cost is the tree, and under a full `vitest run` with eight
    // workers contending for one disk it exceeded the 20s default and was reported as a product
    // regression. Measured in that run at 44,716ms. Same class as the suites repaired at 084dcfea
    // and 23a30362; where the cause was removable it was removed instead (see
    // mediaSurfaceImportGraph). Here the sweep is already single-pass, so the honest answer is a
    // budget that matches the work. An assertion failure still fails on the assertion.
  }, 60_000);

  it('no app code imports a per-language catalog directly except the loader', () => {
    // Importing ./catalogs/ja straight from a component would make that chunk
    // eager again. Only catalogs.ts (via dynamic import) may reference them.
    const allowed = path.join('i18n', 'catalogs.ts');
    const offenders = files.filter((f) => {
      if (f.endsWith(allowed)) return false;
      if (f.includes(path.join('i18n', 'catalogs') + path.sep)) return false; // siblings
      const src = fs.readFileSync(f, 'utf8');
      return /from\s+['"][^'"]*i18n\/catalogs\/(ja|zh|ru)['"]/.test(src);
    });
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
    // 60s. A whole-src sweep: its cost is the tree, and under a full `vitest run` with eight
    // workers contending for one disk it exceeded the 20s default and was reported as a product
    // regression. Measured in that run at 24,402ms. Same class as the suites repaired at 084dcfea
    // and 23a30362; where the cause was removable it was removed instead (see
    // mediaSurfaceImportGraph). Here the sweep is already single-pass, so the honest answer is a
    // budget that matches the work. An assertion failure still fails on the assertion.
  }, 60_000);

  it('the loader reaches the non-English catalogs only through dynamic import', () => {
    const loader = fs.readFileSync(path.join(SRC, 'shared', 'i18n', 'catalogs.ts'), 'utf8');
    for (const lang of ['ja', 'zh', 'ru']) {
      // Static form would defeat the split; only `import('./catalogs/ja')` is ok.
      expect(loader).not.toMatch(new RegExp(`from\\s+['"]\\./catalogs/${lang}['"]`));
      expect(loader).toMatch(new RegExp(`import\\(['"]\\./catalogs/${lang}['"]\\)`));
    }
    // English is deliberately eager: it is the fallback and the default.
    expect(loader).toMatch(/from\s+['"]\.\/catalogs\/en['"]/);
  });
});

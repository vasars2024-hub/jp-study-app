#!/usr/bin/env node
/**
 * IMPORT / EXPORT CHECK — does every relative named import actually exist?
 *
 * Written 2026-09-05 after `feat/nyaa-subtitles` spent an unknown number of days unable
 * to BOOT. `GrammarExplorer.tsx` imported `{ onCurationChanged, sameFilters }` and
 * `GrammarPracticePanel.tsx` imported `{ onCurationChanged }`; neither producer was
 * committed. Opening the Grammar surface threw
 *
 *     SyntaxError: The requested module '/src/renderer/grammarCuration.ts'
 *                  does not provide an export named 'onCurationChanged'
 *
 * which `AppErrorBoundary` turned into a blank "Something went wrong." for the entire
 * application — and because the desktop layout persists its open windows, every later
 * boot re-mounted Grammar and crashed again. A reload does not clear it.
 *
 * WHY NOTHING ELSE CAUGHT IT, which is the whole reason this file exists:
 *
 *  - `tsc --noEmit` is not a gate in this repo (hundreds of pre-existing errors).
 *  - `vitest` never imported the two components, so 14,000 green tests said nothing.
 *  - `architecture-audit.cjs` exits 0: it reasons about module BOUNDARIES, not symbols.
 *  - And the decisive one: THE SHARED WORKING TREE BOOTS FINE. The missing exports existed
 *    there as another track's uncommitted hunks, so every live check any worker ran was
 *    against code that is not on the branch. Only a clean checkout is broken. That is the
 *    same shape as the boss audit's "a green gate run in the shared tree is not evidence
 *    about the commit you just made", one layer lower down.
 *
 * WHAT IT REPORTS. A named import from a RELATIVE specifier whose target file does not
 * export that name. Two severities, and only one of them fails the gate:
 *
 *   VALUE — `import { x }` where x is a runtime binding. This is the crash above.
 *   type  — `import type { x }` or `import { type x }`. esbuild strips these, so they
 *           cannot break at runtime; reported for tidiness, never a failure.
 *
 * DELIBERATELY CONSERVATIVE, because a checker that cries wolf gets ignored and this one
 * has to survive. The export scanner is regex-based and misses real forms — a declaration
 * nested inside `declare global` is the one that bit the first draft, which reported 170
 * false positives including `MediaItem` (declared at `shared/types.ts` with two leading
 * spaces). So a name is only reported when it appears NOWHERE IN THE TARGET FILE AT ALL.
 * That trades recall for a zero false-positive rate: it will not catch a symbol that is
 * defined but not exported, and it will catch every symbol that was never written.
 *
 * Bare-specifier imports (`react`, `node:fs`) are out of scope — the bundler resolves
 * those and a missing one is a hard build error, not a silent boot crash.
 *
 * Run:
 *   node tools/import-export-check.cjs [src]
 * Exit 0 when there are no VALUE findings, 1 otherwise.
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.argv[2] || 'src';
const SKIP_DIR = /node_modules|__snapshots__|[\\/]\.coordination/;

const files = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIR.test(p)) continue;
      walk(p);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(p);
    }
  }
})(ROOT);

const EXPORT_DECL = /^\s*export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:const|let|var|function|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
const EXPORT_LIST = /^\s*export\s+(?:type\s+)?\{([^}]*)\}/gm;
const EXPORT_STAR = /^\s*export\s+\*\s+from\s+['"](\.[^'"]+)['"]/gm;
const IMPORT_NAMED = /import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"](\.[^'"]+)['"]/g;

/** Same order the bundler resolves in; a directory falls back to its index. */
function resolveModule(from, spec) {
  const base = path.resolve(path.dirname(from), spec);
  const candidates = [
    `${base}.ts`, `${base}.tsx`, `${base}.d.ts`,
    path.join(base, 'index.ts'), path.join(base, 'index.tsx'),
  ];
  return candidates.find((c) => fs.existsSync(c)) || null;
}

const exportCache = new Map();
function exportsOf(file, seen = new Set()) {
  if (exportCache.has(file)) return exportCache.get(file);
  // A re-export cycle is legal TypeScript; treat the second visit as contributing nothing
  // rather than recursing forever.
  if (seen.has(file)) return new Set();
  seen.add(file);
  let src;
  try {
    src = fs.readFileSync(file, 'utf8');
  } catch {
    return new Set();
  }
  const names = new Set();
  for (const m of src.matchAll(EXPORT_DECL)) names.add(m[1]);
  for (const m of src.matchAll(EXPORT_LIST)) {
    for (const part of m[1].split(',')) {
      const t = part.trim().replace(/^type\s+/, '');
      if (!t) continue;
      const as = t.split(/\s+as\s+/);
      names.add((as[1] || as[0]).trim());
    }
  }
  if (/^\s*export\s+default/m.test(src)) names.add('default');
  for (const m of src.matchAll(EXPORT_STAR)) {
    const target = resolveModule(file, m[1]);
    if (target) for (const n of exportsOf(target, seen)) names.add(n);
  }
  exportCache.set(file, names);
  return names;
}

const findings = [];
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  for (const m of src.matchAll(IMPORT_NAMED)) {
    const statementIsTypeOnly = /^import\s+type/.test(m[0]);
    const target = resolveModule(file, m[2]);
    if (!target) continue;
    const exported = exportsOf(target);
    const targetSrc = fs.readFileSync(target, 'utf8');
    for (const part of m[1].split(',')) {
      let spec = part.trim();
      if (!spec) continue;
      const specifierIsTypeOnly = /^type\s/.test(spec);
      spec = spec.replace(/^type\s+/, '');
      const name = spec.split(/\s+as\s+/)[0].trim();
      if (!name || !/^[A-Za-z_$][\w$]*$/.test(name)) continue;
      if (exported.has(name)) continue;
      // The conservative gate described in the header: present anywhere = not our business.
      if (targetSrc.includes(name)) continue;
      findings.push({
        file: path.relative('.', file),
        name,
        from: m[2],
        target: path.relative('.', target),
        typeOnly: statementIsTypeOnly || specifierIsTypeOnly,
      });
    }
  }
}

const breaking = findings.filter((f) => !f.typeOnly);
for (const f of findings) {
  console.log(`${f.typeOnly ? 'type ' : 'VALUE'}  ${f.file}\n        imports { ${f.name} } from '${f.from}'  ->  ${f.target}  (no such export)`);
}
console.log(
  `\n${files.length} files scanned · ${findings.length} absent named import(s) · ${breaking.length} runtime-breaking`,
);
if (breaking.length) {
  console.log(
    'A VALUE import of a name the target does not export throws at module link time and\n'
    + 'AppErrorBoundary blanks the whole renderer. Add the export, or drop the import.',
  );
}
process.exit(breaking.length ? 1 : 0);

#!/usr/bin/env node
/**
 * Pre-sweep cross-cutting pass — "dead exports".
 *
 * Class 6b asks whether anything CALLS a preload route. This asks the same question
 * about every other kind of module boundary: a symbol a file `export`s that no other
 * file ever imports. The interesting half is not tidiness — it is the shape D113 took:
 * `MediaHubDashboard` is ~190 lines of built, state-writing UI that is exported and
 * rendered by nothing, so it passes every test, compiles, and is unreachable from the
 * product. A dead COMPONENT export is a feature the user cannot get to.
 *
 * Ranking, highest signal first, because "some exports are unused" is not a finding:
 *
 *   COMPONENT  a dead export whose name is PascalCase and whose file is .tsx — the
 *              D113 shape. Read it: it is either an unreachable surface or a deletion.
 *   VALUE      a dead const / function / class / enum. Dead code, occasionally a
 *              feature that lost its caller (the `immersionGetSession` shape).
 *   TYPE       a dead interface / type / type-only export. Counted, not listed —
 *              a dead type cannot be a defect the user sees.
 *
 * Verdicts, same vocabulary as the class 6b scanner:
 *
 *   LIVE        the identifier appears in >= 1 other product file
 *   TEST-ONLY   named only from __tests__ / __devharness__ / tools. A module the
 *               product never imports is still dead, however green its test is.
 *   DEAD        named in no other file at all
 *   AMBIGUOUS   the same name is exported from more than one file, so a word search
 *               cannot attribute the hit. Reported, never counted as dead.
 *
 * Method, and its stated limits — a DEAD verdict here is a LEAD, not a verdict:
 *   - Identifiers are matched as whole words over string/comment-masked source, in
 *     every file except the declaring one. That OVER-counts (a same-named local
 *     variable elsewhere reads as a hit), so LIVE can be wrong and DEAD cannot —
 *     which is the direction that matters for a sweep.
 *   - `export default` is imported under an arbitrary name, so a name search is
 *     useless. Those are resolved by MODULE SPECIFIER instead: any import whose path
 *     ends in the file's basename counts. A default export re-exported through a
 *     barrel therefore reads LIVE via the barrel — open the barrel to be sure.
 *   - `export * from` re-export barrels are detected and their targets are marked
 *     LIVE by construction, since the barrel names nothing.
 *
 * Usage:
 *   node src/.coordination/presweep/dead-export-scan.cjs            # everything not LIVE
 *   node src/.coordination/presweep/dead-export-scan.cjs --all
 *   node src/.coordination/presweep/dead-export-scan.cjs --kind COMPONENT
 *   node src/.coordination/presweep/dead-export-scan.cjs --name Foo # one name, verbose
 *   node src/.coordination/presweep/dead-export-scan.cjs --json
 *
 * Exit code is 0 always: this is an inventory, not a gate. The register is the gate.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');
const REPO = path.resolve(SRC, '..');

/** Roots that ship. `tools/` and `debug/` are scanned only as CALLERS, never as subjects. */
const PRODUCT_ROOTS = ['main', 'renderer', 'media', 'shared'];
/** Extra roots searched for call sites only. */
const CALLER_ONLY_ROOTS = [path.join(REPO, 'tools'), path.join(REPO, 'debug')];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'assets', 'vendor']);
const NON_PRODUCT_RE = /(^|[\\/])(__tests__|__mocks__|__devharness__|\.coordination)([\\/]|$)/;
const TEST_FILE_RE = /\.(test|spec)\.[tj]sx?$/;

// ---------------------------------------------------------------- file index

function indexSources(dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.') && ent.name !== '.coordination') continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      indexSources(full, out);
    } else if (/\.(ts|tsx|cts|mts|js|jsx|cjs|mjs)$/.test(ent.name)) {
      out.set(full, fs.readFileSync(full, 'utf8'));
    }
  }
  return out;
}

/** Replace string and comment bodies with spaces so a name inside them is not a hit. */
function maskStringsAndComments(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const two = text.slice(i, i + 2);
    if (two === '//') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === '`') {
      // A template literal's `${...}` holds REAL CODE. Masking it wholesale is what
      // made this scan report `DIFFICULTY_CLASS` dead when NovelsContent.tsx:1011
      // uses it inside a className interpolation — the only place it appears.
      out += ' ';
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') {
          out += text.slice(j, j + 2).replace(/[^\n]/g, ' ');
          j += 2;
          continue;
        }
        if (text[j] === '`') {
          out += ' ';
          j += 1;
          break;
        }
        if (text[j] === '$' && text[j + 1] === '{') {
          // Copy the interpolation verbatim, tracking brace depth. Quoted spans are
          // skipped so a `}` inside a string cannot end it early; copying their text
          // verbatim only ever OVER-counts a name, which is the safe direction here.
          let depth = 1;
          let k = j + 2;
          while (k < n && depth > 0) {
            const ch = text[k];
            if (ch === '\\') {
              k += 2;
              continue;
            }
            if (ch === '"' || ch === "'" || ch === '`') {
              let m2 = k + 1;
              while (m2 < n) {
                if (text[m2] === '\\') {
                  m2 += 2;
                  continue;
                }
                if (text[m2] === ch) break;
                m2 += 1;
              }
              k = Math.min(m2 + 1, n);
              continue;
            }
            if (ch === '{') depth += 1;
            else if (ch === '}') depth -= 1;
            k += 1;
          }
          out += text.slice(j, Math.min(k, n));
          j = Math.min(k, n);
          continue;
        }
        out += text[j] === '\n' ? '\n' : ' ';
        j += 1;
      }
      i = j;
    } else if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        if (text[j] === quote) break;
        j += 1;
      }
      const stop = Math.min(j + 1, n);
      out += text.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text[i] === '\n') line += 1;
  return line;
}

// ---------------------------------------------------------------- exports

const DECL_RE =
  /^[ \t]*export[ \t]+(?:declare[ \t]+)?(?:async[ \t]+)?(const|let|var|function|class|interface|type|enum)[ \t]+([A-Za-z_$][\w$]*)/gm;
const LIST_RE = /^[ \t]*export[ \t]*\{([^}]*)\}[ \t]*(?:from[ \t]*['"][^'"]+['"])?/gm;
const DEFAULT_RE = /^[ \t]*export[ \t]+default\b/m;
const STAR_RE = /^[ \t]*export[ \t]*\*[ \t]*(?:as[ \t]+[\w$]+[ \t]*)?from[ \t]*['"]([^'"]+)['"]/gm;

const TYPE_KINDS = new Set(['interface', 'type']);

function collectExports(file, masked) {
  const rows = [];
  let m;
  DECL_RE.lastIndex = 0;
  while ((m = DECL_RE.exec(masked))) {
    rows.push({ file, name: m[2], kind: m[1], line: lineOf(masked, m.index), reexport: false });
  }
  LIST_RE.lastIndex = 0;
  while ((m = LIST_RE.exec(masked))) {
    const isReexport = /from/.test(m[0]);
    for (let part of m[1].split(',')) {
      part = part.trim();
      if (!part) continue;
      const typeOnly = /^type\s+/.test(part);
      part = part.replace(/^type\s+/, '');
      const as = part.split(/\s+as\s+/);
      const exported = (as[1] || as[0]).trim();
      if (!/^[A-Za-z_$][\w$]*$/.test(exported) || exported === 'default') continue;
      rows.push({
        file,
        name: exported,
        kind: typeOnly ? 'type' : 'listed',
        line: lineOf(masked, m.index),
        reexport: isReexport,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------- main

function rel(p) {
  return path.relative(REPO, p).replace(/\\/g, '/');
}

function isProductFile(p) {
  return !NON_PRODUCT_RE.test(p) && !TEST_FILE_RE.test(p);
}

function main() {
  const argv = process.argv.slice(2);
  const asJson = argv.includes('--json');
  const wantAll = argv.includes('--all');
  const only = argv.includes('--name') ? argv[argv.indexOf('--name') + 1] : null;
  const kindFilter = argv.includes('--kind') ? argv[argv.indexOf('--kind') + 1] : null;

  // Everything that can be a CALLER.
  const index = new Map();
  for (const root of PRODUCT_ROOTS) indexSources(path.join(SRC, root), index);
  indexSources(path.join(SRC, '.coordination'), index);
  index.set(path.join(SRC, 'preload.ts'), fs.readFileSync(path.join(SRC, 'preload.ts'), 'utf8'));
  const mainTs = path.join(SRC, 'main.ts');
  if (fs.existsSync(mainTs)) index.set(mainTs, fs.readFileSync(mainTs, 'utf8'));
  for (const root of CALLER_ONLY_ROOTS) indexSources(root, index);

  const masked = new Map();
  for (const [f, text] of index) masked.set(f, maskStringsAndComments(text));

  // Barrel targets: `export * from './x'` names nothing, so anything it re-exports is reachable.
  const barrelled = new Set();
  for (const [f, text] of index) {
    let m;
    STAR_RE.lastIndex = 0;
    while ((m = STAR_RE.exec(text))) {
      const target = path.resolve(path.dirname(f), m[1]);
      barrelled.add(target.replace(/\\/g, '/'));
    }
  }

  // Subjects: exports declared in product roots only.
  const subjects = [];
  const declaredIn = new Map(); // name -> Set(files)
  for (const [f, text] of index) {
    if (!f.startsWith(path.join(SRC, ''))) continue;
    const root = path.relative(SRC, f).split(path.sep)[0];
    if (!PRODUCT_ROOTS.includes(root)) continue;
    if (!isProductFile(f)) continue;
    for (const row of collectExports(f, masked.get(f))) {
      subjects.push(row);
      if (!declaredIn.has(row.name)) declaredIn.set(row.name, new Set());
      declaredIn.get(row.name).add(f);
    }
    if (DEFAULT_RE.test(text)) {
      subjects.push({ file: f, name: '(default)', kind: 'default', line: lineOf(text, text.search(DEFAULT_RE)), reexport: false });
    }
  }

  // Module-specifier index, for default exports.
  const specifiersByFile = new Map();
  for (const [f, text] of index) {
    const specs = new Set();
    for (const m of text.matchAll(/from\s*['"]([^'"]+)['"]/g)) specs.add(m[1]);
    for (const m of text.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) specs.add(m[1]);
    specifiersByFile.set(f, specs);
  }

  function importersByPath(file) {
    const noExt = file.replace(/\.(tsx|ts|jsx|js|cjs|mjs)$/, '').replace(/\\/g, '/');
    const base = path.basename(noExt);
    const product = [];
    const testOnly = [];
    for (const [f, specs] of specifiersByFile) {
      if (f === file) continue;
      let hit = false;
      for (const s of specs) {
        const norm = s.replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '');
        if (!norm.endsWith('/' + base) && norm !== base) continue;
        if (s.startsWith('.')) {
          const resolved = path.resolve(path.dirname(f), s).replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, '');
          if (resolved !== noExt) continue;
        }
        hit = true;
        break;
      }
      if (!hit) continue;
      (isProductFile(f) ? product : testOnly).push(rel(f));
    }
    return { product, testOnly };
  }

  // One pass over every file builds its identifier set, so a name lookup is O(1) per
  // file instead of a regex scan. Without this the scan is minutes, not seconds.
  const tokensByFile = [];
  for (const [f, text] of masked) {
    const set = new Set(text.match(/[A-Za-z_$][\w$]*/g) || []);
    tokensByFile.push({ file: f, tokens: set, product: isProductFile(f), label: rel(f) });
  }

  function importersByName(name, file) {
    const product = [];
    const testOnly = [];
    for (const entry of tokensByFile) {
      if (entry.file === file) continue;
      if (!entry.tokens.has(name)) continue;
      (entry.product ? product : testOnly).push(entry.label);
    }
    return { product, testOnly };
  }

  /**
   * Occurrences of the name inside its OWN file, past the declaration. Without this
   * the scan cannot tell "exported wider than it needs to be" (harmless) from
   * "built and rendered by nothing" (the D113 shape) — and the second is the only
   * one a user can be hurt by.
   */
  function selfUses(name, file) {
    const text = masked.get(file) || '';
    const hits = (text.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g')) || []).length;
    return Math.max(0, hits - 1);
  }

  const rows = [];
  for (const s of subjects) {
    if (only && s.name !== only) continue;
    const byPath = s.kind === 'default';
    const { product, testOnly } = byPath ? importersByPath(s.file) : importersByName(s.name, s.file);
    const dupes = declaredIn.get(s.name);
    const ambiguous = !byPath && dupes && dupes.size > 1;
    const isBarrelled = barrelled.has(s.file.replace(/\\/g, '/').replace(/\.(tsx|ts|jsx|js)$/, ''));
    const self = byPath ? 0 : selfUses(s.name, s.file);
    let verdict;
    if (product.length || isBarrelled) verdict = 'LIVE';
    else if (ambiguous) verdict = 'AMBIGUOUS';
    else if (testOnly.length) verdict = 'TEST-ONLY';
    else if (self > 0) verdict = 'LOCAL-ONLY';
    else verdict = 'DEAD';

    const pascal = /^[A-Z]/.test(s.name) && /\.tsx$/.test(s.file);
    const kindRank = TYPE_KINDS.has(s.kind)
      ? 'TYPE'
      : s.kind === 'default'
        ? pascal || /\.tsx$/.test(s.file)
          ? 'COMPONENT'
          : 'VALUE'
        : pascal
          ? 'COMPONENT'
          : 'VALUE';

    rows.push({ ...s, file: rel(s.file), verdict, rank: kindRank, product, testOnly, selfUses: self });
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ total: rows.length, rows }, null, 2));
    return;
  }

  const count = (v, r) => rows.filter((x) => x.verdict === v && (!r || x.rank === r)).length;
  console.log(`exports scanned: ${rows.length} (product roots: ${PRODUCT_ROOTS.join(', ')})`);
  console.log(`files indexed as callers: ${index.size}`);
  console.log(
    `LIVE ${count('LIVE')} · LOCAL-ONLY ${count('LOCAL-ONLY')} · TEST-ONLY ${count('TEST-ONLY')}` +
      ` · AMBIGUOUS ${count('AMBIGUOUS')} · DEAD ${count('DEAD')}`,
  );
  console.log(
    `  dead by rank — COMPONENT ${count('DEAD', 'COMPONENT')} · VALUE ${count('DEAD', 'VALUE')} · TYPE ${count('DEAD', 'TYPE')}`,
  );
  console.log(
    `  test-only by rank — COMPONENT ${count('TEST-ONLY', 'COMPONENT')} · VALUE ${count('TEST-ONLY', 'VALUE')} · TYPE ${count('TEST-ONLY', 'TYPE')}\n`,
  );

  const order = { COMPONENT: 0, VALUE: 1, TYPE: 2 };
  const shown = (wantAll || only ? rows : rows.filter((r) => r.verdict !== 'LIVE'))
    .filter((r) => !kindFilter || r.rank === kindFilter)
    .sort((a, b) => order[a.rank] - order[b.rank] || a.file.localeCompare(b.file) || a.line - b.line);

  for (const r of shown) {
    console.log(`${r.verdict.padEnd(10)} ${r.rank.padEnd(9)} ${r.name}  (${r.file}:${r.line}, ${r.kind})`);
    const list = r.product.length ? r.product : r.testOnly;
    if ((only || wantAll) && list.length) {
      for (const f of list.slice(0, 8)) console.log(`                            ${f}`);
      if (list.length > 8) console.log(`                            … ${list.length - 8} more`);
    }
  }
  if (!shown.length) console.log('(nothing to report at this filter)');
}

main();

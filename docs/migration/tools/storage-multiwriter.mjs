#!/usr/bin/env node
/**
 * storage-multiwriter.mjs — audit item 6.2: last-writer-wins erasure between two owners.
 *
 * ## What 6.2 is actually asking, and why the obvious query is the wrong one
 *
 * The obvious query is "which keys get `setItem` from more than one module". Run against
 * this repo it returns 11 keys — and it **misses the one confirmed instance the audit already
 * has**. Item 3.3: `jp-os-environment-v1.companions` lost three fields because
 * `CompanionLayer.persist()` and the Settings companions editor both wrote it. Both of them
 * write through the *same* setter, `saveEnvironment` (`environmentStore.ts:201`), so a
 * module-level view of `setItem` call sites sees exactly one writer and reports the key clean.
 *
 * The hazard is not two `setItem` calls. It is this shape:
 *
 *   export function saveX(partial: Partial<T>): T {
 *     const prev = loadX();                  // re-reads, so the TOP level is safe
 *     writeJson(KEY, { ...prev, ...partial });   // <-- SHALLOW merge
 *   }
 *
 * The re-read protects every field the caller does not mention. It protects **nothing inside
 * a field the caller does mention**: a spread replaces `companions` wholesale, so a caller
 * holding a stale copy of that array silently reverts every change another owner made inside
 * it. That is precisely 3.3.
 *
 * So the population 6.2 has to sweep is:
 *
 *   a shallow-merge setter, called from two or more modules, where at least one caller
 *   passes a COLLECTION-valued field (array or object) rather than a scalar.
 *
 * Scalars are excluded deliberately. Two owners writing `enabled: boolean` race, but neither
 * can erase a field the other wrote — last-writer-wins on a scalar is a conflict, not data
 * loss, and 6.2 is scoped to erasure.
 *
 * ## What this tool decides, and what it refuses to decide
 *
 * It reports a ranked candidate list. It does **not** rule a candidate a defect: whether a
 * caller's collection is stale depends on where that value came from (a fresh read → safe; a
 * React state variable or a ref captured earlier → the 3.3 bug), and that is a data-flow
 * question a human should answer by reading the caller. Every candidate is emitted with its
 * exact call sites so the adjudication is cheap. Rulings are pinned in
 * STORAGE_MULTIWRITER_ADJUDICATIONS.json so a re-run reprints a settled verdict instead of
 * re-litigating it — the same discipline 6.E used.
 *
 * Usage:
 *   node docs/migration/tools/storage-multiwriter.mjs [--census <path>] [--md <path>]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SRC = path.join(REPO, 'src');

const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const censusPath = path.resolve(REPO, argValue('--census', 'docs/audit/STORAGE_CENSUS.json'));
const mdPath = path.resolve(REPO, argValue('--md', 'docs/audit/STORAGE_MULTIWRITER.md'));
const jsonPath = mdPath.replace(/\.md$/, '.json');
const adjPath = path.resolve(REPO, 'docs/audit/STORAGE_MULTIWRITER_ADJUDICATIONS.json');

const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
const adjudications = fs.existsSync(adjPath) ? JSON.parse(fs.readFileSync(adjPath, 'utf8')) : {};

const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');
const isTestPath = (p) => /(__tests__|__devharness__|\.test\.|\.spec\.)/.test(p);

/**
 * TypeScript normalises `SourceFile.fileName` to forward slashes on every platform, while
 * `path.join` here produces backslashes. Comparing the two directly makes every `startsWith`
 * check false on Windows — which silently collected zero call sites and reported the sweep
 * clean. Compare against this, never against `SRC`.
 */
const SRC_POSIX = SRC.replace(/\\/g, '/');

// ---------------------------------------------------------------------------
// program
// ---------------------------------------------------------------------------

function collectSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      collectSourceFiles(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const started = Date.now();
const fileNames = collectSourceFiles(SRC);
const program = ts.createProgram(fileNames, {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.CommonJS,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  esModuleInterop: true,
  skipLibCheck: true,
  noResolve: false,
  strictNullChecks: true,
});
const checker = program.getTypeChecker();
console.log(`program ready in ${((Date.now() - started) / 1000).toFixed(1)}s (${fileNames.length} files)`);

const lineOf = (node) =>
  node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;

/** Nearest enclosing function-like node with a name we can cite. */
function enclosingFunction(node) {
  let cur = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isFunctionExpression(cur)
    ) {
      return cur;
    }
    cur = cur.parent;
  }
  return null;
}

function functionName(fn) {
  if (!fn) return null;
  if (fn.name && ts.isIdentifier(fn.name)) return fn.name.text;
  // `const saveX = (…) => {…}` / `const saveX = function(){}`
  const p = fn.parent;
  if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return p.name.text;
  if (p && ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)) return p.name.text;
  return null;
}

// ---------------------------------------------------------------------------
// step 1 — map each key's declared write sites to the function that encloses them
// ---------------------------------------------------------------------------

/** file → sourceFile, only for files that actually contain a write site. */
const writeFiles = new Set();
for (const rec of census.keys) {
  for (const site of rec.writeSites ?? []) writeFiles.add(String(site).split(':')[0]);
}

/** "file:line" → { fn, name } */
const siteToFunction = new Map();
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const r = rel(sf.fileName);
  if (!writeFiles.has(r)) continue;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const fn = enclosingFunction(node);
      const key = `${r}:${lineOf(node)}`;
      if (!siteToFunction.has(key) && fn) {
        siteToFunction.set(key, { fn, name: functionName(fn), file: r });
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

// ---------------------------------------------------------------------------
// step 2 — classify each owning function's merge shape
// ---------------------------------------------------------------------------

/**
 * A function is a SHALLOW-MERGE setter when it builds an object literal with two or more
 * spreads, at least one of which is (or derives from) one of its own parameters. That is the
 * `{ ...prev, ...partial }` shape whose top level is safe and whose nested collections are not.
 *
 * `full-replace` — writes a value it did not merge from a caller-supplied partial. A second
 * caller cannot erase a *field* through it; it either writes the whole record or nothing.
 */
function mergeShape(fn) {
  if (!fn || !fn.body) return 'unknown';
  const paramNames = new Set(
    (fn.parameters ?? []).filter((p) => ts.isIdentifier(p.name)).map((p) => p.name.text),
  );
  let shape = 'full-replace';
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const spreads = node.properties.filter((p) => ts.isSpreadAssignment(p));
      if (spreads.length >= 2) {
        const fromParam = spreads.some((s) => {
          let e = s.expression;
          while (ts.isPropertyAccessExpression(e)) e = e.expression;
          return ts.isIdentifier(e) && paramNames.has(e.text);
        });
        if (fromParam) shape = 'shallow-merge';
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return shape;
}

/** True when a type is an array/tuple or a non-primitive object — i.e. a spread replaces it wholesale. */
function isCollectionType(type) {
  if (!type) return false;
  if (type.isUnionOrIntersection()) return type.types.some((t) => isCollectionType(t));
  const flags = type.getFlags();
  if (
    flags &
    (ts.TypeFlags.String |
      ts.TypeFlags.Number |
      ts.TypeFlags.Boolean |
      ts.TypeFlags.BooleanLiteral |
      ts.TypeFlags.StringLiteral |
      ts.TypeFlags.NumberLiteral |
      ts.TypeFlags.Null |
      ts.TypeFlags.Undefined |
      ts.TypeFlags.Enum |
      ts.TypeFlags.EnumLiteral)
  ) {
    return false;
  }
  return (flags & ts.TypeFlags.Object) !== 0;
}

// ---------------------------------------------------------------------------
// step 3 — for every owning setter, find its call sites and what they pass
// ---------------------------------------------------------------------------

/** symbol → { calls: [{file, line, fields:[{name, collection}] }] } */
const callsBySymbol = new Map();

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  if (!sf.fileName.replace(/\\/g, '/').startsWith(SRC_POSIX)) continue;
  const r = rel(sf.fileName);
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const target = ts.isPropertyAccessExpression(node.expression)
        ? node.expression.name
        : node.expression;
      if (ts.isIdentifier(target)) {
        let sym = checker.getSymbolAtLocation(target);
        if (sym && sym.flags & ts.SymbolFlags.Alias) sym = checker.getAliasedSymbol(sym);
        if (sym) {
          const fields = [];
          for (const arg of node.arguments) {
            if (!ts.isObjectLiteralExpression(arg)) continue;
            for (const prop of arg.properties) {
              if (ts.isSpreadAssignment(prop)) {
                fields.push({ name: '…spread', collection: true });
                continue;
              }
              if (!prop.name || !ts.isIdentifier(prop.name)) continue;
              let valueType = null;
              try {
                const valueNode = ts.isPropertyAssignment(prop) ? prop.initializer : prop.name;
                valueType = checker.getTypeAtLocation(valueNode);
              } catch {
                valueType = null;
              }
              fields.push({ name: prop.name.text, collection: isCollectionType(valueType) });
            }
          }
          if (!callsBySymbol.has(sym)) callsBySymbol.set(sym, []);
          callsBySymbol.get(sym).push({ file: r, line: lineOf(node), fields });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
}

// ---------------------------------------------------------------------------
// step 4 — assemble per-key owner analysis
// ---------------------------------------------------------------------------

const results = [];

for (const rec of census.keys) {
  const sites = (rec.writeSites ?? []).map(String);
  if (!sites.length) continue;

  const directModules = [...new Set(sites.map((s) => s.split(':')[0]))];

  /** The distinct functions that perform this key's writes. */
  const owners = [];
  for (const site of sites) {
    const hit = siteToFunction.get(site);
    if (!hit) {
      owners.push({ site, name: null, shape: 'unresolved', callers: [] });
      continue;
    }
    const name = hit.name;
    if (owners.some((o) => o.name === name && o.file === hit.file)) continue;

    const shape = mergeShape(hit.fn);

    // Call sites of this setter, resolved by symbol so re-exports and renamed
    // imports are followed rather than missed.
    let callers = [];
    const nameNode = hit.fn.name && ts.isIdentifier(hit.fn.name)
      ? hit.fn.name
      : hit.fn.parent && ts.isVariableDeclaration(hit.fn.parent) && ts.isIdentifier(hit.fn.parent.name)
        ? hit.fn.parent.name
        : null;
    if (nameNode) {
      const sym = checker.getSymbolAtLocation(nameNode);
      if (sym) callers = callsBySymbol.get(sym) ?? [];
    }

    owners.push({ site, file: hit.file, name, shape, callers });
  }

  // The 6.2 population: a shallow-merge setter reached from 2+ modules, passing collections.
  const analyses = owners.map((o) => {
    const prod = o.callers.filter((c) => !isTestPath(c.file));
    const callerModules = [...new Set(prod.map((c) => c.file))];
    const collectionFields = new Map(); // field -> Set(modules)
    for (const c of prod) {
      for (const f of c.fields) {
        if (!f.collection) continue;
        if (!collectionFields.has(f.name)) collectionFields.set(f.name, new Set());
        collectionFields.get(f.name).add(c.file);
      }
    }
    const contested = [...collectionFields.entries()]
      .filter(([, mods]) => mods.size > 1)
      .map(([field, mods]) => ({ field, modules: [...mods] }));
    return {
      ...o,
      callers: prod,
      callerModules,
      testCallers: o.callers.filter((c) => isTestPath(c.file)).length,
      contestedCollectionFields: contested,
    };
  });

  const hazard = analyses.filter(
    (a) => a.shape === 'shallow-merge' && a.callerModules.length > 1 && a.contestedCollectionFields.length,
  );
  const multiModuleDirect = directModules.length > 1;

  if (!hazard.length && !multiModuleDirect) continue;

  results.push({
    key: rec.key,
    class: rec.class,
    directWriteModules: directModules,
    multiModuleDirect,
    owners: analyses.map((a) => ({
      site: a.site,
      name: a.name,
      shape: a.shape,
      callerModules: a.callerModules,
      testCallers: a.testCallers,
      contestedCollectionFields: a.contestedCollectionFields,
      callers: a.callers.map((c) => `${c.file}:${c.line}`),
    })),
    hazardFields: hazard.flatMap((h) => h.contestedCollectionFields),
    verdict: hazard.length ? 'candidate' : 'multi-module-direct-only',
  });
}

results.sort((a, b) => b.hazardFields.length - a.hazardFields.length || a.key.localeCompare(b.key));

/**
 * Canary. 6.2 already holds one *confirmed* instance — item 3.3, `companions` on
 * `jp-os-environment-v1`. A run that does not re-find it has broken analysis, not a clean
 * store, and "0 candidates" is the most dangerous possible output for this tool because it
 * reads as good news. This check caught a Windows path-separator bug that made the call-site
 * pass collect nothing and reported the entire sweep clean.
 */
const canary = results.find((r) => r.key === 'jp-os-environment-v1');
const canaryOk = canary?.hazardFields.some((f) => f.field === 'companions');
if (!canaryOk) {
  console.error(
    '\nCANARY FAILED: the known 3.3 instance (jp-os-environment-v1.companions) was not\n' +
      're-found. Treat this run as broken analysis, not as a clean store.',
  );
  process.exitCode = 3;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

const table = (head, rows) =>
  [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join(
    '\n',
  );

const candidates = results.filter((r) => r.verdict === 'candidate');
const directOnly = results.filter((r) => r.verdict === 'multi-module-direct-only');

const rulingFor = (key, field) => adjudications[field ? `${key}.${field}` : key] ?? adjudications[key] ?? null;

const summary = {
  generated: new Date().toISOString(),
  keysExamined: census.keys.filter((k) => (k.writeSites ?? []).length).length,
  multiModuleDirect: directOnly.length + candidates.filter((c) => c.multiModuleDirect).length,
  shallowMergeCandidates: candidates.length,
  contestedFields: candidates.reduce((n, c) => n + c.hazardFields.length, 0),
  ruled: results.filter((r) => rulingFor(r.key)).length,
  unruled: results.filter((r) => !rulingFor(r.key)).length,
};

const md = `# Storage 6.2 — last-writer-wins sweep

_Generated ${summary.generated} by \`docs/migration/tools/storage-multiwriter.mjs\`._

**Read the header of the tool before this table.** The naive query — "keys written by
\`setItem\` from two modules" — returns ${directOnly.length + candidates.filter((c) => c.multiModuleDirect).length}
keys and **misses item 3.3**, the one confirmed instance the audit already holds, because both
of 3.3's owners write through the same setter. The population that matters is a **shallow-merge
setter reached from two or more modules with a contested collection-valued field**.

${table(
  ['Measure', 'Count'],
  [
    ['Keys with at least one declared write site', String(summary.keysExamined)],
    ['Keys whose `setItem` calls span 2+ modules (the naive query)', String(summary.multiModuleDirect)],
    ['**Shallow-merge setters with a contested collection field**', `**${summary.shallowMergeCandidates}**`],
    ['Contested fields across those keys', String(summary.contestedFields)],
    ['Keys with a pinned ruling', String(summary.ruled)],
    ['**Keys still unruled**', `**${summary.unruled}**`],
  ],
)}

## Candidates — shallow merge, 2+ caller modules, contested collection field

${
  candidates.length
    ? candidates
        .map(
          (c) => `### \`${c.key}\`

${c.owners
  .filter((o) => o.contestedCollectionFields.length)
  .map(
    (o) => `Setter \`${o.name}\` (${o.site}), merge shape **${o.shape}**, called from ${o.callerModules.length} modules.

${table(
  ['Contested field', 'Written from'],
  o.contestedCollectionFields.map((f) => [`\`${f.field}\``, f.modules.map((m) => `\`${m}\``).join('<br>')]),
)}

Call sites: ${o.callers.map((s) => `\`${s}\``).join(', ')}`,
  )
  .join('\n\n')}

**Ruling:** ${rulingFor(c.key) ? `**${rulingFor(c.key).ruling}** — ${rulingFor(c.key).why}` : '_unruled_'}`,
        )
        .join('\n\n')
    : '_None._'
}

## Keys whose \`setItem\` calls span modules, with no contested collection field

These are the naive query's hits. Each is listed so the sweep can be shown to have looked at
them, not because each is suspect — most are one owner plus \`migrationRunner\`'s
whole-snapshot restore, which writes every key by construction and is not a competing owner.

${
  directOnly.length
    ? table(
        ['Key', 'Writing modules', 'Ruling'],
        directOnly.map((r) => [
          `\`${r.key}\``,
          r.directWriteModules.map((m) => `\`${m}\``).join('<br>'),
          rulingFor(r.key) ? `**${rulingFor(r.key).ruling}** — ${rulingFor(r.key).why}` : '_unruled_',
        ]),
      )
    : '_None._'
}
`;

fs.mkdirSync(path.dirname(mdPath), { recursive: true });
fs.writeFileSync(mdPath, md, 'utf8');
fs.writeFileSync(jsonPath, JSON.stringify({ summary, results }, null, 2), 'utf8');

console.log(`\n6.2 sweep: ${summary.shallowMergeCandidates} shallow-merge candidate(s), ${summary.multiModuleDirect} multi-module-direct key(s)`);
console.log(`  ${rel(mdPath)}`);
console.log(`  ${rel(jsonPath)}`);
for (const c of candidates) {
  console.log(`  CANDIDATE ${c.key} — contested: ${c.hazardFields.map((f) => f.field).join(', ')}`);
}

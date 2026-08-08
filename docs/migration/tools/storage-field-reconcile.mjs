#!/usr/bin/env node
/**
 * storage-field-reconcile.mjs — item 6.1, tier 2: the per-FIELD three-way comparison.
 *
 * For every live key that holds an object, compares three sets:
 *
 *   WRITTEN  the properties of the type handed to `setItem` — resolved with the TypeScript
 *            type checker, so a spread, a `Partial<T>` or an inherited field counts
 *   PRESENT  the top-level keys of the value actually in the running profile
 *   READ     whether each field name is accessed anywhere in `src/` outside the module that
 *            declares it — a weak signal by design, reported, never used to fail a key
 *
 * The three failure classes 6.1 asks for fall out of the comparison:
 *
 *   present-not-written   in the blob, absent from the writer's type — a field the current
 *                         writer cannot produce. Legacy residue, or a second writer.
 *   written-not-present   the writer's type has it, the blob does not. Either never set on
 *                         this profile (optional field, benign) or erased by a partial write.
 *   written-not-read      written by the app and read by nothing — a dead field.
 *
 * Usage:
 *   node docs/migration/tools/storage-field-reconcile.mjs --live <live-storage.json>
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
const livePath = path.resolve(argValue('--live', ''));
const outPath = path.resolve(REPO, argValue('--md', 'docs/audit/STORAGE_FIELD_RECONCILIATION.md'));

if (!livePath || !fs.existsSync(livePath)) {
  console.error('--live <path to live snapshot json> is required');
  process.exit(2);
}

const census = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
const live = JSON.parse(fs.readFileSync(livePath, 'utf8'));

/** Live object-valued keys are the only ones with fields to compare. */
const liveObjects = new Map(
  live.entries.filter((e) => e.type === 'object' && e.fields?.length).map((e) => [e.key, e]),
);

const censusByKey = new Map(census.keys.map((r) => [r.key, r]));

// ---------------------------------------------------------------------------
// program + checker
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

const rel = (f) => path.relative(REPO, f).replace(/\\/g, '/');

/**
 * Properties of a type, minus methods.
 *
 * Returns a kind alongside the fields because a string or an array also *has* properties —
 * `getPropertiesOfType` on a `string[]` cheerfully returns `length`, which then reads as
 * "the writer can write a `length` field and the blob is missing it". Two keys were reported
 * that way before this distinguished payload kinds.
 */
function typeFields(type) {
  if (!type) return { kind: 'unknown', fields: [] };

  const scalarFlags =
    ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike;
  if (type.getFlags() & scalarFlags) return { kind: 'scalar', fields: [] };

  const isArrayLike = (t) => {
    if (typeof checker.isArrayType === 'function' && checker.isArrayType(t)) return true;
    if (typeof checker.isTupleType === 'function' && checker.isTupleType(t)) return true;
    return /\[\]$|^Array<|^readonly /.test(checker.typeToString(t));
  };
  if (isArrayLike(type)) return { kind: 'array', fields: [] };

  const out = new Set();
  let sawScalarMember = false;
  const visit = (t) => {
    if (!t) return;
    if (t.isUnion?.() || t.isIntersection?.()) {
      for (const part of t.types) visit(part);
      return;
    }
    if (t.getFlags() & scalarFlags) {
      sawScalarMember = true;
      return;
    }
    if (isArrayLike(t)) {
      sawScalarMember = true;
      return;
    }
    for (const symbol of checker.getPropertiesOfType(t)) {
      const decl = symbol.valueDeclaration ?? symbol.declarations?.[0];
      if (decl && (ts.isMethodDeclaration(decl) || ts.isMethodSignature(decl))) continue;
      out.add(symbol.getName());
    }
  };
  visit(type);

  if (!out.size) return { kind: sawScalarMember ? 'scalar' : 'unknown', fields: [] };
  return { kind: 'object', fields: [...out].sort() };
}

/** The value expression a setItem call persists, unwrapping JSON.stringify. */
function persistedValueExpression(call) {
  const arg = call.arguments[1];
  if (!arg) return null;
  if (
    ts.isCallExpression(arg) &&
    ts.isPropertyAccessExpression(arg.expression) &&
    arg.expression.name.text === 'stringify'
  ) {
    return arg.arguments[0] ?? null;
  }
  return arg;
}

// Index every setItem call by "file:line" so census write sites can be looked up.
const writeCallsBySite = new Map();
for (const sf of program.getSourceFiles()) {
  if (!sf.fileName.includes('/src/') && !sf.fileName.includes('\\src\\')) continue;
  if (sf.isDeclarationFile) continue;
  const walk = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setItem'
    ) {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      writeCallsBySite.set(`${rel(sf.fileName)}:${line}`, { call: node, sf });
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);
}

// ---------------------------------------------------------------------------
// a cheap "is this field name read anywhere" index
// ---------------------------------------------------------------------------

const sourceTextByFile = new Map();
for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  if (!sf.fileName.includes('/src/') && !sf.fileName.includes('\\src\\')) continue;
  sourceTextByFile.set(rel(sf.fileName), sf.text);
}

/**
 * Where a field name is mentioned, split by whether it leaves its writing module.
 *
 * The split matters: `achievements.ts` writes AND reads `lastStreakCelebrated` inside one
 * file, which is a live field, while `lastStepId` is written, normalised on load, and read
 * by nothing that acts on it. Excluding the writer's own file collapses those two into one
 * bogus "dead field" verdict — it reported both before this told them apart.
 */
function readMentions(field, writerFiles) {
  const patterns = [
    new RegExp(`\\.${field}\\b`),
    new RegExp(`\\b${field}\\s*[,}:]`),
    new RegExp(`['"\`]${field}['"\`]`),
  ];
  const inside = [];
  const outside = [];
  for (const [file, text] of sourceTextByFile) {
    if (!patterns.some((p) => p.test(text))) continue;
    (writerFiles.has(file) ? inside : outside).push(file);
    if (outside.length >= 4) break;
  }
  return { inside, outside };
}

// ---------------------------------------------------------------------------
// the comparison
// ---------------------------------------------------------------------------

const results = [];
for (const [key, liveEntry] of liveObjects) {
  const row = censusByKey.get(key);
  if (!row || !row.writeSites?.length) {
    results.push({
      key,
      status: row ? 'no-named-writer' : 'not-in-census',
      liveFields: liveEntry.fields,
      writtenFields: [],
      presentNotWritten: [],
      writtenNotPresent: [],
      writerFiles: [],
    });
    continue;
  }

  const writtenFields = new Set();
  const writerFiles = new Set();
  let resolvedAnyWriter = false;
  let nonObjectPayload = false;

  for (const site of row.writeSites) {
    const found = writeCallsBySite.get(site);
    if (!found) continue;
    const valueExpr = persistedValueExpression(found.call);
    if (!valueExpr) continue;
    const { kind, fields } = typeFields(checker.getTypeAtLocation(valueExpr));
    if (kind === 'scalar' || kind === 'array') nonObjectPayload = true;
    if (fields.length) {
      resolvedAnyWriter = true;
      for (const f of fields) writtenFields.add(f);
    }
    writerFiles.add(site.split(':')[0]);
  }

  if (nonObjectPayload && !resolvedAnyWriter) {
    results.push({
      key,
      status: 'non-object-payload',
      liveFields: liveEntry.fields,
      writtenFields: [],
      presentNotWritten: [],
      writtenNotPresent: [],
      writerFiles: [...writerFiles],
    });
    continue;
  }

  const written = [...writtenFields].sort();
  const liveFields = liveEntry.fields;
  const presentNotWritten = liveFields.filter((f) => !writtenFields.has(f));
  const writtenNotPresent = written.filter((f) => !liveFields.includes(f));

  results.push({
    key,
    status: resolvedAnyWriter ? 'compared' : 'writer-type-unresolved',
    liveFields,
    writtenFields: written,
    presentNotWritten,
    writtenNotPresent,
    writerFiles: [...writerFiles],
    fieldTypes: liveEntry.fieldTypes ?? {},
  });
}

// dead-field check only for keys we could actually compare
for (const result of results) {
  if (result.status !== 'compared') continue;
  const writerFiles = new Set(result.writerFiles);
  const mentions = result.writtenFields
    .filter((f) => f.length > 2)
    .map((f) => ({ field: f, ...readMentions(f, writerFiles) }));
  result.writtenNotRead = mentions.filter((m) => !m.inside.length && !m.outside.length).map((m) => m.field);
  result.moduleLocalOnly = mentions.filter((m) => m.inside.length && !m.outside.length).map((m) => m.field);
}

const compared = results.filter((r) => r.status === 'compared');
const withDrift = compared.filter((r) => r.presentNotWritten.length || r.writtenNotPresent.length);

const summary = {
  generated: new Date().toISOString(),
  liveObjectKeys: liveObjects.size,
  compared: compared.length,
  writerTypeUnresolved: results.filter((r) => r.status === 'writer-type-unresolved').length,
  noNamedWriter: results.filter((r) => r.status === 'no-named-writer').length,
  keysWithFieldDrift: withDrift.length,
  totalPresentNotWritten: compared.reduce((a, r) => a + r.presentNotWritten.length, 0),
  totalWrittenNotPresent: compared.reduce((a, r) => a + r.writtenNotPresent.length, 0),
  totalWrittenNotRead: compared.reduce((a, r) => a + (r.writtenNotRead?.length ?? 0), 0),
};

const table = (headers, bodyRows) =>
  [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...bodyRows.map((r) => `| ${r.join(' | ')} |`)].join('\n');

let md = `# Storage field reconciliation — audit item 6.1, tier 2

Generated ${summary.generated} by \`docs/migration/tools/storage-field-reconcile.mjs\`.

For every live object-valued key: the fields the **writer's type** produces, the fields
**present** in the running profile, and whether each written field is **read** anywhere else
in \`src/\`.

## Summary

${table(
  ['Measure', 'Value'],
  [
    ['Live keys holding an object', String(summary.liveObjectKeys)],
    ['Compared (writer type resolved)', String(summary.compared)],
    ['Writer found but type gave no fields', String(summary.writerTypeUnresolved)],
    ['No named writer in source', String(summary.noNamedWriter)],
    ['**Keys with field drift**', `**${summary.keysWithFieldDrift}**`],
    ['Fields present but not writable', String(summary.totalPresentNotWritten)],
    ['Fields writable but absent', String(summary.totalWrittenNotPresent)],
    ['Fields written and read nowhere', String(summary.totalWrittenNotRead)],
  ],
)}

### Keys with field drift — ${withDrift.length}

${
  withDrift.length
    ? table(
        ['Key', 'Present, not writable', 'Writable, absent'],
        withDrift.map((r) => [
          `\`${r.key}\``,
          r.presentNotWritten.map((f) => `\`${f}\``).join(', ') || '—',
          r.writtenNotPresent.map((f) => `\`${f}\``).join(', ') || '—',
        ]),
      )
    : '_None._'
}

### Fields written and mentioned nowhere in src/

${
  compared.some((r) => r.writtenNotRead?.length)
    ? table(
        ['Key', 'Fields'],
        compared
          .filter((r) => r.writtenNotRead?.length)
          .map((r) => [`\`${r.key}\``, r.writtenNotRead.map((f) => `\`${f}\``).join(', ')]),
      )
    : '_None._'
}

### Fields read only inside their own writing module — candidates, not verdicts

A field the store round-trips but no consumer outside the store ever looks at. Some are
genuine internal bookkeeping; some are settings that persist and drive nothing. Each needs
reading before it counts as a finding.

${
  compared.some((r) => r.moduleLocalOnly?.length)
    ? table(
        ['Key', 'Fields', 'Writing module'],
        compared
          .filter((r) => r.moduleLocalOnly?.length)
          .map((r) => [
            `\`${r.key}\``,
            r.moduleLocalOnly.map((f) => `\`${f}\``).join(', '),
            r.writerFiles.join(', '),
          ]),
      )
    : '_None._'
}

### Keys whose writer type could not be resolved — ${summary.writerTypeUnresolved + summary.noNamedWriter}

Listed so they are not mistaken for clean comparisons. A \`Record<string, unknown>\` or a
\`JSON.parse\` result has no declared fields, so there is nothing to compare against.

${results
  .filter((r) => r.status !== 'compared')
  .map((r) => `- \`${r.key}\` — ${r.status}, live fields: ${r.liveFields.slice(0, 10).join(', ')}`)
  .join('\n')}
`;

fs.writeFileSync(outPath, md, 'utf8');
fs.writeFileSync(outPath.replace(/\.md$/, '.json'), JSON.stringify({ summary, results }, null, 2), 'utf8');

console.log(JSON.stringify(summary, null, 2));
console.log(`\nwrote ${rel(outPath)}`);

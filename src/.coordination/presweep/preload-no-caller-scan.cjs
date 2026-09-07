#!/usr/bin/env node
/**
 * Pre-sweep class 6b — "does anything actually CALL this route?"
 *
 * Class 6 asks whether a stored *setting* is ever read. This asks the same question
 * one layer up, about a *route*: `preload.ts` exposes ~700 names on `window.api`,
 * each backed by a real `ipcMain.handle` in main and a real type in `window.d.ts`.
 * A name with no call site in any renderer root is a feature with no actor — and it
 * is invisible to every other pass, because the handler exists, the binding exists,
 * the types compile and the tests pass. It is only the *product* that never happens.
 *
 * Found this way on 2026-09-07: `ytAutoUpdateDue` (D242). The YouTube "Update
 * automatically" checkbox and its 6/12/24-hour select persisted a preference whose
 * only reader was a main-process handler nothing invoked.
 *
 * Renderer roots searched: src/renderer, src/media. (src/main and src/shared cannot
 * call `window.api`; src/preload.ts and src/renderer/window.d.ts are the declaration
 * sites and are excluded by construction.)
 *
 * A 0-call-site result is a LEAD, not a verdict. Three shapes defeat a name search
 * and the scanner separates them rather than reporting them as dead:
 *
 *   LIVE        >= 1 product call site, listed
 *   STRING-REF  no property access, but the name appears as a string literal in a
 *               renderer file — 8 modules reach the bridge through `api?.[name]`
 *               helpers (`bridgeMethod('readingListsWrite')`), which is a real call
 *               site no property search can see. Treat as live; open the file to be sure.
 *   TEST-ONLY   reached only from `__tests__` / `__devharness__`. A route the product
 *               never takes is still dead, however green its test is.
 *   DEAD        named nowhere in any renderer root, as a property or as a string.
 *
 * Stated limit: a name assembled by concatenation (`'agent' + verb`) would read DEAD.
 * No such construction exists in this tree today; check before trusting a new DEAD.
 *
 * Usage:
 *   node src/.coordination/presweep/preload-no-caller-scan.cjs           # everything that is not LIVE
 *   node src/.coordination/presweep/preload-no-caller-scan.cjs --all     # every name
 *   node src/.coordination/presweep/preload-no-caller-scan.cjs --name x  # one name, verbose
 *   node src/.coordination/presweep/preload-no-caller-scan.cjs --json
 *
 * Exit code is 0 always: this is an inventory, not a gate. The register is the gate.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');
const PRELOAD = path.join(SRC, 'preload.ts');
const RENDERER_ROOTS = ['renderer', 'media'];
/** Declaration sites — they mention every name and would mask every hit. */
const EXCLUDED = new Set([path.join(SRC, 'renderer', 'window.d.ts'), PRELOAD]);

// ---------------------------------------------------------------- file index

function indexSources(dir, out = new Map()) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      indexSources(full, out);
      continue;
    }
    if (!/\.tsx?$/.test(ent.name)) continue;
    if (EXCLUDED.has(full)) continue;
    out.set(full, fs.readFileSync(full, 'utf-8'));
  }
  return out;
}

// ---------------------------------------------------------- the exposed names

/**
 * Property names declared at the top level of preload's `const api = { … }`.
 *
 * Brace depth is counted so a name nested inside a sub-object literal (an options
 * bag, a nested namespace) is not mistaken for a top-level route, and string and
 * comment spans are masked first so neither can contribute a brace or a false name.
 */
function exposedNames(text) {
  const start = text.indexOf('const api = {');
  if (start < 0) throw new Error('preload.ts: `const api = {` not found');
  const masked = maskStringsAndComments(text);
  let depth = 0;
  let i = text.indexOf('{', start);
  const names = [];
  const lineOf = offsetToLine(text);
  for (; i < text.length; i++) {
    const ch = masked[i];
    if (ch === '{') {
      depth++;
      continue;
    }
    if (ch === '}') {
      depth--;
      if (depth === 0) break;
      continue;
    }
    if (depth !== 1) continue;
    // A route declaration starts a line: `  name: (…)` or `  name,`
    if (ch !== '\n') continue;
    const m = /^\s{2}([A-Za-z_$][\w$]*)\s*[:,]/.exec(masked.slice(i + 1, i + 90));
    if (!m) continue;
    names.push({ name: m[1], line: lineOf(i + 1) + 1 });
  }
  return names;
}

/** Replace the body of every string, template and comment with spaces, keeping offsets. */
function maskStringsAndComments(text) {
  const out = text.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < text.length) {
    const ch = text[i];
    if (ch === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i);
      blank(i, end < 0 ? text.length : end);
      i = end < 0 ? text.length : end;
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      blank(i, end < 0 ? text.length : end + 2);
      i = end < 0 ? text.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      let k = i + 1;
      while (k < text.length) {
        if (text[k] === '\\') {
          k += 2;
          continue;
        }
        if (text[k] === ch) break;
        k++;
      }
      blank(i, k + 1);
      i = k + 1;
      continue;
    }
    i++;
  }
  return out.join('');
}

function offsetToLine(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return (off) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= off) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
}

// ------------------------------------------------------------- the call sites

/**
 * Files that reference `name` as a property of something plausibly `api`.
 *
 * Deliberately generous — `window.api.x`, `api.x`, `const { x } = window.api`,
 * `props.api.x`, a re-export through a helper — because the cost of a false DEAD is
 * far higher than the cost of a false LIVE. Comments and strings are masked so prose
 * about a route cannot keep it alive, which is the mistake `source-ratchet-reads-
 * comments` records.
 */
function callSites(name, index, maskedIndex) {
  const direct = new RegExp(`\\.\\s*${name}\\b`);
  const destructured = new RegExp(`\\b${name}\\b\\s*[,}:]`);
  // `?.` is the accessor here as often as `.` is — `window.api?.filesReveal?.(x)` is
  // the house style. Requiring a bare `.` reported 5 live routes as dead on the
  // first run, including `relaunchApp`, which a keyboard shortcut calls.
  const ACCESS = '\\s*(?:\\?\\.|\\.)\\s*';
  const product = [];
  const testOnly = [];
  for (const [file, text] of index) {
    const masked = maskedIndex.get(file);
    if (!direct.test(masked) && !(/window\.api|from '.*window/.test(masked) && destructured.test(masked)))
      continue;
    // Any property access to this exact name counts, whatever the receiver is
    // called. Constraining it to `window.api` / `api` missed a third shape —
    // `bridge()?.agentExecutionLeaseAcquire`, a helper that returns the bridge —
    // and reported all five lease routes dead. These names are long and specific
    // to the preload surface, so a same-named unrelated property is a much smaller
    // risk than a false DEAD; `--all` lists the evidence for anything doubtful.
    const re = new RegExp(`(?:\\?\\.|\\.)\\s*${name}\\b`);
    const destructuredFromApi = new RegExp(
      `\\{[^{}]*\\b${name}\\b[^{}]*\\}\\s*=\\s*(?:window${ACCESS}api|\\bapi\\b)`,
      's',
    );
    if (!re.test(masked) && !destructuredFromApi.test(masked)) continue;
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    (isTestOrHarness(rel) ? testOnly : product).push(rel);
  }
  return { product, testOnly };
}

/**
 * A route called only by its own test, or only by a dev harness, is still a route
 * the product never takes. Counting those as callers is how a dead feature reads
 * green — and `src/renderer/__devharness__/` is scheduled for deletion outright.
 */
function isTestOrHarness(rel) {
  return /(^|\/)__tests__\//.test(rel) || /(^|\/)__devharness__\//.test(rel) || /\.test\.tsx?$/.test(rel);
}

/** Files that index `api` with a computed key, so a string could name any route. */
function dynamicAccessFiles(maskedIndex) {
  const re = /(?:window\s*\.\s*api|\bapi)\s*(?:\?\.)?\s*\[/;
  const out = [];
  for (const [file, masked] of maskedIndex) {
    if (re.test(masked)) out.push(path.relative(SRC, file).replace(/\\/g, '/'));
  }
  return out;
}

/**
 * Files naming the route as a STRING literal.
 *
 * `readingListsClient.ts` and `agentImageStagingClient.ts` reach the bridge through
 * `bridgeMethod('readingListsWrite')`, which does `api?.[name]` one function later.
 * That is a real call site and a property search cannot see it — 8 names read DEAD
 * on the second run for exactly this reason. Strings are masked in the property
 * search (so prose about a route cannot keep it alive) which is precisely why this
 * has to be a separate pass over the raw text.
 */
function stringRefFiles(name, index) {
  const re = new RegExp(`['"\`]${name}['"\`]`);
  const out = [];
  for (const [file, text] of index) {
    if (!re.test(text)) continue;
    const rel = path.relative(SRC, file).replace(/\\/g, '/');
    if (isTestOrHarness(rel)) continue;
    out.push(rel);
  }
  return out;
}

// ----------------------------------------------------------------------- main

function main() {
  const argv = process.argv.slice(2);
  const wantAll = argv.includes('--all');
  const asJson = argv.includes('--json');
  const oneIdx = argv.indexOf('--name');
  const only = oneIdx >= 0 ? argv[oneIdx + 1] : null;

  const preloadText = fs.readFileSync(PRELOAD, 'utf-8');
  const names = exposedNames(preloadText);

  const index = new Map();
  for (const root of RENDERER_ROOTS) indexSources(path.join(SRC, root), index);
  const maskedIndex = new Map();
  for (const [file, text] of index) maskedIndex.set(file, maskStringsAndComments(text));

  const dynamic = dynamicAccessFiles(maskedIndex);

  const rows = [];
  for (const { name, line } of names) {
    if (only && name !== only) continue;
    const { product, testOnly } = callSites(name, index, maskedIndex);
    const strings = product.length ? [] : stringRefFiles(name, index);
    const verdict = product.length
      ? 'LIVE'
      : strings.length
        ? 'STRING-REF'
        : testOnly.length
          ? 'TEST-ONLY'
          : 'DEAD';
    rows.push({ name, line, verdict, product, testOnly, strings });
  }

  if (asJson) {
    process.stdout.write(JSON.stringify({ total: rows.length, dynamic, rows }, null, 2));
    return;
  }

  const dead = rows.filter((r) => r.verdict !== 'LIVE');
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(`preload bindings scanned: ${rows.length}`);
  console.log(`renderer/media files indexed: ${index.size} (tests and __devharness__ counted separately)`);
  console.log(`files indexing api dynamically: ${dynamic.length}${dynamic.length ? ` (${dynamic.join(', ')})` : ''}`);
  console.log(
    `LIVE ${count('LIVE')} · STRING-REF ${count('STRING-REF')} · TEST-ONLY ${count('TEST-ONLY')}` +
      ` · AMBIGUOUS ${count('AMBIGUOUS')} · DEAD ${count('DEAD')}\n`,
  );
  for (const r of wantAll || only ? rows : dead) {
    console.log(`${r.verdict.padEnd(10)} ${r.name}  (preload.ts:${r.line})`);
    const show = r.product.length ? r.product : r.strings.length ? r.strings : r.testOnly;
    if (show.length && (wantAll || only || r.verdict !== 'LIVE')) {
      for (const f of show.slice(0, 6)) console.log(`             ${f}`);
      if (show.length > 6) console.log(`             … ${show.length - 6} more`);
    }
  }
  if (!dead.length) console.log('(every exposed name has at least one product call site)');
}

main();

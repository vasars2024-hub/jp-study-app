#!/usr/bin/env node
/**
 * The offline class, scripted: a network call with no deadline.
 *
 * The live half of "offline for two minutes" can only visit the handful of surfaces a walk has
 * time for. This finds the shape that walk is looking for, everywhere at once: a `fetch(...)`
 * with no `signal`, no `AbortController` and no timeout wrapper anywhere near it. Online those
 * are invisible. Offline they are the difference between "this said it could not reach the
 * network" and "this spinner never stopped" — and a blackholed proxy does not even produce a
 * fast connection-refused, it produces a hang, which is exactly what a real outage does.
 *
 * Why a scan and not a walk: the app makes network calls from `src/main` (Node's global fetch),
 * from `src/renderer` (Chromium's) and from `src/media`. Driving each one to its timeout takes
 * as long as the timeout, which is the entire point of the defect.
 *
 * What it deliberately does NOT claim: an unbounded fetch is not automatically a defect. A call
 * whose caller already races it, or one behind a queue with its own deadline, is fine. Every row
 * is a LEAD that has to be read before it is filed — the scan says where to look, not what is
 * broken. `--verdict` prints the surrounding function so that reading is one step, not two.
 *
 * Usage:
 *   node src/.coordination/presweep/no-timeout-fetch-scan.cjs [--roots src/main,src/renderer]
 *                                                             [--verdict] [--json]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
}

const ROOTS = String(flag('roots', 'src/main,src/renderer,src/media,src/shared'))
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const VERDICT = flag('verdict', false) === true;
const AS_JSON = flag('json', false) === true;

/** Lines after the call that can still carry the option bag. */
const AFTER = 16;
/** Lines before it that can carry the controller the call then uses. */
const BEFORE = 30;

/**
 * `\bsignal\b`, not `signal\s*:`. `fetch(url, { headers, signal, redirect })` passes a real
 * deadline through object shorthand and the colon form misses it — `downloads.ts:558` was the
 * first row of the first run and it is fully guarded.
 */
const TIMEOUT_EVIDENCE =
  /\bsignal\b|AbortController|AbortSignal\.timeout|withTimeout|Promise\.race|setTimeout\([^)]*abort|timeoutMs|requestTimeout/;

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // Tests and dev harnesses are not shipped surfaces; a hang there costs nobody.
      if (entry.name === '__tests__' || entry.name === '__devharness__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blank out line comments and string/template bodies before matching.
 *
 * Without this a doc comment that merely says "we pass no signal here" scores as a call site,
 * and the `dead-export-scan` correction applies just as much: a masker that also blanks `${...}`
 * hides real code, so template interpolations are kept.
 */
function mask(line) {
  // A continuation line of a block comment starts with `*`, and prose about fetching scored as
  // a call site on the first run (`readingFetch.ts:2`, three `qbittorrent.ts` log strings that
  // say "subtitle fetch(es)"). Backticks are masked for the same reason a plain quote is.
  if (/^\s*\*|^\s*\/\*/.test(line)) return '';
  return line
    .replace(/\/\/.*$/, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    // A template keeps only its `${...}` interpolations, so prose inside one stops scoring while
    // real code inside one still does. `dead-export-scan` learned this the other way round: a
    // masker that blanked interpolations too read `DIFFICULTY_CLASS` as dead when its only use
    // is a className template. Three `scraperLog` lines saying "subtitle fetch(es)" are the
    // rows this removes.
    .replace(/`[^`]*`/g, (m) => (m.match(/\$\{[^}]*\}/g) || []).join(' '));
}

const CALL = /(^|[^.\w$])fetch\s*\(/;

function enclosingName(lines, index) {
  for (let i = index; i >= 0 && i > index - 200; i -= 1) {
    const m = lines[i].match(
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|(?:const|let)\s+([A-Za-z0-9_$]+)\s*(?::[^=]+)?=\s*(?:async\s*)?\(|ipcMain\.handle\(\s*['"]([^'"]+)['"]/,
    );
    if (m) return m[1] || m[2] || m[3];
  }
  return '(top level)';
}

const leads = [];
const seen = [];
for (const root of ROOTS) {
  for (const file of walk(root, [])) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = mask(raw);
      if (!CALL.test(line)) return;
      // `net.fetch`, `this.fetch`, `.then(fetch)` and property names are not the global call.
      if (/\bfunction\s+fetch\b|\bfetch\s*:/.test(line)) return;
      seen.push(`${file}:${i + 1}`);
      const window = lines
        .slice(Math.max(0, i - BEFORE), i + AFTER)
        .map(mask)
        .join('\n');
      if (TIMEOUT_EVIDENCE.test(window)) return;
      leads.push({
        file: file.split(path.sep).join('/'),
        line: i + 1,
        fn: enclosingName(lines, i),
        source: raw.trim().slice(0, 130),
      });
    });
  }
}

if (AS_JSON) {
  console.log(JSON.stringify({ total: seen.length, leads }, null, 2));
} else {
  console.log(`fetch() call sites scanned: ${seen.length}`);
  console.log(`with NO deadline of any kind nearby: ${leads.length}`);
  console.log('');
  for (const lead of leads) {
    console.log(`${lead.file}:${lead.line}  [${lead.fn}]`);
    if (VERDICT) console.log(`    ${lead.source}`);
  }
}
process.exitCode = 0;

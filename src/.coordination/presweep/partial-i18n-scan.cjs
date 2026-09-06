#!/usr/bin/env node
/**
 * Pre-sweep class 3 — half-translated surfaces.
 *
 * `tools/i18n-hardcoded-check.cjs` asks whether a component ADOPTS i18n at all: does it
 * call `t()` anywhere. That is the right question for a surface nobody has converted, and
 * it is why it reports clean while D92 and D98 are open. A file that resolves nine labels
 * through `t()` and renders the tenth as a bare literal passes it — and a half-translated
 * panel is what the user actually sees, because the untranslated line sits next to a
 * translated one.
 *
 * So this asks the opposite question: in a file that HAS adopted i18n, which user-facing
 * strings did not come along? Drift inside a converted file, not an unconverted surface.
 *
 * Scored positions, all of them things a user reads:
 *   label= / placeholder= / title= / aria-label= / alt=   JSX attributes
 *   label: / hint: / description: / placeholder:          object literals (menu and field tables)
 *   >Plain text<                                          JSX text children
 *
 * Not scored, because they are not user-facing or are legitimately literal: className,
 * href/src/url/id/key/role/type/name, data-* and test ids, anything already inside a
 * `t(...)` or `sx(...)` call, comments, imports, and strings with no letters (symbols,
 * separators, ellipses).
 *
 * Usage:
 *   node src/.coordination/presweep/partial-i18n-scan.cjs                 # ranked summary
 *   node src/.coordination/presweep/partial-i18n-scan.cjs --file <path>   # one file, every hit
 *   node src/.coordination/presweep/partial-i18n-scan.cjs --top 20
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', '..');

/** Surfaces whose chrome is deliberately plain English until a whole-surface pass. */
const EXEMPT = [
  /(^|\/)blanc\//i, //  CLAUDE.md: "Blanc-owned chrome is intentionally plain English"
  /(^|\/)__devharness__\//,
  /(^|\/)__tests__\//,
  /(^|\/)i18n\//,
  /\.d\.ts$/,
];

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === '.coordination') {
        continue;
      }
      walk(full, out);
    } else if (ent.name.endsWith('.tsx')) {
      const rel = path.relative(SRC, full).replace(/\\/g, '/');
      if (!EXEMPT.some((r) => r.test(rel))) out.push(rel);
    }
  }
  return out;
}

/**
 * Blank out comments and `t(...)` / `sx(...)` arguments so their contents cannot score.
 *
 * Newlines are PRESERVED. Blanking a multi-line block comment with `' '.repeat(len)`
 * deletes its newlines and silently shifts every reported line number below it — the
 * first version of this scanner did exactly that and pointed at the wrong lines in every
 * file with a block comment, which is most of them here.
 */
const blank = (m) => m.replace(/[^\n]/g, ' ');
function mask(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^[ \t]*\/\/.*$/gm, blank)
    .replace(/\b(?:t|sx|tx)\s*\(\s*(['"`])(?:[^'"`\\]|\\.)*\1/g, blank);
}

/** A string a user could read: has two adjacent letters, and is not an identifier-ish token. */
function looksHuman(s) {
  if (!/[A-Za-z]{2}/.test(s)) return false;
  if (s.length < 2 || s.length > 160) return false;
  if (/^[a-z][a-zA-Z0-9]*$/.test(s) && !/ /.test(s)) return false; // camelCase token
  if (/^[a-z0-9-]+$/.test(s) && !/ /.test(s)) return false; //         kebab token / slug
  if (/^[A-Z0-9_]+$/.test(s)) return false; //                         CONST_NAME
  if (/^https?:|^\/|^\.\/|^#|^data:|^[\w.]+\.(?:tsx?|css|json|png|svg)$/.test(s)) return false;
  if (/^\d+(?:\.\d+)?(?:px|ms|s|%|em|rem)?$/.test(s)) return false;
  // `>` and `<` also delimit TypeScript generics, so the JSX-text pattern picks up
  // fragments like `[1]): Promise` from a signature. Anything carrying code punctuation
  // in a position a sentence would not is that, not a label.
  if (/[()\][=;|&]|=>|\bPromise\b|\bReact\b|\bas\s+[A-Z]/.test(s)) return false;
  return true;
}

const ATTR = /\b(label|placeholder|title|aria-label|alt)\s*=\s*(['"])((?:[^'"\\]|\\.)*)\2/g;
const PROP = /\b(label|hint|description|placeholder|emptyText|subtitle)\s*:\s*(['"])((?:[^'"\\]|\\.)*)\2/g;
const TEXT = />([^<>{}\n]{2,120})</g;

function scan(rel) {
  const raw = fs.readFileSync(path.join(SRC, rel), 'utf8');
  // A file that never calls t() is the OTHER tool's business, not this one's.
  if (!/\bt\s*\(\s*['"`]|useT\s*\(/.test(raw)) return null;
  const text = mask(raw);
  const lineAt = (i) => text.slice(0, i).split('\n').length;
  const hits = [];
  const push = (i, kind, value) => {
    if (looksHuman(value)) hits.push({ line: lineAt(i), kind, value: value.trim() });
  };

  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(text))) push(m.index, m[1], m[3]);
  PROP.lastIndex = 0;
  while ((m = PROP.exec(text))) push(m.index, `${m[1]}:`, m[3]);
  TEXT.lastIndex = 0;
  while ((m = TEXT.exec(text))) {
    const v = m[1].trim();
    // JSX text is the noisiest position, but it cannot require a space: D98's two worst
    // sites are the single words `Lock` and `Advanced`, and an early version of this
    // scanner missed both. A Capitalised word is a label; a lone separator is not.
    if (/[ .?!:]/.test(v) || /^[A-Z][a-z]{2,}$/.test(v)) push(m.index, 'text', v);
  }
  return hits.length ? { file: rel, hits } : null;
}

function main() {
  const argv = process.argv.slice(2);
  const one = argv.includes('--file') ? argv[argv.indexOf('--file') + 1] : null;
  const top = argv.includes('--top') ? Number(argv[argv.indexOf('--top') + 1]) : 25;

  const files = one ? [one.replace(/\\/g, '/').replace(/^src\//, '')] : walk(SRC);
  const results = files.map(scan).filter(Boolean);
  results.sort((a, b) => b.hits.length - a.hits.length);

  if (one) {
    const r = results[0];
    if (!r) {
      process.stdout.write(`${files[0]}: no untranslated user-facing literal found.\n`);
      return;
    }
    process.stdout.write(`${r.file} — ${r.hits.length} untranslated\n`);
    for (const h of r.hits) {
      process.stdout.write(`  :${String(h.line).padEnd(5)} ${h.kind.padEnd(12)} ${h.value}\n`);
    }
    return;
  }

  const total = results.reduce((n, r) => n + r.hits.length, 0);
  process.stdout.write(
    `${files.length} .tsx scanned, ${results.length} of them call t() AND still render an ` +
      `untranslated user-facing string.\n${total} strings in total. Top ${top}:\n\n`,
  );
  for (const r of results.slice(0, top)) {
    process.stdout.write(`  ${String(r.hits.length).padStart(4)}  ${r.file}\n`);
  }
  process.stdout.write(
    '\nA hit is a LEAD. Proper nouns, code samples and units are legitimately literal — ' +
      'read the\nline before filing. Re-run with --file <path> for the list.\n',
  );
}

main();

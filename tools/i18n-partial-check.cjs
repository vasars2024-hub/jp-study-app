#!/usr/bin/env node
/**
 * i18n gate — half-translated surfaces.
 *
 * Was `src/.coordination/presweep/partial-i18n-scan.cjs`, a lead list. Promoted to a
 * ratcheted gate on 2026-09-07 because the check it complements CANNOT FAIL on this
 * shape (pre-sweep D128): `i18n-hardcoded-check.cjs` asks only whether a file adopts
 * i18n AT ALL, so `VerifiedSitesManager.tsx` passed it for as long as it carried 105
 * English strings alongside 30 `t()` calls. Measured, not reasoned: after that file was
 * converted and its baseline entry removed, planting 1 and then 7 English literals back
 * left the other check at exit 0 both times.
 *
 * It is a RATCHET, not a hard zero, and deliberately so. 340 of the hits below are leads,
 * and a real share of them are legitimately literal — proper nouns, units, code samples.
 * A hard zero that produces false positives gets baselined away wholesale and then
 * protects nothing; that is the lesson `i18n-locale-arg-check.cjs` was rebuilt on. So the
 * current population is frozen per file and only GROWTH fails.
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
 *   node tools/i18n-partial-check.cjs                  # gate: exit 1 if any file grew
 *   node tools/i18n-partial-check.cjs --report         # ranked summary, always exit 0
 *   node tools/i18n-partial-check.cjs --file <path>    # one file, every hit
 *   node tools/i18n-partial-check.cjs --update-baseline
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SRC = path.resolve(__dirname, '..', 'src');
const BASELINE = path.join(__dirname, 'i18n-partial-baseline.json');

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
// The opening `>` must really close a JSX tag. An arrow function's `=>` also ends in
// `>`, so `(alien) => alien.x + direction * speed < 4` matched with ` alien.x + direction
// * speed ` as its "JSX text" — arithmetic, scored as a user-visible label. looksHuman()
// cannot catch it: its code-punctuation guard reads the CAPTURE, and the `=>` that caused
// the match sits outside it. Measured on ArcadeGames.tsx, where it produced 2 findings
// that were both pure game physics. Excluding `=` `!` `<` `>` `-` before the `>` also
// covers `>=`, `->` and the `>>` of a closing generic; `(?!=)` stops `<=` closing one.
const TEXT = /(?<![=!<>-])>([^<>{}\n]{2,120})<(?!=)/g;

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
  const counts = Object.fromEntries(results.map((r) => [r.file, r.hits.length]));

  if (argv.includes('--update-baseline')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
    process.stdout.write(
      `i18n-partial: baseline re-locked at ${results.length} file(s), ${total} string(s).\n`,
    );
    return;
  }

  if (argv.includes('--report')) {
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
    return;
  }

  // Gate mode. A missing baseline is a hard failure rather than an implicit
  // "accept everything" — an absent file is exactly how a ratchet silently stops
  // ratcheting.
  if (!fs.existsSync(BASELINE)) {
    process.stderr.write(
      `i18n-partial: ${path.relative(process.cwd(), BASELINE)} is missing. ` +
        'Run with --update-baseline to create it.\n',
    );
    process.exitCode = 1;
    return;
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));

  const grew = [];
  for (const r of results) {
    const allowed = base[r.file] ?? 0;
    if (r.hits.length > allowed) grew.push({ ...r, allowed });
  }
  const shrank = results.filter((r) => (base[r.file] ?? 0) > r.hits.length);
  const cleared = Object.keys(base).filter((f) => !counts[f]);

  if (grew.length) {
    process.stderr.write(
      'i18n-partial: a file that already calls t() gained untranslated user-facing ' +
        'string(s).\nThis is the class i18n-hardcoded-check cannot see, so it is the only ' +
        'thing standing\nbetween a converted panel and a slow drift back to English.\n\n',
    );
    for (const r of grew) {
      process.stderr.write(`  ${r.file} — ${r.allowed} baselined, ${r.hits.length} now\n`);
      for (const h of r.hits.slice(0, 8)) {
        process.stderr.write(`      :${String(h.line).padEnd(5)} ${h.kind.padEnd(12)} ${h.value}\n`);
      }
    }
    process.stderr.write(
      '\nTranslate them through the existing seam. Raise the baseline ONLY for a string ' +
        'that is\nlegitimately literal (a proper noun, a unit, a code sample) and say which ' +
        'in the commit.\n',
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `i18n-partial: no converted component gained an untranslated string. ` +
      `${results.length} file(s) baselined, ${total} string(s).\n`,
  );
  if (shrank.length || cleared.length) {
    process.stdout.write(
      `\n${shrank.length + cleared.length} file(s) improved — re-lock with ` +
        '--update-baseline:\n',
    );
    for (const r of shrank) {
      process.stdout.write(`  ${r.file} — ${base[r.file]} baselined, ${r.hits.length} now\n`);
    }
    for (const f of cleared) process.stdout.write(`  ${f} — now fully translated\n`);
  }
}

/*
 * `scan` and `walk` are the only literal extractor in this repo, and
 * `i18n-shadow-check.cjs` asks a different question of the SAME hits — is this
 * literal's exact text already a value in the catalog? Exporting them keeps
 * one set of position rules and one `looksHuman`, rather than a second
 * scanner that drifts from this one. RULE 1: no new single-use extractor.
 */
module.exports = { scan, walk, looksHuman, SRC };

if (require.main === module) main();

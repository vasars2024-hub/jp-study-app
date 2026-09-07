#!/usr/bin/env node
/**
 * i18n gate — SHADOWED KEYS: a literal whose exact text is already in the catalog.
 *
 * Written 2026-09-07 after three consecutive pre-sweep defects turned out to be
 * one class, and none of the five existing i18n checks could see it:
 *
 *   D188  the immersion Aero shell re-typed 10 strings that `immersion.*`
 *         already carried, translated, because the CLASSIC shell consumed them.
 *   D189  the Aero start menu re-typed 4 tooltips that `desktop.*` already
 *         carried, because the LEGACY start grid consumed them.
 *   D231  the Mini View drawer re-typed 11 strings that `settings.mini.*` and
 *         `common.*` already carried, because SETTINGS › MINI VIEW consumed them.
 *
 * Why every other check is blind to it, and this is the point of the file:
 *
 *   i18n-check          compares ja/zh/ru against en. The key exists and is
 *                       translated in all four. Nothing to report.
 *   i18n-orphan-key     asks whether a key has NO consumer. It has one — the
 *                       other shell. Nothing to report.
 *   i18n-hardcoded      asks whether the file adopts t() at all. It does.
 *   i18n-partial        ratchets per file, so a file born with the literal stays
 *                       baselined at that count forever. It reported
 *                       DesktopShell at 28 before D189 and 28 after.
 *   the vitest catalogs suite  checks catalog hygiene, not call sites.
 *
 * So a duplicated shell can render an entire surface in English while all six
 * gates are green — which is exactly what happened three times in one day.
 *
 * The question here is narrow and therefore high-signal: does this literal's
 * exact text ALREADY appear as an English catalog value? If yes, the translation
 * exists and the call site simply is not using it. That is not a lead, it is a
 * defect with its own fix attached — the key to use is in the output.
 *
 * It reuses `i18n-partial-check.cjs`'s extractor rather than writing a second
 * one, so both tools agree on what counts as a user-facing position.
 *
 * Usage:
 *   node tools/i18n-shadow-check.cjs                 # gate: exit 1 on growth
 *   node tools/i18n-shadow-check.cjs --report        # every hit, grouped by file
 *   node tools/i18n-shadow-check.cjs --file <path>   # one file
 *   node tools/i18n-shadow-check.cjs --update-baseline
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const { scan, walk, SRC } = require('./i18n-partial-check.cjs');

const CATALOGS_PATH = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'catalogs', 'all.ts');
const BASELINE = path.join(__dirname, 'i18n-shadow-baseline.json');

/**
 * Values that are legitimately re-typed. A one-word label like `Name` or `Off`
 * is a coincidence of vocabulary, not a duplicated shell — the catalog has
 * thousands of keys and short common words collide constantly. Requiring the
 * literal to be distinctive is what keeps this at near-zero false positives,
 * and a check that produces false positives gets baselined away wholesale
 * (the lesson `i18n-locale-arg-check.cjs` was rebuilt on).
 */
function distinctive(value) {
  const words = value.trim().split(/\s+/);
  if (words.length >= 2) return true;
  // A single word only counts if it is long enough to be a real label rather
  // than a common noun that any catalog would carry by accident.
  return value.trim().length >= 12;
}

function loadEnglish() {
  const { outputFiles } = esbuild.buildSync({
    entryPoints: [CATALOGS_PATH],
    bundle: true,
    write: false,
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    logLevel: 'silent',
  });
  const mod = { exports: {} };
  // eslint-disable-next-line no-new-func -- trusted local source file, not user input
  new Function('module', 'exports', 'require', outputFiles[0].text)(mod, mod.exports, require);
  return mod.exports.en;
}

/**
 * value -> the keys that carry it. Plural entries contribute each of their arms,
 * so `{count} sites` finds `immersion.aero.status.sitesCount` too.
 *
 * Values are normalised on the punctuation that differs between a hand-typed
 * literal and a catalog entry and nowhere else: the three dash characters, the
 * two apostrophes, and `...` versus `…`. `Loading...` in a component and
 * `Loading…` in the catalog are the same string to a reader, and D188 is the
 * proof that they are the same defect.
 */
function normalise(s) {
  return s
    .trim()
    .replace(/…/g, '...')
    .replace(/[‘’]/g, "'")
    .replace(/[–—−]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function indexByValue(en) {
  const byValue = new Map();
  const add = (value, key) => {
    if (typeof value !== 'string' || !value) return;
    const k = normalise(value);
    if (!byValue.has(k)) byValue.set(k, []);
    byValue.get(k).push(key);
  };
  for (const [key, entry] of Object.entries(en)) {
    if (typeof entry === 'string') add(entry, key);
    else if (entry && typeof entry === 'object') for (const arm of Object.values(entry)) add(arm, key);
  }
  return byValue;
}

function main() {
  const argv = process.argv.slice(2);
  const one = argv.includes('--file') ? argv[argv.indexOf('--file') + 1] : null;

  const byValue = indexByValue(loadEnglish());
  const files = one ? [one.replace(/\\/g, '/').replace(/^src\//, '')] : walk(SRC);

  const results = [];
  for (const rel of files) {
    const scanned = scan(rel);
    if (!scanned) continue;
    const hits = [];
    for (const hit of scanned.hits) {
      if (!distinctive(hit.value)) continue;
      const keys = byValue.get(normalise(hit.value));
      if (keys) hits.push({ ...hit, keys });
    }
    if (hits.length) results.push({ file: rel, hits });
  }
  results.sort((a, b) => b.hits.length - a.hits.length);

  const total = results.reduce((n, r) => n + r.hits.length, 0);
  const counts = Object.fromEntries(results.map((r) => [r.file, r.hits.length]));

  const printAll = () => {
    for (const r of results) {
      process.stdout.write(`\n${r.file} — ${r.hits.length}\n`);
      for (const h of r.hits) {
        process.stdout.write(
          `  :${String(h.line).padEnd(5)} ${h.kind.padEnd(12)} ${JSON.stringify(h.value)}\n` +
            `        -> ${h.keys.slice(0, 3).join(', ')}${h.keys.length > 3 ? `, +${h.keys.length - 3} more` : ''}\n`,
        );
      }
    }
  };

  if (one) {
    if (!results.length) {
      process.stdout.write(`${files[0]}: no literal shadows an existing catalog value.\n`);
      return;
    }
    printAll();
    return;
  }

  if (argv.includes('--update-baseline')) {
    fs.writeFileSync(BASELINE, `${JSON.stringify(counts, null, 2)}\n`);
    process.stdout.write(
      `i18n-shadow: baseline re-locked at ${results.length} file(s), ${total} string(s).\n`,
    );
    return;
  }

  if (argv.includes('--report')) {
    process.stdout.write(
      `${total} literal(s) across ${results.length} file(s) whose exact text is ALREADY an ` +
        'English catalog value.\nEach one has its fix attached — use the key.\n',
    );
    printAll();
    return;
  }

  const base = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : {};
  const grew = results.filter((r) => r.hits.length > (base[r.file] ?? 0));
  if (grew.length) {
    process.stdout.write(
      'i18n-shadow: a literal was typed where a TRANSLATED KEY ALREADY EXISTS.\n\n',
    );
    for (const r of grew) {
      process.stdout.write(`${r.file} — ${base[r.file] ?? 0} baselined, ${r.hits.length} now\n`);
      for (const h of r.hits) {
        process.stdout.write(`  :${h.line}  ${JSON.stringify(h.value)}  ->  ${h.keys[0]}\n`);
      }
    }
    process.stdout.write(
      '\nUse the key. Do not add a second one with the same English text — that is how the\n' +
        'two copies drift apart, and it is the defect this gate exists for.\n',
    );
    process.exitCode = 1;
    return;
  }

  const shrank = results.filter((r) => r.hits.length < (base[r.file] ?? 0));
  const cleared = Object.keys(base).filter((f) => !counts[f]);
  process.stdout.write(
    `i18n-shadow: no new literal shadows a translated key. ` +
      `${results.length} file(s) baselined, ${total} string(s).\n`,
  );
  if (shrank.length || cleared.length) {
    process.stdout.write(
      `\n${shrank.length + cleared.length} file(s) improved — re-lock with --update-baseline:\n`,
    );
    for (const r of shrank) {
      process.stdout.write(`  ${r.file} — ${base[r.file]} baselined, ${r.hits.length} now\n`);
    }
    for (const f of cleared) process.stdout.write(`  ${f} — now clean\n`);
  }
}

main();

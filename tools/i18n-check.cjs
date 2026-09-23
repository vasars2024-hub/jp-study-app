/**
 * Reports which i18n catalog keys need a translator's attention, so adding new
 * UI text never requires another full-app translation sweep — just this.
 *
 * `src/shared/i18n/catalogs.ts` is TypeScript with no runtime deps, but this
 * project has no ts-node/tsx. esbuild (already a transitive dep of Vite) does
 * the type-stripping; the result is eval'd in an isolated function scope to
 * pull out the exported catalogs without needing a bundler.
 *
 * Usage: node tools/i18n-check.cjs [--json]
 * Exit code 1 if anything is missing/orphaned (CI/pre-commit friendly).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

// Reads the static aggregate, not the loader: catalogs.ts now lazy-imports
// per-language chunks, so bundling it would yield only English.
const CATALOGS_PATH = path.join(__dirname, '..', 'src', 'shared', 'i18n', 'catalogs', 'all.ts');
const LANGS = ['en', 'ja', 'zh', 'ru'];

// Keys whose translation is *byte-identical to English* and accepted as such.
//
// Added 2026-08-04 (audit F8). Comparing key presence only, this script reported
// "all keys translated" while 309 keys — GAME_ARENA_CHROME (109) and
// MOONCAP_PHASE_LORE (200) — rendered English under every UI language, because
// a single shared English record had been spread into all four catalogs. Key
// presence cannot see that; value identity can.
//
// The baseline exists because ~110 keys per language are *legitimately*
// identical: product names (GrammarX, Anki, YouTube), pure format strings
// ('{current}/{total}'), and the deliberately retro-English Frutiger Aero
// easter egg. Failing on those would make the check noise and it would be
// switched off. So: the baseline is what the tree had when the check was
// written, and the gate fails on anything NEW. The count is printed on every
// run, so the residue is visible rather than invisible — which was the actual
// complaint. Shrinking it is a translator's job; growing it must be deliberate.
const BASELINE_PATH = path.join(__dirname, 'i18n-untranslated-baseline.json');

function loadCatalogs() {
  // Bundled rather than type-stripped: catalogs.ts pulls per-language blocks in
  // from sibling modules (see grammarTaxonomy.ts), which a single-file
  // transform cannot resolve.
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
  return mod.exports; // { en, ja, zh, ru, CATALOGS, ... }
}

function main() {
  const asJson = process.argv.includes('--json');
  const catalogs = loadCatalogs();
  const enKeys = Object.keys(catalogs.en);

  /** @type {Record<string, string[]>} missing[lang] = keys en has that lang doesn't */
  const missing = {};
  /** @type {Record<string, string[]>} orphaned[lang] = keys lang has that en doesn't (likely a typo) */
  const orphaned = {};

  /** @type {Record<string, string[]>} untranslated[lang] = keys whose value equals English and are not baselined */
  const untranslated = {};
  /** @type {Record<string, number>} how many baselined keys each language still carries */
  const baselined = {};

  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  // A plural entry is an object; compare it structurally so a plural form that
  // was copied from English is caught the same way a bare string would be.
  const valueOf = (entry) => (typeof entry === 'string' ? entry : JSON.stringify(entry));

  for (const lang of LANGS) {
    if (lang === 'en') continue;
    missing[lang] = enKeys.filter((k) => catalogs[lang][k] === undefined);
    orphaned[lang] = Object.keys(catalogs[lang]).filter((k) => catalogs.en[k] === undefined);

    const accepted = new Set(baseline[lang] ?? []);
    const identical = enKeys.filter(
      (k) => catalogs[lang][k] !== undefined && valueOf(catalogs[lang][k]) === valueOf(catalogs.en[k]),
    );
    untranslated[lang] = identical.filter((k) => !accepted.has(k));
    baselined[lang] = identical.length - untranslated[lang].length;
  }

  const totalMissing = Object.values(missing).reduce((n, a) => n + a.length, 0);
  const totalOrphaned = Object.values(orphaned).reduce((n, a) => n + a.length, 0);
  const totalUntranslated = Object.values(untranslated).reduce((n, a) => n + a.length, 0);

  const residue = LANGS.slice(1)
    .map((l) => `${l} ${baselined[l]}`)
    .join(', ');

  if (asJson) {
    console.log(JSON.stringify({ missing, orphaned, untranslated, baselined }, null, 2));
  } else if (totalMissing === 0 && totalOrphaned === 0 && totalUntranslated === 0) {
    console.log(`i18n: all ${enKeys.length} English keys are translated in ${LANGS.slice(1).join('/')}. Nothing to do.`);
    console.log(
      `      ${residue} keys still render English verbatim and are baselined as accepted ` +
        `(product names, format strings, the Aero easter egg) — tools/i18n-untranslated-baseline.json.`,
    );
  } else {
    if (totalMissing > 0) {
      console.log('Missing translations (English key exists, target language falls back silently):\n');
      for (const lang of LANGS) {
        if (lang === 'en' || missing[lang].length === 0) continue;
        console.log(`  ${lang} — ${missing[lang].length} key(s):`);
        for (const key of missing[lang]) {
          const enVal = catalogs.en[key];
          const preview = typeof enVal === 'string' ? enVal : JSON.stringify(enVal);
          console.log(`    ${key}: ${preview}`);
        }
        console.log('');
      }
    }
    if (totalOrphaned > 0) {
      console.log('Orphaned keys (exist in a translation but not in English — likely a typo, safe to delete):\n');
      for (const lang of LANGS) {
        if (lang === 'en' || orphaned[lang].length === 0) continue;
        console.log(`  ${lang} — ${orphaned[lang].length} key(s): ${orphaned[lang].join(', ')}`);
      }
      console.log('');
    }
    if (totalUntranslated > 0) {
      console.log(
        'Untranslated (the key exists, but its value is byte-identical to English — it renders\n' +
          'English under that UI language while every presence check passes):\n',
      );
      for (const lang of LANGS) {
        if (lang === 'en' || untranslated[lang].length === 0) continue;
        console.log(`  ${lang} — ${untranslated[lang].length} key(s):`);
        for (const key of untranslated[lang]) {
          const enVal = catalogs.en[key];
          const preview = typeof enVal === 'string' ? enVal : JSON.stringify(enVal);
          console.log(`    ${key}: ${preview}`);
        }
        console.log('');
      }
      console.log(
        'If a key is genuinely the same in that language (a product name, a pure format\n' +
          'string), add it to tools/i18n-untranslated-baseline.json. Do not add a block of\n' +
          'them at once — that is exactly how audit F8 happened.\n',
      );
    }
    console.log(
      `To fix: hand the lists above to an assistant and ask it to add ja/zh/ru entries for ` +
        `those exact keys in src/shared/i18n/catalogs/{ja,zh,ru}.ts, matching the style of ` +
        `neighboring entries (see CLAUDE.md "i18n workflow"). Re-run this script to confirm.`,
    );
  }

  process.exitCode = totalMissing > 0 || totalOrphaned > 0 || totalUntranslated > 0 ? 1 : 0;
}

main();

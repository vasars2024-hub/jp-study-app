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

  for (const lang of LANGS) {
    if (lang === 'en') continue;
    missing[lang] = enKeys.filter((k) => catalogs[lang][k] === undefined);
    orphaned[lang] = Object.keys(catalogs[lang]).filter((k) => catalogs.en[k] === undefined);
  }

  const totalMissing = Object.values(missing).reduce((n, a) => n + a.length, 0);
  const totalOrphaned = Object.values(orphaned).reduce((n, a) => n + a.length, 0);

  if (asJson) {
    console.log(JSON.stringify({ missing, orphaned }, null, 2));
  } else if (totalMissing === 0 && totalOrphaned === 0) {
    console.log(`i18n: all ${enKeys.length} English keys are translated in ${LANGS.slice(1).join('/')}. Nothing to do.`);
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
    console.log(
      `To fix: hand the "Missing translations" list above to an assistant and ask it to add ` +
        `ja/zh/ru entries for those exact keys in src/shared/i18n/catalogs.ts, matching the style ` +
        `of neighboring entries (see CLAUDE.md "i18n workflow"). Re-run this script to confirm.`,
    );
  }

  process.exitCode = totalMissing > 0 || totalOrphaned > 0 ? 1 : 0;
}

main();

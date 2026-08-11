/**
 * Finds `t('some.key')` calls whose key exists in NO catalog, including English.
 *
 * Why this exists, and why it is a third check rather than a branch of an
 * existing one (found 2026-08-04 while fixing `docs/KNOWN_ISSUES.md` MAL-7):
 *
 *   - `tools/i18n-check.cjs` compares the four catalogs *against each other*. A
 *     key that is absent from all four is absent from both sides of every
 *     comparison, so it reports nothing. That check answers "is English
 *     translated?", not "does the text the app asks for exist?"
 *   - `tools/i18n-hardcoded-check.cjs` skips any file that adopts i18n — and a
 *     file calling `t()` 27 times adopts it by any measure.
 *
 * So `MalSyncPanel.tsx` shipped with all 27 of its keys undefined. `translate()`
 * falls back to returning the key itself (`shared/i18n/core.ts:94`), which is
 * the right runtime behaviour — a findable bug beats a blank screen — but it
 * means the panel rendered `malSync.title` as its heading, `malSync.connect` on
 * its button, and `malSync.plaintextWarning` in place of the warning that exists
 * so credential storage is never silently downgraded.
 *
 * The scan was clean everywhere else: MalSyncPanel was the only file in
 * src/renderer + src/media + src/main with missing keys, 27 of 27. There is
 * therefore no baseline here and no ratchet — this check is a hard zero, and it
 * should stay that way.
 *
 * Usage: node tools/i18n-missing-key-check.cjs [--json]
 * Exit code 1 if any referenced key is undefined in English.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '..');
const CATALOGS_PATH = path.join(ROOT, 'src', 'shared', 'i18n', 'catalogs', 'all.ts');
const SCAN_DIRS = [
  path.join('src', 'renderer'),
  path.join('src', 'media'),
  path.join('src', 'main'),
];

/**
 * Only literal keys can be checked. `t(\`malSync.error.${code}\`)` is a template
 * and is deliberately skipped — its arms are covered by the catalog's own tests,
 * and guessing at interpolation would produce false failures.
 */
const KEY_CALL = /\bt\(\s*'([a-zA-Z][\w.-]*\.[\w.-]+)'/g;

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

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function scan() {
  const en = loadEnglish();
  const files = SCAN_DIRS.flatMap((d) => {
    const abs = path.join(ROOT, d);
    return fs.existsSync(abs) ? walk(abs) : [];
  });

  const offenders = [];
  for (const file of files) {
    const src = fs
      .readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const keys = [...new Set([...src.matchAll(KEY_CALL)].map((m) => m[1]))];
    const missing = keys.filter((k) => en[k] === undefined);
    if (missing.length > 0) {
      offenders.push({ file: path.relative(ROOT, file).split(path.sep).join('/'), missing });
    }
  }
  return offenders.sort((a, b) => b.missing.length - a.missing.length);
}

function main() {
  const offenders = scan();
  const total = offenders.reduce((n, o) => n + o.missing.length, 0);

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ offenders, total }, null, 2));
  } else if (total === 0) {
    console.log('i18n-missing-key: every t() key referenced in source exists in the English catalog.');
  } else {
    console.log(
      `${total} key(s) are asked for by name and defined nowhere. The app renders the key\n` +
        `itself at the user (shared/i18n/core.ts:94), so this is visible on screen:\n`,
    );
    for (const o of offenders) {
      console.log(`  ${o.file} — ${o.missing.length} key(s):`);
      for (const k of o.missing) console.log(`      ${k}`);
    }
    console.log(
      '\nAdd them to src/shared/i18n/catalogs/en.ts (or a per-language module it spreads in),\n' +
        'then run tools/i18n-check.cjs to fill in ja/zh/ru.',
    );
  }

  process.exitCode = total > 0 ? 1 : 0;
}

module.exports = { scan };

if (require.main === module) main();

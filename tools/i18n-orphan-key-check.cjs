/**
 * Finds English catalog keys that **no source file ever asks for**.
 *
 * Why this exists (pre-sweep D177). Every other i18n gate in this repo asks a
 * question about the catalogs or about a *file*, and none of them can see a key
 * that is fully written, fully translated, and simply never called:
 *
 *   - `i18n-check.cjs` compares the four catalogs against each other. An orphan
 *     is present in all four, so it is maximally green.
 *   - `i18n-hardcoded-check.cjs` asks whether a file adopted `useT()` at all.
 *     A component with **no** `t()` and its own complete key block is not a
 *     partial-adoption case and contributes nothing.
 *   - `partial-i18n-scan.cjs` only scores files that already call `t()`.
 *   - `i18n-dupe-keys.cjs` asks about duplicates within one catalog.
 *
 * So the translation work gets done, ships in every language bundle, and the
 * surface stays English indefinitely with every check passing. Measured on
 * 2026-09-07 this had happened to two whole blocks at once: `mediaProfile.*`
 * (15 keys, the media-study language-profile card) and `vnPanel.duration.*`
 * (2 keys, sitting ten lines from the literals that should have used them).
 *
 * **A high orphan count is NOT the same as dead weight**, which is why this is a
 * ratchet and not a hard zero. Three large and entirely legitimate groups:
 *
 *   1. Keys reached through a dynamic suffix — `` t(`foo.band.${band}`) ``. This
 *      check credits every key whose parent prefix is interpolated somewhere, so
 *      those are counted as used rather than reported.
 *   2. Keys built by concatenation or held on a data object as a *key*
 *      (`titleKey: 'x.y'`), which the literal scan already catches.
 *   3. Keys deliberately held for a surface that is not built yet.
 *
 * (1) is handled; (2) is handled; (3) is what the baseline is for. The number
 * that matters is not the total — it is a **namespace that goes from having a
 * consumer to having none**, which is the D174 shape and the only shape that is
 * always a defect.
 *
 * Usage: node tools/i18n-orphan-key-check.cjs [--json] [--list <prefix>]
 *                                             [--update-baseline]
 * Exit code 1 if any namespace exceeds its recorded orphan count.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const I18N_DIR = path.join(SRC, 'shared', 'i18n');
const BASELINE_PATH = path.join(__dirname, 'i18n-orphan-key-baseline.json');

/**
 * The catalogs themselves are where keys are DECLARED, so a key appearing there
 * is not a consumer. `__tests__` is excluded for the opposite reason a test
 * would suggest: a test naming a key does not make the product use it, and
 * counting it would let a component be deleted while its keys still read as
 * live. `__devharness__` never ships.
 */
const EXEMPT_DIRS = ['node_modules', 'dist', '.vite', 'out', '__devharness__'];

/** A path under here declares keys; it never consumes them. */
function isCatalogSource(file) {
  return file.startsWith(I18N_DIR + path.sep);
}

function isTestFile(file) {
  return file.includes(`${path.sep}__tests__${path.sep}`) || /\.test\.[tj]sx?$/.test(file);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (EXEMPT_DIRS.includes(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (/\.(ts|tsx|cjs|mjs|js|jsx)$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * Every key the English side declares, across `catalogs/en.ts` and the seven
 * sub-catalogs it composes. Read as text rather than imported: these are
 * TypeScript modules with a build step, and a text read cannot be defeated by a
 * lazy loader.
 */
function collectEnglishKeys() {
  const keys = new Map(); // key -> declaring file, relative
  for (const file of walk(I18N_DIR)) {
    if (path.basename(file) !== 'en.ts') continue;
    const text = fs.readFileSync(file, 'utf8');
    for (const line of text.split('\n')) {
      const m = /^\s+'([^']+)'\s*:/.exec(line);
      if (m) keys.set(m[1], path.relative(ROOT, file).replace(/\\/g, '/'));
    }
  }
  return keys;
}

/**
 * Every prefix a file composes a key from.
 *
 * The third form is not optional and its absence made the first run of this
 * check useless: `scraper/strings.ts` does `const SHARED_PREFIX = 'scrApp.'`
 * and then `SHARED_PREFIX + key`, which reported all **602** `scrApp.*` keys as
 * orphans when every one of them is reached through `sx()`. A prefix held in a
 * named constant is the normal way to write this, not an exotic case.
 */
function collectDynamicPrefixes(text, into) {
  // `t(`some.prefix.${...` — the prefix runs back to the opening backtick or quote.
  const re = /[`'"]([\w.]*\.)\$\{/g;
  let m;
  while ((m = re.exec(text))) into.add(m[1]);
  // `'some.prefix.' + x` and `'some.prefix.'.concat(` — inline concatenation.
  const re2 = /['"`]([\w.]*\.)['"`]\s*(?:\+|\.concat\()/g;
  while ((m = re2.exec(text))) into.add(m[1]);
  // `const PREFIX = 'some.prefix.'` used anywhere as `PREFIX +` or `${PREFIX}`.
  const re3 = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*string\s*)?=\s*['"`]([\w.]*\.)['"`]/g;
  while ((m = re3.exec(text))) {
    const [, name, prefix] = m;
    const used = new RegExp(`\\b${name}\\s*\\+|\\$\\{${name}\\}`).test(text);
    if (used) into.add(prefix);
  }
}

/** The namespace a key is reported under — its first two segments, or its first. */
function namespaceOf(key) {
  const parts = key.split('.');
  return parts.length > 1 ? `${parts[0]}.${parts[1]}` : parts[0];
}

function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const update = args.includes('--update-baseline');
  const listAt = args.indexOf('--list');
  const listPrefix = listAt >= 0 ? args[listAt + 1] : null;

  const declared = collectEnglishKeys();

  // One pass over every consuming file: collect the literal text and the set of
  // interpolated prefixes. Concatenating the sources is deliberate — a key is
  // used if ANY file asks for it, and which file does not change the verdict.
  const consumers = walk(SRC).filter((f) => !isCatalogSource(f) && !isTestFile(f));
  const dynamicPrefixes = new Set();
  const haystack = [];
  for (const file of consumers) {
    const text = fs.readFileSync(file, 'utf8');
    collectDynamicPrefixes(text, dynamicPrefixes);
    haystack.push(text);
  }
  const blob = haystack.join('\n');

  // A literal mention in any form: 'k', "k", `k`, or as the tail of a longer
  // string such as a registry entry's `titleKey: 'k'`. Quote-delimited on both
  // sides so `a.b` does not credit `a.bc`.
  const literal = new Set();
  const literalRe = /['"`]([\w.$-]+)['"`]/g;
  let m;
  while ((m = literalRe.exec(blob))) literal.add(m[1]);

  const orphans = [];
  for (const [key, declaredIn] of declared) {
    if (literal.has(key)) continue;
    let dynamic = false;
    for (const prefix of dynamicPrefixes) {
      if (prefix && key.startsWith(prefix)) { dynamic = true; break; }
    }
    if (dynamic) continue;
    orphans.push({ key, declaredIn, namespace: namespaceOf(key) });
  }

  const byNamespace = new Map();
  for (const o of orphans) byNamespace.set(o.namespace, (byNamespace.get(o.namespace) ?? 0) + 1);

  if (listPrefix) {
    const hits = orphans.filter((o) => o.key.startsWith(listPrefix));
    for (const o of hits) console.log(`${o.key}  (${o.declaredIn})`);
    console.log(`\n${hits.length} orphan key(s) under "${listPrefix}".`);
    return 0;
  }

  const baseline = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : { namespaces: {} };

  const regressions = [];
  const improvements = [];
  for (const [ns, count] of byNamespace) {
    const allowed = baseline.namespaces[ns] ?? 0;
    if (count > allowed) regressions.push({ namespace: ns, count, allowed });
  }
  for (const [ns, allowed] of Object.entries(baseline.namespaces)) {
    const count = byNamespace.get(ns) ?? 0;
    if (count < allowed) improvements.push({ namespace: ns, count, allowed });
  }

  if (update) {
    const namespaces = {};
    for (const ns of [...byNamespace.keys()].sort()) namespaces[ns] = byNamespace.get(ns);
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ total: orphans.length, namespaces }, null, 2)}\n`,
      'utf8',
    );
    console.log(`Baseline written: ${orphans.length} orphan keys in ${byNamespace.size} namespaces.`);
    return 0;
  }

  if (asJson) {
    console.log(JSON.stringify({ total: orphans.length, regressions, improvements, orphans }, null, 2));
    return regressions.length ? 1 : 0;
  }

  console.log(
    `i18n orphan keys: ${orphans.length} of ${declared.size} English keys have no consumer, `
    + `across ${byNamespace.size} namespaces.`,
  );

  for (const r of regressions) {
    console.log(`  REGRESSION  ${r.namespace}: ${r.count} orphaned, baseline allows ${r.allowed}`);
    for (const o of orphans.filter((x) => x.namespace === r.namespace)) {
      console.log(`              ${o.key}`);
    }
  }
  for (const i of improvements) {
    console.log(`  improved    ${i.namespace}: ${i.count}, baseline says ${i.allowed} — re-baseline`);
  }
  if (!regressions.length && !improvements.length) console.log('  No namespace moved. Nothing to do.');

  return regressions.length ? 1 : 0;
}

process.exit(main());

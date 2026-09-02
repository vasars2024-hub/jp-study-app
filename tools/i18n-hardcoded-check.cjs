/**
 * Finds renderer components that render user-facing English and never adopted
 * i18n at all.
 *
 * Why this exists (audit F7). `tools/i18n-check.cjs` compares the four catalogs
 * against each other, so it can only see text that is ALREADY a key. A component
 * that hardcodes every string contributes no keys, and is therefore invisible to
 * it — both gates passed forever while `DictionaryView`, `JitenMiningPanel`,
 * `FieldMappingEditor` and `AnkiCardPreview` (904 lines) rendered English beside
 * `DictionaryResults`, which is fully translated and sits in the same viewport.
 *
 * The heuristic is deliberately narrow, because the failure it guards is narrow:
 * flag a file only when it has a real amount of user-facing text AND zero
 * `useT()` / `t('…')` adoption. A partially-translated file is not reported —
 * that is a different, much noisier problem, and a check that cries wolf gets
 * switched off. This one asks the question F7 actually posed: did this component
 * ever join the translation system?
 *
 * Like tools/i18n-check.cjs this is a ratchet over a recorded baseline, not a
 * zero: the app has a long tail of such files. New ones fail; the baseline is
 * printed on every run so the tail stays visible, and shrinking it is real work.
 *
 * Usage: node tools/i18n-hardcoded-check.cjs [--json] [--update-baseline]
 * Exit code 1 if a file not in the baseline renders hardcoded UI text.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SCAN_DIRS = [path.join('src', 'renderer'), path.join('src', 'media')];
const BASELINE_PATH = path.join(__dirname, 'i18n-hardcoded-baseline.json');

// A file needs at least this many user-facing literals before absence of i18n is
// a finding rather than noise.
//
// Measured against the four components audit F7 named, at the commit before
// they were converted: AnkiCardPreview 7, DictionaryView 14, JitenMiningPanel
// 19, FieldMappingEditor 30. Six clears all four with margin. (An earlier draft
// of this file guessed "10, 22, 30 and 8" — those numbers were never measured
// and two of them were wrong.)
const MIN_STRINGS = 6;

/** Attributes whose string value is read by a user or a screen reader. */
const UI_ATTRS = ['placeholder', 'title', 'aria-label', 'alt', 'label'];

/**
 * Trees that are outside the app-chrome i18n sweep *by decision*, not by
 * neglect. Skipped entirely so the reported number means "translation backlog"
 * rather than "files containing English".
 *
 *   __devharness__ — dev-only mounts. `vite build` emits `dist/index.html`
 *     alone, so none of this ships (TASKS.md, Phase 3/3.5 harness note).
 *   blanc          — "Panel strings are plain English like every other Blanc
 *     panel (Blanc is deliberately outside the app-chrome i18n sweep)"
 *     (TASKS.md, Blanc Toolbox build-out).
 *
 * Recorded here rather than in the baseline file because a baseline entry reads
 * as "known debt"; these are not debt, and lumping them in overstated the
 * backlog by a third when this check was first run.
 */
const EXEMPT_DIRS = ['__devharness__', 'blanc'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      if (EXEMPT_DIRS.includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Strip what must not be searched: comments, imports, and `className=`-style
 * machine strings. Crude on purpose — this is a smell detector, not a parser.
 */
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/^\s*import[\s\S]*?from\s+'[^']*';$/gm, '')
    .replace(/className=(?:"[^"]*"|\{`[^`]*`\}|\{[^}]*\})/g, '')
    .replace(/\bclass(?:Name)?:\s*'[^']*'/g, '');
}

/** Words that make a literal look like copy rather than an id or a css token. */
function looksLikeSentence(text) {
  const trimmed = text.trim();
  if (trimmed.length < 4) return false;
  if (!/[A-Za-z]{2}/.test(trimmed)) return false;
  // kebab/snake/camel ids, urls, css values, single tokens
  if (/^[a-z0-9]+([-_][a-z0-9]+)+$/.test(trimmed)) return false;
  if (/^https?:\/\//.test(trimmed)) return false;
  if (!/\s/.test(trimmed) && !/^[A-Z]/.test(trimmed)) return false;
  return true;
}

function countUiStrings(src) {
  const hits = [];

  // JSX text nodes: >Some words<
  //
  // Code punctuation is excluded from the body deliberately. Without that,
  // `useState<string>('')` … `useState<` matches as one "text node" spanning
  // the generics, and the check reports a 114-string offender whose samples are
  // all source code. Newlines ARE allowed: a label sitting above its own
  // <select> is the single most common shape in these files.
  for (const m of src.matchAll(/>([^<>{};=()]+)</g)) {
    if (looksLikeSentence(m[1])) hits.push(m[1].trim());
  }

  // Quoted string literals anywhere in the file.
  //
  // The text-node sweep alone is not enough, and measuring proved it: of the
  // four components audit F7 named, it caught FieldMappingEditor (19) and
  // AnkiCardPreview (6) but scored DictionaryView 0 and JitenMiningPanel 4.
  // DictionaryView keeps almost all its copy inside JSX expression containers
  // (`{isZh ? 'Chinese' : 'Japanese'}`), which by definition sit between braces
  // and never between > and <. A status string built in an event handler
  // (`setStatus('No usable cards…')`) is invisible to it for the same reason,
  // and CLAUDE.md names exactly that case as one that must go through t().
  for (const re of [/'([^'\\\n]{4,})'/g, /"([^"\\\n]{4,})"/g]) {
    for (const m of src.matchAll(re)) {
      if (looksLikeSentence(m[1])) hits.push(m[1].trim());
    }
  }

  // Attributes are already covered by the literal sweep above; this keeps them
  // named so the intent survives a future edit to either regex.
  void UI_ATTRS;

  return [...new Set(hits)];
}

/**
 * Does this file route its text through *a* string system?
 *
 * `sx(` is counted alongside `t(` — added 2026-08-04 after a dispatched agent
 * pointed out the omission. The Scraper app deliberately does not join the
 * shared catalogs yet: `src/renderer/components/scraper/strings.ts:3-10` states
 * the deferral and its reason (~400 strings x 4 languages, while the surfaces
 * are still shells), keeps every string in one table, and enforces "THE ONE
 * RULE: never put a literal string in JSX". Those files are on a *different*
 * system, not on none — matching only `t(`/`useT(` reported ~30 of them as
 * never having adopted i18n, which is the same overstatement as counting
 * `blanc/` and `__devharness__/`.
 */
function adoptsI18n(src) {
  return /\buseT\s*\(/.test(src) || /\bt\(\s*['"`]/.test(src) || /\bsx\(\s*['"`]/.test(src);
}

/**
 * Read the baseline as `{ path: recordedCount }`.
 *
 * The file used to be a bare array of paths, and a bare array makes baselining a
 * pure loosening: once a file is listed, thirty more hardcoded strings can be
 * added to it and no gate notices. Recording the COUNT makes the list a ratchet
 * in both directions — a baselined file may shrink or hold, never grow.
 *
 * The array form is still accepted (count `null` = unknown, no growth check), so
 * an older checkout or a hand-edited list does not hard-fail.
 */
function readBaseline() {
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  if (Array.isArray(raw)) return new Map(raw.map((f) => [f, null]));
  return new Map(Object.entries(raw));
}

/**
 * A baseline written from a dirty tree is not a claim about the branch.
 *
 * Measured 2026-09-02: the committed baseline held 6 files, and a clean checkout
 * of the same commit reported 33 — 27 "fresh" offenders that failed the vitest
 * gate for everyone whose tree was clean. All 27 were `M` in the tree the
 * baseline was generated from, each carrying an uncommitted partial i18n
 * conversion; `adoptsI18n()` needs only one `t(` to clear a file, so the working
 * copies passed while the committed blobs did not. That is the same defect the
 * 2026-08-12 boss audit recorded one gate over ("does not pass its own i18n gate
 * when checked out clean"), and it cost this branch its gate for two days.
 *
 * So `--update-baseline` refuses while any scanned file is dirty. Commit the
 * conversions first, then record what HEAD actually contains.
 *
 * Returns a list of dirty scanned paths, or null when git cannot answer (a
 * tarball, a non-repo CI checkout) — in which case the caller warns and writes,
 * because refusing on the absence of git would block the honest case too.
 */
function dirtyScannedPaths() {
  let out;
  try {
    out = execFileSync('git', ['status', '--porcelain', '--', ...SCAN_DIRS], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
  return out
    .split('\n')
    .map((l) => l.slice(3).trim().replace(/^"|"$/g, ''))
    .filter((p) => p.endsWith('.tsx'));
}

function main() {
  const asJson = process.argv.includes('--json');
  const updating = process.argv.includes('--update-baseline');

  const files = SCAN_DIRS.flatMap((d) => {
    const abs = path.join(ROOT, d);
    return fs.existsSync(abs) ? walk(abs) : [];
  });

  const offenders = [];
  for (const file of files) {
    const src = strip(fs.readFileSync(file, 'utf8'));
    if (adoptsI18n(src)) continue;
    const hits = countUiStrings(src);
    if (hits.length < MIN_STRINGS) continue;
    offenders.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      count: hits.length,
      sample: hits.slice(0, 3),
    });
  }
  offenders.sort((a, b) => b.count - a.count);

  if (updating) {
    const dirty = dirtyScannedPaths();
    if (dirty === null) {
      console.log('warning: git could not report working-tree state; writing the baseline anyway.');
    } else if (dirty.length > 0) {
      console.log(
        `REFUSED: ${dirty.length} scanned .tsx file(s) are dirty, so this baseline would\n` +
          'record uncommitted work rather than what the branch contains. Commit them first.\n',
      );
      for (const p of dirty.slice(0, 20)) console.log(`  ${p}`);
      if (dirty.length > 20) console.log(`  … and ${dirty.length - 20} more`);
      process.exitCode = 1;
      return;
    }
    const record = {};
    for (const o of [...offenders].sort((a, b) => a.file.localeCompare(b.file))) record[o.file] = o.count;
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(record, null, 2) + '\n');
    console.log(
      `baseline updated: ${offenders.length} file(s), ` +
        `${offenders.reduce((n, o) => n + o.count, 0)} string(s)`,
    );
    return;
  }

  const baseline = readBaseline();
  const fresh = offenders.filter((o) => !baseline.has(o.file));
  const grown = offenders.filter((o) => {
    const was = baseline.get(o.file);
    return typeof was === 'number' && o.count > was;
  });
  const fixed = [...baseline.keys()].filter((f) => !offenders.some((o) => o.file === f));

  if (asJson) {
    console.log(JSON.stringify({ offenders, fresh, grown, fixed }, null, 2));
  } else if (fresh.length === 0 && grown.length === 0) {
    console.log(
      `i18n-hardcoded: no new component renders UI text without adopting i18n, and no ` +
        `baselined one grew. ${baseline.size} file(s) baselined, ` +
        `${[...baseline.values()].reduce((n, v) => n + (v || 0), 0)} string(s).`,
    );
    if (fixed.length > 0) {
      console.log(
        `\n${fixed.length} baselined file(s) now adopt i18n — remove them from ` +
          `tools/i18n-hardcoded-baseline.json:\n  ${fixed.join('\n  ')}`,
      );
    }
  } else if (fresh.length === 0) {
    console.log('These baselined components GREW more hardcoded UI text. Being on the\n' +
      'baseline records existing debt; it does not license adding to it:\n');
    for (const o of grown) console.log(`  ${o.file} — ${baseline.get(o.file)} -> ${o.count} string(s)`);
  } else {
    console.log(
      'These components render user-facing text and never adopted i18n. The catalog\n' +
        'checker cannot see them, because a file that contributes no keys contributes\n' +
        'nothing to compare (audit F7):\n',
    );
    for (const o of fresh) {
      console.log(`  ${o.file} — ${o.count} string(s)`);
      for (const s of o.sample) console.log(`      ${JSON.stringify(s)}`);
    }
    console.log(
      `\nTo fix: route the strings through useT()/t() per CLAUDE.md "i18n workflow".\n` +
        `If a file is genuinely exempt, run with --update-baseline and say why in the commit.`,
    );
  }

  process.exitCode = fresh.length > 0 || grown.length > 0 ? 1 : 0;
}

/**
 * Scan without printing — so the vitest gate enforces the same rule from the
 * same code, rather than a second copy of the heuristic that can drift.
 */
function scan() {
  const files = SCAN_DIRS.flatMap((d) => {
    const abs = path.join(ROOT, d);
    return fs.existsSync(abs) ? walk(abs) : [];
  });
  const offenders = [];
  for (const file of files) {
    const src = strip(fs.readFileSync(file, 'utf8'));
    if (adoptsI18n(src)) continue;
    const hits = countUiStrings(src);
    if (hits.length < MIN_STRINGS) continue;
    offenders.push({ file: path.relative(ROOT, file).replace(/\\/g, '/'), count: hits.length });
  }
  const baseline = readBaseline();
  return {
    offenders,
    fresh: offenders.filter((o) => !baseline.has(o.file)),
    grown: offenders
      .filter((o) => typeof baseline.get(o.file) === 'number' && o.count > baseline.get(o.file))
      .map((o) => ({ ...o, was: baseline.get(o.file) })),
    fixed: [...baseline.keys()].filter((f) => !offenders.some((o) => o.file === f)),
  };
}

module.exports = { scan, readBaseline, strip, countUiStrings, adoptsI18n, MIN_STRINGS };

if (require.main === module) main();

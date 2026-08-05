/**
 * Finds `toLocale*String()` calls with no locale argument.
 *
 * Why this exists (audit C1-2). `Date.prototype.toLocaleDateString()` with no
 * first argument formats using the **host** locale — Windows' regional setting —
 * not the app's UI language. A Russian UI therefore renders `Wed, Aug 5`, and a
 * Japanese one renders `8/5/2026`. Passing `[]` is the same bug spelled
 * differently: an empty locale list also falls back to the host default.
 *
 * **Neither i18n gate can see this class.** `tools/i18n-check.cjs` compares the
 * four catalogs against each other, and `tools/i18n-hardcoded-check.cjs` asks
 * whether a file adopted `useT()` at all. A date is not a translation key, so it
 * contributes nothing to either — a fully-translated component sitting at 100%
 * catalog coverage can still print its dates in the wrong language forever. All
 * 25 date/time sites this check was written for lived in files that already
 * called `t()` on every string around them.
 *
 * The fix is `LANG_TAGS[lang]` from `shared/i18n/core`, with `lang` from
 * `useT()`; a module-level helper that cannot call a hook takes `lang` as a
 * parameter (see `formatRange` in `notebook/LiveCaptionsPanel.tsx` and
 * `buildUpcomingWeek` in `scraper/pages/ManagementPages.tsx`).
 *
 * Two tiers, because the two halves of this class carry very different stakes:
 *
 *   - **`toLocaleDateString` / `toLocaleTimeString` — hard zero, no baseline.**
 *     These are the user-visible half: a wrong-language weekday or month name is
 *     immediately legible as broken. The tree was taken to zero on 2026-08-05,
 *     so a hard fail costs nothing and cannot rot into a number nobody reads.
 *   - **`toLocaleString` — per-file count ratchet.** Overwhelmingly number
 *     formatting (thousands separators), where the host locale is wrong but
 *     rarely unreadable. 57 sites across 23 files are recorded as accepted debt.
 *     A file gaining a site fails; a file losing one prints a nudge to
 *     re-baseline, so the tail stays visible instead of quietly growing.
 *
 * The ratchet is keyed on *counts per file*, not line numbers, so ordinary edits
 * above a call site do not churn the baseline.
 *
 * Usage: node tools/i18n-locale-arg-check.cjs [--json] [--update-baseline]
 * Exit code 1 if a date/time site exists anywhere, or a file exceeds its
 * recorded `toLocaleString` count.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SCAN_DIR = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(__dirname, 'i18n-locale-arg-baseline.json');

/**
 * Skipped for the same reasons `tools/i18n-hardcoded-check.cjs` skips them:
 * `__devharness__` is dev-only and never ships, and `blanc` is outside the
 * app-chrome i18n sweep by decision. `__tests__` is excluded because a test that
 * asserts on a formatted date wants the host locale pinned, not the UI one.
 */
const EXEMPT_DIRS = ['__devharness__', 'blanc', '__tests__', 'node_modules'];

/** The user-visible half — held at zero. */
const STRICT_METHODS = ['toLocaleDateString', 'toLocaleTimeString'];
/** The number-formatting half — ratcheted over a baseline. */
const RATCHET_METHODS = ['toLocaleString'];

/**
 * A call whose first argument is absent, an empty locale list, or an explicit
 * `undefined` — all three resolve to the host locale.
 *
 * The `undefined` form matters and is easy to miss: a grep for `(` followed by
 * `)`/`,`/`[]` finds 25 date/time sites in this tree, and the real number is 32.
 * The seven it misses all read `toLocaleDateString(undefined, {…})`, and one of
 * them carried a comment claiming it was locale-formatted for exactly the reason
 * it was not.
 */
function bareCallRegex(method) {
  return new RegExp(`\\.${method}\\(\\s*(?:\\[\\s*\\]|undefined)?\\s*[,)]`, 'g');
}

/**
 * Opt-out marker, placed on the call's own line or the line above it:
 *
 *   // i18n-locale-arg-ignore: <reason>
 *
 * For the narrow case where the host locale is *correct* — the formatted string
 * is compared against scraped page text rather than shown to anyone — and for a
 * site that is a real defect but is owned by a tree this run must not modify.
 * A reason is required; the marker without one does not suppress.
 *
 * Deliberately not a baseline file: the reason belongs next to the code, and a
 * reviewer reading the call site sees why it is allowed without going looking.
 * Every ignored site is counted on each clean run so the set stays visible.
 */
const IGNORE_MARKER = /\/\/\s*i18n-locale-arg-ignore:\s*\S+/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXEMPT_DIRS.includes(entry.name)) continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blank out comments so a call quoted in a doc block is not counted as code.
 *
 * Comment bodies are replaced with spaces rather than deleted, which keeps every
 * character index and newline in place — so a match index in the stripped copy
 * is still the right index in the original. Deleting them instead reported line
 * 120 for a call that is actually on line 135, which is worse than no line
 * number at all: it points a reader at unrelated code.
 */
function strip(src) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^([ \t]*)\/\/.*$/gm, blank);
}

function scan() {
  const files = fs.existsSync(SCAN_DIR) ? walk(SCAN_DIR) : [];
  const strict = [];
  const ignored = [];
  const ratchet = new Map();

  for (const file of files) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const raw = fs.readFileSync(file, 'utf8');
    const src = strip(raw);
    // `strip` preserves character positions, so an index into the stripped copy
    // is a valid index into the raw source and the line number is the real one.
    const rawLines = raw.split('\n');
    const lineOf = (index) => src.slice(0, index).split('\n').length;
    // The marker is read from the RAW source: `strip` has already blanked it,
    // since it is itself a comment.
    //
    // Searched on the call's own line, then backwards through the *contiguous*
    // comment block directly above it — so the reason may be a multi-line
    // explanation and the marker need not be the last line of it. A fixed
    // two-line window silently missed a three-line justification.
    const isIgnored = (line) => {
      if (IGNORE_MARKER.test(rawLines[line - 1] ?? '')) return true;
      for (let i = line - 2; i >= 0; i -= 1) {
        const text = (rawLines[i] ?? '').trim();
        if (!text.startsWith('//') && !text.startsWith('*') && !text.startsWith('/*')) break;
        if (IGNORE_MARKER.test(text)) return true;
      }
      return false;
    };

    for (const method of STRICT_METHODS) {
      for (const m of src.matchAll(bareCallRegex(method))) {
        const line = lineOf(m.index);
        const hit = { file: rel, line, method, text: m[0] };
        if (isIgnored(line)) ignored.push(hit);
        else strict.push(hit);
      }
    }
    for (const method of RATCHET_METHODS) {
      const n = [...src.matchAll(bareCallRegex(method))].length;
      if (n > 0) ratchet.set(rel, (ratchet.get(rel) ?? 0) + n);
    }
  }

  strict.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  ignored.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  const counts = Object.fromEntries([...ratchet.entries()].sort((a, b) => a[0].localeCompare(b[0])));

  let baseline = {};
  try {
    baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    // Missing baseline means everything is new — the correct reading for a
    // first run, and --update-baseline is how it gets recorded.
  }

  const grown = [];
  const shrunk = [];
  for (const [file, n] of Object.entries(counts)) {
    const was = baseline[file] ?? 0;
    if (n > was) grown.push({ file, was, now: n });
  }
  for (const [file, was] of Object.entries(baseline)) {
    const now = counts[file] ?? 0;
    if (now < was) shrunk.push({ file, was, now });
  }

  return { strict, ignored, counts, baseline, grown, shrunk };
}

function main() {
  const asJson = process.argv.includes('--json');
  const updating = process.argv.includes('--update-baseline');
  const { strict, ignored, counts, grown, shrunk } = scan();

  if (updating) {
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(counts, null, 2) + '\n');
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    console.log(
      `baseline updated: ${total} bare toLocaleString site(s) in ${Object.keys(counts).length} file(s).`,
    );
    if (strict.length) {
      console.log(
        `\nNOTE: ${strict.length} date/time site(s) are NOT baselined — that tier is a hard\n` +
          `zero and still fails. Fix them with LANG_TAGS[lang].`,
      );
    }
    return;
  }

  const failed = strict.length > 0 || grown.length > 0;

  if (asJson) {
    console.log(JSON.stringify({ strict, ignored, counts, grown, shrunk }, null, 2));
    process.exitCode = failed ? 1 : 0;
    return;
  }

  if (strict.length > 0) {
    console.log(
      'These render a date or time in the HOST locale, not the UI language. A Russian\n' +
        'UI shows "Wed, Aug 5" here. No catalog gate can see this — a date is not a key:\n',
    );
    for (const s of strict) console.log(`  ${s.file}:${s.line} — .${s.method}()`);
    console.log(
      '\nTo fix: import { LANG_TAGS } from shared/i18n/core, take `lang` from useT(),\n' +
        'and pass LANG_TAGS[lang] as the first argument. A module-level helper that\n' +
        'cannot call a hook takes `lang` as a parameter.',
    );
  }

  if (grown.length > 0) {
    console.log(
      `\n${strict.length ? '' : '\n'}These files gained bare toLocaleString() call(s) since the baseline:\n`,
    );
    for (const g of grown) console.log(`  ${g.file} — was ${g.was}, now ${g.now}`);
    console.log(
      '\nPass LANG_TAGS[lang], or run --update-baseline and say why in the commit.',
    );
  }

  if (!failed) {
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    console.log(
      `i18n-locale-arg: no date/time formatting follows the OS locale. ` +
        `${total} number-formatting site(s) in ${Object.keys(counts).length} file(s) baselined, ` +
        `${ignored.length} date/time site(s) explicitly ignored.`,
    );
    for (const g of ignored) console.log(`  ignored: ${g.file}:${g.line} — .${g.method}()`);
    if (shrunk.length > 0) {
      console.log(
        `\n${shrunk.length} baselined file(s) now have fewer bare toLocaleString() calls —\n` +
          `re-run with --update-baseline to lock the improvement in:`,
      );
      for (const s of shrunk) console.log(`  ${s.file} — was ${s.was}, now ${s.now}`);
    }
  }

  process.exitCode = failed ? 1 : 0;
}

module.exports = { scan, strip, bareCallRegex, STRICT_METHODS, RATCHET_METHODS };

if (require.main === module) main();

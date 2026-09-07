/**
 * Pre-sweep class 3b — dynamic i18n keys whose catalog table has fallen behind
 * the string-union type that feeds it.
 *
 * The defect this exists for: the app builds label keys from data, e.g.
 *
 *     t(`verifiedSites.source.${site.source}`)
 *
 * where `site.source` is a `VerifiedSiteSource` union. When someone adds a
 * member to the union and forgets the catalog entry, the UI renders the raw
 * key string — `verifiedSites.source.community` — as visible text, in EVERY
 * language at once.
 *
 * Why no existing gate sees it. `i18n-check.cjs` compares the four locales
 * AGAINST EACH OTHER, so a key missing from all four is unanimously consistent
 * and reports green. A missing-key scan only resolves *static* `t('a.b')`
 * literals and cannot evaluate a template. Both are green while the user reads
 * a dotted identifier off the screen.
 *
 * How the binding is derived, with no type inference and no hand-maintained
 * map: harvest every exported string-union type in the source, harvest the key
 * suffixes under every dynamic `t()` prefix, and bind a prefix to a union when
 * the prefix already covers at least MIN_OVERLAP of that union's members. A
 * table that already spells three of four members plainly IS that union's
 * label table, and the fourth is the gap. The heuristic is deliberately on the
 * conservative side: it can miss a table, but a prefix that shares three
 * members with a union is not a coincidence, so what it does report is real.
 *
 * Usage:  node src/.coordination/presweep/dynamic-i18n-key-scan.cjs [--json]
 * Exit 1 when a bound prefix is missing a member in any locale.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'src');
const I18N = path.join(SRC, 'shared', 'i18n');
const LOCALES = ['en', 'ja', 'ru', 'zh'];

/** A prefix must already spell this many members of a union to be bound to it. */
const MIN_OVERLAP = 2;

/**
 * Suffixes a table adds that are not domain members at all: the filter rows the
 * UI supplies itself. `status.all` is the "All" option of a dropdown, not a
 * `VerifiedSiteStatus`. Kept deliberately tiny.
 *
 * `unknown` and `other` were in this list and had to come out. They are real
 * members of several unions here, and exempting them from the containment test
 * let `connection.grade.*` bind to `SubtitleQualityGrade` — which does not
 * contain `unknown` — and report `connection.grade.unrated` as missing. The
 * true domain is an inline union on the `grade` property of
 * `diagnoseConnectionProfile`'s result, and the catalog matches it exactly.
 * An exemption that hides the one member which would have refuted the binding
 * is how a scan manufactures a defect; these words are ordinary data.
 */
const NOT_DOMAIN_MEMBERS = new Set(['all', 'none', 'any']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/**
 * The domain a call site actually iterates, when it iterates a literal array of
 * the union's own members instead of the union. Returns null when no such array
 * is present, meaning the union stands as the domain.
 *
 * An array counts only if every entry is a member of the union and it covers at
 * least two — that is what distinguishes "this is the domain, narrowed" from an
 * unrelated string array that happens to share a word.
 */
function narrowedDomain(text, members) {
  let found = null;
  for (const match of text.matchAll(/\[\s*((?:'[^']*'\s*,?\s*)+)\]/g)) {
    const entries = [...match[1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (entries.length < 2 || !entries.every((e) => members.has(e))) continue;
    found = found ?? new Set();
    for (const e of entries) found.add(e);
  }
  return found;
}

// ---------------------------------------------------------------- unions ----
// `export type Foo = 'a' | 'b' | 'c';` — single line or wrapped.
const unions = new Map(); // name -> { members:Set, file }
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /export\s+type\s+([A-Za-z0-9_]+)\s*=\s*((?:\s*\|?\s*'[^']*')+)\s*;/g;
  for (const match of text.matchAll(re)) {
    const members = [...match[2].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (members.length < 2) continue;
    unions.set(match[1], { members: new Set(members), file: path.relative(ROOT, file) });
  }
}

// --------------------------------------------------------------- catalog ----
// Every key defined in each locale, including the spread sub-modules under
// src/shared/i18n/<module>/<locale>.ts — a key that arrives by spread is
// invisible to a grep of catalogs/<locale>.ts, which has produced a false
// "0 keys defined" reading in this repo before.
const defined = new Map(LOCALES.map((l) => [l, new Map()])); // locale -> key -> relpath
for (const file of walk(I18N)) {
  const locale = LOCALES.find((l) => path.basename(file) === `${l}.ts`);
  if (!locale) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/^\s*'([A-Za-z0-9_][A-Za-z0-9_.\-]*)'\s*:/gm)) {
    defined.get(locale).set(match[1], path.relative(ROOT, file));
  }
}

// -------------------------------------------------------- dynamic prefixes --
// t(`prefix.${expr}`) — the prefix is everything before the first `${`.
const prefixes = new Map(); // prefix -> Set(relpath)
const exprs = new Map(); // prefix -> Set(interpolated identifier)

/**
 * Every function in the source whose declared return type is a literal union.
 * A helper is the third way a call site narrows a domain, and unlike the other
 * two the narrowing is not visible in the file doing the interpolation:
 * `sortFieldIsAbsent` is typed `'views' | 'date' | null` while its `sort`
 * parameter is the full `YtPlaylistSort`, so `yt.sort.noData.title` and
 * `.unlogged` are keys nothing can ever build.
 */
const returnUnions = new Map(); // fn name -> Set(members)
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  // `[^()]*` for the parameter list rather than a lazy `[\s\S]*?`: the lazy form
  // walks past the end of one function into the NEXT one's return type, which it
  // then attributes to the wrong name. Measured — it reported
  // `emptyYtStore => 'views' | 'date' | null`, a signature that function does not
  // have, by skipping the whole body between them.
  const re = /function\s+([A-Za-z0-9_]+)\s*\([^()]*\)\s*:\s*((?:\s*\|?\s*(?:'[^']*'|null|undefined))+)\s*\{/g;
  for (const match of text.matchAll(re)) {
    const members = [...match[2].matchAll(/'([^']*)'/g)].map((m) => m[1]);
    if (members.length) returnUnions.set(match[1], new Set(members));
  }
}
for (const file of files) {
  if (file.startsWith(I18N)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\bt\(\s*`([A-Za-z0-9_][A-Za-z0-9_.\-]*\.)\$\{([^}]*)\}/g)) {
    if (!prefixes.has(match[1])) prefixes.set(match[1], new Set());
    prefixes.get(match[1]).add(path.relative(ROOT, file));
    // The bare identifier being interpolated, when it is one. Used below to
    // recover a domain the union overstates.
    const expr = match[2].trim();
    if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(expr)) {
      if (!exprs.has(match[1])) exprs.set(match[1], new Set());
      exprs.get(match[1]).add(expr);
    }
  }
}

// ------------------------------------------------------------------ bind ----
const findings = [];
const bound = [];
for (const [prefix, sites] of [...prefixes].sort()) {
  // Suffixes this prefix already spells, in any locale.
  const suffixes = new Set();
  for (const locale of LOCALES) {
    for (const key of defined.get(locale).keys()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      if (rest && !rest.includes('.')) suffixes.add(rest);
    }
  }
  if (suffixes.size === 0) continue; // no table at all — a different defect class

  // Binding requires containment, not merely overlap. Every suffix the table
  // already spells must itself be a member of the union — that is what makes
  // "this table IS that union's labels" a conclusion instead of a guess.
  //
  // Overlap alone is far too loose and was measured to be so: at MIN_OVERLAP
  // with no containment test this bound `palette.section.*` to `MiniAppId` and
  // `lexicon.wild.state.*` to `AgentShellPhase` purely because generic member
  // names like `loading`/`error`/`clipboard` recur across unrelated unions. It
  // reported 75 keys, most of them false. Containment cuts that to the tables
  // that genuinely are the union's own.
  const judged = [...suffixes].filter((s) => !NOT_DOMAIN_MEMBERS.has(s));
  let best = null;
  let tied = false;
  for (const [name, union] of unions) {
    if (!judged.every((s) => union.members.has(s))) continue;
    const overlap = judged.filter((m) => union.members.has(m)).length;
    if (overlap < MIN_OVERLAP) continue;
    // Prefer the tightest union that still contains the table: a union with
    // fewer extra members is the more specific — and so more likely — domain.
    if (!best || union.members.size < best.union.members.size) { best = { name, union, overlap }; tied = false; }
    else if (union.members.size === best.union.members.size && name !== best.name) tied = true;
  }
  if (!best || tied) continue;

  bound.push({ prefix, union: best.name, overlap: best.overlap });
  // A member the call site compares against by hand never reaches the template,
  // so its absence from the catalog is correct rather than a gap. Measured:
  // DeckWorkbench guards `if (plan.verdict !== 'ok')` before building the key,
  // and MediaProviderPanel branches on `plan.status === 'ready'`. Both were
  // reported as defects until this ran, and both would have been false rows.
  const callSiteText = [...sites].map((rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')).join('\n');
  // Third narrowing form, and the most precise one: the interpolated identifier
  // is assigned from a helper whose declared return type is narrower than the
  // union its parameter takes.
  //
  // When it resolves it WINS OUTRIGHT over the literal-array heuristic, and that
  // ordering is load-bearing. Unioning the two signals kept `yt.sort.noData.title`
  // alive, because the same file also declares
  // `SORT_OPTS: YtPlaylistSort[] = ['playlist','views','date','title','unlogged']`
  // for the sort dropdown — a real domain, but of a DIFFERENT key family. The
  // array heuristic reads the whole file and cannot tell the two apart; the
  // expression's own type can.
  let narrowed = null;
  for (const expr of exprs.get(prefix) ?? []) {
    const assign = callSiteText.match(
      new RegExp(`\\b${expr}\\s*=\\s*(?:useMemo\\s*\\(\\s*\\(\\)\\s*=>\\s*)?([A-Za-z0-9_]+)\\s*\\(`),
    );
    const fnUnion = assign && returnUnions.get(assign[1]);
    if (fnUnion) narrowed = new Set([...(narrowed ?? []), ...fnUnion]);
  }
  if (!narrowed) narrowed = narrowedDomain(callSiteText, best.union.members);
  for (const member of best.union.members) {
    if (NOT_DOMAIN_MEMBERS.has(member)) continue;
    const literal = member.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`[!=]==\\s*'${literal}'|'${literal}'\\s*[!=]==`).test(callSiteText)) continue;
    // The other way a call site narrows the domain: it iterates an explicit
    // literal array rather than the union. BlancShell's reset buttons map over
    // `['general','layout','search','keyboard-shortcuts'] as ToolboxSettingsCategory[]`,
    // and DictionaryImportCard maps over a `FILE_KINDS` const that deliberately
    // omits the machine-initiated `relabel`. In both the array IS the domain, so
    // a member it leaves out is correctly absent from the catalog. If any such
    // array is present, treat the union of those arrays as the real domain.
    if (narrowed && !narrowed.has(member)) continue;
    const missing = LOCALES.filter((l) => !defined.get(l).has(prefix + member));
    if (missing.length === 0) continue;
    findings.push({
      key: prefix + member,
      union: best.name,
      unionFile: best.union.file,
      missing,
      sites: [...sites].sort(),
    });
  }
}

const report = { prefixesScanned: prefixes.size, unionsHarvested: unions.size, bound: bound.length, findings };

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`dynamic t() prefixes: ${prefixes.size}   string unions: ${unions.size}   bound: ${bound.length}`);
  if (findings.length === 0) {
    console.log('No bound prefix is missing a member. Nothing to report.');
  } else {
    console.log(`\n${findings.length} key(s) a shipped code path can build and no locale defines:\n`);
    for (const f of findings) {
      console.log(`  ${f.key}`);
      console.log(`    domain  ${f.union} (${f.unionFile})`);
      console.log(`    missing ${f.missing.join(', ')}`);
      console.log(`    built   ${f.sites.join(', ')}`);
    }
  }
}

process.exitCode = findings.length ? 1 : 0;

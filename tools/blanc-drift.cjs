/**
 * Blanc drift alarm — reports where Study OS has grown a surface that Blanc does
 * not cover, so "Update Blanc" is a deterministic work-list instead of a fresh
 * audit every time.
 *
 * Modelled on tools/i18n-check.cjs: plain node, no build step, exit code 1 when
 * something needs attention so it can gate CI the same way.
 *
 * What it will NOT do, deliberately (see BLANC_REFINEMENT_PLAN.md):
 *   - report a surface as covered because a file exists;
 *   - count a tab-routed bail-out to a Study OS tab as coverage;
 *   - count a Blanc branch that renders a Study OS `*View` as coverage. Those
 *     are Pillar 0 violations and are reported as `chrome-violation`.
 *
 * Usage: node tools/blanc-drift.cjs [--json]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DESKTOP_PATH = path.join(ROOT, 'src', 'shared', 'desktop.ts');
const SHELL_PATH = path.join(ROOT, 'src', 'renderer', 'components', 'blanc', 'BlancShell.tsx');
const VIEWS_DIR = path.join(ROOT, 'src', 'renderer', 'views');
const MANIFEST_PATH = path.join(ROOT, 'blanc-coverage.json');

const read = (p) => fs.readFileSync(p, 'utf8');

/**
 * The canonical Study OS surface list.
 *
 * Read from the `DESKTOP_WIN_SECTIONS` const array, NOT from the
 * `DesktopWinSection` type. `6b490fc3` (2026-08-24) changed that type to
 * `(typeof DESKTOP_WIN_SECTIONS)[number]`, which still matched the old
 * `export type DesktopWinSection =([\s\S]*?);` regex but contains no string
 * literals — so this returned `[]` for twelve days and every check below,
 * being a `.filter()` over it, found nothing and printed "Clean".
 *
 * A parser that cannot find its subject must REFUSE, never report zero. The
 * union form is still accepted so the tool works on a tree from before that
 * commit, but an empty result is fatal either way.
 */
function studyOsSections() {
  const src = read(DESKTOP_PATH);
  const constArray = src.match(/export const DESKTOP_WIN_SECTIONS = \[([\s\S]*?)\] as const;/);
  const union = src.match(/export type DesktopWinSection =\s*(?!\()([\s\S]*?);/);
  const body = constArray?.[1] ?? union?.[1];
  if (body === undefined) {
    throw new Error(
      'Could not find DESKTOP_WIN_SECTIONS (or a literal DesktopWinSection union) in ' +
        'src/shared/desktop.ts. The Study OS surface list is this tool\'s denominator; ' +
        'without it every check below is vacuous.',
    );
  }
  const ids = [...body.matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
  if (ids.length === 0) {
    throw new Error(
      'DESKTOP_WIN_SECTIONS parsed to ZERO sections. This is the failure mode that made this ' +
        'tool report "Clean" from 2026-08-24 to 2026-09-06: with no sections, unclassified, ' +
        'pending and brokenClaims are all filters over an empty array. Refusing rather than ' +
        'passing — fix the parser, do not trust the all-clear.',
    );
  }
  return ids;
}

/**
 * `LEGACY_WIN_SECTION_ALIASES` — section ids that no longer render anything and
 * the live section each one now means.
 *
 * Needed because every other check here is a `.filter()` over the LIVE section
 * list, so a manifest entry keyed on a retired id is structurally invisible: it
 * can claim `covered` forever and no check will ever look at it. `notebook` was
 * exactly that after the Files app absorbed it.
 *
 * Returns `null` (rather than `{}`) when the declaration is absent, so the
 * caller can say the alias check is disabled instead of reporting a confident
 * zero — the same distinction the sections parser draws above.
 */
function legacyAliases() {
  const src = read(DESKTOP_PATH);
  const m = src.match(/LEGACY_WIN_SECTION_ALIASES: Readonly<Record<string, DesktopWinSection>> = \{([\s\S]*?)\};/);
  if (!m) return null;
  const pairs = [...m[1].matchAll(/([a-z-]+):\s*'([a-z-]+)'/g)];
  // Zero aliases is legitimate — a tree where no section has been retired yet.
  // Zero aliases parsed out of a body that plainly HAS content is not: that is
  // the declaration having changed shape under the regex, which is exactly how
  // the sections parser silently returned [] for twelve days. Distinguish the
  // two by whether anything is actually written between the braces.
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').trim();
  if (pairs.length === 0 && body !== '') {
    throw new Error(
      'LEGACY_WIN_SECTION_ALIASES has content but parsed to ZERO aliases, so the stale-entry ' +
        'check would silently pass. Refusing rather than reporting no orphans — this is the ' +
        'same blind-parser failure that made this tool print "Clean" for twelve days.',
    );
  }
  return Object.fromEntries(pairs.map((x) => [x[1], x[2]]));
}

/** Ids in the `BLANC_TOOL_IDS` array. */
function blancToolIds() {
  const src = read(SHELL_PATH);
  const m = src.match(/const BLANC_TOOL_IDS: BlancToolId\[\] = \[([\s\S]*?)\];/);
  if (!m) throw new Error('Could not find BLANC_TOOL_IDS in BlancShell.tsx');
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
}

/**
 * Every `renderBlancTool` branch, with the component it renders. A branch whose
 * component ends in `View` is a Pillar 0 violation, not coverage.
 */
function renderBranches() {
  const src = read(SHELL_PATH);
  const m = src.match(/function renderBlancTool\([\s\S]*?\n}/);
  if (!m) throw new Error('Could not find renderBlancTool in BlancShell.tsx');
  const body = m[0];
  const branches = new Map();
  for (const x of body.matchAll(/tool === '([a-z-]+)'\)\s*return\s*<([A-Za-z]+)/g)) {
    branches.set(x[1], x[2]);
  }
  // The fallback `return <X />` at the end of the function covers the last id.
  const fallback = body.match(/\n\s*return <([A-Za-z]+)\s*\/>;\s*\n}/);
  if (fallback) branches.set('__fallback__', fallback[1]);
  return branches;
}

/** Study OS views that Blanc reaches by switching tabs rather than rendering a panel. */
function tabRoutedTools() {
  const src = read(SHELL_PATH);
  const ids = new Set();
  // e.g. `if (tool === 'media') { setTab('media'); ... }`
  for (const x of src.matchAll(/tool === '([a-z-]+)'[^\n]*\n?[^\n]*setTab\(/g)) ids.add(x[1]);
  for (const x of src.matchAll(/openTabForTool\('([a-z-]+)'\)/g)) ids.add(x[1]);
  return [...ids];
}

/** `*View.tsx` files under src/renderer/views. */
function studyOsViews() {
  return fs
    .readdirSync(VIEWS_DIR)
    .filter((f) => f.endsWith('.tsx'))
    .map((f) => f.replace(/\.tsx$/, ''));
}

/** Does any Blanc file import Study OS window furniture? */
function chromeImports() {
  const blancDir = path.join(ROOT, 'src', 'renderer', 'components', 'blanc');
  const hits = [];
  for (const f of fs.readdirSync(blancDir).filter((x) => x.endsWith('.tsx'))) {
    const src = read(path.join(blancDir, f));
    // Only flag real imports, not the rule's own prose in a comment.
    for (const line of src.split('\n')) {
      if (!/^\s*import\b/.test(line)) continue;
      if (/\b(AppChrome|MenuBar|StatusBar)\b/.test(line)) hits.push(`${f}: ${line.trim()}`);
    }
  }
  return hits;
}

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `Missing ${path.basename(MANIFEST_PATH)}. It records each Study OS surface as ` +
        `covered / deliberately-excluded / pending; without it every surface reads as unclassified.`,
    );
  }
  return JSON.parse(read(MANIFEST_PATH));
}

function main() {
  const asJson = process.argv.includes('--json');
  const manifest = loadManifest();
  const sections = studyOsSections();
  const toolIds = blancToolIds();
  const branches = renderBranches();
  const tabRouted = tabRoutedTools();
  const views = studyOsViews();

  const classified = manifest.sections ?? {};

  /** A Study OS section nobody has classified — the actual drift alarm. */
  const unclassified = sections.filter((s) => !classified[s]);

  /** Classified `pending` — known gaps, the work-list. */
  const pending = sections.filter((s) => classified[s]?.status === 'pending');

  /**
   * Claimed covered but the claim does not hold up. Coverage must name either a
   * real `BLANC_TOOL_IDS` entry or a Blanc tab surface — a bare `covered` with
   * nothing behind it is exactly the "a file exists, therefore it is covered"
   * conclusion this script is meant to prevent.
   */
  const brokenClaims = sections.filter((s) => {
    const entry = classified[s];
    if (!entry || entry.status !== 'covered') return false;
    if (entry.blancToolId) return !toolIds.includes(entry.blancToolId);
    return !entry.blancSurface;
  });

  /**
   * Manifest entries that name no live Study OS section.
   *
   * Split by whether the id is a known legacy alias, because the two mean
   * different things. A NON-alias orphan is simply a stale entry. An alias
   * orphan is worse when it claims coverage: a persisted desktop window with
   * that section id still opens, resolves to the alias target, and the manifest
   * says the surface is covered while the target may not be.
   */
  const aliases = legacyAliases();
  const isCovered = (id) => classified[id]?.status === 'covered';
  const orphans = Object.keys(classified).filter((id) => !sections.includes(id));
  const staleEntries = orphans.filter((id) => !aliases || !aliases[id]);
  const misleadingAliases = orphans
    .filter((id) => aliases && aliases[id] && isCovered(id) && !isCovered(aliases[id]))
    .map((id) => `${id} → ${aliases[id]} (claims covered; ${aliases[id]} is ${classified[aliases[id]]?.status ?? 'unclassified'})`);
  const benignAliases = orphans
    .filter((id) => aliases && aliases[id] && !misleadingAliases.some((m) => m.startsWith(`${id} `)))
    .map((id) => `${id} → ${aliases[id]}`);

  /** Pillar 0: a render branch that returns a Study OS `*View`. */
  const chromeViolations = [...branches.entries()]
    .filter(([, component]) => /View$/.test(component))
    .map(([tool, component]) => `${tool} → <${component} />`);

  /** Pillar 0: a tool that bails out to a Study OS tab is not coverage. */
  const bailOuts = tabRouted;

  const badImports = chromeImports();

  /** Views with no classification mentioning them — informational, not fatal. */
  const viewsMentioned = new Set(
    Object.values(classified).flatMap((e) => (e.studyOsView ? [e.studyOsView] : [])),
  );
  const unmappedViews = views.filter((v) => !viewsMentioned.has(v));

  const report = {
    unclassified,
    pending,
    brokenClaims,
    staleEntries,
    misleadingAliases,
    benignAliases,
    aliasCheckDisabled: aliases === null,
    chromeViolations,
    bailOuts,
    badImports,
    unmappedViews,
    totals: {
      studyOsSections: sections.length,
      blancTools: toolIds.length,
      renderBranches: branches.size,
    },
  };

  const fatal =
    unclassified.length +
    brokenClaims.length +
    staleEntries.length +
    misleadingAliases.length +
    chromeViolations.length +
    badImports.length;

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = fatal > 0 ? 1 : 0;
    return;
  }

  console.log(
    `Blanc drift: ${sections.length} Study OS sections, ${toolIds.length} Blanc tools, ` +
      `${branches.size} render branches.\n`,
  );

  if (unclassified.length) {
    console.log(`UNCLASSIFIED — new Study OS surface, not in blanc-coverage.json (${unclassified.length}):`);
    for (const s of unclassified) console.log(`    ${s}`);
    console.log(
      '  Classify each as covered / deliberately-excluded (with a reason) / pending.\n',
    );
  }

  if (brokenClaims.length) {
    console.log(`BROKEN CLAIMS — marked covered but no matching Blanc tool id (${brokenClaims.length}):`);
    for (const s of brokenClaims) console.log(`    ${s}`);
    console.log('');
  }

  if (staleEntries.length) {
    console.log(`STALE ENTRIES — classify a section that no longer exists (${staleEntries.length}):`);
    for (const s of staleEntries) console.log(`    ${s}`);
    console.log(
      '  Not in DESKTOP_WIN_SECTIONS and not a legacy alias, so every other check here\n' +
        '  skips them. Remove the entry, or alias the id if windows still carry it.\n',
    );
  }

  if (misleadingAliases.length) {
    console.log(
      `STALE ENTRIES — retired section claims coverage its replacement does not have (${misleadingAliases.length}):`,
    );
    for (const v of misleadingAliases) console.log(`    ${v}`);
    console.log(
      '  A persisted window with the retired id still opens and resolves to the target,\n' +
        '  so this reads as covered while the surface the user actually lands on is not.\n',
    );
  }

  if (aliases === null) {
    console.log(
      'NOTE — LEGACY_WIN_SECTION_ALIASES not found in desktop.ts, so the stale-entry check\n' +
        '  could only look for orphans, not resolve them.\n',
    );
  }

  if (chromeViolations.length) {
    console.log(`PILLAR 0 VIOLATIONS — renderBlancTool returns a Study OS view (${chromeViolations.length}):`);
    for (const v of chromeViolations) console.log(`    ${v}`);
    console.log('  Rebuild as a Blanc panel; see BlancStudyPanels.tsx for the pattern.\n');
  }

  if (badImports.length) {
    console.log(`PILLAR 0 VIOLATIONS — Blanc imports Study OS window furniture (${badImports.length}):`);
    for (const v of badImports) console.log(`    ${v}`);
    console.log('');
  }

  if (bailOuts.length) {
    console.log(`TAB BAIL-OUTS — reachable only by switching to a Study OS tab, not coverage (${bailOuts.length}):`);
    for (const v of bailOuts) console.log(`    ${v}`);
    console.log('');
  }

  if (pending.length) {
    console.log(`PENDING — known gaps, the work-list (${pending.length}):`);
    for (const s of pending) {
      const e = classified[s];
      console.log(`    ${s}${e.note ? ` — ${e.note}` : ''}`);
    }
    console.log('');
  }

  if (unmappedViews.length) {
    console.log(`Views not referenced by any manifest entry (informational, ${unmappedViews.length}):`);
    console.log(`    ${unmappedViews.join(', ')}\n`);
  }

  if (fatal === 0) {
    console.log(
      bailOuts.length || pending.length
        ? 'No unclassified drift and no Pillar 0 violations. Pending work above is tracked, not drift.'
        : 'Clean: Blanc covers every classified Study OS surface, with no Pillar 0 violations.',
    );
  }

  process.exitCode = fatal > 0 ? 1 : 0;
}

main();

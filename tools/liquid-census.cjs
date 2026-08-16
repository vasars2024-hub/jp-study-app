/**
 * Liquid census — the source-derived row set for the L0 feature parity ledger.
 *
 * `src/LIQUID_WORKPLACE_TRANSFORMATION_PLAN.md` L0 requires an inventory of routes,
 * controls, commands, settings, tests and visual states per app before any Liquid
 * product code may land. This produces that inventory mechanically, so it can be
 * re-derived instead of trusted, and so drift shows up as a changed number.
 *
 * Why a tool and not a hand-written list: the relay's own bookkeeping rule says a
 * regex sweep over these docs has already produced two false counts. A tool cannot
 * make a count true, but it makes the *definition* of every count explicit and
 * re-runnable, which a prose inventory cannot. Each metric below states exactly what
 * it counts; if a number looks wrong, the pattern is right there to argue with.
 *
 * What it deliberately does NOT do:
 *   - claim a control is reachable. It counts what is rendered, not what a user can
 *     get to. Reachability is the live baseline's job (SS10.1), not the census's.
 *   - treat a shared file as belonging to an app. Every app transitively reaches
 *     src/shared, so files reached by half the entries or more are reported once as
 *     shared core and the rest are PARTITIONED by fewest import hops. Counting by
 *     raw exclusivity instead makes player/video/music read 0 files, because all
 *     three are one MediaCenterView -- an empty app and a shared root look identical.
 *   - score anything. The rubric scores; the census only counts.
 *
 * Usage: node tools/liquid-census.cjs [--json] [--app <section>]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DESKTOP_PATH = path.join(SRC, 'shared', 'desktop.ts');
const APPSECTION_PATH = path.join(SRC, 'renderer', 'components', 'AppSection.tsx');

const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');

/* ------------------------------------------------------------------ sections */

/** Members of the `DesktopWinSection` union — the canonical Study OS surface list. */
function studyOsSections() {
  const m = read(DESKTOP_PATH).match(/export type DesktopWinSection =([\s\S]*?);/);
  if (!m) throw new Error('Could not find the DesktopWinSection union in src/shared/desktop.ts');
  return [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]);
}

/**
 * The `section -> root component` map out of AppSection.tsx's switch, plus the
 * lazy/static import that names the component's file. This is the shared route seam:
 * DesktopShell (in-desktop window) and App (pop-out) both go through it, so a section
 * missing from the switch has no shared route at all — which is itself a census row.
 */
function sectionRoutes() {
  const src = read(APPSECTION_PATH);

  const importPaths = new Map();
  for (const x of src.matchAll(/(?:const|export const)\s+(\w+)\s*=\s*lazy\(\(\)\s*=>\s*import\('([^']+)'\)\)/g)) {
    importPaths.set(x[1], x[2]);
  }
  for (const x of src.matchAll(/^import\s+(\w+)\s+from\s+'([^']+)';/gm)) {
    importPaths.set(x[1], x[2]);
  }
  for (const x of src.matchAll(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm)) {
    for (const name of x[2] && x[1].split(',')) {
      const clean = name.trim().split(/\s+as\s+/).pop().trim();
      if (clean) importPaths.set(clean, x[2]);
    }
  }

  const body = src.slice(src.indexOf('switch (section)'));
  const routes = new Map();
  for (const x of body.matchAll(/case '([a-z-]+)':[\s\S]*?view = (?:\(\s*)?<(\w+)/g)) {
    const [, section, component] = x;
    if (!routes.has(section)) {
      routes.set(section, { component, importPath: importPaths.get(component) ?? null });
    }
  }
  return routes;
}

/**
 * A section whose component is declared inside AppSection.tsx itself (Visualizer) has
 * no import path of its own. Using AppSection.tsx as its entry would hand it every
 * other app's graph, so resolve instead to the first imported component its body
 * renders — for VisualizerWidget that is VizStage, from ./visualizer/VisualizerContent.
 */
function localComponentEntry(component) {
  if (!component) return null;
  const src = read(APPSECTION_PATH);
  const decl = src.match(
    new RegExp(`(?:export\\s+)?(?:function|const)\\s+${component}\\b[\\s\\S]*?\\n}`),
  );
  if (!decl) return null;
  const importPaths = new Map();
  for (const x of src.matchAll(/^import\s*\{([^}]+)\}\s*from\s*'([^']+)';/gm)) {
    for (const name of x[1].split(',')) {
      const clean = name.trim().split(/\s+as\s+/).pop().trim();
      if (clean) importPaths.set(clean, x[2]);
    }
  }
  for (const x of src.matchAll(/^import\s+(\w+)\s+from\s+'([^']+)';/gm)) importPaths.set(x[1], x[2]);
  for (const x of decl[0].matchAll(/<([A-Z]\w+)/g)) {
    const spec = importPaths.get(x[1]);
    if (!spec) continue;
    const resolved = resolveImport(APPSECTION_PATH, spec);
    if (resolved) return resolved;
  }
  return null;
}

/* -------------------------------------------------------------- import graph */

const EXTS = ['.tsx', '.ts', '.jsx', '.js'];

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null; // package import — not ours
  const base = path.resolve(path.dirname(fromFile), spec);
  for (const e of EXTS) {
    if (fs.existsSync(base + e) && fs.statSync(base + e).isFile()) return base + e;
  }
  if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
    for (const e of EXTS) {
      const idx = path.join(base, 'index' + e);
      if (fs.existsSync(idx)) return idx;
    }
  }
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base; // .css etc
  return null;
}

const importCache = new Map();
function importsOf(file) {
  if (importCache.has(file)) return importCache.get(file);
  let src = '';
  try {
    src = read(file);
  } catch {
    importCache.set(file, []);
    return [];
  }
  const specs = new Set();
  for (const x of src.matchAll(/^\s*import\s+(?:[\s\S]*?from\s*)?'([^']+)';/gm)) specs.add(x[1]);
  for (const x of src.matchAll(/\bimport\('([^']+)'\)/g)) specs.add(x[1]);
  for (const x of src.matchAll(/^\s*export\s+(?:\*|\{[\s\S]*?\})\s*from\s*'([^']+)';/gm)) specs.add(x[1]);
  const out = [];
  for (const s of specs) {
    const r = resolveImport(file, s);
    if (r && r.startsWith(SRC) && /\.(tsx?|jsx?)$/.test(r)) out.push(r);
  }
  importCache.set(file, out);
  return out;
}

/** Every src/ file transitively reachable from `entry`, entry included. */
function reachableFrom(entry) {
  const seen = new Set();
  const stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    for (const next of importsOf(f)) if (!seen.has(next)) stack.push(next);
  }
  return seen;
}

/** Reachable set as a file -> import-distance map (BFS), used to attribute ownership. */
function depthsFrom(entry) {
  const depth = new Map([[entry, 0]]);
  let frontier = [entry];
  while (frontier.length) {
    const next = [];
    for (const f of frontier) {
      const d = depth.get(f) + 1;
      for (const n of importsOf(f)) {
        if (!depth.has(n)) {
          depth.set(n, d);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return depth;
}

/* -------------------------------------------------------------------- metrics
 *
 * Every pattern here is stated in the report so the number can be argued with.
 */

const METRIC_DEFS = {
  controls:
    'JSX opening tags that are natively interactive (<button <input <select <textarea ' +
    '<a href) plus any element carrying onClick/onChange/onSubmit/onKeyDown. Counted once ' +
    'per occurrence, over the app OWNED file set only.',
  commands:
    'Distinct `window.api.<name>` members referenced — the app\'s IPC surface, i.e. the ' +
    'calls that can produce an observable side effect in main. Distinct names, not call sites.',
  settings:
    'Distinct settings keys the app reads or writes, matched as `settings.<key>` / ' +
    '`updateSettings({ <key>` / `patchSettings({ <key>`. Undercounts destructured reads by design.',
  tests: 'Test files under src/ whose own import graph reaches at least one EXCLUSIVE file of this app.',
  i18nKeys: "Distinct keys passed to t('...') — the translated string surface.",
  visualStates:
    'Occurrences of the four SS10.1 state words (empty / loading / error / offline) as ' +
    'identifiers or i18n key fragments. A proxy for state branches, NOT a claim each renders.',
};

function countControls(src) {
  const hits = (re) => (src.match(re) ?? []).length;
  return (
    hits(/<(?:button|input|select|textarea)[\s/>]/g) +
    hits(/<a\s[^>]*href=/g) +
    hits(/\bon(?:Click|Change|Submit|KeyDown)=/g)
  );
}

function collect(files, fn) {
  const set = new Set();
  for (const f of files) {
    let src = '';
    try {
      src = read(f);
    } catch {
      continue;
    }
    fn(src, set, f);
  }
  return set;
}

const isTestFile = (f) => /(__tests__|\.test\.|\.spec\.)/.test(f.replace(/\\/g, '/'));

/* ---------------------------------------------------------------------- main */

function main() {
  const asJson = process.argv.includes('--json');
  const only = process.argv.includes('--app')
    ? process.argv[process.argv.indexOf('--app') + 1]
    : null;

  const sections = studyOsSections();
  const routes = sectionRoutes();

  // Resolve each section's entry file and full reachable graph.
  const graphs = new Map();
  for (const s of sections) {
    const route = routes.get(s);
    if (!route) continue;
    const entry = route.importPath
      ? resolveImport(APPSECTION_PATH, route.importPath)
      : localComponentEntry(route.component);
    if (!entry) continue;
    graphs.set(s, { entry, files: reachableFrom(entry), depths: depthsFrom(entry) });
  }

  // Several sections share one root component (player/video/music are all
  // MediaCenterView, distinguished only by initialTab; novels/reading are both
  // ReadingWorkspaceView). Ownership is therefore computed over DISTINCT ENTRY
  // FILES, never over sections — otherwise every shared root reports 0 files and a
  // reader mistakes "three routes into one component" for "an empty app".
  const entries = [...new Set([...graphs.values()].map((g) => g.entry))];
  const entryDepths = new Map(entries.map((e) => [e, depthsFrom(e)]));

  // A file reached by at least half the entries is shared core, not any app's. It is
  // reported once rather than counted 20 times.
  const reachCount = new Map();
  for (const d of entryDepths.values()) {
    for (const f of d.keys()) reachCount.set(f, (reachCount.get(f) ?? 0) + 1);
  }
  const commonThreshold = Math.ceil(entries.length / 2);
  const isCommon = (f) => (reachCount.get(f) ?? 0) >= commonThreshold;

  // Partition the rest: each file belongs to the entry that reaches it in the fewest
  // import hops. Ties go to the entry with the smaller graph, i.e. the more specific
  // app — that is what puts LibraryView's files on Library rather than on the Media
  // shell that embeds it.
  const graphSize = new Map(entries.map((e) => [e, entryDepths.get(e).size]));
  const ownerOf = new Map();
  for (const [f, n] of reachCount) {
    if (isCommon(f) || n === 0) continue;
    let best = null;
    let bestDepth = Infinity;
    for (const e of entries) {
      const d = entryDepths.get(e).get(f);
      if (d === undefined) continue;
      if (d < bestDepth || (d === bestDepth && graphSize.get(e) < graphSize.get(best))) {
        best = e;
        bestDepth = d;
      }
    }
    if (best) ownerOf.set(f, best);
  }
  const commonFiles = [...reachCount.keys()].filter((f) => isCommon(f) && !isTestFile(f));

  // Every test file in src/, with its own graph, so tests can be attributed.
  const allSrcFiles = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules') continue;
        walk(p);
      } else if (/\.(tsx?|jsx?)$/.test(e.name)) allSrcFiles.push(p);
    }
  })(SRC);
  const testFiles = allSrcFiles.filter(isTestFile);
  const testGraphs = new Map(testFiles.map((t) => [t, reachableFrom(t)]));

  const rows = [];
  for (const s of sections) {
    const route = routes.get(s);
    const g = graphs.get(s);
    if (!g) {
      rows.push({
        section: s,
        component: route?.component ?? null,
        entry: null,
        routed: false,
        note: 'NO SHARED ROUTE — absent from the AppSection switch, so it renders only from a host that special-cases it.',
      });
      continue;
    }

    const exclusive = [...g.files].filter((f) => ownerOf.get(f) === g.entry && !isTestFile(f));
    const shared = g.files.size - exclusive.length;
    const sharesRootWith = [...graphs.entries()]
      .filter(([other, og]) => other !== s && og.entry === g.entry)
      .map(([other]) => other);

    let loc = 0;
    let controls = 0;
    for (const f of exclusive) {
      const src = read(f);
      loc += src.split('\n').length;
      controls += countControls(src);
    }

    const commands = collect(exclusive, (src, set) => {
      for (const x of src.matchAll(/\bwindow\.api\.(\w+)/g)) set.add(x[1]);
      for (const x of src.matchAll(/\bapi\.(\w+)\s*\(/g)) set.add(x[1]);
    });
    const settings = collect(exclusive, (src, set) => {
      for (const x of src.matchAll(/\bsettings\.(\w+)/g)) set.add(x[1]);
      for (const x of src.matchAll(/(?:update|patch)Settings\(\s*\{\s*(\w+)/g)) set.add(x[1]);
    });
    const i18nKeys = collect(exclusive, (src, set) => {
      for (const x of src.matchAll(/\bt\('([^']+)'/g)) set.add(x[1]);
    });
    const visualStates = collect(exclusive, (src, set) => {
      for (const x of src.matchAll(/\b(empty|loading|error|offline)\b/gi)) set.add(x[1].toLowerCase());
    });

    const exclusiveSet = new Set(exclusive);
    const tests = testFiles.filter((t) => {
      const tg = testGraphs.get(t);
      for (const f of exclusiveSet) if (tg.has(f)) return true;
      return false;
    });

    rows.push({
      section: s,
      component: route.component,
      entry: rel(g.entry),
      routed: true,
      sharesRootWith,
      files: g.files.size,
      ownedFiles: exclusive.length,
      sharedFiles: shared,
      loc,
      controls,
      commands: commands.size,
      settings: settings.size,
      tests: tests.length,
      i18nKeys: i18nKeys.size,
      ownedFileList: exclusive.map(rel).sort(),
      visualStates: [...visualStates].sort().join('/') || 'none',
    });
  }

  const shown = only ? rows.filter((r) => r.section === only) : rows;

  if (asJson) {
    console.log(JSON.stringify({ generated: new Date().toISOString(), metricDefs: METRIC_DEFS, rows: shown }, null, 2));
    return;
  }

  const routed = rows.filter((r) => r.routed);
  console.log(
    `Liquid census: ${sections.length} Study OS sections, ${routed.length} routed through ` +
      `AppSection.tsx, ${sections.length - routed.length} not.`,
  );
  console.log('');
  const head = ['section', 'component', 'own', 'graph', 'loc', 'ctrl', 'cmd', 'set', 'test', 'i18n', 'states'];
  const w = [12, 26, 5, 7, 6, 5, 4, 4, 5, 5, 28];
  const fmt = (cells) => cells.map((c, i) => String(c).padEnd(w[i])).join('');
  console.log(fmt(head));
  console.log(fmt(w.map((n) => '-'.repeat(n - 1))));
  for (const r of shown) {
    if (!r.routed) {
      console.log(fmt([r.section, r.component ?? '(none)', '-', '-', '-', '-', '-', '-', '-', '-', 'NO SHARED ROUTE']));
      continue;
    }
    console.log(
      fmt([
        r.section,
        r.component,
        r.ownedFiles,
        r.files,
        r.loc,
        r.controls,
        r.commands,
        r.settings,
        r.tests,
        r.i18nKeys,
        r.visualStates,
      ]),
    );
  }
  console.log('');
  // Deduplicated by entry: player/video/music are one MediaCenterView and
  // novels/reading are one ReadingWorkspaceView, so summing over SECTIONS counts those
  // components 3x and 2x. The ledger row set is components, not sections.
  const byEntry = new Map();
  for (const r of routed) if (!byEntry.has(r.entry)) byEntry.set(r.entry, r);
  const uniq = [...byEntry.values()];
  const sum = (k) => uniq.reduce((a, r) => a + r[k], 0);
  console.log(
    `${uniq.length} DISTINCT root components serve those ${routed.length} sections.` +
      ` Deduplicated totals: ${sum('ownedFiles')} owned files, ${sum('loc')} LOC, ` +
      `${sum('controls')} controls, ${sum('commands')} command refs, ${sum('i18nKeys')} i18n keys.`,
  );
  console.log(
    `Shared core excluded from every app (reached by >= ${commonThreshold} of ${entries.length} entries): ` +
      `${commonFiles.length} files.`,
  );
  console.log('');
  console.log('Metric definitions (argue with the pattern, not the number):');
  for (const [k, v] of Object.entries(METRIC_DEFS)) console.log(`  ${k}: ${v}`);
}

main();

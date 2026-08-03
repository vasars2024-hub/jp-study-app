/**
 * Architecture audit — MASTER_PLAN.md §21 ("stop expanding, start engineering"),
 * made repeatable instead of a prose snapshot that goes stale the next morning.
 *
 * Modelled on tools/i18n-check.cjs and tools/blanc-drift.cjs: plain node, no build
 * step, exit code 1 when something needs attention so it can gate CI the same way.
 * Findings are classified in a committed baseline (tools/architecture-baseline.json),
 * so the known backlog stays quiet and anything *new* fails the run — the same
 * contract blanc-coverage.json has.
 *
 * What it checks, and which §21 ask each one serves:
 *
 *   orphan-module        "unused features / unused code" — nothing imports it
 *   test-only-module     shipped code reachable only from its own test
 *   layer-violation      "module boundaries" — shared must not reach into main or
 *                        renderer; main must not reach into renderer
 *   shared-cycle         "duplicate systems" — an import cycle inside src/shared
 *   dead-ipc             "API communication" — a handler no caller ever invokes
 *   phantom-ipc          a caller with no handler (a runtime failure waiting)
 *   duplicate-ipc        the same channel registered twice; the second wins silently
 *   duplicate-storage    "redundant databases" — one storage key written by two modules
 *   duplicate-export     "duplicate functionality" — one exported name from two modules
 *
 * What it deliberately will NOT do:
 *   - guess at intent from a filename;
 *   - report a module as used because a *string* matching its name appears somewhere;
 *   - treat a type-only import as a runtime dependency for layering purposes (it is
 *     still reported, because a shared module naming a renderer type is still a
 *     boundary leak — it just cannot be a cycle at runtime).
 *
 * Usage: node tools/architecture-audit.cjs [--json] [--update-baseline]
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const BASELINE_PATH = path.join(__dirname, 'architecture-baseline.json');

const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
/** Not application code: fixtures, harnesses and generated data have their own rules. */
const SKIP_DIRECTORIES = new Set(['node_modules', '__snapshots__']);

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

/** @returns {string[]} absolute paths of every .ts/.tsx under src/ */
function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
}

const rel = (absolute) => path.relative(ROOT, absolute).split(path.sep).join('/');

const isTest = (relative) =>
  relative.includes('__tests__/')
  || relative.endsWith('.test.ts')
  || relative.endsWith('.test.tsx')
  || relative.includes('/__devharness__/');

/**
 * Declared renderer zones inside `src/main/`.
 *
 * `src/main/city/` is not "the main process" — it is the self-contained Noctis
 * subsystem (188 files: its own docs, assets, engine, service, ipc, rendering and ui)
 * that happens to live there. Its `ui/` and `rendering/` folders are React, are
 * documented as such by their own READMEs, and are imported only by the renderer
 * (`renderer/components/AppSection.tsx` lazy-loads `NoctisWorkspace`). Splitting six
 * files out would scatter a coherent unit to satisfy a path convention.
 *
 * So the zone is declared rather than moved — but narrowly, and with the hazard that
 * actually matters checked instead: no main-process module outside a zone may import
 * one, because that is what would pull React into the main bundle. See the
 * `main-imports-renderer-zone` finding.
 */
const RENDERER_ZONES = ['src/main/city/ui/'];

/**
 * A zone is the declared `ui/` folder plus any `.tsx` under `src/main/` — the React
 * files specifically. Declaring all of `rendering/` was too broad on the first run:
 * `rendering/manifest.ts` and `rendering/world/worldModel.ts` are plain data and
 * geometry that the main-side asset validator legitimately reads, and sweeping them in
 * reported that as a violation.
 */
const inRendererZone = (relative) =>
  RENDERER_ZONES.some((zone) => relative.startsWith(zone))
  || (relative.startsWith('src/main/') && relative.endsWith('.tsx'));

/** `src/shared/x.ts` → `shared`, `src/main/y.ts` → `main`, `src/main.ts` → `main`. */
function layerOf(relative) {
  if (relative === 'src/main.ts') return 'main';
  if (relative === 'src/preload.ts') return 'preload';
  if (relative.startsWith('src/shared/')) return 'shared';
  if (inRendererZone(relative)) return 'renderer';
  if (relative.startsWith('src/main/')) return 'main';
  if (relative.startsWith('src/renderer/')) return 'renderer';
  return 'other';
}

// ---------------------------------------------------------------------------
// Import extraction and resolution
// ---------------------------------------------------------------------------

const IMPORT_PATTERNS = [
  // import x from '…' / import {a} from '…' / import '…' / import type {T} from '…'
  /\bimport\s+(?:type\s+)?(?:[\w*{}\s,]+\s+from\s+)?['"]([^'"]+)['"]/g,
  // export … from '…' / export * from '…'
  /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g,
  // dynamic import('…')
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  // vi.mock('…') — a test mocking a module is still naming it, and treating that as
  // a reference is what keeps a mocked-only module from reading as orphaned.
  /\bvi\.mock\s*\(\s*['"]([^'"]+)['"]/g,
  // new Worker(new URL('./x.ts', import.meta.url)) — how Vite takes a worker entry.
  // Missing this reported `whisperWorker.ts` and `csvParse.worker.ts` as orphans on
  // the first run, while five call sites were spawning them.
  /new\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g,
];

function specifiersIn(source) {
  const out = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) out.add(match[1]);
  }
  return [...out];
}

/** Resolves a relative specifier the way the bundler does. Non-relative → null. */
function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => base + extension),
    ...SOURCE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    if (fs.statSync(candidate).isDirectory()) continue;
    if (!SOURCE_EXTENSIONS.includes(path.extname(candidate))) continue;
    return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Roots — the files that are entered rather than imported
// ---------------------------------------------------------------------------

/** `<script type="module" src="/src/…">` across every html entry in the repo root. */
function htmlRoots() {
  const roots = [];
  for (const name of fs.readdirSync(ROOT)) {
    if (!name.endsWith('.html')) continue;
    const source = fs.readFileSync(path.join(ROOT, name), 'utf8');
    for (const match of source.matchAll(/src=["']\/?(src\/[^"']+)["']/g)) {
      const full = path.join(ROOT, match[1]);
      if (fs.existsSync(full)) roots.push(full);
    }
  }
  return roots;
}

function collectRoots(files) {
  const roots = new Set(htmlRoots().map(rel));
  for (const file of files) {
    const relative = rel(file);
    // Process entry points, and every test — a test is entered by vitest, not imported.
    if (relative === 'src/main.ts' || relative === 'src/preload.ts') roots.add(relative);
    if (isTest(relative)) roots.add(relative);
    // Ambient declaration files are never imported; they are picked up by tsconfig.
    if (relative.endsWith('.d.ts')) roots.add(relative);
  }
  return roots;
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

function findCycles(graph, keep) {
  const cycles = [];
  const state = new Map(); // 0 = unvisited, 1 = on stack, 2 = done
  const stack = [];

  const visit = (node) => {
    if (state.get(node) === 2) return;
    if (state.get(node) === 1) {
      const start = stack.indexOf(node);
      if (start >= 0) cycles.push([...stack.slice(start), node]);
      return;
    }
    state.set(node, 1);
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      if (keep(next)) visit(next);
    }
    stack.pop();
    state.set(node, 2);
  };

  for (const node of graph.keys()) if (keep(node)) visit(node);
  // Distinct cycles only, keyed by their sorted member set.
  const seen = new Set();
  return cycles.filter((cycle) => {
    const key = [...cycle].sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Channel-name literals, with the module that mentions them.
 *
 * Detection is **precise on the call site and tolerant on the other end**, because
 * this repo registers channels three different ways: at the `ipcMain.handle` call
 * with a literal, through a local `bind(channel, handler)` wrapper (`main/mining.ts`
 * does this ~90 times), and with an imported constant (`main/city/ipc/handlers.ts`).
 * A scanner that only understood the first would have reported 34 live `ai:*` and
 * `city:*` channels as missing — which the first run did.
 *
 * So: a finding is only raised from an *explicit literal* call site, and it is only
 * raised when the channel name does not appear **anywhere** on the other side. The
 * cost is sensitivity (a channel named only in a comment counts as present); the
 * benefit is that every finding it does raise is real, which is the only way a
 * baseline-gated check stays worth reading.
 */
const CHANNEL_SHAPE = /^[a-z][\w-]*:[\w:.-]+$/;

function scanIpc(sources) {
  const handlers = new Map(); // channel → [file] — explicit ipcMain.handle only
  const callers = new Map(); // channel → [file] — explicit ipcRenderer.* only
  const pushes = new Map(); // channel → [file] — main → renderer webContents.send
  const mentionedInMain = new Set();
  const mentionedInRenderer = new Set();
  const add = (map, channel, file) => map.set(channel, [...(map.get(channel) ?? []), file]);

  for (const [file, source] of sources) {
    const layer = layerOf(file);
    for (const match of source.matchAll(/ipcMain\.(?:handle|handleOnce|on)\(\s*['"]([^'"]+)['"]/g)) {
      add(handlers, match[1], file);
    }
    for (const match of source.matchAll(/ipcRenderer\.(?:invoke|send|sendSync|on)\(\s*['"]([^'"]+)['"]/g)) {
      add(callers, match[1], file);
    }
    for (const match of source.matchAll(/webContents\.send\(\s*['"]([^'"]+)['"]/g)) {
      add(pushes, match[1], file);
    }
    // Every channel-shaped literal, for the tolerant "does the other side know this
    // name at all?" test. `shared` counts as both sides: that is where channel-name
    // constants live.
    for (const match of source.matchAll(/['"]([a-z][\w-]*:[\w:.-]+)['"]/g)) {
      const channel = match[1];
      if (!CHANNEL_SHAPE.test(channel)) continue;
      if (layer === 'main' || layer === 'shared') mentionedInMain.add(channel);
      if (layer === 'renderer' || layer === 'preload' || layer === 'shared') {
        mentionedInRenderer.add(channel);
      }
    }
  }
  return { handlers, callers, pushes, mentionedInMain, mentionedInRenderer };
}

/**
 * Modules that legitimately name every storage key in the app: the settings catalog
 * and the migration layer exist precisely to enumerate them. Counting them as owners
 * made this check report all 69 keys as duplicated, which is the same as reporting
 * nothing.
 */
const STORAGE_REGISTRY_MODULES = new Set([
  'src/renderer/storage/settingsCatalog.ts',
  'src/renderer/storage/storage.ts',
  'src/renderer/storage/migrationRunner.ts',
  'src/shared/storageMigrationBoundary.ts',
]);

/**
 * Storage keys follow the repo convention `jp-…` / `jp.…`. Matching the convention
 * rather than the call site catches a key declared as a constant, which is how every
 * store in this repo actually writes one.
 *
 * Only *writers* count as owners. Many modules read a key, and that is normal; two
 * modules writing one key is the "redundant database" §21 asks about, because then
 * neither module owns the shape and a change to one silently corrupts the other.
 * Event names (`…-changed`, which travel through `CustomEvent`, not storage) are
 * excluded — a dispatcher and a listener naming the same event is the design.
 */
function scanStorageKeys(sources) {
  const keys = new Map();
  for (const [file, source] of sources) {
    if (isTest(file) || STORAGE_REGISTRY_MODULES.has(file)) continue;
    if (!/\.(?:setItem|removeItem)\s*\(/.test(source)) continue;
    for (const match of source.matchAll(/['"](jp[-.][A-Za-z0-9][\w.-]{2,})['"]/g)) {
      const key = match[1];
      if (key.endsWith('-changed') || key.endsWith('-change')) continue;
      const files = keys.get(key) ?? new Set();
      files.add(file);
      keys.set(key, files);
    }
  }
  return keys;
}

/** Exported value names per module (types excluded — same name, different namespace). */
function scanExports(sources) {
  const names = new Map();
  for (const [file, source] of sources) {
    if (isTest(file)) continue;
    for (const match of source.matchAll(
      /^export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/gm,
    )) {
      const name = match[1];
      const files = names.get(name) ?? new Set();
      files.add(file);
      names.set(name, files);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function audit() {
  const files = walk(SRC);
  const sources = new Map();
  for (const file of files) sources.set(rel(file), fs.readFileSync(file, 'utf8'));

  // Import graph, in repo-relative terms.
  const graph = new Map();
  const importedBy = new Map();
  for (const file of files) {
    const from = rel(file);
    const edges = [];
    for (const specifier of specifiersIn(sources.get(from))) {
      const resolved = resolveSpecifier(file, specifier);
      if (!resolved) continue;
      const to = rel(resolved);
      if (to === from) continue;
      edges.push(to);
      const importers = importedBy.get(to) ?? new Set();
      importers.add(from);
      importedBy.set(to, importers);
    }
    graph.set(from, edges);
  }

  const roots = collectRoots(files);
  const findings = [];
  const finding = (kind, id, detail) => findings.push({ kind, id, detail });

  // --- orphan-module / test-only-module -------------------------------------
  for (const file of files) {
    const relative = rel(file);
    if (roots.has(relative) || isTest(relative)) continue;
    const importers = [...(importedBy.get(relative) ?? [])];
    if (importers.length === 0) {
      finding('orphan-module', relative, 'Nothing imports this module.');
      continue;
    }
    if (importers.every(isTest)) {
      finding(
        'test-only-module',
        relative,
        `Reachable only from tests: ${importers.slice(0, 3).join(', ')}`,
      );
    }
  }

  // --- layer-violation ------------------------------------------------------
  const FORBIDDEN = {
    shared: new Set(['main', 'renderer', 'preload']),
    main: new Set(['renderer']),
    preload: new Set(['renderer']),
  };
  for (const [from, edges] of graph) {
    const fromLayer = layerOf(from);
    if (isTest(from)) continue;
    const forbidden = FORBIDDEN[fromLayer];
    for (const to of edges) {
      // The zone rule has teeth: real main-process code reaching into a declared
      // renderer zone is what would drag React into the main bundle.
      if (fromLayer === 'main' && inRendererZone(to)) {
        finding(
          'main-imports-renderer-zone',
          `${from} -> ${to}`,
          'Main-process code must not import a renderer zone.',
        );
        continue;
      }
      if (!forbidden) continue;
      const toLayer = layerOf(to);
      if (!forbidden.has(toLayer)) continue;
      finding('layer-violation', `${from} -> ${to}`, `${fromLayer} must not import ${toLayer}.`);
    }
  }

  // --- shared-cycle ---------------------------------------------------------
  for (const cycle of findCycles(graph, (node) => layerOf(node) === 'shared' && !isTest(node))) {
    finding('shared-cycle', cycle.join(' -> '), 'Import cycle inside src/shared.');
  }

  // --- IPC ------------------------------------------------------------------
  const { handlers, callers, pushes, mentionedInMain, mentionedInRenderer } = scanIpc(sources);

  for (const [channel, where] of handlers) {
    const registrations = [...new Set(where.filter((file) => !isTest(file)))];
    // Two `ipcMain.handle` calls for one channel is a real defect — Electron keeps the
    // last one and drops the first silently. Two `webContents.send` sites are not:
    // several places legitimately raise the same event.
    if (registrations.length > 1) {
      finding('duplicate-ipc', channel, `Registered in: ${registrations.join(', ')}`);
    }
    if (!mentionedInRenderer.has(channel)) {
      finding('dead-ipc', channel, `Handled in ${registrations[0] ?? where[0]}, never called.`);
    }
  }

  // A push nobody listens for is dead too, and is the easier one to leave behind —
  // deleting the listener does not break a build.
  for (const [channel, where] of pushes) {
    if (mentionedInRenderer.has(channel)) continue;
    const senders = [...new Set(where.filter((file) => !isTest(file)))];
    if (!senders.length) continue;
    finding('dead-ipc', channel, `Sent from ${senders.join(', ')}, nothing listens.`);
  }

  for (const [channel, where] of callers) {
    if (mentionedInMain.has(channel)) continue;
    const callSites = [...new Set(where.filter((file) => !isTest(file)))];
    if (!callSites.length) continue;
    finding('phantom-ipc', channel, `Called from ${callSites.join(', ')}, no handler registered.`);
  }

  // --- duplicate-storage ----------------------------------------------------
  for (const [key, where] of scanStorageKeys(sources)) {
    if (where.size < 2) continue;
    finding('duplicate-storage', key, `Referenced by: ${[...where].sort().join(', ')}`);
  }

  // --- duplicate-export -----------------------------------------------------
  for (const [name, where] of scanExports(sources)) {
    if (where.size < 2) continue;
    finding('duplicate-export', name, `Exported by: ${[...where].sort().join(', ')}`);
  }

  findings.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
  return { findings, moduleCount: files.length };
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { entries: {} };
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
}

function main() {
  const asJson = process.argv.includes('--json');
  const update = process.argv.includes('--update-baseline');
  const { findings, moduleCount } = audit();
  const baseline = loadBaseline();

  const key = (f) => `${f.kind}:${f.id}`;
  const classified = new Map(Object.entries(baseline.entries ?? {}));

  const fresh = findings.filter((f) => !classified.has(key(f)));
  const pending = findings.filter((f) => classified.get(key(f))?.status === 'pending');
  const stale = [...classified.keys()].filter(
    (entry) => !findings.some((f) => key(f) === entry),
  );

  if (update) {
    const entries = {};
    for (const f of findings) {
      entries[key(f)] = classified.get(key(f)) ?? { status: 'pending', note: '' };
    }
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ moduleCount, entries }, null, 2)}\n`,
      'utf8',
    );
    console.log(`architecture: baseline written with ${findings.length} classified finding(s).`);
    return 0;
  }

  if (asJson) {
    console.log(JSON.stringify({ moduleCount, findings, fresh, pending, stale }, null, 2));
    return fresh.length || stale.length ? 1 : 0;
  }

  console.log(`architecture: scanned ${moduleCount} modules, ${findings.length} finding(s).`);
  const byKind = new Map();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  for (const [kind, count] of [...byKind].sort()) {
    const open = findings.filter(
      (f) => f.kind === kind && classified.get(key(f))?.status === 'pending',
    ).length;
    console.log(`  ${kind.padEnd(20)} ${String(count).padStart(4)}  (${open} pending)`);
  }

  if (fresh.length) {
    console.log(`\nUnclassified — new since the baseline (${fresh.length}):`);
    for (const f of fresh.slice(0, 60)) console.log(`  [${f.kind}] ${f.id}\n      ${f.detail}`);
    if (fresh.length > 60) console.log(`  … and ${fresh.length - 60} more`);
    console.log('\nClassify them in tools/architecture-baseline.json, or run with --update-baseline.');
  }
  if (stale.length) {
    console.log(`\nBaseline entries that no longer occur (${stale.length}) — remove them:`);
    for (const entry of stale.slice(0, 40)) console.log(`  ${entry}`);
    if (stale.length > 40) console.log(`  … and ${stale.length - 40} more`);
  }
  if (!fresh.length && !stale.length) {
    console.log(`\nNothing new. ${pending.length} known finding(s) still marked pending.`);
  }
  return fresh.length || stale.length ? 1 : 0;
}

if (require.main === module) process.exit(main());

module.exports = { audit };

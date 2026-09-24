#!/usr/bin/env node
/**
 * Post-package prune for the Windows x64 build.
 *
 * electron-packager copies every production dependency into
 * resources/app/node_modules (~2 GB, 350 packages), but the packaged app only
 * `require`s a handful of them at runtime: main, preload, the utility-process
 * workers and the renderer are all Vite bundles, and the renderer cannot reach
 * node_modules at all (nodeIntegration: false, and the app:// protocol serves
 * only .vite/renderer and resources/public — src/main/appProtocolResolve.ts).
 *
 * The rules below are applied, in order, to a staged build before it is swapped
 * into out/. Each one says why it is safe. Nothing here guesses what main
 * needs: the keep-set is the dependency closure of
 *   (a) every bare specifier the built .vite/build/*.js files pass to
 *       require(), import() or a createRequire()'d function, scanned from the
 *       build output of THIS build, plus
 *   (b) MAIN_RUNTIME_PACKAGES, the same list written down,
 * so a newly externalized dependency is kept automatically.
 *
 * Usage:
 *   node tools/prune-packaged-app.cjs <resources/app dir> [--dry-run]
 * Env:
 *   GUM_KEEP_CUDA=1   keep node-llama-cpp's CUDA backends (see rule below)
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a plain CommonJS build script */

const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

/**
 * What the Node side requires from node_modules, as of the build this was
 * written against. Kept in sync by hand only as documentation — the build
 * scan (a) is authoritative, and anything either list names is kept.
 */
const MAIN_RUNTIME_PACKAGES = [
  // vite.main.config.ts `external`
  'adm-zip',
  'ffmpeg-static', // resolves ffmpeg.exe beside its own index.js
  'node-llama-cpp', // llamaHostWorker / llamaBackend: import('node-llama-cpp')
  'onnxruntime-node', // flashcardTtsWorker + manga OCR in main
  'linkedom',
  '@mozilla/readability',
  'sql.js', // + sql-wasm.wasm via require.resolve
  '7z-wasm', // + 7zz.wasm via require.resolve
  // auto-externalized native module
  'better-sqlite3',
  // bundled, but located on disk via require.resolve:
  'kuromoji', // japaneseTokenizer.ts: <kuromoji>/../dict
  'pdfjs-dist', // pdfRasterize.ts serves build/pdf.mjs + pdf.worker.min.mjs
];

/**
 * Packages removed even though a kept package lists them (optional deps for
 * other targets). `why` is logged and is the safety argument.
 */
function excludedPackages(env) {
  const list = [
    {
      rule: 'foreign-platform-natives',
      match: (n) => /^@node-llama-cpp\/(linux|mac)-/.test(n) || n === '@node-llama-cpp/win-arm64',
      why: 'node-llama-cpp loads @node-llama-cpp/<platform>-<arch>[-gpu] for the running process only (getPrebuiltBinaryPath); this build is win32-x64',
    },
    {
      rule: 'pdfjs-node-canvas',
      match: (n) => n === '@napi-rs/canvas' || n.startsWith('@napi-rs/canvas-'),
      why: "pdfjs-dist's optional canvas is for rendering in Node; this app only serves pdf.mjs to a Chromium window (pdfRasterize.ts), which uses the DOM canvas",
    },
  ];
  if (!env.GUM_KEEP_CUDA) {
    list.push({
      rule: 'llama-cuda',
      match: (n) => n === '@node-llama-cpp/win-x64-cuda' || n === '@node-llama-cpp/win-x64-cuda-ext',
      why:
        "getLlama() (llamaBackend.ts, gpu 'auto') tries cuda only when CUDA is detected on the machine, and a missing prebuilt falls through to vulkan, then CPU. " +
        'This machine has an AMD GPU, so CUDA is never picked; ~540 MB for a backend that cannot run here. GUM_KEEP_CUDA=1 keeps it',
    });
  }
  return list;
}

/** Paths (relative to node_modules) inside KEPT packages that this target never loads. */
const PATH_RULES = [
  {
    rule: 'caches',
    paths: ['.vite', '.cache'],
    why: "Vite's dev-server dep-optimizer cache and tool caches, copied in because they live under node_modules; nothing reads them at runtime",
  },
  {
    rule: 'foreign-platform-natives',
    paths: [
      'onnxruntime-node/bin/napi-v6/darwin',
      'onnxruntime-node/bin/napi-v6/linux',
      'onnxruntime-node/bin/napi-v6/win32/arm64',
    ],
    why: 'onnxruntime-node binding.js loads ../bin/napi-v6/${process.platform}/${process.arch}/ only',
  },
  {
    rule: 'foreign-platform-natives',
    glob: { dir: 'better-sqlite3/prebuilds', keep: ['win32-x64.node'] },
    why: 'better-sqlite3 lib/binding.js picks prebuilds/<platform>-<arch>.node for the running process only',
  },
  {
    rule: 'build-from-source-only',
    paths: ['better-sqlite3/deps', 'better-sqlite3/src', 'better-sqlite3/build/Release/obj'],
    why: 'SQLite/C++ sources and compiler intermediates for node-gyp; the prebuilt .node is what loads',
  },
];

/** File-level rule inside kept packages. */
const DEV_FILE_RULES = [
  {
    rule: 'dev-files',
    test: (name) => /\.(map|d\.ts|d\.mts|d\.cts)$/i.test(name),
    why: 'source maps and type declarations: never required, and main runs without --enable-source-maps',
  },
  {
    rule: 'dev-files',
    test: (name) => /\.(ts|mts|cts|tsx)$/i.test(name),
    why: 'TypeScript sources: the runtime requires only compiled .js (no package here has a .ts entry point)',
  },
  {
    rule: 'dev-files',
    test: (name) => /\.(md|markdown)$/i.test(name) && !/licen[cs]e|copying|notice|authors/i.test(name),
    why: 'READMEs/CHANGELOGs; licence texts are kept',
  },
  {
    rule: 'build-from-source-only',
    test: (name, rel) => /\.(lib|exp|pdb|ilk|iobj|ipdb)$/i.test(name) && rel.startsWith('@node-llama-cpp/'),
    why: 'MSVC import libraries/linker files beside llama-addon.node; only needed to link against the addon, never loaded',
  },
];

// ---------------------------------------------------------------------------

const BUILTINS = new Set([...builtinModules, 'electron', 'original-fs']);
const NPM_NAME = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

function pkgNameOf(spec) {
  if (spec.startsWith('node:')) return null;
  const parts = spec.split('/');
  const name = spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  if (BUILTINS.has(name) || !NPM_NAME.test(name)) return null;
  return name;
}

/** Bare specifiers the Node-side bundles load at runtime. */
function scanBuildRequires(buildDir) {
  const found = new Map();
  if (!fs.existsSync(buildDir)) throw new Error(`no Vite build at ${buildDir}`);
  for (const f of fs.readdirSync(buildDir).filter((x) => /\.(c|m)?js$/.test(x))) {
    const src = fs.readFileSync(path.join(buildDir, f), 'utf8');
    const fns = new Set(['require']);
    for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\.createRequire\(/g)) fns.add(m[1]);
    const specs = [];
    for (const fn of fns) {
      const re = new RegExp(`(?<![\\w$.])${fn.replace(/\$/g, '\\$')}(?:\\.resolve)?\\(\\s*(["'\`])([^"'\`]+)\\1`, 'g');
      for (const m of src.matchAll(re)) specs.push(m[2]);
    }
    for (const m of src.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
    for (const s of specs) {
      if (s.startsWith('.') || s.startsWith('/')) continue;
      const name = pkgNameOf(s);
      if (name) found.set(name, (found.get(name) || new Set()).add(f));
    }
  }
  return found;
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

/** Every package dir under nm (recursively through nested node_modules). */
function listPackages(nm, out = []) {
  if (!fs.existsSync(nm)) return out;
  for (const e of fs.readdirSync(nm, { withFileTypes: true })) {
    if (e.name.startsWith('.') || !e.isDirectory()) continue;
    const dirs = e.name.startsWith('@')
      ? fs.readdirSync(path.join(nm, e.name), { withFileTypes: true }).filter((s) => s.isDirectory()).map((s) => path.join(nm, e.name, s.name))
      : [path.join(nm, e.name)];
    for (const d of dirs) {
      if (!fs.existsSync(path.join(d, 'package.json'))) continue;
      out.push(d);
      listPackages(path.join(d, 'node_modules'), out);
    }
  }
  return out;
}

/** Node's resolution: <dir>/node_modules/<name>, walking up to the app root. */
function resolvePackage(fromDir, name, appDir) {
  let dir = fromDir;
  for (;;) {
    if (path.basename(dir) !== 'node_modules') {
      const c = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(c, 'package.json'))) return c;
    }
    if (path.resolve(dir) === path.resolve(appDir)) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function nameOfPackageDir(d) {
  return readJson(path.join(d, 'package.json'))?.name || path.basename(d);
}

function sizeOf(p) {
  let st;
  try {
    st = fs.lstatSync(p);
  } catch {
    return 0;
  }
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const e of fs.readdirSync(p)) total += sizeOf(path.join(p, e));
  return total;
}

function walkFiles(dir, cb) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, cb);
    else if (e.isFile()) cb(p, e.name);
  }
}

/**
 * Build the prune plan for a packaged resources/app directory.
 * Returns { actions: [{ rule, path, bytes, why }], roots, kept, removedPackages }.
 */
function planPrune(appDir, env = process.env) {
  const nm = path.join(appDir, 'node_modules');
  const scanned = scanBuildRequires(path.join(appDir, '.vite', 'build'));
  const excluded = excludedPackages(env);
  const isExcluded = (name) => excluded.find((x) => x.match(name));

  const roots = new Set([...MAIN_RUNTIME_PACKAGES, ...scanned.keys()]);
  const missingRoots = [];
  const kept = new Set();
  const queue = [];
  for (const r of roots) {
    const d = resolvePackage(appDir, r, appDir);
    if (d) queue.push(d);
    else missingRoots.push(r);
  }
  while (queue.length) {
    const d = queue.pop();
    const key = path.resolve(d);
    if (kept.has(key)) continue;
    kept.add(key);
    const pj = readJson(path.join(d, 'package.json')) || {};
    const deps = { ...pj.dependencies, ...pj.optionalDependencies, ...pj.peerDependencies };
    for (const dep of Object.keys(deps)) {
      if (isExcluded(dep)) continue;
      const r = resolvePackage(d, dep, appDir);
      if (r) queue.push(r);
    }
  }

  const actions = [];
  const claimed = new Set();
  const underClaimed = (key) => {
    for (let d = key; ; ) {
      if (claimed.has(d)) return true;
      const up = path.dirname(d);
      if (up === d) return false;
      d = up;
    }
  };
  const add = (rule, p, why) => {
    const key = path.resolve(p);
    if (underClaimed(key) || !fs.existsSync(p)) return;
    claimed.add(key);
    actions.push({ rule, path: p, bytes: sizeOf(p), why });
  };

  // Caches first (not packages).
  for (const r of PATH_RULES.filter((x) => x.rule === 'caches')) for (const rel of r.paths) add(r.rule, path.join(nm, rel), r.why);

  // Whole packages outside the keep-set. A nested package whose parent is
  // removed goes with its parent, so only the topmost removed dir is listed.
  const removedPackages = [];
  const all = listPackages(nm);
  for (const d of all) {
    const key = path.resolve(d);
    if (kept.has(key)) continue;
    const name = nameOfPackageDir(d);
    if (underClaimed(key)) continue;
    const ex = isExcluded(name);
    const rule = ex ? ex.rule : 'not-required-by-main';
    const why = ex
      ? ex.why
      : 'not in the dependency closure of anything .vite/build requires; renderer code is bundled into .vite/renderer and cannot require from node_modules';
    add(rule, d, why);
    removedPackages.push({ name, rule, rel: path.relative(nm, d) });
  }

  // Paths inside kept packages.
  for (const r of PATH_RULES.filter((x) => x.rule !== 'caches')) {
    for (const rel of r.paths || []) add(r.rule, path.join(nm, rel), r.why);
    if (r.glob) {
      const dir = path.join(nm, r.glob.dir);
      if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (!r.glob.keep.includes(f)) add(r.rule, path.join(dir, f), r.why);
    }
  }

  // Dev files inside kept packages.
  for (const key of kept) {
    if (underClaimed(key)) continue;
    walkFiles(key, (p, name) => {
      const rel = path.relative(nm, p).split(path.sep).join('/');
      const hit = DEV_FILE_RULES.find((r) => r.test(name, rel));
      if (hit && !/\.node$|\.dll$|\.wasm$|\.js$|\.cjs$|\.mjs$|\.json$/i.test(name)) add(hit.rule, p, hit.why);
    });
  }

  // Sanity: every root must still be present after the plan.
  for (const r of roots) {
    const d = resolvePackage(appDir, r, appDir);
    if (d && claimed.has(path.resolve(d))) throw new Error(`prune plan would remove runtime package ${r}`);
  }

  return { actions, roots: [...roots].sort(), scanned, missingRoots, kept, removedPackages };
}

function applyPrune(plan) {
  for (const a of plan.actions) fs.rmSync(a.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

const MB = (b) => `${(b / 1048576).toFixed(1)} MB`;

/** Plan, log, and (unless dryRun) apply. Returns { before, after, byRule }. */
function prunePackagedApp(appDir, { dryRun = false, log = console.log, env = process.env } = {}) {
  const nm = path.join(appDir, 'node_modules');
  const before = sizeOf(nm);
  const plan = planPrune(appDir, env);
  log(`[prune] runtime roots (${plan.roots.length}): ${plan.roots.join(', ')}`);
  if (plan.missingRoots.length) log(`[prune] note: roots not present in node_modules: ${plan.missingRoots.join(', ')}`);
  const byRule = new Map();
  for (const a of plan.actions) {
    const r = byRule.get(a.rule) || { bytes: 0, count: 0, why: a.why };
    r.bytes += a.bytes;
    r.count += 1;
    byRule.set(a.rule, r);
  }
  for (const [rule, r] of byRule) log(`[prune] ${rule.padEnd(26)} ${MB(r.bytes).padStart(10)}  (${r.count} paths)`);
  const pk = plan.removedPackages.filter((p) => !p.rel.includes('node_modules'));
  log(`[prune] packages removed (${pk.length} top-level): ${pk.map((p) => p.name).join(', ')}`);
  if (!dryRun) applyPrune(plan);
  const after = dryRun ? before - plan.actions.reduce((s, a) => s + a.bytes, 0) : sizeOf(nm);
  log(`[prune] node_modules ${MB(before)} -> ${MB(after)}${dryRun ? ' (dry run)' : ''}`);
  return { before, after, byRule, plan };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('usage: node tools/prune-packaged-app.cjs <resources/app dir> [--dry-run]');
    process.exit(2);
  }
  prunePackagedApp(path.resolve(dir), { dryRun: args.includes('--dry-run') });
}

module.exports = { planPrune, prunePackagedApp, scanBuildRequires, MAIN_RUNTIME_PACKAGES, PATH_RULES, DEV_FILE_RULES };

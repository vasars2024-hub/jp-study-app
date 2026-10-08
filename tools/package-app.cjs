#!/usr/bin/env node
/**
 * Reliable Windows packaging: patch Forge/Vite bug, clean caches, package,
 * prune, and (opt-in) zip.
 * Usage: node tools/package-app.cjs [--zip] [--installer] [--no-prune]
 *
 *   --installer also build the Squirrel.Windows installer (Gum-<v> Setup.exe,
 *               RELEASES, *-full.nupkg) into out/make/squirrel.windows/x64/,
 *               from the PRUNED app. GUM_PACKAGE_INSTALLER=1 does the same.
 *               Needs roughly 3x the pruned app size free on C: (Squirrel
 *               copies the app to %TEMP% and compresses it twice).
 *   --zip       also run `electron-forge make` and write out/make/…/*.zip.
 *               GUM_PACKAGE_ZIP=1 does the same. Off by default: the zip is a
 *               distribution artifact only (the desktop shortcut runs the
 *               folder), and on a nearly full C: it costs ~1 GB per build.
 *   --no-prune  skip the node_modules prune (GUM_NO_PRUNE=1 does the same).
 *               See tools/prune-packaged-app.cjs for the rules; it takes the
 *               packaged node_modules from ~2 GB to ~0.4 GB.
 *
 * The desktop shortcut points at out\jp-study-app-win32-x64\jp-study-app.exe.
 * This script used to delete out\ before every build, so a failed build left
 * nothing runnable. Now:
 *
 *   1. the build goes into a staging folder (out\.staging-<ts>), same volume;
 *   2. only when package AND make succeed is the current build renamed to
 *      out\jp-study-app-win32-x64.previous and the staged one renamed into
 *      out\jp-study-app-win32-x64 — the path the shortcut uses never changes;
 *   3. a failure at any step deletes the staging folder and leaves the current
 *      build exactly where it was.
 *
 * Disk C: is nearly full, so exactly ONE previous build is kept, and it is
 * deleted before the build starts (the current build stays runnable
 * throughout; peak use is current + staging, not three copies).
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- a plain CommonJS build script */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const { prunePackagedApp } = require('./prune-packaged-app.cjs');

const root = path.join(__dirname, '..');
const OUT = path.join(root, 'out');
const APP_DIR_NAME = 'jp-study-app-win32-x64';
const PREVIOUS_SUFFIX = '.previous';
const STAGING_PREFIX = '.staging-';

function run(label, cmd, args) {
  console.log(`\n[package-app] ${label}\n`);
  const r = spawnSync(cmd, args, {
    cwd: root,
    env: {
      ...process.env,
      NODE_OPTIONS: process.env.NODE_OPTIONS || '--max-old-space-size=8192',
      DEBUG: process.env.DEBUG || 'electron-packager',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32' && cmd !== process.execPath,
  });
  return r.status === 0;
}

/**
 * Forge's CLI has no --out-dir; its API does. Run it in a child node so the
 * build keeps the 8 GB heap NODE_OPTIONS gives it.
 */
function forgeApi(label, method, options) {
  const code =
    `require(${JSON.stringify(require.resolve('@electron-forge/core', { paths: [root] }))})` +
    `.api.${method}(${JSON.stringify(options)})` +
    '.then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });';
  return run(label, process.execPath, ['-e', code]);
}

function rm(p) {
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

/** Remove leftovers of an interrupted earlier run. */
function removeStaleStaging(outDir = OUT) {
  if (!fs.existsSync(outDir)) return;
  for (const name of fs.readdirSync(outDir)) {
    if (name.startsWith(STAGING_PREFIX)) rm(path.join(outDir, name));
  }
}

/**
 * Put the staged build in place, keeping the current one as `.previous`.
 * Returns { ok: true } or { ok: false, error } — and on failure the current
 * build is back where it was.
 */
function swapBuild(stagedApp, outDir = OUT, io = fs) {
  const final = path.join(outDir, APP_DIR_NAME);
  const previous = `${final}${PREVIOUS_SUFFIX}`;
  let movedCurrent = false;
  try {
    if (io.existsSync(previous)) io.rmSync(previous, { recursive: true, force: true });
    if (io.existsSync(final)) {
      io.renameSync(final, previous);
      movedCurrent = true;
    }
    io.renameSync(stagedApp, final);
    return { ok: true, final, previous: movedCurrent ? previous : null };
  } catch (err) {
    if (movedCurrent && !io.existsSync(final)) {
      try {
        io.renameSync(previous, final);
      } catch {
        /* reported below */
      }
    }
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}

/** Replace out/make with the staged make output (zips). */
function swapMake(stagedMake, outDir = OUT) {
  if (!fs.existsSync(stagedMake)) return;
  const target = path.join(outDir, 'make');
  rm(target);
  fs.renameSync(stagedMake, target);
}

function fail(label, staging) {
  console.error(`\n[package-app] Failed: ${label}. The current build in out/${APP_DIR_NAME} was not touched.`);
  if (staging) rm(staging);
  process.exit(1);
}

/**
 * Squirrel's releasify shells out to `electron-winstaller/vendor/7z.exe`, which that
 * package's postinstall copies from `7z-<arch>.exe`. On a machine that installs with
 * `npm install --ignore-scripts` the copy never happens and releasify dies with a bare
 * "The system cannot find the file specified" (measured 2026-10-08). Do it here.
 */
function ensureWinstaller7z() {
  let vendor;
  try {
    vendor = path.join(path.dirname(require.resolve('electron-winstaller/package.json', { paths: [root] })), 'vendor');
  } catch {
    return false;
  }
  const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
  for (const ext of ['exe', 'dll']) {
    const target = path.join(vendor, `7z.${ext}`);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(vendor, `7z-${arch}.${ext}`), target);
  }
  return true;
}

function main(argv = process.argv.slice(2), env = process.env) {
  const wantZip = argv.includes('--zip') || !!env.GUM_PACKAGE_ZIP;
  const wantInstaller = argv.includes('--installer') || !!env.GUM_PACKAGE_INSTALLER;
  // Forge maker names (forge.config.ts): only the makers asked for run, so `--zip`
  // never quietly also builds a ~1 GB installer, and vice versa.
  const makeTargets = [...(wantInstaller ? ['squirrel'] : []), ...(wantZip ? ['zip'] : [])];
  const wantPrune = !argv.includes('--no-prune') && !env.GUM_NO_PRUNE;
  // FIRST, before the multi-minute Vite build: this path calls Forge directly
  // rather than through `npm run package`, so it does not inherit that script's
  // preflight and would otherwise be the one way to package a build with no
  // kuromoji dictionary, no OCR core and no ONNX backend.
  const preflight = [
    ['Checking bundled runtime assets', 'check-runtime-assets.cjs'],
    ['Syncing chrome-extension mirror', 'sync-extension-mirror.cjs'],
    ['Patching @electron-forge/plugin-vite', 'patch-forge-vite.cjs'],
    ['Patching @electron/packager unzip', 'patch-packager-unzip.cjs'],
  ];
  for (const [label, script] of preflight) {
    if (!run(label, 'node', [path.join(__dirname, script)])) fail(label, null);
  }
  if (wantInstaller && !ensureWinstaller7z()) fail('electron-winstaller is not installed', null);

  // Vite's intermediate output only — never out/, which holds the build the
  // desktop shortcut launches.
  const vite = path.join(root, '.vite');
  if (fs.existsSync(vite)) {
    console.log('[package-app] Removing .vite/');
    rm(vite);
  }
  fs.mkdirSync(OUT, { recursive: true });
  removeStaleStaging();
  // One previous build only, and freed before building (disk space).
  const previous = path.join(OUT, `${APP_DIR_NAME}${PREVIOUS_SUFFIX}`);
  if (fs.existsSync(previous)) {
    console.log(`[package-app] Removing out/${APP_DIR_NAME}${PREVIOUS_SUFFIX}/ (only one previous build is kept)`);
    rm(previous);
  }

  const staging = path.join(OUT, `${STAGING_PREFIX}${Date.now()}`);
  fs.mkdirSync(staging, { recursive: true });
  const dir = root;
  if (!forgeApi('electron-forge package (staging)', 'package', { dir, outDir: staging, interactive: false })) {
    fail('electron-forge package', staging);
  }
  const stagedApp = path.join(staging, APP_DIR_NAME);
  if (!fs.existsSync(path.join(stagedApp, 'jp-study-app.exe')) && process.platform === 'win32') {
    fail('packaged app missing from staging', staging);
  }

  // Prune the STAGED copy, before make (so a zip is of the pruned app) and
  // before the swap (so a prune failure leaves the current build untouched).
  if (wantPrune) {
    console.log('\n[package-app] Pruning staged node_modules\n');
    try {
      prunePackagedApp(path.join(stagedApp, 'resources', 'app'));
    } catch (err) {
      console.error(err);
      fail('prune', staging);
    }
  } else {
    console.log('[package-app] Prune skipped (--no-prune / GUM_NO_PRUNE).');
  }

  if (makeTargets.length) {
    const label = `electron-forge make (${makeTargets.join(' + ')}, staging)`;
    if (!forgeApi(label, 'make', { dir, outDir: staging, skipPackage: true, interactive: false, overrideTargets: makeTargets })) {
      fail('electron-forge make', staging);
    }
  } else {
    console.log('[package-app] No zip or installer (pass --zip / --installer to write out/make).');
  }

  const swapped = swapBuild(stagedApp);
  if (!swapped.ok) {
    console.error(`[package-app] Could not swap the new build in (${swapped.error}). Is Gum running? Close it and try again.`);
    fail('swap', staging);
  }
  if (makeTargets.length) {
    try {
      swapMake(path.join(staging, 'make'));
    } catch (err) {
      console.warn(`[package-app] New build is in place, but the zip could not be moved: ${err.message}`);
    }
  } else if (fs.existsSync(path.join(OUT, 'make'))) {
    // A zip from an earlier build no longer matches out/<app>; the old flow
    // always replaced it, so drop it rather than leave a stale 1 GB artifact.
    console.log('[package-app] Removing stale out/make/ (it is of an older build).');
    rm(path.join(OUT, 'make'));
  }
  rm(staging);

  const zipDir = path.join(OUT, 'make', 'zip', 'win32', 'x64');
  console.log('\n[package-app] Done.');
  console.log(`  Portable app: out/${APP_DIR_NAME}/`);
  if (swapped.previous) console.log(`  Previous build kept: out/${APP_DIR_NAME}${PREVIOUS_SUFFIX}/`);
  if (fs.existsSync(zipDir)) {
    for (const f of fs.readdirSync(zipDir)) {
      if (f.endsWith('.zip')) console.log(`  Zip: out/make/zip/win32/x64/${f}`);
    }
  }
  const squirrelDir = path.join(OUT, 'make', 'squirrel.windows', 'x64');
  if (fs.existsSync(squirrelDir)) {
    // All three go on the GitHub release: Setup.exe for new users, RELEASES and the
    // -full.nupkg for installed copies to update themselves (squirrelUpdater.ts).
    for (const f of fs.readdirSync(squirrelDir)) {
      console.log(`  Installer: out/make/squirrel.windows/x64/${f}`);
    }
  }
}

if (require.main === module) main();

module.exports = { swapBuild, removeStaleStaging, APP_DIR_NAME, PREVIOUS_SUFFIX, STAGING_PREFIX };

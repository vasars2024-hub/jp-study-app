#!/usr/bin/env node
/**
 * Reliable Windows packaging: patch Forge/Vite bug, clean caches, package, zip.
 * Usage: node tools/package-app.cjs
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

function main() {
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
  if (!forgeApi('electron-forge make (zip, staging)', 'make', { dir, outDir: staging, skipPackage: true, interactive: false })) {
    fail('electron-forge make', staging);
  }
  const stagedApp = path.join(staging, APP_DIR_NAME);
  if (!fs.existsSync(path.join(stagedApp, 'jp-study-app.exe')) && process.platform === 'win32') {
    fail('packaged app missing from staging', staging);
  }

  const swapped = swapBuild(stagedApp);
  if (!swapped.ok) {
    console.error(`[package-app] Could not swap the new build in (${swapped.error}). Is Gum running? Close it and try again.`);
    fail('swap', staging);
  }
  try {
    swapMake(path.join(staging, 'make'));
  } catch (err) {
    console.warn(`[package-app] New build is in place, but the zip could not be moved: ${err.message}`);
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
}

if (require.main === module) main();

module.exports = { swapBuild, removeStaleStaging, APP_DIR_NAME, PREVIOUS_SUFFIX, STAGING_PREFIX };

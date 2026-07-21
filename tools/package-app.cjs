#!/usr/bin/env node
/**
 * Reliable Windows packaging: patch Forge/Vite bug, clean caches, package, zip.
 * Usage: node tools/package-app.cjs
 */
'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

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
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) {
    console.error(`\n[package-app] Failed: ${label} (exit ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run('Syncing chrome-extension mirror', 'node', [path.join(__dirname, 'sync-extension-mirror.cjs')]);
run('Patching @electron-forge/plugin-vite', 'node', [path.join(__dirname, 'patch-forge-vite.cjs')]);
run('Patching @electron/packager unzip', 'node', [path.join(__dirname, 'patch-packager-unzip.cjs')]);

for (const dir of ['.vite', 'out']) {
  const p = path.join(root, dir);
  if (fs.existsSync(p)) {
    console.log(`[package-app] Removing ${dir}/`);
    fs.rmSync(p, { recursive: true, force: true });
  }
}

run('electron-forge package', 'npx', ['electron-forge', 'package']);
run('electron-forge make (zip)', 'npx', ['electron-forge', 'make']);

const zipDir = path.join(root, 'out', 'make', 'zip', 'win32', 'x64');
const pkgDir = path.join(root, 'out', 'jp-study-app-win32-x64');
console.log('\n[package-app] Done.');
if (fs.existsSync(zipDir)) {
  for (const f of fs.readdirSync(zipDir)) {
    if (f.endsWith('.zip')) console.log(`  Zip: out/make/zip/win32/x64/${f}`);
  }
} else if (fs.existsSync(pkgDir)) {
  console.log(`  Portable app: out/jp-study-app-win32-x64/`);
} else {
  console.warn('  No output found in out/ — check logs above.');
}

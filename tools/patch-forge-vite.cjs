/**
 * @electron-forge/plugin-vite registers process.on('exit') which fires while
 * electron-packager is extracting Electron, killing the build with 0% CPU and
 * an empty out/ folder. Idempotent — safe to run before every package.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  '@electron-forge',
  'plugin-vite',
  'dist',
  'VitePlugin.js',
);

if (!fs.existsSync(target)) {
  console.error('[patch-forge-vite] VitePlugin.js not found — run npm install');
  process.exit(1);
}

let src = fs.readFileSync(target, 'utf8');
const needle = "process.on('exit', (_code) => {";
const patched = '// [jp-study-app patch] process.on(exit) removed — broke electron-packager';

if (src.includes(patched)) {
  console.log('[patch-forge-vite] Already patched');
  process.exit(0);
}

if (!src.includes(needle)) {
  console.warn('[patch-forge-vite] Pattern not found — plugin version may have changed');
  process.exit(0);
}

src = src.replace(
  /process\.on\('exit', \(_code\) => \{\s*this\.exitHandler\(\{ cleanup: true \}\);\s*\}\);/,
  patched,
);

fs.writeFileSync(target, src);
console.log('[patch-forge-vite] Patched @electron-forge/plugin-vite');

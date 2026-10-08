#!/usr/bin/env node
// Keeps src/main/chrome-extension/ (the Vite `?raw`-imported packaged-build
// fallback) byte-identical to extension/ (the live dev source Chrome loads).
// Run before every package/make so a packaged build can never ship a stale
// extension copy. See EXTENSION_AUDIT_REPORT.md ID 112 for why this exists.

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'extension');
const DEST_DIR = path.join(__dirname, '..', 'src', 'main', 'chrome-extension');

const FILES = [
  'manifest.json',
  'background.js',
  'content.css',
  'content.js',
  'idb.js',
  'offscreen.html',
  'offscreen.js',
  'options.html',
  'options.js',
  'popup.html',
  'popup.js',
  'popup-css.js',
  'settings.js',
  'shared.js',
  'tabs.html',
  'tabs.js',
  // Compared by the mirror drift test (extensionManifestAudit), so copied too.
  'README.md',
  // chrome.i18n catalogues (manifest default_locale "en"); Chrome refuses to
  // load the extension if the default one is missing.
  '_locales/en/messages.json',
  '_locales/ja/messages.json',
  '_locales/zh_CN/messages.json',
  '_locales/ru/messages.json',
];

let changed = 0;
for (const name of FILES) {
  const srcPath = path.join(SRC_DIR, name);
  const destPath = path.join(DEST_DIR, name);
  if (!fs.existsSync(srcPath)) {
    console.error(`sync-extension-mirror: MISSING source file extension/${name}`);
    process.exitCode = 1;
    continue;
  }
  const srcContent = fs.readFileSync(srcPath);
  const destContent = fs.existsSync(destPath) ? fs.readFileSync(destPath) : null;
  if (!destContent || !srcContent.equals(destContent)) {
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, srcContent);
    console.log(`sync-extension-mirror: updated ${name}`);
    changed++;
  }
}

if (changed === 0) {
  console.log(`sync-extension-mirror: mirror already up to date (${FILES.length}/${FILES.length} files match)`);
} else {
  console.log(`sync-extension-mirror: synced ${changed} file(s) from extension/ to src/main/chrome-extension/`);
}

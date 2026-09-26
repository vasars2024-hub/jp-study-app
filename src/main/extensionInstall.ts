/**
 * Materialize the Chrome extension on disk so "Load unpacked" always has a real folder.
 */

/* eslint-disable import/no-unresolved --
   The `?raw` suffix is Vite's inline-as-string import, resolved by the bundler at
   build time. eslint-plugin-import's resolver does not understand query suffixes
   and reports every one of these as unresolved; the files are all present in
   ./chrome-extension/. Disabled for the file rather than line by line. */

import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import manifestJson from './chrome-extension/manifest.json?raw';
import backgroundJs from './chrome-extension/background.js?raw';
import popupHtml from './chrome-extension/popup.html?raw';
import popupJs from './chrome-extension/popup.js?raw';
import sharedJs from './chrome-extension/shared.js?raw';
import contentJs from './chrome-extension/content.js?raw';
import contentCss from './chrome-extension/content.css?raw';
import optionsHtml from './chrome-extension/options.html?raw';
import optionsJs from './chrome-extension/options.js?raw';
import settingsJs from './chrome-extension/settings.js?raw';
import tabsHtml from './chrome-extension/tabs.html?raw';
import tabsJs from './chrome-extension/tabs.js?raw';
import localeEn from './chrome-extension/_locales/en/messages.json?raw';
import localeJa from './chrome-extension/_locales/ja/messages.json?raw';
import localeZhCn from './chrome-extension/_locales/zh_CN/messages.json?raw';
import localeRu from './chrome-extension/_locales/ru/messages.json?raw';

/** Files written from the Vite-bundled fallback when `extension/` is unavailable. */
const BUNDLED_FILES = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'shared.js',
  'content.js',
  'content.css',
  'options.html',
  'options.js',
  'settings.js',
  'tabs.html',
  'tabs.js',
  // chrome.i18n catalogues; the manifest names "en" as default_locale, so a
  // folder without them does not load at all.
  '_locales/en/messages.json',
  '_locales/ja/messages.json',
  '_locales/zh_CN/messages.json',
  '_locales/ru/messages.json',
] as const;

const BUNDLED: Record<(typeof BUNDLED_FILES)[number], string> = {
  'manifest.json': manifestJson,
  'background.js': backgroundJs,
  'popup.html': popupHtml,
  'popup.js': popupJs,
  'shared.js': sharedJs,
  'content.js': contentJs,
  'content.css': contentCss,
  'options.html': optionsHtml,
  'options.js': optionsJs,
  'settings.js': settingsJs,
  'tabs.html': tabsHtml,
  'tabs.js': tabsJs,
  '_locales/en/messages.json': localeEn,
  '_locales/ja/messages.json': localeJa,
  '_locales/zh_CN/messages.json': localeZhCn,
  '_locales/ru/messages.json': localeRu,
};

let installedDir: string | null = null;

function userExtensionDir(): string {
  return path.join(app.getPath('userData'), 'chrome-extension');
}

function hasManifest(dir: string): boolean {
  try {
    return fs.existsSync(path.join(dir, 'manifest.json'));
  } catch {
    return false;
  }
}

function candidateSourceDirs(): string[] {
  const candidates = [
    path.join(process.cwd(), 'extension'),
    path.join(app.getAppPath(), '..', 'extension'),
    path.join(app.getAppPath(), 'extension'),
    path.join(process.resourcesPath, 'extension'),
  ];
  return candidates.filter(hasManifest);
}

/**
 * Copy every file from the live `extension/` tree (keeps options/settings in
 * sync), including sub-folders such as `_locales/<lang>/messages.json`.
 */
function copyExtensionDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'README.md' || name.startsWith('.')) continue;
    const from = path.join(src, name);
    const st = fs.statSync(from);
    if (st.isDirectory()) copyExtensionDir(from, path.join(dest, name));
    else if (st.isFile()) fs.copyFileSync(from, path.join(dest, name));
  }
}

function writeBundledExtension(dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const file of BUNDLED_FILES) {
    fs.mkdirSync(path.dirname(path.join(dest, file)), { recursive: true });
    fs.writeFileSync(path.join(dest, file), BUNDLED[file], 'utf8');
  }
}

/** Sync extension files to userData and return the folder Chrome should load. */
export function ensureChromeExtensionFolder(): string {
  const dest = userExtensionDir();
  const sources = candidateSourceDirs();
  if (sources.length > 0) {
    copyExtensionDir(sources[0], dest);
  } else {
    writeBundledExtension(dest);
  }
  installedDir = dest;
  return dest;
}

export function getChromeExtensionFolder(): string {
  if (installedDir && hasManifest(installedDir)) return installedDir;
  return ensureChromeExtensionFolder();
}

/** Manifest `version` from the load-unpacked folder Chrome should be using. */
export function readInstalledExtensionVersion(): string | null {
  try {
    const folder = getChromeExtensionFolder();
    const raw = fs.readFileSync(path.join(folder, 'manifest.json'), 'utf8');
    const manifest = JSON.parse(raw) as { version?: unknown };
    return typeof manifest.version === 'string' && manifest.version.trim()
      ? manifest.version.trim()
      : null;
  } catch {
    return null;
  }
}

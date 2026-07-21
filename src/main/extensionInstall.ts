/**
 * Materialize the Chrome extension on disk so "Load unpacked" always has a real folder.
 */

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

/** Copy every file from the live `extension/` tree (keeps options/settings in sync). */
function copyExtensionDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    if (name === 'README.md' || name.startsWith('.')) continue;
    const from = path.join(src, name);
    const st = fs.statSync(from);
    if (!st.isFile()) continue;
    fs.copyFileSync(from, path.join(dest, name));
  }
}

function writeBundledExtension(dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const file of BUNDLED_FILES) {
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

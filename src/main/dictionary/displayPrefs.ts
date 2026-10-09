// The dictionary's result layout (grouped vs merged, collapsed secondaries),
// persisted in main so every window and the browser extension's `/v1/scan`
// read the same choice. Contract: `shared/dictDisplay.ts`.

import path from 'node:path';
import { app } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from '../atomicJson';
import { normalizeDictDisplayPrefs, type DictDisplayPrefs } from '../../shared/dictDisplay';

export const DICT_DISPLAY_FILE = 'dict-display.json';

let cached: DictDisplayPrefs | null = null;

function defaultFile(): string {
  return path.join(app.getPath('userData'), DICT_DISPLAY_FILE);
}

export function readDictDisplayPrefs(file?: string): DictDisplayPrefs {
  if (!file && cached) return cached;
  let raw: unknown = {};
  try {
    raw = readJsonSync<unknown>(file ?? defaultFile(), () => ({}), {});
  } catch {
    // No userData (a headless test host): the defaults.
  }
  const prefs = normalizeDictDisplayPrefs(raw);
  if (!file) cached = prefs;
  return prefs;
}

export function writeDictDisplayPrefs(raw: unknown, file?: string): DictDisplayPrefs {
  const prefs = normalizeDictDisplayPrefs(raw);
  writeJsonAtomicSync(file ?? defaultFile(), prefs, { space: 2 });
  if (!file) cached = prefs;
  return prefs;
}

/** Tests only. */
export function resetDictDisplayPrefsCache(): void {
  cached = null;
}

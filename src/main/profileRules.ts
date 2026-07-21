/**
 * Persist ordered mining → Anki profile rules in userData/profile-rules.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { app, ipcMain } from 'electron';
import {
  EMPTY_PROFILE_RULES,
  normalizeProfileRulesStore,
  type ProfileRulesStore,
} from '../shared/profileRules';

const FILE = 'profile-rules.json';

function filePath(): string {
  return path.join(app.getPath('userData'), FILE);
}

export function loadProfileRules(): ProfileRulesStore {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    return normalizeProfileRulesStore(JSON.parse(raw));
  } catch {
    return { ...EMPTY_PROFILE_RULES, rules: [] };
  }
}

export function saveProfileRules(store: ProfileRulesStore): ProfileRulesStore {
  const next = normalizeProfileRulesStore(store);
  fs.mkdirSync(path.dirname(filePath()), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function registerProfileRulesIpc(): void {
  ipcMain.handle('profileRules:get', () => loadProfileRules());
  ipcMain.handle('profileRules:set', (_e, store: unknown) => saveProfileRules(normalizeProfileRulesStore(store)));
}

/**
 * Persist ordered mining → Anki profile rules in userData/profile-rules.json.
 */

import path from 'node:path';
import { app, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
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
    const parsed = readJsonSync<{ schemaVersion?: unknown } | null>(filePath(), null, {
      validate: (v) => v !== null && typeof v === 'object',
    });
    if (!parsed) return { ...EMPTY_PROFILE_RULES, rules: [] };
    const next = normalizeProfileRulesStore(parsed);
    if (parsed.schemaVersion !== next.schemaVersion) {
      try {
        writeJsonAtomicSync(filePath(), next);
      } catch (error) {
        console.warn('[profile-rules] migration could not be persisted:', error);
      }
    }
    return next;
  } catch {
    return { ...EMPTY_PROFILE_RULES, rules: [] };
  }
}

export function saveProfileRules(store: ProfileRulesStore): ProfileRulesStore {
  const next = normalizeProfileRulesStore(store);
  writeJsonAtomicSync(filePath(), next);
  return next;
}

export function registerProfileRulesIpc(): void {
  ipcMain.handle('profileRules:get', () => loadProfileRules());
  ipcMain.handle('profileRules:set', (_e, store: unknown) => saveProfileRules(normalizeProfileRulesStore(store)));
}

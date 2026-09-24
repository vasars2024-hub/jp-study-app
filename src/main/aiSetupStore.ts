/**
 * Main-owned home of the "Use AI features" switch.
 *
 * Main rather than renderer storage because main is where it has to hold: the
 * Agent's scheduled automations plan with no window involved, and a switch that
 * only hid buttons would leave them running. Written only by main, so a cached
 * copy is safe, and atomically (temp file + rename), matching the Agent stores
 * beside it.
 */
import path from 'node:path';
import { app } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import {
  normalizeAiFeatureSettings,
  type AiFeatureSettings,
} from '../shared/aiSetup';

const SETTINGS_FILE = 'settings-v1.json';

export interface AiSetupStore {
  readonly filePath: string;
  read(): AiFeatureSettings;
  setEnabled(enabled: boolean): AiFeatureSettings;
}

export function createAiSetupStore(rootDirectory: string): AiSetupStore {
  const filePath = path.join(rootDirectory, 'ai', SETTINGS_FILE);
  let cached: AiFeatureSettings | null = null;

  const read = (): AiFeatureSettings => {
    if (cached) return cached;
    try {
      // A damaged file is moved aside and its last-good copy served (atomicJson).
      cached = normalizeAiFeatureSettings(readJsonSync<unknown>(filePath, null));
    } catch {
      cached = normalizeAiFeatureSettings(null);
    }
    return cached;
  };

  const write = (next: AiFeatureSettings): AiFeatureSettings => {
    writeJsonAtomicSync(filePath, next, { mode: 0o600 });
    cached = next;
    return next;
  };

  return {
    filePath,
    read,
    setEnabled: (enabled) => write({ ...read(), enabled: enabled === true }),
  };
}

let defaultStore: AiSetupStore | null = null;

export function getAiSetupStore(): AiSetupStore {
  if (!defaultStore) defaultStore = createAiSetupStore(app.getPath('userData'));
  return defaultStore;
}

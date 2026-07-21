import * as fs from 'fs';
import * as path from 'path';

import { NOCTIS_SCHEMA_VERSION } from '../engine/constants';
import { validateState } from '../engine/constraints';
import { CivilizationState, NoctisStateEnvelope } from '../engine/types';
import { createEnvelope } from '../engine/state';

export type CityLoadSource = 'primary' | 'backup' | 'missing' | 'corrupt';

export interface CityLoadResult {
  envelope: NoctisStateEnvelope | null;
  source: CityLoadSource;
}

export interface CityStorage {
  load(): CityLoadResult;
  save(state: CivilizationState, savedAt: number, appliedSessionIds: string[]): void;
}

function parseEnvelope(raw: string): NoctisStateEnvelope | null {
  try {
    const value = JSON.parse(raw) as Partial<NoctisStateEnvelope>;
    if (!value || value.schemaVersion !== NOCTIS_SCHEMA_VERSION) return null;
    if (!Number.isFinite(value.savedAt) || (value.savedAt as number) < 0 || !value.state) return null;
    if (!Array.isArray(value.appliedSessionIds)
      || value.appliedSessionIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 128)) return null;
    validateState(value.state as CivilizationState);
    return createEnvelope(value.state as CivilizationState, value.savedAt as number, value.appliedSessionIds);
  } catch {
    return null;
  }
}

function readEnvelope(file: string): NoctisStateEnvelope | null {
  try {
    return parseEnvelope(fs.readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/** Main-only filesystem adapter. CityService itself remains Electron-free and injectable. */
export function createFileCityStorage(userDataPath: string): CityStorage {
  const file = path.join(userDataPath, 'noctis-state.json');
  const backup = `${file}.bak`;
  const temporary = `${file}.tmp`;

  return {
    load(): CityLoadResult {
      const primaryExists = fs.existsSync(file);
      const primary = readEnvelope(file);
      if (primary) return { envelope: primary, source: 'primary' };
      const recovered = readEnvelope(backup);
      if (recovered) return { envelope: recovered, source: 'backup' };
      return { envelope: null, source: primaryExists || fs.existsSync(backup) ? 'corrupt' : 'missing' };
    },

    save(state: CivilizationState, savedAt: number, appliedSessionIds: string[]): void {
      validateState(state);
      fs.mkdirSync(userDataPath, { recursive: true });
      const envelope = createEnvelope(state, savedAt, appliedSessionIds);
      fs.writeFileSync(temporary, JSON.stringify(envelope, null, 2), 'utf-8');

      // Preserve only a validated primary; a corrupt primary must not replace a good backup.
      if (readEnvelope(file)) fs.copyFileSync(file, backup);
      fs.renameSync(temporary, file);
    },
  };
}

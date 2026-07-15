/**
 * Noctis persistence — atomic save/load envelope.
 *
 * Main-process only (ARCHITECTURE.md Section 3 persistence boundary). The
 * Simulation Engine Core never writes files; this module, under CityService
 * ownership, is the sole writer of civilization state, targeting
 * userData/noctis-state.json via the ProfileStore house pattern (atomic
 * temporary-write-then-rename, invariant P-1 in src/main/profiles.ts).
 *
 * Loaded files are untrusted input (ARCHITECTURE.md Section 6, boot sequence):
 * a missing, unparseable, or Trope-Guard-failing file yields null so the
 * caller runs the initial-state factory rather than trusting a corrupt save.
 */

import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

import { CivilizationState, NoctisStateEnvelope } from '../engine/types';
import { createEnvelope, NOCTIS_SCHEMA_VERSION } from '../engine/state';
import { validateState } from '../engine/constraints';

function storePath(): string {
  return path.join(app.getPath('userData'), 'noctis-state.json');
}

/**
 * Reads and validates the persisted envelope. Returns null on any failure
 * (missing file, parse error, wrong schema version, or a state that fails the
 * Trope Guard / invariants) so the boot sequence regenerates instead.
 */
export function loadEnvelope(): NoctisStateEnvelope | null {
  let raw: string;
  try {
    raw = fs.readFileSync(storePath(), 'utf-8');
  } catch {
    return null; // no save yet — first run
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NoctisStateEnvelope>;
    if (!parsed || parsed.schemaVersion !== NOCTIS_SCHEMA_VERSION) return null;
    if (typeof parsed.savedAt !== 'number' || !parsed.state) return null;
    // Untrusted input: validate against the invariants and Trope Guard.
    validateState(parsed.state as CivilizationState);
    return {
      schemaVersion: NOCTIS_SCHEMA_VERSION,
      savedAt: parsed.savedAt,
      state: parsed.state as CivilizationState,
    };
  } catch (err) {
    console.error('[noctis] state load failed, regenerating:', err);
    return null;
  }
}

/**
 * Persists a state snapshot atomically with a caller-supplied timestamp
 * (the service owns the wall clock; the engine never reads one). Write-through:
 * the temporary file is renamed only after a complete write, so a partial
 * write can never tear the save.
 */
export function saveState(state: CivilizationState, savedAt: number): void {
  const envelope = createEnvelope(state, savedAt);
  const file = storePath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(envelope, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

/**
 * Noctis IPC — ipcMain handler registration.
 *
 * Delegates to CityService and validates inbound packets before engine
 * invocation (ARCHITECTURE.md Section 6: IPC input is untrusted). The
 * channel carries the already-interpreted learning input I — interpretation
 * happens renderer-side in the session bridge, so no raw telemetry, title,
 * word, or id ever crosses (LEARNING_INTEGRATION.md Sections 5, 9).
 */

import { ipcMain } from 'electron';

import { InterpretedLearningInput, InterpretedProfile } from '../engine/types';
import { CITY_GET_STATE, CITY_RECORD_SESSION, CityStateMessage } from './channels';
import { getCityService, initCityService } from '../service/lifecycle';

const PROFILE_KEYS: Array<keyof InterpretedProfile> = [
  'conceptualDepth',
  'retention',
  'disciplinaryExposure',
  'interdisciplinaryConnection',
  'sustainedAttention',
  'mastery',
  'curiosity',
  'revisionStrength',
  'difficulty',
  'novelty',
];

function unit(value: unknown): number {
  const n = typeof value === 'number' && isFinite(value) ? value : 0;
  return Math.max(0, Math.min(1, n));
}

function nonNegative(value: unknown): number {
  const n = typeof value === 'number' && isFinite(value) ? value : 0;
  return Math.max(0, n);
}

/**
 * Defensively normalizes an untrusted inbound payload into a lawful
 * InterpretedLearningInput. Never throws on renderer noise; clamps instead,
 * so a malformed packet degrades to a quiet, valid session rather than a
 * crash.
 */
function sanitizeInput(raw: unknown): InterpretedLearningInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawProfile = (r.profile ?? {}) as Record<string, unknown>;
  const profile = {} as InterpretedProfile;
  for (const key of PROFILE_KEYS) profile[key] = unit(rawProfile[key]);

  const rawPathways = (r.pathways ?? {}) as Record<string, unknown>;
  let brine = nonNegative(rawPathways.brine);
  let glucans = nonNegative(rawPathways.glucans);
  let catalysts = nonNegative(rawPathways.catalysts);
  const sum = brine + glucans + catalysts;
  if (sum > 0) {
    brine /= sum;
    glucans /= sum;
    catalysts /= sum;
  } else {
    glucans = 1; // default to the language/humanities tendency
  }

  return {
    focusDuration: nonNegative(r.focusDuration),
    profile,
    pathways: { brine, glucans, catalysts },
    difficulty: unit(r.difficulty),
    difficultyConfidence: r.difficultyConfidence === 'measured' ? 'measured' : 'inferred',
    consistency: Math.floor(nonNegative(r.consistency)),
    completion: r.completion === true,
  };
}

/**
 * Registers the three-channel city contract (ARCHITECTURE.md Section 4).
 * Idempotent: safe to call once at app startup.
 */
export function registerCityHandlers(): void {
  ipcMain.handle(CITY_GET_STATE, (): CityStateMessage => {
    const service = getCityService() ?? initCityService();
    return service.getState();
  });

  ipcMain.handle(CITY_RECORD_SESSION, (_event, payload: unknown): CityStateMessage => {
    const service = getCityService() ?? initCityService();
    return service.recordSession(sanitizeInput(payload));
  });
}

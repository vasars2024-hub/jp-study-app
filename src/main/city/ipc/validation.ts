import { AbyssalConstraintError } from '../engine/constraints';
import { InterpretedProfile } from '../engine/types';
import { CITY_WIRE_VERSION, CitySessionPacket } from './channels';

const PROFILE_KEYS: Array<keyof InterpretedProfile> = [
  'conceptualDepth', 'retention', 'disciplinaryExposure', 'interdisciplinaryConnection', 'sustainedAttention',
  'mastery', 'curiosity', 'revisionStrength', 'difficulty', 'novelty',
];

function reject(message: string): never {
  throw new AbyssalConstraintError(`city:recordSession ${message}`);
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) reject(`${path} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: string[], path: string): void {
  const actual = Object.keys(value).sort();
  const expected = keys.slice().sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    reject(`${path} has an unknown or missing field`);
  }
}

function bounded(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) reject(`${path} must be within [0,1]`);
  return value;
}

function nonNegative(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) reject(`${path} must be finite and non-negative`);
  return value;
}

/** Strict untrusted-wire validation: malformed input is rejected, never silently clamped. */
export function parseCitySessionPacket(raw: unknown): CitySessionPacket {
  const packet = objectAt(raw, 'packet');
  exactKeys(packet, ['schemaVersion', 'idempotencyKey', 'input'], 'packet');
  if (packet.schemaVersion !== CITY_WIRE_VERSION) reject('packet schemaVersion is unsupported');
  if (typeof packet.idempotencyKey !== 'string'
    || !/^[A-Za-z0-9._:-]{8,128}$/.test(packet.idempotencyKey)) reject('idempotencyKey is invalid');

  const source = objectAt(packet.input, 'input');
  exactKeys(source, ['focusDuration', 'profile', 'pathways', 'difficulty', 'difficultyConfidence', 'consistency', 'completion'], 'input');
  const sourceProfile = objectAt(source.profile, 'input.profile');
  exactKeys(sourceProfile, PROFILE_KEYS, 'input.profile');
  const profile = {} as InterpretedProfile;
  PROFILE_KEYS.forEach((key) => { profile[key] = bounded(sourceProfile[key], `input.profile.${key}`); });

  const sourcePathways = objectAt(source.pathways, 'input.pathways');
  exactKeys(sourcePathways, ['brine', 'glucans', 'catalysts'], 'input.pathways');
  const pathways = {
    brine: bounded(sourcePathways.brine, 'input.pathways.brine'),
    glucans: bounded(sourcePathways.glucans, 'input.pathways.glucans'),
    catalysts: bounded(sourcePathways.catalysts, 'input.pathways.catalysts'),
  };
  if (Math.abs(pathways.brine + pathways.glucans + pathways.catalysts - 1) > 0.000001) {
    reject('input.pathways must sum to one');
  }

  const consistency = nonNegative(source.consistency, 'input.consistency');
  if (!Number.isInteger(consistency)) reject('input.consistency must be an integer');
  if (source.difficultyConfidence !== 'measured' && source.difficultyConfidence !== 'inferred') {
    reject('input.difficultyConfidence is invalid');
  }
  if (typeof source.completion !== 'boolean') reject('input.completion must be boolean');

  return {
    schemaVersion: CITY_WIRE_VERSION,
    idempotencyKey: packet.idempotencyKey,
    input: {
      focusDuration: nonNegative(source.focusDuration, 'input.focusDuration'),
      profile,
      pathways,
      difficulty: bounded(source.difficulty, 'input.difficulty'),
      difficultyConfidence: source.difficultyConfidence,
      consistency,
      completion: source.completion,
    },
  };
}

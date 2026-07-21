import { CivilizationState, EngineEventFlag, InterpretedLearningInput } from '../engine/types';

export const CITY_GET_STATE = 'city:getState';
export const CITY_RECORD_SESSION = 'city:recordSession';
export const CITY_CHANGED = 'city:changed';
export const CITY_WIRE_VERSION = 1;

export interface CitySessionPacket {
  schemaVersion: number;
  idempotencyKey: string;
  input: InterpretedLearningInput;
}

/** Unified, versioned result used by both invoke replies and all-window push. */
export interface CityStateMessage {
  schemaVersion: number;
  state: CivilizationState;
  flags: EngineEventFlag[];
}

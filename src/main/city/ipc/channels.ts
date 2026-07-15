/**
 * Noctis IPC — fixed `city:` channel literals.
 *
 * String-locked channel registry (ARCHITECTURE.md Section 4). These three are
 * the entire outward contract of the module; no other channel exists.
 */

import { CivilizationState, EngineEventFlag } from '../engine/types';

/** renderer -> main (invoke): boot handshake, returns the current snapshot. */
export const CITY_GET_STATE = 'city:getState';

/** renderer -> main (invoke): inbound interpreted session -> state/event result. */
export const CITY_RECORD_SESSION = 'city:recordSession';

/** main -> renderer (push to all windows): unified state/event result. */
export const CITY_CHANGED = 'city:changed';

/** The unified result shape carried by getState, recordSession, and changed. */
export interface CityStateMessage {
  state: CivilizationState;
  flags: EngineEventFlag[];
}

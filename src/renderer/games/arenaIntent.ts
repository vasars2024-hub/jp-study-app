/**
 * "Open the Arena on this game" from outside the Arena (Calendar day view, Agent).
 *
 * The request is parked in a one-shot handoff before the Arena section opens, and announced
 * for an Arena that is already mounted. A lazily mounted Arena takes it on its first render,
 * so a cold open lands on the game that was asked for instead of its default.
 */
import { setHandoffJson, takeHandoffJson } from '../pendingHandoff';
import { openSectionSurface } from '../sectionSurface';
import type { GameId } from './types';

export const GAME_ARENA_SELECT_EVENT = 'game-arena:select';

export interface ArenaGameRequest {
  gameId: GameId;
  /** Start a session at once (the Arena still asks nothing it would not ask on Start). */
  autostart?: boolean;
  /** Draw the session from this material (`auto`, `folder:x`, `list:x`, `due`, `mined-today`). */
  material?: string;
  /** Session length override, e.g. a short warm-up. */
  rounds?: number;
}

export function requestArenaGame(request: ArenaGameRequest): void {
  setHandoffJson('gameArenaSelect', request);
  try {
    window.dispatchEvent(new CustomEvent(GAME_ARENA_SELECT_EVENT, { detail: request }));
  } catch {
    /* no window: nothing mounted to tell */
  }
  openSectionSurface('games');
}

/** The parked request, once. A malformed one is dropped. */
export function takeArenaGameRequest(): ArenaGameRequest | null {
  const raw = takeHandoffJson<Partial<ArenaGameRequest>>('gameArenaSelect');
  if (!raw || typeof raw !== 'object' || typeof raw.gameId !== 'string' || !raw.gameId) return null;
  return {
    gameId: raw.gameId as GameId,
    ...(raw.autostart === true ? { autostart: true } : {}),
    ...(typeof raw.material === 'string' && raw.material ? { material: raw.material.slice(0, 200) } : {}),
    ...(typeof raw.rounds === 'number' && Number.isFinite(raw.rounds)
      ? { rounds: Math.min(30, Math.max(3, Math.round(raw.rounds))) }
      : {}),
  };
}

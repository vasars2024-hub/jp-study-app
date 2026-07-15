/**
 * CityService — main-process state owner for the Noctis Civilization Module.
 *
 * The single source of truth and single writer of civilization data
 * (ARCHITECTURE.md Section 3). It owns native file I/O, the wall clock, and
 * IPC publication, and delegates every simulation fact to the pure engine
 * boundary — CityService reads clocks and files; the engine never does.
 *
 * All three lifecycle flows of ARCHITECTURE.md Section 6 live here:
 * initialization (load-or-create, one elapsed-time evaluation), in-session
 * ingestion (recordSession), and write-through teardown.
 */

import { evaluate } from '../engine';
import { createInitialState } from '../engine/state';
import { CivilizationState, EngineEventFlag, InterpretedLearningInput } from '../engine/types';
import { CityStateMessage } from '../ipc/channels';
import { loadEnvelope, saveState } from './persistence';

/** How the wall clock and a fresh seed reach the service, injectable for tests. */
export interface CityClock {
  now(): number; // epoch milliseconds
  seed(): number; // committed once at first-ever creation
}

const systemClock: CityClock = {
  now: () => Date.now(),
  seed: () => (Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0,
};

const MS_PER_MINUTE = 60000;

export class CityService {
  private state: CivilizationState;
  private lastFlags: EngineEventFlag[] = [];
  private savedAt: number;
  private readonly clock: CityClock;
  private readonly broadcast: (message: CityStateMessage) => void;

  private constructor(
    state: CivilizationState,
    savedAt: number,
    clock: CityClock,
    broadcast: (message: CityStateMessage) => void,
  ) {
    this.state = state;
    this.savedAt = savedAt;
    this.clock = clock;
    this.broadcast = broadcast;
  }

  /**
   * Initialization (ARCHITECTURE.md Section 6, flow 1). Loads the local save
   * or generates the initial state, then evaluates the elapsed real-world
   * delta since the last save exactly once — the offline decay checkpoint —
   * and persists atomically with a fresh timestamp.
   */
  static init(
    broadcast: (message: CityStateMessage) => void,
    clock: CityClock = systemClock,
  ): CityService {
    const now = clock.now();
    const loaded = loadEnvelope();

    let state: CivilizationState;
    let elapsedMinutes: number;
    if (loaded) {
      state = loaded.state;
      elapsedMinutes = Math.max(0, (now - loaded.savedAt) / MS_PER_MINUTE);
    } else {
      state = createInitialState(clock.seed());
      elapsedMinutes = 0;
    }

    const service = new CityService(state, now, clock, broadcast);
    // The launch checkpoint: pure elapsed-time evaluation, no learning input.
    const { state: next, flags } = evaluate(state, null, elapsedMinutes);
    service.state = next;
    service.lastFlags = flags;
    service.commit(now);
    return service;
  }

  /** The current snapshot with the flags from its most recent evaluation. */
  getState(): CityStateMessage {
    return { state: this.state, flags: this.lastFlags };
  }

  /**
   * In-session ingestion (ARCHITECTURE.md Section 6, flow 2). Evaluates an
   * interpreted learning input against the current snapshot, including the
   * elapsed time since the last commit, persists atomically, and broadcasts
   * the unified result to all windows.
   */
  recordSession(input: InterpretedLearningInput): CityStateMessage {
    const now = this.clock.now();
    const elapsedMinutes = Math.max(0, (now - this.savedAt) / MS_PER_MINUTE);
    const { state: next, flags } = evaluate(this.state, input, elapsedMinutes);
    this.state = next;
    this.lastFlags = flags;
    this.commit(now);
    const message = this.getState();
    this.broadcast(message);
    return message;
  }

  /**
   * Optional teardown stamp (ARCHITECTURE.md Section 6, flow 4). Persistence
   * is already write-through, so this only narrows the offline-delta window
   * on a clean quit; it never mutates simulation state.
   */
  stampOnQuit(): void {
    this.commit(this.clock.now());
  }

  /** Atomic write-through with a fresh timestamp (the service owns the clock). */
  private commit(now: number): void {
    this.savedAt = now;
    saveState(this.state, now);
  }
}

import {
  CivilizationState,
  EngineEventFlag,
  InterpretedLearningInput,
  advanceCivilizationTime,
  createInitialState,
  evaluateCivilization,
} from '../engine';
import { CITY_WIRE_VERSION, CityStateMessage } from '../ipc/channels';
import { CityStorage } from './persistence';

export interface CityClock {
  now(): number;
  seed(): number;
}

const MS_PER_MINUTE = 60000;
const IDEMPOTENCY_HISTORY_LIMIT = 512;

export class CityService {
  private state: CivilizationState;
  private lastFlags: EngineEventFlag[] = [];
  private savedAt: number;
  private appliedSessionIds: string[];
  private readonly appliedSessionSet: Set<string>;
  private readonly clock: CityClock;
  private readonly storage: CityStorage;
  private readonly broadcast: (message: CityStateMessage) => void;
  private mutationQueue: Promise<void> = Promise.resolve();

  private constructor(
    state: CivilizationState,
    savedAt: number,
    appliedSessionIds: string[],
    clock: CityClock,
    storage: CityStorage,
    broadcast: (message: CityStateMessage) => void,
  ) {
    this.state = state;
    this.savedAt = savedAt;
    this.appliedSessionIds = appliedSessionIds.slice(-IDEMPOTENCY_HISTORY_LIMIT);
    this.appliedSessionSet = new Set(this.appliedSessionIds);
    this.clock = clock;
    this.storage = storage;
    this.broadcast = broadcast;
  }

  static init(
    broadcast: (message: CityStateMessage) => void,
    clock: CityClock,
    storage: CityStorage,
  ): CityService {
    const now = Math.max(0, clock.now());
    const loaded = storage.load().envelope;
    const state = loaded ? loaded.state : createInitialState(clock.seed());
    const elapsedMinutes = loaded ? Math.max(0, (now - loaded.savedAt) / MS_PER_MINUTE) : 0;
    const checkpoint = advanceCivilizationTime(state, elapsedMinutes);
    const service = new CityService(
      checkpoint.state,
      now,
      loaded ? loaded.appliedSessionIds : [],
      clock,
      storage,
      broadcast,
    );
    service.lastFlags = checkpoint.flags;
    service.storage.save(service.state, now, service.appliedSessionIds);
    return service;
  }

  getState(): CityStateMessage {
    return {
      schemaVersion: CITY_WIRE_VERSION,
      state: JSON.parse(JSON.stringify(this.state)) as CivilizationState,
      flags: this.lastFlags.slice(),
    };
  }

  /** Serialized write-through ingestion; a failed save never commits memory or broadcasts. */
  recordSession(idempotencyKey: string, input: InterpretedLearningInput): Promise<CityStateMessage> {
    let resolveResult: (message: CityStateMessage) => void;
    let rejectResult: (error: unknown) => void;
    const result = new Promise<CityStateMessage>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    this.mutationQueue = this.mutationQueue.then(() => {
      if (this.appliedSessionSet.has(idempotencyKey)) {
        resolveResult(this.getState());
        return;
      }
      try {
        const now = Math.max(this.savedAt, this.clock.now());
        const elapsedMinutes = Math.max(0, (now - this.savedAt) / MS_PER_MINUTE);
        const evaluated = evaluateCivilization(this.state, input, elapsedMinutes);
        const ids = this.appliedSessionIds.concat(idempotencyKey).slice(-IDEMPOTENCY_HISTORY_LIMIT);
        this.storage.save(evaluated.state, now, ids);
        this.state = evaluated.state;
        this.lastFlags = evaluated.flags;
        this.savedAt = now;
        this.appliedSessionIds = ids;
        this.appliedSessionSet.clear();
        ids.forEach((id) => this.appliedSessionSet.add(id));
        const message = this.getState();
        this.broadcast(message);
        resolveResult(message);
      } catch (error) {
        rejectResult(error);
      }
    }, () => undefined);
    return result;
  }

  /** Clean-quit timestamp stamp; it never evaluates or mutates civilization state. */
  stampOnQuit(): void {
    const now = Math.max(this.savedAt, this.clock.now());
    this.storage.save(this.state, now, this.appliedSessionIds);
    this.savedAt = now;
  }
}

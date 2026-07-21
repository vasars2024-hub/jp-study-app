import { hasMeaningfulTelemetry, interpretTelemetry } from '../main/city/engine/interpretation';
import {
  GameRoundResult,
  TelemetryWindow,
  WritingEvaluation,
} from '../main/city/engine/types';
import {
  CITY_WIRE_VERSION,
  CitySessionPacket,
  CityStateMessage,
} from '../main/city/ipc/channels';

export const CITY_SESSION_STORAGE_KEY = 'noctis-session-queue-v2';
const CITY_SESSION_STORAGE_VERSION = 2;

export interface CitySessionKeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface CityTelemetrySnapshot {
  streak: number;
  knowledgeCounts: { learning: number; familiar: number; known: number };
  savedCount: number;
  userLevel: number;
  levelCoverage: number;
}

interface SessionAccumulator {
  focusSeconds: number;
  chars: number;
  bookIds: string[];
  flashcardEventCount: number;
  achievementCount: number;
  knowledgeChangeCount: number;
  pronunciationAttempts: number;
  gameResults: GameRoundResult[];
  writingEvaluations: WritingEvaluation[];
}

interface PersistedSessionQueue {
  version: number;
  clientId: string;
  nextSequence: number;
  accumulator: SessionAccumulator;
  pending: CitySessionPacket[];
  seenBooks: string[];
  lastSavedCount: number | null;
  lastUserLevel: number | null;
}

function emptyAccumulator(): SessionAccumulator {
  return {
    focusSeconds: 0,
    chars: 0,
    bookIds: [],
    flashcardEventCount: 0,
    achievementCount: 0,
    knowledgeChangeCount: 0,
    pronunciationAttempts: 0,
    gameResults: [],
    writingEvaluations: [],
  };
}

function freshState(clientId: string): PersistedSessionQueue {
  return {
    version: CITY_SESSION_STORAGE_VERSION,
    clientId,
    nextSequence: 1,
    accumulator: emptyAccumulator(),
    pending: [],
    seenBooks: [],
    lastSavedCount: null,
    lastUserLevel: null,
  };
}

function finiteNonNegative(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function loadState(store: CitySessionKeyValueStore, fallbackClientId: string): PersistedSessionQueue {
  try {
    const parsed = JSON.parse(store.getItem(CITY_SESSION_STORAGE_KEY) || 'null') as Partial<PersistedSessionQueue> | null;
    if (!parsed || parsed.version !== CITY_SESSION_STORAGE_VERSION
      || typeof parsed.clientId !== 'string' || !Array.isArray(parsed.pending)
      || !parsed.accumulator || !Array.isArray(parsed.seenBooks)) return freshState(fallbackClientId);
    return {
      version: CITY_SESSION_STORAGE_VERSION,
      clientId: parsed.clientId,
      nextSequence: Math.max(1, Math.floor(finiteNonNegative(parsed.nextSequence))),
      accumulator: {
        ...emptyAccumulator(),
        ...parsed.accumulator,
        bookIds: Array.isArray(parsed.accumulator.bookIds) ? parsed.accumulator.bookIds.filter((id) => typeof id === 'string') : [],
        gameResults: Array.isArray(parsed.accumulator.gameResults) ? parsed.accumulator.gameResults : [],
        writingEvaluations: Array.isArray(parsed.accumulator.writingEvaluations) ? parsed.accumulator.writingEvaluations : [],
      },
      pending: parsed.pending,
      seenBooks: parsed.seenBooks.filter((id) => typeof id === 'string'),
      lastSavedCount: typeof parsed.lastSavedCount === 'number' ? parsed.lastSavedCount : null,
      lastUserLevel: typeof parsed.lastUserLevel === 'number' ? parsed.lastUserLevel : null,
    };
  } catch {
    return freshState(fallbackClientId);
  }
}

/**
 * Renderer-local durable queue. Raw telemetry stays only in this local store;
 * each pending wire packet contains the irreversible interpreted projection.
 */
export class DurableCitySessionQueue {
  private state: PersistedSessionQueue;
  private drainPromise: Promise<boolean> | null = null;

  constructor(
    private readonly store: CitySessionKeyValueStore,
    private readonly send: (packet: CitySessionPacket) => Promise<CityStateMessage>,
    clientId: string,
  ) {
    this.state = loadState(store, clientId.replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 48) || 'renderer-client');
    this.persist();
  }

  addReading(seconds: number, chars: number, bookId?: string): void {
    this.state.accumulator.focusSeconds += finiteNonNegative(seconds);
    this.state.accumulator.chars += finiteNonNegative(chars);
    if (bookId && this.state.accumulator.bookIds.indexOf(bookId) < 0) this.state.accumulator.bookIds.push(bookId);
    this.persist();
  }

  addFlashcard(): void {
    this.state.accumulator.flashcardEventCount += 1;
    this.persist();
  }

  addAchievement(): void {
    this.state.accumulator.achievementCount += 1;
    this.persist();
  }

  addKnowledgeChange(count = 1): void {
    this.state.accumulator.knowledgeChangeCount += Math.max(1, Math.floor(finiteNonNegative(count)));
    this.persist();
  }

  addPronunciationAttempt(): void {
    this.state.accumulator.pronunciationAttempts += 1;
    this.persist();
  }

  addGameResult(result: GameRoundResult): void {
    this.state.accumulator.gameResults.push(result);
    this.persist();
  }

  addWritingEvaluation(result: WritingEvaluation): void {
    this.state.accumulator.writingEvaluations.push(result);
    this.persist();
  }

  focusSeconds(): number {
    return this.state.accumulator.focusSeconds;
  }

  pendingCount(): number {
    return this.state.pending.length;
  }

  /** Atomically converts and queues a window before any asynchronous send begins. */
  flush(snapshot: CityTelemetrySnapshot): Promise<boolean> {
    const accumulator = this.state.accumulator;
    const seen = new Set(this.state.seenBooks);
    let newBooks = 0;
    accumulator.bookIds.forEach((id) => {
      if (!seen.has(id)) {
        seen.add(id);
        newBooks += 1;
      }
    });
    const savedBefore = this.state.lastSavedCount === null ? snapshot.savedCount : this.state.lastSavedCount;
    const levelBefore = this.state.lastUserLevel === null ? snapshot.userLevel : this.state.lastUserLevel;
    const window: TelemetryWindow = {
      focusSeconds: accumulator.focusSeconds,
      chars: accumulator.chars,
      streak: snapshot.streak,
      knowledgeCounts: snapshot.knowledgeCounts,
      savedWordDelta: Math.max(0, snapshot.savedCount - savedBefore),
      flashcardEventCount: accumulator.flashcardEventCount,
      achievementCount: accumulator.achievementCount,
      knowledgeChangeCount: accumulator.knowledgeChangeCount,
      distinctBooks: accumulator.bookIds.length,
      newBooks,
      gameResults: accumulator.gameResults,
      writingEvaluations: accumulator.writingEvaluations,
      userLevel: snapshot.userLevel,
      levelCoverage: snapshot.levelCoverage,
      levelUp: snapshot.userLevel > levelBefore,
      pronunciationAttempts: accumulator.pronunciationAttempts,
    };

    this.state.lastSavedCount = snapshot.savedCount;
    this.state.lastUserLevel = snapshot.userLevel;
    this.state.seenBooks = Array.from(seen);
    if (hasMeaningfulTelemetry(window)) {
      const packet: CitySessionPacket = {
        schemaVersion: CITY_WIRE_VERSION,
        idempotencyKey: `city:${this.state.clientId}:${this.state.nextSequence}`,
        input: interpretTelemetry(window),
      };
      this.state.nextSequence += 1;
      this.state.pending.push(packet);
      this.state.accumulator = emptyAccumulator();
    }
    this.persist();
    return this.drain();
  }

  retry(): Promise<boolean> {
    return this.drain();
  }

  private drain(): Promise<boolean> {
    if (this.drainPromise) return this.drainPromise;
    this.drainPromise = (async () => {
      while (this.state.pending.length > 0) {
        const packet = this.state.pending[0];
        try {
          await this.send(packet);
        } catch {
          return false;
        }
        const index = this.state.pending.findIndex((candidate) => candidate.idempotencyKey === packet.idempotencyKey);
        if (index >= 0) this.state.pending.splice(index, 1);
        this.persist();
      }
      return true;
    })().then((result) => {
      this.drainPromise = null;
      return result;
    }, () => {
      this.drainPromise = null;
      return false;
    });
    return this.drainPromise;
  }

  private persist(): void {
    this.store.setItem(CITY_SESSION_STORAGE_KEY, JSON.stringify(this.state));
  }
}

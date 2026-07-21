import { DurableCitySessionQueue, CityTelemetrySnapshot } from './citySessionQueue';
import { recordCitySession } from './cityState';
import { onCompanionEvent } from './environment/companionEvents';
import { knowledgeCounts } from './knownWords';
import { getLevelReport, getUserLevel, onLevelChange } from './levelService';
import { loadSaved, onSavedChanged } from './savedWords';
import { getSummary, READING_RECORDED_EVENT, ReadingDelta } from './stats';

const FLUSH_THRESHOLD_SECONDS = 60;
const IDLE_CHECKPOINT_MS = 15000;

function clientId(): string {
  try {
    return `renderer-${crypto.randomUUID()}`;
  } catch {
    return `renderer-${Math.floor(Math.random() * 0xffffffff).toString(36)}-local`;
  }
}

function snapshot(): CityTelemetrySnapshot {
  const counts = knowledgeCounts();
  const slots = getLevelReport().slots.filter((slot) => slot.total > 0);
  const levelCoverage = slots.length > 0
    ? slots.reduce((sum, slot) => sum + slot.pct, 0) / slots.length / 100
    : 0;
  return {
    streak: getSummary().streak,
    knowledgeCounts: { learning: counts[1], familiar: counts[2], known: counts[3] },
    savedCount: loadSaved().length,
    userLevel: getUserLevel(),
    levelCoverage,
  };
}

let started = false;
let idleCheckpoint: number | null = null;
let queue: DurableCitySessionQueue | null = null;

function currentQueue(): DurableCitySessionQueue {
  if (!queue) queue = new DurableCitySessionQueue(localStorage, recordCitySession, clientId());
  return queue;
}

function flush(): void {
  void currentQueue().flush(snapshot());
}

function scheduleIdleCheckpoint(): void {
  if (idleCheckpoint !== null) window.clearTimeout(idleCheckpoint);
  idleCheckpoint = window.setTimeout(() => {
    idleCheckpoint = null;
    flush();
  }, IDLE_CHECKPOINT_MS);
}

function onReading(delta: ReadingDelta): void {
  const delivery = currentQueue();
  delivery.addReading(delta.seconds, delta.chars, delta.bookId);
  if (delivery.focusSeconds() >= FLUSH_THRESHOLD_SECONDS) flush();
  else scheduleIdleCheckpoint();
}

/** Wires every real telemetry adapter once; delivery retry starts immediately. */
export function startCitySession(): void {
  if (started) return;
  started = true;
  const delivery = currentQueue();
  // Establish baselines and recover any persisted partial/pending window.
  void delivery.flush(snapshot());

  window.addEventListener(READING_RECORDED_EVENT, (event) => {
    onReading((event as CustomEvent<ReadingDelta>).detail);
  });
  window.addEventListener('word-knowledge-changed', (event) => {
    const words = (event as CustomEvent<string[]>).detail;
    delivery.addKnowledgeChange(Array.isArray(words) ? words.length : 1);
    scheduleIdleCheckpoint();
  });
  onSavedChanged(scheduleIdleCheckpoint);
  onLevelChange(scheduleIdleCheckpoint);
  onCompanionEvent((event) => {
    if (event.kind === 'flashcard') delivery.addFlashcard();
    if (event.kind === 'achievement') delivery.addAchievement();
    if (event.kind === 'flashcard' || event.kind === 'achievement') scheduleIdleCheckpoint();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', flush);
}

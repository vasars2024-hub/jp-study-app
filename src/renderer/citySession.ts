// The Noctis civilization module's telemetry collector (ARCHITECTURE.md
// Section 3, "In-Session Ingestion"; LEARNING_INTEGRATION.md Sections 3-4).
//
// Real study activity reaches the city through existing renderer signals —
// reading deltas, word-knowledge changes, saved words, level progress, and
// the companion event bus — never through anything the city imports or
// knows about directly (stats.ts's own comment: "without the readers having
// to know the city exists"). This module aggregates those signals into a
// rolling TelemetryWindow, runs it through the interpretation membrane
// in-process (so the counts-only, irreversible InterpretedLearningInput is
// the only thing that ever crosses IPC — Section 9), and flushes it to the
// main-process CityService via cityState.recordCitySession.
//
// interpretTelemetry is a pure function (zero Electron/Node/DOM imports,
// exactly like the rest of engine/) — running it here, not after the IPC
// hop, is what keeps raw telemetry off the wire entirely.

import { interpretTelemetry } from '../main/city/engine/interpretation';
import type { TelemetryWindow } from '../main/city/engine/types';
import { READING_RECORDED_EVENT, getSummary, type ReadingDelta } from './stats';
import { knowledgeCounts } from './knownWords';
import { loadSaved } from './savedWords';
import { onCompanionEvent } from './environment/companionEvents';
import { getLevelReport, getUserLevel } from './levelService';
import { recordCitySession } from './cityState';

/** Flush once accumulated focus time reaches this many seconds. */
const FLUSH_THRESHOLD_SECONDS = 60;

const SEEN_BOOKS_KEY = 'city-session-seen-books';
const LAST_LEVEL_KEY = 'city-session-last-level';
const LAST_SAVED_COUNT_KEY = 'city-session-last-saved-count';

function loadSeenBooks(): Set<string> {
  try {
    const raw = localStorage.getItem(SEEN_BOOKS_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveSeenBooks(ids: Set<string>): void {
  try {
    localStorage.setItem(SEEN_BOOKS_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage unavailable — next window just re-derives "new" a bit loosely */
  }
}

function loadIntOr(key: string, fallback: number): number {
  const raw = Number(localStorage.getItem(key));
  return Number.isFinite(raw) ? raw : fallback;
}

interface Accumulator {
  focusSeconds: number;
  chars: number;
  bookIds: Set<string>;
  flashcardEventCount: number;
  achievementCount: number;
}

function freshAccumulator(): Accumulator {
  return { focusSeconds: 0, chars: 0, bookIds: new Set(), flashcardEventCount: 0, achievementCount: 0 };
}

let acc = freshAccumulator();
let started = false;

/** Average Familiar-or-better coverage across every tracked level slot, 0..1. */
function meanLevelCoverage(): number {
  const slots = getLevelReport().slots.filter((s) => s.total > 0);
  if (slots.length === 0) return 0;
  return slots.reduce((sum, s) => sum + s.pct, 0) / slots.length / 100;
}

function buildWindow(): TelemetryWindow {
  const counts = knowledgeCounts();
  const streak = getSummary().streak;

  const seenBooks = loadSeenBooks();
  let newBooks = 0;
  for (const id of acc.bookIds) {
    if (!seenBooks.has(id)) {
      newBooks += 1;
      seenBooks.add(id);
    }
  }
  saveSeenBooks(seenBooks);

  const savedNow = loadSaved().length;
  const savedBefore = loadIntOr(LAST_SAVED_COUNT_KEY, savedNow);
  const savedWordDelta = Math.max(0, savedNow - savedBefore);
  localStorage.setItem(LAST_SAVED_COUNT_KEY, String(savedNow));

  const userLevel = getUserLevel();
  const lastLevel = loadIntOr(LAST_LEVEL_KEY, userLevel);
  const levelUp = userLevel > lastLevel;
  localStorage.setItem(LAST_LEVEL_KEY, String(userLevel));

  return {
    focusSeconds: acc.focusSeconds,
    chars: acc.chars,
    streak,
    knowledgeCounts: { learning: counts[1], familiar: counts[2], known: counts[3] },
    savedWordDelta,
    flashcardEventCount: acc.flashcardEventCount,
    achievementCount: acc.achievementCount,
    distinctBooks: acc.bookIds.size,
    newBooks,
    userLevel,
    levelCoverage: meanLevelCoverage(),
    levelUp,
  };
}

/** Interpret the accumulated window and send it to the main process, then reset. */
function flush(): void {
  if (acc.focusSeconds <= 0 && acc.chars <= 0) return;
  const telemetryWindow = buildWindow();
  acc = freshAccumulator();
  const input = interpretTelemetry(telemetryWindow);
  recordCitySession(input).catch((err) => console.error('[citySession] flush failed:', err));
}

function onReading(delta: ReadingDelta): void {
  acc.focusSeconds += Math.max(0, delta.seconds);
  acc.chars += Math.max(0, delta.chars);
  if (delta.bookId) acc.bookIds.add(delta.bookId);
  if (acc.focusSeconds >= FLUSH_THRESHOLD_SECONDS) flush();
}

/** Wire the collector's listeners once at app boot. Idempotent. */
export function startCitySession(): void {
  if (started) return;
  started = true;

  window.addEventListener(READING_RECORDED_EVENT, (e) => {
    onReading((e as CustomEvent<ReadingDelta>).detail);
  });

  onCompanionEvent((e) => {
    if (e.kind === 'flashcard') acc.flashcardEventCount += 1;
    else if (e.kind === 'achievement') acc.achievementCount += 1;
  });

  // Don't lose a partial window that never crossed the flush threshold.
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('beforeunload', flush);
}

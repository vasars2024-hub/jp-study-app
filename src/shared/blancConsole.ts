// Blanc developer console (Pillar 5) — the append-only event log.
//
// The plan's framing, kept because it is the whole design: `notificationStore`
// is the closest existing thing, but it is toast-shaped and capped at 100
// entries, so it is the wrong backbone for a log. The notification centre stays
// the *summary* surface; this is the *detail* surface. "Where did that card go,
// what got mined, what failed, why."
//
// This module is the pure part: the ring buffer, the entry shape, filtering, and
// the bug-report export. No DOM, no timers, no window — so it tests directly.

export type ConsoleLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Categories are a closed set on purpose. A free-text category would drift
 * ('mine' / 'mining' / 'Mining') and make filter-by-category useless within a
 * week.
 */
export type ConsoleCategory =
  | 'mining'
  | 'deck'
  | 'anki'
  | 'dictionary'
  | 'import'
  | 'download'
  | 'ipc'
  | 'ui'
  | 'system';

export const CONSOLE_CATEGORIES: ConsoleCategory[] = [
  'mining', 'deck', 'anki', 'dictionary', 'import', 'download', 'ipc', 'ui', 'system',
];

export interface ConsoleEntry {
  /** Monotonic within a session; also the stable React key. */
  id: number;
  at: number;
  level: ConsoleLevel;
  category: ConsoleCategory;
  message: string;
  /**
   * Structured detail. Kept as unknown and rendered as JSON rather than typed
   * per category — a log that rejects an unexpected payload loses exactly the
   * information you opened it for.
   */
  detail?: unknown;
  /**
   * Ties related entries together across a flow: one mine → deck write → Anki
   * push shares an id, so "where did that card go" is one filter rather than
   * three guesses from timestamps.
   */
  correlationId?: string;
}

/** What a caller supplies; the buffer assigns `id` and `at`. */
export type ConsoleInput = Omit<ConsoleEntry, 'id' | 'at'> & { at?: number };

export const CONSOLE_CAPACITY = 2000;

/**
 * Fixed-capacity append-only log.
 *
 * Drops oldest-first at capacity and counts what it dropped, because a log that
 * silently loses its head is worse than one that admits it — the same honesty
 * rule `toolboxFileSearch` follows for truncated results.
 */
export class ConsoleBuffer {
  private entries: ConsoleEntry[] = [];
  private nextId = 1;
  private dropped = 0;

  constructor(private readonly capacity: number = CONSOLE_CAPACITY) {}

  push(input: ConsoleInput): ConsoleEntry {
    const entry: ConsoleEntry = {
      id: this.nextId++,
      at: input.at ?? Date.now(),
      level: input.level,
      category: input.category,
      message: input.message,
      detail: input.detail,
      correlationId: input.correlationId,
    };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) {
      this.dropped += this.entries.length - this.capacity;
      this.entries = this.entries.slice(-this.capacity);
    }
    return entry;
  }

  /** Newest first — the order the panel reads in. */
  list(): ConsoleEntry[] {
    return [...this.entries].reverse();
  }

  get size(): number {
    return this.entries.length;
  }

  /** How many entries fell off the start of the buffer this session. */
  get droppedCount(): number {
    return this.dropped;
  }

  clear(): void {
    this.entries = [];
    this.dropped = 0;
  }
}

export interface ConsoleFilter {
  categories?: ConsoleCategory[];
  levels?: ConsoleLevel[];
  /** Matched against message, category, and the serialised detail. */
  query?: string;
}

const LEVEL_RANK: Record<ConsoleLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

/** Serialise a detail payload for search and display. Never throws. */
export function detailToText(detail: unknown): string {
  if (detail === undefined || detail === null) return '';
  if (typeof detail === 'string') return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    // Circular structures are common in DOM/event payloads and must not break
    // the log that exists to record them.
    return String(detail);
  }
}

export function filterEntries(entries: readonly ConsoleEntry[], filter: ConsoleFilter): ConsoleEntry[] {
  const cats = filter.categories?.length ? new Set(filter.categories) : null;
  const levels = filter.levels?.length ? new Set(filter.levels) : null;
  const q = filter.query?.trim().toLowerCase() ?? '';
  return entries.filter((e) => {
    if (cats && !cats.has(e.category)) return false;
    if (levels && !levels.has(e.level)) return false;
    if (!q) return true;
    return `${e.message} ${e.category} ${detailToText(e.detail)}`.toLowerCase().includes(q);
  });
}

/** Counts per level, for the panel's summary row. */
export function countByLevel(entries: readonly ConsoleEntry[]): Record<ConsoleLevel, number> {
  const out: Record<ConsoleLevel, number> = { debug: 0, info: 0, warn: 0, error: 0 };
  for (const e of entries) out[e.level] += 1;
  return out;
}

/** True when `entry` is at least as severe as `min`. */
export function atLeastLevel(entry: ConsoleEntry, min: ConsoleLevel): boolean {
  return LEVEL_RANK[entry.level] >= LEVEL_RANK[min];
}

/**
 * Plain-text export for pasting into a bug report.
 *
 * Deliberately not JSON: the point is that someone can read it in a message and
 * see what happened, and a wall of JSON gets truncated by whoever receives it.
 */
export function formatEntriesForReport(entries: readonly ConsoleEntry[]): string {
  return entries
    .map((e) => {
      const time = new Date(e.at).toISOString();
      const corr = e.correlationId ? ` [${e.correlationId}]` : '';
      const detail = detailToText(e.detail);
      return `${time} ${e.level.toUpperCase().padEnd(5)} ${e.category}${corr} ${e.message}${detail ? `\n    ${detail}` : ''}`;
    })
    .join('\n');
}

// Reading statistics, stored in localStorage. We track, per calendar day, how
// many seconds were spent reading and (approximately) how many characters were
// read, plus a per-book tally. The Statistics tab turns this into totals, a
// day-streak, and a simple recent-days chart. Everything is local + offline.

const KEY = 'jp-study-stats-v1';

interface DayEntry {
  seconds: number;
  chars: number;
}
interface BookEntry {
  title: string;
  seconds: number;
  chars: number;
  lastRead: number;
}
interface StatsData {
  days: Record<string, DayEntry>; // key = YYYY-MM-DD (local)
  books: Record<string, BookEntry>; // key = library item id
}

export interface StatsSyncPayload {
  dayKey: string;
  todayChars: number;
  streak: number;
}

/** Fired on window after each recordReading() flush; detail = ReadingDelta. */
export const READING_RECORDED_EVENT = 'jp-reading-recorded';

export interface ReadingDelta {
  bookId: string;
  title: string;
  seconds: number;
  chars: number;
}

export interface DayStat {
  date: string; // YYYY-MM-DD
  seconds: number;
  chars: number;
}
export interface BookStat {
  id: string;
  title: string;
  seconds: number;
  chars: number;
  lastRead: number;
}
export interface StatsSummary {
  totalSeconds: number;
  totalChars: number;
  daysActive: number;
  streak: number; // consecutive days ending today (or yesterday)
  todaySeconds: number;
  todayChars: number;
  recent: DayStat[]; // last 14 days, oldest → newest (includes empty days)
  books: BookStat[]; // most-recently-read first
}

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the user). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayDayKey(): string {
  return dayKey(new Date());
}

function load(): StatsData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { days: {}, books: {} };
    const parsed = JSON.parse(raw) as Partial<StatsData>;
    return { days: parsed.days ?? {}, books: parsed.books ?? {} };
  } catch {
    return { days: {}, books: {} };
  }
}

function save(d: StatsData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* storage full/unavailable — stats just won't persist */
  }
}

/**
 * Add a chunk of reading to today's totals and the book's tally. Called
 * periodically by the reader (every few seconds and on close). `seconds` and
 * `chars` are the amounts accrued *since the last call*.
 */
export function recordReading(
  bookId: string,
  title: string,
  seconds: number,
  chars: number,
): void {
  if (seconds <= 0 && chars <= 0) return;
  const data = load();
  const key = dayKey(new Date());

  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  day.seconds += Math.max(0, seconds);
  day.chars += Math.max(0, chars);
  data.days[key] = day;

  const book = data.books[bookId] ?? { title, seconds: 0, chars: 0, lastRead: 0 };
  book.title = title || book.title;
  book.seconds += Math.max(0, seconds);
  book.chars += Math.max(0, chars);
  book.lastRead = Date.now();
  data.books[bookId] = book;

  save(data);

  // Let listeners (the city engine bridge) react to fresh reading activity
  // without the readers having to know the city exists.
  try {
    window.dispatchEvent(
      new CustomEvent<ReadingDelta>(READING_RECORDED_EVENT, {
        detail: { bookId, title, seconds, chars },
      }),
    );
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

/** Consecutive days (ending today or yesterday) that have any reading time. */
function computeStreak(days: Record<string, DayEntry>): number {
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to "end" yesterday if nothing's been read yet today.
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const e = days[dayKey(cursor)];
    if (e && e.seconds > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function getSummary(): StatsSummary {
  const data = load();
  const dayKeys = Object.keys(data.days);

  let totalSeconds = 0;
  let totalChars = 0;
  for (const k of dayKeys) {
    totalSeconds += data.days[k].seconds;
    totalChars += data.days[k].chars;
  }

  const todayK = dayKey(new Date());
  const today = data.days[todayK] ?? { seconds: 0, chars: 0 };

  const recent: DayStat[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const e = data.days[k] ?? { seconds: 0, chars: 0 };
    recent.push({ date: k, seconds: e.seconds, chars: e.chars });
  }

  const books: BookStat[] = Object.entries(data.books)
    .map(([id, b]) => ({ id, title: b.title, seconds: b.seconds, chars: b.chars, lastRead: b.lastRead }))
    .sort((a, b) => b.lastRead - a.lastRead);

  return {
    totalSeconds,
    totalChars,
    daysActive: dayKeys.filter((k) => data.days[k].seconds > 0).length,
    streak: computeStreak(data.days),
    todaySeconds: today.seconds,
    todayChars: today.chars,
    recent,
    books,
  };
}

export function getSyncPayload(): StatsSyncPayload {
  const data = load();
  const key = todayDayKey();
  const today = data.days[key] ?? { seconds: 0, chars: 0 };
  return {
    dayKey: key,
    todayChars: today.chars,
    streak: computeStreak(data.days),
  };
}

export function resetStats(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** "1h 23m", "12m", "45s" — compact human duration. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** "12,345" grouped thousands. */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

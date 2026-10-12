// Visual novels, product pass 7.5: study around the captured lines.
//
// Pure. Main uses the reconnect policy; the renderer uses the rest:
//
// - mining context: the one or two lines before (and after) the mined line,
// - study preferences (context lines, screenshot, line study),
// - the line-study loop (hold on each new line, replay it N times),
// - per-novel glossary and known-word coverage over the captured script,
// - per-novel daily stats, and this capture session's AFK-aware reading speed,
// - the reader window's single-key hotkeys.
// Line cleanup and filters live in ./visualNovelLineFilters.

import type { VisualNovelTextCapture } from './visualNovel';

// --- texthooker reconnect policy ----------------------------------------------

export const VN5_RECONNECT_MIN_MS = 1_500;
export const VN5_RECONNECT_MAX_MS = 15_000;
/** A socket that has not opened (or said anything) by now is treated as dead and retried. */
export const VN5_CONNECT_TIMEOUT_MS = 10_000;
/** A connection must stay up this long before the backoff resets; a flapping server keeps backing off. */
export const VN5_STABLE_CONNECTION_MS = 10_000;
/** +/- share of the delay randomised, so several windows do not retry in lockstep. */
export const VN5_RECONNECT_JITTER = 0.2;

/** Delay before reconnect attempt `attempt` (0-based): exponential, capped, jittered. */
export function vn5ReconnectDelay(attempt: number, random: () => number = Math.random): number {
  const n = Math.max(0, Math.floor(attempt));
  const base = Math.min(VN5_RECONNECT_MAX_MS, VN5_RECONNECT_MIN_MS * 2 ** Math.min(n, 16));
  const r = Math.min(1, Math.max(0, random()));
  const jitter = (r * 2 - 1) * VN5_RECONNECT_JITTER;
  return Math.round(base * (1 + jitter));
}

// --- study preferences ----------------------------------------------------------

export type Vn5ContextLines = 0 | 1 | 2;

export interface Vn5StudyPrefs {
  /** Previous lines saved with a mined line, as context. */
  contextLines: Vn5ContextLines;
  /** Following lines saved with a mined line (only lines already captured, of course). */
  contextAfterLines: Vn5ContextLines;
  /** Attach the screenshot captured with (or just before) the line. */
  attachScreenshot: boolean;
  /** Line study: new lines wait until "Next" instead of replacing the current one. */
  holdNewLines: boolean;
  /** Line study: play each line as it becomes current. */
  autoPlay: boolean;
  /** Line study: how many times a line is played (1-3). */
  repeat: number;
}

export const VN5_DEFAULT_STUDY_PREFS: Vn5StudyPrefs = {
  contextLines: 1,
  contextAfterLines: 0,
  attachScreenshot: true,
  holdNewLines: false,
  autoPlay: false,
  repeat: 1,
};

export function vn5NormalizeStudyPrefs(raw: unknown): Vn5StudyPrefs {
  const r = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const context = Number(r.contextLines);
  const after = Number(r.contextAfterLines);
  const repeat = Math.round(Number(r.repeat));
  return {
    contextLines: context === 0 || context === 1 || context === 2 ? context : VN5_DEFAULT_STUDY_PREFS.contextLines,
    contextAfterLines: after === 0 || after === 1 || after === 2 ? after : VN5_DEFAULT_STUDY_PREFS.contextAfterLines,
    attachScreenshot: typeof r.attachScreenshot === 'boolean' ? r.attachScreenshot : VN5_DEFAULT_STUDY_PREFS.attachScreenshot,
    holdNewLines: r.holdNewLines === true,
    autoPlay: r.autoPlay === true,
    repeat: Number.isFinite(repeat) ? Math.min(3, Math.max(1, repeat)) : VN5_DEFAULT_STUDY_PREFS.repeat,
  };
}

// --- mining context -----------------------------------------------------------------

/** Lines further apart than this are a different scene, not context. */
export const VN5_CONTEXT_MAX_GAP_MS = 10 * 60_000;

type CaptureLike = Pick<VisualNovelTextCapture, 'id' | 'visualNovelId' | 'japanese' | 'speaker' | 'capturedAt' | 'kind'>
  & Partial<Pick<VisualNovelTextCapture, 'screenshotPath'>>;

/**
 * The `count` lines spoken right before `lineId`, oldest first. `captures` must
 * be in reading order (oldest first), as `capturesForVisualNovel` returns them.
 * System text and choices are skipped; a repeat of the mined line is skipped; a
 * long silence ends the context.
 */
export function vn5ContextBefore<T extends CaptureLike>(captures: readonly T[], lineId: string, count: number): T[] {
  const n = Math.max(0, Math.min(2, Math.floor(count)));
  if (n === 0) return [];
  const index = captures.findIndex((capture) => capture.id === lineId);
  if (index <= 0) return [];
  const line = captures[index];
  const out: T[] = [];
  let newer = line;
  for (let i = index - 1; i >= 0 && out.length < n; i--) {
    const prev = captures[i];
    if (prev.visualNovelId !== line.visualNovelId) continue;
    if (newer.capturedAt - prev.capturedAt > VN5_CONTEXT_MAX_GAP_MS) break;
    newer = prev;
    if (prev.kind === 'system' || prev.kind === 'choice') continue;
    if (!prev.japanese.trim() || prev.japanese.trim() === line.japanese.trim()) continue;
    out.unshift(prev);
  }
  return out;
}

/**
 * The `count` lines spoken right after `lineId`, in reading order — the other
 * half of an Anki-style context card. Same rules as `vn5ContextBefore`.
 */
export function vn5ContextAfter<T extends CaptureLike>(captures: readonly T[], lineId: string, count: number): T[] {
  const n = Math.max(0, Math.min(2, Math.floor(count)));
  if (n === 0) return [];
  const index = captures.findIndex((capture) => capture.id === lineId);
  if (index < 0) return [];
  const line = captures[index];
  const out: T[] = [];
  let older = line;
  for (let i = index + 1; i < captures.length && out.length < n; i++) {
    const next = captures[i];
    if (next.visualNovelId !== line.visualNovelId) continue;
    if (next.capturedAt - older.capturedAt > VN5_CONTEXT_MAX_GAP_MS) break;
    older = next;
    if (next.kind === 'system' || next.kind === 'choice') continue;
    if (!next.japanese.trim() || next.japanese.trim() === line.japanese.trim()) continue;
    out.push(next);
  }
  return out;
}

/** `【speaker】line` per row, the convention the hook parser reads back. */
export function vn5ContextText(lines: readonly Pick<CaptureLike, 'japanese' | 'speaker'>[]): string {
  return lines
    .map((line) => (line.speaker.trim() ? `【${line.speaker.trim()}】${line.japanese.trim()}` : line.japanese.trim()))
    .join('\n')
    .slice(0, 1000);
}

/**
 * The screenshot for a mined line: its own, else the most recent one captured
 * within `maxGapMs` before it (an OCR capture saves one image for the whole box).
 */
export function vn5ScreenshotFor<T extends CaptureLike>(
  captures: readonly T[],
  lineId: string,
  maxGapMs = 60_000,
): string {
  const index = captures.findIndex((capture) => capture.id === lineId);
  if (index < 0) return '';
  const line = captures[index];
  if (line.screenshotPath) return line.screenshotPath;
  for (let i = index - 1; i >= 0; i--) {
    const prev = captures[i];
    if (line.capturedAt - prev.capturedAt > maxGapMs) break;
    if (prev.visualNovelId === line.visualNovelId && prev.screenshotPath) return prev.screenshotPath;
  }
  return '';
}

// --- line study loop ------------------------------------------------------------

export interface Vn5LineStudyState {
  /** The line being studied. */
  currentId: string | null;
  /** Lines that arrived while holding, oldest first. */
  queue: string[];
  /** Plays left for the current line (auto-play). */
  playsLeft: number;
}

export type Vn5LineStudyEvent =
  | { type: 'line'; id: string }
  | { type: 'next' }
  | { type: 'replay' }
  | { type: 'played' }
  | { type: 'reset' };

export function vn5InitialLineStudy(): Vn5LineStudyState {
  return { currentId: null, queue: [], playsLeft: 0 };
}

/**
 * The loop, like the video player's auto-pause: when holding, a new line queues
 * behind the current one; "next" takes the oldest queued line. Without holding,
 * a new line replaces the current one at once. Each line that becomes current
 * gets `repeat` plays when auto-play is on; "replay" always grants one.
 */
export function vn5LineStudyReduce(
  state: Vn5LineStudyState,
  event: Vn5LineStudyEvent,
  prefs: Pick<Vn5StudyPrefs, 'holdNewLines' | 'autoPlay' | 'repeat'>,
): Vn5LineStudyState {
  const plays = prefs.autoPlay ? Math.max(1, prefs.repeat) : 0;
  switch (event.type) {
    case 'line': {
      if (event.id === state.currentId || state.queue.includes(event.id)) return state;
      if (prefs.holdNewLines && state.currentId) {
        return { ...state, queue: [...state.queue, event.id].slice(-200) };
      }
      return { currentId: event.id, queue: [], playsLeft: plays };
    }
    case 'next': {
      if (state.queue.length === 0) return state;
      const [nextId, ...rest] = state.queue;
      return { currentId: nextId, queue: rest, playsLeft: plays };
    }
    case 'replay':
      return state.currentId ? { ...state, playsLeft: Math.max(1, state.playsLeft) } : state;
    case 'played':
      return { ...state, playsLeft: Math.max(0, state.playsLeft - 1) };
    case 'reset':
      return vn5InitialLineStudy();
    default:
      return state;
  }
}

// --- glossary and known-word coverage -----------------------------------------------

export interface Vn5Token {
  lemma: string;
  surface: string;
  content: boolean;
  proper?: boolean;
}

export interface Vn5GlossaryRow {
  lemma: string;
  /** Times the word appears in the captured script. */
  count: number;
  level: number;
  /** The first line it appears in, for context. */
  example: string;
}

export interface Vn5Coverage {
  /** Content-word tokens in the script. */
  tokens: number;
  /** Share of those tokens at or above `knownAt` (0..1); null with no tokens. */
  knownRatio: number | null;
  uniqueWords: number;
  uniqueKnown: number;
  /** Most frequent words below `knownAt`, the novel's study glossary. */
  glossary: Vn5GlossaryRow[];
  /** Lines with exactly one unknown word. */
  iPlusOneLines: number;
}

export function vn5Coverage(
  lines: readonly { text: string; tokens: readonly Vn5Token[] }[],
  levelOf: (lemma: string) => number,
  opts: { knownAt?: number; limit?: number } = {},
): Vn5Coverage {
  const knownAt = opts.knownAt ?? 2;
  const limit = opts.limit ?? 40;
  let tokens = 0;
  let known = 0;
  let iPlusOneLines = 0;
  const words = new Map<string, Vn5GlossaryRow>();
  const levels = new Map<string, number>();
  const level = (lemma: string): number => {
    let value = levels.get(lemma);
    if (value === undefined) {
      value = levelOf(lemma);
      levels.set(lemma, value);
    }
    return value;
  };
  for (const line of lines) {
    let unknownInLine = 0;
    let contentInLine = 0;
    for (const token of line.tokens) {
      if (!token.content || token.proper || !token.lemma.trim()) continue;
      const lemma = token.lemma.trim();
      const lv = level(lemma);
      tokens += 1;
      contentInLine += 1;
      if (lv >= knownAt) known += 1;
      else unknownInLine += 1;
      const row = words.get(lemma);
      if (row) row.count += 1;
      else words.set(lemma, { lemma, count: 1, level: lv, example: line.text.slice(0, 120) });
    }
    if (unknownInLine === 1 && contentInLine >= 2) iPlusOneLines += 1;
  }
  const all = [...words.values()];
  const glossary = all
    .filter((row) => row.level < knownAt)
    .sort((a, b) => b.count - a.count || a.lemma.localeCompare(b.lemma))
    .slice(0, limit);
  return {
    tokens,
    knownRatio: tokens > 0 ? known / tokens : null,
    uniqueWords: all.length,
    uniqueKnown: all.filter((row) => row.level >= knownAt).length,
    glossary,
    iPlusOneLines,
  };
}

// --- per-novel daily stats -----------------------------------------------------------

export interface Vn5DayStat {
  day: string;
  lines: number;
  chars: number;
}

function dayOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Lines and characters read per day over the last `days` days (imports excluded), oldest first. */
export function vn5DailyStats(
  captures: readonly Pick<VisualNovelTextCapture, 'japanese' | 'capturedAt' | 'source'>[],
  now: number,
  days = 14,
): Vn5DayStat[] {
  const keys: string[] = [];
  const anchor = new Date(now);
  anchor.setHours(12, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    keys.push(dayOf(d.getTime()));
  }
  const rows = new Map(keys.map((day) => [day, { day, lines: 0, chars: 0 }]));
  for (const capture of captures) {
    if (capture.source === 'import') continue;
    const row = rows.get(dayOf(capture.capturedAt));
    if (!row) continue;
    row.lines += 1;
    row.chars += [...capture.japanese.replace(/\s+/g, '')].length;
  }
  return keys.map((day) => rows.get(day) as Vn5DayStat);
}

/** Days in a row, ending today or yesterday, with at least one line read. */
export function vn5ReadingStreak(daily: readonly Vn5DayStat[]): number {
  let i = daily.length - 1;
  if (i >= 0 && daily[i].lines === 0) i -= 1;
  let streak = 0;
  for (; i >= 0 && daily[i].lines > 0; i--) streak += 1;
  return streak;
}

// --- this session's reading speed ---------------------------------------------------

/** A pause longer than this is time away from the game, not reading time. */
export const VN5_AFK_GAP_MS = 2 * 60_000;

export interface Vn5SessionStats {
  lines: number;
  chars: number;
  /** Reading time: the session's time with every pause capped at `afkMs`. */
  activeMs: number;
  /** Characters per hour of reading time; null under a minute of it. */
  charsPerHour: number | null;
}

/**
 * Lines, characters and reading speed since `since` (a capture session's
 * start), AFK-aware like texthooker pages: a long pause counts as `afkMs` at
 * most, so leaving the game paused does not sink the speed. Imports are not
 * reading.
 */
export function vn5SessionStats(
  captures: readonly Pick<VisualNovelTextCapture, 'japanese' | 'capturedAt' | 'source'>[],
  since: number,
  now: number,
  afkMs = VN5_AFK_GAP_MS,
): Vn5SessionStats {
  const times: number[] = [];
  let chars = 0;
  for (const capture of captures) {
    if (capture.source === 'import' || capture.capturedAt < since || capture.capturedAt > now) continue;
    times.push(capture.capturedAt);
    chars += [...capture.japanese.replace(/\s+/g, '')].length;
  }
  times.sort((a, b) => a - b);
  let activeMs = 0;
  let previous = since;
  for (const at of times) {
    activeMs += Math.min(afkMs, Math.max(0, at - previous));
    previous = at;
  }
  activeMs += Math.min(afkMs, Math.max(0, now - previous));
  return {
    lines: times.length,
    chars,
    activeMs,
    charsPerHour: activeMs >= 60_000 && chars > 0 ? Math.round(chars / (activeMs / 3_600_000)) : null,
  };
}

// --- reader hotkeys -------------------------------------------------------------------

export type Vn5HotkeyAction = 'mine' | 'translate' | 'replay' | 'next' | 'copy';

/** Single keys, no modifiers, so they never collide with the app's own chords. */
export const VN5_HOTKEYS: Readonly<Record<Vn5HotkeyAction, string>> = {
  mine: 'M',
  translate: 'T',
  replay: 'R',
  next: 'N',
  copy: 'C',
};

/** The reader action a key press means, or null. Typing in a field is never a hotkey. */
export function vn5HotkeyAction(event: {
  key: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  repeat?: boolean;
  editable?: boolean;
}): Vn5HotkeyAction | null {
  if (event.ctrlKey || event.altKey || event.metaKey || event.repeat || event.editable) return null;
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  if (key === 'ArrowRight' || key === 'Enter') return 'next';
  for (const [action, bound] of Object.entries(VN5_HOTKEYS) as [Vn5HotkeyAction, string][]) {
    if (bound === key) return action;
  }
  return null;
}
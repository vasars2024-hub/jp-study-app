/**
 * Planning helpers: daily-goal targets from the last two weeks, and a calendar
 * event from one sentence (docs/AI_AUDIT.md N21, the parts that do not need the
 * Agent).
 *
 * Both have a deterministic half that always works:
 *
 * - `suggestDailyGoalTargets` reads the 14-day averages, the next week's due
 *   forecast and retention, and proposes targets on the goal's own step grid.
 * - `parseEventText` understands the common shapes ("kanji every Tue/Thu 7pm for
 *   30 min", "毎週火曜 19時から30分 漢字", "tomorrow 9:30 grammar review").
 *
 * The AI halves are optional and only ever PROPOSE: the goal panel and the event
 * form show the proposal and change nothing until the learner applies it. The AI
 * goal is clamped onto the same grid and bounds as the manual − / + buttons.
 */
import {
  clipText,
  normalizeAiStudyRequestId,
  normalizeAnswerLang,
  plainModelText,
  PLAIN_TEXT_RULE,
  promptLanguageName,
} from './aiStudyCommon';
import { clampNumber, clampOrNull } from './aiTutorCommon';
import {
  DAILY_GOAL_MAX,
  DAILY_GOAL_METRICS,
  DAILY_GOAL_STEP,
  type DailyGoalMetric,
  type DailyGoalTargets,
} from './dailyGoal';
import type { UiLang } from './i18n/core';
import type { ReviewLogEntry } from './reviewLog';
import { lastLocalDays, localDateKeyer, retentionRate, startOfLocalDateKey } from './reviewStats';

export const GOAL_SUGGEST_PROMPT_VERSION = 1;
export const EVENT_PARSE_PROMPT_VERSION = 1;

/** The window the goal suggestion reads. */
export const GOAL_HISTORY_DAYS = 14;

// ---- daily goal ----------------------------------------------------------------

export interface GoalHistory {
  days: number;
  /** Averages over every day of the window, studied or not. */
  reviewsAvg: number;
  newAvg: number;
  minutesAvg: number;
  activeDays: number;
  /** True retention of young + mature reviews in the window, 0-100. */
  retentionPct: number | null;
  /** Cards due per day over the next seven days (today's overdue included). */
  dueNext7Avg: number;
}

export function goalHistoryFrom(input: {
  entries: readonly ReviewLogEntry[];
  /** Study seconds (reading + watching) per local date. */
  studySecondsByDay: Readonly<Record<string, number>>;
  /** Due dates of the deck's scheduled, unsuspended cards. */
  dueAts: readonly number[];
  now: number;
}): GoalHistory {
  const days = lastLocalDays(GOAL_HISTORY_DAYS, input.now);
  const start = startOfLocalDateKey(days[0]);
  const inWindow = new Set(days);
  const dayOf = localDateKeyer();
  const active = new Set<string>();
  let reviews = 0;
  let fresh = 0;
  let passed = 0;
  let recall = 0;
  for (const entry of input.entries) {
    if (entry.mode !== 'review' || entry.at < start) continue;
    const day = dayOf(entry.at);
    if (!inWindow.has(day)) continue;
    reviews += 1;
    active.add(day);
    if (entry.isNew) fresh += 1;
    else if ((entry.prevIntervalDays ?? 0) >= 1) {
      recall += 1;
      if (entry.correct) passed += 1;
    }
  }
  let seconds = 0;
  for (const day of days) {
    const s = input.studySecondsByDay[day];
    if (typeof s === 'number' && Number.isFinite(s) && s > 0) {
      seconds += s;
      active.add(day);
    }
  }
  const weekEnd = input.now + 7 * 24 * 60 * 60 * 1000;
  const dueSoon = input.dueAts.filter((due) => Number.isFinite(due) && due < weekEnd).length;
  const rate = retentionRate({ passed, total: recall });
  const round1 = (n: number): number => Math.round(n * 10) / 10;
  return {
    days: GOAL_HISTORY_DAYS,
    reviewsAvg: round1(reviews / GOAL_HISTORY_DAYS),
    newAvg: round1(fresh / GOAL_HISTORY_DAYS),
    minutesAvg: round1(seconds / 60 / GOAL_HISTORY_DAYS),
    activeDays: active.size,
    retentionPct: rate === null ? null : Math.round(rate * 100),
    dueNext7Avg: round1(dueSoon / 7),
  };
}

export function normalizeGoalHistory(value: unknown): GoalHistory | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const retention = clampOrNull(raw.retentionPct, 0, 100);
  return {
    days: GOAL_HISTORY_DAYS,
    reviewsAvg: clampNumber(raw.reviewsAvg, 0, 10_000, 0),
    newAvg: clampNumber(raw.newAvg, 0, 10_000, 0),
    minutesAvg: clampNumber(raw.minutesAvg, 0, 1_440, 0),
    activeDays: Math.round(clampNumber(raw.activeDays, 0, GOAL_HISTORY_DAYS, 0)),
    retentionPct: retention === null ? null : Math.round(retention),
    dueNext7Avg: clampNumber(raw.dueNext7Avg, 0, 100_000, 0),
  };
}

/** A value on the metric's step grid, within 0…max. */
export function snapGoalTarget(metric: DailyGoalMetric, value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const step = DAILY_GOAL_STEP[metric];
  return Math.min(DAILY_GOAL_MAX[metric], Math.max(step, Math.round(value / step) * step));
}

export type GoalReasonId =
  | 'noHistory'
  | 'reviewsFromDue'
  | 'reviewsFromPace'
  | 'newFromPace'
  | 'newLowerRetention'
  | 'newRoomForMore'
  | 'minutesFromPace'
  | 'minutesFloor';

export interface GoalReason {
  id: GoalReasonId;
  vars: Record<string, string | number>;
}

export interface GoalSuggestion {
  targets: DailyGoalTargets;
  reasons: GoalReason[];
}

/**
 * Targets from the averages, rounded onto each metric's step:
 *
 * - reviews: enough to keep up with what falls due next week, or the recent
 *   pace when that is higher;
 * - new cards: the recent pace, cut by 30% while retention is under 80%, and
 *   raised 20% when retention is at least 90% and the forecast is lighter than
 *   the pace;
 * - minutes: the recent pace plus 10%, never under 10.
 *
 * With nothing studied in the window, the current targets are kept.
 */
export function suggestDailyGoalTargets(history: GoalHistory, current: DailyGoalTargets): GoalSuggestion {
  if (history.activeDays === 0) return { targets: { ...current }, reasons: [{ id: 'noHistory', vars: { days: history.days } }] };
  const reasons: GoalReason[] = [];
  const fromDue = history.dueNext7Avg >= history.reviewsAvg;
  const reviews = snapGoalTarget('reviews', Math.max(history.dueNext7Avg, history.reviewsAvg));
  reasons.push(fromDue
    ? { id: 'reviewsFromDue', vars: { due: Math.round(history.dueNext7Avg) } }
    : { id: 'reviewsFromPace', vars: { pace: Math.round(history.reviewsAvg) } });
  let newBase = history.newAvg;
  if (history.retentionPct !== null && history.retentionPct < 80) {
    newBase *= 0.7;
    reasons.push({ id: 'newLowerRetention', vars: { pct: history.retentionPct } });
  } else if (history.retentionPct !== null && history.retentionPct >= 90 && history.dueNext7Avg < history.reviewsAvg) {
    newBase *= 1.2;
    reasons.push({ id: 'newRoomForMore', vars: { pct: history.retentionPct } });
  } else {
    reasons.push({ id: 'newFromPace', vars: { pace: Math.round(history.newAvg * 10) / 10 } });
  }
  const newCards = snapGoalTarget('newCards', newBase);
  const minutesRaw = history.minutesAvg * 1.1;
  const minutes = Math.max(10, snapGoalTarget('minutes', minutesRaw));
  reasons.push(minutesRaw >= 10
    ? { id: 'minutesFromPace', vars: { pace: Math.round(history.minutesAvg) } }
    : { id: 'minutesFloor', vars: { minutes: 10 } });
  return { targets: { reviews, newCards, minutes }, reasons };
}

export interface GoalSuggestRequest {
  requestId?: string;
  history: GoalHistory;
  current: DailyGoalTargets;
  shareStudyData: string;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface GoalSuggestResult {
  targets: DailyGoalTargets;
  /** One or two sentences in the UI language. */
  reason: string;
}

function normalizeTargets(value: unknown): DailyGoalTargets | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const out = {} as DailyGoalTargets;
  for (const metric of DAILY_GOAL_METRICS) {
    out[metric] = Math.round(clampNumber(raw[metric], 0, DAILY_GOAL_MAX[metric], 0));
  }
  return out;
}

export function normalizeGoalSuggestRequest(input: unknown): GoalSuggestRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const history = normalizeGoalHistory(raw.history);
  const current = normalizeTargets(raw.current);
  if (!history || !current || history.activeDays === 0) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    history,
    current,
    shareStudyData: clipText(raw.shareStudyData, 16),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function goalSuggestKeyParts(request: GoalSuggestRequest): string[] {
  return [JSON.stringify(request.history), JSON.stringify(request.current), request.answerLang];
}

export function buildGoalSuggestPrompt(request: GoalSuggestRequest): string {
  const answer = promptLanguageName(request.answerLang);
  const rule = suggestDailyGoalTargets(request.history, request.current).targets;
  return [
    'Suggest realistic daily study targets for a language learner who uses spaced-repetition flashcards.',
    `Their last ${request.history.days} days (averages over every day): ${JSON.stringify(request.history)}`,
    `Current targets: ${JSON.stringify(request.current)}`,
    `A simple rule suggests: ${JSON.stringify(rule)}`,
    '',
    'Targets must be sustainable: reviews should cover what falls due, new cards should drop when retention is under 80%, minutes are reading and watching time.',
    `Steps: reviews in tens, newCards in fives, minutes in fives. Maximums: ${JSON.stringify(DAILY_GOAL_MAX)}.`,
    `Reply with JSON {"reviews", "newCards", "minutes", "reason"}; "reason" is one or two sentences in ${answer} that cite the numbers.`,
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const GOAL_SUGGEST_SCHEMA = {
  type: 'object',
  properties: {
    reviews: { type: 'integer' },
    newCards: { type: 'integer' },
    minutes: { type: 'integer' },
    reason: { type: 'string' },
  },
  required: ['reviews', 'newCards', 'minutes', 'reason'],
} as const;

/**
 * Snapped to the grid and kept within three times the rule's suggestion (or
 * three steps above it, whichever is larger): a proposal far outside what the
 * learner's own numbers support is clamped, not passed on.
 */
export function finalizeGoalSuggestResult(
  parsed: { reviews: number; newCards: number; minutes: number; reason: string },
  request: GoalSuggestRequest,
): GoalSuggestResult | null {
  const reason = plainModelText(parsed.reason, 400);
  if (!reason) return null;
  const rule = suggestDailyGoalTargets(request.history, request.current).targets;
  const targets = {} as DailyGoalTargets;
  for (const metric of DAILY_GOAL_METRICS) {
    const value = parsed[metric];
    if (!Number.isFinite(value) || value < 0) return null;
    const ceiling = Math.max(rule[metric] * 3, rule[metric] + 3 * DAILY_GOAL_STEP[metric]);
    targets[metric] = snapGoalTarget(metric, Math.min(value, ceiling));
  }
  return { targets, reason };
}

export function isGoalSuggestResult(value: unknown): value is GoalSuggestResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const targets = v.targets as Record<string, unknown> | undefined;
  return typeof v.reason === 'string' && v.reason.length > 0 && !!targets
    && DAILY_GOAL_METRICS.every((metric) => typeof targets[metric] === 'number' && Number.isFinite(targets[metric] as number));
}

// ---- calendar event from a sentence -------------------------------------------

export type EventDraftRecurrence = 'none' | 'daily' | 'weekly';

export interface EventDraft {
  title: string;
  /** First date, YYYY-MM-DD. */
  date: string;
  /** HH:MM, or null for an all-day event. */
  startTime: string | null;
  endTime: string | null;
  recurrence: EventDraftRecurrence;
  /** 0 = Sunday … 6 = Saturday, sorted; weekly events only. One event is made per day. */
  weekdays: number[];
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

function dateKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function clockOf(minutes: number): string {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number);
  return h * 60 + m;
}

/** The first date on or after `from` that falls on one of `weekdays`. */
export function nextWeekdayDate(from: Date, weekdays: readonly number[]): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
  for (let i = 0; i < 7; i += 1) {
    if (weekdays.includes(d.getDay())) return dateKeyOf(d);
    d.setDate(d.getDate() + 1);
  }
  return dateKeyOf(from);
}

const EN_DAYS: Array<[RegExp, number]> = [
  [/^sun(day)?s?$/, 0],
  [/^mon(day)?s?$/, 1],
  [/^tue(s|sday)?s?$/, 2],
  [/^wed(s|nesday)?s?$/, 3],
  [/^thu(r|rs|rsday)?s?$/, 4],
  [/^fri(day)?s?$/, 5],
  [/^sat(urday)?s?$/, 6],
];
const CJK_DAYS: Record<string, number> = { 日: 0, 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6 };
const ZH_DAYS: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

interface Span {
  start: number;
  end: number;
}

/**
 * A small parser for the common ways to say an event. It recognizes weekdays
 * (with "every"/"毎週" or more than one → weekly), "daily"/"every day"/"毎日",
 * "weekdays"/"weekends", today/tomorrow (今日/明日), an ISO date, a clock time
 * (7pm, 19:00, 午後7時, 7点), a range (7-8pm, 19:00-20:00) or a duration
 * ("for 30 min", "1h", "30分", "1時間"), and keeps the rest as the title.
 * Returns null when the text is empty.
 */
export function parseEventText(text: string, now: Date = new Date()): EventDraft | null {
  const source = text.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!source) return null;
  const lower = source.toLowerCase();
  const used: Span[] = [];
  const take = (re: RegExp): RegExpExecArray | null => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lower))) {
      const span = { start: m.index, end: m.index + m[0].length };
      if (!used.some((u) => span.start < u.end && u.start < span.end)) {
        used.push(span);
        return m;
      }
      if (!re.global) break;
    }
    return null;
  };

  // Recurrence words.
  let recurrence: EventDraftRecurrence = 'none';
  let every = false;
  const weekdays = new Set<number>();
  if (take(/\b(every ?day|each day|daily)\b|毎日|每天/g)) recurrence = 'daily';
  if (take(/\b(every )?weekdays\b|平日|工作日/g)) [1, 2, 3, 4, 5].forEach((d) => weekdays.add(d));
  if (take(/\b(every )?weekends?\b|週末|周末/g)) [0, 6].forEach((d) => weekdays.add(d));
  if (take(/\b(every|each)\b|毎週|每周|每星期|каждый|каждую|каждое/g)) every = true;

  // English weekday lists: "tue/thu", "mon, wed and fri". A run counts only when
  // every word in it is a weekday, so "monster" or "saturate" stay in the title.
  const dayRun = /\b(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*(?:\s*(?:\/|,|&|\band\b|\+)\s*(?:sun|mon|tue|wed|thu|fri|sat)[a-z]*)*/g;
  for (const m of lower.matchAll(dayRun)) {
    const start = m.index ?? 0;
    const span = { start, end: start + m[0].length };
    if (used.some((u) => span.start < u.end && u.start < span.end)) continue;
    const days = m[0].split(/\s*(?:\/|,|&|\band\b|\+)\s*/).map((word) => EN_DAYS.find(([re]) => re.test(word.trim()))?.[1]);
    if (!days.length || days.some((day) => day === undefined)) continue;
    used.push(span);
    for (const day of days) weekdays.add(day as number);
  }
  // Japanese: 火曜, 火曜日, 火・木, 月水金曜.
  const jaRun = /([日月火水木金土](?:[・、,/と]?[日月火水木金土])*)曜日?/g;
  for (let m = take(jaRun); m; m = take(jaRun)) {
    for (const ch of m[1]) if (ch in CJK_DAYS) weekdays.add(CJK_DAYS[ch]);
  }
  // Chinese: 周二, 星期四, 周二和周四.
  const zhRun = /(?:周|星期|礼拜)([一二三四五六日天])/g;
  for (let m = take(zhRun); m; m = take(zhRun)) weekdays.add(ZH_DAYS[m[1]]);

  if (recurrence === 'none' && weekdays.size > 0 && (every || weekdays.size > 1)) recurrence = 'weekly';
  if (recurrence === 'none' && every && weekdays.size === 0) recurrence = 'daily';

  // A date.
  let date = dateKeyOf(now);
  const iso = take(/\b(\d{4})-(\d{2})-(\d{2})\b/g);
  if (iso && DATE_KEY.test(iso[0])) date = iso[0];
  else if (take(/\btomorrow\b|明日|あした|明天|завтра/g)) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12);
    date = dateKeyOf(d);
  } else take(/\btoday\b|今日|きょう|今天|сегодня/g);

  // Time of day: a range first, then a single time.
  let start: number | null = null;
  let end: number | null = null;
  const toMinutes = (h: number, m: number, meridiem: string | undefined): number | null => {
    let hour = h;
    if (meridiem) {
      if (hour < 1 || hour > 12) return null;
      if (/p/.test(meridiem) && hour < 12) hour += 12;
      if (/a/.test(meridiem) && hour === 12) hour = 0;
    }
    if (hour > 23 || m > 59) return null;
    return hour * 60 + m;
  };
  const range = take(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|–|to|until|till)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/g);
  if (range) {
    const meridiemEnd = range[6];
    const a = toMinutes(Number(range[1]), Number(range[2] ?? 0), range[3] ?? meridiemEnd);
    const b = toMinutes(Number(range[4]), Number(range[5] ?? 0), meridiemEnd ?? range[3]);
    if (a !== null && b !== null && b > a) {
      start = a;
      end = b;
    }
  }
  if (start === null) {
    const en = take(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/g) ?? take(/\b(?:at\s*)?(\d{1,2}):(\d{2})\b/g);
    if (en) start = toMinutes(Number(en[1]), Number(en[2] ?? 0), en[3]?.replace(/\./g, ''));
    else if (take(/\bnoon\b|正午/g)) start = 12 * 60;
    else {
      const ja = take(/(午前|午後|上午|下午|晚上)?\s*(\d{1,2})\s*[時点](?!間)(?:\s*(\d{1,2})\s*分(?!間|钟)|\s*(半))?(?:から|开始)?/g);
      if (ja) {
        const pm = ja[1] === '午後' || ja[1] === '下午' || ja[1] === '晚上';
        const am = ja[1] === '午前' || ja[1] === '上午';
        let hour = Number(ja[2]);
        if (pm && hour < 12) hour += 12;
        if (am && hour === 12) hour = 0;
        start = hour <= 23 ? hour * 60 + (ja[4] ? 30 : Number(ja[3] ?? 0)) : null;
      }
    }
  }

  // A duration sets the end when no range did.
  if (end === null) {
    let duration: number | null = null;
    const forRun = take(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(minutes|minute|mins|min|m|hours|hour|hrs|hr|h)\b/g);
    if (forRun) duration = Number(forRun[1]) * (/^h/.test(forRun[2]) ? 60 : 1);
    else if (take(/\bfor (?:an|one) hour\b/g)) duration = 60;
    else if (take(/\bfor half an hour\b/g)) duration = 30;
    else {
      const cjk = take(/(\d+(?:\.\d+)?)\s*(分間|分钟|分|時間|小时|个小时)/g);
      if (cjk) duration = Number(cjk[1]) * (/時間|小时/.test(cjk[2]) ? 60 : 1);
    }
    if (duration !== null && duration > 0 && start !== null) end = Math.min(start + duration, 23 * 60 + 59);
  }
  if (start !== null && end === null) end = Math.min(start + 60, 23 * 60 + 59);

  if (recurrence === 'weekly' || (recurrence === 'none' && weekdays.size === 1)) {
    date = nextWeekdayDate(iso || /tomorrow|明日|明天/.test(lower) ? new Date(`${date}T12:00:00`) : now, [...weekdays]);
  }

  // Whatever was not recognized is the title. The spans index `lower`, which has
  // the source's length unless lower-casing changed it; then nothing is cut.
  let rest = source;
  if (source.length === lower.length) {
    rest = '';
    for (let i = 0; i < source.length; i += 1) {
      rest += used.some((u) => i >= u.start && i < u.end) ? ' ' : source[i];
    }
  }
  // Words left dangling where a time or day was cut out ("… at", "on …") go too.
  let title = rest.replace(/[,;:/&+()（）・、。-]+/g, ' ').replace(/\s+/g, ' ').trim();
  const dangling = /^(?:at|on|for|from|to|and|in|every|each|with|に|で|から|の|と)\s+|\s+(?:at|on|for|from|to|and|in|every|each|with|に|で|から|の|と)$/i;
  for (let i = 0; i < 4 && dangling.test(title); i += 1) title = title.replace(dangling, '').trim();

  return {
    title: clipText(title, 80),
    date,
    startTime: start === null ? null : clockOf(start),
    endTime: start === null || end === null ? null : clockOf(end),
    recurrence,
    weekdays: recurrence === 'weekly' ? [...weekdays].sort((a, b) => a - b) : [],
  };
}

export interface EventParseRequest {
  requestId?: string;
  text: string;
  /** Today in the learner's time zone, YYYY-MM-DD, and its weekday. */
  today: string;
  todayWeekday: number;
  answerLang: UiLang;
  refresh?: boolean;
}

export function normalizeEventParseRequest(input: unknown): EventParseRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = clipText(raw.text, 200);
  const today = typeof raw.today === 'string' && DATE_KEY.test(raw.today) ? raw.today : '';
  if (!text || !today) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    text,
    today,
    todayWeekday: Math.round(clampNumber(raw.todayWeekday, 0, 6, new Date(`${today}T12:00:00`).getDay())),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

export function eventParseKeyParts(request: EventParseRequest): string[] {
  return [request.text, request.today, request.answerLang];
}

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function buildEventParsePrompt(request: EventParseRequest): string {
  return [
    'Turn this calendar request into one structured event.',
    `Today is ${request.today} (${WEEKDAY_NAMES[request.todayWeekday] ?? ''}).`,
    `Request: ${request.text}`,
    '',
    'Reply with JSON:',
    `- "title": a short title in the request's own language (what the event is, without the time words).`,
    '- "date": the first date it happens, YYYY-MM-DD, today or later.',
    '- "startTime" and "endTime": 24-hour HH:MM, or "" for an all-day event. Use the stated duration; one hour if none.',
    '- "recurrence": "none", "daily" or "weekly".',
    '- "weekdays": for weekly events, the days as numbers 0=Sunday … 6=Saturday; otherwise [].',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const EVENT_PARSE_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    date: { type: 'string' },
    startTime: { type: 'string' },
    endTime: { type: 'string' },
    recurrence: { type: 'string', enum: ['none', 'daily', 'weekly'] },
    weekdays: { type: 'array', items: { type: 'integer' } },
  },
  required: ['title', 'date', 'startTime', 'endTime', 'recurrence', 'weekdays'],
} as const;

function dayDistance(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00`).getTime() - new Date(`${from}T12:00:00`).getTime()) / 86_400_000);
}

/** Every field checked: a real date within a year, real clock times in order, weekdays 0-6. */
export function finalizeEventDraft(
  parsed: { title: string; date: string; startTime?: string; endTime?: string; recurrence: string; weekdays?: number[] },
  request: Pick<EventParseRequest, 'today'>,
): EventDraft | null {
  const title = plainModelText(parsed.title, 80).replace(/\s*\n\s*/g, ' ');
  if (!title) return null;
  const date = typeof parsed.date === 'string' ? parsed.date.trim() : '';
  if (!DATE_KEY.test(date) || Number.isNaN(new Date(`${date}T12:00:00`).getTime())) return null;
  const distance = dayDistance(request.today, date);
  if (distance < 0 || distance > 366) return null;
  const startTime = typeof parsed.startTime === 'string' && CLOCK.test(parsed.startTime.trim()) ? parsed.startTime.trim() : null;
  let endTime = typeof parsed.endTime === 'string' && CLOCK.test(parsed.endTime.trim()) ? parsed.endTime.trim() : null;
  if (!startTime) endTime = null;
  else if (!endTime || minutesOf(endTime) <= minutesOf(startTime)) endTime = clockOf(minutesOf(startTime) + 60);
  const recurrence: EventDraftRecurrence = parsed.recurrence === 'daily' || parsed.recurrence === 'weekly' ? parsed.recurrence : 'none';
  let weekdays: number[] = [];
  if (recurrence === 'weekly') {
    weekdays = [...new Set((parsed.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
    if (!weekdays.length) weekdays = [new Date(`${date}T12:00:00`).getDay()];
  }
  return { title, date, startTime, endTime, recurrence, weekdays };
}

export function isEventDraft(value: unknown): value is EventDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.title === 'string' && v.title.length > 0 && typeof v.date === 'string' && DATE_KEY.test(v.date)
    && (v.startTime === null || (typeof v.startTime === 'string' && CLOCK.test(v.startTime)))
    && (v.endTime === null || (typeof v.endTime === 'string' && CLOCK.test(v.endTime)))
    && (v.recurrence === 'none' || v.recurrence === 'daily' || v.recurrence === 'weekly')
    && Array.isArray(v.weekdays) && v.weekdays.every((d) => Number.isInteger(d) && (d as number) >= 0 && (d as number) <= 6);
}

/**
 * The dates one weekly draft becomes: the calendar repeats an event on ONE
 * weekday, so "Tue/Thu" is two weekly events. The first is the draft's own date.
 */
export function eventDraftExtraDates(draft: EventDraft): string[] {
  if (draft.recurrence !== 'weekly' || draft.weekdays.length < 2) return [];
  const first = new Date(`${draft.date}T12:00:00`);
  const firstDay = first.getDay();
  return draft.weekdays
    .filter((day) => day !== firstDay)
    .map((day) => nextWeekdayDate(first, [day]));
}

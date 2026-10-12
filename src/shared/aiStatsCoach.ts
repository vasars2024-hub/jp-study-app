/**
 * "Explain my stats" (docs/AI_AUDIT.md N22): a compact, numeric summary of the
 * review log and the deck, rule-based tips computed from it, and the prompt and
 * reply contract for the optional AI version.
 *
 * The numbers are always computed here, deterministically, from the same
 * functions the charts use (`reviewStats.ts`). The model only PHRASES 3-5
 * suggestions from them, and every suggestion must name which chart it rests
 * on. Only the summary is ever sent — counts and percentages, never a word,
 * card or title — and a cloud request also needs the study-data permission
 * (`agentCloudStudyDataGate.ts`); the offline engine needs neither.
 *
 * The fallback is `statsRuleTips`: the same numbers, read by fixed rules.
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
import type { UiLang } from './i18n/core';
import type { ReviewLogEntry } from './reviewLog';
import {
  answerTimeSummary,
  dailyReviewStats,
  hourlyBreakdown,
  localDateKeyer,
  retentionRate,
  weeklyRetention,
  type RetentionCell,
} from './reviewStats';

export const STATS_COACH_PROMPT_VERSION = 1;

/** Anki's default leech threshold. */
export const STATS_LEECH_LAPSES = 8;

export type StatsDaypart = 'night' | 'morning' | 'afternoon' | 'evening';
export const STATS_DAYPARTS: readonly StatsDaypart[] = ['night', 'morning', 'afternoon', 'evening'];

export interface StatsDaypartRow {
  part: StatsDaypart;
  reviews: number;
  /** Share of those reviews that were not Again, 0-100, or null when none. */
  passPct: number | null;
}

export interface StatsDigest {
  rangeDays: number;
  reviews: number;
  activeDays: number;
  /** Reviews per day studied. */
  reviewsPerActiveDay: number;
  /** New cards introduced per calendar day of the range. */
  newPerDay: number;
  /** True retention (young + mature, recall reviews only), 0-100. */
  retentionPct: number | null;
  matureRetentionPct: number | null;
  /** Up to 8 weeks, oldest first, the last ending today. */
  weeklyRetentionPct: Array<number | null>;
  dayparts: StatsDaypartRow[];
  avgAnswerSeconds: number | null;
  /** Unsuspended cards with at least `STATS_LEECH_LAPSES` lapses. */
  leeches: number;
  /** Cards due today (overdue included), then each of the next six days. */
  dueNext7: number[];
}

export interface StatsDigestCard {
  suspended?: boolean;
  srs?: { dueAt: number; lapses?: number } | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pct(cell: RetentionCell): number | null {
  const rate = retentionRate(cell);
  return rate === null ? null : Math.round(rate * 100);
}

function daypartOf(hour: number): StatsDaypart {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** The summary, computed from the review log and the deck. Pure; `now` is injected. */
export function buildStatsDigest(input: {
  entries: readonly ReviewLogEntry[];
  cards: readonly StatsDigestCard[];
  rangeDays: number;
  now: number;
}): StatsDigest {
  const rangeDays = Math.max(7, Math.min(365, Math.round(input.rangeDays)));
  const { entries, cards, now } = input;
  const since = now - rangeDays * DAY_MS;
  const daily = dailyReviewStats(entries, rangeDays, now);
  const reviews = daily.reduce((n, d) => n + d.learning + d.young + d.mature, 0);
  const activeDays = daily.filter((d) => d.learning + d.young + d.mature > 0).length;
  let newCards = 0;
  for (const entry of entries) {
    if (entry.mode === 'review' && entry.at >= since && entry.isNew) newCards += 1;
  }
  const weeks = weeklyRetention(entries, Math.min(8, Math.max(1, Math.round(rangeDays / 7))), now);
  const young = weeks.reduce((acc, w) => ({ passed: acc.passed + w.young.passed, total: acc.total + w.young.total }), { passed: 0, total: 0 });
  const mature = weeks.reduce((acc, w) => ({ passed: acc.passed + w.mature.passed, total: acc.total + w.mature.total }), { passed: 0, total: 0 });
  const parts = new Map<StatsDaypart, { reviews: number; passed: number }>(STATS_DAYPARTS.map((p) => [p, { reviews: 0, passed: 0 }]));
  for (const hour of hourlyBreakdown(entries, since)) {
    const slot = parts.get(daypartOf(hour.hour));
    if (!slot) continue;
    slot.reviews += hour.reviews;
    slot.passed += hour.passed;
  }
  const time = answerTimeSummary(entries, since);
  let leeches = 0;
  const dueNext7 = new Array<number>(7).fill(0);
  const dayOf = localDateKeyer();
  const dayIndex = new Map<string, number>();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + i);
    dayIndex.set(dayOf(d.getTime()), i);
  }
  for (const card of cards) {
    if (card.suspended || !card.srs) continue;
    if ((card.srs.lapses ?? 0) >= STATS_LEECH_LAPSES) leeches += 1;
    const due = card.srs.dueAt;
    if (!Number.isFinite(due)) continue;
    if (due <= now) dueNext7[0] += 1;
    else {
      const index = dayIndex.get(dayOf(due));
      if (index !== undefined) dueNext7[index] += 1;
    }
  }
  return {
    rangeDays,
    reviews,
    activeDays,
    reviewsPerActiveDay: activeDays ? Math.round(reviews / activeDays) : 0,
    newPerDay: Math.round((newCards / rangeDays) * 10) / 10,
    retentionPct: pct({ passed: young.passed + mature.passed, total: young.total + mature.total }),
    matureRetentionPct: pct(mature),
    weeklyRetentionPct: weeks.map((w) => pct({ passed: w.young.passed + w.mature.passed, total: w.young.total + w.mature.total })),
    dayparts: STATS_DAYPARTS.map((part) => {
      const slot = parts.get(part) ?? { reviews: 0, passed: 0 };
      return { part, reviews: slot.reviews, passPct: slot.reviews ? Math.round((slot.passed / slot.reviews) * 100) : null };
    }),
    avgAnswerSeconds: time.averageSeconds === null ? null : Math.round(time.averageSeconds * 10) / 10,
    leeches,
    dueNext7,
  };
}

/** Re-derives a digest that crossed the bridge; anything malformed is clamped or dropped. */
export function normalizeStatsDigest(value: unknown): StatsDigest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const count = (v: unknown): number => Math.round(clampNumber(v, 0, 1_000_000, 0));
  const percentOrNull = (v: unknown): number | null => {
    const n = clampOrNull(v, 0, 100);
    return n === null ? null : Math.round(n);
  };
  const weekly = Array.isArray(raw.weeklyRetentionPct) ? raw.weeklyRetentionPct.slice(-8).map(percentOrNull) : [];
  const dayparts: StatsDaypartRow[] = STATS_DAYPARTS.map((part) => {
    const found = Array.isArray(raw.dayparts)
      ? (raw.dayparts as unknown[]).find((row) => !!row && typeof row === 'object' && (row as StatsDaypartRow).part === part) as Record<string, unknown> | undefined
      : undefined;
    return { part, reviews: count(found?.reviews), passPct: percentOrNull(found?.passPct) };
  });
  const due = Array.isArray(raw.dueNext7) ? raw.dueNext7.slice(0, 7).map(count) : [];
  while (due.length < 7) due.push(0);
  const reviews = count(raw.reviews);
  return {
    rangeDays: Math.round(clampNumber(raw.rangeDays, 7, 365, 30)),
    reviews,
    activeDays: Math.round(clampNumber(raw.activeDays, 0, 365, 0)),
    reviewsPerActiveDay: count(raw.reviewsPerActiveDay),
    newPerDay: Math.round(clampNumber(raw.newPerDay, 0, 10_000, 0) * 10) / 10,
    retentionPct: percentOrNull(raw.retentionPct),
    matureRetentionPct: percentOrNull(raw.matureRetentionPct),
    weeklyRetentionPct: weekly,
    dayparts,
    avgAnswerSeconds: clampOrNull(raw.avgAnswerSeconds, 0, 3600),
    leeches: count(raw.leeches),
    dueNext7: due,
  };
}

// ---- the rule-based tips (the fallback, and what the AI is checked against) --

/** Which chart a suggestion rests on. Every suggestion names one. */
export type StatsBasis = 'retention' | 'time-of-day' | 'answer-time' | 'leeches' | 'forecast' | 'volume' | 'consistency';
export const STATS_BASES: readonly StatsBasis[] = ['retention', 'time-of-day', 'answer-time', 'leeches', 'forecast', 'volume', 'consistency'];

export type StatsTipId =
  | 'retentionLow'
  | 'retentionHigh'
  | 'retentionDropping'
  | 'bestTime'
  | 'slowAnswers'
  | 'leeches'
  | 'dueSpike'
  | 'backlog'
  | 'consistency'
  | 'reviewBeforeNew'
  | 'shortSessions'
  | 'keepGoing';

export interface StatsTip {
  id: StatsTipId;
  basis: StatsBasis;
  vars: Record<string, string | number>;
}

const MIN_TIPS = 3;
const MAX_TIPS = 5;

/**
 * Three to five tips from fixed rules over the digest, most specific first. The
 * generic ones only pad the list when the numbers say too little.
 */
export function statsRuleTips(digest: StatsDigest): StatsTip[] {
  const tips: StatsTip[] = [];
  const { retentionPct } = digest;
  const recallCount = digest.reviews;
  if (retentionPct !== null && retentionPct < 80) {
    tips.push({ id: 'retentionLow', basis: 'retention', vars: { pct: retentionPct } });
  } else if (retentionPct !== null && retentionPct > 95 && recallCount >= 100) {
    tips.push({ id: 'retentionHigh', basis: 'retention', vars: { pct: retentionPct } });
  }
  const weeks = digest.weeklyRetentionPct.filter((v): v is number => v !== null);
  if (weeks.length >= 3) {
    const last = weeks[weeks.length - 1];
    const earlier = weeks.slice(0, -1);
    const avg = Math.round(earlier.reduce((n, v) => n + v, 0) / earlier.length);
    if (avg - last >= 5) tips.push({ id: 'retentionDropping', basis: 'retention', vars: { last, avg } });
  }
  const parts = digest.dayparts.filter((p) => p.reviews >= 30 && p.passPct !== null);
  if (parts.length >= 2) {
    const best = parts.reduce((a, b) => ((b.passPct ?? 0) > (a.passPct ?? 0) ? b : a));
    const worst = parts.reduce((a, b) => ((b.passPct ?? 0) < (a.passPct ?? 0) ? b : a));
    if ((best.passPct ?? 0) - (worst.passPct ?? 0) >= 8) {
      tips.push({ id: 'bestTime', basis: 'time-of-day', vars: { best: best.part, worst: worst.part, bestPct: best.passPct ?? 0, worstPct: worst.passPct ?? 0 } });
    }
  }
  if (digest.avgAnswerSeconds !== null && digest.avgAnswerSeconds > 15) {
    tips.push({ id: 'slowAnswers', basis: 'answer-time', vars: { seconds: Math.round(digest.avgAnswerSeconds) } });
  }
  if (digest.leeches >= 5) tips.push({ id: 'leeches', basis: 'leeches', vars: { count: digest.leeches } });
  const pace = Math.max(1, digest.reviewsPerActiveDay);
  const later = digest.dueNext7.slice(1);
  const peak = later.reduce((best, count, i) => (count > best.count ? { day: i + 1, count } : best), { day: 0, count: 0 });
  if (digest.dueNext7[0] > 2 * pace && digest.dueNext7[0] >= 50) {
    tips.push({ id: 'backlog', basis: 'forecast', vars: { due: digest.dueNext7[0], pace } });
  } else if (peak.count > 1.5 * pace && peak.count >= 50) {
    tips.push({ id: 'dueSpike', basis: 'forecast', vars: { day: peak.day, count: peak.count } });
  }
  if (digest.activeDays > 0 && digest.activeDays / digest.rangeDays < 0.5) {
    tips.push({ id: 'consistency', basis: 'consistency', vars: { active: digest.activeDays, days: digest.rangeDays } });
  }
  const padding: StatsTip[] = [
    { id: 'reviewBeforeNew', basis: 'forecast', vars: { due: digest.dueNext7[0] } },
    { id: 'shortSessions', basis: 'volume', vars: { pace } },
    { id: 'keepGoing', basis: 'consistency', vars: { active: digest.activeDays, days: digest.rangeDays } },
  ];
  for (const tip of padding) {
    if (tips.length >= MIN_TIPS) break;
    if (!tips.some((t) => t.id === tip.id)) tips.push(tip);
  }
  return tips.slice(0, MAX_TIPS);
}

// ---- the AI request ------------------------------------------------------------

export interface StatsCoachRequest {
  requestId?: string;
  digest: StatsDigest;
  /** The Agent's study-data permission, as the renderer read it; main checks it for the cloud. */
  shareStudyData: string;
  answerLang: UiLang;
  refresh?: boolean;
}

export interface StatsCoachSuggestion {
  text: string;
  basis: StatsBasis;
}

export interface StatsCoachResult {
  /** One or two sentences: the overall picture. */
  summary: string;
  /** Three to five concrete suggestions, each resting on one chart. */
  suggestions: StatsCoachSuggestion[];
}

export function normalizeStatsCoachRequest(input: unknown): StatsCoachRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const digest = normalizeStatsDigest(raw.digest);
  if (!digest || digest.reviews === 0) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    digest,
    shareStudyData: clipText(raw.shareStudyData, 16),
    answerLang: normalizeAnswerLang(raw.answerLang),
    ...(raw.refresh === true ? { refresh: true } : {}),
  };
}

/** The permission is not part of the key: it decides whether to send, not what the answer is. */
export function statsCoachKeyParts(request: StatsCoachRequest): string[] {
  return [JSON.stringify(request.digest), request.answerLang];
}

export function buildStatsCoachPrompt(request: StatsCoachRequest): string {
  const answer = promptLanguageName(request.answerLang);
  return [
    'You are a spaced-repetition study coach. Here is a learner\'s review summary, computed from their flashcard log:',
    JSON.stringify(request.digest),
    '',
    'Field notes: retentionPct is true retention of young+mature reviews (Anki definition); weeklyRetentionPct is oldest first; dayparts are night 0-5h, morning 6-11h, afternoon 12-17h, evening 18-23h; dueNext7[0] is due today including overdue; leeches have 8+ lapses.',
    '',
    `Reply in ${answer} with JSON:`,
    '- "summary": one or two sentences on the overall picture.',
    '- "suggestions": 3 to 5 concrete, actionable suggestions, each {"text", "basis"}. Each text must rest on the numbers above (quote the number it rests on) and "basis" names the chart it comes from: one of "retention", "time-of-day", "answer-time", "leeches", "forecast", "volume", "consistency".',
    'Do not invent numbers that are not in the summary. Do not give medical or financial advice.',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

export const STATS_COACH_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          basis: { type: 'string', enum: [...STATS_BASES] },
        },
        required: ['text', 'basis'],
      },
    },
  },
  required: ['summary', 'suggestions'],
} as const;

export function finalizeStatsCoachResult(
  parsed: { summary: string; suggestions: Array<{ text: string; basis: string }> },
): StatsCoachResult | null {
  const summary = plainModelText(parsed.summary, 400);
  if (!summary) return null;
  const suggestions: StatsCoachSuggestion[] = [];
  const seen = new Set<string>();
  for (const raw of parsed.suggestions) {
    const text = plainModelText(raw.text, 300).replace(/\s*\n\s*/g, ' ');
    if (!text || seen.has(text) || !(STATS_BASES as readonly string[]).includes(raw.basis)) continue;
    seen.add(text);
    suggestions.push({ text, basis: raw.basis as StatsBasis });
    if (suggestions.length >= MAX_TIPS) break;
  }
  return suggestions.length >= MIN_TIPS ? { summary, suggestions } : null;
}

export function isStatsCoachResult(value: unknown): value is StatsCoachResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.summary === 'string' && v.summary.length > 0 && Array.isArray(v.suggestions)
    && v.suggestions.length >= MIN_TIPS && v.suggestions.length <= MAX_TIPS
    && v.suggestions.every((s) => !!s && typeof s === 'object' && typeof (s as StatsCoachSuggestion).text === 'string'
      && (STATS_BASES as readonly unknown[]).includes((s as StatsCoachSuggestion).basis));
}

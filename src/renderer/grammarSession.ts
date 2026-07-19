/**
 * Practice session builder.
 *
 * Before this, `GrammarTestModal` asked one question — "how many cards?" — and
 * dealt a self-graded flip card for each, discarding the results. This module
 * is the selection and composition layer underneath a real session: which
 * points, in which direction, as which kind of question, and in what mix.
 *
 * ## Rules this follows, and why
 *
 * **A question is never dealt that the record cannot support.** Phase 2
 * established this for bulk actions — a flashcard built from a record with no
 * example sentence is an empty card, so the action is blocked and reports how
 * many it skipped rather than quietly producing junk. The same applies here:
 * each question type declares what it needs, and a point that cannot satisfy
 * any requested type is passed over rather than dealt a broken card.
 *
 * **The plan reports what it actually delivered.** `count` and `newRatio` are
 * targets, not promises: the eligible pool may be smaller than the requested
 * count, and it may not hold enough below-known points to hit the ratio. The
 * returned plan carries `delivered`, `ratioDelivered` and `unusableTypes` so
 * the UI can say what happened. A builder that silently returns 7 cards for a
 * request of 20, or quietly substitutes known points for new ones, is the same
 * class of defect as a category chip promising results a click cannot deliver.
 *
 * **Cloze matching is deliberately under-inclusive.** Locating a pattern inside
 * a sentence is the problem Phase 1.5 solved at build time with kuromoji and
 * morpheme-boundary agreement, after a bounded-regex pass alone reached ~65%
 * precision and put ずに inside 上手に. Nothing here re-litigates that at
 * runtime. A point is cloze-eligible only when a conservative literal core —
 * placeholders, bracketed English annotations and latin text removed — is at
 * least `MIN_CLOZE_CORE` characters or contains a kanji, AND occurs verbatim in
 * the example. Short all-kana cores are refused, exactly as the importer
 * refuses them. A rule that also matches an ordinary word is worse than no
 * rule, because a wrong blank is indistinguishable from a right one.
 */

import type { NormalizedGrammarPoint } from './data/grammar/normalize';
import { getFamiliarity, GX_KNOWN_THRESHOLD, type FamiliarityState, type GxLevel } from './grammarFamiliarity';
import { IDB_KEYS, mirrorToIdb } from './storage/storage';

export const SESSION_DIRECTIONS = ['recognition', 'production', 'mixed'] as const;
export type SessionDirection = (typeof SESSION_DIRECTIONS)[number];

export const QUESTION_TYPES = ['flip', 'meaning-choice', 'pattern-choice', 'cloze'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/**
 * Which way each type runs.
 *
 * Recognition shows the pattern and asks what it means; production shows the
 * meaning (or a gapped sentence) and asks for the pattern.
 */
export const TYPE_DIRECTION: Record<QuestionType, Exclude<SessionDirection, 'mixed'>> = {
  flip: 'recognition',
  'meaning-choice': 'recognition',
  'pattern-choice': 'production',
  cloze: 'production',
};

export const MASTERED_MODES = ['exclude', 'include', 'only'] as const;
export type MasteredMode = (typeof MASTERED_MODES)[number];

/**
 * The band that counts as mastered for practice purposes.
 *
 * Deliberately the top band (Known), not `GX_KNOWN_THRESHOLD` (Familiar). Those
 * answer different questions and must not be collapsed: "known" is the coverage
 * threshold `levelService` uses to estimate the user's level, while "mastered"
 * here means drilling it further has little value. Familiar sits between them —
 * it counts toward coverage and is still worth reviewing.
 */
export const MASTERED_LEVEL: GxLevel = 3;

/** Minimum literal core length for cloze, unless the core contains a kanji. */
export const MIN_CLOZE_CORE = 4;

export interface SessionOptions {
  count: number;
  direction: SessionDirection;
  types: QuestionType[];
  mastered: MasteredMode;
  /** Target share of the session drawn from below-known points (0..1). */
  newRatio: number;
}

export const DEFAULT_SESSION_OPTIONS: SessionOptions = {
  count: 10,
  direction: 'mixed',
  types: ['flip', 'meaning-choice', 'pattern-choice', 'cloze'],
  mastered: 'exclude',
  newRatio: 0.7,
};

export interface SessionQuestion {
  /** The grammar point this question is about. */
  id: string;
  type: QuestionType;
  prompt: string;
  answer: string;
  /** Present for choice types; always includes `answer`. */
  choices?: string[];
  /** Cloze only: the example with the pattern replaced by a blank. */
  blanked?: string;
  /** Cloze only: the untouched example, revealed after answering. */
  sentence?: string;
  /** Familiarity at the moment the session was built. */
  level: GxLevel;
}

export interface SessionPlan {
  questions: SessionQuestion[];
  requested: number;
  delivered: number;
  /** Eligible points after mastered handling, before question construction. */
  poolSize: number;
  ratioRequested: number;
  /** Share of delivered questions that came from below-known points. */
  ratioDelivered: number;
  /** Requested types that could not be built for any point in the pool. */
  unusableTypes: QuestionType[];
}

// ---- deep copy -------------------------------------------------------------

/**
 * Deep-copy the options.
 *
 * `types` is an array, so a bare spread hands out shared state — the trap that
 * bit `grammarPresets`, where a shallow spread left presets sharing arrays with
 * live filter state and merging over the module-level default left them sharing
 * the default's arrays. `DEFAULT_SESSION_OPTIONS` is module-level and mutable;
 * nothing may hand out a reference to its array.
 */
export function snapshotSessionOptions(o: SessionOptions): SessionOptions {
  return { ...o, types: [...o.types] };
}

// ---- deterministic shuffling ----------------------------------------------

/** mulberry32 — small, seedable, good enough to deal cards reproducibly. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ---- cloze eligibility -----------------------------------------------------

const KANJI = /[一-龯㐀-䶿]/;

/**
 * The literal core of a pattern title, or '' when there isn't a usable one.
 *
 * Strips placeholder notation, bracketed annotations *including their contents*
 * (they are English glosses like "(subject particle)", not part of the
 * pattern), latin text and whitespace. Unlike `grammarTitleKey`, which keeps
 * bracket contents because it is building a dedupe key, this needs text that
 * can actually be found in a Japanese sentence.
 *
 * A title listing alternatives (`〜から / 〜ので`) yields its first alternative
 * only; blanking one of two listed forms is correct, blanking a concatenation
 * of both is not.
 */
export function clozeCore(title: string): string {
  const first = String(title || '').split(/[/／]/)[0];
  const core = first
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[〜～~.．…・]/g, '')
    .replace(/[A-Za-z0-9]+/g, '')
    .replace(/\s+/g, '')
    .trim();
  if (!core) return '';
  if (core.length >= MIN_CLOZE_CORE || KANJI.test(core)) return core;
  return '';
}

export interface ClozeMaterial {
  core: string;
  sentence: string;
  blanked: string;
}

/** The first example that verbatim contains the pattern's core, or null. */
export function clozeFor(p: NormalizedGrammarPoint): ClozeMaterial | null {
  const core = clozeCore(p.title);
  if (!core) return null;
  for (const ex of p.examples) {
    const sentence = ex.jp?.trim();
    if (!sentence || !sentence.includes(core)) continue;
    return { core, sentence, blanked: sentence.replace(core, '＿＿＿') };
  }
  return null;
}

// ---- question construction -------------------------------------------------

function meaningOf(p: NormalizedGrammarPoint): string {
  return String(p.meaning || '').trim();
}

/** Whether a point can support a type at all, before distractors are drawn. */
export function canBuild(p: NormalizedGrammarPoint, type: QuestionType): boolean {
  if (!meaningOf(p)) return false;
  if (type === 'cloze') return clozeFor(p) !== null;
  return true;
}

function distractors(
  p: NormalizedGrammarPoint,
  pool: readonly NormalizedGrammarPoint[],
  pick: (x: NormalizedGrammarPoint) => string,
  rng: () => number,
  want = 3,
): string[] {
  const answer = pick(p);
  const seen = new Set<string>([answer]);
  const out: string[] = [];
  // Walk a shuffled pool rather than sampling with retries, so a pool with few
  // distinct values terminates instead of spinning.
  for (const other of shuffled(pool, rng)) {
    if (out.length >= want) break;
    if (other.id === p.id) continue;
    const v = pick(other);
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function buildQuestion(
  p: NormalizedGrammarPoint,
  type: QuestionType,
  pool: readonly NormalizedGrammarPoint[],
  level: GxLevel,
  rng: () => number,
): SessionQuestion | null {
  const meaning = meaningOf(p);
  if (!meaning) return null;

  if (type === 'flip') {
    return { id: p.id, type, prompt: p.title, answer: meaning, level };
  }

  if (type === 'meaning-choice') {
    const wrong = distractors(p, pool, meaningOf, rng);
    // A two-option "choice" is a coin flip, not a question.
    if (wrong.length < 2) return null;
    return {
      id: p.id,
      type,
      prompt: p.title,
      answer: meaning,
      choices: shuffled([meaning, ...wrong], rng),
      level,
    };
  }

  if (type === 'pattern-choice') {
    const wrong = distractors(p, pool, (x) => String(x.title || '').trim(), rng);
    if (wrong.length < 2) return null;
    return {
      id: p.id,
      type,
      prompt: meaning,
      answer: p.title,
      choices: shuffled([p.title, ...wrong], rng),
      level,
    };
  }

  const cloze = clozeFor(p);
  if (!cloze) return null;
  return {
    id: p.id,
    type: 'cloze',
    prompt: cloze.blanked,
    answer: cloze.core,
    blanked: cloze.blanked,
    sentence: cloze.sentence,
    level,
  };
}

// ---- the builder -----------------------------------------------------------

function typesForDirection(types: readonly QuestionType[], dir: SessionDirection): QuestionType[] {
  const wanted = types.filter((t) => QUESTION_TYPES.includes(t));
  if (dir === 'mixed') return wanted;
  return wanted.filter((t) => TYPE_DIRECTION[t] === dir);
}

function eligible(
  points: readonly NormalizedGrammarPoint[],
  state: FamiliarityState,
  mode: MasteredMode,
): NormalizedGrammarPoint[] {
  if (mode === 'include') return [...points];
  const mastered = (p: NormalizedGrammarPoint): boolean =>
    getFamiliarity(state, p.id) >= MASTERED_LEVEL;
  return points.filter((p) => (mode === 'only' ? mastered(p) : !mastered(p)));
}

/**
 * Compose a session.
 *
 * Draws to the requested new/review ratio where the pool allows, backfills from
 * the other side when it doesn't, and reports the ratio it actually achieved
 * rather than the one it was asked for.
 */
export function buildSession(
  points: readonly NormalizedGrammarPoint[],
  state: FamiliarityState,
  options: SessionOptions,
  rng: () => number = Math.random,
): SessionPlan {
  const requested = Math.max(0, Math.floor(options.count) || 0);
  const ratioRequested = Math.min(1, Math.max(0, options.newRatio));
  const types = typesForDirection(options.types, options.direction);
  const pool = eligible(points, state, options.mastered);

  const empty: SessionPlan = {
    questions: [],
    requested,
    delivered: 0,
    poolSize: pool.length,
    ratioRequested,
    ratioDelivered: 0,
    unusableTypes: [...options.types],
  };
  if (!requested || !types.length || !pool.length) return empty;

  const isNew = (p: NormalizedGrammarPoint): boolean =>
    getFamiliarity(state, p.id) < GX_KNOWN_THRESHOLD;

  const newPool = shuffled(pool.filter(isNew), rng);
  const reviewPool = shuffled(pool.filter((p) => !isNew(p)), rng);

  const wantNew = Math.round(requested * ratioRequested);
  // Front-load to the target split, then keep the leftovers as backfill so a
  // short side never costs the user cards it could have dealt.
  const candidates = [
    ...newPool.slice(0, wantNew),
    ...reviewPool.slice(0, requested - wantNew),
    ...newPool.slice(wantNew),
    ...reviewPool.slice(requested - wantNew),
  ];

  const questions: SessionQuestion[] = [];
  const usedTypes = new Set<QuestionType>();
  let fromNew = 0;

  for (const p of candidates) {
    if (questions.length >= requested) break;
    const level = getFamiliarity(state, p.id);
    // Rotate the starting type so a session isn't all flip cards.
    const buildable = types.filter((t) => canBuild(p, t));
    if (!buildable.length) continue;
    const type = buildable[questions.length % buildable.length];
    const q = buildQuestion(p, type, pool, level, rng);
    if (!q) continue;
    questions.push(q);
    usedTypes.add(q.type);
    if (isNew(p)) fromNew += 1;
  }

  return {
    questions,
    requested,
    delivered: questions.length,
    poolSize: pool.length,
    ratioRequested,
    ratioDelivered: questions.length ? fromNew / questions.length : 0,
    unusableTypes: options.types.filter((t) => !usedTypes.has(t)),
  };
}

// ---- persistence -----------------------------------------------------------

export const SESSION_OPTIONS_KEY = 'jp-grammarx-session-options-v1';

export function parseSessionOptions(raw: string | null): SessionOptions {
  // Always start from a fresh copy: merging onto the module-level default and
  // returning it would hand the caller the default's own `types` array.
  const base = snapshotSessionOptions(DEFAULT_SESSION_OPTIONS);
  if (!raw) return base;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return base;
    const o = parsed as Partial<SessionOptions>;

    const count = Math.floor(Number(o.count));
    if (Number.isFinite(count) && count > 0) base.count = Math.min(200, count);

    if (o.direction && SESSION_DIRECTIONS.includes(o.direction)) base.direction = o.direction;
    if (o.mastered && MASTERED_MODES.includes(o.mastered)) base.mastered = o.mastered;

    const ratio = Number(o.newRatio);
    if (Number.isFinite(ratio) && ratio >= 0 && ratio <= 1) base.newRatio = ratio;

    if (Array.isArray(o.types)) {
      const types = o.types.filter((t): t is QuestionType => QUESTION_TYPES.includes(t));
      // An empty type list would build an empty session forever; keep the
      // default rather than persisting a state the user cannot escape.
      if (types.length) base.types = types;
    }
    return base;
  } catch {
    return base;
  }
}

export function loadSessionOptions(): SessionOptions {
  try {
    return parseSessionOptions(localStorage.getItem(SESSION_OPTIONS_KEY));
  } catch {
    return snapshotSessionOptions(DEFAULT_SESSION_OPTIONS);
  }
}

export function saveSessionOptions(o: SessionOptions): void {
  try {
    localStorage.setItem(SESSION_OPTIONS_KEY, JSON.stringify(snapshotSessionOptions(o)));
    mirrorToIdb(IDB_KEYS.grammarSessionOptions, snapshotSessionOptions(o));
  } catch {
    /* storage full or unavailable — the in-memory options still stand */
  }
}

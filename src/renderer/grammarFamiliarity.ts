/**
 * Per-point grammar familiarity.
 *
 * **This deliberately reuses the vocabulary knowledge scale rather than
 * inventing a second one.** `knownWords.ts` has shipped a LingQ-style
 * `WK_LEVELS = ['New','Learning','Familiar','Known']` for a long time, and
 * `levelService.ts` treats Familiar-or-better (`>= 2`) as known when it derives
 * the user's level. A grammar scale with different bands or a different known
 * threshold would mean the app held two incompatible opinions about what
 * "known" means, and any future "how much do I know" view would have to pick
 * one and silently misreport the other.
 *
 * Design rules carried over from `grammarCuration.ts`:
 *
 *  - **Learner state is data applied OVER the generated corpus, never an edit
 *    to it.** `applyFamiliarity` returns decorated copies; the data modules
 *    stay regenerable, so re-running an import cannot destroy progress.
 *  - **A hand-set level is protected.** `Entry.m` mirrors the `m?: 1` flag in
 *    `knownWords.ts`, where `bulkSetFromAnki` refuses to touch manually-set
 *    words. Here it means an automatic result from a practice session records
 *    its statistics but does not move a level the user set themselves.
 *  - **Level 0 is absence, not a stored value.** Like `knownWords.setLevel`,
 *    clearing back to New deletes the entry, so the store stays sparse against
 *    a 1,893-record corpus.
 *
 * ## Why the existing study queue is NOT migrated into levels
 *
 * There is prior grammar user state — `jp-grammarx-explorer-study-v1` (the
 * Explorer's "add to study queue") and a favourites list. It is tempting to
 * seed this store from them, since that would make the migration look
 * substantial. It would also be wrong. Queueing a point records an *intention
 * to study*, not evidence of knowledge, and favouriting records interest.
 * Promoting either into `Learning` would manufacture a familiarity the user
 * never asserted, and once written it is indistinguishable from a level they
 * earned by answering.
 *
 * That is precisely the failure this whole redesign exists to undo: §1.1 of the
 * plan document is the story of register and function tags inferred from a weak
 * signal and then frozen into data nobody could tell apart from the real thing.
 * So the queue and favourites are left exactly where they are and keep their
 * own meaning. This store starts empty and fills only from answers a person
 * actually gave, or levels they set by hand.
 *
 * What the store *is* built for is being migrated: the payload is a versioned
 * envelope from day one, and `parseFamiliarity` maps an unversioned legacy
 * bare-map forward instead of discarding it.
 */

import type { NormalizedGrammarPoint } from './data/grammar/normalize';
import { IDB_KEYS, mirrorToIdb } from './storage/storage';

/** Mirrors `WK_LEVELS` in `knownWords.ts`. Same bands, same order, same meaning. */
export const GX_LEVELS = ['New', 'Learning', 'Familiar', 'Known'] as const;
export type GxLevel = 0 | 1 | 2 | 3;

/**
 * Familiar-or-better counts as known, matching `levelService.ts`, which sums
 * `counts[2] + counts[3]` to get its known total.
 */
export const GX_KNOWN_THRESHOLD = 2;

export interface FamiliarityEntry {
  /** Current band. */
  l: GxLevel;
  /** 1 = set by hand. Automatic session results must not move it. */
  m?: 1;
  /** Total answers recorded against this point. */
  seen: number;
  /** How many of those were correct. */
  correct: number;
  /** When the last answer was recorded (epoch ms); 0 if never answered. */
  at: number;
}

export type FamiliarityState = Readonly<Record<string, FamiliarityEntry>>;

export const FAMILIARITY_LS_KEY = 'jp-grammarx-familiarity-v1';
/** Bump when the stored shape changes, and add a branch to `migrate`. */
export const FAMILIARITY_VERSION = 1;

interface Envelope {
  v: number;
  e: Record<string, FamiliarityEntry>;
}

// ---- pure logic ------------------------------------------------------------

export function getFamiliarity(state: FamiliarityState, id: string): GxLevel {
  return state[id]?.l ?? 0;
}

export function isGrammarKnown(state: FamiliarityState, id: string): boolean {
  return getFamiliarity(state, id) >= GX_KNOWN_THRESHOLD;
}

export function isManual(state: FamiliarityState, id: string): boolean {
  return state[id]?.m === 1;
}

function clampLevel(n: number): GxLevel {
  if (n <= 0) return 0;
  if (n >= 3) return 3;
  return n as GxLevel;
}

/**
 * Set a level explicitly.
 *
 * `manual` defaults to true because the overwhelmingly common caller is a
 * person clicking a band. Setting New by hand deletes the entry, which keeps
 * the store sparse and matches `knownWords.setLevel`.
 */
export function setFamiliarity(
  state: FamiliarityState,
  id: string,
  level: GxLevel,
  manual = true,
  now: number = Date.now(),
): FamiliarityState {
  if (!id) return state;
  const next: Record<string, FamiliarityEntry> = { ...state };
  const prev = next[id];

  if (level === 0 && manual) {
    delete next[id];
    return next;
  }

  next[id] = {
    l: level,
    seen: prev?.seen ?? 0,
    correct: prev?.correct ?? 0,
    at: prev?.at ?? 0,
    ...(manual ? { m: 1 as const } : prev?.m ? { m: prev.m } : {}),
  };
  return next;
}

/**
 * How the learner rated their own recall.
 *
 * Three grades, not two, because "I got it but it was work" is a real and
 * common state and collapsing it into either neighbour lies about progress:
 * scoring it correct promotes a shaky point toward Known, scoring it wrong
 * demotes something the user actually recalled.
 */
export type AnswerGrade = 'hard' | 'okay' | 'good';

/** Bands moved per grade. Okay holds position deliberately. */
export const GRADE_DELTA: Record<AnswerGrade, number> = {
  hard: -1,
  okay: 0,
  good: 1,
};

/**
 * Fold one graded answer into the store.
 *
 * The rule is deliberately plain — good promotes one band, hard demotes one,
 * okay holds — and is **not** a spaced-repetition schedule. Intervals, ease
 * factors and due dates are Anki's job, and this app already exports there.
 * Inventing a second scheduler here would create a competing source of truth
 * about when something is due.
 *
 * `correct` counts good *and* okay: both mean the user produced the answer, and
 * accuracy that treated a hesitant success as a failure would under-report what
 * they know. Only `hard` is a miss.
 *
 * A hand-set level is left alone: the answer still updates `seen`/`correct`/
 * `at`, so the statistics stay honest, but the band the user chose stands.
 */
export function applyGrade(
  state: FamiliarityState,
  id: string,
  grade: AnswerGrade,
  now: number = Date.now(),
): FamiliarityState {
  if (!id) return state;
  const prev = state[id];
  const seen = (prev?.seen ?? 0) + 1;
  const correctCount = (prev?.correct ?? 0) + (grade === 'hard' ? 0 : 1);
  const current: GxLevel = prev?.l ?? 0;
  const level = prev?.m === 1 ? current : clampLevel(current + GRADE_DELTA[grade]);

  const next: Record<string, FamiliarityEntry> = { ...state };
  next[id] = {
    l: level,
    seen,
    correct: correctCount,
    at: now,
    ...(prev?.m ? { m: prev.m } : {}),
  };
  return next;
}

/**
 * Auto-graded convenience wrapper, for question types the app can mark itself.
 *
 * A multiple-choice answer has no middle ground — the user either picked the
 * right option or did not — so it maps onto the outer two grades only.
 */
export function recordAnswer(
  state: FamiliarityState,
  id: string,
  correct: boolean,
  now: number = Date.now(),
): FamiliarityState {
  return applyGrade(state, id, correct ? 'good' : 'hard', now);
}

export function clearFamiliarity(
  state: FamiliarityState,
  ids: readonly string[],
): FamiliarityState {
  const next: Record<string, FamiliarityEntry> = { ...state };
  for (const id of ids) delete next[id];
  return next;
}

/**
 * Counts across a corpus, in scale order.
 *
 * Counted against the points passed in, not against the store's own keys: a
 * point with no entry is New, and a stale entry for a record that no longer
 * exists must not inflate a band. This is the corpus-level reading the UI
 * needs, and the reason it takes `points` at all.
 */
export function familiarityCounts(
  points: readonly NormalizedGrammarPoint[],
  state: FamiliarityState,
): Record<GxLevel, number> {
  const out: Record<GxLevel, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
  for (const p of points) out[getFamiliarity(state, p.id)] += 1;
  return out;
}

export interface WithFamiliarity {
  familiarity: GxLevel;
  familiarityManual: boolean;
}

/**
 * Decorate the corpus with learner state.
 *
 * Always maps, including when the store is empty: every consumer reads
 * `familiarity` unconditionally, so an early return of the undecorated input
 * would hand back objects missing the field. Callers that care about the cold
 * path should skip calling this, not expect it to skip the work.
 */
export function applyFamiliarity(
  points: readonly NormalizedGrammarPoint[],
  state: FamiliarityState,
): Array<NormalizedGrammarPoint & WithFamiliarity> {
  return points.map((p) => ({
    ...p,
    familiarity: getFamiliarity(state, p.id),
    familiarityManual: isManual(state, p.id),
  }));
}

// ---- persistence -----------------------------------------------------------

function coerceEntry(v: unknown): FamiliarityEntry | null {
  if (!v || typeof v !== 'object') return null;
  const e = v as Partial<FamiliarityEntry>;
  const raw = Number(e.l);
  if (!Number.isFinite(raw) || raw < 0 || raw > 3) return null;
  const l = Math.round(raw) as GxLevel;
  const entry: FamiliarityEntry = {
    l,
    seen: Math.max(0, Number(e.seen) || 0),
    correct: Math.max(0, Number(e.correct) || 0),
    at: Math.max(0, Number(e.at) || 0),
  };
  if (e.m === 1) entry.m = 1;
  // A level of 0 is only meaningful if something was actually recorded against
  // it; otherwise it is indistinguishable from absence and is dropped.
  if (entry.l === 0 && !entry.seen && !entry.m) return null;
  return entry;
}

function readEntries(map: Record<string, unknown>): Record<string, FamiliarityEntry> {
  const out: Record<string, FamiliarityEntry> = {};
  for (const [id, v] of Object.entries(map)) {
    const entry = coerceEntry(v);
    if (entry) out[id] = entry;
  }
  return out;
}

/**
 * Parse, migrating forward.
 *
 * Two accepted shapes: the current versioned envelope, and an unversioned bare
 * map of id → entry. The bare map is treated as v0 and mapped forward rather
 * than discarded — §4's rule that a migration reads once, maps forward and
 * destroys nothing.
 */
export function parseFamiliarity(raw: string | null): FamiliarityState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const env = parsed as Partial<Envelope>;
    if (typeof env.v === 'number' && env.e && typeof env.e === 'object') {
      return readEntries(env.e as Record<string, unknown>);
    }
    // v0: bare map written before the envelope existed.
    return readEntries(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function loadFamiliarity(): FamiliarityState {
  try {
    return parseFamiliarity(localStorage.getItem(FAMILIARITY_LS_KEY));
  } catch {
    return {};
  }
}

export function saveFamiliarity(state: FamiliarityState): void {
  const envelope: Envelope = { v: FAMILIARITY_VERSION, e: state as Record<string, FamiliarityEntry> };
  try {
    localStorage.setItem(FAMILIARITY_LS_KEY, JSON.stringify(envelope));
    mirrorToIdb(IDB_KEYS.grammarFamiliarity, envelope);
  } catch {
    /* storage full or unavailable — the in-memory state still stands */
  }
}

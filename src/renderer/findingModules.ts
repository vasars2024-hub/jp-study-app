// Real readouts for the Aero / WIRED "finding" overlay modules.
//
// The overlay modules used to be buttons that pushed one hardcoded English
// sentence into a fake console. This module gives each of them something true
// to say: every readout below is computed from material the user actually has —
// their mined deck, their word-knowledge levels, their reading stats, their
// lookup history — so a module reflects the current session instead of a
// fixture.
//
// Two themes consume this: WIRED skins the readouts as decoding instruments,
// Aero as 2007 desktop gadgets. The fiction differs; the numbers do not.
//
// Everything here is pure and seeded. Overlays render on an interval, so a
// readout that called Math.random() would reshuffle itself mid-frame and the
// answer to a quiz would change out from under the user. Callers pass a seed
// that only advances when the module is meant to move on.

import type { VocabItem } from './games/contentSource';
import type { WkLevel } from './knownWords';
import { hasKanji } from '../shared/furigana';

export { hasKanji };

// One definition, in shared/furigana — it now covers the union of the ranges the two
// copies used. Re-exported so this module's existing importers (and its tests) are
// unaffected.

/**
 * Deterministic index into `length` for `seed`.
 *
 * A plain `seed % length` walks neighbouring entries on consecutive seeds,
 * which reads as "the list is just scrolling". Hashing first decorrelates
 * successive seeds so the pick feels drawn rather than iterated.
 */
export function seededIndex(seed: number, length: number): number {
  if (length <= 0) return 0;
  let h = (seed ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  // `^` yields a SIGNED 32-bit int, so the final coercion back to unsigned is
  // load-bearing: without it a negative hash makes `% length` a negative index
  // and every caller silently reads undefined out of its pool.
  return ((h ^ (h >>> 16)) >>> 0) % length;
}

/** Pick `count` distinct entries, starting at the seeded index. */
function seededSample<T>(items: readonly T[], count: number, seed: number): T[] {
  if (items.length <= count) return [...items];
  const start = seededIndex(seed, items.length);
  const out: T[] = [];
  for (let i = 0; i < items.length && out.length < count; i++) {
    out.push(items[(start + i * 7 + 1) % items.length]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Kanji decode challenge — the quiz behind WIRED's Voight-Kampff and Aero's
// Setup Wizard. Both ask the same question; only the framing differs.
// ---------------------------------------------------------------------------

export interface KanjiChallenge {
  /** The word being tested — always contains at least one kanji. */
  word: string;
  /** The correct reading. */
  reading: string;
  meaning: string;
  /** Four readings, the correct one among them. */
  choices: string[];
  answerIndex: number;
}

/**
 * Build a multiple-choice reading quiz from the user's own vocabulary.
 *
 * Distractors are other real readings from the same pool rather than mutated
 * strings: a mangled reading is obviously wrong at a glance, which makes the
 * quiz decorative. Drawing from the pool means every option is plausible.
 *
 * Returns null when the pool can't support a question (no kanji words, or
 * fewer than two distinct readings to choose between) — callers must render an
 * honest empty state rather than a quiz with one option.
 */
export function buildKanjiChallenge(vocab: readonly VocabItem[], seed: number): KanjiChallenge | null {
  const usable = vocab.filter((v) => hasKanji(v.word) && v.reading && v.reading !== v.word);
  if (usable.length === 0) return null;

  const target = usable[seededIndex(seed, usable.length)];
  const pool = usable.filter((v) => v.reading !== target.reading);
  const distractors = seededSample(pool, 3, seed + 1).map((v) => v.reading);
  if (distractors.length === 0) return null;

  const choices = [target.reading, ...distractors];
  // Rotate rather than shuffle: a seeded rotation is stable across re-renders
  // of the same seed, so the correct answer doesn't hop between paint cycles.
  const shift = seededIndex(seed + 2, choices.length);
  const rotated = [...choices.slice(shift), ...choices.slice(0, shift)];

  return {
    word: target.word,
    reading: target.reading,
    meaning: target.meaning,
    choices: rotated,
    answerIndex: rotated.indexOf(target.reading),
  };
}

// ---------------------------------------------------------------------------
// Study verdict — WIRED's MAGI deliberation, Aero's Update Advisor.
// Three "units" independently read a different signal and vote on what the
// user should do next. The joke is the ceremony; the recommendation is real.
// ---------------------------------------------------------------------------

export type VerdictAction = 'review' | 'mine' | 'read' | 'rest';

export interface VerdictUnit {
  /** Stable id — the theme supplies the display name. */
  id: 'balthasar' | 'melchior' | 'casper';
  vote: VerdictAction;
}

export interface StudyVerdict {
  units: VerdictUnit[];
  /** The action with the most votes; ties resolve toward the first unit. */
  consensus: VerdictAction;
  /** How many units agreed, for the "2-1 / 3-0" readout. */
  agreement: number;
  total: number;
}

export interface VerdictSignals {
  /** Consecutive active days. */
  streak: number;
  /** Seconds studied today. */
  todaySeconds: number;
  /** Words at each knowledge level. */
  knowledge: Record<WkLevel, number>;
  /** Total usable vocabulary in the deck. */
  deckSize: number;
}

/**
 * Three independent reads on the same session.
 *
 * Each unit owns one signal so the votes can genuinely disagree — a unanimous
 * verdict then means something. Balthasar watches backlog, Melchior watches
 * deck growth, Casper watches fatigue.
 */
export function computeStudyVerdict(signals: VerdictSignals): StudyVerdict {
  const { streak, todaySeconds, knowledge, deckSize } = signals;
  const learning = (knowledge[1] ?? 0) + (knowledge[2] ?? 0);
  const known = knowledge[3] ?? 0;
  const minutes = todaySeconds / 60;

  // Backlog: a big partially-learned pile means review before anything new.
  const balthasar: VerdictAction = learning >= 20 ? 'review' : learning >= 5 ? 'read' : 'mine';
  // Growth: a thin deck needs material more than it needs drilling.
  const melchior: VerdictAction = deckSize < 25 ? 'mine' : known > learning * 2 ? 'mine' : 'review';
  // Fatigue: a long session on a long streak earns a stop.
  const casper: VerdictAction = minutes >= 45 ? 'rest' : minutes >= 10 && streak >= 3 ? 'read' : 'review';

  const units: VerdictUnit[] = [
    { id: 'balthasar', vote: balthasar },
    { id: 'melchior', vote: melchior },
    { id: 'casper', vote: casper },
  ];

  const tally = new Map<VerdictAction, number>();
  for (const u of units) tally.set(u.vote, (tally.get(u.vote) ?? 0) + 1);

  let consensus = units[0].vote;
  let agreement = tally.get(consensus) ?? 1;
  for (const u of units) {
    const n = tally.get(u.vote) ?? 0;
    if (n > agreement) {
      consensus = u.vote;
      agreement = n;
    }
  }

  return { units, consensus, agreement, total: units.length };
}

// ---------------------------------------------------------------------------
// Bounty board — WIRED's woolong bounties, Aero's Minesweeper high-score board.
// The "wanted" list is the user's genuinely weakest vocabulary.
// ---------------------------------------------------------------------------

export interface BountyTarget {
  word: string;
  reading: string;
  meaning: string;
  /** Scales with how unlearned the word is. Flavour, but monotonic in difficulty. */
  bounty: number;
}

/**
 * The words worth the most to capture: lowest knowledge level first.
 *
 * `levelOf` is injected so this stays pure — the renderer supplies the real
 * `getLevel` from knownWords.
 */
export function buildBountyBoard(
  vocab: readonly VocabItem[],
  levelOf: (word: string) => WkLevel,
  count = 3,
): BountyTarget[] {
  return vocab
    .map((v) => ({ item: v, level: levelOf(v.word) }))
    .filter((e) => e.level < 3)
    .sort((a, b) => a.level - b.level || b.item.word.length - a.item.word.length)
    .slice(0, count)
    .map(({ item, level }) => ({
      word: item.word,
      reading: item.reading,
      meaning: item.meaning,
      // New (0) pays most; Familiar (2) least. Length is a rough proxy for effort.
      bounty: (3 - level) * 1500 + item.word.length * 300,
    }));
}

// ---------------------------------------------------------------------------
// Session gauge — WIRED's capsule sync, Aero's media-player meter.
// ---------------------------------------------------------------------------

export interface SessionGauge {
  streak: number;
  todayMinutes: number;
  /** Progress toward a 30-minute day, clamped to 0..1. */
  pct: number;
  /** Which band the session is in — themes map this to their own copy. */
  band: 'cold' | 'warming' | 'nominal' | 'overdrive';
}

const DAILY_TARGET_MINUTES = 30;

export function computeSessionGauge(streak: number, todaySeconds: number): SessionGauge {
  const todayMinutes = todaySeconds / 60;
  const pct = Math.min(1, Math.max(0, todayMinutes / DAILY_TARGET_MINUTES));
  const band: SessionGauge['band'] =
    todayMinutes >= DAILY_TARGET_MINUTES * 2
      ? 'overdrive'
      : pct >= 1
        ? 'nominal'
        : pct > 0.15
          ? 'warming'
          : 'cold';
  return { streak, todayMinutes, pct, band };
}

// ---------------------------------------------------------------------------
// Intercepted term — WIRED's ghost line, Aero's messenger nudge.
// A word from the deck with its meaning withheld until asked for.
// ---------------------------------------------------------------------------

export interface InterceptedTerm {
  word: string;
  reading: string;
  meaning: string;
}

export function pickInterceptedTerm(vocab: readonly VocabItem[], seed: number): InterceptedTerm | null {
  const usable = vocab.filter((v) => v.word && v.meaning);
  if (usable.length === 0) return null;
  const v = usable[seededIndex(seed, usable.length)];
  return { word: v.word, reading: v.reading, meaning: v.meaning };
}

/**
 * Noctis Simulation Engine — the interpretation membrane.
 *
 * Implements the pipeline of LEARNING_INTEGRATION.md Section 4: raw telemetry
 * crosses this membrane exactly once and becomes the interpreted learning
 * input I — the only thing any domain is ever allowed to know about the
 * user's real study life. Translation, not transcription (GAME_DESIGN.md
 * Section 1): ten minutes of reading never becomes ten of anything.
 *
 * Privacy law (LEARNING_INTEGRATION.md Section 9): the TelemetryWindow
 * carries counts only — no book title, word, id, or timestamp — and the
 * output profile is bounded and irreversible.
 *
 * Honesty law (Section 6): every dimension traces to real telemetry or is
 * explicitly low-signal; nothing is fabricated to satisfy a receiving domain.
 * Optional v1.01 inputs (Game Arena results, Mirror Writing evaluations,
 * LevelService coverage) upgrade dimensions from inferred to measured when
 * present and degrade gracefully when absent (invariants 4 and 9).
 */

import {
  InterpretedLearningInput,
  InterpretedProfile,
  PathwayWeights,
  TelemetryWindow,
} from './types';
import { AbyssalConstraintError } from './constraints';

/** Smooth saturating map onto [0,1): s(x) = x / (x + scale). */
function sat(x: number, scale: number): number {
  if (x <= 0) return 0;
  return x / (x + scale);
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Streak lengths whose crossing is a conservative milestone candidate. */
const MILESTONE_STREAKS = [7, 30, 100, 365];

function validateWindow(w: TelemetryWindow): void {
  const nums: Array<[string, number]> = [
    ['focusSeconds', w.focusSeconds],
    ['chars', w.chars],
    ['streak', w.streak],
    ['savedWordDelta', w.savedWordDelta],
    ['flashcardEventCount', w.flashcardEventCount],
    ['achievementCount', w.achievementCount],
    ['distinctBooks', w.distinctBooks],
    ['newBooks', w.newBooks],
    ['knowledgeCounts.learning', w.knowledgeCounts.learning],
    ['knowledgeCounts.familiar', w.knowledgeCounts.familiar],
    ['knowledgeCounts.known', w.knowledgeCounts.known],
  ];
  for (const [name, value] of nums) {
    if (typeof value !== 'number' || !isFinite(value) || value < 0) {
      // Malformed input is a developer error, not a simulation event
      // (LEARNING_INTEGRATION.md Section 4, stage 2).
      throw new AbyssalConstraintError(`Interpretation: invalid telemetry ${name} = ${value}`);
    }
  }
}

function deriveProfile(w: TelemetryWindow): InterpretedProfile {
  const seconds = Math.max(w.focusSeconds, 1);
  const charsPerSecond = w.chars / seconds;

  const knowledgeTotal =
    w.knowledgeCounts.learning + w.knowledgeCounts.familiar + w.knowledgeCounts.known;

  const games = w.gameResults || [];
  const writings = w.writingEvaluations || [];
  const hasGames = games.length > 0;
  const hasWritings = writings.length > 0;

  const meanGameAccuracy = hasGames
    ? games.reduce((acc, g) => acc + clamp01(g.accuracy), 0) / games.length
    : 0;
  const meanWriting = hasWritings
    ? writings.reduce(
        (acc, e) => acc + (e.grammar + e.lexical + e.flow + e.semantic) / 400,
        0,
      ) / writings.length
    : 0;

  // conceptualDepth — how substantively, not just how long, the session
  // engaged material: character density against a fluent-reading scale,
  // upgraded by measured writing quality when present.
  let conceptualDepth = sat(charsPerSecond, 3);
  if (hasWritings) conceptualDepth = clamp01(0.6 * conceptualDepth + 0.4 * meanWriting);

  // retention — proportion of tracked vocabulary that has actually stuck
  // (Familiar + Known vs Learning; knownWords.ts three-stage scale).
  const retention =
    knowledgeTotal > 0
      ? (w.knowledgeCounts.familiar + w.knowledgeCounts.known) / knowledgeTotal
      : 0;

  // disciplinaryExposure — honestly near-constant today (one tracked
  // discipline); multi-activity windows read slightly broader.
  const activityKinds =
    (w.chars > 0 ? 1 : 0) +
    (w.flashcardEventCount > 0 ? 1 : 0) +
    (hasGames ? 1 : 0) +
    (hasWritings ? 1 : 0) +
    ((w.pronunciationAttempts || 0) > 0 ? 1 : 0);
  const disciplinaryExposure = clamp01(0.2 + 0.06 * Math.max(0, activityKinds - 1));

  // interdisciplinaryConnection — near-zero, an honest gap: no cross-subject
  // telemetry exists (LEARNING_INTEGRATION.md Section 6). Cross-modal windows
  // register faintly.
  const interdisciplinaryConnection = activityKinds >= 3 ? 0.1 : 0;

  // sustainedAttention — depth of the sitting; saturates near an hour.
  const sustainedAttention = sat(w.focusSeconds, 2400);

  // mastery — accumulated command: Known proportion, blended with measured
  // level coverage when the LevelService exists (v1.01 Phase 0.5).
  let mastery = knowledgeTotal > 0 ? w.knowledgeCounts.known / knowledgeTotal : 0;
  if (typeof w.levelCoverage === 'number') {
    mastery = clamp01(0.5 * mastery + 0.5 * clamp01(w.levelCoverage));
  }
  if (typeof w.userLevel === 'number') {
    mastery = clamp01(0.7 * mastery + 0.3 * clamp01(w.userLevel / 7));
  }

  // curiosity — words kept beyond what review requires, plus fresh books
  // opened unprompted.
  const curiosity = clamp01(sat(w.savedWordDelta, 4) + 0.1 * Math.min(w.newBooks, 2));

  // revisionStrength — deliberate practice vs passive exposure.
  const revisionStrength = clamp01(
    sat(w.flashcardEventCount, 4) + 0.15 * sat(w.pronunciationAttempts || 0, 6),
  );

  // difficulty — measured from game accuracy / writing scores when present;
  // otherwise thinly inferred from strained reading density (low confidence,
  // Section 9).
  let difficulty: number;
  if (hasGames || hasWritings) {
    const gameStruggle = hasGames ? 1 - meanGameAccuracy : 0;
    const writingStruggle = hasWritings ? 1 - meanWriting : 0;
    const parts = (hasGames ? 1 : 0) + (hasWritings ? 1 : 0);
    difficulty = clamp01((gameStruggle + writingStruggle) / parts);
  } else {
    const strained = w.focusSeconds > 600 && charsPerSecond < 0.8;
    difficulty = strained ? clamp01(0.5 - charsPerSecond / 2) : 0.15;
  }

  // novelty — fresh material vs consolidation: new books and newly-Learning
  // vocabulary against the established stock.
  const freshVocab = knowledgeTotal > 0 ? w.knowledgeCounts.learning / knowledgeTotal : 0;
  const novelty = clamp01(
    0.5 * (w.distinctBooks > 0 ? w.newBooks / w.distinctBooks : 0) + 0.5 * freshVocab,
  );

  return {
    conceptualDepth: clamp01(conceptualDepth),
    retention: clamp01(retention),
    disciplinaryExposure,
    interdisciplinaryConnection,
    sustainedAttention: clamp01(sustainedAttention),
    mastery: clamp01(mastery),
    curiosity,
    revisionStrength,
    difficulty: clamp01(difficulty),
    novelty,
  };
}

/**
 * Pathway resolution (LEARNING_INTEGRATION.md Section 7): today's Study OS
 * tracks language immersion, resolving overwhelmingly to the
 * history/languages -> glucans -> mycelial tendency, with a minor creative
 * lean. Measured creative production (Mirror Writing) shifts weight toward
 * the catalyst register. Adding a future tracked activity means adding one
 * entry here — no other stage changes.
 */
function resolvePathways(w: TelemetryWindow): PathwayWeights {
  const creativeShift = (w.writingEvaluations || []).length > 0 ? 0.1 : 0;
  return {
    brine: 0.05,
    glucans: 0.8 - creativeShift,
    catalysts: 0.15 + creativeShift,
  };
}

/**
 * Protected-milestone detection (LEARNING_INTEGRATION.md Section 8):
 * deliberately conservative and grounded in real signals — an achievement
 * note fired, a level was newly reached, or the streak sits exactly on a
 * meaningful threshold this window. Most sessions are not milestones.
 */
function detectMilestone(w: TelemetryWindow): boolean {
  if (w.achievementCount > 0) return true;
  if (w.levelUp === true) return true;
  return MILESTONE_STREAKS.indexOf(w.streak) >= 0;
}

/**
 * The membrane: TelemetryWindow -> InterpretedLearningInput. Deterministic —
 * the same telemetry produces the same I, always (Section 10) — and lossy on
 * purpose: nothing downstream can reconstruct what was read (Section 9).
 */
export function interpretTelemetry(window: TelemetryWindow): InterpretedLearningInput {
  validateWindow(window);
  const profile = deriveProfile(window);
  const measured =
    (window.gameResults || []).length > 0 || (window.writingEvaluations || []).length > 0;
  return {
    focusDuration: window.focusSeconds / 60,
    profile,
    pathways: resolvePathways(window),
    difficulty: profile.difficulty,
    difficultyConfidence: measured ? 'measured' : 'inferred',
    consistency: Math.floor(window.streak),
    completion: detectMilestone(window),
  };
}

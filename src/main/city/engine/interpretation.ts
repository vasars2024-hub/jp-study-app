import { InterpretedLearningInput, TelemetryWindow } from './types';
import { mean, saturating, unit } from './math';

function safe(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, value as number) : 0;
}

/** Deterministic counts-only interpretation membrane. LEARNING_INTEGRATION.md Sections 4–8. */
export function interpretTelemetry(raw: TelemetryWindow): InterpretedLearningInput {
  const focusSeconds = safe(raw.focusSeconds);
  const chars = safe(raw.chars);
  const learning = safe(raw.knowledgeCounts && raw.knowledgeCounts.learning);
  const familiar = safe(raw.knowledgeCounts && raw.knowledgeCounts.familiar);
  const known = safe(raw.knowledgeCounts && raw.knowledgeCounts.known);
  const vocabularyTotal = learning + familiar + known;
  const density = focusSeconds > 0 ? chars / focusSeconds : 0;
  const densitySignal = saturating(density, 6);
  const sustainedAttention = saturating(focusSeconds, 35 * 60);
  const retention = vocabularyTotal > 0 ? unit((familiar + known) / vocabularyTotal) : 0;
  const mastery = vocabularyTotal > 0 ? unit(known / vocabularyTotal) : 0;
  const curiosity = unit(safe(raw.savedWordDelta) / Math.max(1, chars / 900));
  const revisionEvents = safe(raw.flashcardEventCount) + safe(raw.knowledgeChangeCount) * 0.25;
  const revisionStrength = unit(revisionEvents / Math.max(1, focusSeconds / 600));
  const novelty = unit((safe(raw.newBooks) + safe(raw.savedWordDelta) * 0.1) / Math.max(1, safe(raw.distinctBooks) + 1));

  const gameResults = raw.gameResults || [];
  const gameAccuracy = gameResults.length > 0 ? mean(gameResults.map((result) => unit(safe(result.accuracy)))) : 0;
  const gameDifficulty = gameResults.length > 0
    ? mean(gameResults.map((result) => unit(safe(result.mistakeCount) / Math.max(1, safe(result.mistakeCount) + 4))))
    : 0;
  const writing = raw.writingEvaluations || [];
  const writingDepth = writing.length > 0
    ? mean(writing.map((result) => unit(mean([safe(result.grammar), safe(result.lexical), safe(result.flow), safe(result.semantic)]) / 100)))
    : 0;

  const conceptualDepth = unit(mean([
    densitySignal,
    retention,
    writing.length > 0 ? writingDepth : densitySignal,
    gameResults.length > 0 ? gameAccuracy : densitySignal,
  ]));
  const difficulty = unit(gameResults.length > 0 ? gameDifficulty : (focusSeconds > 0 ? 1 - densitySignal : 0));
  const disciplinaryExposure = unit(0.08 + Math.min(0.12, safe(raw.distinctBooks) * 0.02));
  const interdisciplinaryConnection = unit(
    (gameResults.length > 0 ? 0.04 : 0) + (writing.length > 0 ? 0.04 : 0),
  );

  const brineLean = gameResults.length > 0 ? 0.12 : 0.04;
  const catalystLean = writing.length > 0 ? 0.22 : 0.16;
  const glucanLean = Math.max(0, 1 - brineLean - catalystLean);
  const completion = safe(raw.achievementCount) > 0 || raw.levelUp === true || gameResults.some((result) => safe(result.accuracy) >= 0.95);

  return {
    focusDuration: focusSeconds / 60,
    profile: {
      conceptualDepth,
      retention,
      disciplinaryExposure,
      interdisciplinaryConnection,
      sustainedAttention,
      mastery,
      curiosity,
      revisionStrength,
      difficulty,
      novelty,
    },
    pathways: { brine: brineLean, glucans: glucanLean, catalysts: catalystLean },
    difficulty,
    difficultyConfidence: gameResults.length > 0 ? 'measured' : 'inferred',
    consistency: Math.floor(safe(raw.streak)),
    completion,
  };
}

export function hasMeaningfulTelemetry(raw: TelemetryWindow): boolean {
  return safe(raw.focusSeconds) > 0
    || safe(raw.chars) > 0
    || safe(raw.flashcardEventCount) > 0
    || safe(raw.knowledgeChangeCount) > 0
    || safe(raw.achievementCount) > 0
    || safe(raw.savedWordDelta) > 0
    || raw.levelUp === true
    || (raw.gameResults || []).length > 0
    || (raw.writingEvaluations || []).length > 0
    || safe(raw.pronunciationAttempts) > 0;
}

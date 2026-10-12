/**
 * What the optional AI helpers for grammar, statistics, planning, onboarding and
 * the Blanc study tools share (docs/AI_AUDIT.md N16, N17-adjacent, N21, N22,
 * N25, N26, N27):
 *
 * - `grammarExplain`     "Explain this pattern" for a grammar point with no content of its own
 * - `grammarExamples`    example sentences for a point, saved only when the learner approves
 * - `grammarProduction`  grade a sentence the learner wrote with the pattern, suggest a rating
 * - `grammarSighting`    confirm or reject the offline matcher's sightings of a point
 * - `statsCoach`         "Explain my stats": 3-5 suggestions from a compact numeric summary
 * - `goalSuggest`        daily-goal targets from the last two weeks of study
 * - `eventParse`         a calendar event from a sentence ("kanji every Tue/Thu 7pm for 30 min")
 * - `placementQuiz`      a short mixed-level quiz that suggests a starting level
 * - `settingsHelp`       which real settings answer a question the keyword search missed
 * - `blancMistake`       "Explain my mistake" in the conjugation drill and the counter reader
 * - `blancSummary`       a memory aid for a kanji, a summary of a text sample
 *
 * Every one is ADDITIVE: the surface works exactly as before without it, each
 * has a deterministic fallback computed without a model, each runs on the
 * offline model when that is the configured engine, and a cloud provider is
 * used only when the feature's own opt-in in Settings > AI allows it (they all
 * start OFF). Replies use the shared `AiStudyResponse` shape and error codes and
 * run through the one runner in `main/aiStudyAssist.ts`.
 *
 * Pure and framework-free: the renderer and main both read it.
 */
import type { AiStudyResponse } from './aiStudyCommon';
import { cloudMayReceiveStudyData } from './agentCloudStudyDataGate';
import { immerseTextInStudyLang } from './aiImmerseCommon';
import type { StudyLang } from './studyLang';

export type AiTutorFeature =
  | 'grammarExplain'
  | 'grammarExamples'
  | 'grammarProduction'
  | 'grammarSighting'
  | 'statsCoach'
  | 'goalSuggest'
  | 'eventParse'
  | 'placementQuiz'
  | 'settingsHelp'
  | 'blancMistake'
  | 'blancSummary';

/** True when `text` is written (at least partly) in the study language's script. */
export function tutorTextInStudyLang(text: string, lang: StudyLang): boolean {
  return immerseTextInStudyLang(text, lang);
}

/** A finite number clamped to [min, max], or `fallback`. */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** A finite number clamped to [min, max], or null. */
export function clampOrNull(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number.NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

/**
 * The refusal for a cloud request that would carry the learner's study
 * statistics while they have not allowed that (the Agent's one-time notice,
 * `agentCloudStudyDataGate.ts`). The offline engine is never refused here.
 */
export const STUDY_DATA_WITHHELD_MESSAGE =
  'Study statistics stay on this device. Allow sharing them in Agent settings, or switch the engine to Offline.';

export function studyDataCloudGate(share: unknown): AiStudyResponse<never> | null {
  if (cloudMayReceiveStudyData(share)) return null;
  return { ok: false, code: 'consent', studyDataWithheld: true, error: STUDY_DATA_WITHHELD_MESSAGE };
}

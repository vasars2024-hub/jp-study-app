/**
 * The optional AI helpers for grammar, statistics, planning, onboarding and the
 * Blanc study tools, in main (the feature list is in `shared/aiTutorCommon.ts`).
 *
 * No runner of its own: every helper is a spec for `runAiStudyFeature`
 * (`aiStudyAssist.ts`), so each one goes through the same steps — the "Use AI
 * features" switch, a normalized request, the configured engine (the offline
 * model needs no opt-in; a cloud provider needs this feature's own opt-in and a
 * key), the cache of validated answers, a cancellable call (`aiStudy:cancel`),
 * then zod for the shape and the feature's own checks for the content. Only an
 * answer that passes both is cached or returned.
 *
 * The statistics and goal helpers carry study statistics, so a CLOUD request
 * additionally needs the Agent's study-data permission (`cloudGate`).
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import type { AiStudyResponse } from '../shared/aiStudyCommon';
import { studyDataCloudGate } from '../shared/aiTutorCommon';
import {
  GRAMMAR_EXAMPLES_PROMPT_VERSION,
  GRAMMAR_EXAMPLES_SCHEMA,
  GRAMMAR_EXPLAIN_PROMPT_VERSION,
  GRAMMAR_EXPLAIN_SCHEMA,
  GRAMMAR_PRODUCTION_PROMPT_VERSION,
  GRAMMAR_PRODUCTION_SCHEMA,
  GRAMMAR_SIGHTING_PROMPT_VERSION,
  GRAMMAR_SIGHTING_SCHEMA,
  buildGrammarExamplesPrompt,
  buildGrammarExplainPrompt,
  buildGrammarProductionPrompt,
  buildGrammarSightingPrompt,
  finalizeGrammarExamplesResult,
  finalizeGrammarExplainResult,
  finalizeGrammarProductionResult,
  finalizeGrammarSightingResult,
  grammarExamplesKeyParts,
  grammarExplainKeyParts,
  grammarProductionKeyParts,
  grammarSightingKeyParts,
  isGrammarExamplesResult,
  isGrammarExplainResult,
  isGrammarProductionResult,
  isGrammarSightingResult,
  normalizeGrammarExamplesRequest,
  normalizeGrammarExplainRequest,
  normalizeGrammarProductionRequest,
  normalizeGrammarSightingRequest,
  type GrammarExamplesRequest,
  type GrammarExamplesResult,
  type GrammarExplainRequest,
  type GrammarExplainResult,
  type GrammarProductionRequest,
  type GrammarProductionResult,
  type GrammarSightingRequest,
  type GrammarSightingResult,
} from '../shared/aiGrammarTutor';
import {
  STATS_COACH_PROMPT_VERSION,
  STATS_COACH_SCHEMA,
  buildStatsCoachPrompt,
  finalizeStatsCoachResult,
  isStatsCoachResult,
  normalizeStatsCoachRequest,
  statsCoachKeyParts,
  type StatsCoachRequest,
  type StatsCoachResult,
} from '../shared/aiStatsCoach';
import {
  EVENT_PARSE_PROMPT_VERSION,
  EVENT_PARSE_SCHEMA,
  GOAL_SUGGEST_PROMPT_VERSION,
  GOAL_SUGGEST_SCHEMA,
  buildEventParsePrompt,
  buildGoalSuggestPrompt,
  eventParseKeyParts,
  finalizeEventDraft,
  finalizeGoalSuggestResult,
  goalSuggestKeyParts,
  isEventDraft,
  isGoalSuggestResult,
  normalizeEventParseRequest,
  normalizeGoalSuggestRequest,
  type EventDraft,
  type EventParseRequest,
  type GoalSuggestRequest,
  type GoalSuggestResult,
} from '../shared/aiStudyPlanner';
import {
  PLACEMENT_QUIZ_PROMPT_VERSION,
  PLACEMENT_QUIZ_SCHEMA,
  SETTINGS_HELP_PROMPT_VERSION,
  SETTINGS_HELP_SCHEMA,
  buildPlacementQuizPrompt,
  buildSettingsHelpPrompt,
  finalizePlacementQuizResult,
  finalizeSettingsHelpResult,
  isPlacementQuizResult,
  isSettingsHelpResult,
  normalizePlacementQuizRequest,
  normalizeSettingsHelpRequest,
  placementQuizKeyParts,
  settingsHelpKeyParts,
  type PlacementQuizRequest,
  type PlacementQuizResult,
  type SettingsHelpRequest,
  type SettingsHelpResult,
} from '../shared/aiOnboarding';
import {
  BLANC_MISTAKE_PROMPT_VERSION,
  BLANC_MISTAKE_SCHEMA,
  BLANC_SUMMARY_PROMPT_VERSION,
  BLANC_SUMMARY_SCHEMA,
  blancMistakeKeyParts,
  blancSummaryKeyParts,
  buildBlancMistakePrompt,
  buildBlancSummaryPrompt,
  finalizeBlancMistakeResult,
  finalizeBlancSummaryResult,
  isBlancMistakeResult,
  isBlancSummaryResult,
  normalizeBlancMistakeRequest,
  normalizeBlancSummaryRequest,
  type BlancMistakeRequest,
  type BlancMistakeResult,
  type BlancSummaryRequest,
  type BlancSummaryResult,
} from '../shared/aiBlancTutor';
import { aiStudyStreamDeps, runAiStudyFeature, type AiStudyDeps, type AiStudyFeatureSpec } from './aiStudyAssist';

// ---- the reply shapes ------------------------------------------------------------
// Lenient where an omission is harmless (no nuance is ''), strict where it is not
// (a grade without its verdicts is no grade).

const exampleShape = z.object({ text: z.string(), translation: z.string().optional().default('') });

const grammarExplainValidator = z.object({
  summary: z.string().min(1),
  formation: z.string().min(1),
  usage: z.string().optional().default(''),
  nuance: z.string().optional().default(''),
  examples: z.array(exampleShape).optional().default([]),
});

const grammarExamplesValidator = z.object({
  sentences: z.array(z.object({
    text: z.string(),
    reading: z.string().optional().default(''),
    translation: z.string().optional().default(''),
  })).min(1),
});

const grammarProductionValidator = z.object({
  usesPattern: z.boolean(),
  correct: z.boolean(),
  natural: z.boolean(),
  explanation: z.string().min(1),
  corrected: z.string().optional().default(''),
  suggestedRating: z.string(),
});

const grammarSightingValidator = z.object({
  verdicts: z.array(z.object({
    id: z.coerce.string(),
    uses: z.boolean(),
    note: z.string().optional().default(''),
  })).min(1),
});

const statsCoachValidator = z.object({
  summary: z.string().min(1),
  suggestions: z.array(z.object({ text: z.string(), basis: z.string() })).min(1),
});

const goalSuggestValidator = z.object({
  reviews: z.coerce.number(),
  newCards: z.coerce.number(),
  minutes: z.coerce.number(),
  reason: z.string().min(1),
});

const eventParseValidator = z.object({
  title: z.string().min(1),
  date: z.string(),
  startTime: z.string().optional().default(''),
  endTime: z.string().optional().default(''),
  recurrence: z.string().optional().default('none'),
  weekdays: z.array(z.coerce.number()).optional().default([]),
});

const placementQuizValidator = z.object({
  items: z.array(z.object({
    level: z.union([z.string(), z.number()]),
    word: z.string(),
    prompt: z.string(),
    choices: z.array(z.string()),
    answer: z.coerce.number(),
  })).min(1),
});

const settingsHelpValidator = z.object({
  matches: z.array(z.object({ id: z.coerce.string(), reason: z.string().optional().default('') })),
});

const blancMistakeValidator = z.object({
  explanation: z.string().min(1),
  rule: z.string().optional().default(''),
  tip: z.string().optional().default(''),
});

const blancSummaryValidator = z.object({
  headline: z.string().min(1),
  points: z.array(z.string()).optional().default([]),
});

// ---- the specs -------------------------------------------------------------------

type Spec<Req extends { requestId?: string; refresh?: boolean }, V extends z.ZodTypeAny, Res> =
  AiStudyFeatureSpec<Req, z.infer<V>, Res>;

const grammarExplainSpec: Spec<GrammarExplainRequest, typeof grammarExplainValidator, GrammarExplainResult> = {
  feature: 'grammarExplain',
  promptVersion: GRAMMAR_EXPLAIN_PROMPT_VERSION,
  normalize: normalizeGrammarExplainRequest,
  keyParts: grammarExplainKeyParts,
  prompt: buildGrammarExplainPrompt,
  schema: GRAMMAR_EXPLAIN_SCHEMA,
  validator: grammarExplainValidator,
  finalize: finalizeGrammarExplainResult,
  isCached: (value: unknown): value is GrammarExplainResult => isGrammarExplainResult(value),
  itemCount: 2,
  localMaxTokens: 900,
  context: 'The grammar explanation',
};

const grammarExamplesSpec: Spec<GrammarExamplesRequest, typeof grammarExamplesValidator, GrammarExamplesResult> = {
  feature: 'grammarExamples',
  promptVersion: GRAMMAR_EXAMPLES_PROMPT_VERSION,
  normalize: normalizeGrammarExamplesRequest,
  keyParts: grammarExamplesKeyParts,
  prompt: buildGrammarExamplesPrompt,
  schema: GRAMMAR_EXAMPLES_SCHEMA,
  validator: grammarExamplesValidator,
  finalize: finalizeGrammarExamplesResult,
  isCached: (value: unknown): value is GrammarExamplesResult => isGrammarExamplesResult(value),
  itemCount: 3,
  localMaxTokens: 800,
  context: 'The grammar example sentences',
};

const grammarProductionSpec: Spec<GrammarProductionRequest, typeof grammarProductionValidator, GrammarProductionResult> = {
  feature: 'grammarProduction',
  promptVersion: GRAMMAR_PRODUCTION_PROMPT_VERSION,
  normalize: normalizeGrammarProductionRequest,
  keyParts: grammarProductionKeyParts,
  prompt: buildGrammarProductionPrompt,
  schema: GRAMMAR_PRODUCTION_SCHEMA,
  validator: grammarProductionValidator,
  finalize: finalizeGrammarProductionResult,
  isCached: (value: unknown): value is GrammarProductionResult => isGrammarProductionResult(value),
  itemCount: 1,
  localMaxTokens: 600,
  context: 'The sentence check',
};

const grammarSightingSpec: Spec<GrammarSightingRequest, typeof grammarSightingValidator, GrammarSightingResult> = {
  feature: 'grammarSighting',
  promptVersion: GRAMMAR_SIGHTING_PROMPT_VERSION,
  normalize: normalizeGrammarSightingRequest,
  keyParts: grammarSightingKeyParts,
  prompt: buildGrammarSightingPrompt,
  schema: GRAMMAR_SIGHTING_SCHEMA,
  validator: grammarSightingValidator,
  finalize: finalizeGrammarSightingResult,
  isCached: (value: unknown, request: GrammarSightingRequest): value is GrammarSightingResult =>
    isGrammarSightingResult(value, request),
  itemCount: 2,
  localMaxTokens: 600,
  context: 'The sighting check',
};

const statsCoachSpec: Spec<StatsCoachRequest, typeof statsCoachValidator, StatsCoachResult> = {
  feature: 'statsCoach',
  promptVersion: STATS_COACH_PROMPT_VERSION,
  normalize: normalizeStatsCoachRequest,
  keyParts: statsCoachKeyParts,
  prompt: buildStatsCoachPrompt,
  schema: STATS_COACH_SCHEMA,
  validator: statsCoachValidator,
  finalize: (parsed) => finalizeStatsCoachResult(parsed),
  isCached: (value: unknown): value is StatsCoachResult => isStatsCoachResult(value),
  itemCount: 3,
  localMaxTokens: 900,
  context: 'The statistics explanation',
  cloudGate: (request) => studyDataCloudGate(request.shareStudyData),
};

const goalSuggestSpec: Spec<GoalSuggestRequest, typeof goalSuggestValidator, GoalSuggestResult> = {
  feature: 'goalSuggest',
  promptVersion: GOAL_SUGGEST_PROMPT_VERSION,
  normalize: normalizeGoalSuggestRequest,
  keyParts: goalSuggestKeyParts,
  prompt: buildGoalSuggestPrompt,
  schema: GOAL_SUGGEST_SCHEMA,
  validator: goalSuggestValidator,
  finalize: finalizeGoalSuggestResult,
  isCached: (value: unknown): value is GoalSuggestResult => isGoalSuggestResult(value),
  itemCount: 1,
  localMaxTokens: 400,
  context: 'The daily goal suggestion',
  cloudGate: (request) => studyDataCloudGate(request.shareStudyData),
};

const eventParseSpec: Spec<EventParseRequest, typeof eventParseValidator, EventDraft> = {
  feature: 'eventParse',
  promptVersion: EVENT_PARSE_PROMPT_VERSION,
  normalize: normalizeEventParseRequest,
  keyParts: eventParseKeyParts,
  prompt: buildEventParsePrompt,
  schema: EVENT_PARSE_SCHEMA,
  validator: eventParseValidator,
  finalize: finalizeEventDraft,
  isCached: (value: unknown): value is EventDraft => isEventDraft(value),
  itemCount: 1,
  localMaxTokens: 400,
  context: 'The event parse',
};

const placementQuizSpec: Spec<PlacementQuizRequest, typeof placementQuizValidator, PlacementQuizResult> = {
  feature: 'placementQuiz',
  promptVersion: PLACEMENT_QUIZ_PROMPT_VERSION,
  normalize: normalizePlacementQuizRequest,
  keyParts: placementQuizKeyParts,
  prompt: buildPlacementQuizPrompt,
  schema: PLACEMENT_QUIZ_SCHEMA,
  validator: placementQuizValidator,
  finalize: finalizePlacementQuizResult,
  isCached: (value: unknown): value is PlacementQuizResult => isPlacementQuizResult(value),
  itemCount: 8,
  localMaxTokens: 1800,
  context: 'The placement quiz',
};

const settingsHelpSpec: Spec<SettingsHelpRequest, typeof settingsHelpValidator, SettingsHelpResult> = {
  feature: 'settingsHelp',
  promptVersion: SETTINGS_HELP_PROMPT_VERSION,
  normalize: normalizeSettingsHelpRequest,
  keyParts: settingsHelpKeyParts,
  prompt: buildSettingsHelpPrompt,
  schema: SETTINGS_HELP_SCHEMA,
  validator: settingsHelpValidator,
  finalize: finalizeSettingsHelpResult,
  isCached: (value: unknown, request: SettingsHelpRequest): value is SettingsHelpResult =>
    isSettingsHelpResult(value) && value.matches.every((m) => request.candidates.some((c) => c.id === m.id)),
  itemCount: 1,
  localMaxTokens: 400,
  context: 'The settings answer',
};

const blancMistakeSpec: Spec<BlancMistakeRequest, typeof blancMistakeValidator, BlancMistakeResult> = {
  feature: 'blancMistake',
  promptVersion: BLANC_MISTAKE_PROMPT_VERSION,
  normalize: normalizeBlancMistakeRequest,
  keyParts: blancMistakeKeyParts,
  prompt: buildBlancMistakePrompt,
  schema: BLANC_MISTAKE_SCHEMA,
  validator: blancMistakeValidator,
  finalize: (parsed) => finalizeBlancMistakeResult(parsed),
  isCached: (value: unknown): value is BlancMistakeResult => isBlancMistakeResult(value),
  itemCount: 1,
  localMaxTokens: 500,
  context: 'The mistake explanation',
};

const blancSummarySpec: Spec<BlancSummaryRequest, typeof blancSummaryValidator, BlancSummaryResult> = {
  feature: 'blancSummary',
  promptVersion: BLANC_SUMMARY_PROMPT_VERSION,
  normalize: normalizeBlancSummaryRequest,
  keyParts: blancSummaryKeyParts,
  prompt: buildBlancSummaryPrompt,
  schema: BLANC_SUMMARY_SCHEMA,
  validator: blancSummaryValidator,
  finalize: (parsed) => finalizeBlancSummaryResult(parsed),
  isCached: (value: unknown): value is BlancSummaryResult => isBlancSummaryResult(value),
  itemCount: 1,
  localMaxTokens: 500,
  context: 'The summary',
};

// ---- the entry points --------------------------------------------------------------

export function explainGrammarPoint(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<GrammarExplainResult>> {
  return runAiStudyFeature(grammarExplainSpec, input, deps);
}

export function generateGrammarExamples(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<GrammarExamplesResult>> {
  return runAiStudyFeature(grammarExamplesSpec, input, deps);
}

export function gradeGrammarProduction(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<GrammarProductionResult>> {
  return runAiStudyFeature(grammarProductionSpec, input, deps);
}

export function checkGrammarSightings(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<GrammarSightingResult>> {
  return runAiStudyFeature(grammarSightingSpec, input, deps);
}

export function explainStudyStats(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<StatsCoachResult>> {
  return runAiStudyFeature(statsCoachSpec, input, deps);
}

export function suggestDailyGoal(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<GoalSuggestResult>> {
  return runAiStudyFeature(goalSuggestSpec, input, deps);
}

export function parseCalendarEventText(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<EventDraft>> {
  return runAiStudyFeature(eventParseSpec, input, deps);
}

export function makePlacementQuiz(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<PlacementQuizResult>> {
  return runAiStudyFeature(placementQuizSpec, input, deps);
}

export function answerSettingsWithModel(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<SettingsHelpResult>> {
  return runAiStudyFeature(settingsHelpSpec, input, deps);
}

export function explainBlancMistake(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<BlancMistakeResult>> {
  return runAiStudyFeature(blancMistakeSpec, input, deps);
}

export function summarizeForBlanc(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<BlancSummaryResult>> {
  return runAiStudyFeature(blancSummarySpec, input, deps);
}

/** Cancel is the study helpers' own `aiStudy:cancel`: one runner, one map of requests in flight. */
export function registerAiTutorAssistIpc(): void {
  ipcMain.handle('aiTutor:grammarExplain', (event, input: unknown) => explainGrammarPoint(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:grammarExamples', (event, input: unknown) => generateGrammarExamples(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:grammarProduction', (event, input: unknown) => gradeGrammarProduction(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:grammarSightings', (event, input: unknown) => checkGrammarSightings(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:statsCoach', (event, input: unknown) => explainStudyStats(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:goalSuggest', (event, input: unknown) => suggestDailyGoal(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:eventParse', (event, input: unknown) => parseCalendarEventText(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:placementQuiz', (event, input: unknown) => makePlacementQuiz(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:settingsHelp', (event, input: unknown) => answerSettingsWithModel(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:blancMistake', (event, input: unknown) => explainBlancMistake(input, aiStudyStreamDeps(event, input)));
  ipcMain.handle('aiTutor:blancSummary', (event, input: unknown) => summarizeForBlanc(input, aiStudyStreamDeps(event, input)));
}

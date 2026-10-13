/**
 * The optional AI helpers for speaking and writing, in main (docs/AI_AUDIT.md
 * N18, N19, N20):
 *
 * - `shadowingFeedback`   explain the likely pronunciation issues behind a shadowing score
 * - `conversationPartner` the partner's next line, and a correction of the learner's last one
 * - `writingCorrection`   edits (quote → replacement → reason) for a note or a selection
 * - `journalGrade`        word-by-word grade of a journal entry written with due words
 *
 * No runner of its own: every helper is a spec for `runAiStudyFeature`
 * (`aiStudyAssist.ts`) — the "Use AI features" switch, a normalized request, the
 * configured engine (the offline model needs no opt-in; a cloud provider needs
 * this feature's own opt-in and a key), the cache of validated answers, a call
 * cancellable through `aiStudy:cancel`, then zod for the shape and the feature's
 * own checks for the content.
 *
 * The conversation partner's known-word sample and its earlier-session words
 * are study data: on the cloud engine they are removed from the request unless
 * the learner allowed study data to leave the device
 * (`agentCloudStudyDataGate.ts`). Audio never reaches main.
 */
import { ipcMain } from 'electron';
import { z } from 'zod';
import { cloudMayReceiveStudyData } from '../shared/agentCloudStudyDataGate';
import type { AiStudyResponse } from '../shared/aiStudyCommon';
import {
  CONVERSATION_PROMPT_VERSION,
  CONVERSATION_SCHEMA,
  buildConversationPrompt,
  conversationKeyParts,
  finalizeConversationReply,
  isConversationReplyResult,
  normalizeConversationRequest,
  type ConversationReplyResult,
  type ConversationRequest,
} from '../shared/aiConversation';
import {
  SHADOWING_FEEDBACK_SCHEMA,
  SHADOWING_PROMPT_VERSION,
  buildShadowingFeedbackPrompt,
  finalizeShadowingFeedback,
  isShadowingFeedbackResult,
  normalizeShadowingFeedbackRequest,
  shadowingFeedbackKeyParts,
  type ShadowingFeedbackRequest,
  type ShadowingFeedbackResult,
} from '../shared/aiShadowing';
import {
  JOURNAL_GRADE_PROMPT_VERSION,
  JOURNAL_GRADE_SCHEMA,
  WRITING_CORRECTION_PROMPT_VERSION,
  WRITING_CORRECTION_SCHEMA,
  buildJournalGradePrompt,
  buildWritingCorrectionPrompt,
  finalizeJournalGrade,
  finalizeWritingCorrection,
  isJournalGradeResult,
  isWritingCorrectionResult,
  journalGradeKeyParts,
  normalizeJournalGradeRequest,
  normalizeWritingCorrectionRequest,
  writingCorrectionKeyParts,
  type JournalGradeRequest,
  type JournalGradeResult,
  type WritingCorrectionRequest,
  type WritingCorrectionResult,
} from '../shared/aiWritingCorrection';
import { getConfiguredAiEngine } from './mining';
import { runAiStudyFeature, type AiStudyDeps, type AiStudyFeatureSpec } from './aiStudyAssist';

// ---- the reply shapes ------------------------------------------------------------------

const shadowingValidator = z.object({
  summary: z.string().min(1),
  issues: z.array(z.object({
    focus: z.string().optional().default('other'),
    explanation: z.string().optional().default(''),
    tip: z.string().optional().default(''),
  })).optional().default([]),
});

const conversationValidator = z.object({
  reply: z.string().min(1),
  translation: z.string().optional().default(''),
  correction: z.object({
    corrected: z.string().optional().default(''),
    explanation: z.string().optional().default(''),
  }).nullable().optional().default(null),
});

const writingValidator = z.object({
  edits: z.array(z.object({
    original: z.string(),
    corrected: z.string(),
    explanation: z.string().optional().default(''),
    kind: z.string().optional().default('other'),
  })),
  overall: z.string().optional().default(''),
});

const journalValidator = z.object({
  words: z.array(z.object({
    word: z.string(),
    used: z.boolean().optional().default(false),
    correct: z.boolean().optional().default(false),
    note: z.string().optional().default(''),
  })),
  feedback: z.string().min(1),
});

// ---- the specs ---------------------------------------------------------------------------

type Spec<Req extends { requestId?: string; refresh?: boolean }, V extends z.ZodTypeAny, Res> =
  AiStudyFeatureSpec<Req, z.infer<V>, Res>;

const shadowingSpec: Spec<ShadowingFeedbackRequest, typeof shadowingValidator, ShadowingFeedbackResult> = {
  feature: 'shadowingFeedback',
  promptVersion: SHADOWING_PROMPT_VERSION,
  normalize: normalizeShadowingFeedbackRequest,
  keyParts: shadowingFeedbackKeyParts,
  prompt: buildShadowingFeedbackPrompt,
  schema: SHADOWING_FEEDBACK_SCHEMA,
  validator: shadowingValidator,
  finalize: (parsed) => finalizeShadowingFeedback(parsed),
  isCached: (value: unknown): value is ShadowingFeedbackResult => isShadowingFeedbackResult(value),
  itemCount: 2,
  localMaxTokens: 600,
  context: 'The shadowing feedback',
};

const conversationSpec: Spec<ConversationRequest, typeof conversationValidator, ConversationReplyResult> = {
  feature: 'conversationPartner',
  promptVersion: CONVERSATION_PROMPT_VERSION,
  normalize: normalizeConversationRequest,
  keyParts: conversationKeyParts,
  prompt: buildConversationPrompt,
  schema: CONVERSATION_SCHEMA,
  validator: conversationValidator,
  finalize: finalizeConversationReply,
  isCached: (value: unknown): value is ConversationReplyResult => isConversationReplyResult(value),
  itemCount: 1,
  localMaxTokens: 500,
  context: 'The conversation reply',
};

const writingSpec: Spec<WritingCorrectionRequest, typeof writingValidator, WritingCorrectionResult> = {
  feature: 'writingCorrection',
  promptVersion: WRITING_CORRECTION_PROMPT_VERSION,
  normalize: normalizeWritingCorrectionRequest,
  keyParts: writingCorrectionKeyParts,
  prompt: buildWritingCorrectionPrompt,
  schema: WRITING_CORRECTION_SCHEMA,
  validator: writingValidator,
  finalize: finalizeWritingCorrection,
  isCached: (value: unknown, request: WritingCorrectionRequest): value is WritingCorrectionResult =>
    isWritingCorrectionResult(value, request),
  itemCount: 4,
  localMaxTokens: 1_400,
  context: 'The writing correction',
};

const journalSpec: Spec<JournalGradeRequest, typeof journalValidator, JournalGradeResult> = {
  feature: 'journalGrade',
  promptVersion: JOURNAL_GRADE_PROMPT_VERSION,
  normalize: normalizeJournalGradeRequest,
  keyParts: journalGradeKeyParts,
  prompt: buildJournalGradePrompt,
  schema: JOURNAL_GRADE_SCHEMA,
  validator: journalValidator,
  finalize: finalizeJournalGrade,
  isCached: (value: unknown, request: JournalGradeRequest): value is JournalGradeResult => isJournalGradeResult(value, request),
  itemCount: 2,
  localMaxTokens: 800,
  context: 'The journal grade',
};

// ---- the entry points ----------------------------------------------------------------------

export function explainShadowing(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<ShadowingFeedbackResult>> {
  return runAiStudyFeature(shadowingSpec, input, deps);
}

/**
 * The known-word sample and the words recalled from earlier conversations
 * (both study data) stay on the device unless the engine is the offline
 * model or the learner allowed study data to go to the cloud. Stripped here,
 * before the runner sees the request, so the cache key and the prompt agree on
 * what was sent and the reply says whether a sample went with it.
 */
export function withholdKnownWordsForCloud(input: unknown, engine: 'cloud' | 'local-qwen'): unknown {
  if (engine === 'local-qwen' || !input || typeof input !== 'object') return input;
  const raw = input as Record<string, unknown>;
  if (cloudMayReceiveStudyData(raw.shareStudyData)) return input;
  return { ...raw, knownWords: [], recallWords: [] };
}

export function replyAsConversationPartner(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<ConversationReplyResult>> {
  const engine = (deps.engine ?? getConfiguredAiEngine)() === 'local-qwen' ? 'local-qwen' : 'cloud';
  return runAiStudyFeature(conversationSpec, withholdKnownWordsForCloud(input, engine), deps);
}

export function correctWriting(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<WritingCorrectionResult>> {
  return runAiStudyFeature(writingSpec, input, deps);
}

export function gradeJournalEntry(input: unknown, deps: AiStudyDeps = {}): Promise<AiStudyResponse<JournalGradeResult>> {
  return runAiStudyFeature(journalSpec, input, deps);
}

/** Cancel is the study helpers' own `aiStudy:cancel`: one runner, one map of requests in flight. */
export function registerAiSpeakAssistIpc(): void {
  ipcMain.handle('aiSpeak:shadowing', (_event, input: unknown) => explainShadowing(input));
  ipcMain.handle('aiSpeak:conversation', (_event, input: unknown) => replyAsConversationPartner(input));
  ipcMain.handle('aiSpeak:correct', (_event, input: unknown) => correctWriting(input));
  ipcMain.handle('aiSpeak:journal', (_event, input: unknown) => gradeJournalEntry(input));
}

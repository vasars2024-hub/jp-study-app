import type { MediaItem } from './types';
import type { SubtitleRecord } from './subtitleRecord';
import type { TranscriptionProgress } from './transcriptionIpc';
import type { IntervalEntry } from './anki';

export const STUDY_ORCHESTRATOR_VERSION = 2;
export const STUDY_ANALYZER_VERSION = 2;
export const PREPARED_UNWATCHED_DELAY_MS = 24 * 60 * 60 * 1000;
export const RECENT_ANKI_CONTEXT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const RECENT_ANKI_CONTEXT_MATCH_LIMIT = 8;

export type StudyReadinessCategory =
  | 'ready-now'
  | 'short-preview'
  | 'productive-challenge'
  | 'save-for-later'
  | 'incomplete';

export type StudyOpportunityType =
  | 'continue-session'
  | 'repeated-lookups'
  | 'prepared-unwatched'
  | 'recently-learned-context'
  | 'cross-title-reinforcement'
  | 'abandoned-set-resize'
  | 'scene-quick-session'
  | 'grammar-weakness-scenes'
  | 'listening-first-recipe'
  | 'proper-name-review'
  | 'speech-rate-challenge'
  | 'anki-leech-context'
  | 'series-recurrence-forecast'
  | 'stale-queue-cleanup'
  | 'easier-favorite-alternative'
  | 'queued-preparation'
  | 'favorite-preparation'
  | 'newly-unlocked'
  | 'subtitle-required'
  | 'export-pending';

export type StudyOpportunityStatus = 'active' | 'dismissed' | 'snoozed' | 'completed';
export type StudyPipelineStageStatus =
  | 'waiting'
  | 'queued'
  | 'active'
  | 'requires-input'
  | 'complete'
  | 'failed'
  | 'cancelled';

export type StudyPipelineStageId =
  | 'media'
  | 'subtitles'
  | 'analysis'
  | 'comparison'
  | 'filtering'
  | 'cards'
  | 'anki';

export interface StudyContextRef {
  mediaId: string;
  sourceKind?: 'media' | 'lookup-history';
  /** One-shot player setup requested by an explicit Study action. */
  listeningMode?: 'dictation';
  episode?: number;
  subtitleRecordId?: string;
  cueStartSec?: number;
  cueEndSec?: number;
  sentence?: string;
  sessionId?: string;
  returnTarget?: {
    section: 'video' | 'flashcards' | 'anki' | 'study';
    mediaId?: string;
    subtitleRecordId?: string;
    positionSec?: number;
  };
}

export interface StudyEvidence {
  code: string;
  label: string;
  /**
   * Optional i18n key and values for the same label. Written by the generator
   * because the label itself is persisted in English and the main process has no
   * access to the renderer's UI language; the renderer prefers the key and falls
   * back to `label`, so evidence stored before this existed still reads.
   */
  labelKey?: string;
  labelVars?: Record<string, string | number>;
  value?: string | number;
  confidence?: number;
}

/**
 * Delivery-speed statistics measured during the preparation pass that already
 * has the cues in hand. Deliberately raw counts rather than a rate, so a later
 * reader can derive whatever measure it needs without trusting a stored score.
 *
 * Optional: snapshots written before this existed simply have no stats, and the
 * analyzer version is *not* bumped for it — invalidating every existing analysis
 * would take the other Study recipes down with it.
 */
export interface StudySpeechStats {
  /** Summed cue durations: real speech time, not the gap-filled span. */
  spokenSec: number;
  /** Cues that contributed, after discarding non-positive durations. */
  cues: number;
  /** Japanese characters across those cues — the mora proxy for delivery speed. */
  characters: number;
}

export interface StudyReadinessSnapshot {
  id: string;
  mediaId: string;
  analyzerVersion: number;
  generatedAt: number;
  sourceFingerprint: string;
  knowledgeFingerprint: string;
  levelListsFingerprint: string;
  frequencyListsFingerprint?: string;
  subtitleRecordId?: string;
  subtitleSource?: string;
  subtitleReady: boolean;
  contentLevel: string | null;
  confidence: number;
  knownCoverage: number | null;
  uniqueKnownCoverage: number | null;
  totalWordOccurrences: number;
  knownWordOccurrences: number;
  unknownUniqueWords: number;
  recurringUnknownWords: number;
  category: StudyReadinessCategory;
  truncated: boolean;
  sourceKind?: 'media' | 'lookup-history';
  /** Present only on analyses prepared after delivery-speed capture landed. */
  speech?: StudySpeechStats;
}

export interface StudyOpportunity {
  id: string;
  type: StudyOpportunityType;
  title: string;
  explanation: string;
  /**
   * Optional i18n keys and values for `title` and `explanation`. Same reason as
   * `StudyEvidence.labelKey`: these strings are written by the main process and
   * persisted, so the renderer can only translate them if the generator says what
   * they mean. Additive and optional — a stored opportunity without them still
   * renders its English text, and no schema version is bumped for a label.
   */
  titleKey?: string;
  titleVars?: Record<string, string | number>;
  explanationKey?: string;
  explanationVars?: Record<string, string | number>;
  priority: number;
  estimatedMinutes: number;
  context: StudyContextRef;
  readinessId?: string;
  evidence: StudyEvidence[];
  actions: Array<
    | 'resume'
    | 'build-lookup-pack'
    | 'prepare'
    | 'load-subtitles'
    | 'inspect-vocabulary'
    | 'preview-cards'
    | 'preview-anki'
    | 'open-context'
    | 'compare-contexts'
    | 'preview-resize'
    | 'preview-scene-session'
    | 'preview-grammar-scenes'
    | 'start-listening-first'
    | 'preview-proper-names'
    | 'preview-speech-rate'
    | 'preview-anki-leech'
    | 'preview-series-recurrence'
    | 'preview-queue-cleanup'
  >;
  status: StudyOpportunityStatus;
  createdAt: number;
  updatedAt: number;
  dismissedAt?: number;
  snoozedUntil?: number;
}

export interface StudyVocabularyCandidate {
  id: string;
  word: string;
  surface: string;
  reading: string;
  meaning?: string;
  occurrences: number;
  sentence: string;
  timestamp: number;
  jlptLevel: string | null;
  /** Rank from the user's enabled frequency dictionaries; 1 is most common. */
  frequencyRank?: number;
  knowledgeLevel: 0 | 1 | 2 | 3;
  proper: boolean;
  internalDuplicate: boolean;
  ankiDuplicate: boolean;
  ankiIntervalDays?: number;
}

export type StudyVocabularyRankingMode = 'frequency-all' | 'frequency-unrated';

export interface StudyVocabularyFilters {
  excludedJlptLevels: string[];
  minimumOccurrences: number;
  excludeKnowledgeAtOrAbove: 0 | 1 | 2 | 3 | 4;
  excludeInternalDuplicates: boolean;
  excludeAnkiDuplicates: boolean;
  excludeAnkiMatureAtDays: number | null;
  excludeProperNouns: boolean;
  maximumCards: number | null;
  rankingMode: StudyVocabularyRankingMode;
}

export interface StudyCoveragePreview {
  before: number | null;
  after: number | null;
  selectedOccurrences: number;
  selectedUniqueWords: number;
}

export interface StudyFilterOperation {
  id: string;
  type: 'filter';
  createdAt: number;
  beforeFilters: StudyVocabularyFilters;
  afterFilters: StudyVocabularyFilters;
  beforeSelectionIds: string[];
  afterSelectionIds: string[];
  removedCount: number;
  remainingCount: number;
}

export interface StudyCardExportItem {
  candidateId: string;
  localCardId?: string;
  ankiNoteId?: number;
  status: 'pending' | 'created' | 'duplicate' | 'failed' | 'skipped';
  error?: string;
}

export interface StudyVocabularyWorkspace {
  id: string;
  context: StudyContextRef;
  readinessId: string;
  createdAt: number;
  updatedAt: number;
  candidates: StudyVocabularyCandidate[];
  filters: StudyVocabularyFilters;
  selectionIds: string[];
  history: StudyFilterOperation[];
  exports: StudyCardExportItem[];
}

export interface StudyPipelineStage {
  id: StudyPipelineStageId;
  status: StudyPipelineStageStatus;
  label: string;
  /**
   * English detail sentence. Kept because it is what already sits in every
   * persisted job document, and because the main process has no access to the
   * renderer's UI language.
   */
  detail?: string;
  /**
   * Optional i18n key and values for the same detail. The renderer prefers these
   * and falls back to `detail`, so a job written before this existed still shows
   * something truthful. Both are optional and no analyzer version is bumped:
   * invalidating every stored analysis over a label would take the other Study
   * features down with it.
   */
  detailKey?: string;
  detailVars?: Record<string, string | number>;
  progress?: number;
  error?: string;
  childJobId?: string;
  updatedAt: number;
}

export interface StudyPipelineJob {
  id: string;
  mediaId: string;
  workspaceId?: string;
  createdAt: number;
  updatedAt: number;
  stages: StudyPipelineStage[];
}

export interface StudyActionRecord {
  id: string;
  type:
    | 'filter-vocabulary'
    | 'undo-filter'
    | 'create-local-cards'
    | 'export-anki'
    | 'open-context';
  createdAt: number;
  context: StudyContextRef;
  affectedCount: number;
  status: 'previewed' | 'completed' | 'partial' | 'failed' | 'undone';
  createdCardIds?: string[];
  createdNoteIds?: number[];
  errors?: string[];
}

export interface StudyOrchestratorDocument {
  version: typeof STUDY_ORCHESTRATOR_VERSION;
  migratedLegacyAt?: number;
  readiness: Record<string, StudyReadinessSnapshot>;
  opportunities: Record<string, StudyOpportunity>;
  workspaces: Record<string, StudyVocabularyWorkspace>;
  jobs: Record<string, StudyPipelineJob>;
  actions: StudyActionRecord[];
}

export interface StudyOpportunitySignals {
  media: Pick<
    MediaItem,
    | 'id'
    | 'title'
    | 'fileName'
    | 'episode'
    | 'favorite'
    | 'studyQueue'
    | 'positionSec'
    | 'lastPlayedAt'
  >;
  /** A real Japanese track that is attached but may not have been analyzed yet. */
  subtitle?: {
    recordId: string;
    source: string;
  };
  readiness?: StudyReadinessSnapshot;
  activeWorkspace?: StudyVocabularyWorkspace;
  unfinishedSessionId?: string;
  previousReadinessCategory?: StudyReadinessCategory;
  recentAnkiMatches?: StudyRecentAnkiMatch[];
  now?: number;
}

export interface StudyRecentAnkiMatch {
  expression: string;
  intervalDays: number;
  intervalChangedAt: number;
  sentence: string;
  timestamp: number;
}

export interface StudyAnalysisRequest {
  media: Pick<
    MediaItem,
    | 'id'
    | 'title'
    | 'fileName'
    | 'episode'
    | 'favorite'
    | 'studyQueue'
    | 'positionSec'
    | 'lastPlayedAt'
  >;
  cues: Array<{ start: number; end: number; text: string }>;
  subtitle?: {
    recordId?: string;
    source?: string;
    fingerprint?: string;
  };
  knownWords: Record<string, 1 | 2 | 3>;
  levelBands: Array<{ label: string; words: string[] }>;
  /** Fingerprints enabled user frequency dictionaries for truthful cache invalidation. */
  frequencyListsFingerprint?: string;
  internalCards?: Array<{ id: string; word: string; reading?: string }>;
  ankiWords?: Record<string, { intervalDays: number; noteId?: number }>;
  previousReadinessCategory?: StudyReadinessCategory;
}

export interface StudyPreparationResult {
  readiness: StudyReadinessSnapshot;
  workspace: StudyVocabularyWorkspace;
  job: StudyPipelineJob;
  opportunities: StudyOpportunity[];
}

export interface StudyLookupPackRequest {
  candidates: StudyVocabularyCandidate[];
  sourceFingerprint: string;
}

export interface StudyLookupPackResult {
  readiness: StudyReadinessSnapshot;
  workspace: StudyVocabularyWorkspace;
}

export interface StudyTranscriptionQueueResult {
  ok: boolean;
  mediaId: string;
  job: StudyPipelineJob;
  error?: string;
}

export interface StudyCardPreviewItem {
  candidateId: string;
  word: string;
  reading: string;
  sentence: string;
  timestamp: number;
  internalDuplicate: boolean;
  ankiDuplicate: boolean;
  missingMeaning: boolean;
}

export interface StudyCardPreview {
  workspaceId: string;
  totalSelected: number;
  creatable: number;
  internalDuplicates: number;
  ankiDuplicates: number;
  missingMeanings: number;
  items: StudyCardPreviewItem[];
}

export interface StudyAnkiPreview {
  connected: boolean;
  profileId?: string;
  profileName?: string;
  deckName?: string;
  modelName?: string;
  matchedRuleLabel?: string;
  usedDefault?: boolean;
  selected: number;
  writable: number;
  duplicates: number;
  missingContent: number;
  error?: string;
  items: StudyCardPreviewItem[];
}

export interface StudyAnkiExportResult {
  workspaceId: string;
  /** Notes created by this attempt; previously completed items are not recounted. */
  completed: number;
  duplicates: number;
  failed: number;
  items: StudyCardExportItem[];
}

export interface StudyAnkiUndoResult {
  workspaceId: string;
  deleted: number;
  noteIds: number[];
  workspace: StudyVocabularyWorkspace;
  error?: string;
}

export const DEFAULT_STUDY_FILTERS: StudyVocabularyFilters = {
  excludedJlptLevels: [],
  minimumOccurrences: 1,
  excludeKnowledgeAtOrAbove: 2,
  excludeInternalDuplicates: true,
  excludeAnkiDuplicates: false,
  excludeAnkiMatureAtDays: null,
  excludeProperNouns: true,
  maximumCards: 30,
  rankingMode: 'frequency-unrated',
};

export const STUDY_PIPELINE_STAGES: ReadonlyArray<{
  id: StudyPipelineStageId;
  label: string;
}> = [
  { id: 'media', label: 'Media selected' },
  { id: 'subtitles', label: 'Subtitles ready' },
  { id: 'analysis', label: 'Language analyzed' },
  { id: 'comparison', label: 'Compared with your knowledge' },
  { id: 'filtering', label: 'Vocabulary refined' },
  { id: 'cards', label: 'Cards prepared' },
  { id: 'anki', label: 'Anki handoff' },
];

const clampRatio = (value: number): number => Math.max(0, Math.min(1, value));
const finiteCount = (value: number, fallback = 0): number => (
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback
);
const normalizedLevel = (value: string | null): string | null => {
  const level = value?.trim().toUpperCase() ?? '';
  return level || null;
};
const stableSlug = (value: string): string => (
  value.trim().toLocaleLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-').replace(/^-|-$/g, '')
);

export function createEmptyStudyOrchestratorDocument(): StudyOrchestratorDocument {
  return {
    version: STUDY_ORCHESTRATOR_VERSION,
    readiness: {},
    opportunities: {},
    workspaces: {},
    jobs: {},
    actions: [],
  };
}

export function readinessCategory(
  knownCoverage: number | null | undefined,
  confidence = 1,
): StudyReadinessCategory {
  if (
    typeof knownCoverage !== 'number'
    || !Number.isFinite(knownCoverage)
    || !Number.isFinite(confidence)
    || confidence < 0.25
  ) return 'incomplete';
  const coverage = clampRatio(knownCoverage);
  if (coverage >= 0.85) return 'ready-now';
  if (coverage >= 0.7) return 'short-preview';
  if (coverage >= 0.55) return 'productive-challenge';
  return 'save-for-later';
}

export function readinessLabel(category: StudyReadinessCategory): string {
  if (category === 'ready-now') return 'Ready now';
  if (category === 'short-preview') return 'Ready with a short preview';
  if (category === 'productive-challenge') return 'Productive challenge';
  if (category === 'save-for-later') return 'Better saved for later';
  return 'Analysis incomplete';
}

export function normalizeStudyFilters(
  input: Partial<StudyVocabularyFilters> | undefined,
): StudyVocabularyFilters {
  const threshold = finiteCount(input?.excludeKnowledgeAtOrAbove ?? 2, 2);
  const maximum = input?.maximumCards;
  const mature = input?.excludeAnkiMatureAtDays;
  return {
    excludedJlptLevels: [...new Set((input?.excludedJlptLevels ?? [])
      .map((level) => level.trim().toUpperCase())
      .filter(Boolean))],
    minimumOccurrences: Math.max(1, finiteCount(input?.minimumOccurrences ?? 1, 1)),
    excludeKnowledgeAtOrAbove: Math.min(4, threshold) as 0 | 1 | 2 | 3 | 4,
    excludeInternalDuplicates: input?.excludeInternalDuplicates !== false,
    excludeAnkiDuplicates: input?.excludeAnkiDuplicates === true,
    excludeAnkiMatureAtDays: typeof mature === 'number' && Number.isFinite(mature)
      ? Math.max(0, Math.floor(mature))
      : null,
    excludeProperNouns: input?.excludeProperNouns !== false,
    maximumCards: typeof maximum === 'number' && Number.isFinite(maximum)
      ? Math.max(0, Math.floor(maximum))
      : null,
    rankingMode: input?.rankingMode === 'frequency-all'
      ? 'frequency-all'
      : 'frequency-unrated',
  };
}

function compareFrequencyRank(
  a: StudyVocabularyCandidate,
  b: StudyVocabularyCandidate,
): number {
  const aRank = typeof a.frequencyRank === 'number' && Number.isFinite(a.frequencyRank)
    ? a.frequencyRank
    : Number.POSITIVE_INFINITY;
  const bRank = typeof b.frequencyRank === 'number' && Number.isFinite(b.frequencyRank)
    ? b.frequencyRank
    : Number.POSITIVE_INFINITY;
  const rankDifference = aRank === bRank ? 0 : aRank - bRank;
  return rankDifference
    || b.occurrences - a.occurrences
    || a.timestamp - b.timestamp
    || a.word.localeCompare(b.word, 'ja');
}

/**
 * Apply the user's enabled frequency dictionaries either to the complete list,
 * or only to the slots whose words have no configured JLPT level.
 */
export function rankStudyVocabulary(
  candidates: readonly StudyVocabularyCandidate[],
  mode: StudyVocabularyRankingMode,
): StudyVocabularyCandidate[] {
  if (mode === 'frequency-all') return [...candidates].sort(compareFrequencyRank);
  const unrated = candidates
    .filter((candidate) => !normalizedLevel(candidate.jlptLevel))
    .sort(compareFrequencyRank);
  let unratedIndex = 0;
  return candidates.map((candidate) =>
    normalizedLevel(candidate.jlptLevel) ? candidate : unrated[unratedIndex++] ?? candidate);
}

export function selectStudyVocabulary(
  candidates: readonly StudyVocabularyCandidate[],
  input?: Partial<StudyVocabularyFilters>,
): StudyVocabularyCandidate[] {
  const filters = normalizeStudyFilters(input);
  const excludedLevels = new Set(filters.excludedJlptLevels);
  const selected = candidates.filter((candidate) => {
    if (excludedLevels.has(normalizedLevel(candidate.jlptLevel) ?? '')) return false;
    if (candidate.occurrences < filters.minimumOccurrences) return false;
    if (
      filters.excludeKnowledgeAtOrAbove <= 3
      && candidate.knowledgeLevel >= filters.excludeKnowledgeAtOrAbove
    ) return false;
    if (filters.excludeInternalDuplicates && candidate.internalDuplicate) return false;
    if (filters.excludeAnkiDuplicates && candidate.ankiDuplicate) return false;
    if (
      filters.excludeAnkiMatureAtDays != null
      && (candidate.ankiIntervalDays ?? -1) >= filters.excludeAnkiMatureAtDays
    ) return false;
    if (filters.excludeProperNouns && candidate.proper) return false;
    return true;
  });
  const ranked = rankStudyVocabulary(selected, filters.rankingMode);
  return filters.maximumCards == null ? ranked : ranked.slice(0, filters.maximumCards);
}

export function createStudyWorkspace(
  id: string,
  context: StudyContextRef,
  readiness: StudyReadinessSnapshot,
  candidates: readonly StudyVocabularyCandidate[],
  now = Date.now(),
): StudyVocabularyWorkspace {
  const filters = normalizeStudyFilters(DEFAULT_STUDY_FILTERS);
  const selectionIds = selectStudyVocabulary(candidates, filters).map((candidate) => candidate.id);
  return {
    id,
    context,
    readinessId: readiness.id,
    createdAt: now,
    updatedAt: now,
    candidates: [...candidates],
    filters,
    selectionIds,
    history: [],
    exports: [],
  };
}

export function createStudyLookupPack(
  request: StudyLookupPackRequest,
  existing: StudyVocabularyWorkspace | undefined,
  now = Date.now(),
): StudyLookupPackResult {
  const mediaId = 'study-lookup-history';
  const readiness: StudyReadinessSnapshot = {
    id: `study-readiness-repeated-lookups-${request.sourceFingerprint}`,
    mediaId,
    sourceKind: 'lookup-history',
    analyzerVersion: STUDY_ANALYZER_VERSION,
    generatedAt: now,
    sourceFingerprint: request.sourceFingerprint,
    knowledgeFingerprint: request.sourceFingerprint,
    levelListsFingerprint: 'dictionary-results',
    frequencyListsFingerprint: 'dictionary-results',
    subtitleReady: false,
    contentLevel: null,
    confidence: 1,
    knownCoverage: null,
    uniqueKnownCoverage: null,
    totalWordOccurrences: request.candidates.reduce(
      (sum, candidate) => sum + candidate.occurrences,
      0,
    ),
    knownWordOccurrences: 0,
    unknownUniqueWords: request.candidates.length,
    recurringUnknownWords: request.candidates.length,
    category: 'incomplete',
    truncated: false,
  };
  const base = createStudyWorkspace(
    'study-workspace-repeated-lookups',
    {
      mediaId,
      sourceKind: 'lookup-history',
      returnTarget: { section: 'study' },
    },
    readiness,
    request.candidates,
    now,
  );
  const filters = normalizeStudyFilters({
    ...(existing?.filters ?? base.filters),
    excludeAnkiDuplicates: true,
    excludeProperNouns: false,
  });
  const candidateIds = new Set(request.candidates.map((candidate) => candidate.id));
  const workspace: StudyVocabularyWorkspace = {
    ...base,
    createdAt: existing?.createdAt ?? now,
    filters,
    selectionIds: selectStudyVocabulary(request.candidates, filters)
      .map((candidate) => candidate.id),
    history: [],
    exports: (existing?.exports ?? []).filter((entry) => candidateIds.has(entry.candidateId)),
  };
  return { readiness, workspace };
}

export function applyStudyVocabularyFilters(
  workspace: StudyVocabularyWorkspace,
  patch: Partial<StudyVocabularyFilters>,
  now = Date.now(),
): { workspace: StudyVocabularyWorkspace; operation: StudyFilterOperation } {
  const filters = normalizeStudyFilters({ ...workspace.filters, ...patch });
  const selectionIds = selectStudyVocabulary(workspace.candidates, filters)
    .map((candidate) => candidate.id);
  const nextSelection = new Set(selectionIds);
  const operation: StudyFilterOperation = {
    id: `study-filter-${now.toString(36)}-${workspace.history.length + 1}`,
    type: 'filter',
    createdAt: now,
    beforeFilters: normalizeStudyFilters(workspace.filters),
    afterFilters: filters,
    beforeSelectionIds: [...workspace.selectionIds],
    afterSelectionIds: selectionIds,
    removedCount: workspace.selectionIds.filter((id) => !nextSelection.has(id)).length,
    remainingCount: selectionIds.length,
  };
  return {
    workspace: {
      ...workspace,
      updatedAt: now,
      filters,
      selectionIds,
      history: [...workspace.history, operation].slice(-30),
    },
    operation,
  };
}

export function undoStudyVocabularyFilter(
  workspace: StudyVocabularyWorkspace,
  now = Date.now(),
): { workspace: StudyVocabularyWorkspace; operation: StudyFilterOperation | null } {
  const operation = workspace.history[workspace.history.length - 1] ?? null;
  if (!operation) return { workspace, operation: null };
  return {
    operation,
    workspace: {
      ...workspace,
      updatedAt: now,
      filters: normalizeStudyFilters(operation.beforeFilters),
      selectionIds: [...operation.beforeSelectionIds],
      history: workspace.history.slice(0, -1),
    },
  };
}

export function studyCoveragePreview(
  readiness: StudyReadinessSnapshot,
  workspace: StudyVocabularyWorkspace,
): StudyCoveragePreview {
  const selected = new Set(workspace.selectionIds);
  const selectedCandidates = workspace.candidates.filter((candidate) => selected.has(candidate.id));
  const selectedOccurrences = selectedCandidates.reduce(
    (total, candidate) => total + finiteCount(candidate.occurrences),
    0,
  );
  const after = readiness.knownCoverage == null || readiness.totalWordOccurrences <= 0
    ? null
    : clampRatio(
      (readiness.knownWordOccurrences + selectedOccurrences) / readiness.totalWordOccurrences,
    );
  return {
    before: readiness.knownCoverage,
    after,
    selectedOccurrences,
    selectedUniqueWords: selectedCandidates.length,
  };
}

export function studyVocabularyPage(
  workspace: StudyVocabularyWorkspace,
  offset = 0,
  limit = 100,
): { items: StudyVocabularyCandidate[]; total: number; selected: number } {
  const start = finiteCount(offset);
  const size = Math.max(1, Math.min(250, finiteCount(limit, 100)));
  const selectedIds = new Set(workspace.selectionIds);
  const ranked = workspace.candidates
    .map((candidate) => ({ candidate, selected: selectedIds.has(candidate.id) }))
    .sort((a, b) => Number(b.selected) - Number(a.selected)
      || b.candidate.occurrences - a.candidate.occurrences
      || a.candidate.word.localeCompare(b.candidate.word, 'ja'));
  return {
    items: ranked.slice(start, start + size).map(({ candidate }) => candidate),
    total: ranked.length,
    selected: workspace.selectionIds.length,
  };
}

export function normalizedStudyDuplicateKey(word: string, reading = ''): string {
  return `${word.normalize('NFKC').trim().toLocaleLowerCase()}\u0000${reading
    .normalize('NFKC').trim().toLocaleLowerCase()}`;
}

export function studyContextSeekPosition(context: StudyContextRef): number {
  if (context.cueStartSec != null) return context.cueStartSec;
  return context.returnTarget?.positionSec ?? 0;
}

export function selectJapaneseStudySubtitle(
  records: readonly SubtitleRecord[] | undefined,
): SubtitleRecord | undefined {
  return records?.find((record) => /^ja(?:-|$)/i.test(record.lang.trim()));
}

export function createStudyPipelineJob(
  id: string,
  mediaId: string,
  options: { subtitleReady?: boolean; workspaceId?: string } = {},
  now = Date.now(),
): StudyPipelineJob {
  return {
    id,
    mediaId,
    workspaceId: options.workspaceId,
    createdAt: now,
    updatedAt: now,
    stages: STUDY_PIPELINE_STAGES.map((stage, index) => ({
      ...stage,
      status: index === 0
        ? 'complete'
        : stage.id === 'subtitles' && !options.subtitleReady
          ? 'requires-input'
          : 'waiting',
      updatedAt: now,
    })),
  };
}

export function updateStudyPipelineStage(
  job: StudyPipelineJob,
  stageId: StudyPipelineStageId,
  patch: Partial<Omit<StudyPipelineStage, 'id' | 'label'>>,
  now = Date.now(),
): StudyPipelineJob {
  return {
    ...job,
    updatedAt: now,
    stages: job.stages.map((stage) => stage.id === stageId ? {
      ...stage,
      ...patch,
      progress: patch.progress == null ? stage.progress : clampRatio(patch.progress),
      updatedAt: now,
    } : stage),
  };
}

export function createStudyTranscriptionJob(
  mediaId: string,
  now = Date.now(),
): StudyPipelineJob {
  return updateStudyPipelineStage(
    createStudyPipelineJob(
      `study-transcription-${mediaId}`,
      mediaId,
      { subtitleReady: false },
      now,
    ),
    'subtitles',
    {
      status: 'queued',
      progress: 0,
      detail: 'Queued for Japanese transcription',
      detailKey: 'study.stageDetail.transcriptionQueued',
      childJobId: `transcription:${mediaId}`,
      error: undefined,
    },
    now,
  );
}

export function applyStudyTranscriptionProgress(
  job: StudyPipelineJob,
  progress: TranscriptionProgress,
  now = Date.now(),
): StudyPipelineJob {
  if (job.mediaId !== progress.mediaId) return job;

  const ratio = progress.phase === 'done'
    ? 1
    : progress.total > 0
      ? progress.done / progress.total
      : 0;
  const details: Record<TranscriptionProgress['phase'], string> = {
    queued: 'Queued for Japanese transcription',
    preparing: 'Preparing media for transcription',
    'extracting-audio': 'Extracting audio outside the renderer',
    transcribing: progress.total > 0
      ? `Transcribing audio segment ${Math.min(progress.done + 1, progress.total)} of ${progress.total}`
      : 'Transcribing Japanese audio',
    aligning: 'Building and saving the generated subtitle track',
    done: 'Generated subtitle track saved to the media library',
    cancelled: 'Transcription was cancelled',
    error: 'Transcription needs attention',
  };
  // Same phases, as i18n keys the renderer can resolve in the user's language.
  const detailKeys: Record<TranscriptionProgress['phase'], string> = {
    queued: 'study.stageDetail.transcriptionQueued',
    preparing: 'study.stageDetail.transcriptionPreparing',
    'extracting-audio': 'study.stageDetail.transcriptionExtracting',
    transcribing: progress.total > 0
      ? 'study.stageDetail.transcriptionSegment'
      : 'study.stageDetail.transcriptionAudio',
    aligning: 'study.stageDetail.transcriptionAligning',
    done: 'study.stageDetail.transcriptionSaved',
    cancelled: 'study.stageDetail.transcriptionCancelled',
    error: 'study.stageDetail.transcriptionAttention',
  };
  const statuses: Record<
    TranscriptionProgress['phase'],
    StudyPipelineStageStatus
  > = {
    queued: 'queued',
    preparing: 'active',
    'extracting-audio': 'active',
    transcribing: 'active',
    aligning: 'active',
    done: 'complete',
    cancelled: 'cancelled',
    error: 'failed',
  };

  return updateStudyPipelineStage(job, 'subtitles', {
    status: statuses[progress.phase],
    progress: ratio,
    detail: details[progress.phase],
    detailKey: detailKeys[progress.phase],
    ...(progress.phase === 'transcribing' && progress.total > 0
      ? {
        detailVars: {
          done: Math.min(progress.done + 1, progress.total),
          total: progress.total,
        },
      }
      : { detailVars: undefined }),
    childJobId: `transcription:${progress.mediaId}`,
    error: progress.phase === 'error' ? progress.error || 'Transcription failed.' : undefined,
  }, now);
}

function mediaTitle(media: StudyOpportunitySignals['media']): string {
  return media.title.trim() || media.fileName.trim() || 'Untitled media';
}

function opportunity(
  input: Omit<StudyOpportunity, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
  now: number,
): StudyOpportunity {
  return {
    ...input,
    id: `study-opportunity-${input.type}-${stableSlug(input.context.mediaId)}`,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function indexRecentAnkiIntervalEntries(
  entries: readonly IntervalEntry[],
  now = Date.now(),
): ReadonlyMap<string, IntervalEntry> {
  const recentByExpression = new Map<string, IntervalEntry>();
  for (const entry of entries) {
    const expression = entry.expression.normalize('NFKC').trim();
    const changedAt = entry.lastIntervalChangeAt;
    if (
      !expression
      || entry.ivlDays < 1
      || typeof changedAt !== 'number'
      || changedAt > now
      || now - changedAt > RECENT_ANKI_CONTEXT_WINDOW_MS
    ) continue;
    const previous = recentByExpression.get(expression);
    if (
      !previous
      || (previous.lastIntervalChangeAt ?? 0) < changedAt
      || ((previous.lastIntervalChangeAt ?? 0) === changedAt && previous.ivlDays < entry.ivlDays)
    ) {
      recentByExpression.set(expression, entry);
    }
  }
  return recentByExpression;
}

export function recentAnkiMatchesForWorkspace(
  workspace: StudyVocabularyWorkspace | undefined,
  recentByExpression: ReadonlyMap<string, IntervalEntry>,
): StudyRecentAnkiMatch[] {
  if (!workspace || workspace.context.sourceKind === 'lookup-history') return [];
  return workspace.candidates.flatMap((candidate) => {
    const word = candidate.word.normalize('NFKC').trim();
    const surface = candidate.surface.normalize('NFKC').trim();
    const entry = recentByExpression.get(word) ?? recentByExpression.get(surface);
    if (!entry || typeof entry.lastIntervalChangeAt !== 'number') return [];
    return [{
      expression: entry.expression,
      intervalDays: entry.ivlDays,
      intervalChangedAt: entry.lastIntervalChangeAt,
      sentence: candidate.sentence,
      timestamp: candidate.timestamp,
    }];
  }).sort((a, b) =>
    b.intervalChangedAt - a.intervalChangedAt
    || b.intervalDays - a.intervalDays
    || a.timestamp - b.timestamp
    || a.expression.localeCompare(b.expression, 'ja'))
    .slice(0, RECENT_ANKI_CONTEXT_MATCH_LIMIT);
}

export function generateRepeatedLookupOpportunity(input: {
  wordCount: number;
  totalLookups: number;
  sourceFingerprint: string;
  workspaceFingerprint?: string;
  now?: number;
}): StudyOpportunity | null {
  const wordCount = finiteCount(input.wordCount);
  if (!wordCount) return null;
  const now = input.now ?? Date.now();
  const workspaceReady = input.workspaceFingerprint === input.sourceFingerprint;
  return opportunity({
    type: 'repeated-lookups',
    title: workspaceReady
      ? 'Review your repeated lookup pack'
      : 'Turn repeated lookups into a study pack',
    explanation: workspaceReady
      ? 'The words you keep checking are gathered in a reusable vocabulary workspace.'
      : 'These words were looked up more than once and are not yet known or mined.',
    priority: 98,
    estimatedMinutes: 5,
    context: {
      mediaId: 'study-lookup-history',
      sourceKind: 'lookup-history',
      returnTarget: { section: 'study' },
    },
    evidence: [
      {
        code: 'repeated-lookup-words',
        label: `${wordCount} repeated ${wordCount === 1 ? 'word' : 'words'}`,
        value: wordCount,
      },
      {
        code: 'repeated-lookup-actions',
        label: `${finiteCount(input.totalLookups)} lookups in the last 30 days`,
        value: finiteCount(input.totalLookups),
      },
      { code: 'lookup-pack-local', label: 'Derived locally from bounded lookup history' },
    ],
    actions: workspaceReady
      ? ['inspect-vocabulary', 'preview-cards']
      : ['build-lookup-pack', 'inspect-vocabulary'],
  }, now);
}

export function generateStudyOpportunities(signals: StudyOpportunitySignals): StudyOpportunity[] {
  const now = signals.now ?? Date.now();
  const title = mediaTitle(signals.media);
  const context: StudyContextRef = {
    mediaId: signals.media.id,
    episode: signals.media.episode,
    returnTarget: {
      section: 'video',
      mediaId: signals.media.id,
      positionSec: signals.media.positionSec ?? 0,
    },
  };
  const output: StudyOpportunity[] = [];
  const readiness = signals.readiness;

  if (signals.unfinishedSessionId) {
    output.push(opportunity({
      type: 'continue-session',
      title: `Continue ${title}`,
      titleKey: 'study.opportunity.continueSession.title',
      titleVars: { title },
      explanation: 'Your media, filters, selected vocabulary, and playback position are ready to restore.',
      explanationKey: 'study.opportunity.continueSession.explanation',
      priority: 100,
      estimatedMinutes: 1,
      context: { ...context, sessionId: signals.unfinishedSessionId },
      evidence: [{
        code: 'unfinished-session',
        label: 'Unfinished Study session',
        labelKey: 'study.opportunity.continueSession.evidence',
      }],
      actions: ['resume', 'open-context'],
    }, now));
  }

  const recentMatches = (signals.recentAnkiMatches ?? []).filter((match) =>
    match.intervalDays >= 1
    && match.intervalChangedAt <= now
    && now - match.intervalChangedAt <= RECENT_ANKI_CONTEXT_WINDOW_MS);
  const recentMatch = recentMatches[0];
  if (recentMatch) {
    output.push(opportunity({
      type: 'recently-learned-context',
      title: `See ${recentMatch.expression} in ${title}`,
      explanation: 'A recently strengthened Anki card appears in this title’s prepared subtitles.',
      priority: 87,
      estimatedMinutes: 3,
      context: {
        ...context,
        subtitleRecordId: readiness?.subtitleRecordId ?? signals.activeWorkspace?.context.subtitleRecordId,
        cueStartSec: recentMatch.timestamp,
        sentence: recentMatch.sentence,
        returnTarget: {
          section: 'video',
          mediaId: signals.media.id,
          subtitleRecordId: readiness?.subtitleRecordId
            ?? signals.activeWorkspace?.context.subtitleRecordId,
          positionSec: recentMatch.timestamp,
        },
      },
      readinessId: readiness?.id,
      evidence: [
        {
          code: 'recent-anki-interval',
          label: `${recentMatch.expression} · ${recentMatch.intervalDays}-day interval`,
          value: recentMatch.intervalDays,
        },
        {
          code: 'prepared-subtitle-match',
          label: 'Found in prepared Japanese subtitles',
        },
        {
          code: 'recent-context-matches',
          label: `${recentMatches.length} recent ${recentMatches.length === 1 ? 'match' : 'matches'}`,
          value: recentMatches.length,
        },
      ],
      actions: ['open-context', 'inspect-vocabulary'],
    }, now));
  }

  const preparedAt = readiness?.generatedAt;
  const playedAfterPreparation = typeof signals.media.lastPlayedAt === 'number'
    && typeof preparedAt === 'number'
    && signals.media.lastPlayedAt > preparedAt;
  if (
    !signals.unfinishedSessionId
    && readiness?.subtitleReady
    && signals.activeWorkspace?.readinessId === readiness.id
    && signals.activeWorkspace.candidates.length > 0
    && typeof preparedAt === 'number'
    && now - preparedAt >= PREPARED_UNWATCHED_DELAY_MS
    && !playedAfterPreparation
  ) {
    output.push(opportunity({
      type: 'prepared-unwatched',
      title: `Watch your prepared ${title}`,
      titleKey: 'study.opportunity.preparedUnwatched.title',
      titleVars: { title },
      explanation: 'Your vocabulary preview is ready, and this title has not been played since it was prepared.',
      explanationKey: 'study.opportunity.preparedUnwatched.explanation',
      priority: 89,
      estimatedMinutes: 5,
      context: {
        ...context,
        subtitleRecordId: readiness.subtitleRecordId,
      },
      readinessId: readiness.id,
      evidence: [
        {
          code: 'prepared-workspace',
          label: `${signals.activeWorkspace.selectionIds.length} selected words ready`,
          labelKey: 'study.opportunity.preparedUnwatched.evidenceWords',
          labelVars: { count: signals.activeWorkspace.selectionIds.length },
          value: signals.activeWorkspace.selectionIds.length,
        },
        {
          code: 'no-playback-after-preparation',
          label: 'No playback since preparation',
          labelKey: 'study.opportunity.preparedUnwatched.evidenceNoPlayback',
        },
      ],
      actions: ['open-context', 'inspect-vocabulary'],
    }, now));
  }

  if (
    (signals.media.studyQueue || signals.media.favorite)
    && (!readiness || !readiness.subtitleReady)
    && !signals.subtitle
  ) {
    output.push(opportunity({
      type: 'subtitle-required',
      title: `Prepare subtitles for ${title}`,
      titleKey: 'study.opportunity.subtitleRequired.title',
      titleVars: { title },
      explanation: 'Japanese text is required before the app can calculate a trustworthy readiness score.',
      explanationKey: 'study.opportunity.subtitleRequired.explanation',
      priority: signals.media.studyQueue ? 90 : 64,
      estimatedMinutes: 5,
      context,
      evidence: [{
        code: 'subtitle-missing',
        label: 'No analyzed Japanese subtitle track',
        labelKey: 'study.opportunity.subtitleRequired.evidence',
      }],
      actions: ['load-subtitles', 'prepare'],
    }, now));
  }

  if (signals.media.studyQueue && signals.subtitle && !readiness) {
    output.push(opportunity({
      type: 'queued-preparation',
      title: `Analyze ${title}`,
      explanation: 'Japanese subtitles are attached. Analyze them now to calculate readiness and build a focused vocabulary workspace.',
      priority: 91,
      estimatedMinutes: 5,
      context: { ...context, subtitleRecordId: signals.subtitle.recordId },
      evidence: [
        { code: 'subtitle-ready', label: signals.subtitle.source },
        { code: 'analysis-pending', label: 'Readiness analysis has not run yet' },
      ],
      actions: ['prepare'],
    }, now));
  }

  if (readiness?.subtitleReady) {
    const coverage = readiness.knownCoverage;
    const coverageLabel = coverage == null ? null : `${Math.round(coverage * 100)}% known coverage`;
    const evidence: StudyEvidence[] = [
      { code: 'readiness', label: readinessLabel(readiness.category) },
      {
        code: 'recurring-unknowns',
        label: `${readiness.recurringUnknownWords} recurring unknown words`,
        value: readiness.recurringUnknownWords,
      },
      { code: 'subtitle-source', label: readiness.subtitleSource ?? 'Japanese subtitles available' },
    ];
    if (coverageLabel && coverage != null) {
      evidence.splice(1, 0, { code: 'known-coverage', label: coverageLabel, value: coverage });
    }

    if (signals.media.studyQueue) {
      output.push(opportunity({
        type: 'queued-preparation',
        title: readiness.category === 'ready-now' ? `${title} is ready` : `Prepare ${title}`,
        explanation: readiness.category === 'ready-now'
          ? 'This queued title is within your current known-vocabulary range.'
          : `This queued title is a ${readinessLabel(readiness.category).toLocaleLowerCase()}; a focused preview can reduce the gap.`,
        priority: readiness.category === 'ready-now' ? 88 : 92,
        estimatedMinutes: readiness.category === 'ready-now' ? 5 : 20,
        context: { ...context, subtitleRecordId: readiness.subtitleRecordId },
        readinessId: readiness.id,
        evidence,
        actions: readiness.category === 'ready-now'
          ? ['open-context', 'inspect-vocabulary']
          : ['prepare', 'inspect-vocabulary', 'preview-cards'],
      }, now));
    } else if (
      signals.media.favorite
      && (readiness.category === 'short-preview' || readiness.category === 'productive-challenge')
    ) {
      output.push(opportunity({
        type: 'favorite-preparation',
        title: `${title} is within reach`,
        explanation: 'You favorited this title, and its current difficulty can be bridged with focused preparation.',
        priority: 72,
        estimatedMinutes: 20,
        context: { ...context, subtitleRecordId: readiness.subtitleRecordId },
        readinessId: readiness.id,
        evidence,
        actions: ['prepare', 'inspect-vocabulary'],
      }, now));
    }

    if (
      readiness.category === 'ready-now'
      && signals.previousReadinessCategory
      && signals.previousReadinessCategory !== 'ready-now'
      && signals.previousReadinessCategory !== 'incomplete'
    ) {
      output.push(opportunity({
        type: 'newly-unlocked',
        title: `${title} may be ready now`,
        explanation: 'Your vocabulary profile changed enough to move this title into the ready range.',
        priority: 95,
        estimatedMinutes: 5,
        context: { ...context, subtitleRecordId: readiness.subtitleRecordId },
        readinessId: readiness.id,
        evidence,
        actions: ['open-context', 'inspect-vocabulary'],
      }, now));
    }
  }

  if (signals.activeWorkspace?.exports.some((entry) => entry.status === 'pending' || entry.status === 'failed')) {
    output.push(opportunity({
      type: 'export-pending',
      title: `Finish cards for ${title}`,
      explanation: 'A prepared vocabulary set has cards that are still pending or can be retried.',
      priority: 86,
      estimatedMinutes: 5,
      context: signals.activeWorkspace.context,
      readinessId: signals.activeWorkspace.readinessId,
      evidence: [{
        code: 'pending-export',
        label: `${signals.activeWorkspace.exports.filter((entry) => entry.status === 'pending' || entry.status === 'failed').length} cards need attention`,
      }],
      actions: ['preview-cards', 'preview-anki'],
    }, now));
  }

  return output.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export function opportunityIsVisible(opportunity: StudyOpportunity, now = Date.now()): boolean {
  if (opportunity.status === 'dismissed' || opportunity.status === 'completed') return false;
  if (opportunity.status === 'snoozed') return (opportunity.snoozedUntil ?? 0) <= now;
  return true;
}

/**
 * Upsert renderer-derived opportunities into the authoritative Study document.
 *
 * Queue and favorite signals live in the shared media library, while dismissal
 * and snooze state lives in the main-process Study document. Generated
 * timestamps are deliberately ignored when nothing material changed so a
 * renderer refresh cannot wake a dismissed recommendation or create a
 * persistence/event loop.
 */
export function syncStudyOpportunities(
  existing: Readonly<Record<string, StudyOpportunity>>,
  candidates: readonly StudyOpportunity[],
  now = Date.now(),
  options: { retireMissingActive?: boolean } = {},
): { opportunities: Record<string, StudyOpportunity>; changed: boolean } {
  const opportunities = { ...existing };
  let changed = false;
  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const rendererSignalTypes = new Set<StudyOpportunityType>([
    'repeated-lookups',
    'prepared-unwatched',
    'recently-learned-context',
    'cross-title-reinforcement',
    'abandoned-set-resize',
    'scene-quick-session',
    'listening-first-recipe',
    'proper-name-review',
    'speech-rate-challenge',
    'anki-leech-context',
    'series-recurrence-forecast',
    'stale-queue-cleanup',
    'easier-favorite-alternative',
    'queued-preparation',
    'favorite-preparation',
    'newly-unlocked',
    'subtitle-required',
    'export-pending',
  ]);

  if (options.retireMissingActive) {
    for (const previous of Object.values(opportunities)) {
      if (
        previous.status === 'active'
        && rendererSignalTypes.has(previous.type)
        && !candidateIds.has(previous.id)
      ) {
        delete opportunities[previous.id];
        changed = true;
      }
    }
  }

  for (const candidate of candidates) {
    if (!candidate?.id?.trim() || !candidate.context?.mediaId?.trim()) continue;
    const previous = opportunities[candidate.id];
    if (!previous) {
      opportunities[candidate.id] = candidate;
      changed = true;
      continue;
    }

    const merged: StudyOpportunity = {
      ...candidate,
      status: previous.status,
      createdAt: previous.createdAt,
      updatedAt: previous.updatedAt,
      dismissedAt: previous.dismissedAt,
      snoozedUntil: previous.snoozedUntil,
    };
    if (JSON.stringify(merged) === JSON.stringify(previous)) continue;
    opportunities[candidate.id] = { ...merged, updatedAt: now };
    changed = true;
  }

  return { opportunities, changed };
}

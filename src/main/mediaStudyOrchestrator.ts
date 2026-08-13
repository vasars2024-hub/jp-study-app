import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyStudyTranscriptionProgress,
  applyStudyVocabularyFilters,
  createStudyLookupPack,
  createStudyTranscriptionJob,
  createEmptyStudyOrchestratorDocument,
  generateStudyOpportunities,
  normalizeStudyFilters,
  opportunityIsVisible,
  readinessCategory,
  selectStudyVocabulary,
  STUDY_ANALYZER_VERSION,
  syncStudyOpportunities,
  studyVocabularyPage,
  undoStudyVocabularyFilter,
  updateStudyPipelineStage,
  type StudyAnalysisRequest,
  type StudyActionRecord,
  type StudyAnkiExportResult,
  type StudyAnkiPreview,
  type StudyAnkiUndoResult,
  type StudyCardExportItem,
  type StudyOpportunity,
  type StudyOpportunityStatus,
  type StudyOrchestratorDocument,
  type StudyLookupPackRequest,
  type StudyLookupPackResult,
  type StudyPreparationResult,
  type StudyReadinessSnapshot,
  type StudyTranscriptionQueueResult,
  type StudyVocabularyFilters,
  type StudyVocabularyWorkspace,
} from '../shared/mediaStudyOrchestrator';
import { prepareStudyAnalysis, studyAnalysisFingerprints } from '../shared/mediaStudyAnalysis';
import {
  normalizeMediaStudyDatabase,
  type MediaStudyDatabase,
} from '../shared/mediaStudyDatabase';
import { getMainJapaneseTokenizer } from './japaneseTokenizer';
import { deleteMinedNotes, mineNote, previewAnkiExpressions } from './anki';
import { resolveCustomFrequencyRanks } from './mining';
import { enqueueTranscription, onMainTranscriptionProgress } from './transcriptionJobs';
import type { TranscriptionProgress } from '../shared/transcriptionIpc';

const FILE_NAME = 'study-orchestrator-v2.json';
const CHANGE_CHANNEL = 'study:changed';
const MAX_ACTIONS = 500;
let memory: StudyOrchestratorDocument | null = null;
let transcriptionProgressLinked = false;

function storePath(): string {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function recordMap<T extends { id: string }>(value: unknown): Record<string, T> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const output: Record<string, T> = {};
  for (const entry of Object.values(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const candidate = entry as T;
    if (typeof candidate.id === 'string' && candidate.id.trim()) output[candidate.id] = candidate;
  }
  return output;
}

export function normalizeStudyOrchestratorDocument(value: unknown): StudyOrchestratorDocument {
  if (!value || typeof value !== 'object') return createEmptyStudyOrchestratorDocument();
  const raw = value as Partial<StudyOrchestratorDocument>;
  const storedWorkspaces = recordMap<StudyVocabularyWorkspace>(raw.workspaces);
  const workspaces = Object.fromEntries(Object.entries(storedWorkspaces).map(([id, workspace]) => [
    id,
    { ...workspace, filters: normalizeStudyFilters(workspace.filters) },
  ]));
  return {
    version: 2,
    ...(typeof raw.migratedLegacyAt === 'number' ? { migratedLegacyAt: raw.migratedLegacyAt } : {}),
    readiness: recordMap<StudyReadinessSnapshot>(raw.readiness),
    opportunities: recordMap<StudyOpportunity>(raw.opportunities),
    workspaces,
    jobs: recordMap(raw.jobs),
    actions: Array.isArray(raw.actions) ? raw.actions.slice(-MAX_ACTIONS) : [],
  };
}

export function readStudyOrchestratorDocument(): StudyOrchestratorDocument {
  if (memory) return memory;
  try {
    memory = normalizeStudyOrchestratorDocument(
      JSON.parse(fs.readFileSync(storePath(), 'utf-8')),
    );
  } catch {
    memory = createEmptyStudyOrchestratorDocument();
  }
  return memory;
}

function persist(document: StudyOrchestratorDocument): StudyOrchestratorDocument {
  memory = normalizeStudyOrchestratorDocument(document);
  const file = storePath();
  const temporary = `${file}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(temporary, JSON.stringify(memory, null, 2), 'utf-8');
  fs.renameSync(temporary, file);
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(CHANGE_CHANNEL, memory);
  }
  return memory;
}

function persistStudyTranscriptionProgress(progress: TranscriptionProgress): void {
  const document = readStudyOrchestratorDocument();
  const entry = Object.values(document.jobs).find((job) =>
    job.mediaId === progress.mediaId
    && job.stages.some((stage) =>
      stage.id === 'subtitles'
      && stage.childJobId === `transcription:${progress.mediaId}`));
  if (!entry) return;
  persist({
    ...document,
    jobs: {
      ...document.jobs,
      [entry.id]: applyStudyTranscriptionProgress(entry, progress),
    },
  });
}

function queueStudyTranscription(mediaId: string): StudyTranscriptionQueueResult {
  if (!mediaId?.trim()) throw new Error('A media ID is required for transcription.');
  const document = readStudyOrchestratorDocument();
  const job = createStudyTranscriptionJob(mediaId);
  persist({
    ...document,
    jobs: { ...document.jobs, [job.id]: job },
  });

  const result = enqueueTranscription({ mediaId, lang: 'ja' });
  if (result.ok) {
    return {
      ok: true,
      mediaId,
      job: readStudyOrchestratorDocument().jobs[job.id] ?? job,
    };
  }

  const failed = applyStudyTranscriptionProgress(job, {
    mediaId,
    title: mediaId,
    phase: 'error',
    done: 0,
    total: 0,
    startedAt: Date.now(),
    error: result.error || 'Unable to queue transcription.',
  });
  const failedDocument = readStudyOrchestratorDocument();
  persist({
    ...failedDocument,
    jobs: { ...failedDocument.jobs, [job.id]: failed },
  });
  return {
    ok: false,
    mediaId,
    job: failed,
    error: result.error || 'Unable to queue transcription.',
  };
}

function tokenizeFallback(text: string) {
  return [...text]
    .filter((value) => /[\u3040-\u30ff\u3400-\u9fff々]/.test(value))
    .map((value) => ({
      surface: value,
      lemma: value,
      reading: '',
      content: true,
      proper: false,
    }));
}

async function prepare(request: StudyAnalysisRequest): Promise<StudyPreparationResult> {
  const current = readStudyOrchestratorDocument();
  const fingerprints = studyAnalysisFingerprints(request);
  const cachedReadiness = Object.values(current.readiness).find((entry) =>
    entry.mediaId === request.media.id
    && entry.analyzerVersion === STUDY_ANALYZER_VERSION
    && entry.sourceFingerprint === fingerprints.sourceFingerprint
    && entry.knowledgeFingerprint === fingerprints.knowledgeFingerprint
    && entry.levelListsFingerprint === fingerprints.levelListsFingerprint
    && entry.frequencyListsFingerprint === fingerprints.frequencyListsFingerprint);
  const cachedWorkspace = cachedReadiness && Object.values(current.workspaces).find(
    (entry) => entry.readinessId === cachedReadiness.id,
  );
  const cachedJob = cachedWorkspace && Object.values(current.jobs).find(
    (entry) => entry.workspaceId === cachedWorkspace.id,
  );
  if (cachedReadiness && cachedWorkspace && cachedJob) {
    return {
      readiness: cachedReadiness,
      workspace: cachedWorkspace,
      job: cachedJob,
      opportunities: Object.values(current.opportunities).filter(
        (entry) => entry.context.mediaId === request.media.id,
      ),
    };
  }
  const tokenizer = await getMainJapaneseTokenizer();
  const result = prepareStudyAnalysis(request, (text) => {
    if (!tokenizer) return tokenizeFallback(text);
    return tokenizer.tokenize(text).map((token) => {
      const surface = token.surface_form?.trim() ?? '';
      const lemma = token.basic_form && token.basic_form !== '*' ? token.basic_form.trim() : surface;
      return {
        surface,
        lemma,
        reading: token.reading && token.reading !== '*' ? token.reading : '',
        content: ['名詞', '動詞', '形容詞', '副詞'].includes(token.pos)
          && !(token.pos === '名詞'
            && ['数', '非自立', '接尾', '代名詞', '特殊'].includes(token.pos_detail_1)),
        proper: token.pos === '名詞' && token.pos_detail_1 === '固有名詞',
      };
    });
  }, Date.now(), (word, reading) =>
    // These tokens come out of the Japanese morphological analyser above (the
    // 名詞/動詞 filter), so the language is not in doubt here.
    resolveCustomFrequencyRanks(word, reading, 'ja').primary);
  const previousWorkspace = current.workspaces[result.workspace.id];
  if (previousWorkspace) {
    const filters = normalizeStudyFilters(previousWorkspace.filters);
    const candidateIds = new Set(result.workspace.candidates.map((candidate) => candidate.id));
    result.workspace = {
      ...result.workspace,
      createdAt: previousWorkspace.createdAt,
      filters,
      selectionIds: selectStudyVocabulary(result.workspace.candidates, filters)
        .map((candidate) => candidate.id),
      history: previousWorkspace.history,
      exports: previousWorkspace.exports.filter((entry) => candidateIds.has(entry.candidateId)),
    };
  }
  const opportunities = { ...current.opportunities };
  for (const candidate of result.opportunities) {
    const previous = opportunities[candidate.id];
    opportunities[candidate.id] = previous?.status === 'dismissed' || previous?.status === 'snoozed'
      ? { ...candidate, status: previous.status, dismissedAt: previous.dismissedAt, snoozedUntil: previous.snoozedUntil }
      : candidate;
  }
  persist({
    ...current,
    readiness: { ...current.readiness, [result.readiness.id]: result.readiness },
    workspaces: { ...current.workspaces, [result.workspace.id]: result.workspace },
    jobs: { ...current.jobs, [result.job.id]: result.job },
    opportunities,
  });
  return result;
}

function prepareLookupPack(request: StudyLookupPackRequest): StudyLookupPackResult {
  if (!request || !Array.isArray(request.candidates)) {
    throw new Error('Repeated lookup candidates are required.');
  }
  const sourceFingerprint = typeof request.sourceFingerprint === 'string'
    ? request.sourceFingerprint.trim().slice(0, 120)
    : '';
  if (!sourceFingerprint) throw new Error('Repeated lookup evidence is missing.');
  const candidates = request.candidates.slice(0, 40).flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const word = typeof candidate.word === 'string' ? candidate.word.trim().slice(0, 80) : '';
    const id = typeof candidate.id === 'string' ? candidate.id.trim().slice(0, 160) : '';
    if (!word || !id) return [];
    const knowledge = Number.isFinite(candidate.knowledgeLevel)
      ? Math.max(0, Math.min(3, Math.floor(candidate.knowledgeLevel)))
      : 0;
    return [{
      id,
      word,
      surface: typeof candidate.surface === 'string'
        ? candidate.surface.trim().slice(0, 80)
        : word,
      reading: typeof candidate.reading === 'string'
        ? candidate.reading.trim().slice(0, 80)
        : '',
      ...(typeof candidate.meaning === 'string' && candidate.meaning.trim()
        ? { meaning: candidate.meaning.trim().slice(0, 500) }
        : {}),
      occurrences: Number.isFinite(candidate.occurrences)
        ? Math.max(2, Math.min(8, Math.floor(candidate.occurrences)))
        : 2,
      sentence: typeof candidate.sentence === 'string'
        ? candidate.sentence.trim().slice(0, 500)
        : '',
      timestamp: 0,
      jlptLevel: typeof candidate.jlptLevel === 'string'
        ? candidate.jlptLevel.trim().toUpperCase().slice(0, 16) || null
        : null,
      ...(() => {
        const rank = resolveCustomFrequencyRanks(word, typeof candidate.reading === 'string'
          ? candidate.reading
          : '', 'ja').primary;
        return typeof rank === 'number' && Number.isFinite(rank)
          ? { frequencyRank: Math.max(1, Math.round(rank)) }
          : {};
      })(),
      knowledgeLevel: knowledge as 0 | 1 | 2 | 3,
      proper: candidate.proper === true,
      internalDuplicate: candidate.internalDuplicate === true,
      ankiDuplicate: candidate.ankiDuplicate === true,
      ...(typeof candidate.ankiIntervalDays === 'number'
        && Number.isFinite(candidate.ankiIntervalDays)
        ? { ankiIntervalDays: Math.max(0, Math.floor(candidate.ankiIntervalDays)) }
        : {}),
    }];
  });
  if (!candidates.length) throw new Error('No valid repeated lookup candidates remain.');
  const document = readStudyOrchestratorDocument();
  const result = createStudyLookupPack(
    { candidates, sourceFingerprint },
    document.workspaces['study-workspace-repeated-lookups'],
  );
  persist({
    ...document,
    readiness: { ...document.readiness, [result.readiness.id]: result.readiness },
    workspaces: { ...document.workspaces, [result.workspace.id]: result.workspace },
  });
  return result;
}

function migrateLegacy(value: unknown, now = Date.now()): StudyOrchestratorDocument {
  const current = readStudyOrchestratorDocument();
  if (current.migratedLegacyAt) return current;
  const legacy: MediaStudyDatabase = normalizeMediaStudyDatabase(value);
  const readiness = { ...current.readiness };
  const opportunities = { ...current.opportunities };
  for (const profile of Object.values(legacy.profiles)) {
    const snapshot: StudyReadinessSnapshot = {
      id: `legacy-readiness-${profile.mediaId}`,
      mediaId: profile.mediaId,
      analyzerVersion: 0,
      generatedAt: profile.updatedAt,
      sourceFingerprint: `legacy-${profile.updatedAt}`,
      knowledgeFingerprint: 'legacy',
      levelListsFingerprint: 'legacy',
      subtitleReady: profile.sentences.total > 0,
      contentLevel: profile.difficulty.jlptLevel,
      confidence: profile.difficulty.confidence,
      knownCoverage: profile.difficulty.knownRatio,
      uniqueKnownCoverage: null,
      totalWordOccurrences: profile.vocabulary.totalOccurrences,
      knownWordOccurrences: Math.round(
        profile.vocabulary.totalOccurrences * profile.difficulty.knownRatio,
      ),
      unknownUniqueWords: profile.vocabulary.unknownWordsEstimate,
      recurringUnknownWords: profile.vocabulary.top.filter((item) => item.occurrences >= 3).length,
      category: readinessCategory(profile.difficulty.knownRatio, profile.difficulty.confidence),
      truncated: profile.truncated,
    };
    readiness[snapshot.id] = snapshot;
  }
  for (const session of legacy.sessions.filter((entry) => entry.endedAt == null)) {
    const [candidate] = generateStudyOpportunities({
      media: {
        id: session.mediaId,
        title: session.title,
        fileName: session.title,
        positionSec: session.endPositionSec,
      },
      unfinishedSessionId: session.id,
      now,
    });
    if (candidate) opportunities[candidate.id] = candidate;
  }
  return persist({ ...current, migratedLegacyAt: now, readiness, opportunities });
}

function appendAction(
  document: StudyOrchestratorDocument,
  action: StudyActionRecord,
): StudyActionRecord[] {
  return [...document.actions, action].slice(-MAX_ACTIONS);
}

async function previewAnki(workspaceId: string): Promise<StudyAnkiPreview> {
  const workspace = readStudyOrchestratorDocument().workspaces[workspaceId];
  if (!workspace) throw new Error('The Study workspace no longer exists.');
  const selected = new Set(workspace.selectionIds);
  const candidates = workspace.candidates.filter((candidate) => selected.has(candidate.id));
  const preview = await previewAnkiExpressions(
    candidates.map((candidate) => candidate.word),
    { route: { source: 'subtitle', cardKind: 'word', language: 'ja' } },
  );
  const duplicateWords = new Set(Object.keys(preview.duplicates));
  const items = candidates.map((candidate) => ({
    candidateId: candidate.id,
    word: candidate.word,
    reading: candidate.reading,
    sentence: candidate.sentence,
    timestamp: candidate.timestamp,
    internalDuplicate: candidate.internalDuplicate,
    ankiDuplicate: duplicateWords.has(candidate.word),
    missingMeaning: !candidate.meaning?.trim(),
  }));
  return {
    connected: preview.connected,
    profileId: preview.profileId,
    profileName: preview.profileName,
    deckName: preview.deckName,
    modelName: preview.modelName,
    matchedRuleLabel: preview.matchedRuleLabel,
    usedDefault: preview.usedDefault,
    selected: items.length,
    writable: items.filter((item) => !item.ankiDuplicate && item.word.trim()).length,
    duplicates: items.filter((item) => item.ankiDuplicate).length,
    missingContent: items.filter((item) => !item.word.trim()).length,
    error: preview.error,
    items,
  };
}

async function exportAnki(workspaceId: string): Promise<StudyAnkiExportResult> {
  const document = readStudyOrchestratorDocument();
  const workspace = document.workspaces[workspaceId];
  if (!workspace) throw new Error('The Study workspace no longer exists.');
  const preview = await previewAnki(workspaceId);
  const previous = new Map(workspace.exports.map((entry) => [entry.candidateId, entry]));
  const results: StudyCardExportItem[] = [];
  const newlyCreatedIds: number[] = [];
  let attemptedCount = 0;
  for (const item of preview.items) {
    const prior = previous.get(item.candidateId);
    if (prior?.status === 'created') {
      results.push(prior);
      continue;
    }
    attemptedCount += 1;
    if (item.ankiDuplicate) {
      results.push({ candidateId: item.candidateId, status: 'duplicate' });
      continue;
    }
    const outcome = await mineNote({
      term: item.word,
      reading: item.reading,
      sentence: item.sentence,
      route: { source: 'subtitle', cardKind: 'word', language: 'ja' },
      extraTags: ['jp-study-app::study-mode'],
    });
    if (outcome.ok && typeof outcome.noteId === 'number') {
      newlyCreatedIds.push(outcome.noteId);
    }
    results.push(outcome.ok
      ? { candidateId: item.candidateId, status: 'created', ankiNoteId: outcome.noteId }
      : {
        candidateId: item.candidateId,
        status: outcome.error === 'duplicate' ? 'duplicate' : 'failed',
        error: outcome.error,
      });
  }
  const next = {
    ...workspace,
    updatedAt: Date.now(),
    exports: results,
  };
  const jobEntry = Object.values(document.jobs).find((job) => job.workspaceId === workspaceId);
  const jobs = jobEntry ? {
    ...document.jobs,
    [jobEntry.id]: updateStudyPipelineStage(jobEntry, 'anki', {
      status: results.some((entry) => entry.status === 'failed') ? 'failed' : 'complete',
      progress: 1,
      detail: `${results.filter((entry) => entry.status === 'created').length} cards exported`,
      detailKey: 'study.stageDetail.cardsExported',
      detailVars: { count: results.filter((entry) => entry.status === 'created').length },
      error: results.find((entry) => entry.status === 'failed')?.error,
    }),
  } : document.jobs;
  persist({
    ...document,
    workspaces: { ...document.workspaces, [workspaceId]: next },
    jobs,
    actions: appendAction(document, {
      id: `study-action-export-${Date.now().toString(36)}`,
      type: 'export-anki',
      createdAt: Date.now(),
      context: workspace.context,
      affectedCount: attemptedCount,
      status: results.some((entry) => entry.status === 'failed') ? 'partial' : 'completed',
      createdNoteIds: newlyCreatedIds,
      errors: results.flatMap((entry) => entry.error ? [entry.error] : []),
    }),
  });
  return {
    workspaceId,
    completed: newlyCreatedIds.length,
    duplicates: results.filter((entry) => entry.status === 'duplicate').length,
    failed: results.filter((entry) => entry.status === 'failed').length,
    items: results,
  };
}

async function undoAnkiExport(workspaceId: string): Promise<StudyAnkiUndoResult> {
  const document = readStudyOrchestratorDocument();
  const workspace = document.workspaces[workspaceId];
  if (!workspace) throw new Error('The Study workspace no longer exists.');
  const noteIds = Array.from(new Set(workspace.exports.flatMap((entry) =>
    entry.status === 'created' && typeof entry.ankiNoteId === 'number'
      ? [entry.ankiNoteId]
      : [])));
  if (!noteIds.length) {
    return { workspaceId, deleted: 0, noteIds: [], workspace };
  }
  const deletion = await deleteMinedNotes(noteIds);
  if (!deletion.ok) {
    return {
      workspaceId,
      deleted: 0,
      noteIds: [],
      workspace,
      error: deletion.error ?? 'Could not undo the Anki export.',
    };
  }

  const deleted = new Set(noteIds);
  const next: StudyVocabularyWorkspace = {
    ...workspace,
    updatedAt: Date.now(),
    exports: workspace.exports.filter((entry) =>
      typeof entry.ankiNoteId !== 'number' || !deleted.has(entry.ankiNoteId)),
  };
  const jobEntry = Object.values(document.jobs).find((job) => job.workspaceId === workspaceId);
  const jobs = jobEntry ? {
    ...document.jobs,
    [jobEntry.id]: updateStudyPipelineStage(jobEntry, 'anki', {
      status: 'waiting',
      progress: 0,
      detail: 'Anki export undone',
      detailKey: 'study.stageDetail.ankiUndone',
      detailVars: undefined,
      error: undefined,
    }),
  } : document.jobs;
  const actions = document.actions.map((action) =>
    action.type === 'export-anki'
    && action.status !== 'undone'
    && action.createdNoteIds?.some((noteId) => deleted.has(noteId))
      ? { ...action, status: 'undone' as const }
      : action);
  persist({
    ...document,
    workspaces: { ...document.workspaces, [workspaceId]: next },
    jobs,
    actions,
  });
  return { workspaceId, deleted: noteIds.length, noteIds, workspace: next };
}

export function registerMediaStudyOrchestratorIpc(): void {
  if (!transcriptionProgressLinked) {
    onMainTranscriptionProgress(persistStudyTranscriptionProgress);
    transcriptionProgressLinked = true;
  }
  ipcMain.handle('study:get', () => readStudyOrchestratorDocument());
  ipcMain.handle('study:migrateLegacy', (_event, value: unknown) => migrateLegacy(value));
  ipcMain.handle('study:prepare', (_event, request: StudyAnalysisRequest) => prepare(request));
  ipcMain.handle('study:createLookupPack', (_event, request: StudyLookupPackRequest) =>
    prepareLookupPack(request));
  ipcMain.handle('study:queueTranscription', (_event, mediaId: string) =>
    queueStudyTranscription(mediaId));
  ipcMain.handle('study:workspacePage', (_event, workspaceId: string, offset?: number, limit?: number) => {
    const workspace = readStudyOrchestratorDocument().workspaces[workspaceId];
    if (!workspace) throw new Error('The Study workspace no longer exists.');
    return studyVocabularyPage(workspace, offset, limit);
  });
  ipcMain.handle('study:applyFilters', (
    _event,
    workspaceId: string,
    filters: Partial<StudyVocabularyFilters>,
  ) => {
    const document = readStudyOrchestratorDocument();
    const workspace = document.workspaces[workspaceId];
    if (!workspace) throw new Error('The Study workspace no longer exists.');
    const result = applyStudyVocabularyFilters(workspace, filters);
    persist({
      ...document,
      workspaces: { ...document.workspaces, [workspaceId]: result.workspace },
      actions: appendAction(document, {
        id: `study-action-filter-${Date.now().toString(36)}`,
        type: 'filter-vocabulary',
        createdAt: Date.now(),
        context: workspace.context,
        affectedCount: result.operation.removedCount,
        status: 'completed',
      }),
    });
    return result.workspace;
  });
  ipcMain.handle('study:undoFilter', (_event, workspaceId: string) => {
    const document = readStudyOrchestratorDocument();
    const workspace = document.workspaces[workspaceId];
    if (!workspace) throw new Error('The Study workspace no longer exists.');
    const result = undoStudyVocabularyFilter(workspace);
    persist({
      ...document,
      workspaces: { ...document.workspaces, [workspaceId]: result.workspace },
      actions: appendAction(document, {
        id: `study-action-undo-${Date.now().toString(36)}`,
        type: 'undo-filter',
        createdAt: Date.now(),
        context: workspace.context,
        affectedCount: Math.abs(
          result.workspace.selectionIds.length - workspace.selectionIds.length,
        ),
        status: 'completed',
      }),
    });
    return result.workspace;
  });
  ipcMain.handle('study:updateWorkspace', (_event, workspace: StudyVocabularyWorkspace) => {
    if (!workspace?.id) throw new Error('A valid Study workspace is required.');
    const document = readStudyOrchestratorDocument();
    const previous = document.workspaces[workspace.id];
    if (!previous) throw new Error('The Study workspace no longer exists.');
    const priorLocalIds = new Set(previous.exports.flatMap((entry) =>
      entry.localCardId ? [entry.localCardId] : []));
    const nextLocalIds = workspace.exports.flatMap((entry) =>
      entry.localCardId && !priorLocalIds.has(entry.localCardId) ? [entry.localCardId] : []);
    const removedLocalCount = previous.exports.filter((entry) =>
      entry.localCardId
      && !workspace.exports.some((candidate) => candidate.localCardId === entry.localCardId)).length;
    const actions = nextLocalIds.length
      ? appendAction(document, {
        id: `study-action-local-${Date.now().toString(36)}`,
        type: 'create-local-cards',
        createdAt: Date.now(),
        context: workspace.context,
        affectedCount: nextLocalIds.length,
        status: 'completed',
        createdCardIds: nextLocalIds,
      })
      : removedLocalCount
        ? appendAction(document, {
          id: `study-action-local-undo-${Date.now().toString(36)}`,
          type: 'create-local-cards',
          createdAt: Date.now(),
          context: workspace.context,
          affectedCount: removedLocalCount,
          status: 'undone',
        })
        : document.actions;
    persist({
      ...document,
      workspaces: { ...document.workspaces, [workspace.id]: workspace },
      actions,
    });
    return workspace;
  });
  ipcMain.handle('study:setOpportunityStatus', (
    _event,
    opportunityId: string,
    status: StudyOpportunityStatus,
    snoozedUntil?: number,
  ) => {
    const document = readStudyOrchestratorDocument();
    const existing = document.opportunities[opportunityId];
    if (!existing) throw new Error('The Study opportunity no longer exists.');
    const now = Date.now();
    return persist({
      ...document,
      opportunities: {
        ...document.opportunities,
        [opportunityId]: {
           ...existing,
           status,
           updatedAt: now,
           dismissedAt: status === 'dismissed' ? now : undefined,
           snoozedUntil: status === 'snoozed' && typeof snoozedUntil === 'number'
             ? snoozedUntil
             : undefined,
         },
      },
    });
  });
  ipcMain.handle('study:listOpportunities', () => Object.values(
    readStudyOrchestratorDocument().opportunities,
  ).filter((candidate) => opportunityIsVisible(candidate)));
  ipcMain.handle(
    'study:syncOpportunities',
    (_event, candidates: StudyOpportunity[], retireMissingActive = false) => {
      if (!Array.isArray(candidates)) throw new Error('Study opportunities must be an array.');
      const document = readStudyOrchestratorDocument();
      const result = syncStudyOpportunities(
        document.opportunities,
        candidates.slice(0, 200),
        Date.now(),
        { retireMissingActive },
      );
      if (!result.changed) return document;
      return persist({ ...document, opportunities: result.opportunities });
    },
  );
  ipcMain.handle('study:previewAnki', (_event, workspaceId: string) => previewAnki(workspaceId));
  ipcMain.handle('study:exportAnki', (_event, workspaceId: string) => exportAnki(workspaceId));
  ipcMain.handle('study:undoAnkiExport', (_event, workspaceId: string) =>
    undoAnkiExport(workspaceId));
}

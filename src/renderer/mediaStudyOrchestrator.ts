import { examSlotsForLang } from '../shared/bookLevelEstimate';
import {
  generateRepeatedLookupOpportunity,
  generateStudyOpportunities,
  normalizedStudyDuplicateKey,
  recentAnkiMatchesForWorkspace,
  selectJapaneseStudySubtitle,
  studyCoveragePreview,
  type StudyAnalysisRequest,
  type StudyCardPreview,
  type StudyOpportunity,
  type StudyOrchestratorDocument,
  type StudyPreparationResult,
  type StudyVocabularyCandidate,
  type StudyVocabularyWorkspace,
} from '../shared/mediaStudyOrchestrator';
import type { IntervalEntry } from '../shared/anki';
import type { MediaStudySession } from '../shared/mediaStudyDatabase';
import { studyFingerprint } from '../shared/mediaStudyAnalysis';
import type { StudyReadinessFingerprints } from '../shared/studyEpisodeReadiness';
import {
  abandonedSetResizeOpportunity,
  studyAbandonedSetResizes,
} from '../shared/studyAbandonedSetResize';
import {
  crossTitleReinforcementOpportunity,
  studyCrossTitleReinforcements,
} from '../shared/studyCrossTitleReinforcement';
import {
  sceneQuickSessionOpportunity,
  studySceneQuickSessions,
} from '../shared/studySceneQuickSession';
import {
  staleQueueCleanupOpportunity,
  studyStaleQueueCleanup,
  type StudyStaleQueueCleanup,
} from '../shared/studyStaleQueueCleanup';
import {
  studyFavoriteAlternatives,
  type StudyFavoriteAlternative,
} from '../shared/studyFavoriteAlternative';
import {
  studyGrammarWeaknessScenes,
  type StudyGrammarFailureSession,
  type StudyGrammarWeaknessScene,
} from '../shared/studyGrammarWeaknessScenes';
import {
  studyListeningFirstRecipe,
  type StudyListeningAvailability,
  type StudyListeningFirstRecipe,
} from '../shared/studyListeningFirstRecipe';
import {
  studyProperNameReviews,
  type StudyProperNameReview,
} from '../shared/studyProperNameReview';
import {
  studySpeechRateChallenges,
  type StudySpeechRateChallenge,
} from '../shared/studySpeechRate';
import {
  studyAnkiLeechReviews,
  type StudyAnkiLeechReview,
} from '../shared/studyAnkiLeech';
import {
  studySeriesRecurrenceForecasts,
  type StudySeriesRecurrenceForecast,
} from '../shared/studySeriesRecurrenceForecast';
import type { SubtitleRecord } from '../shared/subtitleRecord';
import type { MediaItem } from '../shared/types';
import { GRAMMAR } from './data/grammar';
import { t } from './i18n';
import { loadDeck, addDeckCardsTracked, removeDeckCards } from './flashcardDeck';
import { getSlotList } from './levelLists';
import { getLevel, listKnownEntries } from './knownWords';
import {
  loadLookupHistory,
  recentLookupCount,
  repeatedLookupEntries,
  type LookupHistoryEntry,
} from './lookupHistory';
import { loadSaved } from './savedWords';
import { loadMediaStudyDatabase } from './mediaStudyStore';
import type { Cue } from './subtitles';
import { parseSubtitles } from './subtitles';

let initialized: Promise<StudyOrchestratorDocument> | null = null;

export function initializeStudyOrchestrator(): Promise<StudyOrchestratorDocument> {
  if (!initialized) {
    initialized = window.api.studyMigrateLegacy(loadMediaStudyDatabase())
      .catch(() => window.api.studyGet());
  }
  return initialized;
}

function subtitleFor(item: MediaItem) {
  return selectJapaneseStudySubtitle(item.subtitles);
}

async function ankiWords(): Promise<Record<string, { intervalDays: number; noteId?: number }>> {
  try {
    const snapshot = await window.api.ankiGetIntervals();
    return Object.fromEntries(snapshot.entries.map((entry) => [
      entry.expression,
      { intervalDays: entry.ivlDays, noteId: entry.noteId },
    ]));
  } catch {
    return {};
  }
}

function currentKnownWords(): Record<string, 1 | 2 | 3> {
  return Object.fromEntries(
    listKnownEntries()
      .filter((entry): entry is { word: string; level: 1 | 2 | 3 } => entry.level > 0)
      .map((entry) => [entry.word, entry.level]),
  );
}

function currentLevelBands(): Array<{ label: string; words: string[] }> {
  return examSlotsForLang('ja').flatMap((slot) => {
    const list = getSlotList(slot.id);
    return list?.words.length ? [{ label: slot.short, words: list.words }] : [];
  });
}

async function currentFrequencyListsFingerprint(): Promise<string> {
  const dictionaries = await window.api.miningListFrequencyDicts().catch(() =>
    [] as Awaited<ReturnType<typeof window.api.miningListFrequencyDicts>>);
  return studyFingerprint(
    dictionaries
      .filter((dictionary) => dictionary.enabled
        && (!dictionary.language || dictionary.language === 'ja'))
      .map((dictionary) => [
        dictionary.id,
        dictionary.entryCount,
        dictionary.importedAt,
      ]),
  );
}

export async function currentStudyReadinessFingerprints(): Promise<StudyReadinessFingerprints> {
  return {
    knowledgeFingerprint: studyFingerprint(currentKnownWords()),
    levelListsFingerprint: studyFingerprint(currentLevelBands()),
    frequencyListsFingerprint: await currentFrequencyListsFingerprint(),
  };
}

export function repeatedLookupStudyEntries(now = Date.now()): LookupHistoryEntry[] {
  const deckKeys = new Set(loadDeck().map((card) =>
    normalizedStudyDuplicateKey(card.word, card.reading)));
  const savedWords = new Set(loadSaved().map((entry) => entry.word.trim()));
  return repeatedLookupEntries(loadLookupHistory(), {
    now,
    exclude: (entry) =>
      getLevel(entry.lemma) >= 2
      || savedWords.has(entry.lemma)
      || deckKeys.has(normalizedStudyDuplicateKey(entry.lemma, entry.reading)),
  });
}

function repeatedLookupFingerprint(entries: readonly LookupHistoryEntry[], now = Date.now()): string {
  return studyFingerprint(entries.map((entry) => [
    entry.lemma,
    entry.reading ?? '',
    recentLookupCount(entry, now),
    entry.at,
  ]));
}

export async function prepareRepeatedLookupPack(
  now = Date.now(),
): Promise<StudyVocabularyWorkspace> {
  await initializeStudyOrchestrator();
  const entries = repeatedLookupStudyEntries(now);
  if (!entries.length) {
    throw new Error('No repeated unknown lookups are ready for a Study pack.');
  }
  const anki = await ankiWords();
  const internal = new Set(loadDeck().map((card) =>
    normalizedStudyDuplicateKey(card.word, card.reading)));
  const candidates: StudyVocabularyCandidate[] = entries.map((entry) => {
    const ankiEntry = anki[entry.lemma];
    return {
      id: `study-lookup-${studyFingerprint([entry.lemma, entry.reading ?? ''])}`,
      word: entry.lemma,
      surface: entry.query,
      reading: entry.reading ?? '',
      meaning: entry.meaning,
      occurrences: recentLookupCount(entry, now),
      sentence: entry.context ?? '',
      timestamp: 0,
      jlptLevel: entry.jlptLevel?.trim().toUpperCase() || null,
      knowledgeLevel: getLevel(entry.lemma),
      proper: false,
      internalDuplicate: internal.has(normalizedStudyDuplicateKey(entry.lemma, entry.reading)),
      ankiDuplicate: Boolean(ankiEntry),
      ankiIntervalDays: ankiEntry?.intervalDays,
    };
  });
  return (await window.api.studyCreateLookupPack({
    candidates,
    sourceFingerprint: repeatedLookupFingerprint(entries, now),
  })).workspace;
}

export async function buildStudyAnalysisRequest(
  item: MediaItem,
  cues: readonly Cue[],
  selectedSubtitle?: SubtitleRecord,
): Promise<StudyAnalysisRequest> {
  const subtitle = selectedSubtitle ?? subtitleFor(item);
  const levelBands = currentLevelBands();
  const knownWords = currentKnownWords();
  const [anki, frequencyListsFingerprint] = await Promise.all([
    ankiWords(),
    currentFrequencyListsFingerprint(),
  ]);
  return {
    media: item,
    cues: cues.map((cue) => ({ start: cue.start, end: cue.end, text: cue.text })),
    subtitle: subtitle ? {
      recordId: subtitle.id,
      source: subtitle.label ?? `${subtitle.lang} ${subtitle.source}`,
      fingerprint: [
        subtitle.id,
        subtitle.addedAt,
        cues.length,
        cues[0]?.start ?? 0,
        cues[cues.length - 1]?.end ?? 0,
      ].join(':'),
    } : undefined,
    knownWords,
    levelBands,
    frequencyListsFingerprint,
    internalCards: loadDeck().map((card) => ({
      id: card.id,
      word: card.word,
      reading: card.reading,
    })),
    ankiWords: anki,
  };
}

export async function prepareStudyMedia(
  item: MediaItem,
  cues: readonly Cue[],
  selectedSubtitle?: SubtitleRecord,
): Promise<StudyPreparationResult> {
  await initializeStudyOrchestrator();
  return window.api.studyPrepare(await buildStudyAnalysisRequest(item, cues, selectedSubtitle));
}

export async function prepareStudyMediaById(
  mediaId: string,
  subtitleRecordId?: string,
): Promise<
  | {
    status: 'queued-transcription';
    mediaId: string;
    jobId: string;
    stage: string;
  }
  | {
    status: 'prepared';
    mediaId: string;
    workspaceId: string;
    candidateCount: number;
    readinessCategory: string;
  }
> {
  await initializeStudyOrchestrator();
  const item = (await window.api.listMedia()).find((candidate) => candidate.id === mediaId);
  if (!item) throw new Error('The requested Study media is no longer in the library.');
  const subtitle = subtitleRecordId
    ? item.subtitles?.find((candidate) =>
      candidate.id === subtitleRecordId && /^ja(?:-|$)/i.test(candidate.lang.trim()))
    : subtitleFor(item);
  if (!subtitle) {
    if (subtitleRecordId) {
      throw new Error('The selected Japanese subtitle record is no longer attached.');
    }
    const queued = await window.api.studyQueueTranscription(mediaId);
    if (!queued.ok) throw new Error(queued.error || 'Transcription could not be queued.');
    const stage = queued.job.stages.find((candidate) => candidate.id === 'subtitles');
    return {
      status: 'queued-transcription',
      mediaId,
      jobId: queued.job.id,
      stage: stage?.status ?? 'queued',
    };
  }

  const stored = await window.api.readSubtitleRecord(mediaId, subtitle.id);
  if (!stored) throw new Error('The selected Japanese subtitle record could not be read.');
  const cues = parseSubtitles(stored.text);
  if (!cues.length) throw new Error('The selected Japanese subtitle track has no readable cues.');
  const prepared = await prepareStudyMedia(item, cues, subtitle);
  return {
    status: 'prepared',
    mediaId,
    workspaceId: prepared.workspace.id,
    candidateCount: prepared.workspace.candidates.length,
    readinessCategory: prepared.readiness.category,
  };
}

export function collectStudyOpportunities(
  document: StudyOrchestratorDocument,
  items: readonly MediaItem[],
  recentAnkiIndex: ReadonlyMap<string, IntervalEntry> = new Map(),
  now = Date.now(),
  readinessFingerprints?: StudyReadinessFingerprints,
  mediaStudySessions: readonly MediaStudySession[] = [],
  grammarSessions: readonly StudyGrammarFailureSession[] = [],
  listeningAvailability?: StudyListeningAvailability | null,
  preferredPlaybackRate = 1,
  ankiLeechIndex: ReadonlyMap<string, IntervalEntry> = new Map(),
): StudyOpportunity[] {
  const persisted = new Map(Object.values(document.opportunities).map((entry) => [entry.id, entry]));
  const generated = items.flatMap((media) => {
    const subtitle = selectJapaneseStudySubtitle(media.subtitles);
    const readinessHistory = Object.values(document.readiness)
      .filter((entry) => entry.mediaId === media.id)
      .sort((a, b) => b.generatedAt - a.generatedAt);
    const readiness = readinessHistory[0];
    const activeWorkspace = Object.values(document.workspaces)
      .filter((entry) => entry.context.mediaId === media.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
    const candidates = generateStudyOpportunities({
      media,
      subtitle: subtitle ? {
        recordId: subtitle.id,
        source: subtitle.label ?? `${subtitle.lang} ${subtitle.source}`,
      } : undefined,
      readiness,
      activeWorkspace,
      recentAnkiMatches: recentAnkiMatchesForWorkspace(
        activeWorkspace,
        recentAnkiIndex,
      ),
      previousReadinessCategory: readinessHistory[1]?.category,
      now,
    });
    return candidates.map((candidate) => {
      const previous = persisted.get(candidate.id);
      return previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate;
    });
  });
  const lookupEntries = repeatedLookupStudyEntries();
  const lookupFingerprint = repeatedLookupFingerprint(lookupEntries);
  const lookupWorkspace = document.workspaces['study-workspace-repeated-lookups'];
  const lookupReadiness = lookupWorkspace
    ? document.readiness[lookupWorkspace.readinessId]
    : undefined;
  const lookupOpportunity = generateRepeatedLookupOpportunity({
    wordCount: lookupEntries.length,
    totalLookups: lookupEntries.reduce(
      (sum, entry) => sum + recentLookupCount(entry),
      0,
    ),
    sourceFingerprint: lookupFingerprint,
    workspaceFingerprint: lookupReadiness?.sourceFingerprint,
    now,
  });
  if (lookupOpportunity) {
    const previous = persisted.get(lookupOpportunity.id);
    generated.push(previous ? {
      ...lookupOpportunity,
      status: previous.status,
      dismissedAt: previous.dismissedAt,
      snoozedUntil: previous.snoozedUntil,
    } : lookupOpportunity);
  }
  if (readinessFingerprints) {
    for (const reinforcement of studyCrossTitleReinforcements(
      items,
      document,
      readinessFingerprints,
    )) {
      const candidate = crossTitleReinforcementOpportunity(reinforcement, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    for (const session of studySceneQuickSessions(
      items,
      document,
      readinessFingerprints,
    )) {
      const candidate = sceneQuickSessionOpportunity(session, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    for (const alternative of studyFavoriteAlternatives(
      items,
      document,
      readinessFingerprints,
    )) {
      const candidate = favoriteAlternativeOpportunity(alternative, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    for (const weakness of studyGrammarWeaknessScenes(
      items,
      document,
      readinessFingerprints,
      grammarSessions,
      GRAMMAR,
      now,
    )) {
      const candidate = grammarWeaknessOpportunity(weakness, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    for (const review of studyProperNameReviews(items, document, readinessFingerprints)) {
      const candidate = properNameReviewOpportunity(review, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    for (const review of studyAnkiLeechReviews(
      items,
      document,
      readinessFingerprints,
      ankiLeechIndex,
    )) {
      const candidate = ankiLeechOpportunity(review, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    for (const forecast of studySeriesRecurrenceForecasts(
      items,
      document,
      readinessFingerprints,
    )) {
      const candidate = seriesRecurrenceOpportunity(forecast, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
    const listeningRecipe = studyListeningFirstRecipe(
      items,
      document,
      readinessFingerprints,
      listeningAvailability,
    );
    if (listeningRecipe) {
      const candidate = listeningFirstOpportunity(listeningRecipe, now);
      const previous = persisted.get(candidate.id);
      generated.push(previous ? {
        ...candidate,
        status: previous.status,
        dismissedAt: previous.dismissedAt,
        snoozedUntil: previous.snoozedUntil,
      } : candidate);
    }
  }
  for (const challenge of studySpeechRateChallenges(
    items,
    document,
    preferredPlaybackRate,
  )) {
    const candidate = speechRateOpportunity(challenge, now);
    const previous = persisted.get(candidate.id);
    generated.push(previous ? {
      ...candidate,
      status: previous.status,
      dismissedAt: previous.dismissedAt,
      snoozedUntil: previous.snoozedUntil,
    } : candidate);
  }
  for (const resize of studyAbandonedSetResizes(document, mediaStudySessions, now)) {
    const workspace = document.workspaces[resize.workspaceId];
    const item = items.find((candidate) => candidate.id === resize.mediaId);
    if (!workspace || !item) continue;
    const candidate = abandonedSetResizeOpportunity(resize, item, workspace, now);
    const previous = persisted.get(candidate.id);
    generated.push(previous ? {
      ...candidate,
      status: previous.status,
      dismissedAt: previous.dismissedAt,
      snoozedUntil: previous.snoozedUntil,
    } : candidate);
  }
  const cleanup = studyStaleQueueCleanup(items, document, currentKnownWords());
  if (cleanup) {
    const candidate = staleQueueCleanupOpportunity(cleanup, now);
    const previous = persisted.get(candidate.id);
    generated.push(previous ? {
      ...candidate,
      status: previous.status,
      dismissedAt: previous.dismissedAt,
      snoozedUntil: previous.snoozedUntil,
    } : candidate);
  }
  const byId = new Map<string, StudyOpportunity>();
  const mediaIds = new Set(items.map((item) => item.id));
  for (const entry of Object.values(document.opportunities)) {
    if (entry.type === 'continue-session' && mediaIds.has(entry.context.mediaId)) {
      byId.set(entry.id, entry);
    }
  }
  for (const entry of generated) byId.set(entry.id, entry);
  return [...byId.values()]
    .filter((entry) => entry.status === 'active'
      || (entry.status === 'snoozed' && (entry.snoozedUntil ?? 0) <= Date.now()))
    .sort((a, b) => b.priority - a.priority);
}

export function grammarWeaknessOpportunity(
  weakness: StudyGrammarWeaknessScene,
  now: number,
): StudyOpportunity {
  const context = weakness.contexts[0];
  return {
    id: weakness.opportunityId,
    type: 'grammar-weakness-scenes',
    title: t('study.grammarWeakness.title', {
      pattern: weakness.pattern,
      count: weakness.contexts.length,
    }),
    explanation: t('study.grammarWeakness.explanation'),
    priority: 70,
    estimatedMinutes: Math.min(6, Math.max(2, weakness.contexts.length + 1)),
    context: {
      mediaId: context.mediaId,
      episode: context.episode,
      subtitleRecordId: context.subtitleRecordId,
      cueStartSec: context.cueStartSec,
      sentence: context.sentence,
      returnTarget: {
        section: 'video',
        mediaId: context.mediaId,
        subtitleRecordId: context.subtitleRecordId,
        positionSec: context.cueStartSec,
      },
    },
    evidence: [
      {
        code: 'grammar-failed-sessions',
        label: t('study.grammarWeakness.failedSessions', {
          count: weakness.failedSessions,
        }),
        value: weakness.failedSessions,
      },
      {
        code: 'grammar-prepared-contexts',
        label: t('study.grammarWeakness.preparedContexts', {
          count: weakness.contexts.length,
        }),
        value: weakness.contexts.length,
      },
      {
        code: 'grammar-literal-core',
        label: t('study.grammarWeakness.literalCore', { core: weakness.core }),
        value: weakness.core,
      },
    ],
    actions: ['preview-grammar-scenes', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function listeningFirstOpportunity(
  recipe: StudyListeningFirstRecipe,
  now: number,
): StudyOpportunity {
  const coverage = Math.round(recipe.knownCoverage * 100);
  return {
    id: recipe.opportunityId,
    type: 'listening-first-recipe',
    title: t('study.listeningFirst.title', { title: recipe.title }),
    explanation: t('study.listeningFirst.explanation'),
    priority: 73,
    estimatedMinutes: 10,
    context: {
      mediaId: recipe.mediaId,
      episode: recipe.episode,
      subtitleRecordId: recipe.subtitleRecordId,
      listeningMode: 'dictation',
      returnTarget: {
        section: 'video',
        mediaId: recipe.mediaId,
        subtitleRecordId: recipe.subtitleRecordId,
        positionSec: recipe.positionSec,
      },
    },
    readinessId: recipe.readinessId,
    evidence: [
      {
        code: 'listening-known-coverage',
        label: t('study.listeningFirst.coverage', { coverage }),
        value: recipe.knownCoverage,
      },
      {
        code: 'listening-audio-confirmed',
        label: t('study.listeningFirst.audioConfirmed'),
        value: recipe.audioTrackCount,
      },
      {
        code: 'listening-exact-subtitles',
        label: t('study.listeningFirst.subtitlesReady'),
        value: recipe.subtitleRecordId,
      },
    ],
    actions: ['start-listening-first', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function properNameReviewOpportunity(
  review: StudyProperNameReview,
  now: number,
): StudyOpportunity {
  const first = review.names[0];
  return {
    id: review.opportunityId,
    type: 'proper-name-review',
    title: t('study.properNames.title', {
      count: review.totalNames,
      title: review.title,
    }),
    explanation: t('study.properNames.explanation'),
    priority: 68,
    estimatedMinutes: Math.min(6, Math.max(2, Math.ceil(review.totalNames / 2))),
    context: {
      mediaId: review.mediaId,
      episode: review.episode,
      subtitleRecordId: review.subtitleRecordId,
      cueStartSec: first?.cueStartSec,
      sentence: first?.sentence,
      returnTarget: {
        section: 'video',
        mediaId: review.mediaId,
        subtitleRecordId: review.subtitleRecordId,
        positionSec: first?.cueStartSec ?? 0,
      },
    },
    readinessId: review.readinessId,
    evidence: [
      {
        code: 'proper-name-cluster',
        label: t('study.properNames.nameCount', { count: review.totalNames }),
        value: review.totalNames,
      },
      {
        code: 'proper-name-occurrences',
        label: t('study.properNames.occurrences', { count: review.totalOccurrences }),
        value: review.totalOccurrences,
      },
      review.selectedNames > 0
        ? {
          code: 'proper-name-in-cards',
          label: t('study.properNames.inCards', { count: review.selectedNames }),
          value: review.selectedNames,
        }
        : {
          code: 'proper-name-out-of-cards',
          label: t('study.properNames.outOfCards'),
          value: 0,
        },
    ],
    actions: ['preview-proper-names', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function speechRateOpportunity(
  challenge: StudySpeechRateChallenge,
  now: number,
): StudyOpportunity {
  const faster = Math.round(challenge.excess * 100);
  return {
    id: challenge.opportunityId,
    type: 'speech-rate-challenge',
    title: t('study.speechRate.title', { title: challenge.title }),
    explanation: t('study.speechRate.explanation', {
      rate: challenge.preferredPlaybackRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''),
      faster,
    }),
    priority: 66,
    estimatedMinutes: 5,
    context: {
      mediaId: challenge.mediaId,
      episode: challenge.episode,
      subtitleRecordId: challenge.subtitleRecordId,
      returnTarget: {
        section: 'video',
        mediaId: challenge.mediaId,
        subtitleRecordId: challenge.subtitleRecordId,
        positionSec: challenge.positionSec,
      },
    },
    readinessId: challenge.readinessId,
    evidence: [
      {
        code: 'speech-rate-effective',
        label: t('study.speechRate.effectiveEvidence', {
          rate: challenge.effectiveWordsPerSecond.toFixed(2),
        }),
        value: challenge.effectiveWordsPerSecond,
      },
      {
        code: 'speech-rate-baseline',
        label: t('study.speechRate.baselineEvidence', {
          rate: challenge.baselineWordsPerSecond.toFixed(2),
          count: challenge.comparedTitles,
        }),
        value: challenge.baselineWordsPerSecond,
      },
      {
        code: 'speech-rate-suggestion',
        label: t('study.speechRate.suggestionEvidence', {
          rate: challenge.recommendedPlaybackRate.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''),
        }),
        value: challenge.recommendedPlaybackRate,
      },
    ],
    actions: ['preview-speech-rate', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function ankiLeechOpportunity(
  review: StudyAnkiLeechReview,
  now: number,
): StudyOpportunity {
  const first = review.contexts[0];
  const evidence: StudyOpportunity['evidence'] = [
    {
      code: 'anki-leech-context-count',
      label: t('study.ankiLeech.matchEvidence', { count: review.totalMatches }),
      value: review.totalMatches,
    },
  ];
  if (review.leechCount > 0) {
    evidence.push({
      code: 'anki-leech-tag-count',
      label: t('study.ankiLeech.leechEvidence', { count: review.leechCount }),
      value: review.leechCount,
    });
  }
  if (review.suspendedCount > 0) {
    evidence.push({
      code: 'anki-suspended-count',
      label: t('study.ankiLeech.suspendedEvidence', { count: review.suspendedCount }),
      value: review.suspendedCount,
    });
  }
  evidence.push({
    code: 'anki-leech-exact-subtitles',
    label: t('study.ankiLeech.exactEvidence'),
    value: review.subtitleRecordId,
  });
  return {
    id: review.opportunityId,
    type: 'anki-leech-context',
    title: t('study.ankiLeech.title', { title: review.title }),
    explanation: t('study.ankiLeech.explanation', { count: review.totalMatches }),
    priority: 65,
    estimatedMinutes: Math.min(6, Math.max(2, review.totalMatches + 1)),
    context: {
      mediaId: review.mediaId,
      episode: review.episode,
      subtitleRecordId: review.subtitleRecordId,
      cueStartSec: first?.cueStartSec,
      sentence: first?.sentence,
      returnTarget: {
        section: 'video',
        mediaId: review.mediaId,
        subtitleRecordId: review.subtitleRecordId,
        positionSec: first?.cueStartSec ?? 0,
      },
    },
    readinessId: review.readinessId,
    evidence,
    actions: ['preview-anki-leech', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function seriesRecurrenceOpportunity(
  forecast: StudySeriesRecurrenceForecast,
  now: number,
): StudyOpportunity {
  const first = forecast.lemmas[0];
  return {
    id: forecast.opportunityId,
    type: 'series-recurrence-forecast',
    title: t('study.seriesRecurrence.title', {
      title: forecast.seriesTitle,
      episode: forecast.episode,
    }),
    explanation: t('study.seriesRecurrence.explanation', {
      count: forecast.totalRecurringLemmas,
      episodes: forecast.upcomingPreparedEpisodes,
    }),
    priority: 64,
    estimatedMinutes: Math.min(7, Math.max(3, forecast.lemmas.length)),
    context: {
      mediaId: forecast.mediaId,
      episode: forecast.episode,
      subtitleRecordId: forecast.subtitleRecordId,
      cueStartSec: first?.currentCueStartSec,
      sentence: first?.currentSentence,
      returnTarget: {
        section: 'video',
        mediaId: forecast.mediaId,
        subtitleRecordId: forecast.subtitleRecordId,
        positionSec: first?.currentCueStartSec ?? 0,
      },
    },
    readinessId: forecast.readinessId,
    evidence: [
      {
        code: 'series-recurrence-lemma-count',
        label: t('study.seriesRecurrence.lemmaEvidence', {
          count: forecast.totalRecurringLemmas,
        }),
        value: forecast.totalRecurringLemmas,
      },
      {
        code: 'series-recurrence-upcoming-episodes',
        label: t('study.seriesRecurrence.episodeEvidence', {
          count: forecast.upcomingPreparedEpisodes,
        }),
        value: forecast.upcomingPreparedEpisodes,
      },
      {
        code: 'series-recurrence-future-occurrences',
        label: t('study.seriesRecurrence.occurrenceEvidence', {
          count: forecast.totalFutureOccurrences,
        }),
        value: forecast.totalFutureOccurrences,
      },
      {
        code: 'series-recurrence-exact-subtitles',
        label: t('study.seriesRecurrence.exactEvidence'),
        value: forecast.subtitleRecordId,
      },
    ],
    actions: ['preview-series-recurrence', 'open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

export function favoriteAlternativeOpportunity(
  alternative: StudyFavoriteAlternative,
  now: number,
): StudyOpportunity {
  const harderCoverage = Math.round(alternative.harder.knownCoverage * 100);
  const easierCoverage = Math.round(alternative.easier.knownCoverage * 100);
  const delta = Math.round(alternative.coverageDelta * 100);
  return {
    id: alternative.opportunityId,
    type: 'easier-favorite-alternative',
    title: t('study.favoriteAlternative.title', {
      easier: alternative.easier.title,
      harder: alternative.harder.title,
    }),
    explanation: t('study.favoriteAlternative.explanation'),
    priority: 72,
    estimatedMinutes: 5,
    context: {
      mediaId: alternative.easier.mediaId,
      episode: alternative.easier.episode,
      subtitleRecordId: alternative.easier.subtitleRecordId,
      returnTarget: {
        section: 'video',
        mediaId: alternative.easier.mediaId,
        subtitleRecordId: alternative.easier.subtitleRecordId,
        positionSec: alternative.easier.positionSec,
      },
    },
    readinessId: alternative.easier.readinessId,
    evidence: [
      {
        code: 'harder-favorite-coverage',
        label: t('study.favoriteAlternative.harderCoverage', {
          title: alternative.harder.title,
          coverage: harderCoverage,
        }),
        value: alternative.harder.knownCoverage,
      },
      {
        code: 'easier-favorite-coverage',
        label: t('study.favoriteAlternative.easierCoverage', {
          title: alternative.easier.title,
          coverage: easierCoverage,
        }),
        value: alternative.easier.knownCoverage,
      },
      {
        code: 'favorite-coverage-delta',
        label: t('study.favoriteAlternative.delta', { delta }),
        value: alternative.coverageDelta,
      },
    ],
    actions: ['open-context'],
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Projects outdated Study debt using the current knowledge state.
 *
 * Knowledge lives in the renderer, so this is the one place that reads it for
 * the cleanup rule; the shared detector stays free of storage access.
 */
export function currentStudyStaleQueue(
  document: StudyOrchestratorDocument,
  items: readonly MediaItem[],
): StudyStaleQueueCleanup | null {
  return studyStaleQueueCleanup(items, document, currentKnownWords());
}

export function previewInternalStudyCards(workspace: StudyVocabularyWorkspace): StudyCardPreview {
  const selected = new Set(workspace.selectionIds);
  const existing = new Set(loadDeck().map((card) => normalizedStudyDuplicateKey(card.word, card.reading)));
  const items = workspace.candidates
    .filter((candidate) => selected.has(candidate.id))
    .map((candidate) => ({
      candidateId: candidate.id,
      word: candidate.word,
      reading: candidate.reading,
      sentence: candidate.sentence,
      timestamp: candidate.timestamp,
      internalDuplicate: existing.has(normalizedStudyDuplicateKey(candidate.word, candidate.reading)),
      ankiDuplicate: candidate.ankiDuplicate,
      missingMeaning: !candidate.meaning?.trim(),
    }));
  return {
    workspaceId: workspace.id,
    totalSelected: items.length,
    creatable: items.filter((item) => !item.internalDuplicate).length,
    internalDuplicates: items.filter((item) => item.internalDuplicate).length,
    ankiDuplicates: items.filter((item) => item.ankiDuplicate).length,
    missingMeanings: items.filter((item) => item.missingMeaning).length,
    items,
  };
}

export async function createInternalStudyCards(
  workspace: StudyVocabularyWorkspace,
): Promise<{ workspace: StudyVocabularyWorkspace; createdIds: string[]; skipped: number }> {
  const preview = previewInternalStudyCards(workspace);
  const actionId = `study-local-cards-${Date.now().toString(36)}`;
  const byId = new Map(workspace.candidates.map((candidate) => [candidate.id, candidate]));
  const creatable = preview.items.filter((item) => !item.internalDuplicate);
  const created = addDeckCardsTracked(creatable.flatMap((item) => {
    const candidate = byId.get(item.candidateId);
    if (!candidate) return [];
    return [{
      word: candidate.word,
      reading: candidate.reading,
      meaning: candidate.meaning ?? '',
      sentence: candidate.sentence,
      front: candidate.word,
      back: [candidate.reading, candidate.meaning, candidate.sentence].filter(Boolean).join('\n\n'),
      source: workspace.context.sourceKind === 'lookup-history' ? 'dictionary' as const : 'media' as const,
      bookId: workspace.context.mediaId,
      bookTitle: workspace.context.sourceKind === 'lookup-history'
        ? 'Repeated Lookups'
        : workspace.context.mediaId,
      folder: workspace.context.sourceKind === 'lookup-history' ? 'Repeated Lookups' : 'Media',
      frequency: candidate.occurrences,
      jlptLevel: candidate.jlptLevel ?? undefined,
      sceneReference: workspace.context.sourceKind === 'lookup-history'
        ? undefined
        : `${Math.floor(candidate.timestamp / 60)}:${String(Math.floor(candidate.timestamp % 60)).padStart(2, '0')}`,
      sourceRef: {
        ...workspace.context,
        cueStartSec: candidate.timestamp,
        sentence: candidate.sentence,
      },
      studyActionId: actionId,
    }];
  }));
  const createdByWord = new Map(created.map((card) => [normalizedStudyDuplicateKey(card.word, card.reading), card]));
  const exports = workspace.exports.filter((entry) => !creatable.some((item) => item.candidateId === entry.candidateId));
  for (const item of preview.items) {
    const card = createdByWord.get(normalizedStudyDuplicateKey(item.word, item.reading));
    exports.push({
      candidateId: item.candidateId,
      status: card ? 'created' : 'duplicate',
      localCardId: card?.id,
    });
  }
  const next = await window.api.studyUpdateWorkspace({
    ...workspace,
    updatedAt: Date.now(),
    exports,
  });
  return { workspace: next, createdIds: created.map((card) => card.id), skipped: preview.internalDuplicates };
}

export async function undoInternalStudyCards(
  workspace: StudyVocabularyWorkspace,
): Promise<StudyVocabularyWorkspace> {
  const ids = workspace.exports.flatMap((entry) => entry.localCardId ? [entry.localCardId] : []);
  removeDeckCards(ids);
  return window.api.studyUpdateWorkspace({
    ...workspace,
    updatedAt: Date.now(),
    exports: workspace.exports.filter((entry) => !entry.localCardId),
  });
}

export function workspaceCoverage(
  document: StudyOrchestratorDocument,
  workspace: StudyVocabularyWorkspace,
) {
  const readiness = document.readiness[workspace.readinessId];
  return readiness ? studyCoveragePreview(readiness, workspace) : null;
}

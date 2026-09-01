import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type {
  StudyAnkiPreview,
  StudyCardPreview,
  StudyContextRef,
  StudyEvidence,
  StudyOpportunity,
  StudyOrchestratorDocument,
  StudyPipelineJob,
  StudyPipelineStage,
  StudyReadinessCategory,
  StudyVocabularyCandidate,
  StudyVocabularyFilters,
  StudyVocabularyWorkspace,
} from '../../../shared/mediaStudyOrchestrator';
import { translateAnkiReason, type IntervalSnapshot } from '../../../shared/anki';
import { openGrammarPractice } from '../../extensionBridgeUi';
import type { MediaStudyDatabase } from '../../../shared/mediaStudyDatabase';
import {
  createEmptyStudyOrchestratorDocument,
  indexRecentAnkiIntervalEntries,
  selectJapaneseStudySubtitle,
} from '../../../shared/mediaStudyOrchestrator';
import {
  studyEpisodeReadinessRail,
  type StudyEpisodeReadinessEntry,
  type StudyReadinessFingerprints,
} from '../../../shared/studyEpisodeReadiness';
import {
  studySubtitleUpgrade,
  type StudySubtitleUpgrade,
} from '../../../shared/studySubtitleUpgrade';
import {
  studyCrossTitleReinforcements,
  type StudyCrossTitleContext,
} from '../../../shared/studyCrossTitleReinforcement';
import {
  studyAbandonedSetResizes,
  type StudyAbandonedSetResize,
} from '../../../shared/studyAbandonedSetResize';
import {
  studySceneQuickSessions,
  type StudySceneQuickSession,
} from '../../../shared/studySceneQuickSession';
import {
  studyGrammarWeaknessScenes,
  type StudyGrammarWeaknessContext,
} from '../../../shared/studyGrammarWeaknessScenes';
import {
  properNameContextLine,
  properNameFurigana,
  properNameReviewStillCurrent,
  studyProperNameReviews,
  type StudyProperNameEntry,
  type StudyProperNameReview,
} from '../../../shared/studyProperNameReview';
import {
  studySpeechRateChallenges,
  type StudySpeechRateChallenge,
} from '../../../shared/studySpeechRate';
import {
  indexAnkiLeechEntries,
  studyAnkiLeechReviews,
  type StudyAnkiLeechContext,
  type StudyAnkiLeechReview,
} from '../../../shared/studyAnkiLeech';
import {
  studySeriesRecurrenceForecasts,
  type StudySeriesRecurrenceContext,
  type StudySeriesRecurrenceForecast,
  type StudySeriesRecurrenceLemma,
} from '../../../shared/studySeriesRecurrenceForecast';
import {
  staleQueueItemsStillValid,
  type StudyStaleQueueCleanup,
  type StudyStaleQueueItem,
} from '../../../shared/studyStaleQueueCleanup';
import {
  STUDY_RECIPE_FIELDS,
  createStudyFilterRecipe,
  parseStudyFilterRecipe,
  previewStudyFilterRecipe,
  serializeStudyFilterRecipe,
  studyFilterRecipeCode,
  studyFilterRecipeSource,
  type StudyFilterField,
  type StudyFilterRecipeRejection,
  type StudyFilterRecipeValue,
} from '../../../shared/studyFilterRecipe';
import {
  studyPlaybackPosition,
  studyPositionChanged,
  type StudyMediaSurface,
} from '../../../shared/studyMediaSurface';
import Icon from '../Icons';
import { scrollIntoViewReliably } from '../../utils/reliableScroll';
import MediaArtwork from './library/MediaArtwork';
import {
  collectStudyOpportunities,
  createInternalStudyCards,
  currentStudyReadinessFingerprints,
  currentStudyStaleQueue,
  initializeStudyOrchestrator,
  prepareStudyMediaById,
  prepareRepeatedLookupPack,
  previewInternalStudyCards,
  undoInternalStudyCards,
  workspaceCoverage,
} from '../../mediaStudyOrchestrator';
import { onLookupHistoryChanged } from '../../lookupHistory';
import { onKnowledgeChanged } from '../../knownWords';
import { onDeckChanged } from '../../flashcardDeck';
import { onSavedChanged } from '../../savedWords';
import { onLevelListsChanged } from '../../levelLists';
import { GRAMMAR } from '../../data/grammar';
import {
  loadSessionHistory,
  onSessionHistoryChanged,
} from '../../grammarSessionHistory';
import {
  loadSubtitleProvidersDocument,
  onSubtitleStoreChanged,
} from '../../subtitleStore';
import { createStudyAgentHandlers } from '../../studyAgentHandlers';
import { confirmDialog } from '../ui/dialogService';
import { setHandoffJson } from '../../pendingHandoff';
import {
  loadMediaStudyDatabase,
  onMediaStudyDatabaseChanged,
} from '../../mediaStudyStore';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';

interface StudyOrchestratorWorkspaceProps {
  /**
   * The mounted player, reduced to the five members Study needs. Deliberately
   * not the legacy `MediaState`: see `shared/studyMediaSurface.ts`.
   */
  surface: StudyMediaSurface;
}

const VOCABULARY_PAGE_SIZE = 60;

const percent = (value: number | null | undefined): string => (
  value == null ? '—' : `${Math.round(value * 100)}%`
);

function cueTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function playbackRateLabel(value: number): string {
  return `${Number(value.toFixed(2))}×`;
}

/**
 * One i18n key per filter field. These are shared deliberately: the filter bar's
 * own controls and the rank-24 recipe diff must call the same filter the same
 * thing, or the diff reads like a different feature's vocabulary.
 */
const STUDY_FILTER_FIELD_KEYS: Record<StudyFilterField, string> = {
  excludedJlptLevels: 'study.filter.field.excludedJlptLevels',
  minimumOccurrences: 'study.filter.field.minimumOccurrences',
  excludeKnowledgeAtOrAbove: 'study.filter.field.excludeKnowledgeAtOrAbove',
  excludeInternalDuplicates: 'study.filter.field.excludeInternalDuplicates',
  excludeAnkiDuplicates: 'study.filter.field.excludeAnkiDuplicates',
  excludeAnkiMatureAtDays: 'study.filter.field.excludeAnkiMatureAtDays',
  excludeProperNouns: 'study.filter.field.excludeProperNouns',
  maximumCards: 'study.filter.field.maximumCards',
  rankingMode: 'study.filter.field.rankingMode',
};

const RECIPE_REJECTION_KEYS: Record<StudyFilterRecipeRejection, string> = {
  empty: 'study.recipe.reason.empty',
  'too-large': 'study.recipe.reason.tooLarge',
  'not-json': 'study.recipe.reason.notJson',
  'not-an-object': 'study.recipe.reason.notAnObject',
  'wrong-kind': 'study.recipe.reason.wrongKind',
  'unsupported-version': 'study.recipe.reason.unsupportedVersion',
  'no-filters': 'study.recipe.reason.noFilters',
};

/**
 * Pipeline stage names are stored in the persisted job document in English,
 * because the main process writes them. The production line therefore translates
 * by stage *id* and keeps the stored label only as a fallback for an id this
 * build does not know.
 */
const STAGE_LABEL_KEYS: Record<string, string> = {
  media: 'study.stage.media',
  subtitles: 'study.stage.subtitles',
  analysis: 'study.stage.analysis',
  comparison: 'study.stage.comparison',
  filtering: 'study.stage.filtering',
  cards: 'study.stage.cards',
  anki: 'study.stage.anki',
  'lookup-history': 'study.stage.lookupHistory',
  'lookup-comparison': 'study.stage.comparison',
  'lookup-workspace': 'study.stage.lookupWorkspace',
};

type Translator = (key: string, vars?: Record<string, string | number>) => string;

/**
 * Opportunity text is persisted in English by the generators, which cannot know
 * the UI language. Where a generator also stored a key, use it; otherwise show the
 * stored English. Every Study surface that renders an opportunity goes through
 * these three, so the stream, the evidence panel and the resume strip can never
 * disagree about the same recommendation.
 */
const opportunityTitle = (opportunity: StudyOpportunity, translate: Translator): string =>
  (opportunity.titleKey ? translate(opportunity.titleKey, opportunity.titleVars) : opportunity.title);

const opportunityExplanation = (
  opportunity: StudyOpportunity,
  translate: Translator,
): string => (opportunity.explanationKey
  ? translate(opportunity.explanationKey, opportunity.explanationVars)
  : opportunity.explanation);

const evidenceLabel = (evidence: StudyEvidence, translate: Translator): string =>
  (evidence.labelKey ? translate(evidence.labelKey, evidence.labelVars) : evidence.label);

/**
 * The evidence panel used to print the raw opportunity type
 * (`series-recurrence-forecast` with its dashes swapped for spaces), which is a
 * developer's slug, not a name a learner recognizes. Unknown types still fall
 * back to the readable slug rather than showing a dotted key.
 */
const OPPORTUNITY_TYPE_KEYS: Record<string, string> = {
  'continue-session': 'study.type.continueSession',
  'repeated-lookups': 'study.type.repeatedLookups',
  'prepared-unwatched': 'study.type.preparedUnwatched',
  'recently-learned-context': 'study.type.recentlyLearnedContext',
  'cross-title-reinforcement': 'study.type.crossTitleReinforcement',
  'abandoned-set-resize': 'study.type.abandonedSetResize',
  'scene-quick-session': 'study.type.sceneQuickSession',
  'grammar-weakness-scenes': 'study.type.grammarWeaknessScenes',
  'listening-first-recipe': 'study.type.listeningFirstRecipe',
  'proper-name-review': 'study.type.properNameReview',
  'speech-rate-challenge': 'study.type.speechRateChallenge',
  'anki-leech-context': 'study.type.ankiLeechContext',
  'series-recurrence-forecast': 'study.type.seriesRecurrenceForecast',
  'stale-queue-cleanup': 'study.type.staleQueueCleanup',
  'easier-favorite-alternative': 'study.type.easierFavoriteAlternative',
  'queued-preparation': 'study.type.queuedPreparation',
  'favorite-preparation': 'study.type.favoritePreparation',
  'newly-unlocked': 'study.type.newlyUnlocked',
  'subtitle-required': 'study.type.subtitleRequired',
  'export-pending': 'study.type.exportPending',
};

const STAGE_STATUS_KEYS: Record<string, string> = {
  waiting: 'study.stageStatus.waiting',
  queued: 'study.stageStatus.queued',
  active: 'study.stageStatus.active',
  'requires-input': 'study.stageStatus.requiresInput',
  complete: 'study.stageStatus.complete',
  failed: 'study.stageStatus.failed',
  cancelled: 'study.stageStatus.cancelled',
};

/**
 * The shared `readinessLabel` returns English, because it also feeds evidence
 * strings the main process builds. Every renderer surface that shows a readiness
 * category to the user goes through this instead, so the episode rail and the
 * context rail always agree with each other and with the UI language.
 */
function readinessCategoryLabel(
  category: StudyReadinessCategory,
  translate: (key: string, vars?: Record<string, string | number>) => string,
): string {
  return translate(`study.readiness.${category}`);
}

/**
 * Renders one recipe value for a human. `null` means two different things
 * depending on the field — no card cap versus no maturity cutoff — so it is
 * resolved per field rather than printed as one word.
 */
function recipeValueLabel(
  field: StudyFilterField,
  value: StudyFilterRecipeValue,
  translate: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (Array.isArray(value)) {
    return value.length ? value.join(' · ') : translate('study.filter.value.none');
  }
  if (typeof value === 'boolean') {
    return translate(value ? 'study.filter.value.on' : 'study.filter.value.off');
  }
  if (value === null) {
    return translate(field === 'maximumCards'
      ? 'study.filter.value.noLimit'
      : 'study.filter.value.off');
  }
  if (field === 'rankingMode') {
    return translate(value === 'frequency-all'
      ? 'study.filter.value.frequencyAll'
      : 'study.filter.value.frequencyUnrated');
  }
  return String(value);
}

function newestWorkspace(
  document: StudyOrchestratorDocument,
  mediaId?: string,
): StudyVocabularyWorkspace | null {
  return Object.values(document.workspaces)
    .filter((workspace) => !mediaId || workspace.context.mediaId === mediaId)
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

function jobForWorkspace(
  document: StudyOrchestratorDocument,
  workspaceId?: string,
  mediaId?: string,
): StudyPipelineJob | null {
  return Object.values(document.jobs)
    .filter((job) =>
      (!mediaId || job.mediaId === mediaId)
      && (!workspaceId || !job.workspaceId || job.workspaceId === workspaceId))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

function nextActionLabel(
  opportunity: StudyOpportunity,
  translate: (key: string) => string,
): string {
  if (opportunity.type === 'continue-session') return 'Resume';
  if (opportunity.type === 'prepared-unwatched') return 'Watch now';
  if (opportunity.type === 'recently-learned-context') return 'Open context';
  if (opportunity.type === 'cross-title-reinforcement') return 'Compare contexts';
  if (opportunity.type === 'abandoned-set-resize') return 'Preview smaller set';
  if (opportunity.type === 'scene-quick-session') return 'Preview quick session';
  if (opportunity.type === 'grammar-weakness-scenes') {
    return translate('study.grammarWeakness.action');
  }
  if (opportunity.type === 'listening-first-recipe') {
    return translate('study.listeningFirst.action');
  }
  if (opportunity.type === 'proper-name-review') {
    return translate('study.properNames.action');
  }
  if (opportunity.type === 'speech-rate-challenge') {
    return translate('study.speechRate.action');
  }
  if (opportunity.type === 'anki-leech-context') {
    return translate('study.ankiLeech.action');
  }
  if (opportunity.type === 'series-recurrence-forecast') {
    return translate('study.seriesRecurrence.action');
  }
  if (opportunity.type === 'stale-queue-cleanup') return 'Review outdated items';
  if (opportunity.type === 'easier-favorite-alternative') {
    return translate('study.favoriteAlternative.action');
  }
  if (opportunity.type === 'repeated-lookups') {
    return opportunity.actions.includes('build-lookup-pack') ? 'Build pack' : 'Review pack';
  }
  if (opportunity.type === 'subtitle-required') return 'Prepare subtitles';
  if (opportunity.type === 'export-pending') return 'Review export';
  if (opportunity.actions.includes('open-context') && !opportunity.actions.includes('prepare')) return 'Open episode';
  return 'Prepare media';
}

export default function StudyOrchestratorWorkspace({ surface }: StudyOrchestratorWorkspaceProps) {
  const { t, lang } = useT();
  const [document, setDocument] = useState<StudyOrchestratorDocument>(
    createEmptyStudyOrchestratorDocument,
  );
  const [activeMediaId, setActiveMediaId] = useState<string | undefined>();
  const [activeOpportunityId, setActiveOpportunityId] = useState<string | undefined>();
  const [evidenceOpportunityId, setEvidenceOpportunityId] = useState<string | undefined>();
  const [lastOpportunityChange, setLastOpportunityChange] = useState<{
    opportunity: StudyOpportunity;
    status: 'dismissed' | 'snoozed';
  } | null>(null);
  const [workspace, setWorkspace] = useState<StudyVocabularyWorkspace | null>(null);
  const [page, setPage] = useState<StudyVocabularyCandidate[]>([]);
  const [pageOffset, setPageOffset] = useState(0);
  const [pageInfo, setPageInfo] = useState({ total: 0, selected: 0 });
  const [pageLoading, setPageLoading] = useState(false);
  const [cardPreview, setCardPreview] = useState<StudyCardPreview | null>(null);
  const [ankiPreview, setAnkiPreview] = useState<StudyAnkiPreview | null>(null);
  const [status, setStatus] = useState('Loading Study workspace…');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState('');
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [recipeText, setRecipeText] = useState('');
  const [recipeNotice, setRecipeNotice] = useState('');
  const [studySignalRevision, setStudySignalRevision] = useState(0);
  const [ankiIntervals, setAnkiIntervals] = useState<IntervalSnapshot | null>(null);
  const [readinessFingerprints, setReadinessFingerprints] =
    useState<StudyReadinessFingerprints | null>(null);
  const [subtitleStoreRevision, setSubtitleStoreRevision] = useState(0);
  const [comparisonGroupId, setComparisonGroupId] = useState<string | null>(null);
  const [mediaStudyDatabase, setMediaStudyDatabase] = useState<MediaStudyDatabase>(
    loadMediaStudyDatabase,
  );
  const [resizePreview, setResizePreview] = useState<StudyAbandonedSetResize | null>(null);
  const [resizeApplied, setResizeApplied] = useState(false);
  const [sceneSessionId, setSceneSessionId] = useState<string | null>(null);
  const [grammarWeaknessId, setGrammarWeaknessId] = useState<string | null>(null);
  const [properNameReviewId, setProperNameReviewId] = useState<string | null>(null);
  const [properNameFilterApplied, setProperNameFilterApplied] = useState(false);
  const [speechRatePreview, setSpeechRatePreview] =
    useState<StudySpeechRateChallenge | null>(null);
  const [speechRateUndo, setSpeechRateUndo] = useState<number | null>(null);
  const [ankiLeechReviewId, setAnkiLeechReviewId] = useState<string | null>(null);
  const [seriesRecurrenceId, setSeriesRecurrenceId] = useState<string | null>(null);
  const [grammarHistory, setGrammarHistory] = useState(loadSessionHistory);
  const [cleanupPreview, setCleanupPreview] = useState<StudyStaleQueueCleanup | null>(null);
  const [cleanupUndo, setCleanupUndo] = useState<Array<{
    opportunityId: string;
    status: 'active' | 'snoozed';
    snoozedUntil?: number;
  }> | null>(null);
  const pendingPrepare = useRef<string | null>(null);
  const workspaceRef = useRef<StudyVocabularyWorkspace | null>(null);
  const evidenceRef = useRef<HTMLDivElement | null>(null);
  const comparisonRef = useRef<HTMLElement | null>(null);
  const resizeRef = useRef<HTMLElement | null>(null);
  const sceneSessionRef = useRef<HTMLElement | null>(null);
  const grammarWeaknessRef = useRef<HTMLElement | null>(null);
  const properNamesRef = useRef<HTMLElement | null>(null);
  const speechRateRef = useRef<HTMLElement | null>(null);
  const ankiLeechRef = useRef<HTMLElement | null>(null);
  const seriesRecurrenceRef = useRef<HTMLElement | null>(null);
  const cleanupRef = useRef<HTMLElement | null>(null);
  // The poll below runs on a timer, so it must read the *latest* surface rather
  // than one captured when the interval was created.
  const surfaceRef = useRef<StudyMediaSurface>(surface);

  useEffect(() => {
    workspaceRef.current = workspace;
    surfaceRef.current = surface;
  }, [surface, workspace]);

  useEffect(() => {
    if (!speechRatePreview) return;
    let cancelScroll: (() => void) | null = null;
    const frame = window.requestAnimationFrame(() => {
      const panel = speechRateRef.current;
      cancelScroll = scrollIntoViewReliably(panel, { block: 'nearest' });
      panel?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cancelScroll?.();
    };
  }, [speechRatePreview]);

  useEffect(() => {
    if (!ankiLeechReviewId) return;
    let cancelScroll: (() => void) | null = null;
    const frame = window.requestAnimationFrame(() => {
      const panel = ankiLeechRef.current;
      cancelScroll = scrollIntoViewReliably(panel, { block: 'nearest', inline: 'nearest' });
      panel?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cancelScroll?.();
    };
  }, [ankiLeechReviewId]);

  useEffect(() => {
    if (!seriesRecurrenceId) return;
    let cancelScroll: (() => void) | null = null;
    const frame = window.requestAnimationFrame(() => {
      const panel = seriesRecurrenceRef.current;
      cancelScroll = scrollIntoViewReliably(panel, { block: 'nearest', inline: 'nearest' });
      panel?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      cancelScroll?.();
    };
  }, [seriesRecurrenceId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const active = workspaceRef.current;
      const playback = surfaceRef.current;
      if (!active || active.context.mediaId !== playback.current?.id) return;
      const position = studyPlaybackPosition(playback);
      const previous = active.context.returnTarget?.positionSec ?? active.context.cueStartSec ?? 0;
      if (!studyPositionChanged(previous, position)) return;
      const next: StudyVocabularyWorkspace = {
        ...active,
        updatedAt: Date.now(),
        context: {
          ...active.context,
          cueStartSec: position,
          returnTarget: {
            ...(active.context.returnTarget ?? { section: 'video' }),
            mediaId: active.context.mediaId,
            positionSec: position,
          },
        },
      };
      workspaceRef.current = next;
      void window.api.studyUpdateWorkspace(next);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    void window.api.ankiGetIntervals()
      .then((snapshot) => {
        if (active) setAnkiIntervals(snapshot);
      })
      .catch(() => undefined);
    const unsubscribe = window.api.onAnkiIntervalsChanged((snapshot) => {
      if (active) setAnkiIntervals(snapshot);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const refresh = (): void => setStudySignalRevision((revision) => revision + 1);
    const unsubLookup = onLookupHistoryChanged(refresh);
    const unsubKnowledge = onKnowledgeChanged(refresh);
    const unsubDeck = onDeckChanged(refresh);
    const unsubSaved = onSavedChanged(refresh);
    const unsubLevelLists = onLevelListsChanged(refresh);
    const clock = window.setInterval(refresh, 60 * 60 * 1000);
    return () => {
      unsubLookup();
      unsubKnowledge();
      unsubDeck();
      unsubSaved();
      unsubLevelLists();
      window.clearInterval(clock);
    };
  }, []);

  useEffect(() => onSubtitleStoreChanged(() => {
    setSubtitleStoreRevision((revision) => revision + 1);
  }), []);

  useEffect(() => onMediaStudyDatabaseChanged(setMediaStudyDatabase), []);

  useEffect(() => onSessionHistoryChanged(() => {
    setGrammarHistory(loadSessionHistory());
  }), []);

  useEffect(() => {
    let active = true;
    void currentStudyReadinessFingerprints()
      .then((fingerprints) => {
        if (active) setReadinessFingerprints(fingerprints);
      })
      .catch(() => {
        if (active) setReadinessFingerprints(null);
      });
    return () => {
      active = false;
    };
  }, [studySignalRevision]);

  useEffect(() => {
    let active = true;
    void initializeStudyOrchestrator()
      .then((next) => {
        if (!active) return;
        setDocument(next);
        setStatus('');
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      });
    const unsubscribe = window.api.onStudyChanged((next) => {
      if (active) setDocument(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const recentAnkiIndex = useMemo(
    () => indexRecentAnkiIntervalEntries(ankiIntervals?.entries ?? []),
    [ankiIntervals],
  );
  const ankiLeechIndex = useMemo(
    () => indexAnkiLeechEntries(ankiIntervals?.entries ?? []),
    [ankiIntervals],
  );
  const opportunities = useMemo(
    () => collectStudyOpportunities(
      document,
      surface.items,
      recentAnkiIndex,
      Date.now(),
      readinessFingerprints ?? undefined,
      mediaStudyDatabase.sessions,
      grammarHistory,
      surface.listeningAvailability,
      surface.playbackRate,
      ankiLeechIndex,
    ),
    [
      document,
      mediaStudyDatabase.sessions,
      grammarHistory,
      readinessFingerprints,
      ankiLeechIndex,
      recentAnkiIndex,
      surface.items,
      surface.listeningAvailability,
      surface.playbackRate,
      studySignalRevision,
      lang,
    ],
  );
  const anchorMediaId = activeMediaId === 'study-lookup-history'
    ? surface.current?.id
    : activeMediaId ?? surface.current?.id;
  const episodeRail = useMemo(() => {
    if (!readinessFingerprints) return [];
    return studyEpisodeReadinessRail(
      surface.items,
      document,
      anchorMediaId,
      readinessFingerprints,
    );
  }, [anchorMediaId, document, readinessFingerprints, surface.items]);
  const subtitleUpgrade = useMemo((): StudySubtitleUpgrade | null => {
    const item = surface.items.find((candidate) => candidate.id === anchorMediaId);
    if (!item) return null;
    const readiness = Object.values(document.readiness)
      .filter((entry) => entry.mediaId === item.id)
      .sort((left, right) => right.generatedAt - left.generatedAt)[0];
    return studySubtitleUpgrade(item, readiness, loadSubtitleProvidersDocument());
  }, [anchorMediaId, document, surface.items, subtitleStoreRevision]);
  const crossTitleGroups = useMemo(
    () => readinessFingerprints
      ? studyCrossTitleReinforcements(surface.items, document, readinessFingerprints)
      : [],
    [document, readinessFingerprints, surface.items],
  );
  const abandonedSetResizes = useMemo(
    () => studyAbandonedSetResizes(document, mediaStudyDatabase.sessions),
    [document, mediaStudyDatabase.sessions],
  );
  const sceneQuickSessions = useMemo(
    () => readinessFingerprints
      ? studySceneQuickSessions(surface.items, document, readinessFingerprints)
      : [],
    [document, readinessFingerprints, surface.items],
  );
  const grammarWeaknessScenes = useMemo(
    () => readinessFingerprints
      ? studyGrammarWeaknessScenes(
        surface.items,
        document,
        readinessFingerprints,
        grammarHistory,
        GRAMMAR,
      )
      : [],
    [document, grammarHistory, readinessFingerprints, surface.items],
  );
  const properNameReviews = useMemo(
    () => readinessFingerprints
      ? studyProperNameReviews(surface.items, document, readinessFingerprints)
      : [],
    [document, readinessFingerprints, surface.items],
  );
  const speechRateChallenges = useMemo(
    () => studySpeechRateChallenges(surface.items, document, surface.playbackRate),
    [document, surface.items, surface.playbackRate],
  );
  const ankiLeechReviews = useMemo(
    () => readinessFingerprints
      ? studyAnkiLeechReviews(
        surface.items,
        document,
        readinessFingerprints,
        ankiLeechIndex,
      )
      : [],
    [ankiLeechIndex, document, readinessFingerprints, surface.items],
  );
  const seriesRecurrenceForecasts = useMemo(
    () => readinessFingerprints
      ? studySeriesRecurrenceForecasts(surface.items, document, readinessFingerprints)
      : [],
    [document, readinessFingerprints, surface.items],
  );
  const staleQueue = useMemo(
    () => currentStudyStaleQueue(document, surface.items),
    [document, surface.items, studySignalRevision],
  );
  // Rank 24. The exported text is derived from the live workspace, and the
  // pasted text is parsed and previewed on every keystroke, so neither side is
  // remembered anywhere and neither can go stale against the workspace it
  // describes. Nothing here writes: applying goes through `applyFilters`.
  const recipeExportText = useMemo(() => {
    if (!workspace) return '';
    const item = surface.items.find((entry) => entry.id === workspace.context.mediaId);
    const title = item ? item.title.trim() || item.fileName.trim() : '';
    return serializeStudyFilterRecipe(createStudyFilterRecipe(workspace.filters, title));
  }, [surface.items, workspace]);
  const recipeCode = useMemo(
    () => (workspace ? studyFilterRecipeCode(workspace.filters) : ''),
    [workspace],
  );
  const recipeParse = useMemo(
    () => (recipeText.trim() ? parseStudyFilterRecipe(recipeText) : null),
    [recipeText],
  );
  const recipePreview = useMemo(
    () => (workspace && recipeParse?.ok
      ? previewStudyFilterRecipe(workspace, recipeParse.recipe)
      : null),
    [recipeParse, workspace],
  );
  // The episode rail can hand you a fresh workspace for the next episode, which
  // starts from the app defaults. If an earlier episode of the same series already
  // carries different filters, offer them here instead of making the user go back
  // and copy the recipe by hand.
  const recipeSource = useMemo(
    () => (workspace ? studyFilterRecipeSource(surface.items, document, workspace) : null),
    [document, surface.items, workspace],
  );
  const activeOpportunity = opportunities.find(
    (opportunity) => opportunity.id === activeOpportunityId,
  ) ?? opportunities.find(
    (opportunity) => !activeMediaId || opportunity.context.mediaId === activeMediaId,
  ) ?? opportunities[0] ?? null;
  const evidenceOpportunity = opportunities.find(
    (opportunity) => opportunity.id === evidenceOpportunityId,
  ) ?? null;
  const comparisonGroup = crossTitleGroups.find((group) => group.id === comparisonGroupId) ?? null;
  const sceneSession = sceneQuickSessions.find((session) => session.id === sceneSessionId) ?? null;
  const grammarWeakness = grammarWeaknessScenes.find(
    (weakness) => weakness.id === grammarWeaknessId,
  ) ?? null;
  const properNameReview = properNameReviews.find(
    (review) => review.id === properNameReviewId,
  ) ?? null;
  const ankiLeechReview = ankiLeechReviews.find(
    (review) => review.id === ankiLeechReviewId,
  ) ?? null;
  const seriesRecurrence = seriesRecurrenceForecasts.find(
    (forecast) => forecast.id === seriesRecurrenceId,
  ) ?? null;
  const resizeWorkspace = resizePreview
    ? document.workspaces[resizePreview.workspaceId]
    : undefined;
  const resizeCandidates = useMemo(() => {
    if (!resizePreview || !resizeWorkspace) return { retained: [], deferred: [] };
    const byId = new Map(resizeWorkspace.candidates.map((candidate) => [candidate.id, candidate]));
    return {
      retained: resizePreview.retainedCandidateIds.flatMap((id) => {
        const candidate = byId.get(id);
        return candidate ? [candidate] : [];
      }),
      deferred: resizePreview.deferredCandidateIds.flatMap((id) => {
        const candidate = byId.get(id);
        return candidate ? [candidate] : [];
      }),
    };
  }, [resizePreview, resizeWorkspace]);

  useEffect(() => {
    if (!activeOpportunity) {
      setActiveOpportunityId(undefined);
      setEvidenceOpportunityId(undefined);
      return;
    }
    if (activeOpportunityId !== activeOpportunity.id) setActiveOpportunityId(activeOpportunity.id);
    if (activeMediaId !== activeOpportunity.context.mediaId) {
      setActiveMediaId(activeOpportunity.context.mediaId);
    }
  }, [activeMediaId, activeOpportunity, activeOpportunityId]);

  useEffect(() => {
    void window.api.studySyncOpportunities(opportunities, true).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  }, [opportunities]);

  useEffect(() => {
    const next = newestWorkspace(document, activeMediaId);
    setWorkspace(next);
    setCardPreview(null);
    setAnkiPreview(null);
  }, [activeMediaId, document]);

  useEffect(() => {
    setPageOffset(0);
  }, [workspace?.id]);

  useEffect(() => {
    if (!workspace) {
      setPage([]);
      setPageInfo({ total: 0, selected: 0 });
      setPageLoading(false);
      return;
    }
    let active = true;
    setPageLoading(true);
    void window.api.studyWorkspacePage(workspace.id, pageOffset, VOCABULARY_PAGE_SIZE)
      .then((result) => {
        if (!active) return;
        if (pageOffset >= result.total && result.total > 0) {
          setPageOffset(Math.floor((result.total - 1) / VOCABULARY_PAGE_SIZE) * VOCABULARY_PAGE_SIZE);
          return;
        }
        setPage(result.items);
        setPageInfo({ total: result.total, selected: result.selected });
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setPageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [pageOffset, workspace]);

  const openContext = async (context: StudyContextRef): Promise<void> => {
    if (context.sourceKind === 'lookup-history') {
      const query = context.sentence?.trim();
      if (query) {
        window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query } }));
      }
      return;
    }
    const item = surface.items.find((candidate) => candidate.id === context.mediaId);
    if (!item) throw new Error('The source media is no longer in the library.');
    setHandoffJson('studyContextRef', context);
    window.dispatchEvent(new CustomEvent('os:open', { detail: 'video' }));
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('study:open-media-context', { detail: context }));
    }, 80);
  };

  const actOnEpisodeReadiness = async (entry: StudyEpisodeReadinessEntry): Promise<void> => {
    if (entry.state !== 'ready') {
      await prepareMedia(entry.mediaId);
      return;
    }
    const item = surface.items.find((candidate) => candidate.id === entry.mediaId);
    await openContext({
      mediaId: entry.mediaId,
      episode: entry.episode,
      subtitleRecordId: entry.subtitleRecordId,
      returnTarget: {
        section: 'video',
        mediaId: entry.mediaId,
        subtitleRecordId: entry.subtitleRecordId,
        positionSec: item?.positionSec ?? 0,
      },
    });
  };

  const applySubtitleUpgrade = async (upgrade: StudySubtitleUpgrade): Promise<void> => {
    setBusy(true);
    setError('');
    setStatus(t('study.subtitleUpgrade.refreshing', {
      track: upgrade.candidateRecord.label
        ?? upgrade.candidateTrack.title
        ?? t('study.subtitleUpgrade.betterTrack'),
    }));
    try {
      const result = await prepareStudyMediaById(
        upgrade.mediaId,
        upgrade.candidateRecord.id,
      );
      if (result.status !== 'prepared') {
        throw new Error(t('study.subtitleUpgrade.failed'));
      }
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      setWorkspace(nextDocument.workspaces[result.workspaceId] ?? null);
      setStatus(t('study.subtitleUpgrade.refreshed', {
        before: upgrade.currentScore,
        after: upgrade.candidateScore,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const openCrossTitleContext = async (context: StudyCrossTitleContext): Promise<void> => {
    await openContext({
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
    });
  };

  const startCrossTitleComparison = (opportunity: StudyOpportunity): void => {
    const group = crossTitleGroups.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!group) {
      setError(t('study.crossTitle.stale'));
      return;
    }
    setComparisonGroupId(group.id);
    setStatus(t('study.crossTitle.previewStatus', {
      word: group.word,
      count: group.titleCount,
    }));
    window.requestAnimationFrame(() => comparisonRef.current?.focus());
  };

  const previewSetResize = (opportunity: StudyOpportunity): void => {
    const resize = abandonedSetResizes.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!resize) {
      setError(t('study.resize.stale'));
      return;
    }
    setResizePreview(resize);
    setResizeApplied(false);
    setStatus(t('study.resize.previewStatus', { count: resize.proposedSize }));
    window.requestAnimationFrame(() => resizeRef.current?.focus());
  };

  const previewSceneSession = (opportunity: StudyOpportunity): void => {
    const session = sceneQuickSessions.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!session) {
      setError(t('study.sceneSession.stale'));
      return;
    }
    setSceneSessionId(session.id);
    setStatus(t('study.sceneSession.previewStatus', {
      from: cueTime(session.startSec),
      to: cueTime(session.endSec),
      title: session.title,
    }));
    window.requestAnimationFrame(() => sceneSessionRef.current?.focus());
  };

  const startSceneSession = async (session: StudySceneQuickSession): Promise<void> => {
    setError('');
    setStatus(t('study.sceneSession.opening', {
      count: Math.ceil(session.durationSec / 60),
      title: session.title,
    }));
    await openContext({
      mediaId: session.mediaId,
      episode: session.episode,
      subtitleRecordId: session.subtitleRecordId,
      cueStartSec: session.startSec,
      cueEndSec: session.endSec,
      sentence: session.words[0]?.sentence,
      returnTarget: {
        section: 'video',
        mediaId: session.mediaId,
        subtitleRecordId: session.subtitleRecordId,
        positionSec: session.startSec,
      },
    });
  };

  const openGrammarWeaknessContext = async (
    context: StudyGrammarWeaknessContext,
  ): Promise<void> => {
    await openContext({
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
    });
  };

  const previewGrammarWeakness = (opportunity: StudyOpportunity): void => {
    const weakness = grammarWeaknessScenes.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!weakness) {
      setError(t('study.grammarWeakness.stale'));
      return;
    }
    setGrammarWeaknessId(weakness.id);
    setStatus(t('study.grammarWeakness.previewStatus', { pattern: weakness.pattern }));
    window.requestAnimationFrame(() => grammarWeaknessRef.current?.focus());
  };

  const practiceGrammarWeakness = (pointId: string, pattern: string, level: string): void => {
    // Handoff-backed, so a cold `GrammarView` still receives it — the
    // `setTimeout(80)` this replaces missed the mount by ~600 ms on first use
    // in a session and the link was delivered to nobody (audit F22). The
    // `pointId` drop downstream is tested design, not a defect
    // (`grammarPracticeDeepLink.test.ts:5-16`), so it is still passed.
    openGrammarPractice({ lang: 'ja', level, query: pattern, pointId });
  };

  const previewProperNames = (opportunity: StudyOpportunity): void => {
    const review = properNameReviews.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!review) {
      setError(t('study.properNames.stale'));
      return;
    }
    setProperNameReviewId(review.id);
    setProperNameFilterApplied(false);
    setStatus(t('study.properNames.previewStatus', {
      count: review.totalNames,
      title: review.title,
    }));
    window.requestAnimationFrame(() => properNamesRef.current?.focus());
  };

  const previewAnkiLeech = (opportunity: StudyOpportunity): void => {
    const review = ankiLeechReviews.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!review) {
      setError(t('study.ankiLeech.stale'));
      return;
    }
    setAnkiLeechReviewId(review.id);
    setStatus(t('study.ankiLeech.previewStatus', {
      count: review.totalMatches,
      title: review.title,
    }));
    window.requestAnimationFrame(() => ankiLeechRef.current?.focus());
  };

  const previewSeriesRecurrence = (opportunity: StudyOpportunity): void => {
    const forecast = seriesRecurrenceForecasts.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!forecast) {
      setError(t('study.seriesRecurrence.stale'));
      return;
    }
    setSeriesRecurrenceId(forecast.id);
    setStatus(t('study.seriesRecurrence.previewStatus', {
      count: forecast.totalRecurringLemmas,
      title: forecast.seriesTitle,
    }));
    window.requestAnimationFrame(() => seriesRecurrenceRef.current?.focus());
  };

  const previewSpeechRate = (opportunity: StudyOpportunity): void => {
    const challenge = speechRateChallenges.find((candidate) =>
      candidate.opportunityId === opportunity.id);
    if (!challenge) {
      setError(t('study.speechRate.stale'));
      return;
    }
    setSpeechRatePreview(challenge);
    setSpeechRateUndo(null);
    setStatus(t('study.speechRate.previewStatus', { title: challenge.title }));
  };

  const applySpeechRate = (challenge: StudySpeechRateChallenge): void => {
    const previous = surface.playbackRate;
    surface.setPlaybackRate(challenge.recommendedPlaybackRate);
    setSpeechRateUndo(previous);
    setStatus(t('study.speechRate.applied', {
      rate: playbackRateLabel(challenge.recommendedPlaybackRate),
    }));
  };

  const restoreSpeechRate = (): void => {
    if (speechRateUndo == null) return;
    surface.setPlaybackRate(speechRateUndo);
    setStatus(t('study.speechRate.restored', {
      rate: playbackRateLabel(speechRateUndo),
    }));
    setSpeechRateUndo(null);
  };

  const closeSpeechRatePreview = (): void => {
    if (speechRateUndo != null) {
      surface.setPlaybackRate(speechRateUndo);
      setStatus(t('study.speechRate.restored', {
        rate: playbackRateLabel(speechRateUndo),
      }));
    }
    setSpeechRateUndo(null);
    setSpeechRatePreview(null);
  };

  const openProperNameContext = async (
    review: StudyProperNameReview,
    entry: StudyProperNameEntry,
  ): Promise<void> => {
    await openContext({
      mediaId: review.mediaId,
      episode: review.episode,
      subtitleRecordId: review.subtitleRecordId,
      cueStartSec: entry.cueStartSec,
      sentence: entry.sentence,
      returnTarget: {
        section: 'video',
        mediaId: review.mediaId,
        subtitleRecordId: review.subtitleRecordId,
        positionSec: entry.cueStartSec,
      },
    });
  };

  const openAnkiLeechContext = async (
    review: StudyAnkiLeechReview,
    entry: StudyAnkiLeechContext,
  ): Promise<void> => {
    await openContext({
      mediaId: review.mediaId,
      episode: review.episode,
      subtitleRecordId: review.subtitleRecordId,
      cueStartSec: entry.cueStartSec,
      sentence: entry.sentence,
      returnTarget: {
        section: 'video',
        mediaId: review.mediaId,
        subtitleRecordId: review.subtitleRecordId,
        positionSec: entry.cueStartSec,
      },
    });
  };

  const openSeriesRecurrenceCurrent = async (
    forecast: StudySeriesRecurrenceForecast,
    lemma: StudySeriesRecurrenceLemma,
  ): Promise<void> => {
    await openContext({
      mediaId: forecast.mediaId,
      episode: forecast.episode,
      subtitleRecordId: forecast.subtitleRecordId,
      cueStartSec: lemma.currentCueStartSec,
      sentence: lemma.currentSentence,
      returnTarget: {
        section: 'video',
        mediaId: forecast.mediaId,
        subtitleRecordId: forecast.subtitleRecordId,
        positionSec: lemma.currentCueStartSec,
      },
    });
  };

  const openSeriesRecurrenceFuture = async (
    context: StudySeriesRecurrenceContext,
  ): Promise<void> => {
    await openContext({
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
    });
  };

  /**
   * The only workspace write this slice can make. It flips one existing filter
   * through the existing reversible history, so `Undo` below is the same undo
   * every other filter change already has.
   */
  const excludeProperNames = async (review: StudyProperNameReview): Promise<void> => {
    if (!properNameReviewStillCurrent(review, document)) {
      setError(t('study.properNames.changed'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const nextWorkspace = await window.api.studyApplyFilters(review.workspaceId, {
        excludeProperNouns: true,
      });
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      if (workspace?.id === nextWorkspace.id) setWorkspace(nextWorkspace);
      setProperNameFilterApplied(true);
      setStatus(t('study.properNames.applied', {
        count: nextWorkspace.selectionIds.length,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const undoProperNameFilter = async (review: StudyProperNameReview): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const nextWorkspace = await window.api.studyUndoFilter(review.workspaceId);
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      if (workspace?.id === nextWorkspace.id) setWorkspace(nextWorkspace);
      setProperNameFilterApplied(false);
      setStatus(t('study.properNames.undone', {
        count: nextWorkspace.selectionIds.length,
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const previewQueueCleanup = (opportunity: StudyOpportunity): void => {
    if (!staleQueue || staleQueue.opportunityId !== opportunity.id) {
      setError(t('study.cleanup.stale'));
      return;
    }
    setCleanupPreview(staleQueue);
    setCleanupUndo(null);
    setStatus(t('study.cleanup.previewStatus', { count: staleQueue.items.length }));
    window.requestAnimationFrame(() => cleanupRef.current?.focus());
  };

  const applyQueueCleanup = async (cleanup: StudyStaleQueueCleanup): Promise<void> => {
    if (!staleQueueItemsStillValid(cleanup, document)) {
      setError(t('study.cleanup.changed'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const restore: Array<{
        opportunityId: string;
        status: 'active' | 'snoozed';
        snoozedUntil?: number;
      }> = [];
      let next = document;
      try {
        for (const entry of cleanup.items) {
          const previous = document.opportunities[entry.opportunityId];
          next = await window.api.studySetOpportunityStatus(entry.opportunityId, 'dismissed');
          restore.push({
            opportunityId: entry.opportunityId,
            status: previous?.status === 'snoozed' ? 'snoozed' : 'active',
            snoozedUntil: previous?.snoozedUntil,
          });
        }
      } finally {
        // Whatever was retired before an interruption stays undoable.
        setDocument(next);
        if (restore.length) setCleanupUndo(restore);
      }
      setStatus(t('study.cleanup.applied', { count: cleanup.items.length }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const undoQueueCleanup = async (): Promise<void> => {
    if (!cleanupUndo?.length) return;
    setBusy(true);
    setError('');
    try {
      let next = document;
      for (const entry of cleanupUndo) {
        next = await window.api.studySetOpportunityStatus(
          entry.opportunityId,
          entry.status,
          entry.status === 'snoozed' ? entry.snoozedUntil : undefined,
        );
      }
      setDocument(next);
      setCleanupUndo(null);
      setStatus(t('study.cleanup.undone'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const applySetResize = async (resize: StudyAbandonedSetResize): Promise<void> => {
    const current = document.workspaces[resize.workspaceId];
    if (!current || current.selectionIds.length !== resize.currentSize) {
      setError(t('study.resize.changed'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const nextWorkspace = await window.api.studyApplyFilters(resize.workspaceId, {
        maximumCards: resize.proposedSize,
      });
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      if (workspace?.id === nextWorkspace.id) setWorkspace(nextWorkspace);
      setResizeApplied(true);
      setStatus(t('study.resize.applied', { count: nextWorkspace.selectionIds.length }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const undoSetResize = async (resize: StudyAbandonedSetResize): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      const nextWorkspace = await window.api.studyUndoFilter(resize.workspaceId);
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      if (workspace?.id === nextWorkspace.id) setWorkspace(nextWorkspace);
      setResizeApplied(false);
      setStatus(t('study.resize.undone', { count: nextWorkspace.selectionIds.length }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const revealEvidence = (opportunity: StudyOpportunity): void => {
    setActiveOpportunityId(opportunity.id);
    setActiveMediaId(opportunity.context.mediaId);
    setEvidenceOpportunityId(opportunity.id);
    window.requestAnimationFrame(() => evidenceRef.current?.focus());
  };

  const changeOpportunityStatus = async (
    opportunity: StudyOpportunity,
    nextStatus: 'dismissed' | 'snoozed',
  ): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await window.api.studySyncOpportunities([opportunity]);
      const next = await window.api.studySetOpportunityStatus(
        opportunity.id,
        nextStatus,
        nextStatus === 'snoozed' ? Date.now() + 7 * 86_400_000 : undefined,
      );
      setDocument(next);
      setLastOpportunityChange({ opportunity, status: nextStatus });
      setEvidenceOpportunityId(undefined);
      setStatus(nextStatus === 'snoozed'
        ? t('study.opportunity.snoozed')
        : t('study.opportunity.dismissed'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const undoOpportunityChange = async (): Promise<void> => {
    if (!lastOpportunityChange) return;
    setBusy(true);
    setError('');
    try {
      await window.api.studySyncOpportunities([lastOpportunityChange.opportunity]);
      const next = await window.api.studySetOpportunityStatus(
        lastOpportunityChange.opportunity.id,
        'active',
      );
      setDocument(next);
      setActiveOpportunityId(lastOpportunityChange.opportunity.id);
      setActiveMediaId(lastOpportunityChange.opportunity.context.mediaId);
      setStatus(t('study.opportunity.restored'));
      setLastOpportunityChange(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const handler = (event: Event): void => {
      const context = (event as CustomEvent<StudyContextRef>).detail;
      if (context?.mediaId) void openContext(context).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : String(reason));
      });
    };
    window.addEventListener('study:open-context', handler);
    return () => window.removeEventListener('study:open-context', handler);
  });

  const prepareMedia = useCallback(async (mediaId: string): Promise<void> => {
    const item = surface.items.find((candidate) => candidate.id === mediaId);
    if (!item) return;
    setActiveMediaId(mediaId);
    setError('');
    pendingPrepare.current = mediaId;
    setBusy(true);
    setStatus(selectJapaneseStudySubtitle(item.subtitles)
      ? t('study.prepare.analyzing')
      : t('study.prepare.queued'));
    try {
      const result = await prepareStudyMediaById(mediaId);
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      if (result.status === 'queued-transcription') {
        setStatus(t('study.prepare.transcriptionQueued'));
        return;
      }
      pendingPrepare.current = null;
      const nextWorkspace = nextDocument.workspaces[result.workspaceId] ?? null;
      setWorkspace(nextWorkspace);
      setStatus(t('study.prepare.prepared', { count: result.candidateCount }));
      setBusy(false);
    } catch (reason) {
      pendingPrepare.current = null;
      setBusy(false);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [surface.items]);

  const prepareLookupPack = async (): Promise<void> => {
    setBusy(true);
    setError('');
    setStatus(t('study.prepare.buildingPack'));
    try {
      const nextWorkspace = await prepareRepeatedLookupPack();
      const nextDocument = await window.api.studyGet();
      setDocument(nextDocument);
      setWorkspace(nextWorkspace);
      setActiveMediaId(nextWorkspace.context.mediaId);
      setStatus(t('study.prepare.packPrepared', { count: nextWorkspace.candidates.length }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => window.api.onTranscriptionProgress((progress) => {
    if (pendingPrepare.current !== progress.mediaId) return;
    if (progress.phase === 'done') {
      setStatus(t('study.prepare.subtitlesSaved'));
      void prepareMedia(progress.mediaId);
      return;
    }
    if (progress.phase === 'cancelled' || progress.phase === 'error') {
      pendingPrepare.current = null;
      setBusy(false);
      setStatus('');
      setError(progress.phase === 'cancelled'
        ? t('study.prepare.transcriptionCancelled')
        : progress.error || t('study.prepare.transcriptionFailed'));
      return;
    }
    const progressText = progress.total > 0
      ? ` · ${t('study.prepare.segments', {
        done: Math.min(progress.done, progress.total),
        total: progress.total,
      })}`
      : '';
    setBusy(true);
    setStatus(`${progress.phase.replaceAll('-', ' ')}${progressText}`);
  }), [prepareMedia]);

  useEffect(() => {
    const handler = (event: Event): void => {
      const mediaId = (event as CustomEvent<{ mediaId?: string }>).detail?.mediaId;
      if (mediaId) void prepareMedia(mediaId);
    };
    window.addEventListener('study:prepare-media', handler);
    return () => window.removeEventListener('study:prepare-media', handler);
  });

  const applyFilters = async (patch: Partial<StudyVocabularyFilters>) => {
    if (!workspace) return;
    setBusy(true);
    setError('');
    try {
      const next = await window.api.studyApplyFilters(workspace.id, patch);
      setWorkspace(next);
      setStatus(t('study.filter.remaining', { count: next.selectionIds.length }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const undoFilter = async (): Promise<void> => {
    if (!workspace) return;
    setWorkspace(await window.api.studyUndoFilter(workspace.id));
    setStatus(t('study.filter.undone'));
  };

  const copyRecipe = async (): Promise<void> => {
    if (!recipeExportText) return;
    try {
      await navigator.clipboard.writeText(recipeExportText);
      setRecipeNotice(t('study.recipe.copied', { code: recipeCode }));
    } catch {
      // The text is already on screen and selectable, so a blocked clipboard is
      // an inconvenience rather than a dead end.
      setRecipeNotice(t('study.recipe.copyFailed'));
    }
  };

  /**
   * Applies a pasted recipe through the one existing filter operation, so it
   * lands as a single reversible entry in the workspace's own history — the same
   * `Undo filter` control reverses it.
   */
  const applyRecipe = async (): Promise<void> => {
    if (!workspace || !recipeParse?.ok || !recipePreview) return;
    const { added, removed, selectedAfter } = recipePreview;
    await applyFilters(recipeParse.recipe.filters);
    setRecipeNotice(t('study.recipe.applied', { count: selectedAfter, added, removed }));
  };

  const runCommand = async (): Promise<void> => {
    const text = command.trim().toLocaleLowerCase();
    if (!text || !workspace) return;
    setBusy(true);
    setError('');
    try {
      const handlers = createStudyAgentHandlers();
      let result: unknown;
      if (/remove|exclude/.test(text) && text.includes('n5') && text.includes('n4')) {
        result = await handlers['study.filter-vocabulary']?.({
          workspaceId: workspace.id,
          excludedJlptLevels: ['N5', 'N4'],
        });
      } else if (text.includes('undo')) {
        result = await handlers['study.undo-filter']?.({ workspaceId: workspace.id });
      } else if (text.includes('anki') && /preview|show|check/.test(text)) {
        result = await handlers['study.preview-anki']?.({ workspaceId: workspace.id });
        setAnkiPreview(result as StudyAnkiPreview);
      } else if (/preview|show|check/.test(text) && text.includes('card')) {
        result = await handlers['study.preview-cards']?.({ workspaceId: workspace.id });
        setCardPreview(result as StudyCardPreview);
      } else {
        throw new Error('Try “Remove N5 and N4 words”, “Undo filter”, or “Preview Anki”.');
      }
      setWorkspace(newestWorkspace(await window.api.studyGet(), workspace.context.mediaId));
      setStatus(typeof result === 'object' ? 'Study command completed through a typed operation.' : String(result));
      setCommand('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const activeReadiness = workspace ? document.readiness[workspace.readinessId] : undefined;
  const coverage = workspace ? workspaceCoverage(document, workspace) : null;
  const isLookupPack = workspace?.context.sourceKind === 'lookup-history';
  const activeJob = jobForWorkspace(document, workspace?.id, activeMediaId);
  const activeTranscriptionStage = activeJob?.stages.find((stage) =>
    stage.id === 'subtitles' && stage.childJobId === `transcription:${activeJob.mediaId}`);
  const activeTranscriptionMediaId = activeTranscriptionStage ? activeJob?.mediaId : undefined;
  const selected = new Set(workspace?.selectionIds ?? []);
  const resumeOpportunity = opportunities.find((entry) => entry.type === 'continue-session')
    ?? opportunities.find((entry) => entry.type === 'prepared-unwatched');
  const productionStages: Array<{
    id: string;
    label: string;
    status: StudyPipelineStage['status'];
    updatedAt: number;
    detail?: string;
    detailKey?: string;
    detailVars?: Record<string, string | number>;
    progress?: number;
    error?: string;
    childJobId?: string;
  }> = isLookupPack ? [
    {
      id: 'lookup-history',
      label: t('study.stage.lookupHistory'),
      status: 'complete' as const,
      detail: t('study.stage.lookupHistoryDetail', { count: workspace?.candidates.length ?? 0 }),
      updatedAt: workspace?.updatedAt ?? 0,
    },
    {
      id: 'lookup-comparison',
      label: t('study.stage.comparison'),
      status: 'complete' as const,
      detail: t('study.rail.lookupPackDetail'),
      updatedAt: workspace?.updatedAt ?? 0,
    },
    {
      id: 'lookup-workspace',
      label: t('study.stage.lookupWorkspace'),
      status: 'complete' as const,
      detail: t('study.candidates.selectedCount', { count: workspace?.selectionIds.length ?? 0 }),
      updatedAt: workspace?.updatedAt ?? 0,
    },
  ] : (activeJob?.stages ?? [
    { id: 'media', label: t('study.stage.media'), status: 'waiting' as const, updatedAt: 0 },
    { id: 'subtitles', label: t('study.stage.subtitles'), status: 'waiting' as const, updatedAt: 0 },
    { id: 'analysis', label: t('study.stage.analysis'), status: 'waiting' as const, updatedAt: 0 },
    { id: 'comparison', label: t('study.stage.comparison'), status: 'waiting' as const, updatedAt: 0 },
    { id: 'filtering', label: t('study.stage.filtering'), status: 'waiting' as const, updatedAt: 0 },
    { id: 'cards', label: t('study.stage.cards'), status: 'waiting' as const, updatedAt: 0 },
    { id: 'anki', label: t('study.stage.anki'), status: 'waiting' as const, updatedAt: 0 },
  ]);

  return (
    <div className="study-orchestrator">
      {resumeOpportunity && (
        <button
          type="button"
          className="study-resume-strip"
          onClick={() => void openContext(resumeOpportunity.context)}
        >
          <Icon name="player" size={15} />
          <span>
            <strong>{opportunityTitle(resumeOpportunity, t)}</strong>
            <small>{opportunityExplanation(resumeOpportunity, t)}</small>
          </span>
          <em>
            {resumeOpportunity.type === 'prepared-unwatched'
              ? t('study.opportunity.watchNow')
              : t('study.opportunity.resume')}
          </em>
        </button>
      )}

      {activeOpportunity ? (
        <section className="study-next" aria-labelledby="study-next-title">
          {activeOpportunity.type === 'stale-queue-cleanup' ? (
            <div className="study-next-art study-next-lookup-art" aria-hidden="true">
              <Icon name="scan" size={96} />
            </div>
          ) : activeOpportunity.context.sourceKind === 'lookup-history' ? (
            <div className="study-next-art study-next-lookup-art" aria-hidden="true">
              <Icon name="dictionary" size={96} />
            </div>
          ) : (
            <MediaArtwork
              id={activeOpportunity.context.mediaId}
              title={activeOpportunity.title}
              variant="banner"
              ratio="16 / 7"
              className="study-next-art"
              // Backdrop for a section already named by `study-next-title`; the
              // two sibling branches of this ternary are `aria-hidden` icons for
              // the same reason. (Required prop — slice 68.)
              decorative
            />
          )}
          <div className="study-next-shade" />
          <div className="study-next-copy">
            <span className="mc-eyebrow">{t('study.next.eyebrow')}</span>
            <h2 id="study-next-title">{opportunityTitle(activeOpportunity, t)}</h2>
            <p>{opportunityExplanation(activeOpportunity, t)}</p>
            <div className="study-evidence">
              {activeOpportunity.evidence.slice(0, 4).map((evidence) => (
                <span key={evidence.code}>{evidenceLabel(evidence, t)}</span>
              ))}
            </div>
            <div className="study-next-actions">
              <button
                type="button"
                className="mc-button mc-button-primary"
                disabled={busy}
                onClick={() => {
                  if (activeOpportunity.actions.includes('build-lookup-pack')) {
                    void prepareLookupPack();
                  } else if (activeOpportunity.type === 'cross-title-reinforcement') {
                    startCrossTitleComparison(activeOpportunity);
                  } else if (activeOpportunity.type === 'abandoned-set-resize') {
                    previewSetResize(activeOpportunity);
                  } else if (activeOpportunity.type === 'scene-quick-session') {
                    previewSceneSession(activeOpportunity);
                  } else if (activeOpportunity.type === 'grammar-weakness-scenes') {
                    previewGrammarWeakness(activeOpportunity);
                  } else if (activeOpportunity.type === 'proper-name-review') {
                    previewProperNames(activeOpportunity);
                  } else if (activeOpportunity.type === 'speech-rate-challenge') {
                    previewSpeechRate(activeOpportunity);
                  } else if (activeOpportunity.type === 'anki-leech-context') {
                    previewAnkiLeech(activeOpportunity);
                  } else if (activeOpportunity.type === 'series-recurrence-forecast') {
                    previewSeriesRecurrence(activeOpportunity);
                  } else if (activeOpportunity.type === 'stale-queue-cleanup') {
                    previewQueueCleanup(activeOpportunity);
                  } else if (activeOpportunity.type === 'repeated-lookups') {
                    setActiveMediaId(activeOpportunity.context.mediaId);
                  } else if (activeOpportunity.actions.includes('resume')) {
                    void openContext(activeOpportunity.context);
                  } else if (activeOpportunity.actions.includes('open-context') && !activeOpportunity.actions.includes('prepare')) {
                    void openContext(activeOpportunity.context);
                  } else {
                    void prepareMedia(activeOpportunity.context.mediaId);
                  }
                }}
              >
                {nextActionLabel(activeOpportunity, t)}
              </button>
              <button
                type="button"
                className="mc-button"
                aria-controls="study-opportunity-evidence"
                aria-expanded={evidenceOpportunityId === activeOpportunity.id}
                onClick={() => revealEvidence(activeOpportunity)}
              >
                {t('study.opportunity.why')}
              </button>
              <button
                type="button"
                className="mc-button"
                disabled={busy}
                onClick={() => void changeOpportunityStatus(activeOpportunity, 'snoozed')}
              >
                {t('study.opportunity.snooze')}
              </button>
              <button
                type="button"
                className="mc-button"
                disabled={busy}
                onClick={() => void changeOpportunityStatus(activeOpportunity, 'dismissed')}
              >
                {t('study.opportunity.dismiss')}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="study-empty-state">
          <Icon name="sparkle" size={24} />
          <div>
            <strong>{t('study.empty.heading')}</strong>
            <p>{t('study.empty.body')}</p>
          </div>
          <button type="button" className="mc-button mc-button-primary" onClick={() => void surface.openFile()}>
            {t('study.empty.addMedia')}
          </button>
        </section>
      )}

      {opportunities.length > 0 && (
        <nav className="study-opportunity-stream" aria-label={t('study.stream.label')}>
          <div className="study-section-heading">
            <div>
              <span className="mc-eyebrow">{t('study.stream.eyebrow')}</span>
              <h2>{t('study.stream.heading')}</h2>
            </div>
            <small>{t('study.stream.available', { count: opportunities.length })}</small>
          </div>
          <div className="study-opportunity-list">
            {opportunities.slice(0, 8).map((opportunity, index) => (
              <button
                type="button"
                key={opportunity.id}
                className={opportunity.id === activeOpportunity?.id ? 'is-active' : ''}
                aria-current={opportunity.id === activeOpportunity?.id ? 'true' : undefined}
                onClick={() => {
                  setActiveOpportunityId(opportunity.id);
                  setActiveMediaId(opportunity.context.mediaId);
                  setEvidenceOpportunityId(undefined);
                  setComparisonGroupId(
                    opportunity.type === 'cross-title-reinforcement'
                      ? crossTitleGroups.find((group) =>
                        group.opportunityId === opportunity.id)?.id ?? null
                      : null,
                  );
                  if (opportunity.type === 'abandoned-set-resize') {
                    const resize = abandonedSetResizes.find((candidate) =>
                      candidate.opportunityId === opportunity.id);
                    setResizePreview(resize ?? null);
                    setResizeApplied(false);
                  } else {
                    setResizePreview(null);
                    setResizeApplied(false);
                  }
                  setSceneSessionId(
                    opportunity.type === 'scene-quick-session'
                      ? sceneQuickSessions.find((session) =>
                        session.opportunityId === opportunity.id)?.id ?? null
                      : null,
                  );
                  setGrammarWeaknessId(
                    opportunity.type === 'grammar-weakness-scenes'
                      ? grammarWeaknessScenes.find((weakness) =>
                        weakness.opportunityId === opportunity.id)?.id ?? null
                      : null,
                  );
                  setProperNameReviewId(
                    opportunity.type === 'proper-name-review'
                      ? properNameReviews.find((review) =>
                        review.opportunityId === opportunity.id)?.id ?? null
                      : null,
                  );
                  setProperNameFilterApplied(false);
                  setAnkiLeechReviewId(
                    opportunity.type === 'anki-leech-context'
                      ? ankiLeechReviews.find((review) =>
                        review.opportunityId === opportunity.id)?.id ?? null
                      : null,
                  );
                  setSeriesRecurrenceId(
                    opportunity.type === 'series-recurrence-forecast'
                      ? seriesRecurrenceForecasts.find((forecast) =>
                        forecast.opportunityId === opportunity.id)?.id ?? null
                      : null,
                  );
                  if (opportunity.type === 'speech-rate-challenge') {
                    const challenge = speechRateChallenges.find((candidate) =>
                      candidate.opportunityId === opportunity.id);
                    setSpeechRatePreview(challenge ?? null);
                    setSpeechRateUndo(null);
                  } else if (speechRateUndo == null) {
                    setSpeechRatePreview(null);
                  }
                  if (opportunity.type === 'stale-queue-cleanup') {
                    setCleanupPreview(
                      staleQueue?.opportunityId === opportunity.id ? staleQueue : null,
                    );
                    setCleanupUndo(null);
                  } else if (!cleanupUndo) {
                    setCleanupPreview(null);
                  }
                }}
              >
                <span className="study-opportunity-rank">{String(index + 1).padStart(2, '0')}</span>
                <span>
                  <strong>{opportunityTitle(opportunity, t)}</strong>
                  <small>
                    {opportunity.evidence[0]
                      ? evidenceLabel(opportunity.evidence[0], t)
                      : opportunityExplanation(opportunity, t)}
                  </small>
                </span>
                <em>{opportunity.estimatedMinutes} min</em>
              </button>
            ))}
          </div>
        </nav>
      )}

      {comparisonGroup && (
        <section
          className="study-cross-title-session"
          aria-labelledby="study-cross-title-title"
          ref={comparisonRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.crossTitle.eyebrow')}</span>
              <h2 id="study-cross-title-title">
                <ruby>{comparisonGroup.word}<rt>{comparisonGroup.reading}</rt></ruby>
                <span>{t('study.crossTitle.acrossTitles', { count: comparisonGroup.titleCount })}</span>
              </h2>
              <p>{t('study.crossTitle.body')}</p>
            </div>
            <div className="study-cross-title-summary">
              <span>
                <strong>{comparisonGroup.titleCount}</strong>
                <small>{t('study.crossTitle.titlesLabel')}</small>
              </span>
              <span>
                <strong>{comparisonGroup.totalOccurrences}</strong>
                <small>{t('study.crossTitle.occurrencesLabel')}</small>
              </span>
              {comparisonGroup.frequencyRank && (
                <span>
                  <strong>#{comparisonGroup.frequencyRank}</strong>
                  <small>{t('study.crossTitle.frequencyLabel')}</small>
                </span>
              )}
              <button
                type="button"
                aria-label={t('study.crossTitle.close')}
                onClick={() => setComparisonGroupId(null)}
              >
                <Icon name="close" size={13} />
              </button>
            </div>
          </header>
          <div className="study-cross-title-contexts">
            {comparisonGroup.contexts.map((context, index) => (
              <article key={context.titleIdentity}>
                <div className="study-cross-title-context-heading">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{context.title}</strong>
                    <small>
                      {context.episode != null
                        ? `${t('study.crossTitle.episode', { episode: context.episode })} · `
                        : ''}
                      {t('study.crossTitle.appearances', { count: context.occurrences })}
                    </small>
                  </div>
                </div>
                <blockquote lang="ja">{context.sentence}</blockquote>
                <button
                  type="button"
                  className="mc-button"
                  onClick={() => void openCrossTitleContext(context).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : String(reason));
                  })}
                >
                  <Icon name="player" size={13} />
                  {t('study.crossTitle.openAt', { time: cueTime(context.cueStartSec) })}
                </button>
              </article>
            ))}
          </div>
          <footer>
            <Icon name="check" size={12} />
            <span>{t('study.crossTitle.footer')}</span>
          </footer>
        </section>
      )}

      {resizePreview && resizeWorkspace && (
        <section
          className="study-set-resize"
          aria-labelledby="study-set-resize-title"
          ref={resizeRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.resize.eyebrow')}</span>
              <div className="study-set-resize-title-row">
                <h2 id="study-set-resize-title">{t('study.resize.heading')}</h2>
                <button
                  type="button"
                  aria-label={t('study.resize.close')}
                  onClick={() => {
                    setResizePreview(null);
                    setResizeApplied(false);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>
                {t('study.resize.evidence', {
                  sessions: resizePreview.abandonedSessions,
                  candidates: resizePreview.analyzedCandidateFloor,
                })}
              </p>
            </div>
          </header>
          <div
            className="study-set-resize-scale"
            aria-label={t('study.resize.scaleLabel', {
              from: resizePreview.currentSize,
              to: resizePreview.proposedSize,
            })}
          >
            <span>
              <small>{t('study.resize.currentSet')}</small>
              <strong>{resizePreview.currentSize}</strong>
              <em>{t('study.rail.words')}</em>
            </span>
            <Icon name="chevron" size={17} />
            <span className="is-proposed">
              <small>{t('study.resize.suggestedSet')}</small>
              <strong>{resizePreview.proposedSize}</strong>
              <em>{t('study.rail.words')}</em>
            </span>
          </div>
          <div className="study-set-resize-preview">
            <div>
              <strong>{t('study.resize.keptHeading')}</strong>
              <small>{t('study.resize.keptDetail')}</small>
              <ul>
                {resizeCandidates.retained.slice(0, 6).map((candidate) => (
                  <li key={candidate.id}>
                    <span lang="ja">{candidate.word}</span>
                    <em>
                      {candidate.frequencyRank
                        ? `#${candidate.frequencyRank}`
                        : candidate.jlptLevel ?? t('study.candidates.unrated')}
                    </em>
                  </li>
                ))}
              </ul>
              {resizeCandidates.retained.length > 6 && (
                <small>{t('study.resize.moreKept', { count: resizeCandidates.retained.length - 6 })}</small>
              )}
            </div>
            <div>
              <strong>{t('study.resize.deferredHeading')}</strong>
              <small>{t('study.resize.deferredDetail')}</small>
              <ul>
                {resizeCandidates.deferred.slice(0, 6).map((candidate) => (
                  <li key={candidate.id}>
                    <span lang="ja">{candidate.word}</span>
                    <em>
                      {candidate.frequencyRank
                        ? `#${candidate.frequencyRank}`
                        : candidate.jlptLevel ?? t('study.candidates.unrated')}
                    </em>
                  </li>
                ))}
              </ul>
              {resizeCandidates.deferred.length > 6 && (
                <small>{t('study.resize.moreDeferred', { count: resizeCandidates.deferred.length - 6 })}</small>
              )}
            </div>
          </div>
          <footer>
            <span>{t('study.resize.footer')}</span>
            {resizeApplied ? (
              <button
                type="button"
                className="mc-button"
                disabled={busy}
                onClick={() => void undoSetResize(resizePreview)}
              >
                {t('study.resize.undoAction')}
              </button>
            ) : (
              <button
                type="button"
                className="mc-button mc-button-primary"
                disabled={busy}
                onClick={() => void applySetResize(resizePreview)}
              >
                {t('study.resize.applyAction', { count: resizePreview.proposedSize })}
              </button>
            )}
          </footer>
        </section>
      )}

      {sceneSession && (
        <section
          className="study-scene-session"
          aria-labelledby="study-scene-session-title"
          ref={sceneSessionRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.sceneSession.eyebrow')}</span>
              <div className="study-scene-session-title-row">
                <h2 id="study-scene-session-title">{sceneSession.title}</h2>
                <button
                  type="button"
                  aria-label={t('study.sceneSession.close')}
                  onClick={() => setSceneSessionId(null)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>
                {t('study.sceneSession.body', {
                  words: sceneSession.candidateIds.length,
                  recurring: sceneSession.recurringWords,
                })}
              </p>
            </div>
            <div className="study-scene-session-range">
              <span>
                <small>{t('study.sceneSession.start')}</small>
                <strong>{cueTime(sceneSession.startSec)}</strong>
              </span>
              <Icon name="chevron" size={16} />
              <span>
                <small>{t('study.sceneSession.end')}</small>
                <strong>{cueTime(sceneSession.endSec)}</strong>
              </span>
              <em>{t('study.sceneSession.minutes', { count: Math.ceil(sceneSession.durationSec / 60) })}</em>
            </div>
          </header>
          <div className="study-scene-session-words">
            {sceneSession.words.map((candidate) => (
              <article key={candidate.id}>
                <div>
                  <ruby lang="ja">
                    {candidate.word}
                    {candidate.reading && <rt>{candidate.reading}</rt>}
                  </ruby>
                  <span>{candidate.occurrences}×</span>
                </div>
                <p lang="ja">{candidate.sentence}</p>
                <small>{cueTime(candidate.timestamp)}</small>
              </article>
            ))}
          </div>
          <footer>
            <span>{t('study.sceneSession.footer')}</span>
            <button
              type="button"
              className="mc-button mc-button-primary"
              onClick={() => void startSceneSession(sceneSession).catch((reason: unknown) => {
                setError(reason instanceof Error ? reason.message : String(reason));
              })}
            >
              <Icon name="player" size={13} />
              {t('study.sceneSession.startAction', {
                count: Math.ceil(sceneSession.durationSec / 60),
              })}
            </button>
          </footer>
        </section>
      )}

      {grammarWeakness && (
        <section
          className="study-grammar-weakness"
          aria-labelledby="study-grammar-weakness-title"
          ref={grammarWeaknessRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.grammarWeakness.eyebrow')}</span>
              <div className="study-grammar-weakness-title-row">
                <div>
                  <h2 id="study-grammar-weakness-title" lang="ja">
                    {grammarWeakness.pattern}
                  </h2>
                  <strong>{grammarWeakness.meaning}</strong>
                </div>
                <button
                  type="button"
                  aria-label={t('study.grammarWeakness.close')}
                  onClick={() => setGrammarWeaknessId(null)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>{t('study.grammarWeakness.body')}</p>
            </div>
            <div className="study-grammar-weakness-summary">
              <span>
                <strong>{grammarWeakness.failedSessions}</strong>
                <small>{t('study.grammarWeakness.failuresLabel')}</small>
              </span>
              <span>
                <strong>{grammarWeakness.contexts.length}</strong>
                <small>{t('study.grammarWeakness.scenesLabel')}</small>
              </span>
              <em>{grammarWeakness.level}</em>
            </div>
          </header>
          <div className="study-grammar-weakness-scenes">
            {grammarWeakness.contexts.map((context) => {
              const matchAt = context.sentence.indexOf(grammarWeakness.core);
              return (
                <article key={`${context.mediaId}:${context.cueStartSec}:${context.sentence}`}>
                  <div>
                    <strong>{context.title}</strong>
                    <small>
                      {context.episode != null
                        ? `${t('study.grammarWeakness.episode', { episode: context.episode })} · `
                        : ''}
                      {cueTime(context.cueStartSec)}
                    </small>
                  </div>
                  <p lang="ja">
                    {context.sentence.slice(0, matchAt)}
                    <mark>{context.sentence.slice(
                      matchAt,
                      matchAt + grammarWeakness.core.length,
                    )}</mark>
                    {context.sentence.slice(matchAt + grammarWeakness.core.length)}
                  </p>
                  <button
                    type="button"
                    className="mc-button"
                    onClick={() => void openGrammarWeaknessContext(context).catch(
                      (reason: unknown) => {
                        setError(reason instanceof Error ? reason.message : String(reason));
                      },
                    )}
                  >
                    <Icon name="player" size={13} />
                    {t('study.grammarWeakness.openAt', {
                      time: cueTime(context.cueStartSec),
                    })}
                  </button>
                </article>
              );
            })}
          </div>
          <footer>
            <span>{t('study.grammarWeakness.footer')}</span>
            <button
              type="button"
              className="mc-button mc-button-primary"
              onClick={() => practiceGrammarWeakness(
                grammarWeakness.pointId,
                grammarWeakness.pattern,
                grammarWeakness.level,
              )}
            >
              {t('study.grammarWeakness.practice')}
            </button>
          </footer>
        </section>
      )}

      {speechRatePreview && (
        <section
          className="study-speech-rate"
          aria-labelledby="study-speech-rate-title"
          ref={speechRateRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.speechRate.eyebrow')}</span>
              <div className="study-speech-rate-title-row">
                <h2 id="study-speech-rate-title">
                  {t('study.speechRate.heading', { title: speechRatePreview.title })}
                </h2>
                <button
                  type="button"
                  aria-label={speechRateUndo == null
                    ? t('study.speechRate.close')
                    : t('study.speechRate.closeAndRestore', {
                      rate: playbackRateLabel(speechRateUndo),
                    })}
                  onClick={closeSpeechRatePreview}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>
                {t('study.speechRate.body', {
                  count: speechRatePreview.comparedTitles,
                  rate: playbackRateLabel(speechRatePreview.preferredPlaybackRate),
                })}
              </p>
            </div>
            {speechRatePreview.episode != null && (
              <em>{t('study.speechRate.episode', { episode: speechRatePreview.episode })}</em>
            )}
          </header>

          <div className="study-speech-rate-comparison">
            <div>
              <small>{t('study.speechRate.usualLabel')}</small>
              <strong>{speechRatePreview.baselineWordsPerSecond.toFixed(2)}</strong>
              <span>{t('study.speechRate.wordsPerSecond')}</span>
            </div>
            <Icon name="chevron" size={17} />
            <div className="is-fast">
              <small>{t('study.speechRate.thisTitleLabel', {
                rate: playbackRateLabel(speechRatePreview.preferredPlaybackRate),
              })}</small>
              <strong>{speechRatePreview.effectiveWordsPerSecond.toFixed(2)}</strong>
              <span>{t('study.speechRate.wordsPerSecond')}</span>
            </div>
            <div className="study-speech-rate-delta">
              <strong>+{Math.round(speechRatePreview.excess * 100)}%</strong>
              <small>{t('study.speechRate.fasterLabel')}</small>
            </div>
          </div>

          <div className="study-speech-rate-suggestion">
            <div>
              <span>{t('study.speechRate.suggestionLabel')}</span>
              <strong>{playbackRateLabel(speechRatePreview.recommendedPlaybackRate)}</strong>
            </div>
            <p>
              {t('study.speechRate.suggestionBody', {
                current: playbackRateLabel(speechRatePreview.preferredPlaybackRate),
                suggested: playbackRateLabel(speechRatePreview.recommendedPlaybackRate),
              })}
            </p>
          </div>

          <footer>
            <span>
              {speechRateUndo == null
                ? t('study.speechRate.footer')
                : t('study.speechRate.appliedNotice', {
                  rate: playbackRateLabel(speechRatePreview.recommendedPlaybackRate),
                })}
            </span>
            <div>
              {speechRateUndo == null ? (
                <button
                  type="button"
                  className="mc-button mc-button-primary"
                  onClick={() => applySpeechRate(speechRatePreview)}
                >
                  {t('study.speechRate.useRate', {
                    rate: playbackRateLabel(speechRatePreview.recommendedPlaybackRate),
                  })}
                </button>
              ) : (
                <button
                  type="button"
                  className="mc-button"
                  onClick={restoreSpeechRate}
                >
                  {t('study.speechRate.restoreRate', {
                    rate: playbackRateLabel(speechRateUndo),
                  })}
                </button>
              )}
              <button
                type="button"
                className={speechRateUndo == null
                  ? 'mc-button'
                  : 'mc-button mc-button-primary'}
                onClick={() => void openContext({
                  mediaId: speechRatePreview.mediaId,
                  episode: speechRatePreview.episode,
                  subtitleRecordId: speechRatePreview.subtitleRecordId,
                  returnTarget: {
                    section: 'video',
                    mediaId: speechRatePreview.mediaId,
                    subtitleRecordId: speechRatePreview.subtitleRecordId,
                    positionSec: speechRatePreview.positionSec,
                  },
                }).catch((reason: unknown) => {
                  setError(reason instanceof Error ? reason.message : String(reason));
                })}
              >
                <Icon name="player" size={13} />
                {t('study.speechRate.openAtRate', {
                  rate: playbackRateLabel(surface.playbackRate),
                })}
              </button>
            </div>
          </footer>
          <p className="study-speech-rate-provenance">
            <Icon name="check" size={12} />
            <span>{t('study.speechRate.provenance')}</span>
          </p>
        </section>
      )}

      {properNameReview && (
        <section
          className="study-proper-names"
          aria-labelledby="study-proper-names-title"
          ref={properNamesRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.properNames.eyebrow')}</span>
              <div className="study-proper-names-title-row">
                <h2 id="study-proper-names-title">
                  {t('study.properNames.heading', { title: properNameReview.title })}
                </h2>
                <button
                  type="button"
                  aria-label={t('study.properNames.close')}
                  onClick={() => {
                    setProperNameReviewId(null);
                    setProperNameFilterApplied(false);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>{t('study.properNames.body')}</p>
            </div>
            <div className="study-proper-names-summary">
              <span>
                <strong>{properNameReview.totalNames}</strong>
                <small>{t('study.properNames.namesLabel')}</small>
              </span>
              <span>
                <strong>{properNameReview.totalOccurrences}</strong>
                <small>{t('study.properNames.appearancesLabel')}</small>
              </span>
              {properNameReview.episode != null && (
                <em>
                  {t('study.properNames.episode', { episode: properNameReview.episode })}
                </em>
              )}
            </div>
          </header>
          <div className="study-proper-names-list">
            {properNameReview.names.map((entry) => {
              // Katakana names read like themselves, and a cue that is only the
              // name is not context — both would render as visual noise.
              const furigana = properNameFurigana(entry);
              const context = properNameContextLine(entry);
              return (
              <article key={entry.candidateId}>
                <div className="study-proper-names-heading">
                  <ruby lang="ja">
                    {entry.word}
                    {furigana && <rt>{furigana}</rt>}
                  </ruby>
                  <span>{t('study.properNames.appearances', { count: entry.occurrences })}</span>
                </div>
                {context
                  ? <blockquote lang="ja">{context}</blockquote>
                  : <p className="study-proper-names-nocontext">{t('study.properNames.noContext')}</p>}
                <button
                  type="button"
                  className="mc-button"
                  onClick={() => void openProperNameContext(properNameReview, entry).catch(
                    (reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : String(reason));
                    },
                  )}
                >
                  <Icon name="player" size={13} />
                  {t('study.properNames.openAt', { time: cueTime(entry.cueStartSec) })}
                </button>
              </article>
              );
            })}
          </div>
          <footer>
            {/*
              Applying flips the workspace filter, so the live review reports
              zero selected names immediately afterwards. The applied flag —
              not the recomputed count — keeps undo reachable.
            */}
            {properNameFilterApplied ? (
              <>
                <span>{t('study.properNames.appliedNotice')}</span>
                <button
                  type="button"
                  className="mc-button"
                  disabled={busy}
                  onClick={() => void undoProperNameFilter(properNameReview)}
                >
                  {t('study.properNames.undo')}
                </button>
              </>
            ) : properNameReview.selectedNames > 0 ? (
              <>
                <span>
                  {t('study.properNames.inCardsNotice', {
                    count: properNameReview.selectedNames,
                  })}
                </span>
                <button
                  type="button"
                  className="mc-button mc-button-primary"
                  disabled={busy}
                  onClick={() => void excludeProperNames(properNameReview)}
                >
                  {t('study.properNames.exclude')}
                </button>
              </>
            ) : (
              <span>{t('study.properNames.alreadyExcluded')}</span>
            )}
          </footer>
          <p className="study-proper-names-provenance">
            <Icon name="check" size={12} />
            <span>{t('study.properNames.footer')}</span>
          </p>
        </section>
      )}

      {ankiLeechReview && (
        <section
          className="study-anki-leech"
          aria-labelledby="study-anki-leech-title"
          ref={ankiLeechRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.ankiLeech.eyebrow')}</span>
              <div className="study-anki-leech-title-row">
                <h2 id="study-anki-leech-title">
                  {t('study.ankiLeech.heading', { title: ankiLeechReview.title })}
                </h2>
                <button
                  type="button"
                  aria-label={t('study.ankiLeech.close')}
                  onClick={() => setAnkiLeechReviewId(null)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>{t('study.ankiLeech.body')}</p>
            </div>
            <div className="study-anki-leech-summary">
              <span>
                <strong>{ankiLeechReview.totalMatches}</strong>
                <small>{t('study.ankiLeech.matchesLabel')}</small>
              </span>
              <span>
                <strong>{ankiLeechReview.leechCount}</strong>
                <small>{t('study.ankiLeech.leechesLabel')}</small>
              </span>
              <span>
                <strong>{ankiLeechReview.suspendedCount}</strong>
                <small>{t('study.ankiLeech.suspendedLabel')}</small>
              </span>
              {ankiLeechReview.episode != null && (
                <em>{t('study.ankiLeech.episode', { episode: ankiLeechReview.episode })}</em>
              )}
            </div>
          </header>
          <div className="study-anki-leech-list">
            {ankiLeechReview.contexts.map((entry) => {
              const matchAt = entry.sentence.indexOf(entry.word);
              return (
                <article key={entry.expression}>
                  <div className="study-anki-leech-heading">
                    <ruby lang="ja">
                      {entry.word}
                      {entry.reading && entry.reading !== entry.word && <rt>{entry.reading}</rt>}
                    </ruby>
                    <div>
                      {entry.leech && <span>{t('study.ankiLeech.leechBadge')}</span>}
                      {entry.suspended && (
                        <span className="is-suspended">{t('study.ankiLeech.suspendedBadge')}</span>
                      )}
                    </div>
                  </div>
                  <blockquote lang="ja">
                    {matchAt >= 0 ? (
                      <>
                        {entry.sentence.slice(0, matchAt)}
                        <mark>{entry.sentence.slice(matchAt, matchAt + entry.word.length)}</mark>
                        {entry.sentence.slice(matchAt + entry.word.length)}
                      </>
                    ) : entry.sentence}
                  </blockquote>
                  <div className="study-anki-leech-meta">
                    <span>{t('study.ankiLeech.appearances', { count: entry.occurrences })}</span>
                    <span>{t('study.ankiLeech.interval', { count: entry.intervalDays })}</span>
                  </div>
                  <button
                    type="button"
                    className="mc-button mc-button-primary"
                    onClick={() => void openAnkiLeechContext(ankiLeechReview, entry).catch(
                      (reason: unknown) => {
                        setError(reason instanceof Error ? reason.message : String(reason));
                      },
                    )}
                  >
                    <Icon name="player" size={13} />
                    {t('study.ankiLeech.openAt', { time: cueTime(entry.cueStartSec) })}
                  </button>
                </article>
              );
            })}
          </div>
          <footer>
            <Icon name="check" size={12} />
            <span>{t('study.ankiLeech.footer')}</span>
          </footer>
        </section>
      )}

      {seriesRecurrence && (
        <section
          className="study-series-recurrence"
          aria-labelledby="study-series-recurrence-title"
          ref={seriesRecurrenceRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.seriesRecurrence.eyebrow')}</span>
              <div className="study-series-recurrence-title-row">
                <h2 id="study-series-recurrence-title">
                  {t('study.seriesRecurrence.heading', {
                    title: seriesRecurrence.seriesTitle,
                    episode: seriesRecurrence.episode,
                  })}
                </h2>
                <button
                  type="button"
                  aria-label={t('study.seriesRecurrence.close')}
                  onClick={() => setSeriesRecurrenceId(null)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>{t('study.seriesRecurrence.body')}</p>
            </div>
            <div className="study-series-recurrence-summary">
              <span>
                <strong>{seriesRecurrence.totalRecurringLemmas}</strong>
                <small>{t('study.seriesRecurrence.lemmasLabel')}</small>
              </span>
              <span>
                <strong>{seriesRecurrence.upcomingPreparedEpisodes}</strong>
                <small>{t('study.seriesRecurrence.episodesLabel')}</small>
              </span>
              <span>
                <strong>{seriesRecurrence.totalFutureOccurrences}</strong>
                <small>{t('study.seriesRecurrence.occurrencesLabel')}</small>
              </span>
              <em>
                {t('study.seriesRecurrence.anchorEpisode', {
                  episode: seriesRecurrence.episode,
                })}
              </em>
            </div>
          </header>
          <div className="study-series-recurrence-list">
            {seriesRecurrence.lemmas.map((lemma, index) => (
              <article key={lemma.lemmaKey}>
                <div className="study-series-recurrence-heading">
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <ruby lang="ja">
                    {lemma.word}
                    {lemma.reading && lemma.reading !== lemma.word && <rt>{lemma.reading}</rt>}
                  </ruby>
                  <em>
                    {t('study.seriesRecurrence.futureEpisodeCount', {
                      count: lemma.futureEpisodeCount,
                    })}
                  </em>
                </div>
                {lemma.meaning && <p className="study-series-recurrence-meaning">{lemma.meaning}</p>}
                <div className="study-series-recurrence-current">
                  <small>
                    {t('study.seriesRecurrence.currentContext', {
                      episode: seriesRecurrence.episode,
                      count: lemma.currentOccurrences,
                    })}
                  </small>
                  <blockquote lang="ja">{lemma.currentSentence}</blockquote>
                  <button
                    type="button"
                    className="mc-button mc-button-primary"
                    onClick={() => void openSeriesRecurrenceCurrent(
                      seriesRecurrence,
                      lemma,
                    ).catch((reason: unknown) => {
                      setError(reason instanceof Error ? reason.message : String(reason));
                    })}
                  >
                    <Icon name="player" size={13} />
                    {t('study.seriesRecurrence.openCurrentAt', {
                      time: cueTime(lemma.currentCueStartSec),
                    })}
                  </button>
                </div>
                <div className="study-series-recurrence-future">
                  {lemma.contexts.map((context) => (
                    <div key={`${context.mediaId}:${context.cueStartSec}`}>
                      <small>
                        {t('study.seriesRecurrence.futureContext', {
                          episode: context.episode,
                          count: context.occurrences,
                        })}
                      </small>
                      <blockquote lang="ja">{context.sentence}</blockquote>
                      <button
                        type="button"
                        className="mc-button"
                        onClick={() => void openSeriesRecurrenceFuture(context).catch(
                          (reason: unknown) => {
                            setError(reason instanceof Error ? reason.message : String(reason));
                          },
                        )}
                      >
                        <Icon name="player" size={13} />
                        {t('study.seriesRecurrence.openFutureAt', {
                          episode: context.episode,
                          time: cueTime(context.cueStartSec),
                        })}
                      </button>
                    </div>
                  ))}
                </div>
                {lemma.futureEpisodeCount > lemma.contexts.length && (
                  <small className="study-series-recurrence-more">
                    {t('study.seriesRecurrence.moreEpisodes', {
                      count: lemma.futureEpisodeCount - lemma.contexts.length,
                    })}
                  </small>
                )}
              </article>
            ))}
          </div>
          <footer>
            <Icon name="check" size={12} />
            <span>{t('study.seriesRecurrence.footer')}</span>
          </footer>
        </section>
      )}

      {cleanupPreview && (
        <section
          className="study-queue-cleanup"
          aria-labelledby="study-queue-cleanup-title"
          ref={cleanupRef}
          tabIndex={-1}
        >
          <header>
            <div>
              <span className="mc-eyebrow">{t('study.cleanup.eyebrow')}</span>
              <div className="study-queue-cleanup-title-row">
                <h2 id="study-queue-cleanup-title">
                  {cleanupUndo ? t('study.cleanup.retiredHeading') : t('study.cleanup.heading')}
                </h2>
                <button
                  type="button"
                  aria-label={t('study.cleanup.close')}
                  onClick={() => {
                    setCleanupPreview(null);
                    setCleanupUndo(null);
                  }}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <p>{t('study.cleanup.body')}</p>
            </div>
          </header>
          <ul className="study-queue-cleanup-items">
            {cleanupPreview.items.map((entry: StudyStaleQueueItem) => (
              <li key={entry.opportunityId}>
                <div className="study-queue-cleanup-item-head">
                  <strong>{entry.title}</strong>
                  <em data-reason={entry.reason}>
                    {entry.reason === 'media-removed' && t('study.cleanup.reasonMediaRemoved')}
                    {entry.reason === 'subtitle-removed' && t('study.cleanup.reasonSubtitleRemoved')}
                    {entry.reason === 'debt-resolved' && t('study.cleanup.reasonFinished')}
                  </em>
                </div>
                <small>{entry.detail}</small>
                <small className="study-queue-cleanup-item-meta">
                  {entry.mediaTitle ?? t('study.cleanup.sourceGone')}
                  {entry.status === 'snoozed' ? ` · ${t('study.cleanup.snoozedTag')}` : ''}
                  {entry.exportedWords
                    ? ` · ${t('study.cleanup.exportedTag', { count: entry.exportedWords })}`
                    : ''}
                  {entry.learnedWords
                    ? ` · ${t('study.cleanup.learnedTag', { count: entry.learnedWords })}`
                    : ''}
                </small>
              </li>
            ))}
          </ul>
          <footer>
            <span>{t('study.cleanup.footer')}</span>
            {cleanupUndo ? (
              <button
                type="button"
                className="mc-button"
                disabled={busy}
                onClick={() => void undoQueueCleanup()}
              >
                {t('study.cleanup.undoAction')}
              </button>
            ) : (
              <button
                type="button"
                className="mc-button mc-button-primary"
                disabled={busy}
                onClick={() => void applyQueueCleanup(cleanupPreview)}
              >
                {t('study.cleanup.retireAction', { count: cleanupPreview.items.length })}
              </button>
            )}
          </footer>
        </section>
      )}

      {subtitleUpgrade && (
        <section className="study-subtitle-upgrade" aria-labelledby="study-subtitle-upgrade-title">
          <div>
            <span className="mc-eyebrow">{t('study.subtitleUpgrade.eyebrow')}</span>
            <h2 id="study-subtitle-upgrade-title">{t('study.subtitleUpgrade.heading')}</h2>
            <p>{t('study.subtitleUpgrade.body')}</p>
          </div>
          <div className="study-subtitle-upgrade-comparison">
            <span>
              <small>{t('study.subtitleUpgrade.current')}</small>
              <strong>{subtitleUpgrade.currentScore}</strong>
              <em>{subtitleUpgrade.currentRecord.label ?? subtitleUpgrade.currentTrack.title}</em>
            </span>
            <b aria-label={t('study.subtitleUpgrade.improves', { points: subtitleUpgrade.scoreDelta })}>
              +{subtitleUpgrade.scoreDelta}
            </b>
            <span className="is-better">
              <small>{subtitleUpgrade.candidateGrade}</small>
              <strong>{subtitleUpgrade.candidateScore}</strong>
              <em>{subtitleUpgrade.candidateRecord.label ?? subtitleUpgrade.candidateTrack.title}</em>
            </span>
          </div>
          <div className="study-subtitle-upgrade-actions">
            <small>{subtitleUpgrade.evidence.join(' · ')}</small>
            <button
              type="button"
              className="mc-button mc-button-primary"
              disabled={busy}
              onClick={() => void applySubtitleUpgrade(subtitleUpgrade)}
            >
              {t('study.subtitleUpgrade.action')}
            </button>
          </div>
        </section>
      )}

      {episodeRail.length > 1 && (
        <section className="study-episode-readiness" aria-labelledby="study-episode-readiness-title">
          <div className="study-section-heading">
            <div>
              <span className="mc-eyebrow">{t('study.episodeRail.eyebrow')}</span>
              <h2 id="study-episode-readiness-title">{t('study.episodeRail.heading')}</h2>
            </div>
            <small>
              {t('study.episodeRail.currentOf', {
                current: episodeRail.filter((entry) => entry.state === 'ready').length,
                total: episodeRail.length,
              })}
            </small>
          </div>
          <p className="study-episode-readiness-note">{t('study.episodeRail.note')}</p>
          <div className="study-episode-readiness-track">
            {episodeRail.map((entry) => {
              const ready = entry.readiness;
              const action = entry.state === 'ready'
                ? t('study.episodeRail.openEpisode')
                : entry.state === 'missing-subtitles'
                  ? t('study.episodeRail.prepareSubtitles')
                  : entry.state === 'stale'
                    ? t('study.episodeRail.refreshAnalysis')
                    : t('study.episodeRail.analyze');
              return (
                <button
                  type="button"
                  key={entry.mediaId}
                  className={`study-episode-card is-${entry.state}${entry.mediaId === activeMediaId ? ' is-active' : ''}`}
                  onClick={() => void actOnEpisodeReadiness(entry).catch((reason: unknown) => {
                    setError(reason instanceof Error ? reason.message : String(reason));
                  })}
                  disabled={busy}
                  aria-label={t('study.episodeRail.cardLabel', {
                    episode: entry.episode,
                    state: entry.state.replaceAll('-', ' '),
                    action,
                  })}
                >
                  <span className="study-episode-number">
                    {t('study.episodeRail.episode', { episode: String(entry.episode).padStart(2, '0') })}
                  </span>
                  <strong title={entry.title}>{entry.title}</strong>
                  {ready ? (
                    <>
                      <span className="study-episode-score">{percent(ready.knownCoverage)}</span>
                      <small>
                        {readinessCategoryLabel(ready.category, t)}
                        {' · '}
                        {ready.contentLevel ?? t('study.rail.levelIncomplete')}
                      </small>
                    </>
                  ) : (
                    <span className="study-episode-state">
                      {entry.state === 'missing-subtitles'
                        ? t('study.episodeRail.subtitlesMissing')
                        : entry.state === 'stale'
                          ? t('study.episodeRail.scoreStale')
                          : t('study.episodeRail.notAnalyzed')}
                    </span>
                  )}
                  <em>{action}</em>
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="study-production" aria-label={t('study.production.label')}>
        <div className="study-section-heading">
          <div>
            <span className="mc-eyebrow">
              {isLookupPack ? t('study.production.lookupEyebrow') : t('study.production.eyebrow')}
            </span>
            <h2>{isLookupPack ? t('study.production.lookupHeading') : t('study.production.heading')}</h2>
          </div>
          <div className="study-production-status">
            {(activeJob || isLookupPack) && (
              <small>
                {t('study.production.realState', {
                  time: new Date(workspace?.updatedAt ?? activeJob?.updatedAt ?? 0).toLocaleTimeString(LANG_TAGS[lang]),
                })}
              </small>
            )}
            {!isLookupPack && activeTranscriptionStage
              && activeTranscriptionMediaId
              && ['queued', 'active'].includes(activeTranscriptionStage.status)
              && (
                <button
                  type="button"
                  onClick={() => {
                    setStatus(t('study.production.cancelling'));
                    void window.api.cancelTranscription(activeTranscriptionMediaId);
                  }}
                >
                  {t('study.production.cancel')}
                </button>
              )}
            {!isLookupPack && activeTranscriptionStage
              && activeTranscriptionMediaId
              && ['failed', 'cancelled'].includes(activeTranscriptionStage.status)
              && (
                <button type="button" onClick={() => void prepareMedia(activeTranscriptionMediaId)}>
                  {t('study.production.retry')}
                </button>
              )}
          </div>
        </div>
        {/*
          * The scroll wrapper is separate from the track on purpose: the track
          * itself is the 720px-wide content, so `overflow-x` on it scrolls
          * nothing. Without this element the parent section simply clipped the
          * last stations at narrow widths.
          */}
        <div className="study-production-track-scroll">
        <div className="study-production-track">
          {productionStages.map((stage, index, stages) => {
            const stageKey = STAGE_LABEL_KEYS[stage.id];
            const label = stageKey ? t(stageKey) : stage.label;
            const statusKey = STAGE_STATUS_KEYS[stage.status];
            // A stored English `detail` is the fallback for jobs written before
            // the structured key existed; the status is the last resort.
            const detail = (stage.detailKey ? t(stage.detailKey, stage.detailVars) : stage.detail)
              ?? stage.detail
              ?? (statusKey ? t(statusKey) : stage.status.replace('-', ' '));
            return (
            <div
              className={`study-station is-${stage.status}`}
              key={stage.id}
              aria-label={`${label}: ${detail}`}
              aria-current={stage.status === 'active' ? 'step' : undefined}
            >
              <span className="study-station-node">
                {stage.status === 'complete' ? <Icon name="check" size={11} /> : index + 1}
              </span>
              <strong>{label}</strong>
              <small>{detail}</small>
              {stage.progress != null && (
                <span
                  className="study-stage-meter"
                  role="progressbar"
                  aria-label={t('study.stage.progressLabel', { stage: label })}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(stage.progress * 100)}
                >
                  <i style={{ transform: `scaleX(${stage.progress})` }} />
                </span>
              )}
              {index < stages.length - 1 && <i className="study-station-line" />}
            </div>
            );
          })}
        </div>
        </div>
      </section>

      <div className="study-workbench">
        <section className="study-vocabulary">
          <div className="study-section-heading">
            <div>
              <span className="mc-eyebrow">{t('study.funnel.eyebrow')}</span>
              <h2>{t('study.funnel.heading')}</h2>
            </div>
            {workspace && (
              <small>
                {t('study.funnel.selectedOf', {
                  selected: workspace.selectionIds.length,
                  total: workspace.candidates.length,
                })}
              </small>
            )}
          </div>

          {workspace ? (
            <>
              <div className="study-funnel-summary">
                <div>
                  <span>{isLookupPack ? t('study.funnel.repeatedWords') : t('study.funnel.detected')}</span>
                  <strong>{workspace.candidates.length}</strong>
                </div>
                <i />
                <div>
                  <span>{t('study.funnel.afterFilters')}</span>
                  <strong>{workspace.selectionIds.length}</strong>
                </div>
                <i />
                <div>
                  <span>{isLookupPack ? t('study.funnel.evidenceWindow') : t('study.funnel.coverageEstimate')}</span>
                  <strong>
                    {isLookupPack
                      ? t('study.funnel.evidenceWindowValue')
                      : `${percent(coverage?.before)} → ${percent(coverage?.after)}`}
                  </strong>
                </div>
              </div>

              <div className="study-filter-bar" aria-label={t('study.funnel.filtersLabel')}>
                <button
                  type="button"
                  className={workspace.filters.excludedJlptLevels.includes('N5') ? 'is-active' : ''}
                  onClick={() => void applyFilters({
                    excludedJlptLevels: workspace.filters.excludedJlptLevels.includes('N5')
                      ? workspace.filters.excludedJlptLevels.filter((level) => level !== 'N5')
                      : [...workspace.filters.excludedJlptLevels, 'N5'],
                  })}
                >{t('study.filter.excludeLevel', { level: 'N5' })}</button>
                <button
                  type="button"
                  className={workspace.filters.excludedJlptLevels.includes('N4') ? 'is-active' : ''}
                  onClick={() => void applyFilters({
                    excludedJlptLevels: workspace.filters.excludedJlptLevels.includes('N4')
                      ? workspace.filters.excludedJlptLevels.filter((level) => level !== 'N4')
                      : [...workspace.filters.excludedJlptLevels, 'N4'],
                  })}
                >{t('study.filter.excludeLevel', { level: 'N4' })}</button>
                <label>
                  {t(STUDY_FILTER_FIELD_KEYS.rankingMode)}
                  <select
                    value={workspace.filters.rankingMode}
                    onChange={(event) => void applyFilters({
                      rankingMode: event.currentTarget.value === 'frequency-all'
                        ? 'frequency-all'
                        : 'frequency-unrated',
                    })}
                    title={t('study.filter.rankingHint')}
                  >
                    <option value="frequency-unrated">{t('study.filter.value.frequencyUnrated')}</option>
                    <option value="frequency-all">{t('study.filter.value.frequencyAll')}</option>
                  </select>
                </label>
                <label>
                  {t(STUDY_FILTER_FIELD_KEYS.minimumOccurrences)}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={workspace.filters.minimumOccurrences}
                    onChange={(event) => void applyFilters({ minimumOccurrences: Number(event.currentTarget.value) })}
                  />
                </label>
                <label>
                  {t(STUDY_FILTER_FIELD_KEYS.maximumCards)}
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={workspace.filters.maximumCards ?? 30}
                    onChange={(event) => void applyFilters({ maximumCards: Number(event.currentTarget.value) })}
                  />
                </label>
                <button type="button" disabled={!workspace.history.length} onClick={() => void undoFilter()}>
                  {t('study.filter.undo')}
                </button>
                <button
                  type="button"
                  className={recipeOpen ? 'is-active' : ''}
                  aria-expanded={recipeOpen}
                  aria-controls="study-recipe-panel"
                  onClick={() => {
                    setRecipeNotice('');
                    setRecipeOpen(!recipeOpen);
                  }}
                >
                  {t('study.recipe.toggle')}
                </button>
              </div>

              {recipeOpen && (
                <section
                  className="study-recipe"
                  id="study-recipe-panel"
                  aria-label={t('study.recipe.heading')}
                >
                  <div className="study-recipe-head">
                    <div>
                      <span className="mc-eyebrow">{t('study.recipe.eyebrow')}</span>
                      <h3>{t('study.recipe.heading')}</h3>
                    </div>
                    <small>{t('study.recipe.code', { code: recipeCode })}</small>
                  </div>
                  <p>{t('study.recipe.body')}</p>

                  {/*
                    The text below is what travels, but nobody should have to read
                    JSON to know what their own recipe says. This reads the same
                    nine fields through the same labels the filter bar uses.
                  */}
                  <ul className="study-recipe-summary">
                    {STUDY_RECIPE_FIELDS.map((field) => (
                      <li key={field}>
                        <span>{t(STUDY_FILTER_FIELD_KEYS[field])}</span>
                        <b>{recipeValueLabel(field, workspace.filters[field], t)}</b>
                      </li>
                    ))}
                  </ul>

                  <div className="study-recipe-block">
                    <label htmlFor="study-recipe-export">{t('study.recipe.exportLabel')}</label>
                    <textarea
                      id="study-recipe-export"
                      readOnly
                      rows={6}
                      spellCheck={false}
                      value={recipeExportText}
                    />
                    <div className="study-recipe-actions">
                      <button type="button" onClick={() => void copyRecipe()}>
                        {t('study.recipe.copy')}
                      </button>
                    </div>
                  </div>

                  {recipeSource && (
                    <div className="study-recipe-source">
                      <span>
                        {t('study.recipe.sourceOffer', { label: recipeSource.label })}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setRecipeNotice('');
                          setRecipeText(serializeStudyFilterRecipe(
                            createStudyFilterRecipe(recipeSource.filters, recipeSource.label),
                          ));
                        }}
                      >
                        {t('study.recipe.sourceUse')}
                      </button>
                    </div>
                  )}

                  <div className="study-recipe-block">
                    <label htmlFor="study-recipe-import">{t('study.recipe.importLabel')}</label>
                    <textarea
                      id="study-recipe-import"
                      rows={6}
                      spellCheck={false}
                      placeholder={t('study.recipe.placeholder')}
                      value={recipeText}
                      onChange={(event) => {
                        setRecipeNotice('');
                        setRecipeText(event.currentTarget.value);
                      }}
                    />
                    {recipeParse && !recipeParse.ok && (
                      <p className="study-recipe-problem">
                        {t(RECIPE_REJECTION_KEYS[recipeParse.reason])}
                      </p>
                    )}
                    {recipeParse?.ok && recipePreview && (
                      <>
                        {!!recipeParse.recipe.label && (
                          <p className="study-recipe-provenance">
                            {t('study.recipe.fromLabel', { label: recipeParse.recipe.label })}
                          </p>
                        )}
                        {!!recipeParse.missingFields.length && (
                          <p className="study-recipe-note">
                            {t('study.recipe.missingFields', {
                              count: recipeParse.missingFields.length,
                            })}
                          </p>
                        )}
                        {!!recipeParse.invalidFields.length && (
                          <p className="study-recipe-note">
                            {t('study.recipe.invalidFields', {
                              count: recipeParse.invalidFields.length,
                            })}
                          </p>
                        )}
                        {!!recipeParse.unknownFields.length && (
                          <p className="study-recipe-note">
                            {t('study.recipe.unknownFields', {
                              count: recipeParse.unknownFields.length,
                            })}
                          </p>
                        )}
                        {recipePreview.identical ? (
                          <p className="study-recipe-note">{t('study.recipe.identical')}</p>
                        ) : (
                          <>
                            <ul className="study-recipe-diff">
                              {recipePreview.changes.map((change) => (
                                <li key={change.field}>
                                  <span>{t(STUDY_FILTER_FIELD_KEYS[change.field])}</span>
                                  <small>
                                    {recipeValueLabel(change.field, change.before, t)}
                                    {' → '}
                                    <b>{recipeValueLabel(change.field, change.after, t)}</b>
                                  </small>
                                </li>
                              ))}
                            </ul>
                            <div className="study-recipe-delta">
                              <div>
                                <span>{t('study.recipe.selectedLabel')}</span>
                                <strong>
                                  {recipePreview.selectedBefore} → {recipePreview.selectedAfter}
                                </strong>
                              </div>
                              <div>
                                <span>{t('study.recipe.addedLabel')}</span>
                                <strong>{recipePreview.added}</strong>
                                {!!recipePreview.addedWords.length && (
                                  <small>{recipePreview.addedWords.join(' · ')}</small>
                                )}
                              </div>
                              <div>
                                <span>{t('study.recipe.removedLabel')}</span>
                                <strong>{recipePreview.removed}</strong>
                                {!!recipePreview.removedWords.length && (
                                  <small>{recipePreview.removedWords.join(' · ')}</small>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                        <div className="study-recipe-actions">
                          <button
                            type="button"
                            disabled={busy || recipePreview.identical}
                            onClick={() => void applyRecipe()}
                          >
                            {t('study.recipe.apply')}
                          </button>
                          <small>
                            {t('study.recipe.undoHint', { label: t('study.filter.undo') })}
                          </small>
                        </div>
                      </>
                    )}
                  </div>

                  <p className="study-recipe-status" role="status">{recipeNotice}</p>
                  <div className="study-recipe-footer">{t('study.recipe.footer')}</div>
                </section>
              )}

              <div className="study-command">
                <Icon name="sparkle" size={14} />
                <input
                  value={command}
                  onChange={(event) => setCommand(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void runCommand();
                  }}
                  placeholder={t('study.command.placeholder')}
                  aria-label={t('study.command.label')}
                />
                <button type="button" disabled={busy || !command.trim()} onClick={() => void runCommand()}>
                  {t('study.command.apply')}
                </button>
              </div>

              <div
                className="study-vocabulary-list"
                role="list"
                aria-label={t('study.candidates.listLabel')}
                aria-busy={pageLoading}
              >
                {page.map((candidate) => (
                  <button
                    type="button"
                    role="listitem"
                    className={selected.has(candidate.id) ? 'is-included' : 'is-filtered'}
                    aria-pressed={selected.has(candidate.id)}
                    key={candidate.id}
                    onClick={() => {
                      if (isLookupPack) {
                        window.dispatchEvent(new CustomEvent('dict:lookup', {
                          detail: { query: candidate.word, context: candidate.sentence },
                        }));
                        return;
                      }
                      void openContext({
                        ...workspace.context,
                        cueStartSec: candidate.timestamp,
                        sentence: candidate.sentence,
                      });
                    }}
                  >
                    <span>
                      <strong>{candidate.word}</strong>
                      <small>{candidate.reading || t('study.candidates.noReading')}</small>
                    </span>
                    <em>{candidate.jlptLevel ?? t('study.candidates.unrated')}</em>
                    <span title={t('study.candidates.frequencyHint')}>
                      {candidate.frequencyRank ? `#${candidate.frequencyRank} · ` : ''}{candidate.occurrences}×
                    </span>
                    <small>
                      {candidate.internalDuplicate
                        ? t('study.candidates.inLocalDeck')
                        : candidate.ankiDuplicate
                          ? t('study.candidates.inAnki')
                          : selected.has(candidate.id)
                            ? t('study.candidates.selected')
                            : t('study.candidates.filtered')}
                    </small>
                  </button>
                ))}
              </div>
              <nav className="study-vocabulary-pagination" aria-label={t('study.candidates.pagesLabel')}>
                <button
                  type="button"
                  disabled={pageLoading || pageOffset === 0}
                  onClick={() => setPageOffset((offset) => Math.max(0, offset - VOCABULARY_PAGE_SIZE))}
                >
                  {t('study.candidates.previous')}
                </button>
                <span role="status" aria-live="polite">
                  {pageInfo.total
                    ? t('study.candidates.range', {
                      from: pageOffset + 1,
                      to: Math.min(pageOffset + page.length, pageInfo.total),
                      total: pageInfo.total,
                    })
                    : pageLoading
                      ? t('study.candidates.loading')
                      : t('study.candidates.none')}
                  {pageInfo.total
                    ? ` · ${t('study.candidates.selectedCount', { count: pageInfo.selected })}`
                    : ''}
                </span>
                <button
                  type="button"
                  disabled={pageLoading || pageOffset + page.length >= pageInfo.total}
                  onClick={() => setPageOffset((offset) => offset + VOCABULARY_PAGE_SIZE)}
                >
                  {t('study.candidates.next')}
                </button>
              </nav>
            </>
          ) : (
            <div className="study-workspace-empty">{t('study.funnel.empty')}</div>
          )}
        </section>

        <aside className="study-context-rail">
          <div className="study-section-heading">
            <div>
              <span className="mc-eyebrow">{t('study.rail.eyebrow')}</span>
              <h2>{t('study.rail.heading')}</h2>
            </div>
          </div>
          {evidenceOpportunity && (
            <div
              id="study-opportunity-evidence"
              className="study-opportunity-evidence"
              ref={evidenceRef}
              tabIndex={-1}
              aria-labelledby="study-opportunity-evidence-title"
            >
              <div>
                <span className="mc-eyebrow">{t('study.evidence.eyebrow')}</span>
                <button
                  type="button"
                  aria-label={t('study.evidence.close')}
                  onClick={() => setEvidenceOpportunityId(undefined)}
                >
                  <Icon name="close" size={13} />
                </button>
              </div>
              <h3 id="study-opportunity-evidence-title">
                {opportunityTitle(evidenceOpportunity, t)}
              </h3>
              <p>{opportunityExplanation(evidenceOpportunity, t)}</p>
              <dl>
                <div>
                  <dt>{t('study.evidence.effort')}</dt>
                  <dd>{t('study.evidence.minutes', { count: evidenceOpportunity.estimatedMinutes })}</dd>
                </div>
                <div>
                  <dt>{t('study.evidence.opportunity')}</dt>
                  <dd>
                    {OPPORTUNITY_TYPE_KEYS[evidenceOpportunity.type]
                      ? t(OPPORTUNITY_TYPE_KEYS[evidenceOpportunity.type])
                      : evidenceOpportunity.type.replaceAll('-', ' ')}
                  </dd>
                </div>
              </dl>
              <ul>
                {evidenceOpportunity.evidence.map((evidence) => (
                  <li key={evidence.code}>
                    <Icon name="check" size={11} />
                    <span>{evidenceLabel(evidence, t)}</span>
                    {evidence.confidence != null && (
                      <em>{t('study.evidence.confidence', { value: percent(evidence.confidence) })}</em>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {isLookupPack && workspace ? (
            <div className="study-readiness-orbit study-lookup-summary">
              <div>
                <strong>{workspace.candidates.length}</strong>
                <span>{t('study.rail.words')}</span>
              </div>
              <p>
                <strong>{t('study.rail.lookupPack')}</strong>
                <span>{t('study.rail.lookupPackDetail')}</span>
              </p>
            </div>
          ) : activeReadiness ? (
            <div className="study-readiness-orbit">
              <div style={{ '--study-coverage': `${Math.round((activeReadiness.knownCoverage ?? 0) * 360)}deg` } as CSSProperties}>
                <strong>{percent(activeReadiness.knownCoverage)}</strong>
                <span>{t('study.rail.known')}</span>
              </div>
              <p>
                <strong>{readinessCategoryLabel(activeReadiness.category, t)}</strong>
                <span>
                  {activeReadiness.contentLevel ?? t('study.rail.levelIncomplete')}
                  {' · '}
                  {t('study.rail.confidence', { value: percent(activeReadiness.confidence) })}
                </span>
              </p>
            </div>
          ) : <p className="muted">{t('study.rail.noReadiness')}</p>}

          {workspace && (
            <>
              <button
                type="button"
                className="study-rail-action"
                onClick={() => setCardPreview(previewInternalStudyCards(workspace))}
              >
                <Icon name="flashcards" size={15} />
                <span>
                  <strong>{t('study.rail.previewLocal')}</strong>
                  <small>{t('study.rail.previewLocalDetail')}</small>
                </span>
              </button>
              <button
                type="button"
                className="study-rail-action"
                onClick={() => void window.api.studyPreviewAnki(workspace.id).then(setAnkiPreview)}
              >
                <Icon name="refresh" size={15} />
                <span>
                  <strong>{t('study.rail.previewAnki')}</strong>
                  <small>{t('study.rail.previewAnkiDetail')}</small>
                </span>
              </button>
              {!isLookupPack && (
                <button
                  type="button"
                  className="study-rail-action"
                  onClick={() => void openContext(workspace.context)}
                >
                  <Icon name="player" size={15} />
                  <span>
                    <strong>{t('study.rail.viewInContext')}</strong>
                    <small>{t('study.rail.viewInContextDetail')}</small>
                  </span>
                </button>
              )}
            </>
          )}

          {cardPreview && workspace && (
            <div className="study-preview-panel">
              <strong>{t('study.cards.previewHeading')}</strong>
              <dl>
                <div><dt>{t('study.cards.selected')}</dt><dd>{cardPreview.totalSelected}</dd></div>
                <div><dt>{t('study.cards.creatable')}</dt><dd>{cardPreview.creatable}</dd></div>
                <div><dt>{t('study.cards.duplicates')}</dt><dd>{cardPreview.internalDuplicates}</dd></div>
              </dl>
              <button
                type="button"
                disabled={!cardPreview.creatable}
                onClick={() => void confirmDialog({
                  title: t('study.cards.confirmTitle'),
                  message: isLookupPack
                    ? t('study.cards.confirmLookup', { count: cardPreview.creatable })
                    : t('study.cards.confirmMedia', { count: cardPreview.creatable }),
                  confirmLabel: t('study.cards.confirmLabel'),
                }).then(async (confirmed) => {
                  if (!confirmed) return;
                  const result = await createInternalStudyCards(workspace);
                  setWorkspace(result.workspace);
                  setStatus(t('study.cards.created', {
                    created: result.createdIds.length,
                    skipped: result.skipped,
                  }));
                })}
              >
                {t('study.cards.create', { count: cardPreview.creatable })}
              </button>
              {workspace.exports.some((entry) => entry.localCardId) && (
                <button type="button" onClick={() => void undoInternalStudyCards(workspace).then(setWorkspace)}>
                  {t('study.cards.undoBatch')}
                </button>
              )}
            </div>
          )}

          {ankiPreview && workspace && (
            <div className="study-preview-panel">
              <strong>{t('study.anki.previewHeading')}</strong>
              <p>{ankiPreview.connected
                ? `${ankiPreview.deckName} · ${ankiPreview.modelName}`
                : translateAnkiReason(ankiPreview.error, t) ?? t('study.anki.unavailable')}</p>
              {ankiPreview.matchedRuleLabel && (
                <p className="muted">
                  {ankiPreview.profileName
                    ? t('study.anki.routedThrough', {
                      rule: ankiPreview.matchedRuleLabel,
                      profile: ankiPreview.profileName,
                    })
                    : t('study.anki.routedBy', { rule: ankiPreview.matchedRuleLabel })}
                </p>
              )}
              <dl>
                <div><dt>{t('study.anki.writable')}</dt><dd>{ankiPreview.writable}</dd></div>
                <div><dt>{t('study.cards.duplicates')}</dt><dd>{ankiPreview.duplicates}</dd></div>
                <div><dt>{t('study.anki.missingContent')}</dt><dd>{ankiPreview.missingContent}</dd></div>
              </dl>
              <button
                type="button"
                disabled={!ankiPreview.connected || !ankiPreview.writable}
                onClick={() => void confirmDialog({
                  title: t('study.anki.confirmTitle'),
                  message: t('study.anki.confirmMessage', {
                    count: ankiPreview.writable,
                    deck: ankiPreview.deckName,
                  }),
                  confirmLabel: t('study.anki.export'),
                }).then(async (confirmed) => {
                  if (!confirmed) return;
                  const result = await window.api.studyExportAnki(workspace.id);
                  setStatus(t('study.anki.exported', {
                    created: result.completed,
                    duplicates: result.duplicates,
                    failed: result.failed,
                  }));
                  setDocument(await window.api.studyGet());
                })}
              >
                {t('study.anki.export')}
              </button>
              {workspace.exports.some((entry) =>
                entry.status === 'created' && typeof entry.ankiNoteId === 'number') && (
                <button
                  type="button"
                  onClick={() => void confirmDialog({
                    title: t('study.anki.undoTitle'),
                    message: t('study.anki.undoMessage'),
                    confirmLabel: t('study.anki.undoConfirm'),
                    danger: true,
                  }).then(async (confirmed) => {
                    if (!confirmed) return;
                    const result = await window.api.studyUndoAnkiExport(workspace.id);
                    if (result.error) {
                      setError(result.error);
                      return;
                    }
                    setAnkiPreview(null);
                    setStatus(t('study.anki.undone', { count: result.deleted }));
                    setDocument(await window.api.studyGet());
                  })}
                >
                  {t('study.anki.undoTitle')}
                </button>
              )}
              <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('os:open', { detail: 'anki' }))}>
                {t('study.anki.openTab')}
              </button>
            </div>
          )}
        </aside>
      </div>

      {busy && <p className="study-global-status" role="status">{t('study.status.working')}</p>}
      {status && <p className="study-global-status" role="status">{status}</p>}
      {lastOpportunityChange && (
        <button
          type="button"
          className="study-global-undo"
          disabled={busy}
          onClick={() => void undoOpportunityChange()}
        >
          {lastOpportunityChange.status === 'snoozed'
            ? t('study.opportunity.undoSnooze')
            : t('study.opportunity.undoDismiss')}
        </button>
      )}
      {error && <p className="study-global-error" role="alert">{error}</p>}
    </div>
  );
}

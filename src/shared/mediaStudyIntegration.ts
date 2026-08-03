import type { MediaItem } from './types';

/** The study actions exposed by every media item in the Media Hub. */
export const MEDIA_STUDY_ACTIONS = [
  'study-episode',
  'mine-vocabulary',
  'create-flashcards',
  'review-sentences',
  'analyze-japanese',
] as const;

export type MediaStudyActionId = (typeof MEDIA_STUDY_ACTIONS)[number];

export const MEDIA_STUDY_EVENT = 'study:media';

export interface MediaStudyRequest {
  mediaId: string;
  title: string;
  action: MediaStudyActionId;
  requestedAt: number;
}

export interface MediaStudyAction {
  id: MediaStudyActionId;
  label: string;
  enabled: boolean;
  reason?: string;
  /**
   * The action can run, but needs a transcript first and will start Whisper
   * before doing its real work. Surfaces let the label say so up front.
   */
  requiresTranscription?: boolean;
}

export interface MediaStudySummary {
  mediaId: string;
  title: string;
  kind: MediaItem['kind'] | 'video';
  jlptLevel: string | null;
  vocabularyCount: number;
  kanjiCount: number;
  lastStudiedAt: number | null;
}

export interface MediaStudyContext {
  /** True when at least one Japanese subtitle/text track is available. */
  hasJapaneseText?: boolean;
  /** True when the item has sentence-level subtitle cues ready for review. */
  hasSentences?: boolean;
  /**
   * A transcription job is queued or running for this item. The analysis action
   * then waits rather than offering to start a second one.
   */
  transcriptionPending?: boolean;
  /** The only Japanese text is a machine transcript, so say so on the button. */
  japaneseIsGenerated?: boolean;
}

const ACTION_LABELS: Record<MediaStudyActionId, string> = {
  'study-episode': 'Study This Episode',
  'mine-vocabulary': 'Mine Vocabulary',
  'create-flashcards': 'Create Flashcards',
  'review-sentences': 'Review Sentences',
  'analyze-japanese': 'Analyze Japanese',
};

const finiteNonNegative = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
);

/** Converts a media item into the stable metadata shared by study surfaces. */
export function buildMediaStudySummary(item: MediaItem): MediaStudySummary {
  return {
    mediaId: item.id,
    title: item.title.trim() || item.fileName.trim() || 'Untitled media',
    kind: item.kind ?? 'video',
    jlptLevel: typeof item.jlptLevel === 'string' && item.jlptLevel.trim() ? item.jlptLevel.trim() : null,
    vocabularyCount: finiteNonNegative(item.vocabularyCount),
    kanjiCount: finiteNonNegative(item.kanjiCount),
    lastStudiedAt: typeof item.lastStudiedAt === 'number' && Number.isFinite(item.lastStudiedAt)
      ? item.lastStudiedAt
      : null,
  };
}

/** Returns the action availability for a media item without touching renderer state. */
export function buildMediaStudyActions(
  item: MediaItem,
  context: MediaStudyContext = {},
): MediaStudyAction[] {
  const hasJapaneseText = context.hasJapaneseText !== false;
  const hasSentences = context.hasSentences !== false;

  return MEDIA_STUDY_ACTIONS.map((id) => {
    if (id === 'review-sentences' && !hasSentences) {
      return { id, label: ACTION_LABELS[id], enabled: false, reason: 'Load subtitles to review sentences.' };
    }
    if (id === 'analyze-japanese') {
      // A job is already running: offering "transcribe" again would queue a
      // duplicate, so the button waits and says why.
      if (!hasJapaneseText && context.transcriptionPending) {
        return {
          id,
          label: 'Waiting for transcription',
          enabled: false,
          requiresTranscription: true,
          reason: 'A transcription is already running for this episode.',
        };
      }
      if (!hasJapaneseText) {
        // Stays actionable with no text: pressing it transcribes the audio and
        // then analyzes, rather than dead-ending on "Japanese text is required".
        return {
          id,
          label: 'Transcribe & Analyze',
          enabled: true,
          requiresTranscription: true,
          reason: 'No transcript yet — this runs Whisper first, then analyzes.',
        };
      }
      // Text exists but a machine made it. Naming that on the button is the
      // difference between trusting the analysis and knowing to check it.
      if (context.japaneseIsGenerated) {
        return {
          id,
          label: 'Analyze generated transcript',
          enabled: true,
          reason: 'The only Japanese text for this episode is machine-generated.',
        };
      }
    }
    return { id, label: ACTION_LABELS[id], enabled: true };
  });
}

export function isMediaStudyActionId(value: unknown): value is MediaStudyActionId {
  return typeof value === 'string' && (MEDIA_STUDY_ACTIONS as readonly string[]).includes(value);
}

/** Creates an event payload that can be persisted or sent through the renderer event bus. */
export function createMediaStudyRequest(
  item: MediaItem,
  action: MediaStudyActionId = 'study-episode',
  requestedAt = Date.now(),
): MediaStudyRequest {
  return {
    mediaId: item.id,
    title: item.title.trim() || item.fileName.trim() || 'Untitled media',
    action,
    requestedAt: Number.isFinite(requestedAt) ? requestedAt : Date.now(),
  };
}

/** Safely reads a study request from a CustomEvent payload or session storage. */
export function parseMediaStudyRequest(value: unknown): MediaStudyRequest | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MediaStudyRequest>;
  if (typeof raw.mediaId !== 'string' || !raw.mediaId.trim() || typeof raw.title !== 'string' || !isMediaStudyActionId(raw.action)) {
    return null;
  }
  return {
    mediaId: raw.mediaId.trim(),
    title: raw.title.trim() || 'Untitled media',
    action: raw.action,
    requestedAt: typeof raw.requestedAt === 'number' && Number.isFinite(raw.requestedAt)
      ? raw.requestedAt
      : Date.now(),
  };
}


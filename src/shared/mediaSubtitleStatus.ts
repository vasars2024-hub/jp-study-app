/**
 * The one-line subtitle/transcription status a library card shows.
 *
 * Deliberately a pure function over explicit evidence rather than something the
 * card computes from whatever happens to be in scope. Two reasons:
 *
 *  - It must be able to say *nothing*. Phase 1 has no subtitle index yet, so a
 *    card with no evidence renders no pill. A cheerful "Japanese subtitles
 *    ready" that was really "we never looked" is worse than a blank line.
 *  - Phases 3 and 4 fill `discovery` and `transcription` in with real data. When
 *    they do, only the inputs change — the precedence rules stay tested here.
 *
 * Precedence is by urgency, not by recency: an error the user can retry outranks
 * a running job, which outranks a settled fact.
 */

export type MediaSubtitleTone = 'ready' | 'neutral' | 'busy' | 'warning' | 'error';

export type MediaTranscriptionPhase =
  | 'queued'
  | 'preparing'
  | 'extracting-audio'
  | 'transcribing'
  | 'aligning'
  | 'done'
  | 'error';

export interface MediaSubtitleEvidence {
  /** Languages found for this item, however they were found. */
  languages?: readonly string[];
  /** True when at least one Japanese track is usable for study. */
  hasJapanese?: boolean;
  /** Provider search state. `undefined` means no search has been attempted. */
  search?: 'idle' | 'searching' | 'failed';
  transcription?: {
    phase: MediaTranscriptionPhase;
    /** 0..1. Rendered as a percentage only when the phase is `transcribing`. */
    progress?: number;
  };
  /** Set when a metadata match landed below the auto-accept threshold. */
  metadataNeedsReview?: boolean;
}

export interface MediaSubtitleStatus {
  tone: MediaSubtitleTone;
  /** i18n key; the caller resolves it, so this module stays language-free. */
  labelKey: string;
  vars?: Record<string, string | number>;
  /** True when the user can do something about it — the card shows Retry. */
  retryable?: boolean;
}

const clampPercent = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 100)));
};

/**
 * Returns the single most useful thing to say about this item's subtitles, or
 * `null` when there is nothing worth a line of the card.
 */
export function mediaSubtitleStatus(evidence: MediaSubtitleEvidence = {}): MediaSubtitleStatus | null {
  const { transcription, search, languages, hasJapanese, metadataNeedsReview } = evidence;

  // 1. Failures the user can act on.
  if (transcription?.phase === 'error') {
    return { tone: 'error', labelKey: 'media.subStatus.transcribeFailed', retryable: true };
  }
  if (search === 'failed') {
    return { tone: 'error', labelKey: 'media.subStatus.failed', retryable: true };
  }

  // 2. Work in flight.
  if (transcription && transcription.phase !== 'done') {
    if (transcription.phase === 'transcribing') {
      return {
        tone: 'busy',
        labelKey: 'media.subStatus.transcribing',
        vars: { percent: clampPercent(transcription.progress) },
      };
    }
    return { tone: 'busy', labelKey: `media.subStatus.phase.${transcription.phase}` };
  }
  if (search === 'searching') {
    return { tone: 'busy', labelKey: 'media.subStatus.searching' };
  }

  // 3. Settled facts, most useful first. Japanese is the reason this app exists,
  //    so it outranks a raw language count even when the count is larger.
  if (hasJapanese) {
    return { tone: 'ready', labelKey: 'media.subStatus.jaReady' };
  }
  const count = languages?.length ?? 0;
  if (count > 0) {
    return { tone: 'neutral', labelKey: 'media.subStatus.languagesFound', vars: { count } };
  }

  // 4. Advisory. Last because it is about metadata, not about studying.
  if (metadataNeedsReview) {
    return { tone: 'warning', labelKey: 'media.subStatus.reviewMatch' };
  }

  // A search that ran and found nothing is a real answer; never having looked is not.
  if (search === 'idle') {
    return { tone: 'neutral', labelKey: 'media.subStatus.none' };
  }
  return null;
}

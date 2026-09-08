import { describe, expect, it } from 'vitest';
import { mediaSubtitleStatus } from '../mediaSubtitleStatus';

describe('mediaSubtitleStatus', () => {
  it('says nothing when nothing has been looked at', () => {
    expect(mediaSubtitleStatus()).toBeNull();
    expect(mediaSubtitleStatus({})).toBeNull();
    expect(mediaSubtitleStatus({ languages: [] })).toBeNull();
  });

  it('distinguishes "searched and found nothing" from "never looked"', () => {
    expect(mediaSubtitleStatus({ search: 'idle' })).toEqual({
      tone: 'neutral',
      labelKey: 'media.subStatus.none',
    });
  });

  it('ranks a retryable failure above everything else', () => {
    expect(mediaSubtitleStatus({
      search: 'failed',
      hasJapanese: true,
      languages: ['ja', 'en'],
    })).toEqual({ tone: 'error', labelKey: 'media.subStatus.failed', retryable: true });

    expect(mediaSubtitleStatus({
      transcription: { phase: 'error' },
      search: 'failed',
    })).toEqual({ tone: 'error', labelKey: 'media.subStatus.transcribeFailed', retryable: true });
  });

  it('reports transcription progress as a whole percentage', () => {
    expect(mediaSubtitleStatus({ transcription: { phase: 'transcribing', progress: 0.4237 } })).toEqual({
      tone: 'busy',
      labelKey: 'media.subStatus.transcribing',
      vars: { percent: 42 },
    });
  });

  it('clamps a nonsense progress value instead of rendering it', () => {
    const of = (progress: number): unknown =>
      mediaSubtitleStatus({ transcription: { phase: 'transcribing', progress } })?.vars?.percent;
    expect(of(-3)).toBe(0);
    expect(of(9)).toBe(100);
    expect(of(Number.NaN)).toBe(0);
  });

  it('names the non-transcribing job phases', () => {
    for (const phase of ['queued', 'preparing', 'extracting-audio', 'aligning'] as const) {
      expect(mediaSubtitleStatus({ transcription: { phase } })).toEqual({
        tone: 'busy',
        labelKey: `media.subStatus.phase.${phase}`,
      });
    }
  });

  it('lets a finished job fall through to the settled facts', () => {
    expect(mediaSubtitleStatus({ transcription: { phase: 'done' }, hasJapanese: true })).toEqual({
      tone: 'ready',
      labelKey: 'media.subStatus.jaReady',
    });
  });

  it('prefers Japanese availability over a larger language count', () => {
    expect(mediaSubtitleStatus({ hasJapanese: true, languages: ['ja', 'en', 'es', 'fr', 'de'] })).toEqual({
      tone: 'ready',
      labelKey: 'media.subStatus.jaReady',
    });
    expect(mediaSubtitleStatus({ languages: ['en', 'es', 'fr', 'de', 'it'] })).toEqual({
      tone: 'neutral',
      labelKey: 'media.subStatus.languagesFound',
      vars: { count: 5 },
    });
  });

  it('puts the metadata advisory last', () => {
    expect(mediaSubtitleStatus({ metadataNeedsReview: true, hasJapanese: true })?.labelKey)
      .toBe('media.subStatus.jaReady');
    expect(mediaSubtitleStatus({ metadataNeedsReview: true })).toEqual({
      tone: 'warning',
      labelKey: 'media.subStatus.reviewMatch',
    });
  });

  it('marks only actionable states as retryable', () => {
    expect(mediaSubtitleStatus({ search: 'failed' })?.retryable).toBe(true);
    expect(mediaSubtitleStatus({ search: 'searching' })?.retryable).toBeUndefined();
    expect(mediaSubtitleStatus({ hasJapanese: true })?.retryable).toBeUndefined();
  });

  /**
   * D316, the exact live shape: The Big O holds Japanese on episodes 1-13 and nothing on
   * 14-26, and episode 1 is the card's primary — so `hasJapanese` was true and 26 episodes
   * were described as "ready". A user studies to episode 13 and the subtitles stop.
   */
  describe('a card that stands for several episodes', () => {
    it('refuses to call a half-covered series ready, and says how far it goes', () => {
      expect(mediaSubtitleStatus({ hasJapanese: true, japanese: { have: 13, of: 26 } })).toEqual({
        tone: 'neutral',
        labelKey: 'media.subStatus.jaPartial',
        vars: { have: 13, of: 26 },
      });
    });

    it('CONTROL: a fully covered series is still ready', () => {
      // The fix must not demote every group — a series with every episode covered is exactly
      // what "ready" is for, and a fraction there would be noise.
      expect(mediaSubtitleStatus({ hasJapanese: true, japanese: { have: 26, of: 26 } })).toEqual({
        tone: 'ready',
        labelKey: 'media.subStatus.jaReady',
      });
    });

    it('CONTROL: a single-file card is unchanged, because it passes no fraction', () => {
      // `grouping === 'none'` omits `japanese` entirely, so the primary stays the subject.
      expect(mediaSubtitleStatus({ hasJapanese: true })).toEqual({
        tone: 'ready',
        labelKey: 'media.subStatus.jaReady',
      });
      // And a group of one cannot be "partial" — of > 1 is required.
      expect(mediaSubtitleStatus({ hasJapanese: true, japanese: { have: 1, of: 1 } })?.labelKey)
        .toBe('media.subStatus.jaReady');
    });

    it('says nothing partial about a series with no Japanese at all', () => {
      // 0 of 26 is not partial coverage, it is no coverage — and `search` decides how that
      // is worded, exactly as before.
      expect(mediaSubtitleStatus({ japanese: { have: 0, of: 26 }, search: 'idle' })).toEqual({
        tone: 'neutral',
        labelKey: 'media.subStatus.none',
      });
      expect(mediaSubtitleStatus({ japanese: { have: 0, of: 26 } })).toBeNull();
    });

    it('speaks up when the opened episode has none but its siblings do', () => {
      // The inverse of the live case: primary uncovered, siblings covered. Saying nothing
      // would hide the one fact that could send the user to an episode that works.
      expect(mediaSubtitleStatus({ hasJapanese: false, japanese: { have: 13, of: 26 } })).toEqual({
        tone: 'neutral',
        labelKey: 'media.subStatus.jaPartial',
        vars: { have: 13, of: 26 },
      });
    });

    it('keeps its place in the precedence order — urgency still wins', () => {
      // A partial series with a retryable failure must still show the failure.
      expect(mediaSubtitleStatus({ search: 'failed', japanese: { have: 13, of: 26 } })?.labelKey)
        .toBe('media.subStatus.failed');
      expect(mediaSubtitleStatus({
        transcription: { phase: 'transcribing', progress: 0.5 },
        japanese: { have: 13, of: 26 },
      })?.labelKey).toBe('media.subStatus.transcribing');
    });
  });
});

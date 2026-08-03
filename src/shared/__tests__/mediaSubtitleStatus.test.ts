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
});

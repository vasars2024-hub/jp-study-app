import { describe, expect, it } from 'vitest';
import type { MediaItem } from '../types';
import {
  buildMediaStudyActions,
  buildMediaStudySummary,
  createMediaStudyRequest,
  isMediaStudyActionId,
  parseMediaStudyRequest,
} from '../mediaStudyIntegration';

const item = (extra: Partial<MediaItem> = {}): MediaItem => ({
  id: 'media-1',
  title: '  Frieren S01E01  ',
  fileName: 'Frieren S01E01.mkv',
  path: 'C:/media/frieren.mkv',
  addedAt: 1,
  ...extra,
});

describe('media study integration', () => {
  it('normalizes a media item into shared learning metadata', () => {
    expect(buildMediaStudySummary(item({ jlptLevel: ' N3 ', vocabularyCount: 12, kanjiCount: 6 }))).toEqual({
      mediaId: 'media-1',
      title: 'Frieren S01E01',
      kind: 'video',
      jlptLevel: 'N3',
      vocabularyCount: 12,
      kanjiCount: 6,
      lastStudiedAt: null,
    });
  });

  it('disables sentence review, but offers analysis as transcribe-first, when source text is missing', () => {
    const actions = buildMediaStudyActions(item(), { hasJapaneseText: false, hasSentences: false });
    expect(actions.find((action) => action.id === 'review-sentences')).toMatchObject({ enabled: false });
    // Analysis stays actionable: it runs Whisper first, then analyzes.
    expect(actions.find((action) => action.id === 'analyze-japanese')).toMatchObject({
      enabled: true,
      requiresTranscription: true,
      label: 'Transcribe & Analyze',
    });
    expect(actions.filter((action) => action.enabled).map((action) => action.id)).toEqual([
      'study-episode', 'mine-vocabulary', 'create-flashcards', 'analyze-japanese',
    ]);
  });

  it('keeps analysis a plain action once Japanese text exists', () => {
    const actions = buildMediaStudyActions(item(), { hasJapaneseText: true, hasSentences: true });
    expect(actions.find((action) => action.id === 'analyze-japanese')).toMatchObject({
      enabled: true,
      label: 'Analyze Japanese',
    });
    expect(actions.find((action) => action.id === 'analyze-japanese')?.requiresTranscription).toBeUndefined();
  });

  it('round-trips and validates event requests', () => {
    const request = createMediaStudyRequest(item(), 'create-flashcards', 123);
    expect(parseMediaStudyRequest(request)).toEqual(request);
    expect(parseMediaStudyRequest({ ...request, action: 'nope' })).toBeNull();
    expect(isMediaStudyActionId('analyze-japanese')).toBe(true);
    expect(isMediaStudyActionId('nope')).toBe(false);
  });
});


describe('analyze-japanese gating', () => {
  const analyze = (context: Parameters<typeof buildMediaStudyActions>[1]) =>
    buildMediaStudyActions(item(), context).find((a) => a.id === 'analyze-japanese');

  it('offers transcribe-and-analyze when there is no Japanese text', () => {
    const action = analyze({ hasJapaneseText: false });
    expect(action?.enabled).toBe(true);
    expect(action?.requiresTranscription).toBe(true);
    expect(action?.label).toBe('Transcribe & Analyze');
  });

  it('waits instead of queueing a second job while one is running', () => {
    const action = analyze({ hasJapaneseText: false, transcriptionPending: true });
    expect(action?.enabled).toBe(false);
    expect(action?.label).toBe('Waiting for transcription');
  });

  it('names a machine transcript on the button rather than hiding it', () => {
    const action = analyze({ hasJapaneseText: true, japaneseIsGenerated: true });
    expect(action?.enabled).toBe(true);
    expect(action?.label).toBe('Analyze generated transcript');
  });

  it('is a plain analyze action for real Japanese subtitles', () => {
    const action = analyze({ hasJapaneseText: true });
    expect(action?.enabled).toBe(true);
    expect(action?.label).toBe('Analyze Japanese');
    expect(action?.requiresTranscription).toBeUndefined();
  });

  it('ignores a pending transcription once real text exists', () => {
    const action = analyze({ hasJapaneseText: true, transcriptionPending: true });
    expect(action?.enabled).toBe(true);
    expect(action?.label).toBe('Analyze Japanese');
  });
});

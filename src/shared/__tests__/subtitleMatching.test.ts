import { describe, expect, it } from 'vitest';
import { bestSubtitleMatch, matchSubtitleTracks, mismatchedAutoSubtitleIds } from '../subtitleMatching';
import type { SubtitleRecord } from '../subtitleRecord';
import { normalizeSubtitleProvidersDocument, type SubtitleProvidersDocument } from '../subtitleProviders';

const ALL_SIGNALS = ['title', 'episode', 'season', 'year', 'release-group', 'duration', 'language'];

const docOf = (input: Record<string, unknown>): SubtitleProvidersDocument =>
  normalizeSubtitleProvidersDocument(input).value;

const catalogue = (tracks: Record<string, unknown>[], matchSignals: string[] = ALL_SIGNALS): SubtitleProvidersDocument =>
  docOf({
    providers: [{ id: 'subs', name: 'Subs', priority: 10, matchSignals }],
    tracks: tracks.map((entry) => ({ providerId: 'subs', identityId: 'mid-1', language: 'ja', ...entry })),
  });

describe('matchSubtitleTracks', () => {
  it('reports no-tracks for an empty shelf', () => {
    const result = matchSubtitleTracks(catalogue([]), { identityId: 'mid-1', language: 'ja' });
    expect(result.status).toBe('no-tracks');
    expect(result.candidates).toEqual([]);
  });

  it('scopes the pool to the target identity', () => {
    const document = catalogue([
      { id: 'mine', identityId: 'mid-1' },
      { id: 'theirs', identityId: 'mid-2' },
    ]);
    const result = matchSubtitleTracks(document, { identityId: 'mid-2' });
    expect(result.candidates.map((entry) => entry.trackId)).toEqual(['theirs']);
  });

  it('rejects a wrong-episode candidate outright', () => {
    const document = catalogue([
      { id: 'ep-3', title: 'Show', season: 1, episode: 3 },
      { id: 'ep-4', title: 'Show', season: 1, episode: 4 },
    ]);
    const result = matchSubtitleTracks(document, {
      identityId: 'mid-1', title: 'Show', season: 1, episode: 3, language: 'ja',
    });
    expect(result.candidates.map((entry) => entry.trackId)).toEqual(['ep-3']);
    expect(result.rejected.map((entry) => entry.trackId)).toEqual(['ep-4']);
    expect(result.rejected[0].rejectedBy).toEqual(['episode']);
    expect(result.rejected[0].score).toBe(0);
  });

  it('rejects the wrong language', () => {
    const document = catalogue([
      { id: 'ja', language: 'ja', title: 'Show' },
      { id: 'en', language: 'en', title: 'Show' },
    ]);
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show', language: 'en' });
    expect(result.candidates.map((entry) => entry.trackId)).toEqual(['en']);
    expect(result.rejected[0].rejectedBy).toEqual(['language']);
  });

  it('treats a mismatched year, group or duration as a penalty, not a rejection', () => {
    const document = catalogue([
      { id: 'remaster', title: 'Show', language: 'ja', year: 2021, releaseGroup: 'OtherGroup', durationSeconds: 1_800 },
    ]);
    const result = matchSubtitleTracks(document, {
      identityId: 'mid-1', title: 'Show', language: 'ja', year: 2009, releaseGroup: 'BestGroup', durationSeconds: 1_420,
    });
    expect(result.status).toBe('ready');
    const [candidate] = result.candidates;
    expect(candidate.rejectedBy).toEqual([]);
    expect(candidate.score).toBeGreaterThan(0);
    expect(candidate.score).toBeLessThan(100);
    expect(candidate.confidence).toBe('strong');
  });

  it('counts a signal neither side can decide as unknown, with no score weight', () => {
    const document = catalogue([{ id: 'bare', title: 'Show', language: 'ja' }]);
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show', language: 'ja' });
    const [candidate] = result.candidates;
    const unknown = candidate.signals.filter((signal) => signal.state === 'unknown').map((signal) => signal.signal);
    expect(unknown.sort()).toEqual(['duration', 'episode', 'release-group', 'season', 'year']);
    expect(candidate.signals.every((signal) => signal.state !== 'unknown' || signal.weight === 0)).toBe(true);
    expect(candidate.score).toBe(100);
    // Not every declared signal was decided, so this is strong rather than exact.
    expect(candidate.confidence).toBe('strong');
  });

  it('grades a fully decided, fully matched candidate as exact', () => {
    const document = catalogue(
      [{ id: 'perfect', title: 'Show', language: 'ja', season: 1, episode: 3 }],
      ['title', 'language', 'season', 'episode'],
    );
    const result = matchSubtitleTracks(document, {
      identityId: 'mid-1', title: 'Show', language: 'ja', season: 1, episode: 3,
    });
    expect(result.candidates[0].confidence).toBe('exact');
    expect(result.candidates[0].score).toBe(100);
  });

  it('matches a release title that wraps the work title in tags', () => {
    const document = catalogue([{ id: 'tagged', title: '[BestGroup] Show Title - 03 [1080p]', language: 'ja' }]);
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show Title', language: 'ja' });
    expect(result.candidates[0].signals.find((signal) => signal.signal === 'title')?.state).toBe('match');
  });

  it('matches alternative titles and folds diacritics like the identity engine', () => {
    const document = catalogue([{ id: 'romaji', title: 'Tokyo Kitan', language: 'ja' }]);
    const result = matchSubtitleTracks(document, {
      identityId: 'mid-1', title: 'Nothing Alike', alternativeTitles: ['Tōkyō Kitan'], language: 'ja',
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].signals.find((signal) => signal.signal === 'title')?.state).toBe('match');
  });

  it('honours the duration tolerance', () => {
    const document = catalogue([{ id: 'close', title: 'Show', language: 'ja', durationSeconds: 1_420 }]);
    const target = { identityId: 'mid-1', title: 'Show', language: 'ja', durationSeconds: 1_400 };
    const lenient = matchSubtitleTracks(document, target);
    const strict = matchSubtitleTracks(document, target, { durationToleranceSeconds: 5 });
    expect(lenient.candidates[0].signals.find((signal) => signal.signal === 'duration')?.state).toBe('match');
    expect(strict.candidates[0].signals.find((signal) => signal.signal === 'duration')?.state).toBe('mismatch');
  });

  it('applies only the provider\'s declared matching rules', () => {
    // This provider never looks at the episode, so a wrong episode cannot reject.
    const document = catalogue([{ id: 'loose', title: 'Show', language: 'ja', episode: 9 }], ['title', 'language']);
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show', language: 'ja', episode: 1 });
    expect(result.candidates.map((entry) => entry.trackId)).toEqual(['loose']);
    expect(result.candidates[0].signals.map((signal) => signal.signal)).toEqual(['title', 'language']);
  });

  it('nudges an unwanted style down without rejecting it', () => {
    const document = catalogue([
      { id: 'full', title: 'Show', language: 'ja', style: 'full' },
      { id: 'signs', title: 'Show', language: 'ja', style: 'signs-songs' },
    ]);
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show', language: 'ja', style: 'full' });
    expect(result.candidates.map((entry) => entry.trackId)).toEqual(['full', 'signs']);
    expect(result.candidates[1].score).toBeLessThan(result.candidates[0].score);
  });

  it('breaks score ties by quality, then provider priority, then track ID', () => {
    const document = docOf({
      providers: [
        { id: 'a-subs', name: 'A', priority: 10, matchSignals: ['title', 'language'] },
        { id: 'b-subs', name: 'B', priority: 99, matchSignals: ['title', 'language'] },
      ],
      tracks: [
        { id: 't-low', providerId: 'b-subs', identityId: 'mid-1', language: 'ja', title: 'Show', quality: { accuracy: 40 } },
        { id: 't-high', providerId: 'b-subs', identityId: 'mid-1', language: 'ja', title: 'Show', quality: { accuracy: 95 }, releaseGroup: 'X' },
        { id: 't-none', providerId: 'a-subs', identityId: 'mid-1', language: 'ja', title: 'Show' },
      ],
    });
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show', language: 'ja' });
    expect(result.candidates.map((entry) => entry.trackId)).toEqual(['t-high', 't-low', 't-none']);
  });

  it('reports no-matches when every candidate is rejected', () => {
    const document = catalogue([{ id: 'wrong', title: 'Show', language: 'en' }]);
    const result = matchSubtitleTracks(document, { identityId: 'mid-1', title: 'Show', language: 'ja' });
    expect(result.status).toBe('no-matches');
    expect(result.rejected).toHaveLength(1);
    expect(bestSubtitleMatch(document, { identityId: 'mid-1', title: 'Show', language: 'ja' })).toBeNull();
  });

  it('is deterministic for the same inputs', () => {
    const document = catalogue([
      { id: 'a', title: 'Show', language: 'ja', episode: 1 },
      { id: 'b', title: 'Show', language: 'ja', episode: 1, releaseGroup: 'G' },
    ]);
    const target = { identityId: 'mid-1', title: 'Show', language: 'ja', episode: 1 };
    expect(matchSubtitleTracks(document, target)).toEqual(matchSubtitleTracks(document, target));
  });
});

describe('mismatchedAutoSubtitleIds', () => {
  const record = (over: Partial<SubtitleRecord> = {}): SubtitleRecord => ({
    id: 'r1',
    lang: 'ja',
    source: 'provider',
    format: 'srt',
    path: 'subtitles/x/a.srt',
    addedAt: 0,
    ...over,
  });

  /** The real row: episode 1's 267-cue script sitting on a creditless opening. */
  const bigOExtra = {
    episode: undefined,
    subtitles: [record({
      id: 'jimaku-e01',
      label: 'The Big O.E01.Bandai.ja.srt',
      providerItemId: 'jimaku:1178:The Big O.E01.Bandai.ja.srt',
      confidence: 100,
    })],
  };

  it('names a numbered provider track auto-attached to an item with no episode', () => {
    expect(mismatchedAutoSubtitleIds(bigOExtra)).toEqual(['jimaku-e01']);
  });

  it('leaves a numbered item alone, however the track is named', () => {
    expect(mismatchedAutoSubtitleIds({ ...bigOExtra, episode: 1 })).toEqual([]);
    expect(mismatchedAutoSubtitleIds({ ...bigOExtra, episode: 13 })).toEqual([]);
  });

  it('keeps a track whose name declares no episode, because that is not a disagreement', () => {
    expect(mismatchedAutoSubtitleIds({
      episode: undefined,
      subtitles: [record({ id: 'pack', label: 'The Big O.Complete.Bandai.ja.srt' })],
    })).toEqual([]);
  });

  it('never touches a track the matcher did not choose', () => {
    for (const source of ['embedded', 'sidecar', 'generated'] as const) {
      expect(mismatchedAutoSubtitleIds({
        episode: null,
        subtitles: [record({ id: source, source, label: 'The Big O.E01.Bandai.ja.srt' })],
      })).toEqual([]);
    }
  });

  it('falls back to the provider item id when a record carries no label', () => {
    expect(mismatchedAutoSubtitleIds({
      episode: undefined,
      subtitles: [record({ id: 'no-label', label: undefined, providerItemId: 'jimaku:1178:The Big O.E01.Bandai.ja.srt' })],
    })).toEqual(['no-label']);
  });

  it('drops only the mismatched records and returns the rest untouched', () => {
    const ids = mismatchedAutoSubtitleIds({
      episode: undefined,
      subtitles: [
        record({ id: 'bad', label: 'The Big O.E01.Bandai.ja.srt' }),
        record({ id: 'pack', label: 'The Big O.Bandai.ja.srt' }),
        record({ id: 'mine', source: 'sidecar', label: 'The Big O.E01.ja.srt' }),
      ],
    });
    expect(ids).toEqual(['bad']);
  });

  it('is empty for an item with no subtitles at all', () => {
    expect(mismatchedAutoSubtitleIds({ episode: undefined })).toEqual([]);
    expect(mismatchedAutoSubtitleIds({ episode: undefined, subtitles: [] })).toEqual([]);
  });
});

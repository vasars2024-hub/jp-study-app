import { describe, expect, it } from 'vitest';
import {
  releaseTokens,
  scoreReleaseCandidates,
  type ReleaseCandidate,
  type ReleaseTarget,
} from '../subtitleDiscoveryScoring';

function candidate(over: Partial<ReleaseCandidate> = {}): ReleaseCandidate {
  return {
    providerId: 'opensubtitles',
    providerItemId: 'opensubtitles:1',
    language: 'en',
    format: 'srt',
    releaseName: 'Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND',
    featureTitle: 'Breaking Bad',
    season: 1,
    episode: 3,
    year: 2008,
    releaseGroup: null,
    hearingImpaired: false,
    hashMatch: false,
    downloads: 500,
    matchBasis: 'query',
    ...over,
  };
}

const episode: ReleaseTarget = {
  titles: ['Breaking Bad'],
  season: 1,
  episode: 3,
  year: 2008,
  fileName: 'Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND.mkv',
  resolution: 720,
};

const film: ReleaseTarget = {
  titles: ['Spirited Away', '千と千尋の神隠し'],
  season: null,
  episode: null,
  year: 2001,
  fileName: 'Spirited.Away.2001.1080p.BluRay.mkv',
};

describe('releaseTokens', () => {
  it('reads a scene name: trailing group, resolution, source', () => {
    expect(releaseTokens('Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND.srt'))
      .toEqual({ group: 'demand', resolution: 720, source: 'bluray' });
  });

  it('reads a fansub name: leading bracket group, WEB source', () => {
    expect(releaseTokens('[SubsPlease] Frieren - 07 (1080p) [WEB-DL].mkv'))
      .toEqual({ group: 'subsplease', resolution: 1080, source: 'web' });
  });

  it('does not mistake a codec or a number for a group', () => {
    expect(releaseTokens('Show.S01E01.1080p.WEB.h264').group).toBeNull();
    expect(releaseTokens('Show.S01E01-720').group).toBeNull();
    expect(releaseTokens('')).toEqual({ group: null, resolution: null, source: null });
  });
});

describe('scoreReleaseCandidates — the tiers', () => {
  it('a hash match scores 100 and needs no title agreement', () => {
    const out = scoreReleaseCandidates(
      [candidate({ hashMatch: true, releaseName: 'totally-unrelated-name', featureTitle: null })],
      episode,
      'en',
      70,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ score: 100, basis: 'hash' });
  });

  it('an id match is accepted even when the release name is in another script', () => {
    const out = scoreReleaseCandidates(
      [candidate({
        matchBasis: 'id',
        language: 'ja',
        releaseName: '千と千尋の神隠し',
        featureTitle: null,
        season: null,
        episode: null,
        year: 2001,
      })],
      film,
      'ja',
      70,
    );
    expect(out[0]?.basis).toBe('id');
    expect(out[0]?.score).toBeGreaterThanOrEqual(88);
  });

  it('a title query must agree on the title', () => {
    const wrong = candidate({ releaseName: 'Better.Call.Saul.S01E03', featureTitle: 'Better Call Saul' });
    expect(scoreReleaseCandidates([wrong], episode, 'en', 70)).toEqual([]);
    expect(scoreReleaseCandidates([candidate()], episode, 'en', 70)).toHaveLength(1);
  });

  it('a title query for a film refuses a namesake from another year', () => {
    const remake = candidate({
      releaseName: 'The.Thing.2011.1080p', featureTitle: 'The Thing', season: null, episode: null, year: 2011,
    });
    const original = { ...remake, providerItemId: 'opensubtitles:2', releaseName: 'The.Thing.1982.1080p', year: 1982 };
    const target: ReleaseTarget = { titles: ['The Thing'], season: null, episode: null, year: 1982 };
    const out = scoreReleaseCandidates([remake, original], target, 'en', 70);
    expect(out.map((entry) => entry.candidate.providerItemId)).toEqual(['opensubtitles:2']);
  });

  it('hash leads, then id, then query', () => {
    const out = scoreReleaseCandidates([
      candidate({ providerItemId: 'q', matchBasis: 'query', downloads: 99_999 }),
      candidate({ providerItemId: 'i', matchBasis: 'id' }),
      candidate({ providerItemId: 'h', hashMatch: true }),
    ], episode, 'en', 70);
    expect(out.map((entry) => entry.candidate.providerItemId)).toEqual(['h', 'i', 'q']);
  });
});

describe('scoreReleaseCandidates — never the wrong episode', () => {
  it('rejects a different episode, even from an id search', () => {
    expect(scoreReleaseCandidates([candidate({ matchBasis: 'id', episode: 4 })], episode, 'en', 70)).toEqual([]);
  });

  it('rejects a row that does not say which episode it is, unless it is a hash match', () => {
    expect(scoreReleaseCandidates([candidate({ matchBasis: 'id', episode: null })], episode, 'en', 70)).toEqual([]);
    expect(scoreReleaseCandidates([candidate({ hashMatch: true, episode: null })], episode, 'en', 70)).toHaveLength(1);
  });

  it('never gives a film an episode\'s lines', () => {
    const numbered = candidate({ matchBasis: 'id', featureTitle: 'Spirited Away', releaseName: 'Spirited.Away', episode: 1, season: null, year: 2001 });
    expect(scoreReleaseCandidates([numbered], film, 'en', 70)).toEqual([]);
  });

  it('rejects a different season', () => {
    expect(scoreReleaseCandidates([candidate({ matchBasis: 'id', season: 2 })], episode, 'en', 70)).toEqual([]);
  });
});

describe('scoreReleaseCandidates — release similarity', () => {
  it('prefers the release this file came from', () => {
    const out = scoreReleaseCandidates([
      candidate({ providerItemId: 'web', releaseName: 'Breaking.Bad.S01E03.1080p.WEB-DL-OTHER', downloads: 5000 }),
      candidate({ providerItemId: 'same', releaseName: 'Breaking.Bad.S01E03.720p.BluRay.x264-DEMAND', downloads: 10 }),
    ], episode, 'en', 70);
    expect(out[0].candidate.providerItemId).toBe('same');
    expect(out[0].reasons).toEqual(expect.arrayContaining(['group', 'resolution', 'source']));
  });

  it('breaks a tie on downloads', () => {
    const out = scoreReleaseCandidates([
      candidate({ providerItemId: 'few', releaseName: 'Breaking Bad S01E03', downloads: 3 }),
      candidate({ providerItemId: 'many', releaseName: 'Breaking Bad S01E03', downloads: 30 }),
    ], { ...episode, fileName: null, resolution: null }, 'en', 0);
    expect(out[0].candidate.providerItemId).toBe('many');
  });

  it('drops a machine-translated track below the bar', () => {
    expect(scoreReleaseCandidates([candidate({ machineTranslated: true })], episode, 'en', 70)).toEqual([]);
  });

  it('only scores the requested base language', () => {
    const out = scoreReleaseCandidates([
      candidate({ providerItemId: 'pt', language: 'pt-br' }),
      candidate({ providerItemId: 'en', language: 'en' }),
    ], episode, 'pt', 70);
    expect(out.map((entry) => entry.candidate.providerItemId)).toEqual(['pt']);
  });
});

// @vitest-environment node
/**
 * Style, hearing-impaired and preferred-group preferences reach the ranking
 * (they used to be stored in the renderer where nothing read them), and the
 * track grade combines match, sync and the learner's rating.
 */
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { preferredGroupBonus, scoreCandidates, styleOfRelease } from '../subtitleDiscovery';
import { normalizeSubtitleDiscoverySettings } from '../../shared/subtitleDiscoveryIpc';
import { normalizeTrackRating, subtitleTrackGrade, syncGradeFromEstimate } from '../../shared/subtitleTrackGrade';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'subrank-test-'));
vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  ipcMain: { handle: () => undefined },
  BrowserWindow: { getAllWindows: () => [] },
  net: { request: () => undefined },
  safeStorage: { isEncryptionAvailable: () => false },
}));

type Candidate = Parameters<typeof scoreCandidates>[0][number];
const candidate = (over: Partial<Candidate> = {}): Candidate => ({
  providerId: 'opensubtitles',
  providerItemId: 'os:1',
  language: 'ja',
  format: 'srt',
  releaseName: 'The Big O - 07 [BDRip]',
  season: null,
  episode: 7,
  releaseGroup: null,
  hearingImpaired: false,
  hashMatch: false,
  downloads: 100,
  fetchToken: '1',
  ...over,
});
const item = {
  id: 'm1', title: 'The Big O - 07', seriesTitle: 'The Big O', seriesKey: 'the big o',
  fileName: 'The Big O - 07.mkv', path: 'C:/x/The Big O - 07.mkv', addedAt: 1, episode: 7,
  durationSec: 1425,
} as Parameters<typeof scoreCandidates>[1];

describe('subtitle ranking preferences', () => {
  it('reads a track kind from its release name', () => {
    expect(styleOfRelease('[Group] Show - 01 Signs & Songs')).toBe('signs-songs');
    expect(styleOfRelease('Show.S01E01.FORCED.srt')).toBe('forced');
    expect(styleOfRelease('Show - 01 [BDRip]')).toBe('full');
  });

  it('drops hearing-impaired tracks only when asked to', () => {
    const list = [candidate({ providerItemId: 'os:hi', hearingImpaired: true }), candidate({ providerItemId: 'os:plain' })];
    expect(scoreCandidates(list, item, 'ja', 0).map((s) => s.candidate.providerItemId)).toContain('os:hi');
    expect(scoreCandidates(list, item, 'ja', 0, { allowHearingImpaired: false }).map((s) => s.candidate.providerItemId)).toEqual(['os:plain']);
  });

  it('ranks the preferred group first among otherwise equal tracks', () => {
    const list = [
      candidate({ providerItemId: 'os:a', releaseGroup: 'Kaizoku', downloads: 500 }),
      candidate({ providerItemId: 'os:b', releaseGroup: 'Kitsunekko', downloads: 10 }),
    ];
    expect(scoreCandidates(list, item, 'ja', 0)[0].candidate.providerItemId).toBe('os:a');
    const preferred = scoreCandidates(list, item, 'ja', 0, { preferredGroups: ['kitsunekko'] });
    expect(preferred[0].candidate.providerItemId).toBe('os:b');
    expect(preferredGroupBonus('Kitsunekko', ['kitsunekko'])).toBeGreaterThan(0);
    expect(preferredGroupBonus(null, ['x'])).toBe(0);
  });

  it('prefers the chosen style without refusing the others', () => {
    const list = [
      candidate({ providerItemId: 'os:full', releaseName: 'The Big O - 07 [BDRip]' }),
      candidate({ providerItemId: 'os:ss', releaseName: 'The Big O - 07 Signs & Songs' }),
    ];
    const signs = scoreCandidates(list, item, 'ja', 0, { style: 'signs-songs' });
    expect(signs.map((s) => s.candidate.providerItemId)).toContain('os:full');
    expect(signs[0].candidate.providerItemId).toBe('os:ss');
  });

  it('keeps the new settings through normalisation', () => {
    const s = normalizeSubtitleDiscoverySettings({ style: 'forced', allowHearingImpaired: false, preferredGroups: [' A ', 'A', 'B', 3] });
    expect(s.style).toBe('forced');
    expect(s.allowHearingImpaired).toBe(false);
    expect(s.preferredGroups).toEqual(['A', 'B']);
    const d = normalizeSubtitleDiscoverySettings({});
    expect(d.style).toBe('full');
    expect(d.allowHearingImpaired).toBe(true);
  });
});

describe('subtitle track grade', () => {
  it('grades timing from the offset estimate', () => {
    expect(syncGradeFromEstimate({ score: 10, rivalScore: 3, confident: true })).toBe('A');
    expect(syncGradeFromEstimate({ score: 10, rivalScore: 8, confident: true })).toBe('B');
    expect(syncGradeFromEstimate({ score: 1, rivalScore: 1, confident: false })).toBe('C');
  });

  it('combines match and sync, and lets the learner overrule both', () => {
    expect(subtitleTrackGrade({ source: 'provider', confidence: 95, syncGrade: 'A' })).toBe('A');
    expect(subtitleTrackGrade({ source: 'provider', confidence: 60, syncGrade: 'C' })).toBe('D');
    expect(subtitleTrackGrade({ source: 'provider', confidence: 60, syncGrade: 'C', userRating: 5 })).toBe('A');
    expect(subtitleTrackGrade({ source: 'provider', confidence: 70, hashMatch: true })).toBe('B');
    expect(subtitleTrackGrade({ source: 'embedded' })).toBe('A');
    expect(subtitleTrackGrade({ source: 'generated' })).toBeNull();
    expect(normalizeTrackRating(9)).toBe(5);
    expect(normalizeTrackRating('x')).toBe(0);
  });
});

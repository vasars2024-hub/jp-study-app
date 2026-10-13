/**
 * Disk or media server (`shared/playbackPlan.ts`): which local opens skip the sidecar.
 */
import { describe, expect, it } from 'vitest';
import { routeLocalPlayback, type PlaybackPlan } from '../playbackPlan';

const DIRECT: PlaybackPlan['direct'] = { verdict: 'direct', reason: 'mp4 h264+aac', container: 'mp4', subtitles: 0 };
const SIDECAR: PlaybackPlan['direct'] = { verdict: 'sidecar', reason: '1 embedded subtitle track(s)', container: 'matroska', subtitles: 1 };
const UNKNOWN: PlaybackPlan['direct'] = { verdict: 'unknown', reason: 'container not recognized', container: 'unknown', subtitles: 0 };

describe('routeLocalPlayback', () => {
  it('a file that is not on disk is missing, whatever else is known', () => {
    expect(routeLocalPlayback({ url: null, item: null, direct: DIRECT })).toBe('missing');
  });

  it('a known non-anime library row plays from disk even when the probe is unsure', () => {
    const item = { id: 'a', title: 'Midnight Kitchen', category: 'drama' };
    expect(routeLocalPlayback({ url: 'playfile://x', item, direct: UNKNOWN })).toBe('direct');
    expect(routeLocalPlayback({ url: 'playfile://x', item, direct: SIDECAR })).toBe('direct');
  });

  it('an anime episode plays from disk when the probe says Chromium can', () => {
    const item = { id: 'b', title: 'Frieren', anilistId: 154587, episode: 3 };
    expect(routeLocalPlayback({ url: 'playfile://x', item, direct: DIRECT })).toBe('direct');
  });

  it('an anime MKV with embedded subtitles keeps the media server (its parser feeds the study line)', () => {
    const item = { id: 'b', title: 'Frieren', anilistId: 154587, episode: 3 };
    expect(routeLocalPlayback({ url: 'playfile://x', item, direct: SIDECAR })).toBe('sidecar');
  });

  it('a file the library has never seen follows the probe, and an unreadable one keeps the server', () => {
    expect(routeLocalPlayback({ url: 'playfile://x', item: null, direct: DIRECT })).toBe('direct');
    expect(routeLocalPlayback({ url: 'playfile://x', item: null, direct: UNKNOWN })).toBe('sidecar');
  });

  it('a row filed as anime without ids is still anime', () => {
    const item = { id: 'c', title: 'Some show', category: 'anime' };
    expect(routeLocalPlayback({ url: 'playfile://x', item, direct: UNKNOWN })).toBe('sidecar');
  });
});

import { describe, expect, it } from 'vitest';
import { buildPlayerDiagnosticReport, type PlayerDiagnosticInput } from '../playerDiagnostics';

// The report is about the player that plays (round-2 audit B): the Seanime
// server and transcoder, the VideoCore element, the GPU and the decoders. The
// old snapshot (a fresh `<video>`'s canPlayType, `videoRef`'s readyState) is
// gone with the element it probed.
const input = (patch: Partial<PlayerDiagnosticInput> = {}): PlayerDiagnosticInput => ({
  server: { state: 'running', version: '2.9.0', reachable: true },
  mediastream: { transcodeEnabled: true, hwAccel: 'd3d11va', ffmpegConfigured: true, directPlayOnly: false },
  playback: {
    streamType: 'transcode',
    video: { readyState: 4, networkState: 1, width: 1920, height: 1080, durationSec: 1400 },
    audioTracks: ['Japanese'],
    subtitleTracks: ['Japanese', 'English'],
    cueCount: 300,
  },
  gpu: { webgl: true, renderer: 'ANGLE (Intel UHD 620)' },
  decoders: {
    h264: { supported: true, hardware: true },
    hevc: { supported: true, hardware: true },
    vp9: { supported: true, hardware: false },
    av1: { supported: false, hardware: false },
  },
  ...patch,
});

describe('player diagnostics', () => {
  it('passes a healthy setup and counts by status', () => {
    const report = buildPlayerDiagnosticReport(input(), 42);
    expect(report.generatedAt).toBe(42);
    expect(report.failCount).toBe(0);
    expect(report.checks.find((c) => c.id === 'decoder-av1')?.status).toBe('warning');
    expect(report.passCount + report.warningCount + report.failCount
      + report.checks.filter((c) => c.status === 'info').length).toBe(report.checks.length);
  });

  it('fails an unreachable server and a player error, and warns on missing subtitles', () => {
    const report = buildPlayerDiagnosticReport(input({
      server: { state: 'running', version: null, reachable: false },
      playback: {
        streamType: 'direct',
        video: { readyState: 0, networkState: 3, errorCode: 4, width: 0, height: 0, durationSec: 0 },
        audioTracks: [],
        subtitleTracks: [],
        cueCount: 0,
      },
    }));
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get('server')?.detailKey).toBe('playerDiag.server.unreachable');
    expect(byId.get('playback')).toMatchObject({ status: 'fail', vars: { code: 4, type: 'direct' } });
    expect(byId.get('subtitle-tracks')?.status).toBe('warning');
  });
});

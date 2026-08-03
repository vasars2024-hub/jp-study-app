import { describe, expect, it } from 'vitest';
import { buildPlayerDiagnosticReport, type PlayerCapabilitySnapshot } from '../playerDiagnostics';

const snapshot = (patch: Partial<PlayerCapabilitySnapshot> = {}): PlayerCapabilitySnapshot => ({
  formatSupport: { MP4: true, WebM: true, HLS: false, MKV: false },
  pictureInPicture: true,
  fullscreen: true,
  mediaRecorder: true,
  webgl: true,
  readyState: 4,
  networkState: 1,
  durationSec: 120,
  videoWidth: 1920,
  videoHeight: 1080,
  audioTrackCount: 2,
  subtitleCueCount: 3,
  subtitleTimelineValid: true,
  currentExtension: 'mkv',
  currentFileBytes: 3_000_000_000,
  ...patch,
});

describe('player diagnostics', () => {
  it('distinguishes native support from conversion fallbacks', () => {
    const report = buildPlayerDiagnosticReport(snapshot(), 10);
    expect(report.generatedAt).toBe(10);
    expect(report.checks.find((item) => item.id === 'format-mp4')?.status).toBe('pass');
    expect(report.checks.find((item) => item.id === 'format-mkv')?.status).toBe('warning');
    expect(report.checks.find((item) => item.id === 'format-hls')?.status).toBe('fail');
  });

  it('reports invalid subtitle timelines and missing runtime capabilities', () => {
    const report = buildPlayerDiagnosticReport(snapshot({
      subtitleTimelineValid: false,
      pictureInPicture: false,
      fullscreen: false,
    }));
    expect(report.failCount).toBeGreaterThanOrEqual(2);
    expect(report.checks.find((item) => item.id === 'subtitles')?.status).toBe('fail');
  });
});

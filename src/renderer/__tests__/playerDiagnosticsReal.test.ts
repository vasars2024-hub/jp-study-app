/**
 * Player Diagnostics test the player that plays (round-2 audit B, item 20).
 *
 * Before: the report probed `videoRef` (never attached since the old player
 * was deleted) and a fresh, empty `<video>`, and wrote English sentences the UI
 * could not show. Now it reads the Seanime server and its transcoder, the
 * VideoCore element's live state, the GPU and the decoders, and every check is
 * a pair of catalogue keys.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { en } from '../../shared/i18n/catalogs/en';
import { ja } from '../../shared/i18n/catalogs/ja';
import { ru } from '../../shared/i18n/catalogs/ru';
import { zh } from '../../shared/i18n/catalogs/zh';
import { buildPlayerDiagnosticReport, type PlayerDiagnosticInput } from '../../shared/playerDiagnostics';
import { collectPlayerDiagnostics, type DiagnosticsDeps } from '../playerDiagnosticsRun';
import { registerLivePlayerProbe } from '../../media/livePlayerProbe';

let unregister: (() => void) | null = null;
afterEach(() => {
  unregister?.();
  unregister = null;
});

function deps(overrides: Partial<DiagnosticsDeps> = {}): DiagnosticsDeps {
  return {
    status: async () => ({ kind: 'running', port: 1, pid: 1, dataDir: null, version: '2.9.0', simulatedUser: null, error: null, logTail: [] }),
    connection: async () => ({ baseUrl: 'http://127.0.0.1:43211', token: 'tok' }),
    fetchJson: async (url, headers) => {
      expect(url).toBe('http://127.0.0.1:43211/api/v1/status');
      expect(headers['X-Seanime-Token']).toBe('tok');
      return { data: { version: '2.9.1', mediastreamSettings: { transcodeEnabled: true, transcodeHwAccel: 'd3d11va', ffmpegPath: 'C:/ffmpeg.exe', directPlayOnly: false } } };
    },
    decodingInfo: async (config) => ({
      supported: !config.video!.contentType.includes('hvc1'),
      powerEfficient: config.video!.contentType.includes('avc1'),
    }),
    gpuRenderer: () => ({ webgl: true, renderer: 'ANGLE (NVIDIA GeForce RTX 3060)' }),
    ...overrides,
  };
}

describe('collectPlayerDiagnostics', () => {
  it('reads the server, its transcoder, the live player, the GPU and the decoders', async () => {
    unregister = registerLivePlayerProbe(() => ({
      streamType: 'direct',
      video: { readyState: 4, networkState: 1, width: 1920, height: 1080, durationSec: 1400 },
      audioTracks: ['Japanese', 'English'],
      subtitleTracks: ['Japanese'],
      cueCount: 312,
    }));
    const input = await collectPlayerDiagnostics(deps());
    const report = buildPlayerDiagnosticReport(input);
    const byId = new Map(report.checks.map((c) => [c.id, c]));
    expect(byId.get('server')).toMatchObject({ status: 'pass', vars: { version: '2.9.1' } });
    expect(byId.get('transcode')).toMatchObject({ status: 'pass', vars: { accel: 'd3d11va' } });
    expect(byId.get('playback')).toMatchObject({ status: 'pass', vars: { type: 'direct', width: 1920 } });
    expect(byId.get('audio-tracks')?.vars?.count).toBe(2);
    expect(byId.get('decoder-h264')?.status).toBe('pass');
    expect(byId.get('decoder-hevc')?.status).toBe('warning');
    expect(byId.get('decoder-vp9')?.status).toBe('info');
  });

  it('fails the server check when the sidecar is down, and says nothing is playing', async () => {
    const input = await collectPlayerDiagnostics(deps({
      status: async () => ({ kind: 'offline', port: 0, pid: null, dataDir: null, version: null, simulatedUser: null, error: 'x', logTail: [] }),
    }));
    const report = buildPlayerDiagnosticReport(input);
    expect(report.checks.find((c) => c.id === 'server')).toMatchObject({ status: 'fail', detailKey: 'playerDiag.server.down' });
    expect(report.checks.find((c) => c.id === 'playback')?.detailKey).toBe('playerDiag.playback.none');
    expect(report.failCount).toBeGreaterThan(0);
  });
});

describe('every check is translated', () => {
  it('uses keys present in all four catalogues', () => {
    const input: PlayerDiagnosticInput = {
      server: { state: 'running', version: '1', reachable: false },
      mediastream: { transcodeEnabled: true, hwAccel: '', ffmpegConfigured: false, directPlayOnly: false },
      playback: {
        streamType: 'transcode',
        video: { readyState: 0, networkState: 2, errorCode: 4, width: 0, height: 0, durationSec: 0 },
        audioTracks: [],
        subtitleTracks: [],
        cueCount: 0,
      },
      gpu: { webgl: true, renderer: 'Google SwiftShader' },
      decoders: {
        h264: { supported: true, hardware: false },
        hevc: { supported: false, hardware: false },
        vp9: { supported: true, hardware: true },
        av1: { supported: false, hardware: false },
      },
    };
    const report = buildPlayerDiagnosticReport(input);
    const keys = new Set(report.checks.flatMap((c) => [c.labelKey, c.detailKey, `playerDiag.status.${c.status}`]));
    for (const catalog of [en, ja, zh, ru] as Array<Record<string, unknown>>) {
      for (const key of keys) expect(catalog[key], key).toBeTruthy();
    }
    expect(report.checks.find((c) => c.id === 'gpu')?.detailKey).toBe('playerDiag.gpu.software');
  });
});

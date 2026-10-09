import { describe, expect, it } from 'vitest';
import { recordingPlayerReach } from '../recorder/recorderMainBridge';

/**
 * A finished recording must play somewhere. With `seanime.exe` absent the workspace can
 * only say "the media server is not installed", yet the job reported "opened in the
 * player" (measured live 2026-10-08). That one state falls back to the system player.
 */
describe('recordingPlayerReach', () => {
  it('sends a recording to the system player when the media server binary is missing', () => {
    expect(recordingPlayerReach('ready', { kind: 'failed', errorCode: 'missing-exe' })).toBe('unavailable');
  });

  it('keeps the workspace for every recoverable sidecar state', () => {
    for (const status of [
      { kind: 'ready', errorCode: null },
      { kind: 'stopped', errorCode: null },
      { kind: 'starting', errorCode: null },
      { kind: 'failed', errorCode: 'crashed' },
      { kind: 'failed', errorCode: 'unhealthy' },
    ]) {
      expect(recordingPlayerReach('ready', status)).toBe('ready');
    }
    // An unreadable status is not evidence of a missing binary.
    expect(recordingPlayerReach('ready', null)).toBe('ready');
  });

  it('never upgrades a reach the workspace already refused', () => {
    expect(recordingPlayerReach('no-host', { kind: 'ready' })).toBe('no-host');
    expect(recordingPlayerReach('unavailable', { kind: 'ready' })).toBe('unavailable');
  });
});

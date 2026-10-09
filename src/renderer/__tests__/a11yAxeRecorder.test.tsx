// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the region recorder: the
 * panel idle, recording (with level meters) and paused, the launcher, and the
 * recording history list in both of its variants.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_RECORDER_SETTINGS, type RecorderState } from '../../shared/regionRecorder';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

function state(patch: Partial<RecorderState> = {}): RecorderState {
  return {
    phase: 'idle',
    settings: DEFAULT_RECORDER_SETTINGS,
    defaultFolder: 'C:/Videos/Gum Recordings',
    startedAt: null,
    pausedTotalMs: 0,
    pausedSince: null,
    displayId: null,
    systemAudio: 'on',
    mic: true,
    liveCrop: null,
    jobs: [],
    recoverable: [],
    loopbackSupported: true,
    ...patch,
  } as RecorderState;
}

const HISTORY = [
  {
    id: 'a', title: 'Rec a', outputPath: 'C:/r/a.mp4', mediaId: 'm-a', createdAt: Date.UTC(2026, 9, 8), studyDay: '2026-10-08',
    durationMs: 125_000, bytes: 30 * 1024 * 1024, source: 'region', hasAudio: true, transcript: 'done', studyTagged: true, missing: false,
  },
  {
    id: 'b', title: 'Rec b', outputPath: 'C:/r/b.mp4', mediaId: 'm-b', createdAt: Date.UTC(2026, 9, 7), studyDay: '2026-10-07',
    durationMs: 65_000, bytes: 12 * 1024 * 1024, source: 'window', hasAudio: false, transcript: 'waiting-model', studyTagged: false, missing: true,
  },
];

let levels: ((m: unknown) => void) | null = null;

function bridge(current: RecorderState): void {
  stubBridge({
    recorderGetState: current,
    onRecorderState: () => () => undefined,
    onRecorderLevels: (cb: (m: unknown) => void) => {
      levels = cb;
      return () => undefined;
    },
    recorderHistory: HISTORY,
    onRecorderHistoryChanged: () => () => undefined,
  });
}

beforeAll(() => {
  installJsdomShims();
});

afterEach(async () => {
  await cleanup();
  levels = null;
});

describe('Recorder — axe-core', () => {
  const phases: [string, Partial<RecorderState>][] = [
    ['with finished and converting jobs', { jobs: [
      { id: 'j1', createdAt: 1, title: 'Gum Recording 1', phase: 'finalizing', progress: 0.4, partialPath: 'C:/r/.partial/j1' },
      { id: 'j2', createdAt: 2, title: 'Gum Recording 2', phase: 'ready', progress: 1, partialPath: 'C:/r/.partial/j2', outputPath: 'C:/r/j2.mp4', transcript: 'waiting-model' },
      { id: 'j3', createdAt: 3, title: 'Gum Recording 3', phase: 'error', progress: 0, partialPath: 'C:/r/.partial/j3', errorKey: 'recorder.job.error.failed' },
    ] as unknown as RecorderState['jobs'], recoverable: [{ id: 'r1', bytes: 5_000_000 }] as unknown as RecorderState['recoverable'] }],
    ['recording', { phase: 'recording', startedAt: Date.now() - 12_000, source: 'region' }],
    ['paused', { phase: 'paused', startedAt: Date.now() - 30_000, pausedSince: Date.now() - 5_000, source: 'region' }],
    ['error', { phase: 'error', errorKey: 'recorder.error.start' }],
  ];
  for (const [name, patch] of phases) {
    it(`the panel, ${name}`, async () => {
      bridge(state(patch));
      const { default: RecorderPanel } = await import('../recorder/RecorderPanel');
      const { host } = await mount(createElement(RecorderPanel), 40);
      for (let i = 0; i < 20 && !host.textContent; i += 1) await settle(25);
      if (levels) {
        const meter = { level: 0.4, peak: 0.7, peakAt: Date.now(), clipping: false };
        await act(async () => levels?.({ mic: meter, system: meter, at: Date.now() }));
        await settle(10);
      }
      expect(host.textContent?.length, 'panel painted').toBeGreaterThan(10);
      expect(await a11yViolations(host)).toEqual([]);
    });
  }

  it('the launcher', async () => {
    bridge(state());
    const { default: RecorderLauncherPanel } = await import('../recorder/RecorderLauncherPanel');
    const { host } = await mount(createElement(RecorderLauncherPanel), 40);
    expect(await a11yViolations(host)).toEqual([]);
  });

  for (const variant of ['settings', 'blanc'] as const) {
    it(`the history list (${variant})`, async () => {
      bridge(state());
      const { RecordingHistoryList } = await import('../recorder/RecordingHistoryList');
      const { host } = await mount(createElement(RecordingHistoryList, { variant, limit: 5 }), 40);
      expect(host.textContent, 'rows listed').toContain('Rec a');
      expect(await a11yViolations(host)).toEqual([]);
    });
  }
});

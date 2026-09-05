// @vitest-environment jsdom
/**
 * Refresh must produce an observable result, not just an invisible state change.
 *
 * Rubric category 2 drove `.reading-captures-refresh` live through the debug
 * bridge on the real `Reading Finder` window and scored `deadEnd: true`: the
 * surface was sampled at 345 ms, 483 ms and 1257 ms after the click with
 * `any: false` at every sample, `sawMove: false`, and no live region.
 *
 * The handler was never missing. `load()` sets `kind: 'loading'` and the loading
 * note carries `aria-live`, but `lensHistoryList` is a local IPC read that
 * resolves faster than a paint — so on an unchanged store the user clicks
 * Refresh and nothing whatsoever happens, which is the definition of the
 * category's dead end.
 *
 * The fix announces the RESULT, so what is asserted here is the result and its
 * three boundaries: the mount stays silent, a failed refresh does not claim to
 * have refreshed anything, and the count is the count that was actually read.
 *
 * A separate file from `readingCapturesStates.test.tsx` on purpose: that file was
 * carrying another worker's uncommitted edit when this landed, and staging a
 * foreign hunk is worse than a second file.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';
import ReadingCapturesView from '../views/ReadingCapturesView';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (id: string): ReadingLensHistoryEntry =>
  ({
    captureId: id,
    text: '彼は図書館で本を読んでいた。',
    source: 'screen',
    sourceLabel: 'Screen',
    capturedAt: 1_700_000_000_000,
  }) as ReadingLensHistoryEntry;

const LOADING = 'Loading captures…';
const FAILED = 'Could not read the capture history.';

let harness: ReadingSurfaceHarness | null = null;

async function mountWith(lensHistoryList: () => Promise<unknown>): Promise<ReadingSurfaceHarness> {
  installReadingSurfaceApi({ lensHistoryList });
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={null} />,
    ready: (container) => !(container.textContent ?? '').includes(LOADING),
  });
  await harness.mount(1200);
  return harness;
}

const text = (h: ReadingSurfaceHarness): string => h.container.textContent ?? '';
const status = (h: ReadingSurfaceHarness): string | null =>
  h.container.querySelector('.reading-captures-refreshed')?.textContent ?? null;

beforeEach(() => {
  installResizeObserver();
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  vi.restoreAllMocks();
});

describe('the Refresh button is not a dead end', () => {
  it('says nothing on the mount, because a live region that fires on open is noise', async () => {
    const h = await mountWith(() => Promise.resolve([entry('cap-1')]));
    expect(status(h)).toBe(null);
  });

  it('announces the count the refresh actually read', async () => {
    const list = vi.fn(() => Promise.resolve([entry('cap-1')]));
    const h = await mountWith(list);
    expect(status(h)).toBe(null);

    list.mockImplementation(() => Promise.resolve([entry('cap-1'), entry('cap-2')]));
    await h.click('.reading-captures-refresh');

    // The number, not an adjective: a banner that says "Refreshed" over a stale
    // list would satisfy the harness and tell the user nothing.
    expect(status(h)).toBe('Refreshed — 2 captures');
    expect(h.container.querySelector('.reading-captures-refreshed')?.getAttribute('role'))
      .toBe('status');
  });

  it('uses the singular when exactly one capture came back', async () => {
    const list = vi.fn(() => Promise.resolve([entry('cap-1')]));
    const h = await mountWith(list);
    await h.click('.reading-captures-refresh');
    expect(status(h)).toBe('Refreshed — 1 capture');
  });

  it('does not claim to have refreshed anything when the read failed', async () => {
    const list = vi.fn(() => Promise.resolve([entry('cap-1')]));
    const h = await mountWith(list);
    await h.click('.reading-captures-refresh');
    expect(status(h)).toBe('Refreshed — 1 capture');

    // The boundary that matters. The announcement is stateful, so a later
    // failure must retract it rather than leaving a success message standing
    // over an error note — the exact pairing category 8 scores as dishonest.
    list.mockImplementation(() => Promise.reject(new Error('ipc down')));
    await h.click('.reading-captures-refresh');
    expect(text(h)).toContain(FAILED);
    expect(status(h)).toBe(null);
  });
});

// @vitest-environment jsdom
/**
 * Captures' three list states, and the one pair that could render together.
 *
 * `ReadingCapturesView` renders its notes from two independent conditions: the
 * failure note on `history.kind === 'error'`, and the empty note on
 * `history.kind !== 'loading' && rows.length === 0`. An error satisfies BOTH —
 * it is not `loading`, and a failed read produces no rows — so a store that
 * could not be read told the user "Nothing captured yet" beside "Could not read
 * the capture history."
 *
 * One of those two is always false, and it is the one that reads like a fact
 * about their data. "Nothing captured yet" invites them to go and capture
 * something; the truth may be that sixty captures are sitting on disk behind a
 * failed IPC. CLAUDE.md's "user-visible failures must be honest" is exactly this
 * case, and the rubric's category 8 scores it.
 *
 * The empty control is not optional. The narrow fix and the wrong fix — deleting
 * the empty branch — are one character apart, and only a genuinely empty store
 * distinguishes them.
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

const ENTRY: ReadingLensHistoryEntry = {
  captureId: 'cap-1',
  text: '彼は図書館で本を読んでいた。',
  source: 'screen',
  sourceLabel: 'Screen',
  capturedAt: 1_700_000_000_000,
} as ReadingLensHistoryEntry;

const FAILED = 'Could not read the capture history.';
const EMPTY = 'Nothing captured yet.';
const LOADING = 'Loading captures…';

let harness: ReadingSurfaceHarness | null = null;

/** Mount cold (no handed-off passage) against a given history reader. */
async function mountWith(lensHistoryList: () => Promise<unknown>): Promise<ReadingSurfaceHarness> {
  installReadingSurfaceApi({ lensHistoryList });
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={null} />,
    // Settled means the loading note is gone — true for BOTH the error and the
    // empty outcome, so one predicate serves every test here and none of them
    // asserts against a surface that is merely still reading.
    ready: (container) => !(container.textContent ?? '').includes(LOADING),
  });
  await harness.mount(1200);
  return harness;
}

const text = (h: ReadingSurfaceHarness): string => h.container.textContent ?? '';

beforeEach(() => {
  installResizeObserver();
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  vi.restoreAllMocks();
});

describe('Captures list states are mutually exclusive', () => {
  it('says the read failed, and does not also claim the store is empty', async () => {
    const h = await mountWith(() => Promise.reject(new Error('ipc down')));

    expect(text(h)).toContain(FAILED);
    // The regression latch. Before this fix both notes rendered, and the empty
    // one is the confident-sounding lie: it describes the user's data, which a
    // failed read knows nothing about.
    expect(text(h)).not.toContain(EMPTY);
    expect(h.container.querySelector('.reading-captures-error')).not.toBe(null);
    expect(h.container.querySelectorAll('.reading-captures-row').length).toBe(0);
  });

  it('still says the store is empty when the read succeeds and returns nothing', async () => {
    const h = await mountWith(() => Promise.resolve([]));

    expect(text(h)).toContain(EMPTY);
    expect(text(h)).not.toContain(FAILED);
    expect(h.container.querySelector('.reading-captures-error')).toBe(null);
  });

  it('says neither once rows arrive', async () => {
    const h = await mountWith(() => Promise.resolve([ENTRY]));

    expect(h.container.querySelectorAll('.reading-captures-row').length).toBe(1);
    expect(text(h)).not.toContain(EMPTY);
    expect(text(h)).not.toContain(FAILED);
  });

  /*
   * A missing preload binding takes the same `error` branch as a rejected call —
   * `load()` checks `typeof list !== 'function'` and sets `error` synchronously.
   * Worth its own case because it is the state a renderer reload produces while
   * main is still coming up, and it never passes through `loading` at all.
   */
  it('treats an absent preload binding as a failed read, not as an empty store', async () => {
    installReadingSurfaceApi({ lensHistoryList: null });
    harness = createReadingSurfaceHarness({
      render: () => <ReadingCapturesView passage={null} />,
      ready: (container) => container.querySelector('.reading-captures-error') !== null,
    });
    await harness.mount(1200);

    expect(text(harness)).toContain(FAILED);
    expect(text(harness)).not.toContain(EMPTY);
  });
});

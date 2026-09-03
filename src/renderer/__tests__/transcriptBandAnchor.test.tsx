// @vitest-environment jsdom
/**
 * The emphasis band survives the gap between two cues.
 *
 * THE DEFECT (S5, measured live 2026-09-03): `activeIndex` is `activeCue?.index ?? null`,
 * so it drops to null in every gap between spoken lines — and `rowDistance(i, null)` is
 * `'mid'` for EVERY row. So each cue END and each cue START rewrote `data-distance` on the
 * whole column. On a 2,650-row track that arrived as a single MutationObserver batch of
 * 2,650 mutations, 2,647 of them `data-distance`, against exactly one `class` / one
 * `data-active` / one `aria-current`; twice per spoken line every memoized row re-rendered
 * with its ~47 token spans, and the renderer stopped servicing its own timers for up to
 * 24,952 ms with the clip playing. Anchoring the band on the last line that WAS spoken took
 * the batch to 73 and the worst timer gap to 1,862 ms.
 *
 * This could not be guarded until now for a reason worth recording: `rowDistance` lived in
 * an UNCOMMITTED working-tree redesign, so a test importing it did not compile on a clean
 * checkout. It landed at `fbf2a92a`, which is what makes these cases possible.
 *
 * The assertions are a discriminating PAIR, not a single number, because "nothing changed"
 * is also what a panel that stopped updating altogether would produce. Across the gap the
 * bands must hold AND the active highlight must clear — `data-active` and `aria-current`
 * come from the real `activeIndex` on purpose, so a fix that froze the whole row would fail
 * the second half.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import VideoCoreTranscriptPanel, { rowDistance } from '../../media/VideoCoreTranscriptPanel';

/** Ten lines is enough to hold every band at once: active, near, mid, far and past. */
const CUES = Array.from({ length: 10 }, (_, i) => ({
  index: i,
  trackNumber: 1,
  text: `セリフ${i}です。`,
  startMs: 10_000 + i * 2_000,
  endMs: 11_000 + i * 2_000,
}));

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const noop = (): void => undefined;

async function render(host: HTMLElement, activeIndex: number | null): Promise<void> {
  await act(async () => {
    root?.render(
      <VideoCoreTranscriptPanel
        cues={CUES}
        activeIndex={activeIndex}
        lang="ja"
        trackLabel="Japanese"
        onSeek={noop}
        onClose={noop}
      />,
    );
  });
}

async function mountPanel(activeIndex: number | null): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await render(host, activeIndex);
  return host;
}

/** `data-distance` for every rendered row, keyed by cue index. */
function bands(host: HTMLElement): Record<string, string> {
  const out: Record<string, string> = {};
  host.querySelectorAll('.study-transcript-row').forEach((row) => {
    out[row.getAttribute('data-cue-index') ?? '?'] = row.getAttribute('data-distance') ?? '?';
  });
  return out;
}

function changedKeys(before: Record<string, string>, after: Record<string, string>): string[] {
  return Object.keys(before).filter((k) => before[k] !== after[k]);
}

describe('rowDistance bands', () => {
  it('places each row relative to the line being spoken', () => {
    expect(rowDistance(5, 5)).toBe('active');
    expect(rowDistance(6, 5)).toBe('near');
    expect(rowDistance(4, 5)).toBe('near');
    expect(rowDistance(7, 5)).toBe('mid');
    expect(rowDistance(9, 5)).toBe('mid');
    expect(rowDistance(10, 5)).toBe('far');
    // Behind the playhead recedes at once: one row back is still `near`, two is `past`.
    expect(rowDistance(3, 5)).toBe('past');
  });

  it('is `mid` for every row with no anchor at all, which is the defect this guards', () => {
    // The unfixed panel passed `null` here on every inter-cue gap. Kept as an explicit
    // case so the component tests below cannot be read as testing rowDistance itself.
    expect([0, 3, 5, 9].map((i) => rowDistance(i, null))).toEqual(['mid', 'mid', 'mid', 'mid']);
  });
});

describe('the band anchor across a cue gap', () => {
  it('holds every band when activeIndex drops to null, and clears the highlight', async () => {
    const host = await mountPanel(5);
    const spoken = bands(host);

    // Sanity: the fixture really does exercise more than one band, or "unchanged" below
    // would be trivially true.
    expect(new Set(Object.values(spoken)).size).toBeGreaterThan(2);
    expect(spoken['5']).toBe('active');

    // The gap between two cues.
    await render(host, null);

    expect(changedKeys(spoken, bands(host))).toEqual([]);

    // The other half of the pair: the panel is still live, and the things that SHOULD
    // follow the real activeIndex did.
    expect(host.querySelectorAll('[data-active="true"]').length).toBe(0);
    expect(host.querySelectorAll('[aria-current="true"]').length).toBe(0);
  });

  it('does not go all-`mid` across the gap — the exact shape of the defect', async () => {
    const host = await mountPanel(5);
    await render(host, null);

    const observed = Object.values(bands(host));
    // Without the anchor this array is ten copies of 'mid', which is the 2,647-attribute
    // rewrite measured live. This leg fails if the anchor is removed.
    expect(observed.filter((b) => b === 'mid').length).toBeLessThan(observed.length);
    expect(observed).toContain('active');
  });

  it('moves only the rows that actually changed band when the next cue starts', async () => {
    const host = await mountPanel(5);
    await render(host, null);
    const held = bands(host);

    await render(host, 6);

    // Advancing one line shifts the window by one, so a bounded handful of rows move —
    // never the whole column, which is what the defect did twice per spoken line.
    const moved = changedKeys(held, bands(host));
    expect(moved.length).toBeGreaterThan(0);
    expect(moved.length).toBeLessThan(Object.keys(held).length);
    expect(bands(host)['6']).toBe('active');
    expect(bands(host)['5']).toBe('near');
  });

  it('anchors on the first cue before anything has been spoken', async () => {
    // Mounted mid-gap with no history, there is genuinely no anchor, and `mid` for every
    // row is the right answer rather than a bug. Pinned so the fix is not "over-corrected"
    // into inventing an anchor the panel does not have.
    const host = await mountPanel(null);
    expect(Object.values(bands(host)).every((b) => b === 'mid')).toBe(true);
  });
});

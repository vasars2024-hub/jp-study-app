// @vitest-environment jsdom
/**
 * The transcript rail as a study surface, not only a seek list: every row can be mined
 * (the one-key mine, for a line that is not the one playing), and a line that is already
 * a card says so on its row.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import VideoCoreTranscriptPanel from '../../media/VideoCoreTranscriptPanel';
import { minedCueKey } from '../../shared/videoCoreMining';

const CUES = Array.from({ length: 4 }, (_, index) => ({
  index,
  trackNumber: 1,
  text: `台詞${index}です。`,
  startMs: 10_000 + index * 2_000,
  endMs: 11_500 + index * 2_000,
}));

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

async function mount(props: Partial<React.ComponentProps<typeof VideoCoreTranscriptPanel>>): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      <VideoCoreTranscriptPanel
        cues={CUES}
        activeIndex={1}
        lang="ja"
        trackLabel="Japanese"
        onSeek={() => undefined}
        onClose={() => undefined}
        {...props}
      />,
    );
  });
  return host;
}

describe('transcript row mining', () => {
  it('offers Mine on every row and mines that row, not the one playing', async () => {
    const onMineCue = vi.fn();
    const onSeek = vi.fn();
    const host = await mount({ onMineCue, onSeek });
    const buttons = host.querySelectorAll<HTMLButtonElement>('[data-study-action="transcript-mine"]');
    expect(buttons).toHaveLength(CUES.length);
    await act(async () => buttons[3]?.click());
    expect(onMineCue).toHaveBeenCalledWith(CUES[3]);
    expect(onSeek).not.toHaveBeenCalled();
    // Named by the line it mines, for a screen reader moving down the list.
    expect(buttons[3]?.getAttribute('aria-label')).toContain('台詞3です。');
  });

  it('marks the rows that are already cards', async () => {
    const host = await mount({
      onMineCue: vi.fn(),
      minedCueKeys: new Set([minedCueKey(CUES[2] as (typeof CUES)[number])]),
    });
    const rows = host.querySelectorAll('.study-transcript-row');
    expect(rows[2]?.getAttribute('data-mined')).toBe('true');
    expect(rows[1]?.getAttribute('data-mined')).toBeNull();
    expect(rows[2]?.querySelector('.study-transcript-mine')?.classList.contains('is-mined')).toBe(true);
  });

  it('offers no Mine button when the overlay does not wire one', async () => {
    const host = await mount({});
    expect(host.querySelector('[data-study-action="transcript-mine"]')).toBeNull();
  });
});

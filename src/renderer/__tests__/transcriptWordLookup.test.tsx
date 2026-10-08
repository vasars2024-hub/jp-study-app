// @vitest-environment jsdom
/**
 * A word in a transcript row opens the dictionary, as a word on the subtitle line does:
 * click or Enter on the word looks it up (with the row as its sentence), the timestamp
 * still seeks, and without the opt-in the row stays one seek button.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../tokenizer', () => {
  const tokens = (text: string) => text
    .split(/(\s+)/)
    .filter(Boolean)
    .map((surface) => ({
      surface,
      reading: '',
      pos: /\s/.test(surface) ? '記号' : '名詞',
      posDetail: '',
      lemma: surface,
      content: false,
      proper: false,
    }));
  return {
    getTokenizer: () => Promise.resolve({}),
    tokenizeSync: tokens,
  };
});

import VideoCoreTranscriptPanel, { isTranscriptWord } from '../../media/VideoCoreTranscriptPanel';
import type { WordLookupHit } from '../wordLookup';

const CUES = [
  { index: 0, trackNumber: 1, text: '猫 が 好き', startMs: 1_000, endMs: 2_000 },
  { index: 1, trackNumber: 1, text: '犬 も 好き', startMs: 3_000, endMs: 4_000 },
];

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
        activeIndex={null}
        lang="ja"
        trackLabel="Japanese"
        onSeek={() => undefined}
        onClose={() => undefined}
        {...props}
      />,
    );
  });
  // The rail tokenizes in chunks on timers after the first paint.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  return host;
}

function word(host: HTMLElement, row: number, surface: string): HTMLElement {
  const rowEl = host.querySelectorAll('.study-transcript-row')[row];
  const found = rowEl?.querySelector<HTMLElement>(`[data-transcript-word="${surface}"]`);
  if (!found) throw new Error(`no word ${surface} in row ${row}`);
  return found;
}

describe('transcript word lookup', () => {
  it('opens the lookup on a clicked word, with the row as context and its own cue', async () => {
    const hits: Array<[WordLookupHit, number]> = [];
    const seeks: number[] = [];
    const host = await mount({
      onWordLookup: (hit, cue) => hits.push([hit, cue.index]),
      onSeek: (cue) => seeks.push(cue.index),
    });
    act(() => word(host, 1, '犬').click());
    expect(hits).toHaveLength(1);
    expect(hits[0][0]).toMatchObject({ query: '犬', context: '犬 も 好き' });
    expect(hits[0][1]).toBe(1);
    expect(seeks).toEqual([]);
  });

  it('opens the lookup on Enter and Space, and moves between words with the arrows', async () => {
    const hits: string[] = [];
    const host = await mount({ onWordLookup: (hit) => hits.push(hit.query) });
    const first = word(host, 0, '猫');
    expect(first.tabIndex).toBe(0);
    expect(word(host, 0, 'が').tabIndex).toBe(-1);
    first.focus();
    act(() => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(hits).toEqual(['猫']);
    act(() => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(word(host, 0, 'が'));
    act(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    });
    expect(hits).toEqual(['猫', 'が']);
  });

  it('seeks from the timestamp button', async () => {
    const seeks: number[] = [];
    const host = await mount({ onWordLookup: () => undefined, onSeek: (cue) => seeks.push(cue.index) });
    const times = host.querySelectorAll<HTMLButtonElement>('button.study-transcript-time');
    expect(times).toHaveLength(2);
    act(() => times[1].click());
    expect(seeks).toEqual([1]);
  });

  it('without the opt-in, a row stays one seek button with no word stops', async () => {
    const seeks: number[] = [];
    const host = await mount({ onSeek: (cue) => seeks.push(cue.index) });
    expect(host.querySelector('[data-transcript-word]')).toBeNull();
    act(() => host.querySelectorAll<HTMLButtonElement>('button.study-transcript-seek')[0].click());
    expect(seeks).toEqual([0]);
  });

  it('treats only letters and digits as words', () => {
    expect(isTranscriptWord('猫')).toBe(true);
    expect(isTranscriptWord('。')).toBe(false);
    expect(isTranscriptWord(' ')).toBe(false);
  });
});

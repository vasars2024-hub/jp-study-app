// @vitest-environment jsdom
/**
 * D317 — the detail drawer's episode rows say which episodes carry Japanese.
 *
 * What it guards. `MediaDetailPanel` already rendered a `MediaStatusPill` on every
 * episode row, and passed it `mediaSubtitleStatus()` — the no-argument call, which
 * returns `null` for every item, so `MediaStatusPill` bailed at its `if (!status)`.
 * Measured live on pid 4652 against the user's own library: The Big O's drawer held
 * **29 episode rows and 0 pills**. A user clicks a card that has just told them
 * "Japanese subtitles on 13 of 26", lands on the one list that could say *which* 13,
 * and every row is silent.
 *
 * A source-text check would not have caught this — `mediaSubtitleStatus(` is present
 * either way, and the defect is entirely in its argument. So this renders the panel
 * and reads the pills.
 *
 * `.ts` and `createElement` rather than `.tsx`, per `mediaLibraryListRow.test.ts`:
 * `vitest.config.ts` collects `src/renderer/__tests__/**\/*.test.ts`, so a `.tsx`
 * here is matched by nothing and never appears in the count anyone reads.
 */
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import MediaDetailPanel from '../components/media/library/MediaDetailPanel';
import { invalidateMediaArtwork } from '../components/media/library/useMediaArtwork';
import { buildLibraryEntries } from '../../shared/mediaLibraryEntries';
import type { MediaItem } from '../../shared/types';

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe = (): undefined => undefined;

    unobserve = (): undefined => undefined;

    disconnect = (): undefined => undefined;
  };
});

beforeEach(() => {
  invalidateMediaArtwork();
  (window as unknown as { api: Record<string, unknown> }).api = {
    mediaArtwork: async () => null,
    subtitleDiscoveryState: async () => null,
    transcriptionState: async () => null,
    onSubtitleDiscoveryProgress: () => () => undefined,
    onTranscriptionProgress: () => () => undefined,
  };
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

const JA = { id: 'r1', lang: 'ja', source: 'test', path: 'x.srt' } as never;

/** The user's own folder shape: 26 absolute-numbered files under a 13-episode entry. */
const episode = (n: number, extra: Partial<MediaItem> = {}): MediaItem => ({
  id: `bigo-${n}`,
  title: `The Big O - ${String(n).padStart(2, '0')}`,
  fileName: `The Big O - ${String(n).padStart(2, '0')}.mkv`,
  path: `C:/media/bigo/${n}.mkv`,
  addedAt: 1000 + n,
  category: 'anime',
  seriesKey: 'the big o',
  seriesTitle: 'The Big O',
  episode: n,
  episodeKind: 'episode',
  durationSec: 1440,
  anilistId: 567,
  episodeCount: 13,
  subtitlesCheckedAt: 5,
  ...extra,
} as MediaItem);

async function renderDrawer(items: MediaItem[]): Promise<HTMLElement> {
  const entry = buildLibraryEntries(items)[0];
  host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => {
    mounted.render(createElement(MediaDetailPanel, {
      entry,
      currentId: null,
      onClose: () => undefined,
      onPlay: () => undefined,
      onToggleFavorite: () => undefined,
      onToggleStudyQueue: () => undefined,
      onNoteChange: () => undefined,
      onRematch: () => undefined,
    }));
  });
  return host;
}

const pills = (el: HTMLElement): string[] => Array.from(el.querySelectorAll('.medialib-ep'))
  .map((row) => row.querySelector('.medialib-pill')?.textContent?.trim() ?? '');

describe('episode rows carry a subtitle status', () => {
  it('marks the covered episodes and the uncovered ones differently', async () => {
    const el = await renderDrawer(
      Array.from({ length: 26 }, (_, i) => episode(i + 1, i < 13 ? { subtitles: [JA] } : {})),
    );
    const read = pills(el);
    expect(read).toHaveLength(26);
    // Non-vacuity floor: the bug produced 26 empty strings, which any "they differ"
    // assertion alone would have to be careful not to accept.
    expect(read.filter((text) => text.length > 0)).toHaveLength(26);
    expect(new Set(read.slice(0, 13)).size).toBe(1);
    expect(read[0]).not.toBe(read[25]);
  });

  it('says the search asked the wrong season rather than that nothing exists', async () => {
    const el = await renderDrawer(
      Array.from({ length: 26 }, (_, i) => episode(i + 1, i < 13 ? { subtitles: [JA] } : {})),
    );
    const read = pills(el);
    expect(read[0]).toBe('Japanese subtitles ready');
    expect(read[25]).toBe('Past the matched season — searched under the wrong one');
    expect(read[25]).not.toContain('No subtitles found');
  });

  it('CONTROL: an in-range episode with nothing filed still says nothing was found', async () => {
    // Otherwise the wrong-season wording would spread to every uncovered episode and
    // stop being information.
    const el = await renderDrawer(Array.from({ length: 13 }, (_, i) => episode(i + 1)));
    expect(pills(el)[12]).toBe('No subtitles found');
  });

  it('CONTROL: extras get a status too, since a special is a file like any other', async () => {
    const el = await renderDrawer([
      episode(1, { subtitles: [JA] }),
      episode(2),
      episode(0, {
        id: 'ncop',
        title: 'The Big O - Creditless Opening',
        fileName: 'The Big O NCOP.mkv',
        episodeKind: 'special',
        episode: undefined,
      }),
    ]);
    const extras = Array.from(el.querySelectorAll('.medialib-ep'))
      .filter((row) => (row.textContent ?? '').includes('Creditless'));
    expect(extras).toHaveLength(1);
    expect(extras[0].querySelector('.medialib-pill')?.textContent?.trim()).toBe('No subtitles found');
  });
});

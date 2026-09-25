// @vitest-environment jsdom
/**
 * Audit r2 #24 — Discover: a failed "Check captions" says so, and a manga
 * shortlisted in Discover is reachable from the Reading workspace.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addToShortlist } from '../discoveryShortlistStore';
import MangaShortlistStrip from '../components/reading/MangaShortlistStrip';
import { useYoutubeDiscovery, type YoutubeDiscoveryState } from '../components/discover/YoutubeDiscoveryPanel';
import type { DiscoveryCandidate } from '../../shared/mediaDiscovery';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function render(node: React.ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  return host;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  host = null;
  root = null;
});

describe('manga shortlist in the Reading workspace', () => {
  it('lists shortlisted manga (not anime), finds one, and removes one', async () => {
    const manga = { provider: 'anilist', id: 101, mediaType: 'manga', title: 'Yotsuba', nativeTitle: 'よつばと！', year: 2003 };
    const anime = { provider: 'anilist', id: 202, mediaType: 'anime', title: 'Frieren' };
    addToShortlist(manga as unknown as DiscoveryCandidate);
    addToShortlist(anime as unknown as DiscoveryCandidate);
    const onFind = vi.fn();
    const el = await render(<MangaShortlistStrip onFind={onFind} />);
    expect([...el.querySelectorAll('.manga-shortlist-name')].map((n) => n.textContent)).toEqual(['よつばと！ 2003']);
    await act(async () => {
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Find to read')!.click();
    });
    expect(onFind).toHaveBeenCalledWith('よつばと！');
    await act(async () => {
      [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Remove')!.click();
    });
    expect(el.querySelector('.manga-shortlist')).toBeNull();
  });
});

describe('YouTube discovery "Check captions"', () => {
  it('records a failed probe against its video instead of saying nothing', async () => {
    Object.defineProperty(window, 'api', {
      configurable: true,
      writable: true,
      value: { ytDiscoveryProbe: vi.fn(async () => ({ probe: null, message: 'yt-dlp timed out' })) },
    });
    let state: YoutubeDiscoveryState | null = null;
    function Probe() {
      state = useYoutubeDiscovery('N4' as never, false);
      return null;
    }
    await render(<Probe />);
    await act(async () => {
      state!.probe('vid12345678');
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(state!.probeError).toEqual({ videoId: 'vid12345678', message: 'yt-dlp timed out' });
  });
});

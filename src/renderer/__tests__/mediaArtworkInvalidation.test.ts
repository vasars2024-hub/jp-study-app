// @vitest-environment jsdom
/**
 * A card already on screen picks up the poster the metadata sweep downloads.
 *
 * `useMediaArtwork` memoizes per id for the session. Before the
 * `media:metadataUpdated` push, a card that resolved during a sweep kept its
 * frame grab until the next launch, even though the real poster had landed —
 * clearing the memo alone does nothing for a card already mounted. `.ts` with
 * `createElement`, like the other renderer artwork tests.
 */
import { createElement, act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MediaMetadataUpdate } from '../../shared/mediaMetadataIpc';
import {
  invalidateMediaArtwork,
  useMediaArtwork,
  type MediaArtworkVariant,
} from '../components/media/library/useMediaArtwork';

let answer = 'playfile://frame-grab/';
let asks = 0;
let push: ((update: MediaMetadataUpdate) => void) | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (window as unknown as { api: unknown }).api = {
    mediaArtwork: async () => {
      asks += 1;
      return answer;
    },
    onMediaMetadataUpdated: (cb: (update: MediaMetadataUpdate) => void) => {
      push = cb;
      return () => undefined;
    },
  };
});

beforeEach(() => {
  invalidateMediaArtwork();
  answer = 'playfile://frame-grab/';
  asks = 0;
});

let root: Root | null = null;
let host: HTMLElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

function Probe({ id, variant }: { id: string; variant?: MediaArtworkVariant }): ReactElement {
  const { url, loading } = useMediaArtwork(id, variant);
  return createElement('span', { 'data-loading': String(loading) }, url ?? 'none');
}

async function mount(id: string): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root?.render(createElement(Probe, { id })));
  await act(async () => undefined);
  return host;
}

describe('useMediaArtwork refresh on media:metadataUpdated', () => {
  it('re-asks for a mounted card whose art changed, without a skeleton in between', async () => {
    const el = await mount('item-1');
    expect(el.textContent).toBe('playfile://frame-grab/');
    expect(asks).toBe(1);

    answer = 'playfile://provider-poster/';
    await act(async () => push?.({ ids: ['item-1'], artwork: true }));
    // Still showing the old image while the new one is fetched — no flash.
    expect(el.querySelector('span')?.getAttribute('data-loading')).toBe('false');
    await act(async () => undefined);
    expect(el.textContent).toBe('playfile://provider-poster/');
    expect(asks).toBe(2);
  });

  it('ignores updates for other ids and updates that did not touch art', async () => {
    const el = await mount('item-2');
    answer = 'playfile://provider-poster/';
    await act(async () => push?.({ ids: ['someone-else'], artwork: true }));
    await act(async () => push?.({ ids: ['item-2'], artwork: false }));
    await act(async () => undefined);
    expect(el.textContent).toBe('playfile://frame-grab/');
    expect(asks).toBe(1);
  });

  it('refreshes mounted cards on a full invalidation too (the manual re-match path)', async () => {
    const el = await mount('item-3');
    answer = 'playfile://rematched/';
    await act(async () => invalidateMediaArtwork());
    await act(async () => undefined);
    expect(el.textContent).toBe('playfile://rematched/');
  });
});

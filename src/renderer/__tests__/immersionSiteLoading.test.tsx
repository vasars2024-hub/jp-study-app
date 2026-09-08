// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImmersionSitesStore } from '../../shared/immersion';
import type { ImmersionState } from '../components/immersion/ImmersionContent';
import { installReadingSurfaceApi, installResizeObserver } from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const populated = {
  sites: [{ id: 'nhk', title: 'NHK ニュース', url: 'https://www3.nhk.or.jp/news/',
    lang: 'ja', favorite: false, lastVisited: 10, visitCount: 2, streakDays: 0, completionPct: 0 }],
} as ImmersionSitesStore;
let root: Root;
let host: HTMLDivElement;
let state: ImmersionState;
let broadcast: (store: ImmersionSitesStore) => void;
const load = vi.fn<() => Promise<ImmersionSitesStore>>();

async function mount() {
  const { useImmersion, ImmersionSiteList } = await import('../components/immersion/ImmersionContent');
  function Surface() {
    state = useImmersion();
    return createElement(ImmersionSiteList, { state });
  }
  await act(async () => { root.render(createElement(Surface)); });
}

beforeEach(() => {
  installResizeObserver();
  load.mockReset();
  installReadingSurfaceApi({
    immersionListSites: load,
    onImmersionSitesChanged: (cb: typeof broadcast) => { broadcast = cb; return () => undefined; },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  host.remove();
  vi.restoreAllMocks();
});

describe('saved-site read states', () => {
  it('does not describe an unresolved read as an empty library', async () => {
    let resolve!: (value: ImmersionSitesStore) => void;
    load.mockImplementation(() => new Promise((r) => { resolve = r; }));
    await mount();
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Loading…');
    expect(host.textContent).not.toContain('Bookmark any page');
    await act(async () => { resolve({ sites: [] } as unknown as ImmersionSitesStore); });
    expect(host.textContent).toContain('Saved sites appear here. Bookmark any page.');
    expect(host.querySelector('[role="alert"]')).toBe(null);
  });

  it('announces a failed read and retries through the real rail control', async () => {
    load.mockRejectedValueOnce(new Error('IPC disconnected')).mockResolvedValueOnce(populated);
    await mount();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Could not load saved sites');
    expect(host.textContent).not.toContain('Bookmark any page');
    const retry = host.querySelector<HTMLButtonElement>('.immersion-sites-error button')!;
    expect(retry.textContent).toBe('Try again');
    await act(async () => { retry.click(); });
    expect(load).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBe(null);
    expect(host.querySelector('.immersion-site-title')?.textContent).toBe('NHK ニュース');
  });

  it('retains the last loaded sites when a refresh fails', async () => {
    load.mockResolvedValueOnce(populated).mockRejectedValueOnce(new Error('offline'));
    await mount();
    await act(async () => { await state.refreshSites(); });
    expect(host.querySelector('[role="alert"]')).not.toBe(null);
    expect(host.querySelector('.immersion-site-title')?.textContent).toBe('NHK ニュース');
    expect(state.sites).toEqual(populated.sites);
  });

  it('recovers from an error when main broadcasts the saved library', async () => {
    load.mockRejectedValueOnce(new Error('offline'));
    await mount();
    await act(async () => { broadcast(populated); });
    expect(host.querySelector('[role="alert"]')).toBe(null);
    expect(host.querySelector('.immersion-site-title')?.textContent).toBe('NHK ニュース');
  });
});

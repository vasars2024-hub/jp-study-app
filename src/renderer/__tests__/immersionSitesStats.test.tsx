// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ImmersionSitesStats from '../components/stats/ImmersionSitesStats';
import type { ImmersionSite, ImmersionSitesStore } from '../../shared/immersion';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function site(id: string, url: string, totalSeconds: number, totalChars: number, totalLookups?: number): ImmersionSite {
  return {
    id, url, title: id, lang: 'ja', tags: [], completionPct: 0, lastVisited: 1, visitCount: 1,
    estimatedDifficulty: 0, streakDays: 0, totalSeconds, totalChars, totalLookups, createdAt: 1, updatedAt: 1,
  };
}

let host: HTMLDivElement;
let root: Root;
let listeners: Array<(store: ImmersionSitesStore) => void> = [];

function install(sites: ImmersionSite[]): void {
  listeners = [];
  (window as unknown as { api: unknown }).api = {
    immersionListSites: async () => ({ schemaVersion: 2, sites, folders: [], bookmarks: [] }),
    onImmersionSitesChanged: (cb: (store: ImmersionSitesStore) => void) => {
      listeners.push(cb);
      return () => undefined;
    },
  };
}

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete (window as { api?: unknown }).api;
});

async function render(): Promise<void> {
  await act(async () => {
    root.render(<ImmersionSitesStats />);
  });
  await act(async () => {
    for (let i = 0; i < 4; i += 1) await Promise.resolve();
  });
}

describe('Statistics: Immersion reading per site', () => {
  it('lists each site once with its time, characters and lookups', async () => {
    install([
      site('a', 'https://www3.nhk.or.jp/news/a', 600, 1200, 3),
      site('b', 'https://www3.nhk.or.jp/news/b', 60, 300, 1),
      site('c', 'https://note.com/z', 120, 50),
    ]);
    await render();
    const rows = [...host.querySelectorAll<HTMLTableRowElement>('tbody tr')];
    expect(rows.map((r) => r.dataset.host)).toEqual(['www3.nhk.or.jp', 'note.com']);
    const cells = [...rows[0].querySelectorAll('td')].map((td) => td.textContent);
    expect(cells.slice(1)).toEqual(['1,500', '4', '2']);
  });

  it('renders nothing until a site has been read, then follows live updates', async () => {
    install([site('a', 'https://example.org/', 0, 0)]);
    await render();
    expect(host.querySelector('table')).toBeNull();
    await act(async () => {
      listeners.forEach((cb) => cb({ schemaVersion: 2, sites: [site('a', 'https://example.org/', 90, 10)], folders: [], bookmarks: [] }));
    });
    expect(host.querySelector('tbody tr')?.getAttribute('data-host')).toBe('example.org');
  });
});

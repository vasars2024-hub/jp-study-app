// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Media Center: Home,
 * the media Library list with a few local episodes, and Downloads.
 */
import { createElement } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { MediaItem } from '../../shared/types';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, stubBridge } from './helpers/axeHarness';

vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));

const DIR = 'C:\\Anime\\Frieren';
const ITEMS = [1, 2, 3].map((n) => ({
  id: `ep-${n}`,
  title: `Frieren ${n}`,
  path: `${DIR}\\Sousou no Frieren - 0${n}.mkv`,
  fileName: `Sousou no Frieren - 0${n}.mkv`,
  addedAt: n,
  episode: n,
  kind: 'video',
})) as unknown as MediaItem[];

beforeAll(() => {
  installJsdomShims();
  stubBridge({
    listMedia: ITEMS,
    mediaList: ITEMS,
    listLibrary: [],
    watchList: { items: [] },
    assetsList: { assets: [], statuses: [] },
  });
});

afterEach(async () => {
  await cleanup();
  localStorage.clear();
});

describe('Media Center — axe-core', () => {
  for (const tab of ['home', 'library', 'downloads'] as const) {
    it(`tab: ${tab}`, async () => {
      const { default: MediaCenterView } = await import('../views/MediaCenterView');
      const { host } = await mount(createElement(MediaCenterView, { initialTab: tab }), 80);
      expect(host.textContent?.length, 'painted').toBeGreaterThan(20);
      if (tab === 'library') expect(host.textContent, 'episodes listed').toContain('Frieren');
      expect(await a11yViolations(host)).toEqual([]);
    });
  }
});

// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscoveryCandidate } from '../../shared/mediaDiscovery';
import {
  DISCOVERY_SHORTLIST_KEY,
  addToShortlist,
  loadShortlist,
  removeFromShortlist,
} from '../discoveryShortlistStore';

const CANDIDATE: DiscoveryCandidate = {
  provider: 'jikan',
  id: 52991,
  title: 'Sousou no Frieren',
  nativeTitle: '葬送のフリーレン',
  genres: ['Adventure', 'Fantasy'],
  rating: 9.3,
};

describe('scraper Discover shortlist persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('persists a planned title and restores it', () => {
    addToShortlist(CANDIDATE, 1234);

    expect(JSON.parse(localStorage.getItem(DISCOVERY_SHORTLIST_KEY) ?? '[]')).toHaveLength(1);
    expect(loadShortlist()).toEqual([
      expect.objectContaining({
        id: 'jikan:52991',
        candidate: expect.objectContaining({ title: 'Sousou no Frieren' }),
        addedAt: 1234,
      }),
    ]);
  });

  it('removes the same planned title without disturbing storage', () => {
    addToShortlist(CANDIDATE, 1234);
    removeFromShortlist('jikan:52991');

    expect(loadShortlist()).toEqual([]);
  });
});

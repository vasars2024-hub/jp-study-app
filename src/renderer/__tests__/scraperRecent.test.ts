// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearRecentScraperQueries,
  getRecentScraperQueries,
  pushRecentScraperQuery,
} from '../components/scraper/scraperRecent';

const KEY = 'jp-scraper-recent-queries-v1';

describe('scraper recent queries', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes, deduplicates and caps recent searches', () => {
    ['dashboard', 'results', 'downloads', 'episodes', 'sources', 'torrents'].forEach(
      pushRecentScraperQuery,
    );
    pushRecentScraperQuery(' SOURCES ');

    expect(getRecentScraperQueries()).toEqual([
      'SOURCES',
      'torrents',
      'episodes',
      'downloads',
      'results',
    ]);
  });

  it('sanitizes malformed stored values without failing', () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([' results ', 'RESULTS', '', 42, 'x', 'downloads', 'dashboard']),
    );

    expect(getRecentScraperQueries()).toEqual(['results', 'downloads', 'dashboard']);

    localStorage.setItem(KEY, '{broken');
    expect(getRecentScraperQueries()).toEqual([]);
  });

  it('ignores tiny searches and clears stored history', () => {
    pushRecentScraperQuery('x');
    pushRecentScraperQuery('  ');
    expect(getRecentScraperQueries()).toEqual([]);

    pushRecentScraperQuery('dashboard');
    clearRecentScraperQueries();
    expect(getRecentScraperQueries()).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

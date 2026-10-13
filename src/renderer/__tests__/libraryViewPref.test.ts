// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_LIBRARY_VIEW,
  LIBRARY_VIEW_STORAGE_KEY,
  normalizeLibraryView,
  readLibraryView,
  resolveStoredFolder,
  writeLibraryView,
} from '../libraryViewPref';

beforeEach(() => localStorage.removeItem(LIBRARY_VIEW_STORAGE_KEY));

describe('the remembered Library view', () => {
  it('defaults when nothing (or junk) is stored', () => {
    expect(readLibraryView()).toEqual(DEFAULT_LIBRARY_VIEW);
    localStorage.setItem(LIBRARY_VIEW_STORAGE_KEY, '{not json');
    expect(readLibraryView()).toEqual(DEFAULT_LIBRARY_VIEW);
  });

  it('round-trips, merging partial writes', () => {
    writeLibraryView({ layout: 'list', group: 'series' });
    writeLibraryView({ lang: 'ja', level: '3', folder: 'Manga' });
    expect(readLibraryView()).toEqual({ folder: 'Manga', group: 'series', layout: 'list', lang: 'ja', level: '3' });
  });

  it('drops values an older or newer build might have written', () => {
    expect(normalizeLibraryView({ folder: '', group: 'author', layout: 'table', lang: 'xx', level: '9' })).toEqual(
      DEFAULT_LIBRARY_VIEW,
    );
    expect(normalizeLibraryView([1, 2])).toEqual(DEFAULT_LIBRARY_VIEW);
  });

  it('a folder that no longer exists opens All; the reserved views are always valid', () => {
    expect(resolveStoredFolder('Manga', ['Manga', 'Inbox'])).toBe('Manga');
    expect(resolveStoredFolder('Deleted', ['Manga'])).toBe('all');
    expect(resolveStoredFolder('unfiled', [])).toBe('unfiled');
  });
});

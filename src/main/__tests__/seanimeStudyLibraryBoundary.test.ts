/**
 * Phase 6 slice 1 — the read-only Seanime library boundary.
 *
 * The pure projection functions are tested directly; `readSeanimeStudyLibrary` needs the
 * sidecar client and is covered by its own describe block with `seanimeApi` mocked, so no
 * process is started and no network is touched.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Anime_LibraryCollection,
  Anime_LocalFile,
} from '../../../vendor/seanime/generated/types';
import {
  seanimeLibraryFiles,
  seanimeLibraryTitles,
} from '../seanime/studyLibrary';

function localFile(patch: Partial<Anime_LocalFile> = {}): Anime_LocalFile {
  return {
    path: 'C:\\Library\\Frieren\\Sousou no Frieren - 01.mkv',
    name: 'Sousou no Frieren - 01.mkv',
    locked: false,
    ignored: false,
    mediaId: 154587,
    metadata: { episode: 1, aniDBEpisode: '1', type: 'main' },
    ...patch,
  } as Anime_LocalFile;
}

function collection(
  entries: Array<{ mediaId: number; title?: Record<string, string> }>,
): Anime_LibraryCollection {
  return {
    lists: [{
      entries: entries.map(({ mediaId, title }) => ({
        mediaId,
        ...(title ? { media: { id: mediaId, title } } : {}),
      })),
    }],
  } as unknown as Anime_LibraryCollection;
}

describe('seanimeLibraryTitles', () => {
  it('prefers userPreferred, the name shown everywhere else in the adopted UI', () => {
    const titles = seanimeLibraryTitles(collection([{
      mediaId: 1,
      title: {
        userPreferred: 'Preferred',
        romaji: 'Romaji',
        english: 'English',
        native: 'ネイティブ',
      },
    }]));
    expect(titles.get(1)).toBe('Preferred');
  });

  it.each([
    ['romaji', { romaji: 'Romaji', english: 'English', native: 'ネイティブ' }, 'Romaji'],
    ['english', { english: 'English', native: 'ネイティブ' }, 'English'],
    ['native', { native: 'ネイティブ' }, 'ネイティブ'],
  ])('falls back to %s in order', (_label, title, expected) => {
    expect(seanimeLibraryTitles(collection([{ mediaId: 1, title }])).get(1)).toBe(expected);
  });

  it('ignores blank and whitespace-only titles rather than mapping an empty string', () => {
    const titles = seanimeLibraryTitles(collection([{
      mediaId: 1,
      title: { userPreferred: '   ', romaji: 'Romaji' },
    }]));
    expect(titles.get(1)).toBe('Romaji');

    const empty = seanimeLibraryTitles(collection([{
      mediaId: 2,
      title: { userPreferred: '  ', romaji: '' },
    }]));
    expect(empty.has(2)).toBe(false);
  });

  it('keeps the first title when an entry appears in more than one status list', () => {
    const dual = {
      lists: [
        { entries: [{ mediaId: 1, media: { id: 1, title: { userPreferred: 'First' } } }] },
        { entries: [{ mediaId: 1, media: { id: 1, title: { userPreferred: 'Second' } } }] },
      ],
    } as unknown as Anime_LibraryCollection;
    expect(seanimeLibraryTitles(dual).get(1)).toBe('First');
  });

  it('survives a collection with no lists or no entries', () => {
    expect(seanimeLibraryTitles({} as Anime_LibraryCollection).size).toBe(0);
    expect(seanimeLibraryTitles({ lists: [] } as Anime_LibraryCollection).size).toBe(0);
    expect(seanimeLibraryTitles({ lists: [{}] } as Anime_LibraryCollection).size).toBe(0);
  });
});

describe('seanimeLibraryFiles', () => {
  it('projects path, mediaId, episode and the joined title', () => {
    const [file] = seanimeLibraryFiles(
      [localFile()],
      new Map([[154587, 'Frieren']]),
    );
    expect(file).toEqual({
      path: 'C:\\Library\\Frieren\\Sousou no Frieren - 01.mkv',
      mediaId: 154587,
      episode: 1,
      title: 'Frieren',
    });
  });

  it('drops files the user told the sidecar to ignore', () => {
    expect(seanimeLibraryFiles([localFile({ ignored: true })], new Map())).toEqual([]);
  });

  it('drops files with no usable path instead of passing an empty one downstream', () => {
    const files = seanimeLibraryFiles(
      [localFile({ path: '' }), localFile({ path: '   ' }), localFile()],
      new Map(),
    );
    expect(files).toHaveLength(1);
  });

  it('trims a padded path so the join key is built from the real one', () => {
    const [file] = seanimeLibraryFiles([localFile({ path: '  C:\\A\\B.mkv  ' })], new Map());
    expect(file.path).toBe('C:\\A\\B.mkv');
  });

  it('omits episode when the sidecar matched none, rather than emitting undefined', () => {
    const [noMetadata] = seanimeLibraryFiles([localFile({ metadata: undefined })], new Map());
    expect('episode' in noMetadata).toBe(false);
  });

  it('omits title when the collection has no name for the media id', () => {
    const [file] = seanimeLibraryFiles([localFile()], new Map());
    expect('title' in file).toBe(false);
  });

  it('preserves incoming order', () => {
    const files = seanimeLibraryFiles(
      [
        localFile({ path: 'C:/A/03.mkv', metadata: { episode: 3 } as never }),
        localFile({ path: 'C:/A/01.mkv', metadata: { episode: 1 } as never }),
      ],
      new Map(),
    );
    expect(files.map((f) => f.episode)).toEqual([3, 1]);
  });
});

describe('readSeanimeStudyLibrary', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function load(
    onRoute: (route: string) => unknown,
  ): Promise<typeof import('../seanime/studyLibrary')> {
    vi.doMock('../seanime/client', () => ({
      seanimeApi: vi.fn(async (route: string) => onRoute(route)),
      SeanimeUnavailableError: class extends Error {},
    }));
    return import('../seanime/studyLibrary');
  }

  it('reads local-files for paths and the collection only for titles', async () => {
    const routes: string[] = [];
    const mod = await load((route) => {
      routes.push(route);
      if (route === '/api/v1/library/local-files') return [localFile()];
      return collection([{ mediaId: 154587, title: { userPreferred: 'Frieren' } }]);
    });
    const files = await mod.readSeanimeStudyLibrary();
    expect(routes).toEqual([
      '/api/v1/library/local-files',
      '/api/v1/library/collection',
    ]);
    expect(files).toHaveLength(1);
    expect(files[0].title).toBe('Frieren');
  });

  it('still returns the files when the collection read fails — an unnamed row beats none', async () => {
    const mod = await load((route) => {
      if (route === '/api/v1/library/local-files') return [localFile()];
      throw new Error('collection exploded');
    });
    const files = await mod.readSeanimeStudyLibrary();
    expect(files).toHaveLength(1);
    expect('title' in files[0]).toBe(false);
  });

  it('propagates a failed local-files read — an offline sidecar is not an empty library', async () => {
    const mod = await load((route) => {
      if (route === '/api/v1/library/local-files') throw new Error('sidecar is stopped');
      return collection([]);
    });
    await expect(mod.readSeanimeStudyLibrary()).rejects.toThrow('sidecar is stopped');
  });

  it('treats a null local-files payload as empty rather than throwing', async () => {
    const mod = await load((route) =>
      route === '/api/v1/library/local-files' ? null : collection([]));
    await expect(mod.readSeanimeStudyLibrary()).resolves.toEqual([]);
  });
});

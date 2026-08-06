/**
 * The sidecar cannot play a local file it has never scanned.
 *
 * `POST /api/v1/directstream/play/localfile` resolves the path against Seanime's
 * `local_files` table rather than the disk. Measured 2026-08-06 against the live
 * sidecar: the file was on disk, the path arrived correctly escaped, the POST
 * answered **200**, and the preparation was then aborted over the websocket with
 * `could not find local file`. `seanime.db` held no `local_files` row for it.
 *
 * The proof harness in `StudyPlayerSlice` never hit this because it sets
 * `library.libraryPath` and scans before it plays. `ensureSeanimeLibraryCovers`
 * is that setup, moved onto the path a user actually takes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensureSeanimeLibraryCovers,
  libraryCovers,
  mediaIdsFromScan,
  normalizeLibraryPath,
  parentFolderOf,
  resetSeanimeLibraryCache,
  rootsFromSettings,
  settingsBodyAddingRoot,
} from '../seanimeLibrary';

beforeEach(() => {
  resetSeanimeLibraryCache();
});

describe('path handling', () => {
  it('normalizes separators, case and trailing slashes', () => {
    expect(normalizeLibraryPath('C:\\Anime\\')).toBe('c:/anime');
    expect(normalizeLibraryPath('C:/Anime')).toBe('c:/anime');
    expect(normalizeLibraryPath('  C:\\Anime\\\\  ')).toBe('c:/anime');
  });

  it('takes the parent folder of a file in either separator style', () => {
    expect(parentFolderOf('C:\\Anime\\Show\\ep1.mkv')).toBe('C:\\Anime\\Show');
    expect(parentFolderOf('/media/anime/ep1.mkv')).toBe('/media/anime');
    expect(parentFolderOf('ep1.mkv')).toBe('');
  });
});

describe('coverage', () => {
  it('treats a folder inside a configured root as covered', () => {
    expect(libraryCovers(['C:\\Anime'], 'C:\\Anime\\Show')).toBe(true);
    expect(libraryCovers(['C:\\Anime'], 'C:\\Anime')).toBe(true);
  });

  it('does NOT treat a sibling sharing a name prefix as covered', () => {
    /*
      The whole point of comparing segments. `C:\Anime2` under a plain
      `startsWith('c:/anime')` reads as covered, so the scan is skipped and the
      open fails exactly as it did before — a fix that silently does nothing for
      the case it was written for.
    */
    expect(libraryCovers(['C:\\Anime'], 'C:\\Anime2')).toBe(false);
    expect(libraryCovers(['C:\\Anime'], 'C:\\Anime2\\Show')).toBe(false);
  });

  it('is case- and separator-insensitive, as Windows is', () => {
    expect(libraryCovers(['c:/anime'], 'C:\\ANIME\\Show')).toBe(true);
  });

  it('ignores empty roots and an empty target', () => {
    expect(libraryCovers(['', '   '], 'C:\\Anime')).toBe(false);
    expect(libraryCovers(['C:\\Anime'], '')).toBe(false);
  });

  it('reads both libraryPath and libraryPaths', () => {
    expect(rootsFromSettings({ libraryPath: 'C:\\A', libraryPaths: ['C:\\B', 2, 'C:\\C'] }))
      .toEqual(['C:\\A', 'C:\\B', 'C:\\C']);
    expect(rootsFromSettings(undefined)).toEqual([]);
  });
});

describe('the settings body', () => {
  it('appends a root and leaves every other section untouched', () => {
    const current = {
      library: { libraryPath: 'C:\\Anime', libraryPaths: ['C:\\Extra'], torrentProvider: 'qbit' },
      anilist: { token: 'keep-me' },
      torrent: { provider: 'keep-me-too' },
    };
    const body = settingsBodyAddingRoot(current, 'D:\\Downloads\\Show');
    const library = body.library as Record<string, unknown>;
    expect(library.libraryPath).toBe('C:\\Anime');
    expect(library.libraryPaths).toEqual(['C:\\Extra', 'D:\\Downloads\\Show']);
    // Not a settings reset on the way to adding a folder.
    expect(library.torrentProvider).toBe('qbit');
    expect(body.anilist).toEqual({ token: 'keep-me' });
    expect(body.torrent).toEqual({ provider: 'keep-me-too' });
  });

  it('claims libraryPath when Seanime is unconfigured, since a scan needs one', () => {
    const body = settingsBodyAddingRoot({ library: { libraryPath: '' } }, 'D:\\Show');
    const library = body.library as Record<string, unknown>;
    expect(library.libraryPath).toBe('D:\\Show');
    expect(library.libraryPaths).toEqual([]);
  });

  it('does not add a duplicate when the folder is already a root', () => {
    const body = settingsBodyAddingRoot(
      { library: { libraryPath: 'C:\\A', libraryPaths: ['D:\\Show'] } },
      'd:/show',
    );
    expect((body.library as Record<string, unknown>).libraryPaths).toEqual(['D:\\Show']);
  });
});

/** A `Response`-alike with just the surface the module touches. */
function reply(ok: boolean, body: unknown = {}): Response {
  return { ok, json: () => Promise.resolve(body) } as unknown as Response;
}

describe('scan results', () => {
  it('takes distinct positive media ids and ignores the rest', () => {
    expect(mediaIdsFromScan({ data: [
      { mediaId: 567 }, { mediaId: 567 }, { mediaId: 0 }, { mediaId: null }, {}, { mediaId: 21 },
    ] })).toEqual([567, 21]);
  });

  it('survives a body that is not the shape it expects', () => {
    expect(mediaIdsFromScan(null)).toEqual([]);
    expect(mediaIdsFromScan({})).toEqual([]);
    expect(mediaIdsFromScan({ data: 'nope' })).toEqual([]);
  });
});

describe('seeding the collection', () => {
  it('seeds known ids BEFORE the scan, since the matcher reads the collection', async () => {
    /*
      Ordering is the whole value. Seanime's enhanced matcher parsed "The Big O"
      from the filenames, searched MAL and built a container of "B: The
      Beginning: Succession" and "B: The Beginning" — 29 files, 29 unmatched,
      `local file has not been matched to a media`. Seeding AniList 567 first
      and re-scanning matched 26 of 29. Seeding afterwards would leave this
      scan's files unmatched and only help the next one.
    */
    const order: string[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (init?.method) order.push(path);
      if (path === '/api/v1/settings' && !init?.method) {
        return reply(true, { data: { library: { libraryPath: 'D:\\Anime\\Show' } } });
      }
      return reply(true);
    });

    await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', {
      request,
      seedMediaIds: async () => [567, 567, 21],
    });

    expect(order).toEqual(['/api/v1/library/unknown-media', '/api/v1/library/scan']);
    const seed = request.mock.calls.find((c) => c[0] === '/api/v1/library/unknown-media');
    expect(JSON.parse(String((seed?.[1] as RequestInit).body))).toEqual({ mediaIds: [567, 21] });
  });

  it('scans anyway when the app knows no ids, or the lookup throws', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => (
      path === '/api/v1/settings' && !init?.method
        ? reply(true, { data: { library: { libraryPath: 'D:\\Anime\\Show' } } })
        : reply(true)
    ));

    await expect(ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', {
      request,
      seedMediaIds: async () => { throw new Error('library unavailable'); },
    })).resolves.toBe('scanned');
    expect(request.mock.calls.some((c) => c[0] === '/api/v1/library/scan')).toBe(true);
    expect(request.mock.calls.some((c) => c[0] === '/api/v1/library/unknown-media')).toBe(false);
  });
});

describe('the scan request', () => {
  it('is enhanced, because the matcher refuses an empty collection', async () => {
    /*
      Not a preference. With `enhanced: false` the matcher pulls candidates from
      the tracker collection, and this app runs a simulated user whose
      collection is empty — measured live: 29 files walked, `localFilesCount: 0`,
      open still failing. See `docs/migration/CURRENT_STATE.md:405-416`.
    */
    let scanBody: Record<string, unknown> = {};
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/v1/settings' && !init?.method) {
        return reply(true, { data: { library: { libraryPath: 'C:\\Other' } } });
      }
      if (path === '/api/v1/library/scan') {
        scanBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return reply(true, { data: [{ mediaId: 567 }, { mediaId: 567 }] });
      }
      return reply(true);
    });

    await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request });

    expect(scanBody.enhanced).toBe(true);
    // And the matched ids are seeded, or the entries stay invisible above the
    // scanner's five-unknown auto-add threshold.
    const seed = request.mock.calls.find((c) => c[0] === '/api/v1/library/unknown-media');
    expect(seed, 'matched media were never seeded').toBeDefined();
    expect(JSON.parse(String((seed?.[1] as RequestInit).body))).toEqual({ mediaIds: [567] });
  });

  it('skips the seed when nothing matched, rather than posting an empty list', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => (
      path === '/api/v1/settings' && !init?.method
        ? reply(true, { data: { library: { libraryPath: 'C:\\Other' } } })
        : reply(true, { data: [] })
    ));
    await expect(ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request }))
      .resolves.toBe('scanned');
    expect(request.mock.calls.some((c) => c[0] === '/api/v1/library/unknown-media')).toBe(false);
  });
});

describe('ensureSeanimeLibraryCovers', () => {
  it('scans when the folder is outside every configured root', async () => {
    const calls: Array<{ path: string; method?: string }> = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method });
      if (path === '/api/v1/settings' && !init?.method) {
        return reply(true, { data: { library: { libraryPath: 'C:\\Other' } } });
      }
      return reply(true);
    });

    const outcome = await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request });

    expect(outcome).toBe('scanned');
    expect(calls).toEqual([
      { path: '/api/v1/library/local-files', method: undefined },
      { path: '/api/v1/settings', method: undefined },
      { path: '/api/v1/settings', method: 'PATCH' },
      { path: '/api/v1/library/scan', method: 'POST' },
    ]);
  });

  it('does nothing when the sidecar already lists the file', async () => {
    const request = vi.fn(async (path: string) => (
      path === '/api/v1/library/local-files'
        ? reply(true, { data: [{ path: 'd:/anime/show/EP1.MKV' }] })
        : reply(true)
    ));

    const outcome = await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request });

    expect(outcome).toBe('covered');
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('still scans a configured root whose files were never actually listed', async () => {
    /*
      The regression this ordering exists for, observed live. An initial
      `/api/v1/start` wrote the library root and its scan then failed; on the
      next open the folder read as "covered", the scan was skipped, and the
      open failed exactly as before. Configured is not scanned.
    */
    const calls: string[] = [];
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (path === '/api/v1/library/local-files') return reply(true, { data: [] });
      if (path === '/api/v1/settings' && !init?.method) {
        return reply(true, { data: { library: { libraryPath: 'D:\\Anime' } } });
      }
      return reply(true);
    });

    const outcome = await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request });

    expect(outcome).toBe('scanned');
    // The root is already configured, so no settings write — but it DOES scan.
    expect(calls).toEqual([
      'GET /api/v1/library/local-files',
      'GET /api/v1/settings',
      'POST /api/v1/library/scan',
    ]);
  });

  it('scans a given folder once per session, not once per open', async () => {
    const request = vi.fn(async (path: string, init?: RequestInit) => (
      path === '/api/v1/settings' && !init?.method
        ? reply(true, { data: { library: { libraryPath: 'C:\\Other' } } })
        : reply(true)
    ));

    await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request });
    await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep2.mkv', { request });

    const scans = request.mock.calls.filter((c) => c[0] === '/api/v1/library/scan');
    expect(scans).toHaveLength(1);
    // The cheap listing is still asked each time — it is the accurate answer.
    const listings = request.mock.calls.filter((c) => c[0] === '/api/v1/library/local-files');
    expect(listings).toHaveLength(2);
  });

  it('never throws, and does not cache a failure', async () => {
    const failing = vi.fn(async () => { throw new Error('sidecar restarting'); });
    await expect(ensureSeanimeLibraryCovers('D:\\A\\ep.mkv', { request: failing }))
      .resolves.toBe('failed');

    // A sidecar that was merely mid-restart must not disable playback for the
    // rest of the session, so the next open tries again.
    const working = vi.fn(async (path: string, init?: RequestInit) => (
      path === '/api/v1/settings' && !init?.method
        ? reply(true, { data: { library: { libraryPath: 'D:\\A' } } })
        : reply(true)
    ));
    await expect(ensureSeanimeLibraryCovers('D:\\A\\ep.mkv', { request: working }))
      .resolves.toBe('scanned');
    expect(working.mock.calls.some((c) => c[0] === '/api/v1/library/scan')).toBe(true);
  });

  it('sets up through /api/v1/start when the sidecar has no settings at all', async () => {
    /*
      The case that broke the first cut of this fix, live. A never-configured
      sidecar answers `GET /api/v1/settings` with 500 — not `{}` — and treating
      that as an error meant bailing out before the scan and failing the open in
      exactly the way this module exists to prevent. A 500 there means
      unconfigured, and unconfigured certainly means unscanned.
    */
    const calls: Array<{ path: string; method?: string }> = [];
    let startBody: Record<string, unknown> = {};
    const request = vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, method: init?.method });
      if (path === '/api/v1/settings' && !init?.method) return reply(false);
      if (path === '/api/v1/start') {
        startBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      }
      return reply(true);
    });

    const outcome = await ensureSeanimeLibraryCovers('D:\\Anime\\Show\\ep1.mkv', { request });

    expect(outcome).toBe('scanned');
    expect(calls).toEqual([
      { path: '/api/v1/library/local-files', method: undefined },
      { path: '/api/v1/settings', method: undefined },
      { path: '/api/v1/start', method: 'POST' },
      { path: '/api/v1/library/scan', method: 'POST' },
    ]);
    // An unconfigured instance has no libraryPath, so the folder has to claim it
    // or the scan has nothing to walk.
    expect((startBody.library as Record<string, unknown>).libraryPath).toBe('D:\\Anime\\Show');
    // `/api/v1/start` rejects a body missing these sections.
    for (const section of ['mediaPlayer', 'torrent', 'anilist', 'discord', 'manga', 'notifications', 'nakama']) {
      expect(startBody, `initial setup body is missing ${section}`).toHaveProperty(section);
    }
    expect(startBody.debridProvider).toBe('none');
  });

  it('fails without scanning when settings read AND setup both refuse', async () => {
    const request = vi.fn(async (path: string) => (
      path === '/api/v1/library/scan' ? reply(true) : reply(false)
    ));
    await expect(ensureSeanimeLibraryCovers('D:\\A\\ep.mkv', { request }))
      .resolves.toBe('failed');
    expect(request.mock.calls.map((c) => c[0])).toEqual([
      '/api/v1/library/local-files',
      '/api/v1/settings',
      '/api/v1/start',
    ]);
  });

  it('refuses a bare filename with no folder to scan', async () => {
    const request = vi.fn();
    await expect(ensureSeanimeLibraryCovers('ep1.mkv', { request })).resolves.toBe('failed');
    expect(request).not.toHaveBeenCalled();
  });
});

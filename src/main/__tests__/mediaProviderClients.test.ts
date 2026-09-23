// @vitest-environment node
/**
 * The anime-database clients' new pieces: AniList looked up by MyAnimeList id
 * (the enrichment every Jikan match gets), Jikan's prose durations, and the
 * artwork download guards. The AniList answer is recorded from the live API
 * on 2026-09-23 (`fixtures/metadata/anilist-media-idmal-52991.json`).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, net: { request: () => undefined } }));

const fixture = <T>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'metadata', name), 'utf8')) as T;

const posted: Array<{ url: string; body?: string }> = [];
const answer: { value: unknown } = { value: null };

vi.mock('../providers/providerHttp', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providers/providerHttp')>();
  return {
    ...actual,
    readCache: () => null,
    writeCache: () => undefined,
    requestJson: async (url: string, _limiter: unknown, options: { body?: string } = {}) => {
      posted.push({ url, body: options.body });
      return answer.value;
    },
  };
});

const { anilistByMalId, artworkUrlAllowed, looksLikeImage, parseJikanDuration } = await import('../mediaProviderClients');

beforeEach(() => {
  posted.length = 0;
  answer.value = null;
});

describe('anilistByMalId', () => {
  it('asks AniList by idMal and brings back the cover, banner and AniList id', async () => {
    answer.value = fixture('anilist-media-idmal-52991.json');
    const work = await anilistByMalId(52991);
    expect(posted).toHaveLength(1);
    expect(JSON.parse(posted[0]?.body ?? '{}').variables).toEqual({ idMal: 52991 });
    expect(work).toMatchObject({
      provider: 'anilist',
      anilistId: 154587,
      malId: 52991,
      runtimeMin: 24,
      country: 'JP',
      animation: true,
    });
    expect(work?.posterUrl).toMatch(/cover\/large\/bx154587/);
    expect(work?.bannerUrl).toMatch(/banner\/154587/);
  });

  it('answers null for an unlisted id without asking, and for no answer', async () => {
    expect(await anilistByMalId(0)).toBeNull();
    expect(posted).toHaveLength(0);
    expect(await anilistByMalId(52991)).toBeNull();
  });
});

describe('parseJikanDuration', () => {
  it('reads the forms Jikan writes', () => {
    expect(parseJikanDuration('24 min per ep')).toBe(24);
    expect(parseJikanDuration('1 hr 45 min')).toBe(105);
    expect(parseJikanDuration('2 hr')).toBe(120);
    expect(parseJikanDuration('Unknown')).toBeUndefined();
    expect(parseJikanDuration(undefined)).toBeUndefined();
  });
});

describe('artwork download guards', () => {
  it('admits the four providers\' image hosts and nothing else', () => {
    expect(artworkUrlAllowed('https://cdn.myanimelist.net/images/anime/1015/138006l.jpg')).toBe(true);
    expect(artworkUrlAllowed('https://s4.anilist.co/file/anilistcdn/media/anime/banner/154587.jpg')).toBe(true);
    expect(artworkUrlAllowed('https://static.tvmaze.com/uploads/images/original_untouched/44/111597.jpg')).toBe(true);
    expect(artworkUrlAllowed('https://image.tmdb.org/t/p/w500/x.jpg')).toBe(true);
    expect(artworkUrlAllowed('http://static.tvmaze.com/x.jpg')).toBe(false);
    expect(artworkUrlAllowed('https://evil.example/static.tvmaze.com/x.jpg')).toBe(false);
    expect(artworkUrlAllowed('https://static.tvmaze.com.evil.example/x.jpg')).toBe(false);
  });

  it('writes only real images, never an HTML error page', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
    const webp = Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 ', 'latin1');
    expect(looksLikeImage(jpeg)).toBe(true);
    expect(looksLikeImage(png)).toBe(true);
    expect(looksLikeImage(webp)).toBe(true);
    expect(looksLikeImage(Buffer.from('<!DOCTYPE html><html>'))).toBe(false);
    expect(looksLikeImage(Buffer.alloc(0))).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import {
  inferMediaCategory,
  localMediaSlotKey,
  mediaLibraryTarget,
  parseMediaFileName,
  resolveLocalMediaIdentities,
  sanitizeMediaPathSegment,
} from '../mediaFileIdentity';
import type { MediaItem } from '../types';

const item = (id: string, fileName: string, extra: Partial<MediaItem> = {}): MediaItem => ({
  id, title: '', path: `C:/inbox/${fileName}`, fileName, addedAt: 0, kind: 'video', ...extra,
});

describe('parseMediaFileName', () => {
  it('reads a scene release name', () => {
    expect(parseMediaFileName('Frieren.S01E02.1080p.WEB-DL.x264-GROUP.mkv')).toMatchObject({
      title: 'Frieren',
      titleKey: 'frieren',
      season: 1,
      episode: 2,
      episodeEnd: null,
      resolution: 1080,
      source: 'web',
      videoCodec: 'h264',
      releaseGroup: 'GROUP',
      kind: 'episode',
      extension: '.mkv',
    });
  });

  it('reads a fansub release name, taking the group from the leading bracket', () => {
    expect(parseMediaFileName('[SubsPlease] Sousou no Frieren - 01 (1080p) [ABCD1234].mkv')).toMatchObject({
      title: 'Sousou no Frieren',
      season: null,
      episode: 1,
      resolution: 1080,
      releaseGroup: 'SubsPlease',
      kind: 'episode',
    });
  });

  it('treats a bracketed year with no episode marker as a movie', () => {
    expect(parseMediaFileName('Your Name (2016) 1080p BluRay.mkv')).toMatchObject({
      title: 'Your Name',
      year: 2016,
      episode: null,
      season: null,
      resolution: 1080,
      source: 'bluray',
      kind: 'movie',
    });
  });

  it('caps episode numbers at three digits, so a four-digit token reads as a year', () => {
    const parsed = parseMediaFileName('Show - 2020.mkv');
    expect(parsed.episode).toBeNull();
    expect(parsed.year).toBe(2020);
    // The cap is what keeps the two unambiguous: 999 is still an episode.
    expect(parseMediaFileName('Show - 999.mkv')).toMatchObject({ episode: 999, year: null });
  });

  it('reads multi-episode ranges and 1x02 numbering', () => {
    expect(parseMediaFileName('Show.S01E02-E04.mkv')).toMatchObject({ season: 1, episode: 2, episodeEnd: 4 });
    expect(parseMediaFileName('Show 1x02.mkv')).toMatchObject({ season: 1, episode: 2 });
  });

  it('detects language tags and audio codecs, de-duplicated and sorted', () => {
    expect(parseMediaFileName('Movie.2019.JPN.ENG.Dual.FLAC.mkv')).toMatchObject({
      languages: ['en', 'ja'],
      audioCodec: 'flac',
      year: 2019,
    });
  });

  it('never throws on an unreadable name and keeps it groupable', () => {
    const parsed = parseMediaFileName('');
    expect(parsed.title).toBe('');
    expect(parsed.kind).toBe('unknown');
    expect(parsed.extension).toBe('');
  });

  it('classifies a season pack with no episode marker', () => {
    expect(parseMediaFileName('Show.Season.2.Complete.1080p.mkv')).toMatchObject({
      season: 2, episode: null, kind: 'season-pack',
    });
  });
});

describe('inferMediaCategory', () => {
  it('sees a movie that the baseline classifier files as inbox', () => {
    expect(inferMediaCategory(item('a', 'Your Name (2016) 1080p BluRay.mkv'))).toBe('movie');
  });

  it('routes an episode to tv, and to anime when a hint says so', () => {
    expect(inferMediaCategory(item('a', 'Drama.S01E01.1080p.WEB.mkv'))).toBe('tv');
    expect(inferMediaCategory(item('b', '[SubsPlease] Frieren - 01 (1080p).mkv'))).toBe('anime');
  });

  it('lets an explicit category win over every inference', () => {
    expect(inferMediaCategory(item('a', 'Your Name (2016).mkv', { category: 'personal' }))).toBe('personal');
  });

  it('leaves audio to the baseline classifier', () => {
    expect(inferMediaCategory(item('a', 'track.mp3', { kind: 'audio' }))).toBe('music');
  });
});

describe('resolveLocalMediaIdentities', () => {
  it('groups a series by title key and records the episodes present per season', () => {
    const result = resolveLocalMediaIdentities([
      item('a', 'Frieren.S01E01.1080p.WEB.mkv'),
      item('b', 'Frieren.S01E03.1080p.WEB.mkv'),
      item('c', 'Frieren.S02E01.1080p.WEB.mkv'),
    ]);
    expect(result.identities).toHaveLength(1);
    const [identity] = result.identities;
    expect(identity.episodesBySeason).toEqual({ 1: [1, 3], 2: [1] });
    expect(identity.missingBySeason).toEqual({ 1: [2] });
    expect(result.identityByItemId.a).toBe(identity.id);
  });

  it('records same-slot files as competing versions, best release first', () => {
    const result = resolveLocalMediaIdentities([
      item('low', 'Frieren.S01E01.720p.HDTV.mkv'),
      item('high', 'Frieren.S01E01.1080p.BluRay.mkv'),
    ]);
    const [identity] = result.identities;
    expect(identity.duplicateKeys).toEqual([localMediaSlotKey(1, 1)]);
    expect(identity.versions[localMediaSlotKey(1, 1)].map((v) => v.itemId)).toEqual(['high', 'low']);
  });

  it('keeps different years and different categories apart', () => {
    const byYear = resolveLocalMediaIdentities([
      item('a', 'Solaris (1972) 1080p.mkv'),
      item('b', 'Solaris (2002) 1080p.mkv'),
    ]);
    expect(byYear.identities).toHaveLength(2);

    const byCategory = resolveLocalMediaIdentities([
      item('film', 'Frieren (2023) 1080p BluRay.mkv'),
      item('show', 'Frieren.S01E01.1080p.WEB.mkv'),
    ]);
    expect(byCategory.identities).toHaveLength(2);
    expect(byCategory.identities.map((i) => i.category).sort()).toEqual(['movie', 'tv']);
  });

  it('is stable across input ordering', () => {
    const files = [item('a', 'Show.S01E01.mkv'), item('b', 'Show.S01E02.mkv'), item('c', 'Show.S01E03.mkv')];
    const forward = resolveLocalMediaIdentities(files);
    const reversed = resolveLocalMediaIdentities([...files].reverse());
    expect(reversed.identities).toEqual(forward.identities);
  });

  it('prefers the stored title over the parsed one when both exist', () => {
    const result = resolveLocalMediaIdentities([
      item('a', 'SNK.S01E01.mkv', { title: 'Attack on Titan' }),
      item('b', 'Attack.on.Titan.S01E02.mkv'),
    ]);
    expect(result.identities).toHaveLength(1);
    expect(result.identities[0].itemIds).toEqual(['a', 'b']);
  });

  it('skips items with no readable title at all', () => {
    expect(resolveLocalMediaIdentities([item('a', ''), item('b', '')]).identities).toHaveLength(0);
  });

  it('falls back to the raw name so an extension-only file stays groupable', () => {
    const result = resolveLocalMediaIdentities([item('a', '.mkv'), item('b', '.mkv')]);
    expect(result.identities).toHaveLength(1);
    expect(result.identities[0].itemIds).toEqual(['a', 'b']);
  });
});

describe('mediaLibraryTarget', () => {
  it('files a series under title and season, renaming to the canonical leaf', () => {
    expect(mediaLibraryTarget(item('a', '[SubsPlease] Frieren - 02 (1080p).mkv'), 'D:/Hub')).toMatchObject({
      path: 'D:/Hub/Anime/Frieren/Season 1/Frieren - S01E02.mkv',
      folders: ['Anime', 'Frieren', 'Season 1'],
    });
  });

  it('stamps a movie folder with its year', () => {
    expect(mediaLibraryTarget(item('a', 'Your Name (2016) 1080p BluRay.mkv'), 'D:/Hub').path)
      .toBe('D:/Hub/Movies/Your Name (2016)/Your Name (2016).mkv');
  });

  it('nests music under artist and album when known', () => {
    const track = item('a', 'track.mp3', { kind: 'audio', title: 'Kaikai Kitan', artist: 'Eve', album: 'Smile' });
    expect(mediaLibraryTarget(track, 'D:/Hub').path).toBe('D:/Hub/Music/Eve/Smile/Kaikai Kitan.mp3');
  });

  it('leaves an unclassified file flat in Unsorted under its own name', () => {
    const unknown = item('a', 'clip.mkv', { kind: 'video' });
    expect(mediaLibraryTarget(unknown, 'D:/Hub').path).toBe('D:/Hub/Unsorted/clip.mkv');
  });

  it('normalizes the root and keeps multi-episode ranges in the leaf', () => {
    expect(mediaLibraryTarget(item('a', 'Show.S01E02-E04.mkv'), 'D:\\Hub\\').path)
      .toBe('D:/Hub/TV/Show/Season 1/Show - S01E02-E04.mkv');
  });
});

describe('sanitizeMediaPathSegment', () => {
  it('strips characters Windows rejects but keeps hyphens', () => {
    expect(sanitizeMediaPathSegment('Re:Zero - Season 1')).toBe('Re Zero - Season 1');
  });

  it('never returns an empty segment, and drops trailing dots and spaces', () => {
    expect(sanitizeMediaPathSegment('///')).toBe('Untitled');
    expect(sanitizeMediaPathSegment('Show. ')).toBe('Show');
  });
});

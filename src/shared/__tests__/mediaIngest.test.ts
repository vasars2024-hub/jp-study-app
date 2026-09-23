import { describe, expect, it } from 'vitest';
import {
  activeWatchFolders,
  addWatchFolder,
  capSeenPaths,
  findSeriesSibling,
  hasRenamePlaceholders,
  hintFromSeriesMetadata,
  hintFromTags,
  hintPatchForItem,
  infoHashFromMagnet,
  ingestPathKey,
  ingestTagsForHint,
  isDownloaderIntermediate,
  isIngestCandidateName,
  isIngestCandidatePath,
  isIngestSizePlausible,
  isPathKeyWithin,
  isSampleName,
  isTorrentComplete,
  ledgerEntryForPath,
  mergeIngestHints,
  metadataOverrideFor,
  normalizeIngestHandoff,
  normalizeIngestHint,
  normalizeMediaIngestSettings,
  normalizeLedger,
  planQbitCompletions,
  pruneLedger,
  recordLedgerEntries,
  registerAutoFolder,
  removeWatchFolder,
  renameForTorrent,
  renderRenameTemplate,
  seriesPatchFromSibling,
  summarizeIngested,
  torrentOwningPath,
  LEDGER_TTL_MS,
  type MediaIngestLedger,
  type QbitTorrentSnapshot,
} from '../mediaIngest';
import type { MediaItem } from '../types';

function item(patch: Partial<MediaItem> = {}): MediaItem {
  return {
    id: 'i1',
    title: 'Frieren 05',
    path: 'D:/Anime/Frieren - 05.mkv',
    fileName: 'Frieren - 05.mkv',
    addedAt: 0,
    kind: 'video',
    ...patch,
  };
}

function torrent(patch: Partial<QbitTorrentSnapshot> = {}): QbitTorrentSnapshot {
  return {
    hash: 'a'.repeat(40),
    name: '[SubsPlease] Sousou no Frieren - 05 (1080p)',
    rawState: 'uploading',
    progress: 1,
    savePath: 'D:\\Downloads',
    contentPath: 'D:\\Downloads\\[SubsPlease] Sousou no Frieren - 05 (1080p).mkv',
    category: '',
    tags: [],
    ...patch,
  };
}

describe('file names', () => {
  it('accepts finished media and refuses partials, samples and scratch files', () => {
    expect(isIngestCandidateName('[SubsPlease] Frieren - 05 (1080p).mkv')).toBe(true);
    expect(isIngestCandidateName('song.flac')).toBe(true);
    expect(isIngestCandidateName('Frieren - 05.mkv.!qB')).toBe(false);
    expect(isIngestCandidateName('Frieren - 05.mkv.part')).toBe(false);
    expect(isIngestCandidateName('video.mp4.crdownload')).toBe(false);
    expect(isIngestCandidateName('video.tmp')).toBe(false);
    expect(isIngestCandidateName('notes.txt')).toBe(false);
    expect(isIngestCandidateName('Movie.2016.sample.mkv')).toBe(false);
    expect(isIngestCandidateName('Title [abc123].f137.mp4')).toBe(false);
    expect(isIngestCandidateName('Title [abc123].temp.mp4')).toBe(false);
  });

  it('knows a sample only by the word, not by a word containing it', () => {
    expect(isSampleName('sample.mkv')).toBe(true);
    expect(isSampleName('Show - 01 [Sample].mkv')).toBe(true);
    expect(isSampleName('Samplers - 01.mkv')).toBe(false);
    expect(isDownloaderIntermediate('Title [x].f251.webm')).toBe(true);
    expect(isDownloaderIntermediate('Title [x].webm')).toBe(false);
  });

  it('skips files under a Sample or .unwanted folder', () => {
    expect(isIngestCandidatePath('Show/Sample/show.mkv')).toBe(false);
    expect(isIngestCandidatePath('Show/.unwanted/ep01.mkv')).toBe(false);
    expect(isIngestCandidatePath('Show/Season 1/ep01.mkv')).toBe(true);
  });

  it('applies a size floor only by media type', () => {
    expect(isIngestSizePlausible('ep.mkv', 40 * 1024)).toBe(false);
    expect(isIngestSizePlausible('ep.mkv', 300 * 1024 * 1024)).toBe(true);
    expect(isIngestSizePlausible('track.mp3', 3 * 1024 * 1024)).toBe(true);
    expect(isIngestSizePlausible('track.mp3', 10 * 1024)).toBe(false);
  });

  it('builds one comparison key for the many spellings of a Windows path', () => {
    expect(ingestPathKey('D:\\Anime\\Show\\')).toBe('d:/anime/show');
    expect(ingestPathKey('d:/anime//show')).toBe('d:/anime/show');
    expect(ingestPathKey('\\\\nas\\share\\x')).toBe('//nas/share/x');
    expect(ingestPathKey('D:\\')).toBe('d:/');
    expect(ingestPathKey('/Media/Show', false)).toBe('/Media/Show');
    expect(isPathKeyWithin('d:/anime/show/ep.mkv', 'd:/anime')).toBe(true);
    expect(isPathKeyWithin('d:/anime2/ep.mkv', 'd:/anime')).toBe(false);
  });
});

describe('hints', () => {
  it('keeps only what it can trust from an IPC payload', () => {
    expect(normalizeIngestHint({
      malId: '52991',
      anilistId: -1,
      title: '  Frieren  ',
      episodes: [3, 1, 1, 'x'],
      category: 'anime',
      posterUrl: 'javascript:alert(1)',
    })).toEqual({ malId: 52_991, title: 'Frieren', episodes: [1, 3], category: 'anime' });
    expect(normalizeIngestHint({ category: 'spaceship' })).toBeUndefined();
    expect(normalizeIngestHint(null)).toBeUndefined();
  });

  it('merges field by field with the primary winning', () => {
    expect(mergeIngestHints({ malId: 1 }, { malId: 2, title: 'T' })).toEqual({ malId: 1, title: 'T' });
    expect(mergeIngestHints(undefined, { title: 'T' })).toEqual({ title: 'T' });
  });

  it('normalises a handoff and drops a relative save path', () => {
    expect(normalizeIngestHandoff({
      hint: { anilistId: 154_587 },
      rowEpisodes: { t1: [5], t2: 'nope' },
      savePath: 'relative/folder',
      via: 'mal-dialog',
    })).toEqual({ hint: { anilistId: 154_587 }, rowEpisodes: { t1: [5] }, via: 'mal-dialog' });
    expect(normalizeIngestHandoff({ savePath: 'D:\\Anime' })?.savePath).toBe('D:\\Anime');
  });

  it('reads the Scraper’s stored identification as a hint', () => {
    expect(hintFromSeriesMetadata({
      malId: 52_991, aniListId: 154_587, titleEn: 'Frieren', titleRomaji: 'Sousou no Frieren', titleJa: '葬送のフリーレン',
    })).toEqual({
      provider: 'scraper', malId: 52_991, anilistId: 154_587, title: 'Frieren', nativeTitle: '葬送のフリーレン', category: 'anime',
    });
    expect(hintFromSeriesMetadata(null)).toBeUndefined();
  });

  it('prefers the AniList id for the exact metadata lookup', () => {
    expect(metadataOverrideFor({ malId: 1, anilistId: 2 })).toEqual({ provider: 'anilist', id: 2 });
    expect(metadataOverrideFor({ malId: 1 })).toEqual({ provider: 'jikan', id: 1 });
    expect(metadataOverrideFor({ title: 'x' })).toBeNull();
  });
});

describe('torrent identity', () => {
  it('decodes hex and base32 info hashes to qBittorrent’s lowercase hex', () => {
    const hex = '0123456789ABCDEF0123456789ABCDEF01234567';
    expect(infoHashFromMagnet(`magnet:?xt=urn:btih:${hex}&dn=x`)).toBe(hex.toLowerCase());
    // base32 of 20 zero bytes is 32 'A's.
    expect(infoHashFromMagnet(`magnet:?xt=urn:btih:${'A'.repeat(32)}`)).toBe('0'.repeat(40));
    expect(infoHashFromMagnet('magnet:?dn=nothing')).toBe('');
  });

  it('tags with gum plus ids, and reads the ids back', () => {
    const tags = ingestTagsForHint({ malId: 52_991, anilistId: 154_587 });
    expect(tags).toEqual(['gum', 'gum:al:154587', 'gum:mal:52991']);
    expect(hintFromTags(['seasonal', ...tags])).toEqual({ anilistId: 154_587, malId: 52_991, provider: 'tags', category: 'anime' });
    expect(hintFromTags(['gum'])).toBeUndefined();
    expect(ingestTagsForHint(undefined)).toEqual(['gum']);
  });
});

describe('rename template', () => {
  it('fills the placeholders or sends nothing at all', () => {
    expect(renderRenameTemplate('{series} - {episode}', { series: 'Frieren', episode: 5 })).toBe('Frieren - 05');
    expect(renderRenameTemplate('{series} - {episode}', { series: 'Frieren', episode: [1, 12] })).toBe('Frieren - 01-12');
    expect(renderRenameTemplate('{series} - {episode}', { series: 'Frieren' })).toBe('');
    expect(renderRenameTemplate('{series} {unknown}', { series: 'x' })).toBe('');
    expect(renderRenameTemplate('{series}', { series: 'A/B: C' })).toBe('A B C');
    expect(hasRenamePlaceholders('Literal name')).toBe(false);
  });

  it('prefers the catalogue title and the row’s own episode over the release name', () => {
    expect(renameForTorrent('{series} - {episode}', '[G] Sousou no Frieren - 05 [1080p]', { title: 'Frieren' }, [5]))
      .toBe('Frieren - 05');
    expect(renameForTorrent('{series} - {episode}', '[G] Sousou no Frieren - 07 [1080p]'))
      .toBe('Sousou no Frieren - 07');
    expect(renameForTorrent('{series} - {episode}', '[G] Sousou no Frieren [Batch]', { title: 'Frieren' }, [1, 2, 3]))
      .toBe('Frieren - 01-03');
    expect(renameForTorrent('Literal', 'anything')).toBe('');
  });
});

describe('applying a hint', () => {
  it('lets the hint outrank the name on a new one-video download', () => {
    const patch = hintPatchForItem(
      item({ episode: 64, category: 'tv', seriesTitle: 'Sousou no Frieren' }),
      { malId: 52_991, title: 'Frieren', episodes: [5], category: 'anime', season: 1 },
      { isNew: true, videoCount: 1 },
    );
    expect(patch).toEqual({
      malId: 52_991, category: 'anime', seriesTitle: 'Frieren', season: 1, episode: 5, episodeKind: 'episode',
    });
  });

  it('does not force an episode across a batch', () => {
    const patch = hintPatchForItem(item({ episode: 3 }), { episodes: [1, 2, 3] }, { isNew: true, videoCount: 3 });
    expect(patch.episode).toBeUndefined();
  });

  it('only fills missing ids on an item whose metadata is settled', () => {
    const settled = item({ metadataSource: 'jikan', category: 'tv', seriesTitle: 'X' });
    expect(hintPatchForItem(settled, { anilistId: 7, title: 'Y', category: 'anime' }, { isNew: false, videoCount: 1 }))
      .toEqual({ anilistId: 7 });
  });
});

describe('series siblings', () => {
  const matched = item({
    id: 'old',
    path: 'D:/Anime/Frieren - 04.mkv',
    seriesKey: 'frieren',
    season: 1,
    malId: 52_991,
    anilistId: 154_587,
    metadataSource: 'anilist',
    metadataUpdatedAt: 1,
    posterPath: 'artwork/poster.jpg',
    seriesTitle: 'Frieren: Beyond Journey’s End',
    episodeTitles: { 4: 'The Land Where Souls Rest' },
    genres: ['Fantasy'],
  });

  it('finds the matched show by id and adopts its series key', () => {
    const incoming = item({ seriesKey: 'sousou no frieren' });
    const found = findSeriesSibling([matched, incoming], incoming, { anilistId: 154_587 });
    expect(found?.byId).toBe(true);
    if (!found) throw new Error('expected a sibling');
    const patch = seriesPatchFromSibling(found.sibling, incoming, found.byId);
    expect(patch.seriesKey).toBe('frieren');
    expect(patch.posterPath).toBe('artwork/poster.jpg');
    expect(patch.metadataSource).toBe('anilist');
    // Copied, not shared: editing one item's list must not edit the other's.
    expect(patch.genres).not.toBe(matched.genres);
  });

  it('falls back to the series key only within the same season', () => {
    expect(findSeriesSibling([matched], item({ seriesKey: 'frieren', season: 1 }))?.byId).toBe(false);
    expect(findSeriesSibling([matched], item({ seriesKey: 'frieren', season: 2 }))).toBeUndefined();
    expect(findSeriesSibling([{ ...matched, metadataSource: 'unmatched' }], item({ seriesKey: 'frieren' }))).toBeUndefined();
  });

  it('does not fall back to the key when the hint names a different id', () => {
    expect(findSeriesSibling([matched], item({ seriesKey: 'frieren' }), { anilistId: 999 })).toBeUndefined();
  });
});

describe('summaries', () => {
  it('reads as one show and an episode range when a batch lands', () => {
    const event = summarizeIngested([
      item({ id: 'a', seriesKey: 'frieren', seriesTitle: 'Frieren', episode: 2, season: 1 }),
      item({ id: 'b', seriesKey: 'frieren', seriesTitle: 'Frieren', episode: 1, season: 1 }),
    ], 'qbittorrent', 42);
    expect(event.summary).toEqual({ title: 'Frieren', count: 2, kind: 'video', season: 1, episode: 1, episodeEnd: 2 });
    expect(event.itemIds).toEqual(['a', 'b']);
    expect(event.at).toBe(42);
  });

  it('names the first item when unrelated files land together', () => {
    const event = summarizeIngested([
      item({ id: 'a', title: 'Movie A', seriesKey: 'a' }),
      item({ id: 'b', title: 'Movie B', seriesKey: 'b' }),
    ], 'watch-folder', 1);
    expect(event.summary.title).toBe('Movie A');
    expect(event.summary.episode).toBeUndefined();
  });
});

describe('watch-folder settings', () => {
  it('migrates the single legacy folder into the list', () => {
    const settings = normalizeMediaIngestSettings(undefined, 'D:\\Anime');
    expect(settings.folders).toEqual([{ path: 'D:\\Anime', origin: 'user', addedAt: 0 }]);
    expect(settings.autoImport).toBe(true);
    // A persisted list wins over the legacy field.
    expect(normalizeMediaIngestSettings({ folders: [] }, 'D:\\Anime').folders).toEqual([]);
  });

  it('drops malformed and duplicate folders', () => {
    const settings = normalizeMediaIngestSettings({
      autoImport: false,
      folders: [
        { path: 'D:\\A', origin: 'user', addedAt: 1 },
        { path: 'd:/a/', origin: 'qbittorrent' },
        { path: 'relative', origin: 'user' },
        { path: 'E:\\B', origin: 'alien' },
      ],
    });
    expect(settings.autoImport).toBe(false);
    expect(settings.folders.map((f) => [f.path, f.origin])).toEqual([['D:\\A', 'user'], ['E:\\B', 'user']]);
  });

  it('dismisses a removed automatic folder so it does not come back', () => {
    let settings = registerAutoFolder(normalizeMediaIngestSettings({}), 'D:\\Downloads', 'qbittorrent', 1).settings;
    settings = removeWatchFolder(settings, 'D:\\Downloads\\');
    expect(settings.folders).toEqual([]);
    expect(registerAutoFolder(settings, 'D:\\Downloads', 'qbittorrent', 2).added).toBe(false);
    // Choosing it by hand brings it back as the user's.
    const readded = addWatchFolder(settings, 'D:\\Downloads', 'user', 3);
    expect(readded.added).toBe(true);
    expect(readded.settings.dismissed).toEqual([]);
  });

  it('does not register an automatic folder inside one already watched', () => {
    const base = addWatchFolder(normalizeMediaIngestSettings({}), 'D:\\Media', 'user', 1).settings;
    expect(registerAutoFolder(base, 'D:\\Media\\Downloads', 'qbittorrent', 2).added).toBe(false);
  });

  it('pauses the automatic folders when auto-import is off, never the user’s', () => {
    let settings = addWatchFolder(normalizeMediaIngestSettings({}), 'D:\\Mine', 'user', 1).settings;
    settings = registerAutoFolder(settings, 'D:\\Downloads', 'qbittorrent', 2).settings;
    expect(activeWatchFolders(settings).map((f) => f.path)).toEqual(['D:\\Mine', 'D:\\Downloads']);
    expect(activeWatchFolders({ ...settings, autoImport: false }).map((f) => f.path)).toEqual(['D:\\Mine']);
  });

  it('caps the seen memory from the oldest end', () => {
    expect(capSeenPaths(['a', 'b', 'c', 'd'], 2)).toEqual(['c', 'd']);
  });
});

describe('the handoff ledger', () => {
  const hash = 'b'.repeat(40);
  const empty: MediaIngestLedger = { version: 1, entries: {} };

  it('records, refreshes the identity, and keeps the first sighting', () => {
    let ledger = recordLedgerEntries(empty, [{ hash, via: 'torrent-manager', createdAt: 100, hint: { title: 'X' } }], 100);
    ledger = recordLedgerEntries(ledger, [{ hash: hash.toUpperCase(), via: 'mal-dialog', createdAt: 200, hint: { malId: 5 } }], 200);
    expect(ledger.entries[hash]).toMatchObject({ via: 'mal-dialog', createdAt: 100, hint: { malId: 5, title: 'X' } });
  });

  it('forgets entries past their lifetime and rejects bad hashes on load', () => {
    const ledger = normalizeLedger({ entries: { [hash]: { hash, createdAt: 0, via: 'x' }, nope: { hash: 'zz', createdAt: 0 } } });
    expect(Object.keys(ledger.entries)).toEqual([hash]);
    expect(Object.keys(pruneLedger(ledger, LEDGER_TTL_MS + 1).entries)).toEqual([]);
  });

  it('matches a watched file by destination + release name, then by name alone', () => {
    const ledger = recordLedgerEntries(empty, [
      { hash, via: 'seanime', createdAt: 1, name: 'Frieren Batch', savePath: 'E:\\Seanime', hint: { malId: 1 } },
      { hash: 'c'.repeat(40), via: 'x', createdAt: 2, name: '[G] Show - 01 [1080p].mkv', hint: { malId: 2 } },
    ], 3);
    expect(ledgerEntryForPath(ledger, 'E:\\Seanime\\Frieren Batch\\ep01.mkv')?.hint?.malId).toBe(1);
    expect(ledgerEntryForPath(ledger, 'F:\\Other\\[G] Show - 01 [1080p].mkv')?.hint?.malId).toBe(2);
    expect(ledgerEntryForPath(ledger, 'F:\\Other\\Unrelated.mkv')).toBeUndefined();
  });
});

describe('qBittorrent completion', () => {
  it('treats moving and checking as not yet complete', () => {
    expect(isTorrentComplete(torrent())).toBe(true);
    expect(isTorrentComplete(torrent({ rawState: 'moving' }))).toBe(false);
    expect(isTorrentComplete(torrent({ rawState: 'checkingUP' }))).toBe(false);
    expect(isTorrentComplete(torrent({ progress: 0.99, rawState: 'downloading' }))).toBe(false);
  });

  it('baselines the first poll except for torrents the app handed off', () => {
    const mine = torrent({ hash: 'c'.repeat(40) });
    const theirs = torrent({ hash: 'd'.repeat(40) });
    const plan = planQbitCompletions([mine, theirs], { handled: new Set(), baselined: false }, new Set([mine.hash]));
    expect(plan.toIngest.map((t) => t.hash)).toEqual([mine.hash]);
    expect(plan.baseline).toEqual([theirs.hash]);
  });

  it('imports every newly finished torrent after the baseline, once', () => {
    const done = torrent();
    const busy = torrent({ hash: 'e'.repeat(40), progress: 0.3, rawState: 'downloading' });
    const subs = torrent({ hash: 'f'.repeat(40), category: 'jp-study-subtitles' });
    const state = { handled: new Set<string>(), baselined: true };
    const plan = planQbitCompletions([done, busy, subs], state, new Set(), new Set(['jp-study-subtitles']));
    expect(plan.toIngest.map((t) => t.hash)).toEqual([done.hash]);
    state.handled.add(done.hash);
    expect(planQbitCompletions([done], state, new Set()).toIngest).toEqual([]);
  });

  it('knows which torrent a file belongs to, by content path or save path + name', () => {
    const single = torrent();
    const folder = torrent({ hash: 'g'.repeat(40), name: 'Show S01', contentPath: '' });
    expect(torrentOwningPath([single], 'd:/downloads/[SubsPlease] Sousou no Frieren - 05 (1080p).mkv')).toBe(single);
    expect(torrentOwningPath([folder], 'D:\\Downloads\\Show S01\\ep01.mkv')).toBe(folder);
    expect(torrentOwningPath([single, folder], 'D:\\Downloads\\loose.mkv')).toBeUndefined();
  });
});

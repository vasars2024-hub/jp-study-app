// @vitest-environment node
//
// The watch library's file half: detection and import of real export files
// (xml, xml.gz, zip, folder, single csv), the MAL OAuth-store fold, the player
// hook, and the CRUD channels — against real files in a temp directory.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdmZip from 'adm-zip';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

const sent: { channel: string; payload: unknown }[] = [];

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: {
    getAllWindows: () => [{
      isDestroyed: () => false,
      webContents: { send: (channel: string, payload: unknown) => sent.push({ channel, payload }) },
    }],
    getFocusedWindow: () => null,
  },
}));

import {
  __setWatchLibraryPathsForTests,
  addWatchTitle,
  getWatchTitle,
  importWatchFile,
  listWatchTitles,
  listWatchTitlesNeedingLookup,
  readWatchLibrary,
  recordWatchLocalProgress,
  removeWatchTitleById,
  setWatchTitleMetadata,
  updateWatchTitle,
  watchImportHistory,
  type WatchImportSummary,
} from '../watchLibrary';
import { __setMalLibraryPathForTests, applyMalLibrarySync, readMalLibrary } from '../malLibrary';

const FIXTURES = path.resolve(__dirname, '../../shared/imports/__fixtures__');
const MAL_XML = path.join(FIXTURES, 'mal/animelist_1758240000_-_9999999.xml');
const MANGA_XML = path.join(FIXTURES, 'mal/mangalist_1758240000_-_9999999.xml');
const LB_DIR = path.join(FIXTURES, 'letterboxd');

const NOW = Date.UTC(2025, 9, 1, 12);
const DAY = 86_400_000;

let dir: string;
let watchFile: string;
let mediaFile: string;
let malFile: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-watch-library-'));
  watchFile = path.join(dir, 'watch-library.json');
  mediaFile = path.join(dir, 'media.json');
  malFile = path.join(dir, 'mal-library.json');
  __setWatchLibraryPathsForTests({ watch: () => watchFile, media: () => mediaFile });
  __setMalLibraryPathForTests(() => malFile);
  sent.length = 0;
});

afterEach(() => {
  __setWatchLibraryPathsForTests(null);
  __setMalLibraryPathForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

function ok(result: ReturnType<typeof importWatchFile>): WatchImportSummary {
  if (!result.ok) throw new Error(`import failed: ${result.errorKey}`);
  return result;
}

function copyTo(name: string, source: string): string {
  const target = path.join(dir, name);
  fs.copyFileSync(source, target);
  return target;
}

function letterboxdZip(name: string, rootFolder = ''): string {
  const zip = new AdmZip();
  const walk = (folder: string, prefix: string): void => {
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(full, rel);
      else zip.addFile(`${rootFolder}${rel}`, fs.readFileSync(full));
    }
  };
  walk(LB_DIR, '');
  const target = path.join(dir, name);
  zip.writeZip(target);
  return target;
}

function writeMedia(items: unknown[]): void {
  fs.writeFileSync(mediaFile, JSON.stringify({ items, relationships: [] }), 'utf-8');
}

// ---------------------------------------------------------------------------

describe('importWatchFile — MyAnimeList', () => {
  it('imports the .xml, mirrors it into mal-library.json, and summarises', () => {
    const summary = ok(importWatchFile(MAL_XML, NOW));
    expect(summary).toMatchObject({
      ok: true, source: 'mal-export', format: 'mal-xml', fileName: 'animelist_1758240000_-_9999999.xml',
      exportedAt: 1758240000 * 1000, username: 'sample_user', total: 8, added: 8, updated: 0, unchanged: 0,
      byStatus: { completed: 3, watching: 1, plan: 1, on_hold: 1, dropped: 1, rewatching: 1 },
      unmatched: [], unmatchedCount: 1, skipped: { manga: 0, removed: 0 }, linkedToLocal: 0, needsLookup: 0,
      malLibrary: { added: 8, updated: 0, unchanged: 0 },
    });
    expect(readMalLibrary().entries.map((e) => e.malId).sort((a, b) => a - b)).toEqual([1, 199, 457, 790, 5081, 16498, 32281, 37999]);
    const stored = JSON.parse(fs.readFileSync(watchFile, 'utf-8'));
    expect(stored.version).toBe(1);
    expect(stored.titles).toHaveLength(8);
    expect(stored.imports[0]).toMatchObject({ source: 'mal-export', added: 8, exportedAt: 1758240000 * 1000 });
    expect(sent.filter((s) => s.channel === 'watch:changed').at(-1)?.payload).toMatchObject({ reason: 'import' });
  });

  it('a second import of the same file adds nothing, in either store', () => {
    ok(importWatchFile(MAL_XML, NOW));
    const again = ok(importWatchFile(MAL_XML, NOW + DAY));
    expect([again.added, again.updated, again.unchanged]).toEqual([0, 0, 8]);
    expect(again.malLibrary).toEqual({ added: 0, updated: 0, unchanged: 8 });
    expect(readWatchLibrary().titles).toHaveLength(8);
  });

  it('reads the .xml.gz MAL actually hands out, as the same data', () => {
    const gz = path.join(dir, 'animelist_1758240000_-_9999999.xml.gz');
    fs.writeFileSync(gz, zlib.gzipSync(fs.readFileSync(MAL_XML)));
    const summary = ok(importWatchFile(gz, NOW));
    expect(summary).toMatchObject({ format: 'mal-xml-gz', added: 8, exportedAt: 1758240000 * 1000 });
    expect(ok(importWatchFile(MAL_XML, NOW + DAY)).added).toBe(0);
  });

  it('reads a MAL export that was zipped, and one renamed with a BOM', () => {
    const zip = new AdmZip();
    zip.addFile('export/animelist.xml', fs.readFileSync(MAL_XML));
    const zipped = path.join(dir, 'mal.zip');
    zip.writeZip(zipped);
    expect(ok(importWatchFile(zipped, NOW)).format).toBe('mal-zip');

    const renamed = path.join(dir, 'my list.txt');
    fs.writeFileSync(renamed, `\uFEFF${fs.readFileSync(MAL_XML, 'utf-8')}`, 'utf-8');
    expect(ok(importWatchFile(renamed, NOW + DAY)).unchanged).toBe(8);
  });

  it('refuses a manga list with a reason, and writes nothing', () => {
    const result = importWatchFile(MANGA_XML, NOW);
    expect(result).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.mangaOnly' });
    expect(result.ok ? '' : result.error).toContain('manga');
    expect(fs.existsSync(watchFile)).toBe(false);
  });

  it('keeps a MAL export from rolling back a newer OAuth sync in mal-library.json', () => {
    applyMalLibrarySync({
      entries: [{ animeId: 1, title: 'Cowboy Bebop', altTitles: ['カウボーイビバップ'], totalEpisodes: 26, status: 'completed', episodesWatched: 26, score: 10, rewatching: false, updatedAt: '2025-12-01T00:00:00+00:00' }],
    }, NOW);
    ok(importWatchFile(MAL_XML, NOW + DAY));
    const row = readMalLibrary().entries.find((e) => e.malId === 1);
    expect(row).toMatchObject({ status: 'completed', episodesWatched: 26, altTitles: ['カウボーイビバップ'] });
  });
});

describe('importWatchFile — Letterboxd', () => {
  it('imports the export zip and reads the export time from its name', () => {
    const zip = letterboxdZip('letterboxd-sample_viewer-2025-01-01-10-00-utc.zip');
    const summary = ok(importWatchFile(zip, NOW));
    expect(summary).toMatchObject({
      source: 'letterboxd', format: 'letterboxd-zip', username: 'sample_viewer', exportedAt: Date.UTC(2025, 0, 1, 10, 0),
      total: 7, added: 7, updated: 0, unchanged: 0, byStatus: { completed: 5, plan: 2 }, needsLookup: 7, unmatchedCount: 2,
    });
    expect(summary.unmatched.map((u) => u.reason)).toEqual(['no-name', 'favorite-not-in-export']);
    expect(summary.files?.find((f) => f.path === 'deleted/diary.csv')?.kind).toBe('ignored');
    const again = ok(importWatchFile(zip, NOW + DAY));
    expect([again.added, again.updated, again.unchanged]).toEqual([0, 0, 7]);
  });

  it('reads a zip whose files sit in one top-level folder, and an unzipped folder', () => {
    ok(importWatchFile(letterboxdZip('export.zip', 'letterboxd-sample_viewer-2025-01-01-10-00-utc/'), NOW));
    const folder = ok(importWatchFile(LB_DIR, NOW + DAY));
    expect(folder).toMatchObject({ format: 'letterboxd-folder', added: 0, unchanged: 7 });
  });

  it('imports a single CSV, and a later full export completes the picture without duplicates', () => {
    const diary = copyTo('diary.csv', path.join(LB_DIR, 'diary.csv'));
    // No timestamp in the name: "as of" is the newest row (2024-06-01), not the
    // copy's mtime — so the properly-named export below still counts as newer.
    expect(ok(importWatchFile(diary, NOW))).toMatchObject({ format: 'letterboxd-csv', added: 3, exportedAt: Date.UTC(2024, 5, 1) });
    const full = ok(importWatchFile(letterboxdZip('letterboxd-sample_viewer-2025-01-01-10-00-utc.zip'), NOW + DAY));
    expect([full.added, full.updated]).toEqual([4, 3]);
    expect(readWatchLibrary().titles).toHaveLength(7);
    // ratings.csv (5 stars) outranks the diary-only fallback (latest viewing, 4.5).
    const spirited = listWatchTitles({ search: 'spirited' }, NOW + DAY).items[0];
    expect(spirited).toMatchObject({ stars: 5, score: 10, letterboxdUri: 'https://boxd.it/2a1m', favorite: true });
  });

  it('reads a UTF-16 CSV saved by a spreadsheet', () => {
    const text = fs.readFileSync(path.join(LB_DIR, 'watchlist.csv'), 'utf-8');
    const file = path.join(dir, 'watchlist.csv');
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    expect(ok(importWatchFile(file, NOW))).toMatchObject({ added: 1, byStatus: { plan: 1 } });
  });
});

describe('importWatchFile — refusals', () => {
  it('refuses a missing path, an empty path and a foreign file', () => {
    expect(importWatchFile(path.join(dir, 'nope.zip'), NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.notFound' });
    expect(importWatchFile('', NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.notFound' });
    expect(importWatchFile(42, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.notFound' });
    const bank = path.join(dir, 'bank.csv');
    fs.writeFileSync(bank, 'Date,Amount,Payee\n2024-01-01,3,X\n');
    expect(importWatchFile(bank, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.unrecognized' });
    const rss = path.join(dir, 'feed.xml');
    fs.writeFileSync(rss, '<?xml version="1.0"?><rss/>');
    expect(importWatchFile(rss, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.unrecognized' });
  });

  it('refuses a corrupt gzip as unreadable rather than throwing', () => {
    const bad = path.join(dir, 'animelist.xml.gz');
    fs.writeFileSync(bad, Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02]));
    const result = importWatchFile(bad, NOW);
    expect(result).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.unreadable' });
  });

  it('refuses an empty export', () => {
    const empty = path.join(dir, 'animelist_1_-_1.xml');
    fs.writeFileSync(empty, '<myanimelist><myinfo><user_export_type>1</user_export_type></myinfo></myanimelist>');
    expect(importWatchFile(empty, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.import.error.empty' });
  });
});

// ---------------------------------------------------------------------------

describe('the MAL OAuth store fold', () => {
  const syncRow = (updatedAt: string, status = 'watching', episodesWatched = 3) => ({
    animeId: 52991, title: 'Sousou no Frieren', altTitles: ['Frieren: Beyond Journey\'s End'], totalEpisodes: 28,
    status, episodesWatched, score: 0, rewatching: false, updatedAt,
  });

  it('brings existing mal-library.json rows in on first read, once', () => {
    applyMalLibrarySync({ entries: [syncRow('2025-09-01T00:00:00+00:00')] }, NOW - DAY);
    const first = listWatchTitles({}, NOW);
    expect(first.items.map((t) => [t.id, t.status, t.progress, t.sources])).toEqual([['mal:52991', 'watching', 3, ['mal-sync']]]);
    expect(first.items[0].altTitles).toEqual(['Frieren: Beyond Journey\'s End']);
    expect(sent.some((s) => (s.payload as { reason?: string }).reason === 'mal-sync')).toBe(true);
    expect(listWatchTitles({}, NOW + 1).total).toBe(1);
  });

  it('keeps following later syncs', () => {
    applyMalLibrarySync({ entries: [syncRow('2025-09-01T00:00:00+00:00')] }, NOW - DAY);
    listWatchTitles({}, NOW);
    applyMalLibrarySync({ entries: [syncRow('2025-09-20T00:00:00+00:00', 'completed', 28)] }, NOW + DAY);
    expect(getWatchTitle('mal:52991', NOW + 2 * DAY)).toMatchObject({ status: 'completed', progress: 28 });
  });

  it('skips derivative rows — discovery is not tracking', () => {
    applyMalLibrarySync({
      entries: [syncRow('2025-09-01T00:00:00+00:00')],
      derivatives: [{ animeId: 99999, title: 'Frieren Season 2', relation: 'sequel', relationLabel: 'Sequel', fromAnimeId: 52991, depth: 1 }],
    }, NOW - DAY);
    expect(listWatchTitles({}, NOW).total).toBe(1);
  });

  it('a manual edit made after an export is kept when a later sync re-writes the store', () => {
    ok(importWatchFile(MAL_XML, NOW));
    // The user drops Cowboy Bebop in the app, after the export was made.
    expect(updateWatchTitle('mal:1', { status: 'dropped' }, NOW + DAY)).toMatchObject({ ok: true });
    // A later OAuth sync that knows nothing about Bebop touches the store.
    applyMalLibrarySync({ entries: [syncRow('2025-10-03T00:00:00+00:00')] }, NOW + 2 * DAY);
    const bebop = getWatchTitle('mal:1', NOW + 3 * DAY);
    expect(bebop?.status).toBe('dropped');
    expect(getWatchTitle('mal:52991', NOW + 3 * DAY)?.status).toBe('watching');
  });
});

// ---------------------------------------------------------------------------

describe('recordWatchLocalProgress — the player hook', () => {
  const bebop = (episode: number, extra: Record<string, unknown> = {}) => ({
    id: `bebop-${episode}`, path: path.join(dir, `Cowboy Bebop - ${String(episode).padStart(2, '0')}.mkv`), fileName: 'x.mkv',
    title: `Cowboy Bebop ${episode}`, addedAt: 1, category: 'anime', seriesTitle: 'Cowboy Bebop', seriesKey: 'cowboy bebop',
    season: 1, episode, episodeKind: 'episode', malId: 1, durationSec: 1440, ...extra,
  });

  it('returns before touching disk below 90%', () => {
    const result = recordWatchLocalProgress({ mediaItemId: 'x', positionSec: 10, durationSec: 1440 }, NOW);
    expect(result).toEqual({ ok: true, counted: false, changed: false, created: false, reason: 'below-threshold' });
    expect(fs.existsSync(watchFile)).toBe(false);
    expect(recordWatchLocalProgress({ positionSec: 'x' }, NOW).reason).toBe('invalid-input');
  });

  it('advances an imported title from a finished episode', () => {
    ok(importWatchFile(MAL_XML, NOW));
    writeMedia([bebop(13)]);
    const result = recordWatchLocalProgress({ mediaItemId: 'bebop-13', positionSec: 1400, durationSec: 1440 }, NOW + DAY);
    expect(result).toMatchObject({ ok: true, counted: true, changed: true, created: false, titleId: 'mal:1', status: 'watching', progress: 13 });
    const view = getWatchTitle('mal:1', NOW + DAY);
    expect(view).toMatchObject({ progress: 13, onDisk: true, mediaItemIds: ['bebop-13'], lastWatchedAt: NOW + DAY });
    expect(view?.sources).toEqual(['mal-export', 'local']);
  });

  it('finds the item by path too', () => {
    ok(importWatchFile(MAL_XML, NOW));
    writeMedia([bebop(26)]);
    const result = recordWatchLocalProgress({ path: bebop(26).path.toUpperCase(), positionSec: 1440, durationSec: 1440 }, NOW + DAY);
    if (process.platform === 'win32') expect(result).toMatchObject({ status: 'completed', progress: 26 });
    else expect(result.reason).toBe('unknown-media');
  });

  it('creates a title for a finished film the library did not track', () => {
    writeMedia([{
      id: 'arrival', path: path.join(dir, 'Arrival (2016).mkv'), fileName: 'Arrival (2016).mkv', title: 'Arrival', addedAt: 1,
      category: 'movie', seriesTitle: 'Arrival', seriesKey: 'arrival', year: 2016, episodeKind: 'movie', durationSec: 6960,
    }]);
    const result = recordWatchLocalProgress({ mediaItemId: 'arrival', positionSec: 6500, durationSec: 6960 }, NOW);
    expect(result).toMatchObject({ counted: true, changed: true, created: true, status: 'completed', progress: 1 });
    const [title] = listWatchTitles({}, NOW).items;
    expect(title).toMatchObject({ kind: 'film', title: 'Arrival', year: 2016, sources: ['local'], onDisk: true, runtime: 116 });
  });

  it('ignores media it cannot or should not track', () => {
    writeMedia([{ id: 'song', path: 'x.flac', fileName: 'x.flac', title: 'Song', addedAt: 1, kind: 'audio', category: 'music' }]);
    expect(recordWatchLocalProgress({ mediaItemId: 'song', positionSec: 200, durationSec: 210 }, NOW).reason).toBe('not-trackable');
    expect(recordWatchLocalProgress({ mediaItemId: 'missing', positionSec: 200, durationSec: 210 }, NOW).reason).toBe('unknown-media');
  });
});

// ---------------------------------------------------------------------------

describe('CRUD channels', () => {
  it('add, update, get, remove — with a tombstone that stops an older re-import', () => {
    const added = addWatchTitle({ kind: 'tv', title: 'Severance', year: 2022 }, NOW);
    if (!added.ok) throw new Error(added.errorKey);
    expect(added).toMatchObject({ created: true, title: { kind: 'tv', title: 'Severance', status: 'plan', sources: ['manual'] } });
    const id = added.title.id;

    const updated = updateWatchTitle(id, { status: 'watching', progress: 3, notes: 'S1' }, NOW + DAY);
    expect(updated).toMatchObject({ ok: true, title: { status: 'watching', progress: 3, notes: 'S1' } });
    expect(updateWatchTitle('nope', { status: 'dropped' }, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.error.notFound' });

    expect(removeWatchTitleById(id, NOW + 2 * DAY)).toEqual({ ok: true });
    expect(getWatchTitle(id, NOW + 2 * DAY)).toBeNull();
    expect(removeWatchTitleById(id, NOW + 2 * DAY)).toMatchObject({ ok: false });

    ok(importWatchFile(MAL_XML, NOW + 3 * DAY));
    expect(removeWatchTitleById('mal:16498', NOW + 4 * DAY)).toEqual({ ok: true });
    const again = ok(importWatchFile(MAL_XML, NOW + 5 * DAY));
    expect(again.skipped.removed).toBe(1);
    expect(getWatchTitle('mal:16498', NOW + 5 * DAY)).toBeNull();
  });

  it('adds a title from a local media item', () => {
    writeMedia([{ id: 'f1', path: 'f.mkv', fileName: 'f.mkv', title: 'Frieren 01', addedAt: 1, category: 'anime', seriesTitle: 'Sousou no Frieren', seriesKey: 'sousou no frieren', season: 1, episode: 1, malId: 52991 }]);
    const added = addWatchTitle({ fromMediaItemId: 'f1', status: 'watching' }, NOW);
    expect(added).toMatchObject({ ok: true, created: true, title: { id: 'mal:52991', status: 'watching', onDisk: true, anime: true } });
    expect(addWatchTitle({ fromMediaItemId: 'nope' }, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.error.unknownMedia' });
    expect(addWatchTitle({ title: 'no kind' }, NOW)).toMatchObject({ ok: false, errorKey: 'watchLibrary.error.invalidTitle' });
  });

  it('queries through the IPC-shaped entry point, sanitising the query', () => {
    ok(importWatchFile(MAL_XML, NOW));
    const result = listWatchTitles({ kinds: ['film', 'junk'], sort: 'score', direction: 'desc' }, NOW);
    expect(result.items.map((t) => t.id)).toEqual(['mal:199', 'mal:32281']);
    expect(result.facets.total).toBe(8);
  });

  it('lets the metadata pass fill a Letterboxd title, and lists what still needs a lookup', () => {
    ok(importWatchFile(letterboxdZip('letterboxd-sample_viewer-2025-01-01-10-00-utc.zip'), NOW));
    expect(listWatchTitlesNeedingLookup()).toHaveLength(7);
    const id = 'lb:boxd.it/2a1m';
    const filled = setWatchTitleMetadata(id, { tmdbId: 129, tmdbType: 'movie', genres: ['Animation'], posterPath: 'artwork/poster-129.jpg', runtimeMinutes: 125 }, NOW + DAY);
    expect(filled).toMatchObject({ tmdbId: 129, genres: ['Animation'] });
    expect(listWatchTitlesNeedingLookup()).toHaveLength(6);
    expect(listWatchTitles({ genres: ['animation'] }, NOW + DAY).items.map((t) => t.id)).toEqual([id]);
    expect(setWatchTitleMetadata('nope', {}, NOW)).toBeNull();
  });

  it('keeps an import history, newest first', () => {
    ok(importWatchFile(MAL_XML, NOW));
    ok(importWatchFile(LB_DIR, NOW + DAY));
    expect(watchImportHistory().map((r) => r.source)).toEqual(['letterboxd', 'mal-export']);
  });
});

describe('the document on disk', () => {
  it('quarantines a corrupt file instead of overwriting the evidence', () => {
    fs.writeFileSync(watchFile, '{ not json', 'utf-8');
    expect(readWatchLibrary().titles).toEqual([]);
    const moved = fs.readdirSync(dir).filter((name) => name.startsWith('watch-library.json.corrupt-'));
    expect(moved).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, moved[0]), 'utf-8')).toBe('{ not json');
  });

  it('quarantines a document from a newer schema version', () => {
    fs.writeFileSync(watchFile, JSON.stringify({ version: 99, titles: [] }), 'utf-8');
    expect(readWatchLibrary().titles).toEqual([]);
    expect(fs.readdirSync(dir).some((name) => name.startsWith('watch-library.v99-'))).toBe(true);
  });

  it('writes atomically: no temp file is left behind', () => {
    ok(importWatchFile(MAL_XML, NOW));
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.tmp'))).toEqual([]);
  });
});

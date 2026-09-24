// @vitest-environment node
//
// Cross-source duplicates. A MAL list and a Letterboxd export name the same
// film differently ("Sen to Chihiro no Kamikakushi" / "Spirited Away",
// "Kimi no Na wa." / "Your Name.") and used to stay two titles with two
// ratings. Once the metadata pass has stored every name and the year, the
// re-merge folds them — sources unioned, history kept, no rating lost. Built
// on a 1,400-row synthetic MAL export (like tmp/libaudit's) and the small
// Letterboxd sample zip.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('electron', () => ({
  app: { getPath: (): string => '/nonexistent-test-userdata' },
  ipcMain: { handle: (): void => undefined },
  dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
  BrowserWindow: { getAllWindows: () => [], getFocusedWindow: () => null },
}));

import {
  __setWatchLibraryPathsForTests,
  importWatchFile,
  mergeWatchLibraryDuplicates,
  readWatchLibrary,
  setWatchTitleMetadata,
  updateWatchTitle,
} from '../watchLibrary';
import { __setMalLibraryPathForTests } from '../malLibrary';

const LB_ZIP = path.resolve(__dirname, '../../shared/imports/__fixtures__/letterboxd-sample.zip');
const NOW = Date.UTC(2026, 8, 1, 12);
const DAY = 86_400_000;

let dir: string;

function row(id: number, title: string, type: string, score: number, finish: string): string {
  return `<anime><series_animedb_id>${id}</series_animedb_id><series_title><![CDATA[${title}]]></series_title>`
    + `<series_type>${type}</series_type><series_episodes>${type === 'Movie' ? 1 : 12}</series_episodes>`
    + `<my_watched_episodes>${type === 'Movie' ? 1 : 12}</my_watched_episodes><my_start_date>${finish}</my_start_date>`
    + `<my_finish_date>${finish}</my_finish_date><my_score>${score}</my_score><my_status>Completed</my_status>`
    + '<my_comments><![CDATA[]]></my_comments><my_times_watched>0</my_times_watched><my_tags><![CDATA[]]></my_tags>'
    + '<my_rewatching>0</my_rewatching></anime>';
}

/** A MAL export with no timestamp in its name: 1,398 invented titles plus the two real films. */
function writeMalExport(name: string): string {
  const rows: string[] = [];
  for (let i = 0; i < 1398; i += 1) rows.push(row(900000 + i, `Synthetic Title ${i}`, i % 5 === 0 ? 'Movie' : 'TV', i % 11, `2018-0${(i % 9) + 1}-15`));
  rows.push(row(199, 'Sen to Chihiro no Kamikakushi', 'Movie', 10, '2020-01-02'));
  rows.push(row(32281, 'Kimi no Na wa.', 'Movie', 8, '2019-05-00'));
  const file = path.join(dir, name);
  fs.writeFileSync(file, `<?xml version="1.0" encoding="UTF-8" ?><myanimelist><myinfo><user_export_type>1</user_export_type></myinfo>${rows.join('')}</myanimelist>`);
  return file;
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-watch-dedupe-'));
  __setWatchLibraryPathsForTests({ watch: () => path.join(dir, 'watch-library.json'), media: () => path.join(dir, 'media.json') });
  __setMalLibraryPathForTests(() => path.join(dir, 'mal-library.json'));
});

afterEach(() => {
  __setWatchLibraryPathsForTests(null);
  __setMalLibraryPathForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
});

const byName = (name: string) => readWatchLibrary().titles.filter((title) =>
  [title.title, ...(title.altTitles ?? [])].some((entry) => entry === name));

describe('cross-source duplicates', () => {
  it('dates an unnamed MAL export by its newest my_* date, not the file mtime', () => {
    const file = writeMalExport('animelist.xml');
    const result = importWatchFile(file, NOW);
    if (!result.ok) throw new Error(result.errorKey);
    expect(result.total).toBe(1400);
    expect(result.exportedAt).toBe(Date.UTC(2020, 0, 2));
  });

  it('a copied old export cannot overwrite a newer edit', () => {
    const file = writeMalExport('animelist.xml');
    importWatchFile(file, NOW);
    updateWatchTitle('mal:199', { score: 6 }, NOW + DAY);
    // A copy made today: its mtime is newer than the edit, its contents are not.
    fs.utimesSync(file, new Date(NOW + 2 * DAY), new Date(NOW + 2 * DAY));
    importWatchFile(file, NOW + 3 * DAY);
    expect(readWatchLibrary().titles.find((title) => title.id === 'mal:199')?.score).toBe(6);
  });

  it('merges MAL and Letterboxd copies of the same film once metadata knows its names', () => {
    importWatchFile(writeMalExport('animelist.xml'), NOW);
    importWatchFile(LB_ZIP, NOW + 1000);
    expect(byName('Spirited Away')).toHaveLength(1); // the Letterboxd row only, so far
    const before = readWatchLibrary().titles.length;

    // What the metadata pass writes (AniList by MAL id).
    setWatchTitleMetadata('mal:199', {
      year: 2001, anilistId: 199, englishTitle: 'Spirited Away', romajiTitle: 'Sen to Chihiro no Kamikakushi',
      originalTitle: '千と千尋の神隠し', altTitles: ['Sen to Chihiro no Kamikakushi', 'Spirited Away', '千と千尋の神隠し'],
    }, NOW + 2000);
    setWatchTitleMetadata('mal:32281', {
      year: 2016, anilistId: 21519, englishTitle: 'Your Name.', romajiTitle: 'Kimi no Na wa.',
      altTitles: ['Kimi no Na wa.', 'Your Name.', '君の名は。'],
    }, NOW + 2000);

    const merged = mergeWatchLibraryDuplicates(NOW + 3000);
    expect(merged).toHaveLength(2);
    const titles = readWatchLibrary().titles;
    expect(titles).toHaveLength(before - 2);

    const spirited = titles.find((title) => title.malId === 199);
    expect(spirited).toBeDefined();
    // The older row keeps its id; the other is folded into it.
    expect(merged.find((entry) => entry.into === spirited?.id)?.from).toHaveLength(1);
    expect(spirited?.sources).toEqual(expect.arrayContaining(['mal-export', 'letterboxd']));
    expect(spirited?.letterboxdUri).toBeTruthy();
    // The Letterboxd diary survives, rewatch included.
    expect(spirited?.watchDates.some((entry) => entry.rewatch)).toBe(true);
    expect(spirited?.score).toBe(10);

    const yourName = titles.find((title) => title.malId === 32281);
    expect(yourName?.sources).toEqual(expect.arrayContaining(['mal-export', 'letterboxd']));
    // MAL said 8 (as of 2020), Letterboxd 3.5 stars (as of 2024): the newer shows,
    // the other is kept, not lost.
    expect(yourName?.score).toBe(7);
    expect(yourName?.stars).toBe(3.5);
    expect(yourName?.scoreHistory?.map((entry) => entry.score)).toEqual([8]);

    // Idempotent, and a re-import lands on the merged titles.
    expect(mergeWatchLibraryDuplicates(NOW + 4000)).toEqual([]);
    const again = importWatchFile(LB_ZIP, NOW + 5000);
    if (!again.ok) throw new Error(again.errorKey);
    expect(again.added).toBe(0);
    expect(readWatchLibrary().titles).toHaveLength(before - 2);
  });

  it('keeps the most recent user edit when merging', () => {
    importWatchFile(writeMalExport('animelist.xml'), NOW);
    importWatchFile(LB_ZIP, NOW + 1000);
    const lb = byName('Your Name.')[0];
    updateWatchTitle(lb.id, { notes: 'watch with subs', status: 'rewatching' }, NOW + 1500);
    setWatchTitleMetadata('mal:32281', { year: 2016, altTitles: ['Your Name.'] }, NOW + 2000);
    mergeWatchLibraryDuplicates(NOW + 3000);
    const merged = readWatchLibrary().titles.find((title) => title.malId === 32281);
    expect(merged?.notes).toBe('watch with subs');
    expect(merged?.status).toBe('rewatching');
    expect(merged?.manual).toEqual(expect.arrayContaining(['notes', 'status']));
  });

  it('does not merge two films that only share a name', () => {
    importWatchFile(LB_ZIP, NOW);
    const count = readWatchLibrary().titles.length;
    // A second "Spirited Away" with a different year is a different film.
    const lbId = byName('Spirited Away')[0].id;
    expect(lbId).toBeTruthy();
    expect(mergeWatchLibraryDuplicates(NOW + 1)).toEqual([]);
    expect(readWatchLibrary().titles).toHaveLength(count);
  });
});

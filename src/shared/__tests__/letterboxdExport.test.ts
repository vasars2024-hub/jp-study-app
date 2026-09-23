// Letterboxd export parser, on a realistic unzipped fixture
// (`imports/__fixtures__/letterboxd/`, invented profile).
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  classifyLetterboxdFile,
  latestLetterboxdDate,
  letterboxdExportTimestampFromFileName,
  letterboxdFilmsToObservations,
  looksLikeLetterboxdCsv,
  parseLetterboxdExport,
  type LetterboxdFile,
} from '../imports/letterboxdExport';

const ROOT = path.resolve(__dirname, '../imports/__fixtures__/letterboxd');

function readTree(dir: string, prefix = ''): LetterboxdFile[] {
  const out: LetterboxdFile[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...readTree(path.join(dir, entry.name), rel));
    else out.push({ path: rel, text: fs.readFileSync(path.join(dir, entry.name), 'utf-8') });
  }
  return out;
}

const files = readTree(ROOT);
const parsed = parseLetterboxdExport(files);
const film = (name: string) => parsed.films.find((f) => f.name === name);

describe('parseLetterboxdExport — the whole export', () => {
  it('finds one record per film, no matter how many files mention it', () => {
    expect(parsed.films.map((f) => f.name).sort()).toEqual([
      'Crouching Tiger, Hidden Dragon',
      'Paprika',
      'Past Lives',
      'Perfect Blue',
      'Spirited Away',
      'The Wind Rises',
      'Your Name.',
    ]);
  });

  it('reads the profile: username and favourites by URI', () => {
    expect(parsed.username).toBe('sample_viewer');
    expect(film('Spirited Away')?.favorite).toBe(true);
    expect(film('Perfect Blue')?.favorite).toBe(true);
    expect(film('Paprika')?.favorite).toBe(false);
  });

  it('reports rows it could not use: a nameless row and a favourite not in the export', () => {
    expect(parsed.unmatched).toEqual([
      { file: 'watched.csv', year: 2011, reason: 'no-name' },
      { file: 'profile.csv', name: 'https://boxd.it/zzZZ', reason: 'favorite-not-in-export' },
    ]);
  });

  it('keeps the film URI from watched/ratings, never a diary entry URI', () => {
    const spirited = film('Spirited Away');
    expect(spirited?.uri).toBe('https://boxd.it/2a1m');
    expect(spirited?.diary).toHaveLength(2);
    expect(parsed.films.some((f) => f.uri?.includes('4Hq8Tj'))).toBe(false);
  });

  it('combines watched, rating, likes, diary and list membership for one film', () => {
    expect(film('Spirited Away')).toMatchObject({
      year: 2001,
      watched: true,
      liked: true,
      rating: 5,
      lists: ['Ghibli ranked'],
    });
    expect(film('Spirited Away')?.diary.map((v) => [v.watchedAt, v.rewatch, v.rating])).toEqual([
      ['2023-01-04', false, 5],
      ['2024-06-01', true, 4.5],
    ]);
  });

  it('keeps a quoted name with a comma whole', () => {
    expect(film('Crouching Tiger, Hidden Dragon')).toMatchObject({ year: 2000, rating: 4, uri: 'https://boxd.it/1Ekq' });
    expect(film('Crouching Tiger, Hidden Dragon')?.diary[0].tags).toEqual(['wuxia', 'cinema']);
  });

  it('reads a multi-line review with escaped quotes and does not double-count its viewing', () => {
    const perfect = film('Perfect Blue');
    expect(perfect?.review?.text).toBe('Unsettling in the best way.\nThe mirror scenes, the "real" Mima, the edits \u2014 all of it.');
    expect(perfect?.diary).toHaveLength(1);
    expect(perfect?.rating).toBe(4.5);
  });

  it('reads the watchlist, the likes-only and the list-only films', () => {
    expect(film('Past Lives')).toMatchObject({ watchlist: true, watched: false, year: 2023 });
    expect(film('Paprika')).toMatchObject({ liked: true, watched: true });
    expect(film('The Wind Rises')).toMatchObject({ watched: false, watchlist: false, lists: ['Ghibli ranked'] });
  });

  it('ignores deleted/ and says which kind every file was taken for', () => {
    expect(parsed.films.some((f) => f.name === 'Deleted Entry Film')).toBe(false);
    const kinds = Object.fromEntries(parsed.files.map((f) => [f.path, f.kind]));
    expect(kinds).toEqual({
      'deleted/diary.csv': 'ignored',
      'diary.csv': 'diary',
      'likes/films.csv': 'likes',
      'lists/ghibli-ranked.csv': 'list',
      'profile.csv': 'profile',
      'ratings.csv': 'ratings',
      'reviews.csv': 'reviews',
      'watched.csv': 'watched',
      'watchlist.csv': 'watchlist',
    });
    expect(parsed.lists).toEqual(['Ghibli ranked']);
  });

  it('parses identically with a BOM and CRLF line endings', () => {
    const windows = files.map((f) => ({ path: f.path, text: `\uFEFF${f.text.replace(/\r?\n/g, '\r\n')}` }));
    const again = parseLetterboxdExport(windows);
    expect(again.films.map((f) => ({ ...f, review: f.review && { ...f.review, text: f.review.text.replace(/\r\n/g, '\n') } })))
      .toEqual(parsed.films);
  });

  it('strips one shared top-level folder (a re-zipped export)', () => {
    const nested = files.map((f) => ({ path: `letterboxd-sample_viewer-2025-01-01-10-00-utc/${f.path}`, text: f.text }));
    expect(parseLetterboxdExport(nested).films).toEqual(parsed.films);
  });

  it('accepts Windows path separators', () => {
    const windows = files.map((f) => ({ path: f.path.replace(/\//g, '\\'), text: f.text }));
    expect(parseLetterboxdExport(windows).films).toEqual(parsed.films);
  });
});

describe('a single CSV', () => {
  const diary = files.find((f) => f.path === 'diary.csv') as LetterboxdFile;

  it('imports the diary alone: every diary film is watched with its viewings', () => {
    const alone = parseLetterboxdExport([diary]);
    expect(alone.films.map((f) => f.name).sort()).toEqual(['Crouching Tiger, Hidden Dragon', 'Perfect Blue', 'Spirited Away']);
    expect(alone.films.every((f) => f.uri === undefined)).toBe(true);
  });

  it('recognises a renamed file by its header', () => {
    expect(classifyLetterboxdFile('my-diary-backup.csv', diary.text)).toBe('diary');
    const ratings = files.find((f) => f.path === 'ratings.csv') as LetterboxdFile;
    expect(classifyLetterboxdFile('stars.csv', ratings.text)).toBe('ratings');
    const watchlist = files.find((f) => f.path === 'watchlist.csv') as LetterboxdFile;
    expect(classifyLetterboxdFile('my watchlist.csv', watchlist.text)).toBe('watchlist');
    expect(classifyLetterboxdFile('seen.csv', watchlist.text)).toBe('watched');
    const list = files.find((f) => f.path === 'lists/ghibli-ranked.csv') as LetterboxdFile;
    expect(classifyLetterboxdFile('ranked.csv', list.text)).toBe('list');
  });

  it('refuses CSVs that are not Letterboxd', () => {
    expect(looksLikeLetterboxdCsv('bank.csv', 'Date,Amount,Payee\n2024-01-01,3,X\n')).toBe(false);
    expect(looksLikeLetterboxdCsv('C:\\Downloads\\diary.csv', diary.text)).toBe(true);
    expect(classifyLetterboxdFile('notes.txt', diary.text)).toBe('ignored');
  });

  it('names a list from its slug when the metadata block is missing', () => {
    const bare = 'Position,Name,Year,URL,Description\n1,Akira,1988,https://boxd.it/29sE,\n';
    const result = parseLetterboxdExport([{ path: 'lists/late-night-anime.csv', text: bare }]);
    expect(result.lists).toEqual(['late night anime']);
    expect(result.films[0]).toMatchObject({ name: 'Akira', year: 1988, uri: 'https://boxd.it/29sE', lists: ['late night anime'] });
  });
});

describe('export time', () => {
  it('falls back to the newest row date as a lower bound', () => {
    expect(latestLetterboxdDate(parsed.films)).toBe(Date.UTC(2024, 5, 1));
    expect(latestLetterboxdDate([])).toBeUndefined();
  });

  it('reads the UTC export time from the zip name', () => {
    expect(letterboxdExportTimestampFromFileName('letterboxd-sample_viewer-2025-01-01-10-00-utc.zip'))
      .toBe(Date.UTC(2025, 0, 1, 10, 0));
    expect(letterboxdExportTimestampFromFileName('diary.csv')).toBeUndefined();
  });
});

describe('letterboxdFilmsToObservations', () => {
  const asOf = Date.UTC(2025, 0, 1, 10, 0);
  const obs = new Map(letterboxdFilmsToObservations(parsed.films, asOf).map((o) => [o.identity.title, o]));

  it('makes films (identity kind only, never asserted) with the export time', () => {
    for (const o of obs.values()) {
      expect(o.source).toBe('letterboxd');
      expect(o.asOf).toBe(asOf);
      expect(o.identity.kind).toBe('film');
      expect(o.fields.kind).toBeUndefined();
    }
  });

  it('maps rating to stars and a 0–10 score, diary to viewings, latest viewing to finishedAt', () => {
    const spirited = obs.get('Spirited Away');
    expect(spirited?.identity).toMatchObject({ year: 2001, letterboxdUri: 'https://boxd.it/2a1m' });
    expect(spirited?.fields).toMatchObject({
      status: 'completed',
      progress: 1,
      score: { score: 10, scale: 'stars', stars: 5 },
      finishedAt: '2024-06-01',
      rewatchCount: 1,
      liked: true,
      favorite: true,
      tags: ['ghibli', 'comfort'],
      lists: ['Ghibli ranked'],
    });
    expect(spirited?.fields.watchDates).toEqual([
      { date: '2023-01-04', rewatch: undefined, stars: 5, source: 'letterboxd' },
      { date: '2024-06-01', rewatch: true, stars: 4.5, source: 'letterboxd' },
    ]);
    // "Date added" is the earliest date Letterboxd logged anything for it (the
    // `Date` column), not the viewing date the diary entry is about.
    expect(spirited?.addedAt).toBe(Date.UTC(2023, 0, 5));
  });

  it('half stars survive: 3.5 stars is a 7', () => {
    expect(obs.get('Your Name.')?.fields.score).toEqual({ score: 7, scale: 'stars', stars: 3.5 });
  });

  it('watchlist and list-only films are plan, liked-only films are completed', () => {
    expect(obs.get('Past Lives')?.fields.status).toBe('plan');
    expect(obs.get('Past Lives')?.fields.progress).toBeUndefined();
    expect(obs.get('The Wind Rises')?.fields.status).toBe('plan');
    expect(obs.get('Paprika')?.fields.status).toBe('completed');
  });

  it('carries the review text', () => {
    expect(obs.get('Perfect Blue')?.fields.review).toContain('Unsettling');
  });

  it('falls back to the latest diary rating when ratings.csv is absent', () => {
    const diaryOnly = parseLetterboxdExport(files.filter((f) => f.path === 'diary.csv'));
    const o = letterboxdFilmsToObservations(diaryOnly.films).find((x) => x.identity.title === 'Spirited Away');
    expect(o?.fields.score).toEqual({ score: 9, scale: 'stars', stars: 4.5 });
  });
});

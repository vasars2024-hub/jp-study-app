/**
 * Letterboxd's data export — parsed without an account.
 *
 * Settings → Data → "Export your data" gives `letterboxd-<user>-YYYY-MM-DD-HH-MM-utc.zip`:
 *
 *   profile.csv       Date Joined,Username,…,Favorite Films        (favorites = comma-joined film URIs)
 *   watched.csv       Date,Name,Year,Letterboxd URI                (Date = when it was logged as watched)
 *   ratings.csv       Date,Name,Year,Letterboxd URI,Rating         (0.5–5 in half stars)
 *   diary.csv         Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
 *   reviews.csv       Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
 *   watchlist.csv     Date,Name,Year,Letterboxd URI
 *   likes/films.csv   Date,Name,Year,Letterboxd URI
 *   lists/<slug>.csv  "Letterboxd list export v7" / list header / blank line / Position,Name,Year,URL,Description
 *   deleted/…, orphaned/…, comments.csv, likes/lists.csv, likes/reviews.csv — ignored
 *
 * ## The diary URI is not the film's URI
 *
 * In `watched`/`ratings`/`watchlist`/`likes` the `Letterboxd URI` is the film.
 * In `diary` and `reviews` it is the *log entry* (`boxd.it/<entry>`), a
 * different link for every viewing of the same film. Keying films by URI across
 * all files would therefore turn one film with three diary entries into four
 * films. Diary and review rows are tied to their film by name + year instead,
 * and their URIs are never stored as the film's.
 *
 * Pure: `{ path, text }` pairs in (the zip is opened in main), films out.
 */

import {
  normalizeLetterboxdUri,
  uniqueStrings,
  watchDateToMs,
  watchTitleKey,
  normalizeWatchDate,
  type WatchDate,
  type WatchObservation,
} from '../watchLibrary';
import { csvTable, isBlankCsvRow, parseCsv, stripBom } from './csv';

export interface LetterboxdFile {
  /** Path inside the export (`diary.csv`, `lists/ghibli.csv`), or the file name of a single CSV. */
  path: string;
  text: string;
}

export type LetterboxdFileKind =
  | 'watched'
  | 'ratings'
  | 'diary'
  | 'reviews'
  | 'watchlist'
  | 'likes'
  | 'list'
  | 'profile'
  | 'ignored';

export interface LetterboxdViewing {
  /** When it was logged (`Date`). */
  loggedAt?: string;
  /** When it was watched (`Watched Date`), which is what the diary is about. */
  watchedAt?: string;
  rating?: number;
  rewatch: boolean;
  tags: string[];
}

export interface LetterboxdFilm {
  name: string;
  year?: number;
  /** The film's own URI (never a diary entry's). */
  uri?: string;
  watched: boolean;
  watchlist: boolean;
  liked: boolean;
  favorite: boolean;
  /** Current rating from `ratings.csv`, 0.5–5. */
  rating?: number;
  diary: LetterboxdViewing[];
  /** Newest review text, with its date. */
  review?: { text: string; date?: string };
  lists: string[];
  /** Every date any file associated with it, for "date added". */
  dates: string[];
}

export interface LetterboxdUnmatched {
  file: string;
  name?: string;
  year?: number;
  reason: 'no-name' | 'favorite-not-in-export';
}

export interface LetterboxdParseResult {
  films: LetterboxdFilm[];
  username?: string;
  files: { path: string; kind: LetterboxdFileKind; rows: number }[];
  lists: string[];
  unmatched: LetterboxdUnmatched[];
}

// ---------------------------------------------------------------------------
// File classification
// ---------------------------------------------------------------------------

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '');
}

/**
 * Drops one shared top-level folder (`letterboxd-user-…/watched.csv`) so a zip
 * that was re-packed with its folder classifies the same as the original.
 */
function stripCommonRoot(paths: readonly string[]): (path: string) => string {
  const tops = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  if (tops.size !== 1) return (p) => p;
  const [top] = [...tops];
  if (!top || /^(lists|likes|deleted|orphaned)$/i.test(top)) return (p) => p;
  return (p) => p.slice(top.length + 1);
}

function headerOf(text: string): string[] {
  const rows = parseCsv(text.slice(0, 8192));
  const first = rows.find((row) => !isBlankCsvRow(row)) ?? [];
  return first.map((cell) => cell.trim().toLowerCase());
}

/**
 * What a file in the export is. Paths decide inside a zip; a lone CSV whose
 * name was changed is recognised by its header instead.
 */
export function classifyLetterboxdFile(path: string, text: string): LetterboxdFileKind {
  const p = normalizePath(path).toLowerCase();
  if (!p.endsWith('.csv')) return 'ignored';
  if (/^(deleted|orphaned)\//.test(p) || p.includes('/deleted/') || p.includes('/orphaned/')) return 'ignored';
  if (p.startsWith('lists/')) return 'list';
  if (p === 'likes/films.csv') return 'likes';
  if (p.startsWith('likes/')) return 'ignored';
  const base = p.split('/').pop() ?? p;
  const byName: Record<string, LetterboxdFileKind> = {
    'watched.csv': 'watched',
    'ratings.csv': 'ratings',
    'diary.csv': 'diary',
    'reviews.csv': 'reviews',
    'watchlist.csv': 'watchlist',
    'profile.csv': 'profile',
  };
  if (byName[base] && !p.includes('/')) return byName[base];

  // A single CSV the user picked, possibly renamed: go by what is in it.
  const firstLine = stripBom(text).slice(0, 64).toLowerCase();
  if (firstLine.startsWith('letterboxd list export')) return 'list';
  const header = headerOf(text);
  const has = (name: string): boolean => header.includes(name);
  if (has('favorite films') || has('date joined')) return 'profile';
  if (!has('name')) return 'ignored';
  if (has('review')) return 'reviews';
  if (has('watched date')) return 'diary';
  if (has('rating') && has('letterboxd uri')) return 'ratings';
  if (has('letterboxd uri')) {
    if (/watchlist/.test(base)) return 'watchlist';
    if (/like/.test(base)) return 'likes';
    return byName[base] ?? 'watched';
  }
  return 'ignored';
}

/** Cheap sniff for a lone CSV: does it look like any Letterboxd export file? */
export function looksLikeLetterboxdCsv(path: string, text: string): boolean {
  return classifyLetterboxdFile(path.split(/[\\/]/).pop() ?? path, text) !== 'ignored';
}

/** The export's own timestamp from `letterboxd-<user>-YYYY-MM-DD-HH-MM-utc.zip`. */
export function letterboxdExportTimestampFromFileName(fileName: string): number | undefined {
  const match = /(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})-utc/i.exec(fileName);
  if (!match) return undefined;
  const [, y, mo, d, h, mi] = match.map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi);
  return Number.isFinite(ms) ? ms : undefined;
}

/**
 * The latest date any row carries, as epoch ms — a lower bound on when the
 * export was made, for a file whose name does not say. Deliberately a lower
 * bound: a later, properly-named export must still count as newer than it.
 */
export function latestLetterboxdDate(films: readonly LetterboxdFilm[]): number | undefined {
  let latest: string | undefined;
  for (const film of films) {
    for (const date of [...film.dates, ...film.diary.map((viewing) => viewing.watchedAt ?? '')]) {
      if (date && (!latest || date > latest)) latest = date;
    }
  }
  return watchDateToMs(latest);
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

function field(record: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    for (const key of Object.keys(record)) {
      if (key.toLowerCase() === name) return (record[key] ?? '').trim();
    }
  }
  return '';
}

function yearOf(raw: string): number | undefined {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 1800 && n < 3000 ? n : undefined;
}

function starsOf(raw: string): number | undefined {
  const n = Number.parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.min(5, Math.max(0.5, Math.round(n * 2) / 2));
}

function tagsOf(raw: string): string[] {
  return uniqueStrings(raw.split(','));
}

/** Title-cases a list slug (`studio-ghibli-ranked.csv` → `studio ghibli ranked`) when the file has no name row. */
function listNameFromPath(path: string): string {
  const base = (normalizePath(path).split('/').pop() ?? path).replace(/\.csv$/i, '');
  return base.replace(/[-_]+/g, ' ').trim() || 'List';
}

class FilmBook {
  readonly films: LetterboxdFilm[] = [];
  private readonly byUri = new Map<string, LetterboxdFilm>();
  private readonly byName = new Map<string, LetterboxdFilm[]>();

  /** The film a row refers to. `filmUri` only for files whose URI is the film's own. */
  film(name: string, year: number | undefined, filmUri?: string): LetterboxdFilm {
    const uri = normalizeLetterboxdUri(filmUri);
    if (uri) {
      const hit = this.byUri.get(uri);
      if (hit) return hit;
    }
    const key = `${watchTitleKey(name) || name.toLowerCase()}|${year ?? ''}`;
    const candidates = this.byName.get(key) ?? [];
    let film = uri
      // Same name and year but a different film URI is a different film; one
      // with no URI yet is the same film seen first through the diary.
      ? candidates.find((entry) => !entry.uri || normalizeLetterboxdUri(entry.uri) === uri)
      : candidates[0];
    if (!film) {
      film = {
        name,
        year,
        watched: false,
        watchlist: false,
        liked: false,
        favorite: false,
        diary: [],
        lists: [],
        dates: [],
      };
      this.films.push(film);
      this.byName.set(key, [...candidates, film]);
    }
    if (uri && !film.uri) {
      film.uri = filmUri?.trim();
      this.byUri.set(uri, film);
    }
    return film;
  }

  byFilmUri(raw: string): LetterboxdFilm | undefined {
    const uri = normalizeLetterboxdUri(raw);
    return uri ? this.byUri.get(uri) : undefined;
  }
}

/** Splits a list file into its metadata block and its film block. */
function parseListFile(text: string, path: string): { name: string; films: Record<string, string>[] } {
  const rows = parseCsv(text);
  let name = '';
  let filmHeader = -1;
  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i].map((cell) => cell.trim().toLowerCase());
    if (cells.includes('name') && cells.includes('year')) {
      filmHeader = i;
      break;
    }
    // The list's own header row (`Date,Name,Tags,URL,Description`) — the row
    // after it names the list.
    if (cells.includes('name') && !name) {
      const next = rows[i + 1];
      const nameIndex = cells.indexOf('name');
      if (next && next[nameIndex]) name = next[nameIndex].trim();
    }
  }
  const films = filmHeader >= 0 ? csvTable(rows.slice(filmHeader)).records : [];
  return { name: name || listNameFromPath(path), films };
}

const FILM_URI_KINDS: ReadonlySet<LetterboxdFileKind> = new Set(['watched', 'ratings', 'watchlist', 'likes']);

/**
 * Parses every file of an export into one record per film.
 *
 * Files are processed so that film URIs are known before the diary is read:
 * watched, ratings, watchlist, likes and lists first, then diary and reviews
 * (matched by name + year), then the profile's favourites (matched by URI).
 */
export function parseLetterboxdExport(files: readonly LetterboxdFile[]): LetterboxdParseResult {
  const strip = stripCommonRoot(files.map((file) => normalizePath(file.path)));
  const classified = files.map((file) => {
    const path = strip(normalizePath(file.path));
    return { path, text: file.text, kind: classifyLetterboxdFile(path, file.text) };
  });
  const order: LetterboxdFileKind[] = ['watched', 'ratings', 'watchlist', 'likes', 'list', 'diary', 'reviews', 'profile'];
  classified.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));

  const book = new FilmBook();
  const result: LetterboxdParseResult = { films: book.films, files: [], lists: [], unmatched: [] };
  const favoriteUris: string[] = [];

  for (const file of classified) {
    if (file.kind === 'ignored') {
      result.files.push({ path: file.path, kind: 'ignored', rows: 0 });
      continue;
    }

    if (file.kind === 'profile') {
      const { records } = csvTable(parseCsv(file.text));
      const profile = records[0];
      if (profile) {
        result.username = field(profile, 'username') || undefined;
        favoriteUris.push(...field(profile, 'favorite films').split(',').map((uri) => uri.trim()).filter(Boolean));
      }
      result.files.push({ path: file.path, kind: 'profile', rows: records.length });
      continue;
    }

    if (file.kind === 'list') {
      const list = parseListFile(file.text, file.path);
      result.lists.push(list.name);
      for (const record of list.films) {
        const name = field(record, 'name');
        if (!name) {
          result.unmatched.push({ file: file.path, reason: 'no-name' });
          continue;
        }
        const film = book.film(name, yearOf(field(record, 'year')), field(record, 'url', 'letterboxd uri'));
        if (!film.lists.includes(list.name)) film.lists.push(list.name);
      }
      result.files.push({ path: file.path, kind: 'list', rows: list.films.length });
      continue;
    }

    const { records } = csvTable(parseCsv(file.text));
    for (const record of records) {
      const name = field(record, 'name');
      const year = yearOf(field(record, 'year'));
      if (!name) {
        result.unmatched.push({ file: file.path, year, reason: 'no-name' });
        continue;
      }
      const uri = FILM_URI_KINDS.has(file.kind) ? field(record, 'letterboxd uri') : undefined;
      const film = book.film(name, year, uri);
      const date = normalizeWatchDate(field(record, 'date'));
      if (date) film.dates.push(date);
      switch (file.kind) {
        case 'watched':
          film.watched = true;
          break;
        case 'watchlist':
          film.watchlist = true;
          break;
        case 'likes':
          film.liked = true;
          break;
        case 'ratings': {
          const stars = starsOf(field(record, 'rating'));
          if (stars !== undefined) film.rating = stars;
          break;
        }
        case 'diary':
        case 'reviews': {
          const viewing: LetterboxdViewing = {
            loggedAt: date,
            watchedAt: normalizeWatchDate(field(record, 'watched date')),
            rating: starsOf(field(record, 'rating')),
            rewatch: /^(yes|true|1)$/i.test(field(record, 'rewatch')),
            tags: tagsOf(field(record, 'tags')),
          };
          // A review is usually attached to a diary entry that diary.csv already
          // carried; counting it again would double the rewatch count and tags.
          const duplicate = file.kind === 'reviews' && film.diary.some((entry) =>
            viewingDate(entry) === viewingDate(viewing) && entry.rewatch === viewing.rewatch);
          if (!duplicate) film.diary.push(viewing);
          if (file.kind === 'reviews') {
            const text = field(record, 'review');
            if (text && (!film.review || (film.review.date ?? '') <= (date ?? ''))) film.review = { text, date };
          }
          break;
        }
        default:
          break;
      }
    }
    result.files.push({ path: file.path, kind: file.kind, rows: records.length });
  }

  for (const uri of favoriteUris) {
    const film = book.byFilmUri(uri);
    if (film) film.favorite = true;
    else result.unmatched.push({ file: 'profile.csv', name: uri, reason: 'favorite-not-in-export' });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

function viewingDate(viewing: LetterboxdViewing): string | undefined {
  return viewing.watchedAt ?? viewing.loggedAt;
}

/**
 * Films as watch-library observations (kind `film`).
 *
 * Status: anything watched, rated, logged, reviewed or liked (liking a film on
 * Letterboxd marks it watched) is `completed`; a watchlist entry is `plan`; a
 * film that only appears in one of the user's lists is also `plan` — a list of
 * films one has not seen is a list of films one means to see.
 *
 * Kind is identity only, not asserted: Letterboxd files some TV miniseries as
 * films and nothing in the export says which, so a user or metadata correction
 * to `tv` survives a re-import.
 */
export function letterboxdFilmsToObservations(films: readonly LetterboxdFilm[], asOf?: number): WatchObservation[] {
  return films.map((film) => {
    const viewings = film.diary.filter((viewing) => viewingDate(viewing));
    const watchDates: WatchDate[] = viewings.map((viewing) => ({
      date: viewingDate(viewing) as string,
      rewatch: viewing.rewatch || undefined,
      stars: viewing.rating,
      source: 'letterboxd',
    }));
    const latest = [...viewings].sort((a, b) => (viewingDate(a) ?? '').localeCompare(viewingDate(b) ?? '')).pop();
    const rating = film.rating ?? latest?.rating ?? [...film.diary].reverse().find((viewing) => viewing.rating)?.rating;
    const seen = film.watched || film.diary.length > 0 || film.rating !== undefined || film.liked || !!film.review;
    const rewatches = film.diary.filter((viewing) => viewing.rewatch).length;
    const tags = uniqueStrings(film.diary.flatMap((viewing) => viewing.tags));
    const addedMs = film.dates.map((date) => watchDateToMs(date)).filter((ms): ms is number => ms !== undefined);
    return {
      source: 'letterboxd',
      asOf,
      addedAt: addedMs.length ? Math.min(...addedMs) : undefined,
      identity: {
        kind: 'film',
        title: film.name,
        year: film.year,
        letterboxdUri: film.uri,
      },
      fields: {
        status: seen ? 'completed' : 'plan',
        progress: seen ? 1 : undefined,
        score: rating !== undefined ? { score: rating * 2, scale: 'stars', stars: rating } : undefined,
        finishedAt: latest ? viewingDate(latest) : undefined,
        watchDates: watchDates.length ? watchDates : undefined,
        rewatchCount: rewatches > 0 ? rewatches : undefined,
        liked: film.liked || undefined,
        favorite: film.favorite || undefined,
        tags: tags.length ? tags : undefined,
        lists: film.lists.length ? film.lists : undefined,
        review: film.review?.text,
      },
    };
  });
}

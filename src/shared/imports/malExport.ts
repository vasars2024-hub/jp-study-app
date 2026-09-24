/**
 * MyAnimeList's XML list export — parsed without an account.
 *
 * MAL's "Export My List" (myanimelist.net/panel.php?go=export) hands the user
 * `animelist_<unix-time>_-_<user-id>.xml.gz`. Unzipped it is one flat document:
 *
 *   <myanimelist>
 *     <myinfo><user_id>…</user_id><user_name>…</user_name><user_export_type>1</user_export_type>…</myinfo>
 *     <anime>
 *       <series_animedb_id>5081</series_animedb_id>
 *       <series_title><![CDATA[Bakemonogatari]]></series_title>
 *       <series_type>TV</series_type>
 *       <series_episodes>15</series_episodes>
 *       <my_watched_episodes>15</my_watched_episodes>
 *       <my_start_date>0000-00-00</my_start_date>
 *       <my_finish_date>2020-05-00</my_finish_date>
 *       <my_score>9</my_score>
 *       <my_status>Completed</my_status>
 *       <my_comments><![CDATA[]]></my_comments>
 *       <my_times_watched>1</my_times_watched>
 *       <my_tags><![CDATA[monogatari, shaft]]></my_tags>
 *       <my_rewatching>0</my_rewatching>
 *       …
 *     </anime>
 *   </myanimelist>
 *
 * The structure is flat enough that a DOM would be ceremony — and `DOMParser`
 * does not exist in the main process anyway — so this is a small scanner that
 * handles what real exports actually contain: CDATA (which may itself contain
 * `<` and `</anime>`), XML comments, character and named entities, a BOM, and
 * the `0000-00-00` / `2020-05-00` unknown-date convention.
 *
 * **Manga lists are parsed but not imported.** `mangalist_*.xml` has the same
 * envelope with `<manga>` rows (chapters and volumes, "Reading"/"Plan to Read").
 * They are counted and returned so the importer can say "this is a manga list"
 * instead of "unrecognised file", but a watch library has nowhere honest to put
 * chapter progress, so no observations are made from them.
 *
 * Pure: text in, rows out.
 */

import type { MalListEntry, MalListStatus } from '../malSync';
import { normalizeWatchDate, uniqueStrings, watchDateToMs, type WatchKind, type WatchObservation, type WatchStatus } from '../watchLibrary';
import { stripBom } from './csv';

export interface MalExportAnimeRow {
  malId: number;
  title: string;
  /** MAL's `series_type` label: TV, Movie, OVA, ONA, Special, Music, TV Special, CM, PV, Unknown. */
  type?: string;
  /** `series_episodes`; 0 is MAL's "unknown / still airing" and is kept as 0. */
  totalEpisodes: number;
  watchedEpisodes: number;
  /** Normalised (`YYYY-MM-DD` or partial); absent for `0000-00-00`. */
  startDate?: string;
  finishDate?: string;
  /** 0–10; 0 = not rated. */
  score: number;
  status?: MalListStatus;
  /** The status text as written, for reporting a value this parser does not know. */
  rawStatus: string;
  /** `my_times_watched` — completed re-watches. */
  timesWatched: number;
  rewatching: boolean;
  tags: string[];
  comments?: string;
}

export interface MalExportMangaRow {
  malId: number;
  title: string;
  chapters: number;
  volumes: number;
  readChapters: number;
  readVolumes: number;
  rawStatus: string;
  score: number;
}

export interface MalExportParseResult {
  /** From `user_export_type` (1 anime, 2 manga), else from which rows are present. */
  listType: 'anime' | 'manga' | 'unknown';
  user?: { id?: number; name?: string };
  anime: MalExportAnimeRow[];
  manga: MalExportMangaRow[];
  /** Rows dropped for having no usable id. */
  invalid: number;
  /** `user_total_anime` / `user_total_manga`, when present — a cross-check for the row count. */
  declaredTotal?: number;
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

const PLACEHOLDER = '\u0000';

/**
 * Pulls CDATA sections out (replacing each with a numbered placeholder) and
 * drops comments, in one left-to-right pass — so a comment inside CDATA stays
 * text and a CDATA marker inside a comment stays a comment.
 */
function protect(text: string): { body: string; cdata: string[] } {
  const cdata: string[] = [];
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt < 0) {
      out.push(text.slice(i));
      break;
    }
    out.push(text.slice(i, lt));
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', lt)) {
      const end = text.indexOf(']]>', lt + 9);
      cdata.push(text.slice(lt + 9, end < 0 ? text.length : end));
      out.push(`${PLACEHOLDER}${cdata.length - 1}${PLACEHOLDER}`);
      i = end < 0 ? text.length : end + 3;
      continue;
    }
    out.push('<');
    i = lt + 1;
  }
  return { body: out.join(''), cdata };
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** Decodes a text node: entity-decode the plain parts, restore CDATA verbatim. */
function textValue(raw: string, cdata: readonly string[]): string {
  const parts = raw.split(PLACEHOLDER);
  let out = '';
  for (let i = 0; i < parts.length; i += 1) {
    // Odd positions are CDATA indices (the placeholder wraps them on both sides).
    if (i % 2 === 1) out += cdata[Number(parts[i])] ?? '';
    else out += decodeEntities(parts[i]);
  }
  return out.trim();
}

function blocks(body: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}\\s*>`, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(body)) !== null) out.push(match[1]);
  return out;
}

/** Every direct `<child>value</child>` (and `<child/>`) in a flat block, first occurrence wins. */
function children(block: string, cdata: readonly string[]): Map<string, string> {
  const out = new Map<string, string>();
  const re = /<([A-Za-z_][\w.-]*)(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/\1\s*>)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(block)) !== null) {
    const name = match[1].toLowerCase();
    if (!out.has(name)) out.set(name, textValue(match[2] ?? '', cdata));
  }
  return out;
}

function int(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number.parseInt(value.trim(), 10);
  return Number.isFinite(n) ? n : undefined;
}

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

const ANIME_STATUS: Record<string, MalListStatus> = {
  watching: 'watching',
  completed: 'completed',
  'on-hold': 'on_hold',
  'on hold': 'on_hold',
  onhold: 'on_hold',
  dropped: 'dropped',
  'plan to watch': 'plan_to_watch',
  plantowatch: 'plan_to_watch',
  // Old exports wrote the numeric code.
  '1': 'watching',
  '2': 'completed',
  '3': 'on_hold',
  '4': 'dropped',
  '6': 'plan_to_watch',
};

export function malStatusFromExport(raw: string): MalListStatus | undefined {
  return ANIME_STATUS[raw.trim().toLowerCase()];
}

const SERIES_TYPES: Record<string, string> = {
  '1': 'TV',
  '2': 'OVA',
  '3': 'Movie',
  '4': 'Special',
  '5': 'ONA',
  '6': 'Music',
};

function seriesType(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  return SERIES_TYPES[value] ?? value;
}

function truthyFlag(raw: string | undefined): boolean {
  const value = raw?.trim().toLowerCase();
  return value === '1' || value === 'yes' || value === 'true';
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

/** Cheap sniff: is this text a MAL export envelope? */
export function looksLikeMalExport(text: string): boolean {
  const head = stripBom(text).slice(0, 4096);
  return /<myanimelist[\s>]/i.test(head) || (/<myinfo[\s>]/i.test(head) && /<(anime|manga)[\s>]/i.test(text));
}

export function parseMalExportXml(input: string): MalExportParseResult {
  const { body, cdata } = protect(stripBom(input));
  const result: MalExportParseResult = { listType: 'unknown', anime: [], manga: [], invalid: 0 };

  const [info] = blocks(body, 'myinfo');
  if (info !== undefined) {
    const fields = children(info, cdata);
    const id = int(fields.get('user_id'));
    const name = fields.get('user_name') || undefined;
    if (id !== undefined || name) result.user = { id, name };
    const exportType = int(fields.get('user_export_type'));
    if (exportType === 1) result.listType = 'anime';
    else if (exportType === 2) result.listType = 'manga';
    const total = int(fields.get('user_total_anime') ?? fields.get('user_total_manga'));
    if (total !== undefined) result.declaredTotal = total;
  }

  for (const block of blocks(body, 'anime')) {
    const f = children(block, cdata);
    const malId = int(f.get('series_animedb_id'));
    if (malId === undefined || malId <= 0) {
      result.invalid += 1;
      continue;
    }
    const rawStatus = f.get('my_status') ?? '';
    const comments = f.get('my_comments');
    result.anime.push({
      malId,
      title: f.get('series_title') ?? '',
      type: seriesType(f.get('series_type')),
      totalEpisodes: Math.max(0, int(f.get('series_episodes')) ?? 0),
      watchedEpisodes: Math.max(0, int(f.get('my_watched_episodes')) ?? 0),
      startDate: normalizeWatchDate(f.get('my_start_date')),
      finishDate: normalizeWatchDate(f.get('my_finish_date')),
      score: Math.min(10, Math.max(0, int(f.get('my_score')) ?? 0)),
      status: malStatusFromExport(rawStatus),
      rawStatus,
      timesWatched: Math.max(0, int(f.get('my_times_watched')) ?? 0),
      rewatching: truthyFlag(f.get('my_rewatching')),
      tags: uniqueStrings((f.get('my_tags') ?? '').split(',')),
      comments: comments ? comments : undefined,
    });
  }

  for (const block of blocks(body, 'manga')) {
    const f = children(block, cdata);
    const malId = int(f.get('manga_mangadb_id'));
    if (malId === undefined || malId <= 0) {
      result.invalid += 1;
      continue;
    }
    result.manga.push({
      malId,
      title: f.get('manga_title') ?? '',
      chapters: Math.max(0, int(f.get('manga_chapters')) ?? 0),
      volumes: Math.max(0, int(f.get('manga_volumes')) ?? 0),
      readChapters: Math.max(0, int(f.get('my_read_chapters')) ?? 0),
      readVolumes: Math.max(0, int(f.get('my_read_volumes')) ?? 0),
      rawStatus: f.get('my_status') ?? '',
      score: Math.min(10, Math.max(0, int(f.get('my_score')) ?? 0)),
    });
  }

  if (result.listType === 'unknown') {
    if (result.anime.length) result.listType = 'anime';
    else if (result.manga.length) result.listType = 'manga';
  }
  return result;
}

/**
 * The export's own timestamp, from MAL's file name `animelist_<unix>_-_<id>.xml.gz`.
 * That is when the snapshot was true, which is what "newer data wins" compares.
 */
export function malExportTimestampFromFileName(fileName: string): number | undefined {
  const match = /(?:anime|manga)list_(\d{9,11})_/i.exec(fileName);
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * The newest `my_start_date` / `my_finish_date` in the file, as epoch ms — a
 * lower bound on when the export was made, for a file whose name carries no
 * timestamp. Never the file's mtime: copying an old export resets that to
 * "now", which would let last year's list overwrite this week's edits.
 */
export function malExportLatestDate(rows: readonly MalExportAnimeRow[]): number | undefined {
  let latest: number | undefined;
  for (const row of rows) {
    for (const date of [row.startDate, row.finishDate]) {
      const ms = watchDateToMs(date);
      if (ms !== undefined && (latest === undefined || ms > latest)) latest = ms;
    }
  }
  return latest;
}

// ---------------------------------------------------------------------------
// Projections
// ---------------------------------------------------------------------------

function watchStatusFor(row: MalExportAnimeRow): WatchStatus | undefined {
  if (row.rewatching && (row.status === 'completed' || row.status === 'watching')) return 'rewatching';
  switch (row.status) {
    case 'plan_to_watch':
      return 'plan';
    case undefined:
      return undefined;
    default:
      return row.status;
  }
}

/** MAL's `Movie` is a film; everything else MAL lists is an anime series (TV, OVA, ONA, special…). */
export function watchKindForMalType(type: string | undefined): WatchKind {
  return type?.toLowerCase() === 'movie' ? 'film' : 'anime';
}

/**
 * Anime rows as watch-library observations.
 *
 * A row with a status this parser does not recognise still becomes a title
 * (as `plan`) rather than vanishing — its id is real and the user listed it.
 */
export function malExportRowsToObservations(rows: readonly MalExportAnimeRow[], asOf?: number): WatchObservation[] {
  return rows.map((row) => {
    const kind = watchKindForMalType(row.type);
    return {
      source: 'mal-export',
      asOf,
      identity: {
        kind,
        anime: true,
        format: row.type,
        title: row.title || `MAL ${row.malId}`,
        malId: row.malId,
      },
      fields: {
        kind,
        status: watchStatusFor(row) ?? 'plan',
        progress: row.watchedEpisodes,
        episodeCount: row.totalEpisodes > 0 ? row.totalEpisodes : undefined,
        score: row.score > 0 ? { score: row.score, scale: 'ten' } : undefined,
        startedAt: row.startDate,
        finishedAt: row.finishDate,
        rewatchCount: row.timesWatched > 0 ? row.timesWatched : undefined,
        tags: row.tags.length ? row.tags : undefined,
        notes: row.comments,
      },
    };
  });
}

/**
 * Anime rows as `MalListEntry`s, so an export lands in `mal-library.json` —
 * the same store the OAuth sync writes and the subtitle harvest reads.
 */
export function malExportRowsToListEntries(rows: readonly MalExportAnimeRow[]): MalListEntry[] {
  return rows.map((row) => ({
    animeId: row.malId,
    title: row.title,
    totalEpisodes: row.totalEpisodes,
    status: row.status,
    episodesWatched: row.watchedEpisodes,
    score: row.score,
    rewatching: row.rewatching,
  }));
}

// YouTube, product pass 7.5: study before and around a video.
//
// Pure. Streaming study inside the browser player is out by design (ToS): every
// caption here comes through the existing yt-dlp metadata path, and nothing
// touches playback, ads or DRM.
//
// - caption-track ranking for the picker (manual vs auto-generated, study vs helper language),
// - the pre-study vocabulary list and i+1 sentences for one video's captions,
// - a comprehension estimate from known words,
// - rate-limited subscription sweeps and "new video" notices,
// - consistent mining metadata: a timestamp link that reopens at the scene.

import type { YoutubeCaptionKind, YoutubeCaptionTrack } from './youtubeDiscovery';

// --- caption tracks -------------------------------------------------------------

export type Yt5TrackRole = 'study' | 'helper' | 'other';

export interface Yt5RankedTrack extends YoutubeCaptionTrack {
  role: Yt5TrackRole;
  /**
   * An auto track whose key names a second language (`en-ja`, `ja-en`) is a
   * machine TRANSLATION of the speech, not a transcription of it.
   */
  translated: boolean;
  /** Higher is better. */
  score: number;
}

function isTranslatedAutoKey(track: YoutubeCaptionTrack): boolean {
  if (track.kind !== 'auto') return false;
  const parts = track.key.toLowerCase().split(/[-_]/);
  if (parts.length < 2) return false;
  if (parts[1] === 'orig') return false;
  // A region (`ja-JP`, `pt-BR`) or script (`zh-Hans`) is not a second language.
  return /^[a-z]{2,3}$/.test(parts[1]) && parts[1] !== parts[0];
}

/**
 * Order tracks for the picker. Author-written study-language captions first
 * (exact key, then regional), then the study language's speech recognition
 * (`-orig` first), then auto-translations into it, then helper-language
 * captions, then the rest. Manual always beats auto at the same role.
 */
export function yt5RankCaptionTracks(
  tracks: readonly YoutubeCaptionTrack[],
  studyLang: string,
  helperLang = 'en',
): Yt5RankedTrack[] {
  const study = studyLang.toLowerCase();
  const helper = helperLang.toLowerCase();
  const ranked = tracks.map((track) => {
    const translated = isTranslatedAutoKey(track);
    const role: Yt5TrackRole = track.lang === study ? 'study' : track.lang === helper ? 'helper' : 'other';
    const exact = track.key.toLowerCase() === track.lang;
    const orig = /[-_]orig$/i.test(track.key);
    let score = 0;
    if (role === 'study') {
      if (track.kind === 'human') score = exact ? 100 : 95;
      else if (translated) score = 50;
      else score = orig ? 75 : 70;
    } else if (role === 'helper') {
      score = track.kind === 'human' ? 40 : translated ? 5 : 10;
    } else {
      score = track.kind === 'human' ? 20 : 0;
    }
    return { ...track, role, translated, score };
  });
  return ranked.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

/** The track a study session should start from, or null when no track is in the study language. */
export function yt5BestStudyTrack(ranked: readonly Yt5RankedTrack[]): Yt5RankedTrack | null {
  return ranked.find((track) => track.role === 'study') ?? null;
}

/** i18n key suffix describing a track's kind: manual, auto-generated or auto-translated. */
export function yt5TrackKindKey(track: { kind: YoutubeCaptionKind; translated: boolean }): 'manual' | 'auto' | 'translated' {
  if (track.kind === 'human') return 'manual';
  return track.translated ? 'translated' : 'auto';
}

/** yt-dlp keys are plain; a key carrying anything else is refused before it reaches argv. */
export function yt5IsSafeTrackKey(key: string): boolean {
  return /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8}){0,3}$/.test(key);
}

export function yt5IsVideoId(id: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(id);
}

/**
 * Arguments for fetching ONE caption track and nothing else: `--skip-download`
 * always, and `--write-auto-subs` only when the chosen track is an auto one.
 */
export function yt5CaptionTrackArgs(videoId: string, key: string, kind: YoutubeCaptionKind, outTemplate: string): string[] {
  if (!yt5IsVideoId(videoId)) throw new Error('invalid video id');
  if (!yt5IsSafeTrackKey(key)) throw new Error('invalid caption track');
  return [
    `https://www.youtube.com/watch?v=${videoId}`,
    '--skip-download',
    '--no-playlist',
    kind === 'auto' ? '--write-auto-subs' : '--write-subs',
    '--sub-langs',
    key,
    '--sub-format',
    'vtt/srt/best',
    '-o',
    outTemplate,
  ];
}

// --- pre-study vocabulary --------------------------------------------------------------

export interface Yt5Cue {
  start: number;
  end: number;
  text: string;
}

export interface Yt5Token {
  lemma: string;
  surface: string;
  content: boolean;
  proper?: boolean;
  reading?: string;
}

export interface Yt5VocabRow {
  lemma: string;
  reading: string;
  count: number;
  level: number;
  /** First time the word is heard, in seconds. */
  firstSec: number;
  sentence: string;
}

export interface Yt5IPlusOne {
  start: number;
  end: number;
  text: string;
  /** The one unknown word. */
  lemma: string;
}

export type Yt5ComprehensionBand = 'easy' | 'comfortable' | 'stretch' | 'hard';

export interface Yt5VideoStudy {
  cues: number;
  tokens: number;
  /** Share of content-word tokens at or above the known level; null without tokens. */
  knownRatio: number | null;
  band: Yt5ComprehensionBand | null;
  uniqueWords: number;
  unknownUnique: number;
  vocabulary: Yt5VocabRow[];
  iPlusOne: Yt5IPlusOne[];
}

/**
 * Bands follow the usual extensive-listening thresholds: from 95% known tokens
 * a video is easy, 90-95% comfortable, 80-90% a stretch, below that hard.
 */
export function yt5ComprehensionBand(knownRatio: number | null): Yt5ComprehensionBand | null {
  if (knownRatio == null) return null;
  if (knownRatio >= 0.95) return 'easy';
  if (knownRatio >= 0.9) return 'comfortable';
  if (knownRatio >= 0.8) return 'stretch';
  return 'hard';
}

export function yt5StudyVideo(
  cues: readonly Yt5Cue[],
  tokenize: (text: string) => readonly Yt5Token[],
  levelOf: (lemma: string) => number,
  opts: { knownAt?: number; vocabLimit?: number; iPlusOneLimit?: number } = {},
): Yt5VideoStudy {
  const knownAt = opts.knownAt ?? 2;
  const vocabLimit = opts.vocabLimit ?? 60;
  const iPlusOneLimit = opts.iPlusOneLimit ?? 30;
  const words = new Map<string, Yt5VocabRow>();
  const levels = new Map<string, number>();
  const level = (lemma: string): number => {
    let value = levels.get(lemma);
    if (value === undefined) {
      value = levelOf(lemma);
      levels.set(lemma, value);
    }
    return value;
  };
  const iPlusOne: Yt5IPlusOne[] = [];
  const seenSentences = new Set<string>();
  let tokens = 0;
  let known = 0;
  for (const cue of cues) {
    const text = cue.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;
    let unknownLemma = '';
    let unknownCount = 0;
    let contentCount = 0;
    for (const token of tokenize(text)) {
      const lemma = token.lemma.trim();
      if (!token.content || token.proper || !lemma) continue;
      const lv = level(lemma);
      tokens += 1;
      contentCount += 1;
      if (lv >= knownAt) known += 1;
      else {
        unknownCount += 1;
        unknownLemma = lemma;
      }
      const row = words.get(lemma);
      if (row) row.count += 1;
      else {
        words.set(lemma, {
          lemma,
          reading: token.reading ?? '',
          count: 1,
          level: lv,
          firstSec: Math.max(0, cue.start),
          sentence: text.slice(0, 200),
        });
      }
    }
    if (unknownCount === 1 && contentCount >= 3 && !seenSentences.has(text) && iPlusOne.length < iPlusOneLimit) {
      seenSentences.add(text);
      iPlusOne.push({ start: cue.start, end: cue.end, text, lemma: unknownLemma });
    }
  }
  const all = [...words.values()];
  const unknown = all.filter((row) => row.level < knownAt);
  const knownRatio = tokens > 0 ? known / tokens : null;
  return {
    cues: cues.length,
    tokens,
    knownRatio,
    band: yt5ComprehensionBand(knownRatio),
    uniqueWords: all.length,
    unknownUnique: unknown.length,
    vocabulary: unknown
      .sort((a, b) => b.count - a.count || a.firstSec - b.firstSec)
      .slice(0, vocabLimit),
    iPlusOne,
  };
}

// --- comprehension cache (per video) ---------------------------------------------------

export interface Yt5ComprehensionEntry {
  knownPct: number;
  at: number;
}

export const YT5_COMPREHENSION_CACHE_MAX = 500;

export function yt5SanitizeComprehensionCache(raw: unknown): Record<string, Yt5ComprehensionEntry> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, Yt5ComprehensionEntry> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!yt5IsVideoId(id) || !value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const pct = Number(v.knownPct);
    const at = Number(v.at);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || !Number.isFinite(at)) continue;
    out[id] = { knownPct: Math.round(pct), at };
  }
  return out;
}

export function yt5RememberComprehension(
  cache: Record<string, Yt5ComprehensionEntry>,
  videoId: string,
  knownRatio: number,
  now: number,
): Record<string, Yt5ComprehensionEntry> {
  if (!yt5IsVideoId(videoId)) return cache;
  const next = { ...cache, [videoId]: { knownPct: Math.round(Math.min(1, Math.max(0, knownRatio)) * 100), at: now } };
  const ids = Object.keys(next);
  if (ids.length <= YT5_COMPREHENSION_CACHE_MAX) return next;
  ids.sort((a, b) => next[a].at - next[b].at);
  for (const id of ids.slice(0, ids.length - YT5_COMPREHENSION_CACHE_MAX)) delete next[id];
  return next;
}

// --- subscriptions: rate-limited sweeps and new-video notices ---------------------------

/** At most this many playlists are checked per unattended sweep; the rest stay due for the next tick. */
export const YT5_MAX_CHECKS_PER_SWEEP = 8;
/** Pause between two yt-dlp listings in one sweep, so a big subscription list is never a burst. */
export const YT5_SWEEP_SPACING_MS = 4_000;

/** Oldest-checked first (never-checked first of all), capped. */
export function yt5PlanSweep<T extends { id: string; lastCheckedAt?: number }>(
  due: readonly T[],
  max = YT5_MAX_CHECKS_PER_SWEEP,
): T[] {
  return [...due]
    .sort((a, b) => (a.lastCheckedAt ?? 0) - (b.lastCheckedAt ?? 0) || a.id.localeCompare(b.id))
    .slice(0, Math.max(0, max));
}

export interface Yt5NewVideoGroup {
  playlistTitle: string;
  titles: string[];
}

/**
 * Videos that a sweep added to a playlist. A playlist's FIRST check is not news
 * (everything in it would be "new"), so it yields nothing.
 */
export function yt5NewVideosAfterSync(
  beforeIds: ReadonlySet<string>,
  after: readonly { youtubeId: string; title: string; playlistId: string; removedFromYouTube?: boolean }[],
  playlistId: string,
  firstCheck: boolean,
): { youtubeId: string; title: string }[] {
  if (firstCheck) return [];
  return after
    .filter((video) => video.playlistId === playlistId && !video.removedFromYouTube && !beforeIds.has(video.youtubeId))
    .map((video) => ({ youtubeId: video.youtubeId, title: video.title }));
}

/** One notice for a whole sweep: the count, and the first title to name. */
export function yt5NewVideoNotice(groups: readonly Yt5NewVideoGroup[]): { count: number; firstTitle: string; playlists: string[] } | null {
  const nonEmpty = groups.filter((group) => group.titles.length > 0);
  const count = nonEmpty.reduce((sum, group) => sum + group.titles.length, 0);
  if (count === 0) return null;
  return {
    count,
    firstTitle: nonEmpty[0].titles[0],
    playlists: nonEmpty.map((group) => group.playlistTitle),
  };
}

// --- playlist study progress ---------------------------------------------------------------

export interface Yt5PlaylistVideo {
  id: string;
  /** Playlist order; videos without one keep their input order after the rest. */
  position?: number;
  downloaded: boolean;
  removedFromYouTube?: boolean;
  /** From the player's resume store (`ytWatchState`). */
  watch: { kind: 'watched' } | { kind: 'resume'; fraction: number | null } | null;
  /** Known-word share of its captions from the last pre-study, 0-100. */
  knownPct?: number;
  /** Deck cards mined from it. */
  mined?: number;
}

export interface Yt5PlaylistProgress {
  total: number;
  downloaded: number;
  watched: number;
  inProgress: number;
  /** Watched share of the playlist, 0-100, with a half-watched video counting by its fraction. */
  progressPct: number;
  /** Mean known-word share over the videos that were pre-studied; null when none were. */
  avgKnownPct: number | null;
  measured: number;
  mined: number;
  /** What to study next: the video in progress, else the first unwatched download, else the first unwatched video. */
  next: { id: string; reason: 'resume' | 'next' | 'download' } | null;
}

/**
 * Where the learner is in a playlist as a whole — the per-video chips, summed —
 * and which video to pick up next. Videos gone from YouTube still count when a
 * download of them exists (the learner can still study it), and are skipped
 * otherwise.
 */
export function yt5PlaylistProgress(videos: readonly Yt5PlaylistVideo[]): Yt5PlaylistProgress {
  const ordered = videos
    .map((video, index) => ({ video, index }))
    .filter(({ video }) => !video.removedFromYouTube || video.downloaded)
    .sort((a, b) => (a.video.position ?? Number.MAX_SAFE_INTEGER) - (b.video.position ?? Number.MAX_SAFE_INTEGER) || a.index - b.index)
    .map(({ video }) => video);
  let watched = 0;
  let inProgress = 0;
  let downloaded = 0;
  let progress = 0;
  let knownSum = 0;
  let measured = 0;
  let mined = 0;
  let resume: string | null = null;
  let nextDownloaded: string | null = null;
  let nextAny: string | null = null;
  for (const video of ordered) {
    if (video.downloaded) downloaded += 1;
    if (video.watch?.kind === 'watched') {
      watched += 1;
      progress += 1;
    } else {
      if (video.watch?.kind === 'resume') {
        inProgress += 1;
        progress += Math.min(1, Math.max(0, video.watch.fraction ?? 0.5));
        if (!resume && video.downloaded) resume = video.id;
      }
      if (!nextDownloaded && video.downloaded && video.watch?.kind !== 'resume') nextDownloaded = video.id;
      if (!nextAny && !video.downloaded) nextAny = video.id;
    }
    if (typeof video.knownPct === 'number' && Number.isFinite(video.knownPct)) {
      knownSum += Math.min(100, Math.max(0, video.knownPct));
      measured += 1;
    }
    mined += Math.max(0, Math.floor(video.mined ?? 0));
  }
  const total = ordered.length;
  const next = resume
    ? { id: resume, reason: 'resume' as const }
    : nextDownloaded
      ? { id: nextDownloaded, reason: 'next' as const }
      : nextAny
        ? { id: nextAny, reason: 'download' as const }
        : null;
  return {
    total,
    downloaded,
    watched,
    inProgress,
    progressPct: total > 0 ? Math.round((progress / total) * 100) : 0,
    avgKnownPct: measured > 0 ? Math.round(knownSum / measured) : null,
    measured,
    mined,
    next,
  };
}

// --- mining metadata ---------------------------------------------------------------------

/** `83.4` -> `1:23`; `3723` -> `1:02:03`. */
export function yt5Clock(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** The public watch link that opens at the scene. */
export function yt5TimestampUrl(videoId: string, sec: number): string {
  if (!yt5IsVideoId(videoId)) return '';
  const t = Math.max(0, Math.floor(sec));
  return `https://www.youtube.com/watch?v=${videoId}${t > 0 ? `&t=${t}s` : ''}`;
}

/** The video id of a YouTube watch / short / youtu.be URL, else ''. */
export function yt5VideoIdFromUrl(url: string | undefined): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www|m|music)\./, '');
    let id = '';
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (host === 'youtube.com') {
      if (u.pathname === '/watch') id = u.searchParams.get('v') ?? '';
      else {
        const m = /^\/(?:shorts|embed|live)\/([^/?#]+)/.exec(u.pathname);
        id = m?.[1] ?? '';
      }
    }
    return yt5IsVideoId(id) ? id : '';
  } catch {
    return '';
  }
}

/** Seconds from a `t=` / `start=` parameter (`83`, `83s`, `1m23s`), else null. */
export function yt5TimestampFromUrl(url: string | undefined): number | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const raw = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return Number(raw);
    const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
    if (!m || (!m[1] && !m[2] && !m[3])) return null;
    return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  } catch {
    return null;
  }
}

export interface Yt5MiningMeta {
  sourceTitle: string;
  /** `1:23` — where in the video. */
  sceneReference: string;
  webUrl: string;
}

/** The same title, scene label and link whichever surface mined the line. */
export function yt5MiningMeta(input: { videoId: string; title: string; startSec: number }): Yt5MiningMeta | null {
  const webUrl = yt5TimestampUrl(input.videoId, input.startSec);
  if (!webUrl) return null;
  return {
    sourceTitle: input.title.trim() || input.videoId,
    sceneReference: yt5Clock(input.startSec),
    webUrl,
  };
}

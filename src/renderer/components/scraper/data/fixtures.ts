// Sample data for the Scraper shell.
//
// There is no scraping backend yet, so every screen is populated from here.
// Two rules keep this honest and useful:
//
//   1. DETERMINISTIC. A fixed-seed PRNG, and ages expressed as offsets rather
//      than absolute dates, so the app looks identical on every run — a moving
//      screenshot is worthless for judging layout.
//   2. CONSISTENT. One set of numbers across every surface. The episode count
//      the Dashboard reports is the same count the result table pages through,
//      because both read it from here.
//
// Series names, episode titles and release groups are study *content*, so they
// stay literal rather than going through strings.ts (CLAUDE.md i18n rule 4).
//
// This module is imported lazily (see mockScraperPort) so it stays out of the
// initial renderer chunk.

import { SCRAPER_POSTER, scraperArtwork } from '../artwork';

/** Small, fast, well-distributed. Seeded so output never varies between runs. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FIXTURE_SEED = 0xa17e;

// ---------------------------------------------------------------- series ----

export interface FixtureSeries {
  id: string;
  titleEn: string;
  titleJa: string;
  provider: string;
  episodes: number;
  streams: number;
  images: number;
}

export const SERIES: FixtureSeries[] = [
  {
    id: 'one-piece',
    titleEn: 'One Piece',
    titleJa: 'ワンピース',
    provider: 'StreamSB',
    episodes: 1122,
    streams: 2234,
    images: 24,
  },
  {
    id: 'frieren',
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    provider: 'VidPlay',
    episodes: 28,
    streams: 61,
    images: 18,
  },
  {
    id: 'jujutsu-kaisen',
    titleEn: 'Jujutsu Kaisen',
    titleJa: '呪術廻戦',
    provider: 'MegaCloud',
    episodes: 47,
    streams: 94,
    images: 21,
  },
];

/** Headline figures. Derived, so they cannot drift from the series list. */
export const TOTAL_EPISODES = SERIES.reduce((n, s) => n + s.episodes, 0);
export const TOTAL_STREAMS = SERIES.reduce((n, s) => n + s.streams, 0);
export const TOTAL_IMAGES = SERIES.reduce((n, s) => n + s.images, 0);

// ---------------------------------------------------------------- sources ---

export type FixtureHealth = 'ok' | 'degraded' | 'blocked' | 'offline' | 'unknown';

export interface FixtureSource {
  id: string;
  label: string;
  host: string;
  kind: 'streaming' | 'torrent' | 'metadata' | 'subtitles';
  enabled: boolean;
  health: FixtureHealth;
  latencyMs: number;
  supportsSubtitles: boolean;
  requiresAuth: boolean;
  /** 30 success-rate samples, 0..1, for the Dashboard sparklines. */
  history: number[];
}

function healthSeries(seed: number, base: number, volatility: number): number[] {
  const rand = mulberry32(seed);
  const out: number[] = [];
  let value = base;
  for (let i = 0; i < 30; i += 1) {
    value += (rand() - 0.5) * volatility;
    value = Math.min(1, Math.max(0.05, value));
    out.push(Number(value.toFixed(3)));
  }
  return out;
}

export const SOURCES: FixtureSource[] = [
  {
    id: 'streamsb',
    label: 'StreamSB',
    host: 'streamsb.example',
    kind: 'streaming',
    enabled: true,
    health: 'ok',
    latencyMs: 412,
    supportsSubtitles: true,
    requiresAuth: false,
    history: healthSeries(1, 0.96, 0.06),
  },
  {
    id: 'vidplay',
    label: 'VidPlay',
    host: 'vidplay.example',
    kind: 'streaming',
    enabled: true,
    health: 'ok',
    latencyMs: 538,
    supportsSubtitles: true,
    requiresAuth: false,
    history: healthSeries(2, 0.93, 0.08),
  },
  {
    id: 'megacloud',
    label: 'MegaCloud',
    host: 'megacloud.example',
    kind: 'streaming',
    enabled: true,
    health: 'degraded',
    latencyMs: 1840,
    supportsSubtitles: false,
    requiresAuth: false,
    history: healthSeries(3, 0.71, 0.18),
  },
  {
    id: 'filemoon',
    label: 'FileMoon',
    host: 'filemoon.example',
    kind: 'streaming',
    enabled: false,
    health: 'blocked',
    latencyMs: 0,
    supportsSubtitles: false,
    requiresAuth: true,
    history: healthSeries(4, 0.34, 0.2),
  },
  {
    id: 'nyaa-mirror',
    label: 'Nyaa Mirror',
    host: 'nyaa.example',
    kind: 'torrent',
    enabled: true,
    health: 'ok',
    latencyMs: 289,
    supportsSubtitles: true,
    requiresAuth: false,
    history: healthSeries(5, 0.98, 0.04),
  },
  {
    id: 'anidex',
    label: 'AniDex',
    host: 'anidex.example',
    kind: 'torrent',
    enabled: true,
    health: 'degraded',
    latencyMs: 2210,
    supportsSubtitles: true,
    requiresAuth: false,
    history: healthSeries(6, 0.68, 0.16),
  },
  {
    id: 'jikan',
    label: 'MyAnimeList (Jikan)',
    host: 'api.jikan.moe',
    kind: 'metadata',
    enabled: true,
    health: 'ok',
    latencyMs: 331,
    supportsSubtitles: false,
    requiresAuth: false,
    history: healthSeries(7, 0.97, 0.05),
  },
  {
    id: 'jimaku',
    label: 'Jimaku',
    host: 'jimaku.example',
    kind: 'subtitles',
    enabled: true,
    health: 'offline',
    latencyMs: 0,
    supportsSubtitles: true,
    requiresAuth: true,
    history: healthSeries(8, 0.22, 0.12),
  },
];

// ------------------------------------------------------------------- jobs ---

export type FixtureJobOutcome = 'done' | 'failed' | 'cancelled' | 'warning';

export interface FixtureJob {
  id: string;
  seriesId: string;
  titleEn: string;
  titleJa: string;
  provider: string;
  profile: string;
  /** Minutes before "now" — kept relative so the list never looks stale. */
  ageMinutes: number;
  durationSec: number;
  found: number;
  failed: number;
  bytes: number;
  outcome: FixtureJobOutcome;
  note: string;
}

export const JOBS: FixtureJob[] = [
  {
    id: 'job-1041',
    seriesId: 'one-piece',
    titleEn: 'One Piece',
    titleJa: 'ワンピース',
    provider: 'StreamSB',
    profile: 'Thorough',
    ageMinutes: 34,
    durationSec: 1284,
    found: 1122,
    failed: 0,
    bytes: 812_000_000_000,
    outcome: 'done',
    note: 'Full series index.',
  },
  {
    id: 'job-1040',
    seriesId: 'frieren',
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    provider: 'VidPlay',
    profile: 'Balanced',
    ageMinutes: 96,
    durationSec: 214,
    found: 28,
    failed: 0,
    bytes: 19_400_000_000,
    outcome: 'done',
    note: '',
  },
  {
    id: 'job-1039',
    seriesId: 'jujutsu-kaisen',
    titleEn: 'Jujutsu Kaisen',
    titleJa: '呪術廻戦',
    provider: 'MegaCloud',
    profile: 'Balanced',
    ageMinutes: 240,
    durationSec: 402,
    found: 47,
    failed: 3,
    bytes: 31_900_000_000,
    outcome: 'warning',
    note: 'Three episodes had no usable mirror.',
  },
  {
    id: 'job-1038',
    seriesId: 'frieren',
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    provider: 'MegaCloud',
    profile: 'Fast',
    ageMinutes: 380,
    durationSec: 88,
    found: 0,
    failed: 28,
    bytes: 0,
    outcome: 'failed',
    note: 'Provider returned a challenge page.',
  },
  {
    id: 'job-1037',
    seriesId: 'one-piece',
    titleEn: 'One Piece',
    titleJa: 'ワンピース',
    provider: 'StreamSB',
    profile: 'Thorough',
    ageMinutes: 720,
    durationSec: 1190,
    found: 1118,
    failed: 4,
    bytes: 806_000_000_000,
    outcome: 'warning',
    note: '',
  },
  {
    id: 'job-1036',
    seriesId: 'jujutsu-kaisen',
    titleEn: 'Jujutsu Kaisen',
    titleJa: '呪術廻戦',
    provider: 'VidPlay',
    profile: 'Balanced',
    ageMinutes: 1_140,
    durationSec: 366,
    found: 47,
    failed: 0,
    bytes: 30_100_000_000,
    outcome: 'done',
    note: '',
  },
  {
    id: 'job-1035',
    seriesId: 'frieren',
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    provider: 'VidPlay',
    profile: 'Learning',
    ageMinutes: 1_620,
    durationSec: 251,
    found: 28,
    failed: 0,
    bytes: 19_400_000_000,
    outcome: 'done',
    note: 'Japanese subtitles mined.',
  },
  {
    id: 'job-1034',
    seriesId: 'one-piece',
    titleEn: 'One Piece',
    titleJa: 'ワンピース',
    provider: 'FileMoon',
    profile: 'Fast',
    ageMinutes: 2_160,
    durationSec: 42,
    found: 0,
    failed: 0,
    bytes: 0,
    outcome: 'cancelled',
    note: 'Cancelled by user.',
  },
  {
    id: 'job-1033',
    seriesId: 'jujutsu-kaisen',
    titleEn: 'Jujutsu Kaisen',
    titleJa: '呪術廻戦',
    provider: 'MegaCloud',
    profile: 'Thorough',
    ageMinutes: 2_880,
    durationSec: 514,
    found: 47,
    failed: 1,
    bytes: 31_200_000_000,
    outcome: 'warning',
    note: '',
  },
  {
    id: 'job-1032',
    seriesId: 'frieren',
    titleEn: 'Frieren: Beyond Journey’s End',
    titleJa: '葬送のフリーレン',
    provider: 'VidPlay',
    profile: 'Balanced',
    ageMinutes: 4_320,
    durationSec: 198,
    found: 26,
    failed: 2,
    bytes: 17_800_000_000,
    outcome: 'warning',
    note: '',
  },
  {
    id: 'job-1031',
    seriesId: 'one-piece',
    titleEn: 'One Piece',
    titleJa: 'ワンピース',
    provider: 'StreamSB',
    profile: 'Archive',
    ageMinutes: 5_760,
    durationSec: 1_602,
    found: 1_110,
    failed: 12,
    bytes: 798_000_000_000,
    outcome: 'warning',
    note: 'Older cour missing from provider.',
  },
  {
    id: 'job-1030',
    seriesId: 'jujutsu-kaisen',
    titleEn: 'Jujutsu Kaisen',
    titleJa: '呪術廻戦',
    provider: 'VidPlay',
    profile: 'Learning',
    ageMinutes: 8_640,
    durationSec: 389,
    found: 47,
    failed: 0,
    bytes: 30_100_000_000,
    outcome: 'done',
    note: '',
  },
];

// ---------------------------------------------------------------- storage ---

export const STORAGE = {
  pageCacheBytes: 684_000_000,
  imageBytes: 512_000_000,
  logBytes: 213_000_000,
  budgetBytes: 4_000_000_000,
};

// ------------------------------------------------------- study handoff -----

export const LEARNING = {
  subtitleTracks: 75,
  newWords: 1_842,
  cardCandidates: 306,
};

// ------------------------------------------------------------ queue/stats ---

export const QUEUED_DOWNLOADS = 6;
export const FAILED_ITEMS = 3;

/** The job the Dashboard shows as running, so the shell is never fully idle. */
export const ACTIVE_JOB = {
  id: 'job-1042',
  titleEn: 'Frieren: Beyond Journey’s End',
  titleJa: '葬送のフリーレン',
  provider: 'VidPlay',
  stage: 'parsing' as const,
  done: 19,
  total: 28,
  etaSec: 135,
};

/** Next scheduled run, in minutes from now. */
export const NEXT_SCHEDULED_MINUTES = 168;

// ============================================================== generated ===
//
// Everything below is built once, on first access, from the seeded PRNG. The
// episode set is genuinely 1,197 rows because the table's virtualization is
// only worth anything if something actually exercises it — a 20-row fixture
// would have let a scrolling bug ship.

import type {
  DownloadRow,
  EpisodeRow,
  ExportRecord,
  ImageRow,
  LogLine,
  QbitTransferRow,
  SeriesMetadata,
  StreamRow,
  SubtitleAvailability,
  TorrentRow,
} from '../../../../shared/scraperResults';
import type { PluginInfo } from './scraperPort';

const EPISODE_TITLES_EN = [
  'Romance Dawn', 'Enter the Great Swordsman!', 'Morgan vs. Luffy! Who’s This Mysterious Beautiful Young Girl?',
  'Luffy’s Past! The Red-Haired Shanks Appears!', 'A Terrifying Mysterious Power! Captain Buggy the Clown!',
  'Desperate Situation! Beast Tamer Mohji vs. Luffy!', 'Epic Showdown! Swordsman Zoro vs. Acrobat Cabaji!',
  'Who Is the Victor? A Decisive Battle on the Stairway!', 'The Honourable Liar? Captain Usopp',
  'The Weirdest Guy Ever! Jango the Hypnotist', 'Expose the Plot! Pirate Butler Captain Kuro',
  'Clash with the Black Cat Pirates! The Great Battle on the Slope!', 'The Terrifying Duo! Meowban Brothers vs. Zoro',
  'Luffy Back in Action! Miss Kaya’s Desperate Resistance!', 'Beat Kuro! Usopp’s Deadly Determination!',
  'Protect Kaya! The Usopp Pirates’ Great Efforts!', 'Anger Explosion! Kuro vs. Luffy!',
  'You’re the Weird Creature! Gaimon and His Strange Friends', 'The Three-Sword Style’s Past!',
  'Famous Cook! Sanji of the Sea Restaurant',
];

const EPISODE_TITLES_JA = [
  '冒険の夜明け', '大剣豪現る！', 'ルフィvsモーガン！神官島の決闘', 'ルフィの過去！赤髪のシャンクス登場',
  '恐ろしい謎！海賊道化バギー', '絶体絶命！猛獣使いのモージ登場', '壮絶決闘！剣豪ゾロvs曲芸のカバジ',
  '勝者は誰だ！階段の決戦', '正直者の嘘つき？キャプテン・ウソップ', '世にも奇妙な男！催眠術のジャンゴ',
  '陰謀を暴け！海賊執事キャプテン・クロ', '黒猫海賊団襲来！坂道の大決戦', '恐怖の二人組！ニャーバン兄弟vsゾロ',
  'ルフィ復活！カヤお嬢様の決死の抵抗', 'クロを倒せ！ウソップ決死の覚悟', 'カヤを守れ！ウソップ海賊団大奮闘',
  '怒り爆発！クロvsルフィ', 'お前が変な生き物だ！ガイモンと奇妙な仲間たち', '三刀流の過去！',
  '名高きコック！海上レストランのサンジ',
];

const SOURCE_LABELS = ['StreamSB', 'VidPlay', 'MegaCloud', 'FileMoon'];
const RELEASE_GROUPS = ['SubsPlease', 'Erai-raws', 'HorribleSubs', 'Judas', 'Anime Time'];
const TRACKERS = ['nyaa.example', 'anidex.example', 'tokyo.example'];
const CODECS = ['h264', 'h265', 'av1'];
const CONTAINERS = ['mkv', 'mp4'];

function pick<T>(rand: () => number, list: readonly T[]): T {
  return list[Math.floor(rand() * list.length) % list.length];
}

function subtitlesFor(rand: () => number): SubtitleAvailability[] {
  const out: SubtitleAvailability[] = [];
  // Japanese subs are the point of this app, so they are common but not
  // guaranteed — a table where every row is identical teaches you nothing.
  if (rand() > 0.18) {
    out.push({
      language: 'ja',
      format: 'srt',
      embedded: rand() > 0.6,
      quality: 0.7 + rand() * 0.3,
      source: 'Jimaku',
    });
  }
  if (rand() > 0.08) {
    out.push({
      language: 'en',
      format: rand() > 0.5 ? 'ass' : 'srt',
      embedded: rand() > 0.4,
      quality: 0.6 + rand() * 0.4,
      source: pick(rand, SOURCE_LABELS),
    });
  }
  if (rand() > 0.85) {
    out.push({ language: 'es', format: 'vtt', embedded: false, quality: 0.5 + rand() * 0.3, source: 'Community' });
  }
  return out;
}

let episodeCache: EpisodeRow[] | null = null;

/** All 1,197 episodes across the three series, in stable order. */
export function episodes(): EpisodeRow[] {
  if (episodeCache) return episodeCache;
  const rand = mulberry32(FIXTURE_SEED);
  const rows: EpisodeRow[] = [];

  for (const series of SERIES) {
    for (let n = 1; n <= series.episodes; n += 1) {
      const titleIndex = (n - 1) % EPISODE_TITLES_EN.length;
      const roll = rand();
      // A handful of specials and a recap, so the type column is not one value
      // repeated 1,197 times.
      const kind =
        roll > 0.985 ? 'special' : roll > 0.975 ? 'recap' : roll > 0.97 ? 'ova' : 'episode';
      const resolution = roll > 0.9 ? '720p' : roll > 0.98 ? '480p' : '1080p';
      const sourceLabel = pick(rand, SOURCE_LABELS);
      const failed = rand() > 0.985;

      rows.push({
        id: `${series.id}-e${n}`,
        seriesId: series.id,
        number: n,
        numberLabel: `第${n}話`,
        season: Math.ceil(n / 100),
        titleEn: EPISODE_TITLES_EN[titleIndex],
        titleJa: EPISODE_TITLES_JA[titleIndex],
        kind,
        audio: 'sub',
        resolution,
        sourceId: sourceLabel.toLowerCase(),
        sourceLabel,
        sizeBytes: Math.round((680 + rand() * 90) * 1024 * 1024),
        durationSec: 1_380 + Math.round(rand() * 120),
        airDate: null,
        url: `/ep-${n}`,
        thumbnailUrl: scraperArtwork(n - 1),
        subtitles: subtitlesFor(rand),
        status: failed ? 'failed' : rand() > 0.95 ? 'warning' : 'ok',
        statusNote: failed ? 'No usable mirror responded.' : '',
      });
    }
  }

  episodeCache = rows;
  return rows;
}

let streamCache: StreamRow[] | null = null;

/** Mirrors for the first slice of episodes; enough to fill the Streams tab. */
export function streams(): StreamRow[] {
  if (streamCache) return streamCache;
  const rand = mulberry32(FIXTURE_SEED + 1);
  const rows: StreamRow[] = [];
  for (const episode of episodes().slice(0, 400)) {
    const mirrors = 1 + Math.floor(rand() * 5);
    for (let i = 0; i < mirrors; i += 1) {
      const label = SOURCE_LABELS[i % SOURCE_LABELS.length];
      const healthRoll = rand();
      rows.push({
        id: `${episode.id}-s${i}`,
        episodeId: episode.id,
        sourceId: label.toLowerCase(),
        sourceLabel: label,
        resolution: i === 0 ? episode.resolution : pick(rand, ['1080p', '720p', '480p']),
        codec: pick(rand, CODECS),
        container: pick(rand, CONTAINERS),
        bitrateKbps: 1_800 + Math.round(rand() * 4_200),
        audioLanguages: ['ja'],
        subtitleLanguages: episode.subtitles.map((s) => s.language),
        latencyMs: 180 + Math.round(rand() * 2_000),
        health: healthRoll > 0.9 ? 'dead' : healthRoll > 0.72 ? 'degraded' : 'ok',
        // Signed URLs are the norm for these providers; showing the countdown
        // is what stops the UI handing over a link that died ten minutes ago.
        expiresInSec: rand() > 0.5 ? 900 + Math.round(rand() * 3_600) : null,
        url: `https://${label.toLowerCase()}.example/e/${episode.id}`,
      });
    }
  }
  streamCache = rows;
  return rows;
}

let torrentCache: TorrentRow[] | null = null;

export function torrents(): TorrentRow[] {
  if (torrentCache) return torrentCache;
  const rand = mulberry32(FIXTURE_SEED + 2);
  const rows: TorrentRow[] = [];
  for (let i = 0; i < 40; i += 1) {
    const group = pick(rand, RELEASE_GROUPS);
    const series = SERIES[i % SERIES.length];
    const resolution = pick(rand, ['1080p', '1080p', '720p', '2160p']);
    const isBatch = rand() > 0.75;
    const episodeNo = 1 + Math.floor(rand() * Math.min(series.episodes, 300));
    const seeders = Math.round(rand() ** 2 * 1_800) + 1;
    rows.push({
      id: `t${i}`,
      infoHash: Array.from({ length: 40 }, () => '0123456789abcdef'[Math.floor(rand() * 16)]).join(''),
      name: isBatch
        ? `[${group}] ${series.titleEn} (01-${series.episodes}) [${resolution}] [Batch]`
        : `[${group}] ${series.titleEn} - ${String(episodeNo).padStart(2, '0')} [${resolution}]`,
      releaseGroup: group,
      resolution,
      seeders,
      leechers: Math.round(seeders * rand() * 0.4),
      availability: Number((0.8 + rand() * 4).toFixed(2)),
      tracker: pick(rand, TRACKERS),
      sizeBytes: Math.round((isBatch ? 18_000 + rand() * 40_000 : 620 + rand() * 900) * 1024 * 1024),
      ageDays: Math.round(rand() * 900),
      fileCount: isBatch ? series.episodes : 1,
      subtitleLanguages: rand() > 0.3 ? ['ja', 'en'] : ['en'],
      isBatch,
      magnet: 'magnet:?xt=urn:btih:…',
    });
  }
  torrentCache = rows;
  return rows;
}

let imageCache: ImageRow[] | null = null;

export function images(): ImageRow[] {
  if (imageCache) return imageCache;
  const rand = mulberry32(FIXTURE_SEED + 3);
  const eps = episodes();
  imageCache = Array.from({ length: TOTAL_IMAGES }, (_, i) => {
    const kind = i % 9 === 0 ? 'poster' : i % 7 === 0 ? 'banner' : 'thumbnail';
    const width = kind === 'poster' ? 460 : kind === 'banner' ? 1_920 : 320;
    const height = kind === 'poster' ? 650 : kind === 'banner' ? 400 : 180;
    return {
      id: `img${i}`,
      episodeId: kind === 'thumbnail' ? eps[i % eps.length].id : null,
      kind,
      width,
      height,
      sizeBytes: Math.round((18 + rand() * 260) * 1024),
      format: 'webp',
      url: kind === 'poster' ? SCRAPER_POSTER : scraperArtwork(i),
      sourceLabel: pick(rand, SOURCE_LABELS),
    };
  });
  return imageCache;
}

const LOG_MESSAGES: [LogLine['level'], string, string][] = [
  ['info', 'network', 'GET /anime/one-piece → 200 in 412 ms'],
  ['debug', 'extraction', 'Matched episode list with selector .ep-list > li'],
  ['info', 'extraction', 'Extracted 24 episodes from page 1'],
  ['warn', 'network', 'Rate limit header seen; slowing to 2 requests/second'],
  ['debug', 'browser', 'Waited 1,240 ms for network idle'],
  ['info', 'network', 'GET /anime/one-piece?page=2 → 200 in 388 ms'],
  ['error', 'network', 'GET /e/1044 → 503 Service Unavailable (retry 1 of 3)'],
  ['info', 'network', 'Retry succeeded after 2,000 ms'],
  ['debug', 'extraction', 'Fell back to selector 2 of 3 for episode title'],
  ['info', 'torrent', 'Indexer nyaa.example returned 18 candidates'],
  ['warn', 'extraction', 'Episode 12.5 has no title; using a neutral fallback'],
  ['info', 'qbit', 'qBittorrent 4.6.4 reachable in 38 ms'],
  ['trace', 'browser', 'Scroll pass 2 of 4 added 12 rows'],
  ['warn', 'network', 'Signed stream URL expires in 14 minutes'],
  ['info', 'scheduler', 'Next run for One Piece: tomorrow at 03:00'],
];

let logCache: LogLine[] | null = null;

export function logs(): LogLine[] {
  if (logCache) return logCache;
  const rand = mulberry32(FIXTURE_SEED + 4);
  logCache = Array.from({ length: 300 }, (_, i) => {
    const [level, channel, message] = LOG_MESSAGES[i % LOG_MESSAGES.length];
    return {
      id: `log${i}`,
      offsetMs: Math.round(i * (120 + rand() * 260)),
      level,
      channel,
      message,
      correlationId: `job-1042-${Math.floor(i / 12)}`,
    };
  });
  return logCache;
}

export const SERIES_METADATA: SeriesMetadata = {
  seriesId: 'one-piece',
  titleEn: 'One Piece',
  titleJa: 'ワンピース',
  titleRomaji: 'One Piece',
  synopsis:
    'A young pirate with a body of rubber sets out to find a legendary treasure and become King of the Pirates, gathering an unlikely crew along the way.',
  genres: ['Action', 'Adventure', 'Comedy', 'Fantasy'],
  studios: ['Toei Animation'],
  format: 'TV',
  status: 'Airing',
  season: 'Fall 1999',
  episodeCount: 1_122,
  averageDurationSec: 1_440,
  contentRating: 'PG-13',
  communityRating: 8.7,
  malId: 21,
  aniListId: 21,
  openingTheme: 'We Are! — Hiroshi Kitadani',
  endingTheme: 'memories — Maki Otsuki',
  officialSite: 'https://one-piece.example',
  provenance: {
    titleEn: 'MyAnimeList',
    titleJa: 'AniList',
    synopsis: 'MyAnimeList',
    genres: 'AniList',
    communityRating: 'MyAnimeList',
    episodeCount: 'Provider page',
  },
};

let downloadCache: DownloadRow[] | null = null;

export function downloads(): DownloadRow[] {
  if (downloadCache) return downloadCache;
  const rand = mulberry32(FIXTURE_SEED + 5);
  const eps = episodes();
  const states: DownloadRow['state'][] = [
    'downloading',
    'downloading',
    'queued',
    'paused',
    'done',
    'failed',
  ];
  downloadCache = states.map((state, i) => {
    const episode = eps[i * 37];
    const total = episode.sizeBytes;
    const received =
      state === 'done' ? total : state === 'queued' ? 0 : Math.round(total * rand() * 0.9);
    return {
      id: `d${i}`,
      episodeId: episode.id,
      title: episode.titleEn,
      subtitle: `${episode.numberLabel} · ${episode.resolution} · ${episode.sourceLabel}`,
      state,
      receivedBytes: received,
      totalBytes: total,
      speedBps: state === 'downloading' ? Math.round((2 + rand() * 9) * 1024 * 1024) : 0,
      etaSec: state === 'downloading' ? Math.round(30 + rand() * 900) : null,
      destination: `D:\\Anime\\One Piece\\Season 1\\${episode.id}.mkv`,
      error: state === 'failed' ? 'Connection reset by the provider after 3 retries.' : '',
    };
  });
  return downloadCache;
}

export const EXPORTS: ExportRecord[] = [
  { id: 'x9', format: 'JSON', destination: 'D:\\Exports\\one-piece-2026-07-26.json', records: 1_122, ageMinutes: 42, outcome: 'ok', note: '' },
  { id: 'x8', format: 'CSV', destination: 'D:\\Exports\\frieren.csv', records: 28, ageMinutes: 190, outcome: 'ok', note: '' },
  { id: 'x7', format: 'Anki', destination: 'Deck: Frieren — Mining', records: 306, ageMinutes: 240, outcome: 'ok', note: 'Card candidates from Japanese subtitles.' },
  { id: 'x6', format: 'JSON', destination: 'D:\\Exports\\jujutsu-kaisen.json', records: 44, ageMinutes: 1_120, outcome: 'partial', note: '3 episodes failed validation and were skipped.' },
  { id: 'x5', format: 'M3U', destination: 'D:\\Exports\\one-piece.m3u', records: 1_118, ageMinutes: 1_460, outcome: 'ok', note: '' },
  { id: 'x4', format: 'CSV', destination: 'D:\\Exports\\all-series.csv', records: 1_197, ageMinutes: 2_880, outcome: 'ok', note: '' },
  { id: 'x3', format: 'SQLite', destination: 'D:\\Exports\\library.db', records: 1_197, ageMinutes: 4_320, outcome: 'failed', note: 'Destination was read-only.' },
  { id: 'x2', format: 'NDJSON', destination: 'D:\\Exports\\stream.ndjson', records: 610, ageMinutes: 7_200, outcome: 'ok', note: '' },
  { id: 'x1', format: 'JSON', destination: 'D:\\Exports\\first-run.json', records: 24, ageMinutes: 10_080, outcome: 'ok', note: '' },
];

let qbitCache: QbitTransferRow[] | null = null;

export function qbitTransfers(): QbitTransferRow[] {
  if (qbitCache) return qbitCache;
  const rand = mulberry32(FIXTURE_SEED + 6);
  const rows = torrents().slice(0, 6);
  const states: QbitTransferRow['state'][] = [
    'downloading',
    'downloading',
    'seeding',
    'paused',
    'stalled',
    'checking',
  ];
  qbitCache = rows.map((torrent, i) => {
    const state = states[i];
    const progress = state === 'seeding' ? 1 : state === 'checking' ? rand() * 0.4 : rand();
    return {
      hash: torrent.infoHash,
      name: torrent.name,
      state,
      progress,
      downloadSpeedBps: state === 'downloading' ? Math.round((1 + rand() * 12) * 1024 * 1024) : 0,
      uploadSpeedBps: state === 'seeding' ? Math.round((0.2 + rand() * 3) * 1024 * 1024) : 0,
      etaSec: state === 'downloading' ? Math.round(60 + rand() * 5_400) : null,
      ratio: Number((rand() * 4).toFixed(2)),
      category: 'anime',
      tags: rand() > 0.5 ? ['scraper', 'japanese'] : ['scraper'],
      savePath: 'D:\\Torrents\\Anime',
      sizeBytes: torrent.sizeBytes,
      downloadedBytes: Math.round(torrent.sizeBytes * progress),
      uploadedBytes: Math.round(torrent.sizeBytes * rand() * 2),
      addedOn: '2026-07-24T20:14:00.000Z',
      completedOn: progress >= 1 ? '2026-07-25T02:41:00.000Z' : null,
      peersConnected: Math.round(rand() * 40),
      peersTotal: torrent.leechers,
      seedsConnected: Math.round(rand() * 30),
      seedsTotal: torrent.seeders,
      availability: torrent.availability,
      pieceStates: Array.from({ length: 60 }, (_, p) => (p / 60 < progress ? 1 : rand() > 0.85 ? 0.5 : 0)),
      episodeId: null,
    };
  });
  return qbitCache;
}

export const PLUGINS: PluginInfo[] = [
  {
    id: 'streamsb', name: 'StreamSB Adapter', version: '2.4.1', publisher: 'Community',
    enabled: true, compatible: true, updateAvailable: '',
    permissions: ['network:streamsb.example', 'storage:cache'],
    description: 'Episode lists and stream resolution for StreamSB mirrors.',
  },
  {
    id: 'vidplay', name: 'VidPlay Adapter', version: '1.9.0', publisher: 'Community',
    enabled: true, compatible: true, updateAvailable: '2.0.0',
    permissions: ['network:vidplay.example', 'storage:cache', 'browser:automation'],
    description: 'Handles VidPlay’s JavaScript-rendered episode grid.',
  },
  {
    id: 'nyaa', name: 'Nyaa Indexer', version: '3.1.2', publisher: 'Community',
    enabled: true, compatible: true, updateAvailable: '',
    permissions: ['network:nyaa.example'],
    description: 'Torrent search with release-group and seeder filtering.',
  },
  {
    id: 'jimaku', name: 'Jimaku Subtitles', version: '0.8.4', publisher: 'Community',
    enabled: false, compatible: true, updateAvailable: '',
    permissions: ['network:jimaku.example', 'storage:subtitles'],
    description: 'Japanese subtitle lookup for sentence mining.',
  },
  {
    id: 'legacy-anix', name: 'Legacy AniX', version: '0.4.0', publisher: 'Unknown',
    enabled: false, compatible: false, updateAvailable: '',
    permissions: ['network:*', 'filesystem:write'],
    description: 'Built against an older adapter API. Requests broad access.',
  },
];

/** A page the Selector Tester can actually run selectors against. */
export const FIXTURE_HTML = `<!doctype html>
<html lang="en">
  <head><title>One Piece — Episodes</title></head>
  <body>
    <div class="series">
      <h1 class="series-title">One Piece</h1>
      <span class="series-title-native">ワンピース</span>
      <ul class="ep-list">
        <li class="ep" data-ep="1"><a href="/ep-1" class="ep-link">Romance Dawn</a><span class="ep-native">冒険の夜明け</span><span class="quality">1080p</span></li>
        <li class="ep" data-ep="2"><a href="/ep-2" class="ep-link">Enter the Great Swordsman!</a><span class="ep-native">大剣豪現る！</span><span class="quality">1080p</span></li>
        <li class="ep" data-ep="3"><a href="/ep-3" class="ep-link">Morgan vs. Luffy!</a><span class="ep-native">ルフィvsモーガン</span><span class="quality">720p</span></li>
      </ul>
      <div class="pagination"><a href="?page=2" class="next">Next</a></div>
    </div>
  </body>
</html>`;

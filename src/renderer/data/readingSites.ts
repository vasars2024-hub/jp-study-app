// Reading Finder seed catalog (Plan 1, "Road to v1.01" — docs/IMPLEMENTATION_PLAN_V1.01.md).
// A curated directory of Japanese reading sites tagged by level, so the
// filters have real data on day one. Data-only: adding a site is a one-line
// change. `levels` uses the shared 1..7 LevelTier scale (shared/levelScale.ts:
// 1 Beginner … 2 N5 … 6 N1 … 7 Advanced/bungo), matching LevelService so the
// view can default its level filter to the user's own level ± 1.
//
// `pricing` intentionally mirrors data/resources.ts's `Cost` convention
// ('Free' | 'Freemium' | 'Paid', shown as literal English text — category
// labels in data modules are out of i18n scope, same call as NOVEL_TYPES /
// GENRES in data/novels.ts) so the existing .res-cost / cost-free CSS reuses
// directly.
//
// Site catalogs rot: every entry carries `lastVerified` and the view must
// show a graceful "site unreachable" state rather than a stuck spinner when a
// link is stale (see ReadingFinderView's fetch-error handling).
//
// ZH equivalents (qidian, jjwxc, ...) can land later behind this same schema.

import type { LevelTier } from '../../shared/levelScale';

export type ReadingLength = 'short' | 'serial' | 'novel';
export type ReadingPricing = 'Free' | 'Freemium' | 'Paid';

export type ReadingGenre =
  | 'graded-reader'
  | 'news'
  | 'picture-book'
  | 'folk-tale'
  | 'culture'
  | 'audio'
  | 'web-novel'
  | 'fanfic'
  | 'romance'
  | 'essay'
  | 'classics';

export const GENRE_LABELS: Record<ReadingGenre, string> = {
  'graded-reader': 'Graded reader',
  news: 'News',
  'picture-book': 'Picture book',
  'folk-tale': 'Folk tale',
  culture: 'Culture',
  audio: 'Audio',
  'web-novel': 'Web novel',
  fanfic: 'Fanfic',
  romance: 'Romance',
  essay: 'Essay',
  classics: 'Classics',
};

export const LENGTH_LABELS: Record<ReadingLength, string> = {
  short: 'Short story',
  serial: 'Serial',
  novel: 'Full novel',
};

export interface ReadingSite {
  id: string;
  name: string;
  url: string;
  /** Tiers this site is a good fit for, on the shared 1..7 scale. */
  levels: LevelTier[];
  genres: ReadingGenre[];
  furigana: boolean;
  lengthKinds: ReadingLength[];
  lang: 'ja';
  pricing: ReadingPricing;
  notes: string;
  /** Age-gated content — hidden unless the user explicitly opts in. */
  adult?: boolean;
  /** When the URL/description was last hand-verified. */
  lastVerified: string;
}

const V = '2026-07-16';

export const READING_SITES: ReadingSite[] = [
  {
    id: 'tadoku',
    name: 'Tadoku (多読)',
    url: 'https://tadoku.org',
    levels: [1, 2, 3],
    genres: ['graded-reader'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Free graded readers made specifically for learners — the classic extensive-reading starting point.',
    lastVerified: V,
  },
  {
    id: 'yomujp',
    name: '日本語多読道場',
    url: 'https://yomujp.com',
    levels: [1, 2, 3, 4],
    genres: ['graded-reader', 'audio'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Graded readers with narrated audio, leveled for extensive reading practice.',
    lastVerified: V,
  },
  {
    id: 'nhk-easy',
    name: 'NHK News Web Easy',
    url: 'https://www3.nhk.or.jp/news/easy/',
    levels: [1, 2],
    genres: ['news'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Real news simplified for learners, with furigana on every kanji.',
    lastVerified: V,
  },
  {
    id: 'ehon-hiroba',
    name: '絵本ひろば',
    url: 'https://ehon-hiroba.net',
    levels: [1],
    genres: ['picture-book'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Free picture books — the gentlest possible entry point.',
    lastVerified: V,
  },
  {
    id: 'hukumusume',
    name: '福娘童話集',
    url: 'https://hukumusume.com',
    levels: [2, 3],
    genres: ['folk-tale', 'audio'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'A huge archive of Japanese folk tales, many with narrated audio.',
    lastVerified: V,
  },
  {
    id: 'matcha',
    name: 'Matcha (Easy Japanese)',
    url: 'https://matcha-jp.com',
    levels: [2, 3],
    genres: ['culture'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: 'A travel and culture magazine with an "Easy Japanese" article tier.',
    lastVerified: V,
  },
  {
    id: 'easyjapanese',
    name: 'Todaii / Easy Japanese',
    url: 'https://easyjapanese.net',
    levels: [2, 3, 4],
    genres: ['news'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Graded news articles with built-in reading tools.',
    lastVerified: V,
  },
  {
    id: 'satori-reader',
    name: 'Satori Reader',
    url: 'https://www.satorireader.com',
    levels: [2, 3, 4],
    genres: ['graded-reader', 'audio'],
    furigana: true,
    lengthKinds: ['short', 'serial'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: 'Graded serial stories with audio, grammar notes, and word-level glosses.',
    lastVerified: V,
  },
  {
    id: 'mainichi-shogakusei',
    name: '毎日小学生新聞',
    url: 'https://mainichi.jp/maisho/',
    levels: [3],
    genres: ['news'],
    furigana: true,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: 'An elementary-school newspaper — simpler vocabulary than adult news, still native content.',
    lastVerified: V,
  },
  {
    id: 'nhk-news',
    name: 'NHK News Web',
    url: 'https://www3.nhk.or.jp/news/',
    levels: [4, 5],
    genres: ['news'],
    furigana: false,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Standard native-level news, unsimplified.',
    lastVerified: V,
  },
  {
    id: 'syosetu',
    name: '小説家になろう (Syosetu)',
    url: 'https://syosetu.com',
    levels: [3, 4, 5, 6],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'The largest free Japanese web-novel site — isekai and beyond, source of countless anime adaptations.',
    lastVerified: V,
  },
  {
    id: 'yomou-syosetu',
    name: '小説を読もう！',
    url: 'https://yomou.syosetu.com',
    levels: [3, 4, 5, 6],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: "Syosetu's ranking and discovery portal — a good way to find what's popular right now.",
    lastVerified: V,
  },
  {
    id: 'kakuyomu',
    name: 'カクヨム (Kakuyomu)',
    url: 'https://kakuyomu.jp',
    levels: [3, 4, 5, 6],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Kadokawa-run web novels with regular contests and a clean reader.',
    lastVerified: V,
  },
  {
    id: 'alphapolis',
    name: 'アルファポリス',
    url: 'https://www.alphapolis.co.jp',
    levels: [3, 4, 5, 6],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: 'Web novels with a mix of free chapters and paid volumes.',
    lastVerified: V,
  },
  {
    id: 'hameln',
    name: 'ハーメルン (Hameln)',
    url: 'https://syosetu.org',
    levels: [3, 4, 5, 6],
    genres: ['web-novel', 'fanfic'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Fanfiction and original web novels, a favorite for crossover and isekai fanfic.',
    lastVerified: V,
  },
  {
    id: 'pixiv-novel',
    name: 'pixiv小説',
    url: 'https://www.pixiv.net/novel/',
    levels: [3, 4, 5, 6],
    genres: ['fanfic', 'web-novel'],
    furigana: false,
    lengthKinds: ['short', 'serial'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Short fiction and fanfic from the pixiv community — original and fan works side by side.',
    lastVerified: V,
  },
  {
    id: 'everystar',
    name: 'エブリスタ (Everystar)',
    url: 'https://estar.jp',
    levels: [3, 4, 5],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['short', 'serial'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: 'Short, mobile-first fiction — bite-sized chapters that suit phone reading.',
    lastVerified: V,
  },
  {
    id: 'monogatary',
    name: 'モノガタリー',
    url: 'https://monogatary.com',
    levels: [3, 4, 5],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Short-story platform run by Sony Music — frequent writing contests.',
    lastVerified: V,
  },
  {
    id: 'novelup-plus',
    name: 'ノベルアップ+',
    url: 'https://novelup.plus',
    levels: [3, 4, 5, 6],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'A newer web-novel platform with illustration and voice-actor tie-ins.',
    lastVerified: V,
  },
  {
    id: 'novel-days',
    name: 'NOVEL DAYS',
    url: 'https://novel.daysneo.com',
    levels: [3, 4, 5, 6],
    genres: ['web-novel'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: "Kodansha's web-novel platform, including chat-style fiction.",
    lastVerified: V,
  },
  {
    id: 'maho-i-land',
    name: '魔法のiらんど',
    url: 'https://maho.jp',
    levels: [3, 4, 5],
    genres: ['web-novel', 'romance'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'A long-running romance- and teen-focused web-novel community.',
    lastVerified: V,
  },
  {
    id: 'note-com',
    name: 'note.com',
    url: 'https://note.com',
    levels: [4, 5, 6],
    genres: ['essay'],
    furigana: false,
    lengthKinds: ['short'],
    lang: 'ja',
    pricing: 'Freemium',
    notes: 'Essays and blog posts from native writers — good for unfiltered contemporary prose.',
    lastVerified: V,
  },
  {
    id: 'aozora-bunko',
    name: '青空文庫 (Aozora Bunko)',
    url: 'https://www.aozora.gr.jp',
    levels: [5, 6, 7],
    genres: ['classics'],
    furigana: false,
    lengthKinds: ['novel', 'short'],
    lang: 'ja',
    pricing: 'Free',
    notes: 'Public-domain classics. Level 7 entries use pre-war (bungo) orthography.',
    lastVerified: V,
  },
  {
    id: 'nocturne-novels',
    name: 'ノクターンノベルズ (Narou 18+)',
    url: 'https://noc.syosetu.com',
    levels: [4, 5, 6],
    genres: ['web-novel', 'romance'],
    furigana: false,
    lengthKinds: ['serial', 'novel'],
    lang: 'ja',
    pricing: 'Free',
    notes: "Syosetu's age-gated adult imprint (Nocturne/Moonlight). Hidden unless 18+ content is switched on.",
    adult: true,
    lastVerified: V,
  },
];

import type { LibraryItem } from './types';

export const DEFAULT_JITEN_API_BASE = 'https://api.jiten.moe/api';

export type JitenMediaType = 4 | 8;
export type JitenSourceMode = 'external' | 'direct' | 'both';
export type JitenAcquisitionStatus =
  | 'planned'
  | 'linked'
  | 'downloaded'
  | 'imported'
  | 'analyzed'
  | 'mined'
  | 'error';

/**
 * Does this plan entry hold anything removing it would destroy for good?
 *
 * `removePlan` filters the row out and writes, with no undo. Re-adding a title
 * you only planned costs one search, so a confirm there is friction; a note you
 * typed, or an acquisition that has already linked, downloaded, imported,
 * analyzed or mined, is not re-derivable that way. D144 gates the confirm on
 * this so the cheap case stays one click.
 *
 * `error` counts: it is a state the user acted their way into and may be
 * reading in order to retry.
 */
export function planEntryCarriesWork(entry: Pick<JitenPlanEntry, 'notes' | 'acquisitionStatus' | 'importedLibraryItemId'>): boolean {
  if (entry.notes != null && entry.notes.trim() !== '') return true;
  if (entry.importedLibraryItemId != null && entry.importedLibraryItemId !== '') return true;
  return entry.acquisitionStatus != null && entry.acquisitionStatus !== 'planned';
}

export interface JitenConfig {
  apiBaseUrl: string;
  apiKey?: string;
}

export interface JitenLink {
  linkType?: number;
  url: string;
}

export interface JitenTag {
  tagId?: number;
  name: string;
  percentage?: number;
}

export interface JitenDeck {
  deckId: number;
  originalTitle: string;
  romajiTitle?: string;
  englishTitle?: string;
  description?: string;
  coverName?: string;
  mediaType: JitenMediaType;
  releaseDate?: string;
  characterCount?: number;
  wordCount?: number;
  uniqueWordCount?: number;
  uniqueKanjiCount?: number;
  sentenceCount?: number;
  averageSentenceLength?: number;
  dialoguePercentage?: number;
  difficulty?: number;
  difficultyRaw?: number;
  childrenDeckCount?: number;
  externalRating?: number;
  genres?: number[];
  tags?: JitenTag[];
  links?: JitenLink[];
}

export interface JitenDeckStats {
  deckId?: number;
  characterCount?: number;
  wordCount?: number;
  uniqueWordCount?: number;
  uniqueKanjiCount?: number;
  sentenceCount?: number;
  averageSentenceLength?: number;
  dialoguePercentage?: number;
  difficulty?: number;
  difficultyRaw?: number;
}

export interface JitenSourceProfile {
  id: string;
  name: string;
  enabled: boolean;
  mode: JitenSourceMode;
  searchUrlTemplate: string;
  directUrlTemplate?: string;
}

export interface JitenPlanEntry {
  id: string;
  titleJp: string;
  author?: string;
  romajiTitle?: string;
  englishTitle?: string;
  mediaType?: JitenMediaType;
  jitenDeckId?: number;
  coverUrl?: string;
  /** Relative path (e.g. "cover.jpg") under itemDir(`jiten-${jitenDeckId}`) once coverUrl has been fetched and cached locally — see main/jiten.ts's cacheDeckCover. Undefined until then. */
  coverCachePath?: string;
  description?: string;
  genres: string[];
  tags: string[];
  difficultyRaw?: number;
  difficultyLabel?: string;
  sourceLinks: JitenSourceLink[];
  selectedSourceId?: string;
  importedLibraryItemId?: string;
  acquisitionStatus: JitenAcquisitionStatus;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  minedAt?: number;
  error?: string;
}

export interface JitenSourceLink {
  id: string;
  label: string;
  url: string;
  direct: boolean;
  profileId?: string;
}

export interface JitenStore {
  config: JitenConfig;
  sourceProfiles: JitenSourceProfile[];
  plan: JitenPlanEntry[];
}

export interface JitenSearchRequest {
  query?: string;
  mediaTypes?: JitenMediaType[];
  offset?: number;
  limit?: number;
  sortBy?: 'difficulty' | 'title' | 'releaseDate' | 'wordCount' | 'rating';
  sortOrder?: 'asc' | 'desc';
  difficultyMin?: number;
  difficultyMax?: number;
  genres?: string[];
}

export interface JitenSearchResult {
  decks: JitenDeck[];
  totalItems: number;
}

export type JitenDeckFormat = 1 | 2 | 3 | 4 | 5 | 6;
export type JitenDeckDownloadType = 1 | 2 | 3 | 4 | 5 | 6;
export type JitenDeckOrder = 1 | 2 | 3 | 4 | 5;

export interface JitenDeckDownloadOptions {
  format: JitenDeckFormat;
  downloadType: JitenDeckDownloadType;
  order: JitenDeckOrder;
  minFrequency: number;
  maxFrequency: number;
  excludeKana: boolean;
  excludeMatureMasteredBlacklisted: boolean;
  excludeAllTrackedWords: boolean;
  excludeExampleSentences: boolean;
  targetPercentage: number | null;
  startFromKnown: boolean;
  minOccurrences: number | null;
  maxOccurrences: number | null;
}

export interface JitenParsedCard {
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  front: string;
  back: string;
  occurrences?: number;
  frequency?: number;
  jmdictWordId?: string;
}

export interface JitenImportDirectRequest {
  url: string;
  title: string;
  planId?: string;
  sourceId?: string;
}

export interface JitenImportDirectResult {
  ok: boolean;
  item?: LibraryItem;
  store?: JitenStore;
  error?: string;
}

export const DEFAULT_JITEN_CONFIG: JitenConfig = {
  apiBaseUrl: DEFAULT_JITEN_API_BASE,
};

// Genre ids used by the Jiten API (matches jiten.moe's own taxonomy).
export const JITEN_GENRES: Record<number, string> = {
  1: 'Action',
  2: 'Adventure',
  3: 'Comedy',
  4: 'Drama',
  5: 'Ecchi',
  6: 'Fantasy',
  7: 'Horror',
  8: 'Mecha',
  9: 'Music',
  10: 'Mystery',
  11: 'Psychological',
  12: 'Romance',
  13: 'Sci-Fi',
  14: 'Slice of Life',
  15: 'Sports',
  16: 'Supernatural',
  17: 'Thriller',
  18: 'Adult Only',
};

export function jitenGenreName(id: number): string {
  return JITEN_GENRES[id] ?? String(id);
}

export function jitenGenreId(name: string): number | undefined {
  const wanted = name.trim().toLowerCase();
  for (const [id, label] of Object.entries(JITEN_GENRES)) {
    if (label.toLowerCase() === wanted) return Number(id);
  }
  return undefined;
}

export const JITEN_DOWNLOAD_TYPE_LABELS: Record<JitenDeckDownloadType, string> = {
  1: 'Full deck',
  2: 'Top words (global frequency)',
  3: 'Top words (deck frequency)',
  4: 'Top words (chronological)',
  5: 'Target coverage %',
  6: 'By occurrence count',
};

export const JITEN_ORDER_LABELS: Record<JitenDeckOrder, string> = {
  1: 'Chronological',
  2: 'Global frequency',
  3: 'Deck frequency',
  4: 'Import order',
  5: 'Random',
};

export const DEFAULT_JITEN_DOWNLOAD_OPTIONS: JitenDeckDownloadOptions = {
  format: 2,
  downloadType: 1,
  order: 3,
  minFrequency: 0,
  maxFrequency: 0,
  excludeKana: true,
  excludeMatureMasteredBlacklisted: false,
  excludeAllTrackedWords: false,
  excludeExampleSentences: false,
  targetPercentage: null,
  startFromKnown: false,
  minOccurrences: 1,
  maxOccurrences: null,
};

export const DEFAULT_JITEN_SOURCE_PROFILES: JitenSourceProfile[] = [
  {
    id: 'google-books',
    name: 'Google Books',
    enabled: true,
    mode: 'external',
    searchUrlTemplate: 'https://www.google.com/search?q={titleJp}%20{author}%20Google%20Books',
  },
  {
    id: 'bookwalker',
    name: 'BookWalker',
    enabled: true,
    mode: 'external',
    searchUrlTemplate: 'https://global.bookwalker.jp/search/?word={titleJp}',
  },
  {
    id: 'aozora',
    name: 'Aozora search',
    enabled: true,
    mode: 'external',
    searchUrlTemplate: 'https://www.google.com/search?q={titleJp}%20{author}%20site%3Aaozora.gr.jp',
  },
];

export function createEmptyJitenStore(): JitenStore {
  return {
    config: { ...DEFAULT_JITEN_CONFIG },
    sourceProfiles: DEFAULT_JITEN_SOURCE_PROFILES.map((source) => ({ ...source })),
    plan: [],
  };
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

export function normalizeJitenApiBase(raw: string | undefined): string {
  const fallback = DEFAULT_JITEN_API_BASE;
  const trimmed = (raw ?? '').trim().replace(/\/+$/, '');
  if (!trimmed || !isHttpUrl(trimmed)) return fallback;
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

export function sanitizeJitenDeck(raw: unknown): JitenDeck | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const deckId = asNumber(o.deckId);
  const originalTitle = asString(o.originalTitle);
  const mediaType = asNumber(o.mediaType);
  if (!deckId || !originalTitle || (mediaType !== 4 && mediaType !== 8)) return null;

  const links = Array.isArray(o.links)
    ? o.links
        .map((link) => {
          if (!link || typeof link !== 'object') return null;
          const l = link as Record<string, unknown>;
          const url = asString(l.url);
          if (!url || !isHttpUrl(url)) return null;
          return { url, linkType: asNumber(l.linkType) } as JitenLink;
        })
        .filter((link): link is JitenLink => link !== null)
    : [];

  const tags = Array.isArray(o.tags)
    ? o.tags
        .map((tag) => {
          if (!tag || typeof tag !== 'object') return null;
          const t = tag as Record<string, unknown>;
          const name = asString(t.name);
          return name
            ? ({ name, tagId: asNumber(t.tagId), percentage: asNumber(t.percentage) } as JitenTag)
            : null;
        })
        .filter((tag): tag is JitenTag => tag !== null)
    : [];

  const coverName = asString(o.coverName);
  return {
    deckId,
    originalTitle,
    mediaType,
    romajiTitle: asString(o.romajiTitle),
    englishTitle: asString(o.englishTitle),
    description: asString(o.description),
    coverName: coverName && isHttpUrl(coverName) ? coverName : coverName,
    releaseDate: asString(o.releaseDate),
    characterCount: asNumber(o.characterCount),
    wordCount: asNumber(o.wordCount),
    uniqueWordCount: asNumber(o.uniqueWordCount),
    uniqueKanjiCount: asNumber(o.uniqueKanjiCount),
    sentenceCount: asNumber(o.sentenceCount),
    averageSentenceLength: asNumber(o.averageSentenceLength),
    dialoguePercentage: asNumber(o.dialoguePercentage),
    difficulty: asNumber(o.difficulty),
    difficultyRaw: asNumber(o.difficultyRaw),
    childrenDeckCount: asNumber(o.childrenDeckCount),
    externalRating: asNumber(o.externalRating),
    genres: Array.isArray(o.genres)
      ? o.genres.map(asNumber).filter((n): n is number => n != null)
      : [],
    tags,
    links,
  };
}

export function difficultyLabel(raw?: number): string {
  if (raw == null || !Number.isFinite(raw)) return 'Unknown';
  if (raw < 1) return 'Beginner';
  if (raw < 2) return 'Easy';
  if (raw < 3) return 'Moderate';
  if (raw < 4) return 'Hard';
  return 'Very Hard';
}

export function jitenDeckToPlanEntry(
  deck: JitenDeck,
  sourceLinks: JitenSourceLink[],
  existing?: JitenPlanEntry,
): JitenPlanEntry {
  const now = Date.now();
  const rawDifficulty = deck.difficultyRaw ?? deck.difficulty;
  return {
    id: existing?.id ?? `jiten-${deck.deckId}`,
    titleJp: deck.originalTitle,
    romajiTitle: deck.romajiTitle,
    englishTitle: deck.englishTitle,
    mediaType: deck.mediaType,
    jitenDeckId: deck.deckId,
    coverUrl: deck.coverName,
    description: deck.description,
    genres: deck.genres?.map(jitenGenreName) ?? [],
    tags: deck.tags?.map((t) => t.name) ?? [],
    difficultyRaw: rawDifficulty,
    difficultyLabel: difficultyLabel(rawDifficulty),
    sourceLinks,
    selectedSourceId: existing?.selectedSourceId ?? sourceLinks[0]?.id,
    importedLibraryItemId: existing?.importedLibraryItemId,
    acquisitionStatus: existing?.acquisitionStatus ?? 'planned',
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    minedAt: existing?.minedAt,
    error: existing?.error,
  };
}

function templateValue(key: string, data: Partial<JitenPlanEntry & JitenDeck>): string {
  switch (key) {
    case 'title':
    case 'titleJp':
      return data.titleJp ?? data.originalTitle ?? '';
    case 'author':
      return data.author ?? '';
    case 'romaji':
    case 'romajiTitle':
      return data.romajiTitle ?? '';
    case 'english':
    case 'englishTitle':
      return data.englishTitle ?? '';
    case 'deckId':
      return data.jitenDeckId != null ? String(data.jitenDeckId) : data.deckId != null ? String(data.deckId) : '';
    default:
      return '';
  }
}

export function expandSourceTemplate(
  template: string,
  data: Partial<JitenPlanEntry & JitenDeck>,
): string {
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) =>
    encodeURIComponent(templateValue(key, data)),
  );
}

export function buildSourceLinks(
  data: Partial<JitenPlanEntry & JitenDeck>,
  profiles: JitenSourceProfile[],
  deckLinks: JitenLink[] = [],
): JitenSourceLink[] {
  const out: JitenSourceLink[] = [];
  for (const link of deckLinks) {
    if (!isHttpUrl(link.url)) continue;
    out.push({
      id: `jiten-link-${link.linkType ?? out.length}-${out.length}`,
      label: link.linkType === 11 ? 'Amazon' : link.linkType === 10 ? 'Bookmeter' : link.linkType === 6 ? 'Google Books' : 'Jiten link',
      url: link.url,
      direct: false,
    });
  }
  for (const profile of profiles) {
    if (!profile.enabled) continue;
    const searchUrl = expandSourceTemplate(profile.searchUrlTemplate, data);
    if (searchUrl && isHttpUrl(searchUrl)) {
      out.push({
        id: `profile-${profile.id}-search`,
        label: profile.name,
        url: searchUrl,
        direct: false,
        profileId: profile.id,
      });
    }
    if ((profile.mode === 'direct' || profile.mode === 'both') && profile.directUrlTemplate) {
      const directUrl = expandSourceTemplate(profile.directUrlTemplate, data);
      if (directUrl && isHttpUrl(directUrl)) {
        out.push({
          id: `profile-${profile.id}-direct`,
          label: `${profile.name} EPUB`,
          url: directUrl,
          direct: true,
          profileId: profile.id,
        });
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

export function sanitizeSourceProfiles(raw: unknown): JitenSourceProfile[] {
  const profiles = Array.isArray(raw) ? raw : [];
  const clean = profiles
    .map((profile) => {
      if (!profile || typeof profile !== 'object') return null;
      const p = profile as Record<string, unknown>;
      const id = asString(p.id);
      const name = asString(p.name);
      const searchUrlTemplate = asString(p.searchUrlTemplate);
      const mode = p.mode === 'direct' || p.mode === 'both' ? p.mode : 'external';
      if (!id || !name || !searchUrlTemplate) return null;
      return {
        id,
        name,
        enabled: p.enabled !== false,
        mode,
        searchUrlTemplate,
        directUrlTemplate: asString(p.directUrlTemplate),
      } as JitenSourceProfile;
    })
    .filter((profile): profile is JitenSourceProfile => profile !== null);
  return clean.length ? clean : DEFAULT_JITEN_SOURCE_PROFILES.map((profile) => ({ ...profile }));
}

export function sanitizePlanEntries(raw: unknown): JitenPlanEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const id = asString(e.id);
      const titleJp = asString(e.titleJp);
      if (!id || !titleJp) return null;
      const status = asString(e.acquisitionStatus) as JitenAcquisitionStatus | undefined;
      return {
        id,
        titleJp,
        author: asString(e.author),
        romajiTitle: asString(e.romajiTitle),
        englishTitle: asString(e.englishTitle),
        mediaType: asNumber(e.mediaType) === 8 ? 8 : asNumber(e.mediaType) === 4 ? 4 : undefined,
        jitenDeckId: asNumber(e.jitenDeckId),
        coverUrl: asString(e.coverUrl),
        coverCachePath: asString(e.coverCachePath),
        description: asString(e.description),
        genres: Array.isArray(e.genres) ? e.genres.filter((v): v is string => typeof v === 'string') : [],
        tags: Array.isArray(e.tags) ? e.tags.filter((v): v is string => typeof v === 'string') : [],
        difficultyRaw: asNumber(e.difficultyRaw),
        difficultyLabel: asString(e.difficultyLabel),
        sourceLinks: Array.isArray(e.sourceLinks)
          ? e.sourceLinks
              .map((link) => {
                if (!link || typeof link !== 'object') return null;
                const l = link as Record<string, unknown>;
                const linkId = asString(l.id);
                const url = asString(l.url);
                const label = asString(l.label);
                if (!linkId || !url || !label || !isHttpUrl(url)) return null;
                return {
                  id: linkId,
                  label,
                  url,
                  direct: Boolean(l.direct),
                  profileId: asString(l.profileId),
                } as JitenSourceLink;
              })
              .filter((link): link is JitenSourceLink => link !== null)
          : [],
        selectedSourceId: asString(e.selectedSourceId),
        importedLibraryItemId: asString(e.importedLibraryItemId),
        acquisitionStatus:
          status === 'linked' ||
          status === 'downloaded' ||
          status === 'imported' ||
          status === 'analyzed' ||
          status === 'mined' ||
          status === 'error'
            ? status
            : 'planned',
        notes: asString(e.notes),
        createdAt: asNumber(e.createdAt) ?? Date.now(),
        updatedAt: asNumber(e.updatedAt) ?? Date.now(),
        minedAt: asNumber(e.minedAt),
        error: asString(e.error),
      } as JitenPlanEntry;
    })
    .filter((entry): entry is JitenPlanEntry => entry !== null);
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === ',') {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function parseJitenCsvDeck(csv: string): JitenParsedCard[] {
  const lines = csv.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (names: string[]): number => headers.findIndex((h) => names.includes(h));
  const wordIdx = idx(['word', 'expression']);
  const readingIdx = idx(['readingkana', 'reading', 'kana']);
  const furiganaIdx = idx(['readingfurigana']);
  const meaningIdx = idx(['definitions', 'meaning']);
  const sentenceIdx = idx(['examplesentence', 'sentence']);
  const occurrencesIdx = idx(['occurences', 'occurrences']);
  const frequencyIdx = idx(['readingfrequency', 'frequency']);
  const idIdx = idx(['jmdictwordid']);
  if (wordIdx < 0) return [];

  return lines.slice(1).map(parseCsvLine).map((row) => {
    const word = (row[wordIdx] ?? '').trim();
    const reading = (readingIdx >= 0 ? row[readingIdx] : row[furiganaIdx])?.trim() ?? '';
    const meaning = (meaningIdx >= 0 ? row[meaningIdx] : '')?.trim() ?? '';
    const sentence = (sentenceIdx >= 0 ? row[sentenceIdx] : '')?.trim() || undefined;
    const occurrences = occurrencesIdx >= 0 ? asNumber(row[occurrencesIdx]) : undefined;
    const frequency = frequencyIdx >= 0 ? asNumber(row[frequencyIdx]) : undefined;
    const jmdictWordId = (idIdx >= 0 ? row[idIdx] : '')?.trim() || undefined;
    return {
      word,
      reading,
      meaning,
      sentence,
      occurrences,
      frequency,
      jmdictWordId,
      front: word,
      back: [reading && reading !== word ? reading : '', meaning, sentence].filter(Boolean).join('\n'),
    };
  }).filter((card) => card.word);
}

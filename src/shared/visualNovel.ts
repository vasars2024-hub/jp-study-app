export const VISUAL_NOVEL_DATABASE_VERSION = 1;
export const VISUAL_NOVEL_CAPTURE_LIMIT = 20_000;
/** The library store, relative to userData. Main writes it; the Files app reads it. */
export const VISUAL_NOVEL_DATABASE_FILE = 'immersion/visual-novels.json';

export type VisualNovelEngine =
  | 'renpy'
  | 'kirikiri'
  | 'nscripter'
  | 'unity'
  | 'rpg-maker'
  | 'tyrano'
  | 'bgi'
  | 'siglus'
  | 'artemis'
  | 'catsystem2'
  | 'yuris'
  | 'custom'
  | 'unknown';

export const VISUAL_NOVEL_ENGINES: readonly VisualNovelEngine[] = [
  'renpy', 'kirikiri', 'nscripter', 'unity', 'rpg-maker', 'tyrano',
  'bgi', 'siglus', 'artemis', 'catsystem2', 'yuris', 'custom', 'unknown',
];

/**
 * Product names, which are data rather than chrome and are never translated.
 * `custom` and `unknown` are absent on purpose: those two are UI words and are
 * resolved through the catalog by the picker.
 */
export const VISUAL_NOVEL_ENGINE_NAMES: Partial<Record<VisualNovelEngine, string>> = {
  renpy: "Ren'Py",
  kirikiri: 'KiriKiri',
  nscripter: 'NScripter',
  unity: 'Unity',
  'rpg-maker': 'RPG Maker',
  tyrano: 'TyranoBuilder',
  bgi: 'BGI / Ethornell',
  siglus: 'SiglusEngine',
  artemis: 'Artemis',
  catsystem2: 'CatSystem2',
  yuris: 'YU-RIS',
};

export function isVisualNovelEngine(value: unknown): value is VisualNovelEngine {
  return typeof value === 'string' && (VISUAL_NOVEL_ENGINES as readonly string[]).includes(value);
}

export type VisualNovelStatus = 'planned' | 'reading' | 'completed' | 'dropped' | 'replaying';
export type VisualNovelRouteStatus = 'not-started' | 'reading' | 'completed';
export type VisualNovelTextKind = 'dialogue' | 'narration' | 'choice' | 'character-name' | 'system';

export interface VisualNovelRoute {
  id: string;
  name: string;
  character: string;
  status: VisualNovelRouteStatus;
  guideNotes: string;
  endings: Array<{ id: string; name: string; achieved: boolean; notes: string }>;
}

export interface VisualNovelCommunityReport {
  id: string;
  author: string;
  rating: number | null;
  difficultyRating: number | null;
  jlptLevel: string;
  review: string;
  languageNotes: string;
  createdAt: number;
  source: 'local' | 'import';
}

export type VisualNovelVoiceCoverage = 'none' | 'ero-only' | 'partial' | 'full' | 'unknown';

export interface VisualNovelReleaseLanguage {
  code: string;
  title: string;
  machineTranslated: boolean;
  main: boolean;
}

export interface VisualNovelRelease {
  id: string;
  title: string;
  releaseDate: string;
  languages: VisualNovelReleaseLanguage[];
  platforms: string[];
  publishers: string[];
  engine: string;
  voiceCoverage: VisualNovelVoiceCoverage;
  releaseType: 'trial' | 'partial' | 'complete' | 'unknown';
  official: boolean;
  patch: boolean;
  freeware: boolean;
}

export interface VisualNovelEntry {
  id: string;
  title: string;
  japaneseTitle: string;
  englishTitle: string;
  alternativeTitles: string[];
  developer: string;
  publisher: string;
  releaseDate: string;
  originalPlatform: string;
  platforms: string[];
  genres: string[];
  tags: string[];
  themes: string[];
  synopsis: string;
  characters: string[];
  chapters: string[];
  routes: VisualNovelRoute[];
  releases: VisualNovelRelease[];
  communityReports: VisualNovelCommunityReport[];
  estimatedPlaytimeHours: number;
  sourceIds: Record<string, string>;
  sourceUrl: string;
  coverImageUrl: string;
  backgroundImageUrls: string[];
  screenshotUrls: string[];
  communityRating: number | null;
  communityVoteCount: number;
  installPath: string;
  executablePath: string;
  engine: VisualNovelEngine;
  engineCompatibility: 'supported' | 'partial' | 'manual' | 'unknown';
  version: string;
  language: string;
  status: VisualNovelStatus;
  currentRouteId: string;
  currentChapter: string;
  currentScene: string;
  completionPct: number;
  totalPlaytimeSec: number;
  lastPlayedAt: number | null;
  /** Watch the clipboard for game text while this novel runs. On unless turned off. */
  clipboardCapture: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface VisualNovelReaderSettings {
  /** Window opacity, 0.35–1. */
  opacity: number;
  /** Line font size in px. */
  fontSize: number;
  /** Last position/size; null until the user moves it. */
  bounds: { x: number; y: number; width: number; height: number } | null;
  /** Open the reader next to the game on Launch. */
  autoShow: boolean;
}

export interface VisualNovelSettings {
  /** Connect to a user-run texthooker websocket during a capture session. */
  websocketEnabled: boolean;
  websocketUrl: string;
  /** Optional user-installed Locale Emulator `LEProc.exe`; never bundled. */
  localeEmulatorPath: string;
  reader: VisualNovelReaderSettings;
}

export type VisualNovelSettingsPatch = Partial<Omit<VisualNovelSettings, 'reader'>> & {
  reader?: Partial<VisualNovelReaderSettings>;
};

export interface VisualNovelTextCapture {
  id: string;
  visualNovelId: string;
  kind: VisualNovelTextKind;
  japanese: string;
  translation: string;
  speaker: string;
  routeId: string;
  chapter: string;
  scene: string;
  /** Managed local screenshot path; never accepted directly from renderer input. */
  screenshotPath: string;
  /** Optional managed local voice/audio clip attached to this sentence. */
  audioPath: string;
  source: 'manual' | 'clipboard' | 'hook' | 'ocr' | 'import';
  capturedAt: number;
}

export interface VisualNovelDatabase {
  version: typeof VISUAL_NOVEL_DATABASE_VERSION;
  entries: VisualNovelEntry[];
  captures: VisualNovelTextCapture[];
  /**
   * Optional so a database written before capture settings existed (and the
   * fixtures that stand in for one) still type-check; read it through
   * `visualNovelSettings()`, which always answers.
   */
  settings?: VisualNovelSettings;
}

export interface VisualNovelCreateInput {
  title: string;
  japaneseTitle?: string;
  englishTitle?: string;
  installPath?: string;
  executablePath?: string;
  engine?: VisualNovelEngine;
  language?: string;
}

export interface VisualNovelDiscoveryCandidate extends VisualNovelCreateInput {
  installPath: string;
  executablePath: string;
  engine: VisualNovelEngine;
  alreadyImported: boolean;
}

export interface VisualNovelMetadataPatch {
  title?: string;
  japaneseTitle?: string;
  englishTitle?: string;
  alternativeTitles?: string[];
  developer?: string;
  publisher?: string;
  releaseDate?: string;
  originalPlatform?: string;
  platforms?: string[];
  genres?: string[];
  tags?: string[];
  themes?: string[];
  synopsis?: string;
  characters?: string[];
  chapters?: string[];
  releases?: VisualNovelRelease[];
  estimatedPlaytimeHours?: number;
  sourceIds?: Record<string, string>;
  sourceUrl?: string;
  coverImageUrl?: string;
  backgroundImageUrls?: string[];
  screenshotUrls?: string[];
  communityRating?: number | null;
  communityVoteCount?: number;
  communityReports?: VisualNovelCommunityReport[];
  installPath?: string;
  executablePath?: string;
  engine?: VisualNovelEngine;
  version?: string;
  language?: string;
  clipboardCapture?: boolean;
}

export interface VisualNovelSourceResult {
  provider: 'vndb';
  providerId: string;
  title: string;
  japaneseTitle: string;
  alternativeTitles: string[];
  developer: string;
  releaseDate: string;
  platforms: string[];
  tags: string[];
  characters: string[];
  synopsis: string;
  estimatedPlaytimeHours: number;
  coverImageUrl: string;
  screenshotUrls: string[];
  communityRating: number | null;
  communityVoteCount: number;
  sourceUrl: string;
  /** Languages the VN is available in (VNDB `languages`), when the source reports them. */
  languages?: string[];
}

export interface VisualNovelSourceDetails {
  provider: 'vndb';
  providerId: string;
  releases: VisualNovelRelease[];
}

export interface VisualNovelProgressPatch {
  status?: VisualNovelStatus;
  currentRouteId?: string;
  currentChapter?: string;
  currentScene?: string;
  completionPct?: number;
  playtimeDeltaSec?: number;
  lastPlayedAt?: number | null;
}

export interface VisualNovelCaptureInput {
  visualNovelId: string;
  kind?: VisualNovelTextKind;
  japanese: string;
  translation?: string;
  speaker?: string;
  routeId?: string;
  chapter?: string;
  scene?: string;
  screenshotPath?: string;
  audioPath?: string;
  source?: VisualNovelTextCapture['source'];
}

export interface VisualNovelCaptureBatchOptions {
  /** JPEG/PNG data URL from Reading Lens. Main persists one shared managed asset. */
  screenshotDataUrl?: string;
}

export interface VisualNovelCapturePatch {
  kind?: VisualNovelTextKind;
  japanese?: string;
  translation?: string;
  speaker?: string;
  routeId?: string;
  chapter?: string;
  scene?: string;
}

export interface VisualNovelRouteInput {
  id?: string;
  name: string;
  character?: string;
  status?: VisualNovelRouteStatus;
  guideNotes?: string;
  endings?: Array<{ id?: string; name: string; achieved?: boolean; notes?: string }>;
}

const clean = (value: unknown, fallback = ''): string => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || fallback;
};
const nonNegative = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};
const stringList = (value: unknown): string[] => (
  Array.isArray(value) ? [...new Set(value.map((item) => clean(item)).filter(Boolean))] : []
);
const stringRecord = (value: unknown): Record<string, string> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, item]) => [clean(key), clean(item)] as const)
      .filter(([key, item]) => key && item),
  );
};

export const DEFAULT_VISUAL_NOVEL_SETTINGS: VisualNovelSettings = {
  websocketEnabled: false,
  websocketUrl: 'ws://localhost:6677',
  localeEmulatorPath: '',
  reader: { opacity: 0.94, fontSize: 20, bounds: null, autoShow: true },
};

function finiteIn(value: unknown, min: number, max: number, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function normalizeBounds(value: unknown): VisualNovelReaderSettings['bounds'] {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const numbers = ['x', 'y', 'width', 'height'].map((key) => Number(raw[key]));
  if (!numbers.every(Number.isFinite)) return null;
  const [x, y, width, height] = numbers.map(Math.round);
  if (width < 240 || height < 120 || width > 4000 || height > 3000) return null;
  return { x, y, width, height };
}

/**
 * Local websocket only — the rule `shared/visualNovelCapture.ts` enforces for
 * the live client, repeated here so a hand-edited database cannot store a
 * remote URL either.
 */
function normalizeWebsocketUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return DEFAULT_VISUAL_NOVEL_SETTINGS.websocketUrl;
  const trimmed = value.trim();
  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
  try {
    const url = new URL(withScheme);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'ws:' && url.protocol !== 'wss:') || !local || url.username || url.password) {
      return DEFAULT_VISUAL_NOVEL_SETTINGS.websocketUrl;
    }
    return `${url.protocol}//${url.host}${url.pathname === '/' ? '' : url.pathname}`;
  } catch {
    return DEFAULT_VISUAL_NOVEL_SETTINGS.websocketUrl;
  }
}

export function normalizeVisualNovelSettings(value: unknown): VisualNovelSettings {
  const raw = value && typeof value === 'object' ? value as Partial<VisualNovelSettings> : {};
  const reader = raw.reader && typeof raw.reader === 'object'
    ? raw.reader as Partial<VisualNovelReaderSettings>
    : {};
  const localeEmulatorPath = clean(raw.localeEmulatorPath);
  return {
    websocketEnabled: raw.websocketEnabled === true,
    websocketUrl: normalizeWebsocketUrl(raw.websocketUrl),
    localeEmulatorPath: /leproc\.exe$/i.test(localeEmulatorPath) ? localeEmulatorPath : '',
    reader: {
      opacity: finiteIn(reader.opacity, 0.35, 1, DEFAULT_VISUAL_NOVEL_SETTINGS.reader.opacity),
      fontSize: Math.round(finiteIn(reader.fontSize, 12, 40, DEFAULT_VISUAL_NOVEL_SETTINGS.reader.fontSize)),
      bounds: normalizeBounds(reader.bounds),
      autoShow: reader.autoShow !== false,
    },
  };
}

/** The settings of a database that may predate them. */
export function visualNovelSettings(
  database: Pick<VisualNovelDatabase, 'settings'> | null | undefined,
): VisualNovelSettings {
  return normalizeVisualNovelSettings(database?.settings);
}

export function updateVisualNovelSettings(
  database: VisualNovelDatabase,
  patch: VisualNovelSettingsPatch,
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  const current = visualNovelSettings(normalized);
  return {
    ...normalized,
    settings: normalizeVisualNovelSettings({
      ...current,
      ...patch,
      reader: { ...current.reader, ...(patch.reader ?? {}) },
    }),
  };
}

export function createEmptyVisualNovelDatabase(): VisualNovelDatabase {
  return {
    version: VISUAL_NOVEL_DATABASE_VERSION,
    entries: [],
    captures: [],
    settings: normalizeVisualNovelSettings(undefined),
  };
}

/**
 * What the engine's label may honestly claim.
 *
 * `supported` used to be printed for Ren'Py, KiriKiri, NScripter and Tyrano,
 * while script import only ever read PLAIN `.rpy/.ks/.txt/.scr/.csv` files —
 * and a shipped KiriKiri game keeps its `.ks` inside `.xp3` archives, a shipped
 * Ren'Py game usually only has compiled `.rpyc`. So no engine is "supported"
 * outright any more:
 *   - `partial` — script import works IF the plain script files are present;
 *   - `manual`  — the scripts live in a proprietary archive this app does not
 *                 (and will not) unpack; a text hooker or OCR is the way in.
 */
export function visualNovelEngineCompatibility(
  engine: VisualNovelEngine,
): VisualNovelEntry['engineCompatibility'] {
  if (engine === 'renpy' || engine === 'kirikiri' || engine === 'nscripter' || engine === 'tyrano') return 'partial';
  if (engine === 'unknown') return 'unknown';
  return 'manual';
}

/**
 * Detects VN engines from a bounded list of relative file names. Each rule is a
 * file the engine's own runtime or packer is known to ship; nothing is opened.
 * Order matters where engines share an extension (`.arc`, `.dat`).
 */
export function detectVisualNovelEngine(files: readonly string[]): VisualNovelEngine {
  const normalized = files.map((file) => file.replace(/\\/g, '/').toLowerCase());
  const has = (pattern: RegExp): boolean => normalized.some((file) => pattern.test(file));
  if (has(/(^|\/)renpy(\/|$)|\.rpyc?$|\.rpa$|(^|\/)script_version\.txt$/)) return 'renpy';
  if (has(/(^|\/)siglusengine[^/]*\.exe$|(^|\/)scene\.pck$|(^|\/)gameexe\.dat$/)) return 'siglus';
  if (has(/(^|\/)bgi\.exe$|(^|\/)bgi\.gdb$|(^|\/)sysgrp\.arc$|(^|\/)data\d{5}\.arc$/)) return 'bgi';
  if (has(/(^|\/)cs2(conf)?\.(exe|dll)$|(^|\/)cs2[^/]*\.exe$|(^|\/)scene\.int$|(^|\/)config\.int$/)) return 'catsystem2';
  if (has(/\.ypf$|(^|\/)yu-?ris[^/]*\.exe$|(^|\/)ysbin(\/|$)/)) return 'yuris';
  if (has(/(^|\/)artemis[^/]*\.exe$|(^|\/)root\.pfs(\.\d{3})?$/)) return 'artemis';
  if (has(/\.xp3$|(^|\/)(krkr|kirikiri)[^/]*\.exe$/)) return 'kirikiri';
  if (has(/(^|\/)(nscript\.dat|nscr_sec\.dat|0\.txt|onscripter[^/]*|arc\.nsa)$/)) return 'nscripter';
  if (has(/(^|\/)tyrano(\/|$)|(^|\/)data\/scenario\/.+\.ks$|(^|\/)tyrano[^/]*\.js$/)) return 'tyrano';
  if (has(/(^|\/)unityplayer\.dll$|(^|\/)gameassembly\.dll$|_data\/globalgamemanagers$/)) return 'unity';
  if (has(/(^|\/)www\/data\/system\.json$|(^|\/)game\.rgss\d+a$|(^|\/)rpg_.*\.dll$/)) return 'rpg-maker';
  return 'unknown';
}

function normalizeRoute(value: unknown): VisualNovelRoute | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VisualNovelRoute>;
  const id = clean(raw.id);
  const name = clean(raw.name);
  if (!id || !name) return null;
  const status = raw.status;
  return {
    id,
    name,
    character: clean(raw.character),
    status: status === 'reading' || status === 'completed' ? status : 'not-started',
    guideNotes: clean(raw.guideNotes),
    endings: Array.isArray(raw.endings)
      ? raw.endings.flatMap((ending) => {
        if (!ending || typeof ending !== 'object') return [];
        const candidate = ending as {
          id?: unknown;
          name?: unknown;
          achieved?: unknown;
          notes?: unknown;
        };
        const endingId = clean(candidate.id);
        const endingName = clean(candidate.name);
        return endingId && endingName
          ? [{
            id: endingId,
            name: endingName,
            achieved: candidate.achieved === true,
            notes: clean(candidate.notes),
          }]
          : [];
      })
      : [],
  };
}

function normalizeCommunityReport(value: unknown): VisualNovelCommunityReport | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VisualNovelCommunityReport>;
  const id = clean(raw.id);
  if (!id) return null;
  const nullableRating = (candidate: unknown, max: number): number | null => {
    if (candidate == null || candidate === '') return null;
    const rating = nonNegative(candidate);
    return Math.min(max, rating);
  };
  return {
    id,
    author: clean(raw.author, 'Anonymous learner'),
    rating: nullableRating(raw.rating, 10),
    difficultyRating: nullableRating(raw.difficultyRating, 5),
    jlptLevel: clean(raw.jlptLevel),
    review: clean(raw.review),
    languageNotes: clean(raw.languageNotes),
    createdAt: nonNegative(raw.createdAt),
    source: raw.source === 'import' ? 'import' : 'local',
  };
}

export function normalizeVisualNovelRelease(value: unknown): VisualNovelRelease | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<VisualNovelRelease>;
  const id = clean(raw.id);
  const title = clean(raw.title);
  if (!id || !title) return null;
  const voiceCoverage = raw.voiceCoverage;
  const releaseType = raw.releaseType;
  return {
    id,
    title,
    releaseDate: clean(raw.releaseDate),
    languages: Array.isArray(raw.languages)
      ? raw.languages.flatMap((value) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
        const language = value as Partial<VisualNovelReleaseLanguage>;
        const code = clean(language.code);
        return code ? [{
          code,
          title: clean(language.title),
          machineTranslated: language.machineTranslated === true,
          main: language.main === true,
        }] : [];
      }).slice(0, 40)
      : [],
    platforms: stringList(raw.platforms),
    publishers: stringList(raw.publishers),
    engine: clean(raw.engine),
    voiceCoverage: voiceCoverage === 'none' || voiceCoverage === 'ero-only'
      || voiceCoverage === 'partial' || voiceCoverage === 'full'
      ? voiceCoverage
      : 'unknown',
    releaseType: releaseType === 'trial' || releaseType === 'partial' || releaseType === 'complete'
      ? releaseType
      : 'unknown',
    official: raw.official === true,
    patch: raw.patch === true,
    freeware: raw.freeware === true,
  };
}

function normalizeEntry(value: unknown): VisualNovelEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VisualNovelEntry>;
  const id = clean(raw.id);
  const title = clean(raw.title);
  if (!id || !title) return null;
  const normalizedEngine: VisualNovelEngine = isVisualNovelEngine(raw.engine) ? raw.engine : 'unknown';
  const status = raw.status;
  return {
    id,
    title,
    japaneseTitle: clean(raw.japaneseTitle),
    englishTitle: clean(raw.englishTitle),
    alternativeTitles: stringList(raw.alternativeTitles),
    developer: clean(raw.developer),
    publisher: clean(raw.publisher),
    releaseDate: clean(raw.releaseDate),
    originalPlatform: clean(raw.originalPlatform),
    platforms: stringList(raw.platforms),
    genres: stringList(raw.genres),
    tags: stringList(raw.tags),
    themes: stringList(raw.themes),
    synopsis: clean(raw.synopsis),
    characters: stringList(raw.characters),
    chapters: stringList(raw.chapters),
    routes: Array.isArray(raw.routes) ? raw.routes.flatMap((route) => {
      const normalized = normalizeRoute(route);
      return normalized ? [normalized] : [];
    }) : [],
    releases: Array.isArray(raw.releases)
      ? raw.releases.flatMap((release) => {
        const normalized = normalizeVisualNovelRelease(release);
        return normalized ? [normalized] : [];
      }).slice(0, 100)
      : [],
    communityReports: Array.isArray(raw.communityReports)
      ? raw.communityReports.flatMap((report) => {
        const normalized = normalizeCommunityReport(report);
        return normalized ? [normalized] : [];
      }).slice(0, 200)
      : [],
    estimatedPlaytimeHours: nonNegative(raw.estimatedPlaytimeHours),
    sourceIds: stringRecord(raw.sourceIds),
    sourceUrl: clean(raw.sourceUrl),
    coverImageUrl: clean(raw.coverImageUrl),
    backgroundImageUrls: stringList(raw.backgroundImageUrls),
    screenshotUrls: stringList(raw.screenshotUrls),
    communityRating: raw.communityRating == null ? null : nonNegative(raw.communityRating),
    communityVoteCount: nonNegative(raw.communityVoteCount),
    installPath: clean(raw.installPath),
    executablePath: clean(raw.executablePath),
    engine: normalizedEngine,
    engineCompatibility: visualNovelEngineCompatibility(normalizedEngine),
    version: clean(raw.version),
    language: clean(raw.language, 'ja'),
    status: status === 'reading' || status === 'completed' || status === 'dropped' || status === 'replaying'
      ? status
      : 'planned',
    currentRouteId: clean(raw.currentRouteId),
    currentChapter: clean(raw.currentChapter),
    currentScene: clean(raw.currentScene),
    completionPct: Math.min(100, nonNegative(raw.completionPct)),
    totalPlaytimeSec: nonNegative(raw.totalPlaytimeSec),
    lastPlayedAt: raw.lastPlayedAt == null ? null : nonNegative(raw.lastPlayedAt),
    clipboardCapture: raw.clipboardCapture !== false,
    createdAt: nonNegative(raw.createdAt),
    updatedAt: nonNegative(raw.updatedAt),
  };
}

function normalizeCapture(value: unknown): VisualNovelTextCapture | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<VisualNovelTextCapture>;
  const id = clean(raw.id);
  const visualNovelId = clean(raw.visualNovelId);
  const japanese = clean(raw.japanese);
  if (!id || !visualNovelId || !japanese) return null;
  const kind = raw.kind;
  const source = raw.source;
  return {
    id,
    visualNovelId,
    kind: kind === 'narration' || kind === 'choice' || kind === 'character-name' || kind === 'system'
      ? kind
      : 'dialogue',
    japanese,
    translation: clean(raw.translation),
    speaker: clean(raw.speaker),
    routeId: clean(raw.routeId),
    chapter: clean(raw.chapter),
    scene: clean(raw.scene),
    screenshotPath: clean(raw.screenshotPath),
    audioPath: clean(raw.audioPath),
    source: source === 'clipboard' || source === 'hook' || source === 'ocr' || source === 'import'
      ? source
      : 'manual',
    capturedAt: nonNegative(raw.capturedAt),
  };
}

export function normalizeVisualNovelDatabase(value: unknown): VisualNovelDatabase {
  if (!value || typeof value !== 'object') return createEmptyVisualNovelDatabase();
  const raw = value as Partial<VisualNovelDatabase>;
  const entries = Array.isArray(raw.entries)
    ? raw.entries.flatMap((entry) => {
      const normalized = normalizeEntry(entry);
      return normalized ? [normalized] : [];
    })
    : [];
  const entryIds = new Set(entries.map((entry) => entry.id));
  const captures = Array.isArray(raw.captures)
    ? raw.captures.flatMap((capture) => {
      const normalized = normalizeCapture(capture);
      return normalized && entryIds.has(normalized.visualNovelId) ? [normalized] : [];
    })
    : [];
  captures.sort((a, b) => b.capturedAt - a.capturedAt);
  return {
    version: VISUAL_NOVEL_DATABASE_VERSION,
    entries: entries.sort((a, b) => b.updatedAt - a.updatedAt),
    captures: captures.slice(0, VISUAL_NOVEL_CAPTURE_LIMIT),
    settings: normalizeVisualNovelSettings(raw.settings),
  };
}

export function createVisualNovelEntry(
  input: VisualNovelCreateInput,
  id: string,
  now = Date.now(),
): VisualNovelEntry {
  const title = clean(input.title);
  if (!title) throw new Error('A visual novel title is required.');
  const engine = input.engine ?? 'unknown';
  return normalizeEntry({
    id,
    title,
    japaneseTitle: input.japaneseTitle,
    englishTitle: input.englishTitle,
    installPath: input.installPath,
    executablePath: input.executablePath,
    engine,
    language: input.language ?? 'ja',
    status: 'planned',
    createdAt: now,
    updatedAt: now,
  }) as VisualNovelEntry;
}

export function upsertVisualNovelEntry(
  database: VisualNovelDatabase,
  entry: VisualNovelEntry,
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  return {
    ...normalized,
    entries: [entry, ...normalized.entries.filter((candidate) => candidate.id !== entry.id)]
      .sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export function updateVisualNovelProgress(
  database: VisualNovelDatabase,
  id: string,
  patch: VisualNovelProgressPatch,
  now = Date.now(),
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  return {
    ...normalized,
    entries: normalized.entries.map((entry) => entry.id === id ? {
      ...entry,
      status: patch.status ?? entry.status,
      currentRouteId: patch.currentRouteId === undefined ? entry.currentRouteId : clean(patch.currentRouteId),
      currentChapter: patch.currentChapter === undefined ? entry.currentChapter : clean(patch.currentChapter),
      currentScene: patch.currentScene === undefined ? entry.currentScene : clean(patch.currentScene),
      completionPct: patch.completionPct === undefined
        ? entry.completionPct
        : Math.min(100, nonNegative(patch.completionPct)),
      totalPlaytimeSec: entry.totalPlaytimeSec + nonNegative(patch.playtimeDeltaSec),
      lastPlayedAt: patch.lastPlayedAt === undefined ? entry.lastPlayedAt : patch.lastPlayedAt,
      updatedAt: now,
    } : entry),
  };
}

export function updateVisualNovelMetadata(
  database: VisualNovelDatabase,
  id: string,
  patch: VisualNovelMetadataPatch,
  now = Date.now(),
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  if (!normalized.entries.some((entry) => entry.id === id)) {
    throw new Error('The visual novel does not exist.');
  }
  return {
    ...normalized,
    entries: normalized.entries.map((entry) => {
      if (entry.id !== id) return entry;
      const title = patch.title === undefined ? entry.title : clean(patch.title);
      if (!title) throw new Error('A visual novel title is required.');
      const engine = patch.engine ?? entry.engine;
      return {
        ...entry,
        title,
        japaneseTitle: patch.japaneseTitle === undefined ? entry.japaneseTitle : clean(patch.japaneseTitle),
        englishTitle: patch.englishTitle === undefined ? entry.englishTitle : clean(patch.englishTitle),
        alternativeTitles: patch.alternativeTitles === undefined ? entry.alternativeTitles : stringList(patch.alternativeTitles),
        developer: patch.developer === undefined ? entry.developer : clean(patch.developer),
        publisher: patch.publisher === undefined ? entry.publisher : clean(patch.publisher),
        releaseDate: patch.releaseDate === undefined ? entry.releaseDate : clean(patch.releaseDate),
        originalPlatform: patch.originalPlatform === undefined
          ? entry.originalPlatform
          : clean(patch.originalPlatform),
        platforms: patch.platforms === undefined ? entry.platforms : stringList(patch.platforms),
        genres: patch.genres === undefined ? entry.genres : stringList(patch.genres),
        tags: patch.tags === undefined ? entry.tags : stringList(patch.tags),
        themes: patch.themes === undefined ? entry.themes : stringList(patch.themes),
        synopsis: patch.synopsis === undefined ? entry.synopsis : clean(patch.synopsis),
        characters: patch.characters === undefined ? entry.characters : stringList(patch.characters),
        chapters: patch.chapters === undefined ? entry.chapters : stringList(patch.chapters),
        releases: patch.releases === undefined
          ? entry.releases
          : patch.releases.flatMap((release) => {
            const normalizedRelease = normalizeVisualNovelRelease(release);
            return normalizedRelease ? [normalizedRelease] : [];
          }).slice(0, 100),
        estimatedPlaytimeHours: patch.estimatedPlaytimeHours === undefined
          ? entry.estimatedPlaytimeHours
          : nonNegative(patch.estimatedPlaytimeHours),
        sourceIds: patch.sourceIds === undefined ? entry.sourceIds : stringRecord(patch.sourceIds),
        sourceUrl: patch.sourceUrl === undefined ? entry.sourceUrl : clean(patch.sourceUrl),
        coverImageUrl: patch.coverImageUrl === undefined ? entry.coverImageUrl : clean(patch.coverImageUrl),
        backgroundImageUrls: patch.backgroundImageUrls === undefined
          ? entry.backgroundImageUrls
          : stringList(patch.backgroundImageUrls),
        screenshotUrls: patch.screenshotUrls === undefined ? entry.screenshotUrls : stringList(patch.screenshotUrls),
        communityRating: patch.communityRating === undefined
          ? entry.communityRating
          : patch.communityRating == null ? null : nonNegative(patch.communityRating),
        communityVoteCount: patch.communityVoteCount === undefined
          ? entry.communityVoteCount
          : nonNegative(patch.communityVoteCount),
        communityReports: patch.communityReports === undefined
          ? entry.communityReports
          : patch.communityReports.flatMap((report) => {
            const normalizedReport = normalizeCommunityReport(report);
            return normalizedReport ? [normalizedReport] : [];
          }).slice(0, 200),
        installPath: patch.installPath === undefined ? entry.installPath : clean(patch.installPath),
        executablePath: patch.executablePath === undefined ? entry.executablePath : clean(patch.executablePath),
        engine,
        engineCompatibility: visualNovelEngineCompatibility(engine),
        version: patch.version === undefined ? entry.version : clean(patch.version),
        language: patch.language === undefined ? entry.language : clean(patch.language, 'ja'),
        clipboardCapture: patch.clipboardCapture === undefined
          ? entry.clipboardCapture
          : patch.clipboardCapture !== false,
        updatedAt: now,
      };
    }).sort((a, b) => b.updatedAt - a.updatedAt),
  };
}

export function updateVisualNovelRoutes(
  database: VisualNovelDatabase,
  id: string,
  routes: VisualNovelRouteInput[],
  now = Date.now(),
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  const entry = normalized.entries.find((candidate) => candidate.id === id);
  if (!entry) throw new Error('The visual novel does not exist.');
  const normalizedRoutes = routes.flatMap((route, routeIndex) => {
    const routeId = clean(route.id, `route-${routeIndex + 1}`);
    const normalizedRoute = normalizeRoute({
      ...route,
      id: routeId,
      endings: (route.endings ?? []).map((ending, endingIndex) => ({
        ...ending,
        id: clean(ending.id, `${routeId}-ending-${endingIndex + 1}`),
      })),
    });
    return normalizedRoute ? [normalizedRoute] : [];
  });
  const routeIds = new Set(normalizedRoutes.map((route) => route.id));
  return {
    ...normalized,
    entries: normalized.entries.map((candidate) => candidate.id === id ? {
      ...candidate,
      routes: normalizedRoutes,
      currentRouteId: routeIds.has(candidate.currentRouteId) ? candidate.currentRouteId : '',
      updatedAt: now,
    } : candidate),
  };
}

export function appendVisualNovelCapture(
  database: VisualNovelDatabase,
  input: VisualNovelCaptureInput,
  id: string,
  now = Date.now(),
): VisualNovelDatabase {
  return appendVisualNovelCaptures(database, [input], () => id, now);
}

export function appendVisualNovelCaptures(
  database: VisualNovelDatabase,
  inputs: readonly VisualNovelCaptureInput[],
  createId: () => string,
  now = Date.now(),
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  const entryIds = new Set(normalized.entries.map((entry) => entry.id));
  const existing = new Set(normalized.captures.map((capture) => (
    `${capture.visualNovelId}\u0000${capture.speaker}\u0000${capture.japanese}\u0000${capture.scene}`
  )));
  const captures: VisualNovelTextCapture[] = [];
  for (const [index, input] of inputs.entries()) {
    if (!entryIds.has(input.visualNovelId)) {
      throw new Error('The visual novel does not exist.');
    }
    const capture = normalizeCapture({
      ...input,
      id: createId(),
      capturedAt: now + index,
    });
    if (!capture) continue;
    const key = `${capture.visualNovelId}\u0000${capture.speaker}\u0000${capture.japanese}\u0000${capture.scene}`;
    if (existing.has(key)) continue;
    existing.add(key);
    captures.push(capture);
  }
  if (inputs.length && !captures.length && !inputs.some((input) => clean(input.japanese))) {
    throw new Error('Japanese capture text is required.');
  }
  return {
    ...normalized,
    captures: [...captures.reverse(), ...normalized.captures].slice(0, VISUAL_NOVEL_CAPTURE_LIMIT),
  };
}

export function updateVisualNovelCapture(
  database: VisualNovelDatabase,
  id: string,
  patch: VisualNovelCapturePatch,
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  const existing = normalized.captures.find((capture) => capture.id === id);
  if (!existing) throw new Error('The captured line does not exist.');
  const updated = normalizeCapture({
    ...existing,
    ...patch,
    id: existing.id,
    visualNovelId: existing.visualNovelId,
    source: existing.source,
    capturedAt: existing.capturedAt,
  });
  if (!updated) throw new Error('Japanese capture text is required.');
  return {
    ...normalized,
    captures: normalized.captures.map((capture) => capture.id === id ? updated : capture),
  };
}

export function removeVisualNovelCapture(
  database: VisualNovelDatabase,
  id: string,
): VisualNovelDatabase {
  const normalized = normalizeVisualNovelDatabase(database);
  return {
    ...normalized,
    captures: normalized.captures.filter((capture) => capture.id !== id),
  };
}

export function capturesForVisualNovel(
  database: VisualNovelDatabase,
  visualNovelId: string,
): VisualNovelTextCapture[] {
  return database.captures
    .filter((capture) => capture.visualNovelId === visualNovelId)
    .sort((a, b) => a.capturedAt - b.capturedAt);
}

const portablePathKey = (value: string): string => clean(value).replace(/\\/g, '/').toLowerCase();

export function mergeVisualNovelDatabases(
  current: VisualNovelDatabase,
  imported: VisualNovelDatabase,
  createId: () => string,
): VisualNovelDatabase {
  const base = normalizeVisualNovelDatabase(current);
  const source = normalizeVisualNovelDatabase(imported);
  const entries = [...base.entries];
  const captures = [...base.captures];
  const entryIds = new Set(entries.map((entry) => entry.id));
  const captureIds = new Set(captures.map((capture) => capture.id));
  const idMap = new Map<string, string>();

  for (const entry of source.entries) {
    const installKey = portablePathKey(entry.installPath);
    const executableKey = portablePathKey(entry.executablePath);
    const duplicate = entries.find((candidate) => (
      (installKey && portablePathKey(candidate.installPath) === installKey)
      || (executableKey && portablePathKey(candidate.executablePath) === executableKey)
      || (
        candidate.id === entry.id
        && candidate.title === entry.title
        && !installKey
        && !executableKey
      )
    ));
    if (duplicate) {
      idMap.set(entry.id, duplicate.id);
      continue;
    }
    const id = entryIds.has(entry.id) ? createId() : entry.id;
    entryIds.add(id);
    idMap.set(entry.id, id);
    entries.push({ ...entry, id });
  }

  for (const capture of source.captures) {
    const visualNovelId = idMap.get(capture.visualNovelId);
    if (!visualNovelId || !entryIds.has(visualNovelId)) continue;
    const exactDuplicate = captures.some((candidate) => (
      candidate.visualNovelId === visualNovelId
      && candidate.japanese === capture.japanese
      && candidate.capturedAt === capture.capturedAt
      && candidate.speaker === capture.speaker
    ));
    if (exactDuplicate) continue;
    const id = captureIds.has(capture.id) ? createId() : capture.id;
    captureIds.add(id);
    captures.push({ ...capture, id, visualNovelId });
  }

  return normalizeVisualNovelDatabase({
    version: VISUAL_NOVEL_DATABASE_VERSION,
    entries,
    captures,
    settings: base.settings,
  });
}

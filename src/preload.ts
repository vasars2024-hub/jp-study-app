import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { ReadingLensStatus, LensInit, LensOpenMode } from './main/readingLens';
import type { LensOcrResult, RegionRect } from './main/screenOcr';
import type {
  AnkiAddRequest,
  AnkiAddResult,
  AnkiStatus,
  DictResult,
  ExampleResult,
  LibraryItem,
  MediaItem,
  MediaOpen,
  Progress,
  SubtitlePick,
  YouTubeDownloadOptions,
  YomitanDictInfo,
} from './shared/types';
import type {
  YtPlaylist,
  YtPlaylistFolder,
  YtPlaylistSort,
  YtPlaylistsStore,
  YtStudyLang,
  YtSubLang,
} from './shared/ytPlaylists';
import type {
  AnkiLinkStatus,
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,
} from './shared/anki';
import type { DueForecast } from './shared/reviewForecast';
import type { PitchLookup } from './shared/pitchAccent';
import type { ApkgImportResult } from './shared/apkgParse';
import type {
  AiEngineConfig,
  AiDeckGenerationRequest,
  AiEnrichmentRequest,
  AiEnrichmentResult,
  AiLanguageOptions,
  AiMiningCardFormat,
  AiMiningLanguage,
  AiPromptPreset,
  AiProviderId,
  AiProviderKeyBucket,
  EpubDeckExport,
  EpubMiningAnalysis,
  FrequencyDictionarySummary,
  MiningCandidate,
  TraditionalMiningConfig,
} from './shared/mining';
import type { ProfileId, ProfileSnapshot, StudyProfile } from './shared/profiles';
import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
} from './shared/desktop';
import type {
  ImmersionMetricsDelta,
  ImmersionMetricsMap,
  ImmersionSaveSiteInput,
  ImmersionSession,
  ImmersionSite,
  ImmersionSitesStore,
  ImmersionVisitInput,
  ImmersionDayMetrics,
} from './shared/immersion';
import type { AppReleaseInfo } from './shared/release';
import type { AssetError, AssetSpec, AssetStatus } from './shared/assetRegistry';
import type {
  JitenConfig,
  JitenDeck,
  JitenDeckDownloadOptions,
  JitenDeckStats,
  JitenImportDirectRequest,
  JitenImportDirectResult,
  JitenPlanEntry,
  JitenSearchRequest,
  JitenSearchResult,
  JitenSourceProfile,
  JitenStore,
} from './shared/jiten';
import type { CitySessionPacket, CityStateMessage } from './main/city/ipc/channels';

// The single, safe bridge between the sandboxed renderer (React UI) and the
// Electron main process. The UI can only call exactly these functions.
const api = {
  relaunchApp: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:relaunch'),
  launchAutomationBuilder: (): Promise<import('./shared/automationBuilder').AutomationBuilderLaunchResult> =>
    ipcRenderer.invoke('toolbox:launchAutomationBuilder'),
  toolboxPickSearchFolder: (): Promise<string | null> => ipcRenderer.invoke('toolbox:pickSearchFolder'),
  toolboxFileSearch: (
    request: import('./shared/toolboxFileSearch').ToolboxFileSearchRequest,
  ): Promise<import('./shared/toolboxFileSearch').ToolboxFileSearchResponse> =>
    ipcRenderer.invoke('toolbox:fileSearch', request),
  listLibrary: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:list'),
  importFiles: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importFiles'),
  importFolder: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importFolder'),
  removeItem: (id: string): Promise<LibraryItem[]> => ipcRenderer.invoke('library:remove', id),
  getLibraryFolders: (): Promise<string[]> => ipcRenderer.invoke('library:getFolders'),
  setLibraryFolders: (folders: string[]): Promise<{ folders: string[]; items: LibraryItem[] }> =>
    ipcRenderer.invoke('library:setFolders', folders),
  setItemFolder: (id: string, folder: string | null): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:setItemFolder', id, folder),
  setLibraryCover: (id: string, pageRelPath: string): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:setCover', id, pageRelPath),
  /** Absolute path of a File dropped onto the window (File.path was removed). */
  getFilePath: (file: File): string => webUtils.getPathForFile(file),
  importPaths: (paths: string[]): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:importPaths', paths),
  fetchPage: (url: string): Promise<{ ok: boolean; html?: string; url?: string; error?: string }> =>
    ipcRenderer.invoke('net:fetchPage', url),
  extractReadableArticle: (
    url: string,
  ): Promise<{
    ok: boolean;
    title?: string;
    content?: string;
    url?: string;
    meta?: {
      byline?: string | null;
      publishedTime?: string | null;
      excerpt?: string | null;
      siteName?: string | null;
      lang?: string | null;
      dir?: string | null;
    };
    error?: string;
  }> => ipcRenderer.invoke('net:extractReadableArticle', url),
  /** Reading Finder: fetch a candidate's readable content (follows same-text pagination). */
  fetchReadingContent: (
    url: string,
    opts?: { maxPages?: number; followPagination?: boolean },
  ): Promise<{
    ok: boolean;
    title?: string;
    content?: string;
    text?: string;
    url?: string;
    pages?: number;
    partial?: boolean;
    nextPageUrl?: string;
    meta?: {
      byline?: string | null;
      publishedTime?: string | null;
      excerpt?: string | null;
      siteName?: string | null;
      lang?: string | null;
      dir?: string | null;
    };
    error?: string;
  }> => ipcRenderer.invoke('reading:fetchContent', url, opts),
  /** Fetch JSON from the Japanese Wikipedia API (main process, no CORS). */
  fetchJson: (url: string): Promise<{ ok: boolean; data?: unknown; error?: string }> =>
    ipcRenderer.invoke('net:fetchJson', url),
  importGenerated: (payload: {
    title: string;
    html: string;
    source?: string;
  }): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importGenerated', payload),
  updateInboxMeta: (
    id: string,
    patch: Partial<NonNullable<LibraryItem['inboxMeta']>>,
  ): Promise<LibraryItem[]> => ipcRenderer.invoke('library:updateInboxMeta', id, patch),
  updateLevelMeta: (
    id: string,
    patch: NonNullable<LibraryItem['levelMeta']>,
    opts?: { broadcast?: boolean },
  ): Promise<LibraryItem[]> => ipcRenderer.invoke('library:updateLevelMeta', id, patch, opts),
  addMediaPaths: (paths: string[]): Promise<MediaItem[]> =>
    ipcRenderer.invoke('media:addPaths', paths),
  getWallpaper: (): Promise<string | null> => ipcRenderer.invoke('desktop:getWallpaper'),
  pickWallpaper: (): Promise<{
    id: string;
    path: string;
    url: string;
    kind: 'image';
    label: string;
  } | null> => ipcRenderer.invoke('desktop:pickWallpaper'),
  setWallpaperFromPath: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('desktop:setWallpaperFromPath', filePath),
  pickEnvImage: (): Promise<string | null> => ipcRenderer.invoke('desktop:pickEnvImage'),
  pickWallpaperFolder: (): Promise<{ folder: string; images: string[] } | null> =>
    ipcRenderer.invoke('desktop:pickWallpaperFolder'),
  listWallpaperFolder: (folder: string): Promise<string[]> =>
    ipcRenderer.invoke('desktop:listWallpaperFolder', folder),
  imageFileUrl: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('desktop:imageFileUrl', filePath),
  clearWallpaper: (): Promise<null> => ipcRenderer.invoke('desktop:clearWallpaper'),
  pickShortcut: (): Promise<{ target: string; name: string; icon: string } | null> =>
    ipcRenderer.invoke('desktop:pickShortcut'),
  launchTarget: (target: string): Promise<string | null> =>
    ipcRenderer.invoke('desktop:launch', target),
  mediaFileUrl: (p: string): Promise<string | null> => ipcRenderer.invoke('media:fileUrl', p),
  pickWallpaperVideo: (): Promise<{
    id: string;
    path: string;
    url: string;
    kind: 'video';
    label: string;
  } | null> => ipcRenderer.invoke('desktop:pickWallpaperVideo'),
  setProgress: (id: string, progress: Progress): Promise<void> =>
    ipcRenderer.invoke('library:setProgress', id, progress),
  getMangaPages: (id: string): Promise<string[]> => ipcRenderer.invoke('manga:getPages', id),
  /** Read one manga page (by its media:// URL) as a base64 data URL, for OCR. */
  readMangaPage: (mediaUrl: string): Promise<string | null> =>
    ipcRenderer.invoke('manga:readPage', mediaUrl),

  // ----- bulk book OCR (scanned PDF / image archive -> readable EPUB) -----
  bookOcrRun: (
    req: import('./shared/bookOcrIpc').BookOcrRequest,
  ): Promise<import('./shared/bookOcrIpc').BookOcrResult> => ipcRenderer.invoke('bookOcr:run', req),
  bookOcrCancel: (itemId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('bookOcr:cancel', itemId),
  bookOcrStatus: (itemId: string): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('bookOcr:status', itemId),
  onBookOcrProgress: (
    cb: (p: import('./shared/bookOcrIpc').BookOcrProgress) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: import('./shared/bookOcrIpc').BookOcrProgress,
    ): void => cb(p);
    ipcRenderer.on('bookOcr:progress', handler);
    return () => ipcRenderer.removeListener('bookOcr:progress', handler);
  },

  mangaOcrAvailable: (): Promise<boolean> => ipcRenderer.invoke('mangaOcr:available'),
  mangaOcrLoadCache: (
    itemId: string,
    mediaUrl: string,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:loadCache', itemId, mediaUrl),
  mangaOcrScanPage: (
    req: import('./shared/mangaOcrIpc').MangaOcrScanRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage> => ipcRenderer.invoke('mangaOcr:scanPage', req),
  mangaOcrSaveCorrection: (
    req: import('./shared/mangaOcrIpc').MangaOcrCorrectionRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:saveCorrection', req),
  mangaOcrRescanRegion: (
    req: import('./shared/mangaOcrIpc').MangaOcrRegionRescanRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:rescanRegion', req),
  mangaOcrMergeRegions: (
    req: import('./shared/mangaOcrIpc').MangaOcrMergeRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:mergeRegions', req),
  mangaOcrSplitRegion: (
    req: import('./shared/mangaOcrIpc').MangaOcrSplitRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:splitRegion', req),
  mangaOcrAddRegion: (
    req: import('./shared/mangaOcrIpc').MangaOcrAddRegionRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:addRegion', req),
  mangaOcrSaveOrder: (
    req: import('./shared/mangaOcrIpc').MangaOcrOrderRequest,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:saveOrder', req),
  mangaOcrRecognizeImage: (dataUrl: string): Promise<string> =>
    ipcRenderer.invoke('mangaOcr:recognizeImage', dataUrl),
  onMangaOcrProgress: (cb: (p: import('./shared/mangaOcrIpc').MangaOcrProgress) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, p: import('./shared/mangaOcrIpc').MangaOcrProgress) =>
      cb(p);
    ipcRenderer.on('mangaOcr:progress', handler);
    return () => ipcRenderer.removeListener('mangaOcr:progress', handler);
  },
  mangaOcrLoadTranslateCache: (
    itemId: string,
    mediaUrl: string,
    targetLang?: string,
  ): Promise<import('./shared/mokuroTypes').MokuroPage | null> =>
    ipcRenderer.invoke('mangaOcr:loadTranslateCache', itemId, mediaUrl, targetLang ?? 'en'),
  mangaOcrSaveTranslateCache: (
    itemId: string,
    mediaUrl: string,
    targetLang: string,
    page: import('./shared/mokuroTypes').MokuroPage,
  ): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mangaOcr:saveTranslateCache', itemId, mediaUrl, targetLang, page),
  mangaOcrAnalyzeVolume: (
    req: import('./shared/mangaOcrIpc').MangaOcrVolumeRequest,
  ): Promise<{
    ok: boolean;
    cancelled?: boolean;
    error?: string;
    ocrMeta?: import('./shared/types').LibraryItem['ocrMeta'];
  }> => ipcRenderer.invoke('mangaOcr:analyzeVolume', req),
  mangaOcrCancelVolume: (itemId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mangaOcr:cancelVolume', itemId),
  mangaOcrRefreshMeta: (
    itemId: string,
    targetLang?: string,
  ): Promise<import('./shared/types').LibraryItem['ocrMeta'] | null> =>
    ipcRenderer.invoke('mangaOcr:refreshMeta', itemId, targetLang ?? 'en'),
  onMangaOcrVolumeProgress: (
    cb: (p: import('./shared/mangaOcrIpc').MangaOcrVolumeProgress) => void,
  ): (() => void) => {
    const handler = (
      _: Electron.IpcRendererEvent,
      p: import('./shared/mangaOcrIpc').MangaOcrVolumeProgress,
    ) => cb(p);
    ipcRenderer.on('mangaOcr:volumeProgress', handler);
    return () => ipcRenderer.removeListener('mangaOcr:volumeProgress', handler);
  },

  readBook: (id: string): Promise<ArrayBuffer | null> => ipcRenderer.invoke('library:readBook', id),
  /** Plain-text sample from an EPUB (capped) for JLPT/HSK cover level badges. */
  sampleBookText: (id: string, maxChars?: number): Promise<string | null> =>
    ipcRenderer.invoke('library:sampleBookText', id, maxChars),

  // Auto-import (watch) folder
  getWatchFolder: (): Promise<string | null> => ipcRenderer.invoke('config:getWatchFolder'),
  setWatchFolder: (): Promise<{ folder: string | null; items: LibraryItem[] }> =>
    ipcRenderer.invoke('config:setWatchFolder'),
  clearWatchFolder: (): Promise<null> => ipcRenderer.invoke('config:clearWatchFolder'),
  syncLibrary: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:sync'),

  // Dictionary + Anki
  lookupWord: (query: string): Promise<DictResult> => ipcRenderer.invoke('dict:lookup', query),
  /** Merged Yomitan offline lookup with Jisho fallback (Japanese). */
  lookupTerm: (query: string): Promise<DictResult> => ipcRenderer.invoke('dict:lookupTerm', query),
  /** Structured pitch-accent data (downstep positions), for the Blanc pitch panel. */
  dictPitch: (term: string, reading?: string): Promise<PitchLookup> =>
    ipcRenderer.invoke('dict:pitch', term, reading),
  /** Offline-only Yomitan glossary lookup (no Jisho). */
  lookupTermOffline: (query: string): Promise<DictResult> =>
    ipcRenderer.invoke('dict:lookupTermOffline', query),
  lookupTermsBatch: (
    queries: Array<{ expression: string; reading?: string }>,
    langs: string[],
  ): Promise<Record<string, Record<string, string | undefined>>> =>
    ipcRenderer.invoke('dict:lookupTermsBatch', queries, langs),
  /** Find example sentences (JP + EN) for a word or grammar pattern, via Tatoeba. */
  searchExamples: (query: string, limit?: number): Promise<ExampleResult> =>
    ipcRenderer.invoke('examples:search', query, limit),
  examplesOfflineStatus: (): Promise<{ installed: boolean; sentenceCount: number; updatedAt: number }> =>
    ipcRenderer.invoke('examples:offlineStatus'),
  examplesImportOffline: (payload?: {
    sentencesPath?: string;
    linksPath?: string;
  }): Promise<{ ok: boolean; added: number; error?: string }> =>
    ipcRenderer.invoke('examples:importOffline', payload),
  dictImportYomitan: (filePath?: string): Promise<{ ok: boolean; error?: string; info?: YomitanDictInfo }> =>
    ipcRenderer.invoke('dict:importYomitan', filePath),
  /** Parse an Anki .apkg and return its (raw, pre-lemmatization) expressions. */
  importApkg: (filePath?: string): Promise<ApkgImportResult> =>
    ipcRenderer.invoke('apkg:import', filePath),
  dictListYomitan: (): Promise<YomitanDictInfo[]> => ipcRenderer.invoke('dict:listYomitan'),
  dictRemoveYomitan: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:removeYomitan', id),
  dictSetYomitanEnabled: (id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:setYomitanEnabled', id, enabled),
  dictMoveYomitan: (id: string, dir: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:moveYomitan', id, dir),
  /** Set or clear ('' clears) the manual gloss-language override for a dictionary. */
  dictSetYomitanLang: (id: string, lang: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:setYomitanLang', id, lang),
  /** Gloss languages served by the enabled dictionaries (e.g. ['en','ru']). */
  dictAvailableLangs: (): Promise<string[]> => ipcRenderer.invoke('dict:availableLangs'),
  ankiStatus: (): Promise<AnkiStatus> => ipcRenderer.invoke('anki:status'),
  ankiAddNote: (req: AnkiAddRequest): Promise<AnkiAddResult> =>
    ipcRenderer.invoke('anki:addNote', req),
  ankiKnownWords: (): Promise<{ ok: boolean; error?: string; words?: Record<string, number> }> =>
    ipcRenderer.invoke('anki:knownWords'),

  // Study profiles (multi-language)
  profileGet: (): Promise<ProfileSnapshot & { legacyMigrated: boolean }> =>
    ipcRenderer.invoke('profile:get'),
  profileList: (): Promise<StudyProfile[]> => ipcRenderer.invoke('profile:list'),
  profileSwitch: (
    id: ProfileId,
  ): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }> =>
    ipcRenderer.invoke('profile:switch', id),
  profileCreate: (
    name: string,
  ): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }> =>
    ipcRenderer.invoke('profile:create', name),
  profileDelete: (
    id: ProfileId,
  ): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }> =>
    ipcRenderer.invoke('profile:delete', id),
  profileUpdate: (
    id: ProfileId,
    patch: Partial<StudyProfile>,
  ): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }> =>
    ipcRenderer.invoke('profile:update', { id, patch }),
  profileMigrateLegacy: (values: { deck?: string; model?: string }): Promise<ProfileSnapshot> =>
    ipcRenderer.invoke('profile:migrateLegacy', values),
  onProfileChanged: (cb: (snap: ProfileSnapshot) => void): (() => void) => {
    const handler = (_e: unknown, snap: ProfileSnapshot): void => cb(snap);
    ipcRenderer.on('profile:changed', handler);
    return () => ipcRenderer.removeListener('profile:changed', handler);
  },

  // Anki: link status, profile-aware mining, interval sync
  ankiLinkState: (): Promise<AnkiLinkStatus> => ipcRenderer.invoke('anki:linkState'),
  onAnkiLinkChanged: (cb: (s: AnkiLinkStatus) => void): (() => void) => {
    const handler = (_e: unknown, s: AnkiLinkStatus): void => cb(s);
    ipcRenderer.on('anki:linkChanged', handler);
    return () => ipcRenderer.removeListener('anki:linkChanged', handler);
  },
  ankiMineNote: (req: MineNoteRequest): Promise<MineNoteResult> =>
    ipcRenderer.invoke('anki:mineNote', req),
  ankiDeleteNotes: (noteIds: number[]): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('anki:deleteNotes', noteIds),
  ankiEnsureModel: (id?: ProfileId): Promise<EnsureModelResult> =>
    ipcRenderer.invoke('anki:ensureModel', id),
  /** Ordered field names of a note type (for the field-mapping editor). */
  ankiModelFields: (
    modelName: string,
  ): Promise<{ ok: boolean; fields: string[]; error?: string }> =>
    ipcRenderer.invoke('anki:modelFields', modelName),
  ankiGetIntervals: (opts?: { maxAgeMs?: number }): Promise<IntervalSnapshot> =>
    ipcRenderer.invoke('anki:getIntervals', opts),
  /** Read-only week-ahead due counts from Anki's own scheduler. */
  ankiDueForecast: (): Promise<DueForecast> => ipcRenderer.invoke('anki:dueForecast'),
  onAnkiIntervalsChanged: (cb: (s: IntervalSnapshot) => void): (() => void) => {
    const handler = (_e: unknown, s: IntervalSnapshot): void => cb(s);
    ipcRenderer.on('anki:intervalsChanged', handler);
    return () => ipcRenderer.removeListener('anki:intervalsChanged', handler);
  },

  // Dual-desktop layout + Noctis civilization module
  desktopGetLayout: (): Promise<DesktopLayoutSnapshot> => ipcRenderer.invoke('desktop:getLayout'),
  desktopCommitLayout: (
    desktopIndex: DesktopIndex,
    layout: DesktopLayout,
  ): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('desktop:commitLayout', { desktopIndex, layout }),
  desktopSwitch: (
    targetIndex: DesktopIndex,
  ): Promise<{ ok: boolean; error?: string; snapshot: DesktopLayoutSnapshot }> =>
    ipcRenderer.invoke('desktop:switch', { targetIndex }),
  desktopMigrateLegacy: (values: {
    wins?: unknown;
    icons?: unknown;
    notes?: unknown;
    wall?: unknown;
  }): Promise<DesktopLayoutSnapshot> => ipcRenderer.invoke('desktop:migrateLegacy', values),
  onDesktopChanged: (cb: (snap: DesktopLayoutSnapshot) => void): (() => void) => {
    const handler = (_e: unknown, snap: DesktopLayoutSnapshot): void => cb(snap);
    ipcRenderer.on('desktop:changed', handler);
    return () => ipcRenderer.removeListener('desktop:changed', handler);
  },

  // Pop an app out into its own borderless OS window (same app, second window).
  // The main process dedupes by section â€” calling this again for an already-open
  // section just focuses that window instead of opening a duplicate.
  popOut: (section: string): Promise<void> => ipcRenderer.invoke('popout:open', section),
  /** Sections currently open in their own pop-out window. */
  popoutListOpen: (): Promise<string[]> => ipcRenderer.invoke('popout:listOpen'),
  /** Subscribe to the set of popped-out sections changing (open/close anywhere). */
  onPopoutChanged: (cb: (sections: string[]) => void): (() => void) => {
    const handler = (_e: unknown, sections: string[]): void => cb(sections);
    ipcRenderer.on('popout:changed', handler);
    return () => ipcRenderer.removeListener('popout:changed', handler);
  },
  /** Control the calling pop-out window (its custom min/max/close buttons). */
  popoutControl: (action: 'minimize' | 'maximize' | 'close'): Promise<void> =>
    ipcRenderer.invoke('popout:control', action),

  /** Floating Mini Widget Mode â€” borderless transparent always-on-top craft window. */
  miniOpen: (size?: { width?: number; height?: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mini:open', size),
  miniClose: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('mini:close'),
  miniSetSize: (size: { width: number; height: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mini:setSize', size),
  miniIsOpen: (): Promise<boolean> => ipcRenderer.invoke('mini:isOpen'),
  miniFocusMain: (): Promise<void> => ipcRenderer.invoke('mini:focusMain'),

  /** Blanc Toolbox Mode: compact side window that runs beside Study OS. */
  blancOpen: (size?: { width?: number; height?: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('blanc:open', size),
  blancClose: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('blanc:close'),
  blancIsOpen: (): Promise<boolean> => ipcRenderer.invoke('blanc:isOpen'),
  blancSetFullScreen: (on: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('blanc:setFullScreen', on),
  blancSetGlobalShortcut: (chord: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('blanc:setGlobalShortcut', chord),

  /** Floating lock widget â€” frameless, transparent, no OS shadow. */
  lockscreenOpen: (size?: { width?: number; height?: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('lockscreen:open', size),
  lockscreenUnlock: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('lockscreen:unlock'),
  lockscreenSetSize: (size: { width: number; height: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('lockscreen:setSize', size),
  lockscreenIsOpen: (): Promise<boolean> => ipcRenderer.invoke('lockscreen:isOpen'),
  onLockscreenUnlocked: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on('lockscreen:unlocked', handler);
    return () => ipcRenderer.removeListener('lockscreen:unlocked', handler);
  },

  // L4 â€” transparent OS companion host over the real desktop
  companionHostSetEnabled: (
    enabled: boolean,
    span?: 'primary' | 'all',
  ): Promise<{ ok: boolean }> => ipcRenderer.invoke('companionHost:setEnabled', enabled, span),
  companionHostSetSpan: (span: 'primary' | 'all'): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('companionHost:setSpan', span),
  companionHostIsOpen: (): Promise<boolean> => ipcRenderer.invoke('companionHost:isOpen'),
  companionHostGetDisplays: (): Promise<
    {
      id: number;
      bounds: { x: number; y: number; width: number; height: number };
      workArea: { x: number; y: number; width: number; height: number };
      primary: boolean;
      scaleFactor: number;
    }[]
  > => ipcRenderer.invoke('companionHost:getDisplays'),
  companionHostGetViewport: (): Promise<{
    span: 'primary' | 'all';
    bounds: { x: number; y: number; width: number; height: number };
    primaryWorkArea: { x: number; y: number; width: number; height: number };
  }> => ipcRenderer.invoke('companionHost:getViewport'),
  companionHostPushState: (state: unknown): void => {
    ipcRenderer.send('companionHost:pushState', state);
  },
  companionHostSetClickThrough: (through: boolean): void => {
    ipcRenderer.send('companionHost:setClickThrough', through);
  },
  companionHostFocusMain: (): Promise<void> => ipcRenderer.invoke('companionHost:focusMain'),
  companionHostRunRoutine: (companionId: string, routineId: string): void => {
    ipcRenderer.send('companionHost:runRoutine', companionId, routineId);
  },
  onCompanionHostState: (cb: (state: unknown) => void): (() => void) => {
    const handler = (_e: unknown, state: unknown): void => cb(state);
    ipcRenderer.on('companionHost:state', handler);
    return () => ipcRenderer.removeListener('companionHost:state', handler);
  },
  onCompanionHostWake: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on('companionHost:wake', handler);
    return () => ipcRenderer.removeListener('companionHost:wake', handler);
  },
  onBuddyRun: (cb: (payload: { companionId: string; routineId: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { companionId: string; routineId: string }): void =>
      cb(payload);
    ipcRenderer.on('buddy:run', handler);
    return () => ipcRenderer.removeListener('buddy:run', handler);
  },
  buddySchedulerSync: (
    entries: Array<{ routineId: string; forType?: string; startHour: number; endHour: number }>,
  ): void => {
    ipcRenderer.send('buddyScheduler:sync', entries);
  },
  onBuddyTrigger: (
    cb: (payload: { routineId: string; forType?: string }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { routineId: string; forType?: string }): void =>
      cb(payload);
    ipcRenderer.on('buddy:trigger', handler);
    return () => ipcRenderer.removeListener('buddy:trigger', handler);
  },

  playerWindowId: (): Promise<number> => ipcRenderer.invoke('player:windowId'),
  playerGetSnapshot: (): Promise<import('./shared/playerSync').PlayerSnapshot | null> =>
    ipcRenderer.invoke('player:getSnapshot'),
  playerPublish: (snap: import('./shared/playerSync').PlayerSnapshot): void => {
    ipcRenderer.send('player:publish', snap);
  },
  playerSendCommand: (cmd: import('./shared/playerSync').PlayerCommand): void => {
    ipcRenderer.send('player:command', cmd);
  },
  onPlayerSync: (cb: (snap: import('./shared/playerSync').PlayerSnapshot) => void): (() => void) => {
    const handler = (_e: unknown, snap: import('./shared/playerSync').PlayerSnapshot): void => cb(snap);
    ipcRenderer.on('player:sync', handler);
    return () => ipcRenderer.removeListener('player:sync', handler);
  },
  onPlayerCommand: (cb: (cmd: import('./shared/playerSync').PlayerCommand) => void): (() => void) => {
    const handler = (_e: unknown, cmd: import('./shared/playerSync').PlayerCommand): void => cb(cmd);
    ipcRenderer.on('player:command', handler);
    return () => ipcRenderer.removeListener('player:command', handler);
  },

  /** Open an http/https link in the system browser. */
  openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('shell:openExternal', url),
  getWindowBorderless: (): Promise<boolean> => ipcRenderer.invoke('shell:getWindowBorderless'),
  setWindowBorderless: (borderless: boolean): Promise<boolean> =>
    ipcRenderer.invoke('shell:setWindowBorderless', borderless),
  getWindowChromeMode: (): Promise<string> => ipcRenderer.invoke('shell:getWindowChromeMode'),
  setWindowChromeMode: (mode: string): Promise<string> =>
    ipcRenderer.invoke('shell:setWindowChromeMode', mode),
  appVersion: (): Promise<string> => ipcRenderer.invoke('app:version'),
  checkAppRelease: (): Promise<AppReleaseInfo | null> => ipcRenderer.invoke('release:check'),

  // Remote Resources catalogue (fetched from GitHub, cached in userData)
  catalogGet: (): Promise<import('./shared/resourcesCatalog').ResourcesCatalog | null> =>
    ipcRenderer.invoke('catalog:get'),
  catalogRefresh: (): Promise<import('./shared/resourcesCatalog').ResourcesCatalog | null> =>
    ipcRenderer.invoke('catalog:refresh'),
  novelsGet: (): Promise<import('./shared/resourcesCatalog').NovelsCatalog | null> =>
    ipcRenderer.invoke('novels:get'),
  novelsRefresh: (): Promise<import('./shared/resourcesCatalog').NovelsCatalog | null> =>
    ipcRenderer.invoke('novels:refresh'),

  // Jiten-backed novel catalogue, source staging, and deck mining
  jitenGetStore: (): Promise<JitenStore> => ipcRenderer.invoke('jiten:getStore'),
  jitenUpdateConfig: (patch: Partial<JitenConfig>): Promise<JitenStore> =>
    ipcRenderer.invoke('jiten:updateConfig', patch),
  jitenSetSourceProfiles: (profiles: JitenSourceProfile[]): Promise<JitenStore> =>
    ipcRenderer.invoke('jiten:setSourceProfiles', profiles),
  jitenSearchDecks: (request: JitenSearchRequest): Promise<JitenSearchResult> =>
    ipcRenderer.invoke('jiten:searchDecks', request),
  jitenGetDeckDetail: (deckId: number): Promise<JitenDeck | null> =>
    ipcRenderer.invoke('jiten:getDeckDetail', deckId),
  jitenGetDeckStats: (deckId: number): Promise<JitenDeckStats | null> =>
    ipcRenderer.invoke('jiten:getDeckStats', deckId),
  jitenPlanFromDeck: (deck: JitenDeck): Promise<JitenPlanEntry | null> =>
    ipcRenderer.invoke('jiten:planFromDeck', deck),
  jitenUpsertPlan: (entry: JitenPlanEntry): Promise<JitenStore> =>
    ipcRenderer.invoke('jiten:upsertPlan', entry),
  jitenUpdatePlan: (id: string, patch: Partial<JitenPlanEntry>): Promise<JitenStore> =>
    ipcRenderer.invoke('jiten:updatePlan', id, patch),
  jitenRemovePlan: (id: string): Promise<JitenStore> =>
    ipcRenderer.invoke('jiten:removePlan', id),
  jitenImportDirectEpub: (input: JitenImportDirectRequest): Promise<JitenImportDirectResult> =>
    ipcRenderer.invoke('jiten:importDirectEpub', input),
  jitenDownloadDeck: (
    deckId: number,
    options?: Partial<JitenDeckDownloadOptions>,
  ): Promise<{ ok: boolean; content?: string; contentType?: string; filename?: string; error?: string }> =>
    ipcRenderer.invoke('jiten:downloadDeck', deckId, options),
  jitenCacheCover: (
    planId: string,
    deckId: number,
    coverUrl: string,
  ): Promise<{ ok: boolean; relPath?: string; error?: string }> =>
    ipcRenderer.invoke('jiten:cacheCover', planId, deckId, coverUrl),

  // Collected tools (saved from the Immersion browser)
  toolsList: (): Promise<import('./shared/collectedTools').CollectedToolsStore> =>
    ipcRenderer.invoke('tools:list'),
  toolsAdd: (
    input: import('./shared/collectedTools').CollectToolInput,
  ): Promise<{
    ok: boolean;
    tool?: import('./shared/collectedTools').CollectedTool;
    duplicate?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('tools:add', input),
  toolsRemove: (
    id: string,
  ): Promise<{ ok: boolean; store?: import('./shared/collectedTools').CollectedToolsStore; error?: string }> =>
    ipcRenderer.invoke('tools:remove', id),
  toolsUpdate: (
    id: string,
    patch: import('./shared/collectedTools').UpdateToolInput,
  ): Promise<{ ok: boolean; tool?: import('./shared/collectedTools').CollectedTool; error?: string }> =>
    ipcRenderer.invoke('tools:update', id, patch),

  // Anonymous download heat-map telemetry
  statsPing: (): Promise<{ ok: boolean; sent: boolean }> => ipcRenderer.invoke('stats:ping'),
  statsCounts: (): Promise<import('./shared/stats').CountryCounts | null> =>
    ipcRenderer.invoke('stats:counts'),

  // Offline translation (Qwen3 in main process)
  translateRun: (req: {
    id: number;
    text: string;
    source: string;
    target: string;
  }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('translate:run', req),
  translateRunBatch: (req: {
    items: Array<{ id: string; text: string; source: string; target: string }>;
  }): Promise<{ ok: boolean; results?: Array<{ id: string; text: string }>; error?: string }> =>
    ipcRenderer.invoke('translate:runBatch', req),
  translateStatus: (): Promise<{ ready: boolean; modelFound: boolean; modelPath: string | null }> =>
    ipcRenderer.invoke('translate:status'),
  // Cloud-LLM linguistic analysis of a completed translation (needs an API key)
  translateAnalyze: (
    req: import('./shared/translateAnalysisCore').TranslateAnalyzeRequest,
  ): Promise<{
    ok: boolean;
    result?: import('./shared/translateAnalysisCore').TranslateAnalysisResult;
    error?: string;
  }> => ipcRenderer.invoke('translate:analyze', req),
  onTranslateModelProgress: (
    cb: (p: { status?: string; file?: string; progress?: number }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: { status?: string; file?: string; progress?: number }): void =>
      cb(p);
    ipcRenderer.on('translate:progress', handler);
    return () => ipcRenderer.removeListener('translate:progress', handler);
  },
  onTranslatePartial: (cb: (p: { id: number; progress: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { id: number; progress: number }): void => cb(p);
    ipcRenderer.on('translate:partial', handler);
    return () => ipcRenderer.removeListener('translate:partial', handler);
  },

  // Media player + media library
  listMedia: (): Promise<MediaItem[]> => ipcRenderer.invoke('media:list'),
  /** Embedded album art of an audio item as a data URL (null = no art). */
  coverArt: (id: string): Promise<string | null> => ipcRenderer.invoke('media:coverArt', id),
  /** Open a file dialog; the chosen file is saved to the media library. */
  pickMedia: (): Promise<MediaOpen | null> => ipcRenderer.invoke('media:pick'),
  /** Re-open a saved library item by id. */
  openMedia: (id: string): Promise<MediaOpen | null> => ipcRenderer.invoke('media:open', id),
  removeMedia: (id: string): Promise<MediaItem[]> => ipcRenderer.invoke('media:remove', id),
  /** Drop library entries whose files no longer exist on disk. */
  pruneMedia: (): Promise<{ removed: number; items: MediaItem[] }> =>
    ipcRenderer.invoke('media:pruneMissing'),
  /** Wipe the media library and cached downloads/conversions (not your source files). */
  clearMediaLibrary: (): Promise<MediaItem[]> => ipcRenderer.invoke('media:clearAll'),
  setMediaPosition: (id: string, sec: number): Promise<void> =>
    ipcRenderer.invoke('media:setPosition', id, sec),
  setMediaSubOffset: (id: string, sec: number): Promise<void> =>
    ipcRenderer.invoke('media:setSubOffset', id, sec),
  /** Decode a file's audio to 16 kHz mono PCM (for Whisper), via ffmpeg. */
  extractAudio: (url: string): Promise<ArrayBuffer> => ipcRenderer.invoke('media:extractAudio', url),
  /** Convert a non-playable file (e.g. MKV) to a playable MP4; returns a new URL. */
  convertMedia: (url: string): Promise<MediaOpen | null> => ipcRenderer.invoke('media:convert', url),
  /** Download a YouTube video (or just its audio) via yt-dlp into the library. */
  downloadYouTube: (url: string, audioOnly?: boolean, options?: YouTubeDownloadOptions): Promise<MediaOpen | { error: string }> =>
    ipcRenderer.invoke('media:youtube', url, audioOnly, options),
  /** Subscribe to yt-dlp download progress. Returns an unsubscribe fn. */
  onYoutubeProgress: (cb: (p: { stage: string; percent: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { stage: string; percent: number }): void => cb(p);
    ipcRenderer.on('media:youtubeProgress', handler);
    return () => ipcRenderer.removeListener('media:youtubeProgress', handler);
  },
  /** Open a file dialog and return the chosen subtitle file's text. */
  pickSubtitle: (): Promise<SubtitlePick | null> => ipcRenderer.invoke('media:pickSubtitle'),
  getMediaWatchFolder: (): Promise<string | null> => ipcRenderer.invoke('media:getWatchFolder'),
  setMediaWatchFolder: (): Promise<{ folder: string | null; items: MediaItem[] }> =>
    ipcRenderer.invoke('media:setWatchFolder'),
  clearMediaWatchFolder: (): Promise<null> => ipcRenderer.invoke('media:clearWatchFolder'),
  /** Subscribe to media-library changes (e.g. from the watch folder). */
  onMediaChanged: (cb: (items: MediaItem[]) => void): (() => void) => {
    const handler = (_e: unknown, items: MediaItem[]): void => cb(items);
    ipcRenderer.on('media:changed', handler);
    return () => ipcRenderer.removeListener('media:changed', handler);
  },

  // YouTube immersion playlists (metadata sync; download is explicit)
  ytList: (): Promise<YtPlaylistsStore> => ipcRenderer.invoke('yt:list'),
  ytSaveFolders: (folders: YtPlaylistFolder[]): Promise<YtPlaylistsStore> =>
    ipcRenderer.invoke('yt:saveFolders', folders),
  ytSaveFolder: (folder: YtPlaylistFolder): Promise<YtPlaylistsStore> =>
    ipcRenderer.invoke('yt:saveFolder', folder),
  ytDeleteFolder: (folderId: string): Promise<YtPlaylistsStore> =>
    ipcRenderer.invoke('yt:deleteFolder', folderId),
  ytAddPlaylist: (
    url: string,
  ): Promise<{ store: YtPlaylistsStore; playlist: YtPlaylist } | { error: string }> =>
    ipcRenderer.invoke('yt:addPlaylist', url),
  ytRefreshPlaylist: (
    playlistId: string,
  ): Promise<{ store: YtPlaylistsStore; playlist: YtPlaylist } | { error: string }> =>
    ipcRenderer.invoke('yt:refreshPlaylist', playlistId),
  ytRemovePlaylist: (playlistId: string): Promise<YtPlaylistsStore> =>
    ipcRenderer.invoke('yt:removePlaylist', playlistId),
  ytSetPlaylistPrefs: (
    playlistId: string,
    prefs: Partial<{
      lang: YtStudyLang;
      preferSubs: YtSubLang[];
      autoUpdate: boolean;
      sortDefault: YtPlaylistSort;
      folderId: string | null;
      title: string;
    }>,
  ): Promise<YtPlaylistsStore | { error: string }> =>
    ipcRenderer.invoke('yt:setPlaylistPrefs', playlistId, prefs),
  ytDownloadVideos: (
    videoIds: string[],
  ): Promise<{
    store: YtPlaylistsStore;
    results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
  }> => ipcRenderer.invoke('yt:downloadVideos', videoIds),
  ytFetchSubsOnly: (
    videoIds: string[],
  ): Promise<{
    store: YtPlaylistsStore;
    results: Array<{ videoId: string; ok: boolean; error?: string }>;
  }> => ipcRenderer.invoke('yt:fetchSubsOnly', videoIds),
  ytMarkTranscribed: (
    youtubeId: string,
    cuesJson: string,
  ): Promise<YtPlaylistsStore | { error: string }> =>
    ipcRenderer.invoke('yt:markTranscribed', youtubeId, cuesJson),
  ytAutoUpdateDue: (): Promise<YtPlaylistsStore> => ipcRenderer.invoke('yt:autoUpdateDue'),
  ytRefreshAll: (): Promise<{
    store: YtPlaylistsStore;
    newVideoIds: string[];
    errors: Array<{ playlistId: string; title: string; error: string }>;
  }> => ipcRenderer.invoke('yt:refreshAll'),
  ytAddToPlanToWatch: (videoIds: string[]): Promise<YtPlaylistsStore> =>
    ipcRenderer.invoke('yt:addToPlanToWatch', videoIds),
  ytRemoveFromPlanToWatch: (videoIds: string[]): Promise<YtPlaylistsStore> =>
    ipcRenderer.invoke('yt:removeFromPlanToWatch', videoIds),
  onYtChanged: (cb: (store: YtPlaylistsStore) => void): (() => void) => {
    const handler = (_e: unknown, store: YtPlaylistsStore): void => cb(store);
    ipcRenderer.on('yt:changed', handler);
    return () => ipcRenderer.removeListener('yt:changed', handler);
  },
  onYtDownloadProgress: (
    cb: (p: { videoId: string; index: number; total: number; stage: string; percent: number }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: { videoId: string; index: number; total: number; stage: string; percent: number },
    ): void => cb(p);
    ipcRenderer.on('yt:downloadProgress', handler);
    return () => ipcRenderer.removeListener('yt:downloadProgress', handler);
  },
  onYtRefreshProgress: (
    cb: (p: {
      playlistId: string;
      index: number;
      total: number;
      stage: string;
      title: string;
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: { playlistId: string; index: number; total: number; stage: string; title: string },
    ): void => cb(p);
    ipcRenderer.on('yt:refreshProgress', handler);
    return () => ipcRenderer.removeListener('yt:refreshProgress', handler);
  },

  /** Subscribe to live library updates from the watch folder. Returns an unsubscribe fn. */
  onLibraryChanged: (cb: (items: LibraryItem[]) => void): (() => void) => {
    const handler = (_e: unknown, items: LibraryItem[]): void => cb(items);
    ipcRenderer.on('library:changed', handler);
    return () => ipcRenderer.removeListener('library:changed', handler);
  },

  // EPUB mining + AI enrichment
  miningGetConfig: (): Promise<TraditionalMiningConfig> => ipcRenderer.invoke('mining:getConfig'),
  miningSetConfig: (config: TraditionalMiningConfig): Promise<TraditionalMiningConfig> =>
    ipcRenderer.invoke('mining:setConfig', config),
  miningListFrequencyDicts: (): Promise<FrequencyDictionarySummary[]> =>
    ipcRenderer.invoke('mining:listFrequencyDicts'),
  miningImportFrequencyDict: (filePath?: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mining:importFrequencyDict', filePath),
  miningRemoveFrequencyDict: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mining:removeFrequencyDict', id),
  miningSetFrequencyEnabled: (id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('mining:setFrequencyEnabled', id, enabled),
  miningAnalyzeEpub: (
    itemId: string,
    config?: Partial<TraditionalMiningConfig>,
  ): Promise<EpubMiningAnalysis> => ipcRenderer.invoke('mining:analyzeEpub', itemId, config),
  miningCancelAnalyze: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('mining:cancelAnalyze'),
  miningEnrichCandidate: (
    candidate: MiningCandidate,
    config?: Partial<TraditionalMiningConfig>,
  ): Promise<MiningCandidate> => ipcRenderer.invoke('mining:enrichCandidate', candidate, config),
  onMiningEnrichProgress: (
    cb: (p: import('../shared/mining').MiningEnrichProgress) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: import('../shared/mining').MiningEnrichProgress): void => cb(p);
    ipcRenderer.on('mining:enrichProgress', handler);
    return () => ipcRenderer.removeListener('mining:enrichProgress', handler);
  },
  miningRenderEpubDeck: (
    analysis: EpubMiningAnalysis,
    config?: Partial<TraditionalMiningConfig>,
  ): Promise<{
    deck: EpubDeckExport;
    enrichedCandidates: MiningCandidate[];
    warnings?: string[];
    cancelled?: boolean;
  }> => ipcRenderer.invoke('mining:renderEpubDeck', analysis, config),
  miningBuildEpubDeck: (
    itemId: string,
    config?: Partial<TraditionalMiningConfig>,
  ): Promise<EpubDeckExport> => ipcRenderer.invoke('mining:buildEpubDeck', itemId, config),
  miningSaveEpubDeckCsv: (
    csv: string,
    title?: string,
  ): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('mining:saveEpubDeckCsv', csv, title),
  miningSaveEpubDeckFile: (
    content: string,
    title?: string,
    ext?: string,
  ): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('mining:saveEpubDeckFile', content, title, ext),
  aiGetConfig: (): Promise<AiEngineConfig> => ipcRenderer.invoke('ai:getConfig'),
  aiSetApiKey: (
    payload: string | { provider?: AiProviderKeyBucket; apiKey?: string },
  ): Promise<{
    ok: boolean;
    apiKeySet: boolean;
    apiKeysSet: { gemini: boolean; deepseek: boolean };
    error?: string;
    savedBucket?: AiProviderKeyBucket;
  }> =>
    ipcRenderer.invoke(
      'ai:setApiKey',
      typeof payload === 'string'
        ? { provider: 'gemini', apiKey: payload }
        : {
            provider: payload.provider ?? 'gemini',
            apiKey: typeof payload.apiKey === 'string' ? payload.apiKey : '',
          },
    ),
  aiSetProvider: (providerId: AiProviderId): Promise<{
    ok: boolean;
    providerId: AiProviderId;
    apiKeySet: boolean;
    apiKeysSet: { gemini: boolean; deepseek: boolean };
  }> => ipcRenderer.invoke('ai:setProvider', providerId),
  aiListPresets: (): Promise<AiPromptPreset[]> => ipcRenderer.invoke('ai:listPresets'),
  aiListFormats: (): Promise<AiMiningCardFormat[]> => ipcRenderer.invoke('ai:listFormats'),
  aiSelectPreset: (presetId: string): Promise<{
    ok: boolean;
    selectedPresetId: string;
    selectedFormatId: string;
    outputFormat: 'anki' | 'csv';
    cardCount: number;
  }> =>
    ipcRenderer.invoke('ai:selectPreset', presetId),
  aiSetFormat: (payload: {
    formatId: string;
    cardCount?: number;
    outputFormat?: 'anki' | 'csv';
  }): Promise<{
    ok: boolean;
    selectedFormatId: string;
    outputFormat: 'anki' | 'csv';
    cardCount: number;
  }> => ipcRenderer.invoke('ai:setFormat', payload),
  aiSetLanguageOptions: (payload: Partial<AiLanguageOptions>): Promise<{
    ok: boolean;
    frontLang: AiMiningLanguage;
    backLang: AiMiningLanguage;
    reverse: boolean;
    backGlossLangs: AiMiningLanguage[];
  }> => ipcRenderer.invoke('ai:setLanguageOptions', payload),
  aiEnrichCard: (req: AiEnrichmentRequest): Promise<AiEnrichmentResult> =>
    ipcRenderer.invoke('ai:enrichCard', req),
  aiGenerateDeck: (req: AiDeckGenerationRequest): Promise<AiEnrichmentResult[]> =>
    ipcRenderer.invoke('ai:generateDeck', req),
  onAiGenerateProgress: (
    cb: (p: import('../shared/mining').AiGenerationProgress) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: import('../shared/mining').AiGenerationProgress): void => cb(p);
    ipcRenderer.on('ai:generateProgress', handler);
    return () => ipcRenderer.removeListener('ai:generateProgress', handler);
  },
  aiSaveCsv: (csv: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('ai:saveCsv', csv),

  // Immersion Browser
  immersionListSites: (): Promise<ImmersionSitesStore> => ipcRenderer.invoke('immersion:listSites'),
  immersionSaveSite: (
    input: ImmersionSaveSiteInput,
  ): Promise<{ ok: boolean; site?: ImmersionSite; error?: string }> =>
    ipcRenderer.invoke('immersion:saveSite', input),
  immersionRemoveSite: (
    id: string,
  ): Promise<{ ok: boolean; store?: ImmersionSitesStore; error?: string }> =>
    ipcRenderer.invoke('immersion:removeSite', id),
  immersionRecordVisit: (
    input: ImmersionVisitInput,
  ): Promise<{ ok: boolean; site?: ImmersionSite; error?: string }> =>
    ipcRenderer.invoke('immersion:recordVisit', input),
  immersionGetSession: (): Promise<ImmersionSession> => ipcRenderer.invoke('immersion:getSession'),
  immersionSetSession: (session: ImmersionSession): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('immersion:setSession', session),
  immersionGetMetrics: (): Promise<{
    dayKey: string;
    today: ImmersionDayMetrics;
    all: ImmersionMetricsMap;
  }> => ipcRenderer.invoke('immersion:getMetrics'),
  immersionBumpMetrics: (
    delta: ImmersionMetricsDelta,
  ): Promise<{ ok: boolean; today: ImmersionDayMetrics }> =>
    ipcRenderer.invoke('immersion:bumpMetrics', delta),
  onImmersionSitesChanged: (cb: (store: ImmersionSitesStore) => void): (() => void) => {
    const handler = (_e: unknown, store: ImmersionSitesStore): void => cb(store);
    ipcRenderer.on('immersion:sitesChanged', handler);
    return () => ipcRenderer.removeListener('immersion:sitesChanged', handler);
  },
  onImmersionMetricsChanged: (
    cb: (p: { dayKey: string; metrics: ImmersionDayMetrics; all: ImmersionMetricsMap }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: { dayKey: string; metrics: ImmersionDayMetrics; all: ImmersionMetricsMap },
    ): void => cb(p);
    ipcRenderer.on('immersion:metricsChanged', handler);
    return () => ipcRenderer.removeListener('immersion:metricsChanged', handler);
  },

  // OS metrics for system widgets
  systemGetMetrics: (): Promise<{
    cpuLoad: number;
    freemem: number;
    totalmem: number;
    platform: string;
    uptime: number;
    battery?: number | null;
    onBattery?: boolean | null;
  }> => ipcRenderer.invoke('system:getMetrics'),
  clipboardReadText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText'),
  logRendererError: (payload: { subsystem?: string; operation?: string; detail?: string }): Promise<void> =>
    ipcRenderer.invoke('diagnostics:logRendererError', payload),

  // System-wide popup dictionary (global hotkey + tray + floating overlay).
  sysDictGetSettings: (): Promise<{
    enabled: boolean;
    hotkey: string;
    supported: boolean;
    registered: boolean;
  }> => ipcRenderer.invoke('sysdict:getSettings'),
  sysDictSetEnabled: (
    enabled: boolean,
  ): Promise<{ enabled: boolean; hotkey: string; supported: boolean; registered: boolean }> =>
    ipcRenderer.invoke('sysdict:setEnabled', enabled),
  sysDictSetHotkey: (
    hotkey: string,
  ): Promise<{
    ok: boolean;
    error?: string;
    status: { enabled: boolean; hotkey: string; supported: boolean; registered: boolean };
  }> => ipcRenderer.invoke('sysdict:setHotkey', hotkey),
  /** The overlay renderer pulls the pending query on mount (avoids a load race). */
  sysDictGetPending: (): Promise<string> => ipcRenderer.invoke('sysdict:getPending'),
  sysDictClose: (): Promise<void> => ipcRenderer.invoke('sysdict:close'),
  sysDictLookupClipboard: (): Promise<void> => ipcRenderer.invoke('sysdict:lookupClipboard'),
  onSysDictQuery: (cb: (query: string) => void): (() => void) => {
    const handler = (_e: unknown, query: string): void => cb(query);
    ipcRenderer.on('sysdict:query', handler);
    return () => ipcRenderer.removeListener('sysdict:query', handler);
  },
  onSysDictSettingsChanged: (
    cb: (status: { enabled: boolean; hotkey: string; supported: boolean; registered: boolean }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      status: { enabled: boolean; hotkey: string; supported: boolean; registered: boolean },
    ): void => cb(status);
    ipcRenderer.on('sysdict:settings-changed', handler);
    return () => ipcRenderer.removeListener('sysdict:settings-changed', handler);
  },

  // Reading Lens — OS-wide screen-region OCR reader (global hotkey + overlay).
  lensGetSettings: (): Promise<ReadingLensStatus> => ipcRenderer.invoke('lens:getSettings'),
  lensSetEnabled: (enabled: boolean): Promise<ReadingLensStatus> =>
    ipcRenderer.invoke('lens:setEnabled', enabled),
  lensSetHotkey: (
    hotkey: string,
  ): Promise<{ ok: boolean; error?: string; status: ReadingLensStatus }> =>
    ipcRenderer.invoke('lens:setHotkey', hotkey),
  /** Open the lens over the display under the cursor. */
  lensOpen: (mode: LensOpenMode = 'select'): Promise<void> => ipcRenderer.invoke('lens:open', mode),
  /** The lens renderer pulls its init (display bounds + mode) on mount. */
  lensGetInit: (): Promise<LensInit | null> => ipcRenderer.invoke('lens:getInit'),
  /** Capture + OCR a region (window-local DIP coords). */
  lensOcr: (
    region: RegionRect & { engine?: 'auto' | 'manga' | 'web' },
  ): Promise<LensOcrResult> => ipcRenderer.invoke('lens:ocr', region),
  /** Toggle pass-through: true = capture the mouse, false = click through to the app below. */
  lensSetInteractive: (interactive: boolean): void => {
    ipcRenderer.send('lens:setInteractive', interactive);
  },
  lensClose: (): Promise<void> => ipcRenderer.invoke('lens:close'),
  onLensOpen: (cb: (init: LensInit) => void): (() => void) => {
    const handler = (_e: unknown, init: LensInit): void => cb(init);
    ipcRenderer.on('lens:open', handler);
    return () => ipcRenderer.removeListener('lens:open', handler);
  },
  onLensSettingsChanged: (cb: (status: ReadingLensStatus) => void): (() => void) => {
    const handler = (_e: unknown, status: ReadingLensStatus): void => cb(status);
    ipcRenderer.on('lens:settings-changed', handler);
    return () => ipcRenderer.removeListener('lens:settings-changed', handler);
  },

  // Downloadable models & dictionaries (Phase 6). Nothing heavy ships in the
  // installer; every consumer checks assetsIsInstalled() before using an asset.
  assetsList: (): Promise<{ assets: AssetSpec[]; statuses: AssetStatus[] }> =>
    ipcRenderer.invoke('assets:list'),
  assetsStart: (id: string): Promise<{ ok: boolean; error?: AssetError }> =>
    ipcRenderer.invoke('assets:start', id),
  assetsPause: (id: string): Promise<void> => ipcRenderer.invoke('assets:pause', id),
  assetsCancel: (id: string): Promise<void> => ipcRenderer.invoke('assets:cancel', id),
  assetsRemove: (id: string): Promise<{ ok: boolean; error?: AssetError }> =>
    ipcRenderer.invoke('assets:remove', id),
  assetsIsInstalled: (id: string): Promise<boolean> => ipcRenderer.invoke('assets:isInstalled', id),
  assetsPath: (id: string): Promise<string | null> => ipcRenderer.invoke('assets:path', id),
  assetsReadText: (id: string): Promise<string | null> => ipcRenderer.invoke('assets:readText', id),
  assetsFreeSpace: (): Promise<number> => ipcRenderer.invoke('assets:freeSpace'),
  assetsRoot: (): Promise<string> => ipcRenderer.invoke('assets:root'),
  onAssetStatus: (cb: (status: AssetStatus) => void): (() => void) => {
    const handler = (_e: unknown, status: AssetStatus): void => cb(status);
    ipcRenderer.on('assets:status', handler);
    return () => ipcRenderer.removeListener('assets:status', handler);
  },
  /** Fired before an asset is deleted so a consumer can drop its handle to the file. */
  onAssetUnload: (cb: (id: string) => void): (() => void) => {
    const handler = (_e: unknown, id: string): void => cb(id);
    ipcRenderer.on('assets:unload', handler);
    return () => ipcRenderer.removeListener('assets:unload', handler);
  },

  // Tells the main process which UI language is active, so native dialog
  // titles/filters (file pickers) aren't stuck in English. See main/i18n.ts.
  // Fire-and-forget: main's handler is a `handle()`, so this must be an
  // `invoke()` call to actually reach it â€” a plain `send()` would silently
  // go nowhere.
  setUiLang: (lang: string): void => {
    void ipcRenderer.invoke('i18n:setLang', lang);
  },

  // Noctis Civilization Module (src/main/city). The renderer holds a
  // read-only mirror of committed civilization state, refreshed by push.
  // recordSession carries the already-interpreted learning input (no raw
  // telemetry, title, or word crosses â€” LEARNING_INTEGRATION.md Section 9).
  cityGetState: (): Promise<CityStateMessage> => ipcRenderer.invoke('city:getState'),
  cityRecordSession: (packet: CitySessionPacket): Promise<CityStateMessage> =>
    ipcRenderer.invoke('city:recordSession', packet),
  onCityChanged: (cb: (message: CityStateMessage) => void): (() => void) => {
    const handler = (_e: unknown, message: CityStateMessage): void => cb(message);
    ipcRenderer.on('city:changed', handler);
    return () => ipcRenderer.removeListener('city:changed', handler);
  },

  // Chrome extension bridge (Phase 9) — loopback HTTP server status / token.
  extensionStatus: (): Promise<{ running: boolean; port: number; token: string; folderPath: string }> =>
    ipcRenderer.invoke('extension:status'),
  extensionRegenerateToken: (): Promise<{ running: boolean; port: number; token: string; folderPath: string }> =>
    ipcRenderer.invoke('extension:regenerateToken'),
  extensionRevealFolder: (): Promise<string | null> => ipcRenderer.invoke('extension:revealFolder'),
  onExtensionMined: (
    cb: (payload: {
      mode: 'word' | 'sentence';
      term: string;
      sentence?: string;
      text: string;
      url?: string;
      title?: string;
      folder?: string;
      audioDataUrl?: string;
      profileId?: string;
      anki: { ok: boolean; noteId?: number; error?: string };
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: {
        mode: 'word' | 'sentence';
        term: string;
        sentence?: string;
        text: string;
        url?: string;
        title?: string;
        folder?: string;
        audioDataUrl?: string;
        profileId?: string;
        anki: { ok: boolean; noteId?: number; error?: string };
      },
    ): void => cb(payload);
    ipcRenderer.on('extension:mined', handler);
    return () => ipcRenderer.removeListener('extension:mined', handler);
  },
  onExtensionTranscribeRequest: (
    cb: (payload: { id: string; pcmBase64: string }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; pcmBase64: string }): void => cb(payload);
    ipcRenderer.on('extension:transcribe-request', handler);
    return () => ipcRenderer.removeListener('extension:transcribe-request', handler);
  },
  replyExtensionTranscribe: (id: string, result: { ok: boolean; text?: string; error?: string }): void => {
    ipcRenderer.send('extension:transcribe-reply', { id, ...result });
  },
  onExtensionClipboardAppend: (
    cb: (payload: { text: string; type?: string; url?: string; title?: string }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: { text: string; type?: string; url?: string; title?: string },
    ): void => cb(payload);
    ipcRenderer.on('extension:clipboard-append', handler);
    return () => ipcRenderer.removeListener('extension:clipboard-append', handler);
  },
  onExtensionUiOpen: (
    cb: (payload: {
      target: string;
      functions?: string | string[];
      level?: string;
      levels?: string[];
      lang?: string;
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: {
        target: string;
        functions?: string | string[];
        level?: string;
        levels?: string[];
        lang?: string;
      },
    ): void => cb(payload);
    ipcRenderer.on('extension:ui-open', handler);
    return () => ipcRenderer.removeListener('extension:ui-open', handler);
  },
  extensionFocusMainAndOpen: (target: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('extension:focus-main-and-open', target),
  onKnownLevelsRequest: (
    cb: (payload: { id: string; terms: string[] }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; terms: string[] }): void => cb(payload);
    ipcRenderer.on('extension:known-levels-request', handler);
    return () => ipcRenderer.removeListener('extension:known-levels-request', handler);
  },
  replyKnownLevels: (id: string, levels: Record<string, number>): void => {
    ipcRenderer.send('extension:known-levels-reply', { id, levels });
  },
  onKnownLevelSet: (
    cb: (payload: { id: string; term: string; level: number }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; term: string; level: number }): void =>
      cb(payload);
    ipcRenderer.on('extension:known-level-set', handler);
    return () => ipcRenderer.removeListener('extension:known-level-set', handler);
  },
  replyKnownLevelSet: (id: string, result: { ok: boolean; error?: string }): void => {
    ipcRenderer.send('extension:known-level-set-reply', { id, ...result });
  },
  onComprehensibilityRequest: (
    cb: (payload: { id: string; text: string }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; text: string }): void => cb(payload);
    ipcRenderer.on('extension:comprehensibility-request', handler);
    return () => ipcRenderer.removeListener('extension:comprehensibility-request', handler);
  },
  replyComprehensibility: (
    id: string,
    result: { ok: boolean; percent?: number; known?: number; total?: number; error?: string },
  ): void => {
    ipcRenderer.send('extension:comprehensibility-reply', { id, ...result });
  },
  onGrammarMatchRequest: (cb: (payload: { id: string; text: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; text: string }): void => cb(payload);
    ipcRenderer.on('extension:grammar-match-request', handler);
    return () => ipcRenderer.removeListener('extension:grammar-match-request', handler);
  },
  replyGrammarMatch: (
    id: string,
    result: {
      ok: boolean;
      matches?: Array<{ id: string; title: string; level: string; meaning: string }>;
      error?: string;
    },
  ): void => {
    ipcRenderer.send('extension:grammar-match-reply', { id, ...result });
  },
  onExtensionTranslationResult: (
    cb: (payload: {
      sourceLang: string;
      targetLang: string;
      sourceText: string;
      resultText: string;
    }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: {
        sourceLang: string;
        targetLang: string;
        sourceText: string;
        resultText: string;
      },
    ): void => cb(payload);
    ipcRenderer.on('extension:translation-result', handler);
    return () => ipcRenderer.removeListener('extension:translation-result', handler);
  },
  onLevelEstimateRequest: (cb: (payload: { id: string; text: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; text: string }): void => cb(payload);
    ipcRenderer.on('extension:level-estimate-request', handler);
    return () => ipcRenderer.removeListener('extension:level-estimate-request', handler);
  },
  replyLevelEstimate: (
    id: string,
    result: {
      ok: boolean;
      badge: string;
      empty?: boolean;
      noLists?: boolean;
      lang?: 'ja' | 'zh' | null;
      scheme?: 'jlpt' | 'hsk' | null;
      label?: string;
      confidence?: number;
      error?: string;
    },
  ): void => {
    ipcRenderer.send('extension:level-estimate-reply', { id, result });
  },
  onClipboardListRequest: (cb: (payload: { id: string }) => void): (() => void) => {
    const handler = (_e: unknown, payload: { id: string }): void => cb(payload);
    ipcRenderer.on('extension:clipboard-list-request', handler);
    return () => ipcRenderer.removeListener('extension:clipboard-list-request', handler);
  },
  replyClipboardList: (
    id: string,
    entries: Array<{ id: string; type: string; text: string; createdAt: number }>,
  ): void => {
    ipcRenderer.send('extension:clipboard-list-reply', { id, entries });
  },
  profileRulesGet: (): Promise<{ schemaVersion: 1; rules: Array<Record<string, unknown>> }> =>
    ipcRenderer.invoke('profileRules:get'),
  profileRulesSet: (
    store: unknown,
  ): Promise<{ schemaVersion: 1; rules: Array<Record<string, unknown>> }> =>
    ipcRenderer.invoke('profileRules:set', store),
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;

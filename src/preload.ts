import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { SCRAPER_CHANNELS } from './shared/scraperIpc';
import { READING_CHANNELS } from './shared/readingIpc';
import {
  SEANIME_CHANNELS,
  type SeanimeConnection,
  type SeanimeProbeResult,
  type SeanimeStatus,
} from './shared/seanime';
import type { SeanimeLibraryFile } from './shared/seanimeStudyLibrary';
import type { FilesIndexSnapshot, FilesLocation } from './shared/filesApp/catalog';
import type { FilesMineSourceResult } from './shared/filesApp/mining';
import type { FilesScanReport } from './shared/filesApp/scan';
import type { ReadingLensStatus, LensInit, LensOpenMode } from './main/readingLens';
import type { ReadingLensCapture } from './shared/readingLens';
import type {
  ReadingLensHistoryEntry,
  ReadingLensHistoryQuery,
  ReadingLensRetentionDays,
} from './shared/readingLensHistory';
import type { ReadingLensEngine, ReadingLensEngineStatus } from './shared/readingLensEngine';
import {
  LEXICON_HANDOFF_CHANNELS,
  type LexiconHandoffRequest,
  type LexiconHandoffTakeRequest,
  type LexiconHandoffStageResult,
  type LexiconHandoffTakeResult,
} from './shared/lexiconHandoff';
import {
  READING_PASSAGE_HANDOFF_CHANNELS,
  type ReadingPassageHandoffRequest,
  type ReadingPassageHandoffStageResult,
  type ReadingPassageHandoffTakeResult,
} from './shared/readingPassageHandoff';
import type { LensOcrResult, RegionRect } from './main/screenOcr';
import type { ReverifyOutcome, AssetIntegrity } from './main/downloads';
import {
  ANIME_SCHEDULE_CHANNEL,
  type AnimeScheduleRequest,
  type AnimeScheduleResponse,
} from './shared/animeSchedule';
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
  DeleteMinedNotesResult,
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,
} from './shared/anki';
import type { DueForecast } from './shared/reviewForecast';
import type { PitchLookup } from './shared/pitchAccent';
import type { LexiconInterlinearOptions, LexiconInterlinearResult } from './shared/lexiconInterlinear';
import type { ApkgImportResult } from './shared/apkgParse';
import type { ApkgCardsResult } from './shared/apkgCards';
import type { ApkgDraftRequest, ApkgDraftResult } from './shared/ankiDraft';
import type { ApkgExportRequest, ApkgExportResult } from './shared/ankiApkgExport';
import type { CsvDraftRequest, CsvDraftResult } from './shared/ankiCsv';
import type { AnkiCsvExportRequest, AnkiCsvExportResult } from './shared/ankiCsvExport';
import type { AiAdditionKind } from './shared/ankiAiAdditions';
import type { AiAdditionsNoteResult, AiAdditionsRunResult } from './shared/ankiAiPrompt';
import type { ConnectDraftRequest, ConnectDraftResult } from './shared/ankiConnectDraft';
import type { ConnectCommitRequest, ConnectCommitResult } from './shared/ankiConnectCommit';
import type {
  AnkiDraftSession,
  AnkiDraftSessionRequest,
  DraftSessionPageReport,
} from './shared/ankiDraftSession';
import type { DraftSessionSummary as AnkiDraftSessionSummary } from './main/anki/draftSessionStore';
import type {
  AiEngineConfig,
  AiEngineKind,
  AiDeckGenerationRequest,
  AiEnrichmentRequest,
  AiEnrichmentResult,
  AiLanguageOptions,
  AiMiningCardFormat,
  AiMiningLanguage,
  AiPromptPreset,
  AiProviderId,
  AiProviderKeyBucket,
  AiProviderHealth,
  EpubDeckExport,
  EpubMiningAnalysis,
  FrequencyDictionarySummary,
  MiningCandidate,
  TraditionalMiningConfig,
} from './shared/mining';
import type { LocalAgentModelInfo, LocalAgentPlanRequest, LocalAgentPlanResponse, LocalAgentRuntimeStatus } from './shared/localAgentRuntime';
import type { AgentAutomation } from './shared/localAgentAutomation';
import type {
  AgentAutomationRunFailureReport,
  AgentAutomationRunReportResult,
} from './shared/localAgentAutomationRuns';
import type {
  AgentExecutionEvent,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentExecutionCancelResult,
} from './shared/agentExecutionBridge';
import type {
  AgentNavigationRequest,
  AgentNavigationResult,
} from './shared/agentNavigationBridge';
import { AGENT_IMAGE_STAGING_CHANNELS } from './shared/agentImageStaging';
import type {
  AgentImageStageRequest,
  AgentImageStageResult,
  AgentImageTakeResult,
} from './shared/agentImageStaging';
import { AGENT_CARD_BATCH_STAGING_CHANNELS } from './shared/agentCardBatchStaging';
import type {
  AgentCardBatchStageRequest,
  AgentCardBatchStageResult,
  AgentCardBatchTakeResult,
} from './shared/agentCardBatchStaging';
import type { AgentWorkspaceState } from './shared/agentWorkspace';
import type { AgentWorkspaceResult } from './shared/agentWorkspaceBridge';
import type {
  AgentOperationalState,
  LegacyAgentOperationalPayload,
} from './shared/agentOperationalState';
import type { AgentOperationalResult } from './shared/agentOperationalBridge';
import type {
  AgentSpendResult,
  AgentSpendSnapshotPayload,
} from './shared/agentSpendBridge';
import type {
  AgentExecutionLeaseAcquireRequest,
  AgentExecutionLeaseAcquireResult,
  AgentExecutionLeaseCommitRequest,
  AgentExecutionLeaseCommitResult,
  AgentExecutionLeaseReleaseResult,
  AgentExecutionLeaseRenewResult,
  AgentExecutionLeaseTokenRequest,
  AgentExecutionLeaseRecoverRequest,
  AgentExecutionLeaseRecoverResult,
} from './shared/agentExecutionLeaseBridge';
import type {
  StudyAnalysisRequest,
  StudyAnkiExportResult,
  StudyAnkiPreview,
  StudyAnkiUndoResult,
  StudyOpportunity,
  StudyOpportunityStatus,
  StudyOrchestratorDocument,
  StudyLookupPackRequest,
  StudyLookupPackResult,
  StudyPreparationResult,
  StudyTranscriptionQueueResult,
  StudyVocabularyCandidate,
  StudyVocabularyFilters,
  StudyVocabularyWorkspace,
} from './shared/mediaStudyOrchestrator';
import type { ProfileId, ProfileSnapshot, StudyProfile } from './shared/profiles';
import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
  DisplayAssignment,
} from './shared/desktop';
import type { DisplaySummary } from './main/displays';
import type { DeskWindowInfo } from './main/desktopWindows';
import type { DeskDragKind } from './main/deskDrag';
import type { DropPlan } from './main/fileRouter';
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

// The single, safe bridge between the sandboxed renderer (React UI) and the
// Electron main process. The UI can only call exactly these functions.
const api = {
  relaunchApp: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:relaunch'),
  launchAutomationBuilder: (): Promise<import('./shared/automationBuilder').AutomationBuilderLaunchResult> =>
    ipcRenderer.invoke('toolbox:launchAutomationBuilder'),
  // Resolved from this install, not a constant. Null when the script is absent.
  automationBuilderCommand: (): Promise<string | null> =>
    ipcRenderer.invoke('toolbox:automationBuilderCommand'),
  toolboxPickSearchFolder: (): Promise<string | null> => ipcRenderer.invoke('toolbox:pickSearchFolder'),
  toolboxFileSearch: (
    request: import('./shared/toolboxFileSearch').ToolboxFileSearchRequest,
  ): Promise<import('./shared/toolboxFileSearch').ToolboxFileSearchResponse> =>
    ipcRenderer.invoke('toolbox:fileSearch', request),
  listLibrary: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:list'),
  importFiles: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importFiles'),
  importArchivePath: (
    filePath: string,
  ): Promise<{ ok: boolean; item?: LibraryItem; alreadyPresent?: boolean; error?: string }> =>
    ipcRenderer.invoke('library:importArchivePath', filePath),
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
  /** Bring a finished download into the library — see `media:addAcquired`. */
  addAcquiredMedia: (target: string): Promise<import('./shared/types').MediaAcquiredImport> =>
    ipcRenderer.invoke('media:addAcquired', target),
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
  /**
   * Merged Yomitan offline lookup with Jisho fallback (Japanese).
   *
   * `limit` is the page size, defaulting to eight and clamped in main. A result
   * that carries `truncated` had more matches than that, and asking again with a
   * larger limit is the only way to reach them.
   */
  lookupTerm: (query: string, limit?: number): Promise<DictResult> =>
    ipcRenderer.invoke('dict:lookupTerm', query, limit),
  /**
   * Chinese lookup — the dictionary database first, CC-CEDICT second. Replaces
   * `renderer/chineseDict.ts`, which parsed 9.4 MB of CC-CEDICT on the UI thread.
   */
  lookupChinese: (query: string, limit?: number): Promise<DictResult> =>
    ipcRenderer.invoke('dict:lookupChinese', query, limit),
  /** Drop main's cached CC-CEDICT index after a managed install finishes. */
  resetChineseDictCache: (): Promise<void> => ipcRenderer.invoke('dict:resetChineseCache'),
  /** Structured pitch-accent data (downstep positions), for the Blanc pitch panel. */
  dictPitch: (term: string, reading?: string): Promise<PitchLookup> =>
    ipcRenderer.invoke('dict:pitch', term, reading),
  /** Offline-only Yomitan glossary lookup (no Jisho). */
  lookupTermOffline: (query: string): Promise<DictResult> =>
    ipcRenderer.invoke('dict:lookupTermOffline', query),
  /** Offline segmentation and grounded glossary rows for the Lexicon Workbench. */
  lookupOfflineInterlinear: (
    text: string,
    options?: LexiconInterlinearOptions,
  ): Promise<LexiconInterlinearResult> =>
    ipcRenderer.invoke('dict:lookupOfflineInterlinear', text, options),
  lookupTermsBatch: (
    queries: Array<{ expression: string; reading?: string }>,
    langs: string[],
  ): Promise<Record<string, Record<string, string | undefined>>> =>
    ipcRenderer.invoke('dict:lookupTermsBatch', queries, langs),
  /** Words that literally share a gloss with this one, from the unified database. */
  dictSemanticNeighbors: (
    text: string,
    options?: { sourceLangs?: string[]; glossLangs?: string[] },
  ): Promise<import('./shared/lexiconNeighbors').LexiconNeighborResult> =>
    ipcRenderer.invoke('dict:semanticNeighbors', text, options),
  /** Words whose written form contains this one, from the unified database. */
  dictCompounds: (
    text: string,
    options?: { sourceLangs?: string[]; glossLangs?: string[] },
  ): Promise<import('./shared/lexiconCompounds').LexiconCompoundResult> =>
    ipcRenderer.invoke('dict:compounds', text, options),
  /** Phrases where this word is joined to another word by a particle. */
  dictCollocations: (
    text: string,
    options?: { sourceLangs?: string[]; glossLangs?: string[] },
  ): Promise<import('./shared/lexiconCollocations').LexiconCollocationResult> =>
    ipcRenderer.invoke('dict:collocations', text, options),
  /** Sentences from an installed example corpus that contain this word. */
  dictExamples: (
    text: string,
    options?: { sourceLangs?: string[]; glossLangs?: string[] },
  ): Promise<import('./shared/lexiconExamples').LexiconExampleResult> =>
    ipcRenderer.invoke('dict:examples', text, options),
  /** What the installed dictionaries say about where this word came from. */
  dictEtymology: (
    text: string,
    options?: { sourceLangs?: string[] },
  ): Promise<import('./shared/lexiconEtymology').LexiconEtymologyResult> =>
    ipcRenderer.invoke('dict:etymology', text, options),
  /** How common a word is, in the frequency corpora this install has. */
  dictFrequency: (
    text: string,
    options?: { sourceLangs?: string[] },
  ): Promise<import('./shared/lexiconFrequency').LexiconFrequencyResult> =>
    ipcRenderer.invoke('dict:frequency', text, options),
  /**
   * Best rank for many words at once, for a whole page of Deck Workbench notes.
   * A word no enabled corpus ranks is **absent** from the result rather than 0.
   */
  dictFrequencyRanks: (
    texts: string[],
    options?: { sourceLangs?: string[] },
  ): Promise<Record<string, number>> =>
    ipcRenderer.invoke('dict:frequencyRanks', texts, options),
  /**
   * Offline dictionary hits for a whole deck selection, for the Deck Workbench's
   * enrichment. A word nothing answered for is absent, never an empty array.
   */
  dictEnrichTerms: (
    terms: string[],
  ): Promise<Record<string, import('./shared/ankiEnrich').EnrichEntry[]>> =>
    ipcRenderer.invoke('dict:enrichTerms', terms),
  /** The words the installed dictionaries point at from this word's senses. */
  dictXrefs: (
    text: string,
    options?: { sourceLangs?: string[] },
  ): Promise<import('./shared/lexiconXrefs').LexiconXrefResult> =>
    ipcRenderer.invoke('dict:xrefs', text, options),
  /** A word's native pronunciation, from the disk cache or, on a click, the provider. */
  dictAudio: (
    request: { lang: string; term: string; reading?: string; cacheOnly?: boolean },
  ): Promise<import('./shared/lexiconAudio').LexiconAudioResult> =>
    ipcRenderer.invoke('dict:audio', request),
  /** Every form of a conjugable Japanese word, from IPADIC's own class table. */
  dictConjugation: (
    word: string,
  ): Promise<import('./shared/conjugationClass').ConjugationAnalysis> =>
    ipcRenderer.invoke('dict:conjugation', word),
  /** The user's own note on a word, keyed on the word rather than a dictionary row. */
  dictNoteGet: (
    identity: import('./shared/lexiconNotes').LexiconNoteIdentity,
  ): Promise<import('./shared/lexiconNotes').LexiconNote | null> =>
    ipcRenderer.invoke('dict:noteGet', identity),
  dictNoteSet: (
    identity: import('./shared/lexiconNotes').LexiconNoteIdentity,
    input: import('./shared/lexiconNotes').LexiconNoteInput,
  ): Promise<{ ok: boolean; note: import('./shared/lexiconNotes').LexiconNote | null }> =>
    ipcRenderer.invoke('dict:noteSet', identity, input),
  /** One page of every note the user has written, newest first. */
  dictNoteList: (
    query?: Partial<import('./shared/lexiconNotes').LexiconNoteListQuery>,
  ): Promise<import('./shared/lexiconNotes').LexiconNoteListResult> =>
    ipcRenderer.invoke('dict:noteList', query),
  /**
   * The stored explanation of a word, keyed on the word plus the prose language,
   * the model and the prompt version. `null` means nothing is cached, which is
   * also what an un-migrated installation answers.
   */
  dictExplanationGet: (
    key: import('./shared/lexiconExplanations').LexiconExplanationKey,
  ): Promise<import('./shared/lexiconExplanations').LexiconExplanation | null> =>
    ipcRenderer.invoke('dict:explanationGet', key),
  dictExplanationSet: (
    key: import('./shared/lexiconExplanations').LexiconExplanationKey,
    input: import('./shared/lexiconExplanations').LexiconExplanationInput,
  ): Promise<{ ok: boolean; explanation: import('./shared/lexiconExplanations').LexiconExplanation | null }> =>
    ipcRenderer.invoke('dict:explanationSet', key, input),
  /**
   * Explain one word: the stored answer, or one model call whose reply is stored.
   * The `model` half of the cache key is derived from `policy`, not sent.
   */
  dictExplain: (
    request: {
      key: import('./shared/lexiconExplanations').LexiconExplanationIdentity & { glossLang: string };
      grounding: import('./shared/lexiconExplainPrompt').LexiconExplainGrounding;
      policy: import('./shared/agentWorkspace').AgentProviderPolicy;
      refresh?: boolean;
    },
  ): Promise<import('./main/dictionary/explainRun').LexiconExplainResult> =>
    ipcRenderer.invoke('dict:explain', request),
  /** Forget this word's explanations across every prose language, model and version. */
  dictExplanationClear: (
    identity: import('./shared/lexiconExplanations').LexiconExplanationIdentity,
  ): Promise<{ ok: boolean; removed: number }> =>
    ipcRenderer.invoke('dict:explanationClear', identity),
  /** Write every note matching this scope to a CSV file the user picks. */
  dictNoteExport: (
    query?: Partial<import('./shared/lexiconNotes').LexiconNoteExportQuery>,
  ): Promise<import('./shared/lexiconNotes').LexiconNoteExportResult> =>
    ipcRenderer.invoke('dict:noteExport', query),
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
  /** Parse an Anki .apkg into whole study cards (word/reading/meaning/sentence). */
  importApkgCards: (filePath?: string): Promise<ApkgCardsResult> =>
    ipcRenderer.invoke('apkg:importCards', filePath),
  /** One page of an .apkg read as a full-fidelity workbench draft. */
  readApkgDraft: (request?: ApkgDraftRequest): Promise<ApkgDraftResult> =>
    ipcRenderer.invoke('apkg:readDraft', request),
  /**
   * Abandon an in-flight package read by the `readId` it was started with.
   * Resolves `false` when no read is running under that token — already
   * finished, or never started — which is an answer, not a failure.
   */
  cancelApkgDraftRead: (readId: string): Promise<boolean> =>
    ipcRenderer.invoke('apkg:cancelDraftRead', readId),
  /** Write the workbench's net change set into a NEW .apkg beside the source. */
  exportApkgDraft: (request: ApkgExportRequest): Promise<ApkgExportResult> =>
    ipcRenderer.invoke('apkg:export', request),
  /** One page of an Anki CSV/TSV text export read as a workbench draft. */
  readAnkiCsvDraft: (request?: CsvDraftRequest): Promise<CsvDraftResult> =>
    ipcRenderer.invoke('anki:readCsvDraft', request),
  /** Write the workbench's net change set into a NEW .txt/.csv beside the source. */
  exportAnkiCsvDraft: (request: AnkiCsvExportRequest): Promise<AnkiCsvExportResult> =>
    ipcRenderer.invoke('anki:exportCsvDraft', request),
  /** One page of the live Anki collection read as a workbench draft. Read-only. */
  readAnkiConnectDraft: (request?: ConnectDraftRequest): Promise<ConnectDraftResult> =>
    ipcRenderer.invoke('anki:readConnectDraft', request),
  /** Write the workbench's net change set into the live Anki collection. */
  commitAnkiConnectDraft: (request: ConnectCommitRequest): Promise<ConnectCommitResult> =>
    ipcRenderer.invoke('anki:commitConnectDraft', request),
  /**
   * Stop an in-flight live commit after its current write, by the `commitId` it
   * was started with. Resolves `false` when nothing is running under that token.
   * The writes already sent stay written — this transport cannot roll back.
   */
  cancelAnkiConnectCommit: (commitId: string): Promise<boolean> =>
    ipcRenderer.invoke('anki:cancelConnectCommit', commitId),
  /** Resumable draft sessions. `complete` is never something a caller may set. */
  ankiDraftSessionList: (): Promise<AnkiDraftSessionSummary[]> =>
    ipcRenderer.invoke('anki:draftSessionList'),
  ankiDraftSessionBegin: (request: {
    sourceKind: import('./shared/ankiDraft').AnkiDraftSourceKind;
    label: string;
    request: AnkiDraftSessionRequest;
    fingerprint?: string;
  }): Promise<AnkiDraftSession> => ipcRenderer.invoke('anki:draftSessionBegin', request),
  ankiDraftSessionRecordPage: (
    id: string,
    page: DraftSessionPageReport,
  ): Promise<AnkiDraftSession | null> =>
    ipcRenderer.invoke('anki:draftSessionRecordPage', id, page),
  ankiDraftSessionCancel: (id: string): Promise<AnkiDraftSession | null> =>
    ipcRenderer.invoke('anki:draftSessionCancel', id),
  ankiDraftSessionFail: (id: string, error: string): Promise<AnkiDraftSession | null> =>
    ipcRenderer.invoke('anki:draftSessionFail', id, error),
  /** Pass the source's live fingerprint; a mismatch answers `source-changed`. */
  ankiDraftSessionResume: (
    id: string,
    fingerprint?: string,
  ): Promise<import('./main/anki/draftSessionStore').DraftSessionResumeResult> =>
    ipcRenderer.invoke('anki:draftSessionResume', id, fingerprint),
  ankiDraftSessionDelete: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('anki:draftSessionDelete', id),
  dictListYomitan: (): Promise<YomitanDictInfo[]> => ipcRenderer.invoke('dict:listYomitan'),
  dictRemoveYomitan: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:removeYomitan', id),
  dictSetYomitanEnabled: (id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:setYomitanEnabled', id, enabled),
  dictMoveYomitan: (id: string, dir: number): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:moveYomitan', id, dir),
  /** Omit `pair` for the global order; pass one to see that pair's own order. */
  dictListSources: (pair?: import('./shared/dictionarySources').DictionaryLanguagePair): Promise<import('./shared/dictionarySources').DictionarySourceInfo[]> =>
    ipcRenderer.invoke('dict:listSources', pair),
  /** Every language pair the installed sources can answer. */
  dictListPairs: (): Promise<import('./shared/dictionarySources').DictionaryLanguagePair[]> =>
    ipcRenderer.invoke('dict:listPairs'),
  /** Whether this pair has an order of its own rather than following the global one. */
  dictPairHasOverride: (pair: import('./shared/dictionarySources').DictionaryLanguagePair): Promise<boolean> =>
    ipcRenderer.invoke('dict:pairHasOverride', pair),
  /** Drop a pair's own order so it follows the global one again. */
  dictResetPairPriority: (pair: import('./shared/dictionarySources').DictionaryLanguagePair): Promise<import('./shared/dictionarySources').DictionarySourceMutationResult> =>
    ipcRenderer.invoke('dict:resetPairPriority', pair),
  dictSetSourceEnabled: (id: string, enabled: boolean): Promise<import('./shared/dictionarySources').DictionarySourceMutationResult> =>
    ipcRenderer.invoke('dict:setSourceEnabled', id, enabled),
  /**
   * Queues the relabel; it does not perform it. `jobId` names a job on the
   * import stream (`onDictImportChanged`) whose terminal snapshot is the real
   * answer — `sources` here is the list as it stands *before* the move.
   */
  dictSetSourceLang: (id: string, lang: string): Promise<import('./shared/dictionarySources').DictionarySourceLangResult> =>
    ipcRenderer.invoke('dict:setSourceLang', id, lang),
  dictMoveSource: (id: string, direction: -1 | 1, pair?: import('./shared/dictionarySources').DictionaryLanguagePair): Promise<import('./shared/dictionarySources').DictionarySourceMutationResult> =>
    ipcRenderer.invoke('dict:moveSource', id, direction, pair),
  dictRemoveSource: (id: string): Promise<import('./shared/dictionarySources').DictionarySourceMutationResult> =>
    ipcRenderer.invoke('dict:removeSource', id),
  /** Set or clear ('' clears) the manual gloss-language override for a dictionary. */
  dictSetYomitanLang: (id: string, lang: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('dict:setYomitanLang', id, lang),
  /** Gloss languages served by the enabled dictionaries (e.g. ['en','ru']). */
  dictAvailableLangs: (): Promise<string[]> => ipcRenderer.invoke('dict:availableLangs'),

  // ----- Long dictionary imports (utility process) ------------------------------
  // These take minutes and run off the main thread. The snapshot separates
  // `status` from `terminal` on purpose: progress must never read as success.
  // Contract and validation: `shared/dictionaryImportJob.ts`.
  dictImportStart: (
    request: import('./shared/dictionaryImportJob').DictionaryImportRequest,
  ): Promise<
    | { ok: true; snapshot: import('./shared/dictionaryImportJob').DictionaryImportJobSnapshot }
    | { ok: false; error: string; snapshot?: import('./shared/dictionaryImportJob').DictionaryImportJobSnapshot }
  > => ipcRenderer.invoke('dictImport:start', request),
  /** Cooperative — the importer rolls its transaction back rather than half-importing. */
  dictImportCancel: (
    jobId?: string,
  ): Promise<{ ok: boolean; snapshot: import('./shared/dictionaryImportJob').DictionaryImportJobSnapshot | null }> =>
    ipcRenderer.invoke('dictImport:cancel', jobId),
  /** The running job, or the last outcome. How a reloaded window recovers. */
  dictImportStatus: (): Promise<import('./shared/dictionaryImportJob').DictionaryImportJobSnapshot | null> =>
    ipcRenderer.invoke('dictImport:status'),
  dictImportPick: (kind: 'cedict' | 'wiktextract' | 'dsl' | 'jmnedict' | 'kanjidic' | 'stardict' | 'tatoeba'): Promise<{ canceled: boolean; filePath?: string; linksFilePath?: string }> =>
    ipcRenderer.invoke('dictImport:pick', kind),
  onDictImportChanged: (
    cb: (snapshot: import('./shared/dictionaryImportJob').DictionaryImportJobSnapshot) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      snapshot: import('./shared/dictionaryImportJob').DictionaryImportJobSnapshot,
    ): void => cb(snapshot);
    ipcRenderer.on('dictImport:changed', handler);
    return () => ipcRenderer.removeListener('dictImport:changed', handler);
  },

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
  ankiDeleteNotes: (
    noteIds: number[],
    mediaFilenames: string[] = [],
  ): Promise<DeleteMinedNotesResult> =>
    ipcRenderer.invoke('anki:deleteNotes', { noteIds, mediaFilenames }),
  ankiEnsureModel: (id?: ProfileId): Promise<EnsureModelResult> =>
    ipcRenderer.invoke('anki:ensureModel', id),
  /** Ordered field names of a note type (for the field-mapping editor). */
  ankiModelFields: (
    modelName: string,
  ): Promise<{ ok: boolean; fields: string[]; error?: string }> =>
    ipcRenderer.invoke('anki:modelFields', modelName),
  ankiGetIntervals: (opts?: { maxAgeMs?: number }): Promise<IntervalSnapshot> =>
    ipcRenderer.invoke('anki:getIntervals', opts),
  /**
   * Review state for NAMED notes. Use this, not `ankiGetIntervals`, whenever the caller
   * already knows which note ids it means: the collection-wide poll walks every profile's
   * sync query (`deck:*` by default) and does not return inside a minute on a real
   * collection. It also carries entries the poll's word-only expression filter would drop,
   * which is what a mined sentence card needs.
   */
  ankiGetIntervalsForNotes: (noteIds: readonly number[]): Promise<IntervalSnapshot> =>
    ipcRenderer.invoke('anki:getIntervalsForNotes', [...noteIds]),
  /** Read-only week-ahead due counts from Anki's own scheduler. */
  ankiDueForecast: (): Promise<DueForecast> => ipcRenderer.invoke('anki:dueForecast'),
  onAnkiIntervalsChanged: (cb: (s: IntervalSnapshot) => void): (() => void) => {
    const handler = (_e: unknown, s: IntervalSnapshot): void => cb(s);
    ipcRenderer.on('anki:intervalsChanged', handler);
    return () => ipcRenderer.removeListener('anki:intervalsChanged', handler);
  },
  /**
   * Deck Workbench AI additions (gate 12). The batch id is the renderer's, so a
   * cancel and a late progress event can both be matched against the batch the
   * review is actually showing.
   */
  ankiAiGenerateAdditions: (request: {
    batchId: string;
    kind: AiAdditionKind;
    notes: { noteId: string; term: string; gloss?: string }[];
    variantCount: number;
    sendGloss: boolean;
    explainLanguage: string;
  }): Promise<AiAdditionsRunResult> => ipcRenderer.invoke('anki:aiGenerateAdditions', request),
  /**
   * Deck Workbench field translation (gate 2). A different question with the
   * same batch id space, so `ankiAiCancelAdditions` and the progress event below
   * cover it too.
   */
  ankiAiTranslateField: (request: {
    batchId: string;
    fromField: string;
    targetLanguage: string;
    notes: { noteId: string; text: string }[];
    variantCount: number;
  }): Promise<AiAdditionsRunResult> => ipcRenderer.invoke('anki:aiTranslateField', request),
  ankiAiCancelAdditions: (batchId: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('anki:aiCancelAdditions', batchId),
  onAnkiAiAdditionsProgress: (
    cb: (payload: { batchId: string; results: AiAdditionsNoteResult[] }) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: { batchId: string; results: AiAdditionsNoteResult[] },
    ): void => cb(payload);
    ipcRenderer.on('anki:aiAdditionsProgress', handler);
    return () => ipcRenderer.removeListener('anki:aiAdditionsProgress', handler);
  },

  // Dual-desktop layout
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
  desktopSetAssignment: (
    patch: Partial<DisplayAssignment> & { displayKey: string },
  ): Promise<DesktopLayoutSnapshot> => ipcRenderer.invoke('desktop:setAssignment', patch),
  desktopRename: (index: DesktopIndex, name: string): Promise<DesktopLayoutSnapshot> =>
    ipcRenderer.invoke('desktop:renameDesktop', { index, name }),
  desktopResetAssignments: (): Promise<DesktopLayoutSnapshot> =>
    ipcRenderer.invoke('desktop:resetAssignments'),

  // ----- Multi-monitor: displays and secondary desktop windows -----
  displayList: (): Promise<DisplaySummary[]> => ipcRenderer.invoke('display:list'),
  displaySetVirtualCount: (count: number): Promise<DisplaySummary[]> =>
    ipcRenderer.invoke('display:setVirtualCount', count),
  displayGetVirtualCount: (): Promise<number> => ipcRenderer.invoke('display:getVirtualCount'),
  onDisplaysChanged: (cb: (displays: DisplaySummary[]) => void): (() => void) => {
    const handler = (_e: unknown, displays: DisplaySummary[]): void => cb(displays);
    ipcRenderer.on('display:changed', handler);
    return () => ipcRenderer.removeListener('display:changed', handler);
  },

  deskwinAssign: (displayKey: string, desktopIndex: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('deskwin:assign', { displayKey, desktopIndex }),
  deskwinSetOptions: (
    patch: Partial<DisplayAssignment> & { displayKey: string },
  ): Promise<{ ok: boolean }> => ipcRenderer.invoke('deskwin:setOptions', patch),
  deskwinList: (): Promise<DeskWindowInfo[]> => ipcRenderer.invoke('deskwin:list'),
  /** Claim a desktop no shell is showing, for a taskbar tear-off. */
  deskwinAllocateDesktop: (): Promise<{ ok: boolean; desktopIndex?: number }> =>
    ipcRenderer.invoke('deskwin:allocateDesktop'),
  /** Open a standalone window showing one desktop. */
  deskwinOpenDesktop: (desktopIndex: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('deskwin:openDesktop', desktopIndex),
  deskwinFocusDesktop: (desktopIndex: number): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('deskwin:focusDesktop', desktopIndex),
  deskwinSync: (): Promise<DeskWindowInfo[]> => ipcRenderer.invoke('deskwin:sync'),
  /** Which display + desktop is this window? Answers for main and secondaries alike. */
  deskwinWhoAmI: (): Promise<{ displayKey: string | null; desktopIndex: DesktopIndex | null }> =>
    ipcRenderer.invoke('deskwin:whoAmI'),
  onDeskWindowsChanged: (cb: (info: DeskWindowInfo[]) => void): (() => void) => {
    const handler = (_e: unknown, info: DeskWindowInfo[]): void => cb(info);
    ipcRenderer.on('deskwin:changed', handler);
    return () => ipcRenderer.removeListener('deskwin:changed', handler);
  },
  /** The display this window sits on now hosts a different desktop. */
  onDeskRetarget: (
    cb: (payload: { desktopIndex: DesktopIndex; displayKey: string }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { desktopIndex: DesktopIndex; displayKey: string }): void =>
      cb(payload);
    ipcRenderer.on('deskwin:retarget', handler);
    return () => ipcRenderer.removeListener('deskwin:retarget', handler);
  },

  deskDragBegin: (payload: {
    kind: DeskDragKind;
    id: string;
    payload: unknown;
    displayKey: string;
  }): void => ipcRenderer.send('deskdrag:begin', payload),
  deskDragMove: (screenX: number, screenY: number): void =>
    ipcRenderer.send('deskdrag:move', { screenX, screenY }),
  deskDragEnd: (screenX: number, screenY: number): void =>
    ipcRenderer.send('deskdrag:end', { screenX, screenY }),
  deskDragCancel: (): void => ipcRenderer.send('deskdrag:cancel'),
  onDeskDragHover: (
    cb: (p: { kind: DeskDragKind; screenX: number; screenY: number; desktopIndex: number | null }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: Parameters<typeof cb>[0]): void => cb(p);
    ipcRenderer.on('deskdrag:hover', handler);
    return () => ipcRenderer.removeListener('deskdrag:hover', handler);
  },
  onDeskDragLeave: (cb: (p: { kind: DeskDragKind }) => void): (() => void) => {
    const handler = (_e: unknown, p: { kind: DeskDragKind }): void => cb(p);
    ipcRenderer.on('deskdrag:leave', handler);
    return () => ipcRenderer.removeListener('deskdrag:leave', handler);
  },
  onDeskDragAdopt: (
    cb: (p: {
      kind: DeskDragKind;
      id: string;
      payload: unknown;
      screenX: number;
      screenY: number;
      desktopIndex: number;
    }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: Parameters<typeof cb>[0]): void => cb(p);
    ipcRenderer.on('deskdrag:adopt', handler);
    return () => ipcRenderer.removeListener('deskdrag:adopt', handler);
  },
  onDeskDragRelease: (cb: (p: { kind: DeskDragKind; id: string }) => void): (() => void) => {
    const handler = (_e: unknown, p: { kind: DeskDragKind; id: string }): void => cb(p);
    ipcRenderer.on('deskdrag:release', handler);
    return () => ipcRenderer.removeListener('deskdrag:release', handler);
  },
  onDeskDragCancelled: (
    cb: (p: { kind: DeskDragKind; id: string; reason: string }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: { kind: DeskDragKind; id: string; reason: string }): void => cb(p);
    ipcRenderer.on('deskdrag:cancelled', handler);
    return () => ipcRenderer.removeListener('deskdrag:cancelled', handler);
  },

  // ----- Universal file drop routing -----
  fileDropClassify: (paths: string[]): Promise<DropPlan[]> =>
    ipcRenderer.invoke('filedrop:classify', paths),
  fileDropFolderImages: (dirPath: string): Promise<string[]> =>
    ipcRenderer.invoke('filedrop:listFolderImages', dirPath),
  fileDropFolderFiles: (dirPath: string): Promise<string[]> =>
    ipcRenderer.invoke('filedrop:listFolderFiles', dirPath),

  // ----- Files app: the index over every store the app owns -----
  filesIndex: (force?: boolean): Promise<FilesIndexSnapshot> =>
    ipcRenderer.invoke('filesapp:index', force === true),
  /**
   * Reveal an item's real location. Refuses with a reason key for anything not
   * file-backed rather than opening a folder that is not the item's — a
   * dictionary row lives in a SQLite table and has no folder to show.
   */
  filesReveal: (location: FilesLocation): Promise<{ ok: boolean; reasonKey?: string }> =>
    ipcRenderer.invoke('filesapp:reveal', location),
  /**
   * Read the text behind a catalogue row, for one-click mine. Passages, not
   * cards: the deck is renderer localStorage, so the renderer stays the only
   * writer and main stays the only file reader.
   */
  filesMineSource: (
    location: FilesLocation,
    kind: 'transcript' | 'subtitle' | 'book',
  ): Promise<FilesMineSourceResult> => ipcRenderer.invoke('filesapp:mine-source', location, kind),
  /**
   * Gate 23: classify a folder in bulk and report it grouped by destination.
   * Read-only — this answers with counts and imports nothing, so calling it is
   * always safe and the confirm step is a separate action.
   */
  filesScan: (
    roots: string[],
    /** Gate 31: the ingest settings document's stability window, in ms. */
    options?: { stabilityMs?: number },
  ): Promise<FilesScanReport> => ipcRenderer.invoke('filesapp:scan', roots, options),
  /**
   * Gate 25: watch these folders and tell me when something lands. Replaces the
   * previous set wholesale and re-baselines, so nothing already present is
   * announced as an arrival.
   */
  filesWatchSet: (
    roots: string[],
    options?: { stabilityMs?: number },
  ): Promise<import('./main/filesApp/ipc').FilesWatchStatus> =>
    ipcRenderer.invoke('filesapp:watch-set', roots, options),
  filesWatchStatus: (): Promise<import('./main/filesApp/ipc').FilesWatchStatus> =>
    ipcRenderer.invoke('filesapp:watch-status'),
  /** Fires per batch of files that finished arriving. Push, not poll. */
  onFilesWatchArrival: (
    cb: (arrivals: import('./main/filesApp/watch').FilesWatchArrival[]) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      arrivals: import('./main/filesApp/watch').FilesWatchArrival[],
    ): void => cb(arrivals);
    ipcRenderer.on('filesapp:watch-arrival', handler);
    return () => ipcRenderer.removeListener('filesapp:watch-arrival', handler);
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
  appToggle: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('app:toggle'),
  appSetToggleShortcut: (chord: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('app:setToggleShortcut', chord),
  appSetRestartShortcut: (chord: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('app:setRestartShortcut', chord),
  osHotkeyStatus: (): Promise<{
    supported: boolean;
    installed: boolean;
    running: boolean;
    hotkey: string;
    restartHotkey?: string;
    openCount: number;
    error?: string;
  }> => ipcRenderer.invoke('osHotkey:status'),
  osHotkeyInstall: (
    bindings?:
      | string
      | {
          toggle?: string;
          restart?: string;
          opens?: { section: string; chord: string }[];
        },
  ): Promise<{
    ok: boolean;
    error?: string;
    status: {
      supported: boolean;
      installed: boolean;
      running: boolean;
      hotkey: string;
      restartHotkey?: string;
      openCount: number;
    };
  }> => ipcRenderer.invoke('osHotkey:install', bindings),
  osHotkeySync: (
    bindings?:
      | string
      | {
          toggle?: string;
          restart?: string;
          opens?: { section: string; chord: string }[];
        },
  ): Promise<{
    ok: boolean;
    error?: string;
    status: {
      supported: boolean;
      installed: boolean;
      running: boolean;
      hotkey: string;
      restartHotkey?: string;
      openCount: number;
    };
  }> => ipcRenderer.invoke('osHotkey:sync', bindings),
  osHotkeyUninstall: (): Promise<{
    ok: boolean;
    error?: string;
    status: {
      supported: boolean;
      installed: boolean;
      running: boolean;
      hotkey: string;
      restartHotkey?: string;
      openCount: number;
    };
  }> => ipcRenderer.invoke('osHotkey:uninstall'),

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
  // Refresh reports its source, so the UI can tell a real saved copy from the
  // bundled fallback rather than calling both "offline". See F23.
  catalogRefresh: (): Promise<
    import('./shared/resourcesCatalog').CatalogResult<
      import('./shared/resourcesCatalog').ResourcesCatalog
    >
  > => ipcRenderer.invoke('catalog:refresh'),
  novelsGet: (): Promise<import('./shared/resourcesCatalog').NovelsCatalog | null> =>
    ipcRenderer.invoke('novels:get'),
  novelsRefresh: (): Promise<
    import('./shared/resourcesCatalog').CatalogResult<
      import('./shared/resourcesCatalog').NovelsCatalog
    >
  > => ipcRenderer.invoke('novels:refresh'),

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
  // Blanc App Drawer — folder CRUD + move, on the same collected-tools store.
  toolsMoveItem: (
    id: string,
    folderId: string | null,
  ): Promise<{ ok: boolean; tool?: import('./shared/collectedTools').CollectedTool; error?: string }> =>
    ipcRenderer.invoke('tools:moveItem', id, folderId),
  toolsAddFolder: (
    name: string,
    parentFolderId?: string | null,
  ): Promise<{ ok: boolean; folder?: import('./shared/collectedTools').CollectedFolder; error?: string }> =>
    ipcRenderer.invoke('tools:addFolder', name, parentFolderId),
  toolsRenameFolder: (
    id: string,
    name: string,
  ): Promise<{ ok: boolean; folder?: import('./shared/collectedTools').CollectedFolder; error?: string }> =>
    ipcRenderer.invoke('tools:renameFolder', id, name),
  toolsRemoveFolder: (
    id: string,
  ): Promise<{ ok: boolean; store?: import('./shared/collectedTools').CollectedToolsStore; error?: string }> =>
    ipcRenderer.invoke('tools:removeFolder', id),

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
    /** Reader-pinned word senses the model must honour (see shared/translateCore). */
    senseHints?: import('./shared/translateCore').TranslateSenseHint[];
  }): Promise<{ ok: boolean; text?: string; error?: string }> =>
    ipcRenderer.invoke('translate:run', req),
  translateRunBatch: (req: {
    items: Array<{ id: string; text: string; source: string; target: string }>;
  }): Promise<{
    ok: boolean;
    results?: Array<{ id: string; text: string }>;
    error?: string;
    cancelled?: boolean;
  }> => ipcRenderer.invoke('translate:runBatch', req),
  translateCancelBatch: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('translate:cancelBatch'),
  translateStatus: (): Promise<{ ready: boolean; modelFound: boolean; modelPath: string | null }> =>
    ipcRenderer.invoke('translate:status'),
  translateEnsureReady: (): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('translate:ensureReady'),
  // Cloud-LLM linguistic analysis of a completed translation (needs an API key)
  translateAnalyze: (
    req: import('./shared/translateAnalysisCore').TranslateAnalyzeRequest,
  ): Promise<{
    ok: boolean;
    result?: import('./shared/translateAnalysisCore').TranslateAnalysisResult;
    error?: string;
  }> => ipcRenderer.invoke('translate:analyze', req),
  // Cuts a mined sentence's video out of the local episode file (ffmpeg, main side).
  extractVideoClip: (
    req: import('./shared/videoClip').VideoClipRequest,
  ): Promise<import('./main/videoClip').VideoClipResult> =>
    ipcRenderer.invoke('video:extractClip', req),
  // Cloud-LLM whole-sentence annotation — AI OCR mode (needs an API key)
  sentenceAnalyze: (
    req: import('./shared/sentenceAnalysisCore').SentenceAnalyzeRequest,
  ): Promise<import('./main/sentenceAnalysis').SentenceAnalyzeResponse> =>
    ipcRenderer.invoke('sentence:analyze', req),
  sentenceGetPrefs: (): Promise<import('./shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs> =>
    ipcRenderer.invoke('sentence:getPrefs'),
  sentenceSetPrefs: (
    prefs: import('./shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs,
  ): Promise<import('./shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs> =>
    ipcRenderer.invoke('sentence:setPrefs', prefs),
  // Preferences live in main, so every window (Settings, Lens overlay) is told.
  onSentencePrefsChanged: (
    cb: (prefs: import('./shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      prefs: import('./shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs,
    ): void => cb(prefs);
    ipcRenderer.on('sentence:prefsChanged', handler);
    return () => ipcRenderer.removeListener('sentence:prefsChanged', handler);
  },
  // Snapshots raised by the extension: the notebook lives in renderer storage,
  // so the main window files them on the extension's behalf.
  onSentenceSnapshot: (
    cb: (payload: import('./shared/analysisSnapshot').AnalysisSnapshot) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: import('./shared/analysisSnapshot').AnalysisSnapshot,
    ): void => cb(payload);
    ipcRenderer.on('sentence:snapshot', handler);
    return () => ipcRenderer.removeListener('sentence:snapshot', handler);
  },
  onTranslateModelProgress: (
    cb: (p: { status?: string; file?: string; progress?: number }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: { status?: string; file?: string; progress?: number }): void =>
      cb(p);
    ipcRenderer.on('translate:progress', handler);
    return () => ipcRenderer.removeListener('translate:progress', handler);
  },
  onTranslateBatchProgress: (cb: (p: { done: number; total: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { done: number; total: number }): void => cb(p);
    ipcRenderer.on('translate:batchProgress', handler);
    return () => ipcRenderer.removeListener('translate:batchProgress', handler);
  },
  onTranslatePartial: (cb: (p: { id: number; progress: number }) => void): (() => void) => {
    const handler = (_e: unknown, p: { id: number; progress: number }): void => cb(p);
    ipcRenderer.on('translate:partial', handler);
    return () => ipcRenderer.removeListener('translate:partial', handler);
  },

  // Media player + media library
  listMedia: (): Promise<MediaItem[]> => ipcRenderer.invoke('media:list'),
  scanMediaStorage: (paths: string[]): Promise<{ totalBytes: number; files: Array<{ path: string; size: number; modifiedAt: number }> }> => ipcRenderer.invoke('media:scanStorage', paths),
  updateMediaMetadata: (id: string, metadata: Partial<Pick<MediaItem, 'title' | 'artist' | 'genres' | 'actors' | 'year' | 'lang' | 'category' | 'jlptLevel' | 'vocabularyCount' | 'kanjiCount' | 'metadataSource'>>): Promise<MediaItem | null> => ipcRenderer.invoke('media:updateMetadata', id, metadata),
  previewMediaOrganization: (id: string, root: string): Promise<import('./shared/mediaHub').MediaOrganizationPreview | null> => ipcRenderer.invoke('media:organizationPreview', id, root),
  organizeMedia: (preview: import('./shared/mediaHub').MediaOrganizationPreview, choice?: import('./shared/mediaHub').MediaDuplicateChoice): Promise<{ ok: boolean; path?: string; error?: string }> => ipcRenderer.invoke('media:organize', preview, choice),
  backupMedia: (): Promise<import('./shared/mediaHub').MediaBackupContract> => ipcRenderer.invoke('media:backup'),
  listMediaRelationships: (fromId?: string): Promise<import('./shared/mediaHub').MediaRelationship[]> => ipcRenderer.invoke('media:relationships', fromId),
  addMediaRelationship: (relationship: Omit<import('./shared/mediaHub').MediaRelationship, 'id' | 'createdAt'>): Promise<import('./shared/mediaHub').MediaRelationship> => ipcRenderer.invoke('media:addRelationship', relationship),
  mediaPathExists: (filePath: string): Promise<boolean> => ipcRenderer.invoke('media:pathExists', filePath),
  /** Embedded album art of an audio item as a data URL (null = no art). */
  coverArt: (id: string): Promise<string | null> => ipcRenderer.invoke('media:coverArt', id),
  /**
   * Library artwork as a `playfile://` URL — embedded cover for audio, a frame
   * grabbed ~10% in for video. Generated and disk-cached on first ask; null means
   * the file has no usable image, and that answer is cached too.
   */
  mediaArtwork: (id: string, variant?: 'poster' | 'banner' | 'still'): Promise<string | null> =>
    ipcRenderer.invoke('media:artwork', id, variant),
  // ---- metadata sweep (Jikan / AniList) ----
  runMediaMetadata: (
    request?: import('./shared/mediaMetadataIpc').MediaMetadataRequest,
  ): Promise<import('./shared/mediaMetadataIpc').MediaMetadataResult> =>
    ipcRenderer.invoke('mediaMetadata:run', request),
  cancelMediaMetadata: (seriesKey?: string): Promise<void> =>
    ipcRenderer.invoke('mediaMetadata:cancel', seriesKey),
  mediaMetadataStatus: (): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('mediaMetadata:status'),
  searchMediaMetadata: (
    query: string,
  ): Promise<import('./shared/mediaMetadataIpc').MediaMetadataSearchHit[]> =>
    ipcRenderer.invoke('mediaMetadata:search', query),
  clearMediaMetadataCache: (): Promise<void> => ipcRenderer.invoke('mediaMetadata:clearCache'),
  // ---- discovery (Scraper app: catalogue search + curated feeds) ----
  searchDiscovery: (
    query: string,
  ): Promise<import('./shared/mediaDiscovery').DiscoveryFeedResult> =>
    ipcRenderer.invoke('discovery:search', query),
  browseDiscovery: (
    feed: import('./shared/mediaDiscovery').DiscoveryFeedId,
    page?: number,
  ): Promise<import('./shared/mediaDiscovery').DiscoveryFeedResult> =>
    ipcRenderer.invoke('discovery:browse', feed, page ?? 1),
  discoveryDetail: (
    id: number,
  ): Promise<import('./shared/mediaDiscovery').DiscoveryCandidate | null> =>
    ipcRenderer.invoke('discovery:detail', id),
  // ---- authenticated MyAnimeList sync ----
  // Note what is NOT here: there is no way to read the access or refresh token
  // from the renderer, by design. The tokens live in the main process encrypted
  // with safeStorage; this side learns only whether an account is connected and
  // whether the store on disk is actually encrypted. Every call below is driven
  // by an explicit user action — nothing on this bridge runs on a timer.
  malStatus: (): Promise<
    import('./main/malSync').MalIpcResult<import('./main/malSync').MalAuthStatus>
  > => ipcRenderer.invoke('mal:status'),
  malSetClientId: (
    clientId: string,
    redirectUri?: string,
  ): Promise<import('./main/malSync').MalIpcResult<import('./main/malSync').MalAuthStatus>> =>
    ipcRenderer.invoke('mal:setClientId', clientId, redirectUri),
  malBeginAuth: (): Promise<
    import('./main/malSync').MalIpcResult<import('./main/malSync').MalPendingAuth>
  > => ipcRenderer.invoke('mal:beginAuth'),
  malCompleteAuth: (
    code: string,
    state: string,
  ): Promise<import('./main/malSync').MalIpcResult<import('./main/malSync').MalAuthStatus>> =>
    ipcRenderer.invoke('mal:completeAuth', code, state),
  malSignOut: (): Promise<
    import('./main/malSync').MalIpcResult<import('./main/malSync').MalAuthStatus>
  > => ipcRenderer.invoke('mal:signOut'),
  malFetchList: (
    status?: import('./shared/malSync').MalListStatus,
  ): Promise<import('./main/malSync').MalIpcResult<import('./main/malSync').MalListSyncResult>> =>
    ipcRenderer.invoke('mal:fetchList', status),
  // Read-only franchise discovery: one `/anime/{id}` read per title walked,
  // bounded in the main process. It never touches the user's list.
  malFetchDerivatives: (
    seedIds: number[],
    options?: import('./shared/malSync').MalRelationWalkOptions,
  ): Promise<
    import('./main/malSync').MalIpcResult<import('./main/malSync').MalDerivativeWalkResult>
  > => ipcRenderer.invoke('mal:fetchDerivatives', seedIds, options),
  // ---- the anime/manga library the sync writes into ----
  // Local disk only. `malLibrarySync` stores rows the caller already fetched
  // through `malFetchList`/`malFetchDerivatives`; there is no MAL client behind
  // it, which is what makes "nothing syncs on a timer" structural rather than a
  // promise. Neither channel can reach MyAnimeList.
  malLibrarySync: (
    payload: import('./main/malLibrary').MalLibrarySyncRequest,
  ): Promise<import('./main/malLibrary').MalLibrarySyncReport> =>
    ipcRenderer.invoke('mal:librarySync', payload),
  malLibraryList: (): Promise<{
    entries: import('./shared/malLibrary').MalLibraryEntry[];
    summary: import('./shared/malLibrary').MalLibrarySummary;
  }> => ipcRenderer.invoke('mal:libraryList'),
  malUpdateEntry: (
    animeId: number,
    update: import('./shared/malSync').MalListStatusUpdate,
  ): Promise<
    import('./main/malSync').MalIpcResult<import('./shared/malSync').MalListStatusUpdate>
  > => ipcRenderer.invoke('mal:updateEntry', animeId, update),
  onMediaMetadataProgress: (
    cb: (p: import('./shared/mediaMetadataIpc').MediaMetadataProgress) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: import('./shared/mediaMetadataIpc').MediaMetadataProgress,
    ): void => cb(p);
    ipcRenderer.on('mediaMetadata:progress', handler);
    return () => ipcRenderer.removeListener('mediaMetadata:progress', handler);
  },
  // ---- subtitle discovery (embedded / sidecar / Jimaku / OpenSubtitles) ----
  runSubtitleDiscovery: (
    request?: import('./shared/subtitleDiscoveryIpc').SubtitleDiscoveryRequest,
  ): Promise<import('./shared/subtitleDiscoveryIpc').SubtitleDiscoveryResult> =>
    ipcRenderer.invoke('subtitleDiscovery:run', request),
  cancelSubtitleDiscovery: (mediaId?: string): Promise<void> =>
    ipcRenderer.invoke('subtitleDiscovery:cancel', mediaId),
  subtitleDiscoveryStatus: (): Promise<{ running: boolean }> =>
    ipcRenderer.invoke('subtitleDiscovery:status'),
  getSubtitleDiscoverySettings: (): Promise<import('./shared/subtitleDiscoveryIpc').SubtitleDiscoverySettings> =>
    ipcRenderer.invoke('subtitleDiscovery:settings'),
  saveSubtitleDiscoverySettings: (
    settings: import('./shared/subtitleDiscoveryIpc').SubtitleDiscoverySettings,
  ): Promise<import('./shared/subtitleDiscoveryIpc').SubtitleDiscoverySettings> =>
    ipcRenderer.invoke('subtitleDiscovery:saveSettings', settings),
  // ---- Phase 0 credentials vault ----
  // Three channels, and no way to read a secret back. The renderer writes a key
  // and is told whether one is configured; `main/credentials/vault.ts` is the
  // only place the value exists in the clear.
  credentialStatus: (): Promise<import('./main/credentials/ipc').CredentialVaultSnapshot> =>
    ipcRenderer.invoke('credentials:status'),
  setCredentialSecret: (
    id: string,
    field: string,
    secret: string,
  ): Promise<import('./main/credentials/ipc').CredentialWriteResponse> =>
    ipcRenderer.invoke('credentials:set', id, field, secret),
  clearCredential: (id: string): Promise<import('./main/credentials/ipc').CredentialVaultSnapshot> =>
    ipcRenderer.invoke('credentials:clear', id),
  /** Which providers need a key and whether one is stored. Never the key itself. */
  subtitleProviderCredentials: (): Promise<import('./shared/subtitleDiscoveryIpc').SubtitleProviderCredentialState[]> =>
    ipcRenderer.invoke('subtitleDiscovery:credentials'),
  setSubtitleProviderKey: (
    id: string,
    key: string,
  ): Promise<import('./shared/subtitleDiscoveryIpc').SubtitleProviderCredentialState[]> =>
    ipcRenderer.invoke('subtitleDiscovery:setKey', id, key),
  testSubtitleProvider: (
    id: string,
  ): Promise<import('./shared/subtitleDiscoveryIpc').SubtitleProviderTestResult> =>
    ipcRenderer.invoke('subtitleDiscovery:test', id),
  /**
   * Ranked nyaa releases for one media item. Separate from `runSubtitleDiscovery`
   * because a torrent-sourced subtitle is never attached automatically — the
   * user picks the release, then accepts it below.
   */
  listNyaaSubtitles: (
    mediaId: string,
    acquisition: import('./shared/subtitleNyaa').NyaaAcquisitionConfig,
    languages?: string[],
  ): Promise<import('./shared/subtitleDiscoveryIpc').NyaaSubtitleListResult> =>
    ipcRenderer.invoke('subtitleDiscovery:nyaaList', mediaId, acquisition, languages),
  acceptNyaaSubtitle: (
    mediaId: string,
    candidateId: string,
    acquisition: import('./shared/subtitleNyaa').NyaaAcquisitionConfig,
    lang: string,
  ): Promise<import('./shared/subtitleDiscoveryIpc').NyaaSubtitleAcceptResult> =>
    ipcRenderer.invoke('subtitleDiscovery:nyaaAccept', mediaId, candidateId, acquisition, lang),
  /**
   * Attach cue text the renderer already holds to a library item.
   *
   * The inverse of every other subtitle route, which starts from a media item
   * and goes looking for text. The harvest panel has no media item — it fetches
   * for a catalogue entry — so without this its cues can be mined but can never
   * reach the player. Takes no provider config and starts no transfer.
   */
  attachSubtitleText: (
    input: import('./shared/subtitleDiscoveryIpc').SubtitleAttachTextInput,
  ): Promise<import('./shared/subtitleDiscoveryIpc').NyaaSubtitleAcceptResult> =>
    ipcRenderer.invoke('subtitleDiscovery:attachText', input),
  /**
   * Remove one subtitle track from an item. The reverse of every add on this
   * surface, none of which had one — a wrong track could only be got rid of by
   * removing the media item. Deletes the cached file, never a sidecar in place.
   */
  detachSubtitleRecord: (
    mediaId: string,
    recordId: string,
  ): Promise<import('./shared/subtitleDiscoveryIpc').NyaaSubtitleAcceptResult> =>
    ipcRenderer.invoke('subtitleDiscovery:detach', mediaId, recordId),
  /** Cue text for one stored subtitle record. */
  readSubtitleRecord: (mediaId: string, recordId: string): Promise<SubtitlePick | null> =>
    ipcRenderer.invoke('subtitleDiscovery:read', mediaId, recordId),
  onSubtitleDiscoveryProgress: (
    cb: (p: import('./shared/subtitleDiscoveryIpc').SubtitleDiscoveryProgress) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: import('./shared/subtitleDiscoveryIpc').SubtitleDiscoveryProgress,
    ): void => cb(p);
    ipcRenderer.on('subtitleDiscovery:progress', handler);
    return () => ipcRenderer.removeListener('subtitleDiscovery:progress', handler);
  },

  /**
   * Persist per-item user state (favorite / study queue / note / collections /
   * the chosen subtitle track).
   */
  setMediaItemState: (
    id: string,
    patch: Partial<Pick<
      MediaItem,
      'favorite' | 'studyQueue' | 'note' | 'collections' | 'preferredSubtitleId'
    >>,
  ): Promise<MediaItem | null> => ipcRenderer.invoke('media:setItemState', id, patch),
  /** Open a file dialog; chosen file(s) are saved to the media library. */
  pickMedia: (): Promise<MediaOpen | null> => ipcRenderer.invoke('media:pick'),
  /** Open a folder dialog and import every video/audio file under it. */
  addMediaFolder: (): Promise<{ items: MediaItem[]; added: number }> => ipcRenderer.invoke('media:addFolder'),
  /** Re-open a saved library item by id. */
  openMedia: (id: string): Promise<MediaOpen | null> => ipcRenderer.invoke('media:open', id),
  handoffMedia: (handoff: import('./shared/externalPlayer').PlaybackHandoff, profile: import('./shared/externalPlayer').ExternalPlayerProfile): Promise<string | null> => ipcRenderer.invoke('media:handoff', handoff, profile),
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
  /**
   * The discovered subtitle track for a local video, by path and without side effects.
   *
   * The adopted workspace opens files through the sidecar, which only sees what is inside
   * the container — so a downloaded (Jimaku/OpenSubtitles) track was invisible to it. See
   * the handler for the measurement.
   */
  subtitleForPath: (filePath: string): Promise<SubtitlePick | null> =>
    ipcRenderer.invoke('media:subtitleForPath', filePath),
  /** Open a file dialog and return the chosen subtitle file's text. */
  pickSubtitle: (): Promise<SubtitlePick | null> => ipcRenderer.invoke('media:pickSubtitle'),
  fetchYoutubeSubs: (
    id: string,
    preferLang?: string,
  ): Promise<{ ok: true; name: string; text: string } | { ok: false; error: string }> =>
    ipcRenderer.invoke('media:fetchYoutubeSubs', id, preferLang),
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
  ytListChannels: (): Promise<import('./shared/ytPlaylists').YtChannel[]> =>
    ipcRenderer.invoke('yt:listChannels'),
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
      channelId: string;
      channelTitle: string;
      channelIconUrl: string;
      subscriptionStatus: import('./shared/ytPlaylists').YtSubscriptionStatus;
      updateFrequencyHours: number;
    }>,
  ): Promise<YtPlaylistsStore | { error: string }> =>
    ipcRenderer.invoke('yt:setPlaylistPrefs', playlistId, prefs),
  ytSetChannelPrefs: (
    channelId: string,
    prefs: Partial<{
      title: string;
      iconUrl: string;
      subscriptionStatus: import('./shared/ytPlaylists').YtSubscriptionStatus;
      updateFrequencyHours: number;
    }>,
  ): Promise<YtPlaylistsStore | { error: string }> =>
    ipcRenderer.invoke('yt:setChannelPrefs', channelId, prefs),
  ytRefreshChannel: (
    channelId: string,
  ): Promise<
    | {
        store: YtPlaylistsStore;
        channel: import('./shared/ytPlaylists').YtChannel;
        refreshedPlaylistIds: string[];
        errors: string[];
      }
    | { error: string }
  > => ipcRenderer.invoke('yt:refreshChannel', channelId),
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
  // YouTube discovery (Phase 8 item 3). Metadata only — every one of these runs
  // yt-dlp with --skip-download/--flat-playlist and writes nothing to disk.
  ytDiscoverySearch: (
    query: string,
    limit?: number,
  ): Promise<import('./shared/youtubeDiscovery').YoutubeSearchResult> =>
    ipcRenderer.invoke('ytDiscovery:search', query, limit),
  ytDiscoveryChannel: (
    channel: string,
    limit?: number,
  ): Promise<import('./shared/youtubeDiscovery').YoutubeSearchResult> =>
    ipcRenderer.invoke('ytDiscovery:channel', channel, limit),
  ytDiscoveryProbe: (
    videoId: string,
  ): Promise<import('./shared/youtubeDiscovery').YoutubeProbeResult> =>
    ipcRenderer.invoke('ytDiscovery:probe', videoId),
  /** Reads a caption file `ytFetchSubsOnly` already cached. Never fetches. */
  ytCachedCaptionText: (
    youtubeId: string,
  ): Promise<{ text: string | null; file: string | null }> =>
    ipcRenderer.invoke('yt:cachedCaptionText', youtubeId),
  /** Hand a discovered video to the playlist manager. Does not download it. */
  ytAddVideoByUrl: (
    url: string,
  ): Promise<
    | { ok: true; playlistId: string; videoId: string; youtubeId: string; duplicate?: boolean }
    | { ok: false; error: string }
  > => ipcRenderer.invoke('yt:addVideoByUrl', url),
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
    range?: { from?: number | null; to?: number | null } | null,
  ): Promise<EpubMiningAnalysis> =>
    ipcRenderer.invoke('mining:analyzeEpub', itemId, config, range),
  miningListEpubSections: (
    itemId: string,
  ): Promise<{
    itemId: string;
    title: string;
    sections: import('./shared/mining').EpubSectionSummary[];
  }> => ipcRenderer.invoke('mining:listEpubSections', itemId),
  miningCancelAnalyze: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('mining:cancelAnalyze'),
  miningEnrichCandidate: (
    candidate: MiningCandidate,
    config?: Partial<TraditionalMiningConfig>,
  ): Promise<MiningCandidate> => ipcRenderer.invoke('mining:enrichCandidate', candidate, config),
  onMiningEnrichProgress: (
    cb: (p: import('./shared/mining').MiningEnrichProgress) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: import('./shared/mining').MiningEnrichProgress): void => cb(p);
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
  localAgentPlan: (request: LocalAgentPlanRequest): Promise<LocalAgentPlanResponse> =>
    ipcRenderer.invoke('localAgent:plan', request),
  localAgentStatus: (): Promise<LocalAgentRuntimeStatus> => ipcRenderer.invoke('localAgent:status'),
  localAgentModels: (): Promise<LocalAgentModelInfo[]> => ipcRenderer.invoke('localAgent:models'),
  // `localAgentSyncAutomations` used to live here, pushing the renderer's copy of
  // the schedule into the main scheduler. Main owns the schedule now
  // (`main/agentOperationalStore.ts`) and the scheduler subscribes to it, so the
  // push had no remaining caller and would have been a dead channel.
  onLocalAgentTrigger: (cb: (entry: AgentAutomation) => void): (() => void) => {
    const handler = (_event: unknown, entry: AgentAutomation): void => cb(entry);
    ipcRenderer.on('localAgent:trigger', handler);
    return () => ipcRenderer.removeListener('localAgent:trigger', handler);
  },
  // A trigger goes to one *claiming* renderer, not to every window. Listening on
  // the channel is not the claim: a listener that only reports the fire — a
  // status line, a probe — must not consume it, and before the claim existed a
  // fire reaching a window with no handler was indistinguishable from a fire
  // that ran. Claim only where the automation is actually planned and enqueued.
  localAgentClaimTriggers: (): Promise<boolean> =>
    ipcRenderer.invoke('localAgent:claimTriggers'),
  localAgentReleaseTriggers: (): Promise<boolean> =>
    ipcRenderer.invoke('localAgent:releaseTriggers'),
  localAgentReportAutomationRun: (
    request: AgentAutomationRunFailureReport,
  ): Promise<AgentAutomationRunReportResult> =>
    ipcRenderer.invoke('localAgent:reportAutomationRun', request),
  // The main-owned Agent workspace store. Its only renderer consumer is
  // `renderer/agentWorkspaceClient.ts`; see shared/agentWorkspaceBridge.ts for
  // why failures cross as a code rather than a message.
  agentWorkspaceLoad: (): Promise<AgentWorkspaceResult> =>
    ipcRenderer.invoke('agentWorkspace:load'),
  agentWorkspaceSave: (state: AgentWorkspaceState): Promise<AgentWorkspaceResult> =>
    ipcRenderer.invoke('agentWorkspace:save', state),
  agentWorkspaceDeleteConversation: (conversationId: string): Promise<AgentWorkspaceResult> =>
    ipcRenderer.invoke('agentWorkspace:deleteConversation', conversationId),
  agentWorkspaceClear: (): Promise<AgentWorkspaceResult> =>
    ipcRenderer.invoke('agentWorkspace:clear'),
  // Fires for every committed workspace mutation, including this window's own —
  // the contextual hand-off writes from the same window the shell lives in.
  onAgentWorkspaceChanged: (cb: (state: AgentWorkspaceState) => void): (() => void) => {
    const handler = (_event: unknown, state: AgentWorkspaceState): void => cb(state);
    ipcRenderer.on('agentWorkspace:changed', handler);
    return () => ipcRenderer.removeListener('agentWorkspace:changed', handler);
  },
  // The capture staging area. A screenshot is staged for a conversation by the
  // surface that captured it and claimed once by whichever window opens that
  // conversation; the payload lives in main memory only and never in the
  // persisted workspace. See shared/agentImageStaging.ts.
  agentImageStage: (request: AgentImageStageRequest): Promise<AgentImageStageResult> =>
    ipcRenderer.invoke(AGENT_IMAGE_STAGING_CHANNELS.stage, request),
  agentImageTake: (conversationId: string): Promise<AgentImageTakeResult> =>
    ipcRenderer.invoke(AGENT_IMAGE_STAGING_CHANNELS.take, conversationId),
  // Fires for every accepted capture, carrying the conversation it was staged
  // for and nothing else. The Agent shell claims on it because the hand-off
  // stages *after* it saves, so the workspace push alone arrives too early.
  onAgentImageStaged: (cb: (conversationId: string) => void): (() => void) => {
    const handler = (_event: unknown, conversationId: string): void => cb(conversationId);
    ipcRenderer.on(AGENT_IMAGE_STAGING_CHANNELS.staged, handler);
    return () => ipcRenderer.removeListener(AGENT_IMAGE_STAGING_CHANNELS.staged, handler);
  },
  // The card-batch staging slot. `flashcard.generate-cards` stages the batch it
  // produced; AI Card Studio claims it into its own preview editor. One slot,
  // single-use, main memory only - see shared/agentCardBatchStaging.ts.
  agentCardBatchStage: (
    request: AgentCardBatchStageRequest,
  ): Promise<AgentCardBatchStageResult> =>
    ipcRenderer.invoke(AGENT_CARD_BATCH_STAGING_CHANNELS.stage, request),
  agentCardBatchTake: (): Promise<AgentCardBatchTakeResult> =>
    ipcRenderer.invoke(AGENT_CARD_BATCH_STAGING_CHANNELS.take),
  // Fires for every accepted batch and carries NOTHING - the cards stay in main
  // until a window claims them. It exists for the order the studio's own mount
  // cannot cover: Flashcards already open while the Agent generates elsewhere.
  onAgentCardBatchStaged: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on(AGENT_CARD_BATCH_STAGING_CHANNELS.staged, handler);
    return () => ipcRenderer.removeListener(AGENT_CARD_BATCH_STAGING_CHANNELS.staged, handler);
  },
  // The main-owned Agent operational store: task queue, memory, automations.
  // Its only renderer consumer is `renderer/agentOperationalClient.ts`. The
  // `changed` push is what makes a write in one window reach the others.
  agentOperationalLoad: (): Promise<AgentOperationalResult> =>
    ipcRenderer.invoke('agentOperational:load'),
  agentOperationalSave: (state: AgentOperationalState): Promise<AgentOperationalResult> =>
    ipcRenderer.invoke('agentOperational:save', state),
  agentOperationalMigrateLegacy: (
    payload: LegacyAgentOperationalPayload,
  ): Promise<AgentOperationalResult> =>
    ipcRenderer.invoke('agentOperational:migrateLegacy', payload),
  // The main-owned monthly spend ledger. Note the absence of a `save`: the
  // renderer sets the ceiling and erases the record, and the totals themselves
  // are main's alone. `shared/agentSpendBridge.ts` says why.
  agentSpendLoad: (): Promise<AgentSpendResult> =>
    ipcRenderer.invoke('agentSpend:load'),
  agentSpendSetBudget: (budgetUsd: number | null): Promise<AgentSpendResult> =>
    ipcRenderer.invoke('agentSpend:setBudget', { budgetUsd }),
  agentSpendClear: (): Promise<AgentSpendResult> =>
    ipcRenderer.invoke('agentSpend:clear'),
  onAgentSpendChanged: (cb: (snapshot: AgentSpendSnapshotPayload) => void): (() => void) => {
    const handler = (_event: unknown, snapshot: AgentSpendSnapshotPayload): void => cb(snapshot);
    ipcRenderer.on('agentSpend:changed', handler);
    return () => ipcRenderer.removeListener('agentSpend:changed', handler);
  },
  onAgentOperationalChanged: (cb: (state: AgentOperationalState) => void): (() => void) => {
    const handler = (_event: unknown, state: AgentOperationalState): void => cb(state);
    ipcRenderer.on('agentOperational:changed', handler);
    return () => ipcRenderer.removeListener('agentOperational:changed', handler);
  },
  agentExecutionLeaseAcquire: (
    request: AgentExecutionLeaseAcquireRequest,
  ): Promise<AgentExecutionLeaseAcquireResult> =>
    ipcRenderer.invoke('agentExecutionLease:acquire', request),
  agentExecutionLeaseRenew: (
    request: AgentExecutionLeaseTokenRequest,
  ): Promise<AgentExecutionLeaseRenewResult> =>
    ipcRenderer.invoke('agentExecutionLease:renew', request),
  agentExecutionLeaseCommit: (
    request: AgentExecutionLeaseCommitRequest,
  ): Promise<AgentExecutionLeaseCommitResult> =>
    ipcRenderer.invoke('agentExecutionLease:commit', request),
  agentExecutionLeaseRelease: (
    request: AgentExecutionLeaseTokenRequest,
  ): Promise<AgentExecutionLeaseReleaseResult> =>
    ipcRenderer.invoke('agentExecutionLease:release', request),
  agentExecutionLeaseRecover: (
    request: AgentExecutionLeaseRecoverRequest,
  ): Promise<AgentExecutionLeaseRecoverResult> =>
    ipcRenderer.invoke('agentExecutionLease:recover', request),
  agentExecutionRun: (request: AgentExecutionRequest): Promise<AgentExecutionResult> =>
    ipcRenderer.invoke('agentExecution:run', request),
  agentExecutionCancel: (requestId: string): Promise<AgentExecutionCancelResult> =>
    ipcRenderer.invoke('agentExecution:cancel', requestId),
  onAgentExecutionEvent: (cb: (event: AgentExecutionEvent) => void): (() => void) => {
    const handler = (_event: unknown, payload: AgentExecutionEvent): void => cb(payload);
    ipcRenderer.on('agentExecution:event', handler);
    return () => ipcRenderer.removeListener('agentExecution:event', handler);
  },
  // Permission-gated navigation. The request carries four ids and an approval
  // flag and never a destination — see `shared/agentNavigationBridge.ts` for why
  // that shape is the security property rather than a convenience.
  agentNavigationRun: (request: AgentNavigationRequest): Promise<AgentNavigationResult> =>
    ipcRenderer.invoke('agentNavigation:run', request),
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
  aiSetEngine: (engine: AiEngineKind): Promise<AiEngineConfig & { ok: boolean }> =>
    ipcRenderer.invoke('ai:setEngine', engine),
  aiProviderHealth: (): Promise<readonly AiProviderHealth[]> =>
    ipcRenderer.invoke('ai:providerHealth'),
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
    cb: (p: import('./shared/mining').AiGenerationProgress) => void,
  ): (() => void) => {
    const handler = (_e: unknown, p: import('./shared/mining').AiGenerationProgress): void => cb(p);
    ipcRenderer.on('ai:generateProgress', handler);
    return () => ipcRenderer.removeListener('ai:generateProgress', handler);
  },
  aiSaveCsv: (csv: string): Promise<{ ok: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('ai:saveCsv', csv),
  mediaStudyAssist: (
    req: import('./shared/mediaStudyAssistant').MediaStudyAssistantRequest,
  ): Promise<{
    ok: boolean;
    result?: import('./shared/mediaStudyAssistant').MediaStudyAssistantResult;
    error?: string;
    cached?: boolean;
  }> => ipcRenderer.invoke('media-study:assist', req),
  studyGet: (): Promise<StudyOrchestratorDocument> => ipcRenderer.invoke('study:get'),
  studyMigrateLegacy: (value: unknown): Promise<StudyOrchestratorDocument> =>
    ipcRenderer.invoke('study:migrateLegacy', value),
  studyPrepare: (request: StudyAnalysisRequest): Promise<StudyPreparationResult> =>
    ipcRenderer.invoke('study:prepare', request),
  studyCreateLookupPack: (request: StudyLookupPackRequest): Promise<StudyLookupPackResult> =>
    ipcRenderer.invoke('study:createLookupPack', request),
  studyQueueTranscription: (mediaId: string): Promise<StudyTranscriptionQueueResult> =>
    ipcRenderer.invoke('study:queueTranscription', mediaId),
  studyWorkspacePage: (
    workspaceId: string,
    offset?: number,
    limit?: number,
  ): Promise<{ items: StudyVocabularyCandidate[]; total: number; selected: number }> =>
    ipcRenderer.invoke('study:workspacePage', workspaceId, offset, limit),
  studyApplyFilters: (
    workspaceId: string,
    filters: Partial<StudyVocabularyFilters>,
  ): Promise<StudyVocabularyWorkspace> =>
    ipcRenderer.invoke('study:applyFilters', workspaceId, filters),
  studyUndoFilter: (workspaceId: string): Promise<StudyVocabularyWorkspace> =>
    ipcRenderer.invoke('study:undoFilter', workspaceId),
  studyUpdateWorkspace: (workspace: StudyVocabularyWorkspace): Promise<StudyVocabularyWorkspace> =>
    ipcRenderer.invoke('study:updateWorkspace', workspace),
  studyListOpportunities: (): Promise<StudyOpportunity[]> =>
    ipcRenderer.invoke('study:listOpportunities'),
  studySyncOpportunities: (
    opportunities: StudyOpportunity[],
    retireMissingActive = false,
  ): Promise<StudyOrchestratorDocument> =>
    ipcRenderer.invoke('study:syncOpportunities', opportunities, retireMissingActive),
  studySetOpportunityStatus: (
    opportunityId: string,
    status: StudyOpportunityStatus,
    snoozedUntil?: number,
  ): Promise<StudyOrchestratorDocument> =>
    ipcRenderer.invoke('study:setOpportunityStatus', opportunityId, status, snoozedUntil),
  studyPreviewAnki: (workspaceId: string): Promise<StudyAnkiPreview> =>
    ipcRenderer.invoke('study:previewAnki', workspaceId),
  studyExportAnki: (workspaceId: string): Promise<StudyAnkiExportResult> =>
    ipcRenderer.invoke('study:exportAnki', workspaceId),
  studyUndoAnkiExport: (workspaceId: string): Promise<StudyAnkiUndoResult> =>
    ipcRenderer.invoke('study:undoAnkiExport', workspaceId),
  onStudyChanged: (cb: (document: StudyOrchestratorDocument) => void): (() => void) => {
    const handler = (_event: unknown, document: StudyOrchestratorDocument): void => cb(document);
    ipcRenderer.on('study:changed', handler);
    return () => ipcRenderer.removeListener('study:changed', handler);
  },

  // Immersion Browser
  immersionListSites: (): Promise<ImmersionSitesStore> => ipcRenderer.invoke('immersion:listSites'),
  visualNovelList: (): Promise<import('./shared/visualNovel').VisualNovelDatabase> =>
    ipcRenderer.invoke('visual-novel:list'),
  visualNovelSearchSource: (
    query: string,
  ): Promise<{
    ok: boolean;
    results?: import('./shared/visualNovel').VisualNovelSourceResult[];
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:searchSource', query),
  visualNovelSourceDetails: (
    providerId: string,
  ): Promise<{
    ok: boolean;
    details?: import('./shared/visualNovel').VisualNovelSourceDetails;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:sourceDetails', providerId),
  visualNovelPickExecutable: (): Promise<string | null> =>
    ipcRenderer.invoke('visual-novel:pickExecutable'),
  visualNovelDiscoverFolder: (): Promise<import('./shared/visualNovel').VisualNovelDiscoveryCandidate[]> =>
    ipcRenderer.invoke('visual-novel:discoverFolder'),
  visualNovelExportLibrary: (): Promise<{
    ok: boolean;
    path?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:exportLibrary'),
  visualNovelImportLibrary: (): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    addedEntries?: number;
    addedCaptures?: number;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:importLibrary'),
  visualNovelExportCommunityBundle: (
    title: string,
    content: string,
  ): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }> =>
    ipcRenderer.invoke('visual-novel:exportCommunityBundle', title, content),
  visualNovelPickCommunityBundle: (): Promise<{
    ok: boolean;
    content?: string;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:pickCommunityBundle'),
  visualNovelAdd: (
    input: import('./shared/visualNovel').VisualNovelCreateInput,
  ): Promise<{ ok: boolean; database?: import('./shared/visualNovel').VisualNovelDatabase; error?: string }> =>
    ipcRenderer.invoke('visual-novel:add', input),
  visualNovelImportDiscovered: (
    candidates: import('./shared/visualNovel').VisualNovelCreateInput[],
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    imported?: number;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:importDiscovered', candidates),
  visualNovelRemove: (
    id: string,
  ): Promise<import('./shared/visualNovel').VisualNovelDatabase> =>
    ipcRenderer.invoke('visual-novel:remove', id),
  visualNovelUpdateProgress: (
    id: string,
    patch: import('./shared/visualNovel').VisualNovelProgressPatch,
  ): Promise<import('./shared/visualNovel').VisualNovelDatabase> =>
    ipcRenderer.invoke('visual-novel:updateProgress', id, patch),
  visualNovelUpdateMetadata: (
    id: string,
    patch: import('./shared/visualNovel').VisualNovelMetadataPatch,
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:updateMetadata', id, patch),
  visualNovelUpdateRoutes: (
    id: string,
    routes: import('./shared/visualNovel').VisualNovelRouteInput[],
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:updateRoutes', id, routes),
  visualNovelReadClipboard: (): Promise<string> => ipcRenderer.invoke('visual-novel:readClipboard'),
  visualNovelHookState: (
    id: string,
  ): Promise<import('./shared/visualNovelHook').VisualNovelHookState> =>
    ipcRenderer.invoke('visual-novel:hookState', id),
  visualNovelStartHook: (
    id: string,
  ): Promise<{
    ok: boolean;
    state?: import('./shared/visualNovelHook').VisualNovelHookState;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:startHook', id),
  visualNovelStopHook: (
    id: string,
  ): Promise<import('./shared/visualNovelHook').VisualNovelHookState> =>
    ipcRenderer.invoke('visual-novel:stopHook', id),
  onVisualNovelHookChanged: (
    cb: (state: import('./shared/visualNovelHook').VisualNovelHookState) => void,
  ): (() => void) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: import('./shared/visualNovelHook').VisualNovelHookState,
    ): void => cb(state);
    ipcRenderer.on('visual-novel:hookChanged', listener);
    return () => ipcRenderer.removeListener('visual-novel:hookChanged', listener);
  },
  visualNovelPickScripts: (id: string): Promise<{
    ok: boolean;
    lines?: import('./shared/visualNovelScriptExtraction').VisualNovelScriptLine[];
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:pickScripts', id),
  visualNovelImportScriptLines: (
    id: string,
    lines: import('./shared/visualNovelScriptExtraction').VisualNovelScriptLine[],
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    imported?: number;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:importScriptLines', id, lines),
  visualNovelSessionState: (id: string): Promise<{ startedAt: number | null }> =>
    ipcRenderer.invoke('visual-novel:sessionState', id),
  visualNovelStopSession: (id: string): Promise<{
    database: import('./shared/visualNovel').VisualNovelDatabase;
    stopped: boolean;
  }> => ipcRenderer.invoke('visual-novel:stopSession', id),
  visualNovelCaptureText: (
    input: import('./shared/visualNovel').VisualNovelCaptureInput,
  ): Promise<{ ok: boolean; database?: import('./shared/visualNovel').VisualNovelDatabase; error?: string }> =>
    ipcRenderer.invoke('visual-novel:captureText', input),
  visualNovelCaptureMany: (
    inputs: import('./shared/visualNovel').VisualNovelCaptureInput[],
    options?: import('./shared/visualNovel').VisualNovelCaptureBatchOptions,
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    imported?: number;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:captureMany', inputs, options),
  visualNovelUpdateCapture: (
    id: string,
    patch: import('./shared/visualNovel').VisualNovelCapturePatch,
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:updateCapture', id, patch),
  visualNovelRemoveCapture: (
    id: string,
  ): Promise<import('./shared/visualNovel').VisualNovelDatabase> =>
    ipcRenderer.invoke('visual-novel:removeCapture', id),
  visualNovelReadCaptureImage: (
    filePath: string,
  ): Promise<{ ok: boolean; dataUrl?: string; error?: string }> =>
    ipcRenderer.invoke('visual-novel:readCaptureImage', filePath),
  visualNovelAttachCaptureAudio: (
    id: string,
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    canceled?: boolean;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:attachCaptureAudio', id),
  visualNovelRemoveCaptureAudio: (
    id: string,
  ): Promise<{
    ok: boolean;
    database?: import('./shared/visualNovel').VisualNovelDatabase;
    error?: string;
  }> => ipcRenderer.invoke('visual-novel:removeCaptureAudio', id),
  visualNovelReadCaptureAudio: (
    filePath: string,
  ): Promise<{ ok: boolean; dataUrl?: string; filename?: string; error?: string }> =>
    ipcRenderer.invoke('visual-novel:readCaptureAudio', filePath),
  visualNovelLaunch: (id: string): Promise<{ ok: boolean; error?: string; startedAt?: number }> =>
    ipcRenderer.invoke('visual-novel:launch', id),
  onVisualNovelChanged: (
    cb: (database: import('./shared/visualNovel').VisualNovelDatabase) => void,
  ): (() => void) => {
    const handler = (_event: unknown, database: import('./shared/visualNovel').VisualNovelDatabase): void => cb(database);
    ipcRenderer.on('visual-novel:changed', handler);
    return () => ipcRenderer.removeListener('visual-novel:changed', handler);
  },
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
  /** Which recognizer a fresh scan asks for; `auto` lets the pipeline decide. */
  lensSetDefaultEngine: (engine: ReadingLensEngine): Promise<ReadingLensStatus> =>
    ipcRenderer.invoke('lens:setDefaultEngine', engine),
  /** Which recognizers are installed right now, read live in main on every call. */
  lensOcrEngineStatus: (): Promise<ReadingLensEngineStatus> =>
    ipcRenderer.invoke('lens:ocrEngineStatus'),
  /** Open the lens over the display under the cursor. */
  lensOpen: (mode: LensOpenMode = 'select'): Promise<void> => ipcRenderer.invoke('lens:open', mode),
  /** The lens renderer pulls its init (display bounds + mode) on mount. */
  lensGetInit: (): Promise<LensInit | null> => ipcRenderer.invoke('lens:getInit'),
  /** Capture + OCR a region (window-local DIP coords). */
  lensOcr: (
    region: RegionRect & { engine?: 'auto' | 'manga' | 'web'; includeScreenshot?: boolean },
  ): Promise<LensOcrResult> => ipcRenderer.invoke('lens:ocr', region),
  /** Toggle pass-through: true = capture the mouse, false = click through to the app below. */
  lensSetInteractive: (interactive: boolean): void => {
    ipcRenderer.send('lens:setInteractive', interactive);
  },
  lensClose: (): Promise<void> => ipcRenderer.invoke('lens:close'),

  /**
   * Capture history. Main owns the store because the lens window is destroyed
   * per capture; the screenshot on a capture is dropped before anything is
   * written to disk (see shared/readingLensHistory.ts).
   */
  lensHistoryRecord: (capture: ReadingLensCapture): Promise<ReadingLensHistoryEntry | null> =>
    ipcRenderer.invoke('lens:history:record', capture),
  lensHistoryList: (query: ReadingLensHistoryQuery = {}): Promise<ReadingLensHistoryEntry[]> =>
    ipcRenderer.invoke('lens:history:list', query),
  lensHistoryPin: (captureId: string, pinned: boolean): Promise<ReadingLensHistoryEntry | null> =>
    ipcRenderer.invoke('lens:history:pin', captureId, pinned),
  lensHistoryRemove: (captureId: string): Promise<number> =>
    ipcRenderer.invoke('lens:history:remove', captureId),
  lensHistoryClear: (): Promise<void> => ipcRenderer.invoke('lens:history:clear'),
  lensHistoryGetRetention: (): Promise<ReadingLensRetentionDays> =>
    ipcRenderer.invoke('lens:history:getRetention'),
  lensHistorySetRetention: (
    days: number,
  ): Promise<{ retentionDays: ReadingLensRetentionDays; removed: number }> =>
    ipcRenderer.invoke('lens:history:setRetention', days),

  /**
   * The lens → Lexicon lookup slot (shared/lexiconHandoff.ts). Main holds the
   * text because the lens window is destroyed the moment a capture lands, and
   * the Dictionary is routinely a different window entirely.
   */
  lexiconHandoffStage: (request: LexiconHandoffRequest): Promise<LexiconHandoffStageResult> =>
    ipcRenderer.invoke(LEXICON_HANDOFF_CHANNELS.stage, request),
  lexiconHandoffTake: (request: LexiconHandoffTakeRequest): Promise<LexiconHandoffTakeResult> =>
    ipcRenderer.invoke(LEXICON_HANDOFF_CHANNELS.take, request),
  onLexiconHandoffStaged: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on(LEXICON_HANDOFF_CHANNELS.staged, handler);
    return () => ipcRenderer.removeListener(LEXICON_HANDOFF_CHANNELS.staged, handler);
  },

  /**
   * The lens → Reading workspace passage slot
   * (shared/readingPassageHandoff.ts). Same reasoning as the Lexicon slot above:
   * main holds the passage because the lens window is destroyed the moment a
   * capture lands, and the workspace is routinely a different window entirely.
   */
  readingPassageHandoffStage: (
    request: ReadingPassageHandoffRequest,
  ): Promise<ReadingPassageHandoffStageResult> =>
    ipcRenderer.invoke(READING_PASSAGE_HANDOFF_CHANNELS.stage, request),
  readingPassageHandoffTake: (): Promise<ReadingPassageHandoffTakeResult> =>
    ipcRenderer.invoke(READING_PASSAGE_HANDOFF_CHANNELS.take),
  onReadingPassageHandoffStaged: (cb: () => void): (() => void) => {
    const handler = (): void => cb();
    ipcRenderer.on(READING_PASSAGE_HANDOFF_CHANNELS.staged, handler);
    return () => ipcRenderer.removeListener(READING_PASSAGE_HANDOFF_CHANNELS.staged, handler);
  },

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
  /** Audit T6: rehash an installed asset on disk against its install record. */
  assetsReverify: (id: string): Promise<ReverifyOutcome> => ipcRenderer.invoke('assets:reverify', id),
  /** Audit T6: per-asset verifyMode / pinned state, so the UI can label it honestly. */
  assetsIntegrity: (): Promise<AssetIntegrity[]> => ipcRenderer.invoke('assets:integrity'),
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

  /**
   * Audit C1-3: the airing schedule, with torrent-index releases matched onto it.
   *
   * One call does both halves so the renderer cannot render a half-matched
   * screen, and so the pacing between index requests stays in main where it
   * cannot be raced by a re-render.
   */
  animeSchedule: (input: AnimeScheduleRequest): Promise<AnimeScheduleResponse> =>
    ipcRenderer.invoke(ANIME_SCHEDULE_CHANNEL, input),

  // Tells the main process which UI language is active, so native dialog
  // titles/filters (file pickers) aren't stuck in English. See main/i18n.ts.
  // Fire-and-forget: main's handler is a `handle()`, so this must be an
  // `invoke()` call to actually reach it â€” a plain `send()` would silently
  // go nowhere.
  setUiLang: (lang: string): void => {
    void ipcRenderer.invoke('i18n:setLang', lang);
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
  // ---- transcription queue ----
  enqueueTranscription: (
    request: import('./shared/transcriptionIpc').TranscriptionRequest,
  ): Promise<import('./shared/transcriptionIpc').TranscriptionResult> =>
    ipcRenderer.invoke('transcription:enqueue', request),
  /**
   * Windows Live Captions capture. The source window is lossy (~12 lines, a few
   * seconds), so this is a background poller in main rather than a pull the
   * renderer performs — the renderer only toggles it and reads what it caught.
   */
  liveCaptionsStatus: (): Promise<import('./main/liveCaptions').LiveCaptionsStatus> =>
    ipcRenderer.invoke('liveCaptions:status'),
  liveCaptionsStart: (): Promise<{
    ok: boolean;
    error?: string;
    status: import('./main/liveCaptions').LiveCaptionsStatus;
  }> => ipcRenderer.invoke('liveCaptions:start'),
  liveCaptionsStop: (): Promise<{
    ok: boolean;
    status: import('./main/liveCaptions').LiveCaptionsStatus;
  }> => ipcRenderer.invoke('liveCaptions:stop'),
  liveCaptionsScripts: (): Promise<import('./shared/liveCaptions').CaptionScript[]> =>
    ipcRenderer.invoke('liveCaptions:scripts'),
  liveCaptionsClear: (): Promise<{
    ok: boolean;
    status: import('./main/liveCaptions').LiveCaptionsStatus;
  }> => ipcRenderer.invoke('liveCaptions:clear'),
  onLiveCaptionsChanged: (
    cb: (status: import('./main/liveCaptions').LiveCaptionsStatus) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      status: import('./main/liveCaptions').LiveCaptionsStatus,
    ): void => cb(status);
    ipcRenderer.on('liveCaptions:changed', handler);
    return () => ipcRenderer.removeListener('liveCaptions:changed', handler);
  },

  cancelTranscription: (mediaId?: string): Promise<void> =>
    ipcRenderer.invoke('transcription:cancel', mediaId),
  transcriptionQueue: (): Promise<import('./shared/transcriptionIpc').TranscriptionJob[]> =>
    ipcRenderer.invoke('transcription:queue'),
  fusionTrackMeta: (
    mediaId: string,
    subtitleId: string,
  ): Promise<import('./shared/subtitleFusionMeta').FusionTrackMeta | null> =>
    ipcRenderer.invoke('transcription:fusionMeta', mediaId, subtitleId),
  onTranscriptionProgress: (
    cb: (p: import('./shared/transcriptionIpc').TranscriptionProgress) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      p: import('./shared/transcriptionIpc').TranscriptionProgress,
    ): void => cb(p);
    ipcRenderer.on('transcription:progress', handler);
    return () => ipcRenderer.removeListener('transcription:progress', handler);
  },
  onTranscriptionCardsReady: (
    cb: (payload: import('./shared/transcriptionIpc').TranscriptionCardsReady) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      payload: import('./shared/transcriptionIpc').TranscriptionCardsReady,
    ): void => cb(payload);
    ipcRenderer.on('transcription:cards-ready', handler);
    return () => ipcRenderer.removeListener('transcription:cards-ready', handler);
  },
  flashcardSynthesizeAudio: (text: string, language = 'ja', voice?: string, requestId?: string):
    Promise<import('./main/flashcardAudio').FlashcardAudioResult> =>
    ipcRenderer.invoke('flashcards:synthesizeAudio', text, language, voice, requestId),
  flashcardCancelSynthesis: (requestId: string): Promise<boolean> =>
    ipcRenderer.invoke('flashcards:cancelSynthesis', requestId),
  /** Every offline voice installed on this machine. `refresh` re-enumerates. */
  flashcardListVoices: (refresh = false):
    Promise<import('./shared/flashcardVoices').FlashcardVoiceInventory> =>
    ipcRenderer.invoke('flashcards:listVoices', refresh),
  /** Write a deck's text export plus its audio into a fresh folder under userData. */
  flashcardExportDeck: (request: {
    text: string;
    fileName: string;
    media: ReadonlyArray<import('./shared/deckMediaExport').DeckMediaItem>;
    rows?: string[][];
  }): Promise<import('./main/flashcardAudio').DeckExportResult> =>
    ipcRenderer.invoke('flashcards:exportDeck', request),
  /** Open a folder this app wrote under userData/exports. Refuses anything else. */
  flashcardRevealExport: (directory: string): Promise<boolean> =>
    ipcRenderer.invoke('flashcards:revealExport', directory),
  flashcardReadAudio: (filePath: string):
    Promise<import('./main/flashcardAudio').FlashcardAudioResult> =>
    ipcRenderer.invoke('flashcards:readAudio', filePath),
  /** Reclaim managed clips a removed card batch was the only reference to. */
  flashcardReleaseAudio: (paths: readonly string[]):
    Promise<{ removed: number; skipped: number }> =>
    ipcRenderer.invoke('flashcards:releaseAudio', [...paths]),
  flashcardAudioUsage: ():
    Promise<import('./main/flashcardAudio').FlashcardAudioUsage> =>
    ipcRenderer.invoke('flashcards:audioUsage'),
  /** `referenced` is every path the local deck still points at. */
  flashcardSweepAudio: (referenced: readonly string[]):
    Promise<{ removed: number; bytes: number; kept: number }> =>
    ipcRenderer.invoke('flashcards:audioSweep', [...referenced]),
  /** Main asks the renderer to run Whisper on one slice of audio. */
  onTranscriptionChunkRequest: (
    cb: (payload: { id: string; pcmBase64: string; lang: string }) => void,
  ): (() => void) => {
    const handler = (_e: unknown, payload: { id: string; pcmBase64: string; lang: string }): void => cb(payload);
    ipcRenderer.on('transcription:chunk-request', handler);
    return () => ipcRenderer.removeListener('transcription:chunk-request', handler);
  },
  replyTranscriptionChunk: (
    payload: import('./shared/transcriptionIpc').TranscriptionChunkResult & { id: string },
  ): void => {
    ipcRenderer.send('transcription:chunk-reply', payload);
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
  profileRulesGet: (): Promise<{ schemaVersion: 2; rules: Array<Record<string, unknown>> }> =>
    ipcRenderer.invoke('profileRules:get'),
  profileRulesSet: (
    store: unknown,
  ): Promise<{ schemaVersion: 2; rules: Array<Record<string, unknown>> }> =>
    ipcRenderer.invoke('profileRules:set', store),

  // ---- scraper backend ----
  // One method per ScraperPort call. `scraperCapabilities` is what the renderer
  // port checks before using any of the rest; anything not listed there stays
  // on sample data.
  scraperCapabilities: (): Promise<import('./shared/scraperIpc').ScraperMethod[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.capabilities),
  scraperSystemStats: (): Promise<import('./shared/scraperResults').SystemStats> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.systemStats),
  scraperListDownloads: (
    input: import('./shared/scraperIpc').ScraperQbitInput,
  ): Promise<import('./shared/scraperResults').DownloadRow[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.listDownloads, input),
  // Subtitle harvest — Japanese subs for a catalogue entry, no local file.
  // `list` returns ids and names only; the provider URL never crosses this
  // boundary, so `fetch` can only name something main already listed.
  subtitleHarvestList: (
    input: import('./shared/subtitleHarvest').SubtitleHarvestListInput,
  ): Promise<import('./shared/subtitleHarvest').SubtitleHarvestListResult> =>
    ipcRenderer.invoke('subtitleHarvest:list', input),
  subtitleHarvestFetch: (
    ids: string[],
  ): Promise<import('./shared/subtitleHarvest').SubtitleHarvestFetchResult> =>
    ipcRenderer.invoke('subtitleHarvest:fetch', ids),
  // The nyaa fallback, for a title with no local media item. Same id-exchange
  // rule as above: main holds the magnet its own listing produced.
  subtitleHarvestNyaaList: (
    input: import('./shared/subtitleHarvest').HarvestNyaaListInput,
  ): Promise<import('./shared/subtitleHarvest').HarvestNyaaListResult> =>
    ipcRenderer.invoke('subtitleHarvest:nyaaList', input),
  subtitleHarvestNyaaFetch: (
    candidateId: string,
    acquisition: unknown,
  ): Promise<import('./shared/subtitleHarvest').HarvestNyaaFetchResult> =>
    ipcRenderer.invoke('subtitleHarvest:nyaaFetch', candidateId, acquisition),
  scraperListExports: (): Promise<import('./shared/scraperResults').ExportRecord[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.listExports),
  scraperListPlugins: (
    enabledIds: string[],
  ): Promise<import('./shared/scraperIpc').ScraperPluginInfo[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.listPlugins, enabledIds),
  scraperWriteExport: (
    request: import('./shared/scraperIpc').ScraperExportInput & {
      content: string;
      defaultName: string;
      recordCount: number;
      openAfter?: boolean;
    },
  ): Promise<import('./shared/scraperResults').ExportRecord | null> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.writeExport, request),
  scraperStartScrape: (
    input: import('./shared/scraperIpc').ScraperStartInput,
  ): Promise<string> => ipcRenderer.invoke(SCRAPER_CHANNELS.startScrape, input),
  scraperCancelScrape: (jobId: string): Promise<void> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.cancelScrape, jobId),
  scraperListJobs: (): Promise<import('./shared/scraperResults').ScrapeJobSummary[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.listJobs),
  scraperGetResult: (
    jobId: string,
  ): Promise<import('./shared/scraperResults').ScrapeResult | null> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.getResult, jobId),
  // One listener per subscriber, filtered by job id here so a page watching one
  // run is not woken by another.
  scraperOnJobEvent: (
    jobId: string,
    cb: (event: import('./shared/scraperResults').ScrapeJobEvent) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      envelope: import('./shared/scraperIpc').ScraperJobEventEnvelope,
    ): void => {
      if (envelope?.jobId === jobId) cb(envelope.event);
    };
    ipcRenderer.on(SCRAPER_CHANNELS.jobEvent, handler);
    return () => ipcRenderer.removeListener(SCRAPER_CHANNELS.jobEvent, handler);
  },
  scraperSyncScheduler: (
    input: import('./shared/scraperIpc').ScraperSchedulerSyncInput,
  ): Promise<import('./shared/scraperIpc').ScraperSchedulerState> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.schedulerSync, input),
  scraperRunSchedule: (entryId: string): Promise<string | null> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.schedulerRun, entryId),
  scraperOnSchedulerState: (
    cb: (state: import('./shared/scraperIpc').ScraperSchedulerState) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      state: import('./shared/scraperIpc').ScraperSchedulerState,
    ): void => cb(state);
    ipcRenderer.on(SCRAPER_CHANNELS.schedulerState, handler);
    return () => ipcRenderer.removeListener(SCRAPER_CHANNELS.schedulerState, handler);
  },
  // Push-only: main raises a notice, nothing asks for one.
  scraperOnNotice: (
    cb: (notice: import('./shared/scraperNotices').ScraperNotice) => void,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      notice: import('./shared/scraperNotices').ScraperNotice,
    ): void => cb(notice);
    ipcRenderer.on(SCRAPER_CHANNELS.notice, handler);
    return () => ipcRenderer.removeListener(SCRAPER_CHANNELS.notice, handler);
  },
  scraperQbitTest: (
    input: import('./shared/scraperIpc').ScraperQbitInput,
  ): Promise<import('./shared/scraperResults').QbitStatusReport> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.qbitTest, input),
  scraperQbitTransfers: (
    input: import('./shared/scraperIpc').ScraperQbitInput,
  ): Promise<import('./shared/scraperResults').QbitTransferRow[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.qbitTransfers, input),
  scraperQbitSend: (
    input: import('./shared/scraperIpc').ScraperQbitSendInput,
  ): Promise<import('./shared/scraperResults').QbitSendReport> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.qbitSend, input),
  // Write-and-check only: there is deliberately no channel that reads a stored
  // secret back into the renderer.
  scraperSetCredential: (
    ref: string,
    secret: string,
  ): Promise<import('./shared/scraperIpc').ScraperCredentialResult> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.credentialSet, ref, secret),
  scraperHasCredential: (ref: string): Promise<boolean> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.credentialHas, ref),
  scraperClearCredential: (ref: string): Promise<void> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.credentialClear, ref),
  scraperSearchTorrents: (
    input: import('./shared/scraperIpc').ScraperTorrentSearchInput,
  ): Promise<import('./shared/scraperResults').TorrentRow[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.searchTorrents, input),
  scraperListSources: (
    entries: import('./shared/scraperSourceSettings').ScraperSourceEntry[],
  ): Promise<import('./shared/scraperResults').SourceStatus[]> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.listSources, entries),
  scraperListAcquisitionProviders: (): Promise<
    import('./shared/acquisition').AcquisitionProviderInventory
  > => ipcRenderer.invoke(SCRAPER_CHANNELS.listAcquisitionProviders),
  scraperGetAcquisitionSnapshot: (): Promise<
    import('./shared/acquisition').AcquisitionBackendSnapshot
  > => ipcRenderer.invoke(SCRAPER_CHANNELS.getAcquisitionSnapshot),
  scraperRunAcquisitionAction: (
    action: import('./shared/acquisition').AcquisitionAction,
  ): Promise<import('./shared/acquisition').AcquisitionActionResult> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.runAcquisitionAction, action),
  scraperProbeSource: (
    input: import('./shared/scraperIpc').ScraperProbeInput,
  ): Promise<import('./shared/scraperResults').SourceStatus> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.probeSource, input),
  scraperMalUnits: (
    input: import('./shared/malDownload').MalUnitsInput,
  ): Promise<import('./shared/malDownload').MalUnitsResult> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.malUnits, input),
  // ---- reading (Phase 5: provider-backed manga over the canonical model) ----
  readingMangaEntry: (
    input: import('./shared/readingIpc').ReadingMangaEntryInput,
  ): Promise<import('./shared/readingIpc').ReadingEntryResponse> =>
    ipcRenderer.invoke(READING_CHANNELS.mangaEntry, input),
  readingMangaChapters: (
    input: import('./shared/readingIpc').ReadingMangaChaptersInput,
  ): Promise<import('./shared/readingIpc').ReadingChaptersResponse> =>
    ipcRenderer.invoke(READING_CHANNELS.mangaChapters, input),
  readingMangaChapterPages: (
    input: import('./shared/readingIpc').ReadingMangaPagesInput,
  ): Promise<import('./shared/readingIpc').ReadingPagesResponse> =>
    ipcRenderer.invoke(READING_CHANNELS.mangaChapterPages, input),
  readingMangaProviders: (): Promise<
    import('./shared/readingIpc').ReadingProvidersResponse
  > => ipcRenderer.invoke(READING_CHANNELS.mangaProviders),
  readingMangaPageImage: (
    input: import('./shared/readingIpc').ReadingPageImageInput,
  ): Promise<import('./shared/readingIpc').ReadingPageImageResponse> =>
    ipcRenderer.invoke(READING_CHANNELS.mangaPageImage, input),
  readingMangaSearch: (
    input: import('./shared/readingIpc').ReadingMangaSearchInput,
  ): Promise<import('./shared/readingIpc').ReadingMangaSearchResponse> =>
    ipcRenderer.invoke(READING_CHANNELS.mangaSearch, input),
  readingMangaDownloadChapter: (
    input: import('./shared/readingIpc').ReadingMangaDownloadInput,
  ): Promise<import('./shared/readingIpc').ReadingMangaDownloadResponse> =>
    ipcRenderer.invoke(READING_CHANNELS.mangaDownloadChapter, input),
  scraperFetchHttp: (
    request: import('./shared/scraperIpc').ScraperHttpProbeRequest,
  ): Promise<import('./shared/scraperIpc').ScraperHttpProbeResult> =>
    ipcRenderer.invoke(SCRAPER_CHANNELS.fetchHttp, request),
  scraperTailLogs: (
    cb: (line: import('./shared/scraperResults').LogLine) => void,
    backlog = 200,
  ): (() => void) => {
    const handler = (
      _e: unknown,
      line: import('./shared/scraperResults').LogLine,
    ): void => cb(line);
    ipcRenderer.on(SCRAPER_CHANNELS.logEvent, handler);
    // The backlog replays through the same callback, so a caller sees one
    // ordered stream rather than having to merge history with live lines.
    void ipcRenderer
      .invoke(SCRAPER_CHANNELS.logsSubscribe, backlog)
      .then((lines: import('./shared/scraperResults').LogLine[]) => {
        for (const line of lines ?? []) cb(line);
      })
      .catch(() => undefined);
    return () => {
      ipcRenderer.removeListener(SCRAPER_CHANNELS.logEvent, handler);
      void ipcRenderer.invoke(SCRAPER_CHANNELS.logsUnsubscribe).catch(() => undefined);
    };
  },

  // ---- Seanime sidecar (on by default; SEANIME_SIDECAR=0 opts out) ----
  seanimeStatus: (): Promise<SeanimeStatus> => ipcRenderer.invoke(SEANIME_CHANNELS.status),
  seanimeStart: (): Promise<SeanimeStatus> => ipcRenderer.invoke(SEANIME_CHANNELS.start),
  seanimeStop: (): Promise<SeanimeStatus> => ipcRenderer.invoke(SEANIME_CHANNELS.stop),
  seanimeProbe: (): Promise<
    { ok: true; result: SeanimeProbeResult } | { ok: false; error: string }
  > => ipcRenderer.invoke(SEANIME_CHANNELS.probe),
  /** Loopback base URL + auth token, so the adopted Media workspace client can connect. */
  seanimeConnection: (): Promise<SeanimeConnection> =>
    ipcRenderer.invoke(SEANIME_CHANNELS.connection),
  seanimeExtractAudio: (localFilePath: string): Promise<ArrayBuffer> =>
    ipcRenderer.invoke(SEANIME_CHANNELS.extractAudio, localFilePath),
  /**
   * Phase 6: the Seanime library projected for Study Mode. Read-only — the join back onto
   * Study OS readiness happens in the renderer, against state it already holds.
   */
  seanimeStudyLibrary: (): Promise<
    { ok: true; files: SeanimeLibraryFile[] } | { ok: false; error: string }
  > => ipcRenderer.invoke(SEANIME_CHANNELS.studyLibrary),
  onSeanimeStatus: (cb: (s: SeanimeStatus) => void): (() => void) => {
    const handler = (_e: unknown, s: SeanimeStatus): void => cb(s);
    ipcRenderer.on(SEANIME_CHANNELS.statusEvent, handler);
    return () => ipcRenderer.removeListener(SEANIME_CHANNELS.statusEvent, handler);
  },
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;


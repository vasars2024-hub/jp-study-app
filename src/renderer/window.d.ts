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
} from '../shared/types';
import type {
  AnkiLinkStatus,
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,
} from '../shared/anki';
import type { DueForecast } from '../shared/reviewForecast';
import type { PitchLookup } from '../shared/pitchAccent';
import type { ApkgImportResult } from '../shared/apkgParse';
import type { AssetError, AssetSpec, AssetStatus } from '../shared/assetRegistry';
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
} from '../shared/mining';
import type { ProfileId, ProfileSnapshot, StudyProfile } from '../shared/profiles';
import type { ProfileRulesStore } from '../shared/profileRules';
import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
} from '../shared/desktop';
import type {
  ImmersionDayMetrics,
  ImmersionMetricsDelta,
  ImmersionMetricsMap,
  ImmersionSaveSiteInput,
  ImmersionSession,
  ImmersionSite,
  ImmersionSitesStore,
  ImmersionVisitInput,
} from '../shared/immersion';
import type { AppReleaseInfo } from '../shared/release';
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
} from '../shared/jiten';
import type { CityStateMessage } from '../main/city/ipc/channels';
import type { ReadingLensStatus, LensInit, LensOpenMode } from '../main/readingLens';
import type { LensOcrResult, RegionRect } from '../main/screenOcr';

// Describes the `window.api` bridge exposed by the preload script.
declare global {
  interface Window {
    api: {
      relaunchApp(): Promise<{ ok: boolean }>;
      launchAutomationBuilder(): Promise<import('../shared/automationBuilder').AutomationBuilderLaunchResult>;
      toolboxPickSearchFolder(): Promise<string | null>;
      toolboxFileSearch(
        request: import('../shared/toolboxFileSearch').ToolboxFileSearchRequest,
      ): Promise<import('../shared/toolboxFileSearch').ToolboxFileSearchResponse>;
      listLibrary(): Promise<LibraryItem[]>;
      importFiles(): Promise<LibraryItem[]>;
      importFolder(): Promise<LibraryItem[]>;
      removeItem(id: string): Promise<LibraryItem[]>;
      getLibraryFolders(): Promise<string[]>;
      setLibraryFolders(folders: string[]): Promise<{ folders: string[]; items: LibraryItem[] }>;
      setItemFolder(id: string, folder: string | null): Promise<LibraryItem[]>;
      setLibraryCover(id: string, pageRelPath: string): Promise<LibraryItem[]>;
      getFilePath(file: File): string;
      importPaths(paths: string[]): Promise<LibraryItem[]>;
      fetchPage(url: string): Promise<{ ok: boolean; html?: string; url?: string; error?: string }>;
      extractReadableArticle(url: string): Promise<{
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
      }>;
      fetchReadingContent(
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
      }>;
      fetchJson(url: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
      importGenerated(payload: { title: string; html: string; source?: string }): Promise<LibraryItem[]>;
      updateInboxMeta(
        id: string,
        patch: Partial<NonNullable<LibraryItem['inboxMeta']>>,
      ): Promise<LibraryItem[]>;
      updateLevelMeta(
        id: string,
        patch: NonNullable<LibraryItem['levelMeta']>,
        opts?: { broadcast?: boolean },
      ): Promise<LibraryItem[]>;
      addMediaPaths(paths: string[]): Promise<MediaItem[]>;
      getWallpaper(): Promise<string | null>;
      pickWallpaper(): Promise<{
        id: string;
        path: string;
        url: string;
        kind: 'image';
        label: string;
      } | null>;
      setWallpaperFromPath(filePath: string): Promise<string | null>;
      /** Image path for living-layer playlists (does not change shell wallpaper). */
      pickEnvImage(): Promise<string | null>;
      /** Windows-style slideshow: pick a folder of images. */
      pickWallpaperFolder(): Promise<{ folder: string; images: string[] } | null>;
      listWallpaperFolder(folder: string): Promise<string[]>;
      imageFileUrl(filePath: string): Promise<string | null>;
      clearWallpaper(): Promise<null>;
      pickShortcut(): Promise<{ target: string; name: string; icon: string } | null>;
      launchTarget(target: string): Promise<string | null>;
      mediaFileUrl(p: string): Promise<string | null>;
      pickWallpaperVideo(): Promise<{
        id: string;
        path: string;
        url: string;
        kind: 'video';
        label: string;
      } | null>;
      setProgress(id: string, progress: Progress): Promise<void>;
      getMangaPages(id: string): Promise<string[]>;
      readMangaPage(mediaUrl: string): Promise<string | null>;
      // Bulk book OCR: scanned PDF / image archive -> readable EPUB.
      bookOcrRun(
        req: import('../shared/bookOcrIpc').BookOcrRequest,
      ): Promise<import('../shared/bookOcrIpc').BookOcrResult>;
      bookOcrCancel(itemId: string): Promise<{ ok: boolean }>;
      bookOcrStatus(itemId: string): Promise<{ running: boolean }>;
      onBookOcrProgress(
        cb: (p: import('../shared/bookOcrIpc').BookOcrProgress) => void,
      ): () => void;

      mangaOcrAvailable(): Promise<boolean>;
      mangaOcrLoadCache(
        itemId: string,
        mediaUrl: string,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrScanPage(
        req: import('../shared/mangaOcrIpc').MangaOcrScanRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage>;
      mangaOcrSaveCorrection(
        req: import('../shared/mangaOcrIpc').MangaOcrCorrectionRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrRescanRegion(
        req: import('../shared/mangaOcrIpc').MangaOcrRegionRescanRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrMergeRegions(
        req: import('../shared/mangaOcrIpc').MangaOcrMergeRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrSplitRegion(
        req: import('../shared/mangaOcrIpc').MangaOcrSplitRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrAddRegion(
        req: import('../shared/mangaOcrIpc').MangaOcrAddRegionRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrSaveOrder(
        req: import('../shared/mangaOcrIpc').MangaOcrOrderRequest,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrRecognizeImage(dataUrl: string): Promise<string>;
      onMangaOcrProgress(cb: (p: import('../shared/mangaOcrIpc').MangaOcrProgress) => void): () => void;
      mangaOcrLoadTranslateCache(
        itemId: string,
        mediaUrl: string,
        targetLang?: string,
      ): Promise<import('../shared/mokuroTypes').MokuroPage | null>;
      mangaOcrSaveTranslateCache(
        itemId: string,
        mediaUrl: string,
        targetLang: string,
        page: import('../shared/mokuroTypes').MokuroPage,
      ): Promise<{ ok: boolean }>;
      mangaOcrAnalyzeVolume(req: import('../shared/mangaOcrIpc').MangaOcrVolumeRequest): Promise<{
        ok: boolean;
        cancelled?: boolean;
        error?: string;
        ocrMeta?: import('../shared/types').LibraryItem['ocrMeta'];
      }>;
      mangaOcrCancelVolume(itemId: string): Promise<{ ok: boolean }>;
      mangaOcrRefreshMeta(
        itemId: string,
        targetLang?: string,
      ): Promise<import('../shared/types').LibraryItem['ocrMeta'] | null>;
      onMangaOcrVolumeProgress(
        cb: (p: import('../shared/mangaOcrIpc').MangaOcrVolumeProgress) => void,
      ): () => void;
      readBook(id: string): Promise<ArrayBuffer | null>;
      sampleBookText(id: string, maxChars?: number): Promise<string | null>;
      getWatchFolder(): Promise<string | null>;
      setWatchFolder(): Promise<{ folder: string | null; items: LibraryItem[] }>;
      clearWatchFolder(): Promise<null>;
      syncLibrary(): Promise<LibraryItem[]>;
      lookupWord(query: string): Promise<DictResult>;
      lookupTerm(query: string): Promise<DictResult>;
      lookupTermOffline(query: string): Promise<DictResult>;
      lookupTermsBatch(
        queries: Array<{ expression: string; reading?: string }>,
        langs: Array<'en' | 'ja' | 'zh' | 'ru'>,
      ): Promise<Record<string, { en?: string; ja?: string; zh?: string; ru?: string }>>;
      searchExamples(query: string, limit?: number): Promise<ExampleResult>;
      examplesOfflineStatus(): Promise<{ installed: boolean; sentenceCount: number; updatedAt: number }>;
      examplesImportOffline(payload?: {
        sentencesPath?: string;
        linksPath?: string;
      }): Promise<{ ok: boolean; added: number; error?: string }>;
      dictImportYomitan(filePath?: string): Promise<{ ok: boolean; error?: string; info?: YomitanDictInfo }>;
      dictListYomitan(): Promise<YomitanDictInfo[]>;
      dictRemoveYomitan(id: string): Promise<{ ok: boolean; error?: string }>;
      dictSetYomitanEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>;
      dictMoveYomitan(id: string, dir: number): Promise<{ ok: boolean; error?: string }>;
      ankiStatus(): Promise<AnkiStatus>;
      ankiAddNote(req: AnkiAddRequest): Promise<AnkiAddResult>;
      ankiKnownWords(): Promise<{ ok: boolean; error?: string; words?: Record<string, number> }>;
      profileGet(): Promise<ProfileSnapshot & { legacyMigrated: boolean }>;
      profileList(): Promise<StudyProfile[]>;
      profileSwitch(id: ProfileId): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }>;
      profileCreate(name: string): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }>;
      profileDelete(id: ProfileId): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }>;
      profileUpdate(
        id: ProfileId,
        patch: Partial<StudyProfile>,
      ): Promise<{ ok: boolean; error?: string; snapshot: ProfileSnapshot }>;
      profileMigrateLegacy(values: { deck?: string; model?: string }): Promise<ProfileSnapshot>;
      onProfileChanged(cb: (snap: ProfileSnapshot) => void): () => void;
      ankiLinkState(): Promise<AnkiLinkStatus>;
      onAnkiLinkChanged(cb: (s: AnkiLinkStatus) => void): () => void;
      ankiMineNote(req: MineNoteRequest): Promise<MineNoteResult>;
      ankiDeleteNotes(noteIds: number[]): Promise<{ ok: boolean; error?: string }>;
      ankiEnsureModel(id?: ProfileId): Promise<EnsureModelResult>;
      ankiModelFields(modelName: string): Promise<{ ok: boolean; fields: string[]; error?: string }>;
      ankiGetIntervals(opts?: { maxAgeMs?: number }): Promise<IntervalSnapshot>;
      /** Read-only week-ahead due counts from Anki's own scheduler. */
      ankiDueForecast(): Promise<DueForecast>;
      /** Structured pitch-accent data for a term. */
      dictPitch(term: string, reading?: string): Promise<PitchLookup>;
      importApkg(filePath?: string): Promise<ApkgImportResult>;
      onAnkiIntervalsChanged(cb: (s: IntervalSnapshot) => void): () => void;
      desktopGetLayout(): Promise<DesktopLayoutSnapshot>;
      desktopCommitLayout(
        desktopIndex: DesktopIndex,
        layout: DesktopLayout,
      ): Promise<{ ok: boolean; error?: string }>;
      desktopSwitch(
        targetIndex: DesktopIndex,
      ): Promise<{ ok: boolean; error?: string; snapshot: DesktopLayoutSnapshot }>;
      desktopMigrateLegacy(values: {
        wins?: unknown;
        icons?: unknown;
        notes?: unknown;
        wall?: unknown;
      }): Promise<DesktopLayoutSnapshot>;
      onDesktopChanged(cb: (snap: DesktopLayoutSnapshot) => void): () => void;
      popOut(section: string): Promise<void>;
      popoutListOpen(): Promise<string[]>;
      onPopoutChanged(cb: (sections: string[]) => void): () => void;
      popoutControl(action: 'minimize' | 'maximize' | 'close'): Promise<void>;
      miniOpen(size?: { width?: number; height?: number }): Promise<{ ok: boolean }>;
      miniClose(): Promise<{ ok: boolean }>;
      miniSetSize(size: { width: number; height: number }): Promise<{ ok: boolean }>;
      miniIsOpen(): Promise<boolean>;
      miniFocusMain(): Promise<void>;
      blancOpen(size?: { width?: number; height?: number }): Promise<{ ok: boolean }>;
      blancClose(): Promise<{ ok: boolean }>;
      blancIsOpen(): Promise<boolean>;
      blancSetFullScreen(on: boolean): Promise<{ ok: boolean }>;
      blancSetGlobalShortcut(chord: string): Promise<{ ok: boolean; error?: string }>;
      lockscreenOpen(size?: { width?: number; height?: number }): Promise<{ ok: boolean }>;
      lockscreenUnlock(): Promise<{ ok: boolean }>;
      lockscreenSetSize(size: { width: number; height: number }): Promise<{ ok: boolean }>;
      lockscreenIsOpen(): Promise<boolean>;
      onLockscreenUnlocked(cb: () => void): () => void;
      companionHostSetEnabled(enabled: boolean, span?: 'primary' | 'all'): Promise<{ ok: boolean }>;
      companionHostSetSpan(span: 'primary' | 'all'): Promise<{ ok: boolean }>;
      companionHostIsOpen(): Promise<boolean>;
      companionHostGetDisplays(): Promise<
        {
          id: number;
          bounds: { x: number; y: number; width: number; height: number };
          workArea: { x: number; y: number; width: number; height: number };
          primary: boolean;
          scaleFactor: number;
        }[]
      >;
      companionHostGetViewport(): Promise<{
        span: 'primary' | 'all';
        bounds: { x: number; y: number; width: number; height: number };
        primaryWorkArea: { x: number; y: number; width: number; height: number };
      }>;
      companionHostPushState(state: unknown): void;
      companionHostSetClickThrough(through: boolean): void;
      companionHostFocusMain(): Promise<void>;
      companionHostRunRoutine(companionId: string, routineId: string): void;
      onCompanionHostState(cb: (state: unknown) => void): () => void;
      onCompanionHostWake(cb: () => void): () => void;
      onBuddyRun(cb: (payload: { companionId: string; routineId: string }) => void): () => void;
      buddySchedulerSync(
        entries: Array<{ routineId: string; forType?: string; startHour: number; endHour: number }>,
      ): void;
      onBuddyTrigger(cb: (payload: { routineId: string; forType?: string }) => void): () => void;
      playerWindowId(): Promise<number>;
      playerGetSnapshot(): Promise<import('../shared/playerSync').PlayerSnapshot | null>;
      playerPublish(snap: import('../shared/playerSync').PlayerSnapshot): void;
      playerSendCommand(cmd: import('../shared/playerSync').PlayerCommand): void;
      onPlayerSync(cb: (snap: import('../shared/playerSync').PlayerSnapshot) => void): () => void;
      onPlayerCommand(cb: (cmd: import('../shared/playerSync').PlayerCommand) => void): () => void;
      openExternal(url: string): Promise<boolean>;
      getWindowBorderless(): Promise<boolean>;
      setWindowBorderless(borderless: boolean): Promise<boolean>;
      getWindowChromeMode(): Promise<'standard' | 'borderless' | 'frameless'>;
      setWindowChromeMode(mode: 'standard' | 'borderless' | 'frameless'): Promise<'standard' | 'borderless' | 'frameless'>;
      appVersion(): Promise<string>;
      checkAppRelease(): Promise<AppReleaseInfo | null>;
      catalogGet(): Promise<import('../shared/resourcesCatalog').ResourcesCatalog | null>;
      catalogRefresh(): Promise<import('../shared/resourcesCatalog').ResourcesCatalog | null>;
      novelsGet(): Promise<import('../shared/resourcesCatalog').NovelsCatalog | null>;
      novelsRefresh(): Promise<import('../shared/resourcesCatalog').NovelsCatalog | null>;
      jitenGetStore(): Promise<JitenStore>;
      jitenUpdateConfig(patch: Partial<JitenConfig>): Promise<JitenStore>;
      jitenSetSourceProfiles(profiles: JitenSourceProfile[]): Promise<JitenStore>;
      jitenSearchDecks(request: JitenSearchRequest): Promise<JitenSearchResult>;
      jitenGetDeckDetail(deckId: number): Promise<JitenDeck | null>;
      jitenGetDeckStats(deckId: number): Promise<JitenDeckStats | null>;
      jitenPlanFromDeck(deck: JitenDeck): Promise<JitenPlanEntry | null>;
      jitenUpsertPlan(entry: JitenPlanEntry): Promise<JitenStore>;
      jitenUpdatePlan(id: string, patch: Partial<JitenPlanEntry>): Promise<JitenStore>;
      jitenRemovePlan(id: string): Promise<JitenStore>;
      jitenImportDirectEpub(input: JitenImportDirectRequest): Promise<JitenImportDirectResult>;
      jitenDownloadDeck(
        deckId: number,
        options?: Partial<JitenDeckDownloadOptions>,
      ): Promise<{ ok: boolean; content?: string; contentType?: string; filename?: string; error?: string }>;
      jitenCacheCover(
        planId: string,
        deckId: number,
        coverUrl: string,
      ): Promise<{ ok: boolean; relPath?: string; error?: string }>;
      toolsList(): Promise<import('../shared/collectedTools').CollectedToolsStore>;
      toolsAdd(input: import('../shared/collectedTools').CollectToolInput): Promise<{
        ok: boolean;
        tool?: import('../shared/collectedTools').CollectedTool;
        duplicate?: boolean;
        error?: string;
      }>;
      toolsRemove(id: string): Promise<{
        ok: boolean;
        store?: import('../shared/collectedTools').CollectedToolsStore;
        error?: string;
      }>;
      toolsUpdate(
        id: string,
        patch: import('../shared/collectedTools').UpdateToolInput,
      ): Promise<{ ok: boolean; tool?: import('../shared/collectedTools').CollectedTool; error?: string }>;
      statsPing(): Promise<{ ok: boolean; sent: boolean }>;
      statsCounts(): Promise<import('../shared/stats').CountryCounts | null>;
      translateRun(req: {
        id: number;
        text: string;
        source: string;
        target: string;
      }): Promise<{ ok: boolean; text?: string; error?: string }>;
      translateRunBatch(req: {
        items: Array<{ id: string; text: string; source: string; target: string }>;
      }): Promise<{ ok: boolean; results?: Array<{ id: string; text: string }>; error?: string }>;
      translateStatus(): Promise<{ ready: boolean; modelFound: boolean; modelPath: string | null }>;
      onTranslateModelProgress(
        cb: (p: { status?: string; file?: string; progress?: number }) => void,
      ): () => void;
      onTranslatePartial(cb: (p: { id: number; progress: number }) => void): () => void;
      translateAnalyze(
        req: import('../shared/translateAnalysisCore').TranslateAnalyzeRequest,
      ): Promise<{
        ok: boolean;
        result?: import('../shared/translateAnalysisCore').TranslateAnalysisResult;
        error?: string;
      }>;
      listMedia(): Promise<MediaItem[]>;
      coverArt(id: string): Promise<string | null>;
      pickMedia(): Promise<MediaOpen | null>;
      openMedia(id: string): Promise<MediaOpen | null>;
      removeMedia(id: string): Promise<MediaItem[]>;
      pruneMedia(): Promise<{ removed: number; items: MediaItem[] }>;
      clearMediaLibrary(): Promise<MediaItem[]>;
      setMediaPosition(id: string, sec: number): Promise<void>;
      setMediaSubOffset(id: string, sec: number): Promise<void>;
      extractAudio(url: string): Promise<ArrayBuffer>;
      convertMedia(url: string): Promise<MediaOpen | null>;
      downloadYouTube(url: string, audioOnly?: boolean, options?: YouTubeDownloadOptions): Promise<MediaOpen | { error: string }>;
      onYoutubeProgress(cb: (p: { stage: string; percent: number }) => void): () => void;
      pickSubtitle(): Promise<SubtitlePick | null>;
      getMediaWatchFolder(): Promise<string | null>;
      setMediaWatchFolder(): Promise<{ folder: string | null; items: MediaItem[] }>;
      clearMediaWatchFolder(): Promise<null>;
      onMediaChanged(cb: (items: MediaItem[]) => void): () => void;
      ytList(): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytSaveFolders(
        folders: import('../shared/ytPlaylists').YtPlaylistFolder[],
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytSaveFolder(
        folder: import('../shared/ytPlaylists').YtPlaylistFolder,
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytDeleteFolder(folderId: string): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytAddPlaylist(
        url: string,
      ): Promise<
        | {
            store: import('../shared/ytPlaylists').YtPlaylistsStore;
            playlist: import('../shared/ytPlaylists').YtPlaylist;
          }
        | { error: string }
      >;
      ytRefreshPlaylist(
        playlistId: string,
      ): Promise<
        | {
            store: import('../shared/ytPlaylists').YtPlaylistsStore;
            playlist: import('../shared/ytPlaylists').YtPlaylist;
          }
        | { error: string }
      >;
      ytRemovePlaylist(playlistId: string): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytSetPlaylistPrefs(
        playlistId: string,
        prefs: Partial<{
          lang: import('../shared/ytPlaylists').YtStudyLang;
          preferSubs: import('../shared/ytPlaylists').YtSubLang[];
          autoUpdate: boolean;
          sortDefault: import('../shared/ytPlaylists').YtPlaylistSort;
          folderId: string | null;
          title: string;
        }>,
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore | { error: string }>;
      ytDownloadVideos(videoIds: string[]): Promise<{
        store: import('../shared/ytPlaylists').YtPlaylistsStore;
        results: Array<{ videoId: string; ok: boolean; error?: string; mediaItemId?: string }>;
      }>;
      ytFetchSubsOnly(videoIds: string[]): Promise<{
        store: import('../shared/ytPlaylists').YtPlaylistsStore;
        results: Array<{ videoId: string; ok: boolean; error?: string }>;
      }>;
      ytMarkTranscribed(
        youtubeId: string,
        cuesJson: string,
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore | { error: string }>;
      ytAutoUpdateDue(): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytRefreshAll(): Promise<{
        store: import('../shared/ytPlaylists').YtPlaylistsStore;
        newVideoIds: string[];
        errors: Array<{ playlistId: string; title: string; error: string }>;
      }>;
      ytAddToPlanToWatch(
        videoIds: string[],
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytRemoveFromPlanToWatch(
        videoIds: string[],
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      onYtChanged(cb: (store: import('../shared/ytPlaylists').YtPlaylistsStore) => void): () => void;
      onYtDownloadProgress(
        cb: (p: {
          videoId: string;
          index: number;
          total: number;
          stage: string;
          percent: number;
        }) => void,
      ): () => void;
      onYtRefreshProgress(
        cb: (p: {
          playlistId: string;
          index: number;
          total: number;
          stage: string;
          title: string;
        }) => void,
      ): () => void;
      onLibraryChanged(cb: (items: LibraryItem[]) => void): () => void;
      miningGetConfig(): Promise<TraditionalMiningConfig>;
      miningSetConfig(config: TraditionalMiningConfig): Promise<TraditionalMiningConfig>;
      miningListFrequencyDicts(): Promise<FrequencyDictionarySummary[]>;
      miningImportFrequencyDict(filePath?: string): Promise<{ ok: boolean; error?: string }>;
      miningRemoveFrequencyDict(id: string): Promise<{ ok: boolean; error?: string }>;
      miningSetFrequencyEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>;
      miningAnalyzeEpub(
        itemId: string,
        config?: Partial<TraditionalMiningConfig>,
      ): Promise<EpubMiningAnalysis>;
      miningCancelAnalyze(): Promise<{ ok: boolean }>;
      miningEnrichCandidate(
        candidate: MiningCandidate,
        config?: Partial<TraditionalMiningConfig>,
      ): Promise<MiningCandidate>;
      onMiningEnrichProgress(
        cb: (p: import('../../shared/mining').MiningEnrichProgress) => void,
      ): () => void;
      miningRenderEpubDeck(
        analysis: EpubMiningAnalysis,
        config?: Partial<TraditionalMiningConfig>,
      ): Promise<{
        deck: EpubDeckExport;
        enrichedCandidates: MiningCandidate[];
        warnings?: string[];
        cancelled?: boolean;
      }>;
      miningBuildEpubDeck(
        itemId: string,
        config?: Partial<TraditionalMiningConfig>,
      ): Promise<{
        deck: EpubDeckExport;
        enrichedCandidates: MiningCandidate[];
        warnings?: string[];
        cancelled?: boolean;
      }>;
      miningSaveEpubDeckCsv(
        csv: string,
        title?: string,
      ): Promise<{ ok: boolean; path?: string; error?: string }>;
      miningSaveEpubDeckFile(
        content: string,
        title?: string,
        ext?: string,
      ): Promise<{ ok: boolean; path?: string; error?: string }>;
      aiGetConfig(): Promise<AiEngineConfig>;
      aiSetApiKey(payload: string | {
        provider?: AiProviderKeyBucket;
        apiKey?: string;
      }): Promise<{ ok: boolean; apiKeySet: boolean; apiKeysSet: { gemini: boolean; deepseek: boolean }; error?: string; savedBucket?: AiProviderKeyBucket }>;
      aiSetProvider(providerId: AiProviderId): Promise<{
        ok: boolean;
        providerId: AiProviderId;
        apiKeySet: boolean;
        apiKeysSet: { gemini: boolean; deepseek: boolean };
      }>;
      aiListPresets(): Promise<AiPromptPreset[]>;
      aiListFormats(): Promise<AiMiningCardFormat[]>;
      aiSelectPreset(presetId: string): Promise<{
        ok: boolean;
        selectedPresetId: string;
        selectedFormatId: string;
        outputFormat: 'anki' | 'csv';
        cardCount: number;
      }>;
      aiSetFormat(payload: {
        formatId: string;
        cardCount?: number;
        outputFormat?: 'anki' | 'csv';
      }): Promise<{
        ok: boolean;
        selectedFormatId: string;
        outputFormat: 'anki' | 'csv';
        cardCount: number;
      }>;
      aiSetLanguageOptions(payload: Partial<AiLanguageOptions>): Promise<{
        ok: boolean;
        frontLang: AiMiningLanguage;
        backLang: AiMiningLanguage;
        reverse: boolean;
        backGlossLangs: AiMiningLanguage[];
      }>;
      aiEnrichCard(req: AiEnrichmentRequest): Promise<AiEnrichmentResult>;
      aiGenerateDeck(req: AiDeckGenerationRequest): Promise<AiEnrichmentResult[]>;
      onAiGenerateProgress(cb: (p: import('../../shared/mining').AiGenerationProgress) => void): () => void;
      aiSaveCsv(csv: string): Promise<{ ok: boolean; path?: string; error?: string }>;
      immersionListSites(): Promise<ImmersionSitesStore>;
      immersionSaveSite(
        input: ImmersionSaveSiteInput,
      ): Promise<{ ok: boolean; site?: ImmersionSite; error?: string }>;
      immersionRemoveSite(
        id: string,
      ): Promise<{ ok: boolean; store?: ImmersionSitesStore; error?: string }>;
      immersionRecordVisit(
        input: ImmersionVisitInput,
      ): Promise<{ ok: boolean; site?: ImmersionSite; error?: string }>;
      immersionGetSession(): Promise<ImmersionSession>;
      immersionSetSession(session: ImmersionSession): Promise<{ ok: boolean; error?: string }>;
      immersionGetMetrics(): Promise<{
        dayKey: string;
        today: ImmersionDayMetrics;
        all: ImmersionMetricsMap;
      }>;
      immersionBumpMetrics(
        delta: ImmersionMetricsDelta,
      ): Promise<{ ok: boolean; today: ImmersionDayMetrics }>;
      onImmersionSitesChanged(cb: (store: ImmersionSitesStore) => void): () => void;
      onImmersionMetricsChanged(
        cb: (p: { dayKey: string; metrics: ImmersionDayMetrics; all: ImmersionMetricsMap }) => void,
      ): () => void;
      systemGetMetrics(): Promise<{
        cpuLoad: number;
        freemem: number;
        totalmem: number;
        platform: string;
        uptime: number;
        battery?: number | null;
        onBattery?: boolean | null;
      }>;
      clipboardReadText(): Promise<string>;
      logRendererError(payload: { subsystem?: string; operation?: string; detail?: string }): Promise<void>;

      // System-wide popup dictionary
      sysDictGetSettings(): Promise<{
        enabled: boolean;
        hotkey: string;
        supported: boolean;
        registered: boolean;
      }>;
      sysDictSetEnabled(
        enabled: boolean,
      ): Promise<{ enabled: boolean; hotkey: string; supported: boolean; registered: boolean }>;
      sysDictSetHotkey(hotkey: string): Promise<{
        ok: boolean;
        error?: string;
        status: { enabled: boolean; hotkey: string; supported: boolean; registered: boolean };
      }>;
      sysDictGetPending(): Promise<string>;
      sysDictClose(): Promise<void>;
      sysDictLookupClipboard(): Promise<void>;
      onSysDictQuery(cb: (query: string) => void): () => void;
      onSysDictSettingsChanged(
        cb: (status: {
          enabled: boolean;
          hotkey: string;
          supported: boolean;
          registered: boolean;
        }) => void,
      ): () => void;

      // Reading Lens — OS-wide screen-region OCR reader
      lensGetSettings(): Promise<ReadingLensStatus>;
      lensSetEnabled(enabled: boolean): Promise<ReadingLensStatus>;
      lensSetHotkey(
        hotkey: string,
      ): Promise<{ ok: boolean; error?: string; status: ReadingLensStatus }>;
      lensOpen(mode?: LensOpenMode): Promise<void>;
      lensGetInit(): Promise<LensInit | null>;
      lensOcr(
        region: RegionRect & { engine?: 'auto' | 'manga' | 'web' },
      ): Promise<LensOcrResult>;
      lensSetInteractive(interactive: boolean): void;
      lensClose(): Promise<void>;
      onLensOpen(cb: (init: LensInit) => void): () => void;
      onLensSettingsChanged(cb: (status: ReadingLensStatus) => void): () => void;

      // Downloadable models & dictionaries (Phase 6)
      assetsList(): Promise<{ assets: AssetSpec[]; statuses: AssetStatus[] }>;
      assetsStart(id: string): Promise<{ ok: boolean; error?: AssetError }>;
      assetsPause(id: string): Promise<void>;
      assetsCancel(id: string): Promise<void>;
      assetsRemove(id: string): Promise<{ ok: boolean; error?: AssetError }>;
      assetsIsInstalled(id: string): Promise<boolean>;
      assetsPath(id: string): Promise<string | null>;
      assetsReadText(id: string): Promise<string | null>;
      assetsFreeSpace(): Promise<number>;
      assetsRoot(): Promise<string>;
      onAssetStatus(cb: (status: AssetStatus) => void): () => void;
      onAssetUnload(cb: (id: string) => void): () => void;
      setUiLang(lang: string): void;

      // Noctis Civilization Module (read-only mirror, refreshed by push).
      cityGetState(): Promise<CityStateMessage>;
      cityRecordSession(packet: import('../main/city/ipc/channels').CitySessionPacket): Promise<CityStateMessage>;
      onCityChanged(cb: (message: CityStateMessage) => void): () => void;
      extensionStatus(): Promise<{
        running: boolean;
        port: number;
        token: string;
        folderPath: string;
        extensionVersion: string;
      }>;
      extensionRegenerateToken(): Promise<{ running: boolean; port: number; token: string; folderPath: string }>;
      extensionRevealFolder(): Promise<string | null>;
      onExtensionMined(
        cb: (payload: {
          mode: 'word' | 'sentence';
          term: string;
          sentence?: string;
          text: string;
          url?: string;
          title?: string;
          folder?: string;
          anki: { ok: boolean; noteId?: number; error?: string };
        }) => void,
      ): () => void;
      onExtensionClipboardAppend(
        cb: (payload: { text: string; type?: string; url?: string; title?: string }) => void,
      ): () => void;
      onExtensionUiOpen(
        cb: (payload: {
          target: string;
          functions?: string | string[];
          level?: string;
          levels?: string[];
          lang?: string;
        }) => void,
      ): () => void;
      extensionFocusMainAndOpen(target: string): Promise<{ ok: boolean }>;
      onKnownLevelsRequest(cb: (payload: { id: string; terms: string[] }) => void): () => void;
      replyKnownLevels(id: string, levels: Record<string, number>): void;
      onKnownLevelSet(cb: (payload: { id: string; term: string; level: number }) => void): () => void;
      replyKnownLevelSet(id: string, result: { ok: boolean; error?: string }): void;
      onComprehensibilityRequest(cb: (payload: { id: string; text: string }) => void): () => void;
      replyComprehensibility(
        id: string,
        result: { ok: boolean; percent?: number; known?: number; total?: number; error?: string },
      ): void;
      onGrammarMatchRequest(cb: (payload: { id: string; text: string }) => void): () => void;
      replyGrammarMatch(
        id: string,
        result: {
          ok: boolean;
          matches?: Array<{ id: string; title: string; level: string; meaning: string }>;
          error?: string;
        },
      ): void;
      onExtensionTranslationResult(
        cb: (payload: {
          sourceLang: string;
          targetLang: string;
          sourceText: string;
          resultText: string;
        }) => void,
      ): () => void;
      onLevelEstimateRequest(cb: (payload: { id: string; text: string }) => void): () => void;
      replyLevelEstimate(
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
      ): void;
      onClipboardListRequest(cb: (payload: { id: string }) => void): () => void;
      replyClipboardList(
        id: string,
        entries: Array<{ id: string; type: string; text: string; createdAt: number }>,
      ): void;
      onExtensionTranscribeRequest(cb: (payload: { id: string; pcmBase64: string }) => void): () => void;
      replyExtensionTranscribe(
        id: string,
        result: { ok: boolean; text?: string; error?: string },
      ): void;
      profileRulesGet(): Promise<ProfileRulesStore>;
      profileRulesSet(store: unknown): Promise<ProfileRulesStore>;

      // ---- Seanime sidecar (Phase 1 dev-only proof) ----
      seanimeStatus(): Promise<import('../shared/seanime').SeanimeStatus>;
      seanimeStart(): Promise<import('../shared/seanime').SeanimeStatus>;
      seanimeStop(): Promise<import('../shared/seanime').SeanimeStatus>;
      seanimeProbe(): Promise<
        | { ok: true; result: import('../shared/seanime').SeanimeProbeResult }
        | { ok: false; error: string }
      >;
      seanimeConnection(): Promise<import('../shared/seanime').SeanimeConnection>;
      onSeanimeStatus(
        cb: (s: import('../shared/seanime').SeanimeStatus) => void,
      ): () => void;
    };
  }
}

export {};

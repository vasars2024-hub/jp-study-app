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
  DeleteMinedNotesResult,
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,
} from '../shared/anki';
import type { AnimeScheduleRequest, AnimeScheduleResponse } from '../shared/animeSchedule';
import type { DueForecast } from '../shared/reviewForecast';
import type { PitchLookup } from '../shared/pitchAccent';
import type { ApkgImportResult } from '../shared/apkgParse';
import type { ApkgCardsResult } from '../shared/apkgCards';
import type { AssetError, AssetSpec, AssetStatus } from '../shared/assetRegistry';
import type { ReverifyOutcome, AssetIntegrity } from '../main/downloads';
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
import type { LocalAgentModelInfo, LocalAgentPlanRequest, LocalAgentPlanResponse, LocalAgentRuntimeStatus } from '../shared/localAgentRuntime';
import type { AgentAutomation } from '../shared/localAgentAutomation';
import type {
  AgentExecutionCancelResult,
  AgentExecutionEvent,
  AgentExecutionRequest,
  AgentExecutionResult,
} from '../shared/agentExecutionBridge';
import type {
  AgentNavigationRequest,
  AgentNavigationResult,
} from '../shared/agentNavigationBridge';
import type { AgentWorkspaceState } from '../shared/agentWorkspace';
import type { AgentWorkspaceResult } from '../shared/agentWorkspaceBridge';
import type {
  AgentImageStageRequest,
  AgentImageStageResult,
  AgentImageTakeResult,
} from '../shared/agentImageStaging';
import type {
  AgentCardBatchStageRequest,
  AgentCardBatchStageResult,
  AgentCardBatchTakeResult,
} from '../shared/agentCardBatchStaging';
import type {
  AgentOperationalState,
  LegacyAgentOperationalPayload,
} from '../shared/agentOperationalState';
import type { AgentOperationalResult } from '../shared/agentOperationalBridge';
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
} from '../shared/agentExecutionLeaseBridge';
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
} from '../shared/mediaStudyOrchestrator';
import type { ProfileId, ProfileSnapshot, StudyProfile } from '../shared/profiles';
import type { ProfileRulesStore } from '../shared/profileRules';
import type {
  DesktopIndex,
  DesktopLayout,
  DesktopLayoutSnapshot,
  DisplayAssignment,
} from '../shared/desktop';
import type { DisplaySummary } from '../main/displays';
import type { DeskWindowInfo } from '../main/desktopWindows';
import type { DeskDragKind } from '../main/deskDrag';
import type { DropPlan } from '../main/fileRouter';
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
import type { ReadingLensStatus, LensInit, LensOpenMode } from '../main/readingLens';
import type { LensOcrResult, RegionRect } from '../main/screenOcr';

// Describes the `window.api` bridge exposed by the preload script.
declare global {
  interface Window {
    api: {
      relaunchApp(): Promise<{ ok: boolean }>;
      launchAutomationBuilder(): Promise<import('../shared/automationBuilder').AutomationBuilderLaunchResult>;
      automationBuilderCommand(): Promise<string | null>;
      toolboxPickSearchFolder(): Promise<string | null>;
      toolboxFileSearch(
        request: import('../shared/toolboxFileSearch').ToolboxFileSearchRequest,
      ): Promise<import('../shared/toolboxFileSearch').ToolboxFileSearchResponse>;
      listLibrary(): Promise<LibraryItem[]>;
      importFiles(): Promise<LibraryItem[]>;
      /** Imports a `.cbz`/`.zip` the caller already has a path for. */
      importArchivePath(filePath: string): Promise<{
        ok: boolean;
        item?: LibraryItem;
        alreadyPresent?: boolean;
        error?: string;
      }>;
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
        /** OCR succeeded but one or more pages produced no translation. */
        warning?: string;
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
      lookupOfflineInterlinear(
        text: string,
        options?: import('../shared/lexiconInterlinear').LexiconInterlinearOptions,
      ): Promise<import('../shared/lexiconInterlinear').LexiconInterlinearResult>;
      lookupChinese(query: string): Promise<DictResult>;
      resetChineseDictCache(): Promise<void>;
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
      dictImportStart(
        request: import('../shared/dictionaryImportJob').DictionaryImportRequest,
      ): Promise<
        | { ok: true; snapshot: import('../shared/dictionaryImportJob').DictionaryImportJobSnapshot }
        | { ok: false; error: string; snapshot?: import('../shared/dictionaryImportJob').DictionaryImportJobSnapshot }
      >;
      dictImportCancel(jobId?: string): Promise<{
        ok: boolean;
        snapshot: import('../shared/dictionaryImportJob').DictionaryImportJobSnapshot | null;
      }>;
      dictImportStatus(): Promise<import('../shared/dictionaryImportJob').DictionaryImportJobSnapshot | null>;
      dictImportPick(kind: 'cedict' | 'wiktextract' | 'dsl' | 'jmnedict' | 'kanjidic' | 'stardict' | 'tatoeba'): Promise<{ canceled: boolean; filePath?: string; linksFilePath?: string }>;
      onDictImportChanged(
        cb: (snapshot: import('../shared/dictionaryImportJob').DictionaryImportJobSnapshot) => void,
      ): () => void;
      dictSemanticNeighbors(
        text: string,
        options?: { sourceLangs?: string[]; glossLangs?: string[] },
      ): Promise<import('../shared/lexiconNeighbors').LexiconNeighborResult>;
      dictCompounds(
        text: string,
        options?: { sourceLangs?: string[]; glossLangs?: string[] },
      ): Promise<import('../shared/lexiconCompounds').LexiconCompoundResult>;
      dictEtymology(
        text: string,
        options?: { sourceLangs?: string[] },
      ): Promise<import('../shared/lexiconEtymology').LexiconEtymologyResult>;
      dictConjugation(word: string): Promise<import('../shared/conjugationClass').ConjugationAnalysis>;
      dictNoteGet(
        identity: import('../shared/lexiconNotes').LexiconNoteIdentity,
      ): Promise<import('../shared/lexiconNotes').LexiconNote | null>;
      dictNoteSet(
        identity: import('../shared/lexiconNotes').LexiconNoteIdentity,
        input: import('../shared/lexiconNotes').LexiconNoteInput,
      ): Promise<{ ok: boolean; note: import('../shared/lexiconNotes').LexiconNote | null }>;
      dictNoteList(
        query?: Partial<import('../shared/lexiconNotes').LexiconNoteListQuery>,
      ): Promise<import('../shared/lexiconNotes').LexiconNoteListResult>;
      dictNoteExport(
        query?: Partial<import('../shared/lexiconNotes').LexiconNoteExportQuery>,
      ): Promise<import('../shared/lexiconNotes').LexiconNoteExportResult>;
      dictListYomitan(): Promise<YomitanDictInfo[]>;
      dictRemoveYomitan(id: string): Promise<{ ok: boolean; error?: string }>;
      dictSetYomitanEnabled(id: string, enabled: boolean): Promise<{ ok: boolean; error?: string }>;
      dictMoveYomitan(id: string, dir: number): Promise<{ ok: boolean; error?: string }>;
      dictListSources(pair?: import('../shared/dictionarySources').DictionaryLanguagePair): Promise<import('../shared/dictionarySources').DictionarySourceInfo[]>;
      dictListPairs(): Promise<import('../shared/dictionarySources').DictionaryLanguagePair[]>;
      dictPairHasOverride(pair: import('../shared/dictionarySources').DictionaryLanguagePair): Promise<boolean>;
      dictResetPairPriority(pair: import('../shared/dictionarySources').DictionaryLanguagePair): Promise<import('../shared/dictionarySources').DictionarySourceMutationResult>;
      dictSetSourceEnabled(id: string, enabled: boolean): Promise<import('../shared/dictionarySources').DictionarySourceMutationResult>;
      dictSetSourceLang(id: string, lang: string): Promise<import('../shared/dictionarySources').DictionarySourceMutationResult>;
      dictMoveSource(id: string, direction: -1 | 1, pair?: import('../shared/dictionarySources').DictionaryLanguagePair): Promise<import('../shared/dictionarySources').DictionarySourceMutationResult>;
      dictRemoveSource(id: string): Promise<import('../shared/dictionarySources').DictionarySourceMutationResult>;
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
      ankiDeleteNotes(
        noteIds: number[],
        mediaFilenames?: string[],
      ): Promise<DeleteMinedNotesResult>;
      ankiEnsureModel(id?: ProfileId): Promise<EnsureModelResult>;
      ankiModelFields(modelName: string): Promise<{ ok: boolean; fields: string[]; error?: string }>;
      ankiGetIntervals(opts?: { maxAgeMs?: number }): Promise<IntervalSnapshot>;
      /** Review state for named notes only — see the note in `preload.ts`. */
      ankiGetIntervalsForNotes(noteIds: readonly number[]): Promise<IntervalSnapshot>;
      /** Read-only week-ahead due counts from Anki's own scheduler. */
      ankiDueForecast(): Promise<DueForecast>;
      /** Structured pitch-accent data for a term. */
      dictPitch(term: string, reading?: string): Promise<PitchLookup>;
      importApkg(filePath?: string): Promise<ApkgImportResult>;
      importApkgCards(filePath?: string): Promise<ApkgCardsResult>;
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
      desktopSetAssignment(
        patch: Partial<DisplayAssignment> & { displayKey: string },
      ): Promise<DesktopLayoutSnapshot>;
      desktopRename(index: DesktopIndex, name: string): Promise<DesktopLayoutSnapshot>;
      desktopResetAssignments(): Promise<DesktopLayoutSnapshot>;

      // Multi-monitor
      displayList(): Promise<DisplaySummary[]>;
      displaySetVirtualCount(count: number): Promise<DisplaySummary[]>;
      displayGetVirtualCount(): Promise<number>;
      onDisplaysChanged(cb: (displays: DisplaySummary[]) => void): () => void;
      deskwinAssign(displayKey: string, desktopIndex: number): Promise<{ ok: boolean }>;
      deskwinSetOptions(
        patch: Partial<DisplayAssignment> & { displayKey: string },
      ): Promise<{ ok: boolean }>;
      deskwinList(): Promise<DeskWindowInfo[]>;
      deskwinAllocateDesktop(): Promise<{ ok: boolean; desktopIndex?: number }>;
      deskwinOpenDesktop(desktopIndex: number): Promise<{ ok: boolean }>;
      deskwinFocusDesktop(desktopIndex: number): Promise<{ ok: boolean }>;
      deskwinSync(): Promise<DeskWindowInfo[]>;
      deskwinWhoAmI(): Promise<{ displayKey: string | null; desktopIndex: DesktopIndex | null }>;
      onDeskWindowsChanged(cb: (info: DeskWindowInfo[]) => void): () => void;
      onDeskRetarget(
        cb: (payload: { desktopIndex: DesktopIndex; displayKey: string }) => void,
      ): () => void;

      // Cross-monitor drag
      deskDragBegin(payload: {
        kind: DeskDragKind;
        id: string;
        payload: unknown;
        displayKey: string;
      }): void;
      deskDragMove(screenX: number, screenY: number): void;
      deskDragEnd(screenX: number, screenY: number): void;
      deskDragCancel(): void;
      onDeskDragHover(
        cb: (p: {
          kind: DeskDragKind;
          screenX: number;
          screenY: number;
          desktopIndex: number | null;
        }) => void,
      ): () => void;
      onDeskDragLeave(cb: (p: { kind: DeskDragKind }) => void): () => void;
      onDeskDragAdopt(
        cb: (p: {
          kind: DeskDragKind;
          id: string;
          payload: unknown;
          screenX: number;
          screenY: number;
          desktopIndex: number;
        }) => void,
      ): () => void;
      onDeskDragRelease(cb: (p: { kind: DeskDragKind; id: string }) => void): () => void;
      onDeskDragCancelled(
        cb: (p: { kind: DeskDragKind; id: string; reason: string }) => void,
      ): () => void;

      // File drop routing
      fileDropClassify(paths: string[]): Promise<DropPlan[]>;
      fileDropFolderImages(dirPath: string): Promise<string[]>;
      fileDropFolderFiles(dirPath: string): Promise<string[]>;

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
      appToggle(): Promise<{ ok: boolean }>;
      appSetToggleShortcut(chord: string): Promise<{ ok: boolean; error?: string }>;
      appSetRestartShortcut(chord: string): Promise<{ ok: boolean; error?: string }>;
      osHotkeyStatus(): Promise<{
        supported: boolean;
        installed: boolean;
        running: boolean;
        hotkey: string;
        restartHotkey?: string;
        openCount: number;
        error?: string;
      }>;
      osHotkeyInstall(bindings?: {
        toggle?: string;
        restart?: string;
        opens?: { section: string; chord: string }[];
      } | string): Promise<{
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
      }>;
      osHotkeySync(bindings?: {
        toggle?: string;
        restart?: string;
        opens?: { section: string; chord: string }[];
      } | string): Promise<{
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
      }>;
      osHotkeyUninstall(): Promise<{
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
      }>;
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
      catalogRefresh(): Promise<
        import('../shared/resourcesCatalog').CatalogResult<
          import('../shared/resourcesCatalog').ResourcesCatalog
        >
      >;
      novelsGet(): Promise<import('../shared/resourcesCatalog').NovelsCatalog | null>;
      novelsRefresh(): Promise<
        import('../shared/resourcesCatalog').CatalogResult<
          import('../shared/resourcesCatalog').NovelsCatalog
        >
      >;
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
      toolsMoveItem(
        id: string,
        folderId: string | null,
      ): Promise<{ ok: boolean; tool?: import('../shared/collectedTools').CollectedTool; error?: string }>;
      toolsAddFolder(
        name: string,
        parentFolderId?: string | null,
      ): Promise<{ ok: boolean; folder?: import('../shared/collectedTools').CollectedFolder; error?: string }>;
      toolsRenameFolder(
        id: string,
        name: string,
      ): Promise<{ ok: boolean; folder?: import('../shared/collectedTools').CollectedFolder; error?: string }>;
      toolsRemoveFolder(id: string): Promise<{
        ok: boolean;
        store?: import('../shared/collectedTools').CollectedToolsStore;
        error?: string;
      }>;
      statsPing(): Promise<{ ok: boolean; sent: boolean }>;
      statsCounts(): Promise<import('../shared/stats').CountryCounts | null>;
      translateRun(req: {
        id: number;
        text: string;
        source: string;
        target: string;
        senseHints?: import('../shared/translateCore').TranslateSenseHint[];
      }): Promise<{ ok: boolean; text?: string; error?: string }>;
      translateRunBatch(req: {
        items: Array<{ id: string; text: string; source: string; target: string }>;
      }): Promise<{
        ok: boolean;
        results?: Array<{ id: string; text: string }>;
        error?: string;
        cancelled?: boolean;
      }>;
      translateCancelBatch(): Promise<{ ok: boolean }>;
      translateStatus(): Promise<{ ready: boolean; modelFound: boolean; modelPath: string | null }>;
      translateEnsureReady(): Promise<{ ok: boolean; error?: string }>;
      onTranslateModelProgress(
        cb: (p: { status?: string; file?: string; progress?: number }) => void,
      ): () => void;
      onTranslateBatchProgress(cb: (p: { done: number; total: number }) => void): () => void;
      onTranslatePartial(cb: (p: { id: number; progress: number }) => void): () => void;
      translateAnalyze(
        req: import('../shared/translateAnalysisCore').TranslateAnalyzeRequest,
      ): Promise<{
        ok: boolean;
        result?: import('../shared/translateAnalysisCore').TranslateAnalysisResult;
        error?: string;
      }>;
      // Cuts a mined sentence's video out of the local episode file (ffmpeg, main side).
      extractVideoClip(
        req: import('../shared/videoClip').VideoClipRequest,
      ): Promise<import('../main/videoClipExtract').VideoClipResult>;
      // Whole-sentence AI annotation — AI OCR mode in the Lens and the extension.
      sentenceAnalyze(
        req: import('../shared/sentenceAnalysisCore').SentenceAnalyzeRequest,
      ): Promise<import('../main/sentenceAnalysis').SentenceAnalyzeResponse>;
      sentenceGetPrefs(): Promise<import('../shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs>;
      sentenceSetPrefs(
        prefs: import('../shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs,
      ): Promise<import('../shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs>;
      onSentencePrefsChanged(
        cb: (prefs: import('../shared/sentenceAnalysisPrefs').SentenceAnalysisPrefs) => void,
      ): () => void;
      onSentenceSnapshot(
        cb: (payload: import('../shared/analysisSnapshot').AnalysisSnapshot) => void,
      ): () => void;
      listMedia(): Promise<MediaItem[]>;
      scanMediaStorage(paths: string[]): Promise<{ totalBytes: number; files: Array<{ path: string; size: number; modifiedAt: number }> }>;
      updateMediaMetadata(id: string, metadata: Partial<Pick<MediaItem, 'title' | 'artist' | 'genres' | 'actors' | 'year' | 'lang' | 'category' | 'jlptLevel' | 'vocabularyCount' | 'kanjiCount' | 'metadataSource'>>): Promise<MediaItem | null>;
      previewMediaOrganization(id: string, root: string): Promise<import('../../shared/mediaHub').MediaOrganizationPreview | null>;
      organizeMedia(preview: import('../../shared/mediaHub').MediaOrganizationPreview, choice?: import('../../shared/mediaHub').MediaDuplicateChoice): Promise<{ ok: boolean; path?: string; error?: string }>;
      backupMedia(): Promise<import('../../shared/mediaHub').MediaBackupContract>;
      listMediaRelationships(fromId?: string): Promise<import('../../shared/mediaHub').MediaRelationship[]>;
      addMediaRelationship(relationship: Omit<import('../../shared/mediaHub').MediaRelationship, 'id' | 'createdAt'>): Promise<import('../../shared/mediaHub').MediaRelationship>;
      mediaPathExists(filePath: string): Promise<boolean>;
      coverArt(id: string): Promise<string | null>;
      /** Library artwork as a `playfile://` URL; null when there is none. */
      mediaArtwork(id: string, variant?: 'poster' | 'banner' | 'still'): Promise<string | null>;
      setMediaItemState(
        id: string,
        patch: Partial<Pick<MediaItem, 'favorite' | 'studyQueue' | 'note' | 'collections'>>,
      ): Promise<MediaItem | null>;
      runSubtitleDiscovery(
        request?: import('../../shared/subtitleDiscoveryIpc').SubtitleDiscoveryRequest,
      ): Promise<import('../../shared/subtitleDiscoveryIpc').SubtitleDiscoveryResult>;
      cancelSubtitleDiscovery(mediaId?: string): Promise<void>;
      subtitleDiscoveryStatus(): Promise<{ running: boolean }>;
      getSubtitleDiscoverySettings(): Promise<import('../../shared/subtitleDiscoveryIpc').SubtitleDiscoverySettings>;
      saveSubtitleDiscoverySettings(
        settings: import('../../shared/subtitleDiscoveryIpc').SubtitleDiscoverySettings,
      ): Promise<import('../../shared/subtitleDiscoveryIpc').SubtitleDiscoverySettings>;
      subtitleProviderCredentials(): Promise<import('../../shared/subtitleDiscoveryIpc').SubtitleProviderCredentialState[]>;
      setSubtitleProviderKey(
        id: string,
        key: string,
      ): Promise<import('../../shared/subtitleDiscoveryIpc').SubtitleProviderCredentialState[]>;
      testSubtitleProvider(
        id: string,
      ): Promise<import('../../shared/subtitleDiscoveryIpc').SubtitleProviderTestResult>;
      listNyaaSubtitles(
        mediaId: string,
        acquisition: import('../../shared/subtitleNyaa').NyaaAcquisitionConfig,
        languages?: string[],
      ): Promise<import('../../shared/subtitleDiscoveryIpc').NyaaSubtitleListResult>;
      acceptNyaaSubtitle(
        mediaId: string,
        candidateId: string,
        acquisition: import('../../shared/subtitleNyaa').NyaaAcquisitionConfig,
        lang: string,
      ): Promise<import('../../shared/subtitleDiscoveryIpc').NyaaSubtitleAcceptResult>;
      readSubtitleRecord(mediaId: string, recordId: string): Promise<SubtitlePick | null>;
      onSubtitleDiscoveryProgress(
        cb: (p: import('../../shared/subtitleDiscoveryIpc').SubtitleDiscoveryProgress) => void,
      ): () => void;
      subtitleHarvestList(
        input: import('../shared/subtitleHarvest').SubtitleHarvestListInput,
      ): Promise<import('../shared/subtitleHarvest').SubtitleHarvestListResult>;
      subtitleHarvestFetch(
        ids: string[],
      ): Promise<import('../shared/subtitleHarvest').SubtitleHarvestFetchResult>;
      runMediaMetadata(
        request?: import('../../shared/mediaMetadataIpc').MediaMetadataRequest,
      ): Promise<import('../../shared/mediaMetadataIpc').MediaMetadataResult>;
      cancelMediaMetadata(seriesKey?: string): Promise<void>;
      mediaMetadataStatus(): Promise<{ running: boolean }>;
      searchMediaMetadata(
        query: string,
      ): Promise<import('../../shared/mediaMetadataIpc').MediaMetadataSearchHit[]>;
      clearMediaMetadataCache(): Promise<void>;
      searchDiscovery(
        query: string,
      ): Promise<import('../shared/mediaDiscovery').DiscoveryCandidate[]>;
      browseDiscovery(
        feed: import('../shared/mediaDiscovery').DiscoveryFeedId,
        page?: number,
      ): Promise<import('../shared/mediaDiscovery').DiscoveryFeedResult>;
      discoveryDetail(
        id: number,
      ): Promise<import('../shared/mediaDiscovery').DiscoveryCandidate | null>;
      onMediaMetadataProgress(
        cb: (p: import('../../shared/mediaMetadataIpc').MediaMetadataProgress) => void,
      ): () => void;
      pickMedia(): Promise<MediaOpen | null>;
      addMediaFolder(): Promise<{ items: MediaItem[]; added: number }>;
      openMedia(id: string): Promise<MediaOpen | null>;
      handoffMedia(handoff: import('../shared/externalPlayer').PlaybackHandoff, profile: import('../shared/externalPlayer').ExternalPlayerProfile): Promise<string | null>;
      removeMedia(id: string): Promise<MediaItem[]>;
      pruneMedia(): Promise<{ removed: number; items: MediaItem[] }>;
      clearMediaLibrary(): Promise<MediaItem[]>;
      setMediaPosition(id: string, sec: number): Promise<void>;
      setMediaSubOffset(id: string, sec: number): Promise<void>;
      extractAudio(url: string): Promise<ArrayBuffer>;
      seanimeExtractAudio(localFilePath: string): Promise<ArrayBuffer>;
      /** Phase 6: read-only Seanime library projection for Study Mode. */
      seanimeStudyLibrary(): Promise<
        | { ok: true; files: import('../shared/seanimeStudyLibrary').SeanimeLibraryFile[] }
        | { ok: false; error: string }
      >;
      convertMedia(url: string): Promise<MediaOpen | null>;
      downloadYouTube(url: string, audioOnly?: boolean, options?: YouTubeDownloadOptions): Promise<MediaOpen | { error: string }>;
      onYoutubeProgress(cb: (p: { stage: string; percent: number }) => void): () => void;
      pickSubtitle(): Promise<SubtitlePick | null>;
      fetchYoutubeSubs(
        id: string,
        preferLang?: string,
      ): Promise<{ ok: true; name: string; text: string } | { ok: false; error: string }>;
      getMediaWatchFolder(): Promise<string | null>;
      setMediaWatchFolder(): Promise<{ folder: string | null; items: MediaItem[] }>;
      clearMediaWatchFolder(): Promise<null>;
      onMediaChanged(cb: (items: MediaItem[]) => void): () => void;
      ytList(): Promise<import('../shared/ytPlaylists').YtPlaylistsStore>;
      ytListChannels(): Promise<import('../shared/ytPlaylists').YtChannel[]>;
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
          channelId: string;
          channelTitle: string;
          channelIconUrl: string;
          subscriptionStatus: import('../shared/ytPlaylists').YtSubscriptionStatus;
          updateFrequencyHours: number;
        }>,
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore | { error: string }>;
      ytSetChannelPrefs(
        channelId: string,
        prefs: Partial<{
          title: string;
          iconUrl: string;
          subscriptionStatus: import('../shared/ytPlaylists').YtSubscriptionStatus;
          updateFrequencyHours: number;
        }>,
      ): Promise<import('../shared/ytPlaylists').YtPlaylistsStore | { error: string }>;
      ytRefreshChannel(
        channelId: string,
      ): Promise<
        | {
            store: import('../shared/ytPlaylists').YtPlaylistsStore;
            channel: import('../shared/ytPlaylists').YtChannel;
            refreshedPlaylistIds: string[];
            errors: string[];
          }
        | { error: string }
      >;
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
      ytDiscoverySearch(
        query: string,
        limit?: number,
      ): Promise<import('../shared/youtubeDiscovery').YoutubeSearchResult>;
      ytDiscoveryChannel(
        channel: string,
        limit?: number,
      ): Promise<import('../shared/youtubeDiscovery').YoutubeSearchResult>;
      ytDiscoveryProbe(
        videoId: string,
      ): Promise<import('../shared/youtubeDiscovery').YoutubeProbeResult>;
      ytCachedCaptionText(
        youtubeId: string,
      ): Promise<{ text: string | null; file: string | null }>;
      ytAddVideoByUrl(
        url: string,
      ): Promise<
        | { ok: true; playlistId: string; videoId: string; youtubeId: string; duplicate?: boolean }
        | { ok: false; error: string }
      >;
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
        range?: { from?: number | null; to?: number | null } | null,
      ): Promise<EpubMiningAnalysis>;
      miningListEpubSections(itemId: string): Promise<{
        itemId: string;
        title: string;
        sections: import('../shared/mining').EpubSectionSummary[];
      }>;
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
      localAgentPlan(request: LocalAgentPlanRequest): Promise<LocalAgentPlanResponse>;
      localAgentStatus(): Promise<LocalAgentRuntimeStatus>;
      localAgentModels(): Promise<LocalAgentModelInfo[]>;
      onLocalAgentTrigger(cb: (entry: AgentAutomation) => void): () => void;
      agentWorkspaceLoad(): Promise<AgentWorkspaceResult>;
      agentWorkspaceSave(state: AgentWorkspaceState): Promise<AgentWorkspaceResult>;
      agentWorkspaceDeleteConversation(conversationId: string): Promise<AgentWorkspaceResult>;
      agentWorkspaceClear(): Promise<AgentWorkspaceResult>;
      onAgentWorkspaceChanged(cb: (state: AgentWorkspaceState) => void): () => void;
      agentImageStage(request: AgentImageStageRequest): Promise<AgentImageStageResult>;
      agentImageTake(conversationId: string): Promise<AgentImageTakeResult>;
      onAgentImageStaged(cb: (conversationId: string) => void): () => void;
      agentCardBatchStage(
        request: AgentCardBatchStageRequest,
      ): Promise<AgentCardBatchStageResult>;
      agentCardBatchTake(): Promise<AgentCardBatchTakeResult>;
      onAgentCardBatchStaged(cb: () => void): () => void;
      agentOperationalLoad(): Promise<AgentOperationalResult>;
      agentOperationalSave(state: AgentOperationalState): Promise<AgentOperationalResult>;
      agentOperationalMigrateLegacy(
        payload: LegacyAgentOperationalPayload,
      ): Promise<AgentOperationalResult>;
      onAgentOperationalChanged(cb: (state: AgentOperationalState) => void): () => void;
      agentExecutionLeaseAcquire(
        request: AgentExecutionLeaseAcquireRequest,
      ): Promise<AgentExecutionLeaseAcquireResult>;
      agentExecutionLeaseRenew(
        request: AgentExecutionLeaseTokenRequest,
      ): Promise<AgentExecutionLeaseRenewResult>;
      agentExecutionLeaseCommit(
        request: AgentExecutionLeaseCommitRequest,
      ): Promise<AgentExecutionLeaseCommitResult>;
      agentExecutionLeaseRelease(
        request: AgentExecutionLeaseTokenRequest,
      ): Promise<AgentExecutionLeaseReleaseResult>;
      agentExecutionLeaseRecover(
        request: AgentExecutionLeaseRecoverRequest,
      ): Promise<AgentExecutionLeaseRecoverResult>;
      agentExecutionRun(request: AgentExecutionRequest): Promise<AgentExecutionResult>;
      agentExecutionCancel(requestId: string): Promise<AgentExecutionCancelResult>;
      onAgentExecutionEvent(cb: (event: AgentExecutionEvent) => void): () => void;
      agentNavigationRun(request: AgentNavigationRequest): Promise<AgentNavigationResult>;
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
      aiSetEngine(engine: import('../shared/mining').AiEngineKind): Promise<AiEngineConfig & { ok: boolean }>;
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
      mediaStudyAssist(
        req: import('../shared/mediaStudyAssistant').MediaStudyAssistantRequest,
      ): Promise<{
        ok: boolean;
        result?: import('../shared/mediaStudyAssistant').MediaStudyAssistantResult;
        error?: string;
        cached?: boolean;
      }>;
      studyGet(): Promise<StudyOrchestratorDocument>;
      studyMigrateLegacy(value: unknown): Promise<StudyOrchestratorDocument>;
      studyPrepare(request: StudyAnalysisRequest): Promise<StudyPreparationResult>;
      studyCreateLookupPack(request: StudyLookupPackRequest): Promise<StudyLookupPackResult>;
      studyQueueTranscription(mediaId: string): Promise<StudyTranscriptionQueueResult>;
      studyWorkspacePage(
        workspaceId: string,
        offset?: number,
        limit?: number,
      ): Promise<{ items: StudyVocabularyCandidate[]; total: number; selected: number }>;
      studyApplyFilters(
        workspaceId: string,
        filters: Partial<StudyVocabularyFilters>,
      ): Promise<StudyVocabularyWorkspace>;
      studyUndoFilter(workspaceId: string): Promise<StudyVocabularyWorkspace>;
      studyUpdateWorkspace(workspace: StudyVocabularyWorkspace): Promise<StudyVocabularyWorkspace>;
      studyListOpportunities(): Promise<StudyOpportunity[]>;
      studySyncOpportunities(
        opportunities: StudyOpportunity[],
        retireMissingActive?: boolean,
      ): Promise<StudyOrchestratorDocument>;
      studySetOpportunityStatus(
        opportunityId: string,
        status: StudyOpportunityStatus,
        snoozedUntil?: number,
      ): Promise<StudyOrchestratorDocument>;
      studyPreviewAnki(workspaceId: string): Promise<StudyAnkiPreview>;
      studyExportAnki(workspaceId: string): Promise<StudyAnkiExportResult>;
      studyUndoAnkiExport(workspaceId: string): Promise<StudyAnkiUndoResult>;
      onStudyChanged(cb: (document: StudyOrchestratorDocument) => void): () => void;
      immersionListSites(): Promise<ImmersionSitesStore>;
      visualNovelList(): Promise<import('../shared/visualNovel').VisualNovelDatabase>;
      visualNovelSearchSource(query: string): Promise<{
        ok: boolean;
        results?: import('../shared/visualNovel').VisualNovelSourceResult[];
        error?: string;
      }>;
      visualNovelSourceDetails(providerId: string): Promise<{
        ok: boolean;
        details?: import('../shared/visualNovel').VisualNovelSourceDetails;
        error?: string;
      }>;
      visualNovelPickExecutable(): Promise<string | null>;
      visualNovelDiscoverFolder(): Promise<import('../shared/visualNovel').VisualNovelDiscoveryCandidate[]>;
      visualNovelExportLibrary(): Promise<{
        ok: boolean;
        path?: string;
        canceled?: boolean;
        error?: string;
      }>;
      visualNovelImportLibrary(): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        addedEntries?: number;
        addedCaptures?: number;
        canceled?: boolean;
        error?: string;
      }>;
      visualNovelExportCommunityBundle(
        title: string,
        content: string,
      ): Promise<{ ok: boolean; path?: string; canceled?: boolean; error?: string }>;
      visualNovelPickCommunityBundle(): Promise<{
        ok: boolean;
        content?: string;
        canceled?: boolean;
        error?: string;
      }>;
      visualNovelAdd(
        input: import('../shared/visualNovel').VisualNovelCreateInput,
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        error?: string;
      }>;
      visualNovelImportDiscovered(
        candidates: import('../shared/visualNovel').VisualNovelCreateInput[],
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        imported?: number;
        error?: string;
      }>;
      visualNovelRemove(id: string): Promise<import('../shared/visualNovel').VisualNovelDatabase>;
      visualNovelUpdateProgress(
        id: string,
        patch: import('../shared/visualNovel').VisualNovelProgressPatch,
      ): Promise<import('../shared/visualNovel').VisualNovelDatabase>;
      visualNovelUpdateMetadata(
        id: string,
        patch: import('../shared/visualNovel').VisualNovelMetadataPatch,
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        error?: string;
      }>;
      visualNovelUpdateRoutes(
        id: string,
        routes: import('../shared/visualNovel').VisualNovelRouteInput[],
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        error?: string;
      }>;
      visualNovelReadClipboard(): Promise<string>;
      visualNovelHookState(
        id: string,
      ): Promise<import('../shared/visualNovelHook').VisualNovelHookState>;
      visualNovelStartHook(id: string): Promise<{
        ok: boolean;
        state?: import('../shared/visualNovelHook').VisualNovelHookState;
        canceled?: boolean;
        error?: string;
      }>;
      visualNovelStopHook(
        id: string,
      ): Promise<import('../shared/visualNovelHook').VisualNovelHookState>;
      onVisualNovelHookChanged(
        cb: (state: import('../shared/visualNovelHook').VisualNovelHookState) => void,
      ): () => void;
      visualNovelPickScripts(id: string): Promise<{
        ok: boolean;
        lines?: import('../shared/visualNovelScriptExtraction').VisualNovelScriptLine[];
        canceled?: boolean;
        error?: string;
      }>;
      visualNovelImportScriptLines(
        id: string,
        lines: import('../shared/visualNovelScriptExtraction').VisualNovelScriptLine[],
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        imported?: number;
        error?: string;
      }>;
      visualNovelSessionState(id: string): Promise<{ startedAt: number | null }>;
      visualNovelStopSession(id: string): Promise<{
        database: import('../shared/visualNovel').VisualNovelDatabase;
        stopped: boolean;
      }>;
      visualNovelCaptureText(
        input: import('../shared/visualNovel').VisualNovelCaptureInput,
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        error?: string;
      }>;
      visualNovelCaptureMany(
        inputs: import('../shared/visualNovel').VisualNovelCaptureInput[],
        options?: import('../shared/visualNovel').VisualNovelCaptureBatchOptions,
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        imported?: number;
        error?: string;
      }>;
      visualNovelUpdateCapture(
        id: string,
        patch: import('../shared/visualNovel').VisualNovelCapturePatch,
      ): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        error?: string;
      }>;
      visualNovelRemoveCapture(id: string): Promise<import('../shared/visualNovel').VisualNovelDatabase>;
      visualNovelReadCaptureImage(
        filePath: string,
      ): Promise<{ ok: boolean; dataUrl?: string; error?: string }>;
      visualNovelAttachCaptureAudio(id: string): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        canceled?: boolean;
        error?: string;
      }>;
      visualNovelRemoveCaptureAudio(id: string): Promise<{
        ok: boolean;
        database?: import('../shared/visualNovel').VisualNovelDatabase;
        error?: string;
      }>;
      visualNovelReadCaptureAudio(
        filePath: string,
      ): Promise<{ ok: boolean; dataUrl?: string; filename?: string; error?: string }>;
      visualNovelLaunch(id: string): Promise<{ ok: boolean; error?: string; startedAt?: number }>;
      onVisualNovelChanged(
        cb: (database: import('../shared/visualNovel').VisualNovelDatabase) => void,
      ): () => void;
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
        region: RegionRect & {
          engine?: 'auto' | 'manga' | 'web';
          includeScreenshot?: boolean;
        },
      ): Promise<LensOcrResult>;
      lensSetInteractive(interactive: boolean): void;
      lensClose(): Promise<void>;
      lensHistoryRecord(
        capture: import('../shared/readingLens').ReadingLensCapture,
      ): Promise<import('../shared/readingLensHistory').ReadingLensHistoryEntry | null>;
      lensHistoryList(
        query?: import('../shared/readingLensHistory').ReadingLensHistoryQuery,
      ): Promise<import('../shared/readingLensHistory').ReadingLensHistoryEntry[]>;
      lensHistoryPin(
        captureId: string,
        pinned: boolean,
      ): Promise<import('../shared/readingLensHistory').ReadingLensHistoryEntry | null>;
      lensHistoryRemove(captureId: string): Promise<number>;
      lensHistoryClear(): Promise<void>;
      lexiconHandoffStage(
        request: import('../shared/lexiconHandoff').LexiconHandoffRequest,
      ): Promise<import('../shared/lexiconHandoff').LexiconHandoffStageResult>;
      lexiconHandoffTake(
        request: import('../shared/lexiconHandoff').LexiconHandoffTakeRequest,
      ): Promise<import('../shared/lexiconHandoff').LexiconHandoffTakeResult>;
      onLexiconHandoffStaged(cb: () => void): () => void;
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
      assetsReverify(id: string): Promise<ReverifyOutcome>;
    assetsIntegrity(): Promise<AssetIntegrity[]>;
    assetsFreeSpace(): Promise<number>;
      assetsRoot(): Promise<string>;
      onAssetStatus(cb: (status: AssetStatus) => void): () => void;
      onAssetUnload(cb: (id: string) => void): () => void;
      setUiLang(lang: string): void;

      /** Audit C1-3: airing schedule with torrent-index releases matched onto it. */
      animeSchedule(input: AnimeScheduleRequest): Promise<AnimeScheduleResponse>;

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
      enqueueTranscription(
        request: import('../../shared/transcriptionIpc').TranscriptionRequest,
      ): Promise<import('../../shared/transcriptionIpc').TranscriptionResult>;
      /** Windows Live Captions background capture (see main/liveCaptions.ts). */
      liveCaptionsStatus(): Promise<import('../main/liveCaptions').LiveCaptionsStatus>;
      liveCaptionsStart(): Promise<{
        ok: boolean;
        error?: string;
        status: import('../main/liveCaptions').LiveCaptionsStatus;
      }>;
      liveCaptionsStop(): Promise<{
        ok: boolean;
        status: import('../main/liveCaptions').LiveCaptionsStatus;
      }>;
      liveCaptionsScripts(): Promise<import('../shared/liveCaptions').CaptionScript[]>;
      liveCaptionsClear(): Promise<{
        ok: boolean;
        status: import('../main/liveCaptions').LiveCaptionsStatus;
      }>;
      onLiveCaptionsChanged(
        cb: (status: import('../main/liveCaptions').LiveCaptionsStatus) => void,
      ): () => void;
      cancelTranscription(mediaId?: string): Promise<void>;
      transcriptionQueue(): Promise<import('../../shared/transcriptionIpc').TranscriptionJob[]>;
      onTranscriptionProgress(
        cb: (p: import('../../shared/transcriptionIpc').TranscriptionProgress) => void,
      ): () => void;
      onTranscriptionChunkRequest(
        cb: (payload: { id: string; pcmBase64: string; lang: string }) => void,
      ): () => void;
      replyTranscriptionChunk(payload: { id: string; ok: boolean; text?: string; error?: string }): void;
      onExtensionTranscribeRequest(cb: (payload: { id: string; pcmBase64: string }) => void): () => void;
      replyExtensionTranscribe(
        id: string,
        result: { ok: boolean; text?: string; error?: string },
      ): void;
      profileRulesGet(): Promise<ProfileRulesStore>;
      profileRulesSet(store: unknown): Promise<ProfileRulesStore>;

      // ---- scraper backend ----
      scraperCapabilities(): Promise<import('../shared/scraperIpc').ScraperMethod[]>;
      scraperSystemStats(): Promise<import('../shared/scraperResults').SystemStats>;
      scraperListDownloads(
        input: import('../shared/scraperIpc').ScraperQbitInput,
      ): Promise<import('../shared/scraperResults').DownloadRow[]>;
      /** Japanese subtitles for a catalogue entry — see main/subtitleHarvest.ts. */
      subtitleHarvestList(
        input: import('../shared/subtitleHarvest').SubtitleHarvestListInput,
      ): Promise<import('../shared/subtitleHarvest').SubtitleHarvestListResult>;
      subtitleHarvestFetch(
        ids: string[],
      ): Promise<import('../shared/subtitleHarvest').SubtitleHarvestFetchResult>;
      scraperListExports(): Promise<import('../shared/scraperResults').ExportRecord[]>;
      scraperListPlugins(
        enabledIds: string[],
      ): Promise<import('../shared/scraperIpc').ScraperPluginInfo[]>;
      scraperWriteExport(
        request: import('../shared/scraperIpc').ScraperExportInput & {
          content: string;
          defaultName: string;
          recordCount: number;
          openAfter?: boolean;
        },
      ): Promise<import('../shared/scraperResults').ExportRecord | null>;
      scraperStartScrape(
        input: import('../shared/scraperIpc').ScraperStartInput,
      ): Promise<string>;
      scraperCancelScrape(jobId: string): Promise<void>;
      scraperListJobs(): Promise<import('../shared/scraperResults').ScrapeJobSummary[]>;
      scraperGetResult(
        jobId: string,
      ): Promise<import('../shared/scraperResults').ScrapeResult | null>;
      scraperOnJobEvent(
        jobId: string,
        cb: (event: import('../shared/scraperResults').ScrapeJobEvent) => void,
      ): () => void;
      scraperSyncScheduler(
        input: import('../shared/scraperIpc').ScraperSchedulerSyncInput,
      ): Promise<import('../shared/scraperIpc').ScraperSchedulerState>;
      scraperRunSchedule(entryId: string): Promise<string | null>;
      scraperOnSchedulerState(
        cb: (state: import('../shared/scraperIpc').ScraperSchedulerState) => void,
      ): () => void;
      scraperOnNotice(
        cb: (notice: import('../shared/scraperNotices').ScraperNotice) => void,
      ): () => void;
      scraperQbitTest(
        input: import('../shared/scraperIpc').ScraperQbitInput,
      ): Promise<import('../shared/scraperResults').QbitStatusReport>;
      scraperQbitTransfers(
        input: import('../shared/scraperIpc').ScraperQbitInput,
      ): Promise<import('../shared/scraperResults').QbitTransferRow[]>;
      scraperQbitSend(
        input: import('../shared/scraperIpc').ScraperQbitSendInput,
      ): Promise<import('../shared/scraperResults').QbitSendReport>;
      scraperSetCredential(
        ref: string,
        secret: string,
      ): Promise<import('../shared/scraperIpc').ScraperCredentialResult>;
      scraperHasCredential(ref: string): Promise<boolean>;
      scraperClearCredential(ref: string): Promise<void>;
      scraperSearchTorrents(
        input: import('../shared/scraperIpc').ScraperTorrentSearchInput,
      ): Promise<import('../shared/scraperResults').TorrentRow[]>;
      scraperListSources(
        entries: import('../shared/scraperSourceSettings').ScraperSourceEntry[],
      ): Promise<import('../shared/scraperResults').SourceStatus[]>;
      scraperListAcquisitionProviders(): Promise<
        import('../shared/acquisition').AcquisitionProviderInventory
      >;
      scraperGetAcquisitionSnapshot(): Promise<
        import('../shared/acquisition').AcquisitionBackendSnapshot
      >;
      scraperRunAcquisitionAction(
        action: import('../shared/acquisition').AcquisitionAction,
      ): Promise<import('../shared/acquisition').AcquisitionActionResult>;
      scraperProbeSource(
        input: import('../shared/scraperIpc').ScraperProbeInput,
      ): Promise<import('../shared/scraperResults').SourceStatus>;
      scraperMalUnits(
        input: import('../shared/malDownload').MalUnitsInput,
      ): Promise<import('../shared/malDownload').MalUnitsResult>;

      // ---- reading (Phase 5: provider-backed manga over the canonical model) ----
      readingMangaEntry(
        input: import('../shared/readingIpc').ReadingMangaEntryInput,
      ): Promise<import('../shared/readingIpc').ReadingEntryResponse>;
      readingMangaChapters(
        input: import('../shared/readingIpc').ReadingMangaChaptersInput,
      ): Promise<import('../shared/readingIpc').ReadingChaptersResponse>;
      readingMangaChapterPages(
        input: import('../shared/readingIpc').ReadingMangaPagesInput,
      ): Promise<import('../shared/readingIpc').ReadingPagesResponse>;
      readingMangaProviders(): Promise<
        import('../shared/readingIpc').ReadingProvidersResponse
      >;
      readingMangaPageImage(
        input: import('../shared/readingIpc').ReadingPageImageInput,
      ): Promise<import('../shared/readingIpc').ReadingPageImageResponse>;
      readingMangaSearch(
        input: import('../shared/readingIpc').ReadingMangaSearchInput,
      ): Promise<import('../shared/readingIpc').ReadingMangaSearchResponse>;
      readingMangaDownloadChapter(
        input: import('../shared/readingIpc').ReadingMangaDownloadInput,
      ): Promise<import('../shared/readingIpc').ReadingMangaDownloadResponse>;
      scraperFetchHttp(
        request: import('../shared/scraperIpc').ScraperHttpProbeRequest,
      ): Promise<import('../shared/scraperIpc').ScraperHttpProbeResult>;
      scraperTailLogs(
        cb: (line: import('../shared/scraperResults').LogLine) => void,
        backlog?: number,
      ): () => void;

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


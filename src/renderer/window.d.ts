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
  YomitanDictInfo,
} from '../shared/types';
import type {
  AnkiLinkStatus,
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,
} from '../shared/anki';
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
import type { InterpretedLearningInput } from '../main/city/engine/types';
import type { CityStateMessage } from '../main/city/ipc/channels';

// Describes the `window.api` bridge exposed by the preload script.
declare global {
  interface Window {
    api: {
      listLibrary(): Promise<LibraryItem[]>;
      importFiles(): Promise<LibraryItem[]>;
      importFolder(): Promise<LibraryItem[]>;
      removeItem(id: string): Promise<LibraryItem[]>;
      getLibraryFolders(): Promise<string[]>;
      setLibraryFolders(folders: string[]): Promise<{ folders: string[]; items: LibraryItem[] }>;
      setItemFolder(id: string, folder: string | null): Promise<LibraryItem[]>;
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
      fetchJson(url: string): Promise<{ ok: boolean; data?: unknown; error?: string }>;
      importGenerated(payload: { title: string; html: string; source?: string }): Promise<LibraryItem[]>;
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
      readBook(id: string): Promise<ArrayBuffer | null>;
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
      playerWindowId(): Promise<number>;
      playerGetSnapshot(): Promise<import('../shared/playerSync').PlayerSnapshot | null>;
      playerPublish(snap: import('../shared/playerSync').PlayerSnapshot): void;
      playerSendCommand(cmd: import('../shared/playerSync').PlayerCommand): void;
      onPlayerSync(cb: (snap: import('../shared/playerSync').PlayerSnapshot) => void): () => void;
      onPlayerCommand(cb: (cmd: import('../shared/playerSync').PlayerCommand) => void): () => void;
      openExternal(url: string): Promise<boolean>;
      appVersion(): Promise<string>;
      checkAppRelease(): Promise<AppReleaseInfo | null>;
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
      listMedia(): Promise<MediaItem[]>;
      coverArt(id: string): Promise<string | null>;
      pickMedia(): Promise<MediaOpen | null>;
      openMedia(id: string): Promise<MediaOpen | null>;
      removeMedia(id: string): Promise<MediaItem[]>;
      pruneMedia(): Promise<{ removed: number; items: MediaItem[] }>;
      clearMediaLibrary(): Promise<MediaItem[]>;
      setMediaPosition(id: string, sec: number): Promise<void>;
      extractAudio(url: string): Promise<ArrayBuffer>;
      convertMedia(url: string): Promise<MediaOpen | null>;
      downloadYouTube(url: string, audioOnly?: boolean): Promise<MediaOpen | { error: string }>;
      onYoutubeProgress(cb: (p: { stage: string; percent: number }) => void): () => void;
      pickSubtitle(): Promise<SubtitlePick | null>;
      getMediaWatchFolder(): Promise<string | null>;
      setMediaWatchFolder(): Promise<{ folder: string | null; items: MediaItem[] }>;
      clearMediaWatchFolder(): Promise<null>;
      onMediaChanged(cb: (items: MediaItem[]) => void): () => void;
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

      // Downloadable models & dictionaries (Phase 6)
      assetsList(): Promise<{ assets: AssetSpec[]; statuses: AssetStatus[] }>;
      assetsStart(id: string): Promise<{ ok: boolean; error?: AssetError }>;
      assetsPause(id: string): Promise<void>;
      assetsCancel(id: string): Promise<void>;
      assetsRemove(id: string): Promise<{ ok: boolean; error?: AssetError }>;
      assetsIsInstalled(id: string): Promise<boolean>;
      assetsPath(id: string): Promise<string | null>;
      assetsFreeSpace(): Promise<number>;
      assetsRoot(): Promise<string>;
      onAssetStatus(cb: (status: AssetStatus) => void): () => void;
      onAssetUnload(cb: (id: string) => void): () => void;
      setUiLang(lang: string): void;

      // Noctis Civilization Module (read-only mirror, refreshed by push).
      cityGetState(): Promise<CityStateMessage>;
      cityRecordSession(input: InterpretedLearningInput): Promise<CityStateMessage>;
      onCityChanged(cb: (message: CityStateMessage) => void): () => void;
    };
  }
}

export {};

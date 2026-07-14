import { contextBridge, ipcRenderer, webUtils } from 'electron';
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
} from './shared/types';
import type {
  AnkiLinkStatus,
  EnsureModelResult,
  IntervalSnapshot,
  MineNoteRequest,
  MineNoteResult,
} from './shared/anki';
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

// The single, safe bridge between the sandboxed renderer (React UI) and the
// Electron main process. The UI can only call exactly these functions.
const api = {
  listLibrary: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:list'),
  importFiles: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importFiles'),
  importFolder: (): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importFolder'),
  removeItem: (id: string): Promise<LibraryItem[]> => ipcRenderer.invoke('library:remove', id),
  getLibraryFolders: (): Promise<string[]> => ipcRenderer.invoke('library:getFolders'),
  setLibraryFolders: (folders: string[]): Promise<{ folders: string[]; items: LibraryItem[] }> =>
    ipcRenderer.invoke('library:setFolders', folders),
  setItemFolder: (id: string, folder: string | null): Promise<LibraryItem[]> =>
    ipcRenderer.invoke('library:setItemFolder', id, folder),
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
  /** Fetch JSON from the Japanese Wikipedia API (main process, no CORS). */
  fetchJson: (url: string): Promise<{ ok: boolean; data?: unknown; error?: string }> =>
    ipcRenderer.invoke('net:fetchJson', url),
  importGenerated: (payload: {
    title: string;
    html: string;
    source?: string;
  }): Promise<LibraryItem[]> => ipcRenderer.invoke('library:importGenerated', payload),
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
  readBook: (id: string): Promise<ArrayBuffer | null> => ipcRenderer.invoke('library:readBook', id),

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
  // The main process dedupes by section — calling this again for an already-open
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

  /** Floating Mini Widget Mode — borderless transparent always-on-top craft window. */
  miniOpen: (size?: { width?: number; height?: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mini:open', size),
  miniClose: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('mini:close'),
  miniSetSize: (size: { width: number; height: number }): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('mini:setSize', size),
  miniIsOpen: (): Promise<boolean> => ipcRenderer.invoke('mini:isOpen'),
  miniFocusMain: (): Promise<void> => ipcRenderer.invoke('mini:focusMain'),

  /** Floating lock widget — frameless, transparent, no OS shadow. */
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

  // L4 — transparent OS companion host over the real desktop
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
  /** Decode a file's audio to 16 kHz mono PCM (for Whisper), via ffmpeg. */
  extractAudio: (url: string): Promise<ArrayBuffer> => ipcRenderer.invoke('media:extractAudio', url),
  /** Convert a non-playable file (e.g. MKV) to a playable MP4; returns a new URL. */
  convertMedia: (url: string): Promise<MediaOpen | null> => ipcRenderer.invoke('media:convert', url),
  /** Download a YouTube video (or just its audio) via yt-dlp into the library. */
  downloadYouTube: (url: string, audioOnly?: boolean): Promise<MediaOpen | { error: string }> =>
    ipcRenderer.invoke('media:youtube', url, audioOnly),
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
};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;

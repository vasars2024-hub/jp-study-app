/**
 * Media library, video learning player, Whisper transcription, and the YouTube
 * intake — shared by Study OS's `MediaView` and Blanc's `BlancMediaPanel`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP: **Media & Cards** work stream. See BLANC_REFINEMENT_PLAN.md,
 * "Parallel split". The Library & Arcade stream must not edit this file.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pillar 0 (BLANC_REFINEMENT_PLAN.md): `player` and `video` were tab bail-outs
 * that mounted `MediaView` inside `BlancViewHost`, which drags `AppChrome` into
 * a Blanc window. The library/tree/search helpers already lived in
 * `renderer/mediaLibrary.ts` and the Whisper plumbing in `whisperSettings` /
 * `whisperModelCache` / `whisperWorker`; what was view-local was the toolbar,
 * the player stage with its subtitle bar, and the library grid.
 *
 * `mode` is preserved verbatim ('full' | 'library' | 'video') so Study OS's
 * three entry points keep behaving identically; Blanc picks a mode per panel.
 *
 * The library grid stays on `VirtualGrid` in both shells — a large media folder
 * must not drop frames while the window is dragged (CLAUDE.md performance rule,
 * and Pillar 1 item 4).
 *
 * Nothing here may import `AppChrome`/`MenuBar`/`StatusBar`.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import DictionaryPopup from '../DictionaryPopup';
import Icon from '../Icons';
import MediaLibraryActions from '../MediaLibraryActions';
import MediaStudyActions from './MediaStudyActions';
import VirtualGrid from '../VirtualGrid';
import { translate } from '../../translator';
import type { MediaItem, MediaOpen, YouTubeAudioLang, YouTubeSubtitleLang } from '../../../shared/types';
import type { MediaKind } from '../../../shared/mediaKind';
import { buildMediaHubSections, diagnoseMediaPaths, searchMediaHub, type MediaCategory, type MediaHubDiagnostics, type MediaDuplicateChoice, type MediaOrganizationPreview, type MediaRelationship } from '../../../shared/mediaHub';
import { resolveLocalMediaIdentities } from '../../../shared/mediaFileIdentity';
import { loadMediaHubState, saveMediaHubState } from '../../mediaHubStore';
import { WHISPER_MODEL_SPECS, type WhisperModelTier } from '../../../shared/whisperModels';
import { parseStudySubtitles, parseSubtitles, type Cue } from '../../subtitles';
import {
  loadWhisperDevice,
  loadWhisperModelTier,
  onWhisperDeviceChanged,
  onWhisperModelChanged,
  setWhisperModelTier,
  whisperHfId,
} from '../../whisperSettings';
import {
  effectiveWhisperTier,
  isDownloadedIn,
  loadDownloaded,
  markTierDownloaded,
  onDownloadedChanged,
} from '../../whisperModelCache';
import { getStudyLang, onStudyLangChanged, setStudyLang } from '../../studyEnvironment';
import { useDebouncedValue } from '../../hooks';
import {
  buildMediaTree,
  buildMediaFileSearchIndex,
  collectTreeItems,
  filterItemsById,
  flattenFolderNav,
} from '../../mediaLibrary';
import { lookupWordFromMouseUp, isLookupClick } from '../../wordLookup';
import { useT } from '../../i18n';
import { confirmDialog } from '../ui/dialogService';
import { confirmAndPruneMissingMedia } from './pruneMissingMedia';
import { mediaHubBackupFilename } from '../../mediaHubStoragePanel';
import {
  endMediaStudySession,
  loadMediaStudyDatabase,
  onMediaStudyDatabaseChanged,
  startMediaStudySession,
} from '../../mediaStudyStore';
import {
  evaluateJapaneseDictation,
  type DictationEvaluation,
} from '../../../shared/listeningTraining';
import { openMediaWorkspace } from '../../mediaWorkspaceBridge';
import { findSubtitleMatches, wrapSubtitleMatch } from '../../../shared/subtitleSearch';
import { youtubeDownloadDisabledReason } from '../../../shared/mediaVideoActionReason';
import { useDeferredText, GLOBAL_SEARCH_COMMIT_MS } from '../../views/GlobalSearchField';
import {
  buildPlayerDiagnosticReport,
  type PlayerDiagnosticReport,
} from '../../../shared/playerDiagnostics';
import { collectPlayerDiagnostics } from '../../playerDiagnosticsRun';
import {
  normalizePlayerPreferences,
  playerPreferencesPatch,
  type PlayerPreferences,
  type SubtitleVerticalPosition,
} from '../../../shared/playerPreferences';
import {
  changedPreferenceKeys,
  onPlayerPreferencesChanged,
  readStoredPlayerPreferences,
  writePlayerPreferencesPatch,
} from '../../playerPreferencesStore';
import { takeHandoff, takeHandoffJson } from '../../pendingHandoff';
import {
  studyContextSeekPosition,
  type StudyContextRef,
} from '../../../shared/mediaStudyOrchestrator';
import type { StudyListeningAvailability } from '../../../shared/studyListeningFirstRecipe';
import { inspectStudyListeningAudio } from '../../studyListeningAudio';
import { STUDY_LANG_NATIVE_NAME } from '../../../shared/studyLang';
import { formatNumber } from '../../stats';
import { Select } from '../ui';

const CARD_MIN_WIDTH = 230;
const CARD_GAP = 12;
const CARD_ROW_HEIGHT = 108; // card content height + gap, generous enough to never clip
const COLLAPSED_KEY = 'jp-media-collapsed';
const PLAYER_PREFERENCES_KEY = 'jp-media-player-preferences-v1';
/** This surface's name on `playerPreferencesStore` writes, so it ignores its own echo. */
const MEDIA_CENTER_PREFS_SOURCE = 'media-center';
export const RATE_PRESETS = [0.5, 0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5] as const;

function loadPlayerPreferences() {
  try {
    return normalizePlayerPreferences(
      JSON.parse(localStorage.getItem(PLAYER_PREFERENCES_KEY) ?? 'null'),
    );
  } catch {
    return normalizePlayerPreferences(null);
  }
}

function loadCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

const SECTION_COLLAPSED_KEY = 'jp-media-sections-collapsed';

function loadSectionCollapsed(): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SECTION_COLLAPSED_KEY) ?? '[]');
    return new Set(Array.isArray(raw) ? raw.filter((v) => typeof v === 'string') : []);
  } catch {
    return new Set();
  }
}

function persistSectionCollapsed(next: Set<string>): void {
  try {
    localStorage.setItem(SECTION_COLLAPSED_KEY, JSON.stringify(Array.from(next)));
  } catch {
    /* storage is optional */
  }
}

/** Shared collapsible header for Media Hub shelves and library sections. */
export function MediaCollapsibleSection({
  id,
  title,
  actions,
  children,
  className,
  headingLevel = 3,
}: {
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}): ReactElement {
  const [collapsed, setCollapsed] = useState(() => loadSectionCollapsed().has(id));
  const toggle = (): void => {
    const next = loadSectionCollapsed();
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistSectionCollapsed(next);
    setCollapsed(next.has(id));
  };
  const HeadingTag = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <section className={`media-collapsible ${className ?? ''}`.trim()} data-collapsed={collapsed || undefined}>
      <div className="media-collapsible-head">
        <button
          type="button"
          className="media-collapsible-toggle"
          aria-expanded={!collapsed}
          onClick={toggle}
        >
          <span className="media-collapsible-chevron" aria-hidden />
          <HeadingTag className="media-collapsible-title">{title}</HeadingTag>
        </button>
        {actions ? <div className="media-collapsible-actions">{actions}</div> : null}
      </div>
      {!collapsed && <div className="media-collapsible-body">{children}</div>}
    </section>
  );
}

export type GenState = 'idle' | 'extracting' | 'loading' | 'transcribing' | 'done' | 'error';

/**
 * Category dropdown value. 'in-progress' is virtual — it lists running
 * downloads/transcriptions rather than filtering library items, so it is not a
 * MediaCategory.
 */
export type MediaCategoryFilterValue = MediaCategory | 'all' | 'in-progress';

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function malUrl(title: string): string {
  return `https://myanimelist.net/anime.php?cat=anime&q=${encodeURIComponent(title)}`;
}

export type MediaViewMode = 'full' | 'library' | 'video';

export interface MediaState {
  mode: MediaViewMode;
  showLibrary: boolean;
  showPlayer: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoWrapRef: React.RefObject<HTMLDivElement | null>;
  sigBurst: boolean;
  fireSigBurst: () => void;
  items: MediaItem[];
  setItems: (items: MediaItem[]) => void;
  watchFolder: string | null;
  current: MediaItem | null;
  src: string | null;
  cues: Cue[];
  subName: string;
  secondaryCues: Cue[];
  secondarySubName: string;
  secondaryActive: Cue | null;
  subStatus: string;
  subOffset: number;
  active: Cue | null;
  popup: { query: string; x: number; y: number; context?: string } | null;
  setPopup: (p: { query: string; x: number; y: number; context?: string } | null) => void;
  popupRef: React.MutableRefObject<{ query: string; x: number; y: number; context?: string } | null>;
  popupOpenOnDownRef: React.MutableRefObject<boolean>;
  error: string;
  setError: (s: string) => void;
  converting: boolean;
  modelTier: WhisperModelTier;
  setModelTier: (t: WhisperModelTier) => void;
  prefer: ReturnType<typeof loadWhisperDevice>;
  downloaded: ReturnType<typeof loadDownloaded>;
  subLang: 'ja' | 'zh' | 'ru';
  setSubLang: (l: 'ja' | 'zh' | 'ru') => void;
  genState: GenState;
  genMsg: string;
  genProgress: number;
  genError: string;
  generating: boolean;
  ytUrl: string;
  setYtUrl: (u: string) => void;
  ytSubLang: YouTubeSubtitleLang;
  setYtSubLang: (l: YouTubeSubtitleLang) => void;
  ytAudioLang: YouTubeAudioLang;
  setYtAudioLang: (l: YouTubeAudioLang) => void;
  yt: { stage: string; percent: number } | null;
  ytError: string;
  lineTrans: string;
  lineBusy: boolean;
  query: string;
  setQuery: (q: string) => void;
  debouncedQuery: string;
  searchActive: boolean;
  selectedFolder: string | null;
  setSelectedFolder: (f: string | null) => void;
  kindFilter: MediaKind | 'all';
  setKindFilter: (k: MediaKind | 'all') => void;
  categoryFilter: MediaCategoryFilterValue;
  setCategoryFilter: (category: MediaCategoryFilterValue) => void;
  displayedItems: MediaItem[];
  folderRows: ReturnType<typeof flattenFolderNav>;
  hasFolders: boolean;
  toggleFolder: (key: string, e: React.MouseEvent) => void;
  playbackRate: number;
  setPlaybackRate: (r: number) => void;
  autoPause: boolean;
  setAutoPause: React.Dispatch<React.SetStateAction<boolean>>;
  loopLine: boolean;
  setLoopLine: React.Dispatch<React.SetStateAction<boolean>>;
  furigana: boolean;
  setFurigana: React.Dispatch<React.SetStateAction<boolean>>;
  primarySubs: boolean;
  setPrimarySubs: React.Dispatch<React.SetStateAction<boolean>>;
  dualSubs: boolean;
  setDualSubs: (v: boolean) => void;
  dictationMode: boolean;
  setDictationMode: React.Dispatch<React.SetStateAction<boolean>>;
  dictationInput: string;
  setDictationInput: React.Dispatch<React.SetStateAction<string>>;
  dictationResult: DictationEvaluation | null;
  dictationRevealed: boolean;
  checkDictation: () => void;
  revealDictation: () => void;
  shadowingMode: boolean;
  setShadowingMode: React.Dispatch<React.SetStateAction<boolean>>;
  shadowRecording: boolean;
  shadowAudioUrl: string;
  shadowError: string;
  startShadowRecording: () => Promise<void>;
  stopShadowRecording: () => void;
  clearShadowRecording: () => void;
  subtitleSearchQuery: string;
  setSubtitleSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  subtitleSearchMatches: number[];
  subtitleSearchPosition: number;
  jumpSubtitleSearch: (direction: -1 | 1) => void;
  diagnosticsOpen: boolean;
  setDiagnosticsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  diagnosticsRunning: boolean;
  playerDiagnostics: PlayerDiagnosticReport | null;
  runPlayerDiagnostics: () => Promise<void>;
  exportPlayerDiagnostics: () => void;
  stepFrame: (direction: -1 | 1) => void;
  toggleFullscreen: () => Promise<void>;
  togglePictureInPicture: () => Promise<void>;
  subtitleFontSize: number;
  setSubtitleFontSize: React.Dispatch<React.SetStateAction<number>>;
  subtitlePosition: SubtitleVerticalPosition;
  setSubtitlePosition: React.Dispatch<React.SetStateAction<SubtitleVerticalPosition>>;
  subtitleOverlay: boolean;
  setSubtitleOverlay: React.Dispatch<React.SetStateAction<boolean>>;
  subtitleOverlayBackground: number;
  setSubtitleOverlayBackground: React.Dispatch<React.SetStateAction<number>>;
  learningModeActive: boolean;
  studySessionActive: boolean;
  handlePlayerPlay: () => void;
  handlePlayerPause: () => void;
  audioTracks: Array<{ index: number; label: string; language: string; enabled: boolean }>;
  listeningAvailability: StudyListeningAvailability | null;
  refreshListeningAvailability: () => void;
  refreshAudioTracks: () => void;
  selectAudioTrack: (index: number) => void;
  abStart: number | null;
  abEnd: number | null;
  abLoop: boolean;
  setAbLoop: React.Dispatch<React.SetStateAction<boolean>>;
  markAbStart: () => void;
  markAbEnd: () => void;
  clearAbRepeat: () => void;
  volumeNormalization: boolean;
  applyVolumeNormalization: (enabled: boolean) => Promise<void>;
  openFile: () => Promise<void>;
  openFolder: () => Promise<void>;
  openItem: (id: string) => Promise<void>;
  /** Loads an item AND brings the player forward. See the implementation note. */
  playItem: (id: string) => Promise<void>;
  removeItem: (id: string, e: React.MouseEvent) => Promise<void>;
  /* `override` is the deferred YouTube field flushing its in-flight text: `ytUrl` is only
     committed 70 ms after the last keystroke, so an Enter or a click arriving inside that
     window would otherwise start the download for the URL as it stood one character ago. */
  downloadYouTube: (override?: string) => Promise<void>;
  chooseWatchFolder: () => Promise<void>;
  clearWatch: () => Promise<void>;
  openSubs: () => Promise<void>;
  /** Load subtitle cues from raw text (a stored track, a picked file). */
  applySubtitleFile: (name: string, text: string) => boolean;
  openSecondarySubs: () => Promise<void>;
  convertAndPlay: () => Promise<void>;
  runGeneration: (url: string) => Promise<void>;
  jumpLine: (delta: number) => void;
  replayLine: () => void;
  translateLine: () => Promise<void>;
  lookupAt: (e: React.MouseEvent) => void;
  saveProgress: () => void;
  nudge: (delta: number) => void;
  clearPlayback: () => void;
  clearPlayer: () => void;
  resumeRef: React.MutableRefObject<number>;
}

export function useMedia(mode: MediaViewMode = 'full', wired = false): MediaState {
  const { t, lang } = useT();
  const initialPlayerPreferences = useRef(loadPlayerPreferences()).current;
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoWrapRef = useRef<HTMLDivElement | null>(null);
  // §5.1 SIG-VID: 300ms static burst on load/seek = "signal acquisition".
  const [sigBurst, setSigBurst] = useState(false);
  const sigBurstTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fireSigBurst = () => {
    if (!wired) return;
    if (sigBurstTimer.current) clearTimeout(sigBurstTimer.current);
    setSigBurst(true);
    sigBurstTimer.current = setTimeout(() => setSigBurst(false), 300);
  };
  useEffect(
    () => () => {
      if (sigBurstTimer.current) clearTimeout(sigBurstTimer.current);
    },
    [],
  );
  const workerRef = useRef<Worker | null>(null);
  const resumeRef = useRef(0);
  const cuesRef = useRef<Cue[]>([]);
  const secondaryCuesRef = useRef<Cue[]>([]);
  const offsetRef = useRef(0);
  const autoPauseRef = useRef(false);
  const loopLineRef = useRef(false);
  const abStartRef = useRef<number | null>(null);
  const abEndRef = useRef<number | null>(null);
  const abLoopRef = useRef(false);
  const lastCueEndRef = useRef<number | null>(null);
  const rafRef = useRef(0);
  const currentYoutubeIdRef = useRef<string | undefined>(undefined);
  const shadowRecorderRef = useRef<MediaRecorder | null>(null);
  const shadowStreamRef = useRef<MediaStream | null>(null);
  const shadowStopTimerRef = useRef<number | null>(null);
  const shadowAudioUrlRef = useRef('');
  const shadowGenerationRef = useRef(0);
  const studySessionIdRef = useRef('');
  const studySessionMediaIdRef = useRef('');
  const pendingStudyContextRef = useRef<StudyContextRef | null>(null);

  const [items, setItems] = useState<MediaItem[]>([]);
  const [watchFolder, setWatchFolder] = useState<string | null>(null);
  const [current, setCurrent] = useState<MediaItem | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [subName, setSubName] = useState('');
  const [secondaryCues, setSecondaryCues] = useState<Cue[]>([]);
  const [secondarySubName, setSecondarySubName] = useState('');
  const [secondaryActive, setSecondaryActive] = useState<Cue | null>(null);
  const [subStatus, setSubStatus] = useState('');
  const [subOffset, setSubOffset] = useState(0);
  const [active, setActive] = useState<Cue | null>(null);
  const [popup, setPopup] = useState<{
    query: string;
    x: number;
    y: number;
    context?: string;
  } | null>(null);
  const popupRef = useRef(popup);
  popupRef.current = popup;
  const popupOpenOnDownRef = useRef(false);
  const [error, setError] = useState('');
  const [converting, setConverting] = useState(false);
  const [modelTier, setModelTier] = useState<WhisperModelTier>(() =>
    loadWhisperModelTier(getStudyLang()),
  );
  const [prefer, setPrefer] = useState(loadWhisperDevice);
  const [downloaded, setDownloaded] = useState(loadDownloaded);
  const [subLang, setSubLang] = useState<'ja' | 'zh' | 'ru'>(() => getStudyLang());
  const [genState, setGenState] = useState<GenState>('idle');
  const [genMsg, setGenMsg] = useState('');
  const [genProgress, setGenProgress] = useState(0);
  const [genError, setGenError] = useState('');
  const [ytUrl, setYtUrl] = useState('');
  const [ytSubLang, setYtSubLang] = useState<YouTubeSubtitleLang>('none');
  // MINING gate 1: which dub. 'original' is the neutral value and reproduces the
  // app's pre-existing download exactly, so the default path is unchanged.
  const [ytAudioLang, setYtAudioLang] = useState<YouTubeAudioLang>('original');
  const [yt, setYt] = useState<{ stage: string; percent: number } | null>(null);
  const [ytError, setYtError] = useState('');
  const [lineTrans, setLineTrans] = useState('');
  const [lineBusy, setLineBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);
  const [kindFilter, setKindFilter] = useState<MediaKind | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<MediaCategoryFilterValue>('all');
  const [playbackRate, setPlaybackRate] = useState(initialPlayerPreferences.playbackRate);
  const [autoPause, setAutoPause] = useState(initialPlayerPreferences.autoPause);
  const [loopLine, setLoopLine] = useState(initialPlayerPreferences.loopLine);
  const [furigana, setFurigana] = useState(initialPlayerPreferences.furigana);
  const [primarySubs, setPrimarySubs] = useState(initialPlayerPreferences.primarySubs);
  const [dualSubs, setDualSubs] = useState(initialPlayerPreferences.dualSubs);
  const [dictationMode, setDictationMode] = useState(initialPlayerPreferences.dictationMode);
  const [dictationInput, setDictationInput] = useState('');
  const [dictationResult, setDictationResult] = useState<DictationEvaluation | null>(null);
  const [dictationRevealed, setDictationRevealed] = useState(false);
  const [shadowingMode, setShadowingMode] = useState(initialPlayerPreferences.shadowingMode);
  const [shadowRecording, setShadowRecording] = useState(false);
  const [shadowAudioUrl, setShadowAudioUrl] = useState('');
  const [shadowError, setShadowError] = useState('');
  const [subtitleSearchQuery, setSubtitleSearchQuery] = useState('');
  const [subtitleSearchPosition, setSubtitleSearchPosition] = useState(-1);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [playerDiagnostics, setPlayerDiagnostics] = useState<PlayerDiagnosticReport | null>(null);
  const [studySessionActive, setStudySessionActive] = useState(false);
  const [subtitleFontSize, setSubtitleFontSize] = useState(initialPlayerPreferences.subtitleFontSize);
  const [subtitlePosition, setSubtitlePosition] = useState<SubtitleVerticalPosition>(
    initialPlayerPreferences.subtitlePosition,
  );
  const [subtitleOverlay, setSubtitleOverlay] = useState(initialPlayerPreferences.subtitleOverlay);
  const [subtitleOverlayBackground, setSubtitleOverlayBackground] = useState(
    initialPlayerPreferences.subtitleOverlayBackground,
  );
  const [audioTracks, setAudioTracks] = useState<MediaState['audioTracks']>([]);
  const [listeningAvailability, setListeningAvailability] =
    useState<StudyListeningAvailability | null>(null);
  const [abStart, setAbStart] = useState<number | null>(null);
  const [abEnd, setAbEnd] = useState<number | null>(null);
  const [abLoop, setAbLoop] = useState(false);
  const [volumeNormalization, setVolumeNormalization] = useState(
    initialPlayerPreferences.volumeNormalization,
  );
  const [preferredAudioLanguage, setPreferredAudioLanguage] = useState(
    initialPlayerPreferences.preferredAudioLanguage,
  );

  const showLibrary = mode === 'full' || mode === 'library';
  const showPlayer = mode === 'full' || mode === 'video';
  const generating =
    genState === 'extracting' || genState === 'loading' || genState === 'transcribing';
  const learningModeActive = autoPause || loopLine || abLoop || dictationMode || shadowingMode;

  useEffect(() => {
    setListeningAvailability(null);
  }, [src]);

  useEffect(() => {
    autoPauseRef.current = autoPause;
  }, [autoPause]);
  useEffect(() => {
    loopLineRef.current = loopLine;
  }, [loopLine]);
  useEffect(() => {
    abStartRef.current = abStart;
    abEndRef.current = abEnd;
    abLoopRef.current = abLoop;
  }, [abEnd, abLoop, abStart]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(collapsed)));
  }, [collapsed]);

  /*
   * The Media Center's player preferences, written as a PATCH of the keys that
   * changed (round-2 audit B). This used to write a fixed 14-field copy on
   * mount and on every change, erasing everything else under the key — the
   * player's subtitle font, colours and position among them — and the player
   * did the same in reverse. `playerPreferencesPatch` also translates the two
   * keys whose meaning differs between the surfaces (vertical position and the
   * background toggle) into the player's own fields.
   */
  const playerPrefs: PlayerPreferences = useMemo(() => normalizePlayerPreferences({
    playbackRate,
    autoPause,
    loopLine,
    furigana,
    primarySubs,
    dualSubs,
    dictationMode,
    shadowingMode,
    volumeNormalization,
    preferredAudioLanguage,
    subtitleFontSize,
    subtitlePosition,
    subtitleOverlay,
    subtitleOverlayBackground,
  }), [
    autoPause,
    dictationMode,
    dualSubs,
    furigana,
    loopLine,
    playbackRate,
    primarySubs,
    preferredAudioLanguage,
    shadowingMode,
    subtitleFontSize,
    subtitleOverlay,
    subtitleOverlayBackground,
    subtitlePosition,
    volumeNormalization,
  ]);
  const lastPersistedPrefs = useRef<PlayerPreferences>(initialPlayerPreferences);
  useEffect(() => {
    const changed = changedPreferenceKeys(
      lastPersistedPrefs.current as unknown as Record<string, unknown>,
      playerPrefs as unknown as Record<string, unknown>,
    ) as (keyof PlayerPreferences)[];
    lastPersistedPrefs.current = playerPrefs;
    if (!changed.length) return;
    const delta: Partial<PlayerPreferences> = {};
    for (const key of changed) (delta as Record<string, unknown>)[key] = playerPrefs[key];
    writePlayerPreferencesPatch(
      playerPreferencesPatch(delta, readStoredPlayerPreferences()),
      MEDIA_CENTER_PREFS_SOURCE,
    );
  }, [playerPrefs]);

  // The player changed a shared preference (speed, toggles, position, …):
  // take it, and remember it as persisted so it is not written straight back.
  useEffect(() => onPlayerPreferencesChanged(MEDIA_CENTER_PREFS_SOURCE, (stored) => {
    const next = normalizePlayerPreferences(stored);
    // The player has no normalization switch of its own: when it turns the
    // preference off, it could not apply it to the video it is playing.
    if (lastPersistedPrefs.current.volumeNormalization && !next.volumeNormalization) {
      setError(t('media.error.volumeNormalizationFailed'));
    }
    lastPersistedPrefs.current = next;
    setPlaybackRate(next.playbackRate);
    setAutoPause(next.autoPause);
    setLoopLine(next.loopLine);
    setFurigana(next.furigana);
    setPrimarySubs(next.primarySubs);
    setDualSubs(next.dualSubs);
    setDictationMode(next.dictationMode);
    setShadowingMode(next.shadowingMode);
    setVolumeNormalization(next.volumeNormalization);
    setPreferredAudioLanguage(next.preferredAudioLanguage);
    setSubtitleFontSize(next.subtitleFontSize);
    setSubtitlePosition(next.subtitlePosition);
    setSubtitleOverlay(next.subtitleOverlay);
    setSubtitleOverlayBackground(next.subtitleOverlayBackground);
  }), []);

  const tree = useMemo(() => buildMediaTree(items), [items]);
  const searchIndex = useMemo(() => buildMediaFileSearchIndex(items), [items]);
  const debouncedQuery = useDebouncedValue(query, 80);
  const searchActive = debouncedQuery.trim().length > 0;
  const subtitleSearchMatches = useMemo(
    () => findSubtitleMatches(cues, subtitleSearchQuery),
    [cues, subtitleSearchQuery],
  );

  useEffect(() => {
    setSubtitleSearchPosition(-1);
  }, [subtitleSearchQuery, cues]);

  const displayedItems = useMemo(() => {
    let list = items;
    if (mode === 'video') list = list.filter((i) => (i.kind ?? 'video') === 'video');
    else if (mode === 'library' && kindFilter !== 'all') {
      list = list.filter((i) => (i.kind ?? 'video') === kindFilter);
    }
    // 'in-progress' is a virtual live-jobs view — library still shows everything.
    const libraryCategory = categoryFilter === 'in-progress' ? 'all' : categoryFilter;
    if (searchActive || libraryCategory !== 'all') {
      const hit = new Set(searchMediaHub(list, { query: debouncedQuery, category: libraryCategory }).map((i) => i.id));
      return list.filter((i) => hit.has(i.id));
    }
    if (selectedFolder) {
      const inFolder = collectTreeItems(tree, selectedFolder);
      return filterItemsById(list, new Set(inFolder.map((it) => it.id)));
    }
    return list;
  }, [searchActive, searchIndex, debouncedQuery, selectedFolder, tree, items, mode, kindFilter, categoryFilter]);

  const folderRows = useMemo(() => flattenFolderNav(tree, collapsed), [tree, collapsed]);
  const hasFolders = folderRows.length > 0;

  useEffect(() => {
    if (selectedFolder && collectTreeItems(tree, selectedFolder).length === 0) {
      setSelectedFolder(null);
    }
  }, [tree, selectedFolder]);

  const toggleFolder = useCallback((key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  useEffect(() => onWhisperDeviceChanged(setPrefer), []);
  useEffect(() => onWhisperModelChanged(setModelTier), []);
  useEffect(() => onDownloadedChanged(setDownloaded), []);

  // Apply study-language defaults when idle — never interrupt an in-flight job.
  useEffect(() => {
    return onStudyLangChanged((lang) => {
      if (genState === 'extracting' || genState === 'loading' || genState === 'transcribing') return;
      setSubLang(lang);
      setModelTier(loadWhisperModelTier(lang));
    });
  }, [genState]);

  useEffect(() => {
    cuesRef.current = cues;
  }, [cues]);
  useEffect(() => {
    secondaryCuesRef.current = secondaryCues;
  }, [secondaryCues]);
  useEffect(() => {
    offsetRef.current = subOffset;
  }, [subOffset]);
  useEffect(() => {
    setLineTrans('');
    setDictationInput('');
    setDictationResult(null);
    setDictationRevealed(false);
  }, [active]);

  const checkDictation = useCallback(() => {
    if (!active) return;
    setDictationResult(evaluateJapaneseDictation(dictationInput, active.text));
  }, [active, dictationInput]);

  const revealDictation = useCallback(() => {
    if (!active) return;
    setDictationRevealed(true);
    setDictationResult(evaluateJapaneseDictation(dictationInput, active.text));
  }, [active, dictationInput]);

  const clearShadowRecording = useCallback(() => {
    shadowGenerationRef.current += 1;
    const url = shadowAudioUrlRef.current;
    shadowAudioUrlRef.current = '';
    setShadowAudioUrl('');
    if (url) URL.revokeObjectURL(url);
  }, []);

  const stopShadowRecording = useCallback(() => {
    if (shadowStopTimerRef.current != null) {
      window.clearTimeout(shadowStopTimerRef.current);
      shadowStopTimerRef.current = null;
    }
    const recorder = shadowRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  const startShadowRecording = useCallback(async () => {
    if (shadowRecorderRef.current?.state === 'recording') return;
    setShadowError('');
    clearShadowRecording();
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Microphone recording is not supported in this player.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      shadowStreamRef.current = stream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const generation = shadowGenerationRef.current;
      const chunks: Blob[] = [];
      shadowRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setShadowError('The microphone recording stopped unexpectedly.');
      };
      recorder.onstop = () => {
        if (shadowStopTimerRef.current != null) {
          window.clearTimeout(shadowStopTimerRef.current);
          shadowStopTimerRef.current = null;
        }
        for (const track of stream.getTracks()) track.stop();
        if (shadowStreamRef.current === stream) shadowStreamRef.current = null;
        if (shadowRecorderRef.current === recorder) shadowRecorderRef.current = null;
        setShadowRecording(false);
        if (!chunks.length || generation !== shadowGenerationRef.current) return;
        const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        shadowAudioUrlRef.current = url;
        setShadowAudioUrl(url);
      };
      recorder.start(250);
      setShadowRecording(true);
      shadowStopTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop();
      }, 60_000);
    } catch (recordingError) {
      for (const track of shadowStreamRef.current?.getTracks() ?? []) track.stop();
      shadowStreamRef.current = null;
      shadowRecorderRef.current = null;
      setShadowRecording(false);
      setShadowError(
        recordingError instanceof Error
          ? recordingError.message
          : t('media.error.microphoneStartFailed'),
      );
    }
  }, [clearShadowRecording, lang, t]);

  useEffect(() => {
    stopShadowRecording();
    clearShadowRecording();
    setShadowError('');
  }, [active?.start, active?.text, clearShadowRecording, stopShadowRecording]);

  useEffect(() => () => {
    shadowGenerationRef.current += 1;
    if (shadowStopTimerRef.current != null) window.clearTimeout(shadowStopTimerRef.current);
    const recorder = shadowRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    for (const track of shadowStreamRef.current?.getTracks() ?? []) track.stop();
    const url = shadowAudioUrlRef.current;
    if (url) URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    window.api.listMedia().then(setItems);
    window.api.getMediaWatchFolder().then(setWatchFolder);
    const offItems = window.api.onMediaChanged(setItems);
    const offYt = window.api.onYoutubeProgress(setYt);
    return () => {
      offItems();
      offYt();
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (current && !items.some((i) => i.id === current.id)) {
      setSrc(null);
      setCurrent(null);
      currentYoutubeIdRef.current = undefined;
    }
  }, [items, current]);

  const applySubtitleFile = useCallback((name: string, text: string) => {
    // The primary track is the one every study tool downstream reads, so it gets
    // the per-style language split that a dual-language `.ass` needs: one file
    // carrying two whole subtitle tracks, which nothing above the parser can
    // see. Inert on `.srt`, `.vtt`, `.lrc` and any single-track `.ass`. The
    // secondary slot deliberately does not do this — see `parseStudySubtitles`.
    const split = parseStudySubtitles(text);
    const parsed = split.cues;
    setCues(parsed);
    setSubName(name);
    setSubOffset(0);
    const loaded = parsed.length
      ? t('media.subStatus.loaded', { count: parsed.length })
      : t('media.subStatus.noLines', { name });
    // Appended rather than replacing: how many lines loaded and why some did not
    // are two separate things, and hiding lines silently is the failure this
    // whole split exists to make visible.
    setSubStatus(
      split.dropped
        ? `${loaded} ${t('media.subStatus.otherScript', {
          count: split.dropped,
          styles: split.styles.slice(0, 4).join(', '),
        })}`
        : loaded,
    );
    return parsed.length > 0;
  }, [t]);

  const loadOpened = useCallback((r: MediaOpen) => {
    setCurrent(r.item);
    currentYoutubeIdRef.current = r.item.youtubeId;
    setSrc(r.url);
    resumeRef.current = r.item.positionSec ?? 0;
    setError('');
    setActive(null);
    setCues([]);
    setSubName('');
    setSecondaryCues([]);
    setSecondarySubName('');
    setSecondaryActive(null);
    setSubStatus('');
    // `media:open` already resolved which stored track belongs to this file —
    // `pickPlaybackSubtitle` over the item's records, honouring the user's own
    // choice. Applying it here is the last inch of that route: without it the
    // whole discovery pipeline is write-only, exactly as `media.ts` says, and a
    // track that was downloaded, listed in the drawer and picked by the library
    // is discarded by the reset two lines above. Every caller of `loadOpened`
    // wants it, so it lives here rather than in one entry point.
    if (r.subtitle) applySubtitleFile(r.subtitle.name, r.subtitle.text);
    // After the apply, which zeroes the offset: the item's stored offset is the
    // one the user aligned, and it outranks a fresh track's default.
    setSubOffset(r.item.subOffsetSec ?? 0);
    setGenState('idle');
    setGenMsg('');
    setGenError('');
    setLineTrans('');
    setAudioTracks([]);
    setAbStart(null);
    setAbEnd(null);
    setAbLoop(false);
  }, [applySubtitleFile]);

  // Deep-open from playlist manager / external open request.
  useEffect(() => {
    if (mode !== 'video' && mode !== 'full') return;
    const pending = takeHandoff('mediaId');
    if (!pending) return;
    void window.api.openMedia(pending).then((r) => {
      if (r) loadOpened(r);
    });
  }, [mode, loadOpened]);

  // Run Whisper on a given playable URL (used by the button and by YouTube auto-transcribe).
  const runGeneration = useCallback(
    async (targetUrl: string) => {
      setGenError('');
      setCues([]);
      setSubName('');
      setSubStatus('');
      setSubOffset(0);
      setGenProgress(0);
      setGenState('extracting');
      setGenMsg(t('media.gen.extractingAudio'));
      let audio: Float32Array;
      try {
        const buf = await window.api.extractAudio(targetUrl);
        audio = new Float32Array(buf);
        if (audio.length === 0) throw new Error('no audio track found');
      } catch (e) {
        setGenState('error');
        setGenError(t('media.gen.extractAudioFailed', { detail: msg(e) }));
        return;
      }
      setGenState('loading');
      setGenMsg(t('media.gen.loadingModel'));

      const worker = new Worker(new URL('../../whisperWorker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      worker.onmessage = (ev: MessageEvent) => {
        const m = ev.data;
        if (m.type === 'progress' && m.status === 'progress' && typeof m.progress === 'number') {
          const f = typeof m.file === 'string' ? m.file.split('/').pop() : 'model';
          setGenMsg(t('media.gen.downloadingModel', { file: f, percent: Math.round(m.progress) }));
        } else if (m.type === 'status' && m.status === 'transcribing') {
          // The pipeline is loaded, so this tier's files are now fully cached —
          // for whichever backend actually won (auto can fall back to wasm).
          markTierDownloaded(
            effectiveWhisperTier(modelTier, m.model),
            m.device === 'webgpu' ? 'webgpu' : 'wasm',
            prefer,
          );
          setGenState('transcribing');
          setGenMsg(
            t('media.gen.transcribingOn', {
              device: m.device === 'webgpu' ? t('media.device.gpu') : t('media.device.cpu'),
            }),
          );
        } else if (m.type === 'partial') {
          setCues((prev) => [...prev, ...(m.cues as Cue[])]);
          setGenProgress(m.progress ?? 0);
        } else if (m.type === 'done') {
          setGenState('done');
          setGenMsg('');
          setGenProgress(1);
          setSubName(t('media.subName.whisperGenerated'));
          setCues((prev) => {
            setSubStatus(t('media.subStatus.generated', { count: prev.length }));
            const ytId = currentYoutubeIdRef.current;
            if (ytId) {
              void window.api.ytMarkTranscribed(ytId, JSON.stringify(prev));
            }
            return prev;
          });
          worker.terminate();
          workerRef.current = null;
        } else if (m.type === 'error') {
          setGenState('error');
          setGenError(t('media.gen.subtitleFailed', { detail: m.message }));
          worker.terminate();
          workerRef.current = null;
        }
      };
      worker.onerror = (err) => {
        setGenState('error');
        setGenError(t('media.gen.transcriberStartFailed', { detail: err.message }));
      };
      worker.postMessage(
        { audio, model: whisperHfId(modelTier), prefer, lang: subLang },
        [audio.buffer],
      );
    },
    [modelTier, prefer, subLang, t],
  );

  const openFile = useCallback(async () => {
    const r = await window.api.pickMedia();
    if (r) {
      loadOpened(r);
      openMediaWorkspace({ localFilePath: r.item.path });
    }
  }, [loadOpened]);

  const openFolder = useCallback(async () => {
    setError('');
    try {
      // Dedicated one-shot import (preload + main must be restarted after first ship).
      if (typeof window.api.addMediaFolder === 'function') {
        const r = await window.api.addMediaFolder();
        setItems(r.items);
        if (r.added === 0) setError(t('media.openFolder.noneFound'));
        return;
      }
      // Hot-reload fallback: reuse the existing watch-folder dialog IPC, import
      // once, then clear the watch if the user did not already have one set.
      const prev = await window.api.getMediaWatchFolder();
      const r = await window.api.setMediaWatchFolder();
      setItems(r.items);
      setWatchFolder(r.folder);
      if (!prev) {
        await window.api.clearMediaWatchFolder();
        setWatchFolder(null);
      }
    } catch (e) {
      setError(t('media.openFolder.failed', { detail: msg(e) }));
    }
  }, [t]);

  const openItem = useCallback(
    async (id: string) => {
      // §5.1 SIG-VID: tape-seek cue on library row open (wired pack only).
      if (document.documentElement.getAttribute('data-materials') === 'wired') {
        window.dispatchEvent(new CustomEvent('wired:tape-seek'));
      }
      const r = await window.api.openMedia(id);
      if (r) {
        loadOpened(r);
        openMediaWorkspace({ localFilePath: r.item.path });
      }
      else setError(t('media.error.fileMoved'));
    },
    // `lang`, never `t` — see downloadYouTube below: `t`'s identity is stable, so a
    // callback that depends on it keeps resolving in the language it was created in.
    [loadOpened, lang, t],
  );

  /**
   * Open an item *and* surface the player.
   *
   * `openItem` alone loads the file into state and stops. In the library entry
   * point (`mode: 'library'`) the player stage is not mounted at all, so a card
   * click used to look like it did nothing — the item loaded into a component
   * nobody was rendering. Raising `os:open` navigates to the video app, the
   * same route `MediaStudyMode`'s study-episode action already takes.
   */
  const playItem = useCallback(
    async (id: string) => {
      await openItem(id);
      if (!showPlayer) window.dispatchEvent(new CustomEvent('os:open', { detail: 'video' }));
    },
    [openItem, showPlayer],
  );

  const removeItem = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      // `MediaGrid`'s per-card × is a live control in Blanc
      // (`BlancMediaPanels.tsx:175`), and it went straight to `media:remove` —
      // which drops the row, the covers, the artwork, and `rmSync`s that item's
      // whole directory under userData `subtitles/`. Whisper transcriptions and
      // harvested subtitle records both live there, so one stray click on a 12px
      // glyph destroyed acquisition and compute with no Recycle Bin and no undo.
      // Study OS confirms this same action in `MediaLibraryShell.removeEntry`;
      // Blanc did not, which is the mode gap rather than a second opinion. The
      // guard sits on the shared state helper so every host of `MediaGrid` gets
      // it and it cannot drift per-surface again. Same keys as Study OS, count 1.
      const item = items.find((candidate) => candidate.id === id);
      const ok = await confirmDialog({
        title: t('media.remove.title'),
        message: t('media.remove.message', { title: item?.title ?? item?.fileName ?? '', count: 1 }),
        confirmLabel: t('media.remove.confirm'),
        danger: true,
      });
      if (!ok) return;
      const next = await window.api.removeMedia(id);
      setItems(next);
      if (current?.id === id) {
        setSrc(null);
        setCurrent(null);
      }
    },
    [current, items, t],
  );

  const downloadYouTube = useCallback(async (override?: string) => {
    const url = (override ?? ytUrl).trim();
    if (!url) return;
    setYtError('');
    setYt({ stage: 'starting', percent: 0 });
    const r = await window.api.downloadYouTube(url, false, { subtitleLang: ytSubLang, audioLang: ytAudioLang });
    setYt(null);
    if ('error' in r) {
      // A refusal that carries a key is localised; the raw English `error` is
      // still the fallback, because most of main/media.ts's failures predate
      // the key and have none.
      setYtError(r.errorKey ? t(r.errorKey, r.errorParams) : r.error);
      return;
    }
    setYtUrl('');
    // `loadOpened` applies `r.subtitle` itself, with the study split. This used
    // to re-parse it here through the bare `parseSubtitles`, which meant a
    // dual-language YouTube track kept both languages on screen.
    loadOpened(r);
    if (!r.subtitle) {
      if (ytSubLang !== 'none')
        setSubStatus(t('media.subs.noneFoundGenerating'));
      void runGeneration(r.url);
    }
    // `lang`, never `t` — `t`'s identity is stable by design, so depending on it
    // goes stale silently after a language switch instead of erroring.
  }, [ytUrl, ytSubLang, ytAudioLang, loadOpened, runGeneration, lang, t]);

  const chooseWatchFolder = useCallback(async () => {
    const r = await window.api.setMediaWatchFolder();
    setWatchFolder(r.folder);
    setItems(r.items);
  }, []);
  const clearWatch = useCallback(async () => {
    await window.api.clearMediaWatchFolder();
    setWatchFolder(null);
  }, []);

  const applyStudyContext = useCallback(async (context: StudyContextRef): Promise<void> => {
    const opened = await window.api.openMedia(context.mediaId);
    if (!opened) {
      setError(t('media.error.sourceMoved'));
      return;
    }
    loadOpened(opened);
    const seekPosition = studyContextSeekPosition(context);
    resumeRef.current = seekPosition;
    if (
      typeof context.cueEndSec === 'number'
      && Number.isFinite(context.cueEndSec)
      && context.cueEndSec > seekPosition
    ) {
      setAbStart(seekPosition);
      setAbEnd(context.cueEndSec);
      setAbLoop(true);
    } else {
      setAbStart(null);
      setAbEnd(null);
      setAbLoop(false);
    }
    if (context.subtitleRecordId) {
      const subtitle = await window.api.readSubtitleRecord(
        context.mediaId,
        context.subtitleRecordId,
      );
      // A track whose file was moved or deleted: main has detached it and
      // queued a new search, and the user is told rather than left with no
      // subtitles and no reason.
      if (subtitle?.missing) setError(t('media.subtitles.fileMissing', { name: subtitle.name }));
      else if (subtitle) applySubtitleFile(subtitle.name, subtitle.text);
    }
    if (context.listeningMode === 'dictation') {
      stopShadowRecording();
      setShadowingMode(false);
      setLoopLine(false);
      setAutoPause(true);
      setPrimarySubs(true);
      setDictationInput('');
      setDictationResult(null);
      setDictationRevealed(false);
      setDictationMode(true);
    }
    window.setTimeout(() => {
      if (videoRef.current) videoRef.current.currentTime = seekPosition;
    }, 160);
  }, [applySubtitleFile, loadOpened, stopShadowRecording, lang, t]);

  useEffect(() => {
    if (!showPlayer) return;
    const openPendingContext = (context: StudyContextRef): void => {
      pendingStudyContextRef.current = null;
      void applyStudyContext(context);
    };
    const onStudyContext = (event: Event): void => {
      const context = (event as CustomEvent<StudyContextRef>).detail;
      if (context?.mediaId) openPendingContext(context);
    };
    window.addEventListener('study:open-media-context', onStudyContext);
    const pending = pendingStudyContextRef.current
      ?? takeHandoffJson<StudyContextRef>('studyContextRef');
    if (pending?.mediaId) openPendingContext(pending);
    return () => window.removeEventListener('study:open-media-context', onStudyContext);
  }, [applyStudyContext, showPlayer]);

  const openSubs = useCallback(async () => {
    // YouTube-sourced media pulls its own subtitles first — sidecar files from
    // the download, else straight from YouTube. Only fall back to the file
    // picker when there is nothing to fetch, so the button does the obvious
    // thing on a YouTube video instead of always asking for a file.
    const item = current;
    const isYoutube = !!item && (!!item.youtubeId || /youtu\.?be/i.test(item.sourceUrl ?? ''));
    if (item && isYoutube) {
      setSubStatus(t('media.subStatus.fetching'));
      try {
        const fetched = await window.api.fetchYoutubeSubs(item.id, item.lang);
        if (fetched.ok) {
          applySubtitleFile(fetched.name, fetched.text);
          return;
        }
        setSubStatus(fetched.error || t('media.subStatus.fetchFailed'));
      } catch (e) {
        setSubStatus(msg(e));
      }
    }
    const r = await window.api.pickSubtitle();
    if (!r) return;
    applySubtitleFile(r.name, r.text);
  }, [applySubtitleFile, current, t]);

  const openSecondarySubs = useCallback(async () => {
    const result = await window.api.pickSubtitle();
    if (!result) return;
    const parsed = parseSubtitles(result.text);
    setSecondaryCues(parsed);
    setSecondarySubName(result.name);
    setDualSubs(true);
    setSubStatus(
      parsed.length
        ? `Loaded ${parsed.length} translation subtitle lines from ${result.name}.`
        : `No subtitle lines found in ${result.name}.`,
    );
  }, []);

  const convertAndPlay = useCallback(async () => {
    if (!src) return;
    setConverting(true);
    setError('');
    try {
      const r = await window.api.convertMedia(src);
      if (r) setSrc(r.url);
      else setError(t('media.conversionFailedGeneric'));
    } catch (e) {
      setError(t('media.conversionFailed', { detail: msg(e) }));
    }
    setConverting(false);
  }, [src, t]);

  // High-resolution cue sync (timeupdate is too coarse for auto-pause).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !src) return;

    const tick = (): void => {
      const tNow = v.currentTime - offsetRef.current;
      const list = cuesRef.current;
      let found: Cue | null = null;
      for (let i = 0; i < list.length; i++) {
        if (tNow >= list[i].start && tNow < list[i].end) {
          found = list[i];
          break;
        }
      }
      setActive((prev) =>
        prev?.start === found?.start && prev?.text === found?.text ? prev : found,
      );
      let foundSecondary: Cue | null = null;
      const secondaryList = secondaryCuesRef.current;
      for (let index = 0; index < secondaryList.length; index += 1) {
        if (tNow >= secondaryList[index].start && tNow < secondaryList[index].end) {
          foundSecondary = secondaryList[index];
          break;
        }
      }
      setSecondaryActive((previous) => (
        previous?.start === foundSecondary?.start && previous?.text === foundSecondary?.text
          ? previous
          : foundSecondary
      ));

      if (found) {
        const end = found.end + offsetRef.current;
        if (loopLineRef.current && v.currentTime >= end - 0.04) {
          v.currentTime = found.start + offsetRef.current;
        } else if (
          autoPauseRef.current &&
          !v.paused &&
          lastCueEndRef.current !== found.end &&
          v.currentTime >= end - 0.05
        ) {
          lastCueEndRef.current = found.end;
          v.pause();
        }
      } else {
        lastCueEndRef.current = null;
      }
      const repeatStart = abStartRef.current;
      const repeatEnd = abEndRef.current;
      if (
        abLoopRef.current
        && repeatStart != null
        && repeatEnd != null
        && repeatEnd > repeatStart
        && v.currentTime >= repeatEnd - 0.04
      ) {
        v.currentTime = repeatStart;
        if (v.paused) void v.play();
      }

      if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
        rafRef.current = (
          v as HTMLVideoElement & {
            requestVideoFrameCallback: (cb: () => void) => number;
          }
        ).requestVideoFrameCallback(tick);
      } else {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    tick();
    return () => {
      if ('cancelVideoFrameCallback' in HTMLVideoElement.prototype) {
        (
          v as HTMLVideoElement & { cancelVideoFrameCallback: (id: number) => void }
        ).cancelVideoFrameCallback(rafRef.current);
      } else {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [src]);

  // Apply pitch-preserving playback rate.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.preservesPitch = true;
    v.playbackRate = playbackRate;
  }, [playbackRate, src]);

  const jumpLine = useCallback((delta: number) => {
    const v = videoRef.current;
    const list = cuesRef.current;
    if (!v || list.length === 0) return;
    const at = v.currentTime - offsetRef.current;
    let cur = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].start <= at + 0.05) cur = i;
      else break;
    }
    const target = Math.min(Math.max(cur + delta, 0), list.length - 1);
    v.currentTime = list[target].start + offsetRef.current;
    void v.play();
  }, []);

  const replayLine = useCallback(() => {
    const v = videoRef.current;
    if (!v || !active) return;
    v.currentTime = active.start + offsetRef.current;
    void v.play();
  }, [active]);

  const stepFrame = useCallback((direction: -1 | 1) => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(
      0,
      Math.min(Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER, video.currentTime + direction / 30),
    );
  }, []);

  const toggleFullscreen = useCallback(async () => {
    // Fullscreen the wrapper (not the bare <video>) so the subtitle overlay
    // stays visible in fullscreen; the native controls keep working inside it.
    const target = videoWrapRef.current ?? videoRef.current;
    if (!target) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await target.requestFullscreen();
    } catch (fullscreenError) {
      setError(fullscreenError instanceof Error ? fullscreenError.message : t('media.error.fullscreenFailed'));
    }
  }, [lang, t]);

  const togglePictureInPicture = useCallback(async () => {
    const video = videoRef.current as HTMLVideoElement & {
      requestPictureInPicture?: () => Promise<unknown>;
    };
    if (!video?.requestPictureInPicture) return;
    const pictureDocument = document as Document & {
      pictureInPictureElement?: Element | null;
      exitPictureInPicture?: () => Promise<void>;
    };
    try {
      if (pictureDocument.pictureInPictureElement) await pictureDocument.exitPictureInPicture?.();
      else await video.requestPictureInPicture();
    } catch (pictureError) {
      setError(
        pictureError instanceof Error ? pictureError.message : t('media.error.pictureInPictureFailed'),
      );
    }
  }, [lang, t]);

  const refreshAudioTracks = useCallback(() => {
    const video = videoRef.current as HTMLVideoElement & {
      audioTracks?: {
        length: number;
        [index: number]: { label?: string; language?: string; enabled: boolean };
      };
    };
    const tracks = video?.audioTracks;
    if (!tracks) {
      setAudioTracks([]);
      return;
    }
    const nextTracks = Array.from({ length: tracks.length }, (_, index) => ({
      index,
      label: tracks[index]?.label?.trim() || `Audio ${index + 1}`,
      language: tracks[index]?.language?.trim() || '',
      enabled: tracks[index]?.enabled === true,
    }));
    const preferred = nextTracks.find(
      (track) => preferredAudioLanguage && track.language.toLowerCase() === preferredAudioLanguage,
    );
    if (preferred && !preferred.enabled) {
      for (let index = 0; index < tracks.length; index += 1) {
        tracks[index].enabled = index === preferred.index;
      }
      for (const track of nextTracks) track.enabled = track.index === preferred.index;
    }
    setAudioTracks(nextTracks);
  }, [preferredAudioLanguage]);

  const refreshListeningAvailability = useCallback(() => {
    if (!current?.id) {
      setListeningAvailability(null);
      return;
    }
    const next = inspectStudyListeningAudio(current.id, videoRef.current);
    setListeningAvailability((previous) => (
      JSON.stringify(previous) === JSON.stringify(next) ? previous : next
    ));
  }, [current?.id]);

  const selectAudioTrack = useCallback((selectedIndex: number) => {
    const video = videoRef.current as HTMLVideoElement & {
      audioTracks?: {
        length: number;
        [index: number]: { enabled: boolean };
      };
    };
    const tracks = video?.audioTracks;
    if (!tracks || selectedIndex < 0 || selectedIndex >= tracks.length) return;
    for (let index = 0; index < tracks.length; index += 1) {
      tracks[index].enabled = index === selectedIndex;
    }
    const language = audioTracks.find((track) => track.index === selectedIndex)?.language;
    if (language) setPreferredAudioLanguage(language.toLowerCase());
    refreshAudioTracks();
  }, [audioTracks, refreshAudioTracks]);

  /*
   * Volume normalization is applied by the player that is actually mounted —
   * the VideoCore study overlay (`media/volumeNormalization.ts`) — which reads
   * this preference. The Web Audio graph that lived here was built on
   * `videoRef`, which nothing has attached since the old player was deleted,
   * so the toggle never touched any audio.
   */
  const applyVolumeNormalization = useCallback(async (enabled: boolean) => {
    setVolumeNormalization(enabled);
  }, []);

  const markAbStart = useCallback(() => {
    const position = videoRef.current?.currentTime;
    if (position == null) return;
    setAbStart(position);
    setAbEnd((end) => end != null && end > position ? end : null);
  }, []);

  const markAbEnd = useCallback(() => {
    const position = videoRef.current?.currentTime;
    if (position == null || abStartRef.current == null) return;
    if (position <= abStartRef.current + 0.05) {
      setError(t('media.error.loopEndBeforeStart'));
      return;
    }
    setAbEnd(position);
  }, [lang, t]);

  const clearAbRepeat = useCallback(() => {
    setAbStart(null);
    setAbEnd(null);
    setAbLoop(false);
  }, []);

  const jumpSubtitleSearch = useCallback((direction: -1 | 1) => {
    const position = wrapSubtitleMatch(
      subtitleSearchPosition,
      subtitleSearchMatches.length,
      direction,
    );
    if (position < 0) return;
    setSubtitleSearchPosition(position);
    const cue = cuesRef.current[subtitleSearchMatches[position]];
    const video = videoRef.current;
    if (cue && video) {
      video.currentTime = cue.start + offsetRef.current;
      void video.play();
    }
  }, [subtitleSearchMatches, subtitleSearchPosition]);

  /*
   * Diagnostics of the player that actually plays (`playerDiagnosticsRun.ts`):
   * the Seanime server and its transcoder, the VideoCore element's playback
   * path and tracks, the GPU and the decoders. This probed `videoRef`, which
   * nothing has attached since the old player was deleted.
   */
  const runPlayerDiagnostics = useCallback(async () => {
    setDiagnosticsRunning(true);
    try {
      setPlayerDiagnostics(buildPlayerDiagnosticReport(await collectPlayerDiagnostics()));
    } finally {
      setDiagnosticsRunning(false);
    }
  }, []);

  const exportPlayerDiagnostics = useCallback(() => {
    if (!playerDiagnostics) return;
    // The keys and values, and the sentences they render to in the UI language,
    // so the file reads on its own and still carries the raw facts.
    const readable = {
      ...playerDiagnostics,
      checks: playerDiagnostics.checks.map((check) => ({
        ...check,
        label: t(check.labelKey, check.vars),
        detail: t(check.detailKey, check.vars),
      })),
    };
    const blob = new Blob([JSON.stringify(readable, null, 2)], {
      type: 'application/json',
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `player-diagnostics-${new Date(playerDiagnostics.generatedAt).toISOString().replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [playerDiagnostics, t]);

  const translateLine = useCallback(async () => {
    if (!active) return;
    setLineBusy(true);
    try {
      const lang = getStudyLang();
      setLineTrans(await translate(active.text, lang));
    } catch {
      setLineTrans(t('media.offlineTranslatorUnavailable'));
    }
    setLineBusy(false);
  }, [active, t]);

  const lookupAt = useCallback(
    (e: React.MouseEvent) => {
      const dismissOnly = popupOpenOnDownRef.current && isLookupClick(e);
      const hit = lookupWordFromMouseUp(e);
      if (hit && !hit.translate) {
        setPopup({ query: hit.query, x: hit.x, y: hit.y, context: active?.text });
      } else if (dismissOnly) setPopup(null);
    },
    [active],
  );

  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (v && current && v.currentTime > 3) window.api.setMediaPosition(current.id, v.currentTime);
  }, [current]);

  const endActiveStudySession = useCallback(() => {
    const sessionId = studySessionIdRef.current;
    const positionSec = videoRef.current?.currentTime ?? 0;
    if (sessionId) endMediaStudySession(sessionId, positionSec);
    studySessionIdRef.current = '';
    studySessionMediaIdRef.current = '';
    setStudySessionActive(false);
  }, []);

  const beginActiveStudySession = useCallback(() => {
    if (!learningModeActive || !current || studySessionIdRef.current) return;
    const existingSession = loadMediaStudyDatabase().sessions.find(
      (session) => session.mediaId === current.id && session.endedAt == null,
    );
    if (existingSession) {
      studySessionMediaIdRef.current = current.id;
      setStudySessionActive(true);
      return;
    }
    const positionSec = videoRef.current?.currentTime ?? 0;
    studySessionIdRef.current = startMediaStudySession({
      mediaId: current.id,
      title: current.title,
      action: 'study-episode',
      positionSec,
    });
    studySessionMediaIdRef.current = current.id;
    setStudySessionActive(true);
  }, [current, learningModeActive]);

  const handlePlayerPlay = useCallback(() => {
    if (learningModeActive) beginActiveStudySession();
  }, [beginActiveStudySession, learningModeActive]);

  const handlePlayerPause = useCallback(() => {
    saveProgress();
    endActiveStudySession();
  }, [endActiveStudySession, saveProgress]);

  useEffect(() => {
    const sessionForDifferentMedia = (
      studySessionMediaIdRef.current
      && studySessionMediaIdRef.current !== current?.id
    );
    if (!learningModeActive || sessionForDifferentMedia) {
      endActiveStudySession();
      return;
    }
    if (current && videoRef.current && !videoRef.current.paused) beginActiveStudySession();
  }, [beginActiveStudySession, current, endActiveStudySession, learningModeActive]);

  useEffect(() => () => endActiveStudySession(), [endActiveStudySession]);

  const nudge = useCallback(
    (delta: number) => {
      setSubOffset((o) => {
        const next = Math.round((o + delta) * 1000) / 1000;
        if (current) void window.api.setMediaSubOffset(current.id, next);
        return next;
      });
    },
    [current],
  );

  const clearPlayback = useCallback(() => {
    setSrc(null);
    setCurrent(null);
    setWatchFolder(null);
  }, []);

  const clearPlayer = useCallback(() => {
    setSrc(null);
    setCurrent(null);
  }, []);

  /*
   * The ten `video.*` shortcut registrations that lived here are GONE — slice 19.
   *
   * They were Phase 5b's, and every one of them acted on `videoRef`, which slice 16 left
   * unattached when it deleted `MediaPlayerStage`. Nothing failed: the handlers kept
   * registering, `commandIsLive()` kept answering true, and Settings kept listing ten
   * bindable rows. `VideoCoreStudyOverlay` owns those actions now, against the player that
   * is actually mounted. This hook keeps `replayLine`, `jumpLine` and `nudge` because the
   * Study surfaces still call them directly.
   */

  return {
    mode,
    showLibrary,
    showPlayer,
    videoRef,
    sigBurst,
    fireSigBurst,
    items,
    setItems,
    watchFolder,
    current,
    src,
    cues,
    subName,
    secondaryCues,
    secondarySubName,
    secondaryActive,
    subStatus,
    subOffset,
    active,
    popup,
    setPopup,
    popupRef,
    popupOpenOnDownRef,
    error,
    setError,
    converting,
    modelTier,
    setModelTier,
    prefer,
    downloaded,
    subLang,
    setSubLang,
    genState,
    genMsg,
    genProgress,
    genError,
    generating,
    ytUrl,
    setYtUrl,
    ytSubLang,
    setYtSubLang,
    ytAudioLang,
    setYtAudioLang,
    yt,
    ytError,
    lineTrans,
    lineBusy,
    query,
    setQuery,
    debouncedQuery,
    searchActive,
    selectedFolder,
    setSelectedFolder,
    kindFilter,
    categoryFilter,
    setCategoryFilter,
    setKindFilter,
    displayedItems,
    folderRows,
    hasFolders,
    toggleFolder,
    playbackRate,
    setPlaybackRate,
    autoPause,
    setAutoPause,
    loopLine,
    setLoopLine,
    furigana,
    setFurigana,
    primarySubs,
    setPrimarySubs,
    dualSubs,
    setDualSubs,
    dictationMode,
    setDictationMode,
    dictationInput,
    setDictationInput,
    dictationResult,
    dictationRevealed,
    checkDictation,
    revealDictation,
    shadowingMode,
    setShadowingMode,
    shadowRecording,
    shadowAudioUrl,
    shadowError,
    startShadowRecording,
    stopShadowRecording,
    clearShadowRecording,
    subtitleSearchQuery,
    setSubtitleSearchQuery,
    subtitleSearchMatches,
    subtitleSearchPosition,
    jumpSubtitleSearch,
    diagnosticsOpen,
    setDiagnosticsOpen,
    diagnosticsRunning,
    playerDiagnostics,
    runPlayerDiagnostics,
    exportPlayerDiagnostics,
    stepFrame,
    toggleFullscreen,
    togglePictureInPicture,
    subtitleFontSize,
    setSubtitleFontSize,
    subtitlePosition,
    setSubtitlePosition,
    subtitleOverlay,
    setSubtitleOverlay,
    subtitleOverlayBackground,
    setSubtitleOverlayBackground,
    videoWrapRef,
    learningModeActive,
    studySessionActive,
    handlePlayerPlay,
    handlePlayerPause,
    audioTracks,
    listeningAvailability,
    refreshListeningAvailability,
    refreshAudioTracks,
    selectAudioTrack,
    abStart,
    abEnd,
    abLoop,
    setAbLoop,
    markAbStart,
    markAbEnd,
    clearAbRepeat,
    volumeNormalization,
    applyVolumeNormalization,
    openFile,
    openFolder,
    openItem,
    playItem,
    removeItem,
    downloadYouTube,
    chooseWatchFolder,
    clearWatch,
    openSubs,
    applySubtitleFile,
    openSecondarySubs,
    convertAndPlay,
    runGeneration,
    jumpLine,
    replayLine,
    translateLine,
    lookupAt,
    saveProgress,
    nudge,
    clearPlayback,
    clearPlayer,
    resumeRef,
  };
}

/** Whisper model picker + subtitle language segment. Player modes only. */
export function MediaTranscriptionControls({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <>
      <select
        className="media-model-select"
        value={state.modelTier}
        aria-label={t('media.model.ariaLabel')}
        onChange={(e) => {
          const tier = e.target.value as WhisperModelTier;
          state.setModelTier(tier);
          setWhisperModelTier(tier);
        }}
      >
        {WHISPER_MODEL_SPECS.map((s) => (
          <option key={s.id} value={s.id}>
            {t(`media.model.${s.id}`)}
            {isDownloadedIn(state.downloaded, s.id, state.prefer)
              ? ' ✓'
              : ` · ${t('media.model.willDownload')}`}
          </option>
        ))}
      </select>
      <div className="sp-seg media-modelseg" role="group" aria-label={t('media.lang.ariaLabel')}>
        <button
          className={`sp-seg-btn ${state.subLang === 'ja' ? 'active' : ''}`}
          aria-pressed={state.subLang === 'ja'}
          onClick={() => {
            state.setSubLang('ja');
            setStudyLang('ja');
          }}
          title={t('media.lang.ja.title')}
          lang="ja"
        >
          日本語
        </button>
        <button
          className={`sp-seg-btn ${state.subLang === 'zh' ? 'active' : ''}`}
          aria-pressed={state.subLang === 'zh'}
          onClick={() => {
            state.setSubLang('zh');
            setStudyLang('zh');
          }}
          title={t('media.lang.zh.title')}
          lang="zh"
        >
          中文
        </button>
        <button
          className={`sp-seg-btn ${state.subLang === 'ru' ? 'active' : ''}`}
          aria-pressed={state.subLang === 'ru'}
          onClick={() => {
            state.setSubLang('ru');
            setStudyLang('ru');
          }}
          title={t('media.lang.ru.title')}
          lang="ru"
        >
          {STUDY_LANG_NATIVE_NAME.ru}
        </button>
      </div>
    </>
  );
}

/** Watch-folder chip. */
export function MediaWatchFolder({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <div className="media-watch">
      {state.watchFolder ? (
        <>
          <span className="muted media-watch-path" title={state.watchFolder}>
            <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {state.watchFolder.split(/[\\/]/).pop()}
          </span>
          <button className="btn small" onClick={() => void state.clearWatch()}>
            {t('media.watch.stop')}
          </button>
        </>
      ) : (
        <button className="btn small" onClick={() => void state.chooseWatchFolder()}>
          <Icon name="eye" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
          {t('media.watch.autoAdd')}
        </button>
      )}
    </div>
  );
}

/** YouTube download + subtitle-language row. Player modes only. */
export function MediaYoutubeBar({ state }: { state: MediaState }) {
  const { t } = useT();
  /*
   * `ytUrl` lives in `useMedia`, so committing every keystroke to it reconciled the WHOLE
   * Media Center — sidebar, topbar, the video page and the seven-poster up-next shelf — for
   * one character in a field the shelf knows nothing about. Rubric category 2, measured live
   * on the Video window with a library item loaded (JoJo 38 RAW, 486 cues): first keystroke
   * **171.7 ms**, then 128.4, 82.5, 47.2, against a 100 ms bar — `overBar100: 2`, a FAIL.
   *
   * The cure already existed one directory over and is now a hook rather than a second copy:
   * hold the text locally, commit upward on the same 70 ms schedule the top bar's search uses.
   * `flush()` before a download is not optional — `downloadYouTube` reads `ytUrl`, so a commit
   * still in flight would start the download for the URL as it stood one character ago; both
   * entry points pass the field's own text as the override for exactly that reason.
   */
  const ytField = useDeferredText({
    value: state.ytUrl,
    contextKey: 'media-yt',
    deferMs: GLOBAL_SEARCH_COMMIT_MS,
    onCommit: state.setYtUrl,
  });
  // Video's third mute pair. `disabled` derives from the reason so the two cannot
  // disagree, and the rule is shared rather than inline because its ORDER matters:
  // the same running download that greys the button also disables the input above.
  const downloadReason = youtubeDownloadDisabledReason({
    // The FIELD's text, not the committed store: the button's own grey-out must not lag the
    // typing by the 70 ms the commit is deferred, or pasting a URL and clicking straight away
    // hits a control that is still disabled for a URL the user can already see.
    url: ytField.text,
    downloading: !!state.yt,
  });
  return (
    <>
      <div className="media-yt">
        <input
          className="gram-search media-yt-input"
          type="text"
          value={ytField.text}
          onChange={(e) => ytField.change(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            ytField.flush();
            void state.downloadYouTube(ytField.text);
          }}
          placeholder={t('media.yt.placeholder')}
          disabled={!!state.yt}
        />
        <select
          className="media-model-select"
          value={state.ytSubLang}
          onChange={(e) => state.setYtSubLang(e.target.value as YouTubeSubtitleLang)}
          disabled={!!state.yt}
          title={t('media.yt.subLang.title')}
          aria-label={t('media.yt.subLang.label')}
        >
          {/* Seven raw English literals sat here, inside a block where the placeholder,
              the button and both progress strings were already localised. No guard in
              this repo can see that: `i18n-check` compares catalogues against each
              other, so a string that never became a key is missing from none of them.
              Only the sweep's four-language leg, which asserts the rendered text
              CHANGES between languages, finds an island like this. */}
          <option value="none">{t('media.yt.subLang.none')}</option>
          <option value="ja">{t('media.yt.subLang.ja')}</option>
          <option value="zh">{t('media.yt.subLang.zh')}</option>
          <option value="en">{t('media.yt.subLang.en')}</option>
          <option value="ru">{t('media.yt.subLang.ru')}</option>
        </select>
        {/* MINING gate 1 — which dub. Sits beside the subtitle picker because
            the two answer the same question about the same download: which
            language do I want this in, spoken and written. */}
        <select
          className="media-model-select"
          value={state.ytAudioLang}
          onChange={(e) => state.setYtAudioLang(e.target.value as YouTubeAudioLang)}
          disabled={!!state.yt}
          title={t('media.yt.audioLang.title')}
          aria-label={t('media.yt.audioLang.label')}
        >
          <option value="original">{t('media.yt.audioLang.original')}</option>
          <option value="ja">{t('media.yt.audioLang.ja')}</option>
          <option value="zh">{t('media.yt.audioLang.zh')}</option>
          <option value="en">{t('media.yt.audioLang.en')}</option>
          <option value="ru">{t('media.yt.audioLang.ru')}</option>
        </select>
        <button
          className="btn"
          onClick={() => {
            ytField.flush();
            void state.downloadYouTube(ytField.text);
          }}
          title={downloadReason ? t(downloadReason) : undefined}
          disabled={!!downloadReason}
        >
          <Icon name="download" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
          {t('media.yt.downloadTranscribe')}
        </button>
        {state.yt && (
          <span className="muted media-yt-prog">
            {state.yt.stage === 'merging'
              ? t('media.yt.merging')
              : t('media.yt.downloading', { percent: Math.round(state.yt.percent) })}
          </span>
        )}
      </div>
      {state.ytError && <div className="media-error">{state.ytError}</div>}
    </>
  );
}

/** Transcription progress, error, and subtitle status. Player modes only. */
export function MediaGenerationStatus({ state }: { state: MediaState }) {
  return (
    <>
      {state.generating && (
        <div className="media-gen">
          <span className="media-gen-dot" />
          <div className="media-gen-body">
            <span>{state.genMsg}</span>
            {state.genState === 'transcribing' && (
              <div className="media-gen-bar">
                <div
                  className="media-gen-bar-fill"
                  style={{ width: `${Math.round(state.genProgress * 100)}%` }}
                />
              </div>
            )}
          </div>
        </div>
      )}
      {state.genError && <div className="media-error">{state.genError}</div>}
      {state.subStatus && !state.generating && (
        <div className="media-substatus muted">{state.subStatus}</div>
      )}
    </>
  );
}

/** Search field over the library. */
export function MediaSearchBox({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <div className="media-search">
      <Icon name="search" size={13} />
      <input
        type="text"
        value={state.query}
        onChange={(e) => state.setQuery(e.target.value)}
        placeholder={t('media.search.placeholder')}
        aria-label={t('media.search.ariaLabel')}
      />
      {state.query && (
        <button
          className="media-search-clear"
          onClick={() => state.setQuery('')}
          title={t('media.search.clear')} aria-label={t('media.search.clear')}
        >
          ×
        </button>
      )}
    </div>
  );
}

/** Folder rail. Rendered only when there are folders and no active search. */
export function MediaFolderNav({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <nav className="media-lib-folders" aria-label={t('media.folders.ariaLabel')}>
      <button
        type="button"
        className={`media-folder-row media-folder-all ${state.selectedFolder === null ? 'active' : ''}`}
        onClick={() => state.setSelectedFolder(null)}
      >
        <Icon name="video" size={13} style={{ flexShrink: 0 }} />
        <span className="media-folder-name">{t('media.folders.all')}</span>
        <span className="muted media-folder-count">{state.items.length}</span>
      </button>
      {state.folderRows.map((row) => (
        <div
          key={row.key}
          className={`media-folder-row ${state.selectedFolder === row.key ? 'active' : ''}`}
          style={{ paddingLeft: 10 + row.depth * 14 }}
        >
          <button
            type="button"
            className="media-folder-chevron"
            onClick={(e) => state.toggleFolder(row.key, e)}
            aria-label={row.collapsed ? t('media.folder.expand') : t('media.folder.collapse')}
          >
            <Icon
              name="chevron"
              size={12}
              style={{
                transition: 'transform 0.15s ease',
                transform: row.collapsed ? undefined : 'rotate(90deg)',
              }}
            />
          </button>
          <button
            type="button"
            className="media-folder-select"
            onClick={() => state.setSelectedFolder(row.key)}
            title={row.key}
          >
            <Icon name="folder" size={13} style={{ flexShrink: 0 }} />
            <span className="media-folder-name">{row.name}</span>
            <span className="muted media-folder-count">{row.count}</span>
          </button>
        </div>
      ))}
    </nav>
  );
}

/** The virtualized card grid, or the "nothing matched" state. */
export function MediaGrid({ state }: { state: MediaState }) {
  const { t } = useT();

  if (state.displayedItems.length === 0) {
    return (
      <div className="media-empty media-empty-filtered">
        <p className="muted">
          {state.searchActive
            ? t('media.noMatch', { query: state.debouncedQuery })
            : t('media.noFilesInFolder')}
        </p>
      </div>
    );
  }

  return (
    <VirtualGrid
      items={state.displayedItems}
      minColWidth={CARD_MIN_WIDTH}
      gap={CARD_GAP}
      rowHeight={CARD_ROW_HEIGHT}
      className="media-lib-grid-wrap"
      getKey={(it) => it.id}
      renderItem={(it) => (
        <div
          className={`media-card ${state.current?.id === it.id ? 'active' : ''}`}
          onClick={() => void state.openItem(it.id)}
        >
          <div className="media-card-thumb">
            <Icon name="video" size={22} />
          </div>
          <div className="media-card-body">
            <span className="media-card-title">{it.title}</span>
            <span className="media-card-file">{it.fileName}</span>
            <div className="media-card-actions">
              <button
                className="media-card-link"
                onClick={(e) => {
                  e.stopPropagation();
                  window.api.openExternal(malUrl(it.title));
                }}
              >
                {t('media.malShort')}
                <Icon name="external" size={11} style={{ marginLeft: 3, verticalAlign: '-2px' }} />
              </button>
              <button
                className="media-card-del"
                onClick={(e) => void state.removeItem(it.id, e)}
                title={t('media.remove')}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          </div>
        </div>
      )}
    />
  );
}

/** Empty-library state, shown instead of the grid when nothing is imported. */
export function MediaEmptyLibrary() {
  const { t } = useT();
  return (
    <div className="media-empty">
      <div className="media-empty-emoji">
        <Icon name="video" size={44} />
      </div>
      <p>{t('media.emptyHint')}</p>
      <p className="muted media-empty-note">
        {t('media.emptyNotePrefix')} <b>{t('media.watch.autoAddLabel')}</b>{' '}
        {t('media.emptyNoteSuffix')}
      </p>
    </div>
  );
}

/** Kind filter segment (all / video / audio / audiobook). Not shown in video mode. */
export function MediaKindFilter({ state }: { state: MediaState }) {
  const { t } = useT();
  return (
    <div className="sp-seg" role="group" aria-label={t('media.kindFilter')}>
      {(['all', 'video', 'audio', 'audiobook'] as const).map((k) => (
        <button
          key={k}
          type="button"
          className={`sp-seg-btn ${state.kindFilter === k ? 'active' : ''}`}
          aria-pressed={state.kindFilter === k}
          onClick={() => state.setKindFilter(k)}
        >
          {t(`media.kind.${k}`)}
        </button>
      ))}
    </div>
  );
}

export function MediaCategoryFilter({ state }: { state: MediaState }) {
  const { t } = useT();
  const categories: MediaCategoryFilterValue[] = ['all', 'in-progress', 'anime', 'drama', 'movie', 'tv', 'music', 'podcast', 'audiobook', 'learning', 'personal', 'inbox'];
  const label = (category: MediaCategoryFilterValue): string => {
    if (category === 'all') return t('media.category.all');
    if (category === 'in-progress') return t('media.category.inProgress');
    return category[0].toUpperCase() + category.slice(1);
  };
  return <Select aria-label={t('media.category.filterLabel')} value={state.categoryFilter} onChange={(event) => state.setCategoryFilter(event.target.value as MediaCategoryFilterValue)}>
    {categories.map((category) => <option key={category} value={category}>{label(category)}</option>)}
  </Select>;
}

/** Small dashboard shelves shared by the full Media Hub and library entry points. */
export function MediaHubDashboard({ items, onOpen }: { items: MediaItem[]; onOpen: (id: string) => void }) {
  const { t } = useT();
  const shelves = buildMediaHubSections(items);
  const [state, setState] = useState(loadMediaHubState);
  const [studyDatabase, setStudyDatabase] = useState(loadMediaStudyDatabase);
  const [diagnostics, setDiagnostics] = useState<MediaHubDiagnostics>({ duplicates: [], missing: [] });
  useEffect(() => { saveMediaHubState(state); }, [state]);
  useEffect(() => onMediaStudyDatabaseChanged(setStudyDatabase), []);
  useEffect(() => {
    let active = true;
    void Promise.all(items.map(async (item) => [item.path, await window.api.mediaPathExists(item.path)] as const))
      .then((checks) => { if (active) setDiagnostics(diagnoseMediaPaths(items, (path) => checks.find(([p]) => p === path)?.[1] ?? false)); });
    return () => { active = false; };
  }, [items]);
  // The FIRST element is the persisted id, not the label. `MediaCollapsibleSection`
  // stores each shelf's open/closed state under `shelf:<id>`, so translating the id
  // would reset every shelf the moment the UI language changed — and would store a
  // different key per language. The id stays the stable English slug; only the
  // rendered title goes through `t()`.
  const rows = [
    ['Favorites', 'mediaHub.shelf.favorites', items.filter((item) => state[item.id]?.favorite)],
    ['Study queue', 'mediaHub.shelf.studyQueue', items.filter((item) => state[item.id]?.studyQueue)],
    ['Recently added', 'mediaHub.shelf.recentlyAdded', shelves.recentlyAdded],
    ['Continue watching', 'mediaHub.shelf.continueWatching', shelves.continueWatching],
    ['Recently studied', 'mediaHub.shelf.recentlyStudied', shelves.recentlyStudied],
    ['Recently listened', 'mediaHub.shelf.recentlyListened', shelves.recentlyListened],
    ['Recommended', 'mediaHub.shelf.recommended', shelves.recommended],
    ['Unorganized files', 'mediaHub.shelf.unorganized', shelves.unorganized],
  ] as const;

  return (
    <section className="media-hub-dashboard" aria-label={t('mediaHub.dashboard.label')}>
      {rows.map(([id, titleKey, shelf]) => shelf.length > 0 && (
        <MediaCollapsibleSection id={`shelf:${id}`} key={id} title={t(titleKey)} className="media-hub-shelf">
          <div className="media-hub-shelf-row">
            {shelf.map((item) => (
              <div className="media-hub-shelf-item" key={item.id}>
                <button className="media-hub-item-title" type="button" title={item.title} onClick={() => onOpen(item.id)}>
                  <span>{item.title}</span>
                </button>
                <MediaStudyActions item={item} />
                <div className="media-hub-item-actions">
                  <button
                    type="button"
                    className="media-hub-favorite"
                    aria-pressed={state[item.id]?.favorite === true}
                    onClick={() => setState((prev) => ({
                      ...prev,
                      [item.id]: { ...prev[item.id], favorite: !prev[item.id]?.favorite },
                    }))}
                  >
                    <Icon name="bookmark" size={12} />
                    <span>{state[item.id]?.favorite ? 'Favorited' : 'Favorite'}</span>
                  </button>
                  <button
                    type="button"
                    className="media-hub-queue"
                    aria-pressed={state[item.id]?.studyQueue === true}
                    onClick={() => setState((previous) => ({
                      ...previous,
                      [item.id]: {
                        ...previous[item.id],
                        studyQueue: !previous[item.id]?.studyQueue,
                      },
                    }))}
                  >
                    {state[item.id]?.studyQueue ? 'Queued' : 'Study queue'}
                  </button>
                </div>
                {studyDatabase.profiles[item.id] && (
                  <small className="media-hub-language-profile">
                    {studyDatabase.profiles[item.id].difficulty.jlptLevel ?? studyDatabase.profiles[item.id].difficulty.band}
                    {' · '}
                    {studyDatabase.profiles[item.id].vocabulary.uniqueWords} words
                  </small>
                )}
                <small className="media-hub-item-meta">
                  {item.kind ?? 'video'}{item.positionSec ? ` · ${Math.round(item.positionSec)}s` : ''}
                </small>
                <input
                  className="media-hub-note"
                  aria-label={t('mediaHub.note.label', { title: item.title })}
                  placeholder={t('mediaHub.note.placeholder')}
                  value={state[item.id]?.note ?? ''}
                  onChange={(event) => setState((prev) => ({
                    ...prev,
                    [item.id]: { ...prev[item.id], note: event.target.value },
                  }))}
                />
              </div>
            ))}
          </div>
        </MediaCollapsibleSection>
      ))}
      <MediaHubSeriesPanel items={items} />
      {(diagnostics.duplicates.length > 0 || diagnostics.missing.length > 0) && (
        <div className="media-hub-diagnostics" role="status">
          {diagnostics.duplicates.length > 0 && <span>{t('mediaHub.diagnostics.duplicates', { count: diagnostics.duplicates.length })}</span>}
          {diagnostics.missing.length > 0 && <span>{t('mediaHub.diagnostics.missing', { count: diagnostics.missing.length })}</span>}
          {diagnostics.missing.length > 0 && (
            <button
              className="btn"
              type="button"
              onClick={() => { void confirmAndPruneMissingMedia(t, diagnostics.missing.length); }}
            >
              {t('mediaHub.diagnostics.pruneAction')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * MASTER_PLAN §10 — series view over the local library: which titles the Hub has
 * grouped, which episodes are missing from a run, and which slots hold more than one
 * file. Read-only on purpose; resolving a duplicate is the storage panel's job.
 */
export function MediaHubSeriesPanel({ items }: { items: MediaItem[] }) {
  const { t, lang } = useT();
  const series = useMemo(
    () => resolveLocalMediaIdentities(items).identities.filter(
      (identity) => Object.keys(identity.episodesBySeason).length > 0,
    ),
    [items],
  );
  const formatList = useMemo(() => new Intl.ListFormat(lang, { style: 'short', type: 'unit' }), [lang]);
  if (series.length === 0) return null;
  return (
    <MediaCollapsibleSection
      id="series"
      className="media-hub-shelf media-hub-series"
      title={t('mediaHub.series.title')}
    >
      <div className="media-hub-series-list">
        {series.map((identity) => {
          const seasons = Object.keys(identity.episodesBySeason).map(Number).sort((a, b) => a - b);
          const total = seasons.reduce((sum, season) => sum + identity.episodesBySeason[season].length, 0);
          const gaps = seasons.filter((season) => identity.missingBySeason[season]?.length);
          return (
            <div className="media-hub-series-row" key={identity.id}>
              <strong>{identity.title}</strong>
              <small>{t('mediaHub.series.episodeCount', { count: total })}</small>
              {gaps.length > 0
                ? gaps.map((season) => (
                  <small className="media-hub-series-gap" key={season}>
                    {t('mediaHub.series.missing', {
                      season,
                      episodes: formatList.format(identity.missingBySeason[season].map(String)),
                    })}
                  </small>
                ))
                : <small className="media-hub-series-complete">{t('mediaHub.series.noGaps')}</small>}
              {identity.duplicateKeys.length > 0 && (
                <small className="media-hub-series-duplicate">
                  {t('mediaHub.series.duplicateSlots', { count: identity.duplicateKeys.length })}
                </small>
              )}
            </div>
          );
        })}
      </div>
    </MediaCollapsibleSection>
  );
}

export function MediaHubStoragePanel({ items }: { items: MediaItem[] }) {
  const { t } = useT();
  const [root, setRoot] = useState('');
  const [selectedId, setSelectedId] = useState(items[0]?.id ?? '');
  const [preview, setPreview] = useState<MediaOrganizationPreview | null>(null);
  const [choice, setChoice] = useState<MediaDuplicateChoice>('keep-existing');
  const [scan, setScan] = useState<{ totalBytes: number; files: Array<{ path: string; size: number; modifiedAt: number }> } | null>(null);
  const [relationships, setRelationships] = useState<MediaRelationship[]>([]);
  const [targetId, setTargetId] = useState('');
  const [relationshipType, setRelationshipType] = useState<MediaRelationship['type']>('note');
  const selected = items.find((item) => item.id === selectedId);
  useEffect(() => { if (!selected && items[0]) setSelectedId(items[0].id); }, [items, selected]);
  useEffect(() => { if (selected) void window.api.listMediaRelationships(selected.id).then(setRelationships); }, [selected]);
  const previewOrganization = async () => { if (!selected || !root.trim()) return; setPreview(await window.api.previewMediaOrganization(selected.id, root.trim())); };
  const applyOrganization = async () => { if (!preview) return; const result = await window.api.organizeMedia(preview, choice); if (result.ok) setPreview(null); };
  const scanStorage = async () => { const result = await window.api.scanMediaStorage(items.map((item) => item.path)); setScan(result); };
  const exportBackup = async () => { const backup = await window.api.backupMedia(); const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = mediaHubBackupFilename(backup.createdAt); link.click(); URL.revokeObjectURL(link.href); };
  const addRelationship = async () => { if (!selected || !targetId) return; const relation = await window.api.addMediaRelationship({ fromId: selected.id, toId: targetId, type: relationshipType }); setRelationships((current) => [...current, relation]); setTargetId(''); };
  return (
    <>
      <MediaCollapsibleSection
        id="storage"
        className="media-hub-storage"
        title={t('media.storage.title')}
        actions={(
          <div>
            <button type="button" className="btn" onClick={() => void scanStorage()}>{t('media.storage.scanBytes')}</button>
            <button type="button" className="btn" onClick={() => void exportBackup()}>{t('media.storage.exportBackup')}</button>
          </div>
        )}
      >
        <div className="media-hub-storage-grid">
          <label>{t('media.storage.item')}
            <Select value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setPreview(null); }}>
              {items.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
            </Select>
          </label>
          <label>{t('media.storage.organizationRoot')}
            <input className="ui-input" value={root} onChange={(event) => setRoot(event.target.value)} placeholder="C:\\Media" />
          </label>
          <button type="button" className="btn primary" disabled={!selected || !root.trim()} onClick={() => void previewOrganization()}>
            {t('media.storage.previewOrganization')}
          </button>
        </div>
        {preview && (
          <div className="media-hub-preview" role="status">
            <strong>{preview.action === 'conflict' ? t('media.storage.conflictDetected') : t('media.storage.organizationPreview')}</strong>
            <span>{preview.sourcePath} → {preview.targetPath}</span>
            {preview.action === 'conflict' && (
              <Select aria-label={t('media.storage.duplicateChoice')} value={choice} onChange={(event) => setChoice(event.target.value as MediaDuplicateChoice)}>
                <option value="keep-existing">{t('media.storage.keepExisting')}</option>
                <option value="keep-incoming">{t('media.storage.keepIncoming')}</option>
                <option value="keep-both">{t('media.storage.keepBoth')}</option>
                <option value="skip">{t('media.storage.skip')}</option>
              </Select>
            )}
            <button type="button" className="btn" onClick={() => void applyOrganization()} disabled={preview.action === 'noop'}>
              {t('media.storage.applyChoice')}
            </button>
          </div>
        )}
        {scan && (
          <div className="media-hub-scan" role="status">
            {t('media.storage.scanSummary', { files: scan.files.length, bytes: formatNumber(scan.totalBytes) })}
          </div>
        )}
      </MediaCollapsibleSection>
      {selected && (
        <MediaCollapsibleSection id="relationships" className="media-hub-relationships" title={t('media.relationships.title')}>
          <div>
            <Select aria-label={t('media.relationships.target')} value={targetId} onChange={(event) => setTargetId(event.target.value)}>
              <option value="">{t('media.relationships.chooseTarget')}</option>
              {items.filter((item) => item.id !== selected.id).map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </Select>
            <Select
              aria-label={t('media.relationships.type')}
              value={relationshipType}
              onChange={(event) => setRelationshipType(event.target.value as MediaRelationship['type'])}
            >
              <option value="vocabulary">{t('media.relationships.vocabulary')}</option>
              <option value="sentence">{t('media.relationships.sentence')}</option>
              <option value="lyrics">{t('media.relationships.lyrics')}</option>
              <option value="note">{t('media.relationships.note')}</option>
              <option value="flashcard">{t('media.relationships.flashcard')}</option>
            </Select>
            <button type="button" className="btn" disabled={!targetId} onClick={() => void addRelationship()}>
              {t('media.relationships.add')}
            </button>
          </div>
          {relationships.map((relation) => (
            <span key={relation.id}>{relation.type} → {relation.toId}</span>
          ))}
        </MediaCollapsibleSection>
      )}
    </>
  );
}


export { MediaLibraryActions };

/** Word-lookup popup for the subtitle line. */
export function MediaLookupPopup({ state }: { state: MediaState }) {
  if (!state.popup) return null;
  return (
    <DictionaryPopup
      query={state.popup.query}
      x={state.popup.x}
      y={state.popup.y}
      context={state.popup.context ?? state.active?.text}
      onClose={() => state.setPopup(null)}
    />
  );
}

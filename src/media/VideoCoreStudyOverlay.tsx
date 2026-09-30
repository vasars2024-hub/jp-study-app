import React from 'react';
import { useAtomValue } from 'jotai';
import {
  vc_audioManager,
  vc_mediaCaptionsManager,
  vc_subtitleManager,
} from '@/app/(main)/_features/video-core/video-core';
import type {
  MediaCaptionsTrackSelectedEvent,
} from '@/app/(main)/_features/video-core/video-core-media-captions';
import {
  vc_paused,
  vc_videoElement,
} from '@/app/(main)/_features/video-core/video-core-atoms';
import type { VideoCore_VideoPlaybackInfo } from '@/app/(main)/_features/video-core/video-core.atoms';
import type {
  NormalizedTrackInfo,
  SubtitleManagerCueChangeEvent,
  SubtitleManagerEventsAddedEvent,
  SubtitleManagerTracksLoadedEvent,
  VideoCoreActiveCue,
} from '@/app/(main)/_features/video-core/video-core-subtitles';
import type { AudioManagerTrackChangedEvent } from '@/app/(main)/_features/video-core/video-core-audio';
import type {
  MKVParser_SubtitleEvent,
  MKVParser_TrackInfo,
} from '../../vendor/seanime/generated/types';
import type { WhisperModelTier } from '../shared/whisperModels';
import DictionaryPopup from '../renderer/components/DictionaryPopup';
import SubtitleCueLine from '../renderer/components/SubtitleCueLine';
import {
  isLookupClick,
  lookupWordFromMouseUp,
  noteLookupPointerDown,
} from '../renderer/wordLookup';
import { translateTo } from '../renderer/translator';
import { SUBTITLE_FONT_SIZE_EVENT } from '../renderer/subtitleSizeBridge';
import { shiftCues, shiftCuesMs } from '../shared/subtitleSync';
import {
  effectiveKeys,
  formatKeysDisplay,
  registerCommandHandler,
} from '../renderer/keyboardShortcuts';
import { t as translateUi, useT } from '../renderer/i18n';
import { getChineseScript, getStudyLang, setStudyLang } from '../renderer/studyEnvironment';
import { studyLangTag } from '../shared/studyLang';
import {
  loadWhisperDevice,
  loadWhisperModelTier,
  onWhisperDeviceChanged,
  onWhisperModelChanged,
  setWhisperDevice as persistWhisperDevice,
  setWhisperModelTier,
  whisperHfId,
  type WhisperDevice,
} from '../renderer/whisperSettings';
import { effectiveWhisperTier, markTierDownloaded } from '../renderer/whisperModelCache';
import WhisperWorker from '../renderer/whisperWorker?worker';
import {
  activeStudyCuesAtTime,
  adjacentStudyCue,
  bridgedSecondaryCuesAtTime,
  clampStudyPlaybackRate,
  dismissVideoCoreComprehensionSuggestion,
  dismissVideoCoreShadowingSuggestion,
  dismissVideoCoreTimingRepair,
  isCueEndTransition,
  nextVideoCoreWhisperTrackNumber,
  normalizeVideoCoreStudyPreferences,
  studyTrackLanguage,
  nudgeSubtitlePosition,
  pickStudyPrimaryTrack,
  PLAYER_PREFERENCES_STORAGE_KEY,
  resetSubtitleAppearance,
  secondaryLineUnavailable,
  resolveSecondaryLine,
  SECONDARY_SUB_LANG_LABELS,
  SUBTITLE_FONT_STACKS,
  subtitleFontStackFor,
  subtitleOutlineShadow,
  subtitlePlacementStyle,
  recordVideoCoreComprehensionEvent,
  recordVideoCoreCueReplay,
  recordVideoCoreTimingAdjustment,
  resolveStudyLoopSeekSec,
  shouldSuggestVideoCoreComprehensionRescue,
  shouldSuggestVideoCoreShadowing,
  shortLangTag,
  shouldSuggestVideoCoreTimingRepair,
  stableCueList,
  stripAssCueText,
  studyCuesFromParsedCues,
  transcriptSeekSec,
  VIDEO_CORE_TIMING_APPLY_STEP_SEC,
  videoCoreDriftDelaySec,
  videoCoreRescueScene,
  videoCoreTimingDrift,
  whisperCuesToVideoCoreEvents,
  type VideoCoreComprehensionEvent,
  type VideoCoreComprehensionSignal,
  type VideoCoreCueReplaySignal,
  type VideoCoreDictationEvaluation,
  type VideoCoreStudyPreferences,
  type VideoCoreTimingSignal,
  nextVideoFit,
} from '../shared/videoCoreStudy';
import { decideExternalSubtitleMount } from '../shared/externalSubtitleMount';
import { parseStudySubtitles, parseSubtitles } from '../shared/subtitleCues';
import type { VideoCoreMiningSource } from '../shared/videoCoreMining';
import { formatWatchLoopTimestamp } from '../shared/seanimeWatchLoop';
import { pretokenizeInIdle } from '../renderer/tokenizer';
import { evaluateDictation } from '../renderer/evaluateDictation';
import { evaluateJapaneseDictation, markMissedDictation } from '../shared/listeningTraining';
import {
  mediaCaptionCues,
  normalizeMediaCaptionTracks,
} from './mediaCaptionStudyAdapter';
import VideoCoreMiningPanel from './VideoCoreMiningPanel';
import VideoCoreGrammarPanel from './VideoCoreGrammarPanel';
import VideoCoreTranscriptPanel from './VideoCoreTranscriptPanel';
import { useCueAnalysis } from './useCueAnalysis';
import {
  loadStudyTrackChoice,
  loadSubtitleDelayFor,
  saveSeriesSubtitleDelay,
  rememberStudyTrackChoice,
  saveSubtitleDelay,
  studySubtitleSource,
  subtitleDelayKey,
} from './studySubtitleMemory';
import StudyBottomBar, { type PracticeMode } from './StudyBottomBar';
import StudyDocks, { type BlockRenderers } from './StudyDocks';
import {
  AiWorkspaceBlock,
  ListeningBlock,
  MediaInfoBlock,
  MiningQueueBlock,
  mediaDisplayName,
  StudyAppOwnedBlock,
  StudyHudBlock,
  type AiMode,
} from './StudyBlocks';
import StudyWorkspaceCustomizer from './StudyWorkspaceCustomizer';
import { useStudyWorkspace } from './StudyWorkspaceProvider';
import {
  StudyDetachContext,
  useStudyDetach,
  type StudyDetachFrame,
} from './useStudyDetach';
import {
  changedPreferenceKeys,
  onPlayerPreferencesChanged,
  writePlayerPreferencesPatch,
} from '../renderer/playerPreferencesStore';
import { setVolumeNormalization } from './volumeNormalization';
import { registerLivePlayerProbe } from './livePlayerProbe';
import { cuesToSrt, cuesToVtt, downloadSubtitles } from '../renderer/subtitlesExport';
import { useLineLevel } from '../renderer/lineLevel';
import { recordStudyTime } from '../renderer/stats';
import { openSentenceDeckDialog } from '../renderer/components/sentenceDeck/SentenceDeckDialog';

/** A dictation answer scoring under this percentage goes on the session's missed-lines list. */
const DICTATION_MISSED_BELOW = 80;

/** Dictation or shadowing: the player is being used to practise, not to watch. */
function practiceModeActive(prefs: { dictationMode?: boolean; shadowingMode?: boolean }): boolean {
  return prefs.dictationMode === true || prefs.shadowingMode === true;
}

/** This surface's name on `playerPreferencesStore` writes, so it ignores its own echo. */
const VIDEO_CORE_PREFS_SOURCE = 'video-core';

/** Run-up when jumping to a transcript line. See `seekTranscriptCue`. */
const TRANSCRIPT_LEAD_IN_SEC = 1;

/** Fallback reservation for the right dock at this workspace's 16px root. */
const RIGHT_DOCK_PX = 25 * 16;

/**
 * How much of the right edge the docked column is holding, so a dictionary lookup can
 * open beside it rather than under it.
 *
 * Measured rather than declared: the column narrows below 1180px, and a second copy of
 * that number here is exactly how the popup ends up 80px wrong on the window where the
 * room is tightest. The gutter is the dock's own `right`.
 */
function rightDockInsetPx(): number {
  const width = document
    .querySelector('.study-dock[data-dock="right"]:not([hidden])')
    ?.getBoundingClientRect().width ?? 0;
  return width > 0 ? Math.round(width) + 16 : RIGHT_DOCK_PX;
}

/**
 * How long to let the file's own subtitle tracks register before concluding it has none.
 *
 * Not a guess at network or disk latency — the tracks this waits for are already in hand.
 * `mkvMetadata.subtitleTracks` arrives with the playback info and the parser's event tracks
 * register during the same load burst, both before the element reports it can play. This is
 * a margin over that burst, long enough that "the list is empty" means empty rather than
 * early, and short enough to fill a real void before the viewer has read the first line.
 */
const EXTERNAL_SUBTITLE_GRACE_MS = 800;

type WhisperGenerationState =
  | 'idle'
  | 'extracting'
  | 'loading'
  | 'transcribing'
  | 'done'
  | 'error';

type WhisperWorkerMessage = {
  type?: string;
  status?: string;
  progress?: number;
  file?: string;
  device?: 'webgpu' | 'wasm';
  model?: string;
  message?: string;
  cues?: Array<{ start: number; end: number; text: string }>;
};

type CuePopup = {
  query: string;
  x: number;
  y: number;
  /** Top of the clicked word, so a popup opened above it clears the subtitle line. */
  top?: number;
  context: string;
};

interface Props {
  playbackInfo: VideoCore_VideoPlaybackInfo | null;
  /**
   * The local file this playback was opened for, from the REQUEST rather than the reply.
   * `playbackInfo.localFile` is optional upstream, so the external-subtitle mount below
   * prefers this and treats the reply's field as a fallback.
   */
  localFilePath?: string | null;
  onManagerReady?: (managerClass: string) => void;
  onCueChange?: (event: SubtitleManagerCueChangeEvent) => void;
}

/**
 * Type and background for one subtitle line.
 *
 * At 0% the box is genuinely absent rather than a transparent rectangle — no
 * background and no padding — so the text sits on the picture the way a burned-in
 * subtitle does. The text shadow in the stylesheet is what keeps it legible over
 * a bright frame, which is why the background can be dropped entirely.
 *
 * Takes the whole preference object rather than one argument per knob: a positional list
 * long enough to cover them is a list two callers can disagree about silently. The second
 * line shares the typeface, weight, box and outline, and has its own size (a percentage of
 * the primary's) and colour — hence the one `line` parameter.
 *
 * Only settings that depart from the stylesheet are emitted. `default` leaves the family
 * unset so the sheet's own choice still applies, and the outline is dropped rather than
 * overridden so that turning it back on needs no matching `text-shadow` value here.
 */
function cueBoxStyle(
  preferences: VideoCoreStudyPreferences,
  line: 'primary' | 'secondary' = 'primary',
  langTag = 'ja',
): React.CSSProperties {
  const secondary = line === 'secondary';
  const fontSizePx = secondary
    ? Math.round(preferences.subtitleFontSize * (preferences.secondarySubScale / 100))
    : preferences.subtitleFontSize;
  const style: React.CSSProperties = {
    fontSize: `${fontSizePx}px`,
    fontWeight: preferences.subtitleFontWeight,
  };
  // The study line's typeface in its own language's faces; the helper line keeps the Japanese-era default.
  const stack = secondary
    ? SUBTITLE_FONT_STACKS[preferences.subtitleFontFamily]
    : subtitleFontStackFor(preferences.subtitleFontFamily, langTag);
  if (stack) style.fontFamily = stack;
  // Each line has its own colour; '' leaves the stylesheet's (off-white / pale blue).
  const color = secondary ? preferences.secondarySubColor : preferences.subtitleColor;
  if (color) style.color = color;
  if (!preferences.subtitleOutline) style.textShadow = 'none';
  else if (preferences.subtitleOutlineColor) {
    style.textShadow = subtitleOutlineShadow(preferences.subtitleOutlineColor, secondary);
  }
  if (preferences.subtitleBgOpacity > 0) {
    style.backgroundColor = `rgba(0, 0, 0, ${preferences.subtitleBgOpacity / 100})`;
    style.padding = '0.1em 0.4em';
    style.borderRadius = '0.35em';
  }
  return style;
}

function loadPreferences(): VideoCoreStudyPreferences {
  try {
    return normalizeVideoCoreStudyPreferences(
      JSON.parse(localStorage.getItem(PLAYER_PREFERENCES_STORAGE_KEY) ?? 'null'),
    );
  } catch {
    return normalizeVideoCoreStudyPreferences(null);
  }
}

/** The live binding of a command, for the bar's tooltips (`''` when unbound). */
function shortcutKeysFor(commandId: string): string {
  try {
    return formatKeysDisplay(effectiveKeys(commandId));
  } catch {
    return '';
  }
}

function trackLabel(
  track: NormalizedTrackInfo,
  t: ReturnType<typeof useT>['t'],
): string {
  const identity = track.label
    || track.languageIETF
    || track.language
    || t('mediaWorkspace.study.track', { number: track.number });
  const flags = [
    track.default ? t('mediaWorkspace.study.trackDefault') : '',
    track.forced ? t('mediaWorkspace.study.trackForced') : '',
  ]
    .filter(Boolean)
    .join(', ');
  return `${identity}${flags ? ` (${flags})` : ''}`;
}

function miningSourceFromPlayback(
  playbackInfo: VideoCore_VideoPlaybackInfo | null,
): VideoCoreMiningSource | null {
  if (!playbackInfo) return null;
  const mediaTitle = playbackInfo.media?.title?.userPreferred
    || playbackInfo.media?.title?.romaji
    || playbackInfo.media?.title?.english
    || playbackInfo.media?.title?.native;
  return {
    playbackId: playbackInfo.id,
    playbackType: String(playbackInfo.playbackType),
    streamType: playbackInfo.streamType,
    ...(playbackInfo.streamPath ? { streamPath: playbackInfo.streamPath } : {}),
    ...(playbackInfo.localFile?.path
      ? { localFilePath: playbackInfo.localFile.path }
      : {}),
    ...(playbackInfo.media?.id != null ? { mediaId: playbackInfo.media.id } : {}),
    ...(mediaTitle ? { mediaTitle } : {}),
    ...(playbackInfo.episode?.episodeNumber != null
      ? { episodeNumber: playbackInfo.episode.episodeNumber }
      : {}),
    ...(playbackInfo.episode?.displayTitle || playbackInfo.episode?.episodeTitle
      ? { episodeTitle: playbackInfo.episode.displayTitle || playbackInfo.episode.episodeTitle }
      : {}),
  };
}

export default function VideoCoreStudyOverlay({
  playbackInfo,
  localFilePath,
  onManagerReady,
  onCueChange,
}: Props): React.ReactElement {
  const { t, lang: uiLang } = useT();
  const manager = useAtomValue(vc_subtitleManager);
  const mediaCaptionsManager = useAtomValue(vc_mediaCaptionsManager);
  const audioManager = useAtomValue(vc_audioManager);
  const video = useAtomValue(vc_videoElement);
  const playerPaused = useAtomValue(vc_paused);
  const [preferences, setPreferences] = React.useState(loadPreferences);
  const [activeCues, setActiveCues] = React.useState<VideoCoreActiveCue[]>([]);
  const [allCues, setAllCues] = React.useState<VideoCoreActiveCue[]>([]);
  const [tracks, setTracks] = React.useState<NormalizedTrackInfo[]>([]);
  const [selectedTrack, setSelectedTrack] = React.useState<number | null>(null);
  /**
   * What the script split took out of the mounted external track, and from which styles.
   *
   * Kept as state rather than discarded because a hidden line is a *number the user is
   * owed*: the split is right far more often than not, but "the transcript is short and
   * nobody said why" is the failure mode the whole split exists to make visible. Keyed by
   * track number so it can never be shown against a different track than the one it
   * describes — the file's own embedded tracks are unsplit and must stay unannotated.
   */
  const [externalTrackSplit, setExternalTrackSplit] = React.useState<
    { trackNumber: number; dropped: number; styles: string[] } | null
  >(null);
  const [secondaryTrack, setSecondaryTrack] = React.useState<number | null>(null);
  const [secondaryCues, setSecondaryCues] = React.useState<VideoCoreActiveCue[]>([]);
  const [activeSecondaryCues, setActiveSecondaryCues] =
    React.useState<VideoCoreActiveCue[]>([]);
  const [selectedAudioTrack, setSelectedAudioTrack] = React.useState<number | null>(null);
  const [subtitleDelaySec, setSubtitleDelaySec] = React.useState(0);
  const [pauseOnLookup, setPauseOnLookup] = React.useState(false);
  const [translation, setTranslation] = React.useState('');
  const [translationBusy, setTranslationBusy] = React.useState(false);
  const [popup, setPopup] = React.useState<CuePopup | null>(null);
  const [dictationInput, setDictationInput] = React.useState('');
  const [dictationResult, setDictationResult] =
    React.useState<VideoCoreDictationEvaluation | null>(null);
  const [dictationRevealed, setDictationRevealed] = React.useState(false);
  /** Lines answered below `DICTATION_MISSED_BELOW` this session, so the learner can go back and replay them. */
  const [missedLines, setMissedLines] = React.useState<
    Array<{ key: string; cue: VideoCoreActiveCue; score: number }>
  >([]);
  const [abStartSec, setAbStartSec] = React.useState<number | null>(null);
  const [abEndSec, setAbEndSec] = React.useState<number | null>(null);
  const [abLoop, setAbLoop] = React.useState(false);
  /** Bumped by the mine shortcut; the mining panel owns the actual export. */
  const [mineSignal, setMineSignal] = React.useState(0);
  const popupOpenOnDownRef = React.useRef(false);
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const previousCueRef = React.useRef<VideoCoreActiveCue | null>(null);
  const secondaryCuesRef = React.useRef<VideoCoreActiveCue[]>([]);
  /**
   * A file track's parsed timeline, cached against the track it belongs to.
   *
   * Keyed rather than a bare array so a track change can never show one track's cues
   * under another's number — the same rule `externalTrackSplit` follows above.
   */
  const secondaryFileCuesRef = React.useRef<
    { trackNumber: number; cues: VideoCoreActiveCue[] } | null
  >(null);
  const shadowRecorderRef = React.useRef<MediaRecorder | null>(null);
  const shadowStreamRef = React.useRef<MediaStream | null>(null);
  const shadowStopTimerRef = React.useRef<number | null>(null);
  const shadowAudioUrlRef = React.useRef('');
  const shadowGenerationRef = React.useRef(0);
  const whisperWorkerRef = React.useRef<Worker | null>(null);
  const whisperGenerationRef = React.useRef(0);
  const whisperCuesRef = React.useRef<Array<{ start: number; end: number; text: string }>>([]);
  const ignoredPauseRef = React.useRef(false);
  const ignoredSeekTargetRef = React.useRef<number | null>(null);
  const seekOriginRef = React.useRef<number | null>(null);
  const lastPlaybackTimeRef = React.useRef(0);
  const [shadowRecording, setShadowRecording] = React.useState(false);
  const [shadowAudioUrl, setShadowAudioUrl] = React.useState('');
  const [shadowError, setShadowError] = React.useState('');
  const [replaySignal, setReplaySignal] =
    React.useState<VideoCoreCueReplaySignal | null>(null);
  const [comprehensionSignal, setComprehensionSignal] =
    React.useState<VideoCoreComprehensionSignal | null>(null);
  const [timingSignal, setTimingSignal] =
    React.useState<VideoCoreTimingSignal | null>(null);
  const [driftTracking, setDriftTracking] = React.useState(false);
  const subtitleDelayRef = React.useRef(0);
  const [whisperModel, setWhisperModel] = React.useState<WhisperModelTier>(
    () => loadWhisperModelTier(getStudyLang()),
  );
  const [whisperDevice, setWhisperDevice] = React.useState<WhisperDevice>(
    loadWhisperDevice,
  );
  const [whisperLanguage, setWhisperLanguage] =
    React.useState<'ja' | 'zh' | 'ru'>(getStudyLang);
  const [whisperState, setWhisperState] =
    React.useState<WhisperGenerationState>('idle');
  const [whisperMessage, setWhisperMessage] = React.useState('');
  const [whisperProgress, setWhisperProgress] = React.useState(0);
  const [whisperError, setWhisperError] = React.useState('');
  /*
    The workspace. It decides which blocks are on screen; this component decides what
    each block renders. Everything below that used to read a preference boolean to know
    whether to draw itself now asks the workspace instead — that is the whole point of
    the redesign, and the reason the grammar card, the transcript and the mining form
    can no longer all claim the picture at once.
  */
  const workspace = useStudyWorkspace();
  /**
   * Which mode the unified AI surface is showing.
   *
   * Chosen automatically by whatever opened it — a word click means Dictionary, a
   * grammar span means Analysis — and changeable by hand, which is both halves of the
   * requirement. Held here rather than inside the block so the choice survives the
   * block being closed and reopened.
   */
  const [aiMode, setAiMode] = React.useState<AiMode>('analysis');

  const activeCue = activeCues[0] ?? null;
  // Mirrored so the keyboard listener does not have to rebind on every cue change.
  const activeCueRef = React.useRef(activeCue);
  activeCueRef.current = activeCue;
  // Read by the detach bridge's command handler, which runs from an IPC callback rather
  // than in render and so must not close over a stale cue list.
  const allCuesRef = React.useRef(allCues);
  allCuesRef.current = allCues;
  // Same reason: the three toggle commands read the current value without the command
  // registrations having to rebind every time one of the preferences changes.
  const preferencesRef = React.useRef(preferences);
  preferencesRef.current = preferences;
  /*
    Publish the bar's height so the rest of the surface can stay off it.

    This measurement is the reason the old dock could not silently cover the
    subtitle: everything above it (the cue line, the docks) is positioned against
    `--study-dock-height` rather than a constant. It survives the redesign
    unchanged in purpose.

    What is measured is the bar LAYER — the bar plus whatever tool sheet is open —
    not the bar alone. Both facts matter and they are different: `.study-bar` is a
    constant 45px whether a sheet is open or not (measured in the harness, cases
    V13–V17), so the transport never moves under the pointer; and the layer grows
    to 163px with the More sheet open, which is exactly the height the subtitle has
    to clear. Measuring only the bar would put a 118px sheet over the cue line,
    which is the 644×69px defect this replaced, rebuilt out of new parts.

    Written on the slice rather than on `:root` so two workspaces (main window
    and pop-out) never overwrite each other's value, and removed on unmount so a
    stale height cannot outlive the bar that produced it.
  */
  React.useEffect(() => {
    const dock = dockRef.current;
    if (!dock) return;
    const slice = dock.closest('.study-player-slice') ?? dock.parentElement;
    if (!(slice instanceof HTMLElement)) return;
    // Published as `--study-bar-height`; the stylesheet adds the player's own transport
    // beneath it to make `--study-dock-height` (mediaWorkspace.css). `offsetHeight`, not the
    // bounding box: the box is in painted pixels, which under the app's zoom (0.8 by default)
    // are 20% smaller than the CSS pixels the value is read back in.
    const publish = (): void => {
      const height = dock.offsetHeight;
      if (height > 0) slice.style.setProperty('--study-bar-height', `${height}px`);
    };
    publish();
    // jsdom has no ResizeObserver. Falling back to the one-shot measurement is
    // right rather than fatal: the stylesheet's own default is the collapsed
    // height, so the worst case is the layout this change replaced.
    if (typeof ResizeObserver !== 'function') return () => {
      slice.style.removeProperty('--study-bar-height');
    };
    const observer = new ResizeObserver(publish);
    observer.observe(dock);
    return () => {
      observer.disconnect();
      slice.style.removeProperty('--study-bar-height');
    };
  }, []);

  const plainText = activeCue ? stripAssCueText(activeCue.text) : '';
  const dictationRequestRef = React.useRef(0);
  React.useEffect(() => () => { dictationRequestRef.current += 1; },
    [plainText, dictationInput, activeCue?.index, activeCue?.trackNumber]);
  // Tokenize the whole track in idle time, so a line is ready when it appears instead of
  // costing 4-53 ms on the main thread at that moment (profiled 2026-09-23). The cue line
  // tokenizes exactly this text when no grammar annotation splits it.
  React.useEffect(
    () => pretokenizeInIdle(allCues.map((cue) => stripAssCueText(cue.text))),
    [allCues],
  );
  const trackSecondaryText = activeSecondaryCues
    .map((cue) => stripAssCueText(cue.text))
    .filter(Boolean)
    .join(' ');

  /**
   * The second line when no track can supply it.
   *
   * Dual subtitles used to mean "show another track", which on the common case — one
   * release, one `.ja.srt` beside it — meant the feature did nothing at all. Translating
   * the active cue is what makes the language control answer for itself: pick Russian and
   * a Russian line appears whether or not the release ever shipped one.
   *
   * Cached by target language and cue text rather than by cue index, so a line that
   * repeats is translated once and the cache survives seeking. A failure clears the line
   * instead of showing an error under the subtitle: the primary is still readable, and a
   * translator that is still loading its model is the ordinary reason for this.
   */
  const [secondaryTranslation, setSecondaryTranslation] = React.useState('');
  /**
   * The last translation attempt failed (no local model, no key). Not a reason to stop
   * trying — a translator still loading its model fails the same way — but it is what lets
   * the overlay say once that no second line is coming, instead of a silent blank.
   */
  const [secondaryTranslateFailed, setSecondaryTranslateFailed] = React.useState(false);
  const secondaryTranslationCacheRef = React.useRef(new Map<string, string>());
  const secondaryTrackEntry = tracks.find((entry) => entry.number === secondaryTrack);
  const secondaryTrackLang = secondaryTrackEntry ? studyTrackLanguage(secondaryTrackEntry) : '';
  // Asked before `secondaryTranslation` exists, so only the parts that decide it are known.
  const secondaryLine = resolveSecondaryLine({
    hasSecondaryTrack: secondaryTrack != null,
    trackLang: secondaryTrackLang,
    trackText: trackSecondaryText,
    translation: '',
    translatorFailed: secondaryTranslateFailed,
    secondaryLang: preferences.secondarySubLang,
  });
  const secondaryNeedsTranslation = secondaryLine.translate;
  React.useEffect(() => {
    const target = preferences.secondarySubLang;
    const source = getStudyLang();
    if (!preferences.dualSubs || !secondaryNeedsTranslation || !plainText || target === source) {
      setSecondaryTranslation('');
      return;
    }
    // The language code leads so the separator is unambiguous: `target` is always a
    // two-letter code, whatever the cue text happens to contain.
    const key = `${target}|${plainText}`;
    const cached = secondaryTranslationCacheRef.current.get(key);
    if (cached !== undefined) {
      setSecondaryTranslation(cached);
      return;
    }
    let cancelled = false;
    setSecondaryTranslation('');
    void (async () => {
      try {
        const text = await translateTo(plainText, source, target);
        if (cancelled) return;
        secondaryTranslationCacheRef.current.set(key, text);
        setSecondaryTranslation(text);
        setSecondaryTranslateFailed(false);
      } catch {
        if (cancelled) return;
        setSecondaryTranslation('');
        setSecondaryTranslateFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    plainText,
    preferences.dualSubs,
    preferences.secondarySubLang,
    secondaryNeedsTranslation,
  ]);

  const { text: secondaryText, fallback: secondaryIsFallback } = resolveSecondaryLine({
    hasSecondaryTrack: secondaryTrack != null,
    trackLang: secondaryTrackLang,
    trackText: trackSecondaryText,
    translation: secondaryTranslation,
    translatorFailed: secondaryTranslateFailed,
    secondaryLang: preferences.secondarySubLang,
  });
  const miningSource = miningSourceFromPlayback(playbackInfo);
  /** Which file this is, for everything remembered per file (delay, track choice). */
  const subtitleSource = React.useMemo(
    () => studySubtitleSource(playbackInfo, localFilePath),
    [localFilePath, playbackInfo],
  );
  const delayKey = subtitleDelayKey(subtitleSource);
  const delayKeyRef = React.useRef(delayKey);
  delayKeyRef.current = delayKey;
  // Whose transcript this is. A Whisper track and a downloaded track both arrive
  // here as tracks, so naming the track is the only thing that tells them apart.
  const selectedTrackEntry = tracks.find((entry) => entry.number === selectedTrack);
  const selectedTrackLabel = selectedTrackEntry
    ? trackLabel(selectedTrackEntry, t)
    : t('mediaWorkspace.study.transcriptNoTrack');
  // Only for the track the split actually ran on. An embedded track selected afterwards
  // has had nothing hidden from it, and carrying the notice across would be a lie.
  const transcriptTrackNotice = externalTrackSplit
    && externalTrackSplit.trackNumber === selectedTrack
    ? t('media.subStatus.otherScript', {
      count: externalTrackSplit.dropped,
      styles: externalTrackSplit.styles.slice(0, 4).join(', '),
    })
    : '';

  /*
    Grammar highlight. `auto` is the pause state, not the toggle: the toggle says
    the viewer wants highlighting, the pause says they stopped on THIS line. See
    useCueAnalysis for why analyzing every cue as it goes past is not an option.
  */
  const studyLang = getStudyLang();

  /**
   * A subtitle file chosen from inside the player becomes the study track at
   * once — the same mount the automatic sidecar uses, without leaving the video
   * to find the library's subtitle picker.
   */
  const importSubtitleFile = React.useCallback(async (file: File) => {
    if (!manager) return;
    const split = parseStudySubtitles(await file.text());
    if (!split.cues.length) {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('mediaWorkspace.study.importSubtitleEmpty'), kind: 'error' } }));
      return;
    }
    const trackNumber = nextVideoCoreWhisperTrackNumber(manager.getTracks().map((track) => track.number));
    const events = whisperCuesToVideoCoreEvents(split.cues, trackNumber) as MKVParser_SubtitleEvent[];
    const track: MKVParser_TrackInfo = {
      number: trackNumber,
      uid: trackNumber,
      type: 'subtitle',
      codecID: 'S_TEXT/ASS',
      // The file's own name: provenance the learner can read in the track picker.
      name: file.name,
      language: studyLang,
      languageIETF: studyLang,
      default: false,
      forced: false,
      enabled: true,
    };
    try {
      await manager.addEventTrack(track);
      await manager.onSubtitleEvents(events);
      await manager.selectTrack(trackNumber);
      setTracks(manager.getTracks());
      setSelectedTrack(manager.getSelectedTrackNumberOrNull());
      setAllCues(stableCueList(manager.getCues()));
      setActiveCues(manager.getActiveCues());
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('mediaWorkspace.study.importSubtitleDone', { name: file.name, count: split.cues.length }), kind: 'ok' } }));
    } catch {
      window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('mediaWorkspace.study.importSubtitleEmpty'), kind: 'error' } }));
    }
  }, [manager, studyLang, t]);

  /*
   * Studied time, apart from watched time: seconds spent paused on a line with
   * the dictionary or grammar open, or in dictation / shadowing. Watching keeps
   * its own counter; this one goes to the day's study seconds in Statistics.
   */
  const studyingNow = practiceModeActive(preferences) || (playerPaused && (!!popup || preferences.grammarHighlight));
  const studiedPending = React.useRef(0);
  React.useEffect(() => {
    if (!studyingNow) return undefined;
    const id = window.setInterval(() => {
      studiedPending.current += 5;
      if (studiedPending.current >= 30) {
        recordStudyTime(studiedPending.current);
        studiedPending.current = 0;
      }
    }, 5_000);
    return () => {
      window.clearInterval(id);
      if (studiedPending.current > 0) recordStudyTime(studiedPending.current);
      studiedPending.current = 0;
    };
  }, [studyingNow]);
  // The line's level (hardest word, by the learner's lists or the dictionary).
  const cueLevel = useLineLevel(plainText, studyLang, preferences.lineLevel);
  const cueAnalysis = useCueAnalysis({
    text: plainText,
    lang: studyLang,
    uiLang,
    auto: preferences.grammarHighlight && playerPaused,
    offline: preferences.grammarHighlight,
    errorLabel: t('mediaWorkspace.study.grammarError'),
  });
  const annotated = preferences.grammarHighlight && cueAnalysis.state.kind === 'ready'
    ? cueAnalysis.state.result
    : null;
  const [selectedAnnotation, setSelectedAnnotation] = React.useState(0);
  // The panel resets its own selection when the sentence changes, but the
  // highlighted cue is drawn even when the panel is not, so the reset cannot
  // live there alone.
  React.useEffect(() => setSelectedAnnotation(0), [plainText]);
  const showShadowingSuggestion = shouldSuggestVideoCoreShadowing(
    replaySignal,
    activeCue,
    preferences.shadowingMode,
  );
  const rescueScene = activeCue
    ? videoCoreRescueScene(allCues, activeCue, subtitleDelaySec)
    : null;
  const showComprehensionRescue = !showShadowingSuggestion
    && Boolean(rescueScene)
    && shouldSuggestVideoCoreComprehensionRescue(
      comprehensionSignal,
      activeCue,
      playerPaused,
    );
  const timingDrift = React.useMemo(
    () => videoCoreTimingDrift(timingSignal),
    [timingSignal],
  );
  const showTimingRepair = !showShadowingSuggestion
    && !showComprehensionRescue
    && shouldSuggestVideoCoreTimingRepair(timingSignal, timingDrift, driftTracking);

  const recordComprehension = React.useCallback(
    (event: VideoCoreComprehensionEvent, cue = activeCue): void => {
      if (!cue) return;
      setComprehensionSignal((current) =>
        recordVideoCoreComprehensionEvent(current, event, cue));
    },
    [activeCue],
  );

  const markProgrammaticSeek = React.useCallback((targetSec: number): void => {
    ignoredSeekTargetRef.current = targetSec;
  }, []);

  const updatePreference = React.useCallback(
    <K extends keyof VideoCoreStudyPreferences>(
      key: K,
      value: VideoCoreStudyPreferences[K],
    ) => {
      setPreferences((current) =>
        normalizeVideoCoreStudyPreferences({ ...current, [key]: value }));
    },
    [],
  );

  /*
   * Persist only what changed, over whatever is stored (round-2 audit B). This
   * wrote the overlay's whole copy on every change, so a Media Center change
   * made while the player was open — speed, toggles, the normalization switch —
   * was overwritten by the next subtitle nudge. And a change the Media Center
   * (or another window) makes is taken here, not ignored until the next mount.
   */
  const lastPersistedPrefsRef = React.useRef(preferences);
  React.useEffect(() => {
    const before = lastPersistedPrefsRef.current;
    lastPersistedPrefsRef.current = preferences;
    const changed = changedPreferenceKeys(before, preferences);
    if (!changed.length) return;
    const patch: Record<string, unknown> = {};
    for (const key of changed) patch[key as string] = preferences[key];
    writePlayerPreferencesPatch(patch, VIDEO_CORE_PREFS_SOURCE);
  }, [preferences]);
  React.useEffect(() => onPlayerPreferencesChanged(VIDEO_CORE_PREFS_SOURCE, (stored) => {
    const next = normalizeVideoCoreStudyPreferences(stored);
    lastPersistedPrefsRef.current = next;
    setPreferences(next);
  }), []);

  // Volume normalization, on the element this player actually plays through.
  // When it cannot be applied the preference goes back off, so the Media
  // Center's toggle shows what is true (and says why — MediaContent).
  React.useEffect(() => {
    if (!video) return undefined;
    let live = true;
    const wanted = preferences.volumeNormalization === true;
    void setVolumeNormalization(video, wanted).then((state) => {
      if (live && wanted && (state === 'blocked' || state === 'unavailable')) {
        updatePreference('volumeNormalization', false);
      }
    });
    return () => {
      live = false;
    };
  }, [video, preferences.volumeNormalization, updatePreference]);

  // Settings' Theme Studio ("bigger subtitles") can change the size while the player
  // is open. Only that one field is taken, so nothing else the player holds is lost.
  React.useEffect(() => {
    const onExternalSize = (event: Event) => {
      const size = (event as CustomEvent<{ subtitleFontSize?: number }>).detail?.subtitleFontSize;
      if (typeof size === 'number') updatePreference('subtitleFontSize', size);
    };
    window.addEventListener(SUBTITLE_FONT_SIZE_EVENT, onExternalSize);
    return () => window.removeEventListener(SUBTITLE_FONT_SIZE_EVENT, onExternalSize);
  }, [updatePreference]);

  React.useEffect(() => onWhisperDeviceChanged(setWhisperDevice), []);
  React.useEffect(() => onWhisperModelChanged(setWhisperModel), []);

  React.useEffect(() => {
    if (!video) return;
    const rate = clampStudyPlaybackRate(preferences.playbackRate);
    video.preservesPitch = true;
    if (video.playbackRate !== rate) video.playbackRate = rate;
  }, [preferences.playbackRate, video]);

  React.useEffect(() => {
    if (!manager) {
      if (mediaCaptionsManager) return;
      setActiveCues([]);
      setAllCues([]);
      setTracks([]);
      setSelectedTrack(null);
      return;
    }

    onManagerReady?.(manager.constructor.name);
    /*
      Every whole-track read goes through `stableCueList`, and it is not a micro-optimisation.
      `getCues()` builds a new array of new objects on each call, and `handleCueChange` below
      calls it once per spoken line, so `allCues` used to change identity several times a
      minute while describing exactly the same timeline. The transcript panel keys its chunked
      tokenizer off that identity: every cue boundary threw away the furigana it had built and
      restarted the whole pass, and — because the cue objects were new too — `TranscriptRow`'s
      memo failed on every row, re-rendering the entire list instead of the two rows whose
      active state actually moved. That is DEFECT S5 in the Liquid plan: the renderer stopped
      servicing its own timers for whole seconds at a time while a clip played, and it is why
      it reproduced only with the transcript block open.
    */
    const sync = (): void => {
      setActiveCues(manager.getActiveCues());
      setAllCues(stableCueList(manager.getCues()));
      setTracks(manager.getTracks());
      setSelectedTrack(manager.getSelectedTrackNumberOrNull());
    };
    const handleCueChange = (event: SubtitleManagerCueChangeEvent): void => {
      const previous = previousCueRef.current;
      const next = event.detail.cues[0] ?? null;
      if (
        !next
        && previous
        && preferences.autoPause
        && video
        && isCueEndTransition(video.currentTime, previous, subtitleDelaySec)
      ) {
        if (!video.paused) ignoredPauseRef.current = true;
        video.pause();
      }
      previousCueRef.current = next ?? previous;
      setActiveCues(event.detail.cues);
      setAllCues(stableCueList(manager.getCues()));
      onCueChange?.(event);
    };
    const handleTracksLoaded = (event: SubtitleManagerTracksLoadedEvent): void => {
      setTracks(event.detail.tracks);
      setSelectedTrack(manager.getSelectedTrackNumberOrNull());
    };
    /*
      The manager's own answer, not the event's. Two selections in flight (the default pick
      and the user's) used to announce out of order, and trusting `event.detail` let the
      overlay settle on the track the user had just left (subtitle audit 6h). The manager
      now finishes only the newest selection, and asking it rather than the event keeps this
      side right even if an announcement is ever late again. The active cues are re-read
      too: the manager re-derives them on selection, so the line switches with the track.
    */
    const handleTrackSelected = (): void => {
      setSelectedTrack(manager.getSelectedTrackNumberOrNull());
      setAllCues(stableCueList(manager.getCues()));
      setActiveCues(manager.getActiveCues());
    };
    const handleTrackDeselected = (): void => {
      setSelectedTrack(null);
      setAllCues([]);
      setActiveCues([]);
    };
    /*
      Cues stream in while the file is read, so the whole-track list (the transcript, the
      prev/next targets) grows after selection. It used to be re-read only on a `cuechange`,
      so a batch that arrived between two lines left the transcript short until the next one.
    */
    const handleEventsAdded = (event: SubtitleManagerEventsAddedEvent): void => {
      const current = manager.getSelectedTrackNumberOrNull();
      if (current == null || !event.detail.trackNumbers.includes(current)) return;
      setAllCues(stableCueList(manager.getCues()));
    };

    sync();
    manager.addEventListener('cuechange', handleCueChange);
    manager.addEventListener('tracksloaded', handleTracksLoaded);
    manager.addEventListener('trackselected', handleTrackSelected);
    manager.addEventListener('trackdeselected', handleTrackDeselected);
    manager.addEventListener('eventsadded', handleEventsAdded);
    return () => {
      manager.removeEventListener('cuechange', handleCueChange);
      manager.removeEventListener('tracksloaded', handleTracksLoaded);
      manager.removeEventListener('trackselected', handleTrackSelected);
      manager.removeEventListener('trackdeselected', handleTrackDeselected);
      manager.removeEventListener('eventsadded', handleEventsAdded);
    };
  }, [
    manager,
    mediaCaptionsManager,
    onCueChange,
    onManagerReady,
    preferences.autoPause,
    subtitleDelaySec,
    video,
  ]);

  /**
   * The measured sync offset for one video file, resolved at most once per path.
   *
   * ## Why both subtitle paths share this
   *
   * VideoCore mounts subtitles two different ways and the study surface sees exactly one
   * of them per session — `SubtitleManager` for embedded/event tracks, `MediaCaptionsManager`
   * for provider files, and the two effects below are gated so that only one runs. The
   * correction was originally written inside the `SubtitleManager` branch only, which meant
   * it never executed for a file whose subtitles VideoCore had already found beside it: the
   * common case, and the one that was visibly nine seconds late. One resolver, called from
   * both, is what keeps that from silently regressing again.
   *
   * ## Why the cache holds promises rather than numbers
   *
   * Track selection can fire twice in a load burst (`tracksloaded` then `trackselected`).
   * Caching the resolved number still lets both callers past the check while the first is
   * in flight, and each spawns its own ffmpeg pass over the same file. Caching the promise
   * means the second caller awaits the first one's work.
   *
   * A failure resolves to 0 rather than rejecting: an unshifted track is worth having, and
   * the alternative is losing the subtitles over a timing correction that is a refinement.
   */
  const syncOffsetCacheRef = React.useRef(new Map<string, Promise<number>>());
  const resolveSubtitleSyncOffset = React.useCallback(
    (
      videoPath: string | null | undefined,
      intervals: readonly { start: number; end: number }[],
      durationSec: number | undefined,
    ): Promise<number> => {
      if (!videoPath || !intervals.length) return Promise.resolve(0);
      const cached = syncOffsetCacheRef.current.get(videoPath);
      if (cached) return cached;
      const pending = (async (): Promise<number> => {
        try {
          const estimate = await window.api.subtitleSyncOffset(
            videoPath,
            intervals.map((cue) => ({ start: cue.start, end: cue.end })),
            Number.isFinite(durationSec) ? durationSec : undefined,
          );
          // Logged rather than silent: a track that has been moved several seconds is a
          // surprising thing to do to someone's subtitles, and when it is ever wrong this
          // line is the only place that says it happened.
          console.info(
            '[study-subtitles] sync estimate',
            JSON.stringify({
              offsetSec: estimate?.confident ? estimate.offsetSec : 0,
              confident: estimate?.confident,
              score: estimate?.score,
            }),
          );
          return estimate?.confident ? estimate.offsetSec : 0;
        } catch {
          return 0;
        }
      })();
      syncOffsetCacheRef.current.set(videoPath, pending);
      return pending;
    },
    [],
  );

  /**
   * Mount the app's own downloaded subtitle when the container carries none.
   *
   * ## The gap this closes
   *
   * Subtitle discovery downloads a track (Jimaku, OpenSubtitles) and stores it under
   * `subtitles/<mediaId>/`. `media:open` handed that to the *retired* player; the adopted
   * workspace opens files through the sidecar instead, and the sidecar only knows what it
   * can parse out of the container. So for a file with no embedded subtitles the whole
   * discovery pipeline was write-only from here: downloaded, listed in the drawer, never
   * shown while watching, and no transcript to mine from.
   *
   * Measured 2026-08-06 on `The Big O - 13`: `ffprobe` reports two streams, `hevc` and
   * `flac`, and nothing else; the manager logged `Selecting default track` over an empty
   * list and called `setNoTrack()`. A 261-cue Jimaku track for that episode was on disk
   * the whole time.
   *
   * ## Only into a void, and never over the file's own tracks
   *
   * It fills an empty track list and does nothing otherwise, so a file that ships its own
   * subtitles is untouched and upstream's default-track choice always wins. The delay is
   * what makes that check meaningful rather than a race: `mkvMetadata.subtitleTracks` and
   * the parser's event tracks both register during the load burst, before the element can
   * play, so a list still empty afterwards is genuinely empty rather than merely early.
   *
   * Mounted with the same three calls the Whisper path uses — `addEventTrack`,
   * `onSubtitleEvents`, `selectTrack` — because a downloaded track and a generated one are
   * the same kind of thing here, which is what `VideoCoreTranscriptPanel`'s header already
   * says about the transcript they feed.
   *
   * ## Observed live
   *
   * Verified end to end 2026-08-06 against `The Big O - 01`, whose `.ja.srt` sits beside
   * the video and whose container carries no subtitle stream at all (the sidecar logs
   * `mkvparser > No subtitle tracks found for streaming`). The track mounted, cues painted
   * on screen (`.study-cue-text` held the line beginning `それがおかしい`), the
   * transcript filled with **267 rows against the file's 267 cues**, clicking row 120
   * seeked the element from 190 s to 585 s — its stated 9:44 — and the mining panel carried
   * that line into a real Anki note.
   *
   * An earlier draft of this comment recorded that the effect "never fires", from five runs
   * where `window.api.subtitleForPath` was instrumented and showed zero calls. That probe
   * was broken, not the effect: `window.api` is a frozen `contextBridge` object, so the
   * patch silently no-op'd and the absence of calls proved nothing.
   *
   * ## Timing correction
   *
   * A track timed against a different release is worse than no track — every transcript row
   * seeks to the wrong place and every mined card is captioned with the wrong sentence.
   * This one is **9.05 s late**, measured. So the cues are shifted onto the audio before
   * they are mounted, and the shift is applied to the cue times rather than to VideoCore's
   * `subtitleDelay` because the transcript is a seek surface and has to agree with the
   * video. `shared/subtitleSync.ts` carries the method and the gates that make it decline
   * rather than guess.
   */
  const externalSubtitleRef = React.useRef<
    { path: string; name: string; trackNumber: number } | null
  >(null);
  const [mediaRevision, setMediaRevision] = React.useState(0);
  /**
   * True from the moment this effect arms until the mount has resolved either way.
   *
   * Not cosmetic. Measured live 2026-09-07 on `The Big O - 13` (a real Jimaku sidecar,
   * 261 cues): clicking the episode to the cue controls becoming usable took **38.8 s**,
   * of which the element itself needed 32.7 s to reach `readyState >= 3`. Everything in
   * this window has `allCues.length === 0`, and `cueControlTitleKey` had only two answers
   * for that — "between lines" and "No subtitle track is loaded." — so for 39 seconds the
   * bar asserted the file had no subtitles while its track was on disk and arriving.
   * A third state is the whole fix: the wait is honest, the assertion was not.
   */
  const [externalSubtitlePending, setExternalSubtitlePending] = React.useState(false);
  /** The automation's English helper track, once mounted (see the helper-line effect). */
  const helperTrackRef = React.useRef<{ key: string; trackNumber: number } | null>(null);
  React.useEffect(
    () => window.api.onMediaChanged(() => setMediaRevision((revision) => revision + 1)),
    [],
  );
  React.useEffect(() => {
    // The request's path first — it always exists. The reply's `localFile` is optional
    // upstream, and the fallback keeps a caller that passes no prop working as before.
    const localPath = localFilePath || playbackInfo?.localFile?.path;
    if (!manager || !localPath) return undefined;
    let cancelled = false;
    setExternalSubtitlePending(true);
    const timer = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;
        const mounted = externalSubtitleRef.current?.path === localPath
          ? externalSubtitleRef.current
          : null;
        // A container track outranks a downloaded sidecar. Our own previously mounted track is
        // excluded so a changed library selection can replace it instead of becoming write-only.
        // Our own English helper track (below) is not a container track either.
        const helperNumber = helperTrackRef.current?.trackNumber;
        if (manager.getTracks().some((track) => (
          track.number !== mounted?.trackNumber && track.number !== helperNumber
        ))) return;
        let pick: { name: string; text: string } | null = null;
        try {
          // `intent: 'play'` tells the subtitle automation this episode is being watched,
          // which is what starts its per-episode work (the English line, translations).
          pick = await window.api.subtitleForPath(localPath, { intent: 'play' });
        } catch {
          return;
        }
        if (cancelled) return;
        const decision = decideExternalSubtitleMount({
          trackNumbers: manager.getTracks().map((track) => track.number),
          mountedTrackNumber: mounted?.trackNumber ?? null,
          mountedName: mounted?.name ?? null,
          resolvedName: pick?.name ?? null,
        });
        if (decision !== 'mount' || !pick?.text) return;

        // `parseStudySubtitles`, not `parseSubtitles`: this is the PRIMARY study track —
        // the one the transcript, the analyser and every mined card read — so it takes the
        // per-style script split, exactly as `MediaContent.applySubtitleFile` does. A
        // dual-language `.ass` is one file holding two whole tracks, and nothing above the
        // parser can see that; without the split a `简繁外挂字幕` release paints its Chinese
        // half on screen and feeds it to mining. Inert on `.srt`, `.vtt` and any
        // single-track `.ass`, which is every case this path handled before.
        const split = parseStudySubtitles(pick.text);
        const parsed = split.cues;
        if (!parsed.length) return;

        // The element's own duration is the best runtime available, and by the time the
        // grace window has elapsed it is loaded. A failure here costs the correction, not
        // the track: `offsetSec` is 0 unless the estimate cleared both confidence gates.
        const offsetSec = await resolveSubtitleSyncOffset(
          localPath,
          parsed,
          video?.duration,
        );
        if (cancelled) return;

        const cues = shiftCues(parsed, offsetSec);
        const trackNumber = nextVideoCoreWhisperTrackNumber(
          manager.getTracks().map((track) => track.number),
        );
        const events = whisperCuesToVideoCoreEvents(
          cues,
          trackNumber,
        ) as MKVParser_SubtitleEvent[];
        if (!events.length) return;

        const track: MKVParser_TrackInfo = {
          number: trackNumber,
          uid: trackNumber,
          type: 'subtitle',
          codecID: 'S_TEXT/ASS',
          // The record's own label — provenance the user can read in the track picker,
          // and study content rather than chrome, so it is deliberately not translated.
          name: pick.name,
          language: getStudyLang(),
          languageIETF: getStudyLang(),
          default: false,
          forced: false,
          enabled: true,
        };
        try {
          await manager.addEventTrack(track);
          await manager.onSubtitleEvents(events);
          // A newly selected sidecar may replace only our earlier sidecar. A container-selected
          // track still wins if it arrived while parsing or mounting was in flight.
          const selected = manager.getSelectedTrackNumberOrNull();
          if (selected === null || selected === mounted?.trackNumber) {
            await manager.selectTrack(trackNumber);
          }
          if (cancelled) return;
          externalSubtitleRef.current = { path: localPath, name: pick.name, trackNumber };
          setExternalTrackSplit(
            split.dropped ? { trackNumber, dropped: split.dropped, styles: split.styles } : null,
          );
          setTracks(manager.getTracks());
          setSelectedTrack(manager.getSelectedTrackNumberOrNull());
          setAllCues(stableCueList(manager.getCues()));
          setActiveCues(manager.getActiveCues());
        } catch {
          // A mount failure is not worth breaking playback over — the video plays, and
          // the track picker simply has one fewer entry than it might have had.
        }
      })().finally(() => setExternalSubtitlePending(false));
    }, EXTERNAL_SUBTITLE_GRACE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      // The timer may never have fired, so the flag has to be cleared here too — a torn
      // down effect that leaves it true would keep the bar saying "loading" forever.
      setExternalSubtitlePending(false);
    };
  }, [manager, localFilePath, mediaRevision, playbackInfo?.localFile?.path]);

  /*
   * The helper line: the automation's English track for this file (a downloaded English
   * subtitle, or a machine translation of the Japanese one), mounted BESIDE the study track
   * and never selected — the secondary-track picker below offers it by language, so dual
   * subtitles show English without a click. Re-asked whenever the automation reports a
   * status change, because a translation can finish while the episode is already playing.
   */
  /*
   * Picture fit (Fit / Fill / Stretch). VideoCore paints the <video> and its PGS and Anime4K
   * canvases with an inline `object-fit: contain`, so the mode is published as an attribute on
   * the workspace root and mediaWorkspace.css overrides all three together — the bitmap
   * subtitles stay registered to the picture whichever way it is scaled.
   */
  React.useEffect(() => {
    const host = video?.closest('#media-workspace');
    if (!(host instanceof HTMLElement)) return undefined;
    host.dataset.videoFit = preferences.videoFit;
    return () => {
      delete host.dataset.videoFit;
    };
  }, [video, preferences.videoFit]);

  const [helperRevision, setHelperRevision] = React.useState(0);
  React.useEffect(() => {
    if (typeof window.api?.onSubtitleAutoStatus !== 'function') return undefined;
    return window.api.onSubtitleAutoStatus(() => setHelperRevision((revision) => revision + 1));
  }, []);
  React.useEffect(() => {
    const localPath = localFilePath || playbackInfo?.localFile?.path;
    if (!manager || !localPath || typeof window.api?.secondarySubtitleForPath !== 'function') {
      return undefined;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        let helper: { text: string; name: string; lang?: string; recordId?: string } | null =
          await window.api.secondarySubtitleForPath(localPath).catch(() => null);
        // A file opened from disk has no library record for the automation to answer for;
        // its own English sidecar (`.en.srt`, `.eng.ass`…) is still the second line.
        if (!helper?.text && typeof window.api.subtitleForPath === 'function') {
          const sidecar = await window.api.subtitleForPath(localPath, { lang: 'en' }).catch(() => null);
          if (sidecar?.text) helper = { text: sidecar.text, name: sidecar.name, lang: 'en' };
        }
        if (cancelled || !helper?.text) return;
        const key = `${localPath}|${helper.recordId ?? helper.name}`;
        if (helperTrackRef.current?.key === key) return;
        // A release that already carries a track in the helper's language (a muxed English
        // stream) needs no copy of it: the second-line picker would list English twice.
        const helperLang = shortLangTag(helper.lang || 'en');
        if (manager.getTracks().some((track) => (
          track.number !== helperTrackRef.current?.trackNumber
          && studyTrackLanguage(track) === helperLang
        ))) return;
        const parsed = parseSubtitles(helper.text);
        if (!parsed.length) return;
        const offsetSec = await resolveSubtitleSyncOffset(localPath, parsed, video?.duration);
        if (cancelled) return;
        const trackNumber = nextVideoCoreWhisperTrackNumber(
          manager.getTracks().map((track) => track.number),
        );
        const events = whisperCuesToVideoCoreEvents(
          shiftCues(parsed, offsetSec),
          trackNumber,
        ) as MKVParser_SubtitleEvent[];
        if (!events.length) return;
        try {
          await manager.addEventTrack({
            number: trackNumber,
            uid: trackNumber,
            type: 'subtitle',
            codecID: 'S_TEXT/ASS',
            name: helper.name,
            language: helper.lang || 'en',
            languageIETF: helper.lang || 'en',
            default: false,
            forced: false,
            enabled: true,
            // `select: false`: upstream's addEventTrack SELECTS what it mounts, which made this
            // English helper the study line and pushed the Japanese track into the second slot.
          } as MKVParser_TrackInfo, { select: false });
          await manager.onSubtitleEvents(events);
          if (cancelled) return;
          helperTrackRef.current = { key, trackNumber };
          setTracks(manager.getTracks());
        } catch {
          // The study line plays on without its helper; nothing to break playback over.
        }
      })();
    }, EXTERNAL_SUBTITLE_GRACE_MS + 400);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [manager, localFilePath, mediaRevision, helperRevision, playbackInfo?.localFile?.path, video]);

  /**
   * The cue clock for a libass **file track**, which the manager renders but never indexes.
   *
   * `VideoCoreSubtitleManager` builds its cue index only out of the *event* cache, so a
   * track that arrived as ASS text — every `playbackInfo.subtitleTracks` entry with
   * `useLibassRenderer`, numbered from 1000 up — has `getCues()` and `getActiveCues()`
   * return `[]` for as long as it is selected, and never dispatches a single `cuechange`.
   * The lines are on screen, painted by libass, while this overlay sits on
   * `Waiting for subtitle` and the transcript, the analyser and mining all read the file as
   * having no subtitles at all. That is DEFECT S2, and the missing half is a parse: the
   * manager already caches the converted ASS and exposes it through `getTrackContent`.
   *
   * Shaped exactly like the `mediaCaptionsManager` branch below — parse once, then
   * `timeupdate` as the activation clock — because that branch solves the same problem for
   * the other manager and a second shape is how the two start disagreeing.
   *
   * Deliberately inert whenever the manager has an index of its own: one `getCues()` check
   * at setup, re-run on every track change, so an event track (muxed, Whisper, or the
   * downloaded track mounted above) keeps its own path untouched.
   */
  React.useEffect(() => {
    if (!manager || selectedTrack == null) return undefined;
    if (manager.getCues().length) return undefined;

    let cancelled = false;
    let cues: VideoCoreActiveCue[] = [];
    let lastCueSignature = '';

    const publish = (): void => {
      if (cancelled || !cues.length) return;
      const currentTime = video?.currentTime ?? 0;
      const active = activeStudyCuesAtTime(cues, currentTime, subtitleDelaySec);
      const signature = active
        .map((cue) => `${cue.trackNumber}:${cue.index}:${cue.startMs}:${cue.endMs}`)
        .join('|');
      if (signature === lastCueSignature) return;
      lastCueSignature = signature;
      setActiveCues(active);
      onCueChange?.(new CustomEvent('cuechange', {
        detail: { cues: active, currentTimeMs: Math.round(currentTime * 1_000) },
      }) as SubtitleManagerCueChangeEvent);
    };

    /**
     * True once the track's cues are held. The content is filled by an async fetch and
     * ASS conversion that `trackselected` does not wait for, so the first look is usually
     * null — `timeupdate` is the retry, and it is already firing.
     */
    const adopt = (): boolean => {
      if (cancelled) return false;
      if (cues.length) return true;
      const content = manager.getTrackContent(selectedTrack);
      if (!content) return false;
      const parsed = studyCuesFromParsedCues(
        parseStudySubtitles(content).cues,
        selectedTrack,
      );
      if (!parsed.length) return false;
      cues = parsed;
      setAllCues(stableCueList(parsed));
      return true;
    };

    const tick = (): void => {
      if (adopt()) publish();
    };

    tick();
    video?.addEventListener('timeupdate', tick);
    video?.addEventListener('seeked', tick);
    video?.addEventListener('loadeddata', tick);
    return () => {
      cancelled = true;
      video?.removeEventListener('timeupdate', tick);
      video?.removeEventListener('seeked', tick);
      video?.removeEventListener('loadeddata', tick);
    };
  }, [manager, onCueChange, selectedTrack, subtitleDelaySec, video]);

  /**
   * DEFECT S1's other half — give libass a face that can draw kana.
   *
   * The player burns ASS onto a canvas with JASSUB, constructed with
   * `defaultFont: "roboto medium"` and `availableFonts: { "roboto medium": Roboto-Medium }`
   * and nothing else (`video-core-subtitles.ts`; `src/media/jassub/assets/` holds that one
   * face). Every other font libass ever sees is a container attachment. So a muxed release
   * that ships its fonts is fine, a bare sidecar — every Jimaku or nyaa track — has no
   * Japanese face at all, and a release whose attachments cover one style but not another
   * renders one readable line beside boxes on the SAME frame. That last case is the user's
   * screenshot, and nothing in the DOM can produce it.
   *
   * Fetched here rather than passed as bytes over IPC: the face is 9–13 MB, and a blob URL
   * made in this document is reachable from JASSUB's worker without asking whether a custom
   * protocol is. Applied once per renderer instance, keyed on the object itself so a
   * renderer that gets rebuilt is re-fonted rather than silently left bare.
   *
   * `libassRenderer` is null until the manager's lazy init, which is the first track
   * selection — hence the same `timeupdate` retry the file-track clock above uses.
   */
  const libassFontRendererRef = React.useRef<unknown>(null);
  React.useEffect(() => {
    if (!manager) return undefined;
    let cancelled = false;
    let objectUrl = '';

    const apply = async (): Promise<void> => {
      const renderer = manager.libassRenderer;
      if (!renderer?.renderer?.addFonts) return;
      if (libassFontRendererRef.current === renderer) return;
      libassFontRendererRef.current = renderer;
      try {
        const font = await window.api.subtitleFallbackFont(getStudyLang());
        if (cancelled || !font) return;
        const blob = await (await fetch(font.url)).blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        await renderer.renderer.addFonts([objectUrl]);
        if (cancelled) return;
        /*
          `addFonts` alone was NOT the fix, measured live on a bare nyaa ASS sidecar:
          libass still painted every glyph as a box. Adding the bytes only makes the face
          *findable by name*; the styles in that file name `ＤＦＰ平成ゴシック体W7`,
          `思源黑体 CN Heavy` and friends, none of which are on the machine, and for a
          family it cannot find libass substitutes its DEFAULT font — which the player
          constructs as `roboto medium`, a face with no kana and no kanji. So the default
          is the lever, not the font list. The worker exposes `setDefaultFont`, which
          lowercases and hands the name straight to `_wasm.setDefaultFont`; the family
          reported by the resolver is the one written into the file we just added, so
          libass looks it up in the provider rather than falling through to Roboto again.
        */
        await renderer.renderer.setDefaultFont?.(font.family);
      } catch {
        // A machine with no CJK face installed, or a renderer torn down mid-fetch. The
        // subtitles still render — with the coverage they had before — and re-arming on
        // the next renderer is the only recovery worth having here.
        libassFontRendererRef.current = null;
      }
    };

    const tick = (): void => { void apply(); };
    tick();
    manager.addEventListener('trackselected', tick);
    manager.addEventListener('tracksloaded', tick);
    video?.addEventListener('timeupdate', tick);
    return () => {
      cancelled = true;
      manager.removeEventListener('trackselected', tick);
      manager.removeEventListener('tracksloaded', tick);
      video?.removeEventListener('timeupdate', tick);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [manager, video]);

  /**
   * The MediaCaptions half of the same surface — and the branch that actually runs for a
   * file whose subtitles VideoCore found beside it, which is why the timing correction is
   * applied here too and not only in the effect above.
   *
   * The shift lands on the cue times rather than on a player-level delay because there is
   * no player-level delay to reach for: `MediaCaptionsManager` exposes track selection and
   * nothing about timing. That is also why the native caption layer is hidden in CSS while
   * this overlay is mounted — it renders from the unshifted track and cannot be corrected,
   * so leaving it visible would put a nine-second-late copy of every line on screen next to
   * the corrected one.
   */
  React.useEffect(() => {
    if (manager || !mediaCaptionsManager) return;
    let cancelled = false;
    let selectedCues: VideoCoreActiveCue[] = [];
    let lastCueSignature = '';
    const localPath = localFilePath || playbackInfo?.localFile?.path;

    onManagerReady?.(mediaCaptionsManager.constructor.name);

    const syncTracks = (): void => {
      if (cancelled) return;
      setTracks(normalizeMediaCaptionTracks(mediaCaptionsManager, playbackInfo));
      setSelectedTrack(mediaCaptionsManager.getSelectedTrackIndexOrNull());
    };
    const syncActive = (): void => {
      if (cancelled) return;
      const currentTime = video?.currentTime ?? 0;
      const cues = activeStudyCuesAtTime(
        selectedCues,
        currentTime,
        subtitleDelaySec,
      );
      /*
        `timeupdate` fires about four times a second, and this runs on every one of them —
        so without the guard a single three-second line handed the overlay a dozen fresh
        arrays saying the same thing, and re-rendered every child for each. The signature
        below cannot cover it: it gates `onCueChange`, and it is computed AFTER this line.
        The file-track path a hundred lines up already returns early on that signature; this
        one never did, which is the asymmetry rather than a second design.
      */
      setActiveCues(stableCueList(cues));
      const signature = cues
        .map((cue) => `${cue.trackNumber}:${cue.index}:${cue.startMs}:${cue.endMs}`)
        .join('|');
      if (signature === lastCueSignature) return;
      lastCueSignature = signature;
      onCueChange?.(new CustomEvent('cuechange', {
        detail: {
          cues,
          currentTimeMs: Math.round(currentTime * 1_000),
        },
      }) as SubtitleManagerCueChangeEvent);
    };
    const loadSelectedTrack = async (trackNumber: number | null): Promise<void> => {
      if (trackNumber == null) {
        selectedCues = [];
        setAllCues([]);
        syncActive();
        return;
      }
      try {
        const raw = await mediaCaptionCues(mediaCaptionsManager, trackNumber);
        // Measured against the audio, so the correction belongs to the file rather than to
        // the track — a second track on the same release is late by the same amount, and
        // the resolver's per-path cache is what stops it being measured twice.
        const offsetSec = await resolveSubtitleSyncOffset(
          localPath,
          raw.map((cue) => ({ start: cue.startMs / 1000, end: cue.endMs / 1000 })),
          video?.duration,
        );
        const cues = shiftCuesMs(raw, offsetSec);
        if (cancelled || mediaCaptionsManager.getSelectedTrackIndexOrNull() !== trackNumber) {
          return;
        }
        selectedCues = cues;
        setAllCues(stableCueList(cues));
        syncActive();
      } catch {
        if (cancelled) return;
        selectedCues = [];
        setAllCues([]);
        syncActive();
      }
    };
    const handleTrackSelected = (event: MediaCaptionsTrackSelectedEvent): void => {
      const trackNumber = event.detail.trackIndex;
      setSelectedTrack(trackNumber);
      void loadSelectedTrack(trackNumber);
    };
    const handleTrackDeselected = (): void => {
      setSelectedTrack(null);
      void loadSelectedTrack(null);
    };
    const handleTracksLoaded = (): void => {
      syncTracks();
      void loadSelectedTrack(mediaCaptionsManager.getSelectedTrackIndexOrNull());
    };

    syncTracks();
    void loadSelectedTrack(mediaCaptionsManager.getSelectedTrackIndexOrNull());
    mediaCaptionsManager.addEventListener('trackselected', handleTrackSelected);
    mediaCaptionsManager.addEventListener('trackdeselected', handleTrackDeselected);
    mediaCaptionsManager.addEventListener('tracksloaded', handleTracksLoaded);
    video?.addEventListener('timeupdate', syncActive);
    video?.addEventListener('seeked', syncActive);
    video?.addEventListener('loadeddata', syncActive);
    return () => {
      cancelled = true;
      mediaCaptionsManager.removeEventListener('trackselected', handleTrackSelected);
      mediaCaptionsManager.removeEventListener('trackdeselected', handleTrackDeselected);
      mediaCaptionsManager.removeEventListener('tracksloaded', handleTracksLoaded);
      video?.removeEventListener('timeupdate', syncActive);
      video?.removeEventListener('seeked', syncActive);
      video?.removeEventListener('loadeddata', syncActive);
    };
  }, [
    localFilePath,
    manager,
    mediaCaptionsManager,
    onCueChange,
    onManagerReady,
    playbackInfo,
    resolveSubtitleSyncOffset,
    subtitleDelaySec,
    video,
  ]);

  React.useEffect(() => {
    if (!audioManager) {
      setSelectedAudioTrack(null);
      return;
    }
    setSelectedAudioTrack(audioManager.getSelectedTrackNumberOrNull());
    const handleTrackChanged = (event: AudioManagerTrackChangedEvent): void => {
      setSelectedAudioTrack(event.detail.trackNumber);
    };
    audioManager.addEventListener('trackchanged', handleTrackChanged);
    return () => audioManager.removeEventListener('trackchanged', handleTrackChanged);
  }, [audioManager]);

  /**
   * Which track carries the second line.
   *
   * Prefers a track whose own language is the one the user picked, so choosing Russian
   * on a release that ships Russian subtitles shows those subtitles rather than a
   * machine translation of the Japanese. When no track matches, any other track will do
   * and the language preference is honoured further down by translating instead.
   *
   * The candidate filter narrows to event tracks only while `SubtitleManager` is driving,
   * because `getCuesForTrack` is the event track's own accessor. Under MediaCaptions every
   * track is a parsed file and any of them can be read, which is what makes dual subtitles
   * work at all on this path — the previous `!manager` early return forced the track to
   * null and left the whole feature unreachable for a sidecar release.
   */
  React.useEffect(() => {
    // `file` as well as `event`: a libass file track is a real, selectable track whose
    // cues this overlay can now read (see the file-track cue clock above). Excluding it
    // here is what made a downloaded translation — the ordinary shape of a Russian or
    // English second line — un-offerable while the same file was fine as the primary.
    // The `!manager` allowance is MediaCaptions': there every track is a parsed file, so
    // an early return on a null manager left dual subtitles unreachable for a sidecar.
    const candidates = tracks.filter((track) => (
      track.number !== selectedTrack
      && (!manager || track.type === 'event' || track.type === 'file')
    ));
    // `studyTrackLanguage`, not the bare language field: a sidecar track has none, only a
    // label like `… - 04.en`, and the English sidecar was never recognised as English.
    const preferred = candidates.find(
      (track) => studyTrackLanguage(track) === preferences.secondarySubLang,
    );
    setSecondaryTrack((current) => {
      if (preferred) return preferred.number;
      if (current != null && candidates.some((track) => track.number === current)) {
        return current;
      }
      return candidates[0]?.number ?? null;
    });
  }, [manager, preferences.secondarySubLang, selectedTrack, tracks]);

  React.useEffect(() => {
    if (!video || secondaryTrack == null || (!manager && !mediaCaptionsManager)) {
      secondaryCuesRef.current = [];
      setSecondaryCues([]);
      setActiveSecondaryCues([]);
      return;
    }
    /*
      DEFECT S3 — `bridgedSecondaryCuesAtTime`, not `activeStudyCuesAtTime`, and ONLY
      here. The second line is the one element in this overlay with no box of its own:
      the primary falls back to `study-cue-status` and the timing readout stays put,
      while `{preferences.dualSubs && secondaryText && ...}` unmounts the `<p>` outright.
      So every inter-cue gap in the translation track blanks the line and reflows the
      overlay around it, and on the harvest track measured for this defect the median
      gap is 650 ms with 82 of 285 under 400 ms — a blink, which is what the user
      reported. The bridge covers a short gap and refuses a long one; the primary keeps
      the exact activation it always had, because the study tools read it.
    */
    let cancelled = false;
    const syncActive = (): void => {
      // Same four-times-a-second tick as the primary above, and the bridge deliberately
      // returns the SAME cue across a short gap — so the steady state here is an unchanged
      // answer rebuilt into a new array, which is precisely what the guard is for.
      setActiveSecondaryCues(
        stableCueList(bridgedSecondaryCuesAtTime(
          secondaryCuesRef.current,
          video.currentTime,
          subtitleDelaySec,
        )),
      );
    };
    /**
     * The secondary track's timeline, from whichever half of the manager holds it.
     *
     * `getCuesForTrack` reads the event cache only, so it answers `[]` for a file track
     * exactly as `getCues()` does for the primary. The cached ASS is the fallback, parsed
     * once per track rather than on every `cuechange` — this runs at each cue boundary and
     * a translation track is hundreds of lines.
     *
     * `parseSubtitles`, NOT `parseStudySubtitles`: the second line is a translation the
     * viewer asked to see, so it must arrive whole. The Japanese-style split belongs to
     * the primary track, and applying it here would drop the very line being shown.
     */
    const fileCues = (): VideoCoreActiveCue[] => {
      if (!manager) return [];
      if (secondaryFileCuesRef.current?.trackNumber === secondaryTrack) {
        return secondaryFileCuesRef.current.cues;
      }
      const content = manager.getTrackContent(secondaryTrack);
      if (!content) return [];
      const parsed = studyCuesFromParsedCues(parseSubtitles(content), secondaryTrack);
      if (!parsed.length) return [];
      secondaryFileCuesRef.current = { trackNumber: secondaryTrack, cues: parsed };
      return parsed;
    };
    const applyCues = (cues: VideoCoreActiveCue[]): void => {
      if (cancelled) return;
      secondaryCuesRef.current = cues;
      setSecondaryCues(cues);
      syncActive();
    };
    const refreshTimeline = (): void => {
      if (manager) {
        const cues = manager.getCuesForTrack(secondaryTrack);
        applyCues(cues.length ? cues : fileCues());
        return;
      }
      if (!mediaCaptionsManager) return;
      // Shifted by the same measured offset as the primary: both tracks describe the same
      // audio, so a second line left uncorrected would sit nine seconds off the first.
      void (async () => {
        const raw = await mediaCaptionCues(mediaCaptionsManager, secondaryTrack);
        const offsetSec = await resolveSubtitleSyncOffset(
          localFilePath || playbackInfo?.localFile?.path,
          raw.map((cue) => ({ start: cue.startMs / 1000, end: cue.endMs / 1000 })),
          video.duration,
        );
        applyCues(shiftCuesMs(raw, offsetSec));
      })();
    };
    /*
      While the timeline is still empty the playback clock is the retry, because a file
      track's ASS is filled by a fetch that track selection does not wait for, and a
      primary that is ALSO a file track dispatches no `cuechange` to retry on. Once cues
      are held this degrades to the activation sync it always was — re-listing a
      several-hundred-line track four times a second is not free.
    */
    const tick = (): void => {
      if (secondaryCuesRef.current.length) syncActive();
      else refreshTimeline();
    };
    /*
      Subtitle audit 6h: the second line's timeline used to be re-listed ONLY on the primary
      track's `cuechange`. Its cues stream in while the file is read, so an English line
      that reached the cache after the Japanese line's boundary waited for the NEXT boundary
      — and on a track whose lines share timings, that is after the line is over. The
      manager now says when a track grows, and the second line listens for its own track.
    */
    const handleEventsAdded = (event: SubtitleManagerEventsAddedEvent): void => {
      if (event.detail.trackNumbers.includes(secondaryTrack)) refreshTimeline();
    };
    refreshTimeline();
    manager?.addEventListener('cuechange', refreshTimeline);
    manager?.addEventListener('eventsadded', handleEventsAdded);
    video.addEventListener('timeupdate', tick);
    video.addEventListener('seeked', tick);
    return () => {
      cancelled = true;
      manager?.removeEventListener('cuechange', refreshTimeline);
      manager?.removeEventListener('eventsadded', handleEventsAdded);
      video.removeEventListener('timeupdate', tick);
      video.removeEventListener('seeked', tick);
    };
  }, [
    localFilePath,
    manager,
    mediaCaptionsManager,
    playbackInfo?.localFile?.path,
    resolveSubtitleSyncOffset,
    secondaryTrack,
    subtitleDelaySec,
    video,
  ]);

  React.useEffect(() => {
    setTranslation('');
    setDictationInput('');
    setDictationResult(null);
    setDictationRevealed(false);
  }, [activeCue?.index, activeCue?.trackNumber]);

  React.useEffect(() => {
    if (!video) return;
    const handleTimeUpdate = (): void => {
      const seekTo = resolveStudyLoopSeekSec(
        video.currentTime,
        activeCue,
        subtitleDelaySec,
        {
          lineLoop: preferences.loopLine,
          abLoop,
          abStartSec,
          abEndSec,
        },
      );
      if (seekTo == null) return;
      markProgrammaticSeek(seekTo);
      video.currentTime = seekTo;
      if (video.paused) void video.play();
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    return () => video.removeEventListener('timeupdate', handleTimeUpdate);
  }, [
    abEndSec,
    abLoop,
    abStartSec,
    activeCue,
    markProgrammaticSeek,
    preferences.loopLine,
    subtitleDelaySec,
    video,
  ]);

  React.useEffect(() => {
    if (!video) return;
    lastPlaybackTimeRef.current = video.currentTime;
    const handleTimeUpdate = (): void => {
      if (!video.seeking) lastPlaybackTimeRef.current = video.currentTime;
    };
    const handleSeeking = (): void => {
      if (seekOriginRef.current == null) {
        seekOriginRef.current = lastPlaybackTimeRef.current;
      }
    };
    const handleSeeked = (): void => {
      const origin = seekOriginRef.current ?? lastPlaybackTimeRef.current;
      const target = video.currentTime;
      const ignoredTarget = ignoredSeekTargetRef.current;
      const ignored = ignoredTarget != null && Math.abs(ignoredTarget - target) <= 0.25;
      ignoredSeekTargetRef.current = null;
      seekOriginRef.current = null;
      lastPlaybackTimeRef.current = target;
      if (!ignored && origin - target >= 0.75) {
        recordComprehension('rewind', manager?.getActiveCues()[0] ?? activeCue);
      }
    };
    const handlePause = (): void => {
      if (ignoredPauseRef.current) {
        ignoredPauseRef.current = false;
        return;
      }
      recordComprehension('pause', manager?.getActiveCues()[0] ?? activeCue);
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('pause', handlePause);
    };
  }, [activeCue, manager, recordComprehension, video]);

  const seekCue = React.useCallback(
    (cue: VideoCoreActiveCue | null, leadInSec = 0): void => {
      if (!cue || !video) return;
      const target = transcriptSeekSec(cue, subtitleDelaySec, leadInSec);
      markProgrammaticSeek(target);
      video.currentTime = target;
      void video.play();
    },
    [markProgrammaticSeek, subtitleDelaySec, video],
  );

  /*
    Jumping to a transcript line lands slightly before it, not exactly on it.
    Seeking to the cue's own start clips the first mora — the decoder settles on
    the following keyframe and the line is already speaking when audio resumes.
    A second of run-up also gives the sentence its intonation contour, which is
    most of why someone clicked a line they had already heard.

    Cue navigation (⟨ ⟩ and replay) deliberately does NOT take this: those are
    used mid-study to sit exactly on a line, and a run-up there would replay the
    tail of the previous one every time.
  */
  const seekTranscriptCue = React.useCallback(
    (cue: VideoCoreActiveCue): void => seekCue(cue, TRANSCRIPT_LEAD_IN_SEC),
    [seekCue],
  );

  /** Relative seek for the rewind / fast-forward shortcuts, clamped to the file. */
  const seekBy = React.useCallback(
    (deltaSec: number): void => {
      if (!video) return;
      const duration = Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER;
      video.currentTime = Math.max(0, Math.min(duration, video.currentTime + deltaSec));
    },
    [video],
  );

  const replayCue = React.useCallback(
    (cue: VideoCoreActiveCue | null): void => {
      if (!cue) return;
      setReplaySignal((current) => recordVideoCoreCueReplay(current, cue));
      recordComprehension('rewind', cue);
      seekCue(cue);
    },
    [recordComprehension, seekCue],
  );

  const jumpCue = React.useCallback(
    (direction: -1 | 1): void => {
      if (!video) return;
      const sourceTimeMs = (video.currentTime - subtitleDelaySec) * 1000;
      const target = adjacentStudyCue(allCues, sourceTimeMs, direction);
      if (direction < 0 && target) recordComprehension('rewind', target);
      seekCue(target);
    },
    [allCues, recordComprehension, seekCue, subtitleDelaySec, video],
  );

  /** The explicit ±0.1s control. Only this path may create timing evidence. */
  const changeSubtitleDelay = React.useCallback(
    (delta: number): void => {
      const next = Math.round(
        Math.max(-10, Math.min(10, subtitleDelaySec + delta)) * 10,
      ) / 10;
      subtitleDelayRef.current = next;
      setSubtitleDelaySec(next);
      void manager?.setSubtitleDelay(next);
      // Remembered for THIS file: the release that is 0.4 s late is late every time.
      saveSubtitleDelay(delayKeyRef.current, next);
      if (selectedTrack == null || !video) return;
      const positionSec = video.currentTime;
      setTimingSignal((current) =>
        recordVideoCoreTimingAdjustment(current, selectedTrack, positionSec, next));
    },
    [manager, selectedTrack, subtitleDelaySec, video],
  );

  /**
   * Back to zero in one press. Not timing evidence (it records nothing for the drift
   * tracker, and stops a running track): it is the user abandoning a correction, not making
   * one. Clears the file's stored delay too.
   */
  const resetSubtitleDelay = React.useCallback((): void => {
    setDriftTracking(false);
    subtitleDelayRef.current = 0;
    setSubtitleDelaySec(0);
    void manager?.setSubtitleDelay(0);
    saveSubtitleDelay(delayKeyRef.current, 0);
  }, [manager]);

  /*
    The file's remembered delay, applied when a file opens and again when a manager is
    (re)built — the manager's constructor applies VideoCore's own global delay setting, which
    would otherwise silently replace this file's correction. The delay also used to leak from
    one file to the next, because the overlay stays mounted across opens.
  */
  React.useEffect(() => {
    const stored = loadSubtitleDelayFor(delayKey, subtitleSource);
    subtitleDelayRef.current = stored;
    setSubtitleDelaySec(stored);
    void manager?.setSubtitleDelay(stored);
    // `subtitleSource` is what `delayKey` is derived from; the key is the change signal.
  }, [delayKey, manager]);

  /**
   * Study-loop keyboard shortcuts — registered as app commands, slice 19.
   *
   * The adopted player already owns a full keybinding map (`vc_defaultKeybindings` in
   * `video-core.atoms.ts`) plus hardcoded Space/Enter/Home/End/Escape and Comma/Period
   * for 24fps frame stepping. None of it addresses a *cue*, which is the unit this
   * overlay works in — so these actions had to be reached with the mouse.
   *
   * They used to be a `document` keydown switch on `event.code`, right here. The ten
   * `video.*` rows in `COMMAND_CATALOG` meanwhile still pointed at the LEGACY player's
   * handlers, which slice 16 left acting on an unattached `videoRef` — so the app had two
   * owners for the same six capabilities, one invisible and unrebindable and one visible
   * and dead. Registering the catalog's own ids is what collapses that into one owner.
   *
   * Two consequences worth stating rather than discovering later:
   *
   * - `registerCommandHandler` dispatches off `chordFromEvent`, which reads `event.key`,
   *   not `event.code`. On a non-QWERTY layout the physical keys move — which is the
   *   normal behaviour for every other shortcut in this app, and the reason a rebindable
   *   row beats a hardcoded scancode.
   * - The dispatcher's own `isTypingTarget()` check replaces the INPUT/TEXTAREA/SELECT/
   *   contentEditable guard this switch carried, so dictation and the mining form are
   *   still safe.
   *
   * The DEFAULTS live in the catalog, not here; they are the same five codes this switch
   * used (R/W/S/;/'), chosen from what the adopted map leaves free.
   */
  React.useEffect(() => {
    const offs = [
      registerCommandHandler('video.replayLine', () => replayCue(activeCueRef.current)),
      registerCommandHandler('video.prevLine', () => jumpCue(-1)),
      registerCommandHandler('video.nextLine', () => jumpCue(1)),
      registerCommandHandler('video.subEarlier', () => changeSubtitleDelay(-0.1)),
      registerCommandHandler('video.subLater', () => changeSubtitleDelay(0.1)),
      registerCommandHandler('video.subEarlierLarge', () => changeSubtitleDelay(-0.5)),
      registerCommandHandler('video.subLaterLarge', () => changeSubtitleDelay(0.5)),
      registerCommandHandler('video.toggleAutoPause', () => {
        updatePreference('autoPause', !preferencesRef.current.autoPause);
      }),
      registerCommandHandler('video.toggleLoop', () => {
        const next = !preferencesRef.current.loopLine;
        updatePreference('loopLine', next);
        // The checkbox clears the A–B loop when line-loop goes on, because the two
        // compete for the same timeupdate handler. A shortcut that skipped this could
        // reach a state the UI cannot express.
        if (next) setAbLoop(false);
      }),
      registerCommandHandler('video.toggleFurigana', () => {
        updatePreference('furigana', !preferencesRef.current.furigana);
      }),
      registerCommandHandler('video.toggleDualSubs', () => {
        updatePreference('dualSubs', !preferencesRef.current.dualSubs);
      }),
      registerCommandHandler('video.toggleSubtitles', () => {
        updatePreference('subtitlesHidden', !preferencesRef.current.subtitlesHidden);
      }),
      registerCommandHandler('video.cycleVideoFit', () => {
        updatePreference('videoFit', nextVideoFit(preferencesRef.current.videoFit));
      }),
      // One ladder for both keys (see `nudgeSubtitlePosition`): up past the highest lift
      // reaches the top of the picture, and down from the top comes back.
      registerCommandHandler('video.subPositionUp', () => {
        const next = nudgeSubtitlePosition(preferencesRef.current, 1);
        updatePreference('subtitlePosition', next.subtitlePosition);
        updatePreference('subtitleAtTop', next.subtitleAtTop);
      }),
      registerCommandHandler('video.subPositionDown', () => {
        const next = nudgeSubtitlePosition(preferencesRef.current, -1);
        updatePreference('subtitlePosition', next.subtitlePosition);
        updatePreference('subtitleAtTop', next.subtitleAtTop);
      }),
      registerCommandHandler('video.subDelayReset', () => resetSubtitleDelay()),
      /*
        Seeks are NOT marked programmatic. The comprehension tracker treats a
        backward seek as evidence the viewer did not follow the line, and a
        hand-driven rewind is exactly that — suppressing it here would make the
        shortcut the one way to rewind that the tracker cannot see.

        Step comes from the ref rather than the render closure so re-binding does
        not depend on the preference, and so changing it mid-episode takes effect
        on the next press instead of the next mount.
      */
      registerCommandHandler('video.seekBack', () => seekBy(-preferencesRef.current.seekStepSec)),
      registerCommandHandler('video.seekForward', () => seekBy(preferencesRef.current.seekStepSec)),
      registerCommandHandler('video.mineCurrentLine', () => {
        if (!activeCueRef.current) return;
        setMineSignal((n) => n + 1);
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [changeSubtitleDelay, jumpCue, replayCue, resetSubtitleDelay, seekBy, updatePreference]);

  /**
   * Workspace commands — registered here for the same reason the `video.*` rows are.
   *
   * The catalog owns the ids and the (unbound) defaults; the surface that can actually
   * carry them out owns the handlers. Registering them anywhere else would recreate the
   * defect slice 19 fixed: a rebindable row pointing at a handler with nothing behind it.
   *
   * Reads the workspace through refs so this binds once rather than on every layout
   * change — a re-registration per dispatch would be a re-registration per keystroke in
   * customize mode.
   */
  const workspaceRef = React.useRef(workspace);
  workspaceRef.current = workspace;
  React.useEffect(() => {
    const offs = [
      registerCommandHandler('workspace.customize', () => {
        const current = workspaceRef.current;
        current.dispatch({ type: 'set-customizing', customizing: !current.customizing });
      }),
      registerCommandHandler('workspace.reset', () => {
        const current = workspaceRef.current;
        current.dispatch({ type: 'reset-workspace', workspaceId: current.workspace.id });
      }),
      registerCommandHandler('workspace.nextMode', () => {
        const current = workspaceRef.current;
        const ids = current.doc.workspaces.map((entry) => entry.id);
        const at = ids.indexOf(current.doc.activeWorkspaceId);
        const next = ids[(at + 1) % ids.length];
        if (next) current.dispatch({ type: 'switch-workspace', workspaceId: next });
      }),
      registerCommandHandler('workspace.toggleTranscript', () => {
        // Toggles what is ON SCREEN. The Transcript layout shows the rail with the
        // preference off, so flipping the preference alone could "open" a visible rail.
        const current = workspaceRef.current;
        if (current.isVisible('transcript')) {
          updatePreference('transcriptPanel', false);
          current.dispatch({ type: 'close-block', blockId: 'transcript' });
        } else {
          updatePreference('transcriptPanel', true);
          current.trigger('transcript-open');
        }
      }),
      registerCommandHandler('workspace.toggleAi', () => {
        workspaceRef.current.dispatch({ type: 'toggle-block', blockId: 'aiWorkspace' });
      }),
      registerCommandHandler('workspace.focusVideo', () => {
        workspaceRef.current.dispatch({ type: 'dismiss-contextual' });
      }),
    ];
    return () => offs.forEach((off) => off());
  }, [updatePreference]);

  /**
   * While tracking, the measured drift — not the user — supplies the delay. These
   * writes deliberately bypass `changeSubtitleDelay`, so the tracker can never
   * feed its own corrections back in as fresh evidence.
   */
  React.useEffect(() => {
    if (!driftTracking || !timingDrift || !video || !manager) return undefined;
    const apply = (): void => {
      const next = videoCoreDriftDelaySec(timingDrift, video.currentTime);
      if (Math.abs(next - subtitleDelayRef.current) < VIDEO_CORE_TIMING_APPLY_STEP_SEC) return;
      subtitleDelayRef.current = next;
      setSubtitleDelaySec(next);
      void manager.setSubtitleDelay(next);
    };
    apply();
    video.addEventListener('timeupdate', apply);
    return () => video.removeEventListener('timeupdate', apply);
  }, [driftTracking, manager, timingDrift, video]);

  /** A different subtitle track is a different timing problem. */
  React.useEffect(() => {
    setTimingSignal(null);
    setDriftTracking(false);
  }, [selectedTrack]);

  /**
   * A manual correction while tracking re-anchors the line. If it contradicts the
   * measurement outright, the user has overruled it — stop rather than keep
   * applying a rate the evidence no longer supports.
   */
  React.useEffect(() => {
    if (driftTracking && !timingDrift) setDriftTracking(false);
  }, [driftTracking, timingDrift]);

  const stopDriftTracking = React.useCallback((): void => {
    setDriftTracking(false);
    setTimingSignal((current) => dismissVideoCoreTimingRepair(current));
    if (!timingDrift) return;
    subtitleDelayRef.current = timingDrift.anchorDelaySec;
    setSubtitleDelaySec(timingDrift.anchorDelaySec);
    void manager?.setSubtitleDelay(timingDrift.anchorDelaySec);
  }, [manager, timingDrift]);

  const translateCue = React.useCallback(
    async (text = plainText): Promise<void> => {
      if (!text || translationBusy) return;
      setTranslationBusy(true);
      try {
        // The chosen second-line language, not a hardcoded English. Otherwise this button
        // stacks an English line underneath a Russian second line, three deep on a picture
        // that is supposed to be showing one subtitle.
        setTranslation(await translateTo(text, getStudyLang(), preferences.secondarySubLang));
      } catch {
        setTranslation(translateUi('mediaWorkspace.study.translationUnavailable'));
      } finally {
        setTranslationBusy(false);
      }
    },
    [plainText, preferences.secondarySubLang, translationBusy],
  );

  const handleLookupMouseUp = React.useCallback(
    (event: React.MouseEvent): void => {
      const dismissOnly = popupOpenOnDownRef.current && isLookupClick(event);
      const hit = lookupWordFromMouseUp(event);
      if (hit?.translate) {
        void translateCue(hit.context || plainText || hit.query);
        return;
      }
      if (hit) {
        recordComprehension('lookup');
        if (pauseOnLookup && video) {
          if (!video.paused) ignoredPauseRef.current = true;
          video.pause();
        }
        setPopup({
          query: hit.query,
          x: hit.x,
          y: hit.y,
          top: hit.top,
          context: hit.context || plainText,
        });
      } else if (dismissOnly) {
        setPopup(null);
      }
    },
    [pauseOnLookup, plainText, recordComprehension, translateCue, video],
  );

  const checkDictation = React.useCallback((): void => {
    if (!plainText) return;
    const request = ++dictationRequestRef.current;
    const cue = activeCue;
    void evaluateDictation(dictationInput, plainText).then((result) => {
      if (request !== dictationRequestRef.current) return;
      setDictationResult(result);
      if (!cue) return;
      const key = `${cue.trackNumber}:${cue.index}`;
      setMissedLines((prev) => {
        const rest = prev.filter((line) => line.key !== key);
        return result.score < DICTATION_MISSED_BELOW
          ? [...rest, { key, cue, score: result.score }].sort((a, b) => a.cue.startMs - b.cue.startMs)
          : rest;
      });
    });
  }, [activeCue, dictationInput, plainText]);

  const clearShadowRecording = React.useCallback((): void => {
    shadowGenerationRef.current += 1;
    const url = shadowAudioUrlRef.current;
    shadowAudioUrlRef.current = '';
    setShadowAudioUrl('');
    if (url) URL.revokeObjectURL(url);
  }, []);

  const stopShadowRecording = React.useCallback((): void => {
    if (shadowStopTimerRef.current != null) {
      window.clearTimeout(shadowStopTimerRef.current);
      shadowStopTimerRef.current = null;
    }
    const recorder = shadowRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
  }, []);

  /**
   * Dictation and Shadowing are mutually exclusive and always were — each checkbox's
   * onChange cleared the other. Projecting the two stored booleans onto one enum leaves
   * the persisted preference shape untouched while letting the UI be a radio group, so
   * the exclusivity is announced rather than only enforced.
   */
  const practiceMode: PracticeMode = preferences.dictationMode
    ? 'dictation'
    : preferences.shadowingMode ? 'shadowing' : 'off';
  const setPracticeMode = React.useCallback((mode: PracticeMode): void => {
    updatePreference('dictationMode', mode === 'dictation');
    updatePreference('shadowingMode', mode === 'shadowing');
    if (mode !== 'shadowing') stopShadowRecording();
  }, [stopShadowRecording, updatePreference]);

  const startShadowRecording = React.useCallback(async (): Promise<void> => {
    if (shadowRecorderRef.current?.state === 'recording') return;
    setShadowError('');
    clearShadowRecording();
    const generation = shadowGenerationRef.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error(translateUi('mediaWorkspace.study.micUnsupported'));
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (generation !== shadowGenerationRef.current) {
        for (const track of stream.getTracks()) track.stop();
        return;
      }
      shadowStreamRef.current = stream;
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
      ].find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      shadowRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      recorder.onerror = () => {
        setShadowError(translateUi('mediaWorkspace.study.micStopped'));
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
          : translateUi('mediaWorkspace.study.micStartFailed'),
      );
    }
  }, [clearShadowRecording]);

  React.useEffect(() => {
    stopShadowRecording();
    clearShadowRecording();
    setShadowError('');
  }, [
    activeCue?.index,
    activeCue?.trackNumber,
    clearShadowRecording,
    stopShadowRecording,
  ]);

  React.useEffect(() => () => {
    shadowGenerationRef.current += 1;
    if (shadowStopTimerRef.current != null) {
      window.clearTimeout(shadowStopTimerRef.current);
    }
    const recorder = shadowRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    for (const track of shadowStreamRef.current?.getTracks() ?? []) track.stop();
    const url = shadowAudioUrlRef.current;
    if (url) URL.revokeObjectURL(url);
  }, []);

  const stopWhisperGeneration = React.useCallback((): void => {
    whisperGenerationRef.current += 1;
    whisperWorkerRef.current?.terminate();
    whisperWorkerRef.current = null;
    whisperCuesRef.current = [];
    setWhisperState('idle');
    setWhisperMessage('');
    setWhisperProgress(0);
  }, []);

  const runWhisperGeneration = React.useCallback(async (): Promise<void> => {
    const localFilePath = playbackInfo?.localFile?.path;
    if (!manager || !localFilePath) {
      setWhisperState('error');
      setWhisperError(translateUi('mediaWorkspace.study.whisperLocalOnly'));
      return;
    }

    stopWhisperGeneration();
    const generation = whisperGenerationRef.current;
    setWhisperError('');
    setWhisperProgress(0);
    setWhisperState('extracting');
    setWhisperMessage(translateUi('mediaWorkspace.study.extractingAudio'));

    let audio: Float32Array;
    try {
      const buffer = await window.api.seanimeExtractAudio(localFilePath);
      if (generation !== whisperGenerationRef.current) return;
      audio = new Float32Array(buffer);
      if (!audio.length) {
        throw new Error(translateUi('mediaWorkspace.study.noAudioTrack'));
      }
    } catch (error) {
      if (generation !== whisperGenerationRef.current) return;
      setWhisperState('error');
      setWhisperError(
        error instanceof Error
          ? error.message
          : translateUi('mediaWorkspace.study.audioExtractionFailed'),
      );
      return;
    }

    setWhisperState('loading');
    setWhisperMessage(translateUi('mediaWorkspace.study.loadingWhisper'));
    let worker: Worker;
    try {
      worker = new WhisperWorker();
    } catch (error) {
      setWhisperState('error');
      setWhisperError(
        error instanceof Error
          ? error.message
          : translateUi('mediaWorkspace.study.whisperStartFailed'),
      );
      return;
    }
    whisperWorkerRef.current = worker;
    whisperCuesRef.current = [];

    const fail = (message: string): void => {
      if (generation !== whisperGenerationRef.current) return;
      worker.terminate();
      if (whisperWorkerRef.current === worker) whisperWorkerRef.current = null;
      setWhisperState('error');
      setWhisperError(message);
    };

    worker.onmessage = (event: MessageEvent<WhisperWorkerMessage>) => {
      if (generation !== whisperGenerationRef.current) return;
      const message = event.data;
      if (
        message.type === 'progress'
        && message.status === 'progress'
        && typeof message.progress === 'number'
      ) {
        const file = message.file?.split('/').pop() || 'model';
        setWhisperMessage(translateUi('mediaWorkspace.study.downloadProgress', {
          file,
          progress: Math.round(message.progress),
        }));
        return;
      }
      if (message.type === 'status' && message.status === 'transcribing') {
        const device = message.device === 'webgpu' ? 'webgpu' : 'wasm';
        markTierDownloaded(effectiveWhisperTier(whisperModel, message.model), device, whisperDevice);
        setWhisperState('transcribing');
        setWhisperMessage(
          translateUi('mediaWorkspace.study.whisperOnDevice', {
            device: translateUi(
              device === 'webgpu'
                ? 'mediaWorkspace.study.gpu'
                : 'mediaWorkspace.study.cpu',
            ),
          }),
        );
        return;
      }
      if (message.type === 'partial') {
        if (Array.isArray(message.cues)) {
          whisperCuesRef.current.push(...message.cues);
        }
        setWhisperProgress(message.progress ?? 0);
        return;
      }
      if (message.type === 'error') {
        fail(message.message || translateUi('mediaWorkspace.study.whisperFailed'));
        return;
      }
      if (message.type !== 'done') return;

      void (async () => {
        const trackNumber = nextVideoCoreWhisperTrackNumber(
          manager.getTracks().map((track) => track.number),
        );
        const subtitleEvents = whisperCuesToVideoCoreEvents(
          whisperCuesRef.current,
          trackNumber,
        ) as MKVParser_SubtitleEvent[];
        if (!subtitleEvents.length) {
          fail(translateUi('mediaWorkspace.study.noWhisperCues'));
          return;
        }
        const track: MKVParser_TrackInfo = {
          number: trackNumber,
          uid: trackNumber,
          type: 'subtitle',
          codecID: 'S_TEXT/ASS',
          name: translateUi('mediaWorkspace.study.whisperGenerated'),
          language: whisperLanguage,
          languageIETF: whisperLanguage,
          default: false,
          forced: false,
          enabled: true,
        };
        try {
          await manager.addEventTrack(track);
          await manager.onSubtitleEvents(subtitleEvents);
          await manager.selectTrack(trackNumber);
          if (generation !== whisperGenerationRef.current) return;
          setTracks(manager.getTracks());
          setSelectedTrack(manager.getSelectedTrackNumberOrNull());
          setAllCues(stableCueList(manager.getCues()));
          setActiveCues(manager.getActiveCues());
          setWhisperState('done');
          setWhisperMessage(translateUi('mediaWorkspace.study.generatedLines', {
            count: subtitleEvents.length,
          }));
          setWhisperProgress(1);
          worker.terminate();
          if (whisperWorkerRef.current === worker) whisperWorkerRef.current = null;
        } catch (error) {
          fail(
            error instanceof Error
              ? error.message
              : translateUi('mediaWorkspace.study.whisperMountFailed'),
          );
        }
      })();
    };
    worker.onerror = (error) => {
      fail(error.message || translateUi('mediaWorkspace.study.whisperStartFailed'));
    };
    try {
      worker.postMessage(
        {
          audio,
          model: whisperHfId(whisperModel),
          prefer: whisperDevice,
          lang: whisperLanguage,
        },
        [audio.buffer],
      );
    } catch (error) {
      fail(
        error instanceof Error
          ? error.message
          : translateUi('mediaWorkspace.study.audioSendFailed'),
      );
    }
  }, [
    manager,
    playbackInfo?.localFile?.path,
    stopWhisperGeneration,
    whisperDevice,
    whisperLanguage,
    whisperModel,
  ]);

  React.useEffect(() => {
    stopWhisperGeneration();
    setWhisperError('');
  }, [playbackInfo?.id, stopWhisperGeneration]);

  React.useEffect(() => () => {
    whisperGenerationRef.current += 1;
    whisperWorkerRef.current?.terminate();
  }, []);

  const audioTracks: MKVParser_TrackInfo[] = playbackInfo?.mkvMetadata?.audioTracks ?? [];

  /*
   * Player Diagnostics reads this player's live state from here (the Media
   * Center's settings hold no element and no tracks). Refs, so the reader is
   * registered once and always answers with the current values.
   */
  const diagnosticsStateRef = React.useRef({ playbackInfo, video, tracks, allCues, audioTracks, localFilePath });
  diagnosticsStateRef.current = { playbackInfo, video, tracks, allCues, audioTracks, localFilePath };
  React.useEffect(() => registerLivePlayerProbe(() => {
    const s = diagnosticsStateRef.current;
    if (!s.playbackInfo || !s.video) return null;
    const v = s.video;
    return {
      streamType: String(s.playbackInfo.streamType ?? s.playbackInfo.playbackType ?? ''),
      ...(s.localFilePath ? { localFilePath: s.localFilePath } : {}),
      video: {
        readyState: v.readyState,
        networkState: v.networkState,
        ...(v.error?.code ? { errorCode: v.error.code } : {}),
        width: v.videoWidth,
        height: v.videoHeight,
        durationSec: Number.isFinite(v.duration) ? v.duration : 0,
      },
      audioTracks: s.audioTracks.map((a) => a.name || a.language || `#${a.number}`),
      subtitleTracks: s.tracks.map((tr) => tr.label || tr.language || `#${tr.number}`),
      cueCount: s.allCues.length,
    };
  }), []);

  /*
   * "Export subtitles": the loaded track as SRT or VTT. The export helpers
   * existed with no control since the old player's menu was deleted; this is
   * their door, in the player's own subtitle menu.
   */
  const exportSubtitles = React.useCallback((format: 'srt' | 'vtt') => {
    const cues = allCuesRef.current.map((cue) => ({
      start: cue.startMs / 1000,
      end: cue.endMs / 1000,
      text: stripAssCueText(cue.text),
    }));
    if (!cues.length) return;
    const source = miningSourceFromPlayback(playbackInfo);
    const base = [source?.mediaTitle, source?.episodeNumber != null ? String(source.episodeNumber) : '']
      .filter(Boolean)
      .join(' ')
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .trim() || 'subtitles';
    if (format === 'srt') downloadSubtitles(`${base}.srt`, cuesToSrt(cues), 'text/srt');
    else downloadSubtitles(`${base}.vtt`, cuesToVtt(cues), 'text/vtt');
  }, [playbackInfo]);
  const whisperBusy = whisperState === 'extracting'
    || whisperState === 'loading'
    || whisperState === 'transcribing';

  /* ------------------------------------------------------------------------------ *
   * Workspace wiring
   *
   * The preferences remain the source of truth for WHETHER a feature is on — they are
   * persisted, shortcut-bound and shared with the settings surfaces. The workspace owns
   * WHERE it appears. These effects are the one-way bridge between the two, so a
   * shortcut, a checkbox and a block menu can never disagree about the transcript.
   * ------------------------------------------------------------------------------ */

  const { dispatch: workspaceDispatch, trigger: workspaceTrigger } = workspace;

  /*
    The transcript preference OPENS the rail when it is on, and CLOSES it only when the user
    turns it off. It used to close the block whenever the preference was off — including on
    every mount — so the Transcript layout, whose rail is the layout's own and has nothing to
    do with the preference, lost its transcript each time the player reopened (subtitle audit
    7b). A layout decides what it shows; only the user's "off" takes the rail away.
  */
  const transcriptPreferenceRef = React.useRef<boolean | null>(null);
  React.useEffect(() => {
    const previous = transcriptPreferenceRef.current;
    transcriptPreferenceRef.current = preferences.transcriptPanel;
    if (preferences.transcriptPanel) {
      if (previous !== true && !workspaceRef.current.isVisible('transcript')) {
        workspaceDispatch({ type: 'open-block', blockId: 'transcript', placement: 'right' });
      }
    } else if (previous === true) {
      workspaceDispatch({ type: 'close-block', blockId: 'transcript' });
    }
  }, [preferences.transcriptPanel, workspaceDispatch]);

  // The grammar card follows the analysis, not the toggle: with highlighting on but no
  // sentence analysed there is nothing for the panel to say, and an empty card taking a
  // 24rem column is the exact failure this redesign is about.
  const grammarPanelWanted = preferences.grammarHighlight && !!activeCue && !!plainText;
  React.useEffect(() => {
    if (grammarPanelWanted) {
      workspaceDispatch({ type: 'open-block', blockId: 'grammar', placement: 'left' });
    } else {
      workspaceDispatch({ type: 'close-block', blockId: 'grammar' });
    }
  }, [grammarPanelWanted, workspaceDispatch]);

  /* A running drill is priority 1 in the resolution order — it recomposes the layout. */
  const { setActivePractice } = workspace;
  React.useEffect(() => {
    setActivePractice(
      preferences.dictationMode ? 'dictation' : preferences.shadowingMode ? 'shadowing' : null,
    );
  }, [preferences.dictationMode, preferences.shadowingMode, setActivePractice]);

  /*
    A drill started from a layout that has no panel for it. The running drill is raised by
    the layout resolver (priority 1), but only if the layout HAS that block — Watch has none,
    so turning dictation on there hid the line and offered no way to type or reveal it
    (subtitle audit 9d). The block is added to the layout HIDDEN: the resolver then shows it
    exactly while the drill runs and hides it again when the drill stops, in whatever layout
    the user is in, with no state here to fall out of step.
  */
  const practiceBlockId = preferences.dictationMode
    ? 'dictation'
    : preferences.shadowingMode ? 'shadowing' : null;
  React.useEffect(() => {
    if (!practiceBlockId) return;
    const current = workspaceRef.current;
    if (current.workspace.blocks.some((block) => block.blockId === practiceBlockId)) return;
    current.dispatch({
      type: 'open-block',
      blockId: practiceBlockId,
      placement: 'bottom',
      presence: 'hidden',
    });
  }, [practiceBlockId, workspace.workspace.id]);

  /*
    A word lookup is what opens the dictionary block, so that the popup's position is a
    workspace decision rather than a hardcoded corner. The popup itself is unchanged.
  */
  React.useEffect(() => {
    if (popup) workspaceTrigger('word-click');
  }, [popup, workspaceTrigger]);

  /**
   * Mine the line on screen.
   *
   * Two things, in this order, and the order matters: the export fires first through
   * `mineSignal` — unchanged behaviour, and what `videoMineShortcut.test.tsx` asserts —
   * then the card surface is brought up so the result is visible. Reversing them would
   * make the shortcut depend on a panel having mounted.
   */
  const mineCurrentLine = React.useCallback((): void => {
    if (!activeCueRef.current) return;
    setMineSignal((value) => value + 1);
    workspaceTrigger('mine');
  }, [workspaceTrigger]);

  /**
   * The whole episode as a sentence deck. The track on screen is handed over as
   * it is shown — the user's delay applied — so the deck is cut from the lines
   * the user has been reading; the dialog also offers every other track the file
   * has. Only a local file can be cut, so a stream gets no button.
   */
  const sentenceDeckPath = localFilePath || playbackInfo?.localFile?.path || '';
  const makeSentenceDeck = React.useCallback((): void => {
    if (!sentenceDeckPath) return;
    video?.pause();
    // The dialog mounts on the page, which a fullscreen player element would cover.
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
    const shift = (cue: VideoCoreActiveCue) => ({
      startMs: Math.max(0, Math.round(cue.startMs + subtitleDelaySec * 1000)),
      endMs: Math.max(0, Math.round(cue.endMs + subtitleDelaySec * 1000)),
      text: cue.text,
    });
    const secondaryEntry = tracks.find((entry) => entry.number === secondaryTrack);
    void openSentenceDeckDialog({
      videoPath: sentenceDeckPath,
      ...(allCues.length
        ? {
          playerTrack: {
            label: selectedTrackLabel,
            cues: allCues.map(shift),
            ...(secondaryCues.length
              ? {
                secondary: {
                  label: secondaryEntry ? trackLabel(secondaryEntry, t) : t('mediaWorkspace.study.secondarySubs'),
                  cues: secondaryCues.map(shift),
                },
              }
              : {}),
          },
        }
        : {}),
    });
  }, [sentenceDeckPath, video, subtitleDelaySec, tracks, secondaryTrack, allCues, secondaryCues, selectedTrackLabel, t]);

  /* ------------------------------------------------------------------------------ *
   * Detached blocks
   *
   * A block that has been moved to its own window is fed from here and drives the
   * player from there. Nothing below runs at all until a window is actually open —
   * `useStudyDetach` publishes on an interval only while one exists, so the normal
   * case (nothing detached) costs one `useState` and no IPC.
   * ------------------------------------------------------------------------------ */

  /*
    Duration as state, updated on the two events that change it. Deliberately NOT read
    during render from `video.duration` the way the media-info block used to: that only
    appeared to work because the overlay re-renders constantly, and it made the block
    depend on an element a detached window does not have.
  */
  const [durationSec, setDurationSec] = React.useState(0);
  React.useEffect(() => {
    if (!video) {
      setDurationSec(0);
      return undefined;
    }
    const read = (): void => {
      setDurationSec(Number.isFinite(video.duration) ? video.duration : 0);
    };
    read();
    video.addEventListener('loadedmetadata', read);
    video.addEventListener('durationchange', read);
    return () => {
      video.removeEventListener('loadedmetadata', read);
      video.removeEventListener('durationchange', read);
    };
  }, [video]);

  const mediaName = React.useMemo(() => mediaDisplayName(playbackInfo), [playbackInfo]);

  const detachFrame: StudyDetachFrame = {
    mediaName,
    episode: playbackInfo?.episode?.episodeNumber ?? null,
    streamType: String(playbackInfo?.streamType ?? ''),
    playbackRate: preferences.playbackRate,
    activeIndex: activeCue?.index ?? null,
    trackLabel: selectedTrackLabel,
    trackCount: tracks.length,
    audioTrackCount: audioTracks.length,
    subtitleDelaySec,
    studyLang,
    analysis: cueAnalysis.state,
    selectedAnnotation,
    aiMode,
    translation,
    translationBusy,
    miningSource,
    mineSignal,
  };

  const detach = useStudyDetach({
    surface: 'workspace',
    layout: workspace.layout,
    dispatch: workspaceDispatch,
    frame: detachFrame,
    cues: allCues,
    readMedia: () => ({
      positionSec: video?.currentTime ?? 0,
      durationSec: video && Number.isFinite(video.duration) ? video.duration : 0,
      paused: video ? video.paused : true,
    }),
    handlers: {
      seekCue: (index) => {
        const cue = allCuesRef.current.find((entry) => entry.index === index);
        if (cue) seekTranscriptCue(cue);
      },
      togglePlay: () => {
        if (!video) return;
        if (video.paused) void video.play().catch(() => undefined);
        else video.pause();
      },
      replayLine: () => replayCue(activeCueRef.current),
      analyzeNow: () => cueAnalysis.analyzeNow(),
      selectAnnotation: setSelectedAnnotation,
      // The card opens over the player, anchored where a lookup from the grammar dock
      // would put it — the detached panel has no coordinates in this window to offer.
      lookup: (query, context) => setPopup({ query, x: 24, y: 96, context }),
      setAiMode,
      translate: () => void translateCue(),
      mine: mineCurrentLine,
    },
  });

  /** Track selection, over whichever manager is driving this session. */
  const selectSubtitleTrack = React.useCallback((trackNumber: number | null): void => {
    if (trackNumber == null) {
      if (manager) manager.setNoTrack();
      else mediaCaptionsManager?.setNoTrack();
      return;
    }
    if (manager) void manager.selectTrack(trackNumber);
    else void mediaCaptionsManager?.selectTrack(trackNumber);
  }, [manager, mediaCaptionsManager]);

  /**
   * A track the USER picked in the study bar: selected, and remembered for this file and its
   * series so the next episode opens on it (see `pickStudyPrimaryTrack`).
   */
  const chooseSubtitleTrack = React.useCallback((trackNumber: number | null): void => {
    selectSubtitleTrack(trackNumber);
    const track = trackNumber == null
      ? null
      : tracks.find((entry) => entry.number === trackNumber) ?? null;
    rememberStudyTrackChoice(subtitleSource, track);
  }, [selectSubtitleTrack, subtitleSource, tracks]);

  /*
    The study line is the STUDY language by default (subtitle audit 6a/6g: a release with a
    Japanese and an English track opened on English, VideoCore's upstream preference). The
    slice seeds VideoCore's preferred-language setting so its own first pick is already right;
    this is the check behind it, and the only place a remembered per-file/series choice is
    applied. It runs once per file and track list — a track mounted later (the sidecar, the
    English helper) re-asks, a user's pick in any menu never meets a correction.

    MediaCaptions picks its default only after loading its tracks, and a selection made
    before then is dropped ("Track not loaded"), so under that manager this waits for its
    first pick.
  */
  const trackCorrectionRef = React.useRef('');
  React.useEffect(() => {
    if (!tracks.length) return;
    if (!manager && selectedTrack == null) return;
    const signature = `${delayKey}|${tracks
      .map((track) => `${track.number}:${track.language ?? ''}:${track.label ?? ''}`)
      .join(',')}`;
    if (trackCorrectionRef.current === signature) return;
    trackCorrectionRef.current = signature;
    const pick = pickStudyPrimaryTrack(
      tracks,
      studyLang,
      loadStudyTrackChoice(subtitleSource),
      selectedTrack,
    );
    if (pick === undefined || pick === selectedTrack) return;
    selectSubtitleTrack(pick);
  }, [delayKey, manager, selectSubtitleTrack, selectedTrack, studyLang, subtitleSource, tracks]);

  /*
    Same candidate rule as the effect that picks the default: event and file tracks while
    SubtitleManager drives, any track under MediaCaptions. A stricter filter in the picker
    than in the chooser left the automatically chosen track absent from its own list.
  */
  const secondaryTrackCandidates = React.useMemo(
    () => tracks.filter((track) => (
      track.number !== selectedTrack
      && (!manager || track.type === 'event' || track.type === 'file')
    )),
    [manager, selectedTrack, tracks],
  );

  /**
   * What each block draws. The workspace decides which of these are on screen.
   *
   * Adding a Study Block is: a definition in `studyBlockRegistry.ts`, an entry here.
   * No layout code changes — that is the "new blocks without redesigning the player"
   * acceptance criterion, made structural.
   */
  const blockRenderers: BlockRenderers = {
    grammar: (
      <VideoCoreGrammarPanel
        state={cueAnalysis.state}
        lang={studyLang}
        selectedIndex={selectedAnnotation}
        onSelectedIndexChange={setSelectedAnnotation}
        onAnalyzeNow={cueAnalysis.analyzeNow}
        onLookup={(surface, context) => {
          // Anchored to the grammar block's own edge, not the middle of the screen:
          // the lookup was opened from that panel, and a card that appears dead-centre
          // over the picture reads as a modal rather than as an answer.
          const panel = document.querySelector('[data-block="grammar"]');
          const rect = panel?.getBoundingClientRect();
          setPopup({
            query: surface,
            x: rect ? rect.right + 12 : 24,
            y: rect ? rect.top + 24 : 96,
            context,
          });
        }}
      />
    ),
    /*
      One component serves `cardEditor` and `cardPreview`: the mining panel IS the card,
      and splitting it would be two implementations of one form. `cardEditor` is the
      block that stays mounted (see StudyDocks) because the mine shortcut reaches into
      it; `cardPreview` is what a contextual `mine` trigger opens.
    */
    cardEditor: (
      <VideoCoreMiningPanel
        cue={activeCue}
        displayText={plainText}
        source={miningSource}
        video={video}
        subtitleDelaySec={subtitleDelaySec}
        /*
          The same second line that is on screen, so the card is captioned with the
          translation the user was actually reading. Gated on `dualSubs` rather than
          passed unconditionally: with the second line switched off there is nothing the
          user has read and agreed with.
        */
        translationText={preferences.dualSubs ? secondaryText : ''}
        mineSignal={mineSignal}
        defaultExpanded={workspace.layout.mode === 'mining'}
      />
    ),
    transcript: (
      <VideoCoreTranscriptPanel
        cues={allCues}
        activeIndex={activeCue?.index ?? null}
        lang={studyLang}
        trackLabel={selectedTrackLabel}
        trackNotice={transcriptTrackNotice}
        onSeek={seekTranscriptCue}
        onClose={() => {
          // The user closed it: that is the one "off" that hides a layout's own rail too.
          updatePreference('transcriptPanel', false);
          workspaceDispatch({ type: 'close-block', blockId: 'transcript' });
        }}
      />
    ),

    /*
      Dictation and shadowing used to render inside `.study-cue-overlay`, stacked under
      the subtitle with the suggestion cards. That is why a shadowing session pushed the
      line up the picture. They are blocks now — moved verbatim, same state, same
      handlers — so Practice Mode can make them dominant and Watch Mode can not show
      them at all.
    */
    dictation: activeCue ? (
      <div className="study-dictation">
        <input
          lang="ja"
          value={dictationInput}
          onChange={(event) => setDictationInput(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') checkDictation();
          }}
          placeholder={t('mediaWorkspace.study.typeWhatYouHear')}
          aria-label={t('mediaWorkspace.study.dictationAnswer')}
          autoComplete="off"
        />
        <button type="button" disabled={!dictationInput.trim()} onClick={checkDictation}>
          {t('mediaWorkspace.study.check')}
        </button>
        <button type="button" onClick={() => setDictationRevealed(true)}>
          {t('mediaWorkspace.study.reveal')}
        </button>
        {dictationResult && (
          <span className={dictationResult.exact ? 'is-correct' : ''} role="status">
            {dictationResult.exact
              ? t('mediaWorkspace.study.exactMatch')
              : t('mediaWorkspace.study.matchScore', { score: dictationResult.score })}
          </span>
        )}
        {dictationRevealed && dictationResult && !dictationResult.exact
          && evaluateJapaneseDictation(dictationInput, plainText).score === dictationResult.score && (
          <span className="study-dictation-diff" lang="ja">
            {markMissedDictation(dictationInput, plainText).map((mark, index) => (
              mark.missed ? <mark key={index}>{mark.text}</mark> : <span key={index}>{mark.text}</span>
            ))}
          </span>
        )}
        {missedLines.length > 0 && (
          <details className="study-dictation-missed">
            <summary>{t('mediaWorkspace.study.missedLines', { count: missedLines.length })}</summary>
            <ul>
              {missedLines.map((line) => (
                <li key={line.key}>
                  <button type="button" onClick={() => seekCue(line.cue)}>
                    {stripAssCueText(line.cue.text)}
                  </button>
                  <span>{t('mediaWorkspace.study.matchScore', { score: line.score })}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    ) : null,

    shadowing: activeCue ? (
      <section
        className="study-shadowing"
        aria-label={t('mediaWorkspace.study.shadowPractice')}
        data-shadow-recording={shadowRecording ? 'recording' : 'idle'}
        data-shadow-response={shadowAudioUrl ? 'ready' : 'none'}
      >
        <div className="study-shadowing-copy">
          <strong>{t('mediaWorkspace.study.shadowPractice')}</strong>
          <span>{t('mediaWorkspace.study.shadowInstructions')}</span>
        </div>
        <div className="study-shadowing-actions">
          <button type="button" onClick={() => replayCue(activeCue)}>
            {t('mediaWorkspace.study.replayOriginal')}
          </button>
          {!shadowRecording ? (
            <button type="button" onClick={() => void startShadowRecording()}>
              {t(shadowAudioUrl
                ? 'mediaWorkspace.study.recordAgain'
                : 'mediaWorkspace.study.recordResponse')}
            </button>
          ) : (
            <button type="button" onClick={stopShadowRecording}>
              {t('mediaWorkspace.study.stopRecording')}
            </button>
          )}
          {shadowAudioUrl && (
            <button type="button" onClick={clearShadowRecording}>
              {t('mediaWorkspace.study.discardResponse')}
            </button>
          )}
          {shadowRecording && (
            <span className="study-shadowing-live">
              {t('mediaWorkspace.study.recordingLimit')}
            </span>
          )}
        </div>
        {shadowAudioUrl && (
          <audio
            className="study-shadowing-audio"
            aria-label={t('mediaWorkspace.study.shadowPlayback')}
            controls
            preload="metadata"
            src={shadowAudioUrl}
          />
        )}
        {shadowError && (
          <p className="study-shadowing-error" role="alert">{shadowError}</p>
        )}
      </section>
    ) : null,

    listening: (
      <ListeningBlock
        preferences={preferences}
        updatePreference={updatePreference}
        onReplay={() => replayCue(activeCueRef.current)}
        cueKey={`${activeCue?.trackNumber ?? -1}:${activeCue?.index ?? -1}`}
      />
    ),

    aiWorkspace: (
      <AiWorkspaceBlock
        mode={aiMode}
        onModeChange={setAiMode}
        hasCue={!!activeCue}
        translation={translation}
        translationBusy={translationBusy}
        onTranslate={() => void translateCue()}
        analysis={(
          <VideoCoreGrammarPanel
            state={cueAnalysis.state}
            lang={studyLang}
            selectedIndex={selectedAnnotation}
            onSelectedIndexChange={setSelectedAnnotation}
            onAnalyzeNow={cueAnalysis.analyzeNow}
            onLookup={(surface, context) => setPopup({
              query: surface,
              x: 24,
              y: 96,
              context,
            })}
          />
        )}
      />
    ),

    miningQueue: <MiningQueueBlock mineSignal={mineSignal} />,

    studyHud: (
      <StudyHudBlock
        cue={activeCue}
        cueCount={allCues.length}
        trackLabel={selectedTrackLabel}
        subtitleDelaySec={subtitleDelaySec}
        playbackRate={preferences.playbackRate}
        source={miningSource}
        mineSignal={mineSignal}
      />
    ),

    mediaInfo: (
      <MediaInfoBlock
        name={mediaName}
        episodeNumber={playbackInfo?.episode?.episodeNumber ?? null}
        streamType={String(playbackInfo?.streamType ?? '')}
        durationSec={durationSec}
        trackCount={tracks.length}
        audioTrackCount={audioTracks.length}
      />
    ),

    /*
      Real features that live elsewhere in this app. The block routes to the surface
      that owns them; it does not grow a second implementation inside the player, and
      the registry marks anything with no such surface `planned` so it is never offered
      at all — see `studyBlockRegistry.ts`.
    */
    notes: <StudyAppOwnedBlock blockId="notes" titleKey="studyWorkspace.block.notes" />,
    library: <StudyAppOwnedBlock blockId="library" titleKey="studyWorkspace.block.library" />,
    statistics: (
      <StudyAppOwnedBlock blockId="statistics" titleKey="studyWorkspace.block.statistics" />
    ),
    review: <StudyAppOwnedBlock blockId="review" titleKey="studyWorkspace.block.review" />,
  };

  /*
   * "No subtitle track is loaded." only once that is settled: a track mounts a moment after
   * the video does, so the bare condition was true for 0.5-1.9 s on EVERY open and flashed
   * the notice over files that do have subtitles (transition audit 2026-09-23).
   */
  const noCuesNow = !activeCue && allCues.length === 0 && !externalSubtitlePending;
  const [noSubtitlesSettled, setNoSubtitlesSettled] = React.useState(false);
  /** Dual subtitles on, but neither a track nor the translator can supply a second line. */
  const showSecondaryUnavailable = secondaryLineUnavailable({
    dualSubs: preferences.dualSubs,
    hasCues: allCues.length > 0,
    hasSecondaryTrack: secondaryTrack != null,
    secondaryText,
    translatorFailed: secondaryTranslateFailed,
    secondaryLang: preferences.secondarySubLang,
    studyLang,
  });
  React.useEffect(() => {
    setNoSubtitlesSettled(false);
    if (!noCuesNow) return undefined;
    const timer = window.setTimeout(() => setNoSubtitlesSettled(true), 3000);
    return () => window.clearTimeout(timer);
  }, [noCuesNow, playbackInfo?.id]);

  return (
    <StudyDetachContext.Provider value={detach}>
      <aside
        className="study-cue-overlay"
        // The study language, so the line takes a Japanese face rather than a per-glyph
        // fallback (Noto Sans SC was measured drawing Japanese text, 2026-09-23).
        lang={studyLang}
        data-study-active-cue={activeCue ? 'present' : 'none'}
        data-cue-index={activeCue?.index}
        data-cue-track={activeCue?.trackNumber}
        data-cue-start-ms={activeCue?.startMs}
        data-cue-end-ms={activeCue?.endMs}
        data-secondary-track={secondaryTrack ?? undefined}
        data-secondary-cue-count={secondaryCues.length}
        data-secondary-active-cue={activeSecondaryCues[0]?.index}
        data-grammar-highlight={annotated ? 'on' : 'off'}
        // Where the band sits: lifted above its floor by the user's position setting, or at
        // the top of the picture. The floor itself is CSS (`--study-cue-bottom`) and only
        // ever gets added to — see `subtitlePlacementStyle`.
        data-study-cue-position={preferences.subtitleAtTop ? 'top' : 'bottom'}
        style={subtitlePlacementStyle(preferences) as React.CSSProperties}
      >
        {activeCue && preferences.primarySubs && !preferences.subtitlesHidden && (!preferences.dictationMode || dictationRevealed) ? (
          <SubtitleCueLine
            /*
              `sa-palette` carries the category hues from sentenceAnalysis.css so
              a highlighted span means the same colour here as in the panel's
              legend. The background sits on the LINE, not on the overlay
              wrapper — the wrapper also holds the timing readout, the dictation
              box and the shadowing controls, and boxing all of that in one black
              rectangle is not what a subtitle background is.
            */
            className="study-cue-text sa-palette"
            style={cueBoxStyle(preferences, 'primary', studyLangTag(studyLang, getChineseScript()))}
            text={annotated ? annotated.sentence : plainText}
            annotations={annotated?.annotations}
            selectedAnnotation={selectedAnnotation}
            onSelectAnnotation={setSelectedAnnotation}
            furigana={preferences.furigana}
            lang={studyLang}
            knownHighlight={preferences.knownHighlight}
            levelBadge={cueLevel}
            onMouseDown={(event) => {
              popupOpenOnDownRef.current = !!popup;
              noteLookupPointerDown(event);
            }}
            onMouseUp={handleLookupMouseUp}
          />
        ) : preferences.subtitlesHidden && activeCue ? (
          /* Said once, then faded (the same CSS as the no-subtitles notice), so a stray V
             press never reads as "the subtitles broke". */
          <span className="study-cue-status" data-study-cue-status="none" data-study-subs-hidden>
            {t('mediaWorkspace.study.subtitlesHidden', { key: shortcutKeysFor('video.toggleSubtitles') || 'V' })}
          </span>
        ) : preferences.dictationMode && activeCue ? (
          <span className="study-cue-status">{t('mediaWorkspace.study.listenType')}</span>
        ) : noCuesNow && noSubtitlesSettled ? (
          /* A file with no subtitle track says so once and then fades (CSS), rather than
             standing faint grey text over the picture for the whole video. Between two
             lines there is nothing to say: "Waiting for subtitle" in every pause in the
             dialogue read as something being wrong (audit 2026-09-23). */
          <span className="study-cue-status" data-study-cue-status="none">
            {t('mediaWorkspace.study.transcriptEmpty')}
          </span>
        ) : null}

        {activeCue && preferences.cueTimingReadout && !preferences.subtitlesHidden && (
          <span className="study-cue-timing">
            {t('mediaWorkspace.mining.cueMeta', {
              cue: activeCue.index + 1,
              start: formatWatchLoopTimestamp(activeCue.startMs),
              end: formatWatchLoopTimestamp(activeCue.endMs),
            })}
          </span>
        )}

        {preferences.dualSubs && !preferences.subtitlesHidden && secondaryText && (
          <p
            className="study-cue-secondary"
            lang={preferences.secondarySubLang}
            style={cueBoxStyle(preferences, 'secondary')}
          >
            {secondaryText}
          </p>
        )}

        {showSecondaryUnavailable && (
          /* Said once, then faded by the same rule as the no-subtitles notice: a blank where
             the user switched on a second line reads as the feature being broken. */
          <span
            className="study-cue-status"
            data-study-cue-status="none"
            data-study-secondary-status="unavailable"
          >
            {t('mediaWorkspace.study.noSecondLine')}
          </span>
        )}

        {preferences.dualSubs && !preferences.subtitlesHidden && secondaryIsFallback && (
          /* The second line is in another language than the one chosen: said once, faded
             like the notice above, so the choice does not look silently ignored. */
          <span
            className="study-cue-status"
            data-study-cue-status="none"
            data-study-secondary-status="fallback"
          >
            {t('mediaWorkspace.study.secondLineFallback', {
              language: SECONDARY_SUB_LANG_LABELS[preferences.secondarySubLang]
                ?? preferences.secondarySubLang,
              shown: SECONDARY_SUB_LANG_LABELS[secondaryTrackLang]
                ?? (secondaryTrackEntry ? trackLabel(secondaryTrackEntry, t) : secondaryTrackLang),
            })}
          </span>
        )}


        {showShadowingSuggestion && activeCue && replaySignal && (
          <section
            className="study-shadowing-suggestion"
            aria-label={t('mediaWorkspace.study.shadowRecommendation')}
            data-shadowing-suggestion="visible"
            data-replay-count={replaySignal.replayCount}
          >
            <div>
              <strong>{t('mediaWorkspace.study.shadowWorth')}</strong>
              <span>
                {t('mediaWorkspace.study.replayedTimes', {
                  count: replaySignal.replayCount,
                })}
              </span>
            </div>
            <div className="study-shadowing-suggestion-actions">
              <button
                type="button"
                onClick={() => {
                  setReplaySignal((current) =>
                    dismissVideoCoreShadowingSuggestion(current));
                  updatePreference('dictationMode', false);
                  updatePreference('shadowingMode', true);
                }}
              >
                {t('mediaWorkspace.study.startShadowing')}
              </button>
              <button
                type="button"
                onClick={() => setReplaySignal((current) =>
                  dismissVideoCoreShadowingSuggestion(current))}
              >
                {t('mediaWorkspace.study.notNow')}
              </button>
            </div>
          </section>
        )}

        {showComprehensionRescue && activeCue && comprehensionSignal && rescueScene && (
          <section
            className="study-shadowing-suggestion study-comprehension-rescue"
            aria-label={t('mediaWorkspace.study.comprehensionRescue')}
            data-comprehension-rescue="visible"
            data-lookup-count={comprehensionSignal.lookupCount}
            data-rewind-count={comprehensionSignal.rewindCount}
            data-pause-count={comprehensionSignal.pauseCount}
            data-scene-first-cue={rescueScene.firstCueIndex}
            data-scene-last-cue={rescueScene.lastCueIndex}
          >
            <div>
              <strong>{t('mediaWorkspace.study.slowerPass')}</strong>
              <span>
                {t('mediaWorkspace.study.activityCluster', {
                  lookups: comprehensionSignal.lookupCount,
                  rewinds: comprehensionSignal.rewindCount,
                })}
              </span>
            </div>
            <div className="study-shadowing-suggestion-actions">
              <button
                type="button"
                onClick={() => {
                  if (!video) return;
                  setComprehensionSignal((current) =>
                    dismissVideoCoreComprehensionSuggestion(current));
                  setAbStartSec(rescueScene.startSec);
                  setAbEndSec(rescueScene.endSec);
                  setAbLoop(true);
                  updatePreference('loopLine', false);
                  markProgrammaticSeek(rescueScene.startSec);
                  video.currentTime = rescueScene.startSec;
                  void video.play();
                }}
              >
                {t('mediaWorkspace.study.loopScene', {
                  count: rescueScene.cueCount,
                })}
              </button>
              <button
                type="button"
                onClick={() => setComprehensionSignal((current) =>
                  dismissVideoCoreComprehensionSuggestion(current))}
              >
                {t('mediaWorkspace.study.notNow')}
              </button>
            </div>
          </section>
        )}

        {showTimingRepair && timingSignal && timingDrift && (
          <section
            className="study-shadowing-suggestion study-timing-repair"
            aria-label={t('mediaWorkspace.study.timingRepair')}
            data-timing-repair="visible"
            data-timing-changes={timingSignal.changeCount}
            data-timing-drift-ms={timingDrift.msPerMinute}
            data-timing-span-sec={timingDrift.spanSec}
          >
            <div>
              <strong>{t('mediaWorkspace.study.timingDrifts')}</strong>
              <span>
                {t('mediaWorkspace.study.timingDriftEvidence', {
                  count: timingSignal.changeCount,
                  minutes: Math.max(1, Math.round(timingDrift.spanSec / 60)),
                  rate: (Math.abs(timingDrift.msPerMinute) / 1000).toFixed(2),
                })}
              </span>
            </div>
            <div className="study-shadowing-suggestion-actions">
              <button type="button" onClick={() => setDriftTracking(true)}>
                {t('mediaWorkspace.study.trackDrift')}
              </button>
              <button
                type="button"
                onClick={() => setTimingSignal((current) =>
                  dismissVideoCoreTimingRepair(current))}
              >
                {t('mediaWorkspace.study.notNow')}
              </button>
            </div>
          </section>
        )}

        {driftTracking && timingDrift && (
          <section
            className="study-shadowing-suggestion study-timing-repair"
            aria-label={t('mediaWorkspace.study.timingTracking')}
            data-timing-tracking="active"
            data-timing-delay={subtitleDelaySec.toFixed(2)}
          >
            <div>
              <strong>{t('mediaWorkspace.study.timingTracking')}</strong>
              <span>
                {t('mediaWorkspace.study.timingTrackingNote', {
                  rate: (Math.abs(timingDrift.msPerMinute) / 1000).toFixed(2),
                  delay: `${subtitleDelaySec >= 0 ? '+' : ''}${subtitleDelaySec.toFixed(2)}`,
                })}
              </span>
            </div>
            <div className="study-shadowing-suggestion-actions">
              <button type="button" onClick={stopDriftTracking}>
                {t('mediaWorkspace.study.stopTrackingDrift')}
              </button>
            </div>
          </section>
        )}


        {/*
          Suppressed when it would restate the second line. Both now render in the chosen
          second-line language, so on a cue whose second line is already showing, pressing
          Translate line otherwise paints the same sentence twice — the doubled-subtitle
          complaint this whole change set exists to fix, reintroduced one row lower.
        */}
        {translation && translation !== secondaryText && (
          <p className="study-cue-translation" lang={preferences.secondarySubLang}>
            {translation}
          </p>
        )}
      </aside>

      {/*
        The bar replaces `.study-control-dock`. Every control that was in the dock's
        four rows is inside it, moved rather than retyped, with its handler and its
        `data-study-*` hook intact — see `StudyBottomBar`'s header for the accounting.
      */}
      <StudyBottomBar
        barRef={dockRef}
        hasCues={allCues.length > 0}
        hasActiveCue={!!activeCue}
        subtitleLoading={externalSubtitlePending}
        onImportSubtitleFile={(file) => void importSubtitleFile(file)}
        onPrevCue={() => jumpCue(-1)}
        onReplayCue={() => replayCue(activeCue)}
        onNextCue={() => jumpCue(1)}
        video={video}
        preferences={preferences}
        updatePreference={updatePreference}
        subtitleDelaySec={subtitleDelaySec}
        onChangeSubtitleDelay={changeSubtitleDelay}
        onResetSubtitleDelay={resetSubtitleDelay}
        onApplyDelayToSeries={subtitleSource.mediaId != null ? () => {
          if (saveSeriesSubtitleDelay(subtitleSource, subtitleDelaySec)) {
            window.dispatchEvent(new CustomEvent('os:toast', { detail: { message: t('mediaWorkspace.study.delayAppliedToSeries'), kind: 'ok' } }));
          }
        } : undefined}
        onResetSubtitleAppearance={() => setPreferences(resetSubtitleAppearance)}
        onExportSubtitles={allCues.length > 0 ? exportSubtitles : undefined}
        shortcutKeysFor={shortcutKeysFor}
        pauseOnLookup={pauseOnLookup}
        setPauseOnLookup={setPauseOnLookup}
        onTranslateLine={() => void translateCue()}
        translationBusy={translationBusy}
        onMineCurrentLine={mineCurrentLine}
        onMakeSentenceDeck={sentenceDeckPath ? makeSentenceDeck : undefined}
        practiceMode={practiceMode}
        setPracticeMode={setPracticeMode}
        abStartSec={abStartSec}
        abEndSec={abEndSec}
        abLoop={abLoop}
        onSetA={() => setAbStartSec(video?.currentTime ?? null)}
        onSetB={() => setAbEndSec(video?.currentTime ?? null)}
        onToggleAbLoop={setAbLoop}
        onClearAb={() => {
          setAbStartSec(null);
          setAbEndSec(null);
          setAbLoop(false);
        }}
        tracks={tracks}
        selectedTrack={selectedTrack}
        onSelectTrack={chooseSubtitleTrack}
        secondaryTrack={secondaryTrack}
        onSelectSecondaryTrack={setSecondaryTrack}
        secondaryTrackCandidates={secondaryTrackCandidates}
        trackLabelOf={(track) => trackLabel(track, t)}
        audioTracks={audioTracks}
        selectedAudioTrack={selectedAudioTrack}
        onSelectAudioTrack={(trackNumber) => audioManager?.selectTrack(trackNumber)}
        whisperDevice={whisperDevice}
        onWhisperDeviceChange={persistWhisperDevice}
        whisperModel={whisperModel}
        onWhisperModelChange={(tier) => {
          setWhisperModel(tier);
          setWhisperModelTier(tier);
        }}
        whisperLanguage={whisperLanguage}
        onWhisperLanguageChange={(language) => {
          setWhisperLanguage(language);
          setStudyLang(language);
        }}
        whisperBusy={whisperBusy}
        whisperCanGenerate={!!manager && !!playbackInfo?.localFile?.path}
        whisperState={whisperState}
        whisperMessage={whisperMessage}
        whisperError={whisperError}
        whisperProgress={whisperProgress}
        onGenerateSubtitles={() => void runWhisperGeneration()}
        onStopGeneration={stopWhisperGeneration}
      />

      {/*
        The docks. Mining and the transcript used to be hardcoded into one right-hand
        rail and the grammar card into a left column, each deciding for itself whether
        to exist. They are now placed by the workspace, which is what makes Watch Mode
        able to have no side column at all while keeping every one of them one action
        away.
      */}
      <StudyDocks renderers={blockRenderers} />

      <StudyWorkspaceCustomizer />

      {popup && (
        <DictionaryPopup
          query={popup.query}
          x={popup.x}
          y={popup.y}
          anchorTop={popup.top}
          context={popup.context}
          // Keep the lookup off whatever is docked on the right. Asked of the LAYOUT
          // rather than of the transcript preference: the right dock can now be held
          // by the card editor, the AI workspace or the mining queue, and reading one
          // block's preference would put the popup under any of the others.
          rightInsetPx={workspace.layout.hasRightDock ? rightDockInsetPx() : 0}
          onClose={() => setPopup(null)}
        />
      )}
    </StudyDetachContext.Provider>
  );
}

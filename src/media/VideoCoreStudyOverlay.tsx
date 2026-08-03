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
  SubtitleManagerTrackSelectedEvent,
  SubtitleManagerTracksLoadedEvent,
  VideoCoreActiveCue,
} from '@/app/(main)/_features/video-core/video-core-subtitles';
import type { AudioManagerTrackChangedEvent } from '@/app/(main)/_features/video-core/video-core-audio';
import type {
  MKVParser_SubtitleEvent,
  MKVParser_TrackInfo,
} from '../../vendor/seanime/generated/types';
import {
  WHISPER_MODEL_SPECS,
  type WhisperModelTier,
} from '../shared/whisperModels';
import DictionaryPopup from '../renderer/components/DictionaryPopup';
import SubtitleCueLine from '../renderer/components/SubtitleCueLine';
import {
  isLookupClick,
  lookupWordFromMouseUp,
  noteLookupPointerDown,
} from '../renderer/wordLookup';
import { translate } from '../renderer/translator';
import { registerCommandHandler } from '../renderer/keyboardShortcuts';
import { t as translateUi, useT } from '../renderer/i18n';
import { getStudyLang, setStudyLang } from '../renderer/studyEnvironment';
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
import { markTierDownloaded } from '../renderer/whisperModelCache';
import WhisperWorker from '../renderer/whisperWorker?worker';
import {
  activeStudyCuesAtTime,
  adjacentStudyCue,
  clampStudyPlaybackRate,
  cuePlaybackStartSec,
  dismissVideoCoreComprehensionSuggestion,
  dismissVideoCoreShadowingSuggestion,
  dismissVideoCoreTimingRepair,
  evaluateVideoCoreDictation,
  isCueEndTransition,
  nextVideoCoreWhisperTrackNumber,
  normalizeVideoCoreStudyPreferences,
  PLAYER_PREFERENCES_STORAGE_KEY,
  recordVideoCoreComprehensionEvent,
  recordVideoCoreCueReplay,
  recordVideoCoreTimingAdjustment,
  resolveStudyLoopSeekSec,
  shouldSuggestVideoCoreComprehensionRescue,
  shouldSuggestVideoCoreShadowing,
  shouldSuggestVideoCoreTimingRepair,
  stripAssCueText,
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
} from '../shared/videoCoreStudy';
import type { VideoCoreMiningSource } from '../shared/videoCoreMining';
import {
  mediaCaptionCues,
  normalizeMediaCaptionTracks,
} from './mediaCaptionStudyAdapter';
import VideoCoreMiningPanel from './VideoCoreMiningPanel';

const RATE_PRESETS = [0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5] as const;

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
  message?: string;
  cues?: Array<{ start: number; end: number; text: string }>;
};

type CuePopup = {
  query: string;
  x: number;
  y: number;
  context: string;
};

/** One enum over the two mutually exclusive stored booleans. See `setPracticeMode`. */
type PracticeMode = 'off' | 'dictation' | 'shadowing';

interface Props {
  playbackInfo: VideoCore_VideoPlaybackInfo | null;
  onManagerReady?: (managerClass: string) => void;
  onCueChange?: (event: SubtitleManagerCueChangeEvent) => void;
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
  onManagerReady,
  onCueChange,
}: Props): React.ReactElement {
  const { t } = useT();
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
  const [abStartSec, setAbStartSec] = React.useState<number | null>(null);
  const [abEndSec, setAbEndSec] = React.useState<number | null>(null);
  const [abLoop, setAbLoop] = React.useState(false);
  const popupOpenOnDownRef = React.useRef(false);
  const previousCueRef = React.useRef<VideoCoreActiveCue | null>(null);
  const secondaryCuesRef = React.useRef<VideoCoreActiveCue[]>([]);
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
    React.useState<'ja' | 'zh'>(getStudyLang);
  const [whisperState, setWhisperState] =
    React.useState<WhisperGenerationState>('idle');
  const [whisperMessage, setWhisperMessage] = React.useState('');
  const [whisperProgress, setWhisperProgress] = React.useState(0);
  const [whisperError, setWhisperError] = React.useState('');
  // Collapsed by default. The dock's job during playback is the cue loop; tracks,
  // A–B and the Whisper pipeline are set once and then only get in the way.
  const [controlsExpanded, setControlsExpanded] = React.useState(false);

  const activeCue = activeCues[0] ?? null;
  // Mirrored so the keyboard listener does not have to rebind on every cue change.
  const activeCueRef = React.useRef(activeCue);
  activeCueRef.current = activeCue;
  // Same reason: the three toggle commands read the current value without the command
  // registrations having to rebind every time one of the preferences changes.
  const preferencesRef = React.useRef(preferences);
  preferencesRef.current = preferences;
  const plainText = activeCue ? stripAssCueText(activeCue.text) : '';
  const secondaryText = activeSecondaryCues
    .map((cue) => stripAssCueText(cue.text))
    .filter(Boolean)
    .join(' ');
  const miningSource = miningSourceFromPlayback(playbackInfo);
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

  React.useEffect(() => {
    localStorage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

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
    const sync = (): void => {
      setActiveCues(manager.getActiveCues());
      setAllCues(manager.getCues());
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
      setAllCues(manager.getCues());
      onCueChange?.(event);
    };
    const handleTracksLoaded = (event: SubtitleManagerTracksLoadedEvent): void => {
      setTracks(event.detail.tracks);
      setSelectedTrack(manager.getSelectedTrackNumberOrNull());
    };
    const handleTrackSelected = (event: SubtitleManagerTrackSelectedEvent): void => {
      setSelectedTrack(event.detail.trackNumber);
      setAllCues(manager.getCues());
    };
    const handleTrackDeselected = (): void => {
      setSelectedTrack(null);
      setAllCues([]);
      setActiveCues([]);
    };

    sync();
    manager.addEventListener('cuechange', handleCueChange);
    manager.addEventListener('tracksloaded', handleTracksLoaded);
    manager.addEventListener('trackselected', handleTrackSelected);
    manager.addEventListener('trackdeselected', handleTrackDeselected);
    return () => {
      manager.removeEventListener('cuechange', handleCueChange);
      manager.removeEventListener('tracksloaded', handleTracksLoaded);
      manager.removeEventListener('trackselected', handleTrackSelected);
      manager.removeEventListener('trackdeselected', handleTrackDeselected);
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

  React.useEffect(() => {
    if (manager || !mediaCaptionsManager) return;
    let cancelled = false;
    let selectedCues: VideoCoreActiveCue[] = [];
    let lastCueSignature = '';

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
      setActiveCues(cues);
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
        const cues = await mediaCaptionCues(mediaCaptionsManager, trackNumber);
        if (cancelled || mediaCaptionsManager.getSelectedTrackIndexOrNull() !== trackNumber) {
          return;
        }
        selectedCues = cues;
        setAllCues(cues);
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
    manager,
    mediaCaptionsManager,
    onCueChange,
    onManagerReady,
    playbackInfo,
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

  React.useEffect(() => {
    if (!manager) {
      setSecondaryTrack(null);
      return;
    }
    const candidates = tracks.filter(
      (track) => track.type === 'event' && track.number !== selectedTrack,
    );
    setSecondaryTrack((current) =>
      current != null && candidates.some((track) => track.number === current)
        ? current
        : candidates[0]?.number ?? null);
  }, [manager, selectedTrack, tracks]);

  React.useEffect(() => {
    if (!manager || !video || secondaryTrack == null) {
      secondaryCuesRef.current = [];
      setSecondaryCues([]);
      setActiveSecondaryCues([]);
      return;
    }
    const syncActive = (): void => {
      setActiveSecondaryCues(
        activeStudyCuesAtTime(
          secondaryCuesRef.current,
          video.currentTime,
          subtitleDelaySec,
        ),
      );
    };
    const refreshTimeline = (): void => {
      const cues = manager.getCuesForTrack(secondaryTrack);
      secondaryCuesRef.current = cues;
      setSecondaryCues(cues);
      syncActive();
    };
    refreshTimeline();
    manager.addEventListener('cuechange', refreshTimeline);
    video.addEventListener('timeupdate', syncActive);
    video.addEventListener('seeked', syncActive);
    return () => {
      manager.removeEventListener('cuechange', refreshTimeline);
      video.removeEventListener('timeupdate', syncActive);
      video.removeEventListener('seeked', syncActive);
    };
  }, [manager, secondaryTrack, subtitleDelaySec, video]);

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
    (cue: VideoCoreActiveCue | null): void => {
      if (!cue || !video) return;
      const target = cuePlaybackStartSec(cue, subtitleDelaySec);
      markProgrammaticSeek(target);
      video.currentTime = target;
      void video.play();
    },
    [markProgrammaticSeek, subtitleDelaySec, video],
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
      if (selectedTrack == null || !video) return;
      const positionSec = video.currentTime;
      setTimingSignal((current) =>
        recordVideoCoreTimingAdjustment(current, selectedTrack, positionSec, next));
    },
    [manager, selectedTrack, subtitleDelaySec, video],
  );

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
    ];
    return () => offs.forEach((off) => off());
  }, [changeSubtitleDelay, jumpCue, replayCue, updatePreference]);

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
        setTranslation(await translate(text, getStudyLang()));
      } catch {
        setTranslation(translateUi('mediaWorkspace.study.translationUnavailable'));
      } finally {
        setTranslationBusy(false);
      }
    },
    [plainText, translationBusy],
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
    setDictationResult(evaluateVideoCoreDictation(dictationInput, plainText));
  }, [dictationInput, plainText]);

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
        markTierDownloaded(whisperModel, device, whisperDevice);
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
          setAllCues(manager.getCues());
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
  const whisperBusy = whisperState === 'extracting'
    || whisperState === 'loading'
    || whisperState === 'transcribing';

  return (
    <>
      <aside
        className="study-cue-overlay"
        data-study-active-cue={activeCue ? 'present' : 'none'}
        data-cue-index={activeCue?.index}
        data-cue-track={activeCue?.trackNumber}
        data-cue-start-ms={activeCue?.startMs}
        data-cue-end-ms={activeCue?.endMs}
        data-secondary-track={secondaryTrack ?? undefined}
        data-secondary-cue-count={secondaryCues.length}
        data-secondary-active-cue={activeSecondaryCues[0]?.index}
      >
        {activeCue && preferences.primarySubs && (!preferences.dictationMode || dictationRevealed) ? (
          <SubtitleCueLine
            className="study-cue-text"
            text={plainText}
            furigana={preferences.furigana}
            onMouseDown={(event) => {
              popupOpenOnDownRef.current = !!popup;
              noteLookupPointerDown(event);
            }}
            onMouseUp={handleLookupMouseUp}
          />
        ) : (
          <span className="study-cue-status">
            {t(
              preferences.dictationMode && activeCue
                ? 'mediaWorkspace.study.listenType'
                : 'mediaWorkspace.study.waitingSubtitle',
            )}
          </span>
        )}

        {activeCue && (
          <span className="study-cue-timing">
            {t('mediaWorkspace.mining.cueMeta', {
              cue: activeCue.index + 1,
              track: activeCue.trackNumber,
              start: activeCue.startMs,
              end: activeCue.endMs,
            })}
          </span>
        )}

        {preferences.dualSubs && secondaryText && (
          <p className="study-cue-secondary">{secondaryText}</p>
        )}

        {preferences.dictationMode && activeCue && (
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
                  : t('mediaWorkspace.study.matchScore', {
                      score: dictationResult.score,
                    })}
              </span>
            )}
          </div>
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

        {preferences.shadowingMode && activeCue && (
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
                  {t(
                    shadowAudioUrl
                      ? 'mediaWorkspace.study.recordAgain'
                      : 'mediaWorkspace.study.recordResponse',
                  )}
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
        )}

        {translation && <p className="study-cue-translation">{translation}</p>}
      </aside>

      <section
        className="study-control-dock"
        aria-label={t('mediaWorkspace.study.controls')}
        data-study-controls={controlsExpanded ? 'expanded' : 'collapsed'}
      >
        {/*
          Primary row — the cue loop, and nothing else. Everything below used to sit in
          this same flat scroller: four rows of ~35 controls inside a 7.5rem box, so the
          Whisper row was permanently below an invisible fold and "Furigana" carried the
          same visual weight as a transcription pipeline.
        */}
        <div className="study-control-row study-control-primary">
          <div className="study-control-cluster" role="group" aria-label={t('mediaWorkspace.study.cueNavigation')}>
            <button
              type="button"
              data-study-action="previous-cue"
              disabled={!allCues.length}
              title={t('mediaWorkspace.study.shortcutHint', { key: 'W' })}
              onClick={() => jumpCue(-1)}
            >
              {t('mediaWorkspace.study.previousLine')}
            </button>
            <button
              type="button"
              data-study-action="replay-cue"
              disabled={!activeCue}
              title={t('mediaWorkspace.study.shortcutHint', { key: 'R' })}
              onClick={() => replayCue(activeCue)}
            >
              {t('mediaWorkspace.study.replayLine')}
            </button>
            <button
              type="button"
              data-study-action="next-cue"
              disabled={!allCues.length}
              title={t('mediaWorkspace.study.shortcutHint', { key: 'S' })}
              onClick={() => jumpCue(1)}
            >
              {t('mediaWorkspace.study.nextLine')}
            </button>
          </div>

          <div className="study-control-cluster" role="group" aria-label={t('mediaWorkspace.study.frameStep')}>
            <button
              type="button"
              disabled={!video}
              onClick={() => {
                if (!video) return;
                video.pause();
                video.currentTime = Math.max(0, video.currentTime - 1 / 30);
              }}
            >
              {t('mediaWorkspace.study.frameBack')}
            </button>
            <button
              type="button"
              disabled={!video}
              onClick={() => {
                if (!video) return;
                video.pause();
                video.currentTime = Math.min(
                  Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER,
                  video.currentTime + 1 / 30,
                );
              }}
            >
              {t('mediaWorkspace.study.frameForward')}
            </button>
          </div>

          <div className="study-control-cluster" role="group" aria-label={t('mediaWorkspace.study.subtitleOffset')}>
            <button
              type="button"
              title={t('mediaWorkspace.study.shortcutHint', { key: ';' })}
              onClick={() => changeSubtitleDelay(-0.1)}
            >
              {t('mediaWorkspace.study.subsOffsetStep', { amount: '−0.1' })}
            </button>
            {/* Was silent to screen readers: the value changed with no announcement. */}
            <output aria-label={t('mediaWorkspace.study.subtitleOffset')} aria-live="polite">
              {subtitleDelaySec >= 0 ? '+' : ''}{subtitleDelaySec.toFixed(1)}s
            </output>
            <button
              type="button"
              title={t('mediaWorkspace.study.shortcutHint', { key: "'" })}
              onClick={() => changeSubtitleDelay(0.1)}
            >
              {t('mediaWorkspace.study.subsOffsetStep', { amount: '+0.1' })}
            </button>
          </div>

          <select
            value={preferences.playbackRate}
            aria-label={t('mediaWorkspace.study.playbackSpeed')}
            onChange={(event) => updatePreference(
              'playbackRate',
              clampStudyPlaybackRate(Number(event.currentTarget.value)),
            )}
          >
            {RATE_PRESETS.map((rate) => (
              <option key={rate} value={rate}>{rate.toFixed(2)}x</option>
            ))}
          </select>

          <button
            type="button"
            className="study-control-more"
            data-study-action="toggle-study-controls"
            aria-expanded={controlsExpanded}
            onClick={() => setControlsExpanded((value) => !value)}
          >
            {t(controlsExpanded
              ? 'mediaWorkspace.study.fewerControls'
              : 'mediaWorkspace.study.moreControls')}
          </button>
        </div>

        {controlsExpanded && (
        <div className="study-control-advanced">
        <div className="study-control-row" role="group" aria-label={t('mediaWorkspace.study.displayGroup')}>
          <span className="study-control-legend">{t('mediaWorkspace.study.displayGroup')}</span>
          <label><input type="checkbox" checked={preferences.primarySubs} onChange={(event) => updatePreference('primarySubs', event.currentTarget.checked)} /> {t('mediaWorkspace.study.japaneseSubs')}</label>
          <label><input type="checkbox" checked={preferences.dualSubs} onChange={(event) => updatePreference('dualSubs', event.currentTarget.checked)} /> {t('mediaWorkspace.study.dualSubs')}</label>
          {/*
            The three `data-study-pref` hooks are the observable for the three toggle
            shortcuts (`video.toggleFurigana` / `-AutoPause` / `-Loop`). Those rows ship
            unbound, so the only way to test them is bind-then-press, and their effect is a
            preference rather than a seek or a subtitle offset — neither of the instruments
            the other video.* rows are proven with. Matching these boxes by their label text
            would key the assertion to one of four UI languages.
          */}
          <label><input type="checkbox" data-study-pref="furigana" checked={preferences.furigana} onChange={(event) => updatePreference('furigana', event.currentTarget.checked)} /> {t('mediaWorkspace.study.furigana')}</label>
          <label><input type="checkbox" data-study-pref="autoPause" checked={preferences.autoPause} onChange={(event) => updatePreference('autoPause', event.currentTarget.checked)} /> {t('mediaWorkspace.study.autoPause')}</label>
          <label><input type="checkbox" data-study-pref="loopLine" checked={preferences.loopLine} onChange={(event) => {
            updatePreference('loopLine', event.currentTarget.checked);
            if (event.currentTarget.checked) setAbLoop(false);
          }} /> {t('mediaWorkspace.study.loopLine')}</label>
          <label><input type="checkbox" checked={pauseOnLookup} onChange={(event) => setPauseOnLookup(event.currentTarget.checked)} /> {t('mediaWorkspace.study.pauseOnLookup')}</label>
        </div>

        {/*
          Dictation and Shadowing were two checkboxes that each cleared the other on
          change — a radio group wearing checkbox clothes. Modelled as one now, so the
          exclusivity is announced instead of merely enforced.
        */}
        <div className="study-control-row" role="radiogroup" aria-label={t('mediaWorkspace.study.practiceMode')}>
          <span className="study-control-legend">{t('mediaWorkspace.study.practiceMode')}</span>
          {(['off', 'dictation', 'shadowing'] as const).map((mode) => (
            <label key={mode} className="study-control-mode">
              <input
                type="radio"
                name="study-practice-mode"
                value={mode}
                checked={practiceMode === mode}
                onChange={() => setPracticeMode(mode)}
              />
              {t(mode === 'off'
                ? 'common.off'
                : mode === 'dictation'
                  ? 'mediaWorkspace.study.dictation'
                  : 'mediaWorkspace.study.shadowing')}
            </label>
          ))}
          <button type="button" disabled={!activeCue || translationBusy} onClick={() => void translateCue()}>
            {t(
              translationBusy
                ? 'mediaWorkspace.study.translating'
                : 'mediaWorkspace.study.translateLine',
            )}
          </button>
        </div>

        <div className="study-control-row" role="group" aria-label={t('mediaWorkspace.study.loopGroup')}>
          <span className="study-control-legend">{t('mediaWorkspace.study.loopGroup')}</span>
          <button type="button" disabled={!video} onClick={() => setAbStartSec(video?.currentTime ?? null)}>
            A {abStartSec == null ? t('mediaWorkspace.study.set') : `${abStartSec.toFixed(2)}s`}
          </button>
          <button type="button" disabled={!video || abStartSec == null} onClick={() => setAbEndSec(video?.currentTime ?? null)}>
            B {abEndSec == null ? t('mediaWorkspace.study.set') : `${abEndSec.toFixed(2)}s`}
          </button>
          <label>
            <input
              type="checkbox"
              checked={abLoop}
              disabled={abStartSec == null || abEndSec == null || abEndSec <= abStartSec}
              onChange={(event) => {
                setAbLoop(event.currentTarget.checked);
                if (event.currentTarget.checked) updatePreference('loopLine', false);
              }}
            />
            {t('mediaWorkspace.study.abLoop')}
          </label>
          {(abStartSec != null || abEndSec != null) && (
            <button type="button" onClick={() => {
              setAbStartSec(null);
              setAbEndSec(null);
              setAbLoop(false);
            }}>
              {t('mediaWorkspace.study.clearAb')}
            </button>
          )}
        </div>

        <div className="study-control-row" role="group" aria-label={t('mediaWorkspace.study.trackGroup')}>
          <span className="study-control-legend">{t('mediaWorkspace.study.trackGroup')}</span>
          <label>
            {t('mediaWorkspace.study.subtitleTrack')}
            <select
              value={selectedTrack ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (!value) {
                  if (manager) manager.setNoTrack();
                  else mediaCaptionsManager?.setNoTrack();
                } else if (manager) {
                  void manager.selectTrack(Number(value));
                } else {
                  void mediaCaptionsManager?.selectTrack(Number(value));
                }
              }}
            >
              <option value="">{t('common.off')}</option>
              {tracks.map((track) => (
                <option key={track.number} value={track.number}>{trackLabel(track, t)}</option>
              ))}
            </select>
          </label>

          <label
            // The control is inert until Dual subtitles is on; say so rather than
            // leaving a greyed-out select with no explanation.
            title={preferences.dualSubs
              ? undefined
              : t('mediaWorkspace.study.secondaryNeedsDual')}
          >
            {t('mediaWorkspace.study.secondarySubs')}
            <select
              value={secondaryTrack ?? ''}
              disabled={!preferences.dualSubs}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSecondaryTrack(value ? Number(value) : null);
              }}
            >
              <option value="">{t('common.off')}</option>
              {tracks
                .filter((track) => track.type === 'event' && track.number !== selectedTrack)
                .map((track) => (
                  <option key={track.number} value={track.number}>{trackLabel(track, t)}</option>
                ))}
            </select>
          </label>

          {!!audioTracks.length && (
            <label>
              {t('mediaWorkspace.study.audioTrack')}
              <select
                value={selectedAudioTrack ?? ''}
                onChange={(event) => audioManager?.selectTrack(Number(event.currentTarget.value))}
              >
                {audioTracks.map((track) => (
                  <option key={track.number} value={track.number}>
                    {track.name
                      || track.language
                      || t('mediaWorkspace.study.track', { number: track.number })}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div
          className="study-control-row study-whisper-controls"
          role="group"
          aria-label={t('mediaWorkspace.study.whisperGroup')}
        >
          <span className="study-control-legend">{t('mediaWorkspace.study.whisperGroup')}</span>
          <label>
            {t('mediaWorkspace.study.whisperDevice')}
            <select
              aria-label={t('mediaWorkspace.study.whisperDevice')}
              value={whisperDevice}
              disabled={whisperBusy}
              onChange={(event) => {
                const device = event.currentTarget.value as WhisperDevice;
                persistWhisperDevice(device);
              }}
            >
              <option value="auto">{t('mediaWorkspace.study.autoGpuCpu')}</option>
              <option value="cpu">{t('mediaWorkspace.study.cpu')}</option>
            </select>
          </label>
          <label>
            {t('mediaWorkspace.study.whisperModel')}
            <select
              aria-label={t('mediaWorkspace.study.whisperModel')}
              value={whisperModel}
              disabled={whisperBusy}
              onChange={(event) => {
                const tier = event.currentTarget.value as WhisperModelTier;
                setWhisperModel(tier);
                setWhisperModelTier(tier);
              }}
            >
              {WHISPER_MODEL_SPECS.map((model) => (
                <option key={model.id} value={model.id}>{model.id}</option>
              ))}
            </select>
          </label>
          <label>
            {t('mediaWorkspace.study.transcriptionLanguage')}
            <select
              aria-label={t('mediaWorkspace.study.transcriptionLanguage')}
              value={whisperLanguage}
              disabled={whisperBusy}
              onChange={(event) => {
                const language = event.currentTarget.value as 'ja' | 'zh';
                setWhisperLanguage(language);
                setStudyLang(language);
              }}
            >
              <option value="ja">{t('mediaCenter.settings.japanese')}</option>
              <option value="zh">{t('mediaCenter.settings.chinese')}</option>
            </select>
          </label>
          <button
            type="button"
            disabled={whisperBusy || !manager || !playbackInfo?.localFile?.path}
            onClick={() => void runWhisperGeneration()}
          >
            {t('mediaWorkspace.study.generateSubs')}
          </button>
          {whisperBusy && (
            <button type="button" onClick={stopWhisperGeneration}>
              {t('mediaWorkspace.study.stopGeneration')}
            </button>
          )}
          <output
            className={whisperState === 'error' ? 'study-whisper-error' : ''}
            aria-label={t('mediaWorkspace.study.whisperStatus')}
            aria-live="polite"
          >
            {whisperError
              || whisperMessage
              || t('mediaWorkspace.study.deviceStatus', { device: whisperDevice })}
          </output>
          {whisperBusy && (
            <progress
              aria-label={t('mediaWorkspace.study.whisperProgress')}
              max={1}
              value={whisperProgress}
            />
          )}
        </div>
        </div>
        )}
      </section>

      <VideoCoreMiningPanel
        cue={activeCue}
        displayText={plainText}
        source={miningSource}
        video={video}
        subtitleDelaySec={subtitleDelaySec}
      />

      {popup && (
        <DictionaryPopup
          query={popup.query}
          x={popup.x}
          y={popup.y}
          context={popup.context}
          onClose={() => setPopup(null)}
        />
      )}
    </>
  );
}

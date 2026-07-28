import React from 'react';
import { useAtomValue } from 'jotai';
import {
  vc_audioManager,
  vc_subtitleManager,
} from '@/app/(main)/_features/video-core/video-core';
import { vc_videoElement } from '@/app/(main)/_features/video-core/video-core-atoms';
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
import { getStudyLang, setStudyLang } from '../renderer/studyEnvironment';
import {
  loadWhisperDevice,
  loadWhisperModelTier,
  onWhisperDeviceChanged,
  onWhisperModelChanged,
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
  evaluateVideoCoreDictation,
  isCueEndTransition,
  nextVideoCoreWhisperTrackNumber,
  normalizeVideoCoreStudyPreferences,
  PLAYER_PREFERENCES_STORAGE_KEY,
  resolveStudyLoopSeekSec,
  stripAssCueText,
  whisperCuesToVideoCoreEvents,
  type VideoCoreDictationEvaluation,
  type VideoCoreStudyPreferences,
} from '../shared/videoCoreStudy';
import type { VideoCoreMiningSource } from '../shared/videoCoreMining';
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

function trackLabel(track: NormalizedTrackInfo): string {
  const identity = track.label || track.languageIETF || track.language || `Track ${track.number}`;
  const flags = [track.default ? 'default' : '', track.forced ? 'forced' : '']
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
  const manager = useAtomValue(vc_subtitleManager);
  const audioManager = useAtomValue(vc_audioManager);
  const video = useAtomValue(vc_videoElement);
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
  const [shadowRecording, setShadowRecording] = React.useState(false);
  const [shadowAudioUrl, setShadowAudioUrl] = React.useState('');
  const [shadowError, setShadowError] = React.useState('');
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

  const activeCue = activeCues[0] ?? null;
  const plainText = activeCue ? stripAssCueText(activeCue.text) : '';
  const secondaryText = activeSecondaryCues
    .map((cue) => stripAssCueText(cue.text))
    .filter(Boolean)
    .join(' ');
  const miningSource = miningSourceFromPlayback(playbackInfo);

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
    onCueChange,
    onManagerReady,
    preferences.autoPause,
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
    preferences.loopLine,
    subtitleDelaySec,
    video,
  ]);

  const seekCue = React.useCallback(
    (cue: VideoCoreActiveCue | null): void => {
      if (!cue || !video) return;
      video.currentTime = cuePlaybackStartSec(cue, subtitleDelaySec);
      void video.play();
    },
    [subtitleDelaySec, video],
  );

  const jumpCue = React.useCallback(
    (direction: -1 | 1): void => {
      if (!video) return;
      const sourceTimeMs = (video.currentTime - subtitleDelaySec) * 1000;
      seekCue(adjacentStudyCue(allCues, sourceTimeMs, direction));
    },
    [allCues, seekCue, subtitleDelaySec, video],
  );

  const changeSubtitleDelay = React.useCallback(
    (delta: number): void => {
      const next = Math.round(
        Math.max(-10, Math.min(10, subtitleDelaySec + delta)) * 10,
      ) / 10;
      setSubtitleDelaySec(next);
      void manager?.setSubtitleDelay(next);
    },
    [manager, subtitleDelaySec],
  );

  const translateCue = React.useCallback(
    async (text = plainText): Promise<void> => {
      if (!text || translationBusy) return;
      setTranslationBusy(true);
      try {
        setTranslation(await translate(text, getStudyLang()));
      } catch {
        setTranslation('Offline translation is unavailable.');
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
        if (pauseOnLookup) video?.pause();
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
    [pauseOnLookup, plainText, translateCue, video],
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

  const startShadowRecording = React.useCallback(async (): Promise<void> => {
    if (shadowRecorderRef.current?.state === 'recording') return;
    setShadowError('');
    clearShadowRecording();
    const generation = shadowGenerationRef.current;
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
          : 'Could not start microphone recording.',
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
      setWhisperError('Whisper generation requires a local Seanime library file.');
      return;
    }

    stopWhisperGeneration();
    const generation = whisperGenerationRef.current;
    setWhisperError('');
    setWhisperProgress(0);
    setWhisperState('extracting');
    setWhisperMessage('Extracting 16 kHz mono audio with ffmpeg…');

    let audio: Float32Array;
    try {
      const buffer = await window.api.seanimeExtractAudio(localFilePath);
      if (generation !== whisperGenerationRef.current) return;
      audio = new Float32Array(buffer);
      if (!audio.length) throw new Error('No audio track was found.');
    } catch (error) {
      if (generation !== whisperGenerationRef.current) return;
      setWhisperState('error');
      setWhisperError(
        error instanceof Error ? error.message : 'Audio extraction failed.',
      );
      return;
    }

    setWhisperState('loading');
    setWhisperMessage('Loading the local Whisper model…');
    let worker: Worker;
    try {
      worker = new WhisperWorker();
    } catch (error) {
      setWhisperState('error');
      setWhisperError(
        error instanceof Error ? error.message : 'The Whisper worker could not start.',
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
        setWhisperMessage(
          `Downloading ${file} — ${Math.round(message.progress)}%`,
        );
        return;
      }
      if (message.type === 'status' && message.status === 'transcribing') {
        const device = message.device === 'webgpu' ? 'webgpu' : 'wasm';
        markTierDownloaded(whisperModel, device, whisperDevice);
        setWhisperState('transcribing');
        setWhisperMessage(
          `Transcribing on ${device === 'webgpu' ? 'the GPU' : 'the CPU'}…`,
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
        fail(message.message || 'Whisper subtitle generation failed.');
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
          fail('Whisper completed without producing subtitle cues.');
          return;
        }
        const track: MKVParser_TrackInfo = {
          number: trackNumber,
          uid: trackNumber,
          type: 'subtitle',
          codecID: 'S_TEXT/ASS',
          name: 'Whisper (generated)',
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
          setWhisperMessage(`Generated ${subtitleEvents.length} subtitle lines.`);
          setWhisperProgress(1);
          worker.terminate();
          if (whisperWorkerRef.current === worker) whisperWorkerRef.current = null;
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Could not mount Whisper cues.');
        }
      })();
    };
    worker.onerror = (error) => {
      fail(error.message || 'The Whisper worker failed to start.');
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
      fail(error instanceof Error ? error.message : 'Audio could not be sent to Whisper.');
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
            {preferences.dictationMode && activeCue ? 'Listen, then type the cue' : 'Waiting for subtitle'}
          </span>
        )}

        {activeCue && (
          <span className="study-cue-timing">
            Cue {activeCue.index + 1} · track {activeCue.trackNumber} · {activeCue.startMs}–{activeCue.endMs} ms
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
              placeholder="Type what you hear"
              aria-label="Dictation answer"
              autoComplete="off"
            />
            <button type="button" disabled={!dictationInput.trim()} onClick={checkDictation}>
              Check
            </button>
            <button type="button" onClick={() => setDictationRevealed(true)}>
              Reveal
            </button>
            {dictationResult && (
              <span className={dictationResult.exact ? 'is-correct' : ''} role="status">
                {dictationResult.exact ? 'Exact match' : `${dictationResult.score}% match`}
              </span>
            )}
          </div>
        )}

        {preferences.shadowingMode && activeCue && (
          <section
            className="study-shadowing"
            aria-label="Shadowing practice"
            data-shadow-recording={shadowRecording ? 'recording' : 'idle'}
            data-shadow-response={shadowAudioUrl ? 'ready' : 'none'}
          >
            <div className="study-shadowing-copy">
              <strong>Shadowing practice</strong>
              <span>Replay the original line, then record your response for comparison.</span>
            </div>
            <div className="study-shadowing-actions">
              <button type="button" onClick={() => seekCue(activeCue)}>
                Replay original
              </button>
              {!shadowRecording ? (
                <button type="button" onClick={() => void startShadowRecording()}>
                  {shadowAudioUrl ? 'Record again' : 'Record response'}
                </button>
              ) : (
                <button type="button" onClick={stopShadowRecording}>
                  Stop recording
                </button>
              )}
              {shadowAudioUrl && (
                <button type="button" onClick={clearShadowRecording}>
                  Discard response
                </button>
              )}
              {shadowRecording && (
                <span className="study-shadowing-live">Recording · 60 second limit</span>
              )}
            </div>
            {shadowAudioUrl && (
              <audio
                className="study-shadowing-audio"
                aria-label="Shadowing response playback"
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

      <section className="study-control-dock" aria-label="Study playback controls">
        <div className="study-control-row">
          <button
            type="button"
            data-study-action="previous-cue"
            disabled={!allCues.length}
            onClick={() => jumpCue(-1)}
          >
            Previous line
          </button>
          <button
            type="button"
            data-study-action="replay-cue"
            disabled={!activeCue}
            onClick={() => seekCue(activeCue)}
          >
            Replay line
          </button>
          <button
            type="button"
            data-study-action="next-cue"
            disabled={!allCues.length}
            onClick={() => jumpCue(1)}
          >
            Next line
          </button>
          <button
            type="button"
            disabled={!video}
            onClick={() => {
              if (!video) return;
              video.pause();
              video.currentTime = Math.max(0, video.currentTime - 1 / 30);
            }}
          >
            Frame −
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
            Frame +
          </button>

          <button type="button" onClick={() => changeSubtitleDelay(-0.1)}>−0.1s subs</button>
          <output aria-label="Subtitle offset">{subtitleDelaySec >= 0 ? '+' : ''}{subtitleDelaySec.toFixed(1)}s</output>
          <button type="button" onClick={() => changeSubtitleDelay(0.1)}>+0.1s subs</button>

          <select
            value={preferences.playbackRate}
            aria-label="Playback speed"
            onChange={(event) => updatePreference(
              'playbackRate',
              clampStudyPlaybackRate(Number(event.currentTarget.value)),
            )}
          >
            {RATE_PRESETS.map((rate) => (
              <option key={rate} value={rate}>{rate.toFixed(2)}x</option>
            ))}
          </select>
        </div>

        <div className="study-control-row">
          <label><input type="checkbox" checked={preferences.autoPause} onChange={(event) => updatePreference('autoPause', event.currentTarget.checked)} /> Auto-pause</label>
          <label><input type="checkbox" checked={preferences.loopLine} onChange={(event) => {
            updatePreference('loopLine', event.currentTarget.checked);
            if (event.currentTarget.checked) setAbLoop(false);
          }} /> Loop line</label>
          <label><input type="checkbox" checked={preferences.furigana} onChange={(event) => updatePreference('furigana', event.currentTarget.checked)} /> Furigana</label>
          <label><input type="checkbox" checked={preferences.primarySubs} onChange={(event) => updatePreference('primarySubs', event.currentTarget.checked)} /> Japanese subtitles</label>
          <label><input type="checkbox" checked={preferences.dualSubs} onChange={(event) => updatePreference('dualSubs', event.currentTarget.checked)} /> Dual subtitles</label>
          <label><input type="checkbox" checked={pauseOnLookup} onChange={(event) => setPauseOnLookup(event.currentTarget.checked)} /> Pause on lookup</label>
          <label><input type="checkbox" checked={preferences.dictationMode} onChange={(event) => {
            updatePreference('dictationMode', event.currentTarget.checked);
            if (event.currentTarget.checked) {
              updatePreference('shadowingMode', false);
              stopShadowRecording();
            }
          }} /> Dictation</label>
          <label><input type="checkbox" checked={preferences.shadowingMode} onChange={(event) => {
            updatePreference('shadowingMode', event.currentTarget.checked);
            if (event.currentTarget.checked) updatePreference('dictationMode', false);
            else stopShadowRecording();
          }} /> Shadowing</label>
          <button type="button" disabled={!activeCue || translationBusy} onClick={() => void translateCue()}>
            {translationBusy ? 'Translating…' : 'Translate line'}
          </button>
        </div>

        <div className="study-control-row">
          <button type="button" disabled={!video} onClick={() => setAbStartSec(video?.currentTime ?? null)}>
            A {abStartSec == null ? 'set' : `${abStartSec.toFixed(2)}s`}
          </button>
          <button type="button" disabled={!video || abStartSec == null} onClick={() => setAbEndSec(video?.currentTime ?? null)}>
            B {abEndSec == null ? 'set' : `${abEndSec.toFixed(2)}s`}
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
            A–B loop
          </label>
          {(abStartSec != null || abEndSec != null) && (
            <button type="button" onClick={() => {
              setAbStartSec(null);
              setAbEndSec(null);
              setAbLoop(false);
            }}>
              Clear A–B
            </button>
          )}

          <label>
            Subtitle track
            <select
              value={selectedTrack ?? ''}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (!value) manager?.setNoTrack();
                else void manager?.selectTrack(Number(value));
              }}
            >
              <option value="">Off</option>
              {tracks.map((track) => (
                <option key={track.number} value={track.number}>{trackLabel(track)}</option>
              ))}
            </select>
          </label>

          <label>
            Secondary subtitles
            <select
              value={secondaryTrack ?? ''}
              disabled={!preferences.dualSubs}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSecondaryTrack(value ? Number(value) : null);
              }}
            >
              <option value="">Off</option>
              {tracks
                .filter((track) => track.type === 'event' && track.number !== selectedTrack)
                .map((track) => (
                  <option key={track.number} value={track.number}>{trackLabel(track)}</option>
                ))}
            </select>
          </label>

          {!!audioTracks.length && (
            <label>
              Audio track
              <select
                value={selectedAudioTrack ?? ''}
                onChange={(event) => audioManager?.selectTrack(Number(event.currentTarget.value))}
              >
                {audioTracks.map((track) => (
                  <option key={track.number} value={track.number}>
                    {track.name || track.language || `Track ${track.number}`}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="study-control-row study-whisper-controls">
          <label>
            Whisper model
            <select
              aria-label="Whisper model"
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
            Transcription language
            <select
              aria-label="Whisper language"
              value={whisperLanguage}
              disabled={whisperBusy}
              onChange={(event) => {
                const language = event.currentTarget.value as 'ja' | 'zh';
                setWhisperLanguage(language);
                setStudyLang(language);
              }}
            >
              <option value="ja">Japanese</option>
              <option value="zh">Chinese</option>
            </select>
          </label>
          <button
            type="button"
            disabled={whisperBusy || !manager || !playbackInfo?.localFile?.path}
            onClick={() => void runWhisperGeneration()}
          >
            Generate subtitles
          </button>
          {whisperBusy && (
            <button type="button" onClick={stopWhisperGeneration}>Stop generation</button>
          )}
          <output
            className={whisperState === 'error' ? 'study-whisper-error' : ''}
            aria-label="Whisper status"
            aria-live="polite"
          >
            {whisperError || whisperMessage || `Device: ${whisperDevice}`}
          </output>
          {whisperBusy && (
            <progress
              aria-label="Whisper progress"
              max={1}
              value={whisperProgress}
            />
          )}
        </div>
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

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
import type { MKVParser_TrackInfo } from '../../vendor/seanime/generated/types';
import DictionaryPopup from '../renderer/components/DictionaryPopup';
import SubtitleCueLine from '../renderer/components/SubtitleCueLine';
import {
  isLookupClick,
  lookupWordFromMouseUp,
  noteLookupPointerDown,
} from '../renderer/wordLookup';
import { translate } from '../renderer/translator';
import { getStudyLang } from '../renderer/studyEnvironment';
import {
  activeStudyCuesAtTime,
  adjacentStudyCue,
  clampStudyPlaybackRate,
  cuePlaybackStartSec,
  evaluateVideoCoreDictation,
  isCueEndTransition,
  normalizeVideoCoreStudyPreferences,
  PLAYER_PREFERENCES_STORAGE_KEY,
  resolveStudyLoopSeekSec,
  stripAssCueText,
  type VideoCoreDictationEvaluation,
  type VideoCoreStudyPreferences,
} from '../shared/videoCoreStudy';
import type { VideoCoreMiningSource } from '../shared/videoCoreMining';
import VideoCoreMiningPanel from './VideoCoreMiningPanel';

const RATE_PRESETS = [0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5] as const;

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

  const audioTracks: MKVParser_TrackInfo[] = playbackInfo?.mkvMetadata?.audioTracks ?? [];

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
          <label><input type="checkbox" checked={preferences.dictationMode} onChange={(event) => updatePreference('dictationMode', event.currentTarget.checked)} /> Dictation</label>
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

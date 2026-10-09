/**
 * The Phase-3 player/overlay seam.
 *
 * Seanime's web VideoCore creates VideoCoreSubtitleManager, while its native-player
 * component owns the websocket "subtitle-event" forwarding path. Study OS uses the web
 * player with Seanime's local-file directstream, so this small host supplies that missing
 * bridge without editing adopted source.
 */
import React from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import type {
  MKVParser_SubtitleEvent,
  NativePlayer_PlaybackInfo,
  NativePlayer_SubtitleEventsPayload,
} from '../../vendor/seanime/generated/types';
import { useWebsocketMessageListener } from '@/app/(main)/_hooks/handle-websockets';
import { useServerHMACAuth } from '@/app/(main)/_hooks/use-server-status';
import { getProxyUrl } from '@/app/(main)/onlinestream/_lib/onlinestream-proxy';
import {
  clientIdAtom,
  websocketConnectedAtom,
} from '@/app/websocket-provider';
import { clientIdentityConfirmedAtom } from './StudyWebsocketProvider';
import {
  VideoCore,
  VideoCoreProvider,
  vc_subtitleManager,
} from '@/app/(main)/_features/video-core/video-core';
import { vc_videoElement } from '@/app/(main)/_features/video-core/video-core-atoms';
import { useVideoCoreEvents } from '@/app/(main)/_features/video-core/video-core-events';
import {
  vc_settingsRaw,
  type VideoCoreLifecycleState,
  type VideoCore_VideoPlaybackInfo,
} from '@/app/(main)/_features/video-core/video-core.atoms';
import type {
  SubtitleManagerCueChangeEvent,
} from '@/app/(main)/_features/video-core/video-core-subtitles';
import { getClientIdProof } from '@/lib/server/client-id';
import { WSEvents } from '@/lib/server/ws-events';
import { __clientPlatform__ } from '@/types/constants';
import type { SeanimeConnection } from '../shared/seanime';
import type { MediaWorkspacePlaybackRequest } from '../shared/mediaWorkspace';
import { describeDirectstreamAbort, describeLocalOpenFailure } from '../shared/playbackFailure';
import { youtubeIdentityFromPath } from '../shared/youtubeDownloadFiles';
import {
  DIRECTSTREAM_MEDIA_REPORT_ONLY,
  DIRECTSTREAM_MEDIA_SILENCE_MS,
  directstreamMediaVerdict,
  directstreamOpenPresumedDead,
  directstreamOpenReopened,
  directstreamOpenVerdict,
  type DirectstreamMediaProgress,
  type DirectstreamOpenProgress,
} from './directstreamOpenRecovery';
import {
  DIRECTSTREAM_OPEN_GENERATION_STORAGE_KEY,
  directstreamOpenChannelIdle,
  directstreamOpenGenerationFor,
  directstreamOpenGenerationsIdle,
  directstreamOpenGenerationsRestored,
  directstreamOpenRequest,
  serializeDirectstreamOpenGeneration,
  directstreamOpenSettled,
  directstreamOpenSupersede,
  type DirectstreamOpenChannel,
  type DirectstreamOpenGenerations,
  type DirectstreamOpenTicket,
} from '../shared/directstreamOpenChannel';
import { installSeanimeMediaAuth } from './seanimeMediaAuth';
import { directLocalPlaybackInfo, sidecarCannotServeFile } from './directLocalPlayback';
import {
  ensureTranscodeEnabled,
  isTranscodableMediaError,
  parseTranscodeMemo,
  pathNeedsTranscode,
  rememberTranscodePath,
  requestTranscodeContainer,
  serializeTranscodeMemo,
  transcodeStreamUrl,
  TRANSCODE_MEMO_STORAGE_KEY,
} from '../shared/mediastreamTranscode';
import {
  ensureSeanimeLibraryCovers,
  normalizeLibraryPath,
  parentFolderOf,
} from './seanimeLibrary';
import { t as translateUi } from '../renderer/i18n';
import {
  normalizeVideoCoreResumePositions,
  resolveVideoCoreResumePosition,
  seedPreferredSubtitleLanguage,
  shortLangTag,
  stripAssCueText,
  upsertVideoCoreResumePosition,
  VIDEO_CORE_RESUME_STORAGE_KEY,
  VIDEO_CORE_SUB_LANG_SEED_STORAGE_KEY,
  videoCoreResumeKey,
} from '../shared/videoCoreStudy';
import { getStudyLang } from '../renderer/studyEnvironment';
import { rememberStudyTrackChoice, studySubtitleSource } from './studySubtitleMemory';
import { resumeWriteAction } from './videoCoreResumeWrite';
import { createSubtitleEventRelay } from './subtitleEventRelay';
import { createSubtitleBackfill } from './subtitleBackfill';
import {
  createWatchTimeState,
  watchTimeFlush,
  watchTimeInterrupt,
  watchTimeSample,
  watchTimeShouldFlush,
  watchTimeStop,
  type WatchTimeState,
} from '../shared/seanimeWatchTime';
import { recordWatching } from '../renderer/stats';
import VideoCoreStudyOverlay from './VideoCoreStudyOverlay';
import StudyWorkspaceProvider, { type StudySurfaceKind } from './StudyWorkspaceProvider';
import StudyUpNextCard from './StudyUpNextCard';

type ServerMessage = {
  type: string;
  payload?: unknown;
};

type CueProofConfig = {
  mkvPath: string;
  videoUrl: string;
  /**
   * Opt into the production resume path for the restart acceptance proof.
   * Disposable cue proofs remain non-persistent unless this is explicitly set.
   */
  verifyContinuity?: boolean;
};

type CueProofState = {
  phase: string;
  clientId?: string;
  playStatus?: number;
  parserBytes?: number;
  managerClass?: string;
  subtitleEvents?: number;
  /** Whole-file subtitle passes asked of the sidecar for this stream (see subtitleBackfill). */
  subtitleBackfills?: number;
  cueChanges?: Array<{
    rawText: string;
    text: string;
    startMs: number;
    endMs: number;
    currentTimeMs: number;
  }>;
  error?: string;
};

type CueProofWindow = Window & {
  __SEANIME_CUE_PROOF_CONFIG__?: CueProofConfig;
  __SEANIME_CUE_PROOF__?: CueProofState;
};

const initialState: VideoCoreLifecycleState = {
  active: false,
  playbackInfo: null,
  playbackError: null,
  loadingState: null,
};


function proofWindow(): CueProofWindow {
  return window as CueProofWindow;
}

function publishProof(update: Partial<CueProofState>): void {
  const target = proofWindow();
  target.__SEANIME_CUE_PROOF__ = {
    phase: 'idle',
    cueChanges: [],
    ...target.__SEANIME_CUE_PROOF__,
    ...update,
  };
}

function subtitleEvents(payload: unknown): MKVParser_SubtitleEvent[] {
  if (Array.isArray(payload)) return payload as MKVParser_SubtitleEvent[];
  if (payload && typeof payload === 'object' && 'events' in payload) {
    return ((payload as NativePlayer_SubtitleEventsPayload).events ?? []);
  }
  return payload ? [payload as MKVParser_SubtitleEvent] : [];
}

function toVideoCorePlaybackInfo(
  nativeInfo: NativePlayer_PlaybackInfo,
  proofConfig?: CueProofConfig,
  resumePositionSec = 0,
): VideoCore_VideoPlaybackInfo {
  return {
    id: nativeInfo.id,
    playbackType: 'localfile',
    streamUrl: proofConfig?.videoUrl ?? nativeInfo.streamUrl,
    streamPath: nativeInfo.streamPath,
    mkvMetadata: nativeInfo.mkvMetadata,
    subtitleTracks: nativeInfo.subtitleTracks,
    localFile: nativeInfo.localFile,
    media: nativeInfo.media,
    episode: nativeInfo.episode,
    streamType: proofConfig ? 'unknown' : nativeInfo.streamType,
    // Study OS owns continuity because the supervised sidecar datadir is disposable.
    disableRestoreFromContinuity: true,
    ...(proofConfig
      ? {
          initialState: {
            paused: true,
            ...(proofConfig.verifyContinuity && resumePositionSec > 0
              ? { currentTime: resumePositionSec }
              : {}),
          },
        }
      : resumePositionSec > 0
        ? { initialState: { currentTime: resumePositionSec } }
        : {}),
  };
}

function resumeKeyForPlayback(
  playbackInfo: VideoCore_VideoPlaybackInfo | NativePlayer_PlaybackInfo,
): string {
  return videoCoreResumeKey({
    playbackId: playbackInfo.id,
    localFilePath: playbackInfo.localFile?.path,
    streamPath: playbackInfo.streamPath,
    mediaId: playbackInfo.media?.id,
    episodeNumber: playbackInfo.episode?.episodeNumber,
  });
}

/**
 * Where an explicitly requested open wants to start, or `null` to resume as usual.
 *
 * Phase 6's watch-to-review loop is the only producer: a mined card knows the exact cue it
 * came from, so "replay the line this card came from" is a destination rather than a
 * resume. It applies **only to the file it was issued for** — the request object outlives
 * the open that consumed it, so without the key check a later `watch` for a different file
 * would inherit someone else's timestamp and silently start it minutes in. Both sides go
 * through `videoCoreResumeKey`, so this reuses the resume store's own normalisation
 * instead of introducing a second path-comparison rule.
 */
function requestedStartSec(
  playbackRequest: MediaWorkspacePlaybackRequest | null,
  nativeInfo: NativePlayer_PlaybackInfo,
): number | null {
  if (!playbackRequest || playbackRequest.kind !== 'local') return null;
  const { startAtSec } = playbackRequest;
  if (typeof startAtSec !== 'number' || !Number.isFinite(startAtSec) || startAtSec < 0) {
    return null;
  }
  const requestedKey = videoCoreResumeKey({ localFilePath: playbackRequest.localFilePath });
  return requestedKey && requestedKey === resumeKeyForPlayback(nativeInfo)
    ? startAtSec
    : null;
}

function loadResumePosition(
  playbackInfo: NativePlayer_PlaybackInfo | VideoCore_VideoPlaybackInfo,
): number {
  const key = resumeKeyForPlayback(playbackInfo);
  if (!key) return 0;
  try {
    const positions = normalizeVideoCoreResumePositions(
      JSON.parse(localStorage.getItem(VIDEO_CORE_RESUME_STORAGE_KEY) ?? '[]'),
    );
    return resolveVideoCoreResumePosition(positions, key);
  } catch {
    return 0;
  }
}

/**
 * The open channel, and the generation counter that goes on the wire with it — slice 44.
 *
 * **Module-scoped, and that is the point, not an oversight.** `settled` has to mean the
 * SERVER answered; an aborted `fetch` abandons the response and never the work, and effect
 * cleanup is where aborts come from. State held in a ref would be torn down by the very
 * cleanup that issues the abort, so the channel would forget an open the sidecar is still
 * preparing — which is the race the channel exists to close. `seanimeSocketPool` is
 * module-scoped for the same reason. One realm is one window is one `clientId`, and
 * `AcceptOpenGeneration` orders each client id independently, so this needs no key.
 */
let openChannel: DirectstreamOpenChannel = directstreamOpenChannelIdle;
let openGenerations: DirectstreamOpenGenerations = directstreamOpenGenerationsIdle;

/**
 * The counter's realm lifetime is SHORTER than the client id's, and the sidecar orders by
 * client id — so a reload that rewinds the counter has every later open refused for the life
 * of that sidecar. See {@link DIRECTSTREAM_OPEN_GENERATION_STORAGE_KEY} for the measured
 * sequence. These two functions are the storage half; the rules are pure and live there.
 *
 * Both swallow. `localStorage` throws on a blocked or full store, and a persistence detail
 * must never be the reason the user's play button fails — the worst an absent read can do is
 * restore the behaviour that existed before this was written.
 */
function readStoredOpenGeneration(): string | null {
  try {
    return localStorage.getItem(DIRECTSTREAM_OPEN_GENERATION_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Which local files have already proven undecodable, so a second open of one does not
 * replay the ~1.8s of failed playback before switching. Swallows for the same reason the
 * generation slot above does — a storage detail must never be why a file will not play.
 */
function readTranscodeMemo(): string[] {
  try {
    return parseTranscodeMemo(localStorage.getItem(TRANSCODE_MEMO_STORAGE_KEY));
  } catch {
    return [];
  }
}

function persistTranscodeMemo(filePath: string): void {
  try {
    localStorage.setItem(
      TRANSCODE_MEMO_STORAGE_KEY,
      serializeTranscodeMemo(rememberTranscodePath(readTranscodeMemo(), filePath)),
    );
  } catch {
    // See above.
  }
}

function persistOpenGeneration(clientId: string, generation: number): void {
  try {
    localStorage.setItem(
      DIRECTSTREAM_OPEN_GENERATION_STORAGE_KEY,
      serializeDirectstreamOpenGeneration(clientId, generation),
    );
  } catch {
    // See above.
  }
}

/**
 * The server answered the POST this ticket issued — with a 200, a 500, or a transport error
 * that is not an abort. Guarded by ticket IDENTITY, which makes it both idempotent (a `!ok`
 * response settles here and then throws into the caller's `catch`) and supersession-safe: a
 * late answer to an open the user has already moved off must not clear the channel that is
 * now holding the CURRENT open's POST.
 */
function settleDirectstreamOpen(ticket: DirectstreamOpenTicket): void {
  if (openChannel.outstanding !== ticket) return;
  // `issue` is always null here: the launch path supersedes rather than queues, so nothing
  // is ever waiting. The queueing door stays open in the module, tested and unwired, for a
  // session that can measure it — see `directstreamOpenSupersede`'s header.
  openChannel = directstreamOpenSettled(openChannel).channel;
}

/**
 * The one place a local-file open is issued. Both callers — the launch effect and the
 * recovery below it — go through here, so a header or a body that drifts drifts for both.
 *
 * `generation` is the client's own order over its opens, refused by the sidecar when it is
 * older than one already accepted for this client id
 * (`patches/seanime/0004-directstream-open-generation.patch`). It is NOT the request id —
 * see `DirectstreamOpenGenerations` for the Blanc hash that rules that out. On an unpatched
 * sidecar, which is every sidecar this app currently launches, the field is ignored.
 */
function postDirectstreamOpen(
  conn: SeanimeConnection,
  clientId: string,
  localFilePath: string,
  generation: number,
  signal: AbortSignal,
): Promise<Response> {
  return fetch(`${conn.baseUrl}/api/v1/directstream/play/localfile`, {
    method: 'POST',
    signal,
    headers: {
      'X-Seanime-Token': conn.token,
      'X-Seanime-Client-Id': clientId,
      'X-Seanime-Client-Id-Proof': getClientIdProof(),
      'X-Seanime-Client-Platform': __clientPlatform__,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path: localFilePath, clientId, generation }),
  });
}

async function consumeParserStream(
  conn: SeanimeConnection,
  nativeInfo: NativePlayer_PlaybackInfo,
): Promise<void> {
  const streamUrl = nativeInfo.streamUrl.replace('{{SERVER_URL}}', conn.baseUrl);
  const response = await fetch(streamUrl, {
    headers: { 'X-Seanime-Token': conn.token },
  });
  if (!response.ok || !response.body) {
    throw new Error(`directstream pull -> HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  let bytes = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    // This proof plays a separate browser-friendly MP4 while pulling the MKV only to
    // drive Seanime's parser. An unthrottled drain finishes in ~200 ms and closes the
    // request before the subtitle goroutine can flush later tracks. Real playback
    // naturally applies this backpressure, so preserve it in the harness too.
    await new Promise((resolve) => window.setTimeout(resolve, 25));
  }
  publishProof({ parserBytes: bytes });
  console.info(`[cue-proof] parser stream consumed ${bytes} bytes`);
}

function CueProofDriver({ conn }: { conn: SeanimeConnection }): React.ReactElement | null {
  const clientId = useAtomValue(clientIdAtom);
  const connected = useAtomValue(websocketConnectedAtom);
  const started = React.useRef(false);
  const config = proofWindow().__SEANIME_CUE_PROOF_CONFIG__;

  React.useEffect(() => {
    if (!config || !connected || !clientId || started.current) return;
    started.current = true;

    const api = async (path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(`${conn.baseUrl}${path}`, {
        ...init,
        headers: {
          'X-Seanime-Token': conn.token,
          'X-Seanime-Client-Id': clientId,
          'X-Seanime-Client-Id-Proof': getClientIdProof(),
          'X-Seanime-Client-Platform': __clientPlatform__,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });

    void (async () => {
      try {
        publishProof({ phase: 'preparing', clientId });
        console.info(`[cue-proof] adopted provider connected as ${clientId}`);

        const libraryPath = config.mkvPath.replace(/[\\/][^\\/]+$/, '');
        const currentResponse = await api('/api/v1/settings');
        const hasSettings = currentResponse.ok;
        const current = hasSettings
          ? (((await currentResponse.json()) as { data?: Record<string, unknown> }).data ?? {})
          : {};
        const library = (current.library ?? {}) as Record<string, unknown>;
        const settingsResponse = await api(hasSettings ? '/api/v1/settings' : '/api/v1/start', {
          method: hasSettings ? 'PATCH' : 'POST',
          body: JSON.stringify({
            library: {
              ...library,
              libraryPath,
              libraryPaths: [],
              torrentProvider: library.torrentProvider ?? 'none',
            },
            mediaPlayer: current.mediaPlayer ?? {},
            torrent: current.torrent ?? {},
            anilist: current.anilist ?? {},
            discord: current.discord ?? {},
            manga: current.manga ?? {},
            notifications: current.notifications ?? {},
            nakama: current.nakama ?? {},
            ...(hasSettings
              ? {}
              : {
                  enableTranscode: false,
                  enableTorrentStreaming: false,
                  debridProvider: 'none',
                }),
          }),
        });
        if (!settingsResponse.ok) {
          throw new Error(
            `${hasSettings ? 'settings update' : 'initial setup'} -> HTTP ${settingsResponse.status}`,
          );
        }

        const scanResponse = await api('/api/v1/library/scan', {
          method: 'POST',
          body: JSON.stringify({
            enhanced: true,
            enhanceWithOfflineDatabase: false,
            skipLockedFiles: false,
            skipIgnoredFiles: false,
          }),
        });
        const scanBody = (await scanResponse.json()) as {
          data?: Array<{ mediaId?: number; path?: string }>;
          error?: unknown;
        };
        if (!scanResponse.ok || scanBody.error) {
          throw new Error(`library scan -> HTTP ${scanResponse.status}`);
        }

        const mediaIds = [
          ...new Set(
            (scanBody.data ?? [])
              .map((file) => file.mediaId ?? 0)
              .filter((mediaId) => mediaId > 0),
          ),
        ];
        if (!mediaIds.length) throw new Error('library scan produced no matched media');

        const seedResponse = await api('/api/v1/library/unknown-media', {
          method: 'POST',
          body: JSON.stringify({ mediaIds }),
        });
        if (!seedResponse.ok) {
          throw new Error(`collection seed -> HTTP ${seedResponse.status}`);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2500));

        publishProof({ phase: 'starting' });
        const playResponse = await api('/api/v1/directstream/play/localfile', {
          method: 'POST',
          body: JSON.stringify({ path: config.mkvPath, clientId }),
        });
        publishProof({ playStatus: playResponse.status });
        if (!playResponse.ok) {
          throw new Error(
            `directstream play -> HTTP ${playResponse.status}: ${(await playResponse.text()).slice(0, 240)}`,
          );
        }
        publishProof({ phase: 'awaiting-cue' });
        console.info('[cue-proof] directstream accepted; awaiting real subtitle events');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        publishProof({ phase: 'failed', error: message });
        console.error(`[cue-proof] ${message}`);
      }
    })();
  }, [clientId, config, conn, connected]);

  return null;
}

function StudyOverlay({
  playbackInfo,
  localFilePath,
}: {
  playbackInfo: VideoCore_VideoPlaybackInfo | null;
  /**
   * The path the USER asked for, threaded down rather than read back off the sidecar's
   * reply. `localFile` is optional on the reply
   * (`vendor/seanime-web/api/generated/types.ts:1573`), so anything that must have a path
   * should take it from the request, which always has one — it is what the open was
   * issued for.
   *
   * Not, so far as anything measured shows, the reason the overlay's external-subtitle
   * mount does not fire: threading this changed nothing in the live run of 2026-08-06.
   * That remains open. This is the more robust source either way.
   */
  localFilePath: string | null;
}): React.ReactElement {
  const onManagerReady = React.useCallback((managerClass: string): void => {
    publishProof({ managerClass });
    console.info(`[cue-proof] manager mounted: ${managerClass}`);
  }, []);
  const onCueChange = React.useCallback((event: SubtitleManagerCueChangeEvent): void => {
      const previous = proofWindow().__SEANIME_CUE_PROOF__?.cueChanges ?? [];
      const additions = event.detail.cues.map((cue) => ({
        rawText: cue.text,
        text: stripAssCueText(cue.text),
        startMs: cue.startMs,
        endMs: cue.endMs,
        currentTimeMs: event.detail.currentTimeMs,
      }));
      if (additions.length) {
        publishProof({
          phase: 'cuechange',
          cueChanges: [...previous, ...additions],
        });
        for (const cue of additions) {
          console.info(
            `[cue-proof] cuechange ${cue.startMs}-${cue.endMs}ms ${JSON.stringify(cue.rawText)}`,
          );
        }
      }
  }, []);
  return (
    <VideoCoreStudyOverlay
      playbackInfo={playbackInfo}
      localFilePath={localFilePath}
      onManagerReady={onManagerReady}
      onCueChange={onCueChange}
    />
  );
}

/**
 * What this file is called in the study ledger. Never translated — a media title is study
 * content, per `CLAUDE.md`'s i18n scope rule, and the same order `miningSourceFromPlayback`
 * uses so one file does not acquire two names across two surfaces. A bare file name is the
 * last resort because it is always better than an empty row.
 */
function ledgerTitleForPlayback(playbackInfo: VideoCore_VideoPlaybackInfo): string {
  const media = playbackInfo.media?.title;
  const mediaTitle = media?.userPreferred || media?.romaji || media?.english || media?.native;
  const episode = playbackInfo.episode?.episodeNumber;
  if (mediaTitle) {
    return episode != null ? `${mediaTitle} — ${episode}` : mediaTitle;
  }
  const path = playbackInfo.localFile?.path ?? '';
  // A YouTube download is named `Title [videoId].ext`; Statistics shows the title.
  const youtube = youtubeIdentityFromPath(path);
  if (youtube) return youtube.title;
  return path.split(/[\\/]/).pop() || playbackInfo.episode?.displayTitle || '';
}

/**
 * Persists where you stopped, and how long you actually watched.
 *
 * The two live together because they need exactly the same four listeners on exactly the
 * same element, and because they answer the same question from opposite ends: the resume
 * store is *where* the session got to, the ledger flush is *that it happened at all*.
 * Before slice 8 the second half went nowhere — a night in this player left the app's own
 * streak, heat-map and "study time today" reading zero. See `shared/seanimeWatchTime.ts`
 * for the five rules that decide what counts.
 */
function ResumeTracker({
  playbackInfo,
  disabled,
}: {
  playbackInfo: VideoCore_VideoPlaybackInfo | null;
  disabled: boolean;
}): React.ReactElement | null {
  const video = useAtomValue(vc_videoElement);

  React.useEffect(() => {
    if (!video || !playbackInfo || disabled) return;
    const key = resumeKeyForPlayback(playbackInfo);
    if (!key) return;
    let lastSavedSec = -1;

    const ledgerTitle = ledgerTitleForPlayback(playbackInfo);
    let watch: WatchTimeState = createWatchTimeState();
    const flushWatch = (): void => {
      const flushed = watchTimeFlush(watch);
      watch = flushed.state;
      if (flushed.seconds > 0) recordWatching(key, ledgerTitle, flushed.seconds);
    };

    /**
     * The furthest this session actually got. `resumeWriteAction` needs it to tell a
     * deliberate rewind to 0:00 from a session that never started — see
     * `./videoCoreResumeWrite.ts` for why the two must not write the same thing.
     */
    let sessionMaxSec = 0;
    /**
     * Whether the element has media to speak for. An emptied one — `video-core.tsx`
     * §965-970 pauses, drops `src` and calls `load()` — reports `currentTime === 0` for a
     * file that may have been playing a second earlier.
     */
    const hasMedia = (): boolean => video.readyState > 0 || video.currentSrc !== '';

    const persist = (finished = false): void => {
      const positionSec = video.currentTime;
      if (hasMedia() && Number.isFinite(positionSec)) {
        sessionMaxSec = Math.max(sessionMaxSec, positionSec);
      }
      const action = resumeWriteAction({
        positionSec,
        hasMedia: hasMedia(),
        sessionMaxSec,
        durationSec: video.duration,
        finished,
      });
      if (action === 'skip') return;
      try {
        const current = normalizeVideoCoreResumePositions(
          JSON.parse(localStorage.getItem(VIDEO_CORE_RESUME_STORAGE_KEY) ?? '[]'),
        );
        const next = action === 'clear'
          ? current.filter((position) => position.key !== key)
          : upsertVideoCoreResumePosition(current, {
              key,
              positionSec,
              updatedAt: Date.now(),
            });
        localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify(next));
        lastSavedSec = positionSec;
      } catch {
        // Continuity is best-effort; playback itself must never fail on storage errors.
      }
    };
    /*
     * The library's copy of the same progress (`media:reportPlayback`), so episode ticks,
     * progress bars, "Play next" and the Library's Continue shelf work for video — nothing
     * wrote them before. Every 10 s of play, plus every pause, finish and teardown.
     */
    const libraryPath = playbackInfo.localFile?.path ?? null;
    let lastReportedSec = -1;
    const reportToLibrary = (finished = false): void => {
      if (!libraryPath || typeof window.api?.reportMediaPlayback !== 'function') return;
      if (!hasMedia() && !finished) return;
      const positionSec = video.currentTime;
      const durationSec = video.duration;
      if (!Number.isFinite(positionSec) || !Number.isFinite(durationSec) || durationSec <= 0) return;
      lastReportedSec = positionSec;
      void window.api.reportMediaPlayback({
        path: libraryPath,
        positionSec,
        durationSec,
        finished,
      }).catch(() => undefined);
      // And the tracking library: past 90% an episode counts, advancing the title's progress
      // and status (plan → watching → completed). Below that it returns without touching disk.
      if (typeof window.api?.watchRecordLocalProgress === 'function') {
        void window.api.watchRecordLocalProgress({
          path: libraryPath,
          positionSec: finished ? durationSec : positionSec,
          durationSec,
        }).catch(() => undefined);
      }
    };
    const handleTimeUpdate = (): void => {
      watch = watchTimeSample(watch, {
        atMs: Date.now(),
        positionSec: video.currentTime,
        playing: !video.paused,
      });
      if (watchTimeShouldFlush(watch)) flushWatch();
      if (Math.abs(video.currentTime - lastSavedSec) >= 2) persist();
      if (Math.abs(video.currentTime - lastReportedSec) >= 10) reportToLibrary();
    };
    // `pause` and `ended` are the transition itself, so the interval ending at them was
    // playing for all of it — `watchTimeStop` says so rather than losing the fragment.
    const handlePause = (): void => {
      watch = watchTimeStop(watch, { atMs: Date.now(), positionSec: video.currentTime });
      flushWatch();
      persist();
      reportToLibrary();
    };
    const handleEnded = (): void => {
      watch = watchTimeStop(watch, { atMs: Date.now(), positionSec: video.currentTime });
      flushWatch();
      persist(true);
      reportToLibrary(true);
    };
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('pause', handlePause);
    video.addEventListener('ended', handleEnded);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('ended', handleEnded);
      // Teardown is not a transition — the element may still have been playing when the
      // file changed, so the open interval is closed but not credited past its last tick.
      watch = watchTimeInterrupt(watch);
      flushWatch();
      persist();
      reportToLibrary();
    };
  }, [disabled, playbackInfo, video]);

  return null;
}

function StudyPlayerSession({
  conn,
  playbackRequest,
  surface,
}: {
  conn: SeanimeConnection;
  playbackRequest: MediaWorkspacePlaybackRequest | null;
  surface: StudySurfaceKind;
}): React.ReactElement {
  const [state, setState] = React.useState<VideoCoreLifecycleState>(initialState);
  /** Read by the socket handler without re-subscribing it on every state change. */
  const stateRef = React.useRef(state);
  stateRef.current = state;
  /**
   * The element the workspace measures and watches for pointer activity.
   *
   * The slice, not the window: Blanc's toolbox player is 560×460 inside a window that
   * may be 3440 wide, and a workspace that recomposed on the screen's width would give
   * that player two 24rem docks it has no room for.
   */
  const sliceRef = React.useRef<HTMLElement | null>(null);
  const manager = useAtomValue(vc_subtitleManager);
  /*
    The study language leads VideoCore's preferred-subtitle-language order, once per study
    language (`seedPreferredSubtitleLanguage`). Upstream's `en,eng,english` opened every
    release that carries both a Japanese and an English track on the ENGLISH one (subtitle
    audit 6a/6g) — the manager reads this setting when it is built, which is after this
    effect, so its very first pick is already the study line. A user who later edits the
    setting in VideoCore's own preferences keeps their edit.
  */
  const setVideoCoreSettings = useSetAtom(vc_settingsRaw);
  React.useEffect(() => {
    let seededFor: string | null = null;
    try {
      seededFor = localStorage.getItem(VIDEO_CORE_SUB_LANG_SEED_STORAGE_KEY);
    } catch {
      return;
    }
    const studyLang = getStudyLang();
    setVideoCoreSettings((previous) => {
      const next = seedPreferredSubtitleLanguage(
        previous?.preferredSubtitleLanguage,
        studyLang,
        seededFor,
      );
      return next ? { ...previous, preferredSubtitleLanguage: next } : previous;
    });
    try {
      localStorage.setItem(VIDEO_CORE_SUB_LANG_SEED_STORAGE_KEY, shortLangTag(studyLang));
    } catch {
      // The seed simply runs again next time.
    }
  }, [setVideoCoreSettings]);
  const clientId = useAtomValue(clientIdAtom);
  const connected = useAtomValue(websocketConnectedAtom);
  const identityConfirmed = useAtomValue(clientIdentityConfirmedAtom);
  /** Every muxed subtitle event of the current stream, replayed into each new manager. */
  const subtitleRelay = React.useMemo(() => createSubtitleEventRelay<NonNullable<typeof manager>>(), []);
  const { sendEvent: sendVideoCoreEvent } = useVideoCoreEvents();
  /** Set below, once the video element is known; the backfill is created before it is. */
  const requestFullSubtitlePass = React.useRef<() => void>(() => undefined);
  /** Gets the sidecar to read a muxed MKV's subtitles end to end at least once per stream. */
  const subtitleBackfill = React.useMemo(
    () => createSubtitleBackfill({ requestFullPass: () => requestFullSubtitlePass.current() }),
    [],
  );
  const pulledPlaybackIds = React.useRef(new Set<string>());
  const pendingParserInfo = React.useRef<NativePlayer_PlaybackInfo | null>(null);
  const proofConfig = proofWindow().__SEANIME_CUE_PROOF_CONFIG__;
  const launchedRequestRef = React.useRef<number | null>(null);
  /**
   * The open that is outstanding right now, or null. Held in a ref rather than in state
   * because every write to it comes from a websocket message or a timer, and re-rendering
   * the player for "the sidecar is still alive" would be a render per step message.
   */
  const openProgressRef = React.useRef<
    { requestId: number; progress: DirectstreamOpenProgress } | null
  >(null);
  /**
   * The reason the sidecar last gave for abandoning an open, and the request it belonged to.
   *
   * One refused open reports itself TWICE and the two reports race: the websocket
   * `abort-open` carries the sidecar's words, the POST's own `!ok` carries only a status
   * code. Whichever lands second must not overwrite words with a guess, so the stated reason
   * is parked here and the HTTP branch prefers it when the request ids agree.
   */
  const statedAbortRef = React.useRef<{ requestId: number; text: string } | null>(null);
  const latestRequestRef = React.useRef(playbackRequest);
  /** The request now playing (or opening) straight from disk; see `openDirect`. */
  const directRequestRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    latestRequestRef.current = playbackRequest;
  }, [playbackRequest]);

  /*
   * The host withdrew the request (its "Back to the library", the Library segment, Escape):
   * stop the player. Clearing `playbackInfo` is what VideoCore itself treats as the end of a
   * stream — it pauses, unloads the element and tells the sidecar `video-terminated` — so
   * this is the same exit as its own Close Player, reached from the host.
   */
  const hadRequestRef = React.useRef(false);
  React.useEffect(() => {
    if (proofConfig) return;
    if (playbackRequest) {
      hadRequestRef.current = true;
      return;
    }
    if (!hadRequestRef.current) return;
    hadRequestRef.current = false;
    openProgressRef.current = null;
    statedAbortRef.current = null;
    directRequestRef.current = null;
    launchedRequestRef.current = null;
    setState(initialState);
  }, [playbackRequest, proofConfig, setState]);

  /** See `./directLocalPlayback.ts`: the file plays from disk when the sidecar will not. */
  const openDirect = React.useCallback(
    async (request: Extract<MediaWorkspacePlaybackRequest, { kind: 'local' }>, stated: string) => {
      // The sidecar refuses one open TWICE (socket `abort-open` and the POST's 500), sometimes
      // again seconds later. Only the first may hand off: a second would reset a video that is
      // already playing, and the POST's refusal would paint an error screen over it.
      if (directRequestRef.current === request.requestId) return;
      directRequestRef.current = request.requestId;
      let streamUrl: string | null = null;
      try {
        streamUrl = await window.api.mediaFileUrl(request.localFilePath);
      } catch {
        streamUrl = null;
      }
      if (latestRequestRef.current?.requestId !== request.requestId) return;
      if (!streamUrl) {
        // `mediaFileUrl` answers null for a path that is not on disk. The sidecar's own
        // reason ("not matched to a media") is true but beside the point for a file that is
        // gone, and sent the viewer to fix metadata for a video that no longer exists.
        void stated;
        setState({
          active: true,
          playbackInfo: null,
          playbackError: translateUi('mediaWorkspace.fileMissing', { path: request.localFilePath }),
          loadingState: null,
        });
        return;
      }
      const info = directLocalPlaybackInfo({
        requestId: request.requestId,
        localFilePath: request.localFilePath,
        streamUrl,
      });
      const startAtSec = request.startAtSec ?? loadResumePosition(info);
      setState({
        active: true,
        playbackInfo: directLocalPlaybackInfo({
          requestId: request.requestId,
          localFilePath: request.localFilePath,
          streamUrl,
          startAtSec,
        }),
        playbackError: null,
        loadingState: null,
      });
    },
    [setState],
  );

  /**
   * Stage 2, armed by the `watch` payload — where stage 1 disarms. Separate record because
   * the two stages measure different things: stage 1 watches the SIDECAR's silence, stage 2
   * watches the ELEMENT.
   */
  const mediaProgressRef = React.useRef<
    { requestId: number; progress: DirectstreamMediaProgress } | null
  >(null);
  /**
   * `ResumeTracker` reads this same atom in this same subtree and its resume write returns
   * early without a real element — and phase F of `retirement-step3-harness.mjs` exercises
   * that write on every run. So this handle is known to resolve, not assumed to.
   */
  const video = useAtomValue(vc_videoElement);
  const { getHMACTokenQueryParam } = useServerHMACAuth();

  /**
   * `identityConfirmed`, not just `connected`: a local open is addressed BY client id, and
   * the id is not settled the moment the socket reports open. The status fetch publishes one
   * from its HTTP response, then the server names its own over the socket ~10ms later. Both
   * ids are non-empty and both pass `!clientId`, so opening on the first one sent a POST the
   * server never associated with this socket — the reply went to a client that does not
   * exist here, and the effect re-ran on the real id and opened a SECOND stream, leaving the
   * first prepared and orphaned on the sidecar. Measured in a packaged build: two POSTs 2ms
   * apart, same file, different client ids. See `seanimeSocketPool.ts` for the fallback that
   * keeps a server which never sends `CLIENT_IDENTITY` from stranding this gate.
   */
  React.useEffect(() => {
    if (
      proofConfig
      || !playbackRequest
      || !connected
      || !clientId
      || !identityConfirmed
      || launchedRequestRef.current === playbackRequest.requestId
    ) {
      return;
    }
    launchedRequestRef.current = playbackRequest.requestId;
    const controller = new AbortController();

    if (playbackRequest.kind === 'stream') {
      const source = playbackRequest.stream;
      void (async () => {
        try {
          const needsProxy = Object.keys(source.playback.headers).length > 0;
          const tokenQuery = needsProxy
            ? await getHMACTokenQueryParam('/api/v1/proxy', '&')
            : '';
          if (controller.signal.aborted) return;
          const playableUrl = (url: string): string => needsProxy
            ? getProxyUrl(conn.baseUrl, url, source.playback.headers, tokenQuery)
            : url;
          const playbackInfo: VideoCore_VideoPlaybackInfo = {
            id: source.streamId,
            playbackType: 'onlinestream',
            streamUrl: playableUrl(source.playback.url),
            streamPath: `${source.seriesTitle} · ${translateUi('mediaWorkspace.episode', {
              number: source.episodeNumber,
            })}`,
            streamType: source.playback.kind === 'hls'
              ? 'hls'
              : source.playback.kind === 'mp4'
                ? 'native'
                : 'unknown',
            subtitleTracks: source.playback.subtitles.map((subtitle, index) => ({
              index,
              src: playableUrl(subtitle.url),
              label: subtitle.language,
              language: subtitle.language,
              default: subtitle.default,
            })),
            disableRestoreFromContinuity: true,
            ...(source.aniListId == null
              ? {}
              : {
                  onlinestreamParams: {
                    mediaId: source.aniListId,
                    episodeNumber: source.episodeNumber,
                    provider: source.playback.providerId,
                    server: source.playback.server,
                    quality: source.resolution,
                    dubbed: source.playback.dubbed,
                  },
                }),
          };
          const resumePositionSec = loadResumePosition(playbackInfo);
          if (resumePositionSec > 0) {
            playbackInfo.initialState = { currentTime: resumePositionSec };
          }
          setState({
            active: true,
            playbackInfo,
            playbackError: null,
            loadingState: null,
          });
        } catch (error) {
          if (controller.signal.aborted) return;
          setState({
            active: true,
            playbackInfo: null,
            playbackError: error instanceof Error ? error.message : String(error),
            loadingState: null,
          });
        }
      })();
      return () => {
        controller.abort();
        if (launchedRequestRef.current === playbackRequest.requestId) {
          launchedRequestRef.current = null;
        }
      };
    }

    const localRequest = playbackRequest;
    // Say "opening" the moment the request lands, not after the library scan below: that
    // scan can take seconds (11 s measured for a folder the sidecar had never seen), and
    // until a loading state existed the old video sat frozen, or the library showed, with no
    // sign anything was happening (transition audit 2026-09-23). Clearing `playbackInfo` here
    // also retires the previous stream BEFORE the new POST, not in a race with it.
    setState({
      active: false,
      playbackInfo: null,
      playbackError: null,
      loadingState: translateUi('mediaWorkspace.openingLocal'),
    });
    void (async () => {
    // A file that is not on disk is known in one call; without this it waited out the whole
    // library scan below (11.4 s measured) before saying so (transition audit 2026-09-23).
    // `mediaFileUrl` answers null for a missing path — the same test `openDirect` relies on.
    const onDisk = await window.api.mediaFileUrl(localRequest.localFilePath).catch(() => null);
    if (controller.signal.aborted) return;
    if (!onDisk) {
      setState({
        active: true,
        playbackInfo: null,
        playbackError: translateUi('mediaWorkspace.fileMissing', { path: localRequest.localFilePath }),
        loadingState: null,
      });
      return;
    }
    /*
      Not an anime? Then the sidecar cannot stream it — its directstream only serves files it
      has matched to an anime series — and asking it first cost a full library scan of the
      folder (7-11 s measured for a drama or a film) before it refused and the file played
      from disk anyway. The app's own library already says what the file is, so a file it
      knows as non-anime, with no AniList/MAL id, goes straight to disk playback.
    */
    const libraryItem = typeof window.api?.listMedia === 'function'
      ? await window.api.listMedia()
        .then((items) => {
          const wanted = normalizeLibraryPath(localRequest.localFilePath);
          return items.find((item) => normalizeLibraryPath(item.path ?? '') === wanted) ?? null;
        })
        .catch(() => null)
      : null;
    if (controller.signal.aborted) return;
    const category = (libraryItem as { category?: string } | null)?.category;
    if (libraryItem && !libraryItem.anilistId && !libraryItem.malId && category !== 'anime') {
      void openDirect(localRequest, '');
      return;
    }
    /*
      The sidecar resolves a local path against its OWN `local_files` table, not
      the disk, so a folder it has never scanned answers 200 and then aborts the
      preparation over the socket — `could not find local file`, for a file that
      is right there. See `./seanimeLibrary.ts` for the measurement.

      Ahead of the channel bookkeeping below, deliberately. A first scan takes
      real time, and the ticket, the generation and the silence watchdog are all
      armed on the premise that a POST has just gone out; holding them open
      across a scan would have the watchdog time out a launch that is working.
      Nothing here touches the open protocol — it runs before it starts.
    */
    await ensureSeanimeLibraryCovers(localRequest.localFilePath, {
      /*
        This app's library already carries the AniList id for the file, matched
        once and stored. Seanime's scanner re-derives it from the filename and,
        for a short generic title, gets it wrong. Handing over what is already
        known beats asking it to guess again.
      */
      seedMediaIds: async () => {
        const folder = normalizeLibraryPath(parentFolderOf(localRequest.localFilePath));
        const library = await window.api.listMedia();
        return [...new Set(
          library
            .filter((item) => normalizeLibraryPath(parentFolderOf(item.path ?? '')) === folder)
            .map((item) => item.anilistId)
            .filter((id): id is number => typeof id === 'number' && id > 0),
        )];
      },
      request: (path, init) => fetch(`${conn.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'X-Seanime-Token': conn.token,
          'X-Seanime-Client-Id': clientId,
          'X-Seanime-Client-Id-Proof': getClientIdProof(),
          'X-Seanime-Client-Platform': __clientPlatform__,
          'Content-Type': 'application/json',
          ...init?.headers,
        },
      }),
      signal: controller.signal,
    });
    if (controller.signal.aborted) return;

    // Armed BEFORE the request, not in its `then`: a 200 is not evidence the preparation
    // survived (see `./directstreamOpenRecovery.ts`), and the sidecar's first message
    // can land before the fetch promise resolves.
    openProgressRef.current = {
      requestId: localRequest.requestId,
      progress: { attempts: 1, lastSignalAt: Date.now(), playbackArrived: false },
    };

    // A launch SUPERSEDES rather than queues: it is the newest intent there is, so it is
    // already in the right order behind an older POST, and making the user wait behind one
    // that may never answer buys ordering that is correct anyway at the price of a play
    // button that does nothing. The queueing door is the stricter rule and stays unwired —
    // `directstreamOpenSupersede`'s header says which observation would justify reaching
    // for it. This also closes the recovery door behind the launch: every stage-1 recovery
    // for the file the user just left now drops as `superseded`.
    const ticket: DirectstreamOpenTicket = {
      requestId: localRequest.requestId,
      kind: 'launch',
    };
    openChannel = directstreamOpenSupersede(openChannel, ticket);
    // Seeded from storage before the first mint of this realm, and a no-op on every mint
    // after it. The sidecar outlives a renderer reload and orders by CLIENT ID, which also
    // outlives one; only the counter used to reset, so a reloaded renderer minted 1 against
    // a bar of 3 and had every open refused thereafter.
    openGenerations = directstreamOpenGenerationsRestored(
      openGenerations,
      clientId,
      readStoredOpenGeneration(),
    );
    // Minted here and ONLY here. Every recovery for this request re-sends this same number,
    // which is the equal-generation case `AcceptOpenGeneration` accepts on purpose.
    openGenerations = directstreamOpenGenerationFor(openGenerations, localRequest.requestId);
    // Written before the POST, not after: the number is spent the moment it goes on the wire,
    // and a crash between the two must not let the next realm reissue it.
    persistOpenGeneration(clientId, openGenerations.generation);

    // Cleared before the POST goes out, never after: the sidecar's abort can only arrive
    // once this request is on the wire, so a later clear would erase the reason it carries.
    statedAbortRef.current = null;

    await postDirectstreamOpen(
      conn,
      clientId,
      localRequest.localFilePath,
      openGenerations.generation,
      controller.signal,
    )
      .then(async (response) => {
        // The server ANSWERED — whatever it said. This, and never the abort below, is what
        // frees the channel; see the hole named at the top of `directstreamOpenChannel.ts`.
        settleDirectstreamOpen(ticket);
        if (!response.ok) {
          const body = await response.text();
          if (sidecarCannotServeFile(body)) {
            openProgressRef.current = null;
            void openDirect(localRequest, describeLocalOpenFailure(response.status, body));
            return;
          }
          throw new Error(describeLocalOpenFailure(response.status, body));
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          // Deliberately does NOT settle. An aborted fetch abandons the RESPONSE, never the
          // work: `PlayLocalFile` has already called `BeginOpen` and runs to completion. The
          // channel keeps holding this ticket so nothing races the preparation we walked away
          // from, and only a real answer — or, for a queued launch, the module's own deadline
          // — can release it.
          return;
        }
        // A transport failure IS an end to the exchange, so it settles. Idempotent: a `!ok`
        // response already settled this ticket in the branch above.
        settleDirectstreamOpen(ticket);
        // A refused open reports itself, so the silence watchdog has nothing left to do.
        openProgressRef.current = null;
        if (directRequestRef.current === localRequest.requestId) return;
        // The status code is a guess about the cause; the sidecar's own abort reason is not.
        // When both describe this same open, the words win.
        const stated = statedAbortRef.current;
        setState({
          active: true,
          playbackInfo: null,
          playbackError: stated && stated.requestId === localRequest.requestId
            ? stated.text
            : error instanceof Error ? error.message : String(error),
          loadingState: null,
        });
      });
    })();

    return () => {
      controller.abort();
      if (launchedRequestRef.current === localRequest.requestId) {
        launchedRequestRef.current = null;
      }
    };
  }, [clientId, conn, connected, identityConfirmed, openDirect, playbackRequest, proofConfig]);

  /**
   * The recovery. A local open that the sidecar cancelled mid-preparation answers 200 and
   * then says nothing at all, so silence is the only symptom there is — see
   * `./directstreamOpenRecovery.ts` for the measured sequence and why the cancel comes
   * from adopted code we do not edit.
   *
   * Deliberately its own effect. Folding it into the launch effect would tie the deadline
   * to that effect's cleanup, and StrictMode's double-invoke — the very thing that makes
   * this defect deterministic in Blanc — tears that cleanup down and re-runs it.
   */
  React.useEffect(() => {
    if (proofConfig || !playbackRequest || playbackRequest.kind !== 'local' || !clientId) {
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setInterval(() => {
      const outstanding = openProgressRef.current;
      // A request that has moved on is not this effect's business: the launch effect has
      // already armed a fresh record for the new one.
      if (!outstanding || outstanding.requestId !== playbackRequest.requestId) return;

      const now = Date.now();
      const stall = (): void => {
        openProgressRef.current = null;
        setState({
          active: true,
          playbackInfo: null,
          playbackError: translateUi('mediaWorkspace.openStalled'),
          loadingState: null,
        });
      };

      switch (directstreamOpenVerdict(outstanding.progress, now)) {
        case 'playing':
          openProgressRef.current = null;
          break;
        case 'waiting':
          break;
        case 'reopen': {
          // THE GATE — slice 44. The verdict decides whether this open looks dead; the
          // channel decides whether a POST about it may leave. A recovery is dropped and
          // never queued, because by the time the channel frees, the situation that formed
          // the opinion has moved, and a POST that outlives its justification is the whole
          // defect (`directstreamOpenChannel.ts`, rule 3).
          const { channel, decision } = directstreamOpenRequest(openChannel, {
            requestId: playbackRequest.requestId,
            kind: 'recovery',
          });
          openChannel = channel;
          if (decision.action !== 'issue') {
            // No attempt is counted and no clock is re-armed: nothing was sent, so the stage
            // must be free to re-form the same opinion on the next tick, which is exactly
            // what happens the moment the outstanding POST answers. What must NOT survive
            // that is silence — a gate that can withhold the POST may not also withhold the
            // report, so a refusal that outlives the deadline still speaks.
            if (directstreamOpenPresumedDead(outstanding.progress, now)) stall();
            break;
          }
          // Counted and re-armed together, so the next tick reads `waiting` rather than
          // firing a second request into the first one's window.
          outstanding.progress = directstreamOpenReopened(outstanding.progress, now);
          // The SAME generation the launch minted. A recovery is a re-open of the same
          // request, which `AcceptOpenGeneration` accepts as equal; minting a new one here
          // would raise the bar on the sidecar and refuse the user's next real launch.
          const recoveryTicket = decision.ticket;
          void postDirectstreamOpen(
            conn,
            clientId,
            playbackRequest.localFilePath,
            openGenerations.generation,
            controller.signal,
          )
            .then(() => settleDirectstreamOpen(recoveryTicket))
            .catch(() => {
              // A failed re-open is not reported here: the record stays armed and the next
              // silence window reaches `failed`, which is the one place this speaks. The
              // channel is settled only for a real answer — an abort leaves the sidecar
              // working, so this holds, exactly as the launch path does.
              if (!controller.signal.aborted) settleDirectstreamOpen(recoveryTicket);
            });
          break;
        }
        case 'failed':
          stall();
          break;
      }
    }, 1_000);

    return () => {
      window.clearInterval(timer);
      controller.abort();
    };
  }, [clientId, conn, playbackRequest, proofConfig]);

  /**
   * The browser could not decode the file. Re-open it through Seanime's transcoder.
   *
   * `The Big O - 13` is HEVC + **FLAC**, and Chromium dies ~1.8s in with
   * `PIPELINE_ERROR_DECODE` on an audio packet. The adopted player's own reaction is to
   * try HLS against the same non-HLS URL, fail unrecoverably, and tear the surface down —
   * so an audio codec took out the transcript and the mining panel with it. See
   * `../shared/mediastreamTranscode.ts` for the measurement and for why the trigger is a
   * real error rather than a codec table.
   *
   * Swapping `streamUrl` is the whole switch: the adopted HLS hook keys on the `.m3u8`
   * extension or on `streamType === 'hls'` (`video-core-hls.ts:41,88`), and both are set.
   * Position is carried across so the switch is invisible apart from a short rebuffer.
   */
  const transcodeAttemptedRef = React.useRef<string | null>(null);
  /*
    HLS.js issues the playlist and segment requests itself and the sidecar's mediastream
    endpoints answer 401 without a token, so the header goes on inside the request. Bound
    to this component's lifetime rather than to the transcode switch: the fallback can fire
    from an event handler at any moment, and installing it there would race the first
    fetch. See `./seanimeMediaAuth.ts` for why there is no supported hook to use instead.
  */
  React.useEffect(
    () => installSeanimeMediaAuth({ baseUrl: conn.baseUrl, token: conn.token }),
    [conn.baseUrl, conn.token],
  );

  React.useEffect(() => {
    if (proofConfig || !video || !playbackRequest || playbackRequest.kind !== 'local') {
      return undefined;
    }
    const localPath = playbackRequest.localFilePath;

    const switchToTranscode = (resumeSec: number): void => {
      // Once per file per mount. The element raises `error` again while the replacement
      // source loads, and a second request would restart the transcoder underneath the
      // first one.
      if (transcodeAttemptedRef.current === localPath) return;
      transcodeAttemptedRef.current = localPath;

      void (async () => {
        const api = (path: string, init?: RequestInit): Promise<Response> =>
          fetch(`${conn.baseUrl}${path}`, {
            ...init,
            headers: {
              'X-Seanime-Token': conn.token,
              'X-Seanime-Client-Id': clientId ?? '',
              'X-Seanime-Client-Id-Proof': getClientIdProof(),
              'X-Seanime-Client-Platform': __clientPlatform__,
              'Content-Type': 'application/json',
              ...init?.headers,
            },
          });
        // The transcoder ships disabled and the sidecar datadir is disposable, so this
        // path establishes what it needs rather than assuming it.
        const enabled = await ensureTranscodeEnabled(api).catch(() => false);
        if (!enabled) return;
        const container = await requestTranscodeContainer(
          api,
          localPath,
          clientId ?? '',
        ).catch(() => null);
        // A failed rescue leaves the original decode error on screen rather than
        // replacing it with a second, less relevant one.
        if (!container) return;

        persistTranscodeMemo(localPath);
        setState((previous) => {
          if (!previous.playbackInfo) return previous;
          return {
            ...previous,
            active: true,
            playbackError: null,
            playbackInfo: {
              ...previous.playbackInfo,
              streamUrl: transcodeStreamUrl(conn.baseUrl, container.streamUrl),
              streamType: 'hls',
              ...(resumeSec > 0 ? { initialState: { currentTime: resumeSec } } : {}),
            },
          };
        });
      })();
    };

    // Already known undecodable — switch before the element wastes a second failing, so
    // a file the user returns to just plays.
    if (pathNeedsTranscode(readTranscodeMemo(), localPath)) {
      switchToTranscode(
        playbackRequest.startAtSec && playbackRequest.startAtSec > 0
          ? playbackRequest.startAtSec
          : 0,
      );
      return undefined;
    }

    const onError = (): void => {
      if (!isTranscodableMediaError(video.error?.code)) return;
      switchToTranscode(Number.isFinite(video.currentTime) ? video.currentTime : 0);
    };
    video.addEventListener('error', onError);
    return () => video.removeEventListener('error', onError);
  }, [clientId, conn, playbackRequest, proofConfig, video]);

  /**
   * STAGE 2 — the `watch` arrived and no media followed. REPORT ONLY.
   *
   * Stage 1 disarms on the `watch`, correctly: it measures the sidecar's silence, and a
   * `watch` proves the sidecar is talking. But the payload is a promise of playback, not
   * playback — measured repeatedly, the whole study dock rendered over a `<video>` at
   * `readyState 0` / `networkState 0` on an empty MediaSource, forever, with no error.
   *
   * **This deliberately does not re-open.** Two attempts to make it re-open were reverted:
   * a recovery POST calls `BeginOpen` → `beginSubtitleSeek`, which stops every active
   * subtitle stream, and a POST issued against one attempt can land inside the NEXT
   * attempt's healthy stream. `DIRECTSTREAM_MEDIA_REPORT_ONLY` makes the verdict skip
   * `reopen` entirely, so there is no `postDirectstreamOpen` on this path at all and the
   * destructive mechanism is absent by construction rather than by argument.
   *
   * What it buys is the part that never needed a POST: a forever-spinner becomes a stated
   * error. See `./directstreamOpenRecovery.ts` for the full history before changing it.
   */
  React.useEffect(() => {
    if (proofConfig || !playbackRequest || playbackRequest.kind !== 'local' || !clientId) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      const outstanding = mediaProgressRef.current;
      if (!outstanding || outstanding.requestId !== playbackRequest.requestId) return;

      outstanding.progress = {
        ...outstanding.progress,
        elementEverObserved: outstanding.progress.elementEverObserved || video != null,
        lastObservation: video
          ? {
              kind: 'element',
              readyState: video.readyState,
              networkState: video.networkState,
              bufferedRanges: video.buffered ? video.buffered.length : 0,
            }
          : { kind: 'unreadable' },
      };

      const verdict = directstreamMediaVerdict(
        outstanding.progress,
        Date.now(),
        DIRECTSTREAM_MEDIA_SILENCE_MS,
        DIRECTSTREAM_MEDIA_REPORT_ONLY,
      );
      if (verdict !== 'failed') return;

      mediaProgressRef.current = null;
      setState({
        active: true,
        playbackInfo: null,
        playbackError: translateUi('mediaWorkspace.openStalled'),
        loadingState: null,
      });
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [clientId, playbackRequest, proofConfig, video]);

  // A manager VideoCore builds (or rebuilds) gets every event of the stream so far: the
  // sidecar does not resend a cue for it, and a fresh manager starts with an empty cache.
  React.useEffect(() => {
    subtitleRelay.attach(manager);
    if (manager && subtitleRelay.received) {
      publishProof({ managerClass: manager.constructor.name, subtitleEvents: subtitleRelay.received });
    }
  }, [manager, subtitleRelay]);

  // Each seek makes the sidecar drop its subtitle read and restart it past the seek point, so
  // cues before that point (and in its own cluster) may never be sent. Once the seeks settle,
  // a seek message at exactly 0 has it read the whole file again; see subtitleBackfill.ts.
  // Local files only: for a torrent or debrid stream that read would pull the whole file.
  const backfillPlaybackId = state.playbackInfo?.id ?? null;
  const backfillEnabled = Boolean(
    !proofConfig
      && state.playbackInfo?.localFile
      && state.playbackInfo.mkvMetadata?.subtitleTracks?.length,
  );
  React.useEffect(() => {
    requestFullSubtitlePass.current = () => {
      sendVideoCoreEvent('video-seeked', {
        currentTime: 0,
        duration: video?.duration ?? 0,
        paused: video?.paused ?? true,
      });
      publishProof({ subtitleBackfills: subtitleBackfill.requested });
    };
  });
  React.useEffect(() => {
    subtitleBackfill.reset(backfillEnabled);
    if (!video || !backfillEnabled) return undefined;
    const onStreamStarted = () => subtitleBackfill.onStreamStarted();
    const onSeeked = () => subtitleBackfill.onSeeked();
    video.addEventListener('loadedmetadata', onStreamStarted);
    video.addEventListener('seeked', onSeeked);
    // The media may have loaded before this listener was attached.
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) onStreamStarted();
    return () => {
      video.removeEventListener('loadedmetadata', onStreamStarted);
      video.removeEventListener('seeked', onSeeked);
      subtitleBackfill.reset(false);
    };
  }, [backfillEnabled, backfillPlaybackId, subtitleBackfill, video]);

  /**
   * The request the slice is showing NOW, for async work that must not land on a later one.
   * Written in an effect rather than during render so a discarded render cannot move it.
   */
  const onMessage = React.useCallback(
    (message: ServerMessage) => {
      // Every native-player message is a sign of life for the open in flight, whatever it
      // says. The recovery below measures SILENCE, so this has to run for all of them —
      // including step messages this switch does not otherwise act on.
      const outstanding = openProgressRef.current;
      if (outstanding) {
        outstanding.progress = { ...outstanding.progress, lastSignalAt: Date.now() };
      }

      switch (message.type) {
        case 'open-and-await':
          // A new stream: the previous one's cues must not reach its manager.
          subtitleRelay.reset();
          subtitleBackfill.reset(false);
          setState({
            // Do not mount VideoCore until the following "watch" payload supplies real
            // playback info. Mounting it with null info terminates the just-opened
            // directstream preparation and makes the parser pull fail intermittently.
            //
            // Slice 24 named that intermittency: the adopted lifecycle effect dispatches
            // `video-terminated` from its own `if (!state.playbackInfo)` branch, and the
            // sidecar cancels the in-flight preparation without telling anyone. It is not
            // avoidable from here — this is one of THREE deps of that effect — so it is
            // recovered from instead, in the watchdog below.
            active: false,
            playbackInfo: null,
            playbackError: null,
            loadingState: translateUi('mediaWorkspace.openingLocal'),
          });
          break;
        case 'watch': {
          const nativeInfo = message.payload as NativePlayer_PlaybackInfo;
          // An explicit destination outranks the stored resume position; nothing else
          // does. `?? ` and not `||`: a requested 0 is the top of the file, which must
          // still suppress the resume rather than fall through to it.
          const requestedSec = requestedStartSec(playbackRequest, nativeInfo);
          const resumePositionSec = requestedSec ?? (
            !proofConfig || proofConfig.verifyContinuity
              ? loadResumePosition(nativeInfo)
              : 0
          );
          setState({
            active: true,
            playbackInfo: toVideoCorePlaybackInfo(
              nativeInfo,
              proofConfig,
              resumePositionSec,
            ),
            playbackError: null,
            loadingState: null,
          });
          if (openProgressRef.current) {
            openProgressRef.current.progress = {
              ...openProgressRef.current.progress,
              playbackArrived: true,
            };
            // Stage 1 stops here by design; stage 2's window starts here.
            mediaProgressRef.current = {
              requestId: openProgressRef.current.requestId,
              progress: {
                playbackArrived: true,
                watchArrivedAt: Date.now(),
                elementEverObserved: false,
                lastObservation: null,
                stageAttempts: 0,
              },
            };
          }
          if (proofConfig) pendingParserInfo.current = nativeInfo;
          break;
        }
        case 'subtitle-event': {
          const events = subtitleEvents(message.payload);
          if (!events.length) break;
          if (proofConfig) {
            const tracks = [...new Set(events.map((event) => event.trackNumber))];
            console.info(
              `[cue-proof] subtitle-event ${events.length} cue(s), tracks ${tracks.join(', ')}`,
            );
          }
          // Delivered to the manager attached NOW, not the one this handler closed over — that
          // one may already be destroyed — and kept for any manager built after it.
          subtitleRelay.receive(events);
          subtitleBackfill.onEvents();
          if (manager) {
            publishProof({ managerClass: manager.constructor.name, subtitleEvents: subtitleRelay.received });
          }
          break;
        }
        case 'abort-open': {
          // The sidecar said so out loud, so there is nothing for the watchdog to find.
          openProgressRef.current = null;
          // Playing from disk: the sidecar has no stream of ours left to abort.
          if (playbackRequest && directRequestRef.current === playbackRequest.requestId) break;
          const stated = describeDirectstreamAbort(message.payload);
          if (!stated) {
            // A reasonless abort is the sidecar retiring a stream a newer open replaced.
            // Showing an error screen for it would invent a failure the viewer did not have.
            // And while that newer open is still loading, going idle would flash the library
            // between the two videos (103 ms measured on an episode switch), so the loader
            // stays up.
            if (stateRef.current.loadingState) break;
            setState(initialState);
            break;
          }
          statedAbortRef.current = { requestId: playbackRequest?.requestId ?? -1, text: stated };
          if (playbackRequest?.kind === 'local' && sidecarCannotServeFile(message.payload)) {
            // Not an anime the sidecar has matched — play it from disk instead of failing.
            setState({
              active: false,
              playbackInfo: null,
              playbackError: null,
              loadingState: translateUi('mediaWorkspace.openingLocal'),
            });
            void openDirect(playbackRequest, stated);
            break;
          }
          setState({
            active: true,
            playbackInfo: null,
            playbackError: stated,
            loadingState: null,
          });
          break;
        }
        case 'error':
          openProgressRef.current = null;
          setState({
            active: true,
            playbackInfo: null,
            playbackError: String(
              message.payload ?? translateUi('mediaWorkspace.unknownPlaybackError'),
            ),
            loadingState: null,
          });
          break;
      }
    },
    [conn, manager, openDirect, playbackRequest, proofConfig],
  );

  useWebsocketMessageListener<ServerMessage>({
    // Directstream's local-file lifecycle is the native-player channel even though
    // Study OS renders it with the web VideoCore component.
    type: WSEvents.NATIVE_PLAYER,
    onMessage,
    deps: [manager, proofConfig],
  });

  return (
    <>
      <CueProofDriver conn={conn} />
      <ResumeTracker
        playbackInfo={state.playbackInfo}
        disabled={Boolean(proofConfig && !proofConfig.verifyContinuity)}
      />
      {/*
        VideoCore is mounted unconditionally, exactly as upstream's own host does
        (native-player.tsx renders <VideoCore> with no `active` gate and lets the
        component read state.active/playbackInfo as props). Gating the mount on
        state.active looks tidier but breaks two invariants: unmounting drops
        `vc_activePlayerId` to null with nothing to restore it — which silently
        disables every isActivePlayer-gated DOM listener, so the server never gets
        the loaded-metadata event that starts subtitle streaming — and the unmount
        also dispatches `video-terminated`, killing a stream that is about to be
        replayed. The slice is hidden by CSS while idle instead.
      */}
      <section
        ref={sliceRef}
        className="study-player-slice"
        // `loading` keeps the slice — and VideoCore's own loading overlay — on screen while a
        // stream is prepared. Hidden then, the viewer got no feedback at all for an open, and
        // the library flashed between two videos.
        data-study-player={state.active ? 'active' : state.loadingState ? 'loading' : 'idle'}
        data-cue-proof-phase={proofWindow().__SEANIME_CUE_PROOF__?.phase ?? 'idle'}
      >
        <VideoCore
          id="study-media"
          state={state}
          inline
          inlineClassName="study-video-core"
          onTerminateStream={() => setState(initialState)}
          // A pick in VideoCore's own CC menu is as explicit as one in the study bar, and is
          // remembered for this file and its series the same way.
          onSubtitlePreferenceChange={(selection) => {
            rememberStudyTrackChoice(
              studySubtitleSource(
                stateRef.current.playbackInfo,
                playbackRequest?.kind === 'local' ? playbackRequest.localFilePath : null,
              ),
              selection ? { language: selection.language, label: selection.label } : null,
            );
          }}
          onLoadedMetadata={(event) => {
            if (!proofConfig) return;
            const video = event.currentTarget;
            video.muted = true;
            video.playbackRate = 1;
            video.pause();
            // Chromium emits one zero-position `seeked` while establishing a new
            // media resource. In the split-file proof only, suppress that synthetic
            // bootstrap signal so VideoCore does not ask the sidecar to replace the
            // MKV subtitle generation that is about to start.
            video.addEventListener(
              'seeked',
              (seekEvent) => {
                if (video.currentTime <= 0.05) seekEvent.stopImmediatePropagation();
              },
              { capture: true, once: true },
            );

            const nativeInfo = pendingParserInfo.current;
            if (!nativeInfo || pulledPlaybackIds.current.has(nativeInfo.id)) return;
            pulledPlaybackIds.current.add(nativeInfo.id);
            // VideoCore emits an initial seek while it establishes the MP4's media
            // timeline. Let that settle before opening the MKV parser response or the
            // sidecar correctly cancels the just-opened subtitle stream.
            window.setTimeout(() => {
              void consumeParserStream(conn, nativeInfo).catch((error: unknown) => {
                const text = error instanceof Error ? error.message : String(error);
                publishProof({ phase: 'failed', error: text });
                console.error(`[cue-proof] ${text}`);
              });
            }, 250);
          }}
        />
        {/*
          The workspace engine wraps the overlay, never the player. `<VideoCore>` above
          stays outside it and stays unconditionally mounted — that rule is older than
          this redesign and unmounting it drops `vc_activePlayerId`, which silently
          disables the DOM listeners that start subtitle streaming.
        */}
        {state.active && (
          <StudyWorkspaceProvider surface={surface} hostRef={sliceRef}>
            <StudyOverlay
              playbackInfo={state.playbackInfo}
              localFilePath={
                playbackRequest?.kind === 'local' ? playbackRequest.localFilePath : null
              }
            />
          </StudyWorkspaceProvider>
        )}
        {/*
          "Up next" at a real `ended` only. The full workspace alone: the toolbox player
          has its own open path, and raising the workspace's open event from it would
          throw the full-screen overlay up behind a toolbox window.
        */}
        {surface === 'workspace' && playbackRequest?.kind === 'local' && !proofConfig && (
          <StudyUpNextCard localFilePath={playbackRequest.localFilePath} />
        )}
      </section>
    </>
  );
}

export default function StudyPlayerSlice({
  conn,
  playbackRequest,
  surface = 'workspace',
}: {
  conn: SeanimeConnection;
  playbackRequest: MediaWorkspacePlaybackRequest | null;
  /**
   * Which surface this slice is. Two can be mounted in one window, and the workspace
   * layout is stored per surface so the small toolbox player cannot overwrite the
   * arrangement of the full one.
   */
  surface?: StudySurfaceKind;
}): React.ReactElement {
  return (
    <VideoCoreProvider id="study-media">
      <StudyPlayerSession
        conn={conn}
        playbackRequest={playbackRequest}
        surface={surface}
      />
    </VideoCoreProvider>
  );
}

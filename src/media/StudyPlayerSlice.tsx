/**
 * The Phase-3 player/overlay seam.
 *
 * Seanime's web VideoCore creates VideoCoreSubtitleManager, while its native-player
 * component owns the websocket "subtitle-event" forwarding path. Study OS uses the web
 * player with Seanime's local-file directstream, so this small host supplies that missing
 * bridge without editing adopted source.
 */
import React from 'react';
import { useAtomValue } from 'jotai';
import type {
  MKVParser_SubtitleEvent,
  NativePlayer_PlaybackInfo,
  NativePlayer_SubtitleEventsPayload,
} from '../../vendor/seanime/generated/types';
import { useWebsocketMessageListener } from '@/app/(main)/_hooks/handle-websockets';
import {
  clientIdAtom,
  websocketConnectedAtom,
} from '@/app/websocket-provider';
import {
  VideoCore,
  VideoCoreProvider,
  vc_subtitleManager,
} from '@/app/(main)/_features/video-core/video-core';
import type {
  VideoCoreLifecycleState,
  VideoCore_VideoPlaybackInfo,
} from '@/app/(main)/_features/video-core/video-core.atoms';
import type {
  SubtitleManagerCueChangeEvent,
} from '@/app/(main)/_features/video-core/video-core-subtitles';
import { getClientIdProof } from '@/lib/server/client-id';
import { WSEvents } from '@/lib/server/ws-events';
import { __clientPlatform__ } from '@/types/constants';
import type { SeanimeConnection } from '../shared/seanime';
import { stripAssCueText } from '../shared/videoCoreStudy';
import VideoCoreStudyOverlay from './VideoCoreStudyOverlay';

type ServerMessage = {
  type: string;
  payload?: unknown;
};

type CueProofConfig = {
  mkvPath: string;
  videoUrl: string;
};

type CueProofState = {
  phase: string;
  clientId?: string;
  playStatus?: number;
  parserBytes?: number;
  managerClass?: string;
  subtitleEvents?: number;
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
    disableRestoreFromContinuity: true,
    initialState: { paused: false },
  };
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
}: {
  playbackInfo: VideoCore_VideoPlaybackInfo | null;
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
      onManagerReady={onManagerReady}
      onCueChange={onCueChange}
    />
  );
}

function StudyPlayerSession({ conn }: { conn: SeanimeConnection }): React.ReactElement {
  const [state, setState] = React.useState<VideoCoreLifecycleState>(initialState);
  const manager = useAtomValue(vc_subtitleManager);
  const pendingEvents = React.useRef<MKVParser_SubtitleEvent[]>([]);
  const pulledPlaybackIds = React.useRef(new Set<string>());
  const proofConfig = proofWindow().__SEANIME_CUE_PROOF_CONFIG__;

  React.useEffect(() => {
    if (!manager || !pendingEvents.current.length) return;
    const batch = pendingEvents.current.splice(0);
    publishProof({
      managerClass: manager.constructor.name,
      subtitleEvents:
        (proofWindow().__SEANIME_CUE_PROOF__?.subtitleEvents ?? 0) + batch.length,
    });
    void manager.onSubtitleEvents(batch);
  }, [manager]);

  const onMessage = React.useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case 'open-and-await':
          setState({
            active: true,
            playbackInfo: null,
            playbackError: null,
            loadingState: 'Opening local file',
          });
          break;
        case 'watch': {
          const nativeInfo = message.payload as NativePlayer_PlaybackInfo;
          setState({
            active: true,
            playbackInfo: toVideoCorePlaybackInfo(nativeInfo, proofConfig),
            playbackError: null,
            loadingState: null,
          });
          if (proofConfig && !pulledPlaybackIds.current.has(nativeInfo.id)) {
            pulledPlaybackIds.current.add(nativeInfo.id);
            void consumeParserStream(conn, nativeInfo).catch((error: unknown) => {
              const text = error instanceof Error ? error.message : String(error);
              publishProof({ phase: 'failed', error: text });
              console.error(`[cue-proof] ${text}`);
            });
          }
          break;
        }
        case 'subtitle-event': {
          const events = subtitleEvents(message.payload);
          if (!events.length) break;
          if (manager) {
            publishProof({
              managerClass: manager.constructor.name,
              subtitleEvents:
                (proofWindow().__SEANIME_CUE_PROOF__?.subtitleEvents ?? 0) + events.length,
            });
            void manager.onSubtitleEvents(events);
          } else {
            pendingEvents.current.push(...events);
          }
          break;
        }
        case 'abort-open':
          setState(initialState);
          break;
        case 'error':
          setState({
            active: true,
            playbackInfo: null,
            playbackError: String(message.payload ?? 'Unknown playback error'),
            loadingState: null,
          });
          break;
      }
    },
    [conn, manager, proofConfig],
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
      {state.active && (
        <section
          className="study-player-slice"
          data-study-player="active"
          data-cue-proof-phase={proofWindow().__SEANIME_CUE_PROOF__?.phase ?? 'idle'}
        >
          <VideoCore
            id="study-media"
            state={state}
            inline
            inlineClassName="study-video-core"
            onTerminateStream={() => setState(initialState)}
            onLoadedMetadata={(event) => {
              if (!proofConfig) return;
              event.currentTarget.muted = true;
              event.currentTarget.playbackRate = 1;
              void event.currentTarget.play().catch(() => undefined);
            }}
          />
          <StudyOverlay playbackInfo={state.playbackInfo} />
        </section>
      )}
    </>
  );
}

export default function StudyPlayerSlice({
  conn,
}: {
  conn: SeanimeConnection;
}): React.ReactElement {
  return (
    <VideoCoreProvider id="study-media">
      <StudyPlayerSession conn={conn} />
    </VideoCoreProvider>
  );
}

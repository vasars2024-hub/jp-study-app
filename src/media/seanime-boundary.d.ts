/**
 * The typed boundary between Study OS and the adopted Seanime source.
 *
 * Why this file exists
 * --------------------
 * `vendor/seanime-web/` is third-party source, copied verbatim from the pinned checkout
 * and deliberately never hand-edited (same policy that makes it lint-excluded). It is
 * written against upstream's compiler settings, so under THIS repo's stricter
 * `noImplicitAny` + `module: commonjs` it produces 165 diagnostics — none of which we are
 * willing to "fix" by editing someone else's code.
 *
 * So `tsconfig.json` deliberately carries NO `paths` mapping for `@/*`. The alias exists
 * only in `vite.renderer.config.ts`, which is what actually builds the app. `tsc` instead
 * resolves `@/*` through these ambient declarations and never opens the vendor tree, which
 * keeps `npx tsc --noEmit` a meaningful gate on Study OS code: it stays at its 290-
 * diagnostic baseline rather than drifting with upstream's style.
 *
 * The cost, stated plainly: this is a hand-maintained contract. If an upstream sync changes
 * one of these signatures, TypeScript will not notice — the Vite build or runtime will.
 * Keep it small for exactly that reason, and re-check it on every version bump. The types
 * below are re-exported from the vendored generated contract, which IS type-checked, so
 * only the function shapes are hand-written.
 */

declare module '@/api/client/server-url' {
  /** Injects the sidecar's ephemeral loopback origin before the first query runs. */
  export function setSeanimeBaseUrl(url: string): void;
  export function getServerBaseUrl(removeProtocol?: boolean): string;
}

declare module '@/app/(main)/_atoms/server-status.atoms' {
  /** localStorage key holding the `X-Seanime-Token` value. */
  export const SERVER_AUTH_TOKEN_STORAGE_KEY: string;
}

declare module '@/app/(main)/_hooks/use-server-status' {
  import type { Status } from '../../vendor/seanime/generated/types';
  export function useSetServerStatus(): (status: Status | undefined) => void;
  export function useServerStatus(): Status | undefined;
}

declare module '@/app/(main)/_features/anime-library/_lib/handle-library-collection' {
  import type {
    Anime_Episode,
    Anime_LibraryCollectionList,
  } from '../../vendor/seanime/generated/types';

  export function useHandleLibraryCollection(): {
    libraryGenres: string[];
    isLoading: boolean;
    libraryCollectionList: Anime_LibraryCollectionList[];
    filteredLibraryCollectionList: Anime_LibraryCollectionList[];
    continueWatchingList: Anime_Episode[];
    hasEntries: boolean;
    streamingMediaIds: number[];
  };
}

declare module '@/app/(main)/_features/anime-library/_screens/library-view' {
  import type * as React from 'react';
  import type {
    AL_MediaListStatus,
    Anime_Episode,
    Anime_LibraryCollectionList,
  } from '../../vendor/seanime/generated/types';

  export function LibraryView(props: {
    genres: string[];
    collectionList: Anime_LibraryCollectionList[];
    filteredCollectionList: Anime_LibraryCollectionList[];
    continueWatchingList: Anime_Episode[];
    isLoading: boolean;
    hasEntries: boolean;
    streamingMediaIds: number[];
    showStatuses?: AL_MediaListStatus[];
    type?: 'carousel' | 'grid';
  }): React.ReactElement;
}

declare module '@/app/(main)/_hooks/handle-websockets' {
  export function useWebsocketMessageListener<TData = unknown>(options: {
    type: string;
    onMessage: (message: TData) => void;
    deps?: unknown[];
  }): void;
}

declare module '@/app/websocket-provider' {
  import type * as React from 'react';
  import type { Atom } from 'jotai';

  export const clientIdAtom: Atom<string | null>;
  export const websocketConnectedAtom: Atom<boolean>;
  export function WebsocketProvider(props: {
    children: React.ReactNode;
  }): React.ReactElement;
}

declare module '@/app/(main)/_features/video-core/video-core.atoms' {
  import type { VideoCore_VideoPlaybackInfo as AdoptedVideoCorePlaybackInfo } from '../../vendor/seanime/generated/types';

  export type VideoCore_VideoPlaybackInfo = AdoptedVideoCorePlaybackInfo;
  export type VideoCoreLifecycleState = {
    active: boolean;
    playbackInfo: AdoptedVideoCorePlaybackInfo | null;
    playbackError: string | null;
    loadingState: string | null;
  };
}

declare module '@/app/(main)/_features/video-core/video-core-subtitles' {
  import type { MKVParser_SubtitleEvent } from '../../vendor/seanime/generated/types';

  export type NormalizedTrackInfo = {
    type: 'event' | 'file';
    language?: string;
    languageIETF?: string;
    codecID?: string;
    label?: string;
    number: number;
    forced: boolean;
    default: boolean;
  };

  export type VideoCoreActiveCue = {
    index: number;
    trackNumber: number;
    text: string;
    startMs: number;
    endMs: number;
  };

  export type SubtitleManagerCueChangeEvent = CustomEvent<{
    cues: VideoCoreActiveCue[];
    currentTimeMs: number;
  }>;
  export type SubtitleManagerTrackSelectedEvent = CustomEvent<{
    trackNumber: number;
    kind: 'file' | 'event';
  }>;
  export type SubtitleManagerTracksLoadedEvent = CustomEvent<{
    tracks: NormalizedTrackInfo[];
  }>;
  type SubtitleManagerEventMap = {
    cuechange: SubtitleManagerCueChangeEvent;
    tracksloaded: SubtitleManagerTracksLoadedEvent;
    trackselected: SubtitleManagerTrackSelectedEvent;
    trackdeselected: CustomEvent;
  };

  export class VideoCoreSubtitleManager extends EventTarget {
    getCues(): VideoCoreActiveCue[];
    getCuesForTrack(trackNumber: number): VideoCoreActiveCue[];
    getActiveCues(): VideoCoreActiveCue[];
    getTracks(): NormalizedTrackInfo[];
    getSelectedTrackNumberOrNull(): number | null;
    selectTrack(trackNumber: number): Promise<void>;
    setNoTrack(): void;
    setSubtitleDelay(subtitleDelay: number): Promise<void>;
    onSubtitleEvents(events: MKVParser_SubtitleEvent[]): Promise<void>;
    addEventListener<K extends keyof SubtitleManagerEventMap>(
      type: K,
      listener: (event: SubtitleManagerEventMap[K]) => void,
    ): void;
    removeEventListener<K extends keyof SubtitleManagerEventMap>(
      type: K,
      listener: (event: SubtitleManagerEventMap[K]) => void,
    ): void;
  }
}

declare module '@/app/(main)/_features/video-core/video-core-audio' {
  export type AudioManagerTrackChangedEvent = CustomEvent<{ trackNumber: number }>;

  export class VideoCoreAudioManager extends EventTarget {
    getSelectedTrackNumberOrNull(): number | null;
    selectTrack(trackNumber: number): void;
    addEventListener(
      type: 'trackchanged',
      listener: (event: AudioManagerTrackChangedEvent) => void,
    ): void;
    removeEventListener(
      type: 'trackchanged',
      listener: (event: AudioManagerTrackChangedEvent) => void,
    ): void;
  }
}

declare module '@/app/(main)/_features/video-core/video-core-atoms' {
  import type { Atom } from 'jotai';

  export const vc_videoElement: Atom<HTMLVideoElement | null>;
}

declare module '@/app/(main)/_features/video-core/video-core' {
  import type * as React from 'react';
  import type { Atom } from 'jotai';
  import type { VideoCoreAudioManager } from '@/app/(main)/_features/video-core/video-core-audio';
  import type { VideoCoreSubtitleManager } from '@/app/(main)/_features/video-core/video-core-subtitles';
  import type { VideoCoreLifecycleState } from '@/app/(main)/_features/video-core/video-core.atoms';

  export const vc_subtitleManager: Atom<VideoCoreSubtitleManager | null>;
  export const vc_audioManager: Atom<VideoCoreAudioManager | null>;
  export function VideoCoreProvider(props: {
    id: string;
    children: React.ReactNode;
  }): React.ReactElement;
  export function VideoCore(props: {
    id: string;
    state: VideoCoreLifecycleState;
    inline?: boolean;
    inlineClassName?: string;
    onTerminateStream: () => void;
    onLoadedMetadata?: (
      event: React.SyntheticEvent<HTMLVideoElement, Event>,
    ) => void;
  }): React.ReactElement;
}

declare module '@/lib/server/client-id' {
  export function getClientIdProof(): string;
}

declare module '@/lib/server/ws-events' {
  export enum WSEvents {
    NATIVE_PLAYER = 'native-player',
  }
}

declare module '@/types/constants' {
  export const __clientPlatform__: 'denshi' | 'web' | 'desktop';
}

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

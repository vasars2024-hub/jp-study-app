/**
 * Everything the player needs to decide HOW to open a local file, in one IPC answer.
 *
 * The open used to cost two round trips before anything was decided — `mediaFileUrl` (is it
 * on disk?) and `listMedia` (the WHOLE library, serialized, to find one row) — and then, for
 * anything that might be anime, a library scan inside the media server. `media:playbackPlan`
 * answers all of it from main in one call: the `playfile://` URL, the library row (just
 * that one), the opening frame's poster if one is already on disk, and the direct-play
 * probe (`shared/directPlayProbe.ts`).
 */
import type { DirectPlayVerdict, ProbeContainer } from './directPlayProbe';

export interface PlaybackPlanItem {
  id: string;
  title: string;
  seriesTitle?: string;
  episode?: number;
  anilistId?: number;
  malId?: number;
  category?: string;
}

export interface PlaybackPlan {
  /** `playfile://<token>` for the file, or null when it is not on disk. */
  url: string | null;
  /** The library row for this path, when the library has one. */
  item: PlaybackPlanItem | null;
  /** Artwork that already exists (provider still/backdrop/poster or a generated thumbnail). Never generated for this call. */
  posterUrl: string | null;
  direct: {
    verdict: DirectPlayVerdict;
    reason: string;
    container: ProbeContainer;
    subtitles: number;
  };
}

export type LocalPlaybackRoute = 'missing' | 'direct' | 'sidecar';

/**
 * Disk or media server?
 *
 *  - not on disk → `missing` (said at once, not after a scan);
 *  - a library row the app knows is NOT anime (no AniList/MAL id, not filed as anime) →
 *    `direct`: the media server only streams files it has matched to an anime series, so
 *    asking it first only ever cost a scan before the same disk playback;
 *  - otherwise the probe decides: `direct` when Chromium plays the container and codecs as
 *    they are and no Matroska subtitle track needs the server's parser; the server for the
 *    rest, and for anything the probe could not read.
 */
export function routeLocalPlayback(plan: Pick<PlaybackPlan, 'url' | 'item' | 'direct'>): LocalPlaybackRoute {
  if (!plan.url) return 'missing';
  const item = plan.item;
  if (item && !item.anilistId && !item.malId && item.category !== 'anime') return 'direct';
  return plan.direct.verdict === 'direct' ? 'direct' : 'sidecar';
}

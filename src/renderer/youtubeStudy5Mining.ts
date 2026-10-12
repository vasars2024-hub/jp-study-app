/**
 * Consistent mining metadata for YouTube videos (7.5).
 *
 * A line mined from a downloaded YouTube video used to carry the local file as
 * its source and nothing that pointed back at YouTube. Whatever surface mined it
 * (the player, the pre-study list), `mineToStudy` now runs the input through
 * here first, so every such card gets the same three facts: the video's title,
 * the scene as `m:ss`, and a watch link with `&t=` that reopens at the scene.
 */
import type { MediaItem } from '../shared/types';
import {
  yt5MiningMeta,
  yt5TimestampFromUrl,
  yt5VideoIdFromUrl,
} from '../shared/youtubeStudy5';
import type { StudyContextRef } from '../shared/mediaStudyOrchestrator';

/** The fields of a mining input this reads; structural, so studyMining can import this module without a cycle. */
export interface Yt5MineLike {
  source: string;
  sourceUrl?: string;
  sourceId?: string;
  sourceTitle?: string;
  sceneReference?: string;
  sourceRef?: StudyContextRef;
}

const MEDIA_CACHE_MS = 30_000;
let mediaCache: { at: number; items: MediaItem[] } | null = null;

async function libraryItems(): Promise<MediaItem[]> {
  if (mediaCache && Date.now() - mediaCache.at < MEDIA_CACHE_MS) return mediaCache.items;
  if (typeof window === 'undefined' || typeof window.api?.listMedia !== 'function') return [];
  try {
    const items = await window.api.listMedia();
    mediaCache = { at: Date.now(), items: Array.isArray(items) ? items : [] };
    return mediaCache.items;
  } catch {
    return [];
  }
}

/** Test seam. */
export function resetYt5MediaCache(): void {
  mediaCache = null;
}

/** Cheap, synchronous gate: only inputs that can be a YouTube scene pay for the lookup. */
export function yt5MayEnrichMine(input: Yt5MineLike): boolean {
  if (input.sourceRef?.webUrl) return false;
  if (yt5VideoIdFromUrl(input.sourceUrl)) return true;
  return (input.source === 'subtitle' || input.source === 'media') && input.sourceRef?.cueStartSec != null;
}

function matchesItem(item: MediaItem, input: Yt5MineLike): boolean {
  const refId = input.sourceRef?.mediaId;
  return (
    (!!input.sourceUrl && item.path === input.sourceUrl)
    || (!!refId && (refId === item.id || refId === `media-${item.id}`))
    || (!!input.sourceId && (input.sourceId === item.id || input.sourceId === `media-${item.id}`))
  );
}

export async function yt5EnrichMineInput<T extends Yt5MineLike>(input: T): Promise<T> {
  if (!yt5MayEnrichMine(input)) return input;
  let videoId = yt5VideoIdFromUrl(input.sourceUrl);
  let title = input.sourceTitle ?? '';
  let mediaId = input.sourceRef?.mediaId ?? '';
  if (!videoId) {
    const item = (await libraryItems()).find((candidate) => candidate.youtubeId && matchesItem(candidate, input));
    if (!item?.youtubeId) return input;
    videoId = item.youtubeId;
    title = title || item.title;
    mediaId = mediaId || item.id;
  }
  const startSec = input.sourceRef?.cueStartSec ?? yt5TimestampFromUrl(input.sourceUrl);
  const meta = yt5MiningMeta({ videoId, title, startSec: startSec ?? 0 });
  if (!meta) return input;
  return {
    ...input,
    sourceTitle: input.sourceTitle || meta.sourceTitle,
    ...(startSec != null && !input.sceneReference ? { sceneReference: meta.sceneReference } : {}),
    sourceRef: { ...(input.sourceRef ?? { mediaId: mediaId || `youtube:${videoId}` }), webUrl: meta.webUrl },
  };
}

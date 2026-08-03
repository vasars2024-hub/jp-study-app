import type { ImageRow } from '../../../../shared/scraperResults';

export type ImageKindFilter = 'all' | ImageRow['kind'];

export interface ImageWorkspaceSummary {
  count: number;
  totalBytes: number;
  sources: number;
  episodeLinked: number;
}

export function filterImageRows(
  images: ImageRow[],
  kind: ImageKindFilter,
  query: string,
): ImageRow[] {
  const needle = query.trim().toLowerCase();
  return images.filter((image) => {
    if (kind !== 'all' && image.kind !== kind) return false;
    if (!needle) return true;
    return [
      image.id,
      image.episodeId ?? '',
      image.kind,
      image.format,
      image.sourceLabel,
      `${image.width}x${image.height}`,
    ].some((value) => value.toLowerCase().includes(needle));
  });
}

export function imageDownloadFilename(image: ImageRow): string {
  const stem = `${image.kind}-${image.episodeId ?? image.id}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'anime-image';
  const extension = image.format
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    || 'jpg';
  return `${stem}.${extension}`;
}

export function summarizeImageRows(images: ImageRow[]): ImageWorkspaceSummary {
  return {
    count: images.length,
    totalBytes: images.reduce((sum, image) => sum + image.sizeBytes, 0),
    sources: new Set(images.map((image) => image.sourceLabel)).size,
    episodeLinked: images.filter((image) => image.episodeId !== null).length,
  };
}

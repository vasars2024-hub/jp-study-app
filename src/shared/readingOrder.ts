import type { MokuroBox } from './mokuroTypes';

/**
 * Sort detected regions into an approximation of manga reading order:
 * top-to-bottom in horizontal "tiers" (bands), right-to-left within each tier.
 *
 * No panel-boundary detector exists upstream, so this treats rows of
 * vertically-overlapping regions as a tier — the dominant layout shape for
 * manga (tiered horizontal panels) — rather than scanning the whole page as
 * one right-to-left column sweep, which works for prose but zigzags across
 * unrelated same-row panels.
 */
export function sortReadingOrder<T extends { box: MokuroBox }>(regions: T[]): T[] {
  if (regions.length <= 1) return regions.slice();

  const byTop = regions.slice().sort((a, b) => a.box[1] - b.box[1]);

  interface Band {
    items: T[];
    minY: number;
    maxY: number;
  }
  const bands: Band[] = [];

  for (const region of byTop) {
    const [, ymin, , ymax] = region.box;
    const height = Math.max(1, ymax - ymin);
    let band = bands[bands.length - 1];
    if (band) {
      const overlapStart = Math.max(band.minY, ymin);
      const overlapEnd = Math.min(band.maxY, ymax);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const bandHeight = Math.max(1, band.maxY - band.minY);
      const ratio = overlap / Math.min(height, bandHeight);
      if (ratio < 0.4) band = undefined as unknown as Band;
    }
    if (!band) {
      band = { items: [], minY: ymin, maxY: ymax };
      bands.push(band);
    } else {
      band.minY = Math.min(band.minY, ymin);
      band.maxY = Math.max(band.maxY, ymax);
    }
    band.items.push(region);
  }

  const out: T[] = [];
  for (const band of bands) {
    band.items.sort((a, b) => b.box[2] - a.box[2]);
    out.push(...band.items);
  }
  return out;
}

/**
 * The City's growing Mooncap, from atlas pixels to a lit sprite — pure pixel work, so it can
 * run in a worker (`workers/gardenSprite.worker.ts`).
 *
 * It used to run inside the atlas image's `onload` on the UI thread: keying the black
 * backdrop, discarding fragments of neighbouring atlas cells and re-lighting the sprite
 * (`gradeMushroomSprite`) cost ~1.1-1.2 s of main-thread time on the first open of the City
 * and 0.6-1 s on later opens, one uninterrupted long task each time (round-4 console sweep,
 * every look, CPU profile `l.onload` 1214 ms self time). Nothing here touches the DOM.
 */
import { gradeMushroomSprite, type GradedSprite } from './mushroomGrade';

interface PixelComponent {
  pixels: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function connectedComponents(mask: Uint8Array, width: number, height: number) {
  const visited = new Uint8Array(mask.length);
  const components: PixelComponent[] = [];
  const queue: number[] = [];
  const neighborOffsets = [
    -width - 1,
    -width,
    -width + 1,
    -1,
    1,
    width - 1,
    width,
    width + 1,
  ];

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const pixels: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    queue.length = 0;
    queue.push(start);
    visited[start] = 1;

    while (queue.length > 0) {
      const index = queue.pop();
      if (index === undefined) break;
      const x = index % width;
      const y = Math.floor(index / width);
      pixels.push(index);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);

      for (const offset of neighborOffsets) {
        const neighbor = index + offset;
        if (
          neighbor < 0 ||
          neighbor >= mask.length ||
          visited[neighbor] ||
          !mask[neighbor]
        ) {
          continue;
        }
        const neighborX = neighbor % width;
        if (Math.abs(neighborX - x) > 1) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }
    components.push({ pixels, minX, minY, maxX, maxY });
  }
  return components;
}

function removeNeighboringStageBleed(
  pixels: ImageData,
  width: number,
  height: number,
) {
  const mask = new Uint8Array(width * height);
  for (let index = 0; index < mask.length; index += 1) {
    mask[index] = pixels.data[index * 4 + 3] > 32 ? 1 : 0;
  }
  const components = connectedComponents(mask, width, height);
  const anchor = components.reduce<PixelComponent | null>(
    (largest, component) =>
      !largest || component.pixels.length > largest.pixels.length
        ? component
        : largest,
    null,
  );
  if (!anchor) return;
  const sideGuard = width * 0.018;
  const anchorWidth = anchor.maxX - anchor.minX + 1;
  const isolatedCellMinX = anchor.minX - anchorWidth * 0.04;
  const isolatedCellMaxX = anchor.maxX + anchorWidth * 0.04;

  for (const component of components) {
    // Adjacent atlas phases only appear as partial components cut by a cell's
    // outer edge. Preserve every internal detached tendril, drip and ground
    // mushroom; discard only non-primary fragments that touch that edge.
    const touchesAtlasEdge =
      component.minX <= sideGuard || component.maxX >= width - sideGuard;
    const componentCenterX = (component.minX + component.maxX) / 2;
    const outsideIsolatedSilhouette =
      componentCenterX < isolatedCellMinX ||
      componentCenterX > isolatedCellMaxX;
    const keep =
      component === anchor || (!touchesAtlasEdge && !outsideIsolatedSilhouette);
    if (!keep) {
      for (const pixelIndex of component.pixels) {
        pixels.data[pixelIndex * 4 + 3] = 0;
      }
    }
  }
}

/**
 * Keys the atlas's near-black backdrop to transparency (a soft ramp, so antialiased edges
 * survive), drops fragments of the neighbouring cells the extraction bled in, and re-lights
 * what is left. Operates in place on `pixels`, like `gradeMushroomSprite`.
 */
export function keyAndGradeStagePixels(pixels: ImageData): GradedSprite {
  for (let index = 0; index < pixels.data.length; index += 4) {
    const luminance =
      pixels.data[index] * 0.2126 +
      pixels.data[index + 1] * 0.7152 +
      pixels.data[index + 2] * 0.0722;
    if (luminance <= 9) {
      pixels.data[index + 3] = 0;
    } else if (luminance < 28) {
      pixels.data[index + 3] = Math.round(
        pixels.data[index + 3] * ((luminance - 9) / 19),
      );
    }
  }
  removeNeighboringStageBleed(pixels, pixels.width, pixels.height);
  return gradeMushroomSprite(pixels);
}

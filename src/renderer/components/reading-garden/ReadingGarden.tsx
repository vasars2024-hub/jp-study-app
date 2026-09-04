import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

import { useT } from "../../i18n";
import { drawMushroomBed } from "./mushroomBed";
import { gradeMushroomSprite } from "./mushroomGrade";
import {
  applyGardenWorldRect,
  gardenWorldRect,
  GARDEN_ANCHOR_X,
  GARDEN_ANCHOR_Y,
} from "./readingGardenWorld";
import {
  loadReadingGardenProgress,
  READING_GARDEN_MAX_STAGE,
  READING_GARDEN_PAGES_PER_PHASE,
  READING_GARDEN_PROGRESS_EVENT,
  readingGardenDayKey,
  readingGardenPagesTowardNext,
  readingGardenPendingPhases,
  type ReadingGardenProgress,
} from "../../readingGardenProgress";
import { ContextualSurface } from "../liquid/LiquidSurface";
import ReadingGardenLifeCanvas from "./ReadingGardenLifeCanvas";
import ReadingGardenSkyEvents, {
  MooncapSkyDevConsole,
} from "./ReadingGardenSkyEvents";
import {
  loadMooncapMusicSettings,
  mooncapMusicPlayer,
  type MooncapMusicSettings,
} from "./mooncapMusic";
import "./readingGarden.css";

const mooncapMusicUrl = new URL(
  "../../assets/reading-garden/audio/mooncap-endless-dream.opus",
  import.meta.url,
).href;

const stage01To10Url = new URL(
  "../../assets/reading-garden/mushroom-stages-01-10.png",
  import.meta.url,
).href;
const stage11To20Url = new URL(
  "../../assets/reading-garden/mushroom-stages-11-20.png",
  import.meta.url,
).href;
const stage21To30Url = new URL(
  "../../assets/reading-garden/mushroom-stages-21-30.png",
  import.meta.url,
).href;
const stage31To50Url = new URL(
  "../../assets/reading-garden/mushroom-stages-31-50.png",
  import.meta.url,
).href;
const masterBackgroundUrl = new URL(
  "../../assets/reading-garden/mooncap-background-master-v2.png",
  import.meta.url,
).href;

/**
 * Height of the mushroom's box as a fraction of the *world*, not the viewport.
 * Growth is expressed once, here, instead of being smeared across per-atlas
 * normalisation tables — every frame is normalised to fill its box, so this
 * curve alone decides how large the hero reads against the terrain.
 */
function stageBoxHeight(stage: number) {
  const safeStage = Math.max(1, Math.min(READING_GARDEN_MAX_STAGE, stage));
  const growth = (safeStage - 1) / (READING_GARDEN_MAX_STAGE - 1);
  return 0.13 + growth * 0.4;
}

function stageProgress(stage: number) {
  const safeStage = Math.max(1, Math.min(READING_GARDEN_MAX_STAGE, stage));
  return (safeStage - 1) / (READING_GARDEN_MAX_STAGE - 1);
}

/** Fraction of the mushroom box the normalised sprite fills. */
const SPRITE_FILL = 0.94;

const cloudAtlasUrl = new URL(
  "../../assets/reading-garden/cloud-banks-atlas-v1.png",
  import.meta.url,
).href;
const mistAtlasUrl = new URL(
  "../../assets/reading-garden/mist-banks-atlas-v1.png",
  import.meta.url,
).href;
const moonSurfaceUrl = new URL(
  "../../assets/reading-garden/moon-surface-v1.png",
  import.meta.url,
).href;
const violetPlanetUrl = new URL(
  "../../assets/reading-garden/planet-violet-v1.png",
  import.meta.url,
).href;

interface StageCell {
  url: string;
  row: number;
  column: number;
  columns: number;
  rows: number;
  cropBottom: number;
  topFraction?: number;
  heightFraction?: number;
}

function cellForStage(stage: number): StageCell {
  if (stage <= 10) {
    const index = stage - 1;
    const row = Math.floor(index / 5);
    return {
      url: stage01To10Url,
      row,
      column: index % 5,
      columns: 5,
      rows: 2,
      cropBottom: row === 0 ? 0.78 : 0.65,
    };
  }
  if (stage <= 20) {
    const index = stage - 11;
    const row = Math.floor(index / 5);
    return {
      url: stage11To20Url,
      row,
      column: index % 5,
      columns: 5,
      rows: 2,
      cropBottom: row === 0 ? 0.88 : 0.74,
    };
  }
  if (stage <= 30) {
    const index = stage - 21;
    const row = Math.floor(index / 5);
    return {
      url: stage21To30Url,
      row,
      column: index % 5,
      columns: 5,
      rows: 2,
      cropBottom: row === 0 ? 0.84 : 0.74,
    };
  }
  if (stage <= 34) {
    return {
      url: stage31To50Url,
      row: 0,
      column: stage - 30,
      columns: 5,
      rows: 4,
      cropBottom: 1,
      topFraction: 0,
      heightFraction: 0.262,
    };
  }
  if (stage <= 39) {
    return {
      url: stage31To50Url,
      row: 1,
      column: stage - 35,
      columns: 5,
      rows: 4,
      cropBottom: 1,
      topFraction: 0.294,
      heightFraction: 0.198,
    };
  }
  if (stage <= 44) {
    return {
      url: stage31To50Url,
      row: 2,
      column: stage - 40,
      columns: 5,
      rows: 4,
      cropBottom: 1,
      topFraction: 0.529,
      heightFraction: 0.198,
    };
  }
  return {
    url: stage31To50Url,
    row: 3,
    column: stage - 45,
    columns: 6,
    rows: 4,
    cropBottom: 1,
    topFraction: 0.75,
    heightFraction: 0.207,
  };
}

interface PreparedSprite {
  body: HTMLCanvasElement;
  emissive: HTMLCanvasElement;
  width: number;
  height: number;
  /** Width of the silhouette where it meets the ground, as a sprite fraction. */
  baseWidth: number;
}

/**
 * Extracts one atlas cell at its native resolution, keys the background, and
 * re-lights it into the garden's palette. Nothing is resampled here: the sprite
 * is only ever scaled once, at blit time, with smoothing off, so the pixel art
 * keeps the same edge hardness as the environment plate.
 */
function prepareStageSprite(
  image: HTMLImageElement,
  cell: StageCell,
): PreparedSprite | null {
  const sourceWidth = image.naturalWidth / cell.columns;
  const sourceHeight = image.naturalHeight / cell.rows;
  // The generated atlas is not a perfectly isolated sprite sheet: several wide
  // caps and tendrils cross the nominal cell boundary. Read a guarded overlap
  // from both neighboring cells, then let component isolation below discard
  // adjacent mushroom fragments. This preserves the real silhouette instead of
  // producing a suspiciously straight cut at the grid line.
  const requestedBleed = sourceWidth * 0.14;
  const nominalSourceX = cell.column * sourceWidth;
  const sourceX = Math.max(0, nominalSourceX - requestedBleed);
  const sourceRight = Math.min(
    image.naturalWidth,
    nominalSourceX + sourceWidth + requestedBleed,
  );
  const extractedSourceWidth = Math.round(sourceRight - sourceX);
  const sourceY =
    cell.topFraction === undefined
      ? cell.row * sourceHeight
      : image.naturalHeight * cell.topFraction;
  const croppedHeight = Math.round(
    cell.heightFraction === undefined
      ? sourceHeight * cell.cropBottom
      : image.naturalHeight * cell.heightFraction,
  );
  if (extractedSourceWidth < 4 || croppedHeight < 4) return null;

  const staging = document.createElement("canvas");
  staging.width = extractedSourceWidth;
  staging.height = croppedHeight;
  const stagingContext = staging.getContext("2d", { willReadFrequently: true });
  if (!stagingContext) return null;
  stagingContext.imageSmoothingEnabled = false;
  stagingContext.drawImage(
    image,
    sourceX,
    sourceY,
    extractedSourceWidth,
    croppedHeight,
    0,
    0,
    extractedSourceWidth,
    croppedHeight,
  );

  const pixels = stagingContext.getImageData(
    0,
    0,
    extractedSourceWidth,
    croppedHeight,
  );
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
  removeNeighboringStageBleed(pixels, extractedSourceWidth, croppedHeight);

  const graded = gradeMushroomSprite(pixels);
  if (graded.maxX < graded.minX || graded.maxY < graded.minY) return null;

  const width = graded.maxX - graded.minX + 1;
  const height = graded.maxY - graded.minY + 1;

  // Silhouette width across the bottom eighth: what the root bed has to cover.
  let baseMinX = width;
  let baseMaxX = -1;
  const baseTop = graded.maxY - Math.max(1, Math.round(height * 0.12));
  for (let y = baseTop; y <= graded.maxY; y += 1) {
    for (let x = graded.minX; x <= graded.maxX; x += 1) {
      if (graded.image.data[(y * extractedSourceWidth + x) * 4 + 3] > 32) {
        if (x < baseMinX) baseMinX = x;
        if (x > baseMaxX) baseMaxX = x;
      }
    }
  }

  const crop = (source: ImageData) => {
    const full = document.createElement("canvas");
    full.width = extractedSourceWidth;
    full.height = croppedHeight;
    full.getContext("2d")?.putImageData(source, 0, 0);
    const cropped = document.createElement("canvas");
    cropped.width = width;
    cropped.height = height;
    const context = cropped.getContext("2d");
    if (context) {
      context.imageSmoothingEnabled = false;
      context.drawImage(full, -graded.minX, -graded.minY);
    }
    return cropped;
  };

  return {
    body: crop(graded.image),
    emissive: crop(graded.emissive),
    width,
    height,
    baseWidth: baseMaxX >= baseMinX ? (baseMaxX - baseMinX + 1) / width : 0.3,
  };
}

export function MushroomStage({
  stage,
  onActivate,
  expanded = false,
  activateRef,
}: {
  stage: number;
  onActivate?: () => void;
  expanded?: boolean;
  /** The garden returns focus here when the dossier closes. */
  activateRef?: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useT();
  const hostRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLCanvasElement>(null);
  const eyeRef = useRef<HTMLCanvasElement>(null);
  const bedRef = useRef<HTMLCanvasElement>(null);
  const spriteRef = useRef<PreparedSprite | null>(null);
  const cell = useMemo(() => cellForStage(stage), [stage]);

  const paint = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const box = host.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Each canvas is measured on its own: the root bed deliberately overhangs
    // the mushroom box so roots and mist can spread past the contact point.
    const sizeCanvas = (canvas: HTMLCanvasElement | null) => {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
      const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, pixelWidth, pixelHeight);
      context.imageSmoothingEnabled = false;
      return { context, width: pixelWidth, height: pixelHeight };
    };

    const body = sizeCanvas(bodyRef.current);
    const eye = sizeCanvas(eyeRef.current);
    const bed = sizeCanvas(bedRef.current);
    const sprite = spriteRef.current;
    if (!sprite) return;

    // Bottom-anchored and height-normalised: the contact point is a fixed
    // fraction of the box, so it stays welded to the terrace at any window size.
    const boxWidth = box.width * dpr;
    const boxHeight = box.height * dpr;
    let drawHeight = boxHeight * SPRITE_FILL;
    let drawWidth = (drawHeight * sprite.width) / sprite.height;
    if (drawWidth > boxWidth * 0.98) {
      drawWidth = boxWidth * 0.98;
      drawHeight = (drawWidth * sprite.height) / sprite.width;
    }
    const drawX = Math.round((boxWidth - drawWidth) / 2);
    const drawY = Math.round(boxHeight - drawHeight);

    if (bed) {
      // Ground detail is sized from the world, not from the hero, so satellite
      // fungi and mist stay at terrain scale while the mushroom grows past them.
      const worldHeight =
        Number.parseFloat(
          getComputedStyle(host).getPropertyValue("--garden-world-h"),
        ) || box.height;
      drawMushroomBed(bed.context, bed.width, bed.height, {
        stage,
        stemWidth: drawWidth * sprite.baseWidth,
        groundUnit: worldHeight * dpr * 0.075,
      });
    }
    body?.context.drawImage(sprite.body, drawX, drawY, drawWidth, drawHeight);
    if (stage >= 30) {
      eye?.context.drawImage(
        sprite.emissive,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
    }
  }, [stage]);

  useEffect(() => {
    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      spriteRef.current = prepareStageSprite(image, cell);
      paint();
    };
    image.src = cell.url;
    return () => {
      cancelled = true;
      image.onload = null;
    };
  }, [cell, paint]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const observer = new ResizeObserver(() => paint());
    observer.observe(host);
    paint();
    return () => observer.disconnect();
  }, [paint]);

  return (
    <div className="reading-garden-mushroom" ref={hostRef}>
      <div className="reading-garden-mushroom-aura" aria-hidden="true" />
      <canvas
        className="reading-garden-root-bed"
        ref={bedRef}
        aria-hidden="true"
      />
      <div className="reading-garden-mushroom-art" aria-hidden="true">
        <canvas className="reading-garden-mushroom-body" ref={bodyRef} />
        {stage >= 30 && (
          <canvas className="reading-garden-eye-light" ref={eyeRef} />
        )}
      </div>
      {onActivate && (
        <button
          className="reading-garden-mushroom-hitbox"
          type="button"
          ref={activateRef}
          onClick={onActivate}
          aria-label={
            expanded ? t("mooncap.info.hide") : t("mooncap.info.show")
          }
          aria-expanded={expanded}
          aria-controls="reading-garden-info"
        />
      )}
    </div>
  );
}

interface GardenCameraStyle extends CSSProperties {
  "--garden-camera-scale-a": string;
  "--garden-camera-scale-b": string;
  "--garden-anchor-x": string;
  "--garden-anchor-y": string;
  "--garden-mushroom-height": string;
  "--garden-kaiju-progress": string;
  "--garden-occlusion-alpha": string;
}

function cameraStyleForStage(stage: number): GardenCameraStyle {
  const safeStage = Math.max(1, Math.min(READING_GARDEN_MAX_STAGE, stage));
  const progress = stageProgress(safeStage);
  // The camera now transforms the whole world, hero included, so it stays a
  // camera move rather than a parallax split between the plate and a mushroom
  // pinned to the viewport. It never drops below 1 because the world rect only
  // carries enough overscan to cover the drift.
  const scale = 1.26 - progress * 0.26;
  const kaijuProgress = safeStage < 30 ? 0 : Math.min(1, (safeStage - 30) / 20);
  const occlusionAlpha =
    safeStage < 30 ? 0 : Math.min(0.94, 0.34 + kaijuProgress * 0.6);
  return {
    "--garden-camera-scale-a": scale.toFixed(4),
    "--garden-camera-scale-b": (scale + 0.018).toFixed(4),
    "--garden-anchor-x": `${(GARDEN_ANCHOR_X * 100).toFixed(3)}%`,
    "--garden-anchor-y": `${(GARDEN_ANCHOR_Y * 100).toFixed(3)}%`,
    "--garden-mushroom-height": `${(stageBoxHeight(safeStage) * 100).toFixed(3)}%`,
    "--garden-kaiju-progress": kaijuProgress.toFixed(4),
    "--garden-occlusion-alpha": occlusionAlpha.toFixed(3),
  };
}

/**
 * Keeps `--garden-world-*` in sync with the container. Runs off a
 * ResizeObserver and writes straight to the element, so dragging a window edge
 * never re-renders the scene — it just re-projects it.
 */
function useGardenWorld(ref: React.RefObject<HTMLElement | null>) {
  // No dependency array on purpose. The projection is also re-applied after
  // every render, so a stage change, an HMR swap or anything else that rewrites
  // the element's inline style can never leave the world on stale numbers while
  // waiting for the next resize notification.
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    const sync = () => {
      const box = root.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) return;
      applyGardenWorldRect(root, gardenWorldRect(box.width, box.height));
    };
    const observer = new ResizeObserver(sync);
    observer.observe(root);
    sync();
    return () => observer.disconnect();
  });
}

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

function CloudSprite({
  className,
  column,
  row,
}: {
  className: string;
  column: number;
  row: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const sourceWidth = image.naturalWidth / 2;
      const sourceHeight = image.naturalHeight / 3;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        column * sourceWidth,
        row * sourceHeight,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const luminance =
          pixels.data[index] * 0.2126 +
          pixels.data[index + 1] * 0.7152 +
          pixels.data[index + 2] * 0.0722;
        if (luminance <= 8) {
          pixels.data[index + 3] = 0;
        } else if (luminance < 30) {
          pixels.data[index + 3] = Math.round(
            pixels.data[index + 3] * ((luminance - 8) / 22),
          );
        }
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = cloudAtlasUrl;
    return () => {
      image.onload = null;
    };
  }, [column, row]);

  return (
    <div
      className={`reading-garden-cloud-sprite ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} width={720} height={600} />
    </div>
  );
}

function MistSprite({
  className,
  column,
  row,
}: {
  className: string;
  column: number;
  row: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const sourceWidth = image.naturalWidth / 2;
      const sourceHeight = image.naturalHeight / 3;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(
        image,
        column * sourceWidth,
        row * sourceHeight,
        sourceWidth,
        sourceHeight,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const luminance =
          pixels.data[index] * 0.2126 +
          pixels.data[index + 1] * 0.7152 +
          pixels.data[index + 2] * 0.0722;
        if (luminance <= 5) {
          pixels.data[index + 3] = 0;
        } else if (luminance < 26) {
          pixels.data[index + 3] = Math.round(
            pixels.data[index + 3] * ((luminance - 5) / 21),
          );
        }
      }
      context.putImageData(pixels, 0, 0);
    };
    image.src = mistAtlasUrl;
    return () => {
      image.onload = null;
    };
  }, [column, row]);

  return (
    <div
      className={`reading-garden-distant-fog ${className}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} width={1000} height={400} />
    </div>
  );
}

interface StarStyle extends CSSProperties {
  "--star-x": string;
  "--star-y": string;
  "--star-size": string;
  "--star-delay": string;
  "--star-alpha": string;
}

function seeded(index: number, salt: number): number {
  const value = Math.sin(index * 71.319 + salt * 17.733) * 43758.5453;
  return value - Math.floor(value);
}

const STARS = Array.from(
  { length: 48 },
  (_, index): StarStyle => ({
    "--star-x": `${(seeded(index, 1) * 100).toFixed(2)}%`,
    "--star-y": `${(seeded(index, 2) * 72).toFixed(2)}%`,
    "--star-size": `${(0.7 + seeded(index, 3) * 1.75).toFixed(2)}px`,
    "--star-delay": `${(-seeded(index, 4) * 7).toFixed(2)}s`,
    "--star-alpha": `${(0.24 + seeded(index, 5) * 0.62).toFixed(2)}`,
  }),
);

interface MoonDustStyle extends CSSProperties {
  "--dust-x": string;
  "--dust-y": string;
  "--dust-size": string;
  "--dust-delay": string;
  "--dust-drift": string;
}

const MOON_DUST = Array.from(
  { length: 22 },
  (_, index): MoonDustStyle => ({
    "--dust-x": `${(24 + seeded(index, 8) * 61).toFixed(2)}%`,
    "--dust-y": `${(14 + seeded(index, 9) * 66).toFixed(2)}%`,
    "--dust-size": `${(0.7 + seeded(index, 10) * 1.5).toFixed(2)}px`,
    "--dust-delay": `${(-seeded(index, 11) * 13).toFixed(2)}s`,
    "--dust-drift": `${(-8 + seeded(index, 12) * 16).toFixed(2)}px`,
  }),
);

export default function ReadingGarden({
  previewProgress,
}: {
  previewProgress?: ReadingGardenProgress;
} = {}) {
  const { t } = useT();
  const [progress, setProgress] = useState<ReadingGardenProgress>(
    previewProgress ?? loadReadingGardenProgress(),
  );
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [music, setMusic] = useState<MooncapMusicSettings>(() =>
    loadMooncapMusicSettings(),
  );
  const rootRef = useRef<HTMLElement>(null);
  const infoTriggerRef = useRef<HTMLButtonElement>(null);
  useGardenWorld(rootRef);

  /**
   * The dossier is an `aria-expanded` disclosure, and it was missing both
   * halves of that contract: Escape did not close it, and closing it dropped
   * focus on `document.body` — so a keyboard user who opened the mushroom had
   * to Tab back through the whole garden to reach anything.
   *
   * Scoped to the garden's own `onKeyDown` rather than a `window` listener on
   * purpose. React bubbles synthetic events to this element from BOTH the
   * trigger and the panel, which are the only two places focus can be while
   * the dossier is open, and a window-level Escape here would race the shell's
   * own Escape in every other window this component can be mounted in.
   */
  const closeInfo = useCallback(() => {
    setIsInfoOpen(false);
    infoTriggerRef.current?.focus();
  }, []);

  const onGardenKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "Escape" || !isInfoOpen) return;
      event.stopPropagation();
      closeInfo();
    },
    [closeInfo, isInfoOpen],
  );

  useEffect(() => {
    mooncapMusicPlayer.configure(mooncapMusicUrl);
    return () => {
      mooncapMusicPlayer.dispose();
    };
  }, []);

  useEffect(() => {
    if (previewProgress) {
      setProgress(previewProgress);
      return undefined;
    }
    const onProgress = (event: Event) => {
      setProgress(
        (event as CustomEvent<ReadingGardenProgress>).detail ??
          loadReadingGardenProgress(),
      );
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "jp-reading-garden-v1") {
        setProgress(loadReadingGardenProgress());
      }
    };
    const refreshSettledProgress = () => {
      setProgress(loadReadingGardenProgress());
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") refreshSettledProgress();
    };
    window.addEventListener(READING_GARDEN_PROGRESS_EVENT, onProgress);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshSettledProgress);
    document.addEventListener("visibilitychange", onVisibility);
    const settlementTimer = window.setInterval(refreshSettledProgress, 60_000);
    return () => {
      window.removeEventListener(READING_GARDEN_PROGRESS_EVENT, onProgress);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshSettledProgress);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(settlementTimer);
    };
  }, [previewProgress]);

  const sceneProgress = progress;
  const stage = sceneProgress.stage;
  const mature = stage >= READING_GARDEN_MAX_STAGE;
  const pagesTowardNext = readingGardenPagesTowardNext(sceneProgress);
  const pagesToNext = mature
    ? 0
    : Math.max(0, READING_GARDEN_PAGES_PER_PHASE - sceneProgress.bankedPages);
  const pendingPhases = readingGardenPendingPhases(sceneProgress);
  const evolvedToday = sceneProgress.lastEvolutionDay === readingGardenDayKey();
  const phasePad = String(stage).padStart(2, "0");
  const nextPhasePad = String(stage + 1).padStart(2, "0");
  const phaseStatus = mature
    ? t("mooncap.info.mature")
    : pendingPhases > 0
      ? t("mooncap.info.pending", { count: pendingPhases })
      : t("mooncap.info.untilNext", {
          count: pagesToNext,
          phase: nextPhasePad,
        });
  const organismName = t(`mooncap.phase.${stage}.name`);
  const organismAge = t(`mooncap.phase.${stage}.age`);
  const organismCondition = t(`mooncap.phase.${stage}.condition`);
  const organismObservation = t(`mooncap.phase.${stage}.observation`);
  return (
    <main
      ref={rootRef}
      className={`reading-garden stage-band-${Math.floor((stage - 1) / 10) + 1}`}
      style={cameraStyleForStage(stage)}
      onKeyDown={onGardenKeyDown}
      aria-label={t("mooncap.info.ariaGarden", {
        stage: phasePad,
        max: READING_GARDEN_MAX_STAGE,
      })}
    >
      <div className="reading-garden-sky" aria-hidden="true" />
      {/*
        World layers are locked to the plate, not to the viewport: they
        reproduce the cover crop explicitly and share one camera transform, so
        the hero cannot drift off its terrace when the window is resized. Back
        and front are split only so the sky stack still sits between them.
      */}
      <div className="reading-garden-world world-back" aria-hidden="true">
        <img
          className="reading-garden-background-master"
          src={masterBackgroundUrl}
          alt=""
          draggable={false}
        />
      </div>
      {/*
        Sky events share the plate camera and are soft-masked to the open vault
        so meteors stay behind the left shelf tower and dissolve into the ridge.
      */}
      <div className="reading-garden-world world-sky-events" aria-hidden="true">
        <ReadingGardenSkyEvents />
      </div>
      <div className="reading-garden-stars" aria-hidden="true">
        {STARS.map((style, index) => (
          <i key={index} style={style} />
        ))}
      </div>
      <img
        className="reading-garden-planet planet-far"
        src={violetPlanetUrl}
        alt=""
        draggable={false}
        aria-hidden="true"
      />
      <img
        className="reading-garden-moon"
        src={moonSurfaceUrl}
        alt=""
        draggable={false}
        aria-hidden="true"
      />
      <div className="reading-garden-moonbeam" aria-hidden="true" />
      <div className="reading-garden-moon-dust" aria-hidden="true">
        {MOON_DUST.map((style, index) => (
          <i key={index} style={style} />
        ))}
      </div>
      <div className="reading-garden-environment-light" aria-hidden="true" />

      <CloudSprite className="cloud-sprite-far-a" column={0} row={0} />
      <CloudSprite className="cloud-sprite-far-b" column={1} row={0} />
      <CloudSprite className="cloud-sprite-mid-a" column={0} row={1} />
      <CloudSprite className="cloud-sprite-mid-b" column={1} row={1} />
      <CloudSprite className="cloud-sprite-front-a" column={0} row={2} />
      <CloudSprite className="cloud-sprite-front-b" column={1} row={2} />

      <div className="reading-garden-world world-front">
        <MistSprite className="distant-fog-a" column={0} row={0} />
        <MistSprite className="distant-fog-b" column={1} row={1} />
        <MistSprite className="distant-fog-c" column={0} row={2} />

        <div className="reading-garden-hero-focus" aria-hidden="true" />
        <MushroomStage
          stage={stage}
          activateRef={infoTriggerRef}
          onActivate={() => {
            mooncapMusicPlayer.unlockFromGesture();
            setIsInfoOpen((open) => !open);
          }}
          expanded={isInfoOpen}
        />
        <img
          className="reading-garden-foreground-mask"
          src={masterBackgroundUrl}
          alt=""
          draggable={false}
        />
        <ReadingGardenLifeCanvas stage={stage} />
      </div>

      <div className="reading-garden-foreground" aria-hidden="true" />
      <div className="reading-garden-grade" aria-hidden="true" />
      <MooncapSkyDevConsole />

      {isInfoOpen && (
        <div className="reading-garden-info-chrome">
          {/*
           * L12 b2 — the dossier is the garden's Liquid region, and the ONLY one.
           * §2.3 assigns "temporary inspectors" to the Liquid role and this is one:
           * disclosed by the hero, dismissable, floating over content it does not
           * replace. `ContextualSurface` is inert in a conventional window by
           * construction, so the teal glass below is still exactly what a standard
           * Mooncap window paints; `theme/liquid-window.css` hands it `--lq-*`
           * material and text only under `.fwin-liquid`/`.popout-liquid`. The scene
           * itself never becomes a Liquid surface — it is the anchor, in both
           * presentations, for `.fwin-body-flush`'s reason.
           */}
          <ContextualSurface
            as="aside"
            className="reading-garden-info"
            id="reading-garden-info"
            role="dialog"
            aria-label={organismName}
          >
            {/* `lq-hit-placed`, not `lq-hit`: this button is already `position: absolute`,
                and the plain variant declares `position: relative`, which would drop it into
                flow. 28x28 rendered, 32px pointer region, and the panel's `overflow: auto`
                does not clip it — the expander's 2px overhang stays inside the 12px padding. */}
            <button
              className="reading-garden-info-close lq-hit-placed"
              type="button"
              onClick={closeInfo}
              aria-label={t("mooncap.info.close")}
            >
              ×
            </button>
            <p>{t("mooncap.info.eyebrow")}</p>
            <div className="reading-garden-info-heading">
              <h1>{organismName}</h1>
              <div className="reading-garden-info-stage" aria-live="polite">
                <strong>{phasePad}</strong>
                <span>
                  {t("mooncap.info.stageOf", { max: READING_GARDEN_MAX_STAGE })}
                </span>
              </div>
            </div>
            <dl className="reading-garden-info-dossier">
              <div>
                <dt>{t("mooncap.info.ageLabel")}</dt>
                <dd>{organismAge}</dd>
              </div>
              <div>
                <dt>{t("mooncap.info.pagesLabel")}</dt>
                <dd>
                  {t("mooncap.info.pagesValue", {
                    count: sceneProgress.pagesRead,
                  })}
                </dd>
              </div>
              <div>
                <dt>{t("mooncap.info.conditionLabel")}</dt>
                <dd>{organismCondition}</dd>
              </div>
            </dl>
            <div className="reading-garden-info-observation">
              <span>{t("mooncap.info.observationLabel")}</span>
              <p>{organismObservation}</p>
            </div>
            <div className="reading-garden-info-copy">
              {/* The garden's honest EMPTY state, and it is a real one: with no page ever
                  read the dossier otherwise says only "0 / 50 pages banked", which reads
                  as stalled progress rather than as "you have not started". Category 8
                  scored the surface `0 of 0 observable` for exactly that - the state was
                  being lived and never named. The class is what makes it observable and it
                  is conditional on the real number, so a garden with any page read has no
                  empty host at all. */}
              {sceneProgress.pagesRead === 0 && (
                <em className="reading-garden-info-empty">
                  {t("mooncap.info.nothingRead")}
                </em>
              )}
              {!mature && (
                <strong>
                  {t("mooncap.info.bankedProgress", {
                    current: pagesTowardNext,
                    target: READING_GARDEN_PAGES_PER_PHASE,
                  })}
                </strong>
              )}
              <span>{phaseStatus}</span>
              {!mature && evolvedToday && (
                <small>{t("mooncap.info.evolvedToday")}</small>
              )}
            </div>
            <div className="reading-garden-info-music">
              <div className="reading-garden-info-music-heading">
                <span>{t("mooncap.info.musicLabel")}</span>
                <small>{t("mooncap.info.musicTrack")}</small>
              </div>
              {/* `lq-hit-scope`: both buttons rendered 103x29 against category 1's 32px
                  pointer floor. Scoped here rather than on `.reading-garden-info`, because
                  that scope's `position: relative` would beat `.reading-garden-info-close`'s
                  own `position: absolute` on specificity and drop the close button into flow —
                  the exact hazard `.lq-hit-placed` exists for, and the close button uses it. */}
              <div className="reading-garden-info-music-toggle lq-hit-scope" role="group">
                <button
                  type="button"
                  aria-pressed={music.enabled}
                  className={music.enabled ? "is-active" : undefined}
                  onClick={() => {
                    setMusic(mooncapMusicPlayer.setEnabled(true));
                  }}
                >
                  {t("mooncap.info.musicOn")}
                </button>
                <button
                  type="button"
                  aria-pressed={!music.enabled}
                  className={!music.enabled ? "is-active" : undefined}
                  onClick={() => {
                    setMusic(mooncapMusicPlayer.setEnabled(false));
                  }}
                >
                  {t("mooncap.info.musicOff")}
                </button>
              </div>
              <label className="reading-garden-info-music-volume">
                <span>{t("mooncap.info.musicVolume")}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={Math.round(music.volume * 100)}
                  disabled={!music.enabled}
                  onChange={(event) => {
                    setMusic(
                      mooncapMusicPlayer.setVolume(
                        Number(event.target.value) / 100,
                      ),
                    );
                  }}
                />
                <strong>{Math.round(music.volume * 100)}</strong>
              </label>
            </div>
            <div className="reading-garden-info-track" aria-hidden="true">
              <i
                style={{
                  width: `${(pagesTowardNext / READING_GARDEN_PAGES_PER_PHASE) * 100}%`,
                }}
              />
            </div>
          </ContextualSurface>
          <p className="reading-garden-game-title" aria-hidden="true">
            {t("mooncap.info.gameName")}
          </p>
        </div>
      )}
    </main>
  );
}

/**
 * Garden world projection.
 *
 * The scene used to mix three unrelated coordinate systems: the master plate was
 * laid out with `object-fit: cover` (so its visible crop moved with the window
 * aspect ratio), the mushroom was anchored to the *container* in `cqh`/px, and
 * the camera drift scaled the plate but not the hero. Any resize slid the
 * terrain out from under the mushroom.
 *
 * Everything that belongs to the world is now positioned inside a single
 * "world" rect that reproduces the cover crop explicitly, anchored on the spot
 * the mushroom grows from rather than on the plate's centre. World-locked
 * layers then use plain percentages of that rect, so the mushroom, its roots,
 * the terrain and the occlusion mask can never drift apart.
 */

export const GARDEN_PLATE_WIDTH = 1122;
export const GARDEN_PLATE_HEIGHT = 1402;

/**
 * Where the hero grows, in plate fractions: the lower mycelial terrace, left of
 * centre, with the terrace lip in front of it and the river reading past its
 * right shoulder.
 */
export const GARDEN_ANCHOR_X = 0.415;
export const GARDEN_ANCHOR_Y = 0.742;

/** Where that anchor should land inside the viewport, in viewport fractions. */
const ANCHOR_VIEWPORT_X = 0.46;
const ANCHOR_VIEWPORT_Y = 0.78;

/**
 * The camera transform scales and drifts the world around the anchor. Overscan
 * keeps the plate covering the viewport through the smallest camera scale plus
 * the drift translation.
 */
const WORLD_OVERSCAN = 1.05;

export interface GardenWorldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Cover-fit the plate to the container, then slide the crop so the hero anchor
 * lands at its intended viewport position instead of wherever a centred crop
 * happened to leave it. In a wide short window this pushes the crop down so the
 * terrace stays in frame; in a tall window it behaves like a centred cover.
 */
export function gardenWorldRect(
  containerWidth: number,
  containerHeight: number,
): GardenWorldRect {
  const scale =
    Math.max(
      containerWidth / GARDEN_PLATE_WIDTH,
      containerHeight / GARDEN_PLATE_HEIGHT,
    ) * WORLD_OVERSCAN;
  const width = GARDEN_PLATE_WIDTH * scale;
  const height = GARDEN_PLATE_HEIGHT * scale;
  return {
    width,
    height,
    x: clamp(
      containerWidth * ANCHOR_VIEWPORT_X - GARDEN_ANCHOR_X * width,
      containerWidth - width,
      0,
    ),
    y: clamp(
      containerHeight * ANCHOR_VIEWPORT_Y - GARDEN_ANCHOR_Y * height,
      containerHeight - height,
      0,
    ),
  };
}

/**
 * Applies the world rect as custom properties. Written straight to the element
 * so a window drag never re-renders the React tree.
 */
export function applyGardenWorldRect(root: HTMLElement, rect: GardenWorldRect) {
  root.style.setProperty('--garden-world-x', `${rect.x.toFixed(2)}px`);
  root.style.setProperty('--garden-world-y', `${rect.y.toFixed(2)}px`);
  root.style.setProperty('--garden-world-w', `${rect.width.toFixed(2)}px`);
  root.style.setProperty('--garden-world-h', `${rect.height.toFixed(2)}px`);
}

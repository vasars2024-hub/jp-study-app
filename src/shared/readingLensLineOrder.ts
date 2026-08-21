/**
 * Geometry-based Reading Lens line ordering.
 *
 * OCR providers do not promise that their line arrays are in reading order.
 * The Lens already receives enough evidence to repair the two unambiguous
 * cases: a horizontal capture reads rows top-to-bottom and fragments within a
 * row left-to-right; a vertical capture reads columns right-to-left and
 * fragments within a column top-to-bottom.
 *
 * Mixed horizontal/vertical pages (for example a manga panel with a horizontal
 * sound effect beside vertical dialogue) have no single axis to sort on, so
 * they go through an explicit *panel* rule instead: same-orientation lines that
 * sit near each other merge into a block, each block is ordered by the
 * single-axis rule above, and the blocks themselves are read in page order.
 *
 * That rule is deliberately narrow, because the alternative to provider order
 * is not "no order" — it is a plausible rewrite of the reader's passage. It
 * applies only when the blocks are spatially separable: if a horizontal block
 * and a vertical block overlap at all (a sound effect painted across a speech
 * bubble is the common case), nothing here can say which one the eye takes
 * first, and provider order is preserved.
 */

export interface ReadingLensPositionedLine {
  box: readonly [number, number, number, number];
  vertical: boolean;
}

interface Positioned<T extends ReadingLensPositionedLine> {
  item: T;
  index: number;
  primary: number;
  secondary: number;
  span: number;
}

interface AxisGroup<T extends ReadingLensPositionedLine> {
  items: Positioned<T>[];
  primary: number;
  span: number;
}

const MIN_GROUP_TOLERANCE = 4;
const SAME_AXIS_FRACTION = 0.6;
const SQUARE_ASPECT_LIMIT = 1.3;

function finiteBox(line: ReadingLensPositionedLine): boolean {
  const [x, y, width, height] = line.box;
  return [x, y, width, height].every(Number.isFinite) && width > 0 && height > 0;
}

function groupTolerance(a: number, b: number): number {
  return Math.max(MIN_GROUP_TOLERANCE, Math.min(a, b) * SAME_AXIS_FRACTION);
}

/**
 * Cluster lines that share a row/column before sorting within it. Comparing
 * only raw y/x values splits slightly skewed OCR fragments into separate rows;
 * comparing only overlap can chain neighbouring rows together. A bounded
 * centre-distance cluster handles both without changing the line geometry.
 */
function orderOnAxis<T extends ReadingLensPositionedLine>(
  lines: readonly T[],
  vertical: boolean,
): T[] {
  const positioned = lines.map((item, index): Positioned<T> => {
    const [x, y, width, height] = item.box;
    return {
      item,
      index,
      primary: vertical ? x + width / 2 : y + height / 2,
      secondary: vertical ? y : x,
      span: vertical ? width : height,
    };
  });

  positioned.sort((a, b) => {
    const primary = vertical ? b.primary - a.primary : a.primary - b.primary;
    return primary || a.secondary - b.secondary || a.index - b.index;
  });

  const groups: AxisGroup<T>[] = [];
  for (const candidate of positioned) {
    let nearest: AxisGroup<T> | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const group of groups) {
      const distance = Math.abs(candidate.primary - group.primary);
      if (distance <= groupTolerance(candidate.span, group.span) && distance < nearestDistance) {
        nearest = group;
        nearestDistance = distance;
      }
    }

    if (!nearest) {
      groups.push({ items: [candidate], primary: candidate.primary, span: candidate.span });
      continue;
    }

    nearest.items.push(candidate);
    nearest.primary = nearest.items.reduce((sum, line) => sum + line.primary, 0) / nearest.items.length;
    nearest.span = nearest.items.reduce((sum, line) => sum + line.span, 0) / nearest.items.length;
  }

  groups.sort((a, b) => vertical ? b.primary - a.primary : a.primary - b.primary);
  return groups.flatMap((group) =>
    group.items
      .sort((a, b) => a.secondary - b.secondary || a.primary - b.primary || a.index - b.index)
      .map((line) => line.item),
  );
}

interface BlockBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** How far this block reaches out to claim a neighbour, in the same units as the box. */
  pad: number;
}

interface OrientationBlock<T extends ReadingLensPositionedLine> extends BlockBounds {
  vertical: boolean;
  items: { item: T; index: number }[];
}

/**
 * Cross-axis extent, which for a text line is roughly its glyph size. A block
 * claims neighbours within that distance, so the tolerance scales with the
 * capture instead of assuming a pixel density.
 */
function lineThickness(line: ReadingLensPositionedLine): number {
  const [, , width, height] = line.box;
  return line.vertical ? width : height;
}

/**
 * A box close enough to square that its orientation flag is a coin flip — a
 * single glyph reads the same either way, so it carries no evidence about
 * which way the capture runs.
 */
function ambiguousOrientation(line: ReadingLensPositionedLine): boolean {
  const [, , width, height] = line.box;
  return Math.max(width, height) < Math.min(width, height) * SQUARE_ASPECT_LIMIT;
}

function blocksTouch(a: BlockBounds, b: BlockBounds): boolean {
  const pad = Math.max(a.pad, b.pad);
  const gapX = Math.max(a.left, b.left) - Math.min(a.right, b.right);
  const gapY = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
  return gapX <= pad && gapY <= pad;
}

function blocksOverlap(a: BlockBounds, b: BlockBounds): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * Merge same-orientation lines that sit within a glyph-size of each other into
 * blocks. Merging is greedy and repeats until stable; captures carry tens of
 * lines, so the quadratic sweep is cheaper than maintaining a union-find.
 */
function orientationBlocks<T extends ReadingLensPositionedLine>(
  lines: readonly T[],
): OrientationBlock<T>[] {
  const blocks: OrientationBlock<T>[] = lines.map((item, index) => {
    const [x, y, width, height] = item.box;
    return {
      vertical: item.vertical,
      items: [{ item, index }],
      left: x,
      top: y,
      right: x + width,
      bottom: y + height,
      pad: lineThickness(item),
    };
  });

  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < blocks.length && !merged; i += 1) {
      for (let j = i + 1; j < blocks.length; j += 1) {
        const a = blocks[i];
        const b = blocks[j];
        if (a.vertical !== b.vertical || !blocksTouch(a, b)) continue;
        blocks[i] = {
          vertical: a.vertical,
          items: [...a.items, ...b.items],
          left: Math.min(a.left, b.left),
          top: Math.min(a.top, b.top),
          right: Math.max(a.right, b.right),
          bottom: Math.max(a.bottom, b.bottom),
          pad: Math.max(a.pad, b.pad),
        };
        blocks.splice(j, 1);
        merged = true;
        break;
      }
    }
  }

  return blocks;
}

/**
 * Which way the page runs. Weighted by how much text runs in each direction
 * rather than by line count, so one long vertical dialogue column outranks a
 * pair of two-glyph sound effects. An exact tie names no direction.
 */
function pageRunsRightToLeft(lines: readonly ReadingLensPositionedLine[]): boolean | null {
  let vertical = 0;
  let horizontal = 0;
  for (const line of lines) {
    const [, , width, height] = line.box;
    if (line.vertical) vertical += height;
    else horizontal += width;
  }
  if (vertical === horizontal) return null;
  return vertical > horizontal;
}

/**
 * Read blocks in page order: bands of vertically overlapping blocks top to
 * bottom, and within a band right-to-left for a vertical page or left-to-right
 * for a horizontal one. Banding is a sweep rather than a pairwise comparator,
 * because "overlaps vertically" is not transitive and `sort` may not be handed
 * an inconsistent comparator.
 *
 * Returns null when a band is not a clique — that is, when the sweep pulled two
 * blocks into one band only through a third. A tall block does exactly that: a
 * vertical column beside two stacked captions spans both, and since a band is
 * then ordered purely across the page, the lower caption can win on a single
 * pixel of x and the page reads bottom-line-first. A live capture supplied that
 * geometry (the boxes are in the test and the ledger), so a transitive band is
 * treated as geometry this rule cannot read rather than sorted anyway.
 */
function orderBlocks<T extends ReadingLensPositionedLine>(
  blocks: readonly OrientationBlock<T>[],
  rightToLeft: boolean,
): OrientationBlock<T>[] | null {
  const sorted = [...blocks].sort((a, b) => a.top - b.top || a.left - b.left);
  const bands: OrientationBlock<T>[][] = [];
  let bandBottom = Number.NEGATIVE_INFINITY;
  for (const block of sorted) {
    if (bands.length === 0 || block.top >= bandBottom) {
      bands.push([block]);
      bandBottom = block.bottom;
    } else {
      bands[bands.length - 1].push(block);
      bandBottom = Math.max(bandBottom, block.bottom);
    }
  }

  for (const band of bands) {
    for (let i = 0; i < band.length; i += 1) {
      for (let j = i + 1; j < band.length; j += 1) {
        if (band[i].top >= band[j].bottom || band[j].top >= band[i].bottom) return null;
      }
    }
  }

  return bands.flatMap((band) =>
    band.sort(
      (a, b) =>
        (rightToLeft ? b.right - a.right : a.left - b.left) ||
        a.top - b.top ||
        a.items[0].index - b.items[0].index,
    ),
  );
}

/**
 * Return a newly allocated array in safe reading order.
 *
 * Invalid geometry is fail-open, and so is a mixed-orientation capture whose
 * blocks are not spatially separable or whose page direction is a tie: provider
 * order is preserved rather than producing a plausible but unsupported rewrite.
 */
export function orderReadingLensLines<T extends ReadingLensPositionedLine>(
  lines: readonly T[],
): T[] {
  if (lines.length < 2 || lines.some((line) => !finiteBox(line))) return [...lines];

  // Only lines whose own box commits to an orientation get a vote on whether
  // the capture is mixed. Both engines derive `vertical` from the box's aspect
  // ratio (`paddleOcr` isVerticalBox, `mangaOcr` y1-y0 > x1-x0), so a lone
  // trailing 。 comes back square and lands on whichever side the comparison
  // falls — and one such glyph must not turn a plain vertical bubble into a
  // panel problem. Square lines still get ordered; they just do not decide.
  const decisive = lines.filter((line) => !ambiguousOrientation(line));
  const deciding = decisive.length > 0 ? decisive : lines;
  const verticalCount = deciding.reduce((count, line) => count + Number(line.vertical), 0);
  if (verticalCount === 0 || verticalCount === deciding.length) {
    return orderOnAxis(lines, verticalCount === deciding.length);
  }

  const rightToLeft = pageRunsRightToLeft(lines);
  if (rightToLeft === null) return [...lines];

  const blocks = orientationBlocks(lines);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (blocksOverlap(blocks[i], blocks[j])) return [...lines];
    }
  }

  const ordered = orderBlocks(blocks, rightToLeft);
  if (!ordered) return [...lines];

  return ordered.flatMap((block) =>
    orderOnAxis(
      block.items.map((entry) => entry.item),
      block.vertical,
    ),
  );
}

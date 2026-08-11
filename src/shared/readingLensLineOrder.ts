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
 * sound effect beside vertical dialogue) do not have one safe geometric order.
 * Those retain provider order until the product has an explicit panel-order
 * rule rather than silently turning a heuristic into the user's passage.
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

/**
 * Return a newly allocated array in safe reading order.
 *
 * Invalid geometry and mixed orientation are fail-open: provider order is
 * preserved rather than producing a plausible but unsupported rewrite.
 */
export function orderReadingLensLines<T extends ReadingLensPositionedLine>(
  lines: readonly T[],
): T[] {
  if (lines.length < 2 || lines.some((line) => !finiteBox(line))) return [...lines];

  const verticalCount = lines.reduce((count, line) => count + Number(line.vertical), 0);
  if (verticalCount !== 0 && verticalCount !== lines.length) return [...lines];

  return orderOnAxis(lines, verticalCount === lines.length);
}

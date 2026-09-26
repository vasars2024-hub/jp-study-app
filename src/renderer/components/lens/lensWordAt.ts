/**
 * "Look up the word under the cursor" — which word of an OCR read the pointer
 * is on.
 *
 * The Lens reads a small box around the pointer (`lens.atCursor`); the read
 * comes back as lines with a box each (region-relative DIP) and the line's
 * tokens. OCR gives no per-character boxes, so the position along the line is
 * mapped proportionally onto its characters — exact for the monospaced CJK
 * text visual novels and games draw, close enough for proportional Cyrillic.
 */

export interface LensWordLine {
  text: string;
  box: readonly [number, number, number, number];
  vertical: boolean;
  tokens: ReadonlyArray<{ surface: string }>;
}

export interface LensWordHit<L extends LensWordLine = LensWordLine> {
  line: L;
  token: L['tokens'][number];
  /** Index of the token in `line.tokens`. */
  index: number;
}

/** Punctuation, digits-only and whitespace tokens are never "the word". */
function isWordish(surface: string): boolean {
  return /[\p{L}]/u.test(surface);
}

function distanceToBox(point: { x: number; y: number }, box: readonly [number, number, number, number]): number {
  const [x, y, w, h] = box;
  const dx = point.x < x ? x - point.x : point.x > x + w ? point.x - (x + w) : 0;
  const dy = point.y < y ? y - point.y : point.y > y + h ? point.y - (y + h) : 0;
  return Math.hypot(dx, dy);
}

/**
 * The token at `point`, or null when nothing readable is near it. A point
 * between lines picks the closest line within `slack` px.
 */
export function pickLensWordAt<L extends LensWordLine>(
  lines: readonly L[],
  point: { x: number; y: number },
  slack = 24,
): LensWordHit<L> | null {
  let best: L | null = null;
  let bestDist = Infinity;
  for (const line of lines) {
    if (!line.text.trim() || !line.tokens.length) continue;
    const d = distanceToBox(point, line.box);
    if (d < bestDist) {
      bestDist = d;
      best = line;
    }
  }
  if (!best || bestDist > slack) return null;

  const [x, y, w, h] = best.box;
  const along = best.vertical ? (point.y - y) / Math.max(1, h) : (point.x - x) / Math.max(1, w);
  const chars = [...best.text];
  const target = Math.min(chars.length - 1, Math.max(0, Math.floor(along * chars.length)));

  // Character span of each token, walking the line text in order.
  const spans: Array<{ start: number; end: number }> = [];
  let unit = 0; // UTF-16 cursor into the line text
  for (const token of best.tokens) {
    const at = best.text.indexOf(token.surface, unit);
    const startUnit = at >= 0 ? at : unit;
    const start = [...best.text.slice(0, startUnit)].length;
    spans.push({ start, end: start + [...token.surface].length });
    unit = startUnit + token.surface.length;
  }

  let index = spans.findIndex((s) => target >= s.start && target < s.end);
  if (index < 0) index = spans.length - 1;
  if (!isWordish(best.tokens[index]!.surface)) {
    // The nearest wordish token on either side.
    let found = -1;
    for (let step = 1; step < spans.length && found < 0; step += 1) {
      for (const candidate of [index - step, index + step]) {
        if (candidate >= 0 && candidate < spans.length && isWordish(best.tokens[candidate]!.surface)) {
          found = candidate;
          break;
        }
      }
    }
    if (found < 0) return null;
    index = found;
  }
  return { line: best, token: best.tokens[index]!, index };
}

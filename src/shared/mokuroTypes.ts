/**
 * Mokuro-compatible page OCR schema.
 *
 * License boundary (Phase 10 audit):
 * - manga-ocr (kha-white / mayocream ONNX export) is Apache-2.0 — safe to wrap.
 * - We emit/consume the Mokuro *JSON file format* and published overlay layout
 *   math (box placement, vertical writing-mode, font sizing). We do **not**
 *   copy Mokuro source code (GPL-family); format + algorithms only.
 *
 * Schema versions we accept:
 * - Stock Mokuro per-page JSON: "0.1.x"
 * - Our emitter: "1.01" (same block shape + optional Study OS extensions)
 */

export const MOKURO_EMIT_VERSION = '1.01';

export type MokuroBox = [xmin: number, ymin: number, xmax: number, ymax: number];

export type MokuroBlockKind = 'text' | 'sfx' | 'ignore';

export interface MokuroBlock {
  /** Axis-aligned box in image pixel space: [xmin, ymin, xmax, ymax]. */
  box: MokuroBox;
  vertical: boolean;
  font_size?: number;
  lines: string[];
  /** Stable id for corrections / progressive updates (Study OS extension). */
  regionId?: string;
  confidence?: number;
  kind?: MokuroBlockKind;
  /**
   * The model's original, never-overwritten output for this region, frozen the
   * first time it's recognized. `lines` may hold a user correction; this stays
   * the raw OCR result so a "revert to raw" / raw-vs-corrected diff is always
   * possible even after repeated forced rescans.
   */
  rawLines?: string[];
  /** Manual reading-order override (lower = earlier). Absent = natural detection order. */
  order?: number;
}

export interface MokuroPage {
  version: string;
  img_width: number;
  img_height: number;
  blocks: MokuroBlock[];
}

export class MokuroParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MokuroParseError';
  }
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function parseBox(raw: unknown): MokuroBox {
  if (!Array.isArray(raw) || raw.length < 4) {
    throw new MokuroParseError('block.box must be [xmin, ymin, xmax, ymax]');
  }
  const box: MokuroBox = [
    Number(raw[0]),
    Number(raw[1]),
    Number(raw[2]),
    Number(raw[3]),
  ];
  if (!box.every(isFiniteNumber)) {
    throw new MokuroParseError('block.box values must be finite numbers');
  }
  return box;
}

function parseBlock(raw: unknown, index: number): MokuroBlock {
  if (!raw || typeof raw !== 'object') {
    throw new MokuroParseError(`blocks[${index}] must be an object`);
  }
  const o = raw as Record<string, unknown>;
  const box = parseBox(o.box);
  if (typeof o.vertical !== 'boolean') {
    throw new MokuroParseError(`blocks[${index}].vertical must be a boolean`);
  }
  if (!Array.isArray(o.lines) || !o.lines.every((l) => typeof l === 'string')) {
    throw new MokuroParseError(`blocks[${index}].lines must be string[]`);
  }
  const block: MokuroBlock = {
    box,
    vertical: o.vertical,
    lines: o.lines as string[],
  };
  if (isFiniteNumber(o.font_size)) block.font_size = o.font_size;
  if (typeof o.regionId === 'string' && o.regionId) block.regionId = o.regionId;
  if (isFiniteNumber(o.confidence)) block.confidence = o.confidence;
  if (o.kind === 'text' || o.kind === 'sfx' || o.kind === 'ignore') block.kind = o.kind;
  if (Array.isArray(o.rawLines) && o.rawLines.every((l) => typeof l === 'string')) {
    block.rawLines = o.rawLines as string[];
  }
  if (isFiniteNumber(o.order)) block.order = o.order;
  return block;
}

/** True for stock Mokuro 0.1.x and our 1.01 emitter. */
export function isSupportedMokuroVersion(version: string): boolean {
  if (version === MOKURO_EMIT_VERSION) return true;
  const m = /^0\.1(?:\.\d+)?$/.exec(version.trim());
  return !!m;
}

/**
 * Validate and normalize unknown JSON into a MokuroPage.
 * Throws MokuroParseError on structural or unsupported-version failures.
 */
export function parseMokuroPage(raw: unknown): MokuroPage {
  if (!raw || typeof raw !== 'object') {
    throw new MokuroParseError('page must be an object');
  }
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== 'string' || !o.version.trim()) {
    throw new MokuroParseError('page.version is required');
  }
  if (!isSupportedMokuroVersion(o.version)) {
    throw new MokuroParseError(
      `unsupported Mokuro schema version "${o.version}" (accepted: 0.1.x, ${MOKURO_EMIT_VERSION})`,
    );
  }
  if (!isFiniteNumber(o.img_width) || !isFiniteNumber(o.img_height)) {
    throw new MokuroParseError('img_width and img_height must be finite numbers');
  }
  if (!Array.isArray(o.blocks)) {
    throw new MokuroParseError('blocks must be an array');
  }
  return {
    version: o.version,
    img_width: o.img_width,
    img_height: o.img_height,
    blocks: o.blocks.map((b, i) => parseBlock(b, i)),
  };
}

/** Hash a box into a stable region id for corrections across rescans. */
export function regionIdFromBox(box: MokuroBox, pageStem: string): string {
  const [x0, y0, x1, y1] = box.map((n) => Math.round(n));
  return `${pageStem}:${x0},${y0},${x1},${y1}`;
}

/** Join block lines into a single lookup/mining context string. */
export function blockContext(block: MokuroBlock): string {
  return block.lines.join(block.vertical ? '' : '\n').trim();
}

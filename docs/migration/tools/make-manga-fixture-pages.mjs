/**
 * Phase 5 — render *readable* Japanese manga fixture pages.
 *
 * The Phase 5 transport proofs used a 1x1 GIF. That was the right fixture for
 * proving bytes crossed the boundary with their provider header intact, and the
 * wrong one for everything downstream: manga OCR cannot read a 1x1 pixel, so
 * "OCR reported it could not decode the page" was an expected non-result rather
 * than evidence. The OCR -> dictionary -> mine gate needs a page that a real
 * reader would call a manga page.
 *
 * So this renders one deterministically: a real page-sized image with real
 * vertical Japanese dialogue inside real speech bubbles, drawn with a real
 * installed Japanese font. It is a *fixture*, not synthetic-looking noise — the
 * detector sees bubble-shaped high-contrast text regions the way it would on a
 * scan, and `manifest.json` records the exact lines drawn so a proof can assert
 * what OCR read against what was drawn rather than eyeballing it.
 *
 * Deterministic on purpose: no randomness, no timestamps in the pixels. The
 * same command produces byte-identical pages, so a later session can re-run the
 * gate and compare.
 *
 * Usage:
 *   node docs/migration/tools/make-manga-fixture-pages.mjs [--out <dir>] [--font <path>]
 *
 * Default output is %TEMP%/phase5-manga-fixture-pages, which is where
 * `fixture-manga-cdn.mjs` looks for it.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

export const DEFAULT_OUT_DIR = path.join(os.tmpdir(), 'phase5-manga-fixture-pages');

const OUT_DIR = path.resolve(arg('--out', DEFAULT_OUT_DIR));

/**
 * Font candidates, best first. A `.ttc` collection is tried too, but a plain
 * `.ttf` is preferred: collection support varies and a silently-substituted
 * fallback font would render the whole fixture as tofu boxes, which OCR would
 * "read" as garbage for a reason that has nothing to do with the pipeline.
 */
const FONT_CANDIDATES = [
  arg('--font', ''),
  'C:/Windows/Fonts/YuGothM.ttc',
  'C:/Windows/Fonts/yumin.ttf',
  'C:/Windows/Fonts/msgothic.ttc',
  'C:/Windows/Fonts/meiryo.ttc',
].filter(Boolean);

const FONT_FAMILY = 'Phase5MangaFixture';

function registerFont() {
  for (const candidate of FONT_CANDIDATES) {
    if (!fs.existsSync(candidate)) continue;
    if (GlobalFonts.registerFromPath(candidate, FONT_FAMILY)) {
      return candidate;
    }
  }
  throw new Error(
    `No Japanese font could be registered. Tried:\n  ${FONT_CANDIDATES.join('\n  ')}`,
  );
}

// ---------------------------------------------------------------- page spec

const PAGE_WIDTH = 1200;
const PAGE_HEIGHT = 1700;

/**
 * Typography, tunable because it is what the detector actually reacts to.
 *
 * The column gap is the load-bearing one. `mangaOcr.detectRegions` merges
 * fragments whose boxes sit within 14px of each other (`mergeNearbyRegions`), and
 * real manga sets vertical columns close enough that a bubble arrives as one
 * region. A generous gap looks fine to a human and makes the pipeline emit one
 * region *per column*, which then classify as `sfx` on their aspect ratio and
 * read back as sentence fragments. Keep the ink gap under that threshold.
 */
const FONT_SIZE = Number(arg('--font-size', '50'));
const LINE_HEIGHT_FACTOR = Number(arg('--line-height', '1.08'));
const COLUMN_GAP_FACTOR = Number(arg('--column-gap', '1.12'));

/**
 * The dialogue. Short, ordinary sentences with a clear lookup target — the
 * mining gate needs a word a dictionary actually has, so `猫` and `窓` carry
 * page 1 and `天気` carries page 2. These are the same lines the Phase 3 cue
 * proofs used, which keeps one vocabulary across the two media paths.
 */
const PAGES = [
  {
    name: 'page-1',
    bubbles: [
      // Right-to-left reading order: the first bubble sits on the right.
      { cx: 880, cy: 390, lines: ['猫が窓辺で', '寝ている。'] },
      { cx: 320, cy: 1000, lines: ['とても静か', 'だね。'] },
      // Two balanced columns, not one long one: a single-column bubble is the
      // pathological case for detection — it is narrow enough to classify as
      // `sfx` and long enough to break into fragments part-way down.
      { cx: 840, cy: 1490, lines: ['本を読', 'もう。'] },
    ],
  },
  {
    name: 'page-2',
    bubbles: [
      // Columns of equal length. When the last column overhangs the others, the
      // trailing `。` sits alone past the end of the block and the mask misses it.
      { cx: 870, cy: 400, lines: ['今日は本当にい', 'い天気ですね。'] },
      { cx: 330, cy: 1030, lines: ['公園へ行き', 'ませんか。'] },
    ],
  },
];

// ---------------------------------------------------------------- drawing

/** Characters that hang in a different corner of the cell when set vertically. */
const VERTICAL_SHIFT = new Map([
  ['。', { x: 0.3, y: -0.3 }],
  ['、', { x: 0.3, y: -0.3 }],
]);

/** Characters drawn rotated 90° in vertical text. */
const VERTICAL_ROTATE = new Set(['ー', '—', '〜', '(', ')', '「', '」']);

function drawVerticalLine(ctx, chars, x, top, fontSize, lineHeight) {
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    const cy = top + i * lineHeight + lineHeight / 2;
    const shift = VERTICAL_SHIFT.get(ch);
    if (VERTICAL_ROTATE.has(ch)) {
      ctx.save();
      ctx.translate(x, cy);
      ctx.rotate(Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
      continue;
    }
    ctx.fillText(
      ch,
      x + (shift ? shift.x * fontSize : 0),
      cy + (shift ? shift.y * fontSize : 0),
    );
  }
}

/**
 * Panel gutters. Real pages are divided, and a divided page is what the
 * detector was trained on — a bare white sheet with floating bubbles reads as
 * one large region far more often.
 */
function drawPanels(ctx, panels) {
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 6;
  for (const [x, y, w, h] of panels) {
    ctx.fillStyle = '#e9e9e9';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
}

/** Flat mid-grey tone blocks, so bubbles sit on something rather than on paper. */
function drawTone(ctx, blocks) {
  for (const [x, y, w, h, shade] of blocks) {
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, w, h);
  }
}

function renderPage(page, fontSize = FONT_SIZE) {
  const canvas = createCanvas(PAGE_WIDTH, PAGE_HEIGHT);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PAGE_WIDTH, PAGE_HEIGHT);

  drawPanels(ctx, [
    [60, 60, PAGE_WIDTH - 120, 660],
    [60, 760, 520, 560],
    [620, 760, PAGE_WIDTH - 680, 560],
    [60, 1360, PAGE_WIDTH - 120, 280],
  ]);
  drawTone(ctx, [
    [90, 90, 480, 300, '#cfcfcf'],
    [660, 820, 460, 200, '#d8d8d8'],
    [110, 1390, 420, 220, '#c8c8c8'],
  ]);

  const lineHeight = Math.round(fontSize * LINE_HEIGHT_FACTOR);
  const columnGap = Math.round(fontSize * COLUMN_GAP_FACTOR);

  ctx.font = `${fontSize}px "${FONT_FAMILY}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const bubble of page.bubbles) {
    const columns = bubble.lines.length;
    const longest = Math.max(...bubble.lines.map((l) => [...l].length));
    const blockWidth = (columns - 1) * columnGap + fontSize;
    const blockHeight = longest * lineHeight;

    // Bubbles are sized from their text rather than by hand. Ink close to the
    // heavy outline is what produced a spurious leading `「` in an earlier run —
    // the detector took part of the ellipse edge into the crop. The factors keep
    // the text block's corners inside the ellipse: (1/1.55)² + (1/1.45)² < 1.
    const rx = (blockWidth / 2) * 1.55 + 16;
    const ry = (blockHeight / 2) * 1.45 + 16;

    // The bubble itself: solid white with a heavy outline, the highest-contrast
    // shape on the page.
    ctx.beginPath();
    ctx.ellipse(bubble.cx, bubble.cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#000000';
    // Vertical Japanese runs top-to-bottom, columns right-to-left, and every
    // column starts at the same top edge. Centering each column on its own
    // length instead staggers them, and a staggered pair is what the detector
    // split into two `sfx` fragments rather than one bubble.
    const rightX = bubble.cx + ((columns - 1) * columnGap) / 2;
    const blockTop = bubble.cy - blockHeight / 2;
    for (let c = 0; c < columns; c++) {
      drawVerticalLine(
        ctx,
        [...bubble.lines[c]],
        rightX - c * columnGap,
        blockTop,
        fontSize,
        lineHeight,
      );
    }
  }

  return canvas.toBuffer('image/png');
}

// ---------------------------------------------------------------- output

const fontPath = registerFont();
fs.mkdirSync(OUT_DIR, { recursive: true });

const manifest = {
  fixture: 'Phase 5 readable manga pages',
  tool: 'docs/migration/tools/make-manga-fixture-pages.mjs',
  font: fontPath,
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  typography: {
    fontSize: FONT_SIZE,
    lineHeightFactor: LINE_HEIGHT_FACTOR,
    columnGapFactor: COLUMN_GAP_FACTOR,
  },
  note:
    'Deterministic. The 1x1 GIF fixture proved transport; this proves the page is readable, so an OCR miss is a real result instead of an expected one.',
  pages: [],
};

for (const page of PAGES) {
  const png = renderPage(page);
  const file = path.join(OUT_DIR, `${page.name}.png`);
  fs.writeFileSync(file, png);
  manifest.pages.push({
    name: page.name,
    file,
    bytes: png.byteLength,
    // Vertical columns are one visual block per bubble; joined without a
    // separator because that is how the text reads aloud, and how OCR returns
    // a single bubble.
    bubbles: page.bubbles.map((b) => b.lines.join('')),
  });
  console.log(`[manga-fixture] ${file} (${png.byteLength} bytes)`);
}

const manifestPath = path.join(OUT_DIR, 'manifest.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`[manga-fixture] font: ${fontPath}`);
console.log(`[manga-fixture] wrote ${manifestPath}`);

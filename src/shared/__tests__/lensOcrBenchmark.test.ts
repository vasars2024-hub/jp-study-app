// @vitest-environment node
/**
 * Reading Lens OCR benchmark: accuracy and latency of the bundled offline
 * recognizer on a generated fixture set, before and after the preparation in
 * `ocrPreprocess.ts` / `lensBasicOcr.ts`.
 *
 * The fixtures are rendered by `tools/lens-ocr-fixtures.cjs` from text written
 * for this benchmark — horizontal, small, vertical, furigana, manga-bold on
 * screentone, low contrast, dark dialogue boxes, outlined subtitles and noisy
 * paper — and checked in as PNGs, so this test never depends on the fonts of the
 * machine running it.
 *
 * "Before" is what the app did with Tesseract until now: the raw pixels, with
 * the model picked from the crop's aspect ratio (`orientationForSize` in
 * `renderer/mangaOcrOrientation.ts`, inlined below so a shared test does not
 * import renderer code). "After" is `readWithBasicEngine` — the exact function
 * the Lens runs — with the same Tesseract build and the same language data the
 * app ships in `public/tesseract/lang`.
 *
 * The thresholds sit a little under the measured numbers (see the table this
 * prints) so ordinary engine jitter does not flake the suite, while a real
 * regression in any category fails it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  characterAccuracy,
  cleanOcrJapanese,
  readWithBasicEngine,
  type BasicOcrModel,
  type BasicRecognizer,
  type TesseractPageLike,
} from '../lensBasicOcr';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const require = createRequire(path.join(ROOT, 'package.json'));
const FIXTURES = path.join(__dirname, 'fixtures', 'lensOcr');
const LANG_PATH = path.join(ROOT, 'public', 'tesseract', 'lang');

interface FixtureEntry {
  id: string;
  file: string;
  category: string;
  orientation: 'horizontal' | 'vertical';
  text: string;
  width: number;
  height: number;
}

type CanvasModule = typeof import('@napi-rs/canvas');
type TesseractModule = typeof import('tesseract.js');
type Worker = Awaited<ReturnType<TesseractModule['createWorker']>>;

function tryRequire<T>(id: string): T | null {
  try {
    return require(id) as T;
  } catch {
    return null;
  }
}

const canvasLib = tryRequire<CanvasModule>('@napi-rs/canvas');
const tesseract = tryRequire<TesseractModule>('tesseract.js');
const haveData = fs.existsSync(path.join(LANG_PATH, 'jpn.traineddata.gz'))
  && fs.existsSync(path.join(FIXTURES, 'manifest.json'));
const runnable = Boolean(canvasLib && tesseract && haveData);

const WIDE_RATIO = 1.15;
function orientationForSize(width: number, height: number): BasicOcrModel {
  return width > height * WIDE_RATIO ? 'jpn' : 'jpn_vert';
}

interface Row {
  id: string;
  category: string;
  before: number;
  after: number;
  beforeMs: number;
  afterMs: number;
  passes: number;
  got: string;
}

describe.skipIf(!runnable)('Reading Lens offline OCR benchmark', () => {
  const workers = new Map<BasicOcrModel, Worker>();
  const rows: Row[] = [];
  const cachePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-lens-ocr-bench-'));

  beforeAll(async () => {
    for (const model of ['jpn', 'jpn_vert'] as const) {
      workers.set(model, await tesseract!.createWorker(model, 1, { langPath: LANG_PATH, cachePath, gzip: true }));
    }
  }, 120_000);

  afterAll(async () => {
    for (const worker of workers.values()) await worker.terminate();
    fs.rmSync(cachePath, { recursive: true, force: true });
    if (!rows.length) return;
    const pct = (n: number): string => `${(n * 100).toFixed(1)}%`;
    const lines = rows.map((r) => `${r.id.padEnd(26)} ${r.category.padEnd(12)} before ${pct(r.before).padStart(6)} `
      + `after ${pct(r.after).padStart(6)}  ${String(r.beforeMs).padStart(5)}ms -> ${String(r.afterMs).padStart(5)}ms `
      + `(${r.passes} pass${r.passes === 1 ? '' : 'es'})  ${JSON.stringify(r.got)}`);
    const mean = (pick: (r: Row) => number): number => rows.reduce((s, r) => s + pick(r), 0) / rows.length;
    console.log([
      'Reading Lens offline OCR benchmark (character accuracy, latency)',
      ...lines,
      `MEAN accuracy before ${pct(mean((r) => r.before))} after ${pct(mean((r) => r.after))}; `
        + `mean latency ${Math.round(mean((r) => r.beforeMs))}ms -> ${Math.round(mean((r) => r.afterMs))}ms`,
    ].join('\n'));
  });

  const manifest: FixtureEntry[] = runnable
    ? JSON.parse(fs.readFileSync(path.join(FIXTURES, 'manifest.json'), 'utf8')) as FixtureEntry[]
    : [];

  const encode = (image: { rgba: Uint8ClampedArray; width: number; height: number }): Buffer => {
    const c = canvasLib!.createCanvas(image.width, image.height);
    const g = c.getContext('2d');
    const data = g.createImageData(image.width, image.height);
    data.data.set(image.rgba);
    g.putImageData(data, 0, 0);
    return c.toBuffer('image/png');
  };

  // Set LENS_OCR_BENCH_DUMP to a folder to see exactly what the recognizer was shown.
  const dumpDir = process.env.LENS_OCR_BENCH_DUMP;
  let current = '';
  let dumped = 0;
  const recognize: BasicRecognizer = async (image, model) => {
    const png = encode(image);
    if (dumpDir) fs.writeFileSync(path.join(dumpDir, `${current}-${++dumped}-${model}.png`), png);
    const { data } = await workers.get(model)!.recognize(png, {}, { blocks: true, text: true });
    return data as unknown as TesseractPageLike;
  };

  it('reads every fixture at least as well as the raw pixels, and well overall', async () => {
    for (const fixture of manifest) {
      current = fixture.id;
      dumped = 0;
      const png = fs.readFileSync(path.join(FIXTURES, fixture.file));
      const img = await canvasLib!.loadImage(png);
      const c = canvasLib!.createCanvas(img.width, img.height);
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0);
      const pixels = g.getImageData(0, 0, img.width, img.height);

      let t = Date.now();
      const raw = await workers.get(orientationForSize(img.width, img.height))!.recognize(png);
      const beforeMs = Date.now() - t;
      const before = characterAccuracy(fixture.text, cleanOcrJapanese(raw.data.text));

      t = Date.now();
      const read = await readWithBasicEngine({ data: pixels.data, width: img.width, height: img.height }, recognize);
      const afterMs = Date.now() - t;
      const after = characterAccuracy(fixture.text, read.text);
      rows.push({
        id: fixture.id, category: fixture.category, before, after, beforeMs, afterMs, passes: read.passes, got: read.text,
      });
      expect(read.orientation, `${fixture.id}: orientation`).toBe(fixture.orientation);
    }

    const mean = (pick: (r: Row) => number): number => rows.reduce((s, r) => s + pick(r), 0) / rows.length;
    const byCategory = new Map<string, Row[]>();
    for (const row of rows) byCategory.set(row.category, [...(byCategory.get(row.category) ?? []), row]);

    // Measured on 2026-10-09 (20 fixtures): before 64.5% mean, after 99.4% mean,
    // worst fixture 92%; ~100 ms per fixture either way. The bars below leave
    // room for engine jitter and slower machines, not for a lost category.
    expect(rows.length).toBe(manifest.length);
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(mean((r) => r.after)).toBeGreaterThanOrEqual(0.95);
    expect(mean((r) => r.after) - mean((r) => r.before)).toBeGreaterThanOrEqual(0.25);
    for (const row of rows) {
      expect(row.after, `${row.id} accuracy`).toBeGreaterThanOrEqual(0.85);
      expect(row.passes, `${row.id} passes`).toBeLessThanOrEqual(3);
    }
    for (const [category, list] of byCategory) {
      const after = list.reduce((s, r) => s + r.after, 0) / list.length;
      const before = list.reduce((s, r) => s + r.before, 0) / list.length;
      expect(after, `${category} regressed`).toBeGreaterThanOrEqual(before - 0.02);
    }
    // Latency: the median fixture, so one slow first-call warm-up does not decide it.
    const latencies = rows.map((r) => r.afterMs).sort((a, b) => a - b);
    expect(latencies[Math.floor(latencies.length / 2)]).toBeLessThan(1500);
  }, 300_000);
});

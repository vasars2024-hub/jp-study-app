/**
 * Snip to cards' bundled offline reader: Tesseract, in this window.
 *
 * Used when no accurate engine (PaddleOCR, manga-ocr) is installed for any
 * language the snip may be in. Japanese data ships with the app; Chinese
 * (Simplified, Traditional) data is an optional download, loaded from the URL
 * main hands over (`SnipJob.basicOcr.models`). Every installed model reads the
 * picture through the Reading Lens's preparation policy with the stylised
 * passes on (`readWithBasicEngine`, `stylised: true`: adaptive thresholds and
 * colour layers for outlined, coloured lettering), and the read that is most
 * confident and most consistent with its own script wins. The snip's language
 * is then the language its text is in (`detectStudyLangOfText`).
 */
import { createWorker, type Worker } from 'tesseract.js';
import type { SnipJob, SnipTessModel } from '../shared/snipToCards';
import { pickSnipRead } from '../shared/snipToCards';
import { readWithBasicEngine, type BasicRecognizer, type TesseractPageLike } from '../shared/lensBasicOcr';
import type { StudyLang } from '../shared/studyLang';
import { detectStudyLangOfText } from '../shared/textLangDetect';
import { recognizeOcrPage } from './ocr';

export interface SnipBasicRead {
  text: string;
  /** Character-weighted mean line confidence 0–1. */
  confidence?: number;
  /** The language the text is in. */
  lang: StudyLang;
  /** Which data read it. */
  model: 'jpn' | SnipTessModel;
}

/** Same bundled engine files as `renderer/ocr.ts`; only the language data differs. */
const TESS_BASE = '/tesseract';
/** The whole basic read, every model and pass together. */
export const SNIP_BASIC_BUDGET_MS = 25_000;

const chineseWorkers = new Map<string, Promise<Worker>>();

function chineseWorker(model: SnipTessModel, langPath: string): Promise<Worker> {
  const key = `${model}|${langPath}`;
  let worker = chineseWorkers.get(key);
  if (!worker) {
    worker = createWorker(model, 1, {
      workerPath: `${TESS_BASE}/worker.min.js`,
      corePath: `${TESS_BASE}/core/tesseract-core-simd-lstm.wasm.js`,
      // The installed tessdata_fast file, not gzipped; served by main's localfile: protocol.
      langPath,
      gzip: false,
      cacheMethod: 'none',
    });
    chineseWorkers.set(key, worker);
    worker.catch(() => chineseWorkers.delete(key));
  }
  return worker;
}

async function decode(dataUrl: string): Promise<ImageData> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas unavailable');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function encode(image: { rgba: Uint8ClampedArray; width: number; height: number }): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  const data = ctx.createImageData(image.width, image.height);
  data.data.set(image.rgba);
  ctx.putImageData(data, 0, 0);
  return canvas.toDataURL('image/png');
}

/** The models to try, the learner's likely language first. */
export function basicModelsFor(
  langs: readonly StudyLang[],
  installed: Partial<Record<SnipTessModel, string>>,
): Array<'jpn' | SnipTessModel> {
  const chinese = (['chi_sim', 'chi_tra'] as const).filter((m) => installed[m]);
  const order: Array<'jpn' | SnipTessModel> = langs[0] === 'zh' ? [...chinese, 'jpn'] : ['jpn', ...chinese];
  // Japanese data reads any snip a little (it is always there); Chinese data only when Chinese is a candidate.
  return order.filter((m) => m === 'jpn' || langs.includes('zh'));
}

/** What reads the pixels: the bundled Japanese worker and the downloaded Chinese ones (a seam for tests). */
export interface SnipBasicDeps {
  decode: (dataUrl: string) => Promise<{ data: ArrayLike<number>; width: number; height: number }>;
  recognize: (model: 'jpn' | SnipTessModel, langPath: string | undefined) => BasicRecognizer;
  now: () => number;
}

const realDeps: SnipBasicDeps = {
  decode,
  recognize: (model, langPath) => async (prepared, layout) => {
    if (model === 'jpn') return recognizeOcrPage(encode(prepared), layout);
    const worker = await chineseWorker(model, langPath as string);
    const { data } = await worker.recognize(encode(prepared), {}, { blocks: true, text: true });
    return data as unknown as TesseractPageLike;
  },
  now: () => Date.now(),
};

/** Read a snip with every installed Tesseract model and keep the best read. */
export async function readSnipBasic(
  basic: NonNullable<SnipJob['basicOcr']>,
  active: StudyLang,
  deps: SnipBasicDeps = realDeps,
): Promise<SnipBasicRead> {
  const pixels = await deps.decode(basic.dataUrl);
  const langs = basic.langs?.length ? basic.langs : [active];
  const models = basicModelsFor(langs, basic.models ?? {});
  const started = deps.now();
  const reads: SnipBasicRead[] = [];
  let lastError: unknown = null;
  for (const model of models) {
    const left = SNIP_BASIC_BUDGET_MS - (deps.now() - started);
    if (left <= 0 && reads.length) break;
    const recognize = deps.recognize(model, basic.models?.[model as SnipTessModel]);
    try {
      const read = await readWithBasicEngine({ data: pixels.data, width: pixels.width, height: pixels.height }, recognize, {
        stylised: true,
        budgetMs: Math.max(2000, left),
        now: deps.now,
      });
      const chars = read.lines.reduce((sum, line) => sum + line.text.length, 0);
      const confidence = chars ? read.lines.reduce((sum, line) => sum + line.confidence * line.text.length, 0) / chars : undefined;
      const lang = detectStudyLangOfText(read.text, active, langs).lang;
      reads.push({ text: read.text, lang, model, ...(confidence !== undefined ? { confidence } : {}) });
    } catch (err) {
      lastError = err;
      console.warn(`[snipToCards] offline OCR (${model}) failed`, err);
    }
  }
  const best = pickSnipRead(reads) ?? reads[0];
  if (!best) throw lastError ?? new Error('offline OCR read nothing');
  return best;
}

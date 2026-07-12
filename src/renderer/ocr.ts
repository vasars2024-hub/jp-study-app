// Thin wrapper around tesseract.js for reading Japanese off a manga page.
// One worker is kept alive per language so repeat scans are fast; the first
// scan downloads the engine + language data (a few MB) from the CDN.
import { createWorker, type Worker } from 'tesseract.js';

/** 'jpn' = horizontal text, 'jpn_vert' = vertical (most manga speech bubbles). */
export type OcrLang = 'jpn' | 'jpn_vert';

const workers = new Map<OcrLang, Promise<Worker>>();

// The worker's logger is global, so we route progress through one mutable slot.
// OCR runs are sequential (the user clicks "Scan"), so a single slot is enough.
let activeProgress: ((p: number) => void) | null = null;

// Serve the engine, the WASM core, and the Japanese language data from our own
// bundled /public/tesseract folder instead of the jsDelivr CDN. tesseract.js
// defaults every one of these to a network download, which fails whenever the
// machine is offline or the CDN is blocked — so OCR appeared "broken". Pointing
// it at local, same-origin files makes a scan work without any internet.
const TESS_BASE = '/tesseract';

function getWorker(lang: OcrLang): Promise<Worker> {
  let w = workers.get(lang);
  if (!w) {
    w = createWorker(lang, 1, {
      // A path ending in ".js" is used verbatim (no SIMD/relaxed auto-pick); the
      // core file is self-contained (the WASM is embedded as base64 inside it).
      workerPath: `${TESS_BASE}/worker.min.js`,
      corePath: `${TESS_BASE}/core/tesseract-core-simd-lstm.wasm.js`,
      // tesseract fetches `${langPath}/<lang>.traineddata.gz` from here.
      langPath: `${TESS_BASE}/lang`,
      logger: (m: { status: string; progress: number }) => {
        if (m.status === 'recognizing text' && activeProgress) activeProgress(m.progress);
      },
    });
    workers.set(lang, w);
  }
  return w;
}

/** Tesseract sprinkles spaces between CJK glyphs; strip them for readability. */
function cleanJapanese(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t　]+/g, ''))
    .filter((line) => line.length > 0)
    .join('\n');
}

/** Recognize Japanese text in a base64 image data URL. Returns cleaned text. */
export async function runOcr(
  dataUrl: string,
  lang: OcrLang,
  onProgress?: (p: number) => void,
): Promise<string> {
  activeProgress = onProgress ?? null;
  try {
    const worker = await getWorker(lang);
    const { data } = await worker.recognize(dataUrl);
    return cleanJapanese(data.text);
  } finally {
    activeProgress = null;
  }
}

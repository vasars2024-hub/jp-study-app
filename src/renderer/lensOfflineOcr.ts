/**
 * The Reading Lens's bundled offline read, browser half.
 *
 * Main hands the Lens a lossless crop when the downloaded engine is missing
 * (`LensOcrResult.fallbackImage`); this decodes it onto a canvas, runs the
 * shared policy (`shared/lensBasicOcr.ts` — the exact code the benchmark
 * measures) with the app's bundled Tesseract worker as the recognizer, and maps
 * the lines back to region-relative DIP for hotspot placement.
 */
import type { LensFallbackImage } from '../main/screenOcr';
import {
  basicLinesToDip,
  readWithBasicEngine,
  type BasicOcrRead,
  type BasicRecognizer,
} from '../shared/lensBasicOcr';
import { recognizeOcrPage } from './ocr';

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

export async function readLensFallbackImage(
  image: LensFallbackImage,
  opts: { signal?: AbortSignal; onProgress?: (fraction: number) => void } = {},
): Promise<BasicOcrRead> {
  const pixels = await decode(image.dataUrl);
  // Up to three recognizer passes; progress is reported across all of them.
  let pass = 0;
  const recognize: BasicRecognizer = (prepared, model) => {
    const base = pass;
    pass += 1;
    return recognizeOcrPage(encode(prepared), model, (p) => opts.onProgress?.(Math.min(1, (base + p) / Math.max(1, pass))));
  };
  const read = await readWithBasicEngine({ data: pixels.data, width: pixels.width, height: pixels.height }, recognize, {
    signal: opts.signal,
  });
  return { ...read, lines: basicLinesToDip(read.lines, image.dipPerPixelX, image.dipPerPixelY) };
}

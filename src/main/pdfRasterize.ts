/**
 * Turn a scanned PDF into page images the OCR pipeline can read.
 *
 * The motivating file has 165 pages, zero fonts and zero ToUnicode entries —
 * every page is a CCITT-encoded scan, so there is no text to extract and the
 * only route to a readable book is rasterize-then-OCR.
 *
 * pdf.js needs a canvas, which Node does not have and which the `canvas` native
 * module would drag in as a build dependency. Electron already ships a renderer
 * that has one, so rasterizing happens in a hidden window: it loads pdf.js from
 * the app's own bundle, draws each page, and hands the image back over IPC. No
 * new dependency, and the same pdf.js version the reader already uses.
 */

import { BrowserWindow, ipcMain } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const requireFrom = createRequire(import.meta.url);

/**
 * Absolute file:// URLs for pdf.js and its worker.
 *
 * pdfjs-dist is ESM-only and ships no CommonJS build, so the hidden window
 * cannot `require` it — and a bare specifier like 'pdfjs-dist' does not resolve
 * inside a page at all. Resolving here and passing absolute URLs across is what
 * makes the dynamic import work.
 */
function pdfjsUrls(): { module: string; worker: string } {
  return {
    module: pathToFileURL(requireFrom.resolve('pdfjs-dist/build/pdf.mjs')).href,
    worker: pathToFileURL(requireFrom.resolve('pdfjs-dist/build/pdf.worker.min.mjs')).href,
  };
}

/** Rendering wider than this wastes OCR time; narrower loses small kana. */
const TARGET_WIDTH = 1600;
/**
 * Pages are written as JPEG, not PNG.
 *
 * A 1600px-wide page of a bilevel scan is ~5 MB as PNG — 825 MB for the
 * 165-page sample, before OCR has even run. The same page is ~200 KB as
 * quality-0.85 JPEG, and the recognizers cannot tell the difference: they
 * downsample to 960px for detection and 48px line height for recognition, both
 * far below where JPEG artefacts start to matter.
 */
const JPEG_QUALITY = 0.85;

export interface RasterizeProgress {
  done: number;
  total: number;
}

/**
 * Render every page of `pdfPath` into `outDir` as `0001.jpg`, `0002.jpg`, …
 *
 * Returns the file names written, in reading order — the same shape
 * library.ts's archive extractor produces, so downstream code cannot tell the
 * two apart.
 */
export async function rasterizePdf(
  pdfPath: string,
  outDir: string,
  onProgress?: (p: RasterizeProgress) => void,
): Promise<string[]> {
  if (!fs.existsSync(pdfPath)) throw new Error('pdf-not-found');
  fs.mkdirSync(outDir, { recursive: true });

  // Deliberately NOT `offscreen: true`. Offscreen rendering drives a separate
  // paint path whose teardown crashed the process a beat after destroy() —
  // asynchronously, so it looked like OCR was at fault. Pages are read back with
  // canvas.toDataURL rather than by capturing the window, so nothing here needs
  // offscreen mode at all.
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      // Needed so the hidden page can read the PDF off disk.
      webSecurity: false,
    },
  });

  const channel = `pdf-raster-${Date.now()}`;
  const names: string[] = [];

  try {
    const done = new Promise<void>((resolve, reject) => {
      ipcMain.on(channel, (_e, msg: { type: string; index?: number; total?: number; data?: string; error?: string }) => {
        if (msg.type === 'page' && typeof msg.index === 'number' && msg.data) {
          const name = `${String(msg.index + 1).padStart(4, '0')}.jpg`;
          fs.writeFileSync(
            path.join(outDir, name),
            Buffer.from(msg.data.replace(/^data:image\/\w+;base64,/, ''), 'base64'),
          );
          names.push(name);
          onProgress?.({ done: names.length, total: msg.total ?? 0 });
        } else if (msg.type === 'done') {
          resolve();
        } else if (msg.type === 'error') {
          reject(new Error(msg.error ?? 'rasterize-failed'));
        }
      });
    });

    await win.loadURL('data:text/html,<!doctype html><meta charset="utf-8"><body></body>');
    await win.webContents.executeJavaScript(
      rasterScript(pdfPath, channel, TARGET_WIDTH, pdfjsUrls()),
    );
    await done;
    // Written out of order is impossible here (pages are emitted sequentially),
    // but sort anyway so the contract is "reading order" regardless.
    names.sort();
    return names;
  } finally {
    ipcMain.removeAllListeners(channel);
    if (!win.isDestroyed()) {
      win.destroy();
      // Let the renderer process actually go away before the caller starts
      // allocating for OCR; destroy() only begins the teardown.
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/**
 * The script run inside the hidden window.
 *
 * Built as a string because it executes in the renderer's context, where
 * `require` resolves against the app bundle and pdf.js's worker is available.
 */
function rasterScript(
  pdfPath: string,
  channel: string,
  targetWidth: number,
  urls: { module: string; worker: string },
): string {
  return `(async () => {
  const { ipcRenderer } = require('electron');
  const fs = require('node:fs');
  try {
    const pdfjs = await import(${JSON.stringify(urls.module)});
    pdfjs.GlobalWorkerOptions.workerSrc = ${JSON.stringify(urls.worker)};
    const data = new Uint8Array(fs.readFileSync(${JSON.stringify(pdfPath)}));
    const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
    // One canvas reused for every page: allocating a few hundred large canvases
    // leaves that much GPU-backed memory for the compositor to reclaim.
    const canvas = document.createElement('canvas');
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: ${targetWidth} / base.width });
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d');
      // Scans are bilevel; a white ground avoids transparent pixels reading as ink.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      ipcRenderer.send(${JSON.stringify(channel)}, {
        type: 'page', index: i - 1, total: doc.numPages,
        data: canvas.toDataURL('image/jpeg', ${JPEG_QUALITY}),
      });
      page.cleanup();
    }
    // Shut pdf.js down before the window goes away: destroy() terminates the
    // worker, and tearing the window down with the worker still live crashed the
    // process a beat later — asynchronously, so it looked like OCR had failed.
    canvas.width = 0;
    canvas.height = 0;
    await doc.destroy();
    ipcRenderer.send(${JSON.stringify(channel)}, { type: 'done' });
  } catch (err) {
    ipcRenderer.send(${JSON.stringify(channel)}, { type: 'error', error: String(err && err.message || err) });
  }
})();`;
}

/**
 * Turn a scanned PDF into page images the OCR pipeline can read.
 *
 * The motivating file has 165 pages, zero fonts and zero ToUnicode entries —
 * every page is a CCITT-encoded scan, so there is no text to extract and the
 * only route to a readable book is rasterize-then-OCR.
 *
 * pdf.js needs a canvas, which Node does not have and which the `canvas` native
 * module would drag in as a build dependency. Electron already ships a renderer
 * that has one, so rasterizing happens in a hidden, sandboxed window: it loads
 * pdf.js from the app's own bundle, draws each page, and hands the image back
 * as the return value of executeJavaScript. No new dependency, and the same
 * pdf.js version the reader already uses.
 */

import { BrowserWindow, session, type Session } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { createRequire } from 'node:module';

const requireFrom = createRequire(import.meta.url);

/**
 * Security (audit robust #4): this window parses UNTRUSTED PDFs. It used to run
 * with nodeIntegration on, contextIsolation off and webSecurity off, so a pdf.js
 * bug would have meant full Node access. It is now an ordinary sandboxed page:
 * no Node, isolation on, web security on, in a private in-memory session with
 * exactly one protocol and no permissions. pdf.js, its worker and the one PDF
 * being rasterized are served by that protocol; pages come back as the return
 * value of `executeJavaScript`, so there is no IPC channel at all (the old
 * unauthenticated pdf-raster IPC listener the old window used is gone).
 */
export const PDF_RASTER_SCHEME = 'gumpdf';
/** Registered with the other privileged schemes in main.ts, before app ready. */
export const PDF_RASTER_SCHEME_PRIVILEGES = {
  scheme: PDF_RASTER_SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
};
const PARTITION = 'gum-pdf-raster';
const ORIGIN = `${PDF_RASTER_SCHEME}://raster`;

/** The PDFs currently being rasterized, addressed by a one-time token. */
const activePdfs = new Map<string, string>();
let rasterSession: Session | null = null;

function staticAsset(pathname: string): { file: string; type: string } | null {
  if (pathname === '/pdf.mjs') return { file: requireFrom.resolve('pdfjs-dist/build/pdf.mjs'), type: 'text/javascript' };
  if (pathname === '/pdf.worker.min.mjs') {
    return { file: requireFrom.resolve('pdfjs-dist/build/pdf.worker.min.mjs'), type: 'text/javascript' };
  }
  return null;
}

/** Request URL -> what to serve. Only these paths exist. Exported for the test. */
export function resolvePdfRasterRequest(
  url: string,
): { kind: 'page' } | { kind: 'file'; file: string; type: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (`${u.protocol}//${u.host}` !== ORIGIN) return null;
  if (u.pathname === '/index.html') return { kind: 'page' };
  const asset = staticAsset(u.pathname);
  if (asset) return { kind: 'file', ...asset };
  const m = /^\/doc\/([a-f0-9]{32})\.pdf$/.exec(u.pathname);
  const pdf = m ? activePdfs.get(m[1]) : undefined;
  return pdf ? { kind: 'file', file: pdf, type: 'application/pdf' } : null;
}

/** Test hook: register a PDF under a token without opening a window. */
export function registerPdfForRasterTest(token: string, file: string | null): void {
  if (file) activePdfs.set(token, file);
  else activePdfs.delete(token);
}

function rasterSessionOnce(): Session {
  if (rasterSession) return rasterSession;
  const ses = session.fromPartition(PARTITION);
  ses.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  ses.setPermissionCheckHandler(() => false);
  ses.protocol.handle(PDF_RASTER_SCHEME, (request) => {
    const hit = resolvePdfRasterRequest(request.url);
    if (!hit) return new Response('not found', { status: 404 });
    if (hit.kind === 'page') {
      return new Response('<!doctype html><meta charset="utf-8"><body></body>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    }
    return new Response(fs.readFileSync(hit.file), { headers: { 'content-type': hit.type } });
  });
  rasterSession = ses;
  return ses;
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
      session: rasterSessionOnce(),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false,
    },
  });
  // Nothing in here may open windows or navigate anywhere.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  const token = crypto.randomBytes(16).toString('hex');
  activePdfs.set(token, pdfPath);
  const names: string[] = [];

  try {
    await win.loadURL(`${ORIGIN}/index.html`);
    const total = Number(await win.webContents.executeJavaScript(openScript(`${ORIGIN}/doc/${token}.pdf`)));
    if (!Number.isFinite(total) || total <= 0) throw new Error('rasterize-failed: no pages');
    for (let i = 0; i < total; i++) {
      const dataUrl = String(await win.webContents.executeJavaScript(pageScript(i + 1, TARGET_WIDTH)));
      if (!dataUrl.startsWith('data:image/')) throw new Error('rasterize-failed: bad page image');
      const name = `${String(i + 1).padStart(4, '0')}.jpg`;
      fs.writeFileSync(path.join(outDir, name), Buffer.from(dataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
      names.push(name);
      onProgress?.({ done: names.length, total });
    }
    // Shut pdf.js down before the window goes away: destroy() terminates the
    // worker, and tearing the window down with the worker still live crashed the
    // process a beat later — asynchronously, so it looked like OCR had failed.
    await win.webContents.executeJavaScript(closeScript());
    names.sort();
    return names;
  } finally {
    activePdfs.delete(token);
    if (!win.isDestroyed()) {
      win.destroy();
      // Let the renderer process actually go away before the caller starts
      // allocating for OCR; destroy() only begins the teardown.
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/**
 * Scripts run inside the sandboxed window (main world, no Node). Each returns a
 * value to `executeJavaScript`; that return value is the only channel out.
 */
function openScript(pdfUrl: string): string {
  return `(async () => {
  const pdfjs = await import(${JSON.stringify(`${ORIGIN}/pdf.mjs`)});
  pdfjs.GlobalWorkerOptions.workerSrc = ${JSON.stringify(`${ORIGIN}/pdf.worker.min.mjs`)};
  const data = new Uint8Array(await (await fetch(${JSON.stringify(pdfUrl)})).arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  // One canvas reused for every page: allocating a few hundred large canvases
  // leaves that much GPU-backed memory for the compositor to reclaim.
  window.__gumRaster = { doc, canvas: document.createElement('canvas') };
  return doc.numPages;
})()`;
}

function pageScript(pageNumber: number, targetWidth: number): string {
  return `(async () => {
  const { doc, canvas } = window.__gumRaster;
  const page = await doc.getPage(${pageNumber});
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: ${targetWidth} / base.width });
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext('2d');
  // Scans are bilevel; a white ground avoids transparent pixels reading as ink.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const out = canvas.toDataURL('image/jpeg', ${JPEG_QUALITY});
  page.cleanup();
  return out;
})()`;
}

function closeScript(): string {
  return `(async () => {
  const r = window.__gumRaster;
  if (!r) return true;
  r.canvas.width = 0;
  r.canvas.height = 0;
  await r.doc.destroy();
  window.__gumRaster = null;
  return true;
})()`;
}

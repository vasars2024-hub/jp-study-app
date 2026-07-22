/**
 * Bulk OCR a book of page images into a readable EPUB.
 *
 * The motivating inputs are a 165-page scanned PDF with no text layer at all
 * (zero fonts, zero ToUnicode) and a 288-image novel archive. Both land in the
 * library as page images, so this job is written against "a folder of pages"
 * and does not care which one it came from.
 *
 * Long-running by nature — heavy mode on a few hundred pages is minutes — so it
 * reports progress per page, supports cancellation, and never blocks the caller.
 */

import { BrowserWindow, ipcMain, nativeImage } from 'electron';
import { ocrAuto } from './ocrAuto';
import { buildBookEpub } from './bookEpub';
import { attachGeneratedEpub, getLibraryItem, itemDir, listItemPagePaths } from './library';
import { rasterizePdf } from './pdfRasterize';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { translateForBook } from './translate';
import { pageConfidence, type BookLine, type BookPage } from '../shared/bookOcr';
import {
  estimateEtaMs,
  type BookOcrPhase,
  type BookOcrProgress,
  type BookOcrRequest,
  type BookOcrResult,
} from '../shared/bookOcrIpc';

/** Item ids whose job has been asked to stop. */
const cancelled = new Set<string>();
/** Item ids with a job in flight, so a double-click cannot start two. */
const running = new Set<string>();

function broadcast(p: BookOcrProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('bookOcr:progress', p);
  }
}

export function cancelBookOcr(itemId: string): void {
  if (running.has(itemId)) cancelled.add(itemId);
}

export function bookOcrRunning(itemId: string): boolean {
  return running.has(itemId);
}

/**
 * Read one page image.
 *
 * Pages are handed to the OCR engines as data URLs, which is what both already
 * take; the intermediate NativeImage also normalises the assorted formats an
 * archive can contain (png/jpg/webp/bmp) into one decoder path.
 */
function pageDataUrl(file: string): string | null {
  const img = nativeImage.createFromPath(file);
  if (img.isEmpty()) return null;
  return img.toDataURL();
}

export async function runBookOcr(req: BookOcrRequest): Promise<BookOcrResult> {
  const { itemId } = req;
  if (running.has(itemId)) return { ok: false, error: 'already-running' };

  const item = getLibraryItem(itemId);
  if (!item) return { ok: false, error: 'item-not-found' };

  running.add(itemId);
  cancelled.delete(itemId);

  // Declared out here so the catch block can still report a total.
  let files: string[] = [];

  const emit = (phase: BookOcrPhase, done: number, total: number, conf: number, extra: Partial<BookOcrProgress> = {}): void =>
    broadcast({ itemId, phase, done, total, confidence: conf, ...extra });

  try {
    emit('preparing', 0, 0, 0);

    // A PDF import keeps only the original file, so its pages have to be made
    // before anything can read them. Archives and folders already arrive as
    // page images, and are left alone.
    files = listItemPagePaths(itemId);
    if (!files.length) {
      const pdf = path.join(itemDir(itemId), 'original.pdf');
      if (!fs.existsSync(pdf)) return { ok: false, error: 'no-pages' };
      await rasterizePdf(pdf, path.join(itemDir(itemId), 'pages'), (p) =>
        emit('rasterizing', p.done, p.total, 0),
      );
      files = listItemPagePaths(itemId);
      if (!files.length) return { ok: false, error: 'rasterize-produced-no-pages' };
    }

    const pages: BookPage[] = [];
    const startedAt = Date.now();

    for (let i = 0; i < files.length; i++) {
      if (cancelled.has(itemId)) {
        emit('cancelled', i, files.length, pages.length ? bookConfidence(pages) : 0);
        return { ok: false, error: 'cancelled' };
      }

      const dataUrl = pageDataUrl(files[i]);
      let lines: BookLine[] = [];
      if (dataUrl) {
        try {
          const result = await ocrAuto(dataUrl, {
            engine: 'auto',
            langHint: 'ja',
            forceLang: 'ja',
            quality: req.quality ?? 'heavy',
          });
          lines = result.lines.map((l) => ({ text: l.text, confidence: l.confidence }));
        } catch {
          // A page the engines cannot read becomes an empty page rather than
          // failing the whole book — 200 good pages beat none.
        }
      }
      pages.push({ number: i + 1, lines });

      emit('recognizing', i + 1, files.length, bookConfidence(pages), {
        etaMs: estimateEtaMs(i + 1, files.length, Date.now() - startedAt),
      });
    }

    if (req.bilingual) {
      const translateStart = Date.now();
      for (let i = 0; i < pages.length; i++) {
        if (cancelled.has(itemId)) {
          emit('cancelled', i, pages.length, bookConfidence(pages));
          return { ok: false, error: 'cancelled' };
        }
        const source = pages[i].lines.map((l) => l.text).join('');
        if (source.trim()) {
          try {
            pages[i].translation = await translateForBook(source, 'ja', req.targetLang ?? 'en');
          } catch {
            // Leave the page untranslated; the column simply renders empty.
          }
        }
        emit('translating', i + 1, pages.length, bookConfidence(pages), {
          etaMs: estimateEtaMs(i + 1, pages.length, Date.now() - translateStart),
        });
      }
    }

    emit('packaging', files.length, files.length, bookConfidence(pages));
    const epub = buildBookEpub(pages, {
      title: item.title,
      bilingual: req.bilingual,
      pageMarkers: req.pageMarkers ?? true,
    });
    attachGeneratedEpub(itemId, epub, {
      fileName: req.bilingual ? 'ocr-bilingual.epub' : 'ocr.epub',
    });

    const confidence = bookConfidence(pages);
    emit('done', files.length, files.length, confidence);
    return { ok: true, itemId, pages: pages.length, confidence };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emit('error', 0, files.length, 0, { error: message });
    return { ok: false, error: message };
  } finally {
    running.delete(itemId);
    cancelled.delete(itemId);
  }
}

/** Mean confidence across every page read so far, weighted by text length. */
function bookConfidence(pages: readonly BookPage[]): number {
  return pageConfidence(pages.flatMap((p) => p.lines));
}

export function registerBookOcrIpc(): void {
  ipcMain.handle('bookOcr:run', (_e, req: BookOcrRequest) => runBookOcr(req));
  ipcMain.handle('bookOcr:cancel', (_e, itemId: string) => {
    cancelBookOcr(itemId);
    return { ok: true };
  });
  ipcMain.handle('bookOcr:status', (_e, itemId: string) => ({ running: bookOcrRunning(itemId) }));
}

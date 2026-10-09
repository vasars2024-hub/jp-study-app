/**
 * The Files app's preview pane, main half: read just enough of one indexed
 * file to show it.
 *
 * The item is resolved by id from the index, never from a renderer path — the
 * same rule Reveal and Delete follow — and every reader is one this app
 * already has: the subtitle/transcript parser behind one-click mine, the
 * `localfile://` image URL the wallpaper and covers use, and the sandboxed
 * pdf.js rasterizer the OCR import uses, stopped after page one.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { FilesItem } from '../../shared/filesApp/catalog';
import {
  clipPreviewText,
  findDuplicateGroups,
  findDuplicateGroupsAsync,
  previewPlanFor,
  type FilesDuplicateGroup,
  type FilesPreview,
} from '../../shared/filesApp/preview';
import { readFilesMineSource } from './mineSource';

/** Bytes read for a plain-text preview; the pane shows a few thousand characters. */
const TEXT_PREVIEW_BYTES = 64 * 1024;
/** Bytes sampled at each end of a file for the duplicate digest. */
const HASH_SAMPLE_BYTES = 64 * 1024;

export interface FilesPreviewDeps {
  localFileUrl: (absPath: string) => string;
  /** Render page one of a PDF to an image file; returns its path. */
  renderPdfFirstPage?: (pdfPath: string, outDir: string) => Promise<string | null>;
  tempDir?: () => string;
}

function none(reasonKey: string): FilesPreview {
  return { kind: 'none', reasonKey };
}

function readHead(filePath: string, bytes: number): string {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const read = fs.readSync(fd, buffer, 0, bytes, 0);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

export async function previewFilesItem(
  item: Pick<FilesItem, 'kind' | 'location'> | null,
  deps: FilesPreviewDeps,
): Promise<FilesPreview> {
  if (!item) return none('filesApp.preview.none.missing');
  if (item.location.store !== 'file') return none('filesApp.preview.none.notFile');
  const filePath = item.location.path;
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return none('filesApp.preview.none.missing');
  }
  if (!stat.isFile()) return none('filesApp.preview.none.unsupported');
  const plan = previewPlanFor({ kind: item.kind, path: filePath });
  try {
    switch (plan) {
      case 'image':
        return { kind: 'image', url: deps.localFileUrl(filePath) };
      case 'text':
        return { kind: 'text', ...clipPreviewText(readHead(filePath, TEXT_PREVIEW_BYTES)) };
      case 'subtitle':
      case 'transcript': {
        const result = readFilesMineSource(filePath, plan);
        if (!result.ok) return none(result.reasonKey);
        return { kind: 'text', ...clipPreviewText(result.passages.map((p) => p.text).join('\n')) };
      }
      case 'pdf': {
        if (!deps.renderPdfFirstPage) return none('filesApp.preview.none.unsupported');
        const key = crypto
          .createHash('sha1')
          .update(`${filePath}|${stat.size}|${stat.mtimeMs}`)
          .digest('hex')
          .slice(0, 16);
        const outDir = path.join(deps.tempDir?.() ?? os.tmpdir(), 'gum-files-preview', key);
        const cached = path.join(outDir, '0001.jpg');
        const image = fs.existsSync(cached) ? cached : await deps.renderPdfFirstPage(filePath, outDir);
        return image ? { kind: 'image', url: deps.localFileUrl(image) } : none('filesApp.preview.none.failed');
      }
      default:
        return none('filesApp.preview.none.unsupported');
    }
  } catch {
    return none('filesApp.preview.none.failed');
  }
}

/**
 * A sampled content digest: size, the first and the last 64 KB. Two different
 * files of the same size that also agree at both ends are vanishingly rare in
 * a media and book library, and reading whole multi-gigabyte videos to be sure
 * would hold the main process for minutes.
 */
export function sampledFileDigest(filePath: string, sizeBytes: number): string | null {
  try {
    const fd = fs.openSync(filePath, 'r');
    try {
      const hash = crypto.createHash('sha1');
      hash.update(String(sizeBytes));
      const head = Buffer.alloc(Math.min(HASH_SAMPLE_BYTES, sizeBytes));
      fs.readSync(fd, head, 0, head.length, 0);
      hash.update(head);
      if (sizeBytes > HASH_SAMPLE_BYTES) {
        const tail = Buffer.alloc(Math.min(HASH_SAMPLE_BYTES, sizeBytes - HASH_SAMPLE_BYTES));
        fs.readSync(fd, tail, 0, tail.length, sizeBytes - tail.length);
        hash.update(tail);
      }
      return hash.digest('hex');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function findIndexDuplicates(items: readonly FilesItem[]): FilesDuplicateGroup[] {
  return findDuplicateGroups(items, sampledFileDigest);
}

/** files2: `sampledFileDigest` on `fs.promises`, so the reads never block the main process. */
export async function sampledFileDigestAsync(filePath: string, sizeBytes: number): Promise<string | null> {
  let handle: fs.promises.FileHandle | null = null;
  try {
    handle = await fs.promises.open(filePath, 'r');
    const hash = crypto.createHash('sha1');
    hash.update(String(sizeBytes));
    const head = Buffer.alloc(Math.min(HASH_SAMPLE_BYTES, sizeBytes));
    await handle.read(head, 0, head.length, 0);
    hash.update(head);
    if (sizeBytes > HASH_SAMPLE_BYTES) {
      const tail = Buffer.alloc(Math.min(HASH_SAMPLE_BYTES, sizeBytes - HASH_SAMPLE_BYTES));
      await handle.read(tail, 0, tail.length, sizeBytes - tail.length);
      hash.update(tail);
    }
    return hash.digest('hex');
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => undefined);
  }
}

/** files2: what the Duplicates view asks for — same groups, no main-thread stall. */
export function findIndexDuplicatesAsync(items: readonly FilesItem[]): Promise<FilesDuplicateGroup[]> {
  return findDuplicateGroupsAsync(items, sampledFileDigestAsync);
}

/**
 * Filesystem-aware planning shared by the drop router and the Files ingest
 * worker. This module deliberately has no Electron import: recursive scans and
 * archive sniffing run in a utility process, while the main-process router can
 * still use the same decisions for one-off drops.
 */
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';
import type { DropCandidate, DropTargetId } from '../shared/fileRouting';
import { classifyByExtension, classifyDirectory } from '../shared/fileRouting';
import { ARCHIVE_EXT, BOOK_EXT, IMAGE_EXT, MEDIA_EXT, SUBTITLE_EXT, extOf } from '../shared/mediaKind';

export interface DropPlan {
  path: string;
  name: string;
  isDirectory: boolean;
  sizeBytes: number;
  candidates: DropCandidate[];
  /** Set when content sniffing settled an extension-level ambiguity. */
  sniffed?: boolean;
  /** Directories only: what a scan found inside, for the triage sheet. */
  folderSummary?: FolderSummary;
}

export interface FolderSummary {
  images: number;
  media: number;
  books: number;
  subtitles: number;
  other: number;
  truncated: boolean;
}

/** Scanning stops here; a dropped drive root must not walk the whole disk. */
const FOLDER_SCAN_LIMIT = 2000;
const JSON_SNIFF_BYTES = 256 * 1024;

function exact(target: DropTargetId, reasonKey: string): DropCandidate[] {
  return [{ target, confidence: 'exact', reasonKey }];
}

/**
 * A `.zip` is a Yomitan dictionary or a manga volume. The archive index says
 * which: a Yomitan v3 dictionary carries `index.json` with `format: 3`
 * (`main/dictionary/yomitan.ts:521-530` rejects anything else), and a manga
 * archive is images.
 */
function sniffZip(filePath: string): DropCandidate[] | null {
  try {
    const zip = new AdmZip(filePath);
    const entries = zip.getEntries();
    const indexEntry = entries.find(
      (entry) => entry.entryName === 'index.json' || entry.entryName.endsWith('/index.json'),
    );
    if (indexEntry) {
      try {
        const parsed = JSON.parse(indexEntry.getData().toString('utf8')) as { format?: unknown };
        if (parsed.format === 3) return exact('dictionary-yomitan', 'fileDrop.reason.zipDictConfirmed');
      } catch {
        // A malformed index is not a dictionary marker; retain the ranked fallback.
      }
    }
    const images = entries.filter((entry) => !entry.isDirectory && IMAGE_EXT.has(extOf(entry.entryName))).length;
    const files = entries.filter((entry) => !entry.isDirectory).length;
    return files > 0 && images / files >= 0.6
      ? exact('library-manga', 'fileDrop.reason.zipMangaConfirmed')
      : null;
  } catch {
    return null;
  }
}

/**
 * A `.json` is a settings backup, a frequency dictionary, or a VN library.
 * Distinguished by top-level keys rather than by filename.
 */
function sniffJson(filePath: string): DropCandidate[] | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size > JSON_SNIFF_BYTES) {
      // Too large to parse cheaply. A frequency dictionary is the only one of
      // the three that is routinely megabytes.
      return [
        { target: 'frequency-dict', confidence: 'likely', reasonKey: 'fileDrop.reason.jsonLarge' },
        { target: 'backup', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.jsonBackup' },
      ];
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (Array.isArray(parsed)) return exact('frequency-dict', 'fileDrop.reason.jsonFrequencyConfirmed');
    if (parsed && typeof parsed === 'object') {
      const record = parsed as Record<string, unknown>;
      const keys = new Set(Object.keys(record));
      if (keys.has('schemaVersion') || keys.has('settings') || keys.has('exportedAt')) {
        return exact('backup', 'fileDrop.reason.jsonBackupConfirmed');
      }
      // `novels` and `scenes` are distinctive. A bare `scripts` key is not —
      // every `package.json` has one, and this branch returns a single exact
      // candidate, so a mis-sniff routes silently with nothing to confirm.
      // A VN library lists its scripts; npm maps names to commands, so the
      // array test separates them without losing a genuine VN export.
      if (keys.has('novels') || keys.has('scenes') || Array.isArray(record.scripts)) {
        return exact('vn-script', 'fileDrop.reason.jsonVnConfirmed');
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** How deep an import walks below the dropped folder (shows/Season 1/extras is depth 2). */
export const FOLDER_IMPORT_MAX_DEPTH = 4;

/**
 * Folders a walk never enters: dot-folders, Windows' recycle bin and volume metadata,
 * NAS thumbnail stores and macOS resource forks. Dropping a drive or a NAS share must
 * not import someone's deleted files or a thumbnail cache.
 */
export function isSkippedFolder(name: string): boolean {
  if (name.startsWith('.') || name.startsWith('$')) return true;
  const lower = name.toLowerCase();
  return lower === 'system volume information' || lower === '__macosx' || lower === '@eadir' || lower === 'node_modules';
}

/**
 * Importable files (media, books, archives) inside a dropped folder and its subfolders,
 * sorted. The planner already scanned recursively — a parent folder of shows was
 * classified as media — but the import listed only the files directly inside it, found
 * none (every episode sits in a show's own folder) and refused the drop as empty. Both
 * now walk the same way: bounded depth, the same skip list, the same file cap.
 */
export function listImportableFiles(dirPath: string, maxDepth = FOLDER_IMPORT_MAX_DEPTH): string[] {
  const found: string[] = [];
  const stack: Array<{ dir: string; depth: number }> = [{ dir: dirPath, depth: 0 }];
  while (stack.length && found.length < FOLDER_SCAN_LIMIT) {
    const { dir, depth } = stack.pop() as { dir: string; depth: number };
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !isSkippedFolder(entry.name)) stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      const ext = extOf(entry.name);
      if (MEDIA_EXT.has(ext) || BOOK_EXT.has(ext) || ARCHIVE_EXT.has(ext)) found.push(full);
      if (found.length >= FOLDER_SCAN_LIMIT) break;
    }
  }
  return found.sort();
}

function scanFolder(dirPath: string): FolderSummary {
  const summary: FolderSummary = { images: 0, media: 0, books: 0, subtitles: 0, other: 0, truncated: false };
  let seen = 0;
  const stack: Array<{ dir: string; depth: number }> = [{ dir: dirPath, depth: 0 }];
  while (stack.length) {
    const { dir: current, depth } = stack.pop() as { dir: string; depth: number };
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (seen >= FOLDER_SCAN_LIMIT) {
        summary.truncated = true;
        return summary;
      }
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        // Same bounds as the import (`listImportableFiles`), so the triage sheet counts
        // exactly the files a confirm would bring in.
        if (depth < FOLDER_IMPORT_MAX_DEPTH && !isSkippedFolder(entry.name)) stack.push({ dir: full, depth: depth + 1 });
        continue;
      }
      seen += 1;
      const ext = extOf(entry.name);
      if (IMAGE_EXT.has(ext)) summary.images += 1;
      else if (MEDIA_EXT.has(ext)) summary.media += 1;
      else if (BOOK_EXT.has(ext) || ARCHIVE_EXT.has(ext)) summary.books += 1;
      else if (SUBTITLE_EXT.has(ext)) summary.subtitles += 1;
      else summary.other += 1;
    }
  }
  return summary;
}

/** Re-rank a folder's candidates by what is actually inside it. */
function candidatesForFolder(dirPath: string, summary: FolderSummary): DropCandidate[] {
  const base = classifyDirectory(dirPath);
  const total = summary.images + summary.media + summary.books + summary.subtitles;
  if (total === 0) return base;
  if (summary.media >= summary.images && summary.media >= summary.books) {
    return exact('media', 'fileDrop.reason.folderMedia');
  }
  if (summary.books > summary.images) return exact('library-book', 'fileDrop.reason.folderBooks');
  if (summary.images > 0) {
    // Images-only folder: a manga volume, or a wallpaper slideshow source.
    return [
      { target: 'library-manga', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.folderImages' },
      { target: 'wallpaper', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.folderSlideshow' },
    ];
  }
  return base;
}

/** Build a plan for one path. Never throws; unreadable paths become unknown. */
export function planForPath(filePath: string): DropPlan {
  const name = path.basename(filePath);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return {
      path: filePath,
      name,
      isDirectory: false,
      sizeBytes: 0,
      candidates: exact('unknown', 'fileDrop.reason.unreadable'),
    };
  }
  if (stat.isDirectory()) {
    const folderSummary = scanFolder(filePath);
    return {
      path: filePath,
      name,
      isDirectory: true,
      sizeBytes: 0,
      candidates: candidatesForFolder(filePath, folderSummary),
      folderSummary,
    };
  }
  const ext = extOf(name);
  let candidates = classifyByExtension(filePath);
  let sniffed = false;
  const settled = ext === '.zip' ? sniffZip(filePath) : ext === '.json' ? sniffJson(filePath) : null;
  if (settled) {
    candidates = settled;
    sniffed = true;
  }
  return { path: filePath, name, isDirectory: false, sizeBytes: stat.size, candidates, sniffed: sniffed || undefined };
}

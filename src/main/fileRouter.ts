/**
 * The side-effecting half of the drop router: stat, content sniffing, and the
 * folder scan. `shared/fileRouting.ts` holds the pure classification table.
 *
 * **Where execution lives.** The plan for this feature put `filedrop:execute`
 * here in main. It is not here, and the reason is worth stating: every importer
 * this router dispatches to (`library:importPaths`, `media:addPaths`,
 * `dict:importYomitan`, `apkg:import`, `mining:importFrequencyDict`,
 * `desktop:setWallpaperFromPath`) is an `ipcMain.handle` handler with no
 * exported function behind it. Calling them from main would mean refactoring
 * six modules to split handler from implementation — a much larger and riskier
 * change than the feature needs. So classification (which genuinely requires
 * `fs`) happens here, and dispatch happens in `renderer/components/DropRouter.tsx`
 * through the same `window.api.*` calls the rest of the UI already uses. Undo
 * lives with dispatch, because reversing an import is `library:remove` /
 * `media:remove` — also renderer-side.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ipcMain } from 'electron';
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
  /** Scanning stops here; a dropped drive root must not walk the whole disk. */
  truncated: boolean;
}

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
      (e) => e.entryName === 'index.json' || e.entryName.endsWith('/index.json'),
    );
    if (indexEntry) {
      try {
        const parsed = JSON.parse(indexEntry.getData().toString('utf8')) as { format?: unknown };
        if (parsed.format === 3) {
          return exact('dictionary-yomitan', 'fileDrop.reason.zipDictConfirmed');
        }
      } catch {
        /* malformed index.json — fall through to the image test */
      }
    }

    const images = entries.filter(
      (e) => !e.isDirectory && IMAGE_EXT.has(extOf(e.entryName)),
    ).length;
    const files = entries.filter((e) => !e.isDirectory).length;
    if (files > 0 && images / files >= 0.6) {
      return exact('library-manga', 'fileDrop.reason.zipMangaConfirmed');
    }
    return null;
  } catch {
    // Unreadable or not actually a zip. The extension-level ranking stands.
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

    // A Yomitan-style frequency list is a top-level array of [term, 'freq', n].
    if (Array.isArray(parsed)) {
      return exact('frequency-dict', 'fileDrop.reason.jsonFrequencyConfirmed');
    }

    if (parsed && typeof parsed === 'object') {
      const keys = new Set(Object.keys(parsed as Record<string, unknown>));
      if (keys.has('schemaVersion') || keys.has('settings') || keys.has('exportedAt')) {
        return exact('backup', 'fileDrop.reason.jsonBackupConfirmed');
      }
      // `novels` and `scenes` are distinctive. A bare `scripts` key is not —
      // every `package.json` has one, and this branch returns a single exact
      // candidate, so a mis-sniff routes silently with nothing to confirm.
      // A VN library lists its scripts; npm maps names to commands, so the
      // array test separates them without losing a genuine VN export.
      const record = parsed as Record<string, unknown>;
      if (keys.has('novels') || keys.has('scenes') || Array.isArray(record.scripts)) {
        return exact('vn-script', 'fileDrop.reason.jsonVnConfirmed');
      }
    }
    return null;
  } catch {
    return null;
  }
}

function scanFolder(dirPath: string): FolderSummary {
  const summary: FolderSummary = {
    images: 0,
    media: 0,
    books: 0,
    subtitles: 0,
    other: 0,
    truncated: false,
  };
  let seen = 0;
  const stack: string[] = [dirPath];

  while (stack.length) {
    const current = stack.pop() as string;
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
        stack.push(full);
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
  if (summary.books > summary.images) {
    return exact('library-book', 'fileDrop.reason.folderBooks');
  }
  if (summary.images > 0) {
    // Images-only folder: a manga volume, or a wallpaper slideshow source.
    return [
      { target: 'library-manga', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.folderImages' },
      { target: 'wallpaper', confidence: 'ambiguous', reasonKey: 'fileDrop.reason.folderSlideshow' },
    ];
  }
  return base;
}

/** Build a plan for one dropped path. Never throws; unreadable paths become `unknown`. */
export function planForPath(filePath: string): DropPlan {
  const name = path.basename(filePath);
  let stat: fs.Stats | null = null;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return {
      path: filePath,
      name,
      isDirectory: false,
      sizeBytes: 0,
      candidates: [
        { target: 'unknown', confidence: 'exact', reasonKey: 'fileDrop.reason.unreadable' },
      ],
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

  if (ext === '.zip') {
    const settled = sniffZip(filePath);
    if (settled) {
      candidates = settled;
      sniffed = true;
    }
  } else if (ext === '.json') {
    const settled = sniffJson(filePath);
    if (settled) {
      candidates = settled;
      sniffed = true;
    }
  }

  return {
    path: filePath,
    name,
    isDirectory: false,
    sizeBytes: stat.size,
    candidates,
    sniffed: sniffed || undefined,
  };
}

export function registerFileRouterIpc(): void {
  ipcMain.handle('filedrop:classify', (_e, paths: unknown): DropPlan[] => {
    if (!Array.isArray(paths)) return [];
    return paths
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .slice(0, 200)
      .map(planForPath);
  });

  /** Image files directly inside a folder — the slideshow / manga import list. */
  ipcMain.handle('filedrop:listFolderImages', (_e, dirPath: unknown): string[] => {
    if (typeof dirPath !== 'string') return [];
    try {
      return fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((e) => !e.isDirectory() && IMAGE_EXT.has(extOf(e.name)))
        .map((e) => path.join(dirPath, e.name))
        .sort();
    } catch {
      return [];
    }
  });

  /** Importable files directly inside a folder, for a book/media folder drop. */
  ipcMain.handle('filedrop:listFolderFiles', (_e, dirPath: unknown): string[] => {
    if (typeof dirPath !== 'string') return [];
    try {
      return fs
        .readdirSync(dirPath, { withFileTypes: true })
        .filter((e) => {
          if (e.isDirectory()) return false;
          const ext = extOf(e.name);
          return MEDIA_EXT.has(ext) || BOOK_EXT.has(ext) || ARCHIVE_EXT.has(ext);
        })
        .map((e) => path.join(dirPath, e.name))
        .sort();
    } catch {
      return [];
    }
  });
}

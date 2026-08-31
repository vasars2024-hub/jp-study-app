import fs from 'node:fs';
import path from 'node:path';
import { SUBTITLE_EXT, extOf } from '../../shared/mediaKind';
import { mediaSubtitleRecordsFromStoredDocument } from '../../shared/mediaLibraryEntries';
import {
  subtitleRecordProvenance,
  type StoredSubtitleProvenance,
} from '../../shared/subtitleStorage';
import { YOUTUBE_SUBTITLE_DIRECTORY_LAYOUTS } from '../../shared/youtubeStorage';

export interface FilesTextAsset {
  id: string;
  name: string;
  filePath: string;
  provenance: StoredSubtitleProvenance | 'auto-captions';
  source: 'youtube-cache' | 'media-subtitle-record';
  createdAt: number | null;
}

function listFilesRecursive(root: string): string[] {
  const out: string[] = [];
  const visit = (directory: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  };
  visit(root);
  return out.sort((a, b) => a.localeCompare(b));
}

function isAutoCaptionName(name: string): boolean {
  return /\.a\.[a-z-]+\.[a-z0-9]+$/i.test(name);
}

/** Read both independently-owned YouTube subtitle caches, at every depth. */
export function readYoutubeSubtitleCacheAssets(userDataPath: string): FilesTextAsset[] {
  return YOUTUBE_SUBTITLE_DIRECTORY_LAYOUTS.flatMap(({ directory }) => {
    const root = path.join(userDataPath, directory);
    return listFilesRecursive(root)
      .filter((filePath) => SUBTITLE_EXT.has(extOf(filePath)))
      .map((filePath) => {
        const relativePath = path.relative(root, filePath).replaceAll('\\', '/');
        const name = path.basename(filePath);
        return {
          id: `youtube-subtitle:${directory}:${relativePath}`,
          name,
          filePath,
          provenance: isAutoCaptionName(name) ? 'auto-captions' as const : 'human-subs' as const,
          source: 'youtube-cache' as const,
          createdAt: null,
        };
      });
  });
}

/**
 * Read the subtitle rows from `media.json`, including referenced sidecars.
 * The persisted record is authoritative: scanning only `subtitles/` loses
 * external sidecars and cannot distinguish human tracks from Whisper output.
 */
export function readMediaSubtitleAssets(
  userDataPath: string,
  storedMediaDocument: unknown,
): FilesTextAsset[] {
  return mediaSubtitleRecordsFromStoredDocument(storedMediaDocument).map(
    ({ mediaId, mediaTitle, record }) => ({
      id: `media-subtitle:${mediaId}:${record.id}`,
      name: record.label?.trim() || `${mediaTitle} — ${record.lang || record.id}`,
      filePath: path.isAbsolute(record.path)
        ? record.path
        : path.join(userDataPath, record.path),
      provenance: subtitleRecordProvenance(record),
      source: 'media-subtitle-record' as const,
      createdAt: Number.isFinite(record.addedAt) ? record.addedAt : null,
    }),
  );
}

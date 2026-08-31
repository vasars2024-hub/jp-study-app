/**
 * The Files app — readers for the three places subtitle text is actually
 * persisted. They are separate from `enumerators.ts` because each one is a
 * *store contract* question ("where does this app write subtitles, and in what
 * layout") rather than a catalogue question, and because gate 1's regression
 * test needs to point at them directly.
 *
 * The measured reason all three exist, against the real profile on 2026-08-30:
 * `yt-subs` and `subs-cache` held 0 files, `subtitles/<mediaId>/` held **19**,
 * and `media.json` carried **19 subtitle records — 7 of which point outside
 * `subtitles/` entirely** (sidecars beside the user's own video). A reader that
 * walks only one of those two shapes misses real, live content while returning
 * a plausible number, which is precisely the failure gate 1 retracted for.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SUBTITLE_EXT, extOf } from '../../shared/mediaKind';
import { mediaSubtitleRecordsFromStoredDocument } from '../../shared/mediaLibraryEntries';
import {
  SUBTITLE_LIBRARY_DIRECTORY,
  subtitleRecordProvenance,
  type StoredSubtitleProvenance,
} from '../../shared/subtitleStorage';
import { YOUTUBE_SUBTITLE_DIRECTORY_LAYOUTS } from '../../shared/youtubeStorage';

export interface FilesTextAsset {
  id: string;
  name: string;
  filePath: string;
  provenance: StoredSubtitleProvenance | 'auto-captions' | 'unknown';
  source: 'youtube-cache' | 'media-subtitle-record' | 'subtitle-library-orphan';
  createdAt: number | null;
  /** A file on disk that no persisted record claims. Reported, never hidden. */
  orphan?: boolean;
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

/**
 * yt-dlp's own marker for a machine caption: `<title>.a.<lang>.<ext>`. It is
 * the only signal in a downloaded track that separates YouTube's ASR output
 * from a human-authored one, so every reader that meets a yt-dlp filename must
 * ask the same question in the same place.
 */
export function isAutoCaptionName(name: string): boolean {
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

/** Compare paths the way Windows resolves them, so a record and its file match. */
function pathKey(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

/**
 * Subtitle files under `subtitles/` that no `media.json` record claims.
 *
 * These are real — the fusion pipeline writes `fused-ja.whisper-only.srt` and
 * `fused-ja.mt-only.srt` beside the track it publishes, and only the published
 * one gets a record. Seven such files exist in the live profile today. They are
 * enumerated with `orphan: true` and `unknown` provenance rather than dropped:
 * dropping them makes the count on disk disagree with the count in the app, and
 * guessing their provenance would put a fabricated trust mark on mined text.
 */
export function readSubtitleLibraryOrphanAssets(
  userDataPath: string,
  claimed: Iterable<string>,
): FilesTextAsset[] {
  const claimedKeys = new Set<string>();
  for (const filePath of claimed) claimedKeys.add(pathKey(filePath));
  const root = path.join(userDataPath, SUBTITLE_LIBRARY_DIRECTORY);
  return listFilesRecursive(root)
    .filter((filePath) => SUBTITLE_EXT.has(extOf(filePath)) && !claimedKeys.has(pathKey(filePath)))
    .map((filePath) => ({
      id: `subtitle-orphan:${path.relative(root, filePath).replaceAll('\\', '/')}`,
      name: path.basename(filePath),
      filePath,
      provenance: 'unknown' as const,
      source: 'subtitle-library-orphan' as const,
      createdAt: null,
      orphan: true,
    }));
}

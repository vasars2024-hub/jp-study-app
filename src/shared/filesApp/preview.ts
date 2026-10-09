/**
 * What the Files app's preview pane can show, as data both processes agree on.
 *
 * Deliberately small: images, text (plain text, subtitles, transcripts) and a
 * PDF's first page — the kinds an existing renderer in this app already draws.
 * Anything else answers `none` with a reason, so the pane says why it is empty
 * instead of looking broken.
 */
export type FilesPreview =
  | { kind: 'image'; url: string }
  | { kind: 'text'; text: string; truncated: boolean }
  | { kind: 'none'; reasonKey: string };

/** Characters of text a preview carries — a glance, not a reader. */
export const FILES_PREVIEW_MAX_CHARS = 4_000;

export const FILES_PREVIEW_CHANNEL = 'filesapp:preview';
export const FILES_DUPLICATES_CHANNEL = 'filesapp:duplicates';

export type FilesPreviewPlan = 'image' | 'text' | 'subtitle' | 'transcript' | 'pdf' | null;

const IMAGE = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp']);
const SUBTITLE = new Set(['.srt', '.vtt', '.ass', '.ssa', '.lrc']);
const TEXT = new Set(['.txt', '.md', '.csv', '.tsv', '.log']);

function extOf(filePath: string): string {
  const base = filePath.replaceAll('\\', '/').split('/').pop() ?? '';
  const at = base.lastIndexOf('.');
  return at > 0 ? base.slice(at).toLowerCase() : '';
}

/** Which reader a file-backed row previews through, or `null` for none. */
export function previewPlanFor(item: { kind: string; path: string }): FilesPreviewPlan {
  const ext = extOf(item.path);
  if (item.kind === 'transcript' && ext === '.json') return 'transcript';
  if (IMAGE.has(ext)) return 'image';
  if (SUBTITLE.has(ext)) return 'subtitle';
  if (TEXT.has(ext)) return 'text';
  if (ext === '.pdf') return 'pdf';
  return null;
}

const AUDIO_PREVIEW = new Set(['.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac', '.wav', '.weba']);
const VIDEO_PREVIEW = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.mov']);

/**
 * files2 — audio and video play in the pane itself, through the player's own
 * `playfile://` route (`media:fileUrl`, which serves ranges, so a scrub works).
 * Kept apart from `previewPlanFor` because main never reads these: the
 * renderer asks for the stream URL and lets the media element do the rest.
 */
export function mediaPreviewKind(filePath: string): 'audio' | 'video' | null {
  const ext = extOf(filePath);
  if (AUDIO_PREVIEW.has(ext)) return 'audio';
  if (VIDEO_PREVIEW.has(ext)) return 'video';
  return null;
}

/** Cut to the preview budget on a character boundary, saying whether it cut. */
export function clipPreviewText(text: string, max = FILES_PREVIEW_MAX_CHARS): { text: string; truncated: boolean } {
  const chars = Array.from(text);
  if (chars.length <= max) return { text, truncated: false };
  return { text: chars.slice(0, max).join(''), truncated: true };
}

/* ------------------------------------------------------------------ *
 * Duplicates.
 * ------------------------------------------------------------------ */

export interface FilesDuplicateGroup {
  /** `path`: two rows point at the same file. `content`: two files, same bytes. */
  reason: 'path' | 'content';
  itemIds: string[];
}

export interface FilesDuplicateInput {
  id: string;
  sizeBytes: number | null;
  location: { store: string; path?: string };
}

function pathKey(raw: string): string {
  return raw.trim().replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase();
}

/**
 * Group the index's rows that are the same file twice.
 *
 * Two passes. The same PATH under two sources (a media row and the download
 * it came from) needs no reading at all. The same CONTENT at two paths is
 * found by size first — only equal sizes can be equal files — and only those
 * are hashed, through `hashOf`, which main backs with a sampled digest. A
 * `null` hash (unreadable file) keeps a row out of every content group rather
 * than grouping all unreadable files together.
 */
/**
 * files2 — the same grouping with an ASYNC digest, for main.
 *
 * The sync version hashed up to 2,000 files (128 KB each) in one go on the
 * main process: on a big library that is a quarter of a gigabyte of
 * synchronous reads, during which every window of the app stops answering.
 * Here each digest is awaited (main backs it with `fs.promises`), and the
 * loop yields to the event loop every `yieldEvery` files, so IPC, painting
 * in other windows and the watchers keep running while duplicates are found.
 * The result is identical to `findDuplicateGroups` for the same digests.
 */
export async function findDuplicateGroupsAsync(
  items: readonly FilesDuplicateInput[],
  hashOf: (path: string, sizeBytes: number) => Promise<string | null>,
  options: { maxHashed?: number; yieldEvery?: number; yieldNow?: () => Promise<void> } = {},
): Promise<FilesDuplicateGroup[]> {
  const memo = new Map<string, string | null>();
  // Pass 1: collect every (path, size) the sync algorithm would hash, in its
  // own order and within its own budget, by running it with a recording digest.
  const wanted: Array<{ path: string; size: number }> = [];
  findDuplicateGroups(
    items,
    (path, size) => {
      wanted.push({ path, size });
      return null;
    },
    { maxHashed: options.maxHashed },
  );
  const yieldEvery = Math.max(1, options.yieldEvery ?? 16);
  const yieldNow = options.yieldNow ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (let i = 0; i < wanted.length; i += 1) {
    const { path, size } = wanted[i];
    const key = `${size}|${path}`;
    if (!memo.has(key)) memo.set(key, await hashOf(path, size));
    if ((i + 1) % yieldEvery === 0) await yieldNow();
  }
  // Pass 2: the real grouping, answered from the digests already read.
  return findDuplicateGroups(items, (path, size) => memo.get(`${size}|${path}`) ?? null, {
    maxHashed: options.maxHashed,
  });
}

export function findDuplicateGroups(
  items: readonly FilesDuplicateInput[],
  hashOf: (path: string, sizeBytes: number) => string | null,
  options: { maxHashed?: number } = {},
): FilesDuplicateGroup[] {
  const groups: FilesDuplicateGroup[] = [];
  const byPath = new Map<string, { path: string; ids: string[]; size: number | null }>();
  for (const item of items) {
    if (item.location.store !== 'file' || !item.location.path) continue;
    const key = pathKey(item.location.path);
    if (!key) continue;
    const bucket = byPath.get(key) ?? { path: item.location.path, ids: [], size: item.sizeBytes };
    bucket.ids.push(item.id);
    byPath.set(key, bucket);
  }
  for (const bucket of byPath.values()) {
    if (bucket.ids.length > 1) groups.push({ reason: 'path', itemIds: [...bucket.ids] });
  }

  const bySize = new Map<number, { path: string; ids: string[] }[]>();
  for (const bucket of byPath.values()) {
    if (typeof bucket.size !== 'number' || bucket.size <= 0) continue;
    const list = bySize.get(bucket.size) ?? [];
    list.push({ path: bucket.path, ids: bucket.ids });
    bySize.set(bucket.size, list);
  }
  let budget = options.maxHashed ?? 2_000;
  for (const [size, files] of bySize) {
    if (files.length < 2) continue;
    const byHash = new Map<string, { path: string; ids: string[] }[]>();
    for (const file of files) {
      if (budget <= 0) break;
      budget -= 1;
      const hash = hashOf(file.path, size);
      if (!hash) continue;
      const same = byHash.get(hash) ?? [];
      same.push(file);
      byHash.set(hash, same);
    }
    for (const same of byHash.values()) {
      // Only two PATHS make a content duplicate; one path under two rows is
      // already reported above.
      if (same.length > 1) groups.push({ reason: 'content', itemIds: same.flatMap((f) => f.ids) });
    }
  }
  return groups;
}

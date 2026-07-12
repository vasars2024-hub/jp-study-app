// Pure helpers behind the Music song list: a folder tree built from each
// song's real path (with the common root prefix stripped, so it reads as a
// clean relative tree regardless of where the library actually lives on
// disk), flattened to virtualizable rows, plus a cached search index so
// filtering by title/artist never re-parses metadata on every keystroke.

import type { MediaItem } from '../shared/types';

function splitPath(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean);
}

function commonDirPrefixLen(dirSegLists: string[][]): number {
  if (dirSegLists.length === 0) return 0;
  const first = dirSegLists[0];
  let len = 0;
  for (; len < first.length; len++) {
    const seg = first[len];
    for (const segs of dirSegLists) {
      if (segs[len] !== seg) return len;
    }
  }
  return len;
}

export interface TreeNode {
  name: string;
  /** Full relative folder path (joined with '/'), stable across renders — used as the collapse key. */
  path: string;
  children: Map<string, TreeNode>;
  songs: MediaItem[];
}

/** Build a folder tree from song paths, stripped of their shared root directory. */
export function buildMusicTree(songs: MediaItem[]): TreeNode {
  const dirSegLists = songs.map((s) => splitPath(s.path).slice(0, -1));
  const skip = commonDirPrefixLen(dirSegLists);
  const root: TreeNode = { name: '', path: '', children: new Map(), songs: [] };
  songs.forEach((song, idx) => {
    const dirs = dirSegLists[idx].slice(skip);
    let node = root;
    let acc = '';
    for (const seg of dirs) {
      acc = acc ? `${acc}/${seg}` : seg;
      let child = node.children.get(seg);
      if (!child) {
        child = { name: seg, path: acc, children: new Map(), songs: [] };
        node.children.set(seg, child);
      }
      node = child;
    }
    node.songs.push(song);
  });
  return root;
}

export function countTreeItems(node: TreeNode): number {
  let n = node.songs.length;
  for (const child of node.children.values()) n += countTreeItems(child);
  return n;
}

/** Walk the tree and return every item nested under `folderPath` (inclusive). */
export function collectTreeItems(root: TreeNode, folderPath: string | null): MediaItem[] {
  if (!folderPath) return collectAllTreeItems(root);
  const node = findTreeNode(root, folderPath);
  return node ? collectAllTreeItems(node) : [];
}

function collectAllTreeItems(node: TreeNode): MediaItem[] {
  const out = node.songs.slice();
  for (const child of node.children.values()) out.push(...collectAllTreeItems(child));
  return out;
}

function findTreeNode(node: TreeNode, folderPath: string): TreeNode | null {
  if (node.path === folderPath) return node;
  for (const child of node.children.values()) {
    const hit = findTreeNode(child, folderPath);
    if (hit) return hit;
  }
  return null;
}

export type MusicRow =
  | { kind: 'folder'; key: string; name: string; depth: number; count: number; collapsed: boolean }
  | { kind: 'song'; key: string; song: MediaItem; depth: number };

/**
 * Flatten the tree into the rows the virtual list actually renders.
 * Collapsed folders contribute exactly one row (their header); expanded
 * folders recurse into their subfolders (alphabetical) then their own songs
 * (using `compareSongs`, e.g. by title).
 */
export function flattenMusicTree(
  root: TreeNode,
  collapsed: ReadonlySet<string>,
  compareSongs: (a: MediaItem, b: MediaItem) => number,
): MusicRow[] {
  const out: MusicRow[] = [];
  const visit = (node: TreeNode, depth: number): void => {
    const subfolders = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    for (const child of subfolders) {
      const isCollapsed = collapsed.has(child.path);
      out.push({
        kind: 'folder',
        key: child.path,
        name: child.name,
        depth,
        count: countTreeItems(child),
        collapsed: isCollapsed,
      });
      if (!isCollapsed) visit(child, depth + 1);
    }
    for (const song of node.songs.slice().sort(compareSongs)) {
      out.push({ kind: 'song', key: song.id, song, depth });
    }
  };
  visit(root, 0);
  return out;
}

// ----- cached search ---------------------------------------------------------

interface SearchEntry {
  song: MediaItem;
  haystack: string;
}

/** Build once per song-list change (NOT per keystroke) — the expensive part to cache. */
export function buildSearchIndex(
  songs: MediaItem[],
  metaOf: (s: MediaItem) => { title: string; artist: string },
): SearchEntry[] {
  return songs.map((song) => {
    const meta = metaOf(song);
    return { song, haystack: `${meta.title} ${meta.artist} ${song.fileName}`.toLowerCase() };
  });
}

/** Cheap per-keystroke step: just a substring scan over the pre-lowercased cache. */
export function searchSongs(index: SearchEntry[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.map((e) => e.song);
  return index.filter((e) => e.haystack.includes(q)).map((e) => e.song);
}

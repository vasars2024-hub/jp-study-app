// Folder tree + filename search for the Media panel. Reuses the path-based
// tree builder from the Music app (common root stripped) so auto-add folder
// imports, drag-drop paths, and YouTube downloads group naturally by source dir.

import type { MediaItem } from '../shared/types';
import {
  buildMusicTree,
  collectTreeItems,
  countTreeItems,
  flattenMusicTree,
  type MusicRow,
  type TreeNode,
} from './musicLibrary';

export { buildMusicTree as buildMediaTree, collectTreeItems, countTreeItems, flattenMusicTree, type MusicRow as MediaFolderRow, type TreeNode };

interface FileSearchEntry {
  item: MediaItem;
  haystack: string;
}

/** Build once per library change — not on every keystroke. */
export function buildMediaFileSearchIndex(items: MediaItem[]): FileSearchEntry[] {
  return items.map((item) => ({ item, haystack: item.fileName.toLowerCase() }));
}

/** Filter by file name substring (case-insensitive). */
export function searchMediaByFileName(index: FileSearchEntry[], query: string): MediaItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return index.map((e) => e.item);
  return index.filter((e) => e.haystack.includes(q)).map((e) => e.item);
}

/** Preserve library order while restricting to a set of ids. */
export function filterItemsById(items: MediaItem[], allowed: ReadonlySet<string>): MediaItem[] {
  if (allowed.size === 0) return [];
  return items.filter((it) => allowed.has(it.id));
}

export interface FolderNavRow {
  key: string;
  name: string;
  depth: number;
  count: number;
  collapsed: boolean;
}

/** Sidebar rows — folders only, no individual media cards. */
export function flattenFolderNav(root: TreeNode, collapsed: ReadonlySet<string>): FolderNavRow[] {
  const out: FolderNavRow[] = [];
  const visit = (node: TreeNode, depth: number): void => {
    const subfolders = Array.from(node.children.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
    for (const child of subfolders) {
      const isCollapsed = collapsed.has(child.path);
      out.push({
        key: child.path,
        name: child.name,
        depth,
        count: countTreeItems(child),
        collapsed: isCollapsed,
      });
      if (!isCollapsed) visit(child, depth + 1);
    }
  };
  visit(root, 0);
  return out;
}

// "Collected tools" — sites the user saves from the Immersion browser (and, later,
// a Chrome extension) to surface in the Resources app's "My tools" section, AND
// (Blanc Pillar 3) the backing store for the App Drawer's folders and shortcuts.
// The `source` field future-proofs the extension without a schema change.
//
// Blanc's App Drawer extends this store rather than adding a third parallel one
// (BLANC_REFINEMENT_PLAN.md, Pillar 3) — `kind`/`folderId` are additive and
// default to the tool's only previous shape (a link, unfiled), so every existing
// caller (ResourcesContent's "My tools") keeps working unchanged as long as it
// filters to `kind === 'link'` before rendering — app/file/tool shortcuts are not
// web links and `openLink()`/`openExternal` is not a valid way to launch them.

export type CollectedToolKind = 'link' | 'app' | 'file' | 'tool';

export interface CollectedTool {
  id: string;
  name: string;
  url: string;
  note?: string;
  tags?: string[];
  favicon?: string;
  addedAt: number;
  source: 'app' | 'extension';
  /** Defaults to 'link' for every entry that predates the App Drawer. */
  kind: CollectedToolKind;
  /** App Drawer folder this shortcut lives in, or null for unfiled/root. */
  folderId: string | null;
}

/**
 * An App Drawer folder. `parentFolderId` enforces one level of nesting: a
 * folder whose own `parentFolderId` is non-null may not be the parent of
 * another folder (the sanitizer flattens any deeper attempt onto the root).
 */
export interface CollectedFolder {
  id: string;
  name: string;
  parentFolderId: string | null;
  order: number;
}

export interface CollectedToolsStore {
  version: 1;
  tools: CollectedTool[];
  folders: CollectedFolder[];
}

export interface CollectToolInput {
  url: string;
  name?: string;
  note?: string;
  tags?: string[];
  favicon?: string;
  source?: 'app' | 'extension';
  kind?: CollectedToolKind;
  folderId?: string | null;
}

export interface UpdateToolInput {
  name?: string;
  note?: string;
  tags?: string[];
  folderId?: string | null;
}

export function emptyCollectedToolsStore(): CollectedToolsStore {
  return { version: 1, tools: [], folders: [] };
}

/**
 * Canonical key for de-duplication: lowercase host, no `www.`, no trailing slash,
 * hash dropped, query kept. Returns '' for anything that isn't an http(s) URL.
 */
export function normalizeToolUrl(url: string): string {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    const host = u.host.replace(/^www\./, '');
    const path = u.pathname.replace(/\/$/, '');
    return `${host}${path}${u.search}`.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Dedup key across all shortcut kinds. `link` keeps the existing URL-based key
 * (unchanged, still what ResourcesContent/the extension capture path rely on);
 * `app`/`file` dedupe on the resolved path, case-insensitively (Windows paths
 * are case-insensitive); `tool` dedupes on the Blanc tool id verbatim.
 */
export function normalizeToolTarget(kind: CollectedToolKind, target: string): string {
  if (kind === 'link') return normalizeToolUrl(target);
  if (kind === 'tool') return target.trim();
  return target.trim().toLowerCase();
}

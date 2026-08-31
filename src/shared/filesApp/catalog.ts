/**
 * The Files app — the catalogue model.
 *
 * `FILES_APP_PLAN.md`'s central decision, in code: **the folders are views over
 * heterogeneous stores, not real directories.** Every item carries a real
 * location it can reveal (a path, a table row, a store key) and is *placed* in
 * the tree by its derived category. Nothing is filed by hand.
 *
 * This module is deliberately pure — no `fs`, no `electron`, no `window`. The
 * main-process enumerators (`main/filesApp/`) produce `FilesItem`s against these
 * types and the renderer consumes them; both sides agree here or nowhere.
 *
 * Three contracts the rest of the app leans on:
 *
 * 1. **A category id is a leaf or a group, and items only ever sit on leaves.**
 *    A group's count is the sum of its leaves (`countByCategory`), so a group
 *    can never disagree with its children.
 * 2. **Derived folders are not collections.** Membership in a derived folder is
 *    computed and cannot be edited, renamed or deleted; that refusal is honest
 *    rather than hidden (gate 17). Collections are the user's own containers and
 *    live in a separate store.
 * 3. **Only a file-backed location can be revealed.** `revealTargetFor` returns
 *    `null` for every other store, which is what lets gate 12's non-file kind
 *    refuse honestly instead of opening the wrong folder.
 */

// `langs.ts` has no imports of its own, so this keeps the module pure.
import { kataToHira } from '../langs';

/* ------------------------------------------------------------------ *
 * Provenance — what decides whether a card from this item is trusted.
 * ------------------------------------------------------------------ */

/**
 * Text provenance, per `MINING_UNIFICATION_PLAN.md`'s binding constraint:
 * categorise on how the text was produced, never on "it is a movie".
 * Transcript-derived material stays visibly marked everywhere it appears.
 */
export const FILES_PROVENANCES = [
  'human-subs',
  'auto-captions',
  'whisper-transcript',
  'book-text',
  'app-generated',
  'installed',
  'unknown',
] as const;
export type FilesProvenance = (typeof FILES_PROVENANCES)[number];

/** Provenance values whose material is machine-produced and must be marked. */
const MACHINE_PROVENANCE: ReadonlySet<FilesProvenance> = new Set<FilesProvenance>([
  'auto-captions',
  'whisper-transcript',
]);

/**
 * Whether cards derived from this item must carry a visible machine-origin
 * mark. The plan's rule is one-directional: this may be made *more* prominent,
 * never hidden.
 */
export function isMachineDerived(provenance: FilesProvenance): boolean {
  return MACHINE_PROVENANCE.has(provenance);
}

/* ------------------------------------------------------------------ *
 * Item kinds.
 * ------------------------------------------------------------------ */

export const FILES_ITEM_KINDS = [
  'book',
  'manga',
  'visual-novel',
  'video',
  'audio',
  'transcript',
  'subtitle',
  'deck',
  'mined-card',
  'package',
  'export',
  'note',
  'highlight',
  'draft',
  'dictionary',
  'model',
  'artwork',
  'memory-stat',
  'statistic',
  'profile',
  'workspace',
  'job',
  'acquisition',
] as const;
export type FilesItemKind = (typeof FILES_ITEM_KINDS)[number];

/* ------------------------------------------------------------------ *
 * The derived tree.
 * ------------------------------------------------------------------ */

export const FILES_GROUP_IDS = [
  'sources',
  'outputs',
  'reference',
  'system',
  'workspaces',
] as const;
export type FilesGroupId = (typeof FILES_GROUP_IDS)[number];

export const FILES_LEAF_IDS = [
  'sources/books',
  'sources/manga',
  'sources/visual-novels',
  'sources/video',
  'sources/audio',
  'sources/text',
  'outputs/decks',
  'outputs/mined',
  'outputs/packages',
  'outputs/exports',
  'outputs/notes',
  'outputs/highlights',
  'outputs/drafts',
  'reference/dictionaries',
  'reference/models',
  'reference/artwork',
  'system/memory',
  'system/statistics',
  'system/profiles',
  'workspaces/studies',
  'workspaces/queue',
  'workspaces/acquisitions',
] as const;
export type FilesLeafId = (typeof FILES_LEAF_IDS)[number];

export type FilesCategoryId = FilesGroupId | FilesLeafId;

export interface FilesCategoryNode {
  id: FilesCategoryId;
  /**
   * i18n key, resolved with `t()` at render time. Module-level data cannot call
   * `useT()` at declaration time — see CLAUDE.md's i18n rule 7.
   */
  labelKey: string;
  /** Absent on a group; a group's parent is the root. */
  parent: FilesGroupId | null;
  /** Leaves are where items live; groups only aggregate. */
  isLeaf: boolean;
}

function group(id: FilesGroupId): FilesCategoryNode {
  return { id, labelKey: `filesApp.category.${id}`, parent: null, isLeaf: false };
}

function leaf(id: FilesLeafId): FilesCategoryNode {
  const parent = id.slice(0, id.indexOf('/')) as FilesGroupId;
  return { id, labelKey: `filesApp.category.${id.replace('/', '.')}`, parent, isLeaf: true };
}

/**
 * The tree, in display order. Adding a category later is additive by design —
 * the tree is derived, so a new leaf plus an enumerator that fills it is the
 * whole change.
 */
export const FILES_TREE: readonly FilesCategoryNode[] = [
  group('sources'),
  leaf('sources/books'),
  leaf('sources/manga'),
  leaf('sources/visual-novels'),
  leaf('sources/video'),
  leaf('sources/audio'),
  leaf('sources/text'),
  group('outputs'),
  leaf('outputs/decks'),
  leaf('outputs/mined'),
  leaf('outputs/packages'),
  leaf('outputs/exports'),
  leaf('outputs/notes'),
  leaf('outputs/highlights'),
  leaf('outputs/drafts'),
  group('reference'),
  leaf('reference/dictionaries'),
  leaf('reference/models'),
  leaf('reference/artwork'),
  group('system'),
  leaf('system/memory'),
  leaf('system/statistics'),
  leaf('system/profiles'),
  group('workspaces'),
  leaf('workspaces/studies'),
  leaf('workspaces/queue'),
  leaf('workspaces/acquisitions'),
];

/**
 * The two leaves that are PANELS rather than item collections — gate 8's
 * memory and statistics, decision 1's sanctioned migration out of Settings.
 *
 * They are in the tree because they are things the app stores and the user
 * came here to find; they hold no enumerable rows, so no enumerator will ever
 * fill them. That matters for gate 1, whose rule is "a category reading 0
 * while items exist is a FINDING": these two have no items, so a rail count of
 * 0 would be an honest number answering the wrong question. The rail renders
 * them without a count instead, and selecting one shows its panel.
 *
 * Kept here rather than in the renderer so the parity and enumerator tests can
 * see it: an enumerator that starts filing rows under one of these is a
 * category conflict, not a feature.
 */
export const FILES_PANEL_CATEGORY_IDS = ['system/memory', 'system/statistics'] as const;
export type FilesPanelCategoryId = (typeof FILES_PANEL_CATEGORY_IDS)[number];

export function isFilesPanelCategory(id: FilesCategoryId): id is FilesPanelCategoryId {
  return (FILES_PANEL_CATEGORY_IDS as readonly string[]).includes(id);
}

const NODE_BY_ID = new Map<FilesCategoryId, FilesCategoryNode>(
  FILES_TREE.map((node) => [node.id, node]),
);

export function categoryNode(id: FilesCategoryId): FilesCategoryNode | null {
  return NODE_BY_ID.get(id) ?? null;
}

export function isFilesCategoryId(value: unknown): value is FilesCategoryId {
  return typeof value === 'string' && NODE_BY_ID.has(value as FilesCategoryId);
}

/** The leaves under a category. A leaf is its own only leaf. */
export function leavesOf(id: FilesCategoryId): FilesLeafId[] {
  const node = NODE_BY_ID.get(id);
  if (!node) return [];
  if (node.isLeaf) return [node.id as FilesLeafId];
  return FILES_TREE.filter((n) => n.isLeaf && n.parent === node.id).map((n) => n.id as FilesLeafId);
}

/** Whether `itemCategory` is inside `scope` — the tree filter, group or leaf. */
export function categoryContains(scope: FilesCategoryId, itemCategory: FilesLeafId): boolean {
  const node = NODE_BY_ID.get(scope);
  if (!node) return false;
  if (node.isLeaf) return node.id === itemCategory;
  return NODE_BY_ID.get(itemCategory)?.parent === node.id;
}

/**
 * Gate 4's derivation, in one place: what an item *is* decides where it sits.
 * An enumerator may not choose a category freely; it produces a kind and this
 * table places it, which is why a newly transcribed video needs no manual step.
 */
const CATEGORY_FOR_KIND: Record<FilesItemKind, FilesLeafId> = {
  book: 'sources/books',
  manga: 'sources/manga',
  'visual-novel': 'sources/visual-novels',
  video: 'sources/video',
  audio: 'sources/audio',
  transcript: 'sources/text',
  subtitle: 'sources/text',
  deck: 'outputs/decks',
  'mined-card': 'outputs/mined',
  package: 'outputs/packages',
  export: 'outputs/exports',
  note: 'outputs/notes',
  highlight: 'outputs/highlights',
  draft: 'outputs/drafts',
  dictionary: 'reference/dictionaries',
  model: 'reference/models',
  artwork: 'reference/artwork',
  'memory-stat': 'system/memory',
  statistic: 'system/statistics',
  profile: 'system/profiles',
  workspace: 'workspaces/studies',
  job: 'workspaces/queue',
  acquisition: 'workspaces/acquisitions',
};

export function categoryForKind(kind: FilesItemKind): FilesLeafId {
  return CATEGORY_FOR_KIND[kind];
}

/* ------------------------------------------------------------------ *
 * Locations — the real place behind every row.
 * ------------------------------------------------------------------ */

/**
 * Where an item actually lives. The discriminant is the store, because the
 * store is what decides which actions are even offerable: only `file` can be
 * revealed in Explorer or sent to the Recycle Bin, and only `file` can be
 * renamed on disk.
 */
export type FilesLocation =
  | { store: 'file'; path: string }
  | { store: 'sqlite'; database: string; table: string; rowId: string }
  | { store: 'json'; file: string; pointer: string }
  | { store: 'localStorage'; key: string; pointer?: string }
  | { store: 'derived'; describes: string };

export type FilesStoreId = FilesLocation['store'];

/**
 * The path Explorer should be asked to reveal, or `null` when there is none.
 * Gate 12 turns on this returning `null` for non-file kinds: a reveal that
 * quietly opened the userData folder for a SQLite dictionary row would be the
 * wrong folder, presented as a success.
 */
export function revealTargetFor(location: FilesLocation): string | null {
  return location.store === 'file' ? location.path : null;
}

/**
 * How a delete must behave for this location, per the plan's Deletion section.
 * `trash` routes through Electron `shell.trashItem` (the Windows Recycle Bin);
 * `soft` is an index row with an undo window; `none` is a derived reading with
 * nothing to delete, and its confirm must say so in different words.
 */
export type FilesDeleteMode = 'trash' | 'soft' | 'none';

export function deleteModeFor(location: FilesLocation): FilesDeleteMode {
  switch (location.store) {
    case 'file':
      return 'trash';
    case 'sqlite':
    case 'json':
    case 'localStorage':
      return 'soft';
    case 'derived':
      return 'none';
  }
}

/* ------------------------------------------------------------------ *
 * Items.
 * ------------------------------------------------------------------ */

/**
 * State flags shown as columns (T3). Every one is a real condition in this app
 * today; a flag nothing can set is a fabricated column and must not be added.
 */
export interface FilesItemFlags {
  transcribed?: boolean;
  mined?: boolean;
  exported?: boolean;
  /** Dictionaries and models: whether the app is currently using it. */
  enabled?: boolean;
  hasNotes?: boolean;
  /** A record whose backing file is gone. Detected, never crashed on. */
  brokenLink?: boolean;
  /** Referenced in place rather than copied into userData. */
  referenced?: boolean;
  /**
   * A file this app wrote that no persisted record claims — the mirror image of
   * `brokenLink`. Surfaced rather than hidden so the count in the tree can be
   * reconciled against the count on disk.
   */
  orphan?: boolean;
}

export interface FilesItem {
  /** Unique across the whole index. Convention: `<enumerator>:<local id>`. */
  id: string;
  name: string;
  kind: FilesItemKind;
  /** Always a leaf. Derived from `kind` unless an enumerator narrows it. */
  categoryId: FilesLeafId;
  provenance: FilesProvenance;
  /** `null` where the store genuinely has no size, never 0 as a stand-in. */
  sizeBytes: number | null;
  /** Epoch ms, or `null` where the store supplies no such value. */
  createdAt: number | null;
  modifiedAt: number | null;
  lastUsedAt: number | null;
  location: FilesLocation;
  flags: FilesItemFlags;
  /** Which enumerator produced this row — shown in Properties, used in bug reports. */
  source: string;
}

/* ------------------------------------------------------------------ *
 * Derivation — gate 4. Nothing here is filed by hand.
 * ------------------------------------------------------------------ */

/**
 * The YouTube id yt-dlp encoded into a downloaded filename.
 *
 * `Title [x9QKu3OLjaU].mp4` — the id is the LAST bracketed group, because a
 * title may legitimately contain brackets of its own (`[4K]`, `[ENG SUB]`) and
 * taking the first match would return one of those. The 11-character
 * URL-safe-base64 shape is YouTube's, and requiring it is what keeps `[4K]`
 * from being mistaken for an id when it is the only bracket present.
 *
 * Returns `null` rather than a guess: a wrong id would silently mark the wrong
 * video transcribed, which is worse than leaving the flag off.
 */
export function youtubeIdFromFileName(name: string): string | null {
  const matches = name.match(/\[([A-Za-z0-9_-]{11})\]/g);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].slice(1, -1);
}

/**
 * Cross-store derivation, run once over the assembled index.
 *
 * Gate 4's requirement is that a newly transcribed video appears in the right
 * place **with no manual step**. Placement was already derived — `categoryId`
 * comes from `kind`. The state was not: transcripts knew they were transcripts,
 * and the videos they belong to knew nothing, because a `yt-transcripts/` row
 * and a `downloads/` row are produced by two different enumerators that never
 * see each other's output.
 *
 * So it happens HERE, after every enumerator has run, rather than inside one of
 * them. An enumerator that reached across into another store's directory would
 * be a second reader of that store, and the two would drift.
 *
 * The link is the YouTube id: a transcript file is named `<youtubeId>.json`
 * and its row id is `transcript:<youtubeId>`, while a downloaded video carries
 * the same id in its filename. A video with no derivable id is left alone —
 * absent, not false, because "we could not tell" and "not transcribed" are
 * different answers and only one of them justifies offering a Transcribe button.
 */
export function deriveCrossStoreFlags(items: readonly FilesItem[]): FilesItem[] {
  const transcribedIds = new Set<string>();
  for (const item of items) {
    if (item.kind !== 'transcript') continue;
    const id = item.id.startsWith('transcript:') ? item.id.slice('transcript:'.length) : null;
    if (id) transcribedIds.add(id);
  }
  if (transcribedIds.size === 0) return [...items];

  return items.map((item) => {
    if (item.kind !== 'video' && item.kind !== 'audio') return item;
    if (item.flags.transcribed) return item;
    const path = item.location.store === 'file' ? item.location.path : '';
    const youtubeId =
      youtubeIdFromFileName(item.name) ?? youtubeIdFromFileName(path);
    if (!youtubeId || !transcribedIds.has(youtubeId)) return item;
    return { ...item, flags: { ...item.flags, transcribed: true } };
  });
}

/* ------------------------------------------------------------------ *
 * Counting — gate 1.
 * ------------------------------------------------------------------ */

export interface FilesCategoryCount {
  categoryId: FilesCategoryId;
  /** Items directly on this node. Always 0 for a group. */
  own: number;
  /** Items on this node and everything under it. */
  total: number;
}

/**
 * Count every node in the tree, groups included. A group's total is the sum of
 * its leaves by construction, so the two can never drift.
 *
 * Gate 1 reads this: a category reporting 0 while items exist is a FINDING, and
 * the only way to see that is to have every node in the result, including the
 * empty ones. So empty categories are present with 0 rather than omitted.
 */
export function countByCategory(items: readonly FilesItem[]): FilesCategoryCount[] {
  const own = new Map<FilesCategoryId, number>();
  for (const node of FILES_TREE) own.set(node.id, 0);
  for (const item of items) {
    own.set(item.categoryId, (own.get(item.categoryId) ?? 0) + 1);
  }
  return FILES_TREE.map((node) => {
    if (node.isLeaf) {
      const n = own.get(node.id) ?? 0;
      return { categoryId: node.id, own: n, total: n };
    }
    const total = leavesOf(node.id).reduce((sum, id) => sum + (own.get(id) ?? 0), 0);
    return { categoryId: node.id, own: 0, total };
  });
}

/* ------------------------------------------------------------------ *
 * Sorting — gate 14.
 * ------------------------------------------------------------------ */

export const FILES_SORT_COLUMNS = [
  'name',
  'kind',
  'provenance',
  'size',
  'created',
  'modified',
  'lastUsed',
] as const;
export type FilesSortColumn = (typeof FILES_SORT_COLUMNS)[number];
export type FilesSortDirection = 'asc' | 'desc';

function numericField(item: FilesItem, column: FilesSortColumn): number | null {
  switch (column) {
    case 'size':
      return item.sizeBytes;
    case 'created':
      return item.createdAt;
    case 'modified':
      return item.modifiedAt;
    case 'lastUsed':
      return item.lastUsedAt;
    default:
      return null;
  }
}

function textField(item: FilesItem, column: FilesSortColumn): string {
  switch (column) {
    case 'kind':
      return item.kind;
    case 'provenance':
      return item.provenance;
    default:
      return item.name;
  }
}

/**
 * Stable sort with an explicit rule for missing values, which is the half of
 * gate 14 that is easy to get wrong: **a `null` always sorts last, in BOTH
 * directions.** Flipping the direction flips the order of the items that have a
 * value; it does not promote the ones that have none to the top. That is the
 * spreadsheet convention and, more importantly, it is predictable — the gate
 * rejects "landing arbitrarily", not "landing at the end".
 *
 * Ties fall back to name, then to id, so the result is a total order and a
 * re-sort of the same set never reshuffles equal rows.
 */
export function sortItems(
  items: readonly FilesItem[],
  column: FilesSortColumn,
  direction: FilesSortDirection = 'asc',
): FilesItem[] {
  const sign = direction === 'asc' ? 1 : -1;
  const isNumeric = column === 'size' || column === 'created' || column === 'modified' || column === 'lastUsed';

  return [...items].sort((a, b) => {
    if (isNumeric) {
      const av = numericField(a, column);
      const bv = numericField(b, column);
      if (av === null && bv === null) return tieBreak(a, b);
      if (av === null) return 1; // missing last, whichever way the arrow points
      if (bv === null) return -1;
      if (av !== bv) return (av - bv) * sign;
      return tieBreak(a, b);
    }
    const cmp = textField(a, column).localeCompare(textField(b, column), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
    if (cmp !== 0) return cmp * sign;
    return tieBreak(a, b);
  });
}

function tieBreak(a: FilesItem, b: FilesItem): number {
  const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/* ------------------------------------------------------------------ *
 * Search — one query across everything.
 * ------------------------------------------------------------------ */

/**
 * The fold every Files search compares under.
 *
 * `toLowerCase` alone is a Latin rule, and most names in this index are
 * Japanese, where it does nothing at all. Two real ways a search then misses an
 * item that is right there — gate 2's "findable" is exactly this:
 *
 * - **Width.** A Japanese IME emits full-width Latin and digits (`＃２８６`),
 *   and half-width katakana still arrives from some sources. NFKC folds both,
 *   so typing `286` finds `＃２８６`.
 * - **Kana.** A user who knows a title's reading types it in hiragana; the
 *   title is written in katakana. `kataToHira` is how the rest of this app
 *   already compares kana (`kanaEquals`, `langs.ts:132`) and it is reused here
 *   rather than reinvented — two search folds that disagree is worse than one
 *   that is merely strict.
 *
 * Applied to BOTH sides, so the query and the name are folded the same way.
 */
function searchFold(text: string): string {
  return kataToHira(text.normalize('NFKC').toLowerCase());
}

/**
 * Matches name, kind and provenance. Empty query matches all.
 *
 * `kind` and `provenance` are compared folded too, but they are ASCII
 * identifiers, so the fold is a no-op on them and only the name benefits.
 */
export function matchesQuery(item: FilesItem, query: string): boolean {
  const q = searchFold(query).trim();
  if (!q) return true;
  return (
    searchFold(item.name).includes(q) ||
    item.kind.includes(q) ||
    item.provenance.includes(q)
  );
}

/* ------------------------------------------------------------------ *
 * The index envelope.
 * ------------------------------------------------------------------ */

/**
 * One enumerator's contribution, reported separately so a category reading 0
 * can be traced to the enumerator that produced nothing rather than to the
 * category. An enumerator that throws reports `error` and the rest of the index
 * still builds — a single unreadable store must not blank the whole app.
 */
export interface FilesEnumeratorReport {
  source: string;
  itemCount: number;
  elapsedMs: number;
  error?: string;
}

export interface FilesIndexSnapshot {
  items: FilesItem[];
  counts: FilesCategoryCount[];
  enumerators: FilesEnumeratorReport[];
  builtAt: number;
}

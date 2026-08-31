/**
 * Gate 19 — Smart folders, as a pure model.
 *
 * The gate: "A saved search such as *Untranscribed videos* changes its
 * membership after a video is transcribed, with the count before and after both
 * reported."
 *
 * **A smart folder stores a QUESTION, never an answer.** It holds criteria and
 * nothing else — no item ids, no cached count, no membership list. That is what
 * makes "stays live" true by construction: there is no stored answer that could
 * go out of date, so every read re-asks the index. A cached membership would
 * have to be invalidated by every importer in the app, and the one that forgot
 * would leave a folder that is quietly wrong.
 *
 * **Flags are matched three-valued, and that is the whole gate.** "Untranscribed
 * videos" is `transcribed: false`, and the items it must find carry no
 * `transcribed` key at all — `flags` is a sparse record where absent means
 * false. A `===` against `item.flags[name]` would compare `false` to `undefined`
 * and find nothing, so the folder would read 0 and look like an honest empty
 * category. `Boolean(...)` is the coercion that makes absent and false the same
 * answer, which is what the data actually means.
 *
 * Criteria combine as AND across fields and OR within a list — the shape a
 * saved search actually has ("videos or audio, not transcribed").
 */
import {
  categoryContains,
  matchesQuery,
  type FilesCategoryId,
  type FilesItem,
  type FilesItemKind,
  type FilesProvenance,
} from './catalog';

/** Bumped when the on-disk shape changes; readers migrate forward, never guess. */
export const FILES_SMART_FOLDERS_VERSION = 1;

/** The flags a saved search may ask about. A closed list, so a typo cannot pass. */
export const FILES_SMART_FLAGS = [
  'transcribed',
  'mined',
  'exported',
  'enabled',
  'hasNotes',
  'brokenLink',
  'referenced',
  'orphan',
] as const;
export type FilesSmartFlag = (typeof FILES_SMART_FLAGS)[number];

export interface FilesSmartCriteria {
  /** OR within: any of these kinds matches. Absent means any kind. */
  kinds?: FilesItemKind[];
  /** OR within. Absent means any provenance. */
  provenances?: FilesProvenance[];
  /** The item must sit under this node. Absent means the whole tree. */
  categoryId?: FilesCategoryId;
  /** AND across. `false` matches an item whose flag is absent OR false. */
  flags?: Partial<Record<FilesSmartFlag, boolean>>;
  /** The same substring match the search box uses, so the two cannot disagree. */
  query?: string;
}

export interface FilesSmartFolder {
  id: string;
  /** A built-in carries an i18n key; a saved search carries the user's own text. */
  nameKey?: string;
  name?: string;
  criteria: FilesSmartCriteria;
  createdAt?: number;
}

export interface FilesSmartFoldersDoc {
  version: number;
  folders: FilesSmartFolder[];
}

export interface FilesSmartFoldersResult {
  doc: FilesSmartFoldersDoc;
  errorKey?: string;
}

export const EMPTY_SMART_FOLDERS_DOC: FilesSmartFoldersDoc = {
  version: FILES_SMART_FOLDERS_VERSION,
  folders: [],
};

export const SMART_FOLDER_NAME_MAX = 120;

/**
 * The built-ins. `untranscribed-video` is the gate's own named example and is
 * why this list exists at all — a feature whose only content is what the user
 * built is a feature nobody discovers.
 *
 * These are NOT stored: they are compiled in, so they cannot be deleted into a
 * state where the gate's example no longer exists.
 */
export const FILES_SMART_FOLDER_PRESETS: readonly FilesSmartFolder[] = [
  {
    id: 'preset:untranscribed-video',
    nameKey: 'filesApp.smart.preset.untranscribedVideo',
    criteria: { kinds: ['video'], flags: { transcribed: false } },
  },
  {
    id: 'preset:transcribed-video',
    nameKey: 'filesApp.smart.preset.transcribedVideo',
    criteria: { kinds: ['video'], flags: { transcribed: true } },
  },
  {
    id: 'preset:broken-links',
    nameKey: 'filesApp.smart.preset.brokenLinks',
    criteria: { flags: { brokenLink: true } },
  },
  {
    id: 'preset:unmined-text',
    nameKey: 'filesApp.smart.preset.unminedText',
    criteria: { kinds: ['subtitle', 'transcript', 'book'], flags: { mined: false } },
  },
];

export function isPresetSmartFolder(id: string): boolean {
  return FILES_SMART_FOLDER_PRESETS.some((f) => f.id === id);
}

/**
 * Does one item answer this question?
 *
 * Read the flag comparison carefully — `Boolean(item.flags[name]) === wanted` is
 * the clause the gate turns on. `flags` is sparse; an untranscribed video has no
 * `transcribed` key, so a strict comparison against `false` matches nothing and
 * the folder reads 0 while looking like an honest empty category.
 */
export function matchesSmartFolder(item: FilesItem, criteria: FilesSmartCriteria): boolean {
  if (criteria.kinds && criteria.kinds.length > 0 && !criteria.kinds.includes(item.kind)) {
    return false;
  }
  if (
    criteria.provenances &&
    criteria.provenances.length > 0 &&
    !criteria.provenances.includes(item.provenance)
  ) {
    return false;
  }
  if (criteria.categoryId && !categoryContains(criteria.categoryId, item.categoryId)) return false;
  if (criteria.flags) {
    for (const [name, wanted] of Object.entries(criteria.flags)) {
      if (wanted === undefined) continue;
      if (Boolean(item.flags[name as FilesSmartFlag]) !== wanted) return false;
    }
  }
  if (criteria.query && !matchesQuery(item, criteria.query)) return false;
  return true;
}

/** Membership, recomputed. There is deliberately no cached form of this. */
export function smartFolderMembers(
  items: readonly FilesItem[],
  criteria: FilesSmartCriteria,
): FilesItem[] {
  return items.filter((item) => matchesSmartFolder(item, criteria));
}

export function smartFolderCount(
  items: readonly FilesItem[],
  criteria: FilesSmartCriteria,
): number {
  let n = 0;
  for (const item of items) if (matchesSmartFolder(item, criteria)) n += 1;
  return n;
}

/** Every smart folder on screen: the compiled-in presets, then the user's own. */
export function allSmartFolders(doc: FilesSmartFoldersDoc): FilesSmartFolder[] {
  return [...FILES_SMART_FOLDER_PRESETS, ...doc.folders];
}

export function smartFolderById(
  doc: FilesSmartFoldersDoc,
  id: string,
): FilesSmartFolder | undefined {
  return allSmartFolders(doc).find((f) => f.id === id);
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Save the search the user is looking at.
 *
 * A criteria object with nothing in it would produce a folder that matches
 * everything, which is a second "Everything" node with a name the user chose —
 * refused rather than saved, because it is almost always a mis-click on an
 * unfiltered view.
 */
export function saveSmartFolder(
  doc: FilesSmartFoldersDoc,
  args: { id: string; name: string; criteria: FilesSmartCriteria; now: number },
): FilesSmartFoldersResult {
  const name = normalizeName(args.name);
  if (!name) return { doc, errorKey: 'filesApp.smart.error.emptyName' };
  if (name.length > SMART_FOLDER_NAME_MAX) {
    return { doc, errorKey: 'filesApp.smart.error.nameTooLong' };
  }
  if (!criteriaAreNarrowing(args.criteria)) {
    return { doc, errorKey: 'filesApp.smart.error.emptyCriteria' };
  }
  if (doc.folders.some((f) => f.name?.toLocaleLowerCase() === name.toLocaleLowerCase())) {
    return { doc, errorKey: 'filesApp.smart.error.duplicateName' };
  }
  if (smartFolderById(doc, args.id)) return { doc, errorKey: 'filesApp.smart.error.duplicateId' };
  return {
    doc: {
      ...doc,
      folders: [...doc.folders, { id: args.id, name, criteria: args.criteria, createdAt: args.now }],
    },
  };
}

export function criteriaAreNarrowing(criteria: FilesSmartCriteria): boolean {
  if (criteria.kinds && criteria.kinds.length > 0) return true;
  if (criteria.provenances && criteria.provenances.length > 0) return true;
  if (criteria.categoryId) return true;
  if (criteria.flags && Object.values(criteria.flags).some((v) => v !== undefined)) return true;
  return Boolean(criteria.query && criteria.query.trim());
}

/**
 * Delete a saved search. A PRESET cannot be deleted and refuses by name — it is
 * compiled in, and a control that appears to remove it would be lying.
 */
export function deleteSmartFolder(
  doc: FilesSmartFoldersDoc,
  id: string,
): FilesSmartFoldersResult {
  if (isPresetSmartFolder(id)) return { doc, errorKey: 'filesApp.smart.error.presetLocked' };
  if (!doc.folders.some((f) => f.id === id)) {
    return { doc, errorKey: 'filesApp.smart.error.noSuchFolder' };
  }
  return { doc: { ...doc, folders: doc.folders.filter((f) => f.id !== id) } };
}

/**
 * Read a persisted document defensively. Unknown future versions read as empty:
 * silently reinterpreting a newer shape is how a downgrade eats data.
 */
export function parseSmartFoldersDoc(raw: unknown): FilesSmartFoldersDoc {
  if (!raw || typeof raw !== 'object') return EMPTY_SMART_FOLDERS_DOC;
  const candidate = raw as Partial<FilesSmartFoldersDoc>;
  if (candidate.version !== FILES_SMART_FOLDERS_VERSION) return EMPTY_SMART_FOLDERS_DOC;
  if (!Array.isArray(candidate.folders)) return EMPTY_SMART_FOLDERS_DOC;
  const seen = new Set<string>();
  const folders: FilesSmartFolder[] = [];
  for (const entry of candidate.folders) {
    if (!entry || typeof entry !== 'object') continue;
    const f = entry as Partial<FilesSmartFolder>;
    // A stored id that shadows a preset would give two rows one identity, so
    // the saved one is dropped rather than allowed to mask a built-in.
    if (typeof f.id !== 'string' || !f.id || seen.has(f.id) || isPresetSmartFolder(f.id)) continue;
    if (typeof f.name !== 'string' || !f.name) continue;
    const criteria = parseCriteria(f.criteria);
    if (!criteriaAreNarrowing(criteria)) continue;
    seen.add(f.id);
    folders.push({
      id: f.id,
      name: f.name,
      criteria,
      createdAt: typeof f.createdAt === 'number' ? f.createdAt : 0,
    });
  }
  return { version: FILES_SMART_FOLDERS_VERSION, folders };
}

function parseCriteria(raw: unknown): FilesSmartCriteria {
  if (!raw || typeof raw !== 'object') return {};
  const c = raw as Record<string, unknown>;
  const out: FilesSmartCriteria = {};
  if (Array.isArray(c.kinds)) {
    out.kinds = c.kinds.filter((k): k is FilesItemKind => typeof k === 'string');
  }
  if (Array.isArray(c.provenances)) {
    out.provenances = c.provenances.filter((p): p is FilesProvenance => typeof p === 'string');
  }
  if (typeof c.categoryId === 'string') out.categoryId = c.categoryId as FilesCategoryId;
  if (typeof c.query === 'string') out.query = c.query;
  if (c.flags && typeof c.flags === 'object') {
    const flags: Partial<Record<FilesSmartFlag, boolean>> = {};
    for (const name of FILES_SMART_FLAGS) {
      const value = (c.flags as Record<string, unknown>)[name];
      if (typeof value === 'boolean') flags[name] = value;
    }
    if (Object.keys(flags).length > 0) out.flags = flags;
  }
  return out;
}

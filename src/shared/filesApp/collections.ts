/**
 * Gate 16 — Collections, the user's own folders, as a pure model.
 *
 * The gate: "Create a folder, add items of two different kinds to it, nest it,
 * reopen the app and it survives. Deleting the collection leaves every item in
 * place — proven by re-finding one of them afterwards."
 *
 * **Collections are the ONLY containers the user writes.** Every other node in
 * the tree is derived — `catalog.ts` decision 2 is explicit that membership in a
 * derived folder is a consequence of what an item IS, so a derived folder
 * cannot be added to by hand (gate 17). A collection is the opposite: its
 * membership is a list, and nothing derives it.
 *
 * **A collection holds ITEM IDS, never items.** That is what makes "deleting the
 * collection leaves every item in place" true by construction rather than by
 * remembering to be careful: the container has nothing to delete. An id that no
 * longer resolves is a stale reference, which `resolveCollection` reports as a
 * COUNT rather than dropping silently — a folder that quietly shrank is the
 * shape the plan calls a finding.
 *
 * **Deleting a collection PROMOTES its children to its parent** rather than
 * removing them. Recursive delete would take containers the user never named,
 * and there is no undo for a container (the plan's soft-delete window is for
 * index rows). Promotion is the reversible reading: the user can always delete
 * a child explicitly.
 *
 * Every operation is `(doc, …) => FilesCollectionsResult`, pure, returning a NEW
 * document or the old one plus a named `errorKey`. Nothing here throws and
 * nothing here touches a store, so the whole table is testable without a
 * profile — and the caller decides when to persist.
 */

/** Bumped when the on-disk shape changes; readers migrate forward, never guess. */
export const FILES_COLLECTIONS_VERSION = 1;

export interface FilesCollection {
  id: string;
  name: string;
  /** `null` is a top-level collection. Never a missing key. */
  parentId: string | null;
  /** Item ids from the Files index, in the order the user added them. */
  itemIds: string[];
  createdAt: number;
  modifiedAt: number;
}

export interface FilesCollectionsDoc {
  version: number;
  collections: FilesCollection[];
}

export interface FilesCollectionsResult {
  doc: FilesCollectionsDoc;
  /** i18n key naming the refusal. Absent on success — never an empty string. */
  errorKey?: string;
  /** The collection the operation created or changed, when there is one. */
  changed?: FilesCollection;
}

export const EMPTY_COLLECTIONS_DOC: FilesCollectionsDoc = {
  version: FILES_COLLECTIONS_VERSION,
  collections: [],
};

/** Longest name a collection may carry. Names are chrome, not study content. */
export const COLLECTION_NAME_MAX = 120;

function ok(doc: FilesCollectionsDoc, changed?: FilesCollection): FilesCollectionsResult {
  return changed ? { doc, changed } : { doc };
}

function refuse(doc: FilesCollectionsDoc, errorKey: string): FilesCollectionsResult {
  return { doc, errorKey };
}

export function collectionById(
  doc: FilesCollectionsDoc,
  id: string,
): FilesCollection | undefined {
  return doc.collections.find((c) => c.id === id);
}

/** Direct children of a collection, or of the root when `parentId` is null. */
export function childrenOf(
  doc: FilesCollectionsDoc,
  parentId: string | null,
): FilesCollection[] {
  return doc.collections.filter((c) => c.parentId === parentId);
}

/**
 * Every ancestor of `id`, nearest first. Used by the cycle guard and by the
 * breadcrumb; one implementation so the two cannot disagree about depth.
 *
 * Bounded by the collection count, so a document that somehow contains a cycle
 * terminates instead of hanging the renderer.
 */
export function ancestorsOf(doc: FilesCollectionsDoc, id: string): FilesCollection[] {
  const out: FilesCollection[] = [];
  const seen = new Set<string>([id]);
  let current = collectionById(doc, id)?.parentId ?? null;
  while (current && !seen.has(current)) {
    const parent = collectionById(doc, current);
    if (!parent) break;
    out.push(parent);
    seen.add(parent.id);
    current = parent.parentId;
  }
  return out;
}

function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * Names are unique among SIBLINGS, not globally — "Season 1" under two
 * different shows is the ordinary case, and forbidding it would be a filing
 * system that cannot file.
 */
function siblingNameTaken(
  doc: FilesCollectionsDoc,
  parentId: string | null,
  name: string,
  exceptId?: string,
): boolean {
  const folded = name.toLocaleLowerCase();
  return childrenOf(doc, parentId).some(
    (c) => c.id !== exceptId && c.name.toLocaleLowerCase() === folded,
  );
}

function touch(c: FilesCollection, now: number): FilesCollection {
  return { ...c, modifiedAt: now };
}

export interface CreateCollectionArgs {
  name: string;
  parentId?: string | null;
  /** Injected so the model stays pure and tests are deterministic. */
  id: string;
  now: number;
}

export function createCollection(
  doc: FilesCollectionsDoc,
  args: CreateCollectionArgs,
): FilesCollectionsResult {
  const name = normalizeName(args.name);
  if (!name) return refuse(doc, 'filesApp.collection.error.emptyName');
  if (name.length > COLLECTION_NAME_MAX) {
    return refuse(doc, 'filesApp.collection.error.nameTooLong');
  }
  const parentId = args.parentId ?? null;
  if (parentId && !collectionById(doc, parentId)) {
    return refuse(doc, 'filesApp.collection.error.noSuchParent');
  }
  if (siblingNameTaken(doc, parentId, name)) {
    return refuse(doc, 'filesApp.collection.error.duplicateName');
  }
  if (collectionById(doc, args.id)) return refuse(doc, 'filesApp.collection.error.duplicateId');
  const created: FilesCollection = {
    id: args.id,
    name,
    parentId,
    itemIds: [],
    createdAt: args.now,
    modifiedAt: args.now,
  };
  return ok({ ...doc, collections: [...doc.collections, created] }, created);
}

export function renameCollection(
  doc: FilesCollectionsDoc,
  id: string,
  rawName: string,
  now: number,
): FilesCollectionsResult {
  const target = collectionById(doc, id);
  if (!target) return refuse(doc, 'filesApp.collection.error.noSuchCollection');
  const name = normalizeName(rawName);
  if (!name) return refuse(doc, 'filesApp.collection.error.emptyName');
  if (name.length > COLLECTION_NAME_MAX) {
    return refuse(doc, 'filesApp.collection.error.nameTooLong');
  }
  if (siblingNameTaken(doc, target.parentId, name, id)) {
    return refuse(doc, 'filesApp.collection.error.duplicateName');
  }
  const next = touch({ ...target, name }, now);
  return ok(
    { ...doc, collections: doc.collections.map((c) => (c.id === id ? next : c)) },
    next,
  );
}

/**
 * Add one item. Idempotent: adding twice is not an error and does not duplicate
 * the row — the user's intent ("this belongs here") is already satisfied, and a
 * refusal would be noise on a drag they may have repeated by accident.
 */
export function addToCollection(
  doc: FilesCollectionsDoc,
  id: string,
  itemId: string,
  now: number,
): FilesCollectionsResult {
  const target = collectionById(doc, id);
  if (!target) return refuse(doc, 'filesApp.collection.error.noSuchCollection');
  if (!itemId) return refuse(doc, 'filesApp.collection.error.noSuchItem');
  if (target.itemIds.includes(itemId)) return ok(doc, target);
  const next = touch({ ...target, itemIds: [...target.itemIds, itemId] }, now);
  return ok(
    { ...doc, collections: doc.collections.map((c) => (c.id === id ? next : c)) },
    next,
  );
}

export function removeFromCollection(
  doc: FilesCollectionsDoc,
  id: string,
  itemId: string,
  now: number,
): FilesCollectionsResult {
  const target = collectionById(doc, id);
  if (!target) return refuse(doc, 'filesApp.collection.error.noSuchCollection');
  if (!target.itemIds.includes(itemId)) {
    return refuse(doc, 'filesApp.collection.error.notInCollection');
  }
  const next = touch(
    { ...target, itemIds: target.itemIds.filter((x) => x !== itemId) },
    now,
  );
  return ok(
    { ...doc, collections: doc.collections.map((c) => (c.id === id ? next : c)) },
    next,
  );
}

/**
 * Move a collection under another, or to the top level with `null`.
 *
 * The cycle guard is the whole reason this is not a field assignment: making a
 * collection its own descendant produces a tree with an unreachable branch and
 * a walk that never terminates, and it is a single drag away in any UI.
 */
export function nestCollection(
  doc: FilesCollectionsDoc,
  id: string,
  parentId: string | null,
  now: number,
): FilesCollectionsResult {
  const target = collectionById(doc, id);
  if (!target) return refuse(doc, 'filesApp.collection.error.noSuchCollection');
  if (parentId === id) return refuse(doc, 'filesApp.collection.error.selfNest');
  if (parentId) {
    const parent = collectionById(doc, parentId);
    if (!parent) return refuse(doc, 'filesApp.collection.error.noSuchParent');
    if (ancestorsOf(doc, parentId).some((a) => a.id === id)) {
      return refuse(doc, 'filesApp.collection.error.cycle');
    }
  }
  if (siblingNameTaken(doc, parentId, target.name, id)) {
    return refuse(doc, 'filesApp.collection.error.duplicateName');
  }
  const next = touch({ ...target, parentId }, now);
  return ok(
    { ...doc, collections: doc.collections.map((c) => (c.id === id ? next : c)) },
    next,
  );
}

/**
 * Delete a collection. **No item is touched** — the container holds ids, so
 * there is nothing of the user's to remove, and gate 16's "leaves every item in
 * place" is true by construction rather than by care.
 *
 * Children are PROMOTED to the deleted collection's parent. A recursive delete
 * would take containers the user never named, and a container has no soft-delete
 * window to undo it from.
 */
export function deleteCollection(
  doc: FilesCollectionsDoc,
  id: string,
  now: number,
): FilesCollectionsResult {
  const target = collectionById(doc, id);
  if (!target) return refuse(doc, 'filesApp.collection.error.noSuchCollection');
  const promotedTo = target.parentId;
  const collections = doc.collections
    .filter((c) => c.id !== id)
    .map((c) => (c.parentId === id ? touch({ ...c, parentId: promotedTo }, now) : c));
  return ok({ ...doc, collections });
}

export interface ResolvedCollection {
  collection: FilesCollection;
  /** Ids that still resolve against the index, in the user's own order. */
  presentItemIds: string[];
  /**
   * Ids the index no longer knows. Reported as a COUNT rather than dropped: a
   * folder that quietly shrank is the shape the plan calls a finding, and the
   * user is the only one who can say whether a missing item should be forgotten.
   */
  missingItemIds: string[];
}

export function resolveCollection(
  collection: FilesCollection,
  knownItemIds: ReadonlySet<string>,
): ResolvedCollection {
  const present: string[] = [];
  const missing: string[] = [];
  for (const id of collection.itemIds) (knownItemIds.has(id) ? present : missing).push(id);
  return { collection, presentItemIds: present, missingItemIds: missing };
}

/**
 * Read a persisted document defensively.
 *
 * Anything unreadable becomes the EMPTY document rather than a throw — this is
 * called during the first render of the Files app, and a malformed store must
 * not take the window down. Unknown future versions are also read as empty:
 * silently reinterpreting a newer shape is how a downgrade eats data.
 */
export function parseCollectionsDoc(raw: unknown): FilesCollectionsDoc {
  if (!raw || typeof raw !== 'object') return EMPTY_COLLECTIONS_DOC;
  const candidate = raw as Partial<FilesCollectionsDoc>;
  if (candidate.version !== FILES_COLLECTIONS_VERSION) return EMPTY_COLLECTIONS_DOC;
  if (!Array.isArray(candidate.collections)) return EMPTY_COLLECTIONS_DOC;
  const seen = new Set<string>();
  const collections: FilesCollection[] = [];
  for (const entry of candidate.collections) {
    if (!entry || typeof entry !== 'object') continue;
    const c = entry as Partial<FilesCollection>;
    if (typeof c.id !== 'string' || !c.id || seen.has(c.id)) continue;
    if (typeof c.name !== 'string' || !c.name) continue;
    seen.add(c.id);
    collections.push({
      id: c.id,
      name: c.name,
      parentId: typeof c.parentId === 'string' ? c.parentId : null,
      itemIds: Array.isArray(c.itemIds) ? c.itemIds.filter((x): x is string => typeof x === 'string') : [],
      createdAt: typeof c.createdAt === 'number' ? c.createdAt : 0,
      modifiedAt: typeof c.modifiedAt === 'number' ? c.modifiedAt : 0,
    });
  }
  // A parent that did not survive the read would orphan its children into an
  // invisible branch, so they are promoted instead — the same rule as delete.
  const ids = new Set(collections.map((c) => c.id));
  return {
    version: FILES_COLLECTIONS_VERSION,
    collections: collections.map((c) =>
      c.parentId && !ids.has(c.parentId) ? { ...c, parentId: null } : c,
    ),
  };
}

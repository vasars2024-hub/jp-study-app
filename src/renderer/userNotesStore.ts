/**
 * The learner's notes: their own durable store, apart from the automatic
 * activity timeline.
 *
 * Before: notes shared one 500-entry localStorage FIFO with every automatic
 * mine / translation / OCR event, so about 500 mines after a note was written
 * it was silently deleted, and bodies were cut to 4,000 characters
 * (docs/SCORECARD.md bugs 5 and 6). Now:
 *
 * - **Home: IndexedDB, one record per note** (`user-note:<id>`), the way the
 *   deck keeps per-card records. One edit writes one record, so 10,000 notes
 *   cost nothing extra per keystroke, and a write made before the store finished
 *   loading can never overwrite notes it has not seen. Every IndexedDB record is
 *   in the whole-app backup (`backupSnapshot.ts` dumps the database).
 * - **No count cap, no length cap.** Nothing in this module ever shortens a
 *   title or a body or drops a note. Deleting moves a note to the trash; only
 *   "Delete forever" in the trash removes it.
 * - **A write-ahead journal** in localStorage (`USER_NOTES_JOURNAL_KEY`) holds
 *   every change until IndexedDB confirms it, written synchronously on the
 *   change itself. A window closed mid-write, or a profile where IndexedDB is
 *   unavailable, still has the note on the next start. The journal is read at
 *   module load, so its notes are visible before IndexedDB has answered.
 * - **Merging is by `changedAt`** (stamped on every change, trash and pin
 *   included): IndexedDB, the journal, other windows (BroadcastChannel) and
 *   changes made while loading all reconcile per note; the newest wins.
 *
 * Synchronous reads (`allUserNotes`, `getUserNote`) serve the in-memory copy.
 * The automatic timeline, the legacy migration and its backup live in
 * `notebookTimeline.ts`, which merges both stores for the existing readers.
 */
import { writeLocalStorage } from './localStorageWrite';
import { idbWritesBlocked, kvBatch, kvScanPrefix, type KvBatchOp } from './storage/db';
import { holdWindowUnsavedWork } from './unsavedWork';
import {
  NOTEBOOK_TIMELINE_EVENT,
  USER_NOTES_EVENT,
  USER_NOTES_JOURNAL_KEY,
  bindUserNotesStore,
} from './userNotesHandoff';
import {
  historyAfterEdit,
  noteContent,
  userNoteTags,
  normalizeUserNote,
  planNotesImport,
  sameNoteContent,
  USER_NOTE_STREAM,
  type NoteLink,
  type NotesImportPlan,
  type UserNote as SharedUserNote,
} from '../shared/userNotes';

// The event names and the journal key live in the boot-time doorway
// (`userNotesHandoff.ts`), which writes the journal before this module loads.
export { NOTEBOOK_TIMELINE_EVENT, USER_NOTES_EVENT, USER_NOTES_JOURNAL_KEY };
/** IndexedDB key prefix: one record per note. */
export const USER_NOTE_KEY_PREFIX = 'user-note:';
/** IndexedDB key prefix for the store's own bookkeeping (migration marks, legacy backups). */
export const USER_NOTES_META_PREFIX = 'user-notes.';

const CHANNEL_NAME = 'gum-user-notes';

/** A stored note. `changedAt` orders merges; `updatedAt` is the last content edit. */
export type UserNote = SharedUserNote & { changedAt?: number };

/**
 * Where a note's latest change is:
 * - `saved`: in IndexedDB;
 * - `saving`: journaled, the IndexedDB write is in flight;
 * - `local`: journaled only, because IndexedDB refused (it stays in the
 *   journal and is retried on the next start);
 * - `failed`: neither store took it. The text is still on screen; the editor
 *   says so and offers an export.
 */
export type NoteSaveState = 'saved' | 'saving' | 'local' | 'failed';

interface Journal {
  notes: Record<string, UserNote>;
  /** id → when it was deleted forever, until IndexedDB confirms the delete. */
  purged: Record<string, number>;
}

const memory = new Map<string, UserNote>();
let sortedCache: UserNote[] | null = null;
const inFlight = new Map<string, number>(); // id -> changedAt being written
const localOnly = new Set<string>();
const failedIds = new Set<string>();
const queuedPuts = new Map<string, UserNote>();
const queuedPurges = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing: Promise<void> | null = null;
let hydrated = false;
let hydration: Promise<void> | null = null;
let releaseUnsaved: (() => void) | null = null;
let channel: BroadcastChannel | null = null;
let lastStamp = 0;

/** Strictly increasing per window, so two changes in one millisecond still order. */
function stamp(): number {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

function changedAtOf(note: UserNote): number {
  return note.changedAt ?? note.updatedAt ?? note.ts ?? 0;
}

// ── journal ─────────────────────────────────────────────────────────────────

function readJournal(): Journal {
  try {
    const raw = localStorage.getItem(USER_NOTES_JOURNAL_KEY);
    if (!raw) return { notes: {}, purged: {} };
    const parsed = JSON.parse(raw) as Partial<Journal>;
    const notes: Record<string, UserNote> = {};
    if (parsed.notes && typeof parsed.notes === 'object') {
      for (const value of Object.values(parsed.notes)) {
        const note = normalizeUserNote(value) as UserNote | null;
        if (!note) continue;
        const changedAt = (value as { changedAt?: unknown }).changedAt;
        if (typeof changedAt === 'number') note.changedAt = changedAt;
        notes[note.id] = note;
      }
    }
    const purged: Record<string, number> = {};
    if (parsed.purged && typeof parsed.purged === 'object') {
      for (const [id, at] of Object.entries(parsed.purged)) if (typeof at === 'number') purged[id] = at;
    }
    return { notes, purged };
  } catch {
    return { notes: {}, purged: {} };
  }
}

/**
 * Read-modify-write of the shared journal (another window may have written it
 * since): `edit` changes the fresh copy, which is written back at once.
 */
function editJournal(edit: (journal: Journal) => void): boolean {
  const journal = readJournal();
  edit(journal);
  try {
    if (!Object.keys(journal.notes).length && !Object.keys(journal.purged).length) {
      localStorage.removeItem(USER_NOTES_JOURNAL_KEY);
      return true;
    }
  } catch {
    return false;
  }
  return writeLocalStorage(USER_NOTES_JOURNAL_KEY, JSON.stringify(journal));
}

// ── events ──────────────────────────────────────────────────────────────────

function emit(): void {
  sortedCache = null;
  try {
    window.dispatchEvent(new CustomEvent(USER_NOTES_EVENT));
    window.dispatchEvent(new CustomEvent(NOTEBOOK_TIMELINE_EVENT));
  } catch {
    /* no window (tests in node) */
  }
}

function broadcast(message: { type: 'put'; note: UserNote } | { type: 'purge'; id: string; at: number }): void {
  try {
    channel?.postMessage(message);
  } catch {
    /* a closing channel: the journal and IndexedDB still carry the change */
  }
}

function openChannel(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; note?: unknown; id?: string; at?: number } | null;
      if (data?.type === 'put' && data.note) {
        const note = withChangedAt(data.note);
        if (note && mergeIntoMemory(note)) emit();
      } else if (data?.type === 'purge' && typeof data.id === 'string') {
        const current = memory.get(data.id);
        if (current && changedAtOf(current) <= (data.at ?? 0)) {
          memory.delete(data.id);
          emit();
        }
      }
    };
  } catch {
    channel = null;
  }
}

function withChangedAt(raw: unknown): UserNote | null {
  const note = normalizeUserNote(raw) as UserNote | null;
  if (!note) return null;
  const changedAt = (raw as { changedAt?: unknown }).changedAt;
  if (typeof changedAt === 'number') note.changedAt = changedAt;
  return note;
}

/** Keep `note` if it is newer than what memory holds. True when memory changed. */
function mergeIntoMemory(note: UserNote): boolean {
  const current = memory.get(note.id);
  if (current && changedAtOf(current) >= changedAtOf(note)) return false;
  memory.set(note.id, note);
  return true;
}

// ── durable writes ──────────────────────────────────────────────────────────

function holdUnsaved(): void {
  const busy = queuedPuts.size > 0 || queuedPurges.size > 0 || inFlight.size > 0;
  if (busy && !releaseUnsaved) releaseUnsaved = holdWindowUnsavedWork('note-editor');
  else if (!busy && releaseUnsaved) {
    releaseUnsaved();
    releaseUnsaved = null;
  }
}

function scheduleFlush(): void {
  holdUnsaved();
  if (flushTimer != null) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushDurable();
  }, 0);
}

async function flushDurable(): Promise<void> {
  if (flushing) {
    await flushing;
    if (!queuedPuts.size && !queuedPurges.size) return;
  }
  const puts = [...queuedPuts.values()];
  const purges = [...queuedPurges.entries()];
  queuedPuts.clear();
  queuedPurges.clear();
  if (!puts.length && !purges.length) {
    holdUnsaved();
    return;
  }
  for (const note of puts) inFlight.set(note.id, changedAtOf(note));
  const ops: KvBatchOp[] = [
    ...puts.map((note) => ({ type: 'put' as const, key: USER_NOTE_KEY_PREFIX + note.id, value: note })),
    ...purges.map(([id]) => ({ type: 'delete' as const, key: USER_NOTE_KEY_PREFIX + id })),
  ];
  const run = (async () => {
    let ok = true;
    try {
      // A restore in progress drops IndexedDB writes without an error; that is
      // not "saved", so the journal must keep the change.
      if (idbWritesBlocked()) throw new Error('IndexedDB writes are paused for a restore');
      await kvBatch(ops);
    } catch (err) {
      ok = false;
      console.warn('[notes] IndexedDB write failed; the journal keeps the change:', err instanceof Error ? err.message : String(err));
    }
    if (!ok && puts.length) {
      // A bulk write skipped the journal (import, migration); now it must not.
      const journaled = editJournal((journal) => {
        for (const note of puts) {
          const entry = journal.notes[note.id];
          if (!entry || changedAtOf(entry) < changedAtOf(note)) journal.notes[note.id] = note;
        }
      });
      if (!journaled) for (const note of puts) failedIds.add(note.id);
    }
    for (const note of puts) {
      if (inFlight.get(note.id) === changedAtOf(note)) inFlight.delete(note.id);
      if (ok) {
        localOnly.delete(note.id);
        failedIds.delete(note.id);
      } else if (!failedIds.has(note.id)) localOnly.add(note.id);
    }
    if (ok) {
      // Retire journal entries this write made durable (and nothing newer).
      editJournal((journal) => {
        for (const note of puts) {
          const entry = journal.notes[note.id];
          if (entry && changedAtOf(entry) <= changedAtOf(note)) delete journal.notes[note.id];
        }
        for (const [id, at] of purges) if ((journal.purged[id] ?? Infinity) <= at) delete journal.purged[id];
      });
    }
  })();
  flushing = run;
  try {
    await run;
  } finally {
    if (flushing === run) flushing = null;
    holdUnsaved();
    emit();
  }
}

/**
 * Record changes: memory now, journal now, IndexedDB on the next tick.
 *
 * `journal: false` is for bulk writes whose source survives until IndexedDB
 * confirms them anyway (an import file, the old timeline during migration):
 * journaling ten thousand notes into localStorage would only risk its quota.
 */
function commitMany(notes: readonly UserNote[], opts: { journal?: boolean } = {}): void {
  if (!notes.length) return;
  for (const note of notes) memory.set(note.id, note);
  if (opts.journal !== false) {
    const journaled = editJournal((journal) => {
      for (const note of notes) {
        const entry = journal.notes[note.id];
        if (!entry || changedAtOf(entry) <= changedAtOf(note)) journal.notes[note.id] = note;
        delete journal.purged[note.id];
      }
    });
    for (const note of notes) {
      if (journaled) failedIds.delete(note.id);
      else failedIds.add(note.id);
    }
  }
  for (const note of notes) {
    queuedPuts.set(note.id, note);
    broadcast({ type: 'put', note });
  }
  scheduleFlush();
  emit();
}

function commit(note: UserNote): UserNote {
  commitMany([note]);
  return note;
}

// ── loading ─────────────────────────────────────────────────────────────────

function seedFromJournal(): void {
  const journal = readJournal();
  for (const note of Object.values(journal.notes)) mergeIntoMemory(note);
  for (const [id, at] of Object.entries(journal.purged)) {
    const current = memory.get(id);
    if (current && changedAtOf(current) <= at) memory.delete(id);
  }
}

async function hydrate(): Promise<void> {
  let records: Array<[string, unknown]> = [];
  let idbOk = true;
  try {
    records = await kvScanPrefix(USER_NOTE_KEY_PREFIX);
  } catch (err) {
    idbOk = false;
    console.warn('[notes] could not read notes from IndexedDB; using the local journal:', err instanceof Error ? err.message : String(err));
  }
  for (const [, value] of records) {
    const note = withChangedAt(value);
    if (note) mergeIntoMemory(note);
  }
  // The journal again: another window may have written it since module load.
  const journal = readJournal();
  for (const note of Object.values(journal.notes)) {
    mergeIntoMemory(note);
    const current = memory.get(note.id);
    if (current) {
      queuedPuts.set(current.id, current);
      if (!idbOk) localOnly.add(current.id);
    }
  }
  for (const [id, at] of Object.entries(journal.purged)) {
    const current = memory.get(id);
    if (current && changedAtOf(current) <= at) memory.delete(id);
    queuedPurges.set(id, at);
  }
  hydrated = true;
  if (queuedPuts.size || queuedPurges.size) scheduleFlush();
  emit();
}

/** Resolves once IndexedDB has been read (or found unavailable). Starts loading if needed. */
export function whenUserNotesReady(): Promise<void> {
  if (!hydration) hydration = hydrate();
  return hydration;
}

export function userNotesHydrated(): boolean {
  return hydrated;
}

/** Land every queued change in IndexedDB now (backups, tests, closing editors). */
export async function flushUserNotes(): Promise<void> {
  if (flushTimer != null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flushDurable();
}

// ── reading ─────────────────────────────────────────────────────────────────

/** Every note, newest first. The trash is left out unless asked for. */
export function allUserNotes(opts: { includeTrashed?: boolean } = {}): UserNote[] {
  if (!sortedCache) sortedCache = [...memory.values()].sort((a, b) => b.ts - a.ts || (a.id < b.id ? -1 : 1));
  return opts.includeTrashed ? sortedCache.slice() : sortedCache.filter((n) => !n.deletedAt);
}

/** One note by id, trash included; null when there is none. */
export function getUserNote(id: string): UserNote | null {
  return memory.get(id) ?? null;
}

export function userNoteSaveState(id: string): NoteSaveState {
  if (failedIds.has(id)) return 'failed';
  if (queuedPuts.has(id) || inFlight.has(id)) return 'saving';
  if (localOnly.has(id)) return 'local';
  return 'saved';
}

export function onUserNotesChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(USER_NOTES_EVENT, handler);
  return () => window.removeEventListener(USER_NOTES_EVENT, handler);
}

// ── writing ─────────────────────────────────────────────────────────────────

let idSeq = 0;
export function newUserNoteId(): string {
  idSeq += 1;
  return `note-${Date.now().toString(36)}-${idSeq.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export interface NewUserNote {
  id?: string;
  stream?: string;
  title?: string;
  detail?: string;
  folder?: string;
  tags?: string[] | string;
  links?: NoteLink[];
  href?: string;
  origin?: 'app' | 'extension';
  meta?: Record<string, string | number | boolean | undefined>;
  ts?: number;
  pinned?: boolean;
}

/** A new note, in full. An id already in use updates that note instead (with a version kept). */
export function createUserNote(input: NewUserNote): UserNote {
  const id = input.id ?? newUserNoteId();
  const existing = memory.get(id);
  if (existing) {
    return (
      updateUserNote(id, { title: input.title ?? existing.title, detail: input.detail ?? existing.detail }, { checkpoint: true }) ?? existing
    );
  }
  const at = stamp();
  const note: UserNote = {
    id,
    stream: input.stream ?? USER_NOTE_STREAM,
    title: input.title ?? '',
    ts: input.ts ?? at,
    updatedAt: at,
    changedAt: at,
  };
  if (input.detail !== undefined) note.detail = input.detail;
  if (input.folder) note.folder = input.folder;
  const tags = userNoteTags(input.tags);
  if (tags.length) note.tags = tags;
  if (input.links?.length) note.links = input.links;
  if (input.href) note.href = input.href;
  if (input.origin) note.origin = input.origin;
  if (input.meta) note.meta = input.meta;
  if (input.pinned) note.pinned = true;
  return commit(note);
}

export type UserNotePatch = Partial<Pick<UserNote, 'title' | 'detail' | 'folder' | 'links' | 'pinned' | 'href'>> & {
  tags?: string[] | string;
};

/**
 * Change a note. A content change (title, body, tags, folder) may keep the old
 * content as a version: always with `checkpoint`, otherwise at most every few
 * minutes (`historyAfterEdit`). Null when there is no such note.
 */
export function updateUserNote(id: string, patch: UserNotePatch, opts: { checkpoint?: boolean } = {}): UserNote | null {
  const prev = memory.get(id);
  if (!prev) return null;
  const next: UserNote = { ...prev };
  if (patch.title !== undefined) next.title = patch.title;
  if (patch.detail !== undefined) next.detail = patch.detail;
  if (patch.folder !== undefined) {
    if (patch.folder) next.folder = patch.folder;
    else delete next.folder;
  }
  if (patch.tags !== undefined) {
    const tags = userNoteTags(patch.tags);
    if (tags.length) next.tags = tags;
    else delete next.tags;
  }
  if (patch.links !== undefined) {
    if (patch.links.length) next.links = patch.links;
    else delete next.links;
  }
  if (patch.pinned !== undefined) {
    if (patch.pinned) next.pinned = true;
    else delete next.pinned;
  }
  if (patch.href !== undefined) {
    if (patch.href) next.href = patch.href;
    else delete next.href;
  }
  const contentChanged = !sameNoteContent(prev, next);
  const otherChanged =
    JSON.stringify([prev.links ?? null, prev.pinned ?? null, prev.href ?? null]) !==
    JSON.stringify([next.links ?? null, next.pinned ?? null, next.href ?? null]);
  if (!contentChanged && !otherChanged) return prev;
  const at = stamp();
  if (contentChanged) {
    const history = historyAfterEdit(prev, at, Boolean(opts.checkpoint));
    if (history?.length) next.history = history;
    next.updatedAt = at;
  }
  next.changedAt = at;
  return commit(next);
}

/** Move a note to the trash. Nothing is removed. */
export function trashUserNote(id: string): boolean {
  const prev = memory.get(id);
  if (!prev || prev.deletedAt) return false;
  const at = stamp();
  commit({ ...prev, deletedAt: at, changedAt: at });
  return true;
}

/** Bring a note back from the trash. */
export function restoreUserNote(id: string): boolean {
  const prev = memory.get(id);
  if (!prev || !prev.deletedAt) return false;
  const next: UserNote = { ...prev, changedAt: stamp() };
  delete next.deletedAt;
  commit(next);
  return true;
}

/** Delete forever. Only from the trash: a live note has to be trashed first. */
export function purgeUserNote(id: string): boolean {
  const prev = memory.get(id);
  if (!prev || !prev.deletedAt) return false;
  const at = stamp();
  memory.delete(id);
  queuedPuts.delete(id);
  editJournal((journal) => {
    delete journal.notes[id];
    journal.purged[id] = at;
  });
  queuedPurges.set(id, at);
  scheduleFlush();
  broadcast({ type: 'purge', id, at });
  emit();
  return true;
}

/**
 * Drop a note that was created and left completely empty (no title, body,
 * tags, links or history), so "New note" clicked and abandoned leaves no
 * blank rows behind. Anything with content is left alone.
 */
export function discardEmptyUserNote(id: string): boolean {
  const note = memory.get(id);
  if (!note || note.deletedAt) return false;
  if (note.title.trim() || (note.detail ?? '').trim() || note.tags?.length || note.links?.length || note.history?.length) return false;
  const at = stamp();
  memory.set(id, { ...note, deletedAt: at, changedAt: at });
  return purgeUserNote(id);
}

/** Make an earlier version current again. The replaced content becomes a version itself. */
export function restoreUserNoteVersion(id: string, versionAt: number): UserNote | null {
  const prev = memory.get(id);
  const version = prev?.history?.find((h) => h.at === versionAt);
  if (!prev || !version) return null;
  return updateUserNote(
    id,
    { title: version.title, detail: version.detail, tags: version.tags ?? [], folder: version.folder ?? '' },
    { checkpoint: true },
  );
}

/** Merge imported notes (see `planNotesImport`): nothing on either side is lost. */
export function importUserNotes(imported: readonly SharedUserNote[]): NotesImportPlan {
  const plan = planNotesImport(memory as ReadonlyMap<string, SharedUserNote>, imported);
  commitMany(plan.writes.map((note) => ({ ...note, changedAt: stamp() })), { journal: false });
  return plan;
}

/**
 * The migration's entry point: notes recovered from the old shared timeline.
 * A note not here yet is added as it was; one already here keeps its content
 * and gains the recovered text as a version if it differs. Resolves with the
 * ids IndexedDB now holds, which the caller may remove from the old list.
 */
export async function adoptLegacyNotes(notes: readonly SharedUserNote[]): Promise<string[]> {
  await whenUserNotesReady();
  const writes: UserNote[] = [];
  const { purged } = readJournal();
  for (const legacy of notes) {
    const current = memory.get(legacy.id);
    // Deleted forever since: the old list must not bring it back.
    if (!current && purged[legacy.id] !== undefined) continue;
    if (!current) {
      writes.push({ ...legacy, changedAt: stamp() });
      continue;
    }
    if (sameNoteContent(current, legacy) || (current.history ?? []).some((h) => sameNoteContent(h, legacy))) continue;
    const history = [{ ...noteContent(legacy), at: legacy.updatedAt }, ...(current.history ?? [])].sort((a, b) => b.at - a.at);
    writes.push({ ...current, history, changedAt: stamp() });
  }
  commitMany(writes, { journal: false });
  await flushUserNotes();
  return notes
    .map((n) => n.id)
    .filter((id) => (memory.has(id) ? userNoteSaveState(id) === 'saved' : purged[id] !== undefined));
}

/**
 * A note `userNotesHandoff.ts` saved before this module loaded: already in
 * the journal (when `journaled`), and so usually already in memory from
 * `seedFromJournal`. Make it what `createUserNote` would have made it: in
 * memory, told to other windows, and on its way to IndexedDB.
 */
export function adoptHandedNote(note: UserNote, journaled: boolean): void {
  const handed = withChangedAt(note);
  if (!handed) return;
  mergeIntoMemory(handed);
  // A newer change made since (here or in another window) is what gets written.
  const current = memory.get(handed.id);
  if (!current) return;
  if (journaled) failedIds.delete(current.id);
  else if (current === handed) failedIds.add(current.id);
  queuedPuts.set(current.id, current);
  broadcast({ type: 'put', note: current });
  scheduleFlush();
  emit();
}

// ── tests ───────────────────────────────────────────────────────────────────

export function resetUserNotesForTests(): void {
  memory.clear();
  sortedCache = null;
  inFlight.clear();
  localOnly.clear();
  failedIds.clear();
  queuedPuts.clear();
  queuedPurges.clear();
  if (flushTimer != null) clearTimeout(flushTimer);
  flushTimer = null;
  flushing = null;
  hydrated = false;
  hydration = null;
  releaseUnsaved?.();
  releaseUnsaved = null;
  lastStamp = 0;
  seedFromJournal();
}

// ── module start ────────────────────────────────────────────────────────────

bindUserNotesStore({ createUserNote, adoptHandedNote });

if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
  seedFromJournal();
  openChannel();
}

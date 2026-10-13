/**
 * User notes: the pure half (no storage, no DOM).
 *
 * Notes the learner writes or saves ("Save as note" in Translate, the media
 * assistant, sentence-analysis snapshots, Blanc Quick Notes, the Notes app)
 * used to live in the same 500-entry FIFO as the automatic mining / lookup /
 * translation events, so about 500 mines after a note was written it was
 * silently deleted, and every body was cut to 4,000 characters (SCORECARD bugs
 * 5 and 6). They now have their own durable store (`renderer/userNotesStore.ts`)
 * with no count cap and no length cap. This module holds what that store, the
 * migration and the Notes UI share and what the tests pin down:
 *
 * - which old timeline rows are notes (`isUserNoteEntry`),
 * - repairing a stored or imported note (`normalizeUserNote`),
 * - search, tags, edit history,
 * - Markdown / JSON export and import, with an exact round trip,
 * - the small, safe Markdown subset note bodies are rendered with.
 */
import { USER_NOTE_STREAM, type NoteEntryLike } from './userNoteKinds';

// Which timeline rows are notes: split out so the boot path need not load this module.
export { ACTIVITY_TIMELINE_CAP, USER_NOTE_STREAM, isUserNoteEntry, type NoteEntryLike } from './userNoteKinds';

/** Edit history kept per note. Older versions beyond this are folded away; the UI says so. */
export const NOTE_HISTORY_LIMIT = 50;
/** Autosave makes a restorable version at most this often (an explicit Save always does). */
export const NOTE_REVISION_INTERVAL_MS = 5 * 60_000;
/**
 * A very large body still saves in full. Past this many characters the editor
 * shows a warning (typing gets slower, exports get big). It is never a cut.
 */
export const NOTE_BODY_SOFT_LIMIT = 1_000_000;
export const NOTES_EXPORT_KIND = 'gum-notes';
export const NOTES_EXPORT_VERSION = 1;

export type NoteLink =
  | { kind: 'card'; id: string; label: string }
  | { kind: 'url'; url: string; label: string }
  | { kind: 'section'; href: string; label: string };

/** One earlier version of a note. */
export interface NoteRevision {
  at: number;
  title: string;
  detail: string;
  tags?: string[];
  folder?: string;
}

export interface UserNoteFields {
  /** Last content change. `ts` stays the creation time. */
  updatedAt: number;
  tags?: string[];
  links?: NoteLink[];
  pinned?: boolean;
  /** In the trash since. Absent = live. Nothing leaves the trash without the user saying so. */
  deletedAt?: number;
  /** Newest first. */
  history?: NoteRevision[];
}

export type UserNote<E extends NoteEntryLike = NoteEntryLike> = E & UserNoteFields;

// ── normalising ─────────────────────────────────────────────────────────────

function str(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** `#Kanji, grammar ,kanji` → `['Kanji', 'grammar']` (case-insensitive dedupe, first spelling wins). */
export function userNoteTags(input: string | readonly unknown[] | undefined | null): string[] {
  const raw = typeof input === 'string' ? input.split(/[,、，\n]/) : Array.isArray(input) ? input : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const tag = item.trim().replace(/^#+/, '').trim();
    if (!tag) continue;
    const key = tag.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/** An http(s) or mailto URL, or null. Notes come from arbitrary pages; nothing else is ever opened. */
export function safeNoteUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') return url.href;
  } catch {
    /* not a URL */
  }
  return null;
}

function normalizeLink(raw: unknown): NoteLink | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const label = str(r.label) ?? '';
  if (r.kind === 'card' && str(r.id)) return { kind: 'card', id: r.id as string, label };
  if (r.kind === 'url') {
    const url = safeNoteUrl(r.url);
    return url ? { kind: 'url', url, label } : null;
  }
  if (r.kind === 'section' && str(r.href)) return { kind: 'section', href: r.href as string, label };
  return null;
}

function normalizeRevision(raw: unknown): NoteRevision | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const at = num(r.at);
  if (at === undefined) return null;
  const rev: NoteRevision = { at, title: str(r.title) ?? '', detail: str(r.detail) ?? '' };
  const tags = userNoteTags(r.tags as unknown[]);
  if (tags.length) rev.tags = tags;
  if (str(r.folder)) rev.folder = r.folder as string;
  return rev;
}

/**
 * A stored, migrated or imported note, repaired into a valid shape — or null
 * when it has no id. Never shortens the title or body.
 */
export function normalizeUserNote(raw: unknown, now = Date.now()): UserNote | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id);
  if (!id) return null;
  const ts = num(r.ts) ?? num(r.createdAt) ?? now;
  const note: UserNote = {
    id,
    stream: str(r.stream) ?? USER_NOTE_STREAM,
    title: str(r.title) ?? '',
    ts,
    updatedAt: num(r.updatedAt) ?? ts,
  };
  const detail = str(r.detail) ?? str(r.body);
  if (detail !== undefined) note.detail = detail;
  if (str(r.folder)) note.folder = r.folder as string;
  if (r.origin === 'app' || r.origin === 'extension') note.origin = r.origin;
  if (str(r.href)) note.href = r.href as string;
  if (r.meta && typeof r.meta === 'object' && !Array.isArray(r.meta)) {
    const meta: Record<string, string | number | boolean | undefined> = {};
    for (const [k, v] of Object.entries(r.meta as Record<string, unknown>)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') meta[k] = v;
    }
    if (Object.keys(meta).length) note.meta = meta;
  }
  const tags = userNoteTags(r.tags as unknown[]);
  if (tags.length) note.tags = tags;
  if (Array.isArray(r.links)) {
    const links = r.links.map(normalizeLink).filter((l): l is NoteLink => l !== null);
    if (links.length) note.links = links;
  }
  if (r.pinned === true) note.pinned = true;
  const deletedAt = num(r.deletedAt);
  if (deletedAt !== undefined) note.deletedAt = deletedAt;
  if (Array.isArray(r.history)) {
    const history = r.history.map(normalizeRevision).filter((h): h is NoteRevision => h !== null);
    if (history.length) note.history = history.slice(0, NOTE_HISTORY_LIMIT);
  }
  return note;
}

// ── edit history ────────────────────────────────────────────────────────────

/** The parts of a note that make a version. */
export function noteContent(note: Pick<UserNote, 'title' | 'detail' | 'tags' | 'folder'>): NoteRevision {
  const rev: NoteRevision = { at: 0, title: note.title ?? '', detail: note.detail ?? '' };
  if (note.tags?.length) rev.tags = [...note.tags];
  if (note.folder) rev.folder = note.folder;
  return rev;
}

export function sameNoteContent(
  a: Pick<UserNote, 'title' | 'detail' | 'tags' | 'folder'>,
  b: Pick<UserNote, 'title' | 'detail' | 'tags' | 'folder'>,
): boolean {
  return (
    (a.title ?? '') === (b.title ?? '') &&
    (a.detail ?? '') === (b.detail ?? '') &&
    (a.folder ?? '') === (b.folder ?? '') &&
    (a.tags ?? []).join('\u0000') === (b.tags ?? []).join('\u0000')
  );
}

/**
 * The history after `prev` is replaced by new content at `now`. The previous
 * content becomes a version when the change is explicit (`checkpoint`) or the
 * newest version is older than `NOTE_REVISION_INTERVAL_MS`, so autosave on
 * every pause does not fill the history with keystrokes.
 */
export function historyAfterEdit(prev: UserNote, now: number, checkpoint: boolean): NoteRevision[] | undefined {
  const history = prev.history ?? [];
  const newest = history[0];
  const due = checkpoint || !newest || now - newest.at >= NOTE_REVISION_INTERVAL_MS;
  if (!due) return history.length ? history : undefined;
  if (newest && sameNoteContent(newest, prev)) return history;
  return [{ ...noteContent(prev), at: prev.updatedAt }, ...history].slice(0, NOTE_HISTORY_LIMIT);
}

// ── search ──────────────────────────────────────────────────────────────────

/** Width-, case- and kana-insensitive form for search (ア and あ match, Ａ and a match). */
export function noteSearchKey(text: string): string {
  return text
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));
}

export interface NoteQuery {
  query?: string;
  tag?: string | null;
  folder?: string | null;
  /** true: only the trash; false (default): only live notes. */
  trash?: boolean;
}

function haystack(note: UserNote): string {
  return noteSearchKey(
    [note.title, note.detail ?? '', note.folder ?? '', ...(note.tags ?? []), ...(note.links ?? []).map((l) => l.label)].join('\n'),
  );
}

/** Every word must match; `#word` matches a tag. Results: pinned first, then newest edit. */
export function searchUserNotes<N extends UserNote>(notes: readonly N[], q: NoteQuery = {}): N[] {
  const words = noteSearchKey(q.query ?? '').split(/\s+/).filter(Boolean);
  const tag = q.tag ? noteSearchKey(q.tag) : null;
  const out = notes.filter((note) => {
    if (Boolean(note.deletedAt) !== Boolean(q.trash)) return false;
    if (q.folder != null && q.folder !== '' && (note.folder ?? '') !== q.folder) return false;
    const tags = (note.tags ?? []).map(noteSearchKey);
    if (tag && !tags.includes(tag)) return false;
    if (!words.length) return true;
    const text = haystack(note);
    return words.every((w) => (w.startsWith('#') && w.length > 1 ? tags.some((t) => t.startsWith(w.slice(1))) : text.includes(w)));
  });
  return out.sort((a, b) => {
    if (q.trash) return (b.deletedAt ?? 0) - (a.deletedAt ?? 0);
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return b.updatedAt - a.updatedAt || b.ts - a.ts;
  });
}

/** Tag → count over live notes, most used first. */
export function noteTagCounts(notes: readonly UserNote[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const note of notes) {
    if (note.deletedAt) continue;
    for (const tag of note.tags ?? []) {
      const key = tag.toLocaleLowerCase();
      const hit = counts.get(key);
      if (hit) hit.count += 1;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Folder → count over live notes. */
export function noteFolderCounts(notes: readonly UserNote[]): Array<{ folder: string; count: number }> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.deletedAt || !note.folder) continue;
    counts.set(note.folder, (counts.get(note.folder) ?? 0) + 1);
  }
  return [...counts.entries()].map(([folder, count]) => ({ folder, count })).sort((a, b) => b.count - a.count || a.folder.localeCompare(b.folder));
}

// ── export / import ─────────────────────────────────────────────────────────

export interface NotesExportFile {
  kind: typeof NOTES_EXPORT_KIND;
  version: typeof NOTES_EXPORT_VERSION;
  exportedAt: number;
  notes: UserNote[];
}

/** Everything, trash and history included: the lossless format. */
export function notesToJson(notes: readonly UserNote[], now = Date.now()): string {
  const file: NotesExportFile = { kind: NOTES_EXPORT_KIND, version: NOTES_EXPORT_VERSION, exportedAt: now, notes: [...notes] };
  return JSON.stringify(file, null, 2);
}

const MD_MARKER = /^<!-- gum-note (\{.*\}) -->$/;

/**
 * Readable Markdown, one section per note. Each note starts with a one-line
 * HTML comment carrying its id, dates, folder, tags, links and body length, so
 * an unedited export re-imports exactly (the body is taken by length, which is
 * immune to a body that itself contains a marker line). A file edited by hand
 * still imports: the length check fails and the next marker ends the body.
 */
export function notesToMarkdown(notes: readonly UserNote[]): string {
  const parts: string[] = [];
  for (const note of notes) {
    const meta: Record<string, unknown> = {
      id: note.id,
      stream: note.stream,
      ts: note.ts,
      updatedAt: note.updatedAt,
      len: (note.detail ?? '').length,
    };
    if (note.folder) meta.folder = note.folder;
    if (note.tags?.length) meta.tags = note.tags;
    if (note.links?.length) meta.links = note.links;
    if (note.pinned) meta.pinned = true;
    if (note.href) meta.href = note.href;
    if (note.origin) meta.origin = note.origin;
    if (note.meta) meta.meta = note.meta;
    if (note.deletedAt) meta.deletedAt = note.deletedAt;
    const title = note.title.replace(/\r?\n/g, ' ');
    parts.push(`<!-- gum-note ${JSON.stringify(meta).replace(/-->/g, '--\\u003e')} -->\n# ${title}\n\n${note.detail ?? ''}\n`);
  }
  return parts.join('\n');
}

export class NotesImportError extends Error {
  constructor(readonly reason: 'empty' | 'unreadable') {
    super(reason);
    this.name = 'NotesImportError';
  }
}

function parseMarkdownNotes(text: string, fileName: string, now: number): UserNote[] {
  const src = text.replace(/\r\n/g, '\n');
  const lines = src.split('\n');
  const markers: Array<{ line: number; meta: Record<string, unknown> }> = [];
  lines.forEach((line, i) => {
    const m = MD_MARKER.exec(line);
    if (!m) return;
    try {
      const meta = JSON.parse(m[1]) as Record<string, unknown>;
      if (meta && typeof meta === 'object') markers.push({ line: i, meta });
    } catch {
      /* a marker-looking line in a body: not a marker */
    }
  });
  if (!markers.length) {
    // A plain Markdown file: one note, titled by its first heading or its file name.
    const body = src.trim();
    if (!body) return [];
    const heading = /^#{1,6}\s+(.+)$/m.exec(body);
    const firstLine = body.split('\n')[0];
    const title = heading && body.startsWith(heading[0]) ? heading[1].trim() : fileName.replace(/\.(md|markdown|txt)$/i, '') || firstLine.slice(0, 80);
    const detail = heading && body.startsWith(heading[0]) ? body.slice(heading[0].length).replace(/^\n+/, '') : body;
    return [{ id: newImportId(now, 0), stream: USER_NOTE_STREAM, title, detail, ts: now, updatedAt: now }];
  }
  // Character offset of each line start, to take bodies by length.
  const offsets: number[] = [];
  let at = 0;
  for (const line of lines) {
    offsets.push(at);
    at += line.length + 1;
  }
  const out: UserNote[] = [];
  // Where the previous note's body ended: a marker-looking line before it is body text.
  let consumedTo = 0;
  for (let k = 0; k < markers.length; k++) {
    const marker = markers[k];
    if (offsets[marker.line] < consumedTo) continue;
    const titleLine = lines[marker.line + 1] ?? '';
    const title = titleLine.replace(/^#\s?/, '');
    const bodyStart = Math.min((offsets[marker.line + 2] ?? src.length) + 1, src.length); // "# title\n" + "\n"
    const len = num(marker.meta.len);
    let detail: string | null = null;
    if (len !== undefined) {
      // Exact: the body by its recorded length, if what follows is the separator and then
      // another marker or the end of the file.
      const end = bodyStart + len;
      const after = src.slice(end);
      const sep = /^\n\n?/.exec(after)?.[0] ?? '';
      const rest = after.slice(sep.length);
      if (end <= src.length && (rest === '' || MD_MARKER.test(rest.split('\n')[0]))) {
        detail = src.slice(bodyStart, end);
        consumedTo = end + sep.length;
      }
    }
    if (detail === null) {
      // Edited by hand: the body runs to the next marker.
      const next = markers.slice(k + 1).find((m) => offsets[m.line] > bodyStart);
      const nextStart = next ? offsets[next.line] : src.length;
      detail = src.slice(bodyStart, Math.max(bodyStart, nextStart)).replace(/\n+$/, '');
      consumedTo = nextStart;
    }
    const note = normalizeUserNote({ ...marker.meta, title, detail }, now);
    if (note) out.push(note);
  }
  return out;
}

let importSeq = 0;
function newImportId(now: number, i: number): string {
  importSeq += 1;
  return `note-${now.toString(36)}-${i.toString(36)}${importSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Notes from an exported JSON or Markdown file (or any plain .md / .txt). */
export function parseNotesImport(text: string, fileName = '', now = Date.now()): UserNote[] {
  const trimmed = text.replace(/^\uFEFF/, '').trim();
  if (!trimmed) throw new NotesImportError('empty');
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new NotesImportError('unreadable');
    }
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object' && Array.isArray((parsed as { notes?: unknown }).notes)
        ? (parsed as { notes: unknown[] }).notes
        : null;
    if (!list) throw new NotesImportError('unreadable');
    const notes = list.map((n) => normalizeUserNote(n, now)).filter((n): n is UserNote => n !== null);
    if (!notes.length) throw new NotesImportError('empty');
    return notes;
  }
  const notes = parseMarkdownNotes(text.replace(/^\uFEFF/, ''), fileName, now);
  if (!notes.length) throw new NotesImportError('empty');
  return notes;
}

export interface NotesImportPlan {
  /** Every note to write (new ids, and existing ids whose content moved). */
  writes: UserNote[];
  added: number;
  updated: number;
  /** Already present with the same content. */
  unchanged: number;
  /** The note here was newer; the imported version was kept in its history instead. */
  keptAsVersion: number;
}

/**
 * Merge imported notes into existing ones without losing either side: a newer
 * import replaces the content and the replaced content becomes a version; an
 * older import becomes a version of the newer note. Same content: nothing.
 */
export function planNotesImport(existing: ReadonlyMap<string, UserNote>, imported: readonly UserNote[]): NotesImportPlan {
  const plan: NotesImportPlan = { writes: [], added: 0, updated: 0, unchanged: 0, keptAsVersion: 0 };
  const seen = new Map<string, UserNote>();
  for (const incoming of imported) {
    const current = seen.get(incoming.id) ?? existing.get(incoming.id);
    if (!current) {
      plan.writes.push(incoming);
      seen.set(incoming.id, incoming);
      plan.added += 1;
      continue;
    }
    if (sameNoteContent(current, incoming)) {
      plan.unchanged += 1;
      continue;
    }
    const hasVersion = (note: UserNote, rev: Pick<UserNote, 'title' | 'detail' | 'tags' | 'folder'>): boolean =>
      (note.history ?? []).some((h) => sameNoteContent(h, rev));
    let merged: UserNote;
    if (incoming.updatedAt > current.updatedAt) {
      const history = hasVersion(incoming, current)
        ? incoming.history ?? []
        : [{ ...noteContent(current), at: current.updatedAt }, ...(incoming.history ?? [])];
      merged = { ...current, ...incoming, history: dedupeHistory(history, current.history) };
      plan.updated += 1;
    } else {
      if (hasVersion(current, incoming)) {
        plan.unchanged += 1;
        continue;
      }
      const history = [{ ...noteContent(incoming), at: incoming.updatedAt }, ...(current.history ?? [])];
      merged = { ...current, history: dedupeHistory(history, incoming.history) };
      plan.keptAsVersion += 1;
    }
    seen.set(merged.id, merged);
    const at = plan.writes.findIndex((w) => w.id === merged.id);
    if (at >= 0) plan.writes[at] = merged;
    else plan.writes.push(merged);
  }
  return plan;
}

function dedupeHistory(primary: readonly NoteRevision[], extra: readonly NoteRevision[] | undefined): NoteRevision[] | undefined {
  const out: NoteRevision[] = [];
  for (const rev of [...primary, ...(extra ?? [])]) {
    if (out.some((r) => r.at === rev.at && sameNoteContent(r, rev))) continue;
    out.push(rev);
  }
  out.sort((a, b) => b.at - a.at);
  return out.length ? out.slice(0, NOTE_HISTORY_LIMIT) : undefined;
}

// ── Markdown subset for display ────────────────────────────────────────────

export type NoteInline =
  | { t: 'text'; v: string }
  | { t: 'strong'; v: string }
  | { t: 'em'; v: string }
  | { t: 'code'; v: string }
  | { t: 'link'; label: string; url: string };

export type NoteBlock =
  | { type: 'heading'; level: 1 | 2 | 3; inline: NoteInline[] }
  | { type: 'paragraph'; inline: NoteInline[] }
  | { type: 'quote'; inline: NoteInline[] }
  | { type: 'code'; text: string }
  | { type: 'list'; ordered: boolean; items: Array<{ checked?: boolean; inline: NoteInline[] }> };

const INLINE_RE = /(\*\*([^*\n]+)\*\*)|(`([^`\n]+)`)|(\[([^\]\n]+)\]\(([^)\s]+)\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"、。])|(\*([^*\n]+)\*)|((?<![A-Za-z0-9_])_([^_\n]+)_(?![A-Za-z0-9_]))/g;

/** Inline Markdown → tokens. Only http(s)/mailto links become links; any other target stays text. */
export function parseNoteInline(text: string): NoteInline[] {
  const out: NoteInline[] = [];
  let last = 0;
  const push = (token: NoteInline): void => {
    const prev = out[out.length - 1];
    if (token.t === 'text' && prev?.t === 'text') prev.v += token.v;
    else out.push(token);
  };
  for (const m of text.matchAll(INLINE_RE)) {
    const at = m.index ?? 0;
    if (at > last) push({ t: 'text', v: text.slice(last, at) });
    if (m[1]) push({ t: 'strong', v: m[2] });
    else if (m[3]) push({ t: 'code', v: m[4] });
    else if (m[5]) {
      const url = safeNoteUrl(m[7]);
      push(url ? { t: 'link', label: m[6], url } : { t: 'text', v: m[0] });
    } else if (m[8]) {
      const url = safeNoteUrl(m[8]);
      push(url ? { t: 'link', label: m[8], url } : { t: 'text', v: m[0] });
    } else if (m[9]) push({ t: 'em', v: m[10] });
    else if (m[11]) push({ t: 'em', v: m[12] });
    last = at + m[0].length;
  }
  if (last < text.length) push({ t: 'text', v: text.slice(last) });
  return out;
}

const LIST_RE = /^\s*(?:([-*+])|(\d+)[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;

/**
 * Block-level Markdown subset: `#`/`##`/`###` headings, `-`/`*`/`1.` lists
 * with `[ ]`/`[x]` checkboxes, `>` quotes, ``` fenced code, and paragraphs
 * split on blank lines (single line breaks inside a paragraph are kept).
 */
export function parseNoteMarkdown(text: string): NoteBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: NoteBlock[] = [];
  let para: string[] = [];
  const flush = (): void => {
    const body = para.join('\n').trim();
    if (body) blocks.push({ type: 'paragraph', inline: parseNoteInline(body) });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      flush();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trim())) code.push(lines[i++]);
      blocks.push({ type: 'code', text: code.join('\n') });
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1].length as 1 | 2 | 3, inline: parseNoteInline(heading[2].trim()) });
      continue;
    }
    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flush();
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'quote' && i > 0 && /^>/.test(lines[i - 1])) prev.inline.push({ t: 'text', v: '\n' }, ...parseNoteInline(quote[1]));
      else blocks.push({ type: 'quote', inline: parseNoteInline(quote[1]) });
      continue;
    }
    const item = LIST_RE.exec(line);
    if (item) {
      flush();
      const ordered = Boolean(item[2]);
      const entry = { ...(item[3] ? { checked: item[3].toLowerCase() === 'x' } : {}), inline: parseNoteInline(item[4]) };
      const prev = blocks[blocks.length - 1];
      if (prev?.type === 'list' && prev.ordered === ordered && i > 0 && LIST_RE.test(lines[i - 1])) prev.items.push(entry);
      else blocks.push({ type: 'list', ordered, items: [entry] });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

/** Plain-text preview of a body for a list row (Markdown markers dropped). */
export function notePreview(detail: string | undefined, max = 160): string {
  const text = (detail ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The normalized Anki draft model — Phase 0 of ANKI_DECK_WORKBENCH_PLAN.md.
//
// The existing importer (src/shared/apkgCards.ts) flattens a collection to
// {word, reading, meaning, sentence}. That is the right shape for the Level
// Meter and the local Flashcards deck, and the wrong shape for a workbench: a
// round-trip through it loses note types, templates, scheduling, flags, media
// and every field the four heuristics did not claim. This module is the
// loss-aware model the workbench edits instead, and it does not replace the
// simplified path — both read the same collection for different jobs.
//
// Everything here is pure string/JSON work so it unit-tests in the node vitest
// environment. Unzipping, sql.js and zstd stay in src/main/anki/.
//
// The contract is FROZEN at `ANKI_DRAFT_VERSION`. A change that can drop or
// reinterpret stored data bumps the version and ships a migration; adding an
// optional field does not.

export const ANKI_DRAFT_VERSION = 1;

/** Anki joins a note's fields with the ASCII Unit Separator (0x1f). */
export const ANKI_FIELD_SEP = String.fromCharCode(0x1f);

/** Diagnostic sample ids are capped so a broken 100k deck cannot inflate the draft. */
export const MAX_DIAGNOSTIC_SAMPLES = 8;

// ----- source and provenance --------------------------------------------------

export type AnkiDraftSourceKind = 'apkg' | 'colpkg' | 'ankiconnect' | 'csv' | 'local-deck';

export interface AnkiDraftSource {
  kind: AnkiDraftSourceKind;
  /** File name or connection label. Never a full path — this crosses IPC and is displayed. */
  label: string;
  /** `col.ver`, the collection's declared schema version, when the source reports one. */
  schemaVersion?: number;
  /** `col.crt` in epoch seconds: the origin every `due` day number counts from. */
  createdAtSec?: number;
  /** `col.mod` in epoch milliseconds. */
  modifiedAtMs?: number;
  /**
   * Content fingerprint of what was read. A live commit re-reads the source and
   * refuses (or rebases) when this moved, so a preview can never be applied to a
   * collection that changed underneath it.
   */
  fingerprint: string;
  /**
   * The source stored field text as plain text rather than HTML — a CSV imported
   * with Anki's `#html:false`. Recorded because an *edit* has to normalize the
   * way the read did: running the HTML stripper over plain text would silently
   * eat a literal `<` the user typed. Absent means HTML, which is what Anki's
   * own editor stores.
   */
  plainText?: boolean;
}

// ----- note types, fields, templates ------------------------------------------

export interface AnkiDraftFieldDef {
  ord: number;
  name: string;
  /** Anki's "sticky": the field keeps its value in the Add dialog. */
  sticky: boolean;
  /** Right-to-left field. Preserved because it changes how the editor renders. */
  rtl: boolean;
  /** Font/size the editor uses for this field. */
  font?: string;
  fontSize?: number;
}

export interface AnkiDraftTemplate {
  ord: number;
  name: string;
  /** Question/answer formats, verbatim. These generate the cards. */
  qfmt: string;
  afmt: string;
  /** Browser-appearance overrides. Empty string when the template has none. */
  bqfmt: string;
  bafmt: string;
  /** Deck override for cards this template generates (`did`), when set. */
  deckOverrideId?: string;
}

export interface AnkiDraftNoteType {
  id: string;
  name: string;
  /**
   * Cloze note types generate cards from `{{c1::…}}` markers in the fields, not
   * from one template per card. Editing a field therefore adds and removes
   * cards, which is why the kind is part of the frozen model rather than a
   * render-time guess.
   */
  kind: 'standard' | 'cloze';
  css: string;
  fields: AnkiDraftFieldDef[];
  templates: AnkiDraftTemplate[];
  /** Field ord the Browser sorts by (`sortf`). */
  sortFieldOrd: number;
  /** LaTeX preamble/postamble, preserved so a round-trip does not drop them. */
  latexPre?: string;
  latexPost?: string;
}

// ----- decks -------------------------------------------------------------------

export interface AnkiDraftDeck {
  id: string;
  /** Full Anki name with `::` separators, exactly as stored. */
  name: string;
  /** The same name split on `::`, e.g. `['Japanese','Core','Verbs']`. */
  path: string[];
  /** Parent deck's id, when a deck with the parent name exists in this collection. */
  parentId?: string;
  /**
   * A filtered ("custom study") deck holds cards on loan from their real deck.
   * Cards in one carry `originalDeckId`/`originalDue`, and editing their
   * scheduling is not a safe operation — the workbench marks them read-only.
   */
  filtered: boolean;
  /** Deck-options preset id (`conf`), for non-filtered decks. */
  configId?: string;
}

// ----- notes and cards ---------------------------------------------------------

export interface AnkiDraftFieldValue {
  ord: number;
  /** Field name from the note type, or `field N` when the note type is unknown. */
  name: string;
  /** Exactly as stored: HTML, media markup and cloze markers intact. Never trimmed. */
  raw: string;
  /** HTML/furigana/cloze-stripped and whitespace-collapsed. Search and dedupe only. */
  normalized: string;
}

export interface AnkiDraftMediaRef {
  /** The reference exactly as written in the field, including any subdirectory. */
  reference: string;
  /** Leaf file name — what an Anki media folder is actually keyed by. */
  fileName: string;
  kind: 'image' | 'audio' | 'unknown';
  /** Which field of which note referenced it. */
  fieldOrd: number;
  /** True when the package's media manifest lists this name. */
  present: boolean;
  /**
   * Bytes this file occupies **in the package**, when the source reported sizes.
   * Absent means "not reported", never zero — a zero-byte file is recipe 11's
   * `broken` and has to stay distinguishable from an unmeasured one.
   */
  bytes?: number;
  /**
   * The name of the byte-identical file this one duplicates, when the package
   * stores the same bytes under more than one name. Set only on the copies: the
   * first name in manifest order is the canonical one and carries nothing.
   */
  duplicateOf?: string;
}

/**
 * What the package carries in its media folder, as opposed to what its notes
 * cite. Absent when the source reported no manifest at all — which is not the
 * same as an empty one, and is why `present: false` alone can never be read as
 * "missing".
 */
export interface AnkiDraftMediaSummary {
  /** Files the package actually carries. */
  files: number;
  /** Their total size, when the source reported sizes. */
  bytes?: number;
  /** Carried files no note references. */
  unreferenced: number;
  /**
   * True when per-file sizes were read, so `oversized`/`broken` are answerable.
   * A manifest without sizes (AnkiConnect) still answers `missing`.
   */
  sized: boolean;
}

export interface AnkiDraftNote {
  id: string;
  /** Anki's cross-collection stable id. This, not `id`, survives an export/reimport. */
  guid: string;
  noteTypeId: string;
  tags: string[];
  /** Anki's "marked" is the `marked` tag, surfaced separately because the UI treats it as a flag. */
  marked: boolean;
  fields: AnkiDraftFieldValue[];
  /**
   * The deck a source that carries notes but no cards said this note belongs in
   * (a CSV `#deck:` / `#deck column:`). A card's deck lives on the card; this is
   * an intent the file stated and nothing is scheduled into it yet, so it is
   * deliberately not `deckId`.
   */
  targetDeckId?: string;
  modifiedAtSec: number;
  /** `notes.flags` and `notes.data`, preserved verbatim; Anki reserves both. */
  flags: number;
  data: string;
  /** Ids of the cards this note generates, in card `ord` order. */
  cardIds: string[];
  media: AnkiDraftMediaRef[];
}

export type AnkiCardType = 'new' | 'learning' | 'review' | 'relearning' | 'unknown';

export type AnkiCardQueue =
  | 'new'
  | 'learning'
  | 'review'
  | 'day-learn'
  | 'preview'
  | 'suspended'
  | 'buried-sibling'
  | 'buried-user'
  | 'unknown';

/** Anki's coloured browser flags. `none` is 0. */
export type AnkiCardFlag =
  | 'none'
  | 'red'
  | 'orange'
  | 'green'
  | 'blue'
  | 'pink'
  | 'turquoise'
  | 'purple';

export interface AnkiDraftCard {
  id: string;
  noteId: string;
  deckId: string;
  /** Template ordinal for a standard note; the cloze number minus one for a cloze note. */
  ord: number;
  type: AnkiCardType;
  queue: AnkiCardQueue;
  /**
   * Anki's raw `due`, whose unit depends on `type`: a position for a new card,
   * an epoch second for a learning card, a day number relative to
   * `source.createdAtSec` for a review card. Kept raw on purpose — converting it
   * here would need the collection's rollover hour and would silently lie for
   * any card whose type the workbench then changes.
   */
  due: number;
  /** Days. Negative values are Anki's legacy "seconds" encoding, preserved as stored. */
  interval: number;
  /** `factor` in permille: 2500 means 250%. 0 on a card that has never graduated. */
  easeFactor: number;
  reps: number;
  lapses: number;
  /** Anki's `left`: reps remaining today, encoded. Opaque, preserved. */
  left: number;
  /** Real due/deck while the card is on loan to a filtered deck. */
  originalDue?: number;
  originalDeckId?: string;
  flag: AnkiCardFlag;
  modifiedAtSec: number;
}

export interface AnkiDraftReview {
  cardId: string;
  reviewedAtMs: number;
  /** 1–4 = Again/Hard/Good/Easy. Never relabelled: the plan forbids app names here. */
  ease: number;
  interval: number;
  lastInterval: number;
  easeFactor: number;
  tookMs: number;
  kind: number;
}

// ----- diagnostics -------------------------------------------------------------

export type AnkiDraftDiagnosticCode =
  | 'missing-media'
  | 'unknown-note-type'
  | 'orphan-card'
  | 'note-without-cards'
  | 'field-count-mismatch'
  | 'filtered-deck'
  | 'missing-deck'
  | 'duplicate-guid'
  | 'empty-first-field'
  | 'review-history-absent'
  | 'template-format-unavailable'
  | 'note-type-unassigned';

export interface AnkiDraftDiagnostic {
  code: AnkiDraftDiagnosticCode;
  /**
   * `blocking` stops an export/commit; `warning` needs an explicit acknowledgement;
   * `info` is reported and does not gate anything.
   */
  severity: 'info' | 'warning' | 'blocking';
  count: number;
  /** Up to `MAX_DIAGNOSTIC_SAMPLES` ids/names, so a broken deck cannot inflate the draft. */
  samples: string[];
}

export interface AnkiDraftCounts {
  notes: number;
  cards: number;
  decks: number;
  noteTypes: number;
  reviews: number;
  /** Distinct media file names referenced by any note. */
  mediaReferences: number;
}

export interface AnkiDraft {
  version: number;
  source: AnkiDraftSource;
  decks: AnkiDraftDeck[];
  noteTypes: AnkiDraftNoteType[];
  notes: AnkiDraftNote[];
  cards: AnkiDraftCard[];
  /** Absent when the source carries no `revlog`; an empty array means "read, and empty". */
  reviews?: AnkiDraftReview[];
  /** Absent when the source reported no media manifest. Package-level, so a page keeps it. */
  media?: AnkiDraftMediaSummary;
  diagnostics: AnkiDraftDiagnostic[];
  counts: AnkiDraftCounts;
}

// ----- raw input shapes --------------------------------------------------------
//
// One row per table, already read out of SQLite (or an AnkiConnect response) and
// nothing more. The builder below never touches a database, so a fixture is a
// literal and a test needs no I/O.

export interface RawAnkiColRow {
  ver?: number;
  crt?: number;
  mod?: number;
}

export interface RawAnkiNoteRow {
  id: string | number;
  guid?: string;
  mid: string | number;
  mod?: number;
  tags?: string;
  /** Fields joined with `ANKI_FIELD_SEP`. */
  flds: string;
  flags?: number;
  data?: string;
  /** Deck the source named for this note when it carries no cards. See `targetDeckId`. */
  targetDid?: string | number;
}

export interface RawAnkiCardRow {
  id: string | number;
  nid: string | number;
  did: string | number;
  ord?: number;
  mod?: number;
  type?: number;
  queue?: number;
  due?: number;
  ivl?: number;
  factor?: number;
  reps?: number;
  lapses?: number;
  left?: number;
  odue?: number;
  odid?: string | number;
  flags?: number;
}

export interface RawAnkiDeckRow {
  id: string | number;
  name: string;
  /** Anki 2.1 stores nesting as `\x1f` in the normalized table and `::` in the legacy blob. */
  dyn?: number;
  conf?: string | number;
}

export interface RawAnkiNoteTypeRow {
  id: string | number;
  name: string;
  /** 0 = standard, 1 = cloze. */
  type?: number;
  css?: string;
  sortf?: number;
  latexPre?: string;
  latexPost?: string;
  fields: Array<{
    ord: number;
    name: string;
    sticky?: boolean;
    rtl?: boolean;
    font?: string;
    size?: number;
  }>;
  templates: Array<{
    ord: number;
    name: string;
    qfmt?: string;
    afmt?: string;
    bqfmt?: string;
    bafmt?: string;
    did?: string | number | null;
  }>;
  /**
   * Set by a reader that could name this note type's templates but could not
   * read their question/answer formats — schema 18 keeps those in a protobuf
   * blob. The builder turns it into a blocking diagnostic rather than letting
   * empty formats look like real ones.
   */
  formatsUnavailable?: boolean;
  /**
   * Set by a reader for a placeholder note type it had to invent because the
   * source carries none at all — a CSV/TSV names columns, never a card design.
   * The builder raises `note-type-unassigned` as blocking: the draft opens and
   * can be inspected, and nothing can be exported until a real note type is
   * chosen.
   */
  unassigned?: boolean;
}

export interface RawAnkiRevlogRow {
  id: string | number;
  cid: string | number;
  ease?: number;
  ivl?: number;
  lastIvl?: number;
  factor?: number;
  time?: number;
  type?: number;
}

export interface RawAnkiCollection {
  col?: RawAnkiColRow;
  notes: readonly RawAnkiNoteRow[];
  cards: readonly RawAnkiCardRow[];
  decks: readonly RawAnkiDeckRow[];
  noteTypes: readonly RawAnkiNoteTypeRow[];
  /** Absent when the source has no review log; empty means "read, and empty". */
  revlog?: readonly RawAnkiRevlogRow[];
  /** Media file names the package actually contains, for the missing-media check. */
  mediaFiles?: readonly string[];
  /**
   * The same files with their stored size and content checksum, when the reader
   * could get them. Supersedes `mediaFiles` for presence when both are given —
   * a reader that can size the files knows their names too.
   */
  mediaEntries?: readonly RawAnkiMediaEntry[];
}

/** One file in the package's media folder, as the reader found it. */
export interface RawAnkiMediaEntry {
  /** The name notes cite, not the numeric zip entry it is stored under. */
  name: string;
  /** Bytes as stored in the package. 0 is a real, reportable value. */
  bytes: number;
  /**
   * A content checksum for duplicate detection — the zip CRC-32 in practice.
   * Absent means duplicates cannot be found; size alone is far too weak a key.
   */
  crc32?: number;
}

// ----- enum decoding -----------------------------------------------------------

const CARD_TYPES: readonly AnkiCardType[] = ['new', 'learning', 'review', 'relearning'];

/**
 * Anki's queue numbering runs negative for the three "not in a queue" states, so
 * it cannot be a plain array lookup. -1 suspended, -2 buried by a sibling,
 * -3 buried by the user; 4 is the v3 scheduler's preview queue.
 */
const QUEUES: Readonly<Record<number, AnkiCardQueue>> = {
  [-3]: 'buried-user',
  [-2]: 'buried-sibling',
  [-1]: 'suspended',
  0: 'new',
  1: 'learning',
  2: 'review',
  3: 'day-learn',
  4: 'preview',
};

/**
 * Anki's own flag order, index-aligned with the stored column's low three bits,
 * so `ANKI_CARD_FLAGS[n]` is the flag `n` decodes to. Exported because gate 5's
 * tray form offers the same list: a second hand-written copy in the UI would be
 * free to drift from the decoder and label a colour the file does not hold.
 */
export const ANKI_CARD_FLAGS: readonly AnkiCardFlag[] = [
  'none',
  'red',
  'orange',
  'green',
  'blue',
  'pink',
  'turquoise',
  'purple',
];

export function decodeCardType(value: number | undefined): AnkiCardType {
  return CARD_TYPES[value ?? -1] ?? 'unknown';
}

export function decodeCardQueue(value: number | undefined): AnkiCardQueue {
  if (value == null) return 'unknown';
  return QUEUES[value] ?? 'unknown';
}

/** `cards.flags` packs the flag colour into its low three bits; the rest is reserved. */
export function decodeCardFlag(value: number | undefined): AnkiCardFlag {
  return ANKI_CARD_FLAGS[(value ?? 0) & 0b111] ?? 'none';
}

/**
 * The stored `cards.flags` value for a colour, **preserving the rest of the
 * column**. The upper bits are reserved and nothing in the draft models them, so
 * a writer that assigned a bare 0-7 would clear whatever they held — which is
 * exactly why the live commit refuses this capability rather than guessing at a
 * value it cannot re-read (`shared/ankiConnectCommit.ts`).
 */
export function encodeCardFlag(flag: AnkiCardFlag, stored: number | undefined): number {
  const colour = Math.max(ANKI_CARD_FLAGS.indexOf(flag), 0);
  return ((stored ?? 0) & ~0b111) | colour;
}

/** The stored `cards.queue` number, or `null` for a queue Anki has no number for. */
export function encodeCardQueue(queue: AnkiCardQueue): number | null {
  for (const [value, name] of Object.entries(QUEUES)) {
    if (name === queue) return Number(value);
  }
  return null;
}

// ----- field and media extraction ----------------------------------------------

/**
 * Split a stored `flds` blob into its parts.
 *
 * A note with a single empty field and a note with no fields are different
 * things, and `''.split(sep)` gives `['']` for both — which is right for the
 * first and wrong for the second. Anki never stores a note with zero fields, so
 * `['']` is the correct answer and this is a thin wrapper kept for symmetry with
 * `ANKI_FIELD_SEP`.
 */
export function splitNoteFields(flds: string): string[] {
  return String(flds ?? '').split(ANKI_FIELD_SEP);
}

const IMG_SRC_RE = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SOURCE_SRC_RE = /<(?:source|video|audio)\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
const SOUND_RE = /\[sound:([^\]\r\n]+)\]/gi;

function leafName(reference: string): string {
  const cut = reference.split(/[\\/]/);
  return cut[cut.length - 1] ?? reference;
}

/**
 * Media references in one field, in document order.
 *
 * `mediaFilenamesFromAnkiMarkup` in shared/anki.ts is deliberately not reused:
 * it exists to validate markup this app just wrote, so it drops any name
 * containing a slash and dedupes globally. A foreign deck's subdirectory
 * reference is exactly what the workbench has to report rather than discard, and
 * the workbench needs to know which field carried it.
 */
export function mediaRefsInField(
  raw: string,
  fieldOrd: number,
  present: (fileName: string) => boolean,
): AnkiDraftMediaRef[] {
  const out: AnkiDraftMediaRef[] = [];
  const seen = new Set<string>();
  const push = (reference: string | undefined, kind: AnkiDraftMediaRef['kind']): void => {
    const ref = reference?.trim();
    // A remote reference is not a media file: Anki renders it from the network
    // and there is nothing in the package to be missing.
    if (!ref || /^(https?:|data:)/i.test(ref)) return;
    if (seen.has(ref)) return;
    seen.add(ref);
    const fileName = leafName(ref);
    out.push({ reference: ref, fileName, kind, fieldOrd, present: present(fileName) });
  };

  for (const m of raw.matchAll(IMG_SRC_RE)) push(m[1] ?? m[2] ?? m[3], 'image');
  for (const m of raw.matchAll(SOURCE_SRC_RE)) push(m[1] ?? m[2] ?? m[3], 'unknown');
  for (const m of raw.matchAll(SOUND_RE)) push(m[1], 'audio');
  return out;
}

interface MediaCatalogue {
  hasManifest: boolean;
  /** The reader reported per-file sizes, so `oversized`/`broken` are answerable. */
  sized: boolean;
  /** Leaf names the package carries. */
  present: ReadonlySet<string>;
  /** Only populated when the reader reported sizes. */
  bytesByName: ReadonlyMap<string, number>;
  /** Copy name -> the canonical name holding the same bytes. Copies only. */
  duplicateOf: ReadonlyMap<string, string>;
  totalBytes?: number;
}

/**
 * Index the package's media folder once, so the per-note loop is a map lookup.
 *
 * Duplicates are keyed on `bytes:crc32` and never on size alone — a deck of
 * 22,000 short audio clips has thousands of size collisions between files that
 * share nothing. The first name in manifest order is canonical and is the one
 * name in its group left unflagged, because it is the copy Anki would keep.
 */
function mediaCatalogue(raw: RawAnkiCollection): MediaCatalogue {
  const present = new Set<string>();
  const bytesByName = new Map<string, number>();
  const duplicateOf = new Map<string, string>();
  const hasManifest = raw.mediaEntries != null || raw.mediaFiles != null;

  if (raw.mediaEntries) {
    const canonicalByContent = new Map<string, string>();
    let totalBytes = 0;
    for (const entry of raw.mediaEntries) {
      const name = leafName(entry.name);
      present.add(name);
      const bytes = Number.isFinite(entry.bytes) ? Math.max(0, Math.floor(entry.bytes)) : 0;
      totalBytes += bytes;
      // A name repeated in the manifest keeps its first size; the alternative
      // is reporting the last one, which is no more true and is order-dependent.
      if (!bytesByName.has(name)) bytesByName.set(name, bytes);
      if (entry.crc32 == null) continue;
      const key = `${bytes}:${entry.crc32}`;
      const canonical = canonicalByContent.get(key);
      if (canonical == null) canonicalByContent.set(key, name);
      else if (canonical !== name) duplicateOf.set(name, canonical);
    }
    return { hasManifest, sized: true, present, bytesByName, duplicateOf, totalBytes };
  }

  for (const name of raw.mediaFiles ?? []) present.add(leafName(name));
  return { hasManifest, sized: false, present, bytesByName, duplicateOf };
}

/**
 * Carried files no note cites. A cited name the folder lacks is not carried.
 *
 * Names starting with `_` are excluded, because Anki reserves that prefix for
 * files a *note type* references — a template's `<img>`, a stylesheet's font —
 * and its own Check Media never lists them as unused. Measured on
 * `New_HSK_30…practice_with_drawing.apkg`: all 7 of its uncited files are
 * `_youdao.png`-style template assets, so without this the surface would offer
 * a user seven card-type images to go and delete.
 */
function countUnreferenced(
  present: ReadonlySet<string>,
  referenced: ReadonlySet<string>,
): number {
  let count = 0;
  for (const name of present) {
    if (!name.startsWith('_') && !referenced.has(name)) count += 1;
  }
  return count;
}

// ----- the builder --------------------------------------------------------------

interface DiagnosticBuilder {
  add(code: AnkiDraftDiagnosticCode, sample: string): void;
  drain(): AnkiDraftDiagnostic[];
}

const SEVERITY: Readonly<Record<AnkiDraftDiagnosticCode, AnkiDraftDiagnostic['severity']>> = {
  // Blocking: exporting or committing would write something the source did not say.
  'unknown-note-type': 'blocking',
  'field-count-mismatch': 'blocking',
  // Blocking too: a template whose qfmt/afmt could not be read would export as a
  // card that renders blank, and it would look like the user's own edit.
  'template-format-unavailable': 'blocking',
  // Blocking as well, and for the neighbouring reason: a source with no note
  // type at all (a CSV) gets a placeholder so its columns have somewhere to
  // live, and exporting against a placeholder would invent a card design.
  'note-type-unassigned': 'blocking',
  // Warning: safe to edit, not safe to assume.
  'missing-media': 'warning',
  'orphan-card': 'warning',
  'missing-deck': 'warning',
  'duplicate-guid': 'warning',
  'empty-first-field': 'warning',
  // Info: normal collection states the user should still see named.
  'note-without-cards': 'info',
  'filtered-deck': 'info',
  'review-history-absent': 'info',
};

function diagnostics(): DiagnosticBuilder {
  const counts = new Map<AnkiDraftDiagnosticCode, { count: number; samples: string[] }>();
  return {
    add(code, sample) {
      let entry = counts.get(code);
      if (!entry) {
        entry = { count: 0, samples: [] };
        counts.set(code, entry);
      }
      entry.count += 1;
      if (entry.samples.length < MAX_DIAGNOSTIC_SAMPLES) entry.samples.push(sample);
    },
    drain() {
      return [...counts.entries()].map(([code, entry]) => ({
        code,
        severity: SEVERITY[code],
        count: entry.count,
        samples: entry.samples,
      }));
    },
  };
}

/**
 * Anki's normalized `decks` table separates a deck's ancestors with 0x1f — the
 * same byte `flds` uses between fields, in an unrelated role — while the legacy
 * `col.decks` blob writes `::`. A draft can be built from either, so both split.
 */
const DECK_PATH_RE = new RegExp(`${String.fromCharCode(0x1f)}|::`);

export function deckPath(name: string): string[] {
  return String(name ?? '')
    .split(DECK_PATH_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

export interface BuildAnkiDraftOptions {
  source: AnkiDraftSource;
  /** Field normalizer, injected so the builder stays free of the HTML-stripping module. */
  normalize: (raw: string) => string;
}

/**
 * Build the normalized draft from raw rows.
 *
 * Pure and total: it never throws on a malformed collection, because refusing to
 * open a deck the user can see in Anki is worse than opening it with the damage
 * named. Everything it cannot interpret becomes a diagnostic, and every
 * uninterpretable value is still carried through verbatim.
 */
export function buildAnkiDraft(
  raw: RawAnkiCollection,
  options: BuildAnkiDraftOptions,
): AnkiDraft {
  const diag = diagnostics();
  const catalogue = mediaCatalogue(raw);
  const { present: mediaPresent, bytesByName, duplicateOf } = catalogue;
  const hasMediaManifest = catalogue.hasManifest;

  // --- decks
  const byName = new Map<string, string>();
  for (const row of raw.decks) byName.set(String(row.name ?? ''), String(row.id));
  const decks: AnkiDraftDeck[] = raw.decks.map((row) => {
    const name = String(row.name ?? '');
    const path = deckPath(name);
    const filtered = Number(row.dyn ?? 0) !== 0;
    if (filtered) diag.add('filtered-deck', name);
    // The parent is looked up under both separators because the two schemas
    // disagree and a draft may be built from either.
    const parentPath = path.slice(0, -1);
    const parentId = parentPath.length
      ? byName.get(parentPath.join('::')) ?? byName.get(parentPath.join('\x1f'))
      : undefined;
    return {
      id: String(row.id),
      name,
      path,
      parentId,
      filtered,
      configId: row.conf != null ? String(row.conf) : undefined,
    };
  });
  const deckIds = new Set(decks.map((d) => d.id));

  // --- note types
  const noteTypes: AnkiDraftNoteType[] = raw.noteTypes.map((row) => {
    if (row.formatsUnavailable) diag.add('template-format-unavailable', String(row.name ?? row.id));
    if (row.unassigned) diag.add('note-type-unassigned', String(row.name ?? row.id));
    return {
      id: String(row.id),
      name: String(row.name ?? ''),
      kind: Number(row.type ?? 0) === 1 ? 'cloze' : 'standard',
      css: String(row.css ?? ''),
      sortFieldOrd: Number(row.sortf ?? 0),
      latexPre: row.latexPre,
      latexPost: row.latexPost,
      fields: [...row.fields]
        .sort((a, b) => a.ord - b.ord)
        .map((f) => ({
          ord: Number(f.ord ?? 0),
          name: String(f.name ?? ''),
          sticky: Boolean(f.sticky),
          rtl: Boolean(f.rtl),
          font: f.font,
          fontSize: f.size,
        })),
      templates: [...row.templates]
        .sort((a, b) => a.ord - b.ord)
        .map((t) => ({
          ord: Number(t.ord ?? 0),
          name: String(t.name ?? ''),
          qfmt: String(t.qfmt ?? ''),
          afmt: String(t.afmt ?? ''),
          bqfmt: String(t.bqfmt ?? ''),
          bafmt: String(t.bafmt ?? ''),
          deckOverrideId: t.did != null ? String(t.did) : undefined,
        })),
    };
  });
  const noteTypeById = new Map(noteTypes.map((nt) => [nt.id, nt]));

  // --- cards, grouped by note so a note can list its own
  const cardsByNote = new Map<string, AnkiDraftCard[]>();
  const cards: AnkiDraftCard[] = raw.cards.map((row) => {
    const card: AnkiDraftCard = {
      id: String(row.id),
      noteId: String(row.nid),
      deckId: String(row.did),
      ord: Number(row.ord ?? 0),
      type: decodeCardType(row.type),
      queue: decodeCardQueue(row.queue),
      due: Number(row.due ?? 0),
      interval: Number(row.ivl ?? 0),
      easeFactor: Number(row.factor ?? 0),
      reps: Number(row.reps ?? 0),
      lapses: Number(row.lapses ?? 0),
      left: Number(row.left ?? 0),
      // Anki writes 0, not null, when a card is not in a filtered deck.
      originalDue: row.odue ? Number(row.odue) : undefined,
      originalDeckId: row.odid && String(row.odid) !== '0' ? String(row.odid) : undefined,
      flag: decodeCardFlag(row.flags),
      modifiedAtSec: Number(row.mod ?? 0),
    };
    if (!deckIds.has(card.deckId)) diag.add('missing-deck', card.deckId);
    const list = cardsByNote.get(card.noteId);
    if (list) list.push(card);
    else cardsByNote.set(card.noteId, [card]);
    return card;
  });
  for (const list of cardsByNote.values()) list.sort((a, b) => a.ord - b.ord);

  // --- notes
  const guidsSeen = new Set<string>();
  let mediaReferences = 0;
  const mediaNames = new Set<string>();
  const notes: AnkiDraftNote[] = raw.notes.map((row) => {
    const id = String(row.id);
    const noteTypeId = String(row.mid);
    const noteType = noteTypeById.get(noteTypeId);
    if (!noteType) diag.add('unknown-note-type', id);

    const parts = splitNoteFields(row.flds);
    if (noteType && noteType.fields.length !== parts.length) {
      // Anki itself treats this as corruption: the field count is what maps a
      // stored value to a name, so an edit would write into the wrong field.
      diag.add('field-count-mismatch', id);
    }

    const media: AnkiDraftMediaRef[] = [];
    const fields: AnkiDraftFieldValue[] = parts.map((rawValue, index) => {
      for (const ref of mediaRefsInField(rawValue, index, (name) => mediaPresent.has(name))) {
        const bytes = bytesByName.get(ref.fileName);
        if (bytes != null) ref.bytes = bytes;
        const canonical = duplicateOf.get(ref.fileName);
        if (canonical != null) ref.duplicateOf = canonical;
        media.push(ref);
        if (!mediaNames.has(ref.fileName)) {
          mediaNames.add(ref.fileName);
          mediaReferences += 1;
          // Counted per FILE, like `mediaReferences` beside it. One absent
          // audio clip cited by thirty notes is one file to go and find, and
          // reporting it as thirty misstates the size of the problem.
          if (hasMediaManifest && !ref.present) diag.add('missing-media', ref.fileName);
        }
      }
      return {
        ord: index,
        name: noteType?.fields[index]?.name ?? `field ${index + 1}`,
        raw: rawValue,
        normalized: options.normalize(rawValue),
      };
    });

    if (!fields[0]?.normalized) diag.add('empty-first-field', id);

    const guid = String(row.guid ?? '');
    if (guid) {
      if (guidsSeen.has(guid)) diag.add('duplicate-guid', guid);
      else guidsSeen.add(guid);
    }

    const tags = String(row.tags ?? '')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const own = cardsByNote.get(id) ?? [];
    if (!own.length) diag.add('note-without-cards', id);

    return {
      id,
      guid,
      noteTypeId,
      tags: tags.filter((t) => t.toLowerCase() !== 'marked'),
      marked: tags.some((t) => t.toLowerCase() === 'marked'),
      fields,
      targetDeckId: row.targetDid != null ? String(row.targetDid) : undefined,
      modifiedAtSec: Number(row.mod ?? 0),
      flags: Number(row.flags ?? 0),
      data: String(row.data ?? ''),
      cardIds: own.map((c) => c.id),
      media,
    };
  });

  const noteIds = new Set(notes.map((n) => n.id));
  for (const card of cards) {
    if (!noteIds.has(card.noteId)) diag.add('orphan-card', card.id);
  }

  // --- reviews
  let reviews: AnkiDraftReview[] | undefined;
  if (raw.revlog) {
    reviews = raw.revlog.map((row) => ({
      cardId: String(row.cid),
      // `revlog.id` IS the review timestamp in epoch milliseconds.
      reviewedAtMs: Number(row.id),
      ease: Number(row.ease ?? 0),
      interval: Number(row.ivl ?? 0),
      lastInterval: Number(row.lastIvl ?? 0),
      easeFactor: Number(row.factor ?? 0),
      tookMs: Number(row.time ?? 0),
      kind: Number(row.type ?? 0),
    }));
  } else {
    diag.add('review-history-absent', options.source.label);
  }

  return {
    version: ANKI_DRAFT_VERSION,
    source: options.source,
    decks,
    noteTypes,
    notes,
    cards,
    reviews,
    media: hasMediaManifest
      ? {
          files: mediaPresent.size,
          bytes: catalogue.totalBytes,
          // Names cited by a note but absent from the folder are not carried
          // files, so they can never make this number smaller.
          unreferenced: countUnreferenced(mediaPresent, mediaNames),
          sized: catalogue.sized,
        }
      : undefined,
    diagnostics: diag.drain(),
    counts: {
      notes: notes.length,
      cards: cards.length,
      decks: decks.length,
      noteTypes: noteTypes.length,
      reviews: reviews?.length ?? 0,
      mediaReferences,
    },
  };
}

/** True when any diagnostic would stop an export or a live commit. */
export function draftIsBlocked(draft: AnkiDraft): boolean {
  return draft.diagnostics.some((d) => d.severity === 'blocking');
}

// ----- paging -------------------------------------------------------------------

/** Notes per page. A 100k-note collection must never cross IPC in one message. */
export const ANKI_DRAFT_PAGE_SIZE = 500;
export const ANKI_DRAFT_MAX_PAGE_SIZE = 2000;

/**
 * One page of notes, with the deck/note-type/diagnostic header intact.
 *
 * `counts` keeps describing the WHOLE collection — it is what the header claims
 * about the source, and recomputing it per page would make the same deck report
 * a different size depending on which page was open. Only `notes` and `cards`
 * are windowed, and `cards` is narrowed to the notes on this page so a row can
 * always render its own cards without a second round trip.
 */
export function pageAnkiDraft(draft: AnkiDraft, offset: number, limit: number): AnkiDraft {
  const start = Math.max(0, Math.floor(offset));
  const size = Math.min(Math.max(1, Math.floor(limit)), ANKI_DRAFT_MAX_PAGE_SIZE);
  const notes = draft.notes.slice(start, start + size);
  const ids = new Set(notes.map((n) => n.id));
  return {
    ...draft,
    notes,
    cards: draft.cards.filter((c) => ids.has(c.noteId)),
    // Review history is per-card and unbounded; a page never carries it.
    reviews: draft.reviews ? [] : undefined,
  };
}

// ----- IPC contract ---------------------------------------------------------------

export interface ApkgDraftRequest {
  /** Skip the OS file dialog when set. */
  filePath?: string;
  /**
   * Resume this session's source. The path comes from the session store, so a
   * surface can reopen a package it was never told the location of. Refused as
   * `session-source-unknown` rather than falling back to the dialog: a resume
   * that quietly asks for a different file is not a resume.
   */
  sessionId?: string;
  noteOffset?: number;
  noteLimit?: number;
}

export interface ApkgDraftResult {
  ok: boolean;
  /** One page: the full header, `counts` for the whole collection, windowed notes/cards. */
  draft?: AnkiDraft;
  fileName?: string;
  /** Where this page starts, and how many notes the collection holds in total. */
  noteOffset?: number;
  totalNotes?: number;
  /** The session this page was folded into, so a surface can resume it later. */
  sessionId?: string;
  error?: string;
}

/**
 * What the main process asks the .apkg read utility process for.
 *
 * A path, never a dialog and never a session id: a utility process has no
 * `dialog` and no session store, so everything it could refuse for is settled by
 * main before the process is spawned. See `main/anki/apkgReadWorker.ts`.
 */
export interface ApkgReadWorkerIn {
  filePath: string;
  noteOffset?: number;
  noteLimit?: number;
}

/**
 * What comes back. Deliberately one page and a few scalars rather than the whole
 * collection: the parse builds the full draft to resolve note types and decks
 * across the file, but only the page crosses the process boundary, so the message
 * is bounded by `noteLimit` however large the deck is.
 */
export type ApkgReadWorkerOut =
  | {
      ok: true;
      page: AnkiDraft;
      fingerprint: string;
      totalNotes: number;
      sourceKind: 'apkg' | 'colpkg';
      label: string;
      noteOffset: number;
      noteLimit: number;
    }
  | { ok: false; error: string };

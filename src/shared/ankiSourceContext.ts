// Smart recipe 20 — "Restore source context such as sentence, title, timestamp,
// screenshot, or URL when provenance is available."
//
// The whole recipe turns on its last clause. This module **decodes what a note
// already carries and never invents anything**: every facet below names the
// exact evidence it was read from, and a note whose evidence is absent produces
// `no-provenance` rather than a plausible sentence. Recipe 20's failure mode is
// not a missing field — it is a card that confidently states it came from
// episode 3 at 12:33 when nothing in the collection ever said so.
//
// What this app's own mining actually leaves behind, measured rather than
// assumed (2026-08-17):
//
//   * `videoClipFilename` (`shared/videoClip.ts:89`) builds
//     `jp-clip-<seed>-<ms>.mp4`, and `VideoCoreMiningPanel.tsx:329` passes
//     `<trackNumber>-<cueIndex>` as the seed. So the **start time in
//     milliseconds and the cue address are both recoverable**, exactly.
//   * The **title is not**. It is not in the filename at all, and the seed is
//     run through `[^a-zA-Z0-9]+ -> '-'` anyway, which turns a Japanese title
//     into the literal string `clip` — see `videoClip.test.ts:90`. So `title`
//     is read from the card's **deck path**, which is a real location the draft
//     holds, and from nowhere else.
//   * `extensionServer.ts:763` and `mediaStudyOrchestrator.ts:445` tag mined
//     notes under `jp-study-app::`, which is the tool that made the card.
//   * **No URL is recorded anywhere.** The extension mines from a page and
//     stores no address. A `url` facet would therefore have nothing to read, so
//     there is none — an empty facet the surface offers is a promise the data
//     cannot keep. A URL a note already holds in a field is already restored.
//
// Restores into an EMPTY destination only, recipe 7's rule and for the same
// reason: a hand-written source note is exactly the value a batch must not be
// able to replace.

import type { AnkiDraftCard, AnkiDraftDeck, AnkiDraftNote, AnkiDraftNoteType } from './ankiDraft';

/** A fact about where a note came from, and the evidence it was read from. */
export type SourceFacet =
  /** Start time inside the video, from a `jp-clip-…-<ms>` media reference. */
  | 'timestamp'
  /** Which subtitle line, from the same reference's `<track>-<index>` seed. */
  | 'cue'
  /** The tool that made the card, from its `jp-study-app::…` tag. */
  | 'origin'
  /** The deck the card sits in — a real location, not a decoded guess. */
  | 'deck';

export const SOURCE_FACETS: readonly SourceFacet[] = ['timestamp', 'cue', 'origin', 'deck'];

export function parseSourceFacet(value: string): SourceFacet | null {
  const wanted = value.trim().toLowerCase();
  return SOURCE_FACETS.find((f) => f === wanted) ?? null;
}

/** Why a note produced no restored text. One reason, the first that applies. */
export type SourceContextRefusal =
  /** The note type declares no field by the destination name. */
  | 'field-absent'
  /** The destination already holds text. Recipe 20 fills, it never overwrites. */
  | 'occupied'
  /**
   * None of the requested facets had evidence on this note. The honest end
   * state for a hand-made deck, and the reason this recipe cannot report a
   * clean sweep as a success — see the module header.
   */
  | 'no-provenance'
  /**
   * A `jp-clip-…` reference whose trailing segment is not a number, so the
   * filename claims to carry a time and does not. Refused rather than dropped
   * silently: it means the name was rewritten by something, which the user
   * wants to know about.
   */
  | 'unreadable-clip';

/** The app's own tag namespace. Everything under it names a tool, not a title. */
const APP_TAG_PREFIX = 'jp-study-app::';

/**
 * `jp-clip-<seed>-<ms>.<ext>`. The seed is greedy-free — `[^-]` cannot be used
 * because the seed itself contains `-` (it is `<track>-<index>`), so the last
 * `-<digits>` before the extension is the milliseconds and everything between
 * the prefix and it is the seed.
 */
const CLIP_PATTERN = /^jp-clip-(.*)-(\d+)\.[A-Za-z0-9]+$/;
/** A clip name whose trailing segment is not digits: it claims a time and has none. */
const CLIP_CLAIM_PATTERN = /^jp-clip-.*\.[A-Za-z0-9]+$/;
/** `<track>-<index>`, the seed `VideoCoreMiningPanel` passes. Both are integers. */
const CUE_SEED_PATTERN = /^(\d+)-(\d+)$/;

/**
 * Milliseconds as `M:SS`, or `H:MM:SS` once there is an hour. Not padded to
 * hours unconditionally: `0:12:33` for a 12-minute mark reads as a duration
 * format rather than a position, and every video player the user knows drops it.
 */
export function formatClipTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  const ss = String(seconds).padStart(2, '0');
  if (hours === 0) return `${minutes}:${ss}`;
  return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
}

/** One decoded fact, with the exact string it was decoded from. */
export interface SourceContextValue {
  facet: SourceFacet;
  /** The restored text, ready to write. */
  text: string;
  /**
   * What it was read from — the media file name, the tag, the deck name. Shown
   * beside the value so a reviewer can check the decode rather than trust it.
   * This is the field that makes the recipe auditable.
   */
  evidence: string;
}

export interface SourceContextProposal {
  noteId: string;
  /** The destination field's ord on THIS note's type. */
  toOrd: number;
  values: SourceContextValue[];
  /** The joined text as it will be written. */
  after: string;
}

export interface SourceContextSkip {
  noteId: string;
  refusal: SourceContextRefusal;
  /** The field name, the unreadable file name — never a translated string. */
  detail?: string;
}

export interface SourceContextPlan {
  proposals: SourceContextProposal[];
  skips: SourceContextSkip[];
  /** How many notes had evidence for each facet, whether or not they were written. */
  byFacet: Record<SourceFacet, number>;
}

export interface SourceContextInput {
  notes: readonly AnkiDraftNote[];
  cards: readonly AnkiDraftCard[];
  decks: readonly AnkiDraftDeck[];
  noteTypes: readonly AnkiDraftNoteType[];
  /** Where the restored text goes. Filled only when empty. */
  toField: string;
  /** Which facets to restore, in the order they will be joined. No default. */
  facets: readonly SourceFacet[];
  /** What separates two facets in the written value. */
  separator?: string;
}

export const DEFAULT_SOURCE_SEPARATOR = ' · ';

function emptyByFacet(): Record<SourceFacet, number> {
  return { timestamp: 0, cue: 0, origin: 0, deck: 0 };
}

/**
 * Every media file name a note references. Read from `note.media` rather than
 * re-parsed out of the field text: the draft already resolved the references,
 * including the ones written with a subdirectory.
 */
function mediaNames(note: AnkiDraftNote): string[] {
  return note.media.map((ref) => ref.fileName);
}

/**
 * The tool that made the card, from the `jp-study-app::` tag family. Returns the
 * most specific tag, so `extension-word` wins over `extension` — the general one
 * is always present alongside it and saying "made in the browser extension"
 * when the collection knows it was a word mine loses information the user has.
 */
function originTag(note: AnkiDraftNote): string | null {
  const own = note.tags.filter((t) => t.startsWith(APP_TAG_PREFIX));
  if (own.length === 0) return null;
  // Longest wins: the namespaces are strict extensions of each other, so string
  // length is the specificity order here without a table to keep in sync.
  return own.reduce((best, tag) => (tag.length > best.length ? tag : best));
}

/**
 * Facts this note carries, in `SOURCE_FACETS` order. Pure decode: nothing here
 * consults a dictionary, a network, or another note.
 */
export function readSourceContext(
  note: AnkiDraftNote,
  deckPath: string | null,
): { values: SourceContextValue[]; unreadableClip: string | null } {
  const values: SourceContextValue[] = [];
  let unreadableClip: string | null = null;

  for (const fileName of mediaNames(note)) {
    const match = CLIP_PATTERN.exec(fileName);
    if (!match) {
      // A name that says `jp-clip-` and carries no trailing number is a claim
      // the file cannot honour. Recorded once, and only when nothing else in
      // the same note decoded — see the refusal's own comment.
      if (CLIP_CLAIM_PATTERN.test(fileName)) unreadableClip = fileName;
      continue;
    }
    const [, seed, msText] = match;
    values.push({
      facet: 'timestamp',
      text: formatClipTimestamp(Number(msText)),
      evidence: fileName,
    });
    const cue = CUE_SEED_PATTERN.exec(seed);
    if (cue) {
      values.push({ facet: 'cue', text: `${cue[1]}:${cue[2]}`, evidence: fileName });
    }
    // One clip per note is the shape the mining panel produces; a second would
    // make "the timestamp" ambiguous, so the first wins and the rest are left.
    break;
  }

  const origin = originTag(note);
  if (origin) {
    values.push({
      facet: 'origin',
      text: origin.slice(APP_TAG_PREFIX.length),
      evidence: origin,
    });
  }

  if (deckPath) values.push({ facet: 'deck', text: deckPath, evidence: deckPath });

  return { values, unreadableClip };
}

/**
 * What recipe 20 would write, per note, and every note it refused with the
 * reason. Pure: nothing is mutated and no field is written here.
 */
export function planSourceContext(input: SourceContextInput): SourceContextPlan {
  const proposals: SourceContextProposal[] = [];
  const skips: SourceContextSkip[] = [];
  const byFacet = emptyByFacet();
  const separator = input.separator ?? DEFAULT_SOURCE_SEPARATOR;

  const typeById = new Map(input.noteTypes.map((nt) => [nt.id, nt]));
  const deckById = new Map(input.decks.map((d) => [d.id, d]));
  // First card wins: a note's cards live in one deck in every collection this
  // app produces, and a note split across decks has no single "the deck".
  const deckByNote = new Map<string, string>();
  for (const card of input.cards) {
    if (deckByNote.has(card.noteId)) continue;
    const deck = deckById.get(card.deckId);
    if (deck) deckByNote.set(card.noteId, deck.path.join('::'));
  }

  const wanted = new Set(input.facets);
  for (const note of input.notes) {
    const type = typeById.get(note.noteTypeId);
    const def = type?.fields.find((f) => f.name === input.toField);
    // The note type is authoritative, but a source that could not read one still
    // names every value — the same fallback `ankiChangeTray`'s `targetOrds` uses.
    const ord = def?.ord ?? note.fields.find((f) => f.name === input.toField)?.ord;
    if (ord === undefined) {
      skips.push({ noteId: note.id, refusal: 'field-absent', detail: input.toField });
      continue;
    }

    const { values, unreadableClip } = readSourceContext(note, deckByNote.get(note.id) ?? null);
    for (const value of values) {
      if (wanted.has(value.facet)) byFacet[value.facet] += 1;
    }

    const current = note.fields.find((f) => f.ord === ord);
    if ((current?.raw ?? '').trim() !== '') {
      // Checked AFTER the decode so `byFacet` still counts what this note
      // carried: "142 notes have a timestamp and 130 of their Source fields are
      // already filled" is the number that tells the user the run is redundant
      // rather than that their deck has no provenance.
      skips.push({ noteId: note.id, refusal: 'occupied', detail: input.toField });
      continue;
    }

    const chosen = input.facets
      .flatMap((facet) => values.filter((v) => v.facet === facet))
      .filter((v, i, all) => all.findIndex((o) => o.facet === v.facet) === i);
    if (chosen.length === 0) {
      // The unreadable clip is reported only here, where it is the *reason* the
      // note produced nothing. A note that also carries a deck and an origin is
      // restored, and a warning about its file name would be noise.
      skips.push(
        unreadableClip
          ? { noteId: note.id, refusal: 'unreadable-clip', detail: unreadableClip }
          : { noteId: note.id, refusal: 'no-provenance' },
      );
      continue;
    }

    proposals.push({
      noteId: note.id,
      toOrd: ord,
      values: chosen,
      after: chosen.map((v) => v.text).join(separator),
    });
  }

  return { proposals, skips, byFacet };
}

// The .apkg export contract — Phase 6 of ANKI_DECK_WORKBENCH_PLAN.md.
//
// The workbench's dry run already happened in the renderer: the draft holds the
// "after" of every edit and the journal holds every before-image. What export
// ships to the main process is therefore the **net** change set — folded the
// same way step 6's review folds it (`ankiWorkbenchReview.ts`), so a field
// taken A → B → A is not exported and what the user read in the review is
// byte-for-byte what lands in the package.
//
// The main process applies these changes to a fresh read of the SOURCE package
// (never to the renderer's copy), which is why the request carries the draft's
// fingerprint: a source that moved since the read is refused, not clobbered.
// Notes the renderer never loaded ride through the export untouched, so the
// change set being journal-bounded is a correctness property, not a limit.

import type { AnkiCardFlag, AnkiCardQueue, AnkiDraft } from './ankiDraft';
import type { AnkiCardScheduling, AnkiDraftEditJournal } from './ankiDraftEdit';
import { isMintedDeckId } from './ankiDeckSplit';

export interface ApkgExportNoteChange {
  noteId: string;
  /**
   * Complete replacement field values (raw, in ord order) — the whole row, not
   * a patch, so the writer can refuse on a field-count mismatch instead of
   * guessing which field a patch meant. Absent when only tags changed.
   */
  fields?: string[];
  /**
   * Complete replacement tags, in draft space: the `marked` tag is carried as
   * `AnkiDraftNote.marked`, never here, and the journal has no op that changes
   * it — so the writer preserves the source's own marked token verbatim.
   */
  tags?: string[];
}

export interface ApkgExportCardMove {
  cardId: string;
  /** For labelling refusals and verification failures; the write keys on cardId. */
  noteId: string;
  due: number;
}

/**
 * Recipe 12's deck half. A rename is the whole change: a card names its deck by
 * id, so nothing moves and the writer only rewrites the name Anki stores.
 */
export interface ApkgExportDeckRename {
  deckId: string;
  /** The source's name, so the writer can refuse a deck that moved underneath it. */
  from: string;
  to: string;
}

/**
 * Recipe 13's split. Named apart from `ApkgExportCardMove`, which is a *queue
 * position* despite its name: one changes `cards.due`, the other `cards.did`,
 * and folding them together is how a reposition would silently refile a card.
 */
export interface ApkgExportCardDeckMove {
  cardId: string;
  noteId: string;
  /** The draft's deck id, which for a deck the split created is a `split:` id. */
  deckId: string;
}

/**
 * A subdeck recipe 13's split invented, which the writer has to bring into
 * existence before any `cardDeckMoves` targeting it can land. The id here is the
 * planner's minted one; the real Anki id (epoch milliseconds) is allocated by
 * whichever writer creates the row, because only it knows which ids are free.
 *
 * `sanitizeDeckSegment` strips `::` and control characters from every segment a
 * split appends, and a split's parent always exists in the source — so a created
 * deck is always a direct child of a deck that is already there, and no writer
 * has to invent intermediate levels.
 */
export interface ApkgExportDeckCreate {
  /** The planner's minted id, e.g. `split:1:N5`. Never a real Anki id. */
  deckId: string;
  /** Full name in the SOURCE's own separator, exactly as the draft holds it. */
  name: string;
  /** Options preset (`conf`) the split chose — the parent's, so study limits carry. */
  configId?: string;
}

/**
 * Recipe 17's remove half: a redundant card template and everything it generated.
 *
 * **It deliberately carries only the ords.** The renumbering of the survivors
 * and the list of cards to delete are both derivable from the package itself,
 * and a change set that shipped them would be a second opinion that can go stale
 * — a draft read minutes ago naming card ids the package no longer has, or an
 * ord map computed against a template list that has since changed. The writer
 * derives both from the collection it is about to write, so the two cannot
 * disagree.
 */
/**
 * The card designer's reverse / optional-reverse, on its way to a package.
 *
 * It carries the CARDS, not just the template, and that is the whole point:
 * adding a template to a note type does not by itself create a row in `cards`,
 * and the draft has already decided — per note — which ones get one. An
 * optional-reverse whose flag field is empty on 400 notes must add 400 fewer
 * cards than the note type has notes, and only the draft knows that. A writer
 * that generated cards from the template itself would silently disagree with
 * the count the panel showed before Apply.
 */
export interface ApkgExportTemplateAdd {
  /** The note type's id in the SOURCE package (Anki's `mid` / `notetypes.id`). */
  noteTypeId: string;
  /** The new template's ord in the SOURCE numbering — a design only ever appends. */
  ord: number;
  name: string;
  qfmt: string;
  afmt: string;
  bqfmt: string;
  bafmt: string;
  /** `did` override for the cards this template generates, when the design set one. */
  deckOverrideId?: string;
  /**
   * Set when the design ALSO added a field to the note type. The package writer
   * refuses these by name (`template-field-unsupported`) rather than writing
   * half of them: a new field means rewriting every note's `flds` in the source
   * collection, which is a different and much larger change than adding a
   * template, and one the draft's own field ords do not pin down for notes it
   * never paged in.
   */
  addedFieldName?: string;
  /** The rows to insert, one per note the design gave a card to. */
  cards: Array<{ noteId: string; deckId: string; due: number }>;
}

export interface ApkgExportTemplateRemoval {
  /** The note type's id in the SOURCE package (Anki's `mid` / `notetypes.id`). */
  noteTypeId: string;
  /** Ords to remove, in the SOURCE numbering. Ascending, no duplicates. */
  removedOrds: number[];
}

/**
 * Recipe 1's rendered-template variant: two strings rewritten on a template the
 * source already has.
 *
 * It creates and deletes nothing — no card row, no ord, no schedule — which is
 * why it is its own list rather than a degenerate add. Folding it into
 * `templateAdds` would make the writer delete every card the template generated
 * and mint replacements with a fresh schedule, to change two fields.
 *
 * `bqfmt`/`bafmt` are deliberately absent, matching the journal op: the
 * browser-appearance overrides are a separate pair Anki renders in the card list
 * only, and swapping a card's two sides says nothing about them.
 */
export interface ApkgExportTemplateFormat {
  /** The note type's id in the SOURCE package (Anki's `mid` / `notetypes.id`). */
  noteTypeId: string;
  /** The template's ord in the SOURCE numbering, mapped through any removals. */
  ord: number;
  qfmt: string;
  afmt: string;
  /**
   * What the two formats held before this session touched them, carried verbatim
   * so a reversal is exact.
   *
   * Here rather than re-derived from the journal because the two numberings
   * differ: the ops are written in the DRAFT's ord numbering and this row is in
   * the SOURCE's, and an earlier removal makes those disagree. Matching an op
   * back to a row after the fact would re-run that mapping backwards to recover
   * a string the op already has.
   */
  beforeQfmt: string;
  beforeAfmt: string;
}

/**
 * Gate 5's flag third. The DECODED colour, never the raw `cards.flags` column:
 * its upper bits are reserved and are not in the draft, so a writer that took a
 * whole number from here could clear state nothing ever read. The package writer
 * rewrites the low three bits of the stored value and leaves the rest alone.
 */
export interface ApkgExportCardFlag {
  cardId: string;
  /** For labelling refusals; the write keys on cardId, as every card change does. */
  noteId: string;
  flag: AnkiCardFlag;
}

/**
 * Gate 5's suspend third. The full target queue, so a package writer restores
 * exactly what the draft holds; the live commit derives `queue === 'suspended'`
 * from it and lets Anki's own `unsuspend` choose the restored queue, because
 * live that decision is the scheduler's and not this workbench's.
 */
export interface ApkgExportCardQueue {
  cardId: string;
  noteId: string;
  queue: AnkiCardQueue;
}

/** Gate 5's interval/ease third — both columns, because they are one decision. */
export interface ApkgExportCardScheduling extends AnkiCardScheduling {
  cardId: string;
  noteId: string;
}

export interface ApkgExportChangeSet {
  notes: ApkgExportNoteChange[];
  cardMoves: ApkgExportCardMove[];
  deckRenames: ApkgExportDeckRename[];
  /** Absent on a payload written before recipe 13; read tolerantly downstream. */
  cardDeckMoves?: ApkgExportCardDeckMove[];
  /** Decks a `cardDeckMoves` entry targets that the source does not have yet. */
  deckCreates?: ApkgExportDeckCreate[];
  /** Absent on a payload written before recipe 17's remove half. */
  templateRemovals?: ApkgExportTemplateRemoval[];
  /** Absent on a payload written before the card designer gained a destination. */
  templateAdds?: ApkgExportTemplateAdd[];
  /** Absent on a payload written before recipe 1's rendered-template variant. */
  templateFormats?: ApkgExportTemplateFormat[];
  /**
   * The three gate-5 card-state lists, each absent on a payload written before
   * gate 5. Three fields rather than one `cardState` row per card, because the
   * destinations answer them differently — the package writes all three and the
   * live commit refuses flags by name — and a single row would have to be
   * refused or accepted whole.
   */
  cardFlags?: ApkgExportCardFlag[];
  cardQueues?: ApkgExportCardQueue[];
  cardScheduling?: ApkgExportCardScheduling[];
}

// ----- IPC contract -------------------------------------------------------------

export type ApkgExportErrorCode =
  | 'cancelled'
  | 'nothing-to-export'
  | 'no-source'
  | 'source-changed'
  | 'overwrite-source'
  | 'note-missing'
  | 'field-count-mismatch'
  | 'card-missing'
  /** A renamed deck is not in the source package, or it stores no deck list. */
  | 'deck-missing'
  /** The source's deck name is not the one the rename was computed against. */
  | 'deck-changed'
  /** Another deck in the source holds the new name — writing it would merge two decks. */
  | 'deck-name-taken'
  /**
   * The package stores deck names under Anki's own `unicase` collation, which
   * this build's SQLite cannot register — so the name column cannot be written
   * at all. Measured on a real ver-18 package: note fields and tags write fine
   * and only the deck name refuses.
   */
  | 'deck-collation-unsupported'
  /**
   * Recipe 13's split moved a card that is on loan to a filtered deck: its `did`
   * is the filtered deck and its real one lives in `odid`. Writing `did` there
   * would strand it on the next rebuild. `planDeckSplit` refuses these while
   * planning (`filtered-card`), so this is the writer's own backstop against a
   * change set assembled some other way.
   *
   * There is deliberately no `deck-move-unsupported` on either destination any
   * more: the package writer creates the deck rows and rewrites `cards.did`, and
   * the live commit does the same through `createDeck`/`changeDeck`. Both refuse
   * only the cases they genuinely cannot write — see `ankiConnectCommit.ts`.
   */
  | 'card-filtered'
  /** A template removal names a note type the source package does not hold. */
  | 'note-type-missing'
  /**
   * The design also added a FIELD to the note type. Adding a template is a
   * write to the note type and one INSERT per card; adding a field additionally
   * rewrites every note's `flds` in the source collection — including notes a
   * paged draft never held — so it is refused by name instead of half-written.
   * Reuse an existing field as the optional-reverse flag and the design exports.
   */
  | 'template-field-unsupported'
  /** A template add names an ord the source note type already holds. */
  | 'template-ord-taken'
  /**
   * A template add names a template name that note type already has, comparing
   * without case. Anki's `templates.name` carries its own `unicase` collation,
   * which sql.js cannot evaluate — so this uniqueness is checked here instead of
   * being left to the UNIQUE index the write runs without. See
   * `withoutMissingCollation` in `apkgExportCore.ts`.
   */
  | 'template-name-taken'
  /** A template removal names an ord that note type has no template at. */
  | 'template-missing'
  /**
   * A template removal would leave a note type with no templates at all, which
   * generates no cards for any of its notes — the notes would survive as text
   * the user can never be shown again. Refused; `ankiTemplateRemoval.ts` refuses
   * the same case while planning, and this is the writer's own backstop.
   */
  | 'last-template'
  /**
   * The package stores its note types only as protobuf blobs this build cannot
   * re-encode, so a template cannot be removed from it. Distinct from
   * `deck-collation-unsupported` but the same shape of answer: nothing was
   * written, and the user is told which package feature is the obstacle.
   */
  | 'template-storage-unsupported'
  /**
   * A rewritten question format that references no field. Anki renders such a
   * front blank and this workbench's own reader (`decodeTemplateConfig`) returns
   * null for it, so writing one would make the template unreadable on the next
   * import — a silent loss. Refused with the position named.
   */
  | 'template-format-empty'
  /**
   * The template's stored settings blob could not be decoded, so its formats
   * cannot be rewritten byte-preservingly. Refused rather than replaced with a
   * freshly-encoded config, which would drop whatever the source held beyond the
   * four fields this build models — a deck override or browser font.
   */
  | 'template-config-unreadable'
  | 'compressed-unsupported'
  | 'verify-failed'
  | 'io';

export interface ApkgExportRequest {
  /** `AnkiDraftSource.fingerprint` of the draft these changes were computed on. */
  fingerprint: string;
  changes: ApkgExportChangeSet;
  /** Skip the save dialog when set (tests and bridge probes). */
  outPath?: string;
  /**
   * Skip the "locate the original deck" dialog when the main process no longer
   * remembers the fingerprint's path (tests and bridge probes). The fingerprint
   * is still enforced against whatever this names.
   */
  sourcePath?: string;
}

export interface ApkgExportResult {
  ok: boolean;
  /** Where the new package was written. The user chose it in the save dialog. */
  filePath?: string;
  fileName?: string;
  notesUpdated?: number;
  cardsUpdated?: number;
  /** Deck rows written — renamed, or created by a split. Reported apart: no note moves. */
  decksUpdated?: number;
  /** Recipe 17: card templates removed from their note types. */
  templatesRemoved?: number;
  /**
   * Cards those removals deleted. Never folded into `cardsUpdated` — it is the
   * only count here that describes destruction, and a surface that summed the
   * two would report a deletion as an edit.
   */
  cardsDeleted?: number;
  /** The card designer: card templates added to their note types. */
  templatesAdded?: number;
  /** Cards those adds created. Apart from `cardsUpdated` for `cardsDeleted`'s reason. */
  cardsCreated?: number;
  /**
   * Recipe 1's swap: card templates whose two formats were rewritten. Its own
   * count for `ApplyExportResult.templatesFormatted`'s reason — nothing was
   * created or destroyed, so folding it into `templatesAdded` would report a
   * swap as a new template and imply cards that were never minted. A change set
   * of nothing but a swap otherwise reports every count as zero, which reads as
   * an export that did nothing.
   */
  templatesFormatted?: number;
  /** The written file was re-read FROM DISK and every change was found in it. */
  verified?: boolean;
  /** Fingerprint of the new package's collection, for a later commit against it. */
  fingerprint?: string;
  errorCode?: ApkgExportErrorCode;
  error?: string;
}

// ----- net change-set builder ---------------------------------------------------

/** One journal-touched value, with the first before-image — the source's state. */
interface Tracked {
  noteId: string;
  kind: 'field' | 'tags' | 'card-due' | 'card-deck' | 'card-flag' | 'card-queue' | 'card-scheduling';
  fieldOrd?: number;
  cardId?: string;
  firstBefore: string | string[] | number | AnkiCardScheduling;
}

function sameScheduling(a: AnkiCardScheduling, b: AnkiCardScheduling): boolean {
  return a.interval === b.interval && a.easeFactor === b.easeFactor;
}

function sameTags(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((tag, i) => tag === b[i]);
}

/**
 * Fold the journal into the net change set against the draft's current state.
 *
 * Mirrors `buildWorkbenchReview`'s folding on purpose: export must ship exactly
 * the set the review described, or the review was not a dry run of the export.
 * A note the draft no longer holds is skipped here exactly as it is there.
 */
export function buildApkgExportChanges(
  draft: AnkiDraft,
  journal: AnkiDraftEditJournal,
): ApkgExportChangeSet {
  const tracked = new Map<string, Tracked>();
  const deckRenames = new Map<string, { deckId: string; before: string; after: string }>();
  // Removed ords per note type, in the SOURCE numbering — which is not the
  // numbering the ops are written in. See `sourceOrdMaps` below.
  const removedOrds = new Map<string, Set<number>>();
  const sourceOrdMaps = new Map<string, Map<number, number>>();
  // Designs still standing, keyed by note type AND ord: two designs on one note
  // type are two templates, not one folded into the other.
  const added = new Map<string, ApkgExportTemplateAdd>();
  // Keyed by note type AND source ord: two templates reformatted on one note
  // type are two changes, not one folded into the other.
  const templateFormats = new Map<string, ApkgExportTemplateFormat>();
  for (const op of journal.done) {
    if (op.kind === 'template-add') {
      // A design applied twice at the same ord cannot happen — `applyCardDesign`
      // always appends past the last template — so this is an insert, not a fold.
      // What DOES need care is a design later removed: `template-remove` below
      // records the ord, and the two are reconciled after the loop.
      added.set(`${op.noteTypeId}:${op.template.ord}`, {
        noteTypeId: op.noteTypeId,
        ord: op.template.ord,
        name: op.template.name,
        qfmt: op.template.qfmt,
        afmt: op.template.afmt,
        bqfmt: op.template.bqfmt,
        bafmt: op.template.bafmt,
        deckOverrideId: op.template.deckOverrideId,
        addedFieldName: op.addedField?.name,
        cards: op.cards.map((c) => ({ noteId: c.noteId, deckId: c.deckId, due: c.due })),
      });
      continue;
    }
    if (op.kind === 'template-format') {
      // A format edit on a template this same session DESIGNED is not a change
      // to the source — the source has no such template. It belongs in the add,
      // which already carries qfmt/afmt, or the writer would be told to rewrite
      // an ord the package does not have. Keyed in the op's own numbering,
      // which is the numbering `template-add` recorded too.
      const addKey = `${op.noteTypeId}:${op.ord}`;
      const design = added.get(addKey);
      if (design) {
        design.qfmt = op.after.qfmt;
        design.afmt = op.after.afmt;
        continue;
      }
      // Otherwise it names a SOURCE template, so it needs the same current→source
      // mapping a second removal does: an earlier removal renumbers the
      // survivors, and writing the op's own number would reformat the wrong one.
      const mapped = sourceOrdMaps.get(op.noteTypeId);
      const sourceOrd = mapped?.get(op.ord) ?? op.ord;
      // Last write wins for the text, but the FIRST before-image is kept: a
      // template formatted twice exports once, carrying the second edit's text
      // and the state the source actually held — the intermediate value was
      // never in the package and reverting to it would be a write with no cause.
      const key = `${op.noteTypeId}:${sourceOrd}`;
      const seen = templateFormats.get(key);
      if (seen) {
        seen.qfmt = op.after.qfmt;
        seen.afmt = op.after.afmt;
        continue;
      }
      templateFormats.set(key, {
        noteTypeId: op.noteTypeId,
        ord: sourceOrd,
        qfmt: op.after.qfmt,
        afmt: op.after.afmt,
        beforeQfmt: op.before.qfmt,
        beforeAfmt: op.before.afmt,
      });
      continue;
    }
    if (op.kind === 'deck-name') {
      // Folded like every other op: a deck renamed twice exports once, and one
      // renamed back to its source name exports not at all.
      const first = deckRenames.get(op.deckId);
      if (first) first.after = op.after;
      else deckRenames.set(op.deckId, { deckId: op.deckId, before: op.before, after: op.after });
      continue;
    }
    if (op.kind === 'template-remove') {
      // **A second removal on the same note type names an ord the FIRST removal
      // renumbered.** Source [0,1,2], drop ord 1 → survivors renumber to [0,1],
      // and a later op removing "ord 1" means source ord 2. Exporting the op's
      // own number would delete the wrong template — the one the user kept.
      // So each note type carries a current→source map, rebuilt after every
      // removal from that op's own `renumbered` pairs. Absent key = identity,
      // which is exactly right for the first removal, when the two numberings
      // are the same.
      const mapped = sourceOrdMaps.get(op.noteTypeId) ?? new Map<number, number>();
      const sourceOrd = (ord: number): number => mapped.get(ord) ?? ord;

      let ords = removedOrds.get(op.noteTypeId);
      if (!ords) {
        ords = new Set<number>();
        removedOrds.set(op.noteTypeId, ords);
      }
      ords.add(sourceOrd(op.template.ord));

      const next = new Map<number, number>();
      // Survivors that moved carry their source ord to the new position.
      for (const r of op.renumbered) next.set(r.to, sourceOrd(r.from));
      // Survivors that did not move keep whatever they already had.
      const moved = new Set(op.renumbered.map((r) => r.from));
      for (const [current, source] of mapped) {
        if (current === op.template.ord || moved.has(current)) continue;
        next.set(current, source);
      }
      sourceOrdMaps.set(op.noteTypeId, next);
      continue;
    }
    // The kind is part of the key: `card-due` and `card-deck` both name a card,
    // and one key for both would let a split swallow a reposition of the same
    // card — the second op would fold into the first and never export.
    const key =
      op.kind === 'field'
        ? `f:${op.noteId}:${op.fieldOrd}`
        : op.kind === 'tags'
          ? `t:${op.noteId}`
          : `c:${op.kind}:${op.cardId}`;
    if (tracked.has(key)) continue;
    tracked.set(key, {
      noteId: op.noteId,
      kind: op.kind,
      fieldOrd: op.kind === 'field' ? op.fieldOrd : undefined,
      cardId: op.kind === 'field' || op.kind === 'tags' ? undefined : op.cardId,
      firstBefore: op.before,
    });
  }

  const noteById = new Map(draft.notes.map((n) => [n.id, n]));
  const cardById = new Map(draft.cards.map((c) => [c.id, c]));

  const fieldNotes = new Set<string>();
  const tagNotes = new Set<string>();
  const cardMoves: ApkgExportCardMove[] = [];
  const cardDeckMoves: ApkgExportCardDeckMove[] = [];
  const cardFlags: ApkgExportCardFlag[] = [];
  const cardQueues: ApkgExportCardQueue[] = [];
  const cardScheduling: ApkgExportCardScheduling[] = [];

  for (const entry of tracked.values()) {
    if (entry.kind === 'field') {
      const field = noteById
        .get(entry.noteId)
        ?.fields.find((f) => f.ord === entry.fieldOrd);
      if (field && field.raw !== entry.firstBefore) fieldNotes.add(entry.noteId);
    } else if (entry.kind === 'tags') {
      const note = noteById.get(entry.noteId);
      if (note && !sameTags(entry.firstBefore as string[], note.tags)) tagNotes.add(entry.noteId);
    } else if (entry.kind === 'card-deck') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (card && card.deckId !== entry.firstBefore) {
        cardDeckMoves.push({ cardId: card.id, noteId: entry.noteId, deckId: card.deckId });
      }
    } else if (entry.kind === 'card-flag') {
      // Re-read against the draft exactly as a field is: a flag set and cleared
      // again in one session is not a change and must not export.
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (card && card.flag !== entry.firstBefore) {
        cardFlags.push({ cardId: card.id, noteId: entry.noteId, flag: card.flag });
      }
    } else if (entry.kind === 'card-queue') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (card && card.queue !== entry.firstBefore) {
        cardQueues.push({ cardId: card.id, noteId: entry.noteId, queue: card.queue });
      }
    } else if (entry.kind === 'card-scheduling') {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      const before = entry.firstBefore as AnkiCardScheduling;
      if (card && !sameScheduling(before, { interval: card.interval, easeFactor: card.easeFactor })) {
        cardScheduling.push({
          cardId: card.id,
          noteId: entry.noteId,
          interval: card.interval,
          easeFactor: card.easeFactor,
        });
      }
    } else {
      const card = entry.cardId ? cardById.get(entry.cardId) : undefined;
      if (card && card.due !== entry.firstBefore) {
        cardMoves.push({ cardId: card.id, noteId: entry.noteId, due: card.due });
      }
    }
  }

  const notes: ApkgExportNoteChange[] = [];
  for (const noteId of new Set([...fieldNotes, ...tagNotes])) {
    const note = noteById.get(noteId);
    if (!note) continue;
    notes.push({
      noteId,
      fields: fieldNotes.has(noteId)
        ? [...note.fields].sort((a, b) => a.ord - b.ord).map((f) => f.raw)
        : undefined,
      tags: tagNotes.has(noteId) ? [...note.tags] : undefined,
    });
  }

  const deckRenamed: ApkgExportDeckRename[] = [];
  for (const rename of deckRenames.values()) {
    // The deck's *current* draft name, not the op's, for the same reason a field
    // is re-read above: an undone rename must not export.
    const deck = draft.decks.find((d) => d.id === rename.deckId);
    if (!deck || deck.name === rename.before) continue;
    deckRenamed.push({ deckId: rename.deckId, from: rename.before, to: deck.name });
  }

  // Only the decks the surviving moves actually target: a split whose moves were
  // all undone folds to nothing above, and shipping its invented decks anyway
  // would write empty subdecks into the package for an edit the user took back.
  const deckCreates: ApkgExportDeckCreate[] = [];
  const creating = new Set<string>();
  for (const move of cardDeckMoves) {
    if (!isMintedDeckId(move.deckId) || creating.has(move.deckId)) continue;
    const deck = draft.decks.find((d) => d.id === move.deckId);
    if (!deck) continue; // The writer refuses the move by name; do not invent one here.
    creating.add(move.deckId);
    deckCreates.push({ deckId: deck.id, name: deck.name, configId: deck.configId });
  }

  // Only note types the draft still holds. Unlike a deck rename there is nothing
  // to re-read against — a removed template is gone from the draft, so its
  // absence cannot distinguish "removed" from "undone"; an undone removal is
  // instead already absent from `journal.done`, which is what folds it away.
  // A design the user then removed must cancel, and it cannot be left to the
  // removal alone: the added template has no ord in the SOURCE package, so
  // exporting the removal would refuse `template-missing` against a template the
  // source never had. Re-read against the draft, exactly as a deck rename is —
  // if the note type no longer holds this template, the design is gone.
  const templateAdds: ApkgExportTemplateAdd[] = [];
  const cancelled = new Set<string>();
  for (const [key, add] of added) {
    const noteType = draft.noteTypes.find((nt) => nt.id === add.noteTypeId);
    const still = noteType?.templates.find((t) => t.ord === add.ord && t.name === add.name);
    if (!noteType || !still) {
      cancelled.add(key);
      continue;
    }
    templateAdds.push(add);
  }

  const templateRemovals: ApkgExportTemplateRemoval[] = [];
  for (const [noteTypeId, ords] of removedOrds) {
    // Ords that only ever existed because a design created them: removing one is
    // the cancel above and nothing needs to reach the package.
    const real = [...ords].filter((ord) => !cancelled.has(`${noteTypeId}:${ord}`));
    if (real.length === 0) continue;
    if (!draft.noteTypes.some((nt) => nt.id === noteTypeId)) continue;
    templateRemovals.push({ noteTypeId, removedOrds: real.sort((a, b) => a - b) });
  }

  // A template formatted and then REMOVED must not reach the writer: the ord is
  // gone from the destination, so the rewrite would refuse `template-missing`
  // against a template the export itself deleted. Re-read against the draft for
  // the same reason the adds are — if the note type or the ord is no longer
  // there, the format has nothing to apply to.
  const templateFormatted: ApkgExportTemplateFormat[] = [];
  for (const format of templateFormats.values()) {
    if (removedOrds.get(format.noteTypeId)?.has(format.ord)) continue;
    if (!draft.noteTypes.some((nt) => nt.id === format.noteTypeId)) continue;
    // Swapped and swapped back is not a change, exactly as a deck renamed to its
    // source name exports not at all. Without this, a user who tried the swap and
    // undid it by re-swapping would still write a package.
    if (format.qfmt === format.beforeQfmt && format.afmt === format.beforeAfmt) continue;
    templateFormatted.push(format);
  }
  templateFormatted.sort((a, b) =>
    a.noteTypeId === b.noteTypeId ? a.ord - b.ord : a.noteTypeId.localeCompare(b.noteTypeId),
  );

  return {
    notes,
    cardMoves,
    deckRenames: deckRenamed,
    cardDeckMoves,
    deckCreates,
    templateRemovals,
    templateAdds,
    templateFormats: templateFormatted,
    cardFlags,
    cardQueues,
    cardScheduling,
  };
}

/** True when the change set carries nothing to write. */
export function exportChangesEmpty(changes: ApkgExportChangeSet): boolean {
  // Every field is read tolerantly: this runs on a payload that crossed IPC,
  // and a request written before a field existed must read as "none of those"
  // rather than throw on the way to the writer.
  //
  // `notes` and `cardMoves` were the two exceptions until a live run through
  // `anki:exportCsvDraft` sent `{ notes: [] }` and got
  // `TypeError: Cannot read properties of undefined (reading 'length')` back
  // across IPC instead of the `nothing-to-export` refusal this guard exists to
  // return. A raw TypeError arriving at a user as an export failure is exactly
  // the dishonest state the refusal codes are for, and the split was never
  // deliberate — these two are simply the oldest fields.
  return (
    (changes.notes ?? []).length === 0 &&
    (changes.cardMoves ?? []).length === 0 &&
    (changes.deckRenames ?? []).length === 0 &&
    (changes.cardDeckMoves ?? []).length === 0 &&
    // A removal-only change set touches no note and no card row the other four
    // fields describe, so leaving it out here would report `nothing-to-export`
    // about a package that has a template to drop.
    (changes.templateRemovals ?? []).length === 0 &&
    // And the add, which is the same shape pointed the other way: a session
    // whose only edit was a reverse-card design writes no note and no `due`.
    (changes.templateAdds ?? []).length === 0 &&
    // A front/back swap is the narrowest of the three: it writes no note, no
    // card row and no ord, so without this line a session whose only edit was
    // the swap would report `nothing-to-export` about a real change.
    (changes.templateFormats ?? []).length === 0 &&
    // Gate 5's three, for the same reason: a session that only suspended cards
    // writes no note and no `due`, and would otherwise export as nothing.
    (changes.cardFlags ?? []).length === 0 &&
    (changes.cardQueues ?? []).length === 0 &&
    (changes.cardScheduling ?? []).length === 0
  );
}

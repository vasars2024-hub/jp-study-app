// Remove a redundant card template — ANKI_DECK_WORKBENCH_PLAN.md Phase 7,
// recipe 17's *remove* half. `ankiSiblingAudit.ts` is the audit half and this
// module never re-decides its verdicts: it consumes them.
//
// **Only `duplicate` is removable, and that is the whole reason the audit has
// five verdicts instead of one.** Two templates with the same question and the
// same answer waste the user's time and either one can go with nothing lost.
// `ambiguous` is the same question with DIFFERENT answers, so removing either
// side silently drops content the user is still being graded on — it is refused
// by name here rather than merely left out of the offer, because a surface that
// assembled the request some other way must hit the same wall. `orphan` is a
// card whose ord names no template at all: there is no template to remove, and
// the fix is deleting the card, which is Anki's own "Empty cards" tool.
//
// **Renumbering is the load-bearing half, not bookkeeping.** Anki binds a card
// to its template by `ord` alone. Dropping ord 1 of [0,1,2] and leaving the rest
// alone turns every ord-2 card into a card whose ord names no template — which
// is precisely the `orphan` verdict this recipe exists to clean up. So the
// removal renumbers the surviving templates AND their cards in one pass, and
// `templateRemovalOrphans` below is the assertion that says it worked.
//
// **All removals on one note type renumber together, never one after another.**
// Removing ords 1 and 3 of [0,1,2,3,4] sequentially would compute the second
// shift against a numbering the first shift had already changed, landing 3 on
// the wrong template. The plan collects every removed ord first and maps each
// survivor to its rank among the survivors.
//
// **The draft is the only thing this module writes.** Whether a destination can
// then land it is that destination's own answer: the package writer rewrites the
// note type and the card rows, and the live commit refuses by name because
// AnkiConnect has no remove-template action.

import type { AnkiDraft, AnkiDraftNoteType } from './ankiDraft';
import type { TemplateGroup } from './ankiSiblingAudit';

export type TemplateRemovalRefusal =
  /** The named note type is not in the draft. */
  | 'note-type-missing'
  /** The ord is not a template of that note type. */
  | 'template-missing'
  /** Cloze cards come from field markers, so there is no per-card template. */
  | 'cloze'
  /** No `duplicate` group of this note type lists that ord as a non-keeper. */
  | 'not-duplicate'
  /** The ord is the one the audit chose to keep — its group's lowest. */
  | 'is-keeper'
  /** Removing it would leave the note type with no templates and no cards. */
  | 'last-template';

/** One template that will actually be removed, with everything it costs. */
export interface TemplateRemoval {
  noteTypeId: string;
  noteTypeName: string;
  /** The removed template's ord in the SOURCE numbering. */
  ord: number;
  name: string;
  /** The group's lowest ord, which survives and answers the same question. */
  keptOrd: number;
  keptName: string;
  /** Ids of the cards this removal deletes, ascending by note order. */
  cardIds: string[];
  /** Distinct notes that lose a card. Never larger than `cardIds.length`. */
  noteCount: number;
}

export interface TemplateRemovalSkip {
  noteTypeId: string;
  /** The ord that was asked for; `-1` when the note type itself is missing. */
  ord: number;
  refusal: TemplateRemovalRefusal;
  /** The note type's name when it is known, so a row can say more than an id. */
  detail?: string;
}

/** Source ord to its ord after the removals, for one note type. */
export interface TemplateRenumber {
  noteTypeId: string;
  from: number;
  to: number;
}

export interface TemplateRemovalPlan {
  removals: TemplateRemoval[];
  skips: TemplateRemovalSkip[];
  /** Survivors whose ord moved. A removal at the end of the list produces none. */
  renumbered: TemplateRenumber[];
  /** Cards deleted across every removal. */
  removedCards: number;
  /** The draft after every removal, renumbered. Identical object when nothing ran. */
  draft: AnkiDraft;
}

/** What a caller asks for: some ords of one note type. */
export interface TemplateRemovalRequest {
  noteTypeId: string;
  removeOrds: number[];
}

/**
 * Every ord a `duplicate` group says may be removed, by note type.
 *
 * The group's `ords` are ascending and the audit's contract is that the first is
 * the keeper, so the removable set is everything after it. An `ambiguous` group
 * contributes nothing — deliberately, so that a request naming one of its ords
 * comes back `not-duplicate` rather than being quietly honoured because the same
 * ord also appears in an overlapping duplicate pair.
 */
export function removableTemplateOrds(
  groups: readonly TemplateGroup[],
): Map<string, Map<number, number>> {
  const byType = new Map<string, Map<number, number>>();
  for (const group of groups) {
    if (group.verdict !== 'duplicate') continue;
    let ords = byType.get(group.noteTypeId);
    if (!ords) {
      ords = new Map<number, number>();
      byType.set(group.noteTypeId, ords);
    }
    // Value is the keeper the removal is justified by, so a plan row can name
    // which surviving template still asks the question.
    for (const ord of group.ords.slice(1)) ords.set(ord, group.ords[0]);
  }
  return byType;
}

/** Ords that are a duplicate group's keeper, so `is-keeper` can be told apart. */
function keeperOrds(groups: readonly TemplateGroup[]): Map<string, Set<number>> {
  const byType = new Map<string, Set<number>>();
  for (const group of groups) {
    if (group.verdict !== 'duplicate') continue;
    let ords = byType.get(group.noteTypeId);
    if (!ords) {
      ords = new Set<number>();
      byType.set(group.noteTypeId, ords);
    }
    ords.add(group.ords[0]);
  }
  return byType;
}

function templateName(noteType: AnkiDraftNoteType, ord: number): string {
  return noteType.templates.find((t) => t.ord === ord)?.name ?? `Card ${ord + 1}`;
}

/**
 * Which templates a set of requests may remove, and what each one deletes.
 *
 * Validation only — `applyTemplateRemoval` does the writing. Split that way so a
 * surface can show the cost before anything is folded into a draft, and so the
 * refusals are reachable from a test without building an after-draft.
 */
export function planTemplateRemoval(
  draft: AnkiDraft,
  groups: readonly TemplateGroup[],
  requests: readonly TemplateRemovalRequest[],
): { removals: TemplateRemoval[]; skips: TemplateRemovalSkip[] } {
  const removable = removableTemplateOrds(groups);
  const keepers = keeperOrds(groups);
  const removals: TemplateRemoval[] = [];
  const skips: TemplateRemovalSkip[] = [];

  for (const request of requests) {
    const noteType = draft.noteTypes.find((nt) => nt.id === request.noteTypeId);
    if (!noteType) {
      skips.push({ noteTypeId: request.noteTypeId, ord: -1, refusal: 'note-type-missing' });
      continue;
    }
    if (noteType.kind === 'cloze') {
      for (const ord of request.removeOrds) {
        skips.push({
          noteTypeId: noteType.id,
          ord,
          refusal: 'cloze',
          detail: noteType.name,
        });
      }
      continue;
    }

    const typeRemovable = removable.get(noteType.id);
    const typeKeepers = keepers.get(noteType.id);
    const wanted = [...new Set(request.removeOrds)].sort((a, b) => a - b);
    // Counted per note type rather than per request, so two requests naming the
    // same note type cannot each believe a template is left standing.
    const surviving = noteType.templates.filter((t) => !wanted.includes(t.ord)).length;

    for (const ord of wanted) {
      if (!noteType.templates.some((t) => t.ord === ord)) {
        skips.push({
          noteTypeId: noteType.id,
          ord,
          refusal: 'template-missing',
          detail: noteType.name,
        });
        continue;
      }
      if (surviving < 1) {
        skips.push({
          noteTypeId: noteType.id,
          ord,
          refusal: 'last-template',
          detail: noteType.name,
        });
        continue;
      }
      const keptOrd = typeRemovable?.get(ord);
      if (keptOrd === undefined) {
        skips.push({
          noteTypeId: noteType.id,
          ord,
          // `is-keeper` is a distinct row because "that template is the one being
          // kept" and "no duplicate group covers it" send the user to different
          // fixes, and a single `not-duplicate` would be false about the keeper.
          refusal: typeKeepers?.has(ord) ? 'is-keeper' : 'not-duplicate',
          detail: noteType.name,
        });
        continue;
      }

      const noteIds = new Set(
        draft.notes.filter((n) => n.noteTypeId === noteType.id).map((n) => n.id),
      );
      const doomed = draft.cards.filter((c) => c.ord === ord && noteIds.has(c.noteId));
      removals.push({
        noteTypeId: noteType.id,
        noteTypeName: noteType.name,
        ord,
        name: templateName(noteType, ord),
        keptOrd,
        keptName: templateName(noteType, keptOrd),
        cardIds: doomed.map((c) => c.id),
        noteCount: new Set(doomed.map((c) => c.noteId)).size,
      });
    }
  }

  return { removals, skips };
}

/**
 * Fold a set of removals into a draft: drop the templates, delete their cards,
 * and renumber every survivor on both sides.
 *
 * Returns the input draft object unchanged when nothing is removable, so a
 * caller can compare by identity the way the tray's other planners allow.
 */
export function applyTemplateRemoval(
  draft: AnkiDraft,
  groups: readonly TemplateGroup[],
  requests: readonly TemplateRemovalRequest[],
): TemplateRemovalPlan {
  const { removals, skips } = planTemplateRemoval(draft, groups, requests);
  if (removals.length === 0) {
    return { removals, skips, renumbered: [], removedCards: 0, draft };
  }

  const removedByType = new Map<string, Set<number>>();
  for (const removal of removals) {
    let ords = removedByType.get(removal.noteTypeId);
    if (!ords) {
      ords = new Set<number>();
      removedByType.set(removal.noteTypeId, ords);
    }
    ords.add(removal.ord);
  }

  // One map per note type, built from the survivors' rank — not from "subtract
  // the number removed below me" applied removal by removal, which is the same
  // arithmetic only when the removals are processed in descending order and is
  // silently wrong otherwise.
  const renumberByType = new Map<string, Map<number, number>>();
  const renumbered: TemplateRenumber[] = [];
  for (const [noteTypeId, removedOrds] of removedByType) {
    const noteType = draft.noteTypes.find((nt) => nt.id === noteTypeId);
    if (!noteType) continue;
    const survivors = noteType.templates
      .filter((t) => !removedOrds.has(t.ord))
      .sort((a, b) => a.ord - b.ord);
    const map = new Map<number, number>();
    survivors.forEach((tpl, index) => {
      map.set(tpl.ord, index);
      if (tpl.ord !== index) renumbered.push({ noteTypeId, from: tpl.ord, to: index });
    });
    renumberByType.set(noteTypeId, map);
  }

  const noteTypes = draft.noteTypes.map((noteType) => {
    const removedOrds = removedByType.get(noteType.id);
    if (!removedOrds) return noteType;
    const map = renumberByType.get(noteType.id) ?? new Map<number, number>();
    return {
      ...noteType,
      templates: noteType.templates
        .filter((t) => !removedOrds.has(t.ord))
        .sort((a, b) => a.ord - b.ord)
        .map((t) => ({ ...t, ord: map.get(t.ord) ?? t.ord })),
    };
  });

  // Note type is resolved through the card's note, because `ord` alone is not
  // unique across a collection — every note type numbers from 0.
  const noteTypeOfNote = new Map(draft.notes.map((n) => [n.id, n.noteTypeId]));
  const doomedCardIds = new Set(removals.flatMap((r) => r.cardIds));
  const cards = draft.cards
    .filter((card) => !doomedCardIds.has(card.id))
    .map((card) => {
      const noteTypeId = noteTypeOfNote.get(card.noteId);
      if (noteTypeId === undefined) return card;
      const map = renumberByType.get(noteTypeId);
      const next = map?.get(card.ord);
      // An ord with no entry is one no surviving template generates — an orphan
      // that was already there. It is preserved rather than renumbered, so this
      // module never invents a binding the audit did not find.
      return next === undefined || next === card.ord ? card : { ...card, ord: next };
    });

  return {
    removals,
    skips,
    renumbered,
    removedCards: doomedCardIds.size,
    draft: { ...draft, noteTypes, cards },
  };
}

/**
 * Cards left holding an ord no template of their note type generates.
 *
 * This is the negative control for a removal, not a diagnostic: renumbering the
 * templates without renumbering the cards is the one way this module can fail,
 * and its failure mode is producing exactly the `orphan` verdict recipe 17
 * exists to remove. A test asserts this is 0 *after* a removal and non-zero when
 * the card renumbering is disabled.
 */
export function templateRemovalOrphans(draft: AnkiDraft): number {
  const ordsByType = new Map<string, Set<number>>();
  for (const noteType of draft.noteTypes) {
    if (noteType.kind === 'cloze') continue;
    ordsByType.set(noteType.id, new Set(noteType.templates.map((t) => t.ord)));
  }
  const noteTypeOfNote = new Map(draft.notes.map((n) => [n.id, n.noteTypeId]));
  let orphans = 0;
  for (const card of draft.cards) {
    const noteTypeId = noteTypeOfNote.get(card.noteId);
    if (noteTypeId === undefined) continue;
    const ords = ordsByType.get(noteTypeId);
    if (!ords) continue; // cloze, whose ords are marker numbers and not templates
    if (!ords.has(card.ord)) orphans += 1;
  }
  return orphans;
}

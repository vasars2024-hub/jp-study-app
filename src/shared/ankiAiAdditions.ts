// Reviewed AI additions for the Deck Workbench — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 4 ("generate several alternatives ... let the user approve, edit,
// regenerate, or reject per card or in batches") and its gate 12.
//
// This is the pure half: given what a provider returned for a batch of notes,
// which text may be written, what the user still has to decide, and what has to
// be said out loud about the rest. Nothing here calls a provider, reads a draft
// or writes a field — `ankiChangeTray.ts` owns those, exactly as it does for
// `ankiEnrich.ts`.
//
// Four rules gate 12 turns on:
//
// **Generation is a proposal; only a decision writes.** The plan's exclusions
// forbid "AI translation or generation without visible provider/privacy/cost
// state and a reviewed diff", so a variant nobody accepted or refused is not a
// value the workbench may apply. It blocks the plan instead of quietly picking
// the first alternative, which is the failure this whole module exists to make
// impossible.
//
// **A rejection is kept, not deleted.** Gate 12 asks to "verify that
// rejected/generated data is represented honestly". A rejected variant that
// vanished would leave the user unable to see what the model actually proposed,
// unable to change their mind, and unable to tell a rejected note from one the
// provider never answered for. So rejection is a flag on a retained variant.
//
// **A refusal is not a failure.** "Retry only failures" means the provider
// erred — a timeout, a refusal, a truncated answer. A note the user rejected is
// a finished decision and a note they cancelled is a withdrawn request; putting
// either back on the wire would spend the user's money re-asking a question they
// already answered. `aiRetryTargets` returns `failed` and nothing else.
//
// **Generated text is marked as generated, always.** Dictionary provenance is
// optional because a gloss is a quotation the user may not want printed on the
// card. Generated prose is different: unmarked, it reads as a dictionary
// quotation or as the user's own sentence, which is the specific
// misrepresentation the plan forbids. There is therefore no `none` mode here.

/** What an addition generates. The learning aids gate 12 names, plus the sentence itself. */
export type AiAdditionKind =
  /** A natural sentence using the note's word. */
  | 'example-sentence'
  /** A translation of that sentence into the study language. */
  | 'sentence-translation'
  /** A concise definition in the user's own language. */
  | 'definition'
  /** A memory aid for the word's form or meaning. */
  | 'mnemonic'
  /** Register, nuance, or when *not* to use the word. */
  | 'usage-note'
  /** A partial clue that does not give the answer away. */
  | 'hint';

/**
 * How a requested note ended up.
 *
 * `pending` is a real state, not an absence: a batch is created for the whole
 * selection so that cancelling it can say how much of the work had already
 * happened. Without it, a cancelled batch and a batch that was never run look
 * identical, and a partial result gets reported as a complete one.
 */
export type AiNoteStatus = 'pending' | 'generated' | 'failed' | 'cancelled';

export interface AiVariant {
  id: string;
  text: string;
  /**
   * The user refused this alternative. Retained rather than removed so the
   * review stays auditable and reversible — see the module note.
   */
  rejected?: boolean;
}

export interface AiNoteGeneration {
  noteId: string;
  /** The word the request was about, for display and for retry. */
  term: string;
  status: AiNoteStatus;
  /** Empty unless `status` is `generated`. */
  variants: AiVariant[];
  /** The one variant that may be written. Absent until the user approves one. */
  approvedVariantId?: string;
  /** The provider's message for `failed`. Never a translated string. */
  error?: string;
}

/**
 * One generation run over a selection.
 *
 * `provider` and `model` are on the batch rather than the note because the whole
 * point of showing them is that the user knows who saw their deck; a per-note
 * value would let half a batch go somewhere the summary does not mention.
 */
export interface AiBatch {
  id: string;
  kind: AiAdditionKind;
  /** The provider id shown before the run and recorded in provenance. */
  provider: string;
  /** The model id, same. */
  model: string;
  notes: AiNoteGeneration[];
}

/** Build the batch for a selection, before any provider has answered. */
export function beginAiBatch(
  id: string,
  kind: AiAdditionKind,
  provider: string,
  model: string,
  requests: ReadonlyArray<{ noteId: string; term: string }>,
): AiBatch {
  return {
    id,
    kind,
    provider,
    model,
    notes: requests.map(({ noteId, term }) => ({
      noteId,
      term,
      status: 'pending',
      variants: [],
    })),
  };
}

function mapNote(
  batch: AiBatch,
  noteId: string,
  fn: (note: AiNoteGeneration) => AiNoteGeneration,
): AiBatch {
  return { ...batch, notes: batch.notes.map((n) => (n.noteId === noteId ? fn(n) : n)) };
}

// ----- recording what came back ----------------------------------------------

/**
 * Record a provider answer for one note.
 *
 * A note that already carries a decision is left alone: a late answer for a
 * request the user has finished with must not silently replace their review.
 */
export function recordAiResult(
  batch: AiBatch,
  noteId: string,
  result:
    | { ok: true; variants: ReadonlyArray<{ id: string; text: string }> }
    | { ok: false; error: string },
): AiBatch {
  return mapNote(batch, noteId, (note) => {
    if (note.approvedVariantId) return note;
    if (!result.ok) {
      return { ...note, status: 'failed', variants: [], error: result.error };
    }
    // An answer with no usable alternative is a failure of the request, not an
    // empty success — a note showing zero variants and no error reads as
    // "reviewed and found nothing", which nobody decided.
    const variants = result.variants
      .map((v) => ({ id: v.id, text: v.text.trim() }))
      .filter((v) => v.text.length > 0);
    if (variants.length === 0) {
      return { ...note, status: 'failed', variants: [], error: 'no-variants' };
    }
    return { ...note, status: 'generated', variants, error: undefined };
  });
}

/**
 * Stop a running batch. Every note still waiting becomes `cancelled`; everything
 * already answered keeps its result and its review.
 *
 * Cancelling deliberately does not discard completed work. The user stopped the
 * spend, not the twelve good sentences they already have.
 */
export function cancelAiBatch(batch: AiBatch): AiBatch {
  return {
    ...batch,
    notes: batch.notes.map((n) => (n.status === 'pending' ? { ...n, status: 'cancelled' } : n)),
  };
}

// ----- the review -------------------------------------------------------------

/**
 * Approve one variant. At most one per note, because one field receives one
 * value — approving a second moves the approval rather than accumulating a
 * second answer the writer would have to choose between.
 *
 * Approving a previously rejected variant clears the rejection: changing your
 * mind is a normal review action, and leaving it flagged would report the
 * written value as rejected.
 */
export function approveAiVariant(batch: AiBatch, noteId: string, variantId: string): AiBatch {
  return mapNote(batch, noteId, (note) => {
    if (note.status !== 'generated') return note;
    if (!note.variants.some((v) => v.id === variantId)) return note;
    return {
      ...note,
      approvedVariantId: variantId,
      variants: note.variants.map((v) =>
        v.id === variantId ? { ...v, rejected: undefined } : v,
      ),
    };
  });
}

/** Refuse one variant. Refusing the approved one leaves the note undecided. */
export function rejectAiVariant(batch: AiBatch, noteId: string, variantId: string): AiBatch {
  return mapNote(batch, noteId, (note) => {
    if (note.status !== 'generated') return note;
    if (!note.variants.some((v) => v.id === variantId)) return note;
    return {
      ...note,
      approvedVariantId: note.approvedVariantId === variantId ? undefined : note.approvedVariantId,
      variants: note.variants.map((v) => (v.id === variantId ? { ...v, rejected: true } : v)),
    };
  });
}

/** Undo a decision on one variant, returning it to undecided. */
export function clearAiDecision(batch: AiBatch, noteId: string, variantId: string): AiBatch {
  return mapNote(batch, noteId, (note) => ({
    ...note,
    approvedVariantId: note.approvedVariantId === variantId ? undefined : note.approvedVariantId,
    variants: note.variants.map((v) => (v.id === variantId ? { ...v, rejected: undefined } : v)),
  }));
}

// ----- retry ------------------------------------------------------------------

/**
 * The notes a retry may re-request: the ones the provider failed on, and only
 * those. See the module note — a rejection and a cancellation are decisions, and
 * re-asking would spend money undoing them.
 */
export function aiRetryTargets(batch: AiBatch): string[] {
  return batch.notes.filter((n) => n.status === 'failed').map((n) => n.noteId);
}

/**
 * Put the failed notes back into `pending` for a re-request. Notes that did not
 * fail are untouched, so a retry can never disturb an approval already made.
 */
export function beginAiRetry(batch: AiBatch): AiBatch {
  return {
    ...batch,
    notes: batch.notes.map((n) =>
      n.status === 'failed' ? { ...n, status: 'pending', error: undefined } : n,
    ),
  };
}

// ----- what the review adds up to --------------------------------------------

export interface AiReviewSummary {
  /** Notes the batch requested. */
  requested: number;
  /** Notes with an approved variant — exactly what would be written. */
  approved: number;
  /** Notes that produced variants but carry no approval yet. */
  undecided: number;
  /** Notes whose every variant was rejected. A finished decision to write nothing. */
  allRejected: number;
  failed: number;
  cancelled: number;
  /** Still waiting on the provider. */
  pending: number;
  /** Individual alternatives refused, across the batch. */
  rejectedVariants: number;
}

export function summarizeAiReview(batch: AiBatch): AiReviewSummary {
  const summary: AiReviewSummary = {
    requested: batch.notes.length,
    approved: 0,
    undecided: 0,
    allRejected: 0,
    failed: 0,
    cancelled: 0,
    pending: 0,
    rejectedVariants: 0,
  };
  for (const note of batch.notes) {
    summary.rejectedVariants += note.variants.filter((v) => v.rejected).length;
    if (note.status === 'failed') summary.failed += 1;
    else if (note.status === 'cancelled') summary.cancelled += 1;
    else if (note.status === 'pending') summary.pending += 1;
    else if (note.approvedVariantId) summary.approved += 1;
    else if (note.variants.every((v) => v.rejected)) summary.allRejected += 1;
    else summary.undecided += 1;
  }
  return summary;
}

/** One note's approved text, with who produced it. */
export interface AiApprovedAddition {
  noteId: string;
  text: string;
}

/**
 * Exactly the notes that may be written, in batch order.
 *
 * This is the only path from a generation to a field. A caller cannot reach the
 * variants any other way without saying it is ignoring the review.
 */
export function approvedAiAdditions(batch: AiBatch): AiApprovedAddition[] {
  const out: AiApprovedAddition[] = [];
  for (const note of batch.notes) {
    if (!note.approvedVariantId) continue;
    const variant = note.variants.find((v) => v.id === note.approvedVariantId);
    if (!variant || variant.rejected || !variant.text) continue;
    out.push({ noteId: note.noteId, text: variant.text });
  }
  return out;
}

// ----- inline provenance ------------------------------------------------------

/** The attribute the wrapper carries: `provider|model`. Read by `readAiProvenance`. */
export const AI_PROVENANCE_ATTR = 'data-jp-ai';

/**
 * The class the wrapper carries. Deliberately not `ankiEnrich`'s
 * `jp-dict-src`: a card template that styles dictionary quotations must be able
 * to style generated prose differently, and a reader grepping an exported deck
 * must be able to tell the two apart without knowing the attribute names.
 */
export const AI_PROVENANCE_CLASS = 'jp-ai-gen';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function unescapeAttr(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Mark a generated value as generated, naming who generated it.
 *
 * Unlike `wrapEnrichProvenance` there is no mode to turn this off: the plan
 * forbids presenting generated examples as dictionary quotations, and an
 * unmarked generated sentence in an exported deck is indistinguishable from one
 * the user wrote. An unattributed generation still gets the wrapper — the honest
 * statement is "generated, source unrecorded", not silence.
 */
export function wrapAiProvenance(value: string, provider: string, model: string): string {
  if (!value) return value;
  const attr = escapeAttr([provider.trim(), model.trim()].filter(Boolean).join('|'));
  return (
    `<span class="${AI_PROVENANCE_CLASS}" ${AI_PROVENANCE_ATTR}="${attr}">`
    + `${value}</span>`
  );
}

export interface AiProvenanceRead {
  /** Empty when the generation recorded no provider. */
  provider: string;
  /** Empty when it recorded no model. */
  model: string;
  value: string;
}

/**
 * Read the generated-content marker back out of a field, or `null` when there is
 * none — the honest answer for hand-typed text and for dictionary-enriched text.
 *
 * A regex over the wrapper this module writes, for the same reason
 * `readEnrichProvenance` is: the value may be any markup, and what the round trip
 * has to prove is that *this* wrapper survives export and reimport, not that any
 * span is a generation.
 */
export function readAiProvenance(raw: string): AiProvenanceRead | null {
  const open = new RegExp(
    `<span class="${AI_PROVENANCE_CLASS}" ${AI_PROVENANCE_ATTR}="([^"]*)">`,
    'u',
  );
  const match = open.exec(raw);
  if (!match) return null;
  const rest = raw.slice(match.index + match[0].length);
  const close = rest.lastIndexOf('</span>');
  if (close < 0) return null;
  const [provider = '', model = ''] = unescapeAttr(match[1]).split('|');
  return { provider: provider.trim(), model: model.trim(), value: rest.slice(0, close) };
}

// Mapping a Browser selection onto local mastery — ANKI_DECK_WORKBENCH_PLAN.md
// Phase 4 ("mastery mappings") and the second half of its gate 3: *"map the
// results to `Very good`, and show the exact mastery/scheduling effects before
// commit."*
//
// The plan's explicit exclusion is the whole reason this module is separate
// from the tray: **"No 'known', 'good', or 'very good' label whose actual
// scheduling effect is hidden from the user."** So the effect is not prose next
// to a button, where it can drift away from what Apply does. It is a value this
// module computes from the same plan Apply writes, and it says the unwelcome
// half out loud: mapping mastery moves the app's own per-word knowledge and
// changes **nothing** about Anki's scheduler. No due date, no interval, no ease.
// `ankiCardsRescheduled` is typed as the literal `0`, so the day someone makes
// this action touch the scheduler, every caller stops compiling instead of
// quietly starting to lie.
//
// Three further rules, each of which a naive per-note implementation gets wrong:
//
// **A word is the unit, not a note.** Knowledge is stored per lemma. Five notes
// teaching 食べる are one word at one level; counting them as five "changes"
// would tell the user a batch did five times the work it did, and would write
// the same entry five times.
//
// **Never set is not level 0.** `renderer/knownWords.ts` stores no entry for a
// word the user has never judged, and deletes the entry when a manual choice
// returns to 0. Those are the same stored state and two different facts, so
// `before` is `MasteryLevel | null` and undo restores the *absence* rather than
// writing a 0 the user never chose.
//
// **A note with no word is reported, never skipped.** A sentence deck whose note
// type declares no word field cannot be mapped at all. Dropping those notes
// silently is how a batch over 200 notes moves 6 words and still reads as done.

/** The app's local knowledge scale, shared with `renderer/knownWords.ts`. */
export type MasteryLevel = 0 | 1 | 2 | 3;

export const MASTERY_LEVELS: readonly MasteryLevel[] = [0, 1, 2, 3];

/**
 * i18n keys, not English labels: this scale is rendered in four languages and a
 * literal here would be a fifth, untranslated one. `renderer/knownWords.ts`
 * holds the same four rungs as English constants for its own older callers.
 */
export const MASTERY_LEVEL_KEYS: Readonly<Record<MasteryLevel, string>> = {
  0: 'anki.mastery.level.new',
  1: 'anki.mastery.level.learning',
  2: 'anki.mastery.level.familiar',
  3: 'anki.mastery.level.known',
};

export function isMasteryLevel(value: unknown): value is MasteryLevel {
  return value === 0 || value === 1 || value === 2 || value === 3;
}

/** One word the mapping moves, and every selected note that put it there. */
export interface MasteryTermChange {
  term: string;
  /** `null` when the user has never judged this word — not the same as 0. */
  before: MasteryLevel | null;
  after: MasteryLevel;
  /** Selected notes carrying this term, in selection order. */
  noteIds: string[];
}

export interface MasteryPlan {
  target: MasteryLevel;
  /** Only the words whose stored level actually moves. */
  changes: MasteryTermChange[];
  /** Distinct words the selection resolved to, moved or not. */
  distinctTerms: number;
  /** Words already at the target, which Apply leaves untouched. */
  unchangedTerms: number;
  /** Selected notes whose note type declares no word, or whose value is not one. */
  notesWithoutWord: string[];
  /** Selected notes covered by at least one moving word. */
  notesCovered: number;
}

export interface MasteryPlanInput {
  /** The selection, in Browser order. */
  noteIds: readonly string[];
  /** Term per note, from `ankiVocabContext`. A note absent from it has no word. */
  termByNote: ReadonlyMap<string, string | null>;
  /** Term → currently stored level. An absent key means never judged. */
  levels: ReadonlyMap<string, number>;
  target: MasteryLevel;
}

/**
 * What mapping this selection to `target` would do. Pure, and the same call
 * feeds both the preview and the write — the tray's rule that a dry run *is* the
 * apply holds here too.
 */
export function planMasteryMapping(input: MasteryPlanInput): MasteryPlan {
  const { noteIds, termByNote, levels, target } = input;
  const byTerm = new Map<string, MasteryTermChange>();
  const notesWithoutWord: string[] = [];
  const seenTerms = new Set<string>();
  let unchangedTerms = 0;

  for (const noteId of noteIds) {
    const term = termByNote.get(noteId) ?? null;
    if (!term) {
      notesWithoutWord.push(noteId);
      continue;
    }
    const stored = levels.get(term);
    const before = isMasteryLevel(stored) ? stored : null;
    if (!seenTerms.has(term)) {
      seenTerms.add(term);
      if (before === target) unchangedTerms += 1;
    }
    if (before === target) continue;
    const existing = byTerm.get(term);
    if (existing) existing.noteIds.push(noteId);
    else byTerm.set(term, { term, before, after: target, noteIds: [noteId] });
  }

  const changes = [...byTerm.values()];
  const covered = new Set<string>();
  for (const change of changes) for (const id of change.noteIds) covered.add(id);

  return {
    target,
    changes,
    distinctTerms: seenTerms.size,
    unchangedTerms,
    notesWithoutWord,
    notesCovered: covered.size,
  };
}

/**
 * The exact effect of applying `plan`, in the shape the workbench renders above
 * the Apply button.
 *
 * `ankiSchedulingChanged` and `ankiCardsRescheduled` are literal types on
 * purpose. This action deliberately does not reschedule anything, and the
 * plan's exclusions forbid a mastery label whose scheduling consequence is
 * implied rather than stated — so the honest answer, zero, is a value the UI
 * must render rather than an omission it can inherit.
 */
export interface MasteryEffect {
  store: 'local-knowledge';
  target: MasteryLevel;
  termsChanged: number;
  termsUnchanged: number;
  notesCovered: number;
  notesWithoutWord: number;
  /** Anki's scheduler is untouched by this action. */
  ankiSchedulingChanged: false;
  /** Cards whose due date, interval or ease this would alter. */
  ankiCardsRescheduled: 0;
}

export function masteryEffect(plan: MasteryPlan): MasteryEffect {
  return {
    store: 'local-knowledge',
    target: plan.target,
    termsChanged: plan.changes.length,
    termsUnchanged: plan.unchangedTerms,
    notesCovered: plan.notesCovered,
    notesWithoutWord: plan.notesWithoutWord.length,
    ankiSchedulingChanged: false,
    ankiCardsRescheduled: 0,
  };
}

/** One entry to store. `level: null` means *remove the entry*, not "set 0". */
export interface MasteryWrite {
  term: string;
  level: MasteryLevel | null;
}

/** The writes Apply performs, in plan order. */
export function masteryWrites(plan: MasteryPlan): MasteryWrite[] {
  return plan.changes.map((c) => ({ term: c.term, level: c.after }));
}

/**
 * The writes that take the mapping back. Applied newest-first is unnecessary
 * here — one term appears at most once in a plan — but the values matter: a
 * word that had no entry before must end with no entry, or Undo would leave
 * behind a judgement the user never made.
 */
export function invertMasteryWrites(plan: MasteryPlan): MasteryWrite[] {
  return plan.changes.map((c) => ({ term: c.term, level: c.before }));
}

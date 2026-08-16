/**
 * The change tray — ANKI_DECK_WORKBENCH_PLAN.md Phase 3, the surface half.
 *
 * `shared/ankiChangeTray.ts` holds all of the model; this file is the ordered
 * list, the form that appends to it, and the preview. The preview is not a
 * separate computation: it is `planChangeTray`'s result, and "Apply" hands that
 * very object up. There is no second code path that could disagree with it.
 *
 * The honesty problem this surface owns: a selection can be larger than the
 * draft. `all-matching` on a paged source stands for notes that have never been
 * in memory, and a tray cannot edit those. So the tray reports both numbers —
 * what is selected and what it can change now — and never prints the selection
 * count next to the verb.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  addTrayAction,
  moveTrayAction,
  planChangeTray,
  removeTrayAction,
  summarizeTrayProblems,
  toggleTrayAction,
  type FieldCopyConflict,
  type TrayAction,
  type TrayActionKind,
  type TrayPlan,
} from '../../../shared/ankiChangeTray';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import {
  type EnrichAspect,
  type EnrichEntry,
  type EnrichLookup,
  type EnrichProvenanceMode,
  type EnrichSenseRule,
} from '../../../shared/ankiEnrich';
import type {
  ReadingFillForm,
  ReadingFillThreshold,
} from '../../../shared/ankiReadingFill';
import type { AiBatch } from '../../../shared/ankiAiAdditions';
import { TEXT_NORMALIZE_ORDER, type TextNormalizeOp } from '../../../shared/ankiTextNormalize';
import {
  MASTERY_LEVELS,
  MASTERY_LEVEL_KEYS,
  masteryEffect,
  type MasteryLevel,
} from '../../../shared/ankiMastery';
import {
  DEFAULT_LEECH_THRESHOLD,
  type LeechRescueMeasure,
} from '../../../shared/ankiLeechRescue';
import { buildVocabContext } from '../../../shared/ankiVocabContext';
import { listKnownEntries, onKnowledgeChanged } from '../../knownWords';
import { useT } from '../../i18n';
import DeckWorkbenchAiPanel, { type AiPanelNote } from './DeckWorkbenchAiPanel';

const ACTION_KINDS: TrayActionKind[] = [
  'find-replace',
  'normalize-text',
  'swap-fields',
  'copy-field',
  'enrich-dictionary',
  'fill-reading',
  'apply-ai-additions',
  'prioritize-new',
  'rescue-leeches',
  'set-mastery',
  'add-tags',
  'remove-tags',
];
/**
 * The guided flow's step 3, "Add and enrich": the three kinds that put content
 * into a note that was not in it before — from a dictionary, from a reading, or
 * from a reviewed generation. Every other kind rearranges or labels text the
 * deck already had, which is a different step's decision.
 *
 * The split is the whole point of the numbered flow, so it is exclusive: a kind
 * lives in exactly one step, and the queue itself is shared, because one tray is
 * still one Apply and one Undo no matter which step queued a given action.
 */
export const ENRICH_ACTION_KINDS: TrayActionKind[] = [
  'enrich-dictionary',
  'fill-reading',
  'apply-ai-additions',
];
/** Step 2's remainder, in the same order the full list gives them. */
export const BROWSE_ACTION_KINDS: TrayActionKind[] = ACTION_KINDS.filter(
  (kind) => !ENRICH_ACTION_KINDS.includes(kind),
);
/**
 * The rung the level select starts on. Unlike a field name there is no unset
 * value that could mean anything — every rung is valid — so the form opens on
 * `Known`, which is the mapping gate 3 demonstrates. Nothing is written by
 * choosing it: the step is queued, its effect is rendered in full above Apply,
 * and Apply is a separate deliberate click.
 */
const DEFAULT_MASTERY_LEVEL: MasteryLevel = 3;
const COPY_CONFLICTS: FieldCopyConflict[] = ['keep', 'overwrite', 'append'];
const ENRICH_ASPECTS: EnrichAspect[] = ['meaning', 'reading', 'partOfSpeech'];
const ENRICH_SENSE_RULES: EnrichSenseRule[] = ['refuse', 'first-source', 'all-sources'];
const ENRICH_PROVENANCE: EnrichProvenanceMode[] = ['inline', 'none'];
const READING_FORMS: ReadingFillForm[] = ['kana', 'furigana'];
// Strictest first and pre-selected, the same rule `refuse` and `keep` follow:
// `certain` writes only where two dictionaries agreed. `likely` is a widening
// the user chooses, and neither admits an ambiguous word.
const READING_THRESHOLDS: ReadingFillThreshold[] = ['certain', 'likely'];
/**
 * Recipe 10's measures, in the order the form lists them. `reschedule` is last
 * and deliberately still offered: the catalogue names it, and a checkbox that
 * refuses out loud is the honest answer to a capability the adapter lacks —
 * hiding it would leave the user assuming the workbench had done it.
 */
const LEECH_MEASURES: LeechRescueMeasure[] = ['tag', 'hint', 'reschedule'];
/**
 * The rescue tag the form opens on. A namespaced tag rather than `leech`: Anki
 * owns that one and writing it back would make the app's own marks
 * indistinguishable from the scheduler's.
 */
const DEFAULT_RESCUE_TAG = 'leech::rescued';
/** How many changed notes the diff lists before it summarises the rest. */
const DIFF_PREVIEW_ROWS = 5;
const DIFF_CHARS = 120;

function clip(text: string): string {
  return text.length > DIFF_CHARS ? `${text.slice(0, DIFF_CHARS)}…` : text;
}

let nextActionSeq = 0;

export default function DeckWorkbenchTray({
  draft,
  journal,
  selectedIds,
  selectedCount,
  onApply,
  kinds = ACTION_KINDS,
  actions: controlledActions,
  onActionsChange,
}: {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  /** Selected notes that are actually loaded — the only ones a tray can change. */
  selectedIds: string[];
  /** What the selection stands for, which on a paged source can be larger. */
  selectedCount: number;
  onApply: (plan: TrayPlan) => void;
  /** The kinds this host offers. Defaults to all, which is the standalone tray. */
  kinds?: TrayActionKind[];
  /**
   * The queue, when the host owns it. The guided flow does, because a queue that
   * lived here would be destroyed by the unmount that Back and Next cause — and
   * "Back never loses work" is the flow's own rule. Left undefined the tray keeps
   * its own queue, which is what every test and any single-surface host wants.
   */
  actions?: TrayAction[];
  onActionsChange?: (next: TrayAction[]) => void;
}) {
  const { t } = useT();
  const [ownActions, setOwnActions] = useState<TrayAction[]>([]);
  const actions = controlledActions ?? ownActions;
  const setActions = (update: (prev: TrayAction[]) => TrayAction[]) => {
    if (onActionsChange) onActionsChange(update(actions));
    else setOwnActions(update);
  };
  const [kind, setKind] = useState<TrayActionKind>(kinds[0] ?? 'find-replace');
  const [fieldName, setFieldName] = useState<string>('');
  const [find, setFind] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [regex, setRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const [tagText, setTagText] = useState('');
  const [fieldA, setFieldA] = useState('');
  const [fieldB, setFieldB] = useState('');
  // `keep` first and pre-selected: the only one of the three that cannot lose
  // text, so the form's default choice is the non-destructive one.
  const [onConflict, setOnConflict] = useState<FieldCopyConflict>('keep');
  const [normalizeOps, setNormalizeOps] = useState<TextNormalizeOp[]>([]);
  const [aspect, setAspect] = useState<EnrichAspect>('meaning');
  // `refuse` first and pre-selected for the same reason `keep` is: it is the one
  // answer that cannot invent one. A disagreement between installed
  // dictionaries then leaves those notes alone and names them, instead of
  // silently picking a winner the user never chose.
  const [senseRule, setSenseRule] = useState<EnrichSenseRule>('refuse');
  // Provenance on by default: the span renders as ordinary text, survives an
  // APKG round trip, and a field whose text came from somewhere the user cannot
  // name later is the thing this whole action is meant to avoid.
  const [provenance, setProvenance] = useState<EnrichProvenanceMode>('inline');
  const [readingForm, setReadingForm] = useState<ReadingFillForm>('kana');
  const [readingThreshold, setReadingThreshold] = useState<ReadingFillThreshold>('certain');
  const [masteryLevel, setMasteryLevel] = useState<MasteryLevel>(DEFAULT_MASTERY_LEVEL);
  /**
   * Where recipe 6 starts renumbering. `0` by default, which puts the batch
   * ahead of the whole existing new queue — the reading of "prioritize" the
   * recipe is named for. Kept as text so the field can be empty while the user
   * is typing; an unparseable value becomes -1 and the plan blocks rather than
   * silently repositioning to 0.
   */
  const [prioritizeStartText, setPrioritizeStartText] = useState('0');
  const prioritizeStart = /^\d+$/.test(prioritizeStartText.trim())
    ? Number(prioritizeStartText.trim())
    : -1;
  /**
   * Recipe 10's leech threshold, as text for the same reason the reposition
   * start is: the field must be allowed to be empty mid-typing. An unparseable
   * value becomes 0, which `planChangeTray` blocks — a threshold below one would
   * call every card in the deck a leech.
   */
  const [leechThresholdText, setLeechThresholdText] = useState(String(DEFAULT_LEECH_THRESHOLD));
  const leechThreshold = /^\d+$/.test(leechThresholdText.trim())
    ? Number(leechThresholdText.trim())
    : 0;
  // On by default: Anki tagged those notes when the *deck's* threshold tripped,
  // which need not be the number typed above, and they are leeches either way.
  const [leechIncludeTagged, setLeechIncludeTagged] = useState(true);
  const [leechMeasures, setLeechMeasures] = useState<LeechRescueMeasure[]>(['tag']);
  const [leechTag, setLeechTag] = useState(DEFAULT_RESCUE_TAG);
  const [applied, setApplied] = useState<number | null>(null);
  /**
   * The reviewed generation, owned here because the tray is what writes it. A
   * regenerate replaces it, and `planChangeTray` refuses any step whose batch id
   * no longer matches — see `ankiChangeTray`'s `ai-batch-mismatch`.
   */
  const [aiBatch, setAiBatch] = useState<AiBatch | undefined>(undefined);

  /** Every field name in the draft, since a tray targets by name across note types. */
  const fieldNames = useMemo(() => {
    const names: string[] = [];
    for (const nt of draft.noteTypes) {
      for (const f of nt.fields) if (!names.includes(f.name)) names.push(f.name);
    }
    return names;
  }, [draft]);

  /**
   * The word each note declares, for `enrich-dictionary`. Built here rather than
   * lifted out of the Browser: enrichment reads only `byNote[…].term` and
   * `terms`, both of which are pure functions of the draft. The Browser's copy
   * additionally carries frequency ranks and knowledge levels, which cost an IPC
   * round trip and mean nothing to an enrichment — so this one asks for neither.
   */
  const vocab = useMemo(
    () => buildVocabContext({ notes: draft.notes, noteTypes: draft.noteTypes, cards: draft.cards }),
    [draft],
  );
  const [lookup, setLookup] = useState<EnrichLookup | undefined>(undefined);
  const [lookupPending, setLookupPending] = useState(false);
  /**
   * Frequency ranks, for `prioritize-new` only. The same measured-absence rule
   * the Browser uses: every term asked about gets a key, and a word no corpus
   * ranks maps to `null`. `undefined` means the lookup has not answered, which
   * keeps the recipe's context absent and the plan honestly blocked rather than
   * reporting a whole ranked deck as unrankable.
   */
  const [ranks, setRanks] = useState<ReadonlyMap<string, number | null> | undefined>(undefined);
  // Only a queued enrichment pays for the lookup: it is a database read per
  // distinct word, and every other action kind has no use for the result.
  const wantsEnrich = actions.some(
    (a) => a.enabled && (a.kind === 'enrich-dictionary' || a.kind === 'fill-reading'),
  );
  // Ranks cost their own IPC round trip and only recipe 6 reads them, so the
  // same rule the enrich lookup follows applies: nothing is fetched until a
  // queued action actually needs it.
  const wantsRanks = actions.some((a) => a.enabled && a.kind === 'prioritize-new');

  useEffect(() => {
    if (!wantsRanks) return;
    let live = true;
    const terms = vocab.terms;
    if (typeof window.api?.dictFrequencyRanks !== 'function') {
      // A host whose bridge predates the channel is NOT an answered lookup. The
      // Browser may treat it as one — `known:` still works there and every rank
      // is honestly absent in a filter. Here it would print "no installed
      // frequency list ranks this word" over an entire ranked deck, blaming the
      // words for a missing capability, so the plan stays blocked instead.
      return () => {
        live = false;
      };
    }
    if (terms.length === 0) {
      // A deck with no word field anywhere IS an answered lookup: every note
      // then reports `prioritize-no-word`, which is true.
      setRanks(new Map());
      return () => {
        live = false;
      };
    }
    setRanks(undefined);
    void window.api
      .dictFrequencyRanks([...terms])
      .then((found) => {
        if (live) setRanks(new Map(terms.map((term) => [term, found[term] ?? null])));
      })
      .catch(() => {
        if (live) setRanks(new Map(terms.map((term) => [term, null])));
      });
    return () => {
      live = false;
    };
  }, [wantsRanks, vocab]);

  useEffect(() => {
    if (!wantsEnrich) return;
    let live = true;
    // A deck with no word field anywhere is still an answered lookup: an empty
    // map is data, and every note then reports `enrich-no-word`, which is true.
    // A host whose bridge predates the channel is NOT — leaving `lookup`
    // undefined keeps the plan blocked on `no-enrich-data` rather than
    // reporting every note as "no dictionary knows this word", which is a lie
    // about the user's dictionaries.
    if (!vocab.terms.length) {
      setLookup(new Map());
      return;
    }
    if (typeof window.api?.dictEnrichTerms !== 'function') return;
    setLookupPending(true);
    void window.api
      .dictEnrichTerms([...vocab.terms])
      .then((found: Record<string, EnrichEntry[]>) => {
        if (!live) return;
        // Absent means "nothing answered", so only the words that were found go
        // in; `resolveEnrichValue` reads a missing key as `no-entry`.
        setLookup(new Map(Object.entries(found)));
        setLookupPending(false);
      })
      .catch(() => {
        if (!live) return;
        setLookup(undefined);
        setLookupPending(false);
      });
    return () => {
      live = false;
    };
  }, [wantsEnrich, vocab]);

  /**
   * Lemma → stored level, for `set-mastery`. Built from `listKnownEntries()`
   * rather than `getLevel()` per word on purpose: `getLevel` answers 0 for a
   * word that was never judged, and the whole undo story turns on those two
   * being different. An absent key here means *never judged*.
   *
   * Re-read on every knowledge change, including one made in another window, so
   * the preview never plans against levels the store has already moved past.
   */
  const [knownLevels, setKnownLevels] = useState<ReadonlyMap<string, number>>(
    () => new Map(listKnownEntries().map((e) => [e.word, e.level])),
  );
  useEffect(
    () => onKnowledgeChanged(() => {
      setKnownLevels(new Map(listKnownEntries().map((e) => [e.word, e.level])));
    }),
    [],
  );

  /**
   * The ranked, knowledge-aware context recipe 6 orders by. Separate from
   * `vocab` because that one deliberately asks for neither — enrichment reads
   * only the term — and merging them would put an IPC round trip and a
   * knowledge-store read behind every find/replace preview.
   */
  const rankedVocab = useMemo(() => {
    if (!ranks) return undefined;
    return buildVocabContext({
      notes: draft.notes,
      noteTypes: draft.noteTypes,
      cards: draft.cards,
      ranks,
      // Only words the store holds: level 0 is "never asked", and recording it
      // would turn the whole deck into "not known" — see `DeckWorkbenchBrowser`.
      localLevels: new Map([...knownLevels].filter(([, level]) => level > 0)),
    });
  }, [draft, ranks, knownLevels]);

  const plan = useMemo(
    () =>
      planChangeTray(draft, journal, selectedIds, actions, {
        ...(lookup ? { enrich: { lookup, vocab } } : {}),
        ...(aiBatch ? { ai: aiBatch } : {}),
        mastery: { vocab, levels: knownLevels },
        ...(rankedVocab ? { prioritize: { vocab: rankedVocab } } : {}),
      }),
    [draft, journal, selectedIds, actions, lookup, vocab, aiBatch, knownLevels, rankedVocab],
  );
  const effect = plan.mastery ? masteryEffect(plan.mastery) : null;
  const masteryChanges = plan.mastery?.changes.length ?? 0;

  /**
   * The selected notes the AI panel may ask about, with the word each declares.
   * `enrich-dictionary`'s vocabulary is reused rather than recomputed: it is the
   * same question — which word is this note about — and a second answer to it
   * could disagree with the one the enrichment path uses.
   */
  const aiNotes = useMemo<AiPanelNote[]>(
    // Deliberately unfiltered: gate 2's translation reads a field, and a note
    // that declares no word still has a Back worth translating.
    // `normalizeAiAdditionsRequest` drops the wordless ones for gate 12 itself,
    // so filtering here would only remove them from the question that wants them.
    () => selectedIds.map((noteId) => ({ noteId, term: vocab.byNote.get(noteId)?.term ?? '' })),
    [selectedIds, vocab],
  );

  /**
   * One note's raw field value, for the translation panel. The note type is
   * authoritative for a field's ordinal, but a source that could not read one
   * still names each value, so the value's own name is the fallback — the same
   * rule `targetOrds` uses in the tray planner.
   */
  const notesById = useMemo(
    () => new Map(draft.notes.map((note) => [note.id, note])),
    [draft],
  );
  const readField = useMemo(
    () => (noteId: string, fieldName: string): string => {
      const note = notesById.get(noteId);
      if (!note) return '';
      const def = draft.noteTypes
        .find((nt) => nt.id === note.noteTypeId)?.fields
        .find((f) => f.name === fieldName);
      const ord = def?.ord;
      const value = ord === undefined
        ? note.fields.find((f) => f.name === fieldName)
        : note.fields.find((f) => f.ord === ord);
      return value?.raw ?? '';
    },
    [notesById, draft],
  );

  const buildAction = (id: string): TrayAction => {
    switch (kind) {
      case 'find-replace':
        return {
          id,
          enabled: true,
          kind,
          fieldName: fieldName === '' ? null : fieldName,
          find,
          replace: replaceWith,
          regex,
          matchCase,
        };
      case 'swap-fields':
        return { id, enabled: true, kind, fieldA, fieldB };
      case 'copy-field':
        return { id, enabled: true, kind, fromField: fieldA, toField: fieldB, onConflict };
      case 'enrich-dictionary':
        return { id, enabled: true, kind, aspect, toField: fieldB, onConflict, senseRule, provenance };
      case 'fill-reading':
        // No conflict rule: the step only fills an empty destination, so there
        // is nothing for the user to choose between. See `ankiReadingFill`.
        return {
          id,
          enabled: true,
          kind,
          form: readingForm,
          toField: fieldB,
          threshold: readingThreshold,
          provenance,
        };
      case 'apply-ai-additions':
        // An empty id when no batch exists: `planChangeTray` then blocks on
        // `no-ai-review`, which is the true statement. Refusing to add the step
        // at all would leave the user with a button that silently did nothing.
        return { id, enabled: true, kind, batchId: aiBatch?.id ?? '', toField: fieldB, onConflict };
      case 'prioritize-new':
        return { id, enabled: true, kind, startPosition: prioritizeStart };
      case 'rescue-leeches':
        // The hint reuses the same two field selects a copy does, and in the
        // same direction: `fieldA` is read, `fieldB` is written.
        return {
          id,
          enabled: true,
          kind,
          threshold: leechThreshold,
          includeTagged: leechIncludeTagged,
          measures: [...leechMeasures],
          rescueTag: leechTag,
          hintFromField: fieldA,
          hintToField: fieldB,
        };
      case 'set-mastery':
        return { id, enabled: true, kind, level: masteryLevel };
      case 'normalize-text':
        return {
          id,
          enabled: true,
          kind,
          fieldName: fieldName === '' ? null : fieldName,
          ops: [...normalizeOps],
        };
      default:
        return { id, enabled: true, kind, tags: tagText.split(/\s+/).filter(Boolean) };
    }
  };

  const append = (): void => {
    setActions((prev) => addTrayAction(prev, buildAction(`act-${(nextActionSeq += 1)}`)));
    setApplied(null);
    if (kind === 'find-replace') {
      setFind('');
      setReplaceWith('');
    } else if (kind === 'add-tags' || kind === 'remove-tags') setTagText('');
  };

  const describe = (action: TrayAction): string => {
    switch (action.kind) {
      case 'find-replace':
        return t('ankiWorkbench.tray.describe.find-replace', {
          field: action.fieldName ?? t('ankiWorkbench.tray.field.all'),
          find: action.find,
          replace: action.replace === '' ? t('ankiWorkbench.tray.nothing') : action.replace,
        });
      case 'swap-fields':
        return t('ankiWorkbench.tray.describe.swap-fields', { a: action.fieldA, b: action.fieldB });
      case 'normalize-text':
        return t('ankiWorkbench.tray.describe.normalize-text', {
          field: action.fieldName ?? t('ankiWorkbench.tray.field.all'),
          // In canonical order, so the description matches what will run.
          ops: TEXT_NORMALIZE_ORDER.filter((op) => action.ops.includes(op))
            .map((op) => t(`ankiWorkbench.tray.normalize.${op}`))
            .join(', '),
        });
      case 'copy-field':
        return t('ankiWorkbench.tray.describe.copy-field', {
          from: action.fromField,
          to: action.toField,
          conflict: t(`ankiWorkbench.tray.conflict.${action.onConflict}`),
        });
      case 'enrich-dictionary':
        return t('ankiWorkbench.tray.describe.enrich-dictionary', {
          aspect: t(`ankiWorkbench.tray.aspect.${action.aspect}`),
          to: action.toField,
          conflict: t(`ankiWorkbench.tray.conflict.${action.onConflict}`),
          rule: t(`ankiWorkbench.tray.senseRule.${action.senseRule}`),
          provenance: t(`ankiWorkbench.tray.provenance.${action.provenance}`),
        });
      case 'fill-reading':
        return t('ankiWorkbench.tray.describe.fill-reading', {
          form: t(`ankiWorkbench.tray.reading.form.${action.form}`),
          to: action.toField,
          threshold: t(`ankiWorkbench.tray.reading.threshold.${action.threshold}`),
          provenance: t(`ankiWorkbench.tray.provenance.${action.provenance}`),
        });
      case 'apply-ai-additions':
        return t('ankiWorkbench.tray.describe.apply-ai-additions', {
          to: action.toField,
          conflict: t(`ankiWorkbench.tray.conflict.${action.onConflict}`),
        });
      case 'prioritize-new':
        return t('ankiWorkbench.tray.describe.prioritize-new', {
          start: String(action.startPosition),
        });
      case 'rescue-leeches':
        return t('ankiWorkbench.tray.describe.rescue-leeches', {
          threshold: String(action.threshold),
          measures: LEECH_MEASURES.filter((m) => action.measures.includes(m))
            .map((m) => t(`ankiWorkbench.tray.leech.measure.${m}`))
            .join(', '),
        });
      case 'set-mastery':
        return t('ankiWorkbench.tray.describe.set-mastery', {
          level: t(MASTERY_LEVEL_KEYS[action.level]),
        });
      default:
        return t(`ankiWorkbench.tray.describe.${action.kind}`, { tags: action.tags.join(' ') });
    }
  };

  /** One "choose a field" select. `''` is the unset value every caller checks. */
  const fieldSelect = (label: string, value: string, onChange: (next: string) => void): ReactNode => (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('ankiWorkbench.tray.field.choose')}</option>
        {fieldNames.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  /** The two-field form both `swap-fields` and `copy-field` use. */
  const fieldPair = (labelA: string, labelB: string): ReactNode => (
    <>
      {fieldSelect(labelA, fieldA, setFieldA)}
      {fieldSelect(labelB, fieldB, setFieldB)}
    </>
  );

  /** The conflict select `copy-field` and `enrich-dictionary` share. */
  const conflictSelect = (): ReactNode => (
    <label>
      {t('ankiWorkbench.tray.onConflict')}
      <select
        value={onConflict}
        onChange={(e) => setOnConflict(e.target.value as FieldCopyConflict)}
      >
        {COPY_CONFLICTS.map((value) => (
          <option key={value} value={value}>
            {t(`ankiWorkbench.tray.conflict.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );

  const problems = summarizeTrayProblems(plan.problems);
  // The selection can name notes that are not loaded; the tray must not imply
  // it will touch them.
  const beyondPage = Math.max(0, selectedCount - selectedIds.length);

  return (
    <section className="wb-tray" aria-label={t('ankiWorkbench.tray.title')}>
      <div className="wb-tray-head">
        <h3>{t('ankiWorkbench.tray.title')}</h3>
        <p className="muted">{t('ankiWorkbench.tray.lead')}</p>
        <p className="wb-tray-scope">
          {t('ankiWorkbench.tray.scope', { count: selectedIds.length })}
          {beyondPage > 0 && (
            <span className="wb-tray-warn"> {t('ankiWorkbench.tray.beyondPage', { count: beyondPage })}</span>
          )}
        </p>
      </div>

      <ol className="wb-tray-actions">
        {actions.length === 0 && <li className="muted">{t('ankiWorkbench.tray.empty')}</li>}
        {actions.map((action, index) => {
          const outcome = plan.outcomes.find((o) => o.actionId === action.id);
          return (
            <li key={action.id} className={`wb-tray-action${action.enabled ? '' : ' disabled'}`}>
              <span className="wb-tray-step">{index + 1}</span>
              <label className="wb-tray-enable">
                <input
                  type="checkbox"
                  checked={action.enabled}
                  aria-label={t('ankiWorkbench.tray.enable')}
                  onChange={() => setActions((prev) => toggleTrayAction(prev, action.id))}
                />
              </label>
              <span className="wb-tray-desc">{describe(action)}</span>
              <span className="muted wb-tray-outcome">
                {outcome
                  ? t('ankiWorkbench.tray.outcome', {
                      changed: outcome.changed,
                      matched: outcome.matched,
                    })
                  : t('ankiWorkbench.tray.outcomeNone')}
              </span>
              <button
                type="button"
                className="btn"
                disabled={index === 0}
                aria-label={t('ankiWorkbench.tray.up')}
                onClick={() => setActions((prev) => moveTrayAction(prev, action.id, -1))}
              >
                ↑
              </button>
              <button
                type="button"
                className="btn"
                disabled={index === actions.length - 1}
                aria-label={t('ankiWorkbench.tray.down')}
                onClick={() => setActions((prev) => moveTrayAction(prev, action.id, 1))}
              >
                ↓
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => setActions((prev) => removeTrayAction(prev, action.id))}
              >
                {t('ankiWorkbench.tray.remove')}
              </button>
            </li>
          );
        })}
      </ol>

      <div className="wb-tray-form">
        <label>
          {t('ankiWorkbench.tray.kind')}
          <select value={kind} onChange={(e) => setKind(e.target.value as TrayActionKind)}>
            {kinds.map((value) => (
              <option key={value} value={value}>
                {t(`ankiWorkbench.tray.kind.${value}`)}
              </option>
            ))}
          </select>
        </label>

        {kind === 'find-replace' ? (
          <>
            <label>
              {t('ankiWorkbench.tray.field')}
              <select value={fieldName} onChange={(e) => setFieldName(e.target.value)}>
                <option value="">{t('ankiWorkbench.tray.field.all')}</option>
                {fieldNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ankiWorkbench.tray.find')}
              <input value={find} onChange={(e) => setFind(e.target.value)} />
            </label>
            <label>
              {t('ankiWorkbench.tray.replace')}
              <input value={replaceWith} onChange={(e) => setReplaceWith(e.target.value)} />
            </label>
            <label className="wb-tray-flag">
              <input type="checkbox" checked={regex} onChange={() => setRegex((v) => !v)} />
              {t('ankiWorkbench.tray.regex')}
            </label>
            <label className="wb-tray-flag">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={() => setMatchCase((v) => !v)}
              />
              {t('ankiWorkbench.tray.matchCase')}
            </label>
          </>
        ) : kind === 'normalize-text' ? (
          <>
            <label>
              {t('ankiWorkbench.tray.field')}
              <select value={fieldName} onChange={(e) => setFieldName(e.target.value)}>
                <option value="">{t('ankiWorkbench.tray.field.all')}</option>
                {fieldNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            {/* Listed in the order they run, because that order is fixed and
                the form is the only place it is visible. */}
            {TEXT_NORMALIZE_ORDER.map((op) => (
              <label key={op} className="wb-tray-flag">
                <input
                  type="checkbox"
                  checked={normalizeOps.includes(op)}
                  onChange={() =>
                    setNormalizeOps((prev) =>
                      prev.includes(op) ? prev.filter((o) => o !== op) : [...prev, op],
                    )
                  }
                />
                {t(`ankiWorkbench.tray.normalize.${op}`)}
              </label>
            ))}
          </>
        ) : kind === 'swap-fields' ? (
          fieldPair(t('ankiWorkbench.tray.swapA'), t('ankiWorkbench.tray.swapB'))
        ) : kind === 'copy-field' ? (
          <>
            {fieldPair(t('ankiWorkbench.tray.copyFrom'), t('ankiWorkbench.tray.copyTo'))}
            {conflictSelect()}
          </>
        ) : kind === 'enrich-dictionary' ? (
          <>
            <label>
              {t('ankiWorkbench.tray.aspect')}
              <select value={aspect} onChange={(e) => setAspect(e.target.value as EnrichAspect)}>
                {ENRICH_ASPECTS.map((value) => (
                  <option key={value} value={value}>
                    {t(`ankiWorkbench.tray.aspect.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            {/* The word itself is read from the note's own vocabulary field, so
                only the destination is chosen here. */}
            {fieldSelect(t('ankiWorkbench.tray.enrichTo'), fieldB, setFieldB)}
            {conflictSelect()}
            <label>
              {t('ankiWorkbench.tray.senseRule')}
              <select
                value={senseRule}
                onChange={(e) => setSenseRule(e.target.value as EnrichSenseRule)}
              >
                {ENRICH_SENSE_RULES.map((value) => (
                  <option key={value} value={value}>
                    {t(`ankiWorkbench.tray.senseRule.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ankiWorkbench.tray.provenance')}
              <select
                value={provenance}
                onChange={(e) => setProvenance(e.target.value as EnrichProvenanceMode)}
              >
                {ENRICH_PROVENANCE.map((value) => (
                  <option key={value} value={value}>
                    {t(`ankiWorkbench.tray.provenance.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : kind === 'fill-reading' ? (
          <>
            <label>
              {t('ankiWorkbench.tray.reading.form')}
              <select
                value={readingForm}
                onChange={(e) => setReadingForm(e.target.value as ReadingFillForm)}
              >
                {READING_FORMS.map((value) => (
                  <option key={value} value={value}>
                    {t(`ankiWorkbench.tray.reading.form.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            {/* The word comes from the note's own vocabulary field, as it does
                for enrichment, so only the destination is chosen here. */}
            {fieldSelect(t('ankiWorkbench.tray.reading.to'), fieldB, setFieldB)}
            <label>
              {t('ankiWorkbench.tray.reading.threshold')}
              <select
                value={readingThreshold}
                onChange={(e) => setReadingThreshold(e.target.value as ReadingFillThreshold)}
              >
                {READING_THRESHOLDS.map((value) => (
                  <option key={value} value={value}>
                    {t(`ankiWorkbench.tray.reading.threshold.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ankiWorkbench.tray.provenance')}
              <select
                value={provenance}
                onChange={(e) => setProvenance(e.target.value as EnrichProvenanceMode)}
              >
                {ENRICH_PROVENANCE.map((value) => (
                  <option key={value} value={value}>
                    {t(`ankiWorkbench.tray.provenance.${value}`)}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : kind === 'apply-ai-additions' ? (
          <>
            {/* Only the destination and the conflict rule: what gets written is
                whatever the review below approved, not a parameter of the step. */}
            {fieldSelect(t('ankiWorkbench.tray.aiTo'), fieldB, setFieldB)}
            {conflictSelect()}
          </>
        ) : kind === 'prioritize-new' ? (
          <>
            {/* The word and its rank come from the note itself, as they do for
                enrichment, so the only parameter is where the renumbering
                starts. Known words are excluded by the recipe, not by a
                checkbox: making that optional would make the guarantee
                optional. */}
            <label>
              {t('ankiWorkbench.tray.prioritize.start')}
              <input
                type="text"
                inputMode="numeric"
                value={prioritizeStartText}
                onChange={(e) => setPrioritizeStartText(e.target.value)}
              />
            </label>
            <span className="muted">{t('ankiWorkbench.tray.prioritize.protects')}</span>
          </>
        ) : kind === 'rescue-leeches' ? (
          <>
            <label>
              {t('ankiWorkbench.tray.leech.threshold')}
              <input
                type="text"
                inputMode="numeric"
                value={leechThresholdText}
                onChange={(e) => setLeechThresholdText(e.target.value)}
              />
            </label>
            <label className="wb-tray-flag">
              <input
                type="checkbox"
                checked={leechIncludeTagged}
                onChange={() => setLeechIncludeTagged((prev) => !prev)}
              />
              {t('ankiWorkbench.tray.leech.includeTagged')}
            </label>
            {LEECH_MEASURES.map((measure) => (
              <label key={measure} className="wb-tray-flag">
                <input
                  type="checkbox"
                  checked={leechMeasures.includes(measure)}
                  onChange={() =>
                    setLeechMeasures((prev) =>
                      prev.includes(measure)
                        ? prev.filter((m) => m !== measure)
                        : [...prev, measure],
                    )
                  }
                />
                {t(`ankiWorkbench.tray.leech.measure.${measure}`)}
              </label>
            ))}
            {leechMeasures.includes('tag') && (
              <label>
                {t('ankiWorkbench.tray.leech.tag')}
                <input value={leechTag} onChange={(e) => setLeechTag(e.target.value)} />
              </label>
            )}
            {leechMeasures.includes('hint')
              && fieldPair(t('ankiWorkbench.tray.leech.hintFrom'), t('ankiWorkbench.tray.leech.hintTo'))}
            {leechMeasures.includes('reschedule') && (
              /* Said before Apply, not after: the checkbox is offered because
                 the catalogue names the measure, and the user has to learn here
                 that nothing will reschedule rather than from a silent result. */
              <span className="wb-tray-warn">{t('ankiWorkbench.tray.leech.noReschedule')}</span>
            )}
            <span className="muted">{t('ankiWorkbench.tray.leech.keepsHints')}</span>
          </>
        ) : kind === 'set-mastery' ? (
          <label>
            {t('ankiWorkbench.tray.masteryLevel')}
            <select
              value={String(masteryLevel)}
              onChange={(e) => setMasteryLevel(Number(e.target.value) as MasteryLevel)}
            >
              {MASTERY_LEVELS.map((level) => (
                <option key={level} value={String(level)}>
                  {t(MASTERY_LEVEL_KEYS[level])}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            {t('ankiWorkbench.tray.tags')}
            <input
              value={tagText}
              placeholder={t('ankiWorkbench.tray.tags.hint')}
              onChange={(e) => setTagText(e.target.value)}
            />
          </label>
        )}

        <button type="button" className="btn" onClick={append}>
          {t('ankiWorkbench.tray.add')}
        </button>
      </div>

      {wantsEnrich && (lookupPending || lookup) && (
        <p className="muted wb-tray-enrich" role="status">
          {lookupPending
            ? t('ankiWorkbench.tray.enrichLoading', { count: vocab.terms.length })
            : t('ankiWorkbench.tray.enrichReady', {
                found: lookup?.size ?? 0,
                count: vocab.terms.length,
              })}
        </p>
      )}

      <DeckWorkbenchAiPanel
        notes={aiNotes}
        fieldNames={fieldNames}
        readField={readField}
        destinationField={fieldB}
        onBatch={setAiBatch}
      />

      {problems.length > 0 && (
        <ul className="wb-tray-problems">
          {problems.map((problem) => (
            <li
              key={`${problem.code}:${problem.actionId ?? ''}`}
              className={problem.severity === 'blocking' ? 'wb-tray-blocking' : 'wb-tray-warn'}
              role={problem.severity === 'blocking' ? 'alert' : undefined}
            >
              {t(`ankiWorkbench.tray.problem.${problem.code}`, {
                count: problem.count,
                detail: problem.detail ?? '',
              })}
            </li>
          ))}
        </ul>
      )}

      {!plan.blocked && effect && (
        // Gate 3's "show the exact mastery/scheduling effects before commit",
        // rendered from the same plan Apply writes. The scheduling line is
        // printed whether or not it is zero: the plan's exclusions forbid a
        // mastery label whose scheduling consequence the user has to infer.
        <dl className="wb-tray-effect" aria-label={t('ankiWorkbench.tray.mastery.effect')}>
          <div>
            <dt>{t('ankiWorkbench.tray.mastery.target')}</dt>
            <dd>{t(MASTERY_LEVEL_KEYS[effect.target])}</dd>
          </div>
          <div>
            <dt>{t('ankiWorkbench.tray.mastery.words')}</dt>
            <dd>
              {t('ankiWorkbench.tray.mastery.wordsValue', {
                changed: effect.termsChanged,
                unchanged: effect.termsUnchanged,
                notes: effect.notesCovered,
              })}
            </dd>
          </div>
          {effect.notesWithoutWord > 0 && (
            <div>
              <dt>{t('ankiWorkbench.tray.mastery.noWord')}</dt>
              <dd>{t('ankiWorkbench.tray.mastery.noWordValue', { count: effect.notesWithoutWord })}</dd>
            </div>
          )}
          {effect.notesWithPhrase > 0 && (
            <div>
              <dt>{t('ankiWorkbench.tray.mastery.phrase')}</dt>
              <dd>{t('ankiWorkbench.tray.mastery.phraseValue', { count: effect.notesWithPhrase })}</dd>
            </div>
          )}
          <div>
            <dt>{t('ankiWorkbench.tray.mastery.scheduling')}</dt>
            <dd>
              {t('ankiWorkbench.tray.mastery.schedulingValue', {
                count: effect.ankiCardsRescheduled,
              })}
            </dd>
          </div>
        </dl>
      )}

      {!plan.blocked && (
        <div className="wb-tray-preview">
          <p className={plan.changedNotes > 0 ? 'wb-tray-summary' : 'muted'}>
            {plan.changedNotes > 0
              ? t('ankiWorkbench.tray.summary', { count: plan.changedNotes })
              : t('ankiWorkbench.tray.summaryNone')}
          </p>
          <ul className="wb-tray-diff">
            {plan.changes.slice(0, DIFF_PREVIEW_ROWS).map((change) => (
              <li key={change.noteId}>
                {change.fields.map((field) => (
                  <span key={field.ord} className="wb-tray-diff-row">
                    <span className="wb-tray-diff-field">{field.name}</span>
                    <del>{clip(field.before)}</del>
                    <ins>{clip(field.after)}</ins>
                  </span>
                ))}
                {change.tags && (
                  <span className="wb-tray-diff-row">
                    <span className="wb-tray-diff-field">{t('ankiWorkbench.tray.tagsField')}</span>
                    <del>{change.tags.before.join(' ')}</del>
                    <ins>{change.tags.after.join(' ')}</ins>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {plan.changedCards > 0 && (
            /* A reposition writes no field, so the field diff above shows
               nothing for it. Naming the words and their new positions is what
               keeps the preview the whole truth about what Apply will do. */
            <p className="wb-tray-summary">
              {t('ankiWorkbench.tray.prioritize.moved', {
                count: plan.changedCards,
                detail: (plan.prioritize?.moves ?? [])
                  .filter((m) => m.after !== m.before)
                  .slice(0, DIFF_PREVIEW_ROWS)
                  .map((m) => `${m.term} #${m.after}`)
                  .join(', '),
              })}
            </p>
          )}
          {plan.leechRescue && (
            /* The field diff shows the writes but not what made those notes
               leeches. Reporting how many were found, and how many arrived only
               through Anki's tag, is what keeps the threshold honest — a run
               that found 0 must read as 0 and not as a quiet success. */
            <p className="wb-tray-summary">
              {t('ankiWorkbench.tray.leech.found', {
                count: plan.leechRescue.leechNotes,
                rescued: plan.leechRescue.targets.length,
                tagged: plan.leechRescue.taggedOnlyNotes,
              })}
            </p>
          )}
          {plan.changes.length > DIFF_PREVIEW_ROWS && (
            <p className="muted">
              {t('ankiWorkbench.tray.diffMore', {
                count: plan.changes.length - DIFF_PREVIEW_ROWS,
              })}
            </p>
          )}
        </div>
      )}

      <div className="wb-tray-foot">
        <button
          type="button"
          className="btn primary"
          // A mastery-only or reposition-only tray changes no note and still
          // has work to do, so `changedNotes` alone would disable Apply on a
          // plan that is ready.
          disabled={
            plan.blocked
            || (plan.changedNotes === 0 && masteryChanges === 0 && plan.changedCards === 0)
          }
          onClick={() => {
            onApply(plan);
            setApplied(plan.changedNotes + masteryChanges + plan.changedCards);
          }}
        >
          {t('ankiWorkbench.tray.apply')}
        </button>
        {applied !== null && (
          <span role="status" className="wb-tray-applied">
            {t('ankiWorkbench.tray.applied', { count: applied })}
          </span>
        )}
        <span className="muted">{t('ankiWorkbench.edit.draftOnly')}</span>
      </div>
    </section>
  );
}

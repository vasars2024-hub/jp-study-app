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
import type { AiBatch } from '../../../shared/ankiAiAdditions';
import { TEXT_NORMALIZE_ORDER, type TextNormalizeOp } from '../../../shared/ankiTextNormalize';
import { buildVocabContext } from '../../../shared/ankiVocabContext';
import { useT } from '../../i18n';
import DeckWorkbenchAiPanel, { type AiPanelNote } from './DeckWorkbenchAiPanel';

const ACTION_KINDS: TrayActionKind[] = [
  'find-replace',
  'normalize-text',
  'swap-fields',
  'copy-field',
  'enrich-dictionary',
  'apply-ai-additions',
  'add-tags',
  'remove-tags',
];
const COPY_CONFLICTS: FieldCopyConflict[] = ['keep', 'overwrite', 'append'];
const ENRICH_ASPECTS: EnrichAspect[] = ['meaning', 'reading', 'partOfSpeech'];
const ENRICH_SENSE_RULES: EnrichSenseRule[] = ['refuse', 'first-source', 'all-sources'];
const ENRICH_PROVENANCE: EnrichProvenanceMode[] = ['inline', 'none'];
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
}: {
  draft: AnkiDraft;
  journal: AnkiDraftEditJournal;
  /** Selected notes that are actually loaded — the only ones a tray can change. */
  selectedIds: string[];
  /** What the selection stands for, which on a paged source can be larger. */
  selectedCount: number;
  onApply: (plan: TrayPlan) => void;
}) {
  const { t } = useT();
  const [actions, setActions] = useState<TrayAction[]>([]);
  const [kind, setKind] = useState<TrayActionKind>('find-replace');
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
  // Only a queued enrichment pays for the lookup: it is a database read per
  // distinct word, and every other action kind has no use for the result.
  const wantsEnrich = actions.some((a) => a.enabled && a.kind === 'enrich-dictionary');

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

  const plan = useMemo(
    () =>
      planChangeTray(draft, journal, selectedIds, actions, {
        ...(lookup ? { enrich: { lookup, vocab } } : {}),
        ...(aiBatch ? { ai: aiBatch } : {}),
      }),
    [draft, journal, selectedIds, actions, lookup, vocab, aiBatch],
  );

  /**
   * The selected notes the AI panel may ask about, with the word each declares.
   * `enrich-dictionary`'s vocabulary is reused rather than recomputed: it is the
   * same question — which word is this note about — and a second answer to it
   * could disagree with the one the enrichment path uses.
   */
  const aiNotes = useMemo<AiPanelNote[]>(
    () => selectedIds
      .map((noteId) => ({ noteId, term: vocab.byNote.get(noteId)?.term ?? '' }))
      .filter((note) => note.term !== ''),
    [selectedIds, vocab],
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
      case 'apply-ai-additions':
        // An empty id when no batch exists: `planChangeTray` then blocks on
        // `no-ai-review`, which is the true statement. Refusing to add the step
        // at all would leave the user with a button that silently did nothing.
        return { id, enabled: true, kind, batchId: aiBatch?.id ?? '', toField: fieldB, onConflict };
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
      case 'apply-ai-additions':
        return t('ankiWorkbench.tray.describe.apply-ai-additions', {
          to: action.toField,
          conflict: t(`ankiWorkbench.tray.conflict.${action.onConflict}`),
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
            {ACTION_KINDS.map((value) => (
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
        ) : kind === 'apply-ai-additions' ? (
          <>
            {/* Only the destination and the conflict rule: what gets written is
                whatever the review below approved, not a parameter of the step. */}
            {fieldSelect(t('ankiWorkbench.tray.aiTo'), fieldB, setFieldB)}
            {conflictSelect()}
          </>
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

      <DeckWorkbenchAiPanel notes={aiNotes} onBatch={setAiBatch} />

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
          disabled={plan.blocked || plan.changedNotes === 0}
          onClick={() => {
            onApply(plan);
            setApplied(plan.changedNotes);
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

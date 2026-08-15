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
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  addTrayAction,
  moveTrayAction,
  planChangeTray,
  removeTrayAction,
  summarizeTrayProblems,
  toggleTrayAction,
  type TrayAction,
  type TrayActionKind,
  type TrayPlan,
} from '../../../shared/ankiChangeTray';
import type { AnkiDraftEditJournal } from '../../../shared/ankiDraftEdit';
import { useT } from '../../i18n';

const ACTION_KINDS: TrayActionKind[] = ['find-replace', 'add-tags', 'remove-tags'];
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
  const [applied, setApplied] = useState<number | null>(null);

  /** Every field name in the draft, since a tray targets by name across note types. */
  const fieldNames = useMemo(() => {
    const names: string[] = [];
    for (const nt of draft.noteTypes) {
      for (const f of nt.fields) if (!names.includes(f.name)) names.push(f.name);
    }
    return names;
  }, [draft]);

  const plan = useMemo(
    () => planChangeTray(draft, journal, selectedIds, actions),
    [draft, journal, selectedIds, actions],
  );

  const append = (): void => {
    const id = `act-${(nextActionSeq += 1)}`;
    const action: TrayAction =
      kind === 'find-replace'
        ? {
            id,
            enabled: true,
            kind,
            fieldName: fieldName === '' ? null : fieldName,
            find,
            replace: replaceWith,
            regex,
            matchCase,
          }
        : { id, enabled: true, kind, tags: tagText.split(/\s+/).filter(Boolean) };
    setActions((prev) => addTrayAction(prev, action));
    setApplied(null);
    if (kind === 'find-replace') {
      setFind('');
      setReplaceWith('');
    } else setTagText('');
  };

  const describe = (action: TrayAction): string =>
    action.kind === 'find-replace'
      ? t('ankiWorkbench.tray.describe.find-replace', {
          field: action.fieldName ?? t('ankiWorkbench.tray.field.all'),
          find: action.find,
          replace: action.replace === '' ? t('ankiWorkbench.tray.nothing') : action.replace,
        })
      : t(`ankiWorkbench.tray.describe.${action.kind}`, { tags: action.tags.join(' ') });

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

/**
 * Card designs — the second half of acceptance gate 13 ("create a
 * reverse/optional-reverse card design"), and the surface over
 * `shared/ankiCardDesign.ts`.
 *
 * The whole point of this panel is that it states the consequence *before*
 * Apply: how many cards a design brings into existence, how many notes it
 * skips, and why it skips them. A design that would generate nothing says so
 * with a number rather than applying and leaving the user to discover an
 * unchanged deck.
 *
 * The reverse transition is not an afterthought here. An applied design is
 * listed with the exact card count it created and a Remove that undoes it by
 * the ids recorded at apply time — the plan requires every add flow to have
 * one, and a design is the add flow with the widest blast radius in the
 * workbench.
 */
import { useMemo, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import {
  applyCardDesign,
  BLOCKING_CARD_DESIGN_PROBLEMS,
  planCardDesign,
  removeCardDesign,
  type AppliedCardDesign,
  type CardDesignOp,
  type CardDesignKind,
  type CardDesignProblem,
} from '../../../shared/ankiCardDesign';
import { renderAnkiCard } from '../../../shared/ankiTemplateRender';
import { useT } from '../../i18n';
import { ProblemLine } from './DeckWorkbenchPreview';

export default function DeckWorkbenchCardDesign({
  draft,
  onDraft,
  onDesignApplied,
  onDesignRemoved,
}: {
  draft: AnkiDraft;
  onDraft: (next: AnkiDraft) => void;
  /**
   * The design's journal op. Without it the panel's Apply reaches the draft and
   * stops there — `buildApkgExportChanges` folds `journal.done` and nothing
   * else, so an unjournalled design is a preview no destination can ship.
   */
  onDesignApplied: (op: CardDesignOp) => void;
  /**
   * The panel's own Remove. It takes the op back out of the journal rather than
   * appending an inverse: there is no removal op for a template the SOURCE
   * package never had, and a journal still carrying an add whose template is
   * gone from the draft would claim an edit the user can see is not there.
   */
  onDesignRemoved: (noteTypeId: string, templateOrd: number) => void;
}) {
  const { t } = useT();
  const standardTypes = useMemo(
    () => draft.noteTypes.filter((nt) => nt.kind === 'standard'),
    [draft.noteTypes],
  );
  const [noteTypeId, setNoteTypeId] = useState(() => standardTypes[0]?.id ?? '');
  const [kind, setKind] = useState<CardDesignKind>('reverse');
  const [questionOrd, setQuestionOrd] = useState(1);
  const [answerOrd, setAnswerOrd] = useState(0);
  const [applied, setApplied] = useState<AppliedCardDesign[]>([]);

  const noteType = standardTypes.find((nt) => nt.id === noteTypeId) ?? standardTypes[0];
  const plan = useMemo(
    () =>
      noteType
        ? planCardDesign(draft, {
            noteTypeId: noteType.id,
            kind,
            questionFieldOrd: questionOrd,
            answerFieldOrd: answerOrd,
          })
        : null,
    [draft, noteType, kind, questionOrd, answerOrd],
  );

  // One rendered sample, so the user sees the card rather than its formats.
  // It renders against a *one-note* draft carrying the candidate template, not
  // against `applyCardDesign(draft, plan)`: that would spread every note in the
  // deck on each render, which at 100,000 notes is exactly the main-loop cost
  // gate 9 forbids. The render only ever reads this note and its note type.
  const sample = useMemo(() => {
    if (!plan || plan.status !== 'ok' || !plan.template || !noteType) return null;
    const note = draft.notes.find((n) => n.id === plan.sampleNoteIds[0]);
    if (!note) return null;
    const candidateType = {
      ...noteType,
      fields: plan.addedField ? [...noteType.fields, plan.addedField] : noteType.fields,
      templates: [...noteType.templates, plan.template],
    };
    const one: AnkiDraft = {
      ...draft,
      noteTypes: [candidateType],
      notes: [note],
      cards: draft.cards.filter((c) => c.noteId === note.id),
    };
    return renderAnkiCard(one, note, plan.template.ord);
  }, [draft, plan, noteType]);

  const blocked = plan?.status === 'blocked';

  return (
    <section className="wb-design" aria-label={t('ankiWorkbench.design.title')}>
      <h3 className="wb-design-title">{t('ankiWorkbench.design.title')}</h3>

      {standardTypes.length === 0 ? (
        <p className="muted">{t('ankiWorkbench.design.noStandardTypes')}</p>
      ) : (
        <>
          <div className="wb-design-controls" role="group" aria-label={t('ankiWorkbench.design.title')}>
            <label className="wb-design-field">
              {t('ankiWorkbench.design.noteType')}
              <select
                value={noteType?.id ?? ''}
                onChange={(e) => {
                  setNoteTypeId(e.target.value);
                  setQuestionOrd(1);
                  setAnswerOrd(0);
                }}
              >
                {standardTypes.map((nt) => (
                  <option key={nt.id} value={nt.id}>
                    {nt.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="wb-design-field">
              {t('ankiWorkbench.design.kind')}
              <select value={kind} onChange={(e) => setKind(e.target.value as CardDesignKind)}>
                <option value="reverse">{t('ankiWorkbench.design.kind.reverse')}</option>
                <option value="optional-reverse">
                  {t('ankiWorkbench.design.kind.optionalReverse')}
                </option>
              </select>
            </label>

            <label className="wb-design-field">
              {t('ankiWorkbench.design.asks')}
              <select value={questionOrd} onChange={(e) => setQuestionOrd(Number(e.target.value))}>
                {noteType?.fields.map((f) => (
                  <option key={f.ord} value={f.ord}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="wb-design-field">
              {t('ankiWorkbench.design.answers')}
              <select value={answerOrd} onChange={(e) => setAnswerOrd(Number(e.target.value))}>
                {noteType?.fields.map((f) => (
                  <option key={f.ord} value={f.ord}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {plan && (
            <>
              {/* The consequence, as a number. "This will add cards" is what a
                  user cannot check; "adds 1,204 cards" is. */}
              <p className="wb-design-effect">
                {t('ankiWorkbench.design.effect', {
                  cards: plan.cardsAdded,
                  notes: plan.notesOfType,
                })}
                {plan.notesWithoutFlag > 0 &&
                  ` ${t('ankiWorkbench.design.skippedUnflagged', { count: plan.notesWithoutFlag })}`}
                {plan.notesWithEmptyQuestion > 0 &&
                  ` ${t('ankiWorkbench.design.skippedEmpty', { count: plan.notesWithEmptyQuestion })}`}
              </p>

              {/* The other half of the consequence, and the one the number above
                  reads as a promise about. It used to say "draft only", which was
                  true and is not any more: `applyCardDesign` now returns a
                  journal op, so the package writes the template and these exact
                  card rows. Live is still refused, and the sentence says which is
                  which rather than a single "may not apply". Row `template-add`
                  in `ankiParityMatrix.ts` is the matching claim — supported on
                  the package, blocked on connect — and a test ties this sentence
                  to it so the two cannot drift. */}
              <p className="muted wb-design-draft-only">{t('ankiWorkbench.design.packageOnly')}</p>

              {plan.problems.length > 0 && (
                <ul className="wb-design-problems" aria-label={t('ankiWorkbench.design.problems')}>
                  {plan.problems.map((p: CardDesignProblem) => (
                    <li
                      key={`${p.code}:${p.detail ?? ''}`}
                      className={
                        BLOCKING_CARD_DESIGN_PROBLEMS.has(p.code)
                          ? 'wb-design-problem wb-design-problem-blocking'
                          : 'wb-design-problem'
                      }
                    >
                      {t(`ankiWorkbench.design.problem.${p.code}`, {
                        detail: p.detail ?? '',
                        count: p.count ?? 0,
                      })}
                    </li>
                  ))}
                </ul>
              )}

              {plan.template && !blocked && (
                <pre className="wb-design-formats" aria-label={t('ankiWorkbench.design.formats')}>
                  {plan.template.qfmt}
                </pre>
              )}

              {sample && (
                <div className="wb-design-sample">
                  <p className="muted">{t('ankiWorkbench.design.sample')}</p>
                  {/* Text, not HTML: this is a one-line "what does it ask", and
                      the rendered card belongs in the sandboxed preview frame
                      rather than anywhere near this panel's own DOM. */}
                  <p className="wb-design-sample-q">{sample.questionHtml.replace(/<[^>]*>/g, '')}</p>
                  {sample.problems.length > 0 && (
                    <ul className="wb-preview-problems">
                      {sample.problems.map((p) => (
                        <ProblemLine key={`${p.code}:${p.side}:${p.detail ?? ''}`} problem={p} />
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <button
                type="button"
                className="btn"
                disabled={blocked}
                onClick={() => {
                  const result = applyCardDesign(draft, plan);
                  setApplied((prev) => [...prev, result.applied]);
                  onDraft(result.draft);
                  onDesignApplied(result.op);
                }}
              >
                {t('ankiWorkbench.design.apply')}
              </button>
            </>
          )}
        </>
      )}

      {applied.length > 0 && (
        <ul className="wb-design-applied" aria-label={t('ankiWorkbench.design.appliedTitle')}>
          {applied.map((a) => (
            <li key={`${a.noteTypeId}:${a.templateOrd}`} className="wb-design-applied-row">
              <span>
                {t('ankiWorkbench.design.appliedRow', {
                  name: a.templateName,
                  cards: a.cardIds.length,
                })}
              </span>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  onDraft(removeCardDesign(draft, a));
                  onDesignRemoved(a.noteTypeId, a.templateOrd);
                  setApplied((prev) => prev.filter((x) => x !== a));
                }}
              >
                {t('ankiWorkbench.design.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

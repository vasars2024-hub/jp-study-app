/**
 * The Deck Workbench shell — Phase 2 of ANKI_DECK_WORKBENCH_PLAN.md.
 *
 * Phase 1 built four loss-aware source adapters and resumable draft sessions and
 * shipped **no user-visible string at all**. This is the surface that finally
 * reads them: the seven-step stepper the plan asks for, the source rail, and
 * step 1 wired to real IPC.
 *
 * Honesty rules this file follows, because the plan's acceptance gates turn on
 * them: a step that is not built yet says so and offers no control, and a source
 * that fails reports the adapter's own error rather than an empty draft.
 *
 * The counts are the trap, and the first live read caught it: `draft.counts.notes`
 * is the **page** the adapter returned, while the result's `totalNotes` is the
 * collection. A real profile with 84 decks read as "500 notes" — exactly the page
 * limit. So the outcome sentence carries the total and a separate line says how
 * much has actually been read; either number alone is a lie for a paged source.
 */
import { useCallback, useEffect, useState } from 'react';
import type { AnkiDraft } from '../../../shared/ankiDraft';
import { ANKI_DRAFT_PAGE_SIZE } from '../../../shared/ankiDraft';
import {
  WORKBENCH_STEP_IDS,
  createWorkbenchFlow,
  findStep,
  goToStep,
  nextStep,
  previousStep,
  recordStep,
  stepIsPassable,
  workbenchFlowProgress,
  type WorkbenchFlowState,
  type WorkbenchStepId,
} from '../../../shared/ankiWorkbenchFlow';
import {
  createEditJournal,
  draftFieldNormalizer,
  redoLastEdit,
  undoLastEdit,
  type AnkiDraftEditJournal,
  type AnkiDraftEditResult,
} from '../../../shared/ankiDraftEdit';
import type { TrayPlan } from '../../../shared/ankiChangeTray';
import { countJournalSteps } from '../../../shared/ankiDraftEdit';
import { loadDeckAsAnkiDraft } from '../../flashcardDeck';
import { useT } from '../../i18n';
import DeckWorkbenchBrowser from './DeckWorkbenchBrowser';
import DeckWorkbenchTray from './DeckWorkbenchTray';
import DeckWorkbenchJournal from './DeckWorkbenchJournal';
import './deckWorkbench.css';

type SourceKey = 'apkg' | 'connect' | 'localDeck';

type SessionRow = Awaited<ReturnType<typeof listSessions>>[number];

function listSessions() {
  return window.api.ankiDraftSessionList();
}

/** The worst severity present, which is what decides the step's validation. */
function draftValidation(draft: AnkiDraft): 'ok' | 'warning' | 'blocked' {
  if (draft.diagnostics.some((d) => d.severity === 'blocking')) return 'blocked';
  if (draft.diagnostics.some((d) => d.severity === 'warning')) return 'warning';
  return 'ok';
}

export default function DeckWorkbench() {
  const { t } = useT();
  const [flow, setFlow] = useState<WorkbenchFlowState>(createWorkbenchFlow);
  const [draft, setDraft] = useState<AnkiDraft | null>(null);
  /** Notes in the whole source. Absent for an adapter that does not page. */
  const [totalNotes, setTotalNotes] = useState<number | null>(null);
  const [busy, setBusy] = useState<SourceKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<WorkbenchStepId | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  /** Every draft edit, oldest first, with its own before-image. */
  const [journal, setJournal] = useState<AnkiDraftEditJournal>(createEditJournal);
  /** Selected notes the tray can act on now — loaded ones only. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** What the selection stands for, which on a paged source is the larger number. */
  const [selectedCount, setSelectedCount] = useState(0);

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await listSessions());
    } catch {
      // A session list that cannot be read is not a reason to hide the workbench;
      // the sources below do not depend on it.
      setSessions([]);
    }
  }, []);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const adoptDraft = useCallback((next: AnkiDraft, total?: number) => {
    const whole = total ?? next.counts.notes;
    setDraft(next);
    setTotalNotes(whole);
    setError(null);
    // The journal's ops name notes in the draft they were computed against.
    // Carrying them onto a different source would let undo write a previous
    // deck's text into a note that merely shares an id.
    setJournal(createEditJournal());
    // Same reason: ids from the previous source name nothing here, and a tray
    // built against them would report a scope it does not have.
    setSelectedIds([]);
    setSelectedCount(0);
    setFlow((prev) =>
      recordStep(prev, 'source', {
        satisfied: true,
        outcomeKey: 'ankiWorkbench.step.source.outcome',
        outcomeParams: { label: next.source.label, notes: whole },
        // What a later step would act on is the whole source, not the page.
        affected: whole,
        validation: draftValidation(next),
        // Every later step was computed from the previous source. They keep
        // their numbers and stop counting as done — the plan's "Back never
        // loses work", expressed as staleness rather than deletion.
        invalidatesLaterSteps: true,
      }),
    );
  }, []);

  const chooseSource = useCallback(
    async (key: SourceKey) => {
      setBusy(key);
      setError(null);
      try {
        if (key === 'localDeck') {
          adoptDraft(loadDeckAsAnkiDraft().draft);
        } else if (key === 'apkg') {
          const res = await window.api.readApkgDraft({ noteLimit: ANKI_DRAFT_PAGE_SIZE });
          if (!res.ok || !res.draft) {
            // A cancelled file dialog is not a failure and must not shout.
            if (res.error && res.error !== 'cancelled') setError(res.error);
          } else adoptDraft(res.draft, res.totalNotes);
        } else {
          const res = await window.api.readAnkiConnectDraft({ noteLimit: ANKI_DRAFT_PAGE_SIZE });
          if (!res.ok || !res.draft) setError(res.error ?? 'unknown');
          else adoptDraft(res.draft, res.totalNotes);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
        void refreshSessions();
      }
    },
    [adoptDraft, refreshSessions],
  );

  const move = useCallback((to: WorkbenchStepId | 'next' | 'back') => {
    setFlow((prev) => {
      const res = to === 'next' ? nextStep(prev) : to === 'back' ? previousStep(prev) : goToStep(prev, to);
      setLocked(res.ok ? null : (res.blockedBy ?? null));
      return res.state;
    });
  }, []);

  const onBrowseSelection = useCallback((count: number, wholeSource: boolean, ids: string[]) => {
    setSelectedIds(ids);
    setSelectedCount(count);
    setFlow((prev) =>
      recordStep(prev, 'browse', {
        // Zero selected is a legitimate state, and it is not a finished step.
        satisfied: count > 0,
        outcomeKey: wholeSource
          ? 'ankiWorkbench.step.browse.outcomeAll'
          : 'ankiWorkbench.step.browse.outcome',
        outcomeParams: { count },
        affected: count,
      }),
    );
  }, []);

  const applyEdit = useCallback((result: AnkiDraftEditResult) => {
    if (!result.changed) return;
    setDraft(result.draft);
    setJournal(result.journal);
  }, []);

  /**
   * Applying the tray is adopting the plan the preview was computed from — the
   * batch is not re-run here, so what the user read is exactly what lands.
   */
  const applyTray = useCallback((plan: TrayPlan) => {
    if (plan.blocked || plan.changedNotes === 0) return;
    setDraft(plan.draft);
    setJournal(plan.journal);
  }, []);

  /**
   * Undo and redo re-run the op's inverse against the *current* draft rather
   * than restoring a snapshot, so the edit that is taken back is the one named
   * in the journal and nothing else is rolled back with it.
   */
  const stepHistory = useCallback(
    (direction: 'undo' | 'redo') => {
      setDraft((prevDraft) => {
        if (!prevDraft) return prevDraft;
        const normalize = draftFieldNormalizer(prevDraft.source);
        const run = direction === 'undo' ? undoLastEdit : redoLastEdit;
        const result = run(prevDraft, journal, normalize);
        if (!result.changed) return prevDraft;
        setJournal(result.journal);
        return result.draft;
      });
    },
    [journal],
  );

  const discardSession = useCallback(
    async (id: string) => {
      await window.api.ankiDraftSessionDelete(id);
      await refreshSessions();
    },
    [refreshSessions],
  );

  const progress = workbenchFlowProgress(flow);
  const currentStep = findStep(flow, flow.current);
  const blocking = draft?.diagnostics.filter((d) => d.severity === 'blocking') ?? [];
  const warnings = draft?.diagnostics.filter((d) => d.severity === 'warning') ?? [];

  return (
    <div className="deck-workbench">
      <div className="deck-workbench-head">
        <h2>{t('ankiWorkbench.title')}</h2>
        <p className="muted">{t('ankiWorkbench.lead')}</p>
        <p className="deck-workbench-progress">
          {t('ankiWorkbench.progress', { completed: progress.completed, total: progress.total })}
        </p>
      </div>

      <ol className="deck-workbench-stepper" aria-label={t('ankiWorkbench.stepper.label')}>
        {WORKBENCH_STEP_IDS.map((id, i) => {
          const step = findStep(flow, id);
          const reachable = i <= WORKBENCH_STEP_IDS.indexOf(progress.blockedAt);
          return (
            <li key={id}>
              <button
                type="button"
                className={`deck-workbench-step${flow.current === id ? ' current' : ''}${
                  stepIsPassable(step) ? ' done' : ''
                }${step.stale ? ' stale' : ''}`}
                aria-current={flow.current === id ? 'step' : undefined}
                disabled={!reachable}
                onClick={() => move(id)}
              >
                <span className="deck-workbench-step-num">{i + 1}</span>
                <span className="deck-workbench-step-label">{t(`ankiWorkbench.step.${id}`)}</span>
                {step.outcomeKey && (
                  <span className="deck-workbench-step-outcome">
                    {t(step.outcomeKey, step.outcomeParams)}
                  </span>
                )}
                {step.stale && (
                  <span className="deck-workbench-step-flag">{t('ankiWorkbench.step.stale')}</span>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {locked && (
        <p className="deck-workbench-locked" role="status">
          {t('ankiWorkbench.step.locked', { step: t(`ankiWorkbench.step.${locked}`) })}
        </p>
      )}

      <div className={`deck-workbench-body${flow.current === 'source' ? '' : ' single'}`}>
        {flow.current === 'source' ? (
          <>
            <div className="deck-workbench-rail">
              <h3>{t('ankiWorkbench.source.title')}</h3>
              {(['apkg', 'connect', 'localDeck'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  className="deck-workbench-source"
                  disabled={busy !== null}
                  onClick={() => void chooseSource(key)}
                >
                  <span className="deck-workbench-source-name">
                    {t(`ankiWorkbench.source.${key}`)}
                  </span>
                  <span className="muted">{t(`ankiWorkbench.source.${key}.hint`)}</span>
                </button>
              ))}
              {busy && <p className="muted" role="status">{t('ankiWorkbench.source.reading')}</p>}
              {error && (
                <p className="deck-workbench-error" role="alert">
                  {t('ankiWorkbench.source.failed', { error })}
                </p>
              )}
            </div>

            <div className="deck-workbench-detail">
              {draft ? (
                <>
                  <p className="deck-workbench-outcome">
                    {t('ankiWorkbench.step.source.outcome', {
                      label: draft.source.label,
                      notes: totalNotes ?? draft.counts.notes,
                    })}
                  </p>
                  <ul className="deck-workbench-facts">
                    <li>
                      {(totalNotes ?? draft.counts.notes) > draft.counts.notes
                        ? t('ankiWorkbench.facts.page', {
                            loaded: draft.counts.notes,
                            total: totalNotes ?? draft.counts.notes,
                            cards: draft.counts.cards,
                          })
                        : t('ankiWorkbench.facts.loadedAll', {
                            loaded: draft.counts.notes,
                            cards: draft.counts.cards,
                          })}
                    </li>
                    <li>{t('ankiWorkbench.facts.decks', { count: draft.counts.decks })}</li>
                    <li>{t('ankiWorkbench.facts.noteTypes', { count: draft.counts.noteTypes })}</li>
                    <li>{t('ankiWorkbench.facts.media', { count: draft.counts.mediaReferences })}</li>
                  </ul>
                  {blocking.length > 0 && (
                    <p className="deck-workbench-error" role="alert">
                      {t('ankiWorkbench.diagnostics.blocking', {
                        count: blocking.reduce((n, d) => n + d.count, 0),
                        codes: blocking.map((d) => d.code).join(', '),
                      })}
                    </p>
                  )}
                  {blocking.length === 0 && warnings.length > 0 && (
                    <p className="deck-workbench-warning">
                      {t('ankiWorkbench.diagnostics.warning', {
                        count: warnings.reduce((n, d) => n + d.count, 0),
                        codes: warnings.map((d) => d.code).join(', '),
                      })}
                    </p>
                  )}
                  {blocking.length === 0 && warnings.length === 0 && (
                    <p className="muted">{t('ankiWorkbench.diagnostics.clean')}</p>
                  )}
                </>
              ) : (
                <p className="muted">{t('ankiWorkbench.source.empty')}</p>
              )}

              <h3>{t('ankiWorkbench.sessions.title')}</h3>
              {sessions.length === 0 ? (
                <p className="muted">{t('ankiWorkbench.sessions.none')}</p>
              ) : (
                <ul className="deck-workbench-sessions">
                  {sessions.map(({ session, progress: p }) => (
                    <li key={session.id}>
                      <span>
                        {t(`ankiWorkbench.sessions.status.${p.status}`)} — {session.label}
                      </span>
                      <span className="muted">
                        {t('ankiWorkbench.sessions.covered', {
                          covered: p.covered,
                          total: p.totalNotes ?? '?',
                        })}
                      </span>
                      <button
                        type="button"
                        className="btn"
                        onClick={() => void discardSession(session.id)}
                      >
                        {t('ankiWorkbench.sessions.discard')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : flow.current === 'browse' && draft ? (
          <div className="deck-workbench-detail deck-workbench-detail-wide">
            {currentStep.stale && <p className="muted">{t('ankiWorkbench.step.staleDetail')}</p>}
            <div className="deck-workbench-history">
              <button
                type="button"
                className="btn"
                disabled={journal.done.length === 0}
                onClick={() => stepHistory('undo')}
              >
                {/* Steps, not ops: one tray over 3,000 notes is one undo, and a
                    button reading "Undo (3000)" would describe the wrong thing. */}
                {t('ankiWorkbench.edit.undo', { count: countJournalSteps(journal.done) })}
              </button>
              <button
                type="button"
                className="btn"
                disabled={journal.undone.length === 0}
                onClick={() => stepHistory('redo')}
              >
                {t('ankiWorkbench.edit.redo', { count: countJournalSteps(journal.undone) })}
              </button>
              <span className="muted">{t('ankiWorkbench.edit.draftOnly')}</span>
            </div>
            <DeckWorkbenchJournal draft={draft} journal={journal} />
            <DeckWorkbenchBrowser
              draft={draft}
              totalNotes={totalNotes ?? draft.counts.notes}
              journal={journal}
              onSelection={onBrowseSelection}
              onEdit={applyEdit}
            />
            <DeckWorkbenchTray
              draft={draft}
              journal={journal}
              selectedIds={selectedIds}
              selectedCount={selectedCount}
              onApply={applyTray}
            />
          </div>
        ) : (
          <div className="deck-workbench-detail">
            <p className="deck-workbench-outcome">{t(`ankiWorkbench.step.${flow.current}`)}</p>
            <p className="muted">{t('ankiWorkbench.step.notReady')}</p>
            {currentStep.stale && <p className="muted">{t('ankiWorkbench.step.staleDetail')}</p>}
          </div>
        )}
      </div>

      <div className="deck-workbench-nav">
        <button
          type="button"
          className="btn"
          disabled={flow.current === WORKBENCH_STEP_IDS[0]}
          onClick={() => move('back')}
        >
          {t('ankiWorkbench.back')}
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={flow.current === WORKBENCH_STEP_IDS[WORKBENCH_STEP_IDS.length - 1]}
          onClick={() => move('next')}
        >
          {t('ankiWorkbench.next')}
        </button>
      </div>
    </div>
  );
}

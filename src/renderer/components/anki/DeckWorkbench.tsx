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
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import type { TrayAction, TrayPlan } from '../../../shared/ankiChangeTray';
import { countJournalSteps, trailingStep } from '../../../shared/ankiDraftEdit';
import {
  invertMasteryWrites,
  masteryWrites,
  type MasteryWrite,
} from '../../../shared/ankiMastery';
import { setLevel, type WkLevel } from '../../knownWords';
import { loadDeckAsAnkiDraft } from '../../flashcardDeck';
import { useT } from '../../i18n';
import DeckWorkbenchBrowser from './DeckWorkbenchBrowser';
import DeckWorkbenchTray, {
  ENRICH_ACTION_KINDS,
  FIELD_ACTION_KINDS,
  RULE_ACTION_KINDS,
} from './DeckWorkbenchTray';
import DeckWorkbenchJournal from './DeckWorkbenchJournal';
import DeckWorkbenchCardDesign from './DeckWorkbenchCardDesign';
import DeckWorkbenchReview from './DeckWorkbenchReview';
import DeckWorkbenchApply from './DeckWorkbenchApply';
import { buildWorkbenchReview } from '../../../shared/ankiWorkbenchReview';
import type { ApkgExportResult } from '../../../shared/ankiApkgExport';
import './deckWorkbench.css';

type SourceKey = 'apkg' | 'connect' | 'localDeck';

/**
 * Which of the numbered steps owns which tray action kinds. The three sets
 * partition the tray's whole catalogue and no kind appears twice — that
 * exclusivity is what makes the flow a flow rather than a decoration over one
 * big panel, and `deckWorkbench.test.tsx` asserts it against the tray's own
 * list so a kind added later cannot quietly belong to no step.
 *
 * Step 2 is deliberately absent: the plan gives it "search, filter, inspect,
 * and confirm which notes/cards will change", which is a selection, not an
 * edit. Its inline field editing stays, because that is editing one note the
 * user is looking at rather than queueing a batch.
 */
const STEP_TRAY_KINDS = {
  enrich: ENRICH_ACTION_KINDS,
  fields: FIELD_ACTION_KINDS,
  rules: RULE_ACTION_KINDS,
} as const;

type TrayStepId = keyof typeof STEP_TRAY_KINDS;

const TRAY_STEP_IDS = Object.keys(STEP_TRAY_KINDS) as TrayStepId[];

function isTrayStep(id: WorkbenchStepId): id is TrayStepId {
  return (TRAY_STEP_IDS as WorkbenchStepId[]).includes(id);
}

type SessionRow = Awaited<ReturnType<typeof listSessions>>[number];

function listSessions() {
  return window.api.ankiDraftSessionList();
}

/** One applied mastery mapping, carrying both directions it can be moved in. */
interface MasteryStep {
  /** The tray group it belonged to, so one tray stays one undo. */
  groupId: string;
  forward: MasteryWrite[];
  backward: MasteryWrite[];
}

interface MasteryHistory {
  undo: MasteryStep[];
  redo: MasteryStep[];
}

const EMPTY_MASTERY_HISTORY: MasteryHistory = { undo: [], redo: [] };

/**
 * One knowledge write. `level: null` means *remove the entry*, and passing 0
 * with `manual` is exactly how `knownWords.setLevel` deletes one — so restoring
 * "never judged" and setting "New" are the same call, which is correct: they are
 * the same stored state.
 */
function writeMasteryLevel(write: MasteryWrite): void {
  setLevel(write.term, (write.level ?? 0) as WkLevel, true);
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
  /**
   * The mastery half of the edit history. It cannot live in the draft journal:
   * every op there names a note in the draft, and a mastery entry names a lemma
   * in a store that outlives the draft entirely. Keyed by the tray's group id so
   * one tray remains one undo across both.
   */
  const [masteryHistory, setMasteryHistory] = useState<MasteryHistory>(EMPTY_MASTERY_HISTORY);
  /** Selected notes the tray can act on now — loaded ones only. */
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  /** What the selection stands for, which on a paged source is the larger number. */
  const [selectedCount, setSelectedCount] = useState(0);
  /**
   * The change tray's queue, owned here rather than by the tray, because the
   * guided flow splits the action kinds across steps and every Back or Next
   * unmounts the tray. A queue inside it would be silently destroyed by
   * navigation, which is the one thing the flow promises never happens.
   */
  const [trayActions, setTrayActions] = useState<TrayAction[]>([]);
  /**
   * What each tray step's outcome sentence is a claim *about*: the tray group it
   * recorded, and the count it recorded. Undo runs from whichever step the user
   * is standing on, so without this the stepper keeps reading "3,023 notes
   * edited" over a batch that has just been taken back.
   */
  const [stepClaims, setStepClaims] = useState<
    Partial<Record<TrayStepId, { groupId: string; count: number }>>
  >({});

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
    // A queued action names fields and a batch belonging to the previous source.
    // Carrying it over would let Apply run a plan the user built against a deck
    // that is no longer open.
    setTrayActions([]);
    setStepClaims({});
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
    const mastery = plan.mastery;
    const masteryCount = mastery?.changes.length ?? 0;
    if (plan.blocked || (plan.changedNotes === 0 && masteryCount === 0)) return;
    if (mastery && masteryCount > 0) {
      // Local knowledge is keyed by lemma and lives outside the draft, so it is
      // written here rather than adopted with `plan.draft`. Its inverse is
      // stacked under the tray's own group id, which is what lets one tray stay
      // one undo even when half of it landed in a different store.
      const forward = masteryWrites(mastery);
      const backward = invertMasteryWrites(mastery);
      for (const write of forward) writeMasteryLevel(write);
      setMasteryHistory((prev) => ({
        undo: [...prev.undo, { groupId: plan.groupId, forward, backward }],
        // A fresh apply forks the history, exactly as the draft journal's does.
        redo: [],
      }));
    }
    setDraft(plan.draft);
    setJournal(plan.journal);
    // The step the tray was applied on owns the outcome sentence, so the count
    // is read from the plan rather than recomputed. `browse` never records
    // here: it records a selection, which an apply does not change.
    const at = flow.current;
    if (!isTrayStep(at)) return;
    setStepClaims((prev) => ({ ...prev, [at]: { groupId: plan.groupId, count: plan.changedNotes } }));
    setFlow((prev) =>
      recordStep(prev, at, {
        satisfied: true,
        outcomeKey: `ankiWorkbench.step.${at}.outcome`,
        outcomeParams: { count: plan.changedNotes },
        affected: plan.changedNotes,
      }),
    );
  }, [flow.current]);

  /**
   * Move a step's outcome sentence with the batch it describes. An undo of the
   * group a step recorded leaves that step honestly empty again; a redo puts the
   * number back. Doing only the first half would be a lie in the other
   * direction, so both run off the same stored claim.
   */
  const restateClaim = useCallback(
    (groupId: string | undefined, undone: boolean) => {
      if (!groupId) return;
      const at = TRAY_STEP_IDS.find((id) => stepClaims[id]?.groupId === groupId);
      if (!at) return;
      const count = stepClaims[at]?.count ?? 0;
      setFlow((prev) =>
        recordStep(prev, at, {
          satisfied: true,
          outcomeKey: undone
            ? `ankiWorkbench.step.${at}.outcomeNone`
            : `ankiWorkbench.step.${at}.outcome`,
          outcomeParams: undone ? {} : { count },
          affected: undone ? 0 : count,
        }),
      );
    },
    [stepClaims],
  );

  /**
   * Steps 3, 4 and 5 are satisfied by being visited, not by queueing anything:
   * the plan offers each of their tools as an "or", so a deck that needs none of
   * them is a finished step and a mandatory "skip" button would be a required
   * decision about nothing. Each records its own "nothing yet" sentence out loud
   * rather than passing silently, and an apply above replaces that with the real
   * count.
   */
  useEffect(() => {
    const at = flow.current;
    if (!isTrayStep(at)) return;
    setFlow((prev) => {
      const step = findStep(prev, at);
      // A stale step is re-recorded: its old count was measured against the
      // source that has since been replaced, so it must not survive as a claim.
      if (step.satisfied && !step.stale) return prev;
      return recordStep(prev, at, {
        satisfied: true,
        outcomeKey: `ankiWorkbench.step.${at}.outcomeNone`,
        outcomeParams: {},
        affected: 0,
      });
    });
  }, [flow.current]);

  /**
   * Step 6's numbers: the net of the whole session, measured from the
   * journal's before-images against the draft's current bytes. Recomputed on
   * every edit or undo by design — the review must never describe a draft
   * other than the one on screen.
   */
  const reviewSummary = useMemo(
    () => (draft ? buildWorkbenchReview(draft, journal) : null),
    [draft, journal],
  );
  /** Knowledge writes that already landed live when their tray was applied. */
  const masteryApplied = masteryHistory.undo.reduce((n, s) => n + s.forward.length, 0);

  /**
   * Review re-records whenever its numbers move while the user stands on it —
   * an undo run *from* step 6 must restate the sentence it just falsified.
   * Unlike steps 3–5 this cannot record only when unsatisfied: the numbers
   * are the point of the step, not a side effect of visiting it.
   */
  useEffect(() => {
    if (flow.current !== 'review' || !reviewSummary) return;
    const count = reviewSummary.changedNotes;
    // Three honest sentences: notes change; only already-live knowledge levels
    // changed; nothing changed at all. "0 notes would change" over a session
    // that did write mastery levels would be the wrong kind of true.
    const [key, params] =
      count > 0
        ? (['ankiWorkbench.step.review.outcome', { count }] as const)
        : masteryApplied > 0
          ? (['ankiWorkbench.step.review.outcomeMastery', { count: masteryApplied }] as const)
          : (['ankiWorkbench.step.review.outcomeNone', {}] as const);
    setFlow((prev) =>
      recordStep(prev, 'review', {
        satisfied: true,
        outcomeKey: key,
        outcomeParams: params,
        affected: count,
      }),
    );
  }, [flow.current, reviewSummary, masteryApplied]);

  /**
   * Undo and redo re-run the op's inverse against the *current* draft rather
   * than restoring a snapshot, so the edit that is taken back is the one named
   * in the journal and nothing else is rolled back with it.
   */
  const stepHistory = useCallback(
    (direction: 'undo' | 'redo') => {
      // The mastery half of the step first, because it is decided by the same
      // group id the draft ops carry and a mastery-only tray leaves no ops at
      // all — in which case this *is* the whole step and there is nothing to
      // run against the draft.
      const step = trailingStep(direction === 'undo' ? journal.done : journal.undone);
      const stack = direction === 'undo' ? masteryHistory.undo : masteryHistory.redo;
      const top = stack[stack.length - 1];
      const masteryOnly = top !== undefined && step.length === 0;
      // The group is the same identifier on both halves, so one call covers a
      // draft-only tray, a mastery-only tray and one that was both.
      restateClaim(step[0]?.group ?? top?.groupId, direction === 'undo');
      if (top && (masteryOnly || step[0]?.group === top.groupId)) {
        // The entry carries both directions, captured when it was applied — a
        // recomputed inverse would read the store *after* the writes it is
        // supposed to reverse and restore the values it just wrote.
        for (const write of direction === 'undo' ? top.backward : top.forward) {
          writeMasteryLevel(write);
        }
        setMasteryHistory((prev) =>
          direction === 'undo'
            ? { undo: prev.undo.slice(0, -1), redo: [...prev.redo, top] }
            : { redo: prev.redo.slice(0, -1), undo: [...prev.undo, top] },
        );
      }
      if (masteryOnly) return;
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
    [journal, masteryHistory, restateClaim],
  );

  /**
   * Step 7's outcome sentence carries the exporter's own numbers, never a
   * recount — the exporter verified them against the written file, and this
   * step's claim must be about that file, not about the draft.
   */
  const onExported = useCallback((res: ApkgExportResult) => {
    setFlow((prev) =>
      recordStep(prev, 'apply', {
        satisfied: true,
        outcomeKey: 'ankiWorkbench.step.apply.outcome',
        outcomeParams: { file: res.fileName ?? '', notes: res.notesUpdated ?? 0 },
        affected: (res.notesUpdated ?? 0) + (res.cardsUpdated ?? 0),
      }),
    );
  }, []);

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

  /**
   * One history strip, shared by every step that can edit the draft. It is the
   * same two buttons over the same journal wherever it is rendered, because the
   * journal is the draft's and not any one step's — an undo on step 5 takes back
   * whatever the last tray was, including one queued on step 3.
   */
  const history = (
    <div className="deck-workbench-history">
      <button
        type="button"
        className="btn"
        disabled={journal.done.length === 0 && masteryHistory.undo.length === 0}
        onClick={() => stepHistory('undo')}
      >
        {/* Steps, not ops: one tray over 3,000 notes is one undo, and a button
            reading "Undo (3000)" would describe the wrong thing. */}
        {t('ankiWorkbench.edit.undo', { count: countJournalSteps(journal.done) })}
      </button>
      <button
        type="button"
        className="btn"
        disabled={journal.undone.length === 0 && masteryHistory.redo.length === 0}
        onClick={() => stepHistory('redo')}
      >
        {t('ankiWorkbench.edit.redo', { count: countJournalSteps(journal.undone) })}
      </button>
      <span className="muted">{t('ankiWorkbench.edit.draftOnly')}</span>
    </div>
  );

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
            {history}
            <DeckWorkbenchJournal draft={draft} journal={journal} />
            <DeckWorkbenchBrowser
              draft={draft}
              totalNotes={totalNotes ?? draft.counts.notes}
              journal={journal}
              onSelection={onBrowseSelection}
              onEdit={applyEdit}
            />
          </div>
        ) : isTrayStep(flow.current) && draft ? (
          <div className="deck-workbench-detail deck-workbench-detail-wide">
            <p className="deck-workbench-outcome">
              {t(`ankiWorkbench.step.${flow.current}.lead`)}
            </p>
            {currentStep.stale && <p className="muted">{t('ankiWorkbench.step.staleDetail')}</p>}
            {/* A card design changes the note type, not the selected notes, so
                it sits beside the tray rather than inside it, reads no selection
                and is offered even when the tray cannot be. */}
            {flow.current === 'fields' && <DeckWorkbenchCardDesign draft={draft} onDraft={setDraft} />}
            {selectedIds.length === 0 ? (
              // Step 2 will not pass on an empty selection, so this is the paged
              // case: a selection that stands for notes none of which are
              // loaded. The tray could only refuse every note, for a reason
              // invisible from here, so it is not offered at all.
              <p className="muted">{t(`ankiWorkbench.step.${flow.current}.noSelection`)}</p>
            ) : (
              <>
                {history}
                <DeckWorkbenchJournal draft={draft} journal={journal} />
                <DeckWorkbenchTray
                  draft={draft}
                  journal={journal}
                  selectedIds={selectedIds}
                  selectedCount={selectedCount}
                  onApply={applyTray}
                  kinds={STEP_TRAY_KINDS[flow.current]}
                  actions={trayActions}
                  onActionsChange={setTrayActions}
                />
              </>
            )}
          </div>
        ) : flow.current === 'review' && draft && reviewSummary ? (
          <div className="deck-workbench-detail deck-workbench-detail-wide">
            <p className="deck-workbench-outcome">{t('ankiWorkbench.step.review.lead')}</p>
            {currentStep.stale && <p className="muted">{t('ankiWorkbench.step.staleDetail')}</p>}
            {/* The history strip stays offered here: reading the dry run is
                exactly when a user decides to take a step back. */}
            {history}
            <DeckWorkbenchJournal draft={draft} journal={journal} />
            <DeckWorkbenchReview
              draft={draft}
              summary={reviewSummary}
              totalNotes={totalNotes ?? draft.counts.notes}
              masteryWrites={masteryApplied}
            />
          </div>
        ) : flow.current === 'apply' && draft ? (
          <div className="deck-workbench-detail deck-workbench-detail-wide">
            <p className="deck-workbench-outcome">{t('ankiWorkbench.step.apply.lead')}</p>
            {currentStep.stale && <p className="muted">{t('ankiWorkbench.step.staleDetail')}</p>}
            {/* Undo stays offered on the last step: what it changes is the net
                set the export button claims, and the claim recomputes live. */}
            {history}
            <DeckWorkbenchJournal draft={draft} journal={journal} />
            <DeckWorkbenchApply draft={draft} journal={journal} onExported={onExported} />
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

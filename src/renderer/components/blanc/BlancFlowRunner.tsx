/**
 * The Flow overlay (a lazy chunk; nothing here is Blanc startup cost).
 *
 * One run: setup -> due reviews -> new cards -> Capture inbox -> resume
 * reading -> report. Keyboard only if you like: Space/Enter shows the answer
 * and then grades Good, 1-4 grade Again/Hard/Good/Easy, Z undoes the last
 * grade, S skips the rest of a stage, Esc pauses (the run waits in the top
 * bar), Q ends it early. The plan and the state machine are `blancFlow.ts`;
 * this file only performs the side effects, through the deck's own seams:
 * `reviewDeckCard` for every grade and `undoLastReview` for Z.
 *
 * The run lives in module state, not in the component, so pausing closes the
 * overlay without losing it and a sprint ending while paused still lands.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { LibraryItem } from '../../../shared/types';
import type { LocalSrsRating } from '../../../shared/localSrs';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { studyLangOfText } from '../../../shared/studyLang';
import { t as translate, useT } from '../../i18n';
import { getStudyLang } from '../../studyEnvironment';
import { getActiveProfile } from '../../profileState';
import { useVisibleInterval } from '../../useVisibleInterval';
import {
  introducedTodayCount,
  loadDeck,
  peekReviewUndo,
  reviewDeckCard,
  undoLastReview,
  type DeckFlashcard,
} from '../../flashcardDeck';
import {
  focusTimerSeconds,
  getFocusTimer,
  pauseFocusTimer,
  resetFocusTimer,
  setFocusTimerMinutes,
  setFocusTimerMode,
  startFocusTimer,
  subscribeFocusTimer,
} from './blancFocusTimer';
import {
  FLOW_WORK_STAGES,
  createFlowState,
  currentFlowCard,
  flowElapsedMs,
  flowReducer,
  flowTotals,
  formatFlowDuration,
  formatFlowReport,
  planFlow,
  type FlowAction,
  type FlowState,
} from './blancFlow';
import { FLOW_SPRINT_OPTIONS, loadBlancMechSettings } from './blancMechSettings';
import { loadCaptureInbox } from './blancCaptureInbox';
import { setBlancFlowStatus } from './blancMechBus';
import { CaptureTriageList } from './BlancCaptureInboxPanel';
import '../../theme/blanc-mechanics-overlays.css';

interface FlowSession {
  state: FlowState;
  cards: Map<string, DeckFlashcard>;
  readItem: LibraryItem | null;
  /** The run started the focus timer as its sprint, so it may pause/reset it. */
  sprintOwned: boolean;
}

let session: FlowSession | null = null;
const sessionListeners = new Set<(state: FlowState | null) => void>();
let offTimer: (() => void) | null = null;

function remainingOf(state: FlowState): number {
  if (state.stage === 'done' || state.stage === 'setup') return 0;
  const ahead = FLOW_WORK_STAGES.slice(FLOW_WORK_STAGES.indexOf(state.stage as (typeof FLOW_WORK_STAGES)[number]) + 1);
  let count = state.queue.length;
  for (const stage of ahead) {
    if (stage === 'new') count += state.plan.news.length;
    else if (stage === 'inbox') count += state.plan.inbox > 0 ? 1 : 0;
    else if (stage === 'read') count += state.plan.read ? 1 : 0;
  }
  if (state.stage === 'inbox' || state.stage === 'read') count += 1;
  return count;
}

function publish(state: FlowState | null): void {
  if (!state || state.stage === 'setup') setBlancFlowStatus({ phase: 'idle', remaining: 0 });
  else if (state.stage === 'done') setBlancFlowStatus({ phase: 'done', remaining: 0 });
  else setBlancFlowStatus({ phase: state.paused ? 'paused' : 'running', remaining: remainingOf(state) });
  for (const listener of sessionListeners) listener(state);
}

function releaseSprint(state: FlowState): void {
  if (!session?.sprintOwned) return;
  // A run that finished early stops its countdown; one that ran out already stopped.
  if (state.endReason !== 'timebox') resetFocusTimer();
  session.sprintOwned = false;
  offTimer?.();
  offTimer = null;
}

function apply(action: FlowAction): FlowState | null {
  if (!session) return null;
  const before = session.state;
  const next = flowReducer(before, action);
  if (next === before) return before;
  session.state = next;
  if (next.stage === 'done' && before.stage !== 'done') releaseSprint(next);
  publish(next);
  return next;
}

/** The sprint ran out: let the reducer decide whether this card finishes first. */
function watchSprint(): void {
  offTimer?.();
  offTimer = subscribeFocusTimer((timer) => {
    if (!session?.sprintOwned || timer.finishedAt === null || session.state.timeUp) return;
    apply({ type: 'timeUp', now: Date.now() });
  });
}

function endSession(): void {
  if (session && session.state.stage !== 'done') releaseSprint(session.state);
  offTimer?.();
  offTimer = null;
  session = null;
  publish(null);
}

async function planSession(): Promise<FlowSession> {
  const settings = loadBlancMechSettings();
  const now = Date.now();
  const deck = loadDeck();
  let library: LibraryItem[] = [];
  if (settings.flowIncludeReading) {
    try {
      library = await window.api.listLibrary();
    } catch {
      library = [];
    }
  }
  const readItem = library
    .filter((item) => typeof item.lastReadAt === 'number')
    .sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0))[0] ?? null;
  const plan = planFlow({
    cards: deck,
    now,
    newPerDay: getActiveProfile().deckParams.newPerDay,
    introducedToday: introducedTodayCount(now),
    inboxCount: loadCaptureInbox().length,
    readTarget: readItem ? { id: readItem.id, title: readItem.title } : null,
    includeInbox: settings.flowIncludeInbox,
    includeReading: settings.flowIncludeReading,
  });
  return {
    state: createFlowState(plan, settings.flowSprintMinutes),
    cards: new Map(deck.map((card) => [card.id, card])),
    readItem,
    sprintOwned: false,
  };
}

function plainText(value: string | undefined): string {
  return (value ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const RATINGS: readonly LocalSrsRating[] = ['again', 'hard', 'good', 'easy'];

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

async function copyReport(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function BlancFlowRunner({
  onClose,
  onOpenBook,
}: {
  onClose: () => void;
  onOpenBook: (item: LibraryItem) => void;
}) {
  const { t, lang } = useT();
  const [state, setState] = useState<FlowState | null>(() => session?.state ?? null);
  const [note, setNote] = useState('');
  const [, setTick] = useState(0);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    sessionListeners.add(setState);
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    let alive = true;
    if (session) {
      // Reopened: a paused run resumes, its sprint with it.
      if (session.state.paused) {
        apply({ type: 'resume', now: Date.now() });
        if (session?.sprintOwned && !session.state.timeUp) startFocusTimer();
      }
      setState(session?.state ?? null);
    } else {
      void planSession().then((planned) => {
        if (!alive) return;
        session = planned;
        publish(planned.state);
        setState(planned.state);
      });
    }
    return () => {
      alive = false;
      sessionListeners.delete(setState);
      previousFocus.current?.focus();
    };
  }, []);

  const running = state !== null && state.stage !== 'setup' && state.stage !== 'done' && !state.paused;
  // The clock repaints once a second while the run is on screen and visible.
  useVisibleInterval(() => setTick((n) => n + 1), 1000, running);

  // Keep the keyboard on the dialog after every step, so Space never presses
  // whatever button the mouse clicked last.
  const stage = state?.stage;
  const cardId = state ? currentFlowCard(state) : null;
  const revealed = state?.revealed ?? false;
  useEffect(() => {
    if (stage === 'inbox') return;
    dialogRef.current?.focus({ preventScroll: true });
  }, [stage, cardId, revealed]);

  const card = cardId ? session?.cards.get(cardId) ?? null : null;
  const dateFormat = useMemo(
    () => new Intl.DateTimeFormat(LANG_TAGS[lang], { dateStyle: 'medium', timeStyle: 'short' }),
    [lang],
  );

  if (!state) {
    return (
      <div className="blanc-mech-backdrop">
        <section className="blanc-mech-dialog blanc-flow" role="dialog" aria-modal="true" aria-label={t('blanc.mech.flow.title')}>
          <p className="blanc-note" role="status">{t('blanc.mech.flow.planning')}</p>
        </section>
      </div>
    );
  }

  const now = Date.now();
  const report = state.stage === 'done'
    ? formatFlowReport(state, now, translate, dateFormat.format(state.startedAt ?? now))
    : '';

  const close = (): void => {
    if (state.stage === 'setup' || state.stage === 'done') endSession();
    onClose();
  };

  const pause = (): void => {
    if (session?.sprintOwned) pauseFocusTimer();
    apply({ type: 'pause', now: Date.now() });
    onClose();
  };

  const start = (): void => {
    if (!session) return;
    const minutes = session.state.sprintMinutes;
    apply({ type: 'start', now: Date.now() });
    if (minutes > 0 && session && session.state.stage !== 'done') {
      // The sprint IS the focus timer, so the top-bar chip shows it from any tool.
      if (getFocusTimer().mode !== 'countdown') setFocusTimerMode('countdown');
      if (getFocusTimer().running) pauseFocusTimer();
      setFocusTimerMinutes(minutes);
      resetFocusTimer();
      startFocusTimer();
      session.sprintOwned = true;
      watchSprint();
    }
  };

  const grade = (rating: LocalSrsRating): void => {
    if (!session || !state.revealed) return;
    const id = currentFlowCard(state);
    if (!id) return;
    // The deck's one scheduling seam: same scheduler, review log, knowledge
    // update and undo stack as a review in the Cards tab.
    const cards = reviewDeckCard(id, rating);
    const reviewed = cards.find((candidate) => candidate.id === id);
    if (reviewed) session.cards.set(id, reviewed);
    setNote('');
    apply({ type: 'grade', rating, now: Date.now() });
  };

  const undo = (): void => {
    const snapshot = state.undo[state.undo.length - 1];
    if (!session || !snapshot) return;
    // Only this run's own last grade: never reach into a review made elsewhere.
    if (peekReviewUndo()?.cardId !== snapshot.cardId) {
      setNote(t('blanc.mech.flow.undoUnavailable'));
      return;
    }
    const undone = undoLastReview();
    const restored = undone?.cards.find((candidate) => candidate.id === snapshot.cardId);
    if (restored) session.cards.set(restored.id, restored);
    setNote(t('blanc.mech.flow.undone'));
    apply({ type: 'undo' });
  };

  const openRead = (): void => {
    apply({ type: 'openRead', now: Date.now() });
  };

  const openBookAndClose = (): void => {
    const item = session?.readItem ?? null;
    endSession();
    onClose();
    if (item) onOpenBook(item);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.altKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
    const key = event.key;
    const lower = key.length === 1 ? key.toLowerCase() : key;
    // A focused button keeps its own Space/Enter.
    const onButton = event.target instanceof HTMLElement && event.target !== event.currentTarget
      && event.target.matches('button, a[href], select, [role="option"]');
    const handled = (): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (key === 'Escape') {
      handled();
      if (running) pause();
      else close();
      return;
    }
    if (event.ctrlKey) {
      if (lower === 'z' && running) {
        handled();
        undo();
      }
      return;
    }
    if (state.stage === 'setup') {
      if ((key === 'Enter' || key === ' ') && !onButton) {
        handled();
        start();
      } else if (/^[0-3]$/.test(key)) {
        handled();
        apply({ type: 'setSprint', minutes: FLOW_SPRINT_OPTIONS[Number(key)] ?? 0 });
      }
      return;
    }
    if (state.stage === 'done') {
      if (lower === 'c') {
        handled();
        void copyReport(report).then((ok) => setNote(t(ok ? 'blanc.mech.flow.copied' : 'blanc.mech.flow.copyFailed')));
      } else if (key === 'Enter' && !onButton) {
        handled();
        if (session?.readItem && state.plan.read) openBookAndClose();
        else close();
      }
      return;
    }
    if (state.paused) return;
    if (lower === 'q') {
      handled();
      apply({ type: 'stop', now: Date.now() });
      return;
    }
    if (lower === 's') {
      handled();
      apply({ type: 'skipStage', now: Date.now() });
      return;
    }
    if (lower === 'z') {
      handled();
      undo();
      return;
    }
    if (state.stage === 'reviews' || state.stage === 'new') {
      if ((key === ' ' || key === 'Enter') && !onButton) {
        handled();
        if (state.revealed) grade('good');
        else apply({ type: 'reveal' });
      } else if (/^[1-4]$/.test(key)) {
        handled();
        if (state.revealed) grade(RATINGS[Number(key) - 1]);
        else setNote(t('blanc.mech.flow.revealFirst'));
      }
      return;
    }
    if (state.stage === 'inbox' && key === 'Enter' && !onButton) {
      handled();
      apply({ type: 'next', now: Date.now() });
      return;
    }
    if (state.stage === 'read' && key === 'Enter' && !onButton) {
      handled();
      openRead();
    }
  };

  const totals = flowTotals(state);
  // Same reading `limitNewCards` makes: anything but a finite number is no cap.
  const rawNewPerDay: unknown = getActiveProfile().deckParams?.newPerDay;
  const newPerDay = typeof rawNewPerDay === 'number' && Number.isFinite(rawNewPerDay) ? rawNewPerDay : null;
  const sprintSeconds = session?.sprintOwned ? focusTimerSeconds(getFocusTimer()) : null;
  const clock = sprintSeconds !== null
    ? t('blanc.mech.flow.clockLeft', { time: formatFlowDuration(sprintSeconds * 1000) })
    : t('blanc.mech.flow.clockElapsed', { time: formatFlowDuration(flowElapsedMs(state, now)) });
  const stageTotal = state.stage === 'reviews' ? state.plan.reviews.length : state.stage === 'new' ? state.plan.news.length : 0;
  const stageDone = state.stage === 'reviews' ? totals.reviewCards : state.stage === 'new' ? totals.newCards : 0;
  const stageLabel = (id: string): string => t(`blanc.mech.flow.stage.${id}`);
  const stageCount = (id: (typeof FLOW_WORK_STAGES)[number]): number =>
    id === 'reviews' ? state.plan.reviews.length : id === 'new' ? state.plan.news.length : id === 'inbox' ? state.plan.inbox : state.plan.read ? 1 : 0;
  const live = state.stage === 'reviews' || state.stage === 'new'
    ? t('blanc.mech.flow.live.card', { stage: stageLabel(state.stage), done: Math.min(stageDone + 1, stageTotal), count: stageTotal })
    : state.stage === 'done'
      ? t(`blanc.mech.flow.end.${state.endReason ?? 'complete'}`)
      : state.stage === 'setup'
        ? ''
        : stageLabel(state.stage);

  const front = card ? plainText(card.word || card.front) : '';
  const back = card ? plainText(card.meaning || card.back) : '';
  const sentence = card ? plainText(card.sentence) : '';
  const cardLang = card ? studyLangOfText(`${card.word} ${card.sentence ?? ''}`, getStudyLang()) : undefined;

  return (
    <div className="blanc-mech-backdrop">
      <section
        ref={dialogRef}
        className="blanc-mech-dialog blanc-flow"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blanc-flow-title"
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <header className="blanc-mech-dialog-head">
          <h2 id="blanc-flow-title">{t('blanc.mech.flow.title')}</h2>
          {state.stage !== 'setup' && state.stage !== 'done' && (
            <span className="blanc-flow-clock" aria-hidden="true">{clock}</span>
          )}
          {running ? (
            <button type="button" className="blanc-small-btn" onClick={pause}>{t('blanc.mech.flow.pause')}</button>
          ) : (
            <button type="button" className="blanc-small-btn" onClick={close}>{t('blanc.mech.close')}</button>
          )}
        </header>

        <ol className="blanc-flow-stages" aria-label={t('blanc.mech.flow.stagesLabel')}>
          {FLOW_WORK_STAGES.map((id) => {
            const count = stageCount(id);
            return (
              <li
                key={id}
                className={`${state.stage === id ? 'is-current' : ''}${count === 0 ? ' is-empty' : ''}`}
                aria-current={state.stage === id ? 'step' : undefined}
              >
                <span>{stageLabel(id)}</span>
                <span className="blanc-flow-stage-count">{id === 'read' ? (count ? '1' : '0') : count}</span>
              </li>
            );
          })}
        </ol>

        <p className="sr-only" aria-live="polite" aria-atomic="true">{live}</p>

        {state.stage === 'setup' && (
          <div className="blanc-flow-body">
            <p className="blanc-flow-lead">
              {t('blanc.mech.flow.plan', {
                reviews: state.plan.reviews.length,
                news: state.plan.news.length,
                inbox: state.plan.inbox,
              })}
            </p>
            {state.plan.read && (
              <p className="blanc-note">{t('blanc.mech.flow.planRead', { title: state.plan.read.title })}</p>
            )}
            <p className="blanc-note">
              {newPerDay === null
                ? t('blanc.mech.flow.newUncapped')
                : t('blanc.mech.flow.newLimit', { count: newPerDay })}
            </p>
            <div className="blanc-segmented" role="group" aria-label={t('blanc.mech.flow.sprint')}>
              {FLOW_SPRINT_OPTIONS.map((minutes, index) => (
                <button
                  key={minutes}
                  type="button"
                  className={state.sprintMinutes === minutes ? 'active' : ''}
                  aria-pressed={state.sprintMinutes === minutes}
                  onClick={() => apply({ type: 'setSprint', minutes })}
                >
                  {minutes === 0 ? t('blanc.mech.flow.sprintNone') : t('blanc.mech.flow.sprintMinutes', { count: minutes })}
                  <kbd>{index}</kbd>
                </button>
              ))}
            </div>
            <div className="blanc-row-actions">
              <button type="button" className="blanc-primary-action" onClick={start}>
                {t('blanc.mech.flow.start')}
              </button>
            </div>
            <p className="blanc-mech-keys">{t('blanc.mech.flow.keys.setup')}</p>
          </div>
        )}

        {(state.stage === 'reviews' || state.stage === 'new') && (
          <div className="blanc-flow-body">
            <div className="blanc-flow-progress">
              <span>{t('blanc.mech.flow.progress', { done: Math.min(stageDone + 1, stageTotal), count: stageTotal })}</span>
              <progress value={stageDone} max={Math.max(1, stageTotal)} aria-hidden="true" />
            </div>
            {card ? (
              <article className={`blanc-flow-card${state.revealed ? ' is-revealed' : ''}`} lang={cardLang}>
                <p className="blanc-flow-front">{front || t('blanc.mech.flow.blankCard')}</p>
                {state.revealed ? (
                  <div className="blanc-flow-back">
                    {card.reading && card.reading !== front && <p className="blanc-flow-reading">{plainText(card.reading)}</p>}
                    {back && <p className="blanc-flow-meaning">{back}</p>}
                    {sentence && sentence !== front && <p className="blanc-flow-sentence">{sentence}</p>}
                  </div>
                ) : (
                  <p className="blanc-note">{t('blanc.mech.flow.revealHint')}</p>
                )}
              </article>
            ) : (
              <p className="blanc-note">{t('blanc.mech.flow.missingCard')}</p>
            )}
            {state.revealed ? (
              <div className="blanc-flow-grades" role="group" aria-label={t('blanc.mech.flow.gradeLabel')}>
                {RATINGS.map((rating, index) => (
                  <button key={rating} type="button" className={`is-${rating}`} onClick={() => grade(rating)}>
                    <kbd>{index + 1}</kbd>
                    <span>{t(`blanc.mech.flow.rating.${rating}`)}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="blanc-row-actions">
                <button type="button" className="blanc-primary-action" onClick={() => apply({ type: 'reveal' })}>
                  {t('blanc.mech.flow.reveal')}
                </button>
              </div>
            )}
            {state.timeUp && <p className="blanc-note">{t('blanc.mech.flow.lastCard')}</p>}
            <p className="blanc-mech-keys">{t('blanc.mech.flow.keys.cards')}</p>
          </div>
        )}

        {state.stage === 'inbox' && (
          <div className="blanc-flow-body">
            <p className="blanc-flow-lead">{t('blanc.mech.flow.inboxLead')}</p>
            <CaptureTriageList
              onTriaged={(result) => apply({ type: 'inboxResult', ...result })}
              extraHint={t('blanc.mech.flow.keys.continue')}
            />
            <div className="blanc-row-actions">
              <button type="button" className="blanc-primary-action" onClick={() => apply({ type: 'next', now: Date.now() })}>
                {t('blanc.mech.flow.continue')}
              </button>
            </div>
          </div>
        )}

        {state.stage === 'read' && state.plan.read && (
          <div className="blanc-flow-body">
            <p className="blanc-flow-lead">{t('blanc.mech.flow.readLead')}</p>
            <p className="blanc-flow-front">{state.plan.read.title}</p>
            <div className="blanc-row-actions">
              <button type="button" className="blanc-primary-action" onClick={openRead}>
                {t('blanc.mech.flow.readFinish')}
              </button>
            </div>
            <p className="blanc-mech-keys">{t('blanc.mech.flow.keys.read')}</p>
          </div>
        )}

        {state.stage === 'done' && (
          <div className="blanc-flow-body">
            <p className="blanc-flow-lead">{t(`blanc.mech.flow.end.${state.endReason ?? 'complete'}`)}</p>
            <pre className="blanc-flow-report" aria-label={t('blanc.mech.flow.reportLabel')}>{report}</pre>
            <div className="blanc-row-actions">
              {session?.readItem && state.plan.read && (
                <button type="button" className="blanc-primary-action" onClick={openBookAndClose}>
                  {t('blanc.mech.flow.openBook', { title: state.plan.read.title })}
                </button>
              )}
              <button
                type="button"
                onClick={() => void copyReport(report).then((ok) => setNote(t(ok ? 'blanc.mech.flow.copied' : 'blanc.mech.flow.copyFailed')))}
              >
                {t('blanc.mech.flow.copy')}
              </button>
              <button type="button" onClick={close}>{t('blanc.mech.close')}</button>
            </div>
            <p className="blanc-mech-keys">{t('blanc.mech.flow.keys.done')}</p>
          </div>
        )}

        <p className="blanc-note" role="status">{note}</p>
      </section>
    </div>
  );
}

/** Test seam: drop any run in progress. */
export function resetFlowSessionForTests(): void {
  offTimer?.();
  offTimer = null;
  session = null;
  sessionListeners.clear();
}

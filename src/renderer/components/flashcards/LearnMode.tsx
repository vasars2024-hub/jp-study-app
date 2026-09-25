/**
 * The Learn practice mode, playable from any local deck.
 *
 * A card is met as a multiple choice, promoted to typed recall once it is
 * recognised, and mastered only after it has been produced from nothing. The
 * session ends when every card in the sitting is mastered — there is no score
 * to lose, which is why nothing here counts misses against the user.
 *
 * The typed stage grades through Write's grader, so "correct" means the same
 * thing in both modes. Its `close` verdict keeps its meaning too: the card is
 * neither promoted nor demoted, and the user may say they were right.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyLearnAnswer,
  isLearnComplete,
  learnProgress,
  nextLearnStep,
  startLearnSession,
  type LearnSession,
  type LearnStep,
} from '../../../shared/flashcardLearn';
import { gradeWrittenAnswer, type WriteGrade } from '../../../shared/flashcardWrite';
import { loadPracticeDeck, type DeckFolderFilter } from '../../flashcardDeck';
import { appendReviewLog } from '../../reviewLog';
import { useT } from '../../i18n';
import './autoAudio.css';
import { studyContentLang } from '../../studyEnvironment';

export default function LearnMode({ onExit, deck = 'all' }: {
  onExit?: () => void;
  /** Which local deck this sitting draws from. `all` is the whole collection. */
  deck?: DeckFolderFilter;
}) {
  const { t } = useT();
  const [pool, setPool] = useState<ReturnType<typeof loadDeck>>([]);
  const [session, setSession] = useState<LearnSession | null>(null);
  const [step, setStep] = useState<LearnStep | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [grade, setGrade] = useState<WriteGrade | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const begin = useCallback((): void => {
    const cards = loadPracticeDeck(deck);
    const fresh = startLearnSession(cards);
    setPool(cards);
    setSession(fresh);
    setStep(fresh.refusal ? null : nextLearnStep(fresh, cards));
    setPicked(null);
    setTyped('');
    setGrade(null);
  }, [deck]);

  useEffect(() => { begin(); }, [begin]);

  useEffect(() => {
    if (step?.kind === 'recall' && !grade) inputRef.current?.focus();
  }, [step, grade]);

  const progress = useMemo(
    () => (session ? learnProgress(session) : { mastered: 0, total: 0 }),
    [session],
  );

  /** Record the answer, then ask the next question off the NEW session state. */
  function record(correct: boolean): void {
    if (!session || !step) return;
    // Practice answers count toward the day (streak, Statistics) through the
    // same review log as graded reviews; they never touch a card's schedule.
    appendReviewLog({ mode: 'learn', cardId: step.cardId, correct });
    const next = applyLearnAnswer(session, step.cardId, correct);
    setSession(next);
    setStep(isLearnComplete(next) ? null : nextLearnStep(next, pool));
    setPicked(null);
    setTyped('');
    setGrade(null);
  }

  function submitTyped(): void {
    if (step?.kind !== 'recall') return;
    // `empty` and `close` are shown but move nothing: the card is neither
    // promoted nor demoted until the user answers or gives up on it.
    setGrade(gradeWrittenAnswer(typed, step.question));
  }

  if (!session) return null;

  if (session.refusal) {
    return (
      <fieldset className="auto-reading-options">
        <legend>{t('flash.learn.title')}</legend>
        <p className="auto-reading-options__report">{t('flash.learn.noUsableCards')}</p>
        {onExit && <button type="button" onClick={onExit}>{t('flash.learn.exit')}</button>}
      </fieldset>
    );
  }

  const header = (
    <>
      <legend>{t('flash.learn.title')}</legend>
      <p className="muted">{t('flash.learn.lead')}</p>
      <p className="flash-write-progress" aria-live="polite">
        {t('flash.learn.progress', { mastered: progress.mastered, total: progress.total })}
        {!session.choiceAvailable && ` ${t('flash.learn.typingOnly')}`}
        {session.skipped > 0 && ` ${t('flash.learn.skipped', { count: session.skipped })}`}
      </p>
    </>
  );

  if (!step) {
    return (
      <fieldset className="auto-reading-options">
        {header}
        <p className="auto-reading-options__report">
          {t('flash.learn.done', { total: progress.total })}
        </p>
        <div className="flash-match-actions">
          <button type="button" onClick={begin}>{t('flash.learn.again')}</button>
          {onExit && <button type="button" onClick={onExit}>{t('flash.learn.exit')}</button>}
        </div>
      </fieldset>
    );
  }

  if (step.kind === 'choice') {
    const chosen = step.options.find((option) => option.id === picked) ?? null;
    return (
      <fieldset className="auto-reading-options">
        {header}
        <p className="flash-write-progress">{t('flash.learn.askChoice')}</p>
        <p className="flash-write-prompt">{step.prompt}</p>
        <div className="flash-match-board">
          {step.options.map((option) => (
            <button
              key={option.id}
              type="button"
              // Once a pick is made the right answer is marked whether or not
              // it was chosen — being told only "wrong" teaches nothing.
              className={`flash-match-tile${chosen && option.correct ? ' is-matched' : ''}${
                chosen && option.id === chosen.id && !option.correct ? ' is-wrong' : ''
              }`}
              disabled={Boolean(chosen)}
              onClick={() => setPicked(option.id)}
            >
              {option.text}
            </button>
          ))}
        </div>
        <p className="auto-reading-options__report" aria-live="polite">
          {chosen && (chosen.correct
            ? t('flash.learn.choiceRight')
            : t('flash.learn.choiceWrong', { answer: step.answer }))}
        </p>
        <div className="flash-match-actions">
          {chosen && (
            <button type="button" onClick={() => record(chosen.correct)} autoFocus>
              {t('flash.learn.next')}
            </button>
          )}
          {onExit && <button type="button" onClick={onExit}>{t('flash.learn.exit')}</button>}
        </div>
      </fieldset>
    );
  }

  const question = step.question;
  return (
    <fieldset className="auto-reading-options">
      {header}
      <p className="flash-write-progress">{t('flash.learn.askRecall')}</p>
      <p className="flash-write-prompt">{question.prompt}</p>
      <p className="muted">{t('flash.write.length', { count: question.answerLength })}</p>

      <form
        className="flash-write-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!grade || grade.verdict === 'empty' || grade.verdict === 'close') submitTyped();
        }}
      >
        <label className="flash-write-label" htmlFor="flash-learn-answer">
          {t('flash.write.answerLabel')}
        </label>
        <input
          id="flash-learn-answer"
          ref={inputRef}
          type="text"
          value={typed}
          lang={studyContentLang()}
          autoComplete="off"
          spellCheck={false}
          disabled={grade?.verdict === 'correct' || grade?.verdict === 'wrong'}
          onChange={(event) => setTyped(event.target.value)}
        />
        {(!grade || grade.verdict === 'empty' || grade.verdict === 'close') && (
          <button type="submit">{t('flash.write.check')}</button>
        )}
      </form>

      <p className="auto-reading-options__report" aria-live="polite">
        {grade?.verdict === 'empty' && t('flash.write.empty')}
        {grade?.verdict === 'correct' && (grade.viaReading
          ? t('flash.write.correctViaReading', { answer: question.answer })
          : t('flash.write.correct'))}
        {grade?.verdict === 'close' && t('flash.write.close')}
        {grade?.verdict === 'wrong' && t('flash.learn.recallWrong', { answer: question.answer })}
      </p>

      <div className="flash-match-actions">
        {grade?.verdict === 'close' && (
          <button type="button" onClick={() => record(true)}>{t('flash.write.override')}</button>
        )}
        {(grade?.verdict === 'correct' || grade?.verdict === 'wrong') && (
          <button type="button" onClick={() => record(grade.verdict === 'correct')} autoFocus>
            {t('flash.learn.next')}
          </button>
        )}
        {(!grade || grade.verdict === 'empty' || grade.verdict === 'close') && (
          <button type="button" onClick={() => record(false)}>{t('flash.learn.skip')}</button>
        )}
        {onExit && <button type="button" onClick={onExit}>{t('flash.learn.exit')}</button>}
      </div>
    </fieldset>
  );
}

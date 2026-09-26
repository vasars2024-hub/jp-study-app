/**
 * The Write practice mode, playable from any local deck.
 *
 * One question at a time, typed. The grader's `close` verdict is the reason
 * this surface is not a plain right/wrong loop: a near miss re-opens the same
 * question instead of scoring it, and the user may say "I was right" — which
 * counts, separately, as an override rather than quietly as a correct answer.
 * Exit is always on screen, as in Match.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildWriteRound,
  gradeWrittenAnswer,
  writeScore,
  type WriteGrade,
  type WriteRound,
} from '../../../shared/flashcardWrite';
import { loadPracticeDeck, type DeckFolderFilter } from '../../flashcardDeck';
import { appendReviewLog } from '../../reviewLog';
import { useT } from '../../i18n';
import './autoAudio.css';

export default function WriteMode({ onExit, deck = 'all' }: {
  onExit?: () => void;
  /** Which local deck this round draws from. `all` is the whole collection. */
  deck?: DeckFolderFilter;
}) {
  const { t } = useT();
  const [round, setRound] = useState<WriteRound | null>(null);
  const [index, setIndex] = useState(0);
  const [typed, setTyped] = useState('');
  const [grade, setGrade] = useState<WriteGrade | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [overridden, setOverridden] = useState(0);
  const [wrong, setWrong] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const deal = useCallback((): void => {
    setRound(buildWriteRound(loadPracticeDeck(deck)));
    setIndex(0);
    setTyped('');
    setGrade(null);
    setRevealed(false);
    setCorrect(0);
    setOverridden(0);
    setWrong(0);
  }, [deck]);

  useEffect(() => { deal(); }, [deal]);

  const question = round && !round.refusal ? round.questions[index] : undefined;

  // Focus follows the question, so the next answer can be typed without reaching
  // for the pointer. Only when a question is actually on screen.
  useEffect(() => {
    if (question && !grade) inputRef.current?.focus();
  }, [question, grade]);

  function advance(): void {
    setTyped('');
    setGrade(null);
    setRevealed(false);
    setIndex((i) => i + 1);
  }

  function submit(): void {
    if (!question) return;
    const result = gradeWrittenAnswer(typed, question);
    if (result.verdict === 'empty') {
      setGrade(result);
      return;
    }
    setGrade(result);
    if (result.verdict === 'correct') setCorrect((n) => n + 1);
    else if (result.verdict === 'wrong') setWrong((n) => n + 1);
    if (result.verdict === 'correct' || result.verdict === 'wrong') {
      appendReviewLog({ mode: 'write', cardId: question.cardId, correct: result.verdict === 'correct' });
    }
    // `close` is scored by neither branch: it is answered again, or overridden.
  }

  function override(): void {
    // The user says a `close` answer was right: it counts as correct practice.
    if (question) appendReviewLog({ mode: 'write', cardId: question.cardId, correct: true });
    setOverridden((n) => n + 1);
    advance();
  }

  function retry(): void {
    setGrade(null);
    setTyped('');
  }

  if (!round) return null;

  if (round.refusal) {
    return (
      <fieldset className="auto-reading-options">
        <legend>{t('flash.write.title')}</legend>
        <p className="auto-reading-options__report">{t('flash.write.noUsableCards')}</p>
        {onExit && <button className="btn" type="button" onClick={onExit}>{t('flash.write.exit')}</button>}
      </fieldset>
    );
  }

  const score = writeScore(round.questions.length, correct, overridden, wrong);

  if (!question) {
    return (
      <fieldset className="auto-reading-options">
        <legend>{t('flash.write.title')}</legend>
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.write.summary', {
            correct: score.correct,
            total: score.total,
            wrong: score.wrong,
          })}
          {score.overridden > 0 && ` ${t('flash.write.summaryOverrides', { count: score.overridden })}`}
        </p>
        <div className="flash-match-actions">
          <button className="btn primary" type="button" onClick={deal}>{t('flash.write.again')}</button>
          {onExit && <button className="btn" type="button" onClick={onExit}>{t('flash.write.exit')}</button>}
        </div>
      </fieldset>
    );
  }

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.write.title')}</legend>
      <p className="muted">{t('flash.write.lead')}</p>

      <p className="flash-write-progress">
        {t('flash.write.position', { position: index + 1, total: round.questions.length })}
        {' · '}
        {question.direction === 'meaning-to-jp'
          ? t('flash.write.askJapanese')
          : t('flash.write.askMeaning')}
      </p>

      <p className="flash-write-prompt">{question.prompt}</p>
      {question.hint && (
        <p className="muted">{t('flash.write.hint', { hint: question.hint })}</p>
      )}
      {question.direction === 'meaning-to-jp' && (
        <p className="muted">{t('flash.write.length', { count: question.answerLength })}</p>
      )}

      <form
        className="flash-write-form"
        onSubmit={(event) => { event.preventDefault(); if (!grade || grade.verdict === 'empty') submit(); }}
      >
        <label className="flash-write-label" htmlFor="flash-write-answer">
          {t('flash.write.answerLabel')}
        </label>
        <input
          id="flash-write-answer"
          ref={inputRef}
          type="text"
          value={typed}
          lang={question.direction === 'meaning-to-jp' ? 'ja' : 'en'}
          autoComplete="off"
          spellCheck={false}
          disabled={Boolean(grade) && grade.verdict !== 'empty'}
          onChange={(event) => setTyped(event.target.value)}
        />
        {(!grade || grade.verdict === 'empty') && (
          <button className="btn primary" type="submit">{t('flash.write.check')}</button>
        )}
      </form>

      <p className="auto-reading-options__report" aria-live="polite">
        {!grade && t('flash.write.progress', { correct: score.correct, answered: score.answered })}
        {grade?.verdict === 'empty' && t('flash.write.empty')}
        {grade?.verdict === 'correct' && (grade.viaReading
          ? t('flash.write.correctViaReading', { answer: question.answer })
          : t('flash.write.correct'))}
        {grade?.verdict === 'close' && t('flash.write.close')}
        {grade?.verdict === 'wrong' && t('flash.write.wrong', { answer: question.answer })}
      </p>

      {grade?.verdict === 'close' && (
        <div className="flash-match-actions">
          <button className="btn" type="button" onClick={retry}>{t('flash.write.retype')}</button>
          <button className="btn" type="button" onClick={() => setRevealed(true)}>{t('flash.write.reveal')}</button>
          <button className="btn" type="button" onClick={override}>{t('flash.write.override')}</button>
        </div>
      )}
      {grade?.verdict === 'close' && revealed && (
        <p className="auto-reading-options__report">
          {t('flash.write.wrong', { answer: question.answer })}
        </p>
      )}

      {(grade?.verdict === 'correct' || grade?.verdict === 'wrong') && (
        <div className="flash-match-actions">
          <button className="btn primary" type="button" onClick={advance} autoFocus>{t('flash.write.next')}</button>
          {onExit && <button className="btn" type="button" onClick={onExit}>{t('flash.write.exit')}</button>}
        </div>
      )}

      {(!grade || grade.verdict === 'empty' || grade.verdict === 'close') && (
        <div className="flash-match-actions">
          <button className="btn" type="button" onClick={advance}>{t('flash.write.skip')}</button>
          {onExit && <button className="btn" type="button" onClick={onExit}>{t('flash.write.exit')}</button>}
        </div>
      )}
    </fieldset>
  );
}

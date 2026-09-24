/**
 * The Test practice mode, playable from any local deck.
 *
 * The last of the four modes, and the only one that withholds the verdict: a
 * whole paper is answered first and graded once. Nothing on screen tells the
 * user whether an answer was right until they hand in, because a mode that
 * corrects mid-question measures how well it corrects, not what they knew.
 *
 * Two things the surface owes the user, both of which a scoring mode gets wrong
 * by default:
 *
 * - Handing in with blanks is allowed, but it is DISCLOSED first. The button
 *   says how many are unanswered and asks a second time; it never silently
 *   submits a half-finished paper, and it never refuses to submit one either.
 * - The results sheet lists every question, including the ones left blank, with
 *   the right answer on each line. A test the user cannot learn from is a grade.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTestPaper,
  gradeTestPaper,
  type TestPaper,
  type TestQuestion,
  type TestResult,
} from '../../../shared/flashcardTest';
import { loadPracticeDeck, type DeckFolderFilter } from '../../flashcardDeck';
import { appendReviewLog } from '../../reviewLog';
import { useT } from '../../i18n';
import './autoAudio.css';

const KIND_KEY: Record<TestQuestion['kind'], string> = {
  written: 'flash.test.kindWritten',
  choice: 'flash.test.kindChoice',
  trueFalse: 'flash.test.kindTrueFalse',
};

const OUTCOME_KEY = {
  correct: 'flash.test.outcomeCorrect',
  close: 'flash.test.outcomeClose',
  wrong: 'flash.test.outcomeWrong',
  unanswered: 'flash.test.outcomeUnanswered',
} as const;

export default function TestMode({ onExit, deck = 'all' }: {
  onExit?: () => void;
  /** Which local deck this paper draws from. `all` is the whole collection. */
  deck?: DeckFolderFilter;
}) {
  const { t } = useT();
  const [paper, setPaper] = useState<TestPaper | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<TestResult | null>(null);
  /** Set by the first hand-in attempt with blanks; cleared by any new paper. */
  const [confirming, setConfirming] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const begin = useCallback((): void => {
    setPaper(buildTestPaper(loadPracticeDeck(deck)));
    setResponses({});
    setAt(0);
    setResult(null);
    setConfirming(false);
  }, [deck]);

  useEffect(() => { begin(); }, [begin]);

  const question = paper && !result ? paper.questions[at] ?? null : null;

  useEffect(() => {
    if (question?.kind === 'written') inputRef.current?.focus();
  }, [question]);

  const answered = useMemo(
    () => (paper ? paper.questions.filter((q) => (responses[q.id] ?? '').trim()).length : 0),
    [paper, responses],
  );

  function respond(id: string, value: string): void {
    setResponses((current) => ({ ...current, [id]: value }));
    // Changing an answer withdraws the "you have blanks" warning, which was
    // measured against the paper as it stood.
    setConfirming(false);
  }

  function handIn(): void {
    if (!paper) return;
    const blanks = paper.questions.length - answered;
    if (blanks > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    const graded = gradeTestPaper(paper, responses);
    // One review-log row per answered question: a test sitting is study too.
    for (const line of graded.lines) {
      if (line.outcome === 'unanswered') continue;
      appendReviewLog({ mode: 'test', cardId: line.cardId, correct: line.outcome === 'correct' });
    }
    setResult(graded);
  }

  if (!paper) return null;

  if (paper.refusal) {
    return (
      <fieldset className="auto-reading-options">
        <legend>{t('flash.test.title')}</legend>
        <p className="auto-reading-options__report">{t('flash.test.noUsableCards')}</p>
        {onExit && <button type="button" onClick={onExit}>{t('flash.test.exit')}</button>}
      </fieldset>
    );
  }

  if (result) {
    const percent = Math.round(result.score * 100);
    return (
      <fieldset className="auto-reading-options">
        <legend>{t('flash.test.title')}</legend>
        <p className="flash-write-progress" aria-live="polite">
          {t('flash.test.score', { correct: result.correct, total: result.total, percent })}
        </p>
        <p className="muted">
          {result.close > 0 && `${t('flash.test.closeNote', { count: result.close })} `}
          {result.wrong > 0 && `${t('flash.test.wrongNote', { count: result.wrong })} `}
          {result.unanswered > 0 && t('flash.test.blankNote', { count: result.unanswered })}
        </p>
        <ul className="flash-test-sheet">
          {result.lines.map((line, index) => (
            <li key={line.questionId} className={`flash-test-line is-${line.outcome}`}>
              <span className="flash-test-line__no">
                {t('flash.test.position', { position: index + 1, total: result.total })}
              </span>
              <span className="flash-test-line__outcome">{t(OUTCOME_KEY[line.outcome])}</span>
              <span className="flash-test-line__given">
                {line.given
                  ? t('flash.test.gave', { given: line.given })
                  : t('flash.test.gaveNothing')}
              </span>
              <span className="flash-test-line__answer">
                {t('flash.test.answerWas', { answer: line.answer })}
              </span>
            </li>
          ))}
        </ul>
        <div className="flash-match-actions">
          <button type="button" onClick={begin}>{t('flash.test.again')}</button>
          {onExit && <button type="button" onClick={onExit}>{t('flash.test.exit')}</button>}
        </div>
      </fieldset>
    );
  }

  if (!question) return null;

  const given = responses[question.id] ?? '';
  const blanks = paper.questions.length - answered;

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.test.title')}</legend>
      <p className="muted">{t('flash.test.lead')}</p>
      <p className="flash-write-progress" aria-live="polite">
        {t('flash.test.position', { position: at + 1, total: paper.questions.length })}
        {` ${t('flash.test.answered', { answered, total: paper.questions.length })}`}
        {paper.skipped > 0 && ` ${t('flash.test.skipped', { count: paper.skipped })}`}
      </p>
      <p className="muted">
        {t('flash.test.kinds', { kinds: paper.kinds.map((kind) => t(KIND_KEY[kind])).join(', ') })}
      </p>

      {question.kind === 'written' && (
        <>
          <p className="flash-write-progress">{t('flash.test.askWritten')}</p>
          <p className="flash-write-prompt">{question.question.prompt}</p>
          <form className="flash-write-form" onSubmit={(event) => event.preventDefault()}>
            <label className="flash-write-label" htmlFor="flash-test-answer">
              {t('flash.write.answerLabel')}
            </label>
            <input
              id="flash-test-answer"
              ref={inputRef}
              type="text"
              value={given}
              lang="ja"
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => respond(question.id, event.target.value)}
            />
          </form>
        </>
      )}

      {question.kind === 'choice' && (
        <>
          <p className="flash-write-progress">{t('flash.test.askChoice')}</p>
          <p className="flash-write-prompt">{question.prompt}</p>
          <div className="flash-match-board">
            {question.options.map((option) => (
              <button
                key={option.id}
                type="button"
                // Picked, never marked: the paper is graded once, at the end.
                className={`flash-match-tile${given === option.id ? ' is-picked' : ''}`}
                aria-pressed={given === option.id}
                onClick={() => respond(question.id, option.id)}
              >
                {option.text}
              </button>
            ))}
          </div>
        </>
      )}

      {question.kind === 'trueFalse' && (
        <>
          <p className="flash-write-progress">{t('flash.test.askTrueFalse')}</p>
          <p className="flash-write-prompt">{question.prompt}</p>
          <p className="muted">{t('flash.test.claim', { claim: question.claim })}</p>
          <div className="flash-match-board">
            {(['true', 'false'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={`flash-match-tile${given === value ? ' is-picked' : ''}`}
                aria-pressed={given === value}
                onClick={() => respond(question.id, value)}
              >
                {t(value === 'true' ? 'flash.test.true' : 'flash.test.false')}
              </button>
            ))}
          </div>
        </>
      )}

      {confirming && (
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.test.blanksWarning', { count: blanks })}
        </p>
      )}

      <div className="flash-match-actions">
        <button type="button" disabled={at === 0} onClick={() => setAt((i) => i - 1)}>
          {t('flash.test.back')}
        </button>
        <button
          type="button"
          disabled={at >= paper.questions.length - 1}
          onClick={() => setAt((i) => i + 1)}
        >
          {t('flash.test.next')}
        </button>
        <button type="button" onClick={handIn}>
          {confirming ? t('flash.test.handInAnyway') : t('flash.test.handIn')}
        </button>
        {onExit && <button type="button" onClick={onExit}>{t('flash.test.exit')}</button>}
      </div>
    </fieldset>
  );
}

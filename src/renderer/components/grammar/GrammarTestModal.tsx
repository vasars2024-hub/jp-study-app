/**
 * Practice session UI.
 *
 * Replaces a modal that asked one question ("how many cards?"), dealt a
 * self-graded flip card for each, and discarded every result on close.
 *
 * Two of the four question types are auto-graded (the multiple-choice ones) and
 * two are self-graded (flip, and cloze). Cloze is deliberately self-graded
 * rather than typed: requiring Japanese text entry would make the card a test
 * of the user's IME, and generating plausible wrong cores to choose from would
 * mean the same runtime pattern-matching that `clozeFor` refuses to do.
 *
 * Familiarity is persisted **per answer**, not at the end. Discarding a
 * half-finished session's results was the original defect, and closing the
 * modal early is the most likely way to hit it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { NormalizedGrammarPoint } from '../../data/grammar';
import type { PracticeFilters } from '../../data/grammar/practiceFilters';
import { createDeckFolder } from '../../flashcardDeck';
import { mineGrammarPoints } from '../../studyMiningRoutes';
import { appendReviewLog } from '../../reviewLog';
import {
  loadGrammarSrs,
  ratingForTestAnswer,
  reviewGrammarPoint,
  saveGrammarSrs,
} from '../../grammarSrs';
import { useT } from '../../i18n';
import { trapTab } from '../ui/focusTrap';
import { LANG_TAGS } from '../../../shared/i18n/core';
import {
  applyGrade,
  loadFamiliarity,
  saveFamiliarity,
  type AnswerGrade,
  type FamiliarityState,
} from '../../grammarFamiliarity';
import {
  buildSession,
  loadSessionOptions,
  saveSessionOptions,
  snapshotSessionOptions,
  MASTERED_MODES,
  QUESTION_TYPES,
  SESSION_DIRECTIONS,
  type MasteredMode,
  type QuestionType,
  type SessionDirection,
  type SessionOptions,
  type SessionPlan,
  type SessionQuestion,
} from '../../grammarSession';
import {
  appendSession,
  historyStats,
  loadSessionHistory,
  saveSessionHistory,
  type SessionRecord,
} from '../../grammarSessionHistory';

type Phase = 'setup' | 'play' | 'done';

/** Shown left-to-right, hardest first, so the safe default is not the nearest. */
const GRADES: Array<{ grade: AnswerGrade; key: string }> = [
  { grade: 'hard', key: 'grammar.test.hard' },
  { grade: 'okay', key: 'grammar.test.okay' },
  { grade: 'good', key: 'grammar.test.good' },
];

const DIRECTION_KEY: Record<SessionDirection, string> = {
  recognition: 'grammar.test.directionRecognition',
  production: 'grammar.test.directionProduction',
  mixed: 'grammar.test.directionMixed',
};

const TYPE_KEY: Record<QuestionType, string> = {
  flip: 'grammar.test.typeFlip',
  'meaning-choice': 'grammar.test.typeMeaningChoice',
  'pattern-choice': 'grammar.test.typePatternChoice',
  cloze: 'grammar.test.typeCloze',
};

const MASTERED_KEY: Record<MasteredMode, string> = {
  exclude: 'grammar.test.masteredExclude',
  include: 'grammar.test.masteredInclude',
  only: 'grammar.test.masteredOnly',
};

export default function GrammarTestModal({
  pool,
  onClose,
}: {
  pool: NormalizedGrammarPoint[];
  /**
   * Accepted for the caller's convenience but no longer read. The setup screen
   * used to append the raw study-language code to its hint ("· ja"), which put
   * an untranslated identifier in front of the user; the pool is already
   * filtered by the time it arrives here.
   */
  initialFilters: PracticeFilters;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('setup');
  const [options, setOptions] = useState<SessionOptions>(() => loadSessionOptions());
  const [custom, setCustom] = useState(() => String(loadSessionOptions().count));
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [missed, setMissed] = useState<NormalizedGrammarPoint[]>([]);
  const [correctCount, setCorrectCount] = useState(0);
  const [familiarity, setFamiliarity] = useState<FamiliarityState>(() => loadFamiliarity());
  const [history, setHistory] = useState(() => loadSessionHistory());

  const maxAvailable = pool.length;
  const question: SessionQuestion | null = plan?.questions[index] ?? null;
  const stats = useMemo(() => historyStats(history), [history]);

  const patch = useCallback((next: Partial<SessionOptions>) => {
    setOptions((prev) => {
      const merged = snapshotSessionOptions({ ...prev, ...next });
      saveSessionOptions(merged);
      return merged;
    });
  }, []);

  const toggleType = useCallback(
    (type: QuestionType) => {
      setOptions((prev) => {
        const has = prev.types.includes(type);
        const types = has ? prev.types.filter((x) => x !== type) : [...prev.types, type];
        // Never let the last type be switched off — an empty list can only
        // build an empty session, which reads as the screen being broken.
        const merged = snapshotSessionOptions({ ...prev, types: types.length ? types : prev.types });
        saveSessionOptions(merged);
        return merged;
      });
    },
    [],
  );

  const start = useCallback(() => {
    const built = buildSession(pool, familiarity, options);
    setPlan(built);
    setIndex(0);
    setRevealed(false);
    setPicked(null);
    setMissed([]);
    setCorrectCount(0);
    setPhase(built.questions.length ? 'play' : 'setup');
    if (!built.questions.length) setPlan(built);
  }, [pool, familiarity, options]);

  const finish = useCallback(
    (correct: number, missedPoints: NormalizedGrammarPoint[], delivered: number) => {
      const record: SessionRecord = {
        at: Date.now(),
        requested: plan?.requested ?? 0,
        delivered,
        correct,
        direction: options.direction,
        types: [...options.types],
        mastered: options.mastered,
        missed: missedPoints.map((p) => p.id),
      };
      const next = appendSession(history, record);
      setHistory(next);
      saveSessionHistory(next);
      setPhase('done');
    },
    [history, options.direction, options.mastered, options.types, plan?.requested],
  );

  const answer = useCallback(
    (grade: AnswerGrade) => {
      if (!question || !plan) return;
      const point = pool.find((p) => p.id === question.id) ?? null;
      const wasCorrect = grade !== 'hard';

      // Persist immediately: a session abandoned halfway must still count.
      const nextFamiliarity = applyGrade(familiarity, question.id, grade);
      setFamiliarity(nextFamiliarity);
      saveFamiliarity(nextFamiliarity);
      // One review-log row per answer, so grammar study counts toward the day
      // and Statistics can count grammar answers next to flashcard reviews.
      appendReviewLog({ mode: 'grammar', grammarId: question.id, word: point?.title, correct: wasCorrect });
      // And one schedule step, so a tested point comes back on the Review tab
      // when the flashcard scheduler says it should.
      saveGrammarSrs(reviewGrammarPoint(loadGrammarSrs(), question.id, ratingForTestAnswer(grade)));

      const nextCorrect = correctCount + (wasCorrect ? 1 : 0);
      const nextMissed =
        !wasCorrect && point && !missed.some((p) => p.id === point.id)
          ? [...missed, point]
          : missed;
      setCorrectCount(nextCorrect);
      setMissed(nextMissed);

      if (index + 1 >= plan.questions.length) {
        finish(nextCorrect, nextMissed, plan.questions.length);
        return;
      }
      setIndex((i) => i + 1);
      setRevealed(false);
      setPicked(null);
    },
    [question, plan, pool, familiarity, correctCount, missed, index, finish],
  );

  const choose = useCallback(
    (choice: string) => {
      if (picked !== null) return;
      setPicked(choice);
    },
    [picked],
  );

  function addMissedToDeck(): void {
    if (!missed.length) return;
    createDeckFolder('Grammar');
    void mineGrammarPoints(missed, 'Grammar');
  }

  const typeLabels = useMemo(
    () => QUESTION_TYPES.map((type) => ({ type, label: t(TYPE_KEY[type]) })),
    // `lang`, never `t` — t's identity is stable, so depending on it goes stale.
    [lang],
  );

  /*
   * This declares `role="dialog" aria-modal="true"` and, until 2026-09-06, did
   * nothing whatever with the keyboard. Measured live: Escape left it open, and
   * `document.activeElement` after opening was still the "Grammar Test" button
   * BEHIND the overlay — so a screen-reader user was told a modal had taken over
   * the window and then left standing outside it, with `aria-modal` hiding the
   * rest of the page they were still in.
   *
   * Closing early is safe by design here: familiarity is persisted per ANSWER,
   * not at the end (see the file header), so Escape cannot discard a
   * half-finished session. That is why Escape closes unconditionally rather than
   * confirming, unlike `MalDownloadDialog`, which refuses Escape mid-send.
   *
   * Modelled on `components/ui/Dialog.tsx`, which already does exactly this;
   * inlined rather than adopted wholesale because swapping the render tree two
   * days before release risks the layout for no accessibility gain.
   */
  // Held in a ref, as in the shared Dialog: callers pass an inline arrow, and
  // with `onClose` as a dependency every parent re-render re-ran this effect —
  // its cleanup bounced focus to the opener and the re-run pulled it back to the
  // panel, so the focused answer button was lost on every re-render.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        // Stop it here: the desktop shell also listens for Escape, and an
        // unstopped one closes the Grammar window out from under the dialog.
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      // a11y3: shared trap; it also wraps Shift+Tab from the panel itself,
      // which is where this dialog puts the initial focus.
      trapTab(e, panelRef.current);
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      // Put focus back where it came from, or the user lands at the top of the
      // document and has to Tab through the whole window to get back.
      if (restoreTo?.isConnected) restoreTo.focus?.();
    };
  }, []);

  return (
    <div
      className="gx-test-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t('grammar.test.title')}
      ref={panelRef}
      // The panel itself is the initial focus target rather than a control inside
      // it: focusing the first button would read that button's label instead of
      // the dialog's, and the setup screen's first control is a preset count.
      tabIndex={-1}
    >
      <div className="gx-test-modal">
        <header className="gx-test-head">
          <h2>{t('grammar.test.title')}</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            {t('common.close')}
          </button>
        </header>

        {phase === 'setup' && (
          <div className="gx-test-setup">
            <p className="muted">{t('grammar.test.setupHint', { count: maxAvailable })}</p>
            {!maxAvailable ? (
              <p className="muted">{t('grammar.test.noPool')}</p>
            ) : (
              <>
                <div className="gx-test-counts">
                  {[5, 10, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`btn ${options.count === n ? 'primary' : ''}`}
                      aria-pressed={options.count === n}
                      disabled={n > maxAvailable}
                      onClick={() => {
                        patch({ count: n });
                        setCustom(String(n));
                      }}
                    >
                      {n}
                    </button>
                  ))}
                  <label className="gx-test-custom">
                    {t('grammar.test.custom')}
                    <input
                      type="number"
                      min={1}
                      max={maxAvailable}
                      value={custom}
                      onChange={(e) => {
                        setCustom(e.target.value);
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0) patch({ count: Math.floor(n) });
                      }}
                    />
                  </label>
                </div>

                <label className="gx-test-field">
                  <span>{t('grammar.test.direction')}</span>
                  <select
                    value={options.direction}
                    onChange={(e) => patch({ direction: e.target.value as SessionDirection })}
                  >
                    {SESSION_DIRECTIONS.map((d) => (
                      <option key={d} value={d}>
                        {t(DIRECTION_KEY[d])}
                      </option>
                    ))}
                  </select>
                </label>

                <fieldset className="gx-test-types">
                  <legend>{t('grammar.test.types')}</legend>
                  {typeLabels.map(({ type, label }) => (
                    <label key={type} className="gx-test-type">
                      <input
                        type="checkbox"
                        checked={options.types.includes(type)}
                        onChange={() => toggleType(type)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>

                <label className="gx-test-field">
                  <span>{t('grammar.test.mastered')}</span>
                  <select
                    value={options.mastered}
                    onChange={(e) => patch({ mastered: e.target.value as MasteredMode })}
                  >
                    {MASTERED_MODES.map((m) => (
                      <option key={m} value={m}>
                        {t(MASTERED_KEY[m])}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="gx-test-field">
                  <span>{t('grammar.test.ratio', { pct: Math.round(options.newRatio * 100) })}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={10}
                    value={Math.round(options.newRatio * 100)}
                    onChange={(e) => patch({ newRatio: Number(e.target.value) / 100 })}
                  />
                </label>
                <p className="muted gx-test-hint">{t('grammar.test.ratioHint')}</p>

                {plan && !plan.questions.length ? (
                  <p className="gx-test-warn">{t('grammar.test.noQuestions')}</p>
                ) : null}

                <button type="button" className="btn primary" onClick={start}>
                  {t('grammar.test.start')}
                </button>
              </>
            )}
          </div>
        )}

        {phase === 'play' && question && plan && (
          <div className="gx-test-play">
            <p className="muted">
              {t('grammar.test.progress', { current: index + 1, total: plan.questions.length })}
              {' · '}
              {t(TYPE_KEY[question.type])}
            </p>

            <div className="gx-test-card">
              {question.type === 'cloze' ? (
                <>
                  <div className="gx-test-cloze">{question.blanked}</div>
                  <p className="muted">{t('grammar.test.clozePrompt')}</p>
                </>
              ) : (
                <div className="gx-test-pattern">{question.prompt}</div>
              )}

              {question.choices ? (
                <div className="gx-test-choices">
                  {question.choices.map((choice) => {
                    const isAnswer = choice === question.answer;
                    const state =
                      picked === null ? '' : isAnswer ? ' correct' : picked === choice ? ' wrong' : '';
                    return (
                      <button
                        key={choice}
                        type="button"
                        className={`btn gx-test-choice${state}`}
                        disabled={picked !== null}
                        onClick={() => choose(choice)}
                      >
                        {choice}
                      </button>
                    );
                  })}
                </div>
              ) : revealed ? (
                <div className="gx-test-reveal">
                  <p>{question.answer}</p>
                  {question.sentence ? <p className="gx-test-ex">{question.sentence}</p> : null}
                </div>
              ) : (
                <button type="button" className="btn" onClick={() => setRevealed(true)}>
                  {t('grammar.test.reveal')}
                </button>
              )}
            </div>

            {question.choices && picked !== null && (
              <div className="gx-test-feedback">
                <p className={picked === question.answer ? 'gx-test-ok' : 'gx-test-no'}>
                  {picked === question.answer ? t('grammar.test.correct') : t('grammar.test.wrong')}
                </p>
                {picked !== question.answer ? (
                  <p className="muted">{t('grammar.test.answerWas', { answer: question.answer })}</p>
                ) : null}
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => answer(picked === question.answer ? 'good' : 'hard')}
                >
                  {t('grammar.test.next')}
                </button>
              </div>
            )}

            {!question.choices && revealed && (
              <div className="gx-test-grades">
                {GRADES.map(({ grade, key }) => (
                  <button
                    key={grade}
                    type="button"
                    className={`btn gx-grade-${grade}${grade === 'good' ? ' primary' : ''}`}
                    onClick={() => answer(grade)}
                  >
                    {t(key)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {phase === 'done' && plan && (
          <div className="gx-test-done">
            <p>
              {t('grammar.test.score', {
                good: correctCount,
                total: plan.questions.length,
                missed: missed.length,
              })}
            </p>
            {plan.delivered < plan.requested ? (
              <p className="muted">
                {t('grammar.test.cards', {
                  delivered: plan.delivered,
                  requested: plan.requested,
                })}
              </p>
            ) : null}
            {plan.unusableTypes.length ? (
              <p className="muted">
                {t('grammar.test.unusable', {
                  types: plan.unusableTypes.map((x) => t(TYPE_KEY[x])).join(', '),
                })}
              </p>
            ) : null}

            <section className="gx-test-history">
              <h3>{t('grammar.test.history')}</h3>
              {!history.length ? (
                <p className="muted">{t('grammar.test.historyEmpty')}</p>
              ) : (
                <>
                  <p className="muted">
                    {t('grammar.test.historyStats', {
                      count: stats.sessions,
                      pct: Math.round(stats.accuracy * 100),
                    })}
                  </p>
                  <ul className="gx-test-history-list">
                    {history.slice(0, 5).map((r) => (
                      <li key={r.at}>
                        {new Date(r.at).toLocaleDateString(LANG_TAGS[lang])} · {r.correct}/{r.delivered} ·{' '}
                        {t(DIRECTION_KEY[r.direction])}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>

            <div className="gx-test-done-actions">
              <button
                type="button"
                className="btn"
                disabled={!missed.length}
                onClick={addMissedToDeck}
              >
                {t('grammar.test.addMissed')}
              </button>
              <button type="button" className="btn primary" onClick={start}>
                {t('grammar.test.retry')}
              </button>
              <button type="button" className="btn ghost" onClick={onClose}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

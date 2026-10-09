/**
 * The one place the local scheduler is chosen, and the only place its two
 * deck-wide operations can be run.
 *
 * A setting nothing can reach is the dead control this repo keeps finding, so
 * this panel exists in the same commit that the setting starts affecting
 * reviews. Three things it is careful about:
 *
 * - Switching the algorithm does NOT rewrite the deck. Cards adapt as they come
 *   up for review; converting the whole deck is a separate, explicit button
 *   that reports how many cards it actually changed. A toggle that silently
 *   rewrote thousands of cards would be unreversible by accident.
 * - Reset asks first and says what it will destroy, because the review history
 *   lives nowhere else and there is no undo on this side.
 * - The forecast is read from stored due dates, never derived from interval
 *   lengths, and unscheduled cards are shown as due rather than quietly
 *   excluded — the panel must agree with the button the user is about to press.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  MAX_LOCAL_RETENTION,
  MIN_LOCAL_RETENTION,
  type LeechAction,
  type SchedulingConfig,
} from '../../../shared/flashcardScheduling';
import { DEFAULT_FSRS_WEIGHTS } from '../../../shared/fsrs';
import type { FsrsHoldoutResult } from '../../../shared/fsrsOptimizer';
import { dailyReviewRate, simulateRetentionWorkload } from '../../../shared/fsrsWorkload';
import {
  ANKI_DEFAULT_LEARNING_STEPS,
  formatStepList,
  parseStepList,
} from '../../../shared/learningSteps';
import type { LocalSrsAlgorithm } from '../../../shared/localSrs';
import { localDueForecast } from '../../../shared/reviewForecast';
import { loadReviewLog } from '../../reviewLog';
import { saveReviewSessionPrefs, useReviewSessionPrefs } from '../../reviewSessionPrefs';
import {
  convertDeckSchedule,
  loadDeck,
  onDeckChanged,
  resetDeckSchedule,
  type SchedulingSweepReport,
} from '../../flashcardDeck';
import { loadSchedulingConfig, saveSchedulingConfig } from '../../flashcardScheduling';
import { FsrsOptimizerCancelled, runFsrsOptimizer, type FsrsOptimizerJob } from '../../fsrsOptimizerAsync';
import { useT } from '../../i18n';
import './autoAudio.css';

const ALGORITHMS: Array<{ key: LocalSrsAlgorithm; label: string; about: string }> = [
  { key: 'sm2', label: 'flash.schedule.sm2', about: 'flash.schedule.sm2About' },
  { key: 'fsrs', label: 'flash.schedule.fsrs', about: 'flash.schedule.fsrsAbout' },
];

const FORECAST_DAYS = 7;

export default function SchedulingPreferencesPanel() {
  const { t } = useT();
  const [config, setConfig] = useState<SchedulingConfig>(loadSchedulingConfig);
  const [cards, setCards] = useState(loadDeck);
  const [report, setReport] = useState<{ kind: 'convert' | 'reset'; data: SchedulingSweepReport } | null>(null);
  /** Reset is destructive with no undo, so it takes two presses. */
  const [confirmingReset, setConfirmingReset] = useState(false);
  const reviewPrefs = useReviewSessionPrefs();
  /** The step fields as typed; committed on blur, refused (not trimmed) when they do not parse. */
  const [learningText, setLearningText] = useState(() => formatStepList(config.learningStepsMinutes));
  const [relearningText, setRelearningText] = useState(() => formatStepList(config.relearningStepsMinutes));
  const [stepsError, setStepsError] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  /** Share of the fit done, 0..1, while `optimizing`. */
  const [progress, setProgress] = useState(0);
  const [fit, setFit] = useState<FsrsHoldoutResult | null>(null);
  /** Why the last run produced no result: cancelled by the user, or an error message. */
  const [failure, setFailure] = useState<{ kind: 'cancelled' } | { kind: 'error'; message: string } | null>(null);
  const job = useRef<FsrsOptimizerJob | null>(null);

  const refresh = useCallback(() => { setCards(loadDeck()); }, []);
  useEffect(() => onDeckChanged(refresh), [refresh]);
  // Leaving the panel stops a fit nobody is waiting for.
  useEffect(() => () => { job.current?.cancel(); job.current = null; }, []);

  const forecast = useMemo(() => localDueForecast(cards, FORECAST_DAYS), [cards]);
  const scheduled = useMemo(
    () => cards.filter((card) => card.srs !== undefined).length,
    [cards],
  );

  /**
   * What the retention setting costs: a year of a new card simulated at this
   * retention and at 90%, and the deck's own FSRS cards' daily rate today.
   */
  const workload = useMemo(() => {
    if (config.algorithm !== 'fsrs') return null;
    const weights = config.fsrsWeights ?? DEFAULT_FSRS_WEIGHTS;
    const options = { weights, maximumIntervalDays: config.maximumIntervalDays };
    const here = simulateRetentionWorkload(config.desiredRetention, options);
    const base = simulateRetentionWorkload(0.9, options);
    return {
      perCard: here.reviewsPerCard,
      recall: here.averageRecall,
      ratio: base.reviewsPerCard > 0 ? here.reviewsPerCard / base.reviewsPerCard : 1,
    };
  }, [config.algorithm, config.desiredRetention, config.fsrsWeights, config.maximumIntervalDays]);
  const fsrsStabilities = useMemo(
    () => cards
      .filter((card) => !card.suspended && card.srs?.algorithm === 'fsrs' && typeof card.srs.stability === 'number')
      .map((card) => card.srs?.stability ?? 0),
    [cards],
  );
  const dailyRate = useMemo(
    () => dailyReviewRate(fsrsStabilities, config.desiredRetention, config.maximumIntervalDays),
    [fsrsStabilities, config.desiredRetention, config.maximumIntervalDays],
  );

  function update(next: Partial<SchedulingConfig>): void {
    setConfig(saveSchedulingConfig(next));
    setReport(null);
    setConfirmingReset(false);
  }

  function commitSteps(): void {
    const learning = parseStepList(learningText);
    const relearning = parseStepList(relearningText);
    if (!learning || !relearning) {
      setStepsError(true);
      return;
    }
    setStepsError(false);
    update({ learningStepsMinutes: learning, relearningStepsMinutes: relearning });
  }

  function applyAnkiSteps(): void {
    setLearningText(formatStepList(ANKI_DEFAULT_LEARNING_STEPS));
    setRelearningText(formatStepList([10]));
    setStepsError(false);
    update({ learningStepsMinutes: [...ANKI_DEFAULT_LEARNING_STEPS], relearningStepsMinutes: [10] });
  }

  /**
   * Fit FSRS to this user's own review log, in a Web Worker so the window
   * stays responsive, with progress and a Cancel. The worker trains only on
   * real reviews (game and practice rows are left out), fits on the earlier
   * ~80% of them and offers new parameters only when they predict the latest
   * ~20% better than the parameters in use.
   */
  async function optimize(): Promise<void> {
    job.current?.cancel();
    setOptimizing(true);
    setProgress(0);
    setFit(null);
    setFailure(null);
    let running: FsrsOptimizerJob | null = null;
    try {
      const entries = await loadReviewLog();
      running = runFsrsOptimizer(entries, {
        utcOffsetMinutes: -new Date().getTimezoneOffset(),
        dayStartHour: 4,
        start: DEFAULT_FSRS_WEIGHTS,
        current: config.fsrsWeights ?? DEFAULT_FSRS_WEIGHTS,
      }, setProgress);
      job.current = running;
      setFit(await running.result);
    } catch (error) {
      setFailure(error instanceof FsrsOptimizerCancelled
        ? { kind: 'cancelled' }
        : { kind: 'error', message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (job.current === running) job.current = null;
      setOptimizing(false);
    }
  }

  function cancelOptimize(): void {
    job.current?.cancel();
  }

  // Rounded as a number, not `toFixed`: `t()` formats numbers for the UI
  // language, so Russian gets "0,352" like every other number on the panel.
  const formatLoss = (value: number): number => Math.round(value * 1000) / 1000;

  const setRetention = (event: ChangeEvent<HTMLInputElement>): void => {
    update({ desiredRetention: Number(event.currentTarget.value) / 100 });
  };
  const setMaximum = (event: ChangeEvent<HTMLInputElement>): void => {
    update({ maximumIntervalDays: Number(event.currentTarget.value) });
  };

  function convert(): void {
    setReport({ kind: 'convert', data: convertDeckSchedule(config.algorithm) });
    setConfirmingReset(false);
    refresh();
  }

  function reset(): void {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setReport({ kind: 'reset', data: resetDeckSchedule() });
    setConfirmingReset(false);
    refresh();
  }

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.schedule.title')}</legend>
      <p className="muted">{t('flash.schedule.lead')}</p>

      {ALGORITHMS.map((entry) => (
        <label key={entry.key}>
          <input
            type="radio"
            name="flash-schedule-algorithm"
            checked={config.algorithm === entry.key}
            onChange={() => update({ algorithm: entry.key })}
          />
          {t(entry.label)}
          <span className="muted"> {t(entry.about)}</span>
        </label>
      ))}

      {config.algorithm === 'fsrs' && (
        <label className="auto-reading-options__cap">
          {t('flash.schedule.retention', { percent: Math.round(config.desiredRetention * 100) })}
          <input
            type="range"
            min={Math.round(MIN_LOCAL_RETENTION * 100)}
            max={Math.round(MAX_LOCAL_RETENTION * 100)}
            value={Math.round(config.desiredRetention * 100)}
            onChange={setRetention}
          />
        </label>
      )}

      {config.algorithm === 'fsrs' && workload && (
        <div className="srs2-workload" aria-live="polite">
          <p className="muted">
            {t('srs2.workload.perCard', {
              // Numbers, not strings: `t()` formats them for the UI language.
              reviews: Math.round(workload.perCard * 10) / 10,
              recall: Math.round(workload.recall * 100),
            })}
            {' '}
            {Math.abs(workload.ratio - 1) >= 0.005
              && t('srs2.workload.ratio', { ratio: Math.round(workload.ratio * 100) / 100 })}
          </p>
          {fsrsStabilities.length > 0 && (
            <p className="muted">{t('srs2.workload.daily', { count: Math.round(dailyRate), cards: fsrsStabilities.length })}</p>
          )}
        </div>
      )}

      {config.algorithm === 'fsrs' && (
        <div className="srs2-optimizer">
          <p className="muted">
            {config.fsrsWeights ? t('srs2.optimizer.personal') : t('srs2.optimizer.defaults')}
          </p>
          <div className="flash-match-actions">
            <button type="button" className="btn" onClick={() => void optimize()} disabled={optimizing}>
              {optimizing ? t('srs2.optimizer.running') : t('srs2.optimizer.run')}
            </button>
            {optimizing && (
              <button type="button" className="btn" onClick={cancelOptimize}>
                {t('srs3.optimizer.cancel')}
              </button>
            )}
            {config.fsrsWeights && !optimizing && (
              <button type="button" className="btn" onClick={() => { update({ fsrsWeights: undefined }); setFit(null); }}>
                {t('srs2.optimizer.useDefaults')}
              </button>
            )}
          </div>
          {optimizing && (
            <p className="muted srs3-optimizer-progress">
              <progress
                max={100}
                value={Math.round(progress * 100)}
                aria-label={t('srs3.optimizer.progressLabel')}
              />
              {' '}
              {t('srs3.optimizer.progress', { percent: Math.round(progress * 100) })}
            </p>
          )}
          {failure && (
            <p className="auto-reading-options__report" role={failure.kind === 'error' ? 'alert' : undefined} aria-live="polite">
              {failure.kind === 'cancelled'
                ? t('srs3.optimizer.cancelled')
                : t('srs3.optimizer.error', { message: failure.message })}
            </p>
          )}
          {fit && (
            <div className="auto-reading-options__report" aria-live="polite">
              {fit.status === 'insufficient-data' ? (
                fit.shortOf === 'held-out' ? (
                  <p>{t('srs3.optimizer.tooFewHeldOut', { count: fit.current.reviews, min: fit.thresholds.heldOut })}</p>
                ) : (
                  <p>{t('srs2.optimizer.tooFew', { count: fit.trainReviews, min: fit.thresholds.train })}</p>
                )
              ) : fit.improved ? (
                <>
                  <p>
                    {t('srs3.optimizer.heldOutResult', {
                      count: fit.fitted.reviews,
                      train: fit.trainReviews,
                      before: formatLoss(fit.current.logLoss),
                      after: formatLoss(fit.fitted.logLoss),
                      rmseBefore: formatLoss(fit.current.rmse),
                      rmseAfter: formatLoss(fit.fitted.rmse),
                    })}
                  </p>
                  {fit.trainReviews < fit.thresholds.recommended && (
                    <p className="muted">{t('srs2.optimizer.lowData', { recommended: fit.thresholds.recommended })}</p>
                  )}
                  <button
                    type="button"
                    className="btn primary"
                    onClick={() => { update({ fsrsWeights: fit.weights }); setFit(null); }}
                  >
                    {t('srs2.optimizer.apply')}
                  </button>
                </>
              ) : (
                <p>
                  {t('srs3.optimizer.heldOutNoGain', {
                    count: fit.current.reviews,
                    before: formatLoss(fit.current.logLoss),
                    after: formatLoss(fit.fitted.logLoss),
                  })}
                </p>
              )}
              {fit.excluded > 0 && (
                <p className="muted">{t('srs3.optimizer.excluded', { count: fit.excluded })}</p>
              )}
            </div>
          )}
        </div>
      )}

      <label className="auto-reading-options__cap">
        {t('flash.schedule.maximum')}
        <input
          type="number"
          min={1}
          max={36500}
          value={config.maximumIntervalDays}
          onChange={setMaximum}
        />
      </label>

      <p className="flash-write-progress">{t('srs2.steps.title')}</p>
      <label className="auto-reading-options__cap">
        {t('srs2.steps.learning')}
        <input
          type="text"
          value={learningText}
          placeholder={t('srs2.steps.none')}
          aria-describedby="srs2-steps-help"
          aria-invalid={stepsError || undefined}
          onChange={(event) => setLearningText(event.currentTarget.value)}
          onBlur={commitSteps}
        />
      </label>
      <label className="auto-reading-options__cap">
        {t('srs2.steps.relearning')}
        <input
          type="text"
          value={relearningText}
          placeholder={t('srs2.steps.none')}
          aria-describedby="srs2-steps-help"
          aria-invalid={stepsError || undefined}
          onChange={(event) => setRelearningText(event.currentTarget.value)}
          onBlur={commitSteps}
        />
      </label>
      <p className="muted" id="srs2-steps-help">{t('srs2.steps.help')}</p>
      {stepsError && <p className="auto-reading-options__report" role="alert">{t('srs2.steps.invalid')}</p>}
      <div className="flash-match-actions">
        <button type="button" className="btn" onClick={applyAnkiSteps}>{t('srs2.steps.ankiPreset')}</button>
      </div>

      <label>
        <input type="checkbox" checked={config.fuzz} onChange={(event) => update({ fuzz: event.currentTarget.checked })} />
        {t('srs2.fuzz.label')}
        <span className="muted"> {t('srs2.fuzz.about')}</span>
      </label>

      <p className="flash-write-progress">{t('srs2.leech.title')}</p>
      <label className="auto-reading-options__cap">
        {t('srs2.leech.threshold')}
        <input
          type="number"
          min={2}
          max={99}
          value={config.leechThreshold}
          onChange={(event) => update({ leechThreshold: Number(event.currentTarget.value) })}
        />
      </label>
      <label className="auto-reading-options__cap">
        {t('srs2.leech.action')}
        <select
          value={config.leechAction}
          onChange={(event) => update({ leechAction: event.currentTarget.value as LeechAction })}
        >
          <option value="tag">{t('srs2.leech.actionTag')}</option>
          <option value="suspend">{t('srs2.leech.actionSuspend')}</option>
        </select>
      </label>

      <p className="flash-write-progress">{t('srs2.session.title')}</p>
      <label>
        <input
          type="checkbox"
          checked={reviewPrefs.showTimer}
          onChange={(event) => saveReviewSessionPrefs({ showTimer: event.currentTarget.checked })}
        />
        {t('srs2.timer.show')}
      </label>
      <label>
        <input
          type="checkbox"
          checked={reviewPrefs.autoplayOnReveal}
          onChange={(event) => saveReviewSessionPrefs({ autoplayOnReveal: event.currentTarget.checked })}
        />
        {t('srs2.autoplay.reveal')}
      </label>

      <p className="muted">{t('flash.schedule.switchNote')}</p>

      {/*
        Both buttons go disabled on the same condition and neither said so: `Convert 0 scheduled
        cards now` at least carries its zero, `Reset all scheduling` carries nothing at all, and a
        row of disabled buttons never explains itself (a neighbour's caption is not an
        explanation). Measured 2026-09-03 by `probes/cat8-honest-states.cjs`.
      */}
      <div className="flash-match-actions">
        <button
          className="btn"
          type="button"
          onClick={convert}
          disabled={scheduled === 0}
          aria-describedby={scheduled === 0 ? 'flash-schedule-blocked' : undefined}
        >
          {t('flash.schedule.convert', { count: scheduled })}
        </button>
        <button
          className="btn"
          type="button"
          onClick={reset}
          disabled={scheduled === 0}
          aria-describedby={scheduled === 0 ? 'flash-schedule-blocked' : undefined}
        >
          {confirmingReset ? t('flash.schedule.resetConfirm') : t('flash.schedule.reset')}
        </button>
      </div>

      {scheduled === 0 && (
        <p className="muted" id="flash-schedule-blocked">
          {t('flash.schedule.blocked')}
        </p>
      )}

      {confirmingReset && (
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.schedule.resetWarning', { count: scheduled })}
        </p>
      )}

      {report && (
        <p className="auto-reading-options__report" aria-live="polite">
          {report.kind === 'convert'
            ? t('flash.schedule.convertReport', {
                changed: report.data.changed,
                unscheduled: report.data.unscheduled,
              })
            : t('flash.schedule.resetReport', { changed: report.data.changed })}
        </p>
      )}

      <p className="flash-write-progress">{t('flash.schedule.forecastTitle')}</p>
      <p className="muted">
        {t('flash.schedule.forecastDue', { count: forecast.overdue })}
        {forecast.beyond > 0 && ` ${t('flash.schedule.forecastBeyond', { count: forecast.beyond })}`}
      </p>
      <ul className="flash-test-sheet">
        {forecast.days.map((day) => (
          <li key={day.offsetDays} className="flash-test-line">
            <span className="flash-test-line__no">
              {day.offsetDays === 0
                ? t('flash.schedule.today')
                : t('flash.schedule.inDays', { count: day.offsetDays })}
            </span>
            <span className="flash-test-line__outcome">
              {t('flash.schedule.dayDue', { count: day.due })}
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

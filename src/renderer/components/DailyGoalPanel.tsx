/**
 * Today's study goal — reviews, new cards and minutes against their targets.
 *
 * One component for both places the goal is shown: the desktop widget and the
 * Statistics window. Targets move a step at a time with − / +, down to 0
 * ("not part of today's goal"); progress is recounted from the review log and
 * the day's study statistics (see `renderer/dailyGoal.ts`), so it starts over
 * at local midnight without anything being reset.
 */
import { DAILY_GOAL_MAX, DAILY_GOAL_METRICS, dailyGoalMet, dailyGoalRatio, type DailyGoalMetric } from '../../shared/dailyGoal';
import { resetDailyGoalTargets, stepDailyGoalTarget, useDailyGoal } from '../dailyGoal';
import { formatNumber } from '../stats';
import { useT } from '../i18n';
import './dailyGoal.css';

const METRIC_LABEL_KEY: Record<DailyGoalMetric, string> = {
  reviews: 'dailyGoal.metric.reviews',
  newCards: 'dailyGoal.metric.newCards',
  minutes: 'dailyGoal.metric.minutes',
};

const METRIC_HINT_KEY: Record<DailyGoalMetric, string> = {
  reviews: 'dailyGoal.hint.reviews',
  newCards: 'dailyGoal.hint.newCards',
  minutes: 'dailyGoal.hint.minutes',
};

export default function DailyGoalPanel({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  const { targets, progress, customized } = useDailyGoal();
  const met = dailyGoalMet(progress, targets);

  return (
    <div className={`daily-goal${compact ? ' is-compact' : ''}${met ? ' is-met' : ''}`}>
      <ul className="daily-goal-list">
        {DAILY_GOAL_METRICS.map((metric) => {
          const label = t(METRIC_LABEL_KEY[metric]);
          const target = targets[metric];
          const done = progress[metric];
          const ratio = dailyGoalRatio(progress, targets, metric);
          const reached = ratio !== null && ratio >= 1;
          return (
            <li key={metric} className={`daily-goal-row${reached ? ' is-reached' : ''}${ratio === null ? ' is-off' : ''}`} data-metric={metric}>
              <div className="daily-goal-top">
                <span className="daily-goal-label" title={t(METRIC_HINT_KEY[metric])}>{label}</span>
                <span className="daily-goal-count">
                  {ratio === null
                    ? t('dailyGoal.off')
                    : t('dailyGoal.count', { done: formatNumber(done), target: formatNumber(target) })}
                </span>
                <span className="daily-goal-ctrls">
                  <button
                    type="button"
                    className="wgt-btn-icon sm"
                    disabled={target <= 0}
                    title={t('dailyGoal.lower', { metric: label })}
                    aria-label={t('dailyGoal.lower', { metric: label })}
                    onClick={() => stepDailyGoalTarget(metric, -1)}
                  >
                    −
                  </button>
                  <button
                    type="button"
                    className="wgt-btn-icon sm"
                    disabled={target >= DAILY_GOAL_MAX[metric]}
                    title={t('dailyGoal.raise', { metric: label })}
                    aria-label={t('dailyGoal.raise', { metric: label })}
                    onClick={() => stepDailyGoalTarget(metric, 1)}
                  >
                    +
                  </button>
                </span>
              </div>
              {ratio !== null && (
                <div
                  className="wgt-progress daily-goal-bar"
                  role="progressbar"
                  aria-label={label}
                  aria-valuemin={0}
                  aria-valuemax={target}
                  aria-valuenow={Math.min(done, target)}
                >
                  <div className="wgt-progress-fill" style={{ width: `${ratio * 100}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="daily-goal-foot">
        <span className="muted">{met ? t('dailyGoal.met') : t('dailyGoal.resets')}</span>
        {customized && (
          <button type="button" className="daily-goal-defaults" onClick={() => resetDailyGoalTargets()}>
            {t('dailyGoal.useDefaults')}
          </button>
        )}
      </div>
    </div>
  );
}

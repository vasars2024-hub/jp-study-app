/**
 * "Suggest targets" for today's goal (`DailyGoalPanel`).
 *
 * The suggestion is computed first and without any model
 * (`suggestDailyGoalTargets`: the 14-day averages, next week's due forecast and
 * retention, on the goal's own step grid). "Ask the AI" may propose different
 * targets with a reason; that proposal is clamped onto the same grid in main.
 * Nothing changes until the learner presses Apply — the same write the − / +
 * buttons make. The AI request carries study averages, so a cloud engine also
 * needs the study-data permission from Agent settings.
 *
 * Lazy-loaded on the first press of "Suggest targets".
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  goalHistoryFrom,
  suggestDailyGoalTargets,
  type GoalHistory,
  type GoalReason,
  type GoalReasonId,
  type GoalSuggestResult,
} from '../../shared/aiStudyPlanner';
import { DAILY_GOAL_METRICS, type DailyGoalMetric, type DailyGoalTargets } from '../../shared/dailyGoal';
import { useAiReadiness } from '../aiSetupClient';
import { setDailyGoalTargets } from '../dailyGoal';
import { loadDeck } from '../flashcardDeck';
import { useT } from '../i18n';
import { loadLocalAgentSettings } from '../localAgentSettingsStore';
import { loadReviewLog } from '../reviewLog';
import { formatNumber, getStudyDaysByKey } from '../stats';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from './ai/aiStudyRequest';
import './ai/aiTutor.css';

const REASON_KEYS: Record<GoalReasonId, string> = {
  noHistory: 'aiTutor.goal.reason.noHistory',
  reviewsFromDue: 'aiTutor.goal.reason.reviewsFromDue',
  reviewsFromPace: 'aiTutor.goal.reason.reviewsFromPace',
  newFromPace: 'aiTutor.goal.reason.newFromPace',
  newLowerRetention: 'aiTutor.goal.reason.newLowerRetention',
  newRoomForMore: 'aiTutor.goal.reason.newRoomForMore',
  minutesFromPace: 'aiTutor.goal.reason.minutesFromPace',
  minutesFloor: 'aiTutor.goal.reason.minutesFloor',
};

const METRIC_KEYS: Record<DailyGoalMetric, string> = {
  reviews: 'dailyGoal.metric.reviews',
  newCards: 'dailyGoal.metric.newCards',
  minutes: 'dailyGoal.metric.minutes',
};

function TargetList({ targets }: { targets: DailyGoalTargets }) {
  const { t } = useT();
  return (
    <dl className="ai-tutor-draft">
      {DAILY_GOAL_METRICS.map((metric) => (
        <Fragment key={metric}>
          <dt>{t(METRIC_KEYS[metric])}</dt>
          <dd>{targets[metric] > 0 ? formatNumber(targets[metric]) : t('dailyGoal.off')}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default function DailyGoalSuggest({ current, onClose }: { current: DailyGoalTargets; onClose: () => void }) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<GoalSuggestResult>();
  const [history, setHistory] = useState<GoalHistory | null>(null);
  const [applied, setApplied] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadReviewLog()
      .catch(() => [])
      .then((entries) => {
        if (!alive) return;
        const seconds: Record<string, number> = {};
        for (const [day, raw] of Object.entries(getStudyDaysByKey())) {
          seconds[day] = (raw.seconds ?? 0) + (raw.watchSeconds ?? 0);
        }
        const dueAts = loadDeck()
          .filter((card) => !card.suspended && card.srs)
          .map((card) => card.srs?.dueAt ?? Number.NaN);
        setHistory(goalHistoryFrom({ entries, studySecondsByDay: seconds, dueAts, now: Date.now() }));
      });
    return () => {
      alive = false;
    };
  }, []);

  const rule = useMemo(() => (history ? suggestDailyGoalTargets(history, current) : null), [history, current]);
  const result = request.state.status === 'done' ? request.state.result : null;

  const apply = (targets: DailyGoalTargets): void => {
    setDailyGoalTargets(targets);
    setApplied(true);
  };

  const ask = (): void => {
    if (!history) return;
    setApplied(false);
    void request.run((requestId) => window.api.aiTutorGoalSuggest({
      requestId,
      history,
      current,
      shareStudyData: loadLocalAgentSettings().agentCloudShareStudyData,
      answerLang: lang,
    }));
  };

  const reasonText = (reason: GoalReason): string => t(REASON_KEYS[reason.id], reason.vars);

  return (
    <section className="ai-study ai-tutor daily-goal-suggest" aria-label={t('aiTutor.goal.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.goal.title')}</h4>
        <button
          type="button"
          className="btn small ai-study-btn lq-hit"
          aria-label={t('aiStudy.close')}
          title={t('aiStudy.close')}
          onClick={onClose}
        >
          ×
        </button>
      </div>
      {!rule ? (
        <p className="muted ai-study-note" role="status">{t('aiTutor.goal.loading')}</p>
      ) : (
        <div className="ai-tutor-fallback">
          <p className="ai-study-section-label">{t('aiTutor.goal.ruleTitle')}</p>
          <TargetList targets={rule.targets} />
          <ul className="ai-study-notes">
            {rule.reasons.map((reason) => <li key={reason.id}>{reasonText(reason)}</li>)}
          </ul>
          <div className="ai-study-actions">
            <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => apply(rule.targets)}>
              {t('aiTutor.goal.apply')}
            </button>
          </div>
        </div>
      )}
      {result && (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <TargetList targets={result.targets} />
          <p>{result.reason}</p>
          <div className="ai-study-actions">
            <button type="button" className="btn small primary ai-study-btn lq-hit" onClick={() => apply(result.targets)}>
              {t('aiTutor.goal.applyAi')}
            </button>
          </div>
        </div>
      )}
      {applied && <p className="muted ai-study-note" role="status">{t('aiTutor.goal.applied')}</p>}
      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.goal.busy" />
      {ai.loaded && ai.enabled && history && history.activeDays > 0 && request.state.status !== 'running' && (
        <div className="ai-study-actions" data-ai-entry>
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={ask}>
            {t(result ? 'aiStudy.askAgain' : 'aiTutor.goal.ask')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * "Explain my stats" (docs/AI_AUDIT.md N22) for Statistics > Review insights.
 *
 * The numbers come first and always: `buildStatsDigest` summarizes the same log
 * and deck the charts read, and `statsRuleTips` turns them into 3-5 tips by fixed
 * rules — that is the whole card without AI. "Ask the AI" sends ONLY the numeric
 * summary (no word, card or title) and gets 3-5 suggestions back, each naming the
 * chart it rests on. A cloud engine also needs the study-data permission from
 * Agent settings; main enforces it, and the offline engine needs neither.
 *
 * Lazy-loaded by `StatsReviewInsights` when the card is opened.
 */
import { useMemo } from 'react';
import {
  buildStatsDigest,
  statsRuleTips,
  type StatsBasis,
  type StatsCoachResult,
  type StatsDaypart,
  type StatsTip,
  type StatsTipId,
} from '../../../shared/aiStatsCoach';
import type { ReviewLogEntry } from '../../../shared/reviewLog';
import type { TVars } from '../../../shared/i18n/core';
import { useAiReadiness } from '../../aiSetupClient';
import type { DeckFlashcard } from '../../flashcardDeck';
import { useT } from '../../i18n';
import { loadLocalAgentSettings } from '../../localAgentSettingsStore';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import '../ai/aiStudy.css';
import '../ai/aiTutor.css';

const TIP_KEYS: Record<StatsTipId, string> = {
  retentionLow: 'aiTutor.stats.tip.retentionLow',
  retentionHigh: 'aiTutor.stats.tip.retentionHigh',
  retentionDropping: 'aiTutor.stats.tip.retentionDropping',
  bestTime: 'aiTutor.stats.tip.bestTime',
  slowAnswers: 'aiTutor.stats.tip.slowAnswers',
  leeches: 'aiTutor.stats.tip.leeches',
  dueSpike: 'aiTutor.stats.tip.dueSpike',
  backlog: 'aiTutor.stats.tip.backlog',
  consistency: 'aiTutor.stats.tip.consistency',
  reviewBeforeNew: 'aiTutor.stats.tip.reviewBeforeNew',
  shortSessions: 'aiTutor.stats.tip.shortSessions',
  keepGoing: 'aiTutor.stats.tip.keepGoing',
};

const BASIS_KEYS: Record<StatsBasis, string> = {
  retention: 'aiTutor.stats.basis.retention',
  'time-of-day': 'aiTutor.stats.basis.timeOfDay',
  'answer-time': 'aiTutor.stats.basis.answerTime',
  leeches: 'aiTutor.stats.basis.leeches',
  forecast: 'aiTutor.stats.basis.forecast',
  volume: 'aiTutor.stats.basis.volume',
  consistency: 'aiTutor.stats.basis.consistency',
};

const DAYPART_KEYS: Record<StatsDaypart, string> = {
  night: 'aiTutor.stats.daypart.night',
  morning: 'aiTutor.stats.daypart.morning',
  afternoon: 'aiTutor.stats.daypart.afternoon',
  evening: 'aiTutor.stats.daypart.evening',
};

export interface StatsAiCoachProps {
  entries: readonly ReviewLogEntry[];
  deck: readonly DeckFlashcard[];
  rangeDays: number;
  now: number;
  onClose: () => void;
}

export default function StatsAiCoach({ entries, deck, rangeDays, now, onClose }: StatsAiCoachProps) {
  const { t, lang } = useT();
  const ai = useAiReadiness();
  const request = useAiStudyRequest<StatsCoachResult>();
  const digest = useMemo(
    () => buildStatsDigest({
      entries,
      cards: deck.map((card) => ({ suspended: card.suspended, srs: card.srs ? { dueAt: card.srs.dueAt, lapses: card.srs.lapses } : null })),
      rangeDays,
      now,
    }),
    [entries, deck, rangeDays, now],
  );
  const tips = useMemo(() => statsRuleTips(digest), [digest]);

  const tipText = (tip: StatsTip): string => {
    const vars: TVars = { ...tip.vars };
    if (typeof tip.vars.best === 'string') vars.best = t(DAYPART_KEYS[tip.vars.best as StatsDaypart] ?? DAYPART_KEYS.morning);
    if (typeof tip.vars.worst === 'string') vars.worst = t(DAYPART_KEYS[tip.vars.worst as StatsDaypart] ?? DAYPART_KEYS.night);
    return t(TIP_KEYS[tip.id], vars);
  };

  const ask = (refresh = false): void => {
    void request.run((requestId) => window.api.aiTutorStatsCoach({
      requestId,
      digest,
      shareStudyData: loadLocalAgentSettings().agentCloudShareStudyData,
      answerLang: lang,
      ...(refresh ? { refresh: true } : {}),
    }));
  };

  const result = request.state.status === 'done' ? request.state.result : null;
  const canAsk = ai.loaded && ai.enabled && digest.reviews > 0;

  return (
    <section className="ai-study ai-tutor stats2-coach" aria-label={t('aiTutor.stats.title')}>
      <div className="ai-study-head">
        <h4>{t('aiTutor.stats.title')}</h4>
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
      <p className="muted ai-study-note">{t('aiTutor.stats.about', { days: digest.rangeDays })}</p>

      {result ? (
        <div className="ai-study-answer" lang={lang}>
          <AiSuggestionBadge />
          <p>{result.summary}</p>
          <ol className="ai-tutor-tips">
            {result.suggestions.map((suggestion) => (
              <li key={suggestion.text}>
                {suggestion.text}
                <span className="ai-tutor-basis muted">{t('aiTutor.stats.basedOn', { chart: t(BASIS_KEYS[suggestion.basis]) })}</span>
              </li>
            ))}
          </ol>
          {request.state.status === 'done' && request.state.cached && (
            <p className="muted ai-study-meta">{t('aiStudy.cached')}</p>
          )}
        </div>
      ) : (
        <div className="ai-tutor-fallback">
          <p className="ai-study-section-label">{t('aiTutor.stats.ruleTitle')}</p>
          <ol className="ai-tutor-tips">
            {tips.map((tip) => (
              <li key={tip.id}>
                {tipText(tip)}
                <span className="ai-tutor-basis muted">{t('aiTutor.stats.basedOn', { chart: t(BASIS_KEYS[tip.basis]) })}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <AiStudyStatus state={request.state} onCancel={request.cancel} busyKey="aiTutor.stats.busy" />
      {canAsk && request.state.status !== 'running' && (
        <div className="ai-study-actions" data-ai-entry>
          <button type="button" className="btn small ai-study-btn lq-hit" onClick={() => ask(Boolean(result))}>
            {t(result ? 'aiStudy.askAgain' : 'aiTutor.stats.ask')}
          </button>
          <span className="muted ai-study-meta">{t('aiTutor.stats.sends')}</span>
        </div>
      )}
    </section>
  );
}

/**
 * Review figures for the Aero gadgets and the Welcome Center: retention over
 * the last 30 days (the review log's own definition, mature cards only) and
 * the reviews graded today. Read on demand and on change, never per frame.
 */
import { useEffect, useState } from 'react';
import { loadReviewLog, onReviewLogChanged } from '../reviewLog';
import { summarizeReviewLog } from '../../shared/reviewLog';
import { getSummary, onStatsChanged } from '../stats';

export interface StudyMeters {
  /** 0..1, or null when there were no mature reviews in the window. */
  retention: number | null;
  retentionSample: number;
  reviewedToday: number;
  streak: number;
}

const EMPTY: StudyMeters = { retention: null, retentionSample: 0, reviewedToday: 0, streak: 0 };

function readSync(prev: StudyMeters): StudyMeters {
  try {
    const summary = getSummary();
    return { ...prev, reviewedToday: summary.todayReviews ?? 0, streak: summary.streak ?? 0 };
  } catch {
    return prev;
  }
}

export function useStudyMeters(enabled: boolean): StudyMeters {
  const [meters, setMeters] = useState<StudyMeters>(EMPTY);
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    let pending = 0;
    const refreshLog = (): void => {
      // Coalesce a burst of review-log writes into one read.
      if (pending) return;
      pending = window.setTimeout(() => {
        pending = 0;
        void loadReviewLog()
          .then((entries) => {
            if (!alive) return;
            const summary = summarizeReviewLog(entries, 30);
            setMeters((m) => ({ ...readSync(m), retention: summary.retention, retentionSample: summary.retentionSample }));
          })
          .catch(() => undefined);
      }, 250);
    };
    const refreshStats = (): void => setMeters((m) => readSync(m));
    refreshStats();
    refreshLog();
    const offLog = onReviewLogChanged(refreshLog);
    const offStats = onStatsChanged(refreshStats);
    return () => {
      alive = false;
      if (pending) window.clearTimeout(pending);
      offLog();
      offStats();
    };
  }, [enabled]);
  return meters;
}

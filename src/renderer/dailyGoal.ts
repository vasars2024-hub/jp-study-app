// Daily study goal — the renderer half: the user's stored targets and a hook
// that recounts today's progress whenever a review, a reading/watching flush,
// the profile, or the calendar day changes. The rules live in
// `shared/dailyGoal.ts`.

import { useCallback, useEffect, useState } from 'react';
import {
  adjustDailyGoalTarget,
  dailyGoalProgress,
  normalizeDailyGoalOverrides,
  resolveDailyGoalTargets,
  type DailyGoalMetric,
  type DailyGoalOverrides,
  type DailyGoalProgress,
  type DailyGoalTargets,
} from '../shared/dailyGoal';
import { loadReviewLog, onReviewLogChanged } from './reviewLog';
import { getSummary, onStatsChanged } from './stats';
import { getActiveProfile, onProfileChanged } from './profileState';
import { writeLocalStorageJson } from './localStorageWrite';

export const DAILY_GOAL_STORAGE_KEY = 'jp-daily-goal-v1';
export const DAILY_GOAL_EVENT = 'jp-daily-goal-changed';

export function loadDailyGoalOverrides(): DailyGoalOverrides {
  try {
    const raw = localStorage.getItem(DAILY_GOAL_STORAGE_KEY);
    return raw ? normalizeDailyGoalOverrides(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveDailyGoalOverrides(overrides: DailyGoalOverrides): void {
  writeLocalStorageJson(DAILY_GOAL_STORAGE_KEY, overrides);
  try {
    window.dispatchEvent(new CustomEvent(DAILY_GOAL_EVENT));
  } catch {
    /* non-browser context */
  }
}

function activeNewPerDay(): number | undefined {
  return getActiveProfile().deckParams.newPerDay;
}

export function getDailyGoalTargets(): DailyGoalTargets {
  return resolveDailyGoalTargets(loadDailyGoalOverrides(), activeNewPerDay());
}

/** One step up or down; persisted and broadcast to every goal surface. */
export function stepDailyGoalTarget(metric: DailyGoalMetric, direction: 1 | -1): void {
  saveDailyGoalOverrides(adjustDailyGoalTarget(loadDailyGoalOverrides(), metric, direction, activeNewPerDay()));
}

/** Forget the user's targets; every metric follows the active profile again. */
export function resetDailyGoalTargets(): void {
  saveDailyGoalOverrides({});
}

export interface DailyGoalState {
  targets: DailyGoalTargets;
  progress: DailyGoalProgress;
  /** True while any target differs from the profile default. */
  customized: boolean;
  /** False until the review log has been read once. */
  ready: boolean;
}

function studySecondsToday(): number {
  const s = getSummary();
  return s.todaySeconds + s.todayWatchSeconds;
}

export function useDailyGoal(): DailyGoalState {
  const [state, setState] = useState<DailyGoalState>(() => ({
    targets: getDailyGoalTargets(),
    progress: { reviews: 0, newCards: 0, minutes: Math.floor(studySecondsToday() / 60) },
    customized: Object.keys(loadDailyGoalOverrides()).length > 0,
    ready: false,
  }));

  const recount = useCallback(() => {
    void loadReviewLog()
      .catch(() => [])
      .then((entries) => {
        setState({
          targets: getDailyGoalTargets(),
          progress: dailyGoalProgress(entries, studySecondsToday()),
          customized: Object.keys(loadDailyGoalOverrides()).length > 0,
          ready: true,
        });
      });
  }, []);

  useEffect(() => {
    recount();
    const offLog = onReviewLogChanged(recount);
    // Reading/watching flushes, study-language switches, window focus and the
    // local-midnight rollover all arrive through the statistics subscription.
    const offStats = onStatsChanged(recount);
    const offProfile = onProfileChanged(recount);
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === DAILY_GOAL_STORAGE_KEY) recount();
    };
    window.addEventListener(DAILY_GOAL_EVENT, recount);
    window.addEventListener('storage', onStorage);
    return () => {
      offLog();
      offStats();
      offProfile();
      window.removeEventListener(DAILY_GOAL_EVENT, recount);
      window.removeEventListener('storage', onStorage);
    };
  }, [recount]);

  return state;
}

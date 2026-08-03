/**
 * Study milestone detector — emits companion events for streaks & daily goals (L5).
 */
import { getSummary, READING_RECORDED_EVENT } from '../stats';
import { emitCompanionEvent } from './companionEvents';
import { STREAK_MILESTONES, unlockTrinketsForStreak } from './companionTrinkets';
import { t } from '../i18n';

const KEY = 'jp-os-achievements-v1';

interface AchState {
  lastStreakCelebrated: number;
  lastDailyCharsBucket: number;
  dayKey: string;
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(): AchState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...{ lastStreakCelebrated: 0, lastDailyCharsBucket: 0, dayKey: dayKey() }, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { lastStreakCelebrated: 0, lastDailyCharsBucket: 0, dayKey: dayKey() };
}

function save(s: AchState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

const CHAR_BUCKETS = [500, 2000, 5000, 15000, 40000];

export function checkAchievements(): void {
  const summary = getSummary();
  let state = load();
  const today = dayKey();
  if (state.dayKey !== today) {
    state = { lastStreakCelebrated: state.lastStreakCelebrated, lastDailyCharsBucket: 0, dayKey: today };
  }

  // Celebrate the highest newly crossed streak milestone (not every step at once).
  let bestStreak = 0;
  for (const m of STREAK_MILESTONES) {
    if (summary.streak >= m && state.lastStreakCelebrated < m) bestStreak = m;
  }
  if (bestStreak > 0) {
    state.lastStreakCelebrated = bestStreak;
    emitCompanionEvent('streak', `${bestStreak}-day streak`);
    emitCompanionEvent('achievement', `${bestStreak}-day study streak`);
  }

  // Same for daily character volume — highest new bucket only.
  let bestChars = 0;
  for (const b of CHAR_BUCKETS) {
    if (summary.todayChars >= b && state.lastDailyCharsBucket < b) bestChars = b;
  }
  if (bestChars > 0) {
    state.lastDailyCharsBucket = bestChars;
    emitCompanionEvent('achievement', `${bestChars.toLocaleString()} characters today`);
  }

  // Additive keepsakes — never blocks or alters the streak celebration above.
  for (const trinket of unlockTrinketsForStreak(summary.streak)) {
    window.dispatchEvent(
      new CustomEvent('os:toast', {
        detail: { message: t('companion.trinket.unlocked', { name: t(trinket.labelKey) }), kind: 'ok' },
      }),
    );
  }

  save(state);
}

let started = false;

/** Subscribe once from the desktop shell. */
export function startAchievementWatcher(): () => void {
  if (started) return () => undefined;
  started = true;
  const onRead = () => checkAchievements();
  window.addEventListener(READING_RECORDED_EVENT, onRead);
  // Initial check (e.g. already mid-streak today)
  try {
    checkAchievements();
  } catch {
    /* ignore */
  }
  return () => {
    window.removeEventListener(READING_RECORDED_EVENT, onRead);
    started = false;
  };
}

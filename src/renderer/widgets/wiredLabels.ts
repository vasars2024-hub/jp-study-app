import { t } from '../i18n';

// Wired Archive gives each widget a terminal-mode alias (title + description).
// The strings themselves live in the i18n catalog under `wired.widget.<type>.*`
// so they follow the UI language like the rest of the app chrome. This module
// only knows *which* widget types have an override; the value comes from `t()`
// at render time. Types without an override resolve to the caller's fallback
// (the widget's normal translated title/description).
const WIRED_WIDGET_TYPES = [
  'clock-digital',
  'clock-analog',
  'calendar',
  'pomodoro',
  'stopwatch',
  'world-clock',
  'daily-goals',
  'habit-tracker',
  'countdown',
  'todo',
  'study-streak',
  'today-study-time',
  'reading-progress',
  'vocab-progress',
  'level-progress',
  'word-of-the-day',
  'learning-heatmap',
  'learner-map',
  'mini-player',
  'calculator',
  'recent-lookups',
  'clipboard',
  'cpu-usage',
  'memory-usage',
  'battery',
  'network',
] as const;

const WIRED_WIDGET_TYPE_SET: ReadonlySet<string> = new Set(WIRED_WIDGET_TYPES);

export function wiredWidgetTitle(type: string, fallback: string): string {
  if (!WIRED_WIDGET_TYPE_SET.has(type)) return fallback;
  const key = `wired.widget.${type}.title`;
  const resolved = t(key);
  return resolved === key ? fallback : resolved;
}

export function wiredWidgetDesc(type: string, fallback: string): string {
  if (!WIRED_WIDGET_TYPE_SET.has(type)) return fallback;
  const key = `wired.widget.${type}.desc`;
  const resolved = t(key);
  return resolved === key ? fallback : resolved;
}

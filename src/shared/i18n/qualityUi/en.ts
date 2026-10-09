// Cross-cutting quality pass (performance, accessibility, settings, widgets,
// soundscape): keys under perf2. / a11y2. / set2. / wid2. / snd2. — English
// source of truth.

import type { Catalog } from '../core';

export const QUALITY_UI_EN: Catalog = {
  // ---- Settings discoverability ----
  'set2.home.recentChanges': 'Recently changed',
  'set2.home.clearRecentChanges': 'Clear',
  'set2.reset.dialogTitle': 'Reset {section}?',
  'set2.reset.dialogMessage': 'Every option in this section goes back to its default. This cannot be undone.',
  'set2.group.connections': 'AI & connections',

  // ---- Widgets ----
  'wid2.readingSpark.aria': 'Reading time over the last {days} days: {total}',
  'wid2.habit.dayAria': '{habit}, {day}',
  'wid2.heatmap.aria': 'Studied on {active} of the last {days} days',

  // ---- Soundscape ----
  'snd2.focus.heading': 'During focus',
  'snd2.focus.enable': 'Play during focus',
  'snd2.focus.scene': 'Scene for focus',
  'snd2.focus.currentMix': 'The current mix',
  'snd2.focus.pomodoro': 'Pomodoro work blocks',
  'snd2.focus.focusMode': 'Focus Mode',
  'snd2.focus.fadeOnBreak': 'Fade out for breaks',
  'snd2.focus.today': 'Focus with sound today: {minutes} min',
};

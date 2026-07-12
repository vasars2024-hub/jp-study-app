// Central widget registry. Each entry is fully self-contained; adding a widget
// means writing a small component and appending one WidgetDef here. WidgetFrame
// and WidgetGallery both read from WIDGETS, so nothing else needs to change.

import type { WidgetDef } from './types';
import {
  DigitalClock,
  AnalogClock,
  CalendarWidget,
  Pomodoro,
  Stopwatch,
  Countdown,
  TodoList,
} from './productivity';
import {
  StudyStreak,
  TodayStudyTime,
  ReadingProgress,
  VocabularyProgress,
  WordOfTheDay,
} from './study';
import { MiniPlayer } from './music';
import { Calculator } from './utility';
import { LevelProgressWidget } from './levels';
import { WorldClock, DailyGoals, HabitTracker, LearningHeatmap } from './more';
import {
  BatteryWidget,
  ClipboardWidget,
  CpuWidget,
  MemoryWidget,
  NetworkWidget,
  RecentLookupsWidget,
} from './system';

export const WIDGETS: WidgetDef[] = [
  // ---- Productivity ----
  { type: 'clock-digital', title: 'Digital Clock', category: 'Productivity', description: 'Current time and date.', defaultSize: { w: 240, h: 140 }, minSize: { w: 160, h: 96 }, component: DigitalClock },
  { type: 'clock-analog', title: 'Analog Clock', category: 'Productivity', description: 'A classic analog clock face.', defaultSize: { w: 200, h: 200 }, minSize: { w: 120, h: 120 }, component: AnalogClock },
  { type: 'calendar', title: 'Calendar', category: 'Productivity', description: 'Month view with today highlighted.', defaultSize: { w: 280, h: 260 }, minSize: { w: 220, h: 220 }, component: CalendarWidget },
  { type: 'pomodoro', title: 'Pomodoro Timer', category: 'Productivity', description: 'Focus / break cycles.', defaultSize: { w: 240, h: 240 }, minSize: { w: 200, h: 220 }, component: Pomodoro },
  { type: 'stopwatch', title: 'Stopwatch', category: 'Productivity', description: 'Count up with start / stop.', defaultSize: { w: 240, h: 140 }, minSize: { w: 180, h: 120 }, component: Stopwatch },
  { type: 'world-clock', title: 'World Clock', category: 'Productivity', description: 'Time across multiple zones.', defaultSize: { w: 260, h: 220 }, minSize: { w: 200, h: 160 }, component: WorldClock },
  { type: 'daily-goals', title: 'Daily Goals', category: 'Productivity', description: 'Track goals with progress.', defaultSize: { w: 280, h: 280 }, minSize: { w: 220, h: 180 }, component: DailyGoals },
  { type: 'habit-tracker', title: 'Habit Tracker', category: 'Productivity', description: 'A 7-day habit grid.', defaultSize: { w: 300, h: 260 }, minSize: { w: 240, h: 180 }, component: HabitTracker },
  { type: 'countdown', title: 'Countdown Timer', category: 'Productivity', description: 'Count down from a set duration.', defaultSize: { w: 260, h: 150 }, minSize: { w: 200, h: 130 }, component: Countdown },
  { type: 'todo', title: 'To-do List', category: 'Productivity', description: 'A quick checklist.', defaultSize: { w: 280, h: 300 }, minSize: { w: 200, h: 180 }, component: TodoList },

  // ---- Study ----
  { type: 'study-streak', title: 'Study Streak', category: 'Study', description: 'Consecutive days studied.', defaultSize: { w: 200, h: 160 }, minSize: { w: 150, h: 130 }, component: StudyStreak },
  { type: 'today-study-time', title: "Today's Study Time", category: 'Study', description: 'Time and characters read today.', defaultSize: { w: 220, h: 160 }, minSize: { w: 160, h: 130 }, component: TodayStudyTime },
  { type: 'reading-progress', title: 'Reading Progress', category: 'Study', description: 'Reading time over the last two weeks.', defaultSize: { w: 300, h: 170 }, minSize: { w: 220, h: 140 }, component: ReadingProgress },
  { type: 'vocab-progress', title: 'Vocabulary Progress', category: 'Study', description: 'Your known / familiar / learning word counts.', defaultSize: { w: 260, h: 200 }, minSize: { w: 200, h: 170 }, component: VocabularyProgress },
  { type: 'level-progress', title: 'JLPT / HSK Progress', category: 'Study', description: 'Progress against your pasted level word lists.', defaultSize: { w: 300, h: 260 }, minSize: { w: 240, h: 180 }, component: LevelProgressWidget },
  { type: 'word-of-the-day', title: 'Word of the Day', category: 'Study', description: 'A saved word, rotated daily.', defaultSize: { w: 260, h: 160 }, minSize: { w: 190, h: 130 }, component: WordOfTheDay },

  // ---- Statistics ----
  { type: 'learning-heatmap', title: 'Learning Heatmap', category: 'Statistics', description: 'Reading activity over the last two weeks.', defaultSize: { w: 300, h: 150 }, minSize: { w: 220, h: 120 }, component: LearningHeatmap },

  // ---- Music ----
  { type: 'mini-player', title: 'Music Player', category: 'Music', description: 'Playback, volume and queue.', defaultSize: { w: 300, h: 200 }, minSize: { w: 240, h: 180 }, component: MiniPlayer },

  // ---- Utility ----
  { type: 'calculator', title: 'Calculator', category: 'Utility', description: 'A simple calculator.', defaultSize: { w: 240, h: 300 }, minSize: { w: 200, h: 260 }, component: Calculator },
  { type: 'recent-lookups', title: 'Recent Lookups', category: 'Utility', description: 'Words you looked up recently.', defaultSize: { w: 240, h: 220 }, minSize: { w: 180, h: 140 }, component: RecentLookupsWidget },
  { type: 'clipboard', title: 'Clipboard', category: 'Utility', description: 'Recent clipboard text (local only).', defaultSize: { w: 260, h: 200 }, minSize: { w: 200, h: 140 }, component: ClipboardWidget },

  // ---- System ----
  { type: 'cpu-usage', title: 'CPU', category: 'System', description: 'Approximate CPU load.', defaultSize: { w: 220, h: 120 }, minSize: { w: 160, h: 96 }, component: CpuWidget },
  { type: 'memory-usage', title: 'Memory', category: 'System', description: 'RAM used vs total.', defaultSize: { w: 220, h: 120 }, minSize: { w: 160, h: 96 }, component: MemoryWidget },
  { type: 'battery', title: 'Battery', category: 'System', description: 'Battery level when available.', defaultSize: { w: 220, h: 120 }, minSize: { w: 160, h: 96 }, component: BatteryWidget },
  { type: 'network', title: 'Network', category: 'System', description: 'Online / offline status.', defaultSize: { w: 200, h: 100 }, minSize: { w: 140, h: 80 }, component: NetworkWidget },
];

const BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export function getWidgetDef(type: string): WidgetDef | undefined {
  return BY_TYPE.get(type);
}

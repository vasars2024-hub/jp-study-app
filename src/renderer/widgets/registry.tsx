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
import {
  ReadingChallengePaceWidget,
  ReadingListProgressWidget,
  ReadingNextUpWidget,
  ReadingRecentlyFinishedWidget,
} from './readingLists';
import { MiniPlayer } from './music';
import { SoundscapeWidget } from './soundscape';
import { ContinueWatchingWidget } from './continueWatching';
import { Calculator } from './utility';
import { LevelProgressWidget } from './levels';
import { WorldClock, DailyGoals, HabitTracker, LearningHeatmap, LearnerMapWidget } from './more';
import {
  BatteryWidget,
  ClipboardWidget,
  CpuWidget,
  MemoryWidget,
  NetworkWidget,
  RecentLookupsWidget,
} from './system';
import { ReviewMeterGadget, WordSlideShowGadget } from './aeroStudyGadgets';

export const WIDGETS: WidgetDef[] = [
  // ---- Productivity ----
  { type: 'clock-digital', titleKey: 'widgets.title.clock-digital', category: 'Productivity', descKey: 'widgets.desc.clock-digital', defaultSize: { w: 240, h: 140 }, minSize: { w: 160, h: 96 }, component: DigitalClock },
  { type: 'clock-analog', titleKey: 'widgets.title.clock-analog', category: 'Productivity', descKey: 'widgets.desc.clock-analog', defaultSize: { w: 200, h: 200 }, minSize: { w: 120, h: 120 }, component: AnalogClock },
  { type: 'calendar', titleKey: 'widgets.title.calendar', category: 'Productivity', descKey: 'widgets.desc.calendar', defaultSize: { w: 280, h: 260 }, minSize: { w: 220, h: 220 }, component: CalendarWidget },
  { type: 'pomodoro', titleKey: 'widgets.title.pomodoro', category: 'Productivity', descKey: 'widgets.desc.pomodoro', defaultSize: { w: 240, h: 240 }, minSize: { w: 200, h: 220 }, component: Pomodoro },
  { type: 'stopwatch', titleKey: 'widgets.title.stopwatch', category: 'Productivity', descKey: 'widgets.desc.stopwatch', defaultSize: { w: 240, h: 140 }, minSize: { w: 180, h: 120 }, component: Stopwatch },
  { type: 'world-clock', titleKey: 'widgets.title.world-clock', category: 'Productivity', descKey: 'widgets.desc.world-clock', defaultSize: { w: 260, h: 220 }, minSize: { w: 200, h: 160 }, component: WorldClock },
  { type: 'daily-goals', titleKey: 'widgets.title.daily-goals', category: 'Productivity', descKey: 'widgets.desc.daily-goals', defaultSize: { w: 280, h: 280 }, minSize: { w: 220, h: 180 }, component: DailyGoals },
  { type: 'habit-tracker', titleKey: 'widgets.title.habit-tracker', category: 'Productivity', descKey: 'widgets.desc.habit-tracker', defaultSize: { w: 300, h: 260 }, minSize: { w: 240, h: 180 }, component: HabitTracker },
  { type: 'countdown', titleKey: 'widgets.title.countdown', category: 'Productivity', descKey: 'widgets.desc.countdown', defaultSize: { w: 260, h: 150 }, minSize: { w: 200, h: 130 }, component: Countdown },
  { type: 'todo', titleKey: 'widgets.title.todo', category: 'Productivity', descKey: 'widgets.desc.todo', defaultSize: { w: 280, h: 300 }, minSize: { w: 200, h: 180 }, component: TodoList },

  // ---- Study ----
  { type: 'study-streak', titleKey: 'widgets.title.study-streak', category: 'Study', descKey: 'widgets.desc.study-streak', defaultSize: { w: 200, h: 160 }, minSize: { w: 150, h: 130 }, component: StudyStreak },
  { type: 'today-study-time', titleKey: 'widgets.title.today-study-time', category: 'Study', descKey: 'widgets.desc.today-study-time', defaultSize: { w: 220, h: 160 }, minSize: { w: 160, h: 130 }, component: TodayStudyTime },
  { type: 'reading-progress', titleKey: 'widgets.title.reading-progress', category: 'Study', descKey: 'widgets.desc.reading-progress', defaultSize: { w: 300, h: 170 }, minSize: { w: 220, h: 140 }, component: ReadingProgress },
  { type: 'vocab-progress', titleKey: 'widgets.title.vocab-progress', category: 'Study', descKey: 'widgets.desc.vocab-progress', defaultSize: { w: 260, h: 200 }, minSize: { w: 200, h: 170 }, component: VocabularyProgress },
  { type: 'level-progress', titleKey: 'widgets.title.level-progress', category: 'Study', descKey: 'widgets.desc.level-progress', defaultSize: { w: 300, h: 260 }, minSize: { w: 240, h: 180 }, component: LevelProgressWidget },
  { type: 'word-of-the-day', titleKey: 'widgets.title.word-of-the-day', category: 'Study', descKey: 'widgets.desc.word-of-the-day', defaultSize: { w: 260, h: 160 }, minSize: { w: 190, h: 130 }, component: WordOfTheDay },
  // Phase 6 slice 7. Both heights are derived, not chosen by eye — the widget's measured
  // 55px row, its 6px gaps, the truncation line, `.widget-body`'s 20px padding and the
  // 30px title bar: 250 fits three rows and the "N more" line, 130 fits one and that line.
  // Eyeballing them is what clipped the first cut's last row in half.
  { type: 'continue-watching', titleKey: 'widgets.title.continue-watching', category: 'Study', descKey: 'widgets.desc.continue-watching', defaultSize: { w: 320, h: 250 }, minSize: { w: 240, h: 130 }, component: ContinueWatchingWidget },
  // Reading Lists §11.2. `reading-list-finished` derives its row count from its
  // own height, so its minimum is the height that still shows one row plus the
  // frame's 30px title bar and `.widget-body`'s padding.
  { type: 'reading-list-progress', titleKey: 'widgets.title.reading-list-progress', category: 'Study', descKey: 'widgets.desc.reading-list-progress', defaultSize: { w: 300, h: 260 }, minSize: { w: 220, h: 200 }, component: ReadingListProgressWidget },
  { type: 'reading-next-up', titleKey: 'widgets.title.reading-next-up', category: 'Study', descKey: 'widgets.desc.reading-next-up', defaultSize: { w: 220, h: 240 }, minSize: { w: 170, h: 180 }, component: ReadingNextUpWidget },
  { type: 'reading-challenge-pace', titleKey: 'widgets.title.reading-challenge-pace', category: 'Study', descKey: 'widgets.desc.reading-challenge-pace', defaultSize: { w: 300, h: 160 }, minSize: { w: 230, h: 130 }, component: ReadingChallengePaceWidget },
  { type: 'reading-list-finished', titleKey: 'widgets.title.reading-list-finished', category: 'Study', descKey: 'widgets.desc.reading-list-finished', defaultSize: { w: 300, h: 200 }, minSize: { w: 220, h: 90 }, component: ReadingRecentlyFinishedWidget },

  // ---- Statistics ----
  { type: 'learning-heatmap', titleKey: 'widgets.title.learning-heatmap', category: 'Statistics', descKey: 'widgets.desc.learning-heatmap', defaultSize: { w: 300, h: 150 }, minSize: { w: 220, h: 120 }, component: LearningHeatmap },
  { type: 'learner-map', titleKey: 'widgets.title.learner-map', category: 'Statistics', descKey: 'widgets.desc.learner-map', defaultSize: { w: 420, h: 280 }, minSize: { w: 280, h: 180 }, component: LearnerMapWidget },
  // Sidebar-gadget-shaped study meters (Aero mechanics); ordinary widgets in every theme.
  { type: 'review-meter', titleKey: 'aeroMech.widget.reviewMeter.title', category: 'Statistics', descKey: 'aeroMech.widget.reviewMeter.desc', defaultSize: { w: 220, h: 150 }, minSize: { w: 170, h: 110 }, component: ReviewMeterGadget },
  { type: 'word-slideshow', titleKey: 'aeroMech.widget.slides.title', category: 'Study', descKey: 'aeroMech.widget.slides.desc', defaultSize: { w: 240, h: 180 }, minSize: { w: 180, h: 130 }, component: WordSlideShowGadget },

  // ---- Music ----
  { type: 'mini-player', titleKey: 'widgets.title.mini-player', category: 'Music', descKey: 'widgets.desc.mini-player', defaultSize: { w: 300, h: 200 }, minSize: { w: 240, h: 180 }, component: MiniPlayer },
  // The list scrolls, so the minimum only has to fit the transport, the scene picker and a couple of rows.
  { type: 'soundscape', titleKey: 'widgets.title.soundscape', category: 'Music', descKey: 'widgets.desc.soundscape', defaultSize: { w: 320, h: 480 }, minSize: { w: 260, h: 240 }, component: SoundscapeWidget },

  // ---- Utility ----
  { type: 'calculator', titleKey: 'widgets.title.calculator', category: 'Utility', descKey: 'widgets.desc.calculator', defaultSize: { w: 240, h: 300 }, minSize: { w: 200, h: 260 }, component: Calculator },
  { type: 'recent-lookups', titleKey: 'widgets.title.recent-lookups', category: 'Utility', descKey: 'widgets.desc.recent-lookups', defaultSize: { w: 240, h: 220 }, minSize: { w: 180, h: 140 }, component: RecentLookupsWidget },
  { type: 'clipboard', titleKey: 'widgets.title.clipboard', category: 'Utility', descKey: 'widgets.desc.clipboard', defaultSize: { w: 260, h: 200 }, minSize: { w: 200, h: 140 }, component: ClipboardWidget },

  // ---- System ----
  { type: 'cpu-usage', titleKey: 'widgets.title.cpu-usage', category: 'System', descKey: 'widgets.desc.cpu-usage', defaultSize: { w: 220, h: 120 }, minSize: { w: 160, h: 96 }, component: CpuWidget },
  { type: 'memory-usage', titleKey: 'widgets.title.memory-usage', category: 'System', descKey: 'widgets.desc.memory-usage', defaultSize: { w: 220, h: 120 }, minSize: { w: 160, h: 96 }, component: MemoryWidget },
  { type: 'battery', titleKey: 'widgets.title.battery', category: 'System', descKey: 'widgets.desc.battery', defaultSize: { w: 220, h: 120 }, minSize: { w: 160, h: 96 }, component: BatteryWidget },
  { type: 'network', titleKey: 'widgets.title.network', category: 'System', descKey: 'widgets.desc.network', defaultSize: { w: 200, h: 100 }, minSize: { w: 140, h: 80 }, component: NetworkWidget },
];

const BY_TYPE = new Map(WIDGETS.map((w) => [w.type, w]));

export function getWidgetDef(type: string): WidgetDef | undefined {
  return BY_TYPE.get(type);
}

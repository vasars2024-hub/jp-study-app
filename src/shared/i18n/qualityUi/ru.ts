// Cross-cutting quality pass — Russian.

import type { Catalog } from '../core';

export const QUALITY_UI_RU: Catalog = {
  // ---- Settings discoverability ----
  'set2.home.recentChanges': 'Недавно изменённые',
  'set2.home.clearRecentChanges': 'Очистить',
  'set2.reset.dialogTitle': 'Сбросить раздел «{section}»?',
  'set2.reset.dialogMessage': 'Все параметры этого раздела вернутся к значениям по умолчанию. Это нельзя отменить.',
  'set2.group.connections': 'ИИ и подключения',

  // ---- Widgets ----
  'wid2.readingSpark.aria': 'Время чтения за последние дни ({days}): {total}',
  'wid2.habit.dayAria': '{habit}: {day}',
  'wid2.heatmap.aria': 'Дней с занятиями: {active} из {days}',

  // ---- Soundscape ----
  'snd2.focus.heading': 'Во время фокуса',
  'snd2.focus.enable': 'Играть во время фокуса',
  'snd2.focus.scene': 'Сцена для фокуса',
  'snd2.focus.currentMix': 'Текущий микс',
  'snd2.focus.pomodoro': 'Рабочие блоки помодоро',
  'snd2.focus.focusMode': 'Режим фокуса',
  'snd2.focus.fadeOnBreak': 'Затухание на перерывах',
  'snd2.focus.today': 'Фокус со звуком сегодня: {minutes} мин',
};

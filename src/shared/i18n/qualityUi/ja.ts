// Cross-cutting quality pass — Japanese.

import type { Catalog } from '../core';

export const QUALITY_UI_JA: Catalog = {
  // ---- Settings discoverability ----
  'set2.home.recentChanges': '最近変更した設定',
  'set2.home.clearRecentChanges': 'クリア',
  'set2.reset.dialogTitle': '「{section}」をリセットしますか？',
  'set2.reset.dialogMessage': 'このセクションのすべての項目が既定値に戻ります。元に戻すことはできません。',
  'set2.group.connections': 'AI と接続',

  // ---- Widgets ----
  'wid2.readingSpark.aria': '過去 {days} 日間の読書時間：{total}',
  'wid2.habit.dayAria': '{habit}、{day}',
  'wid2.heatmap.aria': '過去 {days} 日のうち {active} 日学習',

  // ---- Soundscape ----
  'snd2.focus.heading': '集中中',
  'snd2.focus.enable': '集中中に再生する',
  'snd2.focus.scene': '集中用のシーン',
  'snd2.focus.currentMix': '現在のミックス',
  'snd2.focus.pomodoro': 'ポモドーロの作業時間',
  'snd2.focus.focusMode': 'フォーカスモード',
  'snd2.focus.fadeOnBreak': '休憩でフェードアウト',
  'snd2.focus.today': '今日のサウンド付き集中：{minutes} 分',
};

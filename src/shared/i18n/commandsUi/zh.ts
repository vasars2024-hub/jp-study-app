// Command labels, command palette, keyboard shortcut help and player key names (round-2 keyboard pass). — Chinese (Simplified). See ./en.ts for scope.

import type { Catalog } from '../core';

export const COMMANDS_UI_ZH: Catalog = {
  // ---- shortcut manager: toasts, custom-shortcut descriptions, undo ----
  'shortcut.toast.toolboxGlobal': '工具箱全局快捷键：{error}',
  'shortcut.toast.appToggle': '显示/隐藏 Gum 快捷键：{error}',
  'shortcut.toast.appRestart': '完全重启快捷键：{error}',
  'shortcut.toast.startupHelper': '启动助手：{error}',
  'shortcut.custom.opens': '打开{name}',
  'shortcut.custom.runs': '运行“{name}”',
  'shortcut.custom.stack': '依次运行：{names}',
  'shortcut.custom.dispatches': '发送 {event}',
  'shortcut.custom.dispatchesDetail': '发送 {event}（{detail}）',
  'shortcut.undo.nothing': '没有可撤销的操作',
  'shortcut.undo.done': '已撤销：{action}',
  'shortcut.undo.doneGeneric': '已撤销',
  // ---- Settings > Study: subtitle style (the searchable door to the player's own settings) ----
  'playerUi.subtitleStyle.title': '字幕样式',
  'playerUi.subtitleStyle.desc': '字幕在视频播放器中的外观',
  'playerUi.subtitleStyle.size': '字幕大小',
  'playerUi.subtitleStyle.px': '{size} 像素',
  'playerUi.subtitleStyle.more':
    '位置和背景在“观看”>“媒体设置”中调整。颜色、字体和描边在视频播放时，于播放器的“学习”中调整。',
  'playerUi.subtitleStyle.open': '打开播放器字幕设置',
};

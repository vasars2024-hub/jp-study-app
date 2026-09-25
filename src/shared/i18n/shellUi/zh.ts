// Desktop shell chrome: Start menu, taskbar, windows, quick settings, toasts, calendar and theme editor (round-2 a11y/visual pass). — Chinese (Simplified). See ./en.ts for scope.

import type { Catalog } from '../core';

export const SHELL_UI_ZH: Catalog = {
  'shell.undo': '撤销',
  'shell.window.reopen': '重新打开{name}',

  'shell.widgets.reset.title': '要重置小组件布局吗？',
  'shell.widgets.reset.message': {
    other: '这会从桌面移除全部 {count} 个小组件。之后可以立即撤销。',
  },
  'shell.widgets.reset.confirm': '重置布局',
  'shell.widgets.reset.done': '已重置小组件布局',
  'shell.widgets.reset.restored': '已恢复小组件布局',

  'shell.startHere.title': '从这里开始',
  'shell.startHere.lead': '选一项开始吧。',
  'shell.startHere.videos': '添加视频',
  'shell.startHere.videosHint': '带字幕观看并收集生词',
  'shell.startHere.deck': '导入卡组',
  'shell.startHere.deckHint': '导入 Anki 或 CSV 卡组',
  'shell.startHere.book': '打开一本书',
  'shell.startHere.bookHint': '阅读 EPUB，随时查词',
  'shell.startHere.dismiss': '关闭',

  'shell.unit.byte': 'B',
  'shell.unit.kb': 'KB',
  'shell.unit.mb': 'MB',
  'shell.unit.gb': 'GB',
  'shell.unit.tb': 'TB',

  'shell.themeToken.accent-weak': '强调色（浅）',
  'shell.themeToken.bg': '背景',
  'shell.themeToken.panel': '面板',
  'shell.themeToken.panel-2': '面板（上层）',
  'shell.themeToken.sidebar': '侧边栏',
  'shell.themeToken.text': '文字',
  'shell.themeToken.muted': '次要文字',
  'shell.themeToken.border': '边框',
  'shell.themeToken.glass-tint': '玻璃色调',
  'shell.themeToken.glass-border': '玻璃边缘',
  'shell.themeToken.font-display': '标题字体',
  'shell.themeToken.font-mono': '等宽字体',
  'shell.themeToken.font-size-2xs': '字号：最小',
  'shell.themeToken.font-size-xs': '字号：特小',
  'shell.themeToken.font-size-sm': '字号：小',
  'shell.themeToken.font-size-md': '字号：中',
  'shell.themeToken.font-size-lg': '字号：大',
  'shell.themeToken.line-height-normal': '行高',
  'shell.themeToken.control-radius': '控件圆角',
  'shell.themeToken.glass-blur': '玻璃模糊',
  'shell.themeToken.motion-duration': '动画时长',
  'shell.themeToken.dur-fast': '快速过渡',
  'shell.themeToken.dur-normal': '常规过渡',
  'shell.themeToken.scrollbar-size': '滚动条宽度',
};

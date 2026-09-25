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
};

// Command labels, command palette, keyboard shortcut help and player key names (round-2 keyboard pass). — Japanese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const COMMANDS_UI_JA: Catalog = {
  // ---- shortcut manager: toasts, custom-shortcut descriptions, undo ----
  'shortcut.toast.toolboxGlobal': 'ツールボックスのグローバルショートカット: {error}',
  'shortcut.toast.appToggle': 'Gum の表示/非表示ショートカット: {error}',
  'shortcut.toast.appRestart': '完全再起動のショートカット: {error}',
  'shortcut.toast.startupHelper': 'スタートアップヘルパー: {error}',
  'shortcut.custom.opens': '{name} を開く',
  'shortcut.custom.runs': '「{name}」を実行',
  'shortcut.custom.stack': '連続実行: {names}',
  'shortcut.custom.dispatches': '{event} を送信',
  'shortcut.custom.dispatchesDetail': '{event} を送信（{detail}）',
  'shortcut.undo.nothing': '元に戻す操作はありません',
  'shortcut.undo.done': '元に戻しました: {action}',
  'shortcut.undo.doneGeneric': '元に戻しました',
};

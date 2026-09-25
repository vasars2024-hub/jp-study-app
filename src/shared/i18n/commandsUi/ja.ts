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
  // ---- Settings > Study: subtitle style (the searchable door to the player's own settings) ----
  'playerUi.subtitleStyle.title': '字幕のスタイル',
  'playerUi.subtitleStyle.desc': '動画プレーヤーでの字幕の見た目',
  'playerUi.subtitleStyle.size': '字幕のサイズ',
  'playerUi.subtitleStyle.px': '{size} ピクセル',
  'playerUi.subtitleStyle.more':
    '位置と背景は「視聴」>「メディア設定」で変更できます。色・フォント・縁取りは、動画の再生中にプレーヤーの「学習」で変更できます。',
  'playerUi.subtitleStyle.open': 'プレーヤーの字幕設定を開く',
};

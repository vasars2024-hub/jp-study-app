// Desktop shell chrome: Start menu, taskbar, windows, quick settings, toasts, calendar and theme editor (round-2 a11y/visual pass). — Japanese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const SHELL_UI_JA: Catalog = {
  'shell.undo': '元に戻す',
  'shell.window.reopen': '{name} をもう一度開く',

  'shell.widgets.reset.title': 'ウィジェットの配置をリセットしますか？',
  'shell.widgets.reset.message': {
    other: 'デスクトップから {count} 個のウィジェットをすべて削除します。直後なら元に戻せます。',
  },
  'shell.widgets.reset.confirm': 'リセット',
  'shell.widgets.reset.done': 'ウィジェットの配置をリセットしました',
  'shell.widgets.reset.restored': 'ウィジェットの配置を元に戻しました',

  'shell.startHere.title': 'ここから始める',
  'shell.startHere.lead': 'どれか一つから始めましょう。',
  'shell.startHere.videos': '動画を追加',
  'shell.startHere.videosHint': '字幕付きで観て、新しい単語を保存',
  'shell.startHere.deck': 'デッキを読み込む',
  'shell.startHere.deckHint': 'Anki または CSV のデッキを取り込む',
  'shell.startHere.book': '本を開く',
  'shell.startHere.bookHint': 'EPUB を読みながらすぐに辞書を引く',
  'shell.startHere.dismiss': '閉じる',

  'shell.unit.byte': 'B',
  'shell.unit.kb': 'KB',
  'shell.unit.mb': 'MB',
  'shell.unit.gb': 'GB',
  'shell.unit.tb': 'TB',

  'shell.themeToken.accent-weak': 'アクセント（淡）',
  'shell.themeToken.bg': '背景',
  'shell.themeToken.panel': 'パネル',
  'shell.themeToken.panel-2': 'パネル（上層）',
  'shell.themeToken.sidebar': 'サイドバー',
  'shell.themeToken.text': '文字',
  'shell.themeToken.muted': '補助テキスト',
  'shell.themeToken.border': '境界線',
  'shell.themeToken.glass-tint': 'ガラスの色合い',
  'shell.themeToken.glass-border': 'ガラスの縁',
  'shell.themeToken.font-display': '見出しフォント',
  'shell.themeToken.font-mono': '等幅フォント',
  'shell.themeToken.font-size-2xs': '文字サイズ：最小',
  'shell.themeToken.font-size-xs': '文字サイズ：極小',
  'shell.themeToken.font-size-sm': '文字サイズ：小',
  'shell.themeToken.font-size-md': '文字サイズ：中',
  'shell.themeToken.font-size-lg': '文字サイズ：大',
  'shell.themeToken.line-height-normal': '行の高さ',
  'shell.themeToken.control-radius': 'コントロールの角丸',
  'shell.themeToken.glass-blur': 'ガラスのぼかし',
  'shell.themeToken.motion-duration': 'アニメーションの長さ',
  'shell.themeToken.dur-fast': '速いトランジション',
  'shell.themeToken.dur-normal': '通常のトランジション',
  'shell.themeToken.scrollbar-size': 'スクロールバーの幅',
};

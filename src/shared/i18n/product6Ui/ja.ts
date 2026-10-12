// Product pass 6: Soundscape engine (snd6.) and widget polish (wid6.) — ja.

import type { Catalog } from '../core';

export const PRODUCT6_UI_JA: Catalog = {
  // ---- Soundscape: per-layer tone and pan ----
  'snd6.shape.open': '音色と定位：{name}',
  'snd6.shape.openShaped': '音色と定位：{name}（調整済み）',
  'snd6.shape.groupOf': '{name}の音色と定位',
  'snd6.shape.tone': '音色',
  'snd6.shape.pan': '定位',
  'snd6.shape.toneOf': '{name}の音色',
  'snd6.shape.panOf': '{name}の定位',
  'snd6.shape.toneNeutral': '標準',
  'snd6.shape.darker': '暗め {percent}%',
  'snd6.shape.brighter': '明るめ {percent}%',
  'snd6.shape.centre': '中央',
  'snd6.shape.left': '左 {percent}%',
  'snd6.shape.right': '右 {percent}%',
  'snd6.shape.reset': '音色と定位を戻す',

  // ---- Soundscape: saved mixes as a file ----
  'snd6.mixes.heading': 'ミックスのファイル',
  'snd6.mixes.export': '書き出し',
  'snd6.mixes.copy': 'コピー',
  'snd6.mixes.import': '読み込み',
  'snd6.mixes.paste': '貼り付け',
  'snd6.mixes.pasteLabel': '読み込むミックス',
  'snd6.mixes.pastePlaceholder': '書き出したミックスをここに貼り付け',
  'snd6.mixes.importPasted': '貼り付けたミックスを読み込む',
  'snd6.mixes.exported': '{name} を保存しました',
  'snd6.mixes.exportFailed': 'ファイルを保存できませんでした。',
  'snd6.mixes.copied': '{count} 件のミックスをコピーしました。',
  'snd6.mixes.copyFailed': 'クリップボードにコピーできませんでした。',
  'snd6.mixes.added': '{count} 件のミックスを追加しました。',
  'snd6.mixes.duplicates': '{count} 件は保存済みでした。',
  'snd6.mixes.overflow': 'あと {count} 件は入りません（上限 {max} 件）。',
  'snd6.mixes.importFailed': '読み込めませんでした：{error}',
  'snd6.mixes.error.notJson': 'JSON ファイルではありません。',
  'snd6.mixes.error.notMixes': 'サウンドスケープのミックスファイルではありません。',
  'snd6.mixes.error.empty': '音の入ったミックスがありません。',

  // ---- Soundscape: ducking for speech and video ----
  'snd6.duck.speech': '音声や動画の再生中は下げる',
  'snd6.duck.nowSpeech': '音声・動画の再生中のため下げています',
  'snd6.duck.nowMusic': '音楽の再生中のため下げています',

  // ---- Widgets: gallery preview ----
  'wid6.gallery.preview': 'プレビュー',
  'wid6.gallery.previewOf': '{name} のプレビュー',
  'wid6.gallery.defaultSize': '既定のサイズ {w} × {h}',
  'wid6.gallery.favoriteNamed': '{name} をお気に入りに追加',
  'wid6.gallery.unfavoriteNamed': '{name} をお気に入りから外す',
  'wid6.gallery.addNamed': '{name} を追加',
  'wid6.gallery.addAnotherNamed': '{name} をもう一つ追加',

  // ---- Widgets: alignment guides ----
  'wid6.drag.hint': 'ドラッグで移動。端がほかのウィジェットに揃います。Alt を押すと自由に配置できます。',
  'wid6.drag.hintAero': '{drag}。端がほかのガジェットに揃います。Alt を押すと自由に配置できます。',
  'wid6.guides.readout': '位置 X:{x} Y:{y}',
  'wid6.guides.size': 'サイズ {w}×{h}',
};

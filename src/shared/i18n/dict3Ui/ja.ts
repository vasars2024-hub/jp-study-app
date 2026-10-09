// 辞書（Yomitan 同等）：活用の追跡、結果の表示形式、音声ソース、JMdict 優先度、
// 複数デッキの「Anki にあり」。キーは dict3.。

import type { Catalog } from '../core';

export const DICT3_UI_JA: Catalog = {
  // ---- 活用の追跡 ----
  'dict3.trace.aria': '{source} を {term} までたどった経路：{steps}',
  'dict3.trace.openGrammar': '「{step}」を文法エクスプローラーで開く',

  // ---- JMdict 優先度 ----
  'dict3.prio.title': 'JMdict の単語リスト：',
  'dict3.prio.news1': '毎日新聞の頻度リスト、上位 12,000 語',
  'dict3.prio.news2': '毎日新聞の頻度リスト、12,001〜24,000 位',
  'dict3.prio.ichi1': '「一万語語彙分類集」（よく使う約 1 万語）',
  'dict3.prio.ichi2': '「一万語語彙分類集」収録だが新聞ではあまり使われない',
  'dict3.prio.spec1': 'JMdict の編集者が一般的と判断した語',
  'dict3.prio.spec2': 'JMdict の編集者がやや一般的と判断した語',
  'dict3.prio.gai1': 'よく使われる外来語',
  'dict3.prio.gai2': 'あまり使われない外来語',
  'dict3.prio.nf': '新聞頻度の順位 {from}〜{to}',

  // ---- Anki にあり ----
  'dict3.presence.ankiWhere': 'すでに Anki にあります：{targets}',

  // ---- セクション ----
  'dict3.sections.showMore': {
    other: 'ほかの辞書をあと {count} 件表示',
  },
  'dict3.sections.showFewer': 'ほかの辞書を隠す',

  // ---- 音声の選択 ----
  'dict3.audio.picker': '{word} の音声ソース',
  'dict3.audio.auto': '自動',
  'dict3.audio.optionHas': '{name}（あり）',
  'dict3.audio.optionMissing': '{name}（なし）',

  // ---- 設定 ----
  'dict3.settings.layoutTitle': '結果の表示形式',
  'dict3.settings.layoutIntro':
    '複数の辞書に載っている語の表示方法です。アプリ、ポップアップ、ブラウザー拡張機能に共通です。',
  'dict3.settings.grouped': '辞書ごとにまとめる（辞書ごとのセクション）',
  'dict3.settings.merged': '一つのリストに統合（各意味に辞書名を表示）',
  'dict3.settings.collapse': '最初の辞書以外は必要になるまで折りたたむ',
  'dict3.settings.dragHint': '辞書をドラッグするか矢印で並べ替えます。',
  'dict3.settings.audioTitle': '音声ソース',
  'dict3.settings.audioIntro':
    'この順に発音を探し、録音がないソースは次のソースに切り替えます。項目ごとに一つのソースを選ぶこともできます。',
  'dict3.settings.audioUse': 'この音声ソースを使う',
  'dict3.settings.audioCdn': 'JapanesePod101 の録音。再生したときだけ取得し、その後はオフラインで使えます',
  'dict3.settings.audioMissingFolder': 'フォルダーが見つかりません',
  'dict3.settings.audioFiles': {
    other: '録音 {files} 件',
  },
  'dict3.settings.audioUp': '先に試す',
  'dict3.settings.audioDown': '後で試す',
  'dict3.settings.audioAddFolder': 'ローカル音声フォルダーを追加',
  'dict3.settings.audioLayouts':
    'ローカルフォルダーは読み取るだけで、ダウンロードはしません。「読み - 語.mp3」（JapanesePod101 形式）や、任意のサブフォルダー内の「語.mp3」（Forvo 形式）を認識します。対応形式：mp3、ogg、opus、m4a、aac、wav、flac。',
};

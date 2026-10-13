// 辞書ポップアップ（Yomitan/10ten 同等・第 4 弾）：カーソル位置からの最長一致、
// 入れ子の検索、キーボード操作、複合語を構成語で評価、追加ボタンの Anki 重複表示。
// キーは dict4.。

import type { Catalog } from '../core';

export const DICT4_UI_JA: Catalog = {
  // ---- 最長一致 ----
  'dict4.scan.group': '調べる語',
  'dict4.scan.pick': '{word} を調べる',

  // ---- 入れ子の検索 ----
  'dict4.nested.back': '{word} に戻る',

  // ---- 複合語を構成語で評価 ----
  'dict4.parts.label': '構成語',
  'dict4.parts.levelTitle': '{word}：{level}',
  'dict4.parts.combinedTitle':
    'リーダーが別々に色分けする構成語ごとに評価します。表示されるのは最も習熟度の低い構成語のレベルです。',
  'dict4.knowledge.partsAction': '{word} は構成語（{parts}）で評価されます。クリックするとすべて「{next}」にします。',

  // ---- キーボード ----
  'dict4.keys.title': 'キー：1〜4 で評価 · P で音声 · ↓ ↑ で項目を移動 · Backspace で戻る',

  // ---- Anki 重複 ----
  'dict4.anki.addAgain': '+ もう一度追加',
  'dict4.anki.addAgainTitle': 'この語はすでに Anki にあります。もう一度追加すると 2 枚目のノートになります。',
};

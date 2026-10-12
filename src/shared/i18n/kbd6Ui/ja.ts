// Product pass 6: key sequences, palette scopes and search-by-key (kbd6.) — ja.

import type { Catalog } from '../core';

export const KBD6_UI_JA: Catalog = {
  'kbd6.keys.sequence': '{first} の次に {next}',
  'kbd6.seq.waiting': '{keys} を押しました。次のキーを待っています…',
  'kbd6.seq.noCommand': '{keys} はショートカットではありません。',
  'kbd6.palette.group.here': 'この画面',
  'kbd6.palette.group.keys': '{keys} に割り当て済み',
  'kbd6.palette.worksHere': 'ここで使えます',
  'kbd6.palette.switchTo': '先に「{place}」に切り替え',
  'kbd6.palette.openFirst': '先に「{place}」を開く',
  'kbd6.conflict.startsTheirs': '{lead} は {name} のシーケンス {sequence} の始まりです',
  'kbd6.conflict.startsMine': '{name} が使う {lead} は、このシーケンスの始まりです',
  'kbd6.settings.sequenceStart': 'シーケンスの最初のキーを押してください…',
  'kbd6.settings.stepsSoFar': '{keys} … 次のキーを押すか、少し待つと保存されます',
  'kbd6.settings.recordSequence': 'シーケンスを記録',
  'kbd6.settings.recordSequenceHint': 'Ctrl+K のあとに S のように続けて押すキー。少し待つと保存、Esc で取り消し。',
  'kbd6.settings.findByKeys': 'キーで検索',
  'kbd6.settings.findByKeysHint': 'ショートカットを押すと、その割り当て先を表示します',
  'kbd6.settings.findListening': '調べたいキーを押して、少し待ってください。Esc で取り消し。',
  'kbd6.settings.findListeningShort': '入力待ち…',
  'kbd6.settings.keyFilter': 'キー: {keys}',
  'kbd6.settings.clearKeyFilter': 'キーの絞り込み（{keys}）を解除',
  'kbd6.settings.keyFilterCount': { other: '{keys} を使うショートカット: {count} 件' },
};

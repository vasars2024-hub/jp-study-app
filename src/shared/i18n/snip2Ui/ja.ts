// Snip to cards, round 2 (snip2.) — Japanese.

import type { Catalog } from '../core';

export const SNIP2_UI_JA: Catalog = {
  'snip2.notice.title': 'スニップでカード作成はオンです',
  'snip2.notice.body': 'Win+Shift+S で切り取った画像はすべて読み取られ、新しい単語がカードになります。このまま使うか、オフにしてください（トレイやスニップアプリから再びオンにできます）。',
  'snip2.notice.turnOff': 'オフにする',
  'snip2.notice.keep': 'オンのまま',
  'snip2.notice.turnedOff': 'スニップでカード作成をオフにしました。トレイかスニップアプリから再びオンにできます。',

  'snip2.toast.review': { other: '確認待ちの新しい単語が {count} 語あります。' },
  'snip2.toast.reviewUnsure': { other: 'OCR の確信度が低いため（{percent}%）、追加する前に {count} 語を確認してください。' },
  'snip2.toast.reviewAction': '確認する',
  'snip2.toast.mergedOnly': { other: '新しい単語はありません。この文を既存のカード {count} 枚に例文として追加しました。' },
  'snip2.toast.mergedToo': { other: '既存のカード {count} 枚にも例文を追加しました。' },
  'snip2.toast.examplesRemoved': { other: 'カード {count} 枚に追加した例文を削除しました。' },
  'snip2.toast.undoLater': 'あと {seconds} 秒で閉じます。その後もスニップから元に戻せます。',
  'snip2.toast.readBy': '読み取り：{engine}',
  'snip2.toast.readByConfidence': '読み取り：{engine}（{percent}%）',

  'snip2.review.manual': '確認モード：まだ何も追加していません。追加したい単語にチェックを入れ（誤読は修正して）、追加してください。',
  'snip2.review.uncertain': 'OCR の確信度が低いため（{percent}%）、何も追加していません。単語を確認し、誤読を修正してから、必要なものを追加してください。',
  'snip2.review.addSelected': { other: '選択した {count} 語を追加' },
  'snip2.review.select': '{word} を選ぶ',
  'snip2.review.pickColumn': '選択',
  'snip2.history.review': { other: '確認待ち {count}' },
  'snip2.history.via': '{engine} で読み取り',

  'snip2.word.edit': '{word} を修正',
  'snip2.word.editShort': '修正',
  'snip2.word.formWord': '単語（辞書形）',
  'snip2.word.formReading': '読み',
  'snip2.word.save': '保存',
  'snip2.word.cancel': 'キャンセル',
  'snip2.word.edited': '修正済み',
  'snip2.word.merge': 'この文を {word} のカードに例文として追加',
  'snip2.word.mergeShort': '例文を追加',
  'snip2.word.unmerge': 'このスニップが {word} のカードに追加した例文を削除',
  'snip2.wstatus.merged': '例文を追加済み',

  'snip2.text.fix': 'テキストを修正',
  'snip2.text.label': '修正したテキスト',
  'snip2.text.reanalyze': '単語を読み直す',
  'snip2.text.undoFirst': 'テキストを修正するには、先にこのスニップを元に戻してください（カードと単語を一致させるため）。',
  'snip2.text.original': 'OCR の読み取り：{text}',

  'snip2.deck.label': 'このスニップのデッキ',
  'snip2.deck.placeholder': '既定：{deck}',
  'snip2.deck.hint': 'このスニップで追加するカードはここに入り、追加済みのカードもここへ移動します。',

  'snip2.detail.undoExamples': { other: '元に戻す：カード {count} 枚から例文を削除' },
  'snip2.detail.undoHint': 'このスニップが履歴にある間は、ここからいつでも元に戻せます。',

  'snip2.settings.autoAddHint': 'オフ：確認モード。スニップごとに新しい単語を一覧にし、修正・選択してから追加します。OCR の確信度が低い読み取りは常に確認待ちになります。',
  'snip2.settings.mergeExisting': 'すでにカードがある単語には、この文を例文として追加する',
};

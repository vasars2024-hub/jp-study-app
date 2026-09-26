// Novel/manga reader, dictionary popup and reader mining chrome (round-2 reader pass). — Japanese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const READER_UI_JA: Catalog = {
  'readerUi.dictPopup.aria': '辞書: {query}',
  'readerUi.dictPopup.levels': 'この単語の習熟度',
  'readerUi.dictPopup.mine': '収集',
  'reader.pdf.page': '{page} ページ',
  'reader.pdf.blankPage': '（{page} ページには文字がありません）',
  'readerUi.dictPopup.mineTitle': 'この単語と例文をリーダーのコレクションに保存',
  'readerUi.lookup.noSelection': '単語を選択するか本文の単語にポインターを合わせてから、もう一度ショートカットを押すと調べられます。',
  'readerUi.gloss.langs': '語義の言語',
  'readerUi.gloss.otherHidden': 'ほかの言語の語義は非表示です。上で言語をオンにすると表示されます。',
  'readerUi.translate.popupAria': '翻訳: {text}',
  'readerUi.translate.preparing': '翻訳を準備中…',
  'readerUi.translate.loadingModel': 'モデルを読み込み中… {pct}%',
  'readerUi.translate.translating': '翻訳中…',
  'readerUi.translate.to': '翻訳先',
  'readerUi.translate.openAiSettings': 'AI 設定を開く',
  'readerUi.study.askAgent': 'エージェントに質問',
  'readerUi.study.askPassage': '段落について質問',
  'readerUi.study.collection': 'コレクション',
  'readerUi.manga.ocrAuto': '自動',
  'readerUi.manga.ocrAutoTitle': 'ページや枠の形から縦書き・横書きを判断して読み取ります',
  'readerUi.manga.drawBox': '枠で囲む',
  'readerUi.manga.drawBoxTitle': 'ページ上の文字をドラッグで囲んで読み取ります',
  'readerUi.manga.drawBoxHint': '読み取りたい文字をドラッグで囲んでください。',
  'readerUi.manga.handwriting': '手書き',
  'readerUi.manga.handwritingTitle': '文字を手書きして調べます',
};

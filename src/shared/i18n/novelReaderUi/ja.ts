// Novel reader extras (search, link import, coded errors) — Japanese. See ./en.ts.
import type { Catalog } from '../core';

export const NOVEL_READER_UI_JA: Catalog = {
  'novelReaderUi.translate.autoFailed': '自動翻訳に失敗しました。「翻訳」を押してもう一度お試しください。',
  'novelReaderUi.link.importing': 'ページを本として取り込んでいます…',
  'novelReaderUi.link.saved': 'ライブラリに保存しました: {title}',
  'novelReaderUi.link.openedInBrowser': '{reason} 代わりにブラウザでページを開きました。',
  'novelReaderUi.import.noArticle': 'このページには読める記事が見つからないため、取り込めません。',
  'novelReaderUi.import.failed': 'このページを取り込めませんでした。少し待ってからもう一度お試しください。',
  'novelReaderUi.import.wikiFailed': 'Wikipediaから記事が届きませんでした。少し待ってからもう一度お試しください。',
  'novelReaderUi.novels.jitenNetwork': 'Jitenに接続できませんでした。接続を確認してもう一度お試しください。',
  'novelReaderUi.novels.jitenHttp': 'Jitenがエラー {status} を返しました。時間をおいてもう一度お試しください。',
  'novelReaderUi.novels.jitenFailed': 'Jitenのカタログを読み込めませんでした。時間をおいてもう一度お試しください。',
  'novelReaderUi.novels.sourcesFailed': '取得元の設定を保存できませんでした。アドレスとキーを確認してもう一度お試しください。',
  'novelReaderUi.search.open': '本の中を検索 (Ctrl+F)',
  'novelReaderUi.search.aria': 'この本の中を検索',
  'novelReaderUi.search.placeholder': 'この本を検索',
  'novelReaderUi.search.prev': '前の一致',
  'novelReaderUi.search.next': '次の一致',
  'novelReaderUi.search.count': '{total}件中{current}件目',
  'novelReaderUi.search.none': '一致なし',
  'novelReaderUi.search.capped': '最初の{max}件だけを表示しています。',
  'novelReaderUi.search.ignoreWidth': 'かな・全半角を区別しない',
  'novelReaderUi.search.ignoreWidthTitle': 'ひらがなとカタカナ、全角と半角の英数字を同じ文字として検索します',
  'novelReaderUi.search.results': '一致箇所',
  'novelReaderUi.search.chapter': '第{n}部',
};

// Immersion browser strings (coded Reader Mode errors, read-aloud) — Japanese. See ./en.ts.
import type { Catalog } from '../core';

export const IMMERSION_UI_JA: Catalog = {
  'immersionUi.error.noArticle': 'このページには読める記事が見つかりませんでした。そのまま読むにはライブモードに切り替えてください。',
  'immersionUi.error.timeout': 'ページの読み込みに時間がかかりすぎました。接続を確認して、もう一度お試しください。',
  'immersionUi.error.http': 'サイトがエラー {status} を返したため、表示できる記事がありません。',
  'immersionUi.error.notHtml': 'このアドレスはウェブページではなくファイルのため、リーダーモードでは表示できません。',
  'immersionUi.error.badUrl': 'http:// または https:// で始まる完全なアドレスを入力してください。',
  'immersionUi.error.network': 'ページに接続できませんでした。接続とアドレスを確認して、もう一度お試しください。',
  'immersionUi.error.failed': 'このページを読み込めませんでした。もう一度試すか、ライブモードに切り替えてください。',

  'immersionUi.readAloud.aria': '読み上げ',
  'immersionUi.readAloud.article': '読み上げ',
  'immersionUi.readAloud.articleTitle': '記事全体を一文ずつ読み上げます',
  'immersionUi.readAloud.paragraph': 'この段落',
  'immersionUi.readAloud.paragraphTitle': '今読んでいる段落だけを読み上げます（テキストを選択した段落、なければ画面上の最初の段落）',
  'immersionUi.readAloud.pause': '一時停止',
  'immersionUi.readAloud.resume': '再開',
  'immersionUi.readAloud.stop': '停止',
  'immersionUi.readAloud.speed': '読み上げ速度',
  'immersionUi.readAloud.loading': '音声を準備しています…',
  'immersionUi.readAloud.progress': '{total} 文中 {current} 文目',
  'immersionUi.readAloud.nothing': 'このページには読み上げるテキストがありません。',
  'immersionUi.readAloud.noVoice.ja': 'オフラインの日本語音声がインストールされていません。Windows の「設定」>「時刻と言語」>「音声認識」で「音声を追加」を選び、日本語を追加してからもう一度お試しください。',
  'immersionUi.readAloud.noVoice.zh': 'オフラインの中国語音声がインストールされていません。Windows の「設定」>「時刻と言語」>「音声認識」で「音声を追加」を選び、中国語（簡体字）を追加してからもう一度お試しください。',
  'immersionUi.readAloud.noVoice.ru': 'オフラインのロシア語音声がインストールされていません。Windows の「設定」>「時刻と言語」>「音声認識」で「音声を追加」を選び、ロシア語を追加してからもう一度お試しください。',
  'immersionUi.readAloud.noVoice.en': 'オフラインの英語音声がインストールされていません。Windows の「設定」>「時刻と言語」>「音声認識」で「音声を追加」を選び、英語を追加してからもう一度お試しください。',
  'immersionUi.readAloud.noSynthesizer': 'このパソコンにはオフラインの音声合成エンジンがないため、記事を読み上げられません。',
  'immersionUi.readAloud.failed': 'この文を読み上げられませんでした。「読み上げ」を押してもう一度お試しください。',
};

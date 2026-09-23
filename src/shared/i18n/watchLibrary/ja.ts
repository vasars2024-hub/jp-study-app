// Watch-tracking library — Japanese. See ./en.ts.
import type { Catalog } from '../core';

export const WATCH_LIBRARY_JA: Catalog = {
  'watchLibrary.status.watching': '視聴中',
  'watchLibrary.status.completed': '視聴完了',
  'watchLibrary.status.plan': '視聴予定',
  'watchLibrary.status.on_hold': '一時中断',
  'watchLibrary.status.dropped': '視聴中止',
  'watchLibrary.status.rewatching': '再視聴中',

  'watchLibrary.kind.anime': 'アニメ',
  'watchLibrary.kind.tv': 'テレビシリーズ',
  'watchLibrary.kind.film': '映画',
  'watchLibrary.kind.other': 'その他',

  'watchLibrary.source.mal-export': 'MyAnimeList のエクスポート',
  'watchLibrary.source.mal-sync': 'MyAnimeList 同期',
  'watchLibrary.source.letterboxd': 'Letterboxd のエクスポート',
  'watchLibrary.source.local': 'アプリで視聴',
  'watchLibrary.source.manual': '手動で追加',

  'watchLibrary.sort.title': 'タイトル',
  'watchLibrary.sort.year': '年',
  'watchLibrary.sort.score': '自分の評価',
  'watchLibrary.sort.added': '追加日',
  'watchLibrary.sort.lastWatched': '最終視聴日',
  'watchLibrary.sort.finished': '視聴完了日',
  'watchLibrary.sort.progress': '進捗',
  'watchLibrary.sort.runtime': '再生時間',
  'watchLibrary.sort.updated': '最終更新',

  'watchLibrary.import.dialogTitle': 'MyAnimeList または Letterboxd のエクスポートを読み込む',
  'watchLibrary.import.filterExports': 'MyAnimeList と Letterboxd のエクスポート',
  'watchLibrary.import.filterAll': 'すべてのファイル',
  'watchLibrary.import.error.notFound': 'ファイルが見つかりません。',
  'watchLibrary.import.error.unreadable': 'ファイルを読み込めませんでした: {detail}',
  'watchLibrary.import.error.unrecognized':
    'MyAnimeList または Letterboxd のエクスポートではありません。MyAnimeList の animelist .xml.gz ファイル、または Letterboxd のエクスポート .zip を選んでください。',
  'watchLibrary.import.error.empty': 'エクスポートにタイトルが含まれていません。',
  'watchLibrary.import.error.mangaOnly':
    'これは MyAnimeList の漫画リストです。視聴ライブラリに読み込めるのはアニメリストだけです。',
  'watchLibrary.import.error.tooLarge': 'リストのエクスポートとしてはファイルが大きすぎます（{size}）。',

  'watchLibrary.error.notFound': 'そのタイトルはもうライブラリにありません。',
  'watchLibrary.error.unknownMedia': 'そのファイルはメディアライブラリにありません。',
  'watchLibrary.error.notTrackable': '記録できるのはアニメ、テレビ番組、映画のファイルだけです。',
  'watchLibrary.error.invalidTitle': 'タイトルには名前と種類が必要です。',
  'watchLibrary.error.addFailed': 'タイトルを追加できませんでした。',
};

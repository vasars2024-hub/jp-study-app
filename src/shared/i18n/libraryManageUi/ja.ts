import type { Catalog } from '../core';

export const LIBRARY_MANAGE_UI_JA: Catalog = {
  // Import job
  'libManage.menu.importBooksFolder': '本のフォルダーを取り込む…',
  'libManage.btn.importBooksFolder': '本のフォルダーを取り込む',
  'libManage.dialog.importBooksFolder': 'フォルダー内の本とマンガのアーカイブをすべて取り込む',
  'libManage.import.aria': 'ライブラリの取り込み',
  'libManage.import.running': '取り込み中 {done} / {total}',
  'libManage.import.current': '処理中: {name}',
  'libManage.import.stop': '停止',
  'libManage.import.stopping': 'このファイルの後で停止します…',
  'libManage.import.finished': '取り込みが完了しました。',
  'libManage.import.stopped': '取り込みを停止しました。',
  'libManage.import.added': '追加: {count}',
  'libManage.import.duplicates': 'すでにライブラリにある: {count}',
  'libManage.import.failed': '取り込めなかった: {count}',
  'libManage.import.left': '未処理: {count}',
  'libManage.import.failuresTitle': '取り込めなかったファイル',
  'libManage.import.fail.unreadable': '{name} — 読み込めませんでした',
  'libManage.import.fail.noPages': '{name} — アーカイブに画像がありません',
  'libManage.import.fail.storageFull': '{name} — ディスクがいっぱいです',
  'libManage.import.fail.badFile': '{name} — 有効な本やアーカイブではありません',
  'libManage.import.dismiss': '閉じる',
  'libManage.import.resumable': '取り込みが途中で終わりました。残りのファイル: {count}。',
  'libManage.import.resume': '再開',
  'libManage.import.discard': '破棄',
  'libManage.import.noneFound': 'このフォルダーには EPUB、PDF、マンガのアーカイブがありません。',

  // Remove, Undo, Recently removed
  'libManage.remove.done': '「{title}」を削除しました。',
  'libManage.remove.undo': '元に戻す',
  'libManage.remove.failed': 'ファイルの一部が使用中のため削除できませんでした。閉じてからもう一度お試しください。',
  'libManage.trash.summary': '最近削除した項目 ({count})',
  'libManage.trash.restore': '復元',
  'libManage.trash.restoreNamed': '{title} を復元',
  'libManage.trash.keptUntil': '{date} まで保持',
  'libManage.trash.restoreFailed': '復元できませんでした。開いているファイルを閉じてもう一度お試しください。',
  'libManage.trash.release': 'すべてごみ箱へ移動',
  'libManage.trash.releaseTitle': '削除した項目をごみ箱へ移動しますか？',
  'libManage.trash.releaseMessage':
    'ライブラリからは復元できなくなります。Windows のごみ箱を空にするまでは、ごみ箱に残ります。',
  'libManage.trash.releaseFailed': '移動できなかった項目があり、ここに残っています。',

  // Details
  'libManage.meta.edit': '詳細を編集',
  'libManage.meta.dialogTitle': '詳細を編集',
  'libManage.meta.field.title': 'タイトル',
  'libManage.meta.field.author': '著者',
  'libManage.meta.field.series': 'シリーズ',
  'libManage.meta.field.seriesIndex': 'シリーズ内の番号',
  'libManage.meta.field.tags': 'タグ',
  'libManage.meta.tagsHint': 'タグはカンマで区切ります。',
  'libManage.meta.authorHint': '複数の著者は「&」で区切ります。',
  'libManage.meta.seriesWithIndex': '{series} 第{index}巻',
  'libManage.meta.error.invalid': 'この詳細は保存できませんでした。',
  'libManage.meta.error.notFound': 'この項目はもうライブラリにありません。',
  'libManage.meta.error.titleRequired': 'タイトルは必須です。',
  'libManage.meta.error.tooLong': '長すぎる項目があります（300文字まで）。',
  'libManage.meta.error.seriesIndex': 'シリーズ内の番号は 0〜100000 の数値で入力してください。',
  'libManage.meta.error.tags': 'タグは50個まで、1つ60文字までです。',

  // Missing files
  'libManage.missing.badge': 'ファイルがありません',
  'libManage.missing.explain': 'この項目の保存済みコピーが、アプリの外で移動または削除されました。',
  'libManage.missing.relink': 'ファイルを指定…',
  'libManage.missing.relinked': '見つかりました。もう一度開けます。',
  'libManage.missing.relinkFailed': 'そのファイルは使えませんでした。別のファイルをお試しください。',
  'libManage.missing.noPages': 'そのアーカイブには画像がありません。',
  'libManage.missing.diskFull': 'ディスクがいっぱいのため、ファイルをコピーできませんでした。',
  'libManage.dialog.relinkManga': 'マンガのアーカイブを指定',

  // Library search
  'libManage.search.label': 'ライブラリを検索',
  'libManage.search.placeholder': 'タイトル・著者・シリーズ・タグ',

  // Files app
  'filesApp.mine.refuse.notIndexed': 'このファイルはもうファイルのカタログにありません。更新してからもう一度お試しください。',
};

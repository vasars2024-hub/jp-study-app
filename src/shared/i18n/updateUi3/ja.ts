// Updates, third pass (upd3) — Japanese. See ./en.ts.

import type { Catalog } from '../core';

export const UPDATE3_UI_JA: Catalog = {
  'upd3.state.preparing': 'Gum {version} のダウンロードを準備しています…',
  'upd3.state.downloading': 'Gum {version} をダウンロードしています。その間も Gum は使えます。',
  'upd3.state.downloadingDelta': 'Gum {version} の差分をダウンロードしています（差分更新）。その間も Gum は使えます。',
  'upd3.state.verifying': 'Gum {version} のダウンロードを検証しています…',
  'upd3.state.installing': 'Gum {version} をバックグラウンドで展開しています…',
  'upd3.state.paused': 'Gum {version} のダウンロードは一時停止中です。',
  'upd3.progress.bytes': '{received} / {total}',
  'upd3.progress.bytesNoTotal': '{received} 受信済み',
  'upd3.progress.value': '{percent}%（{received} / {total}）',
  'upd3.cancel': 'ダウンロードを中止',
  'upd3.resume': 'ダウンロードを再開',
  'upd3.retry': 'もう一度試す',
  'upd3.pausedNote': '{total} のうち {received} は保存されています。再開するとその続きから始まります。',
  'upd3.partialNote': 'ダウンロード済みの {received} は保存されています。もう一度試すとその続きから始まります。',

  'upd3.restart.title': '今再起動すると、次のものが中断されます:',

  'upd3.notes.linkLabel': '{label}（GitHub で開く）',

  'upd3.history.title': '更新履歴',
  'upd3.history.empty': 'まだ記録されたバージョンはありません。',
  'upd3.history.first': 'Gum {version}、{date} に初回起動',
  'upd3.history.updated': 'Gum {version}、{date} に {from} から更新',
  'upd3.history.downgraded': 'Gum {version}、{date} に {from} から変更',
  'upd3.history.current': '実行中',
  'upd3.history.showAll': { other: '{count} 件のバージョンをすべて表示' },
  'upd3.history.showFewer': '表示を減らす',

  'upd3.whatsNew.title': 'Gum {version} の新機能',
  'upd3.whatsNew.body': 'Gum は {from} から {version} に更新されました。',
  'upd3.whatsNew.show': '新機能を表示',
  'upd3.whatsNew.hide': '新機能を隠す',
  'upd3.whatsNew.dismiss': '閉じる',
  'upd3.whatsNew.noticeTitle': 'Gum が {version} に更新されました',
  'upd3.whatsNew.noticeBody': '新機能は「設定 > ヘルプ > 更新」で確認できます。',
  'upd3.whatsNew.open': '新機能',

  'upd3.auto.label': '更新を自動で確認する',
  'upd3.auto.desc': 'オフにすると、「今すぐ確認」を押したときだけ確認します。',
  'upd3.pause.button': { other: '更新を {count} 日間一時停止' },
  'upd3.pause.until': '更新は {date} まで一時停止中です。「今すぐ確認」は使えます。',
  'upd3.pause.resume': '更新を再開',
  'upd3.diag.crash.label': 'クラッシュレポートをこの PC に保存する',
  'upd3.diag.crash.desc': 'Gum がクラッシュしたとき、小さなクラッシュファイルを Gum のフォルダーに保存します。どこにも送信されません。問題レポートに含めるかどうかはあなたが決めます。',
  'upd3.diag.crash.restart': 'オフにした設定は、次に Gum を起動したときから有効になります。',
  'upd3.diag.report.save': '問題レポートを保存…',
  'upd3.diag.report.desc': 'バグ報告に添付する zip ファイルです。最近のエラーログ、Gum と Windows のバージョン、キー・トークン・個人フォルダーのパスを取り除いた設定、クラッシュファイルを含みます。共有するまで PC の外には出ません。',
  'upd3.diag.report.dialogTitle': '問題レポートを保存',
  'upd3.diag.report.saved': '問題レポートを保存しました: {file}',
  'upd3.diag.report.failed': '問題レポートを保存できませんでした。',
  'upd3.diag.report.show': 'フォルダーで表示',
  'upd3.state.manualOnly': 'まだ確認していません。更新は「今すぐ確認」を押したときだけ確認します。',
};

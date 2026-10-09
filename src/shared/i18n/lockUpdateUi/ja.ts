// The lock gate (lock2) and the update panel (upd2) — Japanese. See ./en.ts.

import type { Catalog } from '../core';

export const LOCK_UPDATE_UI_JA: Catalog = {
  'lock2.blocked.command': 'Gum はロック中です。このショートカットを使うにはロックを解除してください。',
  'lock2.blocked.extension': 'Gum はロック中です。ロックを解除するまでブラウザー拡張機能からの操作は拒否されます。',
  'lock2.blocked.window': 'Gum はロック中です。このウィンドウを開くにはロックを解除してください。',
  'lock2.note.title': '学習用ロックであり、セキュリティ境界ではありません',
  'lock2.note.covers':
    'ロック中の Gum は PIN パッドだけを表示します。ほかのウィンドウは隠れ、新しいウィンドウは解除まで待ち、内容を開くショートカットやトレイ操作は拒否され、ブラウザー拡張機能には Gum がロック中であることが伝えられます。',
  'lock2.note.background':
    'バックグラウンドの処理は続き、Windows の通知を出すこともあります。ダウンロード、予約したスクレイプ、ライブキャプションの取り込み、すでに始まっている録画などです。',
  'lock2.note.devtools': 'インストール版とポータブル版では開発者ツールは無効です。',
  'lock2.note.limits':
    '通りがかりの人から学習内容を隠すためのもので、ファイルは保護しません。デッキ、本、設定はユーザーフォルダー内の普通のファイルで、アプリはディスク上で書き換えられ、デバッグ用スイッチで起動したコピーは中身を調べられます。プライバシーのためには Windows アカウントをロックしてください。',

  'upd2.versionLabel': 'バージョン',
  'upd2.versionUnknown': '不明',
  'upd2.installLabel': '種類',
  'upd2.install.installed': 'インストール版（自動更新）',
  'upd2.install.portable': 'ポータブル版（自動更新なし）',
  'upd2.install.dev': '開発ビルド',
  'upd2.channelLabel': 'チャンネル',
  'upd2.channel.stable': '安定版（GitHub リリース）',
  'upd2.lastCheckLabel': '最終確認',
  'upd2.lastCheck.never': 'まだ確認していません',
  'upd2.state.portable': 'このコピーは自動で更新できません。新しいリリースを確認し、GitHub からダウンロードしてください。',
  'upd2.state.dev': '開発ビルドは自動で更新されません。',
  'upd2.state.checking': '更新を確認しています…',
  'upd2.state.downloading': '更新をバックグラウンドでダウンロードしています。その間も Gum はそのまま使えます。',
  'upd2.state.ready': 'Gum {version} のダウンロードが完了しました。再起動すると更新が完了します。',
  'upd2.state.readyNoVersion': '更新のダウンロードが完了しました。再起動すると更新が完了します。',
  'upd2.state.upToDate': 'Gum {version} は最新です。',
  'upd2.state.notChecked': 'Gum は起動の 1 分後と、その後 6 時間ごとに更新を確認します。',
  'upd2.state.meteredSkipped':
    'Windows が従量制課金接続と報告しているため、自動確認をスキップしました。それでもダウンロードするには「今すぐ確認」を押してください。',
  'upd2.downloadingFor': {
    other: '{count} 分間ダウンロード中',
  },
  'upd2.progressLabel': '更新のダウンロード',
  'upd2.sizeNote':
    '完全な更新は数百 MB あります。リリースに差分パッケージがある場合は、差分だけがダウンロードされます。',
  'upd2.error.network': 'GitHub に接続できませんでした。接続を確認してもう一度お試しください。',
  'upd2.error.no-feed': '最新のリリースにはまだインストーラー用の更新ファイルがありません。後でもう一度確認します。',
  'upd2.error.updater-missing': '更新プログラム（Update.exe）を起動できませんでした。Gum を再インストールすると直ります。',
  'upd2.error.unknown': '更新の確認に失敗しました。詳細はヘルプ > 診断にあります。',
  'upd2.checkNow': '今すぐ確認',
  'upd2.restart': '再起動して更新',
  'upd2.notes.show': 'リリースノートを表示',
  'upd2.notes.hide': 'リリースノートを隠す',
  'upd2.notes.loading': 'リリースノートを読み込んでいます…',
  'upd2.notes.failed': 'リリースノートを読み込めませんでした。後でもう一度お試しください。',
  'upd2.notes.none': 'このプロジェクトはまだリリースを公開していません。',
  'upd2.notes.empty': 'このリリースにはノートがありません。',
  'upd2.notes.title': 'リリースノート: {title}',
  'upd2.notes.published': '{date} 公開',
  'upd2.notes.truncated': 'ノートが長いため、続きは GitHub にあります。',
  'upd2.notes.open': 'GitHub で開く',
  'upd2.privacy':
    'プライバシー: インストール版はバックグラウンドで github.com を確認し、GitHub には IP アドレスが見えます。リリースノートと上のバージョン確認は、ボタンを押したときだけ GitHub から取得します。Gum はアカウント、デッキ、学習データを送信しません。',
};

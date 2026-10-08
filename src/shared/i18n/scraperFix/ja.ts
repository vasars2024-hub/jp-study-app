// Scraper audit fixes (2026-10) -- Japanese.
//
// One block per work package of the scraper audit, so the packages that ran
// side by side never edited the same lines. Keys live under `scraperFix.`;
// English is the source of truth and every key exists in all four languages.
import type { Catalog } from '../core';

export const SCRAPER_FIX_JA: Catalog = {
  // ---- http (P3 / P8) ----
  'scraperDrawer.field.safety.allowPrivateNetwork.label': 'プライベートネットワークを許可',
  'scraperDrawer.field.safety.allowPrivateNetwork.hint': 'クロール、ソースのプローブ、HTTP インスペクターが localhost や LAN のアドレスに接続できるようにします。オフにすると拒否されます。qBittorrent と Seanime には影響しません。',
  // ---- subtitles (P1 / P4 / P7) ----
  // ---- qbittorrent and ingest (P5) ----
  'scraperDrawer.field.qbittorrent.pathMappings.label': 'パスの対応付け',
  'scraperDrawer.field.qbittorrent.pathMappings.hint': '別のマシンで動く qBittorrent 用：qBittorrent が報告するフォルダーと、このコンピューターから見た同じフォルダーを指定します。',
  'scraperFix.qbit.mappings.hint': 'Docker や NAS 上の qBittorrent は /downloads のような独自のパスを報告します。それぞれをこのコンピューターから見た同じフォルダーと対応付けると、完了したダウンロードをライブラリに追加できます。',
  'scraperFix.qbit.mappings.remote': 'qBittorrent 上のパス',
  'scraperFix.qbit.mappings.local': 'このコンピューター上のパス',
  'scraperFix.qbit.unresolved': '完了したダウンロード {count} 件がまだこのコンピューター上で見つかりません。qBittorrent が別のマシンで動いている場合は、その設定でパスの対応付けを追加してください。',
  // ---- engine (P4 / P6 / P8) ----
  'scraperFix.rule.nextPageSelector': '次のページへのリンク',
  'scraperFix.rule.maxPages': '最大ページ数',
  'scraperFix.rule.maxPagesHint': '1 の場合は最初のページだけを読み込みます。ページは同じサイト内でのみたどります。',
  // ---- outputs, logs, notifications, scheduler (P6 / P7) ----
  'scraperFix.notice.complete.title': 'スクレイプ完了',
  'scraperFix.notice.complete.body': '{subject} — {count} 話。',
  'scraperFix.notice.error.title': 'スクレイプ失敗',
  'scraperFix.notice.error.body': '失敗: {subject}',
  'scraperFix.notice.new-episode.title': '新しいエピソードが見つかりました',
  'scraperFix.notice.new-episode.body': '{subject} — 新しいエピソード {count} 話。',
  'scraperFix.notice.schedule-run.title': 'スケジュール実行を開始しました',
  'scraperFix.notice.schedule-run.body': '実行: {subject}',
  'scraperFix.notice.study-ready.title': '字幕の学習準備ができました',
  'scraperFix.notice.study-ready.body': '{subject} — 字幕トラック付きのエピソード {count} 話。',
  'scraperFix.notice.digest.title': 'スクレイパー — 更新 {count} 件',
  'scraperFix.notice.digest.complete': 'スクレイプ完了 {count} 件',
  'scraperFix.notice.digest.new-episode': '新しいエピソードのあるシリーズ {count} 件',
  'scraperFix.notice.digest.study-ready': '学習準備ができたシリーズ {count} 件',
  'scraperFix.notice.digest.schedule-run': 'スケジュール実行 {count} 件',
  'scraperFix.notice.digest.error': '失敗 {count} 件',
  // ---- ui (P9) ----
  'scraperFix.ui.stage.queued': '待機中',
  'scraperFix.ui.stage.searching': '検索中',
  'scraperFix.ui.stage.fetching': '取得中',
  'scraperFix.ui.stage.parsing': '抽出中',
  'scraperFix.ui.stage.streams': 'ミラーを確認中',
  'scraperFix.ui.stage.subtitles': '字幕を収集中',
  'scraperFix.ui.stage.validating': '検証中',
  'scraperFix.ui.stage.done': '完了',
  'scraperFix.ui.stage.failed': '失敗',
  'scraperFix.ui.stage.cancelled': 'キャンセル済み',
  'scraperFix.ui.run.failed': 'スクレイプが停止しました: {detail}',
  'scraperFix.ui.run.cancelFailed': 'スクレイプをキャンセルできませんでした: {detail}',
  'scraperFix.ui.err.httpStatus': '{target} が HTTP {status} を返しました。',
  'scraperFix.ui.err.ruleNoMatch': '{host} のサイトルールは {url} で何も一致しませんでした。',
  'scraperFix.ui.err.validationFailed': '検証に失敗したエピソード: {count}。',
  'scraperFix.ui.err.nothingToSearch': '検索する内容がありません。URL かタイトルを入力してください。',
  'scraperFix.ui.err.noCatalogueMatch': 'カタログに「{query}」に一致するものはありません。',
  'scraperFix.ui.err.contentType': '{type} のスクレイプはまだカタログプロバイダーに接続されていません。',
  'scraperFix.ui.err.autoDownloaderOff': 'Seanime の自動ダウンローダーはオフになっています。',
  'scraperFix.ui.err.unknown': '不明なエラーです。',
  'scraperFix.ui.field.notNumber': '保存されていません: 数値を入力してください。',
  'scraperFix.ui.field.outOfRange': '保存されていません: {min} から {max} までの値を入力してください。',
  'scraperFix.ui.dash.cancelling': 'キャンセル中...',
  'scraperFix.ui.plugins.notReady': 'プラグインはまだ準備中です。このページの操作は保存されず、スクレイパーの動作も変わらないため、スイッチとボタンは無効になっています。',
  'scraperFix.ui.note.ruleChecks': '一部のルールチェックに合格しませんでした。',
  'scraperFix.ui.note.missing': '欠けているエピソード番号: {list}。',
  'scraperFix.ui.note.missingMore': '欠けているエピソード番号: {list}、ほか {more} 件。',
};

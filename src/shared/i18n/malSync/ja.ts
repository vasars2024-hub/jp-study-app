// MyAnimeList sync panel — Japanese. See ./en.ts for why this block did not exist.
import type { Catalog } from '../core';

export const MAL_SYNC_JA: Catalog = {
  'malSync.title': 'MyAnimeList',
  'malSync.desc': 'MyAnimeList のアカウントを連携し、アニメリストをアプリに取り込みます。',

  'malSync.setup': '初期設定',
  'malSync.clientIdDesc':
    'MyAnimeList で API アプリケーションを登録し、その Client ID をここに貼り付けてください。パスワードがこのアプリに渡ることはありません。',
  'malSync.clientId': 'Client ID',
  'malSync.clientIdStored': '保存済み — 新しい ID を貼り付けると置き換わります',
  'malSync.clientIdPlaceholder': 'MyAnimeList の Client ID を貼り付け',
  'malSync.clientIdSave': '保存',
  'malSync.register': 'アプリを登録',
  'malSync.notConfigured': '連携する前に Client ID を設定してください。',

  'malSync.account': 'アカウント',
  'malSync.connectedAs': '{username} として連携中。',
  'malSync.notConnected': '未連携。',
  'malSync.plaintextWarning':
    'この端末では認証情報を暗号化できないため、アクセストークンはプロファイルフォルダーに平文で保存されます。',

  'malSync.profileNotice': 'MyAnimeList を、{dir} に保存されたプロファイルへ連携します。',
  'malSync.nonDefaultProfileWarning':
    'このアプリは既定以外のプロファイルフォルダーで動作しています。MyAnimeList 側の許可はアカウント全体に対して永続的に残りますが、トークンはこのフォルダーにしか保存されません。フォルダーが一時的なものだったり削除されたりすると、アカウントは許可されたまま、ここからは利用できなくなります。その場合は MyAnimeList の設定でアクセスを取り消してください。',

  'malSync.walkthroughTitle': '連携時に起こること',
  'malSync.walkthroughStep1':
    'いつものブラウザーで MyAnimeList が開きます。そこでサインインしてアクセスを許可してください。このアプリがパスワードを受け取ることはありません。',
  'malSync.walkthroughStep2':
    'その後 MyAnimeList は http://localhost/oauth/callback に転送しますが、このページは読み込めません。これは異常ではなく想定どおりです。受け取るためのローカルサーバーを意図的に動かしていないためです。',
  'malSync.walkthroughStep3':
    'ブラウザーのアドレスバーで、「code=」の後ろにある長い値をコピーしてください。',
  'malSync.walkthroughStep4':
    'ここに表示される入力欄に貼り付けて「連携を完了」を押します。コードは数分で失効するので、すぐに行ってください。',

  'malSync.connect': 'MyAnimeList と連携',
  'malSync.callbackCode': '認証コード',
  'malSync.callbackPlaceholder': 'リダイレクト先のアドレスからコードを貼り付け',
  'malSync.finish': '連携を完了',
  'malSync.callbackDesc':
    'ブラウザーでアクセスを許可し、リダイレクト先アドレスの「code」の値をコピーして上に貼り付けてください。コードは数分で失効します。',
  'malSync.signOut': 'サインアウト',

  'malSync.list': 'アニメリスト',
  'malSync.fetching': '取得中…',
  'malSync.fetchList': 'リストを取得',
  'malSync.listCount': '{count}件を取得しました。',
  'malSync.truncated':
    'ページ数の上限に達した時点で MyAnimeList にまだ続きがあったため、このリストは不完全です。',

  'malSync.library': 'ライブラリ',
  'malSync.libraryDesc':
    '保存すると、取得した作品がこのアプリ内に保持され、字幕・語彙ツールから利用できます。保存対象は直前に取得した内容だけで、MyAnimeList への通信も、あちら側のリストの変更も行いません。',
  'malSync.librarySave': '取得した作品をライブラリに保存',
  'malSync.librarySaving': '保存中…',
  'malSync.libraryResult': '保存しました：新規{added}件、更新{updated}件、変更なし{unchanged}件。',
  'malSync.libraryRejected': '{rejected}件は読み取れなかったため除外しました。',
  'malSync.libraryStored': 'ライブラリに{total}件あります。',
  'malSync.libraryEmpty': 'まだ何も保存されていません。',
  'malSync.libraryDerivatives': 'うち{derivatives}件は関連作品から辿ったものです。',
  'malSync.libraryNothingFetched': '先にリストを取得してから保存してください。',
  'malSync.noAutoSyncPush': '取得も送信も手動で、自動では何も行いません。MyAnimeList のリストが変わるのは「送信」を押したときだけです。',
  'malSync.push': '変更を送信',
  'malSync.pushDesc': 'このアプリでの変更（ステータス、スコア、視聴話数）を、最後に取得したリストと比べて MyAnimeList に送信します。',
  'malSync.pushButton': { other: '{count} 件の変更を MyAnimeList に送信' },
  'malSync.pushNone': 'MyAnimeList のリストとの違いはありません。',
  'malSync.pushNeedsFetch': '比較できるよう、先にリストを取得して保存してください。',
  'malSync.pushPushing': '送信中…',
  'malSync.pushResult': '送信 {sent} 件、失敗 {failed} 件。',
  'malSync.pushRemaining': { other: '残り {count} 件は次回の送信で送られます。' },
  'malSync.pushAdded': 'MyAnimeList に新規追加',
  'malSync.pushField.status': 'ステータス',
  'malSync.pushField.score': 'スコア',
  'malSync.pushField.episodes': '話数',
  'malSync.pushField.rewatching': '再視聴',
  'malSync.pushChangeLine': '{field}：{from} → {to}',
  'malSync.pushMore': { other: '…ほか {count} 件' },
  'malSync.yes': 'はい',
  'malSync.no': 'いいえ',
  'malSync.related': '続編・関連作品を含める',
  'malSync.relatedDesc': '視聴済み・視聴中の作品に関連する作品を調べ（1 作品につき MyAnimeList へ 1 リクエスト、最大 {limit} 件）、字幕・語彙ツール用にライブラリへ保存します。リストには追加しません。',
  'malSync.relatedWorking': '関連作品を検索中…',
  'malSync.relatedResult': { other: '関連作品 {count} 件（新規 {added} 件）を見つけました。' },
  'malSync.relatedTruncated': 'リクエスト上限で停止しました。続けるにはもう一度実行してください。',
  'malSync.relatedNeedsLibrary': '先にリストをライブラリに保存してください。',
  'malSync.statusFilter': '表示',
  'malSync.statusAll': 'リスト全体',
  'malSync.statusCompleted': '完了済みのみ',
  'malSync.statusWatching': '視聴中のみ',

  'malSync.error.not-configured': 'MyAnimeList の Client ID がまだ設定されていません。',
  'malSync.error.not-authenticated': 'MyAnimeList と未連携です。先にアカウントを連携してください。',
  'malSync.error.reauth-required': 'MyAnimeList で再度のサインインが必要です。もう一度連携してください。',
  'malSync.error.transient': 'MyAnimeList から応答がありませんでした。少し待って再試行してください。',
  'malSync.error.request-failed': 'MyAnimeList へのリクエストが失敗しました。',
};

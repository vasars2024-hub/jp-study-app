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

  'malSync.connect': 'MyAnimeList と連携',
  'malSync.callbackCode': '認証コード',
  'malSync.callbackPlaceholder': 'リダイレクト先のアドレスからコードを貼り付け',
  'malSync.finish': '連携を完了',
  'malSync.callbackDesc':
    'ブラウザーでアクセスを許可し、リダイレクト先アドレスの「code」の値をコピーして上に貼り付けてください。コードは数分で失効します。',
  'malSync.signOut': 'サインアウト',

  'malSync.list': 'アニメリスト',
  'malSync.noAutoSync':
    '取得は手動かつ読み取り専用です。定期実行は行わず、MyAnimeList へ書き戻すこともありません。',
  'malSync.fetching': '取得中…',
  'malSync.fetchList': 'リストを取得',
  'malSync.listCount': '{count}件を取得しました。',
  'malSync.truncated':
    'ページ数の上限に達した時点で MyAnimeList にまだ続きがあったため、このリストは不完全です。',

  'malSync.error.not-configured': 'MyAnimeList の Client ID がまだ設定されていません。',
  'malSync.error.not-authenticated': 'MyAnimeList と未連携です。先にアカウントを連携してください。',
  'malSync.error.reauth-required': 'MyAnimeList で再度のサインインが必要です。もう一度連携してください。',
  'malSync.error.transient': 'MyAnimeList から応答がありませんでした。少し待って再試行してください。',
  'malSync.error.request-failed': 'MyAnimeList へのリクエストが失敗しました。',
};

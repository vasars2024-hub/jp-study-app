// Seamless playback (playback.) — Japanese.

import type { Catalog } from '../core';

export const PLAYBACK_UI_JA: Catalog = {
  'playback.frame.opening': '{title} を開いています…',
  'playback.frame.openingVideo': '動画を開いています…',
  'playback.frame.slow': 'プレーヤーを準備しています…',

  'playback.failed.title': 'この動画は今は再生できません',
  'playback.failed.retry': 'もう一度試す',
  'playback.failed.retrying': '再試行しています…',
  'playback.failed.back': '戻る',
  'playback.failed.details': '技術的な詳細',
  'playback.failed.crashed': 'メディアサーバーが続けて停止しました。もう一度試してください。繰り返す場合は Gum を再起動してください。',
  'playback.failed.unhealthy': 'メディアサーバーの起動に時間がかかりすぎました。もう一度試してください。',
  'playback.failed.spawn-failed': 'Windows が Gum のメディアサーバーを起動できませんでした。セキュリティソフトがブロックしている可能性があります。ウイルス対策ソフトで Gum を許可してから、もう一度試してください。',
  'playback.failed.missing-exe': 'このインストールには Gum のメディアサーバーが含まれていません。Gum を再インストールして復元してください。',
  'playback.failed.port': '動画用のローカルポートを確保できませんでした。もう一度試してください。',
  'playback.failed.disabled': 'このセッションでは動画の再生がオフになっています。',
  'playback.failed.connect': 'Gum のメディアサーバーに接続できませんでした。もう一度試してください。',
  'playback.failed.player': 'プレーヤーがこの動画を開けませんでした。ファイルが壊れているか、Gum で再生できない形式の可能性があります。',
};

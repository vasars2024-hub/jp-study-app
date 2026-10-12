// AI fixes pass — Japanese. See ./en.ts.

import type { Catalog } from '../core';

export const AI_FIX_UI_JA: Catalog = {
  'aiError.ai-off': 'AI 機能は［設定］→［AI］でオフになっています。',
  'aiError.no-key': 'AI プロバイダーの API キーが保存されていません。［設定］→［AI］で追加してください。',
  'aiError.consent': 'この AI プロバイダーへのテキスト送信はまだ許可されていません。',
  'aiError.auth': 'AI プロバイダーが API キーを拒否しました。',
  'aiError.rate-limit': 'AI プロバイダーがリクエストを制限しています。少し待ってから再試行してください。',
  'aiError.spend': '［設定］→［AI］で設定した AI の利用上限を超えてしまいます。',
  'aiError.too-long': 'テキストが長すぎて 1 回のリクエストでは送信できません。',
  'aiError.offline': 'このコンピューターはオフラインのため、何も送信していません。',
  'aiError.network': 'AI プロバイダーに接続できませんでした。',
  'aiError.timeout': 'AI リクエストがタイムアウトしました。',
  'aiError.invalid': 'AI の回答を読み取れませんでした。再試行してください。',
  'aiError.truncated': 'AI の回答が途中で切れました。短いリクエストで試してください。',
  'aiError.no-local-model': 'オフライン AI モデルがインストールされていません。［設定］→［AI］でインストールしてください。',
  'aiError.refused': '機密データが含まれていたため、リクエストは送信されませんでした。',
  'aiError.empty-input': '送信する内容がありません。',
  'aiError.no-answer': 'AI はこの項目に回答しませんでした。再試行すると再度問い合わせます。',
  'aiError.ipc-failed': 'アプリのバックグラウンド処理に接続できませんでした。再試行してください。',
  'aiError.cancelled': 'キャンセルしました。',
  'aiError.other': 'AI リクエストに失敗しました。',

  'aiFix.analysis.needsConsent': '文法分析では、この文とその翻訳を {provider} に送信します。{provider} への翻訳テキストの送信を許可すると実行されます。',
  'aiFix.analysis.partial': '一部のセクションが返されませんでした。この分析は保存していません。［再解析］で再試行してください。',

  'aiFix.assistant.partial': '回答が不完全なため保存していません。同じモードをもう一度選ぶと再試行します。',

  'aiFix.whisper.multilingualRequired': '選択中の Whisper モデルは日本語専用です。この言語を文字起こしするには、［設定］→［文字起こし］で多言語モデル（Whisper small、base、large-v3-turbo）をダウンロードしてください。',
};

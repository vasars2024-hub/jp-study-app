// AI provider layer (see ./en.ts). Japanese.

import type { Catalog } from '../core';

export const AI_PROVIDERS_UI_JA: Catalog = {
  'aiProv.cancel': 'キャンセル',
  'aiProv.saveFailed': '変更を保存できませんでした。もう一度お試しください。',

  'aiProv.vendor.local': 'ローカルサーバー（Ollama・LM Studio）',
  'aiProv.model.label': 'モデル',
  'aiProv.model.invalid': 'モデル名に空白は使えません。',
  'aiProv.modelHint.haiku': '高速で低価格。字幕や簡単な解析など、1行ずつの処理に最適です。',
  'aiProv.modelHint.sonnet': '解説・カード生成・添削にバランスのよい品質です。',
  'aiProv.modelHint.opus': '最も高性能で、最も高価です。長文の作文や難しい質問に使ってください。',
  'aiProv.modelHint.deepseekFlash': '低価格で、とても長い文脈を扱えます。',
  'aiProv.modelHint.deepseekPro': 'Flash より高品質ですが、料金も高くなります。',
  'aiProv.modelHint.openai': 'OpenAI アカウントで使える任意のモデル名を入力します。空欄なら gpt-5-mini を使います。',
  'aiProv.modelHint.local':
    'Ollama や LM Studio を使って自分のパソコンで動かします。サーバーがこのパソコン上にあれば、インターネットには何も送られません。',
  'aiProv.key.optional': 'API キー（任意）',
  'aiProv.local.url': 'サーバーの URL',
  'aiProv.local.urlInvalid': 'ユーザー名やパスワードを含まない http:// または https:// のアドレスを入力してください。',
  'aiProv.local.ready': 'サーバーの URL とモデルが設定されています。',
  'aiProv.local.notReady': 'このサーバーを使うには、URL とモデルを設定してください。',

  'aiProv.test.button': '接続をテスト',
  'aiProv.test.running': 'テスト中…',
  'aiProv.test.ok': '接続できました（{ms} ms）。',
  'aiProv.test.okModel': '{model} に接続できました（{ms} ms）。',
  'aiProv.test.failedStatus': '{reason}（HTTP {status}）',
  'aiProv.test.note':
    'テストで送るのは決まった単語ひとつだけで、あなたの文章は送りません。返答も数トークンだけです。クラウドのテストも通常のリクエストと同じく利用額に数えられます。',

  'aiProv.rates.none': '組み込みの目安はありません。このサーバーが有料なら料金を入力してください',

  'aiProv.error.ai-off': 'AI 機能はオフになっています。「設定 → AI」でオンにしてください。',
  'aiProv.error.cloud-disabled':
    'この機能はクラウドの使用を許可されていません。「設定 → AI」で許可するか、エンジンをオフラインに切り替えてください。',
  'aiProv.error.missing-credential': 'このプロバイダーの API キーが保存されていません（またはローカルサーバーが未設定です）。',
  'aiProv.error.authentication': 'プロバイダーが API キーを拒否しました。キーと利用権限を確認してください。',
  'aiProv.error.rate-limit': 'プロバイダーのレート制限に達しました。少し待ってから再試行してください。',
  'aiProv.error.upstream': 'プロバイダーがエラーを返しました。しばらくしてから再試行してください。',
  'aiProv.error.network': 'プロバイダーに接続できません。接続状況、またはローカルサーバーが起動しているか確認してください。',
  'aiProv.error.timeout': 'プロバイダーの応答に時間がかかりすぎました。項目を減らしてください。',
  'aiProv.error.cancelled': 'キャンセルしました。',
  'aiProv.error.invalid-response': 'プロバイダーの回答を利用できませんでした。再試行するか、モデルを切り替えてください。',
  'aiProv.error.output-truncated': '回答が出力上限で途切れました。項目を減らしてください。',
  'aiProv.error.spend-budget': '月間の AI 利用上限（設定 → AI）を超えてしまいます。',
  'aiProv.error.cost-budget': 'このリクエストは 1 回あたりの費用上限を超えています。',
  'aiProv.error.vision-unsupported': 'このモデルは画像を読めません。画像に対応したモデルを選んでください。',
  'aiProv.error.unknown-provider': 'このバージョンのアプリでは不明な AI プロバイダーです。',
  'aiProv.error.local-model-missing': 'オフラインモデルがインストールされていません。「設定 → AI」でインストールしてください。',
  'aiProv.error.generic': 'AI リクエストに失敗しました。',

  'aiProv.mining.needKey': 'カードを生成する前に、「設定 → AI」で {provider} の API キーを追加してください。',
  'aiProv.mining.needLocalModel':
    'オフラインモデルがインストールされていません。「設定 → AI」でインストールするか、エンジンをクラウドに切り替えてください。',
  'aiProv.mining.noTerms': '先に辞書で単語にスターを付けるか、プリセット生成に切り替えてください。',
  'aiProv.mining.noItems': 'このプリセットについて、AI が語彙を返しませんでした。',
  'aiProv.mining.onlyDuplicates': 'AI が重複した語彙しか返しませんでした。再試行するか、プロバイダーを切り替えてください。',
  'aiProv.mining.noUsable': 'AI は項目を返しましたが、使える表現がありませんでした。',

};

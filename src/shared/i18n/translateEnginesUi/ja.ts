// Translate engines pass (xlate2.) — Japanese.

import type { Catalog } from '../core';

export const TRANSLATE_ENGINES_UI_JA: Catalog = {
  // ---- Engine names ----
  'xlate2.provider.local': 'オフライン（小型モデル）',
  'xlate2.provider.localLarge': 'オフライン・高品質（大型・低速）',

  // ---- Engine picker ----
  'xlate2.engine.label': '翻訳エンジン',
  'xlate2.engine.hint': '言語の組み合わせ（{pair}）ごとに記憶されます。',
  'xlate2.engine.needsKey': '設定で API キーを追加してください',
  'xlate2.engine.notInstalled': '未インストール',
  'xlate2.engine.fallback': 'クラウドエンジンが失敗したらオフラインモデルを使う',
  'xlate2.engine.fallbackHint': 'クラウドエンジンが使えない・制限中・予算超過のときは、エラーを出さずにオフラインで翻訳します。',
  'xlate2.engine.largeMissing': '大型モデルがインストールされていません。アプリからはダウンロードできません。{file} などの大型 Qwen3 モデルをアプリのモデルフォルダーかダウンロードフォルダーに置くと、ここに表示されます。8 GB 以上のメモリが必要で、速度は数倍遅くなります。',
  'xlate2.engine.largeReady': '{file} を使用中です。小型モデルより一文ごとに数倍時間がかかります。',
  'xlate2.engine.cloudActive': 'ここでこの言語の組み合わせで翻訳する文章は {provider}（{host}）に送信されます。リーダーのポップアップ、字幕、辞書は引き続きオフラインで翻訳します。',
  'xlate2.engine.cloudShort': '翻訳のため {provider} に送信',

  // ---- Consent ----
  'xlate2.consent.title': '{provider} に文章を送信しますか？',
  'xlate2.consent.body': '{provider} で翻訳すると、翻訳する文章がインターネット経由で {host} に送信され、{provider} の規約に基づいて処理されます。文章はこの端末の外に出ます。',
  'xlate2.consent.scope': '送信されるのは翻訳する文章と、その中に出てくる用語集の語だけです。履歴、デッキ、その他の用語集はこの端末に残ります。',
  'xlate2.consent.billingMt': 'お使いの DeepL キーと文字数枠を使います。有料分は設定の月間 AI 支出上限に計上されます。',
  'xlate2.consent.billingLlm': 'お使いの API キーを使います。リクエストは設定の月間 AI 支出上限に計上されます。',
  'xlate2.consent.allow': '{provider} を許可',
  'xlate2.consent.decline': 'オフラインで翻訳を続ける',
  'xlate2.consent.revoke': '{provider} への送信をやめる',

  // ---- Progress and results ----
  'xlate2.progress.sentences': '翻訳済みの文：{total} 文中 {done} 文',
  'xlate2.result.by': '翻訳：{provider}',
  'xlate2.result.fellBack': '{provider} で翻訳できなかったため（{reason}）、オフラインモデルで翻訳しました。',
  'xlate2.error.cloud': '{provider} で翻訳できませんでした：{reason}。',

  // ---- Why a cloud engine did not answer ----
  'xlate2.fallback.consent': '文章の送信を許可していません',
  'xlate2.fallback.noKey': 'API キーが保存されていません',
  'xlate2.fallback.auth': 'API キーが拒否されました',
  'xlate2.fallback.rateLimit': 'リクエストが多すぎます。少し待ってから再試行してください',
  'xlate2.fallback.quota': 'アカウントの利用枠を使い切りました',
  'xlate2.fallback.spend': '月間の支出上限を超えてしまいます',
  'xlate2.fallback.network': 'サービスに接続できませんでした',
  'xlate2.fallback.timeout': 'リクエストがタイムアウトしました',
  'xlate2.fallback.invalid': '返答が使える翻訳ではありませんでした',
  'xlate2.fallback.tooLong': '一度に送るには文章が長すぎます',
  'xlate2.fallback.notInstalled': 'モデルがインストールされていません',
  'xlate2.fallback.unsupported': 'この言語の組み合わせには対応していません',
  'xlate2.fallback.other': '予期しないエラー',

  // ---- Glossary ----
  'xlate2.glossary.toggle': '用語集（{count}）',
  'xlate2.glossary.title': '用語集',
  'xlate2.glossary.intro': '人名や決まった表現など、いつも同じ訳にしたい語です。その語を含むすべての翻訳に適用されます。',
  'xlate2.glossary.term': '用語',
  'xlate2.glossary.rendering': '常にこう訳す',
  'xlate2.glossary.pairOnly': '{pair} のみ',
  'xlate2.glossary.add': '用語を保存',
  'xlate2.glossary.saved': '「{term}」を保存しました。',
  'xlate2.glossary.invalid': '用語と、それとは異なる訳を入力してください（それぞれ 80 文字まで）。',
  'xlate2.glossary.suggestTitle': 'デッキからの候補（{count}）',
  'xlate2.glossary.useSuggestion': '追加',
  'xlate2.glossary.empty': '{pair} の用語はまだありません。',
  'xlate2.glossary.listLabel': '{pair} の用語',
  'xlate2.glossary.allPairs': 'すべての言語の組み合わせ',
  'xlate2.glossary.fromDeck': 'デッキから',
  'xlate2.glossary.edit': '編集',
  'xlate2.glossary.otherPairs': {
    other: 'ほかの言語の組み合わせに適用される用語があと {count} 件あります。',
  },
  'xlate2.glossary.report': '用語集どおりの訳：{total} 件中 {count} 件。',
  'xlate2.glossary.missing': '反映されなかった用語：{terms}。',

  // ---- Credentials row ----
  'xlate2.credential.deeplDesc': 'DeepL の機械翻訳 API。翻訳ワークベンチで任意に使えるエンジンです。',
  'xlate2.credential.deeplFreeTier': 'DeepL API Free のキーは「:fx」で終わり、毎月の文字数枠があります。現在の上限は DeepL アカウントで確認してください。',
  'xlate2.credential.useTranslate': '翻訳ワークベンチ（任意のクラウドエンジン）',
};

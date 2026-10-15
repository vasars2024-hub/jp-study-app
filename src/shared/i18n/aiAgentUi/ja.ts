import type { Catalog } from '../core';

export const AI_AGENT_UI_JA: Catalog = {
  'aiAgent.target.claudeHaiku': 'Claude Haiku 5.5（クラウド）',
  'aiAgent.target.claudeSonnet': 'Claude Sonnet 5.5（クラウド）',
  'aiAgent.target.claudeOpus': 'Claude Opus 5.5（クラウド）',
  'aiAgent.target.openai': 'OpenAI（クラウド）',
  'aiAgent.target.compatible': 'ローカルサーバー（Ollama、LM Studio）',

  'aiAgent.theme.unknown': 'アプリにあるテーマを指定してください: {themes}。',
  'aiAgent.theme.cssBlancOnly':
    'カスタム CSS が適用されるのは Blanc ツールボックスだけです。Blanc から依頼するか、ここではテーマを選んでください。',

  'aiAgent.assistant.mode.simplify': 'この行をやさしく言い換える',
  'aiAgent.assistant.simplified': 'やさしい言い換え',

  'aiAgent.planError.invalidRequest': '先にエージェントにしてほしいことを書いてください。',
  'aiAgent.planError.aiOff': 'AI 機能は 設定 → AI 機能 でオフになっています。',
  'aiAgent.planError.agentDisabled': 'エージェントはオフです。設定 → AI 機能 でオンにしてください。',
  'aiAgent.planError.modelMissing':
    'オフラインモデルもクラウドのキーもないため、計画を作れませんでした。設定 → AI 機能 でどちらかを設定してください。',
  'aiAgent.planError.cloudKeyMissing': 'クラウドの計画機能に API キーがありません。設定 → AI 機能 で追加してください。',
  'aiAgent.planError.spendBudget': 'この計画をクラウドで作ると、月の利用上限を超えてしまいます。',
  'aiAgent.planError.cloudDisabled':
    'エージェントにはクラウドの利用が許可されていません。設定 → AI 機能 → クラウドを使える機能 で許可するか、オフラインモデルを入れてください。',
  'aiAgent.planError.objectiveTooLong': '計画にできる依頼は 500 文字までです。短くしてもう一度試してください。',
  'aiAgent.planError.contextOverflow':
    'この依頼はオフラインモデルのコンテキストに収まりません。設定 → AI 機能 でコンテキストサイズを上げるか、依頼と添付を短くしてください。',
  'aiAgent.planError.timeout': 'モデルが計画を作るのに時間がかかりすぎました。もう一度試すか、一度に頼む内容を減らしてください。',
  'aiAgent.planError.planInvalid':
    'モデルの答えは、エージェントが実行できる計画になっていませんでした。もう一度試すか、言い方を変えてください。',
  'aiAgent.planError.plannerFailed': '計画を作れませんでした。もう一度試すか、設定 → AI 機能 を確認してください。',

  'aiAgent.loop.planned': '結果をもとに次の手順を計画しました（{max} 回中 {round} 回目）。',
  'aiAgent.loop.done': '完了しました。この依頼でほかにすることはありません。',
  'aiAgent.loop.doneSummary': '完了: {summary}',

  'aiAgent.reviews.changedSince': 'その後に復習または予定変更されたカードがあるため、何も変更しませんでした。',
  'aiAgent.reviews.folderNotFound': '「{folder}」というデッキフォルダーはありません。',
};

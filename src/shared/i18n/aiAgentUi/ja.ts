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
};

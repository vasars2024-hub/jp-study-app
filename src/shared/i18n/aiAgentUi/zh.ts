import type { Catalog } from '../core';

export const AI_AGENT_UI_ZH: Catalog = {
  'aiAgent.target.claudeHaiku': 'Claude Haiku 5.5（云端）',
  'aiAgent.target.claudeSonnet': 'Claude Sonnet 5.5（云端）',
  'aiAgent.target.claudeOpus': 'Claude Opus 5.5（云端）',
  'aiAgent.target.openai': 'OpenAI（云端）',
  'aiAgent.target.compatible': '本地服务器（Ollama、LM Studio）',

  'aiAgent.theme.unknown': '请指定应用中提供的主题：{themes}。',
  'aiAgent.theme.cssBlancOnly': '自定义 CSS 只作用于 Blanc 工具箱。请在 Blanc 中提出请求，或在这里改为选择主题。',

  'aiAgent.assistant.mode.simplify': '简化这句台词',
  'aiAgent.assistant.simplified': '简化版本',

  'aiAgent.planError.invalidRequest': '请先描述希望智能体做什么。',
  'aiAgent.planError.aiOff': 'AI 功能已在 设置 → AI 功能 中关闭。',
  'aiAgent.planError.agentDisabled': '智能体已关闭。请在 设置 → AI 功能 中开启。',
  'aiAgent.planError.modelMissing': '既没有安装离线模型，也没有保存云端密钥，因此无法制定计划。请在 设置 → AI 功能 中设置其一。',
  'aiAgent.planError.cloudKeyMissing': '云端规划器没有 API 密钥。请在 设置 → AI 功能 中添加。',
  'aiAgent.planError.spendBudget': '在云端制定此计划会超出每月支出上限。',
  'aiAgent.planError.cloudDisabled': '智能体不允许使用云端。请在 设置 → AI 功能 → 可使用云端的功能 中允许，或安装离线模型。',
  'aiAgent.planError.objectiveTooLong': '计划请求最多 500 个字符。请缩短后再试。',
  'aiAgent.planError.contextOverflow': '此请求超出了离线模型的上下文。请在 设置 → AI 功能 中调大上下文大小，或缩短请求及其附带内容。',
  'aiAgent.planError.timeout': '模型制定计划用时过长。请重试，或一次少请求一些。',
  'aiAgent.planError.planInvalid': '模型的回答不是智能体可以执行的计划。请重试，或换一种说法。',
  'aiAgent.planError.plannerFailed': '无法制定计划。请重试，或检查 设置 → AI 功能。',

  'aiAgent.loop.planned': '已根据结果规划下一步（第 {round} 轮，共 {max} 轮）。',
  'aiAgent.loop.done': '已完成：此请求无需再做其他事。',
  'aiAgent.loop.doneSummary': '已完成：{summary}',

  'aiAgent.reviews.changedSince': '其中有卡片在此之后已复习或改期，因此没有做任何更改。',
  'aiAgent.reviews.folderNotFound': '没有名为“{folder}”的卡组文件夹。',
};

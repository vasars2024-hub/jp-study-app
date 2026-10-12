// AI provider layer (see ./en.ts). Simplified Chinese.

import type { Catalog } from '../core';

export const AI_PROVIDERS_UI_ZH: Catalog = {
  'aiProv.cancel': '取消',
  'aiProv.saveFailed': '无法保存此更改，请重试。',

  'aiProv.vendor.local': '本地服务器（Ollama、LM Studio）',
  'aiProv.model.label': '模型',
  'aiProv.model.invalid': '模型名称不能包含空格。',
  'aiProv.modelHint.haiku': '快速且便宜：最适合字幕、快速分析等逐行处理。',
  'aiProv.modelHint.sonnet': '质量均衡，适合讲解、生成卡片和批改。',
  'aiProv.modelHint.opus': '能力最强，价格也最高。适合长篇作文和难题。',
  'aiProv.modelHint.deepseekFlash': '经济实惠，支持超长上下文。',
  'aiProv.modelHint.deepseekPro': '质量高于 Flash，价格也更高。',
  'aiProv.modelHint.openai': '输入你的 OpenAI 账户可用的任意模型。留空则使用 gpt-5-mini。',
  'aiProv.modelHint.local':
    '借助 Ollama 或 LM Studio 在你自己的电脑上运行。服务器在本机时，不会向互联网发送任何内容。',
  'aiProv.key.optional': 'API 密钥（可选）',
  'aiProv.local.url': '服务器地址',
  'aiProv.local.urlInvalid': '请输入不含用户名和密码的 http:// 或 https:// 地址。',
  'aiProv.local.ready': '已设置服务器地址和模型。',
  'aiProv.local.notReady': '要使用此服务器，请设置服务器地址和模型。',

  'aiProv.test.button': '测试连接',
  'aiProv.test.running': '正在测试…',
  'aiProv.test.ok': '已连接（{ms} 毫秒）。',
  'aiProv.test.okModel': '已连接到 {model}（{ms} 毫秒）。',
  'aiProv.test.failedStatus': '{reason}（HTTP {status}）',
  'aiProv.test.note':
    '测试只发送一个固定的词，绝不发送你的文本，并且只请求几个令牌的回复。云端测试与普通请求一样计入花费。',

  'aiProv.rates.none': '没有内置估价：如果此服务器收费，请输入费率',

  'aiProv.error.ai-off': 'AI 功能已关闭。请在“设置 → AI”中开启。',
  'aiProv.error.cloud-disabled': '此功能不允许使用云端。请在“设置 → AI”中允许，或将引擎切换为离线。',
  'aiProv.error.missing-credential': '尚未为此提供商保存 API 密钥（或本地服务器尚未设置）。',
  'aiProv.error.authentication': '提供商拒绝了 API 密钥。请检查密钥及其访问权限。',
  'aiProv.error.rate-limit': '已达到提供商的速率限制。请稍候再试。',
  'aiProv.error.upstream': '提供商返回了错误。请稍后再试。',
  'aiProv.error.network': '无法连接到提供商。请检查网络连接，或确认本地服务器正在运行。',
  'aiProv.error.timeout': '提供商响应时间过长。请减少项目数量。',
  'aiProv.error.cancelled': '已取消。',
  'aiProv.error.invalid-response': '无法使用提供商的回答。请重试或更换模型。',
  'aiProv.error.output-truncated': '回答在输出上限处被截断。请减少项目数量。',
  'aiProv.error.spend-budget': '这将超出你的每月 AI 花费上限（设置 → AI）。',
  'aiProv.error.cost-budget': '此请求超出了单次请求的费用上限。',
  'aiProv.error.vision-unsupported': '此模型无法读取图片。请选择支持图片的模型。',
  'aiProv.error.unknown-provider': '此版本的应用不认识这个 AI 提供商。',
  'aiProv.error.local-model-missing': '离线模型尚未安装。请在“设置 → AI”中安装。',
  'aiProv.error.generic': 'AI 请求失败。',

  'aiProv.mining.needKey': '生成卡片前，请先在“设置 → AI”中添加 {provider} 的 API 密钥。',
  'aiProv.mining.needLocalModel': '离线模型尚未安装。请在“设置 → AI”中安装，或将引擎切换为云端。',
  'aiProv.mining.noTerms': '请先在词典中为单词加星标，或切换到预设生成。',
  'aiProv.mining.noItems': 'AI 没有为此预设返回任何词汇。',
  'aiProv.mining.onlyDuplicates': 'AI 只返回了重复的词汇。请重试或更换提供商。',
  'aiProv.mining.noUsable': 'AI 返回了项目，但没有可用的词语。',

};

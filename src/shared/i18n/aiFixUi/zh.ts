// AI fixes pass — Chinese (Simplified). See ./en.ts.

import type { Catalog } from '../core';

export const AI_FIX_UI_ZH: Catalog = {
  'aiError.ai-off': 'AI 功能已在“设置 → AI”中关闭。',
  'aiError.no-key': '尚未保存 AI 服务的 API 密钥。请在“设置 → AI”中添加。',
  'aiError.consent': '尚未允许向此 AI 服务发送文本。',
  'aiError.auth': 'AI 服务拒绝了该 API 密钥。',
  'aiError.rate-limit': 'AI 服务正在限制请求频率，请稍后再试。',
  'aiError.spend': '这将超出在“设置 → AI”中设定的 AI 花费上限。',
  'aiError.too-long': '文本过长，无法在一次请求中发送。',
  'aiError.offline': '这台电脑处于离线状态，因此没有发送任何内容。',
  'aiError.network': '无法连接到 AI 服务。',
  'aiError.timeout': 'AI 请求超时。',
  'aiError.invalid': '无法读取 AI 的回答，请重试。',
  'aiError.truncated': 'AI 的回答在完成前被截断。请尝试更短的请求。',
  'aiError.no-local-model': '尚未安装离线 AI 模型。请在“设置 → AI”中安装。',
  'aiError.refused': '请求包含敏感数据，因此未发送。',
  'aiError.empty-input': '没有可发送的内容。',
  'aiError.no-answer': 'AI 跳过了此项。重试即可再次询问。',
  'aiError.ipc-failed': '应用无法连接到其后台进程，请重试。',
  'aiError.cancelled': '已取消。',
  'aiError.other': 'AI 请求失败。',

  'aiFix.analysis.needsConsent': '语法分析会把这句话及其译文发送给 {provider}。允许 {provider} 接收翻译文本后即可运行。',
  'aiFix.analysis.partial': '部分内容没有返回。此分析未保存；点击“重新解析”即可重试。',

  'aiFix.assistant.partial': '回答不完整，未保存。再次选择同一模式即可重试。',

  'aiFix.whisper.multilingualRequired': '所选的 Whisper 模型只支持日语。要转写这种语言，请在“设置 → 转写”中下载多语言模型（Whisper small、base 或 large-v3-turbo）。',
};

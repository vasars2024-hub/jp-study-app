// Translate engines pass (xlate2.) — Simplified Chinese.

import type { Catalog } from '../core';

export const TRANSLATE_ENGINES_UI_ZH: Catalog = {
  // ---- Engine names ----
  'xlate2.provider.local': '离线（小模型）',
  'xlate2.provider.localLarge': '离线·更高质量（更大、更慢）',

  // ---- Engine picker ----
  'xlate2.engine.label': '翻译引擎',
  'xlate2.engine.hint': '每个语言对（{pair}）分别记住。',
  'xlate2.engine.needsKey': '请在设置中添加 API 密钥',
  'xlate2.engine.notInstalled': '未安装',
  'xlate2.engine.fallback': '云端引擎失败时使用离线模型',
  'xlate2.engine.fallbackHint': '云端引擎不可用、被限流或超出预算时，改为离线翻译，而不是显示错误。',
  'xlate2.engine.largeMissing': '未安装更大的模型。应用无法自行下载：把 {file} 等更大的 Qwen3 模型放进应用的模型文件夹或“下载”文件夹，它就会出现在这里。需要 8 GB 以上内存，速度会慢好几倍。',
  'xlate2.engine.largeReady': '正在使用 {file}。每句所需时间是小模型的好几倍。',
  'xlate2.engine.cloudActive': '在这里用此语言对翻译的文本会发送给 {provider}（{host}）。阅读器弹窗、字幕和词典仍然离线翻译。',
  'xlate2.engine.cloudShort': '已发送给 {provider} 翻译',

  // ---- Consent ----
  'xlate2.consent.title': '要把文本发送给 {provider} 吗？',
  'xlate2.consent.body': '使用 {provider} 翻译时，你要翻译的文本会通过互联网发送到 {host}，并按 {provider} 的条款处理。文本会离开这台设备。',
  'xlate2.consent.scope': '只发送这段文本以及其中出现的术语表词条。你的历史、卡组和其余术语表都留在本机。',
  'xlate2.consent.billingMt': '使用你的 DeepL 密钥及其字符额度。付费用量计入设置中的每月 AI 支出上限。',
  'xlate2.consent.billingLlm': '使用你的 API 密钥。请求计入设置中的每月 AI 支出上限。',
  'xlate2.consent.allow': '允许 {provider}',
  'xlate2.consent.decline': '继续离线翻译',
  'xlate2.consent.revoke': '停止向 {provider} 发送文本',

  // ---- Progress and results ----
  'xlate2.progress.sentences': '已翻译句子：{done} / {total}',
  'xlate2.result.by': '翻译引擎：{provider}',
  'xlate2.result.fellBack': '{provider} 无法翻译这段文本（{reason}），已改用离线模型。',
  'xlate2.error.cloud': '{provider} 无法翻译这段文本：{reason}。',

  // ---- Why a cloud engine did not answer ----
  'xlate2.fallback.consent': '你尚未允许向它发送文本',
  'xlate2.fallback.noKey': '没有保存 API 密钥',
  'xlate2.fallback.auth': 'API 密钥被拒绝',
  'xlate2.fallback.rateLimit': '请求过多，请稍后再试',
  'xlate2.fallback.quota': '账户额度已用完',
  'xlate2.fallback.spend': '将超出每月支出上限',
  'xlate2.fallback.network': '无法连接到该服务',
  'xlate2.fallback.timeout': '请求超时',
  'xlate2.fallback.invalid': '返回的内容不是可用的译文',
  'xlate2.fallback.tooLong': '文本太长，无法一次发送',
  'xlate2.fallback.notInstalled': '模型未安装',
  'xlate2.fallback.unsupported': '不支持此语言对',
  'xlate2.fallback.other': '意外错误',

  // ---- Glossary ----
  'xlate2.glossary.toggle': '术语表（{count}）',
  'xlate2.glossary.title': '术语表',
  'xlate2.glossary.intro': '你希望始终用同一种译法的词，例如人名和固定说法。所有包含它们的翻译都会套用。',
  'xlate2.glossary.term': '术语',
  'xlate2.glossary.rendering': '始终译为',
  'xlate2.glossary.pairOnly': '仅用于 {pair}',
  'xlate2.glossary.add': '保存术语',
  'xlate2.glossary.saved': '已保存“{term}”。',
  'xlate2.glossary.invalid': '请输入术语以及与之不同的译法，各不超过 80 个字符。',
  'xlate2.glossary.suggestTitle': '来自你的卡组的建议（{count}）',
  'xlate2.glossary.useSuggestion': '添加',
  'xlate2.glossary.empty': '{pair} 还没有术语。',
  'xlate2.glossary.listLabel': '{pair} 的术语',
  'xlate2.glossary.allPairs': '所有语言对',
  'xlate2.glossary.fromDeck': '来自卡组',
  'xlate2.glossary.edit': '编辑',
  'xlate2.glossary.otherPairs': {
    other: '另有 {count} 个术语用于其他语言对。',
  },
  'xlate2.glossary.report': '遵循术语表的词条：{count} / {total}。',
  'xlate2.glossary.missing': '未遵循：{terms}。',

  // ---- Credentials row ----
  'xlate2.credential.deeplDesc': 'DeepL 的机器翻译 API，是翻译工作台的可选引擎。',
  'xlate2.credential.deeplFreeTier': 'DeepL API Free 的密钥以“:fx”结尾，每月有字符额度；当前上限请在 DeepL 账户中查看。',
  'xlate2.credential.useTranslate': '翻译工作台（可选云端引擎）',
};

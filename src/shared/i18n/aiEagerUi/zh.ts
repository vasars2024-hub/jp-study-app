// Eager AI strings — zh. See ./en.ts.

import type { Catalog } from '../core';

export const AI_EAGER_UI_ZH: Catalog = {
  // The Study command box parses a command without AI too; its intent labels
  // are shown by the non-AI path (`shared/studyFilterRecipe.ts`).
  'study.command.intent.undo-filter': '撤销上一次筛选更改',
  'study.command.intent.preview-anki': '预览 Anki 导出',
  'study.command.intent.preview-cards': '预览卡片',
  'study.command.intent.levels': '移除 {levels} 级别的词',
  'study.command.intent.minimum': '只保留至少出现 {count} 次的词',
  'study.command.intent.maximum': '最多保留 {count} 张卡片',
  'study.command.intent.excludeKnown': '排除已掌握的词',
  'study.command.intent.includeKnown': '包含已掌握的词',
  'study.command.intent.excludeDuplicates': '排除重复的词',
  'study.command.intent.includeDuplicates': '包含重复的词',
  'study.command.intent.excludeAnki': '排除已在 Anki 中的词',
  'study.command.intent.includeAnki': '包含已在 Anki 中的词',
  'study.command.intent.excludeNames': '排除人名等专有名词',
  'study.command.intent.includeNames': '包含人名等专有名词',

  // Agent plan refusals, resolved by code in the Agent workspace.
  'agent.plan.error.cloud-disabled': '智能体未被允许使用云端。请在 设置 → AI 中允许，或使用离线模型制定计划。',

  // "Suggest targets" on the daily goal: a rule first, AI optional.
  'aiTutor.goal.button': '建议目标',

  // Navigation entries for the conversation partner, shown in the command
  // palette and the Blanc tool list before any AI surface has opened.
  'blanc.tool.conversation': '对话伙伴',
  'blanc.tool.conversation.desc': '用你正在学的语言进行场景角色扮演：离线的脚本练习，或按你的水平回答的 AI 伙伴。',
  'aiSpeak.paletteTerms': '对话 伙伴 聊天 口语 练习 角色扮演',

  // Rendered with AI off or before any AI surface opens: the Settings > AI
  // per-feature permission rows (`shared/aiSetup.ts`), credential and mirror
  // settings rows, the settings search entry, the assistant card, and the
  // deck row's saved-extras button.
  'aiStudy.feature.whyWrong': '抽认卡中的“我为什么错了？”',
  'aiStudy.feature.whyWrong.desc': '打开“我为什么错了？”时，会发送卡片、你输入的答案以及卡组中几张相似的卡片。',
  'aiStudy.feature.exampleSentences': 'i+1 例句',
  'aiStudy.feature.exampleSentences.desc': '请求例句时，会发送卡片以及最多 200 个你已掌握的词作为样本。',
  'aiStudy.feature.leechRescue': '顽固卡片救援建议',
  'aiStudy.feature.leechRescue.desc': '请求救援时，会发送该顽固卡片以及卡组中几张相似的卡片。',
  'aiStudy.feature.contextExplain': '弹出词典中的“结合语境解释”',
  'aiStudy.feature.contextExplain.desc': '按下“结合语境解释”时，会发送该词、它所在的句子及其词典义项。',
  'aiStudy.close': '关闭',
  'aiStudy.extras.open': '{word} 的例句和笔记',
  'aiStudy.extras.panel': '例句和笔记：{word}',
  // Blanc Deck tool: the row button that opens the same saved-extras panel.
  'blanc.shell.deck.extras': '笔记',
  'aiProv.features.title': '允许使用云端的功能',
  'aiProv.features.desc':
    '使用云端引擎时，只有在这里开启的功能才会把文本发送给提供商。其他功能使用离线模型，或保持关闭。',
  'aiProv.feature.cardGen': 'AI 卡片工作室',
  'aiProv.feature.cardGen.desc': '按下“生成”时，会发送你选择的单词和预设。',
  'aiProv.feature.mirror': '镜像写作反馈',
  'aiProv.feature.mirror.desc': '按下“评估”时，会发送你的草稿、思路图和参考答案。',
  'aiProv.feature.subtitleTranslate': '后台字幕翻译',
  'aiProv.feature.subtitleTranslate.desc':
    '对于你播放的剧集或标记为“在看”的作品，无需按按钮就会发送整条字幕轨。关闭时，由离线模型翻译。',
  'aiProv.credential.anthropic.desc': '在所有云端 AI 功能中使用 Claude Haiku、Sonnet 和 Opus。',
  'aiProv.credential.openai.desc': '在所有云端 AI 功能中使用 OpenAI 模型。',
  'aiProv.credential.compat.desc': '仅当你的 OpenAI 兼容服务器要求密钥时才需要。Ollama 和 LM Studio 不需要。',
  'aiProv.credential.mirror.desc': '镜像写作可将草稿发送到的自定义端点所用的密钥。',
  'aiProv.credential.use.mirror': '镜像写作（自定义端点）',
  'aiProv.mirror.backend.appAi': '应用 AI（设置 → AI）',
  'aiProv.mirror.appAiNote': '草稿由“设置 → AI”中选定的引擎和提供商评分。',
  'aiProv.mirror.appAiNotReady': 'AI 尚未设置，目前由快速检查评分。',
  'aiProv.mirror.model': '模型',
  'aiProv.mirror.modelHint': 'OpenAI、Ollama 和 LM Studio 需要模型名称，例如 gpt-5-mini 或 qwen3:8b。',
  'aiProv.mirror.urlHint':
    '完整的 chat-completions 地址，或基础地址，例如 http://localhost:11434/v1（Ollama）或 http://localhost:1234/v1（LM Studio）。',
  'aiProv.mirror.keyPlaceholder': '粘贴密钥（可选）',
  'aiProv.mirror.keySave': '保存密钥',
  'aiProv.mirror.keyRemove': '移除密钥',
  'aiProv.mirror.keySaved': '密钥已保存在加密保管库中。',
  'aiProv.mirror.keyNone': '未保存密钥。本地服务器不需要密钥。',
  'aiProv.mirror.keyFailed': '无法保存密钥。',
  'aiAgent.feature.agentChat': '智能体聊天与计划',
  'aiAgent.feature.agentChat.desc':
    '发送给云端模型或用云端模型制定计划时，会发送你的消息、之前的对话和你附加的上下文。除非你在智能体设置中允许，已保存的单词和复习结果会留在本设备上。',
  'aiAgent.feature.mediaAssistant': '视频与视觉小说学习助手',
  'aiAgent.feature.mediaAssistant.desc': '选择助手模式时，会发送当前台词和标题。',
  'aiAgent.feature.subtitleFusion': '字幕融合的第二意见',
  'aiAgent.feature.subtitleFusion.desc': '在已设置云端模型的情况下运行融合任务时，会发送有争议的转录行及其参考译文。',
  'aiAgent.feature.ankiAdditions': '牌组工作台 AI 补充',
  'aiAgent.feature.ankiAdditions.desc': '按下“生成”或“翻译”时，会发送你选择的笔记字段。',
  'aiImmerse.feature.mediaBrief': '视频摘要与理解题',
  'aiImmerse.feature.mediaBrief.desc': '按下“摘要和问题”时，分段发送你正在学习的视频的字幕。',
  'aiImmerse.feature.linePick': '挑选最适合制卡的 i+1 句子',
  'aiImmerse.feature.linePick.desc': '按下“用 AI 选句”时，发送最多 24 句只含一个生词的句子。',
  'aiImmerse.feature.readerExplain': '讲解 i+1 句子（阅读器）',
  'aiImmerse.feature.readerExplain.desc': '按下“讲解”时，发送沉浸式阅读器中的句子及其段落。',
  'aiImmerse.feature.readerSimplify': '简化段落（阅读器）',
  'aiImmerse.feature.readerSimplify.desc': '按下“简化”时，发送一个段落（最多 1,500 字）及其中的生词。',
  'aiImmerse.feature.vnExplain': '讲解视觉小说的台词',
  'aiImmerse.feature.vnExplain.desc': '按下“讲解”或 E 时，发送该台词、说话人和前面的台词。',
  'aiImmerse.feature.vnTranslate': '结合上下文翻译视觉小说台词',
  'aiImmerse.feature.vnTranslate.desc': '发送没有译文的台词、说话人以及前两句台词。',
  'aiImmerse.feature.studyCommand': '理解自由输入的学习指令',
  'aiImmerse.feature.studyCommand.desc': '当内置说法无法匹配时，发送你在学习指令框中输入的内容。',
  'aiTutor.feature.grammarExplain': '语法：“解释这个句型”',
  'aiTutor.feature.grammarExplain.desc': '按下“解释这个句型”时，发送该语法点（句型、级别、释义）。',
  'aiTutor.feature.grammarExamples': '语法：生成例句',
  'aiTutor.feature.grammarExamples.desc': '请求新例句时，发送该语法点及其现有例句。',
  'aiTutor.feature.grammarProduction': '语法：检查我的句子',
  'aiTutor.feature.grammarProduction.desc': '按下“检查”时，发送该语法点和你写的句子。',
  'aiTutor.feature.grammarSighting': '语法：检查出现位置',
  'aiTutor.feature.grammarSighting.desc': '按下“用 AI 检查”时，发送你自己的材料中发现该句型的句子（最多 6 句）。',
  'aiTutor.feature.statsCoach': '统计：“解释我的统计”',
  'aiTutor.feature.statsCoach.desc': '发送复习的数字摘要（只有数量和百分比，不含单词或标题）。还需要在智能体设置中允许共享学习数据。',
  'aiTutor.feature.goalSuggest': '每日目标建议',
  'aiTutor.feature.goalSuggest.desc': '发送两周学习平均值和当前目标。还需要在智能体设置中允许共享学习数据。',
  'aiTutor.feature.eventParse': '日历：用文字描述日程',
  'aiTutor.feature.eventParse.desc': '按下“问 AI”时，发送你输入的句子和今天的日期。',
  'aiTutor.feature.placementQuiz': '首次设置的水平测试',
  'aiTutor.feature.placementQuiz.desc': '只发送学习语言和界面语言以获取题目；答案在本机评分。',
  'aiTutor.feature.settingsHelp': '设置帮助',
  'aiTutor.feature.settingsHelp.desc': '搜索没有结果并按下“问 AI”时，发送你的问题和设置名称列表。',
  'aiTutor.feature.blancMistake': 'Blanc：“解释我的错误”',
  'aiTutor.feature.blancMistake.desc': '发送练习题、正确答案和你的答案。',
  'aiTutor.feature.blancSummary': 'Blanc：汉字记忆法和文本摘要',
  'aiTutor.feature.blancSummary.desc': '发送汉字及其词典释义，或文本样本（最多 800 字）及其生词。',
  'aiTutor.settings.foundModel': 'AI 对“{query}”的建议（搜索没有结果）：',
  'aiTutor.settings.reason': '（{reason}）',
  'aiSpeak.feature.shadowingFeedback': '解释我的跟读结果',
  'aiSpeak.feature.shadowingFeedback.desc': '按“用 AI 解释”时，发送字幕句子、语音模型听到的内容和分数。你的录音不会离开这台电脑。',
  'aiSpeak.feature.conversationPartner': '对话伙伴',
  'aiSpeak.feature.conversationPartner.desc': '发送你的消息、最近 12 轮对话和你的水平。只有在允许学习数据离开本机时（智能体设置）才会发送已知词样本。',
  'aiSpeak.feature.writingCorrection': '批改我的写作',
  'aiSpeak.feature.writingCorrection.desc': '按“批改我的…”时，发送笔记或选中的文字（最多 2,000 字）。',
  'aiSpeak.feature.journalGrade': '给我的日记评分',
  'aiSpeak.feature.journalGrade.desc': '按“用 AI 评分”时，发送日记内容和题目中的词语。',

  // Section labels of the "Notes" field an export writes for a card's saved
  // extras (`shared/cardAiExtras.ts`): deck CSV, local package, AnkiConnect.
  'deckExport.notes.mnemonic': '记忆提示',
  'deckExport.notes.distinction': '不要混淆',
  'deckExport.notes.examples': '例句',
  'deckExport.notes.accepted': '也算正确',
};

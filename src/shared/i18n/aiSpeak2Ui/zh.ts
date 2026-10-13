// Speaking and writing, round 2 — Chinese (Simplified). See ./en.ts.

import type { Catalog } from '../core';

export const AI_SPEAK2_UI_ZH: Catalog = {
  // ---- shadowing: pitch and rhythm ----
  'aiSpeak.prosody.title': '音高与节奏（根据你的录音测量）',
  'aiSpeak.prosody.skipped.not-comparable': '当你的跟读与原句足够接近时（发音相似度 60% 以上，音节数大致相同），才会测量音高与节奏。',
  'aiSpeak.prosody.skipped.no-audio': '无法从你的录音中读取音高与节奏。',
  'aiSpeak.prosody.skipped.no-voice': '录音中没有可测量的人声。',
  'aiSpeak.prosody.accentScore': '与词典一致的声调重音：{total} 个词中 {matched} 个。',
  'aiSpeak.prosody.noPitchDictionary': '未安装音高重音词典，因此只测量了节奏。可在“设置 → 词典”中添加。',
  'aiSpeak.prosody.noPitchWords': '音高词典中没有这句话的词，因此只测量了节奏。',
  'aiSpeak.prosody.unvoiced': '发声部分太少，无法判断音高。请大声一点再说一遍。',
  'aiSpeak.prosody.pattern.heiban': '平板型',
  'aiSpeak.prosody.pattern.atamadaka': '头高型（第一拍后下降）',
  'aiSpeak.prosody.pattern.nakadaka': '中高型（先升后在词中下降）',
  'aiSpeak.prosody.pattern.odaka': '尾高型（在后面的助词上下降）',
  'aiSpeak.prosody.pattern.unknown': '未知',
  'aiSpeak.prosody.verdict.match': '与词典一致：{expected}。',
  'aiSpeak.prosody.verdict.mismatch': '词典：{expected}。你：{heard}。',
  'aiSpeak.prosody.verdict.unclear': '词典：{expected}。发声太少，无法判断。',
  'aiSpeak.prosody.legend': '圆点：词典中的高拍和低拍（虚线为词后的助词）。线：你的音高。',
  'aiSpeak.prosody.rate.ja': '说话时的速度：每秒 {rate} 拍。原句：{cue} 拍。',
  'aiSpeak.prosody.rate.zh': '说话时的速度：每秒 {rate} 个音节。原句：{cue} 个。',
  'aiSpeak.prosody.rateOnly.ja': '说话时的速度：每秒 {rate} 拍。',
  'aiSpeak.prosody.rateOnly.zh': '说话时的速度：每秒 {rate} 个音节。',
  'aiSpeak.prosody.pauseInside': '你在“{word}”中间停顿了 {sec} 秒。',
  'aiSpeak.prosody.pauseAfter': '你在“{word}”之后停顿了 {sec} 秒，而原句此处没有逗号。',
  'aiSpeak.prosody.noPauses': '句中没有停顿。',
  'aiSpeak.prosody.estimate': '在这台电脑上测量的估计值：每一拍的音高取自你说话时长的均等部分。',

  // ---- conversation partner ----
  'aiSpeak.chat.unanswered': '你的最后一条消息还没有回复。',
  'aiSpeak.chat.retry': '重试回复',
  'aiSpeak.chat.voiceSend': '说完立即发送',
  'aiSpeak.chat.recall': '对方会尝试用回你在之前对话中遇到的词：',
  'aiSpeak.chat.recallScripted': '试着用上之前对话中遇到的词：',
  'aiSpeak.chat.recallUsed': '来自之前的对话：{words}',
  'aiSpeak.chat.correctionCardBack': '{reason}（你写的是：{original}）',

  // ---- writing help: cards, history, journal streak ----
  'aiSpeak.write.tab.history': '历史',
  'aiSpeak.write.saveCard': '保存为卡片',
  'aiSpeak.history.empty': '你收到的修改会保存在这里，方便看出哪些错误反复出现。',
  'aiSpeak.history.kinds': '最常见的修改：{kinds}。',
  'aiSpeak.history.kindCount': { other: '{kind}（{count} 次）' },
  'aiSpeak.history.changes': { other: '{count} 处修改' },
  'aiSpeak.history.clear': '清除历史',
  'aiSpeak.journal.streakToday': { other: '日记连续记录：{count} 天（最佳：{best} 天）。今天已完成。' },
  'aiSpeak.journal.streakOpen': { other: '日记连续记录：{count} 天（最佳：{best} 天）。完成今天的日记以保持记录。' },
  'aiSpeak.journal.streakNone': '完成一篇日记（用上所有词，写够句子）即可开始连续记录。',
};

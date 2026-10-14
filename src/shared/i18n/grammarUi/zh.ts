// Grammar strings (example audio, test enrolment offer, content language) — Chinese. See ./en.ts.
import type { Catalog } from '../core';

export const GRAMMAR_UI_ZH: Catalog = {
  'grammarUi.contentLang': '讲解为英文',
  'grammarUi.contentLangHint': '语法讲解和译文均为英文，例句使用你正在学习的语言。',

  'grammarUi.audio.play': '收听这个例句',
  'grammarUi.audio.stop': '停止播放例句',
  'grammarUi.audio.loading': '正在准备音频…',
  'grammarUi.audio.noVoice.ja': '未安装离线日语语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加日语，然后重试。',
  'grammarUi.audio.noVoice.zh': '未安装离线中文语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加中文（简体），然后重试。',
  'grammarUi.audio.noVoice.ru': '未安装离线俄语语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加俄语，然后重试。',
  'grammarUi.audio.noSynthesizer': '这台电脑没有离线语音合成器，无法朗读例句。',
  'grammarUi.audio.failed': '无法朗读这个例句，请稍后重试。',

  'grammarUi.test.offerHint': {
    other: '你回答了 {count} 个尚未加入复习的语法点。练习测试不会自动把新语法点加入复习。',
  },
  'grammarUi.test.offerAdd': {
    other: '将 {count} 个新语法点加入复习',
  },
  'grammarUi.test.offerDone': {
    other: '已将 {count} 个语法点加入复习，到期时会再次出现。',
  },
};

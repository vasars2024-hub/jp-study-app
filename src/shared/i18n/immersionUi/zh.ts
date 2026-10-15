// Immersion browser strings (coded Reader Mode errors, read-aloud) — Simplified Chinese. See ./en.ts.
import type { Catalog } from '../core';

export const IMMERSION_UI_ZH: Catalog = {
  'immersionUi.error.noArticle': '此页面上没有找到可阅读的文章。切换到实时模式即可按原样阅读。',
  'immersionUi.error.timeout': '页面加载时间过长。请检查网络连接后重试。',
  'immersionUi.error.http': '网站返回了错误 {status}，因此没有可显示的文章。',
  'immersionUi.error.notHtml': '此地址是文件而不是网页，阅读模式无法显示。',
  'immersionUi.error.badUrl': '请输入以 http:// 或 https:// 开头的完整网址。',
  'immersionUi.error.network': '无法访问该页面。请检查网络连接和网址后重试。',
  'immersionUi.error.failed': '无法读取此页面。请重试，或切换到实时模式。',

  'immersionUi.readAloud.aria': '朗读',
  'immersionUi.readAloud.article': '朗读',
  'immersionUi.readAloud.articleTitle': '逐句朗读整篇文章',
  'immersionUi.readAloud.paragraph': '本段',
  'immersionUi.readAloud.paragraphTitle': '只朗读当前所在的段落：选中文字所在的段落，否则为屏幕上的第一段',
  'immersionUi.readAloud.pause': '暂停',
  'immersionUi.readAloud.resume': '继续',
  'immersionUi.readAloud.stop': '停止',
  'immersionUi.readAloud.speed': '朗读速度',
  'immersionUi.readAloud.loading': '正在准备音频…',
  'immersionUi.readAloud.progress': '第 {current} 句，共 {total} 句',
  'immersionUi.readAloud.nothing': '此页面上没有可朗读的文字。',
  'immersionUi.readAloud.noVoice.ja': '未安装日语离线语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加日语，然后重试。',
  'immersionUi.readAloud.noVoice.zh': '未安装中文离线语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加中文（简体），然后重试。',
  'immersionUi.readAloud.noVoice.ru': '未安装俄语离线语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加俄语，然后重试。',
  'immersionUi.readAloud.noVoice.en': '未安装英语离线语音。在 Windows 中打开“设置”>“时间和语言”>“语音”，选择“添加语音”并添加英语，然后重试。',
  'immersionUi.readAloud.noSynthesizer': '这台电脑没有离线语音合成器，因此无法朗读文章。',
  'immersionUi.readAloud.failed': '无法朗读这一句。请按“朗读”重试。',
};

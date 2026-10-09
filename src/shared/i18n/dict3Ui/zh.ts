// 词典（对标 Yomitan）：变形追溯、结果布局、音频来源、JMdict 优先级说明、
// 多牌组“已在 Anki”。键名前缀 dict3.。

import type { Catalog } from '../core';

export const DICT3_UI_ZH: Catalog = {
  // ---- 变形追溯 ----
  'dict3.trace.aria': '{source} 追溯到 {term}：{steps}',
  'dict3.trace.openGrammar': '在语法浏览器中打开“{step}”',

  // ---- JMdict 优先级 ----
  'dict3.prio.title': 'JMdict 词表：',
  'dict3.prio.news1': '《每日新闻》词频表，前 12,000 词',
  'dict3.prio.news2': '《每日新闻》词频表，第 12,001–24,000 词',
  'dict3.prio.ichi1': '《一万语语汇分类集》，约一万个常用词',
  'dict3.prio.ichi2': '收录于《一万语语汇分类集》，但在报纸中较少见',
  'dict3.prio.spec1': 'JMdict 编者标记为常用',
  'dict3.prio.spec2': 'JMdict 编者标记为较常用',
  'dict3.prio.gai1': '常用外来语',
  'dict3.prio.gai2': '较少用的外来语',
  'dict3.prio.nf': '报纸词频排名 {from}–{to}',

  // ---- 已在 Anki ----
  'dict3.presence.ankiWhere': '已在 Anki 中：{targets}',

  // ---- 分组 ----
  'dict3.sections.showMore': {
    other: '再显示 {count} 部词典',
  },
  'dict3.sections.showFewer': '收起其他词典',

  // ---- 音频选择 ----
  'dict3.audio.picker': '{word} 的音频来源',
  'dict3.audio.auto': '自动',
  'dict3.audio.optionHas': '{name}（有）',
  'dict3.audio.optionMissing': '{name}（无）',

  // ---- 设置 ----
  'dict3.settings.layoutTitle': '结果布局',
  'dict3.settings.layoutIntro': '一个词出现在多部词典中时的显示方式，适用于应用、弹窗和浏览器扩展。',
  'dict3.settings.grouped': '按词典分组（每部词典一个分区）',
  'dict3.settings.merged': '合并为一个列表（每个释义标注所属词典）',
  'dict3.settings.collapse': '第一部之后的词典默认折叠',
  'dict3.settings.dragHint': '拖动词典或使用箭头调整顺序。',
  'dict3.settings.audioTitle': '音频来源',
  'dict3.settings.audioIntro': '按此顺序查找发音；某个来源没有录音时改用下一个。每个词条也可以单独选择一个来源。',
  'dict3.settings.audioUse': '使用此音频来源',
  'dict3.settings.audioCdn': 'JapanesePod101 录音，仅在点击播放时获取，之后可离线使用',
  'dict3.settings.audioMissingFolder': '找不到文件夹',
  'dict3.settings.audioFiles': {
    other: '找到 {files} 个录音',
  },
  'dict3.settings.audioUp': '优先尝试',
  'dict3.settings.audioDown': '稍后尝试',
  'dict3.settings.audioAddFolder': '添加本地音频文件夹',
  'dict3.settings.audioLayouts':
    '本地文件夹只读取，不会下载任何内容。可识别“读音 - 单词.mp3”（JapanesePod101 格式）或任意子文件夹中的“单词.mp3”（Forvo 格式）；支持 mp3、ogg、opus、m4a、aac、wav 和 flac。',
};

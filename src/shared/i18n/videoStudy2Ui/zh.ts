// Video study, round 2 (vstudy.) — Chinese (Simplified).

import type { Catalog } from '../core';

export const VIDEO_STUDY2_UI_ZH: Catalog = {
  'vstudy.pad.group': '卡片音频',
  'vstudy.pad.before': '前置留白',
  'vstudy.pad.after': '后置留白',
  'vstudy.pad.ms': '{ms} 毫秒',
  'vstudy.pad.stopAtNeighbours': '不延伸到上一句或下一句',
  'vstudy.pad.note': '用于采集的音频、片段以及压缩音频。',

  'vstudy.condensed.button': '压缩音频（MP3）',
  'vstudy.condensed.hint': '把本集所有台词连在一起，做成一个 MP3，随时随地都能听。',
  'vstudy.condensed.progress': '正在剪切台词… {done} / {total}',
  'vstudy.condensed.cancel': '停止',
  'vstudy.condensed.done': '压缩音频已保存：共 {minutes} 分钟台词。',
  'vstudy.condensed.skipped': {
    other: '有 {count} 句无法剪切，已略过。',
  },
  'vstudy.condensed.failed': '无法生成压缩音频：这个文件中没有能剪切的台词。',
  'vstudy.condensed.empty': '这条字幕轨没有可压缩的台词。',
  'vstudy.condensed.cancelled': '已停止生成压缩音频。',

  'vstudy.align.previous': '上一句从现在开始',
  'vstudy.align.next': '下一句从现在开始',
  'vstudy.align.hint': '在听到这句台词时按下：字幕延迟会被设置为让这句从此刻开始。',
  'vstudy.align.none': '这里没有可以对齐的台词。',
  'vstudy.align.done': '字幕延迟已设为 {delay} 秒。',

  'vstudy.keys.title': '键盘快捷键',
  'vstudy.keys.study': '学习按键',
  'vstudy.keys.unbound': '未设置',
  'vstudy.keys.note': '按 ? 显示或隐藏此列表。学习按键可在“设置 › 键盘快捷键”中更改。',

  'vstudy.frame.notOnScreen': '播放这句台词即可截图：流媒体没有可截取画面的文件。',
};

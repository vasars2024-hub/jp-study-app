// Product pass 6: key sequences, palette scopes and search-by-key (kbd6.) — zh.

import type { Catalog } from '../core';

export const KBD6_UI_ZH: Catalog = {
  'kbd6.keys.sequence': '{first}，然后 {next}',
  'kbd6.seq.waiting': '已按下 {keys}。正在等待下一个键…',
  'kbd6.seq.noCommand': '{keys} 不是快捷键。',
  'kbd6.palette.group.here': '当前视图',
  'kbd6.palette.group.keys': '绑定到 {keys}',
  'kbd6.palette.worksHere': '在此可用',
  'kbd6.palette.switchTo': '请先切换到“{place}”',
  'kbd6.palette.openFirst': '请先打开“{place}”',
  'kbd6.conflict.startsTheirs': '{lead} 是 {name} 的按键序列 {sequence} 的开头',
  'kbd6.conflict.startsMine': '{name} 使用的 {lead} 是此序列的开头',
  'kbd6.settings.sequenceStart': '请按下序列的第一个键…',
  'kbd6.settings.stepsSoFar': '{keys} … 按下一个键，或稍等即可保存',
  'kbd6.settings.recordSequence': '录制按键序列',
  'kbd6.settings.recordSequenceHint': '依次按下的多个键，例如先按 Ctrl+K 再按 S。稍等即保存；按 Esc 取消。',
  'kbd6.settings.findByKeys': '按键查找',
  'kbd6.settings.findByKeysHint': '按下快捷键，查看它绑定到了什么',
  'kbd6.settings.findListening': '请按下要查找的键，然后稍等。按 Esc 取消。',
  'kbd6.settings.findListeningShort': '正在监听…',
  'kbd6.settings.keyFilter': '按键：{keys}',
  'kbd6.settings.clearKeyFilter': '清除按键筛选（{keys}）',
  'kbd6.settings.keyFilterCount': { other: '使用 {keys} 的快捷键：{count} 个' },
};

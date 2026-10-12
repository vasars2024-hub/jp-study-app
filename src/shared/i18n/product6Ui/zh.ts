// Product pass 6: Soundscape engine (snd6.) and widget polish (wid6.) — zh.

import type { Catalog } from '../core';

export const PRODUCT6_UI_ZH: Catalog = {
  // ---- Soundscape: per-layer tone and pan ----
  'snd6.shape.open': '音色与声像：{name}',
  'snd6.shape.openShaped': '音色与声像：{name}（已调整）',
  'snd6.shape.groupOf': '{name} 的音色与声像',
  'snd6.shape.tone': '音色',
  'snd6.shape.pan': '声像',
  'snd6.shape.toneOf': '{name} 音色',
  'snd6.shape.panOf': '{name} 声像',
  'snd6.shape.toneNeutral': '标准',
  'snd6.shape.darker': '偏暗 {percent}%',
  'snd6.shape.brighter': '偏亮 {percent}%',
  'snd6.shape.centre': '居中',
  'snd6.shape.left': '偏左 {percent}%',
  'snd6.shape.right': '偏右 {percent}%',
  'snd6.shape.reset': '重置音色与声像',

  // ---- Soundscape: saved mixes as a file ----
  'snd6.mixes.heading': '混音文件',
  'snd6.mixes.export': '导出',
  'snd6.mixes.copy': '复制',
  'snd6.mixes.import': '导入',
  'snd6.mixes.paste': '粘贴',
  'snd6.mixes.pasteLabel': '要导入的混音',
  'snd6.mixes.pastePlaceholder': '在此粘贴导出的混音',
  'snd6.mixes.importPasted': '导入粘贴的混音',
  'snd6.mixes.exported': '已保存 {name}',
  'snd6.mixes.exportFailed': '无法保存文件。',
  'snd6.mixes.copied': '已复制 {count} 个混音。',
  'snd6.mixes.copyFailed': '无法复制到剪贴板。',
  'snd6.mixes.added': '已添加 {count} 个混音。',
  'snd6.mixes.duplicates': '{count} 个已保存过。',
  'snd6.mixes.overflow': '还有 {count} 个放不下（上限 {max} 个）。',
  'snd6.mixes.importFailed': '无法导入：{error}',
  'snd6.mixes.error.notJson': '这不是 JSON 文件。',
  'snd6.mixes.error.notMixes': '这不是声景混音文件。',
  'snd6.mixes.error.empty': '其中没有可以听到声音的混音。',

  // ---- Soundscape: ducking for speech and video ----
  'snd6.duck.speech': '播放语音和视频时降低音量',
  'snd6.duck.nowSpeech': '正在播放语音或视频，已降低音量',
  'snd6.duck.nowMusic': '正在播放音乐，已降低音量',

  // ---- Widgets: gallery preview ----
  'wid6.gallery.preview': '预览',
  'wid6.gallery.previewOf': '{name} 预览',
  'wid6.gallery.defaultSize': '默认尺寸 {w} × {h}',
  'wid6.gallery.favoriteNamed': '将 {name} 加入收藏',
  'wid6.gallery.unfavoriteNamed': '将 {name} 移出收藏',
  'wid6.gallery.addNamed': '添加 {name}',
  'wid6.gallery.addAnotherNamed': '再添加一个 {name}',

  // ---- Widgets: alignment guides ----
  'wid6.drag.hint': '拖动以移动。边缘会对齐其他小组件；按住 Alt 可自由放置。',
  'wid6.drag.hintAero': '{drag}。边缘会对齐其他小工具；按住 Alt 可自由放置。',
  'wid6.guides.readout': '位置 X:{x} Y:{y}',
  'wid6.guides.size': '尺寸 {w}×{h}',
};

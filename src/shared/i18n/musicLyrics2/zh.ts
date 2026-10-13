// Music lyrics pass 2: karaoke timing nudge, bilingual sheets, offline lyrics folder. — Chinese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_LYRICS2_ZH: Catalog = {
  'musicLyrics2.offset.label': '时间轴',
  'musicLyrics2.offset.group': '这首歌的歌词时间轴',
  'musicLyrics2.offset.earlier': '歌词提前 0.1 秒显示',
  'musicLyrics2.offset.later': '歌词推迟 0.1 秒显示',
  'musicLyrics2.offset.reset': '这首歌的歌词时间轴：{value}。点击重置。',
  'musicLyrics2.translation': '译文',
  'musicLyrics2.source.folder': '来自你的歌词文件夹',
  'musicLyrics2.folder.pick': '歌词文件夹…',
  'musicLyrics2.folder.pickTitle': '选择一个 .lrc 文件夹。按文件名或 [ti:]/[ar:] 标签匹配歌曲，最多向下查找三层。',
  'musicLyrics2.folder.current': '歌词文件夹：{folder}',
  'musicLyrics2.folder.clear': '取消歌词文件夹',
  'musicLyrics2.folder.dialogTitle': '选择 .lrc 歌词文件所在的文件夹',
};

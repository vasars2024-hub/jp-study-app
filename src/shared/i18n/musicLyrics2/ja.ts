// Music lyrics pass 2: karaoke timing nudge, bilingual sheets, offline lyrics folder. — Japanese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_LYRICS2_JA: Catalog = {
  'musicLyrics2.offset.label': 'タイミング',
  'musicLyrics2.offset.group': 'この曲の歌詞タイミング',
  'musicLyrics2.offset.earlier': '歌詞を0.1秒早く表示',
  'musicLyrics2.offset.later': '歌詞を0.1秒遅く表示',
  'musicLyrics2.offset.reset': 'この曲の歌詞タイミング：{value}。クリックでリセット。',
  'musicLyrics2.translation': '訳',
  'musicLyrics2.source.folder': '歌詞フォルダーの歌詞',
  'musicLyrics2.folder.pick': '歌詞フォルダー…',
  'musicLyrics2.folder.pickTitle': '.lrcファイルのフォルダーを選びます。ファイル名または[ti:]/[ar:]タグで曲と照合します（3階層まで）。',
  'musicLyrics2.folder.current': '歌詞フォルダー：{folder}',
  'musicLyrics2.folder.clear': '歌詞フォルダーの設定を解除',
  'musicLyrics2.folder.dialogTitle': '.lrc歌詞ファイルのフォルダーを選択',
};

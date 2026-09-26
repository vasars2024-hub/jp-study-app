// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — Chinese (Simplified). See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_UI_ZH: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': '无法打开该文件，是否已被移动？',
  // User playlists: the picker, its actions and the song menu.
  'musicUi.playlists.label': '播放列表',
  'musicUi.playlists.allSongs': '全部歌曲',
  'musicUi.playlists.option': '{name}（{count} 首）',
  'musicUi.playlists.new': '新建播放列表',
  'musicUi.playlists.defaultName': '播放列表 {n}',
  'musicUi.playlists.play': '播放',
  'musicUi.playlists.rename': '重命名',
  'musicUi.playlists.delete': '删除',
  'musicUi.playlists.deleteConfirm': '删除“{name}”？',
  'musicUi.playlists.nameLabel': '播放列表名称',
  'musicUi.playlists.save': '保存',
  'musicUi.playlists.cancel': '取消',
  'musicUi.playlists.empty': '这个播放列表是空的。在“全部歌曲”中右键点击歌曲即可添加。',
  'musicUi.playlists.addTo': '添加到“{name}”',
  'musicUi.playlists.alreadyIn': '已在“{name}”中',
  'musicUi.playlists.newWithSong': '用这首歌新建播放列表',
  'musicUi.playlists.moveUp': '上移',
  'musicUi.playlists.moveDown': '下移',
  'musicUi.playlists.remove': '从播放列表中移除',
  'musicUi.playlists.added': '已添加到“{name}”。',
  'musicUi.playlists.nothingToPlay': '这个播放列表中的歌曲目前都不在曲库里。',
  'musicUi.playlists.paletteGroup': '播放列表',
  'musicUi.playlists.paletteSub': '播放列表 · {count} 首歌',
  'musicUi.viz.wallpaperOnly': '可视化效果当前设置为只在壁纸上显示',
  'musicUi.viz.off': '可视化效果已关闭',
  'musicUi.viz.showHereToo': '也在这里显示',
  'musicUi.viz.turnOn': '开启',
  'musicUi.viz.fftOption': 'FFT 点数 {size}',
  // The empty song list offers the import itself.
  'musicUi.empty.addFolder': '添加音乐文件夹…',
  'musicUi.empty.noneAdded': '该文件夹中没有找到音频文件。',
  'musicUi.empty.addFailed': '无法添加该文件夹。请重试，或将文件放入媒体监视文件夹。',
};

// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — Chinese (Simplified). See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_UI_ZH: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': '无法打开该文件，是否已被移动？',
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

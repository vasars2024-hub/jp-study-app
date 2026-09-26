// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — Japanese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_UI_JA: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': 'このファイルを開けませんでした。移動されていませんか？',
  'musicUi.viz.wallpaperOnly': 'ビジュアライザーは壁紙にだけ表示する設定です',
  'musicUi.viz.off': 'ビジュアライザーはオフです',
  'musicUi.viz.showHereToo': 'ここにも表示する',
  'musicUi.viz.turnOn': 'オンにする',
  'musicUi.viz.fftOption': 'FFT サイズ {size}',
  // The empty song list offers the import itself.
  'musicUi.empty.addFolder': '音楽フォルダを追加…',
  'musicUi.empty.noneAdded': 'そのフォルダに音声ファイルは見つかりませんでした。',
  'musicUi.empty.addFailed': 'フォルダを追加できませんでした。もう一度試すか、ファイルをメディアの監視フォルダに入れてください。',
};

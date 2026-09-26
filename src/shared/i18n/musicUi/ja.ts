// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — Japanese. See ./en.ts for scope.

import type { Catalog } from '../core';

export const MUSIC_UI_JA: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': 'このファイルを開けませんでした。移動されていませんか？',
  // User playlists: the picker, its actions and the song menu.
  'musicUi.playlists.label': 'プレイリスト',
  'musicUi.playlists.allSongs': 'すべての曲',
  'musicUi.playlists.option': '{name}（{count} 曲）',
  'musicUi.playlists.new': '新しいプレイリスト',
  'musicUi.playlists.defaultName': 'プレイリスト {n}',
  'musicUi.playlists.play': '再生',
  'musicUi.playlists.rename': '名前を変更',
  'musicUi.playlists.delete': '削除',
  'musicUi.playlists.deleteConfirm': '「{name}」を削除しますか？',
  'musicUi.playlists.nameLabel': 'プレイリスト名',
  'musicUi.playlists.save': '保存',
  'musicUi.playlists.cancel': 'キャンセル',
  'musicUi.playlists.empty': 'このプレイリストは空です。「すべての曲」で曲を右クリックして追加してください。',
  'musicUi.playlists.addTo': '「{name}」に追加',
  'musicUi.playlists.alreadyIn': '「{name}」に追加済み',
  'musicUi.playlists.newWithSong': 'この曲で新しいプレイリストを作成',
  'musicUi.playlists.moveUp': '上へ移動',
  'musicUi.playlists.moveDown': '下へ移動',
  'musicUi.playlists.remove': 'プレイリストから削除',
  'musicUi.playlists.added': '「{name}」に追加しました。',
  'musicUi.playlists.nothingToPlay': 'このプレイリストの曲は、現在ライブラリにありません。',
  'musicUi.playlists.paletteGroup': 'プレイリスト',
  'musicUi.playlists.paletteSub': 'プレイリストを再生 · {count} 曲',
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

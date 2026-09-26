// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — English source of truth.

import type { Catalog } from '../core';

export const MUSIC_UI_EN: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': 'That file could not be opened. Has it moved?',
  // User playlists: the picker, its actions and the song menu.
  'musicUi.playlists.label': 'Playlist',
  'musicUi.playlists.allSongs': 'All songs',
  'musicUi.playlists.option': {
    one: '{name} ({count} song)',
    other: '{name} ({count} songs)',
  },
  'musicUi.playlists.new': 'New playlist',
  'musicUi.playlists.defaultName': 'Playlist {n}',
  'musicUi.playlists.play': 'Play',
  'musicUi.playlists.rename': 'Rename',
  'musicUi.playlists.delete': 'Delete',
  'musicUi.playlists.deleteConfirm': 'Delete “{name}”?',
  'musicUi.playlists.nameLabel': 'Playlist name',
  'musicUi.playlists.save': 'Save',
  'musicUi.playlists.cancel': 'Cancel',
  'musicUi.playlists.empty': 'This playlist is empty. Right-click a song under All songs to add it.',
  'musicUi.playlists.addTo': 'Add to “{name}”',
  'musicUi.playlists.alreadyIn': 'Already in “{name}”',
  'musicUi.playlists.newWithSong': 'New playlist with this song',
  'musicUi.playlists.moveUp': 'Move up',
  'musicUi.playlists.moveDown': 'Move down',
  'musicUi.playlists.remove': 'Remove from playlist',
  'musicUi.playlists.added': 'Added to “{name}”.',
  'musicUi.playlists.nothingToPlay': 'None of this playlist’s songs are in the library right now.',
  'musicUi.playlists.paletteGroup': 'Playlists',
  'musicUi.playlists.paletteSub': {
    one: 'Play playlist · {count} song',
    other: 'Play playlist · {count} songs',
  },
  'musicUi.viz.wallpaperOnly': 'The visualizer is set to show on the wallpaper only',
  'musicUi.viz.off': 'The visualizer is off',
  'musicUi.viz.showHereToo': 'Show it here too',
  'musicUi.viz.turnOn': 'Turn it on',
  'musicUi.viz.fftOption': 'FFT {size}',
  // The empty song list offers the import itself.
  'musicUi.empty.addFolder': 'Add a music folder…',
  'musicUi.empty.noneAdded': 'No audio files were found in that folder.',
  'musicUi.empty.addFailed': 'The folder could not be added. Try again, or drop the files into your media watch folder.',
};

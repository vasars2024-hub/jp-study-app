// Music, focus music bar, visualizer and playlists chrome (round-2 music pass). — English source of truth.

import type { Catalog } from '../core';

export const MUSIC_UI_EN: Catalog = {
  // Music player errors and the visualizer "Where" state.
  'musicUi.error.fileMissing': 'That file could not be opened. Has it moved?',
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

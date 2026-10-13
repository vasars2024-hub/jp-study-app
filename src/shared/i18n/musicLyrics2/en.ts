// Music lyrics pass 2: karaoke timing nudge, bilingual sheets, offline lyrics folder. — English source of truth.

import type { Catalog } from '../core';

export const MUSIC_LYRICS2_EN: Catalog = {
  // Per-song lyric timing nudge (±0.1 s), saved per song.
  'musicLyrics2.offset.label': 'Timing',
  'musicLyrics2.offset.group': 'Lyric timing for this song',
  'musicLyrics2.offset.earlier': 'Show the lyrics 0.1 s earlier',
  'musicLyrics2.offset.later': 'Show the lyrics 0.1 s later',
  'musicLyrics2.offset.reset': 'Lyric timing for this song: {value}. Click to reset.',
  // A translation line that shares its time tag with the lyric line above it.
  'musicLyrics2.translation': 'Translation',
  // Offline lyrics folder (.lrc files matched by name or [ti:] tag).
  'musicLyrics2.source.folder': 'Lyrics from your lyrics folder',
  'musicLyrics2.folder.pick': 'Lyrics folder…',
  'musicLyrics2.folder.pickTitle': 'Pick a folder of .lrc files. Songs are matched by file name or by the [ti:]/[ar:] tags, three folders deep.',
  'musicLyrics2.folder.current': 'Lyrics folder: {folder}',
  'musicLyrics2.folder.clear': 'Forget the lyrics folder',
  'musicLyrics2.folder.dialogTitle': 'Choose a folder of .lrc lyrics files',
};

// Product pass 6: Soundscape engine (snd6.) and widget polish (wid6.) — en.

import type { Catalog } from '../core';

export const PRODUCT6_UI_EN: Catalog = {
  // ---- Soundscape: per-layer tone and pan ----
  'snd6.shape.open': 'Tone and pan: {name}',
  'snd6.shape.openShaped': 'Tone and pan: {name} (adjusted)',
  'snd6.shape.groupOf': 'Tone and pan for {name}',
  'snd6.shape.tone': 'Tone',
  'snd6.shape.pan': 'Pan',
  'snd6.shape.toneOf': '{name} tone',
  'snd6.shape.panOf': '{name} pan',
  'snd6.shape.toneNeutral': 'Neutral',
  'snd6.shape.darker': 'Darker, {percent}%',
  'snd6.shape.brighter': 'Brighter, {percent}%',
  'snd6.shape.centre': 'Centre',
  'snd6.shape.left': 'Left, {percent}%',
  'snd6.shape.right': 'Right, {percent}%',
  'snd6.shape.reset': 'Reset tone and pan',

  // ---- Soundscape: saved mixes as a file ----
  'snd6.mixes.heading': 'Mixes file',
  'snd6.mixes.export': 'Export',
  'snd6.mixes.copy': 'Copy',
  'snd6.mixes.import': 'Import',
  'snd6.mixes.paste': 'Paste',
  'snd6.mixes.pasteLabel': 'Mixes to import',
  'snd6.mixes.pastePlaceholder': 'Paste exported mixes here',
  'snd6.mixes.importPasted': 'Import pasted mixes',
  'snd6.mixes.exported': 'Saved {name}',
  'snd6.mixes.exportFailed': 'The file could not be saved.',
  'snd6.mixes.copied': { one: '{count} mix copied.', other: '{count} mixes copied.' },
  'snd6.mixes.copyFailed': 'Could not copy to the clipboard.',
  'snd6.mixes.added': { one: 'Added {count} mix.', other: 'Added {count} mixes.' },
  'snd6.mixes.duplicates': { one: '{count} was already saved.', other: '{count} were already saved.' },
  'snd6.mixes.overflow': { one: 'No room for {count} more (limit {max}).', other: 'No room for {count} more (limit {max}).' },
  'snd6.mixes.importFailed': 'Could not import: {error}',
  'snd6.mixes.error.notJson': 'that is not a JSON file.',
  'snd6.mixes.error.notMixes': 'that is not a Soundscape mixes file.',
  'snd6.mixes.error.empty': 'none of its mixes has anything to hear.',

  // ---- Soundscape: ducking for speech and video ----
  'snd6.duck.speech': 'Lower for speech and video',
  'snd6.duck.nowSpeech': 'Lowered while speech or video plays',
  'snd6.duck.nowMusic': 'Lowered while music plays',

  // ---- Widgets: gallery preview ----
  'wid6.gallery.preview': 'Preview',
  'wid6.gallery.previewOf': 'Preview of {name}',
  'wid6.gallery.defaultSize': 'Default size {w} × {h}',
  'wid6.gallery.favoriteNamed': 'Add {name} to favorites',
  'wid6.gallery.unfavoriteNamed': 'Remove {name} from favorites',
  'wid6.gallery.addNamed': 'Add {name}',
  'wid6.gallery.addAnotherNamed': 'Add another {name}',

  // ---- Widgets: alignment guides ----
  'wid6.drag.hint': 'Drag to move. Edges snap to other widgets; hold Alt to place freely.',
  'wid6.drag.hintAero': '{drag}. Edges snap to other gadgets; hold Alt to place freely.',
  'wid6.guides.readout': 'POS X:{x} Y:{y}',
  'wid6.guides.size': 'SIZE {w}×{h}',
};

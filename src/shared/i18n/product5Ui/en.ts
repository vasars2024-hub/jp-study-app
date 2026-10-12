// Product pass 5: the unified shortcut editor and palette (kbd5.), widget
// settings and keyboard placement (wid5.), and new Soundscape content (snd5.)
// — English source of truth.

import type { Catalog } from '../core';

export const PRODUCT5_UI_EN: Catalog = {
  // ---- Shortcuts: shared ----
  'kbd5.keys.unset': 'no key set',
  'kbd5.scope.hint': 'Where this shortcut works',
  'kbd5.scope.system': 'System-wide',
  'kbd5.scope.app': 'Anywhere in Gum',
  'kbd5.scope.reader': 'Reader',
  'kbd5.scope.manga': 'Manga reader',
  'kbd5.scope.flashcards': 'Flashcard review',
  'kbd5.scope.immersion': 'Immersion',
  'kbd5.scope.video': 'Video study',
  'kbd5.scope.player': 'Video player',
  'kbd5.scope.toolbox': 'Blanc toolbox',
  'kbd5.scope.extension': 'Chrome',

  // ---- Shortcuts: conflicts ----
  'kbd5.conflict.groupLabel': 'Shortcut conflict',
  'kbd5.conflict.title': '{chord} is already used by:',
  'kbd5.conflict.item': '{name} ({scope})',
  'kbd5.conflict.swap': 'Swap',
  'kbd5.conflict.swapHint': 'The other command takes this one\'s previous keys ({keys}).',
  'kbd5.conflict.replace': 'Replace',
  'kbd5.conflict.replaceHint': 'Take the key away from the other command. Its other keys stay.',
  'kbd5.conflict.keep': 'Keep both',
  'kbd5.conflict.keepHint': 'Both keep the key. Where both are active, only one of them will run.',
  'kbd5.conflict.readOnly': '{names} cannot be changed here and keeps the key.',
  'kbd5.conflict.swapped': 'Swapped. {name} now uses {keys}.',
  'kbd5.conflict.replaced': '{chord} moved here from {names}.',
  'kbd5.conflict.kept': '{chord} set. It still also runs {names}.',
  'kbd5.conflict.shared': 'Also used by {names} in another place; both keep working.',
  'kbd5.live.taken': 'Already used by {names}',

  // ---- Shortcuts: video player keys ----
  'kbd5.player.title': 'Video player',
  'kbd5.player.desc':
    'The player\'s own keys, heard while a video has the keyboard. A change applies at once in this window, and the next time a video opens in another.',
  'kbd5.player.bareOnly': 'The video player only takes a single key without Ctrl, Alt, Shift or Win.',
  'kbd5.player.fixedTitle': 'Built into the player (cannot be changed)',

  // ---- Shortcuts: Chrome extension ----
  'kbd5.ext.title': 'Chrome extension',
  'kbd5.ext.desc':
    'Chrome manages the extension\'s keys, so they cannot be changed here. Copy the address below, paste it into Chrome\'s address bar and set them there. The keys shown are Chrome\'s defaults.',
  'kbd5.ext.copy': 'Copy address',
  'kbd5.ext.copied': 'Address copied. Paste it into Chrome\'s address bar.',
  'kbd5.ext.suggested': 'Chrome default',
  'kbd5.ext.none': 'Not set',
  'kbd5.ext.cmd.savePage': 'Save page to Gum',
  'kbd5.ext.cmd.lookup': 'Look up selection or the word under the cursor',
  'kbd5.ext.cmd.mineSelection': 'Save selection (word or sentence)',
  'kbd5.ext.cmd.wheel': 'Open the action wheel',
  'kbd5.ext.cmd.bulkTabs': 'Open the reading list',
  'kbd5.ext.cmd.analyze': 'AI analysis of the selected sentence',
  'kbd5.ext.cmd.recordTab': 'Start or stop recording the tab',

  // ---- Shortcuts: keymap files, custom shortcuts, reset ----
  'kbd5.io.saveFile': 'Save as file',
  'kbd5.io.loadFile': 'Load file',
  'kbd5.io.saved': 'Keymap saved as {name}.',
  'kbd5.io.importedWithPlayer': {
    one: 'Keymap imported, including {count} video player key.',
    other: 'Keymap imported, including {count} video player keys.',
  },
  'kbd5.io.error.notJson': 'That is not valid JSON.',
  'kbd5.io.error.notKeymap': 'That is not a Gum keymap.',
  'kbd5.io.error.rejected': 'The keymap was rejected: {detail}',
  'kbd5.custom.edit': 'Edit',
  'kbd5.custom.editTitle': 'Edit custom shortcut',
  'kbd5.custom.save': 'Save changes',
  'kbd5.custom.saved': 'Saved "{label}".',
  // One whole message per language, never two keys glued with a space: CJK
  // joins sentences without one, and a dialog message must be one t() call.
  'kbd5.resetAll.message': 'Reset every shortcut in this profile to its default? The video player\'s keys are reset too.',

  // ---- Command palette ----
  'kbd5.palette.recent': 'Recently used',
  'kbd5.palette.keysHint': 'Up and Down move · Page Up and Page Down jump · Enter runs · Esc closes',

  // ---- Widgets ----
  'wid5.menu.settings': 'Widget settings',
  'wid5.menu.keyboardMove': 'Move or resize with keyboard',
  'wid5.keyboard.hint': 'Arrows move · Shift+arrows resize · Ctrl for bigger steps · Enter to finish · Esc to undo',
  'wid5.settings.title': '{name} settings',
  'wid5.settings.reset': 'Reset to defaults',
  'wid5.settings.done': 'Done',
  'wid5.settings.hour24': '24-hour clock',
  'wid5.settings.showSeconds': 'Show seconds',
  'wid5.settings.workMin': 'Focus length (minutes)',
  'wid5.settings.breakMin': 'Break length (minutes)',
  'wid5.settings.countdownMin': 'Countdown length (minutes)',
  'wid5.settings.readingList': 'List',
  'wid5.settings.readingList.auto': 'The list changed most recently',
  'wid5.settings.readingList.firstChallenge': 'The first list with a target date',
  'wid5.settings.slideSeconds': 'Seconds per card',
  'wid5.settings.paused': 'Paused',

  // ---- Soundscape ----
  'snd5.group.japan': 'Japan',
  'snd5.layer.umbrella': 'Rain on an umbrella',
  'snd5.layer.cicadas': 'Summer cicadas',
  'snd5.layer.templeBell': 'Temple bell',
  'snd5.layer.furin': 'Wind bell',
  'snd5.layer.shishiOdoshi': 'Bamboo water fountain',
  'snd5.layer.carriage': 'Inside a train',
  'snd5.layer.konbini': 'Convenience store',
  'snd5.layer.cityNight': 'City at night',
  'snd5.music.kotoGarden': 'Koto garden',
  'snd5.scene.templeDawn': 'Temple at dawn',
  'snd5.scene.umbrellaWalk': 'Walk in the rain',
  'snd5.scene.localTrain': 'Local train',
  'snd5.scene.summerAfternoon': 'Summer afternoon',
  'snd5.scene.konbiniNight': 'Late-night konbini',
  'snd5.scene.cityLights': 'City lights',
  'snd5.scene.zenGarden': 'Zen garden',
  'snd5.modes.heading': 'Study modes',
  'snd5.modes.enable': 'Change the scene for reading, review and listening',
  'snd5.modes.reading': 'Reading',
  'snd5.modes.review': 'Review',
  'snd5.modes.listening': 'Listening',
  'snd5.modes.keep': 'Leave as it is',
  'snd5.modes.pause': 'Pause the sound',
  'snd5.fade.label': 'Fades',
  'snd5.fade.quick': 'Quick: starts at once, ends over 8 seconds',
  'snd5.fade.gentle': 'Gentle: 5 seconds in, 30 seconds out',
  'snd5.fade.slow': 'Slow: 20 seconds in, 3 minutes out',
  'snd5.fade.sleep': 'Sleep: 45 seconds in, 10 minutes out',
  'snd5.sceneVolume.remembered': 'The volume is remembered for this scene.',
};

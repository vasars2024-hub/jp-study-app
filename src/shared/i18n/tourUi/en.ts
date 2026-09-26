// The guided tour (shared/onboarding/tourScript.ts): its chapters, every step's
// heading and text, and the bubble's own controls. — English source of truth.

import type { Catalog } from '../core';

export const TOUR_UI_EN: Catalog = {
  // The bubble's controls.
  'tour.progressChapter': '{chapter} · {current} of {total}',
  'tour.next': 'Next',
  'tour.back': 'Back',
  'tour.skip': 'Skip tour',
  'tour.chapterDone': 'Done',
  'tour.done': 'Finish',
  'tour.hotkey.unset': 'Not set',
  'tour.menu.title': 'Pick a chapter',
  'tour.menu.body':
    'Each chapter is a few steps and ends back here. Take any of them, in any order — or finish now. The tour stays in Help and in the Start menu.',
  'tour.menu.done': 'Done',
  // The Start menu's way back into the tour.
  'desktop.startMenu.tour': 'Guided tour',

  // The chapters, as the menu, Help and the progress line name them.
  'tour.chapter.basics': 'The desktop',
  'tour.chapter.basics.desc': 'Start, search, the taskbar and shortcuts',
  'tour.chapter.watch': 'Watch and mine',
  'tour.chapter.watch.desc': 'The study player, dual subtitles and sentence decks',
  'tour.chapter.flashcards': 'Flashcards',
  'tour.chapter.flashcards.desc': 'Review, mixed decks, shuffle and practice modes',
  'tour.chapter.reading': 'Books and lookups',
  'tour.chapter.reading.desc': 'The library, the reader and the dictionary',
  'tour.chapter.grammar': 'Grammar',
  'tour.chapter.grammar.desc': 'Explore patterns and review them on a schedule',
  'tour.chapter.games': 'Game Arena',
  'tour.chapter.games.desc': 'Quick drills that count in your statistics',
  'tour.chapter.files': 'Files',
  'tour.chapter.files.desc': 'Everything you imported and made, in one place',
  'tour.chapter.captions': 'Live captions',
  'tour.chapter.captions.desc': 'Caption and mine what your computer plays',
  'tour.chapter.companion': 'Gum over any app',
  'tour.chapter.companion.desc': 'Hotkeys, the wheel, card preview and the Reading Lens',
  'tour.chapter.pets': 'Desktop companions',
  'tour.chapter.pets.desc': 'Companions on your desktop, and your own sprite packs',
  'tour.chapter.extension': 'Browser extension',
  'tour.chapter.extension.desc': 'Look up and mine on web pages in Chrome',
  'tour.chapter.settings': 'Make it yours',
  'tour.chapter.settings.desc': 'Study language, app language and looks',

  // The desktop.
  'tour.welcome.title': 'Welcome to Gum',
  'tour.welcome.body':
    'A short tour in chapters. This one shows the desktop; after it you pick any other chapter you like, or none. Esc closes the tour at any time, and it stays in Settings → {help} and in the Start menu.',
  'tour.start.title': 'Everything lives behind Start',
  'tour.start.body':
    'The desktop opens empty on purpose. Start holds every app — watching, reading, the dictionary, grammar, flashcards, games and settings. Give it a click.',
  'tour.startSearch.title': 'Search everything',
  'tour.startSearch.body':
    'Type here to find any app, setting, book or saved word. The same search opens from anywhere with these keys:',
  'tour.taskbar.title': 'The taskbar',
  'tour.taskbar.body':
    'Open windows collect here, beside the clock, notifications and quick settings. Windows drag, resize and stack like on any desktop, and each one can pop out into a window of its own.',
  'tour.desktops.title': 'Two desktops',
  'tour.desktops.body':
    'Keep one desktop for studying and one for everything else. Each has its own windows, widgets and layout.',
  'tour.shortcuts.title': 'Every key is yours',
  'tour.shortcuts.body':
    'Every shortcut — inside the app and system-wide — is listed here and can be changed. Rows marked System-wide work while Gum is in the background.',
  'tour.lens.title': 'Read anything on screen',
  'tour.lens.body':
    'The Reading Lens works anywhere in Windows, not just inside Gum. Press the hotkey, drag a box over text in a game, a PDF or a video, and it is read, looked up and ready to mine.',

  // Watch and the study player.
  'tour.watch.import.title': 'Bring in your videos',
  'tour.watch.import.body':
    'Import a file or a whole folder, or drop it onto this window. Subtitles sitting next to a video are found and matched to it.',
  'tour.watch.library.title': 'Your library',
  'tour.watch.library.body':
    'Episodes and films are grouped into titles, with your progress, what to continue and the downloads you started.',
  'tour.watch.player.title': 'The study player',
  'tour.watch.player.body':
    'Playing a video opens the study player: subtitles in your study language with a second track under them, a click on any word for the dictionary, and any line saved as a card with its audio.',
  'tour.watch.deck.title': 'A video becomes a deck',
  'tour.watch.deck.body':
    'Make a sentence deck — on a title’s page, in the player or in Files — cuts a video into sentences with their audio. Review them mixed with your other cards, or play them hands-free in Listen mode.',

  // Flashcards.
  'tour.flash.review.title': 'Review',
  'tour.flash.review.body':
    'Pick one deck or mix several, choose the order — shuffled, with the decks mixed together, is the default — and start. Grade each card Again, Hard, Good or Easy; Shuffle reshuffles the rest of a sitting.',
  'tour.flash.practice.title': 'Practice',
  'tour.flash.practice.body':
    'Learn, Write, Match, Test and Listen work on any deck without touching its review schedule.',
  'tour.flash.import.title': 'Bring cards in',
  'tour.flash.import.body':
    'Import a CSV, TSV or text list, or paste one here. Cards you mine anywhere in Gum arrive on their own.',

  // Books, the reader and the dictionary.
  'tour.read.import.title': 'Your books',
  'tour.read.import.body':
    'Import EPUB and PDF books, manga archives and text files, or drop them onto this window.',
  'tour.read.popup.title': 'Look up, then mine',
  'tour.read.popup.body':
    'In the reader, click any word and the dictionary pops up with readings and examples. Mine saves the word with its sentence to Flashcards, and the four buttons under it mark the word new, learning, familiar or known.',
  'tour.read.workspace.title': 'More ways to read',
  'tour.read.workspace.body':
    'Reading Finder suggests books at your level. Reading lists, captures from the Reading Lens and your reading plan sit beside the library.',
  'tour.read.dictionary.title': 'The dictionary',
  'tour.read.dictionary.body':
    'Search offline in your study language or in English. Conjugated and inflected forms are traced back to the dictionary form.',

  // Grammar.
  'tour.grammar.explorer.title': 'Grammar explorer',
  'tour.grammar.explorer.body':
    'Every pattern with its structure, usage and examples, filtered by level. Add the ones you want to your study queue.',
  'tour.grammar.review.title': 'Practice and review',
  'tour.grammar.review.body':
    'Practice drills the patterns you picked; Review brings them back on a schedule, the way flashcards come back.',

  // Game Arena.
  'tour.games.list.title': 'Pick a game',
  'tour.games.list.body':
    'Short drills — building sentences, particles, readings, listening — at your level and in your study language.',
  'tour.games.progress.title': 'Progress',
  'tour.games.progress.body':
    'Rounds earn XP, a streak and badges, and every answer counts in Statistics.',

  // Files.
  'tour.files.tree.title': 'One place for everything',
  'tour.files.tree.body':
    'Books, videos, audio, decks and mined cards, sorted by kind. Backup and restore live here too.',
  'tour.files.scan.title': 'Scan a folder',
  'tour.files.scan.body':
    'Point Files at a folder and review what it found — what each file is and where it will go — before anything joins your library.',

  // Live captions and system audio.
  'tour.captions.intro.title': 'Live captions',
  'tour.captions.intro.body':
    'A caption bar over any app — a stream, a game, a call — with every word one click from the dictionary. Capturing system audio is off by default and private: the audio stays in memory, a red dot shows while it is on, and only a clip you add to a card is saved.',
  'tour.captions.mine.title': 'Mine what you hear',
  'tour.captions.mine.body':
    'With capture on, one key mines the current caption line, or the last few seconds of audio, into a card you check before it is added.',

  // The companion.
  'tour.companion.wheel.title': 'The companion wheel',
  'tour.companion.wheel.body':
    'Press the hotkey over any app and study actions ring the pointer: look up, translate, mine, read with the Lens. Number keys pick one.',
  'tour.companion.lookup.title': 'Look it up anywhere',
  'tour.companion.lookup.body':
    'Point at a word in any app — a game, a video, a picture — and look it up without copying it; or select text and look that up.',
  'tour.companion.card.title': 'Card preview',
  'tour.companion.card.body':
    'Draft a card from the text you selected, with the window it came from as its source; edit it, then Add. Or mine the last word you looked up without opening anything. Both are unbound until you pick keys here.',
  'tour.companion.lens.title': 'The Reading Lens',
  'tour.companion.lens.body':
    'Drag a box over text anywhere on screen to read it as a passage. Press twice for the whole screen, or repeat the same box for a visual novel.',

  // Companions on the desktop.
  'tour.pets.pick.title': 'Desktop companions',
  'tour.pets.pick.body':
    'Small companions can walk your desktop and react while you study. Pick who appears and how lively they are.',
  'tour.pets.import.title': 'Bring your own',
  'tour.pets.import.body':
    'Import a Shimeji-style sprite pack — a .zip or a folder — or a folder of frames, then choose who each companion is.',

  // The browser extension.
  'tour.extension.what.title': 'The browser extension',
  'tour.extension.what.body':
    'The Chrome extension adds lookups and mining to web pages. What you mine there lands in Gum’s flashcards, and in Anki if you use it.',
  'tour.extension.pair.title': 'Pair it once',
  'tour.extension.pair.body':
    'Load the extension folder shown here in Chrome’s developer mode, then pair it: press Pair now and pull the token from the extension’s options. It connects to Gum on this computer only.',

  // Make it yours.
  'tour.settings.study.title': 'What you study',
  'tour.settings.study.body':
    'Japanese, Chinese or Russian — the dictionary, reader, grammar and games all follow it. The Chinese and Russian dictionaries are a one-time download from here.',
  'tour.settings.ui.title': 'The app’s language',
  'tour.settings.ui.body':
    'English, Japanese, Chinese or Russian, set apart from what you study. The tour switches with it.',
  'tour.settings.looks.title': 'Looks',
  'tour.settings.looks.body':
    'Themes restyle the whole desktop, from light to OLED black; accent, fonts and materials are on this page too. One look is hidden on purpose — Aero, a glossy classic desktop. Type its name on the desktop to find it.',
  'tour.settings.liquid.title': 'Liquid windows',
  'tour.settings.liquid.body':
    'This button makes any window Liquid: frameless and translucent, with the wallpaper showing through. Press it again to go back.',
  'tour.settings.help.title': 'Come back any time',
  'tour.settings.help.body':
    'Replay the whole tour or a single chapter from here, or from Guided tour in the Start menu.',
};

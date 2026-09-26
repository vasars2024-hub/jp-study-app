// The bundled Resources catalogue (src/renderer/data/catalogFallback.ts): the gem
// bundles — gem and creature labels, titles, blurbs, item descriptions, setup-link
// names and descriptions, checklist steps — and the "New" section's descriptions.
// — English source of truth.
//
// The data file keeps its English (it mirrors the remote catalog.json, and search and
// "My tools" copies read it); these keys are what the Resources window SHOWS. Keys are
// `resourceBundles.bundle.<bundle id>.gem|creature|title|blurb`,
// `resourceBundles.bundle.<bundle id>.item.<slug of the item name>`,
// `resourceBundles.bundle.<bundle id>.download.<download id>.name|description`,
// `resourceBundles.bundle.<bundle id>.check.<checklist id>` and
// `resourceBundles.new.<slug of the entry name>` (resourceText.ts). A translation is
// shown only while the catalogue still carries the English written here, so a fetched
// catalogue that rewords an entry shows its own English rather than a stale translation.
// Resource NAMES and URLs are not translated; a setup link named only by its product
// (Ringotan, Kakimashou, Kanji Koohii) has no name key.

import type { Catalog } from '../core';

export const RESOURCE_BUNDLES_EN: Catalog = {
  // Sapphire · Whale — Flashcards & SRS
  'resourceBundles.bundle.sapphire.gem': 'Sapphire',
  'resourceBundles.bundle.sapphire.creature': 'Whale',
  'resourceBundles.bundle.sapphire.title': 'Flashcards & SRS',
  'resourceBundles.bundle.sapphire.blurb':
    'Spaced repetition — the backbone of vocab retention. Pick one and stick with it.',
  'resourceBundles.bundle.sapphire.item.anki':
    'The free, open-source SRS almost every immersion learner uses. Desktop + AnkiWeb sync; AnkiMobile (paid) on iOS.',
  'resourceBundles.bundle.sapphire.item.ankiweb':
    'Free cloud sync + browser review for your Anki decks across devices.',
  'resourceBundles.bundle.sapphire.item.fsrs':
    'Modern scheduling algorithm built into recent Anki — fewer reviews for the same retention. Turn it on in deck options.',
  'resourceBundles.bundle.sapphire.item.anki-connect':
    'Required bridge for Yomitan, this app, and other mining tools to create cards in Anki automatically.',
  'resourceBundles.bundle.sapphire.item.jp-mining-note-jpmn':
    'A polished Japanese sentence-mining note type with pitch, audio, images, and Yomitan-friendly fields.',
  'resourceBundles.bundle.sapphire.item.kaishi-1-5k':
    'Modern beginner vocab deck designed as a clean first Anki deck before you start mining your own cards.',
  'resourceBundles.bundle.sapphire.item.yomitan':
    'Browser pop-up dictionary that can create Anki cards and is maintained in the open on GitHub.',
  'resourceBundles.bundle.sapphire.item.asbplayer':
    'Subtitle-based mining extension with direct GitHub builds for Chromium and Firefox.',
  'resourceBundles.bundle.sapphire.item.ajt-japanese':
    'Anki add-on suite for Japanese cards, including pitch accent, furigana helpers, and dictionary workflows.',
  'resourceBundles.bundle.sapphire.item.jpdb':
    'Japanese-specific SRS with prebuilt decks mined from real books, anime, and VNs. Great for reading-first learners.',
  'resourceBundles.bundle.sapphire.item.kitsun':
    'Polished web SRS with community decks and reading/listening modes. A friendlier paid alternative to Anki.',
  'resourceBundles.bundle.sapphire.download.anki-desktop.name': 'Anki desktop',
  'resourceBundles.bundle.sapphire.download.anki-desktop.description':
    'Download and install Anki for Windows/macOS/Linux.',
  'resourceBundles.bundle.sapphire.download.ankiconnect.name': 'Anki-Connect add-on',
  'resourceBundles.bundle.sapphire.download.ankiconnect.description':
    'Install the bridge used for automatic card creation.',
  'resourceBundles.bundle.sapphire.download.jp-mining-note.name': 'JP Mining Note',
  'resourceBundles.bundle.sapphire.download.jp-mining-note.description':
    'Open the Japanese mining note type source and setup guide.',
  'resourceBundles.bundle.sapphire.download.kaishi.name': 'Kaishi 1.5k deck',
  'resourceBundles.bundle.sapphire.download.kaishi.description':
    'Download the starter vocabulary deck directly as an Anki package.',
  'resourceBundles.bundle.sapphire.download.ajt-japanese.name': 'AJT Japanese add-on',
  'resourceBundles.bundle.sapphire.download.ajt-japanese.description':
    'Open the Anki add-on page for Japanese card helpers.',
  'resourceBundles.bundle.sapphire.download.asbplayer-chromium.name': 'asbplayer Chromium extension',
  'resourceBundles.bundle.sapphire.download.asbplayer-chromium.description':
    'Download the Chromium extension build for subtitle mining.',
  'resourceBundles.bundle.sapphire.check.install':
    'Install Anki on desktop and make a free AnkiWeb account to sync.',
  'resourceBundles.bundle.sapphire.check.core-deck':
    'Download a starter vocab deck (Kaishi 1.5k is the current recommended beginner deck).',
  'resourceBundles.bundle.sapphire.check.fsrs':
    'Enable FSRS in deck options for a lighter, smarter review schedule.',
  'resourceBundles.bundle.sapphire.check.daily':
    'Do your reviews every single day — consistency beats volume.',
  'resourceBundles.bundle.sapphire.check.mine':
    'Once comfortable, start adding your own words mined from things you read.',
  // Ruby · Phoenix — Kanji & writing
  'resourceBundles.bundle.ruby.gem': 'Ruby',
  'resourceBundles.bundle.ruby.creature': 'Phoenix',
  'resourceBundles.bundle.ruby.title': 'Kanji & writing',
  'resourceBundles.bundle.ruby.blurb':
    'Learn to recognize and write kanji. Recognition matters most for reading — pick a method and be consistent.',
  'resourceBundles.bundle.ruby.item.wanikani':
    'Radical → kanji → vocabulary SRS with mnemonics. Structured and beginner-friendly; free for the first 3 levels.',
  'resourceBundles.bundle.ruby.item.kanji-study-android':
    'Deep, offline Android app for kanji recognition and stroke-order writing practice.',
  'resourceBundles.bundle.ruby.item.remembering-the-kanji-rtk':
    "Heisig's classic method for memorizing kanji meanings and writing via stories. Pair with the Kanji Koohii community.",
  'resourceBundles.bundle.ruby.item.kanji-koohii':
    'Free companion to RTK — shared mnemonic stories and built-in SRS for the kanji.',
  'resourceBundles.bundle.ruby.item.ringotan':
    'Free SRS app focused purely on handwriting kanji from memory, ordered to match RTK/WaniKani/textbooks.',
  'resourceBundles.bundle.ruby.item.kakimashou':
    'Browser-based Japanese writing drills with stroke-order practice, kana, kanji, and vocabulary review.',
  'resourceBundles.bundle.ruby.item.kanji-alive':
    'Free kanji reference with stroke animations, radicals, examples, and educator-friendly explanations.',
  'resourceBundles.bundle.ruby.item.jisho-kanji-search':
    'Fast kanji lookup by radicals, stroke count, readings, meanings, and handwritten input.',
  'resourceBundles.bundle.ruby.item.kanshudo':
    'Kanji, vocab, grammar, and SRS study platform with structured paths and detailed character pages.',
  'resourceBundles.bundle.ruby.download.ringotan.description':
    'Install the free handwriting SRS app from your device store.',
  'resourceBundles.bundle.ruby.download.kanji-study-android.name': 'Kanji Study Android',
  'resourceBundles.bundle.ruby.download.kanji-study-android.description':
    'Open the Android install page for Kanji Study.',
  'resourceBundles.bundle.ruby.download.kakimashou.description':
    'Open the browser writing-practice app and save it to My tools.',
  'resourceBundles.bundle.ruby.download.kanji-koohii.description':
    'Open the RTK companion SRS and save it to My tools.',
  'resourceBundles.bundle.ruby.check.choose':
    'Pick ONE kanji method (WaniKani, RTK, or KanjiStudy) — do not run several at once.',
  'resourceBundles.bundle.ruby.check.radicals':
    'Learn the common radicals first; they make every later kanji easier.',
  'resourceBundles.bundle.ruby.check.recognition':
    'Prioritize recognition (kanji → meaning/reading) over handwriting if your goal is reading.',
  'resourceBundles.bundle.ruby.check.writing-opt':
    'Add handwriting with Ringotan only if you specifically want to write by hand.',
  // Emerald · Serpent — Grammar
  'resourceBundles.bundle.emerald.gem': 'Emerald',
  'resourceBundles.bundle.emerald.creature': 'Serpent',
  'resourceBundles.bundle.emerald.title': 'Grammar',
  'resourceBundles.bundle.emerald.blurb':
    'Grammar guides and references. Read through one guide once, then use the rest as look-up references.',
  'resourceBundles.bundle.emerald.item.tae-kim-guide-to-japanese':
    'The classic free beginner grammar guide. Clear, structured, and enough to start reading with a dictionary.',
  'resourceBundles.bundle.emerald.item.bunpro':
    'Grammar SRS that drills points in context with links out to explanations. Structured JLPT paths.',
  'resourceBundles.bundle.emerald.item.cure-dolly-organic-japanese':
    'YouTube series explaining Japanese grammar structurally (the “invisible が”). Odd voice, excellent mental model.',
  'resourceBundles.bundle.emerald.item.imabi':
    'Extremely thorough free grammar reference, from beginner to very advanced. Dense — best as a reference.',
  'resourceBundles.bundle.emerald.item.sakubi':
    'A concise, fast, free grammar guide designed to get you to immersion quickly.',
  'resourceBundles.bundle.emerald.item.dictionary-of-japanese-grammar-dojg':
    'The Basic/Intermediate/Advanced reference set — the gold-standard grammar dictionary. Also on Yomitan.',
  'resourceBundles.bundle.emerald.check.read-guide':
    'Read one full beginner grammar guide (Tae Kim or Sakubi) — do not memorize, just absorb.',
  'resourceBundles.bundle.emerald.check.kana-first':
    'Make sure you can read hiragana and katakana before starting grammar.',
  'resourceBundles.bundle.emerald.check.reference':
    'Keep a reference (Imabi or DoJG) open to look up points as you meet them in reading.',
  'resourceBundles.bundle.emerald.check.in-context':
    'Reinforce grammar by seeing it in real sentences, not by drilling rules in isolation.',
  // Amber · Fox — Listening & audio
  'resourceBundles.bundle.amber.gem': 'Amber',
  'resourceBundles.bundle.amber.creature': 'Fox',
  'resourceBundles.bundle.amber.title': 'Listening & audio',
  'resourceBundles.bundle.amber.blurb':
    'Train your ears. Start with beginner-friendly podcasts and build up to native content.',
  'resourceBundles.bundle.amber.item.nihongo-con-teppei-beginner':
    'Short, all-Japanese beginner podcast episodes. Perfect first listening resource — hundreds of free episodes.',
  'resourceBundles.bundle.amber.item.comprehensible-japanese':
    'Video lessons graded by level using visuals so you understand from day one. Free samples + paid library.',
  'resourceBundles.bundle.amber.item.youglish-japanese':
    'Hear any word or phrase pronounced in thousands of real YouTube clips with context.',
  'resourceBundles.bundle.amber.item.asbplayer':
    'Browser extension for subtitle-synced immersion and mining sentences with audio from video.',
  'resourceBundles.bundle.amber.item.memento':
    'Desktop video player with built-in dictionary lookup and one-click Anki mining.',
  'resourceBundles.bundle.amber.item.jimaku-tools':
    'Command-line helper for working with Jimaku subtitle downloads and immersion subtitle workflows.',
  'resourceBundles.bundle.amber.item.condensed-audio-guide':
    'Strip the silence out of shows to get dense listening practice on the go. TheMoeWay explains the workflow.',
  'resourceBundles.bundle.amber.download.memento-windows-installer.name': 'Memento Windows installer',
  'resourceBundles.bundle.amber.download.memento-windows-installer.description':
    'Download the Windows installer for the mining video player.',
  'resourceBundles.bundle.amber.download.memento-windows-portable.name': 'Memento Windows portable',
  'resourceBundles.bundle.amber.download.memento-windows-portable.description':
    'Download the portable Windows build.',
  'resourceBundles.bundle.amber.download.asbplayer-chromium.name': 'asbplayer Chromium extension',
  'resourceBundles.bundle.amber.download.asbplayer-chromium.description':
    'Download the Chromium extension package.',
  'resourceBundles.bundle.amber.download.asbplayer-firefox.name': 'asbplayer Firefox extension',
  'resourceBundles.bundle.amber.download.asbplayer-firefox.description':
    'Download the Firefox extension package.',
  'resourceBundles.bundle.amber.check.beginner-podcast':
    'Add a beginner all-Japanese podcast (Nihongo con Teppei) to your phone.',
  'resourceBundles.bundle.amber.check.daily-listening':
    'Listen a little every day, even passively — commute, chores, walks.',
  'resourceBundles.bundle.amber.check.comprehensible':
    'Prioritize content you mostly understand over content that is too hard.',
  'resourceBundles.bundle.amber.check.native': 'Gradually mix in native anime/podcasts as your ear adjusts.',
  // Opal · Owl — Reading & immersion
  'resourceBundles.bundle.opal.gem': 'Opal',
  'resourceBundles.bundle.opal.creature': 'Owl',
  'resourceBundles.bundle.opal.title': 'Reading & immersion',
  'resourceBundles.bundle.opal.blurb':
    'Reading is where it all comes together. Start graded, then move to native material with a pop-up dictionary.',
  'resourceBundles.bundle.opal.item.tadoku-graded-readers':
    'Free level-graded readers for extensive reading. The gentlest on-ramp to reading Japanese.',
  'resourceBundles.bundle.opal.item.nhk-news-web-easy':
    'Real news rewritten in simple Japanese with furigana and audio. Great early native reading.',
  'resourceBundles.bundle.opal.item.ebook-reader-ttu':
    'Free browser EPUB reader built for Japanese immersion — works beautifully with Yomitan pop-up lookups.',
  'resourceBundles.bundle.opal.item.mokuro':
    'Runs OCR over manga so you can hover-look-up words in the text directly. Reads manga in your browser.',
  'resourceBundles.bundle.opal.item.lute-v3':
    'Self-hosted reading app with word tracking, dictionaries, and review for language learning through texts.',
  'resourceBundles.bundle.opal.item.ttu-ebook-reader':
    'Open-source EPUB reader behind the browser app, tuned for Japanese immersion workflows.',
  'resourceBundles.bundle.opal.item.ttu-ebook-to-anki':
    'Use ttu reader with Yomitan/Anki to mine text from EPUBs while reading in the browser.',
  'resourceBundles.bundle.opal.item.learn-natively':
    'Community difficulty grading for Japanese books, manga, and more — find reading at your level.',
  'resourceBundles.bundle.opal.download.mokuro-wheel.name': 'Mokuro Python wheel',
  'resourceBundles.bundle.opal.download.mokuro-wheel.description':
    'Download the Python package for manga OCR.',
  'resourceBundles.bundle.opal.download.mokuro-source.name': 'Mokuro source archive',
  'resourceBundles.bundle.opal.download.mokuro-source.description':
    'Download the source archive for local install workflows.',
  'resourceBundles.bundle.opal.download.ttu-reader-source.name': 'ttu reader source',
  'resourceBundles.bundle.opal.download.ttu-reader-source.description':
    'Open the EPUB reader source and hosted-app instructions.',
  'resourceBundles.bundle.opal.download.lute-source.name': 'Lute v3 source',
  'resourceBundles.bundle.opal.download.lute-source.description':
    'Open the self-hosted reader source and install docs.',
  'resourceBundles.bundle.opal.check.graded':
    'Start with graded readers (Tadoku) — pick books you can read without stopping much.',
  'resourceBundles.bundle.opal.check.yomitan':
    'Install Yomitan so you can hover over words for instant dictionary lookups.',
  'resourceBundles.bundle.opal.check.first-native':
    'Read your first easy native thing (NHK Easy or a simple manga) even if it is slow.',
  'resourceBundles.bundle.opal.check.tolerate':
    'Accept ambiguity — you do not need to understand every word to make progress.',
  // Jade · Dragon — Chinese
  'resourceBundles.bundle.dragon.gem': 'Jade',
  'resourceBundles.bundle.dragon.creature': 'Dragon',
  'resourceBundles.bundle.dragon.title': 'Chinese',
  'resourceBundles.bundle.dragon.blurb':
    'Learning Mandarin too? These are the community favorites for reading-first Chinese.',
  'resourceBundles.bundle.dragon.item.pleco':
    'The essential Chinese dictionary app. Free core is superb; paid add-ons for OCR, flashcards, and more.',
  'resourceBundles.bundle.dragon.item.hack-chinese':
    'Spaced-repetition vocab platform built specifically for Chinese learners.',
  'resourceBundles.bundle.dragon.item.du-chinese':
    'Graded reading app with audio and tap-to-look-up, from absolute beginner up.',
  'resourceBundles.bundle.dragon.item.heavenly-path':
    'The definitive free guide and reading roadmap for learning to read Chinese through immersion.',
  'resourceBundles.bundle.dragon.item.hanly-grammar': 'Structured Chinese grammar lessons for beginners.',
  'resourceBundles.bundle.dragon.check.pinyin':
    'Learn pinyin and the four tones first — get the sounds right early.',
  'resourceBundles.bundle.dragon.check.pleco': 'Install Pleco as your everyday dictionary.',
  'resourceBundles.bundle.dragon.check.roadmap':
    'Follow the Heavenly Path roadmap for what to read and when.',
  'resourceBundles.bundle.dragon.check.graded-read':
    'Read graded stories daily (Du Chinese) and look up what you do not know.',
  // Amethyst · Bear — Russian
  'resourceBundles.bundle.amethyst.gem': 'Amethyst',
  'resourceBundles.bundle.amethyst.creature': 'Bear',
  'resourceBundles.bundle.amethyst.title': 'Russian',
  'resourceBundles.bundle.amethyst.blurb':
    'A starter set for Russian — alphabet, graded readers, and learner tools.',
  'resourceBundles.bundle.amethyst.item.russian-with-max':
    'Comprehensible-input videos and podcast graded for learners, from beginner up.',
  'resourceBundles.bundle.amethyst.item.learn-russian-rt-alphabet-guide':
    'Free structured lessons that start from the Cyrillic alphabet and basic grammar.',
  'resourceBundles.bundle.amethyst.item.russian-lingq':
    'Read and listen to graded and native texts with integrated look-up and vocabulary tracking.',
  'resourceBundles.bundle.amethyst.item.wiktionary-russian':
    'Free dictionary with full declension/conjugation tables — essential for Russian word forms.',
  'resourceBundles.bundle.amethyst.check.cyrillic':
    'Learn to read the Cyrillic alphabet first — a weekend is enough.',
  'resourceBundles.bundle.amethyst.check.ci':
    'Start comprehensible-input listening (Russian With Max) early.',
  'resourceBundles.bundle.amethyst.check.cases':
    'Get a gentle first look at the case system; do not try to master it up front.',
  'resourceBundles.bundle.amethyst.check.read':
    'Read graded texts with look-up (LingQ) and let vocab build naturally.',
  // Pearl · Crane — Absolute beginner path
  'resourceBundles.bundle.pearl.gem': 'Pearl',
  'resourceBundles.bundle.pearl.creature': 'Crane',
  'resourceBundles.bundle.pearl.title': 'Absolute beginner path',
  'resourceBundles.bundle.pearl.blurb':
    'Brand new? Do these steps in order. This is the single most-recommended starting route.',
  'resourceBundles.bundle.pearl.item.tofugu-learn-hiragana':
    'The best free hiragana guide, with mnemonics. Start here on day one.',
  'resourceBundles.bundle.pearl.item.tofugu-learn-katakana':
    'Same mnemonic method for katakana. Do it right after hiragana.',
  'resourceBundles.bundle.pearl.item.themoeway-starter-guide':
    'A complete, free, step-by-step immersion roadmap from zero. The community reference route.',
  'resourceBundles.bundle.pearl.item.refold-japanese-roadmap':
    'A structured stage-by-stage immersion method with clear milestones.',
  'resourceBundles.bundle.pearl.item.r-learnjapanese-starter-guide':
    'The subreddit’s consensus getting-started wiki. Good sanity check against hype.',
  'resourceBundles.bundle.pearl.check.hiragana': 'Learn hiragana (about a week).',
  'resourceBundles.bundle.pearl.check.katakana': 'Learn katakana (about a week).',
  'resourceBundles.bundle.pearl.check.core-deck': 'Start a core vocab SRS deck (Kaishi 1.5k in Anki).',
  'resourceBundles.bundle.pearl.check.grammar': 'Read a beginner grammar guide (Tae Kim or Sakubi).',
  'resourceBundles.bundle.pearl.check.yomitan': 'Install Yomitan for pop-up dictionary lookups.',
  'resourceBundles.bundle.pearl.check.first-immersion':
    'Start your first easy immersion (graded readers, simple anime with JP subs).',
  // Topaz · Tiger — Output & speaking
  'resourceBundles.bundle.topaz.gem': 'Topaz',
  'resourceBundles.bundle.topaz.creature': 'Tiger',
  'resourceBundles.bundle.topaz.title': 'Output & speaking',
  'resourceBundles.bundle.topaz.blurb':
    'Ready to produce the language? Practice writing and speaking with real people and get corrected.',
  'resourceBundles.bundle.topaz.item.hellotalk':
    'Language-exchange app to chat with native speakers by text and voice.',
  'resourceBundles.bundle.topaz.item.italki':
    'Book affordable 1-on-1 lessons or conversation practice with tutors and teachers.',
  'resourceBundles.bundle.topaz.item.langcorrect':
    'Write journal entries and get free corrections from native speakers.',
  'resourceBundles.bundle.topaz.item.vrchat-japanese-worlds':
    'Immersive spoken practice with real Japanese speakers in social VR. Popular with immersion learners.',
  'resourceBundles.bundle.topaz.item.shadowing-method-guide':
    'How to shadow native audio to improve pronunciation and fluency. TheMoeWay’s output guide.',
  'resourceBundles.bundle.topaz.check.wait':
    'Get a solid base of input first — output is much easier after lots of listening/reading.',
  'resourceBundles.bundle.topaz.check.write':
    'Start with low-pressure writing (LangCorrect) and get corrections.',
  'resourceBundles.bundle.topaz.check.shadow': 'Shadow native audio to train pronunciation and rhythm.',
  'resourceBundles.bundle.topaz.check.speak':
    'Book a tutor or language exchange when you want real conversation.',
  // Obsidian · Wolf — Tools & tech
  'resourceBundles.bundle.obsidian.gem': 'Obsidian',
  'resourceBundles.bundle.obsidian.creature': 'Wolf',
  'resourceBundles.bundle.obsidian.title': 'Tools & tech',
  'resourceBundles.bundle.obsidian.blurb':
    'The utility belt — pop-up dictionaries, text hookers, and OCR that power an immersion setup.',
  'resourceBundles.bundle.obsidian.item.yomitan':
    'The essential browser pop-up dictionary (successor to Yomichan). Hover any Japanese word for instant lookups + one-click Anki mining.',
  'resourceBundles.bundle.obsidian.item.textractor':
    'Hooks text out of visual novels and games so you can look it up and mine it.',
  'resourceBundles.bundle.obsidian.item.jl':
    'Fast Windows pop-up dictionary for reading text from games, VNs, and the clipboard.',
  'resourceBundles.bundle.obsidian.item.anki-connect':
    'Anki add-on that lets Yomitan and other tools create cards automatically.',
  'resourceBundles.bundle.obsidian.item.owocr':
    'Open-source OCR app for grabbing text from images, games, and unhookable windows.',
  'resourceBundles.bundle.obsidian.item.mokuro':
    'GitHub-hosted manga OCR pipeline for turning pages into selectable text.',
  'resourceBundles.bundle.obsidian.item.lunatranslator':
    'Open-source visual-novel text hooker, OCR, and translation overlay toolkit.',
  'resourceBundles.bundle.obsidian.item.sharex':
    'Free screen-capture + OCR tool handy for mining text from images and untextractable games.',
  'resourceBundles.bundle.obsidian.download.textractor-installer.name': 'Textractor setup',
  'resourceBundles.bundle.obsidian.download.textractor-installer.description':
    'Download the Windows installer for visual novel text hooking.',
  'resourceBundles.bundle.obsidian.download.textractor-portable.name': 'Textractor portable zip',
  'resourceBundles.bundle.obsidian.download.textractor-portable.description':
    'Download the portable English-only Textractor build.',
  'resourceBundles.bundle.obsidian.download.jl-win-x64.name': 'JL Windows x64',
  'resourceBundles.bundle.obsidian.download.jl-win-x64.description':
    'Download the Windows x64 pop-up dictionary package.',
  'resourceBundles.bundle.obsidian.download.owocr-windows.name': 'owocr Windows',
  'resourceBundles.bundle.obsidian.download.owocr-windows.description':
    'Download the Windows OCR app package.',
  'resourceBundles.bundle.obsidian.download.owocr-wheel.name': 'owocr Python wheel',
  'resourceBundles.bundle.obsidian.download.owocr-wheel.description':
    'Download the Python package for script-based OCR workflows.',
  'resourceBundles.bundle.obsidian.check.yomitan':
    'Install Yomitan and import a dictionary (JMdict) + a frequency list.',
  'resourceBundles.bundle.obsidian.check.ankiconnect':
    'Install Anki-Connect so Yomitan can make cards in one click.',
  'resourceBundles.bundle.obsidian.check.texthook':
    'For VNs/games, set up Textractor or JL to capture on-screen text.',
  'resourceBundles.bundle.obsidian.check.ocr':
    'Keep an OCR tool (ShareX / owocr) around for anything you cannot hook.',
  // New in the catalogue
  'resourceBundles.new.hanzi-writer':
    'Open-source stroke-order animations and a stroke-by-stroke writing quiz for thousands of Chinese characters.',
  'resourceBundles.new.make-me-a-hanzi':
    'Open stroke-order and decomposition data for 9,000+ characters. The data behind many free writing tools.',
  'resourceBundles.new.mandarin-bean':
    'Free graded stories and articles by HSK level with pinyin, word lists and a translation toggle.',
  'resourceBundles.new.openrussian':
    'Open Russian dictionary with stress marks, every declension and conjugation, audio and example sentences.',
  'resourceBundles.new.russiangram':
    'Paste Russian text, get it back with stress marks on every word. A quick check before reading aloud.',
  'resourceBundles.new.russian-national-corpus':
    'See how a word or construction is really used across hundreds of millions of words of Russian.',
  'resourceBundles.new.youglish':
    'Hear any word spoken in real YouTube videos, in Japanese, Chinese, Russian and many more.',
  'resourceBundles.new.language-reactor':
    'Dual subtitles and a pop-up dictionary on Netflix and YouTube, with saved words to mine later.',
  'resourceBundles.new.yomitan':
    'Actively maintained pop-up dictionary (the Yomichan successor). Frequent releases and new dictionary support.',
  'resourceBundles.new.jl':
    'Fast Windows pop-up dictionary for VNs, games, and clipboard text. Great free Textractor companion.',
  'resourceBundles.new.jimaku':
    'Community-run archive of Japanese subtitles for anime, drama, and film — feed them into asbplayer for mining.',
  'resourceBundles.new.ebook-reader':
    'Browser EPUB reader tuned for Japanese immersion with character counting and Yomitan support.',
  'resourceBundles.new.jp-mining-note-jpmn':
    'A polished, feature-rich Anki note type built for Japanese sentence mining with Yomitan.',
  'resourceBundles.new.asbplayer':
    'Subtitle-synced immersion + sentence mining from streaming video and local media. Widely used and updated.',
  'resourceBundles.new.owocr':
    'On-demand OCR pipeline for reading text from games and images you cannot text-hook.',
  'resourceBundles.new.lute-v3':
    'Self-hosted "learning using texts" reader with click-to-look-up and spaced review. Strong for Chinese/Russian too.',
  'resourceBundles.new.memento':
    'A video player with a built-in pop-up dictionary and one-click Anki mining. Great for immersion on desktop.',
  'resourceBundles.new.mokuro': 'OCR manga into hoverable text you can read with Yomitan in the browser.',
  'resourceBundles.new.exstatic':
    'Track immersion stats (characters read, time) across your reading and listening tools.',
  'resourceBundles.new.heavenly-path':
    'The community-favorite roadmap and graded reading list for learning to read Chinese.',
  'resourceBundles.new.migaku':
    'All-in-one paid immersion suite (browser extension + Anki integration). A polished alternative to a DIY setup.',
  'resourceBundles.new.ringotan':
    'Free handwriting-focused kanji/hanzi SRS that follows your textbook or WaniKani order.',
};

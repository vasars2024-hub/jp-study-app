// The built-in Resources catalogue (src/renderer/data/resources.ts): category titles,
// blurbs and item descriptions. — English source of truth.
//
// The data file keeps its English text (search, "My tools" copies and the remote
// catalogue all read it); these keys are what the Resources window SHOWS. Keys are
// `resourcesCatalog.cat.<category id>.title|blurb` and
// `resourcesCatalog.item.<category id>.<slug of the item name>` (resourceText.ts).
// Resource NAMES and URLs are not translated: they are the sites' own names.

import type { Catalog } from '../core';

export const RESOURCES_CATALOG_EN: Catalog = {
  // Dictionaries & lookup
  'resourcesCatalog.cat.dictionaries.title': 'Dictionaries & lookup',
  'resourcesCatalog.cat.dictionaries.blurb': 'Look up words, kanji, and example sentences.',
  'resourcesCatalog.item.dictionaries.jisho':
    'The go-to English–Japanese dictionary. Search by English, kanji, reading, or even draw a character. Powers this app’s own lookups.',
  'resourcesCatalog.item.dictionaries.weblio':
    'A huge Japanese-native dictionary. Best once you can read definitions in Japanese — far more nuance than English dictionaries.',
  'resourcesCatalog.item.dictionaries.yomitan':
    'Browser extension that gives instant pop-up definitions when you hover over any Japanese word on a webpage. The modern successor to Yomichan.',
  'resourcesCatalog.item.dictionaries.10ten-reader':
    'A lightweight hover-dictionary browser add-on (formerly Rikaichamp). Great, simpler alternative to Yomitan.',
  'resourcesCatalog.item.dictionaries.ichi-moe':
    'Paste a whole Japanese sentence and it splits it into words with readings and meanings — perfect for untangling tricky lines.',
  'resourcesCatalog.item.dictionaries.takoboto':
    'Clean dictionary with a great offline Android app and example sentences. Handy on the phone.',
  // Kanji & vocab (SRS)
  'resourcesCatalog.cat.kanji-srs.title': 'Kanji & vocab (SRS)',
  'resourcesCatalog.cat.kanji-srs.blurb': 'Spaced-repetition systems to make words stick.',
  'resourcesCatalog.item.kanji-srs.anki':
    'The most powerful free flashcard app, with spaced repetition. This app can send words straight into it via AnkiConnect.',
  'resourcesCatalog.item.kanji-srs.wanikani':
    'Teaches ~2,000 kanji and 6,000 words through radicals and mnemonics on a fixed SRS schedule. The first 3 levels are free.',
  'resourcesCatalog.item.kanji-srs.jpdb-io':
    'Analyzes books, anime, and games so you can pre-learn the vocabulary before you read or watch them. Brilliant for immersion.',
  'resourcesCatalog.item.kanji-srs.kanji-koohii':
    'Community mnemonics for every kanji, built around the “Remembering the Kanji” method. Free reviews and shared stories.',
  'resourcesCatalog.item.kanji-srs.renshuu':
    'A friendly all-in-one site for kanji, vocab, and grammar drills with a generous free tier and a built-in community.',
  // Grammar references
  'resourcesCatalog.cat.grammar.title': 'Grammar references',
  'resourcesCatalog.cat.grammar.blurb': 'Deeper explanations when a point won’t click.',
  'resourcesCatalog.item.grammar.tae-kim-s-guide':
    'A free, beloved grammar guide that teaches Japanese the way it’s actually structured, from the ground up.',
  'resourcesCatalog.item.grammar.bunpro':
    'Grammar SRS that walks you through every JLPT point with fill-in-the-blank reviews and links to outside explanations.',
  'resourcesCatalog.item.grammar.imabi':
    'Extremely thorough, textbook-deep grammar lessons from beginner to advanced. The reference when you want every detail.',
  'resourcesCatalog.item.grammar.maggie-sensei':
    'Casual, example-packed lessons covering real, modern, and slangy Japanese you won’t find in textbooks.',
  'resourcesCatalog.item.grammar.jlpt-sensei':
    'Grammar, vocab, and kanji lists organized strictly by JLPT level, with example sentences for each point.',
  'resourcesCatalog.item.grammar.tofugu':
    'Approachable articles on grammar, kanji, culture, and learning strategy — great for filling in the “why”.',
  // Reading practice
  'resourcesCatalog.cat.reading.title': 'Reading practice',
  'resourcesCatalog.cat.reading.blurb': 'Graded readers and native text to level up.',
  'resourcesCatalog.item.reading.nhk-news-web-easy':
    'Real news rewritten in simple Japanese with furigana and audio. The classic first step into native material.',
  'resourcesCatalog.item.reading.satori-reader':
    'Graded stories with built-in dictionary, grammar notes, and audio that adapt to the words you already know.',
  'resourcesCatalog.item.reading.tadoku-free-books':
    'Free graded readers sorted by level, designed for “extensive reading” — read lots of easy stuff to build fluency.',
  'resourcesCatalog.item.reading.watanoc':
    'A free web magazine written in N5–N3 Japanese, with furigana — short articles on everyday topics.',
  'resourcesCatalog.item.reading.aozora-bunko':
    'Japan’s free public-domain library — thousands of classic novels and stories. Pair it with a hover dictionary.',
  // Listening & video
  'resourcesCatalog.cat.listening.title': 'Listening & video',
  'resourcesCatalog.cat.listening.blurb': 'Train your ear with comprehensible input.',
  'resourcesCatalog.item.listening.comprehensible-japanese':
    'Video lessons graded from complete-beginner to advanced, taught entirely in easy Japanese with visuals. Ideal early listening.',
  'resourcesCatalog.item.listening.nihongo-con-teppei':
    'Short, friendly podcasts in simple Japanese — hundreds of free episodes for beginner and intermediate learners.',
  'resourcesCatalog.item.listening.japanesepod101':
    'A massive library of audio/video lessons with transcripts at every level. Lots of free content plus paid tiers.',
  'resourcesCatalog.item.listening.game-gengo':
    'Learn Japanese grammar through real video-game screenshots. Free YouTube channel that makes study genuinely fun.',
  'resourcesCatalog.item.listening.animelon':
    'Watch anime with simultaneous Japanese, English, and romaji subtitles plus a built-in dictionary for study.',
  // Immersion tools
  'resourcesCatalog.cat.tools.title': 'Immersion tools',
  'resourcesCatalog.cat.tools.blurb': 'Turn anything you watch or read into study material.',
  'resourcesCatalog.item.tools.asbplayer':
    'Sync subtitles with video and mine sentences (with audio + screenshots) straight into Anki. A staple of the immersion crowd.',
  'resourcesCatalog.item.tools.language-reactor':
    'Browser extension that adds dual subtitles and click-to-look-up to Netflix and YouTube.',
  'resourcesCatalog.item.tools.migaku':
    'An all-in-one immersion toolkit linking your media, a pop-up dictionary, and Anki card creation.',
  'resourcesCatalog.item.tools.ojad':
    'The Online Japanese Accent Dictionary — shows pitch-accent patterns for words and even whole sentences.',
  'resourcesCatalog.item.tools.forvo':
    'Hear words and names pronounced by native speakers. Great for checking how something actually sounds.',
  // Practice & community
  'resourcesCatalog.cat.community.title': 'Practice & community',
  'resourcesCatalog.cat.community.blurb': 'Real people to talk to and learn alongside.',
  'resourcesCatalog.item.community.italki':
    'Book affordable 1-on-1 lessons or casual conversation with native teachers and tutors. The best way to start speaking.',
  'resourcesCatalog.item.community.hellotalk':
    'A language-exchange app: chat with Japanese speakers learning your language, with built-in correction tools.',
  'resourcesCatalog.item.community.tandem':
    'Find language-exchange partners for text, voice, or video practice with a polished community.',
  'resourcesCatalog.item.community.r-learnjapanese':
    'A large, active community for questions, resource recommendations, and the long-running Daily Thread for quick help.',
  // Chinese: dictionaries & characters
  'resourcesCatalog.cat.zh-dictionaries.title': 'Chinese: dictionaries & characters',
  'resourcesCatalog.cat.zh-dictionaries.blurb': 'Look up words and characters, learn stroke order, and drill hanzi.',
  'resourcesCatalog.item.zh-dictionaries.pleco':
    'The standard Chinese dictionary app: handwriting input, camera OCR, a document reader and flashcards. The core is free; extra dictionaries are paid.',
  'resourcesCatalog.item.zh-dictionaries.mdbg':
    'Fast free web dictionary built on CC-CEDICT, with character decomposition, stroke order and example words.',
  'resourcesCatalog.item.zh-dictionaries.cc-cedict':
    'The open, community-edited Chinese-English dictionary (CC BY-SA) behind most free Chinese tools. Download it for your own decks.',
  'resourcesCatalog.item.zh-dictionaries.zhongwen':
    'Hover-dictionary browser extension for Chinese, showing pinyin, tones and meanings over any web page.',
  'resourcesCatalog.item.zh-dictionaries.hanzi-writer':
    'Animated stroke order for thousands of simplified and traditional characters, with a quiz mode that checks each stroke you draw.',
  'resourcesCatalog.item.zh-dictionaries.dong-chinese':
    'Character etymology and component breakdowns with a structured course; explains why characters look the way they do.',
  'resourcesCatalog.item.zh-dictionaries.outlier-linguistics':
    'Scholarly character dictionary that separates meaning, sound and form components. Pairs well with Pleco.',
  'resourcesCatalog.item.zh-dictionaries.skritter':
    'Handwriting SRS for hanzi and kanji: write each character on screen and get graded stroke by stroke.',
  'resourcesCatalog.item.zh-dictionaries.hack-chinese':
    'Vocabulary SRS with HSK and textbook lists and frequency data, built around listening and typing reviews.',
  'resourcesCatalog.item.zh-dictionaries.hsk-academy':
    'Free HSK word lists by level with example sentences, stroke order and printable sheets.',
  'resourcesCatalog.item.zh-dictionaries.purple-culture':
    'Pinyin converter, dictionary and HSK tools. Paste text to get pinyin with tone marks above each character.',
  'resourcesCatalog.item.zh-dictionaries.chinese-text-project':
    'Classical and pre-modern Chinese texts with parallel translations and a linked dictionary. For advanced learners.',
  // Chinese: reading, listening & grammar
  'resourcesCatalog.cat.zh-practice.title': 'Chinese: reading, listening & grammar',
  'resourcesCatalog.cat.zh-practice.blurb': 'Graded stories, grammar explained, and native video to listen to.',
  'resourcesCatalog.item.zh-practice.chinese-grammar-wiki':
    'The most complete free Mandarin grammar reference, sorted by CEFR level with many examples per pattern.',
  'resourcesCatalog.item.zh-practice.du-chinese':
    'Graded reading app with audio, pinyin toggles and tap-to-look-up, from HSK 1 to advanced.',
  'resourcesCatalog.item.zh-practice.mandarin-bean':
    'Free graded stories and articles by HSK level, each with pinyin, a word list and a translation toggle.',
  'resourcesCatalog.item.zh-practice.maayot':
    'A short daily story at your level, with a quick comprehension check and your own sentence to write.',
  'resourcesCatalog.item.zh-practice.the-chairman-s-bao':
    'News-based graded reader with HSK levels, audio and built-in flashcards.',
  'resourcesCatalog.item.zh-practice.mandarin-companion':
    'Graded readers: well-known novels retold in Chinese with a small, controlled character count.',
  'resourcesCatalog.item.zh-practice.readibu':
    'Read Chinese web novels with a pop-up dictionary, saved words and reading statistics.',
  'resourcesCatalog.item.zh-practice.chinesepod':
    'A large archive of dialogue-based audio lessons from newbie to advanced, with transcripts and vocabulary.',
  'resourcesCatalog.item.zh-practice.bilibili':
    'China’s main video site for anime, vlogs and lectures. Most videos carry Chinese subtitles or on-screen text.',
  'resourcesCatalog.item.zh-practice.iqiyi':
    'Chinese dramas and variety shows with Chinese and English subtitles. Much of the catalogue is free with ads.',
  'resourcesCatalog.item.zh-practice.r-chineselanguage':
    'A large community for Mandarin and Cantonese questions, resource lists and study logs.',
  // Russian: dictionaries & stress
  'resourcesCatalog.cat.ru-dictionaries.title': 'Russian: dictionaries & stress',
  'resourcesCatalog.cat.ru-dictionaries.blurb': 'Look up words with their stress, forms and real usage.',
  'resourcesCatalog.item.ru-dictionaries.openrussian':
    'Open Russian dictionary with stress marks, full declension and conjugation tables, audio and example sentences.',
  'resourcesCatalog.item.ru-dictionaries.russiangram':
    'Paste Russian text and get it back with stress marks on every word. Useful before reading aloud.',
  'resourcesCatalog.item.ru-dictionaries.wiktionary-russian':
    'The Russian-language Wiktionary: stress, every inflected form, etymology and usage notes for a huge word list.',
  'resourcesCatalog.item.ru-dictionaries.gramota-ru':
    'The reference portal for Russian spelling, stress and usage, with several academic dictionaries in one search.',
  'resourcesCatalog.item.ru-dictionaries.multitran':
    'Huge bilingual dictionary with specialist vocabulary and phrase translations contributed by translators.',
  'resourcesCatalog.item.ru-dictionaries.russian-national-corpus':
    'Search hundreds of millions of words of real Russian to see how a word or construction is actually used.',
  'resourcesCatalog.item.ru-dictionaries.reverso-context':
    'Shows a word or phrase in many real bilingual sentence pairs, so you see it in context rather than as a gloss.',
  // Russian: reading, listening & grammar
  'resourcesCatalog.cat.ru-practice.title': 'Russian: reading, listening & grammar',
  'resourcesCatalog.cat.ru-practice.blurb': 'Grammar explained, texts to read, and Russian to listen to.',
  'resourcesCatalog.item.ru-practice.master-russian':
    'Free grammar lessons, frequency lists and vocabulary articles, from the alphabet through participles.',
  'resourcesCatalog.item.ru-practice.russian-for-everyone':
    'Structured beginner-to-intermediate grammar course with exercises and reading texts.',
  'resourcesCatalog.item.ru-practice.real-russian-club':
    'Lessons, podcasts and videos on everyday Russian and grammar, many with transcripts.',
  'resourcesCatalog.item.ru-practice.russian-with-max':
    'Slow, clear podcasts and videos in Russian about culture and daily life, with transcripts.',
  'resourcesCatalog.item.ru-practice.easy-russian':
    'Street interviews with native speakers, subtitled in Russian and English. Real speech at natural speed.',
  'resourcesCatalog.item.ru-practice.russianpod101':
    'Audio and video lessons by level with dialogues, transcripts and vocabulary lists.',
  'resourcesCatalog.item.ru-practice.arzamas':
    'Free Russian-language courses and podcasts on literature, history and art. Great upper-intermediate listening.',
  'resourcesCatalog.item.ru-practice.lib-ru':
    'One of the oldest Russian online libraries, with classic literature and many public-domain texts.',
  'resourcesCatalog.item.ru-practice.mosfilm-cinema':
    'The Mosfilm studio’s own site for watching its classic Soviet films online, free.',
  'resourcesCatalog.item.ru-practice.r-russian':
    'A large, friendly community for Russian learners: grammar questions, resources and practice.',
  // Any language
  'resourcesCatalog.cat.any-language.title': 'Any language',
  'resourcesCatalog.cat.any-language.blurb': 'Tools that work for Japanese, Chinese and Russian alike.',
  'resourcesCatalog.item.any-language.tatoeba':
    'An open (CC BY) collection of translated example sentences in hundreds of languages, many with audio.',
  'resourcesCatalog.item.any-language.youglish':
    'Type a word and hear it said in real YouTube videos, jumping straight to the moment it is spoken.',
  'resourcesCatalog.item.any-language.forvo':
    'Native-speaker recordings of words and names in almost every language.',
  'resourcesCatalog.item.any-language.language-reactor':
    'Browser extension that shows two subtitle tracks on Netflix and YouTube, with a pop-up dictionary and saved words.',
  'resourcesCatalog.item.any-language.lingq':
    'Import any text or video and read it with tap-to-look-up; it tracks which words you already know.',
  'resourcesCatalog.item.any-language.readlang':
    'Web reader that translates words as you click them and turns them into flashcards.',
  'resourcesCatalog.item.any-language.clozemaster':
    'Fill-in-the-blank sentence drills sorted by word frequency, for more than fifty languages.',
  'resourcesCatalog.item.any-language.wiktionary':
    'The free multilingual dictionary: pronunciation, forms, etymology and translations for millions of words.',
};

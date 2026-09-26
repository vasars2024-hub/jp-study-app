// A hand-curated directory of the best resources on the web for learning
// Japanese, Chinese and Russian. Everything here is a real, well-known site.
// Links open in the system browser through the safe `window.api.openExternal`
// bridge. A category with `lang` is for learners of those languages and is
// listed first for them; one without is for any language.
import type { StudyLang } from '../../shared/levelScale';

export type Cost = 'Free' | 'Freemium' | 'Paid';

export interface Resource {
  name: string;
  url: string;
  description: string;
  cost: Cost;
}

export interface ResourceCategory {
  id: string;
  icon: string;
  title: string;
  blurb: string;
  items: Resource[];
  /** The study languages this category is for; absent = any language. */
  lang?: StudyLang[];
}

export const RESOURCES: ResourceCategory[] = [
  {
    id: 'dictionaries',
    lang: ['ja'],
    icon: 'book',
    title: 'Dictionaries & lookup',
    blurb: 'Look up words, kanji, and example sentences.',
    items: [
      {
        name: 'Jisho',
        url: 'https://jisho.org',
        description:
          'The go-to English–Japanese dictionary. Search by English, kanji, reading, or even draw a character. Powers this app’s own lookups.',
        cost: 'Free',
      },
      {
        name: 'Weblio 辞書',
        url: 'https://www.weblio.jp',
        description:
          'A huge Japanese-native dictionary. Best once you can read definitions in Japanese — far more nuance than English dictionaries.',
        cost: 'Free',
      },
      {
        name: 'Yomitan',
        url: 'https://yomitan.wiki',
        description:
          'Browser extension that gives instant pop-up definitions when you hover over any Japanese word on a webpage. The modern successor to Yomichan.',
        cost: 'Free',
      },
      {
        name: '10ten Reader',
        url: 'https://github.com/birchill/10ten-ja-reader',
        description:
          'A lightweight hover-dictionary browser add-on (formerly Rikaichamp). Great, simpler alternative to Yomitan.',
        cost: 'Free',
      },
      {
        name: 'ichi.moe',
        url: 'https://ichi.moe',
        description:
          'Paste a whole Japanese sentence and it splits it into words with readings and meanings — perfect for untangling tricky lines.',
        cost: 'Free',
      },
      {
        name: 'Takoboto',
        url: 'https://takoboto.jp',
        description:
          'Clean dictionary with a great offline Android app and example sentences. Handy on the phone.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'kanji-srs',
    lang: ['ja'],
    icon: 'kanji',
    title: 'Kanji & vocab (SRS)',
    blurb: 'Spaced-repetition systems to make words stick.',
    items: [
      {
        name: 'Anki',
        url: 'https://apps.ankiweb.net',
        description:
          'The most powerful free flashcard app, with spaced repetition. This app can send words straight into it via AnkiConnect.',
        cost: 'Free',
      },
      {
        name: 'WaniKani',
        url: 'https://www.wanikani.com',
        description:
          'Teaches ~2,000 kanji and 6,000 words through radicals and mnemonics on a fixed SRS schedule. The first 3 levels are free.',
        cost: 'Freemium',
      },
      {
        name: 'jpdb.io',
        url: 'https://jpdb.io',
        description:
          'Analyzes books, anime, and games so you can pre-learn the vocabulary before you read or watch them. Brilliant for immersion.',
        cost: 'Freemium',
      },
      {
        name: 'Kanji Koohii',
        url: 'https://kanji.koohii.com',
        description:
          'Community mnemonics for every kanji, built around the “Remembering the Kanji” method. Free reviews and shared stories.',
        cost: 'Free',
      },
      {
        name: 'Renshuu',
        url: 'https://www.renshuu.org',
        description:
          'A friendly all-in-one site for kanji, vocab, and grammar drills with a generous free tier and a built-in community.',
        cost: 'Freemium',
      },
    ],
  },
  {
    id: 'grammar',
    lang: ['ja'],
    icon: 'grammar',
    title: 'Grammar references',
    blurb: 'Deeper explanations when a point won’t click.',
    items: [
      {
        name: 'Tae Kim’s Guide',
        url: 'https://guidetojapanese.org/learn/grammar',
        description:
          'A free, beloved grammar guide that teaches Japanese the way it’s actually structured, from the ground up.',
        cost: 'Free',
      },
      {
        name: 'Bunpro',
        url: 'https://bunpro.jp',
        description:
          'Grammar SRS that walks you through every JLPT point with fill-in-the-blank reviews and links to outside explanations.',
        cost: 'Freemium',
      },
      {
        name: 'Imabi',
        url: 'https://www.imabi.net',
        description:
          'Extremely thorough, textbook-deep grammar lessons from beginner to advanced. The reference when you want every detail.',
        cost: 'Free',
      },
      {
        name: 'Maggie Sensei',
        url: 'https://maggiesensei.com',
        description:
          'Casual, example-packed lessons covering real, modern, and slangy Japanese you won’t find in textbooks.',
        cost: 'Free',
      },
      {
        name: 'JLPT Sensei',
        url: 'https://jlptsensei.com',
        description:
          'Grammar, vocab, and kanji lists organized strictly by JLPT level, with example sentences for each point.',
        cost: 'Free',
      },
      {
        name: 'Tofugu',
        url: 'https://www.tofugu.com',
        description:
          'Approachable articles on grammar, kanji, culture, and learning strategy — great for filling in the “why”.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'reading',
    lang: ['ja'],
    icon: 'reading',
    title: 'Reading practice',
    blurb: 'Graded readers and native text to level up.',
    items: [
      {
        name: 'NHK News Web Easy',
        url: 'https://www3.nhk.or.jp/news/easy/',
        description:
          'Real news rewritten in simple Japanese with furigana and audio. The classic first step into native material.',
        cost: 'Free',
      },
      {
        name: 'Satori Reader',
        url: 'https://www.satorireader.com',
        description:
          'Graded stories with built-in dictionary, grammar notes, and audio that adapt to the words you already know.',
        cost: 'Freemium',
      },
      {
        name: 'Tadoku Free Books',
        url: 'https://tadoku.org/japanese/en/free-books-en/',
        description:
          'Free graded readers sorted by level, designed for “extensive reading” — read lots of easy stuff to build fluency.',
        cost: 'Free',
      },
      {
        name: 'Watanoc',
        url: 'https://watanoc.com',
        description:
          'A free web magazine written in N5–N3 Japanese, with furigana — short articles on everyday topics.',
        cost: 'Free',
      },
      {
        name: 'Aozora Bunko',
        url: 'https://www.aozora.gr.jp',
        description:
          'Japan’s free public-domain library — thousands of classic novels and stories. Pair it with a hover dictionary.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'listening',
    lang: ['ja'],
    icon: 'audio',
    title: 'Listening & video',
    blurb: 'Train your ear with comprehensible input.',
    items: [
      {
        name: 'Comprehensible Japanese',
        url: 'https://cijapanese.com',
        description:
          'Video lessons graded from complete-beginner to advanced, taught entirely in easy Japanese with visuals. Ideal early listening.',
        cost: 'Freemium',
      },
      {
        name: 'Nihongo con Teppei',
        url: 'https://nihongoconteppei.com',
        description:
          'Short, friendly podcasts in simple Japanese — hundreds of free episodes for beginner and intermediate learners.',
        cost: 'Free',
      },
      {
        name: 'JapanesePod101',
        url: 'https://www.japanesepod101.com',
        description:
          'A massive library of audio/video lessons with transcripts at every level. Lots of free content plus paid tiers.',
        cost: 'Freemium',
      },
      {
        name: 'Game Gengo',
        url: 'https://www.youtube.com/@GameGengo',
        description:
          'Learn Japanese grammar through real video-game screenshots. Free YouTube channel that makes study genuinely fun.',
        cost: 'Free',
      },
      {
        name: 'Animelon',
        url: 'https://animelon.com',
        description:
          'Watch anime with simultaneous Japanese, English, and romaji subtitles plus a built-in dictionary for study.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'tools',
    lang: ['ja'],
    icon: 'tools',
    title: 'Immersion tools',
    blurb: 'Turn anything you watch or read into study material.',
    items: [
      {
        name: 'asbplayer',
        url: 'https://github.com/killergerbah/asbplayer',
        description:
          'Sync subtitles with video and mine sentences (with audio + screenshots) straight into Anki. A staple of the immersion crowd.',
        cost: 'Free',
      },
      {
        name: 'Language Reactor',
        url: 'https://www.languagereactor.com',
        description:
          'Browser extension that adds dual subtitles and click-to-look-up to Netflix and YouTube.',
        cost: 'Freemium',
      },
      {
        name: 'Migaku',
        url: 'https://www.migaku.com',
        description:
          'An all-in-one immersion toolkit linking your media, a pop-up dictionary, and Anki card creation.',
        cost: 'Paid',
      },
      {
        name: 'OJAD',
        url: 'https://www.gavo.t.u-tokyo.ac.jp/ojad/',
        description:
          'The Online Japanese Accent Dictionary — shows pitch-accent patterns for words and even whole sentences.',
        cost: 'Free',
      },
      {
        name: 'Forvo',
        url: 'https://forvo.com/languages/ja/',
        description:
          'Hear words and names pronounced by native speakers. Great for checking how something actually sounds.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'community',
    lang: ['ja'],
    icon: 'speaking',
    title: 'Practice & community',
    blurb: 'Real people to talk to and learn alongside.',
    items: [
      {
        name: 'italki',
        url: 'https://www.italki.com',
        description:
          'Book affordable 1-on-1 lessons or casual conversation with native teachers and tutors. The best way to start speaking.',
        cost: 'Paid',
      },
      {
        name: 'HelloTalk',
        url: 'https://www.hellotalk.com',
        description:
          'A language-exchange app: chat with Japanese speakers learning your language, with built-in correction tools.',
        cost: 'Freemium',
      },
      {
        name: 'Tandem',
        url: 'https://www.tandem.net',
        description:
          'Find language-exchange partners for text, voice, or video practice with a polished community.',
        cost: 'Freemium',
      },
      {
        name: 'r/LearnJapanese',
        url: 'https://www.reddit.com/r/LearnJapanese/',
        description:
          'A large, active community for questions, resource recommendations, and the long-running Daily Thread for quick help.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'zh-dictionaries',
    lang: ['zh'],
    icon: 'book',
    title: 'Chinese: dictionaries & characters',
    blurb: 'Look up words and characters, learn stroke order, and drill hanzi.',
    items: [
      {
        name: 'Pleco',
        url: 'https://www.pleco.com',
        description:
          'The standard Chinese dictionary app: handwriting input, camera OCR, a document reader and flashcards. The core is free; extra dictionaries are paid.',
        cost: 'Freemium',
      },
      {
        name: 'MDBG',
        url: 'https://www.mdbg.net/chinese/dictionary',
        description:
          'Fast free web dictionary built on CC-CEDICT, with character decomposition, stroke order and example words.',
        cost: 'Free',
      },
      {
        name: 'CC-CEDICT',
        url: 'https://cc-cedict.org/wiki/',
        description:
          'The open, community-edited Chinese-English dictionary (CC BY-SA) behind most free Chinese tools. Download it for your own decks.',
        cost: 'Free',
      },
      {
        name: 'Zhongwen',
        url: 'https://github.com/cschiller/zhongwen',
        description:
          'Hover-dictionary browser extension for Chinese, showing pinyin, tones and meanings over any web page.',
        cost: 'Free',
      },
      {
        name: 'Hanzi Writer',
        url: 'https://hanziwriter.org',
        description:
          'Animated stroke order for thousands of simplified and traditional characters, with a quiz mode that checks each stroke you draw.',
        cost: 'Free',
      },
      {
        name: 'Dong Chinese',
        url: 'https://www.dong-chinese.com',
        description:
          'Character etymology and component breakdowns with a structured course; explains why characters look the way they do.',
        cost: 'Freemium',
      },
      {
        name: 'Outlier Linguistics',
        url: 'https://www.outlier-linguistics.com',
        description:
          'Scholarly character dictionary that separates meaning, sound and form components. Pairs well with Pleco.',
        cost: 'Paid',
      },
      {
        name: 'Skritter',
        url: 'https://skritter.com',
        description:
          'Handwriting SRS for hanzi and kanji: write each character on screen and get graded stroke by stroke.',
        cost: 'Paid',
      },
      {
        name: 'Hack Chinese',
        url: 'https://www.hackchinese.com',
        description:
          'Vocabulary SRS with HSK and textbook lists and frequency data, built around listening and typing reviews.',
        cost: 'Paid',
      },
      {
        name: 'HSK Academy',
        url: 'https://hsk.academy',
        description:
          'Free HSK word lists by level with example sentences, stroke order and printable sheets.',
        cost: 'Free',
      },
      {
        name: 'Purple Culture',
        url: 'https://www.purpleculture.net',
        description:
          'Pinyin converter, dictionary and HSK tools. Paste text to get pinyin with tone marks above each character.',
        cost: 'Free',
      },
      {
        name: 'Chinese Text Project',
        url: 'https://ctext.org',
        description:
          'Classical and pre-modern Chinese texts with parallel translations and a linked dictionary. For advanced learners.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'zh-practice',
    lang: ['zh'],
    icon: 'reading',
    title: 'Chinese: reading, listening & grammar',
    blurb: 'Graded stories, grammar explained, and native video to listen to.',
    items: [
      {
        name: 'Chinese Grammar Wiki',
        url: 'https://resources.allsetlearning.com/chinese/grammar/',
        description:
          'The most complete free Mandarin grammar reference, sorted by CEFR level with many examples per pattern.',
        cost: 'Free',
      },
      {
        name: 'Du Chinese',
        url: 'https://duchinese.net',
        description:
          'Graded reading app with audio, pinyin toggles and tap-to-look-up, from HSK 1 to advanced.',
        cost: 'Freemium',
      },
      {
        name: 'Mandarin Bean',
        url: 'https://mandarinbean.com',
        description:
          'Free graded stories and articles by HSK level, each with pinyin, a word list and a translation toggle.',
        cost: 'Free',
      },
      {
        name: 'Maayot',
        url: 'https://maayot.com',
        description:
          'A short daily story at your level, with a quick comprehension check and your own sentence to write.',
        cost: 'Freemium',
      },
      {
        name: 'The Chairman’s Bao',
        url: 'https://www.thechairmansbao.com',
        description:
          'News-based graded reader with HSK levels, audio and built-in flashcards.',
        cost: 'Paid',
      },
      {
        name: 'Mandarin Companion',
        url: 'https://mandarincompanion.com',
        description:
          'Graded readers: well-known novels retold in Chinese with a small, controlled character count.',
        cost: 'Paid',
      },
      {
        name: 'Readibu',
        url: 'https://readibu.com',
        description:
          'Read Chinese web novels with a pop-up dictionary, saved words and reading statistics.',
        cost: 'Freemium',
      },
      {
        name: 'ChinesePod',
        url: 'https://chinesepod.com',
        description:
          'A large archive of dialogue-based audio lessons from newbie to advanced, with transcripts and vocabulary.',
        cost: 'Paid',
      },
      {
        name: 'Bilibili',
        url: 'https://www.bilibili.com',
        description:
          'China’s main video site for anime, vlogs and lectures. Most videos carry Chinese subtitles or on-screen text.',
        cost: 'Free',
      },
      {
        name: 'iQIYI',
        url: 'https://www.iq.com',
        description:
          'Chinese dramas and variety shows with Chinese and English subtitles. Much of the catalogue is free with ads.',
        cost: 'Freemium',
      },
      {
        name: 'r/ChineseLanguage',
        url: 'https://www.reddit.com/r/ChineseLanguage/',
        description:
          'A large community for Mandarin and Cantonese questions, resource lists and study logs.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'ru-dictionaries',
    lang: ['ru'],
    icon: 'book',
    title: 'Russian: dictionaries & stress',
    blurb: 'Look up words with their stress, forms and real usage.',
    items: [
      {
        name: 'OpenRussian',
        url: 'https://en.openrussian.org',
        description:
          'Open Russian dictionary with stress marks, full declension and conjugation tables, audio and example sentences.',
        cost: 'Free',
      },
      {
        name: 'Russiangram',
        url: 'https://russiangram.com',
        description:
          'Paste Russian text and get it back with stress marks on every word. Useful before reading aloud.',
        cost: 'Free',
      },
      {
        name: 'Wiktionary (Russian)',
        url: 'https://ru.wiktionary.org',
        description:
          'The Russian-language Wiktionary: stress, every inflected form, etymology and usage notes for a huge word list.',
        cost: 'Free',
      },
      {
        name: 'Gramota.ru',
        url: 'https://gramota.ru',
        description:
          'The reference portal for Russian spelling, stress and usage, with several academic dictionaries in one search.',
        cost: 'Free',
      },
      {
        name: 'Multitran',
        url: 'https://www.multitran.com',
        description:
          'Huge bilingual dictionary with specialist vocabulary and phrase translations contributed by translators.',
        cost: 'Free',
      },
      {
        name: 'Russian National Corpus',
        url: 'https://ruscorpora.ru',
        description:
          'Search hundreds of millions of words of real Russian to see how a word or construction is actually used.',
        cost: 'Free',
      },
      {
        name: 'Reverso Context',
        url: 'https://context.reverso.net/translation/russian-english/',
        description:
          'Shows a word or phrase in many real bilingual sentence pairs, so you see it in context rather than as a gloss.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'ru-practice',
    lang: ['ru'],
    icon: 'reading',
    title: 'Russian: reading, listening & grammar',
    blurb: 'Grammar explained, texts to read, and Russian to listen to.',
    items: [
      {
        name: 'Master Russian',
        url: 'https://masterrussian.com',
        description:
          'Free grammar lessons, frequency lists and vocabulary articles, from the alphabet through participles.',
        cost: 'Free',
      },
      {
        name: 'Russian for Everyone',
        url: 'https://www.russianforeveryone.com',
        description:
          'Structured beginner-to-intermediate grammar course with exercises and reading texts.',
        cost: 'Free',
      },
      {
        name: 'Real Russian Club',
        url: 'https://realrussianclub.com',
        description:
          'Lessons, podcasts and videos on everyday Russian and grammar, many with transcripts.',
        cost: 'Freemium',
      },
      {
        name: 'Russian with Max',
        url: 'https://www.russianwithmax.com',
        description:
          'Slow, clear podcasts and videos in Russian about culture and daily life, with transcripts.',
        cost: 'Freemium',
      },
      {
        name: 'Easy Russian',
        url: 'https://www.youtube.com/@EasyRussian',
        description:
          'Street interviews with native speakers, subtitled in Russian and English. Real speech at natural speed.',
        cost: 'Free',
      },
      {
        name: 'RussianPod101',
        url: 'https://www.russianpod101.com',
        description:
          'Audio and video lessons by level with dialogues, transcripts and vocabulary lists.',
        cost: 'Freemium',
      },
      {
        name: 'Arzamas',
        url: 'https://arzamas.academy',
        description:
          'Free Russian-language courses and podcasts on literature, history and art. Great upper-intermediate listening.',
        cost: 'Free',
      },
      {
        name: 'Lib.ru',
        url: 'http://lib.ru',
        description:
          'One of the oldest Russian online libraries, with classic literature and many public-domain texts.',
        cost: 'Free',
      },
      {
        name: 'Mosfilm Cinema',
        url: 'https://cinema.mosfilm.ru',
        description:
          'The Mosfilm studio’s own site for watching its classic Soviet films online, free.',
        cost: 'Free',
      },
      {
        name: 'r/russian',
        url: 'https://www.reddit.com/r/russian/',
        description:
          'A large, friendly community for Russian learners: grammar questions, resources and practice.',
        cost: 'Free',
      },
    ],
  },
  {
    id: 'any-language',
    icon: 'globe',
    title: 'Any language',
    blurb: 'Tools that work for Japanese, Chinese and Russian alike.',
    items: [
      {
        name: 'Tatoeba',
        url: 'https://tatoeba.org',
        description:
          'An open (CC BY) collection of translated example sentences in hundreds of languages, many with audio.',
        cost: 'Free',
      },
      {
        name: 'YouGlish',
        url: 'https://youglish.com',
        description:
          'Type a word and hear it said in real YouTube videos, jumping straight to the moment it is spoken.',
        cost: 'Free',
      },
      {
        name: 'Forvo',
        url: 'https://forvo.com',
        description:
          'Native-speaker recordings of words and names in almost every language.',
        cost: 'Freemium',
      },
      {
        name: 'Language Reactor',
        url: 'https://www.languagereactor.com',
        description:
          'Browser extension that shows two subtitle tracks on Netflix and YouTube, with a pop-up dictionary and saved words.',
        cost: 'Freemium',
      },
      {
        name: 'LingQ',
        url: 'https://www.lingq.com',
        description:
          'Import any text or video and read it with tap-to-look-up; it tracks which words you already know.',
        cost: 'Freemium',
      },
      {
        name: 'Readlang',
        url: 'https://readlang.com',
        description:
          'Web reader that translates words as you click them and turns them into flashcards.',
        cost: 'Freemium',
      },
      {
        name: 'Clozemaster',
        url: 'https://www.clozemaster.com',
        description:
          'Fill-in-the-blank sentence drills sorted by word frequency, for more than fifty languages.',
        cost: 'Freemium',
      },
      {
        name: 'Wiktionary',
        url: 'https://www.wiktionary.org',
        description:
          'The free multilingual dictionary: pronunciation, forms, etymology and translations for millions of words.',
        cost: 'Free',
      },
    ],
  },
];

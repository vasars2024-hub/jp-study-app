// A hand-curated directory of the best Japanese-learning resources on the web.
// Everything here is a real, well-known site. Links open in the system browser
// through the safe `window.api.openExternal` bridge.

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
}

export const RESOURCES: ResourceCategory[] = [
  {
    id: 'dictionaries',
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
];

import type { Guide } from './types';

// Creative, practical learning guides — the "niche tutorials" beyond raw
// grammar: study hacks, reading/writing/speaking skills, literature, culture.

export const GUIDES: Guide[] = [
  // ---------------- HACKS ----------------
  {
    id: 'hack-kanji-radicals',
    category: 'Hacks',
    icon: 'parts',
    title: 'The kanji shortcut: learn parts, not strokes',
    summary: 'Stop memorizing kanji as random strokes. Break them into reusable building blocks.',
    level: 'All levels',
    sections: [
      {
        heading: 'Why brute force fails',
        body: [
          'Most beginners try to memorize each kanji as a unique picture of strokes. That works for the first 100 and collapses around 500, because the characters start to blur together.',
          'The trick fluent learners use: almost every kanji is built from a small set of repeating components called radicals (部首). Learn the ~200 common parts, and new kanji become "combinations of things you already know" instead of new pictures.',
        ],
        tips: [
          '日 (sun) + 月 (moon) = 明 (bright).',
          '木 (tree) + 木 = 林 (woods); three trees 森 = forest.',
          '人 (person) appears squished as 亻 on the left: 休 = person 亻 resting by a tree 木 = "rest".',
        ],
      },
      {
        heading: 'How to actually do it',
        body: [
          'Pick a radical-first deck or tool (WaniKani, "Remembering the Kanji", or any radicals list) and learn the component + a keyword for it. Then build kanji as little stories.',
          'Readings come later and more easily, because many components also hint at the on-yomi (sound). For example, 青 (sei) shows up in 晴 (sei, clear weather), 清 (sei, clean), 請 (sei, request).',
        ],
        examples: [
          { jp: '訁 + 舌 → 話', reading: 'はなす', en: '"words" + "tongue" = to talk / story' },
          { jp: '氵 + 每 → 海', reading: 'うみ', en: '"water" + a phonetic = sea' },
        ],
      },
    ],
  },
  {
    id: 'hack-wa-vs-ga',
    category: 'Hacks',
    icon: 'topic',
    title: 'は vs が, finally explained',
    summary: 'The single most asked question in Japanese — with a rule you can actually use.',
    level: 'N5–N4',
    sections: [
      {
        heading: 'The one-line rule',
        body: [
          'は marks the topic — old, shared information you want to talk ABOUT. が marks the subject — new information, or the specific answer to "who/what?".',
          'Think of は as "as for ~" and が as the spotlight that picks one thing out.',
        ],
        examples: [
          { jp: '私は 学生です。', reading: 'わたしは がくせいです。', en: 'As for me, I\'m a student. (topic = me)' },
          { jp: 'だれが 来ましたか。— 田中さんが 来ました。', reading: 'だれが きましたか。— たなかさんが きました。', en: 'Who came? — Tanaka came. (が answers "who")' },
        ],
      },
      {
        heading: 'Quick tests that work',
        body: [
          'Answering a question word (だれ, なに, どこ)? Use が — and the question word itself always takes が, never は.',
          'Describing something that already is the topic? Use は. Contrasting two things? は again (これは好き、でもあれは嫌い).',
          'After certain verbs/adjectives — ある, いる, わかる, できる, 好き, ほしい — the thing involved takes が.',
        ],
        tips: [
          'New info → が, then it becomes the topic → は in the next sentence.',
          '「象は鼻が長い」 = "As for elephants (は), the nose (が) is long." Both can appear together!',
        ],
      },
    ],
  },
  {
    id: 'hack-counters',
    category: 'Hacks',
    icon: 'counts',
    title: 'Counting survival kit',
    summary: 'You can\'t just say "two" in Japanese — you need the right counter. Here\'s the minimum set.',
    level: 'N5',
    sections: [
      {
        heading: 'The universal escape hatch',
        body: [
          'When you forget the right counter, fall back on the generic つ set: 一つ (ひとつ), 二つ (ふたつ), 三つ (みっつ)… up to 十 (とお). It works for most physical objects and buys you time.',
        ],
        examples: [
          { jp: 'りんごを 三つ ください。', reading: 'りんごを みっつ ください。', en: 'Three apples, please.' },
        ],
      },
      {
        heading: 'The counters you\'ll use daily',
        body: [
          'Memorize just these and you cover 90% of conversations: 人 (にん, people), 個 (こ, small objects), 枚 (まい, flat things), 本 (ほん, long things), 杯 (はい, cupfuls), 匹 (ひき, small animals), 台 (だい, machines/vehicles), 回 (かい, times).',
          'Watch the sound changes: 一本 (いっぽん), 二本 (にほん), 三本 (さんぼん). These h→p/b shifts are regular once you spot the pattern.',
        ],
        tips: [
          'People are irregular at the start: 一人 (ひとり), 二人 (ふたり), then 三人 (さんにん) onward is regular.',
          'Counting times: 一回 (いっかい), 何回 (なんかい, how many times).',
        ],
      },
    ],
  },
  {
    id: 'hack-politeness-levels',
    category: 'Hacks',
    icon: 'register',
    title: 'Politeness levels decoded',
    summary: 'Plain, polite, and keigo — when to use each so you never sound rude or stiff.',
    level: 'N5–N3',
    sections: [
      {
        heading: 'Three gears',
        body: [
          'Plain / casual (だ・する・食べる): friends, family, inner thoughts, most anime and manga.',
          'Polite / ですます (です・します・食べます): the safe default with anyone you don\'t know well. Start here.',
          'Keigo (honorific 尊敬語 + humble 謙譲語): customers, bosses, formal service. You mostly need to RECOGNIZE it before you need to produce it.',
        ],
      },
      {
        heading: 'Practical advice',
        body: [
          'As a learner, living in ですます is perfectly natural and never offensive. Drop to plain form only once someone signals it\'s OK (they speak casually to you first).',
          'Keigo has set phrases you can memorize as chunks — see the "Keigo at work" guide. You don\'t need to derive them grammatically to use them.',
        ],
        examples: [
          { jp: '食べる → 食べます → 召し上がる', reading: 'たべる → たべます → めしあがる', en: 'eat: plain → polite → honorific' },
          { jp: 'する → します → いたします', reading: 'する → します → いたします', en: 'do: plain → polite → humble' },
        ],
      },
    ],
  },
  {
    id: 'hack-onomatopoeia',
    category: 'Hacks',
    icon: 'sound',
    title: 'Onomatopoeia (オノマトペ) crash course',
    summary: 'ドキドキ, ぺこぺこ, きらきら — the sound words that make Japanese come alive.',
    level: 'N4–N2',
    sections: [
      {
        heading: 'Two families',
        body: [
          'Giongo (擬音語) imitate real sounds: ワンワン (woof), ザーザー (pouring rain), ガチャ (a click/clatter).',
          'Gitaigo (擬態語) describe states or feelings that make no sound at all: にこにこ (smiling), ぺこぺこ (starving), きらきら (sparkling). These are the ones that surprise learners.',
        ],
      },
      {
        heading: 'Why they matter',
        body: [
          'Onomatopoeia aren\'t childish — adults use them constantly, and manga is built on them. Knowing a few hundred is a genuine fluency shortcut.',
          'They often pair with する or attach to verbs: ドキドキする (heart pounding), ゆっくり歩く (walk slowly).',
        ],
        examples: [
          { jp: 'お腹が ぺこぺこです。', reading: 'おなかが ぺこぺこです。', en: "I'm starving." },
          { jp: '緊張して ドキドキする。', reading: 'きんちょうして ドキドキする。', en: 'I\'m nervous and my heart is pounding.' },
        ],
      },
    ],
  },
  {
    id: 'hack-study-method',
    category: 'Hacks',
    icon: 'loop',
    title: 'The 80/20 study loop (and how this app fits)',
    summary: 'The fastest known path: comprehensible input + spaced repetition + immersion.',
    level: 'All levels',
    sections: [
      {
        heading: 'The loop that works',
        body: [
          'Decades of learners have converged on a simple loop: (1) get a grammar foundation, (2) consume input you can ~80% understand, (3) mine the new words into an SRS deck, (4) review daily, (5) repeat with slightly harder material.',
          'Notice that this app is built around exactly that loop: read a book or manga → highlight unknown words → pop-up dictionary → one click to Anki → review in Flashcards.',
        ],
      },
      {
        heading: 'Rules of thumb',
        body: [
          'i+1: pick material just above your level. If you understand nothing, it\'s too hard; if you understand everything, you\'re not learning.',
          'Consistency beats intensity. 20 minutes every day crushes 3 hours once a week, because SRS depends on daily reviews.',
          'Sentence-mine, don\'t word-list. Saving a word inside a sentence you actually met gives it context and makes it stick.',
        ],
        tips: [
          'Keep new Anki cards modest (10–15/day). Reviews snowball fast.',
          'Re-read easy material for speed and confidence — it\'s not a waste.',
        ],
      },
    ],
  },

  // ---------------- READING ----------------
  {
    id: 'read-first-manga',
    category: 'Reading',
    icon: 'manga',
    title: 'How to read your first manga',
    summary: 'Manga is the friendliest native material — here\'s how to start without drowning.',
    level: 'N5–N4',
    sections: [
      {
        heading: 'Why manga first',
        body: [
          'Pictures carry half the meaning, dialogue is short, and many shōnen/shōjo titles print furigana (small kana) over every kanji, so you can read without knowing the characters yet.',
          'Start with slice-of-life or kids\' titles: よつばと! (Yotsuba&!) is the classic first manga — everyday language, tons of furigana, low stakes.',
        ],
      },
      {
        heading: 'Survival tips',
        body: [
          'Read right-to-left, top-to-bottom. Panels and speech bubbles flow from the top-right corner.',
          'Expect heavy onomatopoeia and casual contractions (〜てる for 〜ている, 〜なきゃ, じゃん). They feel alien at first, then become automatic.',
          'Don\'t look up every word. Look up the ones blocking the plot; let the rest wash over you.',
        ],
        tips: [
          'Vertical text reads top→bottom, columns right→left.',
          'A pop-up dictionary (like this app\'s) turns the lookup tax from minutes to seconds.',
        ],
      },
    ],
  },
  {
    id: 'read-first-novel',
    category: 'Reading',
    icon: 'prose',
    title: 'Tackling your first novel',
    summary: 'The jump from manga to prose is real — here\'s how to make it survivable.',
    level: 'N3–N2',
    sections: [
      {
        heading: 'Choosing the right book',
        body: [
          'Pick something you already know the story of (a translated favorite, or the novel of an anime you\'ve seen). Knowing the plot frees your brain to focus on the language.',
          'Light novels (ライトノベル) and children\'s books (青い鳥文庫) are gentler than literary fiction. コンビニ人間 and 川上未映子 are popular "first real novels".',
        ],
      },
      {
        heading: 'Technique',
        body: [
          'Read in scenes, not sentences. Finish a paragraph before looking anything up, then go back for the words that mattered.',
          'Accept partial understanding. Native readers skim too. If you grasp 70% and the story moves, keep going.',
          'Re-read chapter one after chapter three. You\'ll be shocked how much easier it got.',
        ],
        examples: [
          { jp: '読めない 漢字は 飛ばしても 物語は 進む。', reading: 'よめない かんじは とばしても ものがたりは すすむ。', en: 'Even if you skip unreadable kanji, the story still moves forward.' },
        ],
      },
    ],
  },
  {
    id: 'read-news',
    category: 'Reading',
    icon: 'news',
    title: 'Reading the news without a dictionary meltdown',
    summary: 'A ladder from NHK Easy News up to the real thing.',
    level: 'N3–N1',
    sections: [
      {
        heading: 'Start with NHK News Web Easy',
        body: [
          'NHK publishes simplified news with furigana, slower vocabulary, and audio. It\'s the perfect bridge: real current events, learner-friendly language.',
          'Notice the patterns that repeat across articles: 〜によると (according to), 〜という (that says), passive forms (発表された, 行われた). News has a predictable grammar profile you can master quickly.',
        ],
      },
      {
        heading: 'Graduating to real news',
        body: [
          'Once Easy News feels easy, jump to regular NHK or newspaper sites. The headlines are the hardest part — they drop particles and use compressed kanji compounds.',
          'Build a small "news vocabulary" set: 政府 (government), 経済 (economy), 発表 (announce), 影響 (influence), 対策 (countermeasure). A few dozen words unlock most articles.',
        ],
        examples: [
          { jp: '政府に よると、来年から 制度が 変わるという。', reading: 'せいふに よると、らいねんから せいどが かわるという。', en: 'According to the government, the system will change from next year.' },
        ],
      },
    ],
  },

  // ---------------- WRITING ----------------
  {
    id: 'write-stroke-order',
    category: 'Writing',
    icon: 'strokes',
    title: 'Stroke order & handwriting that looks right',
    summary: 'A handful of rules generate correct stroke order for almost any character.',
    level: 'N5–N4',
    sections: [
      {
        heading: 'The core rules',
        body: [
          'Stroke order isn\'t arbitrary — it follows a few principles that make characters flow and look balanced.',
        ],
        tips: [
          'Top to bottom (三: top line first).',
          'Left to right (川: left stroke first).',
          'Horizontal before vertical when they cross (十: horizontal, then vertical).',
          'Outside before inside (国: box first… but close the bottom LAST).',
          'Center before symmetric wings (小: middle, then left, then right).',
        ],
      },
      {
        heading: 'Why bother in a digital age',
        body: [
          'Correct order makes your handwriting legible and your characters proportioned. It also matches the muscle memory that handwriting-recognition input expects.',
          'Even if you\'ll mostly type, writing kanji by hand a few times burns them into memory far deeper than flashcards alone.',
        ],
      },
    ],
  },
  {
    id: 'write-ime',
    category: 'Writing',
    icon: 'ime',
    title: 'Typing Japanese like a native',
    summary: 'Set up the IME and learn the keystrokes that make input fast.',
    level: 'All levels',
    sections: [
      {
        heading: 'Getting set up',
        body: [
          'Add the Microsoft IME (Windows) or Japanese input (Mac) in your system settings. You type romaji and it converts to kana, then press Space to pick kanji.',
          'Toggle input with the half/full-width key or Alt+` (Windows) / Ctrl+Space (Mac).',
        ],
      },
      {
        heading: 'Keystrokes worth knowing',
        body: [
          'Space cycles through kanji candidates; arrow keys or number keys pick one. Enter confirms.',
          'Type small kana with a leading x or l: xtsu → っ, xya → ゃ. Type ん as "nn". Long vowel ー is the hyphen key.',
          'F7 converts the current word to full katakana — handy for foreign words. F6 forces hiragana.',
        ],
        examples: [
          { jp: 'kyou → きょう → 今日', reading: 'きょう', en: '"today": romaji → kana → kanji' },
          { jp: 'gakkou → がっこう → 学校', reading: 'がっこう', en: 'note the double "k" makes っ' },
        ],
      },
    ],
  },
  {
    id: 'write-style',
    category: 'Writing',
    icon: 'style',
    title: 'Casual vs formal written style',
    summary: 'です・ます, だ, and である — pick the right register for essays, emails, and chats.',
    level: 'N3–N1',
    sections: [
      {
        heading: 'Three written registers',
        body: [
          'ですます調: polite sentence endings. Used in emails, letters, and anything addressed to a reader. Warm and respectful.',
          'だ・である調 (常体): the "report/essay" style. Sentences end in だ, である, plain verbs. Used in academic writing, news, and novels — it sounds objective, not rude.',
          'Mixing the two in one document looks sloppy. Pick one register and stay in it.',
        ],
      },
      {
        heading: 'Chat & social media',
        body: [
          'Casual digital writing drops particles, uses small っ for emphasis (やったっ), and leans on katakana and kaomoji. 〜w (laughter), 草 ("lol", from www looking like grass), and 〜ね/よ soften the tone.',
        ],
        examples: [
          { jp: 'これは 重要である。', reading: 'これは じゅうようである。', en: 'This is important. (essay style)' },
          { jp: 'これは 重要です。', reading: 'これは じゅうようです。', en: 'This is important. (polite style)' },
        ],
      },
    ],
  },

  // ---------------- SPEAKING ----------------
  {
    id: 'speak-pitch-accent',
    category: 'Speaking',
    icon: 'pitch',
    title: 'Pitch accent demystified',
    summary: 'Japanese isn\'t toneless — pitch distinguishes words and makes you sound native.',
    level: 'N4–N1',
    sections: [
      {
        heading: 'High vs low, not stress',
        body: [
          'English stresses syllables louder. Japanese instead steps each mora HIGH or LOW. The pattern (アクセント) can change meaning.',
          'Classic pair: 箸 (hashi, "chopsticks", high-low) vs 橋 (hashi, "bridge", low-high). Same sounds, different pitch.',
        ],
        examples: [
          { jp: '雨 / 飴', reading: 'あめ / あめ', en: 'rain (HIGH-low) vs candy (low-HIGH)' },
        ],
      },
      {
        heading: 'How to train it',
        body: [
          'You don\'t need to memorize every word\'s pattern. Just (1) become aware it exists, (2) shadow native audio so you copy the melody, and (3) look up accent for words you say often.',
          'Most standard (Tokyo) words are "heiban" — they start low, rise, and stay high with no drop. That\'s your safe default when unsure.',
        ],
        tips: [
          'Shadowing (repeat audio out loud, immediately) trains pitch faster than rules.',
          'Dictionaries like OJAD and the accent marks in 大辞泉 show the drop point.',
        ],
      },
    ],
  },
  {
    id: 'speak-tricky-sounds',
    category: 'Speaking',
    icon: 'sounds',
    title: 'Sounds that trip learners up',
    summary: 'Long vowels, the small っ, and the ら-row — fix these and your accent jumps.',
    level: 'N5–N3',
    sections: [
      {
        heading: 'Length is meaning',
        body: [
          'Holding a vowel longer is not decoration — it changes the word. おばさん (aunt) vs おばあさん (grandmother); ここ (here) vs こうこう (high school).',
          'The small っ (sokuon) is a held beat of silence before the next consonant. きて (come) vs きって (stamp / cut) — feel the tiny pause.',
        ],
        examples: [
          { jp: 'おじさん / おじいさん', reading: 'おじさん / おじいさん', en: 'uncle vs grandfather (long い)' },
          { jp: 'いっぱい', reading: 'いっぱい', en: 'pause before the "p": "ip-pai"' },
        ],
      },
      {
        heading: 'The ら-row is not English R or L',
        body: [
          'ら り る れ ろ are a quick tap of the tongue against the ridge behind your teeth — closer to the soft "d/t" in American "water" or a light Spanish "r".',
          'Relax. Don\'t roll it, don\'t make a hard English R. One light flick.',
        ],
      },
    ],
  },

  // ---------------- LITERATURE ----------------
  {
    id: 'lit-reading-ladder',
    category: 'Literature',
    icon: 'ladder',
    title: 'A reading ladder to the classics',
    summary: 'A staged path from graded readers all the way to Sōseki and Murakami.',
    level: 'N4–N1',
    sections: [
      {
        heading: 'Climb in order',
        body: [
          'Rung 1 — Graded readers (たどく / Tadoku free library): tiny stories tuned to your level. Build reading speed and confidence.',
          'Rung 2 — Children\'s & light novels: 青い鳥文庫, コンビニ人間, よく知ったストーリー.',
          'Rung 3 — Contemporary fiction: 村上春樹 (Murakami) reads smoothly and is widely translated for cross-checking. 東野圭吾 mysteries pull you along.',
          'Rung 4 — Modern classics: 夏目漱石「こころ」, 太宰治「人間失格」, 芥川龍之介\'s short stories — older vocabulary but still modern grammar.',
        ],
      },
      {
        heading: 'Reading the greats',
        body: [
          'Early-1900s authors use modern Japanese, just with denser vocabulary and some dated kanji forms (旧字体). Annotated student editions exist for the famous works.',
          'Short stories are the smart entry: 芥川\'s 「羅生門」 or 「鼻」 give you a complete masterpiece in a few pages.',
        ],
      },
    ],
  },
  {
    id: 'lit-bungo',
    category: 'Literature',
    icon: 'classic',
    title: 'Classical Japanese (古文) in a nutshell',
    summary: 'What changes when you open the Tale of Genji or a haiku from 1680.',
    level: 'N1+',
    sections: [
      {
        heading: 'What is bungo',
        body: [
          'Classical Japanese (文語 / 古文) was the literary written language until the early 20th century. It has different verb endings, auxiliaries, and kana usage from modern Japanese (口語).',
          'You don\'t need it to read modern books — but it unlocks haiku, classical poetry, proverbs, and historical texts, and explains odd-looking set phrases that survive today.',
        ],
      },
      {
        heading: 'A few signposts',
        body: [
          'Negative used to be 〜ず instead of 〜ない (知らず = 知らない). It survives in modern set phrases: 思わず, 絶えず.',
          'けり, なり, べし, む are classical auxiliaries marking past, assertion, obligation, and volition. You\'ll meet them in poems and on temple signs.',
          'Old kana spelling: けふ was read "kyō" (today), てふ was "chō" (butterfly). The spelling froze centuries before the pronunciation.',
        ],
        examples: [
          { jp: '古池や 蛙飛び込む 水の音', reading: 'ふるいけや かわずとびこむ みずのおと', en: 'Bashō: "An old pond — a frog jumps in, the sound of water."' },
        ],
      },
    ],
  },
  {
    id: 'lit-haiku',
    category: 'Literature',
    icon: 'haiku',
    title: 'Haiku & the poetry of the seasons',
    summary: 'The 5-7-5 form, the season word, and the art of the unsaid.',
    level: 'All levels',
    sections: [
      {
        heading: 'The rules of the tiny poem',
        body: [
          'A haiku (俳句) is 17 sound-units in a 5–7–5 rhythm (counted in mora, not syllables — so きって is 3 beats).',
          'It traditionally contains a kigo (季語), a season word: 桜 = spring, 蝉 = summer, 紅葉 = autumn, 雪 = winter. The season word does a lot of quiet work, setting mood and time in one stroke.',
        ],
      },
      {
        heading: 'The cut and the gap',
        body: [
          'A kireji (切れ字 — や, かな, けり) "cuts" the poem into two images and invites the reader to feel the space between them. Haiku says little and implies much.',
          'Reading haiku trains a very Japanese aesthetic: suggestion over statement, the beauty of impermanence (もののあはれ).',
        ],
        examples: [
          { jp: '閑さや 岩にしみ入る 蝉の声', reading: 'しずかさや いわにしみいる せみのこえ', en: 'Bashō: "Such stillness — piercing the rocks, the cry of cicadas."' },
        ],
      },
    ],
  },

  // ---------------- CULTURE ----------------
  {
    id: 'culture-keigo',
    category: 'Culture',
    icon: 'keigo',
    title: 'Keigo at work: phrases that make you sound fluent',
    summary: 'Memorize these set expressions and survive any shop, office, or formal call.',
    level: 'N3–N1',
    sections: [
      {
        heading: 'Learn chunks, not conjugations',
        body: [
          'Keigo feels scary because of its grammar, but in practice it runs on fixed phrases. Memorize them as whole units and you\'ll sound polished long before you can "derive" them.',
        ],
        examples: [
          { jp: 'お世話になっております。', reading: 'おせわに なっております。', en: 'Standard business greeting ("thank you for your continued support").' },
          { jp: '少々 お待ちください。', reading: 'しょうしょう おまちください。', en: 'Please wait a moment.' },
          { jp: 'かしこまりました。', reading: 'かしこまりました。', en: '"Certainly / understood" (service humble).' },
          { jp: '恐れ入りますが…', reading: 'おそれいりますが…', en: '"Excuse me, but…" — softens any request.' },
        ],
      },
      {
        heading: 'The honorific/humble pairs you\'ll hear',
        body: [
          'You mostly need to RECOGNIZE these, especially from staff: いらっしゃいませ (welcome), ご覧ください (please look), 召し上がる (eat, honorific), いたします (do, humble), 伺います (visit/ask, humble).',
        ],
        tips: [
          'When unsure, plain ですます is never rude — it\'s just less formal.',
          'Over-keigo can sound sarcastic; match the room.',
        ],
      },
    ],
  },
  {
    id: 'culture-you',
    category: 'Culture',
    icon: 'pronouns',
    title: 'The "you" trap: stop saying あなた',
    summary: 'Pronouns are social minefields. Here\'s what natives actually do.',
    level: 'N5–N3',
    sections: [
      {
        heading: 'Why あなた feels off',
        body: [
          'Textbooks teach あなた = "you", but in real life it can sound distant, confrontational, or oddly intimate (wives use it for husbands). Natives avoid it.',
          'The fix: use the person\'s NAME + さん, or just drop the pronoun entirely. Japanese loves to omit what\'s obvious from context.',
        ],
        examples: [
          { jp: '田中さんは どう 思いますか。', reading: 'たなかさんは どう おもいますか。', en: 'What do you think, Tanaka? (name instead of "you")' },
          { jp: '（あなたは）何が 好きですか。', reading: '（あなたは）なにが すきですか。', en: 'What do you like? — just drop the あなた.' },
        ],
      },
      {
        heading: '"I" has options too',
        body: [
          '私 (わたし) is the safe, neutral "I" for everyone. 僕 (ぼく) is soft-masculine; 俺 (おれ) is rough-masculine and casual; あたし is casual-feminine.',
          'These pronouns signal gender, age, and attitude — choosing one is part of your persona, so listen to how people around you talk and match it.',
        ],
      },
    ],
  },
];

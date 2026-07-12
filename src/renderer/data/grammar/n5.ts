import type { GrammarPoint } from './types';

export const N5: GrammarPoint[] = [
  {
    id: 'n5-desu',
    level: 'N5',
    title: '〜は〜です',
    meaning: 'A is B (copula / "to be")',
    structure: 'Noun + は + Noun + です',
    explanation:
      'The most basic sentence. は marks the topic; です links it to a noun or adjective and makes it polite. The plain form of です is だ.',
    examples: [
      { jp: 'わたしは 学生です。', reading: 'わたしは がくせいです。', en: 'I am a student.' },
      { jp: 'これは 本です。', reading: 'これは ほんです。', en: 'This is a book.' },
    ],
  },
  {
    id: 'n5-dewa-arimasen',
    level: 'N5',
    title: '〜ではありません',
    meaning: 'is not ~ (negative copula)',
    structure: 'Noun + ではありません（じゃないです）',
    explanation:
      'The polite negative of です. In casual speech ではない / じゃない is used. じゃありません is a slightly softer spoken variant.',
    examples: [
      { jp: 'これは わたしの 傘ではありません。', reading: 'これは わたしの かさではありません。', en: 'This is not my umbrella.' },
      { jp: '田中さんは 先生じゃないです。', reading: 'たなかさんは せんせいじゃないです。', en: 'Tanaka is not a teacher.' },
    ],
  },
  {
    id: 'n5-deshita',
    level: 'N5',
    title: '〜でした',
    meaning: 'was ~ (past copula)',
    structure: 'Noun / な-adj + でした',
    explanation:
      'The polite past form of です. The negative past is ではありませんでした / じゃなかったです.',
    examples: [
      { jp: '昨日は 休みでした。', reading: 'きのうは やすみでした。', en: 'Yesterday was a day off.' },
      { jp: 'テストは 簡単でした。', reading: 'テストは かんたんでした。', en: 'The test was easy.' },
    ],
  },
  {
    id: 'n5-wa-topic',
    level: 'N5',
    title: '〜は (topic particle)',
    meaning: 'as for ~ (marks the topic)',
    structure: 'Noun + は',
    explanation:
      'は (pronounced "wa") sets the topic — what the sentence is about. It often contrasts or highlights, unlike が which simply marks the subject.',
    examples: [
      { jp: '今日は 暑いです。', reading: 'きょうは あついです。', en: 'Today is hot.' },
      { jp: '日本語は 面白いです。', reading: 'にほんごは おもしろいです。', en: 'Japanese is interesting.' },
    ],
  },
  {
    id: 'n5-ga-subject',
    level: 'N5',
    title: '〜が (subject particle)',
    meaning: 'marks the subject / new information',
    structure: 'Noun + が',
    explanation:
      'が marks the grammatical subject, especially new or emphasized information, the subject of existence (あります/います), and the object of likes/abilities (好き, できる).',
    examples: [
      { jp: '猫が います。', reading: 'ねこが います。', en: 'There is a cat.' },
      { jp: 'だれが 来ますか。', reading: 'だれが きますか。', en: 'Who is coming?' },
    ],
  },
  {
    id: 'n5-o-object',
    level: 'N5',
    title: '〜を (object particle)',
    meaning: 'marks the direct object',
    structure: 'Noun + を + verb',
    explanation:
      'を (pronounced "o") marks the thing a verb acts on — what you eat, read, buy, etc. It also marks the place you move through (公園を散歩する).',
    examples: [
      { jp: 'ごはんを 食べます。', reading: 'ごはんを たべます。', en: 'I eat a meal.' },
      { jp: '道を 渡ります。', reading: 'みちを わたります。', en: 'I cross the road.' },
    ],
  },
  {
    id: 'n5-ni-time',
    level: 'N5',
    title: '〜に (time / destination)',
    meaning: 'at (time), to (destination), in/on (location of existence)',
    structure: 'Time / place + に',
    explanation:
      'に marks a point in time (7時に), a destination (東京に行く), and where something exists (部屋にいる). Use it with specific times, not relative ones like 今日.',
    examples: [
      { jp: '7時に 起きます。', reading: 'しちじに おきます。', en: 'I get up at 7.' },
      { jp: '学校に 行きます。', reading: 'がっこうに いきます。', en: 'I go to school.' },
    ],
  },
  {
    id: 'n5-de-place',
    level: 'N5',
    title: '〜で (place of action / means)',
    meaning: 'at/in (action place); by/with (means)',
    structure: 'Place / tool + で',
    explanation:
      'で marks where an action happens (図書館で勉強する) and the means or tool used (はしで食べる, バスで行く).',
    examples: [
      { jp: '図書館で 勉強します。', reading: 'としょかんで べんきょうします。', en: 'I study at the library.' },
      { jp: 'バスで 行きます。', reading: 'バスで いきます。', en: 'I go by bus.' },
    ],
  },
  {
    id: 'n5-e-direction',
    level: 'N5',
    title: '〜へ (direction)',
    meaning: 'toward ~ (direction of movement)',
    structure: 'Place + へ',
    explanation:
      'へ (pronounced "e") marks the direction of movement. It overlaps with に for destinations; へ stresses the direction, に the arrival point.',
    examples: [
      { jp: '国へ 帰ります。', reading: 'くにへ かえります。', en: 'I return to my home country.' },
      { jp: '右へ 曲がってください。', reading: 'みぎへ まがってください。', en: 'Please turn right.' },
    ],
  },
  {
    id: 'n5-to-and',
    level: 'N5',
    title: '〜と (and / with)',
    meaning: 'and (full list); together with',
    structure: 'Noun + と + Noun',
    explanation:
      'と joins nouns in a complete list ("A and B") and marks the person you do something with (友達と行く).',
    examples: [
      { jp: 'パンと たまごを 買いました。', reading: 'パンと たまごを かいました。', en: 'I bought bread and eggs.' },
      { jp: '友達と 映画を 見ます。', reading: 'ともだちと えいがを みます。', en: 'I watch a movie with a friend.' },
    ],
  },
  {
    id: 'n5-ya',
    level: 'N5',
    title: '〜や〜（など）',
    meaning: 'things like A and B (partial list)',
    structure: 'Noun + や + Noun（+ など）',
    explanation:
      'や lists examples without being exhaustive — "A, B, and so on". Often closed with など ("etc."). Compare to と, which lists everything.',
    examples: [
      { jp: '机の 上に 本や ペンが あります。', reading: 'つくえの うえに ほんや ペンが あります。', en: 'There are books, pens, and such on the desk.' },
    ],
  },
  {
    id: 'n5-no-possessive',
    level: 'N5',
    title: '〜の (possessive / modifier)',
    meaning: "'s / of (links two nouns)",
    structure: 'Noun + の + Noun',
    explanation:
      'の links nouns: possession (わたしの本), type (日本語の先生), or apposition. The second noun can be dropped when obvious (これはわたしのです).',
    examples: [
      { jp: 'これは わたしの 本です。', reading: 'これは わたしの ほんです。', en: 'This is my book.' },
      { jp: '日本語の 先生です。', reading: 'にほんごの せんせいです。', en: 'He is a Japanese teacher.' },
    ],
  },
  {
    id: 'n5-mo',
    level: 'N5',
    title: '〜も (also / too)',
    meaning: 'also, too; (with negative) not ~ either',
    structure: 'Noun + も',
    explanation:
      'も replaces は/が/を to mean "also". Repeated (〜も〜も) it means "both… and…"; with a negative it means "neither… nor…".',
    examples: [
      { jp: 'わたしも 学生です。', reading: 'わたしも がくせいです。', en: 'I am a student too.' },
      { jp: 'お金も 時間も ありません。', reading: 'おかねも じかんも ありません。', en: 'I have neither money nor time.' },
    ],
  },
  {
    id: 'n5-kara-made',
    level: 'N5',
    title: '〜から〜まで',
    meaning: 'from ~ to ~ (time / place)',
    structure: 'Point + から + point + まで',
    explanation:
      'から marks a starting point and まで an ending point, for both time and space. Each can be used alone.',
    examples: [
      { jp: '9時から 5時まで 働きます。', reading: 'くじから ごじまで はたらきます。', en: 'I work from 9 to 5.' },
      { jp: '駅から 家まで 歩きます。', reading: 'えきから いえまで あるきます。', en: 'I walk from the station to my house.' },
    ],
  },
  {
    id: 'n5-ka-question',
    level: 'N5',
    title: '〜か (question marker)',
    meaning: 'turns a sentence into a question',
    structure: 'Sentence + か',
    explanation:
      'Adding か to the end of a polite sentence makes it a question (no question mark needed). Between two nouns, 〜か〜 means "A or B".',
    examples: [
      { jp: '学生ですか。', reading: 'がくせいですか。', en: 'Are you a student?' },
      { jp: 'お茶か コーヒーを 飲みます。', reading: 'おちゃか コーヒーを のみます。', en: 'I drink tea or coffee.' },
    ],
  },
  {
    id: 'n5-ne-yo',
    level: 'N5',
    title: '〜ね / 〜よ',
    meaning: 'right? (ね); you know / I tell you (よ)',
    structure: 'Sentence + ね / よ',
    explanation:
      'ね seeks agreement or confirmation ("…, right?"). よ asserts new information the listener may not know. They can combine as よね.',
    examples: [
      { jp: 'いい 天気ですね。', reading: 'いい てんきですね。', en: "Nice weather, isn't it?" },
      { jp: 'この ケーキ、おいしいですよ。', reading: 'この ケーキ、おいしいですよ。', en: 'This cake is delicious, you know.' },
    ],
  },
  {
    id: 'n5-masu',
    level: 'N5',
    title: '〜ます / 〜ません',
    meaning: 'polite verb (do / do not)',
    structure: 'Verb stem + ます / ません',
    explanation:
      'The polite non-past form. ます = do/will do, ません = do not/will not. It covers both present and future.',
    examples: [
      { jp: '毎日 勉強します。', reading: 'まいにち べんきょうします。', en: 'I study every day.' },
      { jp: 'お酒を 飲みません。', reading: 'おさけを のみません。', en: "I don't drink alcohol." },
    ],
  },
  {
    id: 'n5-mashita',
    level: 'N5',
    title: '〜ました / 〜ませんでした',
    meaning: 'polite past (did / did not)',
    structure: 'Verb stem + ました / ませんでした',
    explanation: 'The polite past form of verbs: ました for "did", ませんでした for "did not".',
    examples: [
      { jp: '映画を 見ました。', reading: 'えいがを みました。', en: 'I watched a movie.' },
      { jp: '昨日は 来ませんでした。', reading: 'きのうは きませんでした。', en: "I didn't come yesterday." },
    ],
  },
  {
    id: 'n5-arimasu-imasu',
    level: 'N5',
    title: 'あります / います',
    meaning: 'there is / exists',
    structure: 'Place + に + thing + が + あります（things）/ います（living）',
    explanation:
      'Both mean "exist". あります for inanimate things and plants; います for people and animals that can move.',
    examples: [
      { jp: '机の 上に 本が あります。', reading: 'つくえの うえに ほんが あります。', en: 'There is a book on the desk.' },
      { jp: '公園に 子供が います。', reading: 'こうえんに こどもが います。', en: 'There are children in the park.' },
    ],
  },
  {
    id: 'n5-i-adjective',
    level: 'N5',
    title: 'い-adjectives',
    meaning: 'describing words ending in い',
    structure: 'Adj（い）+ noun / Adj + です. Negative: 〜くない. Past: 〜かった',
    explanation:
      'い-adjectives conjugate by themselves: 高い → 高くない → 高かった → 高くなかった. いい (good) is irregular: よくない, よかった.',
    examples: [
      { jp: 'この カバンは 高いです。', reading: 'この カバンは たかいです。', en: 'This bag is expensive.' },
      { jp: '昨日は 寒くなかったです。', reading: 'きのうは さむくなかったです。', en: "Yesterday wasn't cold." },
    ],
  },
  {
    id: 'n5-na-adjective',
    level: 'N5',
    title: 'な-adjectives',
    meaning: 'adjectival nouns (use な before nouns)',
    structure: 'Adj + な + noun / Adj + です. Negative: 〜ではない. Past: 〜でした',
    explanation:
      'な-adjectives behave like nouns. They take な when modifying a noun directly (静かな部屋) and conjugate with the copula です/でした/ではない.',
    examples: [
      { jp: '静かな 部屋ですね。', reading: 'しずかな へやですね。', en: "It's a quiet room, isn't it?" },
      { jp: 'この 町は 便利です。', reading: 'この まちは べんりです。', en: 'This town is convenient.' },
    ],
  },
  {
    id: 'n5-adverbial',
    level: 'N5',
    title: 'Adjective → adverb (〜く / 〜に)',
    meaning: 'makes an adjective modify a verb',
    structure: 'い-adj → 〜く / な-adj → 〜に + verb',
    explanation:
      'To describe how an action is done, turn い-adjectives into 〜く (早く) and な-adjectives into 〜に (静かに).',
    examples: [
      { jp: '早く 起きました。', reading: 'はやく おきました。', en: 'I got up early.' },
      { jp: '静かに してください。', reading: 'しずかに してください。', en: 'Please be quiet.' },
    ],
  },
  {
    id: 'n5-suki',
    level: 'N5',
    title: '〜が好き / 上手 / 下手',
    meaning: 'like / good at / bad at',
    structure: 'Noun + が + 好き / 上手 / 下手（な-adjectives）',
    explanation:
      'The thing you like or are skilled at is marked with が, not を. 好き (like), 上手 (skilled), 下手 (unskilled) are all な-adjectives.',
    examples: [
      { jp: '音楽が 好きです。', reading: 'おんがくが すきです。', en: 'I like music.' },
      { jp: '彼は 料理が 上手です。', reading: 'かれは りょうりが じょうずです。', en: 'He is good at cooking.' },
    ],
  },
  {
    id: 'n5-hoshii',
    level: 'N5',
    title: '〜がほしい',
    meaning: 'want (a thing)',
    structure: 'Noun + が + ほしい',
    explanation:
      'Expresses wanting a noun (an object). ほしい is an い-adjective. For wanting to do an action, use the verb + たい instead.',
    examples: [
      { jp: '新しい パソコンが ほしいです。', reading: 'あたらしい パソコンが ほしいです。', en: 'I want a new computer.' },
    ],
  },
  {
    id: 'n5-tai',
    level: 'N5',
    title: '〜たい',
    meaning: 'want to do ~',
    structure: 'Verb stem + たい',
    explanation:
      'Expresses the speaker\'s desire to do something. It conjugates like an い-adjective (たい → たくない → たかった).',
    examples: [
      { jp: '日本へ 行きたいです。', reading: 'にほんへ いきたいです。', en: 'I want to go to Japan.' },
      { jp: '今日は 何も したくないです。', reading: 'きょうは なにも したくないです。', en: "I don't want to do anything today." },
    ],
  },
  {
    id: 'n5-mashou',
    level: 'N5',
    title: '〜ましょう / 〜ましょうか',
    meaning: "let's ~ / shall I/we ~?",
    structure: 'Verb stem + ましょう（か）',
    explanation:
      'ましょう proposes doing something together. Adding か softens it into an offer or suggestion ("shall I/we ~?").',
    examples: [
      { jp: 'いっしょに 帰りましょう。', reading: 'いっしょに かえりましょう。', en: "Let's go home together." },
      { jp: '荷物を 持ちましょうか。', reading: 'にもつを もちましょうか。', en: 'Shall I carry your luggage?' },
    ],
  },
  {
    id: 'n5-masenka',
    level: 'N5',
    title: '〜ませんか',
    meaning: "won't you ~? (invitation)",
    structure: 'Verb stem + ませんか',
    explanation:
      'A polite invitation. Softer than ましょう because it leaves the choice to the listener ("would you like to ~?").',
    examples: [
      { jp: 'いっしょに お茶を 飲みませんか。', reading: 'いっしょに おちゃを のみませんか。', en: "Won't you have tea with me?" },
    ],
  },
  {
    id: 'n5-te-form',
    level: 'N5',
    title: 'て-form (connecting)',
    meaning: 'and (links verbs/clauses in sequence)',
    structure: 'Verb て-form + ...',
    explanation:
      'The て-form connects actions in sequence ("do A and then B"), gives reasons, and is the base for many grammar patterns (てください, ている, てもいい…).',
    examples: [
      { jp: '朝 起きて、顔を 洗います。', reading: 'あさ おきて、かおを あらいます。', en: 'I get up in the morning and wash my face.' },
    ],
  },
  {
    id: 'n5-te-kudasai',
    level: 'N5',
    title: '〜てください',
    meaning: 'please do ~',
    structure: 'Verb て-form + ください',
    explanation: 'A polite request or instruction to do something.',
    examples: [
      { jp: 'ちょっと 待ってください。', reading: 'ちょっと まってください。', en: 'Please wait a moment.' },
      { jp: 'もう一度 言ってください。', reading: 'もういちど いってください。', en: 'Please say it once more.' },
    ],
  },
  {
    id: 'n5-naide-kudasai',
    level: 'N5',
    title: '〜ないでください',
    meaning: "please don't do ~",
    structure: 'Verb ない-form + でください',
    explanation: 'The negative request — asking someone not to do something.',
    examples: [
      { jp: 'ここで 写真を 撮らないでください。', reading: 'ここで しゃしんを とらないでください。', en: "Please don't take photos here." },
    ],
  },
  {
    id: 'n5-te-iru',
    level: 'N5',
    title: '〜ている',
    meaning: 'is doing / is in a state',
    structure: 'Verb て-form + いる（います）',
    explanation:
      'Shows an action in progress ("is reading") or an ongoing state resulting from a change ("is married", "is open").',
    examples: [
      { jp: '今 電話で 話しています。', reading: 'いま でんわで はなしています。', en: 'I am talking on the phone now.' },
      { jp: '窓が 開いています。', reading: 'まどが あいています。', en: 'The window is open.' },
    ],
  },
  {
    id: 'n5-temo-ii',
    level: 'N5',
    title: '〜てもいいです',
    meaning: "may ~ / it's OK to ~",
    structure: 'Verb て-form + もいいです',
    explanation: 'Gives or asks permission. As a question (〜てもいいですか) it means "May I ~?".',
    examples: [
      { jp: 'ここに 座ってもいいですか。', reading: 'ここに すわってもいいですか。', en: 'May I sit here?' },
    ],
  },
  {
    id: 'n5-tewa-ikemasen',
    level: 'N5',
    title: '〜てはいけません',
    meaning: 'must not ~ (prohibition)',
    structure: 'Verb て-form + はいけません',
    explanation:
      'States that something is forbidden. In casual speech it shortens to 〜ちゃだめ / 〜ちゃいけない.',
    examples: [
      { jp: 'ここで たばこを 吸ってはいけません。', reading: 'ここで たばこを すってはいけません。', en: 'You must not smoke here.' },
    ],
  },
  {
    id: 'n5-te-kara',
    level: 'N5',
    title: '〜てから',
    meaning: 'after doing ~',
    structure: 'Verb て-form + から',
    explanation:
      'Shows that one action happens after another is finished. Emphasizes sequence ("after A, then B").',
    examples: [
      { jp: '宿題を してから、遊びます。', reading: 'しゅくだいを してから、あそびます。', en: 'After I do my homework, I play.' },
    ],
  },
  {
    id: 'n5-mae-ni',
    level: 'N5',
    title: '〜前に',
    meaning: 'before ~',
    structure: 'Verb dictionary form / Noun + の + 前に',
    explanation:
      'Indicates doing something before another event. Always uses the dictionary (non-past) form of the verb, even about the past.',
    examples: [
      { jp: '寝る前に 歯を 磨きます。', reading: 'ねるまえに はを みがきます。', en: 'I brush my teeth before going to bed.' },
      { jp: '食事の前に 手を 洗います。', reading: 'しょくじのまえに てを あらいます。', en: 'I wash my hands before meals.' },
    ],
  },
  {
    id: 'n5-ato-de',
    level: 'N5',
    title: '〜あとで',
    meaning: 'after ~',
    structure: 'Verb た-form / Noun + の + あとで',
    explanation:
      'Indicates doing something after another event. Uses the past (た) form of the verb or noun + の.',
    examples: [
      { jp: '仕事の あとで 飲みに 行きます。', reading: 'しごとの あとで のみに いきます。', en: 'After work, I go for a drink.' },
    ],
  },
  {
    id: 'n5-nagara',
    level: 'N5',
    title: '〜ながら',
    meaning: 'while doing ~ (two actions at once)',
    structure: 'Verb stem + ながら',
    explanation:
      'Shows two simultaneous actions by the same person. The main action is the second verb.',
    examples: [
      { jp: '音楽を 聞きながら 勉強します。', reading: 'おんがくを ききながら べんきょうします。', en: 'I study while listening to music.' },
    ],
  },
  {
    id: 'n5-tari-tari',
    level: 'N5',
    title: '〜たり〜たりする',
    meaning: 'do things like A and B (examples)',
    structure: 'Verb た-form + り + verb た-form + り + する',
    explanation:
      'Lists representative actions, not an exhaustive or ordered list ("do such things as A and B").',
    examples: [
      { jp: '休みの日は 本を 読んだり 音楽を 聞いたりします。', reading: 'やすみのひは ほんを よんだり おんがくを きいたりします。', en: 'On days off I do things like read books and listen to music.' },
    ],
  },
  {
    id: 'n5-naru',
    level: 'N5',
    title: '〜くなる / 〜になる',
    meaning: 'become ~',
    structure: 'い-adj → 〜く + なる / な-adj・noun → 〜に + なる',
    explanation: 'Expresses a change of state — becoming something. Pairs with adjectives and nouns.',
    examples: [
      { jp: '寒くなりました。', reading: 'さむくなりました。', en: 'It has gotten cold.' },
      { jp: '彼は 医者に なりました。', reading: 'かれは いしゃに なりました。', en: 'He became a doctor.' },
    ],
  },
  {
    id: 'n5-mada-mou',
    level: 'N5',
    title: 'まだ / もう',
    meaning: 'still / not yet (まだ); already (もう)',
    structure: 'まだ + affirmative/〜ていない / もう + 〜ました',
    explanation:
      'もう = "already" with the past. まだ = "still" with affirmatives, or "not yet" with 〜ていません.',
    examples: [
      { jp: 'もう 昼ごはんを 食べました。', reading: 'もう ひるごはんを たべました。', en: "I've already eaten lunch." },
      { jp: 'まだ 食べていません。', reading: 'まだ たべていません。', en: "I haven't eaten yet." },
    ],
  },
  {
    id: 'n5-deshou',
    level: 'N5',
    title: '〜でしょう',
    meaning: 'probably ~ / right?',
    structure: 'Plain form + でしょう',
    explanation:
      'Expresses probability ("probably"). With rising intonation it seeks agreement. More casual: だろう.',
    examples: [
      { jp: '明日は 雨でしょう。', reading: 'あしたは あめでしょう。', en: 'It will probably rain tomorrow.' },
    ],
  },
  {
    id: 'n5-kara-because',
    level: 'N5',
    title: '〜から (because)',
    meaning: 'because ~ / so ~',
    structure: 'Reason (plain/polite) + から',
    explanation:
      'から gives a subjective reason. The reason comes first, から marks it, then the result follows.',
    examples: [
      { jp: '寒いから、窓を 閉めます。', reading: 'さむいから、まどを しめます。', en: "Because it's cold, I'll close the window." },
    ],
  },
  {
    id: 'n5-ga-but',
    level: 'N5',
    title: '〜が / 〜けど (but)',
    meaning: 'but / however',
    structure: 'Clause + が、/ けど、+ clause',
    explanation:
      'が connects two clauses with contrast ("…, but…"). けど is the more casual equivalent. が can also just soften a lead-in.',
    examples: [
      { jp: 'この 料理は 高いですが、おいしいです。', reading: 'この りょうりは たかいですが、おいしいです。', en: 'This dish is expensive, but delicious.' },
    ],
  },
  {
    id: 'n5-toki',
    level: 'N5',
    title: '〜とき',
    meaning: 'when ~ / at the time of ~',
    structure: 'Plain form / Noun + の + とき',
    explanation:
      'Marks the time when something happens. Verb tense before とき shows whether the action is before or after the main clause.',
    examples: [
      { jp: '日本に 行ったとき、写真を たくさん 撮りました。', reading: 'にほんに いったとき、しゃしんを たくさん とりました。', en: 'When I went to Japan, I took many photos.' },
      { jp: '子供のとき、よく 泣きました。', reading: 'こどものとき、よく なきました。', en: 'When I was a child, I cried a lot.' },
    ],
  },
  {
    id: 'n5-hou-ga',
    level: 'N5',
    title: '〜より〜のほうが',
    meaning: 'A is more ~ than B',
    structure: 'B + より + A + のほうが + adjective',
    explanation:
      'The comparison pattern. のほうが marks the one that is "more", より marks the standard being compared against.',
    examples: [
      { jp: 'バスより 電車のほうが 速いです。', reading: 'バスより でんしゃのほうが はやいです。', en: 'The train is faster than the bus.' },
    ],
  },
  {
    id: 'n5-ichiban',
    level: 'N5',
    title: '〜で一番',
    meaning: 'the most ~ (superlative)',
    structure: '（Group）で + 一番 + adjective',
    explanation:
      '一番 ("number one") makes the superlative. The group or category is marked with で or の中で.',
    examples: [
      { jp: 'クラスで 一番 背が 高いです。', reading: 'クラスで いちばん せが たかいです。', en: 'He is the tallest in the class.' },
    ],
  },
  {
    id: 'n5-counter',
    level: 'N5',
    title: 'Counters (〜つ・〜人・〜枚…)',
    meaning: 'counting with the right counter word',
    structure: 'Number + counter',
    explanation:
      'Japanese counts things with counter suffixes: 〜つ (general), 〜人 (people), 〜枚 (flat things), 〜本 (long things), 〜匹 (small animals), etc.',
    examples: [
      { jp: 'りんごを 三つ ください。', reading: 'りんごを みっつ ください。', en: 'Three apples, please.' },
      { jp: '学生が 五人 います。', reading: 'がくせいが ごにん います。', en: 'There are five students.' },
    ],
  },
  {
    id: 'n5-n-desu',
    level: 'N5',
    title: '〜んです / のです',
    meaning: 'explanatory ~ (gives a reason/context)',
    structure: 'Plain form (な after noun/な-adj) + んです',
    explanation:
      'Adds an explanatory nuance — giving a reason, background, or seeking one. Common in questions (どうして〜んですか) and answers.',
    examples: [
      { jp: 'どうして 遅れたんですか。', reading: 'どうして おくれたんですか。', en: 'Why were you late?' },
      { jp: '電車が 止まったんです。', reading: 'でんしゃが とまったんです。', en: "It's because the train stopped." },
    ],
  },
  {
    id: 'n5-question-words',
    level: 'N5',
    title: 'Question words (なに・だれ・どこ…)',
    meaning: 'what, who, where, when, why, how',
    structure: 'なに/何, だれ, どこ, いつ, どうして, どう, いくら, どれ…',
    explanation:
      'Basic interrogatives. Add か for "some-" (だれか = someone) and も + negative for "no-" (だれも〜ない = no one).',
    examples: [
      { jp: 'これは 何ですか。', reading: 'これは なんですか。', en: 'What is this?' },
      { jp: 'だれも いません。', reading: 'だれも いません。', en: 'There is no one.' },
    ],
  },
  {
    id: 'n5-koso-ado',
    level: 'N5',
    title: 'これ・それ・あれ / この・その・あの',
    meaning: 'this / that / that over there',
    structure: 'これ・それ・あれ（pronouns）/ この・その・あの + noun',
    explanation:
      'The ko-so-a-do series: こ = near speaker, そ = near listener, あ = far from both, ど = question (どれ, どの). これ stands alone; この needs a noun.',
    examples: [
      { jp: 'その 本を 取ってください。', reading: 'その ほんを とってください。', en: 'Please pass me that book.' },
      { jp: 'あれは 何ですか。', reading: 'あれは なんですか。', en: 'What is that over there?' },
    ],
  },
];

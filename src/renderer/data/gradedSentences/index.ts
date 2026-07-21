import type { LevelTier } from '../../../shared/levelScale';
import type { SourceLang } from '../../games/types';

export interface GradedSentence {
  id: string;
  level: LevelTier;
  jp: string;
  reading: string;
  tokens: string[];
  translations: Record<SourceLang, string>;
}

export interface VocabPrompt {
  id: string;
  level: LevelTier;
  jp: string;
  reading: string;
  meanings: Record<SourceLang, string>;
}

export interface ClozePrompt {
  id: string;
  level: LevelTier;
  prompt: string;
  answer: string;
  choices: string[];
  translations: Record<SourceLang, string>;
}

export interface KanaPrompt {
  kana: string;
  romaji: string;
}

export interface KanjiReadingPrompt {
  id: string;
  level: LevelTier;
  word: string;
  reading: string;
  choices: string[];
  meaning: Record<SourceLang, string>;
}

export interface ParticlePrompt {
  id: string;
  level: LevelTier;
  prompt: string;
  answer: string;
  choices: string[];
  hint: Record<SourceLang, string>;
}

export interface CounterPrompt {
  id: string;
  level: LevelTier;
  object: Record<SourceLang, string>;
  number: number;
  answer: string;
  /** Kana reading of `answer` — Counter Quiz is typed, and the reading is accepted. */
  reading: string;
  choices: string[];
  jp: string;
}

// Authoring rules for every array below — the engine depends on all four:
//   1. `tokens` must join back to `jp` exactly (Sentence Builder compares joins).
//   2. `choices` must contain `answer`, and the other three must be
//      unambiguously WRONG — a distractor that is also grammatical makes a
//      correct answer score as a mistake (e.g. にかかわらず/にもかかわらず, or
//      へ/に for a movement target, are both right; never pair those).
//   3. Five items per level where possible: the round picker filters to
//      level +/-1 and indexes by `seed % pool.length`, so a thin level band
//      repeats inside a single session.
//   4. Readings are kana-only (Speed Type accepts them as an alternative).

export const GRADED_SENTENCES: GradedSentence[] = [
  {
    id: 'ja-l1-hello',
    level: 1,
    jp: 'こんにちは。私は学生です。',
    reading: 'こんにちは。わたしはがくせいです。',
    tokens: ['こんにちは', '。', '私', 'は', '学生', 'です', '。'],
    translations: {
      en: 'Hello. I am a student.',
      ru: 'Здравствуйте. Я студент.',
      zh: '你好。我是学生。',
    },
  },
  {
    id: 'ja-l1-name',
    level: 1,
    jp: '私の名前は田中です。',
    reading: 'わたしのなまえはたなかです。',
    tokens: ['私', 'の', '名前', 'は', '田中', 'です', '。'],
    translations: {
      en: 'My name is Tanaka.',
      ru: 'Меня зовут Танака.',
      zh: '我的名字是田中。',
    },
  },
  {
    id: 'ja-l1-cat',
    level: 1,
    jp: 'これは猫です。',
    reading: 'これはねこです。',
    tokens: ['これ', 'は', '猫', 'です', '。'],
    translations: {
      en: 'This is a cat.',
      ru: 'Это кошка.',
      zh: '这是猫。',
    },
  },
  {
    id: 'ja-l1-water',
    level: 1,
    jp: '毎日水を飲みます。',
    reading: 'まいにちみずをのみます。',
    tokens: ['毎日', '水', 'を', '飲みます', '。'],
    translations: {
      en: 'I drink water every day.',
      ru: 'Я пью воду каждый день.',
      zh: '我每天喝水。',
    },
  },
  {
    id: 'ja-l1-school',
    level: 1,
    jp: '学校で日本語を勉強します。',
    reading: 'がっこうでにほんごをべんきょうします。',
    tokens: ['学校', 'で', '日本語', 'を', '勉強します', '。'],
    translations: {
      en: 'I study Japanese at school.',
      ru: 'Я изучаю японский в школе.',
      zh: '我在学校学习日语。',
    },
  },
  {
    id: 'ja-l2-coffee',
    level: 2,
    jp: '私は毎朝コーヒーを飲みます。',
    reading: 'わたしはまいあさコーヒーをのみます。',
    tokens: ['私', 'は', '毎朝', 'コーヒー', 'を', '飲みます', '。'],
    translations: {
      en: 'I drink coffee every morning.',
      ru: 'Я пью кофе каждое утро.',
      zh: '我每天早上喝咖啡。',
    },
  },
  {
    id: 'ja-l2-book',
    level: 2,
    jp: '昨日、新しい本を買いました。',
    reading: 'きのう、あたらしいほんをかいました。',
    tokens: ['昨日', '、', '新しい', '本', 'を', '買いました', '。'],
    translations: {
      en: 'Yesterday I bought a new book.',
      ru: 'Вчера я купил новую книгу.',
      zh: '昨天我买了一本新书。',
    },
  },
  {
    id: 'ja-l2-weather',
    level: 2,
    jp: '今日はとても暑いです。',
    reading: 'きょうはとてもあついです。',
    tokens: ['今日', 'は', 'とても', '暑い', 'です', '。'],
    translations: {
      en: 'It is very hot today.',
      ru: 'Сегодня очень жарко.',
      zh: '今天很热。',
    },
  },
  {
    id: 'ja-l2-station',
    level: 2,
    jp: '駅まで歩いて行きます。',
    reading: 'えきまであるいていきます。',
    tokens: ['駅', 'まで', '歩いて', '行きます', '。'],
    translations: {
      en: 'I walk to the station.',
      ru: 'Я иду пешком до станции.',
      zh: '我走路去车站。',
    },
  },
  {
    id: 'ja-l2-family',
    level: 2,
    jp: '家族と一緒に晩ご飯を食べます。',
    reading: 'かぞくといっしょにばんごはんをたべます。',
    tokens: ['家族', 'と', '一緒に', '晩ご飯', 'を', '食べます', '。'],
    translations: {
      en: 'I eat dinner together with my family.',
      ru: 'Я ужинаю вместе с семьёй.',
      zh: '我和家人一起吃晚饭。',
    },
  },
  {
    id: 'ja-l3-library',
    level: 3,
    jp: '図書館で友達に会いました。',
    reading: 'としょかんでともだちにあいました。',
    tokens: ['図書館', 'で', '友達', 'に', '会いました', '。'],
    translations: {
      en: 'I met my friend at the library.',
      ru: 'Я встретил друга в библиотеке.',
      zh: '我在图书馆见到了朋友。',
    },
  },
  {
    id: 'ja-l3-hobby',
    level: 3,
    jp: '私の趣味は写真を撮ることです。',
    reading: 'わたしのしゅみはしゃしんをとることです。',
    tokens: ['私', 'の', '趣味', 'は', '写真', 'を', '撮る', 'こと', 'です', '。'],
    translations: {
      en: 'My hobby is taking photographs.',
      ru: 'Моё хобби — фотографировать.',
      zh: '我的爱好是拍照。',
    },
  },
  {
    id: 'ja-l3-busy',
    level: 3,
    jp: '今週は仕事が忙しかったです。',
    reading: 'こんしゅうはしごとがいそがしかったです。',
    tokens: ['今週', 'は', '仕事', 'が', '忙しかった', 'です', '。'],
    translations: {
      en: 'Work was busy this week.',
      ru: 'На этой неделе работа была напряжённой.',
      zh: '这周工作很忙。',
    },
  },
  {
    id: 'ja-l3-can-write',
    level: 3,
    jp: '日本語で手紙を書くことができます。',
    reading: 'にほんごでてがみをかくことができます。',
    tokens: ['日本語', 'で', '手紙', 'を', '書く', 'こと', 'が', 'できます', '。'],
    translations: {
      en: 'I can write letters in Japanese.',
      ru: 'Я могу писать письма по-японски.',
      zh: '我会用日语写信。',
    },
  },
  {
    id: 'ja-l3-train',
    level: 3,
    jp: '電車が遅れたので、遅刻しました。',
    reading: 'でんしゃがおくれたので、ちこくしました。',
    tokens: ['電車', 'が', '遅れた', 'ので', '、', '遅刻しました', '。'],
    translations: {
      en: 'The train was late, so I was late.',
      ru: 'Поезд опоздал, поэтому я опоздал.',
      zh: '因为电车晚点，我迟到了。',
    },
  },
  {
    id: 'ja-l4-rain',
    level: 4,
    jp: '雨が降りそうなので、傘を持っていきます。',
    reading: 'あめがふりそうなので、かさをもっていきます。',
    tokens: ['雨', 'が', '降りそう', 'なので', '、', '傘', 'を', '持っていきます', '。'],
    translations: {
      en: 'It looks like rain, so I will take an umbrella.',
      ru: 'Похоже, будет дождь, поэтому я возьму зонт.',
      zh: '看起来要下雨，所以我会带伞。',
    },
  },
  {
    id: 'ja-l4-experience',
    level: 4,
    jp: '日本に住んだことがありますか。',
    reading: 'にほんにすんだことがありますか。',
    tokens: ['日本', 'に', '住んだ', 'こと', 'が', 'あります', 'か', '。'],
    translations: {
      en: 'Have you ever lived in Japan?',
      ru: 'Вы когда-нибудь жили в Японии?',
      zh: '你曾经在日本住过吗？',
    },
  },
  {
    id: 'ja-l4-advice',
    level: 4,
    jp: '医者に相談したほうがいいと思います。',
    reading: 'いしゃにそうだんしたほうがいいとおもいます。',
    tokens: ['医者', 'に', '相談した', 'ほうがいい', 'と', '思います', '。'],
    translations: {
      en: 'I think you should consult a doctor.',
      ru: 'Я думаю, вам стоит проконсультироваться с врачом.',
      zh: '我觉得你最好咨询医生。',
    },
  },
  {
    id: 'ja-l4-music',
    level: 4,
    jp: '音楽を聞きながら勉強します。',
    reading: 'おんがくをききながらべんきょうします。',
    tokens: ['音楽', 'を', '聞き', 'ながら', '勉強します', '。'],
    translations: {
      en: 'I study while listening to music.',
      ru: 'Я занимаюсь, слушая музыку.',
      zh: '我一边听音乐一边学习。',
    },
  },
  {
    id: 'ja-l4-plan',
    level: 4,
    jp: '来年、留学するつもりです。',
    reading: 'らいねん、りゅうがくするつもりです。',
    tokens: ['来年', '、', '留学する', 'つもり', 'です', '。'],
    translations: {
      en: 'I plan to study abroad next year.',
      ru: 'В следующем году я собираюсь учиться за границей.',
      zh: '我打算明年去留学。',
    },
  },
  {
    id: 'ja-l5-report',
    level: 5,
    jp: '報告書を提出する前に、もう一度確認してください。',
    reading: 'ほうこくしょをていしゅつするまえに、もういちどかくにんしてください。',
    tokens: ['報告書', 'を', '提出する', '前', 'に', '、', 'もう一度', '確認して', 'ください', '。'],
    translations: {
      en: 'Please check it once more before submitting the report.',
      ru: 'Пожалуйста, проверьте ещё раз перед отправкой отчёта.',
      zh: '提交报告前，请再确认一次。',
    },
  },
  {
    id: 'ja-l5-meeting',
    level: 5,
    jp: '日程が変更になった場合は、連絡してください。',
    reading: 'にっていがへんこうになったばあいは、れんらくしてください。',
    tokens: ['日程', 'が', '変更', 'に', 'なった', '場合', 'は', '、', '連絡して', 'ください', '。'],
    translations: {
      en: 'If the schedule changes, please contact me.',
      ru: 'Если расписание изменится, пожалуйста, свяжитесь со мной.',
      zh: '如果日程有变更，请联系我。',
    },
  },
  {
    id: 'ja-l5-novel',
    level: 5,
    jp: 'この小説は多くの言語に翻訳されています。',
    reading: 'このしょうせつはおおくのげんごにほんやくされています。',
    tokens: ['この', '小説', 'は', '多く', 'の', '言語', 'に', '翻訳されています', '。'],
    translations: {
      en: 'This novel has been translated into many languages.',
      ru: 'Этот роман переведён на многие языки.',
      zh: '这部小说被翻译成了很多语言。',
    },
  },
  {
    id: 'ja-l5-manual',
    level: 5,
    jp: '説明書を読んでも、使い方が分かりませんでした。',
    reading: 'せつめいしょをよんでも、つかいかたがわかりませんでした。',
    tokens: ['説明書', 'を', '読んでも', '、', '使い方', 'が', '分かりませんでした', '。'],
    translations: {
      en: 'Even after reading the manual, I did not understand how to use it.',
      ru: 'Даже прочитав инструкцию, я не понял, как этим пользоваться.',
      zh: '即使读了说明书，我也不明白怎么用。',
    },
  },
  {
    id: 'ja-l5-postpone',
    level: 5,
    jp: '話し合った結果、計画を延期することにしました。',
    reading: 'はなしあったけっか、けいかくをえんきすることにしました。',
    tokens: ['話し合った', '結果', '、', '計画', 'を', '延期する', 'こと', 'に', 'しました', '。'],
    translations: {
      en: 'After discussion, we decided to postpone the plan.',
      ru: 'В результате обсуждения мы решили отложить план.',
      zh: '讨论的结果是，我们决定推迟计划。',
    },
  },
  {
    id: 'ja-l6-policy',
    level: 6,
    jp: '新しい制度に伴い、申請手続きが簡略化されました。',
    reading: 'あたらしいせいどにともない、しんせいてつづきがかんりゃくかされました。',
    tokens: ['新しい', '制度', 'に伴い', '、', '申請', '手続き', 'が', '簡略化されました', '。'],
    translations: {
      en: 'With the new system, the application procedure was simplified.',
      ru: 'В связи с новой системой процедура подачи заявления была упрощена.',
      zh: '随着新制度实施，申请手续被简化了。',
    },
  },
  {
    id: 'ja-l6-research',
    level: 6,
    jp: '調査の結果によると、若者の読書時間は減少傾向にある。',
    reading: 'ちょうさのけっかによると、わかもののどくしょじかんはげんしょうけいこうにある。',
    tokens: ['調査', 'の', '結果', 'によると', '、', '若者', 'の', '読書', '時間', 'は', '減少', '傾向', 'に', 'ある', '。'],
    translations: {
      en: "According to the survey results, young people's reading time is on a downward trend.",
      ru: 'Согласно результатам исследования, время чтения у молодёжи имеет тенденцию к снижению.',
      zh: '根据调查结果，年轻人的阅读时间呈下降趋势。',
    },
  },
  {
    id: 'ja-l6-weather-regardless',
    level: 6,
    jp: '天候にかかわらず、大会は予定通り開催されます。',
    reading: 'てんこうにかかわらず、たいかいはよていどおりかいさいされます。',
    tokens: ['天候', 'に', 'かかわらず', '、', '大会', 'は', '予定通り', '開催されます', '。'],
    translations: {
      en: 'Regardless of the weather, the tournament will be held as scheduled.',
      ru: 'Независимо от погоды, турнир состоится по расписанию.',
      zh: '无论天气如何，大会都将按计划举行。',
    },
  },
  {
    id: 'ja-l6-flexible',
    level: 6,
    jp: '経験に加えて、柔軟な発想が求められている。',
    reading: 'けいけんにくわえて、じゅうなんなはっそうがもとめられている。',
    tokens: ['経験', 'に', '加えて', '、', '柔軟な', '発想', 'が', '求められている', '。'],
    translations: {
      en: 'In addition to experience, flexible thinking is being demanded.',
      ru: 'Помимо опыта, требуется гибкое мышление.',
      zh: '除了经验之外，还要求灵活的思维。',
    },
  },
  {
    id: 'ja-l6-gratitude',
    level: 6,
    jp: '感謝の気持ちを込めて、手紙を書きました。',
    reading: 'かんしゃのきもちをこめて、てがみをかきました。',
    tokens: ['感謝', 'の', '気持ち', 'を', '込めて', '、', '手紙', 'を', '書きました', '。'],
    translations: {
      en: 'I wrote the letter filled with feelings of gratitude.',
      ru: 'Я написал письмо, вложив в него чувство благодарности.',
      zh: '我怀着感谢的心情写了这封信。',
    },
  },
  {
    id: 'ja-l7-essay',
    level: 7,
    jp: '便利さを追求するあまり、私たちは不便から学ぶ機会を失いつつあります。',
    reading: 'べんりさをついきゅうするあまり、わたしたちはふべんからまなぶきかいをうしないつつあります。',
    tokens: ['便利さ', 'を', '追求する', 'あまり', '、', '私たち', 'は', '不便', 'から', '学ぶ', '機会', 'を', '失いつつあります', '。'],
    translations: {
      en: 'In pursuing convenience too far, we are losing chances to learn from inconvenience.',
      ru: 'Чрезмерно стремясь к удобству, мы постепенно теряем возможность учиться на неудобствах.',
      zh: '过度追求便利之下，我们正逐渐失去从不便中学习的机会。',
    },
  },
  {
    id: 'ja-l7-forced',
    level: 7,
    jp: '彼は計画の変更を認めざるを得なかった。',
    reading: 'かれはけいかくのへんこうをみとめざるをえなかった。',
    tokens: ['彼', 'は', '計画', 'の', '変更', 'を', '認め', 'ざるを得なかった', '。'],
    translations: {
      en: 'He had no choice but to accept the change to the plan.',
      ru: 'Ему не оставалось ничего другого, кроме как согласиться на изменение плана.',
      zh: '他不得不接受计划的变更。',
    },
  },
  {
    id: 'ja-l7-judgment',
    level: 7,
    jp: '技術が進歩したとはいえ、人間の判断は依然として不可欠である。',
    reading: 'ぎじゅつがしんぽしたとはいえ、にんげんのはんだんはいぜんとしてふかけつである。',
    tokens: ['技術', 'が', '進歩した', 'とはいえ', '、', '人間', 'の', '判断', 'は', '依然として', '不可欠', 'である', '。'],
    translations: {
      en: 'Although technology has advanced, human judgment remains indispensable.',
      ru: 'Хотя технологии продвинулись, человеческое суждение по-прежнему незаменимо.',
      zh: '虽然技术进步了，但人的判断依然不可或缺。',
    },
  },
  {
    id: 'ja-l7-realistic',
    level: 7,
    jp: '現実に即して考えれば、その提案は実行が難しい。',
    reading: 'げんじつにそくしてかんがえれば、そのていあんはじっこうがむずかしい。',
    tokens: ['現実', 'に', '即して', '考えれば', '、', 'その', '提案', 'は', '実行', 'が', '難しい', '。'],
    translations: {
      en: 'Thinking in line with reality, that proposal is difficult to carry out.',
      ru: 'Если рассуждать исходя из реальности, это предложение трудно осуществить.',
      zh: '从现实出发考虑，那个提案难以实行。',
    },
  },
  {
    id: 'ja-l7-authority',
    level: 7,
    jp: '長年の研究をもって、彼女はこの分野の第一人者となった。',
    reading: 'ながねんのけんきゅうをもって、かのじょはこのぶんやのだいいちにんしゃとなった。',
    tokens: ['長年', 'の', '研究', 'を', 'もって', '、', '彼女', 'は', 'この', '分野', 'の', '第一人者', 'と', 'なった', '。'],
    translations: {
      en: 'Through many years of research, she became a leading authority in this field.',
      ru: 'Благодаря многолетним исследованиям она стала ведущим специалистом в этой области.',
      zh: '凭借多年的研究，她成为了这个领域的第一人。',
    },
  },
];

export const VOCAB_PROMPTS: VocabPrompt[] = [
  { id: 'v-water', level: 1, jp: '水', reading: 'みず', meanings: { en: 'water', ru: 'вода', zh: '水' } },
  { id: 'v-cat', level: 1, jp: '猫', reading: 'ねこ', meanings: { en: 'cat', ru: 'кошка', zh: '猫' } },
  { id: 'v-mountain', level: 1, jp: '山', reading: 'やま', meanings: { en: 'mountain', ru: 'гора', zh: '山' } },
  { id: 'v-hand', level: 1, jp: '手', reading: 'て', meanings: { en: 'hand', ru: 'рука', zh: '手' } },
  { id: 'v-school', level: 1, jp: '学校', reading: 'がっこう', meanings: { en: 'school', ru: 'школа', zh: '学校' } },
  { id: 'v-book', level: 2, jp: '本', reading: 'ほん', meanings: { en: 'book', ru: 'книга', zh: '书' } },
  { id: 'v-station', level: 2, jp: '駅', reading: 'えき', meanings: { en: 'station', ru: 'станция', zh: '车站' } },
  { id: 'v-family', level: 2, jp: '家族', reading: 'かぞく', meanings: { en: 'family', ru: 'семья', zh: '家人' } },
  { id: 'v-morning', level: 2, jp: '毎朝', reading: 'まいあさ', meanings: { en: 'every morning', ru: 'каждое утро', zh: '每天早上' } },
  { id: 'v-buy', level: 2, jp: '買う', reading: 'かう', meanings: { en: 'to buy', ru: 'покупать', zh: '买' } },
  { id: 'v-library', level: 3, jp: '図書館', reading: 'としょかん', meanings: { en: 'library', ru: 'библиотека', zh: '图书馆' } },
  { id: 'v-hobby', level: 3, jp: '趣味', reading: 'しゅみ', meanings: { en: 'hobby', ru: 'хобби', zh: '爱好' } },
  { id: 'v-photo', level: 3, jp: '写真', reading: 'しゃしん', meanings: { en: 'photograph', ru: 'фотография', zh: '照片' } },
  { id: 'v-work', level: 3, jp: '仕事', reading: 'しごと', meanings: { en: 'work', ru: 'работа', zh: '工作' } },
  { id: 'v-train', level: 3, jp: '電車', reading: 'でんしゃ', meanings: { en: 'train', ru: 'поезд', zh: '电车' } },
  { id: 'v-umbrella', level: 4, jp: '傘', reading: 'かさ', meanings: { en: 'umbrella', ru: 'зонт', zh: '伞' } },
  { id: 'v-doctor', level: 4, jp: '医者', reading: 'いしゃ', meanings: { en: 'doctor', ru: 'врач', zh: '医生' } },
  { id: 'v-abroad', level: 4, jp: '留学', reading: 'りゅうがく', meanings: { en: 'studying abroad', ru: 'учёба за границей', zh: '留学' } },
  { id: 'v-experience', level: 4, jp: '経験', reading: 'けいけん', meanings: { en: 'experience', ru: 'опыт', zh: '经验' } },
  { id: 'v-music', level: 4, jp: '音楽', reading: 'おんがく', meanings: { en: 'music', ru: 'музыка', zh: '音乐' } },
  { id: 'v-submit', level: 5, jp: '提出する', reading: 'ていしゅつする', meanings: { en: 'to submit', ru: 'подавать', zh: '提交' } },
  { id: 'v-confirm', level: 5, jp: '確認', reading: 'かくにん', meanings: { en: 'confirmation', ru: 'проверка', zh: '确认' } },
  { id: 'v-manual', level: 5, jp: '説明書', reading: 'せつめいしょ', meanings: { en: 'instruction manual', ru: 'инструкция', zh: '说明书' } },
  { id: 'v-translation', level: 5, jp: '翻訳', reading: 'ほんやく', meanings: { en: 'translation', ru: 'перевод', zh: '翻译' } },
  { id: 'v-postpone', level: 5, jp: '延期', reading: 'えんき', meanings: { en: 'postponement', ru: 'отсрочка', zh: '推迟' } },
  { id: 'v-simplify', level: 6, jp: '簡略化', reading: 'かんりゃくか', meanings: { en: 'simplification', ru: 'упрощение', zh: '简化' } },
  { id: 'v-system', level: 6, jp: '制度', reading: 'せいど', meanings: { en: 'system', ru: 'система', zh: '制度' } },
  { id: 'v-survey', level: 6, jp: '調査', reading: 'ちょうさ', meanings: { en: 'survey', ru: 'исследование', zh: '调查' } },
  { id: 'v-tendency', level: 6, jp: '傾向', reading: 'けいこう', meanings: { en: 'tendency', ru: 'тенденция', zh: '趋势' } },
  { id: 'v-conception', level: 6, jp: '発想', reading: 'はっそう', meanings: { en: 'way of thinking', ru: 'образ мышления', zh: '构思' } },
  { id: 'v-convenience', level: 7, jp: '利便性', reading: 'りべんせい', meanings: { en: 'convenience', ru: 'удобство', zh: '便利性' } },
  { id: 'v-opportunity', level: 7, jp: '機会', reading: 'きかい', meanings: { en: 'opportunity', ru: 'возможность', zh: '机会' } },
  { id: 'v-judgment', level: 7, jp: '判断', reading: 'はんだん', meanings: { en: 'judgment', ru: 'суждение', zh: '判断' } },
  { id: 'v-indispensable', level: 7, jp: '不可欠', reading: 'ふかけつ', meanings: { en: 'indispensable', ru: 'незаменимый', zh: '不可或缺' } },
  { id: 'v-authority', level: 7, jp: '第一人者', reading: 'だいいちにんしゃ', meanings: { en: 'leading authority', ru: 'ведущий специалист', zh: '第一人者' } },
];

export const CLOZE_PROMPTS: ClozePrompt[] = [
  { id: 'c-desu', level: 1, prompt: '私は学生___。', answer: 'です', choices: ['です', 'ます', 'でした', 'いる'], translations: { en: 'I am a student.', ru: 'Я студент.', zh: '我是学生。' } },
  { id: 'c-l1-negative', level: 1, prompt: '私は学生では___。', answer: 'ありません', choices: ['ありません', 'あります', 'いません', 'でした'], translations: { en: 'I am not a student.', ru: 'Я не студент.', zh: '我不是学生。' } },
  { id: 'c-l1-drink', level: 1, prompt: '毎日水を___。', answer: '飲みます', choices: ['飲みます', '食べます', '見ます', '聞きます'], translations: { en: 'I drink water every day.', ru: 'Я пью воду каждый день.', zh: '我每天喝水。' } },
  { id: 'c-l1-study', level: 1, prompt: '学校で日本語を___。', answer: '勉強します', choices: ['勉強します', '料理します', '掃除します', '運転します'], translations: { en: 'I study Japanese at school.', ru: 'Я изучаю японский в школе.', zh: '我在学校学习日语。' } },
  { id: 'c-object', level: 2, prompt: 'コーヒー___飲みます。', answer: 'を', choices: ['を', 'が', 'に', 'で'], translations: { en: 'I drink coffee.', ru: 'Я пью кофе.', zh: '我喝咖啡。' } },
  { id: 'c-l2-past', level: 2, prompt: '昨日、本を___。', answer: '買いました', choices: ['買いました', '買います', '買おう', '買って'], translations: { en: 'Yesterday I bought a book.', ru: 'Вчера я купил книгу.', zh: '昨天我买了书。' } },
  { id: 'c-l2-adj', level: 2, prompt: '今日はとても___です。', answer: '暑い', choices: ['暑い', '暑く', '暑さ', '暑かった'], translations: { en: 'Today is very hot.', ru: 'Сегодня очень жарко.', zh: '今天很热。' } },
  { id: 'c-l2-te', level: 2, prompt: '駅まで___行きます。', answer: '歩いて', choices: ['歩いて', '歩き', '歩く', '歩いた'], translations: { en: 'I walk to the station.', ru: 'Я иду пешком до станции.', zh: '我走路去车站。' } },
  { id: 'c-place', level: 3, prompt: '図書館___友達に会いました。', answer: 'で', choices: ['で', 'を', 'へ', 'と'], translations: { en: 'I met my friend at the library.', ru: 'Я встретил друга в библиотеке.', zh: '我在图书馆见到了朋友。' } },
  { id: 'c-l3-koto', level: 3, prompt: '趣味は写真を撮る___です。', answer: 'こと', choices: ['こと', 'もの', 'ところ', 'ほう'], translations: { en: 'My hobby is taking photos.', ru: 'Моё хобби — фотографировать.', zh: '我的爱好是拍照。' } },
  { id: 'c-l3-dekiru', level: 3, prompt: '日本語で手紙を書くことが___。', answer: 'できます', choices: ['できます', 'します', 'あります', 'なります'], translations: { en: 'I can write letters in Japanese.', ru: 'Я могу писать письма по-японски.', zh: '我会用日语写信。' } },
  { id: 'c-l3-node', level: 3, prompt: '電車が遅れた___、遅刻しました。', answer: 'ので', choices: ['ので', 'のに', 'ても', 'たら'], translations: { en: 'Because the train was late, I was late.', ru: 'Поезд опоздал, поэтому я опоздал.', zh: '因为电车晚点，我迟到了。' } },
  { id: 'c-reason', level: 4, prompt: '雨が降りそう___、傘を持っていきます。', answer: 'なので', choices: ['なので', 'まで', 'だけ', 'ながら'], translations: { en: 'Because it looks like rain, I will take an umbrella.', ru: 'Поскольку похоже на дождь, я возьму зонт.', zh: '因为看起来要下雨，我会带伞。' } },
  { id: 'c-l4-koto-aru', level: 4, prompt: '日本に住んだ___があります。', answer: 'こと', choices: ['こと', 'もの', 'ところ', 'はず'], translations: { en: 'I have lived in Japan before.', ru: 'Я раньше жил в Японии.', zh: '我曾经在日本住过。' } },
  { id: 'c-l4-houga', level: 4, prompt: '医者に相談した___いいと思います。', answer: 'ほうが', choices: ['ほうが', 'ことが', 'ものが', 'だけが'], translations: { en: 'I think you should consult a doctor.', ru: 'Думаю, вам стоит обратиться к врачу.', zh: '我觉得你最好咨询医生。' } },
  { id: 'c-l4-nagara', level: 4, prompt: '音楽を聞き___勉強します。', answer: 'ながら', choices: ['ながら', 'たり', 'ので', 'ため'], translations: { en: 'I study while listening to music.', ru: 'Я занимаюсь, слушая музыку.', zh: '我一边听音乐一边学习。' } },
  { id: 'c-l4-tsumori', level: 4, prompt: '来年、留学する___です。', answer: 'つもり', choices: ['つもり', 'はず', 'よう', 'こと'], translations: { en: 'I plan to study abroad next year.', ru: 'В следующем году я собираюсь учиться за границей.', zh: '我打算明年去留学。' } },
  { id: 'c-before', level: 5, prompt: '提出する___、確認してください。', answer: '前に', choices: ['前に', 'ように', 'ために', 'ばかり'], translations: { en: 'Please check before submitting.', ru: 'Проверьте перед отправкой.', zh: '提交前请确认。' } },
  { id: 'c-l5-baai', level: 5, prompt: '日程が変更になった___は、連絡してください。', answer: '場合', choices: ['場合', 'ため', 'うち', '間'], translations: { en: 'If the schedule changes, please contact me.', ru: 'Если расписание изменится, свяжитесь со мной.', zh: '如果日程有变更，请联系我。' } },
  { id: 'c-l5-passive', level: 5, prompt: 'この小説は多くの言語に___います。', answer: '翻訳されて', choices: ['翻訳されて', '翻訳して', '翻訳させて', '翻訳できて'], translations: { en: 'This novel has been translated into many languages.', ru: 'Этот роман переведён на многие языки.', zh: '这部小说被翻译成了很多语言。' } },
  { id: 'c-l5-temo', level: 5, prompt: '説明書を___、使い方が分かりませんでした。', answer: '読んでも', choices: ['読んでも', '読むと', '読めば', '読んだら'], translations: { en: 'Even after reading the manual, I did not understand it.', ru: 'Даже прочитав инструкцию, я не понял.', zh: '即使读了说明书，我也不明白。' } },
  { id: 'c-l5-kekka', level: 5, prompt: '話し合った___、計画を延期しました。', answer: '結果', choices: ['結果', 'ため', 'うえ', 'とおり'], translations: { en: 'As a result of discussion, we postponed the plan.', ru: 'В результате обсуждения мы отложили план.', zh: '讨论的结果是，我们推迟了计划。' } },
  { id: 'c-tomonai', level: 6, prompt: '制度変更___、手続きが簡略化されました。', answer: 'に伴い', choices: ['に伴い', 'として', 'にしては', 'とはいえ'], translations: { en: 'With the system change, procedures were simplified.', ru: 'В связи с изменением системы процедуры были упрощены.', zh: '随着制度变更，手续被简化了。' } },
  { id: 'c-l6-niyoruto', level: 6, prompt: '調査の結果___、読書時間は減っている。', answer: 'によると', choices: ['によると', 'によって', 'について', 'に対して'], translations: { en: 'According to the survey results, reading time is decreasing.', ru: 'Согласно результатам исследования, время чтения сокращается.', zh: '根据调查结果，阅读时间在减少。' } },
  { id: 'c-l6-nikakawarazu', level: 6, prompt: '天候___、大会は開催されます。', answer: 'にかかわらず', choices: ['にかかわらず', 'に応じて', 'において', 'に基づいて'], translations: { en: 'Regardless of the weather, the tournament will be held.', ru: 'Независимо от погоды турнир состоится.', zh: '无论天气如何，大会都将举行。' } },
  { id: 'c-l6-nikuwaete', level: 6, prompt: '経験___、柔軟な発想が求められる。', answer: 'に加えて', choices: ['に加えて', 'に代わって', 'に反して', 'に比べて'], translations: { en: 'In addition to experience, flexible thinking is required.', ru: 'Помимо опыта требуется гибкое мышление.', zh: '除了经验之外，还需要灵活的思维。' } },
  { id: 'c-l6-wokomete', level: 6, prompt: '感謝の気持ちを___、手紙を書きました。', answer: '込めて', choices: ['込めて', '沿って', 'かけて', '向けて'], translations: { en: 'I wrote the letter with feelings of gratitude.', ru: 'Я написал письмо с чувством благодарности.', zh: '我怀着感谢的心情写了信。' } },
  { id: 'c-amari', level: 7, prompt: '便利さを追求する___、大切なものを失う。', answer: 'あまり', choices: ['あまり', '次第', '上で', 'ものの'], translations: { en: 'By pursuing convenience too far, we lose something important.', ru: 'Чрезмерно стремясь к удобству, мы теряем важное.', zh: '过度追求便利会失去重要的东西。' } },
  { id: 'c-l7-zaruwoenai', level: 7, prompt: '彼は計画の変更を認め___。', answer: 'ざるを得なかった', choices: ['ざるを得なかった', 'がちだった', 'かねなかった', 'っぽかった'], translations: { en: 'He had no choice but to accept the change to the plan.', ru: 'Ему пришлось согласиться на изменение плана.', zh: '他不得不接受计划的变更。' } },
  { id: 'c-l7-tohaie', level: 7, prompt: '技術が進歩した___、人間の判断は不可欠だ。', answer: 'とはいえ', choices: ['とはいえ', 'だからこそ', 'とすれば', 'というより'], translations: { en: 'Although technology has advanced, human judgment is indispensable.', ru: 'Хотя технологии продвинулись, человеческое суждение незаменимо.', zh: '虽然技术进步了，但人的判断不可或缺。' } },
  { id: 'c-l7-nisokushite', level: 7, prompt: '現実___考えれば、その提案は難しい。', answer: 'に即して', choices: ['に即して', 'に際して', 'にわたって', 'をめぐって'], translations: { en: 'Considering it in line with reality, that proposal is difficult.', ru: 'Если исходить из реальности, это предложение трудно осуществить.', zh: '从现实出发考虑，那个提案很难。' } },
];

export const KANA_PROMPTS: KanaPrompt[] = [
  { kana: 'あ', romaji: 'a' },
  { kana: 'い', romaji: 'i' },
  { kana: 'う', romaji: 'u' },
  { kana: 'え', romaji: 'e' },
  { kana: 'お', romaji: 'o' },
  { kana: 'か', romaji: 'ka' },
  { kana: 'き', romaji: 'ki' },
  { kana: 'く', romaji: 'ku' },
  { kana: 'け', romaji: 'ke' },
  { kana: 'こ', romaji: 'ko' },
  { kana: 'さ', romaji: 'sa' },
  { kana: 'し', romaji: 'shi' },
  { kana: 'す', romaji: 'su' },
  { kana: 'せ', romaji: 'se' },
  { kana: 'そ', romaji: 'so' },
  { kana: 'た', romaji: 'ta' },
  { kana: 'ち', romaji: 'chi' },
  { kana: 'つ', romaji: 'tsu' },
  { kana: 'て', romaji: 'te' },
  { kana: 'と', romaji: 'to' },
  { kana: 'な', romaji: 'na' },
  { kana: 'に', romaji: 'ni' },
  { kana: 'ぬ', romaji: 'nu' },
  { kana: 'ね', romaji: 'ne' },
  { kana: 'の', romaji: 'no' },
  { kana: 'は', romaji: 'ha' },
  { kana: 'ひ', romaji: 'hi' },
  { kana: 'ふ', romaji: 'fu' },
  { kana: 'へ', romaji: 'he' },
  { kana: 'ほ', romaji: 'ho' },
  { kana: 'ま', romaji: 'ma' },
  { kana: 'み', romaji: 'mi' },
  { kana: 'む', romaji: 'mu' },
  { kana: 'め', romaji: 'me' },
  { kana: 'も', romaji: 'mo' },
  { kana: 'や', romaji: 'ya' },
  { kana: 'ゆ', romaji: 'yu' },
  { kana: 'よ', romaji: 'yo' },
  { kana: 'ら', romaji: 'ra' },
  { kana: 'り', romaji: 'ri' },
  { kana: 'る', romaji: 'ru' },
  { kana: 'れ', romaji: 're' },
  { kana: 'ろ', romaji: 'ro' },
  { kana: 'わ', romaji: 'wa' },
  { kana: 'ん', romaji: 'n' },
  { kana: 'りょ', romaji: 'ryo' },
  { kana: 'ちゃ', romaji: 'cha' },
  { kana: 'しゅ', romaji: 'shu' },
  { kana: 'きょ', romaji: 'kyo' },
  { kana: 'じゃ', romaji: 'ja' },
  // Katakana — the classic confusable set (シ/ツ, ソ/ン, ノ/メ/ヌ).
  { kana: 'シ', romaji: 'shi' },
  { kana: 'ツ', romaji: 'tsu' },
  { kana: 'ソ', romaji: 'so' },
  { kana: 'ン', romaji: 'n' },
  { kana: 'ノ', romaji: 'no' },
  { kana: 'メ', romaji: 'me' },
  { kana: 'ヌ', romaji: 'nu' },
  { kana: 'ラ', romaji: 'ra' },
  { kana: 'ケ', romaji: 'ke' },
];

export const KANJI_READING_PROMPTS: KanjiReadingPrompt[] = [
  { id: 'k-student', level: 1, word: '学生', reading: 'がくせい', choices: ['がくせい', 'せんせい', 'がっこう', 'せいかつ'], meaning: { en: 'student', ru: 'студент', zh: '学生' } },
  { id: 'k-mountain', level: 1, word: '山', reading: 'やま', choices: ['やま', 'かわ', 'うみ', 'そら'], meaning: { en: 'mountain', ru: 'гора', zh: '山' } },
  { id: 'k-person', level: 1, word: '人', reading: 'ひと', choices: ['ひと', 'いぬ', 'ねこ', 'とり'], meaning: { en: 'person', ru: 'человек', zh: '人' } },
  { id: 'k-teacher', level: 1, word: '先生', reading: 'せんせい', choices: ['せんせい', 'がくせい', 'せんぱい', 'しゃちょう'], meaning: { en: 'teacher', ru: 'учитель', zh: '老师' } },
  { id: 'k-school', level: 1, word: '学校', reading: 'がっこう', choices: ['がっこう', 'がくせい', 'こうこう', 'だいがく'], meaning: { en: 'school', ru: 'школа', zh: '学校' } },
  { id: 'k-every-morning', level: 2, word: '毎朝', reading: 'まいあさ', choices: ['まいあさ', 'まいばん', 'あさひ', 'まいにち'], meaning: { en: 'every morning', ru: 'каждое утро', zh: '每天早上' } },
  { id: 'k-train', level: 2, word: '電車', reading: 'でんしゃ', choices: ['でんしゃ', 'じてんしゃ', 'でんわ', 'くるま'], meaning: { en: 'train', ru: 'поезд', zh: '电车' } },
  { id: 'k-family', level: 2, word: '家族', reading: 'かぞく', choices: ['かぞく', 'かぐ', 'しんせき', 'かおく'], meaning: { en: 'family', ru: 'семья', zh: '家人' } },
  { id: 'k-buy', level: 2, word: '買う', reading: 'かう', choices: ['かう', 'うる', 'もらう', 'つかう'], meaning: { en: 'to buy', ru: 'покупать', zh: '买' } },
  { id: 'k-station', level: 2, word: '駅', reading: 'えき', choices: ['えき', 'みなと', 'まち', 'むら'], meaning: { en: 'station', ru: 'станция', zh: '车站' } },
  { id: 'k-library', level: 3, word: '図書館', reading: 'としょかん', choices: ['としょかん', 'びじゅつかん', 'えいがかん', 'たいいくかん'], meaning: { en: 'library', ru: 'библиотека', zh: '图书馆' } },
  { id: 'k-hobby', level: 3, word: '趣味', reading: 'しゅみ', choices: ['しゅみ', 'きょうみ', 'いみ', 'しゅうまつ'], meaning: { en: 'hobby', ru: 'хобби', zh: '爱好' } },
  { id: 'k-photo', level: 3, word: '写真', reading: 'しゃしん', choices: ['しゃしん', 'しゃちょう', 'しんぶん', 'しゃかい'], meaning: { en: 'photograph', ru: 'фотография', zh: '照片' } },
  { id: 'k-work', level: 3, word: '仕事', reading: 'しごと', choices: ['しごと', 'しじ', 'しゅくだい', 'ようじ'], meaning: { en: 'work', ru: 'работа', zh: '工作' } },
  { id: 'k-busy', level: 3, word: '忙しい', reading: 'いそがしい', choices: ['いそがしい', 'たのしい', 'きびしい', 'うれしい'], meaning: { en: 'busy', ru: 'занятой', zh: '忙' } },
  { id: 'k-umbrella', level: 4, word: '傘', reading: 'かさ', choices: ['かさ', 'くつ', 'かばん', 'ぼうし'], meaning: { en: 'umbrella', ru: 'зонт', zh: '伞' } },
  { id: 'k-doctor', level: 4, word: '医者', reading: 'いしゃ', choices: ['いしゃ', 'かんじゃ', 'がくしゃ', 'きしゃ'], meaning: { en: 'doctor', ru: 'врач', zh: '医生' } },
  { id: 'k-abroad', level: 4, word: '留学', reading: 'りゅうがく', choices: ['りゅうがく', 'にゅうがく', 'りょこう', 'たいがく'], meaning: { en: 'studying abroad', ru: 'учёба за границей', zh: '留学' } },
  { id: 'k-experience', level: 4, word: '経験', reading: 'けいけん', choices: ['けいけん', 'けいえい', 'じっけん', 'たいけん'], meaning: { en: 'experience', ru: 'опыт', zh: '经验' } },
  { id: 'k-music', level: 4, word: '音楽', reading: 'おんがく', choices: ['おんがく', 'おんせい', 'がくもん', 'ぶんがく'], meaning: { en: 'music', ru: 'музыка', zh: '音乐' } },
  { id: 'k-confirm', level: 5, word: '確認', reading: 'かくにん', choices: ['かくにん', 'かんけい', 'けんさ', 'しんせい'], meaning: { en: 'confirmation', ru: 'проверка', zh: '确认' } },
  { id: 'k-submit', level: 5, word: '提出', reading: 'ていしゅつ', choices: ['ていしゅつ', 'ていあん', 'しゅっぱつ', 'ていし'], meaning: { en: 'submission', ru: 'подача', zh: '提交' } },
  { id: 'k-translate', level: 5, word: '翻訳', reading: 'ほんやく', choices: ['ほんやく', 'つうやく', 'へんかん', 'ほんもん'], meaning: { en: 'translation', ru: 'перевод', zh: '翻译' } },
  { id: 'k-postpone', level: 5, word: '延期', reading: 'えんき', choices: ['えんき', 'えんちょう', 'よき', 'きかん'], meaning: { en: 'postponement', ru: 'отсрочка', zh: '推迟' } },
  { id: 'k-manual', level: 5, word: '説明書', reading: 'せつめいしょ', choices: ['せつめいしょ', 'しょうめいしょ', 'ほうこくしょ', 'けいやくしょ'], meaning: { en: 'instruction manual', ru: 'инструкция', zh: '说明书' } },
  { id: 'k-system', level: 6, word: '制度', reading: 'せいど', choices: ['せいど', 'せいじ', 'せいかく', 'せいぞう'], meaning: { en: 'system', ru: 'система', zh: '制度' } },
  { id: 'k-survey', level: 6, word: '調査', reading: 'ちょうさ', choices: ['ちょうさ', 'けんさ', 'ちょうし', 'そうさ'], meaning: { en: 'survey', ru: 'исследование', zh: '调查' } },
  { id: 'k-tendency', level: 6, word: '傾向', reading: 'けいこう', choices: ['けいこう', 'けいかく', 'ほうこう', 'こうけい'], meaning: { en: 'tendency', ru: 'тенденция', zh: '趋势' } },
  { id: 'k-simplify', level: 6, word: '簡略化', reading: 'かんりゃくか', choices: ['かんりゃくか', 'かんたんか', 'しょうりゃくか', 'きゃくほんか'], meaning: { en: 'simplification', ru: 'упрощение', zh: '简化' } },
  { id: 'k-conception', level: 6, word: '発想', reading: 'はっそう', choices: ['はっそう', 'はつげん', 'そうぞう', 'はっけん'], meaning: { en: 'way of thinking', ru: 'образ мышления', zh: '构思' } },
  { id: 'k-opportunity', level: 7, word: '機会', reading: 'きかい', choices: ['きかい', 'きがい', 'きこう', 'ぎかい'], meaning: { en: 'opportunity', ru: 'возможность', zh: '机会' } },
  { id: 'k-judgment', level: 7, word: '判断', reading: 'はんだん', choices: ['はんだん', 'はんてい', 'だんげん', 'ぶんだん'], meaning: { en: 'judgment', ru: 'суждение', zh: '判断' } },
  { id: 'k-indispensable', level: 7, word: '不可欠', reading: 'ふかけつ', choices: ['ふかけつ', 'ふかのう', 'ふけつ', 'かけつ'], meaning: { en: 'indispensable', ru: 'незаменимый', zh: '不可或缺' } },
  { id: 'k-authority', level: 7, word: '第一人者', reading: 'だいいちにんしゃ', choices: ['だいいちにんしゃ', 'だいいちにん', 'いちにんしゃ', 'だいいっしゃ'], meaning: { en: 'leading authority', ru: 'ведущий специалист', zh: '第一人者' } },
  { id: 'k-still', level: 7, word: '依然', reading: 'いぜん', choices: ['いぜん', 'いご', 'ぜんぜん', 'いらい'], meaning: { en: 'still, as ever', ru: 'по-прежнему', zh: '依然' } },
];

export const PARTICLE_PROMPTS: ParticlePrompt[] = [
  { id: 'p-topic', level: 1, prompt: '私___学生です。', answer: 'は', choices: ['は', 'を', 'に', 'で'], hint: { en: 'marks the topic', ru: 'обозначает тему', zh: '表示主题' } },
  { id: 'p-l1-suki', level: 1, prompt: '猫___好きです。', answer: 'が', choices: ['が', 'を', 'に', 'へ'], hint: { en: 'marks what a feeling is directed at', ru: 'обозначает объект чувства', zh: '表示喜好的对象' } },
  { id: 'p-l1-no', level: 1, prompt: '私___名前は田中です。', answer: 'の', choices: ['の', 'は', 'が', 'を'], hint: { en: 'links two nouns as possession', ru: 'связывает два существительных как принадлежность', zh: '表示所属' } },
  { id: 'p-object', level: 2, prompt: '水___飲みます。', answer: 'を', choices: ['を', 'が', 'へ', 'と'], hint: { en: 'marks the direct object', ru: 'обозначает прямое дополнение', zh: '表示宾语' } },
  { id: 'p-l2-de-means', level: 2, prompt: 'バス___行きます。', answer: 'で', choices: ['で', 'を', 'が', 'の'], hint: { en: 'marks the means of transport', ru: 'обозначает средство передвижения', zh: '表示交通方式' } },
  { id: 'p-l2-kara', level: 2, prompt: '授業は九時___始まります。', answer: 'から', choices: ['から', 'まで', 'より', 'ほど'], hint: { en: 'marks a starting point in time', ru: 'обозначает начальную точку во времени', zh: '表示时间起点' } },
  { id: 'p-l2-to', level: 2, prompt: 'パン___牛乳を買いました。', answer: 'と', choices: ['と', 'を', 'に', 'で'], hint: { en: 'joins two nouns exhaustively', ru: 'соединяет два существительных', zh: '连接两个名词' } },
  { id: 'p-place', level: 3, prompt: '図書館___勉強します。', answer: 'で', choices: ['で', 'に', 'を', 'は'], hint: { en: 'marks the place of an action', ru: 'обозначает место действия', zh: '表示动作发生地点' } },
  { id: 'p-l3-ni-target', level: 3, prompt: '友達___手紙を書きます。', answer: 'に', choices: ['に', 'で', 'を', 'が'], hint: { en: 'marks the recipient', ru: 'обозначает получателя', zh: '表示接受者' } },
  { id: 'p-l3-made', level: 3, prompt: '駅___歩きます。', answer: 'まで', choices: ['まで', 'から', 'より', 'ほど'], hint: { en: 'marks the end point of a range', ru: 'обозначает конечную точку', zh: '表示终点' } },
  { id: 'p-existence', level: 4, prompt: '机の上___本があります。', answer: 'に', choices: ['に', 'で', 'を', 'が'], hint: { en: 'marks location of existence', ru: 'обозначает место существования', zh: '表示存在位置' } },
  { id: 'p-l4-ga-subject', level: 4, prompt: '雨___降っています。', answer: 'が', choices: ['が', 'を', 'に', 'で'], hint: { en: 'marks the subject of a natural event', ru: 'обозначает подлежащее', zh: '表示主语' } },
  { id: 'p-l4-yori', level: 4, prompt: '今年は去年___忙しいです。', answer: 'より', choices: ['より', 'ほど', 'まで', 'から'], hint: { en: 'marks the standard of comparison', ru: 'обозначает объект сравнения', zh: '表示比较基准' } },
  { id: 'p-accompaniment', level: 5, prompt: '友達___相談しました。', answer: 'と', choices: ['と', 'で', 'へ', 'から'], hint: { en: 'marks the person you do something with', ru: 'обозначает собеседника или спутника', zh: '表示一起做事的人' } },
  { id: 'p-l5-nitsuite', level: 5, prompt: 'その問題___話しました。', answer: 'について', choices: ['について', 'にとって', 'によって', 'における'], hint: { en: 'marks the topic being discussed', ru: 'обозначает тему обсуждения', zh: '表示谈论的话题' } },
  { id: 'p-l5-noni', level: 5, prompt: '約束した___、彼は来なかった。', answer: 'のに', choices: ['のに', 'ので', 'なら', 'たら'], hint: { en: 'marks an unexpected contrast', ru: 'обозначает неожиданное противопоставление', zh: '表示出乎意料的转折' } },
  { id: 'p-l6-niyotte', level: 6, prompt: 'この本は彼___書かれた。', answer: 'によって', choices: ['によって', 'について', 'にとって', 'に対して'], hint: { en: 'marks the agent of a passive verb', ru: 'обозначает исполнителя в пассиве', zh: '表示被动句的施事者' } },
  { id: 'p-l6-nitotte', level: 6, prompt: '私___、これは大切な思い出です。', answer: 'にとって', choices: ['にとって', 'によって', 'について', 'に対して'], hint: { en: 'marks whose viewpoint something holds for', ru: 'обозначает, с чьей точки зрения', zh: '表示对某人而言' } },
  { id: 'p-l7-womegutte', level: 7, prompt: '環境問題___議論が続いている。', answer: 'をめぐって', choices: ['をめぐって', 'にあたって', 'をもって', 'において'], hint: { en: 'marks the issue a debate circles around', ru: 'обозначает предмет спора', zh: '表示争论围绕的问题' } },
  { id: 'p-l7-karakoso', level: 7, prompt: '努力した___、成功したのだ。', answer: 'からこそ', choices: ['からこそ', 'からには', 'からといって', 'からして'], hint: { en: 'marks the emphasized reason', ru: 'подчёркивает именно эту причину', zh: '强调正是这个原因' } },
];

export const COUNTER_PROMPTS: CounterPrompt[] = [
  { id: 'ctr-book', level: 2, object: { en: 'books', ru: 'книги', zh: '书' }, number: 3, answer: '三冊', reading: 'さんさつ', choices: ['三冊', '三本', '三匹', '三枚'], jp: '本を三冊買いました。' },
  { id: 'ctr-pencil', level: 2, object: { en: 'pencils', ru: 'карандаши', zh: '铅笔' }, number: 2, answer: '二本', reading: 'にほん', choices: ['二本', '二枚', '二冊', '二人'], jp: '鉛筆が二本あります。' },
  { id: 'ctr-cat', level: 2, object: { en: 'cats', ru: 'кошки', zh: '猫' }, number: 2, answer: '二匹', reading: 'にひき', choices: ['二匹', '二頭', '二羽', '二台'], jp: '猫が二匹います。' },
  { id: 'ctr-apple', level: 2, object: { en: 'apples', ru: 'яблока', zh: '苹果' }, number: 4, answer: '四個', reading: 'よんこ', choices: ['四個', '四本', '四枚', '四匹'], jp: 'りんごを四個買いました。' },
  { id: 'ctr-bottle', level: 2, object: { en: 'bottles of juice', ru: 'бутылки сока', zh: '瓶果汁' }, number: 5, answer: '五本', reading: 'ごほん', choices: ['五本', '五個', '五枚', '五杯'], jp: 'ジュースを五本買いました。' },
  { id: 'ctr-people', level: 3, object: { en: 'people', ru: 'человека', zh: '人' }, number: 4, answer: '四人', reading: 'よにん', choices: ['四人', '四匹', '四台', '四冊'], jp: '会議には四人来ました。' },
  { id: 'ctr-paper', level: 3, object: { en: 'sheets of paper', ru: 'листа бумаги', zh: '张纸' }, number: 5, answer: '五枚', reading: 'ごまい', choices: ['五枚', '五本', '五冊', '五台'], jp: '紙を五枚ください。' },
  { id: 'ctr-car', level: 3, object: { en: 'cars', ru: 'машины', zh: '车' }, number: 3, answer: '三台', reading: 'さんだい', choices: ['三台', '三本', '三個', '三枚'], jp: '車が三台あります。' },
  { id: 'ctr-stamp', level: 3, object: { en: 'stamps', ru: 'марки', zh: '邮票' }, number: 3, answer: '三枚', reading: 'さんまい', choices: ['三枚', '三本', '三個', '三冊'], jp: '切手を三枚ください。' },
  { id: 'ctr-glass', level: 3, object: { en: 'glasses of water', ru: 'стакана воды', zh: '杯水' }, number: 1, answer: '一杯', reading: 'いっぱい', choices: ['一杯', '一本', '一枚', '一個'], jp: '水を一杯ください。' },
  { id: 'ctr-age', level: 3, object: { en: 'years old', ru: 'лет', zh: '岁' }, number: 20, answer: '二十歳', reading: 'はたち', choices: ['二十歳', '二十本', '二十回', '二十人'], jp: '娘は二十歳になりました。' },
  { id: 'ctr-machine', level: 4, object: { en: 'computers', ru: 'компьютера', zh: '电脑' }, number: 1, answer: '一台', reading: 'いちだい', choices: ['一台', '一枚', '一匹', '一冊'], jp: '新しいパソコンを一台買いました。' },
  { id: 'ctr-bird', level: 4, object: { en: 'birds', ru: 'птицы', zh: '鸟' }, number: 2, answer: '二羽', reading: 'にわ', choices: ['二羽', '二匹', '二頭', '二台'], jp: '庭に鳥が二羽います。' },
  { id: 'ctr-times', level: 4, object: { en: 'times (occurrences)', ru: 'раза', zh: '次' }, number: 2, answer: '二回', reading: 'にかい', choices: ['二回', '二本', '二枚', '二個'], jp: '映画を二回見ました。' },
  { id: 'ctr-letter', level: 4, object: { en: 'letters (mail)', ru: 'письма', zh: '封信' }, number: 3, answer: '三通', reading: 'さんつう', choices: ['三通', '三枚', '三本', '三冊'], jp: '手紙を三通出しました。' },
  { id: 'ctr-floor', level: 4, object: { en: 'floors (of a building)', ru: 'этажа', zh: '层楼' }, number: 3, answer: '三階', reading: 'さんがい', choices: ['三階', '三回', '三番', '三台'], jp: 'このビルは三階建てです。' },
  { id: 'ctr-cow', level: 5, object: { en: 'cows', ru: 'коровы', zh: '牛' }, number: 3, answer: '三頭', reading: 'さんとう', choices: ['三頭', '三匹', '三羽', '三台'], jp: '牧場に牛が三頭います。' },
  { id: 'ctr-shoes', level: 5, object: { en: 'pairs of shoes', ru: 'пары обуви', zh: '双鞋' }, number: 2, answer: '二足', reading: 'にそく', choices: ['二足', '二本', '二枚', '二個'], jp: '靴を二足買いました。' },
  { id: 'ctr-house', level: 5, object: { en: 'houses', ru: 'дома', zh: '栋房子' }, number: 2, answer: '二軒', reading: 'にけん', choices: ['二軒', '二台', '二個', '二枚'], jp: 'この道に家が二軒あります。' },
];

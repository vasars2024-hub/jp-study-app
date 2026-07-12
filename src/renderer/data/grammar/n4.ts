import type { GrammarPoint } from './types';

export const N4: GrammarPoint[] = [
  {
    id: 'n4-nakereba-naranai',
    level: 'N4',
    title: '〜なければならない',
    meaning: 'must do ~ / have to do ~',
    structure: 'Verb ない-form (drop い) + ければならない',
    explanation:
      'Expresses obligation. Casual contractions: 〜なきゃ, 〜なくちゃ. A near-synonym is 〜なければいけない.',
    examples: [
      { jp: '明日 早く 起きなければならない。', reading: 'あした はやく おきなければならない。', en: 'I have to get up early tomorrow.' },
      { jp: '薬を 飲まなければなりません。', reading: 'くすりを のまなければなりません。', en: 'I must take my medicine.' },
    ],
  },
  {
    id: 'n4-nakutemo-ii',
    level: 'N4',
    title: '〜なくてもいい',
    meaning: "don't have to ~",
    structure: 'Verb ない-form (drop い) + くてもいい',
    explanation: 'Expresses the absence of obligation — "it\'s okay not to do it".',
    examples: [
      { jp: '明日は 来なくてもいいです。', reading: 'あしたは こなくてもいいです。', en: "You don't have to come tomorrow." },
    ],
  },
  {
    id: 'n4-ta-hou-ga-ii',
    level: 'N4',
    title: '〜ほうがいい',
    meaning: "had better ~ / it's better to ~",
    structure: 'Verb た-form + ほうがいい / Verb ない-form + ほうがいい',
    explanation:
      'Gives advice. Use the past (た) form for "you\'d better do" and the ない form for "you\'d better not".',
    examples: [
      { jp: '少し 休んだほうがいいですよ。', reading: 'すこし やすんだほうがいいですよ。', en: 'You had better rest a little.' },
      { jp: '無理を しないほうがいい。', reading: 'むりを しないほうがいい。', en: "You'd better not overdo it." },
    ],
  },
  {
    id: 'n4-tsumori',
    level: 'N4',
    title: '〜つもりだ',
    meaning: 'intend to ~ / plan to ~',
    structure: 'Verb dictionary / ない-form + つもりだ',
    explanation: 'States a firm intention or plan. 〜ないつもり means you intend NOT to do something.',
    examples: [
      { jp: '夏休みに 国へ 帰るつもりです。', reading: 'なつやすみに くにへ かえるつもりです。', en: 'I plan to go home over summer break.' },
      { jp: 'もう たばこは 吸わないつもりだ。', reading: 'もう たばこは すわないつもりだ。', en: "I don't intend to smoke anymore." },
    ],
  },
  {
    id: 'n4-yotei',
    level: 'N4',
    title: '〜予定だ',
    meaning: 'be scheduled to ~ / plan to ~',
    structure: 'Verb dictionary form / Noun + の + 予定だ',
    explanation:
      'States a fixed schedule or plan, more objective than つもり (which is personal intention).',
    examples: [
      { jp: '来週 東京に 出張する予定です。', reading: 'らいしゅう とうきょうに しゅっちょうする よていです。', en: "I'm scheduled to take a business trip to Tokyo next week." },
    ],
  },
  {
    id: 'n4-potential',
    level: 'N4',
    title: 'Potential form (〜られる / 〜える)',
    meaning: 'can do ~ / be able to ~',
    structure: 'Group 1: u→eru (書く→書ける). Group 2: stem + られる. する→できる, 来る→来られる',
    explanation:
      'Expresses ability or possibility. The object usually takes が rather than を in potential sentences.',
    examples: [
      { jp: '漢字が 読めますか。', reading: 'かんじが よめますか。', en: 'Can you read kanji?' },
      { jp: '辛い 物が 食べられません。', reading: 'からい ものが たべられません。', en: "I can't eat spicy food." },
    ],
  },
  {
    id: 'n4-koto-ga-dekiru',
    level: 'N4',
    title: '〜ことができる',
    meaning: 'be able to ~ / can ~',
    structure: 'Verb dictionary form + ことができる',
    explanation:
      'A more formal way to express ability than the potential form. Common in writing and announcements.',
    examples: [
      { jp: 'ここで チケットを 買うことができます。', reading: 'ここで チケットを かうことが できます。', en: 'You can buy tickets here.' },
    ],
  },
  {
    id: 'n4-ta-koto-ga-aru',
    level: 'N4',
    title: '〜たことがある',
    meaning: 'have done ~ before (experience)',
    structure: 'Verb た-form + ことがある',
    explanation:
      'Describes a past experience — something you have done at least once. With the dictionary form (〜ことがある) it means "sometimes happens".',
    examples: [
      { jp: '日本に 行ったことがあります。', reading: 'にほんに いったことが あります。', en: 'I have been to Japan.' },
      { jp: '馬に 乗ったことが ありません。', reading: 'うまに のったことが ありません。', en: 'I have never ridden a horse.' },
    ],
  },
  {
    id: 'n4-volitional',
    level: 'N4',
    title: 'Volitional 〜よう / 〜おう',
    meaning: "let's ~ (casual) / I'll ~",
    structure: 'Group 1: u→ou (行く→行こう). Group 2: stem + よう. する→しよう, 来る→来よう',
    explanation:
      'The plain "let\'s / I will" form — the casual equivalent of 〜ましょう. It also forms 〜ようと思う and 〜ようとする.',
    examples: [
      { jp: 'そろそろ 帰ろう。', reading: 'そろそろ かえろう。', en: "Let's head home soon." },
    ],
  },
  {
    id: 'n4-you-to-omou',
    level: 'N4',
    title: '〜ようと思う',
    meaning: 'I think I will ~ / I intend to ~',
    structure: 'Volitional form + と思う',
    explanation:
      'Expresses a decision or intention the speaker has just formed or is considering. 〜ようと思っている implies an ongoing intention.',
    examples: [
      { jp: '今日は 早く 寝ようと思います。', reading: 'きょうは はやく ねようと おもいます。', en: 'I think I will go to bed early today.' },
    ],
  },
  {
    id: 'n4-tara',
    level: 'N4',
    title: '〜たら (conditional)',
    meaning: 'if / when ~',
    structure: 'Verb / adj / noun past (た) form + ら',
    explanation:
      'The most flexible conditional, covering "if X" and "when X happens, then…". The second clause is what you do once the first is complete.',
    examples: [
      { jp: '駅に 着いたら、電話してください。', reading: 'えきに ついたら、でんわしてください。', en: 'When you arrive, please call me.' },
      { jp: '安かったら、買います。', reading: 'やすかったら、かいます。', en: "If it's cheap, I'll buy it." },
    ],
  },
  {
    id: 'n4-ba',
    level: 'N4',
    title: '〜ば (conditional)',
    meaning: 'if ~ (general / hypothetical)',
    structure: 'Group 1: u→eba (行けば). い-adj: 〜ければ. な-adj/noun: 〜なら(ば)',
    explanation:
      'A conditional focusing on a general truth or hypothesis. Common in proverbs and "if only" wishes (〜ばよかった).',
    examples: [
      { jp: '安ければ 買います。', reading: 'やすければ かいます。', en: "If it's cheap, I'll buy it." },
      { jp: 'もっと 勉強すれば よかった。', reading: 'もっと べんきょうすれば よかった。', en: 'I wish I had studied more.' },
    ],
  },
  {
    id: 'n4-to-conditional',
    level: 'N4',
    title: '〜と (natural consequence)',
    meaning: 'whenever / if ~ then (always)',
    structure: 'Verb / adj dictionary form + と',
    explanation:
      'Used for natural, automatic, or inevitable results — "if/when A, then B always happens". Cannot be followed by a request or volition.',
    examples: [
      { jp: 'この ボタンを 押すと、ドアが 開きます。', reading: 'この ボタンを おすと、ドアが あきます。', en: 'When you press this button, the door opens.' },
      { jp: '春に なると、桜が 咲きます。', reading: 'はるに なると、さくらが さきます。', en: 'When spring comes, cherry blossoms bloom.' },
    ],
  },
  {
    id: 'n4-nara',
    level: 'N4',
    title: '〜なら',
    meaning: 'if it is the case that ~ / speaking of ~',
    structure: 'Plain form / Noun + なら',
    explanation:
      'Sets up a condition based on something just mentioned, or gives advice in response to a topic ("if that\'s the case, then…").',
    examples: [
      { jp: '日本に 行くなら、京都が おすすめです。', reading: 'にほんに いくなら、きょうとが おすすめです。', en: "If you're going to Japan, I recommend Kyoto." },
    ],
  },
  {
    id: 'n4-temo',
    level: 'N4',
    title: '〜ても / 〜でも',
    meaning: 'even if ~ / even though ~',
    structure: 'Verb て-form + も / い-adj 〜くても / noun・な-adj + でも',
    explanation:
      'Expresses concession — the result holds regardless. With question words (どんなに〜ても) it means "no matter how…".',
    examples: [
      { jp: '雨が 降っても、行きます。', reading: 'あめが ふっても、いきます。', en: "Even if it rains, I'll go." },
      { jp: 'どんなに 高くても 買いたい。', reading: 'どんなに たかくても かいたい。', en: 'No matter how expensive, I want it.' },
    ],
  },
  {
    id: 'n4-node',
    level: 'N4',
    title: '〜ので',
    meaning: 'because ~ (softer, objective)',
    structure: 'Plain form (な after noun/な-adj) + ので',
    explanation:
      'Gives a reason more politely and objectively than から. Common when making excuses or polite requests.',
    examples: [
      { jp: '頭が 痛いので、休みます。', reading: 'あたまが いたいので、やすみます。', en: 'Because I have a headache, I will rest.' },
    ],
  },
  {
    id: 'n4-noni',
    level: 'N4',
    title: '〜のに',
    meaning: 'even though ~ / despite ~',
    structure: 'Plain form (な after noun/な-adj) + のに',
    explanation:
      'Expresses an unexpected or contradictory result, often with a tone of surprise, frustration, or complaint.',
    examples: [
      { jp: '薬を 飲んだのに、まだ 熱が ある。', reading: 'くすりを のんだのに、まだ ねつが ある。', en: 'Even though I took medicine, I still have a fever.' },
    ],
  },
  {
    id: 'n4-shi',
    level: 'N4',
    title: '〜し',
    meaning: 'and (listing reasons); what\'s more',
    structure: 'Plain form + し（、〜し）',
    explanation:
      'Lists multiple reasons or qualities, implying there are more. Often gives the feeling "and besides…".',
    examples: [
      { jp: 'この 店は 安いし、おいしいです。', reading: 'この みせは やすいし、おいしいです。', en: 'This restaurant is cheap, and on top of that, delicious.' },
    ],
  },
  {
    id: 'n4-sou-appearance',
    level: 'N4',
    title: '〜そうだ (looks like)',
    meaning: 'looks ~ / seems ~ (from appearance)',
    structure: 'Verb stem / い-adj (drop い) / な-adj + そうだ',
    explanation:
      'A guess based on what you see. いい → よさそう, ない → なさそう are irregular. Do not use for obvious facts.',
    examples: [
      { jp: 'この ケーキは おいしそうです。', reading: 'この ケーキは おいしそうです。', en: 'This cake looks delicious.' },
      { jp: '今にも 雨が 降りそうだ。', reading: 'いまにも あめが ふりそうだ。', en: 'It looks like it could rain any minute.' },
    ],
  },
  {
    id: 'n4-sou-hearsay',
    level: 'N4',
    title: '〜そうだ (hearsay)',
    meaning: 'I heard that ~ / they say ~',
    structure: 'Plain form + そうだ',
    explanation:
      'Reports information from another source. Unlike the "looks like" そうだ, it attaches to the full plain form.',
    examples: [
      { jp: '天気予報に よると、明日は 雪が 降るそうです。', reading: 'てんきよほうに よると、あしたは ゆきが ふるそうです。', en: 'According to the forecast, it will snow tomorrow.' },
    ],
  },
  {
    id: 'n4-you-da',
    level: 'N4',
    title: '〜ようだ / 〜みたいだ',
    meaning: 'it seems / it looks like ~',
    structure: 'Plain form + ようだ / みたいだ（casual）',
    explanation:
      'A subjective guess based on evidence the speaker senses. みたい is the casual spoken equivalent. Also used for resemblance ("like X").',
    examples: [
      { jp: 'だれか 来たようだ。', reading: 'だれか きたようだ。', en: 'It seems someone has come.' },
      { jp: '彼は 子供みたいだ。', reading: 'かれは こどもみたいだ。', en: 'He is like a child.' },
    ],
  },
  {
    id: 'n4-rashii',
    level: 'N4',
    title: '〜らしい',
    meaning: 'apparently ~ / typical of ~',
    structure: 'Plain form + らしい / Noun + らしい',
    explanation:
      'Reports something heard or inferred from reliable info ("apparently"). After a noun it means "typical of / befitting".',
    examples: [
      { jp: '彼は 来月 結婚するらしい。', reading: 'かれは らいげつ けっこんするらしい。', en: 'Apparently he is getting married next month.' },
      { jp: '今日は 春らしい 天気だ。', reading: 'きょうは はるらしい てんきだ。', en: "Today's weather is spring-like." },
    ],
  },
  {
    id: 'n4-kamoshirenai',
    level: 'N4',
    title: '〜かもしれない',
    meaning: 'might ~ / maybe ~',
    structure: 'Plain form (drop だ for noun/な-adj) + かもしれない',
    explanation:
      'Expresses possibility — the speaker is unsure. Weaker certainty than でしょう or はずだ. Polite: かもしれません.',
    examples: [
      { jp: '午後から 雨が 降るかもしれません。', reading: 'ごごから あめが ふるかもしれません。', en: 'It might rain in the afternoon.' },
    ],
  },
  {
    id: 'n4-hazu',
    level: 'N4',
    title: '〜はずだ',
    meaning: 'should be ~ / is expected to ~',
    structure: 'Plain form (な/の after な-adj/noun) + はずだ',
    explanation:
      'Expresses a logical expectation based on reason or evidence. 〜はずがない means "there\'s no way that…".',
    examples: [
      { jp: '彼は もう 着いているはずです。', reading: 'かれは もう ついているはずです。', en: 'He should have already arrived.' },
    ],
  },
  {
    id: 'n4-jita-pairs',
    level: 'N4',
    title: 'Transitive / intransitive pairs',
    meaning: 'verbs that do vs. verbs that happen',
    structure: 'Transitive + を (開ける) / Intransitive + が (開く)',
    explanation:
      'Many verbs come in pairs: a transitive form (someone does it, marks object with を) and an intransitive form (it happens by itself, marks subject with が).',
    examples: [
      { jp: 'ドアを 開けます。', reading: 'ドアを あけます。', en: 'I open the door. (transitive)' },
      { jp: 'ドアが 開きます。', reading: 'ドアが あきます。', en: 'The door opens. (intransitive)' },
    ],
  },
  {
    id: 'n4-te-aru',
    level: 'N4',
    title: '〜てある',
    meaning: 'has been done (and the state remains)',
    structure: 'Transitive verb て-form + ある',
    explanation:
      'Describes a state resulting from a deliberate action, usually a preparation. The object is marked with が.',
    examples: [
      { jp: '机の 上に 手紙が 置いてあります。', reading: 'つくえの うえに てがみが おいてあります。', en: 'A letter has been (deliberately) placed on the desk.' },
    ],
  },
  {
    id: 'n4-te-oku',
    level: 'N4',
    title: '〜ておく',
    meaning: 'do ~ in advance / leave ~ as is',
    structure: 'Verb て-form + おく',
    explanation:
      'Doing something ahead of time in preparation, or leaving something in a state. Casual contraction: 〜とく.',
    examples: [
      { jp: '旅行の前に ホテルを 予約しておきます。', reading: 'りょこうのまえに ホテルを よやくしておきます。', en: "I'll book a hotel in advance before the trip." },
    ],
  },
  {
    id: 'n4-te-shimau',
    level: 'N4',
    title: '〜てしまう',
    meaning: 'completely do ~ / do ~ (regret)',
    structure: 'Verb て-form + しまう',
    explanation:
      'Marks completion ("finish doing") or regret/accident ("did it, unfortunately"). Casual contractions: 〜ちゃう / 〜じゃう.',
    examples: [
      { jp: '宿題を 全部 やってしまいました。', reading: 'しゅくだいを ぜんぶ やってしまいました。', en: 'I finished all my homework.' },
      { jp: '財布を なくしてしまった。', reading: 'さいふを なくしてしまった。', en: 'I went and lost my wallet.' },
    ],
  },
  {
    id: 'n4-te-miru',
    level: 'N4',
    title: '〜てみる',
    meaning: 'try doing ~ (and see)',
    structure: 'Verb て-form + みる',
    explanation: 'Doing something to see what it\'s like or what happens — "give it a try".',
    examples: [
      { jp: 'この 服を 着てみてもいいですか。', reading: 'この ふくを きてみてもいいですか。', en: 'May I try on these clothes?' },
    ],
  },
  {
    id: 'n4-te-iku-kuru',
    level: 'N4',
    title: '〜ていく / 〜てくる',
    meaning: 'go on doing / come to / start to ~',
    structure: 'Verb て-form + いく / くる',
    explanation:
      'ていく shows change moving away or into the future; てくる shows change up to now, or doing something and coming back.',
    examples: [
      { jp: 'これから 寒くなっていきます。', reading: 'これから さむくなっていきます。', en: 'It will get colder from now on.' },
      { jp: '日本語が 分かってきました。', reading: 'にほんごが わかってきました。', en: "I've come to understand Japanese." },
    ],
  },
  {
    id: 'n4-ageru-kureru-morau',
    level: 'N4',
    title: 'あげる / くれる / もらう',
    meaning: 'give (out) / give (to me) / receive',
    structure: 'A は B に〜をあげる / くれる; A は B に〜をもらう',
    explanation:
      'Giving and receiving depend on direction: あげる = give away from me; くれる = give toward me/my side; もらう = receive.',
    examples: [
      { jp: '友達に プレゼントを あげました。', reading: 'ともだちに プレゼントを あげました。', en: 'I gave my friend a present.' },
      { jp: '兄が 時計を くれました。', reading: 'あにが とけいを くれました。', en: 'My brother gave me a watch.' },
    ],
  },
  {
    id: 'n4-te-favors',
    level: 'N4',
    title: '〜てあげる / 〜てくれる / 〜てもらう',
    meaning: 'do a favor / have something done for you',
    structure: 'Verb て-form + あげる / くれる / もらう',
    explanation:
      'Extends giving/receiving to actions (favors). てあげる = do for someone; てくれる = someone does for me; てもらう = get someone to do for me.',
    examples: [
      { jp: '友達が 宿題を 手伝ってくれました。', reading: 'ともだちが しゅくだいを てつだってくれました。', en: 'My friend helped me with my homework.' },
      { jp: '先生に 説明してもらいました。', reading: 'せんせいに せつめいしてもらいました。', en: 'I had the teacher explain it to me.' },
    ],
  },
  {
    id: 'n4-passive',
    level: 'N4',
    title: 'Passive 〜られる',
    meaning: 'be done to / suffer ~ (受身)',
    structure: 'Group 1: u→areru (読む→読まれる). Group 2: stem + られる. する→される, 来る→来られる',
    explanation:
      'The passive voice. The doer is marked with に. Often carries a "suffering / adversity" nuance in Japanese.',
    examples: [
      { jp: '弟に ケーキを 食べられました。', reading: 'おとうとに ケーキを たべられました。', en: 'My cake was eaten by my little brother (to my annoyance).' },
    ],
  },
  {
    id: 'n4-causative',
    level: 'N4',
    title: 'Causative 〜させる',
    meaning: 'make / let someone do ~ (使役)',
    structure: 'Group 1: u→aseru (行く→行かせる). Group 2: stem + させる. する→させる, 来る→来させる',
    explanation:
      'Expresses making or letting someone do something. The person made to act is marked with に or を.',
    examples: [
      { jp: '母は 私に 部屋を 掃除させました。', reading: 'ははは わたしに へやを そうじさせました。', en: 'My mother made me clean the room.' },
    ],
  },
  {
    id: 'n4-nasai',
    level: 'N4',
    title: '〜なさい',
    meaning: 'do ~ (gentle command)',
    structure: 'Verb stem + なさい',
    explanation:
      'A command softer than the plain imperative, used by parents to children and teachers to students.',
    examples: [
      { jp: '早く 寝なさい。', reading: 'はやく ねなさい。', en: 'Go to bed early.' },
    ],
  },
  {
    id: 'n4-you-ni',
    level: 'N4',
    title: '〜ように (so that)',
    meaning: 'so that ~ / in order to ~',
    structure: 'Verb dictionary / ない / potential form + ように',
    explanation:
      'Expresses a purpose or goal you cannot fully control (with potential or non-volitional verbs). Compare to ために for controllable goals.',
    examples: [
      { jp: '聞こえるように 大きい 声で 話します。', reading: 'きこえるように おおきい こえで はなします。', en: 'I speak loudly so that I can be heard.' },
    ],
  },
  {
    id: 'n4-you-ni-suru',
    level: 'N4',
    title: '〜ようにする',
    meaning: 'try to ~ / make an effort to ~',
    structure: 'Verb dictionary / ない-form + ようにする',
    explanation:
      'Making a conscious, ongoing effort to do (or avoid) something as a habit. 〜ようにしている = "I make a point of…".',
    examples: [
      { jp: '毎日 運動するようにしています。', reading: 'まいにち うんどうするようにしています。', en: 'I make a point of exercising every day.' },
    ],
  },
  {
    id: 'n4-you-ni-naru',
    level: 'N4',
    title: '〜ようになる',
    meaning: 'come to ~ / reach the point where ~',
    structure: 'Verb dictionary / potential form + ようになる',
    explanation:
      'A gradual change to a new ability or habit over time — something that became possible that wasn\'t before.',
    examples: [
      { jp: '練習して、泳げるようになった。', reading: 'れんしゅうして、およげるようになった。', en: 'I practiced and became able to swim.' },
    ],
  },
  {
    id: 'n4-koto-ni-suru',
    level: 'N4',
    title: '〜ことにする',
    meaning: 'decide to ~',
    structure: 'Verb dictionary / ない-form + ことにする',
    explanation:
      'A decision the speaker makes by their own will. 〜ことにしている expresses a standing rule or habit.',
    examples: [
      { jp: '来年から 日本で 働くことにしました。', reading: 'らいねんから にほんで はたらくことにしました。', en: "I've decided to work in Japan from next year." },
    ],
  },
  {
    id: 'n4-koto-ni-naru',
    level: 'N4',
    title: '〜ことになる',
    meaning: 'it has been decided that ~',
    structure: 'Verb dictionary / ない-form + ことになる',
    explanation:
      'A decision made by circumstances or others, not the speaker. 〜ことになっている expresses a rule or custom.',
    examples: [
      { jp: '来月 大阪に 転勤することになりました。', reading: 'らいげつ おおさかに てんきんすることになりました。', en: 'It has been decided that I will transfer to Osaka next month.' },
    ],
  },
  {
    id: 'n4-tagaru',
    level: 'N4',
    title: '〜たがる',
    meaning: 'someone (else) shows they want to ~',
    structure: 'Verb stem + たがる',
    explanation:
      'Used for a third person\'s desire, observed from their behavior. (You use たい for yourself.)',
    examples: [
      { jp: '子供が 外で 遊びたがっています。', reading: 'こどもが そとで あそびたがっています。', en: 'The child wants to play outside.' },
    ],
  },
  {
    id: 'n4-yasui-nikui',
    level: 'N4',
    title: '〜やすい / 〜にくい',
    meaning: 'easy to ~ / hard to ~',
    structure: 'Verb stem + やすい / にくい',
    explanation: 'Describes how easy or difficult an action is. They conjugate as い-adjectives.',
    examples: [
      { jp: 'この ペンは 書きやすいです。', reading: 'この ペンは かきやすいです。', en: 'This pen is easy to write with.' },
      { jp: 'この 薬は 飲みにくい。', reading: 'この くすりは のみにくい。', en: 'This medicine is hard to take.' },
    ],
  },
  {
    id: 'n4-sugiru',
    level: 'N4',
    title: '〜すぎる',
    meaning: 'too much / excessively ~',
    structure: 'Verb stem / い-adj (drop い) / な-adj + すぎる',
    explanation: 'Indicates that something is excessive — more than is good or normal.',
    examples: [
      { jp: '昨日は 食べすぎました。', reading: 'きのうは たべすぎました。', en: 'I ate too much yesterday.' },
      { jp: 'この 問題は 難しすぎる。', reading: 'この もんだいは むずかしすぎる。', en: 'This problem is too difficult.' },
    ],
  },
  {
    id: 'n4-kata',
    level: 'N4',
    title: '〜方 (かた)',
    meaning: 'way of doing / how to ~',
    structure: 'Verb stem + 方（かた）',
    explanation: 'Turns a verb into "the way of doing it / how to do it". 使う → 使い方 (how to use).',
    examples: [
      { jp: 'この 漢字の 読み方が 分かりません。', reading: 'この かんじの よみかたが わかりません。', en: "I don't know how to read this kanji." },
    ],
  },
  {
    id: 'n4-imperative',
    level: 'N4',
    title: 'Imperative & prohibition (〜ろ / 〜な)',
    meaning: 'do it! / don\'t do it!',
    structure: 'Imperative: u→e (行け), stem+ろ (食べろ). Prohibition: dictionary + な',
    explanation:
      'The plain command form is strong and rough (signs, anger, sports). Adding な to the dictionary form means "don\'t!".',
    examples: [
      { jp: '早く しろ！', reading: 'はやく しろ！', en: 'Hurry up!' },
      { jp: 'ここに 入るな。', reading: 'ここに はいるな。', en: "Don't enter here." },
    ],
  },
  {
    id: 'n4-o-ni-naru',
    level: 'N4',
    title: 'Honorific お〜になる / Humble お〜する',
    meaning: 'respectful vs. humble polite verbs',
    structure: 'お + verb stem + になる (honorific) / する (humble)',
    explanation:
      'Basic keigo: お〜になる raises the other person\'s action; お〜する lowers your own action toward them.',
    examples: [
      { jp: '先生が お帰りになりました。', reading: 'せんせいが おかえりになりました。', en: 'The teacher has gone home. (honorific)' },
      { jp: '私が お持ちします。', reading: 'わたしが おもちします。', en: "I'll carry it. (humble)" },
    ],
  },
  {
    id: 'n4-to-omou',
    level: 'N4',
    title: '〜と思う',
    meaning: 'I think that ~',
    structure: 'Plain form + と思う',
    explanation:
      'States the speaker\'s opinion or guess. 〜と思っている describes a thought held over time or someone else\'s opinion.',
    examples: [
      { jp: '彼は 来ないと思います。', reading: 'かれは こないとおもいます。', en: "I think he won't come." },
    ],
  },
  {
    id: 'n4-to-iu',
    level: 'N4',
    title: '〜という',
    meaning: 'called ~ / that says ~',
    structure: 'Noun + という + noun; clause + ということ',
    explanation:
      'Introduces a name or label ("a place called X") and quotes content. 〜ということ nominalizes a statement.',
    examples: [
      { jp: '「すし」という 食べ物を 知っていますか。', reading: 'すしという たべものを しっていますか。', en: 'Do you know a food called "sushi"?' },
    ],
  },
];

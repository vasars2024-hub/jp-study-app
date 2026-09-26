import type { GrammarExample } from '../types';
import type { AuthoredGrammarContent } from '../authoredContent';

const ex = (jp: string, en: string, reading?: string): GrammarExample =>
  reading ? { jp, reading, en } : { jp, en };

/** Authored content for hollow N4 supplement records (see authoredContent.ts). */
export const AUTHORED_N4: Record<string, AuthoredGrammarContent> = {
  'n4m-g-bd330a': {
    structure: 'Person に + V-て形 + いただく（いただきます／いただけますか）',
    explanation:
      "The humble counterpart of てもらう: the speaker receives an action from someone of higher status, so it doubles as polite gratitude. It is everywhere in service and business Japanese, especially as ていただけますか for requests. Do not confuse it with てくださる, which describes the same favour from the giver's side: 先生が教えてくださった vs 先生に教えていただいた.",
    examples: [
      ex('先生に 作文を 直していただきました。', 'I had my teacher correct my essay.', 'せんせいに さくぶんを なおしていただきました。'),
      ex('ここに お名前を 書いていただけますか。', 'Could you write your name here, please?', 'ここに おなまえを かいていただけますか。'),
    ],
  },
  'n4m-g-7add5b': {
    meaning: 'as much as you like; any amount; no limit',
    structure: 'いくらでも + V (affirmative)',
    explanation:
      'いくら + でも means “however much it is”, so the phrase says there is no limit: as many or as much as you want. It pairs with affirmative verbs (ある, 食べる, 待つ). Compare いくら〜ても (“no matter how much ~”), which is a concessive clause, not this adverb.',
    examples: [
      ex('ご飯は いくらでも あるから、たくさん 食べてね。', "There's as much rice as you like, so eat plenty.", 'ごはんは いくらでも あるから、たくさん たべてね。'),
      ex('質問が あれば、いくらでも 聞いてください。', 'If you have questions, ask as many as you like.', 'しつもんが あれば、いくらでも きいてください。'),
    ],
  },
  'n4m-g-dc5a56': {
    structure: 'N + 以外に + negative（N 以外は…ない）',
    explanation:
      '以外 means “other than”. Followed by a negative, it limits the whole statement to the one item named: nothing but X. It is close to しか〜ない but more explicit and a little more formal. 以外 also works with an affirmative: 日本人以外も参加できる “people other than Japanese can join too”.',
    examples: [
      ex('日曜日 以外に 休みは ありません。', 'I have no days off except Sunday.', 'にちようび いがいに やすみは ありません。'),
      ex('彼 以外に この 仕事が できる 人は いない。', 'No one but him can do this job.', 'かれ いがいに この しごとが できる ひとは いない。'),
    ],
  },
  'n4m-g-214d69': {
    structure: 'V-て形 + もいい（です／ですか）',
    explanation:
      'Gives or asks permission: “it is all right to ~”. As a question (〜てもいいですか) it is the standard way to ask “May I ~?”. Politer versions are てもよろしいですか and てもかまいませんか; the opposite, a prohibition, is てはいけない.',
    examples: [
      ex('この ペンを 使ってもいいですか。', 'May I use this pen?', 'この ぺんを つかってもいいですか。'),
      ex('疲れたら 休んでもいいよ。', "If you get tired, it's fine to take a break.", 'つかれたら やすんでもいいよ。'),
    ],
  },
  'n4m-g-672722': {
    structure: 'V-ない形 + でくれ',
    explanation:
      'A blunt, typically masculine way of telling someone not to do something: the plain imperative of ないでくれる. It sounds rough or emotional, so in ordinary polite speech use ないでください, and among friends ないで alone.',
    examples: [
      ex('誰にも 言わないでくれ。', "Don't tell anyone.", 'だれにも いわないでくれ。'),
      ex('そんな 目で 見ないでくれよ。', "Don't look at me like that.", 'そんな めで みないでくれよ。'),
    ],
  },
  'n4m-g-22b3cb': {
    structure: 'N / Na-adj + ではなくて（じゃなくて）, B',
    explanation:
      'Negates A and immediately replaces it with the correct B: “it is not A, it is B”. じゃなくて is the conversational form. It is used for corrections, so B usually follows at once; in writing, ではなく without て sounds more formal.',
    examples: [
      ex('これは 塩ではなくて 砂糖です。', "This isn't salt, it's sugar.", 'これは しおではなくて さとうです。'),
      ex('会議は 火曜日じゃなくて 水曜日だよ。', "The meeting isn't on Tuesday, it's on Wednesday.", 'かいぎは かようびじゃなくて すいようびだよ。'),
    ],
  },
  'n4m-g-994eec': {
    meaning: "isn't it ~? (soft guess); don't ~! (sharp prohibition)",
    structure: 'Plain form (Na / N + な) + んじゃない',
    explanation:
      'With rising intonation, んじゃない? offers a guess or opinion softly: “Isn’t it ~? / I think ~”. With falling intonation after a dictionary verb it becomes a sharp prohibition: 触るんじゃない! “Don’t touch it!”. Tone decides which; the polite guess is んじゃないですか.',
    functions: ['speculation', 'ban'],
    examples: [
      ex('田中さんは もう 帰ったんじゃない？', "Hasn't Tanaka already gone home?", 'たなかさんは もう かえったんじゃない？'),
      ex('危ないから、そこで 遊ぶんじゃない。', "It's dangerous, so don't play there.", 'あぶないから、そこで あそぶんじゃない。'),
    ],
  },
  'n4m-g-740bb3': {
    structure: 'Plain form (Na / N + な) + んじゃないか（と思う）',
    explanation:
      'Presents a supposition as a question: “Could it be that ~? / I suspect ~”. It is often followed by と思う to make a hedged opinion. It sounds casual and a little masculine; the polite version is んじゃないでしょうか.',
    functions: ['speculation', 'confirm'],
    examples: [
      ex('この 道は 間違っているんじゃないか。', 'Isn’t this the wrong road?', 'この みちは まちがっているんじゃないか。'),
      ex('明日は 雨が 降るんじゃないかと 思う。', 'I have a feeling it might rain tomorrow.', 'あしたは あめが ふるんじゃないかと おもう。'),
    ],
  },
  'n4m-g-970b25': {
    structure: 'Plain form (Na / N + な) + んだろう（んでしょう）',
    explanation:
      'Adds the explanatory ん to だろう: the speaker infers an explanation for something they have noticed, “it must be that ~”. With a question word it wonders about a reason: どうして泣いているんだろう “I wonder why she is crying”. The polite form is んでしょう.',
    examples: [
      ex('電気が 消えている。もう 寝たんだろう。', 'The lights are off. He must have gone to bed.', 'でんきが きえている。もう ねたんだろう。'),
      ex('彼は どうして 来なかったんだろう。', "I wonder why he didn't come.", 'かれは どうして こなかったんだろう。'),
    ],
  },
  'n4m-g-daf726': {
    meaning: "that's enough; never mind",
    structure: 'もう + いい（です／よ）',
    explanation:
      'Literally “already good”: nothing more is needed. It can be a neutral “that’s enough, thanks” when offered more, or an irritated “forget it!” in an argument, so tone matters. To decline politely, もう結構です is safer.',
    examples: [
      ex('お茶は もう いいです。ありがとう。', "I'm fine for tea now, thank you.", 'おちゃは もう いいです。ありがとう。'),
      ex('もう いいよ、自分で やるから。', "Never mind, I'll do it myself.", 'もう いいよ、じぶんで やるから。'),
    ],
  },
  'n4m-g-3e0cbf': {
    meaning: 'when I tried ~ (I found that ...)',
    structure: 'V-て形 + みると, + discovery (usually past)',
    explanation:
      'Combines てみる (“try doing”) with the discovery use of と: you did something and found out something you did not expect. The second clause is a fact, not the speaker’s will. てみたら is almost interchangeable and more conversational.',
    functions: ['condition', 'unexpected-outcome'],
    examples: [
      ex('食べてみると、意外に おいしかった。', 'When I tried it, it was surprisingly tasty.', 'たべてみると、いがいに おいしかった。'),
      ex('行ってみると、店は もう 閉まっていた。', 'When I got there, the shop was already closed.', 'いってみると、みせは もう しまっていた。'),
    ],
  },
  'n4m-g-35f072': {
    meaning: 'nothing but ~; only ~ (too much of it)',
    structure: 'N + ばかり（だ／です）; V-て + ばかりいる',
    explanation:
      'ばかり says one thing fills the whole picture, usually with a complaint: “nothing but ~”. After a noun it means all ~ and nothing else; after て + いる it means “does nothing but ~”. Unlike neutral だけ, ばかり carries the feeling that it is too much. V-た + ばかり (“just did”) is a separate pattern.',
    examples: [
      ex('弟は ゲーム ばかり している。', 'My little brother does nothing but play games.', 'おとうとは げーむ ばかり している。'),
      ex('この 店は 高い 物 ばかりです。', 'This shop has nothing but expensive things.', 'この みせは たかい もの ばかりです。'),
    ],
  },
  'n4m-g-dea877': {
    structure: 'Plain form + じゃないか; V-(よ)う + じゃないか',
    explanation:
      'A rhetorical question that asserts: “isn’t it (obviously) ~!”, used to point something out, to blame or to show surprise (だから言ったじゃないか “I told you so!”). After the volitional form it is a rousing invitation: やろうじゃないか “let’s do it!”. It sounds masculine; the neutral forms are じゃない and じゃないですか.',
    examples: [
      ex('なんだ、ちゃんと できるじゃないか。', 'Well, you can do it properly after all!', 'なんだ、ちゃんと できるじゃないか。'),
      ex('みんなで 頑張ろうじゃないか。', "Come on, let's all do our best!", 'みんなで がんばろうじゃないか。'),
    ],
  },
  'n4m-g-b3151b': {
    meaning: 'to have someone do something (for you)',
    structure: 'Person に + V-て形 + もらう',
    explanation:
      'Describes receiving an action as a favour, from the receiver’s side: “someone does X for me”. The doer is marked with に. As a request, てもらえますか / てもらえませんか is softer than てください. The giver’s-side view is てくれる, and the humble version is ていただく.',
    functions: ['benefit', 'request'],
    examples: [
      ex('友達に 引っ越しを 手伝ってもらった。', 'A friend helped me move.', 'ともだちに ひっこしを てつだってもらった。'),
      ex('ちょっと 窓を 開けてもらえますか。', 'Could you open the window a bit?', 'ちょっと まどを あけてもらえますか。'),
    ],
  },
  'n4m-g-ff7ff6': {
    meaning: 'well then; in that case',
    structure: 'それでは（では／じゃあ）, + next statement',
    explanation:
      'A conjunction that moves things on, either as a transition (“well then, let’s begin”) or as a conclusion from what was just said (“in that case”). It is formal and common in lessons, meetings and announcements; では is shorter, じゃあ casual.',
    functions: ['conclude', 'comes-next'],
    examples: [
      ex('それでは、授業を 始めます。', "Well then, let's start the lesson.", 'それでは、じゅぎょうを はじめます。'),
      ex('「明日は 休みです。」「それでは、あさって 来ます。」', '“We’re closed tomorrow.” “In that case, I’ll come the day after.”', '「あしたは やすみです。」「それでは、あさって きます。」'),
    ],
  },
  'n4m-g-41dbfd': {
    meaning: 'please do ~ (casual, familiar)',
    structure: 'V-て形 + ちょうだい; N + ちょうだい',
    explanation:
      'A casual request, softer and more familiar than てください; traditionally used by women, and by adults to children. After a noun, ちょうだい alone means “give me”: それ、ちょうだい. It is not used towards superiors.',
    examples: [
      ex('ちょっと これを 持ってちょうだい。', 'Hold this for me a moment, would you?', 'ちょっと これを もってちょうだい。'),
      ex('早く 寝てちょうだいね。', 'Go to bed soon, OK?', 'はやく ねてちょうだいね。'),
    ],
  },
  'n4m-g-7f5060': {
    structure: 'V-た形 + らどうですか（らどう？／らいかがですか）',
    explanation:
      'Suggests a course of action to the listener: “why don’t you ~?”. It is advice, so it suits equals and people below you; to a superior it can sound pushy, and たらいかがですか is the polite version. Casually it shrinks to たら? on its own.',
    functions: ['advice'],
    examples: [
      ex('疲れているなら、少し 休んだらどうですか。', "If you're tired, why don't you rest a little?", 'つかれているなら、すこし やすんだらどうですか。'),
      ex('先生に 聞いてみたら どう？', 'How about asking the teacher?', 'せんせいに きいてみたら どう？'),
    ],
  },
  'n4m-g-97c541': {
    meaning: 'you may ~; may I ~? (formal)',
    structure: 'V-て形 + もよろしい（です／ですか）',
    explanation:
      'The formal version of てもいい. As a statement (帰ってもよろしい) it grants permission from above and sounds stiff or official; as a question (てもよろしいですか) it is a polite way to ask a superior or customer for permission.',
    functions: ['allow', 'request-permission'],
    examples: [
      ex('今日は もう 帰っても よろしいです。', 'You may go home now for today.', 'きょうは もう かえっても よろしいです。'),
      ex('ここで 写真を 撮っても よろしいですか。', 'May I take photos here?', 'ここで しゃしんを とっても よろしいですか。'),
    ],
  },
  'n4m-g-404e58': {
    meaning: 'terrible; serious; a huge amount of',
    structure: 'たいへん + な + N',
    explanation:
      'As a na-adjective, たいへん describes something serious, hard or huge: たいへんな仕事 “a hard job”, たいへんな事故 “a terrible accident”. It has nothing to do with the desire ending 〜たい. As an adverb before an adjective or verb it means “very” in polite speech.',
    functions: ['level', 'evaluate'],
    examples: [
      ex('昨日は たいへんな 一日だった。', 'Yesterday was a rough day.', 'きのうは たいへんな いちにちだった。'),
      ex('台風で たいへんな 被害が 出た。', 'The typhoon caused serious damage.', 'たいふうで たいへんな ひがいが でた。'),
    ],
  },
  'n4m-g-c54654': {
    meaning: "that's why ~ (realising the reason)",
    structure: 'Fact. だから + clause + のだ（んだ）',
    explanation:
      'The speaker states a fact and then presents its consequence as something they now understand: “so that’s why ~”. のだ marks the realisation. It is typical when a small mystery is solved: 雨が降っていた。だから道が濡れているんだ.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('昨日 徹夜した。だから 眠いのだ。', "I stayed up all night yesterday. That's why I'm sleepy.", 'きのう てつやした。だから ねむいのだ。'),
      ex('彼は 引っ越した。だから 最近 会わないんだ。', "He moved house — that's why I haven't seen him lately.", 'かれは ひっこした。だから さいきん あわないんだ。'),
    ],
  },
  'n4m-g-a40ce5': {
    meaning: 'is designed / set up so that ~',
    structure: 'V-dict / V-ない + ようになっている',
    explanation:
      'Describes how a thing or system is built to work: “it is set up so that ~”. Unlike ようになる (a change in someone’s ability or habit), this is about a mechanism or rule already in place. It is common when explaining machines, doors and rules.',
    functions: ['results-state', 'means-methods'],
    examples: [
      ex('この ドアは 自動で 閉まるようになっている。', 'This door is designed to close automatically.', 'この どあは じどうで しまるようになっている。'),
      ex('ボタンを 押すと お湯が 出るようになっています。', "It's set up so hot water comes out when you press the button.", 'ぼたんを おすと おゆが でるようになっています。'),
    ],
  },
  'n4m-g-61db8f': {
    structure: 'もうすぐ + V; もうすぐ + N + だ',
    explanation:
      'Says an event is very close in time: “soon, any moment now”. It often comes with a noun (もうすぐ夏休みだ “the summer holidays are almost here”). まもなく is the formal equivalent heard in station announcements; そろそろ adds “it’s about time”.',
    examples: [
      ex('もうすぐ 電車が 来ます。', 'The train will be here soon.', 'もうすぐ でんしゃが きます。'),
      ex('もうすぐ 誕生日だね。', 'Your birthday is coming up soon, isn’t it?', 'もうすぐ たんじょうびだね。'),
    ],
  },
  'n4m-g-210b92': {
    structure: 'V-て形 + もよろしいでしょうか',
    explanation:
      'The most polite everyday way to ask permission, used with customers, superiors and strangers; でしょうか softens the question further than ですか. The usual answer is どうぞ; a refusal is often indirect (ちょっと…).',
    functions: ['request-permission'],
    examples: [
      ex('少し 質問しても よろしいでしょうか。', 'Might I ask a few questions?', 'すこし しつもんしても よろしいでしょうか。'),
      ex('窓を 開けても よろしいでしょうか。', 'Would it be all right if I opened the window?', 'まどを あけても よろしいでしょうか。'),
    ],
  },
  'n4m-g-711858': {
    meaning: 'make a point of ~ing; try to (as a habit)',
    structure: 'V-dict / V-ない + ようにしている',
    explanation:
      'Describes a habit kept up deliberately: “I make a point of (not) ~”. ようにする is a single effort or decision; ようにしている is the ongoing practice. It is about one’s own conduct, so it rarely describes things outside the speaker’s control.',
    functions: ['action-effort', 'repeat-habits'],
    examples: [
      ex('毎日 野菜を 食べるようにしている。', 'I make a point of eating vegetables every day.', 'まいにち やさいを たべるようにしている。'),
      ex('夜は コーヒーを 飲まないようにしています。', 'I try not to drink coffee at night.', 'よるは こーひーを のまないようにしています。'),
    ],
  },
  'n4m-g-05391a': {
    meaning: 'I think (that) ~',
    structure: 'Plain form + と思う（と思います）',
    explanation:
      'Presents a statement as the speaker’s opinion or judgement. After a noun or na-adjective keep だ: 静かだと思う. For a third person’s thinking use と思っている. Japanese uses it far more than English uses “I think”, as a way of softening assertions.',
    functions: ['judge'],
    examples: [
      ex('この 映画は 面白いと 思います。', 'I think this movie is interesting.', 'この えいがは おもしろいと おもいます。'),
      ex('彼は もう 来ないと 思う。', "I don't think he's coming anymore.", 'かれは もう こないと おもう。'),
    ],
  },
  'n4m-g-1adfa8': {
    meaning: 'ended up ~; did ~ completely (often with regret)',
    structure: 'V-て形 + しまった（ちゃった／じゃった）',
    explanation:
      'The past of てしまう. It says either that an action was done completely or, very often, that something happened that the speaker regrets: “I went and ~”. In speech it contracts to ちゃった / じゃった. Context tells you whether it is completion or regret.',
    functions: ['finish', 'regret'],
    examples: [
      ex('大事な 書類を なくしてしまった。', "I've gone and lost an important document.", 'だいじな しょるいを なくしてしまった。'),
      ex('ケーキを 全部 食べちゃった。', 'I ate the whole cake.', 'けーきを ぜんぶ たべちゃった。'),
    ],
  },
  'n4m-g-cbc6ee': {
    meaning: '(someone) said that ~',
    structure: 'Quote / plain form + と言っていました',
    explanation:
      'Reports what someone said, usually to pass a message on: “X said that ~”. ていました rather than ました presents it as a message still relevant now. In casual speech it becomes って言ってた, or just って.',
    functions: ['heard'],
    examples: [
      ex('田中さんが 明日 休むと 言っていました。', "Tanaka said he'd be off tomorrow.", 'たなかさんが あした やすむと いっていました。'),
      ex('母が よろしくと 言っていました。', 'My mother sends her regards.', 'ははが よろしくと いっていました。'),
    ],
  },
  'n4m-g-c20722': {
    structure: 'V-た形 + らいい（のに／なあ）; Question word + たらいいですか',
    explanation:
      'Expresses a wish: “it would be nice if ~”. With のに or なあ it becomes wistful, often about something unlikely. As a question (どうしたらいいですか) it asks for advice instead: “what should I do?”. ばいい is a close synonym.',
    functions: ['wish', 'advice'],
    examples: [
      ex('明日 晴れたら いいなあ。', "I hope it's sunny tomorrow.", 'あした はれたら いいなあ。'),
      ex('もっと 時間が あったら いいのに。', 'If only I had more time.', 'もっと じかんが あったら いいのに。'),
    ],
  },
  'n4m-g-54c84a': {
    structure: 'V-ます stem / Adj stem + そうに見える',
    explanation:
      'Adds 見える to the appearance form そう: “looks ~ to the eye”. It is a visual impression, so it cannot report hearsay. い-adjectives drop い (おいしそう), な-adjectives drop な (元気そう), and いい becomes よさそう.',
    examples: [
      ex('この ケーキは おいしそうに 見える。', 'This cake looks delicious.', 'この けーきは おいしそうに みえる。'),
      ex('彼女は 少し 寂しそうに 見えた。', 'She looked a little lonely.', 'かのじょは すこし さびしそうに みえた。'),
    ],
  },
  'n4m-g-4372b4': {
    meaning: 'when I tried ~; why not try ~?',
    structure: 'V-て形 + みたら',
    explanation:
      'Two uses. As a discovery: 着てみたら小さかった “when I tried it on, it was too small”, which needs a past second clause. As advice it often ends there: 聞いてみたら? “why not ask?”. The advice use is casual; politely, てみたらどうですか.',
    functions: ['condition', 'advice'],
    examples: [
      ex('着てみたら、サイズが 小さかった。', 'When I tried it on, it was too small.', 'きてみたら、さいずが ちいさかった。'),
      ex('分からないなら、先輩に 聞いてみたら？', "If you don't know, why not ask a senior colleague?", 'わからないなら、せんぱいに きいてみたら？'),
    ],
  },
  'n4m-g-c7a597': {
    meaning: 'I wonder if ~ (soft, often a wish or request)',
    structure: 'Plain negative + かしら',
    explanation:
      'かしら is a soft “I wonder”, traditionally feminine. With a negative it often voices a hope (“I wish ~ would”) or a gentle request (手伝ってくれないかしら “I wonder if you could help”). In neutral speech ないかな plays the same role.',
    functions: ['wish', 'speculation'],
    examples: [
      ex('早く 春に ならないかしら。', 'I wish spring would hurry up and come.', 'はやく はるに ならないかしら。'),
      ex('誰か 手伝ってくれないかしら。', 'I wonder if someone could help me.', 'だれか てつだってくれないかしら。'),
    ],
  },
  'n4m-g-083f8c': {
    meaning: 'there is; to have (very polite ある)',
    structure: 'N + が + ございます（＝あります）',
    explanation:
      'ございます is the polite form of ある used in service and formal speech: お手洗いは二階にございます. ござる on its own is archaic, heard in period dramas. Do not confuse it with でございます, the polite form of です.',
    functions: ['reverent-humble'],
    examples: [
      ex('お手洗いは 二階に ございます。', 'The restrooms are on the second floor.', 'おてあらいは にかいに ございます。'),
      ex('ほかの 色も ございます。', 'We also have other colours.', 'ほかの いろも ございます。'),
    ],
  },
  'n4m-g-9b4231': {
    meaning: "there's no way ~; can't possibly ~",
    structure: 'Plain form (Na + な / N + の) + はずがない',
    explanation:
      'Denies something strongly on the basis of reasoning: “there’s no way ~”. It is much stronger than ないはずだ (“should not be”), which is a mild expectation. The polite form is はずがありません; はずはない is a slightly more emphatic variant.',
    examples: [
      ex('彼が うそを つく はずがない。', "There's no way he'd tell a lie.", 'かれが うそを つく はずがない。'),
      ex('こんな 簡単な 問題が 分からない はずがない。', "You can't possibly not understand a problem this easy.", 'こんな かんたんな もんだいが わからない はずがない。'),
    ],
  },
  'n4m-g-f16dd1': {
    meaning: 'to be (very polite form of です)',
    structure: 'N + でございます',
    explanation:
      'The super-polite copula used by staff to customers, on the phone and in announcements: こちらが会議室でございます. It replaces です after nouns; adjectives keep their own forms. でござる is the period-drama version.',
    functions: ['reverent-humble'],
    examples: [
      ex('お電話 ありがとうございます。山田商事で ございます。', 'Thank you for calling. This is Yamada Trading.', 'おでんわ ありがとうございます。やまだしょうじで ございます。'),
      ex('こちらが お部屋で ございます。', 'This is your room.', 'こちらが おへやで ございます。'),
    ],
  },
  'n4m-g-3b40e1': {
    structure: 'V-て形 + はいけない（いけません）',
    explanation:
      'Prohibits an action: “you must not ~”. It is direct and used for rules and by people in authority. In speech it contracts to ちゃいけない / じゃいけない, and ちゃだめ is even more casual. Asking permission is the reverse: てもいいですか.',
    examples: [
      ex('ここで タバコを 吸ってはいけません。', 'You must not smoke here.', 'ここで たばこを すってはいけません。'),
      ex('試験中は 話しては いけない。', "You mustn't talk during the exam.", 'しけんちゅうは はなしては いけない。'),
    ],
  },
  'n4m-g-a26811': {
    meaning: 'even if ~; whether ~ or ~',
    structure: 'V-て / Adj-くて + も; N / Na + でも',
    explanation:
      'The concessive “even if”: the second clause holds whatever the condition. Verbs and い-adjectives take ても (高くても), nouns and な-adjectives take でも (雨でも, 暇でも). Two in a row list alternatives: 雨でも雪でも “rain or snow”.',
    examples: [
      ex('雨でも 雪でも 試合は 行います。', 'The match goes ahead whether it rains or snows.', 'あめでも ゆきでも しあいは おこないます。'),
      ex('高くても この カメラを 買いたい。', "I want this camera even if it's expensive.", 'たかくても この かめらを かいたい。'),
    ],
  },
  'n4m-g-dc869c': {
    meaning: 'sometimes ~; there are times when ~',
    structure: 'V-dict / V-ない + ことがある',
    explanation:
      'With the dictionary or negative form it means “there are times when ~”. It differs from V-た + ことがある, which is about past experience (“have done”). The frequency is low to moderate; for “often” use よく.',
    examples: [
      ex('忙しい ときは 朝ご飯を 食べない ことが ある。', "When I'm busy I sometimes skip breakfast.", 'いそがしい ときは あさごはんを たべない ことが ある。'),
      ex('この 道は 冬に 閉鎖される ことが あります。', 'This road is sometimes closed in winter.', 'この みちは ふゆに へいさされる ことが あります。'),
    ],
  },
  'n4m-g-8fe31d': {
    structure: 'V-て形 + くれて ありがとう（くださって ありがとうございます）',
    explanation:
      'Thanks someone for a specific thing they did for you; くれて marks the action as a favour to the speaker. To a superior, use てくださってありがとうございます. Do not use てもらって here, because the giver is the subject.',
    functions: ['benefit', 'feel'],
    examples: [
      ex('来てくれて ありがとう。', 'Thanks for coming.', 'きてくれて ありがとう。'),
      ex('手伝ってくださって ありがとうございました。', 'Thank you very much for helping me.', 'てつだってくださって ありがとうございました。'),
    ],
  },
  'n4m-g-adb8e3': {
    meaning: 'come to (be able to) ~; no longer ~',
    structure: 'V-dict + ようになる; V-ない → なくなる',
    explanation:
      'Describes a gradual change: “come to (be able to) ~”. With potential verbs it marks a new ability (泳げるようになった). For the negative change, ないようになる exists, but なくなる is far more common: 食べられなくなった “can no longer eat”.',
    functions: ['results-state', 'process'],
    examples: [
      ex('日本語が 話せるように なりました。', "I've become able to speak Japanese.", 'にほんごが はなせるように なりました。'),
      ex('最近 テレビを 見なく なった。', "I've stopped watching TV lately.", 'さいきん てれびを みなく なった。'),
    ],
  },
  'n4m-g-b29713': {
    structure: 'V-ない形 (drop い) + くてはいけない（なくちゃ）',
    explanation:
      'An obligation: “have to ~”. It is a close synonym of なければならない; いけない sounds more personal and situational, ならない more general or rule-like. Casually it shortens to なくちゃ.',
    functions: ['necessary-obligation'],
    examples: [
      ex('明日までに レポートを 出さなくては いけない。', 'I have to hand in the report by tomorrow.', 'あしたまでに れぽーとを ださなくては いけない。'),
      ex('もう 行かなくちゃ。', "I've got to go now.", 'もう いかなくちゃ。'),
    ],
  },
  'n4m-g-d6b231': {
    meaning: '(someone else) wants / shows signs of feeling ~',
    structure: 'Feeling Adj stem / V-たい stem + がっている',
    explanation:
      'Japanese does not state other people’s feelings directly, so がる turns a feeling word into observed behaviour: 妹は犬を欲しがっている “my sister (shows she) wants a dog”. It is for third persons, not yourself. With たい the object takes を: 行きたがっている.',
    functions: ['desire', 'feel'],
    examples: [
      ex('子どもが 新しい ゲームを 欲しがっている。', 'My child wants a new game.', 'こどもが あたらしい げーむを ほしがっている。'),
      ex('彼は 寒がっている から、窓を 閉めよう。', "He seems cold, so let's close the window.", 'かれは さむがっている から、まどを しめよう。'),
    ],
  },
  'n4m-g-e61c66': {
    structure: 'A は B ほど + negative predicate',
    explanation:
      'Compares by saying A does not reach B’s degree: “A is not as ~ as B”. The predicate is always negative. It is the natural way to say “less ~ than”, which Japanese cannot build with より and a positive form.',
    functions: ['compare', 'level'],
    examples: [
      ex('今年の 夏は 去年ほど 暑くない。', "This summer isn't as hot as last year.", 'ことしの なつは きょねんほど あつくない。'),
      ex('私は 兄ほど 背が 高く ありません。', "I'm not as tall as my older brother.", 'わたしは あにほど せが たかく ありません。'),
    ],
  },
  'n4m-g-1f5f5a': {
    meaning: '(someone) does ~ for me / us',
    structure: 'Giver が + V-て形 + くれる',
    explanation:
      'Someone does something for the speaker or the speaker’s group, with the giver as subject. It shows the speaker benefits or is grateful. The polite version is てくださる; the receiver-side view of the same favour is てもらう.',
    examples: [
      ex('母が お弁当を 作ってくれた。', 'My mother made me a packed lunch.', 'ははが おべんとうを つくってくれた。'),
      ex('友達が 駅まで 送ってくれました。', 'A friend drove me to the station.', 'ともだちが えきまで おくってくれました。'),
    ],
  },
  'n4m-g-8a3a93': {
    meaning: 'a little; a bit; (softens a request or refusal)',
    structure: 'ちょっと + V / Adj; ちょっと…（trailing refusal）',
    explanation:
      'Means “a little” (ちょっと待って). Very often it softens a request or a refusal: when someone answers ちょっと… and trails off, it means “that’s difficult”, i.e. no. It is casual; 少し is the neutral word.',
    functions: ['amount', 'refuse'],
    examples: [
      ex('ちょっと 待ってください。', 'Please wait a moment.', 'ちょっと まってください。'),
      ex('「今晩 飲みに 行かない？」「今晩は ちょっと…。」', '“Want to go for a drink tonight?” “Tonight’s a bit… (difficult).”', '「こんばん のみに いかない？」「こんばんは ちょっと…。」'),
    ],
  },
  'n4m-g-bf554b': {
    meaning: 'make A (into) B',
    structure: 'N1 を + N2 / Na + にする; N1 を + Adj-く + する',
    explanation:
      'An agent deliberately changes something: “make A (into) B”. Nouns and な-adjectives take に, い-adjectives take く (部屋を明るくする). It contrasts with になる, a change that happens by itself.',
    functions: ['change-the-way'],
    examples: [
      ex('部屋を きれいに しました。', 'I cleaned up the room.', 'へやを きれいに しました。'),
      ex('音を 小さく してください。', 'Please turn the sound down.', 'おとを ちいさく してください。'),
    ],
  },
  'n4m-g-d48d92': {
    meaning: "I'm thinking of ~ing; intend to",
    structure: 'V-(よ)う形 + と思っている',
    explanation:
      'With the volitional form it describes an intention held for some time: “I’m thinking of ~”. と思う is a decision made just now; と思っている is ongoing, and it is also the form used for other people’s intentions.',
    functions: ['plan', 'intent'],
    examples: [
      ex('来年 日本へ 行こうと 思っています。', "I'm thinking of going to Japan next year.", 'らいねん にほんへ いこうと おもっています。'),
      ex('兄は 車を 買おうと 思っている。', 'My brother is planning to buy a car.', 'あには くるまを かおうと おもっている。'),
    ],
  },
  'n4m-g-038590': {
    structure: 'N + でございます（＝です）',
    explanation:
      'The courteous form of です, used by shop staff, receptionists and in formal announcements. It sounds very deferential, so between friends or colleagues it is out of place. The question form is でございますか.',
    examples: [
      ex('お会計は 三千円で ございます。', 'That comes to 3,000 yen.', 'おかいけいは さんぜんえんで ございます。'),
      ex('本日の 担当は 私、鈴木で ございます。', "I'm Suzuki, and I'll be looking after you today.", 'ほんじつの たんとうは わたくし、すずきで ございます。'),
    ],
  },
  'n4m-g-3cbaf4': {
    meaning: 'a little more',
    structure: 'もう少し + Adj / V / N',
    explanation:
      'もう + 少し: “a little more”. With adjectives it asks for a small change of degree (もう少し大きい), with verbs a little more of the action (もう少し待って). もう少しで means “almost”. もうちょっと is the casual version.',
    functions: ['amount'],
    examples: [
      ex('もう少し ゆっくり 話してください。', 'Please speak a little more slowly.', 'もうすこし ゆっくり はなしてください。'),
      ex('もう少しで 終わります。', "I'm almost finished.", 'もうすこしで おわります。'),
    ],
  },
  'n4m-g-ef2736': {
    meaning: "if it hadn't been for ~, ... would have ~",
    structure: 'V-ない → なければ, + V-た（のに／だろう）',
    explanation:
      'A counterfactual: imagines what would have happened if something had not been the case. The second clause is past and often ends in のに (regret) or だろう (supposition). なかったら is a close, more conversational synonym.',
    functions: ['condition-contrary', 'regret'],
    examples: [
      ex('雨が 降らなければ、ピクニックに 行けたのに。', "If it hadn't rained, we could have gone on a picnic.", 'あめが ふらなければ、ぴくにっくに いけたのに。'),
      ex('あなたが いなければ、成功しなかっただろう。', "Without you, I wouldn't have succeeded.", 'あなたが いなければ、せいこうしなかっただろう。'),
    ],
  },
  'n4m-g-e1039f': {
    meaning: "it's hard / serious; that's terrible",
    structure: 'N / situation + は + たいへんだ（たいへんです）',
    explanation:
      'As a predicate, たいへん says a situation is hard, serious or a lot of work: 毎日の通勤はたいへんだ. As a reply, たいへんですね shows sympathy (“that must be tough”). たいへんだ! on its own means “Oh no, something terrible has happened!”.',
    functions: ['evaluate'],
    examples: [
      ex('子育ては たいへんだ。', 'Raising children is hard work.', 'こそだては たいへんだ。'),
      ex('「毎日 三時間 通勤しています。」「それは たいへんですね。」', '“I commute three hours a day.” “That must be tough.”', '「まいにち さんじかん つうきんしています。」「それは たいへんですね。」'),
    ],
  },
  'n4m-g-4df930': {
    meaning: "isn't it the case that ~? (modest opinion)",
    structure: 'Plain form (N / Na without だ) + ではないだろうか',
    explanation:
      'A hedged claim: the speaker puts an opinion as a question so it sounds modest, “Isn’t it that ~? / I suspect ~”. It is common in essays and speeches. Spoken versions are じゃないだろうか and んじゃないでしょうか.',
    examples: [
      ex('この 計画は 少し 無理ではないだろうか。', 'Isn’t this plan a bit unrealistic?', 'この けいかくは すこし むりではないだろうか。'),
      ex('彼の 意見も 正しいのでは ないだろうか。', 'Couldn’t his opinion be right too?', 'かれの いけんも ただしいのでは ないだろうか。'),
    ],
  },
  'n4m-g-439fda': {
    meaning: 'want (someone) to do ~',
    structure: 'Person に + V-て形 + ほしい',
    explanation:
      'Expresses what the speaker wants someone else to do: “I want you to ~”, with the person marked by に. It is direct, so towards a superior use ていただきたい. For wanting to do something yourself use たい; for wanting a thing, ほしい alone.',
    functions: ['desire', 'request'],
    examples: [
      ex('母には いつまでも 元気で いてほしい。', 'I want my mother to stay healthy for a long time.', 'ははには いつまでも げんきで いてほしい。'),
      ex('もっと ゆっくり 話してほしい。', "I'd like you to speak more slowly.", 'もっと ゆっくり はなしてほしい。'),
    ],
  },
  'n4m-g-42ef5a': {
    meaning: 'do ~ for someone',
    structure: 'Receiver に + V-て形 + あげる',
    explanation:
      'Someone does a favour for another person: “do ~ for them”. Said directly to the listener it can sound condescending (教えてあげる “I’ll teach you, lucky you”), so offers are better phrased with ましょうか. For animals and plants やる is used instead.',
    functions: ['benefit', 'give'],
    examples: [
      ex('妹に 本を 読んであげた。', 'I read a book to my little sister.', 'いもうとに ほんを よんであげた。'),
      ex('道に 迷った 人に 地図を 描いてあげました。', 'I drew a map for someone who was lost.', 'みちに まよった ひとに ちずを かいてあげました。'),
    ],
  },
  'n4m-g-8ba08f': {
    structure: 'もしかしたら + … + かもしれない',
    explanation:
      'An adverb of low certainty, “maybe; by some chance”. It is almost always paired with かもしれない at the end of the sentence. もしかすると means the same; ひょっとしたら is slightly more colloquial.',
    functions: ['speculation'],
    examples: [
      ex('もしかしたら、明日は 雪が 降るかもしれない。', 'It might possibly snow tomorrow.', 'もしかしたら、あしたは ゆきが ふるかもしれない。'),
      ex('もしかしたら、あの 人は 先生かもしれませんね。', 'That person might be a teacher, you know.', 'もしかしたら、あの ひとは せんせいかもしれませんね。'),
    ],
  },
  'n4m-g-44bb8a': {
    structure: 'Plain form + のは + reason + からだ',
    explanation:
      'Puts the result first and the reason in focus position: “the reason (that) A is B”. This stresses the reason more than a plain から clause. Formal writing uses のは…ためだ; ので cannot fill this slot.',
    functions: ['cause-reason'],
    examples: [
      ex('遅れたのは バスが 来なかったからです。', "The reason I'm late is that the bus didn't come.", 'おくれたのは ばすが こなかったからです。'),
      ex('日本語を 勉強しているのは アニメが 好きだからだ。', "I'm studying Japanese because I love anime.", 'にほんごを べんきょうしているのは あにめが すきだからだ。'),
    ],
  },
  'n4m-g-b8dfaa': {
    meaning: 'nothing / no one at all (question word + も + negative)',
    structure: 'Question word (+ particle) + も + negative',
    explanation:
      'A question word plus も with a negative gives total negation: 何も “nothing”, 誰も “no one”, どこにも “nowhere”. With a counter the meaning flips: 何回も with an affirmative means “many times”. Particles が and を drop before も; others stay (どこにも).',
    functions: ['negative', 'emphasize-negative'],
    examples: [
      ex('冷蔵庫に 何も ない。', "There's nothing in the fridge.", 'れいぞうこに なにも ない。'),
      ex('教室には 誰も いなかった。', 'There was no one in the classroom.', 'きょうしつには だれも いなかった。'),
    ],
  },
  'n4m-g-4249d0': {
    meaning: 'there is both A and B',
    structure: 'N1 + もあり、N2 + もある',
    explanation:
      'Lists two coexisting sides of something: “there is A and there is also B”, often pros and cons or mixed feelings. The te-form version is もあって. …もあれば…もある is similar but stresses variety between cases.',
    functions: ['add'],
    examples: [
      ex('この 仕事には 楽しさも あり、厳しさも ある。', 'This job has its fun side and its tough side.', 'この しごとには たのしさも あり、きびしさも ある。'),
      ex('町には 古い 寺も あり、新しい ビルも ある。', 'The town has both old temples and new buildings.', 'まちには ふるい てらも あり、あたらしい びるも ある。'),
    ],
  },
  'n4m-g-02ee44': {
    meaning: 'some are A, others B; sometimes A, sometimes B',
    structure: 'N1 + もあれば、N2 + もある',
    explanation:
      'Describes variety: “some are A, some are B”. The two items usually contrast. It sounds balanced and slightly written; in conversation …もあるし…もある does the same job.',
    functions: ['add', 'compare-contrast'],
    examples: [
      ex('人生には いい 時も あれば 悪い 時も ある。', 'Life has its good times and its bad times.', 'じんせいには いい ときも あれば わるい ときも ある。'),
      ex('甘い りんごも あれば、すっぱい りんごも ある。', 'Some apples are sweet and some are sour.', 'あまい りんごも あれば、すっぱい りんごも ある。'),
    ],
  },
  'n4m-g-3c8852': {
    meaning: 'need to ~; it is necessary to ~',
    structure: 'V-dict + 必要がある（必要はない）',
    explanation:
      'States a need objectively: “it is necessary to ~”. It is more neutral and written-sounding than なければならない. The negative 必要はない means “there is no need to”, not “must not”.',
    examples: [
      ex('ビザを 申請する 必要が あります。', 'You need to apply for a visa.', 'びざを しんせいする ひつようが あります。'),
      ex('急ぐ 必要は ない。', "There's no need to hurry.", 'いそぐ ひつようは ない。'),
    ],
  },
  'n4m-g-819983': {
    meaning: 'to do (humble form of する)',
    structure: 'N + いたします; お / ご + V-stem / N + いたします',
    explanation:
      'The humble form of する, used about the speaker’s own actions to show respect to the listener: 私がご案内いたします. It is standard in business and service speech. Never use it for other people’s actions; for those the respectful verb is なさる.',
    examples: [
      ex('後ほど こちらから お電話 いたします。', "We'll call you back later.", 'のちほど こちらから おでんわ いたします。'),
      ex('よろしく お願い いたします。', 'I look forward to working with you.', 'よろしく おねがい いたします。'),
    ],
  },
  'n4m-g-f01527': {
    meaning: 'suddenly; all of a sudden',
    structure: '急に + V',
    explanation:
      'An adverb for something happening without warning: “suddenly”. It is everyday and neutral. 突然 is similar but more formal and stronger; すぐに means “right away”, with no sense of surprise.',
    functions: ['unexpected-outcome'],
    examples: [
      ex('急に 雨が 降り出した。', 'It suddenly started to rain.', 'きゅうに あめが ふりだした。'),
      ex('急に 用事が できて、行けなく なった。', "Something came up suddenly and I couldn't go.", 'きゅうに ようじが できて、いけなく なった。'),
    ],
  },
  'n4m-g-6f1635': {
    meaning: 'only ~ (and no more)',
    structure: 'N (+ particle) + しか + negative',
    explanation:
      'Limits to one thing with a feeling that it is not enough: “only ~”. The verb is always negative even though the English is positive. だけ is the neutral “only”; しか〜ない stresses the lack.',
    examples: [
      ex('財布に 百円 しか ない。', "I've only got 100 yen in my wallet.", 'さいふに ひゃくえん しか ない。'),
      ex('この 店は 日曜日に しか 開いていない。', 'This shop is only open on Sundays.', 'この みせは にちようびに しか あいていない。'),
    ],
  },
  'n4m-g-131499': {
    structure: 'まだ + V-て + いない（いません）',
    explanation:
      'Says something expected has not happened yet. Note the ている form: “I haven’t eaten yet” is まだ食べていない, not まだ食べなかった, which would describe a finished past event. The short answer is まだです.',
    examples: [
      ex('宿題は まだ 終わっていない。', "I haven't finished my homework yet.", 'しゅくだいは まだ おわっていない。'),
      ex('「もう 昼ご飯を 食べましたか。」「いいえ、まだ 食べていません。」', '“Have you had lunch yet?” “No, not yet.”', '「もう ひるごはんを たべましたか。」「いいえ、まだ たべていません。」'),
    ],
  },
  'n4m-g-3b1ad7': {
    meaning: 'I ~, but ... (opens a request or topic)',
    structure: 'Plain form (Na / N + な) + んですが、…',
    explanation:
      'Gives the background to a request or question and leaves the sentence open so the listener can respond: “I’m ~, (could you …?)”. It is the natural, polite way to start asking for help, and often the request itself is left unsaid: 道に迷ったんですが….',
    functions: ['explain', 'request'],
    examples: [
      ex('すみません、駅へ 行きたいんですが…。', 'Excuse me, I want to get to the station…', 'すみません、えきへ いきたいんですが…。'),
      ex('この 漢字が 読めないんですが、教えて いただけますか。', "I can't read this kanji — could you tell me?", 'この かんじが よめないんですが、おしえて いただけますか。'),
    ],
  },
  'n4m-g-8324d3': {
    structure: 'Question word + V-た形 + らいいですか',
    explanation:
      'Asks for advice or instructions: “what / where / how should I ~?”. ばいいですか means the same. It is polite and neutral, suitable for strangers and staff.',
    functions: ['advice'],
    examples: [
      ex('どこで 切符を 買ったら いいですか。', 'Where should I buy a ticket?', 'どこで きっぷを かったら いいですか。'),
      ex('何時に 来たら いいですか。', 'What time should I come?', 'なんじに きたら いいですか。'),
    ],
  },
  'n4m-g-862814': {
    structure: 'Adj-く + する; N / Na + に + する; V + ようにする',
    explanation:
      'Three related uses of する: giving something a quality (部屋を暖かくする), choosing (コーヒーにする “I’ll have coffee”), and making an effort (忘れないようにする). All three are about the speaker deliberately bringing something about; the “happens by itself” counterparts use なる.',
    functions: ['change-the-way', 'decision', 'action-effort'],
    examples: [
      ex('飲み物は 紅茶に します。', "I'll have tea to drink.", 'のみものは こうちゃに します。'),
      ex('遅れないように します。', "I'll make sure I'm not late.", 'おくれないように します。'),
    ],
  },
  'n4m-g-1c7b93': {
    meaning: 'was made / done by ~ (agent in a passive)',
    structure: 'Agent + によって + V-passive',
    explanation:
      'In passive sentences about creating, discovering or founding, the agent is marked with によって rather than に: この絵はピカソによって描かれた. It is formal and typical of written explanations. によって also means “depending on” and “by means of”, which are separate uses.',
    functions: ['passive', 'means-methods'],
    examples: [
      ex('この 寺は 有名な 大工に よって 建てられた。', 'This temple was built by a famous carpenter.', 'この てらは ゆうめいな だいくに よって たてられた。'),
      ex('電話は ベルに よって 発明されました。', 'The telephone was invented by Bell.', 'でんわは べるに よって はつめいされました。'),
    ],
  },
  'n4m-g-6ddc2a': {
    structure: 'Plain form (N / Na without だ) + かどうか',
    explanation:
      'Embeds a yes/no question inside a sentence: “whether (or not) ~”. With a question word, use か alone instead: 何時に来るか分からない. It is typically followed by 分からない, 知らない or 確認する.',
    examples: [
      ex('明日 行けるか どうか 分からない。', "I don't know whether I can go tomorrow.", 'あした いけるか どうか わからない。'),
      ex('この 答えが 正しいか どうか 確かめて ください。', 'Please check whether this answer is correct.', 'この こたえが ただしいか どうか たしかめて ください。'),
    ],
  },
  'n4m-g-0bcaec': {
    structure: 'V-ます stem + 始める',
    explanation:
      'Attached to a verb stem, 始める marks the start of an action: 読み始める “start reading”. It works for both deliberate actions and natural events (雨が降り始めた). 〜出す (降り出す) is similar but stresses suddenness.',
    examples: [
      ex('去年から 日本語を 習い始めました。', 'I started learning Japanese last year.', 'きょねんから にほんごを ならいはじめました。'),
      ex('桜が 咲き始めた。', 'The cherry blossoms have started to bloom.', 'さくらが さきはじめた。'),
    ],
  },
  'n4m-g-67b83f': {
    meaning: 'finish ~ing',
    structure: 'V-ます stem + 終わる',
    explanation:
      'Marks the end of an action: 読み終わる “finish reading”. It suits actions with a clear end point. 終える (書き終える) is a little more formal and deliberate; てしまう adds completion with feeling.',
    examples: [
      ex('この 本は もう 読み終わった。', "I've already finished reading this book.", 'この ほんは もう よみおわった。'),
      ex('食べ終わったら、お皿を 洗って ください。', "When you've finished eating, please wash your plate.", 'たべおわったら、おさらを あらって ください。'),
    ],
  },
  'n4m-g-f03b64': {
    structure: 'N / V + とか、N / V + とか',
    explanation:
      'Gives examples from a longer list, casually: “things like A and B”. It is the spoken counterpart of や〜など, and unlike や it can follow verbs and whole clauses. A single とか also softens a suggestion: コーヒーとか飲む?',
    examples: [
      ex('休みの 日は 映画とか 買い物とかに 行きます。', 'On my days off I go to things like movies and shopping.', 'やすみの ひは えいがとか かいものとかに いきます。'),
      ex('野菜とか 果物とか、もっと 食べた ほうが いいよ。', 'You should eat more things like vegetables and fruit.', 'やさいとか くだものとか、もっと たべた ほうが いいよ。'),
    ],
  },
  'n4m-g-673dd8': {
    structure: 'Person が + いらっしゃる（いらっしゃいます）',
    explanation:
      'The respectful verb for いる, 来る and 行く, used about superiors and customers. Its polite form is irregular: いらっしゃいます, not いらっしゃります. Never use it about yourself; the humble counterparts are おる, 参る and 伺う.',
    examples: [
      ex('社長は 今 会議室に いらっしゃいます。', 'The company president is in the meeting room now.', 'しゃちょうは いま かいぎしつに いらっしゃいます。'),
      ex('先生は 何時に いらっしゃいますか。', 'What time will the teacher be coming?', 'せんせいは なんじに いらっしゃいますか。'),
    ],
  },
  'n4m-g-d6fe4f': {
    meaning: 'because ~ / because not ~ (te-form of cause)',
    structure: 'V / Adj-て（なくて）, + feeling or state',
    explanation:
      'The te-form can give a cause, most naturally before a feeling or state the speaker cannot control: 会えなくて寂しい “I’m lonely because I can’t see you”. The second clause cannot be a request or an intention; for those use から or ので.',
    examples: [
      ex('ニュースを 聞いて、驚きました。', 'I was surprised to hear the news.', 'にゅーすを きいて、おどろきました。'),
      ex('意味が 分からなくて、困りました。', "I was stuck because I didn't understand the meaning.", 'いみが わからなくて、こまりました。'),
    ],
  },
  'n4m-g-32542e': {
    meaning: 'to receive (humble); said before eating',
    structure: 'N + を + いただきます',
    explanation:
      'The humble verb for もらう (and also for 食べる / 飲む): the speaker receives something from a superior. As a set phrase before a meal it expresses thanks for the food. The humble verb for giving is 差し上げる.',
    functions: ['reverent-humble', 'benefit'],
    examples: [
      ex('先生から 手紙を いただきました。', 'I received a letter from my teacher.', 'せんせいから てがみを いただきました。'),
      ex('では、いただきます。', "Well then, let's eat.", 'では、いただきます。'),
    ],
  },
  'n4m-g-518e40': {
    structure: 'V-dict / V-ない + ようにする（している／してください）',
    explanation:
      'ようにする is an effort to make something happen or not; ようにしている is the resulting habit; ようにしてください asks someone to take care to do it, softer than a direct てください. The verb before ように is often a potential or negative form.',
    functions: ['action-effort', 'request'],
    examples: [
      ex('明日は 遅れないように してください。', "Please make sure you're not late tomorrow.", 'あしたは おくれないように してください。'),
      ex('毎日 早く 寝るように しています。', 'I make a point of going to bed early every day.', 'まいにち はやく ねるように しています。'),
    ],
  },
  'n4m-g-477fcb': {
    structure: 'V-て形 + くださいませんか',
    explanation:
      'A polite request phrased as a negative question: “wouldn’t you please ~?”. It is softer than てください and suits strangers and superiors. ていただけませんか is equally polite and very common.',
    functions: ['request'],
    examples: [
      ex('もう一度 説明して くださいませんか。', 'Would you please explain it once more?', 'もういちど せつめいして くださいませんか。'),
      ex('写真を 撮って くださいませんか。', 'Would you mind taking a photo for us?', 'しゃしんを とって くださいませんか。'),
    ],
  },
  'n4m-g-8385bd': {
    meaning: 'have just done ~',
    structure: 'V-た形 + ばかりだ',
    explanation:
      'Says an action happened very recently in the speaker’s feeling, which may be minutes or months: 日本に来たばかりです “I’ve only just come to Japan”. It differs from たところ, which pins the exact moment right after the action.',
    functions: ['immediately-after'],
    examples: [
      ex('さっき 起きた ばかりだ。', "I've only just woken up.", 'さっき おきた ばかりだ。'),
      ex('買った ばかりの 傘を なくした。', "I lost the umbrella I'd just bought.", 'かった ばかりの かさを なくした。'),
    ],
  },
  'n4m-g-72cfbd': {
    structure: '全然 + negative',
    explanation:
      'A strong negative adverb: “not at all”. Standard usage pairs it with a negative; casual speech also uses it with positives to mean “totally” (全然大丈夫), which textbooks treat as informal. あまり〜ない is the weaker “not very”.',
    functions: ['negative', 'emphasize-negative'],
    examples: [
      ex('昨日は 全然 寝られなかった。', "I couldn't sleep at all last night.", 'きのうは ぜんぜん ねられなかった。'),
      ex('彼の 話は 全然 分かりません。', "I don't understand what he says at all.", 'かれの はなしは ぜんぜん わかりません。'),
    ],
  },
  'n4m-g-302c2d': {
    meaning: 'what should I ~?; you just need to ~',
    structure: 'Question word + V-ば + いいですか',
    explanation:
      'Asks for advice about what to do: “what should I ~?”, interchangeable with たらいいですか. In the affirmative, ばいい means “you just need to ~”: ここを押せばいい “you just press here”.',
    functions: ['advice'],
    examples: [
      ex('この 書類は どこに 出せば いいですか。', 'Where should I hand in this form?', 'この しょるいは どこに だせば いいですか。'),
      ex('分からない ときは 誰に 聞けば いいですか。', "Who should I ask when I don't understand?", 'わからない ときは だれに きけば いいですか。'),
    ],
  },
  'n4m-g-dfe0cc': {
    meaning: "right?; isn't it? (seeking agreement)",
    structure: 'Plain form (N / Na without だ) + でしょう？ / だろう？',
    explanation:
      'With rising intonation, でしょう asks the listener to agree with something the speaker is fairly sure of: “it’s X, right?”. This differs from the falling-tone guess “probably”. Casually it becomes でしょ?, and among men だろ?.',
    functions: ['confirm'],
    examples: [
      ex('この 映画、面白かった でしょう？', 'That movie was good, wasn’t it?', 'この えいが、おもしろかった でしょう？'),
      ex('君も 行く だろう？', "You're coming too, right?", 'きみも いく だろう？'),
    ],
  },
  'n4m-g-6b2532': {
    structure: 'N + が + 必要だ（必要です）',
    explanation:
      'States that something is needed. The person or purpose that needs it takes に or には: 子どもには睡眠が必要だ. For an action use V + 必要がある. いる (お金がいる) says the same thing more casually.',
    examples: [
      ex('旅行には パスポートが 必要です。', 'You need a passport to travel.', 'りょこうには ぱすぽーとが ひつようです。'),
      ex('この 仕事には 経験が 必要だ。', 'This job requires experience.', 'この しごとには けいけんが ひつようだ。'),
    ],
  },
  'n4m-g-aff765': {
    meaning: 'like / hate doing ~',
    structure: 'V-dict + のが + 好き / 嫌い / 上手 / 下手',
    explanation:
      'の turns a verb into a noun so it can be the object of a feeling or skill word: 歌うのが好き “I like singing”. こと fits many of the same slots, but with 好き, 上手 and 得意 の is the most natural in speech.',
    functions: ['feel', 'describe'],
    examples: [
      ex('私は 料理を するのが 好きです。', 'I like cooking.', 'わたしは りょうりを するのが すきです。'),
      ex('朝 早く 起きるのが 嫌いだ。', 'I hate getting up early.', 'あさ はやく おきるのが きらいだ。'),
    ],
  },
  'n4m-g-413775': {
    structure: 'V / Adj-て形 + よかった（なくてよかった）',
    explanation:
      'Expresses relief or gladness about something that happened: “I’m glad (that) ~”. なくてよかった means “I’m glad it didn’t ~”. The regretful opposite is ばよかった (“I should have”).',
    examples: [
      ex('日本に 来てよかった。', "I'm glad I came to Japan.", 'にほんに きてよかった。'),
      ex('事故に 遭わなくて よかったね。', "Good thing you didn't get into an accident.", 'じこに あわなくて よかったね。'),
    ],
  },
  'n4m-g-702e5b': {
    structure: 'V-て形 + いただけませんか',
    explanation:
      'One of the most polite common request forms: the potential of いただく in a negative question, literally “can I not receive your doing ~?”. It suits superiors, customers and strangers. ていただけますか is slightly less deferential.',
    functions: ['request'],
    examples: [
      ex('少し 待って いただけませんか。', 'Could you possibly wait a moment?', 'すこし まって いただけませんか。'),
      ex('この 資料を 見て いただけませんか。', 'Would you be so kind as to look at this document?', 'この しりょうを みて いただけませんか。'),
    ],
  },
  'n4m-g-7f030d': {
    structure: 'N の / V-dict + 途中で（途中に）',
    explanation:
      'Means “partway through a journey or activity”. 途中で is for something that happens at a point on the way (途中で雨が降った); 途中に says where something is located along the way (駅へ行く途中にコンビニがある). 途中まで is “partway”.',
    examples: [
      ex('会社へ 行く 途中で 財布を 落とした。', 'I dropped my wallet on the way to work.', 'かいしゃへ いく とちゅうで さいふを おとした。'),
      ex('映画の 途中で 寝てしまった。', 'I fell asleep in the middle of the movie.', 'えいがの とちゅうで ねてしまった。'),
    ],
  },
  'n4m-g-407d50': {
    meaning: "I'm sorry for ~ing",
    structure: 'V-て形 + すみません（すみませんでした）',
    explanation:
      'Apologises for a specific action, with the te-form giving the reason: “sorry for ~”. It can also thank someone who went to trouble: 来てもらってすみません. More formal: て申し訳ありません.',
    functions: ['feel'],
    examples: [
      ex('遅れて すみません。', "Sorry I'm late.", 'おくれて すみません。'),
      ex('夜 遅く 電話して すみませんでした。', "I'm sorry for calling so late at night.", 'よる おそく でんわして すみませんでした。'),
    ],
  },
  'n4m-g-771037': {
    meaning: 'forgot to ~',
    structure: 'V-dict + のを忘れた',
    explanation:
      'の makes the verb a noun object of 忘れる: “I forgot to ~”. Compare V-た + ことを忘れる, forgetting a fact or experience. 〜のを忘れないで is the everyday reminder.',
    functions: ['regret'],
    examples: [
      ex('薬を 飲むのを 忘れた。', 'I forgot to take my medicine.', 'くすりを のむのを わすれた。'),
      ex('電気を 消すのを 忘れないでね。', "Don't forget to turn off the lights.", 'でんきを けすのを わすれないでね。'),
    ],
  },
  'n4m-g-501a42': {
    structure: 'N / Na + ではない（じゃない／ではありません）',
    explanation:
      'The negative of だ: “is not”. ではない is written or formal, じゃない spoken; the polite forms are ではありません and じゃないです. い-adjectives never take it: 高くない, not 高いではない.',
    examples: [
      ex('彼は 学生では ない。', 'He is not a student.', 'かれは がくせいでは ない。'),
      ex('この 部屋は あまり 静かじゃ ありません。', "This room isn't very quiet.", 'この へやは あまり しずかじゃ ありません。'),
    ],
  },
  'n4m-g-8139a8': {
    meaning: "haven't ~ (yet); isn't ~ing",
    structure: 'V-て形 + いない（いません）',
    explanation:
      'The negative of ている: “is not ~ing now” or “has not (yet) ~”. For actions expected to happen, Japanese uses ていない where English uses “haven’t ~”: まだ来ていない. Plain 来ない would mean “won’t come”.',
    examples: [
      ex('彼は まだ 来ていない。', "He hasn't come yet.", 'かれは まだ きていない。'),
      ex('今は 雨が 降っていません。', "It isn't raining now.", 'いまは あめが ふっていません。'),
    ],
  },
  'n4m-g-81167d': {
    meaning: 'could you ~ (for me)?',
    structure: 'V-て形 + もらえる？／もらえますか／もらえませんか',
    explanation:
      'A request built from the potential of もらう: “could I get you to ~?”. もらえる? is casual, もらえますか polite, もらえませんか softer still. The bare もらえるか is blunt and masculine.',
    functions: ['request'],
    examples: [
      ex('ちょっと 手伝って もらえる？', 'Could you give me a hand?', 'ちょっと てつだって もらえる？'),
      ex('この 荷物を 預かって もらえますか。', 'Could you look after this bag for me?', 'この にもつを あずかって もらえますか。'),
    ],
  },
  'n4m-g-a95f84': {
    structure: 'Plain / polite form + けれども（けれど／けど）',
    explanation:
      'Joins two contrasting clauses: “~, but ~”. けれども is the full, slightly formal form; けれど and けど are progressively more casual. It also softens a statement left hanging: ちょっと聞きたいんですけど….',
    examples: [
      ex('高かった けれども、買って しまった。', 'It was expensive, but I bought it anyway.', 'たかかった けれども、かって しまった。'),
      ex('行きたい けれども、時間が ない。', "I want to go, but I don't have time.", 'いきたい けれども、じかんが ない。'),
    ],
  },
  'n4m-g-6bdf4c': {
    structure: 'V-て形 + はどうか（はどうですか／はいかがですか）',
    explanation:
      'Suggests an action for someone to consider: “how about ~?”. It sounds more measured than たらどう and suits written proposals and meetings. The polite version is てはいかがですか.',
    functions: ['advice', 'invite-suggest'],
    examples: [
      ex('一度 専門家に 相談しては どうか。', 'Why not consult an expert?', 'いちど せんもんかに そうだんしては どうか。'),
      ex('少し 休まれては いかがですか。', 'How about taking a little rest?', 'すこし やすまれては いかがですか。'),
    ],
  },
  'n4m-g-176c8a': {
    structure: '次のように + V（書く／説明する／なる）',
    explanation:
      'Introduces what comes next in a text or talk: “as follows”. It is formal and common in instructions, reports and exam questions. 以下のように is the more written synonym.',
    functions: ['explain'],
    examples: [
      ex('手順は 次のように なります。', 'The procedure is as follows.', 'てじゅんは つぎのように なります。'),
      ex('次のように 答えて ください。', 'Please answer as follows.', 'つぎのように こたえて ください。'),
    ],
  },
  'n4m-g-93acc0': {
    meaning: 'very; greatly (polite)',
    structure: 'たいへん + Adj / V',
    explanation:
      'As an adverb, たいへん means “very, greatly” and is more formal than とても: たいへんお世話になりました. It is common in apologies and thanks. As a na-adjective it means “hard / serious” (たいへんな仕事).',
    functions: ['level'],
    examples: [
      ex('たいへん 申し訳 ございません。', 'I am terribly sorry.', 'たいへん もうしわけ ございません。'),
      ex('この 本は たいへん 役に 立ちました。', 'This book was extremely helpful.', 'この ほんは たいへん やくに たちました。'),
    ],
  },
  'n4m-g-3baf82': {
    meaning: "I'll have someone do ~; let's get someone to ~",
    structure: 'Person に + V-て + もらおう',
    explanation:
      'The volitional form of てもらう: the speaker decides to have someone do something for them, “I’ll get X to ~”. It states an intention rather than asking the listener directly; もらおうか asks for agreement.',
    functions: ['request', 'intent'],
    examples: [
      ex('分からない ところは 先生に 教えて もらおう。', "I'll ask the teacher to explain the parts I don't understand.", 'わからない ところは せんせいに おしえて もらおう。'),
      ex('修理は 専門の 人に やって もらおう。', "Let's have a professional do the repairs.", 'しゅうりは せんもんの ひとに やって もらおう。'),
    ],
  },
  'n4m-g-b8294f': {
    meaning: 'a bit more; (もうちょっとで) almost',
    structure: 'もうちょっと + Adj / V / N',
    explanation:
      'The casual form of もう少し: “a bit more”. もうちょっとで means “almost”: もうちょっとで電車に乗り遅れるところだった “I nearly missed the train”.',
    functions: ['amount'],
    examples: [
      ex('もうちょっと 安い のは ありませんか。', 'Do you have anything a bit cheaper?', 'もうちょっと やすい のは ありませんか。'),
      ex('もうちょっとで 終わるから、待ってて。', "I'm nearly done, so wait for me.", 'もうちょっとで おわるから、まってて。'),
    ],
  },
  'n4m-g-f600c2': {
    meaning: 'nothing (at all)',
    structure: '何も + negative',
    explanation:
      '何も with a negative means “nothing (at all)”. The particles が and を disappear: 何も食べない. Other particles stay before も: 何にも, 何とも. With an affirmative verb, 何も means something else (“there is no need to go that far”).',
    functions: ['negative'],
    examples: [
      ex('今朝から 何も 食べていない。', "I haven't eaten anything since this morning.", 'けさから なにも たべていない。'),
      ex('何も 心配しなくて いいよ。', "You don't need to worry about anything.", 'なにも しんぱいしなくて いいよ。'),
    ],
  },
  'n4m-g-27b800': {
    meaning: 'had (already) done ~',
    structure: 'V-て + しまっていた',
    explanation:
      'The past of てしまっている: by a point in the past, something had already happened, often with regret or surprise. It combines completion (しまう) with a resulting state (いた): 着いたときには、バスはもう出てしまっていた.',
    functions: ['finish', 'regret'],
    examples: [
      ex('気が ついた ときには、もう 電車は 出て しまって いた。', 'By the time I noticed, the train had already left.', 'きが ついた ときには、もう でんしゃは でて しまって いた。'),
      ex('帰ったら、ケーキは 全部 食べられて しまって いた。', 'When I got home, the cake had all been eaten.', 'かえったら、けーきは ぜんぶ たべられて しまって いた。'),
    ],
  },
  'n4m-g-b3d03a': {
    meaning: "I hope it doesn't ~",
    structure: 'V-ない + といい（ですね／なあ）',
    explanation:
      'Expresses the hope that something will not happen: “I hope it doesn’t ~”. Said to the listener as といいですね it sounds sympathetic (“let’s hope not, for your sake”). The positive is V-dict + といい.',
    functions: ['wish'],
    examples: [
      ex('明日は 雨が 降らないと いいですね。', "Let's hope it doesn't rain tomorrow.", 'あしたは あめが ふらないと いいですね。'),
      ex('道が 混んで いないと いいなあ。', "I hope the roads aren't busy.", 'みちが こんで いないと いいなあ。'),
    ],
  },
  'n4m-g-568017': {
    meaning: 'let me ~ (and I am grateful)',
    structure: 'Person が + V-causative-て + くれる',
    explanation:
      'Someone allows the speaker to do something, and the speaker is grateful: “let me ~”. It is the causative plus てくれる. As a request, させてくれない? (casual) or させてください asks for permission.',
    functions: ['allow', 'benefit'],
    examples: [
      ex('父は 一人で 旅行させてくれた。', 'My father let me travel on my own.', 'ちちは ひとりで りょこうさせてくれた。'),
      ex('私にも 少し 運転させて くれない？', "Won't you let me drive a bit too?", 'わたしにも すこし うんてんさせて くれない？'),
    ],
  },
  'n4m-g-0376f5': {
    meaning: 'why not try ~?; how about trying ~?',
    structure: 'V-て形 + みたらどう（ですか／かな）',
    explanation:
      'Combines てみる (“try doing”) with たらどう (“how about if”), so it suggests the listener give something a try. It is friendly advice between equals; to a superior use てみてはいかがですか. Without みる, たらどう suggests the action itself rather than an experiment.',
    functions: ['advice', 'invite-suggest'],
    examples: [
      ex('一度 先生に 相談してみたら どう？', 'Why not try talking it over with your teacher?', 'いちど せんせいに そうだんしてみたら どう？'),
      ex('そんなに 気に なるなら、本人に 聞いてみたら どうですか。', "If it bothers you that much, why don't you try asking them directly?", 'そんなに きに なるなら、ほんにんに きいてみたら どうですか。'),
    ],
  },
  'n4m-g-e0ea88': {
    structure: 'V-ない形 → V-なければ／なくちゃ／ないと + いけない／だめだ',
    explanation:
      'Literally “if you do not ~, it will not do”: must, have to. ないといけない is the everyday spoken form; なければならない is the written or formal one, and なくちゃ / ないと alone are the casual clipped versions. だめだ in place of いけない sounds more personal and emphatic.',
    functions: ['necessary-obligation'],
    examples: [
      ex('明日は 早く 起きないと いけない。', 'I have to get up early tomorrow.', 'あしたは はやく おきないと いけない。'),
      ex('薬は 毎日 飲まないと だめですよ。', 'You must take the medicine every day.', 'くすりは まいにち のまないと だめですよ。'),
    ],
  },
  'n4m-g-3a2041': {
    meaning: "it's not (that) ~, but …; not to ~, but …",
    structure: 'N + じゃないが（ではないが）, …',
    explanation:
      'Sets up a disclaimer before the real point: “It is not ~, but …”. Fixed openers such as 自慢じゃないが (“not to brag, but”) and 言い訳じゃないが (“this is no excuse, but”) are the common uses. The tone is casual and slightly masculine; ではないが or じゃないけど is softer.',
    functions: ['contrast'],
    examples: [
      ex('自慢じゃないが、料理は 得意なんだ。', "Not to brag, but I'm a good cook.", 'じまんじゃないが、りょうりは とくいなんだ。'),
      ex('言い訳じゃないが、電車が 止まって いたんだ。', "It's no excuse, but the trains had stopped.", 'いいわけじゃないが、でんしゃが とまって いたんだ。'),
    ],
  },
  'n4m-g-0d5e06': {
    meaning: "unless you ~, you can't …; if you don't ~, … won't",
    structure: 'V-ない形 + と、… + V-ない（できない／分からない）',
    explanation:
      'A negative condition followed by a negative result: without A, B does not happen. It states a requirement and is close to なければ〜ない. The second half is typically a potential or 分からない, e.g. 予約しないと入れない “you can’t get in without booking”.',
    functions: ['condition-requirement', 'negative'],
    examples: [
      ex('予約しないと その 店には 入れない。', "You can't get into that restaurant without a reservation.", 'よやくしないと その みせには はいれない。'),
      ex('実際に 使ってみないと 分からない。', "You won't know until you actually try it.", 'じっさいに つかってみないと わからない。'),
    ],
  },
  'n4m-g-18306f': {
    meaning: 'to make something ~ (change its state on purpose)',
    structure: 'N を + Adj-く／Na-adj に + する',
    explanation:
      'Someone deliberately changes the state of something: い-adjectives take く (小さくする), な-adjectives and nouns take に (きれいにする, 半分にする). Compare 〜くなる / 〜になる, which describe a change that simply happens.',
    functions: ['modify', 'action-effort'],
    examples: [
      ex('テレビの 音を 小さく して ください。', 'Please turn the TV down.', 'てれびの おとを ちいさく して ください。'),
      ex('お客さんが 来るから、部屋を きれいに しよう。', "We have guests coming, so let's tidy the room.", 'おきゃくさんが くるから、へやを きれいに しよう。'),
    ],
  },
  'n4m-g-82504f': {
    structure: 'Plain form (N / Na without だ) + だろうか',
    explanation:
      'A question addressed mainly to oneself: “I wonder if ~”. It is reflective and fairly written; in speech people usually say かな or でしょうか. In essays it can also pose a rhetorical question the writer goes on to answer.',
    functions: ['speculation'],
    examples: [
      ex('この 計画は 本当に うまく いくだろうか。', 'I wonder whether this plan will really work.', 'この けいかくは ほんとうに うまく いくだろうか。'),
      ex('彼は なぜ 何も 言わなかったのだろうか。', 'I wonder why he said nothing.', 'かれは なぜ なにも いわなかったのだろうか。'),
    ],
  },
  'n4m-g-99e6b1': {
    meaning: "I'd like to ~ (so could you help?)",
    structure: 'V-ます stem + たいんですが（…）',
    explanation:
      'A soft opener for a request or inquiry: the speaker states what they want and leaves the rest unsaid, inviting the listener to help. The ん gives the reason-for-talking nuance and が trails off politely. It is the standard way to start at a counter or on the phone.',
    functions: ['desire', 'request'],
    examples: [
      ex('すみません、この 荷物を 送りたいんですが。', "Excuse me, I'd like to send this package.", 'すみません、この にもつを おくりたいんですが。'),
      ex('来週の 予約を 変えたいんですが、大丈夫ですか。', "I'd like to change next week's booking. Is that possible?", 'らいしゅうの よやくを かえたいんですが、だいじょうぶですか。'),
    ],
  },
  'n4m-g-5a5b8d': {
    meaning: 'no matter how much (often) ~; whether ~ or ~',
    structure: 'V-て形 + も + (same) V-て形 + も',
    explanation:
      'Repeating the same verb in ても stresses that the effort keeps failing: 洗っても洗っても落ちない “however much I wash it, it won’t come off”. With two different verbs or adjectives it means “whether A or B, the result is the same”.',
    functions: ['concessions', 'emphasize'],
    examples: [
      ex('洗っても 洗っても、汚れが 落ちない。', "No matter how much I wash it, the stain won't come out.", 'あらっても あらっても、よごれが おちない。'),
      ex('雨が 降っても 雪が 降っても、試合は 行われる。', 'Rain or snow, the match will go ahead.', 'あめが ふっても ゆきが ふっても、しあいは おこなわれる。'),
    ],
  },
  'n4m-g-4a8027': {
    structure: 'V-て形 + くれない（か／？）',
    explanation:
      'A request phrased as a negative question: “won’t you ~ for me?”. てくれない? with rising intonation is casual and gentle; てくれないか is blunter and masculine. The polite forms are てくれませんか and, more politely, てくださいませんか.',
    functions: ['request'],
    examples: [
      ex('ちょっと 窓を 開けて くれない？', "Could you open the window a bit?", 'ちょっと まどを あけて くれない？'),
      ex('悪いけど、駅まで 送って くれないか。', "Sorry, but would you drive me to the station?", 'わるいけど、えきまで おくって くれないか。'),
    ],
  },
  'n4m-g-c1b64d': {
    meaning: '(a new ~) is built / opens (at a place); ~ is ready',
    structure: 'Place + に + N + が + できる（できた）',
    explanation:
      'Besides “can do”, できる means “come into being”: a building, shop or road is completed, or something is ready. The place takes に and the new thing takes が: 駅前にコンビニができた. It also covers food and work being finished: 晩ご飯ができたよ.',
    functions: ['result', 'finish'],
    examples: [
      ex('駅の 前に 新しい 図書館が できた。', 'A new library has opened in front of the station.', 'えきの まえに あたらしい としょかんが できた。'),
      ex('晩ご飯が できたよ。早く おいで。', "Dinner's ready. Come and eat.", 'ばんごはんが できたよ。はやく おいで。'),
    ],
  },
  'n4m-g-084748': {
    meaning: "I'll show you (I will definitely ~); to show someone how",
    structure: 'V-て形 + みせる',
    explanation:
      'Two uses. As a declaration, the speaker vows to succeed as if to prove it to others: 絶対に合格してみせる. As a plain action, someone demonstrates how something is done: やってみせる “show by doing it”. The first use is emotional and sounds like a public promise.',
    functions: ['determination-decision', 'intent'],
    examples: [
      ex('来年こそ 絶対に 合格して みせる。', "Next year I'll pass, just you watch.", 'らいねんこそ ぜったいに ごうかくして みせる。'),
      ex('先生が まず 実際に やって みせて くれた。', 'The teacher first showed us by actually doing it.', 'せんせいが まず じっさいに やって みせて くれた。'),
    ],
  },
  'n4m-g-916b4d': {
    structure: 'N + に + します（する／しよう）',
    explanation:
      'Announces a choice: “I’ll have ~ / I’ve decided on ~”. It is the standard way to order in a restaurant (コーヒーにします) and to settle plans. For a decision about an action, use V-dict + ことにする; になる instead of する means the decision was made for you.',
    functions: ['decision'],
    examples: [
      ex('私は コーヒーに します。', "I'll have coffee.", 'わたしは こーひーに します。'),
      ex('旅行は 京都に しよう。', "Let's make Kyoto our trip.", 'りょこうは きょうとに しよう。'),
    ],
  },
  'n4m-g-d8cef4': {
    meaning: 'perhaps; possibly (…may be the case)',
    structure: 'あるいは + clause + かもしれない',
    explanation:
      'Used as an adverb, あるいは means “possibly, perhaps” and prepares a guess that ends in かもしれない. It is somewhat literary; in conversation もしかしたら does the same job. Do not confuse it with the conjunction あるいは “or”, which links two nouns or clauses.',
    functions: ['speculation'],
    examples: [
      ex('あるいは 彼の 言う ことが 正しいのかもしれない。', 'Perhaps what he says is right.', 'あるいは かれの いう ことが ただしいのかもしれない。'),
      ex('この 雲だと、あるいは 夕方から 雨に なるかもしれない。', 'With these clouds, it may possibly rain from the evening.', 'この くもだと、あるいは ゆうがたから あめに なるかもしれない。'),
    ],
  },
  'n4m-g-14f095': {
    structure: 'N / Na-adj + じゃないだろうか（ではないだろうか）',
    explanation:
      'A cautious opinion framed as a question: “isn’t it ~? / I suspect it is ~”. It attaches directly to nouns and な-adjectives; after verbs and い-adjectives the form is んじゃないだろうか. ではないだろうか is the written version and is common in essays for stating a view modestly.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('それは 大きな 問題じゃないだろうか。', "Isn't that a serious problem?", 'それは おおきな もんだいじゃないだろうか。'),
      ex('この 部屋は 一人には 少し 広すぎるのではないだろうか。', 'I suspect this room is a bit too big for one person.', 'この へやは ひとりには すこし ひろすぎるのではないだろうか。'),
    ],
  },
  'n4m-g-a83836': {
    meaning: 'to leave (something) as it is; keep it ~',
    structure: 'V-た形／N の／Adj + まま + にする（しておく）',
    explanation:
      'Someone deliberately leaves a state unchanged: 窓を開けたままにする “leave the window open”. With ておく it adds “for a purpose”. Compare ままになる (it stays that way without anyone acting) and plain まま (“in the state of”).',
    functions: ['continuity'],
    examples: [
      ex('暑いので、窓を 開けた ままに して おいて ください。', "It's hot, so please leave the window open.", 'あついので、まどを あけた ままに して おいて ください。'),
      ex('料理は 温かい ままに して おきたい。', 'I want to keep the food warm.', 'りょうりは あたたかい ままに して おきたい。'),
    ],
  },
  'n4m-g-69525f': {
    structure: 'Plain form (Na / N + な) + んじゃないだろうか',
    explanation:
      'A careful guess: “could it be that ~? / I rather think ~”. The ん (の) lets it follow verbs and い-adjectives, which じゃないだろうか alone cannot. It is less pushy than んじゃないか and a common way to offer an opinion without asserting it; のではないだろうか is the written form.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('彼は もう 家を 出たんじゃないだろうか。', "Couldn't he have already left home?", 'かれは もう いえを でたんじゃないだろうか。'),
      ex('その 値段なら、もっと 売れるんじゃないだろうか。', 'At that price, surely it would sell better.', 'その ねだんなら、もっと うれるんじゃないだろうか。'),
    ],
  },
  'n4m-g-628b30': {
    meaning: 'please do ~ for (someone else)',
    structure: 'Person に + V-て形 + あげて ください',
    explanation:
      'Asks the listener to do a favour for a third person: “please ~ for him / her”. あげる shows the favour goes away from the speaker. Speaking about your own family or someone younger this is natural; for a superior, use てさしあげてください.',
    functions: ['request', 'benefit'],
    examples: [
      ex('妹に 宿題を 教えて あげて ください。', 'Please help my little sister with her homework.', 'いもうとに しゅくだいを おしえて あげて ください。'),
      ex('困って いる 人が いたら、助けて あげて ね。', "If someone's in trouble, help them out, OK?", 'こまって いる ひとが いたら、たすけて あげて ね。'),
    ],
  },
  'n4m-g-8fc93d': {
    structure: 'N + か何か（かなにか）',
    explanation:
      'Makes a noun vague: “~ or something (like that)”. It softens offers and guesses: お茶か何か飲む? “Want tea or something?”. For people use か誰か, for places か何処か; かなんか is the casual pronunciation.',
    functions: ['vague'],
    examples: [
      ex('お茶か 何か 飲みませんか。', 'Would you like tea or something?', 'おちゃか なにか のみませんか。'),
      ex('風邪か 何かで 休んで いるらしい。', "Apparently he's off with a cold or something.", 'かぜか なにかで やすんで いるらしい。'),
    ],
  },
  'n4m-g-e59595': {
    meaning: "shall I have (someone) ~?; I'll have you ~ (firm)",
    structure: 'Person に + V-て形 + もらおうか',
    explanation:
      'The volitional てもらおう with か. Said to a third party it proposes getting someone to act: 専門家に見てもらおうか “shall we have an expert look at it?”. Said directly to the listener, it is a firm, sometimes intimidating demand: 説明してもらおうか “let’s hear you explain”.',
    functions: ['request', 'invite-suggest'],
    examples: [
      ex('この パソコン、店の 人に 見て もらおうか。', "Shall we have someone at the shop look at this computer?", 'この ぱそこん、みせの ひとに みて もらおうか。'),
      ex('どういう ことか、きちんと 説明して もらおうか。', "Let's have you explain properly what this is about.", 'どういう ことか、きちんと せつめいして もらおうか。'),
    ],
  },
  'n4m-g-a70e21': {
    meaning: 'all that is left is ~; now just ~',
    structure: 'あとは + N／V-dict + だけ（だ）',
    explanation:
      'あと (“remaining”) with だけ says only one step is left: “now all that’s left is to ~”. It is used when a task is nearly finished. あとは〜ばいい (“you only need to ~”) is a close variant that gives instructions.',
    functions: ['limit'],
    examples: [
      ex('荷物は 全部 詰めた。あとは 寝る だけだ。', "I've packed everything. Now all that's left is to sleep.", 'にもつは ぜんぶ つめた。あとは ねる だけだ。'),
      ex('あとは 名前を 書く だけですよ。', 'All you need to do now is write your name.', 'あとは なまえを かく だけですよ。'),
    ],
  },
  'n4m-g-f0c0d0': {
    meaning: 'A makes B look ~',
    structure: 'A が + B を + Adj-く／Na-adj に + 見せる',
    explanation:
      '見せる here is “make appear”: A (clothes, lighting, a hairstyle) makes B look a certain way. い-adjectives take く and な-adjectives take に, as with 〜くする. Compare 〜く見える, where B simply looks that way with no cause named.',
    functions: ['similarity-degree', 'modify'],
    examples: [
      ex('その 髪型は 彼女を 若く 見せる。', 'That hairstyle makes her look young.', 'その かみがたは かのじょを わかく みせる。'),
      ex('明るい 色の カーテンが 部屋を 広く 見せて いる。', 'The bright curtains make the room look bigger.', 'あかるい いろの かーてんが へやを ひろく みせて いる。'),
    ],
  },
  'n4m-g-f90c7c': {
    meaning: 'in various ways; for one reason or another',
    structure: '何かと（なにかと）+ V／Adj',
    explanation:
      'An adverb meaning “in all sorts of ways” without naming them. It is typical in greetings and thanks: 何かとお世話になりました “thank you for all your help”. 何かと忙しい means busy with this and that.',
    functions: ['vague'],
    examples: [
      ex('引っ越したばかりで、何かと 忙しい。', "I've just moved, so I'm busy with one thing and another.", 'ひっこしたばかりで、なにかと いそがしい。'),
      ex('今年は 何かと お世話に なりました。', 'Thank you for all your help this year.', 'ことしは なにかと おせわに なりました。'),
    ],
  },
  'n4m-g-5029fe': {
    meaning: 'to remain ~ (left in that state)',
    structure: 'V-た形／N の + まま + に なる（なっている）',
    explanation:
      'A state has been left as it was, usually longer than it should: 借りたままになっている “it is still borrowed (and not returned)”. Unlike ままにする, no one is deliberately keeping it that way. The ている form is most common.',
    functions: ['continuity'],
    examples: [
      ex('友達に 借りた 本が 借りた ままに なって いる。', "I still haven't returned the book I borrowed from my friend.", 'ともだちに かりた ほんが かりた ままに なって いる。'),
      ex('去年の 計画は 途中の ままに なって いる。', "Last year's plan is still left half-done.", 'きょねんの けいかくは とちゅうの ままに なって いる。'),
    ],
  },
  'n4m-g-adbdf2': {
    meaning: 'to go home (back) to do ~',
    structure: 'V-ます stem + に + 帰る（戻る）',
    explanation:
      'The purpose pattern stem + に with a verb of returning: “go back in order to ~”. Like 〜に行く and 〜に来る, it only works with movement verbs. 忘れ物を取りに帰る “go home to get something I left” is a typical use.',
    functions: ['purpose-goal', 'direction'],
    examples: [
      ex('昼ご飯を 食べに 家へ 帰ります。', "I'm going home to have lunch.", 'ひるごはんを たべに いえへ かえります。'),
      ex('財布を 忘れたので、取りに 帰った。', 'I forgot my wallet, so I went back to get it.', 'さいふを わすれたので、とりに かえった。'),
    ],
  },
  'n4m-g-3db9ae': {
    meaning: 'polite language (です／ます, お／ご)',
    structure: 'V-ます／です + お／ご + N（お茶, ご家族）',
    explanation:
      '丁寧語 is the neutral polite layer of keigo: です and ます endings plus the beautifying prefixes お and ご. It shows politeness to the listener without raising or lowering anyone, unlike 尊敬語 and 謙譲語. お generally goes on native words and ご on Sino-Japanese ones: お茶, ご家族.',
    functions: ['reverent-humble'],
    examples: [
      ex('駅は あちらに あります。', 'The station is over there.', 'えきは あちらに あります。'),
      ex('ご家族は お元気ですか。', 'Is your family well?', 'ごかぞくは おげんきですか。'),
    ],
  },
  'n4m-g-a4cfe0': {
    meaning: 'the same as ~',
    structure: 'N + と 同じ（だ／N）／N + と 同じように',
    explanation:
      'Says two things match: A は B と同じだ. Before a noun it stays 同じ with no な: 私と同じ本. と同じように means “in the same way as”. For partial likeness use に似ている, and for difference と違う.',
    functions: ['similarity-degree', 'compare'],
    examples: [
      ex('私も 田中さんと 同じ 意見です。', 'I have the same opinion as Tanaka.', 'わたしも たなかさんと おなじ いけんです。'),
      ex('この 時計は 父の ものと 同じだ。', 'This watch is the same as my father’s.', 'この とけいは ちちの ものと おなじだ。'),
    ],
  },
  'n4m-g-17bd5c': {
    meaning: 'made from ~ (から) / made of ~ (で)',
    structure: 'Material + から／で + 作る（作られる）',
    explanation:
      'Both mark a material, but から is used when the raw material is transformed and no longer visible (wine from grapes), and で when you can still see it in the product (a desk of wood). The passive 作られている is common in descriptions.',
    functions: ['means-methods'],
    examples: [
      ex('日本酒は 米から 作られます。', 'Sake is made from rice.', 'にほんしゅは こめから つくられます。'),
      ex('この 机は 木で 作って あります。', 'This desk is made of wood.', 'この つくえは きで つくって あります。'),
    ],
  },
  'n4m-g-b26282': {
    meaning: 'do you know that ~?',
    structure: 'Plain form (Na / N + な) + のを 知っていますか',
    explanation:
      'の turns the clause into a noun so it can be the object of 知っている: “do you know that ~?”. For a known fact the answer uses 知っています; “I didn’t know” is 知りませんでした. ことを can replace のを in writing.',
    functions: ['asked'],
    examples: [
      ex('来週 テストが ある のを 知って いますか。', 'Do you know there is a test next week?', 'らいしゅう てすとが ある のを しって いますか。'),
      ex('彼が 会社を 辞めた のを 知って いた？', 'Did you know he quit the company?', 'かれが かいしゃを やめた のを しって いた？'),
    ],
  },
  'n4m-g-9d6e1c': {
    structure: 'N／clause + の + に 気が つく（気づく）',
    explanation:
      'To notice or realise something, usually suddenly. The thing noticed takes に, and a clause is nominalised with の or こと. 気づく is the contracted form; for realising a truth after thought, 分かる or 悟る may fit better.',
    functions: ['feel'],
    examples: [
      ex('駅に 着いてから、傘を 忘れた のに 気が ついた。', 'After I got to the station, I realised I had forgotten my umbrella.', 'えきに ついてから、かさを わすれた のに きが ついた。'),
      ex('彼女の 髪型が 変わった ことに 気が つきましたか。', 'Did you notice her hairstyle had changed?', 'かのじょの かみがたが かわった ことに きが つきましたか。'),
    ],
  },
  'n4m-g-0adaa5': {
    meaning: 'could you please let me ~?',
    structure: 'V-causative-て形 + いただけませんか',
    explanation:
      'A very polite request for permission: literally “could I humbly receive your letting me ~?”. The speaker is the one who acts. It is common at work: 今日は早く帰らせていただけませんか. Less formal: させてもらえませんか; direct: させてください.',
    functions: ['request-permission', 'reverent-humble'],
    examples: [
      ex('今日は 少し 早く 帰らせて いただけませんか。', 'Could you please let me go home a little early today?', 'きょうは すこし はやく かえらせて いただけませんか。'),
      ex('その 資料を コピーさせて いただけませんか。', 'May I please make a copy of that document?', 'その しりょうを こぴーさせて いただけませんか。'),
    ],
  },
  'n4m-g-3a5e09': {
    meaning: 'honorific (respectful) language',
    structure: 'お + V-stem + に なる／V-られる／special verbs（いらっしゃる, 召し上がる）',
    explanation:
      '尊敬語 raises the person who acts, so it is used only for other people’s actions, never your own. There are three routes: special verbs (いらっしゃる, おっしゃる, 召し上がる), お〜になる, and the passive-shaped られる. Using it for yourself is a common mistake; your own actions take 謙譲語.',
    functions: ['reverent-humble'],
    examples: [
      ex('社長は もう お帰りに なりました。', 'The president has already left for home.', 'しゃちょうは もう おかえりに なりました。'),
      ex('先生は 何時ごろ いらっしゃいますか。', 'What time will the teacher be coming?', 'せんせいは なんじごろ いらっしゃいますか。'),
    ],
  },
  'n4m-g-a7f692': {
    meaning: 'I wonder ~; something or other',
    structure: '何かしら（なにかしら）／clause + かしら',
    explanation:
      'かしら is a soft “I wonder”, traditionally feminine though older men use it too; 何かしら means “I wonder what it is”. As an adverb, 何かしら also means “something or other”: 何かしら理由がある. かな is the neutral equivalent.',
    functions: ['vague', 'speculation'],
    examples: [
      ex('この 音は 何かしら。', 'I wonder what this noise is.', 'この おとは なにかしら。'),
      ex('毎日 何かしら 新しい ことを 学んで いる。', 'Every day I learn something or other new.', 'まいにち なにかしら あたらしい ことを まなんで いる。'),
    ],
  },
  'n4m-g-7a9445': {
    meaning: '(someone of higher status) kindly does ~ for me / us',
    structure: 'Person が + V-て形 + くださる（くださいます）',
    explanation:
      'The respectful form of てくれる: a superior or someone you respect does a favour for the speaker or the speaker’s group. The giver is the subject, marked with が or は. The masu form is くださいます, not くださります. Seen from the receiver’s side, the same event is ていただく.',
    functions: ['benefit', 'reverent-humble'],
    examples: [
      ex('先生が 推薦状を 書いて くださいました。', 'My teacher kindly wrote me a letter of recommendation.', 'せんせいが すいせんじょうを かいて くださいました。'),
      ex('部長が 駅まで 車で 送って くださった。', 'The manager kindly drove me to the station.', 'ぶちょうが えきまで くるまで おくって くださった。'),
    ],
  },
  'n4m-g-568cbf': {
    meaning: 'something; anything (in questions)',
    structure: '何か（なにか）+ V／何か + Adj + N',
    explanation:
      '何か is the indefinite “something”; in questions it becomes “anything”. が and を are usually dropped after it (何か飲む?), and a describing adjective follows it: 何か冷たいもの “something cold”. With a negative, use 何も instead: 何も飲まない.',
    functions: ['vague'],
    examples: [
      ex('何か 冷たい ものを 飲みたい。', 'I want something cold to drink.', 'なにか つめたい ものを のみたい。'),
      ex('何か 質問は ありますか。', 'Are there any questions?', 'なにか しつもんは ありますか。'),
    ],
  },
  'n4m-g-c720da': {
    structure: 'Plain / polite form + けれど, …',
    explanation:
      'The middle register of the けれども → けれど → けど scale: “but, although”. It is common in writing that stays friendly and in careful speech. At the end of a sentence it softens a statement or leaves a request hanging for the listener to pick up.',
    functions: ['contrast'],
    examples: [
      ex('少し 高い けれど、この 靴に しよう。', "They're a bit expensive, but I'll take these shoes.", 'すこし たかい けれど、この くつに しよう。'),
      ex('道を 聞きたいんです けれど…。', "I'd like to ask the way, if I may...", 'みちを ききたいんです けれど…。'),
    ],
  },
  'n4m-g-36941f': {
    meaning: '~ or more; at least; (以上です) that is all',
    structure: 'Number / N + 以上（いじょう）',
    explanation:
      '以上 means “that amount or more”, and unlike English “more than” it includes the number itself: 18歳以上 is 18 and over. Its opposite is 以下 (“or less”). At the end of a speech or list, 以上です means “that’s all”.',
    functions: ['amount', 'compare'],
    examples: [
      ex('この 映画は 十八歳 以上しか 見られない。', 'Only people aged 18 and over can see this film.', 'この えいがは じゅうはっさい いじょうしか みられない。'),
      ex('報告は 以上です。', 'That is the end of my report.', 'ほうこくは いじょうです。'),
    ],
  },
  'n4m-g-f323ba': {
    meaning: 'not even one ~; not ~ at all',
    structure: 'Counter / 少し／一度 + も + negative',
    explanation:
      'も after a minimal amount (一人, 一つ, 一度, 少し) with a negative means “not even that much”: nothing at all. It is stronger than a plain negative. With question words the same shape makes 誰も, 何も, どこも “no one, nothing, nowhere”.',
    functions: ['emphasize-negative', 'negative'],
    examples: [
      ex('パーティーには 一人も 来なかった。', 'Not a single person came to the party.', 'ぱーてぃーには ひとりも こなかった。'),
      ex('昨日は 少しも 眠れなかった。', "I couldn't sleep at all last night.", 'きのうは すこしも ねむれなかった。'),
    ],
  },
  'n4m-g-316fd1': {
    meaning: '~ is impossible; ~ is too much (to ask)',
    structure: 'N／V-dict + の + は 無理だ（無理です）',
    explanation:
      '無理 is something beyond what can reasonably be done. A task is nominalised with の and marked with は. 無理です is also the everyday way to refuse politely but firmly, and 無理しないで means “don’t overdo it”.',
    functions: ['ability', 'refuse'],
    examples: [
      ex('一日で この 本を 全部 読む のは 無理だ。', "It's impossible to read this whole book in one day.", 'いちにちで この ほんを ぜんぶ よむ のは むりだ。'),
      ex('すみません、明日までは ちょっと 無理です。', "I'm sorry, but by tomorrow is not really possible.", 'すみません、あしたまでは ちょっと むりです。'),
    ],
  },
  'n4m-g-7cd68e': {
    meaning: "(so) that's why ~; I told you so",
    structure: 'だから + clause（だから 言ったでしょう）',
    explanation:
      'At the start of a sentence だから means “so, therefore”. In conversation it often carries irritation: “that’s what I’m saying” or “I told you so” (だから言ったのに). The polite form is ですから; the neutral written connector is そのため.',
    functions: ['cause-reason', 'conclude'],
    examples: [
      ex('だから 言ったでしょう。傘を 持って いけって。', 'I told you so. I said to take an umbrella.', 'だから いったでしょう。かさを もって いけって。'),
      ex('明日は 試験だ。だから 今日は 早く 寝る。', "I have an exam tomorrow, so I'm going to bed early tonight.", 'あしたは しけんだ。だから きょうは はやく ねる。'),
    ],
  },
  'n4m-g-580e5c': {
    meaning: "why don't we ~?; isn't it ~?",
    structure: 'V-ない／Adj-くない + か（？）',
    explanation:
      'A plain negative question works two ways. With a verb it is an invitation: 一緒に行かない? “Why don’t we go together?”. With an adjective it asks for agreement: 寒くない? “Isn’t it cold?”. The version with か (行かないか) is blunt and masculine; ませんか is the polite form.',
    functions: ['invite-suggest', 'confirm'],
    examples: [
      ex('週末、一緒に 映画を 見に 行かない？', "Why don't we go and see a film this weekend?", 'しゅうまつ、いっしょに えいがを みに いかない？'),
      ex('この 部屋、ちょっと 寒くない？', "Isn't this room a bit cold?", 'この へや、ちょっと さむくない？'),
    ],
  },
  'n4m-g-12b30c': {
    meaning: 'shall I ~?; (unsure) whether to ~',
    structure: 'V-volitional（よう／おう）+ か（どうか／どうしようか 迷う）',
    explanation:
      'The volitional plus か turns an intention into a question. On its own it offers help or asks for agreement: 手伝おうか “shall I help?”. Followed by どうか, どうしようか or 迷う, it describes being torn between options: 行こうかどうか迷っている.',
    functions: ['selective', 'invite-suggest'],
    examples: [
      ex('重そうだね。一つ 持とうか。', 'That looks heavy. Shall I carry one?', 'おもそうだね。ひとつ もとうか。'),
      ex('留学しようか どうか、まだ 迷って いる。', "I still can't decide whether to study abroad.", 'りゅうがくしようか どうか、まだ まよって いる。'),
    ],
  },
  'n4m-g-142e26': {
    meaning: '~ or something (softened suggestion)',
    structure: 'N（＋particle）+ でも + V（ませんか／しよう）',
    explanation:
      'でも after a noun makes it one example among possibilities, so invitations sound less pushy: お茶でも飲みませんか “shall we have tea or something?”. The speaker does not really mean only that item. It replaces が and を but follows other particles: 公園にでも行こう.',
    functions: ['invite-suggest', 'vague'],
    examples: [
      ex('疲れたね。コーヒーでも 飲もうか。', "We're tired. Shall we have a coffee or something?", 'つかれたね。こーひーでも のもうか。'),
      ex('暇なら、公園にでも 行かない？', "If you're free, why don't we go to the park or somewhere?", 'ひまなら、こうえんにでも いかない？'),
    ],
  },
  'n4m-g-8e86ae': {
    meaning: 'both ~ and ~ (does A, and also B)',
    structure: 'N1 も + V-ば + N2 も + V',
    explanation:
      'Lists two things a person does or has, stressing that there is more than one: 歌も歌えばピアノも弾く “she sings and plays the piano too”. The ば here is not a real condition but a listing device. With a negative (A も V-なければ B も V-ない) it means “neither ~ nor ~”.',
    functions: ['add', 'listed'],
    examples: [
      ex('彼女は 歌も 歌えば、ピアノも 弾く。', 'She sings, and she plays the piano too.', 'かのじょは うたも うたえば、ぴあのも ひく。'),
      ex('この 町には 駅も なければ、店も ない。', 'This town has neither a station nor any shops.', 'この まちには えきも なければ、みせも ない。'),
    ],
  },
  'n4m-g-ea250f': {
    meaning: 'both ~ and ~; (with negative) neither ~ nor ~',
    structure: 'N1 も + N2 も + predicate',
    explanation:
      'Repeating も after two nouns includes both: 兄も姉も医者だ “my brother and sister are both doctors”. With a negative verb it excludes both: 肉も魚も食べない. が and を disappear before も, but other particles stay: 東京にも大阪にも.',
    functions: ['add'],
    examples: [
      ex('兄も 姉も 東京に 住んで います。', 'Both my brother and my sister live in Tokyo.', 'あにも あねも とうきょうに すんで います。'),
      ex('彼は 肉も 魚も 食べない。', 'He eats neither meat nor fish.', 'かれは にくも さかなも たべない。'),
    ],
  },
  'n4m-g-475479': {
    structure: 'Plain form (N / Na without だ) + だろう（↘ guess／↗ confirm）',
    explanation:
      'The plain form of でしょう. With falling intonation it is a guess, “probably”, often with たぶん or きっと. With rising intonation it asks the listener to agree: 疲れただろう? “you must be tired, right?”. In speech だろう sounds masculine; women and polite speakers use でしょう.',
    functions: ['speculation', 'confirm'],
    examples: [
      ex('明日は たぶん 晴れる だろう。', 'It will probably be sunny tomorrow.', 'あしたは たぶん はれる だろう。'),
      ex('長い 旅で 疲れた だろう？', 'You must be tired after that long trip, right?', 'ながい たびで つかれた だろう？'),
    ],
  },
  'n4m-g-bb679a': {
    meaning: 'A, for its (their) part; A in its own way',
    structure: 'N + は + (same) N + で',
    explanation:
      'Repeating the noun with は〜で sets it apart from what was just said: “as for A, A has its own situation”. 私は私で忙しい means “I have my own things keeping me busy (so don’t expect me to help)”. It implies each party is separate and deserves its own consideration.',
    functions: ['perspective-way', 'contrast'],
    examples: [
      ex('姉は 姉で、仕事が 忙しいらしい。', 'My sister, for her part, seems busy with work.', 'あねは あねで、しごとが いそがしいらしい。'),
      ex('都会には 都会で いい ところが ある。', 'The city has its good points in its own way.', 'とかいには とかいで いい ところが ある。'),
    ],
  },
  'n4m-g-044527': {
    meaning: 'if ~; when ~ (conditional ば)',
    structure: 'V-ば形（行けば）／Adj-ければ／N・Na + なら(ば)',
    explanation:
      'The ば conditional states a condition and its result: if A, then B. It is most natural when B is a desirable outcome or a general truth, and it often appears in advice as 〜ばいい (“you just need to ~”). Unlike たら, the main clause cannot easily be a past one-off event.',
    functions: ['condition'],
    examples: [
      ex('この ボタンを 押せば、ドアが 開きます。', 'If you press this button, the door opens.', 'この ぼたんを おせば、どあが あきます。'),
      ex('分からなければ、先生に 聞けば いい。', "If you don't understand, you just need to ask the teacher.", 'わからなければ、せんせいに きけば いい。'),
    ],
  },
  'n4m-g-5191e0': {
    meaning: 'it seems ~; it looks as if ~ (inference)',
    structure: 'Plain form (Na + な／N + の) + ようだ（ようです）',
    explanation:
      'ようだ draws a conclusion from what the speaker observes: “it seems, apparently”. It is more objective and written than みたいだ, its spoken equivalent. Compare らしい, which leans on what one has heard, and stem + そうだ, an impression from appearance alone.',
    functions: ['speculation', 'similarity-degree'],
    examples: [
      ex('電気が 消えて いる。誰も いない ようだ。', 'The lights are off. It seems no one is in.', 'でんきが きえて いる。だれも いない ようだ。'),
      ex('彼は 風邪を ひいた ようです。', 'He seems to have caught a cold.', 'かれは かぜを ひいた ようです。'),
    ],
  },
  'n4m-g-cd7024': {
    meaning: 'if (it is the case that) ~, then … (casual)',
    structure: 'Plain form (Na / N + な) + んじゃ, … (negative result)',
    explanation:
      'A casual contraction of のでは: “if it’s the case that ~”. The result is almost always negative or a complaint: こんなに寒いんじゃ外で遊べない. On its own at the start of a sentence, じゃ (or それじゃ) means “well then”.',
    functions: ['condition'],
    examples: [
      ex('こんなに 雨が 降ってるんじゃ、出かけられないね。', "If it's raining this hard, we can't go out.", 'こんなに あめが ふってるんじゃ、でかけられないね。'),
      ex('君が 来ないんじゃ、パーティーも つまらない。', "If you aren't coming, the party will be boring.", 'きみが こないんじゃ、ぱーてぃーも つまらない。'),
    ],
  },
  'n4m-g-82113a': {
    meaning: 'because ~; so (casual ので)',
    structure: 'Plain form (Na / N + な) + んで, …',
    explanation:
      'The spoken contraction of ので: it gives a reason softly, often as an excuse. It is common in casual but still polite speech: 用事があるんで、先に失礼します. In careful writing, use ので.',
    functions: ['cause-reason'],
    examples: [
      ex('ちょっと 用事が ある んで、先に 帰ります。', "I have something to take care of, so I'll head home first.", 'ちょっと ようじが ある んで、さきに かえります。'),
      ex('道が 混んでた んで、遅く なりました。', 'The roads were busy, so I was late.', 'みちが こんでた んで、おそく なりました。'),
    ],
  },
  'n4m-g-57efd7': {
    meaning: 'to let (someone) do ~ (as a favour)',
    structure: 'Person に + V-causative-て形 + あげる',
    explanation:
      'The causative in its permissive sense plus あげる: the speaker (or the subject) kindly allows someone to do what they want. It is used for children, juniors or pets. Toward a superior it sounds condescending, and asking for permission yourself is させてください.',
    functions: ['allow', 'benefit'],
    examples: [
      ex('今日は 子供に 好きな だけ 遊ばせて あげよう。', "Today let's let the kids play as much as they like.", 'きょうは こどもに すきな だけ あそばせて あげよう。'),
      ex('弟に 私の ゲームを 使わせて あげた。', 'I let my little brother use my game.', 'おとうとに わたしの げーむを つかわせて あげた。'),
    ],
  },
  'n4m-g-1e9a5d': {
    meaning: "it's already ~",
    structure: 'もう + N（time／season／age）+ だ',
    explanation:
      'もう with a noun predicate notices that a point has already been reached, often with surprise: もう十二時だ “it’s already midnight”. It pairs naturally with time words, seasons and ages. The opposite expectation, “not yet”, is まだ〜だ.',
    functions: ['time', 'finish'],
    examples: [
      ex('えっ、もう 十二時だ。早く 寝なきゃ。', "What, it's already midnight. I need to get to bed.", 'えっ、もう じゅうにじだ。はやく ねなきゃ。'),
      ex('もう 春ですね。桜が 咲き始めました。', "It's spring already. The cherry blossoms have started to bloom.", 'もう はるですね。さくらが さきはじめました。'),
    ],
  },
  'n4m-g-646fd5': {
    meaning: '~ and ~, so … (listing reasons)',
    structure: 'Plain form + し、plain form + し、（それで）…',
    explanation:
      'し lists reasons and implies there may be more, then the conclusion follows, sometimes after それで or だから. Even a single し can suggest “among other reasons”. It sounds conversational; in writing, use て or ので.',
    functions: ['cause-reason', 'listed'],
    examples: [
      ex('雨も 降ってる し、疲れた し、今日は 家に いよう。', "It's raining and I'm tired, so I'll stay home today.", 'あめも ふってる し、つかれた し、きょうは いえに いよう。'),
      ex('この 店は 安い し、おいしい し、それで いつも 混んで いる。', "This place is cheap and good, so it's always crowded.", 'この みせは やすい し、おいしい し、それで いつも こんで いる。'),
    ],
  },
  'n4m-g-660ed8': {
    meaning: '~, (and) … (introducing a topic before the main point)',
    structure: 'Plain form (Na / N + な) + んだが, …',
    explanation:
      'The explanatory ん plus the soft が: the speaker lays out the background and then comes to the point, usually a request or question. It is masculine or businesslike; んですが is the polite form and んだけど the casual one.',
    functions: ['story-topic'],
    examples: [
      ex('ちょっと 相談が ある んだが、今 いいか。', 'There is something I want to talk over. Do you have a moment?', 'ちょっと そうだんが ある んだが、いま いいか。'),
      ex('駅に 行きたい んだが、この 道で 合って いるかな。', "I'm trying to get to the station. Is this the right road?", 'えきに いきたい んだが、この みちで あって いるかな。'),
    ],
  },
  'n4m-g-31f34d': {
    meaning: '~, and ~, and besides …',
    structure: 'Plain form + し、plain form + し、（それに）…',
    explanation:
      'Here し piles up points of the same kind, usually all positive or all negative, and それに adds one more on top: “and what’s more”. It is used to build an argument or a recommendation. The points should point the same way; mixing praise and complaints sounds odd.',
    functions: ['add', 'listed'],
    examples: [
      ex('この 部屋は 明るい し、広い し、それに 駅にも 近い。', "This room is bright and spacious, and it's close to the station too.", 'この へやは あかるい し、ひろい し、それに えきにも ちかい。'),
      ex('彼は 優しい し、よく 働く し、みんなに 好かれて いる。', "He's kind and hardworking, and everyone likes him.", 'かれは やさしい し、よく はたらく し、みんなに すかれて いる。'),
    ],
  },
  'n4m-g-dac064': {
    meaning: 'doing ~ is (what I like / am good at)',
    structure: 'V-dict + のが + 好き／上手／得意／苦手 + です',
    explanation:
      'の turns a verb phrase into a noun so it can take が before adjectives of liking and skill: 泳ぐのが好きです “I like swimming”. こと can replace の here (読むことが好き) and sounds a little more formal; の is the everyday choice. The person is marked with は: 私は料理するのが得意です.',
    functions: ['describe'],
    examples: [
      ex('私は 本を 読む のが 好きです。', 'I like reading books.', 'わたしは ほんを よむ のが すきです。'),
      ex('兄は 絵を かく のが 上手です。', 'My older brother is good at drawing.', 'あには えを かく のが じょうずです。'),
    ],
  },
  'n4m-g-156c8a': {
    meaning: 'to go / come (in order) to ~',
    structure: 'V-ます stem／する-noun + に + 行く／来る／帰る',
    explanation:
      'The purpose of a movement: stem + に before 行く, 来る or 帰る. With する-nouns, drop する: 買い物に行く. The pattern works only with verbs of motion; for other purposes use ために or ように.',
    functions: ['purpose-goal'],
    examples: [
      ex('デパートへ 服を 買いに 行きました。', 'I went to the department store to buy clothes.', 'でぱーとへ ふくを かいに いきました。'),
      ex('友達が 家に 遊びに 来ます。', 'A friend is coming over to hang out.', 'ともだちが いえに あそびに きます。'),
    ],
  },
  'n4m-g-f03351': {
    structure: 'V-ます stem + 方（かた）',
    explanation:
      'Adding 方 to a verb stem makes a noun meaning “the way of ~ing”. The object then takes の instead of を: 漢字の書き方 “how to write kanji”. It covers both instructions (使い方) and personal style (話し方 “way of speaking”).',
    functions: ['means-methods'],
    examples: [
      ex('この 機械の 使い方を 教えて ください。', 'Please show me how to use this machine.', 'この きかいの つかいかたを おしえて ください。'),
      ex('彼の 話し方は とても 分かりやすい。', 'His way of speaking is very easy to follow.', 'かれの はなしかたは とても わかりやすい。'),
    ],
  },
  'n4m-g-4c6375': {
    meaning: 'it is that ~ (explanation); the fact is ~ (emphatic)',
    structure: 'Plain form (Na / N + な) + のだ（んだ／のです）',
    explanation:
      'のだ presents a statement as an explanation or as the real point behind a situation: 遅れたのは、電車が止まったからなのだ. It can also sound emphatic, stating a conclusion or a firm resolve: 私は行くのだ. In speech it contracts to んだ / んです.',
    functions: ['explain', 'emphasize'],
    examples: [
      ex('遅れて すみません。電車が 止まって いた のです。', "Sorry I'm late. The trains had stopped, you see.", 'おくれて すみません。でんしゃが とまって いた のです。'),
      ex('誰が 何と 言おうと、私は 行く のだ。', "Whatever anyone says, I'm going.", 'だれが なんと いおうと、わたしは いく のだ。'),
    ],
  },
  'n4m-g-efa6af': {
    structure: 'V-て形／Adj-くて + も；N・Na + でも',
    explanation:
      'ても states that the result does not change even if the condition holds: “even if ~, even though ~”. It is often paired with たとえ (“even supposing”) or いくら (“however much”). For nouns and な-adjectives the form is でも: 雨でも行く.',
    functions: ['concessions'],
    examples: [
      ex('雨が 降っても、試合は 中止に なりません。', "Even if it rains, the match won't be cancelled.", 'あめが ふっても、しあいは ちゅうしに なりません。'),
      ex('いくら 高くても、この かばんが 欲しい。', 'No matter how expensive it is, I want this bag.', 'いくら たかくても、この かばんが ほしい。'),
    ],
  },
  'n4m-g-4804a5': {
    meaning: '(V-stem + 上がる) completely; to the top; up',
    structure: 'V-ます stem + 上がる（あがる）',
    explanation:
      'As the second half of a compound, 上がる adds either upward movement (立ち上がる “stand up”) or completion and intensity: 出来上がる “be finished”, 晴れ上がる “clear up completely”, 震え上がる “shake with fear”. It forms intransitive verbs; the transitive partner is 〜上げる.',
    functions: ['direction', 'finish'],
    examples: [
      ex('料理が やっと 出来上がった。', 'The meal is finally ready.', 'りょうりが やっと できあがった。'),
      ex('雨が 止んで、空は きれいに 晴れ上がった。', 'The rain stopped and the sky cleared up completely.', 'あめが やんで、そらは きれいに はれあがった。'),
    ],
  },
  'n4m-g-93c25c': {
    meaning: 'without even ~ing',
    structure: 'N + も + V-ない stem + ずに（する → せずに）',
    explanation:
      'ずに is the written form of ないで, “without doing”. Adding も to the object stresses that even the most basic thing was skipped: 朝ご飯も食べずに出かけた. The irregular form of する is せずに. In casual speech the same idea is 〜もしないで.',
    functions: ['negative', 'emphasize'],
    examples: [
      ex('彼は 朝ご飯も 食べずに 家を 出た。', 'He left home without even eating breakfast.', 'かれは あさごはんも たべずに いえを でた。'),
      ex('彼女は 何も 言わずに 部屋を 出て 行った。', 'She left the room without saying a word.', 'かのじょは なにも いわずに へやを でて いった。'),
    ],
  },
  'n4m-g-c79c56': {
    meaning: 'after ~; since ~; from now on (以後)',
    structure: 'Time / event + 以後；以後（、）+ clause',
    explanation:
      '以後 means “from that point onward”. After a time or event it marks the start of a period: 十時以後 “after ten o’clock”, 事故以後 “since the accident”. On its own it means “from now on” and is formal, as in the apology 以後気をつけます. 以降 is a close synonym, common in schedules.',
    functions: ['time-direction'],
    examples: [
      ex('夜 十時 以後は 電話を しないで ください。', 'Please do not call after ten at night.', 'よる じゅうじ いごは でんわを しないで ください。'),
      ex('申し訳 ありません。以後 気を つけます。', "I'm very sorry. I will be more careful from now on.", 'もうしわけ ありません。いご きを つけます。'),
    ],
  },
  'n4m-g-9bd5ff': {
    meaning: 'in order to ~; because of ~',
    structure: 'V-dict + ため（に）；plain past / Adj + ため（reason）',
    explanation:
      'After a dictionary-form verb, ため(に) states a purpose: 家を買うために貯金する. The subjects of both clauses should be the same and the verb volitional; otherwise use ように. After a past or stative clause, ため gives a cause in a formal tone: 雪が降ったため、電車が遅れた.',
    functions: ['purpose-goal', 'cause-reason'],
    examples: [
      ex('家を 買う ために、毎月 貯金して いる。', "I'm saving every month in order to buy a house.", 'いえを かう ために、まいつき ちょきんして いる。'),
      ex('大雪が 降った ため、電車が 遅れた。', 'The trains were delayed because of heavy snow.', 'おおゆきが ふった ため、でんしゃが おくれた。'),
    ],
  },
  'n4m-g-a5401f': {
    meaning: 'if / when ~, (then naturally) …',
    structure: 'V-dict／Adj／N・Na + だ + と, …',
    explanation:
      'と links a condition to a result that follows automatically or habitually: 春になると暖かくなる “when spring comes, it gets warm”. It suits natural laws, machines, directions and habits. The main clause cannot be a request, wish or invitation; use たら or ば for those.',
    functions: ['condition'],
    examples: [
      ex('春に なると、暖かく なります。', 'When spring comes, it gets warm.', 'はるに なると、あたたかく なります。'),
      ex('この 道を まっすぐ 行くと、駅が あります。', "If you go straight down this road, you'll find the station.", 'この みちを まっすぐ いくと、えきが あります。'),
    ],
  },
  'n4m-g-feb367': {
    meaning: '(V-stem + 上げる) up; completely (transitive)',
    structure: 'V-ます stem + 上げる（あげる）',
    explanation:
      'As the second part of a compound verb, 上げる adds upward motion (持ち上げる “lift up”) or carries an action through to completion (書き上げる “finish writing”, 仕上げる “finish off”). These compounds are transitive and take を; the intransitive partner is 〜上がる.',
    functions: ['direction', 'finish'],
    examples: [
      ex('重い 箱を 一人で 持ち上げた。', 'I lifted the heavy box up by myself.', 'おもい はこを ひとりで もちあげた。'),
      ex('レポートを 一晩で 書き上げた。', 'I finished writing the report in one night.', 'れぽーとを ひとばんで かきあげた。'),
    ],
  },
  'n4m-g-d8de02': {
    meaning: '~ away; go on ~ing (change moving away from now)',
    structure: 'V-て形 + いく（いきます）',
    explanation:
      'ていく shows movement or change heading away from the speaker or into the future: 消えていく “fade away”, 減っていく “keep decreasing”. With movement verbs it can also mean “do and then go”: 食べていく. Its mirror image, てくる, brings change toward the speaker or up to now.',
    functions: ['process', 'direction'],
    examples: [
      ex('これから 人口は 減って いく だろう。', 'The population will probably keep falling from now on.', 'これから じんこうは へって いく だろう。'),
      ex('飛行機が 雲の 中に 消えて いった。', 'The plane disappeared into the clouds.', 'ひこうきが くもの なかに きえて いった。'),
    ],
  },
  'n4m-g-f28543': {
    meaning: 'once; at some time (in the past)',
    structure: 'いつか + V-た（ことがある／ように）',
    explanation:
      'With a past verb, いつか refers to an unspecified time in the past: “once, some time ago”. いつか話したように means “as I told you once”. With a non-past verb the same word points to the future (“someday”), so the verb ending decides the direction.',
    functions: ['time', 'past-state'],
    examples: [
      ex('いつか 話した ように、来月 引っ越します。', "As I told you once, I'm moving next month.", 'いつか はなした ように、らいげつ ひっこします。'),
      ex('この 曲は いつか どこかで 聞いた ことが ある。', "I've heard this song somewhere before.", 'この きょくは いつか どこかで きいた ことが ある。'),
    ],
  },
  'n4m-g-145141': {
    meaning: 'to look ~; to be acting ~ (visible manner)',
    structure: 'V-ます stem／Adj stem + そうに + している',
    explanation:
      'そうに is the adverb form of the appearance そうだ, and している says the person is visibly behaving that way: 眠そうにしている “looks sleepy”. It describes someone else from the outside, so it is not used for yourself. Note いい becomes よさそう and ない becomes なさそう.',
    functions: ['similarity-degree', 'status'],
    examples: [
      ex('弟は 授業中 ずっと 眠そうに して いた。', 'My little brother looked sleepy all through class.', 'おとうとは じゅぎょうちゅう ずっと ねむそうに して いた。'),
      ex('子供たちは 楽しそうに して いる。', 'The children look like they are having fun.', 'こどもたちは たのしそうに して いる。'),
    ],
  },
  'n4m-g-9c8856': {
    meaning: 'for (the sake of) N; because of N',
    structure: 'N + の + ため（に／の N）',
    explanation:
      'With a noun, のため(に) means either “for the benefit of N” (家族のために働く) or, in a formal tone, “because of N” (事故のため電車が遅れた). Context decides which. Before another noun it is のための: 子供のための本 “a book for children”.',
    functions: ['purpose-goal', 'cause-reason'],
    examples: [
      ex('父は 家族の ために 毎日 働いて いる。', 'My father works every day for his family.', 'ちちは かぞくの ために まいにち はたらいて いる。'),
      ex('事故の ため、道路が 閉鎖されて います。', 'The road is closed because of an accident.', 'じこの ため、どうろが へいさされて います。'),
    ],
  },
  'n4m-g-e69e0e': {
    meaning: "I'd be grateful if you could ~",
    structure: 'V-て形 + もらえると ありがたい（です）',
    explanation:
      'A soft, indirect request: “if I could get you to ~, I would be thankful”. It sounds considerate because it states a feeling rather than giving an order. The more formal version is ていただけるとありがたいです; ありがたい can also become 助かる (“it would really help”).',
    functions: ['request', 'benefit'],
    examples: [
      ex('明日までに 返事を もらえると ありがたい。', "I'd be grateful if you could reply by tomorrow.", 'あしたまでに へんじを もらえると ありがたい。'),
      ex('少し 手伝って もらえると ありがたいんですが。', "I'd really appreciate it if you could help a little.", 'すこし てつだって もらえると ありがたいんですが。'),
    ],
  },
  'n4m-g-8cc4e7': {
    meaning: 'could you do ~ for (someone of mine)?',
    structure: 'Person に + V-て形 + やって もらえるか（もらえますか）',
    explanation:
      'The speaker asks the listener to do a favour for someone on the speaker’s side, usually younger or lower: “could you ~ for my son?”. やる marks the favour going to that third person and もらえるか makes the request. The plain もらえるか is casual and masculine; あげてもらえますか is gentler.',
    functions: ['request', 'benefit'],
    examples: [
      ex('息子に 数学を 教えて やって もらえるか。', 'Could you teach my son some maths?', 'むすこに すうがくを おしえて やって もらえるか。'),
      ex('うちの 犬を 散歩に 連れて いって やって もらえますか。', 'Could you take our dog for a walk?', 'うちの いぬを さんぽに つれて いって やって もらえますか。'),
    ],
  },
  'n4m-g-6c409e': {
    structure: 'V-dict／Adj + と いい（ですね／なあ）；V-dict + と いい（advice）',
    explanation:
      'Two uses. As a wish, といいですね / といいなあ hopes for something outside one’s control: 晴れるといいね. As advice, V-dict + といい says “you should, it would be good to”: 早く寝るといい. Compare ばいい (the minimum needed) and たらいい (advice or wish, more conversational).',
    functions: ['wish', 'advice'],
    examples: [
      ex('明日は 晴れると いいですね。', "I hope it's sunny tomorrow.", 'あしたは はれると いいですね。'),
      ex('風邪なら、今日は 早く 寝ると いいよ。', 'If you have a cold, you should go to bed early tonight.', 'かぜなら、きょうは はやく ねると いいよ。'),
    ],
  },
  'n4m-g-1b3183': {
    structure: 'V-て形 + くる（きます）',
    explanation:
      'てくる brings an action toward the speaker or up to the present. It can mean “go and do, then come back” (買ってくる), movement toward the speaker (走ってくる), a change that has developed until now (寒くなってきた), or something starting to happen (雨が降ってきた). Its partner ていく points away from now.',
    functions: ['process', 'direction'],
    examples: [
      ex('ちょっと コンビニで 飲み物を 買って くるね。', "I'll just go and get some drinks from the convenience store.", 'ちょっと こんびにで のみものを かって くるね。'),
      ex('だんだん 寒く なって きました。', "It's been getting colder and colder.", 'だんだん さむく なって きました。'),
    ],
  },
  'n4m-g-0c8bd6': {
    meaning: "don't have to ~; it's all right not to ~",
    structure: 'V-ない形 + でも いい（よい）',
    explanation:
      'A variant of なくてもいい: permission not to do something. ないでもいい is less common and a little old-fashioned or regional; なくてもいい is the standard form learners should produce. よい in place of いい makes it more formal and written.',
    functions: ['allow', 'negative'],
    examples: [
      ex('無理に 来ないでも いいよ。', "You don't have to come if it's too much.", 'むりに こないでも いいよ。'),
      ex('全部 答えないでも よい。', 'You need not answer every question.', 'ぜんぶ こたえないでも よい。'),
    ],
  },
  'n4m-g-67fa24': {
    meaning: 'before one knew it; at some point (unnoticed)',
    structure: 'いつか（＝いつの間にか）+ V-た／V-ていた',
    explanation:
      'In narrative and written style, いつか can mean that a change happened without anyone noticing when: いつか雨はやんでいた “at some point the rain had stopped”. Everyday speech uses いつの間にか for this. The verb is past or a resulting state, which is what separates it from “someday”.',
    functions: ['time', 'unexpected-outcome'],
    examples: [
      ex('話して いる うちに、いつか 外は 暗く なって いた。', 'While we talked, it had grown dark outside without our noticing.', 'はなして いる うちに、いつか そとは くらく なって いた。'),
      ex('本を 読みながら、いつか 眠って しまって いた。', 'While reading, I had fallen asleep before I knew it.', 'ほんを よみながら、いつか ねむって しまって いた。'),
    ],
  },
  'n4m-g-a8b4b5': {
    structure: 'いつか（は）+ V-dict／V-たい',
    explanation:
      'With a non-past verb, いつか means “some day, one day” in the future. Adding は makes it firmer, “sooner or later, eventually”: いつかは分かる. It often carries hope (いつか行きたい); for a specific but unknown near time, use そのうち.',
    functions: ['future-time'],
    examples: [
      ex('いつか 世界 一周 旅行を したい。', 'Someday I want to travel around the world.', 'いつか せかい いっしゅう りょこうを したい。'),
      ex('本当の ことは いつかは 分かる はずだ。', 'The truth is bound to come out sooner or later.', 'ほんとうの ことは いつかは わかる はずだ。'),
    ],
  },
  'n4m-g-0c6d7c': {
    meaning: 'things like ~ing and ~ing (examples of actions)',
    structure: 'V-dict + とか + V-dict + とか（する）',
    explanation:
      'とか lists actions (or nouns) as examples, implying there are others: 休みの日は本を読むとか映画を見るとかしている. It is casual; the more neutral version with verbs is たり〜たりする. A single とか also works to give one soft example.',
    functions: ['denote-by-example', 'listed'],
    examples: [
      ex('休みの 日は 本を 読むとか、映画を 見るとか して いる。', 'On my days off I do things like reading and watching films.', 'やすみの ひは ほんを よむとか、えいがを みるとか して いる。'),
      ex('少し 休むとか、水を 飲むとか したら どう？', 'Why not take a short break or drink some water or something?', 'すこし やすむとか、みずを のむとか したら どう？'),
    ],
  },
  'n4m-g-5aef53': {
    meaning: 'the ~ from the other day; that ~ (from before)',
    structure: 'いつかの + N',
    explanation:
      'いつかの refers to something from an unspecified earlier occasion that both speakers remember: いつかの約束 “that promise (from before)”. It is vaguer than この間の (“the other day’s”) and suits things neither side can date exactly.',
    functions: ['time', 'past-state'],
    examples: [
      ex('いつかの 約束、覚えて いますか。', 'Do you remember that promise from before?', 'いつかの やくそく、おぼえて いますか。'),
      ex('いつかの お礼に、今日は 私が ごちそうします。', "To thank you for last time, today's meal is on me.", 'いつかの おれいに、きょうは わたしが ごちそうします。'),
    ],
  },
  'n4m-g-d9a184': {
    meaning: 'when I ~, (I found that) …',
    structure: 'V-たら, … + V-た（discovery）',
    explanation:
      'With a past main clause, たら describes what the speaker discovered or what happened unexpectedly after acting: 窓を開けたら雪が降っていた. The main clause is outside the speaker’s control. と can be used the same way in narration; ば cannot.',
    functions: ['condition', 'unexpected-outcome'],
    examples: [
      ex('窓を 開けたら、雪が 降って いた。', 'When I opened the window, it was snowing.', 'まどを あけたら、ゆきが ふって いた。'),
      ex('家に 帰ったら、母から 手紙が 届いて いた。', 'When I got home, there was a letter from my mother.', 'いえに かえったら、ははから てがみが とどいて いた。'),
    ],
  },
  'n4m-g-b4a6c6': {
    meaning: 'to be made to ~ (against one’s will)',
    structure: 'V-causative-passive: る-verb → させられる；う-verb → わせられる／わされる；する → させられる；来る → 来させられる',
    explanation:
      'The causative-passive says the subject was forced to do something by someone else, and usually did not want to. The forcer is marked with に: 母に野菜を食べさせられた. う-verbs have a common short form (飲まされる, 待たされる), except those ending in す (話させられる).',
    functions: ['passive', 'forced'],
    examples: [
      ex('子供の ころ、母に 嫌いな 野菜を 食べさせられた。', 'As a child, my mother made me eat vegetables I hated.', 'こどもの ころ、ははに きらいな やさいを たべさせられた。'),
      ex('駅で 友達に 一時間も 待たされた。', 'My friend kept me waiting at the station for a whole hour.', 'えきで ともだちに いちじかんも またされた。'),
    ],
  },
  'n4m-g-bf798d': {
    meaning: 'as follows; as shown below (以下のように)',
    structure: '以下のように + V（書く／まとめる／なる）；以下の + N',
    explanation:
      '以下 means “below, the following” in a document, so 以下のように introduces the content that comes next. It is formal and written, common in notices, emails and reports. 次のように is its slightly less formal twin, and 上記のように (“as stated above”) points back instead.',
    functions: ['explain'],
    examples: [
      ex('会議の 予定を 以下のように 変更します。', 'The meeting schedule will change as follows.', 'かいぎの よていを いかのように へんこうします。'),
      ex('申し込み方法は 以下の とおりです。', 'The application procedure is as set out below.', 'もうしこみほうほうは いかの とおりです。'),
    ],
  },
  'n4m-nnnv-c73fdd': {
    structure: 'N1（causer）が + N2（doer）に + N3 を + V-causative（させる）',
    explanation:
      'When the caused action already has a を-object, the person made or allowed to act takes に, never a second を: 母が子供に野菜を食べさせる. Whether it means “make” or “let” depends on context. With intransitive verbs the doer can take を instead: 子供を走らせる.',
    functions: ['forced', 'allow'],
    examples: [
      ex('先生は 学生に 作文を 書かせた。', 'The teacher had the students write an essay.', 'せんせいは がくせいに さくぶんを かかせた。'),
      ex('父は 私に 車を 運転させて くれた。', 'My father let me drive the car.', 'ちちは わたしに くるまを うんてんさせて くれた。'),
    ],
  },
  'n4m-g-8e0e74': {
    meaning: 'because of ~; ~, and so …',
    structure: 'V-て／Adj-くて, …；N + で, …',
    explanation:
      'The て-form (and で after nouns) can link a cause to its result: 風邪をひいて学校を休んだ, 雨で試合が中止になった. The result is usually a feeling, a state or something outside anyone’s control. It cannot end in a request, invitation or intention; use から or ので for those.',
    functions: ['cause-reason'],
    examples: [
      ex('風邪を ひいて、学校を 休みました。', 'I caught a cold and stayed home from school.', 'かぜを ひいて、がっこうを やすみました。'),
      ex('大雨で、電車が 止まって しまった。', 'The trains stopped because of the heavy rain.', 'おおあめで、でんしゃが とまって しまった。'),
    ],
  },
  'n4m-g-085a3c': {
    meaning: "I'll try ~ing (and see)",
    structure: 'V-て形 + みます（みる）',
    explanation:
      'てみる means doing something to find out what it is like: “try it and see”. It is not about making an effort to succeed, which is ようとする. みます is the polite non-past, often a light promise to try: 聞いてみます “I’ll ask and see”.',
    functions: ['action-effort', 'experience'],
    examples: [
      ex('分からないので、先生に 聞いて みます。', "I don't know, so I'll try asking the teacher.", 'わからないので、せんせいに きいて みます。'),
      ex('この 靴、履いて みても いいですか。', 'May I try these shoes on?', 'この くつ、はいて みても いいですか。'),
    ],
  },
  'n4m-g-2f9adf': {
    meaning: '(sentence-final が) softening; trailing off politely',
    structure: 'Polite / plain form + が（…）',
    explanation:
      'Left at the end of a sentence, が does not really mean “but”: it softens what was said and leaves room for the listener to respond. It is common before requests and when hesitating: 少しお聞きしたいことがあるんですが…. けど is the casual version.',
    functions: ['speak'],
    examples: [
      ex('すみません、ちょっと お聞きしたい ことが あるんですが…。', "Excuse me, there's something I'd like to ask...", 'すみません、ちょっと おききしたい ことが あるんですが…。'),
      ex('明日は 少し 難しいと 思いますが…。', "I think tomorrow might be a little difficult...", 'あしたは すこし むずかしいと おもいますが…。'),
    ],
  },
  'n4m-g-853519': {
    meaning: 'before; previously; formerly (以前)',
    structure: '以前（は／に）+ V-た；time / event + 以前',
    explanation:
      '以前 on its own means “formerly, at one time”, a more formal 前に: 以前ここに住んでいた. After a time or event it means “before that point”, and it is the opposite of 以後. 以前より (“than before”) compares with the past.',
    functions: ['time', 'past-state'],
    examples: [
      ex('以前、この 近くに 住んで いました。', 'I used to live near here.', 'いぜん、この ちかくに すんで いました。'),
      ex('彼は 以前より ずっと 元気に なった。', 'He has become much healthier than before.', 'かれは いぜんより ずっと げんきに なった。'),
    ],
  },
  'n4m-g-390c8e': {
    structure: 'N の／V-た形／Adj + まま + だ（です）',
    explanation:
      'まま says a state has not changed: 町は昔のままだ “the town is just as it was”. With a past verb it often implies something was left undone: ドアが開いたままだ “the door is still open”. Before a verb it becomes ままで or まま: 靴を履いたまま入る.',
    functions: ['status', 'continuity'],
    examples: [
      ex('この 町は 子供の ころの ままだ。', 'This town is just as it was when I was a child.', 'この まちは こどもの ころの ままだ。'),
      ex('テレビが つけた ままですよ。', 'You left the TV on.', 'てれびが つけた ままですよ。'),
    ],
  },
  'n4m-g-165903': {
    meaning: "I wish ~ would …; I'm hoping ~",
    structure: 'V-ない + かな（あ）',
    explanation:
      'A negative question to oneself that expresses longing: 早く夏休みにならないかなあ “I can’t wait for summer vacation”. With てくれない, it hints at a wish about someone else: 誰か手伝ってくれないかな. It is casual and often sounds like thinking aloud.',
    functions: ['wish'],
    examples: [
      ex('早く 夏休みに ならないかなあ。', "I wish summer vacation would hurry up and come.", 'はやく なつやすみに ならないかなあ。'),
      ex('誰か 手伝って くれないかな。', 'I wish someone would help me.', 'だれか てつだって くれないかな。'),
    ],
  },
  'n4m-g-eb39dc': {
    meaning: 'so; thereupon (in response to that situation)',
    structure: 'Situation。そこで、+ action taken',
    explanation:
      'そこで connects a situation with the action someone took to deal with it: “so, and in that situation”. The second sentence is a deliberate step, not an automatic result, which distinguishes it from だから. Literally it can also mean “there, at that place”.',
    functions: ['cause-reason', 'time-sequence'],
    examples: [
      ex('道に 迷って しまった。そこで、交番で 聞く ことに した。', 'I got lost, so I decided to ask at a police box.', 'みちに まよって しまった。そこで、こうばんで きく ことに した。'),
      ex('客が 減って きた。そこで、店は 値段を 下げた。', 'Customers were dropping off, so the shop lowered its prices.', 'きゃくが へって きた。そこで、みせは ねだんを さげた。'),
    ],
  },
  'n4m-g-5b470d': {
    meaning: '~, ~, and because of that … (cumulative reasons)',
    structure: 'Plain form + し、plain form + から、…',
    explanation:
      'Several reasons are piled up with し and the last one is capped with から, which leads into the conclusion: 安いし、近いから、あの店にしよう. The combination sounds emphatic, as if the case is already made. Everything before から counts as the reason.',
    functions: ['cause-reason', 'emphasize'],
    examples: [
      ex('安いし、駅から 近いから、あの ホテルに しよう。', "It's cheap and close to the station, so let's go with that hotel.", 'やすいし、えきから ちかいから、あの ほてるに しよう。'),
      ex('天気も いいし、休みだから、どこかへ 出かけたい。', "The weather's nice and it's a day off, so I want to go somewhere.", 'てんきも いいし、やすみだから、どこかへ でかけたい。'),
    ],
  },
  'n4m-v-d246b5': {
    meaning: '~ has been done (and is still that way, on purpose)',
    structure: 'N は + Place に + V-transitive-て + あります',
    explanation:
      'てある describes a state left by someone’s deliberate action: 名前はここに書いてあります “the name is written here (someone wrote it)”. Only transitive verbs are used, and the object becomes the topic or takes が. Compare ている with an intransitive verb (窓が開いている), which only reports the state.',
    functions: ['action-status', 'results-state'],
    examples: [
      ex('会議の 資料は 机の 上に 置いて あります。', 'The meeting papers have been put on the desk.', 'かいぎの しりょうは つくえの うえに おいて あります。'),
      ex('パーティーの 飲み物は もう 冷蔵庫に 入れて あります。', "The drinks for the party are already in the fridge.", 'ぱーてぃーの のみものは もう れいぞうこに いれて あります。'),
    ],
  },
  'n4m-g-8b3aff': {
    structure: 'N + と なる（となった）',
    explanation:
      'A formal counterpart of になる, “turn into, end up as”. と なる stresses the final outcome or a result that has been decided, so it is typical of news, announcements and writing: 試合は中止となった. になる is the everyday choice and also suits gradual change.',
    functions: ['result', 'achievement'],
    examples: [
      ex('雨の ため、試合は 中止と なりました。', 'Because of the rain, the match has been cancelled.', 'あめの ため、しあいは ちゅうしと なりました。'),
      ex('この 経験は 私の 大切な 思い出と なった。', 'This experience became a precious memory for me.', 'この けいけんは わたしの たいせつな おもいでと なった。'),
    ],
  },
  'n4m-g-be604f': {
    meaning: 'point; respect; in terms of ~',
    structure: 'この／その 点（で／では）；N／clause + という 点で',
    explanation:
      '点 is a “point” in an argument: the respect in which something is judged. この点では “in this respect”, 値段の点では “in terms of price”. It is common when comparing merits: 便利な点が多い “it has many convenient points”.',
    functions: ['perspective-way'],
    examples: [
      ex('値段の 点では、こちらの ほうが いいです。', 'In terms of price, this one is better.', 'ねだんの てんでは、こちらの ほうが いいです。'),
      ex('その 点に ついては、もう 一度 考えて みます。', "I'll think again about that point.", 'その てんに ついては、もう いちど かんがえて みます。'),
    ],
  },
  'n4m-g-047b9e': {
    meaning: 'without even trying ~',
    structure: 'V-て形 + も みないで（みずに）',
    explanation:
      'てみる plus も and ないで: “without so much as trying”. It criticises judging before trying: 食べてもみないで嫌いだと言う. The implied message is “how can you know until you try?”. みずに is the written form.',
    functions: ['negative', 'criticize'],
    examples: [
      ex('食べても みないで、まずいと 言わないで。', "Don't say it tastes bad without even trying it.", 'たべても みないで、まずいと いわないで。'),
      ex('彼は 説明書を 読んでも みずに、すぐ 電話して きた。', 'He called straight away without even trying to read the manual.', 'かれは せつめいしょを よんでも みずに、すぐ でんわして きた。'),
    ],
  },
  'n4m-g-0eec4d': {
    meaning: "wasn't it ~? (checking a memory or belief)",
    structure: 'N／Na + ではなかったか（じゃなかった？）',
    explanation:
      'A past negative question that checks what the speaker thought was true: “wasn’t it ~?”. It often signals doubt or mild reproach when reality seems to differ: 会議は三時からではなかったか. The casual form is じゃなかった?, the polite one ではありませんでしたか.',
    functions: ['confirm'],
    examples: [
      ex('会議は 三時からでは なかったか。', "Wasn't the meeting supposed to start at three?", 'かいぎは さんじからでは なかったか。'),
      ex('あれ、今日は 休みじゃ なかった？', "Huh, wasn't today your day off?", 'あれ、きょうは やすみじゃ なかった？'),
    ],
  },
  'n4m-g-37359b': {
    meaning: 'the one that ~ is B; the reason ~ is B (focus)',
    structure: 'Clause + の は + B + です',
    explanation:
      'A cleft sentence: の turns the clause into “the one / the thing that ~”, and B after は is the new, focused information. 私が好きなのは夏です “what I like is summer”. With から it gives a reason in focus: 遅れたのは雨が降ったからです.',
    functions: ['emphasize', 'explain'],
    examples: [
      ex('私が 一番 好きな のは 夏です。', 'The season I like best is summer.', 'わたしが いちばん すきな のは なつです。'),
      ex('遅れた のは、バスが 来なかったからです。', 'The reason I was late is that the bus did not come.', 'おくれた のは、ばすが こなかったからです。'),
    ],
  },
  'n4m-n-v-df308c': {
    meaning: 'to (do something to / toward) N — に marking the target',
    structure: 'N（person／place／thing）+ に + V（会う・乗る・入る・聞く・なる）',
    explanation:
      'Many verbs mark their target or partner with に rather than を: 友達に会う, 電車に乗る, 部屋に入る, 先生に聞く. English uses a direct object for several of these, which is why learners say を by mistake. Learn the verb and its particle together.',
    functions: ['direction'],
    examples: [
      ex('駅で 昔の 友達に 会いました。', 'I ran into an old friend at the station.', 'えきで むかしの ともだちに あいました。'),
      ex('毎朝 七時の 電車に 乗ります。', 'I take the seven o’clock train every morning.', 'まいあさ しちじの でんしゃに のります。'),
    ],
  },
  'n4m-g-3e1e9e': {
    meaning: '(casual question) ~?; (soft explanation) ~, you see',
    structure: 'Plain form (Na / N + な) + の（？／。）',
    explanation:
      'With rising intonation, sentence-final の is the casual form of んですか: どこに行くの? “where are you going?”. It asks for an explanation and sounds gentle. With falling intonation it explains softly, a style associated with women and children: 頭が痛いの.',
    functions: ['asked', 'explain'],
    examples: [
      ex('どうして 泣いて いる の？', 'Why are you crying?', 'どうして ないて いる の？'),
      ex('ごめんね、今日は ちょっと 忙しい の。', "Sorry, I'm a bit busy today, that's all.", 'ごめんね、きょうは ちょっと いそがしい の。'),
    ],
  },
  'n4m-g-d365a6': {
    meaning: '~ (for one thing), and because ~ …',
    structure: 'Reason 1 + し、reason 2 + から、conclusion',
    explanation:
      'A し-clause gives a background reason and the から-clause the decisive one, so from the listener’s point of view the conclusion is well supported. With only one し it sounds like “partly because ~, and since ~”. It is conversational; formal writing would use し or ため alone.',
    functions: ['cause-reason', 'add'],
    examples: [
      ex('もう 遅いし、明日 早いから、そろそろ 帰ります。', "It's late, and I have an early start tomorrow, so I'll be going.", 'もう おそいし、あした はやいから、そろそろ かえります。'),
      ex('お金も ない し、時間も ないから、旅行は 無理だ。', "I don't have the money or the time, so a trip is out of the question.", 'おかねも ない し、じかんも ないから、りょこうは むりだ。'),
    ],
  },
  'n4m-g-98d453': {
    meaning: 'once you ~, (you can never go back)',
    structure: '一度（いちど）+ V-たら／V-dict + と, …',
    explanation:
      '一度 with a condition says that a single experience is enough to change things for good: 一度食べたら忘れられない味. The result is usually lasting or irreversible. たら is the neutral choice; と sounds more like a general rule.',
    functions: ['condition'],
    examples: [
      ex('この 味は 一度 食べたら 忘れられない。', 'Once you taste this, you can never forget it.', 'この あじは いちど たべたら わすれられない。'),
      ex('一度 始めると、なかなか やめられない。', "Once you start, it's hard to stop.", 'いちど はじめると、なかなか やめられない。'),
    ],
  },
  'n4m-g-6a5068': {
    meaning: 'must; have to (なければならない)',
    structure: 'V-ない stem + なければ + ならない／なりません／いけない',
    explanation:
      'Literally “if one does not ~, it will not do”: an obligation, often from rules or social duty. なければならない is the standard written and formal form; in speech it shortens to なきゃ. ないといけない sounds more personal and conversational.',
    functions: ['necessary-obligation'],
    examples: [
      ex('パスポートは 必ず 持って いなければ なりません。', 'You must carry your passport at all times.', 'ぱすぽーとは かならず もって いなければ なりません。'),
      ex('今日中に この 仕事を 終わらせなければ ならない。', 'I have to finish this work today.', 'きょうじゅうに この しごとを おわらせなければ ならない。'),
    ],
  },
  'n4m-g-27f71b': {
    meaning: '(humbly) do ~ for someone of higher status',
    structure: 'Person に + V-て形 + さしあげる',
    explanation:
      'The humble form of てあげる: the speaker does a favour for a superior. Even so, saying it to the superior’s face sounds as if you expect gratitude, so it is used when talking about the favour to others. To offer help directly, say お手伝いしましょうか instead.',
    functions: ['give', 'reverent-humble'],
    examples: [
      ex('先生の 荷物を 持って さしあげた。', "I carried my teacher's bags for her.", 'せんせいの にもつを もって さしあげた。'),
      ex('お客様に 駅までの 道を 教えて さしあげて ください。', 'Please show the customer the way to the station.', 'おきゃくさまに えきまでの みちを おしえて さしあげて ください。'),
    ],
  },
  'n4m-g-373733': {
    meaning: 'do ~ (for me)! (blunt request)',
    structure: 'V-て形 + くれ',
    explanation:
      'くれ is the imperative of くれる, so てくれ is a direct, masculine command-like request: 手伝ってくれ “help me”. It is used by men to close friends or juniors, or in urgent moments. Neutral alternatives are て, てください and てくれる?.',
    functions: ['request', 'order'],
    examples: [
      ex('ちょっと こっちを 手伝って くれ。', 'Give me a hand over here.', 'ちょっと こっちを てつだって くれ。'),
      ex('頼むから、静かに して くれ。', 'Please, just be quiet.', 'たのむから、しずかに して くれ。'),
    ],
  },
  'n4m-g-058cb5': {
    meaning: 'because (someone) does not ~ (and so …)',
    structure: 'V-ない + で, (emotion / trouble)',
    explanation:
      'ないで can give a negative cause: because something does not happen, the speaker feels or suffers something: 連絡が来ないで心配した. The main clause is typically an emotion (心配する, 困る, 助かる). Do not confuse it with ないで “without doing” or ないでください.',
    functions: ['cause-reason', 'negative'],
    examples: [
      ex('子供が なかなか 寝ないで 困って いる。', "My child just won't go to sleep, and I don't know what to do.", 'こどもが なかなか ねないで こまって いる。'),
      ex('大きな 事故に ならないで 本当に よかった。', 'I am so glad it did not turn into a serious accident.', 'おおきな じこに ならないで ほんとうに よかった。'),
    ],
  },
  'n4m-g-f14e4f': {
    structure: 'V-ます stem + にくい',
    explanation:
      'にくい says an action is hard to do, or that something does not easily happen: 読みにくい字 “hard-to-read handwriting”, 壊れにくい “hard to break”. It describes a property of the thing or situation. づらい is similar but stresses the doer’s discomfort, and its opposite is やすい.',
    functions: ['evaluate', 'action-effort'],
    examples: [
      ex('この ペンは 書きにくい。', 'This pen is hard to write with.', 'この ぺんは かきにくい。'),
      ex('この コップは 割れにくい ので、子供にも 安心です。', "This glass doesn't break easily, so it's safe for children too.", 'この こっぷは われにくい ので、こどもにも あんしんです。'),
    ],
  },
  'n4m-g-34548f': {
    meaning: 'it is that ~; you see ~ (explaining / asking for an explanation)',
    structure: 'Plain form (Na / N + な) + んです（んですか）',
    explanation:
      'The polite spoken form of のだ. It frames a statement as an explanation (頭が痛いんです “I have a headache, you see”) or a question as a request for one (どうしたんですか “what happened?”). Overusing it with plain facts sounds pushy, so use ます for simple information.',
    functions: ['explain', 'asked'],
    examples: [
      ex('すみません、今日は 早く 帰りたいんです。子供が 熱を 出して。', "Excuse me, I'd like to go home early today. My child has a fever.", 'すみません、きょうは はやく かえりたいんです。こどもが ねつを だして。'),
      ex('どうして 昨日 来なかったんですか。', "Why didn't you come yesterday?", 'どうして きのう こなかったんですか。'),
    ],
  },
  'n4m-g-faca5d': {
    meaning: 'respectful (honorific) verbs',
    structure: 'いる・行く・来る → いらっしゃる；言う → おっしゃる；食べる・飲む → 召し上がる；見る → ご覧になる；する → なさる',
    explanation:
      'The core of 尊敬語 is a set of special verbs that replace everyday ones when a respected person acts. いらっしゃる, おっしゃる and なさる have irregular ます forms: いらっしゃいます, おっしゃいます, なさいます. Verbs without a special form use お〜になる.',
    functions: ['reverent-humble'],
    examples: [
      ex('部長は 何と おっしゃいましたか。', 'What did the manager say?', 'ぶちょうは なんと おっしゃいましたか。'),
      ex('どうぞ 温かい うちに 召し上がって ください。', 'Please eat it while it is warm.', 'どうぞ あたたかい うちに めしあがって ください。'),
    ],
  },
  'n4m-g-ff113c': {
    structure: 'N / V-dict + まで；N + まで + （even）',
    explanation:
      'まで marks an end point in time or space: 五時まで “until five”, 駅まで “as far as the station”. With a verb it means “until that happens”. It can also mean “even”, stressing an extreme: 子供まで知っている “even children know it”. For a deadline (“by”), use までに.',
    functions: ['time-direction', 'range'],
    examples: [
      ex('毎日 九時から 五時まで 働いて います。', 'I work from nine to five every day.', 'まいにち くじから ごじまで はたらいて います。'),
      ex('その 話は 小さい 子供まで 知って いる。', 'Even small children know that story.', 'その はなしは ちいさい こどもまで しって いる。'),
    ],
  },
  'n4m-g-3f87a2': {
    meaning: 'is like ~; as if ~ (resemblance)',
    structure: '（まるで）N の／V + ようだ；ような + N；ように + V',
    explanation:
      'ようだ can compare something to what it resembles: まるで夢のようだ “it’s just like a dream”. まるで makes clear it is a comparison and not a guess. Before nouns it becomes ような, before verbs ように; the spoken equivalent is みたいだ.',
    functions: ['similarity-degree'],
    examples: [
      ex('ここから 見る 夜景は まるで 宝石の ようだ。', 'The night view from here is like a scattering of jewels.', 'ここから みる やけいは まるで ほうせきの ようだ。'),
      ex('彼は 何も なかった ように 笑って いた。', 'He was smiling as if nothing had happened.', 'かれは なにも なかった ように わらって いた。'),
    ],
  },
  'n4m-g-c80343': {
    meaning: 'to do ~ together; to ~ each other',
    structure: 'V-ます stem + 合う（あう）',
    explanation:
      '合う after a verb stem makes the action mutual: 助け合う “help each other”, 話し合う “talk it over”. The partner is marked with と: 友達と話し合う. It is productive, so new combinations are easy to understand.',
    functions: ['companion'],
    examples: [
      ex('家族で 助け合って 生活して いる。', 'Our family gets by helping one another.', 'かぞくで たすけあって せいかつして いる。'),
      ex('問題に ついて、みんなで 話し合いましょう。', "Let's all talk the problem over together.", 'もんだいに ついて、みんなで はなしあいましょう。'),
    ],
  },
  'n4m-g-a8f8e4': {
    meaning: 'would it be possible for you to ~? (very polite request)',
    structure: 'V-て形 + いただけないでしょうか',
    explanation:
      'One of the politest request forms: the negative potential of いただく plus でしょうか makes the request tentative and easy to refuse. It suits requests to superiors, customers and strangers, especially for real favours. Everyday polite requests usually stop at ていただけますか.',
    functions: ['request', 'reverent-humble'],
    examples: [
      ex('もう 少し ゆっくり 話して いただけないでしょうか。', 'Would it be possible for you to speak a little more slowly?', 'もう すこし ゆっくり はなして いただけないでしょうか。'),
      ex('締め切りを 一日 延ばして いただけないでしょうか。', 'Might it be possible to extend the deadline by one day?', 'しめきりを いちにち のばして いただけないでしょうか。'),
    ],
  },
  'n4m-g-ea88ed': {
    meaning: 'have just ~; be about to ~; be in the middle of ~',
    structure: 'V-dict／V-ている／V-た + ところだ',
    explanation:
      'ところ pins down the stage of an action. V-dict + ところ is “about to”, V-ている + ところ “in the middle of”, and V-た + ところ “have just done”: 今帰ってきたところだ. Compare たばかり, which allows a longer time since the action and stresses the speaker’s feeling that it was recent.',
    functions: ['relationships-in-time'],
    examples: [
      ex('今 駅に 着いた ところです。', "I've just arrived at the station.", 'いま えきに ついた ところです。'),
      ex('これから 出かける ところなので、あとで 電話するね。', "I'm just about to go out, so I'll call you later.", 'これから でかける ところなので、あとで でんわするね。'),
    ],
  },
  'n4m-g-32c548': {
    meaning: '(a superior) kindly does ~ for me',
    structure: 'V-て形 + 下さる（くださる）→ 下さいます／下さい',
    explanation:
      'The same honorific favour verb as てくださる, here in its kanji spelling. In modern writing the auxiliary after て is usually written in kana (てくださる), while 下さる in kanji is kept for the main verb “give”. The request form ください comes from its imperative.',
    functions: ['benefit', 'reverent-humble'],
    examples: [
      ex('先生が 丁寧に 説明して くださった。', 'The teacher kindly explained it carefully.', 'せんせいが ていねいに せつめいして くださった。'),
      ex('お客様が 手紙を 下さいました。', 'A customer kindly gave us a letter.', 'おきゃくさまが てがみを くださいました。'),
    ],
  },
  'n4m-g-4a7267': {
    meaning: 'to receive (humble); to eat / drink (humble)',
    structure: 'Person から／に + N を + 頂く（いただく）',
    explanation:
      '頂く is the humble form of もらう, “receive” from someone of higher status: 先生から本を頂いた. It is also the humble verb for eating and drinking, which is where いただきます before meals comes from. As a helper verb after て it is usually written in kana: ていただく.',
    functions: ['give', 'reverent-humble'],
    examples: [
      ex('社長から 素敵な お土産を 頂きました。', 'I received a lovely souvenir from the president.', 'しゃちょうから すてきな おみやげを いただきました。'),
      ex('では、遠慮なく 頂きます。', "Well then, I'll gladly help myself.", 'では、えんりょなく いただきます。'),
    ],
  },
  'n4m-g-7f39e4': {
    meaning: 'to finish ~ing',
    structure: 'V-ます stem + 終わる（おわる）',
    explanation:
      '終わる after a verb stem says an action with a clear end has been completed: 読み終わる “finish reading”. It is intransitive in form but takes the object of the main verb: 本を読み終わった. 終える is the transitive, more formal equivalent.',
    functions: ['finish'],
    examples: [
      ex('やっと この 本を 読み終わった。', "I've finally finished reading this book.", 'やっと この ほんを よみおわった。'),
      ex('食べ終わったら、お皿を 片付けて ね。', "When you've finished eating, clear away your plate, OK?", 'たべおわったら、おさらを かたづけて ね。'),
    ],
  },
  'n4m-g-1b21af': {
    meaning: 'humble language (for your own actions)',
    structure: 'お／ご + V-stem + する（いたす）；special verbs: 参る, 申す, 伺う, いたす, 拝見する',
    explanation:
      '謙譲語 lowers the speaker’s own actions, and those of the speaker’s group, to show respect to the person affected. お〜する works for most verbs (お持ちします), and special verbs cover the common ones: 行く・来る → 参る, 言う → 申す, 聞く・訪ねる → 伺う. It is never used for other people’s actions.',
    functions: ['reverent-humble'],
    examples: [
      ex('お荷物を お持ちします。', 'Let me carry your bags.', 'おにもつを おもちします。'),
      ex('明日 三時に そちらへ 伺います。', 'I will call on you at three tomorrow.', 'あした さんじに そちらへ うかがいます。'),
    ],
  },
  'n4m-g-72686a': {
    meaning: 'it would be better not to ~',
    structure: 'V-ない + 方（ほう）が よい／いい',
    explanation:
      'Advice against an action: “you’d better not ~”. The negative stays in plain non-past form (飲まないほうがいい), unlike the positive version, which prefers the past form (飲んだほうがいい). よい is the more formal spelling of いい.',
    functions: ['advice', 'negative'],
    examples: [
      ex('熱が あるなら、お風呂に 入らない ほうが いい。', "If you have a fever, you'd better not take a bath.", 'ねつが あるなら、おふろに はいらない ほうが いい。'),
      ex('夜 遅くに 一人で 歩かない ほうが よい。', 'It is better not to walk alone late at night.', 'よる おそくに ひとりで あるかない ほうが よい。'),
    ],
  },
  'n4m-g-11bd20': {
    meaning: 'to keep ~ing; to continue ~ing',
    structure: 'V-ます stem + 続ける（つづける）',
    explanation:
      '続ける after a verb stem says an action is continued deliberately or without a break: 歩き続ける “keep walking”. For something that keeps happening by itself, use 続く after a noun (雨が続く) or the compound 降り続く. The compound takes the object of the main verb.',
    functions: ['continuity'],
    examples: [
      ex('彼は 十年間 同じ 会社で 働き続けて いる。', 'He has kept working at the same company for ten years.', 'かれは じゅうねんかん おなじ かいしゃで はたらきつづけて いる。'),
      ex('赤ちゃんが 一晩中 泣き続けた。', 'The baby cried all night long.', 'あかちゃんが ひとばんじゅう なきつづけた。'),
    ],
  },
  'n4m-g-6a7b98': {
    meaning: 'passive: to be ~ed (by someone)',
    structure: 'N1 は + N2（agent）に + V-passive（る-verb → られる；う-verb → あ-row + れる；する → される；来る → 来られる）',
    explanation:
      'The passive makes the affected person or thing the subject and marks the doer with に. Besides neutral descriptions (この寺は昔建てられた), Japanese has a “suffering” passive for things that happen to you: 雨に降られた “I got caught in the rain”. Intransitive verbs can appear in this second type.',
    functions: ['passive'],
    examples: [
      ex('弟は 先生に 褒められた。', 'My little brother was praised by his teacher.', 'おとうとは せんせいに ほめられた。'),
      ex('帰り道で 雨に 降られて しまった。', 'I got caught in the rain on the way home.', 'かえりみちで あめに ふられて しまった。'),
    ],
  },
  'n4m-g-03858c': {
    meaning: 'imperative (command) form: do ~!',
    structure: 'う-verb: え-row（行け・書け）；る-verb: ろ（食べろ・見ろ）；する → しろ（せよ）；来る → 来い（こい）',
    explanation:
      'The plain imperative gives a blunt order. In daily life it is heard from coaches, in emergencies (逃げろ!), on signs and in reported speech (早く寝ろと言われた), and mostly from men. Ordinary requests use てください, and even among friends て alone is far more common.',
    functions: ['order'],
    examples: [
      ex('危ない！早く 逃げろ！', 'Look out! Run, quickly!', 'あぶない！はやく にげろ！'),
      ex('父に 早く 寝ろと 言われた。', 'My father told me to go to bed early.', 'ちちに はやく ねろと いわれた。'),
    ],
  },
  'n4m-g-d629f5': {
    meaning: 'which is more ~, A or B?',
    structure: 'A と B と（では）、どちらが + Adj + ですか',
    explanation:
      'The standard question for comparing two things. どちら (casual どっち) is used for two items even when they are people or places; for three or more use 何／どれ／誰 + が一番. The answer is usually B のほうが〜.',
    functions: ['compare'],
    examples: [
      ex('犬と 猫と、どちらが 好きですか。', 'Which do you like better, dogs or cats?', 'いぬと ねこと、どちらが すきですか。'),
      ex('東京と 大阪では、どちらが 人口が 多いですか。', 'Which has the larger population, Tokyo or Osaka?', 'とうきょうと おおさかでは、どちらが じんこうが おおいですか。'),
    ],
  },
  'n4m-g-48ce6b': {
    meaning: 'to begin ~ing; to start to ~',
    structure: 'V-ます stem + 始める（はじめる）',
    explanation:
      '始める after a verb stem marks the start of an action or a change: 読み始める “start reading”, 雨が降り始めた “it began to rain”. It works with intentional and unintentional events alike. 出す is similar but stresses suddenness.',
    functions: ['process'],
    examples: [
      ex('去年から ピアノを 習い始めました。', 'I started learning the piano last year.', 'きょねんから ぴあのを ならいはじめました。'),
      ex('急に 雨が 降り始めた。', 'It suddenly started to rain.', 'きゅうに あめが ふりはじめた。'),
    ],
  },
  'n4m-g-b893c8': {
    meaning: 'to receive; to get (from someone)',
    structure: 'Receiver は + Giver に／から + N を + もらう',
    explanation:
      'もらう is told from the receiver’s side: the speaker, or someone close, gets something. The giver takes に or から, and から is preferred when the giver is an organisation. For receiving from a superior, the humble form is いただく.',
    functions: ['give', 'benefit'],
    examples: [
      ex('誕生日に 友達から 花を もらった。', 'I got flowers from a friend for my birthday.', 'たんじょうびに ともだちから はなを もらった。'),
      ex('妹は 祖母に お小遣いを もらった。', 'My little sister got some pocket money from our grandmother.', 'いもうとは そぼに おこづかいを もらった。'),
    ],
  },
  'n4m-g-853b65': {
    meaning: 'can ~; be able to ~',
    structure: 'V-dict + こと が できる（できます）；N + が できる',
    explanation:
      'ことができる expresses ability or possibility and sounds a little more formal than the potential form: 泳ぐことができる = 泳げる. It is common in rules and notices: ここで写真を撮ることができます. With a noun, just が できる: 日本語ができる.',
    functions: ['ability'],
    examples: [
      ex('この 図書館では 本を 二週間 借りる ことが できます。', 'You can borrow books from this library for two weeks.', 'この としょかんでは ほんを にしゅうかん かりる ことが できます。'),
      ex('妹は 三歳で 字を 読む ことが できた。', 'My sister could read at the age of three.', 'いもうとは さんさいで じを よむ ことが できた。'),
    ],
  },
  'n4m-g-8aac33': {
    meaning: 'that ~ (quoting what is thought, said or considered)',
    structure: 'Plain form + と + 思う／言う／考える',
    explanation:
      'と marks the content of thinking or speech. The clause before it is in plain form, and nouns and な-adjectives keep だ: 便利だと思う. For your own opinion use と思う; for someone else’s thoughts use と思っている. Direct quotes go in 「」 before と.',
    functions: ['speak', 'judge'],
    examples: [
      ex('明日は 雨が 降ると 思います。', 'I think it will rain tomorrow.', 'あしたは あめが ふると おもいます。'),
      ex('彼は 来週 国へ 帰ると 言って いた。', 'He said he is going back to his country next week.', 'かれは らいしゅう くにへ かえると いって いた。'),
    ],
  },
  'n4m-g-6d4368': {
    meaning: 'easy to ~; tends to ~',
    structure: 'V-ます stem + やすい',
    explanation:
      'やすい after a verb stem says an action is easy: 分かりやすい “easy to understand”. With unintentional verbs it means something readily happens, even when that is bad: 壊れやすい “fragile”, 風邪をひきやすい. It conjugates as an い-adjective, and its opposite is にくい.',
    functions: ['evaluate', 'ability'],
    examples: [
      ex('先生の 説明は とても 分かりやすい。', "The teacher's explanations are very easy to understand.", 'せんせいの せつめいは とても わかりやすい。'),
      ex('この グラスは 割れやすいので、気を つけて。', 'These glasses break easily, so be careful.', 'この ぐらすは われやすいので、きを つけて。'),
    ],
  },
  'n4m-g-b0be0a': {
    meaning: '(casual, warm) question: ~?',
    structure: 'Question word … + plain form (Na / N + な) + んだい',
    explanation:
      'A casual, somewhat masculine or fatherly way to ask for an explanation, used with question words: どうしたんだい “what’s wrong?”. It sounds kinder than んだ? and is common in fiction and from older speakers. Without a question word, speakers use のかい instead.',
    functions: ['asked'],
    examples: [
      ex('そんな 顔を して、どうしたんだい。', "Why the long face? What's the matter?", 'そんな かおを して、どうしたんだい。'),
      ex('こんな 時間に 何を して いるんだい。', 'What are you doing at this hour?', 'こんな じかんに なにを して いるんだい。'),
    ],
  },
  'n4m-g-bc00ae': {
    meaning: 'B is more ~ than A',
    structure: 'A より B の 方（ほう）が + Adj',
    explanation:
      'The usual answer to a “which one” question: B のほうが puts B in focus and A より marks the standard. The order can be flipped (B のほうが A より〜). Plain A は B より〜 states a fact about A without a question being asked.',
    functions: ['compare'],
    examples: [
      ex('バスより 電車の 方が 速いです。', 'The train is faster than the bus.', 'ばすより でんしゃの ほうが はやいです。'),
      ex('夏より 冬の 方が 好きだ。', 'I like winter better than summer.', 'なつより ふゆの ほうが すきだ。'),
    ],
  },
  'n4m-g-75e9f6': {
    meaning: 'potential form: can ~; be able to ~',
    structure: 'う-verb: え-row + る（書ける）；る-verb: られる（食べられる）；する → できる；来る → 来られる',
    explanation:
      'The potential form turns a verb into “can do”. The object often switches from を to が: 漢字が読める. In casual speech る-verbs often drop ら (食べれる), which is widespread but still marked as non-standard in writing. ことができる is the more formal alternative.',
    functions: ['ability'],
    examples: [
      ex('私は 漢字が 少し 読めます。', 'I can read a little kanji.', 'わたしは かんじが すこし よめます。'),
      ex('明日の パーティーに 来られますか。', 'Can you come to the party tomorrow?', 'あしたの ぱーてぃーに こられますか。'),
    ],
  },
  'n4m-g-efe313': {
    meaning: 'such as ~; ~ and so on; things like ~',
    structure: 'N（や N）+ など',
    explanation:
      'など marks the preceding items as examples from a longer list: りんごやみかんなど. It often pairs with や. After a single noun it can also make an offer sound modest (お茶などいかがですか) or belittle something (私などには無理です). Casual speech uses なんか.',
    functions: ['denote-by-example'],
    examples: [
      ex('スーパーで 野菜や 果物などを 買った。', 'I bought vegetables, fruit and so on at the supermarket.', 'すーぱーで やさいや くだものなどを かった。'),
      ex('京都や 奈良などの 古い 町が 好きです。', 'I like old towns such as Kyoto and Nara.', 'きょうとや ならなどの ふるい まちが すきです。'),
    ],
  },
  'n4m-g-cffd99': {
    meaning: 'by ~ (deadline); before ~',
    structure: 'N（time）／V-dict + までに',
    explanation:
      'までに sets a deadline: the action happens at some point before the time given. まで alone describes an action that continues up to that time. Compare 五時まで働く “work until five” with 五時までに帰る “be home by five”.',
    functions: ['time-direction'],
    examples: [
      ex('レポートは 金曜日までに 出して ください。', 'Please hand in the report by Friday.', 'れぽーとは きんようびまでに だして ください。'),
      ex('暗く なる までに 家に 帰りなさい。', 'Be home before it gets dark.', 'くらく なる までに いえに かえりなさい。'),
    ],
  },
  'n4m-g-0dc524': {
    meaning: 'than ~; (formal) from ~',
    structure: 'A は + B より + Adj；（formal）Time / place + より',
    explanation:
      'より marks the standard of comparison: A は B より高い “A is more expensive than B”. When nothing is being asked, this plain order is the neutral statement. In formal notices より also means “from”: 午後三時より開始します.',
    functions: ['compare'],
    examples: [
      ex('今年の 夏は 去年より 暑い。', "This summer is hotter than last year's.", 'ことしの なつは きょねんより あつい。'),
      ex('会議は 午後 二時より 始めます。', 'The meeting will begin from two in the afternoon.', 'かいぎは ごご にじより はじめます。'),
    ],
  },
  'n4m-g-8c8cbd': {
    meaning: '(a superior) gives (to me / us)',
    structure: 'Giver が + Receiver に + N を + 下さる（くださる）',
    explanation:
      '下さる is the honorific form of くれる: someone you respect gives something to you or your group. The giver is the subject. Its masu form is 下さいます, and ください, the everyday request word, is its imperative. For giving upward, use さしあげる.',
    functions: ['give', 'reverent-humble'],
    examples: [
      ex('先生が 私に 辞書を 下さいました。', 'My teacher gave me a dictionary.', 'せんせいが わたしに じしょを くださいました。'),
      ex('お客様が 皆さんに お菓子を 下さった。', 'A customer gave everyone some sweets.', 'おきゃくさまが みなさんに おかしを くださった。'),
    ],
  },
  'n4m-g-cd8f61': {
    meaning: "prohibitive form: don't ~!",
    structure: 'V-dict + な（走るな・触るな）',
    explanation:
      'Dictionary form plus な is a blunt ban, the negative counterpart of the imperative. It appears on signs, in emergencies, in sports and in quoted orders (触るなと言われた). It sounds harsh in conversation; ないで(ください) is the normal way to ask someone not to do something.',
    functions: ['ban'],
    examples: [
      ex('危ないから、ここで 走るな。', "It's dangerous, so don't run here.", 'あぶないから、ここで はしるな。'),
      ex('あきらめるな。もう 少しだ。', "Don't give up. You're nearly there.", 'あきらめるな。もう すこしだ。'),
    ],
  },
  'n4m-g-4e5029': {
    meaning: 'causative: to make / let (someone) do ~',
    structure: 'う-verb: あ-row + せる（書かせる）；る-verb: させる；する → させる；来る → 来させる',
    explanation:
      'The causative means either forcing (make someone do) or permitting (let someone do); context and benefit verbs decide which. The doer takes に when there is a を-object, and を or に with intransitive verbs. させてください asks to be allowed to do something yourself.',
    functions: ['forced', 'allow'],
    examples: [
      ex('母は 毎日 弟に 部屋を 掃除させる。', 'Every day my mother makes my brother clean his room.', 'ははは まいにち おとうとに へやを そうじさせる。'),
      ex('子供を 公園で 自由に 遊ばせた。', 'I let the children play freely in the park.', 'こどもを こうえんで じゆうに あそばせた。'),
    ],
  },
  'n4m-g-bf56de': {
    meaning: 'to give (to someone lower, an animal or a plant)',
    structure: 'Receiver に + N を + やる',
    explanation:
      'やる is a plain, low-register “give” used toward younger family members, animals and plants: 花に水をやる, 犬にえさをやる. For people it sounds rough or condescending; あげる is the neutral choice, and many speakers now use あげる for pets too.',
    functions: ['give'],
    examples: [
      ex('毎朝 花に 水を やります。', 'I water the flowers every morning.', 'まいあさ はなに みずを やります。'),
      ex('弟に 古い 自転車を やった。', 'I gave my old bike to my little brother.', 'おとうとに ふるい じてんしゃを やった。'),
    ],
  },
  'n4m-g-fdb449': {
    meaning: "you'd better ~; it would be better to ~",
    structure: 'V-た + 方（ほう）が いい（です）',
    explanation:
      'Strong, specific advice. The past form (行ったほうがいい) is standard for positive advice, while the negative uses the non-past (行かないほうがいい). V-dict + ほうがいい also exists but sounds more general. To a superior, it can sound presumptuous.',
    functions: ['advice'],
    examples: [
      ex('熱が あるなら、病院に 行った 方が いいですよ。', "If you have a fever, you'd better go to the doctor.", 'ねつが あるなら、びょういんに いった ほうが いいですよ。'),
      ex('雨が 降りそうだから、傘を 持って いった 方が いい。', "It looks like rain, so you'd better take an umbrella.", 'あめが ふりそうだから、かさを もって いった ほうが いい。'),
    ],
  },
  'n4m-g-a6d361': {
    meaning: 'causative-passive: to be made to ~ (short and long forms)',
    structure: 'Long: V-ない stem + せられる（書かせられる）；Short (う-verbs not ending in す): V-ない stem + される（書かされる）',
    explanation:
      'Two shapes exist for う-verbs: the full せられる and the contracted される, which is far more common in speech (飲まされる, 待たされる). Verbs ending in す keep the long form (話させられる), and る-verbs and する only have it (食べさせられる, させられる). Either way the meaning is “forced to”.',
    functions: ['passive', 'forced'],
    examples: [
      ex('飲み会で 先輩に お酒を 飲まされた。', 'A senior made me drink at the party.', 'のみかいで せんぱいに おさけを のまされた。'),
      ex('学校で 毎日 作文を 書かせられた。', 'At school we were made to write compositions every day.', 'がっこうで まいにち さくぶんを かかせられた。'),
    ],
  },
  'n4m-g-689bf9': {
    meaning: 'can be seen; to be visible; to look (~)',
    structure: 'N が + 見える；Adj-く／N に + 見える',
    explanation:
      '見える says something is naturally visible, without effort: 窓から富士山が見える. It differs from 見られる, which is the potential “can (manage to) see”, for example a film. With an adjective or noun it means “look, appear”: 若く見える.',
    functions: ['ability', 'similarity-degree'],
    examples: [
      ex('この 部屋から 海が 見えます。', 'You can see the sea from this room.', 'この へやから うみが みえます。'),
      ex('彼は 年より ずっと 若く 見える。', 'He looks much younger than his age.', 'かれは としより ずっと わかく みえる。'),
    ],
  },
  'n4m-g-0bcfde': {
    meaning: 'how to ~; the way of ~ (する-verbs: 仕方)',
    structure: 'V-ます stem + かた；N（する-verb）の + 仕方（しかた）',
    explanation:
      'For する-verbs the stem + かた is 仕方 and the noun joins with の: 勉強の仕方 “how to study”, 運転の仕方. Separately, 方 (かた) is a polite word for “person”: あの方 “that person”. 仕方がない, “it can’t be helped”, grew out of the first meaning.',
    functions: ['means-methods'],
    examples: [
      ex('効果的な 勉強の 仕方を 教えて ください。', 'Please tell me an effective way to study.', 'こうかてきな べんきょうの しかたを おしえて ください。'),
      ex('あの 方が 新しい 先生です。', 'That person is the new teacher.', 'あの かたが あたらしい せんせいです。'),
    ],
  },
  'n4m-g-667067': {
    meaning: 'to suddenly start ~ing; ~ out',
    structure: 'V-ます stem + 出す（だす）',
    explanation:
      '出す after a verb stem has two uses. It marks a sudden, often uncontrolled start: 泣き出す “burst into tears”, 降り出す. It also adds outward movement: 取り出す “take out”. Compared with 始める, 出す does not suit planned actions (勉強し始める, not 勉強し出す for a schedule).',
    functions: ['process', 'direction'],
    examples: [
      ex('赤ちゃんが 急に 泣き出した。', 'The baby suddenly burst into tears.', 'あかちゃんが きゅうに なきだした。'),
      ex('かばんから 財布を 取り出した。', 'I took my wallet out of my bag.', 'かばんから さいふを とりだした。'),
    ],
  },
  'n4m-g-7a44d0': {
    meaning: 'to do ~ for (someone lower); (defiant) I’ll ~!',
    structure: 'Person に + V-て形 + やる',
    explanation:
      'てやる is a blunt てあげる, used for favours to younger family members, pets or plants: 弟に宿題を見てやる. It also expresses defiance or a threat when the action benefits no one: 絶対に勝ってやる “I’ll win, just watch”. Toward equals, てあげる is safer.',
    functions: ['benefit', 'determination-decision'],
    examples: [
      ex('弟に 算数を 教えて やった。', 'I helped my little brother with his arithmetic.', 'おとうとに さんすうを おしえて やった。'),
      ex('次の 試合では 絶対に 勝って やる。', "I'm going to win the next match, no matter what.", 'つぎの しあいでは ぜったいに かって やる。'),
    ],
  },
  'n4m-g-9adc60': {
    meaning: 'without ~ing',
    structure: 'V-ない stem + ずに（する → せずに）',
    explanation:
      'ずに is the written or formal version of ないで, “without doing”: 傘を持たずに出かけた. The only irregular form is せずに for する. It cannot replace ないで in requests: ないでください, never ずにください.',
    functions: ['negative'],
    examples: [
      ex('今朝は 朝ご飯を 食べずに 家を 出た。', 'I left home this morning without having breakfast.', 'けさは あさごはんを たべずに いえを でた。'),
      ex('辞書を 使わずに この 本を 読みました。', 'I read this book without using a dictionary.', 'じしょを つかわずに この ほんを よみました。'),
    ],
  },
  'n4m-g-454699': {
    meaning: 'to give (humbly, to someone of higher status)',
    structure: 'Receiver に + N を + さしあげる',
    explanation:
      'The humble form of あげる: the speaker’s side gives something to a superior or customer. It is common in shop and business language (お客様にさしあげます). Saying it directly to the receiver can sound like you expect thanks, so in person people often phrase it as どうぞ.',
    functions: ['give', 'reverent-humble'],
    examples: [
      ex('先生に 旅行の お土産を さしあげました。', 'I gave my teacher a souvenir from my trip.', 'せんせいに りょこうの おみやげを さしあげました。'),
      ex('ご来店の お客様に 小さな プレゼントを さしあげて います。', 'We are giving a small gift to every customer who visits.', 'ごらいてんの おきゃくさまに ちいさな ぷれぜんとを さしあげて います。'),
    ],
  },
  'n4m-g-c3ba56': {
    meaning: 'I think (it is) probably ~',
    structure: 'Plain form (N / Na without だ) + だろうと 思う（思います）',
    explanation:
      'だろう (guess) plus と思う (my opinion) makes a hedged prediction: “I suppose ~ will probably ~”. It is softer than と思う alone and common in explanations and forecasts. Keep だろう plain inside the quote even in polite speech: だろうと思います, not でしょうと思います.',
    functions: ['speculation'],
    examples: [
      ex('この 雨は 夜まで 続く だろうと 思う。', 'I think this rain will probably go on until night.', 'この あめは よるまで つづく だろうと おもう。'),
      ex('彼なら きっと 合格する だろうと 思います。', 'I think he will surely pass.', 'かれなら きっと ごうかくする だろうと おもいます。'),
    ],
  },
  'n4m-g-5f45fe': {
    meaning: "I'm thinking of ~ing; I intend to ~",
    structure: 'V-volitional（よう／おう）+ と 思う（思って いる）',
    explanation:
      'Volitional plus と思う states an intention: “I think I’ll ~”. と思っている suggests the plan has been held for some time, and it is the form for describing other people’s intentions. つもりだ is firmer; ようと思う sounds like the idea is still forming.',
    functions: ['intent', 'plan'],
    examples: [
      ex('夏休みに 北海道へ 行こうと 思って います。', "I'm thinking of going to Hokkaido during the summer holiday.", 'なつやすみに ほっかいどうへ いこうと おもって います。'),
      ex('今日は 早く 寝ようと 思う。', "I think I'll go to bed early tonight.", 'きょうは はやく ねようと おもう。'),
    ],
  },
  'n4m-g-de9413': {
    meaning: 'looks ~; seems about to ~ (from appearance)',
    structure: 'V-ます stem／Adj stem + そうだ（いい → よさそう、ない → なさそう）',
    explanation:
      'After a stem, そうだ reports an impression from appearance: おいしそうだ “looks delicious”, 雨が降りそうだ “looks like it will rain”. It is different from the hearsay そうだ, which follows a full plain form (降るそうだ “I hear it will rain”). It is not used for things obvious at a glance, such as きれい of a person you see.',
    functions: ['similarity-degree', 'speculation'],
    examples: [
      ex('この ケーキ、とても おいしそうですね。', 'This cake looks really delicious.', 'この けーき、とても おいしそうですね。'),
      ex('空が 暗い。今にも 雨が 降りそうだ。', 'The sky is dark. It looks like it will rain any minute.', 'そらが くらい。いまにも あめが ふりそうだ。'),
    ],
  },
  'n4m-g-fef869': {
    meaning: 'to come (here) to ~',
    structure: 'V-ます stem／N（action）+ に + 来る（きます）',
    explanation:
      'Purpose plus 来る: someone comes toward the speaker’s location in order to do something: 迎えに来る “come to pick up”, 遊びに来てください “come and visit”. The pattern is a standard invitation formula. To describe going away to do something, use に行く.',
    functions: ['purpose-goal'],
    examples: [
      ex('今度、うちに 遊びに 来て ください。', 'Please come and visit us sometime.', 'こんど、うちに あそびに きて ください。'),
      ex('父が 駅まで 迎えに 来て くれた。', 'My father came to pick me up at the station.', 'ちちが えきまで むかえに きて くれた。'),
    ],
  },
  'n4m-g-880bef': {
    meaning: '-ness (turns an adjective into a noun)',
    structure: 'Adj stem + さ（高さ・大きさ・便利さ）',
    explanation:
      'さ turns an い- or な-adjective into a noun for its degree or quality: 高い → 高さ “height”, 便利 → 便利さ “convenience”. It is productive and neutral. Some adjectives also take み, which is more about a felt quality: 甘み “sweetness (as a taste)”.',
    functions: ['adjective'],
    examples: [
      ex('この 山の 高さは どのくらいですか。', 'How high is this mountain?', 'この やまの たかさは どのくらいですか。'),
      ex('田舎の 静かさが 好きです。', 'I love the quietness of the countryside.', 'いなかの しずかさが すきです。'),
    ],
  },
  'n4m-g-da772c': {
    meaning: 'to go (somewhere) to ~',
    structure: 'V-ます stem／N（action noun）+ に + 行く',
    explanation:
      'The purpose of going: 買い物に行く, 映画を見に行く. Action nouns like 散歩, 旅行 and 食事 attach directly with に. Compare へ／に行く after a place, which marks the destination; both can appear together: 京都へ写真を撮りに行く.',
    functions: ['purpose-goal', 'direction'],
    examples: [
      ex('週末は 家族と 買い物に 行きました。', 'At the weekend I went shopping with my family.', 'しゅうまつは かぞくと かいものに いきました。'),
      ex('京都へ 写真を 撮りに 行きたい。', 'I want to go to Kyoto to take photos.', 'きょうとへ しゃしんを とりに いきたい。'),
    ],
  },
  'n4m-g-380f6b': {
    meaning: 'must not ~; you may not ~',
    structure: 'V-て形 + は いけません（いけない／だめです）',
    explanation:
      'てはいけません forbids an action and usually states a rule or a firm instruction: ここでたばこを吸ってはいけません. In speech it contracts to ちゃいけない / じゃいけない. It sounds strict, so to ask politely use ないでください.',
    functions: ['ban', 'negative'],
    examples: [
      ex('ここで 写真を 撮っては いけません。', 'You must not take photos here.', 'ここで しゃしんを とっては いけません。'),
      ex('授業中に 携帯電話を 使っては いけない。', 'You must not use your phone during class.', 'じゅぎょうちゅうに けいたいでんわを つかっては いけない。'),
    ],
  },
  'n4m-g-b1808f': {
    meaning: 'looking at ~ / judging from ~, (it seems) …',
    structure: 'N を + 見ると（見れば／見て）, … ようだ／らしい',
    explanation:
      'Uses what one sees as evidence for a judgement: 彼の顔を見ると、怒っているようだ “judging from his face, he seems angry”. The second half is usually a guess (ようだ, らしい, にちがいない). から見ると (“from the viewpoint of”) is related but names a standpoint rather than evidence.',
    functions: ['judge', 'grounds'],
    examples: [
      ex('彼の 顔を 見ると、何か あった ようだ。', 'Judging from his face, something seems to have happened.', 'かれの かおを みると、なにか あった ようだ。'),
      ex('道が ぬれて いる のを 見ると、夜中に 雨が 降った らしい。', 'Seeing that the road is wet, it must have rained in the night.', 'みちが ぬれて いる のを みると、よなかに あめが ふった らしい。'),
    ],
  },
  'n4m-g-20c0d4': {
    meaning: '~ or something like that',
    structure: 'N + や 何か（なにか／なんか）',
    explanation:
      'や何か adds vagueness after a noun: “~ or that sort of thing”. It lets the speaker name one example and wave at others: 本や何かを入れる箱. It is close to か何か, but や何か lists similar items rather than offering alternatives.',
    functions: ['vague', 'denote-by-example'],
    examples: [
      ex('ペンや 何か 書く ものを 持って いますか。', 'Do you have a pen or something to write with?', 'ぺんや なにか かく ものを もって いますか。'),
      ex('机の 上に 本や 何かが 置いて ある。', 'There are books and things on the desk.', 'つくえの うえに ほんや なにかが おいて ある。'),
    ],
  },
  'n4m-g-1fc82b': {
    meaning: 'still; (comparing) … is still better / at least',
    structure: 'まだ + V-ている／Adj；（A より）B の ほうが まだ + Adj',
    explanation:
      'まだ means “still” for a situation continuing (まだ雨が降っている) and “not yet” with a negative. In comparisons it marks the lesser evil: 雨よりは雪のほうがまだいい “snow is still better than rain”. まだまし is the fixed phrase for “better than nothing”.',
    functions: ['continuity', 'compare'],
    examples: [
      ex('もう 十時なのに、弟は まだ 寝て いる。', "It's already ten, and my brother is still asleep.", 'もう じゅうじなのに、おとうとは まだ ねて いる。'),
      ex('暑い のも いやだが、寒い より まだ いい。', "I don't like the heat, but it's still better than the cold.", 'あつい のも いやだが、さむい より まだ いい。'),
    ],
  },
  'n4m-g-714094': {
    meaning: "let's ~ (firm invitation); isn't it ~! (exclamation)",
    structure: 'V-ない + か（↘）；N／Adj + じゃないか',
    explanation:
      'With falling intonation, V-ないか is a firm, masculine invitation or urging: 一緒にやらないか. じゃないか after nouns and adjectives expresses discovery or reproach: いいじゃないか “well, that’s nice!”, 言ったじゃないか “I told you, didn’t I!”. Softer equivalents are ないですか and じゃないですか.',
    functions: ['invite-suggest', 'exclamatory'],
    examples: [
      ex('今度の 日曜日、一緒に 釣りに 行かないか。', "How about going fishing with me this Sunday?", 'こんどの にちようび、いっしょに つりに いかないか。'),
      ex('なんだ、ちゃんと できる じゃないか。', "Hey, you can do it properly after all!", 'なんだ、ちゃんと できる じゃないか。'),
    ],
  },
  'n4m-g-82f47e': {
    meaning: 'to be allowed to ~; (humbly) I will ~',
    structure: 'V-causative-て形 + もらう（もらいます／もらえますか）',
    explanation:
      'Literally “receive the favour of being made to do”: someone permits the speaker to act. It describes permission gratefully received (休ませてもらった) and, in requests, asks for it (使わせてもらえますか). In business Japanese the humbler させていただく is often used even when no permission is needed.',
    functions: ['request-permission', 'benefit'],
    examples: [
      ex('熱が あったので、会社を 休ませて もらった。', 'I had a fever, so they let me take the day off work.', 'ねつが あったので、かいしゃを やすませて もらった。'),
      ex('ちょっと 電話を 使わせて もらえますか。', 'Could I use your phone for a moment?', 'ちょっと でんわを つかわせて もらえますか。'),
    ],
  },
  'n4m-v-e4e2ef': {
    meaning: '(the topic) is in a state of ~',
    structure: 'N は + V-て いる（state verbs: 開く・結婚する・知る・住む）',
    explanation:
      'With change-of-state verbs, ている describes the resulting condition, not an action in progress: 窓は開いている “the window is open”, 兄は結婚している “my brother is married”. The topic は is the thing whose state is described. Compare action verbs, where ている means “is ~ing”.',
    functions: ['action-status', 'results-state'],
    examples: [
      ex('その 店は もう 閉まって いる。', 'That shop is already closed.', 'その みせは もう しまって いる。'),
      ex('姉は 大阪に 住んで いて、結婚して います。', 'My older sister lives in Osaka and is married.', 'あねは おおさかに すんで いて、けっこんして います。'),
    ],
  },
  'n4m-g-fdb567': {
    meaning: 'there is (a sound / smell / taste); (time) passes',
    structure: 'N（音・におい・味・気）+ が する；Time + する + と',
    explanation:
      'With nouns of perception, がする says the sensation is present: いい匂いがする, 変な音がする, 気がする (“have a feeling”). With a length of time, する means “pass”: 一時間もすると “once an hour or so has passed”. It is also used for price: このかばんは十万円もする.',
    functions: ['feel'],
    examples: [
      ex('台所から いい においが する。', 'There is a nice smell coming from the kitchen.', 'だいどころから いい においが する。'),
      ex('あと 十分 すると、バスが 来ます。', 'The bus will come in another ten minutes.', 'あと じゅっぷん すると、ばすが きます。'),
    ],
  },
  'n4m-g-5bc145': {
    meaning: 'since ~ (as we both know), …',
    structure: 'Plain form (Na / N + な) + のだから（んだから）',
    explanation:
      'のだから gives a reason the listener already accepts or cannot deny, and draws a conclusion that should follow: 約束したんだから、守らなきゃ. It often carries insistence or reproach. The main clause is typically advice, a request or a judgement.',
    functions: ['cause-reason', 'grounds'],
    examples: [
      ex('約束した んだから、ちゃんと 守りなさい。', 'You promised, so keep your word.', 'やくそくした んだから、ちゃんと まもりなさい。'),
      ex('せっかく 来た のだから、ゆっくり して いって ください。', "Now that you've come all this way, please stay and relax.", 'せっかく きた のだから、ゆっくり して いって ください。'),
    ],
  },
  'n4m-g-6fe160': {
    meaning: 'just once ~, and (you will) …; one time is enough',
    structure: '一度（いちど）+ V-ば／V-たら, … (understand / know)',
    explanation:
      'Here 一度 stresses that a single occurrence is enough for the result: 一度見れば分かる “you only need to see it once”. The main clause is often 分かる, 覚える or 気に入る. With a wish (一度でいいから〜たい) it means “just once, even”.',
    functions: ['condition', 'limit'],
    examples: [
      ex('一度 見れば、使い方は すぐ 分かりますよ。', "You'll understand how to use it as soon as you've seen it once.", 'いちど みれば、つかいかたは すぐ わかりますよ。'),
      ex('一度で いいから、富士山に 登って みたい。', "I'd like to climb Mount Fuji, even just once.", 'いちどで いいから、ふじさんに のぼって みたい。'),
    ],
  },
  'n4m-g-f9381b': {
    meaning: 'never even (thought / imagined) ~',
    structure: '思って／考えて + も みない（みなかった）',
    explanation:
      'てもみない adds “not even as a possibility” to verbs of thinking: 思ってもみなかった “I never even imagined it”. It expresses surprise at an unexpected outcome, good or bad. It is almost always in the past, looking back at the surprise.',
    functions: ['unexpected-outcome', 'negative'],
    examples: [
      ex('まさか 自分が 優勝するとは 思っても みなかった。', 'I never even imagined that I would win.', 'まさか じぶんが ゆうしょうするとは おもっても みなかった。'),
      ex('そんな 方法が あるなんて、考えても みなかった。', 'I had never even thought there could be a way like that.', 'そんな ほうほうが あるなんて、かんがえても みなかった。'),
    ],
  },
  'n4m-g-1d42a2': {
    meaning: 'in that ~; in terms of the fact that ~',
    structure: 'Clause／N + という 点（で／では／において）',
    explanation:
      'という点で names the exact respect in which something is true: 安いという点では、この店が一番だ “in terms of being cheap, this shop is best”. It is useful for balanced evaluations: one point in favour, another against. 点 alone after この／その refers back to something already said.',
    functions: ['perspective-way', 'evaluate'],
    examples: [
      ex('安いという 点では、この 店が 一番だ。', 'In terms of price, this shop is the best.', 'やすいという てんでは、この みせが いちばんだ。'),
      ex('駅に 近いという 点で、この 部屋を 選んだ。', 'I chose this room because it is close to the station.', 'えきに ちかいという てんで、この へやを えらんだ。'),
    ],
  },
  'n4m-g-c8319d': {
    meaning: 'whether (you) ~ or not',
    structure: 'V-て形 + も + V-なくて + も',
    explanation:
      'Pairs the positive and negative ても forms to say the outcome is the same either way: 行っても行かなくても “whether you go or not”. The main clause is a result that does not change, or a statement that the choice is free. Adjectives work too: 高くても高くなくても.',
    functions: ['concessions'],
    examples: [
      ex('来ても 来なくても、連絡だけは して ください。', "Whether you're coming or not, please let us know.", 'きても こなくても、れんらくだけは して ください。'),
      ex('薬を 飲んでも 飲まなくても、あまり 変わらない。', "Whether I take the medicine or not, there's not much difference.", 'くすりを のんでも のまなくても、あまり かわらない。'),
    ],
  },
  'n4m-g-ba468f': {
    meaning: 'on paper; in terms of ~; according to ~',
    structure: 'N + の 上（うえ）では',
    explanation:
      'の上では limits a statement to one frame of reference, often implying reality may differ: 計算の上では間に合う “by the numbers we will make it”, 暦の上では春 “it is spring according to the calendar”. Common nouns before it are 計算, 暦, 書類, 法律 and 数字.',
    functions: ['perspective-way'],
    examples: [
      ex('暦の 上では もう 春だが、まだ 寒い。', "According to the calendar it's already spring, but it's still cold.", 'こよみの うえでは もう はるだが、まだ さむい。'),
      ex('計算の 上では、予算内で できる はずだ。', 'On paper, we should be able to do it within budget.', 'けいさんの うえでは、よさんないで できる はずだ。'),
    ],
  },
  'n4m-g-a98f3e': {
    meaning: 'to give (to me / my side)',
    structure: 'Giver が + (私に) + N を + くれる',
    explanation:
      'くれる is used when something is given toward the speaker or the speaker’s circle: 友達が(私に)本をくれた. あげる cannot be used in that direction, so 友達が私にあげた is wrong. The honorific form is くださる, and the receiver’s viewpoint is もらう.',
    functions: ['give'],
    examples: [
      ex('姉が 誕生日に 時計を くれた。', 'My older sister gave me a watch for my birthday.', 'あねが たんじょうびに とけいを くれた。'),
      ex('隣の 人が 妹に みかんを くれました。', 'Our neighbour gave my little sister some mandarins.', 'となりの ひとが いもうとに みかんを くれました。'),
    ],
  },
  'n4m-g-03ac3f': {
    meaning: '~, and (what’s more) ~ (listing, implying there is more)',
    structure: 'Plain form + し（、plain form + し）',
    explanation:
      'し lists facts or reasons and implies the list could go on. Even one し works: 頭も痛いし、今日は休む suggests other reasons too. も often appears with し (雨も降っているし). Unlike て, し attaches to full plain forms, including the past and だ.',
    functions: ['listed', 'add'],
    examples: [
      ex('彼は 頭も いいし、スポーツも できる。', "He's smart, and he's good at sports too.", 'かれは あたまも いいし、すぽーつも できる。'),
      ex('今日は 寒いし、家で ゆっくり しよう。', "It's cold today, so let's take it easy at home.", 'きょうは さむいし、いえで ゆっくり しよう。'),
    ],
  },
  'n4m-g-ef1cc5': {
    meaning: "I would like you to ~; (humbly) have someone do ~",
    structure: 'V-て形 + 頂く（いただく）→ 頂きたい／頂けると 助かります',
    explanation:
      'The humble てもらう, in its kanji spelling (kana is more common after て). In the desiderative ていただきたい it becomes a polite but clear request: ご確認いただきたい “I would like you to check”. ていただけると助かります is gentler still.',
    functions: ['request', 'reverent-humble'],
    examples: [
      ex('この 書類を 確認して いただきたいのですが。', 'I would like you to check this document, if I may.', 'この しょるいを かくにんして いただきたいのですが。'),
      ex('部長に 資料を 見て 頂きました。', 'I had the manager look over the materials.', 'ぶちょうに しりょうを みて いただきました。'),
    ],
  },
  'n4m-g-ceecfc': {
    meaning: '(friendly) yes-no question: ~?',
    structure: 'Plain form (N / Na without だ) + かい',
    explanation:
      'かい is a gentle, casual question particle for yes-no questions, typical of men and older speakers: 元気かい? “how are you doing?”. For questions with a question word, だい is used instead (何だい?). Younger speakers usually just use rising intonation.',
    functions: ['asked', 'confirm'],
    examples: [
      ex('久しぶりだね。元気かい？', "Long time no see. How've you been?", 'ひさしぶりだね。げんきかい？'),
      ex('もう 宿題は 終わったかい？', 'Have you finished your homework yet?', 'もう しゅくだいは おわったかい？'),
    ],
  },
  'n4m-g-1b2c16': {
    meaning: 'passive forms; the “possessor” passive',
    structure: 'う-verb: あ-row + れる（踏まれる）；る-verb: られる；する → される；来る → 来られる',
    explanation:
      'The passive of う-verbs looks like the ない stem plus れる, and る-verbs share their shape with the potential (見られる), so context decides. A distinctively Japanese use puts the person affected as subject and their belonging as object: 電車で足を踏まれた “I had my foot stepped on”. English would use “my foot was stepped on”.',
    functions: ['passive'],
    examples: [
      ex('電車の 中で 足を 踏まれた。', 'Someone stepped on my foot on the train.', 'でんしゃの なかで あしを ふまれた。'),
      ex('弟に ケーキを 食べられて しまった。', 'My little brother ate my cake.', 'おとうとに けーきを たべられて しまった。'),
    ],
  },
  'n4m-g-e95831': {
    meaning: 'imperative forms, from blunt to gentle',
    structure: '行け（plain）→ 行きなさい（V-stem + なさい）→ 行って（て）→ 行ってください',
    explanation:
      'The plain imperative (行け) is harsh, so everyday commands use softer forms. V-stem + なさい is what parents and teachers say to children; bare て is a casual request among friends and family. てください is the polite request.',
    functions: ['order'],
    examples: [
      ex('もう 遅いから、早く 寝なさい。', "It's late, so go to bed now.", 'もう おそいから、はやく ねなさい。'),
      ex('ちょっと ここで 待って。', 'Wait here a moment.', 'ちょっと ここで まって。'),
    ],
  },
  'n4m-g-c1afba': {
    structure: 'たぶん + plain form + でしょう／だろう（と思う）',
    explanation:
      'たぶん means “probably”, and it is usually completed by でしょう, だろう or と思う. It can stand alone as a reply: たぶん “probably”. It is less certain than きっと and more certain than もしかしたら.',
    functions: ['speculation'],
    examples: [
      ex('明日は たぶん 雨でしょう。', 'It will probably rain tomorrow.', 'あしたは たぶん あめでしょう。'),
      ex('彼は たぶん もう 家に 着いたと 思う。', 'I think he has probably got home by now.', 'かれは たぶん もう いえに ついたと おもう。'),
    ],
  },
  'n4m-g-4ba01b': {
    meaning: 'it means ~; ~ means …',
    structure: 'X は + Y という 意味だ（意味です）；X は どういう 意味ですか',
    explanation:
      'The standard way to state or ask the meaning of a word or sign: この漢字は「山」という意味です. It also interprets someone’s words: それは来ないという意味ですか “Does that mean you aren’t coming?”. という links the content to 意味.',
    functions: ['explain', 'definition'],
    examples: [
      ex('「立入禁止」は 入っては いけないという 意味です。', '“立入禁止” means you must not enter.', '「たちいりきんし」は はいっては いけないという いみです。'),
      ex('それは どういう 意味ですか。', 'What do you mean by that?', 'それは どういう いみですか。'),
    ],
  },
  'n4m-g-0e387c': {
    meaning: 'while ~ (the whole time); during ~',
    structure: 'V-ている／N の／Adj + 間（あいだ）、…',
    explanation:
      '間 covers the whole length of a period, so the main clause is also continuous: 夏休みの間、ずっと国にいた. With に (間に), the main action happens at some point inside that period: 留守の間に泥棒が入った. Choosing between 間 and 間に depends on that difference.',
    functions: ['relationships-in-time', 'period'],
    examples: [
      ex('夏休みの 間、ずっと 祖母の 家に いた。', 'I stayed at my grandmother’s house for the whole summer holiday.', 'なつやすみの あいだ、ずっと そぼの いえに いた。'),
      ex('母が 買い物を して いる 間、私は 車で 待って いた。', 'While my mother was shopping, I waited in the car.', 'ははが かいものを して いる あいだ、わたしは くるまで まって いた。'),
    ],
  },
  'n4m-g-6e52a5': {
    meaning: 'potential form (object with が; 見える vs 見られる)',
    structure: 'N が + V-potential；見える／聞こえる（spontaneous）vs 見られる／聞ける（ability）',
    explanation:
      'With the potential, the object usually moves from を to が: 日本語が話せる. Two pairs cause confusion: 見える and 聞こえる mean something reaches your eyes or ears naturally, while 見られる and 聞ける mean you are able to see or hear it by arrangement. 富士山が見える, but 映画が見られる.',
    functions: ['ability'],
    examples: [
      ex('ここから 富士山が 見える。', 'You can see Mount Fuji from here.', 'ここから ふじさんが みえる。'),
      ex('この サイトで 昔の 映画が 見られます。', 'You can watch old films on this site.', 'この さいとで むかしの えいがが みられます。'),
    ],
  },
  'n4m-g-c3c3d6': {
    meaning: 'as expected (of ~); just as you would expect; (さすがに) even ~',
    structure: 'さすが（は）N だ；さすが N（だけあって）；さすがに + negative',
    explanation:
      'さすが praises someone for living up to their reputation: さすがプロだ “that’s a pro for you”. さすがに has a second use: even someone or something strong has a limit: さすがに疲れた “even I got tired”. It expresses the speaker’s evaluation, so it is not used about oneself in the first sense.',
    functions: ['of-course', 'evaluate'],
    examples: [
      ex('さすが プロの 料理人だ。本当に おいしい。', "That's a professional chef for you. It's really delicious.", 'さすが ぷろの りょうりにんだ。ほんとうに おいしい。'),
      ex('十時間も 歩いたら、さすがに 疲れた。', 'After walking for ten hours, even I got tired.', 'じゅうじかんも あるいたら、さすがに つかれた。'),
    ],
  },
  'n4m-g-c6c98d': {
    meaning: "volitional form: let's ~; I'll ~",
    structure: 'う-verb: お-row + う（行こう）；る-verb: よう（食べよう）；する → しよう；来る → 来よう（こよう）',
    explanation:
      'The plain volitional says “let’s ~” to friends or “I’ll ~” to oneself; its polite form is ましょう. It is the base for ようと思う (intention), ようとする (attempt) and ようか (offer). う-verbs change the final vowel to お and add う: 書く → 書こう.',
    functions: ['intent', 'invite-suggest'],
    examples: [
      ex('疲れたね。ちょっと 休もう。', "We're tired. Let's take a short break.", 'つかれたね。ちょっと やすもう。'),
      ex('明日から 毎日 運動しよう。', "From tomorrow, I'll exercise every day.", 'あしたから まいにち うんどうしよう。'),
    ],
  },
  'n4m-g-141d2c': {
    meaning: 'conditional (ば) form and its fixed phrases',
    structure: 'う-verb: え-row + ば（行けば）；る-verb: れば；い-adj: ければ；N・Na: なら（ば）；ない → なければ',
    explanation:
      'Every verb makes its ば form by changing the final u-sound to e and adding ば; い-adjectives use ければ. Beyond plain “if”, it builds set phrases: 〜ばいい “you just need to”, 〜ばよかった “I should have”, and 〜ば〜ほど “the more ~ the more”.',
    functions: ['condition', 'regret'],
    examples: [
      ex('もっと 早く 出れば よかった。', 'I should have left earlier.', 'もっと はやく でれば よかった。'),
      ex('分からなければ、ここに 電話すれば いいです。', "If you don't understand, you just need to call this number.", 'わからなければ、ここに でんわすれば いいです。'),
    ],
  },
  'n4m-v-d578df': {
    meaning: '~ has already been done (in preparation)',
    structure: 'もう + V-transitive-て + あります',
    explanation:
      'もう with てある tells the listener that a preparation is already taken care of: もう予約してあります “I have already booked”. It focuses on the ready state, not on who did it. Compare もうV-ました, which only reports that the action happened.',
    functions: ['action-status', 'planning-rules'],
    examples: [
      ex('レストランは もう 予約して あります。', "I've already booked the restaurant.", 'れすとらんは もう よやくして あります。'),
      ex('ビールは もう 冷やして あるよ。', "The beer's already been put to chill.", 'びーるは もう ひやして あるよ。'),
    ],
  },
  'n4m-v-f93222': {
    meaning: 'at / on (place) there is ~ (placed there by someone)',
    structure: 'Place + に + N + が + V-transitive-て あります',
    explanation:
      'Describes what is in a place as the result of someone’s action: 壁に絵が掛けてある “a picture has been hung on the wall”. The thing takes が and the place に. It is common for describing rooms and notices; ている with an intransitive verb (掛かっている) describes the same scene without implying purpose.',
    functions: ['status', 'action-status'],
    examples: [
      ex('壁に 大きな 地図が 貼って あります。', 'A large map has been put up on the wall.', 'かべに おおきな ちずが はって あります。'),
      ex('入り口に 注意の 紙が 置いて ある。', 'A warning notice has been placed at the entrance.', 'いりぐちに ちゅういの かみが おいて ある。'),
    ],
  },
  'n4m-g-cebcfa': {
    meaning: 'to / at ~ too; even for ~',
    structure: 'N + に + も',
    explanation:
      'も cannot replace に, so it follows it: 大阪にも行った “I went to Osaka too”. With a negative it means “not (to) ~ either”: 誰にも言わない “I won’t tell anyone”. It can also mean “even”: 子供にも分かる “even a child can understand”.',
    functions: ['add', 'emphasize'],
    examples: [
      ex('京都だけでなく、奈良にも 行きました。', 'I went not only to Kyoto but to Nara too.', 'きょうとだけでなく、ならにも いきました。'),
      ex('この 問題は 子供にも 分かる。', 'Even a child can understand this problem.', 'この もんだいは こどもにも わかる。'),
    ],
  },
  'n4m-g-23b6fe': {
    meaning: 'the fact that ~; ~ing (nominalizer こと)',
    structure: 'Plain form (Na + な／N + である) + こと + が／を／は',
    explanation:
      'こと turns a clause into an abstract noun, “the fact that / the act of”: 日本語を話すことは難しい. It is preferred over の in formal writing and in fixed patterns (ことができる, ことにする, ことがある). With verbs of perception (見る, 聞こえる), use の, not こと.',
    functions: ['explain'],
    examples: [
      ex('毎日 続ける ことが 大切です。', 'Keeping it up every day is what matters.', 'まいにち つづける ことが たいせつです。'),
      ex('彼が 会社を 辞めた ことを 知らなかった。', "I didn't know that he had quit the company.", 'かれが かいしゃを やめた ことを しらなかった。'),
    ],
  },
  'n4m-n-nghi-v-n-t-a470be': {
    title: 'Nか＋疑問詞＋か',
    meaning: 'N or someone / something / somewhere (like that)',
    structure: 'N + か + question word + か（誰か・何か・どこか）',
    explanation:
      'Offers N as one example and leaves the door open to alternatives: 田中さんか誰かに聞いて “ask Tanaka or someone”. The question word matches the kind of noun: 誰か for people, 何か for things, どこか for places. Particles follow the whole phrase.',
    functions: ['selective', 'vague'],
    examples: [
      ex('分からなければ、田中さんか 誰かに 聞いて ください。', "If you don't know, ask Tanaka or someone.", 'わからなければ、たなかさんか だれかに きいて ください。'),
      ex('週末は 海か どこかへ 行きたいな。', "I'd like to go to the beach or somewhere at the weekend.", 'しゅうまつは うみか どこかへ いきたいな。'),
    ],
  },
  'n4m-g-94bd50': {
    meaning: 'question particle: ~?',
    structure: 'Polite form + か；plain form + か（blunt／in embedded questions）',
    explanation:
      'か turns a polite sentence into a question: 行きますか. After plain forms at the end of a sentence it sounds blunt or masculine, so casual questions usually rely on intonation or の. Inside a sentence, か embeds a question: 何時に始まるか分からない.',
    functions: ['asked'],
    examples: [
      ex('すみません、この 電車は 新宿に 行きますか。', 'Excuse me, does this train go to Shinjuku?', 'すみません、この でんしゃは しんじゅくに いきますか。'),
      ex('会議が 何時に 始まるか 知って いますか。', 'Do you know what time the meeting starts?', 'かいぎが なんじに はじまるか しって いますか。'),
    ],
  },
  'n4m-g-002e2f': {
    meaning: 'that kind of ~; such (near the listener or just mentioned)',
    structure: 'そんな + N；そんなに + Adj／V（negative）',
    explanation:
      'そんな points to something the listener said or has in mind: そんなこと言わないで “don’t say such things”. It often sounds dismissive or surprised. そんなに before an adjective means “that much” and usually goes with a negative: そんなに高くない. こんな and あんな are the near and far partners.',
    functions: ['describe', 'similarity-degree'],
    examples: [
      ex('そんな ことを 言っては いけません。', 'You must not say things like that.', 'そんな ことを いっては いけません。'),
      ex('この 本は そんなに 難しくないよ。', "This book isn't that difficult.", 'この ほんは そんなに むずかしくないよ。'),
    ],
  },
  'n4m-tr-t-1f578a': {
    title: '助詞＋なら',
    meaning: 'if it is (with / at / to) ~, then …',
    structure: 'N + particle（で・と・に・から）+ なら',
    explanation:
      'なら can follow a particle to narrow the condition: 彼となら行く “I’d go if it’s with him”, ここでなら話せる “I can talk if it’s here”. The particle keeps its meaning, and なら picks out that case from others. It often implies a contrast with other cases.',
    functions: ['condition', 'range'],
    examples: [
      ex('あなたと なら、どこへ でも 行きます。', "With you, I'd go anywhere.", 'あなたと なら、どこへ でも いきます。'),
      ex('電話で なら、今 話せますよ。', 'If it’s by phone, I can talk now.', 'でんわで なら、いま はなせますよ。'),
    ],
  },
  'n4m-g-2b3562': {
    meaning: 'to have got used to ~',
    structure: 'N に + 慣れる（慣れた）；V-ます stem + 慣れる（使い慣れた）',
    explanation:
      '慣れる means to become accustomed; the thing you get used to takes に: 仕事に慣れた. The past 慣れた or 慣れている describes the current state. As a compound, V-stem + 慣れる means “familiar through use”: 使い慣れたペン, 住み慣れた町.',
    functions: ['status', 'results-state'],
    examples: [
      ex('新しい 仕事にも だいぶ 慣れました。', "I've got quite used to my new job.", 'あたらしい しごとにも だいぶ なれました。'),
      ex('住み慣れた 町を 離れるのは さびしい。', 'It is sad to leave the town I have lived in for so long.', 'すみなれた まちを はなれるのは さびしい。'),
    ],
  },
  'n4m-g-98d04b': {
    meaning: 'just as ~ (without resisting); as it is',
    structure: 'V-dict／V-passive + が まま（に）；ありの まま',
    explanation:
      'がまま is an older, literary form of まま: someone goes along with something without resisting it. 言われるがままに “just as I was told”, 流されるがまま “letting oneself drift”. ありのまま (“as it really is”) is the one form common in everyday speech.',
    functions: ['status', 'continuity'],
    examples: [
      ex('彼は 言われるが ままに サインして しまった。', 'He signed just as he was told to.', 'かれは いわれるが ままに さいんして しまった。'),
      ex('見た ことを ありの ままに 話して ください。', 'Please tell us exactly what you saw.', 'みた ことを ありの ままに はなして ください。'),
    ],
  },
  'n4m-g-9d6e58': {
    meaning: '(torn / differing) between A or B',
    structure: 'A か B か + で（迷う・決まる・変わる）',
    explanation:
      'AかBかで presents two options as the basis for something: being torn (行くか行かないかで迷う) or an outcome depending on them (晴れるか雨かで予定が変わる). The で marks the choice as the deciding factor.',
    functions: ['selective'],
    examples: [
      ex('大学に 行くか 働くかで 迷って いる。', "I'm torn between going to university and working.", 'だいがくに いくか はたらくかで まよって いる。'),
      ex('晴れるか 雨かで、週末の 予定が 変わる。', 'Our weekend plans depend on whether it’s sunny or rainy.', 'はれるか あめかで、しゅうまつの よていが かわる。'),
    ],
  },
  'n4m-g-e82d84': {
    meaning: '(counter) ~ ways; ~ kinds of method',
    structure: 'Number + 通り（とおり）',
    explanation:
      'As a counter, 通り counts ways or patterns: 二通り “two ways”, 何通り “how many ways”. It is common with methods, answers and combinations. Separately, 〜とおり after a verb means “exactly as ~” (言ったとおり), which is a different use of the same word.',
    functions: ['amount'],
    examples: [
      ex('この 問題には 解き方が 三通り ある。', 'There are three ways to solve this problem.', 'この もんだいには ときかたが さんとおり ある。'),
      ex('この 言葉には 二通りの 意味が あります。', 'This word has two meanings.', 'この ことばには ふたとおりの いみが あります。'),
    ],
  },
  'n4m-g-6a687c': {
    meaning: 'no matter how (much) ~',
    structure: 'いくら + V-て／Adj-くて + も；いくら + N／Na + でも',
    explanation:
      'いくら with ても says the degree does not matter: however much you try, the result is the same. いくら頑張っても “no matter how hard I try”. On its own, いくら asks “how much (money)?”, and いくらでも means “as much as you like”.',
    functions: ['concessions'],
    examples: [
      ex('いくら 練習しても、うまく ならない。', "However much I practise, I don't get any better.", 'いくら れんしゅうしても、うまく ならない。'),
      ex('いくら 安くても、そんな 物は いらない。', "However cheap it is, I don't need something like that.", 'いくら やすくても、そんな ものは いらない。'),
    ],
  },
  'n4m-nnv-b20ece': {
    meaning: 'to make / let someone (do an intransitive action)',
    structure: 'N1 が + N2 を + V-intransitive-causative（走らせる・待たせる）',
    explanation:
      'With intransitive verbs, the person made to act usually takes を: 子供を走らせる, 友達を待たせる. This is also how Japanese says “keep someone waiting” (待たせてすみません). Emotional verbs take を too: 母を悲しませる “make my mother sad”.',
    functions: ['forced'],
    examples: [
      ex('長い 間 待たせて しまって、すみません。', 'I’m sorry to have kept you waiting so long.', 'ながい あいだ またせて しまって、すみません。'),
      ex('あまり 両親を 心配させては いけない。', 'You shouldn’t make your parents worry too much.', 'あまり りょうしんを しんぱいさせては いけない。'),
    ],
  },
  'n4m-g-d2eb58': {
    meaning: 'if (supposing) ~',
    structure: 'もし + V-たら／Adj-かったら／N だったら',
    explanation:
      'もし announces at the start of a sentence that a hypothetical condition is coming, and たら (or ば, なら) completes it. It makes the supposition feel more uncertain or imaginary. もし alone is never enough; the conditional ending is still required.',
    functions: ['condition', 'assumptions'],
    examples: [
      ex('もし 宝くじが 当たったら、何を しますか。', 'If you won the lottery, what would you do?', 'もし たからくじが あたったら、なにを しますか。'),
      ex('もし 明日 雨だったら、試合は 中止です。', 'If it rains tomorrow, the match is off.', 'もし あした あめだったら、しあいは ちゅうしです。'),
    ],
  },
  'n4m-nghi-v-n-t-tr-t-845fac': {
    title: '疑問詞＋（助詞）＋も',
    meaning: 'question word + も: every / no ~ (all-inclusive)',
    structure: 'Question word +（particle）+ も：誰も・何も・どこにも（negative）；いつも・どれも・どちらも（affirmative）',
    explanation:
      'も after a question word makes it all-inclusive. With a negative it means “no one, nothing, nowhere”: どこにも行かない. With an affirmative it means “every”: どれもおいしい. Particles other than が and を go before も: 誰にも, どこへも.',
    functions: ['invariant', 'emphasize-negative'],
    examples: [
      ex('日曜日は どこにも 行かなかった。', "I didn't go anywhere on Sunday.", 'にちようびは どこにも いかなかった。'),
      ex('この 店の ケーキは どれも おいしい。', 'Every cake in this shop is delicious.', 'この みせの けーきは どれも おいしい。'),
    ],
  },
  'n4m-nn-v-b50aa4': {
    meaning: 'causative with を (forced) vs に (allowed)',
    structure: 'N1 が + N2 を／に + V-intransitive-causative（行かせる）',
    explanation:
      'With intransitive verbs the doer can take を or に, and the choice matters. を suggests forcing regardless of the person’s wishes (子供を塾に行かせる), while に respects their will and sounds like permission (子供に好きな所へ行かせる). With transitive verbs only に is possible.',
    functions: ['forced', 'allow'],
    examples: [
      ex('母は 嫌がる 弟を 塾に 行かせた。', 'My mother made my reluctant brother go to cram school.', 'ははは いやがる おとうとを じゅくに いかせた。'),
      ex('父は 私に 一人で 旅行に 行かせて くれた。', 'My father let me go travelling on my own.', 'ちちは わたしに ひとりで りょこうに いかせて くれた。'),
    ],
  },
  'n4m-v-8059b2': {
    meaning: "still can't ~; can't ~ yet",
    structure: 'まだ + V-potential negative（られない／書けない）',
    explanation:
      'まだ with a negative potential says an ability or possibility has not arrived yet: まだ泳げない “can’t swim yet”. With verbs of feeling it expresses lingering disbelief: まだ信じられない “I still can’t believe it”. The implication is that it may change later.',
    functions: ['negative', 'ability'],
    examples: [
      ex('合格したなんて、まだ 信じられない。', "I still can't believe I passed.", 'ごうかくしたなんて、まだ しんじられない。'),
      ex('娘は まだ 一人で 自転車に 乗れない。', "My daughter can't ride a bike on her own yet.", 'むすめは まだ ひとりで じてんしゃに のれない。'),
    ],
  },
  'n4m-g-0dbdaf': {
    meaning: '(sentence-final から) so (don’t worry / be warned)',
    structure: 'Plain / polite form + から（。）',
    explanation:
      'Left at the end of a sentence, から states a reason whose conclusion the listener can work out: すぐ戻るから “I’ll be right back (so wait)”. It is used to reassure (大丈夫だから), to promise or to warn (もう知らないから). The unspoken main clause makes it sound personal and emotional.',
    functions: ['cause-reason', 'warning'],
    examples: [
      ex('すぐ 戻るから、ここで 待ってて。', "I'll be right back, so wait here.", 'すぐ もどるから、ここで まってて。'),
      ex('心配しないで。私が 何とか するから。', "Don't worry. I'll sort something out.", 'しんぱいしないで。わたしが なんとか するから。'),
    ],
  },
  'n4m-g-efbf50': {
    meaning: 'a person who easily feels ~ (寒がり, 怖がり)',
    structure: 'Adj stem + がり（屋）',
    explanation:
      'がり makes a noun for someone who tends to show a feeling: 寒がり “someone who feels the cold”, 怖がり “a scaredy-cat”, 恥ずかしがり屋 “a shy person”. It comes from the verb がる (“show signs of feeling”). 屋 is often added for people.',
    functions: ['characteristics'],
    examples: [
      ex('私は 寒がりなので、冬が 苦手です。', "I feel the cold easily, so I don't like winter.", 'わたしは さむがりなので、ふゆが にがてです。'),
      ex('弟は 恥ずかしがり屋で、人前で 話せない。', "My little brother is shy and can't speak in front of people.", 'おとうとは はずかしがりやで、ひとまえで はなせない。'),
    ],
  },
  'n4m-g-531745': {
    meaning: 'just by ~; just ~ is enough to …',
    structure: 'V-dict／N + だけで, …',
    explanation:
      'だけで says that something minimal is enough to bring about the result: 見るだけで楽しい “just looking is fun”, 考えるだけで怖い “just thinking about it is scary”. It can also mean “only with”: 水だけで生きる.',
    functions: ['limit'],
    examples: [
      ex('海を 見て いる だけで、気持ちが 落ち着く。', 'Just looking at the sea calms me down.', 'うみを みて いる だけで、きもちが おちつく。'),
      ex('この 料理は 材料を 混ぜる だけで できます。', 'You can make this dish just by mixing the ingredients.', 'この りょうりは ざいりょうを まぜる だけで できます。'),
    ],
  },
  'n4m-g-2d824f': {
    meaning: 'every other ~; at intervals of ~',
    structure: 'Number + counter + おきに',
    explanation:
      'おきに marks a regular interval. With days it skips one: 一日おきに “every other day”. With small time units such as minutes it is usually the interval itself: 五分おきにバスが来る “a bus every five minutes”. ごとに is similar but counts each unit.',
    functions: ['frequency'],
    examples: [
      ex('一日 おきに ジムに 通って います。', 'I go to the gym every other day.', 'いちにち おきに じむに かよって います。'),
      ex('この 駅には 十分 おきに 電車が 来ます。', 'Trains come to this station every ten minutes.', 'この えきには じゅっぷん おきに でんしゃが きます。'),
    ],
  },
  'n4m-g-7e680a': {
    meaning: 'to do (honorific of する)',
    structure: 'N + を + なさる（なさいます）；する-noun + なさる',
    explanation:
      'なさる is the respectful verb for する, used for what a respected person does: 社長はゴルフをなさる. Its masu form is なさいます, not なさります. The imperative なさい (V-stem + なさい) is its familiar descendant, used by parents and teachers.',
    functions: ['reverent-humble'],
    examples: [
      ex('週末は 何を なさいますか。', 'What will you be doing at the weekend?', 'しゅうまつは なにを なさいますか。'),
      ex('先生は 毎朝 散歩を なさって いる そうです。', 'I hear the teacher takes a walk every morning.', 'せんせいは まいあさ さんぽを なさって いる そうです。'),
    ],
  },
  'n4m-g-7d606c': {
    meaning: 'or; either ~ or ~ (formal)',
    structure: 'A または B',
    explanation:
      'または offers alternatives in a formal or written style, common on forms, signs and instructions: 電話またはメールで. In conversation か or それか is more natural. あるいは is a close synonym with a slightly more literary feel.',
    functions: ['selective'],
    examples: [
      ex('お問い合わせは 電話 または メールで どうぞ。', 'Please contact us by phone or email.', 'おといあわせは でんわ または めーるで どうぞ。'),
      ex('黒 または 青の ペンで 書いて ください。', 'Please write in black or blue pen.', 'くろ または あおの ぺんで かいて ください。'),
    ],
  },
  'n4m-g-1d7b8d': {
    meaning: 'humble-polite words used toward the listener (申す, おる, 参る, ございます)',
    structure: 'N と 申します；V-て おります；参ります；ございます',
    explanation:
      'Some humble verbs do not lower you toward a particular person but simply make your speech courteous to the listener: 田中と申します, 東京に住んでおります, 電車が参ります. This layer is typical of business, announcements and self-introductions. ございます is the formal あります.',
    functions: ['reverent-humble'],
    examples: [
      ex('はじめまして。山田と 申します。', "How do you do? My name is Yamada.", 'はじめまして。やまだと もうします。'),
      ex('まもなく 一番線に 電車が 参ります。', 'A train will shortly arrive at platform one.', 'まもなく いちばんせんに でんしゃが まいります。'),
    ],
  },
  'n4m-g-f40c61': {
    meaning: 'it seems that ~ (judging from what one sees)',
    structure: 'Plain form + と 見える（とみえて）',
    explanation:
      'とみえる draws a conclusion from visible evidence: 疲れているとみえて、すぐ寝てしまった “he must have been tired, for he fell asleep at once”. It is somewhat written and the reasoning is often stated in the same sentence. In speech, ようだ or らしい are more common.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('よほど 疲れて いたと みえて、彼は すぐに 寝て しまった。', 'He must have been very tired, as he fell asleep straight away.', 'よほど つかれて いたと みえて、かれは すぐに ねて しまった。'),
      ex('誰も 出ない ところを 見ると、留守だと みえる。', 'Since no one is answering, it seems they are out.', 'だれも でない ところを みると、るすだと みえる。'),
    ],
  },
  'n4m-g-1a9ed2': {
    meaning: 'so that ~; in order that ~',
    structure: 'V-dict／V-ない／V-potential + ように, …',
    explanation:
      'ように gives a purpose that is a state or ability rather than a deliberate act: 聞こえるように大きな声で話す “speak loudly so they can hear”. Non-volitional verbs, potentials and negatives go before it. For a deliberate action by the same subject, use ために.',
    functions: ['purpose-goal'],
    examples: [
      ex('後ろの 人にも 聞こえる ように、大きな 声で 話して ください。', 'Please speak loudly so that the people at the back can hear.', 'うしろの ひとにも きこえる ように、おおきな こえで はなして ください。'),
      ex('忘れない ように、手帳に 書いて おこう。', "I'll write it in my planner so I don't forget.", 'わすれない ように、てちょうに かいて おこう。'),
    ],
  },
  'n4m-g-99480d': {
    meaning: 'at last; finally (after a long wait or effort)',
    structure: 'やっと + V-た；やっと + V-dict（barely）',
    explanation:
      'やっと expresses relief that something long awaited has finally happened: やっと終わった. With a non-past or potential verb it can mean “only just, barely”: やっと間に合う. ようやく is similar but more written, and ついに suits a dramatic end point.',
    functions: ['finish'],
    examples: [
      ex('三時間 待って、やっと 順番が 来た。', 'After waiting three hours, my turn finally came.', 'さんじかん まって、やっと じゅんばんが きた。'),
      ex('走って、やっと 最終電車に 間に合った。', 'I ran and only just made the last train.', 'はしって、やっと さいしゅうでんしゃに まにあった。'),
    ],
  },
  'n4m-g-03e9ae': {
    structure: 'Plain form (N / Na without だ) + かしら；V-て もらえない + かしら',
    explanation:
      'かしら is a soft “I wonder”, traditionally feminine, used when thinking aloud: 明日は晴れるかしら. With a negative request it becomes a gentle ask: 手伝ってもらえないかしら “I wonder if you could help”. かな is the neutral equivalent.',
    functions: ['speculation', 'request'],
    examples: [
      ex('明日は 晴れるかしら。', 'I wonder if it will be sunny tomorrow.', 'あしたは はれるかしら。'),
      ex('ちょっと 手伝って もらえないかしら。', 'I wonder if you could give me a hand.', 'ちょっと てつだって もらえないかしら。'),
    ],
  },
  'n4m-g-deed27': {
    meaning: 'hard to ~; awkward to ~ (for the person doing it)',
    structure: 'V-ます stem + づらい',
    explanation:
      'づらい says an action is hard because of discomfort, physical or emotional: 言いづらい “hard to say (it would be awkward)”, 歩きづらい靴. にくい describes difficulty as a property of the thing and is more objective; づらい is more personal.',
    functions: ['evaluate', 'feel'],
    examples: [
      ex('この 靴は 歩きづらい。', 'These shoes are hard to walk in.', 'この くつは あるきづらい。'),
      ex('先輩には ちょっと 言いづらい ことが ある。', "There's something that's a bit hard to say to my senior.", 'せんぱいには ちょっと いいづらい ことが ある。'),
    ],
  },
  'n4m-g-212f50': {
    meaning: 'and so; that is why; (in conversation) and then?',
    structure: 'Sentence。それで、…；（question）それで？',
    explanation:
      'それで links a situation to its natural consequence: 寝坊した。それで遅刻した. It is more neutral than だから and cannot introduce a command or request. In conversation, それで? urges the speaker to go on: “and then?”.',
    functions: ['cause-reason', 'comes-next'],
    examples: [
      ex('昨日は 熱が 出ました。それで 学校を 休みました。', 'I had a fever yesterday. That is why I missed school.', 'きのうは ねつが でました。それで がっこうを やすみました。'),
      ex('それで、その 後 どう なったの？', 'And then what happened?', 'それで、その あと どう なったの？'),
    ],
  },
  'n4m-g-7e4f98': {
    meaning: "(response) that's ~ (sympathy or admiration)",
    structure: 'それは + Adj（大変・残念・よかった）+ ですね',
    explanation:
      'それは sums up what the other person just said and attaches your reaction: それは大変でしたね “that must have been hard”. It is a basic listening response in polite conversation. Doubling it, それはそれは, adds exaggerated feeling.',
    functions: ['exclamatory', 'describe'],
    examples: [
      ex('「財布を なくして しまって…」「それは 大変でしたね。」', '"I lost my wallet..." "Oh, that must have been awful."', '「さいふを なくして しまって…」「それは たいへんでしたね。」'),
      ex('試験に 合格したんですか。それは よかったですね。', "You passed the exam? That's great news.", 'しけんに ごうかくしたんですか。それは よかったですね。'),
    ],
  },
  'n4m-g-d315ba': {
    meaning: 'causative forms; asking permission with させてください',
    structure: 'V-causative-て + ください（読ませて・休ませて・私に やらせて）',
    explanation:
      'The causative て-form plus ください asks to be allowed to do something yourself: 私にやらせてください “let me do it”. It is humbler and more eager than てもいいですか. In speech, う-verbs sometimes use a short causative (書かす, 読ます), which is colloquial.',
    functions: ['request-permission', 'forced'],
    examples: [
      ex('その 仕事、ぜひ 私に やらせて ください。', 'Please let me take on that job.', 'その しごと、ぜひ わたしに やらせて ください。'),
      ex('少し 考えさせて ください。', 'Please let me think about it for a while.', 'すこし かんがえさせて ください。'),
    ],
  },
  'n4m-g-f96343': {
    meaning: 'ways of forbidding, from harsh to formal',
    structure: 'V-dict + な ／ V-ない で（ください）／ V-ては いけない ／ V-ない こと ／ N 禁止',
    explanation:
      'Japanese forbids at different strengths. V-dict + な is harsh (触るな), ないでください is a polite request, てはいけない states a rule, and V-ないこと is the written style of instructions and school rules. On signs, N + 禁止 is the shortest form: 駐車禁止.',
    functions: ['ban'],
    examples: [
      ex('図書館では 大きな 声で 話さない こと。', 'Do not talk loudly in the library.', 'としょかんでは おおきな こえで はなさない こと。'),
      ex('ここは 駐車禁止です。車を 止めないで ください。', 'No parking here. Please do not leave your car.', 'ここは ちゅうしゃきんしです。くるまを とめないで ください。'),
    ],
  },
  'n4m-g-f2d09a': {
    meaning: 'besides; moreover; on top of that',
    structure: 'Sentence。それに、+ another point in the same direction',
    explanation:
      'それに adds another fact that supports the same conclusion: この店は安い。それに、おいしい. It is conversational; in writing, さらに or その上 are used. It cannot introduce a contrasting point; for that, use でも or しかし.',
    functions: ['add'],
    examples: [
      ex('この 部屋は 広い。それに、家賃も 安い。', "This room is spacious. What's more, the rent is cheap.", 'この へやは ひろい。それに、やちんも やすい。'),
      ex('今日は 疲れたし、それに 雨も 降って いる。', "I'm tired today, and besides, it's raining.", 'きょうは つかれたし、それに あめも ふって いる。'),
    ],
  },
  'n4m-g-d10ff2': {
    meaning: '~ more; another ~',
    structure: 'もう + number + counter／もう 少し／もう 一度',
    explanation:
      'Before a quantity, もう means “more, another”: もう一つ “one more”, もう一度 “once more”, もう少し “a little more”. It is a different use from もう “already”, and the two are told apart by what follows. 更に is the formal equivalent.',
    functions: ['amount', 'add'],
    examples: [
      ex('すみません、もう 一度 言って ください。', 'Sorry, could you say that once more?', 'すみません、もう いちど いって ください。'),
      ex('コーヒーを もう 一杯 いかがですか。', 'Would you like another cup of coffee?', 'こーひーを もう いっぱい いかがですか。'),
    ],
  },
  'n4m-g-cb3a40': {
    meaning: 'things like ~ (quoting, often dismissively)',
    structure: 'Quote／plain form + など と + 言う／思う',
    explanation:
      'など と quotes words or thoughts as an example of what was said, often with disapproval or surprise: 行きたくないなどと言う “says things like not wanting to go”. It softens or distances the quote. Casual speech uses なんて.',
    functions: ['speak', 'denote-by-example'],
    examples: [
      ex('弟は 宿題が 多すぎるなどと 文句を 言って いる。', 'My brother is complaining that there is too much homework and so on.', 'おとうとは しゅくだいが おおすぎるなどと もんくを いって いる。'),
      ex('失敗するなどと 思わないで、やって みよう。', "Don't go thinking you'll fail; just give it a try.", 'しっぱいするなどと おもわないで、やって みよう。'),
    ],
  },
  'n4m-g-1b9ece': {
    meaning: 'around (a time); the time when ~',
    structure: 'Time + ごろ；N の／V + ころ',
    explanation:
      'After a clock time or date, ごろ means “about”: 三時ごろ. As a noun, ころ (頃) means “the time when”: 子供のころ “when I was a child”. With ごろ, the particle に is optional (三時ごろ(に)来る). For amounts, use くらい instead.',
    functions: ['time', 'amount-roughly'],
    examples: [
      ex('毎晩 十一時ごろ 寝ます。', 'I go to bed around eleven every night.', 'まいばん じゅういちじごろ ねます。'),
      ex('子供の ころ、よく この 川で 泳いだ。', 'When I was a child, I often swam in this river.', 'こどもの ころ、よく この かわで およいだ。'),
    ],
  },
  'n4m-g-10a134': {
    meaning: 'surely; certainly; I bet',
    structure: 'きっと + plain form + （だろう／と思う／はずだ）',
    explanation:
      'きっと expresses the speaker’s strong personal conviction or hope: きっと大丈夫 “it will be fine, I’m sure”. It is about feeling, so it is common in encouragement. かならず is objective certainty (“without fail”) and suits rules and promises.',
    functions: ['speculation'],
    examples: [
      ex('あなたなら きっと 合格できるよ。', "I'm sure you'll pass.", 'あなたなら きっと ごうかくできるよ。'),
      ex('彼は きっと 来る と 思います。', "I'm certain he'll come.", 'かれは きっと くる と おもいます。'),
    ],
  },
  'n4m-g-d092bf': {
    meaning: 'to make into ~; to use as ~',
    structure: 'N1 を + N2 に + する',
    explanation:
      'Besides choosing (コーヒーにする), N1 を N2 にする turns one thing into another or puts it to a new use: 空き部屋を書斎にする “make the spare room into a study”. With numbers it changes an amount: 半分にする. Adjectives use the same frame (きれいにする).',
    functions: ['modify', 'decision'],
    examples: [
      ex('使って いない 部屋を 子供部屋に した。', 'We turned the unused room into a children’s room.', 'つかって いない へやを こどもべやに した。'),
      ex('ケーキを 半分に して、弟と 食べた。', 'I cut the cake in half and ate it with my brother.', 'けーきを はんぶんに して、おとうとと たべた。'),
    ],
  },
  'n4m-g-62e4ce': {
    meaning: 'there is a (smell / sound / taste / feeling of) ~',
    structure: 'N（におい・音・声・味・気・寒気）+ が する',
    explanation:
      'がする reports a sensation arriving on its own, not one you seek out: 変な音がする, ガスのにおいがする. Bodily feelings work the same way: 寒気がする “I feel chills”, 頭痛がする. 気がする means “have a feeling (that ~)”: 誰かに見られている気がする.',
    functions: ['feel'],
    examples: [
      ex('なんだか 誰かに 見られて いる 気が する。', 'Somehow I feel as if someone is watching me.', 'なんだか だれかに みられて いる きが する。'),
      ex('この スープは しょうがの 味が する。', 'This soup tastes of ginger.', 'この すーぷは しょうがの あじが する。'),
    ],
  },
  'n4m-g-deec0f': {
    meaning: 'could you please tell (someone) that ~?',
    structure: 'Person に + message + と 伝えて いただけませんか',
    explanation:
      'A polite request to pass on a message. と marks the message itself, and ていただけませんか keeps it courteous. On the phone, the listener often offers this first: 何かお伝えしましょうか. A less formal version is と伝えてもらえますか.',
    functions: ['request'],
    examples: [
      ex('田中さんに 明日 お電話しますと 伝えて いただけませんか。', 'Could you please tell Mr Tanaka that I will call tomorrow?', 'たなかさんに あした おでんわしますと つたえて いただけませんか。'),
      ex('会議に 少し 遅れると 部長に 伝えて いただけませんか。', 'Could you please tell the manager that I will be a little late for the meeting?', 'かいぎに すこし おくれると ぶちょうに つたえて いただけませんか。'),
    ],
  },
  'n4m-g-47c77e': {
    meaning: 'while ~ (at some point within that time)',
    structure: 'V-ている／N の + 間（あいだ）に, … (one-off action)',
    explanation:
      '間に places a single event somewhere inside a period: 留守の間に泥棒が入った “a burglar got in while we were away”. Without に, 間 would mean the event lasted the whole period. It is often used for getting something done while a chance lasts: 子供が寝ている間に.',
    functions: ['relationships-in-time', 'period'],
    examples: [
      ex('私が 留守の 間に、友達が 来た らしい。', 'Apparently a friend came by while I was out.', 'わたしが るすの あいだに、ともだちが きた らしい。'),
      ex('子供が 寝て いる 間に、掃除を 済ませた。', 'I finished the cleaning while the children were asleep.', 'こどもが ねて いる あいだに、そうじを すませた。'),
    ],
  },
  'n4m-g-b7a83b': {
    meaning: 'at least ~ (は after a quantity)',
    structure: 'Number + counter + は + V',
    explanation:
      'は after a number sets it as a minimum: 三日はかかる “it will take at least three days”. It often appears with 少なくとも to make this explicit. By contrast, も after a number stresses that the amount is large (三日もかかった “took as much as three days”).',
    functions: ['amount', 'limit'],
    examples: [
      ex('修理には 少なくとも 一週間は かかります。', 'The repair will take at least a week.', 'しゅうりには すくなくとも いっしゅうかんは かかります。'),
      ex('一日に 七時間は 寝たい。', 'I want at least seven hours of sleep a day.', 'いちにちに しちじかんは ねたい。'),
    ],
  },
  'n4m-g-0d9e6a': {
    meaning: 'a little while ago; just now',
    structure: 'さっき + V-た；さっき の + N',
    explanation:
      'さっき refers to a moment earlier today, usually minutes or a few hours ago: さっき電話があった. It is conversational; the written equivalent is 先ほど, which is also the polite choice at work. さっきの人 means “the person from a moment ago”.',
    functions: ['short-time', 'time'],
    examples: [
      ex('さっき 田中さんから 電話が ありましたよ。', 'Tanaka called a little while ago.', 'さっき たなかさんから でんわが ありましたよ。'),
      ex('さっきの 話の 続きを 聞かせて。', 'Tell me the rest of what you were saying earlier.', 'さっきの はなしの つづきを きかせて。'),
    ],
  },
  'n4m-g-3b9b37': {
    meaning: 'by / with (means); because of (cause); in (scope)',
    structure: 'N（means／cause／scope）+ で',
    explanation:
      'で marks how an action is done (バスで行く, 日本語で話す), a cause (病気で休む, 地震で壊れた) and the scope of a statement (クラスで一番). A common error is using に for means: always 箸で食べる. For a cause, で takes a noun; with a clause, use ので or て.',
    functions: ['means-methods', 'cause-reason'],
    examples: [
      ex('毎日 自転車で 学校に 行きます。', 'I go to school by bicycle every day.', 'まいにち じてんしゃで がっこうに いきます。'),
      ex('台風で 飛行機が 飛ばなかった。', "The plane didn't fly because of the typhoon.", 'たいふうで ひこうきが とばなかった。'),
    ],
  },
  'n4m-g-ac50f8': {
    meaning: 'as many / as much / as long as ~ (emphasis on a large amount)',
    structure: 'Number + counter + も',
    explanation:
      'も after a quantity signals that the speaker finds it large: 三時間も待った “I waited a full three hours”. With a negative it means “not even”: 一人も来なかった. Compare は after a number, which sets a minimum instead.',
    functions: ['emphasize', 'amount'],
    examples: [
      ex('駅で 二時間も 待たされた。', 'I was kept waiting at the station for two whole hours.', 'えきで にじかんも またされた。'),
      ex('あの 人は 車を 三台も 持って いる。', 'That person owns no fewer than three cars.', 'あの ひとは くるまを さんだいも もって いる。'),
    ],
  },
  'n4m-l-ng-t-e9c019': {
    title: '数量詞＋で',
    meaning: '(with a quantity) in total; as a group of ~; for ~',
    structure: 'Number + counter + で（全部で・三人で・千円で）',
    explanation:
      'で after a quantity marks it as the unit the action is done in: 三人で行く “go as a group of three”, 一人で “on my own”, 全部で “in total”. With prices it means “for”: 千円で買った “bought it for 1,000 yen”. Compare に after a quantity, which gives a rate: 一日に三回.',
    functions: ['amount'],
    examples: [
      ex('全部で いくらに なりますか。', 'How much does it come to in total?', 'ぜんぶで いくらに なりますか。'),
      ex('週末は 家族 四人で 旅行に 行きます。', 'At the weekend the four of us in the family are going on a trip.', 'しゅうまつは かぞく よにんで りょこうに いきます。'),
    ],
  },
  'n4m-g-e29de2': {
    meaning: 'please make it ~ (requests in shops and daily life)',
    structure: 'N に／Adj-く + して ください（して もらえますか）',
    explanation:
      'The change-of-state frame にする／くする is a handy request form: 大盛りにしてください “make it a large portion”, 少し短くしてください “cut it a little shorter” at the hairdresser. 静かにしてください (“please be quiet”) is the most common case.',
    functions: ['request', 'modify'],
    examples: [
      ex('ご飯は 大盛りに して ください。', 'A large portion of rice, please.', 'ごはんは おおもりに して ください。'),
      ex('前髪を 少し 短く して もらえますか。', 'Could you make my fringe a little shorter?', 'まえがみを すこし みじかく して もらえますか。'),
    ],
  },
  'n4m-g-6b2d22': {
    meaning: 'we ask you to ~ (formal request in notices)',
    structure: 'お + V-ます stem + 願います／ご + する-noun + 願います',
    explanation:
      'A formal request typical of announcements, signs and business letters: お待ち願います “please wait”, ご協力願います “we ask for your cooperation”. It is impersonal and firm rather than warm. In face-to-face speech, お〜ください is more common.',
    functions: ['request', 'reverent-humble'],
    examples: [
      ex('順番に なるまで、こちらで お待ち 願います。', 'Please wait here until it is your turn.', 'じゅんばんに なるまで、こちらで おまち ねがいます。'),
      ex('節電に ご協力 願います。', 'We ask for your cooperation in saving electricity.', 'せつでんに ごきょうりょく ねがいます。'),
    ],
  },
  'n4m-v-8b4a56': {
    meaning: 'not even ~ (the most basic thing)',
    structure: 'N（もの・言葉など）+ も + V-ない（V-ずに）',
    explanation:
      'も after a basic noun and a negative says that even the minimum was not done: ろくに物も言わない “hardly says a word”, 食べるものも食べずに働く “works without even eating properly”. It stresses how extreme a situation is.',
    functions: ['emphasize-negative', 'negative'],
    examples: [
      ex('彼は 怒って、物も 言わずに 出て いった。', 'He got angry and left without a word.', 'かれは おこって、ものも いわずに でて いった。'),
      ex('忙しくて、食べる ものも 食べずに 働いて いる。', "I'm so busy I work without even eating properly.", 'いそがしくて、たべる ものも たべずに はたらいて いる。'),
    ],
  },
  'n4m-g-cf232b': {
    meaning: 'would you like to ~?; won’t you ~? (invitation)',
    structure: 'V-ます stem + ませんか',
    explanation:
      'A negative question makes a polite, low-pressure invitation: 一緒に行きませんか “won’t you come with me?”. It is gentler than ましょうか, because it lets the listener decline. To accept, say いいですね; to decline, ちょっと….',
    functions: ['invite-suggest'],
    examples: [
      ex('今度の 土曜日、一緒に 映画を 見ませんか。', "Would you like to see a film with me this Saturday?", 'こんどの どようび、いっしょに えいがを みませんか。'),
      ex('少し 休みませんか。', "Shall we take a short break?", 'すこし やすみませんか。'),
    ],
  },
  'n4m-g-6bb575': {
    meaning: 'maybe as much as ~ (estimating a large amount)',
    structure: 'Number + counter + も + ある／いる + だろうか',
    explanation:
      'も with a quantity and だろうか gives a rough, impressed estimate: 二メートルもあるだろうか “he must be nearly two metres tall”. The speaker is guessing and signalling that the amount seems large. In speech, かな replaces だろうか.',
    functions: ['amount-roughly', 'speculation'],
    examples: [
      ex('あの 木は 高さが 二十メートルも あるだろうか。', 'That tree must be twenty metres tall, if not more.', 'あの きは たかさが にじゅうめーとるも あるだろうか。'),
      ex('会場には 千人も いただろうか。', 'There may have been as many as a thousand people in the hall.', 'かいじょうには せんにんも いただろうか。'),
    ],
  },
  'n4m-t-ch-s-l-ng-863d2e': {
    title: '数量詞＋も…か',
    meaning: 'about as much as ~? (casual estimate)',
    structure: 'Number + counter + も + V（かかる・ある）+ かな／か',
    explanation:
      'The conversational counterpart of the estimate with だろうか: 一時間もかかるかな “will it take as long as an hour?”. The も marks the figure as large in the speaker’s eyes, and かな softens the guess. The answer usually revises the figure up or down.',
    functions: ['amount-roughly'],
    examples: [
      ex('ここから 駅まで、歩いて 三十分も かかるかな。', 'From here to the station on foot, would it take as long as thirty minutes?', 'ここから えきまで、あるいて さんじゅっぷんも かかるかな。'),
      ex('あの 店に 客が 百人も 来るかな。', 'Would as many as a hundred customers really come to that shop?', 'あの みせに きゃくが ひゃくにんも くるかな。'),
    ],
  },
  'n4m-n-3467ec': {
    meaning: 'to / as far as N (destination)',
    structure: 'N（place）+ まで + V（行く・送る・届ける）；N までの + N',
    explanation:
      'まで marks the end point of a movement, often with the means or distance in view: 駅まで歩く “walk (all the way) to the station”. It suits taking or sending someone somewhere: 家まで送る. Before a noun it is までの: 空港までのバス.',
    functions: ['time-direction', 'direction'],
    examples: [
      ex('駅まで 車で 送りましょうか。', 'Shall I drive you to the station?', 'えきまで くるまで おくりましょうか。'),
      ex('空港までの バスは どこから 出ますか。', 'Where does the bus to the airport leave from?', 'くうこうまでの ばすは どこから でますか。'),
    ],
  },
  'n4m-nghi-v-n-t-983e9e': {
    title: '疑問詞＋か',
    meaning: 'some- (someone, something, somewhere, sometime)',
    structure: 'Question word + か：誰か・何か・どこか・いつか・どれか',
    explanation:
      'か after a question word makes an indefinite: 誰か “someone”, どこか “somewhere”. が and を are usually dropped after it, while other particles follow: どこかへ, 誰かに. For the negative (“no one”), use the question word with も instead.',
    functions: ['vague'],
    examples: [
      ex('誰か 手伝って くれませんか。', 'Could someone help me?', 'だれか てつだって くれませんか。'),
      ex('夏休みに どこかへ 行きたい。', 'I want to go somewhere during the summer holiday.', 'なつやすみに どこかへ いきたい。'),
    ],
  },
  'n4m-g-9ecb53': {
    meaning: "weren't you supposed to ~?; (んじゃなかった) I shouldn't have ~",
    structure: 'Plain form + んじゃなかったか（のではなかったか）',
    explanation:
      'A past negative question that confronts an expectation: 今日は休むんじゃなかったか “weren’t you taking today off?”. It often sounds like mild reproach. Without か, V-dict + んじゃなかった expresses the speaker’s regret: 来るんじゃなかった “I shouldn’t have come”.',
    functions: ['confirm', 'regret'],
    examples: [
      ex('君は 今日 休むんじゃ なかったか。', "Weren't you supposed to be off today?", 'きみは きょう やすむんじゃ なかったか。'),
      ex('こんなに 混むなら、来るんじゃ なかった。', "If it was going to be this crowded, I shouldn't have come.", 'こんなに こむなら、くるんじゃ なかった。'),
    ],
  },
  'n4m-g-dcc13c': {
    meaning: 'who knows what / why ~ (exasperation)',
    structure: 'Question word … + plain form + んだか（分からない）',
    explanation:
      'A question word with んだか wraps an unanswerable question: 何を考えているんだか “who knows what he is thinking”. It often trails off without 分からない, leaving exasperation or resignation. 何だか on its own means “somehow”.',
    functions: ['vague', 'criticize'],
    examples: [
      ex('あの 人は 何を 考えて いるんだか。', 'Who knows what that person is thinking.', 'あの ひとは なにを かんがえて いるんだか。'),
      ex('どこに 行ったんだか、全然 連絡が ない。', "Goodness knows where he went; there's been no word at all.", 'どこに いったんだか、ぜんぜん れんらくが ない。'),
    ],
  },
  'n4m-g-957f14': {
    meaning: 'to make it look as if ~; to pretend',
    structure: 'Plain form (N の／Na な) + ように 見せる（見せかける）',
    explanation:
      'ように見せる creates a false impression on purpose: 知っているように見せる “make it look as if you know”. The subject is doing the deceiving. 見せかける is a stronger synonym, and ふりをする (“pretend”) focuses on acting.',
    functions: ['similarity-degree', 'change-the-way'],
    examples: [
      ex('彼は 忙しい ように 見せて いるが、実は 暇だ。', 'He makes it look as if he is busy, but actually he has nothing to do.', 'かれは いそがしい ように みせて いるが、じつは ひまだ。'),
      ex('部屋に いる ように 見せる ため、電気を つけて おいた。', 'I left the lights on to make it look as if someone was in.', 'へやに いる ように みせる ため、でんきを つけて おいた。'),
    ],
  },
  'n4m-t-ch-s-l-ng-cb33d9': {
    title: '数量詞＋する',
    meaning: '(after) ~ passes; to cost ~',
    structure: 'Time amount + する（と／ば／たら）；Price + する',
    explanation:
      'After a length of time, する means “pass, elapse”: 三日もすれば治る “it will heal in three days or so”. After a price it means “cost”, usually with surprise: このかばんは十万円もする. Both uses need a quantity before する.',
    functions: ['time', 'amount'],
    examples: [
      ex('あと 五分 すると、映画が 始まります。', 'The film starts in five minutes.', 'あと ごふん すると、えいがが はじまります。'),
      ex('この 時計は 五十万円も する そうだ。', 'I hear this watch costs a whopping 500,000 yen.', 'この とけいは ごじゅうまんえんも する そうだ。'),
    ],
  },
  'n4m-g-7399cd': {
    meaning: 'many (times / people / days); (with negative) not a single',
    structure: '何（なん）+ counter + も（何回も・何人も・何日も）',
    explanation:
      '何 plus a counter plus も stresses a large, uncounted number: 何回も “again and again”, 何人も “lots of people”. With a negative the counter usually becomes 一: 一回も行ったことがない. Compare 何か (“some”) and 何も (“nothing”).',
    functions: ['emphasize', 'amount'],
    examples: [
      ex('何回も 練習して、やっと できる ように なった。', 'After practising over and over, I could finally do it.', 'なんかいも れんしゅうして、やっと できる ように なった。'),
      ex('あの 店の 前には 何人も 並んで いた。', 'There were lots of people queuing in front of that shop.', 'あの みせの まえには なんにんも ならんで いた。'),
    ],
  },
  'n4m-g-963a8b': {
    meaning: 'to be scheduled to ~; to plan to ~',
    structure: 'V-dict／N の + 予定だ（予定です）',
    explanation:
      '予定だ presents something as fixed on the schedule, not just intended: 三時に着く予定です. It is more objective than つもりだ, which states a personal intention, and it is common for trains, events and meetings. The noun form is 予定がある “have plans”.',
    functions: ['plan'],
    examples: [
      ex('飛行機は 午後 三時に 着く 予定です。', 'The plane is scheduled to arrive at three in the afternoon.', 'ひこうきは ごご さんじに つく よていです。'),
      ex('来月、大阪に 出張の 予定が ある。', 'I have a business trip to Osaka scheduled for next month.', 'らいげつ、おおさかに しゅっちょうの よていが ある。'),
    ],
  },
  'n4m-g-d24ecd': {
    meaning: 'when (I) ~, (I found / it happened that) …',
    structure: 'V-dict + と, … + V-た',
    explanation:
      'In narrative, と followed by a past clause reports what the subject discovered or what happened next: ドアを開けると、猫がいた. It sounds more like storytelling than たら, which is the usual choice in conversation. The second clause is outside the subject’s control.',
    functions: ['unexpected-outcome', 'time-sequence'],
    examples: [
      ex('箱を 開けると、中に 手紙が 入って いた。', 'When I opened the box, there was a letter inside.', 'はこを あけると、なかに てがみが はいって いた。'),
      ex('外に 出ると、雪が 降って いた。', 'When I went outside, it was snowing.', 'そとに でると、ゆきが ふって いた。'),
    ],
  },
  'n4m-g-713715': {
    structure: 'まるで + N の／V + ようだ（みたいだ）；まるで + N の よう な N',
    explanation:
      'まるで signals that a comparison is coming and that it is figurative: まるで夢のようだ “it’s just like a dream”. It needs ようだ or みたいだ to finish the sentence. Because it marks the comparison as unreal, it is not used for genuine guesses.',
    functions: ['similarity-degree'],
    examples: [
      ex('今日は まるで 夏の ように 暑い。', "Today it's as hot as summer.", 'きょうは まるで なつの ように あつい。'),
      ex('彼女は 日本語が 上手で、まるで 日本人みたいだ。', 'Her Japanese is so good she sounds just like a native speaker.', 'かのじょは にほんごが じょうずで、まるで にほんじんみたいだ。'),
    ],
  },
  'n4m-g-7046fa': {
    meaning: 'I think it may be ~; I suspect ~',
    structure: 'Plain form (Na / N without だ) + の では ないかと 思う',
    explanation:
      'A modest way to state an opinion: “I think (perhaps) ~”. The negative question distances the speaker from the claim, so it is common in essays, meetings and when disagreeing politely. After verbs and い-adjectives, の is inserted (のではないか); in speech it becomes んじゃないかと思う.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('この 計画は 少し 無理なのでは ないかと 思います。', 'I suspect this plan may be a little unrealistic.', 'この けいかくは すこし むりなのでは ないかと おもいます。'),
      ex('彼は もう その ことを 知って いるのでは ないかと 思う。', 'I think he may already know about it.', 'かれは もう その ことを しって いるのでは ないかと おもう。'),
    ],
  },
  'n4m-g-e8e1ea': {
    meaning: 'after; later; the rest; behind (following)',
    structure: 'V-た／N の + あと（で）；あと + quantity；N の あと に ついて いく',
    explanation:
      'あと (後) has several related uses: “after” (食事のあとで), “later” (あとで電話する), “remaining” (あと五分 “five more minutes”) and, spatially, “behind, following” in phrases like あとについて行く. For a physical position behind something, 後ろ is the usual word.',
    functions: ['time-sequence', 'direction'],
    examples: [
      ex('ガイドの あとに ついて 歩いて ください。', 'Please walk behind the guide.', 'がいどの あとに ついて あるいて ください。'),
      ex('あと 五分で 駅に 着きます。', "We'll arrive at the station in five more minutes.", 'あと ごふんで えきに つきます。'),
    ],
  },
  'n4m-g-960992': {
    meaning: 'would you do ~ for (him / her)? (asking on someone’s behalf)',
    structure: '（Person の）N を + V-て形 + やって くれないか',
    explanation:
      'The speaker asks the listener to do a favour for someone on the speaker’s side, typically a child or junior: 息子の宿題を見てやってくれないか. やる marks the favour for the third person, and くれないか makes the request, blunt and masculine. Softer: あげてくれない? or あげてもらえますか.',
    functions: ['request', 'benefit'],
    examples: [
      ex('妹の 相談に 乗って やって くれないか。', 'Would you give my little sister some advice?', 'いもうとの そうだんに のって やって くれないか。'),
      ex('あいつが 困って いたら、助けて やって くれないか。', "If he's in trouble, would you help him out?", 'あいつが こまって いたら、たすけて やって くれないか。'),
    ],
  },
  'n4m-g-f3de6e': {
    meaning: "(I) have to ~; must (clipped)",
    structure: 'V-ない + と（。）（＝ないと いけない）',
    explanation:
      'Ending a sentence at ないと drops いけない or だめだ, leaving a casual “I’ve got to ~”: もう帰らないと. It is extremely common in speech. なきゃ is an even more casual version. In writing, finish the full form.',
    functions: ['necessary-obligation'],
    examples: [
      ex('もう こんな 時間。早く 帰らないと。', "Look at the time. I have to get home.", 'もう こんな じかん。はやく かえらないと。'),
      ex('明日 テストだから、勉強しないと。', "There's a test tomorrow, so I need to study.", 'あした てすとだから、べんきょうしないと。'),
    ],
  },
  'n4m-g-48476d': {
    meaning: 'whenever ~, (I used to) …',
    structure: 'V-dict + と, … + V-た（ものだ）',
    explanation:
      'と with a past main clause can describe a past habit: every time A happened, B followed. Adding ものだ gives a nostalgic tone: “I used to ~”. The main clause verb is past, and the whole describes repeated events, not one occasion.',
    functions: ['repeat-habits', 'relationships-in-time'],
    examples: [
      ex('子供の ころ、学校から 帰ると すぐ 外で 遊んだ ものだ。', 'As a child, I would go straight out to play whenever I got home from school.', 'こどもの ころ、がっこうから かえると すぐ そとで あそんだ ものだ。'),
      ex('祖母は 私が 行くと、いつも お菓子を くれた。', 'Whenever I visited, my grandmother always gave me sweets.', 'そぼは わたしが いくと、いつも おかしを くれた。'),
    ],
  },
  'n4m-g-760f09': {
    meaning: 'even though (I) ~, still …',
    structure: 'V-て形／Adj-くて + も, … + V-た（negative）',
    explanation:
      'With a past main clause, ても describes an attempt that did not produce the expected result: 薬を飲んでも治らなかった. Unlike のに, it states the fact without much complaint. いくら〜ても adds “however much”.',
    functions: ['concessions'],
    examples: [
      ex('薬を 飲んでも、熱が 下がらなかった。', "Even though I took the medicine, my fever didn't go down.", 'くすりを のんでも、ねつが さがらなかった。'),
      ex('何度 電話しても、彼は 出なかった。', "However many times I called, he didn't pick up.", 'なんど でんわしても、かれは でなかった。'),
    ],
  },
  'n4m-g-acac8e': {
    meaning: 'if it is ~ (we are talking about), then … is best',
    structure: 'N + なら, (evaluation) + だ',
    explanation:
      'なら picks up a topic and gives the speaker’s recommendation within that range: 日本料理なら、すしが一番だ “if it’s Japanese food, sushi is the best”. It often responds to something the other person just mentioned. The second half is a judgement or advice.',
    functions: ['range', 'evaluate'],
    examples: [
      ex('温泉なら、箱根が いいですよ。', 'If it’s hot springs you want, Hakone is good.', 'おんせんなら、はこねが いいですよ。'),
      ex('数学の ことなら、田中さんに 聞くのが 一番だ。', "When it comes to maths, asking Tanaka is the best bet.", 'すうがくの ことなら、たなかさんに きくのが いちばんだ。'),
    ],
  },
  'n4m-g-64d8fd': {
    meaning: 'perhaps; possibly; by any chance',
    structure: 'もしかしたら（もしかすると）+ plain form + かもしれない／か',
    explanation:
      'もしかしたら marks a low-probability guess and is usually completed by かもしれない. In questions it means “by any chance”: もしかして田中さんですか. It is less certain than たぶん and much less than きっと.',
    functions: ['speculation'],
    examples: [
      ex('もしかしたら、明日は 雪が 降るかもしれない。', 'It might possibly snow tomorrow.', 'もしかしたら、あしたは ゆきが ふるかもしれない。'),
      ex('もしかして、山田さんの お兄さんですか。', "Are you by any chance Yamada's older brother?", 'もしかして、やまださんの おにいさんですか。'),
    ],
  },
  'n4m-g-f8b138': {
    meaning: 'good; fine; (もういい) enough, no thanks',
    structure: 'いい（よい）→ よかった・よくない・よければ',
    explanation:
      'いい is the everyday form of よい, and all its conjugations are built on よ-: よかった, よくない, よければ. Besides “good”, it answers offers: いいです can mean “no thanks” depending on tone, and もういい means “that’s enough”. It also forms advice and permission patterns (ばいい, てもいい).',
    functions: ['evaluate', 'describe'],
    examples: [
      ex('この 店の パンは とても いい においが する。', 'The bread in this shop smells really good.', 'この みせの ぱんは とても いい においが する。'),
      ex('昨日の コンサートは あまり よくなかった。', "Yesterday's concert wasn't very good.", 'きのうの こんさーとは あまり よくなかった。'),
    ],
  },
  'n4m-g-e59ab5': {
    meaning: 'should have ~ (I am sure I did)',
    structure: 'V-た + はず（だ／なのに）',
    explanation:
      'たはず says the speaker is confident something happened, often when the evidence says otherwise: 鍵をかけたはずなのに “I’m sure I locked it, but…”. It can also confirm a fact the speaker believes: 彼はもう着いたはずだ.',
    functions: ['of-course', 'expected'],
    examples: [
      ex('確かに 鍵を かけた はずなのに、開いて いる。', "I'm sure I locked it, but it's open.", 'たしかに かぎを かけた はずなのに、あいて いる。'),
      ex('三時に 出たから、もう 着いた はずだ。', 'He left at three, so he should have arrived by now.', 'さんじに でたから、もう ついた はずだ。'),
    ],
  },
  'n4m-g-708a56': {
    meaning: 'to call A B; A is called B',
    structure: 'A を + B と いう（言います）；B という + N',
    explanation:
      'AをBという names or defines something: これを日本語で「こたつ」という “this is called a kotatsu in Japanese”. The passive AはBといわれる describes what people call it. BというN introduces something unfamiliar: 「さくら」という店 “a shop called Sakura”.',
    functions: ['definition'],
    examples: [
      ex('日本では これを 「こたつ」と いいます。', 'In Japan, this is called a kotatsu.', 'にほんでは これを 「こたつ」と いいます。'),
      ex('駅の 前に 「みどり」という 喫茶店が ある。', 'There is a café called Midori in front of the station.', 'えきの まえに 「みどり」という きっさてんが ある。'),
    ],
  },
  'n4m-g-267796': {
    meaning: 'too (much); over-; past (a time)',
    structure: 'V-ます stem／Adj stem + すぎる；N（time）+ すぎ',
    explanation:
      'すぎる after a stem means “too much”: 食べすぎる, 高すぎる. Its stem すぎ is also a noun: 食べすぎ “overeating”, 飲みすぎに注意. After a time, すぎ means “past”: 三時すぎ “just after three”. いい becomes よすぎる and ない becomes なさすぎる.',
    functions: ['level', 'evaluate'],
    examples: [
      ex('昨日 食べすぎて、お腹が 痛い。', 'I ate too much yesterday, and my stomach hurts.', 'きのう たべすぎて、おなかが いたい。'),
      ex('会議は 三時すぎに 終わった。', 'The meeting finished a little after three.', 'かいぎは さんじすぎに おわった。'),
    ],
  },
  'n4m-g-2306c9': {
    meaning: '(you) do ~! (firm instruction)',
    structure: 'V-dict + んだ（のだ）；V-ない + んだ',
    explanation:
      'With a dictionary-form verb and falling intonation, んだ gives a firm instruction or urging: 早く寝るんだ “go to bed now”. It sounds like a parent, coach or superior insisting, and it is masculine or stern. The negative, V-ないんだ, means “don’t ~”.',
    functions: ['orders'],
    examples: [
      ex('泣いて いないで、早く 謝るんだ。', 'Stop crying and apologise, right now.', 'ないて いないで、はやく あやまるんだ。'),
      ex('最後まで あきらめないんだ。', "Don't give up until the very end.", 'さいごまで あきらめないんだ。'),
    ],
  },
  'n4m-n-nv-6040b7': {
    meaning: 'to make someone (feel ~): laugh, cry, worry …',
    structure: 'N1 が／は + N2（person）を + V-causative（笑わせる・泣かせる・驚かせる）',
    explanation:
      'With verbs of emotion, the causative says someone caused another person’s feeling, and the person affected takes を: 友達を笑わせる “make a friend laugh”. It is common for both good and bad effects: 親を心配させる. Adding てしまう shows regret.',
    functions: ['forced', 'feel'],
    examples: [
      ex('彼は いつも 冗談で みんなを 笑わせる。', 'He always makes everyone laugh with his jokes.', 'かれは いつも じょうだんで みんなを わらわせる。'),
      ex('急に 大きな 声を 出して、子供を 驚かせて しまった。', 'I raised my voice suddenly and gave the child a fright.', 'きゅうに おおきな こえを だして、こどもを おどろかせて しまった。'),
    ],
  },
  'n4m-g-73610c': {
    meaning: 'A (is ~), but B (is …) — contrastive は',
    structure: 'A は + predicate が, B は + predicate',
    explanation:
      'When two topics are set side by side with は, each は becomes contrastive: 肉は食べるが、魚は食べない. The contrast can be implied even with one は: 日本語は話せます (“Japanese, I can speak — other languages, not so much”). が or けど links the halves.',
    functions: ['contrast', 'compare'],
    examples: [
      ex('兄は 背が 高いが、弟は 低い。', 'My older brother is tall, but my younger brother is short.', 'あには せが たかいが、おとうとは ひくい。'),
      ex('ひらがなは 読めますが、漢字は まだ 読めません。', "I can read hiragana, but I can't read kanji yet.", 'ひらがなは よめますが、かんじは まだ よめません。'),
    ],
  },
  'n4m-g-0ad725': {
    meaning: '(sentence-final わ) soft emphasis; (Kansai) mild assertion',
    structure: 'Plain / polite form + わ（よ／ね）',
    explanation:
      'With rising intonation, わ is a soft, traditionally feminine sentence ending (行くわ, きれいだわ). With falling intonation it is used by men and women in western Japan as a mild assertion: もう帰るわ “I’m off home”. In standard speech it is less common among young speakers than it is in fiction.',
    functions: ['speak'],
    examples: [
      ex('この 花、とても きれいだわ。', 'These flowers are so pretty.', 'この はな、とても きれいだわ。'),
      ex('ほな、先に 帰るわ。', "Right then, I'm heading home first.", 'ほな、さきに かえるわ。'),
    ],
  },
};

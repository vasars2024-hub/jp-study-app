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
};

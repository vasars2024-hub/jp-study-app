import type { GrammarExample } from '../types';
import type { AuthoredGrammarContent } from '../authoredContent';

const ex = (jp: string, en: string, reading?: string): GrammarExample =>
  reading ? { jp, reading, en } : { jp, en };

/** Authored content for hollow N3 supplement records (see authoredContent.ts). */
export const AUTHORED_N3: Record<string, AuthoredGrammarContent> = {
  'n3m-g-0a4ded': {
    meaning: 'when it comes to ~ (it is extreme / indescribable)',
    structure: 'N + といったら（ったら）+ (extreme evaluation / ない)',
    explanation:
      'Picks up a topic and says it is extreme, often beyond words: その景色の美しさといったら言葉にならない. The evaluation is emotional, positive or negative. Casual ったら can also express irritation at a person: 母ったら.',
    functions: ['emphasize', 'story-topic'],
    examples: [
      ex('山頂から 見た 景色の 美しさと いったら、言葉に できない ほどだった。', 'The beauty of the view from the summit was beyond words.', 'さんちょうから みた けしきの うつくしさと いったら、ことばに できない ほどだった。'),
      ex('満員電車の 暑さと いったら、たまらない。', 'The heat on a packed train is unbearable.', 'まんいんでんしゃの あつさと いったら、たまらない。'),
    ],
  },
  'n3m-g-7072b5': {
    meaning: "not easily; (can't) quite ~",
    structure: 'ちょっと + negative（ちょっと〜ない／ちょっと〜できない）',
    explanation:
      'With a negative, ちょっと does not mean "a little" but softens a refusal or says something is not easy: ちょっと分からない "I’m not really sure". It is the classic polite way of saying no: 明日はちょっと…. In strong statements, ちょっとやそっとでは〜ない means "not easily at all".',
    functions: ['negative', 'refuse'],
    examples: [
      ex('その 質問には ちょっと 答えられません。', "I can't really answer that question.", 'その しつもんには ちょっと こたえられません。'),
      ex('この 汚れは ちょっとや そっとでは 落ちない。', "This stain won't come out easily.", 'この よごれは ちょっとや そっとでは おちない。'),
    ],
  },
  'n3m-g-da00f1': {
    structure: 'V-ない stem + なくちゃ（なくちゃ いけない／ならない）',
    explanation:
      'The spoken contraction of なくては: "I’ve got to ~". The ending いけない is often dropped, leaving なくちゃ on its own. なきゃ (from なければ) is equally common and slightly more casual; both are out of place in writing.',
    functions: ['necessary-obligation'],
    examples: [
      ex('もう 行かなくちゃ。電車に 遅れる。', "I've got to go. I'll miss the train.", 'もう いかなくちゃ。でんしゃに おくれる。'),
      ex('明日までに レポートを 書かなくちゃ いけない。', 'I have to write the report by tomorrow.', 'あしたまでに れぽーとを かかなくちゃ いけない。'),
    ],
  },
  'n3m-g-6212f5': {
    meaning: 'outrageous; terrible; (reply) not at all!',
    structure: 'とんでもない + N ／（reply）とんでもない（です／ございません）',
    explanation:
      'As an adjective it means shocking or absurd: とんでもない値段 "an outrageous price". As a reply to thanks or praise it is a humble "not at all, don’t mention it". とんでもないです is common, though some style guides prefer とんでもないことです.',
    functions: ['evaluate', 'refuse'],
    examples: [
      ex('とんでもない 値段の レストランに 入って しまった。', 'We ended up in a restaurant with outrageous prices.', 'とんでもない ねだんの れすとらんに はいって しまった。'),
      ex('「本当に 助かりました。」「とんでもないです。」', '"You were a real help." "Not at all."', '「ほんとうに たすかりました。」「とんでもないです。」'),
    ],
  },
  'n3m-g-2e1550': {
    meaning: 'I see; indeed; that makes sense',
    structure: 'なるほど（、+ clause）',
    explanation:
      'なるほど shows that the speaker has understood and accepts a point: "I see, that makes sense". It is a listening response, but using it too often to a superior can sound as if you are evaluating them; そうなんですね is safer. It can also start a sentence: なるほど、便利だ.',
    functions: ['approve-agree'],
    examples: [
      ex('なるほど、そういう 意味だったんですね。', 'I see, so that is what it meant.', 'なるほど、そういう いみだったんですね。'),
      ex('使って みて、なるほど 便利だと 思った。', 'After trying it, I could see why it is so convenient.', 'つかって みて、なるほど べんりだと おもった。'),
    ],
  },
  'n3m-g-ddbf30': {
    meaning: 'perhaps because ~ (uncertain cause)',
    structure: 'Plain form + からか／せいか／のか, …',
    explanation:
      'Adding か to a reason makes it a guess: 疲れたせいか、頭が痛い "maybe because I’m tired, my head hurts". せいか suggests a bad result, からか is neutral, and のか is the most colloquial. The speaker is not sure the cause is the real one.',
    functions: ['cause-reason', 'speculation'],
    examples: [
      ex('寝不足の せいか、今日は 頭が ぼんやりする。', 'Maybe because I did not sleep enough, my head feels foggy today.', 'ねぶそくの せいか、きょうは あたまが ぼんやりする。'),
      ex('週末だからか、店は いつもより 混んで いた。', 'Perhaps because it was the weekend, the shop was busier than usual.', 'しゅうまつだからか、みせは いつもより こんで いた。'),
    ],
  },
  'n3m-g-5a43c1': {
    meaning: "isn't it ~!; let's ~! (exclamation, reproach, urging)",
    structure: 'Plain form + じゃないか（ではないか）；V-volitional + じゃないか',
    explanation:
      'With falling intonation, じゃないか is not really a question: it expresses surprise (すごいじゃないか), reproach (約束したじゃないか) or, after a volitional, rousing others (やろうじゃないか "let’s do it!"). ではないか is the written or speech-making version.',
    functions: ['exclamatory', 'criticize'],
    examples: [
      ex('なんだ、すごく 上手じゃないか。', 'Hey, you are really good at it!', 'なんだ、すごく じょうずじゃないか。'),
      ex('みんなで 力を 合わせて やろうじゃないか。', "Let's all pull together and do it!", 'みんなで ちからを あわせて やろうじゃないか。'),
    ],
  },
  'n3m-g-de6dda': {
    meaning: 'no matter how ~',
    structure: 'いかに + V-て／Adj-くて + も',
    explanation:
      'A formal equivalent of いくら〜ても: however great the degree, the result does not change. いかに also appears alone in written style for "how": いかに大切か "how important it is".',
    functions: ['concessions'],
    examples: [
      ex('いかに 忙しくても、食事は きちんと とるべきだ。', 'However busy you are, you should eat properly.', 'いかに いそがしくても、しょくじは きちんと とるべきだ。'),
      ex('いかに 努力しても、結果が 出なければ 意味が ないと 言う 人も いる。', 'Some say that however hard you try, it means nothing without results.', 'いかに どりょくしても、けっかが でなければ いみが ないと いう ひとも いる。'),
    ],
  },
  'n3m-g-cd3f39': {
    meaning: 'if (you were to do something like) ~',
    structure: 'V-たり + したら／しては',
    explanation:
      'たり here does not list actions; it softens a condition into "something like ~", usually an undesirable one: 遅刻したりしたら怒られる "if you do something like being late, you’ll get told off". しては is used for warnings: そんなこと言ったりしてはいけない.',
    functions: ['condition', 'warning'],
    examples: [
      ex('大事な 書類を なくしたり したら、大変な ことに なる。', 'If you were to lose something like an important document, it would be serious.', 'だいじな しょるいを なくしたり したら、たいへんな ことに なる。'),
      ex('人の 悪口を 言ったり しては いけない。', 'You should not go saying bad things about people.', 'ひとの わるぐちを いったり しては いけない。'),
    ],
  },
  'n3m-g-b74846': {
    meaning: 'just because ~, it does not mean …',
    structure: 'Clause。だからといって、+ negative conclusion',
    explanation:
      'だからといって rejects the conclusion that seems to follow from the previous statement: お金がある。だからといって幸せとは限らない. The second half is usually negative (とは限らない, わけではない, ない).',
    functions: ['contrast', 'concessions'],
    examples: [
      ex('給料は 高い。だからと いって、楽な 仕事では ない。', 'The pay is high. That does not mean the job is easy.', 'きゅうりょうは たかい。だからと いって、らくな しごとでは ない。'),
      ex('忙しいから と いって、連絡しない のは よくない。', 'Being busy is no excuse for not keeping in touch.', 'いそがしいから と いって、れんらくしない のは よくない。'),
    ],
  },
  'n3m-g-6036dc': {
    meaning: 'could you ~ (for me)? (blunt)',
    structure: 'V-て形 + もらえないか（もらえないかな／もらえませんか）',
    explanation:
      'A request built on the negative potential of もらう: "couldn’t I get you to ~?". もらえないか is plain and masculine; かな softens it; もらえませんか is the polite form. It sounds more indirect, and so politer, than てくれないか.',
    functions: ['request'],
    examples: [
      ex('悪いけど、この 仕事を 手伝って もらえないか。', 'Sorry, but could you help me with this job?', 'わるいけど、この しごとを てつだって もらえないか。'),
      ex('もう 少し 静かに して もらえませんか。', 'Could you be a little quieter, please?', 'もう すこし しずかに して もらえませんか。'),
    ],
  },
  'n3m-g-339fdd': {
    meaning: 'not at all; nothing (to worry about)',
    structure: 'なに（も／一つ）+ negative ／ なに、+ reassurance',
    explanation:
      'なに with a negative strengthens it: なに一つ分からない "I don’t understand a thing". On its own at the start of a reply, なに dismisses worry: なに、心配いらないよ "oh, there’s no need to worry". The reassuring use is masculine and slightly old-fashioned.',
    functions: ['emphasize-negative'],
    examples: [
      ex('説明を 聞いても、なに 一つ 分からなかった。', 'Even after the explanation, I did not understand a single thing.', 'せつめいを きいても、なに ひとつ わからなかった。'),
      ex('なに、大した ことは ないよ。すぐ 治るさ。', "Oh, it's nothing serious. It'll heal soon.", 'なに、たいした ことは ないよ。すぐ なおるさ。'),
    ],
  },
  'n3m-g-f38d12': {
    meaning: 'with the intention of ~; thinking of it as ~',
    structure: 'V-dict／V-た／N の + つもりで, …',
    explanation:
      'つもりで describes the mindset an action is done in: 旅行するつもりで貯金する "save with a trip in mind". With a past verb or noun, it means acting as if something were true: 死んだつもりで頑張る "work as if your life depended on it".',
    functions: ['intent'],
    examples: [
      ex('留学する つもりで、毎月 お金を ためて いる。', 'I am saving every month with the intention of studying abroad.', 'りゅうがくする つもりで、まいつき おかねを ためて いる。'),
      ex('旅行に 行った つもりで、家で ゆっくり 過ごした。', 'I spent a relaxing time at home, pretending I was on holiday.', 'りょこうに いった つもりで、いえで ゆっくり すごした。'),
    ],
  },
  'n3m-g-d3ef7d': {
    meaning: '(someone) says that ~; is saying ~',
    structure: 'Person は + plain form + と 言って いる',
    explanation:
      'Reports what someone has said and still holds: 彼は来ないと言っている. The ている form suggests the statement stands now, not a one-off remark. For your own words use と言った; for rumours, と言われている or そうだ.',
    functions: ['speak', 'heard'],
    examples: [
      ex('子供が おなかが 痛いと 言って いる。', 'My child says her stomach hurts.', 'こどもが おなかが いたいと いって いる。'),
      ex('部長は 今日の 会議は 中止だと 言って います。', "The manager says today's meeting is cancelled.", 'ぶちょうは きょうの かいぎは ちゅうしだと いって います。'),
    ],
  },
  'n3m-g-7cc81c': {
    meaning: 'somehow; for no particular reason',
    structure: 'なんとなく + V／Adj',
    explanation:
      'なんとなく describes a feeling or action without a clear reason: なんとなく寂しい "somehow I feel lonely". It is also a reply: "Why did you choose it?" "なんとなく." Compare なんだか, which is similar but more about a vague impression.',
    functions: ['vague', 'feel'],
    examples: [
      ex('今日は なんとなく 元気が 出ない。', "Somehow I just don't have much energy today.", 'きょうは なんとなく げんきが でない。'),
      ex('なんとなく 入った 店が、とても おいしかった。', 'A restaurant I went into on a whim turned out to be delicious.', 'なんとなく はいった みせが、とても おいしかった。'),
    ],
  },
  'n3m-g-d35212': {
    meaning: "isn't that ~? (so it must be ~!) (accusing / concluding)",
    structure: 'Plain form (N / Na without だ) + ではないか',
    explanation:
      'In argument or writing, ではないか presents a conclusion as obvious: それは約束違反ではないか "isn’t that a breach of the agreement?". It sounds confrontational in speech. In essays, のではないか softens it into a proposal.',
    functions: ['criticize', 'judge'],
    examples: [
      ex('それでは 約束が 違うでは ないか。', 'Then that goes against what we agreed, doesn’t it?', 'それでは やくそくが ちがうでは ないか。'),
      ex('彼が 犯人だと いう 証拠は ない では ないか。', 'But there is no evidence that he is the culprit!', 'かれが はんにんだと いう しょうこは ない では ないか。'),
    ],
  },
  'n3m-g-79a624': {
    meaning: 'while ~ (before it changes); before ~ happens',
    structure: 'V-ている／Adj／N の + うちに ／ V-ない + うちに',
    explanation:
      'うちに says to act while a state lasts, because it will change: 若いうちに旅行する, 温かいうちに食べる. ないうちに means "before something happens": 暗くならないうちに帰る. It can also describe a change noticed during an activity: 話しているうちに眠くなった.',
    functions: ['time-situation', 'relationships-in-time'],
    examples: [
      ex('冷めない うちに、どうぞ 召し上がって ください。', 'Please eat it before it gets cold.', 'さめない うちに、どうぞ めしあがって ください。'),
      ex('本を 読んで いる うちに、眠って しまった。', 'I fell asleep while I was reading.', 'ほんを よんで いる うちに、ねむって しまった。'),
    ],
  },
  'n3m-g-033396': {
    meaning: 'so; therefore (polite だから)',
    structure: 'Sentence。ですから、…',
    explanation:
      'ですから is the polite form of だから and opens a sentence that follows from the previous one. It is common in explanations to customers. Said repeatedly it can sound impatient ("as I said"), so それで or そのため are softer in some contexts.',
    functions: ['cause-reason'],
    examples: [
      ex('明日は 祝日です。ですから、図書館は 休みです。', 'Tomorrow is a public holiday. So the library is closed.', 'あしたは しゅくじつです。ですから、としょかんは やすみです。'),
      ex('ですから、先ほども 申し上げた とおりです。', 'So, it is as I said a moment ago.', 'ですから、さきほども もうしあげた とおりです。'),
    ],
  },
  'n3m-g-8ef699': {
    meaning: 'not to mention ~; ~ of course, and also …',
    structure: 'N1 は もちろん（もとより）、N2 も …',
    explanation:
      'N1 is the obvious case, and the sentence goes on to a less obvious one: 子供はもちろん、大人も楽しめる "adults can enjoy it, not to mention children". もとより is more formal. The second half usually has も or まで.',
    functions: ['add', 'of-course'],
    examples: [
      ex('この 映画は 子供は もちろん、大人も 楽しめる。', 'This film is fun for adults, not to mention children.', 'この えいがは こどもは もちろん、おとなも たのしめる。'),
      ex('彼は 英語は もとより、フランス語も 話せる。', 'He can speak French, let alone English.', 'かれは えいごは もとより、ふらんすごも はなせる。'),
    ],
  },
  'n3m-g-e039ba': {
    meaning: 'by (agent / means); depending on; due to',
    structure: 'N + によって（により／による + N）',
    explanation:
      'によって marks several relations: the agent of a passive of creation (この本は夏目漱石によって書かれた), a means (話し合いによって解決する), a cause (事故により遅れる) and variation (人によって違う). により is more formal, and による modifies a noun.',
    functions: ['means-methods', 'standard'],
    examples: [
      ex('考え方は 人に よって 違う。', 'Ways of thinking differ from person to person.', 'かんがえかたは ひとに よって ちがう。'),
      ex('台風に よる 被害は 大きかった。', 'The damage caused by the typhoon was severe.', 'たいふうに よる ひがいは おおきかった。'),
    ],
  },
  'n3m-g-83c2dc': {
    meaning: 'the moment ~; just as ~ (something unexpected happened)',
    structure: 'V-た + とたん（に）, …',
    explanation:
      'とたん says something happened immediately and unexpectedly after the first action: 立ち上がったとたん、めまいがした. The second event is outside the speaker’s control, so it cannot be a request or intention. Compare 〜てすぐ, which is neutral.',
    functions: ['immediately-after', 'unexpected-outcome'],
    examples: [
      ex('ドアを 開けた とたん、猫が 飛び出して きた。', 'The moment I opened the door, the cat leapt out.', 'どあを あけた とたん、ねこが とびだして きた。'),
      ex('家を 出た とたんに、雨が 降り出した。', 'Just as I left the house, it started to rain.', 'いえを でた とたんに、あめが ふりだした。'),
    ],
  },
  'n3m-g-df8a13': {
    meaning: 'nearly ~; was about to ~ (but did not)',
    structure: 'V-dict + ところだった（もう少しで／危うく〜ところだった）',
    explanation:
      'Says something almost happened but was avoided, usually something bad: 車にひかれるところだった. もう少しで or 危うく often appear earlier in the sentence. It differs from V-dict + ところだ, which is "just about to" in the present.',
    functions: ['shortly-before'],
    examples: [
      ex('もう 少しで 電車に 乗り遅れる ところだった。', 'I very nearly missed the train.', 'もう すこしで でんしゃに のりおくれる ところだった。'),
      ex('危うく 大事な 約束を 忘れる ところだった。', 'I almost forgot an important appointment.', 'あやうく だいじな やくそくを わすれる ところだった。'),
    ],
  },
  'n3m-g-0bed41': {
    meaning: 'thanks to ~ (good result); (ironic) because of ~',
    structure: 'N の／plain form + おかげで（おかげだ）',
    explanation:
      'おかげで credits a cause for a good result: 先生のおかげで合格できた. Used for a bad result, it is sarcastic ("thanks a lot"). For a plainly negative cause, use せいで. The fixed reply おかげさまで means "thanks to you (all is well)".',
    functions: ['cause-reason'],
    examples: [
      ex('先生の おかげで、試験に 合格できました。', 'Thanks to my teacher, I was able to pass the exam.', 'せんせいの おかげで、しけんに ごうかくできました。'),
      ex('薬を 飲んだ おかげで、熱が 下がった。', 'Thanks to the medicine, my fever went down.', 'くすりを のんだ おかげで、ねつが さがった。'),
    ],
  },
  'n3m-g-2d3fb0': {
    meaning: 'if (it is true that) ~ had happened / is the case',
    structure: 'もし + V-た／Adj-かった + なら, …',
    explanation:
      'たなら takes a completed or past fact as its premise: もし彼がそう言ったなら、本当だろう "if he said so, it’s probably true". It fits advice or judgements based on something that may already have happened. It is a little more formal than たら.',
    functions: ['condition', 'assumptions'],
    examples: [
      ex('もし 気分を 悪く した なら、ごめんなさい。', 'If I upset you, I apologise.', 'もし きぶんを わるく した なら、ごめんなさい。'),
      ex('もし 本当に 彼が そう 言った なら、信じて いいと 思う。', 'If he really said that, I think you can believe it.', 'もし ほんとうに かれが そう いった なら、しんじて いいと おもう。'),
    ],
  },
  'n3m-g-d84028': {
    meaning: 'so ~ that …; to the extent that …',
    structure: 'V／Adj／N + くらいだ（ぐらいだ）',
    explanation:
      'くらいだ describes a degree by giving an example of how far it goes: 泣きたいくらいだ "I could almost cry". After numbers, くらい means "about". A negative form, くらいなら, means "rather than ~" (やめるくらいなら).',
    functions: ['level', 'amount-roughly'],
    examples: [
      ex('疲れて、もう 一歩も 歩けない くらいだ。', "I'm so tired I can't take another step.", 'つかれて、もう いっぽも あるけない くらいだ。'),
      ex('今日は 寒くて、雪が 降りそうな くらいだ。', "It is so cold today it feels like it might snow.", 'きょうは さむくて、ゆきが ふりそうな くらいだ。'),
    ],
  },
  'n3m-g-742ad6': {
    meaning: 'it is true that ~, but …; ~ in a way, but …',
    structure: 'V／Adj + ことは + (same) V／Adj + が, …',
    explanation:
      'Repeating the predicate with ことは〜が concedes a point grudgingly before limiting it: 読んだことは読んだが、よく分からなかった "I did read it, but I didn’t really understand". The concession is often half-hearted.',
    functions: ['concessions'],
    examples: [
      ex('行く ことは 行くが、すぐ 帰るよ。', "I'll go, sure, but I'll come straight back.", 'いく ことは いくが、すぐ かえるよ。'),
      ex('この 服は 安い ことは 安いが、質が 悪い。', 'These clothes are cheap, true, but the quality is poor.', 'この ふくは やすい ことは やすいが、しつが わるい。'),
    ],
  },
  'n3m-g-1d0571': {
    meaning: 'rarely; hardly ever',
    structure: 'めったに + V-ない ／ めったに ない + N',
    explanation:
      'めったに always goes with a negative and means "seldom": めったに怒らない. めったにない (機会) means "rare (opportunity)". Compare あまり〜ない, which is about degree or frequency more loosely.',
    functions: ['frequency', 'negative'],
    examples: [
      ex('父は めったに 怒らない。', 'My father rarely gets angry.', 'ちちは めったに おこらない。'),
      ex('こんな チャンスは めったに ない。', 'An opportunity like this hardly ever comes along.', 'こんな ちゃんすは めったに ない。'),
    ],
  },
  'n3m-g-b4b6fd': {
    meaning: 'even ~',
    structure: 'N + さえ（にさえ／でさえ）；V-stem + さえ + しない',
    explanation:
      'さえ picks out an extreme example to show how far something goes: 名前さえ書けない "can’t even write his name". It replaces が and を but follows other particles (子供にさえ). In the conditional pattern さえ〜ば it means "as long as" instead.',
    functions: ['extreme-example', 'emphasize'],
    examples: [
      ex('忙しくて、昼ご飯を 食べる 時間さえ ない。', "I'm so busy I don't even have time to eat lunch.", 'いそがしくて、ひるごはんを たべる じかんさえ ない。'),
      ex('その 問題は 先生で さえ 解けなかった。', 'Even the teacher could not solve that problem.', 'その もんだいは せんせいで さえ とけなかった。'),
    ],
  },
  'n3m-g-b69328': {
    meaning: 'from ~ through ~ (a range, loosely)',
    structure: 'N1（time／place）+ から + N2 + に かけて',
    explanation:
      'から〜にかけて marks a range with fuzzy edges, typical of weather and seasons: 今夜から明日にかけて雨 "rain from tonight into tomorrow". から〜まで marks exact start and end points instead.',
    functions: ['range', 'time-direction'],
    examples: [
      ex('今夜から 明日の 朝に かけて、雪が 降るでしょう。', 'Snow is expected from tonight into tomorrow morning.', 'こんやから あしたの あさに かけて、ゆきが ふるでしょう。'),
      ex('関東から 東北に かけて、強い 風が 吹いて いる。', 'Strong winds are blowing from Kanto through Tohoku.', 'かんとうから とうほくに かけて、つよい かぜが ふいて いる。'),
    ],
  },
  'n3m-g-13206a': {
    meaning: 'I heard that ~; they say ~ (casual)',
    structure: 'Plain form (Na / N + な) + んだって',
    explanation:
      'The casual hearsay form: 田中さん、結婚するんだって "I hear Tanaka’s getting married". With rising intonation it asks for confirmation: 引っ越すんだって? "I heard you’re moving?". The polite equivalent is そうです.',
    functions: ['heard'],
    examples: [
      ex('田中さん、来月 結婚するんだって。', "I hear Tanaka's getting married next month.", 'たなかさん、らいげつ けっこんするんだって。'),
      ex('あの 店、閉店するんだって？', 'Is it true that shop is closing?', 'あの みせ、へいてんするんだって？'),
    ],
  },
  'n3m-g-6bc85d': {
    meaning: 'even if ~ (supposing)',
    structure: 'たとえ + V-て／Adj-くて + も ／ たとえ + N・Na + でも',
    explanation:
      'たとえ announces a hypothetical concession that the ても completes: たとえ失敗しても "even if I fail". It stresses that the condition is only supposed and makes the resolve stronger. It is common in written style and speeches.',
    functions: ['concessions', 'assumptions'],
    examples: [
      ex('たとえ 反対されても、私は この 道を 選ぶ。', 'Even if people oppose me, I will choose this path.', 'たとえ はんたいされても、わたしは この みちを えらぶ。'),
      ex('たとえ 雨でも、試合は 行います。', 'The match will go ahead even if it rains.', 'たとえ あめでも、しあいは おこないます。'),
    ],
  },
  'n3m-g-3b6b77': {
    meaning: 'because of ~ (blame for a bad result)',
    structure: 'N の／plain form + せいで（せいだ／せいか）',
    explanation:
      'せいで blames a cause for a bad outcome: 雨のせいで試合が中止になった. It is the negative counterpart of おかげで. せいか softens it into a guess ("maybe because of"). Blaming a person directly with せいだ sounds harsh.',
    functions: ['cause-reason', 'blame'],
    examples: [
      ex('大雪の せいで、電車が 止まった。', 'The trains stopped because of the heavy snow.', 'おおゆきの せいで、でんしゃが とまった。'),
      ex('私の ミスの せいで、みんなに 迷惑を かけて しまった。', 'Because of my mistake, I caused everyone trouble.', 'わたしの みすの せいで、みんなに めいわくを かけて しまった。'),
    ],
  },
  'n3m-g-0efe29': {
    meaning: 'or (in a question offering choices)',
    structure: 'A ですか。それとも B ですか。',
    explanation:
      'それとも links two alternatives in a question: コーヒーにしますか、それとも紅茶にしますか. It is only used in questions or in clauses about choosing (〜か、それとも〜か迷う). In statements, use または or か.',
    functions: ['selective'],
    examples: [
      ex('コーヒーに しますか、それとも 紅茶に しますか。', 'Would you like coffee, or would you prefer tea?', 'こーひーに しますか、それとも こうちゃに しますか。'),
      ex('電車で 行く？それとも タクシーに する？', 'Shall we go by train, or take a taxi?', 'でんしゃで いく？それとも たくしーに する？'),
    ],
  },
  'n3m-g-cad2ad': {
    meaning: 'originally; from the start; by nature',
    structure: 'もともと + clause ／ もともとの + N',
    explanation:
      'もともと refers to the original state before any change, or to a natural disposition: 彼はもともと無口だ "he has always been quiet". 本来 is the formal counterpart and leans toward "what it should properly be"; もともと is the everyday word.',
    functions: ['past-state', 'characteristics'],
    examples: [
      ex('この 建物は もともと 学校だった。', 'This building was originally a school.', 'この たてものは もともと がっこうだった。'),
      ex('彼は もともと あまり 話さない 人だ。', 'He has never been much of a talker.', 'かれは もともと あまり はなさない ひとだ。'),
    ],
  },
  'n3m-g-1928f0': {
    meaning: 'at any cost; whatever it takes',
    structure: 'なんとしても + V（volitional／たい／なければ）',
    explanation:
      'なんとしても expresses a determination to achieve something by any means: なんとしても合格したい. It pairs with volitional, wish or obligation forms. どうしても is similar, but can also mean "no matter what (it won’t)" with a negative.',
    functions: ['determination-decision'],
    examples: [
      ex('今年こそ、なんとしても 合格したい。', 'This year I want to pass, whatever it takes.', 'ことしこそ、なんとしても ごうかくしたい。'),
      ex('締め切りには なんとしても 間に合わせます。', 'I will meet the deadline at all costs.', 'しめきりには なんとしても まにあわせます。'),
    ],
  },
  'n3m-g-d1e03c': {
    meaning: 'before long; sooner or later; one of these days',
    structure: 'そのうち（に）+ V',
    explanation:
      'そのうち points to an unspecified time in the not-too-distant future: そのうち慣れる "you’ll get used to it before long". As a vague promise, そのうち会おう can mean it may never happen. For a definite time use 近いうちに.',
    functions: ['future-time'],
    examples: [
      ex('最初は 大変だけど、そのうち 慣れるよ。', "It's hard at first, but you'll get used to it before long.", 'さいしょは たいへんだけど、そのうち なれるよ。'),
      ex('そのうち また 飲みに 行きましょう。', "Let's go for a drink again one of these days.", 'そのうち また のみに いきましょう。'),
    ],
  },
  'n3m-g-5046c2': {
    meaning: 'was supposed to ~ (but did not)',
    structure: 'V-dict／V-た + はずだった',
    explanation:
      'はずだった states an expectation that turned out wrong: 三時に着くはずだった "we were supposed to arrive at three". It carries disappointment or surprise. The present はずだ expresses a confident expectation that still holds.',
    functions: ['expected', 'unexpected-outcome'],
    examples: [
      ex('飛行機は 三時に 着く はずだったが、一時間 遅れた。', 'The plane was supposed to land at three, but it was an hour late.', 'ひこうきは さんじに つく はずだったが、いちじかん おくれた。'),
      ex('こんな はずでは なかった。', 'This was not supposed to happen.', 'こんな はずでは なかった。'),
    ],
  },
  'n3m-g-268276': {
    meaning: 'it is said that ~; ~ is believed to …',
    structure: 'Plain form + と 言われて いる',
    explanation:
      'The passive of 言う presents a widely held view without naming a source: 日本人は勤勉だと言われている. It is common in essays and explanations. For something one heard personally, そうだ or らしい are more natural.',
    functions: ['heard', 'information-resource'],
    examples: [
      ex('この 寺は 千年前に 建てられたと 言われて いる。', 'This temple is said to have been built a thousand years ago.', 'この てらは せんねんまえに たてられたと いわれて いる。'),
      ex('緑茶は 体に いいと 言われて います。', 'Green tea is said to be good for your health.', 'りょくちゃは からだに いいと いわれて います。'),
    ],
  },
  'n3m-g-3d7ee4': {
    meaning: 'truly; (with negative) cannot say / nothing at all',
    structure: 'なんとも + negative（言えない・ない）／なんとも + Adj（言えない ほど）',
    explanation:
      'With a negative, なんとも means "(cannot say) anything at all": なんとも言えない "I can’t really say". なんとも思わない means "not bothered in the least". なんとも言えない + adjective describes a feeling too strong for words: なんとも言えないいい香り.',
    functions: ['emphasize-negative'],
    examples: [
      ex('結果は まだ なんとも 言えません。', 'I really cannot say anything about the result yet.', 'けっかは まだ なんとも いえません。'),
      ex('彼は 人に 何を 言われても、なんとも 思わない。', 'Whatever people say to him, he does not care in the least.', 'かれは ひとに なにを いわれても、なんとも おもわない。'),
    ],
  },
  'n3m-g-45045b': {
    meaning: 'then; in that case; and then (casual)',
    structure: 'Sentence。そしたら、…',
    explanation:
      'そしたら is a casual contraction of そうしたら. It either reports what happened next, often unexpectedly (電話した。そしたら留守だった), or introduces a suggestion based on what was just said: そしたら、明日にしよう. じゃあ is a close casual synonym for the second use.',
    functions: ['time-sequence', 'condition'],
    examples: [
      ex('ドアを ノックした。そしたら、知らない 人が 出て きた。', 'I knocked on the door, and then a stranger came out.', 'どあを のっくした。そしたら、しらない ひとが でて きた。'),
      ex('今日 無理なら、そしたら 明日に しよう。', "If today is no good, then let's make it tomorrow.", 'きょう むりなら、そしたら あしたに しよう。'),
    ],
  },
  'n3m-g-867919': {
    meaning: 'properly; neatly; as one should',
    structure: 'ちゃんと + V ／ ちゃんと した + N',
    explanation:
      'ちゃんと says something is done properly and responsibly: ちゃんと食べなさい. ちゃんとした + noun means "decent, proper": ちゃんとした仕事. It is conversational; きちんと is similar but emphasises neatness and order.',
    functions: ['evaluate', 'describe'],
    examples: [
      ex('ちゃんと 朝ご飯を 食べて から 出かけなさい。', 'Eat a proper breakfast before you go out.', 'ちゃんと あさごはんを たべて から でかけなさい。'),
      ex('早く ちゃんと した 仕事を 見つけたい。', 'I want to find a proper job soon.', 'はやく ちゃんと した しごとを みつけたい。'),
    ],
  },
  'n3m-g-fab827': {
    meaning: 'because; the reason is that ~',
    structure: 'Conclusion。なぜなら、+ reason + からだ',
    explanation:
      'なぜなら opens a sentence that gives the reason for the previous one, and it is normally closed with からだ or のだ. It is formal and typical of essays and speeches; in conversation, というのは or だって is more natural.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('私は 反対です。なぜなら、費用が かかりすぎるからです。', 'I am against it, because it would cost too much.', 'わたしは はんたいです。なぜなら、ひようが かかりすぎるからです。'),
      ex('今年の 旅行は 中止だ。なぜなら、休みが 取れないからだ。', 'This year’s trip is off, because I cannot get time off.', 'ことしの りょこうは ちゅうしだ。なぜなら、やすみが とれないからだ。'),
    ],
  },
  'n3m-g-26fcbb': {
    meaning: 'if (we suppose) ~; if it is true that ~',
    structure: 'Plain form + としたら（とすれば／とすると）',
    explanation:
      'としたら sets up a hypothesis to reason from: 宝くじが当たったとしたら、何をする? "supposing you won the lottery…". It also draws a conclusion from something just heard: それが本当だとしたら、大変だ. The main clause is a judgement or question, often with だろう or か.',
    functions: ['condition-assumption'],
    examples: [
      ex('もし 一億円 あったと したら、何に 使いますか。', 'Supposing you had a hundred million yen, what would you spend it on?', 'もし いちおくえん あったと したら、なにに つかいますか。'),
      ex('彼の 話が 本当だと したら、これは 大問題だ。', "If what he says is true, this is a serious problem.", 'かれの はなしが ほんとうだと したら、これは だいもんだいだ。'),
    ],
  },
  'n3m-g-66970b': {
    meaning: 'if (by any chance) ~',
    structure: 'もしも + clause + なら（たら）',
    explanation:
      'もしも is an emphatic もし: it stresses that the condition is unlikely or serious, often in warnings and emergencies: もしものことがあったら "if anything should happen". The conditional ending (なら, たら, ば) is still required.',
    functions: ['condition', 'assumptions'],
    examples: [
      ex('もしも 地震が 起きたら、机の 下に 入って ください。', 'If an earthquake should happen, get under your desk.', 'もしも じしんが おきたら、つくえの したに はいって ください。'),
      ex('もしも 私が 鳥なら、空を 自由に 飛びたい。', 'If I were a bird, I would want to fly freely in the sky.', 'もしも わたしが とりなら、そらを じゆうに とびたい。'),
    ],
  },
  'n3m-g-01cdb6': {
    meaning: 'for that reason; because of that',
    structure: 'Sentence。そのため、+ result',
    explanation:
      'そのため refers back to the previous sentence as the cause of what follows: 大雪が降った。そのため、電車が止まった. It is neutral and common in writing and news. Unlike だから, it is not used to back up requests or opinions.',
    functions: ['cause-reason', 'result'],
    examples: [
      ex('今朝 事故が あった。その ため、道路が 渋滞して いる。', 'There was an accident this morning. Because of that, the roads are congested.', 'けさ じこが あった。その ため、どうろが じゅうたいして いる。'),
      ex('人口が 減って いる。その ため、学校の 数も 減った。', 'The population is falling, and so the number of schools has also dropped.', 'じんこうが へって いる。その ため、がっこうの かずも へった。'),
    ],
  },
  'n3m-g-e8763f': {
    meaning: 'speaking of ~ (association); when you think of ~',
    structure: 'N + と いえば（と いうと／と いったら）',
    explanation:
      'といえば picks up a topic, often one just mentioned, and brings up what it calls to mind: 京都といえば、お寺が有名だ. というと is similar but can also ask for clarification (田中さんというと、あの背の高い人ですか?). といったら adds strong emotion.',
    functions: ['story-topic'],
    examples: [
      ex('夏と いえば、やっぱり 花火ですね。', 'Speaking of summer, fireworks are the thing, aren’t they?', 'なつと いえば、やっぱり はなびですね。'),
      ex('田中さんと いうと、あの 眼鏡の 人ですか。', 'By Tanaka, do you mean the man with glasses?', 'たなかさんと いうと、あの めがねの ひとですか。'),
    ],
  },
  'n3m-g-e1f612': {
    meaning: 'try ~ (and see) (said to a child or junior)',
    structure: 'V-て形 + ごらん（ごらんなさい）',
    explanation:
      'ごらん is the imperative of ご覧になる but is used kindly by parents, teachers and seniors to encourage a child or junior to try: 食べてごらん "go on, try it". It is not used toward superiors, where てみてください is appropriate.',
    functions: ['invite-suggest', 'order'],
    examples: [
      ex('おいしいから、一口 食べて ごらん。', "It's delicious, go on, try a bite.", 'おいしいから、ひとくち たべて ごらん。'),
      ex('ほら、空を 見て ごらん。虹が 出て いるよ。', 'Look, look at the sky. There is a rainbow.', 'ほら、そらを みて ごらん。にじが でて いるよ。'),
    ],
  },
  'n3m-g-0d6cc8': {
    meaning: 'should ~; ought (not) to ~',
    structure: 'V-dict + べきだ（べきではない）；する → すべき（するべき）',
    explanation:
      'べきだ states what is right or proper by the speaker’s principles: 約束は守るべきだ. It is stronger and more moralising than ほうがいい, so it sounds preachy when aimed at a listener. The negative べきではない means "should not"; before a noun it is べき + N.',
    functions: ['advice', 'necessary-obligation'],
    examples: [
      ex('約束は 守る べきだ。', 'Promises should be kept.', 'やくそくは まもる べきだ。'),
      ex('人の 悪口を 言う べきでは ない。', 'You ought not to speak ill of others.', 'ひとの わるぐちを いう べきでは ない。'),
    ],
  },
  'n3m-g-30242f': {
    meaning: 'no matter how (much) ~; how (very) ~!',
    structure: 'どんなに + V-て／Adj-くて + も ／ どんなに + Adj + か',
    explanation:
      'With ても, どんなに says the degree makes no difference: どんなに頑張っても "however hard I try". With か or だろう it becomes an exclamation of degree: 合格したら、どんなにうれしいだろう "how happy I would be if I passed". It is a little softer than いくら.',
    functions: ['concessions', 'emphasize'],
    examples: [
      ex('どんなに 忙しくても、毎日 日記を 書いて いる。', 'However busy I am, I write in my diary every day.', 'どんなに いそがしくても、まいにち にっきを かいて いる。'),
      ex('家族に 会えたら、どんなに うれしいだろう。', 'How happy I would be if I could see my family.', 'かぞくに あえたら、どんなに うれしいだろう。'),
    ],
  },
  'n3m-g-75a83e': {
    meaning: 'of course ~, (and) also …',
    structure: 'N は もちろん（のこと）、…も',
    explanation:
      'はもちろん treats N as so obvious it hardly needs saying, then adds something less expected: 週末はもちろん、平日も混んでいる. のこと can be added for weight. It sounds more conversational than はもとより.',
    functions: ['add', 'of-course'],
    examples: [
      ex('この 店は 週末は もちろん、平日も 混んで いる。', 'This shop is crowded not just at weekends but on weekdays too.', 'この みせは しゅうまつは もちろん、へいじつも こんで いる。'),
      ex('彼女は ピアノは もちろん、ギターも 弾ける。', 'She can play the guitar as well as, of course, the piano.', 'かのじょは ぴあのは もちろん、ぎたーも ひける。'),
    ],
  },
  'n3m-g-f6d117': {
    meaning: 'what (is it called)?; what a ~!',
    structure: 'なんと いう + N（何という名前）／ なんという + N + だ（exclamation）',
    explanation:
      'なんという asks for a name: これはなんという花ですか "what is this flower called?". With falling intonation and a noun of evaluation, it exclaims: なんという美しさだ "what beauty!". The casual form is なんていう.',
    functions: ['asked', 'exclamatory'],
    examples: [
      ex('この 花は なんと いう 名前ですか。', 'What is the name of this flower?', 'この はなは なんと いう なまえですか。'),
      ex('なんと いう 美しい 景色だろう。', 'What a beautiful view!', 'なんと いう うつくしい けしきだろう。'),
    ],
  },
  'n3m-g-199449': {
    meaning: 'by the way; incidentally',
    structure: 'ところで、+ new topic',
    explanation:
      'ところで changes the subject, often to the matter the speaker really wanted to raise: ところで、例の件はどうなりましたか. It is neutral and polite. それはそうと is a close synonym, and さて is more formal and used by presenters.',
    functions: ['story-topic', 'transfer-the-story'],
    examples: [
      ex('ところで、来週の 会議は 何時からですか。', 'By the way, what time does next week’s meeting start?', 'ところで、らいしゅうの かいぎは なんじからですか。'),
      ex('ところで、最近 田中さんに 会った？', 'By the way, have you seen Tanaka lately?', 'ところで、さいきん たなかさんに あった？'),
    ],
  },
  'n3m-g-4f17d6': {
    meaning: 'and also; oh, and (adding one more thing)',
    structure: '…。それと、+ addition ／ …。あと、+ addition',
    explanation:
      'それと and あと add one more item, often an afterthought, in conversation: 牛乳を買ってきて。あと、パンも. They are casual; in writing use また or さらに. あと can also mean "the rest" or "after", so context decides.',
    functions: ['add'],
    examples: [
      ex('卵を 買って きて。あと、牛乳も お願い。', 'Can you get some eggs? Oh, and some milk too, please.', 'たまごを かって きて。あと、ぎゅうにゅうも おねがい。'),
      ex('資料は 送りました。それと、会議の 時間が 変わりました。', 'I have sent the documents. Also, the meeting time has changed.', 'しりょうは おくりました。それと、かいぎの じかんが かわりました。'),
    ],
  },
  'n3m-g-ecc296': {
    meaning: 'however; but (contrary to expectation)',
    structure: 'Sentence。ところが、+ unexpected fact',
    explanation:
      'ところが introduces a result that goes against what was expected, and the speaker was not in control of it: 晴れると思った。ところが、雨が降り出した. The second part is a fact, not the speaker’s intention or request. しかし is a neutral "but"; ところが stresses surprise.',
    functions: ['contrast', 'unexpected-outcome'],
    examples: [
      ex('簡単だと 思った。ところが、実際は とても 難しかった。', 'I thought it would be easy. In fact, it was very hard.', 'かんたんだと おもった。ところが、じっさいは とても むずかしかった。'),
      ex('急いで 駅に 行った。ところが、電車は もう 出た 後だった。', 'I hurried to the station, but the train had already left.', 'いそいで えきに いった。ところが、でんしゃは もう でた あとだった。'),
    ],
  },
  'n3m-g-76f95c': {
    meaning: 'on top of that; moreover',
    structure: 'Sentence。その上（そのうえ）、+ addition',
    explanation:
      'その上 adds a further point in the same direction, often piling up good or bad things: この部屋は広い。その上、安い. It is a bit more formal than それに and often implies the addition is the clincher.',
    functions: ['add'],
    examples: [
      ex('道に 迷った。その上、雨まで 降り出した。', 'I got lost, and on top of that it started to rain.', 'みちに まよった。そのうえ、あめまで ふりだした。'),
      ex('この 店は 料理が おいしい。その上、値段も 安い。', 'The food here is good, and what is more it is cheap.', 'この みせは りょうりが おいしい。そのうえ、ねだんも やすい。'),
    ],
  },
  'n3m-g-b08f56': {
    meaning: 'must; have to (casual forms)',
    structure: 'V-ない + と／V-なくちゃ／V-なきゃ（+ いけない／ならない）',
    explanation:
      'Three spoken shortcuts for "have to": ないと (from ないといけない), なくちゃ (from なくては) and なきゃ (from なければ). All can end the sentence on their own. なきゃ is the most casual; in polite speech add いけません or finish with なければなりません.',
    functions: ['necessary-obligation'],
    examples: [
      ex('早く 寝なきゃ。明日 早いんだ。', "I need to get to bed. I've got an early start tomorrow.", 'はやく ねなきゃ。あした はやいんだ。'),
      ex('薬を 飲まないと。', 'I have to take my medicine.', 'くすりを のまないと。'),
    ],
  },
  'n3m-g-ba224c': {
    meaning: 'only (just ~, and nothing more)',
    structure: 'N／quantity + だけしか + negative',
    explanation:
      'だけしか combines だけ and しか〜ない to stress that the amount is small and nothing beyond it exists: 百円だけしかない "I only have 100 yen". It is more emphatic than either word alone and sounds conversational.',
    functions: ['limit', 'emphasize'],
    examples: [
      ex('財布に 五百円 だけしか 入って いない。', 'I only have five hundred yen in my wallet.', 'さいふに ごひゃくえん だけしか はいって いない。'),
      ex('この 秘密は 君に だけしか 話して いない。', 'I have told this secret to you and you alone.', 'この ひみつは きみに だけしか はなして いない。'),
    ],
  },
  'n3m-g-44e3c3': {
    meaning: 'leaving ~ (on / open); keep ~ing (unchanged, negatively)',
    structure: 'V-ます stem + っぱなし（っぱなしだ／っぱなしに する）',
    explanation:
      'っぱなし describes something left in a state it should not be in: 電気がつけっぱなし "the lights were left on". It also describes an action going on continuously: 立ちっぱなし "standing the whole time". It has a critical tone, unlike the neutral まま.',
    functions: ['continuity', 'criticize'],
    examples: [
      ex('テレビを つけっぱなしに して 寝て しまった。', 'I fell asleep and left the TV on.', 'てれびを つけっぱなしに して ねて しまった。'),
      ex('今日は 一日中 立ちっぱなしで 疲れた。', "I've been on my feet all day and I'm tired.", 'きょうは いちにちじゅう たちっぱなしで つかれた。'),
    ],
  },
  'n3m-g-31ecf3': {
    meaning: 'for that purpose; to that end',
    structure: 'Goal。その ために（は）、+ necessary action',
    explanation:
      'Besides "because of that", そのために can point back to a goal: "to achieve that, …". 医者になりたい。そのためには勉強しなければならない. With は it stresses the requirement. The cause reading and the purpose reading are told apart by what follows.',
    functions: ['purpose-goal'],
    examples: [
      ex('来年 留学したい。その ために、今 お金を ためて いる。', 'I want to study abroad next year. To that end, I am saving money now.', 'らいねん りゅうがくしたい。その ために、いま おかねを ためて いる。'),
      ex('試合に 勝ちたい。その ためには、もっと 練習が 必要だ。', 'I want to win the match. For that, I need more practice.', 'しあいに かちたい。その ためには、もっと れんしゅうが ひつようだ。'),
    ],
  },
  'n3m-g-2121e9': {
    meaning: 'if you ask whether ~, (then yes, but …)',
    structure: 'X か と いえば（と いうと）、…',
    explanation:
      'A question-plus-といえば frame weighs a claim before qualifying it: 好きかといえば、そうでもない "if you ask whether I like it, not really". The pattern AといえばAだが also concedes a point grudgingly: 便利といえば便利だが、高い.',
    functions: ['concessions', 'judge'],
    examples: [
      ex('この 仕事が 好きかと いえば、そうでも ない。', 'If you ask whether I like this job, not particularly.', 'この しごとが すきかと いえば、そうでも ない。'),
      ex('便利と いえば 便利だが、少し 高い。', "It's convenient, I suppose, but a bit expensive.", 'べんりと いえば べんりだが、すこし たかい。'),
    ],
  },
  'n3m-g-51ee4e': {
    meaning: 'it will work out somehow; to manage somehow',
    structure: 'なんとか なる ／ なんとか する',
    explanation:
      'なんとかなる is an optimistic "it will be all right somehow": 心配しないで、なんとかなるよ. なんとかする is the active version, "I’ll find a way". なんとか alone before a verb means "barely, just about": なんとか間に合った.',
    functions: ['ability', 'result'],
    examples: [
      ex('お金は 少ないけど、なんとか なるよ。', "We don't have much money, but it'll work out somehow.", 'おかねは すくないけど、なんとか なるよ。'),
      ex('走って、なんとか 最終電車に 間に合った。', 'I ran and just about made the last train.', 'はしって、なんとか さいしゅうでんしゃに まにあった。'),
    ],
  },
  'n3m-g-564873': {
    meaning: '(respected person) does ~ (honorific)',
    structure: 'お + V-ます stem + に なる（ご + する-noun + に なる）',
    explanation:
      'The regular honorific pattern for verbs without a special form: お帰りになる, お読みになる, ご利用になる. It raises the person who acts, so it is never used for yourself. It does not work with one-mora stems (見る, 寝る); those use ご覧になる or お休みになる.',
    functions: ['reverent-humble'],
    examples: [
      ex('先生は もう お帰りに なりました。', 'The teacher has already gone home.', 'せんせいは もう おかえりに なりました。'),
      ex('この 本を お読みに なりましたか。', 'Have you read this book?', 'この ほんを およみに なりましたか。'),
    ],
  },
  'n3m-g-1efd62': {
    meaning: 'no matter how (one tries) ~',
    structure: 'どう + V-て + も（+ negative）',
    explanation:
      'どう〜ても says that every method or attempt ends the same way: どう考えても "any way you look at it", どうやっても開かない "won’t open whatever I do". どうしても is its common fixed form, meaning "at all costs" or, with a negative, "just can’t".',
    functions: ['concessions'],
    examples: [
      ex('どう 考えても、彼の 意見は おかしい。', 'Any way you look at it, his opinion is odd.', 'どう かんがえても、かれの いけんは おかしい。'),
      ex('どう やっても、この ふたが 開かない。', "Whatever I do, this lid won't open.", 'どう やっても、この ふたが あかない。'),
    ],
  },
  'n3m-g-89ba1a': {
    meaning: 'if ~, (then) maybe …',
    structure: 'V-ば／V-たら + … + かもしれない',
    explanation:
      'A condition followed by a cautious prediction: 急げば間に合うかもしれない "if we hurry, we might make it". It suggests a possibility rather than a promise and often encourages someone to try.',
    functions: ['condition', 'speculation'],
    examples: [
      ex('今 出れば、間に合うかも しれない。', 'If we leave now, we might make it.', 'いま でれば、まにあうかも しれない。'),
      ex('先生に 相談したら、いい 方法が 見つかるかも しれない。', 'If you talk to the teacher, you might find a good way.', 'せんせいに そうだんしたら、いい ほうほうが みつかるかも しれない。'),
    ],
  },
  'n3m-g-8bc57a': {
    meaning: 'it will be fine; very well (old-fashioned, authoritative)',
    structure: 'よかろう（＝よいだろう）；Adj-かろう',
    explanation:
      'よかろう is the classical volitional of よい, meaning "that should be fine" or, as a reply, "very well then". It sounds old-fashioned and authoritative, typical of elderly or high-status characters in fiction. Other い-adjectives form the same way: 高かろう, 寒かろう.',
    functions: ['approve-agree', 'speculation'],
    examples: [
      ex('よかろう。君の 好きに したまえ。', 'Very well. Do as you please.', 'よかろう。きみの すきに したまえ。'),
      ex('その くらいの 値段なら、まあ よかろう。', 'At about that price, it should be all right.', 'その くらいの ねだんなら、まあ よかろう。'),
    ],
  },
  'n3m-g-978a0b': {
    meaning: 'if it comes to ~; in that case',
    structure: 'Plain form／N + と なると（と なれば）',
    explanation:
      'となると considers what follows once a situation arises, often something more serious: 海外に住むとなると、準備が大変だ. It suggests the change in situation brings new consequences. At the start of a sentence, となると means "in that case".',
    functions: ['condition', 'judge'],
    examples: [
      ex('海外で 働くと なると、言葉の 問題が ある。', 'If it comes to working abroad, there is the language problem.', 'かいがいで はたらくと なると、ことばの もんだいが ある。'),
      ex('彼が 来ないと なると、計画を 変えなければ ならない。', 'If he is not coming, we will have to change the plan.', 'かれが こないと なると、けいかくを かえなければ ならない。'),
    ],
  },
  'n3m-g-ec3559': {
    meaning: 'if we assume ~, then …',
    structure: 'Plain form + と すれば',
    explanation:
      'とすれば reasons from an assumption to a conclusion: 毎日一時間歩くとすれば、一年で三百六十五時間になる. It is somewhat more logical and written than としたら, and often introduces a calculation or deduction.',
    functions: ['condition-assumption', 'deductive'],
    examples: [
      ex('一日 千円 貯めると すれば、一年で 三十六万五千円に なる。', 'If you save a thousand yen a day, you will have 365,000 yen in a year.', 'いちにち せんえん ためると すれば、いちねんで さんじゅうろくまんごせんえんに なる。'),
      ex('彼が 犯人だと すれば、説明が つく。', 'If we assume he is the culprit, it all makes sense.', 'かれが はんにんだと すれば、せつめいが つく。'),
    ],
  },
  'n3m-g-791482': {
    meaning: 'possibly; it may be that ~ (depending on how things go)',
    structure: 'ことに よると（場合に よると）、+ clause + かもしれない',
    explanation:
      'ことによると prepares a possibility that depends on circumstances: ことによると、来週は休みになるかもしれない. It is a little formal and usually ends with かもしれない. もしかすると is the more common everyday synonym.',
    functions: ['speculation'],
    examples: [
      ex('ことに よると、今日の 試合は 中止かも しれない。', "It's possible today's match may be cancelled.", 'ことに よると、きょうの しあいは ちゅうしかも しれない。'),
      ex('場合に よると、一週間 ほど 入院するかも しれません。', 'Depending on how it goes, you may need to stay in hospital for about a week.', 'ばあいに よると、いっしゅうかん ほど にゅういんするかも しれません。'),
    ],
  },
  'n3m-g-36c37f': {
    meaning: "it's nothing; no trouble at all",
    structure: 'なんでも ない（なんでも ありません）',
    explanation:
      'なんでもない says something is not important or no trouble: 「大丈夫?」「なんでもないよ」 "Are you OK?" "It’s nothing". It also plays down effort: こんなことはなんでもない. Compare なんでも (“anything at all”) with an affirmative.',
    functions: ['negative'],
    examples: [
      ex('「どうしたの？」「ううん、なんでも ない。」', '"What’s the matter?" "Oh, it’s nothing."', '「どうしたの？」「ううん、なんでも ない。」'),
      ex('この くらいの 距離なら、歩いても なんでも ない。', 'Walking this distance is no trouble at all.', 'この くらいの きょりなら、あるいても なんでも ない。'),
    ],
  },
  'n3m-g-32fcb6': {
    meaning: "without ~, (it is) not possible; unless ~",
    structure: 'V-て／N + で + なくては + negative (できない／ならない)',
    explanation:
      'なくては sets a necessary condition: 実際に見なくては分からない "you won’t understand without seeing it". When the second half is いけない or ならない, it is the obligation pattern; with other negatives, it states a requirement.',
    functions: ['condition-requirement'],
    examples: [
      ex('実際に 使って みなくては、良さは 分からない。', "You can't appreciate it without actually using it.", 'じっさいに つかって みなくては、よさは わからない。'),
      ex('この 仕事は 経験者で なくては 難しい。', 'This job is hard unless you are experienced.', 'この しごとは けいけんしゃで なくては むずかしい。'),
    ],
  },
  'n3m-g-78d726': {
    meaning: 'in the end; after all',
    structure: '結局（けっきょく）+ clause ／ 結局の ところ',
    explanation:
      '結局 introduces the final outcome after twists or deliberation, often different from what was planned: 結局行かなかった. It can express resignation. 最後に simply means "last(ly)", while とうとう and ついに stress a long-awaited outcome.',
    functions: ['result', 'conclude'],
    examples: [
      ex('いろいろ 迷ったが、結局 何も 買わなかった。', 'I hesitated a lot, but in the end I bought nothing.', 'いろいろ まよったが、けっきょく なにも かわなかった。'),
      ex('結局、一番 大事なのは 健康だ。', 'After all, the most important thing is health.', 'けっきょく、いちばん だいじなのは けんこうだ。'),
    ],
  },
  'n3m-g-9d4157': {
    meaning: 'I should have ~; if only ~ (regret)',
    structure: 'V-ば／V-たら + よかった（のに）',
    explanation:
      'Expresses regret about something done or not done: もっと早く来ればよかった "I should have come earlier". With のに, the regret is stronger, and addressed to someone else it becomes criticism: 言ってくれたらよかったのに "you should have told me".',
    functions: ['regret'],
    examples: [
      ex('もっと 勉強すれば よかった。', 'I wish I had studied more.', 'もっと べんきょうすれば よかった。'),
      ex('来るなら、連絡して くれたら よかったのに。', 'If you were coming, you should have let me know.', 'くるなら、れんらくして くれたら よかったのに。'),
    ],
  },
  'n3m-g-1c97d0': {
    meaning: 'on earth; in the world (in questions)',
    structure: '一体（いったい）+ question word + …か',
    explanation:
      '一体 intensifies a question, often with frustration or bewilderment: 一体何があったの? "what on earth happened?". It must be used with a question word. 一体全体 is an even stronger colloquial version.',
    functions: ['emphasize', 'asked'],
    examples: [
      ex('一体 何が あったんですか。', 'What on earth happened?', 'いったい なにが あったんですか。'),
      ex('彼は 一体 どこへ 行って しまったのだろう。', 'Where in the world could he have gone?', 'かれは いったい どこへ いって しまったのだろう。'),
    ],
  },
  'n3m-g-f9cf59': {
    meaning: 'to finish ~ing (carefully, to completion)',
    structure: 'V-ます stem + 上げる（書き上げる・仕上げる・読み上げる）',
    explanation:
      'As a compound, 上げる marks an action carried through to a finished product: 論文を書き上げる, 仕上げる "put the finishing touches to". 読み上げる and 数え上げる mean "read / count out aloud". It is transitive, and 〜終わる is the neutral "finish".',
    functions: ['finish'],
    examples: [
      ex('一週間 かけて、やっと 論文を 書き上げた。', 'After a week I finally finished writing my paper.', 'いっしゅうかん かけて、やっと ろんぶんを かきあげた。'),
      ex('名前を 呼ばれた 人は、この 文を 読み上げて ください。', 'Those whose names are called, please read this sentence out loud.', 'なまえを よばれた ひとは、この ぶんを よみあげて ください。'),
    ],
  },
  'n3m-g-d116da': {
    meaning: 'apart from ~; leaving ~ aside',
    structure: 'N（か どうか）+ は 別として',
    explanation:
      'は別として sets one issue aside to focus on another: 値段は別として、デザインはいい "price aside, the design is good". With か or かどうか it means "whether or not ~": 成功するかどうかは別として. は別にして is a synonym.',
    functions: ['exception'],
    examples: [
      ex('値段は 別として、この 服の デザインは いい。', 'Price aside, the design of these clothes is good.', 'ねだんは べつとして、この ふくの でざいんは いい。'),
      ex('成功するか どうかは 別として、やって みる 価値は ある。', 'Whether or not it succeeds, it is worth trying.', 'せいこうするか どうかは べつとして、やって みる かちは ある。'),
    ],
  },
  'n3m-g-072380': {
    meaning: 'if (ever) ~; even if (by some chance) ~',
    structure: 'もしも + V-たら／なら ／ もしも + V-て + も',
    explanation:
      'もしも reinforces any conditional: たら and なら for hypotheses, ても for "even if". もしも失敗しても後悔しない "even if I should fail, I won’t regret it". The phrase もしもの時 means "in an emergency".',
    functions: ['condition', 'concessions'],
    examples: [
      ex('もしも 失敗しても、後悔は しない。', 'Even if I should fail, I will have no regrets.', 'もしも しっぱいしても、こうかいは しない。'),
      ex('もしもの 時の ために、水を 用意して おこう。', "Let's keep some water ready in case of emergency.", 'もしもの ときの ために、みずを よういして おこう。'),
    ],
  },
  'n3m-g-302e58': {
    meaning: 'not only ~ but also …',
    structure: 'Plain form (Na な／N) + だけで（は）なく、…も',
    explanation:
      'だけでなく extends a statement beyond the first item: 英語だけでなく中国語も話せる. It is neutral and common in speech and writing. ばかりでなく is slightly more formal, and のみならず is literary.',
    functions: ['add'],
    examples: [
      ex('彼は 英語だけで なく、中国語も 話せる。', 'He can speak not only English but also Chinese.', 'かれは えいごだけで なく、ちゅうごくごも はなせる。'),
      ex('この 本は 子供だけで なく、大人にも 人気が ある。', 'This book is popular not only with children but with adults too.', 'この ほんは こどもだけで なく、おとなにも にんきが ある。'),
    ],
  },
  'n3m-g-a9512a': {
    meaning: '(V-stem + 込む) into; thoroughly; (混む) to be crowded',
    structure: 'V-ます stem + 込む（入り込む・書き込む・考え込む）／ 混む',
    explanation:
      'As a suffix, 込む adds "into" (飛び込む "jump in", 書き込む "write in") or "deeply, thoroughly" (考え込む "sink into thought", 信じ込む). The separate verb 混む (also written 込む) means "to be crowded": 電車が混んでいる.',
    functions: ['direction', 'level'],
    examples: [
      ex('子供が プールに 飛び込んだ。', 'The child jumped into the pool.', 'こどもが ぷーるに とびこんだ。'),
      ex('朝の 電車は いつも 混んで いる。', 'The morning trains are always crowded.', 'あさの でんしゃは いつも こんで いる。'),
    ],
  },
  'n3m-g-fbb839': {
    meaning: 'quite; rather (better than expected); (with negative) not easily',
    structure: 'なかなか + Adj（positive）／ なかなか + V-ない',
    explanation:
      'With a positive adjective, なかなか means "quite, surprisingly": なかなかおいしい. It implies a favourable evaluation and is not used to praise a superior directly. With a negative verb it means something does not happen as easily as hoped: バスがなかなか来ない.',
    functions: ['level', 'evaluate'],
    examples: [
      ex('この ワインは なかなか おいしい。', 'This wine is rather good.', 'この わいんは なかなか おいしい。'),
      ex('バスが なかなか 来ない。', "The bus just won't come.", 'ばすが なかなか こない。'),
    ],
  },
  'n3m-g-09bc21': {
    meaning: 'only after ~ (did I realise / could I …)',
    structure: 'V-て + (は) はじめて, …',
    explanation:
      'てはじめて says that something became clear or possible only once an experience happened: 病気になってはじめて健康のありがたさが分かった. The second half is usually a realisation (分かる, 気づく) or a first-time ability.',
    functions: ['limit', 'time-sequence'],
    examples: [
      ex('病気に なって はじめて、健康の 大切さが 分かった。', 'Only after falling ill did I realise the value of health.', 'びょうきに なって はじめて、けんこうの たいせつさが わかった。'),
      ex('一人で 暮らして はじめて、親の ありがたさに 気づいた。', 'It was only after living alone that I appreciated my parents.', 'ひとりで くらして はじめて、おやの ありがたさに きづいた。'),
    ],
  },
  'n3m-g-40834a': {
    meaning: 'or something (like that)',
    structure: 'N + か 何か（かなにか／かなんか）',
    explanation:
      'か何か makes a noun vague: 風邪か何かで休んでいる "off with a cold or something". It avoids committing to a precise word and softens suggestions: ジュースか何か飲む?. For people use か誰か, for places かどこか.',
    functions: ['vague'],
    examples: [
      ex('ペンか 何か、書く ものを 貸して くれない？', 'Could you lend me a pen or something to write with?', 'ぺんか なにか、かく ものを かして くれない？'),
      ex('会議か 何かで、部長は 今 いない。', 'The manager is out right now, at a meeting or something.', 'かいぎか なにかで、ぶちょうは いま いない。'),
    ],
  },
  'n3m-g-f4b5c8': {
    meaning: 'to ~ all the way through; to keep ~ing to the end',
    structure: 'V-ます stem + 通す（とおす）',
    explanation:
      '通す after a stem means carrying an action through to its end without stopping: 最後まで走り通す "run the whole way", 一晩中泣き通す. 読み通す means "read from cover to cover". It stresses persistence.',
    functions: ['continuity', 'finish'],
    examples: [
      ex('彼は マラソンを 最後まで 走り通した。', 'He ran the marathon all the way to the end.', 'かれは まらそんを さいごまで はしりとおした。'),
      ex('この 本を 一晩で 読み通した。', 'I read this book cover to cover in one night.', 'この ほんを ひとばんで よみとおした。'),
    ],
  },
  'n3m-g-5aeb9b': {
    meaning: 'not (~) at all; not in the least',
    structure: '少しも（ちっとも）+ negative',
    explanation:
      'Both mean "not even a little". 少しも is neutral and suits writing; ちっとも is conversational and often sounds like a complaint: ちっとも分からない. 全然 is the most common spoken synonym.',
    functions: ['emphasize-negative'],
    examples: [
      ex('この 映画は 少しも 面白く なかった。', 'This film was not interesting at all.', 'この えいがは すこしも おもしろく なかった。'),
      ex('何度 説明されても、ちっとも 分からない。', "However many times it's explained, I don't understand it at all.", 'なんど せつめいされても、ちっとも わからない。'),
    ],
  },
  'n3m-g-fa738d': {
    meaning: 'go to the trouble of ~; specially',
    structure: 'わざわざ + V（て くれる／来る）',
    explanation:
      'わざわざ says someone made a special effort, often more than needed: わざわざ来てくれてありがとう. Directed at yourself or with criticism it means "needlessly": わざわざ行くことはない. わざと, by contrast, means "on purpose" (usually mischievously).',
    functions: ['action-effort'],
    examples: [
      ex('遠い ところ、わざわざ 来て くださって ありがとう ございます。', 'Thank you for going to the trouble of coming all this way.', 'とおい ところ、わざわざ きて くださって ありがとう ございます。'),
      ex('電話で 済むのに、わざわざ 会いに 行く 必要は ない。', 'A phone call will do; there is no need to go all the way to see them.', 'でんわで すむのに、わざわざ あいに いく ひつようは ない。'),
    ],
  },
  'n3m-g-29c0ff': {
    meaning: '(V-stem + 合う) each other; (合う) to fit, to match',
    structure: 'V-ます stem + 合う（話し合う・付き合う）／ N に 合う',
    explanation:
      'After a stem, 合う makes an action mutual: 話し合う "discuss", 付き合う "go out with, keep company". As an independent verb, 合う means "fit, suit, match": この服はあなたに合う, 意見が合う "agree". Both uses share the idea of two things coming together.',
    functions: ['companion', 'similarity-degree'],
    examples: [
      ex('問題に ついて、家族で よく 話し合った。', 'We talked the problem over carefully as a family.', 'もんだいに ついて、かぞくで よく はなしあった。'),
      ex('彼とは 趣味が よく 合う。', 'He and I have very similar interests.', 'かれとは しゅみが よく あう。'),
    ],
  },
  'n3m-g-08d29d': {
    meaning: 'not only ~ but also …',
    structure: 'Plain form (Na な／N) + ばかりで なく、…も',
    explanation:
      'ばかりでなく says something extends beyond the first item, often to a more surprising one: 日本ばかりでなく、海外でも人気がある. It is a little more formal than だけでなく and common in writing.',
    functions: ['add'],
    examples: [
      ex('この アニメは 日本ばかりで なく、海外でも 人気が ある。', 'This anime is popular not only in Japan but abroad as well.', 'この あにめは にほんばかりで なく、かいがいでも にんきが ある。'),
      ex('彼女は 勉強ばかりで なく、スポーツも 得意だ。', 'She is good not only at studying but at sport too.', 'かのじょは べんきょうばかりで なく、すぽーつも とくいだ。'),
    ],
  },
};

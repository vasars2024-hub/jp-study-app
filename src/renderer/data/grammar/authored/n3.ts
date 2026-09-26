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
};

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
  'n3m-g-5c5344': {
    meaning: 'the reason is that ~; if you ask why, (it is because) ~',
    structure: 'Conclusion。なぜかと いうと（どうしてかと いうと）、+ reason + からだ',
    explanation:
      'These openers announce that an explanation is coming for what was just said. なぜなら(ば) is the most formal; なぜかというと and どうしてかというと are more conversational and sound as if answering an imagined question. All are usually closed with からだ or のだ.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('今日は 早く 帰ります。どうしてかと いうと、子供が 熱を 出したからです。', 'I am going home early today. The reason is that my child has a fever.', 'きょうは はやく かえります。どうしてかと いうと、こどもが ねつを だしたからです。'),
      ex('私は 猫が 好きだ。なぜかと いうと、自由だからだ。', 'I like cats. Why? Because they are free.', 'わたしは ねこが すきだ。なぜかと いうと、じゆうだからだ。'),
    ],
  },
  'n3m-g-89c8ee': {
    meaning: 'X means ~; X is (defined as) ~; the thing is (because) ~',
    structure: 'N + と いうのは（とは）+ definition + ことだ／という 意味だ',
    explanation:
      'というのは and the more written とは introduce a term to be defined: 「積ん読」というのは、本を買って読まないことだ. At the start of a sentence, というのは also gives a reason for what was just said, like "the thing is,": 行けません。というのは、用事があるんです.',
    functions: ['definition', 'explain'],
    examples: [
      ex('「積ん読」と いうのは、本を 買っても 読まずに ためて おく ことだ。', '"Tsundoku" means buying books and letting them pile up unread.', '「つんどく」と いうのは、ほんを かっても よまずに ためて おく ことだ。'),
      ex('明日は 行けません。と いうのは、大事な 用事が あるんです。', "I can't come tomorrow. The thing is, I have something important on.", 'あしたは いけません。と いうのは、だいじな ようじが あるんです。'),
    ],
  },
  'n3m-g-c899bc': {
    meaning: 'for example',
    structure: '例えば（たとえば）+ example（など／とか）',
    explanation:
      '例えば introduces an example, often closed with など or とか: 例えば、りんごやバナナなど. It can also set up a hypothetical: 例えば明日地震が起きたら… "suppose, for instance, that…". In lists within a sentence, のような or といった are alternatives.',
    functions: ['for-example', 'denote-by-example'],
    examples: [
      ex('果物、例えば りんごや みかんが 好きです。', 'I like fruit, for example apples and mandarins.', 'くだもの、たとえば りんごや みかんが すきです。'),
      ex('例えば 明日 雨が 降ったら、どう しますか。', 'Suppose, for example, it rains tomorrow. What will you do?', 'たとえば あした あめが ふったら、どう しますか。'),
    ],
  },
  'n3m-g-759882': {
    meaning: '(place / person) is famous for ~',
    structure: 'N1 は + N2 で 有名だ ／ N2 で 有名な + N1',
    explanation:
      'で marks what something is known for: 京都はお寺で有名だ. Before a noun it is で有名な: 温泉で有名な町. Compare として有名, which states the capacity or role: 作家として有名 "famous as a writer".',
    functions: ['characteristics'],
    examples: [
      ex('この 町は 温泉で 有名だ。', 'This town is famous for its hot springs.', 'この まちは おんせんで ゆうめいだ。'),
      ex('りんごで 有名な 青森に 行って きた。', 'I went to Aomori, which is famous for apples.', 'りんごで ゆうめいな あおもりに いって きた。'),
    ],
  },
  'n3m-g-b37039': {
    meaning: 'it is not that I can’t ~; I could ~ (if necessary)',
    structure: 'V-ない + ことは ない（ことも ない）',
    explanation:
      'A double negative that concedes a possibility reluctantly: 行けないことはない "I suppose I could go". It sounds hesitant, as if a condition or complaint will follow. ないこともない is slightly softer still.',
    functions: ['ability', 'negative'],
    examples: [
      ex('辛い ものは 食べられない ことは ないが、あまり 好きでは ない。', "It's not that I can't eat spicy food, but I don't really like it.", 'からい ものは たべられない ことは ないが、あまり すきでは ない。'),
      ex('急げば 間に合わない ことも ない。', 'If we hurry, we might just make it.', 'いそげば まにあわない ことも ない。'),
    ],
  },
  'n3m-g-bef514': {
    meaning: 'in place of ~; on behalf of ~',
    structure: 'N + に 代わって（に 代わり／に 代わる + N）',
    explanation:
      'に代わって says one person or thing replaces another, either substituting (社長に代わって部長が挨拶する "on behalf of the president") or taking over a role over time (手紙に代わってメールが使われる). に代わる + N modifies a noun.',
    functions: ['selective'],
    examples: [
      ex('社長に 代わって、私が ご挨拶 いたします。', 'I will give the greeting on behalf of the president.', 'しゃちょうに かわって、わたしが ごあいさつ いたします。'),
      ex('最近は 手紙に 代わって、メールが 使われて いる。', 'These days email is used instead of letters.', 'さいきんは てがみに かわって、めーるが つかわれて いる。'),
    ],
  },
  'n3m-g-1c1f2b': {
    meaning: 'as a result; consequently',
    structure: 'N の／V-た + 結果（、…）／ Sentence。その 結果、…',
    explanation:
      '結果 reports the outcome of an action or process: よく話し合った結果、計画を変えた. At the start of a sentence, その結果 means "as a result". It suits reports and news; the outcome is a fact, not a wish.',
    functions: ['result'],
    examples: [
      ex('毎日 練習した。その 結果、試合に 勝つ ことが できた。', 'I practised every day, and as a result I was able to win the match.', 'まいにち れんしゅうした。その けっか、しあいに かつ ことが できた。'),
      ex('家族で 相談した 結果、引っ越す ことに した。', 'After talking it over as a family, we decided to move.', 'かぞくで そうだんした けっか、ひっこす ことに した。'),
    ],
  },
  'n3m-g-be16b0': {
    meaning: 'at most; at best; as much as one can',
    structure: 'せいぜい + quantity ／ せいぜい + V',
    explanation:
      'With a quantity, せいぜい gives an upper limit that is not much: せいぜい三十分 "thirty minutes at most". Before a verb it means "do what little you can": せいぜい頑張って, which can sound ironic. Compare 多くても, which is neutral.',
    functions: ['limit', 'amount-roughly'],
    examples: [
      ex('駅まで 歩いても、せいぜい 十分だ。', 'Even on foot, it is ten minutes to the station at most.', 'えきまで あるいても、せいぜい じゅっぷんだ。'),
      ex('この 仕事の アルバイト代は、せいぜい 時給 千円だろう。', 'The pay for this part-time job is probably a thousand yen an hour at best.', 'この しごとの あるばいとだいは、せいぜい じきゅう せんえんだろう。'),
    ],
  },
  'n3m-g-5486c5': {
    meaning: 'not necessarily ~; not always ~',
    structure: '必ずしも + plain form + とは 限らない（わけでは ない）',
    explanation:
      'A partial negation: 必ずしも〜とは限らない says a general expectation does not always hold: 高い物が必ずしもいい物とは限らない. 必ずしも must be followed by a negative. とは限らない alone also works.',
    functions: ['negative', 'judge'],
    examples: [
      ex('高い ものが 必ずしも いい ものとは 限らない。', 'Expensive things are not necessarily good.', 'たかい ものが かならずしも いい ものとは かぎらない。'),
      ex('先生の 言う ことが 必ずしも 正しいとは 限らない。', "What the teacher says isn't always right.", 'せんせいの いう ことが かならずしも ただしいとは かぎらない。'),
    ],
  },
  'n3m-g-1ffc0c': {
    meaning: 'may ~; I pray that ~ (a wish)',
    structure: 'V-ます + ように（V-ません + ように）',
    explanation:
      'Ending a sentence with ますように expresses a wish or prayer, as at shrines or on tanabata strips: 合格できますように "may I pass". It often follows どうか. With a negative, ませんように wishes something will not happen.',
    functions: ['wish'],
    examples: [
      ex('どうか 試験に 合格できますように。', 'Please, let me pass the exam.', 'どうか しけんに ごうかくできますように。'),
      ex('明日 雨が 降りませんように。', 'I hope it doesn’t rain tomorrow.', 'あした あめが ふりませんように。'),
    ],
  },
  'n3m-g-83a9bc': {
    meaning: 'rather than ~; or rather ~',
    structure: 'Plain form／N + と いうより（と いうか）',
    explanation:
      'というより corrects an expression to a more accurate one: 暑いというより熱い "not so much hot as scorching". というか is the casual, vaguer version, used while searching for the right word. むしろ often follows というより.',
    functions: ['compare', 'corrections'],
    examples: [
      ex('今日は 涼しいと いうより、寒い くらいだ。', 'Today is not so much cool as downright cold.', 'きょうは すずしいと いうより、さむい くらいだ。'),
      ex('彼は 友達と いうか、家族みたいな 存在だ。', "He's more like family than a friend, really.", 'かれは ともだちと いうか、かぞくみたいな そんざいだ。'),
    ],
  },
  'n3m-g-ba800a': {
    meaning: 'to ~ completely; (切れない) cannot ~ all',
    structure: 'V-ます stem + 切る（切れる／切れない）',
    explanation:
      '切る after a stem means doing something completely: 使い切る "use up", 走り切る. The potential 切れる says it can be done fully, and 切れない is common for "too much to ~": 食べ切れない "can’t eat it all", 数え切れない "countless".',
    functions: ['finish', 'ability'],
    examples: [
      ex('こんなに たくさん、一人では 食べ切れない。', "I can't eat this much on my own.", 'こんなに たくさん、ひとりでは たべきれない。'),
      ex('一ヶ月で 給料を 全部 使い切って しまった。', 'I used up my entire salary in a month.', 'いっかげつで きゅうりょうを ぜんぶ つかいきって しまった。'),
    ],
  },
  'n3m-g-7cd647': {
    meaning: 'no matter how (much) ~',
    structure: 'いくら + V-て／Adj-くて + も ／ いくら + N・Na + でも',
    explanation:
      'いくら with ても says the degree changes nothing: いくら呼んでも返事がない. It is the most common spoken choice; どんなに is a little softer and いかに more formal. The result is usually negative or unexpected.',
    functions: ['concessions'],
    examples: [
      ex('いくら 呼んでも、返事が ない。', 'No matter how many times I call, there is no answer.', 'いくら よんでも、へんじが ない。'),
      ex('いくら 好きでも、毎日 同じ 物は 食べられない。', 'However much I like it, I can’t eat the same thing every day.', 'いくら すきでも、まいにち おなじ ものは たべられない。'),
    ],
  },
  'n3m-g-9b1cb8': {
    meaning: 'if you mention ~ / say ~, (what comes to mind is) …',
    structure: 'N + と いうと（と いえば／と いったら）+ association',
    explanation:
      'All three bring a topic into focus and say what it evokes. というと often opens a question to confirm what the other person meant: 来週というと、何日ですか. といったら adds emotional weight; といえば is the most neutral.',
    functions: ['story-topic'],
    examples: [
      ex('日本の 冬と いうと、雪と 温泉を 思い出す。', 'When people mention winter in Japan, I think of snow and hot springs.', 'にほんの ふゆと いうと、ゆきと おんせんを おもいだす。'),
      ex('「来週」と いうと、何日の ことですか。', 'When you say "next week", which date do you mean?', '「らいしゅう」と いうと、なんにちの ことですか。'),
    ],
  },
  'n3m-g-55006c': {
    meaning: 'although I say ~, (it is not that much)',
    structure: 'Plain form／N + と いっても',
    explanation:
      'といっても corrects an impression the listener might form from the previous words: 料理ができるといっても、簡単なものだけだ "I can cook, but only simple things". The second half limits or downplays the first.',
    functions: ['concessions', 'corrections'],
    examples: [
      ex('料理が できると いっても、簡単な ものだけです。', 'I can cook, but only simple things.', 'りょうりが できると いっても、かんたんな ものだけです。'),
      ex('休みと いっても、家で 仕事を して いた。', 'It was a day off, supposedly, but I was working at home.', 'やすみと いっても、いえで しごとを して いた。'),
    ],
  },
  'n3m-g-d3ab6c': {
    meaning: 'rather (than ~); if anything',
    structure: 'A より（も）むしろ B',
    explanation:
      'むしろ says that B is closer to the truth or preferable, often against expectation: 夏よりむしろ冬が好きだ. It suggests the speaker is correcting an assumption. Used alone, むしろ means "if anything, on the contrary".',
    functions: ['compare', 'selective'],
    examples: [
      ex('この 仕事は 体力より むしろ 忍耐が 必要だ。', 'This job needs patience rather than physical strength.', 'この しごとは たいりょくより むしろ にんたいが ひつようだ。'),
      ex('薬を 飲んだら、むしろ 悪く なった。', 'After taking the medicine, if anything I got worse.', 'くすりを のんだら、むしろ わるく なった。'),
    ],
  },
  'n3m-g-6e9e33': {
    meaning: 'I meant to ~ (but); I thought I had ~',
    structure: 'V-dict + つもりだった ／ V-た + つもりだった',
    explanation:
      'With a dictionary verb, つもりだった is a plan that did not happen: 行くつもりだったが、行けなかった. With a past verb it means the speaker believed they had done something, but had not: 鍵をかけたつもりだった.',
    functions: ['intent', 'unexpected-outcome'],
    examples: [
      ex('昨日は 勉強する つもりだったが、寝て しまった。', 'I meant to study yesterday, but I fell asleep.', 'きのうは べんきょうする つもりだったが、ねて しまった。'),
      ex('メールを 送った つもりだったが、まだ 下書きに 残って いた。', 'I thought I had sent the email, but it was still in drafts.', 'めーるを おくった つもりだったが、まだ したがきに のこって いた。'),
    ],
  },
  'n3m-g-6c7e8c': {
    meaning: 'not particularly; not really',
    structure: '別に（べつに）+ negative',
    explanation:
      '別に〜ない says there is nothing special: 別に用はない "I don’t want anything in particular". As a one-word answer, 別に can sound cold or sulky ("whatever"), so 特にありません is safer in polite talk.',
    functions: ['negative'],
    examples: [
      ex('別に 用が あるわけじゃ ないけど、電話して みた。', "I didn't want anything in particular, I just thought I'd call.", 'べつに ようが あるわけじゃ ないけど、でんわして みた。'),
      ex('「何か 質問は？」「いえ、別に ありません。」', '"Any questions?" "No, nothing in particular."', '「なにか しつもんは？」「いえ、べつに ありません。」'),
    ],
  },
  'n3m-g-495766': {
    meaning: 'because ~ (you see) (excuse, complaint)',
    structure: 'Plain form + もの（もん）／ んだもの（んだもん）',
    explanation:
      'Sentence-final もの gives a personal reason, often as an excuse or complaint: だって、眠いんだもん "but I’m sleepy!". It sounds childish or feminine in casual speech, and is often preceded by だって. It is not used in formal situations.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('だって、知らなかったんだもん。', "But I didn't know!", 'だって、しらなかったんだもん。'),
      ex('行きたくないよ。寒いんだもの。', "I don't want to go. It's cold.", 'いきたくないよ。さむいんだもの。'),
    ],
  },
  'n3m-g-bce815': {
    meaning: 'never; by no means',
    structure: '決して（けっして）+ negative',
    explanation:
      '決して strengthens a negative into a firm "never": 決して忘れない. It is emphatic and slightly formal, suited to promises and warnings. 絶対に can be used with both negatives and positives, whereas 決して only goes with negatives.',
    functions: ['emphasize-negative'],
    examples: [
      ex('ご恩は 決して 忘れません。', 'I will never forget your kindness.', 'ごおんは けっして わすれません。'),
      ex('この 薬は 決して 子供の 手が 届く 所に 置かないで ください。', 'Never leave this medicine where children can reach it.', 'この くすりは けっして こどもの てが とどく ところに おかないで ください。'),
    ],
  },
  'n3m-g-8a031c': {
    meaning: 'certainly; indeed (I admit)',
    structure: '確かに（たしかに）+ clause（、が／けど …）',
    explanation:
      '確かに confirms that something is true, often as a concession before a but: 確かに高いが、品質はいい. As a reply it means "that’s true, you’re right". 確か without に means "if I remember correctly".',
    functions: ['approve-agree', 'concessions'],
    examples: [
      ex('確かに 値段は 高いが、品質は いい。', "It's certainly expensive, but the quality is good.", 'たしかに ねだんは たかいが、ひんしつは いい。'),
      ex('「この 道、前にも 通ったよね。」「確かに。」', '"We came down this road before, didn’t we?" "You’re right."', '「この みち、まえにも とおったよね。」「たしかに。」'),
    ],
  },
  'n3m-g-3acec8': {
    meaning: 'the fact that ~; (hearsay) I hear that ~',
    structure: 'Plain form + と いう こと（と いうの）',
    explanation:
      'ということ turns a statement into a noun phrase, "the fact that ~": 彼が辞めたということを聞いた. At the end of a sentence, ということだ reports hearsay or sums up a conclusion ("so that means ~"). というの is the spoken version.',
    functions: ['definition', 'heard'],
    examples: [
      ex('彼が 会社を 辞めると いう ことを、今日 初めて 聞いた。', 'I heard today for the first time that he is quitting the company.', 'かれが かいしゃを やめると いう ことを、きょう はじめて きいた。'),
      ex('つまり、明日は 休みと いう ことですね。', 'So that means tomorrow is a day off, right?', 'つまり、あしたは やすみと いう ことですね。'),
    ],
  },
  'n3m-g-45f12f': {
    meaning: 'should be ~ (expected) / cannot possibly be ~',
    structure: 'Plain form (Na な／N の) + はずだ ／ はずが ない',
    explanation:
      'はずだ expresses a confident expectation based on reasoning: 荷物は明日着くはずだ. はずがない rules something out as impossible: 彼がうそをつくはずがない. The difference from べきだ is that はず is about likelihood, not duty.',
    functions: ['of-course', 'judge'],
    examples: [
      ex('先週 送ったので、荷物は もう 着いて いる はずだ。', 'I sent it last week, so the package should have arrived by now.', 'せんしゅう おくったので、にもつは もう ついて いる はずだ。'),
      ex('あんなに 正直な 人が うそを つく はずが ない。', 'Someone that honest could not possibly lie.', 'あんなに しょうじきな ひとが うそを つく はずが ない。'),
    ],
  },
  'n3m-g-3f9c2f': {
    meaning: 'please let me ~; could I ~?',
    structure: 'V-causative-て + ください／もらえますか／もらえませんか',
    explanation:
      'Three levels of asking permission to do something yourself. させてください is direct and eager, させてもらえますか is a polite question, and させてもらえませんか is softer still. For the highest politeness, use させていただけませんか.',
    functions: ['request-permission'],
    examples: [
      ex('その 仕事、ぜひ 私に やらせて ください。', 'Please let me do that job.', 'その しごと、ぜひ わたしに やらせて ください。'),
      ex('少し 考えさせて もらえませんか。', 'Could you give me a little time to think?', 'すこし かんがえさせて もらえませんか。'),
    ],
  },
  'n3m-g-ac7d86': {
    meaning: 'compared with ~',
    structure: 'N + に 比べて（と 比べて／に 比べると）',
    explanation:
      'に比べて sets a standard for comparison: 去年に比べて今年は暑い. It is more explicit than より and common in reports about change. と比べて is interchangeable in most cases.',
    functions: ['compare'],
    examples: [
      ex('去年に 比べて、今年は 雨が 少ない。', 'Compared with last year, there has been less rain this year.', 'きょねんに くらべて、ことしは あめが すくない。'),
      ex('都会に 比べると、田舎の 生活は のんびり して いる。', 'Compared with the city, life in the country is relaxed.', 'とかいに くらべると、いなかの せいかつは のんびり して いる。'),
    ],
  },
  'n3m-g-0878a3': {
    meaning: 'even if ~; whether ~ or ~',
    structure: 'Plain form／N + に しても（に しろ／に せよ）',
    explanation:
      'にしても concedes a point but insists something else still holds: 忙しいにしても、連絡くらいできるはずだ. Doubled (AにしろBにしろ) it means "whether A or B". にしろ and にせよ are more written than にしても.',
    functions: ['concessions'],
    examples: [
      ex('忙しいに しても、電話 くらいは できる だろう。', 'Even if you are busy, you could at least phone.', 'いそがしいに しても、でんわ くらいは できる だろう。'),
      ex('行くに しろ 行かないに しろ、早く 返事を ください。', 'Whether you go or not, please let me know soon.', 'いくに しろ いかないに しろ、はやく へんじを ください。'),
    ],
  },
  'n3m-g-825ba9': {
    meaning: 'to decide to ~; (ことにしている) to make it a rule to ~',
    structure: 'V-dict／V-ない + ことに する（ことに して いる）',
    explanation:
      'ことにする states a personal decision: 毎朝走ることにした. ことにしている describes a habit kept by choice: 夜はコーヒーを飲まないことにしている. Compare ことになる, where the decision is made by others or by circumstances.',
    functions: ['decision', 'repeat-habits'],
    examples: [
      ex('健康の ために、毎朝 歩く ことに した。', 'For my health, I decided to walk every morning.', 'けんこうの ために、まいあさ あるく ことに した。'),
      ex('夜 九時 以降は 何も 食べない ことに して いる。', 'I make it a rule not to eat anything after nine at night.', 'よる くじ いこうは なにも たべない ことに して いる。'),
    ],
  },
  'n3m-g-c5d868': {
    meaning: 'all at once; at one time',
    structure: '一度に（いちどに）+ V',
    explanation:
      '一度に says several things happen at the same time or in one go: 一度に三冊借りられる "you can borrow three books at a time". It differs from 一度 "once", which counts occasions. 同時に stresses simultaneity more formally.',
    functions: ['simultaneous'],
    examples: [
      ex('そんなに 一度に 言われても、覚えられない。', "I can't remember all that if you tell me at once.", 'そんなに いちどに いわれても、おぼえられない。'),
      ex('図書館では 一度に 五冊まで 借りられる。', 'You can borrow up to five books at a time from the library.', 'としょかんでは いちどに ごさつまで かりられる。'),
    ],
  },
  'n3m-g-afa512': {
    meaning: 'if (we suppose) ~, then …',
    structure: 'Plain form + と したら／と すれば, … (だろう／か)',
    explanation:
      'Both set up a supposition and reason from it. としたら is more conversational and suits imagined situations; とすれば sounds more logical and suits deductions. Neither can be followed by a command. The supposition is often introduced with もし or 仮に.',
    functions: ['condition-assumption'],
    examples: [
      ex('仮に 引っ越すと したら、どこに 住みたい？', 'Say you were to move, where would you want to live?', 'かりに ひっこすと したら、どこに すみたい？'),
      ex('この 計算が 正しいと すれば、予算が 足りない。', 'If this calculation is right, the budget is not enough.', 'この けいさんが ただしいと すれば、よさんが たりない。'),
    ],
  },
  'n3m-g-5f855c': {
    meaning: 'possibly; maybe; perhaps',
    structure: 'もしかすると（もしかしたら）+ clause + かもしれない',
    explanation:
      'Both mark a low-probability guess completed by かもしれない: もしかすると今日は来ないかもしれない. もしかしたら is more conversational; もしかすると is marginally more formal. もしかして in questions means "by any chance".',
    functions: ['speculation'],
    examples: [
      ex('もしかすると、彼は もう 知って いるかも しれない。', 'Perhaps he already knows.', 'もしかすると、かれは もう しって いるかも しれない。'),
      ex('もしかしたら、今年は 雪が 降らないかも しれない。', 'It may not snow at all this year.', 'もしかしたら、ことしは ゆきが ふらないかも しれない。'),
    ],
  },
  'n3m-g-8da92c': {
    meaning: 'if ~ is too (much), …; so ~ that …',
    structure: 'あまりに（も）+ Adj／V + と, … ／ あまりの + N + に',
    explanation:
      'あまりに(も) marks an excessive degree that leads to a result: あまりに寒いと、外に出たくない. あまりの + noun + に gives the cause of a reaction: あまりの暑さに倒れそうだ. あんまり is the spoken form.',
    functions: ['level', 'condition'],
    examples: [
      ex('あまりに 値段が 高いと、誰も 買わない だろう。', 'If the price is too high, no one will buy it.', 'あまりに ねだんが たかいと、だれも かわない だろう。'),
      ex('あまりの 暑さに、何も する 気に ならない。', "It's so hot I don't feel like doing anything.", 'あまりの あつさに、なにも する きに ならない。'),
    ],
  },
  'n3m-g-4fe524': {
    meaning: '~ has its own (merits / way / reasons)',
    structure: 'N1 には + N1 の + N2 が ある',
    explanation:
      'Repeating the noun says each thing has something of its own that deserves respect: 子供には子供の考えがある "children have their own ideas". It is used to defend a point of view or argue for tolerance.',
    functions: ['characteristics', 'perspective-way'],
    examples: [
      ex('子供には 子供の 考えが ある。', 'Children have their own way of thinking.', 'こどもには こどもの かんがえが ある。'),
      ex('田舎には 田舎の よさが ある。', 'The countryside has its own good points.', 'いなかには いなかの よさが ある。'),
    ],
  },
  'n3m-g-da3a11': {
    meaning: 'can become ~; to be able to be ~',
    structure: 'N に／Adj-く + なれる',
    explanation:
      'なれる is the potential of なる: whether someone is able to become something: 医者になれる "can become a doctor", 強くなれる. It focuses on possibility or ability, while になる states the change itself.',
    functions: ['ability', 'achievement'],
    examples: [
      ex('努力すれば、誰でも 上手に なれる。', 'Anyone can get good at it if they work hard.', 'どりょくすれば、だれでも じょうずに なれる。'),
      ex('いつか 父の ような 医者に なれたら いいな。', "I hope I can become a doctor like my father one day.", 'いつか ちちの ような いしゃに なれたら いいな。'),
    ],
  },
  'n3m-g-1fcde9': {
    meaning: 'there is no way ~; cannot possibly ~',
    structure: 'Plain form (Na な／N の) + わけ（が）ない',
    explanation:
      'わけがない rejects something as impossible or absurd: そんなことがあるわけがない. In speech が is often dropped (わけない). It is subjective and emphatic; はずがない is a more reasoned "cannot be".',
    functions: ['negative', 'judge'],
    examples: [
      ex('こんな 難しい 問題、子供に 分かる わけが ない。', 'There is no way a child could understand a problem this difficult.', 'こんな むずかしい もんだい、こどもに わかる わけが ない。'),
      ex('あの 店が 安い わけない よ。', "There's no way that shop is cheap.", 'あの みせが やすい わけない よ。'),
    ],
  },
  'n3m-g-e8adb4': {
    meaning: "it doesn't mean ~ either; it's not that ~",
    structure: 'Plain form (Na な／N の) + わけでも ない',
    explanation:
      'わけでもない denies a conclusion the listener might draw, often after another denial: 嫌いなわけでもない "it’s not that I dislike it either". The も links it to a preceding negative. わけではない is the basic form without that linking.',
    functions: ['negative', 'corrections'],
    examples: [
      ex('料理が 嫌いな わけでも ないが、毎日は 面倒だ。', "It's not that I dislike cooking, but doing it every day is a chore.", 'りょうりが きらいな わけでも ないが、まいにちは めんどうだ。'),
      ex('お金が ない わけでも ないのに、彼は いつも 安い 物を 買う。', "It's not as if he has no money, yet he always buys cheap things.", 'おかねが ない わけでも ないのに、かれは いつも やすい ものを かう。'),
    ],
  },
  'n3m-g-0d3ace': {
    meaning: 'however (much) ~',
    structure: 'どんなに + V-て／Adj-くて + も（N・Na でも）',
    explanation:
      'どんなに〜ても says that however great the degree, the result stays the same: どんなに疲れていても、勉強は続ける. It is common in resolutions and encouragement, and slightly softer than いくら.',
    functions: ['concessions'],
    examples: [
      ex('どんなに 疲れて いても、毎晩 本を 読む。', 'However tired I am, I read every night.', 'どんなに つかれて いても、まいばん ほんを よむ。'),
      ex('どんなに 小さな ことでも、報告して ください。', 'Please report everything, however small.', 'どんなに ちいさな ことでも、ほうこくして ください。'),
    ],
  },
  'n3m-g-91e05c': {
    meaning: 'I hope ~; it would be nice if ~',
    structure: 'V／Adj + と いいなあ ／ V-たら いいなあ ／ V-ば いいなあ',
    explanation:
      'All three express a wish, and なあ shows the speaker is musing aloud. といいなあ is the most neutral; たらいいなあ is conversational; ばいいなあ can sound like "if only". For something about the listener, といいですね sounds kind.',
    functions: ['wish'],
    examples: [
      ex('週末は 晴れると いいなあ。', 'I hope the weekend is sunny.', 'しゅうまつは はれると いいなあ。'),
      ex('もっと 日本語が 上手に 話せたら いいなあ。', 'It would be nice if I could speak Japanese better.', 'もっと にほんごが じょうずに はなせたら いいなあ。'),
    ],
  },
  'n3m-g-eeac9c': {
    meaning: 'to get used to ~',
    structure: 'N／V-dict の + に 慣れる（慣れて きた／慣れて いる）',
    explanation:
      'The thing you become accustomed to takes に; an action is nominalised with の or こと: 早く起きるのに慣れた. 慣れてきた stresses the gradual process, 慣れている the resulting state.',
    functions: ['status', 'process'],
    examples: [
      ex('日本の 生活にも だんだん 慣れて きた。', "I'm gradually getting used to life in Japan.", 'にほんの せいかつにも だんだん なれて きた。'),
      ex('毎朝 五時に 起きる のに やっと 慣れた。', "I've finally got used to getting up at five every morning.", 'まいあさ ごじに おきる のに やっと なれた。'),
    ],
  },
  'n3m-g-24bdec': {
    meaning: 'things like ~ (often dismissive or modest)',
    structure: 'N + なんか（なんて／など）',
    explanation:
      'なんか and など give an example, and often add an attitude: modesty about oneself (私なんかまだまだです), contempt (勉強なんかしたくない) or a light suggestion (お茶なんかどう?). なんて adds surprise or disdain: 宿題を忘れるなんて.',
    functions: ['denote-by-example', 'contemptuous'],
    examples: [
      ex('私なんか まだまだ 初心者です。', "Someone like me is still just a beginner.", 'わたしなんか まだまだ しょしんしゃです。'),
      ex('試験の 前の 日に 遊ぶ なんて、信じられない。', "Going out the day before an exam? I can't believe it.", 'しけんの まえの ひに あそぶ なんて、しんじられない。'),
    ],
  },
  'n3m-g-78fea4': {
    meaning: 'told (someone) to ~ / not to ~ (reported command)',
    structure: 'V-imperative + と（言う）／ V-dict + な + と（言う）',
    explanation:
      'When reporting an order, Japanese quotes it with the plain imperative (しろ, 来い) or prohibition (するな), whatever the original politeness: 先生に早く帰れと言われた. The verb after と is often 言われる or 注意される.',
    functions: ['speak', 'order'],
    examples: [
      ex('母に 早く 寝ろと 言われた。', 'My mother told me to go to bed early.', 'ははに はやく ねろと いわれた。'),
      ex('医者に お酒を 飲むなと 注意された。', 'The doctor warned me not to drink.', 'いしゃに おさけを のむなと ちゅういされた。'),
    ],
  },
  'n3m-g-eb1430': {
    meaning: 'if (only) ~, (it would have …, but)',
    structure: 'V-ば／V-たら + … + のに',
    explanation:
      'A counterfactual with regret or complaint: 早く言ってくれたら手伝ったのに "if you had told me earlier, I would have helped". The のに signals that reality was otherwise. With ばいいのに it becomes advice: 聞けばいいのに "why don’t you just ask?".',
    functions: ['condition-contrary', 'regret'],
    examples: [
      ex('もっと 早く 言って くれたら、手伝ったのに。', 'If you had told me earlier, I would have helped.', 'もっと はやく いって くれたら、てつだったのに。'),
      ex('分からないなら、先生に 聞けば いいのに。', "If you don't understand, why don't you just ask the teacher?", 'わからないなら、せんせいに きけば いいのに。'),
    ],
  },
  'n3m-g-fbca95': {
    meaning: 'at all costs; (with negative) just cannot ~',
    structure: 'どうしても + V-たい／V-なければ ／ どうしても + V-ない',
    explanation:
      'With a wish or obligation, どうしても expresses strong determination: どうしても行きたい. With a negative, it says something is impossible despite trying: どうしても思い出せない "I just can’t remember". It is more emotional than なんとしても.',
    functions: ['determination-decision', 'emphasize'],
    examples: [
      ex('この コンサートには どうしても 行きたい。', 'I really must go to this concert.', 'この こんさーとには どうしても いきたい。'),
      ex('彼の 名前が どうしても 思い出せない。', "I just can't remember his name.", 'かれの なまえが どうしても おもいだせない。'),
    ],
  },
  'n3m-g-6d3280': {
    meaning: 'not at all; completely (not)',
    structure: '全く（まったく）+ negative ／ 全く + Adj',
    explanation:
      'With a negative, 全く means "not at all": 全く分からない. It is more written than 全然. With a positive word it means "completely, truly": 全く同じ. As an exclamation, まったく! expresses exasperation.',
    functions: ['emphasize-negative'],
    examples: [
      ex('彼が 何を 言って いるのか、全く 分からない。', 'I have absolutely no idea what he is saying.', 'かれが なにを いって いるのか、まったく わからない。'),
      ex('二人の 意見は 全く 同じだった。', "The two of them had exactly the same opinion.", 'ふたりの いけんは まったく おなじだった。'),
    ],
  },
  'n3m-g-bbdb08': {
    meaning: 'for a while; for the time being; (it has been) a long time',
    structure: 'しばらく + V ／ しばらくです（ね）／ しばらくして',
    explanation:
      'しばらく covers an indefinite stretch of time, short or long: しばらくお待ちください "please wait a moment", しばらく休む "rest for a while". しばらくして means "after a while", and しばらくですね is a greeting after a long time apart.',
    functions: ['time', 'period'],
    examples: [
      ex('しばらく お待ち ください。', 'Please wait a moment.', 'しばらく おまち ください。'),
      ex('しばらく して、雨が やんだ。', 'After a while, the rain stopped.', 'しばらく して、あめが やんだ。'),
    ],
  },
  'n3m-g-88590b': {
    meaning: '(asked someone) to ~ (reported request)',
    structure: 'V-て + くれ + と（言う／頼む）',
    explanation:
      'Quoting a request made to the speaker or others, the plain てくれ is used whatever the original politeness: 友達に手伝ってくれと頼まれた "a friend asked me to help". The negative is ないでくれと. For a request to the speaker’s side, てほしいと言われた is also common.',
    functions: ['speak', 'request'],
    examples: [
      ex('友達に 引っ越しを 手伝って くれと 頼まれた。', 'A friend asked me to help with their move.', 'ともだちに ひっこしを てつだって くれと たのまれた。'),
      ex('父は 誰にも 言わないで くれと 言った。', 'My father asked me not to tell anyone.', 'ちちは だれにも いわないで くれと いった。'),
    ],
  },
  'n3m-g-667e7d': {
    meaning: 'not even ~ (with negative); even (someone expected to cope)',
    structure: 'N + さえ + negative ／ N + で さえ（〜のに）',
    explanation:
      'With a negative, さえ says the most basic thing is missing: 水さえない "there isn’t even any water". でさえ after a person or group picks someone who should manage easily: 専門家でさえ分からない "even experts don’t know". Compare まで, which adds an item in a positive sense.',
    functions: ['extreme-example', 'emphasize-negative'],
    examples: [
      ex('疲れて いて、話す 元気さえ ない。', "I'm so tired I don't even have the energy to talk.", 'つかれて いて、はなす げんきさえ ない。'),
      ex('この 問題は 専門家で さえ 答えられない。', 'Even experts cannot answer this question.', 'この もんだいは せんもんかで さえ こたえられない。'),
    ],
  },
  'n3m-g-6e22dc': {
    meaning: '(casual) ended up ~; ~ completely (てしまった)',
    structure: 'V-て形 → V-ちゃった（て しまった）；V-で → V-じゃった（で しまった）',
    explanation:
      'ちゃった is the spoken contraction of てしまった, and じゃった of でしまった. It covers both completion and regret: 全部食べちゃった "I ate it all (oops)". The non-past forms are ちゃう and じゃう; in writing and polite speech, use てしまいました.',
    functions: ['finish', 'regret'],
    examples: [
      ex('ごめん、ケーキ 全部 食べちゃった。', 'Sorry, I ate all the cake.', 'ごめん、けーき ぜんぶ たべちゃった。'),
      ex('電車で 寝ちゃって、駅を 乗り過ごした。', 'I fell asleep on the train and missed my stop.', 'でんしゃで ねちゃって、えきを のりすごした。'),
    ],
  },
  'n3m-g-4062b4': {
    meaning: 'according to ~ (source of information)',
    structure: 'N（source）+ に よれば（に よると）、+ hearsay（そうだ／らしい／ということだ）',
    explanation:
      'によれば and によると name the source of reported information, and the sentence ends in a hearsay form such as そうだ or ということだ: 天気予報によると、明日は雨だそうだ. Ending with plain だ would sound as if the speaker knew it directly.',
    functions: ['information-resource', 'heard'],
    examples: [
      ex('天気予報に よると、明日は 雪が 降るそうだ。', 'According to the weather forecast, it will snow tomorrow.', 'てんきよほうに よると、あしたは ゆきが ふるそうだ。'),
      ex('新聞に よれば、来月から 電気代が 上がる らしい。', 'According to the newspaper, electricity prices are going up from next month.', 'しんぶんに よれば、らいげつから でんきだいが あがる らしい。'),
    ],
  },
  'n3m-g-237628': {
    meaning: 'it has been decided that ~; (ことになっている) the rule is ~',
    structure: 'V-dict／V-ない + ことに なる（ことに なって いる）',
    explanation:
      'ことになる reports a decision made by others or brought about by circumstances: 来月、転勤することになった. ことになっている describes an existing rule or arrangement: ここでは靴を脱ぐことになっている. Compare ことにする, the speaker’s own choice.',
    functions: ['decision', 'planning-rules'],
    examples: [
      ex('来月から 大阪に 転勤する ことに なりました。', 'It has been decided that I will transfer to Osaka next month.', 'らいげつから おおさかに てんきんする ことに なりました。'),
      ex('この 寮では 十時までに 帰る ことに なって いる。', 'In this dormitory, the rule is to be back by ten.', 'この りょうでは じゅうじまでに かえる ことに なって いる。'),
    ],
  },
  'n3m-g-a52e95': {
    meaning: 'to tell / ask / warn someone to ~ (indirect request)',
    structure: 'Person に + V-dict／V-ない + ように + 言う／頼む／注意する／伝える',
    explanation:
      'ように turns a command or request into indirect speech: 母は私に早く寝るように言った "my mother told me to go to bed early". It is softer than quoting the imperative (寝ろと言った). The verb chosen shows the tone: 頼む asks, 注意する warns, 伝える passes on.',
    functions: ['speak', 'request'],
    examples: [
      ex('先生は 学生に 遅刻しない ように 注意した。', 'The teacher warned the students not to be late.', 'せんせいは がくせいに ちこくしない ように ちゅういした。'),
      ex('田中さんに 明日 電話する ように 伝えて ください。', 'Please tell Tanaka to call tomorrow.', 'たなかさんに あした でんわする ように つたえて ください。'),
    ],
  },
  'n3m-g-de56a2': {
    meaning: 'from the point of view of ~ (for someone)',
    structure: 'Person + に すれば（に したら／に しても）',
    explanation:
      'にすれば imagines how a situation looks from another person’s position: 子供にすれば、つまらない話だろう "for a child, it must be a boring talk". It expresses empathy or explains someone’s feelings; the person is usually not the speaker.',
    functions: ['perspective-way'],
    examples: [
      ex('子供に すれば、大人の 話は つまらない だろう。', 'For a child, grown-up talk must be boring.', 'こどもに すれば、おとなの はなしは つまらない だろう。'),
      ex('親に したら、心配するのは 当然です。', 'From the parents’ point of view, it is only natural to worry.', 'おやに したら、しんぱいするのは とうぜんです。'),
    ],
  },
  'n3m-g-e7d0de': {
    meaning: 'if ~, then it should (surely) …',
    structure: 'V-ば／V-たら + … + はずだ',
    explanation:
      'A condition leads to an outcome the speaker is confident about: この薬を飲めば治るはずだ "if you take this medicine, you should get better". It is advice or reasoning backed by knowledge rather than a guess, which would be かもしれない.',
    functions: ['condition', 'of-course'],
    examples: [
      ex('この 地図を 見れば、すぐ 分かる はずです。', 'If you look at this map, you should understand right away.', 'この ちずを みれば、すぐ わかる はずです。'),
      ex('今 出れば、九時には 着く はずだ。', 'If we leave now, we should arrive by nine.', 'いま でれば、くじには つく はずだ。'),
    ],
  },
  'n3m-g-b1a3eb': {
    meaning: 'cannot really (say / tell) ~; not at all ~',
    structure: 'なんとも + 言えない／ない',
    explanation:
      'なんとも with a negative means "nothing at all": 今の段階ではなんとも言えない "at this stage I can’t say either way". なんともない means "it’s nothing, I’m fine": けがはなんともない. It avoids committing to a judgement.',
    functions: ['negative', 'vague'],
    examples: [
      ex('まだ 検査の 結果が 出て いないので、なんとも 言えません。', "The test results aren't out yet, so I can't say.", 'まだ けんさの けっかが でて いないので、なんとも いえません。'),
      ex('転んだけど、足は なんとも ない。', 'I fell over, but my leg is fine.', 'ころんだけど、あしは なんとも ない。'),
    ],
  },
  'n3m-g-628f07': {
    meaning: 'not so (serious) as to ~; not worth ~',
    structure: 'V-dict + ほどの + N + では ない（ほどでは ない）',
    explanation:
      'ほどの〜ではない says something does not reach the level where an action would be needed: 病院に行くほどのけがではない "it’s not such an injury that I need to go to hospital". It downplays a situation and is often used to reassure.',
    functions: ['level', 'negative'],
    examples: [
      ex('病院に 行く ほどの けがでは ない。', "It's not bad enough to go to hospital.", 'びょういんに いく ほどの けがでは ない。'),
      ex('そんなに 心配する ほどの ことでは ないよ。', "It's nothing to worry about that much.", 'そんなに しんぱいする ほどの ことでは ないよ。'),
    ],
  },
  'n3m-g-d02c2f': {
    meaning: 'even if (supposing) ~',
    structure: 'もし + V-て／Adj-くて + も',
    explanation:
      'もし with ても makes a hypothetical concession: もし雨が降っても、試合は行う. たとえ is the more common partner of ても and sounds more emphatic; もし〜ても is conversational and slightly less forceful.',
    functions: ['concessions', 'assumptions'],
    examples: [
      ex('もし 反対されても、私は 行く つもりだ。', 'Even if people are against it, I intend to go.', 'もし はんたいされても、わたしは いく つもりだ。'),
      ex('もし 失敗しても、また やり直せば いい。', 'Even if you fail, you can just start again.', 'もし しっぱいしても、また やりなおせば いい。'),
    ],
  },
  'n3m-g-45b0c8': {
    meaning: 'how very ~!; what a ~!',
    structure: 'なんと + Adj／V + のだろう（ことだろう）',
    explanation:
      'なんと〜のだろう is an exclamation of wonder: なんと美しいのだろう "how beautiful it is!". It is somewhat literary; in conversation なんて or すごく are more common. The ending is exclamatory, not a real question.',
    functions: ['exclamatory'],
    examples: [
      ex('なんと 美しい 景色なのだろう。', 'What a beautiful view it is!', 'なんと うつくしい けしきなのだろう。'),
      ex('なんと 優しい 人なのだろう。', 'What a kind person!', 'なんと やさしい ひとなのだろう。'),
    ],
  },
  'n3m-g-22e495': {
    meaning: 'that means ~; in other words ~ (interpretation)',
    structure: 'Plain form + と いう ことだ（と いう ことですね）',
    explanation:
      'At the end of a sentence, ということだ interprets or sums up what has been said: つまり、中止ということですね "so it’s cancelled, then". It is used to confirm understanding. It also reports hearsay in formal style, like そうだ.',
    functions: ['explain', 'conclude'],
    examples: [
      ex('返事が ないと いう ことは、来ないと いう ことだろう。', "No reply means he isn't coming, I suppose.", 'へんじが ないと いう ことは、こないと いう ことだろう。'),
      ex('つまり、明日の 会議は 中止と いう ことですね。', "So that means tomorrow's meeting is cancelled.", 'つまり、あしたの かいぎは ちゅうしと いう ことですね。'),
    ],
  },
  'n3m-g-0821ce': {
    meaning: 'even allowing that ~; even for ~',
    structure: 'Plain form／N + に しても',
    explanation:
      'にしても accepts a premise but objects to something that goes beyond it: 冗談にしても、言いすぎだ "even as a joke, that’s going too far". The second half often criticises. Doubled, AにしてもBにしても means "whether A or B".',
    functions: ['concessions', 'criticize'],
    examples: [
      ex('冗談に しても、それは 言いすぎだ。', 'Even as a joke, that is going too far.', 'じょうだんに しても、それは いいすぎだ。'),
      ex('忙しかったに しても、一言 連絡して ほしかった。', 'Even if you were busy, I wish you had let me know.', 'いそがしかったに しても、ひとこと れんらくして ほしかった。'),
    ],
  },
  'n3m-g-ab9e30': {
    meaning: 'about the only one who ~ is …; ~ is about all',
    structure: 'N + くらい（ぐらい）+ だ ／ …のは + N + くらいだ',
    explanation:
      'くらいだ after a noun can pick out the only or almost the only example: 反対しているのは彼くらいだ "he’s about the only one against it". It implies a small, limited amount, and differs from the degree use (泣きたいくらいだ).',
    functions: ['limit', 'level'],
    examples: [
      ex('毎日 運動して いるのは、クラスで 彼 くらいだ。', 'He is about the only one in the class who exercises every day.', 'まいにち うんどうして いるのは、くらすで かれ くらいだ。'),
      ex('休みの 日に する ことは、掃除 くらいです。', 'About all I do on my days off is clean.', 'やすみの ひに する ことは、そうじ くらいです。'),
    ],
  },
  'n3m-g-c4f8df': {
    meaning: 'according to ~ (study, survey, report)',
    structure: 'N（調査・研究・報告）+ に よると（に よれば）、…',
    explanation:
      'In reports and news, によると introduces the findings of a study or survey: 調査によると、若者の半数が…. The sentence ends with a hearsay or reporting form (そうだ, という, とのことだ). It is not used for the speaker’s own opinion.',
    functions: ['information-resource'],
    examples: [
      ex('ある 調査に よると、日本人の 半分が 毎日 コーヒーを 飲むと いう。', 'According to one survey, half of Japanese people drink coffee every day.', 'ある ちょうさに よると、にほんじんの はんぶんが まいにち こーひーを のむと いう。'),
      ex('友達の 話に よれば、あの 店は 来月 閉まる そうだ。', 'According to my friend, that shop is closing next month.', 'ともだちの はなしに よれば、あの みせは らいげつ しまる そうだ。'),
    ],
  },
  'n3m-g-6f3b42': {
    meaning: '(respected person) does ~ (for Sino-Japanese verbs)',
    structure: 'ご + する-noun + に なる（ご利用に なる・ご覧に なる）',
    explanation:
      'The honorific pattern for する-verbs built on Sino-Japanese nouns takes ご instead of お: ご利用になる, ご出席になる, ご心配になる. ご覧になる (from 見る) is a special case. It is used only for others’ actions; the humble counterpart is ご〜する.',
    functions: ['reverent-humble'],
    examples: [
      ex('この カードは どの 店でも ご利用に なれます。', 'You can use this card in any shop.', 'この かーどは どの みせでも ごりように なれます。'),
      ex('先生も 会議に ご出席に なる そうです。', 'I hear the professor will also be attending the meeting.', 'せんせいも かいぎに ごしゅっせきに なる そうです。'),
    ],
  },
  'n3m-g-6d4e65': {
    meaning: 'however much one wants to ~, one cannot',
    structure: 'V-volitional + と して も + V-potential negative ／ V-て + も + V-られない',
    explanation:
      'Pairs a concession with a negative potential: 忘れようとしても忘れられない "however hard I try to forget, I can’t". It expresses a desire or effort defeated by feelings or circumstances. The same verb often appears twice.',
    functions: ['concessions', 'ability'],
    examples: [
      ex('忘れようと しても、あの 日の ことが 忘れられない。', "However hard I try, I can't forget that day.", 'わすれようと しても、あの ひの ことが わすれられない。'),
      ex('笑っては いけないと 思っても、笑わずに いられなかった。', "I knew I shouldn't laugh, but I couldn't help it.", 'わらっては いけないと おもっても、わらわずに いられなかった。'),
    ],
  },
  'n3m-g-016383': {
    meaning: 'later; afterwards; one after another',
    structure: 'あとから + V ／ あとから あとから + V',
    explanation:
      'あとから means "later, after the others": あとから行きます "I’ll come later". Doubled, あとからあとから describes things coming one after another without end: 涙があとからあとから流れた. Compare あとで, which is simply "later".',
    functions: ['time-sequence'],
    examples: [
      ex('先に 行って いて。私は あとから 行くから。', "Go ahead. I'll follow later.", 'さきに いって いて。わたしは あとから いくから。'),
      ex('質問が あとから あとから 出て きた。', 'Questions kept coming one after another.', 'しつもんが あとから あとから でて きた。'),
    ],
  },
  'n3m-g-278b0d': {
    meaning: 'to be affected by ~ (suffering passive)',
    structure: 'Person は + N（agent）に + V-intransitive-passive（降られる・泣かれる・死なれる）',
    explanation:
      'Japanese can make a passive from an intransitive verb to show the subject was troubled by someone else’s action: 雨に降られた "I got rained on", 赤ちゃんに泣かれた "the baby cried (and I suffered)". English has no direct equivalent, so translations add "on me" or "and I …".',
    functions: ['passive'],
    examples: [
      ex('出かけた とたん、雨に 降られた。', 'The moment I went out, I got caught in the rain.', 'でかけた とたん、あめに ふられた。'),
      ex('夜中に 隣の 人に 騒がれて、眠れなかった。', 'The neighbours made a racket in the night and I could not sleep.', 'よなかに となりの ひとに さわがれて、ねむれなかった。'),
    ],
  },
  'n3m-g-9624f4': {
    meaning: '~ or less; below; (以下の) the following',
    structure: 'Number／N + 以下；以下の + N（以下の とおり）',
    explanation:
      '以下 means "that amount or less" and includes the number: 十八歳以下 "18 and under". Its opposite is 以上. In documents, 以下の or 以下のとおり introduces what follows. 未満 excludes the number: 十八歳未満 "under 18".',
    functions: ['amount', 'comes-next'],
    examples: [
      ex('六歳 以下の 子供は 無料です。', 'Children aged six and under are free.', 'ろくさい いかの こどもは むりょうです。'),
      ex('詳しい 内容は 以下の とおりです。', 'The details are as follows.', 'くわしい ないようは いかの とおりです。'),
    ],
  },
  'n3m-g-a8a63d': {
    meaning: 'not entirely ~; not altogether (bad / disliked)',
    structure: 'まんざら + N／Adj + でも ない（では ない）',
    explanation:
      'まんざらでもない is an understatement that means the person is actually rather pleased: 褒められてまんざらでもない様子だ "looked rather pleased at the praise". With a noun or adjective, まんざら〜ではない means "not completely ~": まんざら嘘ではない.',
    functions: ['negative', 'evaluate'],
    examples: [
      ex('彼女は 褒められて、まんざらでも ない 顔を して いた。', 'When she was praised, she looked quite pleased.', 'かのじょは ほめられて、まんざらでも ない かおを して いた。'),
      ex('彼の 話も まんざら 嘘では ない らしい。', "It seems his story isn't entirely untrue.", 'かれの はなしも まんざら うそでは ない らしい。'),
    ],
  },
  'n3m-g-a9ed28': {
    meaning: 'almost ~; nearly ~ (something happens involuntarily)',
    structure: 'V-ます stem + そうに なる（なった）',
    explanation:
      'そうになる says the speaker nearly did something involuntarily, usually something unwanted: 転びそうになった "I almost fell", 泣きそうになった "I nearly cried". It describes the moment of near-happening, not a guess about the future.',
    functions: ['shortly-before'],
    examples: [
      ex('氷の 上で 滑って、転びそうに なった。', 'I slipped on the ice and almost fell.', 'こおりの うえで すべって、ころびそうに なった。'),
      ex('映画の 最後の 場面で、泣きそうに なった。', 'I nearly cried at the last scene of the film.', 'えいがの さいごの ばめんで、なきそうに なった。'),
    ],
  },
  'n3m-g-8774f7': {
    meaning: 'however many (times / hours) ~, still …',
    structure: '何（なん）+ counter + V-て + も',
    explanation:
      '何 plus a counter with ても says that no number of attempts changes the result: 何回言っても分からない "no matter how many times I tell him, he doesn’t get it". 何度 (times), 何時間 (hours) and 何日 (days) are common.',
    functions: ['concessions', 'frequency'],
    examples: [
      ex('何回 説明しても、彼は 分かって くれない。', "However many times I explain, he doesn't understand.", 'なんかい せつめいしても、かれは わかって くれない。'),
      ex('何時間 待っても、バスは 来なかった。', 'We waited for hours, but the bus never came.', 'なんじかん まっても、ばすは こなかった。'),
    ],
  },
  'n3m-g-0ec4c7': {
    meaning: 'if A is ~, B is (just as) ~ (both bad)',
    structure: 'A が A なら, B も B だ',
    explanation:
      'A critical pattern saying both parties are equally at fault: 親が親なら子も子だ "like parent, like child". The nouns are repeated, and the sentence expresses the speaker’s disapproval of both.',
    functions: ['criticize', 'similarity-degree'],
    examples: [
      ex('親が 親なら、子も 子だ。', 'Like parent, like child.', 'おやが おやなら、こも こだ。'),
      ex('店員も 店員なら、店長も 店長だ。誰も 謝らない。', 'The staff are bad and so is the manager. Nobody apologises.', 'てんいんも てんいんなら、てんちょうも てんちょうだ。だれも あやまらない。'),
    ],
  },
  'n3m-g-a7cecb': {
    meaning: 'certainly ~ may be true, (but …)',
    structure: '確かに／なるほど + clause + かもしれない（が、…）',
    explanation:
      'A concession before an objection: 確かに便利かもしれないが、高すぎる "it may well be convenient, but it is too expensive". The first part acknowledges the other side’s point; the real opinion follows が or けれど.',
    functions: ['concessions', 'speculation'],
    examples: [
      ex('確かに 君の 言う ことも 正しいかも しれない。でも、私は 反対だ。', 'You may well be right. Even so, I am against it.', 'たしかに きみの いう ことも ただしいかも しれない。でも、わたしは はんたいだ。'),
      ex('なるほど 安いかも しれないが、すぐ 壊れそうだ。', 'It may be cheap, but it looks like it will break soon.', 'なるほど やすいかも しれないが、すぐ こわれそうだ。'),
    ],
  },
  'n3m-g-b1c08d': {
    meaning: 'how ~ it must be!; surely ~',
    structure: 'Plain form + こと だろう（ことでしょう）',
    explanation:
      'ことだろう imagines someone’s feelings or a situation with sympathy: ご家族もさぞ喜んだことでしょう "your family must have been so pleased". It often pairs with さぞ or どんなに and is written or formal.',
    functions: ['speculation', 'exclamatory'],
    examples: [
      ex('ご両親も さぞ お喜びの ことでしょう。', 'Your parents must be delighted.', 'ごりょうしんも さぞ およろこびの ことでしょう。'),
      ex('一人で 外国に 行って、どんなに 心細かった ことだろう。', 'Going abroad alone, how lonely you must have felt.', 'ひとりで がいこくに いって、どんなに こころぼそかった ことだろう。'),
    ],
  },
  'n3m-g-8c6275': {
    meaning: 'therefore; for this reason (formal)',
    structure: 'Sentence。それゆえ（に）、+ conclusion',
    explanation:
      'それゆえ is a formal, written "therefore", found in essays, law and logic. It draws a conclusion from what precedes. In ordinary writing, そのため or したがって is more common, and in speech だから.',
    functions: ['cause-reason', 'conclude'],
    examples: [
      ex('人は 一人では 生きられない。それゆえ、助け合いが 大切だ。', 'People cannot live alone; therefore mutual help is important.', 'ひとは ひとりでは いきられない。それゆえ、たすけあいが たいせつだ。'),
      ex('証拠が 不十分で ある。それゆえ、彼を 犯人とは 断定できない。', 'The evidence is insufficient. Therefore he cannot be declared the culprit.', 'しょうこが ふじゅうぶんで ある。それゆえ、かれを はんにんとは だんていできない。'),
    ],
  },
  'n3m-g-a9f97d': {
    meaning: 'unbearably ~; can’t help feeling ~',
    structure: 'V-て／Adj-くて + いけない（しかたがない／たまらない）',
    explanation:
      'Attached to feelings and sensations, ていけない says the feeling is overwhelming: 心配でいけない "I can’t stop worrying", 眠くていけない. It is a little old-fashioned; てたまらない and てしかたがない are the more common equivalents.',
    functions: ['feel', 'level'],
    examples: [
      ex('試験の 結果が 気に なって いけない。', "I can't stop worrying about the exam results.", 'しけんの けっかが きに なって いけない。'),
      ex('昨夜 寝て いないので、眠くて いけない。', "I didn't sleep last night, so I'm terribly sleepy.", 'ゆうべ ねて いないので、ねむくて いけない。'),
    ],
  },
  'n3m-g-aaf089': {
    meaning: 'it is thanks to ~',
    structure: 'N の／plain form + おかげだ（おかげです）',
    explanation:
      'Ending with おかげだ credits the cause of a good outcome: 合格できたのは先生のおかげです "it’s thanks to you that I passed". The result often comes first with のは. Said of a bad result it is sarcastic; for blame use せいだ.',
    functions: ['cause-reason'],
    examples: [
      ex('無事に 帰れたのは、皆さんの おかげです。', 'It is thanks to all of you that I got back safely.', 'ぶじに かえれたのは、みなさんの おかげです。'),
      ex('ここまで 来られたのは、家族が 支えて くれた おかげだ。', 'I have come this far thanks to my family’s support.', 'ここまで こられたのは、かぞくが ささえて くれた おかげだ。'),
    ],
  },
  'n3m-g-8e3f0f': {
    meaning: 'what a ~!',
    structure: 'なんと いう + N + だ（だろう）',
    explanation:
      'An exclamation of strong feeling about something: なんという偶然だ "what a coincidence!", なんということだ "what a thing to happen!". The noun expresses the evaluation. In casual speech, なんて + N is more common.',
    functions: ['exclamatory'],
    examples: [
      ex('ここで 会うなんて、なんと いう 偶然だ。', 'Meeting you here, what a coincidence!', 'ここで あうなんて、なんと いう ぐうぜんだ。'),
      ex('なんと いう ことだ。全部 消えて しまった。', 'Oh no. It has all been deleted.', 'なんと いう ことだ。ぜんぶ きえて しまった。'),
    ],
  },
  'n3m-g-5c8d57': {
    meaning: 'then; if that is done; in that case',
    structure: 'Sentence。そうすると、+ result／discovery',
    explanation:
      'そうすると links an action or premise to its natural result: 右に曲がってください。そうすると、駅が見えます. In reasoning it means "in that case": そうすると、会議は延期ですね. It is neutral; そうしたら is more conversational.',
    functions: ['condition', 'time-sequence'],
    examples: [
      ex('この ボタンを 押して ください。そうすると、画面が 変わります。', 'Press this button. The screen will then change.', 'この ぼたんを おして ください。そうすると、がめんが かわります。'),
      ex('部長は 来週 出張ですか。そうすると、会議は 延期ですね。', 'The manager is away next week? In that case the meeting is postponed.', 'ぶちょうは らいしゅう しゅっちょうですか。そうすると、かいぎは えんきですね。'),
    ],
  },
  'n3m-g-484cc8': {
    meaning: 'from the fact that ~ (the name / conclusion comes)',
    structure: 'Plain form + ところから',
    explanation:
      'ところから gives the observed fact that a name, idea or judgement is based on: 形が似ているところから、この名前がついた "it got this name because of its similar shape". It is written style and often explains origins.',
    functions: ['grounds', 'cause-reason'],
    examples: [
      ex('形が 富士山に 似て いる ところから、この 山は 「小富士」と 呼ばれて いる。', 'Because its shape resembles Mount Fuji, this mountain is called "Little Fuji".', 'かたちが ふじさんに にて いる ところから、この やまは 「こふじ」と よばれて いる。'),
      ex('足跡が 残って いた ところから、犯人は 裏口から 入ったと 考えられる。', 'From the footprints left behind, it is thought the culprit came in through the back door.', 'あしあとが のこって いた ところから、はんにんは うらぐちから はいったと かんがえられる。'),
    ],
  },
  'n3m-g-4b66ae': {
    meaning: 'above all; more than anything',
    structure: 'なにより（も）+ Adj ／ N + が なにより だ',
    explanation:
      'なにより ranks something above everything else: 健康がなによりだ "health is the most important thing". It is common in greetings: お元気そうでなによりです "I’m so glad to see you well". なによりも is slightly more emphatic.',
    functions: ['highest-level', 'compare'],
    examples: [
      ex('健康が なにより 大切だ。', 'Health matters more than anything.', 'けんこうが なにより たいせつだ。'),
      ex('お元気そうで なによりです。', 'I am so glad to see you looking well.', 'おげんきそうで なによりです。'),
    ],
  },
  'n3m-g-47594f': {
    meaning: 'not at all (something like ~); certainly not ~',
    structure: 'N／V + など（なんか）+ negative',
    explanation:
      'など or なんか before a negative dismisses the thing named: うそなどついていない "I haven’t told any lies", 怖くなんかない "I’m not scared at all". It adds a tone of strong denial or contempt that a plain negative lacks.',
    functions: ['emphasize-negative', 'contemptuous'],
    examples: [
      ex('私は うそなど ついて いません。', 'I have not told any lies at all.', 'わたしは うそなど ついて いません。'),
      ex('あんな 人の ことなんか、もう 考えたく ない。', "I don't want to think about someone like that any more.", 'あんな ひとの ことなんか、もう かんがえたく ない。'),
    ],
  },
  'n3m-g-8f0029': {
    meaning: "have no intention of ~; didn't mean to ~",
    structure: 'V-dict + つもりは ない ／ V-た + つもりは ない',
    explanation:
      'つもりはない firmly denies an intention: 会社を辞めるつもりはない. With a past verb, it denies having meant something: 傷つけるつもりはなかった "I didn’t mean to hurt you". Compare つもりではない, which is rarer and less firm.',
    functions: ['intent', 'negative'],
    examples: [
      ex('今の 仕事を 辞める つもりは ない。', 'I have no intention of quitting my current job.', 'いまの しごとを やめる つもりは ない。'),
      ex('あなたを 怒らせる つもりは なかったんです。', "I didn't mean to make you angry.", 'あなたを おこらせる つもりは なかったんです。'),
    ],
  },
  'n3m-g-0566bb': {
    meaning: 'anyway; in any case; leaving ~ aside',
    structure: 'ともかく（、+ clause）／ N は ともかく（として）',
    explanation:
      'On its own, ともかく sets aside other issues to focus on what matters now: ともかく行ってみよう "anyway, let’s go and see". N はともかく means "never mind N": 値段はともかく、味はいい. とにかく is the more conversational synonym.',
    functions: ['invariant', 'exception'],
    examples: [
      ex('ともかく、一度 やって みよう。', "Anyway, let's give it a try.", 'ともかく、いちど やって みよう。'),
      ex('見た目は ともかく、味は 最高だ。', 'Never mind how it looks, it tastes great.', 'みためは ともかく、あじは さいこうだ。'),
    ],
  },
  'n3m-g-3d7dae': {
    meaning: 'yet again; once again (disappointingly)',
    structure: 'またしても + V-た',
    explanation:
      'またしても is an emphatic また, typically for a repeated failure or misfortune: またしても負けた "lost yet again". It is common in news and sports commentary and carries frustration. またもや is a close synonym.',
    functions: ['repeat-habits', 'emphasize'],
    examples: [
      ex('日本代表は またしても 決勝で 負けた。', 'The Japanese team lost in the final yet again.', 'にほんだいひょうは またしても けっしょうで まけた。'),
      ex('またしても 電車が 遅れて、遅刻して しまった。', 'The train was delayed once again, and I was late.', 'またしても でんしゃが おくれて、ちこくして しまった。'),
    ],
  },
  'n3m-g-d3bf35': {
    meaning: 'as long as ~; if only ~ (that is all it takes)',
    structure: 'N + さえ + V-ば／V-たら ／ V-ます stem + さえ + すれば',
    explanation:
      'さえ〜ば says one condition is enough for the result: 時間さえあれば "as long as I have time". With verbs, the stem + さえ + すれば: 謝りさえすれば許す. The implication is that nothing else is needed.',
    functions: ['condition-sufficient'],
    examples: [
      ex('時間さえ あれば、もっと 旅行したい。', 'If only I had the time, I would travel more.', 'じかんさえ あれば、もっと りょこうしたい。'),
      ex('この 薬を 飲みさえ すれば、すぐ 治りますよ。', "As long as you take this medicine, you'll get better soon.", 'この くすりを のみさえ すれば、すぐ なおりますよ。'),
    ],
  },
  'n3m-g-f7fe33': {
    meaning: 'it would have been better to ~ (regret)',
    structure: 'V-た + ほうが よかった ／ V-ない + ほうが よかった',
    explanation:
      'The past of ほうがいい expresses regret about a choice: 早く出たほうがよかった "it would have been better to leave earlier". The negative version regrets something done: 言わないほうがよかった. It is close to ばよかった but frames it as a comparison of options.',
    functions: ['regret'],
    examples: [
      ex('タクシーで 来た ほうが よかったね。', 'We should have come by taxi.', 'たくしーで きた ほうが よかったね。'),
      ex('あんな こと、言わない ほうが よかった。', "I'd have been better off not saying that.", 'あんな こと、いわない ほうが よかった。'),
    ],
  },
  'n3m-g-49185a': {
    meaning: 'somehow; kind of (a vague feeling)',
    structure: 'なんだか + Adj／V（気が する）',
    explanation:
      'なんだか expresses a vague feeling whose cause is unclear: なんだか寂しい "somehow I feel lonely". It is conversational and often precedes feelings and impressions. なんとなく is close but can also describe actions done without a reason.',
    functions: ['vague', 'feel'],
    examples: [
      ex('今日は なんだか 疲れた。', "I'm kind of tired today.", 'きょうは なんだか つかれた。'),
      ex('なんだか 雨が 降りそうな 気が する。', 'I have a feeling it might rain.', 'なんだか あめが ふりそうな きが する。'),
    ],
  },
  'n3m-g-4a9ba6': {
    meaning: 'it somehow seems ~; apparently',
    structure: 'どうも + clause + そうだ／ようだ／らしい',
    explanation:
      'どうも strengthens an inference drawn from vague signs: どうも風邪をひいたようだ "I seem to have caught a cold". It suggests the speaker cannot pin down why they think so. どうも on its own also means "thanks" or "somehow".',
    functions: ['speculation'],
    examples: [
      ex('どうも 風邪を ひいた ようだ。', 'I seem to have caught a cold.', 'どうも かぜを ひいた ようだ。'),
      ex('あの 二人は どうも 付き合って いる らしい。', 'Those two seem to be going out.', 'あの ふたりは どうも つきあって いる らしい。'),
    ],
  },
  'n3m-g-03a9a2': {
    meaning: 'any (kind of) ~ whatsoever (formal)',
    structure: 'いかなる + N + も（でも）／ いかなる + N + に おいても',
    explanation:
      'いかなる is the formal どんな, used in rules, speeches and writing: いかなる理由があっても "whatever the reason". It is followed by も or でも for an all-inclusive statement, often with a negative.',
    functions: ['invariant'],
    examples: [
      ex('いかなる 理由が あっても、暴力は 許されない。', 'Violence is not permitted for any reason whatsoever.', 'いかなる りゆうが あっても、ぼうりょくは ゆるされない。'),
      ex('いかなる 場合も、安全を 最優先に して ください。', 'In all cases, put safety first.', 'いかなる ばあいも、あんぜんを さいゆうせんに して ください。'),
    ],
  },
  'n3m-g-b15cbd': {
    meaning: 'and then; in this way (narrative)',
    structure: 'Sentence。そうして、+ next event／result',
    explanation:
      'そうして links events in a narrative, often with a sense of development: そうして二人は結婚した "and so the two were married". It is more literary than そして and can mean "in that way".',
    functions: ['time-sequence', 'comes-next'],
    examples: [
      ex('彼は 毎日 練習を 続けた。そうして、ついに 優勝した。', 'He kept practising every day, and in the end he won.', 'かれは まいにち れんしゅうを つづけた。そうして、ついに ゆうしょうした。'),
      ex('二人は 何年も 手紙を 送り合った。そうして、やっと 再会した。', 'The two exchanged letters for years, and at last they met again.', 'ふたりは なんねんも てがみを おくりあった。そうして、やっと さいかいした。'),
    ],
  },
  'n3m-g-eb78f3': {
    meaning: 'shortly; soon',
    structure: 'まもなく（、）+ V',
    explanation:
      'まもなく means that something will happen very soon, and is typical of announcements: まもなく電車が参ります. It is more formal than もうすぐ. In narratives, まもなく means "soon after".',
    functions: ['future-time', 'shortly-before'],
    examples: [
      ex('まもなく 一番線に 電車が 参ります。', 'A train will shortly arrive at platform one.', 'まもなく いちばんせんに でんしゃが まいります。'),
      ex('会議は まもなく 始まります。', 'The meeting will begin shortly.', 'かいぎは まもなく はじまります。'),
    ],
  },
  'n3m-g-8ae8e6': {
    meaning: 'finally; in the end (after a long time)',
    structure: 'とうとう + V-た（V-なかった）',
    explanation:
      'とうとう describes an outcome reached after a long process, good or bad: とうとう完成した, とうとう来なかった "in the end he never came". やっと is only for desired results and adds relief; ついに is more dramatic.',
    functions: ['finish', 'result'],
    examples: [
      ex('三年 かかって、とうとう 家が 完成した。', 'After three years, the house was finally finished.', 'さんねん かかって、とうとう いえが かんせいした。'),
      ex('待って いたが、彼は とうとう 来なかった。', 'I waited, but in the end he never came.', 'まって いたが、かれは とうとう こなかった。'),
    ],
  },
  'n3m-g-8fd57e': {
    meaning: 'somehow; one way or another; (N とか) so-and-so',
    structure: 'なんとか + V（する／なる）／ N + とか なんとか',
    explanation:
      'なんとか marks getting something done despite difficulty: なんとか間に合った "somehow made it". なんとかしてください is a plea for any solution. In quotes, 〜とかなんとか means "something like ~" when the speaker does not remember the exact words.',
    functions: ['achievement', 'vague'],
    examples: [
      ex('大変だったが、なんとか 締め切りに 間に合った。', 'It was tough, but I somehow met the deadline.', 'たいへんだったが、なんとか しめきりに まにあった。'),
      ex('彼は 忙しいとか なんとか 言って、来なかった。', 'He said he was busy or something and did not come.', 'かれは いそがしいとか なんとか いって、こなかった。'),
    ],
  },
  'n3m-g-f3b56f': {
    meaning: 'how ~ it is!; what a ~!',
    structure: 'なんて + Adj／V + んだろう',
    explanation:
      'なんて〜んだろう is the conversational exclamation of wonder or dismay: なんてきれいなんだろう "how pretty!". It is the spoken counterpart of なんと〜のだろう. With a negative evaluation it expresses exasperation: なんてひどいんだろう.',
    functions: ['exclamatory'],
    examples: [
      ex('なんて きれいな 夕日なんだろう。', 'What a beautiful sunset!', 'なんて きれいな ゆうひなんだろう。'),
      ex('こんな 日に 雨なんて、なんて ついて ないんだろう。', 'Rain on a day like this, how unlucky can you get?', 'こんな ひに あめなんて、なんて ついて ないんだろう。'),
    ],
  },
  'n3m-g-596dff': {
    meaning: 'the (very) moment ~',
    structure: 'V-た + 瞬間（しゅんかん）（に）, …',
    explanation:
      '瞬間 pinpoints the instant something happened: ドアを開けた瞬間、猫が飛び出した. It is more vivid than とたん and can also describe the speaker’s own feeling at that moment: 見た瞬間に好きになった "I loved it the moment I saw it".',
    functions: ['immediately-after'],
    examples: [
      ex('その 絵を 見た 瞬間、とても 気に 入った。', 'I loved that painting the moment I saw it.', 'その えを みた しゅんかん、とても きに いった。'),
      ex('ゴールした 瞬間、観客から 大きな 拍手が 起こった。', 'The instant he crossed the finish line, the crowd burst into applause.', 'ごーるした しゅんかん、かんきゃくから おおきな はくしゅが おこった。'),
    ],
  },
  'n3m-g-a96bea': {
    meaning: 'at last; finally (after much time)',
    structure: 'ようやく + V-た ／ ようやく + V-dict（ように なる）',
    explanation:
      'ようやく is a slightly formal やっと: something long awaited has happened. It expresses relief and suits writing and news. Unlike とうとう, it is used only for results the speaker wanted.',
    functions: ['finish'],
    examples: [
      ex('長い 冬が 終わって、ようやく 春が 来た。', 'The long winter is over and spring has finally come.', 'ながい ふゆが おわって、ようやく はるが きた。'),
      ex('三回目で ようやく 試験に 合格した。', 'I finally passed the exam on my third try.', 'さんかいめで ようやく しけんに ごうかくした。'),
    ],
  },
  'n3m-g-0abcc4': {
    meaning: 'do nothing but ~; keep ~ing (all the time)',
    structure: 'V-て + ばかり いる',
    explanation:
      'てばかりいる criticises someone for doing only one thing, over and over: ゲームをしてばかりいる "does nothing but play games". It implies disapproval. Compare たばかり, which means "have just done".',
    functions: ['limit', 'criticize'],
    examples: [
      ex('弟は 勉強しないで、ゲームを して ばかり いる。', 'My brother does nothing but play games instead of studying.', 'おとうとは べんきょうしないで、げーむを して ばかり いる。'),
      ex('泣いて ばかり いないで、何か 言いなさい。', "Stop crying all the time and say something.", 'ないて ばかり いないで、なにか いいなさい。'),
    ],
  },
  'n3m-g-674a41': {
    meaning: 'if that is so, then ~; if it is (the case that) ~',
    structure: 'N／Na／plain form + だと したら；（sentence-initial）だと したら、…',
    explanation:
      'だとしたら follows a noun or na-adjective directly, or opens a sentence to draw a conclusion from what was just said: 「彼は来ないらしい」「だとしたら、計画を変えないと」. It is conversational; だとすれば is more logical in tone.',
    functions: ['condition-assumption'],
    examples: [
      ex('それが 本当だと したら、大変な ことに なる。', 'If that is true, it will become serious.', 'それが ほんとうだと したら、たいへんな ことに なる。'),
      ex('「電車が 止まって いるらしいよ。」「だと したら、バスで 行こう。」', '"Apparently the trains have stopped." "In that case, let’s take the bus."', '「でんしゃが とまって いるらしいよ。」「だと したら、ばすで いこう。」'),
    ],
  },
  'n3m-g-ca60f9': {
    meaning: "if ~, that's fine; as long as ~ (it's OK)",
    structure: 'Plain form／N + なら いい（なら いいけど／なら いいんですが）',
    explanation:
      'ならいい accepts a situation on a condition: 君がいいならいい "if you’re fine with it, so am I". With けど or んですが it adds worry: 間に合うならいいけど "I hope we make it, though". It often sounds reserved or doubtful.',
    functions: ['condition', 'allow'],
    examples: [
      ex('あなたが それで いいなら、私も いいです。', "If that's fine with you, it's fine with me.", 'あなたが それで いいなら、わたしも いいです。'),
      ex('明日 晴れるなら いいけど、どうかな。', "I hope it'll be sunny tomorrow, but who knows.", 'あした はれるなら いいけど、どうかな。'),
    ],
  },
  'n3m-g-f5f5dd': {
    meaning: 'when it becomes ~; when it comes to ~',
    structure: 'N／time + に なると, …',
    explanation:
      'になると describes what happens once a time or stage is reached: 夏になると、人が増える "when summer comes, the number of people goes up". It can also mean "when it comes to": 料理になると、彼は熱心だ.',
    functions: ['condition', 'time-situation'],
    examples: [
      ex('夜に なると、この 辺りは 静かに なる。', 'At night this area becomes quiet.', 'よるに なると、この あたりは しずかに なる。'),
      ex('歌の ことに なると、彼女は 急に 元気に なる。', 'When it comes to singing, she suddenly livens up.', 'うたの ことに なると、かのじょは きゅうに げんきに なる。'),
    ],
  },
  'n3m-g-daae58': {
    meaning: 'then; if you do that; in that case',
    structure: 'Sentence。そうしたら、+ result／suggestion',
    explanation:
      'そうしたら links an action to what follows it or to a suggestion based on it: 薬を飲んで。そうしたら楽になるよ. When the next clause is past, it reports what happened next. そしたら is the casual contraction.',
    functions: ['condition', 'time-sequence'],
    examples: [
      ex('この 薬を 飲んで ください。そうしたら、楽に なりますよ。', "Take this medicine. Then you'll feel better.", 'この くすりを のんで ください。そうしたら、らくに なりますよ。'),
      ex('先生に 相談した。そうしたら、いい 方法を 教えて くれた。', 'I talked to my teacher, and she told me a good way to do it.', 'せんせいに そうだんした。そうしたら、いい ほうほうを おしえて くれた。'),
    ],
  },
  'n3m-g-8721b5': {
    meaning: 'I would like you to ~ (polite request)',
    structure: 'V-て + いただきたい（いただきたいのですが）',
    explanation:
      'The desiderative of ていただく states a request politely but clearly: ご協力いただきたい "we would like your cooperation". Adding のですが softens it into a lead-in. In speech to superiors, ていただけませんか is gentler because it asks rather than states.',
    functions: ['request', 'reverent-humble'],
    examples: [
      ex('この 件に ついて、ご意見を 聞かせて いただきたいのですが。', "I would like to hear your opinion on this matter.", 'この けんに ついて、ごいけんを きかせて いただきたいのですが。'),
      ex('会場では 携帯電話の 電源を お切り いただきたいと 思います。', 'We ask that you turn off your mobile phones in the hall.', 'かいじょうでは けいたいでんわの でんげんを おきり いただきたいと おもいます。'),
    ],
  },
  'n3m-g-e2d460': {
    meaning: 'not very ~; not particularly ~',
    structure: 'たいして + negative',
    explanation:
      'たいして with a negative says the degree is not great: たいして難しくない "not that difficult". It often plays something down or implies disappointment: たいしておいしくなかった. It is close to あまり〜ない but more dismissive.',
    functions: ['level', 'negative'],
    examples: [
      ex('試験は たいして 難しく なかった。', "The exam wasn't all that difficult.", 'しけんは たいして むずかしく なかった。'),
      ex('高かった わりには、たいして おいしく なかった。', "For the price, it wasn't particularly tasty.", 'たかかった わりには、たいして おいしく なかった。'),
    ],
  },
  'n3m-g-fe58f3': {
    meaning: 'about (that size / amount) ~; the kind of ~ that …',
    structure: 'Number／N／V + くらいの（ぐらいの）+ N',
    explanation:
      'くらいの before a noun gives an approximate size or degree: 三十歳くらいの男性 "a man of about thirty". It can also describe a degree by example: 子供でも持てるくらいの重さ "light enough for a child to carry".',
    functions: ['amount-roughly', 'level'],
    examples: [
      ex('三十歳 くらいの 男性が 訪ねて 来ました。', 'A man of about thirty came to see you.', 'さんじゅっさい くらいの だんせいが たずねて きました。'),
      ex('子供でも 持てる くらいの 重さです。', 'It is light enough for even a child to carry.', 'こどもでも もてる くらいの おもさです。'),
    ],
  },
  'n3m-g-e169f9': {
    meaning: '(the nature of) ~ is …; ~ is the kind of thing that …',
    structure: 'N + と いう ものは + generalisation + ものだ',
    explanation:
      'というものは introduces a general truth about the nature of something: 人生というものは思い通りにいかないものだ "life is something that never goes as planned". It is reflective and often ends with ものだ.',
    functions: ['definition', 'judge'],
    examples: [
      ex('人生と いう ものは、思う ように いかない ものだ。', 'Life never goes quite the way you expect.', 'じんせいと いう ものは、おもう ように いかない ものだ。'),
      ex('親と いう ものは、いつまでも 子供を 心配する ものだ。', 'Parents are the kind of people who never stop worrying about their children.', 'おやと いう ものは、いつまでも こどもを しんぱいする ものだ。'),
    ],
  },
  'n3m-g-0fdcfd': {
    meaning: 'especially; above all',
    structure: 'とりわけ + N／Adj',
    explanation:
      'とりわけ singles out one item as outstanding among others: どの料理もおいしいが、とりわけこのスープがいい. It is more written than 特に and sounds a little more emphatic.',
    functions: ['emphasize', 'highest-level'],
    examples: [
      ex('今年の 夏は とりわけ 暑かった。', 'This summer was especially hot.', 'ことしの なつは とりわけ あつかった。'),
      ex('どの 作品も いいが、とりわけ この 絵が 好きだ。', 'All the works are good, but I especially like this painting.', 'どの さくひんも いいが、とりわけ この えが すきだ。'),
    ],
  },
  'n3m-g-1bf37a': {
    meaning: 'that much; accordingly; only that',
    structure: 'それだけ + V／Adj ／ それだけ（だ）',
    explanation:
      'それだけ has two uses. It can mean "to that extent, correspondingly": 練習すれば、それだけ上手になる "the more you practise, the better you get". It can also mean "only that": 言いたいことはそれだけだ "that is all I wanted to say".',
    functions: ['limit', 'proportional'],
    examples: [
      ex('努力すれば、それだけ 結果も よく なる。', 'The harder you work, the better the results will be.', 'どりょくすれば、それだけ けっかも よく なる。'),
      ex('言いたい ことは それだけです。', 'That is all I wanted to say.', 'いいたい ことは それだけです。'),
    ],
  },
  'n3m-g-d84608': {
    meaning: 'anything (at all); (hearsay) apparently',
    structure: 'なんでも + V（affirmative）／ なんでも + clause + そうだ',
    explanation:
      'With an affirmative verb, なんでも means "anything, everything": なんでも食べる "eats anything". At the start of a hearsay sentence it means "apparently, from what I hear": なんでも彼は留学するそうだ.',
    functions: ['invariant', 'heard'],
    examples: [
      ex('うちの 子は 好き嫌いが なく、なんでも 食べる。', 'Our child is not picky and eats anything.', 'うちの こは すききらいが なく、なんでも たべる。'),
      ex('なんでも、あの 二人は 来月 結婚する そうだ。', 'Apparently those two are getting married next month.', 'なんでも、あの ふたりは らいげつ けっこんする そうだ。'),
    ],
  },
  'n3m-g-f36a41': {
    meaning: 'maybe ~ (playful guess)',
    structure: 'V-たり + して（。／？）',
    explanation:
      'Ending a sentence with たりして adds a playful or teasing guess: 彼、実は来なかったりして "maybe he won’t come after all, ha". It is very casual and suggests the speaker is half joking.',
    functions: ['speculation'],
    examples: [
      ex('あの 二人、実は 付き合って いたりして。', 'Maybe those two are secretly going out, ha.', 'あの ふたり、じつは つきあって いたりして。'),
      ex('明日 雪が 降ったり して。', 'What if it snowed tomorrow, eh?', 'あした ゆきが ふったり して。'),
    ],
  },
  'n3m-g-27c8bd': {
    meaning: 'just because ~, (it does not follow that) …',
    structure: 'Plain form + から と いって, … + negative',
    explanation:
      'からといって rejects an easy inference: 高いからといって、いい物とは限らない "just because it’s expensive, it isn’t necessarily good". The second half is usually a negative such as とは限らない, わけではない or てはいけない.',
    functions: ['concessions', 'contrast'],
    examples: [
      ex('日本人だから と いって、日本語が 教えられる とは 限らない。', 'Just because you are Japanese, it does not mean you can teach Japanese.', 'にほんじんだから と いって、にほんごが おしえられる とは かぎらない。'),
      ex('忙しいから と いって、食事を 抜いては いけない。', 'Being busy is no reason to skip meals.', 'いそがしいから と いって、しょくじを ぬいては いけない。'),
    ],
  },
  'n3m-g-e1a55b': {
    meaning: 'needless to say; it goes without saying',
    structure: '言う までも なく、+ clause ／ N は 言う までも ない',
    explanation:
      'いうまでもなく introduces something so obvious it hardly needs stating: 言うまでもなく、健康は大切だ. N は言うまでもない means "let alone N" when N is the obvious case. It is formal; もちろん is the everyday equivalent.',
    functions: ['of-course'],
    examples: [
      ex('言う までも なく、安全が 一番 大切です。', 'Needless to say, safety is the most important thing.', 'いう までも なく、あんぜんが いちばん たいせつです。'),
      ex('彼は 英語は 言う までも なく、ドイツ語も 話せる。', 'He speaks German, to say nothing of English.', 'かれは えいごは いう までも なく、どいつごも はなせる。'),
    ],
  },
  'n3m-g-f6a21b': {
    meaning: 'if ~, then (probably) …',
    structure: 'V-ば + … + だろう（でしょう）',
    explanation:
      'A ば condition followed by a guess: この道を行けば駅に着くだろう. It predicts a likely outcome and is more confident than かもしれない but less certain than はずだ.',
    functions: ['condition', 'speculation'],
    examples: [
      ex('今から 急げば、間に合う だろう。', 'If we hurry now, we will probably make it.', 'いまから いそげば、まにあう だろう。'),
      ex('彼に 聞けば、きっと 分かる でしょう。', 'If you ask him, he will surely know.', 'かれに きけば、きっと わかる でしょう。'),
    ],
  },
  'n3m-g-bfb04e': {
    meaning: 'right away; at once (even now if possible)',
    structure: 'すぐにでも + V（たい／ます）',
    explanation:
      'でも added to すぐに stresses readiness: すぐにでも行きたい "I’d go right this minute if I could". It expresses eagerness or urgency. Without でも, すぐに is a plain "immediately".',
    functions: ['immediately-after', 'desire'],
    examples: [
      ex('できれば、すぐにでも 国に 帰りたい。', 'If I could, I would go home to my country right away.', 'できれば、すぐにでも くにに かえりたい。'),
      ex('必要なら、すぐにでも 始められます。', 'If necessary, we can start at once.', 'ひつようなら、すぐにでも はじめられます。'),
    ],
  },
  'n3m-g-3f6413': {
    meaning: 'to appear; to show up',
    structure: '（Person が）姿を 見せる（姿を 消す）',
    explanation:
      '姿を見せる means to appear in public or show up somewhere: 彼は会議に姿を見せなかった. The opposite is 姿を消す "disappear". It is slightly formal and common in news and narration.',
    functions: ['describe'],
    examples: [
      ex('パーティーに 彼は 最後まで 姿を 見せなかった。', 'He never showed up at the party.', 'ぱーてぃーに かれは さいごまで すがたを みせなかった。'),
      ex('冬の 間 姿を 消して いた 鳥が、また 姿を 見せた。', 'The birds that had vanished for the winter appeared again.', 'ふゆの あいだ すがたを けして いた とりが、また すがたを みせた。'),
    ],
  },
  'n3m-g-f1015c': {
    meaning: 'as expected; after all; still',
    structure: 'やっぱり（やはり）+ clause',
    explanation:
      'やっぱり confirms that something turned out as expected (やっぱり雨だ), or that after thinking the speaker returns to an earlier view: やっぱり行くのをやめる "on second thoughts, I won’t go". やはり is the more formal form.',
    functions: ['as-expected', 'of-course'],
    examples: [
      ex('天気予報の とおり、やっぱり 雨が 降って きた。', 'Just as the forecast said, it started to rain.', 'てんきよほうの とおり、やっぱり あめが ふって きた。'),
      ex('いろいろ 考えたけど、やっぱり 行かない ことに する。', "I've thought about it a lot, but I've decided not to go after all.", 'いろいろ かんがえたけど、やっぱり いかない ことに する。'),
    ],
  },
  'n3m-g-33b6ab': {
    meaning: 'like ~; such as ~',
    structure: 'N の + ような + N ／ N の + ように + V',
    explanation:
      'のような compares or gives an example: 夢のような話 "a dream-like story", 東京のような大都市 "a big city like Tokyo". Before a verb or adjective it becomes のように. Casual speech uses みたいな.',
    functions: ['similarity-degree', 'for-example'],
    examples: [
      ex('東京の ような 大きな 町に 住んで みたい。', 'I would like to try living in a big city like Tokyo.', 'とうきょうの ような おおきな まちに すんで みたい。'),
      ex('まるで 夢の ような 一日だった。', 'It was a day just like a dream.', 'まるで ゆめの ような いちにちだった。'),
    ],
  },
  'n3m-g-3044a3': {
    meaning: 'precisely because ~; that is exactly why ~',
    structure: 'Plain form + から こそ ／ Sentence。だから こそ、…',
    explanation:
      'からこそ singles out a reason as the real one, often against expectation: 好きだからこそ厳しく言う "it’s precisely because I care that I’m strict". だからこそ at the start of a sentence refers back to the previous point.',
    functions: ['cause-reason', 'emphasize'],
    examples: [
      ex('君の ことを 思う からこそ、厳しく 言うんだ。', "It's precisely because I care about you that I'm being strict.", 'きみの ことを おもう からこそ、きびしく いうんだ。'),
      ex('失敗した。だからこそ、次は 必ず 成功させたい。', 'I failed. That is exactly why I want to succeed next time.', 'しっぱいした。だからこそ、つぎは かならず せいこうさせたい。'),
    ],
  },
  'n3m-g-00a217': {
    meaning: 'I have a feeling that ~',
    structure: 'Plain form (Na な／N の) + ような 気が する',
    explanation:
      'ような気がする states a vague impression without claiming certainty: 前に会ったような気がする "I feel I’ve met you before". It is softer than と思う and common for hunches and memories.',
    functions: ['feel', 'speculation'],
    examples: [
      ex('どこかで 会った ような 気が します。', 'I have a feeling we have met somewhere.', 'どこかで あった ような きが します。'),
      ex('今日は 何か いい ことが ありそうな 気が する。', 'I have a feeling something good will happen today.', 'きょうは なにか いい ことが ありそうな きが する。'),
    ],
  },
  'n3m-g-8f6afe': {
    meaning: 'seems ~; looks like ~ (casual ようだ)',
    structure: 'Plain form (N／Na without だ) + みたいだ（みたいな N／みたいに V）',
    explanation:
      'みたいだ is the spoken equivalent of ようだ: an inference from what one sees (誰もいないみたいだ) or a comparison (子供みたいだ). It attaches directly to nouns and な-adjectives without の or な, which is a common difference from ようだ.',
    functions: ['speculation', 'similarity-degree'],
    examples: [
      ex('電気が 消えて いるから、留守 みたいだ。', 'The lights are off, so it looks like no one is home.', 'でんきが きえて いるから、るす みたいだ。'),
      ex('彼は 子供 みたいに はしゃいで いる。', 'He is getting excited like a child.', 'かれは こども みたいに はしゃいで いる。'),
    ],
  },
  'n3m-g-d95b40': {
    meaning: 'even if ~ (were true); even assuming ~',
    structure: 'Plain form + と しても',
    explanation:
      'としても concedes a hypothetical or even a fact while keeping the conclusion: 今から行ったとしても、間に合わない "even if we went now, we wouldn’t make it". It is more hypothetical than ても and common with たとえ.',
    functions: ['concessions', 'assumptions'],
    examples: [
      ex('今から 急いだと しても、間に合わない だろう。', 'Even if we hurried now, we probably would not make it.', 'いまから いそいだと しても、まにあわない だろう。'),
      ex('たとえ 冗談だと しても、言って いい ことと 悪い ことが ある。', 'Even as a joke, some things should not be said.', 'たとえ じょうだんだと しても、いって いい ことと わるい ことが ある。'),
    ],
  },
  'n3m-g-daf860': {
    meaning: 'to cut off; to break off (relations); to stop',
    structure: 'N を + 切る（電話・電源・縁を 切る）',
    explanation:
      'Beyond "cut with a blade", 切る means to end or disconnect: 電話を切る "hang up", 電源を切る "turn off the power", 縁を切る "cut ties". The intransitive 切れる means "run out" or "be cut": 電池が切れた.',
    functions: ['finish'],
    examples: [
      ex('話が 終わったので、電話を 切った。', 'The conversation was over, so I hung up.', 'はなしが おわったので、でんわを きった。'),
      ex('寝る 前に パソコンの 電源を 切って ください。', 'Please switch off the computer before going to bed.', 'ねる まえに ぱそこんの でんげんを きって ください。'),
    ],
  },
  'n3m-g-5f1430': {
    meaning: 'according to what (someone) says / has found',
    structure: 'N の + 言う（聞く）ところに よると（よれば）',
    explanation:
      'ところによると names the content of what someone said or found as the source of information: 聞くところによると "from what I hear". It is formal and always ends with a hearsay expression such as そうだ or らしい.',
    functions: ['information-resource', 'heard'],
    examples: [
      ex('聞く ところに よると、あの 会社は 来年 移転する らしい。', 'From what I hear, that company is moving next year.', 'きく ところに よると、あの かいしゃは らいねん いてんする らしい。'),
      ex('警察の 発表する ところに よれば、けが人は いない そうだ。', 'According to the police announcement, no one was injured.', 'けいさつの はっぴょうする ところに よれば、けがにんは いない そうだ。'),
    ],
  },
  'n3m-g-7e548c': {
    meaning: 'if A is ~, then B (for its part) is …',
    structure: 'A が + ~ なら, B は + ~ だ',
    explanation:
      'This frame contrasts two parties or features, often in balanced praise or criticism: 兄が真面目なら、弟は遊んでばかりだ "the older brother is serious, the younger one does nothing but play". なら here marks a comparison rather than a condition.',
    functions: ['contrast', 'compare'],
    examples: [
      ex('姉が 静かなら、妹は とても にぎやかだ。', 'The older sister is quiet, whereas the younger is very lively.', 'あねが しずかなら、いもうとは とても にぎやかだ。'),
      ex('昼が 暑いなら、夜は 寒い。砂漠の 気候は 厳しい。', 'The days are hot and the nights are cold. The desert climate is harsh.', 'ひるが あついなら、よるは さむい。さばくの きこうは きびしい。'),
    ],
  },
  'n3m-g-b38e93': {
    meaning: 'if you say that ~, (then) …',
    structure: 'Plain form + と いう のなら（と いうなら）',
    explanation:
      'というのなら takes up what the other person claimed as a condition: 行きたくないというのなら、無理には誘わない "if you say you don’t want to go, I won’t push". It often carries a hint of challenge or resignation.',
    functions: ['condition'],
    examples: [
      ex('どうしても 辞めると いう のなら、止めません。', 'If you insist on quitting, I will not stop you.', 'どうしても やめると いう のなら、とめません。'),
      ex('自分で できると いう なら、やって みなさい。', 'If you say you can do it yourself, go ahead and try.', 'じぶんで できると いう なら、やって みなさい。'),
    ],
  },
  'n3m-g-5a35bd': {
    meaning: 'that (very thing) would be ~; that is exactly ~',
    structure: 'それこそ + N／clause',
    explanation:
      'それこそ stresses that something is precisely the case, often an extreme one: そんなことをしたら、それこそ大変だ "if you did that, then you really would be in trouble". It can also agree emphatically: それこそ私が言いたかったことだ.',
    functions: ['emphasize'],
    examples: [
      ex('今 やめたら、それこそ 今までの 努力が 無駄に なる。', 'If you quit now, all your effort so far really would be wasted.', 'いま やめたら、それこそ いままでの どりょくが むだに なる。'),
      ex('それこそ、私が 言いたかった ことです。', 'That is exactly what I wanted to say.', 'それこそ、わたしが いいたかった ことです。'),
    ],
  },
  'n3m-g-2fd93f': {
    meaning: 'I say ~, but (it is not that) …',
    structure: 'Plain form／N + と いっても, … + negative（ない／わけではない）',
    explanation:
      'といっても qualifies the previous word by denying what it might suggest: 旅行といっても、一泊だけだ, 料理といっても大したものは作れない. The second half usually makes the first sound less impressive.',
    functions: ['concessions', 'corrections'],
    examples: [
      ex('旅行と いっても、一泊しか しない。', "I say trip, but it's only one night.", 'りょこうと いっても、いっぱくしか しない。'),
      ex('料理が 好きと いっても、たいした ものは 作れない。', "I like cooking, but I can't make anything special.", 'りょうりが すきと いっても、たいした ものは つくれない。'),
    ],
  },
  'n3m-g-7eb51c': {
    meaning: 'if ~, how (nice / hard) it would be',
    structure: 'V-たら + … + だろう（どんなに Adj だろう）',
    explanation:
      'A たら condition with だろう imagines a result, often wistfully: 宝くじが当たったら、どんなにいいだろう "how nice it would be if I won the lottery". It is used for hopes and imagined situations.',
    functions: ['condition', 'wish'],
    examples: [
      ex('毎日 休みだったら、どんなに いい だろう。', 'How nice it would be if every day were a holiday.', 'まいにち やすみだったら、どんなに いい だろう。'),
      ex('彼が ここに いたら、きっと 喜んだ だろう。', 'If he were here, he would surely be pleased.', 'かれが ここに いたら、きっと よろこんだ だろう。'),
    ],
  },
  'n3m-g-ebc616': {
    meaning: 'how (very) ~ (it is) (formal)',
    structure: 'いかに + Adj／V + か（を 知る／分かる）',
    explanation:
      'いかに〜か embeds a "how much" question, stressing a degree: 健康がいかに大切か分かった "I realised how important health is". It is written and formal; どれほど or どんなに are the everyday versions.',
    functions: ['emphasize', 'level'],
    examples: [
      ex('病気に なって、健康が いかに 大切か 分かった。', 'Falling ill showed me how important health is.', 'びょうきに なって、けんこうが いかに たいせつか わかった。'),
      ex('この 本は、戦争が いかに 悲惨かを 伝えて いる。', 'This book conveys how tragic war is.', 'この ほんは、せんそうが いかに ひさんかを つたえて いる。'),
    ],
  },
  'n3m-g-5a31fc': {
    meaning: 'all (of them); each; any (of them)',
    structure: 'いずれも + predicate ／ N は いずれも …',
    explanation:
      'いずれも refers to every item in a given set: 候補者はいずれも優秀だ "the candidates are all excellent". It is formal and common in reports; the spoken equivalent is どれも or みんな. With a negative it means "none of them".',
    functions: ['invariant'],
    examples: [
      ex('応募作品は いずれも すばらしかった。', 'All the entries were wonderful.', 'おうぼさくひんは いずれも すばらしかった。'),
      ex('三つの 案は いずれも 費用が かかりすぎる。', 'All three proposals cost too much.', 'みっつの あんは いずれも ひようが かかりすぎる。'),
    ],
  },
  'n3m-g-d8b3b0': {
    meaning: 'within ~; in the course of ~',
    structure: 'Period + の うちに ／ N の うちに',
    explanation:
      'のうちに places an event inside a period: 一日のうちに "within a day", 今週のうちに "sometime this week". With 数日のうちに it stresses that little time passed. It differs from 以内に, which sets a strict limit.',
    functions: ['period', 'short-time'],
    examples: [
      ex('一日の うちに 三回も 電話が かかって きた。', 'I got three phone calls in the space of one day.', 'いちにちの うちに さんかいも でんわが かかって きた。'),
      ex('今月の うちに 引っ越しを 済ませたい。', 'I want to finish moving within this month.', 'こんげつの うちに ひっこしを すませたい。'),
    ],
  },
  'n3m-g-9ae49b': {
    meaning: 'not likely to ~; showing no sign of ~',
    structure: 'V-ます stem + そうに（も）ない／そうも ない',
    explanation:
      'The negative of the appearance そうだ: 雨はやみそうにない "the rain shows no sign of stopping". It is a judgement from current signs. Do not confuse it with ないそうだ, which is hearsay.',
    functions: ['speculation', 'negative'],
    examples: [
      ex('この 雨は なかなか やみそうに ない。', "This rain doesn't look like it's going to stop.", 'この あめは なかなか やみそうに ない。'),
      ex('仕事が 多すぎて、今日中には 終わりそうも ない。', "There is too much work; it doesn't look like I'll finish today.", 'しごとが おおすぎて、きょうじゅうには おわりそうも ない。'),
    ],
  },
  'n3m-g-270863': {
    meaning: 'a little; somewhat (formal)',
    structure: 'いささか + Adj／V',
    explanation:
      'いささか is a formal, somewhat literary "a little, rather": いささか疲れた. It is often an understatement used to express mild criticism or surprise politely: いささか驚いた "I was rather surprised".',
    functions: ['level'],
    examples: [
      ex('彼の 態度には いささか 驚いた。', 'I was somewhat surprised by his attitude.', 'かれの たいどには いささか おどろいた。'),
      ex('この 計画は いささか 無理が ある ように 思う。', 'I think this plan is a little unrealistic.', 'この けいかくは いささか むりが ある ように おもう。'),
    ],
  },
  'n3m-g-b6c608': {
    meaning: 'you must not ~; ~ is no good',
    structure: 'V-て + は だめだ（だめです）',
    explanation:
      'てはだめだ forbids an action, like てはいけない but more personal and conversational: 見てはだめ "don’t look". In speech it shortens to ちゃだめ or じゃだめ. It is typical of parents and friends rather than official rules.',
    functions: ['ban'],
    examples: [
      ex('ここで 遊んでは だめだよ。', "You mustn't play here.", 'ここで あそんでは だめだよ。'),
      ex('あきらめちゃ だめ。もう 少しだから。', "Don't give up. You're nearly there.", 'あきらめちゃ だめ。もう すこしだから。'),
    ],
  },
  'n3m-g-198f9d': {
    meaning: 'if (something bad like ~) should happen',
    structure: 'V-ます stem + でも したら ／ N + でも したら',
    explanation:
      'でもしたら imagines an undesirable possibility: 事故でも起こしたら大変だ "it would be terrible if you had an accident or something". The main clause is a warning or worry. It is close to たりしたら.',
    functions: ['condition', 'warning'],
    examples: [
      ex('そんなに 急いで、けがでも したら どう するの。', 'Rushing like that, what will you do if you get hurt?', 'そんなに いそいで、けがでも したら どう するの。'),
      ex('大事な 書類を なくしでも したら、大変だ。', 'It would be terrible if you were to lose important documents.', 'だいじな しょるいを なくしでも したら、たいへんだ。'),
    ],
  },
  'n3m-g-13e792': {
    meaning: 'never mind; just (do it) (impatient)',
    structure: 'いいから（、+ command／request）',
    explanation:
      'いいから brushes aside objections and insists: いいから早く来て "never mind that, just come". It is casual and can sound pushy or caring depending on tone: いいから座ってて "don’t worry, just sit down".',
    functions: ['order', 'cause-reason'],
    examples: [
      ex('いいから、早く 乗って！', 'Never mind, just get in!', 'いいから、はやく のって！'),
      ex('片付けは いいから、座って 休んで いて。', "Don't worry about tidying up, just sit and rest.", 'かたづけは いいから、すわって やすんで いて。'),
    ],
  },
  'n3m-g-970338': {
    meaning: 'not at all; completely not',
    structure: 'まるで + negative',
    explanation:
      'With a negative, まるで means "not at all": まるで分からない "I have no idea at all". It is emphatic and conversational, like 全然. With ようだ it instead means "just like", so the ending decides the meaning.',
    functions: ['emphasize-negative'],
    examples: [
      ex('彼の 説明は まるで 分からなかった。', "I didn't understand his explanation at all.", 'かれの せつめいは まるで わからなかった。'),
      ex('あの 二人は 兄弟なのに、まるで 似て いない。', "Those two are brothers, but they don't look alike at all.", 'あの ふたりは きょうだいなのに、まるで にて いない。'),
    ],
  },
  'n3m-g-9ba215': {
    meaning: 'about; roughly; mostly; (in the first place)',
    structure: 'だいたい + number／V ／ だいたい（そもそも）',
    explanation:
      'だいたい means "about, mostly" with numbers and completion: だいたい三十人, だいたい分かった. At the start of a complaint it means "in the first place": だいたい、君が遅れたのが悪い. The second use sounds critical.',
    functions: ['amount-roughly', 'criticize'],
    examples: [
      ex('駅まで だいたい 十分 ぐらいです。', 'It is about ten minutes to the station.', 'えきまで だいたい じゅっぷん ぐらいです。'),
      ex('だいたい、約束を 忘れた 君が 悪いんだよ。', "In the first place, you're the one who forgot the promise.", 'だいたい、やくそくを わすれた きみが わるいんだよ。'),
    ],
  },
  'n3m-g-1bd561': {
    meaning: 'there is still ~ (left)',
    structure: 'まだ + quantity／N + が ある（いる）',
    explanation:
      'まだ with ある says something remains: まだ時間がある "there’s still time", まだ三つある. It contrasts with もう〜ない ("none left"). With a negative, まだ means "not yet".',
    functions: ['continuity', 'amount'],
    examples: [
      ex('電車が 出るまで、まだ 十分 ある。', 'There are still ten minutes before the train leaves.', 'でんしゃが でるまで、まだ じゅっぷん ある。'),
      ex('冷蔵庫に 牛乳が まだ 少し ある。', 'There is still a little milk in the fridge.', 'れいぞうこに ぎゅうにゅうが まだ すこし ある。'),
    ],
  },
  'n3m-g-a486bc': {
    meaning: '(a respected person) kindly does ~; please do ~ (honorific request)',
    structure: 'お + V-ます stem + くださる ／ お + V-ます stem + ください',
    explanation:
      'お〜くださる is the honorific way to say someone of higher status kindly does something: 先生がお書きくださった. Its imperative, お〜ください, is a very common polite request in shops and notices: お待ちください, お入りください. It is more formal than てください.',
    functions: ['reverent-humble', 'request'],
    examples: [
      ex('少々 お待ち ください。', 'Please wait a moment.', 'しょうしょう おまち ください。'),
      ex('先生が 推薦状を お書き くださいました。', 'The professor kindly wrote me a letter of recommendation.', 'せんせいが すいせんじょうを おかき くださいました。'),
    ],
  },
  'n3m-g-0d2f4a': {
    meaning: 'still (even now, surprisingly)',
    structure: 'いまだに + V-ている／negative',
    explanation:
      'いまだに stresses that something continues to this day when it might have been expected to end: いまだに覚えている, いまだに連絡がない "still no word". It is more emphatic than まだ and often carries surprise or frustration.',
    functions: ['continuity', 'time'],
    examples: [
      ex('子供の ころの ことを いまだに よく 覚えて いる。', 'I still remember my childhood well.', 'こどもの ころの ことを いまだに よく おぼえて いる。'),
      ex('あの 事件の 犯人は いまだに 見つかって いない。', 'The culprit in that case has still not been found.', 'あの じけんの はんにんは いまだに みつかって いない。'),
    ],
  },
  'n3m-g-21358e': {
    meaning: 'if (it is really the case that) ~',
    structure: 'Plain form (Na／N + な) + のだったら（んだったら）',
    explanation:
      'のだったら takes what the other person has said or shown as the premise: 行きたくないんだったら、行かなくていい "if you really don’t want to go, you don’t have to". It is conversational and close to のなら.',
    functions: ['condition'],
    examples: [
      ex('疲れて いるんだったら、少し 休んだら？', "If you're tired, why don't you rest a bit?", 'つかれて いるんだったら、すこし やすんだら？'),
      ex('本当に 好きなんだったら、はっきり 言った ほうが いい。', "If you really like her, you'd better say so clearly.", 'ほんとうに すきなんだったら、はっきり いった ほうが いい。'),
    ],
  },
  'n3m-g-537fa5': {
    meaning: 'how (very) ~ it would be / must be!',
    structure: 'どんなに + Adj／V + だろう（か）',
    explanation:
      'どんなに〜だろう is an exclamation imagining the intensity of a feeling or situation: 一人でどんなに寂しかっただろう "how lonely she must have been on her own". It often follows a condition with たら or ば.',
    functions: ['exclamatory', 'speculation'],
    examples: [
      ex('家族に 会えたら、どんなに うれしい だろう。', 'How happy I would be if I could see my family.', 'かぞくに あえたら、どんなに うれしい だろう。'),
      ex('知らない 国で、彼は どんなに 心細かった だろうか。', 'How lonely he must have felt in a strange country.', 'しらない くにで、かれは どんなに こころぼそかった だろうか。'),
    ],
  },
  'n3m-g-997d49': {
    meaning: '(go) as far as ~; up to the point where ~',
    structure: 'V-dict／V-た + ところ まで',
    explanation:
      'ところまで marks how far an action goes: 行けるところまで行こう "let’s go as far as we can", 昨日読んだところまで "up to where I read yesterday". It can refer to a point in a process or a physical place.',
    functions: ['range', 'time-direction'],
    examples: [
      ex('今日は 行ける ところまで 歩いて みよう。', "Let's walk as far as we can today.", 'きょうは いける ところまで あるいて みよう。'),
      ex('昨日 読んだ ところまで 復習しましょう。', "Let's review up to where we read yesterday.", 'きのう よんだ ところまで ふくしゅうしましょう。'),
    ],
  },
  'n3m-g-b2f28c': {
    meaning: 'if you keep ~ing (like this, it will be bad)',
    structure: 'V-て + いては, … (negative outcome)',
    explanation:
      'ていては warns that continuing a habit will lead to a bad result: 毎日遊んでいては合格できない "if you keep playing every day, you won’t pass". The main clause is negative or a warning. In speech it contracts to てちゃ.',
    functions: ['condition', 'warning'],
    examples: [
      ex('そんなに 休んで いては、仕事が 終わらないよ。', "If you keep resting like that, the work won't get done.", 'そんなに やすんで いては、しごとが おわらないよ。'),
      ex('文句ばかり 言って いては、何も 変わらない。', 'Nothing will change if all you do is complain.', 'もんくばかり いって いては、なにも かわらない。'),
    ],
  },
  'n3m-g-42b672': {
    meaning: 'sometimes; at times; on occasion',
    structure: '時には（ときには）+ V',
    explanation:
      '時には means "now and then, on occasion" and often suggests a break from the usual: 時には休むことも大切だ "it’s important to rest sometimes". It is slightly more emphatic than 時々 and often used in advice.',
    functions: ['frequency'],
    examples: [
      ex('時には 休む ことも 必要だ。', 'Sometimes you need to rest, too.', 'ときには やすむ ことも ひつようだ。'),
      ex('時には 家族と ゆっくり 話す 時間を 作りたい。', 'I want to make time now and then to talk with my family.', 'ときには かぞくと ゆっくり はなす じかんを つくりたい。'),
    ],
  },
  'n3m-g-bae494': {
    meaning: 'it is only because of ~; it was done with ~ in mind',
    structure: 'V-て + の こと（だ）',
    explanation:
      'てのこと says an action was taken with a specific reason or consideration behind it: 君のためを思ってのことだ "I did it with your best interests in mind". It defends or explains an action and is somewhat formal.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('厳しく 言ったのは、君の ことを 思っての ことだ。', 'I was strict with you because I had your interests at heart.', 'きびしく いったのは、きみの ことを おもっての ことだ。'),
      ex('今回の 値上げは、材料費の 高騰を 考えての ことです。', 'This price rise was made in view of the soaring cost of materials.', 'こんかいの ねあげは、ざいりょうひの こうとうを かんがえての ことです。'),
    ],
  },
  'n3m-g-d7e891': {
    meaning: 'the reason ~ is (because of) …; ~ is for the purpose of …',
    structure: 'Clause + のは + N の／plain form + ためだ',
    explanation:
      'This cleft pattern puts the result first and the reason or purpose in focus: 遅れたのは事故のためだ "the reason for the delay was an accident". It is more formal than のは〜からだ and common in explanations and reports.',
    functions: ['cause-reason', 'purpose-goal'],
    examples: [
      ex('電車が 遅れたのは、大雪の ためだ。', 'The train was late because of the heavy snow.', 'でんしゃが おくれたのは、おおゆきの ためだ。'),
      ex('毎朝 走って いるのは、健康の ためです。', 'I run every morning for my health.', 'まいあさ はしって いるのは、けんこうの ためです。'),
    ],
  },
  'n3m-g-f25d26': {
    meaning: 'truly; really; (as a reply) quite so',
    structure: 'いかにも + Adj／V ／（reply）いかにも',
    explanation:
      'いかにも stresses that something truly looks or is a certain way: いかにも高そうな時計 "a watch that looks really expensive". As a formal reply it means "exactly, quite so". It often implies the impression is typical or obvious.',
    functions: ['emphasize', 'similarity-degree'],
    examples: [
      ex('いかにも 高そうな 時計を して いる。', 'He is wearing a watch that looks really expensive.', 'いかにも たかそうな とけいを して いる。'),
      ex('彼は いかにも 困った 顔を して いた。', 'He looked thoroughly troubled.', 'かれは いかにも こまった かおを して いた。'),
    ],
  },
  'n3m-g-299796': {
    meaning: 'typical of ~; just like ~ (to do that)',
    structure: 'いかにも + N + らしい（らしく）',
    explanation:
      'いかにも〜らしい says something embodies the typical qualities of N: いかにも彼らしい答えだ "that answer is so like him". らしい here is the "typical of" suffix, not hearsay. いかにも strengthens it.',
    functions: ['characteristics', 'similarity-degree'],
    examples: [
      ex('それは いかにも 彼らしい 考え方だ。', "That's exactly his way of thinking.", 'それは いかにも かれらしい かんがえかただ。'),
      ex('今日は いかにも 秋らしい さわやかな 天気だ。', 'Today is fresh, typically autumnal weather.', 'きょうは いかにも あきらしい さわやかな てんきだ。'),
    ],
  },
  'n3m-g-823dc4': {
    meaning: 'just because ~; merely for (being) ~',
    structure: 'Plain form／N + と いう だけで',
    explanation:
      'というだけで says a single fact is enough to cause a reaction, often unfairly: 若いというだけで信用されない "not trusted just because I’m young". It suggests the reaction is disproportionate.',
    functions: ['limit', 'cause-reason'],
    examples: [
      ex('若いと いう だけで、意見を 聞いて もらえない。', 'Just because I am young, nobody listens to my opinion.', 'わかいと いう だけで、いけんを きいて もらえない。'),
      ex('有名な 店と いう だけで、人が 集まる。', 'People flock to it just because it is a famous shop.', 'ゆうめいな みせと いう だけで、ひとが あつまる。'),
    ],
  },
  'n3m-g-c5efc4': {
    meaning: 'merely ~ing is not enough',
    structure: 'ただ + V-dict + だけでは, … (不十分／だめだ)',
    explanation:
      'ただ〜だけでは says that doing only this will not achieve the goal: ただ読むだけでは覚えられない "you can’t memorise it just by reading". The second half is usually negative or says something more is needed.',
    functions: ['limit', 'condition-requirement'],
    examples: [
      ex('ただ 本を 読む だけでは、会話は 上手に ならない。', "Just reading books won't make you good at conversation.", 'ただ ほんを よむ だけでは、かいわは じょうずに ならない。'),
      ex('ただ 謝る だけでは、問題は 解決しない。', 'Simply apologising will not solve the problem.', 'ただ あやまる だけでは、もんだいは かいけつしない。'),
    ],
  },
  'n3m-g-dd909f': {
    meaning: 'rather than (calling it) ~, (it is more) …',
    structure: 'A と いうより（は）、（むしろ）B',
    explanation:
      'というより re-labels something more accurately: 先生というより友達のような人だ "more like a friend than a teacher". The first term is not wrong, but the second fits better. むしろ often reinforces the correction.',
    functions: ['compare', 'corrections'],
    examples: [
      ex('彼は 先生と いうより、友達の ような 存在だ。', 'He is more like a friend than a teacher.', 'かれは せんせいと いうより、ともだちの ような そんざいだ。'),
      ex('この 部屋は 広いと いうより、何も ないだけだ。', "This room isn't so much spacious as just empty.", 'この へやは ひろいと いうより、なにも ないだけだ。'),
    ],
  },
  'n3m-g-9d26c7': {
    meaning: 'only; nothing but (emphatic)',
    structure: 'N（particle）+ だけしか + negative',
    explanation:
      'だけしか is a doubled limiter, stressing the smallness or exclusiveness: 彼にだけしか話していない "I have told only him". Particles other than が and を go before it. It is conversational and emphatic.',
    functions: ['limit'],
    examples: [
      ex('その ことは 母に だけしか 話して いない。', 'I have told only my mother about it.', 'その ことは ははに だけしか はなして いない。'),
      ex('参加者は 三人 だけしか 集まらなかった。', 'Only three participants turned up.', 'さんかしゃは さんにん だけしか あつまらなかった。'),
    ],
  },
  'n3m-g-9c7cde': {
    meaning: '(please) do ~ for him / her (blunt request)',
    structure: 'Person に + V-て + あげて くれ（あげて くれないか）',
    explanation:
      'The speaker asks the listener to do a favour for a third person: 妹に教えてあげてくれ "teach my sister, would you?". あげる marks the third person as beneficiary, くれ is a blunt, masculine request. The polite form is てあげてください.',
    functions: ['request', 'benefit'],
    examples: [
      ex('弟が 困って いるから、手伝って あげて くれ。', 'My brother is in trouble, so help him out, will you?', 'おとうとが こまって いるから、てつだって あげて くれ。'),
      ex('あの 子に 道を 教えて あげて くれないか。', 'Could you show that child the way?', 'あの こに みちを おしえて あげて くれないか。'),
    ],
  },
  'n3m-g-727eaa': {
    meaning: 'very; extremely (formal)',
    structure: '非常に（ひじょうに）+ Adj／V',
    explanation:
      '非常に is a formal "very", common in writing, news and speeches: 非常に危険だ. In conversation とても or すごく is more natural. As a noun, 非常 means "emergency" (非常口 "emergency exit").',
    functions: ['level'],
    examples: [
      ex('この 川は 流れが 速くて、非常に 危険です。', 'This river flows fast and is extremely dangerous.', 'この かわは ながれが はやくて、ひじょうに きけんです。'),
      ex('ご協力 いただき、非常に 助かりました。', 'Your cooperation was a great help.', 'ごきょうりょく いただき、ひじょうに たすかりました。'),
    ],
  },
  'n3m-g-1f0ffa': {
    meaning: 'half-done; in the middle of ~ (left unfinished)',
    structure: 'V-ます stem + かけの + N ／ かけだ ／ かける',
    explanation:
      'かけ describes an action begun but not finished: 読みかけの本 "a half-read book", 食べかけのパン. The verb かける after a stem means "start to, be about to": 言いかけてやめた "started to say something and stopped".',
    functions: ['halfway'],
    examples: [
      ex('机の 上に 読みかけの 本が ある。', 'There is a half-read book on the desk.', 'つくえの うえに よみかけの ほんが ある。'),
      ex('彼は 何か 言いかけて、黙って しまった。', 'He started to say something, then fell silent.', 'かれは なにか いいかけて、だまって しまった。'),
    ],
  },
  'n3m-g-b44660': {
    meaning: 'it is not impossible that ~; there is a slight chance',
    structure: 'Plain form (V-ない／ありえない) + ことは ない',
    explanation:
      'With a non-potential verb, ないことはない acknowledges a remote possibility: 雨が降らないことはない "it’s not impossible that it’ll rain". With adjectives it gives grudging agreement: おいしくないことはない "it’s not that it’s bad". The tone is hesitant.',
    functions: ['negative', 'speculation'],
    examples: [
      ex('今から でも 間に合わない ことは ない。', "It's not impossible that we'll make it, even now.", 'いまから でも まにあわない ことは ない。'),
      ex('おいしくない ことは ないが、少し 高い。', "It's not bad, but it is a little expensive.", 'おいしくない ことは ないが、すこし たかい。'),
    ],
  },
  'n3m-g-a0b172': {
    meaning: 'to get off with (only) ~; ~ is enough',
    structure: 'V-て／N で + 済む（済んだ）／ V-ずに 済む',
    explanation:
      '済む says a matter is settled with less than expected: 電話で済む "a phone call will do", 軽いけがで済んだ "escaped with a minor injury". ずに済む means avoiding something: 謝らずに済んだ "got away without having to apologise".',
    functions: ['condition-requirement', 'result'],
    examples: [
      ex('幸い、軽い けがで 済んだ。', 'Fortunately, I got away with only a slight injury.', 'さいわい、かるい けがで すんだ。'),
      ex('友達が 貸して くれたので、新しいのを 買わずに 済んだ。', 'A friend lent me one, so I did not need to buy a new one.', 'ともだちが かして くれたので、あたらしいのを かわずに すんだ。'),
    ],
  },
  'n3m-g-2f3e63': {
    meaning: 'do things like ~ (and so on)',
    structure: 'V-ます stem／N + など + する',
    explanation:
      'などする gives one action as an example of what was done: 本を読むなどして過ごした "spent the time reading and so on". It softens a statement by implying other activities. In writing, V-stem + などして is common.',
    functions: ['denote-by-example'],
    examples: [
      ex('休みの 日は 散歩を するなど して 過ごして いる。', 'On days off I spend my time taking walks and so on.', 'やすみの ひは さんぽを するなど して すごして いる。'),
      ex('資料を 調べるなど して、準備を 進めた。', 'I got ready by looking over the materials and so on.', 'しりょうを しらべるなど して、じゅんびを すすめた。'),
    ],
  },
  'n3m-g-64abd6': {
    meaning: 'no matter what; at any cost',
    structure: '何が 何でも（なにが なんでも）+ V（volitional／たい）',
    explanation:
      '何が何でも is a very strong "no matter what", showing determination: 何が何でも勝ちたい "I want to win at all costs". It is stronger and more emotional than どうしても or なんとしても.',
    functions: ['determination-decision'],
    examples: [
      ex('今度の 試合は 何が 何でも 勝ちたい。', 'I want to win the next match no matter what.', 'こんどの しあいは なにが なんでも かちたい。'),
      ex('何が 何でも、明日までに 終わらせる。', 'I will finish it by tomorrow, whatever it takes.', 'なにが なんでも、あしたまでに おわらせる。'),
    ],
  },
  'n3m-g-6f625f': {
    meaning: 'yet again; once again',
    structure: 'またもや + V-た',
    explanation:
      'またもや is a literary, emphatic "again", used for repeated and usually unwelcome events: またもや事故が起きた. It is common in news and narration. またしても is a close synonym.',
    functions: ['repeat-habits'],
    examples: [
      ex('同じ 交差点で、またもや 事故が 起きた。', 'Another accident occurred at the same intersection.', 'おなじ こうさてんで、またもや じこが おきた。'),
      ex('彼は またもや 約束を 忘れた。', 'He forgot his promise yet again.', 'かれは またもや やくそくを わすれた。'),
    ],
  },
  'n3m-g-a53bff': {
    meaning: "it's nothing; no big deal",
    structure: 'なんて こと（は）ない ／ なんて ことない + N',
    explanation:
      'なんてことない says something is trivial or easy: こんな仕事、なんてことないよ "this job is nothing". Before a noun it means "ordinary, unremarkable": なんてことない毎日. It is casual.',
    functions: ['negative', 'evaluate'],
    examples: [
      ex('この くらいの 距離、歩いても なんて ことない。', 'Walking this far is no big deal.', 'この くらいの きょり、あるいても なんて ことない。'),
      ex('なんて ことない 毎日が、実は 幸せなのだ。', 'Ordinary days are, in fact, happiness.', 'なんて ことない まいにちが、じつは しあわせなのだ。'),
    ],
  },
  'n3m-g-78e188': {
    meaning: 'cannot readily / lightly ~',
    structure: 'おいそれと（は）+ V-potential negative',
    explanation:
      'おいそれとは〜ない says something cannot be done casually or on the spot: おいそれとは買えない値段 "a price you can’t just pay on a whim". It always goes with a negative, usually a potential.',
    functions: ['negative', 'ability'],
    examples: [
      ex('こんなに 高い 物は、おいそれとは 買えない。', "I can't just casually buy something this expensive.", 'こんなに たかい ものは、おいそれとは かえない。'),
      ex('大事な 決定なので、おいそれと 返事は できない。', "It's an important decision, so I can't give an answer right away.", 'だいじな けっていなので、おいそれと へんじは できない。'),
    ],
  },
  'n3m-g-eec334': {
    meaning: '~ or perhaps …',
    structure: 'A か あるいは B',
    explanation:
      'かあるいは joins two alternatives with a slight formality: 電話かあるいはメールで "by phone or perhaps email". It is more written than か alone and less formal than または. It can also join clauses of possibility.',
    functions: ['selective'],
    examples: [
      ex('ご質問は 電話か あるいは メールで どうぞ。', 'For questions, please use phone or email.', 'ごしつもんは でんわか あるいは めーるで どうぞ。'),
      ex('彼は 図書館か あるいは カフェに いる だろう。', 'He is probably at the library or perhaps a café.', 'かれは としょかんか あるいは かふぇに いる だろう。'),
    ],
  },
  'n3m-g-59fc38': {
    meaning: 'even if (by some slim chance) ~',
    structure: 'もし + plain form + と しても',
    explanation:
      'もし〜としても concedes a hypothetical the speaker thinks unlikely: もし宝くじが当たったとしても、仕事は辞めない. The main clause states that the speaker’s position still holds.',
    functions: ['concessions', 'assumptions'],
    examples: [
      ex('もし 宝くじが 当たったと しても、仕事は 続ける。', 'Even if I won the lottery, I would keep working.', 'もし たからくじが あたったと しても、しごとは つづける。'),
      ex('もし 反対されたと しても、自分で 決めた ことを やる。', 'Even if people were to object, I would do what I decided.', 'もし はんたいされたと しても、じぶんで きめた ことを やる。'),
    ],
  },
  'n3m-g-66adcc': {
    meaning: '~ or something (casual)',
    structure: 'N／V + か なんか',
    explanation:
      'かなんか is the casual pronunciation of か何か: 風邪かなんかで休んでいる "off with a cold or something". It also follows verbs: 映画を見るかなんかしよう "let’s watch a film or something".',
    functions: ['vague'],
    examples: [
      ex('お茶か なんか 飲む？', 'Want some tea or something?', 'おちゃか なんか のむ？'),
      ex('週末は 映画を 見るか なんか しよう。', "Let's watch a film or something this weekend.", 'しゅうまつは えいがを みるか なんか しよう。'),
    ],
  },
  'n3m-g-fb48aa': {
    meaning: 'and yet; despite that (critical)',
    structure: 'Sentence／clause + そのくせ、+ contradicting fact',
    explanation:
      'そのくせ points out an inconsistency in someone’s behaviour, with criticism: 彼は文句ばかり言う。そのくせ、自分は何もしない "he complains all the time, yet does nothing himself". It is about other people, not the speaker.',
    functions: ['contrast', 'criticize'],
    examples: [
      ex('彼は 早く 寝ろと 言う。そのくせ、自分は 夜中まで 起きて いる。', 'He tells me to go to bed early, yet he stays up until midnight himself.', 'かれは はやく ねろと いう。そのくせ、じぶんは よなかまで おきて いる。'),
      ex('妹は 太ると 言いながら、そのくせ お菓子ばかり 食べて いる。', 'My sister says she will put on weight, yet she eats nothing but sweets.', 'いもうとは ふとると いいながら、そのくせ おかしばかり たべて いる。'),
    ],
  },
  'n3m-g-f884d0': {
    meaning: 'can be seen; (a person) arrives / shows up (honorific)',
    structure: 'N が + 見える ／ Person が + 見える（＝来る, respectful）',
    explanation:
      '見える means something is naturally visible: 窓から海が見える. It is also a respectful way to say a guest has arrived: お客様が見えました "the guest has arrived". This second use is common in offices and homes.',
    functions: ['ability', 'reverent-humble'],
    examples: [
      ex('晴れた 日には、ここから 富士山が 見える。', 'On clear days you can see Mount Fuji from here.', 'はれた ひには、ここから ふじさんが みえる。'),
      ex('部長、お客様が 見えました。', 'Sir, the visitor has arrived.', 'ぶちょう、おきゃくさまが みえました。'),
    ],
  },
  'n3m-g-6a2f94': {
    meaning: 'even supposing ~ (casual としたって)',
    structure: 'もし + plain form + と したって',
    explanation:
      'としたって is the colloquial form of としても: もし遅れたとしたって、誰も怒らないよ. It sounds relaxed or dismissive. It is common in speech between friends.',
    functions: ['concessions'],
    examples: [
      ex('もし 少し 遅れたと したって、大丈夫だよ。', "Even if we're a bit late, it'll be fine.", 'もし すこし おくれたと したって、だいじょうぶだよ。'),
      ex('今から 行ったと したって、もう 閉まってるよ。', "Even if we went now, it'd be closed.", 'いまから いったと したって、もう しまってるよ。'),
    ],
  },
  'n3m-g-fd4c45': {
    meaning: 'nothing is as ~ as …; there is nothing more ~ than …',
    structure: 'N／V-dict + くらい（ほど）+ Adj + N は ない',
    explanation:
      'くらい〜はない picks out something as the extreme case: 家族ほど大切なものはない "nothing is as precious as family". くらい and ほど are interchangeable here. The speaker expresses a strong personal evaluation.',
    functions: ['highest-level', 'compare'],
    examples: [
      ex('健康 くらい 大切な ものは ない。', 'Nothing is as important as health.', 'けんこう くらい たいせつな ものは ない。'),
      ex('夏の 夜に 飲む ビール くらい おいしい ものは ない。', 'There is nothing as delicious as beer on a summer night.', 'なつの よるに のむ びーる くらい おいしい ものは ない。'),
    ],
  },
  'n3m-g-4cc658': {
    meaning: '(respected person) is ~ing (honorific ている)',
    structure: 'V-て + おられる（おられます）',
    explanation:
      'ておられる is おる (humble いる) made respectful with られる, used for the continuing actions of respected people: 先生は研究を続けておられる. It is common in western Japan and formal speech; ていらっしゃる is the standard alternative.',
    functions: ['reverent-humble'],
    examples: [
      ex('先生は 今も 研究を 続けて おられます。', 'The professor is still continuing his research.', 'せんせいは いまも けんきゅうを つづけて おられます。'),
      ex('社長は 何と 言って おられましたか。', 'What was the president saying?', 'しゃちょうは なんと いって おられましたか。'),
    ],
  },
  'n3m-g-4da6a7': {
    meaning: '(humbly) I will ~; allow me to ~',
    structure: 'V-causative-て + いただく（させて いただきます）',
    explanation:
      'させていただく presents the speaker’s own action as done with the listener’s permission, which makes it humble: 本日は休ませていただきます. In business it is used very widely, sometimes where no permission is involved, which some people find overdone.',
    functions: ['request-permission', 'reverent-humble'],
    examples: [
      ex('本日は 体調不良の ため、休ませて いただきます。', 'I will be taking today off as I am unwell.', 'ほんじつは たいちょうふりょうの ため、やすませて いただきます。'),
      ex('それでは、説明させて いただきます。', 'Now, allow me to explain.', 'それでは、せつめいさせて いただきます。'),
    ],
  },
  'n3m-g-bf71cb': {
    meaning: 'everything; all of it (without exception)',
    structure: '何もかも（なにもかも）+ V',
    explanation:
      '何もかも means "absolutely everything", stronger than 全部: 何もかも忘れたい "I want to forget everything". It is often used emotionally, for a clean slate or total loss.',
    functions: ['emphasize', 'amount'],
    examples: [
      ex('火事で 何もかも 失って しまった。', 'I lost everything in the fire.', 'かじで なにもかも うしなって しまった。'),
      ex('何もかも 忘れて、旅に 出たい。', 'I want to forget everything and go travelling.', 'なにもかも わすれて、たびに でたい。'),
    ],
  },
  'n3m-g-7f1426': {
    meaning: 'not to the extent of (being called) ~',
    structure: 'Plain form／N + と いう ほどでは ない',
    explanation:
      'というほどではない says a word would overstate the case: 病気というほどではない "it’s not so bad you’d call it an illness". It softens a description. ほどではない alone also works after verbs and adjectives.',
    functions: ['level', 'negative'],
    examples: [
      ex('少し 熱が あるが、病気と いう ほどでは ない。', "I have a slight fever, but it's not bad enough to call it being ill.", 'すこし ねつが あるが、びょうきと いう ほどでは ない。'),
      ex('料理は 得意と いう ほどでは ないが、好きだ。', "I wouldn't say I'm good at cooking, but I like it.", 'りょうりは とくいと いう ほどでは ないが、すきだ。'),
    ],
  },
  'n3m-g-9b78d2': {
    meaning: 'nothing special; for no particular reason',
    structure: 'なんと いう ことも ない（なんと いう ことも なく）',
    explanation:
      'なんということもない describes something unremarkable: なんということもない風景 "an ordinary landscape". As an adverb, なんということもなく means "for no particular reason, idly": なんということもなく町を歩いた.',
    functions: ['negative', 'vague'],
    examples: [
      ex('それは なんと いう ことも ない 普通の 一日だった。', 'It was an ordinary day, nothing special.', 'それは なんと いう ことも ない ふつうの いちにちだった。'),
      ex('なんと いう ことも なく、駅前を ぶらぶら 歩いた。', 'I wandered around by the station for no particular reason.', 'なんと いう ことも なく、えきまえを ぶらぶら あるいた。'),
    ],
  },
  'n3m-g-ec0b7d': {
    meaning: 'however much you say ~, (still) …',
    structure: 'いくら + plain form／N + と いっても',
    explanation:
      'いくら〜といっても concedes an argument but insists on a limit: いくら安いといっても、これは買いすぎだ "cheap or not, this is buying too much". It pushes back against an excuse.',
    functions: ['concessions'],
    examples: [
      ex('いくら 安いと いっても、こんなに 買う 必要は ない。', "Cheap or not, there's no need to buy this much.", 'いくら やすいと いっても、こんなに かう ひつようは ない。'),
      ex('いくら 子供だと いっても、それは 許されない。', "He may be a child, but that can't be allowed.", 'いくら こどもだと いっても、それは ゆるされない。'),
    ],
  },
  'n3m-g-714604': {
    meaning: 'if ~ had happened, (it) would have been …',
    structure: 'V-ば + … + ところだった ／ V-ば + … + ところだ',
    explanation:
      'A counterfactual: if the condition had been met, the result would have happened. もう少し遅ければ事故に遭うところだった "a little later and I would have been in an accident". It often expresses relief at a narrow escape.',
    functions: ['condition-contrary'],
    examples: [
      ex('もう 少し 遅ければ、電車に 乗り遅れる ところだった。', 'Any later and I would have missed the train.', 'もう すこし おそければ、でんしゃに のりおくれる ところだった。'),
      ex('君が 注意して くれなければ、間違える ところだった。', 'If you had not warned me, I would have made a mistake.', 'きみが ちゅういして くれなければ、まちがえる ところだった。'),
    ],
  },
  'n3m-g-9bc4e1': {
    meaning: 'supposing ~; for argument’s sake, if ~',
    structure: '仮に（かりに）+ V-たら／V-ば／と したら',
    explanation:
      '仮に marks a condition as purely hypothetical, for discussion or planning: 仮に明日雨が降ったら、どうしますか. It is a little more formal than もし and common in business and debate.',
    functions: ['condition', 'assumptions'],
    examples: [
      ex('仮に 明日 雨だったら、試合は どう なりますか。', 'Supposing it rains tomorrow, what happens to the match?', 'かりに あした あめだったら、しあいは どう なりますか。'),
      ex('仮に 百万円 あれば、何に 使いますか。', 'Say you had a million yen, what would you spend it on?', 'かりに ひゃくまんえん あれば、なにに つかいますか。'),
    ],
  },
  'n3m-g-9cc8f9': {
    meaning: 'no matter how (much) ~ (formal)',
    structure: 'いかに + V-volitional + と（も）',
    explanation:
      'いかに〜ようと(も) is a formal concession, "however much one may ~": いかに努力しようと、結果が全てだ. It is written and rhetorical. The everyday version is どんなに〜ても.',
    functions: ['concessions'],
    examples: [
      ex('いかに 反対されようと、私は 考えを 変えない。', 'However strongly I am opposed, I will not change my mind.', 'いかに はんたいされようと、わたしは かんがえを かえない。'),
      ex('いかに 急ごうとも、もう 間に合わない。', 'No matter how fast we hurry, we will not make it now.', 'いかに いそごうとも、もう まにあわない。'),
    ],
  },
  'n3m-g-df5b15': {
    meaning: 'hardly any; not much (at all)',
    structure: 'いくらも + negative',
    explanation:
      'いくらも with a negative says an amount is very small: 時間はいくらも残っていない "there’s hardly any time left". It is close to あまり〜ない but stresses scarcity more.',
    functions: ['amount', 'negative'],
    examples: [
      ex('締め切りまで、時間は いくらも 残って いない。', 'There is hardly any time left before the deadline.', 'しめきりまで、じかんは いくらも のこって いない。'),
      ex('財布には お金が いくらも 入って いなかった。', 'There was hardly any money in the wallet.', 'さいふには おかねが いくらも はいって いなかった。'),
    ],
  },
  'n3m-g-b7ca07': {
    meaning: 'really does look ~ (appearance)',
    structure: 'いかにも + V-stem／Adj stem + そうだ',
    explanation:
      'いかにも strengthens the appearance そうだ: いかにもおいしそうだ "it looks absolutely delicious". The impression is obvious to anyone looking. It is not the hearsay そうだ, which follows a full plain form.',
    functions: ['similarity-degree', 'emphasize'],
    examples: [
      ex('この ケーキは いかにも おいしそうだ。', 'This cake looks absolutely delicious.', 'この けーきは いかにも おいしそうだ。'),
      ex('彼は いかにも 退屈そうに 話を 聞いて いた。', 'He was listening with a thoroughly bored look.', 'かれは いかにも たいくつそうに はなしを きいて いた。'),
    ],
  },
  'n3m-g-bbaa86': {
    meaning: 'not displeased; actually rather pleased',
    structure: 'まんざらでも ない（様子／顔）',
    explanation:
      'まんざらでもない is a fixed understatement: someone looks outwardly modest but is actually pleased: 褒められてまんざらでもない顔 "a face that says he didn’t mind the praise". It describes other people’s reactions.',
    functions: ['evaluate', 'feel'],
    examples: [
      ex('「いい 声だね」と 言われて、彼は まんざらでも ない 様子だった。', 'Told he had a good voice, he looked rather pleased.', '「いい こえだね」と いわれて、かれは まんざらでも ない ようすだった。'),
      ex('妹は 文句を 言いながらも、まんざらでも ない 顔を して いた。', 'My sister grumbled, but she looked quite pleased.', 'いもうとは もんくを いいながらも、まんざらでも ない かおを して いた。'),
    ],
  },
  'n3m-g-b490d6': {
    meaning: 'it seems like ~, and also like … (mixed impression)',
    structure: 'A ようでも あり, B ようでも ある',
    explanation:
      'This pattern expresses an ambivalent impression: 嬉しいようでもあり、寂しいようでもある "I feel both happy and sad". Both halves are uncertain, and neither is chosen. It is reflective and a little literary.',
    functions: ['speculation', 'listed'],
    examples: [
      ex('卒業は うれしい ようでも あり、寂しい ようでも ある。', 'Graduating feels both happy and sad.', 'そつぎょうは うれしい ようでも あり、さびしい ようでも ある。'),
      ex('その 話は 本当の ようでも あり、嘘の ようでも ある。', 'That story sounds both true and false.', 'その はなしは ほんとうの ようでも あり、うその ようでも ある。'),
    ],
  },
  'n3m-g-dea9b2': {
    meaning: 'it goes without saying that ~',
    structure: 'Plain form (N／Na である) + の は 言う までも ない',
    explanation:
      'At the end of a sentence, のは言うまでもない states something as self-evident: 健康が大切なのは言うまでもない. It is formal and common in essays. As a sentence opener, 言うまでもなく does the same job.',
    functions: ['of-course'],
    examples: [
      ex('健康が 何より 大切なのは 言う までも ない。', 'It goes without saying that health comes first.', 'けんこうが なにより たいせつなのは いう までも ない。'),
      ex('準備が 必要なのは 言う までも ありません。', 'Needless to say, preparation is necessary.', 'じゅんびが ひつようなのは いう までも ありません。'),
    ],
  },
  'n3m-g-331c77': {
    meaning: 'even so; (despite how it looks) actually ~',
    structure: 'あれでも + clause（～なんだ／～つもりだ）',
    explanation:
      'あれでも says that despite appearances, something is the case: あれでも彼は一生懸命やっているんだ "he may not look it, but he’s trying hard". It defends or explains someone. これでも is used about oneself: これでも忙しいんです.',
    functions: ['concessions', 'unexpected-outcome'],
    examples: [
      ex('あれでも 彼は 一生懸命 やって いるんです。', "He may not look it, but he is doing his best.", 'あれでも かれは いっしょうけんめい やって いるんです。'),
      ex('これでも 若い ころは スポーツ選手だったんですよ。', 'Believe it or not, I was an athlete when I was young.', 'これでも わかい ころは すぽーつせんしゅだったんですよ。'),
    ],
  },
  'n3m-g-eacdf8': {
    meaning: 'looks like one might (end up) ~',
    structure: 'V-て + しまいそうだ（ちゃいそうだ）',
    explanation:
      'てしまう plus the appearance そうだ says an unwanted or uncontrollable outcome seems about to happen: 泣いてしまいそうだ "I think I’m going to cry". In speech it shortens to ちゃいそう. It is a feeling from the current situation, not hearsay.',
    functions: ['speculation', 'regret'],
    examples: [
      ex('眠くて、会議中に 寝て しまいそうだ。', "I'm so sleepy I might fall asleep in the meeting.", 'ねむくて、かいぎちゅうに ねて しまいそうだ。'),
      ex('この ケーキ、全部 食べちゃいそう。', "I think I'm going to end up eating this whole cake.", 'この けーき、ぜんぶ たべちゃいそう。'),
    ],
  },
  'n3m-g-da27e5': {
    meaning: 'not only that, (but also / even) …',
    structure: 'Sentence。そればかりか、+ further (often worse) point',
    explanation:
      'そればかりか adds a point that goes even further than the previous one, often surprisingly: 彼は謝らなかった。そればかりか、怒り出した "he didn’t apologise; worse, he got angry". It is written and more emphatic than それに.',
    functions: ['add', 'emphasize'],
    examples: [
      ex('彼は 遅刻した。そればかりか、宿題も 忘れて きた。', 'He was late. Not only that, he forgot his homework too.', 'かれは ちこくした。そればかりか、しゅくだいも わすれて きた。'),
      ex('薬を 飲んでも 治らない。そればかりか、悪く なって いる。', "The medicine isn't working. In fact, I'm getting worse.", 'くすりを のんでも なおらない。そればかりか、わるく なって いる。'),
    ],
  },
  'n3m-g-9e5ba4': {
    meaning: "that's the way; that's what I'd expect (of you)",
    structure: 'それでこそ + N（だ）',
    explanation:
      'それでこそ praises someone for living up to their role: それでこそ私の息子だ "that’s my boy". It means "only by doing that are you truly N". It sounds warm or rousing, often from a senior.',
    functions: ['evaluate', 'emphasize'],
    examples: [
      ex('最後まで あきらめないなんて、それでこそ 私の 息子だ。', "Never giving up till the end, that's my son.", 'さいごまで あきらめないなんて、それでこそ わたしの むすこだ。'),
      ex('失敗を 認めて 謝る。それでこそ 本当の リーダーだ。', 'Admitting a mistake and apologising is what makes a true leader.', 'しっぱいを みとめて あやまる。それでこそ ほんとうの りーだーだ。'),
    ],
  },
  'n3m-g-9d442a': {
    meaning: "I'd never (do something like) ~!",
    structure: 'N など（なんか）+ V + ものか（もんか）',
    explanation:
      'ものか is a strong rhetorical denial, "as if I would!": あんな店など二度と行くものか "I’ll never go to that shop again". など adds contempt for the object. The casual form is もんか; ものですか is the more feminine or polite version.',
    functions: ['emphasize-negative', 'determination-decision'],
    examples: [
      ex('あんな 店など、二度と 行く ものか。', "As if I'd ever go to that shop again!", 'あんな みせなど、にどと いく ものか。'),
      ex('あいつの 言う ことなんか、信じる もんか。', "Like I'd believe anything he says!", 'あいつの いう ことなんか、しんじる もんか。'),
    ],
  },
  'n3m-g-11c6ca': {
    meaning: "that's going too far, however you look at it",
    structure: 'いくら なんでも + (too much / impossible)',
    explanation:
      'いくらなんでも says something crosses a reasonable limit whatever allowances are made: いくらなんでも高すぎる "that’s way too expensive, whatever you say". It expresses disbelief or objection.',
    functions: ['criticize', 'concessions'],
    examples: [
      ex('一泊 十万円は、いくら なんでも 高すぎる。', 'A hundred thousand yen a night is far too expensive, whatever the reason.', 'いっぱく じゅうまんえんは、いくら なんでも たかすぎる。'),
      ex('三時間も 遅れるなんて、いくら なんでも ひどい。', 'Three hours late is just too much.', 'さんじかんも おくれるなんて、いくら なんでも ひどい。'),
    ],
  },
  'n3m-g-9f301c': {
    meaning: 'contrary to ~; on the other hand',
    structure: 'N と（は）反対に ／ 反対に、+ contrasting fact',
    explanation:
      '反対に presents an opposite situation or result: 予想と反対に、試験は簡単だった "contrary to expectations, the exam was easy". At the start of a sentence it contrasts two parties: 兄は背が高い。反対に、弟は低い. 逆に is a common synonym.',
    functions: ['contrast'],
    examples: [
      ex('予想と 反対に、試験は とても 簡単だった。', 'Contrary to what I expected, the exam was very easy.', 'よそうと はんたいに、しけんは とても かんたんだった。'),
      ex('姉は 外で 遊ぶのが 好きだ。反対に、妹は 家で 本を 読むのが 好きだ。', 'My older sister likes playing outside. My younger sister, on the other hand, likes reading at home.', 'あねは そとで あそぶのが すきだ。はんたいに、いもうとは いえで ほんを よむのが すきだ。'),
    ],
  },
  'n3m-g-5aca52': {
    meaning: "it's no wonder ~; it's understandable that ~",
    structure: 'Plain form (Na な／N な) + のも 無理も ない（無理は ない）',
    explanation:
      'のも無理もない says a reaction is natural given the circumstances: あんなことを言われたら、怒るのも無理もない "no wonder he got angry after being told that". The reason is often stated first.',
    functions: ['judge', 'of-course'],
    examples: [
      ex('毎日 残業では、疲れるのも 無理も ない。', "With overtime every day, it's no wonder you're tired.", 'まいにち ざんぎょうでは、つかれるのも むりも ない。'),
      ex('初めての 海外なら、緊張するのも 無理は ない。', "If it's your first time abroad, it's understandable to be nervous.", 'はじめての かいがいなら、きんちょうするのも むりは ない。'),
    ],
  },
  'n3m-g-507a18': {
    meaning: 'I gather (that) ~; apparently ~',
    structure: 'なんでも + plain form + そうだ（らしい／と いう ことだ）',
    explanation:
      'なんでも at the start of a hearsay sentence signals vague, second-hand information: なんでも社長が辞めるそうだ "apparently the president is resigning". The speaker does not vouch for it. It must end with a hearsay form.',
    functions: ['heard'],
    examples: [
      ex('なんでも、あの 店は 来月で 閉店する そうだ。', 'Apparently that shop is closing at the end of next month.', 'なんでも、あの みせは らいげつで へいてんする そうだ。'),
      ex('なんでも 彼は 昔 歌手だった らしい。', 'I gather he used to be a singer.', 'なんでも かれは むかし かしゅだった らしい。'),
    ],
  },
  'n3m-g-8b72df': {
    meaning: "I'd like you to let me ~",
    structure: 'V-causative-て + ほしい（ほしいんですが）',
    explanation:
      'させてほしい asks for permission by stating a wish: 私にやらせてほしい "I’d like you to let me do it". It is more direct than させてください and common among equals. Adding んですが softens it.',
    functions: ['request-permission', 'desire'],
    examples: [
      ex('その 仕事、私に やらせて ほしい。', "I'd like you to let me do that job.", 'その しごと、わたしに やらせて ほしい。'),
      ex('少し 考えさせて ほしいんですが。', "I'd like a little time to think, if that's all right.", 'すこし かんがえさせて ほしいんですが。'),
    ],
  },
  'n3m-g-c38af8': {
    meaning: 'there is nothing as ~ as …',
    structure: 'N／V-dict + ほど + Adj + N は ない',
    explanation:
      'ほど〜はない picks out the top example: 家族ほど大切なものはない "nothing is as precious as family". It is a strong personal statement. くらい can replace ほど with little difference.',
    functions: ['highest-level', 'compare'],
    examples: [
      ex('一人で 食べる 食事 ほど 寂しい ものは ない。', 'Nothing is as lonely as eating alone.', 'ひとりで たべる しょくじ ほど さびしい ものは ない。'),
      ex('彼 ほど 親切な 人は いない。', 'There is no one as kind as him.', 'かれ ほど しんせつな ひとは いない。'),
    ],
  },
  'n3m-g-1f1b0a': {
    meaning: 'for some reason; somehow',
    structure: 'なぜか + clause',
    explanation:
      'なぜか says the speaker does not know why something is so: なぜか涙が出た "for some reason tears came". It is a statement, not a question. なんとなく is similar but focuses on vague feelings.',
    functions: ['vague', 'cause-reason'],
    examples: [
      ex('なぜか 今日は 朝から 気分が いい。', 'For some reason I have felt good since this morning.', 'なぜか きょうは あさから きぶんが いい。'),
      ex('あの 曲を 聞くと、なぜか 泣きたく なる。', 'When I hear that song, for some reason I feel like crying.', 'あの きょくを きくと、なぜか なきたく なる。'),
    ],
  },
  'n3m-g-43c4b5': {
    meaning: 'in (a place / group) (contrast); according to ~',
    structure: 'N（place／group／source）+ では',
    explanation:
      'では marks a setting and contrasts it with others: 日本では靴を脱ぐ "in Japan (unlike elsewhere), you take off your shoes". With sources, it gives the view there: 天気予報では雨だ "the forecast says rain".',
    functions: ['perspective-way', 'information-resource'],
    examples: [
      ex('日本では、家に 入る とき 靴を 脱ぎます。', 'In Japan, you take off your shoes when entering a house.', 'にほんでは、いえに はいる とき くつを ぬぎます。'),
      ex('ニュースでは、明日は 大雨に なると 言って いた。', 'The news said there will be heavy rain tomorrow.', 'にゅーすでは、あしたは おおあめに なると いって いた。'),
    ],
  },
  'n3m-g-98be0e': {
    meaning: 'further; even more; in addition',
    structure: 'さらに + Adj／V ／ Sentence。さらに、…',
    explanation:
      'さらに increases a degree (さらに寒くなる "get even colder") or adds another point in writing (さらに、費用の問題もある). It is more formal than もっと and それに.',
    functions: ['add', 'level'],
    examples: [
      ex('夜に なって、雨は さらに 強く なった。', 'At night the rain grew even heavier.', 'よるに なって、あめは さらに つよく なった。'),
      ex('この 案は 安全だ。さらに、費用も 安い。', 'This plan is safe. In addition, it is cheap.', 'この あんは あんぜんだ。さらに、ひようも やすい。'),
    ],
  },
  'n3m-g-bb2c6c': {
    meaning: "well...; come on; now then",
    structure: 'さあ（、+ invitation／I don’t know）',
    explanation:
      'さあ has two opposite uses. It urges action: さあ、行こう "come on, let’s go". Or, with a hesitant tone, it answers a question with "well, I’m not sure": 「どこ?」「さあ…」. Context and intonation decide.',
    functions: ['speak', 'invite-suggest'],
    examples: [
      ex('さあ、そろそろ 出かけましょう。', "Right, let's get going.", 'さあ、そろそろ でかけましょう。'),
      ex('「田中さんは どこ？」「さあ、分からない。」', '"Where’s Tanaka?" "Well, I don’t know."', '「たなかさんは どこ？」「さあ、わからない。」'),
    ],
  },
  'n3m-g-5ebb3a': {
    meaning: 'just by looking; obviously (from the look of it)',
    structure: '見るからに + Adj（そうだ／〜な N）',
    explanation:
      '見るからに says a quality is obvious at a glance: 見るからに高そうな車 "a car that looks expensive at first sight". It is followed by descriptions of appearance and can’t be used for hidden qualities.',
    functions: ['judge', 'similarity-degree'],
    examples: [
      ex('見るからに 高そうな 車が 止まって いた。', 'A car that looked expensive at a glance was parked there.', 'みるからに たかそうな くるまが とまって いた。'),
      ex('彼は 見るからに 疲れた 様子だった。', 'He was obviously exhausted.', 'かれは みるからに つかれた ようすだった。'),
    ],
  },
  'n3m-g-f08092': {
    meaning: 'too (much); so ~ that …',
    structure: 'あまりに（も）+ Adj／V',
    explanation:
      'あまりに(も) marks an excessive degree, often leading to a consequence: あまりにも高くて買えなかった "it was so expensive I couldn’t buy it". It is more written than あんまり and stronger than とても.',
    functions: ['level'],
    examples: [
      ex('その 映画は あまりにも 悲しくて、最後まで 見られなかった。', 'The film was so sad that I could not watch it to the end.', 'その えいがは あまりにも かなしくて、さいごまで みられなかった。'),
      ex('あまりに 静かで、少し 怖かった。', 'It was so quiet that it was a little scary.', 'あまりに しずかで、すこし こわかった。'),
    ],
  },
  'n3m-g-4f1bb7': {
    meaning: 'if (had) ~, then (would have …) (counterfactual)',
    structure: 'Plain past (の) + なら, … + た のに／だろう',
    explanation:
      'なら with a past clause can state an unreal condition: 知っていたなら教えてくれればよかったのに "if you knew, you should have told me". The main clause often ends in のに or だろう. It is more reproachful than たら.',
    functions: ['condition-contrary'],
    examples: [
      ex('来ると 分かって いたなら、料理を 用意したのに。', 'If I had known you were coming, I would have cooked.', 'くると わかって いたなら、りょうりを よういしたのに。'),
      ex('あの 時 言って くれたなら、助けられた だろう。', 'If you had told me then, I could have helped.', 'あの とき いって くれたなら、たすけられた だろう。'),
    ],
  },
  'n3m-g-46405e': {
    meaning: 'of (among a group); from among ~',
    structure: 'N の + うち（で／から）',
    explanation:
      'うち marks a set from which something is picked: 三人のうちで一番若い "the youngest of the three", 五つのうちから選ぶ "choose from the five". It is similar to の中で. With time, the same word means "while".',
    functions: ['range', 'selective'],
    examples: [
      ex('兄弟の うちで、一番 背が 高いのは 私です。', 'I am the tallest of the brothers and sisters.', 'きょうだいの うちで、いちばん せが たかいのは わたしです。'),
      ex('この 三つの うちから 一つ 選んで ください。', 'Please choose one of these three.', 'この みっつの うちから ひとつ えらんで ください。'),
    ],
  },
  'n3m-g-6d3884': {
    meaning: 'something like ~; so-and-so (a name one forgets)',
    structure: 'なんとか いう + N ／ 〜とか なんとか 言う',
    explanation:
      'なんとかいう replaces a name the speaker cannot remember: なんとかいう店 "a shop called something or other". とかなんとか言う reports vague words: 忙しいとかなんとか言って断った.',
    functions: ['vague'],
    examples: [
      ex('駅前の なんとか いう 店で 買った。', 'I bought it at some shop by the station, I forget the name.', 'えきまえの なんとか いう みせで かった。'),
      ex('彼は 用事が あるとか なんとか 言って、帰って しまった。', 'He said he had some errand or other and went home.', 'かれは ようじが あるとか なんとか いって、かえって しまった。'),
    ],
  },
  'n3m-g-6d643e': {
    meaning: '(speaking of) ~ (annoyed); I told you, didn’t I!',
    structure: 'N（person）+ ったら ／ Plain form + ったら（insisting）',
    explanation:
      'After a person, ったら expresses exasperation or fond reproach: 母ったら、また忘れてる "honestly, Mum’s forgotten again". After a verb it insists impatiently: 早くしろったら "I said hurry up!". It is casual.',
    functions: ['criticize', 'emphasize'],
    examples: [
      ex('うちの 父ったら、また 鍵を なくしたのよ。', 'Honestly, my dad has lost his keys again.', 'うちの ちちったら、また かぎを なくしたのよ。'),
      ex('もう 行くったら！早く して。', "I said we're going! Hurry up.", 'もう いくったら！はやく して。'),
    ],
  },
  'n3m-g-640de8': {
    meaning: 'something called ~; (the thing) ~ itself',
    structure: 'N + と いう もの（は／を）',
    explanation:
      'というもの presents a noun as a general concept to reflect on: 友情というもの "friendship (as a thing)". Before a negative it can mean "at all": 遠慮というものを知らない "has no idea of restraint". It sounds reflective or critical.',
    functions: ['definition'],
    examples: [
      ex('彼は 遠慮と いう ものを 知らない。', 'He has no sense of restraint whatsoever.', 'かれは えんりょと いう ものを しらない。'),
      ex('年を 取って、健康と いう ものの 大切さが 分かった。', 'Growing older, I have come to understand the value of health.', 'としを とって、けんこうと いう ものの たいせつさが わかった。'),
    ],
  },
  'n3m-g-ed7820': {
    meaning: 'tend to ~ (if one is not careful); be apt to ~',
    structure: 'ともすると（ともすれば）+ V-がちだ／V-やすい',
    explanation:
      'ともすると says there is a tendency toward something undesirable: ともすると忘れがちだ "it’s easy to forget". It is written and often paired with がち or やすい. ともすれば is a synonym.',
    functions: ['trend'],
    examples: [
      ex('忙しいと、ともすると 家族の ことを 忘れがちだ。', 'When busy, we tend to neglect our families.', 'いそがしいと、ともすると かぞくの ことを わすれがちだ。'),
      ex('若い 人は ともすると 結果ばかりを 求めやすい。', 'Young people can be apt to look only at results.', 'わかい ひとは ともすると けっかばかりを もとめやすい。'),
    ],
  },
  'n3m-g-4fbbff': {
    meaning: 'at any rate; whatever the case',
    structure: 'なんに しろ（なんに せよ／なんに しても）、+ clause',
    explanation:
      'なんにしろ sets aside details to state what matters regardless: なんにしろ、無事でよかった "whatever happened, I’m glad you’re safe". なんにせよ is more formal and なんにしても more conversational.',
    functions: ['invariant'],
    examples: [
      ex('なんに しろ、みんな 無事で よかった。', 'At any rate, I am glad everyone is safe.', 'なんに しろ、みんな ぶじで よかった。'),
      ex('なんに せよ、明日までに 決めなければ ならない。', 'Whatever the case, we have to decide by tomorrow.', 'なんに せよ、あしたまでに きめなければ ならない。'),
    ],
  },
  'n3m-g-30941d': {
    meaning: 'well done (for doing ~); how did you manage to ~!',
    structure: 'よく（ぞ）+ V-た（ね／な）',
    explanation:
      'よく before a past verb praises effort or expresses amazement: よく来てくれたね "how good of you to come". よくぞ is more emphatic and old-fashioned. With criticism it becomes "how dare you": よくそんなことが言えるね.',
    functions: ['exclamatory', 'evaluate'],
    examples: [
      ex('遠い ところを、よく 来て くれたね。', 'How good of you to come all this way.', 'とおい ところを、よく きて くれたね。'),
      ex('こんな 難しい 問題を、よくぞ 解いた。', 'You did well to solve such a difficult problem.', 'こんな むずかしい もんだいを、よくぞ といた。'),
    ],
  },
  'n3m-g-a54e58': {
    meaning: '(sentence-final ぞ) strong assertion; urging (masculine)',
    structure: 'Plain form + ぞ ／ V-volitional + ぞ',
    explanation:
      'ぞ adds forceful emphasis, typically in masculine speech: 行くぞ "let’s go!", 危ないぞ "watch out!". It can also be said to oneself for resolve: よし、やるぞ. It sounds rough if used to superiors.',
    functions: ['emphasize', 'speak'],
    examples: [
      ex('よし、今日は 頑張るぞ！', "Right, I'm going to give it my all today!", 'よし、きょうは がんばるぞ！'),
      ex('早く しないと、遅れるぞ。', "If you don't hurry, you'll be late.", 'はやく しないと、おくれるぞ。'),
    ],
  },
  'n3m-g-53a835': {
    meaning: 'if (only) ~ had …, (it) would have …',
    structure: 'V-ば + … + V-た（のに）',
    explanation:
      'A counterfactual about the past: もっと早く出ればよかった "I should have left earlier", 言ってくれれば手伝ったのに "if you had asked, I would have helped". のに or よかった conveys regret.',
    functions: ['condition-contrary', 'regret'],
    examples: [
      ex('もう 少し 早く 出れば、間に合ったのに。', 'If I had left a little earlier, I would have made it.', 'もう すこし はやく でれば、まにあったのに。'),
      ex('天気が よければ、山に 登れたのに。', 'If the weather had been good, we could have climbed the mountain.', 'てんきが よければ、やまに のぼれたのに。'),
    ],
  },
  'n3m-g-0c02d2': {
    meaning: 'what should I ~?; how am I supposed to ~?',
    structure: 'Question word + V-ば + いい のか（いいんだろう）',
    explanation:
      'ばいいのか asks what one ought to do, often with bewilderment: どうすればいいのか分からない "I don’t know what to do". Embedded with 分からない or as a self-question, it expresses a dilemma.',
    functions: ['asked', 'advice'],
    examples: [
      ex('何と 言えば いいのか、分からない。', 'I do not know what I should say.', 'なんと いえば いいのか、わからない。'),
      ex('この 問題は どう 解けば いいんだろう。', 'How am I supposed to solve this problem?', 'この もんだいは どう とけば いいんだろう。'),
    ],
  },
  'n3m-g-906080': {
    meaning: 'without ~ing; not ~ (written negative)',
    structure: 'V-ない stem + ず（する → せず）、…',
    explanation:
      'ず is the classical negative, used in writing as a connective: 何も言わず出て行った "left without saying anything". It equals ないで or なくて. In fixed phrases it remains in speech: 相変わらず, 思わず.',
    functions: ['negative'],
    examples: [
      ex('彼は 何も 言わず、部屋を 出て 行った。', 'He left the room without a word.', 'かれは なにも いわず、へやを でて いった。'),
      ex('選手たちは 寒さにも 負けず、最後まで 走った。', 'Undeterred by the cold, the runners ran to the end.', 'せんしゅたちは さむさにも まけず、さいごまで はしった。'),
    ],
  },
  'n3m-g-266fb7': {
    meaning: 'only; a mere; slight',
    structure: 'わずか + quantity ／ わずかな + N ／ わずかに',
    explanation:
      'わずか stresses that an amount is small: わずか三日で "in only three days", わずかなお金. It is more formal than たった. わずかに as an adverb means "slightly": わずかに見える.',
    functions: ['limit', 'amount'],
    examples: [
      ex('彼は わずか 三日で その 本を 書き上げた。', 'He finished writing that book in only three days.', 'かれは わずか みっかで その ほんを かきあげた。'),
      ex('わずかな お金でも、寄付したい。', 'I want to donate, even if it is only a small amount.', 'わずかな おかねでも、きふしたい。'),
    ],
  },
  'n3m-g-ed17ce': {
    meaning: 'you should ~; the best thing is to ~ (advice)',
    structure: 'V-dict／V-ない + ことだ',
    explanation:
      'ことだ gives advice as a general principle, often from a senior: 上手になりたければ、毎日練習することだ "if you want to improve, practise every day". It sounds authoritative. ほうがいい is softer.',
    functions: ['advice'],
    examples: [
      ex('合格したければ、毎日 少しずつ 勉強する ことだ。', 'If you want to pass, study a little every day.', 'ごうかくしたければ、まいにち すこしずつ べんきょうする ことだ。'),
      ex('風邪の ときは、無理を しない ことです。', 'When you have a cold, the thing to do is not overdo it.', 'かぜの ときは、むりを しない ことです。'),
    ],
  },
  'n3m-g-d96320': {
    meaning: 'on top of ~; besides ~',
    structure: 'N の／plain form + 上（うえ）に, …',
    explanation:
      '上に adds a second point in the same direction: 安い上においしい "cheap and delicious too". Both points should be positive or both negative. At the start of a sentence, その上 does the same job.',
    functions: ['add'],
    examples: [
      ex('この 店は 安い 上に、量も 多い。', 'This restaurant is cheap, and on top of that the portions are big.', 'この みせは やすい うえに、りょうも おおい。'),
      ex('道に 迷った 上に、雨まで 降って きた。', 'I got lost, and on top of that it started to rain.', 'みちに まよった うえに、あめまで ふって きた。'),
    ],
  },
  'n3m-g-6759de': {
    meaning: 'in the middle of ~ (when something happens)',
    structure: 'N の／V-て いる + 最中（さいちゅう）に（だ）',
    explanation:
      '最中 stresses being right in the middle of an activity when something interrupts: 会議の最中に電話が鳴った. It is more emphatic than 途中 or ている時. 最中だ can also end the sentence: 今、食事の最中だ.',
    functions: ['period', 'relationships-in-time'],
    examples: [
      ex('会議の 最中に、携帯が 鳴って しまった。', 'My phone rang right in the middle of the meeting.', 'かいぎの さいちゅうに、けいたいが なって しまった。'),
      ex('今、晩ご飯を 作って いる 最中だから、あとで 電話する。', "I'm in the middle of making dinner, so I'll call you later.", 'いま、ばんごはんを つくって いる さいちゅうだから、あとで でんわする。'),
    ],
  },
  'n3m-g-67a3a2': {
    meaning: 'what was it (again)?; didn’t (I) ~? (recalling)',
    structure: 'Plain past／だ + っけ ／ polite form + っけ',
    explanation:
      'っけ asks someone, or oneself, to confirm something half-remembered: 会議は何時だっけ? "what time was the meeting again?". It usually follows a past or だ. It is casual, but ましたっけ is fine in polite speech.',
    functions: ['confirm', 'asked'],
    examples: [
      ex('あの 人の 名前、何だっけ？', "What was that person's name again?", 'あの ひとの なまえ、なんだっけ？'),
      ex('明日の 集合時間は 九時でしたっけ。', 'Was it nine o’clock that we are meeting tomorrow?', 'あしたの しゅうごうじかんは くじでしたっけ。'),
    ],
  },
  'n3m-g-41e43c': {
    meaning: 'freshly ~; just ~ed',
    structure: 'V-ます stem + たて（の + N）',
    explanation:
      'たて describes something just made or just done, usually positively: 焼きたてのパン "freshly baked bread", 取れたての野菜. It attaches to a limited set of verbs (焼く, できる, 取る, 生まれる). For "have just done" in general, use たばかり.',
    functions: ['immediately-after'],
    examples: [
      ex('焼きたての パンは 本当に おいしい。', 'Freshly baked bread is really delicious.', 'やきたての ぱんは ほんとうに おいしい。'),
      ex('入社したての ころは、毎日 緊張して いた。', 'When I had just joined the company, I was nervous every day.', 'にゅうしゃしたての ころは、まいにち きんちょうして いた。'),
    ],
  },
  'n3m-g-cf006d': {
    meaning: 'about ~; concerning ~',
    structure: 'N に 関して（に 関する + N）',
    explanation:
      'に関して is a formal "about, regarding": 事故に関して説明する. It is more formal than について and common in business and news. に関する modifies a noun: 環境に関する問題.',
    functions: ['story-topic'],
    examples: [
      ex('その 件に 関して、詳しく 説明して ください。', 'Please explain that matter in detail.', 'その けんに かんして、くわしく せつめいして ください。'),
      ex('日本の 歴史に 関する 本を 読んで いる。', 'I am reading a book about Japanese history.', 'にほんの れきしに かんする ほんを よんで いる。'),
    ],
  },
  'n3m-g-71cd36': {
    meaning: 'used to ~ (nostalgic recollection)',
    structure: 'V-た + ものだ',
    explanation:
      'たものだ recalls a past habit with nostalgia: 子供のころ、よくこの川で遊んだものだ "I used to play in this river a lot as a child". It often appears with よく. Present ものだ gives a general truth instead.',
    functions: ['repeat-habits', 'past-state'],
    examples: [
      ex('学生の ころは、よく 徹夜で 勉強した ものだ。', 'As a student, I often used to study all night.', 'がくせいの ころは、よく てつやで べんきょうした ものだ。'),
      ex('昔は この 辺りで よく 虫を 取った ものだ。', 'I used to catch insects around here a lot.', 'むかしは この あたりで よく むしを とった ものだ。'),
    ],
  },
  'n3m-g-61e5e8': {
    meaning: 'cannot ~ completely; too many / much to ~',
    structure: 'V-ます stem + 切れない（数え切れない・食べ切れない）',
    explanation:
      '切れない says something cannot be done fully because there is too much: 数え切れないほどの星 "countless stars", 待ち切れない "can’t wait". It also expresses overwhelming feelings: 感謝し切れない.',
    functions: ['ability', 'negative'],
    examples: [
      ex('空には 数え切れない ほどの 星が 見えた。', 'There were more stars in the sky than I could count.', 'そらには かぞえきれない ほどの ほしが みえた。'),
      ex('旅行が 楽しみで、待ち切れない。', "I'm so looking forward to the trip that I can't wait.", 'りょこうが たのしみで、まちきれない。'),
    ],
  },
  'n3m-g-a7d7ba': {
    meaning: '(V-stem + 上げる) to finish ~ing completely',
    structure: 'V-ます stem + 上げる（書き上げる・育て上げる）',
    explanation:
      'As a compound, 上げる marks something brought to completion through effort: 論文を書き上げた, 子供を育て上げる "raise a child to adulthood". It implies a finished, polished result, unlike neutral 終わる.',
    functions: ['finish'],
    examples: [
      ex('一晩で レポートを 書き上げた。', 'I finished writing the report in one night.', 'ひとばんで れぽーとを かきあげた。'),
      ex('母は 一人で 三人の 子供を 育て上げた。', 'My mother raised three children on her own.', 'ははは ひとりで さんにんの こどもを そだてあげた。'),
    ],
  },
  'n3m-g-b104e4': {
    meaning: 'as a result (of that)',
    structure: 'Sentence。その 結果、+ outcome',
    explanation:
      'その結果 opens a sentence that states the outcome of what came before: 毎日練習した。その結果、優勝できた. It is common in reports and writing. It links to past facts rather than predictions.',
    functions: ['result'],
    examples: [
      ex('毎日 走った。その 結果、五キロ やせた。', 'I ran every day. As a result, I lost five kilos.', 'まいにち はしった。その けっか、ごきろ やせた。'),
      ex('話し合いを 重ねた。その 結果、全員が 賛成した。', 'We held repeated discussions. As a result, everyone agreed.', 'はなしあいを かさねた。その けっか、ぜんいんが さんせいした。'),
    ],
  },
  'n3m-g-091fcb': {
    meaning: 'have to; must (spoken forms)',
    structure: 'V-ない + と（いけない）／ V-なくちゃ（いけない）',
    explanation:
      'ないと and なくちゃ are clipped forms of ないといけない and なくてはいけない, and both can end a sentence alone: 帰らないと, 帰らなくちゃ. ないと sounds a little more mature; なくちゃ is softer and common among young speakers.',
    functions: ['necessary-obligation'],
    examples: [
      ex('明日 早いから、もう 寝ないと。', "I've got an early start tomorrow, so I have to sleep now.", 'あした はやいから、もう ねないと。'),
      ex('レポート、今日中に 出さなくちゃ。', 'I have to hand in the report today.', 'れぽーと、きょうじゅうに ださなくちゃ。'),
    ],
  },
  'n3m-g-f38640': {
    meaning: 'will not (even try to) ~; refuse to ~',
    structure: 'V-volitional + と しない',
    explanation:
      'ようとしない describes someone else’s refusal or unwillingness: 彼は謝ろうとしない "he won’t apologise". It is used for third persons, not oneself, and often carries frustration.',
    functions: ['negative', 'refuse'],
    examples: [
      ex('息子は 何度 言っても 勉強しようと しない。', "However many times I tell him, my son won't study.", 'むすこは なんど いっても べんきょうしようと しない。'),
      ex('彼は 自分の 間違いを 認めようと しない。', 'He refuses to admit his mistake.', 'かれは じぶんの まちがいを みとめようと しない。'),
    ],
  },
  'n3m-g-e2e614': {
    meaning: 'but; however (casual)',
    structure: 'Plain form + だけど ／ Sentence。だけど、…',
    explanation:
      'だけど is a casual "but", used between clauses or at the start of a sentence. でも is similar at the start of a sentence; けど alone follows verbs and adjectives, while だけど follows nouns and な-adjectives.',
    functions: ['contrast'],
    examples: [
      ex('この 服、きれいだけど、ちょっと 高い。', "These clothes are pretty, but a bit expensive.", 'この ふく、きれいだけど、ちょっと たかい。'),
      ex('行きたい。だけど、お金が ない。', "I want to go. But I don't have the money.", 'いきたい。だけど、おかねが ない。'),
    ],
  },
  'n3m-g-24ec0a': {
    meaning: 'and; also; (N1 と N2) together with',
    structure: 'N1 と N2 ／ Sentence。それと、+ addition',
    explanation:
      'At the start of a sentence, それと adds another item, often an afterthought: それと、明日は休みです "oh, and tomorrow is a holiday". It is conversational; in writing, また or さらに is used.',
    functions: ['add'],
    examples: [
      ex('パンを 買って きて。それと、卵も。', 'Can you buy some bread? Oh, and eggs too.', 'ぱんを かって きて。それと、たまごも。'),
      ex('資料は 机の 上です。それと、会議室の 鍵も 置いて おきました。', 'The documents are on the desk. Also, I left the meeting room key there.', 'しりょうは つくえの うえです。それと、かいぎしつの かぎも おいて おきました。'),
    ],
  },
  'n3m-g-4821bc': {
    meaning: 'never (will / would)',
    structure: '決して（けっして）+ V-ない（ません）',
    explanation:
      '決して with a negative expresses a strong refusal or promise: 決して諦めない "I will never give up". It is formal and emphatic. It cannot be used with affirmatives; 必ず is the positive counterpart for "without fail".',
    functions: ['emphasize-negative', 'determination-decision'],
    examples: [
      ex('どんなに 苦しくても、決して あきらめない。', 'However hard it gets, I will never give up.', 'どんなに くるしくても、けっして あきらめない。'),
      ex('この ことは 決して 誰にも 話しません。', 'I will never tell anyone about this.', 'この ことは けっして だれにも はなしません。'),
    ],
  },
  'n3m-g-df7dab': {
    meaning: '(someone) said ~; I hear ~ (casual quote)',
    structure: 'Plain form + って（言ってた／さ）',
    explanation:
      'って is the casual quotation marker, replacing と or という: 明日休みだって "I hear tomorrow’s a holiday". At the end of a sentence it reports what someone said. It also marks a topic: 田中さんって誰? "who’s this Tanaka?".',
    functions: ['heard', 'speak'],
    examples: [
      ex('田中さん、今日は 来ないって。', "Tanaka says he's not coming today.", 'たなかさん、きょうは こないって。'),
      ex('あの 映画、すごく 面白いって 聞いたよ。', 'I heard that film is really good.', 'あの えいが、すごく おもしろいって きいたよ。'),
    ],
  },
  'n3m-g-7b5ae3': {
    meaning: 'I was sure that ~ (but I was wrong)',
    structure: 'Plain form + と ばかり 思って いた',
    explanation:
      'とばかり思っていた says the speaker firmly believed something that turned out false: 休みだとばかり思っていた "I was convinced it was a holiday". ばかり stresses that no other possibility was considered. The correction usually follows.',
    functions: ['unexpected-outcome', 'judge'],
    examples: [
      ex('今日は 休みだと ばかり 思って いた。', 'I was sure today was a day off.', 'きょうは やすみだと ばかり おもって いた。'),
      ex('彼は 独身だと ばかり 思って いたが、結婚して いた。', 'I had been convinced he was single, but he was married.', 'かれは どくしんだと ばかり おもって いたが、けっこんして いた。'),
    ],
  },
  'n3m-g-525366': {
    meaning: 'I get the feeling that ~; it feels like ~',
    structure: 'Plain form (Na な／N の) + ような 感じが する',
    explanation:
      'ような感じがする reports a sensory or intuitive impression: 誰かに見られているような感じがする. It is close to ような気がする, but 感じ leans toward something sensed physically or atmospherically, 気 toward a hunch.',
    functions: ['feel', 'similarity-degree'],
    examples: [
      ex('この 部屋は 少し 寒い ような 感じが する。', 'This room feels a little cold.', 'この へやは すこし さむい ような かんじが する。'),
      ex('初めて 来たのに、懐かしい ような 感じが した。', 'Though it was my first visit, it felt somehow familiar.', 'はじめて きたのに、なつかしい ような かんじが した。'),
    ],
  },
  'n3m-g-f9ab7b': {
    meaning: 'neither ~ nor ~; (V も V-ない) not even ~',
    structure: 'N も N も ない ／ V-ます stem + も + しない',
    explanation:
      'も〜もない with two nouns rules out both: 家族も友達もいない. With a verb stem and しない, it stresses not doing even the basic action: 見もしないで捨てた "threw it away without even looking". The tone is emphatic.',
    functions: ['emphasize-negative'],
    examples: [
      ex('この 町には 駅も バス停も ない。', 'This town has neither a station nor a bus stop.', 'この まちには えきも ばすていも ない。'),
      ex('彼は 手紙を 読みも しないで 捨てた。', 'He threw the letter away without even reading it.', 'かれは てがみを よみも しないで すてた。'),
    ],
  },
  'n3m-g-792790': {
    meaning: 'something called ~ (unsure); (quoting) something like ~',
    structure: 'N + とか（いう）+ N ／ Quote + とか（言って いた）',
    explanation:
      'とか(いう) signals uncertainty about a name or quote: 田中とかいう人 "someone called Tanaka or something", 来ないとか言っていた "said something about not coming". It distances the speaker from the exact wording.',
    functions: ['vague', 'heard'],
    examples: [
      ex('さっき、山田とか いう 人から 電話が あったよ。', 'Someone called Yamada or something phoned earlier.', 'さっき、やまだとか いう ひとから でんわが あったよ。'),
      ex('彼女は 明日は 忙しいとか 言って いた。', 'She said something about being busy tomorrow.', 'かのじょは あしたは いそがしいとか いって いた。'),
    ],
  },
  'n3m-g-57727e': {
    meaning: 'at present; currently; (as of) now',
    structure: '現在（げんざい）+ clause ／ Time + 現在',
    explanation:
      '現在 is a formal "now", used in reports, news and documents: 現在、調査中です. After a date it means "as of": 四月一日現在 "as of April 1". In conversation 今 is more natural.',
    functions: ['time'],
    examples: [
      ex('現在、エレベーターは 点検中です。', 'The lift is currently under inspection.', 'げんざい、えれべーたーは てんけんちゅうです。'),
      ex('三月 一日 現在の 会員数は 五百人です。', 'As of March 1, there are five hundred members.', 'さんがつ ついたち げんざいの かいいんすうは ごひゃくにんです。'),
    ],
  },
  'n3m-g-16b67e': {
    meaning: 'not at all; (still) not in the slightest',
    structure: '一向に（いっこうに）+ negative',
    explanation:
      '一向に〜ない says something expected is not happening at all, often despite waiting or effort: 雨が一向にやまない "the rain shows no sign of stopping". It carries frustration and is slightly formal.',
    functions: ['emphasize-negative', 'continuity'],
    examples: [
      ex('薬を 飲んでも、熱が 一向に 下がらない。', "Even with the medicine, my fever isn't going down at all.", 'くすりを のんでも、ねつが いっこうに さがらない。'),
      ex('何度 頼んでも、一向に 直して くれない。', 'However many times I ask, they never fix it.', 'なんど たのんでも、いっこうに なおして くれない。'),
    ],
  },
  'n3m-g-0ec3e5': {
    meaning: 'compared with ~ (written 比べ)',
    structure: 'N + に 比べて（に 比べ）, …',
    explanation:
      'に比べ is the written continuative form of に比べて, common in reports and articles: 昨年に比べ、売り上げが伸びた. The meaning is the same; the shorter form sounds more formal.',
    functions: ['compare'],
    examples: [
      ex('昨年に 比べ、今年は 観光客が 増えた。', 'Compared with last year, tourist numbers have risen this year.', 'さくねんに くらべ、ことしは かんこうきゃくが ふえた。'),
      ex('兄に 比べて、弟は おとなしい。', 'Compared with his older brother, the younger one is quiet.', 'あにに くらべて、おとうとは おとなしい。'),
    ],
  },
  'n3m-g-0b9ba9': {
    meaning: 'toward ~; in response to ~; in contrast to ~',
    structure: 'N に 対して（に 対する + N）',
    explanation:
      'に対して marks the target of an attitude or action (先生に対して失礼だ "rude to the teacher"), and with a clause it contrasts two things (兄が静かなのに対して、弟は元気だ). に対する + N modifies a noun: 質問に対する答え.',
    functions: ['direction', 'contrast'],
    examples: [
      ex('目上の 人に 対して、その 言い方は 失礼だ。', 'That way of speaking is rude toward someone senior.', 'めうえの ひとに たいして、その いいかたは しつれいだ。'),
      ex('兄が 静かなのに 対して、弟は とても にぎやかだ。', 'While the older brother is quiet, the younger one is very lively.', 'あにが しずかなのに たいして、おとうとは とても にぎやかだ。'),
    ],
  },
  'n3m-g-226a78': {
    meaning: 'not (even) a little; not at all',
    structure: '少しも（すこしも）+ negative',
    explanation:
      '少しも〜ない denies something completely: 少しも疲れていない "I’m not tired at all". It is neutral and slightly more formal than ちっとも. It emphasises that there is not even a small amount.',
    functions: ['emphasize-negative'],
    examples: [
      ex('一日中 歩いたが、少しも 疲れて いない。', "I walked all day, but I'm not tired at all.", 'いちにちじゅう あるいたが、すこしも つかれて いない。'),
      ex('彼の 言う ことは 少しも 信用できない。', 'I cannot trust a word he says.', 'かれの いう ことは すこしも しんようできない。'),
    ],
  },
  'n3m-g-5a9946': {
    meaning: 'not until ~ (did I realise / could I …)',
    structure: 'V-て + は じめて（初めて）',
    explanation:
      'てはじめて marks an experience that led to a first realisation: 親になって初めて親の気持ちが分かった "only when I became a parent did I understand my parents". The second half is a realisation or new ability, not an intention.',
    functions: ['time-sequence', 'limit'],
    examples: [
      ex('親に なって 初めて、親の 苦労が 分かった。', 'Only after becoming a parent did I understand my parents’ hardships.', 'おやに なって はじめて、おやの くろうが わかった。'),
      ex('失って 初めて、その 大切さに 気づいた。', 'I only realised how precious it was after losing it.', 'うしなって はじめて、その たいせつさに きづいた。'),
    ],
  },
  'n3m-g-21398a': {
    meaning: 'not at all; utterly not',
    structure: '全く（まったく）+ negative',
    explanation:
      '全く〜ない is a strong, slightly formal "not at all": 全く知らなかった "I had no idea". It is common in writing, where 全然 would sound too casual. As an exclamation, まったく! shows exasperation.',
    functions: ['emphasize-negative'],
    examples: [
      ex('そんな 話は 全く 知らなかった。', 'I knew nothing at all about that.', 'そんな はなしは まったく しらなかった。'),
      ex('この 薬は 全く 効かなかった。', 'This medicine did not work at all.', 'この くすりは まったく きかなかった。'),
    ],
  },
  'n3m-g-519362': {
    meaning: '(X) means ~; the thing is ~',
    structure: 'X と 言うのは（とは）+ definition ／（sentence-initial）と 言うのは、+ reason',
    explanation:
      'と言うのは introduces a definition or explanation of a word: 「ドタキャン」と言うのは、直前にキャンセルすることだ. Opening a sentence, it gives the reason for the previous statement, like "the thing is". This record is the kanji spelling of というのは.',
    functions: ['definition', 'explain'],
    examples: [
      ex('「ドタキャン」と 言うのは、直前に 約束を 取り消す ことだ。', '"Dotakyan" means cancelling at the last minute.', '「どたきゃん」と いうのは、ちょくぜんに やくそくを とりけす ことだ。'),
      ex('今日は 早退します。と 言うのは、子供が 熱を 出したんです。', "I'm leaving early today. The thing is, my child has a fever.", 'きょうは そうたいします。と いうのは、こどもが ねつを だしたんです。'),
    ],
  },
  'n3m-g-293fd8': {
    meaning: 'considering ~; for (someone / something) ~ (unexpectedly)',
    structure: 'Plain form (Na な／N の) + わりに（は）',
    explanation:
      'わりに says the result is not what the premise would suggest: 値段のわりにおいしい "tasty for the price", 年のわりに若く見える. The surprise can be positive or negative. On its own, わりと means "relatively".',
    functions: ['unexpected-outcome', 'compare'],
    examples: [
      ex('この 店は 値段の わりに おいしい。', 'This place is tasty for the price.', 'この みせは ねだんの わりに おいしい。'),
      ex('よく 勉強した わりには、点数が 低かった。', 'For all the studying I did, my score was low.', 'よく べんきょうした わりには、てんすうが ひくかった。'),
    ],
  },
  'n3m-g-2c78d9': {
    meaning: 'may; might; perhaps',
    structure: 'Plain form (N／Na without だ) + かも しれない（かもしれません）',
    explanation:
      'かもしれない expresses a possibility of about fifty percent or less: 雨が降るかもしれない. It attaches directly to nouns and な-adjectives without だ. In speech it shortens to かも. でしょう and だろう are more confident.',
    functions: ['speculation'],
    examples: [
      ex('午後から 雨が 降るかも しれない。', 'It may rain from the afternoon.', 'ごごから あめが ふるかも しれない。'),
      ex('あの 人は 先生かも しれませんね。', 'That person might be a teacher.', 'あの ひとは せんせいかも しれませんね。'),
    ],
  },
  'n3m-g-ba2f5e': {
    meaning: 'although I say ~, (actually) …',
    structure: 'Plain form／N + と 言っても',
    explanation:
      'と言っても qualifies the previous statement so the listener does not overestimate it: 料理ができると言っても、卵焼きくらいだ "I can cook, but it’s only omelettes". This record is the kanji spelling of といっても.',
    functions: ['concessions', 'corrections'],
    examples: [
      ex('海外に 住んで いたと 言っても、半年だけです。', 'I say I lived abroad, but it was only for six months.', 'かいがいに すんで いたと いっても、はんとしだけです。'),
      ex('忙しいと 言っても、週末は 休めます。', "I'm busy, but I do get weekends off.", 'いそがしいと いっても、しゅうまつは やすめます。'),
    ],
  },
  'n3m-g-4508d2': {
    meaning: 'instead of ~; in exchange for ~',
    structure: 'N の／V + 代わりに',
    explanation:
      '代わりに has two senses: substitution (父の代わりに私が行く "I’ll go in my father’s place") and exchange (英語を教える代わりに日本語を教えてもらう "teach English in return for Japanese lessons"). Context decides which.',
    functions: ['selective'],
    examples: [
      ex('母の 代わりに、私が 買い物に 行った。', 'I went shopping in place of my mother.', 'ははの かわりに、わたしが かいものに いった。'),
      ex('料理を 作る 代わりに、洗い物は お願いね。', "I'll cook, and in return you do the washing up.", 'りょうりを つくる かわりに、あらいものは おねがいね。'),
    ],
  },
  'n3m-g-c69b0d': {
    meaning: 'in other words; that is to say; in short',
    structure: 'つまり、+ restatement ／ A、つまり B',
    explanation:
      'つまり restates or sums up what was said in a clearer or shorter way: 母の姉、つまりおばです. It often closes a discussion with a conclusion: つまり、行けないということですね. すなわち is the formal written equivalent.',
    functions: ['explain', 'conclude'],
    examples: [
      ex('彼は 母の 兄、つまり 私の おじです。', "He is my mother's older brother, in other words my uncle.", 'かれは ははの あに、つまり わたしの おじです。'),
      ex('つまり、明日は 来られないと いう ことですね。', "So, in short, you can't come tomorrow?", 'つまり、あしたは こられないと いう ことですね。'),
    ],
  },
  'n3m-g-60f100': {
    meaning: 'to pretend (to ~); to act as if',
    structure: 'V／Adj／N の + ふりを する',
    explanation:
      'ふりをする means acting in a way that is not true: 知らないふりをする "pretend not to know", 寝たふりをする "pretend to be asleep". It implies deliberate deception, unlike ように見える.',
    functions: ['act'],
    examples: [
      ex('話しかけられたくなくて、寝た ふりを した。', "I didn't want to be spoken to, so I pretended to be asleep.", 'はなしかけられたくなくて、ねた ふりを した。'),
      ex('彼は 本当は 知って いるのに、知らない ふりを して いる。', 'He actually knows, but he is pretending not to.', 'かれは ほんとうは しって いるのに、しらない ふりを して いる。'),
    ],
  },
  'n3m-g-510ada': {
    meaning: 'passive for facts and information (is ~ed)',
    structure: 'N は／が + V-passive（〜られる／〜れる）(agent often omitted or に よって)',
    explanation:
      'In news, textbooks and notices, the passive presents facts without naming who acted: この寺は八世紀に建てられた, 会議は来週開かれる. When the agent matters, it is marked with によって rather than に. This impersonal passive is common in formal Japanese.',
    functions: ['passive'],
    examples: [
      ex('この 寺は 八世紀に 建てられた。', 'This temple was built in the eighth century.', 'この てらは はっせいきに たてられた。'),
      ex('次の オリンピックは どこで 開かれますか。', 'Where will the next Olympics be held?', 'つぎの おりんぴっくは どこで ひらかれますか。'),
    ],
  },
  'n3m-g-54f5f5': {
    meaning: 'half-~; start to ~ (and stop); be about to ~',
    structure: 'V-ます stem + かける（かけの + N）',
    explanation:
      'かける after a stem means an action is started but not finished: 読みかける, 言いかける. With verbs of sudden change, it means "about to": 死にかける "be on the verge of death". かけの + N describes the half-done object.',
    functions: ['halfway'],
    examples: [
      ex('コーヒーを 飲みかけた とき、電話が 鳴った。', 'Just as I started to drink my coffee, the phone rang.', 'こーひーを のみかけた とき、でんわが なった。'),
      ex('忘れかけて いた 約束を 思い出した。', 'I remembered a promise I had almost forgotten.', 'わすれかけて いた やくそくを おもいだした。'),
    ],
  },
  'n3m-g-b5be72': {
    meaning: 'even if ~ had happened, (it) would still have …',
    structure: 'V-て／Adj-くて + も, … + V-た だろう',
    explanation:
      'A counterfactual concession about the past: 急いでも間に合わなかっただろう "even if we had hurried, we probably wouldn’t have made it". The speaker reflects that the outcome was unavoidable.',
    functions: ['concessions', 'speculation'],
    examples: [
      ex('タクシーに 乗っても、間に合わなかった だろう。', 'Even if we had taken a taxi, we would not have made it.', 'たくしーに のっても、まにあわなかった だろう。'),
      ex('誰が やっても、同じ 結果に なった だろう。', 'Whoever had done it, the result would probably have been the same.', 'だれが やっても、おなじ けっかに なった だろう。'),
    ],
  },
  'n3m-g-f3a34e': {
    meaning: 'suitable for ~; facing ~',
    structure: 'N + 向き（だ／の + N）；direction + 向き',
    explanation:
      '向き after a group means "suited to": 子供向きの本 "a book suitable for children" (it happens to suit them). After a direction it means facing: 南向きの部屋 "a south-facing room". Compare 向け, which means "made for" a target.',
    functions: ['direction', 'purpose-target'],
    examples: [
      ex('この 部屋は 南向きで、日当たりが いい。', 'This room faces south and gets lots of sun.', 'この へやは みなみむきで、ひあたりが いい。'),
      ex('この 料理は 辛いので、子供向きでは ない。', "This dish is spicy, so it isn't suitable for children.", 'この りょうりは からいので、こどもむきでは ない。'),
    ],
  },
  'n3m-g-60f30c': {
    meaning: 'it may be one thing for ~, but …',
    structure: 'N なら いざ知らず, …',
    explanation:
      'ならいざ知らず concedes that something might be excusable for one case but not for another: 子供ならいざ知らず、大人がそんなことをするとは "it’s one thing for a child, but an adult doing that…". It is formal and critical.',
    functions: ['contrast', 'criticize'],
    examples: [
      ex('子供なら いざ知らず、大人が そんな ことを するなんて。', "It might be forgivable in a child, but for an adult to do that!", 'こどもなら いざしらず、おとなが そんな ことを するなんて。'),
      ex('初心者なら いざ知らず、プロが この ミスは ひどい。', "A beginner, perhaps, but for a pro this mistake is terrible.", 'しょしんしゃなら いざしらず、ぷろが この みすは ひどい。'),
    ],
  },
  'n3m-g-9b877d': {
    meaning: 'to ~ again; to redo ~',
    structure: 'V-ます stem + 直す（なおす）',
    explanation:
      '直す after a stem means redoing something to correct or improve it: 書き直す "rewrite", 考え直す "reconsider", やり直す "start over". It implies the first attempt was unsatisfactory, unlike もう一度, which just repeats.',
    functions: ['repeat-habits', 'corrections'],
    examples: [
      ex('間違いが 多かったので、レポートを 書き直した。', 'There were many mistakes, so I rewrote the report.', 'まちがいが おおかったので、れぽーとを かきなおした。'),
      ex('もう 一度 よく 考え直して ください。', 'Please think it over again carefully.', 'もう いちど よく かんがえなおして ください。'),
    ],
  },
  'n3m-g-11a4db': {
    meaning: 'even if it means ~ing',
    structure: 'V-て + でも',
    explanation:
      'てでも shows determination to achieve something even by extreme means: 借金してでも留学したい "I want to study abroad even if I have to borrow money". The first part is a drastic measure; the second a strong wish or intention.',
    functions: ['determination-decision', 'concessions'],
    examples: [
      ex('徹夜してでも、明日までに 終わらせる。', "I'll finish it by tomorrow even if I have to stay up all night.", 'てつやしてでも、あしたまでに おわらせる。'),
      ex('並んででも、あの 店の ラーメンが 食べたい。', "I want to eat the ramen at that shop even if I have to queue.", 'ならんででも、あの みせの らーめんが たべたい。'),
    ],
  },
  'n3m-g-861360': {
    meaning: 'if you (are going to) ~, then (do …)',
    structure: 'Plain form + (の)なら, … + imperative／advice',
    explanation:
      'なら followed by a command or advice tells the listener what to do given their situation or plan: 行くなら早く行け "if you’re going, go quickly". Unlike たら, なら allows the main action to come before the condition: 旅行するなら、保険に入っておけ.',
    functions: ['condition', 'advice'],
    examples: [
      ex('文句が あるなら、はっきり 言え。', 'If you have a complaint, say it clearly.', 'もんくが あるなら、はっきり いえ。'),
      ex('海外に 行くなら、保険に 入って おきなさい。', "If you're going abroad, take out insurance first.", 'かいがいに いくなら、ほけんに はいって おきなさい。'),
    ],
  },
  'n3m-g-ddfc0c': {
    meaning: 'to behave properly; to straighten up',
    structure: 'ちゃんと する（ちゃんと しなさい／ちゃんと した + N）',
    explanation:
      'ちゃんとする means behaving or doing things as one should: ちゃんとしなさい "behave yourself". As a noun modifier, ちゃんとした means "proper, decent": ちゃんとした服 "decent clothes". It is conversational.',
    functions: ['evaluate', 'act'],
    examples: [
      ex('お客さんが 来るから、ちゃんと しなさい。', "We have guests coming, so behave yourself.", 'おきゃくさんが くるから、ちゃんと しなさい。'),
      ex('面接には ちゃんと した 服で 行った ほうが いい。', "You'd better wear proper clothes to the interview.", 'めんせつには ちゃんと した ふくで いった ほうが いい。'),
    ],
  },
  'n3m-g-c4ff8d': {
    meaning: 'probably ~ed; must have ~ (old-fashioned)',
    structure: 'V-た + ろう（＝ただろう）',
    explanation:
      'たろう is a contracted, somewhat old-fashioned form of ただろう: 疲れたろう "you must be tired". It is heard from older speakers and in fiction, and sounds warm or masculine. Modern speech prefers ただろう or たでしょう.',
    functions: ['speculation'],
    examples: [
      ex('長い 旅で、さぞ 疲れたろう。', 'You must be very tired after your long journey.', 'ながい たびで、さぞ つかれたろう。'),
      ex('さっきの 地震、驚いたろう。', 'That earthquake just now must have given you a fright.', 'さっきの じしん、おどろいたろう。'),
    ],
  },
  'n3m-g-7ccd68': {
    meaning: 'as much as ~; all that ~',
    structure: 'V-dict／V-potential + だけ + V',
    explanation:
      'だけ after a verb sets the upper limit of an action: 食べられるだけ食べる "eat as much as you can", できるだけ早く "as soon as possible". It expresses doing something to the full extent possible.',
    functions: ['limit', 'amount'],
    examples: [
      ex('好きな だけ 食べて ください。', 'Please eat as much as you like.', 'すきな だけ たべて ください。'),
      ex('できる だけ 早く 返事を ください。', 'Please reply as soon as possible.', 'できる だけ はやく へんじを ください。'),
    ],
  },
  'n3m-g-4cef3d': {
    meaning: 'not (classical negative ぬ)',
    structure: 'V-ない stem + ぬ（知らぬ・言わぬ）；する → せぬ',
    explanation:
      'ぬ is the classical negative, surviving in proverbs, set phrases and literary style: 知らぬ間に "before one knew it", 言わぬが花 "better left unsaid". It is equivalent to ない and sounds old or solemn.',
    functions: ['negative'],
    examples: [
      ex('知らぬ 間に、雪が 積もって いた。', 'Before I knew it, snow had piled up.', 'しらぬ まに、ゆきが つもって いた。'),
      ex('見知らぬ 人から 手紙が 届いた。', 'A letter arrived from a stranger.', 'みしらぬ ひとから てがみが とどいた。'),
    ],
  },
  'n3m-g-1b7afd': {
    meaning: 'cannot possibly ~; by no means',
    structure: 'とても + V-potential negative（とても 無理だ）',
    explanation:
      'とても with a negative potential says something is far beyond one’s ability: とても一人では運べない "there’s no way I can carry it alone". This use of とても differs from "very" with positive adjectives.',
    functions: ['ability', 'emphasize-negative'],
    examples: [
      ex('この 量は、一人では とても 食べられない。', "There's no way I can eat this much on my own.", 'この りょうは、ひとりでは とても たべられない。'),
      ex('そんな 大金、私には とても 払えません。', 'I could not possibly pay that much money.', 'そんな たいきん、わたしには とても はらえません。'),
    ],
  },
  'n3m-t-ch-s-l-ng-f79569': {
    title: 'N 以下＋数量詞',
    meaning: '(with N at the head) ~ people in all',
    structure: 'Person（leader）+ 以下 + number + 名（人）',
    explanation:
      '以下 after a leader’s title groups the leader with the members under them: 社長以下十名が出席した "ten people, led by the president, attended". The number includes the leader. It is formal, typical of reports and announcements.',
    functions: ['amount'],
    examples: [
      ex('会議には 社長 以下 十名が 出席した。', 'Ten people, headed by the president, attended the meeting.', 'かいぎには しゃちょう いか じゅうめいが しゅっせきした。'),
      ex('監督 以下 選手 全員が 空港で 出迎えを 受けた。', 'The manager and all the players were welcomed at the airport.', 'かんとく いか せんしゅ ぜんいんが くうこうで でむかえを うけた。'),
    ],
  },
  'n3m-g-62d435': {
    meaning: 'just; once (a softener: ひとつ + request)',
    structure: 'ひとつ + V（て みる／お願いする）',
    explanation:
      'As an adverb, ひとつ softens a request or suggestion: ひとつよろしくお願いします "I’d be grateful for your help". It can also mean "give it a go": ひとつやってみるか "shall I give it a try?". With a negative it means "not even one": 雲ひとつない.',
    functions: ['request', 'emphasize-negative'],
    examples: [
      ex('今後とも ひとつ よろしく お願いします。', 'I look forward to your continued support.', 'こんごとも ひとつ よろしく おねがいします。'),
      ex('今日は 雲 ひとつ ない いい 天気だ。', 'It is a beautiful day without a single cloud.', 'きょうは くも ひとつ ない いい てんきだ。'),
    ],
  },
  'n3m-g-527141': {
    meaning: 'some ~, others …; either ~ or …',
    structure: 'あるいは A、あるいは B',
    explanation:
      'Repeated あるいは lists alternatives or describes varied behaviour among a group: あるいは歌い、あるいは踊る "some sang, some danced". It is literary; in ordinary writing, A または B or A たり B たり is used.',
    functions: ['selective', 'listed'],
    examples: [
      ex('参加者は あるいは 歌い、あるいは 踊り、楽しい 時間を 過ごした。', 'The participants sang or danced and had a good time.', 'さんかしゃは あるいは うたい、あるいは おどり、たのしい じかんを すごした。'),
      ex('申し込みは、あるいは 電話で、あるいは 窓口で 受け付けます。', 'Applications are accepted either by phone or at the counter.', 'もうしこみは、あるいは でんわで、あるいは まどぐちで うけつけます。'),
    ],
  },
  'n3m-g-4122b5': {
    meaning: 'like ~; similar to ~ (casual)',
    structure: 'N + みたいな + N ／ N + みたいに + V',
    explanation:
      'みたい after a noun compares or gives an example: 夢みたいな話 "a dream-like story", 子供みたいに泣く. It is the casual form of のような／のように. It also works as an example-giver: 東京みたいな大都市.',
    functions: ['similarity-degree'],
    examples: [
      ex('まるで 夢 みたいな 話だ。', "It's like a dream.", 'まるで ゆめ みたいな はなしだ。'),
      ex('彼女は 子供 みたいに 笑った。', 'She laughed like a child.', 'かのじょは こども みたいに わらった。'),
    ],
  },
  'n3m-g-2bbe20': {
    meaning: 'should; ought to (before a noun: べき + N)',
    structure: 'V-dict + べき + N ／ べきだった（regret）',
    explanation:
      'べき can modify a noun: 読むべき本 "a book you ought to read", 守るべきルール. べきだった expresses regret about the past: もっと早く言うべきだった "I should have said so sooner". It sounds principled and firm.',
    functions: ['advice', 'regret'],
    examples: [
      ex('これは 学生なら 一度は 読む べき 本だ。', 'This is a book every student should read at least once.', 'これは がくせいなら いちどは よむ べき ほんだ。'),
      ex('もっと 早く 謝る べきだった。', 'I should have apologised sooner.', 'もっと はやく あやまる べきだった。'),
    ],
  },
  'n3m-g-d3a00b': {
    meaning: 'only; since (last); (left) as it is',
    structure: 'N／number + きり ／ V-た + きり（negative）',
    explanation:
      'きり limits: 二人きり "just the two of us". After a past verb with a negative, it means nothing has happened since: 彼とは一度会ったきりだ "I’ve only met him once, and not since". 寝たきり means "bedridden". The casual form is っきり.',
    functions: ['limit', 'continuity'],
    examples: [
      ex('久しぶりに 二人きりで 話した。', 'We talked, just the two of us, for the first time in a while.', 'ひさしぶりに ふたりきりで はなした。'),
      ex('彼は 朝 出かけた きり、まだ 帰って こない。', "He went out this morning and still hasn't come back.", 'かれは あさ でかけた きり、まだ かえって こない。'),
    ],
  },
  'n3m-g-810c13': {
    meaning: '-ness (felt quality: 甘み, 楽しみ)',
    structure: 'Adj stem + み（甘み・深み・楽しみ・痛み）',
    explanation:
      'み turns some adjectives into nouns for a quality that is felt or perceived: 甘み "sweetness (as a taste)", 深み "depth", 楽しみ "something to look forward to". It is less productive than さ, which measures degree: 甘さ "degree of sweetness".',
    functions: ['adjective'],
    examples: [
      ex('この トマトは 甘みが 強い。', 'These tomatoes have a strong sweetness.', 'この とまとは あまみが つよい。'),
      ex('夏休みの 旅行が 楽しみです。', 'I am looking forward to the summer holiday trip.', 'なつやすみの りょこうが たのしみです。'),
    ],
  },
  'n3m-g-7e522d': {
    meaning: 'already (formal)',
    structure: 'すでに + V-た／V-ている',
    explanation:
      'すでに is a formal "already", common in writing and announcements: 受付はすでに終了しました. In conversation もう is more natural. It stresses that something happened before the reference time.',
    functions: ['finish', 'time'],
    examples: [
      ex('受付は すでに 終了いたしました。', 'Registration has already closed.', 'うけつけは すでに しゅうりょういたしました。'),
      ex('警察が 着いた ときには、犯人は すでに 逃げて いた。', 'By the time the police arrived, the culprit had already fled.', 'けいさつが ついた ときには、はんにんは すでに にげて いた。'),
    ],
  },
  'n3m-g-ef716e': {
    meaning: 'on purpose; deliberately',
    structure: 'わざと + V',
    explanation:
      'わざと says something was done intentionally, usually something unexpected or mischievous: わざと負ける "lose on purpose". It is often used in apologies or accusations: わざとじゃない "I didn’t mean it". わざわざ, by contrast, means taking trouble.',
    functions: ['intent'],
    examples: [
      ex('ごめん、わざとじゃ ないんだ。', "Sorry, I didn't mean to.", 'ごめん、わざとじゃ ないんだ。'),
      ex('子供に 勝たせる ために、わざと 負けて あげた。', 'I lost on purpose to let the child win.', 'こどもに かたせる ために、わざと まけて あげた。'),
    ],
  },
  'n3m-g-f287b4': {
    meaning: 'I wonder ~; should I ~? (thinking aloud)',
    structure: 'Plain form + かな（あ）／ V-volitional + かな',
    explanation:
      'かな expresses the speaker wondering, often to themselves: 明日晴れるかな. After a volitional it asks oneself whether to do something: そろそろ帰ろうかな. ないかな expresses a wish: 早く来ないかな.',
    functions: ['speculation', 'wish'],
    examples: [
      ex('明日の 試験、大丈夫かな。', "I wonder if tomorrow's exam will go OK.", 'あしたの しけん、だいじょうぶかな。'),
      ex('もう 遅いし、そろそろ 帰ろうかな。', "It's getting late, so maybe I'll head home.", 'もう おそいし、そろそろ かえろうかな。'),
    ],
  },
  'n3m-g-5c14ca': {
    meaning: 'surely not!; no way; (まさか〜とは) never imagined ~',
    structure: 'まさか + clause（ないだろう／とは 思わなかった）',
    explanation:
      'まさか expresses disbelief that something could happen: まさか彼が犯人だとは "I never imagined he’d be the culprit". On its own, まさか! means "no way!". With ないだろう it rules out a possibility: まさか忘れていないよね.',
    functions: ['surprise', 'unexpected-outcome'],
    examples: [
      ex('まさか 彼が 優勝するとは 思わなかった。', 'I never imagined he would win.', 'まさか かれが ゆうしょうするとは おもわなかった。'),
      ex('まさか 約束を 忘れて いないよね。', "You haven't forgotten the promise, have you?", 'まさか やくそくを わすれて いないよね。'),
    ],
  },
  'n3m-g-f03f6f': {
    meaning: 'suddenly; by chance; on a whim',
    structure: 'ふと + V（思い出す・気づく・見る）',
    explanation:
      'ふと describes a thought or action that arises unintentionally: ふと思い出した "it suddenly came back to me", ふと空を見上げた. It is used with verbs of thinking, noticing and looking. 急に means sudden in general, including physical events.',
    functions: ['unexpected-outcome'],
    examples: [
      ex('歩いて いる とき、ふと 昔の 友達を 思い出した。', 'While walking, I suddenly thought of an old friend.', 'あるいて いる とき、ふと むかしの ともだちを おもいだした。'),
      ex('ふと 窓の 外を 見ると、雪が 降って いた。', 'When I happened to look out of the window, it was snowing.', 'ふと まどの そとを みると、ゆきが ふって いた。'),
    ],
  },
  'n3m-g-16868e': {
    meaning: '(more) than ~; rather than ~',
    structure: 'N／V + より も + Adj ／ A よりも B（を 選ぶ）',
    explanation:
      'よりも is an emphatic より, marking the standard of comparison: 誰よりも早く "earlier than anyone". It also marks the rejected option in a preference: 肉よりも魚が好きだ. も makes the comparison stronger.',
    functions: ['compare'],
    examples: [
      ex('彼は 誰よりも 早く 会社に 来る。', 'He gets to the office earlier than anyone.', 'かれは だれよりも はやく かいしゃに くる。'),
      ex('お金よりも 時間の ほうが 大切だ。', 'Time is more precious than money.', 'おかねよりも じかんの ほうが たいせつだ。'),
    ],
  },
  'n3m-g-8b7dc8': {
    meaning: '(someone) shows signs of feeling ~',
    structure: 'Adj stem + がる（がって いる）；V-たい → V-たがる',
    explanation:
      'がる turns an adjective of feeling into a verb that describes someone else’s visible feelings: 寒がる, 怖がる, 欲しがる. Japanese uses it because you cannot state another person’s inner feelings directly. It is not used for yourself.',
    functions: ['feel'],
    examples: [
      ex('子供が 暗い ところを 怖がって いる。', 'The child is scared of dark places.', 'こどもが くらい ところを こわがって いる。'),
      ex('弟は 新しい ゲームを 欲しがって いる。', 'My little brother wants a new game.', 'おとうとは あたらしい げーむを ほしがって いる。'),
    ],
  },
  'n3m-g-35ab5b': {
    meaning: 'only; nothing but (always ~)',
    structure: 'N + ばかり（V）／ N + ばかり + で',
    explanation:
      'ばかり after a noun says there is too much of one thing, usually with criticism: 肉ばかり食べる "eats nothing but meat", 文句ばかり. It differs from だけ, which is a neutral limit. ばかり after numbers means "about".',
    functions: ['limit', 'criticize'],
    examples: [
      ex('弟は 甘い もの ばかり 食べて いる。', 'My little brother eats nothing but sweet things.', 'おとうとは あまい もの ばかり たべて いる。'),
      ex('あの 人は いつも 文句 ばかり 言う。', 'That person always does nothing but complain.', 'あの ひとは いつも もんく ばかり いう。'),
    ],
  },
};

import type { GrammarExample } from '../types';
import type { AuthoredGrammarContent } from '../authoredContent';

const ex = (jp: string, en: string, reading?: string): GrammarExample =>
  reading ? { jp, reading, en } : { jp, en };

/** Authored content for hollow N2 supplement records (see authoredContent.ts). */
export const AUTHORED_N2: Record<string, AuthoredGrammarContent> = {
  'n2m-g-31f6cd': {
    meaning: 'can; is possible (that) ~ (formal)',
    structure: 'V-ます stem + 得る（える／うる）',
    explanation:
      '得る after a verb stem expresses possibility, often in formal or written style: 起こり得る "could happen", 考え得る "conceivable". The dictionary form is read うる or える, but other forms use え: 得ない, 得た. It describes possibility rather than personal ability.',
    functions: ['ability', 'speculation'],
    examples: [
      ex('地震は いつでも 起こり得る。', 'An earthquake could happen at any time.', 'じしんは いつでも おこりうる。'),
      ex('考え得る 方法は 全て 試した。', 'We tried every conceivable method.', 'かんがえうる ほうほうは すべて ためした。'),
    ],
  },
  'n2m-g-591e0c': {
    meaning: 'it is thought that ~; it is believed that ~',
    structure: 'Plain form + と 考えられる（と 考えられて いる）',
    explanation:
      'と考えられる presents a reasoned inference; と考えられている reports a widely accepted view. Both avoid naming who thinks so and are standard in academic and news writing: 恐竜は隕石で絶滅したと考えられている.',
    functions: ['judge', 'information-resource'],
    examples: [
      ex('恐竜は 隕石の 衝突で 絶滅したと 考えられて いる。', 'Dinosaurs are thought to have died out because of a meteorite impact.', 'きょうりゅうは いんせきの しょうとつで ぜつめつしたと かんがえられて いる。'),
      ex('この 結果から、薬には 効果が あると 考えられる。', 'From these results, the medicine can be considered effective.', 'この けっかから、くすりには こうかが あると かんがえられる。'),
    ],
  },
  'n2m-g-a09c68': {
    meaning: 'please ~ (formal request, notices)',
    structure: 'お + V-ます stem + 願います（ご + する-noun + 願います）',
    explanation:
      'お〜願います is a formal, somewhat impersonal request used in announcements and signs: お静かに願います "quiet, please", ご協力願います. It is firmer than お〜ください. In face-to-face speech, ください is usually warmer.',
    functions: ['request', 'reverent-humble'],
    examples: [
      ex('館内では お静かに 願います。', 'Please be quiet inside the building.', 'かんないでは おしずかに ねがいます。'),
      ex('ご来場の 皆様の ご協力を お願い いたします。', 'We ask for the cooperation of everyone attending.', 'ごらいじょうの みなさまの ごきょうりょくを おねがい いたします。'),
    ],
  },
  'n2m-g-1fc005': {
    meaning: 'hardly ~; not ~ properly',
    structure: 'ろくに + V-ない（ろくな + N + ない）',
    explanation:
      'ろくに〜ない says something is not done adequately, with criticism or complaint: ろくに寝ていない "haven’t slept properly", ろくに勉強しない. ろくな〜ない means "no decent ~": ろくなものがない.',
    functions: ['negative', 'criticize'],
    examples: [
      ex('忙しくて、ここ 数日 ろくに 寝て いない。', "I've been so busy I've hardly slept these past few days.", 'いそがしくて、ここ すうじつ ろくに ねて いない。'),
      ex('彼は 説明書を ろくに 読まずに 使い始めた。', 'He started using it without reading the manual properly.', 'かれは せつめいしょを ろくに よまずに つかいはじめた。'),
    ],
  },
  'n2m-g-b8cb69': {
    meaning: 'it seems (that) ~; somehow (managed to)',
    structure: 'どうやら + clause + らしい／ようだ ／ どうやら + V（managed）',
    explanation:
      'どうやら introduces an inference from gathered evidence: どうやら雨が降るらしい "it looks like rain". It can also mean "somehow, barely": どうやら間に合った. It is a little more confident than どうも.',
    functions: ['speculation'],
    examples: [
      ex('どうやら 道に 迷った らしい。', 'It looks like we have got lost.', 'どうやら みちに まよった らしい。'),
      ex('どうやら 締め切りには 間に合いそうだ。', 'It looks as if we will just about meet the deadline.', 'どうやら しめきりには まにあいそうだ。'),
    ],
  },
  'n2m-g-475861': {
    meaning: 'taking ~ as the opportunity; triggered by ~',
    structure: 'N + を きっかけに（を 契機に）',
    explanation:
      'をきっかけに names the event that set off a change: 留学をきっかけに料理を始めた "studying abroad got me into cooking". を契機に is its formal written equivalent. The change is usually a new start or habit.',
    functions: ['point-of-departure-receipt', 'cause-reason'],
    examples: [
      ex('友達の 誘いを きっかけに、ヨガを 始めた。', "A friend's invitation got me started on yoga.", 'ともだちの さそいを きっかけに、よがを はじめた。'),
      ex('今回の 事故を 契機に、安全対策が 見直された。', 'This accident prompted a review of safety measures.', 'こんかいの じこを けいきに、あんぜんたいさくが みなおされた。'),
    ],
  },
  'n2m-g-7ce26a': {
    meaning: 'from the point of view of ~; judging from ~',
    structure: 'N + から 見ると（から 見れば／から 見て／から 見ても）',
    explanation:
      'から見ると sets a standpoint for a judgement: 子供から見ると、大人は自由だ "from a child’s point of view, adults are free". から見ても adds "even from": どこから見ても本物だ "genuine from any angle".',
    functions: ['perspective-way', 'judge'],
    examples: [
      ex('外国人から 見ると、日本の 習慣は 不思議に 見える らしい。', 'From a foreigner’s point of view, Japanese customs apparently look strange.', 'がいこくじんから みると、にほんの しゅうかんは ふしぎに みえる らしい。'),
      ex('どこから 見ても、それは 本物の 絵だ。', 'However you look at it, that is a genuine painting.', 'どこから みても、それは ほんものの えだ。'),
    ],
  },
  'n2m-g-9b08ec': {
    meaning: 'in terms of ~; on (paper / the surface)',
    structure: 'N + 上（じょう）／ N の 上で（は）',
    explanation:
      '上 after Sino-Japanese nouns (read じょう) means "from the standpoint of": 法律上 "legally", 健康上の理由 "for health reasons". の上では means "according to, on the basis of": 計算の上では可能だ.',
    functions: ['perspective-way'],
    examples: [
      ex('健康上の 理由で、仕事を 辞めた。', 'He quit his job for health reasons.', 'けんこうじょうの りゆうで、しごとを やめた。'),
      ex('データの 上では、売り上げは 伸びて いる。', 'According to the data, sales are growing.', 'でーたの うえでは、うりあげは のびて いる。'),
    ],
  },
  'n2m-g-806f32': {
    meaning: 'in addition to ~; on top of ~',
    structure: 'Plain form (Na な／N の) + 上（うえ）に',
    explanation:
      '上に adds a second point in the same direction, good with good or bad with bad: 安い上に質もいい "cheap, and good quality too". Mixing a good and a bad point sounds odd. It is more formal than し.',
    functions: ['add'],
    examples: [
      ex('彼女は 頭が いい 上に、性格も 優しい。', 'She is intelligent and kind-hearted as well.', 'かのじょは あたまが いい うえに、せいかくも やさしい。'),
      ex('今日は 寒い 上に、雨まで 降って きた。', 'It is cold today, and on top of that it has started to rain.', 'きょうは さむい うえに、あめまで ふって きた。'),
    ],
  },
  'n2m-g-360465': {
    meaning: 'judging from ~; from the standpoint of ~',
    structure: 'N + から すると（から すれば／から したら）',
    explanation:
      'からすると gives either evidence for a judgement (あの様子からすると、合格したらしい) or a viewpoint (親からすれば心配だ). It is similar to から見ると but more common with judgements based on signs.',
    functions: ['judge', 'perspective-way'],
    examples: [
      ex('あの 表情から すると、何か いい ことが あった らしい。', 'Judging from that expression, something good must have happened.', 'あの ひょうじょうから すると、なにか いい ことが あった らしい。'),
      ex('親から すれば、子供の 一人暮らしは 心配だ。', 'From a parent’s point of view, a child living alone is a worry.', 'おやから すれば、こどもの ひとりぐらしは しんぱいだ。'),
    ],
  },
  'n2m-g-ea9a33': {
    meaning: 'for (someone); from ~’s point of view',
    structure: 'Person + に したら（に すれば）',
    explanation:
      'にしたら imagines a situation from another person’s perspective, often with empathy: 子供にしたら迷惑な話だ "from the child’s point of view, it’s a nuisance". It is conversational; にすれば is slightly more formal.',
    functions: ['perspective-way'],
    examples: [
      ex('急に 転校させられて、子供に したら たまらない だろう。', 'Being made to change schools suddenly must be hard for a child.', 'きゅうに てんこうさせられて、こどもに したら たまらない だろう。'),
      ex('店に したら、この 値下げは 大きな 損失だ。', 'For the shop, this price cut is a big loss.', 'みせに したら、この ねさげは おおきな そんしつだ。'),
    ],
  },
  'n2m-g-4312a7': {
    meaning: '~ and ~, over and over (repeated cycle)',
    structure: 'V1-て + は + V2, V1-て + は + V2',
    explanation:
      'Repeating ては describes an action pair that recurs: 食べては寝、食べては寝る "eat, sleep, eat, sleep". It often carries a sense of futility or monotony. It is literary.',
    functions: ['repeat-habits'],
    examples: [
      ex('休みの 日は 食べては 寝、食べては 寝る 生活だ。', 'On my days off I just eat and sleep, over and over.', 'やすみの ひは たべては ね、たべては ねる せいかつだ。'),
      ex('書いては 消し、書いては 消して、やっと 手紙が 書けた。', 'Writing and erasing again and again, I finally finished the letter.', 'かいては けし、かいては けして、やっと てがみが かけた。'),
    ],
  },
  'n2m-g-b1ac40': {
    meaning: 'must not ~ (strong, formal prohibition)',
    structure: 'V-て + は ならない',
    explanation:
      'てはならない is a formal, emphatic prohibition, often about moral rules: 人を傷つけてはならない "one must not hurt others". It is stronger and more written than てはいけない, typical of laws, speeches and principles.',
    functions: ['ban'],
    examples: [
      ex('この 悲劇を 決して 忘れては ならない。', 'We must never forget this tragedy.', 'この ひげきを けっして わすれては ならない。'),
      ex('試験中は 他人と 話しては ならない。', 'During the exam you must not talk to others.', 'しけんちゅうは たにんと はなしては ならない。'),
    ],
  },
  'n2m-g-69f9c4': {
    meaning: 'judging from ~; even (starting with) ~',
    structure: 'N + から して',
    explanation:
      'からして takes one aspect, often the most basic, as evidence: 名前からして怪しい "even the name is suspicious". It implies that if this detail is so, the rest must be too. It is often critical.',
    functions: ['judge', 'grounds'],
    examples: [
      ex('あの 店は 看板から して 高そうだ。', 'Even from the sign, that shop looks expensive.', 'あの みせは かんばんから して たかそうだ。'),
      ex('彼は 話し方から して、とても 真面目な 人だと 分かる。', 'You can tell from his way of speaking that he is very serious.', 'かれは はなしかたから して、とても まじめな ひとだと わかる。'),
    ],
  },
  'n2m-g-9b5b4c': {
    meaning: 'generally; mostly; (たいがいにする) within limits',
    structure: 'たいがい + V ／ たいがいに する',
    explanation:
      'たいがい means "mostly, usually", close to たいてい: 休みの日はたいがい家にいる. たいがいにしなさい means "that’s enough, know your limits", a warning against excess.',
    functions: ['frequency'],
    examples: [
      ex('週末は たいがい 家で 過ごして いる。', 'I usually spend weekends at home.', 'しゅうまつは たいがい いえで すごして いる。'),
      ex('冗談も たいがいに しなさい。', "That's enough of your jokes.", 'じょうだんも たいがいに しなさい。'),
    ],
  },
  'n2m-g-6fec3d': {
    meaning: 'if it looks like ~; should ~ turn out to be the case',
    structure: 'Plain form + ようなら（ようだったら）',
    explanation:
      'ようなら sets a condition based on how things develop: 熱が下がらないようなら、病院に行ってください "if your fever doesn’t seem to go down, see a doctor". It is soft and considerate, common in advice.',
    functions: ['condition'],
    examples: [
      ex('痛みが 続く ようなら、また 来て ください。', 'If the pain continues, please come back.', 'いたみが つづく ようなら、また きて ください。'),
      ex('遅れる ようなら、連絡を ください。', 'If it looks like you will be late, please let me know.', 'おくれる ようなら、れんらくを ください。'),
    ],
  },
  'n2m-g-6eb651': {
    meaning: 'usually; mostly; in most cases',
    structure: 'たいてい + V ／ たいていの + N',
    explanation:
      'たいてい describes what happens most of the time: 朝はたいていパンを食べる. As a noun modifier, たいていの人 means "most people". It is neutral and common; ほとんど focuses on quantity rather than frequency.',
    functions: ['frequency'],
    examples: [
      ex('朝ご飯は たいてい パンです。', 'I usually have bread for breakfast.', 'あさごはんは たいてい ぱんです。'),
      ex('たいていの 人は この 答えを 間違える。', 'Most people get this answer wrong.', 'たいていの ひとは この こたえを まちがえる。'),
    ],
  },
  'n2m-g-4aef10': {
    meaning: 'however; nevertheless (formal)',
    structure: 'Sentence。しかしながら、+ contrast',
    explanation:
      'しかしながら is a formal, written "however", common in reports, speeches and letters. It is stronger than しかし and sets up an important reservation. In conversation, でも or けど is used.',
    functions: ['contrast'],
    examples: [
      ex('計画は 順調に 進んで いる。しかしながら、課題も 残って いる。', 'The plan is progressing smoothly. However, some issues remain.', 'けいかくは じゅんちょうに すすんで いる。しかしながら、かだいも のこって いる。'),
      ex('ご提案 ありがとう ございます。しかしながら、今回は 見送らせて いただきます。', 'Thank you for your proposal. However, we will pass on it this time.', 'ごていあん ありがとう ございます。しかしながら、こんかいは みおくらせて いただきます。'),
    ],
  },
  'n2m-g-0f5d14': {
    meaning: 'there is no other way but ~',
    structure: 'V-dict + より ほかに（しか）+ 方法が ない ／ より ほかない',
    explanation:
      'よりほかにない says the only option is the one named: 謝るよりほかに方法がない "there is nothing to do but apologise". It is formal and conveys resignation.',
    functions: ['necessary-obligation', 'limit'],
    examples: [
      ex('ここまで 来たら、前に 進む より ほかに 道は ない。', "Having come this far, there's no way but forward.", 'ここまで きたら、まえに すすむ より ほかに みちは ない。'),
      ex('終電が 出て しまったので、タクシーで 帰る より ほか なかった。', 'The last train had gone, so I had no choice but to take a taxi.', 'しゅうでんが でて しまったので、たくしーで かえる より ほか なかった。'),
    ],
  },
  'n2m-g-66a75b': {
    meaning: 'if anything; rather (on balance)',
    structure: 'どちらかと いうと（どちらかと いえば）、+ preference',
    explanation:
      'どちらかというと gives a mild preference or leaning: どちらかというと夏の方が好きだ "if anything, I prefer summer". It avoids a strong statement and is common in polite conversation.',
    functions: ['compare', 'judge'],
    examples: [
      ex('どちらかと いうと、私は 犬より 猫が 好きだ。', 'If anything, I prefer cats to dogs.', 'どちらかと いうと、わたしは いぬより ねこが すきだ。'),
      ex('彼は どちらかと いえば 静かな 人です。', 'He is, if anything, a quiet person.', 'かれは どちらかと いえば しずかな ひとです。'),
    ],
  },
  'n2m-g-cb13cc': {
    meaning: 'at this rate; if it is like this, (it won’t do)',
    structure: 'これでは + negative result',
    explanation:
      'これでは evaluates a current situation as inadequate: これでは間に合わない "at this rate we won’t make it". It is followed by a negative outcome or complaint. それでは, by contrast, often just means "well then".',
    functions: ['case', 'judge'],
    examples: [
      ex('これでは、締め切りに 間に合わない。', "At this rate, we won't meet the deadline.", 'これでは、しめきりに まにあわない。'),
      ex('こんなに 字が 汚くては、これでは 読めない。', "The handwriting is so messy that I can't read it like this.", 'こんなに じが きたなくては、これでは よめない。'),
    ],
  },
  'n2m-g-caee07': {
    meaning: 'X, if you like (but …); it is ~ in a way, but',
    structure: 'A と いえば A だが, …',
    explanation:
      'Repeating the word with といえば〜が concedes a point half-heartedly before a but: 便利といえば便利だが、高い "it’s convenient, I suppose, but expensive". It shows mixed feelings.',
    functions: ['concessions'],
    examples: [
      ex('簡単と いえば 簡単だが、時間が かかる。', "It's easy enough, I suppose, but it takes time.", 'かんたんと いえば かんたんだが、じかんが かかる。'),
      ex('好きと いえば 好きだが、毎日は 食べたく ない。', "I like it, sort of, but I wouldn't want it every day.", 'すきと いえば すきだが、まいにちは たべたく ない。'),
    ],
  },
  'n2m-g-23ffb5': {
    meaning: 'such as ~; ~ and the like',
    structure: 'N1、N2 と いった + N',
    explanation:
      'といった lists representative examples before a category noun: 京都や奈良といった古い町 "old cities such as Kyoto and Nara". It is somewhat formal and implies there are others. などの is similar.',
    functions: ['for-example', 'denote-by-example'],
    examples: [
      ex('すし、天ぷらと いった 日本料理が 人気だ。', 'Japanese dishes such as sushi and tempura are popular.', 'すし、てんぷらと いった にほんりょうりが にんきだ。'),
      ex('頭痛や 発熱と いった 症状が あれば、すぐ 連絡して ください。', 'If you have symptoms such as headache or fever, contact us immediately.', 'ずつうや はつねつと いった しょうじょうが あれば、すぐ れんらくして ください。'),
    ],
  },
  'n2m-g-6e30cf': {
    meaning: 'just because it is ~, (it doesn’t follow that) …',
    structure: 'N／Na + だ と いって（だからと いって）, … negative',
    explanation:
      'だといって rejects an inference based on a noun or な-adjective: 休日だといって、遅くまで寝ていてはいけない "just because it’s a holiday, you shouldn’t sleep in late". The second half is negative.',
    functions: ['concessions', 'contrast'],
    examples: [
      ex('子供だと いって、何でも 許される わけでは ない。', 'Being a child does not mean anything goes.', 'こどもだと いって、なんでも ゆるされる わけでは ない。'),
      ex('有名だと いって、おいしいとは 限らない。', 'Being famous does not necessarily mean it is good.', 'ゆうめいだと いって、おいしいとは かぎらない。'),
    ],
  },
  'n2m-g-2c8e25': {
    meaning: 'to be about to ~; to be on the point of ~',
    structure: 'V-volitional + と して いる',
    explanation:
      'ようとしている describes something on the verge of happening: 日が沈もうとしている "the sun is about to set". With people it can mean trying: 何か言おうとしている "is trying to say something". It is slightly formal.',
    functions: ['shortly-before', 'intent'],
    examples: [
      ex('長い 冬が 終わろうと して いる。', 'The long winter is about to end.', 'ながい ふゆが おわろうと して いる。'),
      ex('彼は 何か 言おうと して いたが、黙って しまった。', 'He was about to say something but fell silent.', 'かれは なにか いおうと して いたが、だまって しまった。'),
    ],
  },
  'n2m-g-583142': {
    meaning: 'if you ask whether ~, (actually) …',
    structure: 'Clause + か と いうと, …',
    explanation:
      'かというと raises a question and answers it, often against expectation: 高ければいいかというと、そうでもない "if you ask whether more expensive is better, not necessarily". It is common in explanations and essays.',
    functions: ['explain', 'contrast'],
    examples: [
      ex('毎日 勉強して いるかと いうと、実は そうでも ない。', 'If you ask whether I study every day, actually not really.', 'まいにち べんきょうして いるかと いうと、じつは そうでも ない。'),
      ex('人気が あれば いいかと いうと、そう 簡単では ない。', 'Is being popular enough? It is not that simple.', 'にんきが あれば いいかと いうと、そう かんたんでは ない。'),
    ],
  },
  'n2m-g-6172cb': {
    meaning: 'if it is (the case); in that case',
    structure: 'N／Na + だったら ／（sentence-initial）だったら、…',
    explanation:
      'だったら is the conversational "if it is ~": 明日だったら大丈夫 "tomorrow would be fine". At the start of a sentence, it responds to what was just said: だったら、手伝うよ "in that case, I’ll help". It is casual.',
    functions: ['condition'],
    examples: [
      ex('週末だったら、時間が あります。', 'If it is the weekend, I have time.', 'しゅうまつだったら、じかんが あります。'),
      ex('「道が 分からない。」「だったら、一緒に 行こう。」', '"I don’t know the way." "In that case, let’s go together."', '「みちが わからない。」「だったら、いっしょに いこう。」'),
    ],
  },
  'n2m-g-53b94a': {
    meaning: 'cannot (possibly) ~; is impossible',
    structure: 'V-ます stem + 得ない（えない）',
    explanation:
      '得ない is the negative of 得る and says something is impossible: あり得ない "impossible", 理解し得ない. It is formal; in speech, あり得ない is also a common exclamation of disbelief.',
    functions: ['ability', 'negative'],
    examples: [
      ex('そんな ことは あり得ない。', 'That is impossible.', 'そんな ことは ありえない。'),
      ex('今の 技術では、それは 実現し得ない。', 'With current technology, that cannot be achieved.', 'いまの ぎじゅつでは、それは じつげんしえない。'),
    ],
  },
  'n2m-g-b43a02': {
    meaning: 'costing as much as ~; (からする) at least ~',
    structure: 'Number／price + から する',
    explanation:
      'からする after a price says something costs that much or more: 十万円からするバッグ "a bag costing a hundred thousand yen or more". It stresses that the amount is large and is a lower bound.',
    functions: ['amount'],
    examples: [
      ex('この 時計は 百万円 から する。', 'This watch costs a million yen or more.', 'この とけいは ひゃくまんえん から する。'),
      ex('十万円 から する ワインを 贈られた。', 'I was given a bottle of wine worth over a hundred thousand yen.', 'じゅうまんえん から する わいんを おくられた。'),
    ],
  },
  'n2m-g-5e1cbf': {
    meaning: 'cannot ~ completely; too much to ~',
    structure: 'V-ます stem + きれない',
    explanation:
      'きれない says an action cannot be carried through because there is too much or the feeling is too strong: 食べきれない, 数えきれない, 待ちきれない. The positive きれる means "can do completely".',
    functions: ['ability', 'negative'],
    examples: [
      ex('料理が 多すぎて、食べきれない。', "There's too much food; I can't finish it.", 'りょうりが おおすぎて、たべきれない。'),
      ex('感謝しても しきれない ほど、お世話に なった。', 'You have done more for me than I can ever thank you for.', 'かんしゃしても しきれない ほど、おせわに なった。'),
    ],
  },
  'n2m-g-9797ce': {
    meaning: 'I should have ~ (regret, literary)',
    structure: 'V-dict + のだった（んだった）',
    explanation:
      'のだった after a dictionary verb expresses regret about a choice not made: もっと勉強するのだった "I should have studied more". It is a little literary; ばよかった is the everyday equivalent.',
    functions: ['regret'],
    examples: [
      ex('こんなに 混むなら、もっと 早く 来るのだった。', 'If it was going to be this crowded, I should have come earlier.', 'こんなに こむなら、もっと はやく くるのだった。'),
      ex('あの 時、本当の ことを 言うのだった。', 'I should have told the truth back then.', 'あの とき、ほんとうの ことを いうのだった。'),
    ],
  },
  'n2m-g-8b9d69': {
    meaning: "can't bring oneself to ~; can't bear to ~",
    structure: 'V-volitional + に も + V-potential negative',
    explanation:
      'This pattern says someone wants to act but cannot because of circumstances: 帰ろうにも帰れない "I want to go home but can’t". The same verb appears twice, first in the volitional. It expresses frustration.',
    functions: ['ability', 'negative'],
    examples: [
      ex('電車が 止まって、帰ろうに も 帰れない。', "The trains have stopped, so I can't get home even if I want to.", 'でんしゃが とまって、かえろうに も かえれない。'),
      ex('熱が あって、起きように も 起きられない。', "I have a fever and can't get up even if I try.", 'ねつが あって、おきようにも おきられない。'),
    ],
  },
  'n2m-g-78644d': {
    meaning: 'in; at; in the field of ~ (formal)',
    structure: 'N + に おける + N（に おいて + V）',
    explanation:
      'における is the formal noun-modifying form of において, "in, at, regarding": 日本における教育 "education in Japan". It is typical of academic and official writing; in conversation, での is used.',
    functions: ['place', 'range'],
    examples: [
      ex('日本に おける 外国人 労働者の 数は 増えて いる。', 'The number of foreign workers in Japan is increasing.', 'にほんに おける がいこくじん ろうどうしゃの かずは ふえて いる。'),
      ex('会議に おける 発言には 注意して ください。', 'Please be careful about what you say in the meeting.', 'かいぎに おける はつげんには ちゅういして ください。'),
    ],
  },
  'n2m-g-7c2e9d': {
    meaning: 'surely ~ would have (but …); if only ~',
    structure: 'Plain form + だろうに',
    explanation:
      'だろうに expresses regret or sympathy about something that would have happened or might be the case: 言ってくれれば手伝っただろうに "I would have helped if you’d told me". It often implies criticism or pity.',
    functions: ['speculation', 'regret'],
    examples: [
      ex('もっと 早く 相談して くれれば、力に なれただろうに。', 'If you had consulted me sooner, I could surely have helped.', 'もっと はやく そうだんして くれれば、ちからに なれただろうに。'),
      ex('一人で 大変だっただろうに、よく 頑張ったね。', 'It must have been hard on your own, but you did so well.', 'ひとりで たいへんだっただろうに、よく がんばったね。'),
    ],
  },
  'n2m-g-e8b8d2': {
    meaning: 'it is not (particularly) ~; neither ~ nor …',
    structure: 'N／Na + でも ない ／ N でも なく N でも ない',
    explanation:
      'でもない denies something mildly or partly: 嫌いでもない "it’s not that I dislike it". Doubled, AでもなくBでもない means "neither A nor B": 子供でもなく大人でもない. まんざらでもない is a related idiom.',
    functions: ['negative'],
    examples: [
      ex('この 料理は 好きでも 嫌いでも ない。', "I neither like nor dislike this dish.", 'この りょうりは すきでも きらいでも ない。'),
      ex('それほど 難しい 問題でも ない。', "It isn't that difficult a problem.", 'それほど むずかしい もんだいでも ない。'),
    ],
  },
  'n2m-g-a2dfa3': {
    meaning: 'from ~’s standpoint; for ~ (personally)',
    structure: 'Person + に して みれば（に して みたら）',
    explanation:
      'にしてみれば stresses imagining oneself in someone else’s position: 母にしてみれば、娘の結婚は寂しいだろう "for her mother, her daughter’s marriage must be lonely". It is more empathetic than にとって.',
    functions: ['perspective-way'],
    examples: [
      ex('子供に して みれば、引っ越しは 大きな 出来事だ。', 'For a child, moving house is a big event.', 'こどもに して みれば、ひっこしは おおきな できごとだ。'),
      ex('彼に して みたら、冗談の つもりだった のだろう。', 'From his point of view, it was probably meant as a joke.', 'かれに して みたら、じょうだんの つもりだった のだろう。'),
    ],
  },
  'n2m-g-e7901e': {
    meaning: 'to blame (something / someone) for ~',
    structure: 'N を + N の せいに する',
    explanation:
      'せいにする shifts responsibility onto someone or something: 失敗を他人のせいにする "blame others for one’s failure". It is usually critical, implying the blame is unfair.',
    functions: ['blame', 'criticize'],
    examples: [
      ex('自分の 失敗を 人の せいに しては いけない。', "You shouldn't blame others for your own mistakes.", 'じぶんの しっぱいを ひとの せいに しては いけない。'),
      ex('彼は 遅刻を いつも 電車の せいに する。', 'He always blames the train for his lateness.', 'かれは ちこくを いつも でんしゃの せいに する。'),
    ],
  },
  'n2m-g-b0bf1e': {
    meaning: 'with (feeling) ~; full of ~',
    structure: 'N（気持ち・愛・感謝）+ を こめて（を こめた + N）',
    explanation:
      'をこめて says an action is filled with a feeling: 心をこめて作る "make with care", 感謝をこめて "with gratitude". It is common in letters, gifts and speeches.',
    functions: ['feel', 'means-methods'],
    examples: [
      ex('母の ために、心を こめて 料理を 作った。', 'I cooked with all my heart for my mother.', 'ははの ために、こころを こめて りょうりを つくった。'),
      ex('感謝の 気持ちを こめて、手紙を 書いた。', 'I wrote a letter full of gratitude.', 'かんしゃの きもちを こめて、てがみを かいた。'),
    ],
  },
  'n2m-g-faa31b': {
    meaning: 'as ~ as possible; if possible',
    structure: 'なるべく + Adj／V',
    explanation:
      'なるべく asks for an effort within reason: なるべく早く来てください "please come as early as you can". It is softer than できるだけ, which stresses doing the maximum. なるたけ is an old-fashioned variant.',
    functions: ['level', 'request'],
    examples: [
      ex('なるべく 早く 返事を ください。', 'Please reply as soon as you can.', 'なるべく はやく へんじを ください。'),
      ex('夜は なるべく 甘い ものを 食べない ように して いる。', 'I try not to eat sweets at night if I can help it.', 'よるは なるべく あまい ものを たべない ように して いる。'),
    ],
  },
  'n2m-g-79e1b7': {
    meaning: 'instantly; in no time',
    structure: 'たちまち + V',
    explanation:
      'たちまち describes something happening very quickly, often a spreading effect: 噂はたちまち広まった "the rumour spread in no time". It is somewhat written; すぐに is the everyday word.',
    functions: ['immediately-after'],
    examples: [
      ex('新しい ゲームは たちまち 売り切れた。', 'The new game sold out in no time.', 'あたらしい げーむは たちまち うりきれた。'),
      ex('その 噂は たちまち 学校中に 広まった。', 'The rumour quickly spread throughout the school.', 'その うわさは たちまち がっこうじゅうに ひろまった。'),
    ],
  },
  'n2m-g-a1efcc': {
    meaning: 'I should have ~ (spoken regret)',
    structure: 'V-dict + んだった',
    explanation:
      'んだった is the spoken form of のだった, expressing regret: 傘を持ってくるんだった "I should have brought an umbrella". It often slips out as the speaker realises a mistake.',
    functions: ['regret'],
    examples: [
      ex('しまった、傘を 持って くるんだった。', 'Oh no, I should have brought an umbrella.', 'しまった、かさを もって くるんだった。'),
      ex('こんな ことなら、もっと 貯金して おくんだった。', 'If I had known, I would have saved more money.', 'こんな ことなら、もっと ちょきんして おくんだった。'),
    ],
  },
  'n2m-g-0f4cf9': {
    meaning: 'to consist of ~; to be made up of ~',
    structure: 'N（parts）+ から なる（から なって いる）',
    explanation:
      'からなる describes composition: 日本は四つの大きな島からなる "Japan consists of four main islands". からなる + N modifies a noun: 十人からなるチーム. It is formal and descriptive.',
    functions: ['describe', 'status'],
    examples: [
      ex('この チームは 十人の メンバーから なる。', 'This team consists of ten members.', 'この ちーむは じゅうにんの めんばーから なる。'),
      ex('この 本は 五つの 章から なって いる。', 'This book is made up of five chapters.', 'この ほんは いつつの しょうから なって いる。'),
    ],
  },
  'n2m-g-b6ee84': {
    meaning: 'manner of ~; (period + ぶり) for the first time in ~',
    structure: 'V-ます stem／N + ぶり ／ period + ぶり（に）',
    explanation:
      'After a verb stem or noun, ぶり means "way, manner": 話しぶり "way of talking", 仕事ぶり "work performance". After a period, it means "first time in": 五年ぶり. The first use often carries evaluation.',
    functions: ['describe', 'time-situation'],
    examples: [
      ex('彼の 仕事ぶりは 皆に 高く 評価されて いる。', 'His work is highly regarded by everyone.', 'かれの しごとぶりは みなに たかく ひょうかされて いる。'),
      ex('あの 話しぶりから すると、何か 知って いる ようだ。', 'Judging from the way he talks, he seems to know something.', 'あの はなしぶりから すると、なにか しって いる ようだ。'),
    ],
  },
  'n2m-g-5b0a5e': {
    meaning: 'if it seems that ~',
    structure: 'Plain form + ようだったら',
    explanation:
      'ようだったら is the conversational ようなら: a condition based on how things turn out: 雨が強くなるようだったら中止する "if the rain gets heavier, we’ll cancel". It sounds considerate and flexible.',
    functions: ['condition'],
    examples: [
      ex('具合が 悪い ようだったら、無理を しないで ね。', "If you're not feeling well, don't push yourself.", 'ぐあいが わるい ようだったら、むりを しないで ね。'),
      ex('雨が 強く なる ようだったら、試合は 中止です。', 'If the rain gets heavier, the match will be cancelled.', 'あめが つよく なる ようだったら、しあいは ちゅうしです。'),
    ],
  },
  'n2m-g-3935b0': {
    meaning: 'somehow; in some way (vaguely)',
    structure: 'どことなく + Adj／V',
    explanation:
      'どことなく describes a vague impression the speaker cannot pinpoint: どことなく寂しそうだ "somehow she looks lonely", どことなく父に似ている. It is gentle and descriptive.',
    functions: ['vague', 'similarity-degree'],
    examples: [
      ex('彼女は どことなく 母に 似て いる。', 'She somehow resembles my mother.', 'かのじょは どことなく ははに にて いる。'),
      ex('今日の 彼は どことなく 元気が ない。', 'Today he seems somehow down.', 'きょうの かれは どことなく げんきが ない。'),
    ],
  },
  'n2m-g-6f4abd': {
    meaning: 'in the first place; to begin with',
    structure: 'そもそも + clause',
    explanation:
      'そもそも goes back to the root of a matter: そもそも、なぜこの計画を始めたのか "why did we start this plan in the first place?". In arguments, it often points out an underlying problem or blame.',
    functions: ['explain', 'criticize'],
    examples: [
      ex('そもそも、この 会議の 目的は 何ですか。', 'What is the purpose of this meeting in the first place?', 'そもそも、この かいぎの もくてきは なんですか。'),
      ex('そもそも 君が 遅れて 来たのが 悪いんだ。', "To begin with, it's your fault for being late.", 'そもそも きみが おくれて きたのが わるいんだ。'),
    ],
  },
  'n2m-g-92bfb1': {
    meaning: 'just about to ~; right at the moment of ~',
    structure: 'まさに + V-volitional + と して いる（ところだ）',
    explanation:
      'まさに〜ようとしている stresses that something is at the very point of happening: まさに出発しようとしているところだ "we are just about to depart". まさに adds precision and drama.',
    functions: ['shortly-before', 'time'],
    examples: [
      ex('電車は まさに 発車しようと して いた。', 'The train was just about to depart.', 'でんしゃは まさに はっしゃしようと して いた。'),
      ex('新しい 時代が まさに 始まろうと して いる。', 'A new era is just about to begin.', 'あたらしい じだいが まさに はじまろうと して いる。'),
    ],
  },
  'n2m-g-bc286b': {
    meaning: 'to let (someone) go on ~ing; leave them to ~',
    structure: 'Person に／を + V-causative-て + おく',
    explanation:
      'させておく means allowing someone to keep doing something without interfering: 子供を遊ばせておく "let the children play". It can suggest tolerance or indifference: 言わせておけ "let him say what he likes".',
    functions: ['allow', 'action-status'],
    examples: [
      ex('疲れて いるようだから、もう 少し 寝させて おこう。', "He seems tired, so let's let him sleep a little longer.", 'つかれて いるようだから、もう すこし ねさせて おこう。'),
      ex('言いたい 人には 言わせて おけば いい。', 'Let those who want to talk say what they like.', 'いいたい ひとには いわせて おけば いい。'),
    ],
  },
  'n2m-g-0422c2': {
    meaning: 'roughly; once through; the whole basic set',
    structure: '一通り（ひととおり）+ V ／ 一通りの + N',
    explanation:
      '一通り means going through everything at least once, in outline: 一通り読んだ "read it through once". 一通りのことはできる means "can do the basics". It suggests adequate but not deep coverage.',
    functions: ['amount', 'experience'],
    examples: [
      ex('資料には 一通り 目を 通しました。', 'I have looked through all the materials once.', 'しりょうには ひととおり めを とおしました。'),
      ex('料理は 一通りの ことは できます。', 'I can manage the basics of cooking.', 'りょうりは ひととおりの ことは できます。'),
    ],
  },
  'n2m-g-ecd25a': {
    meaning: 'not dare to ~; deliberately not ~',
    structure: 'あえて + V-ない（あえて + V）',
    explanation:
      'あえて marks a deliberate choice against the obvious option: あえて何も言わなかった "I chose not to say anything". In the positive, あえて言えば means "if I dare say". It implies a conscious, sometimes difficult decision.',
    functions: ['intent', 'negative'],
    examples: [
      ex('彼の 気持ちを 考えて、あえて 何も 言わなかった。', "Out of consideration for his feelings, I chose not to say anything.", 'かれの きもちを かんがえて、あえて なにも いわなかった。'),
      ex('答えは 分かって いたが、あえて 教えなかった。', 'I knew the answer, but I deliberately did not tell.', 'こたえは わかって いたが、あえて おしえなかった。'),
    ],
  },
  'n2m-g-c5e161': {
    meaning: "one can't possibly ~ (it is too bad / much)",
    structure: 'V-potential + た もの では ない（たものじゃない）',
    explanation:
      'たものではない strongly says something is impossible to bear or accept: こんなまずい料理は食べられたものではない "this food is simply inedible". It is emotional and critical, stronger than a plain negative potential.',
    functions: ['emphasize-negative', 'criticize'],
    examples: [
      ex('こんなに 汚い 部屋には、いられた もの では ない。', 'I simply cannot stay in a room this dirty.', 'こんなに きたない へやには、いられた もの では ない。'),
      ex('彼の 歌は 下手で、聞けた もの じゃ ない。', 'His singing is so bad it is unbearable to listen to.', 'かれの うたは へたで、きけた もの じゃ ない。'),
    ],
  },
  'n2m-g-625633': {
    meaning: 'anyway; in any case; at any rate',
    structure: 'とにかく + V／clause ／ N は とにかく',
    explanation:
      'とにかく sets aside other considerations to focus on what matters now: とにかく行ってみよう "anyway, let’s go and see". N はとにかく means "N aside": 値段はとにかく. It also intensifies: とにかく忙しい "just so busy".',
    functions: ['invariant', 'emphasize'],
    examples: [
      ex('理由は あとで 聞くから、とにかく 急いで。', "I'll hear the reason later; just hurry.", 'りゆうは あとで きくから、とにかく いそいで。'),
      ex('最近は とにかく 忙しくて、休む 暇が ない。', "I'm just so busy lately that I have no time to rest.", 'さいきんは とにかく いそがしくて、やすむ ひまが ない。'),
    ],
  },
  'n2m-g-fecd1d': {
    meaning: 'even ~ (does it), so why …?',
    structure: 'N + でも + V のに, …',
    explanation:
      'でも〜のに contrasts an easy case with a surprising failure: 子供でもできるのに、どうしてできないの "even a child can do it, so why can’t you?". It carries criticism or disbelief.',
    functions: ['unexpected-outcome', 'criticize'],
    examples: [
      ex('子供で も できるのに、大人の 君が できない なんて。', "Even a child can do it, yet you, an adult, can't?", 'こどもで も できるのに、おとなの きみが できない なんて。'),
      ex('雨の 日で も 来たのに、今日は なぜ 来ないの。', 'You came even on rainy days, so why not today?', 'あめの ひで も きたのに、きょうは なぜ こないの。'),
    ],
  },
  'n2m-g-994286': {
    meaning: 'almost (did ~); nearly all',
    structure: 'ほとんど + V-た ／ ほとんど + negative（hardly）',
    explanation:
      'ほとんど means "almost all": 宿題はほとんど終わった "the homework is almost done". With a negative it means "hardly": ほとんど寝ていない "have hardly slept". As a noun, ほとんどの人 means "most people".',
    functions: ['amount', 'amount-roughly'],
    examples: [
      ex('レポートは ほとんど 書き終わった。', 'I have almost finished writing the report.', 'れぽーとは ほとんど かきおわった。'),
      ex('昨夜は ほとんど 眠れなかった。', 'I hardly slept at all last night.', 'ゆうべは ほとんど ねむれなかった。'),
    ],
  },
  'n2m-g-c84df3': {
    meaning: 'whenever ~; every time ~ (is seen / heard)',
    structure: 'V-dict + に つけ（て）／ A に つけ B に つけ',
    explanation:
      'につけ says that each time something happens, a certain feeling arises: この写真を見るにつけ、故郷を思い出す. Doubled, AにつけBにつけ means "whether A or B": 良いにつけ悪いにつけ. It is formal.',
    functions: ['time-situation', 'feel'],
    examples: [
      ex('この 歌を 聞くに つけ、学生時代を 思い出す。', 'Whenever I hear this song, I remember my school days.', 'この うたを きくに つけ、がくせいじだいを おもいだす。'),
      ex('良いに つけ 悪いに つけ、彼は 話題に なる。', 'For better or worse, he is always talked about.', 'よいに つけ わるいに つけ、かれは わだいに なる。'),
    ],
  },
  'n2m-g-f115a3': {
    meaning: 'mainly; exclusively; (rumour) widely said',
    structure: 'もっぱら + V ／ もっぱらの + 噂（評判）',
    explanation:
      'もっぱら says something is done almost exclusively: 休日はもっぱら寝ている "on days off I mostly just sleep". もっぱらの噂 means "the talk of the town". It is slightly formal.',
    functions: ['limit', 'frequency'],
    examples: [
      ex('最近、休みの 日は もっぱら 読書を して いる。', 'Lately I spend my days off mostly reading.', 'さいきん、やすみの ひは もっぱら どくしょを して いる。'),
      ex('二人が 結婚するのは もっぱらの 噂だ。', "It's widely rumoured that the two are getting married.", 'ふたりが けっこんするのは もっぱらの うわさだ。'),
    ],
  },
  'n2m-g-e2c354': {
    meaning: 'there is a limit to ~ / there is no limit to ~',
    structure: 'N に は 限りが ある（限りが ない）',
    explanation:
      '限りがある says something is finite: 資源には限りがある "resources are limited". 限りがない means "endless": 人の欲には限りがない. The pair is common in essays about resources and desire.',
    functions: ['limit'],
    examples: [
      ex('地球の 資源には 限りが ある。', "The earth's resources are limited.", 'ちきゅうの しげんには かぎりが ある。'),
      ex('人の 欲望には 限りが ない。', 'Human desire knows no bounds.', 'ひとの よくぼうには かぎりが ない。'),
    ],
  },
  'n2m-g-e0b5b6': {
    meaning: 'the moment ~; no sooner ~ than',
    structure: 'V-dict／V-た + か + V-ない + かの うちに',
    explanation:
      'かのうちに describes one event following another almost instantly: ベルが鳴るか鳴らないかのうちに、彼は教室を出た "he left the classroom the moment the bell rang". It is a vivid, written expression.',
    functions: ['immediately-after'],
    examples: [
      ex('ベルが 鳴るか 鳴らないかの うちに、生徒たちは 走り出した。', 'The students dashed off almost before the bell had rung.', 'べるが なるか ならないかの うちに、せいとたちは はしりだした。'),
      ex('家に 着いたか 着かないかの うちに、雨が 降り出した。', 'I had barely got home when it started to rain.', 'いえに ついたか つかないかの うちに、あめが ふりだした。'),
    ],
  },
  'n2m-g-02b7d6': {
    meaning: 'accordingly; in connection with this (formal letters)',
    structure: '（Topic）。つきましては、+ request／announcement',
    explanation:
      'つきましては is a formal connector in letters and notices: it follows a statement and introduces what is asked as a result: 説明会を開きます。つきましては、ご出席ください. It is the polite form of ついては.',
    functions: ['story-topic', 'cause-reason'],
    examples: [
      ex('来月、説明会を 開きます。つきましては、ご出席を お願い いたします。', 'We will hold a briefing next month. We therefore request your attendance.', 'らいげつ、せつめいかいを ひらきます。つきましては、ごしゅっせきを おねがい いたします。'),
      ex('会費が 変わりました。つきましては、ご確認 ください。', 'The membership fee has changed. Please check the details accordingly.', 'かいひが かわりました。つきましては、ごかくにん ください。'),
    ],
  },
  'n2m-g-986437': {
    meaning: "it is only natural that ~; no wonder",
    structure: 'Plain form + のも もっともだ',
    explanation:
      'のももっともだ agrees that a reaction is reasonable: 彼が怒るのももっともだ "it’s quite natural that he’s angry". It is a little more formal than のも無理はない and expresses understanding.',
    functions: ['judge', 'of-course'],
    examples: [
      ex('あんなに 待たされたら、怒るのも もっともだ。', 'After being kept waiting that long, it is quite natural to be angry.', 'あんなに またされたら、おこるのも もっともだ。'),
      ex('毎日 残業なら、辞めたく なるのも もっともだ。', "With overtime every day, it's only natural to want to quit.", 'まいにち ざんぎょうなら、やめたく なるのも もっともだ。'),
    ],
  },
  'n2m-g-73fe3e': {
    meaning: 'slightly; barely; narrowly',
    structure: 'わずかに + V／Adj',
    explanation:
      'わずかに describes a small degree or narrow margin: わずかに見える "can just barely be seen", わずかに勝った "won by a narrow margin". It is somewhat formal; 少し or ちょっと are more casual.',
    functions: ['level', 'limit'],
    examples: [
      ex('遠くに 山が わずかに 見える。', 'The mountains are faintly visible in the distance.', 'とおくに やまが わずかに みえる。'),
      ex('試合は わずかに 一点 差で 負けた。', 'We lost the match by just one point.', 'しあいは わずかに いってん さで まけた。'),
    ],
  },
  'n2m-g-e32b9a': {
    meaning: 'depends on ~; (次第だ) that is how ~ came about',
    structure: 'N + 次第だ（次第で）／ V-た + 次第だ（explanation）',
    explanation:
      'N次第だ says the outcome depends on N: 成功するかは努力次第だ "success depends on effort". After a past verb, 次第だ formally explains circumstances: そういうわけで、お願いした次第です "that is why I asked".',
    functions: ['standard', 'explain'],
    examples: [
      ex('合格できるか どうかは、君の 努力 次第だ。', 'Whether you pass depends on your own effort.', 'ごうかくできるか どうかは、きみの どりょく しだいだ。'),
      ex('そう いう わけで、ご連絡した 次第です。', 'That is why I have contacted you.', 'そう いう わけで、ごれんらくした しだいです。'),
    ],
  },
  'n2m-g-f9882e': {
    meaning: 'almost; very nearly (did ~)',
    structure: 'もう 少しで + V-dict + ところだった',
    explanation:
      'もう少しで says an outcome nearly happened: もう少しで車にぶつかるところだった "I almost hit a car". It often pairs with ところだった. For a positive result nearly achieved, もう少しで優勝だった.',
    functions: ['shortly-before'],
    examples: [
      ex('もう 少しで 転ぶ ところだった。', 'I very nearly fell.', 'もう すこしで ころぶ ところだった。'),
      ex('もう 少しで 優勝できたのに、残念だ。', 'We nearly won the championship; it is such a shame.', 'もう すこしで ゆうしょうできたのに、ざんねんだ。'),
    ],
  },
  'n2m-g-16b175': {
    meaning: 'unbearably ~; can’t stand it (so ~)',
    structure: 'V-て／Adj-くて + たまらない',
    explanation:
      'てたまらない says a feeling or sensation is overwhelming: 暑くてたまらない "unbearably hot", 会いたくてたまらない "dying to see". It is used for the speaker’s own feelings; for others, add らしい or ようだ.',
    functions: ['feel', 'level'],
    examples: [
      ex('今日は 暑くて たまらない。', "It's unbearably hot today.", 'きょうは あつくて たまらない。'),
      ex('家族に 会いたくて たまらない。', "I'm dying to see my family.", 'かぞくに あいたくて たまらない。'),
    ],
  },
  'n2m-g-298f1e': {
    meaning: 'probably; very likely',
    structure: '恐らく（おそらく）+ plain form + だろう',
    explanation:
      '恐らく is a formal "probably", usually completed by だろう or でしょう: 恐らく明日は雨だろう. It is more confident than たぶん and common in news and writing.',
    functions: ['speculation'],
    examples: [
      ex('恐らく 彼は もう 知って いる だろう。', 'He probably already knows.', 'おそらく かれは もう しって いる だろう。'),
      ex('この 雨は 恐らく 夜まで 続く でしょう。', 'This rain will very likely continue into the night.', 'この あめは おそらく よるまで つづく でしょう。'),
    ],
  },
  'n2m-g-849818': {
    meaning: 'long ago; already (a long time since)',
    structure: 'とっくに + V-た／V-て いる',
    explanation:
      'とっくに stresses that something happened well before now: 電車はとっくに出た "the train left long ago". It often implies the listener is too late. It is conversational; とうに is the literary form.',
    functions: ['time', 'finish'],
    examples: [
      ex('会議なら、とっくに 終わったよ。', 'The meeting? That finished ages ago.', 'かいぎなら、とっくに おわったよ。'),
      ex('その 本は とっくに 読み終わって いる。', 'I finished reading that book long ago.', 'その ほんは とっくに よみおわって いる。'),
    ],
  },
  'n2m-g-7f5694': {
    meaning: 'really; I wonder if (it will really ~); sure enough',
    structure: '果たして + clause + だろうか ／ 果たして + V-た（sure enough）',
    explanation:
      'In questions, 果たして expresses doubt about the outcome: 果たして成功するだろうか "will it really succeed?". In statements, it means "sure enough, as expected": 果たして雨になった. It is written style.',
    functions: ['speculation', 'as-expected'],
    examples: [
      ex('果たして 彼の 計画は うまく いくだろうか。', 'Will his plan really work, I wonder?', 'はたして かれの けいかくは うまく いくだろうか。'),
      ex('天気予報の とおり、果たして 午後から 雨に なった。', 'Just as forecast, it did indeed rain from the afternoon.', 'てんきよほうの とおり、はたして ごごから あめに なった。'),
    ],
  },
  'n2m-g-db1245': {
    meaning: 'relying on ~; with the help of ~',
    structure: 'N + を 頼りに（して）',
    explanation:
      'を頼りに names what someone depends on to act: 地図を頼りに歩く "walk using a map as a guide", 記憶を頼りに "relying on memory". It suggests limited resources.',
    functions: ['means-methods'],
    examples: [
      ex('古い 地図を 頼りに、祖父の 家を 探した。', 'Relying on an old map, I searched for my grandfather’s house.', 'ふるい ちずを たよりに、そふの いえを さがした。'),
      ex('月の 明かりを 頼りに、山道を 歩いた。', 'We walked the mountain path by the light of the moon.', 'つきの あかりを たよりに、やまみちを あるいた。'),
    ],
  },
  'n2m-g-01ebf5': {
    meaning: 'in one go; all at once',
    structure: '一気に（いっきに）+ V',
    explanation:
      '一気に describes doing something without stopping or all at once: 一気に飲む "drink in one gulp", 一気に読み終える. It can also describe a sudden change: 人気が一気に高まった.',
    functions: ['immediately-after', 'describe'],
    examples: [
      ex('その 小説が 面白くて、一気に 読んで しまった。', 'The novel was so good that I read it in one go.', 'その しょうせつが おもしろくて、いっきに よんで しまった。'),
      ex('テレビで 紹介されて、店の 人気が 一気に 上がった。', 'After being featured on TV, the shop’s popularity shot up.', 'てれびで しょうかいされて、みせの にんきが いっきに あがった。'),
    ],
  },
  'n2m-g-e476cf': {
    meaning: 'at the same time as ~; (and) at the same time',
    structure: 'N／V-dict + と 同時に',
    explanation:
      'と同時に links two simultaneous events or two coexisting aspects: 卒業と同時に就職した "started work right upon graduating", 楽しいと同時に疲れる. It is neutral to formal.',
    functions: ['simultaneous'],
    examples: [
      ex('大学卒業と 同時に、東京に 引っ越した。', 'I moved to Tokyo as soon as I graduated from university.', 'だいがくそつぎょうと どうじに、とうきょうに ひっこした。'),
      ex('この 仕事は やりがいが あると 同時に、責任も 重い。', 'This job is rewarding, and at the same time the responsibility is heavy.', 'この しごとは やりがいが あると どうじに、せきにんも おもい。'),
    ],
  },
  'n2m-g-ed0602': {
    meaning: 'on the occasion of ~; when (starting) ~',
    structure: 'N／V-dict + に あたり（に あたって）',
    explanation:
      'にあたって marks an important occasion and what is done in preparation for it: 開会にあたり、一言ご挨拶します "on the occasion of the opening, allow me to say a few words". It is formal and ceremonial.',
    functions: ['time-situation'],
    examples: [
      ex('新しい 生活を 始めるに あたって、いろいろ 準備した。', 'I made various preparations for starting my new life.', 'あたらしい せいかつを はじめるに あたって、いろいろ じゅんびした。'),
      ex('開会に あたり、一言 ご挨拶 申し上げます。', 'On the occasion of this opening, allow me to say a few words.', 'かいかいに あたり、ひとこと ごあいさつ もうしあげます。'),
    ],
  },
  'n2m-g-c48d44': {
    meaning: 'regardless of ~; irrespective of ~',
    structure: 'N／V-dict + V-ない + に 関わらず（に 関わりなく）',
    explanation:
      'にかかわらず says a condition does not affect the outcome: 年齢にかかわらず参加できる "anyone can take part regardless of age". It often follows opposite pairs: 天気のいい悪いにかかわらず.',
    functions: ['invariant'],
    examples: [
      ex('年齢に かかわらず、誰でも 参加できます。', 'Anyone can take part, regardless of age.', 'ねんれいに かかわらず、だれでも さんかできます。'),
      ex('天気が いい 悪いに かかわらず、試合は 行います。', 'The match will be held regardless of the weather.', 'てんきが いい わるいに かかわらず、しあいは おこないます。'),
    ],
  },
  'n2m-g-0eed02': {
    meaning: 'it is best to ~; nothing is better than ~',
    structure: 'V-dict／Adj／N + に 越した ことは ない',
    explanation:
      'に越したことはない says something is the ideal, though not always necessary: 安いに越したことはない "cheaper is always better". It expresses common-sense advice or preference.',
    functions: ['advice', 'highest-level'],
    examples: [
      ex('用心するに 越した ことは ない。', "It's always best to be careful.", 'ようじんするに こした ことは ない。'),
      ex('値段は 安いに 越した ことは ない。', 'As for price, the cheaper the better.', 'ねだんは やすいに こした ことは ない。'),
    ],
  },
  'n2m-g-37ddd6': {
    meaning: 'suddenly; without warning; straight away',
    structure: 'いきなり + V',
    explanation:
      'いきなり describes something abrupt or without the expected preliminaries: いきなり怒り出した "suddenly got angry", いきなり本番 "straight into the real thing". It often implies surprise or rudeness.',
    functions: ['unexpected-outcome', 'immediately-after'],
    examples: [
      ex('知らない 人に いきなり 話しかけられた。', 'A stranger suddenly started talking to me.', 'しらない ひとに いきなり はなしかけられた。'),
      ex('練習も しないで、いきなり 試合に 出た。', 'Without any practice, he went straight into the match.', 'れんしゅうも しないで、いきなり しあいに でた。'),
    ],
  },
  'n2m-g-e771a5': {
    meaning: 'with (feelings) ~ put into it',
    structure: 'N（願い・思い・感謝）+ を 込めて',
    explanation:
      'を込めて says a feeling is put into an action or object: 愛を込めて作ったケーキ "a cake made with love", 平和への願いを込めて. It is the kanji spelling of をこめて and common in dedications.',
    functions: ['feel'],
    examples: [
      ex('平和への 願いを 込めて、鐘を 鳴らした。', 'We rang the bell with a prayer for peace.', 'へいわへの ねがいを こめて、かねを ならした。'),
      ex('愛情を 込めて 育てた 花が、やっと 咲いた。', 'The flowers I raised with love have finally bloomed.', 'あいじょうを こめて そだてた はなが、やっと さいた。'),
    ],
  },
  'n2m-g-fb0342': {
    meaning: 'as might be expected of ~; worth the (effort / price)',
    structure: 'Plain form + だけ（のことは）あって ／ だけの ことは ある',
    explanation:
      'だけあって says a result lives up to what one would expect from the cause: 高いだけあって、品質がいい "as you’d expect from the price, the quality is good". だけのことはある at the end praises something as worth it.',
    functions: ['of-course', 'evaluate'],
    examples: [
      ex('十年 住んで いた だけ あって、彼は 日本の 事情に 詳しい。', 'Having lived there ten years, he naturally knows Japan well.', 'じゅうねん すんで いた だけ あって、かれは にほんの じじょうに くわしい。'),
      ex('この 店の 料理は、有名な だけの ことは ある。', 'The food at this restaurant lives up to its fame.', 'この みせの りょうりは、ゆうめいな だけの ことは ある。'),
    ],
  },
  'n2m-g-28abd3': {
    meaning: 'over (a period / area); throughout',
    structure: 'N（period／range）+ に わたって（に わたる + N）',
    explanation:
      'にわたって stresses the full extent of a period or area: 三日間にわたって会議が行われた "the conference was held over three days", 全国にわたる調査. It is formal and common in news.',
    functions: ['range', 'period'],
    examples: [
      ex('会議は 三日間に わたって 行われた。', 'The conference was held over three days.', 'かいぎは みっかかんに わたって おこなわれた。'),
      ex('台風で 広い 範囲に わたって 被害が 出た。', 'The typhoon caused damage over a wide area.', 'たいふうで ひろい はんいに わたって ひがいが でた。'),
    ],
  },
  'n2m-g-336932': {
    meaning: 'at least',
    structure: '少なくとも + quantity／clause',
    explanation:
      '少なくとも sets a minimum: 少なくとも一時間はかかる "it will take at least an hour". It can also limit a claim: 少なくとも私は知らない "I, for one, don’t know". It is neutral and common.',
    functions: ['amount', 'limit'],
    examples: [
      ex('駅まで 歩くと、少なくとも 三十分は かかる。', 'Walking to the station takes at least thirty minutes.', 'えきまで あるくと、すくなくとも さんじゅっぷんは かかる。'),
      ex('少なくとも 私は その 話を 聞いて いない。', 'I, for one, have not heard about it.', 'すくなくとも わたしは その はなしを きいて いない。'),
    ],
  },
  'n2m-g-83a192': {
    meaning: 'other than ~; except ~',
    structure: 'N + 以外（の + N／は）',
    explanation:
      '以外 excludes the named item: 日曜以外は毎日働く "I work every day except Sunday". 以外の + N means "other": 英語以外の言語. With a negative it means "nothing but": 待つ以外に方法はない.',
    functions: ['exception'],
    examples: [
      ex('関係者 以外は 入らないで ください。', 'Authorised personnel only.', 'かんけいしゃ いがいは はいらないで ください。'),
      ex('待つ 以外に、方法は なかった。', 'There was nothing we could do but wait.', 'まつ いがいに、ほうほうは なかった。'),
    ],
  },
  'n2m-g-171580': {
    meaning: 'just when ~; at the (awkward / right) moment',
    structure: 'V-ている／V-た + ところを／ところに／ところへ',
    explanation:
      'ところに／ところへ describes something arriving just at a particular moment: 出かけようとしたところへ電話が鳴った. ところを is used when someone is caught or helped at that moment: お忙しいところをすみません.',
    functions: ['time-situation'],
    examples: [
      ex('出かけようと した ところへ、友達が 来た。', 'Just as I was about to go out, a friend arrived.', 'でかけようと した ところへ、ともだちが きた。'),
      ex('お忙しい ところを お邪魔して、すみません。', 'I am sorry to bother you when you are busy.', 'おいそがしい ところを おじゃまして、すみません。'),
    ],
  },
  'n2m-g-ae555c': {
    meaning: 'from the fact that ~; because ~',
    structure: 'Plain form (Na な／N である) + ことから',
    explanation:
      'ことから gives the fact on which a conclusion or name is based: 形が似ていることから、この名前がついた. It is formal and explains origins or grounds. ので gives a plain reason.',
    functions: ['grounds', 'cause-reason'],
    examples: [
      ex('桜が 多い ことから、この 道は 「桜通り」と 呼ばれて いる。', 'Because there are many cherry trees, this street is called Sakura Street.', 'さくらが おおい ことから、この みちは 「さくらどおり」と よばれて いる。'),
      ex('足跡が あった ことから、犯人は 庭から 入ったと 分かった。', 'From the footprints, it was clear the culprit came in through the garden.', 'あしあとが あった ことから、はんにんは にわから はいったと わかった。'),
    ],
  },
  'n2m-g-0c3f57': {
    meaning: 'one should not ~; (it is) not something one does',
    structure: 'V-dict + もの では ない',
    explanation:
      'ものではない gives advice based on social norms: 人の悪口を言うものではない "you shouldn’t speak ill of others". It sounds like a senior’s admonition. It is the negative of ものだ (natural duty).',
    functions: ['advice', 'ban'],
    examples: [
      ex('人の 手紙を 勝手に 読む もの では ない。', "One shouldn't read other people's letters without permission.", 'ひとの てがみを かってに よむ もの では ない。'),
      ex('食べ物を 粗末に する もの では ない。', 'You should not waste food.', 'たべものを そまつに する もの では ない。'),
    ],
  },
  'n2m-g-ba56af': {
    meaning: 'again; once more (formal)',
    structure: '再び（ふたたび）+ V',
    explanation:
      '再び is a formal "again", used in writing, news and speeches: 再び訪れる, 再び同じ間違いをしない. In conversation また or もう一度 is more common.',
    functions: ['repeat-habits'],
    examples: [
      ex('十年 ぶりに、再び この 町を 訪れた。', 'After ten years, I visited this town again.', 'じゅうねん ぶりに、ふたたび この まちを おとずれた。'),
      ex('戦争の 悲劇を 再び 繰り返しては ならない。', 'The tragedy of war must never be repeated.', 'せんそうの ひげきを ふたたび くりかえしては ならない。'),
    ],
  },
  'n2m-g-303491': {
    meaning: 'on the contrary; rather (the opposite of what was expected)',
    structure: 'かえって + V／Adj',
    explanation:
      'かえって says an action produced the opposite of its intended effect: 薬を飲んだら、かえって悪くなった "taking the medicine made me worse instead". It stresses the irony of the result.',
    functions: ['unexpected-outcome', 'contrast'],
    examples: [
      ex('急いだら、かえって 時間が かかった。', 'Hurrying actually made it take longer.', 'いそいだら、かえって じかんが かかった。'),
      ex('手伝おうと したが、かえって 迷惑を かけて しまった。', 'I tried to help but ended up causing more trouble instead.', 'てつだおうと したが、かえって めいわくを かけて しまった。'),
    ],
  },
  'n2m-g-b9b267': {
    meaning: 'conversely; on the contrary; the other way round',
    structure: '逆に（ぎゃくに）+ clause',
    explanation:
      '逆に introduces the opposite perspective or result: 逆に言えば "to put it the other way round", 逆に質問された "I was asked a question back". It is more flexible than かえって, covering viewpoints as well as results.',
    functions: ['contrast'],
    examples: [
      ex('注意したら、逆に 怒られて しまった。', 'When I warned him, he got angry with me instead.', 'ちゅういしたら、ぎゃくに おこられて しまった。'),
      ex('逆に 言えば、今が チャンスだと いう ことだ。', 'Put the other way round, that means now is our chance.', 'ぎゃくに いえば、いまが ちゃんすだと いう ことだ。'),
    ],
  },
  'n2m-g-90abb5': {
    meaning: 'natural; only to be expected',
    structure: 'Plain form + のは 当然だ（当たり前だ）',
    explanation:
      '当然だ and 当たり前だ state that something is obvious or deserved: 約束を守るのは当然だ "keeping promises is only natural". 当たり前 is more conversational; 当然 is more formal and often logical.',
    functions: ['of-course', 'judge'],
    examples: [
      ex('努力した 人が 成功するのは 当然だ。', 'It is only natural that people who work hard succeed.', 'どりょくした ひとが せいこうするのは とうぜんだ。'),
      ex('間違えたら 謝るのは 当たり前だ。', 'Of course you apologise when you make a mistake.', 'まちがえたら あやまるのは あたりまえだ。'),
    ],
  },
  'n2m-g-03a641': {
    meaning: 'as long as ~; as far as ~ (knows / sees)',
    structure: 'V-dict／V-ている + 限り（は）／ V-た + 限り（では）',
    explanation:
      '限りは sets a condition that holds while it lasts: 生きている限り "as long as I live". 限りでは limits a statement to one’s knowledge: 私の知る限りでは "as far as I know". Both are somewhat formal.',
    functions: ['condition', 'range'],
    examples: [
      ex('健康で ある 限り、働き続けたい。', 'I want to keep working as long as I am healthy.', 'けんこうで ある かぎり、はたらきつづけたい。'),
      ex('私の 知る 限りでは、彼は 正直な 人だ。', 'As far as I know, he is an honest man.', 'わたしの しる かぎりでは、かれは しょうじきな ひとだ。'),
    ],
  },
  'n2m-g-e39322': {
    meaning: 'now that ~; since ~ (one must)',
    structure: 'V-dict／V-た + 上は',
    explanation:
      '上は says that once a situation exists, a corresponding resolve or duty follows: 引き受けた上は、最後までやる "now that I’ve taken it on, I’ll see it through". It is formal; からには and 以上 are similar.',
    functions: ['grounds', 'determination-decision'],
    examples: [
      ex('約束した 上は、必ず 守らなければ ならない。', 'Now that I have promised, I must keep my word.', 'やくそくした うえは、かならず まもらなければ ならない。'),
      ex('こう なった 上は、全力で やる しか ない。', 'Now that it has come to this, all we can do is give it everything.', 'こう なった うえは、ぜんりょくで やる しか ない。'),
    ],
  },
  'n2m-g-bc9c8e': {
    meaning: 'precisely because ~; only because ~',
    structure: 'Plain form + から こそ ／ V-ば + こそ ／ N + こそ',
    explanation:
      'こそ singles out something as the true reason or the one that matters: 君だからこそ話すんだ "I’m telling you precisely because it’s you". ばこそ is a literary form: 子を思えばこそ厳しくする. N こそ means "this very N".',
    functions: ['emphasize', 'cause-reason'],
    examples: [
      ex('信頼して いる からこそ、本当の ことを 話すんだ。', "It's precisely because I trust you that I'm telling you the truth.", 'しんらいして いる からこそ、ほんとうの ことを はなすんだ。'),
      ex('今年こそ 日本語能力試験に 合格したい。', 'This year, of all years, I want to pass the proficiency test.', 'ことしこそ にほんごのうりょくしけんに ごうかくしたい。'),
    ],
  },
  'n2m-g-91fc1c': {
    meaning: 'since ~ (and ever since)',
    structure: 'V-て + 以来 ／ N + 以来',
    explanation:
      '以来 marks a point from which a situation has continued: 日本に来て以来、毎日日本語を話している "ever since coming to Japan". It is used for lasting states, not a single later event; for that, use てから.',
    functions: ['time-sequence', 'continuity'],
    examples: [
      ex('日本に 来て 以来、ずっと この 町に 住んで いる。', 'Ever since coming to Japan, I have lived in this town.', 'にほんに きて いらい、ずっと この まちに すんで いる。'),
      ex('卒業 以来、彼とは 会って いない。', "I haven't seen him since graduation.", 'そつぎょう いらい、かれとは あって いない。'),
    ],
  },
  'n2m-g-81d5a6': {
    meaning: 'no more than ~; merely ~',
    structure: 'N／plain form + に 過ぎない',
    explanation:
      'に過ぎない downplays something as small or insignificant: それは噂に過ぎない "that’s only a rumour", 私は一社員に過ぎない. It is formal and often modest or dismissive.',
    functions: ['limit'],
    examples: [
      ex('それは ただの 噂に 過ぎない。', 'That is nothing more than a rumour.', 'それは ただの うわさに すぎない。'),
      ex('私は 自分の 意見を 言ったに 過ぎません。', 'I merely stated my own opinion.', 'わたしは じぶんの いけんを いったに すぎません。'),
    ],
  },
  'n2m-g-f4a7d1': {
    meaning: 'as if I would ~!; never!',
    structure: 'V-dict／Adj + ものか（ものですか／もんか）',
    explanation:
      'ものか is a strong rhetorical denial: あんな所に二度と行くものか "I’ll never go there again!". ものですか is the more feminine or polite form, and もんか the casual one. It shows determination or indignation.',
    functions: ['emphasize-negative', 'determination-decision'],
    examples: [
      ex('あんな ひどい 店に、二度と 行く ものか。', 'As if I would ever go back to that awful shop!', 'あんな ひどい みせに、にどと いく ものか。'),
      ex('これくらいで 負ける ものですか。', 'I am not going to lose over something like this!', 'これくらいで まける ものですか。'),
    ],
  },
  'n2m-g-d4a075': {
    meaning: 'in response to ~; meeting (expectations / requests)',
    structure: 'N（期待・要望・声）+ に 応えて（に 応える + N）',
    explanation:
      'に応えて says an action was taken to meet someone’s wishes: ファンの声に応えて、再演が決まった "in response to fans’ requests, a rerun was decided". It is positive and formal.',
    functions: ['relationships-follow'],
    examples: [
      ex('お客様の 要望に 応えて、営業時間を 延長しました。', "In response to customers' requests, we have extended our opening hours.", 'おきゃくさまの ようぼうに こたえて、えいぎょうじかんを えんちょうしました。'),
      ex('親の 期待に 応える ために、一生懸命 勉強した。', 'I studied hard to live up to my parents’ expectations.', 'おやの きたいに こたえる ために、いっしょうけんめい べんきょうした。'),
    ],
  },
  'n2m-g-549838': {
    meaning: 'centred on ~; mainly ~',
    structure: 'N + を 中心に（して）（を 中心と した + N）',
    explanation:
      'を中心に marks the focus or centre of an activity or area: 若者を中心に人気がある "popular mainly among young people", 東京を中心に雨が降る. It is common in news and reports.',
    functions: ['standard', 'range'],
    examples: [
      ex('この ゲームは 若者を 中心に 人気が ある。', 'This game is popular mainly among young people.', 'この げーむは わかものを ちゅうしんに にんきが ある。'),
      ex('明日は 関東を 中心に 雨が 降るでしょう。', 'Tomorrow it will rain, centred on the Kanto region.', 'あしたは かんとうを ちゅうしんに あめが ふるでしょう。'),
    ],
  },
  'n2m-g-2a83fa': {
    meaning: 'get by without ~ing; not need to ~',
    structure: 'V-ない + くて 済む（ないで 済む）',
    explanation:
      'なくて済む says something turned out not to be necessary, usually with relief: 手術をしなくて済んだ "I didn’t need surgery after all". ないで済む and ずに済む are equivalent.',
    functions: ['negative', 'result'],
    examples: [
      ex('友達が 車で 送って くれたので、タクシーに 乗らなくて 済んだ。', 'A friend drove me, so I did not need to take a taxi.', 'ともだちが くるまで おくって くれたので、たくしーに のらなくて すんだ。'),
      ex('早めに 準備したので、慌てないで 済んだ。', 'Because I prepared early, I did not have to rush.', 'はやめに じゅんびしたので、あわてないで すんだ。'),
    ],
  },
  'n2m-g-b3a3b1': {
    meaning: 'there is something (moving / impressive) about ~',
    structure: 'Plain form + もの が ある',
    explanation:
      'ものがある expresses the speaker’s strong impression of a quality: 彼の歌には人の心を打つものがある "there is something about his singing that moves people". It is evaluative and slightly formal.',
    functions: ['feel', 'evaluate'],
    examples: [
      ex('彼女の 演奏には 人の 心を 動かす ものが ある。', 'There is something about her performance that moves people.', 'かのじょの えんそうには ひとの こころを うごかす ものが ある。'),
      ex('毎日 同じ 作業を 続けるのは、つらい ものが ある。', 'There is something hard about doing the same task every day.', 'まいにち おなじ さぎょうを つづけるのは、つらい ものが ある。'),
    ],
  },
  'n2m-g-94aee1': {
    meaning: 'because (you see) ~ (excuse)',
    structure: 'Plain form (Na な／N な) + ものだから（もんだから）',
    explanation:
      'ものだから gives a personal reason, often as an excuse or apology: 電車が遅れたものだから、遅刻しました "I’m late because the train was delayed". It sounds softer and more apologetic than から.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('道が 混んで いた ものだから、遅れて しまいました。', 'I am sorry I am late; the roads were busy.', 'みちが こんで いた ものだから、おくれて しまいました。'),
      ex('あまりに 安かった もんだから、つい 買って しまった。', 'It was so cheap that I ended up buying it.', 'あまりに やすかった もんだから、つい かって しまった。'),
    ],
  },
  'n2m-g-a9f59a': {
    meaning: 'no sooner had ~ than …; just when I thought ~',
    structure: 'V-た + か と 思ったら（か と 思うと）',
    explanation:
      'かと思ったら describes a rapid, surprising change right after something happened: 晴れたかと思ったら、また雨が降り出した "no sooner had it cleared than it started raining again". The second event is outside the speaker’s control.',
    functions: ['immediately-after', 'unexpected-outcome'],
    examples: [
      ex('晴れたかと 思ったら、また 雨が 降り出した。', 'No sooner had it cleared up than it began to rain again.', 'はれたかと おもったら、また あめが ふりだした。'),
      ex('子供は 泣いたかと 思うと、すぐ 笑い出した。', 'The child cried, and then almost at once started laughing.', 'こどもは ないたかと おもうと、すぐ わらいだした。'),
    ],
  },
  'n2m-g-5d2244': {
    meaning: 'at last; finally (the time has come); more and more',
    structure: 'いよいよ + V／N',
    explanation:
      'いよいよ signals that a long-awaited moment has arrived: いよいよ明日は本番だ "tomorrow is finally the big day". It can also mean "increasingly": 雨がいよいよ強くなった. It carries excitement or tension.',
    functions: ['time', 'level'],
    examples: [
      ex('いよいよ 明日から 夏休みだ。', 'At last, summer holiday starts tomorrow.', 'いよいよ あしたから なつやすみだ。'),
      ex('夜に なって、風は いよいよ 強く なった。', 'As night fell, the wind grew ever stronger.', 'よるに なって、かぜは いよいよ つよく なった。'),
    ],
  },
  'n2m-g-425c83': {
    meaning: 'not only ~ (but also) …',
    structure: 'N／plain form + のみならず（のみか）、…も',
    explanation:
      'のみならず is a formal, written "not only": 国内のみならず、海外でも人気がある. It is stronger and more literary than だけでなく and common in essays and news.',
    functions: ['add'],
    examples: [
      ex('この 問題は 日本のみならず、世界中で 起きて いる。', 'This problem is occurring not only in Japan but all over the world.', 'この もんだいは にほんのみならず、せかいじゅうで おきて いる。'),
      ex('彼は 学生のみならず、先生からも 信頼されて いる。', 'He is trusted not only by the students but by the teachers too.', 'かれは がくせいのみならず、せんせいからも しんらいされて いる。'),
    ],
  },
  'n2m-g-33fb71': {
    meaning: 'even going so far as to ~',
    structure: 'V-て + まで ／ N + まで して',
    explanation:
      'てまで says someone goes to an extreme to achieve something: 借金してまで車を買う "buy a car even to the point of borrowing money". It often implies the speaker disapproves or questions whether it is worth it.',
    functions: ['extreme-example', 'criticize'],
    examples: [
      ex('徹夜して まで 仕事を 終わらせる 必要は ない。', 'There is no need to go so far as to stay up all night to finish the work.', 'てつやして まで しごとを おわらせる ひつようは ない。'),
      ex('友達を だまして まで、お金が 欲しいのか。', 'Do you want money so much that you would even deceive your friends?', 'ともだちを だまして まで、おかねが ほしいのか。'),
    ],
  },
  'n2m-g-d75703': {
    meaning: 'only ~; (に限って) of all times; (に限らず) not only ~',
    structure: 'N + に 限り ／ に 限って ／ に 限らず',
    explanation:
      'に限り limits eligibility: 先着百名に限り "only the first hundred". に限って complains that something happens precisely in an inconvenient case: 急いでいる時に限ってバスが来ない. に限らず extends beyond: 子供に限らず大人も.',
    functions: ['limit'],
    examples: [
      ex('先着 五十名に 限り、無料で 参加できます。', 'Only the first fifty people can take part for free.', 'せんちゃく ごじゅうめいに かぎり、むりょうで さんかできます。'),
      ex('急いで いる 時に 限って、電車が 遅れる。', 'The train is always late precisely when I am in a hurry.', 'いそいで いる ときに かぎって、でんしゃが おくれる。'),
    ],
  },
  'n2m-g-07745f': {
    meaning: 'as good as ~; practically ~',
    structure: 'N／V-た + も 同然（だ）',
    explanation:
      'も同然 says something is effectively the same as something else, even if not literally: 勝ったも同然だ "it’s as good as won", 家族も同然だ "practically family". It is emphatic and somewhat formal.',
    functions: ['similarity-degree'],
    examples: [
      ex('三点 差なら、もう 勝ったも 同然だ。', 'With a three-point lead, we have as good as won.', 'さんてん さなら、もう かったも どうぜんだ。'),
      ex('彼は 私にとって 家族も 同然の 存在だ。', 'He is practically family to me.', 'かれは わたしにとって かぞくも どうぜんの そんざいだ。'),
    ],
  },
  'n2m-g-a62613': {
    meaning: 'based on ~; using ~ as a basis',
    structure: 'N + を もとに（して）（を もとに した + N）',
    explanation:
      'をもとに names the source material from which something is created: 実話をもとにした映画 "a film based on a true story". It is used for creative works, plans and estimates.',
    functions: ['standard', 'means-methods'],
    examples: [
      ex('この 映画は 実際に あった 話を もとに 作られた。', 'This film was based on a true story.', 'この えいがは じっさいに あった はなしを もとに つくられた。'),
      ex('アンケートの 結果を もとに、新しい 商品を 考えた。', 'We came up with a new product based on the survey results.', 'あんけーとの けっかを もとに、あたらしい しょうひんを かんがえた。'),
    ],
  },
  'n2m-g-9cb9c3': {
    meaning: 'must; have to (literary)',
    structure: 'V-ない stem + ねば ならない（ねば ならぬ）；する → せねば',
    explanation:
      'ねばならない is the literary form of なければならない, found in writing and speeches: 我々は努力せねばならない. ねば alone can end a sentence in casual resolve: 行かねば "I must go". It sounds old-fashioned or solemn.',
    functions: ['necessary-obligation'],
    examples: [
      ex('この 問題は すぐに 解決せねば ならない。', 'This problem must be solved at once.', 'この もんだいは すぐに かいけつせねば ならない。'),
      ex('もう 遅い。そろそろ 帰らねば。', "It's late. I must be getting home.", 'もう おそい。そろそろ かえらねば。'),
    ],
  },
  'n2m-g-48657c': {
    meaning: 'not at all; not in the least',
    structure: 'ちっとも + negative',
    explanation:
      'ちっとも〜ない is a conversational "not at all", often with a note of complaint: ちっとも分からない "I don’t get it at all". 少しも is more neutral and formal. It is never used with affirmatives.',
    functions: ['emphasize-negative'],
    examples: [
      ex('彼の 話は ちっとも 面白く ない。', "His stories aren't interesting at all.", 'かれの はなしは ちっとも おもしろく ない。'),
      ex('待って いるのに、バスが ちっとも 来ない。', "I've been waiting, but the bus just isn't coming.", 'まって いるのに、ばすが ちっとも こない。'),
    ],
  },
  'n2m-g-d97ffc': {
    meaning: 'except ~; excluding ~',
    structure: 'N + を 除いて（を 除き／を 除く + N）',
    explanation:
      'を除いて excludes something from a general statement: 日曜日を除いて毎日営業 "open every day except Sunday". It is more formal than 以外. を除く + N modifies a noun: 一部を除く地域.',
    functions: ['exception'],
    examples: [
      ex('月曜日を 除いて、毎日 営業して います。', 'We are open every day except Monday.', 'げつようびを のぞいて、まいにち えいぎょうして います。'),
      ex('彼を 除いて、全員が 賛成した。', 'Everyone agreed except him.', 'かれを のぞいて、ぜんいんが さんせいした。'),
    ],
  },
  'n2m-g-7c0079': {
    meaning: 'immediately; at once (formal)',
    structure: '直ちに（ただちに）+ V',
    explanation:
      '直ちに is a formal "immediately", used in instructions, emergencies and announcements: 直ちに避難してください "evacuate immediately". In conversation すぐに is more natural.',
    functions: ['immediately-after'],
    examples: [
      ex('火災が 発生しました。直ちに 避難して ください。', 'A fire has broken out. Please evacuate immediately.', 'かさいが はっせいしました。ただちに ひなんして ください。'),
      ex('異常が あれば、直ちに 報告すること。', 'Report any abnormality immediately.', 'いじょうが あれば、ただちに ほうこくすること。'),
    ],
  },
  'n2m-g-ee03b7': {
    meaning: 'on the other hand; while ~; (V 一方だ) keep ~ing',
    structure: 'Plain form + 一方（で）, … ／ V-dict + 一方だ',
    explanation:
      '一方 contrasts two situations: 兄は明るい一方、弟は静かだ. As 一方だ after a verb, it means a trend continues in one direction, usually a bad one: 物価は上がる一方だ "prices just keep rising".',
    functions: ['contrast', 'trend'],
    examples: [
      ex('都会は 便利な 一方で、物価が 高い。', 'While cities are convenient, prices there are high.', 'とかいは べんりな いっぽうで、ぶっかが たかい。'),
      ex('最近、仕事が 増える 一方だ。', 'Lately my work just keeps increasing.', 'さいきん、しごとが ふえる いっぽうだ。'),
    ],
  },
  'n2m-g-0e20ef': {
    meaning: 'so-called; what is known as ~',
    structure: 'いわゆる + N',
    explanation:
      'いわゆる introduces a commonly used term: いわゆる「ブラック企業」 "a so-called exploitative company". Unlike English "so-called", it is usually neutral, just flagging a popular label.',
    functions: ['definition'],
    examples: [
      ex('彼は いわゆる 天才と いう 人だ。', 'He is what you would call a genius.', 'かれは いわゆる てんさいと いう ひとだ。'),
      ex('これが いわゆる 「日本式」の サービスです。', 'This is what is known as "Japanese-style" service.', 'これが いわゆる 「にほんしき」の さーびすです。'),
    ],
  },
  'n2m-g-a2d554': {
    meaning: 'if (it is like) ~, (it will not do)',
    structure: 'Plain form + ようでは, … (negative)',
    explanation:
      'ようでは takes an undesirable situation as a premise and warns of a bad result: こんなミスをするようでは、合格は無理だ "if you make mistakes like this, you won’t pass". It is critical in tone.',
    functions: ['condition', 'warning'],
    examples: [
      ex('毎日 遅刻する ようでは、信頼されない。', "If you're late every day, you won't be trusted.", 'まいにち ちこくする ようでは、しんらいされない。'),
      ex('この 程度で 疲れる ようでは、山登りは 無理だ。', 'If you tire this easily, mountain climbing is out of the question.', 'この ていどで つかれる ようでは、やまのぼりは むりだ。'),
    ],
  },
  'n2m-g-dc80ea': {
    meaning: 'under (guidance / conditions of) ~',
    structure: 'N + の 下（もと）で（の 下に）',
    explanation:
      'の下で (read もとで) means under someone’s guidance or under conditions: 先生の指導の下で研究する "research under the professor’s guidance", 厳しい条件の下で. It is formal.',
    functions: ['situation'],
    examples: [
      ex('有名な 先生の 指導の もとで、研究を 続けて いる。', 'I am continuing my research under the guidance of a famous professor.', 'ゆうめいな せんせいの しどうの もとで、けんきゅうを つづけて いる。'),
      ex('厳しい 条件の もとで、実験が 行われた。', 'The experiment was carried out under strict conditions.', 'きびしい じょうけんの もとで、じっけんが おこなわれた。'),
    ],
  },
  'n2m-g-4f28a6': {
    meaning: 'if (we assume) ~, then …',
    structure: 'Plain form + と すると',
    explanation:
      'とすると reasons from an assumption or from what was just learned: 彼の話が本当だとすると、大変だ "if what he says is true, it’s serious". It is close to とすれば and としたら.',
    functions: ['condition-assumption', 'deductive'],
    examples: [
      ex('一日 二時間 勉強すると すると、一年で 七百時間 以上に なる。', 'Assuming you study two hours a day, that comes to over seven hundred hours a year.', 'いちにち にじかん べんきょうすると すると、いちねんで ななひゃくじかん いじょうに なる。'),
      ex('彼が 犯人だと すると、全て 説明が つく。', 'If we assume he is the culprit, everything is explained.', 'かれが はんにんだと すると、すべて せつめいが つく。'),
    ],
  },
  'n2m-g-0c065e': {
    meaning: 'since ~ (so why not …)',
    structure: 'Plain form (Na な／N である) + ことだし, …',
    explanation:
      'ことだし gives a reason, often one of several, to justify a suggestion or decision: 天気もいいことだし、散歩しよう "the weather’s nice, so let’s go for a walk". It sounds relaxed and conversational.',
    functions: ['cause-reason', 'invite-suggest'],
    examples: [
      ex('天気も いい ことだし、公園に 行こうか。', "The weather's nice, so shall we go to the park?", 'てんきも いい ことだし、こうえんに いこうか。'),
      ex('仕事も 終わった ことだし、今日は 早く 帰ろう。', "Since the work's done, let's go home early today.", 'しごとも おわった ことだし、きょうは はやく かえろう。'),
    ],
  },
  'n2m-g-d7896c': {
    meaning: 'it would be bad if ~, (so) …',
    structure: 'V-dict + と いけないから（と いけないので）, …',
    explanation:
      'といけない says an undesirable outcome should be prevented, and the main clause gives the precaution: 雨が降るといけないから、傘を持って行く "in case it rains, I’ll take an umbrella". It expresses caution.',
    functions: ['warning', 'purpose-goal'],
    examples: [
      ex('忘れると いけないから、メモして おこう。', "I'll make a note in case I forget.", 'わすれると いけないから、めもして おこう。'),
      ex('風邪を ひくと いけないので、早く 寝なさい。', "Go to bed early so you don't catch a cold.", 'かぜを ひくと いけないので、はやく ねなさい。'),
    ],
  },
  'n2m-g-b37962': {
    meaning: 'setting ~ aside; leaving ~ for now',
    structure: 'N + は さておき',
    explanation:
      'はさておき sets aside one matter to focus on another: 冗談はさておき "joking aside", 費用はさておき. It is conversational but polite enough for meetings.',
    functions: ['exception', 'transfer-the-story'],
    examples: [
      ex('冗談は さておき、本題に 入りましょう。', "Joking aside, let's get down to business.", 'じょうだんは さておき、ほんだいに はいりましょう。'),
      ex('費用の 問題は さておき、まず 計画を 立てよう。', "Setting aside the question of cost, let's first make a plan.", 'ひようの もんだいは さておき、まず けいかくを たてよう。'),
    ],
  },
  'n2m-g-b438a7': {
    meaning: 'something (or other); somehow',
    structure: '何やら（なにやら）+ V／N',
    explanation:
      '何やら describes something the speaker cannot identify: 何やら騒がしい "there’s some kind of commotion". It is somewhat literary; 何か or なんだか is more everyday.',
    functions: ['vague'],
    examples: [
      ex('隣の 部屋から 何やら 変な 音が 聞こえる。', 'Some strange noise is coming from the next room.', 'となりの へやから なにやら へんな おとが きこえる。'),
      ex('二人は 何やら 楽しそうに 話して いる。', 'The two of them are chatting away happily about something.', 'ふたりは なにやら たのしそうに はなして いる。'),
    ],
  },
  'n2m-g-6a39d4': {
    meaning: 'might it not be that ~? (formal)',
    structure: 'Plain form (N／Na without だ) + では あるまいか',
    explanation:
      'ではあるまいか is a literary, cautious way to offer an opinion: 彼の説は正しいのではあるまいか "might his theory not be correct?". It is equivalent to ではないだろうか and found in essays.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('この 問題の 原因は、教育に あるのでは あるまいか。', 'Might the cause of this problem not lie in education?', 'この もんだいの げんいんは、きょういくに あるのでは あるまいか。'),
      ex('それは 少し 考えすぎでは あるまいか。', 'Isn’t that thinking too much, perhaps?', 'それは すこし かんがえすぎでは あるまいか。'),
    ],
  },
  'n2m-g-2ccf59': {
    meaning: 'the ~ itself; (Na そのもの) the very embodiment of ~',
    structure: 'N + その もの',
    explanation:
      'そのもの after a noun means "the thing itself", as opposed to related things: 計画そのものに問題がある "the plan itself is flawed". After a quality, it means "the very picture of": 真剣そのもの "utterly serious".',
    functions: ['emphasize'],
    examples: [
      ex('問題は 方法ではなく、計画 そのものに ある。', 'The problem lies not in the method but in the plan itself.', 'もんだいは ほうほうではなく、けいかく そのものに ある。'),
      ex('試合中の 彼の 顔は 真剣 そのものだった。', 'During the match his face was the very picture of seriousness.', 'しあいちゅうの かれの かおは しんけん そのものだった。'),
    ],
  },
  'n2m-g-3329c8': {
    meaning: 'on the contrary; far from it',
    structure: 'Sentence。それどころか、+ (opposite / more extreme)',
    explanation:
      'それどころか rejects the previous idea and presents something opposite or more extreme: 感謝されなかった。それどころか怒られた "I wasn’t thanked; on the contrary, I got scolded". It is emphatic.',
    functions: ['contrast', 'emphasize'],
    examples: [
      ex('病気は 治らなかった。それどころか、悪く なった。', "The illness didn't get better. On the contrary, it got worse.", 'びょうきは なおらなかった。それどころか、わるく なった。'),
      ex('彼は 謝らない。それどころか、私を 責めた。', "He didn't apologise. Far from it, he blamed me.", 'かれは あやまらない。それどころか、わたしを せめた。'),
    ],
  },
  'n2m-g-cadeaa': {
    meaning: 'without ~; leaving ~ out',
    structure: 'N + 抜きで（抜きの + N／抜きに して）',
    explanation:
      '抜きで means leaving something usual out: わさび抜きで "without wasabi", 冗談抜きで "all joking aside". 抜きにして is used for leaving a topic out of consideration.',
    functions: ['exception'],
    examples: [
      ex('すみません、わさび 抜きで お願いします。', 'Excuse me, without wasabi, please.', 'すみません、わさび ぬきで おねがいします。'),
      ex('冗談 抜きで、本当に 困って いるんだ。', "Joking aside, I'm really in trouble.", 'じょうだん ぬきで、ほんとうに こまって いるんだ。'),
    ],
  },
  'n2m-g-66e4be': {
    meaning: 'the reason is (that) ~; you see, ~',
    structure: 'Sentence。と いうのも、+ reason + からだ',
    explanation:
      'というのも introduces an explanation for what was just said: 最近忙しい。というのも、引っ越しの準備があるからだ. It is a little more conversational than なぜなら and closes with からだ or のだ.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('最近 寝不足だ。と いうのも、毎晩 遅くまで 仕事を して いるからだ。', "I'm short of sleep lately. That's because I work late every night.", 'さいきん ねぶそくだ。と いうのも、まいばん おそくまで しごとを して いるからだ。'),
      ex('今年は 旅行に 行かない。と いうのも、お金を 貯めたいからだ。', "I'm not going on a trip this year, the reason being that I want to save money.", 'ことしは りょこうに いかない。と いうのも、おかねを ためたいからだ。'),
    ],
  },
  'n2m-g-1a877b': {
    meaning: 'somehow; one way or another; barely',
    structure: 'どうにか + V（する／なる）',
    explanation:
      'どうにか describes managing something with difficulty: どうにか間に合った "somehow made it". どうにかしてください is a plea for any solution. It is close to なんとか.',
    functions: ['achievement', 'vague'],
    examples: [
      ex('走って、どうにか 最終電車に 間に合った。', 'I ran and somehow made the last train.', 'はしって、どうにか さいしゅうでんしゃに まにあった。'),
      ex('この 問題、どうにか ならないかな。', "I wonder if anything can be done about this problem.", 'この もんだい、どうにか ならないかな。'),
    ],
  },
  'n2m-g-7e1870': {
    meaning: 'in any case; either way (formal)',
    structure: 'いずれに せよ（いずれに しろ）、…',
    explanation:
      'いずれにせよ says that whichever option is true, the conclusion is the same: いずれにせよ、明日連絡します "either way, I’ll contact you tomorrow". It is formal and common in business.',
    functions: ['invariant'],
    examples: [
      ex('参加するか どうか、いずれに せよ ご連絡 ください。', 'Whether or not you will participate, please let us know either way.', 'さんかするか どうか、いずれに せよ ごれんらく ください。'),
      ex('いずれに せよ、結論は 来週に 出ます。', 'In any case, the decision will be made next week.', 'いずれに せよ、けつろんは らいしゅうに でます。'),
    ],
  },
  'n2m-g-afbb98': {
    meaning: 'to think that ~ (surprise / dismay)',
    structure: 'N／Na + だ なんて',
    explanation:
      'だなんて expresses surprise, disbelief or disapproval at a fact: 彼が犯人だなんて "to think he was the culprit!". It is conversational and emotional. After verbs, なんて alone is used.',
    functions: ['surprise', 'contemptuous'],
    examples: [
      ex('あの 静かな 彼が 歌手だ なんて、信じられない。', "I can't believe that quiet guy is a singer.", 'あの しずかな かれが かしゅだ なんて、しんじられない。'),
      ex('こんな 簡単な 問題が 無理だ なんて、言わせないよ。', "Don't tell me a problem this easy is impossible.", 'こんな かんたんな もんだいが むりだ なんて、いわせないよ。'),
    ],
  },
  'n2m-g-214d1a': {
    meaning: 'almost certainly ~ / surely not ~',
    structure: 'まず + plain form + だろう ／ まず + V-dict + まい',
    explanation:
      'まず with だろう or まい makes a confident prediction: まず間違いないだろう "it’s almost certainly right", まず来るまい "he surely won’t come". This まず means "in all likelihood", not "first".',
    functions: ['speculation', 'judge'],
    examples: [
      ex('この 天気なら、明日は まず 晴れる だろう。', 'With this weather, tomorrow will almost certainly be sunny.', 'この てんきなら、あしたは まず はれる だろう。'),
      ex('あれだけ 怒って いたから、彼は まず 来る まい。', 'He was so angry that he surely won’t come.', 'あれだけ おこって いたから、かれは まず くる まい。'),
    ],
  },
  'n2m-g-1b3c1f': {
    meaning: 'as might be expected; even (for someone like that) ~',
    structure: 'さすがに + Adj／V',
    explanation:
      'さすがに says that even someone strong or used to something has limits: さすがに疲れた "even I got tired", さすがに言いすぎだ. It concedes the natural reaction to an extreme situation.',
    functions: ['of-course', 'concessions'],
    examples: [
      ex('十時間 働いたら、さすがに 疲れた。', 'After ten hours of work, even I got tired.', 'じゅうじかん はたらいたら、さすがに つかれた。'),
      ex('毎日 カレーは、さすがに 飽きる。', 'Curry every day gets tiresome, as you would expect.', 'まいにち かれーは、さすがに あきる。'),
    ],
  },
  'n2m-g-6693c9': {
    meaning: 'unlike ~; different from ~',
    structure: 'N + と 違って（と は 違い）',
    explanation:
      'と違って contrasts two things: 兄と違って、弟は静かだ "unlike his brother, the younger one is quiet". It sets up a difference that the main clause states. とは違い is more formal.',
    functions: ['contrast', 'compare'],
    examples: [
      ex('姉と 違って、私は 料理が 苦手だ。', "Unlike my sister, I'm bad at cooking.", 'あねと ちがって、わたしは りょうりが にがてだ。'),
      ex('去年と 違って、今年の 夏は 涼しい。', 'Unlike last year, this summer is cool.', 'きょねんと ちがって、ことしの なつは すずしい。'),
    ],
  },
  'n2m-g-a18e4f': {
    meaning: 'the fact that ~ means …',
    structure: 'Plain form + と いう ことは, … と いう ことだ',
    explanation:
      'ということは〜ということだ draws a logical conclusion from a fact: 返事がないということは、忙しいということだ "no reply means he’s busy". It is common in reasoning and confirming understanding.',
    functions: ['definition', 'deductive'],
    examples: [
      ex('電気が 消えて いると いう ことは、誰も いないと いう ことだ。', "The lights being off means no one is home.", 'でんきが きえて いると いう ことは、だれも いないと いう ことだ。'),
      ex('彼が 謝ったと いう ことは、自分が 悪いと 認めたと いう ことだ。', 'His apologising means he admitted he was in the wrong.', 'かれが あやまったと いう ことは、じぶんが わるいと みとめたと いう ことだ。'),
    ],
  },
  'n2m-g-61f2f3': {
    meaning: "can't (afford to) keep ~ing / stay ~",
    structure: 'V-て + は いられない ／ N・Na + では いられない',
    explanation:
      'てはいられない says a situation cannot continue because something urgent demands action: のんびりしてはいられない "can’t afford to relax". It often expresses urgency or impatience.',
    functions: ['ability', 'negative'],
    examples: [
      ex('試験まで あと 一週間だ。遊んでは いられない。', "The exam is only a week away. I can't afford to play around.", 'しけんまで あと いっしゅうかんだ。あそんでは いられない。'),
      ex('こんな 時に、黙って 見て は いられない。', "At a time like this, I can't just stand by and watch.", 'こんな ときに、だまって みて は いられない。'),
    ],
  },
  'n2m-g-6e3942': {
    meaning: 'leave (something) not done; deliberately not ~',
    structure: 'V-ない + で おく',
    explanation:
      'ないでおく means deliberately leaving something undone for a reason: 驚かせたいから、まだ言わないでおこう "let’s not tell him yet, so it’s a surprise". It is the negative of ておく.',
    functions: ['action-status', 'intent'],
    examples: [
      ex('驚かせたいから、まだ 彼には 言わないで おこう。', "I want to surprise him, so let's not tell him yet.", 'おどろかせたいから、まだ かれには いわないで おこう。'),
      ex('明日 使うので、片付けないで おいて ください。', 'Please leave it out, as I will use it tomorrow.', 'あした つかうので、かたづけないで おいて ください。'),
    ],
  },
  'n2m-g-e0684f': {
    meaning: 'it looks as though ~',
    structure: 'どうやら + V-ます stem + そうだ',
    explanation:
      'どうやら with the appearance そうだ describes something that looks likely from current signs: どうやら雨が降りそうだ "it looks like rain". It is a judgement from appearance, not hearsay.',
    functions: ['speculation'],
    examples: [
      ex('どうやら 雨が 降りそうだ。傘を 持って いこう。', "It looks like it's going to rain. Let's take an umbrella.", 'どうやら あめが ふりそうだ。かさを もって いこう。'),
      ex('この 様子だと、どうやら 間に合いそうだ。', 'At this rate, it looks as if we will make it.', 'この ようすだと、どうやら まにあいそうだ。'),
    ],
  },
  'n2m-g-12a716': {
    meaning: 'to correspond to ~; to be (equivalent to) ~',
    structure: 'N1 は N2 に あたる',
    explanation:
      'にあたる says one thing corresponds to another: 彼は私のいとこにあたる "he is my cousin", 今年の元日は日曜日にあたる "New Year’s Day falls on a Sunday". It is used for relationships, dates and equivalents.',
    functions: ['definition'],
    examples: [
      ex('この 方は 私の 祖父の 弟に あたる。', 'This person is my grandfather’s younger brother.', 'この かたは わたしの そふの おとうとに あたる。'),
      ex('今年の 誕生日は 日曜日に あたる。', 'My birthday falls on a Sunday this year.', 'ことしの たんじょうびは にちようびに あたる。'),
    ],
  },
  'n2m-g-3d9cb1': {
    meaning: 'to be composed of ~ (成る)',
    structure: 'N + から 成る（成り立つ）',
    explanation:
      'から成る (kanji spelling of からなる) describes the parts a whole is made of: この委員会は五人から成る. から成り立つ stresses structure: 日本語は漢字とかなから成り立っている. It is written style.',
    functions: ['describe', 'status'],
    examples: [
      ex('この 委員会は 七人の 委員から 成る。', 'This committee is composed of seven members.', 'この いいんかいは しちにんの いいんから なる。'),
      ex('日本語の 文字は 漢字と かなから 成り立って いる。', 'Japanese script is made up of kanji and kana.', 'にほんごの もじは かんじと かなから なりたって いる。'),
    ],
  },
  'n2m-g-5be567': {
    meaning: 'once ~ (it is hard to reverse)',
    structure: 'いったん + V-ば／V-たら／V-dict + と, …',
    explanation:
      'いったん marks an action whose effect continues once started: いったん始めたら、最後までやる "once you start, see it through". It often implies difficulty stopping or undoing. 一度 is similar but less emphatic.',
    functions: ['condition'],
    examples: [
      ex('いったん 決めたら、最後まで やり通す べきだ。', 'Once you have decided, you should see it through.', 'いったん きめたら、さいごまで やりとおす べきだ。'),
      ex('いったん 信用を 失うと、取り戻すのは 難しい。', 'Once trust is lost, it is hard to regain.', 'いったん しんようを うしなうと、とりもどすのは むずかしい。'),
    ],
  },
  'n2m-g-392e90': {
    meaning: 'must be ~; there is no doubt that ~',
    structure: 'Plain form (N／Na without だ) + に 違いない',
    explanation:
      'に違いない expresses strong conviction based on reasoning or intuition: 彼が犯人に違いない "he must be the culprit". It is more subjective than はずだ and a little written; in speech, きっと〜と思う is common.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('部屋の 電気が ついて いる。彼は 家に いるに 違いない。', 'The light is on. He must be at home.', 'へやの でんきが ついて いる。かれは いえに いるに ちがいない。'),
      ex('あれほど 練習したのだから、合格するに 違いない。', 'After practising that much, she is bound to pass.', 'あれほど れんしゅうしたのだから、ごうかくするに ちがいない。'),
    ],
  },
  'n2m-g-bddd1a': {
    meaning: 'that much; (with negative) not that ~',
    structure: 'それほど + Adj／V ／ それほど + negative',
    explanation:
      'それほど refers to a degree just mentioned: それほど好きなら "if you like it that much". With a negative, it means "not especially": それほど難しくない. It is a little more formal than そんなに.',
    functions: ['level'],
    examples: [
      ex('試験は それほど 難しく なかった。', "The exam wasn't that difficult.", 'しけんは それほど むずかしく なかった。'),
      ex('それほど 行きたいなら、一緒に 行こう。', "If you want to go that much, let's go together.", 'それほど いきたいなら、いっしょに いこう。'),
    ],
  },
  'n2m-g-22f349': {
    meaning: 'is the very picture of ~; nothing but ~',
    structure: 'Na／N + そのものだ',
    explanation:
      'そのものだ after a quality means someone is the perfect embodiment of it: 彼女は健康そのものだ "she is the picture of health". It is emphatic praise or description.',
    functions: ['emphasize', 'describe'],
    examples: [
      ex('祖母は 九十歳だが、健康 そのものだ。', 'My grandmother is ninety, but she is the picture of health.', 'そぼは きゅうじゅっさいだが、けんこう そのものだ。'),
      ex('彼の 仕事ぶりは 真面目 そのものだ。', 'His way of working is diligence itself.', 'かれの しごとぶりは まじめ そのものだ。'),
    ],
  },
  'n2m-g-091358': {
    meaning: 'even if ~, (it would be no use)',
    structure: 'V-た + ところで, … (negative／no use)',
    explanation:
      'たところで says that even if one did something, it would not help: 今から急いだところで、間に合わない "even if we hurry now, we won’t make it". The main clause is negative or dismissive.',
    functions: ['concessions', 'negative'],
    examples: [
      ex('今から 謝った ところで、許して もらえない だろう。', 'Even if I apologised now, I doubt I would be forgiven.', 'いまから あやまった ところで、ゆるして もらえない だろう。'),
      ex('いくら 考えた ところで、答えは 出ない。', 'However much you think about it, you won’t find an answer.', 'いくら かんがえた ところで、こたえは でない。'),
    ],
  },
  'n2m-g-37cdda': {
    meaning: 'the moment ~; just as ~ (something happened)',
    structure: 'V-た + 途端（に）',
    explanation:
      '途端に says something happened immediately after, usually unexpectedly: 立ち上がった途端に、めまいがした. The second event is outside the speaker’s control. This is the kanji spelling of とたん.',
    functions: ['immediately-after', 'unexpected-outcome'],
    examples: [
      ex('家に 着いた 途端に、雨が 降り出した。', 'The moment I got home, it started to rain.', 'いえに ついた とたんに、あめが ふりだした。'),
      ex('電話を 切った 途端に、また かかって きた。', 'Just as I hung up, the phone rang again.', 'でんわを きった とたんに、また かかって きた。'),
    ],
  },
  'n2m-g-cd196a': {
    meaning: 'even though ~ (and yet, surprisingly)',
    structure: 'Plain form + と いうのに',
    explanation:
      'というのに expresses frustration or surprise at a situation that contradicts expectations: 明日は試験だというのに、弟はゲームばかりしている. It is stronger and more emotional than のに.',
    functions: ['unexpected-outcome', 'criticize'],
    examples: [
      ex('明日は 試験だと いうのに、弟は 遊んで ばかり いる。', "The exam is tomorrow, yet my brother does nothing but play.", 'あしたは しけんだと いうのに、おとうとは あそんで ばかり いる。'),
      ex('もう 春だと いうのに、まだ 雪が 降って いる。', "It's already spring, and yet it's still snowing.", 'もう はるだと いうのに、まだ ゆきが ふって いる。'),
    ],
  },
  'n2m-g-d1faeb': {
    meaning: 'and so it was that ~ (narrative close)',
    structure: 'Plain form + の であった（のだった）',
    explanation:
      'のであった is used at the end of narratives to state an outcome with a reflective, emotional tone: こうして二人は再会したのであった "and so it was that the two met again". It is literary.',
    functions: ['explain', 'conclude'],
    examples: [
      ex('こうして、二人は 十年 ぶりに 再会したので あった。', 'And so it was that the two met again after ten years.', 'こうして、ふたりは じゅうねん ぶりに さいかいしたので あった。'),
      ex('その 日から、彼の 新しい 人生が 始まったので あった。', 'From that day, his new life began.', 'その ひから、かれの あたらしい じんせいが はじまったので あった。'),
    ],
  },
  'n2m-g-22a451': {
    meaning: 'just when I thought ~, (then) …',
    structure: 'V-た + か と 思ったら',
    explanation:
      'かと思ったら describes a quick change right after something: 帰ってきたかと思ったら、また出かけた "no sooner had he come home than he went out again". It expresses surprise at the speed of the change.',
    functions: ['immediately-after', 'unexpected-outcome'],
    examples: [
      ex('息子は 帰って きたかと 思ったら、すぐ 出かけて しまった。', 'No sooner had my son come home than he went out again.', 'むすこは かえって きたかと おもったら、すぐ でかけて しまった。'),
      ex('静かに なったかと 思ったら、また 騒ぎ始めた。', 'Just when it had gone quiet, they started making noise again.', 'しずかに なったかと おもったら、また さわぎはじめた。'),
    ],
  },
  'n2m-g-3041f2': {
    meaning: 'soon (after); before long',
    structure: 'ほどなく（ほどなくして）+ V-た',
    explanation:
      'ほどなく says that something happened not long after a previous event: 出発してほどなく雨が降り出した "shortly after we set off, it started raining". It is written style; まもなく is close.',
    functions: ['time-sequence', 'short-time'],
    examples: [
      ex('家を 出て ほどなく、雨が 降り出した。', 'Shortly after I left home, it began to rain.', 'いえを でて ほどなく、あめが ふりだした。'),
      ex('電話を して ほどなく、救急車が 来た。', 'The ambulance came soon after I called.', 'でんわを して ほどなく、きゅうきゅうしゃが きた。'),
    ],
  },
  'n2m-g-c57036': {
    meaning: 'either way; in any case',
    structure: 'いずれに しても、…',
    explanation:
      'いずれにしても says the conclusion holds whichever option is true: 行くにしても行かないにしても、いずれにしても連絡して. It is slightly less formal than いずれにせよ.',
    functions: ['invariant', 'concessions'],
    examples: [
      ex('いずれに しても、明日までに 決めなければ ならない。', 'Either way, we have to decide by tomorrow.', 'いずれに しても、あしたまでに きめなければ ならない。'),
      ex('電車でも バスでも、いずれに しても 一時間は かかる。', 'By train or by bus, it will take an hour either way.', 'でんしゃでも ばすでも、いずれに しても いちじかんは かかる。'),
    ],
  },
  'n2m-g-4cc73e': {
    meaning: 'unlikely to ~; no sign of ~',
    structure: 'V-ます stem + そうに ない／そうも ない',
    explanation:
      'そうにない predicts from current signs that something will not happen: 今日中には終わりそうにない "it doesn’t look like it will be done today". そうもない is slightly more emphatic.',
    functions: ['speculation', 'negative'],
    examples: [
      ex('この 渋滞では、約束の 時間に 間に合いそうに ない。', "With this traffic, it doesn't look like we'll make it on time.", 'この じゅうたいでは、やくそくの じかんに まにあいそうに ない。'),
      ex('雪は まだ やみそうも ない。', 'The snow shows no sign of stopping.', 'ゆきは まだ やみそうも ない。'),
    ],
  },
  'n2m-g-1d7257': {
    meaning: 'more or less; tentatively; for the time being',
    structure: '一応（いちおう）+ V',
    explanation:
      '一応 means doing something to a minimum or provisional standard: 一応終わった "it’s done, more or less", 一応確認しておく "I’ll check, just in case". It often signals modesty or caution.',
    functions: ['vague', 'limit'],
    examples: [
      ex('レポートは 一応 書き終わりました。', 'I have more or less finished writing the report.', 'れぽーとは いちおう かきおわりました。'),
      ex('大丈夫だと 思うけど、一応 確認して おこう。', "I think it's fine, but let's check just in case.", 'だいじょうぶだと おもうけど、いちおう かくにんして おこう。'),
    ],
  },
  'n2m-g-c746de': {
    meaning: 'when ~; on the occasion of ~ (formal)',
    structure: 'N の／V + 際（に／は）',
    explanation:
      '際 is a formal "when, at the time of": お帰りの際は "when you leave", 緊急の際には "in an emergency". It is common in notices, instructions and business Japanese; とき is the everyday word.',
    functions: ['time-situation'],
    examples: [
      ex('お帰りの 際は、忘れ物に ご注意 ください。', 'When you leave, please be careful not to forget anything.', 'おかえりの さいは、わすれものに ごちゅうい ください。'),
      ex('緊急の 際には、この 番号に 電話して ください。', 'In an emergency, please call this number.', 'きんきゅうの さいには、この ばんごうに でんわして ください。'),
    ],
  },
  'n2m-g-610ce4': {
    meaning: 'and; as well as (formal)',
    structure: 'N1 及び（および）N2',
    explanation:
      '及び is a formal "and", used in documents, law and official writing: 住所及び電話番号 "address and phone number". In ordinary writing と or や is used.',
    functions: ['add', 'listed'],
    examples: [
      ex('氏名 及び 住所を ご記入 ください。', 'Please fill in your name and address.', 'しめい および じゅうしょを ごきにゅう ください。'),
      ex('会議には 部長 及び 課長が 出席します。', 'The department head and the section chief will attend the meeting.', 'かいぎには ぶちょう および かちょうが しゅっせきします。'),
    ],
  },
  'n2m-g-9af5c7': {
    meaning: 'since it is ~ (knowing them), …',
    structure: 'N（person）+ の こと だから, …',
    explanation:
      'のことだから uses what the speaker knows about someone’s character to make a guess: 真面目な彼のことだから、遅れないだろう "knowing how conscientious he is, he won’t be late". The main clause is a judgement.',
    functions: ['grounds', 'speculation'],
    examples: [
      ex('時間に 厳しい 彼の ことだから、もう 来て いる だろう。', 'Knowing how punctual he is, he is probably here already.', 'じかんに きびしい かれの ことだから、もう きて いる だろう。'),
      ex('優しい 母の ことだから、きっと 許して くれる。', 'Knowing how kind my mother is, she will surely forgive me.', 'やさしい ははの ことだから、きっと ゆるして くれる。'),
    ],
  },
  'n2m-g-a708ec': {
    meaning: 'as if ~ (though it is not so)',
    structure: 'Plain form + か の ようだ（かのように V／かのような N）',
    explanation:
      'かのようだ describes something that seems like a certain situation but actually is not: 何もなかったかのように話す "talk as if nothing had happened". It is more literary and more clearly counterfactual than ようだ.',
    functions: ['similarity-degree'],
    examples: [
      ex('彼は 何も 知らないかの ように 振る舞った。', 'He acted as if he knew nothing.', 'かれは なにも しらないかの ように ふるまった。'),
      ex('まるで 春が 来たかの ような 暖かさだ。', 'It is so warm it is as if spring had come.', 'まるで はるが きたかの ような あたたかさだ。'),
    ],
  },
  'n2m-g-d3c7a0': {
    meaning: 'there is a risk that ~; may (something bad)',
    structure: 'V-dict／N の + 恐れが ある',
    explanation:
      '恐れがある warns of the possibility of something bad: 台風が上陸する恐れがある "there is a risk the typhoon will make landfall". It is formal and typical of news and warnings; it is never used for good outcomes.',
    functions: ['warning', 'speculation'],
    examples: [
      ex('明日は 大雨に なる 恐れが あります。', 'There is a risk of heavy rain tomorrow.', 'あしたは おおあめに なる おそれが あります。'),
      ex('この 薬は 眠く なる 恐れが あるので、運転は 控えて ください。', 'This medicine may cause drowsiness, so please avoid driving.', 'この くすりは ねむく なる おそれが あるので、うんてんは ひかえて ください。'),
    ],
  },
  'n2m-g-7b8e5e': {
    meaning: "can't stand ~; it would be unbearable",
    structure: 'V-て／Adj-くて + は かなわない',
    explanation:
      'てはかなわない says a situation is more than one can bear: こう暑くてはかなわない "I can’t stand this heat". It expresses complaint. かなわない alone also means "no match for": 彼にはかなわない.',
    functions: ['feel', 'negative'],
    examples: [
      ex('毎日 こう 暑くては かなわない。', "I can't stand this heat every day.", 'まいにち こう あつくては かなわない。'),
      ex('料理の 腕では、母には かなわない。', "When it comes to cooking, I'm no match for my mother.", 'りょうりの うでは、ははには かなわない。'),
    ],
  },
  'n2m-g-7df4cd': {
    meaning: 'when I (did) ~, (I found that) …',
    structure: 'V-た + ところ, …',
    explanation:
      'たところ reports the result or discovery following an action: 問い合わせたところ、もう売り切れだった "when I enquired, it was already sold out". It is formal and the second half is a fact, not an intention.',
    functions: ['unexpected-outcome', 'result'],
    examples: [
      ex('店に 電話した ところ、今日は 休みだった。', 'When I phoned the shop, it turned out to be closed today.', 'みせに でんわした ところ、きょうは やすみだった。'),
      ex('先生に 相談した ところ、快く 引き受けて くださった。', 'When I consulted my teacher, she kindly agreed to help.', 'せんせいに そうだんした ところ、こころよく ひきうけて くださった。'),
    ],
  },
  'n2m-g-882675': {
    meaning: 'even so; all the same; (still,) really',
    structure: 'Sentence。それに しても、…',
    explanation:
      'それにしても accepts what was said but still expresses surprise or feeling about it: 忙しいのは分かる。それにしても連絡くらいできるだろう. At the start of a remark it can also mean "anyway, really": それにしても暑いね.',
    functions: ['concessions'],
    examples: [
      ex('事情は 分かった。それに しても、連絡くらい ほしかった。', 'I understand the situation. Even so, I would have liked a message.', 'じじょうは わかった。それに しても、れんらくくらい ほしかった。'),
      ex('それに しても、今日は 本当に 暑いね。', 'Anyway, it really is hot today.', 'それに しても、きょうは ほんとうに あついね。'),
    ],
  },
  'n2m-g-fd63d1': {
    meaning: 'depending on ~; (次第では) in some cases',
    structure: 'N + 次第で（次第では／次第だ）',
    explanation:
      '次第で says an outcome varies with a factor: 天気次第で予定を変える "change the plan depending on the weather". 次第では points to a possible, often negative, case: 結果次第では中止もある.',
    functions: ['standard', 'condition'],
    examples: [
      ex('天気 次第で、明日の 予定を 決めよう。', "Let's decide tomorrow's plans depending on the weather.", 'てんき しだいで、あしたの よていを きめよう。'),
      ex('検査の 結果 次第では、入院が 必要に なる。', 'Depending on the test results, hospitalisation may be necessary.', 'けんさの けっか しだいでは、にゅういんが ひつように なる。'),
    ],
  },
  'n2m-g-243e3c': {
    meaning: 'concerning ~; affecting ~ (seriously)',
    structure: 'N + に かかわる（に かかわって）',
    explanation:
      'にかかわる says something affects an important matter: 命にかかわる病気 "a life-threatening illness", 会社の信用にかかわる問題. It stresses seriousness and is often written 関わる.',
    functions: ['story-topic', 'judge'],
    examples: [
      ex('これは 命に かかわる 問題だ。', 'This is a matter of life and death.', 'これは いのちに かかわる もんだいだ。'),
      ex('そんな ミスは、会社の 信用に かかわる。', 'A mistake like that affects the company’s reputation.', 'そんな みすは、かいしゃの しんように かかわる。'),
    ],
  },
  'n2m-g-8aefac': {
    meaning: 'with much trouble / specially (so it would be a waste not to)',
    structure: 'せっかく + V-た のに ／ せっかく の + N ／ せっかく だから',
    explanation:
      'せっかく marks an effort or rare chance that should not be wasted: せっかく来たのに休みだった "I came all this way, but it was closed". With だから it urges making the most of it: せっかくだから、食べていこう.',
    functions: ['regret', 'invite-suggest'],
    examples: [
      ex('せっかく 作った 料理を、誰も 食べなかった。', 'No one ate the food I had gone to the trouble of making.', 'せっかく つくった りょうりを、だれも たべなかった。'),
      ex('せっかく 京都に 来たんだから、お寺を 見に 行こう。', "Since we've come all the way to Kyoto, let's go and see the temples.", 'せっかく きょうとに きたんだから、おてらを みに いこう。'),
    ],
  },
  'n2m-g-4adb14': {
    meaning: 'terribly ~; can’t help ~',
    structure: 'V-て／Adj-くて + 仕方が ない（しょうが ない）',
    explanation:
      'て仕方がない says a feeling or sensation is so strong one cannot control it: 眠くて仕方がない "I’m so sleepy", 気になって仕方がない. てしょうがない is the casual form. It is close to てたまらない.',
    functions: ['feel', 'level'],
    examples: [
      ex('試験の 結果が 気に なって 仕方が ない。', "I can't stop worrying about the exam results.", 'しけんの けっかが きに なって しかたが ない。'),
      ex('昨夜 寝て いないので、眠くて しょうが ない。', "I didn't sleep last night, so I'm terribly sleepy.", 'ゆうべ ねて いないので、ねむくて しょうが ない。'),
    ],
  },
  'n2m-g-6e693f': {
    meaning: 'in terms of ~; from the standpoint of ~',
    structure: 'N + から いうと（から いえば／から いって）',
    explanation:
      'からいうと evaluates something from a particular standard: 値段からいうと、こちらがお得だ "in terms of price, this one is a better deal". It names a criterion rather than a person’s view.',
    functions: ['perspective-way', 'standard'],
    examples: [
      ex('品質から いうと、こちらの 方が いい。', 'In terms of quality, this one is better.', 'ひんしつから いうと、こちらの ほうが いい。'),
      ex('経験から いえば、彼の 方が 適任だ。', 'In terms of experience, he is better suited.', 'けいけんから いえば、かれの ほうが てきにんだ。'),
    ],
  },
  'n2m-g-5cc605': {
    meaning: 'when (the occasion comes); at the time of ~',
    structure: 'N の／V + 折（おり）に（は）',
    explanation:
      '折には is a polite, formal "when, on the occasion": お近くにお越しの折には、お立ち寄りください "when you are in the area, please drop by". It is common in letters and greetings.',
    functions: ['time-situation'],
    examples: [
      ex('お近くに お越しの 折には、ぜひ お立ち寄り ください。', 'When you are in the area, please do drop in.', 'おちかくに おこしの おりには、ぜひ おたちより ください。'),
      ex('京都を 訪れた 折に、昔の 友人と 会った。', 'When I visited Kyoto, I met an old friend.', 'きょうとを おとずれた おりに、むかしの ゆうじんと あった。'),
    ],
  },
  'n2m-g-912f4b': {
    meaning: 'get by without ~ing; be spared ~',
    structure: 'V-ない stem + ずに 済む（する → せずに 済む）',
    explanation:
      'ずに済む says something unpleasant turned out not to be necessary: 手術をせずに済んだ "I was spared surgery". It is the written form of ないで済む and expresses relief.',
    functions: ['negative', 'result'],
    examples: [
      ex('早めに 気づいたので、大きな 問題に ならずに 済んだ。', 'Because we noticed early, it did not turn into a big problem.', 'はやめに きづいたので、おおきな もんだいに ならずに すんだ。'),
      ex('友達が 貸して くれたので、新しいのを 買わずに 済んだ。', 'A friend lent me one, so I did not have to buy a new one.', 'ともだちが かして くれたので、あたらしいのを かわずに すんだ。'),
    ],
  },
  'n2m-g-86cdb3': {
    meaning: 'unavoidably; reluctantly (having no choice)',
    structure: 'やむを 得ず（やむを えず）+ V',
    explanation:
      'やむを得ず says an action was taken because there was no other choice: やむを得ず中止した "we reluctantly cancelled". やむを得ない means "unavoidable": やむを得ない事情. It is formal.',
    functions: ['forced'],
    examples: [
      ex('大雨の ため、やむを 得ず 試合を 中止した。', 'Because of heavy rain, we had no choice but to cancel the match.', 'おおあめの ため、やむを えず しあいを ちゅうしした。'),
      ex('やむを 得ない 事情で、会議を 欠席します。', 'Due to unavoidable circumstances, I will be absent from the meeting.', 'やむを えない じじょうで、かいぎを けっせきします。'),
    ],
  },
  'n2m-g-05e513': {
    meaning: 'nothing in particular (worth mentioning)',
    structure: 'これと いって + N + は ない',
    explanation:
      'これといって〜ない says there is nothing specific to point out: これといって趣味はない "I have no hobby in particular". It is a modest or neutral way to say "nothing special".',
    functions: ['negative', 'vague'],
    examples: [
      ex('これと いって 特技は ありません。', 'I have no special skills to speak of.', 'これと いって とくぎは ありません。'),
      ex('週末は これと いって する ことが なかった。', "I didn't have anything in particular to do at the weekend.", 'しゅうまつは これと いって する ことが なかった。'),
    ],
  },
  'n2m-g-9ddae1': {
    meaning: 'in the end; ultimately (after a long process)',
    structure: 'ついには + V-た',
    explanation:
      'ついには describes the final outcome after a series of events, often an extreme one: ついには倒れてしまった "in the end he collapsed". It stresses the progression toward that result.',
    functions: ['result', 'finish'],
    examples: [
      ex('無理を 続けて、ついには 病気に なって しまった。', 'He kept overdoing it and in the end fell ill.', 'むりを つづけて、ついには びょうきに なって しまった。'),
      ex('何度も 挑戦し、ついには 世界記録を 出した。', 'After trying many times, she finally set a world record.', 'なんども ちょうせんし、ついには せかいきろくを だした。'),
    ],
  },
  'n2m-g-89e957': {
    meaning: 'in this connection; therefore (request follows)',
    structure: 'Sentence。ついては、+ request',
    explanation:
      'ついては introduces a request or action based on the previous statement: 来月引っ越します。ついては、住所変更をお願いします. It is formal; つきましては is the humbler version for letters.',
    functions: ['cause-reason', 'request'],
    examples: [
      ex('新しい 担当者が 決まりました。ついては、ご挨拶に 伺います。', 'A new person has been put in charge. Accordingly, they will come to greet you.', 'あたらしい たんとうしゃが きまりました。ついては、ごあいさつに うかがいます。'),
      ex('会場が 変わりました。ついては、ご注意 ください。', 'The venue has changed. Please take note.', 'かいじょうが かわりました。ついては、ごちゅうい ください。'),
    ],
  },
  'n2m-g-9a4f94': {
    meaning: 'to face; to be suited to (V-stem + 向き)',
    structure: 'N（方向）を 向く ／ N に 向いて いる',
    explanation:
      '向く means to turn or face a direction: 前を向く "face forward". に向いている means "be suited to": 彼は先生に向いている "he is cut out to be a teacher". The noun 向き means "suitable for" or "facing".',
    functions: ['direction', 'characteristics'],
    examples: [
      ex('写真を 撮るので、こちらを 向いて ください。', "I'm taking a photo, so please look this way.", 'しゃしんを とるので、こちらを むいて ください。'),
      ex('彼は 人と 話すのが 好きで、営業に 向いて いる。', 'He likes talking to people and is well suited to sales.', 'かれは ひとと はなすのが すきで、えいぎょうに むいて いる。'),
    ],
  },
  'n2m-g-e6db45': {
    meaning: "isn't there some way to ~?; if only ~",
    structure: 'V-ない + もの か（ものだろうか）',
    explanation:
      'ないものか expresses a strong wish that something could be achieved: なんとか助からないものか "isn’t there some way to save him?". It often follows なんとか. It is emotional and slightly literary.',
    functions: ['wish'],
    examples: [
      ex('何とか この 問題を 解決できない ものか。', "Isn't there some way we can solve this problem?", 'なんとか この もんだいを かいけつできない ものか。'),
      ex('もっと 安く 旅行できない ものだろうか。', 'Is there no way to travel more cheaply?', 'もっと やすく りょこうできない ものだろうか。'),
    ],
  },
  'n2m-g-7ae5e1': {
    meaning: 'fortunately; luckily',
    structure: '幸いな ことに（幸い）、+ clause',
    explanation:
      '幸いなことに introduces a fortunate fact, often amid bad news: 幸いなことに、けが人はいなかった "fortunately, no one was injured". It is a little formal; 幸い alone works the same way.',
    functions: ['exclamatory', 'feel'],
    examples: [
      ex('事故は 大きかったが、幸いな ことに けが人は 出なかった。', 'It was a big accident, but fortunately no one was hurt.', 'じこは おおきかったが、さいわいな ことに けがにんは でなかった。'),
      ex('幸い、雨は 試合の 前に やんだ。', 'Luckily, the rain stopped before the match.', 'さいわい、あめは しあいの まえに やんだ。'),
    ],
  },
  'n2m-g-c30b4d': {
    meaning: 'without ~ (it cannot be ~)',
    structure: 'N + を 抜きに して（は）+ V-potential negative',
    explanation:
      'を抜きにしては〜ない says something is impossible without a key element: 彼の協力を抜きにしては成功しなかった "it wouldn’t have succeeded without his help". It stresses the element’s importance.',
    functions: ['condition-requirement', 'negative'],
    examples: [
      ex('この 成功は、チームの 努力を 抜きに しては 語れない。', 'This success cannot be discussed without mentioning the team’s efforts.', 'この せいこうは、ちーむの どりょくを ぬきに しては かたれない。'),
      ex('日本の 食文化は、米を 抜きに しては 考えられない。', 'Japanese food culture is unthinkable without rice.', 'にほんの しょくぶんかは、こめを ぬきに しては かんがえられない。'),
    ],
  },
  'n2m-g-194e30': {
    meaning: 'if it comes to ~; if that is the case',
    structure: 'Plain form + と なれば',
    explanation:
      'となれば considers what follows when a situation arises: 引っ越すとなれば、準備が大変だ "if it comes to moving, the preparations will be tough". It often implies a serious or new consequence.',
    functions: ['condition'],
    examples: [
      ex('海外に 住むと なれば、言葉を 勉強しなければ ならない。', 'If it comes to living abroad, I will have to study the language.', 'かいがいに すむと なれば、ことばを べんきょうしなければ ならない。'),
      ex('社長が 来ると なれば、準備を し直さないと。', 'If the president is coming, we will have to redo the preparations.', 'しゃちょうが くると なれば、じゅんびを しなおさないと。'),
    ],
  },
  'n2m-g-573801': {
    meaning: 'tend to ~ (undesirable tendency)',
    structure: 'とかく + V-ます stem + がちだ（V-やすい）',
    explanation:
      'とかく marks a general tendency, usually a bad one, and pairs with がち or やすい: 忙しいと、とかく食事が不規則になりがちだ "when busy, meals tend to become irregular". It is written style.',
    functions: ['trend'],
    examples: [
      ex('冬は とかく 運動不足に なりがちだ。', 'In winter we tend to get too little exercise.', 'ふゆは とかく うんどうぶそくに なりがちだ。'),
      ex('人は とかく 自分に 甘く なりがちだ。', 'People tend to be easy on themselves.', 'ひとは とかく じぶんに あまく なりがちだ。'),
    ],
  },
  'n2m-g-8125cc': {
    meaning: 'when it comes to ~ (it is a different matter)',
    structure: 'N（の こと）+ と なれば／と なると',
    explanation:
      'N (のこと) となれば focuses on a particular topic, often one that changes someone’s behaviour: 子供のこととなれば、親は必死になる "when it comes to their children, parents become desperate". となると is interchangeable here; the pattern often introduces unusual eagerness or seriousness.',
    functions: ['condition', 'story-topic'],
    examples: [
      ex('子供の ことと なれば、親は 何でも する。', 'When it comes to their children, parents will do anything.', 'こどもの ことと なれば、おやは なんでも する。'),
      ex('料理の ことと なれば、彼女に 任せて おけば 安心だ。', 'When it comes to cooking, you can safely leave it to her.', 'りょうりの ことと なれば、かのじょに まかせて おけば あんしんだ。'),
    ],
  },
  'n2m-g-1ca998': {
    meaning: 'above all; after all (the most important point)',
    structure: 'なんと いっても + clause',
    explanation:
      'なんといっても singles out the decisive point: 京都の魅力は、なんといってもお寺だ "Kyoto’s greatest attraction is, above all, its temples". It expresses strong conviction.',
    functions: ['emphasize', 'highest-level'],
    examples: [
      ex('夏は なんと いっても かき氷だ。', 'Summer means shaved ice, above all.', 'なつは なんと いっても かきごおりだ。'),
      ex('この 店の 魅力は、なんと いっても 値段の 安さだ。', 'This shop’s main appeal is, without doubt, its low prices.', 'この みせの みりょくは、なんと いっても ねだんの やすさだ。'),
    ],
  },
  'n2m-g-97ce29': {
    meaning: '(efforts) were in vain; not worth it',
    structure: 'V-た + 甲斐が ない ／ N の 甲斐（も）なく',
    explanation:
      '甲斐がない says an effort did not pay off: 看病の甲斐もなく "despite all the nursing". The positive 甲斐がある means "worth it": 努力した甲斐があった. It is formal and emotional.',
    functions: ['result', 'regret'],
    examples: [
      ex('家族の 看病の 甲斐も なく、祖父は 亡くなった。', "Despite his family's care, my grandfather passed away.", 'かぞくの かんびょうの かいも なく、そふは なくなった。'),
      ex('毎日 練習した 甲斐が あって、試合に 勝てた。', 'All that daily practice paid off, and we won the match.', 'まいにち れんしゅうした かいが あって、しあいに かてた。'),
    ],
  },
  'n2m-g-7b947b': {
    meaning: 'there are signs that ~; seems to ~',
    structure: 'Plain form + ふしが ある',
    explanation:
      'ふしがある says there are indications that suggest something, often a hidden attitude: 彼は何か隠しているふしがある "there are signs he is hiding something". It is somewhat literary and cautious.',
    functions: ['speculation'],
    examples: [
      ex('彼は 何か 隠して いる ふしが ある。', 'There are signs that he is hiding something.', 'かれは なにか かくして いる ふしが ある。'),
      ex('彼女は 自分が 悪いと 思って いる ふしが ある。', 'She seems to think it is her fault.', 'かのじょは じぶんが わるいと おもって いる ふしが ある。'),
    ],
  },
  'n2m-g-efcebb': {
    meaning: 'try not to ~; be determined not to ~',
    structure: 'V-dict + まい と する（まい と して）',
    explanation:
      'まいとする expresses an effort not to do something: 泣くまいとした "tried not to cry". まい is the negative volitional. It is literary; in speech ないようにする is common.',
    functions: ['intent', 'negative'],
    examples: [
      ex('彼女は 泣くまいと して、唇を かんだ。', 'She bit her lip, trying not to cry.', 'かのじょは なくまいと して、くちびるを かんだ。'),
      ex('二度と 同じ 失敗を するまいと 心に 決めた。', 'I resolved never to make the same mistake again.', 'にどと おなじ しっぱいを するまいと こころに きめた。'),
    ],
  },
  'n2m-g-a5086e': {
    meaning: 'there is nothing to do but ~',
    structure: 'V-dict + より（ほか）仕方が ない',
    explanation:
      'より仕方がない says the only remaining option is the one named, usually reluctantly: 待つより仕方がない "all we can do is wait". It is close to しかない and よりほかない.',
    functions: ['necessary-obligation', 'limit'],
    examples: [
      ex('電車が 動かないので、歩く より 仕方が ない。', "The trains aren't running, so there's nothing for it but to walk.", 'でんしゃが うごかないので、あるく より しかたが ない。'),
      ex('自分が 悪いのだから、謝る より 仕方が ない。', "It's my fault, so I have no choice but to apologise.", 'じぶんが わるいのだから、あやまる より しかたが ない。'),
    ],
  },
  'n2m-g-aa87fe': {
    meaning: 'rash; reckless (めったな + N)',
    structure: 'めったな + N（こと・もの）+ negative',
    explanation:
      'めったな before a noun warns against something careless or rash, always with a negative: めったなことは言えない "I can’t say anything careless". It differs from めったに, which means "rarely".',
    functions: ['warning', 'negative'],
    examples: [
      ex('確かな 証拠が ないので、めったな ことは 言えない。', "Without solid proof, I can't say anything rash.", 'たしかな しょうこが ないので、めったな ことは いえない。'),
      ex('めったな ことを 言うと、誤解されるよ。', "If you say careless things, you'll be misunderstood.", 'めったな ことを いうと、ごかいされるよ。'),
    ],
  },
  'n2m-g-98aca7': {
    meaning: 'on the one hand ~, on the other hand …',
    structure: '一方では A、他方では B',
    explanation:
      'This pair presents two contrasting sides of an issue in a balanced way: 一方では賛成の声があり、他方では反対も多い. It is formal and common in essays and reports.',
    functions: ['contrast', 'compare'],
    examples: [
      ex('一方では 便利に なったが、他方では 問題も 増えた。', 'On the one hand it became more convenient, on the other hand problems increased.', 'いっぽうでは べんりに なったが、たほうでは もんだいも ふえた。'),
      ex('一方では 賛成する 人も いるが、他方では 反対も 多い。', 'Some are in favour, while on the other hand many are opposed.', 'いっぽうでは さんせいする ひとも いるが、たほうでは はんたいも おおい。'),
    ],
  },
  'n2m-g-c66d20': {
    meaning: 'if (that is) so, then ~',
    structure: 'N／Na + だと すれば ／（sentence-initial）だと すれば、…',
    explanation:
      'だとすれば draws a conclusion from a premise just given: 「彼は来ないらしい」「だとすれば、始めよう」. After a noun it forms a hypothesis: 原因が雨だとすれば. It sounds logical and deliberate.',
    functions: ['condition-assumption', 'deductive'],
    examples: [
      ex('原因が 電池だと すれば、交換すれば 直る はずだ。', 'If the battery is the cause, replacing it should fix it.', 'げんいんが でんちだと すれば、こうかんすれば なおる はずだ。'),
      ex('だと すれば、もう 待つ 必要は ない。', 'If that is so, there is no need to wait any longer.', 'だと すれば、もう まつ ひつようは ない。'),
    ],
  },
  'n2m-g-619390': {
    meaning: 'it is not that I don’t ~; I could ~ (reluctantly)',
    structure: 'V-ない + でも ない',
    explanation:
      'ないでもない is a hesitant double negative, conceding a slight possibility or feeling: 気持ちは分からないでもない "I can sort of understand how you feel". It is softer than ないことはない.',
    functions: ['negative', 'concessions'],
    examples: [
      ex('君の 気持ちも 分からないで も ない。', 'I can sort of understand how you feel.', 'きみの きもちも わからないで も ない。'),
      ex('少し 高いが、買えないで も ない。', "It's a bit expensive, but I could buy it if I had to.", 'すこし たかいが、かえないで も ない。'),
    ],
  },
  'n2m-g-c031e4': {
    meaning: 'hopeless; (not at all) (さっぱりだ)',
    structure: 'N は さっぱりだ ／ さっぱり + negative',
    explanation:
      'さっぱりだ describes something as a total failure: 英語はさっぱりだ "I’m hopeless at English", 売り上げがさっぱりだ. With a negative, さっぱり means "not at all": さっぱり分からない. As an adjective, さっぱりした means "refreshing".',
    functions: ['emphasize-negative', 'evaluate'],
    examples: [
      ex('数学は さっぱりだ。何も 分からない。', "I'm hopeless at maths. I don't understand anything.", 'すうがくは さっぱりだ。なにも わからない。'),
      ex('説明を 聞いても、さっぱり 分からなかった。', 'Even after the explanation, I had no idea at all.', 'せつめいを きいても、さっぱり わからなかった。'),
    ],
  },
  'n2m-g-c69cbb': {
    meaning: 'having said that; although ~',
    structure: 'Plain form + と は いう ものの',
    explanation:
      'とはいうものの concedes a statement but notes that reality differs: 春とはいうものの、まだ寒い "it may be spring, but it’s still cold". It is formal; とはいえ is a shorter synonym.',
    functions: ['concessions', 'contrast'],
    examples: [
      ex('春とは いう ものの、まだ 風が 冷たい。', "It may be spring, but the wind is still cold.", 'はるとは いう ものの、まだ かぜが つめたい。'),
      ex('やると 決めたとは いう ものの、自信は ない。', 'I have decided to do it, but I am not confident.', 'やると きめたとは いう ものの、じしんは ない。'),
    ],
  },
  'n2m-g-df9e1d': {
    meaning: 'if it is like this; at this rate',
    structure: 'これだと + judgement',
    explanation:
      'これだと evaluates the present situation as the basis for a judgement: これだと間に合わない "at this rate, we won’t make it". It is the casual counterpart of これでは and can be positive or negative.',
    functions: ['condition', 'judge'],
    examples: [
      ex('これだと、今日中には 終わらないね。', "At this rate, we won't finish today.", 'これだと、きょうじゅうには おわらないね。'),
      ex('これだと 少し 大きいから、小さい サイズを ください。', 'This is a bit big, so could I have a smaller size?', 'これだと すこし おおきいから、ちいさい さいずを ください。'),
    ],
  },
  'n2m-g-d43337': {
    meaning: 'not particularly ~',
    structure: '別段（べつだん）+ negative',
    explanation:
      '別段〜ない is a formal, slightly old-fashioned version of 別に〜ない: 別段変わったことはない "nothing particularly unusual". It is common in reports and written statements.',
    functions: ['negative'],
    examples: [
      ex('別段 変わった ことは ありません。', 'Nothing in particular has changed.', 'べつだん かわった ことは ありません。'),
      ex('その 意見に 別段 反対は しない。', 'I have no particular objection to that opinion.', 'その いけんに べつだん はんたいは しない。'),
    ],
  },
  'n2m-g-b86f05': {
    meaning: 'it will work out somehow',
    structure: 'どうにか なる（どうにか する）',
    explanation:
      'どうにかなる expresses optimism that things will be all right: 心配しなくても、どうにかなるよ. どうにかする is the active version, "find a way". It is close to なんとかなる.',
    functions: ['result', 'vague'],
    examples: [
      ex('お金は 足りないけど、どうにか なる だろう。', "We're short of money, but I'm sure it'll work out somehow.", 'おかねは たりないけど、どうにか なる だろう。'),
      ex('この 問題は 私が どうにか します。', "I'll find some way to deal with this problem.", 'この もんだいは わたしが どうにか します。'),
    ],
  },
  'n2m-g-7ac0a5': {
    meaning: 'one could say ~; it would not be too much to say ~',
    structure: 'Plain form + と いっても いい（だろう）',
    explanation:
      'といってもいい offers a slightly bold characterisation: 彼は天才だといってもいい "you could call him a genius". だろう softens it. It is common in essays and reviews.',
    functions: ['judge'],
    examples: [
      ex('彼は この 分野の 第一人者と いっても いい だろう。', 'You could say he is the leading figure in this field.', 'かれは この ぶんやの だいいちにんしゃと いっても いい だろう。'),
      ex('この 町は 日本で 一番 美しいと いっても いい。', 'One could say this is the most beautiful town in Japan.', 'この まちは にほんで いちばん うつくしいと いっても いい。'),
    ],
  },
  'n2m-g-20ae12': {
    meaning: 'in any case; either way',
    structure: 'いずれに しろ、…',
    explanation:
      'いずれにしろ sets aside the uncertain options and states what holds regardless: いずれにしろ、明日までに返事をください. It is a slightly more casual いずれにせよ.',
    functions: ['invariant'],
    examples: [
      ex('行くか どうか、いずれに しろ 連絡して ね。', 'Whether you go or not, let me know either way.', 'いくか どうか、いずれに しろ れんらくして ね。'),
      ex('いずれに しろ、今日中に 決めよう。', "Either way, let's decide today.", 'いずれに しろ、きょうじゅうに きめよう。'),
    ],
  },
  'n2m-g-b703ee': {
    meaning: 'while ~; on the other hand',
    structure: 'Plain form + 一方（で）, …',
    explanation:
      '一方で presents two sides of something or two contrasting situations: 彼は厳しい一方で、優しいところもある "he is strict, but at the same time has a kind side". It is neutral to formal.',
    functions: ['contrast', 'concessions'],
    examples: [
      ex('彼は 仕事に 厳しい 一方で、部下には 優しい。', 'While he is strict about work, he is kind to his staff.', 'かれは しごとに きびしい いっぽうで、ぶかには やさしい。'),
      ex('人口が 減る 一方で、高齢者は 増えて いる。', 'While the population is falling, the number of elderly people is rising.', 'じんこうが へる いっぽうで、こうれいしゃは ふえて いる。'),
    ],
  },
  'n2m-g-a46eae': {
    meaning: 'doing things like ~ (casual, vague)',
    structure: 'V-たり + なんか して',
    explanation:
      'たりなんかして gives an activity as a loose example: 映画を見たりなんかして過ごした "spent the time watching films and stuff". It is casual and vaguer than たりして.',
    functions: ['denote-by-example', 'vague'],
    examples: [
      ex('休みは 友達と 買い物したり なんか して いた。', 'On my day off I was shopping with friends and so on.', 'やすみは ともだちと かいものしたり なんか して いた。'),
      ex('昔の 写真を 見たり なんか して、懐かしく なった。', 'Looking at old photos and such, I felt nostalgic.', 'むかしの しゃしんを みたり なんか して、なつかしく なった。'),
    ],
  },
  'n2m-g-e7881f': {
    meaning: "let's ~ (rousing call)",
    structure: 'V-volitional + では ない か（じゃ ない か）',
    explanation:
      'ようではないか rallies a group to act together: みんなで力を合わせようではないか "let’s all join forces". It is used in speeches and sounds strong and masculine; ようじゃないか is the spoken form.',
    functions: ['invite-suggest', 'determination-decision'],
    examples: [
      ex('みんなで 力を 合わせて、この 町を 守ろうでは ないか。', "Let us all join forces and protect this town!", 'みんなで ちからを あわせて、この まちを まもろうでは ないか。'),
      ex('よし、最後まで やって みようじゃ ないか。', "Right, let's see it through to the end!", 'よし、さいごまで やって みようじゃ ないか。'),
    ],
  },
  'n2m-g-062b53': {
    meaning: 'whether ~ or ~ (either way)',
    structure: 'A に しても B に しても ／ A に しろ B に しろ ／ A に せよ B に せよ',
    explanation:
      'Doubling にしても (or にしろ, にせよ) covers two options and says the conclusion is the same for both: 行くにしても行かないにしても、連絡して. にせよ is the most formal.',
    functions: ['concessions', 'invariant'],
    examples: [
      ex('賛成に しても 反対に しても、理由を 説明して ください。', 'Whether you agree or disagree, please explain why.', 'さんせいに しても はんたいに しても、りゆうを せつめいして ください。'),
      ex('電車に せよ バスに せよ、一時間は かかる。', 'Whether by train or bus, it will take an hour.', 'でんしゃに せよ ばすに せよ、いちじかんは かかる。'),
    ],
  },
  'n2m-g-26783b': {
    meaning: 'nothing other than ~; precisely because ~',
    structure: 'N + に ほか ならない ／ Plain form + から に ほか ならない',
    explanation:
      'にほかならない asserts that something is exactly and only that: 成功したのは努力の結果にほかならない "the success is nothing other than the result of effort". からにほかならない stresses the sole reason. It is formal.',
    functions: ['emphasize', 'definition'],
    examples: [
      ex('今回の 成功は、皆さんの 努力の 結果に ほか なりません。', 'This success is nothing other than the result of your efforts.', 'こんかいの せいこうは、みなさんの どりょくの けっかに ほか なりません。'),
      ex('厳しく 言うのは、君に 期待して いるからに ほか ならない。', 'The only reason I am strict is that I have high hopes for you.', 'きびしく いうのは、きみに きたいして いるからに ほか ならない。'),
    ],
  },
  'n2m-g-4f8e4a': {
    meaning: 'if I dare say; if I had to (name one)',
    structure: 'あえて + V-ば（言えば／挙げれば）',
    explanation:
      'あえて〜ば frames a reluctant choice or statement: あえて言えば、少し高い "if I had to say something, it’s a little expensive". It softens criticism or narrows a choice.',
    functions: ['condition', 'judge'],
    examples: [
      ex('いい 店だが、あえて 言えば 少し 狭い。', "It's a good shop, but if I had to say something, it's a little cramped.", 'いい みせだが、あえて いえば すこし せまい。'),
      ex('好きな 季節を あえて 一つ 挙げれば、秋です。', 'If I had to pick one favourite season, it would be autumn.', 'すきな きせつを あえて ひとつ あげれば、あきです。'),
    ],
  },
  'n2m-g-5154ca': {
    meaning: 'is bound to ~; is sure to be ~',
    structure: 'Plain form (N／Na without だ) + に 決まって いる',
    explanation:
      'に決まっている expresses the speaker’s strong subjective certainty: そんなの無理に決まっている "that’s bound to be impossible". It is conversational and more emphatic than に違いない.',
    functions: ['judge', 'of-course'],
    examples: [
      ex('こんな 天気じゃ、試合は 中止に 決まって いる。', 'In weather like this, the match is bound to be cancelled.', 'こんな てんきじゃ、しあいは ちゅうしに きまって いる。'),
      ex('毎日 練習して いる 彼が 勝つに 決まって いる。', 'He practises every day, so of course he will win.', 'まいにち れんしゅうして いる かれが かつに きまって いる。'),
    ],
  },
  'n2m-g-f589e2': {
    meaning: 'although one may lump it together as ~, (in reality) …',
    structure: '一口に + N と いっても, …',
    explanation:
      '一口に〜といっても warns that a single label covers much variety: 一口に日本料理といっても、いろいろある "though we say ‘Japanese food’, there are many kinds". The second half stresses diversity.',
    functions: ['concessions', 'explain'],
    examples: [
      ex('一口に 日本料理と いっても、地方に よって 味が 違う。', 'Although we call it all Japanese food, the taste varies by region.', 'ひとくちに にほんりょうりと いっても、ちほうに よって あじが ちがう。'),
      ex('一口に 教師と いっても、さまざまな タイプが いる。', 'We say "teachers", but there are all sorts of types.', 'ひとくちに きょうしと いっても、さまざまな たいぷが いる。'),
    ],
  },
  'n2m-g-7c9b05': {
    meaning: 'no sooner had ~ than …',
    structure: 'V-た + か と 思うと（か と 思ったら）',
    explanation:
      'かと思うと describes one event quickly followed by a contrasting one: 泣いたかと思うと、もう笑っている "one moment she was crying, the next she was laughing". The two events are often opposites.',
    functions: ['immediately-after', 'unexpected-outcome'],
    examples: [
      ex('空が 暗く なったかと 思うと、激しい 雨が 降り出した。', 'The sky had no sooner darkened than a heavy rain began.', 'そらが くらく なったかと おもうと、はげしい あめが ふりだした。'),
      ex('赤ちゃんは 泣いたかと 思うと、すぐに 眠って しまった。', 'The baby cried and then almost immediately fell asleep.', 'あかちゃんは ないたかと おもうと、すぐに ねむって しまった。'),
    ],
  },
  'n2m-g-2a6c3f': {
    meaning: 'have no choice but to ~',
    structure: 'V-dict + ほか（は）ない',
    explanation:
      'ほかはない says there is no other option: 自分でやるほかはない "I have no choice but to do it myself". It is formal and close to しかない, often expressing resolve.',
    functions: ['necessary-obligation', 'limit'],
    examples: [
      ex('誰も 手伝って くれないので、自分で やる ほか ない。', 'Nobody will help, so I have no choice but to do it myself.', 'だれも てつだって くれないので、じぶんで やる ほか ない。'),
      ex('バスが 来ないので、タクシーで 行く ほか は ない。', 'The bus is not coming, so we have no choice but to take a taxi.', 'ばすが こないので、たくしーで いく ほか は ない。'),
    ],
  },
  'n2m-g-13648a': {
    meaning: 'might it not be ~? (tentative opinion)',
    structure: 'Plain form (N／Na without だ) + では なかろうか',
    explanation:
      'ではなかろうか is a literary equivalent of ではないだろうか, presenting an opinion cautiously: これが最善の方法ではなかろうか "might this not be the best way?". It is common in essays.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('これこそ 最も 大切な 問題では なかろうか。', 'Might this not be the most important issue of all?', 'これこそ もっとも たいせつな もんだいでは なかろうか。'),
      ex('少し 急ぎすぎたのでは なかろうか。', 'Perhaps we have rushed things a little.', 'すこし いそぎすぎたのでは なかろうか。'),
    ],
  },
  'n2m-g-87424d': {
    meaning: 'to call it ~ would be (going too far / unfair)',
    structure: 'N／plain form + と いっては + evaluation（失礼だ・言いすぎだ）',
    explanation:
      'といっては labels something and then says the label is inappropriate: 下手と言っては失礼だが "it would be rude to call it bad, but…". It softens criticism by questioning one’s own wording.',
    functions: ['concessions', 'speak'],
    examples: [
      ex('失敗と いっては 言いすぎだが、成功とも 言えない。', "Calling it a failure would be going too far, but it wasn't a success either.", 'しっぱいと いっては いいすぎだが、せいこうとも いえない。'),
      ex('古いと いっては 失礼だが、かなり 年季の 入った 家だ。', "It would be rude to call it old, but it is quite a well-worn house.", 'ふるいと いっては しつれいだが、かなり ねんきの はいった いえだ。'),
    ],
  },
  'n2m-g-3af22f': {
    meaning: 'have no choice but to ~',
    structure: 'V-dict + より ほか（は）ない',
    explanation:
      'よりほかはない says only one option remains: 諦めるよりほかはない "there’s nothing for it but to give up". It is formal and resigned; しかない is the everyday form.',
    functions: ['necessary-obligation', 'limit'],
    examples: [
      ex('ここまで 来たら、最後まで やる より ほか は ない。', "Now that we've come this far, we have no choice but to see it through.", 'ここまで きたら、さいごまで やる より ほか は ない。'),
      ex('誰も 来ないので、一人で やる より ほか なかった。', 'No one came, so I had no choice but to do it alone.', 'だれも こないので、ひとりで やる より ほか なかった。'),
    ],
  },
  'n2m-g-ff2882': {
    meaning: 'at; in; by (formal で)',
    structure: 'N（place／means）+ にて',
    explanation:
      'にて is the formal written equivalent of で for place, means and time: 会議は本社にて行います "the meeting will be held at head office". It appears in notices, invitations and letters.',
    functions: ['place', 'means-methods'],
    examples: [
      ex('説明会は 本社 三階 会議室にて 行います。', 'The briefing will be held in the third-floor meeting room at head office.', 'せつめいかいは ほんしゃ さんがい かいぎしつにて おこないます。'),
      ex('結果は 後日 メールにて お知らせ します。', 'The results will be announced later by email.', 'けっかは ごじつ めーるにて おしらせ します。'),
    ],
  },
  'n2m-g-ad42d6': {
    meaning: 'along with ~; as ~ (changes, so does …)',
    structure: 'N／V-dict + に ともなって（に ともない／に ともなう + N）',
    explanation:
      'にともなって says one change accompanies another: 人口の増加にともなって、問題も増えた "as the population grew, so did the problems". It is formal and used for large-scale changes.',
    functions: ['relationships-follow', 'rate-parallel'],
    examples: [
      ex('人口の 増加に ともなって、交通問題が 深刻に なった。', 'Along with the population increase, traffic problems became serious.', 'じんこうの ぞうかに ともなって、こうつうもんだいが しんこくに なった。'),
      ex('会社の 移転に ともない、住所が 変わります。', 'Our address will change with the company’s relocation.', 'かいしゃの いてんに ともない、じゅうしょが かわります。'),
    ],
  },
  'n2m-g-9a5624': {
    meaning: 'as (someone wishes / says); following ~',
    structure: 'N の／V-dict + まま（に）',
    explanation:
      'ままに means acting in accordance with something without resisting: 足の向くままに歩く "walk wherever one’s feet lead", 言われるままに "just as told". It is somewhat literary and suggests passivity or freedom.',
    functions: ['continuity', 'perspective-way'],
    examples: [
      ex('休みの 日は、気の 向く ままに 町を 歩く。', 'On days off I wander the town wherever the mood takes me.', 'やすみの ひは、きの むく ままに まちを あるく。'),
      ex('彼は 言われる ままに 書類に サインした。', 'He signed the papers just as he was told.', 'かれは いわれる ままに しょるいに さいんした。'),
    ],
  },
  'n2m-g-4f7f43': {
    meaning: 'I hear that ~ (vague hearsay)',
    structure: 'Plain form + とか（。）',
    explanation:
      'Sentence-final とか reports hearsay vaguely: 来月、結婚されるとか "I hear you’re getting married next month". It sounds softer and less certain than そうです and is common in polite small talk.',
    functions: ['heard'],
    examples: [
      ex('来月、ご結婚 なさるとか。おめでとう ございます。', 'I hear you are getting married next month. Congratulations.', 'らいげつ、ごけっこん なさるとか。おめでとう ございます。'),
      ex('明日は 雪が 降るとか。', 'Apparently it is going to snow tomorrow.', 'あしたは ゆきが ふるとか。'),
    ],
  },
  'n2m-g-89c08b': {
    meaning: 'not only (just) ~ (but the whole …)',
    structure: 'ひとり + N + のみならず（だけでなく）',
    explanation:
      'ひとり〜のみならず says a problem is not limited to one party but extends widely: これはひとり日本のみならず、世界の問題だ "this is a problem not just for Japan but for the world". It is formal and rhetorical.',
    functions: ['add', 'range'],
    examples: [
      ex('環境問題は ひとり 日本のみならず、世界全体の 課題だ。', 'Environmental issues are a challenge not only for Japan but for the whole world.', 'かんきょうもんだいは ひとり にほんのみならず、せかいぜんたいの かだいだ。'),
      ex('これは ひとり 彼だけで なく、チーム 全員の 責任だ。', 'This is the responsibility not just of him but of the whole team.', 'これは ひとり かれだけで なく、ちーむ ぜんいんの せきにんだ。'),
    ],
  },
  'n2m-g-f9759b': {
    meaning: 'simply because (one wanted) ~ (with bad result)',
    structure: 'V-たい + ばかりに, …',
    explanation:
      'たいばかりに says a strong desire drove someone to do something drastic: 合格したいばかりに、毎晩徹夜した "wanting so badly to pass, he stayed up every night". The result is often extreme or unfortunate.',
    functions: ['cause-reason', 'desire'],
    examples: [
      ex('彼女に 会いたい ばかりに、遠くから 飛んで 来た。', 'Just because he wanted to see her, he flew all the way here.', 'かのじょに あいたい ばかりに、とおくから とんで きた。'),
      ex('お金が 欲しい ばかりに、うそを ついて しまった。', 'Simply because he wanted money, he ended up lying.', 'おかねが ほしい ばかりに、うそを ついて しまった。'),
    ],
  },
  'n2m-g-9a439f': {
    meaning: '(tell / show) exactly as it is',
    structure: 'V-た + ままを + V（話す・書く）',
    explanation:
      'ままを means presenting something exactly as it was, without change: 見たままを話してください "please tell us exactly what you saw". It emphasises accuracy and honesty.',
    functions: ['continuity'],
    examples: [
      ex('見た ままを 正直に 話して ください。', 'Please tell us honestly exactly what you saw.', 'みた ままを しょうじきに はなして ください。'),
      ex('思った ままを 作文に 書いた。', 'I wrote down exactly what I thought in the essay.', 'おもった ままを さくぶんに かいた。'),
    ],
  },
  'n2m-g-64b368': {
    meaning: 'furthermore; please note; still (more)',
    structure: 'Sentence。なお、+ additional information ／ なお + comparative',
    explanation:
      'At the start of a sentence, なお adds a note or supplementary information, common in notices: なお、駐車場はありません "please note there is no car park". As an adverb it means "still more": なお悪い.',
    functions: ['add'],
    examples: [
      ex('会議は 三時から です。なお、資料は 当日 配ります。', 'The meeting is at three. Please note the materials will be handed out on the day.', 'かいぎは さんじから です。なお、しりょうは とうじつ くばります。'),
      ex('薬を 飲んだが、なお 熱が 下がらない。', "I took the medicine, but my fever still hasn't gone down.", 'くすりを のんだが、なお ねつが さがらない。'),
    ],
  },
  'n2m-g-506cdb': {
    meaning: '(casual question with question word, masculine)',
    structure: 'Question word + … + だい（のだい）',
    explanation:
      'だい is a casual, masculine question ending used with question words: 何だい? "what is it?", どうしたんだい. It sounds friendly or fatherly. Without a question word, かい is used.',
    functions: ['asked'],
    examples: [
      ex('そんなに 慌てて、どう したんだい。', "What's the matter, rushing like that?", 'そんなに あわてて、どう したんだい。'),
      ex('君の 名前は 何だい。', "What's your name?", 'きみの なまえは なんだい。'),
    ],
  },
  'n2m-g-eb85a3': {
    meaning: 'since ~, it is only natural that …',
    structure: 'Plain form + わけだから、… + ても 当然だ',
    explanation:
      'わけだから presents a fact as reasoning, and ても当然だ says the consequence is natural even if unwelcome: 約束を破ったわけだから、怒られても当然だ "since you broke your promise, it’s natural you got scolded". The tone is matter-of-fact and can sound unsympathetic.',
    functions: ['conclude', 'of-course'],
    examples: [
      ex('何も 準備しなかった わけだから、失敗しても 当然だ。', 'Since you prepared nothing, it is no surprise you failed.', 'なにも じゅんびしなかった わけだから、しっぱいしても とうぜんだ。'),
      ex('毎日 遅刻した わけだから、注意されても 当然だ。', 'You were late every day, so it is only natural you were warned.', 'まいにち ちこくした わけだから、ちゅういされても とうぜんだ。'),
    ],
  },
  'n2m-g-d81fb7': {
    meaning: 'no more ~ (than this); any more ~',
    structure: 'これ 以上 + V-ない／V-potential negative',
    explanation:
      'これ以上 with a negative sets a limit: これ以上待てない "I can’t wait any longer", これ以上食べられない. It can also mean "any further": これ以上迷惑をかけたくない.',
    functions: ['limit'],
    examples: [
      ex('もう これ 以上 待てない。', "I can't wait any longer.", 'もう これ いじょう まてない。'),
      ex('これ 以上、皆に 迷惑を かけたく ない。', "I don't want to cause everyone any more trouble.", 'これ いじょう、みなに めいわくを かけたく ない。'),
    ],
  },
  'n2m-g-5bed5d': {
    meaning: '~ means …; (surprise) to think that ~',
    structure: 'N + とは + definition ／ Plain form + とは（surprise）',
    explanation:
      'とは defines a term in written style: 「積読」とは、本を買って読まないことだ. After a clause, it expresses surprise: 彼が優勝するとは "to think he would win!". The two uses are told apart by what follows.',
    functions: ['definition', 'surprise'],
    examples: [
      ex('「ユニバーサルデザイン」とは、誰にでも 使いやすい デザインの ことだ。', '"Universal design" means design that is easy for anyone to use.', '「ゆにばーさるでざいん」とは、だれにでも つかいやすい でざいんの ことだ。'),
      ex('まさか 一回で 合格するとは、驚いた。', 'I was amazed that he passed on his first try.', 'まさか いっかいで ごうかくするとは、おどろいた。'),
    ],
  },
  'n2m-g-ebfa88': {
    meaning: '(sentence-final ぜ) strong, friendly assertion (masculine)',
    structure: 'Plain form + ぜ',
    explanation:
      'ぜ adds a rough, friendly emphasis in masculine speech: 行こうぜ "let’s go!", 楽勝だぜ "it’s a piece of cake". It is softer and more buddy-like than ぞ and inappropriate in polite speech.',
    functions: ['emphasize', 'speak'],
    examples: [
      ex('よし、早く 行こうぜ。', "Right, let's get going.", 'よし、はやく いこうぜ。'),
      ex('こんな 問題、簡単だぜ。', "A problem like this is easy.", 'こんな もんだい、かんたんだぜ。'),
    ],
  },
  'n2m-g-8814c2': {
    meaning: 'by (my honour / name), I swear ~',
    structure: 'N（名誉・命）+ に かけて（も）',
    explanation:
      'にかけて swears by something one values: 名誉にかけて約束する "I promise on my honour", 命にかけても守る. It expresses a solemn vow and is dramatic in tone.',
    functions: ['determination-decision'],
    examples: [
      ex('私の 名誉に かけて、必ず 約束を 守ります。', 'On my honour, I will keep my promise without fail.', 'わたしの めいよに かけて、かならず やくそくを まもります。'),
      ex('チームの 誇りに かけても、この 試合は 負けられない。', 'For the pride of the team, we cannot lose this match.', 'ちーむの ほこりに かけても、この しあいは まけられない。'),
    ],
  },
  'n2m-g-b45838': {
    meaning: 'sometimes; at times (formal)',
    structure: '時として（ときとして）+ V',
    explanation:
      '時として means "sometimes, on occasion", often for something unexpected: 真面目な人も時として失敗する "even serious people sometimes fail". It is written style; 時々 is everyday.',
    functions: ['frequency'],
    examples: [
      ex('優しい 言葉が、時として 人を 傷つける ことも ある。', 'Kind words can sometimes hurt people.', 'やさしい ことばが、ときとして ひとを きずつける ことも ある。'),
      ex('経験豊かな 人でも、時として 判断を 誤る。', 'Even experienced people sometimes misjudge.', 'けいけんゆたかな ひとでも、ときとして はんだんを あやまる。'),
    ],
  },
  'n2m-g-52ab52': {
    meaning: 'anew; as if for the first time (now)',
    structure: '今更（いまさら）のように + V（感じる・思う）',
    explanation:
      '今更のように says someone freshly realises something they should have known: 今更のように親のありがたさを感じた "I felt my parents’ kindness as if for the first time". It is reflective.',
    functions: ['feel', 'time'],
    examples: [
      ex('病気に なって、今更の ように 健康の 大切さを 知った。', 'Falling ill, I realised afresh how important health is.', 'びょうきに なって、いまさらの ように けんこうの たいせつさを しった。'),
      ex('故郷を 離れて、今更の ように 家族の ありがたさを 感じた。', 'After leaving home, I felt anew how grateful I am for my family.', 'こきょうを はなれて、いまさらの ように かぞくの ありがたさを かんじた。'),
    ],
  },
  'n2m-g-a5a3f8': {
    meaning: 'apt to; (とかくの) various (rumours)',
    structure: 'とかく + V ／ とかくの + N（噂・批判）',
    explanation:
      'とかく means "is apt to, tends to": 人はとかく他人の欠点が気になる. とかくの噂 means "all sorts of rumours" and implies negative talk. It is literary.',
    functions: ['trend', 'vague'],
    examples: [
      ex('人は とかく 他人の 欠点に 目が 行く ものだ。', "People tend to notice others' faults.", 'ひとは とかく たにんの けってんに めが いく ものだ。'),
      ex('あの 会社には とかくの 噂が ある。', 'There are all sorts of rumours about that company.', 'あの かいしゃには とかくの うわさが ある。'),
    ],
  },
  'n2m-g-1252c7': {
    meaning: 'even if one ~ now (it is too late)',
    structure: '今更（いまさら）+ V-た + ところで, … (no use)',
    explanation:
      '今更〜たところで says an action now would be pointless: 今更謝ったところで、許してもらえない "apologising now won’t get you forgiven". It is resigned or critical.',
    functions: ['concessions', 'negative'],
    examples: [
      ex('今更 後悔した ところで、どう にも ならない。', "Regretting it now won't change anything.", 'いまさら こうかいした ところで、どう にも ならない。'),
      ex('今更 急いだ ところで、もう 間に合わない。', "Even if we hurried now, we wouldn't make it.", 'いまさら いそいだ ところで、もう まにあわない。'),
    ],
  },
  'n2m-g-593b58': {
    meaning: 'not at all; not in any way (formal)',
    structure: '何ら（なんら）+ negative',
    explanation:
      '何ら〜ない is a formal "not in the slightest": 何ら問題はない "there is no problem whatsoever". It is common in official statements and writing.',
    functions: ['emphasize-negative'],
    examples: [
      ex('この 件に ついて、私は 何ら 関係 ありません。', 'I have nothing whatsoever to do with this matter.', 'この けんに ついて、わたしは なんら かんけい ありません。'),
      ex('安全性には 何ら 問題が ない。', 'There is no problem whatsoever with safety.', 'あんぜんせいには なんら もんだいが ない。'),
    ],
  },
  'n2m-g-d7748a': {
    meaning: 'if so, then ~; if (it is) ~',
    structure: 'N／Na + だと すると ／（sentence-initial）だと すると、…',
    explanation:
      'だとすると reasons from a premise just learned: 「電車が止まっている」「だとすると、遅れるね」. After a noun, it forms a hypothesis. It is close to だとすれば and conversational.',
    functions: ['condition-assumption', 'deductive'],
    examples: [
      ex('だと すると、会議は 延期に なりますね。', 'In that case, the meeting will be postponed.', 'だと すると、かいぎは えんきに なりますね。'),
      ex('原因が 寝不足だと すると、早く 寝れば 治るはずだ。', 'If lack of sleep is the cause, going to bed early should fix it.', 'げんいんが ねぶそくだと すると、はやく ねれば なおるはずだ。'),
    ],
  },
  'n2m-g-288ea1': {
    meaning: 'sooner or later; some day; (either way)',
    structure: 'いずれ + V ／ いずれ また',
    explanation:
      'いずれ refers to an unspecified future time: いずれ分かる "you’ll understand eventually", いずれまた "some other time". In phrases like いずれにせよ it means "either way".',
    functions: ['future-time', 'invariant'],
    examples: [
      ex('今は 分からなくても、いずれ 分かる 日が 来る。', "Even if you don't understand now, the day will come when you do.", 'いまは わからなくても、いずれ わかる ひが くる。'),
      ex('では、いずれ また お会い しましょう。', "Well then, let's meet again some time.", 'では、いずれ また おあい しましょう。'),
    ],
  },
  'n2m-g-a39068': {
    meaning: 'would you (be so kind as to) ~? (old-fashioned)',
    structure: 'V-て + くれまいか',
    explanation:
      'くれまいか is an old-fashioned, masculine request: 手伝ってくれまいか "would you help me?". まい makes it a gentle negative question. It is heard in fiction and formal speech by older men.',
    functions: ['request'],
    examples: [
      ex('すまないが、少し 手を 貸して くれまいか。', 'Forgive me, but would you lend me a hand?', 'すまないが、すこし てを かして くれまいか。'),
      ex('この 手紙を 彼に 届けて くれまいか。', 'Would you be so kind as to deliver this letter to him?', 'この てがみを かれに とどけて くれまいか。'),
    ],
  },
  'n2m-g-5f99e3': {
    meaning: '~ would be far (better / more …)',
    structure: 'A より B の ほうが よほど + Adj',
    explanation:
      'よほど intensifies a comparison: バスより歩いたほうがよほど早い "walking is far quicker than the bus". It suggests the speaker is surprised or frustrated by the difference.',
    functions: ['compare', 'level'],
    examples: [
      ex('タクシーより 電車の ほうが よほど 早い。', 'The train is far quicker than a taxi.', 'たくしーより でんしゃの ほうが よほど はやい。'),
      ex('一人で やる ほうが よほど 楽だ。', "It's much easier to do it on my own.", 'ひとりで やる ほうが よほど らくだ。'),
    ],
  },
  'n2m-g-9afa0d': {
    meaning: 'for (someone in the position of) ~; as ~',
    structure: 'N + と しては',
    explanation:
      'としては states a view from a particular role or position: 私としては賛成です "for my part, I agree". It can also mean "for a ~": 日本人としては背が高い "tall for a Japanese person".',
    functions: ['as', 'perspective-way'],
    examples: [
      ex('私と しては、その 案に 反対です。', 'For my part, I am against that plan.', 'わたしと しては、その あんに はんたいです。'),
      ex('初めての 試合と しては、よく 頑張った。', 'For a first match, you did very well.', 'はじめての しあいと しては、よく がんばった。'),
    ],
  },
  'n2m-g-5e6709': {
    meaning: 'while saying ~, (actually) …',
    structure: 'Plain form + と は いい ながら',
    explanation:
      'とはいいながら concedes a statement while pointing out a contradiction: 春とはいいながら、まだ寒い. It is literary; とはいえ and とはいうものの are common synonyms.',
    functions: ['concessions'],
    examples: [
      ex('ダイエット中とは いい ながら、毎日 お菓子を 食べて いる。', "She says she's on a diet, yet she eats sweets every day.", 'だいえっとちゅうとは いい ながら、まいにち おかしを たべて いる。'),
      ex('仕事とは いい ながら、旅行を 楽しんだ。', "It was supposedly a work trip, but I enjoyed it like a holiday.", 'しごととは いい ながら、りょこうを たのしんだ。'),
    ],
  },
  'n2m-g-288ef1': {
    meaning: "this is no time for ~; far from ~",
    structure: 'N／V-dict + どころの 騒ぎでは ない',
    explanation:
      'どころの騒ぎではない says a situation has gone far beyond a certain level: 忙しいどころの騒ぎではない "busy doesn’t begin to describe it". It is emphatic and conversational.',
    functions: ['emphasize-negative', 'level'],
    examples: [
      ex('今週は 忙しい どころの 騒ぎでは ない。', 'Busy is an understatement this week.', 'こんしゅうは いそがしい どころの さわぎでは ない。'),
      ex('試験前で、旅行 どころの 騒ぎでは ない。', "With exams coming, a trip is out of the question.", 'しけんまえで、りょこう どころの さわぎでは ない。'),
    ],
  },
  'n2m-g-88bb7b': {
    meaning: 'it has been decided that ~; we will ~ (formal)',
    structure: 'V-dict／V-ない + こと と する',
    explanation:
      'こととする is a formal, official way to announce a decision or rule: 本日の会議は中止することとする "today’s meeting is hereby cancelled". It is common in notices and regulations.',
    functions: ['decision', 'planning-rules'],
    examples: [
      ex('今年の 忘年会は 中止する ことと します。', "This year's end-of-year party is cancelled.", 'ことしの ぼうねんかいは ちゅうしする ことと します。'),
      ex('遅刻 三回で、欠席 一回と みなす ことと する。', 'Three late arrivals will be counted as one absence.', 'ちこく さんかいで、けっせき いっかいと みなす ことと する。'),
    ],
  },
  'n2m-g-380940': {
    meaning: 'through (doing) ~; by way of ~',
    structure: 'N／V-dict + こと を 通して（通じて）',
    explanation:
      'ことを通して names the process through which something is gained: ボランティア活動を通して多くを学んだ "I learned a lot through volunteering". It is formal and emphasises experience.',
    functions: ['through', 'means-methods'],
    examples: [
      ex('留学する ことを 通して、多くの ことを 学んだ。', 'I learned a great deal through studying abroad.', 'りゅうがくする ことを とおして、おおくの ことを まなんだ。'),
      ex('スポーツを する ことを 通して、友達が 増えた。', 'Through playing sport, I made more friends.', 'すぽーつを する ことを とおして、ともだちが ふえた。'),
    ],
  },
  'n2m-g-cf08b5': {
    meaning: 'when it comes to ~ (someone changes)',
    structure: 'N（の こと）+ と なると',
    explanation:
      'となると after a topic says that, when this topic arises, someone behaves differently: 野球のこととなると、父は子供のようになる "when it comes to baseball, Dad becomes like a child". It highlights a strong interest or reaction.',
    functions: ['condition', 'story-topic'],
    examples: [
      ex('お金の ことと なると、彼は とても 厳しい。', 'When it comes to money, he is very strict.', 'おかねの ことと なると、かれは とても きびしい。'),
      ex('ゲームの ことと なると、弟は 何時間でも 話す。', 'When it comes to games, my brother can talk for hours.', 'げーむの ことと なると、おとうとは なんじかんでも はなす。'),
    ],
  },
  'n2m-g-3273d7': {
    meaning: 'by ~, do you mean …?',
    structure: 'N と いうと、+ N の ことですか',
    explanation:
      'というと〜のことですか confirms what the other person means: 来週というと、十日のことですか "by next week, do you mean the 10th?". It is a polite way to check understanding.',
    functions: ['confirm', 'story-topic'],
    examples: [
      ex('「駅前の 店」と いうと、あの パン屋の ことですか。', 'By "the shop by the station", do you mean the bakery?', '「えきまえの みせ」と いうと、あの ぱんやの ことですか。'),
      ex('田中さんと いうと、営業部の 田中さんの ことですか。', 'By Tanaka, do you mean Tanaka in sales?', 'たなかさんと いうと、えいぎょうぶの たなかさんの ことですか。'),
    ],
  },
  'n2m-g-794d8a': {
    meaning: 'even (the famous / tough) ~',
    structure: 'さすがの + N + も',
    explanation:
      'さすがの〜も says that even someone known for strength or skill was affected: さすがの彼も疲れたようだ "even he seems to be tired". It stresses how extreme the situation was.',
    functions: ['extreme-example', 'of-course'],
    examples: [
      ex('さすがの 彼も、この 問題には 困った ようだ。', 'Even he seems to have been stumped by this problem.', 'さすがの かれも、この もんだいには こまった ようだ。'),
      ex('四十度の 暑さには、さすがの 母も 参って いた。', 'Even my mother was worn out by the forty-degree heat.', 'よんじゅうどの あつさには、さすがの ははも まいって いた。'),
    ],
  },
  'n2m-g-1c1262': {
    meaning: 'still (not); as yet (not) (formal)',
    structure: '未だ（いまだ）+ negative ／ いまだに',
    explanation:
      'いまだ with a negative says something has still not happened: 犯人はいまだ見つかっていない. It is written and formal; いまだに is more common in speech, and まだ is the everyday word.',
    functions: ['continuity', 'negative'],
    examples: [
      ex('行方不明の 男性は、いまだ 見つかって いない。', 'The missing man has still not been found.', 'ゆくえふめいの だんせいは、いまだ みつかって いない。'),
      ex('その 謎は いまだ 解かれて いない。', 'That mystery remains unsolved.', 'その なぞは いまだ とかれて いない。'),
    ],
  },
  'n2m-g-2ff04f': {
    meaning: 'do ~ (masculine, to a junior)',
    structure: 'V-ます stem + たまえ',
    explanation:
      'たまえ is an old-fashioned masculine imperative used by men of higher status to juniors: 座りたまえ "sit down". It sounds authoritative but not rude. It is mostly heard in fiction today.',
    functions: ['order'],
    examples: [
      ex('遠慮せず、こちらに 座りたまえ。', "Don't be shy, sit here.", 'えんりょせず、こちらに すわりたまえ。'),
      ex('君の 意見を 聞かせたまえ。', 'Let me hear your opinion.', 'きみの いけんを きかせたまえ。'),
    ],
  },
  'n2m-g-2a7163': {
    meaning: 'extremely ~; nothing could be more ~',
    structure: 'Na／Adj + こと この 上ない',
    explanation:
      'ことこの上ない says a quality is at its utmost: 失礼なことこの上ない "nothing could be ruder". It is formal and emphatic, often used for criticism or strong emotion.',
    functions: ['highest-level', 'emphasize'],
    examples: [
      ex('連絡も なしに 休むとは、無責任な こと この 上ない。', 'Taking a day off without a word is the height of irresponsibility.', 'れんらくも なしに やすむとは、むせきにんな こと この うえない。'),
      ex('この 景色は 美しい こと この 上ない。', 'This scenery is beautiful beyond compare.', 'この けしきは うつくしい こと この うえない。'),
    ],
  },
  'n2m-g-db4102': {
    meaning: 'there is (a little) ~, it is not that there is none',
    structure: 'N + が ない でも ない',
    explanation:
      'がないでもない concedes that a small amount of something exists: 不安がないでもない "it’s not that I have no worries". It is a hedged, reluctant admission.',
    functions: ['negative', 'concessions'],
    examples: [
      ex('不安が ない でも ないが、やって みよう。', "It's not that I have no worries, but let's give it a go.", 'ふあんが ない でも ないが、やって みよう。'),
      ex('彼の 意見にも、一理 ない でも ない。', 'His opinion is not entirely without merit.', 'かれの いけんにも、いちり ない でも ない。'),
    ],
  },
  'n2m-g-6b0654': {
    meaning: 'special; particular',
    structure: '別段（べつだん）の + N',
    explanation:
      '別段の before a noun means "special, particular": 別段の理由はない "there is no particular reason". It is formal and often paired with a negative.',
    functions: ['describe'],
    examples: [
      ex('別段の 理由は ありません。', 'There is no particular reason.', 'べつだんの りゆうは ありません。'),
      ex('今回は 別段の 配慮を お願い します。', 'We ask for special consideration this time.', 'こんかいは べつだんの はいりょを おねがい します。'),
    ],
  },
  'n2m-g-bfcc4b': {
    meaning: 'separately from ~; apart from ~',
    structure: 'N + と は 別に',
    explanation:
      'とは別に says something is handled separately or in addition: 給料とは別にボーナスが出る "a bonus is paid on top of salary". It stresses that the two are distinct.',
    functions: ['add'],
    examples: [
      ex('給料とは 別に、交通費が 支給される。', 'Travel expenses are paid separately from salary.', 'きゅうりょうとは べつに、こうつうひが しきゅうされる。'),
      ex('この 件とは 別に、相談したい ことが あります。', 'Apart from this matter, there is something I would like to discuss.', 'この けんとは べつに、そうだんしたい ことが あります。'),
    ],
  },
  'n2m-g-f63414': {
    meaning: 'separately; (with negative) not particularly',
    structure: '別に + V ／ 別に + negative',
    explanation:
      'As an adverb, 別に means "separately": 別に包んでください "please wrap them separately". With a negative, it means "not particularly": 別に問題ない. The meaning depends on what follows.',
    functions: ['describe', 'negative'],
    examples: [
      ex('これは 別に 包んで ください。', 'Please wrap this separately.', 'これは べつに つつんで ください。'),
      ex('別に 急いで いないから、ゆっくりで いいよ。', "I'm not in any particular hurry, so take your time.", 'べつに いそいで いないから、ゆっくりで いいよ。'),
    ],
  },
  'n2m-g-c690b5': {
    meaning: 'whenever (I see / hear) ~',
    structure: 'V-dict + に つけ（て）',
    explanation:
      'につけ ties a recurring stimulus to a feeling: この歌を聞くにつけ、故郷を思い出す "whenever I hear this song, I think of home". The verb is usually one of perception (見る, 聞く, 思う).',
    functions: ['time-situation', 'feel'],
    examples: [
      ex('子供の 写真を 見るに つけ、成長の 早さを 感じる。', "Whenever I look at my children's photos, I feel how fast they grow.", 'こどもの しゃしんを みるに つけ、せいちょうの はやさを かんじる。'),
      ex('ニュースを 聞くに つけて、心配に なる。', 'Every time I hear the news, I get worried.', 'にゅーすを きくに つけて、しんぱいに なる。'),
    ],
  },
  'n2m-g-b2d9d7': {
    meaning: 'if by any chance ~; in the unlikely event of ~',
    structure: '万一（まんいち）+ V-たら／V-ば ／ 万一の + N',
    explanation:
      '万一 introduces an unlikely but serious possibility: 万一地震が起きたら "if by any chance an earthquake occurs". 万一の時 means "in an emergency". It is a stronger, more formal もし.',
    functions: ['condition-assumption', 'warning'],
    examples: [
      ex('万一 火事に なったら、この 階段から 逃げて ください。', 'If by any chance there is a fire, escape by these stairs.', 'まんいち かじに なったら、この かいだんから にげて ください。'),
      ex('万一の 時の ために、水と 食料を 用意して おく。', 'I keep water and food ready in case of emergency.', 'まんいちの ときの ために、みずと しょくりょうを よういして おく。'),
    ],
  },
  'n2m-g-b77f68': {
    meaning: 'to amount to (as many as) ~',
    structure: 'N（number）+ に 上る（のぼる）',
    explanation:
      'に上る says a total reaches a large number: 被害者は百人に上った "the victims numbered as many as a hundred". It is formal and common in news reports.',
    functions: ['amount'],
    examples: [
      ex('今回の 台風の 被害は 数百億円に 上った。', "The damage from this typhoon amounted to tens of billions of yen.", 'こんかいの たいふうの ひがいは すうひゃくおくえんに のぼった。'),
      ex('参加者は 千人に 上る 見込みだ。', 'The number of participants is expected to reach a thousand.', 'さんかしゃは せんにんに のぼる みこみだ。'),
    ],
  },
  'n2m-g-d3dcfa': {
    meaning: 'only; solely (formal)',
    structure: 'N／V-dict + のみ',
    explanation:
      'のみ is a formal だけ: 会員のみ入場可 "members only". It is common on signs, in documents and in literary style. のみならず means "not only".',
    functions: ['limit'],
    examples: [
      ex('この 部屋は 関係者のみ 入る ことが できます。', 'Only authorised persons may enter this room.', 'この へやは かんけいしゃのみ はいる ことが できます。'),
      ex('あとは 結果を 待つのみだ。', 'All that remains is to wait for the results.', 'あとは けっかを まつのみだ。'),
    ],
  },
  'n2m-g-a3993f': {
    meaning: 'since ~, it is only natural that …',
    structure: 'Plain form + わけだから、… + は 当然だ',
    explanation:
      'わけだから sets out a logical premise, and は当然だ draws the natural conclusion: 十年住んでいたわけだから、詳しいのは当然だ "he lived there ten years, so naturally he knows it well". It is explanatory.',
    functions: ['conclude', 'of-course'],
    examples: [
      ex('毎日 練習して いる わけだから、上手なのは 当然だ。', 'She practises every day, so of course she is good.', 'まいにち れんしゅうして いる わけだから、じょうずなのは とうぜんだ。'),
      ex('彼は 医者な わけだから、薬に 詳しいのは 当然だ。', 'He is a doctor, so naturally he knows about medicine.', 'かれは いしゃな わけだから、くすりに くわしいのは とうぜんだ。'),
    ],
  },
  'n2m-g-fcbc42': {
    meaning: 'within the range / limits of ~',
    structure: 'V-dict／N の + 範囲（はんい）で',
    explanation:
      '範囲で sets the limits within which something is done: 無理のない範囲で "within reasonable limits", 予算の範囲で. It is common in requests and business.',
    functions: ['range', 'limit'],
    examples: [
      ex('無理の ない 範囲で、手伝って ください。', 'Please help as far as you reasonably can.', 'むりの ない はんいで、てつだって ください。'),
      ex('予算の 範囲で、できるだけ いい ものを 選んだ。', 'Within the budget, I chose the best I could.', 'よさんの はんいで、できるだけ いい ものを えらんだ。'),
    ],
  },
  'n2m-g-9bded1': {
    meaning: 'in the momentum of ~; (はずみで) by accident',
    structure: 'V-た + はずみに（で）／ 何かの はずみで',
    explanation:
      'はずみ describes the momentum of an action leading to an unintended result: 転んだはずみに眼鏡が落ちた "when I fell, my glasses flew off". 何かのはずみで means "by some chance".',
    functions: ['cause-reason', 'unexpected-outcome'],
    examples: [
      ex('転んだ はずみに、ポケットから 携帯が 落ちた。', 'When I fell, my phone flew out of my pocket.', 'ころんだ はずみに、ぽけっとから けいたいが おちた。'),
      ex('何かの はずみで、昔の ことを 思い出した。', 'For some reason, the past suddenly came back to me.', 'なにかの はずみで、むかしの ことを おもいだした。'),
    ],
  },
  'n2m-g-bd1e55': {
    meaning: 'exactly; precisely; truly',
    structure: 'まさに + N／V',
    explanation:
      'まさに emphasises that something is exactly the case: まさにその通りだ "that is exactly right", まさに天才だ. It also means "just about to": まさに出発しようとしていた.',
    functions: ['emphasize'],
    examples: [
      ex('あなたの 言う ことは、まさに その とおりです。', 'What you say is exactly right.', 'あなたの いう ことは、まさに その とおりです。'),
      ex('あの 試合は まさに 奇跡だった。', 'That match was truly a miracle.', 'あの しあいは まさに きせきだった。'),
    ],
  },
  'n2m-g-dd3d12': {
    meaning: 'is nothing more than ~; only ~',
    structure: 'N + で しか ない',
    explanation:
      'でしかない says something is merely what it is, often dismissively: それは言い訳でしかない "that is nothing but an excuse". It is similar to に過ぎない but more subjective.',
    functions: ['limit'],
    examples: [
      ex('それは 言い訳で しか ない。', 'That is nothing more than an excuse.', 'それは いいわけで しか ない。'),
      ex('私は まだ 見習いで しか ない。', 'I am still only an apprentice.', 'わたしは まだ みならいで しか ない。'),
    ],
  },
  'n2m-g-6af4b9': {
    meaning: 'to the end; persistently; strictly (only)',
    structure: 'あくまで（も）+ V ／ あくまで + N（だ）',
    explanation:
      'あくまで expresses persistence, "to the very end": あくまで反対する "oppose to the last". It also limits a statement: これはあくまで私の意見です "this is strictly my own opinion".',
    functions: ['determination-decision', 'limit'],
    examples: [
      ex('彼は あくまで 自分の 意見を 変えなかった。', 'He refused to change his opinion to the very end.', 'かれは あくまで じぶんの いけんを かえなかった。'),
      ex('これは あくまでも 私 個人の 考えです。', 'This is strictly my own personal view.', 'これは あくまでも わたし こじんの かんがえです。'),
    ],
  },
  'n2m-g-dc91cc': {
    meaning: 'if (one) could ~ (unlikely); if one were to ~',
    structure: 'V-potential + ものなら ／ V-volitional + ものなら',
    explanation:
      'After a potential verb, ものなら raises a possibility the speaker thinks unlikely: 帰れるものなら帰りたい "I would go home if only I could". できるものならやってみろ is a taunt, "try it if you think you can". After a volitional form (しようものなら) it warns that doing something would bring a bad result.',
    functions: ['condition', 'wish'],
    examples: [
      ex('行ける ものなら、今すぐ 故郷に 帰りたい。', 'If only I could, I would go back to my hometown right now.', 'いける ものなら、いますぐ こきょうに かえりたい。'),
      ex('できる ものなら、やって みなさい。', 'Go ahead and try it, if you think you can.', 'できる ものなら、やって みなさい。'),
      ex('遅刻しよう ものなら、部長に ひどく 叱られる。', 'If you are ever late, the manager gives you a real telling-off.', 'ちこくしよう ものなら、ぶちょうに ひどく しかられる。'),
    ],
  },
  'n2m-g-d7ebe0': {
    meaning: 'when it comes to ~; once it is a matter of ~',
    structure: 'N（の こと）+ となったら ／ V-dict + となったら',
    explanation:
      'となったら marks a topic or situation that changes how someone behaves: 彼は野球のこととなったら夢中になる "when it comes to baseball he is a different person". It also means "if it actually comes to ~": 引っ越すとなったら. となると is the neutral form; となったら is a little more conversational.',
    functions: ['condition', 'story-topic'],
    examples: [
      ex('父は 釣りの こととなったら、何時間でも 話し続ける。', 'When it comes to fishing, my father will talk for hours.', 'ちちは つりの こととなったら、なんじかんでも はなしつづける。'),
      ex('海外に 引っ越すとなったら、準備が 大変だ。', 'If it comes to moving abroad, the preparations will be a lot of work.', 'かいがいに ひっこすとなったら、じゅんびが たいへんだ。'),
    ],
  },
  'n2m-g-fdb1f4': {
    meaning: 'sometimes; at times (時として) ／ not for a moment (一時として〜ない)',
    structure: '時として + clause ／ 一時（いっとき）として + V-ない',
    explanation:
      '時として is a written-style "sometimes, on occasion", often for something surprising or out of character: 優しい人も時として厳しいことを言う. It is less frequent in speech than ときどき. With a negative, 一時として〜ない means "not for a single moment", close to 片時も〜ない.',
    functions: ['frequency', 'negative'],
    examples: [
      ex('優しい 彼も、時として 厳しい ことを 言う。', 'Kind as he is, he sometimes says harsh things.', 'やさしい かれも、ときとして きびしい ことを いう。'),
      ex('自然は 時として 人間に 牙を むく。', 'Nature at times turns its fangs on humans.', 'しぜんは ときとして にんげんに きばを むく。'),
      ex('母の ことを 一時として 忘れた ことは ない。', 'I have never forgotten my mother for a single moment.', 'ははの ことを いっときとして わすれた ことは ない。'),
    ],
  },
  'n2m-g-3eb581': {
    meaning: 'might as well; would rather (drastic choice)',
    structure: 'いっそ（の こと）+ V（ほうが いい／〜しよう）',
    explanation:
      'いっそ proposes a drastic, all-or-nothing option, usually out of frustration with the current half-measure: いっそやめてしまおう "I might as well just quit". むしろ weighs two options calmly ("rather, if anything"); いっそ jumps to the extreme one. いっそのこと is a slightly stronger variant.',
    functions: ['compare', 'decision'],
    examples: [
      ex('こんなに 悩むなら、いっそ 会社を 辞めて しまおうか。', "If it troubles me this much, maybe I should just quit the company.", 'こんなに なやむなら、いっそ かいしゃを やめて しまおうか。'),
      ex('修理代が そんなに 高いなら、いっその こと 新しいのを 買おう。', "If the repair costs that much, we might as well buy a new one.", 'しゅうりだいが そんなに たかいなら、いっその こと あたらしいのを かおう。'),
    ],
  },
  'n2m-g-efb041': {
    meaning: 'extraordinary; no ordinary (hardship, effort)',
    structure: 'N（苦労・努力 など）は 一通り（ひととおり）で（は）ない',
    explanation:
      '一通りではない says something went far beyond the ordinary, almost always about hardship, effort or worry: 苦労は一通りではなかった. It is a set phrase in narrative and written style. Do not confuse it with 一通り on its own, which means "roughly, the basics": 一通り目を通した "I skimmed through it".',
    functions: ['level', 'emphasize'],
    examples: [
      ex('店を 立て直すまでの 苦労は 一通りでは なかった。', 'The hardship of rebuilding the shop was no ordinary thing.', 'みせを たてなおすまでの くろうは ひととおりでは なかった。'),
      ex('娘が 行方不明に なった とき、両親の 心配は 一通りでは なかった。', 'When their daughter went missing, the parents were worried beyond words.', 'むすめが ゆくえふめいに なった とき、りょうしんの しんぱいは ひととおりでは なかった。'),
    ],
  },
  'n2m-g-0b8c59': {
    meaning: 'to get worked up (over something trivial); to take a joke seriously',
    structure: '（N に）むきに なる ／ むきに なって + V',
    explanation:
      'むきになる describes overreacting: getting heated, defensive or competitive over something that does not deserve it, such as a joke or a small game. It carries mild criticism of the person. 真剣になる "become serious" is neutral or positive; むきになる implies the seriousness is out of proportion.',
    functions: ['feel', 'criticize'],
    examples: [
      ex('冗談なのに、彼は すぐ むきに なる。', "It's only a joke, but he gets worked up straight away.", 'じょうだんなのに、かれは すぐ むきに なる。'),
      ex('子供相手の ゲームに、そんなに むきに ならなくても いいでしょう。', "There's no need to get so worked up over a game with a child.", 'こどもあいての げーむに、そんなに むきに ならなくても いいでしょう。'),
    ],
  },
  'n2m-g-bf6928': {
    meaning: 'from A all the way to B; everything from A to B',
    structure: 'N1 + から + N2 + に 至る（いたる）まで',
    explanation:
      'からに至るまで stresses how wide a range is covered, with N2 as the surprising far end: 子供からお年寄りに至るまで "everyone from children to the elderly". Plain から〜まで just marks two limits; に至るまで adds "even down to". It is formal and common in writing and speeches.',
    functions: ['range', 'origin-and-end-point'],
    examples: [
      ex('この 歌は 子供から お年寄りに 至るまで、みんなに 愛されて いる。', 'This song is loved by everyone, from children to the elderly.', 'この うたは こどもから おとしよりに いたるまで、みんなに あいされて いる。'),
      ex('服装から 言葉遣いに 至るまで、厳しく 注意された。', 'I was strictly corrected on everything from my clothes to the way I spoke.', 'ふくそうから ことばづかいに いたるまで、きびしく ちゅういされた。'),
    ],
  },
  'n2m-g-694c58': {
    meaning: 'not a single ~; not even one',
    structure: '（N が）ひとつも + V-ない ／ 何（なに）ひとつ + V-ない',
    explanation:
      'ひとつも〜ない denies every single item: 間違いはひとつもなかった "there was not one mistake". 何ひとつ〜ない is more emphatic and literary. 少しも〜ない is used for amount or degree rather than countable things.',
    functions: ['negative', 'emphasize-negative'],
    examples: [
      ex('テストに 間違いは ひとつも なかった。', 'There was not a single mistake in the test.', 'てすとに まちがいは ひとつも なかった。'),
      ex('彼の 言う ことは 何ひとつ 信じられない。', "I can't believe a single thing he says.", 'かれの いう ことは なにひとつ しんじられない。'),
    ],
  },
  'n2m-g-d72f99': {
    meaning: 'to seem as if ~ (but may not be so)',
    structure: 'Plain form + かに 見える（見えた）',
    explanation:
      'かに見える describes an appearance that may turn out to be misleading, so it often comes before が／しかし: 問題は解決したかに見えたが… "the problem seemed solved, but…". ように見える is neutral; かに見える is written style and hints at doubt. It is close to かのようだ.',
    functions: ['similarity-degree', 'speculation'],
    examples: [
      ex('問題は 解決したかに 見えたが、翌週 また 起きた。', 'The problem seemed to have been solved, but it happened again the following week.', 'もんだいは かいけつしたかに みえたが、よくしゅう また おきた。'),
      ex('景気は 回復しつつ あるかに 見える。', 'The economy appears to be recovering.', 'けいきは かいふくしつつ あるかに みえる。'),
    ],
  },
  'n2m-g-05acbf': {
    meaning: 'since (one has done) this much ~, (naturally) ~',
    structure: 'これだけ + V／A + のだから、+ judgement',
    explanation:
      'これだけ〜のだから uses the amount already done as grounds for a conclusion: これだけ練習したのだから、大丈夫だ "we have practised this much, so we will be fine". The conclusion is often confident or a decision to give up. それだけ refers to an amount already mentioned; これだけ points to the one in front of the speaker.',
    functions: ['grounds', 'cause-reason'],
    examples: [
      ex('これだけ 練習したのだから、きっと 大丈夫だ。', "We've practised this much, so we'll surely be fine.", 'これだけ れんしゅうしたのだから、きっと だいじょうぶだ。'),
      ex('これだけ 頼んでも だめなのだから、あきらめよう。', "If asking this many times doesn't work, let's give up.", 'これだけ たのんでも だめなのだから、あきらめよう。'),
    ],
  },
  'n2m-g-51c193': {
    meaning: 'even if one does ~, it will only ~',
    structure: 'V-た + ところで、+ V-dict + だけだ',
    explanation:
      'たところで〜だけだ says an action is pointless because the only result would be a bad one: 謝ったところで怒らせるだけだ "apologising would only make it worse". ても also means "even if", but ところで adds the speaker’s conviction that the effort is futile. The main clause never expresses a hope or plan.',
    functions: ['concessions', 'result'],
    examples: [
      ex('今から 謝った ところで、彼を 怒らせる だけだ。', 'Apologising now would only make him angrier.', 'いまから あやまった ところで、かれを おこらせる だけだ。'),
      ex('一人で 悩んだ ところで、疲れる だけだ。', 'Worrying about it on your own will only wear you out.', 'ひとりで なやんだ ところで、つかれる だけだ。'),
    ],
  },
  'n2m-g-69e2a7': {
    meaning: 'before long; eventually; in time',
    structure: 'やがて + V（change, arrival）',
    explanation:
      'やがて says that after some time passes, a change naturally comes: 雨はやがて雪に変わった. まもなく means "shortly" and is used for imminent events and announcements; いずれ is "someday", vaguer and more distant; そのうち is its casual counterpart. やがて is common in narration.',
    functions: ['future-time', 'time-sequence'],
    examples: [
      ex('雨は やがて 雪に 変わった。', 'Before long, the rain turned to snow.', 'あめは やがて ゆきに かわった。'),
      ex('小さな 町工場は やがて 大きな 会社に 成長した。', 'The small workshop eventually grew into a large company.', 'ちいさな まちこうばは やがて おおきな かいしゃに せいちょうした。'),
    ],
  },
  'n2m-g-c407bf': {
    meaning: 'deliberately; dare to (despite reasons not to)',
    structure: 'あえて + V ／ あえて + V-ない',
    explanation:
      'あえて marks a conscious choice made against obvious reasons or expectations: あえて反対した "I deliberately opposed it". あえて〜ない means "choose not to ~". わざと also means "on purpose" but often suggests mischief; あえて implies a considered decision.',
    functions: ['intent', 'determination-decision'],
    examples: [
      ex('反対される ことを 承知で、あえて 意見を 言った。', 'Knowing I would be opposed, I deliberately spoke my mind.', 'はんたいされる ことを しょうちで、あえて いけんを いった。'),
      ex('試験の 結果は あえて 聞かなかった。', 'I chose not to ask about the exam results.', 'しけんの けっかは あえて きかなかった。'),
    ],
  },
  'n2m-g-e2b044': {
    meaning: 'is both A and B; is also ~',
    structure: 'N1 + でも あり、N2 + でも ある',
    explanation:
      'でもあり、でもある presents two roles or natures that are true at the same time: 医者でもあり、作家でもある "he is both a doctor and a writer". It often pairs things that pull in different directions, like joy and responsibility. A single でもある means "is also ~".',
    functions: ['add'],
    examples: [
      ex('彼は 医者でも あり、作家でも ある。', 'He is both a doctor and a writer.', 'かれは いしゃでも あり、さっかでも ある。'),
      ex('昇進は 喜びでも あり、重い 責任でも ある。', 'A promotion is a joy and also a heavy responsibility.', 'しょうしんは よろこびでも あり、おもい せきにんでも ある。'),
    ],
  },
  'n2m-g-f4f13b': {
    meaning: 'if it actually comes to ~; once it is decided that ~',
    structure: 'V-dict／N + と なったら ／ いざ と なったら',
    explanation:
      'となったら sets up a situation that becomes real or decided, and the speaker says what will follow: 結婚するとなったら、家を探さないと. いざとなったら "if worst comes to worst, when it really matters" is a fixed phrase. Plain たら is a simple condition; となったら stresses the new situation arising.',
    functions: ['condition', 'case'],
    examples: [
      ex('いざ と なったら、私が 責任を 取ります。', 'If it comes to the crunch, I will take responsibility.', 'いざ と なったら、わたしが せきにんを とります。'),
      ex('本当に 留学すると なったら、両親に 相談しなければ ならない。', 'If I really do decide to study abroad, I will have to talk to my parents.', 'ほんとうに りゅうがくすると なったら、りょうしんに そうだんしなければ ならない。'),
    ],
  },
  'n2m-g-a75889': {
    meaning: 'humble or contemptuous plural (私ども, 者ども)',
    structure: '私（わたくし）／手前 + ども（humble）／ N（people）+ ども（contempt）',
    explanation:
      'ども pluralises people. On the speaker’s own side it is humble: 私ども "we (our company)" is standard in business. On others it is contemptuous: 悪人ども "those villains". Neutral plurals are たち, and the respectful one is 方（がた）.',
    functions: ['reverent-humble', 'contemptuous'],
    examples: [
      ex('私どもの 店では、そのような 商品は 扱って おりません。', 'Our shop does not carry such products.', 'わたくしどもの みせでは、そのような しょうひんは あつかって おりません。'),
      ex('悪人どもを 村から 追い払え。', 'Drive those villains out of the village!', 'あくにんどもを むらから おいはらえ。'),
    ],
  },
  'n2m-g-ece63b': {
    meaning: 'if things go wrong; at worst; if one is unlucky',
    structure: '下手（へた）を すると + clause（かもしれない／恐れが ある）',
    explanation:
      '下手をすると warns of a bad outcome that could happen if things go badly: 下手をすると命に関わる "at worst it could be life-threatening". The clause usually ends in かもしれない or similar. 下手に (without を) means "carelessly, clumsily" and describes how an action is done.',
    functions: ['condition-assumption', 'warning'],
    examples: [
      ex('下手を すると、終電に 間に合わないかも しれない。', 'If things go badly, we might miss the last train.', 'へたを すると、しゅうでんに まにあわないかも しれない。'),
      ex('この 病気は 下手を すると 命に 関わる。', 'At worst, this illness can be life-threatening.', 'この びょうきは へたを すると いのちに かかわる。'),
    ],
  },
  'n2m-g-1c0940': {
    title: '際（に）',
    meaning: 'when; on the occasion of ~ (formal)',
    structure: 'V-dict／V-た + 際（さい）（に）／ N の + 際（に）',
    explanation:
      '際に is a formal とき, used in notices, business and announcements: お帰りの際は "when you leave". It suits a particular occasion rather than a general habit. The dump spelled it 祭 (festival), a typo for 際.',
    functions: ['time-situation', 'case'],
    examples: [
      ex('お帰りの 際は、お忘れ物に ご注意 ください。', 'When you leave, please make sure you have all your belongings.', 'おかえりの さいは、おわすれものに ごちゅうい ください。'),
      ex('日本に 来た 際に、友人の 家に 泊めて もらった。', 'When I came to Japan, I stayed at a friend’s house.', 'にほんに きた さいに、ゆうじんの いえに とめて もらった。'),
    ],
  },
  'n2m-g-b2cf01': {
    meaning: 'finally; at last; in the end (never)',
    structure: 'ついに + V-た ／ ついに + V-なかった',
    explanation:
      'ついに marks the end point of a long process: 十年かけてついに夢をかなえた. やっと stresses the relief of reaching something hoped for; とうとう and ついに both work for good or bad outcomes, with ついに more written. ついに〜なかった means "in the end never happened".',
    functions: ['result', 'finish'],
    examples: [
      ex('十年 かけて、ついに 夢を 実現した。', 'After ten years, she finally made her dream come true.', 'じゅうねん かけて、ついに ゆめを じつげんした。'),
      ex('いくら 待っても、彼は ついに 現れなかった。', 'However long we waited, he never showed up in the end.', 'いくら まっても、かれは ついに あらわれなかった。'),
    ],
  },
  'n2m-g-31d8db': {
    meaning: 'no more ~ than this; cannot ~ any further',
    structure: 'これ以上（いじょう）+ V-ない ／ これ以上の N は ない',
    explanation:
      'これ以上〜ない marks a limit that has been reached: これ以上歩けない "I can’t walk any further". これ以上のNはない means "there is no greater N than this", a strong compliment. これ以上〜と… sets a warning condition: これ以上遅れると間に合わない.',
    functions: ['limit', 'highest-level'],
    examples: [
      ex('足が 痛くて、もう これ以上 歩けない。', "My feet hurt so much I can't walk any further.", 'あしが いたくて、もう これいじょう あるけない。'),
      ex('今の 私には、これ以上の 幸せは ない。', 'For me right now, there could be no greater happiness.', 'いまの わたしには、これいじょうの しあわせは ない。'),
    ],
  },
  'n2m-g-56d3a3': {
    meaning: 'could ~ (reluctantly); it is not that one doesn’t ~',
    structure: 'V-ない + なくも ない（なくは ない）',
    explanation:
      'The double negative なくもない grants a possibility half-heartedly: 引き受けなくもない "I might take it on". It sounds less committal than できる or わかる alone. なくはない is the same with slightly more emphasis on the grudging concession.',
    functions: ['negative', 'vague'],
    examples: [
      ex('条件 次第では、引き受けなくも ない。', 'Depending on the terms, I might take it on.', 'じょうけん しだいでは、ひきうけなくも ない。'),
      ex('彼の 気持ちも わからなくは ない。', 'I can sort of understand how he feels.', 'かれの きもちも わからなくは ない。'),
    ],
  },
  'n2m-g-8d466f': {
    meaning: 'judging from ~; from the point of view of ~',
    structure: 'N + から みると（から 見ると）',
    explanation:
      'から見ると takes a piece of evidence as the basis for a judgement: 空の様子から見ると "judging from the sky". With a person it sets a standpoint: 親から見ると "from a parent’s point of view". からすると is close and slightly more formal.',
    functions: ['perspective-way', 'judge'],
    examples: [
      ex('空の 様子から 見ると、午後は 雨に なりそうだ。', 'Judging from the sky, it looks like rain this afternoon.', 'そらの ようすから みると、ごごは あめに なりそうだ。'),
      ex('親から 見ると、子供は いつまでも 子供だ。', 'To a parent, a child is always a child.', 'おやから みると、こどもは いつまでも こどもだ。'),
    ],
  },
  'n2m-g-806c75': {
    meaning: 'rather; if anything; on the contrary',
    structure: '（A より）むしろ B',
    explanation:
      'むしろ says B fits better than A, often against expectation: 休むとむしろ疲れる "resting actually makes me more tired". It is a calm comparison. いっそ is a drastic choice made in frustration; かえって emphasises an unexpected opposite result.',
    functions: ['compare'],
    examples: [
      ex('彼は 先生と いうより、むしろ 友達のような 存在だ。', 'He is less a teacher than a friend.', 'かれは せんせいと いうより、むしろ ともだちのような そんざいだ。'),
      ex('薬を 飲みすぎると、むしろ 体に 悪い。', 'Taking too much medicine is, if anything, bad for you.', 'くすりを のみすぎると、むしろ からだに わるい。'),
    ],
  },
  'n2m-g-b97488': {
    meaning: 'anyway; in any case (resigned); since ~ anyway',
    structure: 'どうせ + clause ／ どうせ〜なら',
    explanation:
      'どうせ presents an outcome as already fixed, usually with resignation: どうせ間に合わない "we won’t make it anyway". どうせ〜なら turns that into a positive decision: どうせやるなら楽しくやろう. どっちみち and いずれにしても are neutral; どうせ carries the speaker’s feeling.',
    functions: ['invariant', 'feel'],
    examples: [
      ex('どうせ 間に合わないから、ゆっくり 行こう。', "We won't make it anyway, so let's take our time.", 'どうせ まにあわないから、ゆっくり いこう。'),
      ex('どうせ やるなら、楽しく やろう。', "If we're going to do it anyway, let's enjoy it.", 'どうせ やるなら、たのしく やろう。'),
    ],
  },
  'n2m-g-5bd930': {
    meaning: 'while ~ing; although ~ (つつも)',
    structure: 'V-ます stem + つつ ／ V-ます stem + つつ（も）',
    explanation:
      'つつ is a written ながら: two actions by the same subject at once, 景色を楽しみつつ歩いた. つつも is concessive, "although": 悪いと知りつつも "though I knew it was wrong". Do not confuse it with つつある, which marks an ongoing change.',
    functions: ['simultaneous', 'concessions'],
    examples: [
      ex('景色を 楽しみつつ、山道を 歩いた。', 'We walked the mountain path while enjoying the scenery.', 'けしきを たのしみつつ、やまみちを あるいた。'),
      ex('悪いと 知りつつも、嘘を ついて しまった。', 'Although I knew it was wrong, I ended up lying.', 'わるいと しりつつも、うそを ついて しまった。'),
    ],
  },
  'n2m-g-d773f9': {
    meaning: 'at least (the minimum one hopes for)',
    structure: 'せめて + N（だけでも）／ せめて + V-たい／V-て ほしい',
    explanation:
      'せめて names the minimum the speaker would settle for when more is not possible: せめて一日休みたい "I want at least one day off". It goes with wishes, requests and efforts. 少なくとも is an objective lower limit ("at the very least 100 people came") and carries no longing.',
    functions: ['limit', 'wish'],
    examples: [
      ex('忙しくても、せめて 一日だけでも 休みたい。', 'Busy as I am, I would like at least one day off.', 'いそがしくても、せめて いちにちだけでも やすみたい。'),
      ex('優勝は 無理でも、せめて 一勝は したい。', "Even if we can't win the tournament, I want at least one win.", 'ゆうしょうは むりでも、せめて いっしょうは したい。'),
    ],
  },
  'n2m-g-71fc28': {
    meaning: 'in this way; like this; how',
    structure: 'こんな／そんな／あんな／どんな + ふうに ／ V・A + ふうに',
    explanation:
      'ふうに describes a manner: こんなふうに書く "write it like this", どんなふうに "in what way". It is conversational; ように is the neutral or written equivalent. As a suffix, 風（ふう） means "style": 和風 "Japanese style".',
    functions: ['perspective-way', 'method'],
    examples: [
      ex('こんな ふうに 書けば、読みやすく なりますよ。', 'If you write it like this, it becomes easier to read.', 'こんな ふうに かけば、よみやすく なりますよ。'),
      ex('どんな ふうに 説明すれば いいか わからない。', "I don't know how I should explain it.", 'どんな ふうに せつめいすれば いいか わからない。'),
    ],
  },
  'n2m-g-0c7c7a': {
    meaning: 'it is not necessarily the case that ~',
    structure: 'Plain form（〜ば いい など）+ という ものでも ない',
    explanation:
      'というものでもない rejects a simple rule of thumb: 高ければいいというものでもない "expensive does not automatically mean good". というものではない is the same with firmer denial. わけではない denies an inference in the current conversation; というものでもない rejects a general assumption.',
    functions: ['negative', 'judge'],
    examples: [
      ex('値段が 高ければ いい という ものでも ない。', "Just because something is expensive doesn't mean it's good.", 'ねだんが たかければ いい という ものでも ない。'),
      ex('長く 勉強すれば 成績が 上がる という ものでは ない。', "Studying for longer doesn't necessarily raise your grades.", 'ながく べんきょうすれば せいせきが あがる という ものでは ない。'),
    ],
  },
  'n2m-g-afe74a': {
    meaning: 'not until after ~; only after ~ (can one ~)',
    structure: 'V-て + から で ないと／から で なければ + V-ない（難しい）',
    explanation:
      'てからでないと sets a prerequisite: B cannot happen until A is done. 見てからでないと決められない "I can’t decide until I have seen it". The main clause is negative or means "difficult". てからでなければ is slightly more formal.',
    functions: ['condition-requirement', 'time-sequence'],
    examples: [
      ex('実物を 見てからで ないと、買うか どうか 決められない。', "I can't decide whether to buy it until I have seen the real thing.", 'じつぶつを みてからで ないと、かうか どうか きめられない。'),
      ex('宿題を 終えてからで なければ、遊びに 行っては いけません。', 'You may not go out to play until you have finished your homework.', 'しゅくだいを おえてからで なければ、あそびに いっては いけません。'),
    ],
  },
  'n2m-g-8625ef': {
    meaning: 'too ~; so ~ that; because of the extreme ~',
    structure: 'あまりに（も）+ A ／ あまりの + N + に',
    explanation:
      'あまりに(も) intensifies an adjective to an excessive degree, often followed by a consequence: あまりに高くて買えなかった. あまりの寒さに "because of the extreme cold" turns a noun into the cause. Do not confuse it with あまり〜ない, which means "not very".',
    functions: ['level', 'cause-reason'],
    examples: [
      ex('その 時計は あまりに 高くて、買えなかった。', 'That watch was far too expensive for me to buy.', 'その とけいは あまりに たかくて、かえなかった。'),
      ex('あまりの 寒さに、声も 出なかった。', 'It was so cold that I could not even speak.', 'あまりの さむさに、こえも でなかった。'),
    ],
  },
  'n2m-g-de0373': {
    meaning: 'it was worth the effort; the effort paid off',
    structure: 'V-た／N の + 甲斐（かい）が ある ／ 甲斐も なく',
    explanation:
      '甲斐がある says an effort already made was rewarded: 努力した甲斐があって合格した. 甲斐もなく is the opposite, "in vain": 看病の甲斐もなく. The compound suffix 〜がい (やりがい, 生きがい) instead names the worth that doing something brings.',
    functions: ['value', 'result'],
    examples: [
      ex('毎日 努力した 甲斐が あって、試験に 合格できた。', 'My daily effort paid off and I passed the exam.', 'まいにち どりょくした かいが あって、しけんに ごうかくできた。'),
      ex('看病の 甲斐も なく、犬は 死んで しまった。', 'Despite all our care, the dog died.', 'かんびょうの かいも なく、いぬは しんで しまった。'),
    ],
  },
  'n2m-g-c9123b': {
    meaning: "can't just keep ~ing; can't afford to only ~",
    structure: 'V-て + ばかりは いられない',
    explanation:
      'てばかりはいられない says the speaker cannot go on doing only one thing, because the situation demands action: 泣いてばかりはいられない. It often opens a turn toward resolve. てばかりもいられない is the softer twin, implying other matters also need attention.',
    functions: ['limit', 'necessary-obligation'],
    examples: [
      ex('泣いて ばかりは いられない。前を 向こう。', "I can't just keep crying. Let's look forward.", 'ないて ばかりは いられない。まえを むこう。'),
      ex('試験が 近いので、遊んで ばかりは いられない。', "The exam is close, so I can't just keep playing.", 'しけんが ちかいので、あそんで ばかりは いられない。'),
    ],
  },
  'n2m-g-0ddfc9': {
    meaning: 'whereas ~; in contrast to ~',
    structure: 'Plain form（な-adj／N + な）+ のに 対して（たいして）',
    explanation:
      'のに対して contrasts two facts side by side: 兄が背が高いのに対して、弟は小柄だ. It is objective and common in reports. N に対して alone usually means "towards, against": 客に対して丁寧だ. 一方（で） is a similar contrast marker.',
    functions: ['contrast', 'compare-contrast'],
    examples: [
      ex('兄が 背が 高いのに 対して、弟は 小柄だ。', 'Whereas the older brother is tall, the younger one is small.', 'あにが せが たかいのに たいして、おとうとは こがらだ。'),
      ex('都市の 人口が 増えて いるのに 対して、地方は 減って いる。', 'While the urban population is growing, rural areas are shrinking.', 'としの じんこうが ふえて いるのに たいして、ちほうは へって いる。'),
    ],
  },
  'n2m-g-42bc5d': {
    meaning: 'even though ~ (critical, colloquial)',
    structure: 'Plain form（N の／な-adj な）+ くせして',
    explanation:
      'くせして is a colloquial variant of くせに: it criticises someone for acting in a way that does not fit what they are or know. 何もしないくせして文句ばかり言う. It is rude when aimed at the listener. のに states the contrast without the same scorn.',
    functions: ['concessions', 'criticize'],
    examples: [
      ex('自分では 何も しない くせして、文句ばかり 言う。', "He does nothing himself, yet he does nothing but complain.", 'じぶんでは なにも しない くせして、もんくばかり いう。'),
      ex('子供の くせして、生意気な ことを 言うな。', "Don't talk back like that when you're just a kid.", 'こどもの くせして、なまいきな ことを いうな。'),
    ],
  },
  'n2m-g-f034ed': {
    meaning: 'at least did (all) ~; did as much as one could',
    structure: 'V-dict + だけは + V-た ／ N + だけは',
    explanation:
      'Repeating the verb around だけは says one did at least that much, whatever the result: やるだけはやった "I did all I could". It implies the outcome was poor or uncertain. With a noun, だけは means "this one thing at least": 命だけは助けてください.',
    functions: ['limit', 'achievement'],
    examples: [
      ex('結果は どうであれ、やる だけは やった。', 'Whatever the result, I did everything I could.', 'けっかは どうであれ、やる だけは やった。'),
      ex('言う だけは 言って みたが、聞いて もらえなかった。', 'I at least said my piece, but no one listened.', 'いう だけは いって みたが、きいて もらえなかった。'),
    ],
  },
  'n2m-g-6973bb': {
    meaning: 'as; in the way that ~; according to ~',
    structure: 'V-dict／V-た + とおり（に）／ N の + とおり ／ N + どおり',
    explanation:
      'とおり means "exactly as": 言ったとおりにやる "do it as I said". After a noun directly it becomes どおり: 予定どおり "as scheduled", 期待どおり. ように can be vaguer ("so as to" or "like"); とおり stresses matching a model or plan.',
    functions: ['perspective-way', 'standard'],
    examples: [
      ex('予定どおり、会議は 三時に 始まった。', 'The meeting started at three, as scheduled.', 'よていどおり、かいぎは さんじに はじまった。'),
      ex('先生が 言った とおりに やって みて ください。', 'Please try doing it exactly as the teacher said.', 'せんせいが いった とおりに やって みて ください。'),
    ],
  },
  'n2m-g-fb6963': {
    meaning: 'very; considerably; must be very ~ (inference)',
    structure: 'よほど（よっぽど）+ A／V ／ よほど〜らしい・のだろう',
    explanation:
      'よほど marks a high degree, and is often used to infer it from evidence: 一日中寝ているなんて、よほど疲れていたのだろう. よほど〜ようと思った means "I very nearly ~". よっぽど is the colloquial form; かなり and ずいぶん state degree without the inference.',
    functions: ['level', 'speculation'],
    examples: [
      ex('一日中 寝て いるなんて、よほど 疲れて いたのだろう。', 'Sleeping all day like that, she must have been really tired.', 'いちにちじゅう ねて いるなんて、よほど つかれて いたのだろう。'),
      ex('あまりに 腹が 立って、よほど 帰ろうかと 思った。', 'I was so angry I very nearly went home.', 'あまりに はらが たって、よほど かえろうかと おもった。'),
    ],
  },
  'n2m-g-318809': {
    meaning: "at least ~ (so it's not all bad)",
    structure: 'Plain form + だけ まし だ',
    explanation:
      'だけましだ finds one point of comfort in a bad situation: けがをしなかっただけましだ "at least nobody got hurt". まし means "less bad". It is resigned rather than cheerful. だけいい is close but less idiomatic.',
    functions: ['evaluate', 'compare'],
    examples: [
      ex('給料は 安いが、仕事が ある だけ ましだ。', 'The pay is low, but at least I have a job.', 'きゅうりょうは やすいが、しごとが ある だけ ましだ。'),
      ex('財布は 盗まれたが、けがを しなかった だけ ましだ。', 'My wallet was stolen, but at least I wasn’t hurt.', 'さいふは ぬすまれたが、けがを しなかった だけ ましだ。'),
    ],
  },
  'n2m-g-45eb23': {
    meaning: 'no doubt ~; must be ~ (formal)',
    structure: 'Plain form（N／な-adj directly）+ に 相違（そうい）ない',
    explanation:
      'に相違ない is a formal, written に違いない: a firm conviction based on reasoning. 犯人は内部の人間に相違ない. In forms and statements, 相違ありません means "(the above) is correct". It expresses certainty, not negation.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('犯人は 内部の 人間に 相違ない。', 'The culprit must be someone on the inside.', 'はんにんは ないぶの にんげんに そういない。'),
      ex('上記の 内容に 相違 ありません。', 'I confirm the above is correct.', 'じょうきの ないように そうい ありません。'),
    ],
  },
  'n2m-g-6f214e': {
    meaning: 'after (much) ~; in the end, after ~',
    structure: 'V-た／N の + 末（すえ）（に）',
    explanation:
      '末（に） says a result came at the end of a long or difficult process: 悩んだ末に決めた "after agonising, I decided". The result can be good or bad. あげく is similar but usually leads to an unwelcome outcome.',
    functions: ['result', 'finish'],
    examples: [
      ex('長い 議論の 末、計画は 中止に なった。', 'After a long debate, the plan was cancelled.', 'ながい ぎろんの すえ、けいかくは ちゅうしに なった。'),
      ex('何か月も 悩んだ 末に、留学を 決めた。', 'After months of agonising, I decided to study abroad.', 'なんかげつも なやんだ すえに、りゅうがくを きめた。'),
    ],
  },
  'n2m-g-d277bb': {
    meaning: 'due to ~ (notices); per ~',
    structure: 'N + に つき',
    explanation:
      'につき has two uses. In notices it gives a reason: 工事中につき立入禁止 "no entry due to construction". With a unit it means "per": 一人につき千円. It is formal; について ("about") is a different pattern.',
    functions: ['cause-reason', 'ratio'],
    examples: [
      ex('工事中に つき、立ち入り禁止。', 'No entry: construction in progress.', 'こうじちゅうに つき、たちいりきんし。'),
      ex('参加費は 一人に つき 千円です。', 'The fee is 1,000 yen per person.', 'さんかひは ひとりに つき せんえんです。'),
    ],
  },
  'n2m-g-4225c9': {
    meaning: 'although; while; despite ~',
    structure: 'V-ます stem／A-い／な-adj／N + ながら（も）',
    explanation:
      'Concessive ながら(も) links two facts that seem to clash: 狭いながらも楽しい我が家 "small but happy home". The subject is the same in both parts. Fixed phrases include 残念ながら and 失礼ながら. つつも is the written equivalent; のに adds more surprise or complaint.',
    functions: ['concessions'],
    examples: [
      ex('狭いながらも、楽しい 我が家だ。', 'It is small, but it is our happy home.', 'せまいながらも、たのしい わがやだ。'),
      ex('彼は 事情を 知って いながら、何も 言わなかった。', 'Although he knew the situation, he said nothing.', 'かれは じじょうを しって いながら、なにも いわなかった。'),
    ],
  },
  'n2m-g-34fb4b': {
    meaning: 'to one’s (surprise, regret, etc.); what is (surprising) is ~',
    structure: 'A-い／な-adj な／V-た + ことに、+ clause',
    explanation:
      'ことに puts the speaker’s emotional reaction first: 驚いたことに "to my surprise", 残念なことに "unfortunately". The words before it are emotion words. It is more written than 驚いたのは〜だ and cannot take a request after it.',
    functions: ['emphasize', 'feel'],
    examples: [
      ex('驚いた ことに、彼は 一人で 全部 作ったそうだ。', 'To my surprise, he apparently made it all by himself.', 'おどろいた ことに、かれは ひとりで ぜんぶ つくったそうだ。'),
      ex('残念な ことに、雨で 試合は 中止に なった。', 'Unfortunately, the match was cancelled because of rain.', 'ざんねんな ことに、あめで しあいは ちゅうしに なった。'),
    ],
  },
  'n2m-g-454367': {
    meaning: "it's not as if ~; it doesn't mean ~",
    structure: '何（なに）も + clause + わけでは ない／必要は ない',
    explanation:
      '何も〜わけではない softens a misunderstanding: 何もあなたを責めているわけではない "I’m not blaming you or anything". 何も here does not mean "nothing"; it strengthens the denial. 何も〜必要はない / 何も〜なくても means "there is no need to go so far as ~".',
    functions: ['emphasize-negative'],
    examples: [
      ex('何も あなたを 責めて いる わけでは ない。', "It's not as if I'm blaming you.", 'なにも あなたを せめて いる わけでは ない。'),
      ex('何も 今日中に 全部 終わらせる 必要は ない。', "There's no need to finish it all today.", 'なにも きょうじゅうに ぜんぶ おわらせる ひつようは ない。'),
    ],
  },
  'n2m-g-d5adb0': {
    meaning: 'only now ~ (but not in the past)',
    structure: '今（いま）でこそ + clause、（昔は）+ clause',
    explanation:
      '今でこそ says something is true now, and sets up a contrast with how it used to be: 今でこそ有名だが、昔は無名だった. The second half, usually with が or けれど, describes the harder past. It often introduces a success story or a memory that is funny in hindsight.',
    functions: ['contrast', 'past-state'],
    examples: [
      ex('今でこそ 有名だが、昔は 誰も 彼を 知らなかった。', 'He is famous now, but back then no one knew him.', 'いまでこそ ゆうめいだが、むかしは だれも かれを しらなかった。'),
      ex('今でこそ 笑い話だが、当時は 本当に 困った。', 'It is a funny story now, but at the time I was really stuck.', 'いまでこそ わらいばなしだが、とうじは ほんとうに こまった。'),
    ],
  },
  'n2m-g-77449a': {
    meaning: "can't just go on ~ing (there are other things to do)",
    structure: 'V-て + ばかりも いられない',
    explanation:
      'てばかりもいられない says one cannot afford to keep doing only one thing, since other matters also need attention: 喜んでばかりもいられない "we can’t just celebrate". The も makes it softer and more reflective than てばかりはいられない. It is often followed by the other task.',
    functions: ['limit', 'necessary-obligation'],
    examples: [
      ex('合格は うれしいが、喜んで ばかりも いられない。', "I'm glad I passed, but I can't just celebrate.", 'ごうかくは うれしいが、よろこんで ばかりも いられない。'),
      ex('休みだからと いって、寝て ばかりも いられない。', "It may be a holiday, but I can't spend it all asleep.", 'やすみだからと いって、ねて ばかりも いられない。'),
    ],
  },
  'n2m-g-7ee803': {
    meaning: 'must not ~; is not permitted (formal, old-fashioned)',
    structure: 'V-dict + ことは ならない（ならぬ）',
    explanation:
      'ことはならない is a stern, old-fashioned prohibition, heard from authority figures and in period dramas: 外に出ることはならぬ. Everyday speech uses てはいけない, and rules use てはならない. ならぬ is the classical form of ならない.',
    functions: ['ban'],
    examples: [
      ex('許可なく この 部屋に 入る ことは ならない。', 'No one may enter this room without permission.', 'きょかなく この へやに はいる ことは ならない。'),
      ex('殿は、城の 外へ 出る ことは ならぬと 仰せられた。', 'His lordship decreed that no one was to leave the castle.', 'とのは、しろの そとへ でる ことは ならぬと おおせられた。'),
    ],
  },
  'n2m-g-916c97': {
    meaning: "wasn't it (the case) that ~? (reproach, reminder)",
    structure: 'Plain form（N／な-adj + な）+ のでは なかったか',
    explanation:
      'のではなかったか recalls something said or agreed earlier and implies it is being ignored: 早く帰ると言ったのではなかったか "didn’t you say you’d come home early?". In essays it asks the reader to reconsider a principle. It is more formal and pointed than んじゃなかった？',
    functions: ['criticize', 'confirm'],
    examples: [
      ex('今日は 早く 帰ると 言ったのでは なかったか。', "Didn't you say you'd be home early today?", 'きょうは はやく かえると いったのでは なかったか。'),
      ex('平和こそが 我々の 目標では なかったか。', 'Was peace not our goal above all?', 'へいわこそが われわれの もくひょうでは なかったか。'),
    ],
  },
  'n2m-g-26f7e6': {
    meaning: 'no wonder ~; that explains it',
    structure: 'どうりで + clause（わけだ／と 思った）',
    explanation:
      'どうりで reacts to a newly learned reason that explains something already noticed: 窓が開いていた。どうりで寒いわけだ. It often ends with わけだ or と思った. なるほど shows understanding in general; どうりで specifically links a cause to an earlier puzzle.',
    functions: ['of-course', 'as-expected'],
    examples: [
      ex('窓が 開いて いたのか。どうりで 寒い わけだ。', 'The window was open? No wonder it’s cold.', 'まどが あいて いたのか。どうりで さむい わけだ。'),
      ex('彼は プロの 歌手だったのか。どうりで うまいと 思った。', 'He was a professional singer? That explains why he was so good.', 'かれは ぷろの かしゅだったのか。どうりで うまいと おもった。'),
    ],
  },
  'n2m-g-933df4': {
    meaning: 'worth doing; the reward of ~ing (やりがい, 生きがい)',
    structure: 'V-ます stem + がい（甲斐）（が ある）',
    explanation:
      'Attached to a verb stem, がい names the worth or satisfaction that comes from doing something: やりがい "rewarding work", 生きがい "something to live for", 教えがいがある "worth teaching". The standalone 甲斐がある looks back at an effort already made and says it paid off. The compound form describes a lasting quality of the activity itself.',
    functions: ['value'],
    examples: [
      ex('この 仕事は 大変だが、やりがいが ある。', 'This job is hard, but it is rewarding.', 'この しごとは たいへんだが、やりがいが ある。'),
      ex('孫の 成長を 見るのが、祖母の 生きがいだ。', 'Watching her grandchildren grow up is what my grandmother lives for.', 'まごの せいちょうを みるのが、そぼの いきがいだ。'),
      ex('あの 生徒は 何でも すぐ 覚えるので、教えがいが ある。', 'That student picks everything up quickly, so he is a joy to teach.', 'あの せいとは なんでも すぐ おぼえるので、おしえがいが ある。'),
    ],
  },
  'n2m-g-8cb832': {
    meaning: 'setting aside ~; never mind ~',
    structure: 'N + は とにかく（と して）',
    explanation:
      'はとにかく puts one point aside to focus on a more important one: 味はとにかく、量は多い "never mind the taste, there is plenty". It is interchangeable with はともかく, which is slightly more common in writing. は別として is more neutral and simply excludes the item.',
    functions: ['invariant', 'exception'],
    examples: [
      ex('味は とにかく、量は 多い。', "Never mind the taste, there's plenty of it.", 'あじは とにかく、りょうは おおい。'),
      ex('費用の 問題は とにかく と して、まず 計画を 立てよう。', "Setting the cost aside for now, let's make a plan first.", 'ひようの もんだいは とにかく と して、まず けいかくを たてよう。'),
    ],
  },
  'n2m-g-8ff0bc': {
    meaning: 'terrible; outrageous; unexpected (and bad)',
    structure: 'とんだ + N（こと・目・勘違い など）',
    explanation:
      'とんだ is a prenominal adjective for something unexpectedly bad or absurd: とんだ目に遭った "I had an awful time", とんだ勘違い "a ridiculous misunderstanding". It only comes before a noun. とんでもない covers similar ground but can also stand alone, as in the modest reply "not at all!".',
    functions: ['surprise', 'unexpected'],
    examples: [
      ex('旅行先で 財布を なくして、とんだ 目に 遭った。', 'I lost my wallet on the trip and had an awful time of it.', 'りょこうさきで さいふを なくして、とんだ めに あった。'),
      ex('彼を 犯人だと 思うなんて、とんだ 勘違いだった。', 'Thinking he was the culprit was a ridiculous mistake.', 'かれを はんにんだと おもうなんて、とんだ かんちがいだった。'),
    ],
  },
  'n2m-g-2c23bc': {
    meaning: 'before long; one of these days (you will see)',
    structure: '今（いま）に + V（prediction, warning）',
    explanation:
      '今に predicts that something will surely happen before long, often as a warning or a vow: 今に後悔するよ "you’ll regret it one day". 今に見ていろ means "just you wait". やがて narrates a change calmly; 今に carries the speaker’s conviction or emotion.',
    functions: ['future-time', 'warning'],
    examples: [
      ex('そんな ことを して いると、今に 後悔するよ。', "Keep doing that and you'll regret it one of these days.", 'そんな ことを して いると、いまに こうかいするよ。'),
      ex('今に 見て いろ、必ず 勝って みせる。', "Just you wait, I'll beat you for sure.", 'いまに みて いろ、かならず かって みせる。'),
    ],
  },
  'n2m-g-d2f9f7': {
    meaning: 'nothing to lose (if it fails, one is no worse off)',
    structure: 'V-て（も）／N で + もともとだ（だめで もともと）',
    explanation:
      'てもともとだ says that failing would only put you back where you started, so it is worth trying: 断られてもともとだ "if they say no, I have lost nothing". だめでもともと, shortened to ダメ元, is the common set phrase. It encourages a bold attempt rather than expressing resignation.',
    functions: ['concessions', 'evaluate'],
    examples: [
      ex('だめで もともとだ。思い切って 告白しよう。', "I've got nothing to lose. I'm going to tell her how I feel.", 'だめで もともとだ。おもいきって こくはくしよう。'),
      ex('断られて もともとだから、一度 頼んで みよう。', "We lose nothing if they refuse, so let's ask once.", 'ことわられて もともとだから、いちど たのんで みよう。'),
    ],
  },
  'n2m-g-fc7549': {
    meaning: 'in the first place; the very (cause, beginning)',
    structure: 'そもそも + clause ／ そもそもの + N（原因・始まり など）',
    explanation:
      'そもそも goes back to the root of a matter: そもそも君が約束を破ったのが悪い "you broke the promise in the first place". そもそもの原因 is "the original cause". In conversation it often carries a note of blame; 最初に is purely about order in time.',
    functions: ['how-to-say-the-first', 'cause-reason'],
    examples: [
      ex('事故の そもそもの 原因は、確認不足だった。', 'The root cause of the accident was a lack of checking.', 'じこの そもそもの げんいんは、かくにんぶそくだった。'),
      ex('そもそも、君が 約束を 守らなかったのが 悪い。', 'It was your fault in the first place for not keeping your promise.', 'そもそも、きみが やくそくを まもらなかったのが わるい。'),
    ],
  },
  'n2m-g-c975c0': {
    meaning: 'not just ~ alone (but more widely)',
    structure: 'ひとり + N + だけで なく（のみならず）／ ひとり + N + だけの 問題では ない',
    explanation:
      'ひとり before a noun means "solely": ひとり日本だけでなく "not Japan alone". It widens a problem from one party to society or the world. It is formal and written; plain だけでなく lacks the sense of scale.',
    functions: ['add', 'limit'],
    examples: [
      ex('これは ひとり 日本だけで なく、世界 全体の 問題だ。', 'This is a problem not for Japan alone but for the whole world.', 'これは ひとり にほんだけで なく、せかい ぜんたいの もんだいだ。'),
      ex('環境保護は、ひとり 政府だけの 責任では ない。', 'Protecting the environment is not the government’s responsibility alone.', 'かんきょうほごは、ひとり せいふだけの せきにんでは ない。'),
    ],
  },
  'n2m-g-ae4a18': {
    meaning: 'except in the case of ~',
    structure: 'N の／V-dict + 場合（ばあい）を 除いて（のぞいて）',
    explanation:
      '場合を除いて sets out an exception to a rule, as in notices and regulations: 緊急の場合を除いて使用禁止. It is formal. 以外 excludes an item; 場合を除いて excludes a situation.',
    functions: ['exception'],
    examples: [
      ex('緊急の 場合を 除いて、この 扉は 使わないで ください。', 'Please do not use this door except in an emergency.', 'きんきゅうの ばあいを のぞいて、この とびらは つかわないで ください。'),
      ex('雨の 場合を 除いて、毎朝 散歩して いる。', 'I go for a walk every morning unless it rains.', 'あめの ばあいを のぞいて、まいあさ さんぽして いる。'),
    ],
  },
  'n2m-g-83b546': {
    meaning: 'depending on how things turn out; depending on the circumstances',
    structure: '事（こと）と 次第（しだい）に よっては + clause',
    explanation:
      '事と次第によっては means "depending on circumstances", and usually hints at a serious step the speaker is prepared to take: 事と次第によっては契約を打ち切る. It sounds weighty, sometimes threatening. 場合によっては is the neutral everyday equivalent.',
    functions: ['standard', 'condition'],
    examples: [
      ex('事と 次第に よっては、契約を 打ち切る ことも ある。', 'Depending on how things go, we may terminate the contract.', 'ことと しだいに よっては、けいやくを うちきる ことも ある。'),
      ex('事と 次第に よっては、私も 黙って いない。', 'Depending on what happens, I will not stay silent either.', 'ことと しだいに よっては、わたしも だまって いない。'),
    ],
  },
  'n2m-g-283e49': {
    meaning: 'could you not ~? would you be so kind as to ~? (formal)',
    structure: 'V-て + もらえまいか（いただけまいか）',
    explanation:
      'てもらえまいか is a formal, somewhat old-fashioned request built on the negative volitional まい: "could you not do this for me?". It sounds earnest and a little stiff, typical of older speakers or written dialogue. てもらえないだろうか is the modern equivalent, and いただけまいか is humbler.',
    functions: ['request'],
    examples: [
      ex('少し 時間を 貸して もらえまいか。', 'Could you spare me a little of your time?', 'すこし じかんを かして もらえまいか。'),
      ex('この 件は、しばらく 内密に して もらえまいか。', 'Would you keep this matter confidential for a while?', 'この けんは、しばらく ないみつに して もらえまいか。'),
    ],
  },
  'n2m-g-2ba291': {
    meaning: 'facing (onto) ~',
    structure: 'N（海・通り など）+ に 面して（めんして）／ に 面した + N',
    explanation:
      'に面する describes which way a building or room faces: 海に面したホテル "a hotel facing the sea". It is used for physical frontage; 向かう describes motion toward. Figuratively, 危機に直面する "face a crisis" uses the related 直面.',
    functions: ['place', 'direction'],
    examples: [
      ex('海に 面した ホテルに 泊まった。', 'We stayed at a hotel facing the sea.', 'うみに めんした ほてるに とまった。'),
      ex('その 店は 大通りに 面して いる。', 'The shop faces onto the main street.', 'その みせは おおどおりに めんして いる。'),
    ],
  },
  'n2m-g-a1bd9c': {
    meaning: 'never again',
    structure: '二度（にど）と + V-ない',
    explanation:
      '二度と〜ない vows or declares that something will not happen again: あんな店には二度と行かない. It must go with a negative. もう〜ない simply says "no more"; 二度と is emphatic and emotional.',
    functions: ['negative', 'determination-decision'],
    examples: [
      ex('あんな 店には 二度と 行かない。', 'I am never going to that shop again.', 'あんな みせには にどと いかない。'),
      ex('二度と こんな 失敗は しないと 誓った。', 'I swore never to make such a mistake again.', 'にどと こんな しっぱいは しないと ちかった。'),
    ],
  },
  'n2m-g-a0f289': {
    meaning: 'thinking it would do as / for ~ (a gift, a purpose)',
    structure: 'N（お土産・お祝い など）+ に と 思って',
    explanation:
      'Nにと思って explains the intention behind giving or preparing something: お土産にと思って買った "I bought it as a souvenir for you". The と思って is a modest way to present the gift. ために is a plain statement of purpose without that softness.',
    functions: ['purpose-goal', 'give'],
    examples: [
      ex('これ、お土産にと 思って 買って きました。', 'I bought this for you as a little souvenir.', 'これ、おみやげにと おもって かって きました。'),
      ex('引っ越し祝いにと 思って、観葉植物を 贈った。', 'I sent a house plant as a housewarming gift.', 'ひっこしいわいにと おもって、かんようしょくぶつを おくった。'),
    ],
  },
  'n2m-g-b74095': {
    meaning: 'carelessly; rashly (if one ~s clumsily)',
    structure: '下手（へた）に + V（と／ば + bad result）',
    explanation:
      '下手に warns against acting without enough skill or thought: 下手に動くとかえって危ない "moving rashly would be more dangerous". It usually leads to a warning or a ほうがいい. 下手をすると instead means "if things go badly".',
    functions: ['warning', 'describe'],
    examples: [
      ex('下手に 動くと、かえって 危ない。', 'Moving carelessly would only make it more dangerous.', 'へたに うごくと、かえって あぶない。'),
      ex('事情を 知らないなら、下手に 口を 出さない ほうが いい。', "If you don't know the situation, you'd better not butt in.", 'じじょうを しらないなら、へたに くちを ださない ほうが いい。'),
    ],
  },
  'n2m-g-8cc040': {
    meaning: 'and yet; despite that (reproachful)',
    structure: 'Sentence。それを + clause（unexpected, ungrateful reaction）',
    explanation:
      'As a conjunction, それを picks up a kindness or effort just described and sets against it someone’s disappointing response: 何度も注意した。それを彼は聞かなかった. It is literary and reproachful. それなのに is the everyday equivalent.',
    functions: ['concessions', 'criticize'],
    examples: [
      ex('何度も 注意した。それを 彼は まったく 聞かなかった。', 'I warned him again and again, and yet he paid no attention at all.', 'なんども ちゅういした。それを かれは まったく きかなかった。'),
      ex('母は 心配して 電話を くれた。それを 私は 面倒がって 切って しまった。', 'My mother called out of worry, and I hung up because I could not be bothered.', 'ははは しんぱいして でんわを くれた。それを わたしは めんどうがって きって しまった。'),
    ],
  },
  'n2m-g-eb6ef4': {
    meaning: 'there is no way ~; it stands to reason that ~ cannot',
    structure: 'V-dict + 道理（どうり）が ない',
    explanation:
      '道理がない says something is impossible because it goes against reason: 練習もしないで勝てる道理がない. It is more literary than はずがない and わけがない, which carry the same meaning in everyday speech. 道理で, written どうりで, is the related "no wonder".',
    functions: ['negative', 'judge'],
    examples: [
      ex('練習も しないで 勝てる 道理が ない。', "There's no way you can win without practising.", 'れんしゅうも しないで かてる どうりが ない。'),
      ex('新人の 彼が そんな 事情を 知って いる 道理が ない。', 'A newcomer like him cannot possibly know about that.', 'しんじんの かれが そんな じじょうを しって いる どうりが ない。'),
    ],
  },
  'n2m-g-ed1654': {
    meaning: 'for (given) that, ~ (surprisingly)',
    structure: 'Sentence。それに しては + unexpected evaluation',
    explanation:
      'それにしては compares a result with what the previous fact would lead you to expect: 十年住んでいる。それにしては日本語が下手だ. The evaluation can be negative or positive. それにしても means "even so, all the same" and does not compare with an expectation.',
    functions: ['unexpected-outcome', 'contrast'],
    examples: [
      ex('十年 住んで いると 言うが、それに しては 日本語が 下手だ。', 'He says he has lived here ten years, but his Japanese is poor for that.', 'じゅうねん すんで いると いうが、それに しては にほんごが へただ。'),
      ex('高級店だと 聞いて いたが、それに しては 安かった。', 'I had heard it was an upmarket place, but it was cheap considering.', 'こうきゅうてんだと きいて いたが、それに しては やすかった。'),
    ],
  },
  'n2m-g-d1ade8': {
    meaning: 'cannot (say) across the board; not necessarily in all cases',
    structure: '一概に（いちがいに）+ は + 言えない／決められない',
    explanation:
      '一概に〜ない warns against a sweeping generalisation: 一概には言えない "you can’t make a blanket statement". It goes with verbs of judging or saying. 必ずしも〜ない is similar but can be used with any predicate.',
    functions: ['negative', 'judge'],
    examples: [
      ex('若者が 本を 読まないとは、一概には 言えない。', "You can't simply say that young people don't read.", 'わかものが ほんを よまないとは、いちがいには いえない。'),
      ex('どちらが 正しいか、一概に 決める ことは できない。', "It's impossible to say across the board which one is right.", 'どちらが ただしいか、いちがいに きめる ことは できない。'),
    ],
  },
  'n2m-g-974ad0': {
    meaning: 'can only be called ~; there is no other word for it than ~',
    structure: 'N／A + と いう ほか（は）ない',
    explanation:
      'というほかはない gives a judgement the speaker feels is the only possible description: 無謀というほかはない "it can only be called reckless". It is formal and emphatic. Without という, V-dict + ほかない means "have no choice but to ~".',
    functions: ['judge', 'evaluate'],
    examples: [
      ex('一人で 冬山に 登るなんて、無謀と いう ほかは ない。', 'Climbing a winter mountain alone can only be called reckless.', 'ひとりで ふゆやまに のぼるなんて、むぼうと いう ほかは ない。'),
      ex('彼の 回復は、奇跡と いう ほか ない。', 'His recovery is nothing short of a miracle.', 'かれの かいふくは、きせきと いう ほか ない。'),
    ],
  },
  'n2m-g-1f3454': {
    meaning: 'more than ~; beyond ~; the above (以上の)',
    structure: 'N（予想・期待 など）+ 以上の + N ／ 以上の + N（前述）',
    explanation:
      'After a noun, 以上の means "exceeding": 予想以上の人 "more people than expected". Standing alone, 以上の refers back to what was just said: 以上の理由から "for the reasons above". With numbers, 以上 includes the number itself: 二十歳以上 is twenty and over.',
    functions: ['amount', 'compare'],
    examples: [
      ex('予想 以上の 人が 集まった。', 'More people gathered than we had expected.', 'よそう いじょうの ひとが あつまった。'),
      ex('以上の 理由から、この 案に 反対します。', 'For the reasons above, I oppose this proposal.', 'いじょうの りゆうから、この あんに はんたいします。'),
    ],
  },
  'n2m-g-7dcbfd': {
    meaning: 'probably ~ (literary); whether ~ or ~ (かろうが)',
    structure: 'A-い stem + かろう ／ A1-かろうが A2-かろうが',
    explanation:
      'かろう is the old volitional form of い-adjectives and expresses conjecture: さぞ寒かろう "it must be terribly cold". Today it survives in writing, set phrases (よかろう) and the concessive かろうが〜かろうが "whether it is ~ or ~". In speech, 寒いだろう is normal.',
    functions: ['speculation'],
    examples: [
      ex('山の 上は さぞ 寒かろう。', 'It must be terribly cold up on the mountain.', 'やまの うえは さぞ さむかろう。'),
      ex('高かろうが 安かろうが、必要な ものは 買う。', 'Whether it is expensive or cheap, I buy what I need.', 'たかかろうが やすかろうが、ひつような ものは かう。'),
    ],
  },
  'n2m-g-b486b9': {
    meaning: 'judging from ~; from the standpoint of ~',
    structure: 'N + から 見て（みて）／ から 見ても',
    explanation:
      'から見て is the connective form of から見ると, used mid-sentence with evidence that leads to an inference: 表情から見て、失敗したらしい. から見ても adds "even from": 誰から見ても明らかだ "obvious to anyone". からして can also mean "judging from", but more often "to begin with".',
    functions: ['perspective-way', 'judge'],
    examples: [
      ex('彼の 表情から 見て、試験は うまく いかなかった らしい。', 'Judging from his face, the exam did not go well.', 'かれの ひょうじょうから みて、しけんは うまく いかなかった らしい。'),
      ex('誰から 見ても、彼女の 実力は 明らかだ。', 'Her ability is obvious to anyone.', 'だれから みても、かのじょの じつりょくは あきらかだ。'),
    ],
  },
  'n2m-g-06c41d': {
    meaning: 'so ~ that one might think ~',
    structure: 'Plain form + か と 思う ほど（の + N）',
    explanation:
      'かと思うほど measures a degree by an exaggerated impression: 耳が壊れるかと思うほど大きな音 "a sound so loud I thought my ears would burst". It is vivid and descriptive. ほど alone gives the degree; かと思う adds that the speaker actually felt it.',
    functions: ['level', 'similarity-degree'],
    examples: [
      ex('耳が 壊れるかと 思う ほど、大きな 音だった。', 'The noise was so loud I thought my ears would burst.', 'みみが こわれるかと おもう ほど、おおきな おとだった。'),
      ex('夢かと 思う ほど、美しい 景色だった。', 'The view was so beautiful it seemed like a dream.', 'ゆめかと おもう ほど、うつくしい けしきだった。'),
    ],
  },
  'n2m-g-b3455b': {
    meaning: 'what with A and B; A and B and so on (messy listing)',
    structure: 'N1／A1 + やら + N2／A2 + やら',
    explanation:
      'AやらBやら lists a few items from a chaotic whole, often with the feeling of being overwhelmed: 準備やら仕事やらで忙しい. With adjectives it describes mixed emotions: 嬉しいやら恥ずかしいやら. とか is the neutral colloquial list; やら is more emotional.',
    functions: ['denote-by-example', 'listed'],
    examples: [
      ex('引っ越しの 準備やら 仕事やらで、毎日 忙しい。', 'What with preparing to move and work, I am busy every day.', 'ひっこしの じゅんびやら しごとやらで、まいにち いそがしい。'),
      ex('嬉しいやら 恥ずかしいやら、複雑な 気持ちだ。', 'I feel happy and embarrassed at the same time.', 'うれしいやら はずかしいやら、ふくざつな きもちだ。'),
    ],
  },
  'n2m-g-332c13': {
    meaning: 'impressive; considerable; (not) a big deal',
    structure: '大した（たいした）+ N（もの・こと）／ 大した + N + では ない',
    explanation:
      '大した praises something as remarkable: 大したものだ "that is quite something". In the negative it downplays: 大したことはない "it is nothing serious". It only comes before a noun. 大変な means "serious, awful" and does not carry the admiring sense.',
    functions: ['evaluate', 'level'],
    examples: [
      ex('一人で ここまで 作るとは、大した ものだ。', 'Building this much on your own is quite something.', 'ひとりで ここまで つくるとは、たいした ものだ。'),
      ex('けがは 大した ことは ないので、心配しないで ください。', "The injury is nothing serious, so please don't worry.", 'けがは たいした ことは ないので、しんぱいしないで ください。'),
    ],
  },
  'n2m-g-e3d237': {
    meaning: 'to tell the truth; in fact; actually',
    structure: '実（じつ）の ところ（は）+ clause',
    explanation:
      '実のところ introduces the real state of affairs behind appearances: 実のところ、まだ何も決まっていない. It is a little more formal and reflective than 実は, which is the usual way to confide something in speech. It does not mean "by the way" (ところで).',
    functions: ['emphasize', 'explain'],
    examples: [
      ex('実の ところ、まだ 何も 決まって いない。', 'To tell the truth, nothing has been decided yet.', 'じつの ところ、まだ なにも きまって いない。'),
      ex('実の ところ、この 仕事は あまり 好きでは ない。', "Actually, I don't much like this job.", 'じつの ところ、この しごとは あまり すきでは ない。'),
    ],
  },
  'n2m-g-add6ff': {
    meaning: 'cannot ~ without ~; ~ is unthinkable without ~',
    structure: 'N + 抜き（ぬき）に（は）+ V-potential ない ／ N + 抜きで',
    explanation:
      'N抜きには〜ない says something is impossible without N: 花火抜きには語れない "you can’t talk about it without the fireworks". It stresses that N is essential. N抜きで simply means "without N": 朝食抜きで.',
    functions: ['condition-requirement', 'negative'],
    examples: [
      ex('彼の 協力 抜きには、この 計画は 考えられない。', 'This plan is unthinkable without his cooperation.', 'かれの きょうりょく ぬきには、この けいかくは かんがえられない。'),
      ex('日本の 夏は、花火 抜きには 語れない。', "You can't talk about a Japanese summer without fireworks.", 'にほんの なつは、はなび ぬきには かたれない。'),
    ],
  },
  'n2m-g-d674c9': {
    meaning: 'if we take A as B; supposing that ~',
    structure: 'N1 を N2 と すれば ／ Plain form + と すれば（だと すれば）',
    explanation:
      'AをBとすれば sets an assumption to calculate or reason from: 一ドルを百五十円とすれば. Plain + (だ)とすれば supposes a report is true: 本当だとすれば大変だ. とすると is nearly identical; とすれば leans a bit more toward drawing a conclusion.',
    functions: ['condition-assumption'],
    examples: [
      ex('一ドルを 百五十円と すれば、千ドルは 十五万円だ。', 'If we take one dollar as 150 yen, a thousand dollars is 150,000 yen.', 'いちどるを ひゃくごじゅうえんと すれば、せんどるは じゅうごまんえんだ。'),
      ex('彼の 話が 本当だと すれば、大変な ことだ。', 'If what he says is true, it is a serious matter.', 'かれの はなしが ほんとうだと すれば、たいへんな ことだ。'),
    ],
  },
  'n2m-g-b73ba2': {
    meaning: 'as if I would ~!; there is no way ~ (strong denial)',
    structure: 'V-dict／A + もの か（もんか）',
    explanation:
      'ものか is a rhetorical question that rejects something outright: 二度と行くものか "as if I would ever go again!". It expresses the speaker’s strong resolve or emotion. もんか is the colloquial form, and ものですか is used mainly by women in older speech.',
    functions: ['emphasize-negative', 'determination-decision'],
    examples: [
      ex('あんな 店、二度と 行く ものか。', 'As if I would ever go to that shop again!', 'あんな みせ、にどと いく ものか。'),
      ex('誰が あんな 人に 頼む ものか。', "There's no way I'd ask someone like him for help.", 'だれが あんな ひとに たのむ ものか。'),
    ],
  },
  'n2m-g-0b9d13': {
    meaning: 'as one would like; as one wishes (often: not as one would like)',
    structure: '思う（おもう）ように + V（〜ない）',
    explanation:
      '思うように describes things going the way one wants, and most often appears with a negative: 練習が思うように進まない. It is about control over the result. 思ったとおり means "just as I expected" and is about prediction, not wishes.',
    functions: ['perspective-way', 'wish'],
    examples: [
      ex('雨の せいで、練習が 思うように 進まない。', "Because of the rain, practice isn't going as well as I'd like.", 'あめの せいで、れんしゅうが おもうように すすまない。'),
      ex('けがが 治って、やっと 思うように 走れる ように なった。', 'My injury has healed and I can finally run the way I want.', 'けがが なおって、やっと おもうように はしれる ように なった。'),
    ],
  },
  'n2m-g-67c06f': {
    meaning: 'as long as ~; as far as ~',
    structure: 'V-dict／V-て いる／A／N で ある + 限り（かぎり）',
    explanation:
      '限り sets a condition that holds for as long as a state continues: 元気な限り働きたい "I want to work as long as I am healthy". 私の知る限り means "as far as I know". ない限り is its negative, "unless". うちに is about doing something before a state ends, not about the state lasting.',
    functions: ['condition', 'range'],
    examples: [
      ex('体が 元気な 限り、働き続けたい。', 'As long as I am healthy, I want to keep working.', 'からだが げんきな かぎり、はたらきつづけたい。'),
      ex('私の 知る 限り、彼は 嘘を つく 人では ない。', 'As far as I know, he is not the kind of person who lies.', 'わたしの しる かぎり、かれは うそを つく ひとでは ない。'),
    ],
  },
  'n2m-g-547b60': {
    meaning: "far from ~; it's no time for ~",
    structure: 'N／V-dict + どころの 話（はなし）では ない',
    explanation:
      'どころの話ではない dismisses something as out of the question because a more pressing situation has arisen: 旅行どころの話ではない "a trip is out of the question". It is a longer, more emphatic どころではない.',
    functions: ['negative', 'extremes'],
    examples: [
      ex('仕事が 忙しくて、旅行 どころの 話では ない。', "I'm so busy at work that a trip is out of the question.", 'しごとが いそがしくて、りょこう どころの はなしでは ない。'),
      ex('熱が 出て、勉強 どころの 話では なかった。', 'I had a fever, so studying was the last thing on my mind.', 'ねつが でて、べんきょう どころの はなしでは なかった。'),
    ],
  },
  'n2m-g-821d2d': {
    meaning: 'it is presumed that ~; it is considered that ~ (formal)',
    structure: 'Plain form + もの と 考えられる',
    explanation:
      'ものと考えられる presents a cautious inference, typical of police reports, news and research: 犯人は窓から侵入したものと考えられる. The もの makes it more formal and impersonal than と考えられる. ものと考えられている instead reports an established general view.',
    functions: ['judge', 'speculation'],
    examples: [
      ex('火事の 原因は、たばこの 火の 不始末に よる ものと 考えられる。', 'The fire is thought to have been caused by a carelessly discarded cigarette.', 'かじの げんいんは、たばこの ひの ふしまつに よる ものと かんがえられる。'),
      ex('犯人は 窓から 侵入した ものと 考えられる。', 'The intruder is presumed to have got in through the window.', 'はんにんは まどから しんにゅうした ものと かんがえられる。'),
    ],
  },
  'n2m-g-2c8b32': {
    meaning: "isn't there some way to ~? (wish)",
    structure: 'V-potential ない + もの（だろう）か',
    explanation:
      'ないものだろうか expresses a wish that something could be done, as a question to oneself: もっと安くできないものだろうか. It is not a request but a hope, often with 何とか. ないものか is the shorter, more direct form.',
    functions: ['wish', 'speculation'],
    examples: [
      ex('もっと 安く 旅行できない もの だろうか。', "Isn't there some way we could travel more cheaply?", 'もっと やすく りょこうできない もの だろうか。'),
      ex('何とか 彼を 助けられない ものか。', 'Is there nothing we can do to help him?', 'なんとか かれを たすけられない ものか。'),
    ],
  },
  'n2m-g-d3106d': {
    meaning: 'I hear that ~; it is said that ~',
    structure: 'Plain form + と 聞く（聞いた・聞いて いる）',
    explanation:
      'と聞く reports information the speaker heard from others: 昔は海だったと聞く "I hear it used to be sea". The present と聞く is written and general; と聞いた refers to a specific occasion. そうだ (hearsay) is attached to the sentence itself and does not name the act of hearing.',
    functions: ['heard'],
    examples: [
      ex('あの 店の ラーメンは おいしいと 聞いた。', 'I heard the ramen at that place is good.', 'あの みせの らーめんは おいしいと きいた。'),
      ex('この 辺りは 昔、海だったと 聞く。', 'I understand this area used to be under the sea.', 'この あたりは むかし、うみだったと きく。'),
    ],
  },
  'n2m-g-f470bf': {
    meaning: 'admittedly ~, but ~; it may not be ~, but ~',
    structure: 'N／A-く／V-ます stem + こそ + ない・する + が',
    explanation:
      'こそ〜が concedes one point in order to stress another: 広くこそないが、日当たりがいい "it may not be spacious, but it gets good sun". The こそ highlights the conceded point. It is more literary than 確かに〜が.',
    functions: ['concessions', 'emphasize'],
    examples: [
      ex('この 部屋は 広く こそ ないが、日当たりが いい。', 'This room may not be spacious, but it gets plenty of sun.', 'この へやは ひろく こそ ないが、ひあたりが いい。'),
      ex('彼は 口数こそ 少ないが、頼りに なる 人だ。', "He may not say much, but he's someone you can rely on.", 'かれは くちかずこそ すくないが、たよりに なる ひとだ。'),
    ],
  },
  'n2m-g-4e1099': {
    meaning: 'I had assumed that ~ (but it was not so)',
    structure: 'Plain form + もの と 思って いた（が／のに）',
    explanation:
      'ものと思っていた states an assumption that turned out wrong: 彼も来るものと思っていた "I took it for granted he was coming too". It is often paired with てっきり and followed by が or のに. と思っていた can be neutral; ものと stresses that the speaker never doubted it.',
    functions: ['past-state', 'unexpected-outcome'],
    examples: [
      ex('彼も 来る ものと 思って いたが、来なかった。', 'I took it for granted that he was coming too, but he did not.', 'かれも くる ものと おもって いたが、こなかった。'),
      ex('てっきり 合格した ものと 思って いたのに、不合格だった。', 'I was sure I had passed, but I failed.', 'てっきり ごうかくした ものと おもって いたのに、ふごうかくだった。'),
    ],
  },
  'n2m-g-b79cd9': {
    meaning: 'to do something about ~; to manage somehow',
    structure: 'N を どうにか する ／ どうにか なる',
    explanation:
      'どうにかする means finding some way to deal with a problem: この部屋をどうにかしないと "I have to do something about this room". どうにかなる is the reassuring "it will work out somehow". なんとかする is nearly the same and a little more common.',
    functions: ['action-effort'],
    examples: [
      ex('この 散らかった 部屋を どうにか しないと。', 'I have to do something about this messy room.', 'この ちらかった へやを どうにか しないと。'),
      ex('お金の ことは、私が どうにか します。', "I'll find a way to sort out the money.", 'おかねの ことは、わたしが どうにか します。'),
    ],
  },
  'n2m-g-18426e': {
    meaning: 'rather than A, might as well B',
    structure: 'A（V-dict）+ より（は）、いっそ + B',
    explanation:
      'AよりいっそB rejects an unsatisfying half-measure A in favour of a drastic B: 中途半端にやるより、いっそやめたほうがいい. It combines the comparison より with the resolve of いっそ. Do not confuse it with より一層（いっそう） "even more", which intensifies.',
    functions: ['compare', 'decision'],
    examples: [
      ex('中途半端に やる より、いっそ やめた ほうが いい。', "Rather than doing it by halves, you'd be better off quitting altogether.", 'ちゅうとはんぱに やる より、いっそ やめた ほうが いい。'),
      ex('毎日 我慢する より、いっそ 本当の ことを 言って しまおう。', "Rather than putting up with it every day, I might as well tell the truth.", 'まいにち がまんする より、いっそ ほんとうの ことを いって しまおう。'),
    ],
  },
  'n2m-g-736648': {
    meaning: 'not at all; absolutely no ~',
    structure: '一切（いっさい）+ V-ない ／ 一切 + N なし',
    explanation:
      '一切〜ない is a firm, total denial, common in official statements and rules: この件とは一切関係ありません. It is stronger and more formal than 全然 or まったく. Without a negative, 一切 means "everything": 一切を任せる.',
    functions: ['negative', 'emphasize-negative'],
    examples: [
      ex('私は この 件と 一切 関係 ありません。', 'I have absolutely nothing to do with this matter.', 'わたしは この けんと いっさい かんけい ありません。'),
      ex('当店では 追加料金は 一切 いただきません。', 'We do not charge any extra fees whatsoever.', 'とうてんでは ついかりょうきんは いっさい いただきません。'),
    ],
  },
  'n2m-g-e0234d': {
    meaning: 'even at the best of times; already ~ (and on top of that)',
    structure: 'ただでさえ + A／V + のに（ところに）、+ added burden',
    explanation:
      'ただでさえ describes a situation that is already bad in normal conditions, before something makes it worse: ただでさえ忙しいのに、仕事が増えた. It is followed by のに or a clause adding the new burden. それでなくても is similar and more conversational.',
    functions: ['add', 'extreme-example'],
    examples: [
      ex('ただでさえ 忙しいのに、また 仕事が 増えた。', "I'm busy enough as it is, and now I have even more work.", 'ただでさえ いそがしいのに、また しごとが ふえた。'),
      ex('ただでさえ 狭い 部屋に、大きな ソファを 置いて しまった。', 'We squeezed a big sofa into a room that was already cramped.', 'ただでさえ せまい へやに、おおきな そふぁを おいて しまった。'),
    ],
  },
  'n2m-g-f1ff37': {
    meaning: 'do all that can (or should) be done',
    structure: 'V-dict（やる・できる）+ だけの ことは する',
    explanation:
      'だけのことはする promises to do everything within one’s power: できるだけのことはする "I will do all I can". The past だけのことはした accepts whatever the outcome. The similar だけのことはある is different: it praises something as living up to expectations, さすがプロだけのことはある.',
    functions: ['action-effort', 'limit'],
    examples: [
      ex('結果は ともかく、やる だけの ことは した。', 'Whatever the result, I did everything I could.', 'けっかは ともかく、やる だけの ことは した。'),
      ex('お世話に なった 人の ためなら、できる だけの ことは する つもりだ。', 'For someone who has helped me, I intend to do whatever I can.', 'おせわに なった ひとの ためなら、できる だけの ことは する つもりだ。'),
    ],
  },
  'n2m-g-90c29e': {
    meaning: 'to make (someone) do ~ (literary causative)',
    structure: 'N（person）+ を して + V-causative（させる・しめる）',
    explanation:
      'をして〜させる marks the person caused to act in a formal, literary causative: 聴衆をして涙を流させた "it moved the audience to tears". The causer is usually an event or work, not a person giving orders. 言わしめる is the classical causative often paired with it.',
    functions: ['forced'],
    examples: [
      ex('彼の 演説は、聴衆を して 涙を 流させた。', 'His speech moved the audience to tears.', 'かれの えんぜつは、ちょうしゅうを して なみだを ながさせた。'),
      ex('あの 厳しい 批評家を して 傑作と 言わしめた 作品だ。', 'It is a work that made even that harsh critic call it a masterpiece.', 'あの きびしい ひひょうかを して けっさくと いわしめた さくひんだ。'),
    ],
  },
  'n2m-g-bc851e': {
    meaning: "even if one tries to ~ (one can't)",
    structure: 'V-volitional + ったって（と したって）',
    explanation:
      'ようったって is a colloquial contraction of ようと言っても or ようとしても: "however much you try to ~, it is impossible". The main clause is negative or a rhetorical ものか. In careful speech, ようとしても is used instead.',
    functions: ['concessions', 'ability'],
    examples: [
      ex('忘れようったって、忘れられる ものか。', 'How could I forget, even if I tried?', 'わすれようったって、わすれられる ものか。'),
      ex('今から 急ごうったって、もう 間に合わないよ。', "Even if you try to hurry now, you won't make it.", 'いまから いそごうったって、もう まにあわないよ。'),
    ],
  },
  'n2m-g-76318b': {
    meaning: 'now that it has come to ~; at this point (too late)',
    structure: '今（いま）と なっては ／ Plain form + と なっては',
    explanation:
      'となっては says a situation has now been reached in which something is no longer possible: 今となってはどうすることもできない "at this point nothing can be done". It carries regret or resignation. となったら looks ahead to a possible situation; となっては describes one that has already arrived.',
    functions: ['case', 'regret'],
    examples: [
      ex('今と なっては、どうする ことも できない。', 'At this point, there is nothing we can do.', 'いまと なっては、どうする ことも できない。'),
      ex('ここまで 話が 進んだと なっては、もう 断れない。', "Now that things have gone this far, I can't say no.", 'ここまで はなしが すすんだと なっては、もう ことわれない。'),
    ],
  },
  'n2m-g-18416c': {
    meaning: 'it is generally believed that ~ (established view)',
    structure: 'Plain form + もの と 考えられて いる',
    explanation:
      'ものと考えられている reports a view held by experts or society at large, typical of history and science writing: 八世紀に建てられたものと考えられている. The ている form shows it is a standing consensus. ものと考えられる is the writer’s own cautious inference in the case at hand.',
    functions: ['judge', 'information-resource'],
    examples: [
      ex('この 寺は 八世紀に 建てられた ものと 考えられて いる。', 'This temple is believed to have been built in the eighth century.', 'この てらは はっせいきに たてられた ものと かんがえられて いる。'),
      ex('当時の 人々は、米を 主食と して いた ものと 考えられて いる。', 'People at that time are thought to have lived mainly on rice.', 'とうじの ひとびとは、こめを しゅしょくと して いた ものと かんがえられて いる。'),
    ],
  },
  'n2m-g-04e195': {
    meaning: 'no ~ whatsoever; not in the least',
    structure: '何（なん）らの + N + も + V-ない ／ 何ら + V-ない',
    explanation:
      '何らの〜も〜ない is a formal, written denial: 何らの根拠もない "without any basis whatsoever". 何ら〜ない works directly with a verb: 何ら問題はない. It belongs to official and argumentative prose; 何の〜もない is the everyday version.',
    functions: ['negative', 'emphasize-negative'],
    examples: [
      ex('彼の 主張には 何らの 根拠も ない。', 'His claim has no basis whatsoever.', 'かれの しゅちょうには なんらの こんきょも ない。'),
      ex('両者の 間に 何ら 関係は ない。', 'There is no connection at all between the two.', 'りょうしゃの あいだに なんら かんけいは ない。'),
    ],
  },
  'n2m-g-59e46d': {
    meaning: 'since ~ anyway, (then) ~',
    structure: 'どうせ + Plain form + のだから、+ suggestion／judgement',
    explanation:
      'どうせ〜のだから takes an unavoidable fact as the reason for a practical decision: どうせ捨てるのだから、洗わなくていい "we are throwing it away anyway, so no need to wash it". のだから presents the reason as obvious to both speakers. どうせ〜なら is similar but conditional.',
    functions: ['cause-reason', 'invariant'],
    examples: [
      ex('どうせ 捨てるのだから、きれいに 洗わなくても いい。', "We're throwing it out anyway, so there's no need to wash it properly.", 'どうせ すてるのだから、きれいに あらわなくても いい。'),
      ex('どうせ 同じ 道を 通るのだから、一緒に 行きましょう。', "Since we're taking the same road anyway, let's go together.", 'どうせ おなじ みちを とおるのだから、いっしょに いきましょう。'),
    ],
  },
  'n2m-g-9f76a7': {
    meaning: 'when it comes to ~ (skill); in terms of ~',
    structure: 'N + に かけたら（に かけては）',
    explanation:
      'にかけたら, and the more common にかけては, name the field in which someone excels, usually followed by "no one can beat": 料理にかけたら、母にかなう人はいない. It is used for abilities, not for general topics. については is neutral "regarding".',
    functions: ['story-topic', 'highest-level'],
    examples: [
      ex('料理に かけたら、母に かなう 人は いない。', 'When it comes to cooking, no one can match my mother.', 'りょうりに かけたら、ははに かなう ひとは いない。'),
      ex('足の 速さに かけては、弟が クラスで 一番だ。', 'When it comes to running fast, my little brother is the best in his class.', 'あしの はやさに かけては、おとうとが くらすで いちばんだ。'),
    ],
  },
  'n2m-g-ec8afc': {
    meaning: 'perhaps because (of) ~ (bad result)',
    structure: 'Plain form（N の／な-adj な）+ せいか',
    explanation:
      'せいか gives a probable cause for a negative result without being sure: 寝不足のせいか頭が痛い. It is softer than せいで, which blames outright. For a good result, おかげか is used; ためか is neutral and more formal.',
    functions: ['cause-reason', 'speculation'],
    examples: [
      ex('寝不足の せいか、頭が 痛い。', 'Maybe because I have not slept enough, I have a headache.', 'ねぶそくの せいか、あたまが いたい。'),
      ex('年の せいか、最近 疲れやすい。', 'Perhaps it’s my age, but I get tired easily these days.', 'としの せいか、さいきん つかれやすい。'),
    ],
  },
  'n2m-g-acb98f': {
    meaning: 'full of ~; covered with ~ (undesirable)',
    structure: 'N + だらけ（の N／に なる）',
    explanation:
      'だらけ says something is full of or covered in something unwelcome: 間違いだらけ "full of mistakes", 泥だらけ "covered in mud". まみれ is for liquids or dirt clinging to a surface (汗まみれ) and cannot be used with abstract things like mistakes. ばかり is neutral about quantity.',
    functions: ['amount'],
    examples: [
      ex('子供たちは 泥だらけに なって 遊んで いた。', 'The children were playing and got covered in mud.', 'こどもたちは どろだらけに なって あそんで いた。'),
      ex('この 作文は 間違いだらけだ。', 'This essay is full of mistakes.', 'この さくぶんは まちがいだらけだ。'),
    ],
  },
};

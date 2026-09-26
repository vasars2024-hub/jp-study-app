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
};

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
};

import type { GrammarPoint } from './types';

/**
 * HSK 2–4 starter additions — authored, not imported.
 *
 * `hsk.ts` and `hsk-extra.ts` give HSK1–4 about ninety study-ready patterns
 * (the 459-row import has no examples and never reaches "Ready to study").
 * These fill the everyday patterns an HSK 2–4 learner meets that neither
 * authored module covers: sequencing (先…再…), purpose (为了), the causative
 * 让, modality (应该 / 必须 / 一定 / 可能), and the discourse adverbs of HSK4
 * (却, 竟然, 到底, 其实, 终于).
 *
 * A second pass (the block at the end) adds forty HSK1–6 patterns learners
 * trip over: question forms (V不V, 怎么 vs 为什么), 再 vs 又, 或者 vs 还是,
 * 没有…那么 comparisons, and the HSK4–5 connectives (既然, 哪怕, 要不是,
 * 除非, 否则). Where the import holds the same pattern, the title matches
 * it exactly so dedupe replaces the hollow imported row with this one.
 *
 * Original explanations and example sentences written for this app, with
 * tone-marked pinyin. Same conventions as `hsk-extra.ts`: canonical taxonomy
 * `categories`, official bands only.
 */
export const HSK_STARTER: GrammarPoint[] = [
  // —— HSK2 ——
  {
    id: 'hsk2-rang',
    lang: 'zh',
    level: 'HSK2',
    title: '让 (causative)',
    meaning: 'to let / to make someone do something',
    structure: 'A + 让 + B + V',
    explanation:
      '让 makes B the doer of the second verb: A lets, asks or causes B to act. Negate with 不让 ("not allow"). 叫 works the same way in speech.',
    categories: ['request.ask', 'possibility.permission'],
    register: 'neutral',
    examples: [
      { jp: '妈妈让我早点儿回家。', reading: 'māma ràng wǒ zǎodiǎnr huí jiā', en: 'Mum told me to come home early.' },
      { jp: '老师不让我们用手机。', reading: 'lǎoshī bú ràng wǒmen yòng shǒujī', en: 'The teacher does not let us use our phones.' },
    ],
  },
  {
    id: 'hsk2-yinggai',
    lang: 'zh',
    level: 'HSK2',
    title: '应该',
    meaning: 'should, ought to',
    structure: '应该 + V',
    explanation:
      'Expresses what is right or expected. The negative 不应该 means "should not". On its own 应该 can also answer "probably": 他应该到了 (he should have arrived by now).',
    categories: ['obligation.necessity', 'request.advice'],
    register: 'neutral',
    examples: [
      { jp: '你应该多喝水。', reading: 'nǐ yīnggāi duō hē shuǐ', en: 'You should drink more water.' },
      { jp: '我们不应该迟到。', reading: 'wǒmen bù yīnggāi chídào', en: 'We should not be late.' },
    ],
  },
  {
    id: 'hsk2-keneng',
    lang: 'zh',
    level: 'HSK2',
    title: '可能',
    meaning: 'maybe, possibly',
    structure: '可能 + V / clause',
    explanation:
      'Marks a possibility. It usually stands before the verb or at the start of the clause. As a noun, 可能 means "possibility": 有可能.',
    categories: ['judgment.conjecture'],
    register: 'neutral',
    examples: [
      { jp: '明天可能会下雨。', reading: 'míngtiān kěnéng huì xià yǔ', en: 'It might rain tomorrow.' },
      { jp: '他可能不知道这件事。', reading: 'tā kěnéng bù zhīdào zhè jiàn shì', en: 'He probably does not know about this.' },
    ],
  },
  {
    id: 'hsk2-yiqian-yihou',
    lang: 'zh',
    level: 'HSK2',
    title: '…以前 / …以后',
    meaning: 'before … / after …',
    structure: 'time / event + 以前 / 以后',
    explanation:
      'Placed after a time word or a whole clause, not before it as in English: 吃饭以后 = after eating. On their own they mean "in the past" and "in the future".',
    categories: ['time.sequence', 'time.point'],
    register: 'neutral',
    examples: [
      { jp: '睡觉以前，我喜欢看书。', reading: 'shuìjiào yǐqián, wǒ xǐhuan kàn shū', en: 'Before going to sleep, I like to read.' },
      { jp: '下课以后我们去吃饭吧。', reading: 'xiàkè yǐhòu wǒmen qù chī fàn ba', en: "Let's go and eat after class." },
    ],
  },
  {
    id: 'hsk2-wang',
    lang: 'zh',
    level: 'HSK2',
    title: '往',
    meaning: 'towards (direction of movement)',
    structure: '往 + direction / place + V',
    explanation:
      'Gives the direction of a movement, typically in directions: 往前走, 往左拐. It comes before the verb.',
    categories: ['space.direction'],
    register: 'neutral',
    examples: [
      { jp: '一直往前走，然后往右拐。', reading: 'yìzhí wǎng qián zǒu, ránhòu wǎng yòu guǎi', en: 'Go straight ahead, then turn right.' },
      { jp: '这趟车往北京开。', reading: 'zhè tàng chē wǎng Běijīng kāi', en: 'This train is heading for Beijing.' },
    ],
  },

  // —— HSK3 ——
  {
    id: 'hsk3-xian-zai',
    lang: 'zh',
    level: 'HSK3',
    title: '先…再…',
    meaning: 'first …, then …',
    structure: '先 + V1，再 + V2',
    explanation:
      'Orders two actions, usually in the future or in instructions. 然后 can join in: 先…然后再…. For past events 先…然后… or 先…又… is more usual.',
    categories: ['time.sequence'],
    register: 'neutral',
    examples: [
      { jp: '你先洗手，再吃饭。', reading: 'nǐ xiān xǐ shǒu, zài chī fàn', en: 'Wash your hands first, then eat.' },
      { jp: '我们先看看，再决定。', reading: 'wǒmen xiān kànkan, zài juédìng', en: "Let's have a look first and then decide." },
    ],
  },
  {
    id: 'hsk3-weile',
    lang: 'zh',
    level: 'HSK3',
    title: '为了',
    meaning: 'in order to, for the sake of',
    structure: '为了 + purpose，+ action',
    explanation:
      'States the purpose, normally at the start of the sentence. Compare 因为 (because), which gives a cause rather than an aim.',
    categories: ['purpose.goal'],
    register: 'neutral',
    examples: [
      { jp: '为了学好中文，他每天练习。', reading: 'wèile xuéhǎo Zhōngwén, tā měitiān liànxí', en: 'To learn Chinese well, he practises every day.' },
      { jp: '为了健康，我不再喝可乐了。', reading: 'wèile jiànkāng, wǒ bú zài hē kělè le', en: 'For my health, I no longer drink cola.' },
    ],
  },
  {
    id: 'hsk3-yaoshi',
    lang: 'zh',
    level: 'HSK3',
    title: '要是…就…',
    meaning: 'if …, then …',
    structure: '要是 + condition，(subject) + 就 + result',
    explanation:
      'A spoken equivalent of 如果…就…. 的话 can close the condition: 要是你忙的话，….',
    categories: ['condition.hypothetical'],
    register: 'casual',
    examples: [
      { jp: '要是明天下雨，我们就不去了。', reading: 'yàoshi míngtiān xià yǔ, wǒmen jiù bú qù le', en: "If it rains tomorrow, we won't go." },
      { jp: '要是你累了，就休息一下。', reading: 'yàoshi nǐ lèi le, jiù xiūxi yíxià', en: 'If you are tired, take a rest.' },
    ],
  },
  {
    id: 'hsk3-yi-ye-bu',
    lang: 'zh',
    level: 'HSK3',
    title: '一 + M + 也/都 + 不/没',
    meaning: 'not a single …, not … at all',
    structure: '一 + measure word (+ N) + 也/都 + 不/没 + V',
    explanation:
      'Emphatic negation: "not even one". With nouns a measure word is needed (一个人也没来); with adjectives 一点儿 is used (一点儿也不冷).',
    categories: ['emphasis.negation', 'emphasis.emphasize'],
    register: 'neutral',
    examples: [
      { jp: '教室里一个人也没有。', reading: 'jiàoshì li yí ge rén yě méiyǒu', en: 'There is not a single person in the classroom.' },
      { jp: '今天一点儿也不冷。', reading: 'jīntiān yìdiǎnr yě bù lěng', en: 'It is not cold at all today.' },
    ],
  },
  {
    id: 'hsk3-haoxiang',
    lang: 'zh',
    level: 'HSK3',
    title: '好像',
    meaning: 'it seems, as if',
    structure: '好像 + clause / 好像…一样',
    explanation:
      'Signals an impression or a guess. With 一样 it makes a comparison: 他好像孩子一样 (he is like a child).',
    categories: ['judgment.conjecture', 'comparison.similarity'],
    register: 'neutral',
    examples: [
      { jp: '他好像生病了。', reading: 'tā hǎoxiàng shēngbìng le', en: 'He seems to be ill.' },
      { jp: '她高兴得好像孩子一样。', reading: 'tā gāoxìng de hǎoxiàng háizi yíyàng', en: 'She is as happy as a child.' },
    ],
  },
  {
    id: 'hsk3-bixu',
    lang: 'zh',
    level: 'HSK3',
    title: '必须',
    meaning: 'must, have to',
    structure: '必须 + V',
    explanation:
      'Strong obligation. Its negative is not 不必须 but 不必 or 不用 ("need not"); a prohibition is 不能 or 不许.',
    categories: ['obligation.necessity'],
    register: 'neutral',
    examples: [
      { jp: '我们必须在八点以前到。', reading: 'wǒmen bìxū zài bā diǎn yǐqián dào', en: 'We have to arrive before eight.' },
      { jp: '你不必担心。', reading: 'nǐ búbì dānxīn', en: 'You need not worry.' },
    ],
  },
  {
    id: 'hsk3-yiding',
    lang: 'zh',
    level: 'HSK3',
    title: '一定',
    meaning: 'certainly, definitely; must (guess)',
    structure: '一定 + V / 一定要 + V',
    explanation:
      'Expresses certainty or a confident guess (他一定很累). 一定要 is a strong wish or requirement: 你一定要来. 不一定 means "not necessarily".',
    categories: ['judgment.certainty'],
    register: 'neutral',
    examples: [
      { jp: '你一定要来参加我的生日会。', reading: 'nǐ yídìng yào lái cānjiā wǒ de shēngrì huì', en: 'You must come to my birthday party.' },
      { jp: '贵的东西不一定好。', reading: 'guì de dōngxi bù yídìng hǎo', en: 'Expensive things are not necessarily good.' },
    ],
  },
  {
    id: 'hsk3-gang',
    lang: 'zh',
    level: 'HSK3',
    title: '刚 / 刚才',
    meaning: 'just (now)',
    structure: '刚 + V (adverb) / 刚才 (time noun)',
    explanation:
      '刚 is an adverb before the verb: an action has only just happened (我刚到). 刚才 is a time word meaning "a moment ago"; it can start the sentence or stand before the subject, which 刚 cannot.',
    categories: ['time.immediate'],
    register: 'neutral',
    examples: [
      { jp: '我刚下飞机。', reading: 'wǒ gāng xià fēijī', en: 'I have just got off the plane.' },
      { jp: '刚才有人给你打电话了。', reading: 'gāngcái yǒu rén gěi nǐ dǎ diànhuà le', en: 'Someone called you a moment ago.' },
    ],
  },
  {
    id: 'hsk3-zhongyu',
    lang: 'zh',
    level: 'HSK3',
    title: '终于',
    meaning: 'finally, at last',
    structure: '终于 + V (+ 了)',
    explanation:
      'Marks a long-awaited result after effort or waiting, usually with 了.',
    categories: ['time.completion'],
    register: 'neutral',
    examples: [
      { jp: '我们终于到了。', reading: 'wǒmen zhōngyú dào le', en: 'We have finally arrived.' },
      { jp: '他终于找到了工作。', reading: 'tā zhōngyú zhǎodào le gōngzuò', en: 'He finally found a job.' },
    ],
  },
  {
    id: 'hsk3-qishi',
    lang: 'zh',
    level: 'HSK3',
    title: '其实',
    meaning: 'actually, in fact',
    structure: '其实 + clause',
    explanation:
      'Introduces the real situation, often correcting an assumption made just before.',
    categories: ['explanation.explain', 'contrast.unexpected'],
    register: 'neutral',
    examples: [
      { jp: '大家都以为他是老师，其实他是学生。', reading: 'dàjiā dōu yǐwéi tā shì lǎoshī, qíshí tā shì xuésheng', en: 'Everyone thought he was a teacher; actually he is a student.' },
      { jp: '这个问题其实不难。', reading: 'zhège wèntí qíshí bù nán', en: 'This question is actually not hard.' },
    ],
  },
  {
    id: 'hsk3-xiang',
    lang: 'zh',
    level: 'HSK3',
    title: '向',
    meaning: 'towards; to (a person)',
    structure: '向 + place / person + V',
    explanation:
      'Like 往 it gives a direction, and it also marks the person an action is aimed at: 向他学习 (learn from him), 向你道歉 (apologise to you).',
    categories: ['space.direction', 'method.communication'],
    register: 'neutral',
    examples: [
      { jp: '我们应该向他学习。', reading: 'wǒmen yīnggāi xiàng tā xuéxí', en: 'We should learn from him.' },
      { jp: '船向东开去。', reading: 'chuán xiàng dōng kāiqù', en: 'The boat sailed off to the east.' },
    ],
  },

  // —— HSK4 ——
  {
    id: 'hsk4-ji-you',
    lang: 'zh',
    level: 'HSK4',
    title: '既…又…',
    meaning: 'both … and …',
    structure: '既 + A + 又 + B',
    explanation:
      'Joins two qualities or actions of the same subject; slightly more formal than 又…又…. 既…也… is a common variant.',
    categories: ['examples.listing'],
    register: 'neutral',
    examples: [
      { jp: '这家饭馆既便宜又好吃。', reading: 'zhè jiā fànguǎn jì piányi yòu hǎochī', en: 'This restaurant is both cheap and tasty.' },
      { jp: '她既会唱歌，也会跳舞。', reading: 'tā jì huì chànggē, yě huì tiàowǔ', en: 'She can both sing and dance.' },
    ],
  },
  {
    id: 'hsk4-dui-laishuo',
    lang: 'zh',
    level: 'HSK4',
    title: '对…来说',
    meaning: 'for …, as far as … is concerned',
    structure: '对 + person + 来说，+ judgment',
    explanation:
      'Frames a judgment from someone’s point of view. It usually opens the sentence.',
    categories: ['method.perspective'],
    register: 'neutral',
    examples: [
      { jp: '对我来说，学汉字最难。', reading: 'duì wǒ lái shuō, xué Hànzì zuì nán', en: 'For me, learning characters is the hardest part.' },
      { jp: '对孩子来说，玩儿也很重要。', reading: 'duì háizi lái shuō, wánr yě hěn zhòngyào', en: 'For children, play is important too.' },
    ],
  },
  {
    id: 'hsk4-buguan',
    lang: 'zh',
    level: 'HSK4',
    title: '不管…都…',
    meaning: 'no matter …, regardless of …',
    structure: '不管 + question word / A还是B，(subject) + 都 + V',
    explanation:
      'The condition part contains a question word or an alternative, and the result holds in every case. 无论…都… is the more formal equivalent.',
    categories: ['condition.general', 'contrast.concession'],
    register: 'neutral',
    examples: [
      { jp: '不管多忙，他都每天跑步。', reading: 'bùguǎn duō máng, tā dōu měitiān pǎobù', en: 'No matter how busy he is, he runs every day.' },
      { jp: '不管你去不去，我都要去。', reading: 'bùguǎn nǐ qù bu qù, wǒ dōu yào qù', en: "Whether you go or not, I'm going." },
    ],
  },
  {
    id: 'hsk4-shenzhi',
    lang: 'zh',
    level: 'HSK4',
    title: '甚至',
    meaning: 'even (going as far as)',
    structure: '…，甚至 + (连) + extreme case',
    explanation:
      'Adds a more extreme example to what was said. Often paired with 连…都/也…: 他甚至连饭都忘了吃.',
    categories: ['degree.extreme', 'emphasis.emphasize'],
    register: 'neutral',
    examples: [
      { jp: '他工作太忙，甚至忘了吃饭。', reading: 'tā gōngzuò tài máng, shènzhì wàng le chī fàn', en: 'He is so busy with work that he even forgets to eat.' },
      { jp: '这首歌大人喜欢，甚至孩子也会唱。', reading: 'zhè shǒu gē dàrén xǐhuan, shènzhì háizi yě huì chàng', en: 'Adults love this song; even children can sing it.' },
    ],
  },
  {
    id: 'hsk4-suizhe',
    lang: 'zh',
    level: 'HSK4',
    title: '随着',
    meaning: 'along with, as … changes',
    structure: '随着 + change，+ result',
    explanation:
      'Links a gradual change to another change that follows from it. Typical of written and news style.',
    categories: ['comparison.proportion', 'state.change'],
    register: 'neutral',
    examples: [
      { jp: '随着经济的发展，人们的生活越来越好。', reading: 'suízhe jīngjì de fāzhǎn, rénmen de shēnghuó yuèláiyuè hǎo', en: 'As the economy develops, life keeps getting better.' },
      { jp: '随着年龄的增长，他变得更安静了。', reading: 'suízhe niánlíng de zēngzhǎng, tā biàn de gèng ānjìng le', en: 'As he got older, he became quieter.' },
    ],
  },
  {
    id: 'hsk4-anzhao',
    lang: 'zh',
    level: 'HSK4',
    title: '按照',
    meaning: 'according to, following',
    structure: '按照 + rule / plan + V',
    explanation:
      'Says what an action follows: a rule, a plan, an order. 按 alone is common in speech.',
    categories: ['method.means', 'obligation.rules'],
    register: 'neutral',
    examples: [
      { jp: '请按照说明书使用。', reading: 'qǐng ànzhào shuōmíngshū shǐyòng', en: 'Please use it according to the instructions.' },
      { jp: '我们按照计划出发了。', reading: 'wǒmen ànzhào jìhuà chūfā le', en: 'We set off according to plan.' },
    ],
  },
  {
    id: 'hsk4-budebu',
    lang: 'zh',
    level: 'HSK4',
    title: '不得不',
    meaning: 'have no choice but to',
    structure: '不得不 + V',
    explanation:
      'Stronger than 必须: the speaker would rather not, but circumstances force it.',
    categories: ['obligation.necessity'],
    register: 'neutral',
    examples: [
      { jp: '雨太大了，我们不得不取消比赛。', reading: 'yǔ tài dà le, wǒmen bùdébù qǔxiāo bǐsài', en: 'The rain was so heavy we had to cancel the match.' },
      { jp: '他病了，不得不请假。', reading: 'tā bìng le, bùdébù qǐngjià', en: 'He was ill and had to take leave.' },
    ],
  },
  {
    id: 'hsk4-zhihao',
    lang: 'zh',
    level: 'HSK4',
    title: '只好',
    meaning: 'can only, had to (as the only option)',
    structure: '(situation)，只好 + V',
    explanation:
      'The one remaining option after something went wrong; it reports resignation rather than obligation.',
    categories: ['obligation.necessity', 'cause.result'],
    register: 'neutral',
    examples: [
      { jp: '末班车走了，我只好打车回家。', reading: 'mòbānchē zǒu le, wǒ zhǐhǎo dǎchē huí jiā', en: 'The last bus had gone, so I had to take a taxi home.' },
      { jp: '商店关门了，我们只好明天再来。', reading: 'shāngdiàn guān mén le, wǒmen zhǐhǎo míngtiān zài lái', en: 'The shop was closed, so we will have to come back tomorrow.' },
    ],
  },
  {
    id: 'hsk4-jingran',
    lang: 'zh',
    level: 'HSK4',
    title: '竟然',
    meaning: 'unexpectedly, to one’s surprise',
    structure: 'subject + 竟然 + V',
    explanation:
      'Expresses surprise that something happened against expectation. 居然 is a close synonym.',
    categories: ['contrast.unexpected', 'emotion.surprise'],
    register: 'neutral',
    examples: [
      { jp: '他竟然忘了自己的生日。', reading: 'tā jìngrán wàng le zìjǐ de shēngrì', en: 'He actually forgot his own birthday.' },
      { jp: '这么难的题，你竟然做对了！', reading: 'zhème nán de tí, nǐ jìngrán zuòduì le', en: 'Such a hard question, and you got it right!' },
    ],
  },
  {
    id: 'hsk4-que',
    lang: 'zh',
    level: 'HSK4',
    title: '却',
    meaning: 'but, yet (adverb)',
    structure: 'clause 1，subject + 却 + V',
    explanation:
      'An adverb, so it stands after the subject of the second clause, never at the start of it. It marks a turn against expectation and can combine with 但是/可是.',
    categories: ['contrast.opposition', 'contrast.unexpected'],
    register: 'neutral',
    examples: [
      { jp: '他学了很久，却还是不会说。', reading: 'tā xué le hěn jiǔ, què háishi bú huì shuō', en: 'He studied for a long time, yet he still cannot speak it.' },
      { jp: '外面很冷，屋子里却很暖和。', reading: 'wàimiàn hěn lěng, wūzi li què hěn nuǎnhuo', en: 'It is cold outside, but warm inside.' },
    ],
  },
  {
    id: 'hsk4-daodi',
    lang: 'zh',
    level: 'HSK4',
    title: '到底',
    meaning: 'on earth, after all (in questions); in the end',
    structure: '到底 + question / 到底 + V',
    explanation:
      'In a question it presses for the real answer ("what on earth…?"); it cannot be used with 吗. In a statement it means "in the end / after all".',
    categories: ['emphasis.emphasize', 'explanation.conclusion'],
    register: 'neutral',
    examples: [
      { jp: '你到底想去哪儿？', reading: 'nǐ dàodǐ xiǎng qù nǎr', en: 'Where on earth do you want to go?' },
      { jp: '他到底还是来了。', reading: 'tā dàodǐ háishi lái le', en: 'He came after all.' },
    ],
  },
  {
    id: 'hsk4-qianwan',
    lang: 'zh',
    level: 'HSK4',
    title: '千万',
    meaning: 'be sure to / by no means',
    structure: '千万 + 要/别/不要 + V',
    explanation:
      'An urgent reminder, mostly in the negative: 千万别忘了 (whatever you do, don’t forget).',
    categories: ['request.advice', 'obligation.prohibition'],
    register: 'neutral',
    examples: [
      { jp: '你千万别告诉他。', reading: 'nǐ qiānwàn bié gàosu tā', en: 'Whatever you do, do not tell him.' },
      { jp: '路上千万要小心。', reading: 'lùshang qiānwàn yào xiǎoxīn', en: 'Be sure to take care on the way.' },
    ],
  },
  // —— Round 3: HSK1–6 patterns the authored modules still lacked ——
  {
    id: 'hsk1-a-bu-a',
    lang: 'zh',
    level: 'HSK1',
    title: 'V不V / A不A (affirmative-negative question)',
    meaning: 'yes-no question made by repeating the verb or adjective',
    structure: 'V / A + 不 + V / A (+ object)?',
    explanation:
      'Putting the positive and negative forms side by side asks a yes-no question without 吗: 你去不去? It sounds a little more direct than 吗. Do not add 吗 as well, and with 有 the negative is 没: 有没有.',
    categories: ['request.ask', 'judgment.certainty'],
    register: 'neutral',
    examples: [
      { jp: '你明天去不去？', reading: 'nǐ míngtiān qù bu qù', en: 'Are you going tomorrow or not?' },
      { jp: '这个菜好吃不好吃？', reading: 'zhège cài hǎochī bu hǎochī', en: 'Is this dish tasty?' },
      { jp: '你有没有时间？', reading: 'nǐ yǒu méiyǒu shíjiān', en: 'Do you have time?' },
    ],
  },
  {
    id: 'hsk1-zenme',
    lang: 'zh',
    level: 'HSK1',
    title: '怎么',
    meaning: 'how (to do something); how come',
    structure: '怎么 + V ／ 怎么 + (negative) clause',
    explanation:
      'Before a verb, 怎么 asks about the way to do something: 怎么走? "how do I get there?". Before a statement, especially a negative one, it asks "how come" with surprise: 你怎么没来? That second use sounds like mild complaint, unlike the neutral 为什么.',
    categories: ['method.means', 'cause.reason'],
    register: 'neutral',
    examples: [
      { jp: '请问，去火车站怎么走？', reading: 'qǐngwèn, qù huǒchēzhàn zěnme zǒu', en: 'Excuse me, how do I get to the train station?' },
      { jp: '你昨天怎么没来上课？', reading: 'nǐ zuótiān zěnme méi lái shàngkè', en: 'How come you did not come to class yesterday?' },
    ],
  },
  {
    id: 'hsk1-liang-er',
    lang: 'zh',
    level: 'HSK1',
    title: '两 vs 二',
    meaning: 'two (with measure words) vs two (as a number)',
    structure: '两 + measure word + noun ／ 二 in counting, digits and ordinals',
    explanation:
      'Before a measure word, "two" is 两: 两个人, 两本书. 二 is used when counting, in longer numbers (十二, 二十) and in ordinals (第二). With 千 and 万 both are heard, but 两 is more common at the start.',
    categories: ['quantity.amount'],
    register: 'neutral',
    examples: [
      { jp: '我有两个哥哥。', reading: 'wǒ yǒu liǎng ge gēge', en: 'I have two older brothers.' },
      { jp: '他住在二十二楼。', reading: 'tā zhù zài èrshí\'èr lóu', en: 'He lives on the twenty-second floor.' },
    ],
  },
  {
    id: 'hsk2-zenmeyang',
    lang: 'zh',
    level: 'HSK2',
    title: '怎么样',
    meaning: 'how is it?; how about …?',
    structure: 'Topic + 怎么样? ／ Suggestion, 怎么样?',
    explanation:
      'At the end of a sentence 怎么样 asks for an opinion or a condition: 天气怎么样? After a suggestion it asks for agreement: 我们去看电影，怎么样? The negative 不怎么样 means "not great".',
    categories: ['request.invite', 'judgment.evaluation'],
    register: 'neutral',
    examples: [
      { jp: '你最近身体怎么样？', reading: 'nǐ zuìjìn shēntǐ zěnmeyàng', en: 'How have you been feeling lately?' },
      { jp: '周末我们去爬山，怎么样？', reading: 'zhōumò wǒmen qù pá shān, zěnmeyàng', en: 'How about going hiking this weekend?' },
    ],
  },
  {
    id: 'hsk2-weishenme',
    lang: 'zh',
    level: 'HSK2',
    title: '为什么',
    meaning: 'why',
    structure: 'Subject + 为什么 + V? ／ 为什么 + clause?',
    explanation:
      'Asks for a reason in a neutral way; the answer usually starts with 因为. It normally comes after the subject but can open the sentence for emphasis. Compare 怎么, which adds surprise or complaint.',
    categories: ['cause.reason'],
    register: 'neutral',
    examples: [
      { jp: '你为什么学习汉语？', reading: 'nǐ wèi shénme xuéxí Hànyǔ', en: 'Why are you learning Chinese?' },
      { jp: '为什么他今天不高兴？', reading: 'wèi shénme tā jīntiān bù gāoxìng', en: 'Why is he unhappy today?' },
    ],
  },
  {
    id: 'hsk2-ci',
    lang: 'zh',
    level: 'HSK2',
    title: 'V + number + 次 (how many times)',
    meaning: '(do) … times',
    structure: 'V (+ 过／了) + number + 次 (+ object)',
    explanation:
      '次 counts how often an action happens and comes after the verb, not before it: 我去过两次. With a noun object the count usually precedes it (看了三次电影), but a pronoun object comes first (见过他一次).',
    categories: ['quantity.frequency', 'time.repetition'],
    register: 'neutral',
    examples: [
      { jp: '我去过北京两次。', reading: 'wǒ qùguo Běijīng liǎng cì', en: 'I have been to Beijing twice.' },
      { jp: '这个电影我看了三次。', reading: 'zhège diànyǐng wǒ kànle sān cì', en: 'I have seen this film three times.' },
    ],
  },
  {
    id: 'hsk2-hai-mei-ne',
    lang: 'zh',
    level: 'HSK2',
    title: '还没(有)…呢',
    meaning: 'not … yet',
    structure: 'Subject + 还没(有) + V + 呢',
    explanation:
      'Says an expected action has not happened yet. 了 is not used with 没, so 还没吃了 is wrong. 呢 at the end softens it and implies the action will still come.',
    categories: ['time.completion', 'emphasis.negation'],
    register: 'neutral',
    examples: [
      { jp: '我还没吃饭呢。', reading: 'wǒ hái méi chī fàn ne', en: 'I have not eaten yet.' },
      { jp: '他还没有回来呢。', reading: 'tā hái méiyǒu huílai ne', en: 'He has not come back yet.' },
    ],
  },
  {
    id: 'hsk2-huozhe',
    lang: 'zh',
    level: 'HSK2',
    title: '或者',
    meaning: 'or (in statements)',
    structure: 'A 或者 B',
    explanation:
      '或者 joins options in a statement: 你可以喝茶或者咖啡. In a question that asks the listener to choose, use 还是 instead: 你喝茶还是咖啡? Mixing the two up is one of the most common learner errors.',
    categories: ['examples.alternative'],
    register: 'neutral',
    examples: [
      { jp: '周末我在家看书或者看电视。', reading: 'zhōumò wǒ zài jiā kàn shū huòzhě kàn diànshì', en: 'At the weekend I read or watch TV at home.' },
      { jp: '你可以坐地铁或者打车去。', reading: 'nǐ kěyǐ zuò dìtiě huòzhě dǎchē qù', en: 'You can take the subway or a taxi.' },
    ],
  },
  {
    id: 'hsk2-geng',
    lang: 'zh',
    level: 'HSK2',
    title: '更',
    meaning: 'even more; more',
    structure: '(A 比 B) + 更 + adjective / psychological verb',
    explanation:
      '更 raises the degree when two things are compared or one is compared with before: 今天比昨天更冷. It implies B is already cold too. It cannot be combined with 很 or 非常 in the same phrase.',
    categories: ['comparison.compare', 'degree.extent'],
    register: 'neutral',
    examples: [
      { jp: '今天比昨天更冷。', reading: 'jīntiān bǐ zuótiān gèng lěng', en: 'Today is even colder than yesterday.' },
      { jp: '我更喜欢喝茶。', reading: 'wǒ gèng xǐhuan hē chá', en: 'I prefer tea.' },
    ],
  },
  {
    id: 'hsk2-zai',
    lang: 'zh',
    level: 'HSK2',
    title: '再',
    meaning: 'again (in the future); then',
    structure: '再 + V',
    explanation:
      '再 marks a repetition that has not happened yet: 明天再来 "come again tomorrow". For a repetition that already happened, use 又. 再 also means "and then" after a first action (先…再…), and 再见 comes from it.',
    categories: ['time.repetition', 'time.sequence'],
    register: 'neutral',
    examples: [
      { jp: '请你再说一遍。', reading: 'qǐng nǐ zài shuō yí biàn', en: 'Please say it again.' },
      { jp: '我们吃完饭再走吧。', reading: 'wǒmen chīwán fàn zài zǒu ba', en: 'Let us leave after we finish eating.' },
    ],
  },
  {
    id: 'hsk3-you-again',
    lang: 'zh',
    level: 'HSK3',
    title: '又',
    meaning: 'again (already happened)',
    structure: '又 + V + 了',
    explanation:
      '又 marks a repetition that has already taken place, often with a hint of annoyance: 他又迟到了. With predictable future events (明天又是星期一) it can refer ahead. For a repetition still to come, use 再.',
    categories: ['time.repetition'],
    register: 'neutral',
    examples: [
      { jp: '他今天又迟到了。', reading: 'tā jīntiān yòu chídào le', en: 'He was late again today.' },
      { jp: '你怎么又忘了带钥匙？', reading: 'nǐ zěnme yòu wàngle dài yàoshi', en: 'How did you forget your keys again?' },
    ],
  },
  {
    id: 'hsk3-mei-dou',
    lang: 'zh',
    level: 'HSK3',
    title: '每…都…',
    meaning: 'every … (without exception)',
    structure: '每 + (number) + measure word + noun + 都 + V',
    explanation:
      '每 marks each member of a group and 都 in the predicate confirms that all are included; 都 is almost always needed. The measure word must stay: 每个人, 每天 (天 is its own measure).',
    categories: ['quantity.frequency', 'emphasis.emphasize'],
    register: 'neutral',
    examples: [
      { jp: '他每天都跑步。', reading: 'tā měi tiān dōu pǎobù', en: 'He runs every day.' },
      { jp: '每个学生都有一本词典。', reading: 'měi ge xuésheng dōu yǒu yì běn cídiǎn', en: 'Every student has a dictionary.' },
    ],
  },
  {
    id: 'hsk3-meiyou-name',
    lang: 'zh',
    level: 'HSK3',
    title: 'A 没有 B (那么／这么) + adj',
    meaning: 'A is not as … as B',
    structure: 'A + 没有 + B + (那么／这么) + adjective',
    explanation:
      'The usual negative of a 比 comparison: 我没有他那么高 "I am not as tall as he is". 不比 exists but means something else ("no more … than", often contradicting a claim). 那么 or 这么 adds "that / this much".',
    categories: ['comparison.compare', 'emphasis.negation'],
    register: 'neutral',
    examples: [
      { jp: '我没有他那么高。', reading: 'wǒ méiyǒu tā nàme gāo', en: 'I am not as tall as he is.' },
      { jp: '今天没有昨天热。', reading: 'jīntiān méiyǒu zuótiān rè', en: 'Today is not as hot as yesterday.' },
    ],
  },
  {
    id: 'hsk3-dui-gan-xingqu',
    lang: 'zh',
    level: 'HSK3',
    title: '对…感兴趣',
    meaning: 'to be interested in …',
    structure: 'Subject + 对 + object + 感兴趣 ／ 有兴趣',
    explanation:
      'The thing you are interested in goes before the verb with 对, not after it: 我对历史感兴趣, never 我感兴趣历史. Degree adverbs such as 很 or 特别 go before 感. The negative is 不感兴趣.',
    categories: ['emotion.feeling'],
    register: 'neutral',
    examples: [
      { jp: '我对中国历史很感兴趣。', reading: 'wǒ duì Zhōngguó lìshǐ hěn gǎn xìngqù', en: 'I am very interested in Chinese history.' },
      { jp: '他对足球不感兴趣。', reading: 'tā duì zúqiú bù gǎn xìngqù', en: 'He is not interested in football.' },
    ],
  },
  {
    id: 'hsk3-yuanlai',
    lang: 'zh',
    level: 'HSK3',
    title: '原来',
    meaning: 'so it turns out; originally',
    structure: '原来 + clause ／ 原来的 + noun',
    explanation:
      'As an adverb, 原来 marks a discovery of the real situation: 原来是你! "oh, so it was you!". As an adjective it means "original, former": 原来的计划. Compare 本来, which stresses what should or would have been.',
    categories: ['emotion.surprise', 'explanation.explain'],
    register: 'neutral',
    examples: [
      { jp: '原来他是你哥哥！', reading: 'yuánlái tā shì nǐ gēge', en: 'Oh, so he is your brother!' },
      { jp: '我们还是按原来的计划做吧。', reading: 'wǒmen háishi àn yuánlái de jìhuà zuò ba', en: 'Let us stick to the original plan.' },
    ],
  },
  {
    id: 'hsk3-ruguo-dehua',
    lang: 'zh',
    level: 'HSK3',
    title: '如果…的话',
    meaning: 'if …',
    structure: '(如果／要是) + clause + 的话, (就) + result',
    explanation:
      '的话 closes a condition clause, and 如果 can be dropped in speech: 明天下雨的话，我们就不去了. It makes the condition sound more tentative. 就 in the result clause is common but optional.',
    categories: ['condition.hypothetical'],
    register: 'neutral',
    examples: [
      { jp: '如果你有时间的话，来我家玩吧。', reading: 'rúguǒ nǐ yǒu shíjiān dehuà, lái wǒ jiā wán ba', en: 'If you have time, come over to my place.' },
      { jp: '明天下雨的话，我们就不去了。', reading: 'míngtiān xià yǔ dehuà, wǒmen jiù bú qù le', en: 'If it rains tomorrow, we will not go.' },
    ],
  },
  {
    id: 'hsk3-zhi',
    lang: 'zh',
    level: 'HSK3',
    title: '只',
    meaning: 'only',
    structure: 'Subject + 只 + V (+ object)',
    explanation:
      '只 is an adverb, so it goes before the verb even when it limits the object: 我只喝水 "I only drink water". Putting it before the subject needs 只有 instead: 只有他知道. 就 can mean "only" in speech too.',
    categories: ['degree.limit'],
    register: 'neutral',
    examples: [
      { jp: '我只会说一点儿汉语。', reading: 'wǒ zhǐ huì shuō yìdiǎnr Hànyǔ', en: 'I can only speak a little Chinese.' },
      { jp: '他早上只喝了一杯咖啡。', reading: 'tā zǎoshang zhǐ hēle yì bēi kāfēi', en: 'He only had a cup of coffee this morning.' },
    ],
  },
  {
    id: 'hsk3-chadian',
    lang: 'zh',
    level: 'HSK3',
    title: '差点',
    meaning: 'almost; nearly (差点儿)',
    structure: '差点(儿) + (没) + V',
    explanation:
      '差点儿 says something very nearly happened. For an unwanted event, 差点儿 and 差点儿没 mean the same: 差点儿摔倒 = 差点儿没摔倒 "almost fell". For a wanted event, 差点儿没 means it just barely happened: 差点儿没赶上 "only just made it".',
    categories: ['degree.approximation'],
    register: 'neutral',
    examples: [
      { jp: '我今天差点儿迟到。', reading: 'wǒ jīntiān chàdiǎnr chídào', en: 'I was almost late today.' },
      { jp: '路太滑了，我差点儿摔倒。', reading: 'lù tài huá le, wǒ chàdiǎnr shuāidǎo', en: 'The road was so slippery I nearly fell.' },
    ],
  },
  {
    id: 'hsk4-benlai',
    lang: 'zh',
    level: 'HSK4',
    title: '本来',
    meaning: 'originally; it should have been; of course',
    structure: '本来 + V／adj (, 可是／后来 …) ／ 本来就 + …',
    explanation:
      '本来 describes the situation before a change: 我本来想去，可是太忙了. 本来就 means "should naturally be so, of course": 学习本来就不容易. It differs from 原来, which marks a discovery.',
    categories: ['contrast.unexpected', 'judgment.certainty'],
    register: 'neutral',
    examples: [
      { jp: '我本来想去，可是突然有事。', reading: 'wǒ běnlái xiǎng qù, kěshì tūrán yǒu shì', en: 'I meant to go, but something suddenly came up.' },
      { jp: '学外语本来就不容易。', reading: 'xué wàiyǔ běnlái jiù bù róngyì', en: 'Learning a foreign language is naturally not easy.' },
    ],
  },
  {
    id: 'hsk4-jihu',
    lang: 'zh',
    level: 'HSK4',
    title: '几乎',
    meaning: 'almost; nearly',
    structure: '几乎 + V／adj ／ 几乎 + 所有／每 + noun + 都',
    explanation:
      '几乎 describes a degree or amount that is close to complete: 几乎所有人都来了. It is more written than 差不多. With a negative it means "hardly": 几乎不说话.',
    categories: ['degree.approximation'],
    register: 'neutral',
    examples: [
      { jp: '几乎所有的同学都来了。', reading: 'jīhū suǒyǒu de tóngxué dōu lái le', en: 'Almost all the classmates came.' },
      { jp: '他忙得几乎没有时间吃饭。', reading: 'tā máng de jīhū méiyǒu shíjiān chī fàn', en: 'He is so busy he hardly has time to eat.' },
    ],
  },
  {
    id: 'hsk3-nanguai',
    lang: 'zh',
    level: 'HSK3',
    title: '难怪',
    meaning: 'no wonder',
    structure: '难怪 + clause (, 原来 + reason)',
    explanation:
      'Expresses sudden understanding once the reason is known: 难怪他这么累，原来昨天没睡觉. The reason can come before or after, often introduced by 原来. 怪不得 is a spoken synonym.',
    categories: ['explanation.conclusion', 'emotion.surprise'],
    register: 'neutral',
    examples: [
      { jp: '难怪他汉语这么好，原来他在中国住过五年。', reading: 'nánguài tā Hànyǔ zhème hǎo, yuánlái tā zài Zhōngguó zhùguo wǔ nián', en: 'No wonder his Chinese is so good; he lived in China for five years.' },
      { jp: '外面下雪了，难怪这么冷。', reading: 'wàimian xià xuě le, nánguài zhème lěng', en: 'It is snowing outside; no wonder it is so cold.' },
    ],
  },
  {
    id: 'hsk4-jiran-jiu',
    lang: 'zh',
    level: 'HSK4',
    title: '既然…就…',
    meaning: 'since … (then) …',
    structure: '既然 + known fact, (subject) + 就 + conclusion',
    explanation:
      '既然 presents a fact both speakers accept and draws a conclusion from it, often advice or a decision: 既然你病了，就好好休息吧. It differs from 因为, which simply states a cause.',
    categories: ['cause.premise'],
    register: 'neutral',
    examples: [
      { jp: '既然你不舒服，就早点儿回家吧。', reading: 'jìrán nǐ bù shūfu, jiù zǎo diǎnr huí jiā ba', en: 'Since you are not feeling well, go home early.' },
      { jp: '既然已经决定了，就别再犹豫了。', reading: 'jìrán yǐjīng juédìng le, jiù bié zài yóuyù le', en: 'Now that it has been decided, stop hesitating.' },
    ],
  },
  {
    id: 'hsk4-napa-ye',
    lang: 'zh',
    level: 'HSK4',
    title: '哪怕…也…',
    meaning: 'even if …, still …',
    structure: '哪怕 + (extreme) condition, (subject) + 也／都 + V',
    explanation:
      'A strong concession: even in the extreme case, the result holds. It is more emphatic and spoken than 即使. The condition is often hypothetical and exaggerated: 哪怕只有一点儿希望.',
    categories: ['contrast.concession'],
    register: 'neutral',
    examples: [
      { jp: '哪怕下大雨，我也要去。', reading: 'nǎpà xià dà yǔ, wǒ yě yào qù', en: 'Even if it pours with rain, I am going.' },
      { jp: '哪怕只有一点儿希望，我们也不能放弃。', reading: 'nǎpà zhǐ yǒu yìdiǎnr xīwàng, wǒmen yě bù néng fàngqì', en: 'Even if there is only a little hope, we cannot give up.' },
    ],
  },
  {
    id: 'hsk4-fanzheng',
    lang: 'zh',
    level: 'HSK4',
    title: '反正',
    meaning: 'anyway; in any case',
    structure: '反正 + clause (reason that makes the rest not matter)',
    explanation:
      '反正 says the outcome is the same whatever happens, and often gives the reason why something does not matter: 反正没事，我陪你去吧. It is spoken. Compare 毕竟, which appeals to an underlying fact rather than dismissing alternatives.',
    categories: ['discourse.connection', 'judgment.certainty'],
    register: 'casual',
    examples: [
      { jp: '反正我今天没事，我陪你去吧。', reading: 'fǎnzhèng wǒ jīntiān méi shì, wǒ péi nǐ qù ba', en: 'I have nothing on today anyway, so I will go with you.' },
      { jp: '你信不信都行，反正我说的是真的。', reading: 'nǐ xìn bu xìn dōu xíng, fǎnzhèng wǒ shuō de shì zhēn de', en: 'Believe it or not, what I said is true anyway.' },
    ],
  },
  {
    id: 'hsk4-bijing',
    lang: 'zh',
    level: 'HSK4',
    title: '毕竟',
    meaning: 'after all (considering the facts)',
    structure: '毕竟 + fact that explains or excuses',
    explanation:
      '毕竟 points to a basic fact that should be kept in mind: 他毕竟是孩子 "he is only a child after all". It is used to justify, excuse or reach a fair conclusion. 到底 can mean the same in statements but 毕竟 cannot be used in questions.',
    categories: ['cause.grounds', 'explanation.conclusion'],
    register: 'neutral',
    examples: [
      { jp: '别生气了，他毕竟还是个孩子。', reading: 'bié shēngqì le, tā bìjìng háishi ge háizi', en: 'Do not be angry; he is only a child, after all.' },
      { jp: '毕竟是第一次，做得不好也正常。', reading: 'bìjìng shì dì-yī cì, zuò de bù hǎo yě zhèngcháng', en: 'It is the first time, after all, so it is normal not to do it well.' },
    ],
  },
  {
    id: 'hsk4-xingkui',
    lang: 'zh',
    level: 'HSK4',
    title: '幸亏',
    meaning: 'fortunately; luckily (… otherwise …)',
    structure: '幸亏 + lucky circumstance, (不然／要不然 + bad outcome)',
    explanation:
      '幸亏 names the circumstance that saved the day, and the bad outcome that was avoided often follows with 不然 or 要不然. 幸好 is a synonym. Compare 好在, which is similar but more colloquial.',
    categories: ['emotion.feeling', 'condition.counterfactual'],
    register: 'neutral',
    examples: [
      { jp: '幸亏你提醒我，不然我就忘了。', reading: 'xìngkuī nǐ tíxǐng wǒ, bùrán wǒ jiù wàng le', en: 'Luckily you reminded me, otherwise I would have forgotten.' },
      { jp: '幸亏带了伞，雨下得很大。', reading: 'xìngkuī dàile sǎn, yǔ xià de hěn dà', en: 'Fortunately I brought an umbrella; it rained hard.' },
    ],
  },
  {
    id: 'hsk4-bujin-hai',
    lang: 'zh',
    level: 'HSK4',
    title: '不仅…还／也…',
    meaning: 'not only … but also …',
    structure: '(Subject) + 不仅 + A, (subject) + 还／也／而且 + B',
    explanation:
      'A more written synonym of 不但…而且…. If both clauses share a subject, it comes before 不仅; if the subjects differ, 不仅 comes first. 还 in the second half adds "on top of that".',
    categories: ['examples.listing', 'emphasis.emphasize'],
    register: 'neutral',
    examples: [
      { jp: '她不仅会说汉语，还会说日语。', reading: 'tā bùjǐn huì shuō Hànyǔ, hái huì shuō Rìyǔ', en: 'She can speak not only Chinese but also Japanese.' },
      { jp: '这家店不仅便宜，而且服务也很好。', reading: 'zhè jiā diàn bùjǐn piányi, érqiě fúwù yě hěn hǎo', en: 'This shop is not only cheap, the service is good too.' },
    ],
  },
  {
    id: 'hsk4-wangwang',
    lang: 'zh',
    level: 'HSK4',
    title: '往往',
    meaning: 'usually; tends to (as a pattern)',
    structure: '(Under some condition) + 往往 + V',
    explanation:
      '往往 states a regular tendency observed under certain circumstances: 周末超市往往人很多. It cannot be used for the future or for personal intentions; 常常 is freer and can be used for both.',
    categories: ['quantity.frequency'],
    register: 'neutral',
    examples: [
      { jp: '周末超市里往往人很多。', reading: 'zhōumò chāoshì lǐ wǎngwǎng rén hěn duō', en: 'Supermarkets tend to be crowded at weekends.' },
      { jp: '越着急，往往越容易出错。', reading: 'yuè zháojí, wǎngwǎng yuè róngyì chū cuò', en: 'The more you rush, the more likely you usually are to make mistakes.' },
    ],
  },
  {
    id: 'hsk4-rengran',
    lang: 'zh',
    level: 'HSK4',
    title: '仍然',
    meaning: 'still; as before',
    structure: '仍然 + V／adj',
    explanation:
      '仍然 says a situation continues unchanged, often despite something that might have changed it: 他病了，但仍然去上班. It is more written than 还; 依然 is a literary synonym.',
    categories: ['state.ongoing', 'contrast.concession'],
    register: 'neutral',
    examples: [
      { jp: '虽然很累，他仍然坚持工作。', reading: 'suīrán hěn lèi, tā réngrán jiānchí gōngzuò', en: 'Although he was tired, he still kept working.' },
      { jp: '十年过去了，这里仍然没什么变化。', reading: 'shí nián guòqu le, zhèlǐ réngrán méi shénme biànhuà', en: 'Ten years have passed, and this place has hardly changed.' },
    ],
  },
  {
    id: 'hsk4-haoburongyi',
    lang: 'zh',
    level: 'HSK4',
    title: '好不容易',
    meaning: 'with great difficulty; finally (after much effort)',
    structure: '好不容易(才) + V',
    explanation:
      'Despite the 不, 好不容易 means the same as 好容易: something was very hard to achieve. It is often followed by 才 and followed by a result that makes the effort feel wasted or worthwhile.',
    categories: ['state.effort'],
    register: 'neutral',
    examples: [
      { jp: '我好不容易才买到票。', reading: 'wǒ hǎobù róngyì cái mǎidào piào', en: 'I managed to get a ticket only with great difficulty.' },
      { jp: '好不容易找到了工作，他却不想去了。', reading: 'hǎobù róngyì zhǎodàole gōngzuò, tā què bù xiǎng qù le', en: 'After all the effort of finding a job, he no longer wanted to go.' },
    ],
  },
  {
    id: 'hsk4-yaobushi',
    lang: 'zh',
    level: 'HSK4',
    title: '要不是',
    meaning: 'if it were not for …',
    structure: '要不是 + actual fact, (subject) + 就／早就 + imagined result',
    explanation:
      'A counterfactual: the first clause states what really happened, and the second what would have happened otherwise. 要不是你帮我，我就完了 "if you had not helped me, I would have been done for".',
    categories: ['condition.counterfactual'],
    register: 'neutral',
    examples: [
      { jp: '要不是你叫醒我，我就迟到了。', reading: 'yàobúshì nǐ jiàoxǐng wǒ, wǒ jiù chídào le', en: 'If you had not woken me up, I would have been late.' },
      { jp: '要不是下雨，我们早就到了。', reading: 'yàobúshì xià yǔ, wǒmen zǎo jiù dào le', en: 'If it had not rained, we would have arrived long ago.' },
    ],
  },
  {
    id: 'hsk4-zhisuoyi',
    lang: 'zh',
    level: 'HSK4',
    title: '之所以…是因为',
    meaning: 'the reason why … is that …',
    structure: '(Subject) + 之所以 + result, 是因为 + cause',
    explanation:
      'Puts the result first and the cause second, stressing the explanation. It is formal and common in essays and speeches. The everyday order is 因为…所以….',
    categories: ['cause.reason', 'explanation.explain'],
    register: 'neutral',
    examples: [
      { jp: '我之所以学汉语，是因为对中国文化感兴趣。', reading: 'wǒ zhīsuǒyǐ xué Hànyǔ, shì yīnwèi duì Zhōngguó wénhuà gǎn xìngqù', en: 'The reason I study Chinese is that I am interested in Chinese culture.' },
      { jp: '他之所以成功，是因为从不放弃。', reading: 'tā zhīsuǒyǐ chénggōng, shì yīnwèi cóng bú fàngqì', en: 'He succeeded because he never gave up.' },
    ],
  },
  {
    id: 'hsk4-wanyi',
    lang: 'zh',
    level: 'HSK4',
    title: '万一',
    meaning: 'in case; if by any chance (something bad)',
    structure: '万一 + unlikely (bad) event, (就／怎么办)',
    explanation:
      '万一 introduces an unlikely and usually unwelcome possibility, often to justify a precaution: 带把伞吧，万一下雨呢. 万一…怎么办? asks "what if …?". For neutral conditions use 如果.',
    categories: ['condition.hypothetical'],
    register: 'neutral',
    examples: [
      { jp: '带把伞吧，万一下雨呢。', reading: 'dài bǎ sǎn ba, wànyī xià yǔ ne', en: 'Take an umbrella, just in case it rains.' },
      { jp: '万一他不来，我们怎么办？', reading: 'wànyī tā bù lái, wǒmen zěnme bàn', en: 'What will we do if he does not come?' },
    ],
  },
  {
    id: 'hsk4-chen',
    lang: 'zh',
    level: 'HSK4',
    title: '趁',
    meaning: 'while (taking advantage of an opportunity)',
    structure: '趁(着) + condition／time + V',
    explanation:
      '趁 says to act while a favourable condition lasts: 趁热吃 "eat it while it is hot", 趁年轻多旅行. The condition is temporary, so the action should not be put off.',
    categories: ['time.simultaneous', 'method.means'],
    register: 'neutral',
    examples: [
      { jp: '饺子趁热吃吧。', reading: 'jiǎozi chèn rè chī ba', en: 'Eat the dumplings while they are hot.' },
      { jp: '趁年轻，多去几个国家看看。', reading: 'chèn niánqīng, duō qù jǐ ge guójiā kànkan', en: 'While you are young, go and see a few more countries.' },
    ],
  },
  {
    id: 'hsk4-chufei-cai',
    lang: 'zh',
    level: 'HSK4',
    title: '除非…才…',
    meaning: 'only if …; unless …',
    structure: '除非 + sole condition, (subject) + 才 + result ／ 除非 + condition, 否则／不然 + …',
    explanation:
      '除非 names the one condition under which something will happen. With 才 it means "only if": 除非你去，我才去. With 否则 or 不然 it means "unless": 除非下大雨，否则比赛照常进行.',
    categories: ['condition.requirement', 'contrast.exception'],
    register: 'neutral',
    examples: [
      { jp: '除非你陪我去，我才去。', reading: 'chúfēi nǐ péi wǒ qù, wǒ cái qù', en: 'I will only go if you come with me.' },
      { jp: '除非下大雨，否则比赛照常进行。', reading: 'chúfēi xià dà yǔ, fǒuzé bǐsài zhàocháng jìnxíng', en: 'Unless it rains heavily, the match will go ahead as usual.' },
    ],
  },
  {
    id: 'hsk5-hebi',
    lang: 'zh',
    level: 'HSK5',
    title: '何必',
    meaning: 'why bother; there is no need to',
    structure: '何必 + V (+ 呢)?',
    explanation:
      'A rhetorical question saying something is unnecessary: 何必生气呢? "why get angry?". It often follows or precedes an easier alternative. 不必 says the same thing as a plain statement.',
    categories: ['request.advice', 'emphasis.negation'],
    register: 'neutral',
    examples: [
      { jp: '一点儿小事，何必生气呢？', reading: 'yìdiǎnr xiǎo shì, hébì shēngqì ne', en: 'It is such a small thing; why get angry?' },
      { jp: '坐地铁很方便，何必打车？', reading: 'zuò dìtiě hěn fāngbiàn, hébì dǎchē', en: 'The subway is convenient; why bother taking a taxi?' },
    ],
  },
  {
    id: 'hsk5-fanshi',
    lang: 'zh',
    level: 'HSK5',
    title: '凡是',
    meaning: 'all; every (without exception)',
    structure: '凡是 + noun phrase／relative clause, 都 + V',
    explanation:
      '凡是 opens a sentence and covers everything of a kind, with 都 confirming it: 凡是去过的人都说好. It is formal and common in rules. 所有 is the everyday equivalent.',
    categories: ['emphasis.emphasize', 'quantity.amount'],
    register: 'neutral',
    examples: [
      { jp: '凡是去过那儿的人都说那里很美。', reading: 'fánshì qùguo nàr de rén dōu shuō nàlǐ hěn měi', en: 'Everyone who has been there says it is beautiful.' },
      { jp: '凡是十八岁以上的人都可以参加。', reading: 'fánshì shíbā suì yǐshàng de rén dōu kěyǐ cānjiā', en: 'Anyone aged eighteen or over may take part.' },
    ],
  },
  {
    id: 'hsk5-bujiande',
    lang: 'zh',
    level: 'HSK5',
    title: '不见得',
    meaning: 'not necessarily; I doubt it',
    structure: '不见得 + clause ／ (reply) 不见得。',
    explanation:
      'A polite way to disagree or cast doubt: 贵的不见得好 "expensive does not necessarily mean good". It is spoken and softer than 不一定 in tone. It can stand alone as a reply.',
    categories: ['judgment.conjecture', 'emphasis.negation'],
    register: 'neutral',
    examples: [
      { jp: '贵的东西不见得就好。', reading: 'guì de dōngxi bújiànde jiù hǎo', en: 'Expensive things are not necessarily good.' },
      { jp: '他说他会来，我看不见得。', reading: 'tā shuō tā huì lái, wǒ kàn bújiànde', en: 'He says he will come, but I doubt it.' },
    ],
  },
  {
    id: 'hsk6-fouze',
    lang: 'zh',
    level: 'HSK6',
    title: '否则',
    meaning: 'otherwise; or else',
    structure: 'Clause (necessary action), 否则 + consequence',
    explanation:
      '否则 introduces what will happen if the preceding advice or condition is not followed: 快走吧，否则要迟到了. It is more formal than 不然 and 要不. It often follows 必须 or 除非.',
    categories: ['condition.hypothetical', 'cause.result'],
    register: 'neutral',
    examples: [
      { jp: '我们得快点儿走，否则要迟到了。', reading: 'wǒmen děi kuài diǎnr zǒu, fǒuzé yào chídào le', en: 'We must hurry, or we will be late.' },
      { jp: '必须提前预约，否则不能参观。', reading: 'bìxū tíqián yùyuē, fǒuzé bù néng cānguān', en: 'You must book in advance; otherwise you cannot visit.' },
    ],
  },
  {
    id: 'hsk5-yi-wei',
    lang: 'zh',
    level: 'HSK5',
    title: '以…为…',
    meaning: 'to take A as B; to regard A as B',
    structure: '以 + A + 为 + B (主／例／荣／中心)',
    explanation:
      'A written frame that treats A as B: 以学生为主 "take students as the focus", 以此为例 "take this as an example". Common fixed combinations are 以…为主, 以…为例, 以…为荣 and 以…为中心.',
    categories: ['method.perspective', 'explanation.definition'],
    register: 'literary',
    examples: [
      { jp: '这家公司以年轻人为主要顾客。', reading: 'zhè jiā gōngsī yǐ niánqīngrén wéi zhǔyào gùkè', en: 'This company treats young people as its main customers.' },
      { jp: '我们以这篇文章为例来讨论。', reading: 'wǒmen yǐ zhè piān wénzhāng wéi lì lái tǎolùn', en: 'Let us take this article as an example for discussion.' },
    ],
  },
];

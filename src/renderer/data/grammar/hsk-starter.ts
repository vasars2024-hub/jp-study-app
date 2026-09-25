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
];

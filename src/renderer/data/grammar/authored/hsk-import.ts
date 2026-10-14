import type { GrammarExample } from '../types';
import type { AuthoredGrammarContent } from '../authoredContent';

const ex = (jp: string, reading: string, en: string): GrammarExample => ({ jp, reading, en });

/**
 * Authored content for the imported HSK list (`hsk-import.ts`, see
 * authoredContent.ts `applyAuthoredHskImport`).
 *
 * That list arrived as a pattern and a gloss — no structure, no explanation, no
 * example — so 412 Chinese records said nothing a learner could use and never
 * reached "Ready to study". Every entry here is original writing for this app:
 * the structure, a short English explanation and two example sentences, with
 * pinyin. Where the list's gloss was wrong or misleading, `meaning` corrects it.
 *
 * GENERATED from the v1 content pass; edit entries in place.
 */
export const AUTHORED_HSK_IMPORT: Record<string, AuthoredGrammarContent> = {
  // HSK1 岁
  'hsk1-i-86f13375': {
    structure: 'Subj + (今年) + Number + 岁 (+ 了)',
    explanation:
      'Gives someone\'s age. The number and 岁 act as the predicate directly, so no 是 is needed (我二十岁, not 我是二十岁). Use 两岁 rather than 二岁, and ask with 几岁 for children or 多大 for adults; a final 了 stresses having reached that age.',
    examples: [
      ex('我今年二十岁。', 'wǒ jīnnián èrshí suì.', 'I am twenty this year.'),
      ex('你女儿几岁了？', 'nǐ nǚ\'ér jǐ suì le?', 'How old is your daughter now?'),
    ],
  },
  // HSK1 个
  'hsk1-i-f7b2a6ee': {
    structure: 'Number / 这 / 那 / 几 + 个 + N',
    explanation:
      'The default measure word placed between a number or demonstrative and a noun; Chinese cannot say 三朋友 when counting. It works for people and many objects when you do not know the specific classifier, though nouns like 书 (本) or 衣服 (件) sound better with their own. Usually read in the neutral tone ge.',
    examples: [
      ex('我有三个朋友。', 'wǒ yǒu sān gè péngyou.', 'I have three friends.'),
      ex('这个苹果很好吃。', 'zhège píngguǒ hěn hǎochī.', 'This apple is delicious.'),
    ],
  },
  // HSK1 叫
  'hsk1-i-793f8679': {
    structure: 'Subj + 叫 + full name / given name   |   Subj + 叫 + 什么(名字)？',
    explanation:
      'Introduces what a person or thing is called and is followed directly by the name. Unlike 姓, which takes only the surname, 叫 takes the full name or given name. Ask with 你叫什么名字？; do not insert 是 (我是叫… is wrong).',
    examples: [
      ex('我叫李明。', 'wǒ jiào Lǐ Míng.', 'My name is Li Ming.'),
      ex('你叫什么名字？', 'nǐ jiào shénme míngzi?', 'What is your name?'),
    ],
  },
  // HSK1 去
  'hsk1-i-033fd274': {
    structure: 'Subj + 去 + Place (+ V + O)',
    explanation:
      'Means going away from the speaker toward a place, which follows directly with no preposition (去北京, not 去到北京 or 去在北京). A second verb phrase after the place gives the purpose. Contrast 来, which means moving toward the speaker.',
    examples: [
      ex('我明天去北京。', 'wǒ míngtiān qù Běijīng.', 'I am going to Beijing tomorrow.'),
      ex('他去商店买水果。', 'tā qù shāngdiàn mǎi shuǐguǒ.', 'He is going to the shop to buy fruit.'),
    ],
  },
  // HSK1 姓
  'hsk1-i-003e1ac9': {
    structure: 'Subj + 姓 + Surname   |   您贵姓？',
    explanation:
      'A verb meaning \'to have the surname\', followed only by the family name (我姓王, never 我姓王明). The polite question is 您贵姓？, while 你姓什么？ is casual. Use 叫 when giving a full or given name.',
    examples: [
      ex('我姓王，叫王小红。', 'wǒ xìng Wáng, jiào Wáng Xiǎohóng.', 'My surname is Wang; my name is Wang Xiaohong.'),
      ex('您贵姓？', 'nín guìxìng?', 'May I ask your surname?'),
    ],
  },
  // HSK1 不要
  'hsk1-i-adbe2468': {
    structure: '不要 + V (+ O)',
    explanation:
      'Placed before a verb to tell someone not to do something. 别 is a shorter, more colloquial equivalent. Before a noun, 不要 instead means \'don\'t want\' (我不要咖啡), so context decides which reading applies.',
    examples: [
      ex('上课的时候不要说话。', 'shàngkè de shíhou bú yào shuōhuà.', 'Don\'t talk during class.'),
      ex('不要在这里抽烟。', 'bú yào zài zhèlǐ chōuyān.', 'Don\'t smoke here.'),
    ],
  },
  // HSK2 …死了
  'hsk2-i-e2e5f9fb': {
    meaning: 'extremely, to death (colloquial; mostly unpleasant states)',
    structure: 'Adj / psychological V + 死了',
    explanation:
      'A colloquial degree complement meaning \'extremely, to death\', attached right after the adjective or feeling verb. It is mostly used for unpleasant states (累死了, 饿死了) but in casual speech also appears with positive ones like 高兴死了. Do not add 很 in front (很热死了 is wrong); it is too informal for writing.',
    examples: [
      ex('今天热死了！', 'jīntiān rè sǐ le!', 'It\'s boiling hot today!'),
      ex('我饿死了，我们去吃饭吧。', 'wǒ è sǐ le, wǒmen qù chīfàn ba.', 'I\'m starving, let\'s go eat.'),
    ],
  },
  // HSK2 正在
  'hsk2-i-eb1e6e55': {
    structure: 'Subj + 正在 + V (+ O) (+ 呢)',
    explanation:
      'Marks an action as in progress at the moment of speaking or at a given past moment. It goes before the verb and is often paired with final 呢. 正在 stresses the exact point in time, while 在 alone is more neutral; it is not used with verbs that cannot last, like 死 or 到.',
    examples: [
      ex('我正在吃饭呢。', 'wǒ zhèngzài chīfàn ne.', 'I\'m eating right now.'),
      ex('他们正在开会，请等一下。', 'tāmen zhèngzài kāihuì, qǐng děng yíxià.', 'They are in a meeting, please wait a moment.'),
    ],
  },
  // HSK2 已经
  'hsk2-i-0328a7a6': {
    structure: 'Subj + 已经 + V / Adj / Number + 了',
    explanation:
      'An adverb before the predicate saying something has already happened or reached a point, almost always with 了 at the end. Its negative counterpart is 还没(有)…呢 (\'not yet\'), not 已经没. It can also mark quantities or times as already large or late (已经十点了).',
    examples: [
      ex('我已经吃饭了。', 'wǒ yǐjīng chīfàn le.', 'I have already eaten.'),
      ex('他已经三十岁了。', 'tā yǐjīng sānshí suì le.', 'He is already thirty.'),
    ],
  },
  // HSK2 总是
  'hsk2-i-11089071': {
    structure: 'Subj + 总是 + V / Adj',
    explanation:
      'An adverb before the verb meaning something happens every time or habitually. It is fairly neutral in tone, whereas 老是 usually carries complaint. Unlike 一直, which describes one unbroken stretch, 总是 describes repeated occurrences.',
    examples: [
      ex('他总是很早起床。', 'tā zǒngshì hěn zǎo qǐchuáng.', 'He always gets up early.'),
      ex('我妹妹总是忘记带钥匙。', 'wǒ mèimei zǒngshì wàngjì dài yàoshi.', 'My younger sister always forgets to bring her keys.'),
    ],
  },
  // HSK2 刚
  'hsk2-i-9fa1acaa': {
    structure: 'Subj + 刚 + V (+ O)',
    explanation:
      'An adverb placed after the subject and directly before the verb, meaning the action happened only a short time ago. Unlike the time noun 刚才, it cannot come before the subject and is not followed by negation; it also rarely takes final 了.',
    examples: [
      ex('我刚到家。', 'wǒ gāng dào jiā.', 'I just got home.'),
      ex('他刚吃完饭。', 'tā gāng chī wán fàn.', 'He has just finished eating.'),
    ],
  },
  // HSK2 多
  'hsk2-i-451b1366': {
    structure: '(有) + 多 + Adj？   e.g. 多大 / 多高 / 多远 / 多长时间',
    explanation:
      'Before a one-syllable adjective, 多 asks \'how\' about a degree or measurement, such as age, height or distance. The adjective is normally the \'positive\' pole (多高, not 多矮) unless the speaker presupposes it. In exclamations, 多 + Adj + 啊 means \'how ...!\'.',
    examples: [
      ex('你今年多大？', 'nǐ jīnnián duō dà?', 'How old are you this year?'),
      ex('你家离学校多远？', 'nǐ jiā lí xuéxiào duō yuǎn?', 'How far is your home from the school?'),
    ],
  },
  // HSK2 一样
  'hsk2-i-60d4059c': {
    structure: 'A + 跟 / 和 + B + (不) 一样 (+ Adj)',
    explanation:
      'Compares two things as being the same, optionally in a specific respect given by an adjective after it. Negate with 不一样, placing 不 before 一样, not before 跟. It differs from 比, which expresses a difference in degree.',
    examples: [
      ex('我的手机跟你的一样。', 'wǒ de shǒujī gēn nǐ de yíyàng.', 'My phone is the same as yours.'),
      ex('弟弟和哥哥一样高。', 'dìdi hé gēge yíyàng gāo.', 'The younger brother is as tall as the older one.'),
    ],
  },
  // HSK2 有点
  'hsk2-i-db52d560': {
    meaning: 'a bit, somewhat (usually undesirable)',
    structure: 'Subj + 有点(儿) + Adj / V',
    explanation:
      'Goes before an adjective or feeling verb to say \'a bit\', usually implying the situation is undesirable. A common mistake is confusing it with 一点(儿), which follows an adjective in comparisons or requests (便宜一点), not before it.',
    examples: [
      ex('今天有点冷。', 'jīntiān yǒudiǎn lěng.', 'It\'s a bit cold today.'),
      ex('这件衣服有点贵。', 'zhè jiàn yīfu yǒudiǎn guì.', 'This piece of clothing is a bit expensive.'),
    ],
  },
  // HSK2 不太
  'hsk2-i-7ce37a8b': {
    structure: '不太 + Adj / psychological V',
    explanation:
      'A mild, polite negation meaning \'not very\' or \'not really\', placed before an adjective or verb like 喜欢. Word order matters: 太不 + Adj means \'extremely not\' (太不好了). It is common in speech to soften a criticism.',
    examples: [
      ex('这个菜不太好吃。', 'zhège cài bú tài hǎochī.', 'This dish isn\'t very tasty.'),
      ex('我不太喜欢喝咖啡。', 'wǒ bú tài xǐhuan hē kāfēi.', 'I don\'t really like drinking coffee.'),
    ],
  },
  // HSK2 跟
  'hsk2-i-af692183': {
    structure: 'A + 跟 + B (+ 一起) + V   |   跟 + Person + 说',
    explanation:
      'A preposition linking a companion or addressee to the verb; the 跟 phrase goes before the verb, never after it. It is close to 和 but more colloquial, and it also marks who you talk to (跟他说). Negation goes before 跟: 我没跟他去.',
    examples: [
      ex('我跟朋友一起去看电影。', 'wǒ gēn péngyou yìqǐ qù kàn diànyǐng.', 'I\'m going to see a film with a friend.'),
      ex('你跟老师说了吗？', 'nǐ gēn lǎoshī shuō le ma?', 'Did you tell the teacher?'),
    ],
  },
  // HSK2 可是
  'hsk2-i-0e015679': {
    structure: 'Clause 1，可是 + Clause 2',
    explanation:
      'Introduces a contrast at the start of the second clause. It is a bit more colloquial than 但是 and often sounds slightly regretful. It may pair with 虽然 in the first clause, but cannot replace 虽然 itself.',
    examples: [
      ex('我很想去，可是我没有时间。', 'wǒ hěn xiǎng qù, kěshì wǒ méiyǒu shíjiān.', 'I really want to go, but I don\'t have time.'),
      ex('这家饭馆很便宜，可是菜不太好吃。', 'zhè jiā fànguǎn hěn piányi, kěshì cài bú tài hǎochī.', 'This restaurant is cheap, but the food isn\'t very good.'),
    ],
  },
  // HSK2 但是
  'hsk2-i-1c2da40d': {
    structure: '(虽然) A，但是 + B',
    explanation:
      'The standard \'but\' conjunction, beginning the second clause and frequently paired with 虽然 in the first. It fits both speech and writing, slightly more formal than 可是. English learners often drop it after 虽然, but Chinese normally keeps both.',
    examples: [
      ex('虽然外面下雨，但是我们还是去了。', 'suīrán wàimiàn xià yǔ, dànshì wǒmen háishi qù le.', 'Although it was raining outside, we still went.'),
      ex('他很聪明，但是不太努力。', 'tā hěn cōngming, dànshì bú tài nǔlì.', 'He is clever, but not very hardworking.'),
    ],
  },
  // HSK2 以后
  'hsk2-i-ac5d03ec': {
    structure: 'V / Time + 以后，…   |   以后 + clause',
    explanation:
      'After a verb phrase or time word it means \'after\', and on its own at the start of a clause it means \'in the future, from now on\'. Unlike 后来, which only narrates past sequences, 以后 can refer to the future. Note the order: 下课以后, not 以后下课 for \'after class\'.',
    examples: [
      ex('下课以后，我们去打球吧。', 'xiàkè yǐhòu, wǒmen qù dǎ qiú ba.', 'Let\'s go play ball after class.'),
      ex('以后我想当老师。', 'yǐhòu wǒ xiǎng dāng lǎoshī.', 'In the future I want to be a teacher.'),
    ],
  },
  // HSK2 以前
  'hsk2-i-2642a9da': {
    structure: 'V / Time + 以前，…   |   Subj + 以前 + V',
    explanation:
      'Follows a verb phrase or time expression to mean \'before\', or stands alone meaning \'in the past, formerly\'. The clause comes first and 以前 last (睡觉以前), the reverse of English. 之前 is similar but a little more formal.',
    examples: [
      ex('睡觉以前，我喜欢看书。', 'shuìjiào yǐqián, wǒ xǐhuan kàn shū.', 'Before going to bed, I like to read.'),
      ex('我以前住在上海。', 'wǒ yǐqián zhù zài Shànghǎi.', 'I used to live in Shanghai.'),
    ],
  },
  // HSK2 刚才
  'hsk2-i-77db9826': {
    structure: '刚才 + Subj + V   |   Subj + 刚才 + V / 没 + V',
    explanation:
      'A time noun meaning \'a moment ago\', so it can stand before or after the subject and can be followed by negation (刚才我没听见). The adverb 刚 sits only right before the verb and cannot be negated. 刚才 only refers to the very recent past relative to now.',
    examples: [
      ex('刚才有人给你打电话。', 'gāngcái yǒu rén gěi nǐ dǎ diànhuà.', 'Someone called you just now.'),
      ex('你刚才说什么？', 'nǐ gāngcái shuō shénme?', 'What did you say just now?'),
    ],
  },
  // HSK2 啊
  'hsk2-i-925718be': {
    structure: 'Sentence + 啊 (！ / ？)',
    explanation:
      'A sentence-final particle that adds feeling: enthusiasm in exclamations, softness or impatience in questions, and friendliness in reminders. It is spoken and informal. Its sound often merges with the previous syllable, giving variants written 呀, 哇 or 哪.',
    examples: [
      ex('今天的天气真好啊！', 'jīntiān de tiānqì zhēn hǎo a!', 'The weather is really lovely today!'),
      ex('你怎么还不走啊？', 'nǐ zěnme hái bù zǒu a?', 'Why haven\'t you left yet?'),
    ],
  },
  // HSK2 得
  'hsk2-i-9c52fb11': {
    structure: 'V + 得 + (很) Adj   |   (V) + O + V + 得 + Adj',
    explanation:
      'Links a verb to a complement that describes how well or to what degree the action is done. If the verb has an object, repeat the verb before 得 (说汉语说得很好) or drop the first verb; you cannot put the object after 得. Do not confuse it with adverbial 地, which goes before the verb.',
    examples: [
      ex('他跑得很快。', 'tā pǎo de hěn kuài.', 'He runs fast.'),
      ex('她说汉语说得很好。', 'tā shuō Hànyǔ shuō de hěn hǎo.', 'She speaks Chinese very well.'),
    ],
  },
  // HSK2 地
  'hsk2-i-ede5b1e6': {
    structure: 'Adj / Adverbial phrase + 地 + V',
    explanation:
      'Turns an adjective or phrase into a manner adverbial placed before the verb. It is mainly a written distinction, since 的, 得 and 地 all sound like de. Contrast 得, which follows the verb and evaluates the result rather than the manner.',
    examples: [
      ex('他高兴地笑了。', 'tā gāoxìng de xiào le.', 'He laughed happily.'),
      ex('请你慢慢地说。', 'qǐng nǐ mànmàn de shuō.', 'Please speak slowly.'),
    ],
  },
  // HSK2 来
  'hsk2-i-4b1d6193': {
    structure: 'Subj + 来 + Place   |   V + (进/出/上/下) + 来',
    explanation:
      'As a main verb it means moving toward the speaker, with the destination right after it. After another verb it is a directional complement showing motion toward the speaker (进来, 拿来). Contrast 去, which shows motion away from the speaker.',
    examples: [
      ex('明天你来我家吧。', 'míngtiān nǐ lái wǒ jiā ba.', 'Come to my place tomorrow.'),
      ex('外面很冷，快进来吧！', 'wàimiàn hěn lěng, kuài jìnlai ba!', 'It\'s cold outside, come on in!'),
    ],
  },
  // HSK2 从来
  'hsk2-i-3737498c': {
    structure: 'Subj + 从来 + 不 + V   |   Subj + 从来 + 没(有) + V + 过',
    explanation:
      'Means \'ever\' and is almost always used with a negative to mean \'never\'. 从来不 describes a habit or principle, while 从来没…过 denies any past experience. It goes before the negation word, not after it.',
    examples: [
      ex('我从来不喝酒。', 'wǒ cónglái bù hē jiǔ.', 'I never drink alcohol.'),
      ex('他从来没去过中国。', 'tā cónglái méi qùguo Zhōngguó.', 'He has never been to China.'),
    ],
  },
  // HSK2 一起
  'hsk2-i-3a85181e': {
    structure: 'A + 跟 / 和 + B + 一起 + V',
    explanation:
      'An adverb meaning \'together\', placed before the verb and often after a 跟 or 和 phrase. English learners often put it at the end (吃饭一起 is wrong). It can also be a noun meaning \'the same place\' in phrases like 在一起.',
    examples: [
      ex('我们一起吃饭吧。', 'wǒmen yìqǐ chīfàn ba.', 'Let\'s eat together.'),
      ex('我和妈妈一起去超市。', 'wǒ hé māma yìqǐ qù chāoshì.', 'I\'m going to the supermarket with my mum.'),
    ],
  },
  // HSK2 到
  'hsk2-i-792bbe6e': {
    structure: 'Subj + 到 + Place   |   V + 到 + Place / Time   |   从 A 到 B',
    explanation:
      'As a verb it means \'to arrive at\'; after another verb it marks the endpoint of movement or time (走到, 工作到五点). It pairs with 从 to give a range. Unlike 去, which only names a direction, 到 stresses actually reaching the point.',
    examples: [
      ex('火车几点到北京？', 'huǒchē jǐ diǎn dào Běijīng?', 'What time does the train arrive in Beijing?'),
      ex('我们从九点工作到五点。', 'wǒmen cóng jiǔ diǎn gōngzuò dào wǔ diǎn.', 'We work from nine to five.'),
    ],
  },
  // HSK2 …不懂
  'hsk2-i-e2f1a60e': {
    structure: 'V (听/看) + 不懂   |   V + 得懂',
    explanation:
      'A potential complement saying someone is unable to understand by listening or reading. 不 goes between the verb and 懂; the positive form is 听得懂. Contrast 没听懂, which reports failing to understand on one occasion rather than general inability.',
    examples: [
      ex('他说得太快，我听不懂。', 'tā shuō de tài kuài, wǒ tīng bu dǒng.', 'He speaks too fast; I can\'t understand him.'),
      ex('这本书太难了，我看不懂。', 'zhè běn shū tài nán le, wǒ kàn bu dǒng.', 'This book is too hard; I can\'t understand it.'),
    ],
  },
  // HSK2 …完
  'hsk2-i-65d7005a': {
    structure: 'V + 完 (+ O) (+ 了)   |   没 + V + 完',
    explanation:
      'A result complement attached right after the verb, showing the action is finished. The object follows 完 and 了 usually closes the sentence. Negate with 没, not 不 (没写完), and use 得/不 in between for ability (做不完).',
    examples: [
      ex('我写完作业了。', 'wǒ xiě wán zuòyè le.', 'I\'ve finished my homework.'),
      ex('你吃完饭再看电视吧。', 'nǐ chī wán fàn zài kàn diànshì ba.', 'Finish eating before you watch TV.'),
    ],
  },
  // HSK2 一些
  'hsk2-i-b86b2e83': {
    structure: '(V) + 一些 + N   |   Adj + 一些',
    explanation:
      'An indefinite quantity word before a noun, meaning \'some, a few\'; it needs no other measure word. After an adjective it means \'a little more\' (便宜一些), like 一点. Unlike 有的, it can appear in object position.',
    examples: [
      ex('我买了一些水果。', 'wǒ mǎi le yìxiē shuǐguǒ.', 'I bought some fruit.'),
      ex('桌子上有一些书。', 'zhuōzi shang yǒu yìxiē shū.', 'There are some books on the table.'),
    ],
  },
  // HSK2 有的
  'hsk2-i-eea4b56f': {
    structure: '有的 + N + V …，有的 (+ N) + V …',
    explanation:
      'Picks out some members of a group, usually as the subject and often repeated to contrast subgroups. It normally cannot be used in object position (我买了有的书 is wrong; use 一些). It can also follow a topic: 这些苹果有的….',
    examples: [
      ex('有的学生喜欢运动，有的学生喜欢看书。', 'yǒude xuésheng xǐhuan yùndòng, yǒude xuésheng xǐhuan kàn shū.', 'Some students like sports, others like reading.'),
      ex('这些苹果有的很甜，有的很酸。', 'zhèxiē píngguǒ yǒude hěn tián, yǒude hěn suān.', 'Some of these apples are sweet and some are sour.'),
    ],
  },
  // HSK2 每
  'hsk2-i-7757f757': {
    structure: '每 + (Number) + MW + N + 都 + V',
    explanation:
      'Means \'every\' and goes before a measure word and noun; time words like 天 and 年 take no measure word (每天). It is usually reinforced by 都 before the verb. Do not attach it directly to most nouns (每人 is set, but 每书 is wrong).',
    examples: [
      ex('我每天都喝咖啡。', 'wǒ měi tiān dōu hē kāfēi.', 'I drink coffee every day.'),
      ex('每个人都有自己的爱好。', 'měi gè rén dōu yǒu zìjǐ de àihào.', 'Everyone has their own hobbies.'),
    ],
  },
  // HSK2 半
  'hsk2-i-2bff6583': {
    structure: '半 + MW + N   |   Number + MW + 半 (+ N)   |   Hour + 点半',
    explanation:
      'Before a measure word it means \'half a\' (半个小时); after a number and measure word it adds a half (一个半小时). In clock times, 点半 means half past. A common mistake is putting 半 before the number (半一个 is wrong).',
    examples: [
      ex('我等了一个半小时。', 'wǒ děng le yí gè bàn xiǎoshí.', 'I waited an hour and a half.'),
      ex('现在是三点半。', 'xiànzài shì sān diǎn bàn.', 'It\'s half past three now.'),
    ],
  },
  // HSK2 第
  'hsk2-i-dae828fe': {
    structure: '第 + Number (+ MW + N)',
    explanation:
      'A prefix turning a cardinal number into an ordinal (\'first, second\'). The measure word still follows (第一次, 第三个人). It is not used with 两: \'second\' is 第二, never 第两.',
    examples: [
      ex('这是我第一次来中国。', 'zhè shì wǒ dì-yī cì lái Zhōngguó.', 'This is my first time coming to China.'),
      ex('他在比赛中得了第二名。', 'tā zài bǐsài zhōng dé le dì-èr míng.', 'He came second in the competition.'),
    ],
  },
  // HSK2 快…了
  'hsk2-i-f3a9bb2f': {
    structure: '快 (+ 要) + V / Adj + 了',
    explanation:
      'Brackets a verb or adjective to say something will happen very soon; the final 了 is required. Unlike 就要…了, it cannot be preceded by a specific time word (明天快…了 is wrong). It is common in everyday speech.',
    examples: [
      ex('快下雨了，我们回家吧。', 'kuài xià yǔ le, wǒmen huí jiā ba.', 'It\'s about to rain, let\'s go home.'),
      ex('电影快开始了。', 'diànyǐng kuài kāishǐ le.', 'The film is about to start.'),
    ],
  },
  // HSK2 什么都
  'hsk2-i-f073354d': {
    structure: 'Subj + 什么 (+ N) + 都 + V   |   什么都 + 不 / 没 + V',
    explanation:
      'The question word 什么 plus 都 means \'everything\' in positive sentences and \'nothing\' with 不 or 没. The 什么 phrase must come before the verb, not after it (我吃什么都 is wrong). 也 can replace 都 in negative sentences.',
    examples: [
      ex('我不挑食，什么都吃。', 'wǒ bù tiāoshí, shénme dōu chī.', 'I\'m not picky; I eat anything.'),
      ex('他今天什么都没做。', 'tā jīntiān shénme dōu méi zuò.', 'He didn\'t do anything today.'),
    ],
  },
  // HSK2 别…了
  'hsk2-i-d040b9d9': {
    structure: '别 + V (+ O) + 了',
    explanation:
      'Tells someone to stop doing something they are already doing; the final 了 marks the change. Without 了, 别 + V is a general prohibition (\'don\'t\'). It is direct and colloquial; add 请 or 吧 to soften.',
    examples: [
      ex('别哭了，没事的。', 'bié kū le, méi shì de.', 'Stop crying, it\'s fine.'),
      ex('别玩手机了，快睡觉吧。', 'bié wán shǒujī le, kuài shuìjiào ba.', 'Stop playing on your phone and go to sleep.'),
    ],
  },
  // HSK3 不怎么
  'hsk3-i-9e09cd93': {
    structure: 'Subj + 不怎么 + Adj / V',
    explanation:
      'A soft negation before an adjective or verb meaning \'not very\' or \'not much/often\'. It is colloquial and close to 不太, but with action verbs it leans toward frequency (不怎么来). Do not confuse with the question 怎么 meaning \'how\'.',
    examples: [
      ex('我不怎么喜欢吃辣的。', 'wǒ bù zěnme xǐhuan chī là de.', 'I don\'t much like spicy food.'),
      ex('他最近不怎么来上课。', 'tā zuìjìn bù zěnme lái shàngkè.', 'He hasn\'t been coming to class much lately.'),
    ],
  },
  // HSK3 全
  'hsk3-i-32a6d731': {
    structure: '全 + N (\'the whole\')   |   Subj + 全 (+ 都) + V',
    explanation:
      'Before a noun it means \'the whole\' (全家, 全国); before a verb it means \'entirely, all\' and often pairs with 都. Unlike 所有, which counts separate members, 全 stresses a whole unit. It is neutral in register.',
    examples: [
      ex('全家人都在等你。', 'quán jiā rén dōu zài děng nǐ.', 'The whole family is waiting for you.'),
      ex('他说的话我全听懂了。', 'tā shuō de huà wǒ quán tīngdǒng le.', 'I understood everything he said.'),
    ],
  },
  // HSK3 正好
  'hsk3-i-9e26bf72': {
    structure: 'Subj + 正好 + V   |   V + 得正好   |   (Subj) + 正好',
    explanation:
      'As an adjective it means \'just right\' in size, time or amount; as an adverb before a verb it means \'as it happens, coincidentally\'. It is close to 刚好. Place it after the subject when it means coincidence.',
    examples: [
      ex('你来得正好，我们正要吃饭。', 'nǐ lái de zhènghǎo, wǒmen zhèng yào chīfàn.', 'You\'ve come at just the right time; we\'re about to eat.'),
      ex('我正好也要去银行，我们一起走吧。', 'wǒ zhènghǎo yě yào qù yínháng, wǒmen yìqǐ zǒu ba.', 'As it happens I\'m going to the bank too, let\'s walk together.'),
    ],
  },
  // HSK3 就是
  'hsk3-i-931fe70b': {
    structure: '就是 + N / clause   |   Subj + 就是 + 不 / 要 + V',
    explanation:
      'Emphatically identifies something (\'this is exactly ...\') or expresses stubborn insistence (\'I simply won\'t\'). It sits before the predicate and is stressed in speech. Do not confuse it with plain 是, which only links without emphasis.',
    examples: [
      ex('这就是我说的那家饭馆。', 'zhè jiù shì wǒ shuō de nà jiā fànguǎn.', 'This is exactly the restaurant I was talking about.'),
      ex('我就是不想去，你别问了。', 'wǒ jiù shì bù xiǎng qù, nǐ bié wèn le.', 'I just don\'t want to go, stop asking.'),
    ],
  },
  // HSK3 就要…了
  'hsk3-i-62748da0': {
    structure: '(Time) + Subj + 就要 + V + 了',
    explanation:
      'Indicates an imminent event and, unlike 快…了, can be preceded by a time word (下个月就要…了). It sounds a bit more definite than 快要. The final 了 is required.',
    examples: [
      ex('我们下个月就要毕业了。', 'wǒmen xià ge yuè jiù yào bìyè le.', 'We\'re graduating next month.'),
      ex('火车就要开了，快上车吧！', 'huǒchē jiù yào kāi le, kuài shàng chē ba!', 'The train is about to leave, get on quickly!'),
    ],
  },
  // HSK3 一下子
  'hsk3-i-fbe286fd': {
    structure: 'Subj + 一下子 (+ 就) + V / Adj + 了',
    explanation:
      'An adverb before the verb meaning \'suddenly, all at once\', stressing how quickly a change or action happened. It is colloquial and often followed by 就. Do not confuse it with 一下, which goes after a verb to mean \'briefly\'.',
    examples: [
      ex('天一下子就黑了。', 'tiān yíxiàzi jiù hēi le.', 'It suddenly got dark.'),
      ex('他一下子吃了五个包子。', 'tā yíxiàzi chī le wǔ gè bāozi.', 'He ate five buns in one go.'),
    ],
  },
  // HSK3 结果
  'hsk3-i-0a2c91ce': {
    structure: 'Clause 1，结果 + Clause 2 (outcome)',
    explanation:
      'Starts a clause stating how things turned out, often unexpectedly or badly. It is narrative and colloquial; 所以 instead states a logical consequence. 结果 can also be a plain noun meaning \'result\'.',
    examples: [
      ex('他没带伞，结果被雨淋了。', 'tā méi dài sǎn, jiéguǒ bèi yǔ lín le.', 'He didn\'t bring an umbrella and ended up getting soaked.'),
      ex('我们等了很久，结果他没来。', 'wǒmen děng le hěn jiǔ, jiéguǒ tā méi lái.', 'We waited a long time, and in the end he didn\'t come.'),
    ],
  },
  // HSK3 互相
  'hsk3-i-9bd98dd7': {
    structure: 'Plural Subj + 互相 + V (two-syllable)',
    explanation:
      'An adverb before the verb showing a reciprocal action; the subject must be plural. Do not place it after the verb or use it as an object (帮助互相 is wrong). It prefers two-syllable verbs like 帮助 or 了解.',
    examples: [
      ex('同学们应该互相帮助。', 'tóngxuémen yīnggāi hùxiāng bāngzhù.', 'Classmates should help each other.'),
      ex('他们互相看了一眼，都笑了。', 'tāmen hùxiāng kàn le yì yǎn, dōu xiào le.', 'They glanced at each other and both laughed.'),
    ],
  },
  // HSK3 够
  'hsk3-i-a69bf3c1': {
    structure: 'N + (不) 够   |   N + 够 + Person + V   |   V + 够',
    explanation:
      'As a predicate it means \'is enough\' and needs no 是 or 很. It can take a person plus verb (够我们吃) and serve as a complement after a verb (吃够了). 足够 is a more formal synonym.',
    examples: [
      ex('我带的钱不够。', 'wǒ dài de qián bú gòu.', 'I didn\'t bring enough money.'),
      ex('这些菜够我们四个人吃吗？', 'zhèxiē cài gòu wǒmen sì gè rén chī ma?', 'Is this food enough for the four of us?'),
    ],
  },
  // HSK3 最好
  'hsk3-i-86c8717c': {
    structure: '(Subj) + 最好 + V   |   最好 + Subj + V',
    explanation:
      'Gives advice: \'you\'d better\' or \'it\'s best to\'. It goes before the verb or at the start of the clause. Softer than 应该, it is a recommendation rather than an obligation; as an adjective 最好 also means \'the best\'.',
    examples: [
      ex('你最好早点儿睡觉。', 'nǐ zuìhǎo zǎo diǎnr shuìjiào.', 'You\'d better go to bed a bit earlier.'),
      ex('明天会下雨，你最好带伞。', 'míngtiān huì xià yǔ, nǐ zuìhǎo dài sǎn.', 'It\'ll rain tomorrow; you\'d better take an umbrella.'),
    ],
  },
  // HSK3 这样
  'hsk3-i-99f13929': {
    structure: '这样 + V   |   这样(的) + N   |   这样，…',
    explanation:
      'Before a verb it means \'in this way\'; before a noun with 的 it means \'such a\'; at the start of a clause it means \'in this case\'. 那样 is its \'that way\' counterpart. 这么 is mainly used before adjectives for degree.',
    examples: [
      ex('这个字应该这样写。', 'zhège zì yīnggāi zhèyàng xiě.', 'This character should be written like this.'),
      ex('我从来没见过这样的天气。', 'wǒ cónglái méi jiànguo zhèyàng de tiānqì.', 'I\'ve never seen weather like this.'),
    ],
  },
  // HSK3 老是
  'hsk3-i-e5d68f5a': {
    structure: 'Subj + 老是 + V / Adj',
    explanation:
      'A colloquial adverb meaning \'always, keep on\', usually expressing annoyance at a repeated habit. It sits before the verb. 总是 is more neutral in tone, so prefer 老是 when complaining.',
    examples: [
      ex('他老是迟到。', 'tā lǎoshì chídào.', 'He\'s always late.'),
      ex('你别老是玩游戏了。', 'nǐ bié lǎoshì wán yóuxì le.', 'Stop playing games all the time.'),
    ],
  },
  // HSK3 那么
  'hsk3-i-ab83326d': {
    structure: '那么 + Adj / V   |   A + 没有 + B + 那么 + Adj',
    explanation:
      'Points to a degree away from the speaker or already mentioned: \'that, so\'. It is common in 没有…那么 comparisons. At the start of a sentence it can also mean \'well then\'; 这么 is its \'this\' counterpart for present or nearby situations.',
    examples: [
      ex('北京的冬天没有哈尔滨那么冷。', 'Běijīng de dōngtiān méiyǒu Hā\'ěrbīn nàme lěng.', 'Winter in Beijing isn\'t as cold as in Harbin.'),
      ex('你怎么那么高兴？', 'nǐ zěnme nàme gāoxìng?', 'Why are you so happy?'),
    ],
  },
  // HSK3 这么
  'hsk3-i-369c11cb': {
    structure: '这么 + Adj / V   |   V + 得 + 这么 + Adj',
    explanation:
      'Means \'so, this\' for a degree in the here and now, placed before an adjective or verb. It often appears with 怎么 or 没想到 to express surprise. Use 这样 rather than 这么 before a noun with 的, and 那么 for something more distant.',
    examples: [
      ex('你怎么来得这么晚？', 'nǐ zěnme lái de zhème wǎn?', 'Why did you come so late?'),
      ex('我没想到这个问题这么难。', 'wǒ méi xiǎngdào zhège wèntí zhème nán.', 'I didn\'t expect this question to be so hard.'),
    ],
  },
  // HSK3 挺…的
  'hsk3-i-e8f971fe': {
    structure: 'Subj + 挺 + Adj / psychological V + 的',
    explanation:
      'A colloquial way to say \'quite, pretty\' around an adjective; the final 的 is common but optional. It is milder than 非常 and more casual than 很. It is mostly used with positive or neutral adjectives in speech.',
    examples: [
      ex('这家店的菜挺好吃的。', 'zhè jiā diàn de cài tǐng hǎochī de.', 'The food at this place is pretty good.'),
      ex('他人挺好的。', 'tā rén tǐng hǎo de.', 'He\'s quite a nice person.'),
    ],
  },
  // HSK3 比较
  'hsk3-i-ea940279': {
    structure: 'Subj + 比较 + Adj / V',
    explanation:
      'An adverb meaning \'fairly, relatively\' before an adjective or verb, implying an unstated comparison. It must not be combined with a 比 comparison (他比我比较高 is wrong). As a verb, 比较 also means \'to compare\'.',
    examples: [
      ex('今天比较冷，多穿点儿衣服。', 'jīntiān bǐjiào lěng, duō chuān diǎnr yīfu.', 'It\'s rather cold today; wear a bit more.'),
      ex('我比较喜欢喝茶。', 'wǒ bǐjiào xǐhuan hē chá.', 'I prefer drinking tea.'),
    ],
  },
  // HSK3 什么的
  'hsk3-i-db09f61b': {
    structure: 'A、B (、C) + 什么的',
    explanation:
      'Closes a list of examples to mean \'and so on, and stuff\'. It is colloquial and usually follows two or more items. 等等 is the more formal written equivalent.',
    examples: [
      ex('我买了苹果、香蕉什么的。', 'wǒ mǎi le píngguǒ, xiāngjiāo shénme de.', 'I bought apples, bananas and stuff.'),
      ex('周末我常常看书、打球什么的。', 'zhōumò wǒ chángcháng kàn shū, dǎ qiú shénme de.', 'At weekends I often read, play ball and so on.'),
    ],
  },
  // HSK3 之类的
  'hsk3-i-0ad2576f': {
    structure: 'A (、B) + 之类的 (+ N)',
    explanation:
      'Follows one or more examples to mean \'things like that\', and can directly modify a noun (之类的东西). It is a bit more flexible than 什么的, which normally ends a list. Register is everyday spoken to neutral.',
    examples: [
      ex('他喜欢看科幻电影之类的。', 'tā xǐhuan kàn kēhuàn diànyǐng zhīlèi de.', 'He likes sci-fi films and that sort of thing.'),
      ex('包里放了毛巾、牙刷之类的东西。', 'bāo lǐ fàng le máojīn, yáshuā zhīlèi de dōngxi.', 'The bag has towels, toothbrushes and things like that.'),
    ],
  },
  // HSK3 等等
  'hsk3-i-b5dbac66': {
    structure: 'A、B、C + 等等',
    explanation:
      'Ends a list of items to mean \'etc.\' and is suitable for writing and formal speech. A single 等 is also common and can directly precede a noun or a number summing up the list. In casual speech, 什么的 is more natural.',
    examples: [
      ex('超市里有水果、蔬菜、肉等等。', 'chāoshì lǐ yǒu shuǐguǒ, shūcài, ròu děngděng.', 'The supermarket has fruit, vegetables, meat and so on.'),
      ex('他去过很多国家，比如日本、韩国、泰国等等。', 'tā qùguo hěn duō guójiā, bǐrú Rìběn, Hánguó, Tàiguó děngděng.', 'He has been to many countries, such as Japan, Korea, Thailand and so on.'),
    ],
  },
  // HSK3 不过
  'hsk3-i-66093fb7': {
    structure: 'Clause 1，不过 + Clause 2',
    explanation:
      'Introduces a mild contrast or a reservation at the start of the second clause. It is gentler than 但是 and does not usually pair with 虽然. It is common in conversation when adding a small qualification.',
    examples: [
      ex('这件衣服很漂亮，不过有点贵。', 'zhè jiàn yīfu hěn piàoliang, búguò yǒudiǎn guì.', 'This outfit is pretty, though a bit expensive.'),
      ex('我可以帮你，不过今天不行。', 'wǒ kěyǐ bāng nǐ, búguò jīntiān bù xíng.', 'I can help you, just not today.'),
    ],
  },
  // HSK3 要不
  'hsk3-i-2b2c47f0': {
    structure: '要不 + suggestion (+ 吧)   |   A，要不 + B (otherwise)',
    explanation:
      'At the start of a clause it offers a suggestion (\'how about...\'), usually with 吧. Between clauses it means \'otherwise\', introducing what will happen if A is not done. It is colloquial; 不然 and 否则 are equivalents for \'otherwise\', the latter more formal.',
    examples: [
      ex('今天太累了，要不我们明天再去吧。', 'jīntiān tài lèi le, yàobù wǒmen míngtiān zài qù ba.', 'I\'m too tired today; how about we go tomorrow?'),
      ex('快点儿走，要不就迟到了。', 'kuài diǎnr zǒu, yàobù jiù chídào le.', 'Hurry up, or we\'ll be late.'),
    ],
  },
  // HSK3 还有
  'hsk3-i-1cb39e38': {
    structure: '…，还有 + N / clause   |   还有，…',
    explanation:
      'Adds another item or point, meaning \'and also\' or \'one more thing\'. It often starts a new sentence in speech to bring up something forgotten. 另外 is similar but more neutral, and 而且 links stronger additive arguments.',
    examples: [
      ex('我要一杯咖啡，还有一个面包。', 'wǒ yào yì bēi kāfēi, háiyǒu yí gè miànbāo.', 'I\'d like a coffee, and also a bread roll.'),
      ex('还有，明天别忘了带护照。', 'háiyǒu, míngtiān bié wàng le dài hùzhào.', 'One more thing: don\'t forget your passport tomorrow.'),
    ],
  },
  // HSK3 另外
  'hsk3-i-b1114175': {
    structure: '另外，+ clause   |   另外 + (Number) + MW + N',
    explanation:
      'At the start of a clause it means \'in addition, besides\'; before a measure word phrase it means \'the other\' or \'another\' (另外一个). It is neutral, fine in speech and writing. Unlike 别的, it can directly take a number and measure word.',
    examples: [
      ex('另外，我还想问一个问题。', 'lìngwài, wǒ hái xiǎng wèn yí gè wèntí.', 'Also, I\'d like to ask one more question.'),
      ex('我有两个妹妹，一个在北京，另外一个在上海。', 'wǒ yǒu liǎng gè mèimei, yí gè zài Běijīng, lìngwài yí gè zài Shànghǎi.', 'I have two younger sisters; one is in Beijing and the other is in Shanghai.'),
    ],
  },
  // HSK3 再说
  'hsk3-i-7e1f3631': {
    structure: 'Reason 1，再说 + Reason 2',
    explanation:
      'Adds a further reason supporting what was just said (\'besides, what\'s more\'). It is colloquial and usually starts the second clause, often followed by 也 or 还. As a verb phrase, 以后再说 means \'let\'s deal with it later\'.',
    examples: [
      ex('今天太晚了，再说外面还在下雨，你别走了。', 'jīntiān tài wǎn le, zàishuō wàimiàn hái zài xià yǔ, nǐ bié zǒu le.', 'It\'s too late today, and besides it\'s still raining, so don\'t leave.'),
      ex('这件衣服太贵了，再说我也不需要。', 'zhè jiàn yīfu tài guì le, zàishuō wǒ yě bù xūyào.', 'This is too expensive, and anyway I don\'t need it.'),
    ],
  },
  // HSK3 之前
  'hsk3-i-d1aa62c0': {
    structure: 'V / Time + 之前，…   |   之前 + clause',
    explanation:
      'Follows an event or time expression to mean \'before\', or stands alone as \'previously\'. It is a little more formal than 以前 and common in writing. The event comes first: 吃饭之前, not 之前吃饭 for \'before eating\'.',
    examples: [
      ex('吃饭之前要洗手。', 'chīfàn zhīqián yào xǐ shǒu.', 'You should wash your hands before eating.'),
      ex('三年之前，我还不会说汉语。', 'sān nián zhīqián, wǒ hái bú huì shuō Hànyǔ.', 'Three years ago, I still couldn\'t speak Chinese.'),
    ],
  },
  // HSK3 之后
  'hsk3-i-1bd19571': {
    structure: 'V / Time + 之后，…',
    explanation:
      'Placed after an event or time expression to mean \'after\'. It is slightly more formal than 以后 and can also follow a whole clause. Unlike 后来, it can describe future as well as past sequences.',
    examples: [
      ex('毕业之后，他去了上海工作。', 'bìyè zhīhòu, tā qù le Shànghǎi gōngzuò.', 'After graduating, he went to work in Shanghai.'),
      ex('下班之后，我常常去跑步。', 'xiàbān zhīhòu, wǒ chángcháng qù pǎobù.', 'After work I often go running.'),
    ],
  },
  // HSK3 以来
  'hsk3-i-e4abda32': {
    structure: '(自从) + Time point / Event + 以来，…',
    explanation:
      'Marks a period from a past starting point up to now, often with 自从 in front and 一直 or 都 in the main clause. It is somewhat formal. Do not use it for a future or completely finished period; for those use 以后 or 之后.',
    examples: [
      ex('自从上大学以来，他一直住在学校。', 'zìcóng shàng dàxué yǐlái, tā yìzhí zhù zài xuéxiào.', 'Ever since starting university, he has lived on campus.'),
      ex('今年以来，这里的天气一直很好。', 'jīnnián yǐlái, zhèlǐ de tiānqì yìzhí hěn hǎo.', 'The weather here has been good since the start of the year.'),
    ],
  },
  // HSK3 时
  'hsk3-i-a34801ad': {
    structure: 'V / Clause + 时，…',
    explanation:
      'A shorter, more written equivalent of …的时候, attached after a verb phrase or clause. It appears in notices, instructions and formal speech. Do not add 的 before 时 in this pattern.',
    examples: [
      ex('上课时请关掉手机。', 'shàngkè shí qǐng guāndiào shǒujī.', 'Please turn off your phone during class.'),
      ex('我到家时，大家已经睡了。', 'wǒ dào jiā shí, dàjiā yǐjīng shuì le.', 'When I got home, everyone was already asleep.'),
    ],
  },
  // HSK3 后来
  'hsk3-i-4858d49e': {
    structure: 'A。后来(，) + B (past)',
    explanation:
      'A time word meaning \'later on, afterwards\', used only for past events in a narrative. It starts the clause and cannot follow a verb. Contrast 以后, which can refer to the future and can follow a verb phrase.',
    examples: [
      ex('我们以前是同学，后来成了好朋友。', 'wǒmen yǐqián shì tóngxué, hòulái chéng le hǎo péngyou.', 'We used to be classmates and later became good friends.'),
      ex('他去年去了美国，后来怎么样了？', 'tā qùnián qù le Měiguó, hòulái zěnmeyàng le?', 'He went to America last year; what happened after that?'),
    ],
  },
  // HSK3 分之
  'hsk3-i-f783c7a2': {
    structure: 'Denominator + 分之 + Numerator   |   百分之 + N',
    explanation:
      'Expresses fractions and percentages, with the denominator said first, the reverse of English. 百分之二十 means 20 percent. The whole phrase can modify a noun with 的 or act as the object of verbs like 占 or 增加.',
    examples: [
      ex('班里三分之一的学生是外国人。', 'bān lǐ sān fēn zhī yī de xuésheng shì wàiguó rén.', 'A third of the students in the class are foreigners.'),
      ex('这件衣服的价格降低了百分之二十。', 'zhè jiàn yīfu de jiàgé jiàngdī le bǎi fēn zhī èrshí.', 'The price of this item dropped by twenty percent.'),
    ],
  },
  // HSK3 嘛
  'hsk3-i-4cc5c575': {
    structure: 'Sentence + 嘛',
    explanation:
      'A sentence-final particle suggesting something is obvious (\'after all, of course\') or softening a request or persuasion. It is colloquial. It is written differently from the question particle 吗 and does not form questions.',
    examples: [
      ex('他是老师嘛，当然知道。', 'tā shì lǎoshī ma, dāngrán zhīdào.', 'He\'s a teacher, of course he knows.'),
      ex('别生气嘛，我不是故意的。', 'bié shēngqì ma, wǒ bú shì gùyì de.', 'Come on, don\'t be angry, I didn\'t mean it.'),
    ],
  },
  // HSK3 关于
  'hsk3-i-bed172ef': {
    structure: '关于 + N + 的 + N   |   关于 + Topic，Clause',
    explanation:
      'Introduces the subject matter of something. It either modifies a noun with 的 (a book about X) or opens the sentence as a topic phrase. Unlike 对于, which marks the target of an attitude or action, 关于 only says what something is about.',
    examples: [
      ex('这是一本关于中国历史的书。', 'zhè shì yì běn guānyú Zhōngguó lìshǐ de shū.', 'This is a book about Chinese history.'),
      ex('关于这个问题，我们明天再讨论。', 'guānyú zhège wèntí, wǒmen míngtiān zài tǎolùn.', 'We will discuss this question again tomorrow.'),
    ],
  },
  // HSK3 直到
  'hsk3-i-4059c3b4': {
    structure: '直到 + Time/Event，Subj + 才 + V   |   V + 直到 + Time',
    explanation:
      'Marks the point up to which a situation lasts. At the start of a sentence it usually pairs with 才 to stress that something happened late (not until...). After a verb phrase it simply means until. Plain 到 can also mean until, but 直到 stresses the long stretch before the end point.',
    examples: [
      ex('我直到昨天才知道这件事。', 'wǒ zhídào zuótiān cái zhīdào zhè jiàn shì.', 'I did not find out about this until yesterday.'),
      ex('他每天工作，直到晚上十点。', 'tā měitiān gōngzuò, zhídào wǎnshang shí diǎn.', 'He works every day until ten at night.'),
    ],
  },
  // HSK3 为
  'hsk3-i-b7a385ec': {
    meaning: 'for (someone\'s sake / benefit)',
    structure: 'Subj + 为 + Person/Thing + V/Adj',
    explanation:
      'A preposition placed before the verb that marks who benefits from an action or what a feeling is directed at (do something for someone, be happy for someone). It is a little more formal than 给. For a stated goal (in order to), Chinese normally uses 为了 instead.',
    examples: [
      ex('妈妈为我做了一个蛋糕。', 'māma wèi wǒ zuò le yí ge dàngāo.', 'Mom made a cake for me.'),
      ex('大家都为你高兴。', 'dàjiā dōu wèi nǐ gāoxìng.', 'Everyone is happy for you.'),
    ],
  },
  // HSK3 不到
  'hsk3-i-b8240486': {
    structure: '不到 + Number/Amount/Time',
    explanation:
      'Placed before a quantity to say the real amount falls short of it (under, less than). It often appears with 还 (not yet even...). Do not confuse it with the potential complement V + 不到 (找不到 can\'t find), where 到 is a result of the verb.',
    examples: [
      ex('他来中国还不到一年。', 'tā lái Zhōngguó hái bú dào yì nián.', 'He has been in China for less than a year.'),
      ex('这本书不到二十块钱。', 'zhè běn shū bú dào èrshí kuài qián.', 'This book costs less than twenty yuan.'),
    ],
  },
  // HSK3 看起来
  'hsk3-i-1fbdf245': {
    structure: 'Subj + 看起来 + Adj/VP   |   看起来，Clause',
    explanation:
      'Describes how something looks or seems based on what you see. It goes after the subject (he looks tired) or at the start of the sentence (it looks like...). It is conversational. Compare 看来, which draws a conclusion from evidence rather than describing appearance.',
    examples: [
      ex('你今天看起来很累。', 'nǐ jīntiān kàn qǐlai hěn lèi.', 'You look tired today.'),
      ex('看起来要下雨了。', 'kàn qǐlai yào xià yǔ le.', 'It looks like it is going to rain.'),
    ],
  },
  // HSK3 让
  'hsk3-i-c0fec6a7': {
    structure: 'A + 让 + B + V/Adj',
    explanation:
      'Causative verb: A makes, lets or asks B do something, or A causes B to feel something. The person affected comes right after 让, followed by the action or state. 叫 is a more colloquial alternative for orders, and 使 is the written choice for causing emotions or results.',
    examples: [
      ex('老师让我们写一篇作文。', 'lǎoshī ràng wǒmen xiě yì piān zuòwén.', 'The teacher had us write an essay.'),
      ex('这个消息让他很高兴。', 'zhège xiāoxi ràng tā hěn gāoxìng.', 'This news made him very happy.'),
    ],
  },
  // HSK3 使
  'hsk3-i-f6901ca3': {
    structure: 'A + 使 + B + Adj/V',
    explanation:
      'Written causative: a cause (often an event or thing) brings about a change in B. It is mostly used for results and feelings, not for giving orders, so 老师使我们写作业 sounds wrong; use 让 or 叫 for commands. Common in formal speech and writing.',
    examples: [
      ex('运动使人健康。', 'yùndòng shǐ rén jiànkāng.', 'Exercise makes people healthy.'),
      ex('他的话使大家都很感动。', 'tā de huà shǐ dàjiā dōu hěn gǎndòng.', 'His words moved everyone.'),
    ],
  },
  // HSK3 经过
  'hsk3-i-bfc2cb15': {
    structure: '经过 + Place   |   经过 + Process/Time，Result',
    explanation:
      'As a verb it means to pass by or through a place. As a preposition at the start of a sentence it introduces a process, effort or period that led to the result in the main clause (after/through...). 通过 is similar but focuses on the means used rather than the process gone through.',
    examples: [
      ex('我每天上班都经过这家书店。', 'wǒ měitiān shàngbān dōu jīngguò zhè jiā shūdiàn.', 'I pass this bookstore every day on my way to work.'),
      ex('经过三年的努力，他终于学会了中文。', 'jīngguò sān nián de nǔlì, tā zhōngyú xuéhuì le Zhōngwén.', 'After three years of hard work, he finally learned Chinese.'),
    ],
  },
  // HSK3 来自
  'hsk3-i-16593aa8': {
    structure: 'Subj + 来自 + Place/Source',
    explanation:
      'A compact, somewhat formal verb meaning to come from; the place follows directly with no 从 in front. In everyday speech people more often say 从 + Place + 来 or 是 + Place + 人. It can also describe the source of things, such as ideas or data.',
    examples: [
      ex('我来自日本。', 'wǒ láizì Rìběn.', 'I come from Japan.'),
      ex('这些学生来自不同的国家。', 'zhèxiē xuésheng láizì bùtóng de guójiā.', 'These students come from different countries.'),
    ],
  },
  // HSK3 算
  'hsk3-i-2ae146c3': {
    structure: 'A + 算(是) + B   |   不算 + Adj',
    explanation:
      'Used as a verb to say that something counts as or can be regarded as something, often with a modest or hedged tone. 不算 + Adj means not really (not considered expensive). The original sense of calculating (算钱) is the same character but a different use.',
    examples: [
      ex('这个价钱不算贵。', 'zhège jiàqian bú suàn guì.', 'This price is not really expensive.'),
      ex('我在北京住了五年，也算半个北京人了。', 'wǒ zài Běijīng zhù le wǔ nián, yě suàn bàn ge Běijīng rén le.', 'I have lived in Beijing for five years, so I count as half a Beijinger.'),
    ],
  },
  // HSK3 不用
  'hsk3-i-78ac1ae0': {
    structure: 'Subj + 不用 + V',
    explanation:
      'Placed before a verb to say an action is unnecessary. It is the negative of 需要 / 得 (děi). Do not mix it up with 不要 or 别, which forbid an action; 不用来 means you do not have to come, while 不要来 means do not come.',
    examples: [
      ex('你不用担心，我自己可以去。', 'nǐ búyòng dānxīn, wǒ zìjǐ kěyǐ qù.', 'You do not need to worry; I can go by myself.'),
      ex('明天是周末，不用上班。', 'míngtiān shì zhōumò, búyòng shàngbān.', 'Tomorrow is the weekend, so there is no need to go to work.'),
    ],
  },
  // HSK3 所有
  'hsk3-i-eba4161d': {
    structure: '所有(的) + N + 都 + V',
    explanation:
      'An adjective-like word placed before a noun to mean all of a group; 的 is optional and the verb usually takes 都. It cannot stand alone as a pronoun the way English all can; use 大家 for people or 一切 for everything.',
    examples: [
      ex('所有的学生都来了。', 'suǒyǒu de xuésheng dōu lái le.', 'All the students have come.'),
      ex('我把所有的问题都回答了。', 'wǒ bǎ suǒyǒu de wèntí dōu huídá le.', 'I answered all the questions.'),
    ],
  },
  // HSK3 之一
  'hsk3-i-c1909fc5': {
    structure: 'A 是 + (Adj 的) + N + 之一',
    explanation:
      'Goes at the end of a noun phrase to mean one of the group, usually after a superlative with 最. It is slightly formal but common in speech. A common learner mistake is to put 之一 before the noun as in English; it must come last.',
    examples: [
      ex('长城是中国最有名的地方之一。', 'Chángchéng shì Zhōngguó zuì yǒumíng de dìfang zhī yī.', 'The Great Wall is one of the most famous places in China.'),
      ex('他是我最好的朋友之一。', 'tā shì wǒ zuì hǎo de péngyou zhī yī.', 'He is one of my best friends.'),
    ],
  },
  // HSK3 不是…吗？
  'hsk3-i-719539cf': {
    structure: 'Subj + 不是 + VP/N + 吗？',
    explanation:
      'A rhetorical question that reminds the listener of something both people should already know, often with surprise or mild complaint (didn\'t you say...?). The speaker expects agreement, not a real answer. It is far stronger than a plain 是…吗 question.',
    examples: [
      ex('你不是说今天不来吗？', 'nǐ bú shì shuō jīntiān bù lái ma?', 'Didn\'t you say you weren\'t coming today?'),
      ex('这不是你的书吗？', 'zhè bú shì nǐ de shū ma?', 'Isn\'t this your book?'),
    ],
  },
  // HSK3 想…就…
  'hsk3-i-b25fc875': {
    structure: '想 + V (+ QW) + 就 + V (+ QW)',
    explanation:
      'Repeats the same verb (often with the same question word) around 想 and 就 to say someone can do whatever, whenever or however they like. It is casual and spoken, and often used to give permission (想去就去吧) or to describe freedom.',
    examples: [
      ex('你想吃什么就吃什么。', 'nǐ xiǎng chī shénme jiù chī shénme.', 'Eat whatever you like.'),
      ex('周末我想几点起床就几点起床。', 'zhōumò wǒ xiǎng jǐ diǎn qǐchuáng jiù jǐ diǎn qǐchuáng.', 'On weekends I get up whenever I want.'),
    ],
  },
  // HSK3 不是不
  'hsk3-i-da193399': {
    structure: 'Subj + 不是不 + V/Adj，(而)是/只是 …',
    explanation:
      'Denies a negative assumption: it is not that someone does not want to or cannot; the real reason follows. It softens refusals and explanations in speech. Do not confuse it with 不得不 (have no choice but to), which is a different double negative.',
    examples: [
      ex('我不是不想去，是没有时间。', 'wǒ bú shì bù xiǎng qù, shì méiyǒu shíjiān.', 'It\'s not that I don\'t want to go; I just don\'t have time.'),
      ex('他不是不喜欢你，只是不太会说话。', 'tā bú shì bù xǐhuan nǐ, zhǐshì bú tài huì shuōhuà.', 'It\'s not that he doesn\'t like you; he\'s just not good with words.'),
    ],
  },
  // HSK3 连…都…
  'hsk3-i-3dcc2b02': {
    structure: '连 + N/VP + 都/也 + V',
    explanation:
      'Highlights an extreme case: even X does or does not do something, implying everything else follows. 连 goes before the emphasized item, which comes before the verb, and 都 or 也 must follow. Leaving out 都/也 is a frequent mistake.',
    examples: [
      ex('他连自己的名字都不会写。', 'tā lián zìjǐ de míngzi dōu bú huì xiě.', 'He can\'t even write his own name.'),
      ex('这个问题连老师都不知道。', 'zhège wèntí lián lǎoshī dōu bù zhīdào.', 'Even the teacher doesn\'t know the answer to this question.'),
    ],
  },
  // HSK3 倍
  'hsk3-i-a1f58208': {
    structure: 'A 是 B 的 + Num + 倍   |   A 比 B + Adj/V + 了 + Num + 倍',
    explanation:
      'A measure word for multiples. A 是 B 的两倍 means A is twice B. Be careful with 增加了一倍 or 多了一倍: it means increased by one times the original, so doubled, not tripled. It is used in both speech and writing.',
    examples: [
      ex('这个房间是那个房间的两倍大。', 'zhège fángjiān shì nàge fángjiān de liǎng bèi dà.', 'This room is twice as big as that one.'),
      ex('今年的学生比去年多了一倍。', 'jīnnián de xuésheng bǐ qùnián duō le yí bèi.', 'There are twice as many students this year as last year.'),
    ],
  },
  // HSK3 一点也不
  'hsk3-i-135786f5': {
    structure: '一点(儿) + 也/都 + 不 + Adj/V',
    explanation:
      'Emphatic negation: not at all, not even a little. It goes before the adjective or verb, and 也 and 都 are interchangeable. With past actions use 没 instead (一点也没变). Do not say 不一点, which is a common mistake.',
    examples: [
      ex('这个菜一点也不辣。', 'zhège cài yìdiǎn yě bú là.', 'This dish isn\'t spicy at all.'),
      ex('我一点也不累。', 'wǒ yìdiǎn yě bú lèi.', 'I\'m not tired at all.'),
    ],
  },
  // HSK3 来说
  'hsk3-i-a49f6a22': {
    structure: '对 + Person + 来说，Comment   |   一般来说，Clause',
    explanation:
      'Closes a phrase that sets the point of view or scope of a statement (for me, generally speaking). The frame comes at the start of the sentence before the comment. Do not drop 对: 我来说 alone is wrong. 而言 is the more written equivalent.',
    examples: [
      ex('对我来说，学汉字很难。', 'duì wǒ lái shuō, xué Hànzì hěn nán.', 'For me, learning Chinese characters is hard.'),
      ex('一般来说，南方人喜欢吃米饭。', 'yìbān lái shuō, nánfāng rén xǐhuan chī mǐfàn.', 'Generally speaking, southerners like to eat rice.'),
    ],
  },
  // HSK3 跟…比
  'hsk3-i-cda72ef2': {
    structure: '跟 + B + 比(起来)，A + Adj   |   A + 跟 + B + 比 + Adj',
    explanation:
      'Sets up a comparison by naming the thing compared against first; the result follows as a separate comment. It is conversational and more flexible than a plain 比 sentence. As with 比, do not use 很 before the adjective; use 多了 or 一点儿 for degree.',
    examples: [
      ex('跟去年比，今年的天气暖和多了。', 'gēn qùnián bǐ, jīnnián de tiānqì nuǎnhuo duō le.', 'Compared with last year, the weather this year is much warmer.'),
      ex('跟我哥哥比，我的个子矮一点儿。', 'gēn wǒ gēge bǐ, wǒ de gèzi ǎi yìdiǎnr.', 'Compared with my older brother, I\'m a bit shorter.'),
    ],
  },
  // HSK3 多了
  'hsk3-i-751b58ec': {
    structure: '(A 比 B) + Adj + 多了',
    explanation:
      'Placed after an adjective to say the difference is large (much more...), either in a 比 comparison or about a change over time. Learners often wrongly put 很 or 非常 before the adjective in 比 sentences; use 多了 or 得多 after it instead.',
    examples: [
      ex('今天比昨天冷多了。', 'jīntiān bǐ zuótiān lěng duō le.', 'Today is much colder than yesterday.'),
      ex('吃了药以后，我好多了。', 'chī le yào yǐhòu, wǒ hǎo duō le.', 'After taking the medicine, I feel much better.'),
    ],
  },
  // HSK3 是…是…
  'hsk3-i-8caf242e': {
    structure: 'X + 是 + X，可是/但是/就是 + Contrast',
    explanation:
      'Repeats an adjective or verb around 是 to grant a point before raising an objection (it is X, sure, but...). The second clause usually starts with 可是, 但是 or 就是. It is spoken in tone and signals reluctance; without the contrast clause the sentence feels unfinished.',
    examples: [
      ex('这件衣服好看是好看，就是太贵了。', 'zhè jiàn yīfu hǎokàn shì hǎokàn, jiùshì tài guì le.', 'This outfit looks nice, sure, but it\'s too expensive.'),
      ex('中文难是难，但是很有意思。', 'Zhōngwén nán shì nán, dànshì hěn yǒu yìsi.', 'Chinese is hard, all right, but it\'s really interesting.'),
    ],
  },
  // HSK3 要么…要么…
  'hsk3-i-85d23713': {
    structure: '要么 + A，要么 + B',
    explanation:
      'Presents two (sometimes more) options where one must be chosen, often with a firm or impatient tone: it is either this or that, nothing else. Each option is a full verb phrase or clause. 或者 is a softer or, and 还是 is used in questions.',
    examples: [
      ex('要么你来我家，要么我去你家。', 'yàome nǐ lái wǒ jiā, yàome wǒ qù nǐ jiā.', 'Either you come to my place or I go to yours.'),
      ex('周末他要么在家看书，要么去公园跑步。', 'zhōumò tā yàome zài jiā kàn shū, yàome qù gōngyuán pǎobù.', 'On weekends he either reads at home or goes running in the park.'),
    ],
  },
  // HSK3 还好
  'hsk3-i-143f2352': {
    structure: '还好，Clause   |   Subj + 还好',
    explanation:
      'At the start of a sentence it expresses relief that a bad outcome was avoided (luckily, good thing). After a subject it can also mean not bad, OK. It is spoken; 幸亏 and 幸好 are close synonyms, with 幸亏 often paired with 不然 or 才.',
    examples: [
      ex('还好我带了伞，不然就淋湿了。', 'háihǎo wǒ dài le sǎn, bùrán jiù lín shī le.', 'Luckily I brought an umbrella, otherwise I would have got soaked.'),
      ex('还好你提醒了我，我差点忘了。', 'háihǎo nǐ tíxǐng le wǒ, wǒ chàdiǎn wàng le.', 'Good thing you reminded me; I almost forgot.'),
    ],
  },
  // HSK3 怪不得
  'hsk3-i-8ebc66de': {
    structure: '(Reason)，怪不得 + Result   |   怪不得 + Result，原来 + Reason',
    explanation:
      'Expresses sudden understanding: now that the speaker knows the reason, the situation is no longer surprising. It normally starts the clause describing the puzzling result, and is often paired with 原来. 难怪 means the same and is slightly more neutral in register.',
    examples: [
      ex('他在中国住了十年，怪不得中文这么好。', 'tā zài Zhōngguó zhù le shí nián, guàibude Zhōngwén zhème hǎo.', 'He lived in China for ten years; no wonder his Chinese is so good.'),
      ex('外面下雪了，怪不得这么冷。', 'wàimiàn xià xuě le, guàibude zhème lěng.', 'It\'s snowing outside; no wonder it\'s so cold.'),
    ],
  },
  // HSK3 一方面…一方面…
  'hsk3-i-ced8d5c8': {
    structure: '一方面 + A，(另)一方面 + B',
    explanation:
      'Links two aspects, reasons or attitudes that exist at the same time. The second part is often 另一方面 and may add 又 or 也. Unlike English on the other hand, it does not have to signal contrast; it frequently lists two complementary reasons.',
    examples: [
      ex('我学中文，一方面是为了工作，一方面是因为喜欢中国文化。', 'wǒ xué Zhōngwén, yì fāngmiàn shì wèile gōngzuò, yì fāngmiàn shì yīnwèi xǐhuan Zhōngguó wénhuà.', 'I study Chinese partly for work and partly because I like Chinese culture.'),
      ex('他一方面想出国留学，另一方面又不想离开家人。', 'tā yì fāngmiàn xiǎng chūguó liúxué, lìng yì fāngmiàn yòu bù xiǎng líkāi jiārén.', 'On the one hand he wants to study abroad; on the other, he doesn\'t want to leave his family.'),
    ],
  },
  // HSK3 等到
  'hsk3-i-022b0fa3': {
    structure: '等到 + Clause/Time，Subj + 才/就/已经 + VP',
    explanation:
      'Opens a time clause that marks the moment something else happens or has already happened (by the time, once). The main clause often contains 才, 就 or 已经. Compared with 当…的时候, it stresses waiting for a point to arrive rather than a simple when.',
    examples: [
      ex('等到我到车站，火车已经开走了。', 'děngdào wǒ dào chēzhàn, huǒchē yǐjīng kāi zǒu le.', 'By the time I got to the station, the train had already left.'),
      ex('等到你长大了，就会明白。', 'děngdào nǐ zhǎng dà le, jiù huì míngbai.', 'When you grow up, you\'ll understand.'),
    ],
  },
  // HSK4 得不得了
  'hsk4-i-19c46c66': {
    structure: 'Adj/Psych V + 得不得了',
    explanation:
      'A degree complement placed after an adjective or feeling verb to mean extremely, beyond words. It is lively and spoken, stronger than 得很 and similar to 极了. The adjective cannot also take 很 in front (not 很高兴得不得了).',
    examples: [
      ex('听到这个消息，她高兴得不得了。', 'tīngdào zhège xiāoxi, tā gāoxìng de bùdéliǎo.', 'When she heard the news, she was absolutely thrilled.'),
      ex('今天热得不得了。', 'jīntiān rè de bùdéliǎo.', 'It\'s incredibly hot today.'),
    ],
  },
  // HSK4 得很
  'hsk4-i-aba31bcb': {
    structure: 'Adj/Psych V + 得很',
    explanation:
      'A degree complement after an adjective meaning very, quite. Compared with putting 很 before the adjective, where 很 is often weak and almost automatic, 得很 carries real emphasis. It is common in speech and northern usage, and milder than 得不得了 or 极了.',
    examples: [
      ex('这里的风景美得很。', 'zhèlǐ de fēngjǐng měi de hěn.', 'The scenery here is really beautiful.'),
      ex('他最近忙得很，没时间玩。', 'tā zuìjìn máng de hěn, méi shíjiān wán.', 'He\'s very busy lately and has no time for fun.'),
    ],
  },
  // HSK4 了点儿
  'hsk4-i-14a0b5cc': {
    structure: 'Adj + 了 + (一)点儿',
    explanation:
      'Placed after an adjective to say something is slightly too much for what is needed (a bit too big, too salty), usually as a mild complaint. Without 了, Adj + 一点儿 is a neutral comparison (a bit bigger). 有点儿 + Adj also complains but goes before the adjective.',
    examples: [
      ex('这双鞋大了点儿。', 'zhè shuāng xié dà le diǎnr.', 'These shoes are a bit too big.'),
      ex('汤咸了点儿，下次少放点盐。', 'tāng xián le diǎnr, xià cì shǎo fàng diǎn yán.', 'The soup is a little too salty; put less salt in next time.'),
    ],
  },
  // HSK4 有的是
  'hsk4-i-2a3175c5': {
    structure: 'Subj + 有的是 + N   |   N + 有的是',
    explanation:
      'A spoken verb phrase meaning to have plenty of, often with a confident or reassuring tone (there\'s no shortage). The noun can follow it or be moved to the front as a topic. Do not confuse it with 有的 (some) followed by 是 in sentences like 有的是学生.',
    examples: [
      ex('别着急，我们有的是时间。', 'bié zháojí, wǒmen yǒudeshì shíjiān.', 'Don\'t worry, we have plenty of time.'),
      ex('这种书图书馆里有的是。', 'zhè zhǒng shū túshūguǎn lǐ yǒudeshì.', 'The library has plenty of books like this.'),
    ],
  },
  // HSK4 看来
  'hsk4-i-d60cc674': {
    structure: '(Evidence)，看来 + Conclusion',
    explanation:
      'Introduces a conclusion drawn from the situation (it seems, apparently). It usually begins the second clause or the sentence. Unlike 看起来, which describes how something looks, 看来 is about reasoning from evidence; 看上去 is closer to 看起来.',
    examples: [
      ex('他还没来，看来今天不会来了。', 'tā hái méi lái, kànlái jīntiān bú huì lái le.', 'He still hasn\'t come; it seems he won\'t come today.'),
      ex('看来你已经准备好了。', 'kànlái nǐ yǐjīng zhǔnbèi hǎo le.', 'It looks like you\'re already prepared.'),
    ],
  },
  // HSK4 可
  'hsk4-i-cdb1d49b': {
    structure: 'Subj + 可 + Adj + 了   |   可 + 别/要 + V',
    explanation:
      'A spoken adverb before an adjective or verb that adds strong emphasis (really, so); with adjectives it usually ends in 了 or 啦, and in commands it makes them urgent (可别忘了). It differs from 可(是) meaning but, which joins clauses, and from 可以 meaning can.',
    examples: [
      ex('这个电影可好看了！', 'zhège diànyǐng kě hǎokàn le!', 'This movie is really good!'),
      ex('你可别忘了带护照。', 'nǐ kě bié wàng le dài hùzhào.', 'Whatever you do, don\'t forget your passport.'),
    ],
  },
  // HSK4 再不…就…
  'hsk4-i-5a4d7428': {
    meaning: 'if (still) not … then … (warning)',
    structure: '(Subj) + 再不 + V，就 + (要) + Result + 了',
    explanation:
      'A warning: if someone keeps failing to do something, a bad result will follow. 再不 goes before the verb in the first clause and 就 introduces the consequence, often with 要…了. It is spoken and urgent; 如果不…就… is the neutral version.',
    examples: [
      ex('你再不起床就要迟到了。', 'nǐ zài bù qǐchuáng jiù yào chídào le.', 'If you don\'t get up now, you\'ll be late.'),
      ex('我们再不走就赶不上飞机了。', 'wǒmen zài bù zǒu jiù gǎn bu shàng fēijī le.', 'If we don\'t leave now, we\'ll miss the plane.'),
    ],
  },
  // HSK4 差点没
  'hsk4-i-f8b53e00': {
    structure: 'Subj + 差点(儿)没 + V',
    explanation:
      'Its meaning depends on whether the outcome is wanted. With an unwanted outcome (fall, cry), 差点没 equals 差点: it almost happened but did not. With a wanted outcome (catch the bus), it means narrowly managed to do it. It is spoken.',
    examples: [
      ex('路太滑了，我差点没摔倒。', 'lù tài huá le, wǒ chàdiǎn méi shuāi dǎo.', 'The road was so slippery that I almost fell.'),
      ex('我们差点没赶上最后一班车。', 'wǒmen chàdiǎn méi gǎn shàng zuìhòu yì bān chē.', 'We only just managed to catch the last bus.'),
    ],
  },
  // HSK4 尽管
  'hsk4-i-a45d29c6': {
    meaning: 'feel free to; although',
    structure: '尽管 + V (invitation)   |   尽管 + A，但是/还是 + B',
    explanation:
      'As an adverb before a verb it means feel free to, do not hesitate, in friendly offers. As a conjunction it means although, paired with 但是, 可是 or 还是 in the next clause; that use is more formal than 虽然. Context and position tell the two apart.',
    examples: [
      ex('有什么问题尽管问我。', 'yǒu shénme wèntí jǐnguǎn wèn wǒ.', 'If you have any questions, feel free to ask me.'),
      ex('尽管下着大雨，他还是去上班了。', 'jǐnguǎn xià zhe dà yǔ, tā háishi qù shàngbān le.', 'Even though it was pouring, he still went to work.'),
    ],
  },
  // HSK4 究竟
  'hsk4-i-8ac1d027': {
    meaning: 'exactly / on earth (in questions)',
    structure: 'Subj + 究竟 + QW/A不A … ？',
    explanation:
      'Used mainly in questions to press for the real answer (exactly, on earth). It goes before the question word or verb and cannot be used in 吗 questions. It is the more written counterpart of 到底; it can also mean after all in statements, but that use is rarer.',
    examples: [
      ex('你究竟想要什么？', 'nǐ jiūjìng xiǎng yào shénme?', 'What on earth do you want?'),
      ex('这件事究竟是谁做的？', 'zhè jiàn shì jiūjìng shì shéi zuò de?', 'Who exactly did this?'),
    ],
  },
  // HSK4 干脆
  'hsk4-i-04436c21': {
    structure: '(Situation)，Subj + 干脆 + VP (+ 吧)',
    explanation:
      'An adverb before a verb phrase meaning just, simply, why not: it proposes a direct, decisive solution after hesitation or trouble. It often ends with 吧. As an adjective it describes a straightforward person or answer (他说话很干脆).',
    examples: [
      ex('既然下雨了，我们干脆在家看电影吧。', 'jìrán xià yǔ le, wǒmen gāncuì zài jiā kàn diànyǐng ba.', 'Since it\'s raining, let\'s just stay home and watch a movie.'),
      ex('这台电脑太旧了，干脆买台新的吧。', 'zhè tái diànnǎo tài jiù le, gāncuì mǎi tái xīn de ba.', 'This computer is too old; why not just buy a new one?'),
    ],
  },
  // HSK4 再也不…了
  'hsk4-i-edb28843': {
    structure: 'Subj + 再也不 + V + 了   |   Subj + 再也没 + V + 过',
    explanation:
      'A strong declaration that something will never happen again, often after a bad experience. 再也 must come before 不, and 了 marks the new situation. For things that did not happen again in the past, use 再也没(有) + V (+ 过).',
    examples: [
      ex('我再也不吃这家饭馆的菜了。', 'wǒ zài yě bù chī zhè jiā fànguǎn de cài le.', 'I\'m never eating at this restaurant again.'),
      ex('我再也不相信他了。', 'wǒ zài yě bù xiāngxìn tā le.', 'I\'ll never trust him again.'),
    ],
  },
  // HSK4 再三
  'hsk4-i-d870b2bb': {
    structure: '再三 + V   |   V + 再三',
    explanation:
      'Means repeatedly, again and again, usually for deliberate acts like reminding, asking or thanking. It sits before the verb, or after a few verbs such as 考虑 (考虑再三). It is slightly formal; 一再 is similar but can also describe unwanted repetition.',
    examples: [
      ex('妈妈再三提醒我要带伞。', 'māma zàisān tíxǐng wǒ yào dài sǎn.', 'Mom reminded me again and again to bring an umbrella.'),
      ex('他考虑再三，最后决定留下来。', 'tā kǎolǜ zàisān, zuìhòu juédìng liú xiàlai.', 'After thinking it over repeatedly, he finally decided to stay.'),
    ],
  },
  // HSK4 一向
  'hsk4-i-a564b435': {
    structure: 'Subj + 一向 + Adj/VP',
    explanation:
      'An adverb meaning always, consistently, describing a long-standing habit or character trait up to now. It goes before the predicate. 一直 describes an uninterrupted action over a period and can refer to a short span; 一向 is about consistent character and is a bit more formal.',
    examples: [
      ex('他一向很准时。', 'tā yíxiàng hěn zhǔnshí.', 'He has always been punctual.'),
      ex('我一向不喜欢吃甜的。', 'wǒ yíxiàng bù xǐhuan chī tián de.', 'I\'ve never liked sweet things.'),
    ],
  },
  // HSK4 白
  'hsk4-i-4a1ae3cd': {
    structure: 'Subj + 白 + V (+ 了)',
    explanation:
      'An adverb before a verb meaning in vain, for nothing: the effort brought no result. It is spoken and usually followed by 了 or a duration. The same adverb can also mean free of charge (白吃, eat for free), so context decides the reading.',
    examples: [
      ex('他今天不在，我白跑了一趟。', 'tā jīntiān bú zài, wǒ bái pǎo le yí tàng.', 'He isn\'t in today, so I made the trip for nothing.'),
      ex('我白等了一个小时。', 'wǒ bái děng le yí ge xiǎoshí.', 'I waited an hour for nothing.'),
    ],
  },
  // HSK4 顺便
  'hsk4-i-1a08d63e': {
    structure: '(Main action)，Subj + 顺便 + VP',
    explanation:
      'An adverb before a verb phrase meaning while one is at it: a second task done conveniently along with the main one. The main activity is usually stated first. It is common in requests (顺便帮我…). Do not confuse it with 随便, which means casually or as you like.',
    examples: [
      ex('你去超市的时候，顺便帮我买瓶水。', 'nǐ qù chāoshì de shíhou, shùnbiàn bāng wǒ mǎi píng shuǐ.', 'When you go to the supermarket, could you pick up a bottle of water for me?'),
      ex('我去上海开会，顺便看看老朋友。', 'wǒ qù Shànghǎi kāihuì, shùnbiàn kànkan lǎo péngyou.', 'I\'m going to Shanghai for a meeting and will see some old friends while I\'m there.'),
    ],
  },
  // HSK4 难道
  'hsk4-i-94f1a1f8': {
    structure: '难道 + Clause + (吗)？',
    explanation:
      'Starts a rhetorical question that expresses disbelief; the implied answer is the opposite of what is asked (surely not...?). It goes before or after the subject, and 吗 or 不成 often closes the sentence. A positive question implies no, a negative one implies yes.',
    examples: [
      ex('难道你不知道明天要考试吗？', 'nándào nǐ bù zhīdào míngtiān yào kǎoshì ma?', 'Don\'t tell me you don\'t know there\'s an exam tomorrow?'),
      ex('这么简单的题，难道你也不会？', 'zhème jiǎndān de tí, nándào nǐ yě bú huì?', 'Surely you can do such an easy question?'),
    ],
  },
  // HSK4 当中
  'hsk4-i-b70efd6e': {
    structure: '(在) + N + 当中，Comment',
    explanation:
      'A location word placed after a group noun to mean among, in the middle of. It often appears with 在 at the start of the sentence before a superlative or selection. 之中 is more written; 中间 tends to mean a physical middle position.',
    examples: [
      ex('我们班的学生当中，他的中文最好。', 'wǒmen bān de xuésheng dāngzhōng, tā de Zhōngwén zuì hǎo.', 'Among the students in our class, his Chinese is the best.'),
      ex('在这些水果当中，我最喜欢苹果。', 'zài zhèxiē shuǐguǒ dāngzhōng, wǒ zuì xǐhuan píngguǒ.', 'Of all these fruits, I like apples best.'),
    ],
  },
  // HSK4 彼此
  'hsk4-i-6c155ffd': {
    structure: '彼此 + V   |   彼此(之间)的 + N',
    explanation:
      'A pronoun meaning each other, one another, used as subject, object or before 的. It is more formal than 互相, which is only an adverb before a verb; 彼此 can stand where a noun does (了解彼此). Said twice, 彼此彼此 is a polite reply meaning likewise.',
    examples: [
      ex('我们认识很多年了，彼此都很了解。', 'wǒmen rènshi hěn duō nián le, bǐcǐ dōu hěn liǎojiě.', 'We\'ve known each other for many years and understand each other well.'),
      ex('同事之间应该彼此帮助。', 'tóngshì zhījiān yīnggāi bǐcǐ bāngzhù.', 'Colleagues should help one another.'),
    ],
  },
  // HSK4 当…的时候
  'hsk4-i-1bb1cdda': {
    structure: '当 + Clause + 的时候，Main clause',
    explanation:
      'Frames a time clause (when, at the time that). 当 opens the clause and 的时候 closes it, and the whole frame comes before the main clause. In speech 当 is often dropped (我到家的时候…); keeping it sounds more careful or written.',
    examples: [
      ex('当我到家的时候，妈妈已经做好饭了。', 'dāng wǒ dào jiā de shíhou, māma yǐjīng zuò hǎo fàn le.', 'When I got home, Mom had already made dinner.'),
      ex('当你遇到困难的时候，可以给我打电话。', 'dāng nǐ yùdào kùnnan de shíhou, kěyǐ gěi wǒ dǎ diànhuà.', 'When you run into difficulties, you can call me.'),
    ],
  },
  // HSK4 其中
  'hsk4-i-c78428b1': {
    structure: '(Group)，其中 + Subset/Clause',
    explanation:
      'Refers back to a group just mentioned and picks out part of it (among them, of which). It starts a new clause after the group is named. Unlike 当中, it cannot follow a noun directly: 学生其中 is wrong, use 学生当中 or 其中的学生.',
    examples: [
      ex('我们班有二十个学生，其中十个是女生。', 'wǒmen bān yǒu èrshí ge xuésheng, qízhōng shí ge shì nǚshēng.', 'There are twenty students in our class, ten of whom are girls.'),
      ex('我去过很多城市，其中我最喜欢杭州。', 'wǒ qù guo hěn duō chéngshì, qízhōng wǒ zuì xǐhuan Hángzhōu.', 'I\'ve been to many cities, and of those I like Hangzhou best.'),
    ],
  },
  // HSK4 以上
  'hsk4-i-496edef0': {
    structure: 'Num/Amount + 以上 (+ 的 + N)   |   以上 (= the above)',
    explanation:
      'Placed after a number or level to mean above, over; in rules and notices it usually includes the number itself (十八岁以上 = 18 and over). On its own it can mean the above, what was said before. 多 after a number gives a vaguer more than.',
    examples: [
      ex('这次考试八十分以上的人不多。', 'zhè cì kǎoshì bāshí fēn yǐshàng de rén bù duō.', 'Not many people scored above eighty on this exam.'),
      ex('十八岁以上的人才可以参加。', 'shíbā suì yǐshàng de rén cái kěyǐ cānjiā.', 'Only people aged eighteen and over can take part.'),
    ],
  },
  // HSK4 以下
  'hsk4-i-1365fdfa': {
    structure: 'Num/Amount + 以下 (+ 的 + N)   |   以下 + 的 + N (= the following)',
    explanation:
      'After a number or level it means below, under; whether the number itself is included depends on context. Before a noun it means the following (以下问题), common in instructions and exams. It is neutral to formal; in casual speech people may say 不到 for less than.',
    examples: [
      ex('六岁以下的儿童可以免费入园。', 'liù suì yǐxià de értóng kěyǐ miǎnfèi rù yuán.', 'Children under six get in free.'),
      ex('请回答以下问题。', 'qǐng huídá yǐxià wèntí.', 'Please answer the following questions.'),
    ],
  },
  // HSK4 自从
  'hsk4-i-9dd1dadd': {
    structure: '自从 + Past event/Time + (以后/以来)，Clause',
    explanation:
      'Marks a past starting point from which a situation has continued (ever since). It opens the sentence and is often closed by 以后 or 以来. Unlike 从, which can refer to the future (从明天开始), 自从 is only used for the past.',
    examples: [
      ex('自从来到北京以后，我每天都说中文。', 'zìcóng lái dào Běijīng yǐhòu, wǒ měitiān dōu shuō Zhōngwén.', 'Ever since coming to Beijing, I\'ve spoken Chinese every day.'),
      ex('自从他换了工作，就很少有时间运动了。', 'zìcóng tā huàn le gōngzuò, jiù hěn shǎo yǒu shíjiān yùndòng le.', 'Ever since he changed jobs, he has rarely had time to exercise.'),
    ],
  },
  // HSK4 而言
  'hsk4-i-047607a8': {
    structure: '对(于) + N + 而言   |   就 + N + 而言',
    explanation:
      'Closes a phrase that limits a statement to a viewpoint or aspect (for, in terms of). It is the written-register counterpart of 来说 and is common in essays and formal speech. It must be preceded by 对, 对于 or 就, never used alone after a noun.',
    examples: [
      ex('对我而言，健康比钱更重要。', 'duì wǒ éryán, jiànkāng bǐ qián gèng zhòngyào.', 'For me, health matters more than money.'),
      ex('就质量而言，这家公司的产品是最好的。', 'jiù zhìliàng éryán, zhè jiā gōngsī de chǎnpǐn shì zuì hǎo de.', 'In terms of quality, this company\'s products are the best.'),
    ],
  },
  // HSK4 在内
  'hsk4-i-122554a2': {
    structure: '包括 + N + 在内   |   N + (不)在内',
    explanation:
      'Means included (within the scope). It typically closes the frame 包括…在内, which sits before a total or a statement about the whole group. 不在内 means not included. 包括 alone can mean including, but adding 在内 makes the inclusion explicit.',
    examples: [
      ex('包括我在内，一共有十个人参加。', 'bāokuò wǒ zài nèi, yígòng yǒu shí ge rén cānjiā.', 'Including me, ten people took part in total.'),
      ex('房租三千块，水电费不在内。', 'fángzū sānqiān kuài, shuǐdiànfèi bú zài nèi.', 'The rent is three thousand yuan, not including water and electricity.'),
    ],
  },
  // HSK4 凭
  'hsk4-i-cf3b7481': {
    structure: '凭 + N + VP   |   凭什么 + VP？',
    explanation:
      'A preposition before the verb that names the basis, ability or document something relies on (by virtue of, with). It is used in notices (凭票入场) and in praise of personal effort. 凭什么 is a challenging on what grounds? Compare 靠 (rely on, more spoken) and 根据 (according to).',
    examples: [
      ex('他凭自己的努力考上了大学。', 'tā píng zìjǐ de nǔlì kǎo shàng le dàxué.', 'He got into university through his own hard work.'),
      ex('请凭票入场。', 'qǐng píng piào rùchǎng.', 'Admission by ticket only.'),
    ],
  },
  // HSK4 至于
  'hsk4-i-91142dde': {
    structure: 'Clause，至于 + Topic，Comment',
    explanation:
      'Introduces a related but new topic after something has been discussed (as for, as to), often one the speaker is less sure or less concerned about. It starts the second clause. 关于 introduces the main topic, not a shift. 不至于 is a separate use meaning not go so far as.',
    examples: [
      ex('我只负责买票，至于住的地方，你们自己找吧。', 'wǒ zhǐ fùzé mǎi piào, zhìyú zhù de dìfang, nǐmen zìjǐ zhǎo ba.', 'I\'m only handling the tickets; as for a place to stay, you\'ll have to find it yourselves.'),
      ex('我会去参加比赛，至于能不能赢，就不知道了。', 'wǒ huì qù cānjiā bǐsài, zhìyú néng bu néng yíng, jiù bù zhīdào le.', 'I\'ll enter the competition; as for whether I can win, I don\'t know.'),
    ],
  },
  // HSK4 就…来说
  'hsk4-i-aeaa4e3a': {
    structure: '就 + N + 来说，Comment',
    explanation:
      'Limits a statement to one aspect or one person\'s case (in terms of, as far as X is concerned). The frame opens the sentence. 就 focuses on a particular aspect, while 对…来说 focuses on someone\'s perspective; 就…而言 is the written version.',
    examples: [
      ex('就价格来说，这个手机很便宜。', 'jiù jiàgé lái shuō, zhège shǒujī hěn piányi.', 'In terms of price, this phone is very cheap.'),
      ex('就我来说，周末最好在家休息。', 'jiù wǒ lái shuō, zhōumò zuì hǎo zài jiā xiūxi.', 'As far as I\'m concerned, the best thing to do on weekends is rest at home.'),
    ],
  },
  // HSK4 并
  'hsk4-i-3c3d03b2': {
    structure: 'Subj + 并 + 不/没(有) + V/Adj',
    explanation:
      'An adverb placed directly before 不 or 没 to strengthen the negation and correct a mistaken belief (actually not, not at all as you think). It cannot be used with positive verbs in this sense. In written Chinese 并 can also join verbs meaning and, like 并且.',
    examples: [
      ex('这个问题并不难。', 'zhège wèntí bìng bù nán.', 'This problem isn\'t actually difficult.'),
      ex('我并没有说过这句话。', 'wǒ bìng méiyǒu shuō guo zhè jù huà.', 'I never actually said that.'),
    ],
  },
  // HSK4 多亏
  'hsk4-i-09167397': {
    structure: '多亏 + N/Clause，(Subj + 才 …)   |   多亏了 + N',
    explanation:
      'Credits a person or circumstance for a good outcome (thanks to), with a feeling of gratitude or relief. It opens the sentence, and the result clause often contains 才 or is followed by 不然 for what would have happened. 由于 is neutral and does not express gratitude.',
    examples: [
      ex('多亏你帮我，我才找到了这家医院。', 'duōkuī nǐ bāng wǒ, wǒ cái zhǎodào le zhè jiā yīyuàn.', 'Thanks to your help, I found this hospital.'),
      ex('多亏了这场雨，天气凉快多了。', 'duōkuī le zhè chǎng yǔ, tiānqì liángkuai duō le.', 'Thanks to this rain, it\'s much cooler now.'),
    ],
  },
  // HSK4 而已
  'hsk4-i-b1173568': {
    structure: '(只是/不过/仅仅) + X + 而已',
    explanation:
      'A sentence-final particle meaning that\'s all, merely, which plays something down. It is usually paired with 只是, 不过 or 仅仅 earlier in the sentence. It is a little formal; in speech 罢了 or 就是了 serve a similar function.',
    examples: [
      ex('我只是随便问问而已。', 'wǒ zhǐshì suíbiàn wènwen éryǐ.', 'I was just asking, that\'s all.'),
      ex('他不过是个孩子而已，别生气了。', 'tā búguò shì ge háizi éryǐ, bié shēngqì le.', 'He\'s only a child; don\'t be angry.'),
    ],
  },
  // HSK4 将
  'hsk4-i-4170cd50': {
    structure: 'Subj + 将 + Obj + V + Complement',
    explanation:
      'The written equivalent of 把: it moves the object before the verb to show what is done to it, and the verb needs a complement or result. It appears in notices, instructions and news. 将 before a verb alone is a different use meaning will, shall (将要).',
    examples: [
      ex('请将手机关掉。', 'qǐng jiāng shǒujī guān diào.', 'Please switch off your mobile phones.'),
      ex('他将这封信交给了经理。', 'tā jiāng zhè fēng xìn jiāo gěi le jīnglǐ.', 'He handed this letter to the manager.'),
    ],
  },
  // HSK4 像
  'hsk4-i-344bc590': {
    structure: '像 + A、B + 这样的 + N   |   A + 像 + B',
    explanation:
      'As a verb it means to resemble (A 像 B). Before a list followed by 这样的 or 一样 it introduces examples (like, such as). Compared with 比如, which introduces examples after a statement, 像 often builds the examples into the noun phrase itself.',
    examples: [
      ex('像北京、上海这样的大城市，房子都很贵。', 'xiàng Běijīng, Shànghǎi zhèyàng de dà chéngshì, fángzi dōu hěn guì.', 'In big cities like Beijing and Shanghai, housing is very expensive.'),
      ex('他长得很像他爸爸。', 'tā zhǎng de hěn xiàng tā bàba.', 'He looks a lot like his dad.'),
    ],
  },
  // HSK4 比起
  'hsk4-i-ef0e75fa': {
    structure: '比起 + B (来)，A + 更/还 + Adj/V',
    explanation:
      'Opens a sentence by naming what is being compared against, then states the preferred or stronger item, usually with 更 or 还. 来 may close the phrase. It is a little more written and flexible than a plain A 比 B sentence and works well for stating preferences.',
    examples: [
      ex('比起坐飞机，我更喜欢坐火车。', 'bǐqǐ zuò fēijī, wǒ gèng xǐhuan zuò huǒchē.', 'Compared with flying, I prefer taking the train.'),
      ex('比起去年来，今年的情况好多了。', 'bǐqǐ qùnián lái, jīnnián de qíngkuàng hǎo duō le.', 'Compared with last year, things are much better this year.'),
    ],
  },
  // HSK4 不如
  'hsk4-i-d4804775': {
    structure: 'A + 不如 + B (+ Adj)   |   不如 + VP (suggestion)',
    explanation:
      'In comparisons it means A is not as good as B, with the quality optional after B. Before a verb phrase it suggests a better option (might as well, it would be better to). Compared with 没有…那么, 不如 implies B is better even without an adjective.',
    examples: [
      ex('我的中文不如他好。', 'wǒ de Zhōngwén bùrú tā hǎo.', 'My Chinese isn\'t as good as his.'),
      ex('外面太冷了，我们不如在家吃饭吧。', 'wàimiàn tài lěng le, wǒmen bùrú zài jiā chīfàn ba.', 'It\'s too cold outside; we might as well eat at home.'),
    ],
  },
  // HSK4 化
  'hsk4-i-8c7c1d28': {
    structure: 'Adj/N + 化 (→ verb/noun)',
    explanation:
      'A suffix attached to adjectives or nouns to form words meaning to become or make something so (-ize, -ify), such as 现代化 or 简单化. The result works as a verb or abstract noun and is common in formal and news language. It is not freely added to every word.',
    examples: [
      ex('中国的城市化发展得很快。', 'Zhōngguó de chéngshìhuà fāzhǎn de hěn kuài.', 'Urbanization in China has developed rapidly.'),
      ex('我们应该把这个过程简单化。', 'wǒmen yīnggāi bǎ zhège guòchéng jiǎndānhuà.', 'We should simplify this process.'),
    ],
  },
  // HSK4 并且
  'hsk4-i-0772c40c': {
    structure: 'VP/Clause，并且 + VP/Clause',
    explanation:
      'A conjunction linking verb phrases or clauses to add a further point (and, moreover, furthermore). It is somewhat formal. Learners often misuse 和 for this; 和 joins nouns, while 并且 or 而且 must be used to join verbs and clauses.',
    examples: [
      ex('他会说中文，并且说得很流利。', 'tā huì shuō Zhōngwén, bìngqiě shuō de hěn liúlì.', 'He can speak Chinese, and fluently at that.'),
      ex('我们讨论了这个问题，并且做出了决定。', 'wǒmen tǎolùn le zhège wèntí, bìngqiě zuò chū le juédìng.', 'We discussed the issue and came to a decision.'),
    ],
  },
  // HSK4 由
  'hsk4-i-2b86dd45': {
    structure: 'Thing + 由 + Agent + V   |   由 + Parts + 组成',
    explanation:
      'A formal preposition before the verb that names who is responsible for or carries out an action (by), or what something is made of (由…组成). Unlike 被, it carries no sense of adversity and is used for duties and arrangements; it often appears in 是…的 sentences.',
    examples: [
      ex('这个问题由王经理负责。', 'zhège wèntí yóu Wáng jīnglǐ fùzé.', 'Manager Wang is responsible for this matter.'),
      ex('这本书是由一位老教授写的。', 'zhè běn shū shì yóu yí wèi lǎo jiàoshòu xiě de.', 'This book was written by an elderly professor.'),
    ],
  },
  // HSK4 难免
  'hsk4-i-bd1a57fb': {
    structure: '(Subj) + 难免 + (会) + V',
    explanation:
      'Says something is hard to avoid, natural under the circumstances, often to excuse a mistake or feeling. It goes before the verb, frequently with 会. 免不了 is the spoken equivalent. Unlike 避免 (to avoid), 难免 takes no object; it can also stand alone as 这是难免的.',
    examples: [
      ex('刚开始学开车，难免会紧张。', 'gāng kāishǐ xué kāichē, nánmiǎn huì jǐnzhāng.', 'When you first start learning to drive, it\'s natural to be nervous.'),
      ex('人难免会犯错误。', 'rén nánmiǎn huì fàn cuòwù.', 'Everyone makes mistakes now and then.'),
    ],
  },
  // HSK4 值得
  'hsk4-i-c875605b': {
    structure: 'N + (很/不) + 值得 + V   |   值得 + N',
    explanation:
      'A verb meaning to be worth doing, followed by a verb phrase (值得一看, worth a look) or a noun. Degree adverbs like 很 can go before it. Use 值 (or 值得) for monetary worth (这件衣服不值这么多钱); 值得 is preferred for whether an action is worthwhile.',
    examples: [
      ex('这本书很值得一看。', 'zhè běn shū hěn zhíde yí kàn.', 'This book is well worth reading.'),
      ex('为了这么一点钱，不值得生气。', 'wèile zhème yìdiǎn qián, bù zhíde shēngqì.', 'It\'s not worth getting angry over such a small amount of money.'),
    ],
  },
  // HSK4 害得
  'hsk4-i-6044ddb1': {
    structure: 'A + 害得 + B + V/Adj (bad result)',
    explanation:
      'Links a cause to an unpleasant result for someone: the subject (a person or an event) is blamed for what follows 害得. It is spoken and carries a complaining tone. For neutral or positive results use 让 or 使 instead — 他的话让我很高兴, never 害得我很高兴.',
    examples: [
      ex('你迟到了，害得我们等了一个小时。', 'nǐ chídào le, hàide wǒmen děng le yí ge xiǎoshí.', 'You were late, and because of you we waited an hour.'),
      ex('这场大雨害得航班都取消了。', 'zhè chǎng dàyǔ hàide hángbān dōu qǔxiāo le.', 'This heavy rain caused all the flights to be cancelled.'),
    ],
  },
  // HSK4 受
  'hsk4-i-41eba472': {
    structure: 'Subj + 受(到) + (Agent 的) + 欢迎/影响/批评…',
    explanation:
      'Shows that the subject receives or undergoes something — welcome, influence, criticism, harm — so it works like a passive without 被. It combines with a small set of abstract verb-nouns (欢迎, 影响, 批评, 伤, 教育) and is neutral to formal. It does not work with ordinary physical action verbs: *我受他打了 is wrong, use 被.',
    examples: [
      ex('这本书很受年轻人欢迎。', 'zhè běn shū hěn shòu niánqīngrén huānyíng.', 'This book is very popular with young people.'),
      ex('他小时候受了父亲很大的影响。', 'tā xiǎo shíhou shòu le fùqin hěn dà de yǐngxiǎng.', 'As a child he was greatly influenced by his father.'),
    ],
  },
  // HSK4 着…着…就…
  'hsk4-i-059f4d33': {
    meaning: 'while V-ing, (unexpectedly) ended up …',
    structure: 'V着 + V着 + 就 + unexpected result (+ 了)',
    explanation:
      'Repeating a verb with 着 paints an ongoing action, and 就 introduces something that happens unplanned in the middle of it, usually closed by 了. It is spoken and narrative; the verb is normally one syllable (走着走着, 说着说着). The result is unexpected — a planned sequence would use 然后 instead.',
    examples: [
      ex('她说着说着就哭了。', 'tā shuōzhe shuōzhe jiù kū le.', 'She was talking and then suddenly burst into tears.'),
      ex('我看着看着就睡着了。', 'wǒ kànzhe kànzhe jiù shuìzháo le.', 'I was watching and just drifted off to sleep.'),
    ],
  },
  // HSK4 格外
  'hsk4-i-0526f846': {
    structure: '格外 + Adj / feeling verb',
    explanation:
      'An adverb meaning \'unusually, especially\', comparing a situation with how it normally is: 今天格外冷 means colder than usual. It sits before adjectives or feeling verbs and is slightly literary. Unlike 特别, it cannot mean \'specially (for a purpose)\' and does not go before ordinary action verbs.',
    examples: [
      ex('雨后的空气格外新鲜。', 'yǔ hòu de kōngqì géwài xīnxiān.', 'The air is especially fresh after rain.'),
      ex('第一次离开家，他格外想念妈妈。', 'dì yī cì líkāi jiā, tā géwài xiǎngniàn māma.', 'Away from home for the first time, he missed his mother more than ever.'),
    ],
  },
  // HSK4 倒
  'hsk4-i-40e2c152': {
    structure: 'Subj + 倒 + V/Adj   |   A 倒是 A，不过/就是 …',
    explanation:
      'An adverb before the predicate signalling that a fact runs against what was expected or against what was just said. It is spoken; 倒是 often concedes a point before 不过/就是 (好看倒是好看，就是太贵). Compare 却, which is more written and simply contrasts two clauses rather than expressing surprise.',
    examples: [
      ex('我以为他会生气，他倒笑了。', 'wǒ yǐwéi tā huì shēngqì, tā dào xiào le.', 'I thought he would get angry, but he laughed instead.'),
      ex('这家饭馆不大，菜倒挺好吃的。', 'zhè jiā fànguǎn bú dà, cài dào tǐng hǎochī de.', 'This restaurant isn\'t big, but the food is actually quite good.'),
    ],
  },
  // HSK4 得了
  'hsk4-i-ecaffaea': {
    structure: 'V + 得了 (de liǎo) (+ O)',
    explanation:
      'A potential complement: 了 is read liǎo here (\'finish, manage\'), so V得了 says the action can be done or handled in the circumstances. It follows the verb directly, is spoken, and appears mostly in questions; the negative is V不了. Don\'t confuse it with the interjection 得了 (déle, \'enough!\').',
    examples: [
      ex('这么多菜，你一个人吃得了吗？', 'zhème duō cài, nǐ yí ge rén chī de liǎo ma?', 'Can you eat this much food by yourself?'),
      ex('明天的会你来得了吗？', 'míngtiān de huì nǐ lái de liǎo ma?', 'Can you make it to tomorrow\'s meeting?'),
    ],
  },
  // HSK4 不了
  'hsk4-i-bcd1aa31': {
    structure: 'V + 不了 (bu liǎo) (+ O)',
    explanation:
      'The negative potential complement: V不了 says an action cannot happen or cannot be managed because of circumstances, quantity or difficulty. It comes right after the verb and is very common in speech. Compare 不能 V (not allowed, not able in principle) and V不完 (cannot finish all of it).',
    examples: [
      ex('我明天有事，去不了。', 'wǒ míngtiān yǒu shì, qù bu liǎo.', 'I have something on tomorrow, so I can\'t go.'),
      ex('这个箱子太重了，我拿不了。', 'zhège xiāngzi tài zhòng le, wǒ ná bu liǎo.', 'This suitcase is too heavy; I can\'t carry it.'),
    ],
  },
  // HSK4 坏了
  'hsk4-i-a3be2e7f': {
    structure: 'Adj / feeling verb + 坏了',
    explanation:
      'After an adjective or feeling verb, 坏了 is a degree complement meaning \'terribly, extremely\', used for strong states like 饿, 累, 急, 气 and also 高兴. It is colloquial and closes the clause. Don\'t confuse it with the result complement meaning \'broken\' (手机摔坏了), where 坏 follows an action verb.',
    examples: [
      ex('走了一天路，我累坏了。', 'zǒu le yì tiān lù, wǒ lèi huài le.', 'After walking all day, I\'m exhausted.'),
      ex('听到这个好消息，孩子们高兴坏了。', 'tīngdào zhège hǎo xiāoxi, háizimen gāoxìng huài le.', 'Hearing the good news, the kids were overjoyed.'),
    ],
  },
  // HSK4 来…去
  'hsk4-i-33b2acf5': {
    structure: 'V + 来 + V + 去',
    explanation:
      'Putting the same verb before 来 and before 去 shows an action repeated over and over, often without getting anywhere: 想来想去 \'think it over and over\', 走来走去 \'pace back and forth\'. It is spoken and often followed by a clause with 还是 or 也 giving the final outcome. Both slots must hold the same verb.',
    examples: [
      ex('我想来想去，还是决定不去了。', 'wǒ xiǎng lái xiǎng qù, háishi juédìng bú qù le.', 'I thought it over and over and in the end decided not to go.'),
      ex('他在门口走来走去，很着急。', 'tā zài ménkǒu zǒu lái zǒu qù, hěn zháojí.', 'He paced back and forth at the door, very anxious.'),
    ],
  },
  // HSK4 一旦…就…
  'hsk4-i-6153f410': {
    structure: '一旦 + condition，(Subj) + 就 + result',
    explanation:
      'Introduces a condition that, once it happens, triggers a result — often serious or hard to reverse. 一旦 can go before or after the subject, and 就 stands before the verb of the result clause. It is a little more formal than 只要…就, and stresses the moment of change rather than a minimum requirement.',
    examples: [
      ex('一旦下了决定，他就不会改变。', 'yídàn xià le juédìng, tā jiù bú huì gǎibiàn.', 'Once he has made a decision, he won\'t change it.'),
      ex('习惯一旦养成，就很难改掉。', 'xíguàn yídàn yǎngchéng, jiù hěn nán gǎidiào.', 'Once a habit is formed, it is hard to break.'),
    ],
  },
  // HSK4 即使…也…
  'hsk4-i-5b50239c': {
    structure: '即使 + supposition，Subj + 也 + result',
    explanation:
      'Grants a condition, usually hypothetical or extreme, and says the result holds anyway. 也 must stand before the verb of the second clause. 即使 is neutral to written; the spoken equivalent is 就算. Unlike 虽然, which accepts a real fact, 即使 normally introduces something not (yet) true.',
    examples: [
      ex('即使明天下雨，比赛也会照常进行。', 'jíshǐ míngtiān xià yǔ, bǐsài yě huì zhàocháng jìnxíng.', 'Even if it rains tomorrow, the match will go ahead as planned.'),
      ex('即使你不说，我也知道。', 'jíshǐ nǐ bù shuō, wǒ yě zhīdào.', 'Even if you don\'t tell me, I know.'),
    ],
  },
  // HSK4 就算…也…
  'hsk4-i-e2bb59d6': {
    structure: '就算 + supposition，Subj + 也 + result',
    explanation:
      'The spoken counterpart of 即使: grants a supposition, even an extreme one, and insists the outcome stays the same. 也 sits before the second verb. 就算 is casual and often sounds determined or stubborn. Don\'t swap in 虽然 — 虽然 accepts a fact, 就算 a supposition.',
    examples: [
      ex('就算再忙，他也每天给家里打电话。', 'jiùsuàn zài máng, tā yě měitiān gěi jiā li dǎ diànhuà.', 'Even when he\'s extremely busy, he calls home every day.'),
      ex('就算你不同意，我也要去。', 'jiùsuàn nǐ bù tóngyì, wǒ yě yào qù.', 'Even if you don\'t agree, I\'m going.'),
    ],
  },
  // HSK4 假如…就…
  'hsk4-i-4bd3ed9f': {
    structure: '假如 + condition (+ 的话)，(Subj) + 就 + result',
    explanation:
      'A conditional like 如果, but slightly more formal and more clearly hypothetical. 假如 opens the condition clause and 就 goes before the verb of the result clause; 的话 may close the condition. In casual conversation 如果 or 要是 are more common.',
    examples: [
      ex('假如我有时间，我就去看你。', 'jiǎrú wǒ yǒu shíjiān, wǒ jiù qù kàn nǐ.', 'If I have time, I\'ll come and see you.'),
      ex('假如明天天气不好，我们就改天再去。', 'jiǎrú míngtiān tiānqì bù hǎo, wǒmen jiù gǎitiān zài qù.', 'If the weather is bad tomorrow, we\'ll go another day.'),
    ],
  },
  // HSK4 的话
  'hsk4-i-c405c9c2': {
    meaning: 'if (clause-final conditional marker)',
    structure: '(如果/要是) + condition + 的话，result',
    explanation:
      'Placed at the end of a clause to mark it as a condition, \'if …\'. It can stand alone or pair with 如果/要是/假如 at the start of the same clause. It is spoken and very common. It always closes the condition — never put it after the result clause.',
    examples: [
      ex('你累的话，就休息一下吧。', 'nǐ lèi dehuà, jiù xiūxi yíxià ba.', 'If you\'re tired, take a break.'),
      ex('如果明天下雨的话，我们就不去了。', 'rúguǒ míngtiān xià yǔ dehuà, wǒmen jiù bú qù le.', 'If it rains tomorrow, we won\'t go.'),
    ],
  },
  // HSK4 不比
  'hsk4-i-a039c5d0': {
    meaning: 'A is not more … than B (about the same)',
    structure: 'A + 不比 + B + Adj',
    explanation:
      'Negates a 比 comparison: A 不比 B 高 means A is not taller than B — roughly the same, or the speaker is rejecting a claim that A is taller. It is usually a rebuttal. To say plainly that A is less than B, use 没有: A 没有 B 高.',
    examples: [
      ex('我不比你聪明，只是比你努力。', 'wǒ bù bǐ nǐ cōngming, zhǐshì bǐ nǐ nǔlì.', 'I\'m not smarter than you, I just work harder.'),
      ex('这家店的东西不比那家便宜。', 'zhè jiā diàn de dōngxi bù bǐ nà jiā piányi.', 'Things in this shop are no cheaper than in that one.'),
    ],
  },
  // HSK4 任何…都
  'hsk4-i-7c484b17': {
    structure: '任何 + (一 + MW) + N + 都/也 + V',
    explanation:
      '任何 means \'any (at all)\' and stands before a noun, usually directly (任何人, 任何问题); the predicate needs 都 or 也, very often in the negative. It is slightly formal — in speech 什么 + N + 都 is common. Don\'t leave out 都/也: *任何人可以参加 sounds incomplete.',
    examples: [
      ex('任何人都可以参加这个活动。', 'rènhé rén dōu kěyǐ cānjiā zhège huódòng.', 'Anyone can take part in this event.'),
      ex('他任何时候都不迟到。', 'tā rènhé shíhou dōu bù chídào.', 'He is never late, ever.'),
    ],
  },
  // HSK4 少不了
  'hsk4-i-438323a3': {
    structure: '少不了 + N   |   N + (是) 少不了 (的)',
    explanation:
      'A potential-complement form of 少, meaning \'cannot do without\' or \'is bound to be there\'. It acts as a verb before or after the noun: 少不了你 \'we can\'t manage without you\', 麻烦少不了 \'there\'s bound to be trouble\'. It is spoken; more formal equivalents are 离不开 and 不可缺少.',
    examples: [
      ex('过年的时候，饺子是少不了的。', 'guònián de shíhou, jiǎozi shì shǎo bu liǎo de.', 'At Chinese New Year, dumplings are a must.'),
      ex('这件事少不了你的帮忙。', 'zhè jiàn shì shǎo bu liǎo nǐ de bāngmáng.', 'We can\'t manage this without your help.'),
    ],
  },
  // HSK4 等于
  'hsk4-i-bd0f3091': {
    structure: 'A + 等于 + B   |   A + 不等于 + B',
    explanation:
      'Means \'equals\' in arithmetic and, by extension, \'amounts to, is the same as\'. It is a verb taking a noun or a whole clause as object; the negative is 不等于. In maths it is the standard word (一加一等于二); in arguments the casual alternative is 就是.',
    examples: [
      ex('三加五等于八。', 'sān jiā wǔ děngyú bā.', 'Three plus five equals eight.'),
      ex('有钱不等于幸福。', 'yǒu qián bù děngyú xìngfú.', 'Having money doesn\'t mean being happy.'),
    ],
  },
  // HSK4 从…中
  'hsk4-i-bbeec547': {
    structure: '从 + N + 中 + V',
    explanation:
      'Frames a source: \'from (among / within) N\'. The noun is usually abstract or a group (经验, 错误, 学生), and the whole phrase stands before the verb. It is neutral to written; 从…里 is the more spoken version, mostly for physical places and containers.',
    examples: [
      ex('我们应该从错误中学习。', 'wǒmen yīnggāi cóng cuòwù zhōng xuéxí.', 'We should learn from our mistakes.'),
      ex('老师从学生中选了三个代表。', 'lǎoshī cóng xuésheng zhōng xuǎn le sān ge dàibiǎo.', 'The teacher chose three representatives from among the students.'),
    ],
  },
  // HSK4 无…可…
  'hsk4-i-df6e4d79': {
    structure: '无 + N + 可 + V (four-character set phrases)',
    explanation:
      'A literary frame meaning \'have no N that can be V-ed\': 无话可说 \'nothing to say\', 无家可归 \'homeless\', 无事可做 \'nothing to do\'. It forms fixed four-character expressions used as predicates. The plain spoken version is 没有 N 可以 V; avoid inventing new combinations freely.',
    examples: [
      ex('他被问得无话可说。', 'tā bèi wèn de wú huà kě shuō.', 'He was questioned until he had nothing left to say.'),
      ex('洪水以后，很多人无家可归。', 'hóngshuǐ yǐhòu, hěn duō rén wú jiā kě guī.', 'After the flood, many people were left homeless.'),
    ],
  },
  // HSK4 一…也不
  'hsk4-i-65c11ef3': {
    structure: '一 + MW (+ N) + 也不/也没 + V',
    explanation:
      'Emphatic negation, \'not a single one, not at all\'. 一 plus a measure word (or 一点儿) goes before 也, and the verb is negated with 不 (habit, will, state) or 没 (past events). 都 can replace 也 with almost the same meaning; the pattern is very common in speech.',
    examples: [
      ex('他一句话也不说。', 'tā yí jù huà yě bù shuō.', 'He doesn\'t say a single word.'),
      ex('我一点儿也不累。', 'wǒ yìdiǎnr yě bú lèi.', 'I\'m not tired at all.'),
    ],
  },
  // HSK4 好
  'hsk4-i-27e4fe4c': {
    structure: 'Clause 1，(Subj) + 好 + V (purpose)',
    explanation:
      'In a second clause, 好 means \'so that (it is easy to)\': the first action makes the second possible. It stands before the verb, is colloquial, and is often preceded by 也 or 就. Compare 为了, which introduces the purpose at the start of the sentence rather than after the action.',
    examples: [
      ex('你把电话号码留下，我好跟你联系。', 'nǐ bǎ diànhuà hàomǎ liúxià, wǒ hǎo gēn nǐ liánxì.', 'Leave your phone number so that I can contact you.'),
      ex('早点睡吧，明天好早起。', 'zǎo diǎn shuì ba, míngtiān hǎo zǎo qǐ.', 'Go to bed early so you can get up early tomorrow.'),
    ],
  },
  // HSK4 有关的
  'hsk4-i-c727465a': {
    structure: '跟/与 + N + 有关的 + N',
    explanation:
      '有关 means \'be related to\'; with 的 it becomes a modifier: 跟环境有关的问题 \'issues related to the environment\'. The related thing is introduced by 跟/与/和 before 有关, and the whole phrase precedes the noun it describes. Compare 关于, a preposition that heads a topic (关于环境的书) without 跟.',
    examples: [
      ex('我想找一些跟中国历史有关的书。', 'wǒ xiǎng zhǎo yìxiē gēn Zhōngguó lìshǐ yǒuguān de shū.', 'I want to find some books related to Chinese history.'),
      ex('请准备好与会议有关的材料。', 'qǐng zhǔnbèi hǎo yǔ huìyì yǒuguān de cáiliào.', 'Please get the materials for the meeting ready.'),
    ],
  },
  // HSK4 一面…一面…
  'hsk4-i-f24bc4d9': {
    structure: 'Subj + 一面 + V1，一面 + V2',
    explanation:
      'Describes one subject doing two actions at the same time. It is more written than 一边…一边… and suits fairly sustained activities; the subject comes first and is not repeated. Don\'t use it for two people doing different things — that needs two separate subjects.',
    examples: [
      ex('他一面听音乐，一面写作业。', 'tā yímiàn tīng yīnyuè, yímiàn xiě zuòyè.', 'He listens to music while doing his homework.'),
      ex('她一面工作，一面照顾孩子。', 'tā yímiàn gōngzuò, yímiàn zhàogù háizi.', 'She works and looks after the children at the same time.'),
    ],
  },
  // HSK4 不是…就是…
  'hsk4-i-80688adf': {
    structure: '不是 + A，就是 + B',
    explanation:
      '\'If it\'s not A, it\'s B\': the speaker claims only these two options occur, often complaining about repetition. A and B are parallel (nouns, verbs or clauses). Compare 不是…而是…, which rejects A and asserts B instead of offering two alternatives.',
    examples: [
      ex('他周末不是睡觉，就是玩游戏。', 'tā zhōumò bú shì shuìjiào, jiù shì wán yóuxì.', 'On weekends he either sleeps or plays games.'),
      ex('这几天不是刮风就是下雨。', 'zhè jǐ tiān bú shì guā fēng jiù shì xià yǔ.', 'These past few days it has been either windy or rainy.'),
    ],
  },
  // HSK4 或者…或者…
  'hsk4-i-64c96139': {
    structure: '或者 + A，或者 + B',
    explanation:
      'Lists alternatives in a statement or suggestion: \'either A or B\'. Each 或者 stands before its option. In questions use 还是 instead (你喝茶还是咖啡？) — using 或者 in a choice question is a very common learner mistake.',
    examples: [
      ex('你或者今天来，或者明天来，都可以。', 'nǐ huòzhě jīntiān lái, huòzhě míngtiān lái, dōu kěyǐ.', 'You can come either today or tomorrow; either is fine.'),
      ex('周末我或者在家看书，或者去公园跑步。', 'zhōumò wǒ huòzhě zài jiā kàn shū, huòzhě qù gōngyuán pǎobù.', 'At weekends I either read at home or go running in the park.'),
    ],
  },
  // HSK4 别说…就是…
  'hsk4-i-065fb79d': {
    structure: '别说 + A，就是 + B + 也/都 + V',
    explanation:
      '\'Never mind A; even B …\': the first clause names the more obvious case, and 就是 introduces a less likely one that still holds, with 也/都 in the predicate. It is spoken. Note the order: here the \'let alone\' item comes first, whereas 更不用说 puts it at the end.',
    examples: [
      ex('别说一百块，就是十块我也没有。', 'bié shuō yìbǎi kuài, jiù shì shí kuài wǒ yě méiyǒu.', 'Never mind a hundred yuan, I don\'t even have ten.'),
      ex('别说外国人，就是中国人也不一定懂这个词。', 'bié shuō wàiguórén, jiù shì Zhōngguórén yě bù yídìng dǒng zhège cí.', 'Let alone foreigners, even Chinese people don\'t necessarily know this word.'),
    ],
  },
  // HSK4 更不用说
  'hsk4-i-124ab03d': {
    structure: '(连) A + 也/都 + V，更不用说 + B (了)',
    explanation:
      'Adds a case that follows even more obviously: \'let alone, not to mention\'. The surprising case comes first with 连…也/都, then 更不用说 introduces the obvious one, often ending in 了. It is neutral in register; compare 别说…就是…, which puts the \'let alone\' item first.',
    examples: [
      ex('他连自己的名字都写不好，更不用说写文章了。', 'tā lián zìjǐ de míngzi dōu xiě bu hǎo, gèng búyòng shuō xiě wénzhāng le.', 'He can\'t even write his own name properly, let alone an essay.'),
      ex('这个问题老师都不会，更不用说我们了。', 'zhège wèntí lǎoshī dōu bú huì, gèng búyòng shuō wǒmen le.', 'Even the teacher can\'t solve this problem, let alone us.'),
    ],
  },
  // HSK5 很是
  'hsk5-i-a9ea7591': {
    structure: 'Subj + 很是 + two-syllable Adj / feeling verb',
    explanation:
      'An emphatic degree adverb, \'quite, truly\', stronger and more literary than plain 很. It goes before two-syllable adjectives and feeling verbs (很是满意, 很是担心) and is not used with one-syllable adjectives. Unlike 很, which is often just a neutral link, 很是 always adds real emphasis.',
    examples: [
      ex('听了他的回答，老师很是满意。', 'tīng le tā de huídá, lǎoshī hěn shì mǎnyì.', 'The teacher was quite pleased with his answer.'),
      ex('孩子这么晚还没回家，妈妈很是担心。', 'háizi zhème wǎn hái méi huí jiā, māma hěn shì dānxīn.', 'The child still isn\'t home this late, and Mum is really worried.'),
    ],
  },
  // HSK5 足足
  'hsk5-i-295baeec': {
    structure: '足足 + (V) + Num + MW (+ N)',
    explanation:
      'An adverb stressing that an amount is fully reached or even exceeded: \'a whole, a full\'. It goes before the verb or directly before the number phrase (足足等了两个小时), and shows the speaker finds the amount large. 整整 is nearly identical; 至少 only gives a lower limit without that feeling.',
    examples: [
      ex('我们足足等了两个小时。', 'wǒmen zúzú děng le liǎng ge xiǎoshí.', 'We waited a full two hours.'),
      ex('这个西瓜足足有十斤重。', 'zhège xīguā zúzú yǒu shí jīn zhòng.', 'This watermelon weighs a whole five kilos.'),
    ],
  },
  // HSK5 一再
  'hsk5-i-a9a31e0c': {
    structure: 'Subj + 一再 + V',
    explanation:
      'An adverb meaning \'repeatedly, time and again\', placed before the verb. It is mildly formal and often goes with verbs of speaking or requesting (强调, 提醒, 要求, 表示), suggesting deliberate or insistent repetition. 再三 is very similar; 又 marks just one more occurrence.',
    examples: [
      ex('医生一再提醒他要多休息。', 'yīshēng yízài tíxǐng tā yào duō xiūxi.', 'The doctor reminded him again and again to rest more.'),
      ex('他一再表示感谢。', 'tā yízài biǎoshì gǎnxiè.', 'He thanked us over and over.'),
    ],
  },
  // HSK5 向来
  'hsk5-i-15f82f5f': {
    meaning: 'always / all along (habitually)',
    structure: 'Subj + 向来 + V/Adj',
    explanation:
      'Says something has always been so, from the past up to now: 他向来很准时. It sits before the predicate, is slightly formal, and describes habits or character rather than single events. Compare 一直 (continuously within a stretch of time) and 从来, which mostly appears with negatives (从来不).',
    examples: [
      ex('他向来说话算话。', 'tā xiànglái shuōhuà suànhuà.', 'He has always kept his word.'),
      ex('我向来不喜欢吃辣的。', 'wǒ xiànglái bù xǐhuan chī là de.', 'I\'ve never liked spicy food.'),
    ],
  },
  // HSK5 果然
  'hsk5-i-904df0e4': {
    structure: '(Subj) + 果然 + V/Adj',
    explanation:
      'Confirms that what happened matches what was predicted or said: \'sure enough, just as expected\'. It goes before the predicate or at the start of the clause. Contrast 竟然, which marks surprise against expectation — the opposite meaning.',
    examples: [
      ex('天气预报说今天有雨，果然下了。', 'tiānqì yùbào shuō jīntiān yǒu yǔ, guǒrán xià le.', 'The forecast said it would rain today, and sure enough it did.'),
      ex('大家都说这家店好吃，我尝了一下，果然不错。', 'dàjiā dōu shuō zhè jiā diàn hǎochī, wǒ cháng le yíxià, guǒrán búcuò.', 'Everyone said this place was good; I tried it, and it really was.'),
    ],
  },
  // HSK5 似乎
  'hsk5-i-f5888509': {
    structure: 'Subj + 似乎 + V/Adj',
    explanation:
      'An adverb meaning \'seemingly, it appears that\', used to soften a statement. It goes before the predicate and is more written than 好像. Unlike 好像, it is not normally paired with 一样 to make a comparison.',
    examples: [
      ex('他似乎不太高兴。', 'tā sìhū bú tài gāoxìng.', 'He seems a bit unhappy.'),
      ex('这个问题似乎没有那么简单。', 'zhège wèntí sìhū méiyǒu nàme jiǎndān.', 'This problem doesn\'t seem to be that simple.'),
    ],
  },
  // HSK5 偏偏
  'hsk5-i-5868f489': {
    structure: 'Subj + 偏偏 + V   |   偏偏 + clause',
    explanation:
      'Shows that something goes against expectations or wishes, either by bad luck (偏偏下雨了) or by someone\'s deliberate stubbornness (他偏偏不听). It is spoken and goes before the verb or at the start of the clause. The shorter 偏 mostly marks stubbornness and cannot open a clause.',
    examples: [
      ex('我今天没带伞，偏偏下起了大雨。', 'wǒ jīntiān méi dài sǎn, piānpiān xià qǐ le dàyǔ.', 'I didn\'t bring an umbrella today, and of course it started pouring.'),
      ex('大家都劝他别去，他偏偏要去。', 'dàjiā dōu quàn tā bié qù, tā piānpiān yào qù.', 'Everyone told him not to go, but he insisted on going.'),
    ],
  },
  // HSK5 到时候
  'hsk5-i-5a989c5e': {
    structure: '(future event)，到时候 + (Subj) + V',
    explanation:
      'A time phrase meaning \'when the time comes, then\', pointing to a future moment already mentioned or understood. It usually opens the clause and is spoken. Compare 那时候, which can also refer to the past, whereas 到时候 is only used for the future.',
    examples: [
      ex('我下个月去北京，到时候给你打电话。', 'wǒ xià ge yuè qù Běijīng, dào shíhou gěi nǐ dǎ diànhuà.', 'I\'m going to Beijing next month; I\'ll call you then.'),
      ex('现在不复习，到时候考试就麻烦了。', 'xiànzài bú fùxí, dào shíhou kǎoshì jiù máfan le.', 'If you don\'t review now, you\'ll be in trouble when the exam comes.'),
    ],
  },
  // HSK5 来着
  'hsk5-i-c91e24a5': {
    meaning: '(recalling the recent past) … again? / was …',
    structure: 'Sentence + 来着 (?)',
    explanation:
      'A sentence-final particle of northern colloquial Mandarin that refers to the recent past, especially when trying to recall something: 他叫什么来着？ \'what was his name again?\'. It comes at the very end of the sentence and is not used with negatives. It is purely spoken — avoid it in writing.',
    examples: [
      ex('你刚才说什么来着？', 'nǐ gāngcái shuō shénme láizhe?', 'What were you saying just now?'),
      ex('那家饭馆叫什么名字来着？', 'nà jiā fànguǎn jiào shénme míngzi láizhe?', 'What was that restaurant called again?'),
    ],
  },
  // HSK5 以及
  'hsk5-i-cc49dc96': {
    structure: 'A、B + 以及 + C',
    explanation:
      'A written conjunction \'as well as, and\', joining nouns, phrases or clauses, usually before the last item of a list. It is formal; in speech 和 is used. Unlike 和, 以及 can link clauses, and the item after it is often of slightly lesser importance.',
    examples: [
      ex('会议讨论了价格、质量以及服务等问题。', 'huìyì tǎolùn le jiàgé, zhìliàng yǐjí fúwù děng wèntí.', 'The meeting discussed price, quality and service, among other issues.'),
      ex('请写下你的姓名、地址以及电话号码。', 'qǐng xiěxià nǐ de xìngmíng, dìzhǐ yǐjí diànhuà hàomǎ.', 'Please write down your name, address and phone number.'),
    ],
  },
  // HSK5 总之
  'hsk5-i-be3b923d': {
    structure: '…，总之，+ conclusion',
    explanation:
      'A connective at the start of a summing-up sentence: \'in short, anyway\'. It follows several points or details and gives the gist; it can also wave the details aside (\'whatever the case\'). Neutral register; 总而言之 is more formal, and 反正 is spoken and more dismissive.',
    examples: [
      ex('总之，这次旅行很成功。', 'zǒngzhī, zhè cì lǚxíng hěn chénggōng.', 'In short, the trip was a success.'),
      ex('你可以坐地铁，也可以打车，总之别迟到。', 'nǐ kěyǐ zuò dìtiě, yě kěyǐ dǎchē, zǒngzhī bié chídào.', 'Take the subway or a taxi — anyway, don\'t be late.'),
    ],
  },
  // HSK5 则
  'hsk5-i-f79438ce': {
    structure: 'A + predicate，B + 则 + predicate',
    explanation:
      'A written adverb that contrasts a second topic with the first: \'whereas, while\'. It goes after the subject of the second clause, before the predicate — never at the very start of the clause. It is formal; speech uses 却, 而 or simply 但是.',
    examples: [
      ex('北方冬天很冷，南方则比较暖和。', 'běifāng dōngtiān hěn lěng, nánfāng zé bǐjiào nuǎnhuo.', 'Winters in the north are cold, whereas the south is fairly warm.'),
      ex('哥哥喜欢运动，弟弟则喜欢看书。', 'gēge xǐhuan yùndòng, dìdi zé xǐhuan kàn shū.', 'The older brother likes sports, while the younger one likes reading.'),
    ],
  },
  // HSK5 本
  'hsk5-i-d3cc0cab': {
    structure: '本 + N / MW (本店, 本次, 本人)',
    explanation:
      'A formal determiner meaning \'this (one of ours), the present\': 本店 \'this shop\', 本次航班 \'this flight\'. It attaches directly to a noun or measure word without 个 and is typical of announcements and official texts. Compare everyday 这; 本 implies the speaker belongs to or represents the thing.',
    examples: [
      ex('本店周一休息。', 'běn diàn zhōuyī xiūxi.', 'This shop is closed on Mondays.'),
      ex('本次列车开往上海。', 'běn cì lièchē kāi wǎng Shànghǎi.', 'This train is bound for Shanghai.'),
    ],
  },
  // HSK5 性
  'hsk5-i-6dc93688': {
    structure: 'Adj / V / N + 性 → abstract noun',
    explanation:
      'A suffix that turns adjectives, verbs or nouns into abstract nouns meaning \'-ness, -ity, nature\': 重要性 \'importance\', 可能性 \'possibility\'. The new word behaves as a noun and can take 有/没有 or modifiers; X性 + 的 can also modify a noun (技术性的问题). It is neutral to formal.',
    examples: [
      ex('大家都明白这件事的重要性。', 'dàjiā dōu míngbai zhè jiàn shì de zhòngyàoxìng.', 'Everyone understands the importance of this matter.'),
      ex('他明天来的可能性不大。', 'tā míngtiān lái de kěnéngxìng bú dà.', 'The chance that he comes tomorrow is small.'),
    ],
  },
  // HSK5 是否
  'hsk5-i-794465cb': {
    structure: 'Subj + 是否 + V/Adj',
    explanation:
      'A formal \'whether (or not)\' that replaces the A-not-A form (是不是, V不V). It goes before the predicate, often inside a larger sentence after 不知道, 决定 or 取决于. In speech use 是不是 or 有没有, and never add 吗 after a 是否 clause.',
    examples: [
      ex('我不知道他是否同意。', 'wǒ bù zhīdào tā shìfǒu tóngyì.', 'I don\'t know whether he agrees.'),
      ex('比赛是否举行要看天气。', 'bǐsài shìfǒu jǔxíng yào kàn tiānqì.', 'Whether the match is held depends on the weather.'),
    ],
  },
  // HSK5 之
  'hsk5-i-4ac35363': {
    structure: 'Modifier + 之 + N (literary 的)   |   X 之一   |   N 分之 M',
    explanation:
      'The classical counterpart of 的, linking a modifier to a noun in set phrases and formal writing. In modern Chinese it lives mainly in fixed patterns such as X之一 \'one of X\' and fractions (三分之一). Using it freely in place of 的 in everyday speech sounds stilted.',
    examples: [
      ex('这是我最喜欢的城市之一。', 'zhè shì wǒ zuì xǐhuan de chéngshì zhī yī.', 'This is one of my favourite cities.'),
      ex('三分之一的学生选择了这门课。', 'sān fēn zhī yī de xuésheng xuǎnzé le zhè mén kè.', 'A third of the students chose this course.'),
    ],
  },
  // HSK5 与否
  'hsk5-i-06bb08bc': {
    structure: 'V/Adj + 与否',
    explanation:
      'A literary tag meaning \'or not\', placed after a verb or adjective to form a \'whether … or not\' phrase that acts as a noun: 成功与否 \'success or failure\'. It belongs to written Chinese and often appears with 取决于, 关系到 or 无论. Compare 是否, which goes before the verb rather than after it.',
    examples: [
      ex('成功与否取决于你的努力。', 'chénggōng yǔfǒu qǔjué yú nǐ de nǔlì.', 'Whether you succeed depends on your effort.'),
      ex('无论同意与否，请尽快回复。', 'wúlùn tóngyì yǔfǒu, qǐng jǐnkuài huífù.', 'Whether or not you agree, please reply soon.'),
    ],
  },
  // HSK5 呗
  'hsk5-i-5e622d4c': {
    meaning: 'particle: \'just … / obviously\' (matter-of-fact or resigned)',
    structure: 'Sentence + 呗',
    explanation:
      'A sentence-final particle with a casual \'well, just … / what else?\' tone: the speaker presents something as obvious or as the only option, sometimes with a shrug of resignation. It is purely spoken and often follows suggestions (去就去呗) or obvious answers. Compare 吧, a more neutral suggestion marker.',
    examples: [
      ex('不懂就问呗。', 'bù dǒng jiù wèn bei.', 'If you don\'t understand, just ask.'),
      ex('没赶上车，那就走着去呗。', 'méi gǎnshàng chē, nà jiù zǒuzhe qù bei.', 'We missed the bus, so we\'ll just walk, then.'),
    ],
  },
  // HSK5 鉴于
  'hsk5-i-e7c5f3a3': {
    structure: '鉴于 + N / clause，main clause (decision)',
    explanation:
      'A formal preposition \'in view of, considering\', introducing the facts on which a decision or judgment is based. It opens the first clause and is typical of official notices and reports; speech uses 因为 or 考虑到. The main clause usually states an action or decision.',
    examples: [
      ex('鉴于天气原因，航班推迟起飞。', 'jiànyú tiānqì yuányīn, hángbān tuīchí qǐfēi.', 'In view of the weather, the flight\'s departure has been delayed.'),
      ex('鉴于他的出色表现，公司决定给他升职。', 'jiànyú tā de chūsè biǎoxiàn, gōngsī juédìng gěi tā shēngzhí.', 'In light of his excellent performance, the company decided to promote him.'),
    ],
  },
  // HSK5 非…不可
  'hsk5-i-76f58e51': {
    structure: 'Subj + 非 + V / clause + 不可',
    explanation:
      'A double negative meaning \'must, simply have to\' — literally \'not doing V is not acceptable\'. 非 stands before the verb or clause and 不可 closes it; it expresses strong determination or necessity. Spoken variants are 非…不行 and 非得…不可.',
    examples: [
      ex('这件事非他来做不可。', 'zhè jiàn shì fēi tā lái zuò bùkě.', 'This job has to be done by him and nobody else.'),
      ex('你的病很重，非住院不可。', 'nǐ de bìng hěn zhòng, fēi zhùyuàn bùkě.', 'Your illness is serious; you absolutely must be hospitalised.'),
    ],
  },
  // HSK5 岂不是
  'hsk5-i-01d73648': {
    structure: '(这样/那)…，岂不是 + predicate？',
    explanation:
      'A rhetorical question, \'wouldn\'t that be …?\', pointing out an obvious and usually undesirable consequence; the implied answer is \'yes\'. It stands before the predicate, needs no 吗, and is somewhat literary. The everyday equivalent is 那不就…了吗？.',
    examples: [
      ex('你现在走，岂不是太可惜了？', 'nǐ xiànzài zǒu, qǐ bú shì tài kěxī le?', 'Wouldn\'t it be a real shame to leave now?'),
      ex('这样做岂不是浪费时间？', 'zhèyàng zuò qǐ bú shì làngfèi shíjiān?', 'Wouldn\'t doing it this way be a waste of time?'),
    ],
  },
  // HSK5 兼
  'hsk5-i-7c80e8a3': {
    meaning: 'concurrently; and also (doubling as)',
    structure: 'N1 + 兼 + N2   |   Subj + 兼(任) + role',
    explanation:
      'Joins two roles or functions held at the same time: \'and also, doubling as\'. It sits between two nouns (老师兼朋友, 客厅兼书房) or acts as a verb meaning \'hold concurrently\' (兼任, 兼职). It is concise and written-leaning; in speech 同时也是 is more usual.',
    examples: [
      ex('他是我们的老师兼朋友。', 'tā shì wǒmen de lǎoshī jiān péngyou.', 'He is our teacher and also our friend.'),
      ex('这个房间是客厅兼书房。', 'zhège fángjiān shì kètīng jiān shūfáng.', 'This room is a living room that doubles as a study.'),
    ],
  },
  // HSK5 由此
  'hsk5-i-7db16aa2': {
    structure: '…，由此 + 可见 / V',
    explanation:
      'A written connective meaning \'from this, thereby\', using what was just said as the basis for a conclusion or the source of a result. It opens the clause, most often in 由此可见 \'from this we can see\'. In speech use 所以 or 这么看来.',
    examples: [
      ex('他三次都没来，由此可见他对这件事不感兴趣。', 'tā sān cì dōu méi lái, yóucǐ kějiàn tā duì zhè jiàn shì bù gǎn xìngqù.', 'He didn\'t come any of the three times, which shows he isn\'t interested.'),
      ex('两个公司开始合作，由此产生了很多新机会。', 'liǎng ge gōngsī kāishǐ hézuò, yóucǐ chǎnshēng le hěn duō xīn jīhuì.', 'The two companies began working together, and many new opportunities arose from this.'),
    ],
  },
  // HSK5 非得…不可
  'hsk5-i-1d889bba': {
    structure: 'Subj + 非得 + V + 不可/不行',
    explanation:
      'A more spoken form of 非…不可, \'absolutely must, insist on\'. 非得 (fēiděi) stands before the verb and 不可 or 不行 closes the clause; in casual speech the ending is often dropped (你非得去吗？). It stresses insistence or unavoidable necessity.',
    examples: [
      ex('这个问题非得你自己解决不可。', 'zhège wèntí fēiděi nǐ zìjǐ jiějué bùkě.', 'You have to solve this problem yourself.'),
      ex('他非得今天去不可，谁也劝不住。', 'tā fēiděi jīntiān qù bùkě, shéi yě quàn bu zhù.', 'He insists on going today; nobody can talk him out of it.'),
    ],
  },
  // HSK5 莫过于
  'hsk5-i-e9bb222e': {
    structure: '(最…的) A + 莫过于 + B',
    explanation:
      'Literary \'nothing surpasses …; the most … is …\', used to name the top item in a category. It follows a topic (often containing 最) and introduces the answer. It is written; in speech one says 最…的就是….',
    examples: [
      ex('人生最大的快乐莫过于和家人在一起。', 'rénshēng zuì dà de kuàilè mòguò yú hé jiārén zài yìqǐ.', 'Life\'s greatest joy is nothing other than being with family.'),
      ex('学习语言最好的方法莫过于多说多练。', 'xuéxí yǔyán zuì hǎo de fāngfǎ mòguò yú duō shuō duō liàn.', 'The best way to learn a language is simply to speak and practise a lot.'),
    ],
  },
  // HSK5 跟…似的
  'hsk5-i-61dac3b4': {
    structure: '跟 + N + 似的   |   V/Adj 得 + 跟 + N + 似的',
    explanation:
      'A spoken simile frame, \'just like, as if\': 跟 introduces the comparison and 似的 (shìde) closes it. The phrase can modify a following verb or adjective, act as the predicate, or describe a degree after 得. It is colloquial; 像…一样 is the neutral equivalent.',
    examples: [
      ex('他高兴得跟孩子似的。', 'tā gāoxìng de gēn háizi shìde.', 'He was as happy as a child.'),
      ex('今天热得跟夏天似的。', 'jīntiān rè de gēn xiàtiān shìde.', 'It\'s as hot as summer today.'),
    ],
  },
  // HSK5 不愧是
  'hsk5-i-ccb0a2ef': {
    structure: 'Subj + 不愧是 + N (title/role)',
    explanation:
      'Praises someone or something for living up to a name or reputation: \'truly is, worthy of being\'. It stands before the noun naming the role or title and is often a reaction to a good performance. Neutral to formal; 不愧为 is the written variant. It is not used for negative judgments.',
    examples: [
      ex('你不愧是老师，讲得这么清楚。', 'nǐ búkuì shì lǎoshī, jiǎng de zhème qīngchu.', 'You really are a teacher — you explain things so clearly.'),
      ex('这道菜真好吃，不愧是名厨做的。', 'zhè dào cài zhēn hǎochī, búkuì shì míngchú zuò de.', 'This dish is delicious — no wonder, a famous chef made it.'),
    ],
  },
  // HSK5 由…做主
  'hsk5-i-fecc2e83': {
    structure: 'Matter + 由 + Person + (来) 做主',
    explanation:
      'States who has the right to decide: \'it\'s up to X\'. 由 introduces the decision-maker and 做主 \'make the decision\' follows. It is neutral; 由…决定 is more formal, and 听…的 is more casual.',
    examples: [
      ex('这件事由你做主。', 'zhè jiàn shì yóu nǐ zuòzhǔ.', 'This matter is up to you.'),
      ex('婚姻大事应该由自己做主。', 'hūnyīn dàshì yīnggāi yóu zìjǐ zuòzhǔ.', 'A big decision like marriage should be your own to make.'),
    ],
  },
  // HSK5 一来…二来
  'hsk5-i-193b4566': {
    structure: '(statement)，一来 + reason 1，二来 + reason 2',
    explanation:
      'Lists two reasons or purposes: \'for one thing …, for another …\'. Each part opens a clause, usually after the main statement. It is spoken to neutral; 一是…二是… is more formal, and 首先…其次 is for ordered steps or points.',
    examples: [
      ex('我不想去，一来太远，二来没时间。', 'wǒ bù xiǎng qù, yīlái tài yuǎn, èrlái méi shíjiān.', 'I don\'t want to go — for one thing it\'s too far, and for another I don\'t have time.'),
      ex('多走路一来能锻炼身体，二来能省钱。', 'duō zǒulù yīlái néng duànliàn shēntǐ, èrlái néng shěng qián.', 'Walking more gives you exercise and also saves money.'),
    ],
  },
  // HSK5 不屑
  'hsk5-i-c773b8a6': {
    structure: 'Subj + 不屑 (于) + V   |   不屑的 + N',
    explanation:
      'Means \'think it beneath oneself (to do), disdain\'. It takes a verb phrase (不屑回答, 不屑于解释) or modifies a noun for a scornful look (不屑的表情). It is written-leaning and shows contempt; compare 不愿意, which is mere unwillingness without scorn.',
    examples: [
      ex('他不屑回答这种问题。', 'tā búxiè huídá zhè zhǒng wèntí.', 'He won\'t deign to answer that kind of question.'),
      ex('她用不屑的眼神看了我一眼。', 'tā yòng búxiè de yǎnshén kàn le wǒ yì yǎn.', 'She gave me a disdainful look.'),
    ],
  },
  // HSK5 因为…而…
  'hsk5-i-aef115f7': {
    structure: 'Subj + 因为 + cause + 而 + V',
    explanation:
      'A written frame linking a cause to its result within one clause: \'V because of …\'. The subject usually comes first, then 因为 + cause, and 而 connects it to the verb. In speech the two-clause 因为…所以… is preferred.',
    examples: [
      ex('他因为生病而缺席了会议。', 'tā yīnwèi shēngbìng ér quēxí le huìyì.', 'He missed the meeting because he was ill.'),
      ex('不要因为一次失败而放弃。', 'búyào yīnwèi yí cì shībài ér fàngqì.', 'Don\'t give up because of one failure.'),
    ],
  },
  // HSK5 假使…就…
  'hsk5-i-098c90aa': {
    structure: '假使 + condition，(Subj) + 就 + result',
    explanation:
      'A bookish conditional, \'supposing that …, then …\', close to 假如 and 如果. 假使 opens the condition, often an unlikely or counterfactual one, and 就 introduces the result. In everyday speech 如果 or 要是 is preferred.',
    examples: [
      ex('假使你早点出发，就不会迟到了。', 'jiǎshǐ nǐ zǎo diǎn chūfā, jiù bú huì chídào le.', 'Had you set off earlier, you wouldn\'t have been late.'),
      ex('假使明天天气好，我们就去爬山。', 'jiǎshǐ míngtiān tiānqì hǎo, wǒmen jiù qù pá shān.', 'Supposing the weather is good tomorrow, we\'ll go hiking.'),
    ],
  },
  // HSK5 借…之名
  'hsk5-i-c287758c': {
    meaning: 'under the pretext of',
    structure: '借 + N + 之名 + V',
    explanation:
      'Literary \'under the name / pretext of N\'. 借 introduces the borrowed name or cause, 之名 closes it, and the real action follows. It usually carries a critical tone, implying the stated reason is a cover; compare 以…的名义, which is neutral.',
    examples: [
      ex('有些商家借节日之名提高价格。', 'yǒuxiē shāngjiā jiè jiérì zhī míng tígāo jiàgé.', 'Some businesses raise prices under the pretext of the holidays.'),
      ex('他借工作之名，经常出去旅游。', 'tā jiè gōngzuò zhī míng, jīngcháng chūqù lǚyóu.', 'Using work as an excuse, he often goes travelling.'),
    ],
  },
  // HSK5 通过…使
  'hsk5-i-2711b71e': {
    structure: 'Subj + 通过 + means，使 + Obj + V/Adj',
    explanation:
      'Links a method to the result it brings about: \'by (doing) X, make Y become …\'. 通过 heads the means and 使 introduces the affected party and its new state. It is formal; the sentence needs a real subject before 通过 — *通过学习，使我进步了 is a classic error with no subject.',
    examples: [
      ex('他通过努力学习，使自己的汉语水平提高了很多。', 'tā tōngguò nǔlì xuéxí, shǐ zìjǐ de Hànyǔ shuǐpíng tígāo le hěn duō.', 'Through hard study, he greatly improved his Chinese.'),
      ex('城市通过修建地铁，使交通变得更方便了。', 'chéngshì tōngguò xiūjiàn dìtiě, shǐ jiāotōng biàn de gèng fāngbiàn le.', 'By building a subway, the city made getting around more convenient.'),
    ],
  },
  // HSK5 势必
  'hsk5-i-70a23160': {
    structure: 'Subj + 势必 + (会/要) + V',
    explanation:
      'A formal adverb, \'is bound to, will inevitably\', predicting a result from the way things are going. It goes before the verb, often with 会 or 要, and is typical of written argument. Compare 必然, which can also be an adjective (必然的结果), while 势必 is only an adverb.',
    examples: [
      ex('不注意休息，势必会影响健康。', 'bú zhùyì xiūxi, shìbì huì yǐngxiǎng jiànkāng.', 'Not getting enough rest is bound to affect your health.'),
      ex('价格上涨势必减少销量。', 'jiàgé shàngzhǎng shìbì jiǎnshǎo xiāoliàng.', 'Rising prices will inevitably reduce sales.'),
    ],
  },
  // HSK5 以…的名义
  'hsk5-i-5efd1499': {
    structure: '以 + N + 的名义 + V',
    explanation:
      'A formal frame, \'in the name of N, on behalf of N\'. 以 introduces the person, group or role whose name is used, and the action follows. It is neutral in tone; for a suspect pretext, 借…之名 is the critical alternative.',
    examples: [
      ex('我以公司的名义向大家表示感谢。', 'wǒ yǐ gōngsī de míngyì xiàng dàjiā biǎoshì gǎnxiè.', 'On behalf of the company, I\'d like to thank everyone.'),
      ex('他以个人的名义捐了一笔钱。', 'tā yǐ gèrén de míngyì juān le yì bǐ qián.', 'He donated a sum of money in his own name.'),
    ],
  },
  // HSK5 倘若
  'hsk5-i-e0eece60': {
    structure: '倘若 + condition，(Subj) + 就/便 + result',
    explanation:
      'A literary \'if, supposing\', equivalent to 如果 but used in writing and formal speech. It opens the condition clause and is often followed by 就, 便 or 的话. In everyday conversation it sounds stiff.',
    examples: [
      ex('倘若有问题，请随时联系我。', 'tǎngruò yǒu wèntí, qǐng suíshí liánxì wǒ.', 'Should there be any problems, please contact me at any time.'),
      ex('倘若他不来，我们就自己去。', 'tǎngruò tā bù lái, wǒmen jiù zìjǐ qù.', 'If he doesn\'t come, we\'ll go by ourselves.'),
    ],
  },
  // HSK5 所…的
  'hsk5-i-912f2317': {
    meaning: 'that which (Subj) V-s (object relative clause)',
    structure: '(Subj) + 所 + transitive V + 的 (+ N)',
    explanation:
      'A written marker placed before a transitive verb in a relative clause, showing that the head noun is the object of that verb: 我所知道的 \'what I know\'. It is optional, adds formality, and 的 is still required. It is not used with intransitive verbs.',
    examples: [
      ex('这就是我所知道的情况。', 'zhè jiù shì wǒ suǒ zhīdào de qíngkuàng.', 'That is everything I know about the situation.'),
      ex('他所说的话都是真的。', 'tā suǒ shuō de huà dōu shì zhēn de.', 'Everything he said is true.'),
    ],
  },
  // HSK6 分明
  'hsk6-i-a56d0388': {
    structure: 'Subj + 分明 + V/Adj (adverb)   |   N + 分明 (adjective)',
    explanation:
      'As an adverb, \'clearly, plainly\', usually pointing out a contradiction: the speaker insists the fact is obvious despite a denial (他分明在说谎). It sits before the predicate. As an adjective it means \'distinct, clear-cut\' (四季分明). 明明 is a near-identical, more spoken adverb.',
    examples: [
      ex('我分明看见他进去了，他却说没来过。', 'wǒ fēnmíng kànjiàn tā jìnqù le, tā què shuō méi lái guo.', 'I clearly saw him go in, yet he says he was never here.'),
      ex('这里四季分明，冬天下雪，夏天很热。', 'zhèlǐ sìjì fēnmíng, dōngtiān xià xuě, xiàtiān hěn rè.', 'The four seasons here are distinct: it snows in winter and is hot in summer.'),
    ],
  },
  // HSK6 历来
  'hsk6-i-08477b0e': {
    structure: 'Subj + 历来 + V/Adj',
    explanation:
      'A formal adverb, \'always, throughout history\': the situation has held from the past up to now, often said of institutions, places or traditions. It sits before the predicate. It is more written and covers a longer time span than 向来, which often describes one person\'s habits.',
    examples: [
      ex('这所学校历来重视体育。', 'zhè suǒ xuéxiào lìlái zhòngshì tǐyù.', 'This school has always placed great value on sport.'),
      ex('这个地区历来以茶叶闻名。', 'zhège dìqū lìlái yǐ cháyè wénmíng.', 'This region has long been famous for its tea.'),
    ],
  },
  // HSK6 事实上
  'hsk6-i-533e50dc': {
    structure: '事实上，+ clause',
    explanation:
      'A sentence adverb, \'in fact, actually\', introducing the real situation and usually correcting an assumption. It normally opens the clause and is neutral to formal. Compare 其实, more spoken, which often reveals something the listener didn\'t know.',
    examples: [
      ex('大家以为他很有钱，事实上他过得很节省。', 'dàjiā yǐwéi tā hěn yǒu qián, shìshí shang tā guò de hěn jiéshěng.', 'Everyone thinks he\'s rich; in fact he lives very frugally.'),
      ex('这个问题看起来简单，事实上很复杂。', 'zhège wèntí kàn qǐlai jiǎndān, shìshí shang hěn fùzá.', 'This problem looks simple, but it\'s actually very complicated.'),
    ],
  },
  // HSK6 随便
  'hsk6-i-8dcc210f': {
    structure: '随便 + V   |   随便 + QW (什么/哪儿/谁) + 都 …   |   Subj + 很随便 (adj.)',
    explanation:
      'As an adverb 随便 means doing something however one likes, without restriction; it sits before the verb or before a question word (随便什么, 随便哪儿) and pairs with 都. As an adjective it means casual or careless (他说话很随便). Spoken and very common; 随意 is the more written synonym, and a bare 随便 as a reply (\'whatever\') can sound offhand.',
    examples: [
      ex('你随便坐，别客气。', 'nǐ suíbiàn zuò, bié kèqi.', 'Sit wherever you like, make yourself at home.'),
      ex('随便你什么时候来都行。', 'suíbiàn nǐ shénme shíhou lái dōu xíng.', 'Come whenever you like; any time is fine.'),
    ],
  },
  // HSK6 勉强
  'hsk6-i-25273260': {
    structure: '勉强 + V/Adj (barely, reluctantly)   |   勉强 + sb (force someone)',
    explanation:
      'As an adverb before a verb, 勉强 means doing something reluctantly or only just managing it (勉强及格 = barely pass). As a verb it means to force someone against their will (别勉强他). Neutral register. Unlike 差点儿 (almost, but it did not happen), 勉强 means the result was achieved, just with difficulty.',
    examples: [
      ex('这次考试我勉强及格了。', 'zhè cì kǎoshì wǒ miǎnqiǎng jígé le.', 'I barely passed this exam.'),
      ex('他不想去，你就别勉强他了。', 'tā bù xiǎng qù, nǐ jiù bié miǎnqiǎng tā le.', 'He doesn\'t want to go, so don\'t force him.'),
    ],
  },
  // HSK6 无论如何
  'hsk6-i-6a6f1adb': {
    structure: '无论如何 (+ 都/也) + V   |   无论如何，clause',
    explanation:
      'A fixed phrase meaning \'no matter what, at all costs\'. It stands at the head of a clause or before the verb, usually followed by 都 or 也 and often 要/得 or a negative. Neutral to slightly formal. Do not confuse it with the frame 无论…都, which needs a question word or alternatives after 无论; 无论如何 is complete on its own.',
    examples: [
      ex('明天的会议你无论如何都要参加。', 'míngtiān de huìyì nǐ wúlùn rúhé dōu yào cānjiā.', 'You must attend tomorrow\'s meeting no matter what.'),
      ex('无论如何，我也不会放弃这个机会。', 'wúlùn rúhé, wǒ yě bú huì fàngqì zhège jīhuì.', 'In any case, I won\'t give up this chance.'),
    ],
  },
  // HSK6 决不
  'hsk6-i-e14742f6': {
    structure: 'Subj + 决不 (+ 会/能) + V',
    explanation:
      'A strong negative adverb meaning \'absolutely not, never\', expressing firm resolve or certainty. It goes directly before the verb, very often as 决不会 or 决不能. More emphatic and a little more written than 绝对不; it states determination, not a neutral fact (for plain negation use 不).',
    examples: [
      ex('我决不会再犯同样的错误。', 'wǒ jué bú huì zài fàn tóngyàng de cuòwù.', 'I will never make the same mistake again.'),
      ex('这件事我们决不能让步。', 'zhè jiàn shì wǒmen jué bù néng ràngbù.', 'We absolutely cannot back down on this.'),
    ],
  },
  // HSK6 较为
  'hsk6-i-bd5b0f45': {
    structure: '较为 + disyllabic Adj/V',
    explanation:
      'A written-register degree adverb meaning \'relatively, fairly\'. It goes before an adjective or verb, normally a two-syllable one (较为复杂, 较为明显). It is the formal counterpart of 比较; before a one-syllable adjective written Chinese uses 较 alone (较好), not 较为.',
    examples: [
      ex('这个方案较为合理，可以考虑采用。', 'zhège fāng\'àn jiàowéi hélǐ, kěyǐ kǎolǜ cǎiyòng.', 'This plan is relatively reasonable and could be adopted.'),
      ex('今年的气候较为干燥。', 'jīnnián de qìhòu jiàowéi gānzào.', 'This year\'s climate is comparatively dry.'),
    ],
  },
  // HSK6 不断
  'hsk6-i-9442258a': {
    structure: '不断 (地) + V   |   N + 不断 (predicate: never stops)',
    explanation:
      'An adverb meaning \'continuously, constantly\', placed before verbs of change or effort (不断提高, 不断发展, 不断努力). Common in speech and writing. 一直 stresses an unbroken state, whereas 不断 stresses ongoing, repeated progress. It can also be a predicate: 笑声不断 \'the laughter never stopped\'.',
    examples: [
      ex('他的汉语水平在不断提高。', 'tā de Hànyǔ shuǐpíng zài búduàn tígāo.', 'His Chinese is constantly improving.'),
      ex('我们要不断学习新的知识。', 'wǒmen yào búduàn xuéxí xīn de zhīshi.', 'We must keep learning new things.'),
    ],
  },
  // HSK6 无疑
  'hsk6-i-fb4c5fb4': {
    structure: 'Subj + 无疑 + 是/V …',
    explanation:
      'A written-register adverb meaning \'without doubt\', placed before the predicate and very often before 是 (这无疑是…). It states the speaker\'s confident judgement. It is more formal than 肯定 and more compact than 毫无疑问, which normally heads the whole sentence.',
    examples: [
      ex('这无疑是他最好的一部作品。', 'zhè wúyí shì tā zuì hǎo de yí bù zuòpǐn.', 'This is undoubtedly his best work.'),
      ex('互联网无疑改变了人们的生活方式。', 'hùliánwǎng wúyí gǎibiàn le rénmen de shēnghuó fāngshì.', 'The internet has undoubtedly changed the way people live.'),
    ],
  },
  // HSK6 存心
  'hsk6-i-98d2612e': {
    structure: 'Subj + (是) + 存心 + V',
    explanation:
      'An adverb meaning \'on purpose\', usually with a bad intention such as annoying or making trouble; it sits before the verb, often in 是存心…(的). Spoken. 故意 is the common neutral-to-negative word, while 特意 means going out of one\'s way for someone\'s benefit; 存心 implies premeditated ill will.',
    examples: [
      ex('他是存心跟我作对。', 'tā shì cúnxīn gēn wǒ zuòduì.', 'He\'s deliberately setting himself against me.'),
      ex('我不是存心让你难过的。', 'wǒ bú shì cúnxīn ràng nǐ nánguò de.', 'I didn\'t mean to upset you.'),
    ],
  },
  // HSK6 终究
  'hsk6-i-6bb66956': {
    meaning: 'after all / in the end',
    structure: 'Subj + 终究 + 会/是/V …',
    explanation:
      'An adverb meaning \'after all, in the end\', stressing that something is ultimately so whatever happens; it precedes the predicate, often 终究会 or 终究是. Slightly literary. 终于 means \'finally\' after a wait, and 毕竟 gives a reason; 终究 stresses an inevitable outcome or someone\'s underlying nature.',
    examples: [
      ex('谎言终究会被揭穿。', 'huǎngyán zhōngjiū huì bèi jiēchuān.', 'Lies will be exposed in the end.'),
      ex('他终究还是个孩子，别对他要求太高。', 'tā zhōngjiū hái shì ge háizi, bié duì tā yāoqiú tài gāo.', 'He\'s only a child after all; don\'t expect too much of him.'),
    ],
  },
  // HSK6 过于
  'hsk6-i-38a915af': {
    structure: '过于 + disyllabic Adj/V',
    explanation:
      'A written-register degree adverb meaning \'too, unduly\', placed before two-syllable adjectives or mental verbs (过于紧张, 过于担心). It is the formal equivalent of 太, but unlike 太…了 it does not take a final 了, and it carries a critical tone.',
    examples: [
      ex('你不必过于担心。', 'nǐ búbì guòyú dānxīn.', 'You needn\'t worry too much.'),
      ex('这篇文章的结论过于简单。', 'zhè piān wénzhāng de jiélùn guòyú jiǎndān.', 'This article\'s conclusion is overly simplistic.'),
    ],
  },
  // HSK6 充分
  'hsk6-i-71af5905': {
    structure: '充分 + V (利用/发挥/准备)   |   N + 很充分 (adj.)',
    explanation:
      'As an adverb it means \'fully, to the full extent\' and precedes verbs such as 利用, 发挥, 认识, 考虑. As an adjective it means \'sufficient, ample\' (理由很充分, 准备得很充分). Common in writing. Unlike 完全 \'completely\', 充分 implies making the most of what is available.',
    examples: [
      ex('我们要充分利用这段时间。', 'wǒmen yào chōngfèn lìyòng zhè duàn shíjiān.', 'We should make full use of this time.'),
      ex('他的理由很充分，大家都同意了。', 'tā de lǐyóu hěn chōngfèn, dàjiā dōu tóngyì le.', 'His reasons were convincing, and everyone agreed.'),
    ],
  },
  // HSK6 渐渐
  'hsk6-i-a17bf5cb': {
    structure: '渐渐 (地) + V/Adj + 了   |   渐渐地，clause',
    explanation:
      'An adverb meaning \'gradually, little by little\', placed before verbs or adjectives of change, usually with 了 or a directional complement (渐渐暗了下来); with 地 it can open the clause. Compared with 逐渐, which is more formal and step-by-step, 渐渐 is more descriptive and natural in narration.',
    examples: [
      ex('天渐渐黑了。', 'tiān jiànjiàn hēi le.', 'It gradually grew dark.'),
      ex('渐渐地，我习惯了这里的生活。', 'jiànjiàn de, wǒ xíguàn le zhèlǐ de shēnghuó.', 'Little by little, I got used to life here.'),
    ],
  },
  // HSK6 无奈
  'hsk6-i-127ae2c5': {
    meaning: 'helpless; have no choice / unfortunately',
    structure: '无奈地 + V   |   …，无奈 + clause   |   感到很无奈',
    explanation:
      'Means \'helpless, having no choice\'. It works as an adjective (感到很无奈), as an adverbial with 地 (无奈地摇头), or at the head of a second clause meaning \'but unfortunately\' (想去，无奈没时间). Fairly written. 只好 is the adverb for the only option left; 无奈 expresses the feeling of being powerless.',
    examples: [
      ex('他无奈地摇了摇头。', 'tā wúnài de yáo le yáo tóu.', 'He shook his head helplessly.'),
      ex('我很想去，无奈工作太忙。', 'wǒ hěn xiǎng qù, wúnài gōngzuò tài máng.', 'I\'d love to go, but unfortunately work is too busy.'),
    ],
  },
  // HSK6 立即
  'hsk6-i-c574e787': {
    structure: '立即 + V',
    explanation:
      'An adverb meaning \'immediately, at once\', placed right before the verb. It is formal and typical of notices, instructions and news; in speech 马上 or 立刻 is more natural. Unlike 马上, it is not used for \'soon\' in casual promises (我马上就到).',
    examples: [
      ex('接到通知后，他立即出发了。', 'jiēdào tōngzhī hòu, tā lìjí chūfā le.', 'After receiving the notice, he set off at once.'),
      ex('发现问题请立即报告。', 'fāxiàn wèntí qǐng lìjí bàogào.', 'Please report any problem immediately.'),
    ],
  },
  // HSK6 急忙
  'hsk6-i-8aab08fc': {
    structure: 'Subj + 急忙 + V   |   急急忙忙 (地) + V',
    explanation:
      'An adverb describing an action done hastily, usually in narration of past events; it goes before the verb and can be reduplicated as 急急忙忙. 赶紧 and 赶快 can be used in commands (赶快走！), but 急忙 only describes what someone did, so it is not used in imperatives.',
    examples: [
      ex('听到电话响，她急忙跑去接。', 'tīngdào diànhuà xiǎng, tā jímáng pǎo qù jiē.', 'Hearing the phone ring, she hurried to answer it.'),
      ex('他急忙收拾东西出了门。', 'tā jímáng shōushi dōngxi chū le mén.', 'He hastily packed his things and went out.'),
    ],
  },
  // HSK6 相比之下
  'hsk6-i-8c121ac1': {
    structure: 'A …，相比之下，B …',
    explanation:
      'A linking phrase placed at the start of the second clause to contrast it with what was just said (\'by comparison\'). Neutral to formal; similar to 比较起来. Unlike 比, it does not build a comparison sentence by itself; it connects two separate statements.',
    examples: [
      ex('北京冬天很冷，相比之下，上海暖和多了。', 'Běijīng dōngtiān hěn lěng, xiāngbǐ zhīxià, Shànghǎi nuǎnhuo duō le.', 'Beijing is cold in winter; Shanghai, by comparison, is much warmer.'),
      ex('他的作业很认真，相比之下，我的太马虎了。', 'tā de zuòyè hěn rènzhēn, xiāngbǐ zhīxià, wǒ de tài mǎhu le.', 'His homework is careful; mine, in comparison, is far too sloppy.'),
    ],
  },
  // HSK6 最终
  'hsk6-i-96fd4c2a': {
    structure: '最终 + V   |   最终 (的) + N',
    explanation:
      'Means \'finally, ultimately\'. As an adverb it precedes the verb; as an attributive it modifies nouns (最终结果). Neutral to formal. 终于 expresses relief after a long wait for a wished-for result, while 最终 simply reports the final outcome, good or bad.',
    examples: [
      ex('经过讨论，我们最终选择了第二个方案。', 'jīngguò tǎolùn, wǒmen zuìzhōng xuǎnzé le dì-èr gè fāng\'àn.', 'After discussion, we finally chose the second plan.'),
      ex('比赛的最终结果明天公布。', 'bǐsài de zuìzhōng jiéguǒ míngtiān gōngbù.', 'The final results of the competition will be announced tomorrow.'),
    ],
  },
  // HSK6 徒劳
  'hsk6-i-eca67c05': {
    structure: '(…) 是徒劳的   |   徒劳地 + V   |   徒劳无功',
    explanation:
      'Means \'futile, to no avail\'. It is mostly a predicate (…是徒劳的) or appears in the set phrase 徒劳无功, and occasionally works as an adverbial with 地. Written register; the colloquial way to say \'for nothing\' is the adverb 白 (白跑一趟).',
    examples: [
      ex('再怎么解释也是徒劳的。', 'zài zěnme jiěshì yě shì túláo de.', 'No matter how you explain, it\'s futile.'),
      ex('他徒劳地找了一整天。', 'tā túláo de zhǎo le yì zhěng tiān.', 'He searched all day in vain.'),
    ],
  },
  // HSK6 的确
  'hsk6-i-c762bbae': {
    structure: 'Subj + 的确 + Pred   |   的确，clause',
    explanation:
      'An adverb confirming that something really is so (\'indeed, truly\'), placed before the predicate or at the head of the sentence, often agreeing with what someone just said. Common in speech and writing. 确实 is close in meaning but can also be an adjective (消息很确实); 的确 is only an adverb.',
    examples: [
      ex('这家饭馆的菜的确不错。', 'zhè jiā fànguǎn de cài díquè búcuò.', 'The food at this restaurant really is good.'),
      ex('的确，我们应该早点儿出发。', 'díquè, wǒmen yīnggāi zǎo diǎnr chūfā.', 'Indeed, we should leave a bit earlier.'),
    ],
  },
  // HSK6 必然
  'hsk6-i-05ff0f8f': {
    structure: '必然 (+ 会) + V   |   必然 (的) + N   |   是必然的',
    explanation:
      'As an adverb it means \'inevitably, necessarily\' before the verb (必然会…); as an adjective it means \'inevitable\' (必然结果, 这是必然的). Formal. It is stronger than 一定: 必然 stresses logical or causal necessity, while 一定 often just shows the speaker\'s confidence.',
    examples: [
      ex('不注意休息，身体必然会出问题。', 'bú zhùyì xiūxi, shēntǐ bìrán huì chū wèntí.', 'If you don\'t rest, your health will inevitably suffer.'),
      ex('失败是必然的结果。', 'shībài shì bìrán de jiéguǒ.', 'Failure is the inevitable result.'),
    ],
  },
  // HSK6 不然
  'hsk6-i-5e32c6d9': {
    structure: 'Clause 1，不然 (的话) + Clause 2',
    explanation:
      'Introduces what will happen if the first clause is not carried out; it heads the second clause, often as 不然的话 and followed by 就 or 会. Spoken. 否则 is the more formal equivalent and 要不 the most colloquial.',
    examples: [
      ex('快走吧，不然就要迟到了。', 'kuài zǒu ba, bùrán jiù yào chídào le.', 'Let\'s hurry, otherwise we\'ll be late.'),
      ex('多穿点儿衣服，不然你会感冒的。', 'duō chuān diǎnr yīfu, bùrán nǐ huì gǎnmào de.', 'Put on more clothes, or you\'ll catch a cold.'),
    ],
  },
  // HSK6 瞬间
  'hsk6-i-fdf285b7': {
    structure: '瞬间 + V   |   (在) … 的那一瞬间',
    explanation:
      'A noun meaning \'an instant, a split second\', used as a time expression: before the verb (瞬间消失) or in 在…的(那)一瞬间. Vivid and somewhat written. 立刻 is an adverb about prompt action, whereas 瞬间 describes how fast a change happens.',
    examples: [
      ex('灯一关，房间瞬间暗了下来。', 'dēng yì guān, fángjiān shùnjiān àn le xiàlái.', 'As soon as the light went off, the room instantly went dark.'),
      ex('看到她的那一瞬间，我就认出来了。', 'kàndào tā de nà yí shùnjiān, wǒ jiù rèn chūlái le.', 'The instant I saw her, I recognized her.'),
    ],
  },
  // HSK6 特意
  'hsk6-i-64e2c263': {
    meaning: 'specially; expressly (for a purpose)',
    structure: 'Subj + 特意 + (为/给 sb) + V',
    explanation:
      'An adverb meaning \'specially, going out of one\'s way\', usually for someone else\'s benefit; it goes before the verb, often with 为/给 + person. Positive nuance, unlike 故意 \'on purpose\', which usually implies a bad motive. 特地 is a near-synonym.',
    examples: [
      ex('这是我特意为你做的蛋糕。', 'zhè shì wǒ tèyì wèi nǐ zuò de dàngāo.', 'This is a cake I made especially for you.'),
      ex('他特意从上海赶来参加婚礼。', 'tā tèyì cóng Shànghǎi gǎnlái cānjiā hūnlǐ.', 'He came all the way from Shanghai specially for the wedding.'),
    ],
  },
  // HSK6 及时
  'hsk6-i-96b53d06': {
    structure: '及时 + V   |   N + 很及时 (adj.)',
    explanation:
      'As an adverb it means \'promptly, without delay\' before the verb (及时处理, 及时赶到); as an adjective it means \'timely, just when needed\' (这场雨很及时). 按时 means \'on schedule, at the set time\', whereas 及时 means before it is too late.',
    examples: [
      ex('幸亏医生及时赶到。', 'xìngkuī yīshēng jíshí gǎndào.', 'Luckily the doctor arrived in time.'),
      ex('有问题要及时解决。', 'yǒu wèntí yào jíshí jiějué.', 'Problems should be dealt with promptly.'),
    ],
  },
  // HSK6 仅仅
  'hsk6-i-6c0c8aad': {
    structure: '仅仅 + V/Num/phrase   |   不仅仅 (是) …',
    explanation:
      'An emphatic form of 仅 meaning \'only, merely\', placed before verbs, numbers or phrases to stress a small amount or narrow scope; common in 不仅仅是… \'not merely\'. More written and more emphatic than 只.',
    examples: [
      ex('他仅仅用了三天就学会了。', 'tā jǐnjǐn yòng le sān tiān jiù xuéhuì le.', 'It took him a mere three days to learn it.'),
      ex('这不仅仅是钱的问题。', 'zhè bù jǐnjǐn shì qián de wèntí.', 'This isn\'t merely a question of money.'),
    ],
  },
  // HSK6 暂时
  'hsk6-i-aa64426f': {
    structure: '暂时 (+ 不/没) + V   |   暂时 (的) + N',
    explanation:
      'Means \'for the time being, temporarily\'. As an adverb it precedes the verb and is often followed by a negative (暂时不用); as an attributive it modifies nouns (暂时的困难). It implies the situation will change later, unlike 一时, which suggests a brief moment, often of inability.',
    examples: [
      ex('这个问题暂时不能解决。', 'zhège wèntí zànshí bù néng jiějué.', 'This problem can\'t be solved for the time being.'),
      ex('困难只是暂时的。', 'kùnnan zhǐ shì zànshí de.', 'The difficulties are only temporary.'),
    ],
  },
  // HSK6 相互
  'hsk6-i-bf71e8cc': {
    structure: '相互 + disyllabic V   |   相互 (的) + N',
    explanation:
      'Means \'mutually, each other\'. It goes before two-syllable verbs (相互帮助, 相互理解) or modifies nouns directly (相互关系, 相互作用). Formal. As an adverb it is interchangeable with 互相, but only 相互 can modify a noun.',
    examples: [
      ex('同事之间应该相互帮助。', 'tóngshì zhījiān yīnggāi xiānghù bāngzhù.', 'Colleagues should help each other.'),
      ex('这两个因素是相互影响的。', 'zhè liǎng gè yīnsù shì xiānghù yǐngxiǎng de.', 'These two factors influence each other.'),
    ],
  },
  // HSK6 方才
  'hsk6-i-a2ec7770': {
    structure: '方才 (time word = 刚才)   |   直到/…后，Subj + 方才 + V (= 才)',
    explanation:
      'A literary word with two uses: a time word meaning \'just now\' (方才的事), and an adverb meaning \'only then\', like 才 after a condition or time (直到…方才…). Written or old-fashioned style; in everyday speech use 刚才 and 才 instead.',
    examples: [
      ex('你方才说的话我都听到了。', 'nǐ fāngcái shuō de huà wǒ dōu tīngdào le.', 'I heard everything you said just now.'),
      ex('直到天黑，他方才回到家。', 'zhídào tiān hēi, tā fāngcái huídào jiā.', 'He only got home after dark.'),
    ],
  },
  // HSK6 原本
  'hsk6-i-0e97dd5e': {
    structure: 'Subj + 原本 + V/是 …，(后来/但是) …',
    explanation:
      'An adverb meaning \'originally, at first\', placed before the predicate and implying that things later changed; often followed by 但是, 可是 or 后来. Close to 本来 and 原来; 原本 is a little more written, and unlike 原来 it does not express a sudden discovery (\'so it turns out\').',
    examples: [
      ex('我原本打算周末去爬山，后来下雨了。', 'wǒ yuánběn dǎsuan zhōumò qù páshān, hòulái xià yǔ le.', 'I had originally planned to go hiking at the weekend, but then it rained.'),
      ex('这里原本是一片农田。', 'zhèlǐ yuánběn shì yí piàn nóngtián.', 'This area was originally farmland.'),
    ],
  },
  // HSK6 忽然
  'hsk6-i-ef73fab9': {
    structure: 'Subj + 忽然 + V   |   忽然，clause',
    explanation:
      'An adverb indicating that something happens suddenly and unexpectedly; it goes before the verb or at the start of a clause. 突然 is also an adjective (很突然, 突然的消息), but 忽然 is only an adverb, so you cannot say 很忽然.',
    examples: [
      ex('我们正在聊天，外面忽然下起了大雨。', 'wǒmen zhèngzài liáotiān, wàimian hūrán xià qǐ le dàyǔ.', 'We were chatting when it suddenly started pouring outside.'),
      ex('他忽然想起忘了带钥匙。', 'tā hūrán xiǎngqǐ wàng le dài yàoshi.', 'He suddenly remembered he\'d forgotten his keys.'),
    ],
  },
  // HSK6 尤其
  'hsk6-i-a1f781da': {
    structure: 'General statement，尤其 (是) + N/clause   |   尤其 + Adj/V',
    explanation:
      'An adverb that singles out one member of a group as especially so; it follows a broader statement, often as 尤其是 + noun, or goes before an adjective or verb. 特别 is also an adjective (很特别), while 尤其 is only an adverb and normally needs a preceding general claim.',
    examples: [
      ex('我喜欢运动，尤其是游泳。', 'wǒ xǐhuan yùndòng, yóuqí shì yóuyǒng.', 'I like sports, especially swimming.'),
      ex('这里冬天很冷，晚上尤其冷。', 'zhèlǐ dōngtiān hěn lěng, wǎnshang yóuqí lěng.', 'It\'s cold here in winter, particularly at night.'),
    ],
  },
  // HSK6 目前
  'hsk6-i-6a724b03': {
    structure: '目前 (+ Subj) + V   |   Subj + 目前 + V   |   目前 (的) + N',
    explanation:
      'A time noun meaning \'at present, currently\', placed at the head of the sentence, after the subject, or before a noun with 的. Slightly more formal than 现在 and refers to the current stage of a situation, not the exact present moment (现在几点, not 目前几点).',
    examples: [
      ex('目前我们还没有收到他的回复。', 'mùqián wǒmen hái méiyǒu shōudào tā de huífù.', 'We haven\'t received his reply yet.'),
      ex('这是目前最好的办法。', 'zhè shì mùqián zuì hǎo de bànfǎ.', 'This is the best solution for now.'),
    ],
  },
  // HSK6 先前
  'hsk6-i-d1672277': {
    structure: '先前 + clause   |   比先前 + Adj   |   先前 (的) + N',
    explanation:
      'A time noun meaning \'before, previously\', placed at the head of a clause or before a noun, often contrasting with now (先前…，现在…). Slightly literary. Close to 以前 and 之前, but 先前 cannot follow another time phrase (三天以前, not 三天先前).',
    examples: [
      ex('他比先前瘦多了。', 'tā bǐ xiānqián shòu duō le.', 'He\'s much thinner than before.'),
      ex('先前的计划已经取消了。', 'xiānqián de jìhuà yǐjīng qǔxiāo le.', 'The previous plan has been cancelled.'),
    ],
  },
  // HSK6 迅速
  'hsk6-i-6f2f304f': {
    structure: '迅速 (地) + V   |   V + 得 + 很迅速   |   N + 很迅速 (adj.)',
    explanation:
      'Means \'rapid, swift\'. As an adverb it precedes the verb (迅速发展); as an adjective it can be a predicate or degree complement (动作很迅速, 发展得很迅速). Written and formal; 快 is the everyday word, and 立即 means \'at once\' rather than \'at speed\'.',
    examples: [
      ex('这座城市发展得非常迅速。', 'zhè zuò chéngshì fāzhǎn de fēicháng xùnsù.', 'This city is developing very rapidly.'),
      ex('消防队员迅速赶到了现场。', 'xiāofáng duìyuán xùnsù gǎndào le xiànchǎng.', 'The firefighters quickly arrived on the scene.'),
    ],
  },
  // HSK6 反复
  'hsk6-i-dd7897fe': {
    structure: '反复 + V   |   (N) + 反复 (verb: recur, fluctuate)',
    explanation:
      'As an adverb it means \'over and over\', placed before the verb (反复练习, 反复考虑) and implying careful repetition. As a verb it means \'to recur or fluctuate\' (病情反复). 一再 stresses someone doing or asking for something again and again; 反复 stresses repeating the same process many times.',
    examples: [
      ex('这篇课文我反复读了好几遍。', 'zhè piān kèwén wǒ fǎnfù dú le hǎo jǐ biàn.', 'I read this text over and over several times.'),
      ex('经过反复考虑，她决定辞职。', 'jīngguò fǎnfù kǎolǜ, tā juédìng cízhí.', 'After much deliberation, she decided to resign.'),
    ],
  },
  // HSK6 偷偷
  'hsk6-i-8f63cfe6': {
    structure: '偷偷 (地) + V',
    explanation:
      'An adverb meaning \'secretly, stealthily, without others noticing\', placed before the verb, often with 地. Spoken. 暗暗 refers to something done inwardly or silently in one\'s mind, while 偷偷 describes hidden physical actions.',
    examples: [
      ex('他偷偷地看了她一眼。', 'tā tōutōu de kàn le tā yì yǎn.', 'He stole a glance at her.'),
      ex('孩子们偷偷把糖藏了起来。', 'háizimen tōutōu bǎ táng cáng le qǐlái.', 'The kids secretly hid the candy.'),
    ],
  },
  // HSK6 稍
  'hsk6-i-d674e418': {
    structure: '稍 + V/Adj + 一下/一点儿/些',
    explanation:
      'A degree adverb meaning \'slightly, a little\', placed before a verb or adjective and usually followed by 一下, 一点儿 or 些 (稍等一下). More written than its everyday form 稍微. Unlike 有点儿, which often complains, 稍 is neutral.',
    examples: [
      ex('请稍等一下，他马上就来。', 'qǐng shāo děng yíxià, tā mǎshàng jiù lái.', 'Please wait a moment; he\'ll be right here.'),
      ex('这件衣服稍大了一点儿。', 'zhè jiàn yīfu shāo dà le yìdiǎnr.', 'This jacket is a little too big.'),
    ],
  },
  // HSK6 唯一
  'hsk6-i-e805014a': {
    structure: '唯一 (的) + N   |   是 … 唯一的 + N',
    explanation:
      'An attributive adjective meaning \'only, sole\', placed before the noun, usually with 的 (唯一的办法). It cannot take 很 or work as a normal predicate. Do not confuse it with 只, an adverb that goes before verbs; 唯一 modifies nouns.',
    examples: [
      ex('他是我唯一的朋友。', 'tā shì wǒ wéiyī de péngyou.', 'He is my only friend.'),
      ex('这是解决问题的唯一办法。', 'zhè shì jiějué wèntí de wéiyī bànfǎ.', 'This is the only way to solve the problem.'),
    ],
  },
  // HSK6 略有
  'hsk6-i-d4444065': {
    structure: '(比 …) + 略有 + disyllabic N/V (不同/增加/提高)',
    explanation:
      'A written phrase meaning \'show a slight…, have a little\', where 略 = slightly and 有 takes a two-syllable noun or nominalized verb (略有不同, 略有增加). Formal; the spoken equivalent is 有一点儿. Compare 略 + V without 有 (略懂 \'know a little\').',
    examples: [
      ex('两种说法略有不同。', 'liǎng zhǒng shuōfǎ lüè yǒu bùtóng.', 'The two expressions differ slightly.'),
      ex('今年的收入比去年略有增加。', 'jīnnián de shōurù bǐ qùnián lüè yǒu zēngjiā.', 'This year\'s income rose slightly compared with last year.'),
    ],
  },
  // HSK6 突然
  'hsk6-i-8d1b9559': {
    structure: '突然 + V   |   很/太 + 突然 (adj.)   |   突然的 + N',
    explanation:
      'Works both as an adverb (\'suddenly\', before the verb or at the head of a clause) and as an adjective (\'sudden\': 太突然了, 突然的变化). This makes it broader than 忽然, which is only an adverb and cannot take 很 or modify a noun.',
    examples: [
      ex('车突然停了下来。', 'chē tūrán tíng le xiàlái.', 'The car suddenly stopped.'),
      ex('这个消息太突然了。', 'zhège xiāoxi tài tūrán le.', 'This news is so sudden.'),
    ],
  },
  // HSK6 居然
  'hsk6-i-53efab65': {
    structure: 'Subj + 居然 + V/Adj',
    explanation:
      'An adverb expressing surprise that something unexpected happened; it goes before the predicate, never before the subject. Used in speech and writing; very close to 竟然, which is slightly more formal. Its opposite in feeling is 果然 \'as expected\'.',
    examples: [
      ex('他居然一个人把这些活儿都干完了。', 'tā jūrán yí gè rén bǎ zhèxiē huór dōu gàn wán le.', 'Surprisingly, he finished all this work by himself.'),
      ex('这么简单的题你居然不会？', 'zhème jiǎndān de tí nǐ jūrán bú huì?', 'You actually can\'t do such an easy question?'),
    ],
  },
  // HSK6 彻底
  'hsk6-i-c85ff2e7': {
    structure: '彻底 + V   |   V + 得 + 很彻底',
    explanation:
      'Means \'thorough, completely\'. As an adverb it goes before the verb (彻底解决, 彻底忘了); as an adjective it can be a predicate or complement (打扫得很彻底). It is stronger than 完全 and stresses going all the way to the root of something.',
    examples: [
      ex('我们必须彻底解决这个问题。', 'wǒmen bìxū chèdǐ jiějué zhège wèntí.', 'We must solve this problem once and for all.'),
      ex('房间打扫得很彻底。', 'fángjiān dǎsǎo de hěn chèdǐ.', 'The room was cleaned thoroughly.'),
    ],
  },
  // HSK6 真正
  'hsk6-i-0b0dc50c': {
    structure: '真正 (的) + N   |   真正 + V',
    explanation:
      'As an attributive it means \'real, genuine\' (真正的朋友); as an adverb before verbs it means \'truly, genuinely\' (真正理解). 真 is a degree adverb with adjectives meaning \'really, very\' (真好); 真正 means authentic or to a genuine extent, not \'very\'.',
    examples: [
      ex('真正的朋友会在你困难的时候帮助你。', 'zhēnzhèng de péngyou huì zài nǐ kùnnan de shíhou bāngzhù nǐ.', 'A true friend helps you when you\'re in difficulty.'),
      ex('我现在才真正明白父母的辛苦。', 'wǒ xiànzài cái zhēnzhèng míngbai fùmǔ de xīnkǔ.', 'Only now do I truly understand how hard my parents worked.'),
    ],
  },
  // HSK6 不免
  'hsk6-i-ef1e10e5': {
    structure: 'Situation，Subj + 不免 + V/Adj',
    explanation:
      'An adverb meaning \'inevitably, cannot help but\', stating that a result naturally follows from the situation; it goes before the predicate of the second clause, often with a feeling (不免有些紧张). 难免 can also be an adjective (错误是难免的); 不免 is only an adverb and is not followed by a negative.',
    examples: [
      ex('第一次上台演讲，他不免有些紧张。', 'dì-yī cì shàngtái yǎnjiǎng, tā bùmiǎn yǒuxiē jǐnzhāng.', 'Giving a speech on stage for the first time, he was inevitably a bit nervous.'),
      ex('离开家乡多年，她不免常常想家。', 'líkāi jiāxiāng duō nián, tā bùmiǎn chángcháng xiǎng jiā.', 'Away from her hometown for years, she can\'t help often feeling homesick.'),
    ],
  },
  // HSK6 不知不觉
  'hsk6-i-0c32f4a4': {
    meaning: 'without realizing it / before one knows it',
    structure: '不知不觉 (中/地)，clause + 了   |   Subj + 不知不觉 + V',
    explanation:
      'A set phrase meaning \'without realizing it, before one knows it\', used adverbially at the head of a clause or before the verb, often with 中 or 地 and a completed result with 了. Neutral; typically about time slipping by or gradual change, not about unconscious states.',
    examples: [
      ex('不知不觉，一年又过去了。', 'bùzhī bùjué, yì nián yòu guòqù le.', 'Before we knew it, another year had gone by.'),
      ex('我们聊着聊着，不知不觉就到了半夜。', 'wǒmen liáo zhe liáo zhe, bùzhī bùjué jiù dào le bànyè.', 'We kept chatting, and before we realized it, it was midnight.'),
    ],
  },
  // HSK6 毫无疑问
  'hsk6-i-22be0e21': {
    structure: '毫无疑问，clause   |   (这) 是毫无疑问的',
    explanation:
      'A four-character phrase meaning \'beyond doubt\'. It usually heads the sentence followed by a comma, or serves as a predicate in 是…的. Formal. 无疑 does the same job but sits inside the sentence before the predicate; 毫无 + N is a general written pattern meaning \'not the slightest N\'.',
    examples: [
      ex('毫无疑问，他是这次比赛最好的选手。', 'háo wú yíwèn, tā shì zhè cì bǐsài zuì hǎo de xuǎnshǒu.', 'Without a doubt, he is the best player in this competition.'),
      ex('坚持锻炼对健康有好处，这是毫无疑问的。', 'jiānchí duànliàn duì jiànkāng yǒu hǎochu, zhè shì háo wú yíwèn de.', 'That regular exercise is good for your health is beyond doubt.'),
    ],
  },
  // HSK6 通常
  'hsk6-i-bd3455e2': {
    structure: '通常，clause   |   Subj + 通常 + V   |   通常 (的) + N',
    explanation:
      'Means \'usually, normally\', describing a regular pattern or general norm. It can head the sentence, follow the subject, or modify a noun (通常情况下). 常常 is about frequency, and 往往 states a regularity under certain conditions and is not used for future plans; 通常 is the neutral word for what is normal.',
    examples: [
      ex('我通常七点起床。', 'wǒ tōngcháng qī diǎn qǐchuáng.', 'I usually get up at seven.'),
      ex('通常情况下，这里周末人很多。', 'tōngcháng qíngkuàng xià, zhèlǐ zhōumò rén hěn duō.', 'Normally it\'s crowded here at weekends.'),
    ],
  },
  // HSK6 毫不犹豫
  'hsk6-i-a0b0cbf0': {
    structure: 'Subj + 毫不犹豫 (地) + V',
    explanation:
      'A set phrase used adverbially before a verb, usually with 地, meaning \'without the slightest hesitation\'. It follows the written pattern 毫不 + two-syllable word (\'not in the least\': 毫不在乎, 毫不客气). Compare 毫无 + noun (毫无疑问), where 无 negates a noun instead of a verb or adjective.',
    examples: [
      ex('他毫不犹豫地答应了。', 'tā háo bù yóuyù de dāying le.', 'He agreed without hesitation.'),
      ex('看到有人落水，她毫不犹豫地跳了下去。', 'kàndào yǒu rén luò shuǐ, tā háo bù yóuyù de tiào le xiàqù.', 'Seeing someone fall into the water, she jumped in without hesitating.'),
    ],
  },
  // HSK6 无一例外
  'hsk6-i-b9b480d9': {
    structure: 'Plural Subj + 无一例外 (地) + 都 + V',
    explanation:
      'A written phrase meaning \'without a single exception\'. It sits after a plural subject and before the predicate and is almost always followed by 都. Formal; in speech people say 全都 or 一个不落. It stresses that every member, not just most, fits the statement.',
    examples: [
      ex('参加考试的学生无一例外都通过了。', 'cānjiā kǎoshì de xuésheng wú yī lìwài dōu tōngguò le.', 'Every student who took the exam passed, without exception.'),
      ex('这些方法无一例外都失败了。', 'zhèxiē fāngfǎ wú yī lìwài dōu shībài le.', 'Every one of these methods failed, without exception.'),
    ],
  },
  // HSK6 反之
  'hsk6-i-9cb63423': {
    structure: 'A，反之 (，) B',
    explanation:
      'A literary connective meaning \'conversely, if not\', linking two statements where the second describes the opposite case; it heads the second clause. Written; in speech use 反过来说 or 相反. It contrasts two cases of a rule, rather than correcting a mistaken belief as 相反 can.',
    examples: [
      ex('努力就会进步，反之就会落后。', 'nǔlì jiù huì jìnbù, fǎnzhī jiù huì luòhòu.', 'If you work hard you\'ll progress; otherwise you\'ll fall behind.'),
      ex('需求增加，价格就上涨；反之，价格就下降。', 'xūqiú zēngjiā, jiàgé jiù shàngzhǎng; fǎnzhī, jiàgé jiù xiàjiàng.', 'When demand rises, prices go up; conversely, they fall.'),
    ],
  },
  // HSK6 之类
  'hsk6-i-4a851567': {
    structure: 'N (、N) + 之类 (的 + N)',
    explanation:
      'Placed after a noun or a short list to mean \'and things of that kind\'; it often appears as 之类的 + noun or ends the phrase as 之类的. Common in speech and writing. Similar to 等, but 之类 stresses the category and is vaguer, while 等 just marks that a list is incomplete.',
    examples: [
      ex('我不太喜欢吃甜点之类的东西。', 'wǒ bú tài xǐhuan chī tiándiǎn zhīlèi de dōngxi.', 'I don\'t really like desserts and that sort of thing.'),
      ex('桌上放着书、杂志之类的。', 'zhuō shang fàng zhe shū, zázhì zhīlèi de.', 'There are books, magazines and the like on the table.'),
    ],
  },
  // HSK6 相当于
  'hsk6-i-325c4184': {
    structure: 'A + 相当于 + B',
    explanation:
      'A verb phrase meaning \'is equivalent to, amounts to\', linking two things of comparable value, size or function. Neutral register. 等于 means \'equals\' and is exact or mathematical; 相当于 means roughly the same or comparable in effect.',
    examples: [
      ex('一公里相当于两里。', 'yì gōnglǐ xiāngdāngyú liǎng lǐ.', 'One kilometre is equivalent to two li.'),
      ex('他一个月的工资相当于我三个月的。', 'tā yí gè yuè de gōngzī xiāngdāngyú wǒ sān gè yuè de.', 'His monthly salary equals three months of mine.'),
    ],
  },
  // HSK6 换句话说
  'hsk6-i-71f09737': {
    structure: 'A，换句话说，B (restatement)',
    explanation:
      'A discourse marker introducing a restatement of the previous point in plainer or more direct terms; it heads the following clause with a comma. Neutral register; the written equivalent is 换言之. It rephrases rather than adding new information (that is 此外 or 另外).',
    examples: [
      ex('他没回我的信息，换句话说，他不想去。', 'tā méi huí wǒ de xìnxī, huàn jù huà shuō, tā bù xiǎng qù.', 'He didn\'t reply to my message; in other words, he doesn\'t want to go.'),
      ex('合同下个月到期，换句话说，我们得尽快做决定。', 'hétong xià gè yuè dàoqī, huàn jù huà shuō, wǒmen děi jǐnkuài zuò juédìng.', 'The contract expires next month; in other words, we need to decide soon.'),
    ],
  },
  // HSK6 即
  'hsk6-i-08d04eb3': {
    structure: 'A，即 B (namely)   |   A 即 B (= 就是)',
    explanation:
      'A literary word meaning \'that is, namely\', introducing an explanation or exact equivalent of what precedes; in definitions it also means \'is\' (= 就是). Written; spoken equivalents are 也就是 and 就是. Do not confuse it with 即 \'at once\' in compounds such as 立即 and 即将.',
    examples: [
      ex('会议定在下周一，即十月二十号。', 'huìyì dìng zài xià zhōuyī, jí shí yuè èrshí hào.', 'The meeting is set for next Monday, namely October 20th.'),
      ex('他提出了两个问题，即成本和时间。', 'tā tíchū le liǎng gè wèntí, jí chéngběn hé shíjiān.', 'He raised two issues, namely cost and time.'),
    ],
  },
  // HSK6 诸如
  'hsk6-i-e49211ab': {
    structure: '诸如 + N1、N2 + 之类/等 (的 + N)',
    explanation:
      'A written word meaning \'such as\', introducing a list of examples and usually closed by 之类 or 等. Formal; in speech use 比如 or 像. Unlike 比如, it introduces nouns inside a noun phrase rather than a whole example sentence.',
    examples: [
      ex('他经常处理诸如合同、报销之类的事务。', 'tā jīngcháng chǔlǐ zhūrú hétong, bàoxiāo zhīlèi de shìwù.', 'He often handles matters such as contracts and expense claims.'),
      ex('这里可以进行诸如游泳、划船等活动。', 'zhèlǐ kěyǐ jìnxíng zhūrú yóuyǒng, huáchuán děng huódòng.', 'Activities such as swimming and boating are available here.'),
    ],
  },
  // HSK6 等
  'hsk6-i-3d3e17a1': {
    structure: 'N1、N2 + 等 (+ N)   |   N1、N2 + 等 + Num + N (closed list)',
    explanation:
      'A particle placed after a list to mean \'etc., and so on\' when the list is incomplete; 等等 is the more open-ended form. When followed by a number that matches the items (北京、上海等两个城市), it closes a complete list instead. Leans written; 之类 is vaguer and stresses the kind of thing.',
    examples: [
      ex('我去过北京、上海、广州等城市。', 'wǒ qù guo Běijīng, Shànghǎi, Guǎngzhōu děng chéngshì.', 'I\'ve been to Beijing, Shanghai, Guangzhou and other cities.'),
      ex('超市里有水果、蔬菜、肉等。', 'chāoshì li yǒu shuǐguǒ, shūcài, ròu děng.', 'The supermarket has fruit, vegetables, meat and so on.'),
    ],
  },
  // HSK6 因而
  'hsk6-i-c1347eea': {
    structure: 'Cause，(Subj) + 因而 + result',
    explanation:
      'A written conjunction introducing the result of what precedes; it heads the second clause or comes right after its subject. Formal; the spoken equivalent is 所以, and 因此 is a close written synonym. It pairs naturally with 由于 in the cause clause.',
    examples: [
      ex('他平时很少锻炼，因而身体比较差。', 'tā píngshí hěn shǎo duànliàn, yīn\'ér shēntǐ bǐjiào chà.', 'He rarely exercises, and as a result his health is rather poor.'),
      ex('由于天气恶劣，航班因而推迟。', 'yóuyú tiānqì èliè, hángbān yīn\'ér tuīchí.', 'Because of the bad weather, the flight was consequently delayed.'),
    ],
  },
  // HSK6 此外
  'hsk6-i-6ee8f332': {
    structure: 'A。此外，B   |   …，此外 + 还/也 + V',
    explanation:
      'A connective meaning \'in addition, besides\', adding a further point; it heads the new sentence or clause, often followed by 还 or 也. Neutral to formal; in speech 另外 or 还有 are common. With a negative it can also mean \'apart from this\' (此外没有别的).',
    examples: [
      ex('这家酒店环境很好，此外，价格也不贵。', 'zhè jiā jiǔdiàn huánjìng hěn hǎo, cǐwài, jiàgé yě bú guì.', 'This hotel is pleasant; besides, it isn\'t expensive.'),
      ex('他会说英语，此外还会一点儿日语。', 'tā huì shuō Yīngyǔ, cǐwài hái huì yìdiǎnr Rìyǔ.', 'He speaks English, and in addition a little Japanese.'),
    ],
  },
  // HSK6 纵然
  'hsk6-i-1cb97ed7': {
    structure: '纵然 A，(Subj) + 也/还 + B',
    explanation:
      'A literary concessive conjunction meaning \'even if\', followed by 也 or 还 in the second clause. Written; in speech use 即使 or 就算. Unlike 虽然, which concedes a real fact, 纵然 usually introduces a hypothetical or extreme case.',
    examples: [
      ex('纵然困难再大，我们也要坚持下去。', 'zòngrán kùnnan zài dà, wǒmen yě yào jiānchí xiàqù.', 'However great the difficulties, we will carry on.'),
      ex('纵然失败了，也不必灰心。', 'zòngrán shībài le, yě búbì huīxīn.', 'Even if you fail, there\'s no need to lose heart.'),
    ],
  },
  // HSK6 故此
  'hsk6-i-4451f973': {
    structure: 'Cause，故此 + result',
    explanation:
      'A literary conjunction meaning \'therefore, for this reason\', heading the result clause. Very formal and slightly old-fashioned, found in notices and formal letters; everyday equivalents are 所以 and 因此. It is not used together with 因为 in casual speech.',
    examples: [
      ex('他身体不适，故此未能出席会议。', 'tā shēntǐ búshì, gùcǐ wèi néng chūxí huìyì.', 'He was unwell and hence could not attend the meeting.'),
      ex('本店内部装修，故此暂停营业三天。', 'běn diàn nèibù zhuāngxiū, gùcǐ zàntíng yíngyè sān tiān.', 'The shop is being renovated, so it will be closed for three days.'),
    ],
  },
  // HSK6 以防
  'hsk6-i-4fe9399b': {
    structure: 'Precaution，以防 + undesired V/clause',
    explanation:
      'A written phrase meaning \'so as to guard against, in case\', heading the second clause and naming the undesirable event being prevented. Formal; spoken alternatives are 免得, 省得 or 万一…. Note that 以防 introduces the risk, not the precaution itself.',
    examples: [
      ex('出门带把伞，以防下雨。', 'chū mén dài bǎ sǎn, yǐfáng xià yǔ.', 'Take an umbrella when you go out, in case it rains.'),
      ex('请保存好文件，以防丢失。', 'qǐng bǎocún hǎo wénjiàn, yǐfáng diūshī.', 'Please save the file properly in case it gets lost.'),
    ],
  },
  // HSK6 相反
  'hsk6-i-4aa7963e': {
    structure: 'A，相反，B   |   跟/与 … 相反',
    explanation:
      'At the start of a clause it means \'on the contrary, instead\', introducing the opposite of what was expected or stated. As an adjective or verb it means \'opposite\' (方向相反, 跟…相反). Neutral register; 反之 is a formal \'conversely\' that contrasts two hypothetical cases.',
    examples: [
      ex('他没有生气，相反，他还笑了。', 'tā méiyǒu shēngqì, xiāngfǎn, tā hái xiào le.', 'He didn\'t get angry; on the contrary, he laughed.'),
      ex('结果和我们预想的完全相反。', 'jiéguǒ hé wǒmen yùxiǎng de wánquán xiāngfǎn.', 'The result was the complete opposite of what we expected.'),
    ],
  },
  // HSK6 简言之
  'hsk6-i-f889cd79': {
    structure: '…。简言之，summary clause',
    explanation:
      'A literary discourse marker meaning \'to put it briefly\', heading a sentence that condenses what came before. Written; in speech use 简单地说 or 总之. 换言之 restates a point in other words, while 简言之 boils it down.',
    examples: [
      ex('简言之，这个计划行不通。', 'jiǎn yán zhī, zhège jìhuà xíng bu tōng.', 'In short, this plan won\'t work.'),
      ex('简言之，我们需要更多的时间和资金。', 'jiǎn yán zhī, wǒmen xūyào gèng duō de shíjiān hé zījīn.', 'In a word, we need more time and money.'),
    ],
  },
  // HSK6 综上所述
  'hsk6-i-901f12fd': {
    structure: '综上所述，conclusion',
    explanation:
      'A fixed formal phrase meaning \'to sum up the above\', used at the start of a concluding paragraph in essays, reports and speeches. Strictly written or formal-spoken; in conversation use 总之 or 总的来说. It must follow an actual list of arguments.',
    examples: [
      ex('综上所述，这个方案是可行的。', 'zōng shàng suǒ shù, zhège fāng\'àn shì kěxíng de.', 'To sum up, this plan is feasible.'),
      ex('综上所述，我们建议推迟这个项目。', 'zōng shàng suǒ shù, wǒmen jiànyì tuīchí zhège xiàngmù.', 'In summary, we recommend postponing the project.'),
    ],
  },
  // HSK6 同样
  'hsk6-i-90828dc8': {
    structure: '同样 + Adj/V   |   同样 (的) + N   |   A。同样，B',
    explanation:
      'Means \'the same; likewise\'. It modifies nouns (同样的问题), goes before an adjective or verb (同样重要), or heads a sentence to draw a parallel. Unlike 一样, it is not used in the comparison frame 跟…一样; 同样 stands on its own.',
    examples: [
      ex('学习很重要，休息同样重要。', 'xuéxí hěn zhòngyào, xiūxi tóngyàng zhòngyào.', 'Studying is important; rest is equally important.'),
      ex('我们遇到了同样的问题。', 'wǒmen yùdào le tóngyàng de wèntí.', 'We ran into the same problem.'),
    ],
  },
  // HSK6 同时
  'hsk6-i-3bd33bf4': {
    meaning: 'at the same time / meanwhile; also',
    structure: '(在) A 的同时，B   |   A，同时 (也) B   |   同时 + V',
    explanation:
      'As a time noun it means \'at the same time\' (在…的同时); as a connective it means \'also, moreover\', linking two parallel facts; before a verb it means \'simultaneously\'. Neutral register. 一边…一边 only describes one person doing two actions at once.',
    examples: [
      ex('他在工作的同时还在读研究生。', 'tā zài gōngzuò de tóngshí hái zài dú yánjiūshēng.', 'He\'s doing a master\'s degree while working.'),
      ex('这个办法省钱，同时也省时间。', 'zhège bànfǎ shěng qián, tóngshí yě shěng shíjiān.', 'This method saves money and at the same time saves time.'),
    ],
  },
  // HSK6 况且
  'hsk6-i-b933172a': {
    structure: 'Reason A，况且 (+ Subj) + 还/也/又 + reason B',
    explanation:
      'A conjunction adding a further, often weightier reason in an argument; it heads the second clause and is frequently followed by 还, 也 or 又. Neutral to written. 何况 is similar but can also be rhetorical (\'let alone\'), whereas 况且 simply adds another reason.',
    examples: [
      ex('太晚了，况且外面还在下雨，你别走了。', 'tài wǎn le, kuàngqiě wàimian hái zài xià yǔ, nǐ bié zǒu le.', 'It\'s too late, and besides it\'s still raining outside, so don\'t go.'),
      ex('这件衣服太贵，况且我也不需要。', 'zhè jiàn yīfu tài guì, kuàngqiě wǒ yě bù xūyào.', 'This jacket is too expensive; moreover, I don\'t need it.'),
    ],
  },
  // HSK6 说到
  'hsk6-i-29a18150': {
    structure: '说到 + topic，clause   |   一说到 … 就 …',
    explanation:
      'Introduces a topic at the start of a sentence, often picking up something just mentioned (\'speaking of, when it comes to\'); 一说到…就… means \'whenever the subject comes up\'. Spoken. 至于 shifts to a new topic in a more formal way (\'as for\').',
    examples: [
      ex('说到吃，他可是专家。', 'shuōdào chī, tā kě shì zhuānjiā.', 'When it comes to food, he\'s a real expert.'),
      ex('说到旅行，你暑假打算去哪儿？', 'shuōdào lǚxíng, nǐ shǔjià dǎsuan qù nǎr?', 'Speaking of travel, where are you planning to go this summer?'),
    ],
  },
  // HSK6 使得
  'hsk6-i-7fe316ce': {
    meaning: 'to cause / make (so that)',
    structure: 'Cause (event) + 使得 + Subj + V/Adj',
    explanation:
      'A causative verb meaning \'to make, to cause\': an event or situation (the subject) leads someone or something to a new state. More written than 让 and 使, and its subject is normally a fact, not a person giving orders; you would not say 老师使得我们写作业.',
    examples: [
      ex('大雨使得比赛不得不推迟。', 'dàyǔ shǐde bǐsài bùdébù tuīchí.', 'The heavy rain forced the match to be postponed.'),
      ex('他的努力使得公司的业绩大大提高。', 'tā de nǔlì shǐde gōngsī de yèjì dàdà tígāo.', 'His efforts greatly improved the company\'s performance.'),
    ],
  },
  // HSK6 如此
  'hsk6-i-3fb82f86': {
    structure: '如此 + Adj/V   |   既然如此，…   |   事情就是如此',
    explanation:
      'Written equivalent of 这样/这么: \'so, such, in this way\'. Before an adjective or verb it marks degree (如此美丽), and it can also stand alone as a pronoun or predicate (事实就是如此, 既然如此), which 这么 cannot do. Typical of formal writing and speeches; in casual speech use 这么/这样.',
    examples: [
      ex('这里的风景如此美丽，难怪游客那么多。', 'zhèlǐ de fēngjǐng rúcǐ měilì, nánguài yóukè nàme duō.', 'The scenery here is so beautiful; no wonder there are so many tourists.'),
      ex('既然如此，我们就按原计划进行吧。', 'jìrán rúcǐ, wǒmen jiù àn yuán jìhuà jìnxíng ba.', 'In that case, let\'s go ahead with the original plan.'),
    ],
  },
  // HSK6 继而
  'hsk6-i-940fc2b1': {
    structure: '(先) A，继而 B',
    explanation:
      'Written connective meaning \'and then, subsequently\': B follows A in time and usually grows out of it. It opens the second clause and needs a preceding event, often signalled by 先 or 起初. Much more formal than 然后/接着, and it links two stages of one development rather than an unrelated next step.',
    examples: [
      ex('他先是一愣，继而大笑起来。', 'tā xiān shì yí lèng, jì\'ér dàxiào qǐlái.', 'He was stunned for a moment, then burst out laughing.'),
      ex('双方先在价格上产生分歧，继而在交货时间上也发生了争执。', 'shuāngfāng xiān zài jiàgé shang chǎnshēng fēnqí, jì\'ér zài jiāohuò shíjiān shang yě fāshēng le zhēngzhí.', 'The two sides first disagreed on price, and then also quarrelled over the delivery date.'),
    ],
  },
  // HSK6 然而
  'hsk6-i-4babe5dc': {
    structure: '(虽然) A，然而 B',
    explanation:
      'Contrastive conjunction \'however, yet\', used at the head of the second clause or sentence. It is more formal and literary than 但是/可是. Unlike English \'however\', it cannot be moved after the subject (not 他然而…); for a contrast placed after the subject use 却.',
    examples: [
      ex('计划看起来很完美，然而执行起来困难重重。', 'jìhuà kàn qǐlái hěn wánměi, rán\'ér zhíxíng qǐlái kùnnan chóngchóng.', 'The plan looks perfect; in practice, however, it is full of difficulties.'),
      ex('他努力了很多年，然而始终没有成功。', 'tā nǔlì le hěn duō nián, rán\'ér shǐzhōng méiyǒu chénggōng.', 'He worked hard for many years, yet he never succeeded.'),
    ],
  },
  // HSK6 借此
  'hsk6-i-2f884fae': {
    structure: '…，借此 (+ 机会) + V',
    explanation:
      '\'Taking advantage of this / by this means\'. 此 points back to the situation just mentioned, and 借此 introduces what is achieved through it. Formal, very common in speeches (借此机会…). Do not confuse with 因此, which states a result rather than a means, or with 借助, which needs its own object.',
    examples: [
      ex('我想借此机会感谢大家的支持。', 'wǒ xiǎng jiècǐ jīhuì gǎnxiè dàjiā de zhīchí.', 'I\'d like to take this opportunity to thank everyone for their support.'),
      ex('公司举办这次活动，希望借此提高品牌知名度。', 'gōngsī jǔbàn zhè cì huódòng, xīwàng jiècǐ tígāo pǐnpái zhīmíngdù.', 'The company is holding this event in the hope of raising brand awareness through it.'),
    ],
  },
  // HSK6 以至
  'hsk6-i-e88980b0': {
    structure: 'A，以至(于) B   |   A、B 以至 C (range)',
    explanation:
      'Introduces the extent or consequence reached: \'so much so that\'. It also extends a series \'up to, even\' (城市以至整个社会). Written register. Its near-homophone 以致 is used only for undesirable results, while 以至 is neutral.',
    examples: [
      ex('他工作太投入，以至于忘了吃饭。', 'tā gōngzuò tài tóurù, yǐzhìyú wàng le chīfàn.', 'He was so absorbed in his work that he forgot to eat.'),
      ex('这种变化影响到城市、乡村以至整个社会。', 'zhè zhǒng biànhuà yǐngxiǎng dào chéngshì, xiāngcūn yǐzhì zhěnggè shèhuì.', 'This change affects cities, the countryside and even society as a whole.'),
    ],
  },
  // HSK6 度
  'hsk6-i-304fce68': {
    structure: 'Adj/N + 度 → N (知名度、满意度、透明度)',
    explanation:
      'A bound suffix that turns an adjective or noun into a measurable \'degree of X\' noun. The result is usually described as 高/低 or combined with 提高/降低. Compare 性 (重要性 \'importance\'), which names a quality; 度 always implies a scale that can rise or fall.',
    examples: [
      ex('这家餐厅的顾客满意度很高。', 'zhè jiā cāntīng de gùkè mǎnyìdù hěn gāo.', 'Customer satisfaction at this restaurant is very high.'),
      ex('公司应该提高管理的透明度。', 'gōngsī yīnggāi tígāo guǎnlǐ de tòumíngdù.', 'The company should make its management more transparent.'),
    ],
  },
  // HSK6 者
  'hsk6-i-a9539ed7': {
    structure: 'V/Adj/N + 者 → person (读者、作者、强者)   |   前者 / 后者',
    explanation:
      'Written suffix forming nouns for \'one who does / is X\': 读者 reader, 志愿者 volunteer, 强者 the strong. It also gives 前者/后者 \'the former/the latter\'. Compare 家 (作家, a recognised expert) and 员 (服务员, a job role); 者 is more neutral and bookish.',
    examples: [
      ex('这本杂志很受年轻读者欢迎。', 'zhè běn zázhì hěn shòu niánqīng dúzhě huānyíng.', 'This magazine is very popular with young readers.'),
      ex('前者价格便宜，后者质量更好。', 'qiánzhě jiàgé piányi, hòuzhě zhìliàng gèng hǎo.', 'The former is cheaper; the latter is of better quality.'),
    ],
  },
  // HSK6 制
  'hsk6-i-83708e28': {
    structure: 'N/Num + 制 → system (会员制、责任制、三班制、公制)',
    explanation:
      'Bound suffix meaning \'system, scheme\' for how something is organised or measured: 会员制 membership system, 十进制 decimal system. It cannot stand alone in this sense; the free word is 制度. Typically the object of 实行, 采用 or 实施.',
    examples: [
      ex('这家健身房实行会员制。', 'zhè jiā jiànshēnfáng shíxíng huìyuánzhì.', 'This gym runs on a membership system.'),
      ex('工厂采用三班制，二十四小时不停工。', 'gōngchǎng cǎiyòng sānbānzhì, èrshísì xiǎoshí bù tínggōng.', 'The factory uses a three-shift system and runs around the clock.'),
    ],
  },
  // HSK6 处
  'hsk6-i-59e25af6': {
    structure: 'Adj/V + 处 (chù) → aspect/point (好处、长处、难处、用处)',
    explanation:
      'With the reading chù, 处 forms abstract nouns meaning \'point, aspect\': 好处 benefit, 长处 strength, 难处 difficulty, 用处 use. It also names offices (办事处). Do not confuse it with the verb 处 chǔ \'handle, get along\' (处理, 相处).',
    examples: [
      ex('每个人都有自己的长处。', 'měi gè rén dōu yǒu zìjǐ de chángchù.', 'Everyone has their own strengths.'),
      ex('这个工具看起来简单，用处可不少。', 'zhège gōngjù kàn qǐlái jiǎndān, yòngchù kě bù shǎo.', 'This tool looks simple, but it has plenty of uses.'),
    ],
  },
  // HSK6 罢了
  'hsk6-i-a267532f': {
    structure: '(不过 / 只是 / 无非) + … + 罢了',
    explanation:
      'Sentence-final \'that\'s all, merely\', used to play something down. It usually pairs with 不过, 只是 or 无非 earlier in the sentence. Close to 而已, which is a little more neutral and written; do not confuse with 算了 \'forget it\'.',
    examples: [
      ex('我不过是随便说说罢了，你别当真。', 'wǒ búguò shì suíbiàn shuōshuo bàle, nǐ bié dàngzhēn.', 'I was just talking, that\'s all; don\'t take it seriously.'),
      ex('他只是运气好罢了，并没有什么特别的本事。', 'tā zhǐshì yùnqì hǎo bàle, bìng méiyǒu shénme tèbié de běnshi.', 'He was merely lucky; he has no special skill.'),
    ],
  },
  // HSK6 就是了
  'hsk6-i-98954d12': {
    structure: '(Subj) + V … + 就是了',
    explanation:
      'Spoken sentence-final phrase meaning \'just do X, that\'s all (no need to worry)\' or \'I\'ll do it, all right?\'. It reassures or settles a matter firmly, often in instructions and promises. Compare 罢了, which belittles a fact rather than proposing an action.',
    examples: [
      ex('你放心，我明天一早送过去就是了。', 'nǐ fàngxīn, wǒ míngtiān yìzǎo sòng guòqù jiù shì le.', 'Don\'t worry, I\'ll just bring it over first thing tomorrow.'),
      ex('不会用没关系，照着说明书做就是了。', 'bú huì yòng méi guānxi, zhàozhe shuōmíngshū zuò jiù shì le.', 'It doesn\'t matter if you don\'t know how; just follow the instructions.'),
    ],
  },
  // HSK6 哦
  'hsk6-i-350a4d29': {
    structure: '哦 (ò / ó)，…   |   … + 哦 (o, sentence-final)',
    explanation:
      'As an interjection at the start, ò shows sudden understanding (\'oh, I see\') and ó shows doubt (\'oh? really?\'). At the end of a sentence, light o softens a reminder or warning and sounds friendly. It is spoken and informal, softer than 啊 in reminders.',
    examples: [
      ex('哦，原来你早就知道了。', 'ò, yuánlái nǐ zǎo jiù zhīdào le.', 'Oh, so you knew all along.'),
      ex('明天要考试，别忘了复习哦！', 'míngtiān yào kǎoshì, bié wàng le fùxí o!', 'There\'s an exam tomorrow, don\'t forget to review!'),
    ],
  },
  // HSK6 哟
  'hsk6-i-592fbc97': {
    meaning: 'oh! (surprise); lively sentence-final particle',
    structure: '哟 (yō)，…   |   … + 哟 (yo, sentence-final)',
    explanation:
      'At the start, yō is an interjection of surprise, sometimes teasing (\'oh!, well well\'). At the end, light yo adds a lively, friendly tone to reminders and exclamations. It is not a warning particle in itself: the warning comes from the content. Strongly colloquial, more playful than 啊.',
    examples: [
      ex('哟，你怎么来了？', 'yō, nǐ zěnme lái le?', 'Oh! What are you doing here?'),
      ex('慢点儿走哟，路上滑！', 'màn diǎnr zǒu yo, lùshang huá!', 'Walk slowly now, the road is slippery!'),
    ],
  },
  // HSK6 呀
  'hsk6-i-4cbb9072': {
    meaning: 'oh! (surprise); form of 啊 after vowels',
    structure: '呀 (yā)，…   |   …(a/e/i/o/ü) + 呀 (ya)',
    explanation:
      'At the start, yā is an interjection of surprise (\'oh!\'). At the end of a sentence, ya is mostly the form 啊 takes after a word ending in a vowel (来呀, 去呀), adding urging, exclamation or a softer question. Spoken; its meaning is that of 啊, not surprise only.',
    examples: [
      ex('呀，下雪了！', 'yā, xià xuě le!', 'Oh, it\'s snowing!'),
      ex('你快来呀，大家都在等你！', 'nǐ kuài lái ya, dàjiā dōu zài děng nǐ!', 'Hurry up, everyone is waiting for you!'),
    ],
  },
  // HSK6 哪
  'hsk6-i-cd963c6b': {
    structure: '…(-n) + 哪 (na)',
    explanation:
      'Neutral-tone na is the form the particle 啊 takes after a syllable ending in -n: 天哪, 小心哪, 谢谢您哪. It adds exclamation, urging or warmth. Spoken. Do not confuse it with the question word 哪 nǎ \'which\'.',
    examples: [
      ex('天哪，这么多作业！', 'tiān na, zhème duō zuòyè!', 'Good heavens, so much homework!'),
      ex('你得小心哪，这条路晚上很黑。', 'nǐ děi xiǎoxīn na, zhè tiáo lù wǎnshang hěn hēi.', 'You must be careful, this road is very dark at night.'),
    ],
  },
  // HSK6 据
  'hsk6-i-7c71059e': {
    structure: '据 + source (+ 说/报道/统计/了解)，…',
    explanation:
      'Formal preposition \'according to\' that cites a source of information, normally at the head of the sentence: 据说, 据报道, 据统计. Compare 根据, which also gives the basis for an action (根据规定处理); 据 mostly reports where information comes from.',
    examples: [
      ex('据天气预报说，明天会下大雨。', 'jù tiānqì yùbào shuō, míngtiān huì xià dàyǔ.', 'According to the weather forecast, there will be heavy rain tomorrow.'),
      ex('据统计，今年的游客人数比去年增加了两成。', 'jù tǒngjì, jīnnián de yóukè rénshù bǐ qùnián zēngjiā le liǎng chéng.', 'Statistics show that visitor numbers this year are up twenty percent on last year.'),
    ],
  },
  // HSK6 依据
  'hsk6-i-d984d98f': {
    structure: '依据 + N (rules/facts)，…   |   (有/没有) + 依据 (noun)',
    explanation:
      'As a preposition, \'in accordance with\' a rule, law or fact; as a noun, \'basis, grounds\'. It is formal, common in legal and administrative language. 根据 is the everyday equivalent; 依据 stresses an authoritative standard.',
    examples: [
      ex('依据公司规定，员工每年有十五天带薪假。', 'yījù gōngsī guīdìng, yuángōng měi nián yǒu shíwǔ tiān dàixīnjià.', 'Under company rules, staff have fifteen days of paid leave a year.'),
      ex('你这样判断有什么依据吗？', 'nǐ zhèyàng pànduàn yǒu shénme yījù ma?', 'What grounds do you have for that judgement?'),
    ],
  },
  // HSK6 透过
  'hsk6-i-9e841476': {
    meaning: 'through (a medium); see past the surface',
    structure: '透过 + N + V   |   透过 + 现象 + 看 + 本质',
    explanation:
      '\'Through\': light or sight passing through a medium (透过窗户), or seeing past the surface to what lies behind. In mainland usage it differs from 通过 \'by means of, via\'; 透过 implies penetrating something. In Taiwan 透过 is also used like 通过.',
    examples: [
      ex('阳光透过窗户照进了房间。', 'yángguāng tòuguò chuānghu zhào jìn le fángjiān.', 'Sunlight shone into the room through the window.'),
      ex('我们要透过现象看本质。', 'wǒmen yào tòuguò xiànxiàng kàn běnzhì.', 'We need to look past appearances to the essence.'),
    ],
  },
  // HSK6 经由
  'hsk6-i-cb459361': {
    structure: '经由 + place/channel + V',
    explanation:
      'Formal \'via, by way of\', marking the route or channel something passes through. It stands before the verb phrase. Compare 经过, which can also mean \'pass by\' or \'after (a process)\'; 经由 only marks the route.',
    examples: [
      ex('这趟航班经由上海飞往东京。', 'zhè tàng hángbān jīngyóu Shànghǎi fēiwǎng Dōngjīng.', 'This flight goes to Tokyo via Shanghai.'),
      ex('申请材料需要经由学院统一提交。', 'shēnqǐng cáiliào xūyào jīngyóu xuéyuàn tǒngyī tíjiāo.', 'Application materials must be submitted collectively through the college.'),
    ],
  },
  // HSK6 自
  'hsk6-i-c8c0555d': {
    structure: '自 + time/place (+ 起/以来)   |   V + 自 + place (来自、选自)',
    explanation:
      'Formal \'from\' for a starting point in time or space. Unlike 从, it can follow a verb (来自, 出自, 选自) and appears in fixed notices like 自…起. In everyday speech use 从 before the verb.',
    examples: [
      ex('本规定自下月一日起实施。', 'běn guīdìng zì xià yuè yī rì qǐ shíshī.', 'This regulation takes effect from the first of next month.'),
      ex('这些留学生来自二十多个国家。', 'zhèxiē liúxuéshēng láizì èrshí duō gè guójiā.', 'These international students come from over twenty countries.'),
    ],
  },
  // HSK6 与…相比
  'hsk6-i-07ca9420': {
    structure: '与 + B + 相比，A …   |   A + 与 + B + 相比，…',
    explanation:
      'Sets up a comparison frame \'compared with B\'; the actual difference is stated in the main clause. Written register; the spoken version is 跟/和…比起来. Unlike A 比 B + Adj, the adjective is not inside the frame.',
    examples: [
      ex('与去年相比，今年的销售额增长了百分之二十。', 'yǔ qùnián xiāngbǐ, jīnnián de xiāoshòu\'é zēngzhǎng le bǎi fēn zhī èrshí.', 'Compared with last year, sales rose twenty percent this year.'),
      ex('与城市相比，农村的生活节奏慢得多。', 'yǔ chéngshì xiāngbǐ, nóngcūn de shēnghuó jiézòu màn de duō.', 'Compared with the city, life in the countryside moves much more slowly.'),
    ],
  },
  // HSK6 符合
  'hsk6-i-7f8eeb7d': {
    structure: 'A + (不) 符合 + 要求/标准/条件/事实/规定',
    explanation:
      'Verb \'conform to, meet, be in line with\'; its object is an abstract standard such as requirements, conditions or facts. Compare 适合 \'suit\' (a person or situation) and the adjective 合适. Not 符合我 for \'suits me\'.',
    examples: [
      ex('你的条件完全符合我们的招聘要求。', 'nǐ de tiáojiàn wánquán fúhé wǒmen de zhāopìn yāoqiú.', 'Your qualifications fully meet our hiring requirements.'),
      ex('这份报告的内容不符合事实。', 'zhè fèn bàogào de nèiróng bù fúhé shìshí.', 'The content of this report does not match the facts.'),
    ],
  },
  // HSK6 就…来看
  'hsk6-i-06620fb6': {
    structure: '就 + topic + 来看，…',
    explanation:
      '\'As far as X goes / judging by X\': limits the statement to one aspect. It opens the sentence and is written in tone; variants 就…来说 and 就…而言 are interchangeable. Do not drop 来 in writing (就…看 sounds clipped).',
    examples: [
      ex('就目前的情况来看，项目可以按时完成。', 'jiù mùqián de qíngkuàng lái kàn, xiàngmù kěyǐ ànshí wánchéng.', 'Judging by the present situation, the project can be finished on time.'),
      ex('就价格来看，这款手机很有优势。', 'jiù jiàgé lái kàn, zhè kuǎn shǒujī hěn yǒu yōushì.', 'In terms of price, this phone has a clear advantage.'),
    ],
  },
  // HSK6 面临
  'hsk6-i-cc5180c8': {
    structure: 'Subj + (正) 面临(着) + 问题/挑战/危机/选择',
    explanation:
      'Verb \'to face, be confronted with\'; its object is an abstract, usually difficult situation. Formal. Compare 面对, which implies actively confronting and can take concrete objects (面对镜子); 面临 means the situation has come upon the subject.',
    examples: [
      ex('毕业后，他面临着一个重要的选择。', 'bìyè hòu, tā miànlín zhe yí gè zhòngyào de xuǎnzé.', 'After graduating, he faced an important choice.'),
      ex('许多小企业正面临资金不足的问题。', 'xǔduō xiǎo qǐyè zhèng miànlín zījīn bùzú de wèntí.', 'Many small businesses are facing a shortage of funds.'),
    ],
  },
  // HSK6 在…过程中
  'hsk6-i-4f7ab21b': {
    structure: '在 + V-phrase/N (的) + 过程中，…',
    explanation:
      '\'In the course of, during\' a process that takes time. The frame opens the sentence and the main clause tells what happens along the way. Use 在…时/的时候 for a point in time; 过程中 stresses duration and development.',
    examples: [
      ex('在学习汉语的过程中，我认识了很多朋友。', 'zài xuéxí Hànyǔ de guòchéng zhōng, wǒ rènshi le hěn duō péngyou.', 'While learning Chinese, I made a lot of friends.'),
      ex('在搬家过程中，有几个盘子被打碎了。', 'zài bānjiā guòchéng zhōng, yǒu jǐ gè pánzi bèi dǎsuì le.', 'A few plates got broken during the move.'),
    ],
  },
  // HSK6 包括
  'hsk6-i-e3d4b98d': {
    structure: 'A + 包括 + B   |   …，包括 + B (+ 在内)，都 …',
    explanation:
      'Verb \'include\': A lists or contains members B. The frame 包括…在内 emphasises that B is also counted, usually followed by 都. Compare 包含, which is for abstract content contained inside something (包含意义).',
    examples: [
      ex('房租包括水费和电费。', 'fángzū bāokuò shuǐfèi hé diànfèi.', 'The rent includes water and electricity.'),
      ex('全班同学，包括老师在内，都参加了这次活动。', 'quán bān tóngxué, bāokuò lǎoshī zàinèi, dōu cānjiā le zhè cì huódòng.', 'The whole class, the teacher included, took part in the event.'),
    ],
  },
  // HSK6 从…看
  'hsk6-i-c6b1068c': {
    structure: '从 + evidence/angle + (来) 看，…',
    explanation:
      '\'Judging from / looking at it from\': introduces the evidence or viewpoint for a conclusion. It opens the sentence; 来 is optional, and 从…上看 is also common. Compare 看来 alone, which gives an impression without naming the basis.',
    examples: [
      ex('从他的表情看，事情不太顺利。', 'cóng tā de biǎoqíng kàn, shìqing bú tài shùnlì.', 'Judging from his expression, things aren\'t going well.'),
      ex('从长远来看，这项投资是值得的。', 'cóng chángyuǎn lái kàn, zhè xiàng tóuzī shì zhíde de.', 'In the long run, this investment is worth it.'),
    ],
  },
  // HSK6 在…基础上
  'hsk6-i-59256efe': {
    structure: '在 + N (的) + 基础上，V …',
    explanation:
      '\'On the basis of, building on\': the main clause describes something developed from N. Formal. A common mistake is 在…的基础下; the fixed form uses 上. Compare 基于, a single preposition with a similar meaning.',
    examples: [
      ex('我们在原有方案的基础上做了一些修改。', 'wǒmen zài yuányǒu fāng\'àn de jīchǔ shang zuò le yìxiē xiūgǎi.', 'We made some changes building on the original plan.'),
      ex('在充分调查的基础上，他们提出了新的建议。', 'zài chōngfèn diàochá de jīchǔ shang, tāmen tíchū le xīn de jiànyì.', 'On the basis of a thorough investigation, they put forward new proposals.'),
    ],
  },
  // HSK6 基于
  'hsk6-i-62e955fb': {
    structure: '基于 + N，…   |   … 是基于 + N + V 的',
    explanation:
      'Formal preposition \'based on, in view of\', usually with abstract reasons or data (基于安全考虑, 基于数据). It can open the sentence or appear in 是…的. 根据 is more everyday; 基于 often explains motives behind a decision.',
    examples: [
      ex('基于安全考虑，演唱会被推迟了。', 'jīyú ānquán kǎolǜ, yǎnchànghuì bèi tuīchí le.', 'For safety reasons, the concert was postponed.'),
      ex('这个结论是基于大量实验数据得出的。', 'zhège jiélùn shì jīyú dàliàng shíyàn shùjù déchū de.', 'This conclusion was drawn from a large amount of experimental data.'),
    ],
  },
  // HSK6 涉及
  'hsk6-i-414b008b': {
    meaning: 'to involve / touch on',
    structure: 'A + 涉及 (到) + B',
    explanation:
      'Verb \'involve, touch on, concern\': B is an area, group or issue that A extends to. Formal. It is a verb with a subject, not a preposition like 关于, so 涉及这个问题的书 is fine but 涉及这个问题，… as a frame is not.',
    examples: [
      ex('这个问题涉及很多部门。', 'zhège wèntí shèjí hěn duō bùmén.', 'This issue involves many departments.'),
      ex('这次讨论涉及到了环境保护和经济发展。', 'zhè cì tǎolùn shèjí dào le huánjìng bǎohù hé jīngjì fāzhǎn.', 'The discussion touched on environmental protection and economic development.'),
    ],
  },
  // HSK6 对于
  'hsk6-i-bbd547c5': {
    structure: '对于 + N，Subj + …   |   Subj + 对于 + N + V',
    explanation:
      'Preposition \'regarding, as for\', introducing the topic or object of an attitude. It may stand before or after the subject. Compare 对: 对 can also mark a person treated a certain way (他对我很好), where 对于 cannot be used.',
    examples: [
      ex('对于这个问题，大家的看法不一样。', 'duìyú zhège wèntí, dàjiā de kànfǎ bù yíyàng.', 'People see this issue differently.'),
      ex('我们对于他的建议非常重视。', 'wǒmen duìyú tā de jiànyì fēicháng zhòngshì.', 'We take his suggestion very seriously.'),
    ],
  },
  // HSK6 与…有关
  'hsk6-i-f91bacda': {
    structure: 'A + 与 + B + 有关   |   与 + B + 有关的 + N',
    explanation:
      '\'Be related to B\'. Can be a predicate or, with 的, modify a noun. Written; the spoken form is 跟/和…有关(系). The negative is 与…无关; adverbs such as 可能 or 密切 go before 与.',
    examples: [
      ex('他的失眠可能与工作压力有关。', 'tā de shīmián kěnéng yǔ gōngzuò yālì yǒuguān.', 'His insomnia may be related to stress at work.'),
      ex('请把与这个项目有关的文件都发给我。', 'qǐng bǎ yǔ zhège xiàngmù yǒuguān de wénjiàn dōu fā gěi wǒ.', 'Please send me all the documents related to this project.'),
    ],
  },
  // HSK6 在…下
  'hsk6-i-6f96b788': {
    structure: '在 + (N 的) + 帮助/支持/影响/条件/情况 + 下，…',
    explanation:
      '\'Under (conditions / influence / with the help of)\'. The noun is usually a two-syllable abstract word, and the frame opens the sentence. A common mistake is 在…的帮助中 or omitting 下; with 情况 and 条件 the frame is fixed.',
    examples: [
      ex('在老师的帮助下，他的成绩提高得很快。', 'zài lǎoshī de bāngzhù xià, tā de chéngjì tígāo de hěn kuài.', 'With the teacher\'s help, his grades improved quickly.'),
      ex('在这种情况下，我们只能取消旅行。', 'zài zhè zhǒng qíngkuàng xià, wǒmen zhǐ néng qǔxiāo lǚxíng.', 'Under these circumstances, we can only cancel the trip.'),
    ],
  },
  // HSK6 对于…而言
  'hsk6-i-fd3a8bf9': {
    structure: '对于 + N + 而言，…',
    explanation:
      '\'For N / as far as N is concerned\': states from whose standpoint the judgement holds. Written register; the spoken equivalent is 对…来说. It opens the sentence, and the main clause gives the evaluation.',
    examples: [
      ex('对于初学者而言，发音是最难的部分。', 'duìyú chūxuézhě éryán, fāyīn shì zuì nán de bùfen.', 'For beginners, pronunciation is the hardest part.'),
      ex('对于我们公司而言，这是一个难得的机会。', 'duìyú wǒmen gōngsī éryán, zhè shì yí gè nándé de jīhuì.', 'For our company, this is a rare opportunity.'),
    ],
  },
  // HSK6 借助
  'hsk6-i-c8490bdb': {
    structure: '借助 (于) + tool/means + V',
    explanation:
      '\'With the help of, by means of\' a tool, force or medium; the main verb follows. Formal. For help from people, 在…的帮助下 is more natural; 借此 refers back to something already mentioned instead of taking an object.',
    examples: [
      ex('借助翻译软件，他看懂了这封信。', 'jièzhù fānyì ruǎnjiàn, tā kàndǒng le zhè fēng xìn.', 'With the help of translation software, he understood the letter.'),
      ex('科学家借助卫星观察天气的变化。', 'kēxuéjiā jièzhù wèixīng guānchá tiānqì de biànhuà.', 'Scientists use satellites to observe changes in the weather.'),
    ],
  },
  // HSK6 令
  'hsk6-i-bd65e37c': {
    structure: 'A + 令 + (人/person) + feeling verb/Adj (令人满意、令人难忘)',
    explanation:
      'Written causative \'make (someone) feel\'. The object is usually 人 or a person, and what follows is a psychological verb or adjective such as 失望, 感动, 难忘. Compare 让 and 使: 让 is spoken and can also mean \'let/allow\', while 令 only causes emotional reactions.',
    examples: [
      ex('这次旅行令我终生难忘。', 'zhè cì lǚxíng lìng wǒ zhōngshēng nánwàng.', 'I will never forget this trip.'),
      ex('比赛结果令人十分失望。', 'bǐsài jiéguǒ lìng rén shífēn shīwàng.', 'The result of the match was very disappointing.'),
    ],
  },
  // HSK6 比如说
  'hsk6-i-62229d0f': {
    structure: '…，比如说 + example(s)',
    explanation:
      'Spoken \'for example, say\', introducing one or more instances after a general statement. 比如 is the neutral form and 例如 the written one. 比如说 can also introduce a hypothetical case (\'say, if…\'). It goes before the examples, never after them.',
    examples: [
      ex('我喜欢户外运动，比如说爬山和骑自行车。', 'wǒ xǐhuan hùwài yùndòng, bǐrú shuō páshān hé qí zìxíngchē.', 'I like outdoor sports, for example hiking and cycling.'),
      ex('有些水果维生素很多，比如说橙子和猕猴桃。', 'yǒuxiē shuǐguǒ wéishēngsù hěn duō, bǐrú shuō chéngzi hé míhóutáo.', 'Some fruits are rich in vitamins, such as oranges and kiwis.'),
    ],
  },
  // HSK6 算是
  'hsk6-i-76aafab5': {
    meaning: 'can be considered / counts as',
    structure: 'Subj + (还/也) 算是 + N/Adj (+ 了)',
    explanation:
      '\'Can be considered, more or less counts as\': a hedged, modest evaluation, often with 还 or 也. Mainly spoken. Compare plain 是 (a flat statement) and 称得上 (meets a high standard). It can also mean \'at last\' (总算是).',
    examples: [
      ex('他在这方面算是专家了。', 'tā zài zhè fāngmiàn suànshì zhuānjiā le.', 'In this area he more or less counts as an expert.'),
      ex('这次考试的成绩还算是不错。', 'zhè cì kǎoshì de chéngjì hái suànshì búcuò.', 'The result of this exam was fairly decent.'),
    ],
  },
  // HSK6 属于
  'hsk6-i-3941fd46': {
    structure: 'A + (不) 属于 + B (category/owner)',
    explanation:
      'Verb \'belong to\': A is a member of category B or is owned by B. It takes no aspect particles (not 属于了), and is negated with 不. Compare 是…的 for simple ownership (这是我的); 属于 sounds more formal and classificatory.',
    examples: [
      ex('鲸鱼属于哺乳动物，不属于鱼类。', 'jīngyú shǔyú bǔrǔ dòngwù, bù shǔyú yúlèi.', 'Whales are mammals, not fish.'),
      ex('这些荣誉属于全体队员。', 'zhèxiē róngyù shǔyú quántǐ duìyuán.', 'These honours belong to the whole team.'),
    ],
  },
  // HSK6 称得上
  'hsk6-i-76864ab7': {
    structure: 'A + 称得上 (是) + N/Adj   |   称不上',
    explanation:
      'Potential form \'deserves to be called, truly qualifies as\', with praise words such as 一流, 奇迹, 专家. Negative 称不上 \'hardly qualifies as\'. Compare 算是, which is hedged; 称得上 asserts that a high standard is met.',
    examples: [
      ex('这座桥称得上是建筑史上的奇迹。', 'zhè zuò qiáo chēng de shàng shì jiànzhù shǐ shang de qíjì.', 'This bridge deserves to be called a marvel of architectural history.'),
      ex('她做的菜称得上一流。', 'tā zuò de cài chēng de shàng yìliú.', 'Her cooking is truly first-class.'),
    ],
  },
  // HSK6 由…组成
  'hsk6-i-beb0905f': {
    structure: 'A + 由 + B (和 C) + 组成',
    explanation:
      '\'A consists of / is made up of B\'. 由 marks the parts and 组成 closes the frame. Do not say A 组成由 B. The active form B 组成 A also exists, and 构成 is a close written synonym.',
    examples: [
      ex('这个委员会由七名专家组成。', 'zhège wěiyuánhuì yóu qī míng zhuānjiā zǔchéng.', 'The committee is made up of seven experts.'),
      ex('水由氢和氧两种元素组成。', 'shuǐ yóu qīng hé yǎng liǎng zhǒng yuánsù zǔchéng.', 'Water consists of two elements, hydrogen and oxygen.'),
    ],
  },
  // HSK6 导致
  'hsk6-i-9899e5d4': {
    structure: 'Cause + 导致 + (bad) result (N or clause)',
    explanation:
      'Verb \'lead to, cause\', almost always with an undesirable result. The object can be a noun or a whole clause. Compare 造成 (usually a noun object like 损失) and 带来 (neutral or positive results).',
    examples: [
      ex('长期熬夜会导致免疫力下降。', 'chángqī áoyè huì dǎozhì miǎnyìlì xiàjiàng.', 'Staying up late for long periods weakens the immune system.'),
      ex('一个小错误导致整个系统崩溃了。', 'yí gè xiǎo cuòwù dǎozhì zhěnggè xìtǒng bēngkuì le.', 'One small mistake brought down the whole system.'),
    ],
  },
  // HSK6 看成
  'hsk6-i-c7d376c6': {
    structure: '把 + A + 看成 + B   |   A + 被看成 + B',
    explanation:
      '\'Regard A as B\', and also \'mistake A for B\' when something is misread or misseen. Usually in a 把 sentence. Compare 当作 (deliberately treat as) and the more formal 看作.',
    examples: [
      ex('他把我看成了自己的亲弟弟。', 'tā bǎ wǒ kànchéng le zìjǐ de qīn dìdi.', 'He regarded me as his own younger brother.'),
      ex('我把“已”看成了“己”，所以读错了。', 'wǒ bǎ “yǐ” kànchéng le “jǐ”, suǒyǐ dú cuò le.', 'I mistook 已 for 己, so I read it wrong.'),
    ],
  },
  // HSK6 意味着
  'hsk6-i-640b213a': {
    structure: 'A + (并不) 意味着 + B (N or clause)',
    explanation:
      '\'Means, signifies, implies\': A carries the implication B. The object is often a whole clause. Negate with 不 or 并不. Compare 意思是, which explains the literal meaning of words; 意味着 states a consequence.',
    examples: [
      ex('涨工资并不意味着生活会更轻松。', 'zhǎng gōngzī bìng bú yìwèizhe shēnghuó huì gèng qīngsōng.', 'A pay rise does not necessarily mean life will be easier.'),
      ex('红灯亮起意味着必须停车。', 'hóngdēng liàng qǐ yìwèizhe bìxū tíngchē.', 'When the red light comes on, you must stop.'),
    ],
  },
  // HSK6 指
  'hsk6-i-a2a6c871': {
    structure: 'A + (是) 指 + B   |   A + 指的是 + B',
    explanation:
      '\'Refer to, mean\': defines or clarifies what a word or phrase points to, often as 这里的X是指… . It also has the literal sense \'point at\'. Compare 意思是, which paraphrases meaning; 指 identifies a referent.',
    examples: [
      ex('这里的“老人”是指六十五岁以上的人。', 'zhèlǐ de “lǎorén” shì zhǐ liùshíwǔ suì yǐshàng de rén.', 'Here, \'elderly\' refers to people over sixty-five.'),
      ex('你说的那个人是指小王吗？', 'nǐ shuō de nàge rén shì zhǐ Xiǎo Wáng ma?', 'Do you mean Xiao Wang by that person?'),
    ],
  },
  // HSK6 当作
  'hsk6-i-0f02bc35': {
    structure: '把 + A + 当作 + B',
    explanation:
      '\'Treat A as B\', often deliberately or figuratively, usually in a 把 sentence. 当成 is a spoken synonym. Compare 看成, which is about perception and can mean mistaking one thing for another.',
    examples: [
      ex('他把这里当作自己的家。', 'tā bǎ zhèlǐ dàngzuò zìjǐ de jiā.', 'He treats this place as his own home.'),
      ex('别把我的话当作耳旁风。', 'bié bǎ wǒ de huà dàngzuò ěrpángfēng.', 'Don\'t let my words go in one ear and out the other.'),
    ],
  },
  // HSK6 代表
  'hsk6-i-f975e10f': {
    structure: 'A + 代表 + B   |   代表 + group + V',
    explanation:
      'Verb \'represent, stand for\', or \'act on behalf of\' when followed by a group and another verb; also a noun \'representative\'. Compare 象征 \'symbolise\', which is for abstract symbolic meaning rather than conventions or delegation.',
    examples: [
      ex('我代表全班同学向老师表示感谢。', 'wǒ dàibiǎo quán bān tóngxué xiàng lǎoshī biǎoshì gǎnxiè.', 'On behalf of the whole class, I\'d like to thank our teacher.'),
      ex('在这张地图上，蓝色代表河流和湖泊。', 'zài zhè zhāng dìtú shang, lánsè dàibiǎo héliú hé húpō.', 'On this map, blue stands for rivers and lakes.'),
    ],
  },
  // HSK6 造成
  'hsk6-i-7e84462f': {
    structure: 'Cause + (给 + person) + 造成 + (bad) N (损失/影响/困难/不便)',
    explanation:
      'Verb \'cause, result in\', normally with a negative noun object such as 损失, 伤害, 不便. The affected party is introduced with 给. Compare 导致, which can take a whole clause; 造成 is not used for good results.',
    examples: [
      ex('这场大雨给农民造成了很大的损失。', 'zhè cháng dàyǔ gěi nóngmín zàochéng le hěn dà de sǔnshī.', 'The heavy rain caused farmers great losses.'),
      ex('对不起，给您造成了不便。', 'duìbuqǐ, gěi nín zàochéng le búbiàn.', 'Sorry for the inconvenience.'),
    ],
  },
  // HSK6 充当
  'hsk6-i-f13f2fbe': {
    structure: 'A + 充当 + role (N)',
    explanation:
      '\'Act as, serve as\', often temporarily or as a stand-in, for people or objects. Compare 担任, which is for formally holding a post, and spoken 当. The object is a role noun such as 翻译, 桥梁, 助手.',
    examples: [
      ex('会议上，他临时充当翻译。', 'huìyì shang, tā línshí chōngdāng fānyì.', 'At the meeting he stepped in as interpreter.'),
      ex('这个旧箱子可以充当桌子用。', 'zhège jiù xiāngzi kěyǐ chōngdāng zhuōzi yòng.', 'This old box can serve as a table.'),
    ],
  },
  // HSK6 变成
  'hsk6-i-034f552c': {
    structure: 'A + 变成 (了) + B   |   把 + A + 变成 + B',
    explanation:
      '\'Turn into, become\': 成 is a result complement, so a noun object B must follow. Compare 变得 + adjective for a change of quality (变得很冷), not of identity. With 把 it means \'turn A into B\'.',
    examples: [
      ex('天气一冷，水就变成了冰。', 'tiānqì yì lěng, shuǐ jiù biànchéng le bīng.', 'As soon as it gets cold, the water turns into ice.'),
      ex('他们把旧工厂变成了一个艺术中心。', 'tāmen bǎ jiù gōngchǎng biànchéng le yí gè yìshù zhōngxīn.', 'They turned the old factory into an arts centre.'),
    ],
  },
  // HSK7-9 颇
  'hsk79-i-99ba97ef': {
    structure: '颇 + Adj/V   |   颇 + 有 + N   |   颇为 + Adj',
    explanation:
      'Written adverb \'quite, rather, considerably\', placed before the predicate. It favours set combinations such as 颇有, 颇受, 颇为. Stronger than 比较 and more literary than 很; it is not used in casual speech.',
    examples: [
      ex('这部电影在年轻人中颇受欢迎。', 'zhè bù diànyǐng zài niánqīngrén zhōng pō shòu huānyíng.', 'This film is quite popular among young people.'),
      ex('他对中国历史颇有研究。', 'tā duì Zhōngguó lìshǐ pō yǒu yánjiū.', 'He is quite knowledgeable about Chinese history.'),
    ],
  },
  // HSK7-9 甚
  'hsk79-i-eba9dd3e': {
    structure: '甚 + monosyllabic Adj (甚少、甚多、甚大)   |   甚为 + Adj',
    explanation:
      'Literary adverb \'very, extremely\', mostly before a one-syllable adjective, or as 甚为 before two-syllable ones. It belongs to formal writing. Do not confuse it with 甚至 \'even\', where 甚 is not a degree adverb.',
    examples: [
      ex('他对此事知之甚少。', 'tā duì cǐ shì zhī zhī shèn shǎo.', 'He knows very little about the matter.'),
      ex('双方在这一问题上分歧甚大。', 'shuāngfāng zài zhè yī wèntí shang fēnqí shèn dà.', 'The two sides differ greatly on this issue.'),
    ],
  },
  // HSK7-9 皆
  'hsk79-i-181bf71c': {
    structure: 'plural Subj + 皆 + V/Adj   |   人人皆知、皆大欢喜',
    explanation:
      'Classical equivalent of 都 \'all\', placed before the predicate after a plural subject. In modern Chinese it lives in formal writing and set phrases like 人人皆知 and 皆大欢喜. In ordinary sentences use 都.',
    examples: [
      ex('这件事早已人人皆知。', 'zhè jiàn shì zǎo yǐ rénrén jiē zhī.', 'Everyone has long known about this.'),
      ex('所有参赛作品皆为原创。', 'suǒyǒu cānsài zuòpǐn jiē wéi yuánchuàng.', 'All competition entries are original works.'),
    ],
  },
  // HSK7-9 均
  'hsk79-i-8e602c9a': {
    structure: 'plural Subj + 均 + V/Adj (均已、均须、均为)',
    explanation:
      'Formal adverb \'all, without exception\', common in notices, reports and regulations. Placed before the predicate like 都, it often combines with another monosyllable (均已, 均须). Unlike 都, it is not used in casual speech.',
    examples: [
      ex('所有乘客均已安全下车。', 'suǒyǒu chéngkè jūn yǐ ānquán xià chē.', 'All passengers have safely left the vehicle.'),
      ex('参加考试的学生均须携带身份证。', 'cānjiā kǎoshì de xuéshēng jūn xū xiédài shēnfènzhèng.', 'All students taking the exam must bring their ID cards.'),
    ],
  },
  // HSK7-9 曾
  'hsk79-i-92e2fad0': {
    structure: 'Subj + 曾(经) + V (+ 过)   |   不曾 / 未曾 + V',
    explanation:
      'Written adverb \'once, formerly\', marking a past experience or state that no longer holds; often with 过. The negatives are 不曾 and 未曾. Compare 已经 \'already\', which stresses a completed state that still matters now.',
    examples: [
      ex('他曾在北京工作过三年。', 'tā céng zài Běijīng gōngzuò guo sān nián.', 'He once worked in Beijing for three years.'),
      ex('我不曾想到事情会变成这样。', 'wǒ bù céng xiǎngdào shìqing huì biànchéng zhèyàng.', 'I never imagined things would turn out like this.'),
    ],
  },
  // HSK7-9 尝
  'hsk79-i-7be30a43': {
    structure: '未尝 (不) + V   |   何尝 (不) + V',
    explanation:
      'Classical adverb \'ever\', surviving in modern Chinese mainly in 未尝 \'has never / is not necessarily\' and the rhetorical 何尝 \'when did … ever\'. 未尝不 is a softened double negative: \'it is not that it isn\'t\'. Distinct from the verb 尝 \'taste\'.',
    examples: [
      ex('换个角度想，这未尝不是一件好事。', 'huàn gè jiǎodù xiǎng, zhè wèicháng bú shì yí jiàn hǎoshì.', 'Seen from another angle, this may well be a good thing.'),
      ex('我何尝不想早点儿回家呢？', 'wǒ hécháng bù xiǎng zǎo diǎnr huí jiā ne?', 'Don\'t you think I\'d like to go home early too?'),
    ],
  },
  // HSK7-9 已
  'hsk79-i-4232e879': {
    structure: 'Subj + 已 + V   |   已 + 是 + time/state',
    explanation:
      'Written form of 已经 \'already\', placed before the verb. Frequent in notices and news (已售完, 已于…). It tends to combine with single syllables; in speech say 已经. Common pairs are 早已 and 均已.',
    examples: [
      ex('本场演出的门票已全部售完。', 'běn chǎng yǎnchū de ménpiào yǐ quánbù shòuwán.', 'Tickets for this show are completely sold out.'),
      ex('他到家时已是深夜。', 'tā dào jiā shí yǐ shì shēnyè.', 'By the time he got home it was already late at night.'),
    ],
  },
  // HSK7-9 尚
  'hsk79-i-f092ea8d': {
    structure: '尚 + 未/不 + V/Adj   |   尚 + Adj (尚可、尚好)',
    explanation:
      'Written equivalent of 还 \'still, yet\', mostly in 尚未 (\'not yet\', = 还没) and 尚不 (\'still not\'). Placed before the predicate. Formal; in speech use 还. Also in set phrases like 为时尚早 \'it is still too early\'.',
    examples: [
      ex('调查结果尚未公布。', 'diàochá jiéguǒ shàng wèi gōngbù.', 'The results of the investigation have not yet been released.'),
      ex('他的病情尚不稳定，需要继续观察。', 'tā de bìngqíng shàng bù wěndìng, xūyào jìxù guānchá.', 'His condition is still unstable and needs continued observation.'),
    ],
  },
  // HSK7-9 且 (classical)
  'hsk79-i-b12b6335': {
    structure: '暂且 / 姑且 / 且 + V   |   且慢',
    explanation:
      'Classical adverb \'for the time being, for now\', mostly inside 暂且, 姑且 and set phrases such as 且慢 \'wait a moment\'. It goes before the verb. Unrelated to the conjunction 且 / 而且 \'and, moreover\'.',
    examples: [
      ex('这件事暂且放一放，以后再说。', 'zhè jiàn shì zànqiě fàng yi fàng, yǐhòu zài shuō.', 'Let\'s set this aside for now and come back to it later.'),
      ex('且慢，我还有一个问题。', 'qiěmàn, wǒ hái yǒu yí gè wèntí.', 'Wait a moment, I have another question.'),
    ],
  },
  // HSK7-9 愈
  'hsk79-i-f53efe28': {
    structure: '愈 A 愈 B   |   愈来愈 + Adj   |   愈发 / 愈加 + Adj',
    explanation:
      'Written equivalent of 越 \'the more…the more; increasingly\'. 愈A愈B pairs two predicates, 愈来愈 marks growing degree, and 愈发 / 愈加 mean \'even more\'. Bookish; in speech use 越…越 and 越来越.',
    examples: [
      ex('雨愈下愈大，我们只好找地方躲雨。', 'yǔ yù xià yù dà, wǒmen zhǐhǎo zhǎo dìfang duǒ yǔ.', 'The rain grew heavier and heavier, so we had to find shelter.'),
      ex('随着年龄增长，他愈发沉默了。', 'suízhe niánlíng zēngzhǎng, tā yùfā chénmò le.', 'As he grew older, he became ever more silent.'),
    ],
  },
  // HSK7-9 渐
  'hsk79-i-2d43638d': {
    structure: '渐 + monosyllabic V/Adj (渐冷、渐少)   |   日渐 / 渐趋 + V',
    explanation:
      'Literary adverb \'gradually\', usually before a single-syllable verb or adjective or inside 日渐, 渐趋, 渐次. The everyday forms are 渐渐 and 逐渐. Common in descriptions of weather, seasons and slow change.',
    examples: [
      ex('入秋以后，天气渐凉。', 'rùqiū yǐhòu, tiānqì jiàn liáng.', 'After autumn sets in, the weather gradually cools.'),
      ex('随着治疗的进行，他的身体日渐好转。', 'suízhe zhìliáo de jìnxíng, tā de shēntǐ rìjiàn hǎozhuǎn.', 'As the treatment went on, his health improved day by day.'),
    ],
  },
  // HSK7-9 乍
  'hsk79-i-5bf3312f': {
    structure: '乍 + V (乍一看、乍听)   |   初来乍到   |   乍暖还寒',
    explanation:
      'Adverb \'at first, just; suddenly\', describing a first impression or an abrupt change. In modern Chinese it occurs mostly in 乍一看 / 乍听之下 and set phrases. Literary; 刚 or 突然 are the everyday equivalents.',
    examples: [
      ex('乍一看，这两幅画几乎一模一样。', 'zhà yí kàn, zhè liǎng fú huà jīhū yìmú-yíyàng.', 'At first glance the two paintings look almost identical.'),
      ex('我初来乍到，很多情况还不了解。', 'wǒ chūlái-zhàdào, hěn duō qíngkuàng hái bù liǎojiě.', 'I\'ve only just arrived, so there\'s a lot I don\'t know yet.'),
    ],
  },
  // HSK7-9 勿
  'hsk79-i-c69295b6': {
    structure: '(请) 勿 + V',
    explanation:
      'Formal prohibition \'do not\', mainly on signs and in notices (请勿吸烟). It goes directly before the verb and is only used for commands, never for plain negation. In speech use 别 or 不要.',
    examples: [
      ex('请勿在车厢内吸烟。', 'qǐng wù zài chēxiāng nèi xīyān.', 'Please do not smoke in the carriage.'),
      ex('展品贵重，请勿触摸。', 'zhǎnpǐn guìzhòng, qǐng wù chùmō.', 'The exhibits are valuable; please do not touch.'),
    ],
  },
  // HSK7-9 莫 (classical)
  'hsk79-i-c91e79b3': {
    structure: '莫 + V (prohibition)   |   闲人莫入',
    explanation:
      'Classical \'do not\', used before a verb in signs, sayings and literary style; similar to 勿 and 别. It also means \'no one / nothing\' in fixed words like 莫非 and 莫过于. In modern speech it survives in some dialects and set phrases.',
    examples: [
      ex('莫着急，慢慢来。', 'mò zháojí, mànmàn lái.', 'Don\'t worry, take your time.'),
      ex('施工重地，闲人莫入。', 'shīgōng zhòngdì, xiánrén mò rù.', 'Construction site: no unauthorised entry.'),
    ],
  },
  // HSK7-9 毋
  'hsk79-i-6ba6b65b': {
    structure: '毋 + V (毋庸、毋须、毋宁)   |   毋庸置疑',
    explanation:
      'Classical negative \'do not, there is no need to\', in modern use found in fixed forms such as 毋庸置疑 \'beyond doubt\', 毋须 \'need not\' and 毋宁 \'would rather say\'. Formal written register; 无须 and 不必 are the common equivalents.',
    examples: [
      ex('他的能力是毋庸置疑的。', 'tā de nénglì shì wúyōng zhìyí de.', 'His ability is beyond question.'),
      ex('这点小事毋须你操心。', 'zhè diǎn xiǎoshì wúxū nǐ cāoxīn.', 'You needn\'t worry about such a small matter.'),
    ],
  },
  // HSK7-9 必 (classical)
  'hsk79-i-d72103e3': {
    structure: '必 + V (必有、必败、必将)   |   何必 / 未必 / 不必',
    explanation:
      'Literary adverb \'certainly, will surely; must\', placed directly before the verb. Found in sayings and formal writing, and inside 必将, 必定, 未必 and 何必. In speech use 一定 or 必须; 必 alone sounds proverbial.',
    examples: [
      ex('只要坚持下去，你必有收获。', 'zhǐyào jiānchí xiàqù, nǐ bì yǒu shōuhuò.', 'As long as you keep at it, you will surely be rewarded.'),
      ex('骄兵必败，这个道理大家都懂。', 'jiāobīng bì bài, zhège dàoli dàjiā dōu dǒng.', 'An overconfident army is bound to lose; everyone knows that.'),
    ],
  },
  // HSK7-9 殆
  'hsk79-i-62bb9c41': {
    structure: 'V + 殆尽 (消耗殆尽、破坏殆尽、丧失殆尽)',
    explanation:
      'Classical adverb \'almost, nearly\'. In modern Chinese it appears almost only in 殆尽 \'nearly exhausted\', after verbs of using up or destroying. Written register; in speech say 几乎没了 or 差不多用完了. In 百战不殆 it means \'danger\', a separate sense.',
    examples: [
      ex('几天下来，带的干粮已消耗殆尽。', 'jǐ tiān xiàlái, dài de gānliáng yǐ xiāohào dàijìn.', 'After a few days, the food we had brought was almost gone.'),
      ex('这片森林几乎被砍伐殆尽。', 'zhè piàn sēnlín jīhū bèi kǎnfá dàijìn.', 'This forest has been almost entirely cut down.'),
    ],
  },
  // HSK7-9 殊
  'hsk79-i-86f0dd3e': {
    structure: '殊 + 为/难 + Adj (殊为可惜)   |   殊不知 + clause',
    explanation:
      'Literary adverb \'very, quite\', mainly in 殊为 + adjective; in 殊不知 it means \'little do they know\'. Strictly written. As an adjective it means \'different, special\' (特殊, 殊途同归), which is a separate use.',
    examples: [
      ex('错过这次机会，殊为可惜。', 'cuòguò zhè cì jīhuì, shū wéi kěxī.', 'Missing this chance would be a great pity.'),
      ex('他以为没人发现，殊不知大家早就知道了。', 'tā yǐwéi méi rén fāxiàn, shūbùzhī dàjiā zǎo jiù zhīdào le.', 'He thought no one had noticed, little knowing that everyone had known for ages.'),
    ],
  },
  // HSK7-9 岂
  'hsk79-i-147e2345': {
    structure: '岂 + 能/不/有/敢 + V …？',
    explanation:
      'Literary rhetorical adverb \'how could…?\', implying the opposite of what is asked. 岂不 means \'wouldn\'t it be…?\', and 岂有此理 is an idiom for \'outrageous\'. The spoken counterpart is 难道 or 怎么能.',
    examples: [
      ex('这么重要的事，岂能随便决定？', 'zhème zhòngyào de shì, qǐ néng suíbiàn juédìng?', 'How could something so important be decided casually?'),
      ex('你这样做，岂不是白费力气？', 'nǐ zhèyàng zuò, qǐ bú shì báifèi lìqi?', 'Wouldn\'t doing it this way just be a waste of effort?'),
    ],
  },
  // HSK7-9 宁
  'hsk79-i-70e7a111': {
    structure: '宁 + V/A (+ 也不 + V)   |   宁 A 毋/不 B',
    explanation:
      'Literary form of 宁可/宁愿: the speaker accepts the first, unpleasant option to avoid the second. It sits before the verb and survives mostly in set phrases such as 宁死不屈 and 宁缺毋滥. Read it nìng, not níng (as in 安宁), and prefer 宁可 in ordinary speech.',
    examples: [
      ex('招聘人才要宁缺毋滥。', 'zhāopìn réncái yào nìng quē wú làn.', 'When hiring, it is better to leave a post empty than to fill it badly.'),
      ex('他宁死也不肯出卖朋友。', 'tā nìng sǐ yě bù kěn chūmài péngyou.', 'He would rather die than betray his friends.'),
    ],
  },
  // HSK7-9 亦
  'hsk79-i-c359f2b1': {
    structure: 'Subj + 亦 + V/A   |   …，反之亦然',
    explanation:
      'Written equivalent of 也: an adverb placed after the subject and before the verb or adjective, meaning \'also, likewise\'. It belongs to formal prose, set phrases (亦步亦趋, 反之亦然) and signs; in speech 也 is used. Like 也, it cannot stand before the subject.',
    examples: [
      ex('他是一位学者，亦是一位诗人。', 'tā shì yí wèi xuézhě, yì shì yí wèi shīrén.', 'He is a scholar and also a poet.'),
      ex('城市影响乡村，反之亦然。', 'chéngshì yǐngxiǎng xiāngcūn, fǎn zhī yì rán.', 'Cities influence the countryside, and vice versa.'),
    ],
  },
  // HSK7-9 复
  'hsk79-i-5ffd889a': {
    structure: '复 + V (monosyllabic, written)   |   V1 而复 V2',
    explanation:
      'Literary adverb meaning \'again, once more\', placed directly before a (usually monosyllabic) verb. It appears in written Chinese and fixed expressions such as 失而复得, 一去不复返 and 死灰复燃. In everyday speech use 再 for future repetition and 又 for repetition that already happened.',
    examples: [
      ex('丢失的钱包竟然失而复得。', 'diūshī de qiánbāo jìngrán shī ér fù dé.', 'Surprisingly, the lost wallet was recovered.'),
      ex('青春一去不复返，要珍惜时间。', 'qīngchūn yí qù bú fù fǎn, yào zhēnxī shíjiān.', 'Youth, once gone, never returns, so treasure your time.'),
    ],
  },
  // HSK7-9 务必
  'hsk79-i-5896e5c9': {
    meaning: 'be sure to / without fail',
    structure: '(请) + Subj + 务必 + V',
    explanation:
      'Adverb meaning \'must without fail, be sure to\', placed before the verb in requests and instructions. It is stronger and more formal than 一定, typical of notices, emails and official language. It expresses a demand, not a prediction: 他务必会来 is wrong; say 他一定会来.',
    examples: [
      ex('请务必在周五之前提交报告。', 'qǐng wùbì zài zhōuwǔ zhīqián tíjiāo bàogào.', 'Please be sure to submit the report before Friday.'),
      ex('这件事务必保密。', 'zhè jiàn shì wùbì bǎomì.', 'This matter must be kept strictly confidential.'),
    ],
  },
  // HSK7-9 极其
  'hsk79-i-5b7b2073': {
    structure: '极其 + disyllabic A / mental V',
    explanation:
      'Degree adverb meaning \'extremely\', placed before adjectives or mental verbs, especially disyllabic ones (极其重要, 极其严格). It is more formal than 非常 and 特别 and is not used with monosyllabic adjectives: say 非常好, not 极其好. Unlike 极了, it comes before the word it modifies.',
    examples: [
      ex('这项工作极其复杂。', 'zhè xiàng gōngzuò jíqí fùzá.', 'This job is extremely complicated.'),
      ex('他对自己要求极其严格。', 'tā duì zìjǐ yāoqiú jíqí yángé.', 'He is extremely strict with himself.'),
    ],
  },
  // HSK7-9 一概
  'hsk79-i-09fd5fd5': {
    structure: '(N) + 一概 + V (often 不/无)   |   不能一概而论',
    explanation:
      'Adverb meaning \'all without exception, across the board\', placed before the verb and summing up the things mentioned before it. It often combines with negation (一概不知, 一概不收) and the idiom 不能一概而论. Compare 一律, which applies to people as well as things and suits rules and regulations.',
    examples: [
      ex('过期的优惠券一概无效。', 'guòqī de yōuhuìquàn yígài wúxiào.', 'Expired coupons are all invalid.'),
      ex('每个人的情况不同，不能一概而论。', 'měi gè rén de qíngkuàng bù tóng, bù néng yígài ér lùn.', 'Everyone\'s situation is different, so you can\'t generalise.'),
    ],
  },
  // HSK7-9 专为
  'hsk79-i-8fe48d50': {
    meaning: 'specially for',
    structure: '专为 + beneficiary/purpose + V   |   是专为…V的',
    explanation:
      '专 \'specially\' + 为 \'for\': marks that something was made or done exclusively for a particular group or purpose. It sits before the verb phrase, often in a 是…的 frame (是专为…设计的). It is more written than 专门为, which means the same; 专门 alone does not name the beneficiary.',
    examples: [
      ex('这本教材是专为初学者编写的。', 'zhè běn jiàocái shì zhuān wèi chūxuézhě biānxiě de.', 'This textbook was written specially for beginners.'),
      ex('餐厅专为素食者准备了一份菜单。', 'cāntīng zhuān wèi sùshízhě zhǔnbèi le yí fèn càidān.', 'The restaurant has prepared a menu specially for vegetarians.'),
    ],
  },
  // HSK7-9 恍若
  'hsk79-i-cdf25bf1': {
    structure: 'Subj + 恍若 + N/clause',
    explanation:
      'Literary verb meaning \'as if, seemingly\', used for a dreamlike or vivid impression: the subject feels as though it were something else. It is a written synonym of 仿佛 and 好像, common in set phrases like 恍若隔世 and 恍若梦中. It is too poetic for neutral factual comparisons, where 像 is used.',
    examples: [
      ex('多年后回到故乡，他恍若隔世。', 'duō nián hòu huí dào gùxiāng, tā huǎngruò gé shì.', 'Returning home after many years, he felt as if a lifetime had passed.'),
      ex('眼前的景色恍若仙境。', 'yǎnqián de jǐngsè huǎngruò xiānjìng.', 'The scenery before us was like a fairyland.'),
    ],
  },
  // HSK7-9 明明
  'hsk79-i-447c6c95': {
    structure: 'Subj + 明明 + V/A，(却/可是/还) + contrary clause',
    explanation:
      'Adverb meaning \'obviously, clearly\', used to stress a fact that contradicts what someone says or does. It sits before the predicate and is usually followed by a clause with 却, 可是 or 还, giving a tone of complaint or reproach. Unlike 显然, a neutral inference, 明明 always sets up a contrast.',
    examples: [
      ex('你明明知道，为什么不告诉我？', 'nǐ míngmíng zhīdào, wèi shénme bú gàosu wǒ?', 'You clearly knew, so why didn\'t you tell me?'),
      ex('他明明在家，却说自己出去了。', 'tā míngmíng zài jiā, què shuō zìjǐ chūqù le.', 'He was obviously at home, yet he said he had gone out.'),
    ],
  },
  // HSK7-9 枉费
  'hsk79-i-213f686f': {
    structure: '枉费 + N (心血/心机/口舌/努力)',
    explanation:
      'Verb meaning \'to waste (effort) in vain\', taking objects such as 心血, 心机, 口舌 or 一番好意. It stresses that the effort brought no result and belongs to fairly formal or literary speech, as in 枉费心机. Compare 浪费, the everyday word for wasting money or resources, which lacks the sense of futility.',
    examples: [
      ex('如果现在放弃，就枉费了这几年的努力。', 'rúguǒ xiànzài fàngqì, jiù wǎngfèi le zhè jǐ nián de nǔlì.', 'If you give up now, these years of effort will have been in vain.'),
      ex('别枉费口舌了，他不会听的。', 'bié wǎngfèi kǒushé le, tā bú huì tīng de.', 'Don\'t waste your breath; he won\'t listen.'),
    ],
  },
  // HSK7-9 随口
  'hsk79-i-459a41dd': {
    structure: '随口 + speech V (说/问/答应)',
    explanation:
      'Adverb meaning \'offhandedly, without thinking\', placed before verbs of speaking. It implies the words were not carefully considered, often with a consequence such as others taking them seriously or a promise being forgotten. Compare 随便, which covers any careless action, while 随口 is limited to speech.',
    examples: [
      ex('我只是随口问问，你别在意。', 'wǒ zhǐshì suíkǒu wènwen, nǐ bié zàiyì.', 'I was only asking casually; don\'t take it to heart.'),
      ex('他随口答应了，后来却忘了。', 'tā suíkǒu dāying le, hòulái què wàng le.', 'He agreed offhandedly and then forgot about it.'),
    ],
  },
  // HSK7-9 不假思索
  'hsk79-i-d9766e56': {
    structure: '不假思索 + 地 + V',
    explanation:
      'Four-character idiom meaning \'without a moment\'s thought\' (假 = to rely on). It acts as an adverbial before the verb, usually with 地, and describes a quick, instinctive response, often decisive but sometimes rash. It is written or formal; in speech people say 想都没想就….',
    examples: [
      ex('她不假思索地答应了朋友的请求。', 'tā bù jiǎ sīsuǒ de dāying le péngyou de qǐngqiú.', 'She agreed to her friend\'s request without a second thought.'),
      ex('老师一提问，他就不假思索地说出了答案。', 'lǎoshī yì tíwèn, tā jiù bù jiǎ sīsuǒ de shuō chū le dá\'àn.', 'As soon as the teacher asked, he gave the answer without hesitation.'),
    ],
  },
  // HSK7-9 故
  'hsk79-i-811438c0': {
    structure: '(因/由于) + cause，故 + result',
    explanation:
      'Written conjunction meaning \'therefore, hence\', opening the result clause. It is common in notices, legal and academic prose, and is often paired with 因 or 由于 in the first clause. In speech 所以 is used; 故 sounds stiff in casual conversation.',
    examples: [
      ex('本店内部装修，故暂停营业三天。', 'běn diàn nèibù zhuāngxiū, gù zàntíng yíngyè sān tiān.', 'The shop is being renovated, so it is closed for three days.'),
      ex('他平时学习勤奋，故成绩一直很好。', 'tā píngshí xuéxí qínfèn, gù chéngjì yìzhí hěn hǎo.', 'He studies diligently, hence his consistently good grades.'),
    ],
  },
  // HSK7-9 是故
  'hsk79-i-86be765f': {
    structure: 'premise，是故 + conclusion',
    explanation:
      'Classical conjunction meaning \'for this reason, therefore\', literally \'this is why\'. It begins a conclusion drawn from a preceding argument and belongs to highly literary or rhetorical prose. It is more formal than 故 and 因此 and is never used in conversation.',
    examples: [
      ex('人无远虑，必有近忧，是故凡事须早作打算。', 'rén wú yuǎn lǜ, bì yǒu jìn yōu, shì gù fánshì xū zǎo zuò dǎsuàn.', 'Without foresight, trouble is near at hand; therefore one must plan everything early.'),
      ex('知识不断更新，是故学习不可停止。', 'zhīshi búduàn gēngxīn, shì gù xuéxí bù kě tíngzhǐ.', 'Knowledge is constantly renewed; therefore learning must never stop.'),
    ],
  },
  // HSK7-9 以此
  'hsk79-i-994947e7': {
    structure: '…，以此 + V (为戒/类推/提醒…)',
    explanation:
      '以 \'by, with\' + 此 \'this\': uses something just mentioned as the means or basis for the following action, \'by this, with this\'. It sits before the verb and is written; common collocations are 以此为戒, 以此类推 and 以此为荣. In speech people say 用这个 or 这样.',
    examples: [
      ex('他把失败的经历写下来，以此提醒自己。', 'tā bǎ shībài de jīnglì xiě xiàlai, yǐ cǐ tíxǐng zìjǐ.', 'He wrote down his failures as a way of reminding himself.'),
      ex('第一题是这样做的，其余的以此类推。', 'dì yī tí shì zhèyàng zuò de, qíyú de yǐ cǐ lèituī.', 'The first question is done like this; the rest follow by analogy.'),
    ],
  },
  // HSK7-9 以至 (classical)
  'hsk79-i-8c4cf33d': {
    structure: 'clause，以至(于) + result   |   A、B 以至 C',
    explanation:
      'Has two uses: linking a cause to an extreme result (\'so much so that\'), and marking the upper end of a range (\'up to, and even\'). The result use overlaps with 以致, but 以致 usually introduces a bad outcome while 以至 is neutral. It is written; in speech people say 甚至 or 结果.',
    examples: [
      ex('他工作太投入，以至忘了吃饭。', 'tā gōngzuò tài tóurù, yǐzhì wàng le chīfàn.', 'He was so absorbed in his work that he forgot to eat.'),
      ex('从小学、中学以至大学，他一直是班长。', 'cóng xiǎoxué, zhōngxué yǐzhì dàxué, tā yìzhí shì bānzhǎng.', 'From primary school and secondary school right up to university, he was always class monitor.'),
    ],
  },
  // HSK7-9 乃至
  'hsk79-i-99275f01': {
    structure: 'A(、B) + 乃至 + C',
    explanation:
      'Written conjunction meaning \'and even, up to\', placing the most extreme or largest item last in a series. It joins nouns, verb phrases or clauses and is more formal than 甚至. It usually marks an escalation in scope, such as city, then country, then world.',
    examples: [
      ex('这项发明影响了全国乃至全世界。', 'zhè xiàng fāmíng yǐngxiǎng le quánguó nǎizhì quán shìjiè.', 'This invention affected the whole country and even the whole world.'),
      ex('这首歌在年轻人乃至老年人中都很受欢迎。', 'zhè shǒu gē zài niánqīngrén nǎizhì lǎoniánrén zhōng dōu hěn shòu huānyíng.', 'This song is popular among young people and even the elderly.'),
    ],
  },
  // HSK7-9 如
  'hsk79-i-76ce4f02': {
    structure: '如 + condition，(则/请/就) + result',
    explanation:
      'Written conjunction meaning \'if\', opening a conditional clause; it is typical of notices, instructions and formal letters (如有疑问…). The result clause often contains 则, 请 or 就. In speech use 如果; note that 如 also means \'like, such as\', which is a separate use.',
    examples: [
      ex('如有问题，请随时与我联系。', 'rú yǒu wèntí, qǐng suíshí yǔ wǒ liánxì.', 'If you have any questions, please contact me at any time.'),
      ex('如不及时治疗，病情可能会加重。', 'rú bù jíshí zhìliáo, bìngqíng kěnéng huì jiāzhòng.', 'If it is not treated promptly, the illness may get worse.'),
    ],
  },
  // HSK7-9 若
  'hsk79-i-8dc76ceb': {
    structure: '(Subj +) 若 + condition，(则/就) + result',
    explanation:
      'Literary \'if\', equivalent to 如果 but more formal; it can follow the subject (你若…) and pairs with 则 or 就 in the result clause. It is common in written Chinese and song lyrics; 若是 and 倘若 are close variants. In 若无其事 the same character means \'as if\', a different use.',
    examples: [
      ex('你若不去，我也不去。', 'nǐ ruò bú qù, wǒ yě bú qù.', 'If you don\'t go, I won\'t either.'),
      ex('若明天下雨，比赛将推迟举行。', 'ruò míngtiān xià yǔ, bǐsài jiāng tuīchí jǔxíng.', 'If it rains tomorrow, the match will be postponed.'),
    ],
  },
  // HSK7-9 苟
  'hsk79-i-fe02aee4': {
    structure: '苟 + condition，(则/必) + result',
    explanation:
      'Classical conditional meaning \'if indeed, provided that\', implying the condition is the decisive requirement. It survives in literary prose, formal phrases and quotations; modern equivalents are 如果 or 只要. Do not confuse it with 苟且 or 一丝不苟, where 苟 means \'careless, makeshift\'.',
    examples: [
      ex('苟能坚持到底，必有所成。', 'gǒu néng jiānchí dàodǐ, bì yǒu suǒ chéng.', 'If only one can persevere to the end, one is sure to achieve something.'),
      ex('苟有不当之处，敬请指正。', 'gǒu yǒu búdàng zhī chù, jìng qǐng zhǐzhèng.', 'Should anything here be improper, kindly point it out.'),
    ],
  },
  // HSK7-9 既
  'hsk79-i-47ca4059': {
    structure: 'Subj + 既 + (已) V，就/则/便 + conclusion',
    explanation:
      'Literary form of 既然 \'since, now that\': it states an accepted fact and draws a conclusion, usually with 就, 则 or 便. It follows the subject or opens the clause, as in the proverb 既来之，则安之. Do not confuse it with 既…又/也…, \'both … and …\'.',
    examples: [
      ex('你既已答应，就应该做到。', 'nǐ jì yǐ dāying, jiù yīnggāi zuòdào.', 'Since you have already agreed, you should follow through.'),
      ex('事情既已发生，后悔也没有用。', 'shìqing jì yǐ fāshēng, hòuhuǐ yě méiyǒu yòng.', 'Since it has already happened, regret is useless.'),
    ],
  },
  // HSK7-9 虽
  'hsk79-i-112a1956': {
    structure: 'Subj + 虽 + A/V，(但/却/也) + B',
    explanation:
      'Literary \'although\', the one-character form of 虽然. Unlike 虽然, it normally comes after the subject (他虽年轻…), and the second clause takes 但, 却 or 也. It is frequent in idioms such as 虽败犹荣 and in formal writing.',
    examples: [
      ex('他虽年轻，却很有经验。', 'tā suī niánqīng, què hěn yǒu jīngyàn.', 'Although he is young, he is very experienced.'),
      ex('麻雀虽小，五脏俱全。', 'máquè suī xiǎo, wǔzàng jù quán.', 'The sparrow may be small, but it has all its organs (small but complete).'),
    ],
  },
  // HSK7-9 纵
  'hsk79-i-579eef30': {
    structure: '纵 + (有/是) + concession，也/亦 + result',
    explanation:
      'Literary \'even if\', short for 纵然 or 纵使: it concedes a hypothetical extreme while insisting the outcome stays the same. The main clause takes 也 or 亦. It is more literary than 即使 and 就算 and belongs to written or rhetorical style.',
    examples: [
      ex('纵有千难万险，我们也不会退缩。', 'zòng yǒu qiān nán wàn xiǎn, wǒmen yě bú huì tuìsuō.', 'Even if there are countless hardships, we will not back down.'),
      ex('此事纵有困难，亦当尽力而为。', 'cǐ shì zòng yǒu kùnnan, yì dāng jìn lì ér wéi.', 'Even if this matter is difficult, we should do our best.'),
    ],
  },
  // HSK7-9 况
  'hsk79-i-256992e4': {
    structure: 'A 尚且…，况 B (乎/呢)？   |   …，况 + extra reason',
    explanation:
      'Literary form of 何况/况且. After a clause with 尚且 it means \'let alone, much less\' in a rhetorical question; at the head of a clause it adds a further reason, \'moreover\'. It belongs to written style; in speech say 何况 or 更别说.',
    examples: [
      ex('成年人尚且做不到，况孩子乎？', 'chéngniánrén shàngqiě zuò bú dào, kuàng háizi hū?', 'Even adults cannot do it, let alone children.'),
      ex('时间紧迫，况人手不足，必须加快进度。', 'shíjiān jǐnpò, kuàng rénshǒu bùzú, bìxū jiākuài jìndù.', 'Time is short and, moreover, we are understaffed, so we must speed up.'),
    ],
  },
  // HSK7-9 而是
  'hsk79-i-95a4409e': {
    structure: '不是 / 并非 A，而是 B',
    explanation:
      'Introduces the correct alternative after a negated one: \'not A, but (rather) B\'. It must follow a negative clause with 不是, 并不 or 并非. Do not replace it with 但是, which adds a contrast instead of correcting a statement.',
    examples: [
      ex('我不是不想去，而是实在没有时间。', 'wǒ bú shì bù xiǎng qù, ér shì shízài méiyǒu shíjiān.', 'It\'s not that I don\'t want to go; I really have no time.'),
      ex('问题并不在于钱，而是在于态度。', 'wèntí bìng bú zàiyú qián, ér shì zàiyú tàidu.', 'The problem lies not in money but in attitude.'),
    ],
  },
  // HSK7-9 但
  'hsk79-i-2ef5469d': {
    structure: 'A，但 + (Subj) + B   |   虽(然) A，但 B',
    explanation:
      'Conjunction meaning \'but\', opening the second clause; it is shorter and slightly more written than 但是, and often answers 虽然 or 虽. In literary phrases it can also be an adverb \'only\' (但愿, 但求). Unlike English \'but\', it cannot end a sentence or join two bare nouns.',
    examples: [
      ex('这件衣服很好看，但太贵了。', 'zhè jiàn yīfu hěn hǎokàn, dàn tài guì le.', 'This piece of clothing looks nice, but it\'s too expensive.'),
      ex('方法虽然简单，但很有效。', 'fāngfǎ suīrán jiǎndān, dàn hěn yǒuxiào.', 'The method is simple but very effective.'),
    ],
  },
  // HSK7-9 生怕
  'hsk79-i-d68d8429': {
    structure: 'cautious action，生怕 + undesired event',
    explanation:
      'Verb meaning \'for fear that, terrified lest\', usually in a second clause explaining why someone acts cautiously. It is stronger than 怕 and 担心, and its object is an unwanted event. Unlike 以免, which states the purpose of avoiding something, 生怕 describes the person\'s anxiety.',
    examples: [
      ex('他小心翼翼地走着，生怕滑倒。', 'tā xiǎoxīn yìyì de zǒu zhe, shēngpà huádǎo.', 'He walked very carefully, afraid he might slip.'),
      ex('她一直盯着孩子，生怕他走丢了。', 'tā yìzhí dīng zhe háizi, shēngpà tā zǒu diū le.', 'She kept her eyes on the child for fear he would get lost.'),
    ],
  },
  // HSK7-9 借以
  'hsk79-i-eab2ea31': {
    structure: 'means/action，借以 + purpose V',
    explanation:
      'Written connective meaning \'so as to, thereby\', introducing the purpose achieved through the means stated in the preceding clause. It links two clauses and suits formal writing. Compare 以便 \'so that it is easier to\'; 借以 emphasises using the first action as a tool.',
    examples: [
      ex('他每天写日记，借以反思自己的言行。', 'tā měitiān xiě rìjì, jièyǐ fǎnsī zìjǐ de yánxíng.', 'He keeps a diary every day as a way to reflect on his words and actions.'),
      ex('学校举办这次展览，借以纪念这位艺术家。', 'xuéxiào jǔbàn zhè cì zhǎnlǎn, jièyǐ jìniàn zhè wèi yìshùjiā.', 'The school is holding this exhibition to commemorate the artist.'),
    ],
  },
  // HSK7-9 为的是
  'hsk79-i-1bb53be7': {
    structure: 'action，为的是 + purpose',
    explanation:
      'Literally \'what it is for is …\': placed at the start of the second clause to state the purpose of the first, with emphasis. It is common in speech as well as writing and sounds more explanatory than 为了, which usually comes before the action. The frame 之所以…，为的是… is also common.',
    examples: [
      ex('我这么做，为的是让你明白一个道理。', 'wǒ zhème zuò, wèi de shì ràng nǐ míngbai yí gè dàolǐ.', 'I did this so that you would understand something.'),
      ex('他每天早起跑步，为的是保持健康。', 'tā měitiān zǎo qǐ pǎobù, wèi de shì bǎochí jiànkāng.', 'He gets up early to run every day in order to stay healthy.'),
    ],
  },
  // HSK7-9 考虑到
  'hsk79-i-e24ebae2': {
    structure: '考虑到 + N/clause，main clause',
    explanation:
      'Verb phrase meaning \'taking into account, in view of\', usually opening a sentence to give the factor behind a decision. Its object can be a noun phrase or a full clause. It is neutral to formal; compare 鉴于, which is more official, and 因为, which states a cause rather than a consideration.',
    examples: [
      ex('考虑到天气原因，活动改在室内举行。', 'kǎolǜ dào tiānqì yuányīn, huódòng gǎi zài shìnèi jǔxíng.', 'Given the weather, the event has been moved indoors.'),
      ex('考虑到他是新人，经理没有过多批评他。', 'kǎolǜ dào tā shì xīnrén, jīnglǐ méiyǒu guòduō pīpíng tā.', 'Considering he was new, the manager did not criticise him too much.'),
    ],
  },
  // HSK7-9 凭借
  'hsk79-i-76e3b0a7': {
    structure: '凭借 + N (ability/advantage) + V',
    explanation:
      'Preposition or verb meaning \'relying on, by virtue of\', naming the ability, resource or advantage that made a result possible. It precedes the main verb and is more formal than 靠 or 凭. Use it for strengths and means, not physical support: 靠墙, not 凭借墙.',
    examples: [
      ex('她凭借出色的表现赢得了比赛。', 'tā píngjiè chūsè de biǎoxiàn yíngdé le bǐsài.', 'She won the competition thanks to her outstanding performance.'),
      ex('这家企业凭借技术优势占领了市场。', 'zhè jiā qǐyè píngjiè jìshù yōushì zhànlǐng le shìchǎng.', 'The company captured the market by virtue of its technological edge.'),
    ],
  },
  // HSK7-9 也 (classical)
  'hsk79-i-3977e742': {
    structure: 'A(者)，B 也。',
    explanation:
      'In classical and classical-style Chinese, 也 at the end of a sentence marks a judgment or explanation, roughly \'is\' or \'it is the case that\'. Classical Chinese often has no 是, so A，B也 means \'A is B\'. This is unrelated to the modern adverb 也 \'also\', which stands before the verb.',
    examples: [
      ex('陈先生者，本地名医也。', 'Chén xiānsheng zhě, běndì míngyī yě.', 'Mr Chen is a renowned local doctor.'),
      ex('此非一日之功也。', 'cǐ fēi yí rì zhī gōng yě.', 'This is not the work of a single day.'),
    ],
  },
  // HSK7-9 矣
  'hsk79-i-57baca3f': {
    structure: 'clause + 矣',
    explanation:
      'Classical sentence-final particle marking a new situation or a completed change, roughly like modern sentence-final 了. It appears in quotations, idioms (悔之晚矣) and deliberately literary writing. Unlike 了, it cannot follow a verb as an aspect marker in the middle of a sentence.',
    examples: [
      ex('事已至此，悔之晚矣。', 'shì yǐ zhì cǐ, huǐ zhī wǎn yǐ.', 'Things have come to this; it is too late for regrets.'),
      ex('此事已成定局，多说无益矣。', 'cǐ shì yǐ chéng dìngjú, duō shuō wúyì yǐ.', 'The matter is settled; there is no use saying more.'),
    ],
  },
  // HSK7-9 哉
  'hsk79-i-a9174a11': {
    structure: 'A + 哉！   |   岂/何 … 哉？',
    explanation:
      'Classical sentence-final particle expressing strong emotion such as admiration or lament, or marking a rhetorical question. In modern writing it appears in quotations and idioms such as 呜呼哀哉 and 优哉游哉, or for a playful literary flavour. It roughly matches modern 啊 or 呢.',
    examples: [
      ex('壮哉，长江！', 'zhuàng zāi, Cháng Jiāng!', 'How magnificent, the Yangtze!'),
      ex('人生如此，岂不快哉！', 'rénshēng rúcǐ, qǐ bú kuài zāi!', 'If life is like this, how delightful it is!'),
    ],
  },
  // HSK7-9 乎
  'hsk79-i-06bba520': {
    structure: 'statement + 乎？',
    explanation:
      'Classical sentence-final question particle, equivalent to modern 吗 or 呢 and often used in rhetorical questions. Today it appears mainly in quotations and literary style. It also survives as a suffix in words like 似乎, 合乎 and 在乎, where it no longer marks a question.',
    examples: [
      ex('此计可行乎？', 'cǐ jì kěxíng hū?', 'Is this plan feasible?'),
      ex('人生在世，能不努力乎？', 'rénshēng zài shì, néng bù nǔlì hū?', 'Living in this world, how can one not strive?'),
    ],
  },
  // HSK7-9 耶
  'hsk79-i-fec783cf': {
    structure: 'A 耶？B 耶？   |   statement + 耶？',
    explanation:
      'Classical sentence-final question particle similar to 乎 or modern 吗/呢, often used in paired alternative questions such as 是耶非耶. It has a literary or archaic flavour. In modern colloquial Chinese the same character is an exclamation of joy (\'yay!\'), which is an unrelated use.',
    examples: [
      ex('此人是敌耶，是友耶？', 'cǐ rén shì dí yé, shì yǒu yé?', 'Is this person a foe or a friend?'),
      ex('是梦耶？是真耶？他一时分不清。', 'shì mèng yé? shì zhēn yé? tā yìshí fēn bù qīng.', 'Was it a dream, or was it real? For a moment he could not tell.'),
    ],
  },
  // HSK7-9 其
  'hsk79-i-4e999b2c': {
    structure: '其 + N (= 他的/她的/它的/他们的)',
    explanation:
      'Written third-person pronoun meaning \'his, her, its, their\', placed before a noun; inside a clause it can also mean \'he, it\'. It replaces 他的 or 它的 in formal writing (及其, 各得其所, 发挥其作用). It cannot serve as the subject of an independent main sentence the way 他 can.',
    examples: [
      ex('这家公司及其子公司都受到了影响。', 'zhè jiā gōngsī jí qí zǐgōngsī dōu shòudào le yǐngxiǎng.', 'The company and its subsidiaries were all affected.'),
      ex('这项技术很先进，我们应当充分发挥其作用。', 'zhè xiàng jìshù hěn xiānjìn, wǒmen yīngdāng chōngfèn fāhuī qí zuòyòng.', 'This technology is advanced, and we should make full use of it.'),
    ],
  },
  // HSK7-9 尔
  'hsk79-i-2455b428': {
    meaning: 'sentence-final \'only, that is all\' (= 耳/而已)',
    structure: 'statement + 尔 (= 而已/耳)',
    explanation:
      'In classical prose, sentence-final 尔 can mean \'only, that is all\', like 耳 or 而已; elsewhere the character means \'thus\' or \'you\'. Today this sense survives in classical quotations and imitations of them, and in the related idiom 不过尔尔 \'nothing special\'. In ordinary writing use 而已 or 罢了.',
    examples: [
      ex('无他，但手熟尔。', 'wú tā, dàn shǒu shú ěr.', 'There is nothing more to it; it is only that my hands are practised.'),
      ex('此非妙计，权宜之计尔。', 'cǐ fēi miào jì, quányí zhī jì ěr.', 'This is no brilliant plan, merely a stopgap.'),
    ],
  },
  // HSK7-9 诸
  'hsk79-i-bf0ca47e': {
    structure: '诸 + N (诸位/诸多)   |   V + 诸 + N (= 之于)',
    explanation:
      'Literary word meaning \'all, the various\', placed before nouns (诸位, 诸多, 诸如此类). It is also a fusion of 之于 \'it to/in\', as in 付诸实施 and 公诸于世. It is formal; everyday equivalents are 各位 and 很多.',
    examples: [
      ex('诸位来宾，欢迎光临。', 'zhū wèi láibīn, huānyíng guānglín.', 'Welcome, all honoured guests.'),
      ex('这个计划终于付诸实施了。', 'zhège jìhuà zhōngyú fù zhū shíshī le.', 'The plan has finally been put into practice.'),
    ],
  },
  // HSK7-9 见
  'hsk79-i-d65fa821': {
    structure: '见 + V (谅/笑/怪/教)',
    explanation:
      'In classical Chinese, 见 before a verb marks the subject as receiving the action (\'be V-ed\'). In modern polite formulas it marks an action done to the speaker: 见谅 \'forgive me\', 见笑 \'laugh at me\', 见教 \'teach me\'. It occurs only in fixed expressions; productive passives use 被.',
    examples: [
      ex('如有不周之处，敬请见谅。', 'rú yǒu bù zhōu zhī chù, jìng qǐng jiànliàng.', 'If anything has been lacking, please forgive us.'),
      ex('我写得不好，让大家见笑了。', 'wǒ xiě de bù hǎo, ràng dàjiā jiànxiào le.', 'My writing is poor; I\'m afraid I\'ve made a fool of myself in front of you all.'),
    ],
  },
  // HSK7-9 为 (classical passive)
  'hsk79-i-478ffde1': {
    structure: 'Patient + 为 + Agent + 所 + V',
    explanation:
      'Written passive frame: 为 (wéi) introduces the agent and 所 precedes the verb, \'be V-ed by\'. It is common in formal and academic prose (为人所知, 为大众所接受) and is more literary than 被. The verb is usually disyllabic, and 所 is normally kept.',
    examples: [
      ex('这种观点并不为大多数人所接受。', 'zhè zhǒng guāndiǎn bìng bù wéi dàduōshù rén suǒ jiēshòu.', 'This view is not accepted by most people.'),
      ex('他的作品深为读者所喜爱。', 'tā de zuòpǐn shēn wéi dúzhě suǒ xǐ\'ài.', 'His works are deeply loved by readers.'),
    ],
  },
  // HSK7-9 者 (classical)
  'hsk79-i-8b317462': {
    structure: 'VP/A + 者 (= …的人)   |   凡 + VP + 者',
    explanation:
      'Nominaliser meaning \'the one(s) who …, that which …\', attached after a verb phrase or adjective. It is literary and appears in proverbs, legal notices and compounds such as 作者, 读者 and 前者/后者. In speech use …的人; 者 cannot attach to a bare noun.',
    examples: [
      ex('有志者事竟成。', 'yǒu zhì zhě shì jìng chéng.', 'Where there\'s a will, there\'s a way.'),
      ex('凡违反规定者，一律罚款。', 'fán wéifǎn guīdìng zhě, yílǜ fákuǎn.', 'Anyone who breaks the rules will be fined, without exception.'),
    ],
  },
  // HSK7-9 于
  'hsk79-i-fbcea6dc': {
    structure: 'V + 于 + place/time/source   |   A + 于 + N (comparison)',
    explanation:
      'Written preposition covering \'at, in, from, to, than\'. It usually follows the verb (毕业于, 来自于, 位于) or an adjective in comparisons (大于, 重于). It is formal; speech uses 在, 从 or 比, placed before the verb.',
    examples: [
      ex('他毕业于北京大学。', 'tā bìyè yú Běijīng Dàxué.', 'He graduated from Peking University.'),
      ex('对我来说，健康重于一切。', 'duì wǒ lái shuō, jiànkāng zhòng yú yíqiè.', 'To me, health matters more than anything.'),
    ],
  },
  // HSK7-9 於
  'hsk79-i-071ddf58': {
    structure: '於 = 于 (traditional form): V/A + 於 + N',
    explanation:
      '於 is the traditional-character form of the preposition 于 \'at, in, from, than\'; simplified text writes 于, so 於 is met in traditional-script material, calligraphy, classical quotations and as the surname Yū. Its grammar is exactly that of 于. Learners should recognise it when reading but write 于 in simplified Chinese.',
    examples: [
      ex('这块匾上写着“止於至善”四个字。', 'zhè kuài biǎn shàng xiě zhe “zhǐ yú zhì shàn” sì gè zì.', 'This plaque bears the four characters \'rest in the highest good\'.'),
      ex('古语“苛政猛於虎”说明了暴政的危害。', 'gǔyǔ “kē zhèng měng yú hǔ” shuōmíng le bàozhèng de wēihài.', 'The old saying \'harsh government is fiercer than a tiger\' shows the harm of tyranny.'),
    ],
  },
  // HSK7-9 以
  'hsk79-i-c855b53e': {
    structure: '以 + N (means/manner) + V   |   以 A 为 B',
    explanation:
      'Written preposition meaning \'with, by means of, in the manner of\', placed before the verb to give the instrument or manner. It forms common frames like 以…为… \'take A as B\'. In speech 用 or 拿 is used; between clauses 以 can also mean \'in order to\', a different use.',
    examples: [
      ex('他以优异的成绩毕业了。', 'tā yǐ yōuyì de chéngjì bìyè le.', 'He graduated with excellent grades.'),
      ex('我们应以诚待人。', 'wǒmen yīng yǐ chéng dài rén.', 'We should treat others with sincerity.'),
    ],
  },
  // HSK7-9 因
  'hsk79-i-7a87cd74': {
    structure: 'Subj + 因 + N + V   |   因 + clause，(故/而) + result',
    explanation:
      'Written preposition or conjunction meaning \'because of\', placed before the cause and the verb (因病请假, 因雨推迟). It is shorter and more formal than 因为, typical of news and notices. In conversation, especially when answering \'why\', say 因为.',
    examples: [
      ex('他因病请了三天假。', 'tā yīn bìng qǐng le sān tiān jià.', 'He took three days off because of illness.'),
      ex('比赛因雨推迟到下周。', 'bǐsài yīn yǔ tuīchí dào xià zhōu.', 'The match was postponed to next week because of rain.'),
    ],
  },
  // HSK7-9 与
  'hsk79-i-e182e21d': {
    structure: 'A + 与 + B   |   与 + N + V/A (无关/合作/相比)',
    explanation:
      'Written conjunction \'and\' between nouns, or preposition \'with\' before verbs and adjectives such as 无关, 合作 and 相比. It is the formal counterpart of 和 and 跟, common in titles and official prose. Like 和, it does not join clauses.',
    examples: [
      ex('我与他是多年的朋友。', 'wǒ yǔ tā shì duō nián de péngyou.', 'He and I have been friends for many years.'),
      ex('这件事与你无关。', 'zhè jiàn shì yǔ nǐ wúguān.', 'This matter has nothing to do with you.'),
    ],
  },
  // HSK7-9 及
  'hsk79-i-22579e1b': {
    structure: 'A、B + 及 + C',
    explanation:
      'Written conjunction \'and, as well as\', joining nouns or noun phrases, typically before the last item in a list. It often links main and secondary items (领导及工作人员). It is more formal than 和 and cannot join verbs or clauses; 以及 is a close variant that can link longer phrases.',
    examples: [
      ex('请填写姓名、年龄及联系方式。', 'qǐng tiánxiě xìngmíng, niánlíng jí liánxì fāngshì.', 'Please fill in your name, age and contact details.'),
      ex('本校师生及家长均可参加。', 'běn xiào shīshēng jí jiāzhǎng jūn kě cānjiā.', 'Teachers, students and parents of this school may all take part.'),
    ],
  },
  // HSK7-9 较
  'hsk79-i-376b49ab': {
    structure: 'A + 较 + B + 有所 V / A   |   较(为) + A',
    explanation:
      'Written comparative meaning \'compared with\', placed like 比 before the item compared (较去年增长了). As an adverb it also means \'relatively, fairly\' (较为, 较大). It is formal; speech uses 比 for comparison and 比较 for \'relatively\'.',
    examples: [
      ex('今年的收入较去年有所增长。', 'jīnnián de shōurù jiào qùnián yǒu suǒ zēngzhǎng.', 'This year\'s income has grown compared with last year.'),
      ex('这种方法较为简单，适合初学者。', 'zhè zhǒng fāngfǎ jiàowéi jiǎndān, shìhé chūxuézhě.', 'This method is relatively simple and suits beginners.'),
    ],
  },
  // HSK7-9 于…中
  'hsk79-i-5c4416f8': {
    structure: '于 + N/situation + 中 + V',
    explanation:
      'Written frame meaning \'in, among, in the midst of\', placing the setting before the verb. It is the formal version of 在…中 and appears in phrases like 于困境中 and 于人群中. It sounds literary and is avoided in casual speech.',
    examples: [
      ex('她于人群中一眼就认出了我。', 'tā yú rénqún zhōng yì yǎn jiù rèn chū le wǒ.', 'She spotted me at a glance in the crowd.'),
      ex('许多人于困境中学会了坚强。', 'xǔduō rén yú kùnjìng zhōng xuéhuì le jiānqiáng.', 'Many people have learned resilience in the midst of hardship.'),
    ],
  },
  // HSK7-9 即…而言
  'hsk79-i-56c7a475': {
    meaning: 'taking just … (alone) / even as regards …',
    structure: '即 + 以/就 + N + 而言，…',
    explanation:
      '即 \'even, just\' + 以/就 X 而言 \'as far as X is concerned\': it narrows the discussion to one case to show how strong a point is, \'taking just X, …\'. It is formal written style; the ordinary \'regarding\' frame is 就…而言 without 即. The following clause usually gives a striking figure or fact.',
    examples: [
      ex('即以本市而言，每年就有上万名游客。', 'jí yǐ běn shì ér yán, měi nián jiù yǒu shàng wàn míng yóukè.', 'Taking just this city, there are tens of thousands of tourists every year.'),
      ex('即就目前的情况而言，这个方案也不可行。', 'jí jiù mùqián de qíngkuàng ér yán, zhège fāng\'àn yě bù kěxíng.', 'Even judging only by the present situation, this plan is not feasible.'),
    ],
  },
  // HSK7-9 无
  'hsk79-i-72077749': {
    structure: '无 + N   |   无 + V-可/法 (无话可说, 无法)',
    explanation:
      'Written negative verb meaning \'not have, there is no\', the formal counterpart of 没有. It precedes nouns (无人, 无关) and appears in many idioms and compounds (无可奈何, 无法, 空无一人). Unlike 没有, it is not used to negate a past action: 他无来 is wrong.',
    examples: [
      ex('深夜的街上空无一人。', 'shēnyè de jiē shàng kōng wú yì rén.', 'Late at night the street was completely empty.'),
      ex('面对这些证据，他无话可说。', 'miànduì zhèxiē zhèngjù, tā wú huà kě shuō.', 'Faced with this evidence, he had nothing to say.'),
    ],
  },
  // HSK7-9 非
  'hsk79-i-748eed1c': {
    structure: '(并)非 + N/VP   |   非 A 不可',
    explanation:
      'Written negative meaning \'is not, not\', the formal equivalent of 不是; it also forms prefixes (非法, 非正式) and the frame 非…不可 \'must\'. 并非 adds emphasis, \'by no means\'. In speech use 不是, except in fixed expressions such as 非同小可.',
    examples: [
      ex('这并非我的本意。', 'zhè bìng fēi wǒ de běnyì.', 'This was by no means my intention.'),
      ex('此事非同小可，必须认真对待。', 'cǐ shì fēi tóng xiǎo kě, bìxū rènzhēn duìdài.', 'This is no small matter and must be taken seriously.'),
    ],
  },
  // HSK7-9 似
  'hsk79-i-7de477e5': {
    structure: 'Subj + 似 + VP (seems)   |   A + 似 + B (resembles)',
    explanation:
      'Written verb meaning \'to resemble, to seem\', used before a verb phrase (似有难言之隐) or in comparisons and idioms (似曾相识, 归心似箭). It is the literary counterpart of 像 and 好像. Read it sì here; in 似的 (像…似的) it is pronounced shì.',
    examples: [
      ex('这里的景色似曾相识。', 'zhèlǐ de jǐngsè sì céng xiāngshí.', 'The scenery here seems familiar, as if I had seen it before.'),
      ex('他似有难言之隐，欲言又止。', 'tā sì yǒu nán yán zhī yǐn, yù yán yòu zhǐ.', 'He seemed to have something hard to talk about, and checked himself.'),
    ],
  },
  // HSK7-9 可 (classical)
  'hsk79-i-aff9acc6': {
    structure: '(不)可 + V (= 可以)',
    explanation:
      'Written modal meaning \'can, may, be permitted\', placed directly before the verb. It is the concise formal form of 可以, frequent in notices, rules and product descriptions (可免费入场, 不可吸烟). It is unrelated to 可 as an emphatic adverb or as short for 可是 \'but\'.',
    examples: [
      ex('会员可免费入场。', 'huìyuán kě miǎnfèi rùchǎng.', 'Members may enter free of charge.'),
      ex('本产品可用于各种场合。', 'běn chǎnpǐn kě yòng yú gè zhǒng chǎnghé.', 'This product can be used on all kinds of occasions.'),
    ],
  },
  // HSK7-9 欲
  'hsk79-i-d26f57c5': {
    structure: '欲 + V',
    explanation:
      'Literary modal meaning \'want to\' or \'be about to\', placed before the verb; it is stronger and more formal than 想 or 要. It appears in proverbs (欲速则不达) and literary expressions (欲言又止; 摇摇欲坠, where it means \'about to\'). As a noun it means \'desire\', as in 食欲.',
    examples: [
      ex('欲速则不达。', 'yù sù zé bù dá.', 'More haste, less speed.'),
      ex('他张了张嘴，欲言又止。', 'tā zhāng le zhāng zuǐ, yù yán yòu zhǐ.', 'He opened his mouth as if to speak, then stopped.'),
    ],
  },
  // HSK7-9 愿
  'hsk79-i-d8f05dba': {
    structure: 'Subj + 愿 + V   |   愿 + clause (blessing)',
    explanation:
      'Modal verb meaning \'be willing to\', or at the start of a sentence \'may …\', expressing a wish (愿你…). It is the shorter, more formal partner of 愿意. In blessings 愿 takes a whole clause; 愿意 is not used that way, and 希望 sounds less like a formal wish.',
    examples: [
      ex('愿你一路平安。', 'yuàn nǐ yílù píng\'ān.', 'May you have a safe journey.'),
      ex('我愿为大家服务。', 'wǒ yuàn wèi dàjiā fúwù.', 'I am willing to serve everyone.'),
    ],
  },
  // HSK7-9 敢
  'hsk79-i-51eff838': {
    structure: 'Subj + (不) + 敢 + V',
    explanation:
      'Modal verb meaning \'dare to\', placed before the main verb and negated with 不. 我敢说 means \'I bet, I\'d venture to say\'. Unlike 勇敢, which describes a person\'s character, 敢 refers to daring to do a specific action.',
    examples: [
      ex('他不敢一个人走夜路。', 'tā bù gǎn yí gè rén zǒu yèlù.', 'He doesn\'t dare to walk alone at night.'),
      ex('我敢说他明天一定会来。', 'wǒ gǎn shuō tā míngtiān yídìng huì lái.', 'I bet he will definitely come tomorrow.'),
    ],
  },
  // HSK7-9 肯
  'hsk79-i-cd31fc53': {
    structure: 'Subj + (不) + 肯 + V',
    explanation:
      'Modal verb meaning \'be willing to, agree to\', placed before the main verb. It is often negative (不肯) for someone refusing, and appears in conditions such as 只要肯…. Compare 愿意, which expresses inner willingness, while 肯 focuses on consenting to act.',
    examples: [
      ex('他不肯告诉我真相。', 'tā bù kěn gàosu wǒ zhēnxiàng.', 'He refuses to tell me the truth.'),
      ex('只要肯努力，就一定会进步。', 'zhǐyào kěn nǔlì, jiù yídìng huì jìnbù.', 'As long as you are willing to work hard, you will improve.'),
    ],
  },
  // HSK7-9 当
  'hsk79-i-ab440c8e': {
    structure: 'Subj + 当 + V (= 应当)',
    explanation:
      'Literary modal meaning \'should, ought to\', placed before the verb; it is the one-character form of 应当. It appears in formal writing and set phrases (理当如此, 当仁不让). Do not confuse it with 当 \'when\' (当…的时候) or 当 \'to serve as\'.',
    examples: [
      ex('身为学生，当以学业为重。', 'shēn wéi xuésheng, dāng yǐ xuéyè wéi zhòng.', 'As a student, one should put one\'s studies first.'),
      ex('我们当以此为戒。', 'wǒmen dāng yǐ cǐ wéi jiè.', 'We should take this as a warning.'),
    ],
  },
  // HSK7-9 应
  'hsk79-i-b3480eb0': {
    structure: 'Subj + 应 + V',
    explanation:
      'Formal modal meaning \'should\', the short form of 应该/应当, placed directly before the verb. It is typical of rules, regulations and written advice (应保持安静, 应引起重视). In conversation 应该 sounds more natural.',
    examples: [
      ex('公共场所应保持安静。', 'gōnggòng chǎngsuǒ yīng bǎochí ānjìng.', 'Quiet should be kept in public places.'),
      ex('这个问题应引起大家的重视。', 'zhège wèntí yīng yǐnqǐ dàjiā de zhòngshì.', 'This problem deserves everyone\'s attention.'),
    ],
  },
  // HSK7-9 宜
  'hsk79-i-73041a6d': {
    structure: '(不)宜 + V',
    explanation:
      'Written modal meaning \'it is advisable/appropriate to\', placed before the verb and often negated as 不宜. It is common in health advice, notices and set phrases (宜早不宜迟). It is more formal than 应该 and is about suitability rather than obligation.',
    examples: [
      ex('饭后不宜马上运动。', 'fàn hòu bù yí mǎshàng yùndòng.', 'It is not advisable to exercise right after a meal.'),
      ex('此事宜早不宜迟。', 'cǐ shì yí zǎo bù yí chí.', 'This should be done sooner rather than later.'),
    ],
  },
  // HSK7-9 须
  'hsk79-i-763d3eda': {
    structure: 'Subj + 须 + V   |   无须 + V',
    explanation:
      'Written modal meaning \'must, have to\', the short form of 必须, placed before the verb. It is common in rules and instructions (须携带, 须知); the negative is 无须 or 不必, not 不须. In speech people use 必须 or 得 (děi).',
    examples: [
      ex('参加考试须携带身份证。', 'cānjiā kǎoshì xū xiédài shēnfènzhèng.', 'You must bring your ID card to the exam.'),
      ex('此药须在饭后服用。', 'cǐ yào xū zài fàn hòu fúyòng.', 'This medicine must be taken after meals.'),
    ],
  },
  // HSK7-9 克
  'hsk79-i-a9f67bd5': {
    structure: '(不)克 + V',
    explanation:
      'Literary modal meaning \'be able to\', placed before a verb, mostly in formal letters and set phrases (不克出席, 克勤克俭). It sounds very polite and old-fashioned; normal speech uses 能. As a full verb, 克 means \'to overcome\' (克服, 攻克).',
    examples: [
      ex('本人因事不克出席，敬请谅解。', 'běnrén yīn shì bú kè chūxí, jìng qǐng liàngjiě.', 'Owing to prior business I am unable to attend; please accept my apologies.'),
      ex('唯有齐心协力，方克有成。', 'wéiyǒu qíxīn xiélì, fāng kè yǒu chéng.', 'Only by working together can we succeed.'),
    ],
  },
  // HSK7-9 足
  'hsk79-i-16fdcc7e': {
    structure: '(不)足 + V   |   (不)足以 + V',
    explanation:
      'Written modal meaning \'be enough to, be worth\', placed before a verb (不足为奇, 不足挂齿, 足见). It often appears as 足以 \'sufficient to\'. 不足 + V means \'not worth V-ing\' or \'not enough to\', which differs from 不够 \'not enough in quantity\'.',
    examples: [
      ex('这点工资不足以支付房租。', 'zhè diǎn gōngzī bùzú yǐ zhīfù fángzū.', 'This little salary is not enough to pay the rent.'),
      ex('他犯这种错误，并不足为奇。', 'tā fàn zhè zhǒng cuòwù, bìng bùzú wéi qí.', 'It is hardly surprising that he made this kind of mistake.'),
    ],
  },
  // HSK7-9 堪
  'hsk79-i-c90bd4c7': {
    structure: '堪 + V (堪称)   |   不堪 + N/V',
    explanation:
      'Literary modal meaning \'can bear, be worthy of\', placed before a verb. Positive uses praise (堪称经典 \'may be called a classic\'); 不堪 means \'unable to bear\' or \'utterly (bad)\' (不堪重负, 不堪一击). It is written style; in speech use 能 or 受不了.',
    examples: [
      ex('这部电影堪称经典。', 'zhè bù diànyǐng kānchēng jīngdiǎn.', 'This film can truly be called a classic.'),
      ex('他已经不堪重负，需要好好休息。', 'tā yǐjīng bù kān zhòngfù, xūyào hǎohǎo xiūxi.', 'He can no longer bear the heavy load and needs a good rest.'),
    ],
  },
  // HSK7-9 忍
  'hsk79-i-4ce4242d': {
    structure: '忍 + N   |   (不)忍(心) + V   |   忍不住 + V',
    explanation:
      'Verb meaning \'to endure, to bear\', taking objects such as 痛 or 气; before another verb it means \'have the heart to\' (不忍心, 不忍看). 忍不住 means \'can\'t help (doing)\'. Compare 受, which simply means \'receive, suffer\', while 忍 stresses holding back one\'s reaction.',
    examples: [
      ex('我实在忍不住笑了出来。', 'wǒ shízài rěn bú zhù xiào le chūlai.', 'I really couldn\'t help bursting out laughing.'),
      ex('他不忍心拒绝孩子的请求。', 'tā bù rěnxīn jùjué háizi de qǐngqiú.', 'He didn\'t have the heart to refuse the child\'s request.'),
    ],
  },
};

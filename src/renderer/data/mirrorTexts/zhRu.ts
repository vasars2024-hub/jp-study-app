/**
 * Mirror Writing texts for Chinese and Russian study. Original, written for
 * this app, under the same rules as the Japanese set in index.ts: the idea map
 * says what to express and never how, one idea per reference sentence, in
 * order. Two texts per level per language; the learner's own imported texts
 * add to these (mirrorTextImport.ts).
 */
import type { MirrorText } from './index';

export const ZH_MIRROR_TEXTS: MirrorText[] = [
  {
    id: 'mirror-zh-l1-intro', lang: 'zh', level: 1, title: 'Self introduction',
    ideaMap: [
      { id: 'zh1i-1', concepts: { en: 'Say hello and give your name.', ru: 'Поздоровайтесь и назовите своё имя.' } },
      { id: 'zh1i-2', concepts: { en: 'Say that you are a student.', ru: 'Скажите, что вы студент.' } },
      { id: 'zh1i-3', concepts: { en: 'Say that you study Chinese every day.', ru: 'Скажите, что каждый день учите китайский.' } },
    ],
    reference: '你好，我叫小明。我是学生。我每天学习汉语。',
  },
  {
    id: 'mirror-zh-l1-family', lang: 'zh', level: 1, title: 'My family',
    ideaMap: [
      { id: 'zh1f-1', concepts: { en: 'Say that there are four people in your family.', ru: 'Скажите, что в вашей семье четыре человека.' } },
      { id: 'zh1f-2', concepts: { en: 'Say that your mother is a doctor.', ru: 'Скажите, что ваша мама — врач.' } },
      { id: 'zh1f-3', concepts: { en: 'Say that you love your family.', ru: 'Скажите, что любите свою семью.' } },
    ],
    reference: '我家有四口人。我妈妈是医生。我很爱我的家人。',
  },
  {
    id: 'mirror-zh-l2-weekend', lang: 'zh', level: 2, title: 'Last weekend',
    ideaMap: [
      { id: 'zh2w-1', concepts: { en: 'Say that you went shopping with a friend last Saturday.', ru: 'Скажите, что в прошлую субботу ходили с другом за покупками.' } },
      { id: 'zh2w-2', concepts: { en: 'Say that you bought a new coat.', ru: 'Скажите, что купили новое пальто.' } },
      { id: 'zh2w-3', concepts: { en: 'Say that it was a little expensive but very pretty.', ru: 'Скажите, что оно было немного дорогим, но очень красивым.' } },
    ],
    reference: '上个星期六我和朋友去买东西了。我买了一件新大衣。有点儿贵，但是很漂亮。',
  },
  {
    id: 'mirror-zh-l2-restaurant', lang: 'zh', level: 2, title: 'At a restaurant',
    ideaMap: [
      { id: 'zh2r-1', concepts: { en: 'Say that you want a bowl of noodles.', ru: 'Скажите, что хотите тарелку лапши.' } },
      { id: 'zh2r-2', concepts: { en: 'Ask for it not to be too spicy.', ru: 'Попросите, чтобы было не слишком остро.' } },
      { id: 'zh2r-3', concepts: { en: 'Ask how much it costs altogether.', ru: 'Спросите, сколько всего стоит.' } },
    ],
    reference: '我要一碗面条。请不要太辣。一共多少钱？',
  },
  {
    id: 'mirror-zh-l3-travel', lang: 'zh', level: 3, title: 'A trip plan',
    ideaMap: [
      { id: 'zh3t-1', concepts: { en: 'Say that you plan to travel to Shanghai this summer.', ru: 'Скажите, что этим летом собираетесь поехать в Шанхай.' } },
      { id: 'zh3t-2', concepts: { en: 'Say that you will go by train because it is faster than the bus.', ru: 'Скажите, что поедете на поезде, потому что он быстрее автобуса.' } },
      { id: 'zh3t-3', concepts: { en: 'Say that you want to try the local food there.', ru: 'Скажите, что хотите попробовать там местную еду.' } },
    ],
    reference: '今年夏天我打算去上海旅游。我坐火车去，因为火车比汽车快。我想尝尝那儿的特色菜。',
  },
  {
    id: 'mirror-zh-l3-sick', lang: 'zh', level: 3, title: 'Calling in sick',
    ideaMap: [
      { id: 'zh3s-1', concepts: { en: 'Tell your teacher that you have a fever today.', ru: 'Скажите учителю, что у вас сегодня температура.' } },
      { id: 'zh3s-2', concepts: { en: 'Say that you cannot come to class.', ru: 'Скажите, что не сможете прийти на занятие.' } },
      { id: 'zh3s-3', concepts: { en: 'Ask a classmate to send you the homework.', ru: 'Попросите одноклассника прислать вам домашнее задание.' } },
    ],
    reference: '老师，我今天发烧了。我不能来上课了。我会请同学把作业发给我。',
  },
  {
    id: 'mirror-zh-l4-phone', lang: 'zh', level: 4, title: 'A lost phone',
    ideaMap: [
      { id: 'zh4p-1', concepts: { en: 'Say that your phone was stolen on the subway yesterday.', ru: 'Скажите, что вчера в метро у вас украли телефон.' } },
      { id: 'zh4p-2', concepts: { en: 'Say that you did not notice until you got home.', ru: 'Скажите, что заметили это только дома.' } },
      { id: 'zh4p-3', concepts: { en: 'Say that from now on you will be more careful.', ru: 'Скажите, что впредь будете внимательнее.' } },
    ],
    reference: '昨天我的手机在地铁上被偷了。我到家以后才发现。以后我一定会更小心。',
  },
  {
    id: 'mirror-zh-l4-habit', lang: 'zh', level: 4, title: 'A good habit',
    ideaMap: [
      { id: 'zh4h-1', concepts: { en: 'Say that you have run every morning for a year.', ru: 'Скажите, что уже год бегаете по утрам.' } },
      { id: 'zh4h-2', concepts: { en: 'Say that not only are you healthier, you also sleep better.', ru: 'Скажите, что стали не только здоровее, но и лучше спите.' } },
      { id: 'zh4h-3', concepts: { en: 'Say that as long as you persist, anyone can do it.', ru: 'Скажите, что если не бросать, это может любой.' } },
    ],
    reference: '我每天早上跑步，已经跑了一年了。我不但身体更好了，而且睡得也更好了。只要坚持，谁都能做到。',
  },
  {
    id: 'mirror-zh-l5-online', lang: 'zh', level: 5, title: 'Online shopping',
    ideaMap: [
      { id: 'zh5o-1', concepts: { en: 'Say that online shopping has become part of daily life.', ru: 'Скажите, что покупки в интернете стали частью повседневной жизни.' } },
      { id: 'zh5o-2', concepts: { en: 'Say that it saves time, but it is hard to judge quality.', ru: 'Скажите, что это экономит время, но трудно оценить качество.' } },
      { id: 'zh5o-3', concepts: { en: 'Say that you should read reviews before buying.', ru: 'Скажите, что перед покупкой стоит читать отзывы.' } },
    ],
    reference: '网上购物已经成为日常生活的一部分。它虽然节省时间，但是很难判断质量。因此，买东西以前最好先看看评价。',
  },
  {
    id: 'mirror-zh-l5-city', lang: 'zh', level: 5, title: 'City or countryside',
    ideaMap: [
      { id: 'zh5c-1', concepts: { en: 'Say that more and more young people move to big cities.', ru: 'Скажите, что всё больше молодых людей переезжают в большие города.' } },
      { id: 'zh5c-2', concepts: { en: 'Say that cities offer more opportunities.', ru: 'Скажите, что в городах больше возможностей.' } },
      { id: 'zh5c-3', concepts: { en: 'Say that the pressure of life there is also greater.', ru: 'Скажите, что и жизненное давление там сильнее.' } },
    ],
    reference: '越来越多的年轻人搬到大城市。城市提供了更多的机会。不过，那里的生活压力也更大。',
  },
  {
    id: 'mirror-zh-l6-ai', lang: 'zh', level: 6, title: 'Technology and work',
    ideaMap: [
      { id: 'zh6a-1', concepts: { en: 'Say that with the development of technology, many jobs are changing.', ru: 'Скажите, что с развитием технологий многие профессии меняются.' } },
      { id: 'zh6a-2', concepts: { en: 'Say that some repetitive work will be replaced by machines.', ru: 'Скажите, что часть однообразной работы заменят машины.' } },
      { id: 'zh6a-3', concepts: { en: 'Say that people should keep learning new skills.', ru: 'Скажите, что людям нужно постоянно осваивать новые навыки.' } },
    ],
    reference: '随着科技的发展，许多工作正在发生变化。一些重复性的工作将被机器取代。因此，人们应当不断学习新的技能。',
  },
  {
    id: 'mirror-zh-l6-environment', lang: 'zh', level: 6, title: 'Protecting the environment',
    ideaMap: [
      { id: 'zh6e-1', concepts: { en: 'Say that environmental problems concern everyone.', ru: 'Скажите, что проблемы экологии касаются всех.' } },
      { id: 'zh6e-2', concepts: { en: 'Say that even small actions, like sorting rubbish, matter.', ru: 'Скажите, что даже мелочи, например сортировка мусора, важны.' } },
      { id: 'zh6e-3', concepts: { en: 'Say that the government should also take stronger measures.', ru: 'Скажите, что и государству следует принимать более решительные меры.' } },
    ],
    reference: '环境问题关系到每一个人。即使是垃圾分类这样的小事，也很重要。同时，政府也应当采取更有力的措施。',
  },
  {
    id: 'mirror-zh-l7-tradition', lang: 'zh', level: 7, title: 'Tradition and change',
    ideaMap: [
      { id: 'zh7t-1', concepts: { en: 'Say that traditional culture is facing unprecedented challenges.', ru: 'Скажите, что традиционная культура сталкивается с беспрецедентными вызовами.' } },
      { id: 'zh7t-2', concepts: { en: 'Say that blindly rejecting it and blindly preserving it are both unwise.', ru: 'Скажите, что и слепо отвергать её, и слепо сохранять одинаково неразумно.' } },
      { id: 'zh7t-3', concepts: { en: 'Say that the key lies in inheriting it while innovating.', ru: 'Скажите, что суть в том, чтобы наследовать её, одновременно обновляя.' } },
    ],
    reference: '传统文化正面临前所未有的挑战。一味排斥与一味守旧都不可取。关键在于在传承中创新。',
  },
  {
    id: 'mirror-zh-l7-reading', lang: 'zh', level: 7, title: 'The value of reading',
    ideaMap: [
      { id: 'zh7r-1', concepts: { en: 'Say that in an age of information overload, deep reading is increasingly rare.', ru: 'Скажите, что в эпоху информационной перегрузки глубокое чтение становится редкостью.' } },
      { id: 'zh7r-2', concepts: { en: 'Say that fragmented reading can hardly build systematic knowledge.', ru: 'Скажите, что фрагментарное чтение вряд ли даёт системные знания.' } },
      { id: 'zh7r-3', concepts: { en: 'Say that we should set aside time to read a book carefully.', ru: 'Скажите, что стоит выделять время, чтобы внимательно прочитать книгу.' } },
    ],
    reference: '在信息爆炸的时代，深度阅读愈发难得。碎片化阅读难以构建系统的知识。我们不妨抽出时间，认真读完一本书。',
  },
];

export const RU_MIRROR_TEXTS: MirrorText[] = [
  {
    id: 'mirror-ru-l1-intro', lang: 'ru', level: 1, title: 'Self introduction',
    ideaMap: [
      { id: 'ru1i-1', concepts: { en: 'Say hello and give your name.', zh: '打招呼并说出你的名字。' } },
      { id: 'ru1i-2', concepts: { en: 'Say that you live in a big city.', zh: '说你住在一个大城市。' } },
      { id: 'ru1i-3', concepts: { en: 'Say that you are learning Russian.', zh: '说你在学俄语。' } },
    ],
    reference: 'Здравствуйте, меня зовут Алекс. Я живу в большом городе. Я изучаю русский язык.',
  },
  {
    id: 'mirror-ru-l1-room', lang: 'ru', level: 1, title: 'My room',
    ideaMap: [
      { id: 'ru1r-1', concepts: { en: 'Say that your room is small but bright.', zh: '说你的房间不大，但很明亮。' } },
      { id: 'ru1r-2', concepts: { en: 'Say that there is a table and a bed.', zh: '说房间里有一张桌子和一张床。' } },
      { id: 'ru1r-3', concepts: { en: 'Say that there are many books on the table.', zh: '说桌子上有很多书。' } },
    ],
    reference: 'Моя комната маленькая, но светлая. Там есть стол и кровать. На столе много книг.',
  },
  {
    id: 'mirror-ru-l2-weekend', lang: 'ru', level: 2, title: 'Last weekend',
    ideaMap: [
      { id: 'ru2w-1', concepts: { en: 'Say that on Saturday you went to the park with friends.', zh: '说星期六你和朋友去了公园。' } },
      { id: 'ru2w-2', concepts: { en: 'Say that the weather was warm and sunny.', zh: '说天气暖和、阳光明媚。' } },
      { id: 'ru2w-3', concepts: { en: 'Say that in the evening you watched a film at home.', zh: '说晚上你在家看了一部电影。' } },
    ],
    reference: 'В субботу я ходил в парк с друзьями. Погода была тёплая и солнечная. Вечером я смотрел фильм дома.',
  },
  {
    id: 'mirror-ru-l2-shop', lang: 'ru', level: 2, title: 'In a shop',
    ideaMap: [
      { id: 'ru2s-1', concepts: { en: 'Say that you would like to buy bread and milk.', zh: '说你想买面包和牛奶。' } },
      { id: 'ru2s-2', concepts: { en: 'Ask how much it costs.', zh: '问一下多少钱。' } },
      { id: 'ru2s-3', concepts: { en: 'Say that you will pay by card.', zh: '说你用银行卡付款。' } },
    ],
    reference: 'Я хотел бы купить хлеб и молоко. Сколько это стоит? Я заплачу картой.',
  },
  {
    id: 'mirror-ru-l3-plans', lang: 'ru', level: 3, title: 'Summer plans',
    ideaMap: [
      { id: 'ru3p-1', concepts: { en: 'Say that in summer you are going to the sea.', zh: '说夏天你打算去海边。' } },
      { id: 'ru3p-2', concepts: { en: 'Say that you will go by train because it is cheaper than flying.', zh: '说你会坐火车去，因为比坐飞机便宜。' } },
      { id: 'ru3p-3', concepts: { en: 'Say that if the weather is good, you will swim every day.', zh: '说如果天气好，你每天都去游泳。' } },
    ],
    reference: 'Летом я собираюсь поехать на море. Я поеду на поезде, потому что это дешевле, чем самолёт. Если будет хорошая погода, я буду плавать каждый день.',
  },
  {
    id: 'mirror-ru-l3-doctor', lang: 'ru', level: 3, title: 'At the doctor',
    ideaMap: [
      { id: 'ru3d-1', concepts: { en: 'Say that your head has been hurting since yesterday.', zh: '说你从昨天开始头疼。' } },
      { id: 'ru3d-2', concepts: { en: 'Say that you also have a high temperature.', zh: '说你还发高烧。' } },
      { id: 'ru3d-3', concepts: { en: 'Ask what medicine you should take.', zh: '问应该吃什么药。' } },
    ],
    reference: 'У меня со вчерашнего дня болит голова. Ещё у меня высокая температура. Какое лекарство мне нужно принимать?',
  },
  {
    id: 'mirror-ru-l4-phone', lang: 'ru', level: 4, title: 'A lost phone',
    ideaMap: [
      { id: 'ru4p-1', concepts: { en: 'Say that yesterday you left your phone on the bus.', zh: '说你昨天把手机忘在了公交车上。' } },
      { id: 'ru4p-2', concepts: { en: 'Say that you only noticed it at home.', zh: '说你到家才发现。' } },
      { id: 'ru4p-3', concepts: { en: 'Say that fortunately a kind person returned it.', zh: '说幸好一位好心人把它还了回来。' } },
    ],
    reference: 'Вчера я забыл телефон в автобусе. Я заметил это только дома. К счастью, добрый человек вернул его мне.',
  },
  {
    id: 'mirror-ru-l4-habit', lang: 'ru', level: 4, title: 'A useful habit',
    ideaMap: [
      { id: 'ru4h-1', concepts: { en: 'Say that you have been getting up early for a year.', zh: '说你已经早起一年了。' } },
      { id: 'ru4h-2', concepts: { en: 'Say that thanks to this you have more free time.', zh: '说因此你有了更多空闲时间。' } },
      { id: 'ru4h-3', concepts: { en: 'Say that the hardest part was the first week.', zh: '说最难的是第一个星期。' } },
    ],
    reference: 'Я уже год встаю рано. Благодаря этому у меня стало больше свободного времени. Труднее всего было в первую неделю.',
  },
  {
    id: 'mirror-ru-l5-online', lang: 'ru', level: 5, title: 'Remote work',
    ideaMap: [
      { id: 'ru5o-1', concepts: { en: 'Say that more and more people work from home.', zh: '说越来越多的人在家工作。' } },
      { id: 'ru5o-2', concepts: { en: 'Say that it saves time on the commute.', zh: '说这节省了通勤时间。' } },
      { id: 'ru5o-3', concepts: { en: 'Say that, however, many people miss live communication.', zh: '说不过很多人怀念面对面的交流。' } },
    ],
    reference: 'Всё больше людей работают из дома. Это экономит время на дорогу. Однако многим не хватает живого общения.',
  },
  {
    id: 'mirror-ru-l5-city', lang: 'ru', level: 5, title: 'City or countryside',
    ideaMap: [
      { id: 'ru5c-1', concepts: { en: 'Say that life in a big city gives more opportunities.', zh: '说大城市的生活提供更多机会。' } },
      { id: 'ru5c-2', concepts: { en: 'Say that in the countryside the air is cleaner and life is calmer.', zh: '说乡村空气更干净，生活更平静。' } },
      { id: 'ru5c-3', concepts: { en: 'Say that the choice depends on what matters most to a person.', zh: '说选择取决于一个人最看重什么。' } },
    ],
    reference: 'Жизнь в большом городе даёт больше возможностей. В деревне воздух чище, а жизнь спокойнее. Выбор зависит от того, что для человека важнее.',
  },
  {
    id: 'mirror-ru-l6-tech', lang: 'ru', level: 6, title: 'Technology and work',
    ideaMap: [
      { id: 'ru6t-1', concepts: { en: 'Say that with the development of technology many professions are changing.', zh: '说随着技术的发展，许多职业正在改变。' } },
      { id: 'ru6t-2', concepts: { en: 'Say that part of routine work will inevitably be automated.', zh: '说一部分重复性工作将不可避免地被自动化。' } },
      { id: 'ru6t-3', concepts: { en: 'Say that people should therefore keep learning throughout their lives.', zh: '说因此人们应该终身学习。' } },
    ],
    reference: 'С развитием технологий многие профессии меняются. Часть рутинной работы неизбежно будет автоматизирована. Поэтому людям следует учиться на протяжении всей жизни.',
  },
  {
    id: 'mirror-ru-l6-ecology', lang: 'ru', level: 6, title: 'Protecting nature',
    ideaMap: [
      { id: 'ru6e-1', concepts: { en: 'Say that environmental problems concern everyone without exception.', zh: '说环境问题关系到每一个人。' } },
      { id: 'ru6e-2', concepts: { en: 'Say that even small steps, such as sorting rubbish, matter.', zh: '说即使是垃圾分类这样的小事也很重要。' } },
      { id: 'ru6e-3', concepts: { en: 'Say that at the same time the state must take decisive measures.', zh: '说同时国家必须采取果断措施。' } },
    ],
    reference: 'Экологические проблемы касаются всех без исключения. Даже небольшие шаги, например сортировка мусора, имеют значение. Вместе с тем государство должно принимать решительные меры.',
  },
  {
    id: 'mirror-ru-l7-tradition', lang: 'ru', level: 7, title: 'Tradition and change',
    ideaMap: [
      { id: 'ru7t-1', concepts: { en: 'Say that traditional culture faces unprecedented challenges today.', zh: '说传统文化今天面临前所未有的挑战。' } },
      { id: 'ru7t-2', concepts: { en: 'Say that both blind rejection and blind preservation are equally fruitless.', zh: '说盲目排斥和盲目守旧同样徒劳。' } },
      { id: 'ru7t-3', concepts: { en: 'Say that the point is to carry it on while renewing it.', zh: '说关键在于在传承中创新。' } },
    ],
    reference: 'Сегодня традиционная культура сталкивается с беспрецедентными вызовами. Как слепое отрицание, так и слепое охранительство одинаково бесплодны. Суть в том, чтобы, сохраняя преемственность, обновлять её.',
  },
  {
    id: 'mirror-ru-l7-reading', lang: 'ru', level: 7, title: 'The value of reading',
    ideaMap: [
      { id: 'ru7r-1', concepts: { en: 'Say that in an age of information overload, deep reading is becoming a rarity.', zh: '说在信息过载的时代，深度阅读正变得难得。' } },
      { id: 'ru7r-2', concepts: { en: 'Say that fragmentary reading hardly builds systematic knowledge.', zh: '说碎片化阅读难以形成系统的知识。' } },
      { id: 'ru7r-3', concepts: { en: 'Say that it is worth setting time aside to read a book thoughtfully.', zh: '说值得抽出时间认真读完一本书。' } },
    ],
    reference: 'В эпоху информационной перегрузки глубокое чтение становится редкостью. Фрагментарное чтение едва ли формирует системные знания. Стоит выделять время, чтобы вдумчиво прочитать книгу.',
  },
];

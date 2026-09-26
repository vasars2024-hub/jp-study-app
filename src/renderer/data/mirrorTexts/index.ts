import type { LevelTier, StudyLang } from '../../../shared/levelScale';
import type { SourceLang } from '../../games/types';
import { RU_MIRROR_TEXTS, ZH_MIRROR_TEXTS } from './zhRu';

export { RU_MIRROR_TEXTS, ZH_MIRROR_TEXTS };

export interface MirrorIdea {
  id: string;
  /** What to express, in the player's languages. English is required; the rest fall back to it. */
  concepts: { en: string } & Partial<Record<SourceLang, string>>;
}

export interface MirrorText {
  id: string;
  /** The language the reference is written in. Absent means Japanese (the original set). */
  lang?: StudyLang;
  level: LevelTier;
  title: string;
  ideaMap: MirrorIdea[];
  reference: string;
  /** Set on texts the learner imported. */
  userImported?: boolean;
}

// Authoring rules — the Mirror Writing flow and its evaluator depend on these:
//   1. The idea map must say WHAT to express, never HOW — no Japanese in the
//      concepts, or the exercise degrades from recall into transcription.
//   2. One idea per sentence of the reference, in the same order: the local
//      rubric evaluator scores fidelity by term coverage against `reference`
//      and compares sentence count to `ideaMap.length`.
//   3. Three texts per level: the picker filters to level +/-1, so a thin band
//      hands the user the same prompt repeatedly.
export const MIRROR_TEXTS: MirrorText[] = [
  {
    id: 'mirror-l1-self-intro',
    level: 1,
    title: 'Self introduction',
    ideaMap: [
      { id: 'm1-1', concepts: { en: 'Say hello and give your name.', ru: 'Поздоровайтесь и назовите своё имя.', zh: '打招呼并说出自己的名字。' } },
      { id: 'm1-2', concepts: { en: 'Say that you are a student.', ru: 'Скажите, что вы студент.', zh: '说自己是学生。' } },
      { id: 'm1-3', concepts: { en: 'Say that you study Japanese every day.', ru: 'Скажите, что вы каждый день изучаете японский.', zh: '说自己每天学习日语。' } },
    ],
    reference: 'こんにちは。私はアレックスです。学生です。毎日日本語を勉強しています。',
  },
  {
    id: 'mirror-l1-family',
    level: 1,
    title: 'My family',
    ideaMap: [
      { id: 'm1f-1', concepts: { en: 'Say how many people are in your family.', ru: 'Скажите, сколько человек в вашей семье.', zh: '说你家有几口人。' } },
      { id: 'm1f-2', concepts: { en: 'Say that your father is a teacher.', ru: 'Скажите, что ваш отец — учитель.', zh: '说你父亲是老师。' } },
      { id: 'm1f-3', concepts: { en: 'Say that you like your family very much.', ru: 'Скажите, что очень любите свою семью.', zh: '说你很喜欢自己的家人。' } },
    ],
    reference: '私の家族は四人です。父は先生です。私は家族が大好きです。',
  },
  {
    id: 'mirror-l1-morning',
    level: 1,
    title: 'Morning routine',
    ideaMap: [
      { id: 'm1m-1', concepts: { en: 'Say that you get up at seven every morning.', ru: 'Скажите, что встаёте каждое утро в семь.', zh: '说你每天早上七点起床。' } },
      { id: 'm1m-2', concepts: { en: 'Say that you drink coffee.', ru: 'Скажите, что пьёте кофе.', zh: '说你喝咖啡。' } },
      { id: 'm1m-3', concepts: { en: 'Say that you go to school by bus.', ru: 'Скажите, что едете в школу на автобусе.', zh: '说你坐公交车去学校。' } },
    ],
    reference: '毎朝七時に起きます。コーヒーを飲みます。バスで学校へ行きます。',
  },
  {
    id: 'mirror-l2-weekend',
    level: 2,
    title: 'Weekend plan',
    ideaMap: [
      { id: 'm2-1', concepts: { en: 'Say that you will go to a cafe on Saturday.', ru: 'Скажите, что в субботу пойдёте в кафе.', zh: '说星期六要去咖啡店。' } },
      { id: 'm2-2', concepts: { en: 'Say that you will read a book there.', ru: 'Скажите, что будете читать там книгу.', zh: '说会在那里看书。' } },
      { id: 'm2-3', concepts: { en: 'Invite a friend to come too.', ru: 'Пригласите друга тоже прийти.', zh: '邀请朋友也一起来。' } },
    ],
    reference: '土曜日にカフェへ行きます。そこで本を読みます。友達も一緒に来ませんか。',
  },
  {
    id: 'mirror-l2-shopping',
    level: 2,
    title: 'Shopping yesterday',
    ideaMap: [
      { id: 'm2s-1', concepts: { en: 'Say that you went to a store yesterday.', ru: 'Скажите, что вчера ходили в магазин.', zh: '说你昨天去了商店。' } },
      { id: 'm2s-2', concepts: { en: 'Say that you bought a new book.', ru: 'Скажите, что купили новую книгу.', zh: '说你买了一本新书。' } },
      { id: 'm2s-3', concepts: { en: 'Say that it was a little expensive.', ru: 'Скажите, что она была немного дорогой.', zh: '说有点贵。' } },
    ],
    reference: '昨日、店へ行きました。新しい本を買いました。少し高かったです。',
  },
  {
    id: 'mirror-l2-weather',
    level: 2,
    title: "Today's weather",
    ideaMap: [
      { id: 'm2w-1', concepts: { en: 'Say that it is very hot today.', ru: 'Скажите, что сегодня очень жарко.', zh: '说今天很热。' } },
      { id: 'm2w-2', concepts: { en: 'Say that you want to drink cold water.', ru: 'Скажите, что хотите выпить холодной воды.', zh: '说你想喝冷水。' } },
      { id: 'm2w-3', concepts: { en: 'Say that it will probably rain tomorrow.', ru: 'Скажите, что завтра, вероятно, будет дождь.', zh: '说明天大概会下雨。' } },
    ],
    reference: '今日はとても暑いです。冷たい水が飲みたいです。明日は雨が降るでしょう。',
  },
  {
    id: 'mirror-l3-lost-item',
    level: 3,
    title: 'Lost item',
    ideaMap: [
      { id: 'm3-1', concepts: { en: 'Explain that you lost your umbrella at the station.', ru: 'Объясните, что потеряли зонт на станции.', zh: '说明你在车站丢了伞。' } },
      { id: 'm3-2', concepts: { en: 'Describe the umbrella color.', ru: 'Опишите цвет зонта.', zh: '描述伞的颜色。' } },
      { id: 'm3-3', concepts: { en: 'Ask what you should do.', ru: 'Спросите, что вам следует сделать.', zh: '询问应该怎么做。' } },
    ],
    reference: '駅で傘をなくしてしまいました。黒くて小さい傘です。どうすればいいでしょうか。',
  },
  {
    id: 'mirror-l3-hobby',
    level: 3,
    title: 'Talking about a hobby',
    ideaMap: [
      { id: 'm3h-1', concepts: { en: 'Say that your hobby is taking photographs.', ru: 'Скажите, что ваше хобби — фотографировать.', zh: '说你的爱好是拍照。' } },
      { id: 'm3h-2', concepts: { en: 'Say that you often go to the park on weekends.', ru: 'Скажите, что по выходным часто ходите в парк.', zh: '说你周末常去公园。' } },
      { id: 'm3h-3', concepts: { en: 'Say that you cannot take good photos yet.', ru: 'Скажите, что пока не умеете хорошо фотографировать.', zh: '说你还拍得不好。' } },
    ],
    reference: '私の趣味は写真を撮ることです。週末によく公園へ行きます。まだ上手に撮ることができません。',
  },
  {
    id: 'mirror-l3-restaurant',
    level: 3,
    title: 'Recommending a restaurant',
    ideaMap: [
      { id: 'm3r-1', concepts: { en: 'Say there is a good restaurant near the station.', ru: 'Скажите, что рядом со станцией есть хороший ресторан.', zh: '说车站附近有一家好餐厅。' } },
      { id: 'm3r-2', concepts: { en: 'Say that you ate there with a friend last week.', ru: 'Скажите, что на прошлой неделе ели там с другом.', zh: '说你上周和朋友在那里吃过。' } },
      { id: 'm3r-3', concepts: { en: 'Say that the ramen was very delicious.', ru: 'Скажите, что рамен был очень вкусным.', zh: '说拉面很好吃。' } },
    ],
    reference: '駅の近くにいいレストランがあります。先週、友達とそこで食べました。ラーメンがとてもおいしかったです。',
  },
  {
    id: 'mirror-l4-delay',
    level: 4,
    title: 'Train delay',
    ideaMap: [
      { id: 'm4-1', concepts: { en: 'Say the train is delayed because of heavy rain.', ru: 'Скажите, что поезд задерживается из-за сильного дождя.', zh: '说电车因大雨晚点。' } },
      { id: 'm4-2', concepts: { en: 'Apologize for arriving late.', ru: 'Извинитесь за опоздание.', zh: '为迟到道歉。' } },
      { id: 'm4-3', concepts: { en: 'Promise to contact them when you arrive.', ru: 'Пообещайте связаться, когда прибудете.', zh: '承诺到了以后联系对方。' } },
    ],
    reference: '大雨のため、電車が遅れています。到着が遅くなってしまい、申し訳ありません。着いたらすぐに連絡します。',
  },
  {
    id: 'mirror-l4-advice',
    level: 4,
    title: 'Giving advice',
    ideaMap: [
      { id: 'm4a-1', concepts: { en: 'Say that your friend seems tired lately.', ru: 'Скажите, что ваш друг в последнее время выглядит уставшим.', zh: '说你朋友最近好像很累。' } },
      { id: 'm4a-2', concepts: { en: 'Say that they should consult a doctor.', ru: 'Скажите, что ему стоит обратиться к врачу.', zh: '说他最好去咨询医生。' } },
      { id: 'm4a-3', concepts: { en: 'Ask them not to push themselves while unwell.', ru: 'Попросите не перенапрягаться, пока он нездоров.', zh: '请他生病时不要勉强。' } },
    ],
    reference: '友達は最近疲れているようです。医者に相談したほうがいいと思います。体の調子が悪い時は、無理をしないでください。',
  },
  {
    id: 'mirror-l4-abroad',
    level: 4,
    title: 'Study abroad plan',
    ideaMap: [
      { id: 'm4b-1', concepts: { en: 'Say that you plan to study abroad next year.', ru: 'Скажите, что в следующем году собираетесь учиться за границей.', zh: '说你打算明年去留学。' } },
      { id: 'm4b-2', concepts: { en: 'Say that you have never been to Japan.', ru: 'Скажите, что никогда не были в Японии.', zh: '说你还没去过日本。' } },
      { id: 'm4b-3', concepts: { en: 'Say that you are studying while working.', ru: 'Скажите, что учитесь, одновременно работая.', zh: '说你一边工作一边学习。' } },
    ],
    reference: '来年、留学するつもりです。日本にはまだ行ったことがありません。今は働きながら勉強しています。',
  },
  {
    id: 'mirror-l5-request',
    level: 5,
    title: 'Polite request',
    ideaMap: [
      { id: 'm5-1', concepts: { en: 'Say you checked the report.', ru: 'Скажите, что проверили отчёт.', zh: '说自己确认了报告。' } },
      { id: 'm5-2', concepts: { en: 'Ask the other person to review one section.', ru: 'Попросите собеседника проверить один раздел.', zh: '请对方检查一个部分。' } },
      { id: 'm5-3', concepts: { en: 'Explain that you want to submit it by tomorrow.', ru: 'Объясните, что хотите отправить его до завтра.', zh: '说明想在明天前提交。' } },
    ],
    reference: '報告書を確認しました。一つの部分だけ見直していただけないでしょうか。明日までに提出したいと思っています。',
  },
  {
    id: 'mirror-l5-schedule',
    level: 5,
    title: 'Schedule change notice',
    ideaMap: [
      { id: 'm5s-1', concepts: { en: 'Say that the meeting date has been changed.', ru: 'Скажите, что дата встречи была изменена.', zh: '说会议日期已经变更。' } },
      { id: 'm5s-2', concepts: { en: 'Ask to be contacted if it changes again.', ru: 'Попросите связаться с вами, если она изменится снова.', zh: '请对方如果再变更就联系你。' } },
      { id: 'm5s-3', concepts: { en: 'Say the materials will be sent by Friday.', ru: 'Скажите, что материалы будут отправлены до пятницы.', zh: '说资料会在周五前发送。' } },
    ],
    reference: '会議の日程が変更になりました。もう一度変更になった場合は、ご連絡ください。資料は金曜日までにお送りします。',
  },
  {
    id: 'mirror-l5-feedback',
    level: 5,
    title: 'Product feedback',
    ideaMap: [
      { id: 'm5f-1', concepts: { en: 'Say that even after reading the manual you did not understand the usage.', ru: 'Скажите, что даже прочитав инструкцию, не поняли, как пользоваться.', zh: '说即使读了说明书也不明白用法。' } },
      { id: 'm5f-2', concepts: { en: 'Say the explanation would be better with photographs.', ru: 'Скажите, что объяснение было бы лучше с фотографиями.', zh: '说明中最好加上照片。' } },
      { id: 'm5f-3', concepts: { en: 'Say that you decided to contact support.', ru: 'Скажите, что решили обратиться в поддержку.', zh: '说你决定联系客服。' } },
    ],
    reference: '説明書を読んでも、使い方が分かりませんでした。説明には写真を入れたほうがいいと思います。サポートに問い合わせることにしました。',
  },
  {
    id: 'mirror-l6-policy',
    level: 6,
    title: 'Policy change',
    ideaMap: [
      { id: 'm6-1', concepts: { en: 'State that a new system simplified applications.', ru: 'Скажите, что новая система упростила подачу заявлений.', zh: '说明新制度简化了申请。' } },
      { id: 'm6-2', concepts: { en: 'Mention that some users still need guidance.', ru: 'Отметьте, что некоторым пользователям всё ещё нужна помощь.', zh: '提到一些用户仍需要指导。' } },
      { id: 'm6-3', concepts: { en: 'Suggest publishing clear examples.', ru: 'Предложите опубликовать понятные примеры.', zh: '建议发布清晰的示例。' } },
    ],
    reference: '新しい制度によって、申請手続きは簡略化されました。ただし、利用者の中にはまだ説明を必要としている人もいます。分かりやすい記入例を公開すべきです。',
  },
  {
    id: 'mirror-l6-reading-survey',
    level: 6,
    title: 'Reading survey',
    ideaMap: [
      { id: 'm6r-1', concepts: { en: "State that according to a survey, young people's reading time is on a downward trend.", ru: 'Скажите, что, согласно опросу, время чтения у молодёжи снижается.', zh: '说明根据调查，年轻人的阅读时间呈下降趋势。' } },
      { id: 'm6r-2', concepts: { en: 'Say that in addition to smartphones, long working hours are a cause.', ru: 'Скажите, что помимо смартфонов, причиной являются долгие рабочие часы.', zh: '说除了智能手机之外，长时间工作也是原因之一。' } },
      { id: 'm6r-3', concepts: { en: 'Propose extending library opening hours.', ru: 'Предложите продлить часы работы библиотек.', zh: '建议延长图书馆的开放时间。' } },
    ],
    reference: '調査によると、若者の読書時間は減少傾向にあります。スマートフォンに加えて、長時間労働も原因の一つだと考えられます。図書館の開館時間を延ばすことを提案します。',
  },
  {
    id: 'mirror-l6-event',
    level: 6,
    title: 'Event notice',
    ideaMap: [
      { id: 'm6e-1', concepts: { en: 'State that the event will be held as scheduled regardless of the weather.', ru: 'Скажите, что мероприятие состоится по расписанию независимо от погоды.', zh: '说明无论天气如何，活动都将按计划举行。' } },
      { id: 'm6e-2', concepts: { en: 'Ask those wishing to take part to apply by the twentieth.', ru: 'Попросите желающих участвовать подать заявку до двадцатого числа.', zh: '请希望参加的人在二十日前报名。' } },
      { id: 'm6e-3', concepts: { en: 'Express gratitude for their cooperation.', ru: 'Выразите благодарность за сотрудничество.', zh: '对大家的配合表示感谢。' } },
    ],
    reference: '大会は天候にかかわらず、予定通り開催されます。参加を希望する方は、二十日までにお申し込みください。ご協力に感謝いたします。',
  },
  {
    id: 'mirror-l7-convenience',
    level: 7,
    title: 'Convenience and learning',
    ideaMap: [
      { id: 'm7-1', concepts: { en: 'Argue that convenience is not always progress.', ru: 'Утвердите, что удобство не всегда означает прогресс.', zh: '论述便利并不总是进步。' } },
      { id: 'm7-2', concepts: { en: 'Explain that difficulty can teach patience.', ru: 'Объясните, что трудности могут учить терпению.', zh: '说明困难能教会人耐心。' } },
      { id: 'm7-3', concepts: { en: 'Conclude that tools should support effort, not erase it.', ru: 'Сделайте вывод, что инструменты должны поддерживать усилие, а не уничтожать его.', zh: '总结工具应支持努力，而不是抹消努力。' } },
    ],
    reference: '便利さは必ずしも進歩を意味するわけではありません。不便さや難しさの中でこそ、私たちは忍耐や工夫を学びます。道具は努力を消すためではなく、努力を支えるために使われるべきです。',
  },
  {
    id: 'mirror-l7-technology',
    level: 7,
    title: 'Technology and judgment',
    ideaMap: [
      { id: 'm7t-1', concepts: { en: 'Argue that although technology has advanced, human judgment remains indispensable.', ru: 'Утвердите, что, хотя технологии продвинулись, человеческое суждение остаётся незаменимым.', zh: '论述虽然技术进步了，但人的判断依然不可或缺。' } },
      { id: 'm7t-2', concepts: { en: 'Point out that a machine cannot bear responsibility for a decision.', ru: 'Отметьте, что машина не может нести ответственность за решение.', zh: '指出机器无法为决定承担责任。' } },
      { id: 'm7t-3', concepts: { en: 'Conclude that tools should therefore be designed to assist judgment.', ru: 'Сделайте вывод, что инструменты должны создаваться, чтобы помогать суждению.', zh: '总结工具因此应被设计成辅助判断。' } },
    ],
    reference: '技術が進歩したとはいえ、人間の判断は依然として不可欠である。機械は決定の責任を負うことができない。だからこそ、道具は判断を助けるものとして設計されるべきである。',
  },
  {
    id: 'mirror-l7-city',
    level: 7,
    title: 'Urban life',
    ideaMap: [
      { id: 'm7c-1', concepts: { en: 'Say that the convenience of cities has drawn many people to them.', ru: 'Скажите, что удобство городов привлекло к ним много людей.', zh: '说城市的便利吸引了许多人。' } },
      { id: 'm7c-2', concepts: { en: 'Point out that meanwhile ties with neighbours have gradually thinned.', ru: 'Отметьте, что при этом связи с соседями постепенно ослабли.', zh: '指出与此同时，与邻居的关系逐渐淡薄。' } },
      { id: 'm7c-3', concepts: { en: 'Suggest that community is sustained only through some inconvenience and effort.', ru: 'Предположите, что сообщество держится лишь благодаря некоторому неудобству и усилиям.', zh: '提出共同体只有通过一些不便和努力才能维持。' } },
    ],
    reference: '都市の利便性は、これまで多くの人々を引きつけてきた。しかしその一方で、近所の人々との関係は次第に希薄になっている。共同体というものは、多少の不便や手間をもって初めて維持されるのではないだろうか。',
  },

  // ---------------------------------------------------------------------
  // Second authoring batch. Grouped by level like the block above; the
  // picker ignores array order, so these are appended rather than
  // interleaved to keep the diff reviewable.
  // ---------------------------------------------------------------------

  {
    id: 'mirror-l1-room',
    level: 1,
    title: 'My room',
    ideaMap: [
      { id: 'm1r-1', concepts: { en: 'Say that your room is small.', ru: 'Скажите, что ваша комната маленькая.', zh: '说你的房间很小。' } },
      { id: 'm1r-2', concepts: { en: 'Say that there is a big window.', ru: 'Скажите, что там есть большое окно.', zh: '说房间里有一扇大窗户。' } },
      { id: 'm1r-3', concepts: { en: 'Say that you read books there.', ru: 'Скажите, что читаете там книги.', zh: '说你在那里看书。' } },
    ],
    reference: '私の部屋は小さいです。大きい窓があります。そこで本を読みます。',
  },
  {
    id: 'mirror-l1-food',
    level: 1,
    title: 'Food I like',
    ideaMap: [
      { id: 'm1o-1', concepts: { en: 'Say that you like Japanese food.', ru: 'Скажите, что любите японскую еду.', zh: '说你喜欢日本菜。' } },
      { id: 'm1o-2', concepts: { en: 'Say that sushi is especially delicious.', ru: 'Скажите, что суши особенно вкусные.', zh: '说寿司特别好吃。' } },
      { id: 'm1o-3', concepts: { en: 'Say that you do not eat meat.', ru: 'Скажите, что не едите мясо.', zh: '说你不吃肉。' } },
    ],
    reference: '私は日本の料理が好きです。特にお寿司はおいしいです。肉は食べません。',
  },
  {
    id: 'mirror-l1-pet',
    level: 1,
    title: 'My pet',
    ideaMap: [
      { id: 'm1p-1', concepts: { en: 'Say that you have a dog.', ru: 'Скажите, что у вас есть собака.', zh: '说你养了一只狗。' } },
      { id: 'm1p-2', concepts: { en: 'Say that the dog is white and small.', ru: 'Скажите, что собака белая и маленькая.', zh: '说狗是白色的、很小。' } },
      { id: 'm1p-3', concepts: { en: 'Say that you walk together every morning.', ru: 'Скажите, что каждое утро гуляете вместе.', zh: '说你们每天早上一起散步。' } },
    ],
    reference: '私は犬がいます。白くて小さい犬です。毎朝一緒に散歩します。',
  },
  {
    id: 'mirror-l1-friend',
    level: 1,
    title: 'My friend',
    ideaMap: [
      { id: 'm1d-1', concepts: { en: "Say that your friend's name is Yamada.", ru: 'Скажите, что вашего друга зовут Ямада.', zh: '说你朋友叫山田。' } },
      { id: 'm1d-2', concepts: { en: 'Say that he is a kind person.', ru: 'Скажите, что он добрый человек.', zh: '说他是个善良的人。' } },
      { id: 'm1d-3', concepts: { en: 'Say that you meet every Sunday.', ru: 'Скажите, что вы встречаетесь каждое воскресенье.', zh: '说你们每个星期天见面。' } },
    ],
    reference: '友達の名前は山田さんです。親切な人です。毎週日曜日に会います。',
  },
  {
    id: 'mirror-l1-town',
    level: 1,
    title: 'My town',
    ideaMap: [
      { id: 'm1t-1', concepts: { en: 'Say that your town is quiet.', ru: 'Скажите, что ваш город тихий.', zh: '说你住的城市很安静。' } },
      { id: 'm1t-2', concepts: { en: 'Say that there is a park near the station.', ru: 'Скажите, что рядом со станцией есть парк.', zh: '说车站附近有公园。' } },
      { id: 'm1t-3', concepts: { en: 'Say that you often go there.', ru: 'Скажите, что часто туда ходите.', zh: '说你常去那里。' } },
    ],
    reference: '私の町は静かです。駅の近くに公園があります。よくそこへ行きます。',
  },
  {
    id: 'mirror-l1-study',
    level: 1,
    title: 'Studying Japanese',
    ideaMap: [
      { id: 'm1s-1', concepts: { en: 'Say that Japanese is difficult but fun.', ru: 'Скажите, что японский трудный, но интересный.', zh: '说日语很难但很有趣。' } },
      { id: 'm1s-2', concepts: { en: 'Say that kanji are especially hard.', ru: 'Скажите, что иероглифы особенно трудные.', zh: '说汉字特别难。' } },
      { id: 'm1s-3', concepts: { en: 'Say that you study a little every day.', ru: 'Скажите, что занимаетесь понемногу каждый день.', zh: '说你每天学一点。' } },
    ],
    reference: '日本語は難しいですが、楽しいです。特に漢字は難しいです。毎日少し勉強します。',
  },
  {
    id: 'mirror-l1-weekend-l1',
    level: 1,
    title: 'Sunday',
    ideaMap: [
      { id: 'm1k-1', concepts: { en: 'Say that you do not work on Sunday.', ru: 'Скажите, что в воскресенье вы не работаете.', zh: '说你星期天不工作。' } },
      { id: 'm1k-2', concepts: { en: 'Say that you watch movies at home.', ru: 'Скажите, что смотрите фильмы дома.', zh: '说你在家看电影。' } },
      { id: 'm1k-3', concepts: { en: 'Say that it is a happy day.', ru: 'Скажите, что это счастливый день.', zh: '说那是快乐的一天。' } },
    ],
    reference: '日曜日は働きません。家で映画を見ます。楽しい日です。',
  },
  {
    id: 'mirror-l1-drink',
    level: 1,
    title: 'Tea or coffee',
    ideaMap: [
      { id: 'm1c-1', concepts: { en: 'Say that you drink tea in the morning.', ru: 'Скажите, что утром пьёте чай.', zh: '说你早上喝茶。' } },
      { id: 'm1c-2', concepts: { en: 'Say that your friend drinks coffee.', ru: 'Скажите, что ваш друг пьёт кофе.', zh: '说你朋友喝咖啡。' } },
      { id: 'm1c-3', concepts: { en: 'Say that you do not like coffee.', ru: 'Скажите, что не любите кофе.', zh: '说你不喜欢咖啡。' } },
    ],
    reference: '私は朝お茶を飲みます。友達はコーヒーを飲みます。私はコーヒーが好きではありません。',
  },
  {
    id: 'mirror-l1-weather-l1',
    level: 1,
    title: 'Rainy day',
    ideaMap: [
      { id: 'm1w-1', concepts: { en: 'Say that it is raining today.', ru: 'Скажите, что сегодня идёт дождь.', zh: '说今天在下雨。' } },
      { id: 'm1w-2', concepts: { en: 'Say that you do not have an umbrella.', ru: 'Скажите, что у вас нет зонта.', zh: '说你没有伞。' } },
      { id: 'm1w-3', concepts: { en: 'Say that you will stay at home.', ru: 'Скажите, что останетесь дома.', zh: '说你会待在家里。' } },
    ],
    reference: '今日は雨が降っています。傘がありません。家にいます。',
  },
  {
    id: 'mirror-l1-work',
    level: 1,
    title: 'What I do',
    ideaMap: [
      { id: 'm1j-1', concepts: { en: 'Say that you work at a company.', ru: 'Скажите, что работаете в компании.', zh: '说你在公司工作。' } },
      { id: 'm1j-2', concepts: { en: 'Say that the company is in Tokyo.', ru: 'Скажите, что компания находится в Токио.', zh: '说公司在东京。' } },
      { id: 'm1j-3', concepts: { en: 'Say that the work is busy but interesting.', ru: 'Скажите, что работа напряжённая, но интересная.', zh: '说工作很忙但很有意思。' } },
    ],
    reference: '私は会社で働いています。会社は東京にあります。仕事は忙しいですが、面白いです。',
  },
  {
    id: 'mirror-l1-shop',
    level: 1,
    title: 'At the shop',
    ideaMap: [
      { id: 'm1h-1', concepts: { en: 'Say that you go to the supermarket on Saturday.', ru: 'Скажите, что в субботу ходите в супермаркет.', zh: '说你星期六去超市。' } },
      { id: 'm1h-2', concepts: { en: 'Say that you buy vegetables and fish.', ru: 'Скажите, что покупаете овощи и рыбу.', zh: '说你买蔬菜和鱼。' } },
      { id: 'm1h-3', concepts: { en: 'Say that it is not expensive.', ru: 'Скажите, что это недорого.', zh: '说不贵。' } },
    ],
    reference: '土曜日にスーパーへ行きます。野菜と魚を買います。高くないです。',
  },

  {
    id: 'mirror-l2-trip',
    level: 2,
    title: 'A short trip',
    ideaMap: [
      { id: 'm2t-1', concepts: { en: 'Say that you went to Kyoto last month.', ru: 'Скажите, что в прошлом месяце ездили в Киото.', zh: '说你上个月去了京都。' } },
      { id: 'm2t-2', concepts: { en: 'Say that you saw many old temples.', ru: 'Скажите, что видели много старых храмов.', zh: '说你看了很多古老的寺庙。' } },
      { id: 'm2t-3', concepts: { en: 'Say that you want to go again.', ru: 'Скажите, что хотите поехать снова.', zh: '说你还想再去。' } },
    ],
    reference: '先月、京都へ行きました。古いお寺をたくさん見ました。また行きたいです。',
  },
  {
    id: 'mirror-l2-cooking',
    level: 2,
    title: 'Cooking at home',
    ideaMap: [
      { id: 'm2c-1', concepts: { en: 'Say that you cook dinner yourself every evening.', ru: 'Скажите, что каждый вечер сами готовите ужин.', zh: '说你每天晚上自己做晚饭。' } },
      { id: 'm2c-2', concepts: { en: 'Say that yesterday you made curry.', ru: 'Скажите, что вчера приготовили карри.', zh: '说你昨天做了咖喱。' } },
      { id: 'm2c-3', concepts: { en: 'Say that it was a little spicy.', ru: 'Скажите, что оно было немного острым.', zh: '说有点辣。' } },
    ],
    reference: '毎晩、自分で晩ご飯を作ります。昨日はカレーを作りました。少し辛かったです。',
  },
  {
    id: 'mirror-l2-sick',
    level: 2,
    title: 'Feeling unwell',
    ideaMap: [
      { id: 'm2i-1', concepts: { en: 'Say that you had a headache yesterday.', ru: 'Скажите, что вчера у вас болела голова.', zh: '说你昨天头疼。' } },
      { id: 'm2i-2', concepts: { en: 'Say that you did not go to work.', ru: 'Скажите, что не пошли на работу.', zh: '说你没去上班。' } },
      { id: 'm2i-3', concepts: { en: 'Say that today you are fine.', ru: 'Скажите, что сегодня вы в порядке.', zh: '说今天你没事了。' } },
    ],
    reference: '昨日は頭が痛かったです。会社へ行きませんでした。今日は元気です。',
  },
  {
    id: 'mirror-l2-music',
    level: 2,
    title: 'Music I listen to',
    ideaMap: [
      { id: 'm2m-1', concepts: { en: 'Say that you listen to music every day.', ru: 'Скажите, что слушаете музыку каждый день.', zh: '说你每天听音乐。' } },
      { id: 'm2m-2', concepts: { en: 'Say that you like Japanese songs.', ru: 'Скажите, что любите японские песни.', zh: '说你喜欢日本歌曲。' } },
      { id: 'm2m-3', concepts: { en: 'Say that you sometimes sing at karaoke.', ru: 'Скажите, что иногда поёте в караоке.', zh: '说你有时去卡拉OK唱歌。' } },
    ],
    reference: '毎日音楽を聞きます。日本の歌が好きです。ときどきカラオケで歌います。',
  },
  {
    id: 'mirror-l2-phone',
    level: 2,
    title: 'A new phone',
    ideaMap: [
      { id: 'm2p-1', concepts: { en: 'Say that you bought a new phone last week.', ru: 'Скажите, что на прошлой неделе купили новый телефон.', zh: '说你上周买了新手机。' } },
      { id: 'm2p-2', concepts: { en: 'Say that the old one broke.', ru: 'Скажите, что старый сломался.', zh: '说旧的坏了。' } },
      { id: 'm2p-3', concepts: { en: 'Say that the new one is very light.', ru: 'Скажите, что новый очень лёгкий.', zh: '说新的很轻。' } },
    ],
    reference: '先週、新しい電話を買いました。古い電話は壊れました。新しい電話はとても軽いです。',
  },
  {
    id: 'mirror-l2-morning-late',
    level: 2,
    title: 'A late morning',
    ideaMap: [
      { id: 'm2l-1', concepts: { en: 'Say that you woke up late this morning.', ru: 'Скажите, что сегодня утром проснулись поздно.', zh: '说你今天早上起晚了。' } },
      { id: 'm2l-2', concepts: { en: 'Say that you did not eat breakfast.', ru: 'Скажите, что не позавтракали.', zh: '说你没吃早饭。' } },
      { id: 'm2l-3', concepts: { en: 'Say that you ran to the station.', ru: 'Скажите, что бежали до станции.', zh: '说你跑去了车站。' } },
    ],
    reference: '今朝は遅く起きました。朝ご飯を食べませんでした。駅まで走りました。',
  },
  {
    id: 'mirror-l2-letter',
    level: 2,
    title: 'A letter home',
    ideaMap: [
      { id: 'm2e-1', concepts: { en: 'Say that you are well.', ru: 'Скажите, что у вас всё хорошо.', zh: '说你很好。' } },
      { id: 'm2e-2', concepts: { en: 'Say that Tokyo is a big and interesting city.', ru: 'Скажите, что Токио — большой и интересный город.', zh: '说东京是个又大又有趣的城市。' } },
      { id: 'm2e-3', concepts: { en: 'Say that you will return home in April.', ru: 'Скажите, что вернётесь домой в апреле.', zh: '说你四月回家。' } },
    ],
    reference: '私は元気です。東京は大きくて面白い町です。四月に帰ります。',
  },
  {
    id: 'mirror-l2-class',
    level: 2,
    title: 'Japanese class',
    ideaMap: [
      { id: 'm2a-1', concepts: { en: 'Say that class starts at nine.', ru: 'Скажите, что занятие начинается в девять.', zh: '说课九点开始。' } },
      { id: 'm2a-2', concepts: { en: 'Say that there are ten students.', ru: 'Скажите, что там десять студентов.', zh: '说有十个学生。' } },
      { id: 'm2a-3', concepts: { en: 'Say that the teacher is very kind.', ru: 'Скажите, что преподаватель очень добрый.', zh: '说老师很亲切。' } },
    ],
    reference: '授業は九時から始まります。学生が十人います。先生はとても親切です。',
  },
  {
    id: 'mirror-l2-hot-day',
    level: 2,
    title: 'Summer',
    ideaMap: [
      { id: 'm2h-1', concepts: { en: 'Say that summer in Japan is very hot.', ru: 'Скажите, что лето в Японии очень жаркое.', zh: '说日本的夏天很热。' } },
      { id: 'm2h-2', concepts: { en: 'Say that you swim in the sea every year.', ru: 'Скажите, что каждый год плаваете в море.', zh: '说你每年都去海里游泳。' } },
      { id: 'm2h-3', concepts: { en: 'Say that autumn is your favourite season.', ru: 'Скажите, что осень — ваше любимое время года.', zh: '说秋天是你最喜欢的季节。' } },
    ],
    reference: '日本の夏はとても暑いです。毎年、海で泳ぎます。秋が一番好きです。',
  },
  {
    id: 'mirror-l2-borrow',
    level: 2,
    title: 'Borrowing a book',
    ideaMap: [
      { id: 'm2b-1', concepts: { en: 'Say that you borrowed a book from the library.', ru: 'Скажите, что взяли книгу в библиотеке.', zh: '说你从图书馆借了一本书。' } },
      { id: 'm2b-2', concepts: { en: 'Say that it is a Japanese novel.', ru: 'Скажите, что это японский роман.', zh: '说那是一本日本小说。' } },
      { id: 'm2b-3', concepts: { en: 'Say that you must return it next week.', ru: 'Скажите, что должны вернуть её на следующей неделе.', zh: '说你下周必须还。' } },
    ],
    reference: '図書館で本を借りました。日本の小説です。来週返さなければなりません。',
  },
  {
    id: 'mirror-l2-photo',
    level: 2,
    title: 'A photograph',
    ideaMap: [
      { id: 'm2f-1', concepts: { en: 'Say that this is a photo of your family.', ru: 'Скажите, что это фотография вашей семьи.', zh: '说这是你家人的照片。' } },
      { id: 'm2f-2', concepts: { en: 'Say that it was taken last summer.', ru: 'Скажите, что она сделана прошлым летом.', zh: '说这是去年夏天拍的。' } },
      { id: 'm2f-3', concepts: { en: 'Say that everyone is smiling.', ru: 'Скажите, что все улыбаются.', zh: '说大家都在笑。' } },
    ],
    reference: 'これは家族の写真です。去年の夏に撮りました。みんな笑っています。',
  },

  {
    id: 'mirror-l3-directions',
    level: 3,
    title: 'Giving directions',
    ideaMap: [
      { id: 'm3d-1', concepts: { en: 'Say to go straight along this road.', ru: 'Скажите идти прямо по этой дороге.', zh: '说沿着这条路直走。' } },
      { id: 'm3d-2', concepts: { en: 'Say to turn right at the second traffic light.', ru: 'Скажите повернуть направо на втором светофоре.', zh: '说在第二个红绿灯右转。' } },
      { id: 'm3d-3', concepts: { en: 'Say the bank is on the left.', ru: 'Скажите, что банк слева.', zh: '说银行在左边。' } },
    ],
    reference: 'この道をまっすぐ行ってください。二つ目の信号を右に曲がります。銀行は左側にあります。',
  },
  {
    id: 'mirror-l3-part-time',
    level: 3,
    title: 'A part-time job',
    ideaMap: [
      { id: 'm3p-1', concepts: { en: 'Say that you work part-time at a cafe.', ru: 'Скажите, что подрабатываете в кафе.', zh: '说你在咖啡店打工。' } },
      { id: 'm3p-2', concepts: { en: 'Say that you work three days a week.', ru: 'Скажите, что работаете три дня в неделю.', zh: '说你一周工作三天。' } },
      { id: 'm3p-3', concepts: { en: 'Say that remembering the menu was hard at first.', ru: 'Скажите, что сначала было трудно запомнить меню.', zh: '说一开始记菜单很难。' } },
    ],
    reference: 'カフェでアルバイトをしています。週に三日働きます。最初はメニューを覚えるのが大変でした。',
  },
  {
    id: 'mirror-l3-moving',
    level: 3,
    title: 'Moving house',
    ideaMap: [
      { id: 'm3m-1', concepts: { en: 'Say that you moved to a new apartment last month.', ru: 'Скажите, что в прошлом месяце переехали в новую квартиру.', zh: '说你上个月搬到了新公寓。' } },
      { id: 'm3m-2', concepts: { en: 'Say that it is closer to the station than before.', ru: 'Скажите, что это ближе к станции, чем раньше.', zh: '说比以前离车站更近。' } },
      { id: 'm3m-3', concepts: { en: 'Say that the rent is a little high.', ru: 'Скажите, что аренда немного высокая.', zh: '说房租有点高。' } },
    ],
    reference: '先月、新しいアパートに引っ越しました。前より駅に近いです。家賃は少し高いです。',
  },
  {
    id: 'mirror-l3-exercise',
    level: 3,
    title: 'Exercise',
    ideaMap: [
      { id: 'm3e-1', concepts: { en: 'Say that you started running in the morning.', ru: 'Скажите, что начали бегать по утрам.', zh: '说你开始早上跑步了。' } },
      { id: 'm3e-2', concepts: { en: 'Say that at first you could only run ten minutes.', ru: 'Скажите, что сначала могли бежать только десять минут.', zh: '说一开始你只能跑十分钟。' } },
      { id: 'm3e-3', concepts: { en: 'Say that now you can run for an hour.', ru: 'Скажите, что теперь можете бегать час.', zh: '说现在你能跑一个小时。' } },
    ],
    reference: '朝、走ることを始めました。最初は十分しか走ることができませんでした。今は一時間走ることができます。',
  },
  {
    id: 'mirror-l3-invitation',
    level: 3,
    title: 'Declining an invitation',
    ideaMap: [
      { id: 'm3i-1', concepts: { en: 'Thank them for the invitation.', ru: 'Поблагодарите за приглашение.', zh: '感谢对方的邀请。' } },
      { id: 'm3i-2', concepts: { en: 'Say that you cannot go because you have work that day.', ru: 'Скажите, что не можете прийти, так как в тот день работаете.', zh: '说因为那天有工作，你不能去。' } },
      { id: 'm3i-3', concepts: { en: 'Ask them to invite you next time.', ru: 'Попросите пригласить вас в следующий раз.', zh: '请对方下次再约你。' } },
    ],
    reference: '誘ってくれてありがとうございます。その日は仕事があるので、行くことができません。今度また誘ってください。',
  },
  {
    id: 'mirror-l3-childhood',
    level: 3,
    title: 'When I was a child',
    ideaMap: [
      { id: 'm3c-1', concepts: { en: 'Say that you lived in the countryside as a child.', ru: 'Скажите, что в детстве жили в деревне.', zh: '说你小时候住在乡下。' } },
      { id: 'm3c-2', concepts: { en: 'Say that you played in the mountains with friends every day.', ru: 'Скажите, что каждый день играли в горах с друзьями.', zh: '说你每天和朋友在山里玩。' } },
      { id: 'm3c-3', concepts: { en: 'Say that you sometimes want to go back.', ru: 'Скажите, что иногда хотите туда вернуться.', zh: '说你有时想回去。' } },
    ],
    reference: '子供の時、田舎に住んでいました。毎日友達と山で遊びました。ときどき帰りたくなります。',
  },
  {
    id: 'mirror-l3-mistake',
    level: 3,
    title: 'A small mistake',
    ideaMap: [
      { id: 'm3k-1', concepts: { en: 'Say that you got on the wrong train yesterday.', ru: 'Скажите, что вчера сели не на тот поезд.', zh: '说你昨天坐错了电车。' } },
      { id: 'm3k-2', concepts: { en: 'Say that you noticed after thirty minutes.', ru: 'Скажите, что заметили через тридцать минут.', zh: '说你三十分钟后才发现。' } },
      { id: 'm3k-3', concepts: { en: 'Say that you were late for the meeting.', ru: 'Скажите, что опоздали на встречу.', zh: '说你开会迟到了。' } },
    ],
    reference: '昨日、違う電車に乗ってしまいました。三十分後に気がつきました。会議に遅刻しました。',
  },
  {
    id: 'mirror-l3-weather-plan',
    level: 3,
    title: 'Changing plans',
    ideaMap: [
      { id: 'm3w-1', concepts: { en: 'Say that you planned to go to the sea on Sunday.', ru: 'Скажите, что планировали поехать на море в воскресенье.', zh: '说你本来打算星期天去海边。' } },
      { id: 'm3w-2', concepts: { en: 'Say that the weather was bad, so you did not go.', ru: 'Скажите, что погода была плохая, поэтому вы не поехали.', zh: '说因为天气不好，你没去。' } },
      { id: 'm3w-3', concepts: { en: 'Say that you watched a movie at home instead.', ru: 'Скажите, что вместо этого смотрели фильм дома.', zh: '说你改在家看了电影。' } },
    ],
    reference: '日曜日に海へ行くつもりでした。天気が悪かったので、行きませんでした。代わりに家で映画を見ました。',
  },
  {
    id: 'mirror-l3-neighbour',
    level: 3,
    title: 'A helpful neighbour',
    ideaMap: [
      { id: 'm3n-1', concepts: { en: 'Say that your neighbour is an old woman.', ru: 'Скажите, что ваша соседка — пожилая женщина.', zh: '说你的邻居是位老太太。' } },
      { id: 'm3n-2', concepts: { en: 'Say that she gave you vegetables from her garden.', ru: 'Скажите, что она дала вам овощи из своего сада.', zh: '说她给了你她院子里的蔬菜。' } },
      { id: 'm3n-3', concepts: { en: 'Say that you were very glad.', ru: 'Скажите, что вы были очень рады.', zh: '说你非常高兴。' } },
    ],
    reference: '隣の人はおばあさんです。庭の野菜をくれました。とてもうれしかったです。',
  },
  {
    id: 'mirror-l3-language-exchange',
    level: 3,
    title: 'Language exchange',
    ideaMap: [
      { id: 'm3l-1', concepts: { en: 'Say that you meet a Japanese friend every week.', ru: 'Скажите, что каждую неделю встречаетесь с японским другом.', zh: '说你每周和一位日本朋友见面。' } },
      { id: 'm3l-2', concepts: { en: 'Say that you speak Japanese for one hour and English for one hour.', ru: 'Скажите, что час говорите по-японски и час по-английски.', zh: '说你们说一小时日语、一小时英语。' } },
      { id: 'm3l-3', concepts: { en: 'Say that your listening has improved.', ru: 'Скажите, что ваше восприятие на слух улучшилось.', zh: '说你的听力提高了。' } },
    ],
    reference: '毎週、日本人の友達に会います。一時間日本語で、一時間英語で話します。聞くことが上手になりました。',
  },
  {
    id: 'mirror-l3-tired',
    level: 3,
    title: 'A long week',
    ideaMap: [
      { id: 'm3t-1', concepts: { en: 'Say that work was busy this week.', ru: 'Скажите, что на этой неделе работа была напряжённой.', zh: '说这周工作很忙。' } },
      { id: 'm3t-2', concepts: { en: 'Say that you went home late every day.', ru: 'Скажите, что каждый день возвращались домой поздно.', zh: '说你每天很晚才回家。' } },
      { id: 'm3t-3', concepts: { en: 'Say that you want to rest slowly this weekend.', ru: 'Скажите, что хотите спокойно отдохнуть в эти выходные.', zh: '说这个周末你想好好休息。' } },
    ],
    reference: '今週は仕事が忙しかったです。毎日遅く家に帰りました。今週末はゆっくり休みたいです。',
  },

  {
    id: 'mirror-l4-complaint',
    level: 4,
    title: 'A polite complaint',
    ideaMap: [
      { id: 'm4c-1', concepts: { en: 'Say that the item you ordered arrived yesterday.', ru: 'Скажите, что заказанный товар пришёл вчера.', zh: '说你订的商品昨天到了。' } },
      { id: 'm4c-2', concepts: { en: 'Say that unfortunately a different colour was sent.', ru: 'Скажите, что, к сожалению, прислали другой цвет.', zh: '说很遗憾，发来的是别的颜色。' } },
      { id: 'm4c-3', concepts: { en: 'Ask whether it is possible to exchange it.', ru: 'Спросите, возможно ли обменять его.', zh: '询问是否可以更换。' } },
    ],
    reference: '注文した商品が昨日届きました。残念ながら、違う色が送られてきました。交換していただくことはできるでしょうか。',
  },
  {
    id: 'mirror-l4-interview',
    level: 4,
    title: 'Before an interview',
    ideaMap: [
      { id: 'm4i-1', concepts: { en: 'Say that you have an interview next week.', ru: 'Скажите, что на следующей неделе у вас собеседование.', zh: '说你下周有面试。' } },
      { id: 'm4i-2', concepts: { en: 'Say that you are nervous because it is your first time.', ru: 'Скажите, что нервничаете, потому что это впервые.', zh: '说因为是第一次，你很紧张。' } },
      { id: 'm4i-3', concepts: { en: 'Say that you are practising answers every night.', ru: 'Скажите, что каждый вечер репетируете ответы.', zh: '说你每天晚上都在练习回答。' } },
    ],
    reference: '来週、面接があります。初めてなので、緊張しています。毎晩、答える練習をしています。',
  },
  {
    id: 'mirror-l4-recommend',
    level: 4,
    title: 'Recommending a book',
    ideaMap: [
      { id: 'm4r-1', concepts: { en: 'Say that you read a very interesting book recently.', ru: 'Скажите, что недавно прочитали очень интересную книгу.', zh: '说你最近读了一本很有意思的书。' } },
      { id: 'm4r-2', concepts: { en: 'Say that it is written in simple Japanese, so it is easy to read.', ru: 'Скажите, что она написана простым японским, поэтому легко читается.', zh: '说它是用简单的日语写的，所以很好读。' } },
      { id: 'm4r-3', concepts: { en: 'Say that you would like to lend it to them.', ru: 'Скажите, что хотели бы одолжить её собеседнику.', zh: '说你想借给对方。' } },
    ],
    reference: '最近、とても面白い本を読みました。簡単な日本語で書かれているので、読みやすいです。よかったら、貸してあげたいと思います。',
  },
  {
    id: 'mirror-l4-habit',
    level: 4,
    title: 'Breaking a habit',
    ideaMap: [
      { id: 'm4h-1', concepts: { en: 'Say that you used to look at your phone before sleeping.', ru: 'Скажите, что раньше смотрели в телефон перед сном.', zh: '说你以前睡前会看手机。' } },
      { id: 'm4h-2', concepts: { en: 'Say that because of it you could not sleep well.', ru: 'Скажите, что из-за этого не могли хорошо спать.', zh: '说因此你睡不好。' } },
      { id: 'm4h-3', concepts: { en: 'Say that you decided to read a book instead.', ru: 'Скажите, что решили вместо этого читать книгу.', zh: '说你决定改成看书。' } },
    ],
    reference: '前は寝る前に電話を見ていました。そのせいで、よく眠ることができませんでした。代わりに本を読むことにしました。',
  },
  {
    id: 'mirror-l4-volunteer',
    level: 4,
    title: 'Volunteering',
    ideaMap: [
      { id: 'm4v-1', concepts: { en: 'Say that you clean the park with neighbours once a month.', ru: 'Скажите, что раз в месяц убираете парк с соседями.', zh: '说你每月和邻居一起打扫公园一次。' } },
      { id: 'm4v-2', concepts: { en: 'Say that at first only a few people came.', ru: 'Скажите, что сначала приходило лишь несколько человек.', zh: '说一开始只有几个人来。' } },
      { id: 'm4v-3', concepts: { en: 'Say that now more than twenty people take part.', ru: 'Скажите, что теперь участвуют более двадцати человек.', zh: '说现在有二十多人参加。' } },
    ],
    reference: '月に一度、近所の人たちと公園を掃除しています。最初は少しの人しか来ませんでした。今は二十人以上が参加しています。',
  },
  {
    id: 'mirror-l4-lost-wallet',
    level: 4,
    title: 'A lost wallet',
    ideaMap: [
      { id: 'm4w-1', concepts: { en: 'Say that you dropped your wallet on the train.', ru: 'Скажите, что уронили кошелёк в поезде.', zh: '说你把钱包掉在电车上了。' } },
      { id: 'm4w-2', concepts: { en: 'Say that someone took it to the station office.', ru: 'Скажите, что кто-то отнёс его в бюро находок на станции.', zh: '说有人把它送到了车站办公室。' } },
      { id: 'm4w-3', concepts: { en: 'Say that you were relieved that nothing was missing.', ru: 'Скажите, что вздохнули с облегчением, так как ничего не пропало.', zh: '说你松了一口气，因为什么都没少。' } },
    ],
    reference: '電車で財布を落としてしまいました。誰かが駅の事務所に届けてくれました。何もなくなっていなかったので、安心しました。',
  },
  {
    id: 'mirror-l4-online',
    level: 4,
    title: 'Studying online',
    ideaMap: [
      { id: 'm4o-1', concepts: { en: 'Say that you began studying with an online teacher.', ru: 'Скажите, что начали заниматься с преподавателем онлайн.', zh: '说你开始跟线上老师学习。' } },
      { id: 'm4o-2', concepts: { en: 'Say that you can study at home, so it is convenient.', ru: 'Скажите, что можно заниматься дома, поэтому это удобно.', zh: '说可以在家学习，所以很方便。' } },
      { id: 'm4o-3', concepts: { en: 'Say that speaking with a real person is still nervous-making.', ru: 'Скажите, что говорить с живым человеком всё ещё волнительно.', zh: '说和真人说话还是让人紧张。' } },
    ],
    reference: 'オンラインの先生と勉強を始めました。家で勉強することができるので、便利です。でも、本当の人と話すのはまだ緊張します。',
  },
  {
    id: 'mirror-l4-neighbour-noise',
    level: 4,
    title: 'A noise problem',
    ideaMap: [
      { id: 'm4n-1', concepts: { en: 'Say that the room above is noisy late at night.', ru: 'Скажите, что в комнате наверху шумно поздно ночью.', zh: '说楼上房间深夜很吵。' } },
      { id: 'm4n-2', concepts: { en: 'Say that you have not been able to sleep well recently.', ru: 'Скажите, что в последнее время не можете хорошо спать.', zh: '说你最近睡不好。' } },
      { id: 'm4n-3', concepts: { en: 'Say that you are wondering whether to tell the manager.', ru: 'Скажите, что раздумываете, сказать ли управляющему.', zh: '说你在犹豫要不要告诉管理员。' } },
    ],
    reference: '上の部屋は夜遅くうるさいです。最近、よく眠ることができません。管理人に言ったほうがいいか、迷っています。',
  },
  {
    id: 'mirror-l4-gift',
    level: 4,
    title: 'Choosing a gift',
    ideaMap: [
      { id: 'm4g-1', concepts: { en: "Say that next month is your friend's birthday.", ru: 'Скажите, что в следующем месяце день рождения вашего друга.', zh: '说下个月是你朋友的生日。' } },
      { id: 'm4g-2', concepts: { en: 'Say that you do not know what she would be happy to receive.', ru: 'Скажите, что не знаете, чему она была бы рада.', zh: '说你不知道她会喜欢什么。' } },
      { id: 'm4g-3', concepts: { en: 'Ask the listener what they think would be good.', ru: 'Спросите собеседника, что, по его мнению, будет хорошо.', zh: '问对方觉得送什么好。' } },
    ],
    reference: '来月は友達の誕生日です。何をもらったら喜ぶか、分かりません。何がいいと思いますか。',
  },
  {
    id: 'mirror-l4-typhoon',
    level: 4,
    title: 'Typhoon day',
    ideaMap: [
      { id: 'm4t-1', concepts: { en: 'Say that a typhoon is coming tomorrow.', ru: 'Скажите, что завтра придёт тайфун.', zh: '说明天台风要来。' } },
      { id: 'm4t-2', concepts: { en: 'Say that trains will probably stop.', ru: 'Скажите, что поезда, вероятно, остановятся.', zh: '说电车大概会停运。' } },
      { id: 'm4t-3', concepts: { en: 'Say that it would be safer to work from home.', ru: 'Скажите, что безопаснее работать из дома.', zh: '说在家工作会更安全。' } },
    ],
    reference: '明日、台風が来るそうです。電車が止まるかもしれません。家で仕事をしたほうが安全だと思います。',
  },
  {
    id: 'mirror-l4-cooking-fail',
    level: 4,
    title: 'A cooking failure',
    ideaMap: [
      { id: 'm4f-1', concepts: { en: 'Say that you tried making Japanese food for the first time.', ru: 'Скажите, что впервые попробовали приготовить японскую еду.', zh: '说你第一次尝试做日本菜。' } },
      { id: 'm4f-2', concepts: { en: 'Say that you put in too much salt, so it was inedible.', ru: 'Скажите, что положили слишком много соли, поэтому это было несъедобно.', zh: '说你放了太多盐，结果没法吃。' } },
      { id: 'm4f-3', concepts: { en: 'Say that next time you will follow the recipe properly.', ru: 'Скажите, что в следующий раз будете точно следовать рецепту.', zh: '说下次你会好好按照食谱做。' } },
    ],
    reference: '初めて日本の料理を作ってみました。塩を入れすぎたので、食べられませんでした。今度はレシピをちゃんと見ながら作ります。',
  },

  {
    id: 'mirror-l5-apology',
    level: 5,
    title: 'Apologising for an error',
    ideaMap: [
      { id: 'm5a-1', concepts: { en: 'Apologise for a mistake in the figures you sent.', ru: 'Извинитесь за ошибку в отправленных вами цифрах.', zh: '为你发送的数字有误道歉。' } },
      { id: 'm5a-2', concepts: { en: 'Explain that the correct document is attached.', ru: 'Объясните, что верный документ прилагается.', zh: '说明正确的文件已附上。' } },
      { id: 'm5a-3', concepts: { en: 'Say you will check more carefully from now on.', ru: 'Скажите, что впредь будете проверять внимательнее.', zh: '说今后你会更仔细地检查。' } },
    ],
    reference: 'お送りした数字に誤りがあり、申し訳ございませんでした。正しい資料を添付いたします。今後はより慎重に確認いたします。',
  },
  {
    id: 'mirror-l5-proposal',
    level: 5,
    title: 'Making a proposal',
    ideaMap: [
      { id: 'm5p-1', concepts: { en: 'Say that the current method takes too much time.', ru: 'Скажите, что нынешний метод занимает слишком много времени.', zh: '说目前的方法太费时间。' } },
      { id: 'm5p-2', concepts: { en: 'Propose dividing the work between two teams.', ru: 'Предложите разделить работу между двумя командами.', zh: '提议把工作分给两个团队。' } },
      { id: 'm5p-3', concepts: { en: 'Say that you would like to hear everyone opinions.', ru: 'Скажите, что хотели бы услышать мнения всех.', zh: '说你想听听大家的意见。' } },
    ],
    reference: '今のやり方では、時間がかかりすぎると思います。作業を二つのチームで分けることを提案します。皆さんのご意見を伺いたいと思います。',
  },
  {
    id: 'mirror-l5-thanks',
    level: 5,
    title: 'Thanking a mentor',
    ideaMap: [
      { id: 'm5t-1', concepts: { en: 'Thank them for their guidance over the past year.', ru: 'Поблагодарите за наставничество в течение прошедшего года.', zh: '感谢对方过去一年的指导。' } },
      { id: 'm5t-2', concepts: { en: 'Say that thanks to their advice you were able to finish the project.', ru: 'Скажите, что благодаря их совету смогли завершить проект.', zh: '说多亏了对方的建议，你才完成了项目。' } },
      { id: 'm5t-3', concepts: { en: 'Say that you hope to work together again.', ru: 'Скажите, что надеетесь снова поработать вместе.', zh: '说希望能再次一起工作。' } },
    ],
    reference: 'この一年、ご指導いただきありがとうございました。アドバイスのおかげで、プロジェクトを終えることができました。またご一緒できることを願っております。',
  },
  {
    id: 'mirror-l5-decline',
    level: 5,
    title: 'Declining a request',
    ideaMap: [
      { id: 'm5d-1', concepts: { en: 'Thank them for thinking of you for the work.', ru: 'Поблагодарите за то, что подумали о вас для этой работы.', zh: '感谢对方想到让你做这份工作。' } },
      { id: 'm5d-2', concepts: { en: 'Explain that you cannot take it on because of another deadline.', ru: 'Объясните, что не можете взяться из-за другого срока.', zh: '说明因为另一个截止日期，你无法接受。' } },
      { id: 'm5d-3', concepts: { en: 'Offer to introduce a suitable colleague.', ru: 'Предложите представить подходящего коллегу.', zh: '提出可以介绍合适的同事。' } },
    ],
    reference: 'このお仕事に私を考えてくださり、ありがとうございます。別の締め切りがあるため、お引き受けすることができません。よろしければ、適当な同僚をご紹介いたします。',
  },
  {
    id: 'mirror-l5-remote',
    level: 5,
    title: 'Remote work',
    ideaMap: [
      { id: 'm5r-1', concepts: { en: 'Say that since last year many employees work from home.', ru: 'Скажите, что с прошлого года многие сотрудники работают из дома.', zh: '说从去年开始很多员工在家工作。' } },
      { id: 'm5r-2', concepts: { en: 'Say that commuting time decreased, but communication became harder.', ru: 'Скажите, что время на дорогу сократилось, но общение стало труднее.', zh: '说通勤时间减少了，但沟通变难了。' } },
      { id: 'm5r-3', concepts: { en: 'Say that a weekly meeting in the office would be good.', ru: 'Скажите, что было бы хорошо раз в неделю встречаться в офисе.', zh: '说每周在办公室开一次会比较好。' } },
    ],
    reference: '去年から、多くの社員が家で働いています。通勤時間は減りましたが、連絡を取ることが難しくなりました。週に一度、会社で会議をしたほうがいいと思います。',
  },
  {
    id: 'mirror-l5-training',
    level: 5,
    title: 'Reporting on training',
    ideaMap: [
      { id: 'm5g-1', concepts: { en: 'Say that you attended a three-day training session.', ru: 'Скажите, что посетили трёхдневный тренинг.', zh: '说你参加了三天的培训。' } },
      { id: 'm5g-2', concepts: { en: 'Say that the part about customer response was most useful.', ru: 'Скажите, что часть про работу с клиентами была самой полезной.', zh: '说关于客户应对的部分最有用。' } },
      { id: 'm5g-3', concepts: { en: 'Say that you would like to share the materials with the team.', ru: 'Скажите, что хотели бы поделиться материалами с командой.', zh: '说你想把资料分享给团队。' } },
    ],
    reference: '三日間の研修に参加しました。お客様への対応についての部分が最も役に立ちました。資料をチームの皆さんと共有したいと思います。',
  },
  {
    id: 'mirror-l5-deadline',
    level: 5,
    title: 'Asking for an extension',
    ideaMap: [
      { id: 'm5e-1', concepts: { en: 'Say that the survey is taking longer than expected.', ru: 'Скажите, что опрос занимает больше времени, чем ожидалось.', zh: '说调查花的时间比预想的长。' } },
      { id: 'm5e-2', concepts: { en: 'Ask whether the deadline could be moved to the end of the month.', ru: 'Спросите, можно ли перенести срок на конец месяца.', zh: '询问能否把截止日期改到月底。' } },
      { id: 'm5e-3', concepts: { en: 'Say that you will send an interim report this week.', ru: 'Скажите, что на этой неделе пришлёте промежуточный отчёт.', zh: '说你这周会先发中期报告。' } },
    ],
    reference: '調査に思ったより時間がかかっています。締め切りを今月末まで延ばしていただけないでしょうか。今週中に、途中の報告をお送りします。',
  },
  {
    id: 'mirror-l5-customer',
    level: 5,
    title: 'Customer feedback',
    ideaMap: [
      { id: 'm5c-1', concepts: { en: 'Say that many customers say the site is hard to use.', ru: 'Скажите, что многие клиенты говорят, что сайтом трудно пользоваться.', zh: '说很多客户表示网站难用。' } },
      { id: 'm5c-2', concepts: { en: 'Say that in particular it is hard to find the price.', ru: 'Скажите, что особенно трудно найти цену.', zh: '说尤其是价格很难找到。' } },
      { id: 'm5c-3', concepts: { en: 'Suggest showing the price on the first page.', ru: 'Предложите показывать цену на первой странице.', zh: '建议在首页显示价格。' } },
    ],
    reference: '多くのお客様から、サイトが使いにくいという声をいただいています。特に、値段を見つけることが難しいようです。最初のページに値段を表示することを提案いたします。',
  },
  {
    id: 'mirror-l5-introduce',
    level: 5,
    title: 'Introducing a new member',
    ideaMap: [
      { id: 'm5n-1', concepts: { en: 'Say that a new member joined the team this month.', ru: 'Скажите, что в этом месяце в команду пришёл новый сотрудник.', zh: '说这个月团队来了新成员。' } },
      { id: 'm5n-2', concepts: { en: 'Say that she has ten years of design experience.', ru: 'Скажите, что у неё десять лет опыта в дизайне.', zh: '说她有十年的设计经验。' } },
      { id: 'm5n-3', concepts: { en: 'Ask everyone to support her.', ru: 'Попросите всех оказать ей поддержку.', zh: '请大家多多支持她。' } },
    ],
    reference: '今月、新しいメンバーがチームに入りました。デザインの経験が十年あります。皆さん、どうぞよろしくお願いいたします。',
  },
  {
    id: 'mirror-l5-budget',
    level: 5,
    title: 'Explaining a cost',
    ideaMap: [
      { id: 'm5b-1', concepts: { en: 'Say that this year the cost rose by twenty percent.', ru: 'Скажите, что в этом году расходы выросли на двадцать процентов.', zh: '说今年的费用上涨了百分之二十。' } },
      { id: 'm5b-2', concepts: { en: 'Explain that the main reason is the rise in material prices.', ru: 'Объясните, что главная причина — рост цен на материалы.', zh: '说明主要原因是材料价格上涨。' } },
      { id: 'm5b-3', concepts: { en: 'Say that you are looking for another supplier.', ru: 'Скажите, что ищете другого поставщика.', zh: '说你正在寻找别的供应商。' } },
    ],
    reference: '今年は費用が二十パーセント上がりました。主な理由は、材料の値段が上がったことです。別の会社を探しているところです。',
  },
  {
    id: 'mirror-l5-farewell',
    level: 5,
    title: 'Leaving a company',
    ideaMap: [
      { id: 'm5f-1', concepts: { en: 'Say that you will leave the company at the end of March.', ru: 'Скажите, что покинете компанию в конце марта.', zh: '说你三月底将离开公司。' } },
      { id: 'm5f-2', concepts: { en: 'Say that you learned a great deal during your five years.', ru: 'Скажите, что за пять лет многому научились.', zh: '说这五年你学到了很多。' } },
      { id: 'm5f-3', concepts: { en: 'Say that you will hand over your work carefully.', ru: 'Скажите, что аккуратно передадите свои дела.', zh: '说你会认真做好交接。' } },
    ],
    reference: '三月末で会社を辞めることになりました。五年間で、本当に多くのことを学びました。仕事の引き継ぎは、責任を持って行います。',
  },

  {
    id: 'mirror-l6-remote-study',
    level: 6,
    title: 'Online education',
    ideaMap: [
      { id: 'm6o-1', concepts: { en: 'State that online classes spread rapidly in recent years.', ru: 'Скажите, что за последние годы онлайн-занятия быстро распространились.', zh: '说明近年来线上课程迅速普及。' } },
      { id: 'm6o-2', concepts: { en: 'Say that in addition to convenience, cost is a reason.', ru: 'Скажите, что помимо удобства, причиной является стоимость.', zh: '说除了方便之外，费用也是原因。' } },
      { id: 'm6o-3', concepts: { en: 'Point out that motivation is difficult to maintain alone.', ru: 'Отметьте, что мотивацию трудно поддерживать в одиночку.', zh: '指出一个人很难保持学习动力。' } },
    ],
    reference: '近年、オンライン授業が急速に広まりました。便利さに加えて、費用の安さも理由の一つです。ただし、一人では学習意欲を保つことが難しいという問題もあります。',
  },
  {
    id: 'mirror-l6-aging',
    level: 6,
    title: 'An ageing society',
    ideaMap: [
      { id: 'm6a-1', concepts: { en: 'State that the proportion of elderly people continues to rise.', ru: 'Скажите, что доля пожилых людей продолжает расти.', zh: '说明老年人的比例持续上升。' } },
      { id: 'm6a-2', concepts: { en: 'Say that as a result, the shortage of care workers has become serious.', ru: 'Скажите, что в результате нехватка работников по уходу стала серьёзной.', zh: '说结果护理人员短缺变得严重。' } },
      { id: 'm6a-3', concepts: { en: 'Suggest that improving working conditions is essential.', ru: 'Предположите, что улучшение условий труда необходимо.', zh: '建议改善工作条件是必要的。' } },
    ],
    reference: '高齢者の割合は増え続けています。それに伴い、介護で働く人の不足が深刻になっています。労働条件を改善することが不可欠だと考えられます。',
  },
  {
    id: 'mirror-l6-recycling',
    level: 6,
    title: 'Recycling rules',
    ideaMap: [
      { id: 'm6c-1', concepts: { en: 'State that this city changed its rubbish separation rules in April.', ru: 'Скажите, что в апреле город изменил правила сортировки мусора.', zh: '说明这座城市四月修改了垃圾分类规则。' } },
      { id: 'm6c-2', concepts: { en: 'Say that regardless of the change, many residents follow the old way.', ru: 'Скажите, что независимо от изменения многие жители следуют старому порядку.', zh: '说无论规则如何变，很多居民仍按旧方式做。' } },
      { id: 'm6c-3', concepts: { en: 'Propose distributing an illustrated guide to every household.', ru: 'Предложите раздать иллюстрированное руководство каждому домохозяйству.', zh: '提议向每户发放图解指南。' } },
    ],
    reference: '本市では、四月にごみの分別規則が変更されました。変更にかかわらず、以前のやり方を続けている住民が少なくありません。各家庭に、図の入った案内を配ることを提案します。',
  },
  {
    id: 'mirror-l6-tourism',
    level: 6,
    title: 'Tourism and residents',
    ideaMap: [
      { id: 'm6t-1', concepts: { en: 'State that visitor numbers to this town have doubled in five years.', ru: 'Скажите, что число посетителей города за пять лет удвоилось.', zh: '说明这座城镇的游客数五年内翻了一倍。' } },
      { id: 'm6t-2', concepts: { en: 'Say that while the economy improved, daily life became harder for residents.', ru: 'Скажите, что экономика улучшилась, но повседневная жизнь жителей стала труднее.', zh: '说经济好转了，但居民的日常生活变难了。' } },
      { id: 'm6t-3', concepts: { en: 'Suggest limiting the number of visitors during busy seasons.', ru: 'Предложите ограничить число посетителей в высокий сезон.', zh: '建议在旺季限制游客数量。' } },
    ],
    reference: 'この町を訪れる人の数は、五年間で二倍になりました。経済は良くなった一方で、住民の生活は不便になっています。混雑する時期には、訪問者の数を制限することを提案します。',
  },
  {
    id: 'mirror-l6-remote-medicine',
    level: 6,
    title: 'Remote medical care',
    ideaMap: [
      { id: 'm6m-1', concepts: { en: 'State that remote consultations are increasing in rural areas.', ru: 'Скажите, что дистанционные консультации растут в сельской местности.', zh: '说明农村地区的远程问诊在增加。' } },
      { id: 'm6m-2', concepts: { en: 'Say this is because there are few doctors nearby.', ru: 'Скажите, что это связано с тем, что поблизости мало врачей.', zh: '说这是因为附近医生很少。' } },
      { id: 'm6m-3', concepts: { en: 'Point out that elderly people often cannot use the equipment.', ru: 'Отметьте, что пожилые люди часто не могут пользоваться оборудованием.', zh: '指出老年人常常不会使用设备。' } },
    ],
    reference: '地方では、離れた場所からの診察が増えています。これは、近くに医師が少ないためです。ただし、高齢者の中には機械を使えない人も多いという課題があります。',
  },
  {
    id: 'mirror-l6-food-waste',
    level: 6,
    title: 'Food waste',
    ideaMap: [
      { id: 'm6f-1', concepts: { en: 'State that a large amount of edible food is discarded each year.', ru: 'Скажите, что каждый год выбрасывается большое количество съедобной еды.', zh: '说明每年有大量还能吃的食物被丢弃。' } },
      { id: 'm6f-2', concepts: { en: 'Say that strict date labelling is one cause.', ru: 'Скажите, что строгая маркировка сроков — одна из причин.', zh: '说严格的日期标示是原因之一。' } },
      { id: 'm6f-3', concepts: { en: 'Say that some shops have begun selling such items cheaply.', ru: 'Скажите, что некоторые магазины начали продавать такие товары дёшево.', zh: '说有些商店已开始便宜出售这类商品。' } },
    ],
    reference: '毎年、まだ食べられる食品が大量に捨てられています。厳しい期限の表示も、その原因の一つだと言われています。近年、そうした商品を安く販売し始めた店もあります。',
  },
  {
    id: 'mirror-l6-language-policy',
    level: 6,
    title: 'Language in the workplace',
    ideaMap: [
      { id: 'm6l-1', concepts: { en: 'State that some companies made English their official language.', ru: 'Скажите, что некоторые компании сделали английский официальным языком.', zh: '说明有些公司把英语定为官方语言。' } },
      { id: 'm6l-2', concepts: { en: 'Say that in addition to hiring, overseas expansion is the aim.', ru: 'Скажите, что помимо найма целью является выход за рубеж.', zh: '说除了招聘之外，目的还有海外扩张。' } },
      { id: 'm6l-3', concepts: { en: 'Point out that meetings became slower at first.', ru: 'Отметьте, что сначала совещания стали медленнее.', zh: '指出一开始会议变慢了。' } },
    ],
    reference: '社内の公用語を英語にした企業もあります。採用に加えて、海外への進出も目的とされています。しかし、初めのうちは会議の進み方が遅くなったという声もありました。',
  },
  {
    id: 'mirror-l6-library',
    level: 6,
    title: 'The role of libraries',
    ideaMap: [
      { id: 'm6b-1', concepts: { en: 'State that libraries are becoming places to gather, not only to borrow books.', ru: 'Скажите, что библиотеки становятся местами встреч, а не только выдачи книг.', zh: '说明图书馆正在成为聚会场所，而不只是借书的地方。' } },
      { id: 'm6b-2', concepts: { en: 'Say that some now hold study rooms and events for children.', ru: 'Скажите, что некоторые теперь проводят учебные комнаты и мероприятия для детей.', zh: '说有些图书馆现在设有自习室和儿童活动。' } },
      { id: 'm6b-3', concepts: { en: 'Suggest that this role should be supported by public funds.', ru: 'Предположите, что эту роль следует поддерживать общественными средствами.', zh: '建议这一作用应由公共资金支持。' } },
    ],
    reference: '図書館は、本を借りるだけの場所ではなく、人が集まる場所になりつつあります。学習室を設けたり、子供向けの行事を開いたりする館も増えました。こうした役割は、公的な資金によって支えられるべきです。',
  },
  {
    id: 'mirror-l6-transport',
    level: 6,
    title: 'Rural transport',
    ideaMap: [
      { id: 'm6r-1', concepts: { en: 'State that bus routes in rural areas are being reduced one after another.', ru: 'Скажите, что автобусные маршруты в сельской местности сокращаются один за другим.', zh: '说明农村的公交线路正接连被削减。' } },
      { id: 'm6r-2', concepts: { en: 'Say that residents without cars are especially affected.', ru: 'Скажите, что особенно страдают жители без машин.', zh: '说没有车的居民受影响最大。' } },
      { id: 'm6r-3', concepts: { en: 'Say that small shared vehicles are being trialled in some areas.', ru: 'Скажите, что в некоторых районах испытываются небольшие совместные автомобили.', zh: '说有些地区正在试行小型共享车辆。' } },
    ],
    reference: '地方では、バスの路線が次々に減らされています。車を持たない住民は、特に大きな影響を受けています。一部の地域では、小型の乗り合い車両を試験的に走らせています。',
  },
  {
    id: 'mirror-l6-remote-child',
    level: 6,
    title: 'Screens and children',
    ideaMap: [
      { id: 'm6d-1', concepts: { en: 'State that according to a survey, screen time for children keeps growing.', ru: 'Скажите, что, согласно опросу, экранное время детей продолжает расти.', zh: '说明根据调查，儿童的屏幕时间持续增加。' } },
      { id: 'm6d-2', concepts: { en: 'Say that some parents worry about effects on eyesight and sleep.', ru: 'Скажите, что некоторые родители беспокоятся о влиянии на зрение и сон.', zh: '说有些家长担心对视力和睡眠的影响。' } },
      { id: 'm6d-3', concepts: { en: 'Say that rather than banning it, deciding rules together is effective.', ru: 'Скажите, что вместо запрета эффективнее вместе устанавливать правила.', zh: '说与其禁止，不如一起制定规则更有效。' } },
    ],
    reference: '調査によると、子供が画面を見る時間は増え続けています。視力や睡眠への影響を心配する保護者も少なくありません。禁止するのではなく、一緒に決まりを決めるほうが効果的だと言われています。',
  },
  {
    id: 'mirror-l6-work-hours',
    level: 6,
    title: 'Shorter working weeks',
    ideaMap: [
      { id: 'm6w-1', concepts: { en: 'State that some companies have trialled a four-day week.', ru: 'Скажите, что некоторые компании испытали четырёхдневную рабочую неделю.', zh: '说明有些公司试行了四天工作制。' } },
      { id: 'm6w-2', concepts: { en: 'Say that in many cases productivity did not fall.', ru: 'Скажите, что во многих случаях производительность не упала.', zh: '说很多情况下生产效率并没有下降。' } },
      { id: 'm6w-3', concepts: { en: 'Point out that it is difficult to apply to every industry.', ru: 'Отметьте, что это трудно применить в каждой отрасли.', zh: '指出这难以适用于所有行业。' } },
    ],
    reference: '週四日勤務を試みた企業もあります。多くの場合、生産性は下がらなかったと報告されています。ただし、すべての業種に当てはめることは難しいでしょう。',
  },

  {
    id: 'mirror-l7-memory',
    level: 7,
    title: 'Memory and recording',
    ideaMap: [
      { id: 'm7m-1', concepts: { en: 'Argue that the more we record, the less we seem to remember.', ru: 'Утвердите, что чем больше мы записываем, тем меньше, кажется, помним.', zh: '论述我们记录得越多，似乎记住的越少。' } },
      { id: 'm7m-2', concepts: { en: 'Say that a photograph preserves the scene but not the act of looking.', ru: 'Скажите, что фотография сохраняет вид, но не сам акт смотрения.', zh: '说照片保存了景象，却没有保存观看这件事。' } },
      { id: 'm7m-3', concepts: { en: 'Conclude that what is not written down is what shapes us.', ru: 'Сделайте вывод, что нас формирует именно то, что не записано.', zh: '总结塑造我们的正是那些没有被记下的东西。' } },
    ],
    reference: '記録すればするほど、かえって覚えていないように思われる。写真はその光景を残すが、見るという行為そのものを残すわけではない。書き留められなかったものこそが、私たちを形づくっているのではないだろうか。',
  },
  {
    id: 'mirror-l7-translation',
    level: 7,
    title: 'The limits of translation',
    ideaMap: [
      { id: 'm7t-1', concepts: { en: 'Argue that a translation is never merely a replacement of words.', ru: 'Утвердите, что перевод никогда не является просто заменой слов.', zh: '论述翻译绝不只是词语的替换。' } },
      { id: 'm7t-2', concepts: { en: 'Say that what a language leaves unsaid differs from culture to culture.', ru: 'Скажите, что то, что язык оставляет невысказанным, различается от культуры к культуре.', zh: '说语言所不说出口的部分因文化而异。' } },
      { id: 'm7t-3', concepts: { en: 'Conclude that a good translator must decide what to lose.', ru: 'Сделайте вывод, что хороший переводчик должен решать, чем пожертвовать.', zh: '总结好的译者必须决定舍弃什么。' } },
    ],
    reference: '翻訳とは、単なる語の置き換えではありえない。ある言語が語らずに済ませるものは、文化によって異なるからである。優れた翻訳者とは、何を失うかを選び取る者にほかならない。',
  },
  {
    id: 'mirror-l7-failure',
    level: 7,
    title: 'On failure',
    ideaMap: [
      { id: 'm7f-1', concepts: { en: 'Argue that a society intolerant of failure produces no new attempts.', ru: 'Утвердите, что общество, нетерпимое к неудачам, не порождает новых попыток.', zh: '论述不容许失败的社会不会产生新的尝试。' } },
      { id: 'm7f-2', concepts: { en: 'Say that those who never fail have merely chosen easy problems.', ru: 'Скажите, что те, кто никогда не терпит неудач, просто выбирали лёгкие задачи.', zh: '说从不失败的人只是选了容易的问题。' } },
      { id: 'm7f-3', concepts: { en: 'Conclude that what should be asked is not whether one failed but what was learned.', ru: 'Сделайте вывод, что спрашивать следует не о том, была ли неудача, а о том, чему научились.', zh: '总结应该问的不是是否失败，而是学到了什么。' } },
    ],
    reference: '失敗を許さない社会からは、新たな試みは生まれない。一度も失敗しない者は、易しい問題ばかりを選んできたにすぎないとも言える。問われるべきは、失敗したかどうかではなく、そこから何を学んだかである。',
  },
  {
    id: 'mirror-l7-silence',
    level: 7,
    title: 'Silence in conversation',
    ideaMap: [
      { id: 'm7s-1', concepts: { en: 'Argue that silence is often treated as an absence of communication.', ru: 'Утвердите, что молчание часто воспринимают как отсутствие общения.', zh: '论述沉默常被当作沟通的缺失。' } },
      { id: 'm7s-2', concepts: { en: 'Say that in Japanese conversation, a pause itself carries meaning.', ru: 'Скажите, что в японском разговоре сама пауза несёт смысл.', zh: '说在日语对话中，停顿本身就带有含义。' } },
      { id: 'm7s-3', concepts: { en: 'Conclude that learning a language means learning when not to speak.', ru: 'Сделайте вывод, что изучать язык — значит учиться, когда не говорить.', zh: '总结学习语言意味着学会何时不说话。' } },
    ],
    reference: '沈黙は、しばしば意思疎通の欠如として扱われる。しかし日本語の会話においては、間そのものが意味を担っている。言語を学ぶとは、話さないでいるべき時を学ぶことでもあるのだ。',
  },
  {
    id: 'mirror-l7-expertise',
    level: 7,
    title: 'Expertise and doubt',
    ideaMap: [
      { id: 'm7e-1', concepts: { en: 'Argue that the more one knows, the more carefully one speaks.', ru: 'Утвердите, что чем больше человек знает, тем осторожнее говорит.', zh: '论述知道得越多，说话越谨慎。' } },
      { id: 'm7e-2', concepts: { en: 'Say that a specialist is aware of the exceptions a beginner cannot see.', ru: 'Скажите, что специалист осознаёт исключения, которых новичок не видит.', zh: '说专家意识到初学者看不到的例外。' } },
      { id: 'm7e-3', concepts: { en: 'Conclude that confident assertions deserve suspicion.', ru: 'Сделайте вывод, что уверенные утверждения заслуживают подозрения.', zh: '总结自信的断言值得怀疑。' } },
    ],
    reference: '知れば知るほど、人は慎重にものを言うようになる。専門家は、初学者には見えない例外の存在を知っているからである。だからこそ、あまりに自信に満ちた断言は疑ってかかるべきなのだ。',
  },
  {
    id: 'mirror-l7-tradition',
    level: 7,
    title: 'Tradition and change',
    ideaMap: [
      { id: 'm7r-1', concepts: { en: 'Argue that traditions survive precisely because they change.', ru: 'Утвердите, что традиции выживают именно потому, что меняются.', zh: '论述传统正因为改变才得以存续。' } },
      { id: 'm7r-2', concepts: { en: 'Say that what is preserved unchanged becomes a museum piece.', ru: 'Скажите, что сохранённое без изменений становится музейным экспонатом.', zh: '说原封不动保存下来的东西会变成博物馆展品。' } },
      { id: 'm7r-3', concepts: { en: 'Conclude that protecting a tradition means letting each generation remake it.', ru: 'Сделайте вывод, что защищать традицию — значит позволять каждому поколению переделывать её.', zh: '总结守护传统意味着让每一代人重塑它。' } },
    ],
    reference: '伝統は、変化するからこそ生き延びてきたのである。一切変わらぬまま保存されたものは、やがて博物館の展示品となるほかない。伝統を守るとは、それぞれの世代がそれを作り直すことを許すことなのではないだろうか。',
  },
  {
    id: 'mirror-l7-speed',
    level: 7,
    title: 'The cost of speed',
    ideaMap: [
      { id: 'm7p-1', concepts: { en: 'Argue that speed has become a value in itself.', ru: 'Утвердите, что скорость стала ценностью сама по себе.', zh: '论述速度本身已成为一种价值。' } },
      { id: 'm7p-2', concepts: { en: 'Say that a reply sent immediately is rarely a considered one.', ru: 'Скажите, что мгновенно отправленный ответ редко бывает обдуманным.', zh: '说立刻发出的回复很少是深思熟虑的。' } },
      { id: 'm7p-3', concepts: { en: 'Conclude that we should defend the right to answer slowly.', ru: 'Сделайте вывод, что нам следует защищать право отвечать медленно.', zh: '总结我们应当捍卫慢慢回答的权利。' } },
    ],
    reference: '速さは、いつのまにかそれ自体が価値とみなされるようになった。しかし、即座に返された答えが熟慮を経ていることは稀である。私たちは、ゆっくりと答える権利をこそ守るべきではないだろうか。',
  },
  {
    id: 'mirror-l7-map',
    level: 7,
    title: 'Maps and territory',
    ideaMap: [
      { id: 'm7a-1', concepts: { en: 'Argue that a map is useful only because it omits.', ru: 'Утвердите, что карта полезна лишь потому, что она опускает детали.', zh: '论述地图之所以有用，正因为它有所省略。' } },
      { id: 'm7a-2', concepts: { en: 'Say that a map showing everything would be as large as the land itself.', ru: 'Скажите, что карта, показывающая всё, была бы размером с саму землю.', zh: '说一张显示一切的地图会和土地本身一样大。' } },
      { id: 'm7a-3', concepts: { en: 'Conclude that every model is a decision about what may be ignored.', ru: 'Сделайте вывод, что всякая модель — это решение о том, чем можно пренебречь.', zh: '总结每个模型都是关于什么可以忽略的决定。' } },
    ],
    reference: '地図が役に立つのは、それが多くを省略しているからにほかならない。すべてを描き込んだ地図は、土地そのものと同じ大きさになってしまうだろう。あらゆる模型とは、何を無視してよいかについての決断なのである。',
  },
  {
    id: 'mirror-l7-work-meaning',
    level: 7,
    title: 'Work and meaning',
    ideaMap: [
      { id: 'm7w-1', concepts: { en: 'Argue that people endure hard work if they can see its purpose.', ru: 'Утвердите, что люди выносят тяжёлую работу, если видят её цель.', zh: '论述如果能看到目的，人们可以忍受艰苦的工作。' } },
      { id: 'm7w-2', concepts: { en: 'Say that what exhausts us is not effort but meaninglessness.', ru: 'Скажите, что нас изматывает не усилие, а бессмысленность.', zh: '说让我们疲惫的不是努力，而是无意义。' } },
      { id: 'm7w-3', concepts: { en: 'Conclude that a manager must explain why, not only what.', ru: 'Сделайте вывод, что руководитель должен объяснять «почему», а не только «что».', zh: '总结管理者必须解释为什么，而不只是做什么。' } },
    ],
    reference: '人は、その目的が見えてさえいれば、厳しい仕事にも耐えることができる。私たちを消耗させるのは、労力そのものではなく、無意味さである。だからこそ管理する者は、何をするかだけでなく、なぜするのかを語らなければならない。',
  },
  {
    id: 'mirror-l7-nature',
    level: 7,
    title: 'Nature as a construct',
    ideaMap: [
      { id: 'm7n-1', concepts: { en: 'Argue that the landscape we call untouched has usually been shaped by people.', ru: 'Утвердите, что пейзаж, который мы называем нетронутым, обычно сформирован людьми.', zh: '论述我们称之为原始的风景，通常是人塑造的。' } },
      { id: 'm7n-2', concepts: { en: "Say that Japan's satoyama is a product of centuries of use.", ru: 'Скажите, что японское сатояма — продукт многовекового использования.', zh: '说日本的里山是数百年利用的产物。' } },
      { id: 'm7n-3', concepts: { en: 'Conclude that to abandon such land is not to protect it.', ru: 'Сделайте вывод, что бросить такую землю — не значит защитить её.', zh: '总结抛弃这样的土地并不等于保护它。' } },
    ],
    reference: '手つかずと呼ばれる風景の多くは、実のところ人の手によって形づくられてきた。日本の里山は、何世紀にもわたる利用の産物にほかならない。そうした土地を放置することは、決してそれを守ることを意味しないのである。',
  },
  {
    id: 'mirror-l7-question',
    level: 7,
    title: 'Asking the right question',
    ideaMap: [
      { id: 'm7q-1', concepts: { en: 'Argue that a wrong question cannot be saved by a correct answer.', ru: 'Утвердите, что неверный вопрос не спасти верным ответом.', zh: '论述错误的问题无法靠正确的答案挽救。' } },
      { id: 'm7q-2', concepts: { en: 'Say that much research measures what is easy to measure.', ru: 'Скажите, что многие исследования измеряют то, что легко измерить.', zh: '说很多研究测量的是容易测量的东西。' } },
      { id: 'm7q-3', concepts: { en: 'Conclude that framing the problem is itself the hardest work.', ru: 'Сделайте вывод, что сама постановка задачи и есть самая трудная работа.', zh: '总结界定问题本身就是最难的工作。' } },
    ],
    reference: '問いが誤っていれば、いかに正しい答えを得ようとも救われることはない。多くの研究は、測りやすいものばかりを測っているのが実情である。問題をどう立てるかということこそ、最も困難な仕事なのだ。',
  },
];

/** Every bundled text for a study language, plus the learner's own. */
export function mirrorTextsFor(lang: StudyLang, own: readonly MirrorText[] = []): MirrorText[] {
  const bundled = lang === 'zh' ? ZH_MIRROR_TEXTS : lang === 'ru' ? RU_MIRROR_TEXTS : MIRROR_TEXTS;
  return [...bundled, ...own.filter((text) => (text.lang ?? 'ja') === lang)];
}

/**
 * The texts to rotate through at a level: the level itself first, then one
 * either side, then anything — so a level with few texts still has a "next".
 */
export function mirrorRotation(texts: readonly MirrorText[], level: LevelTier): MirrorText[] {
  const exact = texts.filter((t) => t.level === level);
  const near = texts.filter((t) => Math.abs(t.level - level) === 1);
  const rest = texts.filter((t) => Math.abs(t.level - level) > 1);
  return [...exact, ...near, ...rest];
}

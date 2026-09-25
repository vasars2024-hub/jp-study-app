import type { GrammarPoint } from './types';

/**
 * Russian grammar, CEFR A1–B1 (the TORFL elementary, basic and first levels).
 *
 * Authored for this app (original explanations and example sentences, no
 * third-party text), so it carries the app's own licence. Levels follow the
 * common TORFL / CEFR progression: cases and present tense at A1, aspect and
 * motion verbs at A2, conditional mood, participles and verbal adverbs at B1.
 * `jp` holds the Russian sentence — the field name predates the other
 * languages. Categories are written against the taxonomy directly.
 */
export const RU_CEFR: GrammarPoint[] = [
  // —— A1 ——
  {
    id: 'ru-a1-eto',
    lang: 'ru',
    level: 'A1',
    title: 'Это …',
    meaning: 'this is / these are',
    structure: 'Это + noun (nominative)',
    explanation:
      'Points something out and names it. Это does not change for gender or number, and the present tense of "to be" is simply left out: Это книга, not "Это есть книга". A question is made with intonation alone or with что/кто: Что это? Кто это?',
    categories: ['explanation.definition'],
    register: 'neutral',
    examples: [
      { jp: 'Это мой брат.', en: 'This is my brother.' },
      { jp: 'Что это? — Это словарь.', en: 'What is this? — It is a dictionary.' },
    ],
  },
  {
    id: 'ru-a1-zero-copula',
    lang: 'ru',
    level: 'A1',
    title: 'Я студент (no "to be" in the present)',
    meaning: 'X is Y',
    structure: 'Subject + noun / adjective (nominative)',
    explanation:
      'In the present tense the verb быть is omitted. In writing a dash separates two nouns when there is no pronoun: Москва — столица России. In the past and future быть comes back: Я был студентом.',
    categories: ['state.description'],
    register: 'neutral',
    examples: [
      { jp: 'Я студент, а она врач.', en: 'I am a student, and she is a doctor.' },
      { jp: 'Москва — столица России.', en: 'Moscow is the capital of Russia.' },
      { jp: 'Погода сегодня хорошая.', en: 'The weather is nice today.' },
    ],
  },
  {
    id: 'ru-a1-gender',
    lang: 'ru',
    level: 'A1',
    title: 'он / она / оно — noun gender',
    meaning: 'masculine, feminine and neuter nouns',
    structure: 'consonant/-й → masc.; -а/-я → fem.; -о/-е → neut.; -ь → either',
    explanation:
      'Every noun has a gender, and adjectives, possessives and past-tense verbs agree with it. The ending usually tells you: стол (он), книга (она), окно (оно). Nouns in -ь must be learned: день is masculine, ночь is feminine. Nouns for men in -а/-я (папа, дядя) are masculine.',
    categories: ['state.description'],
    register: 'neutral',
    examples: [
      { jp: 'Где мой телефон? — Он на столе.', en: 'Where is my phone? — It is on the table.' },
      { jp: 'Это моя сумка, а это моё пальто.', en: 'This is my bag, and this is my coat.' },
    ],
  },
  {
    id: 'ru-a1-u-menya-est',
    lang: 'ru',
    level: 'A1',
    title: 'У меня есть …',
    meaning: 'I have …',
    structure: 'у + genitive (меня, тебя, него, неё, нас, вас, них) + есть + nominative',
    explanation:
      'Russian says "at me there is" rather than using a verb "to have". The owner goes into the genitive after у; the thing owned is the grammatical subject. Есть is dropped when the existence is not in question and the focus is on a quality: У меня большая семья.',
    categories: ['state.description'],
    register: 'neutral',
    examples: [
      { jp: 'У меня есть собака.', en: 'I have a dog.' },
      { jp: 'У тебя есть время?', en: 'Do you have time?' },
      { jp: 'У неё красивые глаза.', en: 'She has beautiful eyes.' },
    ],
  },
  {
    id: 'ru-a1-net-genitive',
    lang: 'ru',
    level: 'A1',
    title: 'нет + genitive',
    meaning: 'there is no … / I have no …',
    structure: '(у + gen.) + нет + genitive',
    explanation:
      'Absence is expressed with нет and the genitive case of what is missing. The past is не было, the future не будет, again with the genitive and no agreement.',
    categories: ['emphasis.negation'],
    register: 'neutral',
    examples: [
      { jp: 'У меня нет машины.', en: 'I do not have a car.' },
      { jp: 'Сегодня нет урока.', en: 'There is no lesson today.' },
      { jp: 'Вчера его не было дома.', en: 'He was not at home yesterday.' },
    ],
  },
  {
    id: 'ru-a1-present-1st',
    lang: 'ru',
    level: 'A1',
    title: 'Present tense: -ать / -ять verbs (1st conjugation)',
    meaning: 'I read, you read, …',
    structure: 'stem + -ю, -ешь, -ет, -ем, -ете, -ют',
    explanation:
      'Most verbs in -ать and -ять drop -ть and add the first-conjugation endings: читать → я читаю, ты читаешь, он читает, мы читаем, вы читаете, они читают. The present tense covers both "I read" and "I am reading".',
    categories: ['state.ongoing'],
    register: 'neutral',
    examples: [
      { jp: 'Я читаю книгу.', en: 'I am reading a book.' },
      { jp: 'Что вы делаете вечером?', en: 'What are you doing in the evening?' },
    ],
  },
  {
    id: 'ru-a1-present-2nd',
    lang: 'ru',
    level: 'A1',
    title: 'Present tense: -ить verbs (2nd conjugation)',
    meaning: 'I speak, you speak, …',
    structure: 'stem + -ю/-у, -ишь, -ит, -им, -ите, -ят/-ат',
    explanation:
      'Verbs in -ить (and a few in -еть/-ать such as смотреть, слышать) take -и- in their endings: говорить → я говорю, ты говоришь, они говорят. Stems ending in -б/-в/-м/-п/-ф add -л- in the я-form only: любить → я люблю, ты любишь.',
    categories: ['state.ongoing'],
    register: 'neutral',
    examples: [
      { jp: 'Ты говоришь по-русски?', en: 'Do you speak Russian?' },
      { jp: 'Я люблю музыку, а она любит спорт.', en: 'I love music, and she loves sport.' },
    ],
  },
  {
    id: 'ru-a1-past',
    lang: 'ru',
    level: 'A1',
    title: 'Past tense (-л, -ла, -ло, -ли)',
    meaning: 'did / was doing',
    structure: 'infinitive stem + -л (m.), -ла (f.), -ло (n.), -ли (pl.)',
    explanation:
      'The past tense agrees with the subject in gender and number, not in person: я читал (a man), я читала (a woman), мы читали. Some verbs have short past forms: идти → шёл, шла, шли; мочь → мог, могла.',
    categories: ['time.point'],
    register: 'neutral',
    examples: [
      { jp: 'Вчера я смотрел фильм.', en: 'Yesterday I watched a film.' },
      { jp: 'Она жила в Казани.', en: 'She lived in Kazan.' },
      { jp: 'Мы долго ждали автобус.', en: 'We waited a long time for the bus.' },
    ],
  },
  {
    id: 'ru-a1-future-budu',
    lang: 'ru',
    level: 'A1',
    title: 'буду + infinitive',
    meaning: 'will be doing (imperfective future)',
    structure: 'быть (буду, будешь, будет, будем, будете, будут) + imperfective infinitive',
    explanation:
      'The future of imperfective verbs is compound: the future of быть plus the infinitive. It describes a process or a repeated action in the future. Perfective verbs form their future without буду (see aspect, A2).',
    categories: ['time.point', 'volition.will'],
    register: 'neutral',
    examples: [
      { jp: 'Завтра я буду работать.', en: 'Tomorrow I will be working.' },
      { jp: 'Что ты будешь делать летом?', en: 'What will you do in the summer?' },
    ],
  },
  {
    id: 'ru-a1-prepositional-location',
    lang: 'ru',
    level: 'A1',
    title: 'в / на + prepositional (where?)',
    meaning: 'in / at / on (location)',
    structure: 'в / на + noun in -е (-и for -ь and -ия nouns)',
    explanation:
      'Location answers где? with в or на and the prepositional case. Most nouns take -е: в городе, на столе; nouns in -ия/-ие and feminine -ь take -и: в России, в тетради. На is used for surfaces, open spaces, events and some fixed nouns: на работе, на почте, на концерте.',
    categories: ['space.location'],
    register: 'neutral',
    examples: [
      { jp: 'Я живу в Москве.', en: 'I live in Moscow.' },
      { jp: 'Книга лежит на столе.', en: 'The book is lying on the table.' },
      { jp: 'Мама на работе.', en: 'Mum is at work.' },
    ],
  },
  {
    id: 'ru-a1-accusative-direction',
    lang: 'ru',
    level: 'A1',
    title: 'в / на + accusative (where to?)',
    meaning: 'to / into (direction)',
    structure: 'идти / ехать + в / на + accusative',
    explanation:
      'Direction answers куда? with the same prepositions as location but the accusative case: в школу, на работу. Whichever of в/на a noun takes for location, it takes for direction too. "Home" is домой (direction) versus дома (location).',
    categories: ['space.direction'],
    register: 'neutral',
    examples: [
      { jp: 'Я иду в магазин.', en: 'I am going to the shop.' },
      { jp: 'Завтра мы едем на море.', en: 'Tomorrow we are going to the seaside.' },
      { jp: 'Пора домой.', en: 'Time to go home.' },
    ],
  },
  {
    id: 'ru-a1-nravitsya',
    lang: 'ru',
    level: 'A1',
    title: 'мне нравится …',
    meaning: 'I like …',
    structure: 'dative (мне, тебе, ему …) + нравится / нравятся + nominative',
    explanation:
      'The person who likes is in the dative; the thing liked is the subject, so the verb agrees with it: Мне нравится этот город, Мне нравятся эти города. With an infinitive the verb is singular: Мне нравится читать.',
    categories: ['emotion.feeling'],
    register: 'neutral',
    examples: [
      { jp: 'Мне нравится эта песня.', en: 'I like this song.' },
      { jp: 'Тебе нравятся кошки?', en: 'Do you like cats?' },
      { jp: 'Ему нравится готовить.', en: 'He likes cooking.' },
    ],
  },
  {
    id: 'ru-a1-khotet',
    lang: 'ru',
    level: 'A1',
    title: 'хотеть + infinitive / noun',
    meaning: 'to want (to do)',
    structure: 'хочу, хочешь, хочет, хотим, хотите, хотят + infinitive or accusative',
    explanation:
      'Хотеть is irregular: singular forms follow the first conjugation (хочу, хочешь, хочет), plural forms the second (хотим, хотите, хотят). A softer, more polite wish uses the conditional: Я хотел бы …',
    categories: ['volition.desire'],
    register: 'neutral',
    examples: [
      { jp: 'Я хочу пить.', en: 'I am thirsty. (I want to drink.)' },
      { jp: 'Вы хотите чай или кофе?', en: 'Would you like tea or coffee?' },
    ],
  },
  {
    id: 'ru-a1-mozhno-nelzya',
    lang: 'ru',
    level: 'A1',
    title: 'можно / нельзя',
    meaning: 'may, it is allowed / must not, it is impossible',
    structure: '(dative) + можно / нельзя + infinitive',
    explanation:
      'Impersonal words for permission. Можно asks or grants permission; нельзя forbids (with an imperfective infinitive) or says something cannot be done (with a perfective one). The person goes into the dative.',
    categories: ['possibility.permission', 'obligation.prohibition'],
    register: 'neutral',
    examples: [
      { jp: 'Можно войти?', en: 'May I come in?' },
      { jp: 'Здесь нельзя курить.', en: 'Smoking is not allowed here.' },
    ],
  },
  {
    id: 'ru-a1-nado-nuzhno',
    lang: 'ru',
    level: 'A1',
    title: 'надо / нужно',
    meaning: 'have to, need to',
    structure: 'dative + надо / нужно + infinitive',
    explanation:
      'Impersonal necessity: the person is in the dative, and the verb stays in the infinitive. Нужно can also take a noun: Мне нужна помощь (then нужен/нужна/нужно/нужны agrees with the noun).',
    categories: ['obligation.necessity'],
    register: 'neutral',
    examples: [
      { jp: 'Мне надо позвонить маме.', en: 'I need to call my mum.' },
      { jp: 'Тебе нужно отдохнуть.', en: 'You need to rest.' },
      { jp: 'Нам нужна большая комната.', en: 'We need a big room.' },
    ],
  },
  {
    id: 'ru-a1-gde-kuda-otkuda',
    lang: 'ru',
    level: 'A1',
    title: 'где? / куда? / откуда?',
    meaning: 'where (at)? / where (to)? / where from?',
    structure: 'где + prepositional; куда + accusative; откуда + из/с + genitive',
    explanation:
      'Russian keeps location, direction and origin apart, and each question word has its own case after it. Answers pair up: в школе / в школу / из школы; на работе / на работу / с работы.',
    categories: ['space.location', 'space.direction'],
    register: 'neutral',
    examples: [
      { jp: 'Где ты живёшь?', en: 'Where do you live?' },
      { jp: 'Куда ты идёшь?', en: 'Where are you going?' },
      { jp: 'Откуда вы? — Я из Китая.', en: 'Where are you from? — I am from China.' },
    ],
  },
  {
    id: 'ru-a1-numbers-nouns',
    lang: 'ru',
    level: 'A1',
    title: 'Numbers with nouns (1 книга, 2 книги, 5 книг)',
    meaning: 'counting things',
    structure: '1 + nom. sg.; 2–4 + gen. sg.; 5–20 + gen. pl.',
    explanation:
      'The noun after a number depends on the last word of the number: один/одна + nominative singular, два/три/четыре + genitive singular, пять and above (and 11–14) + genitive plural. So 21 книга, 22 книги, 25 книг. The same rule gives год/года/лет for years.',
    categories: ['quantity.amount'],
    register: 'neutral',
    examples: [
      { jp: 'У меня два брата и одна сестра.', en: 'I have two brothers and one sister.' },
      { jp: 'Мне двадцать пять лет.', en: 'I am twenty-five years old.' },
    ],
  },
  {
    id: 'ru-a1-potomu-chto',
    lang: 'ru',
    level: 'A1',
    title: 'потому что',
    meaning: 'because',
    structure: 'clause + , потому что + clause',
    explanation:
      'Gives the reason after the main clause. A question about the reason is почему?. At the start of a sentence Russian prefers так как (see B1).',
    categories: ['cause.reason'],
    register: 'neutral',
    examples: [
      { jp: 'Я не пришёл, потому что был болен.', en: 'I did not come because I was ill.' },
      { jp: 'Почему ты смеёшься? — Потому что это смешно.', en: 'Why are you laughing? — Because it is funny.' },
    ],
  },
  {
    id: 'ru-a1-i-a-no',
    lang: 'ru',
    level: 'A1',
    title: 'и / а / но',
    meaning: 'and / and (in contrast), whereas / but',
    structure: 'clause + , а / но + clause',
    explanation:
      'И joins similar things. А contrasts or compares two things without contradiction ("I am a student, and he is a teacher"). Но introduces something unexpected or contrary to the first clause ("but").',
    categories: ['contrast.opposition'],
    register: 'neutral',
    examples: [
      { jp: 'Я люблю чай, а мой друг любит кофе.', en: 'I like tea, and my friend likes coffee.' },
      { jp: 'Было холодно, но мы пошли гулять.', en: 'It was cold, but we went for a walk.' },
    ],
  },
  {
    id: 'ru-a1-imperative',
    lang: 'ru',
    level: 'A1',
    title: 'Imperative (читай / читайте)',
    meaning: 'do …! please do …',
    structure: 'present stem + -й / -и (+ -те for вы)',
    explanation:
      'Take the они-form of the present, drop the ending: after a vowel add -й (читают → читай), otherwise -и (говорят → говори). Add -те to address вы or to be polite. Пожалуйста softens the request.',
    categories: ['request.ask', 'volition.command'],
    register: 'neutral',
    examples: [
      { jp: 'Скажите, пожалуйста, где метро?', en: 'Could you tell me where the metro is, please?' },
      { jp: 'Подожди минуту!', en: 'Wait a minute!' },
    ],
  },
  {
    id: 'ru-a1-skolko-stoit',
    lang: 'ru',
    level: 'A1',
    title: 'Сколько стоит …?',
    meaning: 'How much does … cost?',
    structure: 'Сколько стоит + sg. noun / Сколько стоят + pl. noun',
    explanation:
      'Стоить agrees with the thing being priced. The answer uses the number rules for рубль: один рубль, два рубля, пять рублей.',
    categories: ['quantity.amount'],
    register: 'neutral',
    examples: [
      { jp: 'Сколько стоит этот билет?', en: 'How much is this ticket?' },
      { jp: 'Сколько стоят яблоки? — Сто рублей за килограмм.', en: 'How much are the apples? — A hundred roubles a kilo.' },
    ],
  },

  // —— A2 ——
  {
    id: 'ru-a2-aspect',
    lang: 'ru',
    level: 'A2',
    title: 'Aspect: imperfective vs perfective',
    meaning: 'process or repetition vs one completed result',
    structure: 'делать → сделать, писать → написать, решать → решить',
    explanation:
      'Most verbs come in pairs. The imperfective names an activity, a process or a repeated action (Я писал письмо — I was writing / used to write). The perfective names a single action seen as a whole, usually with a result (Я написал письмо — I wrote it, it is done). Perfective verbs have no present tense: their conjugated form is the future (напишу — I will write).',
    categories: ['time.completion'],
    register: 'neutral',
    examples: [
      { jp: 'Вчера я весь вечер читал.', en: 'Yesterday I spent the whole evening reading.' },
      { jp: 'Я прочитал эту книгу за два дня.', en: 'I read this book (through) in two days.' },
      { jp: 'Я позвоню тебе завтра.', en: 'I will call you tomorrow.' },
    ],
  },
  {
    id: 'ru-a2-idti-khodit',
    lang: 'ru',
    level: 'A2',
    title: 'идти / ходить',
    meaning: 'to go on foot (one way / round trips, habit)',
    structure: 'идти (иду, идёшь) — one direction now; ходить (хожу, ходишь) — repeated, general or there-and-back',
    explanation:
      'Motion verbs come in two forms. Идти is one trip in one direction, happening now or at a given moment. Ходить is movement in general, a habit, or a completed round trip (Вчера я ходил в театр = I went and came back).',
    categories: ['space.direction'],
    register: 'neutral',
    examples: [
      { jp: 'Сейчас я иду в библиотеку.', en: 'I am on my way to the library now.' },
      { jp: 'Я хожу в бассейн по субботам.', en: 'I go to the pool on Saturdays.' },
      { jp: 'Вчера мы ходили в кино.', en: 'Yesterday we went to the cinema.' },
    ],
  },
  {
    id: 'ru-a2-ekhat-ezdit',
    lang: 'ru',
    level: 'A2',
    title: 'ехать / ездить + на + transport',
    meaning: 'to go by vehicle',
    structure: 'ехать / ездить + на + prepositional (на автобусе, на поезде)',
    explanation:
      'The vehicle pair works like идти/ходить: ехать for one trip in one direction, ездить for habit and round trips. The means of transport takes на + prepositional; on foot is пешком.',
    categories: ['method.means', 'space.direction'],
    register: 'neutral',
    examples: [
      { jp: 'Я еду на работу на метро.', en: 'I am going to work by metro.' },
      { jp: 'Летом мы ездили в Петербург на поезде.', en: 'In the summer we went to St Petersburg by train.' },
    ],
  },
  {
    id: 'ru-a2-s-instrumental',
    lang: 'ru',
    level: 'A2',
    title: 'с + instrumental',
    meaning: 'with (together with)',
    structure: 'с + instrumental (-ом/-ем, -ой/-ей, -ами/-ями)',
    explanation:
      'С with the instrumental means "together with": кофе с молоком, я гулял с другом. The bare instrumental, without с, names the tool: писать ручкой, есть ложкой.',
    categories: ['method.means'],
    register: 'neutral',
    examples: [
      { jp: 'Я пью чай с лимоном.', en: 'I drink tea with lemon.' },
      { jp: 'Она пишет письмо ручкой.', en: 'She is writing the letter with a pen.' },
    ],
  },
  {
    id: 'ru-a2-rabotat-kem',
    lang: 'ru',
    level: 'A2',
    title: 'работать / стать / быть + instrumental',
    meaning: 'to work as / to become / to be (in the past, future)',
    structure: 'работать, стать, быть (past/future), хотеть стать + instrumental',
    explanation:
      'Professions and roles after these verbs go into the instrumental: работать врачом, стать инженером. With быть the instrumental is used in the past and future, while the present has no verb and the nominative (see A1).',
    categories: ['state.change'],
    register: 'neutral',
    examples: [
      { jp: 'Мой отец работает учителем.', en: 'My father works as a teacher.' },
      { jp: 'Она хочет стать архитектором.', en: 'She wants to become an architect.' },
      { jp: 'В детстве я был очень тихим.', en: 'As a child I was very quiet.' },
    ],
  },
  {
    id: 'ru-a2-mnogo-malo',
    lang: 'ru',
    level: 'A2',
    title: 'много / мало / несколько + genitive',
    meaning: 'a lot of / few, little / several',
    structure: 'quantity word + genitive plural (countable) or genitive singular (mass)',
    explanation:
      'Words of quantity take the genitive: много книг, мало времени, несколько дней. Countable nouns go into the genitive plural, uncountable ones into the genitive singular.',
    categories: ['quantity.amount'],
    register: 'neutral',
    examples: [
      { jp: 'В городе много музеев.', en: 'There are a lot of museums in the city.' },
      { jp: 'У меня мало времени.', en: 'I have little time.' },
    ],
  },
  {
    id: 'ru-a2-age',
    lang: 'ru',
    level: 'A2',
    title: 'Мне … лет (age)',
    meaning: 'I am … years old',
    structure: 'dative + number + год / года / лет',
    explanation:
      'Age is expressed impersonally: the person is in the dative, and the number chooses год (1, 21 …), года (2–4, 22–24 …) or лет (5–20, 25 …). Сколько тебе лет? asks it.',
    categories: ['state.description'],
    register: 'neutral',
    examples: [
      { jp: 'Сколько лет вашей дочери? — Ей три года.', en: 'How old is your daughter? — She is three.' },
      { jp: 'Моему деду восемьдесят один год.', en: 'My grandfather is eighty-one.' },
    ],
  },
  {
    id: 'ru-a2-comparative',
    lang: 'ru',
    level: 'A2',
    title: 'Comparative (-ее, больше, лучше …, чем)',
    meaning: 'more …, …-er than',
    structure: 'adjective stem + -ее (интереснее) / irregular (больше, меньше, лучше, хуже) + чем + nominative, or + genitive',
    explanation:
      'The short comparative does not change for gender or number: Этот дом выше. The thing compared follows чем (nominative) or stands in the genitive without чем: Он старше брата = Он старше, чем брат.',
    categories: ['comparison.compare'],
    register: 'neutral',
    examples: [
      { jp: 'Сегодня теплее, чем вчера.', en: 'It is warmer today than yesterday.' },
      { jp: 'Моя сестра старше меня.', en: 'My sister is older than me.' },
      { jp: 'Лучше поздно, чем никогда.', en: 'Better late than never.' },
    ],
  },
  {
    id: 'ru-a2-samyi',
    lang: 'ru',
    level: 'A2',
    title: 'самый + adjective',
    meaning: 'the most …, the …-est',
    structure: 'самый / самая / самое / самые + adjective (agreeing)',
    explanation:
      'The superlative is formed with самый, which agrees with the noun like any adjective. "Of all" is из + genitive: самый высокий из нас.',
    categories: ['degree.extreme'],
    register: 'neutral',
    examples: [
      { jp: 'Это самая длинная река в Европе.', en: 'This is the longest river in Europe.' },
      { jp: 'Он самый умный студент в группе.', en: 'He is the cleverest student in the group.' },
    ],
  },
  {
    id: 'ru-a2-esli',
    lang: 'ru',
    level: 'A2',
    title: 'если (real condition)',
    meaning: 'if',
    structure: 'Если + clause (often future), + main clause',
    explanation:
      'A real or likely condition. Unlike English, Russian puts the future in both halves when the condition is about the future: Если будет дождь, мы останемся дома. For an unreal condition see если бы (B1).',
    categories: ['condition.general'],
    register: 'neutral',
    examples: [
      { jp: 'Если будет время, я тебе помогу.', en: 'If I have time, I will help you.' },
      { jp: 'Если хочешь, пойдём вместе.', en: 'If you want, let us go together.' },
    ],
  },
  {
    id: 'ru-a2-kogda',
    lang: 'ru',
    level: 'A2',
    title: 'когда (time clause)',
    meaning: 'when',
    structure: 'Когда + clause, + main clause',
    explanation:
      'Introduces the time of the main action. As with если, a future event takes the future tense: Когда я закончу работу, я позвоню. Aspect shows whether the actions overlap (imperfective) or follow one another (perfective).',
    categories: ['time.point'],
    register: 'neutral',
    examples: [
      { jp: 'Когда я был маленьким, я жил в деревне.', en: 'When I was little, I lived in a village.' },
      { jp: 'Когда закончишь, скажи мне.', en: 'When you finish, tell me.' },
    ],
  },
  {
    id: 'ru-a2-chtoby-inf',
    lang: 'ru',
    level: 'A2',
    title: 'чтобы + infinitive (purpose)',
    meaning: 'in order to',
    structure: 'main clause + , чтобы + infinitive',
    explanation:
      'States the purpose when the subject of both actions is the same. After verbs of motion the purpose can be a bare infinitive: Я пришёл поговорить. When the subjects differ, чтобы takes the past tense (see B1).',
    categories: ['purpose.goal'],
    register: 'neutral',
    examples: [
      { jp: 'Я учу русский, чтобы читать Толстого.', en: 'I am learning Russian in order to read Tolstoy.' },
      { jp: 'Он встал рано, чтобы не опоздать.', en: 'He got up early so as not to be late.' },
    ],
  },
  {
    id: 'ru-a2-reflexive',
    lang: 'ru',
    level: 'A2',
    title: 'Reflexive verbs in -ся / -сь',
    meaning: 'oneself / each other / intransitive use',
    structure: 'verb + -ся (after a consonant) / -сь (after a vowel)',
    explanation:
      'The particle -ся makes a verb reflexive (одеваться — to get dressed), reciprocal (встречаться — to meet each other), or simply intransitive (начинаться — to begin). Some verbs exist only with -ся: смеяться, нравиться.',
    categories: ['voice.form'],
    register: 'neutral',
    examples: [
      { jp: 'Урок начинается в девять.', en: 'The lesson starts at nine.' },
      { jp: 'Мы познакомились в университете.', en: 'We met at university.' },
    ],
  },
  {
    id: 'ru-a2-uzhe-eshche',
    lang: 'ru',
    level: 'A2',
    title: 'уже / ещё / ещё не / уже не',
    meaning: 'already / still, yet / not yet / no longer',
    structure: 'уже / ещё + verb; ещё не, уже не + verb',
    explanation:
      'Уже marks something that has happened or begun; ещё something still going on or still to come. With не they turn into "not yet" (ещё не) and "no longer" (уже не).',
    categories: ['time.completion'],
    register: 'neutral',
    examples: [
      { jp: 'Ты уже поел? — Нет, ещё не поел.', en: 'Have you eaten already? — No, not yet.' },
      { jp: 'Он уже не живёт здесь.', en: 'He no longer lives here.' },
    ],
  },
  {
    id: 'ru-a2-dolzhen',
    lang: 'ru',
    level: 'A2',
    title: 'должен + infinitive',
    meaning: 'must, have to (duty, expectation)',
    structure: 'должен / должна / должно / должны + infinitive',
    explanation:
      'A personal construction: должен agrees with the subject in gender and number. It expresses obligation, or a strong expectation (Он должен скоро прийти — he should be here soon). Past: должен был.',
    categories: ['obligation.necessity'],
    register: 'neutral',
    examples: [
      { jp: 'Я должна закончить работу сегодня.', en: 'I have to finish the work today.' },
      { jp: 'Вы должны были предупредить нас.', en: 'You should have warned us.' },
    ],
  },
  {
    id: 'ru-a2-moch-umet',
    lang: 'ru',
    level: 'A2',
    title: 'мочь / уметь',
    meaning: 'can (be able) / can (know how)',
    structure: 'могу, можешь, может … / умею, умеешь … + infinitive',
    explanation:
      'Мочь is ability or possibility in a situation (I can come tomorrow). Уметь is a learned skill (I can swim). Мочь changes its stem: могу, можешь, могут.',
    categories: ['possibility.ability'],
    register: 'neutral',
    examples: [
      { jp: 'Ты умеешь плавать?', en: 'Can you swim?' },
      { jp: 'Извини, я не могу прийти завтра.', en: 'Sorry, I cannot come tomorrow.' },
    ],
  },
  {
    id: 'ru-a2-kotoryi',
    lang: 'ru',
    level: 'A2',
    title: 'который (relative clause)',
    meaning: 'who, which, that',
    structure: 'noun + , который (gender and number of the noun; case of its role in the clause)',
    explanation:
      'Который takes its gender and number from the noun it refers to, and its case from its role inside the relative clause: книга, которую я читаю (accusative, object of читаю). The clause is always set off by commas.',
    categories: ['discourse.connection'],
    register: 'neutral',
    examples: [
      { jp: 'Это друг, который живёт в Сочи.', en: 'This is the friend who lives in Sochi.' },
      { jp: 'Фильм, который мы смотрели, был скучным.', en: 'The film we watched was boring.' },
    ],
  },

  // —— B1 ——
  {
    id: 'ru-b1-esli-by',
    lang: 'ru',
    level: 'B1',
    title: 'если бы … , … бы (unreal condition)',
    meaning: 'if … were / had …, … would …',
    structure: 'Если бы + past tense, + past tense + бы',
    explanation:
      'The conditional mood is the past tense plus бы, and it has no tense of its own: the same form covers "if I had time (now)" and "if I had had time (then)". Context decides.',
    categories: ['condition.counterfactual'],
    register: 'neutral',
    examples: [
      { jp: 'Если бы у меня были деньги, я бы купил дом.', en: 'If I had money, I would buy a house.' },
      { jp: 'Если бы ты позвонил, я бы пришла.', en: 'If you had called, I would have come.' },
    ],
  },
  {
    id: 'ru-b1-chtoby-past',
    lang: 'ru',
    level: 'B1',
    title: 'хотеть, чтобы / просить, чтобы + past tense',
    meaning: 'want someone to …, ask someone to …',
    structure: 'verb of wish/request + , чтобы + subject + past tense',
    explanation:
      'When the person who wants and the person who acts differ, Russian uses чтобы with the past tense (the form of the subjunctive), whatever the time: Я хочу, чтобы ты пришёл завтра.',
    categories: ['request.ask', 'volition.desire'],
    register: 'neutral',
    examples: [
      { jp: 'Я хочу, чтобы ты был счастлив.', en: 'I want you to be happy.' },
      { jp: 'Мама попросила, чтобы мы вернулись до десяти.', en: 'Mum asked us to be back by ten.' },
    ],
  },
  {
    id: 'ru-b1-passive-participle',
    lang: 'ru',
    level: 'B1',
    title: 'был построен (short passive participle)',
    meaning: 'was built, is written',
    structure: 'быть + short passive participle (-н, -т, -ен) + (instrumental of the agent)',
    explanation:
      'The passive of a perfective verb uses the short past passive participle, which agrees with the subject: дом построен, книга написана, окна открыты. The doer, if named, is in the instrumental.',
    categories: ['voice.passive'],
    register: 'neutral',
    examples: [
      { jp: 'Этот собор был построен в шестнадцатом веке.', en: 'This cathedral was built in the sixteenth century.' },
      { jp: 'Магазин закрыт.', en: 'The shop is closed.' },
      { jp: 'Роман написан молодым автором.', en: 'The novel was written by a young author.' },
    ],
  },
  {
    id: 'ru-b1-deeprichastie',
    lang: 'ru',
    level: 'B1',
    title: 'Verbal adverbs: читая / прочитав',
    meaning: 'while doing / having done',
    structure: 'imperfective present stem + -я/-а; perfective infinitive stem + -в',
    explanation:
      'A verbal adverb adds a second action by the same subject. From an imperfective verb it means "while …" (читая), from a perfective one "having …" (прочитав). It is common in writing and careful speech; in conversation a когда-clause is more usual.',
    categories: ['time.simultaneous', 'time.sequence'],
    register: 'literary',
    examples: [
      { jp: 'Слушая музыку, он готовил ужин.', en: 'Listening to music, he cooked dinner.' },
      { jp: 'Закончив работу, она пошла домой.', en: 'Having finished work, she went home.' },
    ],
  },
  {
    id: 'ru-b1-khotya',
    lang: 'ru',
    level: 'B1',
    title: 'хотя',
    meaning: 'although, even though',
    structure: 'Хотя + clause, (но) + main clause',
    explanation:
      'Introduces a concession. Colloquially the main clause may still begin with но. In speech хотя can also correct oneself at the end of a sentence: …, хотя нет.',
    categories: ['contrast.concession'],
    register: 'neutral',
    examples: [
      { jp: 'Хотя было поздно, мы продолжали работать.', en: 'Although it was late, we kept working.' },
      { jp: 'Он пришёл, хотя и был занят.', en: 'He came, even though he was busy.' },
    ],
  },
  {
    id: 'ru-b1-nesmotrya-na',
    lang: 'ru',
    level: 'B1',
    title: 'несмотря на + accusative',
    meaning: 'despite, in spite of',
    structure: 'несмотря на + accusative / несмотря на то, что + clause',
    explanation:
      'A prepositional concession. With a whole clause it becomes несмотря на то, что … It is more formal than хотя.',
    categories: ['contrast.concession'],
    register: 'neutral',
    examples: [
      { jp: 'Несмотря на дождь, мы пошли гулять.', en: 'Despite the rain, we went for a walk.' },
      { jp: 'Несмотря на то что он устал, он помог нам.', en: 'Even though he was tired, he helped us.' },
    ],
  },
  {
    id: 'ru-b1-tak-kak-poetomu',
    lang: 'ru',
    level: 'B1',
    title: 'так как / поэтому',
    meaning: 'since, as / therefore, so',
    structure: 'Так как + reason, + result; reason, + поэтому + result',
    explanation:
      'Так как gives a reason and, unlike потому что, can open the sentence. Поэтому introduces the consequence. They answer the same question from opposite ends.',
    categories: ['cause.reason', 'cause.result'],
    register: 'neutral',
    examples: [
      { jp: 'Так как было холодно, мы остались дома.', en: 'Since it was cold, we stayed at home.' },
      { jp: 'Я опоздал на автобус, поэтому пришёл пешком.', en: 'I missed the bus, so I came on foot.' },
    ],
  },
  {
    id: 'ru-b1-negative-pronouns',
    lang: 'ru',
    level: 'B1',
    title: 'никто / ничего / никогда + не',
    meaning: 'nobody, nothing, never',
    structure: 'ни-word + не + verb (double negation)',
    explanation:
      'Negative pronouns and adverbs always go with не before the verb: Я никого не видел — I did not see anybody. With a preposition, ни- splits off: ни с кем, ни о чём.',
    categories: ['emphasis.negation'],
    register: 'neutral',
    examples: [
      { jp: 'Я ничего не понимаю.', en: 'I do not understand anything.' },
      { jp: 'Он никогда не опаздывает.', en: 'He is never late.' },
      { jp: 'Она ни с кем не говорила.', en: 'She did not talk to anyone.' },
    ],
  },
  {
    id: 'ru-b1-ni-ni',
    lang: 'ru',
    level: 'B1',
    title: 'ни … ни …',
    meaning: 'neither … nor …',
    structure: 'не + verb + ни + X + ни + Y',
    explanation:
      'Lists two negated items. The verb keeps its не, and after a negated verb the items are often in the genitive: У меня нет ни времени, ни денег.',
    categories: ['emphasis.negation', 'examples.listing'],
    register: 'neutral',
    examples: [
      { jp: 'Я не люблю ни чай, ни кофе.', en: 'I like neither tea nor coffee.' },
      { jp: 'У него нет ни брата, ни сестры.', en: 'He has neither a brother nor a sister.' },
    ],
  },
  {
    id: 'ru-b1-reported-speech',
    lang: 'ru',
    level: 'B1',
    title: 'Reported speech: сказал, что … / спросил, … ли …',
    meaning: 'said that … / asked whether …',
    structure: 'сказал, что + original tense; спросил, + key word + ли + …',
    explanation:
      'Russian keeps the tense of the original words: Он сказал, что устал ("I am tired" → he said he was tired, in the past only because the original was). A yes/no question is reported with ли after the word in focus: Она спросила, приду ли я.',
    categories: ['evidence.hearsay', 'method.communication'],
    register: 'neutral',
    examples: [
      { jp: 'Он сказал, что приедет в пятницу.', en: 'He said he would come on Friday.' },
      { jp: 'Я спросил, знает ли она адрес.', en: 'I asked whether she knew the address.' },
    ],
  },
  {
    id: 'ru-b1-prefixed-motion',
    lang: 'ru',
    level: 'B1',
    title: 'Prefixed motion verbs: при-, у-, вы-, в-, пере-',
    meaning: 'arrive, leave, go out, go in, cross',
    structure: 'prefix + идти / ходить, ехать / ездить (приходить — прийти, уходить — уйти …)',
    explanation:
      'A prefix gives the direction, and the two motion forms turn into an ordinary aspect pair: приходить (impf.) — прийти (pf.) "to arrive"; уезжать — уехать "to leave (by vehicle)". Common prefixes: при- arrival, у- departure, вы- out, в- in, пере- across, до- as far as.',
    categories: ['space.direction'],
    register: 'neutral',
    examples: [
      { jp: 'Когда ты придёшь домой?', en: 'When will you get home?' },
      { jp: 'Он уехал в командировку.', en: 'He has left on a business trip.' },
      { jp: 'Мы перешли улицу.', en: 'We crossed the street.' },
    ],
  },
  {
    id: 'ru-b1-kazhetsya',
    lang: 'ru',
    level: 'B1',
    title: 'кажется / по-моему / наверное',
    meaning: 'it seems / in my opinion / probably',
    structure: 'parenthetical word + , clause (set off by commas)',
    explanation:
      'Parenthetical words soften a statement or mark it as an opinion or a guess. They stand anywhere in the sentence and are separated by commas. Мне кажется, что … is a full clause meaning "it seems to me that …".',
    categories: ['judgment.conjecture'],
    register: 'neutral',
    examples: [
      { jp: 'Кажется, пошёл дождь.', en: 'It seems it has started to rain.' },
      { jp: 'По-моему, это хорошая идея.', en: 'I think this is a good idea.' },
      { jp: 'Он, наверное, уже спит.', en: 'He is probably asleep already.' },
    ],
  },
  {
    id: 'ru-b1-stoit',
    lang: 'ru',
    level: 'B1',
    title: 'стоит / не стоит + infinitive',
    meaning: 'it is worth …, you should / it is not worth …',
    structure: '(dative) + стоит / не стоит + infinitive',
    explanation:
      'An impersonal way to advise: Вам стоит отдохнуть — you ought to rest. The negative не стоит discourages, and on its own (Не стоит!) answers a thank-you: "don’t mention it".',
    categories: ['request.advice'],
    register: 'neutral',
    examples: [
      { jp: 'Этот фильм стоит посмотреть.', en: 'This film is worth seeing.' },
      { jp: 'Не стоит волноваться.', en: 'There is no need to worry.' },
    ],
  },
  {
    id: 'ru-b1-chem-tem',
    lang: 'ru',
    level: 'B1',
    title: 'чем …, тем …',
    meaning: 'the more …, the more …',
    structure: 'Чем + comparative + clause, тем + comparative + clause',
    explanation:
      'Links two changes that grow together. Both halves carry a comparative.',
    categories: ['comparison.proportion'],
    register: 'neutral',
    examples: [
      { jp: 'Чем больше читаешь, тем легче понимать.', en: 'The more you read, the easier it is to understand.' },
      { jp: 'Чем раньше начнём, тем раньше закончим.', en: 'The sooner we start, the sooner we finish.' },
    ],
  },
  {
    id: 'ru-b1-dative-impersonal',
    lang: 'ru',
    level: 'B1',
    title: 'мне холодно / мне скучно (dative + adverb)',
    meaning: 'I am cold / I am bored',
    structure: 'dative + adverb in -о',
    explanation:
      'Feelings and physical states are often impersonal: the person is in the dative and the state is an adverb. Past: мне было холодно; future: мне будет скучно.',
    categories: ['emotion.feeling', 'state.description'],
    register: 'neutral',
    examples: [
      { jp: 'Мне холодно, закрой окно.', en: 'I am cold, close the window.' },
      { jp: 'Детям было весело.', en: 'The children were having fun.' },
    ],
  },
];

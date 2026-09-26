import type { GrammarExample } from '../types';
import type { AuthoredGrammarContent } from '../authoredContent';

const ex = (jp: string, en: string, reading?: string): GrammarExample =>
  reading ? { jp, reading, en } : { jp, en };

/** Authored content for hollow N1 supplement records (see authoredContent.ts). */
export const AUTHORED_N1: Record<string, AuthoredGrammarContent> = {
  'n1m-g-0f01e6': {
    meaning: 'even if; even supposing ~; even for ~ (as well)',
    structure: 'Plain form + と したところで（と したって）／ N + に したところで（に したって）',
    explanation:
      'After a clause, としたところで supposes something and says it would not change the outcome: 今出発したとしたって間に合わない. After a noun, にしたところで means "even for N, from N’s position too": 社長にしたところで答えはわからない. したって is the colloquial form. ても is the plain concessive; these add that the effort or party is no exception.',
    functions: ['concessions', 'condition-assumption'],
    examples: [
      ex('今から 出発したと したって、もう 間に合わないだろう。', 'Even if we set off now, we probably will not make it.', 'いまから しゅっぱつしたと したって、もう まにあわないだろう。'),
      ex('社長に したところで、この 問題の 解決策は わからない はずだ。', 'Even the president would not know how to solve this problem.', 'しゃちょうに したところで、この もんだいの かいけつさくは わからない はずだ。'),
    ],
  },
  'n1m-g-2aec34': {
    meaning: 'while (remaining) ~; as ~ (unchanged state)',
    structure: 'N／V-ます stem + ながらに（ながらの + N）',
    explanation:
      'ながらに describes a state that stays the same while something happens, mostly in set phrases: 涙ながらに "in tears", 生まれながらに "from birth", 昔ながらの "old-fashioned, as of old". 居ながらにして means "without leaving home". It is not the simultaneous-action ながら; it describes a lasting condition.',
    functions: ['status', 'continuity'],
    examples: [
      ex('彼女は 涙ながらに 事情を 語った。', 'She explained what had happened, in tears.', 'かのじょは なみだながらに じじょうを かたった。'),
      ex('この 町には、昔ながらの 町並みが 残って いる。', 'This town still has streets that look just as they did long ago.', 'この まちには、むかしながらの まちなみが のこって いる。'),
    ],
  },
  'n1m-g-071752': {
    meaning: 'nothing beats ~; the best thing is to ~',
    structure: 'V-dict／V-ない／N + に 限る（かぎる）',
    explanation:
      'に限る gives the speaker’s personal verdict that something is the best choice: 疲れたときは寝るに限る. It is subjective, so it suits advice from experience rather than objective facts. に限って ("only when; of all times") and に限り ("limited to") are different patterns.',
    functions: ['evaluate', 'advice'],
    examples: [
      ex('疲れた ときは、早く 寝るに 限る。', 'When you are tired, nothing beats an early night.', 'つかれた ときは、はやく ねるに かぎる。'),
      ex('夏は やっぱり 冷たい 麦茶に 限る。', 'In summer, nothing beats cold barley tea.', 'なつは やっぱり つめたい むぎちゃに かぎる。'),
    ],
  },
  'n1m-g-85b300': {
    meaning: 'on the assumption that ~; treating (it) as ~',
    structure: 'Plain form + もの と して',
    explanation:
      'ものとして sets a working assumption on which to act, typical of rules and plans: 連絡がない場合は欠席するものとして扱う "if we hear nothing, we will treat you as absent". It is formal. と仮定して is a more explicit "supposing".',
    functions: ['condition-assumption', 'premise'],
    examples: [
      ex('連絡が ない 場合は、欠席する ものと して 扱います。', 'If we do not hear from you, we will assume you are not attending.', 'れんらくが ない ばあいは、けっせきする ものと して あつかいます。'),
      ex('予算は 増えない ものと して、計画を 立て直した。', 'We redrew the plan on the assumption that the budget will not grow.', 'よさんは ふえない ものと して、けいかくを たてなおした。'),
    ],
  },
  'n1m-g-0666a2': {
    meaning: 'without ~; cannot ~ without ~',
    structure: 'N + なしに（は）／ N + なしで（は）',
    explanation:
      'なしに means "without N" and is more formal than なしで: 断りなしに入ってきた "came in without asking". なしには〜ない says N is indispensable: 努力なしには成功はない. For verbs, ことなく or ずに is used instead.',
    functions: ['negative', 'condition-requirement'],
    examples: [
      ex('彼は 断り なしに 部屋に 入って きた。', 'He came into the room without asking.', 'かれは ことわり なしに へやに はいって きた。'),
      ex('皆さんの 協力 なしには、この 成功は ありえなかった。', 'This success would not have been possible without your help.', 'みなさんの きょうりょく なしには、この せいこうは ありえなかった。'),
    ],
  },
  'n1m-g-4e74e5': {
    meaning: 'rather than (do something distasteful), ~',
    structure: 'V-dict + くらいなら（ぐらいなら）、+ 〜ほうが ましだ／〜ほうが いい',
    explanation:
      'くらいなら names an option the speaker finds so unpleasant that anything else is better: 謝るくらいなら辞めたほうがましだ. The second half usually ends in ほうがましだ or ほうがいい. より simply compares; くらいなら shows strong distaste for the first option.',
    functions: ['compare', 'condition'],
    examples: [
      ex('あんな 人に 謝る くらいなら、会社を 辞めた ほうが ましだ。', "I'd rather quit the company than apologise to someone like him.", 'あんな ひとに あやまる くらいなら、かいしゃを やめた ほうが ましだ。'),
      ex('途中で やめる ぐらいなら、最初から やらない ほうが いい。', "If you're going to give up halfway, it's better not to start at all.", 'とちゅうで やめる ぐらいなら、さいしょから やらない ほうが いい。'),
    ],
  },
  'n1m-g-0fd538': {
    meaning: 'as of ~ (and no longer); with ~ as the last time',
    structure: 'N（本日・今年 など）+ を 限りに ／ N + 限りで',
    explanation:
      'を限りに marks the point at which something ends: 本日を限りに閉店いたします "we close as of today". It appears in announcements about retiring, closing or quitting. 声を限りに is an idiom meaning "at the top of one’s voice". をもって is a similar formal "as of".',
    functions: ['time', 'finish'],
    examples: [
      ex('本日を 限りに、この 店は 閉店いたします。', 'This shop will close its doors as of today.', 'ほんじつを かぎりに、この みせは へいてんいたします。'),
      ex('彼は 今シーズンを 限りに 引退する ことを 発表した。', 'He announced that he will retire at the end of this season.', 'かれは こんしーずんを かぎりに いんたいする ことを はっぴょうした。'),
    ],
  },
  'n1m-g-ec6c8c': {
    meaning: 'thus; in this way (and so it was that)',
    structure: 'かくして + clause（結果）',
    explanation:
      'かくして is a literary "and thus", summing up a story or process and stating how it ended: かくして長い戦いは終わった. こうして is the ordinary equivalent in speech and writing. かくして sounds dramatic and belongs to narration, history and speeches.',
    functions: ['result', 'conclude'],
    examples: [
      ex('かくして、長い 戦いは 終わりを 告げた。', 'And thus the long war came to an end.', 'かくして、ながい たたかいは おわりを つげた。'),
      ex('かくして 二人は 再び 出会う ことに なった。', 'And so it was that the two met again.', 'かくして ふたりは ふたたび であう ことに なった。'),
    ],
  },
  'n1m-g-7bf23b': {
    meaning: 'has never (once) ~; ~ never happens',
    structure: 'V-た + ためしが ない',
    explanation:
      'ためしがない says something has never once happened, usually as a complaint or criticism: 彼が時間どおりに来たためしがない. ことがない simply reports lack of experience; ためしがない implies "and I don’t expect it to change". It is conversational.',
    functions: ['negative', 'experience'],
    examples: [
      ex('彼が 約束の 時間に 来た ためしが ない。', 'He has never once turned up on time.', 'かれが やくそくの じかんに きた ためしが ない。'),
      ex('宝くじを 毎年 買うが、当たった ためしが ない。', 'I buy a lottery ticket every year, but I have never won.', 'たからくじを まいとし かうが、あたった ためしが ない。'),
    ],
  },
  'n1m-g-c96517': {
    meaning: 'excessively; unduly; indiscriminately',
    structure: 'やたらに（やたらと／やたら）+ V／A',
    explanation:
      'やたらに stresses that something happens far too much or too often, without good reason: やたらに喉が渇く "I am unusually thirsty". むやみに focuses on acting without thinking; やたら focuses on the excess. むやみやたらに combines both.',
    functions: ['level', 'describe'],
    examples: [
      ex('最近、やたらに 喉が 渇く。', 'Lately I have been unusually thirsty.', 'さいきん、やたらに のどが かわく。'),
      ex('知らない 人に やたらと 個人情報を 教えては いけない。', 'You should not hand out personal information to strangers.', 'しらない ひとに やたらと こじんじょうほうを おしえては いけない。'),
    ],
  },
  'n1m-g-38d930': {
    meaning: 'recklessly; without thinking; indiscriminately',
    structure: 'むやみに（むやみと）+ V',
    explanation:
      'むやみに describes acting rashly, without considering the consequences, and usually appears in warnings: むやみに薬を飲むのはよくない. やたらに is about excessive amount or frequency; むやみに is about the lack of judgement.',
    functions: ['describe', 'warning'],
    examples: [
      ex('むやみに 薬を 飲むのは 体に よくない。', 'Taking medicine without good reason is bad for you.', 'むやみに くすりを のむのは からだに よくない。'),
      ex('知らない サイトの リンクを むやみに 開かないで ください。', 'Please do not carelessly open links from sites you do not know.', 'しらない さいとの りんくを むやみに ひらかないで ください。'),
    ],
  },
  'n1m-g-334538': {
    meaning: 'that must not (cannot) be ~ (before a noun)',
    structure: 'V-dict + べからざる + N（する → すべからざる）',
    explanation:
      'べからざる is the noun-modifying form of べからず and describes something that must not or cannot be done: 欠くべからざる "indispensable", 許すべからざる "unforgivable". It is literary and mostly survives in these set phrases. べからず itself ends a sentence, as on old signs.',
    functions: ['ban', 'necessary-obligation'],
    examples: [
      ex('信頼は 商売に 欠くべからざる ものだ。', 'Trust is indispensable in business.', 'しんらいは しょうばいに かくべからざる ものだ。'),
      ex('弱い 者を いじめるのは 許すべからざる 行為だ。', 'Bullying the weak is an unforgivable act.', 'よわい ものを いじめるのは ゆるすべからざる こういだ。'),
    ],
  },
  'n1m-g-de0cdf': {
    meaning: 'each (individual) ~; ~ by ~',
    structure: 'その + N + その + N（人・日・時 など）',
    explanation:
      'Repeating その + noun treats each case separately: その日その日 "each day as it comes", その人その人 "each individual person". It stresses that the approach must fit every case. それぞれ is a neutral "each", without the one-by-one feel.',
    functions: ['related-respectively'],
    examples: [
      ex('その 日 その 日を 大切に 生きたい。', 'I want to cherish each day as it comes.', 'その ひ その ひを たいせつに いきたい。'),
      ex('教え方は、その 子 その 子に 合わせる べきだ。', 'Teaching should be tailored to each individual child.', 'おしえかたは、その こ その こに あわせる べきだ。'),
    ],
  },
  'n1m-g-6f8b36': {
    meaning: 'remain without ~ing; still not ~',
    structure: 'V-ない + で いる ／ V-ない stem + ずに いる',
    explanation:
      'ないでいる / ずにいる describes a continuing state of not doing something, often because one cannot bring oneself to: 本当のことを言えずにいる. ていない simply says something has not happened; ずにいる emphasises the ongoing hesitation or inaction. ずにいる is slightly more written.',
    functions: ['continuity', 'negative'],
    examples: [
      ex('友達に 本当の ことを 言えずに いる。', 'I still have not been able to tell my friend the truth.', 'ともだちに ほんとうの ことを いえずに いる。'),
      ex('彼女は まだ 事故の ことを 知らないで いる。', 'She still does not know about the accident.', 'かのじょは まだ じこの ことを しらないで いる。'),
    ],
  },
  'n1m-g-50fafc': {
    meaning: 'to reach; to lead to; to come to (a conclusion)',
    structure: 'N／V-dict + に 至る（いたる・いたった）',
    explanation:
      'に至る says a process finally reached a serious or significant point: 合意に至った "an agreement was reached", 死に至る病. It is formal. に至っては singles out an extreme case, and に至るまで marks the far end of a range.',
    functions: ['reaching', 'result'],
    examples: [
      ex('両社は 長い 交渉の 末、合意に 至った。', 'After long negotiations, the two companies reached an agreement.', 'りょうしゃは ながい こうしょうの すえ、ごういに いたった。'),
      ex('小さな 誤解が 大きな 事件に 至る ことも ある。', 'A small misunderstanding can sometimes lead to a major incident.', 'ちいさな ごかいが おおきな じけんに いたる ことも ある。'),
    ],
  },
  'n1m-g-a2e53c': {
    meaning: 'never cease to ~ (hope, love, pray)',
    structure: 'V-て + やまない（やみません）',
    explanation:
      'てやまない expresses a deep, lasting feeling, with verbs such as 願う, 祈る, 愛する, 期待する: ご健康を願ってやみません. It belongs to speeches, letters and formal writing. Do not confuse it with the literal やまない "does not stop", as in 雨がやまない.',
    functions: ['feel', 'continuity'],
    examples: [
      ex('皆様の ご健康と ご活躍を 願って やみません。', 'I sincerely wish you all good health and success.', 'みなさまの ごけんこうと ごかつやくを ねがって やみません。'),
      ex('彼女は 生涯、故郷を 愛して やまなかった。', 'All her life she never stopped loving her hometown.', 'かのじょは しょうがい、こきょうを あいして やまなかった。'),
    ],
  },
  'n1m-g-f70fba': {
    meaning: 'whether or not (it is) ~',
    structure: 'N／な-adj + で あろうと なかろうと',
    explanation:
      'であろうとなかろうと says the conclusion holds either way: 学生であろうとなかろうと、規則は守る. It is formal. であれ〜であれ lists two different options; であろうとなかろうと pairs a thing with its negation.',
    functions: ['invariant'],
    examples: [
      ex('学生で あろうと なかろうと、規則は 守らなければ ならない。', 'Student or not, you must follow the rules.', 'がくせいで あろうと なかろうと、きそくは まもらなければ ならない。'),
      ex('本当で あろうと なかろうと、噂は すぐに 広まる。', 'True or not, rumours spread quickly.', 'ほんとうで あろうと なかろうと、うわさは すぐに ひろまる。'),
    ],
  },
  'n1m-g-06549b': {
    meaning: 'even in (a difficult situation) ~',
    structure: 'N（逆境・不況 など）+ に あっても',
    explanation:
      'にあっても says someone or something stays unaffected even in a harsh situation: どんな逆境にあっても笑顔を忘れない. It is formal and often admiring. でも is the plain "even"; にあっても stresses being placed in the situation.',
    functions: ['concessions', 'situation'],
    examples: [
      ex('彼は どんな 逆境に あっても、笑顔を 忘れなかった。', 'However hard things got, he never lost his smile.', 'かれは どんな ぎゃっきょうに あっても、えがおを わすれなかった。'),
      ex('不況に あっても、この 会社は 利益を 伸ばして いる。', 'Even in a recession, this company keeps increasing its profits.', 'ふきょうに あっても、この かいしゃは りえきを のばして いる。'),
    ],
  },
  'n1m-g-f25ae2': {
    meaning: 'as much as ~; fully ~ (or more)',
    structure: 'Number + counter（重さ・長さ・大きさ）+ から ある + N',
    explanation:
      'からある stresses that a weight, length or size is surprisingly large: 二十キロからある荷物 "a load weighing a good twenty kilos". For price, からする is used; for number of people, からの. It is emphatic and descriptive.',
    functions: ['amount', 'emphasize'],
    examples: [
      ex('彼は 二十キロから ある 荷物を 一人で 運んだ。', 'He carried a load weighing a good twenty kilos by himself.', 'かれは にじゅっきろから ある にもつを ひとりで はこんだ。'),
      ex('三メートルから ある 大蛇が 見つかった。', 'A huge snake fully three metres long was found.', 'さんめーとるから ある だいじゃが みつかった。'),
    ],
  },
  'n1m-g-2362af': {
    meaning: 'there is no need to ~; ~ is not warranted',
    structure: 'V-dict（驚く・非難する など）+ に（は）当たらない（あたらない）',
    explanation:
      'にはあたらない says a reaction such as surprise or blame is not called for: 驚くにはあたらない "it is nothing to be surprised about". It goes with verbs of emotion or judgement. までもない means "no need because it is obvious"; にはあたらない means "no need because it is not justified".',
    functions: ['negative', 'evaluate'],
    examples: [
      ex('子供の いたずらだ。そんなに 怒るには あたらない。', "It's just a child's prank. There's no need to get so angry.", 'こどもの いたずらだ。そんなに おこるには あたらない。'),
      ex('あれだけ 練習したのだから、優勝も 驚くには あたらない。', 'Given how much they practised, their win is nothing to be surprised about.', 'あれだけ れんしゅうしたのだから、ゆうしょうも おどろくには あたらない。'),
    ],
  },
  'n1m-g-1abc6e': {
    meaning: 'ought to ~; it would be only right to ~',
    structure: 'V-て + しかるべきだ ／ しかるべき + N',
    explanation:
      'てしかるべきだ says something would be the proper, natural thing, often implying it has not happened: もっと評価されてしかるべきだ "it deserves more recognition". It is formal. しかるべき before a noun means "appropriate": しかるべき手続き. べきだ is a more direct "should".',
    functions: ['advice', 'necessary-obligation'],
    examples: [
      ex('被害者には、十分な 補償が あって しかるべきだ。', 'The victims ought to receive proper compensation.', 'ひがいしゃには、じゅうぶんな ほしょうが あって しかるべきだ。'),
      ex('彼の 功績は、もっと 評価されて しかるべきだ。', 'His achievements deserve far more recognition.', 'かれの こうせきは、もっと ひょうかされて しかるべきだ。'),
    ],
  },
  'n1m-g-0f21db': {
    meaning: 'out of the question; outrageous',
    structure: 'N／V-dict（なんて・など）+ もっての ほかだ',
    explanation:
      'もってのほかだ condemns something as utterly unacceptable: 飲酒運転などもってのほかだ. It is a strong moral judgement, often with など or なんて before it. とんでもない is similar but broader, and can also be a modest reply.',
    functions: ['ban', 'criticize'],
    examples: [
      ex('飲酒運転など、もっての ほかだ。', 'Drink-driving is completely out of the question.', 'いんしゅうんてんなど、もっての ほかだ。'),
      ex('連絡も なしに 仕事を 休むなんて、もっての ほかだ。', 'Skipping work without even calling in is outrageous.', 'れんらくも なしに しごとを やすむなんて、もっての ほかだ。'),
    ],
  },
  'n1m-g-4b4840': {
    meaning: 'by means of ~; with ~; as of ~ (formal)',
    structure: 'N + を もって（を 以って）',
    explanation:
      'をもって has two formal uses. It marks a means: 書面をもってお知らせします "we will notify you in writing". With a time it marks an end point: 本日をもって終了します "ends as of today". In everyday speech, で covers both.',
    functions: ['means-methods', 'time'],
    examples: [
      ex('本日を もって、受付を 終了いたします。', 'Registration closes as of today.', 'ほんじつを もって、うけつけを しゅうりょういたします。'),
      ex('結果は 書面を もって お知らせします。', 'We will inform you of the results in writing.', 'けっかは しょめんを もって おしらせします。'),
    ],
  },
  'n1m-g-ccc4c4': {
    meaning: 'in its own way; reasonably; befitting ~',
    structure: 'それなりに + V／A ／ それなりの + N',
    explanation:
      'それなり acknowledges a level that is appropriate to the circumstances, if not outstanding: 安いが、それなりにおいしい "cheap, but decent for what it is". それなりの理由 means "a reason of its own". It is a modest, qualified evaluation.',
    functions: ['evaluate', 'perspective-way'],
    examples: [
      ex('安い 店だが、味は それなりに おいしい。', "It's a cheap place, but the food is decent for what it is.", 'やすい みせだが、あじは それなりに おいしい。'),
      ex('彼が 断ったのには、それなりの 理由が あるのだろう。', 'He must have had his own reasons for turning it down.', 'かれが ことわったのには、それなりの りゆうが あるのだろう。'),
    ],
  },
  'n1m-g-5e622f': {
    meaning: 'merely ~; (if need be) simply ~',
    structure: 'V-た + までだ（までの ことだ）／ V-dict + までだ',
    explanation:
      'After the past tense, までだ plays down one’s action: 聞かれたから答えたまでだ "I only answered because I was asked". After the dictionary form, it states a simple fallback: だめならやり直すまでだ "if it fails, we just do it over". It sounds matter-of-fact.',
    functions: ['limit', 'explain'],
    examples: [
      ex('聞かれたから 答えた までだ。深い 意味は ない。', 'I only answered because I was asked. It meant nothing more.', 'きかれたから こたえた までだ。ふかい いみは ない。'),
      ex('だめなら、もう 一度 やり直す までの ことだ。', "If it doesn't work, we'll simply do it over again.", 'だめなら、もう いちど やりなおす までの ことだ。'),
    ],
  },
  'n1m-g-6467f7': {
    meaning: 'either A or B (do something)',
    structure: 'N1／V-dict1 + なり + N2／V-dict2 + なり',
    explanation:
      'AなりBなり offers example options and urges the listener to pick one: 先生に聞くなり辞書で調べるなりしなさい. It often ends in a suggestion or order. Unlike とか or か, it is not used to report past facts.',
    functions: ['selective', 'invite-advise'],
    examples: [
      ex('わからなければ、先生に 聞くなり 辞書で 調べるなり しなさい。', "If you don't understand, either ask the teacher or look it up.", 'わからなければ、せんせいに きくなり じしょで しらべるなり しなさい。'),
      ex('コーヒーなり 紅茶なり、お好きな ものを どうぞ。', 'Coffee or tea, please have whatever you like.', 'こーひーなり こうちゃなり、おすきな ものを どうぞ。'),
    ],
  },
  'n1m-g-96a892': {
    meaning: 'like this; this way',
    structure: 'こういう ふうに + V ／ こういう ふうな + N',
    explanation:
      'こういうふうに shows a manner the speaker is demonstrating or describing: こういうふうに折れば "if you fold it like this". こんなふうに is more casual, and このように is the formal written form. こういうふうな modifies a noun.',
    functions: ['similarity-degree', 'method'],
    examples: [
      ex('こういう ふうに 折れば、きれいな 形に なります。', 'If you fold it like this, you get a neat shape.', 'こういう ふうに おれば、きれいな かたちに なります。'),
      ex('こういう ふうな シンプルな デザインが 好きです。', 'I like simple designs like this.', 'こういう ふうな しんぷるな でざいんが すきです。'),
    ],
  },
  'n1m-g-ba8615': {
    meaning: 'not even ~ (literary)',
    structure: 'N（想像・予想・微動 など）+ だに + V-ない（しない）',
    explanation:
      'だに is a literary "even", used in a few fixed combinations: 想像だにしなかった "never even imagined", 微動だにしない "does not budge an inch". With a verb, V-dict + だに means "just to ~": 考えるだに恐ろしい. さえ is the everyday equivalent.',
    functions: ['emphasize-negative', 'extreme-example'],
    examples: [
      ex('こんな 結果に なるとは、想像だに しなかった。', 'I never even imagined it would turn out like this.', 'こんな けっかに なるとは、そうぞうだに しなかった。'),
      ex('兵士たちは 微動だに せず 立って いた。', 'The soldiers stood without moving a muscle.', 'へいしたちは びどうだに せず たって いた。'),
    ],
  },
  'n1m-g-93d694': {
    meaning: 'I hope ~; it would be nice if ~',
    structure: 'N／な-adj + だと いい ／ Plain form + と いい（のに・んだけど）',
    explanation:
      'といい expresses a hope about something outside the speaker’s control: 明日晴れだといいね. With nouns and な-adjectives it becomes だといい. といいのに suggests the hope is unlikely. ばいい / たらいい are more often used for advice ("you should").',
    functions: ['wish'],
    examples: [
      ex('明日、晴れだと いいね。', 'I hope it is sunny tomorrow.', 'あした、はれだと いいね。'),
      ex('試験が 簡単だと いいんだけど。', "I hope the exam's easy.", 'しけんが かんたんだと いいんだけど。'),
    ],
  },
  'n1m-g-8556c6': {
    meaning: 'neither ~ nor ~; without ~ or ~',
    structure: 'V1-ない stem + ず、V2-ない stem + ず（set phrases）',
    explanation:
      'Pairing two ず forms describes the absence of both actions, mostly in fixed phrases: 飲まず食わず "without eating or drinking", 付かず離れず "neither close nor distant", 鳴かず飛ばず "making no mark". It is literary and compact. In plain speech, ないで〜ないで or も〜も〜ない is used.',
    functions: ['negative', 'listed'],
    examples: [
      ex('三日間、飲まず 食わずで 山道を 歩き続けた。', 'For three days they walked the mountain trail without food or water.', 'みっかかん、のまず くわずで やまみちを あるきつづけた。'),
      ex('彼女とは 付かず 離れずの 関係を 保って いる。', 'I keep a relationship with her that is neither close nor distant.', 'かのじょとは つかず はなれずの かんけいを たもって いる。'),
    ],
  },
  'n1m-g-2ee426': {
    meaning: 'not a big deal; nothing much; not serious',
    structure: '大した（たいした）こと は ない（なかった）',
    explanation:
      '大したことはない downplays something: 少し熱があるが大したことはない "just a slight fever, nothing serious". It can also be a mild put-down: 味は大したことはなかった "the food wasn’t anything special". 大丈夫 reassures directly; 大したことはない minimises the importance.',
    functions: ['evaluate', 'negative'],
    examples: [
      ex('少し 熱が あるが、大した ことは ない。', "I have a bit of a temperature, but it's nothing serious.", 'すこし ねつが あるが、たいした ことは ない。'),
      ex('有名な 店だと 聞いたが、味は 大した ことは なかった。', "I'd heard it was a famous place, but the food wasn't anything special.", 'ゆうめいな みせだと きいたが、あじは たいした ことは なかった。'),
    ],
  },
  'n1m-g-2081ef': {
    meaning: 'neatly; completely (taken in, got away with it)',
    structure: 'まんまと + V（だまされる・逃げる・成功する）',
    explanation:
      'まんまと describes a trick that worked perfectly: まんまとだまされた "I was completely taken in". It is used from the victim’s side with regret, or about a culprit’s success. うまく is neutral "well"; まんまと implies cunning.',
    functions: ['achievement', 'describe'],
    examples: [
      ex('犯人は 警察の 目を まんまと 逃れた。', 'The culprit neatly slipped past the police.', 'はんにんは けいさつの めを まんまと のがれた。'),
      ex('私は 彼の 作り話に まんまと 引っかかった。', 'I fell for his made-up story hook, line and sinker.', 'わたしは かれの つくりばなしに まんまと ひっかかった。'),
    ],
  },
  'n1m-g-d957df': {
    meaning: 'nothing can be done; there is no way to ~',
    structure: 'どうにも + ならない／できない',
    explanation:
      'どうにもならない states that a situation is beyond help: 今さら後悔してもどうにもならない. どうにもできない focuses on the person’s inability. どうしようもない is very close and slightly more emotional. The positive どうにかする means "manage somehow".',
    functions: ['negative', 'ability'],
    examples: [
      ex('今さら 後悔しても、どうにも ならない。', "There's no point regretting it now.", 'いまさら こうかいしても、どうにも ならない。'),
      ex('この 痛みは、薬を 飲んでも どうにも できない。', 'Even with medicine, there is nothing I can do about this pain.', 'この いたみは、くすりを のんでも どうにも できない。'),
    ],
  },
  'n1m-g-7b03dc': {
    meaning: 'undaunted by ~; in defiance of ~',
    structure: 'N（困難・反対 など）+ を ものとも せず（に）',
    explanation:
      'をものともせずに praises someone who overcomes an obstacle as if it were nothing: けがをものともせずに走り抜いた. The subject is usually someone other than the speaker. をよそに ignores others’ concern; にもかかわらず is a neutral "despite".',
    functions: ['concessions', 'emphasize-on-level'],
    examples: [
      ex('彼は けがを ものとも せずに、最後まで 走り抜いた。', 'Undaunted by his injury, he ran all the way to the finish.', 'かれは けがを ものとも せずに、さいごまで はしりぬいた。'),
      ex('周囲の 反対を ものとも せず、二人は 結婚した。', 'In defiance of everyone’s objections, the two got married.', 'しゅういの はんたいを ものとも せず、ふたりは けっこんした。'),
    ],
  },
  'n1m-g-db8443': {
    meaning: 'not worth ~; trivial',
    structure: 'V-dict（取る・恐れる など）+ に 足りない（に 足らない）',
    explanation:
      'に足りない says something does not deserve a response: 取るに足りない "trivial", 恐れるに足らない "nothing to fear". に足らない is the more literary form. The positive counterpart is に足る "worthy of".',
    functions: ['value', 'negative'],
    examples: [
      ex('そんな 取るに 足りない ことで 悩むな。', "Don't worry about something so trivial.", 'そんな とるに たりない ことで なやむな。'),
      ex('今の 彼らの 実力なら、恐れるに 足らない。', 'At their current level, they are nothing to fear.', 'いまの かれらの じつりょくなら、おそれるに たらない。'),
    ],
  },
  'n1m-g-a5c914': {
    meaning: 'worth ~ing; able to stand up to ~ ／（堪えない）unbearable to ~',
    structure: 'N／V-dict + に 堪える（たえる）／ V-dict + に 堪えない',
    explanation:
      'に堪える says something is good enough to withstand a demanding use: 大人の鑑賞に堪える作品 "a work adults can appreciate too". The negative with 見る or 聞く means "too awful to ~": 見るに堪えない. With emotion nouns, 感謝に堪えない means "I cannot thank you enough".',
    functions: ['value'],
    examples: [
      ex('この アニメは 大人の 鑑賞にも 堪える。', 'This animated film stands up to adult viewing too.', 'この あにめは おとなの かんしょうにも たえる。'),
      ex('見るに 堪えない ひどい 番組だった。', 'It was an awful programme, painful to watch.', 'みるに たえない ひどい ばんぐみだった。'),
    ],
  },
  'n1m-g-6d6df4': {
    meaning: 'not even (one) ~',
    structure: '一 + counter + たりとも + V-ない',
    explanation:
      'たりとも〜ない denies even the smallest unit: 一日たりとも休まなかった "not a single day off". It follows 一 plus a counter (一円, 一瞬, 一人). It is formal and emphatic; も（一日も） is the everyday version.',
    functions: ['emphasize-negative', 'extreme-example'],
    examples: [
      ex('彼は 一日たりとも 練習を 休まなかった。', 'He did not miss a single day of practice.', 'かれは いちにちたりとも れんしゅうを やすまなかった。'),
      ex('試合中は、一瞬たりとも 気を 抜いては いけない。', 'During the match you must not relax for even a moment.', 'しあいちゅうは、いっしゅんたりとも きを ぬいては いけない。'),
    ],
  },
  'n1m-g-e1afcf': {
    meaning: 'there is no need to ~ (it is obvious, or too minor)',
    structure: 'V-dict + までも ない ／ 言う までも なく',
    explanation:
      'までもない says an action is unnecessary because the matter is obvious or simple: 業者を呼ぶまでもない. 言うまでもなく "needless to say" is the most common use. にはあたらない instead says a reaction is not justified.',
    functions: ['negative', 'of-course'],
    examples: [
      ex('言う までも なく、健康が 一番 大切だ。', 'Needless to say, health matters most.', 'いう までも なく、けんこうが いちばん たいせつだ。'),
      ex('こんな 簡単な 修理なら、業者を 呼ぶ までも ない。', 'For a repair this simple, there is no need to call in a professional.', 'こんな かんたんな しゅうりなら、ぎょうしゃを よぶ までも ない。'),
    ],
  },
  'n1m-g-e35448': {
    meaning: 'worthy of ~; enough to ~',
    structure: 'V-dict／N + に 足る（たる）+ N',
    explanation:
      'に足る says something is sufficient or deserving: 信頼するに足る人物 "a person worthy of trust". It usually modifies a noun and is formal. に値する is a close synonym; the negative form is に足りない.',
    functions: ['value', 'evaluate'],
    examples: [
      ex('彼は 信頼するに 足る 人物だ。', 'He is a person worthy of trust.', 'かれは しんらいするに たる じんぶつだ。'),
      ex('満足するに 足る 結果は 得られなかった。', 'We did not get results we could be satisfied with.', 'まんぞくするに たる けっかは えられなかった。'),
    ],
  },
  'n1m-g-de96df': {
    meaning: 'in (a situation, position); being in ~',
    structure: 'N（立場・状況・時代）+ に あって（は）',
    explanation:
      'にあって places someone in a particular position or era and says what follows from it: 社長という立場にあっては軽率な発言は許されない. It is formal and written. にあっても adds "even in"; において is the neutral "in, at".',
    functions: ['situation', 'time-situation'],
    examples: [
      ex('社長と いう 立場に あっては、軽率な 発言は 許されない。', 'In the position of company president, careless remarks are not acceptable.', 'しゃちょうと いう たちばに あっては、けいそつな はつげんは ゆるされない。'),
      ex('情報化 社会に あって、個人情報の 管理は ますます 重要だ。', 'In an information society, managing personal data matters more and more.', 'じょうほうか しゃかいに あって、こじんじょうほうの かんりは ますます じゅうようだ。'),
    ],
  },
  'n1m-g-680b73': {
    meaning: 'I hear that ~; (passing on a message) ~',
    structure: 'Plain form + との ことだ（との ことです）',
    explanation:
      'とのことだ relays information or a message from someone else, especially in business: 少し遅れるとのことです "he says he will be a little late". It is more formal than そうだ and often names the source. とのことで can continue the sentence.',
    functions: ['heard', 'transfer-the-story'],
    examples: [
      ex('部長から 電話が あり、少し 遅れる との ことです。', 'The manager called to say he will be a little late.', 'ぶちょうから でんわが あり、すこし おくれる との ことです。'),
      ex('天気予報に よると、明日は 大雪 との ことだ。', 'According to the forecast, there will be heavy snow tomorrow.', 'てんきよほうに よると、あしたは おおゆき との ことだ。'),
    ],
  },
  'n1m-g-2198b8': {
    meaning: 'or (formal)',
    structure: 'N1 + もしくは + N2',
    explanation:
      'もしくは is a formal "or", used in forms, rules and official instructions: 黒もしくは青のペン. または is the general formal "or", and あるいは can also mean "perhaps". In conversation, か is normal.',
    functions: ['selective'],
    examples: [
      ex('黒 もしくは 青の ペンで 記入して ください。', 'Please fill in the form with a black or blue pen.', 'くろ もしくは あおの ぺんで きにゅうして ください。'),
      ex('本人 もしくは ご家族の 方が 来て ください。', 'Either the person concerned or a family member should come.', 'ほんにん もしくは ごかぞくの かたが きて ください。'),
    ],
  },
  'n1m-g-176e29': {
    meaning: 'as if; just as though ~',
    structure: 'あたかも + clause + か の ように（か の ようだ）',
    explanation:
      'あたかも strengthens a simile, usually with かのように: あたかも自分が社長であるかのように振る舞う "acts as if he were the boss". It is literary; まるで is the everyday equivalent. It often hints that the appearance is false.',
    functions: ['similarity-degree'],
    examples: [
      ex('彼は あたかも 自分が 社長で あるかのように 振る舞う。', 'He behaves as if he were the company president.', 'かれは あたかも じぶんが しゃちょうで あるかのように ふるまう。'),
      ex('桜の 花びらが、あたかも 雪の ように 舞って いた。', 'The cherry petals were dancing in the air just like snow.', 'さくらの はなびらが、あたかも ゆきの ように まって いた。'),
    ],
  },
  'n1m-g-ba642f': {
    meaning: "not even amount to ~; be no use",
    structure: 'N + に も ならない ／ 何（なん）に も ならない',
    explanation:
      'にもならない says something falls short of even a modest standard: 生活費にもならない "not even enough to live on", 勝負にもならない "not even a contest". 何にもならない means "it is no use at all". The も signals that the bar is already low.',
    functions: ['negative', 'level'],
    examples: [
      ex('こんな 安い 給料では、生活費にも ならない。', 'Pay this low does not even cover living costs.', 'こんな やすい きゅうりょうでは、せいかつひにも ならない。'),
      ex('実力の 差が 大きすぎて、勝負にも ならなかった。', 'The gap in ability was so large it was not even a contest.', 'じつりょくの さが おおきすぎて、しょうぶにも ならなかった。'),
    ],
  },
  'n1m-g-409ed4': {
    meaning: 'just because of (something minor)',
    structure: 'Plain form／N + くらいで（ぐらいで）',
    explanation:
      'くらいで dismisses a cause as too small to justify the reaction: 一度失敗したくらいであきらめるな "don’t give up over one failure". The main clause often criticises or reassures. だけで is neutral "just by"; くらいで adds the speaker’s judgement that it is trivial.',
    functions: ['level', 'criticize'],
    examples: [
      ex('一度 失敗した くらいで、あきらめるな。', "Don't give up just because you failed once.", 'いちど しっぱいした くらいで、あきらめるな。'),
      ex('少し 雨が 降った くらいで、試合は 中止に ならない。', "A little rain won't get the match called off.", 'すこし あめが ふった くらいで、しあいは ちゅうしに ならない。'),
    ],
  },
  'n1m-g-e2d19a': {
    meaning: 'regardless of ~; irrespective of ~',
    structure: 'N + に よらず ／ 何事（なにごと）に よらず',
    explanation:
      'によらず says a condition does not matter: 年齢や性別によらず "regardless of age or gender". 何事によらず means "in everything". It is formal; に関係なく and を問わず are near-synonyms. 見かけによらず is an idiom, "contrary to appearances".',
    functions: ['invariant'],
    examples: [
      ex('年齢や 性別に よらず、誰でも 応募できます。', 'Anyone can apply, regardless of age or gender.', 'ねんれいや せいべつに よらず、だれでも おうぼできます。'),
      ex('彼は 見かけに よらず、とても 繊細な 人だ。', 'Contrary to appearances, he is a very sensitive person.', 'かれは みかけに よらず、とても せんさいな ひとだ。'),
    ],
  },
  'n1m-g-62f3e4': {
    meaning: 'must not ~; do not ~ (signs, maxims)',
    structure: 'V-dict + べからず（する → すべからず）',
    explanation:
      'べからず is a classical prohibition that survives on old-style signs and in proverbs: 芝生に入るべからず "keep off the grass". It sounds stern and old-fashioned. Modern signs use 禁止 or ないでください; べからざる is the form before a noun.',
    functions: ['ban'],
    examples: [
      ex('芝生に 入る べからず。', 'Keep off the grass.', 'しばふに はいる べからず。'),
      ex('働かざる 者 食う べからず。', 'He who does not work shall not eat.', 'はたらかざる もの くう べからず。'),
    ],
  },
  'n1m-g-13f15a': {
    meaning: 'cannot possibly ~; is out of the question',
    structure: 'V-dict（望む・知る など）+ べくも ない',
    explanation:
      'べくもない says something is beyond any possibility: 家など望むべくもない "owning a house is out of the question". It is literary and goes with a few verbs such as 望む, 知る, 比べる. はずがない judges likelihood; べくもない says it cannot even be hoped for.',
    functions: ['negative', 'ability'],
    examples: [
      ex('この 給料では、家など 望む べくも ない。', 'On this salary, owning a house is out of the question.', 'この きゅうりょうでは、いえなど のぞむ べくも ない。'),
      ex('素人の 作品は、プロの ものとは 比ぶ べくも ない。', 'An amateur’s work cannot possibly compare with a professional’s.', 'しろうとの さくひんは、ぷろの ものとは くらぶ べくも ない。'),
    ],
  },
  'n1m-g-d62e54': {
    meaning: 'like ~; as ~ (literary) ／ the likes of ~ (contempt)',
    structure: 'N の／V-dict + ごとく（ごとき + N）／ N + ごとき',
    explanation:
      'ごとく is a literary ように: 矢のごとく過ぎる "flies like an arrow"; ごとき modifies a noun. Attached directly to a noun, ごとき becomes dismissive: お前ごとき "the likes of you", or humble when used of oneself: 私ごとき. ような is the everyday form.',
    functions: ['similarity-degree', 'contemptuous'],
    examples: [
      ex('月日は 矢の ごとく 過ぎて いく。', 'The months and years fly by like an arrow.', 'つきひは やの ごとく すぎて いく。'),
      ex('お前 ごときに 負ける はずが ない。', 'There is no way I could lose to the likes of you.', 'おまえ ごときに まける はずが ない。'),
    ],
  },
  'n1m-g-293f93': {
    meaning: 'even if not (as far as) ~, at least ~',
    structure: 'V-ない + までも、+ lesser degree',
    explanation:
      'ないまでも concedes that a higher level is not reached, and settles for a lower one: 優勝はできないまでも、決勝には進みたい. The second half usually has せめて, 少なくとも or a request. とは言わないまでも is a common frame.',
    functions: ['concessions', 'limit'],
    examples: [
      ex('毎日とは 言わないまでも、週に 一度は 運動した ほうが いい。', "Maybe not every day, but you should exercise at least once a week.", 'まいにちとは いわないまでも、しゅうに いちどは うんどうした ほうが いい。'),
      ex('優勝は できないまでも、決勝には 進みたい。', "Even if we can't win, I want us at least to reach the final.", 'ゆうしょうは できないまでも、けっしょうには すすみたい。'),
    ],
  },
  'n1m-g-b167a5': {
    meaning: 'just cannot ~ (however one tries); really (at a loss)',
    structure: 'どうにも + V-ない（納得が いかない・眠れない など）',
    explanation:
      'どうにも with a negative says every attempt fails: どうにも納得がいかない "I just cannot accept it", どうにも眠れない. It stresses helplessness more than とても〜ない. The fixed どうにもならない means "nothing can be done", and どうにも困った means "really at a loss".',
    functions: ['negative', 'ability'],
    examples: [
      ex('彼の 説明には、どうにも 納得が いかない。', 'I just cannot accept his explanation.', 'かれの せつめいには、どうにも なっとくが いかない。'),
      ex('昨夜は 暑くて、どうにも 眠れなかった。', 'It was so hot last night that I just could not sleep.', 'さくやは あつくて、どうにも ねむれなかった。'),
    ],
  },
  'n1m-g-eaea45': {
    meaning: 'taking (unfair) advantage of ~',
    structure: 'N／Plain form + の + を いい ことに',
    explanation:
      'をいいことに says someone exploits a situation to do something they should not: 親が留守なのをいいことに "with his parents out, he took the chance to ~". It always carries criticism. をきっかけに is a neutral trigger; に乗じて is a formal "seize the chance".',
    functions: ['cause-reason', 'criticize'],
    examples: [
      ex('親が 留守なのを いい ことに、弟は 一日中 ゲームを して いた。', 'Taking advantage of our parents being away, my brother played games all day.', 'おやが るすなのを いい ことに、おとうとは いちにちじゅう げーむを して いた。'),
      ex('誰も 注意しないのを いい ことに、彼は 好き勝手を して いる。', 'Because no one says anything, he does whatever he likes.', 'だれも ちゅういしないのを いい ことに、かれは すきかってを して いる。'),
    ],
  },
  'n1m-g-ea1103': {
    meaning: 'when it actually comes to (doing) ~',
    structure: 'いざ + N／V-dict + と なると（と なれば／と なったら）',
    explanation:
      'いざ marks the moment something stops being hypothetical and becomes real: いざ本番となると緊張する. The sentence often reveals that it is harder than expected. となると alone is a plain "when it comes to"; いざ adds the sense of the decisive moment.',
    functions: ['condition', 'time-situation'],
    examples: [
      ex('いざ 本番と なると、緊張して 何も 言えなく なった。', 'When the actual performance came, I got so nervous I could not say a thing.', 'いざ ほんばんと なると、きんちょうして なにも いえなく なった。'),
      ex('いざ 引っ越すと なれば、捨てる ものが たくさん ある。', 'Once you actually move, you find there is a lot to throw away.', 'いざ ひっこすと なれば、すてる ものが たくさん ある。'),
    ],
  },
  'n1m-g-db797a': {
    meaning: 'before ~ (while not yet); while still not ~ (literary)',
    structure: 'V-ない stem + ぬ うちに',
    explanation:
      'ぬうちに is the literary form of ないうちに: "before something happens". 日が暮れぬうちに "before the sun goes down". It survives in set phrases such as 舌の根も乾かぬうちに "before the words are even out of one’s mouth", used of someone breaking a promise at once.',
    functions: ['short-time', 'time-situation'],
    examples: [
      ex('日が 暮れぬ うちに、山を 下りよう。', "Let's get down the mountain before the sun sets.", 'ひが くれぬ うちに、やまを おりよう。'),
      ex('もう しないと 言った 舌の 根も 乾かぬ うちに、また 嘘を ついた。', 'He had barely finished promising not to, and he lied again.', 'もう しないと いった したの ねも かわかぬ うちに、また うそを ついた。'),
    ],
  },
  'n1m-g-3d53de': {
    meaning: 'cannot possibly ~; utterly impossible',
    structure: '到底（とうてい）+ V-potential ない／無理だ',
    explanation:
      '到底〜ない judges that something is impossible however you look at it: 到底信じられない. It is about possibility, not will. 決して〜ない is about resolve ("will never"), and とても〜ない is the conversational equivalent of 到底.',
    functions: ['negative', 'ability'],
    examples: [
      ex('この 量を 一日で 終わらせるのは、到底 無理だ。', 'Finishing this much in one day is utterly impossible.', 'この りょうを いちにちで おわらせるのは、とうてい むりだ。'),
      ex('彼の 話は、到底 信じられない。', 'I cannot possibly believe his story.', 'かれの はなしは、とうてい しんじられない。'),
    ],
  },
  'n1m-g-2f9d51': {
    meaning: 'sort of ~ and sort of not; half ~, half ~',
    structure: 'V／A + ような、V-ない／A2 + ような（気が する・気持ち）',
    explanation:
      'Two ような phrases side by side describe a feeling that cannot be pinned down: わかったようなわからないような "I sort of understand and sort of don’t". The pair is often a thing and its negation, or two mixed emotions. やら〜やら lists mixed feelings too, but more emphatically.',
    functions: ['vague', 'similarity-degree'],
    examples: [
      ex('説明を 聞いて、わかったような わからないような 気が した。', 'After the explanation I felt as if I half understood and half did not.', 'せつめいを きいて、わかったような わからないような きが した。'),
      ex('卒業は うれしいような 寂しいような 気持ちだ。', 'Graduating feels a little happy and a little sad.', 'そつぎょうは うれしいような さびしいような きもちだ。'),
    ],
  },
  'n1m-g-d720d9': {
    meaning: '~ has its own ~ (fitting to it)',
    structure: 'N1 + には + N1 + なりの + N2',
    explanation:
      'NにはNなりのN2 says that N has its own ~ appropriate to what it is: 子供には子供なりの考えがある "children have their own way of thinking". It defends a viewpoint that others may dismiss. それなり refers back to something already mentioned.',
    functions: ['perspective-way', 'related-respectively'],
    examples: [
      ex('子供には 子供なりの 考えが ある。', 'Children have their own way of thinking.', 'こどもには こどもなりの かんがえが ある。'),
      ex('私には 私なりの やり方が あるので、任せて ください。', 'I have my own way of doing things, so leave it to me.', 'わたしには わたしなりの やりかたが あるので、まかせて ください。'),
    ],
  },
  'n1m-g-492211': {
    meaning: 'without ~, (it) cannot ~',
    structure: 'N + なくして（は）+ V-ない ／ N なくして + 何の N か',
    explanation:
      'なくしては〜ない is a formal, written way to say N is indispensable: ご支援なくしては成功しなかった. It is often used in speeches of thanks. なしには is similar and less formal; rhetorical なくして何の〜か means "what is ~ without N?".',
    functions: ['condition-requirement', 'negative'],
    examples: [
      ex('皆様の ご支援 なくしては、この 事業は 成功しなかった。', 'This project would not have succeeded without your support.', 'みなさまの ごしえん なくしては、この じぎょうは せいこうしなかった。'),
      ex('信頼 なくして、良い 関係は 築けない。', 'Without trust, you cannot build a good relationship.', 'しんらい なくして、よい かんけいは きずけない。'),
    ],
  },
  'n1m-g-c86069': {
    meaning: 'there is a limit to ~; ~ goes too far',
    structure: 'N／A + にも 程（ほど）が ある',
    explanation:
      'にも程がある criticises something as excessive: 冗談にも程がある "a joke is one thing, but this is too much". It is used with nouns or adjectives describing behaviour. すぎる describes excess neutrally; にも程がある expresses exasperation.',
    functions: ['criticize', 'limit'],
    examples: [
      ex('そんな ことを 言うなんて、冗談にも ほどが ある。', 'Saying something like that is taking a joke too far.', 'そんな ことを いうなんて、じょうだんにも ほどが ある。'),
      ex('人を 三時間も 待たせるなんて、失礼にも 程が ある。', 'Keeping someone waiting three hours is beyond rude.', 'ひとを さんじかんも またせるなんて、しつれいにも ほどが ある。'),
    ],
  },
  'n1m-g-05ac06': {
    meaning: 'after all; you see (overriding reason)',
    structure: '何（なに）しろ + reason（から／ので）',
    explanation:
      '何しろ gives a reason that outweighs everything else, often to excuse or explain: 何しろ初めてなので "after all, it is my first time". とにかく means "anyway, regardless" and pushes to action; 何しろ explains. It is conversational.',
    functions: ['cause-reason', 'emphasize'],
    examples: [
      ex('何しろ 初めての 経験なので、わからない ことばかりだ。', "It's my first time, after all, so everything is new to me.", 'なにしろ はじめての けいけんなので、わからない ことばかりだ。'),
      ex('何しろ 忙しくて、休む 暇も ない。', "I'm just so busy I don't even have time to rest.", 'なにしろ いそがしくて、やすむ ひまも ない。'),
    ],
  },
  'n1m-g-f030cf': {
    meaning: 'unique to ~; that only ~ can offer',
    structure: 'N + ならでは の + N ／ N + ならでは + V-ない',
    explanation:
      'ならではの praises something that only that place, person or thing can provide: 京都ならではの景色. It is always positive. らしい means "typical of", but ならでは stresses uniqueness; ならでは〜ない means "only N can ~".',
    functions: ['characteristics', 'limit'],
    examples: [
      ex('これは 京都ならではの 景色だ。', 'This is a view you can only get in Kyoto.', 'これは きょうとならではの けしきだ。'),
      ex('この セーターには、手作りならではの 温かみが ある。', 'This sweater has a warmth that only handmade things have.', 'この せーたーには、てづくりならではの あたたかみが ある。'),
    ],
  },
  'n1m-g-5bade3': {
    meaning: 'using ~ as a pretext',
    structure: 'N + に かこつけて',
    explanation:
      'にかこつけて says someone uses an unrelated reason as an excuse for what they really want to do: 出張にかこつけて観光した. It implies the stated reason is not the real one. を口実に is a close, more direct synonym.',
    functions: ['cause-reason', 'criticize'],
    examples: [
      ex('出張に かこつけて、観光を 楽しんだ。', 'Using the business trip as an excuse, I enjoyed some sightseeing.', 'しゅっちょうに かこつけて、かんこうを たのしんだ。'),
      ex('彼は 体調不良に かこつけて、会議を 休んだ。', 'He used feeling unwell as a pretext for skipping the meeting.', 'かれは たいちょうふりょうに かこつけて、かいぎを やすんだ。'),
    ],
  },
  'n1m-g-87b14c': {
    meaning: "it's not as if ~, so ~",
    structure: 'N + では ある まいし（じゃ ある まいし）',
    explanation:
      'ではあるまいし dismisses an assumption and gives it as the reason for a criticism or advice: 子供ではあるまいし、一人で帰れる "I’m not a child, I can get home alone". The second half is often a command or judgement. じゃあるまいし is the colloquial form.',
    functions: ['cause-reason', 'criticize'],
    examples: [
      ex('子供では あるまいし、一人で 帰れるよ。', "I'm not a child. I can get home by myself.", 'こどもでは あるまいし、ひとりで かえれるよ。'),
      ex('神様では あるまいし、未来の ことなど わからない。', "I'm not God, so how would I know the future?", 'かみさまでは あるまいし、みらいの ことなど わからない。'),
    ],
  },
  'n1m-g-e0c188': {
    meaning: 'to end up (having to do something unpleasant)',
    structure: 'V-dict + 羽目（はめ）に なる',
    explanation:
      '羽目になる says circumstances forced an unwelcome outcome, often through one’s own fault: 寝坊して駅まで走る羽目になった. ことになる is neutral; 羽目になる adds regret or annoyance. It is conversational.',
    functions: ['result', 'unexpected-outcome'],
    examples: [
      ex('寝坊して、駅まで 走る 羽目に なった。', 'I overslept and ended up having to run to the station.', 'ねぼうして、えきまで はしる はめに なった。'),
      ex('安請け合いした せいで、週末も 働く 羽目に なった。', 'Because I agreed too easily, I ended up working the weekend too.', 'やすうけあいした せいで、しゅうまつも はたらく はめに なった。'),
    ],
  },
  'n1m-g-16a4f1': {
    meaning: 'roughly ~; about ~ (at most)',
    structure: 'N／Plain form + と いった ところだ',
    explanation:
      'といったところだ gives a modest estimate of a level or amount, implying it is not much: 参加者は二十人といったところだ "about twenty people, at most". It is used to describe progress or ability conservatively. くらいだ is a plain approximation without the modest tone.',
    functions: ['amount-roughly', 'evaluate'],
    examples: [
      ex('毎回の 参加者は、二十人と いった ところだ。', 'Each time there are about twenty participants, at most.', 'まいかいの さんかしゃは、にじゅうにんと いった ところだ。'),
      ex('私の 英語は、日常会話が できると いった ところです。', 'My English is roughly at the level of everyday conversation.', 'わたしの えいごは、にちじょうかいわが できると いった ところです。'),
    ],
  },
  'n1m-g-c3517e': {
    meaning: 'it is believed that ~; is thought to ~ (news, reports)',
    structure: 'Plain form（N）+ と みられる（と みられて いる）',
    explanation:
      'とみられる reports an estimate made from available evidence, typical of news: 犯人は三十代の男とみられる. とみられている presents it as the prevailing view. と考えられる stresses reasoning; とみられる stresses observation and estimation.',
    functions: ['speculation', 'information-resource'],
    examples: [
      ex('事故の 原因は、整備不良と みられて いる。', 'The accident is believed to have been caused by poor maintenance.', 'じこの げんいんは、せいびふりょうと みられて いる。'),
      ex('犯人は 三十代の 男と みられる。', 'The culprit is thought to be a man in his thirties.', 'はんにんは さんじゅうだいの おとこと みられる。'),
    ],
  },
  'n1m-g-8f3de1': {
    meaning: 'to deliberately leave ~ undone; to refrain from ~',
    structure: 'V-ない stem + ずに おく（する → せずに おく）',
    explanation:
      'ずにおく means choosing not to do something, often for a reason: 本当のことは言わずにおいた "I chose not to tell the truth". It is the negative of ておく. ずにいる describes a state of not doing, often from inability; ずにおく is deliberate.',
    functions: ['action-status', 'intent'],
    examples: [
      ex('彼を 傷つけたく なくて、本当の ことは 言わずに おいた。', "I didn't want to hurt him, so I kept the truth to myself.", 'かれを きずつけたく なくて、ほんとうの ことは いわずに おいた。'),
      ex('明日の ために、この ケーキは 食べずに おこう。', "I'll leave this cake for tomorrow.", 'あしたの ために、この けーきは たべずに おこう。'),
    ],
  },
  'n1m-g-94840f': {
    meaning: 'once (one is / it is) ~; when it comes to (a higher level)',
    structure: 'N／V-dict + とも なれば（とも なると）',
    explanation:
      'ともなれば says that reaching a certain stage or status naturally brings certain expectations: 大学生ともなれば自分で決めるべきだ. The とも adds "at that level". となれば is the plainer version; ともなると is nearly identical.',
    functions: ['condition', 'case'],
    examples: [
      ex('大学生とも なれば、自分の ことは 自分で 決める べきだ。', 'Once you are a university student, you should make your own decisions.', 'だいがくせいとも なれば、じぶんの ことは じぶんで きめる べきだ。'),
      ex('年末とも なれば、どこの 店も 混雑する。', 'When the end of the year comes, every shop gets crowded.', 'ねんまつとも なれば、どこの みせも こんざつする。'),
    ],
  },
  'n1m-g-ce9ed3': {
    meaning: 'I wonder ~ (perplexed)',
    structure: '疑問詞 + Plain form + もの やら',
    explanation:
      'ものやら expresses puzzlement about something the speaker cannot work out: どうしたものやら "what on earth should I do". It pairs with a question word or with か〜か. だろうか is a neutral wondering; ものやら sounds more at a loss.',
    functions: ['vague', 'speculation'],
    examples: [
      ex('この 問題を どう 解決した ものやら。', 'I have no idea how to solve this problem.', 'この もんだいを どう かいけつした ものやら。'),
      ex('彼は 今ごろ どこで 何を して いる ものやら。', 'I wonder where he is and what he is doing now.', 'かれは いまごろ どこで なにを して いる ものやら。'),
    ],
  },
  'n1m-g-c5a64e': {
    meaning: 'from ~ all the way to ~ (right up to)',
    structure: 'N1 + から + N2 + に 至る（いたる）まで',
    explanation:
      'からに至るまで covers a whole range, with emphasis on how far it reaches: 昔から今に至るまで "from long ago right up to the present". It often spans time or covers details down to the smallest. から〜まで is the plain version without that emphasis.',
    functions: ['range', 'origin-and-end-point'],
    examples: [
      ex('昔から 今に 至るまで、この 祭りは 続いて いる。', 'This festival has continued from long ago right up to the present.', 'むかしから いまに いたるまで、この まつりは つづいて いる。'),
      ex('食事の 内容から 睡眠時間に 至るまで、細かく 記録した。', 'I kept a detailed record of everything from my meals to my sleeping hours.', 'しょくじの ないようから すいみんじかんに いたるまで、こまかく きろくした。'),
    ],
  },
  'n1m-g-7c114e': {
    meaning: 'so that ~ never happens; so as not to ~ (formal)',
    structure: 'V-dict + ことの ない ように',
    explanation:
      'ことのないように is a formal ないように, used in notices, instructions and official statements: 忘れ物をすることのないように. It sounds more careful and comprehensive. It often follows 二度と.',
    functions: ['purpose-goal', 'warning'],
    examples: [
      ex('二度と 同じ 事故が 起こる ことの ない ように、対策を 立てた。', 'We put measures in place so that the same accident never happens again.', 'にどと おなじ じこが おこる ことの ない ように、たいさくを たてた。'),
      ex('お忘れ物を なさる ことの ない ように、ご注意 ください。', 'Please take care not to leave anything behind.', 'おわすれものを なさる ことの ない ように、ごちゅうい ください。'),
    ],
  },
  'n1m-g-c77ad5': {
    meaning: 'as was bound to happen; inevitably',
    structure: 'V-dict + べくして + V-た（same verb）',
    explanation:
      'べくしてV-た says an outcome was the natural result of the circumstances: 勝つべくして勝った "they won, as they were bound to". It repeats the same verb. なるべくしてなった is a common frame. 当然 states the same judgement less dramatically.',
    functions: ['of-course', 'result'],
    examples: [
      ex('あれだけ 練習した チームだ。勝つ べくして 勝ったのだ。', 'That team practised so hard. They won because they were bound to.', 'あれだけ れんしゅうした ちーむだ。かつ べくして かったのだ。'),
      ex('準備不足の 計画は、失敗する べくして 失敗した。', 'The underprepared plan failed, as it was always going to.', 'じゅんびぶそくの けいかくは、しっぱいする べくして しっぱいした。'),
    ],
  },
  'n1m-g-60b03f': {
    meaning: 'one would have thought ~, but actually ~',
    structure: 'Plain form + か と 思いきや（おもいきや）',
    explanation:
      'かと思いきや sets up an expectation and immediately overturns it: 簡単かと思いきや、難しかった. It is lively and a little literary, common in writing and commentary. と思ったら also describes a surprise, but かと思いきや stresses the reversal.',
    functions: ['unexpected-outcome'],
    examples: [
      ex('簡単な 試験かと 思いきや、難しい 問題ばかりだった。', 'I thought the exam would be easy, but it was all hard questions.', 'かんたんな しけんかと おもいきや、むずかしい もんだいばかりだった。'),
      ex('もう 帰ったかと 思いきや、彼は まだ 会社に いた。', 'I assumed he had gone home, but he was still at the office.', 'もう かえったかと おもいきや、かれは まだ かいしゃに いた。'),
    ],
  },
  'n1m-g-9fc633': {
    meaning: 'so absorbed in ~ that (one neglects something)',
    structure: 'N + に かまけて + neglect',
    explanation:
      'にかまけて says preoccupation with one thing led to neglecting something else: 仕事にかまけて家族をおろそかにした. The second half names the neglected duty. It is critical, often self-critical. に夢中で is neutral "absorbed in".',
    functions: ['cause-reason', 'criticize'],
    examples: [
      ex('仕事に かまけて、家族との 時間を おろそかに して いた。', 'I was so wrapped up in work that I neglected time with my family.', 'しごとに かまけて、かぞくとの じかんを おろそかに して いた。'),
      ex('ゲームに かまけて、宿題を すっかり 忘れて いた。', 'I was so caught up in games that I completely forgot my homework.', 'げーむに かまけて、しゅくだいを すっかり わすれて いた。'),
    ],
  },
  'n1m-g-c58757': {
    meaning: '~ is guaranteed; I assure you ~',
    structure: 'V-dict + こと 請け合い（うけあい）だ',
    explanation:
      'こと請け合いだ vouches strongly for a result: 泣くこと請け合いだ "you are guaranteed to cry". It is lively and often used in recommendations and advertising. に違いない is a firm inference; 請け合い is a personal guarantee.',
    functions: ['of-course', 'judge'],
    examples: [
      ex('この 映画を 見れば、泣く こと 請け合いだ。', 'Watch this film and you are guaranteed to cry.', 'この えいがを みれば、なく こと うけあいだ。'),
      ex('この 店の ケーキは、一度 食べたら やみつきに なる こと 請け合いです。', "Try this shop's cake once and I promise you'll be hooked.", 'この みせの けーきは、いちど たべたら やみつきに なる こと うけあいです。'),
    ],
  },
  'n1m-g-42c80f': {
    meaning: 'and by extension; and in turn',
    structure: 'A、ひいては B（wider consequence）',
    explanation:
      'ひいては extends an effect from a small scope to a larger one: 一人一人の努力がひいては社会を変える. B is broader than A. It is formal. さらには simply adds "furthermore" without the chain of cause.',
    functions: ['add', 'result'],
    examples: [
      ex('一人 一人の 努力が、ひいては 社会全体を 変える。', "Each person's effort, in turn, changes society as a whole.", 'ひとり ひとりの どりょくが、ひいては しゃかいぜんたいを かえる。'),
      ex('環境を 守る ことは、ひいては 私たち 自身を 守る ことに なる。', 'Protecting the environment ultimately means protecting ourselves.', 'かんきょうを まもる ことは、ひいては わたしたち じしんを まもる ことに なる。'),
    ],
  },
  'n1m-g-1c5217': {
    meaning: 'as if to say ~',
    structure: '「quote」／Plain form + と 言わん（いわん）ばかりに（ばかりの + N）',
    explanation:
      'と言わんばかりに describes an attitude or expression that all but says something out loud: 早く帰れと言わんばかりの顔 "a face that said ‘go home now’". It is used about other people. かのように is a neutral "as if"; 言わんばかり is specifically about unspoken messages.',
    functions: ['similarity-degree', 'describe'],
    examples: [
      ex('彼女は 「早く 帰れ」と 言わんばかりの 顔を した。', 'She gave me a look that said "go home already".', 'かのじょは 「はやく かえれ」と いわんばかりの かおを した。'),
      ex('彼は 自分が 正しいと 言わんばかりに 胸を 張った。', 'He puffed out his chest as if to say he was right.', 'かれは じぶんが ただしいと いわんばかりに むねを はった。'),
    ],
  },
  'n1m-g-c75cf3': {
    meaning: 'unbecoming of ~; inexcusable for ~',
    structure: 'N（立場）+ に（と して）あるまじき + N（行為・発言）',
    explanation:
      'あるまじき condemns behaviour as unacceptable for someone in a given role: 医者にあるまじき発言. It is formal and heavily critical, often in news. らしくない is a mild "unlike"; あるまじき means it should never happen.',
    functions: ['criticize', 'ban'],
    examples: [
      ex('それは 医者に あるまじき 発言だ。', 'That is a remark unbecoming of a doctor.', 'それは いしゃに あるまじき はつげんだ。'),
      ex('公務員と して あるまじき 行為で、彼は 処分された。', 'He was disciplined for conduct inexcusable in a public servant.', 'こうむいんと して あるまじき こういで、かれは しょぶんされた。'),
    ],
  },
  'n1m-g-3119f9': {
    meaning: 'on the premise of ~; assuming ~',
    structure: 'N + を 前提（ぜんてい）に（と して）',
    explanation:
      'を前提に sets a condition that everything else is based on: 結婚を前提に付き合う "date with marriage in mind". を前提とする is the verb form. を基に means "based on (material)", not a precondition.',
    functions: ['premise', 'condition-assumption'],
    examples: [
      ex('結婚を 前提に、お付き合い させて ください。', 'Please let me date you with a view to marriage.', 'けっこんを ぜんていに、おつきあい させて ください。'),
      ex('この 計画は、国の 補助金を 前提と して いる。', 'This plan assumes we will receive a government subsidy.', 'この けいかくは、くにの ほじょきんを ぜんていと して いる。'),
    ],
  },
  'n1m-g-c25933': {
    meaning: 'if at all possible; preferably',
    structure: 'なるべく なら（なるべく ならば）+ wish／request',
    explanation:
      'なるべくなら states a preference while leaving room for the other option: なるべくなら今日中に返事がほしい. なるべく alone means "as much as possible"; なるべくなら means "if possible, I would rather". It softens requests.',
    functions: ['wish', 'condition'],
    examples: [
      ex('なるべく なら、今日中に 返事を ください。', 'If at all possible, please reply today.', 'なるべく なら、きょうじゅうに へんじを ください。'),
      ex('なるべく なら、週末の 人混みは 避けたい。', "If I can, I'd rather avoid the weekend crowds.", 'なるべく なら、しゅうまつの ひとごみは さけたい。'),
    ],
  },
  'n1m-g-fe6841': {
    meaning: 'there is a prospect of ~; is expected to ~; promising',
    structure: 'V-dict + 見込み（みこみ）だ／が ある ／ 見込みが ない',
    explanation:
      '見込み is a reasoned expectation: 来月完了する見込みだ "is expected to finish next month". 見込みがある about a person means "promising"; 見込みがない means "no hope". 予定 is a plan; 見込み is a forecast.',
    functions: ['speculation', 'future-time'],
    examples: [
      ex('工事は 来月 完了する 見込みです。', 'The construction is expected to finish next month.', 'こうじは らいげつ かんりょうする みこみです。'),
      ex('あの 新人は 見込みが ある。', 'That new recruit shows promise.', 'あの しんじんは みこみが ある。'),
    ],
  },
  'n1m-g-2ede5c': {
    meaning: 'when (at last) ~ is achieved',
    structure: 'N の／V-た + 暁（あかつき）には',
    explanation:
      '暁には looks ahead to a hoped-for achievement and says what will follow it: 合格の暁には旅行しよう. It sounds grand and is common in pledges and speeches. ときには is neutral; 暁には implies a long-awaited success.',
    functions: ['time-situation', 'purpose-goal'],
    examples: [
      ex('合格の 暁には、家族で 温泉旅行に 行こう。', "When you pass, let's all go on a hot-spring trip as a family.", 'ごうかくの あかつきには、かぞくで おんせんりょこうに いこう。'),
      ex('新しい 工場が 完成した 暁には、生産量が 倍に なる。', 'Once the new factory is finished, output will double.', 'あたらしい こうじょうが かんせいした あかつきには、せいさんりょうが ばいに なる。'),
    ],
  },
  'n1m-g-545bea': {
    meaning: 'there is no way to ~; no means of ~',
    structure: 'V-dict + すべ（術）が ない（すべも ない）',
    explanation:
      'すべがない says there is no method available: 知らせるすべがない "no way to let him know". なすすべもない means "helpless, nothing to be done". 方法がない is the plain equivalent; すべ is literary.',
    functions: ['negative', 'means-methods'],
    examples: [
      ex('大きな 災害の 前に、人間は なす すべも なかった。', 'In the face of the great disaster, people were helpless.', 'おおきな さいがいの まえに、にんげんは なす すべも なかった。'),
      ex('連絡先が わからず、彼に 知らせる すべが ない。', "I don't have his contact details, so I have no way to let him know.", 'れんらくさきが わからず、かれに しらせる すべが ない。'),
    ],
  },
  'n1m-g-a3fbf7': {
    meaning: 'not ~ at all; nothing of the sort',
    structure: 'N／な-adj + でも なんでも ない',
    explanation:
      'でもなんでもない flatly denies a label: 友達でもなんでもない "he is not my friend or anything like it". It is emphatic and conversational. ではない is the plain denial; でもなんでもない rejects even anything close.',
    functions: ['negative', 'emphasize-negative'],
    examples: [
      ex('彼は 友達でも なんでも ない。ただの 知り合いだ。', 'He is not a friend or anything like it, just an acquaintance.', 'かれは ともだちでも なんでも ない。ただの しりあいだ。'),
      ex('こんな ことは 自慢でも なんでも ない。', 'This is nothing to boast about at all.', 'こんな ことは じまんでも なんでも ない。'),
    ],
  },
  'n1m-g-031bfc': {
    meaning: 'someone of (such standing), of all people',
    structure: 'N（立場）+ とも あろう 者（もの）／人 が',
    explanation:
      'ともあろう者が expresses shock that a person of high status or responsibility behaved badly: 警察官ともあろう者が "a police officer, of all people". The sentence continues with criticism. としたことが is used for an uncharacteristic slip, often by oneself.',
    functions: ['surprise', 'criticize'],
    examples: [
      ex('警察官とも あろう 者が、交通ルールを 守らないとは。', 'A police officer, of all people, ignoring traffic rules!', 'けいさつかんとも あろう ものが、こうつうるーるを まもらないとは。'),
      ex('大臣とも あろう 人が、そんな 発言を するなんて 信じられない。', 'I cannot believe a minister, of all people, would say such a thing.', 'だいじんとも あろう ひとが、そんな はつげんを するなんて しんじられない。'),
    ],
  },
  'n1m-g-bf1b5c': {
    meaning: 'hard to say whether A or B; neither quite A nor B',
    structure: 'N1 + とも + N2 + とも つかない（つかぬ）+ N',
    explanation:
      'とも〜ともつかない describes something ambiguous that could be either of two things: 笑いとも泣きともつかない顔 "a face somewhere between laughing and crying". It usually modifies a noun. か〜か describes uncertainty about facts; ともつかない describes an ambiguous impression.',
    functions: ['vague'],
    examples: [
      ex('彼女は 笑いとも 泣きとも つかない 顔を した。', 'Her face was somewhere between laughing and crying.', 'かのじょは わらいとも なきとも つかない かおを した。'),
      ex('彼の 返事は、賛成とも 反対とも つかない ものだった。', 'His answer was neither quite a yes nor a no.', 'かれの へんじは、さんせいとも はんたいとも つかない ものだった。'),
    ],
  },
  'n1m-g-16f79c': {
    meaning: 'only when it came to ~ (did); as for ~ (extreme case)',
    structure: 'N／V-dict + に 至って（いたって）／ N + に 至っては',
    explanation:
      'に至って says action came only after things reached a serious stage: 死者が出るに至って、ようやく対策がとられた. に至っては singles out the most extreme example in a list: 田中さんに至っては来もしなかった "and Tanaka didn’t even show up". Both are formal.',
    functions: ['extreme-example', 'reaching'],
    examples: [
      ex('死者が 出るに 至って、ようやく 国は 対策に 乗り出した。', 'Only when people died did the government finally take action.', 'ししゃが でるに いたって、ようやく くには たいさくに のりだした。'),
      ex('皆 遅刻したが、田中さんに 至っては 来も しなかった。', 'Everyone was late, and as for Tanaka, he did not even come.', 'みな ちこくしたが、たなかさんに いたっては きも しなかった。'),
    ],
  },
  'n1m-g-f54d20': {
    meaning: 'it is all right to ~; there is no problem with ~ (formal)',
    structure: 'V-て + も 差し支え（さしつかえ）ない（ありません）',
    explanation:
      'ても差し支えない is a formal way to give permission or say something is acceptable: 鉛筆で書いても差し支えありません. It is common in business and official instructions. てもいい is casual; てもかまわない is in between.',
    functions: ['allow'],
    examples: [
      ex('用紙は 鉛筆で 書いても 差し支え ありません。', 'You may fill in the form in pencil.', 'ようしは えんぴつで かいても さしつかえ ありません。'),
      ex('体調が 悪ければ、明日の 会議は 欠席しても 差し支えない。', 'If you feel unwell, it is fine to miss tomorrow’s meeting.', 'たいちょうが わるければ、あしたの かいぎは けっせきしても さしつかえない。'),
    ],
  },
  'n1m-g-7987fa': {
    meaning: "there's hardly any point in ~; it's not (as if) ~",
    structure: 'V-dict／N + でも ある まい（し）',
    explanation:
      'でもあるまい dismisses an action or idea as unnecessary or out of place: 今さら騒ぐでもあるまい "there is hardly any point making a fuss now". With し it gives a reason for advice: 子供でもあるまいし、泣くな. ではあるまいし is similar but attaches to nouns only.',
    functions: ['negative', 'criticize'],
    examples: [
      ex('済んだ ことだ。今さら 騒ぐ でも あるまい。', "It's over and done. There's hardly any point in making a fuss now.", 'すんだ ことだ。いまさら さわぐ でも あるまい。'),
      ex('子供でも あるまいし、そんな ことで 泣くな。', "You're not a child. Don't cry over something like that.", 'こどもでも あるまいし、そんな ことで なくな。'),
    ],
  },
  'n1m-g-b18694': {
    meaning: 'unlike oneself; out of character (柄にもなく, 年にもなく)',
    structure: 'N（柄・年・我 など）+ にも なく',
    explanation:
      'にもなく says someone acted in a way that does not fit their character, age or usual self: 柄にもなく緊張した "I got nervous, which isn’t like me". The common set phrases are 柄にもなく, 年にもなく and 我にもなく. らしくなく is a plainer equivalent.',
    functions: ['unexpected', 'describe'],
    examples: [
      ex('大勢の 前で、柄にも なく 緊張して しまった。', 'In front of such a crowd I got nervous, which is not like me.', 'おおぜいの まえで、がらにも なく きんちょうして しまった。'),
      ex('父は 年にも なく、若者と 一緒に 踊った。', 'Forgetting his age, my father danced with the young people.', 'ちちは としにも なく、わかものと いっしょに おどった。'),
    ],
  },
  'n1m-g-a702c7': {
    meaning: 'in line with ~; in accordance with ~',
    structure: 'N + に 即して（そくして）／ に 則して（そくして）',
    explanation:
      'に即して means "in line with facts or reality": 事実に即して報告する. に則して, same reading, means "in accordance with rules or standards": 法律に則して処理する. Both are formal; に沿って is the everyday "following".',
    functions: ['standard'],
    examples: [
      ex('事実に 即して 報告して ください。', 'Please report strictly according to the facts.', 'じじつに そくして ほうこくして ください。'),
      ex('この 件は、法律に 則して 処理します。', 'We will handle this matter in accordance with the law.', 'この けんは、ほうりつに そくして しょりします。'),
    ],
  },
  'n1m-g-f10875': {
    meaning: 'that means ~; so that is why ~',
    structure: 'Plain form + と いう わけだ',
    explanation:
      'というわけだ draws a conclusion from facts just given, or reveals the reason behind something: それで忙しそうだったというわけだ "so that’s why he looked busy". わけだ alone is similar; という adds the sense of summing up. ということだ reports or restates rather than concluding.',
    functions: ['conclude', 'explain'],
    examples: [
      ex('毎日 三十分 歩けば、一年で 約 百八十時間 歩く という わけだ。', 'If you walk thirty minutes a day, that means about 180 hours a year.', 'まいにち さんじゅっぷん あるけば、いちねんで やく ひゃくはちじゅうじかん あるく という わけだ。'),
      ex('彼は 来月 転勤するのか。それで 最近 忙しそうだった という わけだ。', "He's being transferred next month? So that's why he's looked so busy.", 'かれは らいげつ てんきんするのか。それで さいきん いそがしそうだった という わけだ。'),
    ],
  },
  'n1m-g-4d9395': {
    meaning: "it's not a question of ~ (of course!); ~ and everything",
    structure: 'Word from the other’s question + も 何（なに）も ／ N + も 何も',
    explanation:
      'Repeating the other person’s word with も何も brushes the question aside as beside the point: 「いい？」「いいも何も、来てくれないと困る」. After a noun it means "~ and everything else": 財布も何も盗まれた. It is conversational.',
    functions: ['emphasize', 'add'],
    examples: [
      ex('「行っても いい？」「いいも 何も、君が 来なきゃ 始まらないよ。」', '"Can I come?" "Of course! We can\'t start without you."', '「いっても いい？」「いいも なにも、きみが こなきゃ はじまらないよ。」'),
      ex('泥棒に 入られて、財布も 何も 全部 取られた。', 'A burglar broke in and took my wallet and everything else.', 'どろぼうに はいられて、さいふも なにも ぜんぶ とられた。'),
    ],
  },
  'n1m-g-aa1596': {
    meaning: "don't ~ (old-fashioned, kindly)",
    structure: 'V-ます stem + なさんな',
    explanation:
      'なさんな is a gentle, old-fashioned prohibition, heard from older speakers giving friendly advice: そんなに心配しなさんな "don’t worry so much". It comes from なさるな. The blunt な (するな) sounds harsh; ないで is the neutral request.',
    functions: ['ban', 'advice'],
    examples: [
      ex('そんなに 心配しなさんな。何とか なるよ。', "Don't worry so much. It'll work out.", 'そんなに しんぱいしなさんな。なんとか なるよ。'),
      ex('若いからと いって、無理を しなさんなよ。', "You may be young, but don't overdo it.", 'わかいからと いって、むりを しなさんなよ。'),
    ],
  },
  'n1m-g-72a7e3': {
    meaning: 'to have a (bad) tendency to ~',
    structure: 'V-dict／N の + きらい（嫌い）が ある',
    explanation:
      'きらいがある points out an undesirable tendency, usually in a critical tone: 物事を大げさに言うきらいがある. It is written and slightly formal. がちだ describes a tendency to fall into something; 傾向がある is neutral and can be positive.',
    functions: ['trend', 'criticize'],
    examples: [
      ex('彼は 物事を 大げさに 言う きらいが ある。', 'He has a tendency to exaggerate things.', 'かれは ものごとを おおげさに いう きらいが ある。'),
      ex('最近の 報道は、事実より 印象を 重視する きらいが ある。', 'Recent reporting tends to put impressions ahead of facts.', 'さいきんの ほうどうは、じじつより いんしょうを じゅうしする きらいが ある。'),
    ],
  },
  'n1m-g-ae036f': {
    meaning: 'how (wonderful) it would be if ~',
    structure: 'V-たら／V-ば + どんなに + A + だろう（ことか）',
    explanation:
      'たらどんなに〜か expresses a strong wish about something unreal or unlikely: 空を飛べたらどんなに楽しいだろう. ことか adds emotional emphasis, often looking back with regret: 母が生きていたらどんなに喜んだことか. といいのに is a simpler wish.',
    functions: ['wish', 'conditions-contrary-to-reality'],
    examples: [
      ex('空を 飛べたら、どんなに 楽しいだろう。', 'How wonderful it would be to fly!', 'そらを とべたら、どんなに たのしいだろう。'),
      ex('母が 生きて いたら、どんなに 喜んだ ことか。', 'How happy my mother would have been if she were alive.', 'ははが いきて いたら、どんなに よろこんだ ことか。'),
    ],
  },
  'n1m-g-082cf1': {
    meaning: 'of all people (for me / him) to ~ (an uncharacteristic slip)',
    structure: 'N（person）+ と した ことが',
    explanation:
      'としたことが expresses surprise that someone normally careful made a mistake: 私としたことが、鍵をかけ忘れるなんて "how could I, of all people, forget to lock up". It is often said of oneself with embarrassment. ともあろう者が condemns someone of high status.',
    functions: ['surprise', 'regret'],
    examples: [
      ex('私と した ことが、鍵を かけ忘れるなんて。', 'How could I, of all people, forget to lock the door?', 'わたしと した ことが、かぎを かけわすれるなんて。'),
      ex('慎重な 彼と した ことが、こんな ミスを するとは。', 'That someone as careful as him would make a mistake like this!', 'しんちょうな かれと した ことが、こんな みすを するとは。'),
    ],
  },
  'n1m-g-3599cf': {
    meaning: 'judging from ~; from the standpoint of ~',
    structure: 'N + から 言って（いって）（から 言うと／から 言えば）',
    explanation:
      'から言って sets a basis for judgement: 実力から言って、合格は間違いない "judging by her ability, she will certainly pass". It is close to からすると and から見て. Do not confuse it with からといって, which means "just because".',
    functions: ['judge', 'perspective-way'],
    examples: [
      ex('彼女の 実力から いって、合格は 間違いない。', 'Judging by her ability, she is sure to pass.', 'かのじょの じつりょくから いって、ごうかくは まちがいない。'),
      ex('立場から いって、私が 反対する わけには いかない。', 'Given my position, I cannot very well oppose it.', 'たちばから いって、わたしが はんたいする わけには いかない。'),
    ],
  },
  'n1m-g-10e4fb': {
    meaning: 'precisely because ~; only because ~',
    structure: 'V-ば／A-ければ／N で あれば + こそ',
    explanation:
      'ばこそ stresses that a reason is the real and only one, usually a positive motive: あなたのことを思えばこそ、厳しく言う "it is precisely because I care that I am strict". からこそ is the more common equivalent; ばこそ is more literary.',
    functions: ['cause-reason', 'emphasize'],
    examples: [
      ex('あなたの ことを 思えば こそ、厳しく 言うのです。', 'I am hard on you precisely because I care about you.', 'あなたの ことを おもえば こそ、きびしく いうのです。'),
      ex('健康で あれば こそ、好きな 仕事が 続けられる。', 'It is only because I am healthy that I can keep doing work I love.', 'けんこうで あれば こそ、すきな しごとが つづけられる。'),
    ],
  },
  'n1m-g-4ed4e0': {
    meaning: 'on seeing that ~ (someone promptly acts)',
    structure: 'Plain form + と みると（と みるや）',
    explanation:
      'とみると says someone judged a situation and immediately reacted: 相手が弱いとみると強気になる "as soon as he sees the other side is weak, he gets pushy". It describes other people’s quick, calculated reactions. とみるや is more literary; とわかると is neutral.',
    functions: ['immediately-after', 'judge'],
    examples: [
      ex('相手が 弱いと みると、彼は 急に 強気に なった。', 'As soon as he saw his opponent was weak, he suddenly got bold.', 'あいてが よわいと みると、かれは きゅうに つよきに なった。'),
      ex('雨が 降りそうだと みると、店員は すぐ 商品を 片付けた。', 'Seeing it was about to rain, the shop assistant quickly put the goods away.', 'あめが ふりそうだと みると、てんいんは すぐ しょうひんを かたづけた。'),
    ],
  },
};

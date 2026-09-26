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
};

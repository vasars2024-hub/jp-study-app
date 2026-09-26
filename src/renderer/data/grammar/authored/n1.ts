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
  'n1m-g-c936d4': {
    meaning: 'at least; even just a little',
    structure: '数量（少し・一目 など）+ なりとも ／ せめて + N + だけでも',
    explanation:
      'なりとも is a literary particle meaning "even just, at least", attached to a small amount: 少しなりともお役に立てれば "if I can be of even a little help". せめて〜だけでも is the everyday way to say the same. でも alone is plainer; なりとも sounds modest and formal.',
    functions: ['concessions', 'limit'],
    examples: [
      ex('少しなりとも お役に 立てれば 幸いです。', 'I would be glad to be of even a little help.', 'すこしなりとも おやくに たてれば さいわいです。'),
      ex('一目なりとも、故郷の 母に 会いたい。', 'I want to see my mother back home, even if only for a moment.', 'ひとめなりとも、こきょうの ははに あいたい。'),
    ],
  },
  'n1m-g-1f0de7': {
    meaning: 'although there may be ~; though admittedly ~',
    structure: 'N／な-adj + こそ あれ ／ N + こそ すれ、〜ない',
    explanation:
      'こそあれ grants a point in order to set it aside: 程度の差こそあれ、誰にでも悩みはある "though it varies in degree, everyone has worries". The related こそすれ contrasts two opposite reactions: 感謝こそすれ、恨むことはない "I feel grateful, if anything, not resentful". Both are literary.',
    functions: ['concessions', 'emphasize'],
    examples: [
      ex('程度の 差こそ あれ、誰にでも 悩みは ある。', 'Though it differs in degree, everyone has worries.', 'ていどの さこそ あれ、だれにでも なやみは ある。'),
      ex('先生には 感謝こそ すれ、恨む ことなど ない。', 'I feel nothing but gratitude toward my teacher, certainly not resentment.', 'せんせいには かんしゃこそ すれ、うらむ ことなど ない。'),
    ],
  },
  'n1m-g-390df6': {
    meaning: 'on top of that, (it) is ~, so (naturally) ~',
    structure: 'Plain form（N／な-adj は そのまま）+ と きて いるから（ので）',
    explanation:
      'ときているから stacks up features, often surprising or extreme, to explain a result: 安くておいしいときているから、いつも満員だ "it’s cheap and tasty to boot, so it’s always packed". It is conversational and a little emphatic. から alone gives a plain reason without the "on top of that" feeling.',
    functions: ['cause-reason', 'add'],
    examples: [
      ex('この 店は 安くて おいしいと きて いるから、いつも 満員だ。', "This place is cheap and delicious to boot, so it's always full.", 'この みせは やすくて おいしいと きて いるから、いつも まんいんだ。'),
      ex('彼は 頭が いい 上に 努力家と きて いるので、成績が 良いのも 当然だ。', "He's clever and hard-working on top of that, so of course his grades are good.", 'かれは あたまが いい うえに どりょくかと きて いるので、せいせきが よいのも とうぜんだ。'),
    ],
  },
  'n1m-g-6ae8a2': {
    meaning: 'manner of ~; the way one ~s',
    structure: 'N（仕事・話し など）+ ぶり ／ V-ます stem + ぶり',
    explanation:
      'ぶり after an action noun or verb stem describes how someone does it, often with an evaluation: 仕事ぶり "the way she works", 話しぶり "manner of speaking", 食べっぷり "hearty way of eating". After a length of time, ぶり means "for the first time in": 三年ぶり. ふう describes a style or look rather than a way of acting.',
    functions: ['perspective-way', 'describe'],
    examples: [
      ex('彼女の 仕事ぶりは、誰もが 認めて いる。', 'Everyone recognises the way she works.', 'かのじょの しごとぶりは、だれもが みとめて いる。'),
      ex('彼の 話しぶりから すると、何か 知って いるようだ。', 'From the way he talks, he seems to know something.', 'かれの はなしぶりから すると、なにか しって いるようだ。'),
    ],
  },
  'n1m-g-3557d1': {
    meaning: 'ahead of ~; before others (as the first)',
    structure: 'N + に 先駆けて（さきがけて）',
    explanation:
      'に先駆けて says something was done before others, as a pioneer: 他社に先駆けて新製品を発売した "launched the product ahead of rival firms". It carries a sense of leading the way. に先立って means "prior to (an event)", as a preparation, without the pioneering sense.',
    functions: ['time-situation', 'starting-point'],
    examples: [
      ex('この 会社は 他社に 先駆けて、新しい 技術を 導入した。', 'This company introduced the new technology ahead of its rivals.', 'この かいしゃは たしゃに さきがけて、あたらしい ぎじゅつを どうにゅうした。'),
      ex('全国に 先駆けて、この 町で 新しい 制度が 始まった。', 'The new system began in this town before anywhere else in the country.', 'ぜんこくに さきがけて、この まちで あたらしい せいどが はじまった。'),
    ],
  },
  'n1m-g-ddd61b': {
    meaning: 'to look like ~; to take on the air of ~',
    structure: 'N／A stem + びる（大人びる・古びる・田舎びる など）',
    explanation:
      'びる turns a noun or adjective into a verb meaning "to take on the look of": 大人びる "to seem grown-up", 古びる "to become old and worn". It is used with a limited set of words. めく ("show signs of") and っぽい ("-ish") are near-synonyms; びる usually describes a gradual change in appearance.',
    functions: ['similarity-degree', 'describe'],
    examples: [
      ex('娘は 最近、急に 大人びて きた。', 'My daughter has suddenly started to seem grown-up.', 'むすめは さいきん、きゅうに おとなびて きた。'),
      ex('古びた 旅館に 泊まったが、居心地が よかった。', 'We stayed at a worn old inn, but it was very comfortable.', 'ふるびた りょかんに とまったが、いごこちが よかった。'),
    ],
  },
  'n1m-g-5030e8': {
    meaning: 'the reason ~ is (precisely) because of ~',
    structure: 'Clause + のは、+ N の／Plain form + ゆえ（故）で ある',
    explanation:
      'のは〜ゆえである explains a fact by naming its cause at the end of the sentence, in a formal written style: 厳しく言うのは期待しているゆえである "the reason I am strict is that I expect a lot". ゆえ is a literary からだ / ためだ. It suits essays and speeches.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('私が 厳しく 言うのは、君に 期待して いる ゆえで ある。', 'The reason I am hard on you is that I expect a lot of you.', 'わたしが きびしく いうのは、きみに きたいして いる ゆえで ある。'),
      ex('この 作品が 愛されるのは、その 素朴さ ゆえで ある。', 'This work is loved precisely because of its simplicity.', 'この さくひんが あいされるのは、その そぼくさ ゆえで ある。'),
    ],
  },
  'n1m-g-787614': {
    meaning: 'will certainly (make someone) ~; cannot fail to ~',
    structure: 'V-ない + では おかない ／ V-ない stem + ずには おかない',
    explanation:
      'ないではおかない has two uses. With an emotion-causing subject, it means something inevitably provokes a reaction: 人を感動させないではおかない "cannot fail to move people". With a person’s will, it is a strong resolve: 謝らせないではおかない "I will make him apologise". ずにはおかない is the more written form.',
    functions: ['determination-decision', 'of-course'],
    examples: [
      ex('彼の 演奏は、聴く 人を 感動させないでは おかない。', 'His playing cannot fail to move those who hear it.', 'かれの えんそうは、きく ひとを かんどうさせないでは おかない。'),
      ex('今度 こそ、真相を 明らかに せずには おかない。', 'This time I will get to the bottom of it, whatever it takes.', 'こんど こそ、しんそうを あきらかに せずには おかない。'),
    ],
  },
  'n1m-g-ef7cb6': {
    meaning: 'one after another; (so much) ~ that it is astonishing',
    structure: 'V-dict + わ + V-dict + わ（same or related verbs）',
    explanation:
      'VわVわ describes things happening in astonishing quantity or one after another: 出るわ出るわ "they just kept coming". With two different verbs it lists excesses: 食べるわ飲むわの大騒ぎ. It is lively and colloquial. やら〜やら also lists, but わ〜わ stresses amazement at the amount.',
    functions: ['much-less-volume', 'surprise'],
    examples: [
      ex('押し入れを 片付けたら、古い 写真が 出るわ 出るわ。', 'When I cleared out the cupboard, old photos just kept on coming out.', 'おしいれを かたづけたら、ふるい しゃしんが でるわ でるわ。'),
      ex('忘年会では 皆、食べるわ 飲むわの 大騒ぎだった。', 'At the year-end party everyone ate and drank like there was no tomorrow.', 'ぼうねんかいでは みな、たべるわ のむわの おおさわぎだった。'),
    ],
  },
  'n1m-g-f09d79': {
    meaning: 'if only (someone) had ~ (but they did not)',
    structure: 'V-ば + いい ものを（よかった ものを）',
    explanation:
      'ばいいものを criticises someone for not taking an obvious, easy step: 一言言えばいいものを "he could just have said something". It carries regret or irritation, usually about someone else. ばよかったのに is the everyday equivalent; ものを is more literary and reproachful.',
    functions: ['regret', 'criticize'],
    examples: [
      ex('困って いるなら 相談すれば いい ものを、彼は 一人で 抱え込んだ。', 'He could have just asked for help if he was struggling, but he kept it all to himself.', 'こまって いるなら そうだんすれば いい ものを、かれは ひとりで かかえこんだ。'),
      ex('早く 謝れば よかった ものを、意地を 張るから こう なるんだ。', 'You should have apologised straight away. This is what you get for being stubborn.', 'はやく あやまれば よかった ものを、いじを はるから こう なるんだ。'),
    ],
  },
  'n1m-g-f24fa5': {
    meaning: "that's the end; it's all over; that's all there is to it",
    structure: '（もはや）これまでだ ／ V-たら + それまでだ',
    explanation:
      'これまでだ declares that something has reached its end, often with resignation: もはやこれまでだ "this is the end". Similarly, V-たらそれまでだ means "once ~ happens, that is the end of it": 壊れたらそれまでだ. As a plain phrase, 今日はこれまで means "that’s all for today".',
    functions: ['finish', 'limit'],
    examples: [
      ex('資金が 尽きた。もはや これまでだ。', 'The money has run out. This is the end.', 'しきんが つきた。もはや これまでだ。'),
      ex('どんなに いい 道具でも、使わなければ それまでだ。', 'However good a tool is, if you do not use it, that is all there is to it.', 'どんなに いい どうぐでも、つかわなければ それまでだ。'),
    ],
  },
  'n1m-g-2bda66': {
    meaning: 'if you ask ~; in ~’s opinion',
    structure: 'N（person）+ に 言わせれば（いわせれば）',
    explanation:
      'に言わせれば introduces someone’s personal, often critical, opinion that differs from the general view: 母に言わせれば、最近の若者は礼儀を知らない. It is used with people. によると reports information; に言わせれば frames a personal judgement.',
    functions: ['perspective-way', 'judge'],
    examples: [
      ex('母に 言わせれば、最近の 若者は 礼儀を 知らない そうだ。', "According to my mother, young people today don't know their manners.", 'ははに いわせれば、さいきんの わかものは れいぎを しらない そうだ。'),
      ex('私に 言わせれば、その 計画は 甘すぎる。', 'If you ask me, that plan is far too optimistic.', 'わたしに いわせれば、その けいかくは あますぎる。'),
    ],
  },
  'n1m-g-8a8058': {
    meaning: 'if this is not ~, what is? (it is surely ~)',
    structure: 'N + で なくて 何（なん）だろう（何で あろう）',
    explanation:
      'でなくてなんだろう is a rhetorical question that asserts something with great conviction: これが愛でなくて何だろう "if this is not love, what is?". It is literary and emotional, used in essays and speeches. に違いない is a plain certainty without the rhetorical flourish.',
    functions: ['emphasize', 'judge'],
    examples: [
      ex('命を かけて 子を 守る。これが 愛で なくて 何だろう。', 'Risking one’s life to protect a child: if this is not love, what is?', 'いのちを かけて こを まもる。これが あいで なくて なんだろう。'),
      ex('あの 逆転勝利が 奇跡で なくて 何で あろう。', 'If that come-from-behind win was not a miracle, what was?', 'あの ぎゃくてんしょうりが きせきで なくて なんで あろう。'),
    ],
  },
  'n1m-g-d263a0': {
    meaning: 'in the hands of ~; against ~ (no match)',
    structure: 'N（person）+ に かかっては（に かかると・に かかったら）',
    explanation:
      'にかかっては says that when dealing with a particular person, anything or anyone is helpless: 彼にかかってはどんな難問も簡単に解ける. The person is usually skilled, persuasive or overwhelming. It can be admiring or wry.',
    functions: ['situation', 'extremes'],
    examples: [
      ex('彼に かかっては、どんな 難問も すぐに 解けて しまう。', 'In his hands, even the hardest problem is solved in no time.', 'かれに かかっては、どんな なんもんも すぐに とけて しまう。'),
      ex('祖母に かかっては、父も まるで 子供 扱いだ。', 'With my grandmother, even my father gets treated like a little boy.', 'そぼに かかっては、ちちも まるで こども あつかいだ。'),
    ],
  },
  'n1m-g-306de2': {
    meaning: 'I take it that ~; I trust (expect) that ~',
    structure: 'Plain form + もの と 思う（思います・思って おります）',
    explanation:
      'ものと思う states a firm expectation or assumption, often politely in business: ご理解いただけるものと思います "I trust you will understand". It is more confident and formal than と思う. The past ものと思っていた instead reveals a mistaken assumption.',
    functions: ['speculation', 'judge'],
    examples: [
      ex('皆様には ご理解 いただける ものと 思って おります。', 'I trust that everyone will understand.', 'みなさまには ごりかい いただける ものと おもって おります。'),
      ex('この 件は、すでに 解決済みの ものと 思う。', 'I take it that this matter has already been settled.', 'この けんは、すでに かいけつずみの ものと おもう。'),
    ],
  },
  'n1m-g-2f452a': {
    meaning: 'if ~ happens, then (that brings its own ~)',
    structure: 'V-たら + V-たで（A-かったら A-かったで）',
    explanation:
      'たら〜たで repeats the same word to say that even if a situation changes, it has its own problems or you will deal with it: お金がなければ困るが、あったらあったで悩みが増える. It suggests there is no perfect option, or that one will cope when it comes. なら〜なりに is similar in spirit.',
    functions: ['condition', 'invariant'],
    examples: [
      ex('お金は なければ 困るが、あったら あったで 悩みが 増える。', 'Having no money is a problem, but having it brings its own worries.', 'おかねは なければ こまるが、あったら あったで なやみが ふえる。'),
      ex('失敗したら 失敗したで、また やり直せば いい。', 'If it fails, it fails. We can just try again.', 'しっぱいしたら しっぱいしたで、また やりなおせば いい。'),
    ],
  },
  'n1m-g-7750d8': {
    meaning: 'when it comes to (the question of) ~',
    structure: '疑問詞 + Plain form + か と なれば（か と なると）',
    explanation:
      'かとなれば turns to a specific question, usually one that is harder to answer than it seems: 誰が責任を取るかとなれば、話は別だ. It follows an embedded question with a question word or か〜か. となれば alone introduces a situation; かとなれば introduces an issue to decide.',
    functions: ['condition', 'story-topic'],
    examples: [
      ex('計画には 皆 賛成だが、誰が 責任者に なるかと なれば、話は 別だ。', 'Everyone supports the plan, but when it comes to who takes charge, that is another matter.', 'けいかくには みな さんせいだが、だれが せきにんしゃに なるかと なれば、はなしは べつだ。'),
      ex('実際に いくら かかるかと なると、誰も 答えられなかった。', 'When it came to how much it would actually cost, no one could answer.', 'じっさいに いくら かかるかと なると、だれも こたえられなかった。'),
    ],
  },
  'n1m-g-59158e': {
    meaning: 'before one knows it; without one noticing',
    structure: 'V-ない stem + ぬ 間（ま）に（知らぬ 間に・気づかぬ 間に）',
    explanation:
      'ぬ間に is the literary form of ない間に, "while one is not ~ing": 知らぬ間に "without one knowing". It mostly appears in 知らぬ間に and 気づかぬ間に, describing things that happened unnoticed. いつの間にか is the everyday equivalent.',
    functions: ['short-time', 'time-situation'],
    examples: [
      ex('知らぬ 間に、子供たちは すっかり 大きく なって いた。', 'Before I knew it, the children had grown right up.', 'しらぬ まに、こどもたちは すっかり おおきく なって いた。'),
      ex('気づかぬ 間に、財布を 落として いた。', 'I had dropped my wallet without noticing.', 'きづかぬ まに、さいふを おとして いた。'),
    ],
  },
  'n1m-g-f7fa7b': {
    meaning: '(did ~) thinking that ~; because one thought ~',
    structure: 'Plain form + から と 思って',
    explanation:
      'からと思って gives the speaker’s own reasoning or consideration behind an action: 寒いからと思って、上着を持ってきた "I brought a jacket, thinking it might be cold". It softens the reason and shows thoughtfulness. から alone states the reason as fact.',
    functions: ['cause-reason', 'intent'],
    examples: [
      ex('夜は 寒いからと 思って、上着を 持って きた。', 'I brought a jacket, thinking it would be cold at night.', 'よるは さむいからと おもって、うわぎを もって きた。'),
      ex('忙しいだろうからと 思って、連絡を 控えて いた。', 'I held off contacting you because I thought you would be busy.', 'いそがしいだろうからと おもって、れんらくを ひかえて いた。'),
    ],
  },
  'n1m-g-1486bb': {
    meaning: 'while some ~, others ~; just when you think ~, (then) ~',
    structure: 'Plain form + か と 思えば + Plain form（も いる／ある）',
    explanation:
      'かと思えば sets two contrasting things side by side: 喜ぶ人がいるかと思えば、怒る人もいる "some are pleased, while others are angry". It can also describe quick changes: 泣いているかと思えば、もう笑っている. かと思うと is nearly the same.',
    functions: ['contrast', 'cause-time-relationship'],
    examples: [
      ex('この 決定に 喜ぶ 人が いるかと 思えば、怒る 人も いる。', 'Some people are delighted with this decision, while others are angry.', 'この けっていに よろこぶ ひとが いるかと おもえば、おこる ひとも いる。'),
      ex('赤ちゃんは 泣いて いるかと 思えば、もう 笑って いる。', 'One moment the baby is crying, and the next it is already laughing.', 'あかちゃんは ないて いるかと おもえば、もう わらって いる。'),
    ],
  },
  'n1m-v-ff330e': {
    meaning: 'without ~ing (literary)',
    structure: 'V-ない stem + ずして（する → せずして）',
    explanation:
      'ずして is a literary ないで / ずに: 戦わずして勝つ "win without fighting". It often appears in set phrases and formal statements such as 労せずして "effortlessly" and 期せずして "unexpectedly". In modern prose ずに is normal.',
    functions: ['condition-contrary', 'negative'],
    examples: [
      ex('戦わずして 勝つのが、最良の 策で ある。', 'Winning without fighting is the best strategy.', 'たたかわずして かつのが、さいりょうの さくで ある。'),
      ex('期せずして、二人は 同じ 答えを 出した。', 'Without planning it, the two came up with the same answer.', 'きせずして、ふたりは おなじ こたえを だした。'),
    ],
  },
  'n1m-g-937111': {
    meaning: 'it is safe to say ~; one would not be wrong to say ~',
    structure: 'Plain form + と 言っても（いっても）間違い ない（過言では ない）',
    explanation:
      'と言っても間違いない makes a bold claim while stating it is justified: 彼は天才と言っても間違いない "it is fair to call him a genius". と言っても過言ではない ("it is no exaggeration to say") is the more common written form. The plain と言っても without 間違いない means "although I say".',
    functions: ['judge', 'emphasize'],
    examples: [
      ex('彼は 日本一の 職人と 言っても 間違い ない。', 'It is safe to say he is the finest craftsman in Japan.', 'かれは にほんいちの しょくにんと いっても まちがい ない。'),
      ex('この 本が 私の 人生を 変えたと 言っても 過言では ない。', 'It is no exaggeration to say this book changed my life.', 'この ほんが わたしの じんせいを かえたと いっても かごんでは ない。'),
    ],
  },
  'n1m-g-d72766': {
    meaning: 'is considered (to be) ~; is said to ~ (generally accepted)',
    structure: 'N／Plain form + と されて いる',
    explanation:
      'とされている reports a view, rule or tradition as generally accepted: この寺は日本最古とされている. It is common in encyclopedic and official writing. と言われている is broader and more conversational; とされている often implies an authoritative or official standpoint.',
    functions: ['heard', 'information-resource'],
    examples: [
      ex('この 寺は、日本で 最も 古い 木造建築と されて いる。', 'This temple is considered the oldest wooden building in Japan.', 'この てらは、にほんで もっとも ふるい もくぞうけんちくと されて いる。'),
      ex('一日 三十分の 運動が、健康に よいと されて いる。', 'Thirty minutes of exercise a day is considered good for your health.', 'いちにち さんじゅっぷんの うんどうが、けんこうに よいと されて いる。'),
    ],
  },
  'n1m-g-68b837': {
    meaning: 'depending on how one ~; if one ~s a certain way',
    structure: 'V-ます stem（考え・見 など）+ よう に よっては',
    explanation:
      'ようによっては says a thing can look different depending on how you approach it: 考えようによっては、失敗もいい経験だ "looked at a certain way, even failure is a good experience". It usually offers a more positive reading. 次第で depends on an outside factor; ようによっては depends on one’s own way of seeing or doing.',
    functions: ['standard', 'perspective-way'],
    examples: [
      ex('考えように よっては、失敗も いい 経験だ。', 'Depending on how you look at it, failure is a good experience too.', 'かんがえように よっては、しっぱいも いい けいけんだ。'),
      ex('この 絵は、見ように よっては 人の 顔にも 見える。', 'Seen a certain way, this picture also looks like a face.', 'この えは、みように よっては ひとの かおにも みえる。'),
    ],
  },
  'n1m-g-f007d1': {
    meaning: 'not even feel like ~; cannot be bothered to ~',
    structure: 'V-dict + 気（き）にも ならない',
    explanation:
      '気にもならない says one has no desire at all to do something, often out of disgust or exhaustion: 疲れて料理する気にもならない. The も makes it stronger than 気にならない. 気がしない is a milder "don’t feel like".',
    functions: ['negative', 'feel'],
    examples: [
      ex('疲れすぎて、料理を する 気にも ならない。', "I'm so tired I can't even be bothered to cook.", 'つかれすぎて、りょうりを する きにも ならない。'),
      ex('あまりに ひどい 言い訳で、怒る 気にも ならなかった。', 'The excuse was so bad I could not even be bothered to get angry.', 'あまりに ひどい いいわけで、おこる きにも ならなかった。'),
    ],
  },
  'n1m-g-7cc461': {
    meaning: 'needless to say, (but) ~',
    structure: '言う（いう）までも ない ことだが、+ statement',
    explanation:
      '言うまでもないことだが is a polite preface that apologises for stating the obvious before saying it anyway: 言うまでもないことだが、安全が第一だ. It is used in speeches and instructions to stress a basic point. 言うまでもなく is the shorter adverbial form.',
    functions: ['of-course', 'emphasize'],
    examples: [
      ex('言う までも ない ことだが、安全が 第一だ。', 'It goes without saying, but safety comes first.', 'いう までも ない ことだが、あんぜんが だいいちだ。'),
      ex('言う までも ない ことですが、試験中の 私語は 禁止です。', 'Needless to say, talking during the exam is not allowed.', 'いう までも ない ことですが、しけんちゅうの しごは きんしです。'),
    ],
  },
  'n1m-g-f4882a': {
    meaning: 'might (not) be ~ing? (worry, fear)',
    structure: 'V-て + い は しまいか ／ V-ます stem + は しまいか（と 心配だ）',
    explanation:
      'はしまいか expresses a fear that something undesirable might happen or be happening: 誰かに見られていはしまいかと不安になった. It is a literary ないだろうか, usually followed by と心配する or と不安になる. It sounds anxious and formal.',
    functions: ['speculation', 'feel'],
    examples: [
      ex('誰かに 見られて いは しまいかと、不安に なった。', 'I grew anxious that someone might be watching me.', 'だれかに みられて いは しまいかと、ふあんに なった。'),
      ex('失礼な ことを 言いは しまいかと、ずっと 気に なって いた。', 'I kept worrying that I might have said something rude.', 'しつれいな ことを いいは しまいかと、ずっと きに なって いた。'),
    ],
  },
  'n1m-g-79a6b0': {
    meaning: 'extremely ~; utterly ~',
    structure: 'な-adj stem + 極まる（きわまる）／ 極まりない',
    explanation:
      '極まる and 極まりない both mean "to the extreme", with negative な-adjectives: 失礼極まりない "utterly rude", 危険極まる. Despite the ない, 極まりない is not a negation. They are formal and emphatic; 非常に is a neutral "very".',
    functions: ['extremes', 'level'],
    examples: [
      ex('あいさつも せずに 帰るとは、失礼 極まりない。', 'Leaving without even saying goodbye is utterly rude.', 'あいさつも せずに かえるとは、しつれい きわまりない。'),
      ex('夜の 山道を ライトなしで 走るのは、危険 極まる 行為だ。', 'Driving a mountain road at night without lights is extremely dangerous.', 'よるの やまみちを らいとなしで はしるのは、きけん きわまる こういだ。'),
    ],
  },
  'n1m-g-ccef46': {
    meaning: 'it is not hard to ~ (imagine, understand)',
    structure: 'N（想像・察する）+ に 難く（かたく）ない',
    explanation:
      'に難くない says something is easy to imagine or infer: 彼の悲しみは想像に難くない "it is not hard to imagine his grief". It is used almost only with 想像 and 察する, in written style. The meaning is positive despite the ない.',
    functions: ['judge', 'speculation'],
    examples: [
      ex('家族を 失った 彼の 悲しみは、想像に 難く ない。', 'It is not hard to imagine his grief at losing his family.', 'かぞくを うしなった かれの かなしみは、そうぞうに かたく ない。'),
      ex('彼女が どれほど 努力したかは、察するに 難く ない。', 'It is easy to guess how hard she worked.', 'かのじょが どれほど どりょくしたかは、さっするに かたく ない。'),
    ],
  },
  'n1m-g-9bb317': {
    meaning: 'cannot help feeling ~',
    structure: 'N（同情・驚き・怒り など）+ を 禁じ得ない（きんじえない）',
    explanation:
      'を禁じ得ない says an emotion wells up that one cannot suppress: 同情を禁じ得ない "I cannot help feeling sympathy". It takes emotion nouns and is formal and written. ずにはいられない is the everyday equivalent and attaches to verbs.',
    functions: ['feel'],
    examples: [
      ex('被害者の 話を 聞いて、同情を 禁じ得ない。', 'Hearing the victims’ story, I cannot help feeling sympathy.', 'ひがいしゃの はなしを きいて、どうじょうを きんじえない。'),
      ex('その 無責任な 発言には、怒りを 禁じ得なかった。', 'I could not help feeling angry at such an irresponsible remark.', 'その むせきにんな はつげんには、いかりを きんじえなかった。'),
    ],
  },
  'n1m-g-8a1d47': {
    meaning: '(and) in the end even ~ (a bad state of affairs)',
    structure: 'V-dict／この + 始末（しまつ）だ',
    explanation:
      '始末だ describes the worst point a series of bad developments has reached, with exasperation: ついには学校もやめる始末だ "and in the end he even quit school". この始末だ means "and this is the result". ことになった is neutral; 始末だ blames.',
    functions: ['result', 'criticize'],
    examples: [
      ex('彼は 遅刻ばかりで、ついには 無断欠勤する 始末だ。', 'He was always late, and now he has even started skipping work without notice.', 'かれは ちこくばかりで、ついには むだんけっきんする しまつだ。'),
      ex('あれほど 注意したのに、この 始末だ。', 'After all those warnings, this is what happens.', 'あれほど ちゅういしたのに、この しまつだ。'),
    ],
  },
  'n1m-g-4d2b58': {
    meaning: 'in vain; despite (all the effort of) ~',
    structure: 'V-た／N の + 甲斐（かい）も なく ／ V-ます stem + がいも なく',
    explanation:
      '甲斐もなく says an effort did not bring the hoped-for result: 必死の治療の甲斐もなく "despite desperate treatment". It is used with regret, often about illness or competition. The positive 甲斐がある says an effort paid off.',
    functions: ['concessions', 'regret'],
    examples: [
      ex('必死の 治療の 甲斐も なく、祖父は 亡くなった。', 'Despite desperate efforts to treat him, my grandfather passed away.', 'ひっしの ちりょうの かいも なく、そふは なくなった。'),
      ex('毎日 練習した 甲斐も なく、一回戦で 負けて しまった。', 'For all our daily practice, we lost in the first round.', 'まいにち れんしゅうした かいも なく、いっかいせんで まけて しまった。'),
    ],
  },
  'n1m-g-c6b012': {
    title: '～を経て',
    meaning: 'after going through ~; via ~',
    structure: 'N（過程・場所・期間）+ を 経て（へて）',
    explanation:
      'を経て says something passed through a stage, place or period before reaching the next: 厳しい審査を経て採用された. It is formal and written. を通して means "through (a means)" rather than "after passing through". The dump had misread 経て as たて.',
    functions: ['through', 'time-sequence'],
    examples: [
      ex('厳しい 審査を 経て、彼の 作品が 選ばれた。', 'After a rigorous selection process, his work was chosen.', 'きびしい しんさを へて、かれの さくひんが えらばれた。'),
      ex('この 列車は 名古屋を 経て 大阪へ 向かう。', 'This train goes to Osaka via Nagoya.', 'この れっしゃは なごやを へて おおさかへ むかう。'),
    ],
  },
  'n1m-g-cce3be': {
    meaning: 'because (it is) ~ (apologetic excuse)',
    structure: 'N の／V-plain（ない → ぬ）+ こととて',
    explanation:
      'こととて gives a reason, usually as a polite excuse or apology: 慣れぬこととて、ご迷惑をおかけしました "as I am not used to it, I have caused you trouble". It is old-fashioned and formal. ので is the neutral reason marker.',
    functions: ['cause-reason', 'explain'],
    examples: [
      ex('慣れぬ こととて、ご迷惑を おかけしました。', 'Being new to this, I have caused you trouble. I apologise.', 'なれぬ こととて、ごめいわくを おかけしました。'),
      ex('子供の した こととて、どうか お許し ください。', 'It was only a child who did it, so please forgive him.', 'こどもの した こととて、どうか おゆるし ください。'),
    ],
  },
  'n1m-g-9d2f8b': {
    meaning: 'keep ~ing continuously; nothing but ~',
    structure: 'V-ます stem + づめ（詰め）だ',
    explanation:
      'づめ says an action continued without a break, usually tiringly: 立ちづめ "standing the whole time", 働きづめ "working non-stop". It is used with a limited set of verbs. っぱなし also means "leaving in a state", but づめ stresses continuous effort.',
    functions: ['continuity'],
    examples: [
      ex('今日は 一日中 立ちづめで、足が 痛い。', 'I was on my feet all day today, and my legs ache.', 'きょうは いちにちじゅう たちづめで、あしが いたい。'),
      ex('父は 家族の ために 働きづめの 人生だった。', 'My father spent his life working non-stop for his family.', 'ちちは かぞくの ために はたらきづめの じんせいだった。'),
    ],
  },
  'n1m-g-479c80': {
    meaning: 'not hesitate to ~; openly ~ (without shame)',
    structure: 'V-て + はばからない（憚らない）',
    explanation:
      'てはばからない says someone openly says or does something others would be reluctant to: 自分が一番だと言ってはばからない "he openly claims to be the best". It often implies boldness bordering on arrogance. 遠慮なく is neutral "without holding back".',
    functions: ['describe', 'criticize'],
    examples: [
      ex('彼は 自分が 業界一だと 公言して はばからない。', 'He openly declares himself the best in the industry.', 'かれは じぶんが ぎょうかいいちだと こうげんして はばからない。'),
      ex('その 政治家は、差別的な 発言を して はばからなかった。', 'The politician did not hesitate to make discriminatory remarks.', 'その せいじかは、さべつてきな はつげんを して はばからなかった。'),
    ],
  },
  'n1m-g-49c382': {
    meaning: 'both A and B (in every respect)',
    structure: 'N1 + と いい + N2 + と いい',
    explanation:
      'といい〜といい picks two aspects to show that something is outstanding or poor in every way: 味といい値段といい、申し分ない "both taste and price are perfect". It is used for evaluation. も〜も lists neutrally; といい〜といい implies a judgement on the whole.',
    functions: ['denote-by-example', 'evaluate'],
    examples: [
      ex('この 店は、味と いい 値段と いい、申し分 ない。', 'Taste and price alike, this restaurant is perfect.', 'この みせは、あじと いい ねだんと いい、もうしぶん ない。'),
      ex('服装と いい 言葉遣いと いい、彼は 社会人らしく ない。', 'Both his clothes and his language are unbecoming of a working adult.', 'ふくそうと いい ことばづかいと いい、かれは しゃかいじんらしく ない。'),
    ],
  },
  'n1m-g-9e12b6': {
    meaning: 'whether you call it A or B; A, or rather B',
    structure: 'N／A + と いうか + N／A + と いうか',
    explanation:
      'というか〜というか searches for the right description, offering two that both partly fit: 大胆というか無謀というか "bold or reckless, I can’t tell which". It shows the speaker’s hesitation or wry amazement. といおうか〜といおうか is a slightly more formal variant.',
    functions: ['vague', 'describe'],
    examples: [
      ex('一人で 冬山に 行くなんて、大胆と いうか 無謀と いうか。', 'Going up a winter mountain alone is bold, or maybe just reckless.', 'ひとりで ふゆやまに いくなんて、だいたんと いうか むぼうと いうか。'),
      ex('彼女は 素直と いおうか 単純と いおうか、すぐ 人を 信じる。', 'She is honest, or perhaps naive: she trusts people instantly.', 'かのじょは すなおと いおうか たんじゅんと いおうか、すぐ ひとを しんじる。'),
    ],
  },
  'n1m-g-d4b72c': {
    meaning: 'indescribably ~; ~ beyond words',
    structure: 'A-い／N + と いったら ない（と いったら ありゃ しない）',
    explanation:
      'といったらない says a feeling or quality is so extreme that words fail: 恥ずかしいといったらない "embarrassing beyond words". Despite the ない, it is emphatic, not negative. といったらありゃしない is a colloquial, usually negative version.',
    functions: ['extremes', 'emphasize'],
    examples: [
      ex('大勢の 前で 転んで、恥ずかしいと いったら なかった。', 'I fell over in front of everyone. It was embarrassing beyond words.', 'おおぜいの まえで ころんで、はずかしいと いったら なかった。'),
      ex('山頂から 見た 朝日の 美しさと いったら ない。', 'The sunrise seen from the summit was indescribably beautiful.', 'さんちょうから みた あさひの うつくしさと いったら ない。'),
    ],
  },
  'n1m-g-70e061': {
    meaning: 'even ~ (is no exception); even if ~',
    structure: 'N + とて ／ V-た + とて',
    explanation:
      'After a noun, とて means "even N, too": 私とて人間だ "I too am only human". After V-た, it means "even if": 今さら謝ったとて、許してはもらえない. It is literary; でも and たって are the everyday forms.',
    functions: ['concessions'],
    examples: [
      ex('私とて 人間だ。間違える ことも ある。', 'I am only human too. I make mistakes as well.', 'わたしとて にんげんだ。まちがえる ことも ある。'),
      ex('今さら 謝ったとて、許しては もらえないだろう。', 'Even if I apologise now, I probably will not be forgiven.', 'いまさら あやまったとて、ゆるしては もらえないだろう。'),
    ],
  },
  'n1m-g-69bef5': {
    meaning: 'the moment (someone) saw that ~',
    structure: 'Plain form + と みるや（いなや）',
    explanation:
      'とみるや describes someone reacting instantly after judging a situation: チャンスとみるや、一気に攻めた. It is literary, used in narratives and sports reports. とみると is the plainer form; とみるや stresses the speed of the reaction.',
    functions: ['immediately-after'],
    examples: [
      ex('相手の 守りが 崩れたと みるや、彼は 一気に 攻め込んだ。', 'The moment he saw the defence break down, he charged straight in.', 'あいての まもりが くずれたと みるや、かれは いっきに せめこんだ。'),
      ex('形勢が 不利と みるや、彼は さっさと 退散した。', 'As soon as he saw the tide was against him, he beat a hasty retreat.', 'けいせいが ふりと みるや、かれは さっさと たいさんした。'),
    ],
  },
  'n1m-g-d5e7c1': {
    meaning: 'precisely because (one has) a little ~ (it backfires)',
    structure: 'なまじ（っか）+ clause + から（ために）、+ bad result',
    explanation:
      'なまじ says a half-measure or partial advantage causes trouble: なまじ知識があるから、かえって迷う "because I know a little, I get even more confused". It implies it would have been better to have none at all. かえって often appears in the result.',
    functions: ['cause-reason', 'unexpected-outcome'],
    examples: [
      ex('なまじ 知識が ある から、かえって 迷って しまう。', 'Knowing just a little makes me even more unsure.', 'なまじ ちしきが ある から、かえって まよって しまう。'),
      ex('なまじ 期待した ために、落ち込みも 大きかった。', 'Because I had half got my hopes up, the disappointment was all the greater.', 'なまじ きたいした ために、おちこみも おおきかった。'),
    ],
  },
  'n1m-g-4c7ecf': {
    meaning: 'only (when / someone like) ~ can; not until ~',
    structure: 'N + に して 初めて（はじめて）',
    explanation:
      'にしてはじめて says only a particular person, level or experience makes something possible: 一流の職人にしてはじめてできる技 "a skill only a master can manage". It is formal. てはじめて ("only after doing ~") attaches to verbs; にしてはじめて attaches to nouns.',
    functions: ['limit', 'condition-requirement'],
    examples: [
      ex('これは 一流の 職人に して 初めて できる 技だ。', 'This is a technique only a master craftsman can manage.', 'これは いちりゅうの しょくにんに して はじめて できる わざだ。'),
      ex('四十歳に して 初めて、親の ありがたさが わかった。', 'It was not until I was forty that I understood how much I owed my parents.', 'よんじゅっさいに して はじめて、おやの ありがたさが わかった。'),
    ],
  },
  'n1m-g-748b1b': {
    meaning: 'cannot bear to ~; cannot bring oneself to ~',
    structure: 'V-dict + に 忍びない（しのびない）',
    explanation:
      'に忍びない says one cannot bring oneself to do something because of pity or attachment: 捨てるに忍びない "I can’t bear to throw it away". 見るに忍びない means "too pitiful to watch". It is formal and emotional; できない is plain inability.',
    functions: ['feel', 'negative'],
    examples: [
      ex('祖母の 形見なので、捨てるに 忍びない。', "It was my grandmother's, so I can't bear to throw it away.", 'そぼの かたみなので、すてるに しのびない。'),
      ex('被災地の 様子は、見るに 忍びなかった。', 'The state of the disaster area was too painful to look at.', 'ひさいちの ようすは、みるに しのびなかった。'),
    ],
  },
  'n1m-g-6c7929': {
    meaning: 'able to withstand ~ (heat, pressure, criticism)',
    structure: 'N（高温・批判 など）+ に 耐える（たえる）／ に 耐えられない',
    explanation:
      'に耐える with 耐 means physically or mentally withstanding something harsh: 高温に耐える素材, 批判に耐える. The homophone に堪える means "worth ~ing" (鑑賞に堪える). Use 耐える for endurance, 堪える for being worthy of attention.',
    functions: ['ability'],
    examples: [
      ex('この 素材は、千度の 高温にも 耐える。', 'This material can withstand temperatures of up to a thousand degrees.', 'この そざいは、せんどの こうおんにも たえる。'),
      ex('厳しい 批判に 耐えて、彼は 研究を 続けた。', 'He withstood fierce criticism and carried on with his research.', 'きびしい ひはんに たえて、かれは けんきゅうを つづけた。'),
    ],
  },
  'n1m-g-b124bd': {
    meaning: 'in light of ~; checked against ~',
    structure: 'N（規則・経験・事実）+ に 照らして（てらして）',
    explanation:
      'に照らして judges something by comparing it with a standard: 法律に照らして処分する "deal with it in light of the law". It is formal. に基づいて means "based on"; に照らして stresses checking against the standard.',
    functions: ['standard', 'judge'],
    examples: [
      ex('規則に 照らして、今回の 件を 処分する。', 'We will deal with this case in light of the regulations.', 'きそくに てらして、こんかいの けんを しょぶんする。'),
      ex('過去の 経験に 照らして 考えると、この 計画は 危うい。', 'Judging by past experience, this plan looks risky.', 'かこの けいけんに てらして かんがえると、この けいかくは あやうい。'),
    ],
  },
  'n1m-g-6f586d': {
    meaning: 'needless to say (A), (and even B)',
    structure: 'N1 + は 言わずもがな（いわずもがな）、N2 + も',
    explanation:
      'は言わずもがな says A is so obvious it need not be mentioned, and adds a less obvious B: 大人は言わずもがな、子供も楽しめる "children as well as, of course, adults can enjoy it". It is literary. はもちろん is the everyday equivalent. As a noun phrase, 言わずもがなのこと means "something better left unsaid".',
    functions: ['of-course', 'add'],
    examples: [
      ex('この 映画は、大人は 言わずもがな、子供も 楽しめる。', 'Adults, needless to say, but children too can enjoy this film.', 'この えいがは、おとなは いわずもがな、こどもも たのしめる。'),
      ex('英語は 言わずもがな、中国語も 話せる。', 'She speaks Chinese as well as, of course, English.', 'えいごは いわずもがな、ちゅうごくごも はなせる。'),
    ],
  },
  'n1m-g-acda24': {
    meaning: 'whatever ~ may be; regardless of ~',
    structure: 'N + は どう（で）あれ',
    explanation:
      'はどうあれ sets aside a factor as irrelevant to the conclusion: 理由はどうあれ、暴力はいけない "whatever the reason, violence is wrong". It is formal. はともかく also sets something aside, but はどうあれ stresses that any value of it leads to the same result.',
    functions: ['invariant'],
    examples: [
      ex('理由は どう あれ、暴力は 許されない。', 'Whatever the reason, violence cannot be tolerated.', 'りゆうは どう あれ、ぼうりょくは ゆるされない。'),
      ex('結果は どうで あれ、最後まで 全力を 尽くしたい。', 'Whatever the outcome, I want to give it everything to the end.', 'けっかは どうで あれ、さいごまで ぜんりょくを つくしたい。'),
    ],
  },
  'n1m-g-3ac443': {
    meaning: 'hastily; barely ~ing (before moving on)',
    structure: 'N（食事・挨拶 など）+ も そこそこに + V',
    explanation:
      'もそこそこに says an action was cut short in a rush to do the next thing: 挨拶もそこそこに本題に入った "barely saying hello, he got down to business". It suggests haste or eagerness. そこそこ on its own means "reasonably, fairly".',
    functions: ['short-time', 'describe'],
    examples: [
      ex('彼は 挨拶も そこそこに、本題に 入った。', 'Barely stopping to say hello, he got straight down to business.', 'かれは あいさつも そこそこに、ほんだいに はいった。'),
      ex('子供たちは 朝ご飯も そこそこに、遊びに 出かけた。', 'The children gulped down breakfast and dashed out to play.', 'こどもたちは あさごはんも そこそこに、あそびに でかけた。'),
    ],
  },
  'n1m-v-b2cb21': {
    meaning: 'there is no need to ~; one need not ~',
    structure: 'V-dict + ことも ない（ことは ない）',
    explanation:
      'ことはない / こともない says an action is unnecessary, often to reassure: わざわざ行くこともない "there is no need to go all that way". こともない is a little softer than ことはない. It is different from V-た + ことがない, "have never done".',
    functions: ['negative', 'advice'],
    examples: [
      ex('電話で 済むなら、わざわざ 行く ことも ない。', 'If a phone call will do, there is no need to go all that way.', 'でんわで すむなら、わざわざ いく ことも ない。'),
      ex('君が 謝る ことは ないよ。悪いのは 僕だ。', "There's no need for you to apologise. It was my fault.", 'きみが あやまる ことは ないよ。わるいのは ぼくだ。'),
    ],
  },
};

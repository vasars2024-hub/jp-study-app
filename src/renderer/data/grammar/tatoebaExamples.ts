/**
 * Example sentences imported from the Tatoeba corpus.
 *
 * ATTRIBUTION (required): sentences are from the Tatoeba Project
 * (https://tatoeba.org) and are released under CC-BY 2.0 FR
 * (https://creativecommons.org/licenses/by/2.0/fr/). Each example keeps its
 * upstream sentence id in `sourceId` so any sentence remains traceable to
 * its author. This notice must travel with the data — see the Tatoeba
 * credit surfaced in the app UI.
 *
 * GENERATED FILE — do not hand-edit. Regenerate with the Phase 1.5 import
 * pipeline. Sentences were matched to grammar patterns by bounded regex and
 * then filtered by morpheme-boundary agreement using the same kuromoji +
 * IPADIC dictionary the app ships, because raw substring matching put ずに
 * inside じょうずに and がる inside 転がる.
 *
 * Records covered: 706.
 * Held back: 234 whose pattern is an all-kana core under 4
 * characters — boundary agreement is not enough to disambiguate those (…も…も
 * still matched もっとも), so they keep no examples rather than wrong ones.
 */

import type { GrammarExample } from './types';

export const TATOEBA_EXAMPLES: Readonly<Record<string, GrammarExample[]>> = {
  // N1 ～ともあろうものが
  'n1m-g-031bfc': [
    { jp: '大学の教授ともあろうものが、なぜ殺人事件を起こしたのだろうか。', reading: 'だいがくのきょうじゅともあろうものが、なぜさつじんじけんをおこしたのだろうか。', en: 'Why would a university lecturer of all people end up responsible for a murder?', sourceId: '75899', source: 'tatoeba' },
  ],
  // N1 ～なにしろ
  'n1m-g-05ac06': [
    { jp: '彼女はうまくゆかなかったが、なにしろ初めてのことだったからね。', reading: 'かのじょはうまくゆかなかったが、なにしろはじめてのことだったからね。', en: 'She did not succeed, but after all that was her first attempt.', sourceId: '93161', source: 'tatoeba' },
    { jp: 'なにしろ、独り者で。', reading: 'なにしろ、ひとりもので。', en: 'I\'m still single.', sourceId: '199101', source: 'tatoeba' },
  ],
  // N1 にあっても
  'n1m-g-06549b': [
    { jp: '彼女は夫の死にあっても心を動かされなかった。', reading: 'かのじょはおっとのしにあってもこころをうごかされなかった。', en: 'She was quite unaffected by the death of her husband.', sourceId: '86945', source: 'tatoeba' },
    { jp: '彼女は交通事故にあっても何ともなかった。', reading: 'かのじょはこうつうじこにあってもなんともなかった。', en: 'She was none the worse for the traffic accident.', sourceId: '90162', source: 'tatoeba' },
    { jp: '彼は混乱の真っ只中にあっても冷静だ。', reading: 'かれはこんらんのまっただなかにあってもれいせいだ。', en: 'He is cool amid confusion.', sourceId: '107014', source: 'tatoeba' },
  ],
  // N1 なしに(は)/なしで(は)
  'n1m-g-0666a2': [
    { jp: '労働者は事前通知なしに解雇されることはない。', reading: 'ろうどうしゃはじぜんつうちなしにかいこされることはない。', en: 'No workers can be dismissed without previous notice.', sourceId: '77364', source: 'tatoeba' },
    { jp: '利用条件を予告なしに変更することがあります。', reading: 'りようじょうけんをよこくなしにへんこうすることがあります。', en: 'Terms of use may be changed without notice.', sourceId: '78385', source: 'tatoeba' },
    { jp: '彼は砂糖なしでコーヒーを飲むのが好きである。', reading: 'かれはさとうなしでコーヒーをのむのがすきである。', en: 'He likes drinking coffee without sugar.', sourceId: '107004', source: 'tatoeba' },
  ],
  // N1 に限る
  'n1m-g-071752': [
    { jp: '英作文の上達には英語で日記を付けるに限る。', reading: 'えいさくぶんのじょうたつにはえいごでにっきをつけるにかぎる。', en: 'The best way to master English composition is to keep a diary in English.', sourceId: '188977', source: 'tatoeba' },
    { jp: '暑い時は、キーンと冷えたビールに限るね。', reading: 'あついときは、キーンとひえたビールにかぎるね。', en: 'When it\'s hot, there\'s nothing like a ice cold beer.', sourceId: '10838458', source: 'tatoeba' },
    { jp: '志願者は女性に限ると規定されている。', reading: 'しがんしゃはじょせいにかぎるときていされている。', en: 'It is provided that the applicants must be woman.', sourceId: '168293', source: 'tatoeba' },
  ],
  // N1 ～としたことが
  'n1m-g-082cf1': [
    { jp: 'トムとしたことが何やってるんだよ。', reading: 'トムとしたことがなにやってるんだよ。', en: 'Tom should\'ve known better.', sourceId: '9667160', source: 'tatoeba' },
  ],
  // N1 としたところで/としたって/にしたところで/にしたって
  'n1m-g-0f01e6': [
    { jp: '彼が本当の理由を見つけようとしたって無駄だ。', reading: 'かれがほんとうのりゆうをみつけようとしたってむだだ。', en: 'It\'s no good his trying to find the true reason.', sourceId: '119473', source: 'tatoeba' },
    { jp: '逃げようとしたってだめだ。', reading: 'にげようとしたってだめだ。', en: 'It is no use trying to escape.', sourceId: '123891', source: 'tatoeba' },
    { jp: '大幅な値上げをＯＰＥＣのせいにしようとしたってそうはいかない。とても納得できないね。', reading: 'おおはばなねあげをおぺっくのせいにしようとしたってそうはいかない。とてもなっとくできないね。', en: 'You can\'t cop out on explaining a price increase of that size by blaming OPEC; that won\'t wash.', sourceId: '137282', source: 'tatoeba' },
  ],
  // N1 ～もってのほかだ
  'n1m-g-0f21db': [
    { jp: '彼女は英語を話せない、ましてやフランス語なんてもってのほかだ。', reading: 'かのじょはえいごをはなせない、ましてやフランスごなんてもってのほかだ。', en: 'She can\'t speak English, much less French.', sourceId: '91013', source: 'tatoeba' },
    { jp: '小さな声でも話すな。まして、大きな声で話すなど、もってのほかだ。', reading: 'ちいさなこえでもはなすな。まして、おおきなこえではなすなど、もってのほかだ。', en: 'Don\'t whisper, let alone speak.', sourceId: '77167', source: 'tatoeba' },
    { jp: '私は中古車を買う余裕などなく、ましてや新車などはもってのほかだ。', reading: 'わたしはちゅうこしゃをかうよゆうなどなく、ましてやしんしゃなどはもってのほかだ。', en: 'I can\'t afford to buy a used car, much less a new car.', sourceId: '155098', source: 'tatoeba' },
  ],
  // N1 を限りに/限りで
  'n1m-g-0fd538': [
    { jp: '彼は、私の知る限りでは、信頼できる友達です。', reading: 'かれは、わたしのしるかぎりでは、しんらいできるともだちです。', en: 'He is, so far as I know, a reliable friend.', sourceId: '115509', source: 'tatoeba' },
    { jp: '私の知る限りではその小説は和訳されていない。', reading: 'わたしのしるかぎりではそのしょうせつはわやくされていない。', en: 'As far as I know, the novel is not translated into Japanese.', sourceId: '163043', source: 'tatoeba' },
    { jp: '私の知る限りでは、彼女はまだ出発していない。', reading: 'わたしのしるかぎりでは、かのじょはまだしゅっぱつしていない。', en: 'To my knowledge, she has not left yet.', sourceId: '163044', source: 'tatoeba' },
  ],
  // N1 ～べくもない
  'n1m-g-13f15a': [
    { jp: '彼女が言っているのは本当かどうか、私には分かるべくもない。', reading: 'かのじょがいっているのはほんとうかどうか、わたしにはわかるべくもない。', en: 'I have no way of knowing whether she\'s telling the truth or not.', sourceId: '6768428', source: 'tatoeba' },
    { jp: '勝つべくもない戦争に意図的に参加するなんて、自殺みたいなものである。', reading: 'かつべくもないせんそうにいとてきにさんかするなんて、じさつみたいなものである。', en: 'Getting into a war you know you can\'t win is like suicide.', sourceId: '6768406', source: 'tatoeba' },
    { jp: 'ラジオヘッドとは比べるべくもないが、カシミールはなかないいバンドだよ。', reading: 'ラジオヘッドとはくらべるべくもないが、カシミールはなかないいバンドだよ。', en: 'Although you can\'t compare them to Radiohead, Kashmir is a pretty darn good band.', sourceId: '6768351', source: 'tatoeba' },
  ],
  // N1 といったところだ
  'n1m-g-16a4f1': [
    { jp: 'あのヘディングのゴールは技ありといったところだな。', reading: 'あのヘディングのゴールはわざありといったところだな。', en: 'That heading goal is impressive, to say the least.', sourceId: '11023109', source: 'tatoeba' },
    { jp: '新しいレストランの食事は特にどうということはない。よくて平均的といったところだ。', reading: 'あたらしいレストランのしょくじはとくにどうということはない。よくてへいきんてきといったところだ。', en: 'The food at the new restaurant is nothing special - average at best.', sourceId: '145458', source: 'tatoeba' },
  ],
  // N1 ～にいたって（～に至って）
  'n1m-g-16f79c': [
    { jp: '先週末ボストンにいたって本当？', reading: 'せんしゅうまつボストンにいたってほんとう？', en: 'Is it true that you were in Boston last weekend?', sourceId: '10917179', source: 'tatoeba' },
  ],
  // N1 ～あたかも
  'n1m-g-176e29': [
    { jp: '彼女はあたかも幽霊でも見たかのように見えた。', reading: 'かのじょはあたかもゆうれいでもみたかのようにみえた。', en: 'She looked as if she had seen a ghost.', sourceId: '93461', source: 'tatoeba' },
    { jp: '彼はあたかも金持ちのような口の利き方をする。', reading: 'かれはあたかもかねもちのようなくちのききかたをする。', en: 'He talks as if he were rich.', sourceId: '114959', source: 'tatoeba' },
    { jp: '彼はあたかもすべてを知っているかのように話す。', reading: 'かれはあたかもすべてをしっているかのようにはなす。', en: 'He talks as if he knew everything.', sourceId: '114961', source: 'tatoeba' },
  ],
  // N1 ～てしかるべきだ
  'n1m-g-1abc6e': [
    { jp: '君の年頃ではもっと分別があってしかるべきだよ。', reading: 'きみのとしごろではもっとふんべつがあってしかるべきだよ。', en: 'At your age, you ought to know better.', sourceId: '178082', source: 'tatoeba' },
    { jp: '君の年齢ならもっと思慮分別があってしかるべきだ。', reading: 'きみのねんれいならもっとしりょふんべつがあってしかるべきだ。', en: 'You should know better at your age.', sourceId: '178079', source: 'tatoeba' },
    { jp: '老人のための国立の病院がもっとあってしかるべきだ。', reading: 'ろうじんのためのこくりつのびょういんがもっとあってしかるべきだ。', en: 'There should be more national hospitals for old people.', sourceId: '77297', source: 'tatoeba' },
  ],
  // N1 ～といわんばかり
  'n1m-g-1c5217': [
    { jp: '彼らは「かわいそうな奴」といわんばかりに私達をじっと見た。', reading: 'かれらは「かわいそうなやつ」といわんばかりにわたしたちをじっとみた。', en: 'They looked at us, as much as to say, "Poor creature."', sourceId: '98306', source: 'tatoeba' },
  ],
  // N1 まんまと
  'n1m-g-2081ef': [
    { jp: '彼は私には賢すぎて、私はまんまとだまされた。', reading: 'かれはわたしにはかしこすぎて、わたしはまんまとだまされた。', en: 'He was too clever for me and I was done brown.', sourceId: '106151', source: 'tatoeba' },
    { jp: '彼は月並みな家の広告にまんまとだまされた。', reading: 'かれはつきなみないえのこうこくにまんまとだまされた。', en: 'He fell for that old ad for a house like a ton of bricks.', sourceId: '107773', source: 'tatoeba' },
    { jp: 'その老婦人はまんまと詐欺師の餌食となった。', reading: 'そのろうふじんはまんまとさぎしのえじきとなった。', en: 'The old woman fell an easy prey to the fraud.', sourceId: '206090', source: 'tatoeba' },
  ],
  // N1 もしくは
  'n1m-g-2198b8': [
    { jp: '７０年もしくは８０年が人間の普通の寿命期間である。', reading: '[７|][０|]ねんもしくは[８|][０|]ねんがにんげんのふつうのじゅみょうきかんである。', en: 'Seventy or eighty years is the normal span of a man\'s life.', sourceId: '235017', source: 'tatoeba' },
    { jp: '彼は英語、フランス語、もしくはドイツ語を話せますか？', reading: 'かれはえいご、フランスご、もしくはドイツごをはなせますか？', en: 'Does he speak English, French or German?', sourceId: '869762', source: 'tatoeba' },
    { jp: 'キャサリン、もしくは略してキャス。', reading: 'キャサリン、もしくはりゃくしてキャス。', en: 'Catherine, or Cath for short.', sourceId: '3367046', source: 'tatoeba' },
  ],
  // N1 ～に（は）あたらない
  'n1m-g-2362af': [
    { jp: '彼が失敗したことは、べつだん驚くにはあたらない。', reading: 'かれがしっぱいしたことは、べつだんおどろくにはあたらない。', en: 'It is no wonder that he failed.', sourceId: '3450228', source: 'tatoeba' },
    { jp: '天気予報はめったにあたらない。', reading: 'てんきよほうはめったにあたらない。', en: 'Weather reports rarely come true.', sourceId: '125078', source: 'tatoeba' },
    { jp: '彼の辞職は驚くにあたらない。', reading: 'かれのじしょくはおどろくにあたらない。', en: 'It is not surprising that he resigned.', sourceId: '3450221', source: 'tatoeba' },
  ],
  // N1 ～ないまでも
  'n1m-g-293f93': [
    { jp: '彼女は太っているとはいえないまでも大柄な人だ。', reading: 'かのじょはふとっているとはいえないまでもおおがらなひとだ。', en: 'She is large, not to say fat.', sourceId: '88065', source: 'tatoeba' },
    { jp: '彼女はけちとは言わないまでも、とてもつましい。', reading: 'かのじょはけちとはいわないまでも、とてもつましい。', en: 'She is very frugal, not to say stingy.', sourceId: '92923', source: 'tatoeba' },
    { jp: '彼は太っていると言えないまでも大柄だった。', reading: 'かれはふとっているといえないまでもおおがらだった。', en: 'He was large, not to say fat.', sourceId: '102552', source: 'tatoeba' },
  ],
  // N1 ながらに
  'n1m-g-2aec34': [
    { jp: '彼は子供ながらにお母さんを助けるために一生懸命働いた。', reading: 'かれはこどもながらにおかあさんをたすけるためにいっしょうけんめいはたらいた。', en: 'Child as he was, he worked hard to help his mother.', sourceId: '106551', source: 'tatoeba' },
    { jp: 'トムは涙ながらにテレビを見ていた。', reading: 'トムはなみだながらにテレビをみていた。', en: 'Tom was watching TV with tears in his eyes.', sourceId: '10917244', source: 'tatoeba' },
    { jp: '彼女は涙ながらに友達と別れた。', reading: 'かのじょはなみだながらにともだちとわかれた。', en: 'She parted from her friend in tears.', sourceId: '86243', source: 'tatoeba' },
  ],
  // N1 ～あかつきには
  'n1m-g-2ede5c': [
    { jp: '当選のあかつきには皆様のために一生懸命に働きます。', reading: 'とうせんのあかつきにはみなさまのためにいっしょうけんめいにはたらきます。', en: 'Once elected, I will do my best for all of you who supported me.', sourceId: '124023', source: 'tatoeba' },
  ],
  // N1 ～たいしたことはない
  'n1m-g-2ee426': [
    { jp: '一人くらい増えても減ってもたいしたことはない。', reading: 'いちにんくらいふえてもへってもたいしたことはない。', en: 'One person more or less doesn\'t make much difference.', sourceId: '190501', source: 'tatoeba' },
    { jp: '私は彼の過ちはたいしたことはないとみなしている。', reading: 'わたしはかれのあやまちはたいしたことはないとみなしている。', en: 'I view his error as insignificant.', sourceId: '153981', source: 'tatoeba' },
    { jp: 'お金なんかたいしたことはない。', reading: 'おかねなんかたいしたことはない。', en: 'Money counts for little.', sourceId: '227266', source: 'tatoeba' },
  ],
  // N1 ～ような...ような
  'n1m-g-2f9d51': [
    { jp: '彼は決してそのようなことをするような人ではない。', reading: 'かれはけっしてそのようなことをするようなひとではない。', en: 'He is above doing such a thing.', sourceId: '107892', source: 'tatoeba' },
    { jp: 'そのような機械がどのようなものなのか、誰も知らなかった。', reading: 'そのようなきかいがどのようなものなのか、だれもしらなかった。', en: 'Nobody knew what the machine was like.', sourceId: '212531', source: 'tatoeba' },
    { jp: '彼はそのような事柄を重視するような父親ではなかった。', reading: 'かれはそのようなことがらをじゅうしするようなちちおやではなかった。', en: 'He wasn\'t the kind of father to make much of such matters.', sourceId: '113117', source: 'tatoeba' },
  ],
  // N1 を前提に
  'n1m-g-3119f9': [
    { jp: 'クレジットとは将来の支払を前提に品物またはお金を受入れる一定額または限度である。', reading: 'クレジットとはしょうらいのしはらいをぜんていにしなものまたはおかねをうけいれるいっていがくまたはげんどである。', en: 'Credit is an amount or limit to the extent of which a person may receive goods or money for payment in the future.', sourceId: '225423', source: 'tatoeba' },
  ],
  // N1 ～べからざる
  'n1m-g-334538': [
    { jp: '水は生きるうえで欠くべからざるものだ。', reading: 'みずはいきるうえでかくべからざるものだ。', en: 'Water is essential to life.', sourceId: '143747', source: 'tatoeba' },
    { jp: '彼は、このチームには欠くべからざる選手であると思わないか。', reading: 'かれは、このチームにはかくべからざるせんしゅであるとおもわないか。', en: 'Don\'t you think he\'s an indispensable player for this team?', sourceId: '6766301', source: 'tatoeba' },
    { jp: '実際にこれらの目標を実現するのに欠くべからざる役割を果たしてきた。', reading: 'じっさいにこれらのもくひょうをじつげんするのにかくべからざるやくわりをはたしてきた。', en: 'These bodies have actually played indispensable roles in attaining these goals.', sourceId: '149334', source: 'tatoeba' },
  ],
  // N1 ～からいって
  'n1m-g-3599cf': [
    { jp: 'それは私が初めからいってきたことです。', reading: 'それはわたしがはじめからいってきたことです。', en: 'That\'s what I said all along.', sourceId: '205164', source: 'tatoeba' },
  ],
  // N1 むやみに
  'n1m-g-38d930': [
    { jp: 'いったん職業を決めたらむやみに変えてはいけない。', reading: 'いったんしょくぎょうをきめたらむやみにかえてはいけない。', en: 'Once you decide to enter a profession, you can\'t change your mind on a whim.', sourceId: '1335128', source: 'tatoeba' },
    { jp: '知らない人からのメールに、むやみに返信したら駄目だよ。', reading: 'しらないひとからのメールに、むやみにへんしんしたらだめだよ。', en: 'You can\'t just answer emails from people you don\'t know.', sourceId: '891774', source: 'tatoeba' },
    { jp: '私はむやみに人と約束はしない。', reading: 'わたしはむやみにひととやくそくはしない。', en: 'I don\'t make a promise to someone without taking it seriously.', sourceId: '1335130', source: 'tatoeba' },
  ],
  // N1 ～とうてい…ない
  'n1m-g-3d53de': [
    { jp: '今度はそれを持ち上げる度胸はとうていないであろう。', reading: 'こんどはそれをもちあげるどきょうはとうていないであろう。', en: 'She just can\'t have the nerve to lift it up now!', sourceId: '172108', source: 'tatoeba' },
    { jp: 'この本は私にはとうていわからない。', reading: 'このほんはわたしにはとうていわからない。', en: 'This book is far above me.', sourceId: '219620', source: 'tatoeba' },
    { jp: '彼女は注意が足りなかったから、試験にはとうてい合格できない。', reading: 'かのじょはちゅういがたりなかったから、しけんにはとうていごうかくできない。', en: 'Careless as she was, she could never pass an examination.', sourceId: '87887', source: 'tatoeba' },
  ],
  // N1 ～くらいで
  'n1m-g-409ed4': [
    { jp: '彼女に振られたくらいでそんなに落ち込むなよ。', reading: 'かのじょにふられたくらいでそんなにおちこむなよ。', en: 'Don\'t be so down in the dumps. You just got dumped, that\'s all.', sourceId: '94807', source: 'tatoeba' },
    { jp: '後どのくらいでお風呂のお湯いっぱいになる？', reading: 'あとどのくらいでおふろのおゆいっぱいになる？', en: 'How much longer will it take for the tub to fill?', sourceId: '174330', source: 'tatoeba' },
    { jp: 'どのくらいでこの洗濯物は出来上がりますか。', reading: 'どのくらいでこのせんたくぶつはできあがりますか。', en: 'How soon will this laundry be ready?', sourceId: '200429', source: 'tatoeba' },
  ],
  // N1 ～ひいては
  'n1m-g-42c80f': [
    { jp: 'テストでは辞書をひいてはいけません。', reading: 'テストではじしょをひいてはいけません。', en: 'Consulting a dictionary is not allowed during the exam.', sourceId: '7976748', source: 'tatoeba' },
  ],
  // N1 なくして(は)～ない
  'n1m-g-492211': [
    { jp: 'リスクなくして、何も学べない。', reading: 'リスクなくして、なにもまなべない。', en: 'If no one ever took any risks, we\'d never learn anything.', sourceId: '9974873', source: 'tatoeba' },
    { jp: '努力なくしては何も得られない。', reading: 'どりょくなくしてはなにもえられない。', en: 'Nothing is achieved without effort.', sourceId: '5013', source: 'tatoeba' },
  ],
  // N1 ～をもって(を以って)
  'n1m-g-4b4840': [
    { jp: '彼は仕事をもっているだけでなく、家事もする。', reading: 'かれはしごとをもっているだけでなく、かじもする。', en: 'He not only has a job but does the housework.', sourceId: '106626', source: 'tatoeba' },
    { jp: '首相は三顧の礼をもって彼を法務大臣に迎えた。', reading: 'しゅしょうはさんこのれいをもってかれをほうむだいじんにむかえた。', en: 'The Prime Minister has won his services as Minister for Justice.', sourceId: '148399', source: 'tatoeba' },
    { jp: '勇気をもって私たちの地球を救ってください。', reading: 'ゆうきをもってわたしたちのちきゅうをすくってください。', en: 'Have the courage to save our Earth.', sourceId: '79412', source: 'tatoeba' },
  ],
  // N1 ～もなにも（～も何も）
  'n1m-g-4d9395': [
    { jp: 'いいですね。私には誰もなにもくれない。', reading: 'いいですね。わたしにはだれもなにもくれない。', en: 'That\'s great. Nobody gives me anything.', sourceId: '229395', source: 'tatoeba' },
  ],
  // N1 くらいなら/ぐらいなら
  'n1m-g-4e74e5': [
    { jp: '彼に金を貸すぐらいなら海に捨てた方がましだ。', reading: 'かれにきんをかすぐらいならうみにすてたほうがましだ。', en: 'You might just as well throw your money into the sea as lend it to him.', sourceId: '118621', source: 'tatoeba' },
    { jp: '私は盗みをするくらいなら餓死したほうがよい。', reading: 'わたしはぬすみをするくらいならがししたほうがよい。', en: 'I would rather starve to death than steal.', sourceId: '154863', source: 'tatoeba' },
    { jp: '君を邪魔するくらいなら私は数独をやってるよ。', reading: 'きみをじゃまするくらいならわたしはすうどくをやってるよ。', en: 'I will play Sudoku then instead of continuing to bother you.', sourceId: '181956', source: 'tatoeba' },
  ],
  // N1 ～に至る
  'n1m-g-50fafc': [
    { jp: '重要なのはゴールではなく、そこに至る道程である。', reading: 'じゅうようなのはゴールではなく、そこにいたるどうていである。', en: 'It is not the goal but the way there that matters.', sourceId: '236967', source: 'tatoeba' },
    { jp: '滅びに至る門は大きく、その道は広い。', reading: 'ほろびにいたるもんはおおきく、そのみちはひろい。', en: 'For the gate is wide and the way is easy, that leads to destruction.', sourceId: '80223', source: 'tatoeba' },
    { jp: '大事に至る前に火事は消し止められた。', reading: 'だいじにいたるまえにかじはけしとめられた。', en: 'The fire was put out before it got serious.', sourceId: '137519', source: 'tatoeba' },
  ],
  // N1 ～すべがない
  'n1m-g-545bea': [
    { jp: '政府もなすすべがないようだ。', reading: 'せいふもなすすべがないようだ。', en: 'It sounds as if the government doesn\'t know what to do.', sourceId: '143063', source: 'tatoeba' },
  ],
  // N1 ～にかこつけて
  'n1m-g-5bade3': [
    { jp: '愛国心にかこつけて多くの殺人が行われてきた。', reading: 'あいこくしんにかこつけておおくのさつじんがおこなわれてきた。', en: 'Many murders have been committed in the name of patriotism.', sourceId: '191535', source: 'tatoeba' },
    { jp: 'あいつは何やかやにかこつけて、いつも文句ばかり言っている。', reading: 'あいつはなんやかやにかこつけて、いつももんくばかりいっている。', en: 'He is complaining about something or other all the time.', sourceId: '3598515', source: 'tatoeba' },
  ],
  // N1 ～たまでだ/ までのことだ
  'n1m-g-5e622f': [
    { jp: '私はただ彼の意見をそのまま言ったまでだ。', reading: 'わたしはただかれのいけんをそのままいったまでだ。', en: 'I just echoed his opinion.', sourceId: '159573', source: 'tatoeba' },
    { jp: '私はただ、当てずっぽうを言ったまでだ。', reading: 'わたしはただ、あてずっぽうをいったまでだ。', en: 'I said so only by guess.', sourceId: '159589', source: 'tatoeba' },
    { jp: '上司に言われたことをしたまでだ。', reading: 'じょうしにいわれたことをしたまでだ。', en: 'I just did what my boss told me to do.', sourceId: '11998561', source: 'tatoeba' },
  ],
  // N1 ～かと思いきや
  'n1m-g-60b03f': [
    { jp: 'もっと古典的な顔立ちなのかと思いきや、今の時代でも充分通用する美形です。', reading: 'もっとこてんてきなかおだちなのかとおもいきや、いまのじだいでもじゅうぶんつうようするびけいです。', en: 'I expected more classical features, but hers is a beauty that would do well even in this age.', sourceId: '74456', source: 'tatoeba' },
  ],
  // N1 ～べからず
  'n1m-g-62f3e4': [
    { jp: '書籍が学問に従うべく、学問が書籍に従うべからず。', reading: 'しょせきががくもんにしたがうべく、がくもんがしょせきにしたがうべからず。', en: 'Books must follow sciences, and not sciences books.', sourceId: '147415', source: 'tatoeba' },
    { jp: '公園の掲示に「芝生に入るべからず」と書いてあった。', reading: 'こうえんのけいじに「しばふにはいるべからず」とかいてあった。', en: 'The notice in the park said, "Keep off the grass."', sourceId: '174034', source: 'tatoeba' },
    { jp: '公園の看板には「芝生に入るべからず」と書いてあった。', reading: 'こうえんのかんばんには「しばふにはいるべからず」とかいてあった。', en: 'The sign in the park read "Keep off the grass."', sourceId: '11924166', source: 'tatoeba' },
  ],
  // N1 ...なり...なり
  'n1m-g-6467f7': [
    { jp: 'あらゆる国の歴史は男なり女なりの心の中に始まる。', reading: 'あらゆるくにのれきしはおとこなりおんななりのこころのなかにはじまる。', en: 'The history of every country begins in the heart of a man or a woman.', sourceId: '230035', source: 'tatoeba' },
    { jp: '誰でも大なり小なり自惚れはある。', reading: 'だれでもだいなりしょうなりうぬぼれはある。', en: 'Everyone is more or less conceited.', sourceId: '136793', source: 'tatoeba' },
    { jp: '煮るなり焼くなり、好きにしてくれ。', reading: 'にるなりやくなり、すきにしてくれ。', en: 'Do as you please.', sourceId: '10535720', source: 'tatoeba' },
  ],
  // N1 とのことだ
  'n1m-g-680b73': [
    { jp: 'ラジオによると、北海で嵐が起こるとのことだ。', reading: 'ラジオによると、ほっかいであらしがおこるとのことだ。', en: 'According to the radio, a storm is imminent in the North.', sourceId: '192626', source: 'tatoeba' },
    { jp: 'トムによれば、メアリーは自殺したとのことだ。', reading: 'トムによれば、メアリーはじさつしたとのことだ。', en: 'According to Tom, Mary killed herself.', sourceId: '12723951', source: 'tatoeba' },
    { jp: '全部調査するには時間が足りなかったとのことだ。', reading: 'ぜんぶちょうさするにはじかんがたりなかったとのことだ。', en: 'They said there was not enough time for a full investigation.', sourceId: '872681', source: 'tatoeba' },
  ],
  // N1 たりとも～ない
  'n1m-g-6d6df4': [
    { jp: '１銭たりともむだにしないのが彼の信条だ。', reading: '[１|]せんたりともむだにしないのがかれのしんじょうだ。', en: 'He makes a religion of never wasting a penny.', sourceId: '235723', source: 'tatoeba' },
    { jp: '１円たりとも無駄使いはできない。', reading: '[１|]えんたりともむだづかいはできない。', en: 'I can\'t afford to waste a single yen.', sourceId: '235816', source: 'tatoeba' },
    { jp: '彼は一日たりともワインなしではいられない。', reading: 'かれはいちにちたりともワインなしではいられない。', en: 'He can\'t go without wine for even a day.', sourceId: '3462814', source: 'tatoeba' },
  ],
  // N1 ～ないでいる／～ずにいる
  'n1m-g-6f8b36': [
    { jp: '彼女の美しさに魅了されずにいることは不可能だ。', reading: 'かのじょのうつくしさにみりょうされずにいることはふかのうだ。', en: 'It\'s impossible not to be fascinated by her beauty.', sourceId: '94041', source: 'tatoeba' },
    { jp: '彼は何日も何も食べないでいることがよくある。', reading: 'かれはなんにちもなにもたべないでいることがよくある。', en: 'He often goes without food for days.', sourceId: '109320', source: 'tatoeba' },
    { jp: '何もしないでいるより働いているほうがましだ。', reading: 'なにもしないでいるよりはたらいているほうがましだ。', en: 'Work is preferable to idleness.', sourceId: '187681', source: 'tatoeba' },
  ],
  // N1 ～きらいがある
  'n1m-g-72a7e3': [
    { jp: '彼は何でもないようなことで怒り出すきらいがある。', reading: 'かれはなにでもないようなことでいかりだすきらいがある。', en: 'He tends to get upset over nothing.', sourceId: '869788', source: 'tatoeba' },
  ],
  // N1 ～でもあるまい
  'n1m-g-7987fa': [
    { jp: '別にいがみ合ってる敵同士でもあるまいし。', reading: 'べつにいがみあってるてきどうしでもあるまいし。', en: 'It\'s not as though we were enemies at each other\'s throat.', sourceId: '196774', source: 'tatoeba' },
  ],
  // N1 をものともせずに
  'n1m-g-7b03dc': [
    { jp: '寒さをものともせずに、彼は薄着で外出した。', reading: 'さむさをものともせずに、かれはうすぎでがいしゅつした。', en: 'Making nothing of the cold, he went out in thin clothes.', sourceId: '183999', source: 'tatoeba' },
    { jp: '氷のような水をものともせずに彼は川へ飛びこんだ。', reading: 'こおりのようなみずをものともせずにかれはかわへとびこんだ。', en: 'He jumped into the river in defiance of the icy water.', sourceId: '85394', source: 'tatoeba' },
    { jp: 'そのおてんば娘は危険をものともせずにその木に登った。', reading: 'そのおてんばむすめはきけんをものともせずにそのきにのぼった。', en: 'The reckless girl climbed the tree regardless of danger.', sourceId: '213325', source: 'tatoeba' },
  ],
  // N1 ためしがない
  'n1m-g-7bf23b': [
    { jp: 'あわてた結婚はあまり、うまくいったためしがない。', reading: 'あわてたけっこんはあまり、うまくいったためしがない。', en: 'Hasty marriage seldom succeeds.', sourceId: '229626', source: 'tatoeba' },
    { jp: 'あなたって、必要な時にいたためしがないんだから！', reading: 'あなたって、ひつようなときにいたためしがないんだから！', en: 'You\'re never there when I need you!', sourceId: '11748078', source: 'tatoeba' },
    { jp: '気の弱い男が美女を得たためしがない。', reading: 'きのよわいおとこがびじょをえたためしがない。', en: 'Faint heart never won fair lady.', sourceId: '183260', source: 'tatoeba' },
  ],
  // N1 ことのないように
  'n1m-g-7c114e': [
    { jp: 'この書類を書き写すとき一語もおとすことのないように気をつけなさい。', reading: 'このしょるいをかきうつすときいちごもおとすことのないようにきをつけなさい。', en: 'In copying this paper, be careful not to leave out any words.', sourceId: '221198', source: 'tatoeba' },
  ],
  // N1 …ず、…ず
  'n1m-g-8556c6': [
    { jp: '好き嫌いせず、残さず食べましょう。', reading: 'すききらいせず、のこさずたべましょう。', en: 'Without likes or dislikes; let\'s eat everything.', sourceId: '10154443', source: 'tatoeba' },
    { jp: '彼の才能にもかかわらず、彼はあいかわらず、無名だ。', reading: 'かれのさいのうにもかかわらず、かれはあいかわらず、むめいだ。', en: 'For all his genius, he is as unknown as ever.', sourceId: '117288', source: 'tatoeba' },
    { jp: '天才にもかかわらず、彼は相変わらずうだつがあがらない。', reading: 'てんさいにもかかわらず、かれはあいかわらずうだつがあがらない。', en: 'For all his genius he is as obscure as ever.', sourceId: '125030', source: 'tatoeba' },
  ],
  // N1 ものとして
  'n1m-g-85b300': [
    { jp: '彼の理論は妥当なものとして広く認められている。', reading: 'かれのりろんはだとうなものとしてひろくみとめられている。', en: 'His theory is widely accepted as valid.', sourceId: '115896', source: 'tatoeba' },
    { jp: 'その少年は死んだものとしてあきらめられた。', reading: 'そのしょうねんはしんだものとしてあきらめられた。', en: 'The boy was given up for dead.', sourceId: '209091', source: 'tatoeba' },
    { jp: '彼女はその宝石を自分のものとして通した。', reading: 'かのじょはそのほうせきをじぶんのものとしてとおした。', en: 'She passed the jewel off as her own.', sourceId: '92300', source: 'tatoeba' },
  ],
  // N1 ～ではあるまいし
  'n1m-g-87b14c': [
    { jp: '私達は金持ちではあるまいし。', reading: 'わたしたちはかねもちではあるまいし。', en: 'It isn\'t as if we were rich.', sourceId: '151590', source: 'tatoeba' },
    { jp: '俺達はエベレストに登っているのではあるまいし、もうぐちぐちするな。', reading: 'おれたちはエベレストにのぼっているのではあるまいし、もうぐちぐちするな。', en: 'It\'s not like we are climbing Mount Everest, so stop complaining already.', sourceId: '6729752', source: 'tatoeba' },
  ],
  // N1 ～ずにおく
  'n1m-g-8f3de1': [
    { jp: 'ドアに鍵をかけずにおくとは不注意でしたね。', reading: 'ドアにかぎをかけずにおくとはふちゅういでしたね。', en: 'It was careless of you to leave the door unlocked.', sourceId: '201881', source: 'tatoeba' },
    { jp: 'この問題は言わずにおくのが一番よい。', reading: 'このもんだいはいわずにおくのがいちばんよい。', en: 'This matter had best be left unmentioned.', sourceId: '219381', source: 'tatoeba' },
  ],
  // N1 ～だといい
  'n1m-g-93d694': [
    { jp: '「すぐ良くなるかな？」「そうだといいね」', reading: '「すぐよくなるかな？」「そうだといいね」', en: '"Will he recover soon?" "I hope so."', sourceId: '11483810', source: 'tatoeba' },
    { jp: 'これならいいはず。たぶん。おそらく。そうだといいな。', reading: 'これならいいはず。たぶん。おそらく。そうだといいな。', en: 'This should be okay. Probably. Possibly. At least I hope so.', sourceId: '8919800', source: 'tatoeba' },
    { jp: '「彼女も来る？」「だといいんだけど」', reading: '「かのじょもくる？」「だといいんだけど」', en: '"Is she coming, too?" "I hope so."', sourceId: '11724650', source: 'tatoeba' },
  ],
  // N1 ともなれば
  'n1m-g-94840f': [
    { jp: '同じ世界ながら見る心が違えば地獄ともなれば天国ともなる。', reading: 'おなじせかいながらみるこころがちがえばじごくともなればてんごくともなる。', en: 'To different minds, the same world is a hell, and a heaven.', sourceId: '123694', source: 'tatoeba' },
    { jp: '夜ともなれば彼は好奇心を抱いて星空を見上げたこともあろうと思う。', reading: 'よるともなればかれはこうきしんをだいてほしぞらをみあげたこともあろうとおもう。', en: 'There were times, at falling night, when he looked up with curiosity to the stars.', sourceId: '79753', source: 'tatoeba' },
  ],
  // N1 ～こういうふう
  'n1m-g-96a892': [
    { jp: 'それはまさにこういうふうにして起きたのでした。', reading: 'それはまさにこういうふうにしておきたのでした。', en: 'It happened just like this.', sourceId: '205391', source: 'tatoeba' },
    { jp: 'こういうふうにして私はその問題を解決した。', reading: 'こういうふうにしてわたしはそのもんだいをかいけつした。', en: 'This is the way I solved the problem.', sourceId: '225070', source: 'tatoeba' },
    { jp: 'こういうふうに彼は私を見てにっこりした。', reading: 'こういうふうにかれはわたしをみてにっこりした。', en: 'This is how he smiled at me.', sourceId: '225068', source: 'tatoeba' },
  ],
  // N1 にかまけて
  'n1m-g-9fc633': [
    { jp: 'スポーツにかまけて学業を怠る学生もいる。', reading: 'スポーツにかまけてがくぎょうをおこたるがくせいもいる。', en: 'Some students neglect their studies in favor of sports.', sourceId: '214343', source: 'tatoeba' },
  ],
  // N1 ～やまない
  'n1m-g-a2e53c': [
    { jp: '空模様からすると、雨はしばらくはやまないだろう。', reading: 'そらもようからすると、あめはしばらくはやまないだろう。', en: 'From the look of the sky I\'m afraid the rain won\'t let up for a while.', sourceId: '179296', source: 'tatoeba' },
    { jp: '「雨はすぐやむかな」「やまないと思うよ」', reading: '「あめはすぐやむかな」「やまないとおもうよ」', en: '"Will it stop raining soon?" "I\'m afraid not."', sourceId: '1077129', source: 'tatoeba' },
    { jp: '君が愛してやまない妹がケモナーになっちゃったよ。', reading: 'きみがあいしてやまないいもうとがケモナーになっちゃったよ。', en: 'You turned your loving little sister into a furry.', sourceId: '9677542', source: 'tatoeba' },
  ],
  // N1 ～でもなんでもない
  'n1m-g-a3fbf7': [
    { jp: '告白します、私の通訳は完璧でもなんでもないことを。', reading: 'こくはくします、わたしのつうやくはかんぺきでもなんでもないことを。', en: 'I confess my translation is not perfect.', sourceId: '1623832', source: 'tatoeba' },
  ],
  // N1 に堪える
  'n1m-g-a5c914': [
    { jp: '私の家は地震に堪えるように設計されている。', reading: 'わたしのいえはじしんにたえるようにせっけいされている。', en: 'My house is designed so as to withstand an earthquake.', sourceId: '163953', source: 'tatoeba' },
    { jp: 'もうこの失恋の痛みに堪えることができない。', reading: 'もうこのしつれんのいたみにたえることができない。', en: 'I can bear this broken heart no longer.', sourceId: '194482', source: 'tatoeba' },
    { jp: 'その板は重さに堪えるに十分な強度がある。', reading: 'そのいたはおもさにこたえるにじゅうぶんなきょうどがある。', en: 'The board is strong enough to bear the weight.', sourceId: '207171', source: 'tatoeba' },
  ],
  // N1 に即して/に則して
  'n1m-g-a702c7': [
    { jp: '彼の伝記は全くの事実に即して書かれたものだ。', reading: 'かれのでんきはまったくのじじつにそくしてかかれたものだ。', en: 'His biography is quite true to life.', sourceId: '116459', source: 'tatoeba' },
  ],
  // N1 ～なさんな
  'n1m-g-aa1596': [
    { jp: 'そう慌てなさんな、お若いの。', reading: 'そうあわてなさんな、おわかいの。', en: 'Not so fast, young lady!', sourceId: '2769227', source: 'tatoeba' },
  ],
  // N1 ～たらどんなに…か
  'n1m-g-ae036f': [
    { jp: '車の運転が出来たらどんなによいかと私は思った。', reading: 'くるまのうんてんができたらどんなによいかとわたしはおもった。', en: 'How I wished I could drive a car!', sourceId: '149060', source: 'tatoeba' },
  ],
  // N1 ～どうにも…ない
  'n1m-g-b167a5': [
    { jp: '今さら騒いでもどうにもならないよ。後の祭りだよ。', reading: 'いまさらさわいでもどうにもならないよ。あとのまつりだよ。', en: 'Yelling about it won\'t help now. You should have done that when it counted.', sourceId: '172847', source: 'tatoeba' },
    { jp: 'これらの問題は我々にはどうにもならない。', reading: 'これらのもんだいはわれわれにはどうにもならない。', en: 'We\'re getting nowhere with these problems.', sourceId: '217749', source: 'tatoeba' },
    { jp: 'その子は激怒していてどうにもならない。', reading: 'そのこはげきどしていてどうにもならない。', en: 'The child is helpless in his rage.', sourceId: '210224', source: 'tatoeba' },
  ],
  // N1 ～にもなく
  'n1m-g-b18694': [
    { jp: 'われにもなく、彼はちょっと身震いした。', reading: 'われにもなく、かれはちょっとみぶるいした。', en: 'He shivered a little in spite of himself.', sourceId: '191749', source: 'tatoeba' },
  ],
  // N1 ～にもならない
  'n1m-g-ba642f': [
    { jp: '彼はこれ以上待っても何にもならないと思った。', reading: 'かれはこれいじょうまってもなににもならないとおもった。', en: 'He saw no advantage in waiting any longer.', sourceId: '113687', source: 'tatoeba' },
    { jp: '口ばかりで仕事をしないのでは何にもならない。', reading: 'くちばかりでしごとをしないのではなににもならない。', en: 'Talk will not avail without work.', sourceId: '173927', source: 'tatoeba' },
    { jp: 'それをやったところで、何の得にもならないよ。', reading: 'それをやったところで、なんのとくにもならないよ。', en: 'You\'ll gain nothing from doing that.', sourceId: '10888782', source: 'tatoeba' },
  ],
  // N1 ～だにしない
  'n1m-g-ba8615': [
    { jp: 'それは予想だにしない出来事だった。', reading: 'それはよそうだにしないできごとだった。', en: 'That was an unexpected event.', sourceId: '10540142', source: 'tatoeba' },
    { jp: 'それは予想だにしない展開だった。', reading: 'それはよそうだにしないてんかいだった。', en: 'That was an unexpected development.', sourceId: '10540325', source: 'tatoeba' },
    { jp: '予想だにしない経験をしました。', reading: 'よそうだにしないけいけんをしました。', en: 'I had an unexpected experience.', sourceId: '10540404', source: 'tatoeba' },
  ],
  // N1 ～とも～ともつかぬ／ともつかない
  'n1m-g-bf1b5c': [
    { jp: '彼女は愛とも憎しみともつかないものを感じた。', reading: 'かのじょはあいともにくしみともつかないものをかんじた。', en: 'She felt something between love and hatred.', sourceId: '91246', source: 'tatoeba' },
  ],
  // N1 ～なるべくなら
  'n1m-g-c25933': [
    { jp: '助手を求めています。なるべくならば経験のある人を望む。', reading: 'じょしゅをもとめています。なるべくならばけいけんのあるひとをのぞむ。', en: 'We want an assistant, preferably someone with experience.', sourceId: '147364', source: 'tatoeba' },
  ],
  // N1 とみられる/とみられている
  'n1m-g-c3517e': [
    { jp: '昨年の鉄鋼生産は１億トンに達したものとみられている。', reading: 'さくねんのてっこうせいさんは[１|]おくトンにたっしたものとみられている。', en: 'Steel production is estimated to have reached 100 million tons last year.', sourceId: '169791', source: 'tatoeba' },
    { jp: '上昇しすぎているとみられるときは、主要国の中央銀行が協力して介入に当たります。', reading: 'じょうしょうしすぎているとみられるときは、しゅようこくのちゅうおうぎんこうがきょうりょくしてかいにゅうにあたります。', en: 'When it is seen to have risen too far, the central banks of major countries cooperate to intervene.', sourceId: '74413', source: 'tatoeba' },
  ],
  // N1 ～こと請け合い
  'n1m-g-c58757': [
    { jp: 'この時計は絶対に狂わないこと請け合いだ。', reading: 'このとけいはぜったいにくるわないことうけあいだ。', en: 'I guarantee this watch to keep perfect time.', sourceId: '221593', source: 'tatoeba' },
  ],
  // N1 ～から...に至るまで（至るまで）
  'n1m-g-c5a64e': [
    { jp: '昔から今に至るまで存在する、あらゆる社会の歴史は階級闘争の歴史である。', reading: 'むかしからいまにいたるまでそんざいする、あらゆるしゃかいのれきしはかいきゅうとうそうのれきしである。', en: 'The history of all hitherto existing societies is the history of class struggles.', sourceId: '142443', source: 'tatoeba' },
    { jp: '彼らは、カルカッタからニューヨーク市に至るまで、世界中に支部を持っている。', reading: 'かれらは、カルカッタからニューヨークしにいたるまで、せかいじゅうにしぶをもっている。', en: 'They have branches all over the world, from Calcutta to New York City.', sourceId: '98370', source: 'tatoeba' },
  ],
  // N1 ～あるまじき
  'n1m-g-c75cf3': [
    { jp: '教師にあるまじき行為だ。', reading: 'きょうしにあるまじきこういだ。', en: 'Such conduct is unworthy of a teacher.', sourceId: '8318782', source: 'tatoeba' },
  ],
  // N1 ～べくして
  'n1m-g-c77ad5': [
    { jp: '起こるべくして起こった事故だった。', reading: 'おこるべくしておこったじこだった。', en: 'It was an accident that was waiting to happen.', sourceId: '76244', source: 'tatoeba' },
  ],
  // N1 ～にも程がある
  'n1m-g-c86069': [
    { jp: 'お人好しにも程がある。', reading: 'おひとよしにもほどがある。', en: 'You are way too kind-hearted and easily deceived.', sourceId: '10073319', source: 'tatoeba' },
    { jp: '失礼にも程がある！', reading: 'しつれいにもほどがある！', en: 'How rude of you!', sourceId: '10091488', source: 'tatoeba' },
  ],
  // N1 ～やたらに
  'n1m-g-c96517': [
    { jp: '美味しいからって、むやみやたらに食べちゃダメよ。', reading: 'おいしいからって、むやみやたらにたべちゃダメよ。', en: 'Even if it\'s delicious, make sure you don\'t overeat.', sourceId: '10357544', source: 'tatoeba' },
    { jp: '上役にやたらにぺこぺこするな。', reading: 'うわやくにやたらにぺこぺこするな。', en: 'Don\'t be subservient to your boss.', sourceId: '146195', source: 'tatoeba' },
    { jp: '彼はやたらに故事来歴に詳しいけれど、それが人生の役に立っているのかはなはだ疑問だね。', reading: 'かれはやたらにこじらいれきにくわしいけれど、それがじんせいのやくにたっているのかはなはだぎもんだね。', en: 'He has a great storehouse of knowledge about historical details but I seriously doubt that\'s of any use in life.', sourceId: '110512', source: 'tatoeba' },
  ],
  // N1 ～それなり
  'n1m-g-ccc4c4': [
    { jp: 'トムにはそれなりの理由があったんだと思うよ。', reading: 'トムにはそれなりのりゆうがあったんだとおもうよ。', en: 'I think Tom had a good reason.', sourceId: '10320660', source: 'tatoeba' },
    { jp: '子供が嘘をつくのには、それなりの理由があります。', reading: 'こどもがうそをつくのには、それなりのりゆうがあります。', en: 'There\'s a good reason why children lie.', sourceId: '10219243', source: 'tatoeba' },
    { jp: '彼は弁護士だからそれなりに対応しなければならない。', reading: 'かれはべんごしだからそれなりにたいおうしなければならない。', en: 'He is a lawyer and must be treated as such.', sourceId: '100111', source: 'tatoeba' },
  ],
  // N1 ～ものやら
  'n1m-g-ce9ed3': [
    { jp: 'さて。その言葉に信を置いてよいものやら。', reading: 'さて。そのことばにしんをおいてよいものやら。', en: 'Well now. Are those words to be trusted I wonder?', sourceId: '75637', source: 'tatoeba' },
    { jp: 'それがどんなものやら皆目見当がつかない。', reading: 'それがどんなものやらかいもくけんとうがつかない。', en: 'I have no idea of what it is like.', sourceId: '205947', source: 'tatoeba' },
  ],
  // N1 ～ごとき／ごとく
  'n1m-g-d62e54': [
    { jp: 'サッカー界に新たなスターが彗星のごとく現れた。', reading: 'サッカーかいにあらたなスターがすいせいのごとくあらわれた。', en: 'A new star has appeared like a comet in the soccer world.', sourceId: '10497148', source: 'tatoeba' },
    { jp: '汝自身に真実であれ、汝自ら他人に偽りなきごとく。', reading: 'なんじじしんにしんじつであれ、なんじみずからたにんにいつわりなきごとく。', en: 'Be so true to thy Self, as thou be not false to others.', sourceId: '123184', source: 'tatoeba' },
    { jp: 'なんじの隣人をおのれのごとく愛すべし。', reading: 'なんじのりんじんをおのれのごとくあいすべし。', en: 'You shall love your neighbor as yourself.', sourceId: '198958', source: 'tatoeba' },
  ],
  // N1 には…なり
  'n1m-g-d720d9': [
    { jp: '少々のウイスキーを飲んでも害にはなりますまい。', reading: 'しょうしょうのウイスキーをのんでもがいにはなりますまい。', en: 'It\'ll do no harm to drink a little whisky.', sourceId: '146652', source: 'tatoeba' },
    { jp: '高い食事も睡眠不足の埋め合わせにはなりません。', reading: 'たかいしょくじもすいみんふそくのうめあわせにはなりません。', en: 'Expensive meals can\'t compensate for lack of sleep.', sourceId: '173251', source: 'tatoeba' },
    { jp: 'それは子供にはかなり骨の折れることだった。', reading: 'それはこどもにはかなりほねのおれることだった。', en: 'That was quite an effort for a child.', sourceId: '205178', source: 'tatoeba' },
  ],
  // N1 ～どうにもならない/ できない
  'n1m-g-d957df': [
    { jp: '同性をセクハラで訴えることできないのかしら。', reading: 'どうせいをセクハラでうったえることできないのかしら。', en: 'I wonder if you can sue someone of the same sex for sexual harassment?', sourceId: '75058', source: 'tatoeba' },
    { jp: '彼女をしからないで。幼くて理解できないから。', reading: 'かのじょをしからないで。おさなくてりかいできないから。', en: 'Don\'t scold her; she\'s too young to understand.', sourceId: '86145', source: 'tatoeba' },
    { jp: '失敗したらやり直しができないから、失敗するな。', reading: 'しっぱいしたらやりなおしができないから、しっぱいするな。', en: 'If you mess-up it can\'t be redone, so don\'t mess-up!', sourceId: '75092', source: 'tatoeba' },
  ],
  // N1 ～ぬうちに
  'n1m-g-db797a': [
    { jp: 'たいして行かぬうちに、彼らは老人に出会った。', reading: 'たいしていかぬうちに、かれらはろうじんにであった。', en: 'They had not gone very far when they met an old man.', sourceId: '203982', source: 'tatoeba' },
    { jp: '私が学校に着くか着かぬうちにベルがなった。', reading: 'わたしががっこうにつくかつかぬうちにベルがなった。', en: 'I had hardly reached the school when the bell rang.', sourceId: '167832', source: 'tatoeba' },
    { jp: 'ひよこがかえらぬうちにその数を数えるな。', reading: 'ひよこがかえらぬうちにそのかずをかぞえるな。', en: 'Don\'t count your chickens before they are hatched.', sourceId: '197444', source: 'tatoeba' },
  ],
  // N1 に足りない/に足らない
  'n1m-g-db8443': [
    { jp: '戦争の際には歩兵は取るに足らないものだ。', reading: 'せんそうのさいにはほへいはとるにたらないものだ。', en: 'The infantry soldier is only a pawn in the game of war.', sourceId: '141284', source: 'tatoeba' },
    { jp: 'きみの意見は私にとって取るに足りない。', reading: 'きみのいけんはわたしにとってとるにたりない。', en: 'Your opinion means nothing to me.', sourceId: '225919', source: 'tatoeba' },
    { jp: 'ここに足りない機能を皆で考えましょう。', reading: 'ここにたりないきのうをみなでかんがえましょう。', en: 'Let\'s think together about what is lacking here.', sourceId: '11254521', source: 'tatoeba' },
  ],
  // N1 その...その
  'n1m-g-de0cdf': [
    { jp: 'その問題はその委員会によって討議されていた。', reading: 'そのもんだいはそのいいんかいによってとうぎされていた。', en: 'The problem was being discussed by the committee.', sourceId: '206462', source: 'tatoeba' },
    { jp: 'その日その日を生き抜くのがやっとだ。', reading: 'そのひそのひをいきぬくのがやっとだ。', en: 'I\'m just living from day to day.', sourceId: '207356', source: 'tatoeba' },
    { jp: 'その鉄道はその橋を過ぎると二つに分かれる。', reading: 'そのてつどうはそのはしをすぎるとふたつにわかれる。', en: 'The railroad divides into two after the bridge.', sourceId: '207674', source: 'tatoeba' },
  ],
  // N1 にあって(は)
  'n1m-g-de96df': [
    { jp: '彼女は夫の死にあっても心を動かされなかった。', reading: 'かのじょはおっとのしにあってもこころをうごかされなかった。', en: 'She was quite unaffected by the death of her husband.', sourceId: '86945', source: 'tatoeba' },
    { jp: 'いつかお話しした私の妹にあってやって下さい。', reading: 'いつかおはなししたわたしのいもうとにあってやってください。', en: 'I want you to meet my sister, whom I spoke of the other day.', sourceId: '229015', source: 'tatoeba' },
    { jp: '私たちは夕立にあって、びしょ濡れになった。', reading: 'わたしたちはゆうだちにあって、びしょぬれになった。', en: 'We were drenched in the shower.', sourceId: '165049', source: 'tatoeba' },
  ],
  // N1 ～はめになる（～羽目になる）
  'n1m-g-e0c188': [
    { jp: 'そんな運転をすると入院するはめになるだろう。', reading: 'そんなうんてんをするとにゅういんするはめになるだろう。', en: 'If you drive your car like that, you\'ll end up in hospital.', sourceId: '204173', source: 'tatoeba' },
    { jp: 'もしこんなことを続けていたら、彼は刑務所に入るはめになるぞ。', reading: 'もしこんなことをつづけていたら、かれはけいむしょにはいるはめになるぞ。', en: 'If he carries on like this, he\'s going to wind up in prison.', sourceId: '193864', source: 'tatoeba' },
  ],
  // N1 までもない
  'n1m-g-e1afcf': [
    { jp: '正直が成功のかぎであることは、いうまでもない。', reading: 'しょうじきがせいこうのかぎであることは、いうまでもない。', en: 'It goes without saying that honesty is the key to success.', sourceId: '142919', source: 'tatoeba' },
    { jp: '勤勉が成功へのかぎであることはいうまでもない。', reading: 'きんべんがせいこうへのかぎであることはいうまでもない。', en: 'It goes without saying that diligence is a key to success.', sourceId: '179994', source: 'tatoeba' },
    { jp: 'その解釈は学者を待つまでもない。', reading: 'そのかいしゃくはがくしゃをまつまでもない。', en: 'It doesn\'t require a scholar to interpret.', sourceId: '211757', source: 'tatoeba' },
  ],
  // N1 ～によらず
  'n1m-g-e2d19a': [
    { jp: '人前で話すようなことは何によらず彼はいつも敬遠する。', reading: 'ひとまえではなすようなことはなにによらずかれはいつもけいえんする。', en: 'He tends to shy away from anything that involves public speaking.', sourceId: '143941', source: 'tatoeba' },
    { jp: '造られたもので、この方によらずできたものは一つもない。', reading: 'つくられたもので、このほうによらずできたものはひとつもない。', en: 'Without him nothing was made that has been made.', sourceId: '140216', source: 'tatoeba' },
    { jp: '彼女は見かけによらず頑張りやだ。', reading: 'かのじょはみかけによらずがんばりやだ。', en: 'She is persistent though she doesn\'t look so.', sourceId: '90236', source: 'tatoeba' },
  ],
  // N1 に足る
  'n1m-g-e35448': [
    { jp: 'ビルは印刷業でいい暮らしをするに足るお金をかせいだ。', reading: 'ビルはいんさつぎょうでいいくらしをするにたるおかねをかせいだ。', en: 'The printing business made Bill a small fortune.', sourceId: '197340', source: 'tatoeba' },
    { jp: 'いやしくもなすに足る事なら立派にやるだけの価値がある。', reading: 'いやしくもなすにたることならりっぱにやるだけのかちがある。', en: 'If it is worth doing at all, it is worth doing well.', sourceId: '228489', source: 'tatoeba' },
    { jp: 'この農園は私たちの必要を満たすに足るだけの野菜を産出する。', reading: 'こののうえんはわたしたちのひつようをみたすにたるだけのやさいをさんしゅつする。', en: 'This farm yields enough vegetables to meet our needs.', sourceId: '220215', source: 'tatoeba' },
  ],
  // N1 ～いざ～となると / いざ～となれば / いざ～となったら
  'n1m-g-ea1103': [
    { jp: 'いざとなったら、傘が武器の代用になる。', reading: 'いざとなったら、かさがぶきのだいようになる。', en: 'My umbrella will serve for a weapon, should the occasion arise.', sourceId: '229138', source: 'tatoeba' },
    { jp: 'いざとなれば勇気が湧いてくる。', reading: 'いざとなればゆうきがわいてくる。', en: 'Your courage will come out in a crisis.', sourceId: '229136', source: 'tatoeba' },
    { jp: 'いざとなったら勇気が無くなった。', reading: 'いざとなったらゆうきがなくなった。', en: 'My courage failed me at the crucial moment.', sourceId: '229137', source: 'tatoeba' },
  ],
  // N1 をいいことに
  'n1m-g-eaea45': [
    { jp: '私が知らないのをいいことに彼は私をだました。', reading: 'わたしがしらないのをいいことにかれはわたしをだました。', en: 'He took advantage of my ignorance and deceived me.', sourceId: '167580', source: 'tatoeba' },
    { jp: 'お前が近くにいるのをいいことにベタベタしやがって！！', reading: 'おまえがちかくにいるのをいいことにベタベタしやがって！！', en: 'What the fuck are you up to taking advantage of his proximity to cling to him like a wet T-shirt?!', sourceId: '76811', source: 'tatoeba' },
    { jp: '彼はいそがしいのをいいことに長いこと私に連絡してこない。', reading: 'かれはいそがしいのをいいことにながいことわたしにれんらくしてこない。', en: 'He has not gotten in touch with me for a long time under the pretence of being busy.', sourceId: '114663', source: 'tatoeba' },
  ],
  // N1 ～かくして
  'n1m-g-ec6c8c': [
    { jp: 'かくして僕らはたくさんの時間を空費する。', reading: 'かくしてぼくらはたくさんのじかんをくうひする。', en: 'In this way, we waste a lot of time.', sourceId: '1772632', source: 'tatoeba' },
    { jp: '彼女は私にびっくりさせるものをかくしているようだ。', reading: 'かのじょはわたしにびっくりさせるものをかくしているようだ。', en: 'She seems to have a surprise in store for me.', sourceId: '89536', source: 'tatoeba' },
    { jp: 'かくして、彼らに脅威を与えるほかの動物に発見されないですむ。', reading: 'かくして、かれらにきょういをあたえるほかのどうぶつにはっけんされないですむ。', en: 'Thus, they cannot be detected by other animals that threaten them.', sourceId: '226431', source: 'tatoeba' },
  ],
  // N1 ～ならでは（の）
  'n1m-g-f030cf': [
    { jp: '観光地では地元ならではのものを食べたい。', reading: 'かんこうちではじもとならではのものをたべたい。', en: 'I want to eat some local food where we\'re sightseeing.', sourceId: '11025020', source: 'tatoeba' },
    { jp: '田舎は何かと不便ですが、田舎ならではの良さもたくさんあります。', reading: 'いなかはなにかとふべんですが、いなかならではのよさもたくさんあります。', en: 'The countryside is inconvenient, but it has many advantages that you will find nowhere else.', sourceId: '3423911', source: 'tatoeba' },
  ],
  // N1 ～というわけだ
  'n1m-g-f10875': [
    { jp: '新婚なのに子供？そう・・・息子は父親の連れ子。彼はバツイチというわけだ。', reading: 'しんこんなのにこども？そう・・・むすこはちちおやのつれこ。かれはバツイチというわけだ。', en: 'Newlyweds but with a child? Yes, that\'s right - the son is from the father\'s former marriage. He\'s been divorced once.', sourceId: '75618', source: 'tatoeba' },
  ],
  // N1 ～からある
  'n1m-g-f25ae2': [
    { jp: '最近、以前からある痔が痛みます。', reading: 'さいきん、いぜんからあるじがいたみます。', en: 'Recently my haemorrhoids, which I\'ve had from before, are painful.', sourceId: '74495', source: 'tatoeba' },
    { jp: '花火っていつからあるんですか？', reading: 'はなびっていつからあるんですか？', en: 'Since when have there been fireworks?', sourceId: '3023056', source: 'tatoeba' },
    { jp: 'テレビはいつからあるの？', reading: 'テレビはいつからあるの？', en: 'When did TV appear?', sourceId: '201994', source: 'tatoeba' },
  ],
  // N1 ～てもさしつかえない
  'n1m-g-f54d20': [
    { jp: '自分が利口だと思ってもさしつかえないが、それだからと言って私をあざ笑うことはできないよ。', reading: 'じぶんがりこうだとおもってもさしつかえないが、それだからといってわたしをあざわらうことはできないよ。', en: 'You may think you are clever, but you cannot laugh at me because of that.', sourceId: '149985', source: 'tatoeba' },
  ],
  // N1 ～であろうとなかろうと
  'n1m-g-f70fba': [
    { jp: '好きであろうとなかろうと宿題をやらねばならぬ。', reading: 'すきであろうとなかろうとしゅくだいをやらねばならぬ。', en: 'Whether you like it or not, you have to do your homework.', sourceId: '173818', source: 'tatoeba' },
    { jp: '雨であろうとなかろうと試合は行います。', reading: 'あめであろうとなかろうとしあいはおこないます。', en: 'Whether it rains or not, the game is going ahead.', sourceId: '189653', source: 'tatoeba' },
    { jp: '困難であろうとなかろうと、私はそれをしなければならない。', reading: 'こんなんであろうとなかろうと、わたしはそれをしなければならない。', en: 'Whether it may be hard or not, I must do it.', sourceId: '170995', source: 'tatoeba' },
  ],
  // N1 ～みこみがある
  'n1m-g-fe6841': [
    { jp: '彼の回復のみこみがあるにしても、ほんの少ししかない。', reading: 'かれのかいふくのみこみがあるにしても、ほんのしょうししかない。', en: 'There is little, if any, hope of his recovery.', sourceId: '117897', source: 'tatoeba' },
  ],
  // N2 一気に
  'n2m-g-01ebf5': [
    { jp: '子供がその小説を一気に読破するのは不可能だ。', reading: 'こどもがそのしょうせつをいっきにどくはするのはふかのうだ。', en: 'It is impossible for children to read through the novel at a sitting.', sourceId: '168839', source: 'tatoeba' },
    { jp: 'チマチマやるより一気にやったほうが効率いい。', reading: 'チマチマやるよりいっきにやったほうがこうりついい。', en: 'It\'s more efficient to do it all at once than to do it bit by bit.', sourceId: '11056620', source: 'tatoeba' },
    { jp: '車は一気にスピードを上げてトラックを追い越した。', reading: 'くるまはいっきにスピードをあげてトラックをおいこした。', en: 'The car put on a burst of speed and passed the truck.', sourceId: '149002', source: 'tatoeba' },
  ],
  // N2 つきましては
  'n2m-g-02b7d6': [
    { jp: '商品の詳細につきましてはこちらをご覧ください。', reading: 'しょうひんのしょうさいにつきましてはこちらをごらんください。', en: 'Please read here for the product details.', sourceId: '3313643', source: 'tatoeba' },
    { jp: 'その質問につきましては、お答えいたしかねます。', reading: 'そのしつもんにつきましては、おこたえいたしかねます。', en: 'I can\'t answer that question.', sourceId: '12023885', source: 'tatoeba' },
    { jp: 'つきましてはカタログを郵送してください。', reading: 'つきましてはカタログをゆうそうしてください。', en: 'Would you please send me a catalogue by mail?', sourceId: '202583', source: 'tatoeba' },
  ],
  // N2 限り(は)/限り(では)
  'n2m-g-03a641': [
    { jp: 'いよいよ今週を限りに、しばらくのお休みです。', reading: 'いよいよこんしゅうをかぎりに、しばらくのおやすみです。', en: 'I\'ve finally got some vacation coming as of the end of this week.', sourceId: '74065', source: 'tatoeba' },
    { jp: '彼は、私の知る限りでは、信頼できる友達です。', reading: 'かれは、わたしのしるかぎりでは、しんらいできるともだちです。', en: 'He is, so far as I know, a reliable friend.', sourceId: '115509', source: 'tatoeba' },
    { jp: '彼に関する限り、ものごとはうまく行っていた。', reading: 'かれにかんするかぎり、ものごとはうまくいっていた。', en: 'So far as he was concerned, things were going well.', sourceId: '118637', source: 'tatoeba' },
  ],
  // N2 一通り
  'n2m-g-0422c2': [
    { jp: '一通りの挨拶が済むと早速例の問題を持ち出した。', reading: 'ひととおりのあいさつがすむとさっそくれいのもんだいをもちだした。', en: 'After the usual greetings were over, I lost no time in introducing the subject in question.', sourceId: '6466433', source: 'tatoeba' },
    { jp: 'これを聞いた時の彼女の嘆きは一通りでなかった。', reading: 'これをきいたときのかのじょのなげきはひととおりでなかった。', en: 'Her grief at this news was excessive.', sourceId: '6466441', source: 'tatoeba' },
    { jp: '一通り読み終えたところで、あんぐり口を開けた。', reading: 'ひととおりよみおえたところで、あんぐりくちをあけた。', en: 'As his eyes ran over the paper, his jaw fell.', sourceId: '6466448', source: 'tatoeba' },
  ],
  // N2 これといって…ない
  'n2m-g-05e513': [
    { jp: '私は特にこれといってすることがない。', reading: 'わたしはとくにこれといってすることがない。', en: 'I have nothing particular to do.', sourceId: '154809', source: 'tatoeba' },
    { jp: '今はこれといってすることがないです。', reading: 'いまはこれといってすることがないです。', en: 'I have nothing particular to do now.', sourceId: '172678', source: 'tatoeba' },
  ],
  // N2 にしても～にしても/にしろ～にしろ/にせよ～にせよ
  'n2m-g-062b53': [
    { jp: '冗談にしろ、恐怖からにしろ、決してうそを言うな。', reading: 'じょうだんにしろ、きょうふからにしろ、けっしてうそをいうな。', en: 'Never tell a lie, either for fun or from fear.', sourceId: '146116', source: 'tatoeba' },
  ],
  // N2 も同然
  'n2m-g-07745f': [
    { jp: '学ぶことをやめたら、人は死んだも同然である。', reading: 'まなぶことをやめたら、ひとはしんだもどうぜんである。', en: 'The man who stops learning is as good as dead.', sourceId: '184525', source: 'tatoeba' },
    { jp: 'あんな奴に金を貸すなんて、金を捨てるも同然だ。', reading: 'あんなやつにかねをかすなんて、かねをすてるもどうぜんだ。', en: 'Lending money to such a fellow is as good as throwing it away.', sourceId: '229529', source: 'tatoeba' },
    { jp: '病院に運び込まれたとき、彼は死んだも同然だった。', reading: 'びょういんにはこびこまれたとき、かれはしんだもどうぜんだった。', en: 'He was all but dead when taken to the hospital.', sourceId: '85340', source: 'tatoeba' },
  ],
  // N2 ところで...ない
  'n2m-g-091358': [
    { jp: 'その地区はもはや住むのに安全なところではない。', reading: 'そのちくはもはやすむのにあんぜんなところではない。', en: 'That district is no longer a safe place to live in.', sourceId: '207882', source: 'tatoeba' },
    { jp: 'それはその物語の述べるところではない。', reading: 'それはそのものがたりののべるところではない。', en: 'That is not what the narrative is about.', sourceId: '205480', source: 'tatoeba' },
    { jp: '私は手紙を書いているところではない。', reading: 'わたしはてがみをかいているところではない。', en: 'I am not writing a letter.', sourceId: '156075', source: 'tatoeba' },
  ],
  // N2 ことだし
  'n2m-g-0c065e': [
    { jp: '自分が決めたことだし、後悔はしていない。', reading: 'じぶんがきめたことだし、こうかいはしていない。', en: 'It was my decision and I don\'t regret it.', sourceId: '13028859', source: 'tatoeba' },
    { jp: '雨も降ってることだし、帰らないと。', reading: 'あめもふってることだし、かえらないと。', en: 'It\'s raining, so we should go home.', sourceId: '9112548', source: 'tatoeba' },
    { jp: '自分が決めたことだし、後悔はない。', reading: 'じぶんがきめたことだし、こうかいはない。', en: 'It was my decision and I don\'t regret it.', sourceId: '13028858', source: 'tatoeba' },
  ],
  // N2 ものではない
  'n2m-g-0c3f57': [
    { jp: '男はすぐに習慣を変えられるものではないんだ。', reading: 'おとこはすぐにしゅうかんをかえられるものではないんだ。', en: 'You can\'t expect a man to change his habits at once, girl.', sourceId: '127218', source: 'tatoeba' },
    { jp: '子供のいる所でそんなことを言うものではない。', reading: 'こどものいるところでそんなことをいうものではない。', en: 'You shouldn\'t say such a thing in the presence of children.', sourceId: '168656', source: 'tatoeba' },
    { jp: '君の答えなんて決して満足のいくものではない。', reading: 'きみのこたえなんてけっしてまんぞくのいくものではない。', en: 'Your answer is far from satisfactory.', sourceId: '178101', source: 'tatoeba' },
  ],
  // N2 いわゆる
  'n2m-g-0e20ef': [
    { jp: 'そのコンピューターはいわゆるロボットである。', reading: 'そのコンピューターはいわゆるロボットである。', en: 'That computer is what we call a robot.', sourceId: '213072', source: 'tatoeba' },
    { jp: '彼女の考えは、いわゆる進歩的なものでした。', reading: 'かのじょのかんがえは、いわゆるしんぽてきなものでした。', en: 'Her notions were what is called advanced.', sourceId: '94432', source: 'tatoeba' },
    { jp: '彼のおじいさんはいわゆる独立独行の人だ。', reading: 'かれのおじいさんはいわゆるどくりつどっこうのひとだ。', en: 'His grandfather is what is called a self-made man.', sourceId: '118389', source: 'tatoeba' },
  ],
  // N2 に越したことはない
  'n2m-g-0eed02': [
    { jp: '友達選びは慎重であるに越したことはない。', reading: 'ともだちえらびはしんちょうであるにこしたことはない。', en: 'You can\'t be too careful in choosing your friends.', sourceId: '9000988', source: 'tatoeba' },
    { jp: '警戒するに越したことはない。', reading: 'けいかいするにこしたことはない。', en: 'You can\'t be too vigilant.', sourceId: '74626', source: 'tatoeba' },
    { jp: '言わぬに越したことはない。', reading: 'いわぬにこしたことはない。', en: 'Some things are better left unsaid.', sourceId: '3251032', source: 'tatoeba' },
  ],
  // N2 からなる
  'n2m-g-0f4cf9': [
    { jp: '水分子は、２個の水素原子と１個の酸素原子からなる。', reading: 'すいぶんこは、[２|]このすいそげんしと[１|]このさんそげんしからなる。', en: 'A water molecule has two hydrogen atoms and one oxygen atom.', sourceId: '143630', source: 'tatoeba' },
    { jp: 'その会議は１０人のメンバーからなる。', reading: 'そのかいぎは[１|][０|]にんのメンバーからなる。', en: 'The committee comprises ten members.', sourceId: '211894', source: 'tatoeba' },
    { jp: 'その委員会は科学者と技術者からなる。', reading: 'そのいいんかいはかがくしゃとぎじゅつしゃからなる。', en: 'The committee consists of scientists and engineers.', sourceId: '212375', source: 'tatoeba' },
  ],
  // N2 よりほかに...ない
  'n2m-g-0f5d14': [
    { jp: '彼の計画に同意するよりほかに仕方がない。', reading: 'かれのけいかくにどういするよりほかにしかたがない。', en: 'There is no choice but to agree to his plan.', sourceId: '117721', source: 'tatoeba' },
    { jp: 'もうこれよりほかに手はない。', reading: 'もうこれよりほかにてはない。', en: 'There\'s no other way than this now.', sourceId: '194478', source: 'tatoeba' },
    { jp: '私には君よりほかに友達がいない。', reading: 'わたしにはきみよりほかにともだちがいない。', en: 'I have no other friend than you.', sourceId: '164613', source: 'tatoeba' },
  ],
  // N2 にあたる
  'n2m-g-12a716': [
    { jp: '企業は率先して事にあたる働き手を歓迎する。', reading: 'きぎょうはそっせんしてことにあたるはたらきてをかんげいする。', en: 'Companies welcome workers who take initiative.', sourceId: '183611', source: 'tatoeba' },
    { jp: '日本の桜はまさにイギリスのバラにあたる。', reading: 'にっぽんのさくらはまさにイギリスのバラにあたる。', en: 'The cherry blossom is to Japan what the rose is to England.', sourceId: '122611', source: 'tatoeba' },
    { jp: '１マイルは約１６００メートルにあたる。', reading: '[１|]マイルはやく[１|][６|][０|][０|]メートルにあたる。', en: 'A mile is equal to about 1,600 meters.', sourceId: '235825', source: 'tatoeba' },
  ],
  // N2 ではなかろうか
  'n2m-g-13648a': [
    { jp: '明日は雨天ではなかろうかと思う。', reading: 'あしたはうてんではなかろうかとおもう。', en: 'I\'m afraid it will be rainy tomorrow.', sourceId: '80447', source: 'tatoeba' },
  ],
  // N2 たまらない
  'n2m-g-16b175': [
    { jp: '彼は先ごろの成功を自慢したくてたまらない。', reading: 'かれはさきごろのせいこうをじまんしたくてたまらない。', en: 'The urge to brag on his recent successes was irresistible.', sourceId: '103072', source: 'tatoeba' },
    { jp: '私たちは君がいなくてとても寂しくてたまらない。', reading: 'わたしたちはきみがいなくてとてもさびしくてたまらない。', en: 'We cannot help missing you badly.', sourceId: '165901', source: 'tatoeba' },
    { jp: '彼女の家族は彼女のけがのことが心配でたまらない。', reading: 'かのじょのかぞくはかのじょのけがのことがしんぱいでたまらない。', en: 'Her folks cannot help worrying about her wound.', sourceId: '94595', source: 'tatoeba' },
  ],
  // N2 ところを/ところに/ところへ
  'n2m-g-171580': [
    { jp: '郵便局はここからちょっとのところにあります。', reading: 'ゆうびんきょくはここからちょっとのところにあります。', en: 'The post office is a few minutes\' walk from here.', sourceId: '79174', source: 'tatoeba' },
    { jp: '父が生まれた家はすぐ角を曲ったところにある。', reading: 'ちちがうまれたいえはすぐかくをまがったところにある。', en: 'The house where my father was born is just around the corner.', sourceId: '84851', source: 'tatoeba' },
    { jp: '秘書はいつも声の届くところに待機しています。', reading: 'ひしょはいつもこえのとどくところにたいきしています。', en: 'The secretary is within call all the time.', sourceId: '85866', source: 'tatoeba' },
  ],
  // N2 …となれば
  'n2m-g-194e30': [
    { jp: 'いざとなれば勇気が湧いてくる。', reading: 'いざとなればゆうきがわいてくる。', en: 'Your courage will come out in a crisis.', sourceId: '229136', source: 'tatoeba' },
    { jp: 'その計画が実行できないとなれば、どうしなければなりませんか。', reading: 'そのけいかくがじっこうできないとなれば、どうしなければなりませんか。', en: 'What must be done if the plan proves unworkable?', sourceId: '211292', source: 'tatoeba' },
  ],
  // N2 どうにか
  'n2m-g-1a877b': [
    { jp: '彼女はどうにか車の運転ができるようになった。', reading: 'かのじょはどうにかくるまのうんてんができるようになった。', en: 'She managed to drive a car.', sourceId: '92009', source: 'tatoeba' },
    { jp: '彼はフランス語で書かれた本をどうにか読んだ。', reading: 'かれはフランスごでかかれたほんをどうにかよんだ。', en: 'He managed to read a book written in French.', sourceId: '111074', source: 'tatoeba' },
    { jp: '私はどうにか自分で車を修理することができた。', reading: 'わたしはどうにかじぶんでくるまをしゅうりすることができた。', en: 'I managed to repair my car by myself.', sourceId: '159338', source: 'tatoeba' },
  ],
  // N2 さすがに
  'n2m-g-1b3c1f': [
    { jp: 'さすがにシステムが古くて買い替えしかない。', reading: 'さすがにシステムがふるくてかいかえしかない。', en: 'As expected, the system is old, and the only way to replace it is to buy a new one.', sourceId: '11001532', source: 'tatoeba' },
    { jp: '本当の事を言ったとはさすがに勇気がある。', reading: 'ほんとうのことをいったとはさすがにゆうきがある。', en: 'You were courageous to tell the truth.', sourceId: '81491', source: 'tatoeba' },
    { jp: '年の功というのか、彼の意見はさすがに一日の長があるね。', reading: 'としのこうというのか、かれのいけんはさすがにいちにちのちょうがあるね。', en: 'Maybe it\'s his age but his opinions seem a little more grounded in experience than everyone else\'s.', sourceId: '121846', source: 'tatoeba' },
  ],
  // N2 なんといっても
  'n2m-g-1ca998': [
    { jp: 'メアリーはまた失敗した。なんといっても彼女はまだ若い。', reading: 'メアリーはまたしっぱいした。なんといってもかのじょはまだわかい。', en: 'Mary has failed again. After all she is still young.', sourceId: '194788', source: 'tatoeba' },
    { jp: '彼がなんといっても信じるな。', reading: 'かれがなんといってもしんじるな。', en: 'Don\'t trust him no matter what he says.', sourceId: '120752', source: 'tatoeba' },
  ],
  // N2 一応
  'n2m-g-1d7257': [
    { jp: '一応聞きますが、なにをするつもりですか。', reading: 'いちおうききますが、なにをするつもりですか。', en: 'Just what are you trying to do?', sourceId: '1114425', source: 'tatoeba' },
    { jp: 'ええ、先方から一応返事はありました。', reading: 'ええ、せんぽうからいちおうへんじはありました。', en: 'Yeah, there was some sort of reply from them.', sourceId: '3424569', source: 'tatoeba' },
    { jp: '一応聞いとくけど、明日は制服だよね？', reading: 'いちおうきいとくけど、あしたはせいふくだよね？', en: 'I want to ask, just in case - we should wear our uniforms tomorrow, right?', sourceId: '3424650', source: 'tatoeba' },
  ],
  // N2 ろくに～ない
  'n2m-g-1fc005': [
    { jp: 'この若者は、自分の国についてろくに知らない。', reading: 'このわかものは、じぶんのくにについてろくにしらない。', en: 'This young man knows little about his country.', sourceId: '3475188', source: 'tatoeba' },
    { jp: '彼女はろくに食べないで席を立った。', reading: 'かのじょはろくにたべないでせきをたった。', en: 'She had only eaten a little before she left the table.', sourceId: '91277', source: 'tatoeba' },
    { jp: '彼女はフランス語は言うに及ばず母語すらろくに話せない。', reading: 'かのじょはフランスごはいうにおよばずぼごすらろくにはなせない。', en: 'She doesn\'t even speak her own language well, let alone French.', sourceId: '91595', source: 'tatoeba' },
  ],
  // N2 いずれにしろ
  'n2m-g-20ae12': [
    { jp: 'いずれにしろ、明日は列車に乗りなさい。', reading: 'いずれにしろ、あしたはれっしゃにのりなさい。', en: 'In any case, catch the train tomorrow.', sourceId: '229109', source: 'tatoeba' },
  ],
  // N2 まず...だろう/ ...まい
  'n2m-g-214d1a': [
    { jp: '母に言うと心配するから、このことは言うまい。', reading: 'ははにいうとしんぱいするから、このことはいうまい。', en: 'If I tell my mother, she\'ll worry, so I don\'t think I\'ll tell her.', sourceId: '75711', source: 'tatoeba' },
    { jp: '彼女は招待を受けようか受けまいか決めかねていた。', reading: 'かのじょはしょうたいをうけようかうけまいかきめかねていた。', en: 'She hung between refusing or accepting the invitation.', sourceId: '88661', source: 'tatoeba' },
    { jp: '籠の鳥に水とえさをまいにちやるようにしてください。', reading: 'かごのとりにみずとえさをまいにちやるようにしてください。', en: 'Please see that the birds in the cage get water and food every day.', sourceId: '77084', source: 'tatoeba' },
  ],
  // N2 …かと思ったら
  'n2m-g-22a451': [
    { jp: '気のせいかと思ったらほんとに量減ってるんだな。', reading: 'きのせいかとおもったらほんとにりょうへってるんだな。', en: 'Just when you start thinking it\'s all in your head, it really does get smaller.', sourceId: '10987762', source: 'tatoeba' },
    { jp: '無料バスかと思ったら、お金がいったよ。', reading: 'むりょうバスかとおもったら、おかねがいったよ。', en: 'I thought the bus was free, but I had to pay.', sourceId: '10798088', source: 'tatoeba' },
    { jp: '新しいアイドルかと思ったら、ヘアスタイル変えただけだった。', reading: 'あたらしいアイドルかとおもったら、ヘアスタイルかえただけだった。', en: 'I thought that it might have been a new idol, but it was just a new hairstyle.', sourceId: '11013847', source: 'tatoeba' },
  ],
  // N2 そのものだ
  'n2m-g-22f349': [
    { jp: '彼は行動も言動も田舎もんそのものだよ。', reading: 'かれはこうどうもげんどうもいなかもんそのものだよ。', en: 'The way he talks and acts, you can tell he\'s a redneck.', sourceId: '107324', source: 'tatoeba' },
    { jp: '政治屋というものがあるとしたら、彼こそそのものだ。', reading: 'せいじやというものがあるとしたら、かれこそそのものだ。', en: 'He is a politician, if ever there was one.', sourceId: '143194', source: 'tatoeba' },
    { jp: 'ここに来て以来、生活は単調そのものだ。', reading: 'ここにきていらい、せいかつはたんちょうそのものだ。', en: 'Life has been so flat since I came here.', sourceId: '224381', source: 'tatoeba' },
  ],
  // N2 ...といった
  'n2m-g-23ffb5': [
    { jp: '彼女は私に、６時に起こしてくださいといった。', reading: 'かのじょはわたしに、[６|]じにおこしてくださいといった。', en: 'She asked me to wake her at six.', sourceId: '89595', source: 'tatoeba' },
    { jp: '彼は一かばちかやってみるつもりですといった。', reading: 'かれはいちかばちかやってみるつもりですといった。', en: 'He said he was going to take a risk.', sourceId: '110035', source: 'tatoeba' },
    { jp: '彼女は病気だといったが、それはうそだった。', reading: 'かのじょはびょうきだといったが、それはうそだった。', en: 'She said that she was ill, which was a lie.', sourceId: '87035', source: 'tatoeba' },
  ],
  // N2 に関わって
  'n2m-g-243e3c': [
    { jp: '新聞によれば、彼はその陰謀に関わっていた。', reading: 'しんぶんによれば、かれはそのいんぼうにかかわっていた。', en: 'According to the newspaper, he participated in the plot.', sourceId: '145159', source: 'tatoeba' },
    { jp: '彼女がそれに関わっていたという事実は否定できない。', reading: 'かのじょがそれにかかわっていたというじじつはひていできない。', en: 'You can\'t deny the fact that she had a hand in it.', sourceId: '95636', source: 'tatoeba' },
    { jp: 'その発見は科学の進歩とどのように関わっていますか。', reading: 'そのはっけんはかがくのしんぽとどのようにかかわっていますか。', en: 'How is the discovery related to the progress of science?', sourceId: '207190', source: 'tatoeba' },
  ],
  // N2 にほかならない/からにほかならない
  'n2m-g-26783b': [
    { jp: '世界の歴史は自由意識の進歩にほかならない。', reading: 'せかいのれきしはじゆういしきのしんぽにほかならない。', en: 'The history of the world is none other than the progress of the consciousness of freedom.', sourceId: '143420', source: 'tatoeba' },
  ],
  // N2 にわたって
  'n2m-g-28abd3': [
    { jp: '道路は数マイルにわたってまっすぐ続いていた。', reading: 'どうろはすうマイルにわたってまっすぐつづいていた。', en: 'The road ran straight for several miles.', sourceId: '123514', source: 'tatoeba' },
    { jp: '生徒の年齢は１８歳から２５歳にわたっている。', reading: 'せいとのねんれいは[１|][８|]さいから[２|][５|]さいにわたっている。', en: 'The students range in age from 18 to 25.', sourceId: '142731', source: 'tatoeba' },
    { jp: 'インドは長年にわたって英国に支配されていた。', reading: 'インドはながねんにわたってえいこくにしはいされていた。', en: 'India was governed by Great Britain for many years.', sourceId: '228366', source: 'tatoeba' },
  ],
  // N2 恐らく
  'n2m-g-298f1e': [
    { jp: 'トムは恐らくまだフランス語の勉強をしてるよ。', reading: 'トムはおそらくまだフランスごのべんきょうをしてるよ。', en: 'Tom is probably still studying French.', sourceId: '9749171', source: 'tatoeba' },
    { jp: '彼がいないことは恐らくお気づきのことでしょう。', reading: 'かれがいないことはおそらくおきづきのことでしょう。', en: 'You are doubtless aware of his absence.', sourceId: '121059', source: 'tatoeba' },
    { jp: '恐らく彼はまだその知らせを聞いてないのだろう。', reading: 'おそらくかれはまだそのしらせをきいてないのだろう。', en: 'Chances are that he has not heard the news yet.', sourceId: '1223433', source: 'tatoeba' },
  ],
  // N2 ほかはない
  'n2m-g-2a6c3f': [
    { jp: 'よかれあしかれ、この問題は彼に委せるほかはない。', reading: 'よかれあしかれ、このもんだいはかれにまかせるほかはない。', en: 'For better or worse, there is nothing for it but to leave the matter in his hands.', sourceId: '192837', source: 'tatoeba' },
  ],
  // N2 なくて済む/ないで済む
  'n2m-g-2a83fa': [
    { jp: '誰の助けもかりないで済むものはいない。', reading: 'だれのたすけもかりないですむものはいない。', en: 'Nobody can dispense with somebody\'s service.', sourceId: '136730', source: 'tatoeba' },
    { jp: 'これでこれ以上の義務を負わなくて済む。', reading: 'これでこれいじょうのぎむをおわなくてすむ。', en: 'That absolves me from further responsibility.', sourceId: '218777', source: 'tatoeba' },
    { jp: 'あなたがただ手紙を書くだけで、あなたの父親は多くのことを心配しなくて済むだろう。', reading: 'あなたがただてがみをかくだけで、あなたのちちおやはおおくのことをしんぱいしなくてすむだろう。', en: 'You will save your father a lot of worry if you simply write him a letter.', sourceId: '234190', source: 'tatoeba' },
  ],
  // N2 としている
  'n2m-g-2c8e25': [
    { jp: '彼女は何をしようとしているのだと思いますか。', reading: 'かのじょはなにをしようとしているのだとおもいますか。', en: 'What do you think she is going to do?', sourceId: '90907', source: 'tatoeba' },
    { jp: '彼らは日本品を市場から駆逐しようとしている。', reading: 'かれらはにっぽんひんをしじょうからくちくしようとしている。', en: 'They are trying to drive Japanese goods out of the market.', sourceId: '96419', source: 'tatoeba' },
    { jp: '彼らはエアロビクスで元気はつらつとしている。', reading: 'かれらはエアロビクスでげんきはつらつとしている。', en: 'They keep up their spirits by doing aerobics.', sourceId: '98174', source: 'tatoeba' },
  ],
  // N2 ...そのもの
  'n2m-g-2ccf59': [
    { jp: '君が捜していたズバリそのものを見つけました。', reading: 'きみがさがしていたズバリそのものをみつけました。', en: 'I found the very thing you had been looking for.', sourceId: '178935', source: 'tatoeba' },
    { jp: '私はそのものすごく大きな魚に大変驚いた。', reading: 'わたしはそのものすごくおおきなさかなにたいへんおどろいた。', en: 'I was very surprised at the huge fish.', sourceId: '160321', source: 'tatoeba' },
    { jp: '彼は行動も言動も田舎もんそのものだよ。', reading: 'かれはこうどうもげんどうもいなかもんそのものだよ。', en: 'The way he talks and acts, you can tell he\'s a redneck.', sourceId: '107324', source: 'tatoeba' },
  ],
  // N2 かえって
  'n2m-g-303491': [
    { jp: '彼は恥ずかしがりやだから、かえって好きです。', reading: 'かれははずかしがりやだから、かえってすきです。', en: 'I like him all the better for his shyness.', sourceId: '102220', source: 'tatoeba' },
    { jp: '彼は転地したためにかえっていっそう悪くなった。', reading: 'かれはてんちしたためにかえっていっそうわるくなった。', en: 'He is so much the worse for a change of air.', sourceId: '101908', source: 'tatoeba' },
    { jp: '彼は欠点があるからかえって私は彼が好きなのだ。', reading: 'かれはけってんがあるからかえってわたしはかれがすきなのだ。', en: 'I like him all the better for his faults.', sourceId: '107903', source: 'tatoeba' },
  ],
  // N2 ほどなく
  'n2m-g-3041f2': [
    { jp: '彼女はほどなくもどるでしょう。', reading: 'かのじょはほどなくもどるでしょう。', en: 'She will be back before long.', sourceId: '91530', source: 'tatoeba' },
    { jp: 'ほどなくその音は消えていった。', reading: 'ほどなくそのおとはきえていった。', en: 'Soon the sound died away.', sourceId: '196172', source: 'tatoeba' },
    { jp: '彼女はほどなくやってきた。', reading: 'かのじょはほどなくやってきた。', en: 'It was not long before she came.', sourceId: '91529', source: 'tatoeba' },
  ],
  // N2 得る
  'n2m-g-31f6cd': [
    { jp: '良い収穫を得る為には、肥沃な土壌が不可欠だ。', reading: 'よいしゅうかくをえるためには、ひよくなどじょうがふかけつだ。', en: 'Fertile soil is indispensable for a good harvest.', sourceId: '77875', source: 'tatoeba' },
    { jp: '天才とは忍耐に堪え得る偉大な適性に外ならぬ。', reading: 'てんさいとはにんたいにこたええるいだいなてきせいにそとならぬ。', en: 'Genius is nothing but a great aptitude for patience.', sourceId: '125034', source: 'tatoeba' },
    { jp: '人々は大統領のサインを得るために列に並んだ。', reading: 'ひとびとはだいとうりょうのサインをえるためにれつにならんだ。', en: 'The people were in a line to get the signature of the president.', sourceId: '144083', source: 'tatoeba' },
  ],
  // N2 それどころか
  'n2m-g-3329c8': [
    { jp: '彼は忙しいと思ったが、それどころか暇だった。', reading: 'かれはいそがしいとおもったが、それどころかひまだった。', en: 'I thought he was busy, but on the contrary he was idle.', sourceId: '100003', source: 'tatoeba' },
    { jp: '「おわったの」「それどころかまだ始めていないよ」', reading: '「おわったの」「それどころかまだはじめていないよ」', en: '"Have you finished?" "On the contrary, I have not even begun yet."', sourceId: '5170', source: 'tatoeba' },
    { jp: '「終わったの」「それどころかまだ始めてもいないよ」', reading: '「おわったの」「それどころかまだはじめてもいないよ」', en: '"Have you finished?" "On the contrary I have not even begun yet."', sourceId: '236271', source: 'tatoeba' },
  ],
  // N2 少なくとも
  'n2m-g-336932': [
    { jp: '彼の書斎には少なくとも１０００冊の本がある。', reading: 'かれのしょさいにはすくなくともせんさつのほんがある。', en: 'He has not less than 1,000 books in his study.', sourceId: '116973', source: 'tatoeba' },
    { jp: '二月には少なくとも三日に一度は雪が降ります。', reading: 'にがつにはすくなくともさんにちにいちどはゆきがおります。', en: 'In February it snows at least every three days.', sourceId: '123148', source: 'tatoeba' },
    { jp: '修理代は少なくとも二〇ポンドはかかりそうだ。', reading: 'しゅうりだいはすくなくともにれいポンドはかかりそうだ。', en: 'The repairs will cost at least 20 pounds.', sourceId: '148224', source: 'tatoeba' },
  ],
  // N2 ～てまで/までして
  'n2m-g-33fb71': [
    { jp: '彼は自尊心を犠牲にしてまでそれを得ようとした。', reading: 'かれはじそんしんをぎせいにしてまでそれをえようとした。', en: 'He tried to get it at the expense of self-respect.', sourceId: '105214', source: 'tatoeba' },
    { jp: '自分の家を売ってまでフェラーリは欲しくないよ。', reading: 'じぶんのいえをうってまでフェラーリはほしくないよ。', en: 'I don\'t want a Ferrari bad enough to sell my house to get one.', sourceId: '149899', source: 'tatoeba' },
    { jp: '私は父に反対してまで彼女の味方になった。', reading: 'わたしはちちにはんたいしてまでかのじょのみかたになった。', en: 'I supported her even against my father.', sourceId: '153003', source: 'tatoeba' },
  ],
  // N2 からすると/からすれば/からしたら
  'n2m-g-360465': [
    { jp: '実践的見地からすれば彼の計画は実行しにくい。', reading: 'じっせんてきけんちからすればかれのけいかくはじっこうしにくい。', en: 'From a practical point of view, his plan is not easy to carry out.', sourceId: '149289', source: 'tatoeba' },
    { jp: '周りの事情からすると彼女の話は本当らしかった。', reading: 'まわりのじじょうからするとかのじょのはなしはほんとうらしかった。', en: 'The circumstances gave color to her story.', sourceId: '148265', source: 'tatoeba' },
    { jp: 'その事実は科学の観点からすれば非常に重要です。', reading: 'そのじじつはかがくのかんてんからすればひじょうにじゅうようです。', en: 'That fact is of great importance from the viewpoint of science.', sourceId: '209800', source: 'tatoeba' },
  ],
  // N2 途端に...
  'n2m-g-37cdda': [
    { jp: 'その物音を聞いた途端に、私の弟は泣き始めた。', reading: 'そのものおとをきいたとたんに、わたしのおとうとはなきはじめた。', en: 'On hearing the noise, my brother started to cry.', sourceId: '206908', source: 'tatoeba' },
    { jp: '彼女は終わった途端に仮眠するために横になった。', reading: 'かのじょはおわったとたんにかみんするためによこになった。', en: 'The moment she\'d finished, she lay down for a nap.', sourceId: '88793', source: 'tatoeba' },
    { jp: '椅子に深く座ってくつろいだ途端に、電話が鳴った。', reading: 'いすにふかくすわってくつろいだとたんに、でんわがなった。', en: 'No sooner had I sat down and relaxed than the phone rang.', sourceId: '191026', source: 'tatoeba' },
  ],
  // N2 いきなり
  'n2m-g-37ddd6': [
    { jp: 'いきなり本人に誰何するのも無粋と考えました。', reading: 'いきなりほんにんにすいかするのもぶすいとかんがえました。', en: 'I thought it would be boorish to challenge his identity without warning.', sourceId: '74386', source: 'tatoeba' },
    { jp: 'いきなり入って来て威張ってもらってもこまる。', reading: 'いきなりはいってきていばってもらってもこまる。', en: 'You can\'t just come in here and start ordering people around.', sourceId: '229266', source: 'tatoeba' },
    { jp: 'びっくりした！いきなり後ろから脅かさないでよ！', reading: 'びっくりした！いきなりうしろからおどかさないでよ！', en: 'You scared me! Don\'t sneak up on me from behind!', sourceId: '894825', source: 'tatoeba' },
  ],
  // N2 にちがいない
  'n2m-g-392e90': [
    { jp: '彼女は若い頃はとても美しかったにちがいない。', reading: 'かのじょはわかいころはとてもうつくしかったにちがいない。', en: 'She must have been very beautiful when she was young.', sourceId: '88866', source: 'tatoeba' },
    { jp: '彼女は若い頃ずいぶん美人だったにちがいない。', reading: 'かのじょはわかいころずいぶんびじんだったにちがいない。', en: 'She must have been very beautiful when she was young.', sourceId: '88868', source: 'tatoeba' },
    { jp: '彼女は昨日仕事を終えてしまったにちがいない。', reading: 'かのじょはきのうしごとをおえてしまったにちがいない。', en: 'She must have finished the work yesterday.', sourceId: '89890', source: 'tatoeba' },
  ],
  // N2 どことなく
  'n2m-g-3935b0': [
    { jp: 'トムって私のお父さんにどことなく似てるの。', reading: 'トムってわたしのおとうさんにどことなくにてるの。', en: 'Tom is somewhat like my father.', sourceId: '9853700', source: 'tatoeba' },
    { jp: '彼女にはどことなく神秘的なところがある。', reading: 'かのじょにはどことなくしんぴてきなところがある。', en: 'There\'s something mysterious about her.', sourceId: '94998', source: 'tatoeba' },
    { jp: '彼にはどことなく謎めいたところがある。', reading: 'かれにはどことなくなぞめいたところがある。', en: 'There\'s something mysterious about him.', sourceId: '118959', source: 'tatoeba' },
  ],
  // N2 よりほか(は)ない
  'n2m-g-3af22f': [
    { jp: '彼らは計画全体をあきらめるよりほかないと意見が一致している。', reading: 'かれらはけいかくぜんたいをあきらめるよりほかないといけんがいっちしている。', en: 'They agree that they have no choice but to give up the whole plan.', sourceId: '97284', source: 'tatoeba' },
  ],
  // N2 ～からなる(成る)
  'n2m-g-3d9cb1': [
    { jp: '水分子は、２個の水素原子と１個の酸素原子からなる。', reading: 'すいぶんこは、[２|]このすいそげんしと[１|]このさんそげんしからなる。', en: 'A water molecule has two hydrogen atoms and one oxygen atom.', sourceId: '143630', source: 'tatoeba' },
    { jp: 'その会議は１０人のメンバーからなる。', reading: 'そのかいぎは[１|][０|]にんのメンバーからなる。', en: 'The committee comprises ten members.', sourceId: '211894', source: 'tatoeba' },
    { jp: 'その委員会は科学者と技術者からなる。', reading: 'そのいいんかいはかがくしゃとぎじゅつしゃからなる。', en: 'The committee consists of scientists and engineers.', sourceId: '212375', source: 'tatoeba' },
  ],
  // N2 のみならず/のみか
  'n2m-g-425c83': [
    { jp: '彼女のみならず彼女の息子達も幸せだった。', reading: 'かのじょのみならずかのじょのむすこたちもしあわせだった。', en: 'Her sons as well as she were happy.', sourceId: '94655', source: 'tatoeba' },
    { jp: '彼は英語のみならずフランス語も話すことができる。', reading: 'かれはえいごのみならずフランスごもはなすことができる。', en: 'He can speak not only English but also French.', sourceId: '109706', source: 'tatoeba' },
    { jp: '時は虚偽のみならず真実も明らかにする。', reading: 'ときはきょぎのみならずしんじつもあきらかにする。', en: 'Time reveals truth as well as falsehood.', sourceId: '150658', source: 'tatoeba' },
  ],
  // N2 ては～ては
  'n2m-g-4312a7': [
    { jp: 'その鋭いかぎ爪を開いては閉じ、開いては閉じ始めた。', reading: 'そのするどいかぎづめをひらいてはとじ、ひらいてはとじはじめた。', en: 'Its sharp claws began to open and close, open and close.', sourceId: '212209', source: 'tatoeba' },
    { jp: '正しい事をしてはいけなく、してはいけない事が正しく感じます。', reading: 'ただしいことをしてはいけなく、してはいけないことがただしくかんじます。', en: 'Right feels wrong and wrong feels right.', sourceId: '1513286', source: 'tatoeba' },
    { jp: '今日は一日中、雨が降っては止み、降っては止みする、はっきりしない天気だ。', reading: 'きょうはいちにちじゅう、あめがふってはやみ、ふってはやみする、はっきりしないてんきだ。', en: 'Today the weather was really changeable. The rain kept on stopping and starting all day long.', sourceId: '988074', source: 'tatoeba' },
  ],
  // N2 をきっかけに/を契機に
  'n2m-g-475861': [
    { jp: '株価上昇を契機に新工場建設の話が持ち上がった。', reading: 'かぶかじょうしょうをけいきにしんこうじょうけんせつのはなしがもちあがった。', en: 'They took advantage of the stock price increase to raise the idea of building a new factory.', sourceId: '76270', source: 'tatoeba' },
    { jp: '松川先生との出会いをきっかけに、私の人生は変わった。', reading: 'まつかわせんせいとのであいをきっかけに、わたしのじんせいはかわった。', en: 'My life changed, sparked by meeting Mr Matsukawa.', sourceId: '75275', source: 'tatoeba' },
    { jp: '退職を契機に茶道を始めた。', reading: 'たいしょくをけいきにさどうをはじめた。', en: 'I took the opportunity of retirement to begin studying the tea ceremony.', sourceId: '75903', source: 'tatoeba' },
  ],
  // N2 ちっとも～ない
  'n2m-g-48657c': [
    { jp: '彼は父親の言うことをちっとも聞かない。', reading: 'かれはちちおやのいうことをちっともきかない。', en: 'He never takes any notice of what his father says.', sourceId: '100348', source: 'tatoeba' },
    { jp: '今日は昨日と違ってちっとも暑くない。', reading: 'きょうはきのうとちがってちっともあつくない。', en: 'It isn\'t anywhere near as hot today as it was yesterday.', sourceId: '171631', source: 'tatoeba' },
    { jp: 'あなたが彼に言いつけたって私はちっともかまわない。', reading: 'あなたがかれにいいつけたってわたしはちっともかまわない。', en: 'You can tell him for all I care.', sourceId: '233950', source: 'tatoeba' },
  ],
  // N2 て仕方がない/てしょうがない
  'n2m-g-4adb14': [
    { jp: 'あいつを見ると、いまいましくてしょうがない。', reading: 'あいつをみると、いまいましくてしょうがない。', en: 'The sight of him is hateful to me.', sourceId: '234592', source: 'tatoeba' },
    { jp: 'そこらじゅう蚊に刺されてかゆくてしょうがない。', reading: 'そこらじゅうかにさされてかゆくてしょうがない。', en: 'I got bit by mosquitoes all over this area, and it itches so badly I can\'t stand it.', sourceId: '213568', source: 'tatoeba' },
    { jp: '今日は月曜日なのに、日曜日のような気がして仕方がない。', reading: 'きょうはげつようびなのに、にちようびのようなきがしてしかたがない。', en: 'Today\'s Monday, but I can\'t help feeling like it\'s Sunday.', sourceId: '1167783', source: 'tatoeba' },
  ],
  // N2 しかしながら
  'n2m-g-4aef10': [
    { jp: 'もう９月だ。しかしながら、たいへん嬉しい。', reading: 'もうくがつだ。しかしながら、たいへんうれしい。', en: 'It\'s already September; however, it is very hot.', sourceId: '194509', source: 'tatoeba' },
    { jp: 'しかしながら、彼の言葉は全然信用されなかった。', reading: 'しかしながら、かれのことばはぜんぜんしんようされなかった。', en: 'His words, however, were not believed at all.', sourceId: '216254', source: 'tatoeba' },
    { jp: 'しかしながら、品物の数が誤っていました。', reading: 'しかしながら、しなもののかずがあやまっていました。', en: 'However, the quantity was not correct.', sourceId: '216253', source: 'tatoeba' },
  ],
  // N2 そうにない/そうもない
  'n2m-g-4cc73e': [
    { jp: '彼は他人の悪口を決して言いそうにない人物だ。', reading: 'かれはたにんのわるぐちをけっしていいそうにないじんぶつだ。', en: 'He is the last person to speak ill of others.', sourceId: '102618', source: 'tatoeba' },
    { jp: '言行一致なんて、とても俺にはできそうにない。', reading: 'げんこういっちなんて、とてもおれにはできそうにない。', en: 'I could never be a true man of my word.', sourceId: '174717', source: 'tatoeba' },
    { jp: '足がしびれちゃって、すぐに立てそうにないよ。', reading: 'あしがしびれちゃって、すぐにたてそうにないよ。', en: 'My leg\'s gone to sleep, so I don\'t think I can stand up right away.', sourceId: '1101809', source: 'tatoeba' },
  ],
  // N2 …とすると
  'n2m-g-4f28a6': [
    { jp: '「とすると石造り？」「一般的なＲＣ造よ」', reading: '「とするといしづくり？」「いっぱんてきな[ＲＣ|]づくりよ」', en: '"So it\'s built from stone?" "It\'s ordinary reinforced concrete."', sourceId: '77013', source: 'tatoeba' },
    { jp: '国が自分たちの帝国を築こうとすると戦争が起こる。', reading: 'くにがじぶんたちのていこくをきずこうとするとせんそうがおこる。', en: 'War breaks out when nations try to form their own empires.', sourceId: '173119', source: 'tatoeba' },
    { jp: 'ここで何かやろうとすると必ず論争がある。', reading: 'ここでなにかやろうとするとかならずろんそうがある。', en: 'Nothing is ever done here without dispute.', sourceId: '224578', source: 'tatoeba' },
  ],
  // N2 あえて～ば
  'n2m-g-4f8e4a': [
    { jp: 'あえて行くに及ばない。', reading: 'あえていくにおよばない。', en: 'You need not take the trouble to go.', sourceId: '234526', source: 'tatoeba' },
  ],
  // N2 にきまっている
  'n2m-g-5154ca': [
    { jp: 'そんな子供じみた計画は失敗するにきまっている。', reading: 'そんなこどもじみたけいかくはしっぱいするにきまっている。', en: 'Such a childish plan is bound to fail.', sourceId: '204126', source: 'tatoeba' },
  ],
  // N2 得ない
  'n2m-g-53b94a': [
    { jp: '野心は抱くに値するが、容易に達成され得ない。', reading: 'やしんはいだくにあたいするが、よういにたっせいされえない。', en: 'Although ambitions are well worth having, they are not to be achieved easily.', sourceId: '79593', source: 'tatoeba' },
    { jp: '彼らは彼のわずかな収入で暮らさざるを得ない。', reading: 'かれらはかれのわずかなしゅうにゅうでくらさざるをえない。', en: 'They have to live on his small income.', sourceId: '96352', source: 'tatoeba' },
    { jp: '死よりももっと美しいものは何も起こり得ない。', reading: 'しよりももっとうつくしいものはなにもおこりえない。', en: 'Nothing can happen more beautiful than death.', sourceId: '168146', source: 'tatoeba' },
  ],
  // N2 を中心に
  'n2m-g-549838': [
    { jp: '世界は君を中心に回っているわけではないんだよ。', reading: 'せかいはきみをちゅうしんにまわっているわけではないんだよ。', en: 'The world doesn\'t revolve around you.', sourceId: '5287', source: 'tatoeba' },
    { jp: 'その家のことはすべてメアリー叔母さんを中心に動いていた。', reading: 'そのいえのことはすべてメアリーおばさんをちゅうしんにうごいていた。', en: 'Everything in that house revolved upon Aunt Mary.', sourceId: '212124', source: 'tatoeba' },
    { jp: '世界経済がアメリカ経済を中心に動いているという事実は誰も否定できない。', reading: 'せかいけいざいがアメリカけいざいをちゅうしんにうごいているというじじつはだれもひていできない。', en: 'Nobody can deny the fact the world economy revolves around the American economy.', sourceId: '143400', source: 'tatoeba' },
  ],
  // N2 とかく…がちだ
  'n2m-g-573801': [
    { jp: '運動が健康の鍵であるのを私たちはとかく忘れがちだ。', reading: 'うんどうがけんこうのかぎであるのをわたしたちはとかくわすれがちだ。', en: 'We tend to forget that exercise is a key to good health.', sourceId: '189416', source: 'tatoeba' },
    { jp: '歴史を無視する人はとかくあやまちを繰り返しがちだ。', reading: 'れきしをむしするひとはとかくあやまちをくりかえしがちだ。', en: 'People who ignore history tend to repeat it.', sourceId: '6855715', source: 'tatoeba' },
  ],
  // N2 …かというと
  'n2m-g-583142': [
    { jp: 'あの人にはどちらかというと難しいでしょう。', reading: 'あのひとにはどちらかというとむずかしいでしょう。', en: 'It will be rather difficult for him.', sourceId: '230773', source: 'tatoeba' },
    { jp: '彼は、どちらかというと、分別のある人だ。', reading: 'かれは、どちらかというと、ふんべつのあるひとだ。', en: 'He, if anything, is a sensible man.', sourceId: '115629', source: 'tatoeba' },
    { jp: '今晩はどちらかというと映画に行くより家にいたい。', reading: 'こんばんはどちらかというとえいがにいくよりいえにいたい。', en: 'I would rather stay at home than go to the movies tonight.', sourceId: '171247', source: 'tatoeba' },
  ],
  // N2 と考えられる/と考えられている
  'n2m-g-591e0c': [
    { jp: '欧米では時間厳守は当然の事と考えられている。', reading: 'おうべいではじかんげんしゅはとうぜんのこととかんがえられている。', en: 'In Europe and America, people regard punctuality as a matter of course.', sourceId: '188509', source: 'tatoeba' },
    { jp: 'その犠牲者はまちがって大量の毒を飲んだと考えられる。', reading: 'そのぎせいしゃはまちがってたいりょうのどくをのんだとかんがえられる。', en: 'The victim is thought to have taken a large quantity of poison by mistake.', sourceId: '211477', source: 'tatoeba' },
    { jp: '真夜中は幽霊がうろつく時刻だと考えられている。', reading: 'まよなかはゆうれいがうろつくじこくだとかんがえられている。', en: 'Midnight is when ghosts are thought to walk the earth.', sourceId: '144958', source: 'tatoeba' },
  ],
  // N2 ようだったら
  'n2m-g-5b0a5e': [
    { jp: '間に合わないようだったら、教えてね。', reading: 'まにあわないようだったら、おしえてね。', en: 'Let me know if you won\'t be here on time.', sourceId: '11052283', source: 'tatoeba' },
    { jp: 'どうかな？英文に合わないようだったら、リンクを外します。', reading: 'どうかな？えいぶんにあわないようだったら、リンクをはずします。', en: 'If it doesn\'t seem to match the English sentence, how about I unlink it?', sourceId: '10008957', source: 'tatoeba' },
    { jp: '本のリストが長すぎるようだったら、外国の本は省いてください。', reading: 'ほんのリストがながすぎるようだったら、がいこくのほんははぶいてください。', en: 'If the list of books is too long, please leave out all foreign books.', sourceId: '81660', source: 'tatoeba' },
  ],
  // N2 いったん～ば／と／たら
  'n2m-g-5be567': [
    { jp: '近医で処方を希望したら露骨に嫌な顔をされた。', reading: 'きんいでしょほうをきぼうしたらろこつにいやなかおをされた。', en: 'I was given a nasty look when I asked for my prescription at the local doctor\'s.', sourceId: '74712', source: 'tatoeba' },
    { jp: 'もし変更が必要でしたら、お知らせください。', reading: 'もしへんこうがひつようでしたら、おしらせください。', en: 'Let me know if I need to make any changes.', sourceId: '5016', source: 'tatoeba' },
    { jp: '君が演説をして誰も来なかったらどうするの？', reading: 'きみがえんぜつをしてだれもこなかったらどうするの？', en: 'What if you gave a speech and nobody came?', sourceId: '5102', source: 'tatoeba' },
  ],
  // N2 折には
  'n2m-g-5cc605': [
    { jp: '今度東京においでの折にはお立ち寄りください。', reading: 'こんどとうきょうにおいでのおりにはおたちよりください。', en: 'Drop in and see us when you\'re next in Tokyo.', sourceId: '172080', source: 'tatoeba' },
    { jp: 'お暇の折にはぜひ遊びに来てください。', reading: 'おいとまのおりにはぜひあそびにきてください。', en: 'Do come and see us when you are free.', sourceId: '227393', source: 'tatoeba' },
  ],
  // N2 いよいよ
  'n2m-g-5d2244': [
    { jp: 'いよいよ今週を限りに、しばらくのお休みです。', reading: 'いよいよこんしゅうをかぎりに、しばらくのおやすみです。', en: 'I\'ve finally got some vacation coming as of the end of this week.', sourceId: '74065', source: 'tatoeba' },
    { jp: 'いよいよ千載一遇のチャンスがめぐってきた。', reading: 'いよいよせんざいいちぐうのチャンスがめぐってきた。', en: 'At last, a chance in a million arrived.', sourceId: '228463', source: 'tatoeba' },
    { jp: 'いよいよという時になって彼は怖じ気付いた。', reading: 'いよいよというときになってかれはおじけづいた。', en: 'His nerve failed him at the last moment.', sourceId: '228465', source: 'tatoeba' },
  ],
  // N2 ...きれない
  'n2m-g-5e1cbf': [
    { jp: '彼女の行為は言葉では誉めきれないほど立派だ。', reading: 'かのじょのこういはことばではほめきれないほどりっぱだ。', en: 'Her behavior is above praise.', sourceId: '94424', source: 'tatoeba' },
    { jp: 'パーティーでは食べきれないほど食べ物が出た。', reading: 'パーティーではたべきれないほどたべものがでた。', en: 'At the party there was food in abundance.', sourceId: '198516', source: 'tatoeba' },
    { jp: 'この氷は薄すぎて君の体を支えきれないだろう。', reading: 'このこおりはうすすぎてきみのからだをささえきれないだろう。', en: 'This ice is too thin to bear your weight.', sourceId: '220118', source: 'tatoeba' },
  ],
  // N2 及び
  'n2m-g-610ce4': [
    { jp: 'このチケットの変更及び払い戻しはできません。', reading: 'このチケットのへんこうおよびはらいもどしはできません。', en: 'This ticket is non-exchangeable and non-refundable.', sourceId: '10227815', source: 'tatoeba' },
    { jp: 'わざわざ当社までお出でいただくには及びません。', reading: 'わざわざとうしゃまでおいでいただくにはおよびません。', en: 'Please don\'t go to the trouble of coming to our office.', sourceId: '191982', source: 'tatoeba' },
    { jp: '試験中は、全てのドア及び窓を開放してください。', reading: 'しけんちゅうは、すべてのドアおよびまどをかいほうしてください。', en: 'Please keep all windows and doors open during an exam.', sourceId: '8660472', source: 'tatoeba' },
  ],
  // N2 だったら
  'n2m-g-6172cb': [
    { jp: '僕だったらそんなずうずうしいことは言えない。', reading: 'ぼくだったらそんなずうずうしいことはいえない。', en: 'I wouldn\'t have the cheek to say such a thing.', sourceId: '82319', source: 'tatoeba' },
    { jp: '彼が私たちのチームの選手だったらいいのにな。', reading: 'かれがわたしたちのチームのせんしゅだったらいいのにな。', en: 'I wish he were on our team.', sourceId: '120294', source: 'tatoeba' },
    { jp: '世界最速の走者でさえ、空腹だったら走れない。', reading: 'せかいさいそくのそうしゃでさえ、くうふくだったらはしれない。', en: 'Even the fastest runner in the world cannot run if he is hungry.', sourceId: '143398', source: 'tatoeba' },
  ],
  // N2 ないでもない
  'n2m-g-619390': [
    { jp: '君の話にも多少当たっているところがある、君の話もわからないでもない。', reading: 'きみのはなしにもたしょうあたっているところがある、きみのはなしもわからないでもない。', en: 'There may be some truth in your story.', sourceId: '178000', source: 'tatoeba' },
  ],
  // N2 ではいられない
  'n2m-g-61f2f3': [
    { jp: '彼を見ると、笑わないではいられないだろう。', reading: 'かれをみると、わらわないではいられないだろう。', en: 'To look at him, you couldn\'t help laughing.', sourceId: '95901', source: 'tatoeba' },
    { jp: '彼は一日たりともワインなしではいられない。', reading: 'かれはいちにちたりともワインなしではいられない。', en: 'He can\'t go without wine for even a day.', sourceId: '3462814', source: 'tatoeba' },
    { jp: '私は彼の正直さを疑わないではいられない。', reading: 'わたしはかれのしょうじきさをうたがわないではいられない。', en: 'I can\'t help doubting his honesty.', sourceId: '153841', source: 'tatoeba' },
  ],
  // N2 とにかく
  'n2m-g-625633': [
    { jp: '彼は金持ちではないが、とにかく幸福である。', reading: 'かれはかねもちではないが、とにかくこうふくである。', en: 'He\'s not rich, but he\'s happy.', sourceId: '108175', source: 'tatoeba' },
    { jp: '我々はとにかく明日彼を訪問しなければならない。', reading: 'われわれはとにかくあしたかれをほうもんしなければならない。', en: 'We have to call on him tomorrow at any rate.', sourceId: '186008', source: 'tatoeba' },
    { jp: 'とにかく雨さえ止めば、出かけられるだろう。', reading: 'とにかくあめさえやめば、でかけられるだろう。', en: 'Anyway, if it just stops raining, then we might be able to go out.', sourceId: '200457', source: 'tatoeba' },
  ],
  // N2 と違って
  'n2m-g-6693c9': [
    { jp: '彼女は私に対する態度がいつもと違っていた。', reading: 'かのじょはわたしにたいするたいどがいつもとちがっていた。', en: 'Her behaviour towards me was a departure from the norm.', sourceId: '89472', source: 'tatoeba' },
    { jp: '彼女はその男と違ってとても幸せそうだった。', reading: 'かのじょはそのおとことちがってとてもしあわせそうだった。', en: 'She seemed very happy in contrast to the man.', sourceId: '92387', source: 'tatoeba' },
    { jp: '理性があるという点で人間は他の動物と違っている。', reading: 'りせいがあるというてんでにんげんはたのどうぶつとちがっている。', en: 'Human beings differ from other animals in that they have reason.', sourceId: '78375', source: 'tatoeba' },
  ],
  // N2 どちらかというと
  'n2m-g-66a75b': [
    { jp: 'あの人にはどちらかというと難しいでしょう。', reading: 'あのひとにはどちらかというとむずかしいでしょう。', en: 'It will be rather difficult for him.', sourceId: '230773', source: 'tatoeba' },
    { jp: '彼は、どちらかというと、分別のある人だ。', reading: 'かれは、どちらかというと、ふんべつのあるひとだ。', en: 'He, if anything, is a sensible man.', sourceId: '115629', source: 'tatoeba' },
    { jp: '今晩はどちらかというと映画に行くより家にいたい。', reading: 'こんばんはどちらかというとえいがにいくよりいえにいたい。', en: 'I would rather stay at home than go to the movies tonight.', sourceId: '171247', source: 'tatoeba' },
  ],
  // N2 ...というのも
  'n2m-g-66e4be': [
    { jp: '健康は富に勝る。というのも、後者は前者ほど幸福をもたらさないからだ。', reading: 'けんこうはとみにまさる。というのも、こうしゃはぜんしゃほどこうふくをもたらさないからだ。', en: 'Health is above wealth; the latter gives less fortune than the former.', sourceId: '175467', source: 'tatoeba' },
    { jp: 'ニックはポルトガル語をとても上手に話せます。というのも５年間勉強しているからです。', reading: 'ニックはポルトガルごをとてもじょうずにはなせます。というのも[５|]ねんかんべんきょうしているからです。', en: 'Nick can speak Portuguese very well. That\'s because he\'s been studying it for 5 years.', sourceId: '198783', source: 'tatoeba' },
    { jp: '彼女は機嫌が悪いというのも、いつも地下鉄に乗り遅れ仕事場まで歩く羽目になったからだ。', reading: 'かのじょはきげんがわるいというのも、いつもちかてつにのりおくれしごとばまであるくはめになったからだ。', en: 'She is in a temper, because she missed her usual train in the subway and had to walk to work.', sourceId: '90591', source: 'tatoeba' },
  ],
  // N2 からして
  'n2m-g-69f9c4': [
    { jp: '他人からしてもらいたいように他人にしなさい。', reading: 'たにんからしてもらいたいようにたにんにしなさい。', en: 'Do unto others as you would have others do unto you.', sourceId: '138569', source: 'tatoeba' },
    { jp: '彼らの顔つきからして、まあ失敗したのでしょう。', reading: 'かれらのかおつきからして、まあしっぱいしたのでしょう。', en: 'From the way they look, I would say that they failed.', sourceId: '98532', source: 'tatoeba' },
    { jp: '人からしてもらいたいように人にしてやれ。', reading: 'ひとからしてもらいたいようにひとにしてやれ。', en: 'Do to others as you would be done by.', sourceId: '144695', source: 'tatoeba' },
  ],
  // N2 ではあるまいか
  'n2m-g-6a39d4': [
    { jp: 'あそこの人は社長の為に没落したのではあるまいか。', reading: 'あそこのひとはしゃちょうのためにぼつらくしたのではあるまいか。', en: 'That fellow over there might be the one who was ruined by the company\'s president.', sourceId: '6727604', source: 'tatoeba' },
    { jp: '彼女の両親は娘の貯金が最早消えたのではあるまいかと心配になった。', reading: 'かのじょのりょうしんはむすめのちょきんがもはやきえたのではあるまいかとしんぱいになった。', en: 'Her parents were starting to fear she had already lost her savings.', sourceId: '6727654', source: 'tatoeba' },
    { jp: '部屋が静かになった時インディアナ・ジョーンズは罠ではあるまいかと迷いました。', reading: 'へやがしずかになったときインディアナ・ジョーンズはわなではあるまいかとまよいました。', en: 'Indiana Jones wondered if it wasn\'t a trap when the room became silent.', sourceId: '6727691', source: 'tatoeba' },
  ],
  // N2 だといって
  'n2m-g-6e30cf': [
    { jp: '貧乏だからだといって人を軽蔑してはいけない。', reading: 'びんぼうだからだといってひとをけいべつしてはいけない。', en: 'You should not despise a man because he is poor.', sourceId: '85162', source: 'tatoeba' },
    { jp: '現代は原子力時代だといっても過言ではない。', reading: 'げんだいはげんしりょくじだいだといってもかごんではない。', en: 'It is not too much to say that this is the atomic age.', sourceId: '174841', source: 'tatoeba' },
    { jp: '今は原子力時代だといっても過言ではない。', reading: 'いまはげんしりょくじだいだといってもかごんではない。', en: 'It is not too much to say that this is the atomic age.', sourceId: '172655', source: 'tatoeba' },
  ],
  // N2 ないでおく
  'n2m-g-6e3942': [
    { jp: 'それは触れないでおくのが一番いい。', reading: 'それはふれないでおくのがいちばんいい。', en: 'It is best left untouched.', sourceId: '205067', source: 'tatoeba' },
    { jp: 'それを言わないでおく方がいい。', reading: 'それをいわないでおくほうがいい。', en: 'It would be better to leave it unsaid.', sourceId: '204595', source: 'tatoeba' },
    { jp: 'コーヒーのおかげで退屈なコンサートの間眠らないでおくことができた。', reading: 'コーヒーのおかげでたいくつなコンサートのかんねむらないでおくことができた。', en: 'The coffee enabled me to stay awake during the dull concert.', sourceId: '224925', source: 'tatoeba' },
  ],
  // N2 からいうと/からいえば/からいって
  'n2m-g-6e693f': [
    { jp: 'それは私が初めからいってきたことです。', reading: 'それはわたしがはじめからいってきたことです。', en: 'That\'s what I said all along.', sourceId: '205164', source: 'tatoeba' },
    { jp: '建築デザインの立場からいうと、このアプローチにはもっと多くの代案が考えられる。', reading: 'けんちくデザインのたちばからいうと、このアプローチにはもっとおおくのだいあんがかんがえられる。', en: 'From the standpoint of architectural design, there can be more alternatives to this approach.', sourceId: '175398', source: 'tatoeba' },
  ],
  // N2 たいてい
  'n2m-g-6eb651': [
    { jp: '状況しだいですね。でも、たいてい週に３回です。', reading: 'じょうきょうしだいですね。でも、たいていしゅうに[３|]かいです。', en: 'That depends, but usually about three times a week.', sourceId: '146031', source: 'tatoeba' },
    { jp: '私は日曜日はたいていジーンズをはいている。', reading: 'わたしはにちようびはたいていジーンズをはいている。', en: 'I usually wear jeans on Sunday.', sourceId: '154676', source: 'tatoeba' },
    { jp: '父は外泊するときはたいてい帽子をかぶる。', reading: 'ちちはがいはくするときはたいていぼうしをかぶる。', en: 'My father usually wears a hat when he goes out for the night.', sourceId: '84613', source: 'tatoeba' },
  ],
  // N2 そもそも
  'n2m-g-6f4abd': [
    { jp: '彼女に口答えすること自体そもそも間違いだろ。', reading: 'かのじょにくちごたえすることじたいそもそもまちがいだろ。', en: 'It\'s wrong of you to talk back to her.', sourceId: '451787', source: 'tatoeba' },
    { jp: 'そもそもあなたたちの喧嘩の原因は何だったの。', reading: 'そもそもあなたたちのけんかのげんいんはなんだったの。', en: 'What was the cause for this fight in the first place?', sourceId: '1086456', source: 'tatoeba' },
    { jp: 'そもそも何故私の物だけ液晶に線が入っていたのか。', reading: 'そもそもなぜわたしのものだけえきしょうにせんがはいっていたのか。', en: 'In any case why was it only mine that had a line in the LCD?', sourceId: '205986', source: 'tatoeba' },
  ],
  // N2 ...ようなら
  'n2m-g-6fec3d': [
    { jp: '咳が出るようなら、マスクを着用してください。', reading: 'せきがでるようなら、マスクをちゃくようしてください。', en: 'Use a face mask if you have cough.', sourceId: '8671044', source: 'tatoeba' },
    { jp: '来週お時間があるようなら、お知らせください。', reading: 'らいしゅうおじかんがあるようなら、おしらせください。', en: 'Let us know if you\'re available next week.', sourceId: '11782614', source: 'tatoeba' },
    { jp: '時間通りに来れないようなら、連絡ください。', reading: 'じかんどおりにこれないようなら、れんらくください。', en: 'Let me know if you won\'t be here on time.', sourceId: '11052284', source: 'tatoeba' },
  ],
  // N2 わずかに
  'n2m-g-73fe3e': [
    { jp: '彼はわずかに１００冊の本しか持っていない。', reading: 'かれはわずかにひゃくさつのほんしかもっていない。', en: 'He has no more than one hundred books.', sourceId: '110251', source: 'tatoeba' },
    { jp: '霧を通して、わずかに陸地をみわけることができた。', reading: 'きりをとおして、わずかにりくちをみわけることができた。', en: 'The land could just be discerned through the mist.', sourceId: '80850', source: 'tatoeba' },
    { jp: '彼はわずかにうなずいて賛成の意を表した。', reading: 'かれはわずかにうなずいてさんせいのいをあらわした。', en: 'He showed his agreement by a sight inclination of his head.', sourceId: '110250', source: 'tatoeba' },
  ],
  // N2 における
  'n2m-g-78644d': [
    { jp: '人生における成功には絶え間ない努力が必要だ。', reading: 'じんせいにおけるせいこうにはたえまないどりょくがひつようだ。', en: 'Success in life calls for constant efforts.', sourceId: '144027', source: 'tatoeba' },
    { jp: '君は人生におけるゴールを見失ってはいけない。', reading: 'きみはじんせいにおけるゴールをみうしなってはいけない。', en: 'You must not lose sight of your goal in life.', sourceId: '177120', source: 'tatoeba' },
    { jp: 'カメラ製造における日本の競争力は揺るぎない。', reading: 'カメラせいぞうにおけるにっぽんのきょうそうりょくはゆるぎない。', en: 'Japan\'s competitiveness in camera making is unchallenged.', sourceId: '226208', source: 'tatoeba' },
  ],
  // N2 たちまち
  'n2m-g-79e1b7': [
    { jp: '彼が来るというニュースはたちまち広まった。', reading: 'かれがくるというニュースはたちまちひろまった。', en: 'The news that he would come, quickly got abroad.', sourceId: '119356', source: 'tatoeba' },
    { jp: '警察官の姿を見て、彼はたちまち逃げ去った。', reading: 'けいさつかんのすがたをみて、かれはたちまちにげさった。', en: 'As soon as he saw the policeman, he ran away.', sourceId: '2261630', source: 'tatoeba' },
    { jp: '列車が脱線すると、たちまちパニック状態になった。', reading: 'れっしゃがだっせんすると、たちまちパニックじょうたいになった。', en: 'The train was derailed, and panic ensued.', sourceId: '77570', source: 'tatoeba' },
  ],
  // N2 …といってもいいだろう
  'n2m-g-7ac0a5': [
    { jp: 'ジムは多才な人といってもいいだろう。', reading: 'ジムはたさいなひとといってもいいだろう。', en: 'Jim can be said to be a man of many talents.', sourceId: '215953', source: 'tatoeba' },
  ],
  // N2 幸いなことに
  'n2m-g-7ae5e1': [
    { jp: '幸いなことに、息子は新しい学校での生活にすぐに慣れた。', reading: 'さいわいなことに、むすこはあたらしいがっこうでのせいかつにすぐになれた。', en: 'Fortunately, my son quickly adjusted to life in his new school.', sourceId: '173711', source: 'tatoeba' },
    { jp: '幸いなことに間に合った。', reading: 'さいわいなことにまにあった。', en: 'Fortunately, I was on time.', sourceId: '173710', source: 'tatoeba' },
  ],
  // N2 かなわない
  'n2m-g-7b8e5e': [
    { jp: '音楽の分野では誰もこの若い女性にかなわない。', reading: 'おんがくのぶんやではだれもこのわかいじょせいにかなわない。', en: 'Nobody is equal to this young woman in the field of music.', sourceId: '188280', source: 'tatoeba' },
    { jp: '僕は数学では彼にかなわないことがよくわかった。', reading: 'ぼくはすうがくではかれにかなわないことがよくわかった。', en: 'I realized that I couldn\'t beat him in math.', sourceId: '81834', source: 'tatoeba' },
    { jp: 'ピアノを弾くことにかけては、彼にはかなわない。', reading: 'ピアノをひくことにかけては、かれにはかなわない。', en: 'I\'m no match for him when it comes to playing the piano.', sourceId: '197712', source: 'tatoeba' },
  ],
  // N2 ふしがある
  'n2m-g-7b947b': [
    { jp: '彼には加古川の人を軽蔑しているふしがある。', reading: 'かれにはかこがわのひとをけいべつしているふしがある。', en: 'He seems to hold people from Kakogawa in contempt.', sourceId: '118907', source: 'tatoeba' },
  ],
  // N2 直ちに
  'n2m-g-7c0079': [
    { jp: '暴動を鎮圧するために直ちに軍隊が派遣された。', reading: 'ぼうどうをちんあつするためにただちにぐんたいがはけんされた。', en: 'Troops were swiftly called in to put down the riot.', sourceId: '82507', source: 'tatoeba' },
    { jp: '彼は私が彼女に直ちに手紙を書くように提案した。', reading: 'かれはわたしがかのじょにただちにてがみをかくようにていあんした。', en: 'He suggested that I write to her at once.', sourceId: '106379', source: 'tatoeba' },
    { jp: '直ちに出発しなければ、私は約束に遅れるだろう。', reading: 'ただちにしゅっぱつしなければ、わたしはやくそくにおくれるだろう。', en: 'Unless I leave right away, I\'ll be late for my appointment.', sourceId: '125759', source: 'tatoeba' },
  ],
  // N2 …だろうに
  'n2m-g-7c2e9d': [
    { jp: '彼女の微笑を見れば、君は魅了されるだろうに。', reading: 'かのじょのびしょうをみれば、きみはみりょうされるだろうに。', en: 'To see her smile, you would be charmed.', sourceId: '94050', source: 'tatoeba' },
    { jp: '彼はもう１度やっていたら、成功しただろうに。', reading: 'かれはもういちどやっていたら、せいこうしただろうに。', en: 'Had he tried it once more, he would have succeeded in it.', sourceId: '110641', source: 'tatoeba' },
    { jp: 'もう少し我慢していたらうまくいっただろうに。', reading: 'もうすこしがまんしていたらうまくいっただろうに。', en: 'With a little more patience, you would have succeeded.', sourceId: '194106', source: 'tatoeba' },
  ],
  // N2 (か)とおもうと / (か)とおもったら
  'n2m-g-7c9b05': [
    { jp: 'ちょうど出かけたいとおもったら雨が降った。', reading: 'ちょうどでかけたいとおもったらあめがふった。', en: 'It would rain just when I wanted to go out.', sourceId: '202905', source: 'tatoeba' },
  ],
  // N2 から見ると/から見れば/から見て/から見ても
  'n2m-g-7ce26a': [
    { jp: '彼が彼女を好きなのは行動から見て一目瞭然だ。', reading: 'かれがかのじょをすきなのはこうどうからみていちもくりょうぜんだ。', en: 'It\'s clear from his actions that he loves her.', sourceId: '119543', source: 'tatoeba' },
    { jp: '誰の話から見ても彼は信頼出来る男ではない。', reading: 'だれのはなしからみてもかれはしんらいできるおとこではない。', en: 'By all accounts, he is not a man to be trusted.', sourceId: '136725', source: 'tatoeba' },
    { jp: '彼はどこから見ても申し分のない王でした。', reading: 'かれはどこからみてももうしぶんのないおうでした。', en: 'He was every inch a king.', sourceId: '111670', source: 'tatoeba' },
  ],
  // N2 たところ
  'n2m-g-7df4cd': [
    { jp: '友達を見送りに空港まで行ってきたところです。', reading: 'ともだちをみおくりにくうこうまでいってきたところです。', en: 'I have been to the airport to see my friend off.', sourceId: '79288', source: 'tatoeba' },
    { jp: '父が生まれた家はすぐ角を曲ったところにある。', reading: 'ちちがうまれたいえはすぐかくをまがったところにある。', en: 'The house where my father was born is just around the corner.', sourceId: '84851', source: 'tatoeba' },
    { jp: '彼女を見送りに空港まで行ってきたところです。', reading: 'かのじょをみおくりにくうこうまでいってきたところです。', en: 'I\'ve just been to the airport to see her off.', sourceId: '86113', source: 'tatoeba' },
  ],
  // N2 いずれにせよ
  'n2m-g-7e1870': [
    { jp: 'いずれにせよ雨がやんだら出かけることができる。', reading: 'いずれにせよあめがやんだらでかけることができる。', en: 'At any rate, I can go out when it stops raining.', sourceId: '1158294', source: 'tatoeba' },
    { jp: 'いずれにせよ彼が来たら、あなたにお知らせします。', reading: 'いずれにせよかれがきたら、あなたにおしらせします。', en: 'Anyway, I\'ll tell you when he comes.', sourceId: '229102', source: 'tatoeba' },
    { jp: 'いずれにせよパーティーはとりやめにしなければならない。', reading: 'いずれにせよパーティーはとりやめにしなければならない。', en: 'At any rate, the party will have to be cancelled.', sourceId: '229104', source: 'tatoeba' },
  ],
  // N2 果たして
  'n2m-g-7f5694': [
    { jp: '国会は本来の機能を十分には果たしてはいない。', reading: 'こっかいはほんらいのきのうをじゅうぶんにははたしてはいない。', en: 'The Diet is not fully functioning as such.', sourceId: '173074', source: 'tatoeba' },
    { jp: '教育において試験が大きな役割を果たしている。', reading: 'きょういくにおいてしけんがおおきなやくわりをはたしている。', en: 'Examinations play a large part in education.', sourceId: '180356', source: 'tatoeba' },
    { jp: 'テレビは日常生活で重要な役割を果たしている。', reading: 'テレビはにちじょうせいかつでじゅうようなやくわりをはたしている。', en: 'TV plays an important part in everyday life.', sourceId: '201978', source: 'tatoeba' },
  ],
  // N2 上に
  'n2m-g-806f32': [
    { jp: '或る夕暮私はこの丘の上に立ったことがある。', reading: 'あるるゆうぐれわたしはこのおかのじょうにたったことがある。', en: 'There was a time, one evening, when I stood on top of that hill.', sourceId: '74955', source: 'tatoeba' },
    { jp: '彼女はピアノの上に本が何冊かあるのを見た。', reading: 'かのじょはピアノのうえにほんがなんさつかあるのをみた。', en: 'She saw some books lying on the piano.', sourceId: '91679', source: 'tatoeba' },
    { jp: '彼女はとても頭がいい上に一生懸命勉強する。', reading: 'かのじょはとてもあたまがいいじょうにいっしょうけんめいべんきょうする。', en: 'She is very smart, and what is more, she studies hard.', sourceId: '91918', source: 'tatoeba' },
  ],
  // N2 (のこと）となれば
  'n2m-g-8125cc': [
    { jp: 'いざとなれば勇気が湧いてくる。', reading: 'いざとなればゆうきがわいてくる。', en: 'Your courage will come out in a crisis.', sourceId: '229136', source: 'tatoeba' },
    { jp: 'その計画が実行できないとなれば、どうしなければなりませんか。', reading: 'そのけいかくがじっこうできないとなれば、どうしなければなりませんか。', en: 'What must be done if the plan proves unworkable?', sourceId: '211292', source: 'tatoeba' },
  ],
  // N2 に過ぎない
  'n2m-g-81d5a6': [
    { jp: '表面に現れているのは氷山の先端に過ぎない。', reading: 'ひょうめんにあらわれているのはひょうざんのせんたんにすぎない。', en: 'Only the tip of an iceberg shows above the water.', sourceId: '85359', source: 'tatoeba' },
    { jp: '私の考えでは、恒久的な平和など幻想に過ぎない。', reading: 'わたしのかんがえでは、こうきゅうてきなへいわなどげんそうにすぎない。', en: 'In my opinion, permanent peace is nothing but illusion.', sourceId: '163645', source: 'tatoeba' },
    { jp: 'この問題は副次的な重要性を持つに過ぎない。', reading: 'このもんだいはふくじてきなじゅうようせいをもつにすぎない。', en: 'This problem is only of secondary importance.', sourceId: '969244', source: 'tatoeba' },
  ],
  // N2 以外
  'n2m-g-83a192': [
    { jp: '彼女は両親以外なら、誰の批判でも受け入れる。', reading: 'かのじょはりょうしんいがいなら、だれのひはんでもうけいれる。', en: 'She accepts criticism from anyone but her parents.', sourceId: '86277', source: 'tatoeba' },
    { jp: '彼以外にいったい誰がそんなことを書くだろう。', reading: 'かれいがいにいったいだれがそんなことをかくだろう。', en: 'Who should write it but himself?', sourceId: '95762', source: 'tatoeba' },
    { jp: '彼は英語以外にも２つの言語を自由にあやつる。', reading: 'かれはえいごいがいにもふたつのげんごをじゆうにあやつる。', en: 'He has two languages at his command besides English.', sourceId: '109632', source: 'tatoeba' },
  ],
  // N2 とっくに
  'n2m-g-849818': [
    { jp: '無駄使いは、とっくにやめていてよいころだ。', reading: 'むだづかいは、とっくにやめていてよいころだ。', en: 'It\'s high time you stopped wasting your money.', sourceId: '80904', source: 'tatoeba' },
    { jp: '君はとっくにここにいなきゃいけないはずだ。', reading: 'きみはとっくにここにいなきゃいけないはずだ。', en: 'It\'s about time you got here!', sourceId: '177626', source: 'tatoeba' },
    { jp: '学校へ走って行ったがベルはとっくに鳴っていた。', reading: 'がっこうへはしっていったがベルはとっくになっていた。', en: 'I ran to school, but the bell had already rung.', sourceId: '184366', source: 'tatoeba' },
  ],
  // N2 ～やむをえず
  'n2m-g-86cdb3': [
    { jp: '私は昨日やむをえず外出せざるをえなかった。', reading: 'わたしはきのうやむをえずがいしゅつせざるをえなかった。', en: 'I was obliged to go out yesterday.', sourceId: '156784', source: 'tatoeba' },
    { jp: '我々はやむをえず出発を延期した。', reading: 'われわれはやむをえずしゅっぱつをえんきした。', en: 'We were compelled to put off our departure.', sourceId: '185984', source: 'tatoeba' },
  ],
  // N2 といっては
  'n2m-g-87424d': [
    { jp: '私の提案に「しかし」といってはいけない。', reading: 'わたしのていあんに「しかし」といってはいけない。', en: 'Don\'t say \'but\' to my suggestion.', sourceId: '162980', source: 'tatoeba' },
  ],
  // N2 それにしても
  'n2m-g-882675': [
    { jp: 'それにしても男に綺麗って形容はやめろよな～。', reading: 'それにしてもおとこにきれいってけいようはやめろよな[～。|]', en: 'In any case please stop using "pretty" when describing a man.', sourceId: '76609', source: 'tatoeba' },
    { jp: 'それにしてもお母様はこんな大人数をよんでくれちゃって。', reading: 'それにしてもおかあさまはこんなおとなすうをよんでくれちゃって。', en: 'At any rate, I never expected mother to invite so many people for me.', sourceId: '237544', source: 'tatoeba' },
    { jp: 'それにしても、おきれいですね。', reading: 'それにしても、おきれいですね。', en: 'By the way, you look really beautiful.', sourceId: '10952322', source: 'tatoeba' },
  ],
  // N2 ついては
  'n2m-g-89e957': [
    { jp: '彼女は私にうそをついてはいけないと言った。', reading: 'かのじょはわたしにうそをついてはいけないといった。', en: 'She told me not to tell lies.', sourceId: '89577', source: 'tatoeba' },
    { jp: '彼は私に嘘をついてはいけないと言った。', reading: 'かれはわたしにうそをついてはいけないといった。', en: 'He told me not to tell lies.', sourceId: '106120', source: 'tatoeba' },
  ],
  // N2 せっかく
  'n2m-g-8aefac': [
    { jp: 'せっかく弁護士の資格があるのにもったいない。', reading: 'せっかくべんごしのしかくがあるのにもったいない。', en: 'What a waste of your lawyer qualifications!', sourceId: '74439', source: 'tatoeba' },
    { jp: '私がせっかくやっていることにけちをつけた。', reading: 'わたしがせっかくやっていることにけちをつけた。', en: 'He threw cold water on what I was doing.', sourceId: '168011', source: 'tatoeba' },
    { jp: 'せっかく採用した派遣社員がすぐに辞めてしまった。', reading: 'せっかくさいようしたはけんしゃいんがすぐにやめてしまった。', en: 'The temporary workers that we managed to employ left work right away.', sourceId: '74338', source: 'tatoeba' },
  ],
  // N2 に～れない
  'n2m-g-8b9d69': [
    { jp: '僕たちはコンサートに遅れないように急いだ。', reading: 'ぼくたちはコンサートにおくれないようにいそいだ。', en: 'We hurried so as not to be late for the concert.', sourceId: '82342', source: 'tatoeba' },
    { jp: '約束の時間に遅れないようにバスに乗った。', reading: 'やくそくのじかんにおくれないようにバスにのった。', en: 'I took a bus so as not to be late for my appointment.', sourceId: '79545', source: 'tatoeba' },
    { jp: '列車に乗り遅れないように彼は朝早く家を出た。', reading: 'れっしゃにのりおくれないようにかれはあさはやくいえをでた。', en: 'He left home early in the morning so as not to miss his train.', sourceId: '77553', source: 'tatoeba' },
  ],
  // N2 当然だ/当たり前だ
  'n2m-g-90abb5': [
    { jp: '彼女が私に同意するのは当然だと私はみなした。', reading: 'かのじょがわたしにどういするのはとうぜんだとわたしはみなした。', en: 'I took it for granted that she would agree with me.', sourceId: '95386', source: 'tatoeba' },
    { jp: '彼女は勉強したから良い成績をとって当然だ。', reading: 'かのじょはべんきょうしたからよいせいせきをとってとうぜんだ。', en: 'Her work in school warranted her good grades.', sourceId: '86799', source: 'tatoeba' },
    { jp: '彼女が泣き出すのも当然だと彼は私に言った。', reading: 'かのじょがなきだすのもとうぜんだとかれはわたしにいった。', en: 'He told me that she might well burst into tears.', sourceId: '95467', source: 'tatoeba' },
  ],
  // N2 ずに済む
  'n2m-g-912f4b': [
    { jp: 'トムは家事を手伝わずに済むことを望んでいる。', reading: 'トムはかじをてつだわずにすむことをのぞんでいる。', en: 'Tom wishes he didn\'t have to help with the housework.', sourceId: '1066287', source: 'tatoeba' },
    { jp: 'せずに済むなら誰もこんなことはしない。', reading: 'せずにすむならだれもこんなことはしない。', en: 'If it didn\'t need to be done, nobody would do this kind of thing.', sourceId: '1106178', source: 'tatoeba' },
  ],
  // N2 以来
  'n2m-g-91fc1c': [
    { jp: '前月仲たがいして以来カレンには会っていない。', reading: 'ぜんげつなかたがいしていらいカレンにはあっていない。', en: 'I haven\'t seen Karen since we fell out last month.', sourceId: '140947', source: 'tatoeba' },
    { jp: '世界の人口は産業革命以来、３倍以上になった。', reading: 'せかいのじんこうはさんぎょうかくめいいらい、[３|]ばいいじょうになった。', en: 'Since the Industrial Revolution, the world population has more than tripled.', sourceId: '143428', source: 'tatoeba' },
    { jp: '事件以来あの政治家は人前に出てこなくなった。', reading: 'じけんいらいあのせいじかはひとまえにでてこなくなった。', en: 'The politician didn\'t appear in public after the incident.', sourceId: '150892', source: 'tatoeba' },
  ],
  // N2 まさに…ようとしている（ところだ）
  'n2m-g-92bfb1': [
    { jp: '彼はカナダに向かってまさに出発しようとしている。', reading: 'かれはカナダにむかってまさにしゅっぱつしようとしている。', en: 'He is on the point of leaving for Canada.', sourceId: '114120', source: 'tatoeba' },
    { jp: '飛行機はパリに向かってまさに離陸しようとしている。', reading: 'ひこうきはパリにむかってまさにりりくしようとしている。', en: 'The plane is about to take off for Paris.', sourceId: '85663', source: 'tatoeba' },
    { jp: 'その船はまさに出帆しようとしている。', reading: 'そのふねはまさにしゅっぱんしようとしている。', en: 'The ship is about to set sail.', sourceId: '208443', source: 'tatoeba' },
  ],
  // N2 ものだから
  'n2m-g-94aee1': [
    { jp: 'あわてものだから彼はたぶん早合点するだろう。', reading: 'あわてものだからかれはたぶんはやがてんするだろう。', en: 'Being a hasty person, he is likely to jump to conclusions.', sourceId: '229619', source: 'tatoeba' },
    { jp: '契約は成立したようなものだから外へ出かけてお祝いしよう。', reading: 'けいやくはせいりつしたようなものだからそとへでかけておいわいしよう。', en: 'The contract is in the bag, so let\'s go out and celebrate.', sourceId: '176553', source: 'tatoeba' },
    { jp: '人の心は分からないものだから、いい関係を維持するのは難しい。', reading: 'ひとのこころはわからないものだから、いいかんけいをいじするのはむずかしい。', en: 'I struggle to understand how people feel, so keeping good relations is difficult.', sourceId: '8868911', source: 'tatoeba' },
  ],
  // N2 ...のだった
  'n2m-g-9797ce': [
    { jp: '結局、法案は提出断念に追い込まれたのだった。', reading: 'けっきょく、ほうあんはていしゅつだんねんにおいこまれたのだった。', en: 'In the end the bill was forced into being withdrawn.', sourceId: '74182', source: 'tatoeba' },
    { jp: '彼は昨日になって初めて彼女に気づいたのだった。', reading: 'かれはきのうになってはじめてかのじょにきづいたのだった。', en: 'It was not until yesterday that he noticed her.', sourceId: '106805', source: 'tatoeba' },
    { jp: '両親を飛行機事故でなくしたのだった。', reading: 'りょうしんをひこうきじこでなくしたのだった。', en: 'He had his parents die in the plane accident.', sourceId: '77986', source: 'tatoeba' },
  ],
  // N2 甲斐がない/甲斐(も)なく
  'n2m-g-97ce29': [
    { jp: '私たちの努力の甲斐なく、結局失敗に終わった。', reading: 'わたしたちのどりょくのかいなく、けっきょくしっぱいにおわった。', en: 'Despite our efforts, we failed after all.', sourceId: '10727469', source: 'tatoeba' },
    { jp: '進んで学ぼうとする気の無い者には教える甲斐がない。', reading: 'すすんでまなぼうとするきのないものにはおしえるかいがない。', en: 'One who is not willing to learn is not worth teaching.', sourceId: '144719', source: 'tatoeba' },
  ],
  // N2 のももっともだ
  'n2m-g-986437': [
    { jp: '彼は幸運児であったと言われるのももっともだ。', reading: 'かれはこううんじであったといわれるのももっともだ。', en: 'He may well be said to have been a fortunate man.', sourceId: '107379', source: 'tatoeba' },
    { jp: '彼女が息子のことを自慢するのももっともだ。', reading: 'かのじょがむすこのことをじまんするのももっともだ。', en: 'She may well be proud of her son.', sourceId: '95306', source: 'tatoeba' },
    { jp: '彼女が自分の才能を自慢するのももっともだ。', reading: 'かのじょがじぶんのさいのうをじまんするのももっともだ。', en: 'She may well take pride in her talent.', sourceId: '95357', source: 'tatoeba' },
  ],
  // N2 一方では...他方では
  'n2m-g-98aca7': [
    { jp: '一方では彼は親切だが、他方では怠け者だ。', reading: 'いっぽうではかれはしんせつだが、たほうではなまけものだ。', en: 'On one hand he is kind, but on the other hand he is lazy.', sourceId: '190056', source: 'tatoeba' },
  ],
  // N2 ほとんど…た
  'n2m-g-994286': [
    { jp: '彼の名前を知っている生徒はほとんどいなかった。', reading: 'かれのなまえをしっているせいとはほとんどいなかった。', en: 'Few students knew his name.', sourceId: '116008', source: 'tatoeba' },
    { jp: '彼の忠告は、ほとんど役に立たなかった。', reading: 'かれのちゅうこくは、ほとんどやくにたたなかった。', en: 'His advice counted for little.', sourceId: '116521', source: 'tatoeba' },
    { jp: '彼の解説がわかった人はほとんどいなかった。', reading: 'かれのかいせつがわかったひとはほとんどいなかった。', en: 'Few people understood his comment.', sourceId: '117903', source: 'tatoeba' },
  ],
  // N2 向く
  'n2m-g-9a4f94': [
    { jp: '北を向くと、東は右側になる。', reading: 'きたをむくと、ひがしはみぎがわになる。', en: 'If you face north, the east is on your right.', sourceId: '82457', source: 'tatoeba' },
    { jp: '足の向くままに歩いた。', reading: 'あしのむくままにあるいた。', en: 'We let our legs do the leading.', sourceId: '139865', source: 'tatoeba' },
  ],
  // N2 のことだから
  'n2m-g-9af5c7': [
    { jp: 'あなたのことだから上々でしょう。', reading: 'あなたのことだからじょうじょうでしょう。', en: 'I hope and I know you did great!', sourceId: '233557', source: 'tatoeba' },
    { jp: 'トムのことだから感謝祭にはボストンに来るんじゃないかな。', reading: 'トムのことだからかんしゃさいにはボストンにくるんじゃないかな。', en: 'I think Tom may come to Boston for Thanksgiving.', sourceId: '9679009', source: 'tatoeba' },
    { jp: '例年通りだった。特に落胆はなかった。共働きの家では当たり前のことだから。', reading: 'れいねんどおりだった。とくにらくたんはなかった。ともばたらきのいえではあたりまえのことだから。', en: 'It was an ordinary year, no especial disappointments. Just the run of the mill goings-on of a dual-income household.', sourceId: '11056140', source: 'tatoeba' },
  ],
  // N2 の上で(は)/～上
  'n2m-g-9b08ec': [
    { jp: '昨年の夏、私たちは橋の上で花火を楽しく見た。', reading: 'さくねんのなつ、わたしたちははしのじょうではなびをたのしくみた。', en: 'We enjoyed watching the fireworks on a bridge last summer.', sourceId: '169797', source: 'tatoeba' },
    { jp: 'ジョンはステージの上で「イマジン」を歌った。', reading: 'ジョンはステージのうえで「イマジン」をうたった。', en: 'John sang "Imagine" on the stage.', sourceId: '215402', source: 'tatoeba' },
    { jp: '薬缶がストーブの上でチンチン鳴っています。', reading: 'やかんがストーブのじょうでチンチンなっています。', en: 'The kettle is whistling on the stove.', sourceId: '79473', source: 'tatoeba' },
  ],
  // N2 たいがい
  'n2m-g-9b5b4c': [
    { jp: 'ディナーはたいがいコーヒーで終わる。', reading: 'ディナーはたいがいコーヒーでおわる。', en: 'Coffee finishes most dinners.', sourceId: '202470', source: 'tatoeba' },
    { jp: 'たいがいの場合、彼の解答は正確だ。', reading: 'たいがいのばあい、かれのかいとうはせいかくだ。', en: 'In most cases, his answers are right.', sourceId: '203989', source: 'tatoeba' },
    { jp: '彼は夜にはたいがい家にいる。', reading: 'かれはよるにはたいがいかにいる。', en: 'He is generally at home in the evening.', sourceId: '99473', source: 'tatoeba' },
  ],
  // N2 ねばならない/ねばならぬ/ねば
  'n2m-g-9cb9c3': [
    { jp: '彼は自分の品物の値段を下げねばならなかった。', reading: 'かれはじぶんのしなもののねだんをさげねばならなかった。', en: 'He had to reduce the price of his wares.', sourceId: '104866', source: 'tatoeba' },
    { jp: '彼らは戦争中非常な苦難に耐えねばならなかった。', reading: 'かれらはせんそうちゅうひじょうなくなんにたえねばならなかった。', en: 'They had to endure great hardship during the war.', sourceId: '96678', source: 'tatoeba' },
    { jp: '彼は何日も何も食べずに過ごさねばならなかった。', reading: 'かれはなんにちもなにもたべずにすごさねばならなかった。', en: 'He had to go without food for days.', sourceId: '109321', source: 'tatoeba' },
  ],
  // N2 ついには
  'n2m-g-9ddae1': [
    { jp: '音は次第に小さくなり、ついには聞こえなくなった。', reading: 'おとはしだいにちいさくなり、ついにはきこえなくなった。', en: 'The noise grew fainter, until it wasn\'t heard anymore.', sourceId: '188315', source: 'tatoeba' },
    { jp: '男の子はどんどん背が伸び、ついには父親の身長を超えるまでになった。', reading: 'おとこのこはどんどんせがのび、ついにはちちおやのしんちょうをこえるまでになった。', en: 'The boy grew taller and taller, till at last he exceeded his father in height.', sourceId: '11584694', source: 'tatoeba' },
  ],
  // N2 お～願います
  'n2m-g-a09c68': [
    { jp: 'ゆっくりとお話願います。', reading: 'ゆっくりとおはなしねがいます。', en: 'Please speak slowly.', sourceId: '829613', source: 'tatoeba' },
    { jp: 'バスの後方へお詰め願います。', reading: 'バスのこうほうへおつめねがいます。', en: 'Please move to the rear of the bus.', sourceId: '10854066', source: 'tatoeba' },
    { jp: '席について、お静かに願います。', reading: 'せきについて、おしずかにねがいます。', en: 'Sit down and be quiet.', sourceId: '11537454', source: 'tatoeba' },
  ],
  // N2 …ということは…（ということ）だ
  'n2m-g-a18e4f': [
    { jp: '私は彼をきらっているということは事実だ。', reading: 'わたしはかれをきらっているということはじじつだ。', en: 'It is a fact that I dislike him.', sourceId: '153658', source: 'tatoeba' },
    { jp: '彼が嘘をついたということは明白だ。', reading: 'かれがうそをついたということはめいはくだ。', en: 'It\'s obvious that he lied.', sourceId: '120632', source: 'tatoeba' },
    { jp: '君が嘘をついたということは明白だ。', reading: 'きみがうそをついたということはめいはくだ。', en: 'It\'s evident that you told a lie.', sourceId: '179072', source: 'tatoeba' },
  ],
  // N2 んだった
  'n2m-g-a1efcc': [
    { jp: '数学の宿題は、思ってたよりもかんたんだった。', reading: 'すうがくのしゅくだいは、おもってたよりもかんたんだった。', en: 'The math homework proved to be easier than I had expected.', sourceId: '143564', source: 'tatoeba' },
    { jp: 'フキの下ごしらえって、どうやるんだったっけ？', reading: 'フキのしたごしらえって、どうやるんだったっけ？', en: 'How do you prepare butterbur, again?', sourceId: '10075444', source: 'tatoeba' },
    { jp: 'もっと早くホテルの予約をしておくんだった。', reading: 'もっとはやくホテルのよやくをしておくんだった。', en: 'I ought to have made a hotel reservation earlier.', sourceId: '193250', source: 'tatoeba' },
  ],
  // N2 ようでは
  'n2m-g-a2d554': [
    { jp: 'アメリカ合衆国の経済力は昔日のようではない。', reading: 'アメリカがっしゅうこくのけいざいりょくはせきじつのようではない。', en: 'The economic strength of the USA is not what it was.', sourceId: '230137', source: 'tatoeba' },
    { jp: '問題をなおざりにしているようではいけない。', reading: 'もんだいをなおざりにしているようではいけない。', en: 'You mustn\'t make light of the problem.', sourceId: '6849952', source: 'tatoeba' },
    { jp: '彼はあまり疲れているようではありません。', reading: 'かれはあまりつかれているようではありません。', en: 'He does not seem to be very tired.', sourceId: '114845', source: 'tatoeba' },
  ],
  // N2 にしてみれば / にしてみたら
  'n2m-g-a2dfa3': [
    { jp: 'たぶん彼にしてみれば同じことよ。', reading: 'たぶんかれにしてみればおなじことよ。', en: 'Maybe it will be exactly the same for him.', sourceId: '4795', source: 'tatoeba' },
    { jp: 'いっそのこと丸坊主にしてみたらどう？よく似合うと思うよ。', reading: 'いっそのことまるぼうずにしてみたらどう？よくにあうとおもうよ。', en: 'How about shaving your head instead? I think it would look good on you.', sourceId: '1031912', source: 'tatoeba' },
    { jp: 'いつもポニーテールばっかじゃん。たまにはツインテールにしてみたら？', reading: 'いつもポニーテールばっかじゃん。たまにはツインテールにしてみたら？', en: 'You always wear a ponytail. Why not try pigtails once in a while?', sourceId: '10134832', source: 'tatoeba' },
  ],
  // N2 たりなんかして
  'n2m-g-a46eae': [
    { jp: '授業中に寝たりなんかしてないよ。ちょっと気を失ってただけさ。', reading: 'じゅぎょうちゅうにねたりなんかしてないよ。ちょっときをうしなってただけさ。', en: 'I wasn\'t sleeping in class. I just zoned out for a bit.', sourceId: '8933662', source: 'tatoeba' },
  ],
  // N2 よりしかたがない
  'n2m-g-a5086e': [
    { jp: '私たちは成り行きを見守るよりしかたがないと思う。', reading: 'わたしたちはなりゆきをみまもるよりしかたがないとおもう。', en: 'There\'s nothing for it but to wait and see.', sourceId: '165568', source: 'tatoeba' },
  ],
  // N2 をもとに
  'n2m-g-a62613': [
    { jp: '彼は親譲りの財産をもとにして富を作った。', reading: 'かれはおやゆずりのざいさんをもとにしてとみをつくった。', en: 'He built on his father\'s fortune.', sourceId: '103682', source: 'tatoeba' },
    { jp: 'この映画は小説をもとにしている。', reading: 'このえいがはしょうせつをもとにしている。', en: 'This film is an adaptation of a novel.', sourceId: '222913', source: 'tatoeba' },
    { jp: '小説をもとに製作された映画です。', reading: 'しょうせつをもとにせいさくされたえいがです。', en: 'This film is based on a novel.', sourceId: '11294867', source: 'tatoeba' },
  ],
  // N2 かのようだ/かのように/かのような
  'n2m-g-a708ec': [
    { jp: '彼女はあたかも幽霊でも見たかのように見えた。', reading: 'かのじょはあたかもゆうれいでもみたかのようにみえた。', en: 'She looked as if she had seen a ghost.', sourceId: '93461', source: 'tatoeba' },
    { jp: '彼は水でも飲むかのようにウイスキーを飲んだ。', reading: 'かれはみずでものむかのようにウイスキーをのんだ。', en: 'He drank the whisky as if it were water.', sourceId: '103502', source: 'tatoeba' },
    { jp: '彼は何でも知っているかのような話し方をする。', reading: 'かれはなんでもしっているかのようなはなしかたをする。', en: 'He talks as if he knew everything.', sourceId: '109430', source: 'tatoeba' },
  ],
  // N2 かと思ったら/かと思うと
  'n2m-g-a9f59a': [
    { jp: 'あと3年でアラサーかと思うととても辛いな。', reading: 'あとさんねんでアラサーかとおもうととてもつらいな。', en: 'It hurts to realise I\'ll be 30 in just 3 years.', sourceId: '11021657', source: 'tatoeba' },
    { jp: '気のせいかと思ったらほんとに量減ってるんだな。', reading: 'きのせいかとおもったらほんとにりょうへってるんだな。', en: 'Just when you start thinking it\'s all in your head, it really does get smaller.', sourceId: '10987762', source: 'tatoeba' },
    { jp: '稲妻が光ったかと思うと雷がなった。', reading: 'いなづまがひかったかとおもうとかみなりがなった。', en: 'After the lightning, came the thunder.', sourceId: '190011', source: 'tatoeba' },
  ],
  // N2 めったな
  'n2m-g-aa87fe': [
    { jp: '彼はめったなことでは音を上げない。', reading: 'かれはめったなことではおとをあげない。', en: 'He rarely gives in, confronted with difficulties.', sourceId: '110656', source: 'tatoeba' },
  ],
  // N2 ことから
  'n2m-g-ae555c': [
    { jp: '彼女の言うことから判断すると彼は有罪である。', reading: 'かのじょのいうことからはんだんするとかれはゆうざいである。', en: 'It follows from what she says that he is guilty.', sourceId: '94479', source: 'tatoeba' },
    { jp: '彼はまず朝食をたっぷりとることから始めた。', reading: 'かれはまずちょうしょくをたっぷりとることからはじめた。', en: 'He started off with a good breakfast.', sourceId: '110864', source: 'tatoeba' },
    { jp: '彼はまずたっぷりと朝食を食べることから始めた。', reading: 'かれはまずたっぷりとちょうしょくをたべることからはじめた。', en: 'He started his day with a good breakfast.', sourceId: '110872', source: 'tatoeba' },
  ],
  // N2 だなんて
  'n2m-g-afbb98': [
    { jp: '彼女が僕のこと好きだなんて思いもしなかった。', reading: 'かのじょがぼくのことすきだなんておもいもしなかった。', en: 'It never occurred to me that she loved me.', sourceId: '95204', source: 'tatoeba' },
    { jp: '彼女が私の母より年上だなんて信じられません。', reading: 'かのじょがわたしのははよりとしうえだなんてしんじられません。', en: 'I can\'t believe that she is older than my mother.', sourceId: '95378', source: 'tatoeba' },
    { jp: '４２１９だなんて、随分と語呂が悪い番号だな。', reading: 'しにいくだなんて、ずいぶんとごろがわるいばんごうだな。', en: '4,219 is an extremely unlucky number.', sourceId: '1220910', source: 'tatoeba' },
  ],
  // N2 ～をこめて
  'n2m-g-b0bf1e': [
    { jp: '私は渾身の力をこめてその戸を開けようとした。', reading: 'わたしはこんしんのちからをこめてそのとをあけようとした。', en: 'I tried to open the door with all my force.', sourceId: '152231', source: 'tatoeba' },
    { jp: '丹精をこめてつくったこの美しい織物をごらんください。', reading: 'たんせいをこめてつくったこのうつくしいおりものをごらんください。', en: 'Take a look at this beautiful embroidery made with great effort.', sourceId: '75886', source: 'tatoeba' },
    { jp: '彼女は心をこめて歌ったので、聴衆は深い感動をうけた。', reading: 'かのじょはこころをこめてうたったので、ちょうしゅうはふかいかんどうをうけた。', en: 'As she sang with all her heart, the audience was deeply moved.', sourceId: '88589', source: 'tatoeba' },
  ],
  // N2 てはならない
  'n2m-g-b1ac40': [
    { jp: '彼女の年齢ではもっと分別がなくてはならない。', reading: 'かのじょのねんれいではもっとふんべつがなくてはならない。', en: 'She should know better at her age.', sourceId: '94094', source: 'tatoeba' },
    { jp: '誰がやって来ようと、ドアを開けてはならない。', reading: 'だれがやってこようと、ドアをあけてはならない。', en: 'No matter who may call, you must not open the door.', sourceId: '136963', source: 'tatoeba' },
    { jp: '人生をよくも悪くもうけいれなくてはならない。', reading: 'じんせいをよくもわるくもうけいれなくてはならない。', en: 'We must accept life, for good or for evil.', sourceId: '143966', source: 'tatoeba' },
  ],
  // N2 はさておき
  'n2m-g-b37962': [
    { jp: '内容はさておき、なにこの物々しい話し方は？', reading: 'ないようはさておき、なにこのものものしいはなしかたは？', en: 'Leaving what it means to one side, what\'s with the high-falutin\' language?', sourceId: '74852', source: 'tatoeba' },
    { jp: '値段はさておき、そのドレスは君には似合わない。', reading: 'ねだんはさておき、そのドレスはきみにはにあわない。', en: 'Apart from the cost, the dress doesn\'t suit you.', sourceId: '127125', source: 'tatoeba' },
    { jp: '値段はさておき、そのネクタイは色が私に合わない。', reading: 'ねだんはさておき、そのネクタイはいろがわたしにあわない。', en: 'Apart from the cost, the color of the tie doesn\'t suit me.', sourceId: '127124', source: 'tatoeba' },
  ],
  // N2 ものがある
  'n2m-g-b3a3b1': [
    { jp: '彼の学問的な業績には感銘を与えるものがある。', reading: 'かれのがくもんてきなぎょうせきにはかんめいをあたえるものがある。', en: 'His academic achievements are impressive.', sourceId: '117874', source: 'tatoeba' },
    { jp: 'あ、ところでさ、君に見せたいものがあるんだ。', reading: 'あ、ところでさ、きみにみせたいものがあるんだ。', en: 'Oh, by the way, I have something to show you.', sourceId: '2072024', source: 'tatoeba' },
    { jp: 'こっち来て。ちょっと見せたいものがあるんだ。', reading: 'こっちきて。ちょっとみせたいものがあるんだ。', en: 'Come here. I want to show you something.', sourceId: '2794522', source: 'tatoeba' },
  ],
  // N2 なにやら
  'n2m-g-b438a7': [
    { jp: '私はなにやら彼に話さなければならないことがある。', reading: 'わたしはなにやらかれにはなさなければならないことがある。', en: 'I have something or other to tell him.', sourceId: '159205', source: 'tatoeba' },
    { jp: '本のすみになにやら書き込んである。', reading: 'ほんのすみになにやらかきこんである。', en: 'Something is written in the corner of the book.', sourceId: '6849896', source: 'tatoeba' },
    { jp: 'なにやら唸りながら、ほとばしるパッションをキャンバスにぶつけている！', reading: 'なにやらうなりながら、ほとばしるパッションをキャンバスにぶつけている！', en: 'Groaning strangely she is hurling her overflowing passion onto the canvas!', sourceId: '75602', source: 'tatoeba' },
  ],
  // N2 からする
  'n2m-g-b43a02': [
    { jp: '周りの事情からすると彼女の話は本当らしかった。', reading: 'まわりのじじょうからするとかのじょのはなしはほんとうらしかった。', en: 'The circumstances gave color to her story.', sourceId: '148265', source: 'tatoeba' },
    { jp: 'この見地からすると、君の言うことは正しい。', reading: 'このけんちからすると、きみのいうことはただしい。', en: 'From this point of view, you are right.', sourceId: '222082', source: 'tatoeba' },
    { jp: '空模様からすると、雨はしばらくはやまないだろう。', reading: 'そらもようからすると、あめはしばらくはやまないだろう。', en: 'From the look of the sky I\'m afraid the rain won\'t let up for a while.', sourceId: '179296', source: 'tatoeba' },
  ],
  // N2 …振り
  'n2m-g-b6ee84': [
    { jp: '上司は僕の仕事振りがいい加減だと決め付けた。', reading: 'じょうしはぼくのしごとぶりがいいかげんだときめつけた。', en: 'My boss took me to task for the poor quality of my work.', sourceId: '74151', source: 'tatoeba' },
    { jp: '彼女は眠っている振りをしていただけだった。', reading: 'かのじょはねむっているふりをしていただけだった。', en: 'She was only pretending to be asleep.', sourceId: '86591', source: 'tatoeba' },
    { jp: '彼女は私の言うことが聞こえない振りをした。', reading: 'かのじょはわたしのいうことがきこえないふりをした。', en: 'She pretended not to hear me.', sourceId: '89666', source: 'tatoeba' },
  ],
  // N2 いっぽう(で)
  'n2m-g-b703ee': [
    { jp: 'いっぽう彼の意見はちがっていました。', reading: 'いっぽうかれのいけんはちがっていました。', en: 'On the other hand, he had a different opinion.', sourceId: '228799', source: 'tatoeba' },
  ],
  // N2 どうにかなる
  'n2m-g-b86f05': [
    { jp: '心配するな, どうにかなるさ。', reading: 'しんぱいするな, どうにかなるさ。', en: 'Don\'t worry, it will come out all right.', sourceId: '7943165', source: 'tatoeba' },
  ],
  // N2 どうやら
  'n2m-g-b8cb69': [
    { jp: '彼はどうやらやっと仕事の遅れを取りもどした。', reading: 'かれはどうやらやっとしごとのおくれをとりもどした。', en: 'He had enough to do to catch up on his work.', sourceId: '111696', source: 'tatoeba' },
    { jp: 'どうやら電車の中に傘を置き忘れてきたらしい。', reading: 'どうやらでんしゃのなかにかさをおきわすれてきたらしい。', en: 'I seem to have left my umbrella behind in the train.', sourceId: '201128', source: 'tatoeba' },
    { jp: '彼らはどうやらなんとか遅れずに到着できた。', reading: 'かれらはどうやらなんとかおくれずにとうちゃくできた。', en: 'They contrived to arrive in time after all.', sourceId: '97773', source: 'tatoeba' },
  ],
  // N2 逆に
  'n2m-g-b9b267': [
    { jp: '彼は車が大好きだが、逆に弟は車が大嫌いだ。', reading: 'かれはくるまがだいすきだが、ぎゃくにおとうとはくるまがだいきらいだ。', en: 'He loves cars, while his brother hates them.', sourceId: '104672', source: 'tatoeba' },
    { jp: '当地は夏はひどく湿気が多いが、逆に冬は乾燥する。', reading: 'とうちはなつはひどくしっけがおおいが、ぎゃくにふゆはかんそうする。', en: 'It gets very humid here in the summer. In the winter, on the other hand, it gets very dry.', sourceId: '123977', source: 'tatoeba' },
    { jp: '当地は夏がひどく湿気が多いが、逆に冬は乾燥する。', reading: 'とうちはなつがひどくしっけがおおいが、ぎゃくにふゆはかんそうする。', en: 'It gets very humid at home in summer; in winter, on the other hand, it gets very dry.', sourceId: '123978', source: 'tatoeba' },
  ],
  // N2 再び
  'n2m-g-ba56af': [
    { jp: '春が再び巡ってくることを楽しみにしています。', reading: 'はるがふたたびめぐってくることをたのしみにしています。', en: 'I\'m looking forward to the return of spring.', sourceId: '147657', source: 'tatoeba' },
    { jp: '私は全力を尽くしたが再び失敗しただけだった。', reading: 'わたしはぜんりょくをつくしたがふたたびしっぱいしただけだった。', en: 'I tried my best, only to fail again.', sourceId: '155386', source: 'tatoeba' },
    { jp: '私は生きている間は決して再び彼とは会わない。', reading: 'わたしはいきているまはけっしてふたたびかれとはあわない。', en: 'I\'ll never see him again as long as I live.', sourceId: '155559', source: 'tatoeba' },
  ],
  // N2 させておく
  'n2m-g-bc286b': [
    { jp: '中央銀行に物価の番人だけさせておくのはもったいない。', reading: 'ちゅうおうぎんこうにぶっかのばんにんだけさせておくのはもったいない。', en: 'It\'s a waste to just have the central banks watching over commodity prices.', sourceId: '74390', source: 'tatoeba' },
    { jp: '自分をそんなふうに人々に利用させておくべきではない。', reading: 'じぶんをそんなふうにひとびとにりようさせておくべきではない。', en: 'You shouldn\'t let people use you like that.', sourceId: '149742', source: 'tatoeba' },
    { jp: '農園主は、彼らを忙しくさせておくのが好きだったのです。', reading: 'のうえんぬしは、かれらをいそがしくさせておくのがすきだったのです。', en: 'The farmer liked to keep them busy.', sourceId: '121715', source: 'tatoeba' },
  ],
  // N2 からこそ/～ばこそ/こそ
  'n2m-g-bc9c8e': [
    { jp: '彼は年こそ若いが十分その仕事をやっていける。', reading: 'かれはとしこそわかいがじゅうぶんそのしごとをやっていける。', en: 'Young as he is, he is equal to the task.', sourceId: '101380', source: 'tatoeba' },
    { jp: '今こそ、私が彼をもっとも必要とする時期だ。', reading: 'いまこそ、わたしがかれをもっともひつようとするとききだ。', en: 'Now is the time when I need him most.', sourceId: '172861', source: 'tatoeba' },
    { jp: 'こだわりはお客に伝わってこそ意味をなす。', reading: 'こだわりはおきゃくにつたわってこそいみをなす。', en: 'Care over the particulars only has meaning once it gets across to customers.', sourceId: '76762', source: 'tatoeba' },
  ],
  // N2 それほど
  'n2m-g-bddd1a': [
    { jp: '落ち込みは季節調整すればそれほど大きくない。', reading: 'おちこみはきせつちょうせいすればそれほどおおきくない。', en: 'The decline isn\'t so sharp after seasonal adjustment.', sourceId: '78532', source: 'tatoeba' },
    { jp: '公平に評すれば、彼はそれほど怠け者ではない。', reading: 'こうへいにひょうすれば、かれはそれほどなまけものではない。', en: 'To do him justice, he is not so lazy.', sourceId: '173975', source: 'tatoeba' },
    { jp: '彼がそれほど落ち込んでいるとは思えないな。', reading: 'かれがそれほどおちこんでいるとはおもえないな。', en: 'I can\'t believe that he is that depressed.', sourceId: '120866', source: 'tatoeba' },
  ],
  // N2 さっぱりだ
  'n2m-g-c031e4': [
    { jp: '私はこの手のことにはさっぱりだ。', reading: 'わたしはこのてのことにはさっぱりだ。', en: 'I\'m a total stranger to things of this kind.', sourceId: '160868', source: 'tatoeba' },
  ],
  // N2 抜きにして/ 抜きにしては～れない
  'n2m-g-c30b4d': [
    { jp: '堅苦しい挨拶は抜きにして、さあ食べましょう。', reading: 'かたぐるしいあいさつはぬきにして、さあたべましょう。', en: 'Let\'s skip the formalities now, it\'s time to eat.', sourceId: '11588722', source: 'tatoeba' },
    { jp: '綺麗事は抜きにして、正直に言いなさいよ。', reading: 'きれいごとはぬきにして、しょうじきにいいなさいよ。', en: 'Enough with the empty words. Speak straight with me.', sourceId: '10502104', source: 'tatoeba' },
  ],
  // N2 に関わらず/に関わりなく
  'n2m-g-c48d44': [
    { jp: '年齢に関わらずすべての人が許可されています。', reading: 'ねんれいにかかわらずすべてのひとがきょかされています。', en: 'Every person will be admitted regardless of his or her age.', sourceId: '121781', source: 'tatoeba' },
    { jp: '晴雨に関わらず、郵便集配人は郵便を配達する。', reading: 'せいうにかかわらず、ゆうびんしゅうはいにんはゆうびんをはいたつする。', en: 'Rain or shine, the postman delivers the mail.', sourceId: '142995', source: 'tatoeba' },
    { jp: '彼女は出費に関わらず自分の計画を実行するだろう。', reading: 'かのじょはしゅっぴにかかわらずじぶんのけいかくをじっこうするだろう。', en: 'She will carry out her plan, regardless of expense.', sourceId: '88748', source: 'tatoeba' },
  ],
  // N2 いずれにしても
  'n2m-g-c57036': [
    { jp: 'いずれにしても雨が止んだら私は出かけよう。', reading: 'いずれにしてもあめがやんだらわたしはでかけよう。', en: 'At any rate I will go out when it stops raining.', sourceId: '229111', source: 'tatoeba' },
    { jp: 'いずれにしてもスケジュールは変更できない。', reading: 'いずれにしてもスケジュールはへんこうできない。', en: 'At any rate, we can\'t change the schedule.', sourceId: '229113', source: 'tatoeba' },
    { jp: 'いずれにしてもあなたの推測は間違っている。', reading: 'いずれにしてもあなたのすいそくはまちがっている。', en: 'In any case, you are wrong in your conjecture.', sourceId: '229115', source: 'tatoeba' },
  ],
  // N2 たものではない
  'n2m-g-c5e161': [
    { jp: 'ローマは、一日にして建設されたものではない。', reading: 'ローマは、いちにちにしてけんせつされたものではない。', en: 'Rome wasn\'t built in a day.', sourceId: '192255', source: 'tatoeba' },
    { jp: 'この試みは完全に成功などと言えたものではない。', reading: 'このこころみはかんぜんにせいこうなどといえたものではない。', en: 'This attempt has been less than a complete success.', sourceId: '221706', source: 'tatoeba' },
    { jp: '今日の演奏の出来は私の意にかなったものではない。', reading: 'きょうのえんそうのできはわたしのいにかなったものではない。', en: 'I am not satisfied with my performance today.', sourceId: '171972', source: 'tatoeba' },
  ],
  // N2 だとすれば
  'n2m-g-c66d20': [
    { jp: '君の話が本当だとすれば、私は何をすべきだろうか。', reading: 'きみのはなしがほんとうだとすれば、わたしはなにをすべきだろうか。', en: 'Assuming your story is true, what should I do?', sourceId: '178002', source: 'tatoeba' },
  ],
  // N2 とはいうものの
  'n2m-g-c69cbb': [
    { jp: '流言飛語に惑わされるべからず、とはいうものの、言うは易く行うは難し、と思わない？', reading: 'りゅうげんひごにまどわされるべからず、とはいうものの、いうはやすくおこなうはかたし、とおもわない？', en: 'They say you shouldn\'t take rumors seriously, but that\'s easier said than done.', sourceId: '78255', source: 'tatoeba' },
  ],
  // N2 際に/際/際は
  'n2m-g-c746de': [
    { jp: '予約の際に聞いた確認番号を私に教えて下さい。', reading: 'よやくのさいにきいたかくにんばんごうをわたしにおしえてください。', en: 'Please let me know the confirmation number you were told when you reserved the room.', sourceId: '78982', source: 'tatoeba' },
    { jp: '通りを横切る際には、注意しなければならない。', reading: 'とおりをよこぎるさいには、ちゅういしなければならない。', en: 'You must be careful in crossing the street.', sourceId: '125619', source: 'tatoeba' },
    { jp: '値段は決断をする際に非常に重要な要因となる。', reading: 'ねだんはけつだんをするさいにひじょうにじゅうようなよういんとなる。', en: 'Cost is a definite factor in making our decision.', sourceId: '127121', source: 'tatoeba' },
  ],
  // N2 につけて
  'n2m-g-c84df3': [
    { jp: '彼女はゆったりとした上衣を身につけていた。', reading: 'かのじょはゆったりとしたうわぎをみにつけていた。', en: 'She wore a loose jacket.', sourceId: '91325', source: 'tatoeba' },
    { jp: 'マヤの聖職者たちは天文学をよく身につけていた。', reading: 'マヤのせいしょくしゃたちはてんもんがくをよくみにつけていた。', en: 'Maya priests learned much about astronomy.', sourceId: '195235', source: 'tatoeba' },
    { jp: 'おまえの上着は私の勘定につけておきなさい。', reading: 'おまえのうわぎはわたしのかんじょうにつけておきなさい。', en: 'Put your coat on my account.', sourceId: '227538', source: 'tatoeba' },
  ],
  // N2 抜きで
  'n2m-g-cadeaa': [
    { jp: 'トムは、いつも砂糖抜きでコーヒーを飲む。', reading: 'トムは、いつもさとうぬきでコーヒーをのむ。', en: 'Tom usually drinks coffee without sugar.', sourceId: '3386451', source: 'tatoeba' },
    { jp: '生徒が朝ご飯抜きで学校に行くのはよくあることです。', reading: 'せいとがあさごはんぬきでがっこうにいくのはよくあることです。', en: 'It is common for students to skip breakfast before going to school.', sourceId: '1213915', source: 'tatoeba' },
    { jp: '私抜きでそのチーズケーキ食べるつもり？', reading: 'わたしぬきでそのチーズケーキたべるつもり？', en: 'Are you eating the cheesecake without me?', sourceId: '8734067', source: 'tatoeba' },
  ],
  // N2 といえば…が
  'n2m-g-caee07': [
    { jp: 'テレビといえば、君が今一番好きな番組は何ですか。', reading: 'テレビといえば、きみがいまいちばんすきなばんぐみはなにですか。', en: 'Speaking of television, what is your favorite show nowadays?', sourceId: '202029', source: 'tatoeba' },
    { jp: 'どちらかといえば彼の方が私より背が高い。', reading: 'どちらかといえばかれのほうがわたしよりせがたかい。', en: 'He is, if anything, a little taller than I.', sourceId: '200817', source: 'tatoeba' },
    { jp: '今日はどちらかといえば、気分が良い。', reading: 'きょうはどちらかといえば、きぶんがよい。', en: 'Today he is better, if anything.', sourceId: '171747', source: 'tatoeba' },
  ],
  // N2 これでは
  'n2m-g-cb13cc': [
    { jp: 'これではたぶん戦争ということになるだろう。', reading: 'これではたぶんせんそうということになるだろう。', en: 'This probably means war.', sourceId: '218772', source: 'tatoeba' },
    { jp: 'これでは一番列車に乗らなければならない。', reading: 'これではいちばんれっしゃにのらなければならない。', en: 'That means cutting the first train.', sourceId: '218771', source: 'tatoeba' },
    { jp: '結局これでは駄目だとだけ言っておこう。', reading: 'けっきょくこれではだめだとだけいっておこう。', en: 'Suffice it to say that, after all, this won\'t do.', sourceId: '175829', source: 'tatoeba' },
  ],
  // N2 というのに
  'n2m-g-cd196a': [
    { jp: '少女はまだ１０歳だというのに字がうまい。', reading: 'しょうじょはまだじゅっさいだというのにじがうまい。', en: 'The girl writes a good hand though she is still only ten.', sourceId: '146713', source: 'tatoeba' },
    { jp: '皆留守だというのに、不思議なことに家中の電灯がついていた。', reading: 'みなるすだというのに、ふしぎなことにいえじゅうのでんとうがついていた。', en: 'Strange to say, all the lights in the house were on, though no one was at home.', sourceId: '184951', source: 'tatoeba' },
    { jp: '朝の5時だというのに明るい。', reading: 'あさのごじだというのにあかるい。', en: 'It\'s just five in the morning, but nevertheless it is light out.', sourceId: '138773', source: 'tatoeba' },
  ],
  // N2 のであった
  'n2m-g-d1faeb': [
    { jp: '彼はその１年前に国をでていたのであった。', reading: 'かれはその[１|]ねんまえにくにをでていたのであった。', en: 'He had left his country one year before.', sourceId: '113219', source: 'tatoeba' },
    { jp: '彼は本当金を手に入れるためにやって来たのであった。', reading: 'かれはほんとうきんをてにいれるためにやってきたのであった。', en: 'He had really come to get gold.', sourceId: '99864', source: 'tatoeba' },
    { jp: '食べられることなくそのたこは、海に帰ったのであった。', reading: 'たべられることなくそのたこは、うみにかえったのであった。', en: 'That octopus returned to the sea without being eaten.', sourceId: '74277', source: 'tatoeba' },
  ],
  // N2 恐れがある
  'n2m-g-d3c7a0': [
    { jp: 'もう少し雨がひどくなると、洪水の恐れがある。', reading: 'もうすこしあめがひどくなると、こうずいのおそれがある。', en: 'A little heavier rain might cause a flood.', sourceId: '194111', source: 'tatoeba' },
    { jp: 'その鳥は絶滅の恐れがあるといわれています。', reading: 'そのとりはぜつめつのおそれがあるといわれています。', en: 'That species of bird is said to be in danger of dying out.', sourceId: '207758', source: 'tatoeba' },
    { jp: '僅かな不注意が大惨事に繋がる恐れがある。', reading: 'わずかなふちゅういがだいさんじにつながるおそれがある。', en: 'Slight inattention can cause a great disaster.', sourceId: '179996', source: 'tatoeba' },
  ],
  // N2 べつだん…ない
  'n2m-g-d43337': [
    { jp: '彼が失敗したことは、べつだん驚くにはあたらない。', reading: 'かれがしっぱいしたことは、べつだんおどろくにはあたらない。', en: 'It is no wonder that he failed.', sourceId: '3450228', source: 'tatoeba' },
  ],
  // N2 にこたえ(て)
  'n2m-g-d4a075': [
    { jp: '彼は年が自分のみにこたえだしたとこぼした。', reading: 'かれはとしがじぶんのみにこたえだしたとこぼした。', en: 'He complained that his age was beginning to tell on him.', sourceId: '101379', source: 'tatoeba' },
    { jp: '厳しい労働が彼の体にこたえ始めていた。', reading: 'きびしいろうどうがかれのからだにこたえはじめていた。', en: 'Hard labor was beginning to tell on his health.', sourceId: '174978', source: 'tatoeba' },
    { jp: '休憩もしないで長時間働けば、体にこたえてくるよ。', reading: 'きゅうけいもしないでちょうじかんはたらけば、からだにこたえてくるよ。', en: 'If you work too long without a rest, it begins to tell on you.', sourceId: '182637', source: 'tatoeba' },
  ],
  // N2 に限り/に限って/に限らず
  'n2m-g-d75703': [
    { jp: '「飲み物は無料ですか」「ご婦人に限ってです」', reading: '「のみものはむりょうですか」「ごふじんにかぎってです」', en: '"Are the drinks free?" "Only for ladies."', sourceId: '236398', source: 'tatoeba' },
    { jp: 'あなたがいないときに限って、あなたが欲しい。', reading: 'あなたがいないときにかぎって、あなたがほしい。', en: 'I want you only when you\'re not there.', sourceId: '1508624', source: 'tatoeba' },
    { jp: '「アルコール類はただですか」「ご婦人方に限ります」', reading: '「アルコールるいはただですか」「ごふじんかたにかぎります」', en: '"Are the drinks free?" "Only for the ladies."', sourceId: '237184', source: 'tatoeba' },
  ],
  // N2 ...といけない
  'n2m-g-d7896c': [
    { jp: '彼は失敗するといけないので、懸命に勉強した。', reading: 'かれはしっぱいするといけないので、けんめいにべんきょうした。', en: 'He studied hard for fear he should fail.', sourceId: '104756', source: 'tatoeba' },
    { jp: '彼は間違えるといけないから、非常に注意した。', reading: 'かれはまちがえるといけないから、ひじょうにちゅういした。', en: 'He was very careful for fear he should make a mistake.', sourceId: '108730', source: 'tatoeba' },
    { jp: '新聞記者は事実を正確につかまないといけない。', reading: 'しんぶんきしゃはじじつをせいかくにつかまないといけない。', en: 'The newspaperman should get his facts straight.', sourceId: '145109', source: 'tatoeba' },
  ],
  // N2 を除いて
  'n2m-g-d97ffc': [
    { jp: '彼は特別な場合を除いては決して酒を飲まない。', reading: 'かれはとくべつなばあいをのぞいてはけっしてさけをのまない。', en: 'He never drinks save on special occasions.', sourceId: '101615', source: 'tatoeba' },
    { jp: '小さなあやまりを除いては、これはかなりよい。', reading: 'ちいさなあやまりをのぞいては、これはかなりよい。', en: 'This is fairly good except for minor mistakes.', sourceId: '147024', source: 'tatoeba' },
    { jp: 'マイクを除いてみんなパーティーに顔を出した。', reading: 'マイクをのぞいてみんなパーティーにかおをだした。', en: 'All but Mike were present at the party.', sourceId: '195716', source: 'tatoeba' },
  ],
  // N2 を頼りに
  'n2m-g-db1245': [
    { jp: '困ったときは、私はいつも彼を頼りにしている。', reading: 'こまったときは、わたしはいつもかれをたよりにしている。', en: 'I always rely on him in times of trouble.', sourceId: '171019', source: 'tatoeba' },
    { jp: '彼女はもう彼を頼りに出来ないことを知っている。', reading: 'かのじょはもうかれをたよりにできないことをしっている。', en: 'She knows now that he is not to be counted on.', sourceId: '91371', source: 'tatoeba' },
    { jp: '彼の助けを頼りにすることはできないよ。', reading: 'かれのたすけをたよりにすることはできないよ。', en: 'You can\'t count on his help.', sourceId: '116960', source: 'tatoeba' },
  ],
  // N2 の下で/の下に
  'n2m-g-dc80ea': [
    { jp: '物を視覚的に覚える器官は視床下部の下にある。', reading: 'ものをしかくてきにおぼえるきかんはししょうかぶのしたにある。', en: 'The sight memory organ is below the hypothalamus.', sourceId: '83825', source: 'tatoeba' },
    { jp: '猫は椅子の上にいますか、椅子の下にいますか。', reading: 'ねこはいすのじょうにいますか、いすのしたにいますか。', en: 'Is the cat on the chair or under the chair?', sourceId: '121951', source: 'tatoeba' },
    { jp: '捜索隊は彼が崖の下で倒れているのを発見した。', reading: 'そうさくたいはかれががけのしたでたおれているのをはっけんした。', en: 'The search party found him lying at the foot of a cliff.', sourceId: '140587', source: 'tatoeba' },
  ],
  // N2 これだと
  'n2m-g-df9e1d': [
    { jp: 'これだと信じて歩いていると、色々な苦難にぶつかり、志の強さを試されているのです。', reading: 'これだとしんじてあるいていると、いろいろなくなんにぶつかり、こころざしのつよさをためされているのです。', en: 'Suffering many hardships and overcoming many trials to come to a certain point will test one\'s strength of will.', sourceId: '774350', source: 'tatoeba' },
  ],
  // N2 どうやら～そうだ
  'n2m-g-e0684f': [
    { jp: '天気はどうやら回復しそうだ。', reading: 'てんきはどうやらかいふくしそうだ。', en: 'It would seem that the weather is improving.', sourceId: '125115', source: 'tatoeba' },
    { jp: '午後はどうやら雨になりそうだ。', reading: 'ごごはどうやらあめになりそうだ。', en: 'It feels like it will rain in the afternoon.', sourceId: '174393', source: 'tatoeba' },
    { jp: 'どうやら明日は雨になりそうだ。', reading: 'どうやらあしたはあめになりそうだ。', en: 'Evidently, it\'s going to rain tomorrow.', sourceId: '201124', source: 'tatoeba' },
  ],
  // N2 かのうちに
  'n2m-g-e0b5b6': [
    { jp: '彼は逃げるか逃げないかのうちにまた捕まった。', reading: 'かれはにげるかにげないかのうちにまたつかまった。', en: 'He had scarcely escaped when he was recaptured.', sourceId: '101713', source: 'tatoeba' },
    { jp: '私が寝入るか寝入らぬかのうちに、電話が鳴った。', reading: 'わたしがねいるかねいらぬかのうちに、でんわがなった。', en: 'I had hardly fallen asleep when the telephone rang.', sourceId: '167655', source: 'tatoeba' },
    { jp: '家を出るか出ないかのうちに雨が降り出した。', reading: 'いえをでるかでないかのうちにあめがふりだした。', en: 'I had hardly left home when it began raining.', sourceId: '186984', source: 'tatoeba' },
  ],
  // N2 限りがある/ない
  'n2m-g-e2c354': [
    { jp: '私の物理の先生は授業をサボっても気にしない。', reading: 'わたしのぶつりのせんせいはじゅぎょうをサボってもきにしない。', en: 'My physics teacher doesn\'t care if I skip classes.', sourceId: '4811', source: 'tatoeba' },
    { jp: '私はフランス語がそんなにきちんとは話せない。', reading: 'わたしはフランスごがそんなにきちんとははなせない。', en: 'I don\'t speak French well enough!', sourceId: '4880', source: 'tatoeba' },
    { jp: 'それはあなたが一人になりたくないからです。', reading: 'それはあなたがひとりになりたくないからです。', en: 'It\'s because you don\'t want to be alone.', sourceId: '4728', source: 'tatoeba' },
  ],
  // N2 次第だ
  'n2m-g-e32b9a': [
    { jp: '成功するかしないかは、自分自身の努力次第だ。', reading: 'せいこうするかしないかは、じぶんじしんのどりょくしだいだ。', en: 'Whether you succeed or not depends on your own efforts.', sourceId: '143275', source: 'tatoeba' },
    { jp: 'そこに行くかもしれないが、それは事情次第だ。', reading: 'そこにいくかもしれないが、それはじじょうしだいだ。', en: 'I may go there, but that depends.', sourceId: '213667', source: 'tatoeba' },
    { jp: '行くべきかどうか決めるのはあなた次第だ。', reading: 'いくべきかどうかきめるのはあなたしだいだ。', en: 'It is up to you to decide whether or not.', sourceId: '173378', source: 'tatoeba' },
  ],
  // N2 上は
  'n2m-g-e39322': [
    { jp: '価格の下は３０ドルから上は５０ドルに及ぶ。', reading: 'かかくのしたは[３|][０|]ドルからうえは[５|][０|]ドルにおよぶ。', en: 'Prices range from as low as $30 to as high as $50.', sourceId: '187291', source: 'tatoeba' },
    { jp: '理論上はそれは可能だけれど実際にはとても難しい。', reading: 'りろんじょうはそれはかのうだけれどじっさいにはとてもむずかしい。', en: 'In theory it is possible, but in practice it is very difficult.', sourceId: '78348', source: 'tatoeba' },
    { jp: '彼が事実上はその会社の社長である。', reading: 'かれがじじつじょうはそのかいしゃのしゃちょうである。', en: 'He is the president of the company in fact.', sourceId: '120228', source: 'tatoeba' },
  ],
  // N2 と同時に
  'n2m-g-e476cf': [
    { jp: 'これと同時に次のことを考えておく必要がある。', reading: 'これとどうじにつぎのことをかんがえておくひつようがある。', en: 'It\'s necessary to think about both this one and the next one at the same time.', sourceId: '6849955', source: 'tatoeba' },
    { jp: 'メアリー、映画が始まると同時に寝ちゃったよ。', reading: 'メアリー、えいががはじまるとどうじにねちゃったよ。', en: 'Mary fell asleep just as the movie started.', sourceId: '11031636', source: 'tatoeba' },
    { jp: '彼が入ってきた、それと同時にベルが鳴った。', reading: 'かれがはいってきた、それとどうじにベルがなった。', en: 'He came in, and at the same time the bell rang.', sourceId: '119577', source: 'tatoeba' },
  ],
  // N2 ないものか
  'n2m-g-e6db45': [
    { jp: '彼がどのように行動するか予想する手はないものか。', reading: 'かれがどのようにこうどうするかよそうするてはないものか。', en: 'Isn\'t there any way to predict how he\'ll act?', sourceId: '120772', source: 'tatoeba' },
    { jp: '何かいい知恵がないものかね。', reading: 'なにかいいちえがないものかね。', en: 'I need some good advice.', sourceId: '188146', source: 'tatoeba' },
  ],
  // N2 を込めて
  'n2m-g-e771a5': [
    { jp: '彼女は、心に愛情と優しさを込めてお祈りをした。', reading: 'かのじょは、こころにあいじょうとやさしさをこめておいのりをした。', en: 'She said her prayers, her heart full of love and tenderness.', sourceId: '93720', source: 'tatoeba' },
    { jp: 'メアリーは尊敬の意味を込めてジョージを見つめた。', reading: 'メアリーはそんけいのいみをこめてジョージをみつめた。', en: 'Mary gazed at George in admiration.', sourceId: '194731', source: 'tatoeba' },
    { jp: '彼は満身の力を込めてそれを持ち上げた。', reading: 'かれはまんしんのちからをこめてそれをもちあげた。', en: 'He lifted it up with all his might.', sourceId: '99760', source: 'tatoeba' },
  ],
  // N2 ようではないか/ようじゃないか
  'n2m-g-e7881f': [
    { jp: 'この論議はやめようではないか。', reading: 'このろんぎはやめようではないか。', en: 'Let\'s put a stop to this discussion.', sourceId: '219152', source: 'tatoeba' },
  ],
  // N2 せいにする
  'n2m-g-e7901e': [
    { jp: '失敗を両親のせいにするのはフェアではありません。', reading: 'しっぱいをりょうしんのせいにするのはフェアではありません。', en: 'It\'s not fair to attribute your failure to your parents.', sourceId: '149584', source: 'tatoeba' },
    { jp: 'なぜそれが起きたのを僕のせいにするんだ。', reading: 'なぜそれがおきたのをぼくのせいにするんだ。', en: 'Why do you blame me for what happened?', sourceId: '199197', source: 'tatoeba' },
    { jp: '彼はよく自分の失敗を不運のせいにする。', reading: 'かれはよくじぶんのしっぱいをふうんのせいにする。', en: 'He often attributes his failures to bad luck.', sourceId: '110398', source: 'tatoeba' },
  ],
  // N2 でもない
  'n2m-g-e8b8d2': [
    { jp: '特に理解力がある訳でもない普通の中学生です。', reading: 'とくにりかいりょくがあるわけでもないふつうのちゅうがくせいです。', en: 'He\'s just a normal junior high school student, not particularly intelligent.', sourceId: '75294', source: 'tatoeba' },
    { jp: '彼は頭が切れるでもなく機知に富むわけでもない。', reading: 'かれはあたまがきれるでもなくきちにとむわけでもない。', en: 'He is not witty or bright.', sourceId: '101703', source: 'tatoeba' },
    { jp: '勝利は得られそうもないが、不可能でもない。', reading: 'しょうりはえられそうもないが、ふかのうでもない。', en: 'Victory is unlikely but not impossible.', sourceId: '147161', source: 'tatoeba' },
  ],
  // N2 にしたら
  'n2m-g-ea9a33': [
    { jp: '彼は、子供にしたら大変な理解力を持っている。', reading: 'かれは、こどもにしたらたいへんなりかいりょくをもっている。', en: 'He has a great deal of intelligence for a child.', sourceId: '106572', source: 'tatoeba' },
    { jp: '甘いものを口にしたら、気分がよくなったわ。', reading: 'あまいものをくちにしたら、きぶんがよくなったわ。', en: 'I felt better after eating something sugary.', sourceId: '9272076', source: 'tatoeba' },
    { jp: 'あんまり天気予報をあてにしたらだめ。', reading: 'あんまりてんきよほうをあてにしたらだめ。', en: 'You shouldn\'t rely too heavily on the weather report.', sourceId: '229467', source: 'tatoeba' },
  ],
  // N2 あえて～ない
  'n2m-g-ecd25a': [
    { jp: 'トムはホワイト先生に真実をあえて言わない。', reading: 'トムはホワイトせんせいにしんじつをあえていわない。', en: 'Tom dares not tell Mrs. White the truth.', sourceId: '200012', source: 'tatoeba' },
    { jp: 'あえてあの店には行かないようにしているんだ。', reading: 'あえてあのみせにはいかないようにしているんだ。', en: 'I make a special point of avoiding that shop.', sourceId: '234531', source: 'tatoeba' },
    { jp: '君の提案にあえて反対はしない。', reading: 'きみのていあんにあえてはんたいはしない。', en: 'I don\'t mean to object to your proposal.', sourceId: '178128', source: 'tatoeba' },
  ],
  // N2 にあたり/にあたって
  'n2m-g-ed0602': [
    { jp: '彼は不安そうにあたりをきょときょと見回した。', reading: 'かれはふあんそうにあたりをきょときょとみまわした。', en: 'He looked around uneasily.', sourceId: '100487', source: 'tatoeba' },
    { jp: '「７月」は１年の中で７回目の月にあたります。', reading: '「しちがつ」はいちねんのなかでななかいめのつきにあたります。', en: 'July is the seventh month of the year.', sourceId: '10234040', source: 'tatoeba' },
    { jp: '「６月」は１年の中で６回目の月にあたります。', reading: '「ろくがつ」はいちねんのなかでろっかいめのつきにあたります。', en: 'June is the sixth month of the year.', sourceId: '10234046', source: 'tatoeba' },
  ],
  // N2 一方
  'n2m-g-ee03b7': [
    { jp: 'この件に関する彼の解釈はあまりにも一方的だ。', reading: 'このけんにかんするかれのかいしゃくはあまりにもいっぽうてきだ。', en: 'His interpretation of this matter is too one-sided.', sourceId: '222146', source: 'tatoeba' },
    { jp: '床は緑色に塗られていたが、一方壁は黄色だった。', reading: 'ゆかはりょくしょくにぬられていたが、いっぽうかべはきいろだった。', en: 'The floor was painted green, while the walls were yellow.', sourceId: '146465', source: 'tatoeba' },
    { jp: '一方に当てはまることは他方にも当てはまる。', reading: 'いっぽうにあてはまることはたほうにもあてはまる。', en: 'What\'s sauce for the goose is sauce for the gander.', sourceId: '190052', source: 'tatoeba' },
  ],
  // N2 まいとする
  'n2m-g-efcebb': [
    { jp: '夫に死なれたとき、私は元気を失うまいとするのに大変苦労しました。', reading: 'おっとにしなれたとき、わたしはげんきをうしなうまいとするのにたいへんくろうしました。', en: 'When my husband died, I had a lot of difficulties keeping my chin up.', sourceId: '85013', source: 'tatoeba' },
  ],
  // N2 もっぱら
  'n2m-g-f115a3': [
    { jp: 'その特権はもっぱらご婦人だけに限られている。', reading: 'そのとっけんはもっぱらごふじんだけにかぎられている。', en: 'The privilege is reserved exclusively for women.', sourceId: '207411', source: 'tatoeba' },
    { jp: '私の成功はもっぱら彼の努力のおかげだった。', reading: 'わたしのせいこうはもっぱらかれのどりょくのおかげだった。', en: 'My success was, for the most part, thanks to his efforts.', sourceId: '163231', source: 'tatoeba' },
    { jp: '新聞２ページ分が王室の離婚問題にもっぱら用いられた。', reading: 'しんぶん[２|]ページぶんがおうしつのりこんもんだいにもっぱらもちいられた。', en: 'Two whole pages of the newspaper were devoted to the news of the royal divorce.', sourceId: '145188', source: 'tatoeba' },
  ],
  // N2 ものか/ものですか
  'n2m-g-f4a7d1': [
    { jp: 'そんな奇妙なことってあるものかありはしない。', reading: 'そんなきみょうなことってあるものかありはしない。', en: 'Can such a strange thing be real?', sourceId: '204162', source: 'tatoeba' },
    { jp: '僕の人生がどんなものか、君は分かっているのか？', reading: 'ぼくのじんせいがどんなものか、きみはわかっているのか？', en: 'Do you have any idea what my life is like?', sourceId: '5290', source: 'tatoeba' },
    { jp: '私は死とはどんなものかまったくわからない。', reading: 'わたしはしとはどんなものかまったくわからない。', en: 'I have no idea what death is like.', sourceId: '156515', source: 'tatoeba' },
  ],
  // N2 一口に…といっても
  'n2m-g-f589e2': [
    { jp: '一口に英会話教材といっても、千差万別だ。', reading: 'いちくちにえいかいわきょうざいといっても、せんさばんべつだ。', en: 'They all get lumped together as English texts. But in fact these books are extremely varied and wide-ranging.', sourceId: '190639', source: 'tatoeba' },
  ],
  // N2 もう少しで
  'n2m-g-f9882e': [
    { jp: '私はもう少しでその魚を捕まえるところだった。', reading: 'わたしはもうすこしでそのさかなをつかまえるところだった。', en: 'I almost caught the fish.', sourceId: '158750', source: 'tatoeba' },
    { jp: 'もう少しでトラックにはねられるところだった。', reading: 'もうすこしでトラックにはねられるところだった。', en: 'I barely escaped being hit by the truck.', sourceId: '194136', source: 'tatoeba' },
    { jp: 'その老婦人はもう少しでひかれるところだった。', reading: 'そのろうふじんはもうすこしでひかれるところだった。', en: 'The old woman was nearly run over.', sourceId: '206083', source: 'tatoeba' },
  ],
  // N2 なるべく
  'n2m-g-faa31b': [
    { jp: 'あのことはなるべく考えないようにしています。', reading: 'あのことはなるべくかんがえないようにしています。', en: 'I\'m trying not to think about that.', sourceId: '4898358', source: 'tatoeba' },
    { jp: '最も多くを制する者は、なるべくなりをひそめる。', reading: 'もっともおおくをせいするものは、なるべくなりをひそめる。', en: 'They that govern the most make the least noise.', sourceId: '170784', source: 'tatoeba' },
    { jp: 'われわれはなるべくたくさん本を読むべきである。', reading: 'われわれはなるべくたくさんほんをよむべきである。', en: 'We should read as many books as possible.', sourceId: '191670', source: 'tatoeba' },
  ],
  // N2 だけ(のことは)あって/だけのことはある
  'n2m-g-fb0342': [
    { jp: '専門家だけあって彼はその分野に詳しい。', reading: 'せんもんかだけあってかれはそのぶんやにくわしい。', en: 'As may be expected of an expert, he\'s well versed in the field.', sourceId: '141414', source: 'tatoeba' },
    { jp: '彼はボディビルが趣味というだけあって体がガシッとしている。', reading: 'かれはボディビルがしゅみというだけあってからだがガシッとしている。', en: 'Bodybuilding is his hobby so he has a very firm tight body with lots of muscle definition.', sourceId: '110943', source: 'tatoeba' },
    { jp: 'さすがに偉大な学者だけあって、彼はその問いに容易に答えた。', reading: 'さすがにいだいながくしゃだけあって、かれはそのといによういにこたえた。', en: 'Like the great scholar that he was, he answered the question easily.', sourceId: '216824', source: 'tatoeba' },
  ],
  // N2 次第で/次第だ/次第では
  'n2m-g-fd63d1': [
    { jp: '彼が成功するかしないかは彼の努力次第である。', reading: 'かれがせいこうするかしないかはかれのどりょくしだいである。', en: 'His success depends on his efforts.', sourceId: '119895', source: 'tatoeba' },
    { jp: '成功するかしないかは、自分自身の努力次第だ。', reading: 'せいこうするかしないかは、じぶんじしんのどりょくしだいだ。', en: 'Whether you succeed or not depends on your own efforts.', sourceId: '143275', source: 'tatoeba' },
    { jp: 'そこに行くかもしれないが、それは事情次第だ。', reading: 'そこにいくかもしれないが、それはじじょうしだいだ。', en: 'I may go there, but that depends.', sourceId: '213667', source: 'tatoeba' },
  ],
  // N2 でも～のに
  'n2m-g-fecd1d': [
    { jp: 'トムは謝るチャンスがいくらでもあったのに、謝らなかった。', reading: 'トムはあやまるチャンスがいくらでもあったのに、あやまらなかった。', en: 'Tom had plenty of chances to apologize, but he didn\'t.', sourceId: '1484936', source: 'tatoeba' },
    { jp: '残念すぎる。何が何でも君に会いたいのに。', reading: 'ざんねんすぎる。なにがなんでもきみにあいたいのに。', en: 'That\'s too bad. I really would love to see you.', sourceId: '8665582', source: 'tatoeba' },
    { jp: 'とりあえず男であればだれでもいいのに、まだ彼氏がいないって悲惨だね。', reading: 'とりあえずおとこであればだれでもいいのに、まだかれしがいないってひさんだね。', en: 'Anyway, as long as it\'s a man, anybody should do. It\'s sad that you don\'t have a boyfriend yet.', sourceId: '237529', source: 'tatoeba' },
  ],
  // N3 ...ような気がする
  'n3m-g-00a217': [
    { jp: '出で立ちが何となく貴族っぽいような気がする。', reading: 'いでたちがなんとなくきぞくっぽいようなきがする。', en: 'His dress somehow gives an aristocratic impression.', sourceId: '76031', source: 'tatoeba' },
    { jp: '私は以前ここへ来たことがあるような気がする。', reading: 'わたしはいぜんここへきたことがあるようなきがする。', en: 'I have a feeling that I have been here before.', sourceId: '158551', source: 'tatoeba' },
    { jp: 'お天気なので、釣りに行きたいような気がする。', reading: 'おてんきなので、つりにいきたいようなきがする。', en: 'It is a fine day and I feel like going fishing.', sourceId: '226812', source: 'tatoeba' },
  ],
  // N3 あとから
  'n3m-g-016383': [
    { jp: '今は仕事中なので、あとから電話します。', reading: 'いまはしごとちゅうなので、あとからでんわします。', en: 'I\'m at work now, so I\'ll call you later.', sourceId: '172649', source: 'tatoeba' },
    { jp: '彼は父親のすぐあとから外国に行った。', reading: 'かれはちちおやのすぐあとからがいこくにいった。', en: 'He went abroad soon after his father.', sourceId: '100353', source: 'tatoeba' },
    { jp: '私達は彼のあとから部屋にはいった。', reading: 'わたしたちはかれのあとからへやにはいった。', en: 'We entered the room after him.', sourceId: '151345', source: 'tatoeba' },
  ],
  // N3 そのため
  'n3m-g-01cdb6': [
    { jp: '私は一生懸命働いた、そのためにとても疲れた。', reading: 'わたしはいっしょうけんめいはたらいた、そのためにとてもつかれた。', en: 'I worked hard all day, so I was very tired.', sourceId: '158452', source: 'tatoeba' },
    { jp: 'そのために仕事を失うことになるかもしれない。', reading: 'そのためにしごとをうしなうことになるかもしれない。', en: 'It\'ll cost me my job.', sourceId: '212988', source: 'tatoeba' },
    { jp: '私が新聞の存在価値を信じるのはそのためだ。', reading: 'わたしがしんぶんのそんざいかちをしんじるのはそのためだ。', en: 'That is why I believe in the Press.', sourceId: '167652', source: 'tatoeba' },
  ],
  // N3 ですから
  'n3m-g-033396': [
    { jp: '結局、ハムを食べたのはステラだけですからね。', reading: 'けっきょく、ハムをたべたのはステラだけですからね。', en: 'After all, Stella was the only person who had the ham.', sourceId: '175843', source: 'tatoeba' },
    { jp: 'この道を行ってもダメですよ。工事中ですから。', reading: 'このみちをいってもダメですよ。こうじちゅうですから。', en: 'You can\'t go along this road. It is under repair.', sourceId: '220272', source: 'tatoeba' },
    { jp: 'いいえ、けっこうです。見ているだけですから。', reading: 'いいえ、けっこうです。みているだけですから。', en: 'No, thank you. I\'m just looking around.', sourceId: '229458', source: 'tatoeba' },
  ],
  // N3 いかなる
  'n3m-g-03a9a2': [
    { jp: '彼は提案に対するいかなる反論もただ排除した。', reading: 'かれはていあんにたいするいかなるはんろんもただはいじょした。', en: 'He just brushed aside any objections to the proposal.', sourceId: '101974', source: 'tatoeba' },
    { jp: '昔はいかなる王も国民に重税を課して苦しめた。', reading: 'むかしはいかなるおうもこくみんにじゅうぜいをかしてくるしめた。', en: 'In ancient times all the kings burdened the people with heavy taxes.', sourceId: '142411', source: 'tatoeba' },
    { jp: 'いかなる国も他国の内政に干渉してはならない。', reading: 'いかなるくにもたこくのないせいにかんしょうしてはならない。', en: 'No country should interfere in another country\'s internal affairs.', sourceId: '229291', source: 'tatoeba' },
  ],
  // N3 ともかく
  'n3m-g-0566bb': [
    { jp: '冗談はともかく、頭痛は医者に診てもらうべきだ。', reading: 'じょうだんはともかく、ずつうはいしゃにみてもらうべきだ。', en: 'Joking aside, you ought to see a doctor about your headache.', sourceId: '12574119', source: 'tatoeba' },
    { jp: '顔はともかく、気立てはとてもいい子だよ。', reading: 'かおはともかく、きだてはとてもいいこだよ。', en: 'Looks aside, she is very good-natured.', sourceId: '183637', source: 'tatoeba' },
    { jp: 'ともかく明日はそこへいかなければならないだろう。', reading: 'ともかくあしたはそこへいかなければならないだろう。', en: 'In any case, I\'ll have to go there tomorrow.', sourceId: '199772', source: 'tatoeba' },
  ],
  // N3 もしも～なら/ もしも～たら/ もしも～ても
  'n3m-g-072380': [
    { jp: 'もしも叶うなら、私は失った時間の埋め合わせをしたい。', reading: 'もしもかなうなら、わたしはうしなったじかんのうめあわせをしたい。', en: 'If I could have a wish, I\'d wish I could make up for lost time.', sourceId: '193789', source: 'tatoeba' },
    { jp: 'もしも無料でしたら１部コピーしてください。', reading: 'もしもむりょうでしたら[１|]ぶコピーしてください。', en: 'If it is free, please send me a copy.', sourceId: '193776', source: 'tatoeba' },
    { jp: 'もしも明日晴れなら私たちはピクニックに行くでしょう。', reading: 'もしもあしたばれならわたしたちはピクニックにいくでしょう。', en: 'If it is sunny tomorrow, we will go on a picnic.', sourceId: '193774', source: 'tatoeba' },
  ],
  // N3 にしても
  'n3m-g-0821ce': [
    { jp: '彼は健康を犠牲にしても自分の務めを果たした。', reading: 'かれはけんこうをぎせいにしてもじぶんのつとめをはたした。', en: 'He did his duty at the cost of his health.', sourceId: '107743', source: 'tatoeba' },
    { jp: '彼が回復する確率はあるにしても極めて少ない。', reading: 'かれがかいふくするかくりつはあるにしてもきわめてすくない。', en: 'There is little if any hope for his recovery.', sourceId: '120538', source: 'tatoeba' },
    { jp: 'どんな本を読むにしても、注意深く読みなさい。', reading: 'どんなほんをよむにしても、ちゅういぶかくよみなさい。', en: 'Whatever book you read, read it carefully.', sourceId: '199371', source: 'tatoeba' },
  ],
  // N3 にしても/にしろ/にせよ
  'n3m-g-0878a3': [
    { jp: '私にしろとか、するなとか命じないで下さい。', reading: 'わたしにしろとか、するなとかめいじないでください。', en: 'Don\'t tell me what to do or not to do.', sourceId: '164820', source: 'tatoeba' },
    { jp: '謝罪はあったにせよ、私はまだ彼に腹を立てている。', reading: 'しゃざいはあったにせよ、わたしはまだかれにはらをたてている。', en: 'Even though he apologized, I\'m still furious.', sourceId: '4818', source: 'tatoeba' },
    { jp: 'いい加減にしろっつの。恵子さん、嫌がってるだろ。', reading: 'いいかげんにしろっつの。けいこさん、いやがってるだろ。', en: 'I said \'Quit it\'. Can\'t you see Keiko hates that?', sourceId: '74717', source: 'tatoeba' },
  ],
  // N3 ばかりでなく
  'n3m-g-08d29d': [
    { jp: '彼ばかりでなく彼の姉妹達も映画を見に行った。', reading: 'かればかりでなくかれのしまいたちもえいがをみにいった。', en: 'Not only he but also his sisters went to the movies.', sourceId: '114089', source: 'tatoeba' },
    { jp: '経済的であるばかりでなく、おもしろくもある。', reading: 'けいざいてきであるばかりでなく、おもしろくもある。', en: 'Besides being economical, it\'s fun.', sourceId: '176456', source: 'tatoeba' },
    { jp: '彼は助言してくれたばかりでなく、お金もくれた。', reading: 'かれはじょげんしてくれたばかりでなく、おかねもくれた。', en: 'He gave me not only advice but also money.', sourceId: '104238', source: 'tatoeba' },
  ],
  // N3 て(は)はじめて
  'n3m-g-09bc21': [
    { jp: '彼は私が生まれてはじめて出会った俳優だった。', reading: 'かれはわたしがうまれてはじめてであったはいゆうだった。', en: 'He was the first actor I had met in my life.', sourceId: '106389', source: 'tatoeba' },
    { jp: '自分の子供を持ってはじめて親の苦労がわかる。', reading: 'じぶんのこどもをもってはじめておやのくろうがわかる。', en: 'It is only when you have your own children that you realize the trouble of parenthood.', sourceId: '149826', source: 'tatoeba' },
    { jp: '私は昨日になってはじめてその知らせをうけた。', reading: 'わたしはきのうになってはじめてそのしらせをうけた。', en: 'It was not until yesterday that I got the news.', sourceId: '156799', source: 'tatoeba' },
  ],
  // N3 といったら
  'n3m-g-0a4ded': [
    { jp: '彼の聞く音楽といったら肩の凝るものばかりだ。', reading: 'かれのきくおんがくといったらかたのこるものばかりだ。', en: 'He always listens to serious music.', sourceId: '116190', source: 'tatoeba' },
    { jp: '私には彼に何といったら良いか分からなかった。', reading: 'わたしにはかれになにといったらよいかわからなかった。', en: 'I didn\'t know what to say to him.', sourceId: '164531', source: 'tatoeba' },
    { jp: '実のところ、即決を悔やんでないといったら嘘だった。', reading: 'じつのところ、そっけつをくやんでないといったらうそだった。', en: 'Truthfully, if I\'d said I didn\'t have any regrets over my snap decision I\'d have been lying.', sourceId: '75496', source: 'tatoeba' },
  ],
  // N3 てばかりいる
  'n3m-g-0abcc4': [
    { jp: '彼女はいつも食べ物に文句を言ってばかりいる。', reading: 'かのじょはいつもたべものにもんくをいってばかりいる。', en: 'She\'s always complaining about the food.', sourceId: '93256', source: 'tatoeba' },
    { jp: '彼女はいつもボールを取り損なってばかりいる。', reading: 'かのじょはいつもボールをとりそこなってばかりいる。', en: 'She is always missing the ball.', sourceId: '93311', source: 'tatoeba' },
    { jp: 'つまらないうわさを信じてばかりいるんだから。', reading: 'つまらないうわさをしんじてばかりいるんだから。', en: 'They are always believing a groundless rumor.', sourceId: '202553', source: 'tatoeba' },
  ],
  // N3 おかげで
  'n3m-g-0bed41': [
    { jp: '彼は長年の経験のおかげで現在の地位についた。', reading: 'かれはながねんのけいけんのおかげでげんざいのちいについた。', en: 'He got his present position by virtue of his long experience.', sourceId: '102045', source: 'tatoeba' },
    { jp: '彼は資産のおかげでそのクラブの会員になれた。', reading: 'かれはしさんのおかげでそのクラブのかいいんになれた。', en: 'His wealth got him into the club.', sourceId: '105395', source: 'tatoeba' },
    { jp: '彼の努力のおかげで、乗組員全員が救助された。', reading: 'かれのどりょくのおかげで、のりくみいんぜんいんがきゅうじょされた。', en: 'Thanks to his efforts, all the crew were saved.', sourceId: '116448', source: 'tatoeba' },
  ],
  // N3 いまだに
  'n3m-g-0d2f4a': [
    { jp: '彼は引退したが、いまだに事実上指導者である。', reading: 'かれはいんたいしたが、いまだにじじつじょうしどうしゃである。', en: 'He has retired, but he is still an actual leader.', sourceId: '109839', source: 'tatoeba' },
    { jp: 'わが国の税制にはいまだに一貫した哲学がない。', reading: 'わがくにのぜいせいにはいまだにいっかんしたてつがくがない。', en: 'Our tax system is still without coherent philosophy.', sourceId: '192020', source: 'tatoeba' },
    { jp: 'ジュンコはいまだに生活費を両親に頼っている。', reading: 'ジュンコはいまだにせいかつひをりょうしんにたよっている。', en: 'Junko still depends on her parents for her living expenses.', sourceId: '215692', source: 'tatoeba' },
  ],
  // N3 どんなに～ても
  'n3m-g-0d3ace': [
    { jp: 'どんなに忙しくても新聞ぐらいは読むべきです。', reading: 'どんなにいそがしくてもしんぶんぐらいはよむべきです。', en: 'No matter how busy you are, I think you should at least read a newspaper.', sourceId: '199488', source: 'tatoeba' },
    { jp: 'どんなに探しても無くした時計は見つからなかった。', reading: 'どんなにさがしてもなくしたとけいはみつからなかった。', en: 'Look as I might, nowhere could I find my lost watch.', sourceId: '199510', source: 'tatoeba' },
    { jp: 'どんなに忙しくても、宿題はしなければならない。', reading: 'どんなにいそがしくても、しゅくだいはしなければならない。', en: 'However busy you may be, you must do your homework.', sourceId: '199489', source: 'tatoeba' },
  ],
  // N3 べきだ／べきではない
  'n3m-g-0d6cc8': [
    { jp: '夜１０時以後に人に電話するには避けるべきだ。', reading: 'よる[１|][０|]じいごにひとにでんわするにはさけるべきだ。', en: 'You should avoid calling a person after ten at night.', sourceId: '79773', source: 'tatoeba' },
    { jp: '文法的に正しい文章を作るよう心がけるべきだ。', reading: 'ぶんぽうてきにただしいぶんしょうをつくるようこころがけるべきだ。', en: 'You should try to produce grammatical sentences.', sourceId: '83653', source: 'tatoeba' },
    { jp: '故郷の老いた両親のことを考えて見るべきだ。', reading: 'こきょうのおいたりょうしんのことをかんがえてみるべきだ。', en: 'You must think of your old parents at home.', sourceId: '77333', source: 'tatoeba' },
  ],
  // N3 が～なら～も～だ
  'n3m-g-0ec4c7': [
    { jp: '私が馬鹿なら君もそうだ。', reading: 'わたしがばかならきみもそうだ。', en: 'If I am a fool, you are another.', sourceId: '167511', source: 'tatoeba' },
    { jp: '君が間違いなら、私も間違いだ。', reading: 'きみがまちがいなら、わたしもまちがいだ。', en: 'If you are wrong, I am wrong too.', sourceId: '179044', source: 'tatoeba' },
    { jp: '私は彼が推薦する人なら誰でも雇うつもりだ。', reading: 'わたしはかれがすいせんするひとならだれでもやとうつもりだ。', en: 'I\'ll hire whoever he recommends.', sourceId: '154444', source: 'tatoeba' },
  ],
  // N3 それとも
  'n3m-g-0efe29': [
    { jp: '彼はバスで来たのですか、それとも電車ですか。', reading: 'かれはバスできたのですか、それともでんしゃですか。', en: 'Did he come by bus or by train?', sourceId: '111284', source: 'tatoeba' },
    { jp: 'どこでそれを見つけたの、学校、それとも家で？', reading: 'どこでそれをみつけたの、がっこう、それともいえで？', en: 'Where did you find it, at school or at home?', sourceId: '200991', source: 'tatoeba' },
    { jp: 'お支払いは現金ですか？それとも小切手ですか？', reading: 'おしはらいはげんきんですか？それともこぎってですか？', en: 'Do you pay for it in cash or by check?', sourceId: '205621', source: 'tatoeba' },
  ],
  // N3 とりわけ
  'n3m-g-0fdcfd': [
    { jp: 'とりわけ、論理学には正確な定義が要求される。', reading: 'とりわけ、ろんりがくにはせいかくなていぎがようきゅうされる。', en: 'Above all, logic requires precise definitions.', sourceId: '199697', source: 'tatoeba' },
    { jp: 'とりわけ我々は利己主義になってはならない。', reading: 'とりわけわれわれはりこしゅぎになってはならない。', en: 'Above all things, we must not be selfish.', sourceId: '199693', source: 'tatoeba' },
    { jp: 'とりわけ、科学用語には正確な定義が要求される。', reading: 'とりわけ、かがくようごにはせいかくなていぎがようきゅうされる。', en: 'Above all, scientific terms call for precise definitions.', sourceId: '199699', source: 'tatoeba' },
  ],
  // N3 いくらなんでも
  'n3m-g-11c6ca': [
    { jp: '先日、パソコンショップでＳＩＭＭの掴み取りをやっていた。いくらなんでもマニアックすぎる。', reading: 'せんじつ、パソコンショップで[ＳＩＭＭ|]のつかみどりをやっていた。いくらなんでもマニアックすぎる。', en: 'I grabbed as much SIMM as possible in the computer shop the other day. Say what you like, it was more than just enthusiasm.', sourceId: '141485', source: 'tatoeba' },
  ],
  // N3 んだって
  'n3m-g-13206a': [
    { jp: 'トムはメアリーが泳げないの知ってるんだって。', reading: 'トムはメアリーがおよげないのしってるんだって。', en: 'Tom says he knows Mary can\'t swim.', sourceId: '8933959', source: 'tatoeba' },
    { jp: 'そこらへんは、男子と女子とでは違うんだってば。', reading: 'そこらへんは、だんしとじょしとではちがうんだってば。', en: 'Obviously that\'s different for men and women.', sourceId: '74986', source: 'tatoeba' },
    { jp: '田中さんって、まだ新婚ほやほやなんだって。', reading: 'たなかさんって、まだしんこんほやほやなんだって。', en: 'Tanaka only just recently became a newlywed.', sourceId: '1071237', source: 'tatoeba' },
  ],
  // N3 いいから
  'n3m-g-13e792': [
    { jp: '誰もいないよりは、誰でもいいからいた方いい。', reading: 'だれもいないよりは、だれでもいいからいたほういい。', en: 'Anybody is better than nobody.', sourceId: '136712', source: 'tatoeba' },
    { jp: 'だれでもいいからそれが必要な人にあげなさい。', reading: 'だれでもいいからそれがひつようなひとにあげなさい。', en: 'Give it to whoever needs it.', sourceId: '203176', source: 'tatoeba' },
    { jp: '彼は自分の成功を運がいいからだと考えている。', reading: 'かれはじぶんのせいこうをうんがいいからだとかんがえている。', en: 'He attributes his success to good luck.', sourceId: '1075638', source: 'tatoeba' },
  ],
  // N3 なんとしても
  'n3m-g-1928f0': [
    { jp: '私はなんとしてもあの株には手を出しません。', reading: 'わたしはなんとしてもあのかぶにはてをだしません。', en: 'I wouldn\'t touch that stock with a ten-foot pole.', sourceId: '159195', source: 'tatoeba' },
    { jp: '彼はなんとしても成功したいと願っている。', reading: 'かれはなんとしてもせいこうしたいとねがっている。', en: 'He is eager for success.', sourceId: '111378', source: 'tatoeba' },
    { jp: 'なんとしても私たちは核戦争を避けなければならない。', reading: 'なんとしてもわたしたちはかくせんそうをさけなければならない。', en: 'We have to avoid the nuclear war by all means.', sourceId: '198840', source: 'tatoeba' },
  ],
  // N3 でもしたら
  'n3m-g-198f9d': [
    { jp: 'よいお天気ですね。散歩でもしたらどうですか。', reading: 'よいおてんきですね。さんぽでもしたらどうですか。', en: 'It\'s a nice day, isn\'t it? Why not go out for a walk?', sourceId: '192927', source: 'tatoeba' },
    { jp: 'よい天気ですね。散歩でもしたらどうですか。', reading: 'よいてんきですね。さんぽでもしたらどうですか。', en: 'A nice day, isn\'t it? Why not go out for a walk?', sourceId: '192892', source: 'tatoeba' },
    { jp: 'そんな動物園のライオンみたいにぐたっと寝ていないで、部屋の片づけでもしたらどうなの。', reading: 'そんなどうぶつえんのライオンみたいにぐたっとねていないで、へやのかたづけでもしたらどうなの。', en: 'Don\'t just sleep all day like some lion from the zoo. How about you go and clean up your room?', sourceId: '1132532', source: 'tatoeba' },
  ],
  // N3 ところで
  'n3m-g-199449': [
    { jp: '目に悪いから暗いところで本を読んではいけない。', reading: 'めにわるいからくらいところでほんをよんではいけない。', en: 'Don\'t read under insufficient light, for it is bad for your eyes.', sourceId: '79977', source: 'tatoeba' },
    { jp: '僕たちは、きわどいところで終電車に間に合った。', reading: 'ぼくたちは、きわどいところでしゅうでんしゃにまにあった。', en: 'We were only just in time for the last train.', sourceId: '82347', source: 'tatoeba' },
    { jp: '彼女のいないところで、そんなことを言うな。', reading: 'かのじょのいないところで、そんなことをいうな。', en: 'Don\'t say such a thing behind her back.', sourceId: '94744', source: 'tatoeba' },
  ],
  // N3 まだ...ある
  'n3m-g-1bd561': [
    { jp: '立証されなければならない事はまだ一杯ある。', reading: 'りっしょうされなければならないことはまだいっぱいある。', en: 'There\'s still a lot to demonstrate.', sourceId: '1174541', source: 'tatoeba' },
    { jp: 'だれがその手紙を書いたかはまだなぞである。', reading: 'だれがそのてがみをかいたかはまだなぞである。', en: 'It is still a mystery who wrote the letter.', sourceId: '203210', source: 'tatoeba' },
    { jp: '手や足を切断した人はそれらがまだあるかのように感じ続ける。', reading: 'てやあしをせつだんしたひとはそれらがまだあるかのようにかんじつづける。', en: 'People with amputated limbs continue to feel them as if they were still there.', sourceId: '994336', source: 'tatoeba' },
  ],
  // N3 それだけ
  'n3m-g-1bf37a': [
    { jp: 'すみません。今それだけしか置いてないんです。', reading: 'すみません。いまそれだけしかおいてないんです。', en: 'I\'m sorry, but that\'s all we have right now.', sourceId: '214181', source: 'tatoeba' },
    { jp: '彼女が親切なのでそれだけますます彼女が好きだ。', reading: 'かのじょがしんせつなのでそれだけますますかのじょがすきだ。', en: 'I like her all the more for her kindness.', sourceId: '95324', source: 'tatoeba' },
    { jp: '欠点があるからそれだけよけいに彼を愛している。', reading: 'けってんがあるからそれだけよけいにかれをあいしている。', en: 'I love him all the more for his faults.', sourceId: '175955', source: 'tatoeba' },
  ],
  // N3 その結果
  'n3m-g-1c1f2b': [
    { jp: '私は、その結果についてまったく分かりません。', reading: 'わたしは、そのけっかについてまったくわかりません。', en: 'I don\'t understand a thing about that result.', sourceId: '162344', source: 'tatoeba' },
    { jp: '君はその結果を上役に知らせなくてはならない。', reading: 'きみはそのけっかをうわやくにしらせなくてはならない。', en: 'You must inform your superior of the results.', sourceId: '177748', source: 'tatoeba' },
    { jp: '概してその結果は満足すべきものではなかった。', reading: 'がいしてそのけっかはまんぞくすべきものではなかった。', en: 'On the whole, the result was unsatisfactory.', sourceId: '184680', source: 'tatoeba' },
  ],
  // N3 一体
  'n3m-g-1c97d0': [
    { jp: '一体だれが私の名簿をめちゃめちゃにしたのだ。', reading: 'いったいだれがわたしのめいぼをめちゃめちゃにしたのだ。', en: 'Who\'s gone and messed up my list of names?', sourceId: '190368', source: 'tatoeba' },
    { jp: 'こんな人気のないところで一体何をしているの？', reading: 'こんなにんきのないところでいったいなにをしているの？', en: 'What on earth are you doing in such a lonely place?', sourceId: '217345', source: 'tatoeba' },
    { jp: '一体何が彼らをそのような行動に駆り立てたのか？', reading: 'いったいなにがかれらをそのようなこうどうにかりたてたのか？', en: 'What on earth spurred them to such an action?', sourceId: '75503', source: 'tatoeba' },
  ],
  // N3 めったにない
  'n3m-g-1d0571': [
    { jp: '夜遅くまで電話で話す事などまずめったにない。', reading: 'よるおそくまででんわではなすことなどまずめったにない。', en: 'I rarely, if ever, talk on the phone till late at night.', sourceId: '79681', source: 'tatoeba' },
    { jp: 'めったにないこの機会を利用しさえすれば良い。', reading: 'めったにないこのきかいをりようしさえすればよい。', en: 'All you have to do is take advantage of this rare opportunity.', sourceId: '194622', source: 'tatoeba' },
    { jp: 'ビーバーは人に危害を加えることはめったにない。', reading: 'ビーバーはひとにきがいをくわえることはめったにない。', en: 'Beavers rarely inflict damage on people.', sourceId: '76474', source: 'tatoeba' },
  ],
  // N3 どう～ても
  'n3m-g-1efd62': [
    { jp: '彼女の行儀の悪さはどうしてもがまんできない。', reading: 'かのじょのぎょうぎのわるさはどうしてもがまんできない。', en: 'I simply cannot put up with her manners.', sourceId: '94421', source: 'tatoeba' },
    { jp: '彼は私の忠告をどうしても聞こうとしなかった。', reading: 'かれはわたしのちゅうこくをどうしてもきこうとしなかった。', en: 'He would not listen to my advice.', sourceId: '105741', source: 'tatoeba' },
    { jp: '弟はどうしてもそこへ一人で行くと言い張った。', reading: 'おとうとはどうしてもそこへひとりでいくといいはった。', en: 'My brother insisted on going there alone.', sourceId: '125446', source: 'tatoeba' },
  ],
  // N3 かけの／かけだ
  'n3m-g-1f0ffa': [
    { jp: '彼は複雑なぜんまいじかけのおもちゃを考案した。', reading: 'かれはふくざつなぜんまいじかけのおもちゃをこうあんした。', en: 'He devised a complicated clockwork toy.', sourceId: '100228', source: 'tatoeba' },
    { jp: '作業をやりかけのままにしとかないでよ。', reading: 'さぎょうをやりかけのままにしとかないでよ。', en: 'Don\'t leave your work half finished.', sourceId: '9336232', source: 'tatoeba' },
  ],
  // N3 ～わけない
  'n3m-g-1fcde9': [
    { jp: '最初から全部が全部上手くいくわけないんだよ。', reading: 'さいしょからぜんぶがぜんぶうまくいくわけないんだよ。', en: 'You can\'t expect everything to go well right from the beginning.', sourceId: '9359785', source: 'tatoeba' },
    { jp: '妖怪なんているわけないじゃないか。バカだな。', reading: 'ようかいなんているわけないじゃないか。バカだな。', en: 'Of course there\'s no such thing as yokai. You\'re such an idiot.', sourceId: '10587958', source: 'tatoeba' },
    { jp: 'フランス語を話す彼にとってわけないことだ。', reading: 'フランスごをはなすかれにとってわけないことだ。', en: 'It comes natural to him to speak French.', sourceId: '196963', source: 'tatoeba' },
  ],
  // N3 ますように
  'n3m-g-1ffc0c': [
    { jp: 'あなたたちが幸せな結婚生活を送りますように。', reading: 'あなたたちがしあわせなけっこんせいかつをおくりますように。', en: 'May you have a very happy married life!', sourceId: '233890', source: 'tatoeba' },
    { jp: '彼は私に「神の祝福がありますように」と言った。', reading: 'かれはわたしに「かみのしゅくふくがありますように」といった。', en: 'He prayed that God would bless me.', sourceId: '106229', source: 'tatoeba' },
    { jp: '生きとし生けるものが幸せでありますように。', reading: 'いきとしいけるものがしあわせでありますように。', en: 'Let happiness reside within all living beings.', sourceId: '2946870', source: 'tatoeba' },
  ],
  // N3 といえば / というと / といったら
  'n3m-g-2121e9': [
    { jp: '旅行といえば、神戸に行ったことはありますか。', reading: 'りょこうといえば、こうべにいったことはありますか。', en: 'Speaking about trips, have you ever been to Kobe?', sourceId: '78183', source: 'tatoeba' },
    { jp: '趣味といえば、あなたは切手を集めていますか。', reading: 'しゅみといえば、あなたはきってをあつめていますか。', en: 'Speaking of hobbies, do you collect stamps?', sourceId: '148472', source: 'tatoeba' },
    { jp: '私たちはエジプトといえばナイル川を思い出す。', reading: 'わたしたちはエジプトといえばナイルかわをおもいだす。', en: 'We associate Egypt with the Nile.', sourceId: '166600', source: 'tatoeba' },
  ],
  // N3 のだったら
  'n3m-g-21358e': [
    { jp: 'こっちの本とあっちのだったら、どっちが読みやすいかな？', reading: 'こっちのほんとあっちのだったら、どっちがよみやすいかな？', en: 'Which is easier to read, this book or that one?', sourceId: '10151264', source: 'tatoeba' },
    { jp: 'もし私たちがそこへ行けるのだったらすばらしいでしょうね。', reading: 'もしわたしたちがそこへいけるのだったらすばらしいでしょうね。', en: 'It would be splendid if we could go there, wouldn\'t it?', sourceId: '193627', source: 'tatoeba' },
    { jp: 'どうせ結婚式をやるのだったら、悔いの残らない最高の結婚式にしたい！', reading: 'どうせけっこんしきをやるのだったら、くいののこらないさいこうのけっこんしきにしたい！', en: 'If I\'m going to have a wedding ceremony, I want it to be the best ever so I have no regrets!', sourceId: '76527', source: 'tatoeba' },
  ],
  // N3 ということ
  'n3m-g-22e495': [
    { jp: '体温を適温に保つということは大切なことです。', reading: 'たいおんをてきおんにたもつということはたいせつなことです。', en: 'It is important to maintain your body temperature at a suitable level.', sourceId: '74387', source: 'tatoeba' },
    { jp: '問題は、どちらを選んだらよいかということだ。', reading: 'もんだいは、どちらをえらんだらよいかということだ。', en: 'The question is which to choose.', sourceId: '79854', source: 'tatoeba' },
    { jp: '彼女は彼が嫌いだということをはっきりさせた。', reading: 'かのじょはかれがきらいだということをはっきりさせた。', en: 'She made it clear that she didn\'t like him.', sourceId: '87496', source: 'tatoeba' },
  ],
  // N3 ことになる/ことになっている
  'n3m-g-237628': [
    { jp: '来年で彼は１０年パリに住んでいることになる。', reading: 'らいねんでかれは[１|][０|]ねんパリにすんでいることになる。', en: 'He will have lived in Paris for ten years next year.', sourceId: '78605', source: 'tatoeba' },
    { jp: '野球と言うことになるとあまり知らないのです。', reading: 'やきゅうということになるとあまりしらないのです。', en: 'When it comes to baseball, I don\'t know much.', sourceId: '79655', source: 'tatoeba' },
    { jp: '明日雨が降れば、丸１週間雨が続くことになる。', reading: 'あしたうがふれば、まる[１|]しゅうかんうがつづくことになる。', en: 'It will have been raining a whole week if it is rainy tomorrow.', sourceId: '80344', source: 'tatoeba' },
  ],
  // N3 なんか/なんて/など
  'n3m-g-24bdec': [
    { jp: '今の、ゼッタイなんか邪なこと考えてたでしょ。', reading: 'いまの、ゼッタイなんかよこしまなことかんがえてたでしょ。', en: 'I just bet you were thinking something perverse just now.', sourceId: '74667', source: 'tatoeba' },
    { jp: '朝夕は冷えるので服装などに注意したい。', reading: 'あさゆうはひえるのでふくそうなどにちゅういしたい。', en: 'It gets cold in the mornings and evenings, so I want to take care how I dress.', sourceId: '74218', source: 'tatoeba' },
    { jp: '細菌などから隔離するため、面会謝絶となっています。', reading: 'さいきんなどからかくりするため、めんかいしゃぜつとなっています。', en: 'In order to isolate him from bacteria, and such, he is not allowed visitors.', sourceId: '74255', source: 'tatoeba' },
  ],
  // N3 と言われている
  'n3m-g-268276': [
    { jp: '日本は世界で最大の経済大国だと言われている。', reading: 'にっぽんはせかいでさいだいのけいざいたいこくだといわれている。', en: 'It is said that Japan is the greatest economic power in the world.', sourceId: '122448', source: 'tatoeba' },
    { jp: '日本の鉄道の組織はすばらしいと言われている。', reading: 'にっぽんのてつどうのそしきはすばらしいといわれている。', en: 'The railroad system in Japan is said to be wonderful.', sourceId: '122560', source: 'tatoeba' },
    { jp: 'イギリス人は、実際的な国民だと言われている。', reading: 'イギリスじんは、じっさいてきなこくみんだといわれている。', en: 'The English are said to be a practical people.', sourceId: '229224', source: 'tatoeba' },
  ],
  // N3 としたら
  'n3m-g-26fcbb': [
    { jp: 'トンネルを掘るとしたらどれくらい簡単なのか。', reading: 'トンネルをほるとしたらどれくらいかんたんなのか。', en: 'How easy would it be to bore a tunnel through it?', sourceId: '199364', source: 'tatoeba' },
    { jp: 'ドアを開けようとしたら、ドアの握りがとれた。', reading: 'ドアをあけようとしたら、ドアのにぎりがとれた。', en: 'I tried to open the door, and the doorknob came off.', sourceId: '201790', source: 'tatoeba' },
    { jp: '家を出ようとしたら、トムが私に電話してきた。', reading: 'いえをでようとしたら、トムがわたしにでんわしてきた。', en: 'I was leaving home when Tom telephoned me.', sourceId: '1147469', source: 'tatoeba' },
  ],
  // N3 いささか
  'n3m-g-270863': [
    { jp: '雰囲気はいささか緊張したものになることがある。', reading: 'ふんいきはいささかきんちょうしたものになることがある。', en: 'The atmosphere can become rather strained.', sourceId: '83695', source: 'tatoeba' },
    { jp: '私はそんな事をするのはいささか気が咎めた。', reading: 'わたしはそんなことをするのはいささかきがとがめた。', en: 'I had a slight scruple about doing that kind of thing.', sourceId: '159646', source: 'tatoeba' },
    { jp: 'ここだけの話だが、彼はいささか間が抜けている。', reading: 'ここだけのはなしだが、かれはいささかまがぬけている。', en: 'Between you and me, he is rather stupid.', sourceId: '224690', source: 'tatoeba' },
  ],
  // N3 に～られる
  'n3m-g-278b0d': [
    { jp: '彼女はヒジ先の骨に触られるだけで悲鳴をあげる。', reading: 'かのじょはヒジさきのほねにさわられるだけでひめいをあげる。', en: 'She screams if you even touch her funny bone.', sourceId: '91656', source: 'tatoeba' },
    { jp: '彼女は４時頃なら電話に出られると思います。', reading: 'かのじょはよじごろならでんわにでられるとおもいます。', en: 'I think she\'ll be able to answer the phone around 4:00.', sourceId: '93526', source: 'tatoeba' },
    { jp: '彼はその問題すべてに答えられるほど頭がよい。', reading: 'かれはそのもんだいすべてにこたえられるほどあたまがよい。', en: 'He is smart enough to answer all the questions.', sourceId: '112378', source: 'tatoeba' },
  ],
  // N3 ...といって
  'n3m-g-27c8bd': [
    { jp: '貧乏だからだといって人を軽蔑してはいけない。', reading: 'びんぼうだからだといってひとをけいべつしてはいけない。', en: 'You should not despise a man because he is poor.', sourceId: '85162', source: 'tatoeba' },
    { jp: '貧しいからといって、人を軽蔑してはいけない。', reading: 'まずしいからといって、ひとをけいべつしてはいけない。', en: 'You must not despise someone because they are poor.', sourceId: '85211', source: 'tatoeba' },
    { jp: '彼女は自分が正しいといってあくまで主張する。', reading: 'かのじょはじぶんがただしいといってあくまでしゅちょうする。', en: 'She persists in saying that she is right.', sourceId: '89107', source: 'tatoeba' },
  ],
  // N3 いかにも…らしい
  'n3m-g-299796': [
    { jp: 'そんなふるまいをするなんていかにも彼らしい。', reading: 'そんなふるまいをするなんていかにもかれらしい。', en: 'It\'s characteristic of him to behave like that.', sourceId: '204196', source: 'tatoeba' },
    { jp: '朝食前に出勤するなんていかにも彼らしい。', reading: 'ちょうしょくまえにしゅっきんするなんていかにもかれらしい。', en: 'It is characteristic of him to go to work before breakfast.', sourceId: '126176', source: 'tatoeba' },
    { jp: 'そうしたしゃべりかたはいかにも彼らしい。', reading: 'そうしたしゃべりかたはいかにもかれらしい。', en: 'That way of talking is typical of him.', sourceId: '213895', source: 'tatoeba' },
  ],
  // N3 合う
  'n3m-g-29c0ff': [
    { jp: '彼は望遠鏡を自分の目に合うように調節した。', reading: 'かれはぼうえんきょうをじぶんのめにあうようにちょうせつした。', en: 'He adjusted the telescope to his sight.', sourceId: '99985', source: 'tatoeba' },
    { jp: '彼は望遠鏡を自分の目に合うように調整した。', reading: 'かれはぼうえんきょうをじぶんのめにあうようにちょうせいした。', en: 'He adjusted the telescope to his sight.', sourceId: '99986', source: 'tatoeba' },
    { jp: '彼女は新しいドレスに合う帽子を選んだ。', reading: 'かのじょはあたらしいドレスにあうぼうしをえらんだ。', en: 'She selected a hat to match her new dress.', sourceId: '88576', source: 'tatoeba' },
  ],
  // N3 もし~たなら
  'n3m-g-2d3fb0': [
    { jp: 'もしあなたなら、その仕事に申し込むだろう。', reading: 'もしあなたなら、そのしごとにもうしこむだろう。', en: 'Were I you, I would apply for the job.', sourceId: '193909', source: 'tatoeba' },
    { jp: 'もし私があなたなら、もっと体に気をつけるだろう。', reading: 'もしわたしがあなたなら、もっとからだにきをつけるだろう。', en: 'I would be more careful if I were you.', sourceId: '193665', source: 'tatoeba' },
    { jp: 'もし私があなたなら、彼の申し出を受けるでしょうに。', reading: 'もしわたしがあなたなら、かれのもうしでをうけるでしょうに。', en: 'If I were you, I would accept his offer.', sourceId: '193663', source: 'tatoeba' },
  ],
  // N3 なるほど
  'n3m-g-2e1550': [
    { jp: 'なるほど彼女は美人ではないが、気立てがよい。', reading: 'なるほどかのじょはびじんではないが、きだてがよい。', en: 'She is not beautiful, to be sure, but she is good-natured.', sourceId: '199023', source: 'tatoeba' },
    { jp: 'なるほど彼はよい人だが、あまり頭はよくない。', reading: 'なるほどかれはよいひとだが、あまりあたまはよくない。', en: 'He is a nice person, to be sure, but not very clever.', sourceId: '199041', source: 'tatoeba' },
    { jp: 'なるほど彼女はかわいいが美人とはいえない。', reading: 'なるほどかのじょはかわいいがびじんとはいえない。', en: 'She is no doubt pretty, but she isn\'t beautiful.', sourceId: '199024', source: 'tatoeba' },
  ],
  // N3 などする
  'n3m-g-2f3e63': [
    { jp: 'こんな未熟な親が出産、子育てなどするのが間違いだったんだ。', reading: 'こんなみじゅくなおやがしゅっさん、こそだてなどするのがまちがいだったんだ。', en: 'It was a mistake for such a young parent to have, and raise a child.', sourceId: '236522', source: 'tatoeba' },
    { jp: '彼は盗みなどする人ではない。', reading: 'かれはぬすみなどするひとではない。', en: 'He is the last man to steal.', sourceId: '101754', source: 'tatoeba' },
  ],
  // N3 …といっても…ない
  'n3m-g-2fd93f': [
    { jp: '現代は原子力時代だといっても過言ではない。', reading: 'げんだいはげんしりょくじだいだといってもかごんではない。', en: 'It is not too much to say that this is the atomic age.', sourceId: '174841', source: 'tatoeba' },
    { jp: '今は原子力時代だといっても過言ではない。', reading: 'いまはげんしりょくじだいだといってもかごんではない。', en: 'It is not too much to say that this is the atomic age.', sourceId: '172655', source: 'tatoeba' },
    { jp: '彼女は天使だといっても過言ではない。', reading: 'かのじょはてんしだといってもかごんではない。', en: 'It is no exaggeration to say that she is an angel.', sourceId: '87790', source: 'tatoeba' },
  ],
  // N3 どんなに
  'n3m-g-30242f': [
    { jp: '彼女はどんなに体の具合が悪くてもいつも働く。', reading: 'かのじょはどんなにからだのぐあいがわるくてもいつもはたらく。', en: 'However ill she is, she always works.', sourceId: '91871', source: 'tatoeba' },
    { jp: '彼女がどんなに思い悩んだか君にはわからない。', reading: 'かのじょがどんなにおもいなやんだかきみにはわからない。', en: 'You have no idea how distressed she was.', sourceId: '95594', source: 'tatoeba' },
    { jp: '彼女がどんなに喜んでいるのか分からなかった。', reading: 'かのじょがどんなによろこんでいるのかわからなかった。', en: 'I did not notice how glad she was.', sourceId: '95596', source: 'tatoeba' },
  ],
  // N3 だけで(は)なく
  'n3m-g-302e58': [
    { jp: '彼女は英語だけでなくフランス語も流暢に話す。', reading: 'かのじょはえいごだけでなくフランスごもりゅうちょうにはなす。', en: 'In addition to English, she speaks French fluently.', sourceId: '91063', source: 'tatoeba' },
    { jp: '彼は仕事をもっているだけでなく、家事もする。', reading: 'かれはしごとをもっているだけでなく、かじもする。', en: 'He not only has a job but does the housework.', sourceId: '106626', source: 'tatoeba' },
    { jp: '彼は英語を教えてくれるだけでなく小説も書く。', reading: 'かれはえいごをおしえてくれるだけでなくしょうせつもかく。', en: 'Besides teaching English, he writes novels.', sourceId: '109667', source: 'tatoeba' },
  ],
  // N3 だからこそ
  'n3m-g-3044a3': [
    { jp: 'だからこそ、車で行くなといったんですよ。', reading: 'だからこそ、くるまでいくなといったんですよ。', en: 'That\'s why I told you not to go by car.', sourceId: '203836', source: 'tatoeba' },
    { jp: '未来なことは誰にも分からない。だからこそ可能性は無限。', reading: 'みらいなことはだれにもわからない。だからこそかのうせいはむげん。', en: 'No one knows what the future holds. That\'s why the possibilities are endless.', sourceId: '8861077', source: 'tatoeba' },
    { jp: '精肉店と飲食店を兼ねたお店だからこそできるこの低価格。ぜひ一度ご賞味ください。', reading: 'せいにくてんといんしょくてんをかねたおみせだからこそできるこのていかかく。ぜひいちどごしょうみください。', en: 'Because we\'re both a butcher\'s shop and a restaurant, we can offer such low prices. Please have a taste!', sourceId: '11029774', source: 'tatoeba' },
  ],
  // N3 そのため(に)
  'n3m-g-31ecf3': [
    { jp: '私が新聞の存在価値を信じるのはそのためだ。', reading: 'わたしがしんぶんのそんざいかちをしんじるのはそのためだ。', en: 'That is why I believe in the Press.', sourceId: '167652', source: 'tatoeba' },
    { jp: 'そのための時間はないし、それにお金もないんだ。', reading: 'そのためのじかんはないし、それにおかねもないんだ。', en: 'I have no time for that, and besides, I don\'t have any money.', sourceId: '1866547', source: 'tatoeba' },
    { jp: '私は一生懸命働いた、そのためにとても疲れた。', reading: 'わたしはいっしょうけんめいはたらいた、そのためにとてもつかれた。', en: 'I worked hard all day, so I was very tired.', sourceId: '158452', source: 'tatoeba' },
  ],
  // N3 なくては
  'n3m-g-32fcb6': [
    { jp: '友人と約束があるので行かなくてはなりません。', reading: 'ゆうじんとやくそくがあるのでいかなくてはなりません。', en: 'I have to go off because I have an appointment with a friend.', sourceId: '79377', source: 'tatoeba' },
    { jp: '彼女の年齢ではもっと分別がなくてはならない。', reading: 'かのじょのねんれいではもっとふんべつがなくてはならない。', en: 'She should know better at her age.', sourceId: '94094', source: 'tatoeba' },
    { jp: '遅くなってしまったわ、そろそろいかなくては。', reading: 'おそくなってしまったわ、そろそろいかなくては。', en: 'Oh, I\'m late. I should be going now.', sourceId: '126739', source: 'tatoeba' },
  ],
  // N3 あれでも
  'n3m-g-331c77': [
    { jp: '彼はあれでも絵書きだってさ。', reading: 'かれはあれでもえがきだってさ。', en: 'He claims that he is a painter.', sourceId: '114751', source: 'tatoeba' },
  ],
  // N3 なに～ない
  'n3m-g-339fdd': [
    { jp: '労働者たちにはもっと働こうとする刺激がなにもない。', reading: 'ろうどうしゃたちにはもっとはたらこうとするしげきがなにもない。', en: 'The workers have no incentive to work harder.', sourceId: '77381', source: 'tatoeba' },
    { jp: '彼はなにもしないで手をこまねいているだけだった。', reading: 'かれはなにもしないでてをこまねいているだけだった。', en: 'He did nothing but fold his arms.', sourceId: '111414', source: 'tatoeba' },
    { jp: '事の次第がわかるまでは、君はなにもいえない。', reading: 'ことのしだいがわかるまでは、きみはなにもいえない。', en: 'You can\'t say anything till you know the circumstances.', sourceId: '150909', source: 'tatoeba' },
  ],
  // N3 のような
  'n3m-g-33b6ab': [
    { jp: '良きコーチはいわば選手の親のようなものだ。', reading: 'よきコーチはいわばせんしゅのおやのようなものだ。', en: 'A good coach is like a parent to the players.', sourceId: '77845', source: 'tatoeba' },
    { jp: '彼女は幽霊でも見たかのような顔をしている。', reading: 'かのじょはゆうれいでもみたかのようなかおをしている。', en: 'She looks as if she had seen a ghost.', sourceId: '86426', source: 'tatoeba' },
    { jp: '彼女は成長して母のような美しい女になった。', reading: 'かのじょはせいちょうしてははのようなうつくしいおんなになった。', en: 'She grew up to be a lovely woman like her mother.', sourceId: '88394', source: 'tatoeba' },
  ],
  // N3 なんでもない
  'n3m-g-36c37f': [
    { jp: '私の悩みに比べたら君の悩みなどなんでもない。', reading: 'わたしのなやみにくらべたらきみのなやみなどなんでもない。', en: 'As compared with my trouble, yours is nothing.', sourceId: '162947', source: 'tatoeba' },
    { jp: '告白します、私の通訳は完璧でもなんでもないことを。', reading: 'こくはくします、わたしのつうやくはかんぺきでもなんでもないことを。', en: 'I confess my translation is not perfect.', sourceId: '1623832', source: 'tatoeba' },
    { jp: '「トム」「何？」「やっぱなんでもない」', reading: '「トム」「なに？」「やっぱなんでもない」', en: '"Hey, Tom." "What is it?" "Oh actually, never mind."', sourceId: '3567483', source: 'tatoeba' },
  ],
  // N3 ということ/というの
  'n3m-g-3acec8': [
    { jp: 'コンタクトを入れるというのはいかがでしょう？', reading: 'コンタクトをいれるというのはいかがでしょう？', en: 'How about wearing contact lenses?', sourceId: '74894', source: 'tatoeba' },
    { jp: '緑はバイオリンが上手だというのは本当ですか。', reading: 'みどりはバイオリンがじょうずだというのはほんとうですか。', en: 'Is it true that Midori plays the violin very well?', sourceId: '77801', source: 'tatoeba' },
    { jp: '印刷物には、特別郵袋印刷物というのがあります。', reading: 'いんさつぶつには、とくべつゆうたいいんさつぶつというのがあります。', en: 'Included in the printed matter category is what is called \'special mailbag printed matter\'.', sourceId: '76343', source: 'tatoeba' },
  ],
  // N3 せいで／せいか
  'n3m-g-3b6b77': [
    { jp: '貧しさのせいで病気になることがしばしばある。', reading: 'まずしさのせいでびょうきになることがしばしばある。', en: 'Illness often results from poverty.', sourceId: '85179', source: 'tatoeba' },
    { jp: '飛行機でお酒飲むと、気圧のせいか酔いやすい。', reading: 'ひこうきでおさけのむと、きあつのせいかよいやすい。', en: 'Maybe it\'s the low air pressure that means you get drunk more easily on planes.', sourceId: '85717', source: 'tatoeba' },
    { jp: '彼は粗野な言葉づかいのせいで誤解されている。', reading: 'かれはそやなことばづかいのせいでごかいされている。', en: 'He\'s misunderstood because of his vulgar language.', sourceId: '102893', source: 'tatoeba' },
  ],
  // N3 またしても
  'n3m-g-3d7dae': [
    { jp: 'ウインドウズ９５がまたしても壊れてくれたのです。', reading: 'ウインドウズ[９|][５|]がまたしてもこわれてくれたのです。', en: 'Windows 95 crashed on me AGAIN!', sourceId: '236975', source: 'tatoeba' },
    { jp: 'メアリーはまたしても寝坊した。', reading: 'メアリーはまたしてもねぼうした。', en: 'Mary overslept again.', sourceId: '12698881', source: 'tatoeba' },
    { jp: 'ケネス・スターがまたしても権力を濫用し、私がインターネットを使う権利を剥奪したのです。', reading: 'ケネス・スターがまたしてもけんりょくをらんようし、わたしがインターネットをつかうけんりをはくだつしたのです。', en: 'Kenneth Starr abused his power again and took away my right to get on-line.', sourceId: '225243', source: 'tatoeba' },
  ],
  // N3 なんとも
  'n3m-g-3d7ee4': [
    { jp: '蓮の花はなんとも言えない芳香をはなっていた。', reading: 'はちすのはなはなんともいえないほうこうをはなっていた。', en: 'The lotus blossoms diffused an inexpressibly pleasant scent.', sourceId: '77421', source: 'tatoeba' },
    { jp: '彼はうそをつくのをなんとも思ってないようだ。', reading: 'かれはうそをつくのをなんともおもってないようだ。', en: 'He seems to think nothing of telling a lie.', sourceId: '114321', source: 'tatoeba' },
    { jp: '彼女は、早起きすることをなんとも思っていない。', reading: 'かのじょは、はやおきすることをなんともおもっていない。', en: 'She makes nothing of getting up early.', sourceId: '93711', source: 'tatoeba' },
  ],
  // N3 姿を見せる
  'n3m-g-3f6413': [
    { jp: '彼はその町を去り二度と姿を見せることはなかった。', reading: 'かれはそのまちをさりにどとすがたをみせることはなかった。', en: 'He left the town and was never seen again.', sourceId: '112506', source: 'tatoeba' },
    { jp: '僕らは、彼が土曜の午後姿を見せるのを期待している。', reading: 'ぼくらは、かれがどようのごごすがたをみせるのをきたいしている。', en: 'We expect him to show up on Saturday afternoon.', sourceId: '81713', source: 'tatoeba' },
    { jp: '彼がいつか姿を見せることはかくじつだ。', reading: 'かれがいつかすがたをみせることはかくじつだ。', en: 'He is certain to turn up some time.', sourceId: '121091', source: 'tatoeba' },
  ],
  // N3 させてください/させてもらえますか/させてもらえませんか
  'n3m-g-3f9c2f': [
    { jp: '私の言いたいことをはっきりとさせてください。', reading: 'わたしのいいたいことをはっきりとさせてください。', en: 'Let me make plain what I mean.', sourceId: '163720', source: 'tatoeba' },
    { jp: '彼らのキャンペーンに参加させてください。', reading: 'かれらのキャンペーンにさんかさせてください。', en: 'Join me with them in their movement.', sourceId: '98581', source: 'tatoeba' },
    { jp: 'パスポートと搭乗券を拝見させてください。', reading: 'パスポートととうじょうけんをはいけんさせてください。', en: 'Please let me see your passport and boarding pass.', sourceId: '774440', source: 'tatoeba' },
  ],
  // N3 によれば/によると
  'n3m-g-4062b4': [
    { jp: '天気予報によれば、まもなく梅雨に入るそうだ。', reading: 'てんきよほうによれば、まもなくつゆにはいるそうだ。', en: 'According to the weather forecast, the rainy season will set in before long.', sourceId: '125087', source: 'tatoeba' },
    { jp: '天気予報によると、台風は沿岸に接近しそうだ。', reading: 'てんきよほうによると、たいふうはえんがんにせっきんしそうだ。', en: 'According to the weather forecast, the typhoon is likely to approach the coast.', sourceId: '125090', source: 'tatoeba' },
    { jp: '新聞によると名古屋に大火災があったそうです。', reading: 'しんぶんによるとなごやにだいかさいがあったそうです。', en: 'The papers say that there was a big fire in Nagoya.', sourceId: '145166', source: 'tatoeba' },
  ],
  // N3 か何か
  'n3m-g-40834a': [
    { jp: '御急ぎでなかったら、御茶か何かいかがですか。', reading: 'ごいそぎでなかったら、おちゃかなにかいかがですか。', en: 'How about a cup of tea or something, if you aren\'t in a hurry?', sourceId: '174269', source: 'tatoeba' },
    { jp: 'お急ぎでなかったら、お茶か何かいかがですか。', reading: 'おいそぎでなかったら、おちゃかなにかいかがですか。', en: 'How about cup of tea or something, if you aren\'t in a hurry?', sourceId: '227299', source: 'tatoeba' },
    { jp: '「君の友達は馬鹿か何かか」と父親はたずねた。', reading: '「きみのともだちはばかかなにかか」とちちおやはたずねた。', en: '"Is your friend an idiot, or what?" asked the father.', sourceId: '236350', source: 'tatoeba' },
  ],
  // N3 ときには
  'n3m-g-42b672': [
    { jp: '授業が終わったときには、多分雨が降っている。', reading: 'じゅぎょうがおわったときには、たぶんあめがふっている。', en: 'When class is over, it will probably be raining.', sourceId: '148353', source: 'tatoeba' },
    { jp: '友達を選ぶときには、気をつけなければならない。', reading: 'ともだちをえらぶときには、きをつけなければならない。', en: 'You must be careful in choosing your friends.', sourceId: '79284', source: 'tatoeba' },
    { jp: '部屋を出るときには、必ず電気を消してください。', reading: 'へやをでるときには、かならずでんきをけしてください。', en: 'Be sure to turn off the light when you leave the room.', sourceId: '84119', source: 'tatoeba' },
  ],
  // N3 っぱなし
  'n3m-g-44e3c3': [
    { jp: 'トムはいつも自転車を汚れっぱなしにしている。', reading: 'トムはいつもじてんしゃをよごれっぱなしにしている。', en: 'Tom always leaves his bicycle dirty.', sourceId: '200112', source: 'tatoeba' },
    { jp: 'トムは一晩中テレビをつけっぱなしにしていた。', reading: 'トムはひとばんじゅうテレビをつけっぱなしにしていた。', en: 'Tom left the TV on all night.', sourceId: '8963913', source: 'tatoeba' },
    { jp: '彼は本を家のあちこちに散らかしっぱなしにした。', reading: 'かれはほんをいえのあちこちにちらかしっぱなしにした。', en: 'He left his books all around the house.', sourceId: '99912', source: 'tatoeba' },
  ],
  // N3 そしたら
  'n3m-g-45045b': [
    { jp: 'そしたら横転したの手伝ってやっからよ。', reading: 'そしたらおうてんしたのてつだってやっからよ。', en: 'Then I\'ll help you overturn the wagon.', sourceId: '237473', source: 'tatoeba' },
    { jp: 'そしたらみんなが教えてくれるでしょう？', reading: 'そしたらみんながおしえてくれるでしょう？', en: 'If I do that, will everybody teach me?', sourceId: '347285', source: 'tatoeba' },
    { jp: '急いで、そしたら間に合うって。', reading: 'いそいで、そしたらまにあうって。', en: 'Hurry up, and you will be on time.', sourceId: '9550219', source: 'tatoeba' },
  ],
  // N3 なんと～のだろう
  'n3m-g-45b0c8': [
    { jp: '株に手を出すなんて彼女はなんと愚かなのだろう。', reading: 'かぶにてをだすなんてかのじょはなんとおろかなのだろう。', en: 'What a fool she is to dabble in stocks!', sourceId: '184092', source: 'tatoeba' },
    { jp: 'マイクは、自分はなんと不注意なのだろうと言った。', reading: 'マイクは、じぶんはなんとふちゅういなのだろうといった。', en: 'Mike said that he was very careless.', sourceId: '195777', source: 'tatoeba' },
    { jp: '彼女は料理がなんと上手なのだろう。', reading: 'かのじょはりょうりがなんとじょうずなのだろう。', en: 'How well she cooks!', sourceId: '86270', source: 'tatoeba' },
  ],
  // N3 はずだ/はずがない
  'n3m-g-45f12f': [
    { jp: '彼女は１時間前に出たので、今そこにいるはずだ。', reading: 'かのじょは[１|]じかんまえにでたので、いまそこにいるはずだ。', en: 'She should be there now because she left an hour ago.', sourceId: '93618', source: 'tatoeba' },
    { jp: '彼らは今頃にはそこに到着していてもよいはずだが。', reading: 'かれらはいまごろにはそこにとうちゃくしていてもよいはずだが。', en: 'They ought to have reached there by now.', sourceId: '97143', source: 'tatoeba' },
    { jp: '彼は途中できっと私たちのところに立ち寄るはずだ。', reading: 'かれはとちゅうできっとわたしたちのところにたちよるはずだ。', en: 'He is bound to drop in on us on his way.', sourceId: '101865', source: 'tatoeba' },
  ],
  // N3 など～ない
  'n3m-g-47594f': [
    { jp: '他の国から完全に独立して存在できる国などない。', reading: 'たのくにからかんぜんにどくりつしてそんざいできるくになどない。', en: 'No nation can exist completely isolated from others.', sourceId: '138623', source: 'tatoeba' },
    { jp: '私は怒ってなどいない、それどころではない。', reading: 'わたしはおこってなどいない、それどころではない。', en: 'I am not angry, far from it.', sourceId: '154891', source: 'tatoeba' },
    { jp: '彼は教師ではない、まして学者などではない。', reading: 'かれはきょうしではない、ましてがくしゃなどではない。', en: 'He is not a teacher, much less a scholar.', sourceId: '108339', source: 'tatoeba' },
  ],
  // N3 ところから
  'n3m-g-484cc8': [
    { jp: '先週止めたところからまた読み始めましょう。', reading: 'せんしゅうやめたところからまたよみはじめましょう。', en: 'Let\'s resume reading where we left off last week.', sourceId: '141817', source: 'tatoeba' },
    { jp: '私達の立っているところから琵琶湖が見えた。', reading: 'わたしたちのたっているところからびわこがみえた。', en: 'Lake Biwa could be seen from where we were standing.', sourceId: '151921', source: 'tatoeba' },
    { jp: '離れたところから見ると、それは人間の様に見える。', reading: 'はなれたところからみると、それはにんげんのようにみえる。', en: 'Seen from a distance, it looks like a man.', sourceId: '78341', source: 'tatoeba' },
  ],
  // N3 なんだか
  'n3m-g-49185a': [
    { jp: '「いい人ね。なんだか気が合いそう」「だろうな」', reading: '「いいひとね。なんだかきがあいそう」「だろうな」', en: '"Isn\'t she nice? I think we\'ll get on just fine." "Same here."', sourceId: '74873', source: 'tatoeba' },
    { jp: 'なんだか今夜は遅くまで残業になりそうだわ。', reading: 'なんだかこんやはおそくまでざんぎょうになりそうだわ。', en: 'Looks like I might have to burn the midnight oil tonight.', sourceId: '198953', source: 'tatoeba' },
    { jp: 'そんな服で出掛けるの？なんだかカッコ悪いなあ。', reading: 'そんなふくででかけるの？なんだかカッコわるいなあ。', en: 'Going out with those clothes? They look kinda bad.', sourceId: '899600', source: 'tatoeba' },
  ],
  // N3 もの/もん/んだもの/んだもん
  'n3m-g-495766': [
    { jp: '欲しいものがみつかると、決まって高いものだ。', reading: 'ほしいものがみつかると、きまってたかいものだ。', en: 'Whenever I find something I like, it\'s too expensive.', sourceId: '4793', source: 'tatoeba' },
    { jp: 'インコを飼うために必要なものを揃えましょう。', reading: 'インコをかうためにひつようなものをそろえましょう。', en: 'Let\'s get what we need to keep a parrot.', sourceId: '74283', source: 'tatoeba' },
    { jp: '三つ子の魂百までとは本当によく言ったものだ。', reading: 'みつごのたましいひゃくまでとはほんとうによくいったものだ。', en: '\'The child is father to the man\' is certainly well said.', sourceId: '75212', source: 'tatoeba' },
  ],
  // N3 どうも ... そうだ/ ようだ/ らしい
  'n3m-g-4a9ba6': [
    { jp: '数学は恋のようだ。単純だけど複雑にもなりうる。', reading: 'すうがくはこいのようだ。たんじゅんだけどふくざつにもなりうる。', en: 'Math is like love: a simple idea, but it can get complicated.', sourceId: '4984', source: 'tatoeba' },
    { jp: '隣の人が若い女の人と不倫しているらしいよ。', reading: 'となりのひとがわかいおんなのひととふりんしているらしいよ。', en: 'Did you hear that our neighbor was fooling around with a younger woman?', sourceId: '77769', source: 'tatoeba' },
    { jp: '欲に目がくらんで判断力が無くなったらしい。', reading: 'よくにめがくらんではんだんりょくがなくなったらしい。', en: 'Greed seems to have blinded his good judgement.', sourceId: '78769', source: 'tatoeba' },
  ],
  // N3 なにより
  'n3m-g-4b66ae': [
    { jp: 'なによりもまず、今君は働かなければならない。', reading: 'なによりもまず、いまくんははたらかなければならない。', en: 'Above all, you must work now.', sourceId: '199094', source: 'tatoeba' },
    { jp: '人はなによりもまずその外見によって判断される。', reading: 'ひとはなによりもまずそのがいけんによってはんだんされる。', en: 'One will be judged by one\'s appearance first of all.', sourceId: '144547', source: 'tatoeba' },
    { jp: '私はなによりもまずこの辞書を手に入れたい。', reading: 'わたしはなによりもまずこのじしょをてにいれたい。', en: 'I want to have this dictionary most of all.', sourceId: '159204', source: 'tatoeba' },
  ],
  // N3 ておられる
  'n3m-g-4cc658': [
    { jp: '父上、何をしておられるのか。', reading: 'ちちうえ、なにをしておられるのか。', en: 'What are you doing, Dad?', sourceId: '84315', source: 'tatoeba' },
  ],
  // N3 させていただく
  'n3m-g-4da6a7': [
    { jp: '私どもはＳＴＬ＃３４５６１０セットについて５％の特別値引きをさせていただく用意があります。', reading: 'わたしどもは[ＳＴＬ|][＃|][３|][４|][５|][６|][１|][０|]セットについて[５|]ぱーせんとのとくべつねびきをさせていただくよういがあります。', en: 'We would be prepared to grant you a special discount of 5% for the quantity of 10 sets of STL#3456.', sourceId: '164901', source: 'tatoeba' },
  ],
  // N3 それと/あと
  'n3m-g-4f17d6': [
    { jp: 'ここ、結構パスタがいけるのよ。あとピザも。', reading: 'ここ、けっこうパスタがいけるのよ。あとピザも。', en: 'The pasta here\'s pretty good. And the pizza too.', sourceId: '76767', source: 'tatoeba' },
    { jp: '彼女は手紙を読んだあとで、それを細かく破った。', reading: 'かのじょはてがみをよんだあとで、それをこまかくやぶった。', en: 'After she had read the letter, she tore it to pieces.', sourceId: '88810', source: 'tatoeba' },
    { jp: '彼女はその手紙を読んだあと破いてしまった。', reading: 'かのじょはそのてがみをよんだあとやぶいてしまった。', en: 'She tore the letter up after reading it.', sourceId: '92422', source: 'tatoeba' },
  ],
  // N3 ～には～の～がある
  'n3m-g-4fe524': [
    { jp: '片方の手には５本の指がある。', reading: 'かたほうのてにはごほんのゆびがある。', en: 'We have five fingers on each hand.', sourceId: '83367', source: 'tatoeba' },
    { jp: '彼の失敗には、２、３の理由があるように思われる。', reading: 'かれのしっぱいには、[２|]、[３|]のりゆうがあるようにおもわれる。', en: 'There seem to be several reasons for his failure.', sourceId: '117119', source: 'tatoeba' },
    { jp: '彼の学問的な業績には感銘を与えるものがある。', reading: 'かれのがくもんてきなぎょうせきにはかんめいをあたえるものがある。', en: 'His academic achievements are impressive.', sourceId: '117874', source: 'tatoeba' },
  ],
  // N3 …はずだった
  'n3m-g-5046c2': [
    { jp: '私たちは昨日の午後トムを手伝うはずだった。', reading: 'わたしたちはきのうのごごトムをてつだうはずだった。', en: 'We were supposed to help Tom yesterday afternoon.', sourceId: '2070901', source: 'tatoeba' },
    { jp: '我々は彼に事実を話すべきはずだったのに。', reading: 'われわれはかれにじじつをはなすべきはずだったのに。', en: 'We should have told him the truth.', sourceId: '185623', source: 'tatoeba' },
    { jp: 'その国際会議は今年の２月に開催されるはずだった。', reading: 'そのこくさいかいぎはことしのにがつにかいさいされるはずだった。', en: 'The international conference was to be held in February this year.', sourceId: '210565', source: 'tatoeba' },
  ],
  // N3 なんとかなる
  'n3m-g-51ee4e': [
    { jp: '元気を出せ。そのうちなんとかなる。', reading: 'げんきをしゅっせ。そのうちなんとかなる。', en: 'Cheer up! It will soon come out all right.', sourceId: '175026', source: 'tatoeba' },
    { jp: 'なんとかなるかな？', reading: 'なんとかなるかな？', en: 'Will I make it through?', sourceId: '1571063', source: 'tatoeba' },
    { jp: 'なんとかなるさ。', reading: 'なんとかなるさ。', en: 'We\'ll manage somehow.', sourceId: '10580672', source: 'tatoeba' },
  ],
  // N3 どんなに…だろう(か)
  'n3m-g-537fa5': [
    { jp: '人生をやり直せたらどんなにいいだろう。', reading: 'じんせいをやりなおせたらどんなにいいだろう。', en: 'How I wish I could live my life again.', sourceId: '143967', source: 'tatoeba' },
    { jp: '10ヶ国語を話せたらどんなにかっこいいだろう！', reading: '[1|][0|]かこくごをはなせたらどんなにかっこいいだろう！', en: 'It would be so cool if I could speak ten languages!', sourceId: '5126', source: 'tatoeba' },
    { jp: '車があればどんなによいだろう。', reading: 'くるまがあればどんなによいだろう。', en: 'How I wish I had a car.', sourceId: '149148', source: 'tatoeba' },
  ],
  // N3 必ずしも～とは限らない
  'n3m-g-5486c5': [
    { jp: '長年抱いていた夢が必ずしも叶うとは限らない。', reading: 'ながねんだいていたゆめがかならずしもかなうとはかぎらない。', en: 'Long-cherished dreams don\'t always come true.', sourceId: '125855', source: 'tatoeba' },
    { jp: '身体の大きな男が必ずしも強い男とは限らない。', reading: 'しんたいのおおきなおとこがかならずしもつよいおとことはかぎらない。', en: 'Big men are not necessarily strong men.', sourceId: '144735', source: 'tatoeba' },
    { jp: '近頃では、結婚の動機は必ずしも純粋とは限らない。', reading: 'ちかごろでは、けっこんのどうきはかならずしもじゅんすいとはかぎらない。', en: 'These days, the motives for marriage are not necessarily pure.', sourceId: '179849', source: 'tatoeba' },
  ],
  // N3 といっても
  'n3m-g-55006c': [
    { jp: '彼の作品を知っているといってもほんの少しです。', reading: 'かれのさくひんをしっているといってもほんのしょうしです。', en: 'My acquaintance with his works is slight.', sourceId: '117264', source: 'tatoeba' },
    { jp: '宿屋といってもまるで丸太小屋のようだった。', reading: 'やどやといってもまるでまるたごやのようだった。', en: 'The inn was no better than a log cabin.', sourceId: '147897', source: 'tatoeba' },
    { jp: '現代は原子力時代だといっても過言ではない。', reading: 'げんだいはげんしりょくじだいだといってもかごんではない。', en: 'It is not too much to say that this is the atomic age.', sourceId: '174841', source: 'tatoeba' },
  ],
  // N3 お...になる
  'n3m-g-564873': [
    { jp: 'みなさんフランス語をお話になるんですよね？', reading: 'みなさんフランスごをおはなしになるんですよね？', en: 'All of you speak French, right?', sourceId: '3597359', source: 'tatoeba' },
    { jp: 'ゆうべはおいでになるかとお待ちしていました。', reading: 'ゆうべはおいでになるかとおまちしていました。', en: 'I was expecting you last night.', sourceId: '192993', source: 'tatoeba' },
    { jp: 'いつあなたはお帰りになるのか教えてください。', reading: 'いつあなたはおかえりになるのかおしえてください。', en: 'Please tell me when you are coming back.', sourceId: '229042', source: 'tatoeba' },
  ],
  // N3 瞬間
  'n3m-g-596dff': [
    { jp: '私は転んだ瞬間に手首を折ったことが分かった。', reading: 'わたしはころんだしゅんかんにてくびをおったことがわかった。', en: 'I knew I\'d broken my wrist the moment I fell.', sourceId: '76082', source: 'tatoeba' },
    { jp: '僕は会った瞬間に彼女を好きになってしまった。', reading: 'ぼくはあったしゅんかんにかのじょをすきになってしまった。', en: 'I took to her the moment I met her.', sourceId: '81978', source: 'tatoeba' },
    { jp: '彼女がバスを降りた瞬間に私は彼女に気づいた。', reading: 'かのじょがバスをおりたしゅんかんにわたしはかのじょにきづいた。', en: 'I noticed her the moment she got off the bus.', sourceId: '95582', source: 'tatoeba' },
  ],
  // N3 もし~としても
  'n3m-g-59fc38': [
    { jp: 'もしあした雨が降ったとしてもピクニックに行きますか。', reading: 'もしあしたうがふったとしてもピクニックにいきますか。', en: 'Suppose it rains tomorrow, shall we still go on the picnic?', sourceId: '193931', source: 'tatoeba' },
  ],
  // N3 いずれも
  'n3m-g-5a31fc': [
    { jp: '大手デパートのいずれもが売り上げを落とした。', reading: 'おおてデパートのいずれもがうりあげをおとした。', en: 'Sales have dropped off at every big department store.', sourceId: '1219270', source: 'tatoeba' },
    { jp: '私たちは三度試みたが、いずれも失敗した。', reading: 'わたしたちはさんどこころみたが、いずれもしっぱいした。', en: 'We had three tries and failed each time.', sourceId: '165747', source: 'tatoeba' },
    { jp: 'わたしは彼らのいずれも知らない。', reading: 'わたしはかれらのいずれもしらない。', en: 'I don\'t know either of them.', sourceId: '1143290', source: 'tatoeba' },
  ],
  // N3 それこそ
  'n3m-g-5a35bd': [
    { jp: 'これ以上待つのは、それこそ時間の浪費だ。', reading: 'これいじょうまつのは、それこそじかんのろうひだ。', en: 'It\'s an absolute waste of time to wait any longer.', sourceId: '217574', source: 'tatoeba' },
    { jp: 'いまさら嘆いても、それこそ、後の祭だよ。', reading: 'いまさらなげいても、それこそ、あとのまつりだよ。', en: 'You can regret it all you want, but it won\'t do you any good now.', sourceId: '228552', source: 'tatoeba' },
    { jp: 'それこそ、英国民が女王に期待していることなのです。', reading: 'それこそ、えいこくみんがじょおうにきたいしていることなのです。', en: 'That is what the British people expect of their Queen.', sourceId: '205825', source: 'tatoeba' },
  ],
  // N3 じゃないか / ではないか
  'n3m-g-5a43c1': [
    { jp: '彼女は彼が事故に遭うのではないかと心配した。', reading: 'かのじょはかれがじこにあうのではないかとしんぱいした。', en: 'She was afraid of his having an accident.', sourceId: '87492', source: 'tatoeba' },
    { jp: '彼は弟が失敗するのではないかと心配している。', reading: 'かれはおとうとがしっぱいするのではないかとしんぱいしている。', en: 'He has a fear that his brother will fail.', sourceId: '101982', source: 'tatoeba' },
    { jp: '彼は死んでいるのではないかと危ぶまれている。', reading: 'かれはしんでいるのではないかとあやぶまれている。', en: 'They fear that he may be dead.', sourceId: '106454', source: 'tatoeba' },
  ],
  // N3 少しも～ない/ちっとも～ない
  'n3m-g-5aeb9b': [
    { jp: '彼女には詩人らしいところは少しもない。', reading: 'かのじょにはしじんらしいところはすこしもない。', en: 'She is nothing of a poet.', sourceId: '94944', source: 'tatoeba' },
    { jp: '彼はたくさん本を持っているが少しも賢くない。', reading: 'かれはたくさんほんをもっているがすこしもかしこくない。', en: 'He may own a lot of books but there\'s not an intelligent bone in his body.', sourceId: '112054', source: 'tatoeba' },
    { jp: '彼女は魚がひどく嫌いで、少しも食べない。', reading: 'かのじょはさかながひどくきらいで、すこしもたべない。', en: 'She hates fish and never eats any.', sourceId: '90495', source: 'tatoeba' },
  ],
  // N3 なぜなら(ば)/なぜかというと/どうしてかというと/なぜかといえば
  'n3m-g-5c5344': [
    { jp: 'なぜなら彼の家にはお金が必要だったからです。', reading: 'なぜならかれのいえにはおかねがひつようだったからです。', en: 'Why? Because his family needed the money, that\'s why.', sourceId: '199222', source: 'tatoeba' },
    { jp: 'なぜなら私は古い言語を学んでいる学生だから。', reading: 'なぜならわたしはふるいげんごをまなんでいるがくせいだから。', en: 'Because I am a student of old languages.', sourceId: '199230', source: 'tatoeba' },
    { jp: '私は山に登る、なぜならそれがそこにあるからだ。', reading: 'わたしはやまにのぼる、なぜならそれがそこにあるからだ。', en: 'I climb mountains because they are there.', sourceId: '156657', source: 'tatoeba' },
  ],
  // N3 そうすると
  'n3m-g-5c8d57': [
    { jp: 'そうすると金がその２倍かかるだろう。', reading: 'そうするときんがその[２|]ばいかかるだろう。', en: 'It would cost twice as much as that.', sourceId: '213872', source: 'tatoeba' },
    { jp: 'そうするといやが上にも美しく見える。', reading: 'そうするといやがうえにもうつくしくみえる。', en: 'That makes you even more attractive.', sourceId: '213874', source: 'tatoeba' },
    { jp: 'トムはメアリーがそうすると予測した。', reading: 'トムはメアリーがそうするとよそくした。', en: 'Tom thought Mary would do that.', sourceId: '10500836', source: 'tatoeba' },
  ],
  // N3 ところによると / よれば
  'n3m-g-5f1430': [
    { jp: '天気予報によれば、まもなく梅雨に入るそうだ。', reading: 'てんきよほうによれば、まもなくつゆにはいるそうだ。', en: 'According to the weather forecast, the rainy season will set in before long.', sourceId: '125087', source: 'tatoeba' },
    { jp: '今日の新聞によれば、台風がやってくるそうだ。', reading: 'きょうのしんぶんによれば、たいふうがやってくるそうだ。', en: 'Today\'s paper says that a typhoon is coming.', sourceId: '171883', source: 'tatoeba' },
    { jp: '彼のいうところによれば、彼女は正直な女だ。', reading: 'かれのいうところによれば、かのじょはしょうじきなおんなだ。', en: 'According to him, she is honest.', sourceId: '118423', source: 'tatoeba' },
  ],
  // N3 もしかすると/もしかしたら～かもしれない
  'n3m-g-5f855c': [
    { jp: 'もしかすると明日雨が降るかもしれない。', reading: 'もしかするとあしたうがふるかもしれない。', en: 'It might rain tomorrow.', sourceId: '193877', source: 'tatoeba' },
    { jp: 'もしかすると彼は明日来るかもしれない。', reading: 'もしかするとかれはあしたくるかもしれない。', en: 'He might come tomorrow.', sourceId: '193878', source: 'tatoeba' },
    { jp: 'もしかすると彼が来るかも。', reading: 'もしかするとかれがくるかも。', en: 'Perhaps he will come.', sourceId: '541935', source: 'tatoeba' },
  ],
  // N3 てもらえないか
  'n3m-g-6036dc': [
    { jp: '次の日曜日ぼくとつき合ってもらえないかな。', reading: 'つぎのにちようびぼくとつきあってもらえないかな。', en: 'I wonder if you\'d like to go out with me this Sunday.', sourceId: '150235', source: 'tatoeba' },
    { jp: 'しばらく君のとこに泊めてもらえないかなあ。', reading: 'しばらくきみのとこにとめてもらえないかなあ。', en: 'I was wondering if you\'d let me stay with you for a few days.', sourceId: '216101', source: 'tatoeba' },
    { jp: 'このデータを最終チェックしてもらえないか。', reading: 'このデータをさいしゅうチェックしてもらえないか。', en: 'Could you give this data a final check for me?', sourceId: '223545', source: 'tatoeba' },
  ],
  // N3 とんでもない
  'n3m-g-6212f5': [
    { jp: '彼女は昨夜とんでもない時間に電話してきた。', reading: 'かのじょはさくやとんでもないじかんにでんわしてきた。', en: 'She called me at an unearthly hour last night.', sourceId: '89865', source: 'tatoeba' },
    { jp: 'トムがとんでもない二日酔いをしてしまいました。', reading: 'トムがとんでもないふつかよいをしてしまいました。', en: 'Tom had a hideous hangover.', sourceId: '1269037', source: 'tatoeba' },
    { jp: '「終わった？」「とんでもない。始めてもないよ」', reading: '「おわった？」「とんでもない。はじめてもないよ」', en: '"Have you finished?" "On the contrary. I haven\'t even started."', sourceId: '9086518', source: 'tatoeba' },
  ],
  // N3 …ほどの…ではない
  'n3m-g-628f07': [
    { jp: '彼はまだ一人暮らしできるほどの年ではない。', reading: 'かれはまだひとりぐらしできるほどのとしではない。', en: 'He is not old enough to live alone.', sourceId: '110842', source: 'tatoeba' },
    { jp: '彼はこの事がわからないほどの馬鹿ではない。', reading: 'かれはこのことがわからないほどのばかではない。', en: 'He is not so foolish but he can understand this.', sourceId: '113769', source: 'tatoeba' },
    { jp: '彼は自分の生命の危険を及ぼすほどの馬鹿ではない。', reading: 'かれはじぶんのせいめいのきけんをおよぼすほどのばかではない。', en: 'He isn\'t such a fool as to risk his life.', sourceId: '104890', source: 'tatoeba' },
  ],
  // N3 なにがなんでも
  'n3m-g-64abd6': [
    { jp: 'なにがなんでも、彼女は明日手術を受けるでしょう。', reading: 'なにがなんでも、かのじょはあしたしゅじゅつをうけるでしょう。', en: 'For better or worse, she will have the operation tomorrow.', sourceId: '199113', source: 'tatoeba' },
    { jp: '私たちはなにがなんでも勝ちたかった。', reading: 'わたしたちはなにがなんでもかちたかった。', en: 'We wanted to win at all costs.', sourceId: '7560867', source: 'tatoeba' },
  ],
  // N3 さえ/でさえ
  'n3m-g-667e7d': [
    { jp: '彼は敵対者にさえ新しい経済計画に同意させた。', reading: 'かれはてきたいしゃにさえあたらしいけいざいけいかくにどういさせた。', en: 'He got even his opponents to agree to the new economic plan.', sourceId: '101958', source: 'tatoeba' },
    { jp: '食べすぎさえしなければ、必ず痩せると思います。', reading: 'たべすぎさえしなければ、かならずやせるとおもいます。', en: 'I think that as long as I don\'t overeat, I will certainly lose weight.', sourceId: '75502', source: 'tatoeba' },
    { jp: '彼女は私に「おはよう」とさえ言わなかった。', reading: 'かのじょはわたしに「おはよう」とさえいわなかった。', en: 'She did not so much as say "Good morning" to me.', sourceId: '89588', source: 'tatoeba' },
  ],
  // N3 もしも~なら
  'n3m-g-66970b': [
    { jp: 'もしも叶うなら、私は失った時間の埋め合わせをしたい。', reading: 'もしもかなうなら、わたしはうしなったじかんのうめあわせをしたい。', en: 'If I could have a wish, I\'d wish I could make up for lost time.', sourceId: '193789', source: 'tatoeba' },
    { jp: 'もしも明日晴れなら私たちはピクニックに行くでしょう。', reading: 'もしもあしたばれならわたしたちはピクニックにいくでしょう。', en: 'If it is sunny tomorrow, we will go on a picnic.', sourceId: '193774', source: 'tatoeba' },
    { jp: 'もしも私が生まれ変わるなら、鳥になりたい。', reading: 'もしもわたしがうまれかわるなら、とりになりたい。', en: 'If I were to be reborn, I would like to be a bird.', sourceId: '193787', source: 'tatoeba' },
  ],
  // N3 かなんか
  'n3m-g-66adcc': [
    { jp: 'トマトかなんかの赤いソースがかかってるよ。', reading: 'トマトかなんかのあかいソースがかかってるよ。', en: 'It\'s got a red sauce on it, like tomato sauce or something.', sourceId: '11001491', source: 'tatoeba' },
  ],
  // N3 だとしたら
  'n3m-g-674a41': [
    { jp: 'もし今日が地球最後の日だとしたら、何をする？', reading: 'もしきょうがちきゅうさいごのひだとしたら、なにをする？', en: 'What would you do if this was your last day on Earth?', sourceId: '8875128', source: 'tatoeba' },
    { jp: 'それと俺がホモだとしたら、罪になるわけ？', reading: 'それとおれがホモだとしたら、つみになるわけ？', en: 'And if I were gay, would that be a crime?', sourceId: '531277', source: 'tatoeba' },
    { jp: '今じゃないんだとしたら、いつなのよ？', reading: 'いまじゃないんだとしたら、いつなのよ？', en: 'If not now, then when?', sourceId: '9919812', source: 'tatoeba' },
  ],
  // N3 もし～としても/もし～としたって
  'n3m-g-6a2f94': [
    { jp: 'もしあした雨が降ったとしてもピクニックに行きますか。', reading: 'もしあしたうがふったとしてもピクニックにいきますか。', en: 'Suppose it rains tomorrow, shall we still go on the picnic?', sourceId: '193931', source: 'tatoeba' },
  ],
  // N3 たとえ~ても
  'n3m-g-6bc85d': [
    { jp: 'たとえ忙しくてもあなたは約束を守るべきである。', reading: 'たとえいそがしくてもあなたはやくそくをまもるべきである。', en: 'Even if you are busy, you should keep your promise.', sourceId: '203453', source: 'tatoeba' },
    { jp: 'たとえ困っていても、マックはいつも楽天的だ。', reading: 'たとえこまっていても、マックはいつもらくてんてきだ。', en: 'Even if he is in trouble, Mac is always optimistic.', sourceId: '203493', source: 'tatoeba' },
    { jp: 'たとえ雨が降っても、明日の朝早く出発します。', reading: 'たとえあめがふっても、あしたのあさはやくしゅっぱつします。', en: 'Even if it rains, I will start early tomorrow morning.', sourceId: '203524', source: 'tatoeba' },
  ],
  // N3 別に～ない
  'n3m-g-6c7e8c': [
    { jp: '文学に今求めるものって別にないのだが。', reading: 'ぶんがくにいまもとめるものってべつにないのだが。', en: 'I don\'t really have a need for literature right now.', sourceId: '1144782', source: 'tatoeba' },
    { jp: 'あの人たちが何言ったって、別に気にならないよ。', reading: 'あのひとたちがなにいったって、べつにきにならないよ。', en: 'I don\'t care about what they say.', sourceId: '9151955', source: 'tatoeba' },
    { jp: 'マニュアルを読むのは、別にどうってことないよ。', reading: 'マニュアルをよむのは、べつにどうってことないよ。', en: 'I don\'t mind reading manuals.', sourceId: '8961471', source: 'tatoeba' },
  ],
  // N3 全く～ない
  'n3m-g-6d3280': [
    { jp: '彼の態度には銀行家らしいところが全くない。', reading: 'かれのたいどにはぎんこうからしいところがまったくない。', en: 'There is nothing of the banker in his bearing.', sourceId: '116572', source: 'tatoeba' },
    { jp: '彼は私に、お金が全くないことを証明した。', reading: 'かれはわたしに、おかねがまったくないことをしょうめいした。', en: 'He explained to me that he had no money.', sourceId: '106246', source: 'tatoeba' },
    { jp: '彼には片親の家族に対する同情が全くない。', reading: 'かれにはかたおやのかぞくにたいするどうじょうがまったくない。', en: 'He has no sympathy for single parent families.', sourceId: '118751', source: 'tatoeba' },
  ],
  // N3 ても～れない
  'n3m-g-6d4e65': [
    { jp: '彼にはいくら感謝してもしきれない気持ちだ。', reading: 'かれにはいくらかんしゃしてもしきれないきもちだ。', en: 'I cannot thank him enough.', sourceId: '119012', source: 'tatoeba' },
    { jp: 'あなたには感謝してもしきれないくらいだ。', reading: 'あなたにはかんしゃしてもしきれないくらいだ。', en: 'I can\'t thank you enough.', sourceId: '233756', source: 'tatoeba' },
    { jp: 'たくさん作っても捌ききれないから、控えめにね。', reading: 'たくさんつくってもさばききれないから、ひかえめにね。', en: 'If you make too many, we won\'t be able to sell them all, so don\'t go wild.', sourceId: '76582', source: 'tatoeba' },
  ],
  // N3 ちゃった
  'n3m-g-6e22dc': [
    { jp: 'ママー、私の鼻クソはどこに行っちゃったの？？', reading: 'ママー、わたしのはなクソはどこにいっちゃったの？？', en: 'Mommy, where\'s my booger?', sourceId: '195321', source: 'tatoeba' },
    { jp: 'このＴシャツが気に入って３枚も買っちゃった。', reading: 'このてぃーシャツがきにいって[３|]まいもかっちゃった。', en: 'I liked these T-shirts, and I bought three of them.', sourceId: '224045', source: 'tatoeba' },
    { jp: 'ケーキ？僕、突然またお腹が空いちゃった！！', reading: 'ケーキ？ぼく、とつぜんまたおなかがあいちゃった！！', en: 'Cake? I\'m suddenly hungry again.', sourceId: '225329', source: 'tatoeba' },
  ],
  // N3 つもりだった
  'n3m-g-6e9e33': [
    { jp: '彼女は銀行から貯金を全部おろすつもりだった。', reading: 'かのじょはぎんこうからちょきんをぜんぶおろすつもりだった。', en: 'She intended to withdraw all her savings from the bank.', sourceId: '90381', source: 'tatoeba' },
    { jp: '彼は街を出ていく前に彼女に会うつもりだった。', reading: 'かれはまちをでていくまえにかのじょにあうつもりだった。', en: 'He expected to have seen her before he went out of town.', sourceId: '108922', source: 'tatoeba' },
    { jp: '昨日あなたをお訪ねするつもりだったのですが。', reading: 'きのうあなたをおたずねするつもりだったのですが。', en: 'I had intended to visit you yesterday.', sourceId: '170125', source: 'tatoeba' },
  ],
  // N3 ご...になる
  'n3m-g-6f3b42': [
    { jp: 'この時計は１５分ごとになる。', reading: 'このとけいは[１|][５|]ふんごとになる。', en: 'This clock strikes the quarter hour.', sourceId: '221619', source: 'tatoeba' },
    { jp: '前のご主人にお会いになる勇気がありますか。', reading: 'まえのごしゅじんにおあいになるゆうきがありますか。', en: 'Do you feel equal to meeting your ex-husband?', sourceId: '140990', source: 'tatoeba' },
    { jp: '今イタリアにいらっしゃるのですから、ナポリはご覧になるべきですよ。', reading: 'いまイタリアにいらっしゃるのですから、ナポリはごらんになるべきですよ。', en: 'Now that you are in Italy, you must see Naples.', sourceId: '3401041', source: 'tatoeba' },
  ],
  // N3 またもや
  'n3m-g-6f625f': [
    { jp: 'あなたの行いはまたもや厄介なことを引き起こした。', reading: 'あなたのおこないはまたもややっかいなことをひきおこした。', en: 'Your conduct gave rise to another problem.', sourceId: '233298', source: 'tatoeba' },
    { jp: 'またもや、バスが遅れてる。', reading: 'またもや、バスがおくれてる。', en: 'The bus is late again.', sourceId: '11909868', source: 'tatoeba' },
  ],
  // N3 ちょっと…ない
  'n3m-g-7072b5': [
    { jp: 'それ以上の仕事はちょっと見つからないだろう。', reading: 'それいじょうのしごとはちょっとみつからないだろう。', en: 'You won\'t find a better job in a hurry.', sourceId: '204498', source: 'tatoeba' },
    { jp: 'すみません、今ちょっと手が離せないんです。', reading: 'すみません、いまちょっとてがはなせないんです。', en: 'Sorry, I\'ve got my hands full now.', sourceId: '214197', source: 'tatoeba' },
    { jp: '名前はちょっとわからないんですけど。', reading: 'なまえはちょっとわからないんですけど。', en: 'I\'m not sure of the name.', sourceId: '80780', source: 'tatoeba' },
  ],
  // N3 …ば…ところだ（った）
  'n3m-g-714604': [
    { jp: '駅へ着いてみたら、列車は出たばかりのところだった。', reading: 'えきへついてみたら、れっしゃはでたばかりのところだった。', en: 'I got to the station only to find that the train had just left.', sourceId: '188868', source: 'tatoeba' },
  ],
  // N3 ひじょうに
  'n3m-g-727eaa': [
    { jp: '私たちはひじょうに悲しいときに泣きます。', reading: 'わたしたちはひじょうにかなしいときになきます。', en: 'We cry when we are very sad.', sourceId: '166225', source: 'tatoeba' },
    { jp: '彼は、ひじょうに、きちょうめんな人なので、なにをしても、しめくくりをきちんとつける。', reading: 'かれは、ひじょうに、きちょうめんなひとなので、なにをしても、しめくくりをきちんとつける。', en: 'Being a very particular person he always ties up loose ends whatever he does.', sourceId: '115619', source: 'tatoeba' },
  ],
  // N3 ことは~が
  'n3m-g-742ad6': [
    { jp: '君が次に分かることは君が新聞に載るってことだ。', reading: 'きみがつぎにわかることはきみがしんぶんにのるってことだ。', en: 'Next thing you know, you\'ll be in the papers.', sourceId: '4865', source: 'tatoeba' },
    { jp: '彼女は来ることは来たが、長くはいなかった。', reading: 'かのじょはくることはきたが、ながくはいなかった。', en: 'She did come, but didn\'t stay long.', sourceId: '86355', source: 'tatoeba' },
    { jp: '彼が誠実なことは私が責任を持ちます。', reading: 'かれがせいじつなことはわたしがせきにんをもちます。', en: 'I vouch for his sincerity.', sourceId: '119701', source: 'tatoeba' },
  ],
  // N3 は～で有名
  'n3m-g-759882': [
    { jp: '私たちは梅の花で有名な水戸公園を見に行った。', reading: 'わたしたちはうめのはなでゆうめいなみとこうえんをみにいった。', en: 'We visited Mito Park, which is famous for its plum blossoms.', sourceId: '165351', source: 'tatoeba' },
    { jp: '昨日、私は空港で有名な学者に会った。', reading: 'きのう、わたしはくうこうでゆうめいながくしゃにあった。', en: 'I met a famous scholar at the airport yesterday.', sourceId: '170146', source: 'tatoeba' },
    { jp: '翌朝、彼は村中で有名になっていた。', reading: 'よくあさ、かれはむらなかでゆうめいになっていた。', en: 'The next morning found him famous throughout the village.', sourceId: '78752', source: 'tatoeba' },
  ],
  // N3 はもちろん
  'n3m-g-75a83e': [
    { jp: '彼は走ることはもちろん、歩くこともできない。', reading: 'かれははしることはもちろん、あるくこともできない。', en: 'He cannot walk, let alone run.', sourceId: '102791', source: 'tatoeba' },
    { jp: '彼はもちろん私の事を社長に告げ口するだろう。', reading: 'かれはもちろんわたしのことをしゃちょうにつげぐちするだろう。', en: 'He will, no doubt, tell the boss on me.', sourceId: '110562', source: 'tatoeba' },
    { jp: 'ケンは、ギターはもちろんバイオリンも弾ける。', reading: 'ケンは、ギターはもちろんバイオリンもひける。', en: 'Ken can play the violin, not to mention the guitar.', sourceId: '225181', source: 'tatoeba' },
  ],
  // N3 その上
  'n3m-g-76f95c': [
    { jp: '彼女は英語を話し、その上スワヒリ語も話す。', reading: 'かのじょはえいごをはなし、そのうえスワヒリごもはなす。', en: 'She speaks English and also speaks Swahili.', sourceId: '91017', source: 'tatoeba' },
    { jp: '彼は英語が話せるし、その上フランス語も話せる。', reading: 'かれはえいごがはなせるし、そのうえフランスごもはなせる。', en: 'He can speak English, and French as well.', sourceId: '109738', source: 'tatoeba' },
    { jp: '彼はハンサムで、その上大変な金持ちである。', reading: 'かれはハンサムで、そのうえたいへんなかねもちである。', en: 'He is handsome, and what is more very rich.', sourceId: '111228', source: 'tatoeba' },
  ],
  // N3 結局
  'n3m-g-78d726': [
    { jp: '結局、法案は提出断念に追い込まれたのだった。', reading: 'けっきょく、ほうあんはていしゅつだんねんにおいこまれたのだった。', en: 'In the end the bill was forced into being withdrawn.', sourceId: '74182', source: 'tatoeba' },
    { jp: '彼は働きすぎて、結局は病気になってしまった。', reading: 'かれははたらきすぎて、けっきょくはびょうきになってしまった。', en: 'He worked so hard that eventually he made himself ill.', sourceId: '101677', source: 'tatoeba' },
    { jp: '不思議なことに、結局彼は本当に試験に合格した。', reading: 'ふしぎなことに、けっきょくかれはほんとうにしけんにごうかくした。', en: 'Strange to say, he did pass the exam after all.', sourceId: '85089', source: 'tatoeba' },
  ],
  // N3 おいそれと（は）…ない
  'n3m-g-78e188': [
    { jp: 'その仕事はおいそれとはできない。', reading: 'そのしごとはおいそれとはできない。', en: 'The work can\'t be done at a moment\'s notice.', sourceId: '210387', source: 'tatoeba' },
    { jp: 'おいそれと金はできるものじゃない。', reading: 'おいそれときんはできるものじゃない。', en: 'Money cannot be got at bidding.', sourceId: '227828', source: 'tatoeba' },
  ],
  // N3 ～ろと/～なと
  'n3m-g-78fea4': [
    { jp: '母は私に夜更かしするなといつも言っています。', reading: 'はははわたしによふかしするなといつもいっています。', en: 'Mother always tells me not to sit up late at night.', sourceId: '82952', source: 'tatoeba' },
    { jp: '彼は私にあまり車のスピードを出すなと言った。', reading: 'かれはわたしにあまりしゃのスピードをだすなといった。', en: 'He told me not to drive too fast.', sourceId: '106216', source: 'tatoeba' },
    { jp: '今日君は来るのかなと思っていたところだよ。', reading: 'きょうくんはくるのかなとおもっていたところだよ。', en: 'I was wondering if you were going to show up today.', sourceId: '4881', source: 'tatoeba' },
  ],
  // N3 ことによると / ばあいによると
  'n3m-g-791482': [
    { jp: 'ことによると父は次の列車で帰るかもしれません。', reading: 'ことによるとちちはつぎのれっしゃでかえるかもしれません。', en: 'My father will possibly come on the next train.', sourceId: '224092', source: 'tatoeba' },
    { jp: 'ことによると、きみにも一緒にきてもらう。', reading: 'ことによると、きみにもいっしょにきてもらう。', en: 'Maybe you\'d better come with us.', sourceId: '224093', source: 'tatoeba' },
    { jp: '彼は自分の成功を、良い教育を受けたことによると考えた。', reading: 'かれはじぶんのせいこうを、よいきょういくをうけたことによるとかんがえた。', en: 'He referred his success to the good teaching he had had.', sourceId: '104897', source: 'tatoeba' },
  ],
  // N3 うち／ないうち
  'n3m-g-79a624': [
    { jp: '瞬くうちにテニスボール大の団子が消え去った。', reading: 'しばたくうちにテニスボールだいのだんごがきえさった。', en: 'In the blink of an eye, the tennis-ball-sized dumpling had disappeared.', sourceId: '74929', source: 'tatoeba' },
    { jp: '話しているうちに、彼はだんだん興奮して来た。', reading: 'はなしているうちに、かれはだんだんこうふんしてきた。', en: 'As he talked, he got more and more excited.', sourceId: '77190', source: 'tatoeba' },
    { jp: '列車の中で、最初のうちは彼だと分からなかった。', reading: 'れっしゃのなかで、さいしょのうちはかれだとわからなかった。', en: 'I didn\'t recognize him at first on the train.', sourceId: '77535', source: 'tatoeba' },
  ],
  // N3 なんとなく
  'n3m-g-7cc81c': [
    { jp: '彼はなんとなく僕に恨みをもっているようだ。', reading: 'かれはなんとなくぼくにうらみをもっているようだ。', en: 'I don\'t know why, but he seems to have it in for me.', sourceId: '111376', source: 'tatoeba' },
    { jp: '私はなんとなく彼の家を見つけた。', reading: 'わたしはなんとなくかれのいえをみつけた。', en: 'Somehow or other I found his house.', sourceId: '159194', source: 'tatoeba' },
    { jp: 'なんとなくわかるわ、君の気持ち。', reading: 'なんとなくわかるわ、きみのきもち。', en: 'I somehow understand your feelings.', sourceId: '1329259', source: 'tatoeba' },
  ],
  // N3 いくら～ても
  'n3m-g-7cd647': [
    { jp: '試験前はいくら勉強してもしすぎることはない。', reading: 'しけんまえはいくらべんきょうしてもしすぎることはない。', en: 'You cannot work too hard before examinations.', sourceId: '151062', source: 'tatoeba' },
    { jp: '私がいくら言っても、聞こうとしないのよ。', reading: 'わたしがいくらいっても、きこうとしないのよ。', en: 'You never listen, no matter how many times I tell you.', sourceId: '168061', source: 'tatoeba' },
    { jp: '健康にはいくら注意してもしすぎることはない。', reading: 'けんこうにはいくらちゅういしてもしすぎることはない。', en: 'You cannot be too careful about your health.', sourceId: '175512', source: 'tatoeba' },
  ],
  // N3 が～なら～は～だ
  'n3m-g-7e548c': [
    { jp: '多少でも分別があるなら旅行は中止するんだな。', reading: 'たしょうでもふんべつがあるならりょこうはちゅうしするんだな。', en: 'If you have any sense, cancel the trip.', sourceId: '138278', source: 'tatoeba' },
    { jp: '彼のエラーがなかったなら我々は勝てたのだが。', reading: 'かれのエラーがなかったならわれわれはかてたのだが。', en: 'If it had not been for his error, we would have won.', sourceId: '118399', source: 'tatoeba' },
    { jp: '私の記憶が確かなら彼らはいとこ同士だ。', reading: 'わたしのきおくがたしかならかれらはいとこどうしだ。', en: 'They are cousins, if I remember rightly.', sourceId: '163870', source: 'tatoeba' },
  ],
  // N3 …たら…だろう
  'n3m-g-7eb51c': [
    { jp: '少しコショウを加えたらどうだろう。', reading: 'すこしコショウをくわえたらどうだろう。', en: 'How about adding a touch of pepper?', sourceId: '146865', source: 'tatoeba' },
    { jp: '彼女がうそをついたことを知ったら彼は怒るだろう。', reading: 'かのじょがうそをついたことをしったらかれはおこるだろう。', en: 'He will be angry to learn that she told a lie.', sourceId: '95708', source: 'tatoeba' },
    { jp: '彼はもう１度やっていたら、成功しただろうに。', reading: 'かれはもういちどやっていたら、せいこうしただろうに。', en: 'Had he tried it once more, he would have succeeded in it.', sourceId: '110641', source: 'tatoeba' },
  ],
  // N3 …というほどではない
  'n3m-g-7f1426': [
    { jp: '友達というほどではないが知り合いだ。', reading: 'ともだちというほどではないがしりあいだ。', en: 'He is not a friend, but an acquaintance.', sourceId: '79321', source: 'tatoeba' },
  ],
  // N3 …というだけで
  'n3m-g-823dc4': [
    { jp: '貧しいというだけで人を軽蔑してはいけない。', reading: 'まずしいというだけでひとをけいべつしてはいけない。', en: 'Never look down on a man merely because he is poor.', sourceId: '85201', source: 'tatoeba' },
    { jp: '身なりが貧しいからというだけで人を軽蔑するな。', reading: 'みなりがまずしいからというだけでひとをけいべつするな。', en: 'Don\'t despise a man just because he is poorly dressed.', sourceId: '144754', source: 'tatoeba' },
    { jp: '貧乏だからというだけで彼らを軽蔑してはいけない。', reading: 'びんぼうだからというだけでかれらをけいべつしてはいけない。', en: 'Don\'t look down on them just because they are poor.', sourceId: '85161', source: 'tatoeba' },
  ],
  // N3 ことにする/ことにしている
  'n3m-g-825ba9': [
    { jp: '彼女をしばらく遠くにおいておくことにするよ。', reading: 'かのじょをしばらくとおくにおいておくことにするよ。', en: 'I\'m going to keep my distance from her for a while.', sourceId: '86144', source: 'tatoeba' },
    { jp: 'ここで迷わず迂回路を取ることにする。', reading: 'ここでまよわずうかいろをとることにする。', en: 'Here I decide, without hesitating, to take the alternative route.', sourceId: '74578', source: 'tatoeba' },
    { jp: '毎朝必ずジョギングをすることにしているんだ。', reading: 'まいあさかならずジョギングをすることにしているんだ。', en: 'I make it a rule to go jogging every morning.', sourceId: '81331', source: 'tatoeba' },
  ],
  // N3 というより/というか
  'n3m-g-83a9bc': [
    { jp: '彼は学者というよりむしろ小説家であると思う。', reading: 'かれはがくしゃというよりむしろしょうせつかであるとおもう。', en: 'I think he is not so much a scholar as a novelist.', sourceId: '108841', source: 'tatoeba' },
    { jp: '彼はジャーナリストというよりはむしろ学者だ。', reading: 'かれはジャーナリストというよりはむしろがくしゃだ。', en: 'He is not so much a journalist as a scholar.', sourceId: '113546', source: 'tatoeba' },
    { jp: '彼女は美しいというよりはむしろ立派な女だ。', reading: 'かのじょはうつくしいというよりはむしろりっぱなおんなだ。', en: 'She is handsome rather than beautiful.', sourceId: '87096', source: 'tatoeba' },
  ],
  // N3 たとたん
  'n3m-g-83c2dc': [
    { jp: '彼は娘が死んだ事を聞いたとたん、泣き崩れた。', reading: 'かれはむすめがしんだことをきいたとたん、なきくずれた。', en: 'He broke down completely on hearing of his daughter\'s death.', sourceId: '99678', source: 'tatoeba' },
    { jp: '彼に会ったとたんに、彼女はわっと泣き出した。', reading: 'かれにあったとたんに、かのじょはわっとなきだした。', en: 'As soon as she met him, she burst into tears.', sourceId: '119127', source: 'tatoeba' },
    { jp: '私は彼女に会ったとたんに恋に落ちてしまった。', reading: 'わたしはかのじょにあったとたんにこいにおちてしまった。', en: 'Hardly had I met her when I fell in love with her.', sourceId: '153371', source: 'tatoeba' },
  ],
  // N3 ちゃんと
  'n3m-g-867919': [
    { jp: '理由はこうこうであるとちゃんと説明しなさい。', reading: 'りゆうはこうこうであるとちゃんとせつめいしなさい。', en: 'Explain exactly what the reasons are.', sourceId: '75666', source: 'tatoeba' },
    { jp: 'ちゃんと意識しないで気付いていたのでしょう。', reading: 'ちゃんといしきしないできづいていたのでしょう。', en: 'I expect you realised that without being conscious of it.', sourceId: '202962', source: 'tatoeba' },
    { jp: '遊びたいならちゃんとルールを決めておきなさい。', reading: 'あそびたいならちゃんとルールをきめておきなさい。', en: 'If we\'re going to play, make your mind up about the rules!', sourceId: '75089', source: 'tatoeba' },
  ],
  // N3 ていただきたい
  'n3m-g-8721b5': [
    { jp: '歯並びをきちんと直していただきたいのですが。', reading: 'はならびをきちんとなおしていただきたいのですが。', en: 'I would like to have my teeth straightened.', sourceId: '150917', source: 'tatoeba' },
    { jp: '私は皆さんにもっと時間を守っていただきたい。', reading: 'わたしはみなさんにもっとじかんをまもっていただきたい。', en: 'I\'d like you to be more punctual.', sourceId: '157935', source: 'tatoeba' },
    { jp: 'あなたには研究に専念していただきたいのです。', reading: 'あなたにはけんきゅうにせんねんしていただきたいのです。', en: 'I would have you apply yourself to your studies.', sourceId: '233751', source: 'tatoeba' },
  ],
  // N3 なん～ても
  'n3m-g-8774f7': [
    { jp: '彼女が私をだますなんてとても考えられない。', reading: 'かのじょがわたしをだますなんてとてもかんがえられない。', en: 'I can\'t conceive of her deceiving me.', sourceId: '95375', source: 'tatoeba' },
    { jp: '私はなんとしてもあの株には手を出しません。', reading: 'わたしはなんとしてもあのかぶにはてをだしません。', en: 'I wouldn\'t touch that stock with a ten-foot pole.', sourceId: '159195', source: 'tatoeba' },
    { jp: '彼はなんとしても成功したいと願っている。', reading: 'かれはなんとしてもせいこうしたいとねがっている。', en: 'He is eager for success.', sourceId: '111378', source: 'tatoeba' },
  ],
  // N3 てくれと
  'n3m-g-88590b': [
    { jp: '彼は彼女に、後ほど電話をかけてくれと頼んだ。', reading: 'かれはかのじょに、のちほどでんわをかけてくれとたのんだ。', en: 'He asked her to call him later.', sourceId: '101056', source: 'tatoeba' },
    { jp: '私は彼にここに６時までにいてくれとたのんだ。', reading: 'わたしはかれにここに[６|]じまでにいてくれとたのんだ。', en: 'I asked him to be here by six.', sourceId: '154263', source: 'tatoeba' },
    { jp: '彼女にその本を送ってくれと頼みましょうか。', reading: 'かのじょにそのほんをおくってくれとたのみましょうか。', en: 'Shall I ask her to send the book to us?', sourceId: '95043', source: 'tatoeba' },
  ],
  // N3 ～ ば/たら～かもしれない
  'n3m-g-89ba1a': [
    { jp: '万一突然英語で話しかけられたら、逃げ出すかもしれない。', reading: 'まんいちとつぜんえいごではなしかけられたら、にげだすかもしれない。', en: 'If I should be suddenly spoken to in English, I might run away.', sourceId: '81136', source: 'tatoeba' },
    { jp: 'もしかしたら彼は気が変わるかもしれない。', reading: 'もしかしたらかれはきがかわるかもしれない。', en: 'He might change his mind.', sourceId: '193883', source: 'tatoeba' },
    { jp: '君が助けてくれなかったら、僕は失敗するかもしれない。', reading: 'きみがたすけてくれなかったら、ぼくはしっぱいするかもしれない。', en: 'If it were not for your help, I might have failed.', sourceId: '178955', source: 'tatoeba' },
  ],
  // N3 というのは/とは
  'n3m-g-89c8ee': [
    { jp: 'この天気とは気長に付き合っていくしかない。', reading: 'このてんきとはきながにつきあっていくしかない。', en: 'You have to learn to put up with this weather.', sourceId: '74008', source: 'tatoeba' },
    { jp: '人生とは絶望である。 僕はこう考えている。', reading: 'じんせいとはぜつぼうである。 ぼくはこうかんがえている。', en: 'Life is despair, that\'s what I think.', sourceId: '74766', source: 'tatoeba' },
    { jp: 'ワインとは、ボトルに詰められた詩である。', reading: 'ワインとは、ボトルにつめられたしである。', en: 'Wine is poetry in bottles.', sourceId: '5172', source: 'tatoeba' },
  ],
  // N3 確かに
  'n3m-g-8a031c': [
    { jp: '路面電車は今では確かに時代遅れかもしれない。', reading: 'ろめんでんしゃはいまではたしかにじだいおくれかもしれない。', en: 'The streetcar is now certainly out of date.', sourceId: '77394', source: 'tatoeba' },
    { jp: '彼は確かに金を約束の日に持ってくるでしょう。', reading: 'かれはたしかにきんをやくそくのひにもってくるでしょう。', en: 'No doubt he will bring the money on the appointed day.', sourceId: '108914', source: 'tatoeba' },
    { jp: '彼は確かにいいやつだ。しかし信頼できないよ。', reading: 'かれはたしかにいいやつだ。しかししんらいできないよ。', en: 'He is a good fellow, to be sure, but he isn\'t reliable.', sourceId: '183255', source: 'tatoeba' },
  ],
  // N3 とうとう
  'n3m-g-8ae8e6': [
    { jp: '彼もとうとう詰め腹を切らされたってわけだね。', reading: 'かれもとうとうつめばらをきらされたってわけだね。', en: 'He was finally forced to resign.', sourceId: '98801', source: 'tatoeba' },
    { jp: '私はとうとう彼女を説得してキャンプに行った。', reading: 'わたしはとうとうかのじょをせっとくしてキャンプにいった。', en: 'I persuaded her after all and went to camp.', sourceId: '159346', source: 'tatoeba' },
    { jp: '空腹やら疲労やらで、その犬はとうとう死んだ。', reading: 'くうふくやらひろうやらで、そのいぬはとうとうしんだ。', en: 'With hunger and fatigue, the dog died at last.', sourceId: '179298', source: 'tatoeba' },
  ],
  // N3 よかろう
  'n3m-g-8bc57a': [
    { jp: '雨になりそうだ。傘を持っていった方がよかろう。', reading: 'あめになりそうだ。かさをもっていったほうがよかろう。', en: 'It looks like rain. You had better take an umbrella with you.', sourceId: '189636', source: 'tatoeba' },
    { jp: '君が来たのだから、始めた方がよかろう。', reading: 'きみがきたのだから、はじめたほうがよかろう。', en: 'Since you\'re here, we might as well begin.', sourceId: '178851', source: 'tatoeba' },
    { jp: 'ここで待つより家に帰った方がよかろう。', reading: 'ここでまつよりいえにかえったほうがよかろう。', en: 'We had better go home rather than wait here.', sourceId: '224539', source: 'tatoeba' },
  ],
  // N3 それゆえ
  'n3m-g-8c6275': [
    { jp: 'それゆえここにとどまらざるを得ないだろう。', reading: 'それゆえここにとどまらざるをえないだろう。', en: 'Hence, I shall have to stay here.', sourceId: '204782', source: 'tatoeba' },
    { jp: 'それゆえに一年の残りの期間は閉鎖される事になるだろう。', reading: 'それゆえにいちねんののこりのきかんはへいさされることになるだろう。', en: 'Therefore it will be closed for the rest of the year.', sourceId: '204781', source: 'tatoeba' },
    { jp: 'それゆえに、全てが舞さんの肩に圧し掛かってくることになる訳だ。', reading: 'それゆえに、すべてがまいさんのかたにおしかかってくることになるわけだ。', en: 'And so everything ends up coming down on Mai\'s shoulders.', sourceId: '75398', source: 'tatoeba' },
  ],
  // N3 あまりに(も)～と / あんまりに(も)～と
  'n3m-g-8da92c': [
    { jp: 'あまりに訂正されると、話すのをやめてしまうのである。', reading: 'あまりにていせいされると、はなすのをやめてしまうのである。', en: 'If he is corrected too much, he will stop talking.', sourceId: '230348', source: 'tatoeba' },
    { jp: '彼女は、それはあまりに急な知らせだと彼にぐちをこぼした。', reading: 'かのじょは、それはあまりにきゅうなしらせだとかれにぐちをこぼした。', en: 'She complained to him that it was too short a notice.', sourceId: '93786', source: 'tatoeba' },
    { jp: 'あまりに親切すぎるので姉と口喧嘩をした。', reading: 'あまりにしんせつすぎるのであねとくちげんかをした。', en: 'I quarrelled with my sister because she\'s too kind.', sourceId: '230352', source: 'tatoeba' },
  ],
  // N3 なんという～だ
  'n3m-g-8e3f0f': [
    { jp: '君はなんという男だ。', reading: 'きみはなんというおとこだ。', en: 'What a man you are!', sourceId: '177589', source: 'tatoeba' },
    { jp: 'なんというけちん坊だ、君は。', reading: 'なんというけちんぼうだ、きみは。', en: 'What a miser you are!', sourceId: '198856', source: 'tatoeba' },
    { jp: 'なんというばかげた考えだ。', reading: 'なんというばかげたかんがえだ。', en: 'What an absurd idea!', sourceId: '198854', source: 'tatoeba' },
  ],
  // N3 はもちろん／はもとより
  'n3m-g-8ef699': [
    { jp: '彼は走ることはもちろん、歩くこともできない。', reading: 'かれははしることはもちろん、あるくこともできない。', en: 'He cannot walk, let alone run.', sourceId: '102791', source: 'tatoeba' },
    { jp: '彼はもちろん私の事を社長に告げ口するだろう。', reading: 'かれはもちろんわたしのことをしゃちょうにつげぐちするだろう。', en: 'He will, no doubt, tell the boss on me.', sourceId: '110562', source: 'tatoeba' },
    { jp: 'ケンは、ギターはもちろんバイオリンも弾ける。', reading: 'ケンは、ギターはもちろんバイオリンもひける。', en: 'Ken can play the violin, not to mention the guitar.', sourceId: '225181', source: 'tatoeba' },
  ],
  // N3 つもりはない
  'n3m-g-8f0029': [
    { jp: '私はあなたのことに首をつっこむつもりはない。', reading: 'わたしはあなたのことにくびをつっこむつもりはない。', en: 'I don\'t mean to poke my nose into your affairs.', sourceId: '161712', source: 'tatoeba' },
    { jp: 'トムはどこにも行くつもりはないと言っている。', reading: 'トムはどこにもいくつもりはないといっている。', en: 'Tom says he isn\'t planning to go anywhere.', sourceId: '7575383', source: 'tatoeba' },
    { jp: 'トムさんはあそこへ一人で行くつもりはない。', reading: 'トムさんはあそこへいちにんでいくつもりはない。', en: 'Tom has no intention of going there by himself.', sourceId: '1485607', source: 'tatoeba' },
  ],
  // N3 みたいだ
  'n3m-g-8f6afe': [
    { jp: '今度来た先生は、先生というより友達みたいだ。', reading: 'こんどきたせんせいは、せんせいというよりともだちみたいだ。', en: 'The new teacher is more like a friend than a teacher.', sourceId: '172198', source: 'tatoeba' },
    { jp: 'ウナギは蛇みたいだからといって嫌う人がいる。', reading: 'ウナギはへびみたいだからといってきらうひとがいる。', en: 'Some people dislike eels because they look like snakes.', sourceId: '228119', source: 'tatoeba' },
    { jp: '疲れてるみたいだね。きっと働き過ぎなんだよ。', reading: 'つかれてるみたいだね。きっとはたらきすぎなんだよ。', en: 'You look tired. You must have been working too hard.', sourceId: '1036766', source: 'tatoeba' },
  ],
  // N3 なんとか
  'n3m-g-8fd57e': [
    { jp: '彼女はなんとか自分で夕食を作ることができた。', reading: 'かのじょはなんとかじぶんでゆうしょくをつくることができた。', en: 'She was able to cook herself dinner, after a fashion.', sourceId: '91823', source: 'tatoeba' },
    { jp: '我々の収入は少ないが、なんとかやっています。', reading: 'われわれのしゅうにゅうはすくないが、なんとかやっています。', en: 'Our income is small, but we get by.', sourceId: '186257', source: 'tatoeba' },
    { jp: '列車が遅れたけれども、なんとか間に合った。', reading: 'れっしゃがおくれたけれども、なんとかまにあった。', en: 'Even though the train was late, we made it in time.', sourceId: '77568', source: 'tatoeba' },
  ],
  // N3 といいなあ/たらいいなあ/ばいいなあ
  'n3m-g-91e05c': [
    { jp: 'もっとお金を稼げたらいいなあと思います。', reading: 'もっとおかねをかせげたらいいなあとおもいます。', en: 'I wish I earned more money.', sourceId: '193347', source: 'tatoeba' },
    { jp: 'この天気が日曜日まで持てばいいなあ。', reading: 'このてんきがにちようびまでもてばいいなあ。', en: 'I hope the weather will hold until Sunday.', sourceId: '220450', source: 'tatoeba' },
    { jp: 'あなたのように英語が話せたらいいなあ。', reading: 'あなたのようにえいごがはなせたらいいなあ。', en: 'I wish I could speak English like you.', sourceId: '233481', source: 'tatoeba' },
  ],
  // N3 以下
  'n3m-g-9624f4': [
    { jp: '以下の空欄部分にご記入頂くだけで結構です。', reading: 'いかのくうらんぶぶんにごきにゅういただくだけでけっこうです。', en: 'All you have to do is fill in the blanks below.', sourceId: '191222', source: 'tatoeba' },
    { jp: '以下で議論されるデータは次の方法で収集された。', reading: 'いかでぎろんされるデータはつぎのほうほうでしゅうしゅうされた。', en: 'The data to be discussed below was collected in the following way.', sourceId: '191225', source: 'tatoeba' },
    { jp: 'この食品は１０度以下で保存したほうがいい。', reading: 'このしょくひんは[１|][０|]どいかでほぞんしたほうがいい。', en: 'You had better keep this food under ten degrees.', sourceId: '221052', source: 'tatoeba' },
  ],
  // N3 まるで...ない
  'n3m-g-970338': [
    { jp: '彼には紳士らしいところがまるでない。', reading: 'かれにはしんしらしいところがまるでない。', en: 'He is nothing of a gentleman.', sourceId: '118810', source: 'tatoeba' },
    { jp: '彼女には哀れみの心がまるでない。', reading: 'かのじょにはあわれみのこころがまるでない。', en: 'She is dead to pity.', sourceId: '94984', source: 'tatoeba' },
    { jp: '彼女はセックスのことをまるで知らない。', reading: 'かのじょはセックスのことをまるでしらない。', en: 'She knows nothing about the birds and the bees.', sourceId: '92652', source: 'tatoeba' },
  ],
  // N3 となると
  'n3m-g-978a0b': [
    { jp: '生の魚となると気分が悪くなってしまうのです。', reading: 'せいのさかなとなるときぶんがわるくなってしまうのです。', en: 'When it comes to raw fish, I feel disgusted.', sourceId: '142831', source: 'tatoeba' },
    { jp: '議論をすることとなると、彼は誰にも負けない。', reading: 'ぎろんをすることとなると、かれはだれにもまけない。', en: 'He is second to none when it comes to debating.', sourceId: '182860', source: 'tatoeba' },
    { jp: '甘いものとなると、自分を抑えられないのです。', reading: 'あまいものとなると、じぶんをおさえられないのです。', en: 'When it comes to sweets, I just can\'t control myself.', sourceId: '183886', source: 'tatoeba' },
  ],
  // N3 ところまで
  'n3m-g-997d49': [
    { jp: '水は見る見るうちに橋げたのところまで達した。', reading: 'みずはみるみるうちにはしげたのところまでたっした。', en: 'The water came up to the bridge girder in a second.', sourceId: '143765', source: 'tatoeba' },
    { jp: '彼女は立ち上がって窓のところまで歩いて行った。', reading: 'かのじょはたちあがってまどのところまであるいていった。', en: 'She stood up and walked to the window.', sourceId: '86306', source: 'tatoeba' },
    { jp: '今日の午後作文を私のところまで持ってきなさい。', reading: 'きょうのごごさくぶんをわたしのところまでもってきなさい。', en: 'Bring your essay to me this afternoon.', sourceId: '171918', source: 'tatoeba' },
  ],
  // N3 そう...ない
  'n3m-g-9ae49b': [
    { jp: '彼は他人の悪口を決して言いそうにない人物だ。', reading: 'かれはたにんのわるぐちをけっしていいそうにないじんぶつだ。', en: 'He is the last person to speak ill of others.', sourceId: '102618', source: 'tatoeba' },
    { jp: '毎日風呂に入る人もいれば、そうでない人もいる。', reading: 'まいにちふろにはいるひともいれば、そうでないひともいる。', en: 'Some people take a bath every day and others don\'t.', sourceId: '81267', source: 'tatoeba' },
    { jp: '僕は、君ほど彼女の好意はえられそうにない。', reading: 'ぼくは、きみほどかのじょのこういはえられそうにない。', en: 'I\'m much less likely to win her favors than you are.', sourceId: '82152', source: 'tatoeba' },
  ],
  // N3 というと/といえば/といったら
  'n3m-g-9b1cb8': [
    { jp: '旅行といえば、神戸に行ったことはありますか。', reading: 'りょこうといえば、こうべにいったことはありますか。', en: 'Speaking about trips, have you ever been to Kobe?', sourceId: '78183', source: 'tatoeba' },
    { jp: '趣味といえば、あなたは切手を集めていますか。', reading: 'しゅみといえば、あなたはきってをあつめていますか。', en: 'Speaking of hobbies, do you collect stamps?', sourceId: '148472', source: 'tatoeba' },
    { jp: '私たちはエジプトといえばナイル川を思い出す。', reading: 'わたしたちはエジプトといえばナイルかわをおもいだす。', en: 'We associate Egypt with the Nile.', sourceId: '166600', source: 'tatoeba' },
  ],
  // N3 なんということもない
  'n3m-g-9b78d2': [
    { jp: '私は、内陸部のなんということもない町に生まれた。', reading: 'わたしは、ないりくぶのなんということもないまちにうまれた。', en: 'I was born in the inland, in an unremarkable town.', sourceId: '2142124', source: 'tatoeba' },
  ],
  // N3 だいたい
  'n3m-g-9ba215': [
    { jp: 'だいたいにおいて私はその結果に満足している。', reading: 'だいたいにおいてわたしはそのけっかにまんぞくしている。', en: 'On the whole I am satisfied with the result.', sourceId: '203974', source: 'tatoeba' },
    { jp: 'これは米国の持っている数にだいたい匹敵する。', reading: 'これはべいこくのもっているかずにだいたいひってきする。', en: 'This is about as many as the United States has.', sourceId: '218098', source: 'tatoeba' },
    { jp: '彼女はあなたとだいたい同じくらいの身長だ。', reading: 'かのじょはあなたとだいたいおなじくらいのしんちょうだ。', en: 'She\'s about the same height as you.', sourceId: '93449', source: 'tatoeba' },
  ],
  // N3 かりに…たら/…ば
  'n3m-g-9bc4e1': [
    { jp: 'かりに１００万円もらったら、それをどうするかね。', reading: 'かりに[１|][０|][０|]まんえんもらったら、それをどうするかね。', en: 'If you were to be given a million yen, what would you do with it?', sourceId: '226178', source: 'tatoeba' },
  ],
  // N3 てあげてくれ
  'n3m-g-9c7cde': [
    { jp: 'トムのこと、許してあげてくれない？', reading: 'トムのこと、ゆるしてあげてくれない？', en: 'Are you really not able to forgive Tom?', sourceId: '3518849', source: 'tatoeba' },
    { jp: 'ボブにはやさしく接してあげてくれよ。ほら、彼は最近辛いこと続きなのだ。', reading: 'ボブにはやさしくせっしてあげてくれよ。ほら、かれはさいきんつらいことつづきなのだ。', en: 'Go easy on Bob. You know, he\'s been going though a rough period recently.', sourceId: '196070', source: 'tatoeba' },
  ],
  // N3 いかに…ようと（も）
  'n3m-g-9cc8f9': [
    { jp: '彼女がいかに努力しようと、彼には勝てない。', reading: 'かのじょがいかにどりょくしようと、かれにはかてない。', en: 'Try as she may, she is unable to beat him.', sourceId: '95718', source: 'tatoeba' },
  ],
  // N3 だけしか
  'n3m-g-9d26c7': [
    { jp: '彼はせいぜい１００ドルだけしか持っていない。', reading: 'かれはせいぜい[１|][０|][０|]ドルだけしかもっていない。', en: 'He has a hundred dollars at most.', sourceId: '113293', source: 'tatoeba' },
    { jp: 'すみません。今それだけしか置いてないんです。', reading: 'すみません。いまそれだけしかおいてないんです。', en: 'I\'m sorry, but that\'s all we have right now.', sourceId: '214181', source: 'tatoeba' },
    { jp: '私は自分に関してのことだけしかいえない。', reading: 'わたしはじぶんにかんしてのことだけしかいえない。', en: 'I can only speak for myself.', sourceId: '156290', source: 'tatoeba' },
  ],
  // N3 ～ばよかった/～たらよかった/～ばよかったのに/～たらよかったのに
  'n3m-g-9d4157': [
    { jp: '彼があそこにいてくれさえすればよかったのに。', reading: 'かれがあそこにいてくれさえすればよかったのに。', en: 'If only he had been there.', sourceId: '121125', source: 'tatoeba' },
    { jp: '彼女の警告にきちんと耳を傾ければよかったのに。', reading: 'かのじょのけいこくにきちんとみみをかたぶければよかったのに。', en: 'You should have paid attention to her warning.', sourceId: '94497', source: 'tatoeba' },
    { jp: '若いときにもっと勉強しておけばよかったよ。', reading: 'わかいときにもっとべんきょうしておけばよかったよ。', en: 'I wish I\'d studied harder when I was young.', sourceId: '148846', source: 'tatoeba' },
  ],
  // N3 など～ものか
  'n3m-g-9d442a': [
    { jp: 'ボストンになど帰らせるものか。', reading: 'ボストンになどかえらせるものか。', en: 'I\'m not going to let you go back to Boston.', sourceId: '5185695', source: 'tatoeba' },
  ],
  // N3 それでこそ
  'n3m-g-9e5ba4': [
    { jp: 'それでこそわが娘だ。', reading: 'それでこそわがむすめだ。', en: 'That\'s what I expected of my daughter.', sourceId: '205777', source: 'tatoeba' },
  ],
  // N3 て済む
  'n3m-g-a0b172': [
    { jp: 'これでこれ以上の義務を負わなくて済む。', reading: 'これでこれいじょうのぎむをおわなくてすむ。', en: 'That absolves me from further responsibility.', sourceId: '218777', source: 'tatoeba' },
    { jp: 'あなたがただ手紙を書くだけで、あなたの父親は多くのことを心配しなくて済むだろう。', reading: 'あなたがただてがみをかくだけで、あなたのちちおやはおおくのことをしんぱいしなくてすむだろう。', en: 'You will save your father a lot of worry if you simply write him a letter.', sourceId: '234190', source: 'tatoeba' },
  ],
  // N3 お…くださる
  'n3m-g-a486bc': [
    { jp: 'おいでくださるのはいつが都合よろしいですか。', reading: 'おいでくださるのはいつがつごうよろしいですか。', en: 'When will it be convenient for you to come?', sourceId: '227825', source: 'tatoeba' },
    { jp: 'お金を貸してくださるなら、大変ありがたく存じます。', reading: 'おかねをかしてくださるなら、たいへんありがたくぞんじます。', en: 'If you will lend me the money, I shall be much obliged to you.', sourceId: '193852', source: 'tatoeba' },
    { jp: 'あなたの素敵な奥さんによろしくお伝えくださることを忘れないで下さい。', reading: 'あなたのすてきなおくさんによろしくおつたえくださることをわすれないでください。', en: 'Don\'t forget to give my best regards to your lovely wife.', sourceId: '233118', source: 'tatoeba' },
  ],
  // N3 ように言う/頼む/注意する/伝える
  'n3m-g-a52e95': [
    { jp: '彼女に手伝ってくれるように頼むべきだったのに。', reading: 'かのじょにてつだってくれるようにたのむべきだったのに。', en: 'You should have asked her for help.', sourceId: '94813', source: 'tatoeba' },
    { jp: '彼女に手伝ってくれるよう頼むべきだった。', reading: 'かのじょにてつだってくれるようたのむべきだった。', en: 'You should have asked her for help.', sourceId: '94812', source: 'tatoeba' },
    { jp: '彼は外出するとき、家に気をつけてくれと私に頼む。', reading: 'かれはがいしゅつするとき、いえにきをつけてくれとわたしにたのむ。', en: 'When he goes out, he asks me to keep an eye on his house.', sourceId: '108937', source: 'tatoeba' },
  ],
  // N3 なんてことない
  'n3m-g-a53bff': [
    { jp: '「手伝ってくれてありがとう」「なんてことないさ」', reading: '「てつだってくれてありがとう」「なんてことないさ」', en: '"Thanks for your help." "It was nothing."', sourceId: '11724593', source: 'tatoeba' },
    { jp: 'まぁまぁね。なんてことないよ。', reading: 'まぁまぁね。なんてことないよ。', en: 'So-so, nothing special.', sourceId: '11064160', source: 'tatoeba' },
  ],
  // N3 たしかに/なるほど～かもしれない
  'n3m-g-a7cecb': [
    { jp: 'たしかに言われてみると、そんな気もする。', reading: 'たしかにいわれてみると、そんなきもする。', en: 'Now that you say it, yeah, I feel like that, too.', sourceId: '11027967', source: 'tatoeba' },
    { jp: 'たしかに彼は金持ちだが、信用できない。', reading: 'たしかにかれはかねもちだが、しんようできない。', en: 'Indeed he is rich, but he is not reliable.', sourceId: '203670', source: 'tatoeba' },
    { jp: 'わが国の大都市の多くでは犯罪はたしかに増加している。', reading: 'わがくにのだいとしのおおくでははんざいはたしかにぞうかしている。', en: 'Crime is certainly on the increase in many of our big cities.', sourceId: '192019', source: 'tatoeba' },
  ],
  // N3 まんざら…でもない/ではない
  'n3m-g-a8a63d': [
    { jp: '「ソフトウェア開発」は「モノ作り」ではない。', reading: '「ソフトウェアかいはつ」は「モノづくり」ではない。', en: '"Software development" isn\'t "manufacture".', sourceId: '74204', source: 'tatoeba' },
    { jp: '９０歳以上生きることは決してまれではない。', reading: '[９|][０|]さいいじょういきることはけっしてまれではない。', en: 'It is not rare at all to live over ninety years.', sourceId: '4957', source: 'tatoeba' },
    { jp: '世界は君を中心に回っているわけではないんだよ。', reading: 'せかいはきみをちゅうしんにまわっているわけではないんだよ。', en: 'The world doesn\'t revolve around you.', sourceId: '5287', source: 'tatoeba' },
  ],
  // N3 込む
  'n3m-g-a9512a': [
    { jp: '老いた犬に新しい芸当を教え込むことはできない。', reading: 'おいたいぬにあたらしいげいとうをおしえこむことはできない。', en: 'You can\'t teach an old dog new tricks.', sourceId: '77334', source: 'tatoeba' },
    { jp: '彼は彼女の目を覗き込むと、突然立ち去った。', reading: 'かれはかのじょのめをのぞきこむと、とつぜんたちさった。', en: 'He looked into her eyes and suddenly went away.', sourceId: '100853', source: 'tatoeba' },
    { jp: '動物によっては刃物を教え込む事ができる。', reading: 'どうぶつによってははものをおしえこむことができる。', en: 'Some animals can be taught to use knives.', sourceId: '123775', source: 'tatoeba' },
  ],
  // N3 ようやく
  'n3m-g-a96bea': [
    { jp: '１０年後にようやく彼は、再び故郷の町を見た。', reading: '[１|][０|]ねんごにようやくかれは、ふたたびこきょうのまちをみた。', en: 'He saw his home-town again only after ten years.', sourceId: '236010', source: 'tatoeba' },
    { jp: '今やようやく、その宝石は彼の手の中にあった。', reading: 'いまやようやく、そのほうせきはかれのてのなかにあった。', en: 'At last, the gem was in his hands.', sourceId: '3462190', source: 'tatoeba' },
    { jp: '長い間捜したあとでようやくその本を手に入れた。', reading: 'ながいまさがしたあとでようやくそのほんをてにいれた。', en: 'I managed to acquire the book after a long search.', sourceId: '125969', source: 'tatoeba' },
  ],
  // N3 そうになる
  'n3m-g-a9ed28': [
    { jp: '負けそうになるのがわかったとき、彼らは降参した。', reading: 'まけそうになるのがわかったとき、かれらはこうさんした。', en: 'When they saw that they were losing, they gave up.', sourceId: '84285', source: 'tatoeba' },
    { jp: 'おもい出したくない。怒りで気がちがいそうになる。', reading: 'おもいだしたくない。いかりできがちがいそうになる。', en: 'I don\'t want to remember. I feel I\'ll go mad through rage.', sourceId: '227502', source: 'tatoeba' },
    { jp: 'あのひどい音を聞くと気が狂いそうになる。', reading: 'あのひどいおとをきくときがくるいそうになる。', en: 'That terrible noise is driving me mad.', sourceId: '231271', source: 'tatoeba' },
  ],
  // N3 ていけない
  'n3m-g-a9f97d': [
    { jp: '彼らはあまりうまく折り合っていけないと思う。', reading: 'かれらはあまりうまくおりあっていけないとおもう。', en: 'I am afraid they can\'t get along very well.', sourceId: '98224', source: 'tatoeba' },
    { jp: '太陽がなければ私たちは地上で生きていけない。', reading: 'たいようがなければわたしたちはちじょうでいきていけない。', en: 'Without the sun, we couldn\'t live on the earth.', sourceId: '138193', source: 'tatoeba' },
    { jp: '水と空気なしでは、われわれは生きていけない。', reading: 'みずとくうきなしでは、われわれはいきていけない。', en: 'We cannot do without air and water.', sourceId: '143807', source: 'tatoeba' },
  ],
  // N3 おかげだ
  'n3m-g-aaf089': [
    { jp: '彼は自分の成功を幸運のおかげだと考えている。', reading: 'かれはじぶんのせいこうをこううんのおかげだとかんがえている。', en: 'He attributes his success to good luck.', sourceId: '104895', source: 'tatoeba' },
    { jp: '彼女は自分の成功を幸運のおかげだと考えた。', reading: 'かのじょはじぶんのせいこうをこううんのおかげだとかんがえた。', en: 'She attributed her success to good luck.', sourceId: '89012', source: 'tatoeba' },
    { jp: '私がまだ生きているのは、私の主治医のおかげだ。', reading: 'わたしがまだいきているのは、わたしのしゅじいのおかげだ。', en: 'I owe it to my doctor that I am still alive.', sourceId: '167919', source: 'tatoeba' },
  ],
  // N3 ～は～くらいです
  'n3m-g-ab9e30': [
    { jp: 'その学生たちの大学合格率はどのくらいですか。', reading: 'そのがくせいたちのだいがくごうかくりつはどのくらいですか。', en: 'What percentage of the students are admitted to colleges?', sourceId: '137605', source: 'tatoeba' },
    { jp: 'レインボウブリッジの長さはどのくらいですか。', reading: 'レインボウブリッジのながさはどのくらいですか。', en: 'How long is the Rainbow Bridge?', sourceId: '192376', source: 'tatoeba' },
    { jp: '貴社の製品の海外市場の割合はどのくらいですか。', reading: 'きしゃのせいひんのかいがいしじょうのわりあいはどのくらいですか。', en: 'What is the percentage of overseas markets for your products?', sourceId: '183040', source: 'tatoeba' },
  ],
  // N3 に比べて
  'n3m-g-ac7d86': [
    { jp: '日本での売り上げはヨーロッパに比べて少ない。', reading: 'にっぽんでのうりあげはヨーロッパにくらべてすくない。', en: 'The sales in Japan are small in comparison with those in Europe.', sourceId: '122821', source: 'tatoeba' },
    { jp: '私の収入は支出に比べて、５００ポンド足りない。', reading: 'わたしのしゅうにゅうはししゅつにくらべて、[５|][０|][０|]ポンドたりない。', en: 'My income falls short of my expenditure by five hundred pounds.', sourceId: '163356', source: 'tatoeba' },
    { jp: '古い機種に比べてこちらの方がずっと使いやすい。', reading: 'ふるいきしゅにくらべてこちらのほうがずっとつかいやすい。', en: 'As compared with the old model, this is far easier to handle.', sourceId: '174624', source: 'tatoeba' },
  ],
  // N3 としたら/とすれば
  'n3m-g-afa512': [
    { jp: 'トンネルを掘るとしたらどれくらい簡単なのか。', reading: 'トンネルをほるとしたらどれくらいかんたんなのか。', en: 'How easy would it be to bore a tunnel through it?', sourceId: '199364', source: 'tatoeba' },
    { jp: 'ドアを開けようとしたら、ドアの握りがとれた。', reading: 'ドアをあけようとしたら、ドアのにぎりがとれた。', en: 'I tried to open the door, and the doorknob came off.', sourceId: '201790', source: 'tatoeba' },
    { jp: 'この明かりで字を読もうとすれば目を痛めるよ。', reading: 'このあかりでじをよもうとすればめをいためるよ。', en: 'You\'ll strain your eyes trying to read in this light.', sourceId: '219462', source: 'tatoeba' },
  ],
  // N3 ないと/なくちゃ/なきゃ
  'n3m-g-b08f56': [
    { jp: '愚かな行為をしたのかもしれないと思い始めた。', reading: 'おろかなこういをしたのかもしれないとおもいはじめた。', en: 'I started to think I had behaved foolishly.', sourceId: '75580', source: 'tatoeba' },
    { jp: '時間をおかないと追加・削除が反映されない。', reading: 'じかんをおかないとついか・さくじょがはんえいされない。', en: 'Additions and deletions are not shown immediately.', sourceId: '74757', source: 'tatoeba' },
    { jp: 'スケジュールがバッティングしなきゃ大丈夫です。', reading: 'スケジュールがバッティングしなきゃだいじょうぶです。', en: 'The schedule\'s fine as long as nothing clashes.', sourceId: '76664', source: 'tatoeba' },
  ],
  // N3 そうして
  'n3m-g-b15cbd': [
    { jp: '君がそうしてはいけない理由はたくさんある。', reading: 'きみがそうしてはいけないりゆうはたくさんある。', en: 'There are a good many reasons why you shouldn\'t do it.', sourceId: '179163', source: 'tatoeba' },
    { jp: 'そうしているうちにまた２時間が経ってしまった。', reading: 'そうしているうちにまた[２|]じかんがたってしまった。', en: 'While we were busy, 2 hours passed again.', sourceId: '1227342', source: 'tatoeba' },
    { jp: 'そうして欲しいなんて、言ったおぼえはない。', reading: 'そうしてほしいなんて、いったおぼえはない。', en: 'I never said that I wanted that.', sourceId: '3563264', source: 'tatoeba' },
  ],
  // N3 なんとも～ない
  'n3m-g-b1a3eb': [
    { jp: 'エンジンはなんともないが車が動かない。', reading: 'エンジンはなんともないがくるまがうごかない。', en: 'Nothing\'s wrong with the engine, but my car won\'t move.', sourceId: '227863', source: 'tatoeba' },
    { jp: '蓮の花はなんとも言えない芳香をはなっていた。', reading: 'はちすのはなはなんともいえないほうこうをはなっていた。', en: 'The lotus blossoms diffused an inexpressibly pleasant scent.', sourceId: '77421', source: 'tatoeba' },
    { jp: 'その雑誌はおもしろくもなんともない。', reading: 'そのざっしはおもしろくもなんともない。', en: 'The magazine does nothing for me.', sourceId: '210469', source: 'tatoeba' },
  ],
  // N3 ことだろう
  'n3m-g-b1c08d': [
    { jp: '彼はなんとぐっすりと眠っていることだろう。', reading: 'かれはなんとぐっすりとねむっていることだろう。', en: 'How soundly he is sleeping!', sourceId: '111379', source: 'tatoeba' },
    { jp: '内戦がなかったら、彼らは今ごろ裕福なことだろう。', reading: 'ないせんがなかったら、かれらはいまごろゆうふくなことだろう。', en: 'If it had not been for civil war, they would be wealthy now.', sourceId: '123224', source: 'tatoeba' },
    { jp: '私が家を買えるのはずっと先のことだろう。', reading: 'わたしがいえをかえるのはずっとさきのことだろう。', en: 'It will be a long time before I can buy a house.', sourceId: '167847', source: 'tatoeba' },
  ],
  // N3 ていては
  'n3m-g-b2f28c': [
    { jp: '私たち、こんなことをしていてはまずいと思う。', reading: 'わたしたち、こんなことをしていてはまずいとおもう。', en: 'I think we shouldn\'t be doing this.', sourceId: '2123464', source: 'tatoeba' },
    { jp: '今そんなに怠けていては、将来きっと後悔するよ。', reading: 'いまそんなになまけていては、しょうらいきっとこうかいするよ。', en: 'You are bound to regret it in the future if you are so lazy now.', sourceId: '172799', source: 'tatoeba' },
    { jp: '君は頭痛がしていてはくつろげるはずが無い。', reading: 'きみはずつうがしていてはくつろげるはずがない。', en: 'You can\'t feel at ease with a headache.', sourceId: '177031', source: 'tatoeba' },
  ],
  // N3 ないことはない/ないこともない
  'n3m-g-b37039': [
    { jp: 'どんなに年をとっていても学べないことはない。', reading: 'どんなにとしをとっていてもまなべないことはない。', en: 'No man is so old he cannot learn.', sourceId: '199501', source: 'tatoeba' },
    { jp: 'どんなに年を取っても学問ができないことはない。', reading: 'どんなにとしをとってもがくもんができないことはない。', en: 'You\'re never too old to learn.', sourceId: '199499', source: 'tatoeba' },
    { jp: 'トムが逮捕される可能性がないこともない。', reading: 'トムがたいほされるかのうせいがないこともない。', en: 'There\'s a small possibility that Tom will be arrested.', sourceId: '1130417', source: 'tatoeba' },
  ],
  // N3 というのなら
  'n3m-g-b38e93': [
    { jp: 'あなたが来たいというのなら大歓迎です。', reading: 'あなたがきたいというのならだいかんげいです。', en: 'If you care to come, you will be welcome.', sourceId: '233922', source: 'tatoeba' },
    { jp: 'なれというのなら、ペットになってあげようじゃないの。', reading: 'なれというのなら、ペットになってあげようじゃないの。', en: 'I\'ll be your pet if you want.', sourceId: '10718773', source: 'tatoeba' },
    { jp: 'もし彼がどうしても来たいというのなら、彼が来るまで待とう。', reading: 'もしかれがどうしてもきたいというのなら、かれがくるまでまとう。', en: 'If he will come, I will wait for him till he comes.', sourceId: '193525', source: 'tatoeba' },
  ],
  // N3 ないことはない
  'n3m-g-b44660': [
    { jp: 'どんなに年をとっていても学べないことはない。', reading: 'どんなにとしをとっていてもまなべないことはない。', en: 'No man is so old he cannot learn.', sourceId: '199501', source: 'tatoeba' },
    { jp: 'どんなに年を取っても学問ができないことはない。', reading: 'どんなにとしをとってもがくもんができないことはない。', en: 'You\'re never too old to learn.', sourceId: '199499', source: 'tatoeba' },
  ],
  // N3 ...ようでもあり / ようでもあるし
  'n3m-g-b490d6': [
    { jp: 'アルパカは馬のようでもあり、ラクダのようでもある。', reading: 'アルパカはうまのようでもあり、ラクダのようでもある。', en: 'An alpaca looks like a horse and a camel.', sourceId: '229930', source: 'tatoeba' },
  ],
  // N3 さえ／にさえ／でさえ
  'n3m-g-b4b6fd': [
    { jp: '彼は敵対者にさえ新しい経済計画に同意させた。', reading: 'かれはてきたいしゃにさえあたらしいけいざいけいかくにどういさせた。', en: 'He got even his opponents to agree to the new economic plan.', sourceId: '101958', source: 'tatoeba' },
    { jp: '食べすぎさえしなければ、必ず痩せると思います。', reading: 'たべすぎさえしなければ、かならずやせるとおもいます。', en: 'I think that as long as I don\'t overeat, I will certainly lose weight.', sourceId: '75502', source: 'tatoeba' },
    { jp: '彼女は私に「おはよう」とさえ言わなかった。', reading: 'かのじょはわたしに「おはよう」とさえいわなかった。', en: 'She did not so much as say "Good morning" to me.', sourceId: '89588', source: 'tatoeba' },
  ],
  // N3 から~にかけて
  'n3m-g-b69328': [
    { jp: '雨がよく降るのは、５月から８月にかけてです。', reading: 'あめがよくふるのは、ごがつからはちがつにかけてです。', en: 'The months with the most rain are May, June, July and August.', sourceId: '4212797', source: 'tatoeba' },
    { jp: '彼は腰からひざにかけてびしょ濡れになった。', reading: 'かれはこしからひざにかけてびしょぬれになった。', en: 'He got wet from the waist to the knees.', sourceId: '107236', source: 'tatoeba' },
    { jp: 'このため、今夜から明日にかけて全般に曇りや雨の天気でしょう。', reading: 'このため、こんやからあしたにかけてぜんぱんにくもりやあめのてんきでしょう。', en: 'Because of this it will probably be generally cloudy and rainy weather over tonight and tomorrow.', sourceId: '393788', source: 'tatoeba' },
  ],
  // N3 てはだめだ
  'n3m-g-b6c608': [
    { jp: '彼女はいつもうそをつくので、信じてはだめだ。', reading: 'かのじょはいつもうそをつくので、しんじてはだめだ。', en: 'Don\'t believe her because she always lies.', sourceId: '93325', source: 'tatoeba' },
    { jp: '一つのことに全てを賭けてはだめだ。', reading: 'ひとつのことにすべてをかけてはだめだ。', en: 'Don\'t put all your eggs in one basket.', sourceId: '190701', source: 'tatoeba' },
    { jp: 'そんな口の利き方をしてはだめだ。', reading: 'そんなくちのききかたをしてはだめだ。', en: 'It is not proper that you talk that way.', sourceId: '204142', source: 'tatoeba' },
  ],
  // N3 だからといって
  'n3m-g-b74846': [
    { jp: '人が金持ちだからといって尊敬すべきではない。', reading: 'ひとがかねもちだからといってそんけいすべきではない。', en: 'You should not respect a man because he is rich.', sourceId: '144689', source: 'tatoeba' },
    { jp: '新型だからといって旧型より良いとは限らない。', reading: 'しんがただからといってきゅうがたよりよいとはかぎらない。', en: 'A new model isn\'t necessarily any better than the older one.', sourceId: '145287', source: 'tatoeba' },
    { jp: '警察官だからといってみな勇敢だとは限らない。', reading: 'けいさつかんだからといってみなゆうかんだとはかぎらない。', en: 'Not all policemen are brave.', sourceId: '176083', source: 'tatoeba' },
  ],
  // N3 いかにも…そうだ
  'n3m-g-b7ca07': [
    { jp: 'あのスーツはいかにも高そうだ。', reading: 'あのスーツはいかにもたかそうだ。', en: 'That suit has an expensive look.', sourceId: '231316', source: 'tatoeba' },
  ],
  // N3 だけしか～ない
  'n3m-g-ba224c': [
    { jp: '彼女はただものごとのうわべだけしか見ない傾向がある。', reading: 'かのじょはただものごとのうわべだけしかみないけいこうがある。', en: 'She is apt to look only at the surface of things.', sourceId: '92161', source: 'tatoeba' },
    { jp: '私は自分に関してのことだけしかいえない。', reading: 'わたしはじぶんにかんしてのことだけしかいえない。', en: 'I can only speak for myself.', sourceId: '156290', source: 'tatoeba' },
    { jp: 'すみません。今それだけしか置いてないんです。', reading: 'すみません。いまそれだけしかおいてないんです。', en: 'I\'m sorry, but that\'s all we have right now.', sourceId: '214181', source: 'tatoeba' },
  ],
  // N3 切る/切れる/切れない
  'n3m-g-ba800a': [
    { jp: '電話を切る前に良子ともう一度お願いします。', reading: 'でんわをきるまえにりょうこともういちどおねがいします。', en: 'Can I talk to Ryoko again before you hang up?', sourceId: '124646', source: 'tatoeba' },
    { jp: '自分の顔に仕返しをするために鼻をちょん切るな。', reading: 'じぶんのかおにしかえしをするためにはなをちょんぎるな。', en: 'Don\'t cut off your nose to spite your face.', sourceId: '149885', source: 'tatoeba' },
    { jp: '1/4カットの白菜を太めの千切りにザクザク切る。', reading: '[1|]/[4|]カットのはくさいをふとめのせんぎりにザクザクきる。', en: 'Cut the quartered pak-choi into, slightly wide, strips.', sourceId: '74246', source: 'tatoeba' },
  ],
  // N3 てのこと
  'n3m-g-bae494': [
    { jp: '彼らが結婚生活を続けていられるのは子供たちのことを考えてのことだ。', reading: 'かれらがけっこんせいかつをつづけていられるのはこどもたちのことをかんがえてのことだ。', en: 'They stayed married for the sake of their children.', sourceId: '98704', source: 'tatoeba' },
    { jp: 'なんの気なしに言っただけで、別に悪気があってのことではありません。', reading: 'なんのきなしにいっただけで、べつにわるぎがあってのことではありません。', en: 'I just said so without thinking much about it. I didn\'t mean anything serious.', sourceId: '198801', source: 'tatoeba' },
    { jp: 'ジョンがヨーロッパへ行く計画について話したのは昨日になってのことだった。', reading: 'ジョンがヨーロッパへいくけいかくについてはなしたのはきのうになってのことだった。', en: 'It was only yesterday that John told me about his plan to go to Europe.', sourceId: '215522', source: 'tatoeba' },
  ],
  // N3 まんざらでもない
  'n3m-g-bbaa86': [
    { jp: 'ねぇ、このピザ、まんざらでもないよ。', reading: 'ねぇ、このピザ、まんざらでもないよ。', en: 'Hey, this pizza isn\'t bad. Not bad at all.', sourceId: '11640011', source: 'tatoeba' },
  ],
  // N3 しばらく
  'n3m-g-bbdb08': [
    { jp: 'いよいよ今週を限りに、しばらくのお休みです。', reading: 'いよいよこんしゅうをかぎりに、しばらくのおやすみです。', en: 'I\'ve finally got some vacation coming as of the end of this week.', sourceId: '74065', source: 'tatoeba' },
    { jp: '彼女をしばらく遠くにおいておくことにするよ。', reading: 'かのじょをしばらくとおくにおいておくことにするよ。', en: 'I\'m going to keep my distance from her for a while.', sourceId: '86144', source: 'tatoeba' },
    { jp: '彼らが来るまでにはまだしばらくかかるだろう。', reading: 'かれらがくるまでにはまだしばらくかかるだろう。', en: 'It will be some time before they come.', sourceId: '98662', source: 'tatoeba' },
  ],
  // N3 決して～ない
  'n3m-g-bce815': [
    { jp: '彼は詩人なんていうものでは決してない。', reading: 'かれはしじんなんていうものではけっしてない。', en: 'He is anything but a poet.', sourceId: '105465', source: 'tatoeba' },
    { jp: 'また辞去する際に決して忘れないようにすること。', reading: 'またじきょするさいにけっしてわすれないようにすること。', en: 'It is very important to be careful not to forget them when you leave.', sourceId: '76403', source: 'tatoeba' },
    { jp: '舞台で彼女を見たのを決して忘れないだろう。', reading: 'ぶたいでかのじょをみたのをけっしてわすれないだろう。', en: 'I\'ll never forget seeing her on the stage.', sourceId: '84259', source: 'tatoeba' },
  ],
  // N3 せいぜい
  'n3m-g-be16b0': [
    { jp: '彼はせいぜい１００ドルだけしか持っていない。', reading: 'かれはせいぜい[１|][０|][０|]ドルだけしかもっていない。', en: 'He has a hundred dollars at most.', sourceId: '113293', source: 'tatoeba' },
    { jp: 'われわれはせいぜいわずかな利益しか望めない。', reading: 'われわれはせいぜいわずかなりえきしかのぞめない。', en: 'At best we can only hope for a small profit.', sourceId: '191685', source: 'tatoeba' },
    { jp: 'せいぜい４０％の高校生しか大学に進学しない。', reading: 'せいぜい[４|][０|]ぱーせんとのこうこうせいしかだいがくにしんがくしない。', en: 'Not more than 40 percent of students go on university.', sourceId: '214078', source: 'tatoeba' },
  ],
  // N3 に代わって
  'n3m-g-bef514': [
    { jp: '私は母に代わってあなたに手紙を書いています。', reading: 'わたしはははにかわってあなたにてがみをかいています。', en: 'I am writing to you on behalf of my mother.', sourceId: '152861', source: 'tatoeba' },
    { jp: '副大統領は大統領に代わって式典に出席した。', reading: 'ふくだいとうりょうはだいとうりょうにかわってしきてんにしゅっせきした。', en: 'The vice-president attended the ceremony on behalf of the president.', sourceId: '83900', source: 'tatoeba' },
    { jp: '彼女に代わって誰が会合に出席するのか。', reading: 'かのじょにかわってだれがかいごうにしゅっせきするのか。', en: 'Who will attend the meeting on her behalf?', sourceId: '94790', source: 'tatoeba' },
  ],
  // N3 なにもかも
  'n3m-g-bf71cb': [
    { jp: 'なにもかも準備ができた。', reading: 'なにもかもじゅんびができた。', en: 'Everything is ready.', sourceId: '199097', source: 'tatoeba' },
  ],
  // N3 すぐにでも
  'n3m-g-bfb04e': [
    { jp: 'その患者は今すぐにでも亡くなるかもしれない。', reading: 'そのかんじゃはいますぐにでもなくなるかもしれない。', en: 'The patient may pass away at any moment.', sourceId: '1052799', source: 'tatoeba' },
    { jp: 'トムはすぐにでも刑務所から脱出するつもりなの？', reading: 'トムはすぐにでもけいむしょからだっしゅつするつもりなの？', en: 'Is Tom going to get out of prison any time soon?', sourceId: '2090934', source: 'tatoeba' },
    { jp: 'すぐにでもトムがそれをやる予定なんですか？', reading: 'すぐにでもトムがそれをやるよていなんですか？', en: 'Is Tom planning on doing that anytime soon?', sourceId: '8819378', source: 'tatoeba' },
  ],
  // N3 によると / によれば
  'n3m-g-c4f8df': [
    { jp: '天気予報によれば、まもなく梅雨に入るそうだ。', reading: 'てんきよほうによれば、まもなくつゆにはいるそうだ。', en: 'According to the weather forecast, the rainy season will set in before long.', sourceId: '125087', source: 'tatoeba' },
    { jp: '天気予報によると、台風は沿岸に接近しそうだ。', reading: 'てんきよほうによると、たいふうはえんがんにせっきんしそうだ。', en: 'According to the weather forecast, the typhoon is likely to approach the coast.', sourceId: '125090', source: 'tatoeba' },
    { jp: '新聞によると名古屋に大火災があったそうです。', reading: 'しんぶんによるとなごやにだいかさいがあったそうです。', en: 'The papers say that there was a big fire in Nagoya.', sourceId: '145166', source: 'tatoeba' },
  ],
  // N3 一度に
  'n3m-g-c5d868': [
    { jp: '２つのことを一度にしようとしてはいけません。', reading: 'ふたつのことをいちどにしようとしてはいけません。', en: 'Don\'t try to do two things at a time.', sourceId: '235547', source: 'tatoeba' },
    { jp: '彼は一度に７人の話を聞くことができました。', reading: 'かれはいちどに[７|]にんのはなしをきくことができました。', en: 'He could listen to seven people at once.', sourceId: '109908', source: 'tatoeba' },
    { jp: '一度に二つのことをやろうとしてはいけない。', reading: 'いちどにふたつのことをやろうとしてはいけない。', en: 'Don\'t attempt two things at once.', sourceId: '190311', source: 'tatoeba' },
  ],
  // N3 ただ…だけでは
  'n3m-g-c5efc4': [
    { jp: '富はただそれだけでは大したものではない。', reading: 'とみはただそれだけではたいしたものではない。', en: 'Wealth, as such, does not matter much.', sourceId: '84956', source: 'tatoeba' },
    { jp: '今日では人はただ生計を立てるだけでは満足できない。', reading: 'きょうではひとはただせいけいをたてるだけではまんぞくできない。', en: 'Today you can\'t be content with just earning a living.', sourceId: '172000', source: 'tatoeba' },
    { jp: 'ただ呼吸しているだけでは生きていることにならない。', reading: 'ただこきゅうしているだけではいきていることにならない。', en: 'Merely to breathe does not mean to live.', sourceId: '203620', source: 'tatoeba' },
  ],
  // N3 例えば
  'n3m-g-c899bc': [
    { jp: '例えば、温度計や気圧計などの計器は器具です。', reading: 'たとえば、おんどけいやきあつけいなどのけいきはきぐです。', en: 'For instance, gauges, such as thermometers and barometers, are instruments.', sourceId: '77708', source: 'tatoeba' },
    { jp: '日本には美しい都市が多い。例えば京都、奈良だ。', reading: 'にっぽんにはうつくしいとしがおおい。たとえばきょうと、ならだ。', en: 'Japan is full of beautiful cities. Kyoto and Nara, for instance.', sourceId: '5322', source: 'tatoeba' },
    { jp: '例えば、大阪はサンフランシスコの姉妹都市です。', reading: 'たとえば、おおさかはサンフランシスコのしまいとしです。', en: 'For example, Osaka is the sister city of San Francisco.', sourceId: '77702', source: 'tatoeba' },
  ],
  // N3 ならいい
  'n3m-g-ca60f9': [
    { jp: 'これならいいはず。たぶん。おそらく。そうだといいな。', reading: 'これならいいはず。たぶん。おそらく。そうだといいな。', en: 'This should be okay. Probably. Possibly. At least I hope so.', sourceId: '8919800', source: 'tatoeba' },
    { jp: 'それが本当ならいいんですけど。', reading: 'それがほんとうならいいんですけど。', en: 'I hope that that\'s the truth.', sourceId: '11724492', source: 'tatoeba' },
    { jp: '今度の水曜日ならいいですよ。', reading: 'こんどのすいようびならいいですよ。', en: 'Next Wednesday will be fine.', sourceId: '172151', source: 'tatoeba' },
  ],
  // N3 もともと
  'n3m-g-cad2ad': [
    { jp: '彼らはもともと農業をやっていました。', reading: 'かれらはもともとのうぎょうをやっていました。', en: 'Originally they were farmers.', sourceId: '97610', source: 'tatoeba' },
    { jp: '彼は自分のもともとの計画を成し遂げることに固執した。', reading: 'かれはじぶんのもともとのけいかくをなしとげることにこしつした。', en: 'He persisted in accomplishing his original plan.', sourceId: '105072', source: 'tatoeba' },
    { jp: 'あの車はもともと彼の物だ。', reading: 'あのくるまはもともとかれのものだ。', en: 'That car was his to begin with.', sourceId: '11810300', source: 'tatoeba' },
  ],
  // N3 …たりしたら／しては
  'n3m-g-cd3f39': [
    { jp: '部屋の中でキャッチボールをしてはいけません。', reading: 'へやのなかでキャッチボールをしてはいけません。', en: 'Don\'t play catch in the room.', sourceId: '84179', source: 'tatoeba' },
    { jp: '貧乏だからだといって人を軽蔑してはいけない。', reading: 'びんぼうだからだといってひとをけいべつしてはいけない。', en: 'You should not despise a man because he is poor.', sourceId: '85162', source: 'tatoeba' },
    { jp: '貧しいからといって、人を軽蔑してはいけない。', reading: 'まずしいからといって、ひとをけいべつしてはいけない。', en: 'You must not despise someone because they are poor.', sourceId: '85211', source: 'tatoeba' },
  ],
  // N3 もし...ても
  'n3m-g-d02c2f': [
    { jp: '彼を批判する人は、もしあってもごくわずかさ。', reading: 'かれをひはんするひとは、もしあってもごくわずかさ。', en: 'Few, if any, will criticize him.', sourceId: '95789', source: 'tatoeba' },
    { jp: '彼らがフランス語を話すことは、もしあってもまれだ。', reading: 'かれらがフランスごをはなすことは、もしあってもまれだ。', en: 'They seldom, if ever, speak in French.', sourceId: '98746', source: 'tatoeba' },
    { jp: 'もし負けてもあなたには別の機会が有る。', reading: 'もしまけてもあなたにはべつのきかいがある。', en: 'Even if you lose the game, you\'ll have another chance.', sourceId: '193459', source: 'tatoeba' },
  ],
  // N3 は別として
  'n3m-g-d116da': [
    { jp: '値段は別として、そのドレスは私に似合わない。', reading: 'ねだんはべつとして、そのドレスはわたしににあわない。', en: 'Apart from the cost, the dress doesn\'t suit me.', sourceId: '127119', source: 'tatoeba' },
    { jp: '妹は別として、私の家族はテレビを見ません。', reading: 'いもうとはべつとして、わたしのかぞくはテレビをみません。', en: 'Apart from my sister, my family doesn\'t watch TV.', sourceId: '81368', source: 'tatoeba' },
    { jp: '彼の両親は別として、誰も彼を余りよく知らない。', reading: 'かれのりょうしんはべつとして、だれもかれをあまりよくしらない。', en: 'Apart from his parents, no one knows him very well.', sourceId: '115864', source: 'tatoeba' },
  ],
  // N3 そのうち
  'n3m-g-d1e03c': [
    { jp: '元気を出せ。そのうちすべてうまくいくだろう。', reading: 'げんきをしゅっせ。そのうちすべてうまくいくだろう。', en: 'Cheer up! Everything will soon be all right.', sourceId: '175028', source: 'tatoeba' },
    { jp: 'その統計の結果はそのうちに発表されるだろう。', reading: 'そのとうけいのけっかはそのうちにはっぴょうされるだろう。', en: 'The results of the survey will be announced in due course.', sourceId: '207455', source: 'tatoeba' },
    { jp: 'そのうちのいくつかは赤く、いくつかは茶色だ。', reading: 'そのうちのいくつかはあかく、いくつかはちゃいろだ。', en: 'Some of them are red; others are brown.', sourceId: '213379', source: 'tatoeba' },
  ],
  // N3 ...ではないか
  'n3m-g-d35212': [
    { jp: '彼女は彼が事故に遭うのではないかと心配した。', reading: 'かのじょはかれがじこにあうのではないかとしんぱいした。', en: 'She was afraid of his having an accident.', sourceId: '87492', source: 'tatoeba' },
    { jp: '彼は弟が失敗するのではないかと心配している。', reading: 'かれはおとうとがしっぱいするのではないかとしんぱいしている。', en: 'He has a fear that his brother will fail.', sourceId: '101982', source: 'tatoeba' },
    { jp: '彼は死んでいるのではないかと危ぶまれている。', reading: 'かれはしんでいるのではないかとあやぶまれている。', en: 'They fear that he may be dead.', sourceId: '106454', source: 'tatoeba' },
  ],
  // N3 より(も)むしろ
  'n3m-g-d3ab6c': [
    { jp: '木曜日よりむしろ金曜日においでいただきたい。', reading: 'もくようびよりむしろきんようびにおいでいただきたい。', en: 'I would rather you came on Friday than on Thursday.', sourceId: '80049', source: 'tatoeba' },
    { jp: '彼は学者というよりむしろ小説家であると思う。', reading: 'かれはがくしゃというよりむしろしょうせつかであるとおもう。', en: 'I think he is not so much a scholar as a novelist.', sourceId: '108841', source: 'tatoeba' },
    { jp: '恥を忍んで生き永らえるよりむしろ死にたい。', reading: 'はじをしのんでせいきながらえるよりむしろしにたい。', en: 'I would die before I live on in shame.', sourceId: '126801', source: 'tatoeba' },
  ],
  // N3 さえ...たら
  'n3m-g-d3bf35': [
    { jp: '医者がもう少し早く来てくれてさえいたらなあ。', reading: 'いしゃがもうすこしはやくきてくれてさえいたらなあ。', en: 'If only the doctor had come a little sooner.', sourceId: '190927', source: 'tatoeba' },
    { jp: 'もし英語さえ出来たらきみは完璧なんだけど。', reading: 'もしえいごさえできたらきみはかんぺきなんだけど。', en: 'If you could only speak English, you would be perfect.', sourceId: '1099026', source: 'tatoeba' },
    { jp: '昨日その答えを知ってさえいたらなあ。', reading: 'きのうそのこたえをしってさえいたらなあ。', en: 'If only I had known the answer yesterday!', sourceId: '170086', source: 'tatoeba' },
  ],
  // N3 と言っている
  'n3m-g-d3ef7d': [
    { jp: '彼は自分の妻には常に誠実だったと言っている。', reading: 'かれはじぶんのつまにはつねにせいじつだったといっている。', en: 'He says he has always been true to his wife.', sourceId: '104969', source: 'tatoeba' },
    { jp: '彼は自分のことを偉大な政治家だと言っている。', reading: 'かれはじぶんのことをいだいなせいじかだといっている。', en: 'He describes himself as a great statesman.', sourceId: '105089', source: 'tatoeba' },
    { jp: 'はにかみ屋なのだ。君に会いたいと言っている。', reading: 'はにかみやなのだ。きみにあいたいといっている。', en: 'He\'s very shy. He says he wants to see you.', sourceId: '197932', source: 'tatoeba' },
  ],
  // N3 のは…ためだ
  'n3m-g-d7e891': [
    { jp: '私が新聞の存在価値を信じるのはそのためだ。', reading: 'わたしがしんぶんのそんざいかちをしんじるのはそのためだ。', en: 'That is why I believe in the Press.', sourceId: '167652', source: 'tatoeba' },
    { jp: '彼は自分が成功したのは勤勉のためだと考えた。', reading: 'かれはじぶんがせいこうしたのはきんべんのためだとかんがえた。', en: 'He attributed his success to hard work.', sourceId: '105146', source: 'tatoeba' },
    { jp: '彼は成功したのは勤勉のためだと考えた。', reading: 'かれはせいこうしたのはきんべんのためだとかんがえた。', en: 'He attributed his success to hard work.', sourceId: '103388', source: 'tatoeba' },
  ],
  // N3 くらいだ／ぐらいだ
  'n3m-g-d84028': [
    { jp: 'その国の美しさは言葉に表現できないくらいだ。', reading: 'そのくにのうつくしさはことばにひょうげんできないくらいだ。', en: 'The beautiful of that country is beyond description.', sourceId: '210617', source: 'tatoeba' },
    { jp: '彼女の能力はいくら評価してもたりないくらいだ。', reading: 'かのじょののうりょくはいくらひょうかしてもたりないくらいだ。', en: 'We cannot overestimate her ability.', sourceId: '94088', source: 'tatoeba' },
    { jp: 'その聴衆の人数はどれくらいだと思いますか。', reading: 'そのちょうしゅうのにんずうはどれくらいだとおもいますか。', en: 'How large is the audience?', sourceId: '207777', source: 'tatoeba' },
  ],
  // N3 なんでも
  'n3m-g-d84608': [
    { jp: '聞いた事をなんでもかんでも信じてはいけない。', reading: 'きいたことをなんでもかんでもしんじてはいけない。', en: 'Don\'t believe everything you hear.', sourceId: '83642', source: 'tatoeba' },
    { jp: '私の悩みに比べたら君の悩みなどなんでもない。', reading: 'わたしのなやみにくらべたらきみのなやみなどなんでもない。', en: 'As compared with my trouble, yours is nothing.', sourceId: '162947', source: 'tatoeba' },
    { jp: 'なんでも好きなものから召し上がってください。', reading: 'なんでもすきなものからめしあがってください。', en: 'Go ahead and start with anything you like.', sourceId: '198911', source: 'tatoeba' },
  ],
  // N3 のうちに
  'n3m-g-d8b3b0': [
    { jp: '彼は逃げるか逃げないかのうちにまた捕まった。', reading: 'かれはにげるかにげないかのうちにまたつかまった。', en: 'He had scarcely escaped when he was recaptured.', sourceId: '101713', source: 'tatoeba' },
    { jp: '私たちは桜が見頃のうちにワシントンに着いた。', reading: 'わたしたちはさくらがみごろのうちにワシントンについた。', en: 'We got to Washington in time for the cherry blossoms.', sourceId: '165748', source: 'tatoeba' },
    { jp: 'その橋は６ヶ月のうちに建てられねばならない。', reading: 'そのはしは[６|]かげつのうちにたてられねばならない。', en: 'The bridge must be built in six months.', sourceId: '211393', source: 'tatoeba' },
  ],
  // N3 ...としても
  'n3m-g-d95b40': [
    { jp: '彼女を病院に連れて行こうとしても無駄でした。', reading: 'かのじょをびょういんにつれてぎょうこうとしてもむだでした。', en: 'It was no use trying to take her to the hospital.', sourceId: '86085', source: 'tatoeba' },
    { jp: '彼に日本文学を紹介しようとしても意味がない。', reading: 'かれににっぽんぶんがくをしょうかいしようとしてもいみがない。', en: 'There is no point in trying to introduce Japanese literature to him.', sourceId: '118501', source: 'tatoeba' },
    { jp: '彼に賛成するように説得しようとしても無駄だ。', reading: 'かれにさんせいするようにせっとくしようとしてもむだだ。', en: 'It is useless to try to persuade him to agree.', sourceId: '118596', source: 'tatoeba' },
  ],
  // N3 なくちゃ
  'n3m-g-da00f1': [
    { jp: '彼の手紙に返事を出さなくちゃいけないかしら。', reading: 'かれのてがみにへんじをださなくちゃいけないかしら。', en: 'Should I reply to his letter?', sourceId: '117035', source: 'tatoeba' },
    { jp: '今日は衝動買いしないように気を付けなくちゃ。', reading: 'きょうはしょうどうかいしないようにきをつけなくちゃ。', en: 'Try not to buy anything on impulse today.', sourceId: '171574', source: 'tatoeba' },
    { jp: 'あいつの損を埋めてやらなくちゃならないんだ。', reading: 'あいつのそんをうめてやらなくちゃならないんだ。', en: 'I have to cover his loss.', sourceId: '234655', source: 'tatoeba' },
  ],
  // N3 そればかりか
  'n3m-g-da27e5': [
    { jp: 'そればかりか、会社の直営店の商品は、たいていよその店より高価だったのです。', reading: 'そればかりか、かいしゃのちょくえいてんのしょうひんは、たいていよそのみせよりこうかだったのです。', en: 'And not only that, the goods in the company shop were usually more expensive than elsewhere.', sourceId: '205522', source: 'tatoeba' },
  ],
  // N3 ～になれる
  'n3m-g-da3a11': [
    { jp: '彼は弁護士になれるという希望に執着していた。', reading: 'かれはべんごしになれるというきぼうにしゅうちゃくしていた。', en: 'He clung to the hope that he could be a lawyer.', sourceId: '100102', source: 'tatoeba' },
    { jp: '誰でも立派なピアニストになれるとは限らない。', reading: 'だれでもりっぱなピアニストになれるとはかぎらない。', en: 'Every man cannot be a good pianist.', sourceId: '136763', source: 'tatoeba' },
    { jp: '私たちは親友になれるかもしれないと思います。', reading: 'わたしたちはしんゆうになれるかもしれないとおもいます。', en: 'I think we could be great friends.', sourceId: '2127695', source: 'tatoeba' },
  ],
  // N3 そうしたら
  'n3m-g-daae58': [
    { jp: '手を貸してくれ、そうしたら君に一杯おごるから。', reading: 'てをかしてくれ、そうしたらきみにいっぱいおごるから。', en: 'Give me a hand. If you do, I\'ll buy you a drink later.', sourceId: '148619', source: 'tatoeba' },
    { jp: 'もう一杯飲もう。そうしたら、家まで送っていくよ。', reading: 'もういっぱいのもう。そうしたら、いえまでおくっていくよ。', en: 'Let\'s have one more drink, and then I\'ll take you back home.', sourceId: '194269', source: 'tatoeba' },
    { jp: '愛を取り去れ、そうしたら、我らの地球は墓となる。', reading: 'あいをとりされ、そうしたら、われらのちきゅうははかとなる。', en: 'Take away love, and our earth is a tomb!', sourceId: '868197', source: 'tatoeba' },
  ],
  // N3 切る
  'n3m-g-daf860': [
    { jp: '電話を切る前に良子ともう一度お願いします。', reading: 'でんわをきるまえにりょうこともういちどおねがいします。', en: 'Can I talk to Ryoko again before you hang up?', sourceId: '124646', source: 'tatoeba' },
    { jp: '自分の顔に仕返しをするために鼻をちょん切るな。', reading: 'じぶんのかおにしかえしをするためにはなをちょんぎるな。', en: 'Don\'t cut off your nose to spite your face.', sourceId: '149885', source: 'tatoeba' },
    { jp: 'どうやったら彼と縁を切ることが出来るだろうか。', reading: 'どうやったらかれとえにしをきることができるだろうか。', en: 'How can I get rid of him?', sourceId: '201168', source: 'tatoeba' },
  ],
  // N3 というより
  'n3m-g-dd909f': [
    { jp: '彼は学者というよりむしろ小説家であると思う。', reading: 'かれはがくしゃというよりむしろしょうせつかであるとおもう。', en: 'I think he is not so much a scholar as a novelist.', sourceId: '108841', source: 'tatoeba' },
    { jp: '彼はジャーナリストというよりはむしろ学者だ。', reading: 'かれはジャーナリストというよりはむしろがくしゃだ。', en: 'He is not so much a journalist as a scholar.', sourceId: '113546', source: 'tatoeba' },
    { jp: '彼女は美しいというよりはむしろ立派な女だ。', reading: 'かのじょはうつくしいというよりはむしろりっぱなおんなだ。', en: 'She is handsome rather than beautiful.', sourceId: '87096', source: 'tatoeba' },
  ],
  // N3 …からか／…せいか／…のか
  'n3m-g-ddbf30': [
    { jp: 'つべこべうるさいよ。やるのかやらないのか！？', reading: 'つべこべうるさいよ。やるのかやらないのか！？', en: 'Quit your bellyaching. You goin\' to do it, or not!?', sourceId: '75438', source: 'tatoeba' },
    { jp: 'どういった時事が公務員試験で出題されるのか。', reading: 'どういったじじがこうむいんしけんでしゅつだいされるのか。', en: 'What sort of current affairs appear in the civil service examination?', sourceId: '76531', source: 'tatoeba' },
    { jp: '今日君は来るのかなと思っていたところだよ。', reading: 'きょうくんはくるのかなとおもっていたところだよ。', en: 'I was wondering if you were going to show up today.', sourceId: '4881', source: 'tatoeba' },
  ],
  // N3 にすれば
  'n3m-g-de56a2': [
    { jp: '短気なのを別にすれば、彼女は申し分がない。', reading: 'たんきなのをべつにすれば、かのじょはもうしぶんがない。', en: 'Apart from her temper, she\'s all right.', sourceId: '127364', source: 'tatoeba' },
    { jp: 'どのようにすればこの問題を解決できますか。', reading: 'どのようにすればこのもんだいをかいけつできますか。', en: 'How shall we deal with this problem?', sourceId: '200349', source: 'tatoeba' },
    { jp: '銭厘を大切にすれば大金はおのずとたまる。', reading: 'せんりんをたいせつにすればたいきんはおのずとたまる。', en: 'Take care of the pence, and the pounds will take care of themselves.', sourceId: '141007', source: 'tatoeba' },
  ],
  // N3 いかに…ても
  'n3m-g-de6dda': [
    { jp: 'そのような偉大な人はいかに尊敬してもしすぎることはない。', reading: 'そのようないだいなひとはいかにそんけいしてもしすぎることはない。', en: 'You cannot respect such a great man too much.', sourceId: '212535', source: 'tatoeba' },
    { jp: 'いかに成功に近くても失敗は失敗。', reading: 'いかにせいこうにちかくてもしっぱいはしっぱい。', en: 'A miss is as good as a mile.', sourceId: '229278', source: 'tatoeba' },
    { jp: '彼の行為はいかにきびしく責めてもしすぎるということはない。', reading: 'かれのこういはいかにきびしくせめてもしすぎるということはない。', en: 'It is impossible to speak too severely of his conduct.', sourceId: '117403', source: 'tatoeba' },
  ],
  // N3 …はいうまでもない
  'n3m-g-dea9b2': [
    { jp: '勤勉が成功へのかぎであることはいうまでもない。', reading: 'きんべんがせいこうへのかぎであることはいうまでもない。', en: 'It goes without saying that diligence is a key to success.', sourceId: '179994', source: 'tatoeba' },
  ],
  // N3 いくらも…ない
  'n3m-g-df5b15': [
    { jp: '金はいくらも持ってない。', reading: 'かねはいくらももってない。', en: 'I have little money.', sourceId: '179739', source: 'tatoeba' },
  ],
  // N3 ところだった
  'n3m-g-df8a13': [
    { jp: '彼女はあやうく自転車にひかれるところだった。', reading: 'かのじょはあやうくじてんしゃにひかれるところだった。', en: 'She was nearly hit by a bicycle.', sourceId: '93383', source: 'tatoeba' },
    { jp: '電話が鳴った時、私達は外出するところだった。', reading: 'でんわがなったとき、わたしたちはがいしゅつするところだった。', en: 'We were all set to leave when the phone rang.', sourceId: '124732', source: 'tatoeba' },
    { jp: '私は食べ物が無いために餓死するところだった。', reading: 'わたしはたべものがないためにがしするところだった。', en: 'I should have starved to death for want of food.', sourceId: '155790', source: 'tatoeba' },
  ],
  // N3 によって/により/による
  'n3m-g-e039ba': [
    { jp: '場合によるがな、そうだったり、そうでなかったり。', reading: 'ばあいによるがな、そうだったり、そうでなかったり。', en: 'Depending on the case; sometimes it is so, sometimes not.', sourceId: '74931', source: 'tatoeba' },
    { jp: '例によって彼はまた時間どおりに現れなかった。', reading: 'れいによってかれはまたじかんどおりにあらわれなかった。', en: 'As is often the case with him, he didn\'t show up on time.', sourceId: '77690', source: 'tatoeba' },
    { jp: '例によって彼は新聞を読みながら食事をしている。', reading: 'れいによってかれはしんぶんをよみながらしょくじをしている。', en: 'As is his way, he eats reading a newspaper.', sourceId: '77688', source: 'tatoeba' },
  ],
  // N3 というものは...だ
  'n3m-g-e169f9': [
    { jp: '水というものは不思議なものだ。', reading: 'みずというものはふしぎなものだ。', en: 'Water is strange stuff.', sourceId: '143810', source: 'tatoeba' },
    { jp: '時間というものは早く経過するものだ。', reading: 'じかんというものははやくけいかするものだ。', en: 'Time runs on.', sourceId: '150607', source: 'tatoeba' },
    { jp: '金というものはすぐ無くなるものだ。', reading: 'かねというものはすぐなくなるものだ。', en: 'Money soon goes.', sourceId: '179761', source: 'tatoeba' },
  ],
  // N3 いうまでもなく
  'n3m-g-e1a55b': [
    { jp: '彼女は英語はいうまでもなく、ドイツ語を話す。', reading: 'かのじょはえいごはいうまでもなく、ドイツごをはなす。', en: 'Not only does she speak English, but also German.', sourceId: '91035', source: 'tatoeba' },
    { jp: '母は蛇はいうまでもなく、毛虫も嫌いでした。', reading: 'はははへびはいうまでもなく、けむしもきらいでした。', en: 'My mother disliked caterpillars, not to mention snakes.', sourceId: '82923', source: 'tatoeba' },
    { jp: '彼は、経験はいうまでもなく、知識もない。', reading: 'かれは、けいけんはいうまでもなく、ちしきもない。', en: 'He has no knowledge, not to mention experience.', sourceId: '115553', source: 'tatoeba' },
  ],
  // N3 てごらん
  'n3m-g-e1f612': [
    { jp: '眠い時はコーヒーを飲んで気分転換してごらん。', reading: 'ねむいときはコーヒーをのんできぶんてんかんしてごらん。', en: 'Refresh yourself with a cup of coffee when sleepy.', sourceId: '81003', source: 'tatoeba' },
    { jp: '一歩でも動いてごらん、崖から落ちてしまうよ。', reading: 'いちほでもうごいてごらん、がけからおちてしまうよ。', en: 'A single step, and you will fall over the cliff.', sourceId: '190065', source: 'tatoeba' },
    { jp: '彼女にどのくらいスープが欲しいかきいてごらん。', reading: 'かのじょにどのくらいスープがほしいかきいてごらん。', en: 'Ask her how much soup she wants.', sourceId: '95025', source: 'tatoeba' },
  ],
  // N3 たいして…ない
  'n3m-g-e2d460': [
    { jp: '最近は１ドルではたいして物が買えない。', reading: 'さいきんは[１|]ドルではたいしてものがかえない。', en: 'A dollar does not go very far these days.', sourceId: '170677', source: 'tatoeba' },
    { jp: '私はたいして料理がうまくないと思うのですが。', reading: 'わたしはたいしてりょうりがうまくないとおもうのですが。', en: 'I\'m afraid I\'m not much of a cook.', sourceId: '159632', source: 'tatoeba' },
    { jp: '報告してもたいして読まれない。', reading: 'ほうこくしてもたいしてよまれない。', en: 'Even if you report it, not many will read it.', sourceId: '11001301', source: 'tatoeba' },
  ],
  // N3 …ば…はずだ
  'n3m-g-e7d0de': [
    { jp: '普通の知能があればそれはわかるはずだ。', reading: 'ふつうのちのうがあればそれはわかるはずだ。', en: 'A person with average intelligence would understand that.', sourceId: '84896', source: 'tatoeba' },
    { jp: '君は今出発をすれば、当然間に合うはずだ。', reading: 'きみはいましゅっぱつをすれば、とうぜんまにあうはずだ。', en: 'You ought to be on time if you start now.', sourceId: '177289', source: 'tatoeba' },
    { jp: 'あなたは傘も持たないで雨の中を出かけるほどばかではなかったはずだ。', reading: 'あなたはかさももたないであめのなかをでかけるほどばかではなかったはずだ。', en: 'You should have known better than to go out in the rain without an umbrella.', sourceId: '232003', source: 'tatoeba' },
  ],
  // N3 といえば／というと／といったら =>
  'n3m-g-e8763f': [
    { jp: '旅行といえば、神戸に行ったことはありますか。', reading: 'りょこうといえば、こうべにいったことはありますか。', en: 'Speaking about trips, have you ever been to Kobe?', sourceId: '78183', source: 'tatoeba' },
    { jp: '趣味といえば、あなたは切手を集めていますか。', reading: 'しゅみといえば、あなたはきってをあつめていますか。', en: 'Speaking of hobbies, do you collect stamps?', sourceId: '148472', source: 'tatoeba' },
    { jp: '私たちはエジプトといえばナイル川を思い出す。', reading: 'わたしたちはエジプトといえばナイルかわをおもいだす。', en: 'We associate Egypt with the Nile.', sourceId: '166600', source: 'tatoeba' },
  ],
  // N3 ～わけでもない
  'n3m-g-e8adb4': [
    { jp: '彼は頭が切れるでもなく機知に富むわけでもない。', reading: 'かれはあたまがきれるでもなくきちにとむわけでもない。', en: 'He is not witty or bright.', sourceId: '101703', source: 'tatoeba' },
    { jp: '彼らの全員が今日の会合に出席しているわけでもない。', reading: 'かれらのぜんいんがきょうのかいごうにしゅっせきしているわけでもない。', en: 'Not all of them are present at the meeting today.', sourceId: '98456', source: 'tatoeba' },
    { jp: 'そして誰が責任をとるわけでもない。', reading: 'そしてだれがせきにんをとるわけでもない。', en: 'It isn\'t like anybody takes responsibility then anyway.', sourceId: '213490', source: 'tatoeba' },
  ],
  // N3 しまいそうだ
  'n3m-g-eacdf8': [
    { jp: 'この仕事に私の時間の大半は食われてしまいそうだ。', reading: 'このしごとにわたしのじかんのたいはんはくわれてしまいそうだ。', en: 'I fear this work will take up most of my time.', sourceId: '221830', source: 'tatoeba' },
  ],
  // N3 ば～のに/たら～のに
  'n3m-g-eb1430': [
    { jp: '彼が私たちのチームの選手であればいいのに。', reading: 'かれがわたしたちのチームのせんしゅであればいいのに。', en: 'I wish he were on our team.', sourceId: '120293', source: 'tatoeba' },
    { jp: '彼がどっちか決心してくれればいいのになあ。', reading: 'かれがどっちかけっしんしてくれればいいのになあ。', en: 'I wish he would make up his mind one way or other.', sourceId: '120781', source: 'tatoeba' },
    { jp: '彼がここに居て私たちを助けてくれればよいのに。', reading: 'かれがここにいてわたしたちをたすけてくれればよいのに。', en: 'Would that he were here to help us.', sourceId: '121011', source: 'tatoeba' },
  ],
  // N3 まもなく
  'n3m-g-eb78f3': [
    { jp: '天気予報によれば、まもなく梅雨に入るそうだ。', reading: 'てんきよほうによれば、まもなくつゆにはいるそうだ。', en: 'According to the weather forecast, the rainy season will set in before long.', sourceId: '125087', source: 'tatoeba' },
    { jp: '彼らはまもなくトップランナーに追いつくだろう。', reading: 'かれらはまもなくトップランナーにおいつくだろう。', en: 'They will catch up with the lead runner soon.', sourceId: '97664', source: 'tatoeba' },
    { jp: '彼はまもなく、ここの天候に慣れるでしょう。', reading: 'かれはまもなく、ここのてんこうになれるでしょう。', en: 'He will soon get used to the climate here.', sourceId: '110763', source: 'tatoeba' },
  ],
  // N3 いかに…か
  'n3m-g-ebc616': [
    { jp: '彼は法を守ることがいかに大切かを指摘した。', reading: 'かれはほうをまもることがいかにたいせつかをしてきした。', en: 'He pointed out how important it is to observe the law.', sourceId: '100045', source: 'tatoeba' },
    { jp: '何を話すかは、いかに話すかより重要である。', reading: 'なにをはなすかは、いかにはなすかよりじゅうようである。', en: 'What you\'re talking about is more important than how you say it.', sourceId: '187534', source: 'tatoeba' },
    { jp: 'この会合がいかに重要かを彼は全然わかっていない。', reading: 'このかいごうがいかにじゅうようかをかれはぜんぜんわかっていない。', en: 'Little does he realize how important this meeting is.', sourceId: '222684', source: 'tatoeba' },
  ],
  // N3 いくら…といっても
  'n3m-g-ec0b7d': [
    { jp: 'いくら壁が高いといっても、私も最初はおっかなびっくりでしたよ。', reading: 'いくらかべがたかいといっても、わたしもさいしょはおっかなびっくりでしたよ。', en: 'You\'re right when you say how high the wall is; I was nervous at first, too.', sourceId: '76867', source: 'tatoeba' },
  ],
  // N3 …とすれば
  'n3m-g-ec3559': [
    { jp: 'この明かりで字を読もうとすれば目を痛めるよ。', reading: 'このあかりでじをよもうとすればめをいためるよ。', en: 'You\'ll strain your eyes trying to read in this light.', sourceId: '219462', source: 'tatoeba' },
    { jp: 'この明かりで字を読もうとすれば目が悪くなるよ。', reading: 'このあかりでじをよもうとすればめがわるくなるよ。', en: 'You\'ll strain your eyes trying to read in this light.', sourceId: '219463', source: 'tatoeba' },
    { jp: '君の話が本当だとすれば、私は何をすべきだろうか。', reading: 'きみのはなしがほんとうだとすれば、わたしはなにをすべきだろうか。', en: 'Assuming your story is true, what should I do?', sourceId: '178002', source: 'tatoeba' },
  ],
  // N3 ところが
  'n3m-g-ecc296': [
    { jp: '私は彼女のドレスのシンプルなところが好きだ。', reading: 'わたしはかのじょのドレスのシンプルなところがすきだ。', en: 'I like the simplicity of her dress.', sourceId: '76081', source: 'tatoeba' },
    { jp: 'この電子辞書は携帯しやすいところが味噌です。', reading: 'このでんしじしょはけいたいしやすいところがみそです。', en: 'The good thing about this electronic dictionary is that it\'s easy to carry.', sourceId: '76728', source: 'tatoeba' },
    { jp: '北海道には見るべきところがたくさんあります。', reading: 'ほっかいどうにはみるべきところがたくさんあります。', en: 'There are a lot of places to see in Hokkaido.', sourceId: '82446', source: 'tatoeba' },
  ],
  // N3 に慣れる
  'n3m-g-eeac9c': [
    { jp: 'あなたはもうすぐ田舎の生活に慣れるでしょう。', reading: 'あなたはもうすぐいなかのせいかつになれるでしょう。', en: 'You will soon be used to rural life.', sourceId: '232383', source: 'tatoeba' },
    { jp: 'あなたはすぐに新しい大学生活に慣れるだろう。', reading: 'あなたはすぐにあたらしいだいがくせいかつになれるだろう。', en: 'You\'ll soon get accustomed to your new college life.', sourceId: '232656', source: 'tatoeba' },
    { jp: '彼はまもなく、ここの天候に慣れるでしょう。', reading: 'かれはまもなく、ここのてんこうになれるでしょう。', en: 'He will soon get used to the climate here.', sourceId: '110763', source: 'tatoeba' },
  ],
  // N3 かあるいは
  'n3m-g-eec334': [
    { jp: 'その木は実がならないかあるいは小さな実しかつけない。', reading: 'そのきはみがならないかあるいはちいさなじっしかつけない。', en: 'The trees are barren or bear only small fruit.', sourceId: '206539', source: 'tatoeba' },
    { jp: 'あなたかあるいは私が間違っている。', reading: 'あなたかあるいはわたしがまちがっている。', en: 'Either you or I am wrong.', sourceId: '234269', source: 'tatoeba' },
  ],
  // N3 やっぱり
  'n3m-g-f1015c': [
    { jp: 'やっぱり男手があると、作業の幅が広がるねぇ。', reading: 'やっぱりおとこでがあると、さぎょうのはばがひろがるねぇ。', en: 'When there\'s a man around, the work that can be done sure increases.', sourceId: '76381', source: 'tatoeba' },
    { jp: '買い物に行こうと思ったけど、やっぱりやめた。', reading: 'かいものにいこうとおもったけど、やっぱりやめた。', en: 'I thought about going shopping, but I decided not to in the end.', sourceId: '11834423', source: 'tatoeba' },
    { jp: 'やっぱりトムは信用できないって分かってたよ。', reading: 'やっぱりトムはしんようできないってわかってたよ。', en: 'I knew I couldn\'t trust Tom.', sourceId: '12378475', source: 'tatoeba' },
  ],
  // N3 いかにも
  'n3m-g-f25d26': [
    { jp: 'そんなふるまいをするなんていかにも彼らしい。', reading: 'そんなふるまいをするなんていかにもかれらしい。', en: 'It\'s characteristic of him to behave like that.', sourceId: '204196', source: 'tatoeba' },
    { jp: 'ここは、いかにも事故が起きそうな場所ですね。', reading: 'ここは、いかにもじこがおきそうなばしょですね。', en: 'This place is an accident waiting to happen.', sourceId: '11280725', source: 'tatoeba' },
    { jp: 'こんなおふざけはいかにもベーカー氏らしい。', reading: 'こんなおふざけはいかにもベーカーしらしい。', en: 'Such playfulness is characteristic of Mr Baker.', sourceId: '217491', source: 'tatoeba' },
  ],
  // N3 …たりして
  'n3m-g-f36a41': [
    { jp: '彼はプラットホームを行ったり来たりしていた。', reading: 'かれはプラットホームをおこなったりきたりしていた。', en: 'He was walking up and down the station platform.', sourceId: '111090', source: 'tatoeba' },
    { jp: '職人たちははしごを昇ったり降りたりしていた。', reading: 'しょくにんたちははしごをのぼったりおりたりしていた。', en: 'The workmen were climbing up and down the ladder.', sourceId: '145964', source: 'tatoeba' },
    { jp: '何人かの運転手は笑ったりわめいたりしていた。', reading: 'なんにんかのうんてんしゅはわらったりわめいたりしていた。', en: 'Some of the drivers were laughing and yelling.', sourceId: '187391', source: 'tatoeba' },
  ],
  // N3 つもりで
  'n3m-g-f38d12': [
    { jp: '清水の舞台から飛び降りたつもりで脱サラした。', reading: 'しみずのぶたいからとびおりたつもりでだつサラした。', en: 'Quitting my office job was a leap in the dark.', sourceId: '75953', source: 'tatoeba' },
    { jp: '彼女は文学研究するつもりでイタリアへ行った。', reading: 'かのじょはぶんがくけんきゅうするつもりでイタリアへいった。', en: 'She went to Italy in order to study literature.', sourceId: '86826', source: 'tatoeba' },
    { jp: '彼は文学を勉強するつもりでイタリアに行った。', reading: 'かれはぶんがくをべんきょうするつもりでイタリアにいった。', en: 'He went to Italy with a view to studying literature.', sourceId: '100200', source: 'tatoeba' },
  ],
  // N3 なんて…んだろう
  'n3m-g-f3b56f': [
    { jp: '「なんて私は幸福なんだろう」と彼女は言った。', reading: '「なんてわたしはこうふくなんだろう」とかのじょはいった。', en: '"How happy I am," she said.', sourceId: '236479', source: 'tatoeba' },
    { jp: 'ピアノってなんて高いんだろう！', reading: 'ピアノってなんてたかいんだろう！', en: 'Pianos are really expensive, aren\'t they?', sourceId: '197723', source: 'tatoeba' },
    { jp: 'あの飛行船はなんて巨大なんだろう。', reading: 'あのひこうせんはなんてきょだいなんだろう。', en: 'How huge that airship is!', sourceId: '230480', source: 'tatoeba' },
  ],
  // N3 通す
  'n3m-g-f4b5c8': [
    { jp: '彼女の反対はあるがそれをやり通すつもりだ。', reading: 'かのじょのはんたいはあるがそれをやりとおすつもりだ。', en: 'I\'m going to go through with it in spite of her opposition.', sourceId: '94063', source: 'tatoeba' },
    { jp: '契約書に署名する前にざっと目を通すべきである。', reading: 'けいやくしょにしょめいするまえにざっとめをとおすべきである。', en: 'You should look over the contract before you sign it.', sourceId: '176548', source: 'tatoeba' },
    { jp: '彼は全く有能で自分の立場を守り通すことができる。', reading: 'かれはまったくゆうのうでじぶんのたちばをまもりとおすことができる。', en: 'He is quite capable and can hold his own.', sourceId: '102945', source: 'tatoeba' },
  ],
  // N3 になると
  'n3m-g-f5f5dd': [
    { jp: '夕暮れ時になるとこの辺に人々が集まって来る。', reading: 'ゆうぐれどきになるとこのへんにひとびとがあつまってくる。', en: 'People gather around here when it gets dark.', sourceId: '79056', source: 'tatoeba' },
    { jp: '野球と言うことになるとあまり知らないのです。', reading: 'やきゅうということになるとあまりしらないのです。', en: 'When it comes to baseball, I don\'t know much.', sourceId: '79655', source: 'tatoeba' },
    { jp: '彼は議論になるときまってかんしゃくを起こす。', reading: 'かれはぎろんになるときまってかんしゃくをおこす。', en: 'He never gets into an argument without losing his temper.', sourceId: '108515', source: 'tatoeba' },
  ],
  // N3 …ば…だろう
  'n3m-g-f6a21b': [
    { jp: '彼らは費用を切りつめなければならないだろう。', reading: 'かれらはひようをきりつめなければならないだろう。', en: 'They will have to cut down their expenses.', sourceId: '96237', source: 'tatoeba' },
    { jp: '彼は銃なしでやっていかなければならないだろう。', reading: 'かれはじゅうなしでやっていかなければならないだろう。', en: 'He\'ll have to do without a gun.', sourceId: '104322', source: 'tatoeba' },
    { jp: '例えば君が１万ドル持っていればどうするだろうか。', reading: 'たとえばきみが[１|]まんドルもっていればどうするだろうか。', en: 'What would you do if you had, say, ten thousand dollars?', sourceId: '77697', source: 'tatoeba' },
  ],
  // N3 なんという
  'n3m-g-f6d117': [
    { jp: 'なんということ、未来は捨てられてしまった。', reading: 'なんということ、みらいはすてられてしまった。', en: 'For God\'s sake, tomorrow\'s left behind.', sourceId: '198855', source: 'tatoeba' },
    { jp: 'おたくのワンちゃんは、なんというお名前ですか？', reading: 'おたくのワンちゃんは、なんというおなまえですか？', en: 'What\'s the name of your dog?', sourceId: '3362316', source: 'tatoeba' },
    { jp: '頂上が雪でおおわれている山はなんという山ですか。', reading: 'ちょうじょうがゆきでおおわれているやまはなんというざんですか。', en: 'What is the name of the mountain whose top is covered with snow?', sourceId: '125846', source: 'tatoeba' },
  ],
  // N3 …ほうがよかった
  'n3m-g-f7fe33': [
    { jp: 'いっそのこと初めから家にいたほうがよかった。', reading: 'いっそのことはじめからいえにいたほうがよかった。', en: 'With all that we might have been better off just to have stayed home.', sourceId: '76866', source: 'tatoeba' },
    { jp: 'トムはメアリーに謝ったほうがよかったんだ。', reading: 'トムはメアリーにあやまったほうがよかったんだ。', en: 'Tom should have apologized to Mary.', sourceId: '8867944', source: 'tatoeba' },
    { jp: 'そんなことは言わないほうがよかったのに。', reading: 'そんなことはいわないほうがよかったのに。', en: 'It would have been better if you had left it unsaid.', sourceId: '204404', source: 'tatoeba' },
  ],
  // N3 がみえる
  'n3m-g-f884d0': [
    { jp: '傍観者にはゲームの大部分がみえる。', reading: 'ぼうかんしゃにはゲームのだいぶぶんがみえる。', en: 'Onlookers see most of the game.', sourceId: '82608', source: 'tatoeba' },
  ],
  // N3 上げる
  'n3m-g-f9cf59': [
    { jp: '零細小売店などは新年度には利益を上げるでしょう。', reading: 'れいさいこうりてんなどはしんねんどにはりえきをあげるでしょう。', en: 'Mom-and-pop stores will turn a profit in the new fiscal year.', sourceId: '77605', source: 'tatoeba' },
    { jp: 'ご返事をさし上げる前によく考えましょう。', reading: 'ごへんじをさしあげるまえによくかんがえましょう。', en: 'I must think it over before answering you.', sourceId: '217021', source: 'tatoeba' },
    { jp: '調節レバーを上に上げると座面の高さを調節できます。', reading: 'ちょうせつレバーをうえにあげるとざめんのたかさをちょうせつできます。', en: 'You can adjust the seat height by moving the adjustment lever up.', sourceId: '74508', source: 'tatoeba' },
  ],
  // N3 わざわざ
  'n3m-g-fa738d': [
    { jp: '私が困っているとき彼はわざわざ助けてくれた。', reading: 'わたしがこまっているときかれはわざわざたすけてくれた。', en: 'He went out of his way to help me when I was in trouble.', sourceId: '167725', source: 'tatoeba' },
    { jp: 'この雨の中、わざわざ来てもらってありがとう。', reading: 'このあめのなか、わざわざきてもらってありがとう。', en: 'Thank you for coming all the way in this rain.', sourceId: '222940', source: 'tatoeba' },
    { jp: 'トムさんはわざわざメアリーさんを助けました。', reading: 'トムさんはわざわざメアリーさんをたすけました。', en: 'Tom went out of his way to help Mary.', sourceId: '1490001', source: 'tatoeba' },
  ],
  // N3 なぜなら
  'n3m-g-fab827': [
    { jp: 'なぜなら彼の家にはお金が必要だったからです。', reading: 'なぜならかれのいえにはおかねがひつようだったからです。', en: 'Why? Because his family needed the money, that\'s why.', sourceId: '199222', source: 'tatoeba' },
    { jp: 'なぜなら私は古い言語を学んでいる学生だから。', reading: 'なぜならわたしはふるいげんごをまなんでいるがくせいだから。', en: 'Because I am a student of old languages.', sourceId: '199230', source: 'tatoeba' },
    { jp: '私は山に登る、なぜならそれがそこにあるからだ。', reading: 'わたしはやまにのぼる、なぜならそれがそこにあるからだ。', en: 'I climb mountains because they are there.', sourceId: '156657', source: 'tatoeba' },
  ],
  // N3 そのくせ
  'n3m-g-fb48aa': [
    { jp: '彼女はいつも少数の生徒をえこひいきしていて、そのくせ他の生徒には厳しい。', reading: 'かのじょはいつもしょうすうのせいとをえこひいきしていて、そのくせたのせいとにはきびしい。', en: 'She is always playing favorites with a few students but very strict with everyone else.', sourceId: '93258', source: 'tatoeba' },
  ],
  // N3 なかなか
  'n3m-g-fbb839': [
    { jp: '彼女は頭は悪いけど、なかなかいい体してるよ。', reading: 'かのじょはあたまはわるいけど、なかなかいいたいしてるよ。', en: 'She is not smart, but she is built.', sourceId: '87709', source: 'tatoeba' },
    { jp: '彼女はなかなかやるようだが、一流じゃないね。', reading: 'かのじょはなかなかやるようだが、いちりゅうじゃないね。', en: 'She\'s pretty good at it, but she lacks class.', sourceId: '91852', source: 'tatoeba' },
    { jp: '向こうにいるあの男の人はなかなか評判が良い。', reading: 'むこうにいるあのおとこのひとはなかなかひょうばんがよい。', en: 'That gentleman over there is well spoken of.', sourceId: '173869', source: 'tatoeba' },
  ],
  // N3 どうしても
  'n3m-g-fbca95': [
    { jp: '彼女の行儀の悪さはどうしてもがまんできない。', reading: 'かのじょのぎょうぎのわるさはどうしてもがまんできない。', en: 'I simply cannot put up with her manners.', sourceId: '94421', source: 'tatoeba' },
    { jp: '彼は私の忠告をどうしても聞こうとしなかった。', reading: 'かれはわたしのちゅうこくをどうしてもきこうとしなかった。', en: 'He would not listen to my advice.', sourceId: '105741', source: 'tatoeba' },
    { jp: '弟はどうしてもそこへ一人で行くと言い張った。', reading: 'おとうとはどうしてもそこへひとりでいくといいはった。', en: 'My brother insisted on going there alone.', sourceId: '125446', source: 'tatoeba' },
  ],
  // N3 くらい～はない
  'n3m-g-fd4c45': [
    { jp: '善いものでも汚れてしまったものが発する臭いくらい、ひどい悪臭はない。', reading: 'よいものでもよごれてしまったものがはっするくさいくらい、ひどいあくしゅうはない。', en: 'There is no odor so bad as that which arises from goodness tainted.', sourceId: '140926', source: 'tatoeba' },
  ],
  // N3 くらいの
  'n3m-g-fe58f3': [
    { jp: 'どのくらいの時間、その町に停車していますか。', reading: 'どのくらいのじかん、そのまちにていしゃしていますか。', en: 'How long will it stop there?', sourceId: '200421', source: 'tatoeba' },
    { jp: 'どのくらいの期間英語を勉強しているのですか。', reading: 'どのくらいのきかんえいごをべんきょうしているのですか。', en: 'How long have you been learning English?', sourceId: '200423', source: 'tatoeba' },
    { jp: '彼女は私たちと同じくらいの年齢の女の子だった。', reading: 'かのじょはわたしたちとおなじくらいのねんれいのおんなのこだった。', en: 'She was a girl of about our age.', sourceId: '89650', source: 'tatoeba' },
  ],
  // N4 ...もあれば...もある
  'n4m-g-02ee44': [
    { jp: 'みんな良いところもあれば悪いところもある。', reading: 'みんないいところもあればわるいところもある。', en: 'Everybody has some good points and bad points.', sourceId: '10359200', source: 'tatoeba' },
    { jp: '良いこともあれば悪いこともあるのだ。', reading: 'よいこともあればわるいこともあるのだ。', en: 'Where there\'s good, there\'s also bad.', sourceId: '2585036', source: 'tatoeba' },
    { jp: '赤いものもあれば白いのもある。', reading: 'あかいものもあればしろいのもある。', en: 'Some are red and others are white.', sourceId: '142281', source: 'tatoeba' },
  ],
  // N4 てみたらどう
  'n4m-g-0376f5': [
    { jp: '彼女は彼にそれをやってみたらどうと言った。', reading: 'かのじょはかれにそれをやってみたらどうといった。', en: 'She suggested that he try it.', sourceId: '87438', source: 'tatoeba' },
    { jp: '自分でそのことを調べてみたらどうですか。', reading: 'じぶんでそのことをしらべてみたらどうですか。', en: 'Why not look into the matter yourself?', sourceId: '149973', source: 'tatoeba' },
    { jp: '私は分かりません。トムに聞いてみたらどうですか？', reading: 'わたしはわかりません。トムにきいてみたらどうですか？', en: 'I don\'t know. Why don\'t you ask Tom?', sourceId: '2797568', source: 'tatoeba' },
  ],
  // N4 でございます
  'n4m-g-038590': [
    { jp: '大変申し訳ございませんが、もう品切れでございます。', reading: 'たいへんもうしわけございませんが、もうしなぎれでございます。', en: 'I\'m sorry, but we\'re out of stock.', sourceId: '1486968', source: 'tatoeba' },
    { jp: 'キッチン用品は、地下一階でございます。', reading: 'キッチンようひんは、ちかいっかいでございます。', en: 'Kitchenware is in the floor below ground level.', sourceId: '11561274', source: 'tatoeba' },
    { jp: '「何時をご希望でございますか？」「２時でいいですが」', reading: '「いつをごきぼうでございますか？」「[２|]じでいいですが」', en: '"What time would you like that for?" "Two o\'clock would be good."', sourceId: '187423', source: 'tatoeba' },
  ],
  // N4 ～とおもう（～と思う）
  'n4m-g-05391a': [
    { jp: '誰も彼を信用しないのを変だとおもうかい。', reading: 'だれもかれをしんようしないのをへんだとおもうかい。', en: 'Do you wonder why no one trusts him?', sourceId: '135701', source: 'tatoeba' },
    { jp: '彼は、そのファイルを安全だとおもうところに隠した。', reading: 'かれは、そのファイルをあんぜんだとおもうところにかくした。', en: 'He concealed the file in what he thought was a safe place.', sourceId: '115658', source: 'tatoeba' },
    { jp: 'あなたは間違っているとおもうのですが。', reading: 'あなたはまちがっているとおもうのですが。', en: 'I think that you\'re wrong.', sourceId: '232145', source: 'tatoeba' },
  ],
  // N4 ござる／ございます
  'n4m-g-083f8c': [
    { jp: '私の駄文を見ていただきありがとうございます。', reading: 'わたしのだぶんをみていただきありがとうございます。', en: 'Thank you for looking at my poor scribblings.', sourceId: '74297', source: 'tatoeba' },
    { jp: '親切なお手紙をいただきありがとうございます。', reading: 'しんせつなおてがみをいただきありがとうございます。', en: 'I appreciate your kind letter.', sourceId: '144795', source: 'tatoeba' },
    { jp: '助けてくださって本当にありがとうございます。', reading: 'たすけてくださってほんとうにありがとうございます。', en: 'I am very much obliged to you for your help.', sourceId: '147382', source: 'tatoeba' },
  ],
  // N4 てみせる
  'n4m-g-084748': [
    { jp: 'どんな手を使ってでも勝ちとってみせる。', reading: 'どんなてをつかってでもかちとってみせる。', en: 'I\'ll win no matter what it takes.', sourceId: '199417', source: 'tatoeba' },
    { jp: '弁護士は依頼人の無罪を証明してみせる。', reading: 'べんごしはいらいじんのむざいをしょうめいしてみせる。', en: 'The lawyer will try to show that her client is innocent.', sourceId: '1485369', source: 'tatoeba' },
    { jp: '石にかじりついても成功してみせる。', reading: 'いしにかじりついてもせいこうしてみせる。', en: 'I will succeed at any cost.', sourceId: '142353', source: 'tatoeba' },
  ],
  // N4 させていただけませんか
  'n4m-g-0adaa5': [
    { jp: 'しばらく考えさせていただけませんか？', reading: 'しばらくかんがえさせていただけませんか？', en: 'Would you let me think about it for a while?', sourceId: '3447236', source: 'tatoeba' },
  ],
  // N4 始める
  'n4m-g-0bcaec': [
    { jp: '明日仕事を始めるのはご都合がよいでしょうか。', reading: 'あしたしごとをはじめるのはごつごうがよいでしょうか。', en: 'Will it be convenient for you to start work tomorrow?', sourceId: '80306', source: 'tatoeba' },
    { jp: '彼は事業を始めるのに十分なお金が手に入った。', reading: 'かれはじぎょうをはじめるのにじゅうぶんなおかねがてにはいった。', en: 'Enough money was available for him to begin his business.', sourceId: '105380', source: 'tatoeba' },
    { jp: '誰でも一番先に帰宅した者が夕食を作り始める。', reading: 'だれでもいちばんさきにきたくしたものがゆうしょくをつくりはじめる。', en: 'Whoever gets home first starts cooking the supper.', sourceId: '136818', source: 'tatoeba' },
  ],
  // N4 ないと～ない
  'n4m-g-0d5e06': [
    { jp: '新聞記者は事実を正確につかまないといけない。', reading: 'しんぶんきしゃはじじつをせいかくにつかまないといけない。', en: 'The newspaperman should get his facts straight.', sourceId: '145109', source: 'tatoeba' },
    { jp: '君は規則正しい習慣を身につけないといけない。', reading: 'きみはきそくただしいしゅうかんをみにつけないといけない。', en: 'You must form regular habits.', sourceId: '177365', source: 'tatoeba' },
    { jp: '君はいますぐ医者にみてもらわないといけない。', reading: 'きみはいますぐいしゃにみてもらわないといけない。', en: 'It is necessary for you to see a doctor at once.', sourceId: '177902', source: 'tatoeba' },
  ],
  // N4 まだ～ていない
  'n4m-g-131499': [
    { jp: '彼がまだ来ていない。何か起きたのかもしれない。', reading: 'かれがまだきていない。なにかおきたのかもしれない。', en: 'He has not come yet. Something may have happened to him.', sourceId: '120715', source: 'tatoeba' },
    { jp: '私達が招待した人でまだきていない人はいますか。', reading: 'わたしたちがしょうたいしたひとでまだきていないひとはいますか。', en: 'Is there anyone we invited who hasn\'t come yet?', sourceId: '152045', source: 'tatoeba' },
    { jp: '郵便配達人がまだ来ていないのはおかしい。', reading: 'ゆうびんはいたつじんがまだきていないのはおかしい。', en: 'It is funny that the mailman hasn\'t come yet.', sourceId: '79155', source: 'tatoeba' },
  ],
  // N4 じゃないだろうか
  'n4m-g-14f095': [
    { jp: 'トムは僕を殺そうとしているんじゃないだろうか。', reading: 'トムはぼくをころそうとしているんじゃないだろうか。', en: 'I wonder if Tom is trying to kill me.', sourceId: '4216177', source: 'tatoeba' },
    { jp: '間に合わないんじゃないだろうか。', reading: 'まにあわないんじゃないだろうか。', en: 'I\'m afraid not.', sourceId: '183776', source: 'tatoeba' },
  ],
  // N4 次のように
  'n4m-g-176c8a': [
    { jp: '職員の選考に関する規則を次のように定める。', reading: 'しょくいんのせんこうにかんするきそくをつぎのようにさだめる。', en: 'Rules in connection with staff selection are set as follows.', sourceId: '76000', source: 'tatoeba' },
    { jp: '学長は学生たちに次のように語りかけた。', reading: 'がくちょうはがくせいたちにつぎのようにかたりかけた。', en: 'The president addressed his students as follows.', sourceId: '2129346', source: 'tatoeba' },
    { jp: '４１８号室に行く途中、彼は次のように思い始めました。', reading: '[４|][１|][８|]ごうしつにいくとちゅう、かれはつぎのようにおもいはじめました。', en: 'The following is what he started to think, as he made his way to room 418.', sourceId: '235237', source: 'tatoeba' },
  ],
  // N4 からつくる/でつくる
  'n4m-g-17bd5c': [
    { jp: '彼女は洋服は全部注文でつくる。', reading: 'かのじょはようふくはぜんぶちゅうもんでつくる。', en: 'She has all her suits made to order.', sourceId: '86371', source: 'tatoeba' },
  ],
  // N4 ～く/ ～にする
  'n4m-g-18306f': [
    { jp: '彼女をしばらく遠くにおいておくことにするよ。', reading: 'かのじょをしばらくとおくにおいておくことにするよ。', en: 'I\'m going to keep my distance from her for a while.', sourceId: '86144', source: 'tatoeba' },
    { jp: 'ちなみに、それはこの話の後日談にする予定です。', reading: 'ちなみに、それはこのはなしのごじつだんにするよていです。', en: 'By the way, I plan to do that for this story\'s sequel.', sourceId: '74217', source: 'tatoeba' },
    { jp: '「あっそ」と流すのもよし、本気にするのもよし。', reading: '「あっそ」とながすのもよし、ほんきにするのもよし。', en: 'You can let it slide with a "oh?" or you can take it seriously.', sourceId: '74680', source: 'tatoeba' },
  ],
  // N4 てしまった
  'n4m-g-1adfa8': [
    { jp: '僕は会った瞬間に彼女を好きになってしまった。', reading: 'ぼくはあったしゅんかんにかのじょをすきになってしまった。', en: 'I took to her the moment I met her.', sourceId: '81978', source: 'tatoeba' },
    { jp: '僕はお父さんが帰ってくる前に眠ってしまった。', reading: 'ぼくはおとうさんがかえってくるまえにねむってしまった。', en: 'I fell asleep before my father came home.', sourceId: '82118', source: 'tatoeba' },
    { jp: '僕がまだ寝ている時間に彼に来られてしまった。', reading: 'ぼくがまだねているじかんにかれにきたられてしまった。', en: 'I had him come while I was still in bed.', sourceId: '82394', source: 'tatoeba' },
  ],
  // N4 によって～られる
  'n4m-g-1c7b93': [
    { jp: '人は交わる仲間によって知られるということができよう。', reading: 'ひとはまじわるなかまによってしられるということができよう。', en: 'It may be said that a man is known by the company he keeps.', sourceId: '144498', source: 'tatoeba' },
    { jp: '一等賞は彼によって勝ち取られるかもしれません。', reading: 'いっとうしょうはかれによってかちとられるかもしれません。', en: 'The first prize may be won by him.', sourceId: '190291', source: 'tatoeba' },
    { jp: 'これらの窓は彼によって開けられる。', reading: 'これらのまどはかれによってあけられる。', en: 'These windows are opened by him.', sourceId: '217832', source: 'tatoeba' },
  ],
  // N4 てくれる
  'n4m-g-1f5f5a': [
    { jp: '僕は彼らを和解させてくれるように彼に頼んだ。', reading: 'ぼくはかれらをわかいさせてくれるようにかれにたのんだ。', en: 'I asked him to reconcile them with each other.', sourceId: '81787', source: 'tatoeba' },
    { jp: '彼女は私に宿題を手伝ってくれるように頼んだ。', reading: 'かのじょはわたしにしゅくだいをてつだってくれるようにたのんだ。', en: 'She asked me to help her with her assignment.', sourceId: '89492', source: 'tatoeba' },
    { jp: '彼女は私たちの世話をすべてしてくれるだろう。', reading: 'かのじょはわたしたちのせわをすべてしてくれるだろう。', en: 'She will take care of everything for us.', sourceId: '89622', source: 'tatoeba' },
  ],
  // N4 てもよろしいでしょうか
  'n4m-g-210b92': [
    { jp: 'もう失礼させてもらってもよろしいでしょうか。', reading: 'もうしつれいさせてもらってもよろしいでしょうか。', en: 'May I be excused?', sourceId: '194177', source: 'tatoeba' },
    { jp: 'そのお仕事、お任せしてもよろしいでしょうか。', reading: 'そのおしごと、おまかせしてもよろしいでしょうか。', en: 'Can I entrust the task to you?', sourceId: '213298', source: 'tatoeba' },
    { jp: 'お宅の電話をお借りしてもよろしいでしょうか。', reading: 'おたくのでんわをおかりしてもよろしいでしょうか。', en: 'May I use your telephone?', sourceId: '226888', source: 'tatoeba' },
  ],
  // N4 てもいい
  'n4m-g-214d69': [
    { jp: '彼女は、今ごろは当然着いてもいいはずなのに。', reading: 'かのじょは、いまごろはとうぜんついてもいいはずなのに。', en: 'She ought to have arrived by now.', sourceId: '93743', source: 'tatoeba' },
    { jp: '朝食のメニューの中から注文してもいいですか。', reading: 'ちょうしょくのメニューのなかからちゅうもんしてもいいですか。', en: 'Can I order from the breakfast menu?', sourceId: '126208', source: 'tatoeba' },
    { jp: '壁を塗り終えたら、すぐに帰宅してもいいよ。', reading: 'かべをぬりおえたら、すぐにきたくしてもいいよ。', en: 'As soon as you get the wall painted, you can go home.', sourceId: '83442', source: 'tatoeba' },
  ],
  // N4 ではなくて
  'n4m-g-22b3cb': [
    { jp: '私がほしいのは、紅茶ではなくてコーヒーです。', reading: 'わたしがほしいのは、こうちゃではなくてコーヒーです。', en: 'It is not tea but coffee that I want.', sourceId: '167927', source: 'tatoeba' },
    { jp: '彼女は私の母ではなくて私の一番上の姉なんです。', reading: 'かのじょはわたしのははではなくてわたしのいちばんうえのあねなんです。', en: 'She is not my mother but my oldest sister.', sourceId: '89327', source: 'tatoeba' },
    { jp: '大事業は力ではなくて、忍耐によって達成される。', reading: 'だいじぎょうはちからではなくて、にんたいによってたっせいされる。', en: 'Great works are perfumed not by strength but by perseverance.', sourceId: '137518', source: 'tatoeba' },
  ],
  // N4 てしまっていた
  'n4m-g-27b800': [
    { jp: '私が目を覚ますと、彼はもう行ってしまっていた。', reading: 'わたしがめをさますと、かれはもういってしまっていた。', en: 'I awoke to find that he had already gone.', sourceId: '167397', source: 'tatoeba' },
    { jp: '駅に着いたら列車はもうすでに出てしまっていた。', reading: 'えきについたられっしゃはもうすでにでてしまっていた。', en: 'The train had already started when I got to the station.', sourceId: '188924', source: 'tatoeba' },
    { jp: 'あなたが帰ったとき、私はもう出てしまっていた。', reading: 'あなたがかえったとき、わたしはもうでてしまっていた。', en: 'By the time you came back, I\'d already left.', sourceId: '431669', source: 'tatoeba' },
  ],
  // N4 ばいいですか
  'n4m-g-302c2d': [
    { jp: '救急診察を受けるにはどこへ行けばいいですか。', reading: 'きゅうきゅうしんさつをうけるにはどこへいけばいいですか。', en: 'Where should I go to be admitted into the emergency room?', sourceId: '182410', source: 'tatoeba' },
    { jp: '３３ゲートへは、どうやって行けばいいですか。', reading: '[３|][３|]ゲートへは、どうやっていけばいいですか。', en: 'How do I get to Gate 33?', sourceId: '235358', source: 'tatoeba' },
    { jp: '明日の朝、何時にロビーに集合すればいいですか？', reading: 'あしたのあさ、なんじにロビーにしゅうごうすればいいですか？', en: 'What time should I come to the lobby tomorrow?', sourceId: '80543', source: 'tatoeba' },
  ],
  // N4 いただきます
  'n4m-g-32542e': [
    { jp: '手荷物は１人１０キロに限らせていただきます。', reading: 'てにもつは[１|]にん[１|][０|]キロにかぎらせていただきます。', en: 'We limit baggage to ten kilograms each.', sourceId: '148608', source: 'tatoeba' },
    { jp: '早急に彼らの釈放に手をうっていただきます。', reading: 'そうきゅうにかれらのしゃくほうにてをうっていただきます。', en: 'You must take action for their release quickly.', sourceId: '140509', source: 'tatoeba' },
    { jp: '失礼ですが御提案を修正させていただきます。', reading: 'しつれいですがごていあんをしゅうせいさせていただきます。', en: 'I beg to modify your proposal.', sourceId: '149555', source: 'tatoeba' },
  ],
  // N4 ばかりです
  'n4m-g-35f072': [
    { jp: '彼は駐日アメリカ大使に命じられたばかりです。', reading: 'かれはちゅうにちアメリカたいしにめいじられたばかりです。', en: 'He has just been appointed the U.S. Ambassador to Japan.', sourceId: '102125', source: 'tatoeba' },
    { jp: 'トムさんがボストンから帰ってきたばかりです。', reading: 'トムさんがボストンからかえってきたばかりです。', en: 'Tom has just come back from Boston.', sourceId: '1508614', source: 'tatoeba' },
    { jp: 'このパンはオーブンから出してきたばかりです。', reading: 'このパンはオーブンからだしてきたばかりです。', en: 'This bread is fresh from the oven.', sourceId: '3420087', source: 'tatoeba' },
  ],
  // N4 じゃないが
  'n4m-g-3a2041': [
    { jp: '私は金持ちじゃないが捧げられるものがたくさんある。', reading: 'わたしはかねもちじゃないがささげられるものがたくさんある。', en: 'I\'m not rich but have so much to offer.', sourceId: '157562', source: 'tatoeba' },
    { jp: '自慢じゃないがこのクラブでは私が一番ゴルフがうまいと思う。', reading: 'じまんじゃないがこのクラブではわたしがいちばんゴルフがうまいとおもう。', en: 'I flatter myself that I\'m the best golfer in the club.', sourceId: '149714', source: 'tatoeba' },
    { jp: '自慢じゃないが僕は通知表の家庭科で３以上を取ったことがない。１０段階評価で。', reading: 'じまんじゃないがぼくはつうちひょうのかていかで[３|]いじょうをとったことがない。[１|][０|]だんかいひょうかで。', en: 'I don\'t want to boast, but I\'ve never gotten better than a 3 on my report card for home economics. Out of 10 that is.', sourceId: '75565', source: 'tatoeba' },
  ],
  // N4 尊敬語
  'n4m-g-3a5e09': [
    { jp: '目上の人のすることについて話す時、尊敬語を使います。', reading: 'めうえのひとのすることについてはなすとき、そんけいごをつかいます。', en: 'When speaking about your superiors\' actions, you use respectful language.', sourceId: '74806', source: 'tatoeba' },
  ],
  // N4 んですが
  'n4m-g-3b1ad7': [
    { jp: 'すみません、お箸を落としてしまったんですが。', reading: 'すみません、おはしをおとしてしまったんですが。', en: 'Excuse me, I dropped my chopsticks.', sourceId: '2233267', source: 'tatoeba' },
    { jp: '貸し切りバスを一台都合して欲しいんですが。', reading: 'かしきりバスをいちだいつごうしてほしいんですが。', en: 'I want to charter a bus.', sourceId: '137884', source: 'tatoeba' },
    { jp: '私はアメリカで医学を学ぶつもりだったんですが。', reading: 'わたしはアメリカでいがくをまなぶつもりだったんですが。', en: 'I intended to study medicine in America.', sourceId: '161527', source: 'tatoeba' },
  ],
  // N4 てはいけない
  'n4m-g-3b40e1': [
    { jp: 'メーカーの謳い文句を迂闊に信じてはいけない。', reading: 'メーカーのうたいもんくをうかつにしんじてはいけない。', en: 'You mustn\'t carelessly believe the maker\'s motto.', sourceId: '76395', source: 'tatoeba' },
    { jp: '忘れてはいけないので彼女の宛名を書き留めた。', reading: 'わすれてはいけないのでかのじょのあてなをかきとめた。', en: 'I wrote down her address so that I wouldn\'t forget it.', sourceId: '82558', source: 'tatoeba' },
    { jp: '聞いた事をなんでもかんでも信じてはいけない。', reading: 'きいたことをなんでもかんでもしんじてはいけない。', en: 'Don\'t believe everything you hear.', sourceId: '83642', source: 'tatoeba' },
  ],
  // N4 ...もらおう
  'n4m-g-3baf82': [
    { jp: '明日歯医者さんに診てもらおうと思っています。', reading: 'あしたはいしゃさんにみてもらおうとおもっています。', en: 'I am going to see the dentist tomorrow.', sourceId: '80298', source: 'tatoeba' },
    { jp: '社の弁護士に暫定合意の内容を吟味してもらおう。', reading: 'しゃのべんごしにざんていごういのないようをぎんみしてもらおう。', en: 'We\'ll have our firm\'s attorneys look through the provisional agreement.', sourceId: '149234', source: 'tatoeba' },
    { jp: 'いくらもらおうと、そんなのする気ないから。', reading: 'いくらもらおうと、そんなのするきないから。', en: 'I\'m not willing to do that, no matter how much you pay me.', sourceId: '11735145', source: 'tatoeba' },
  ],
  // N4 必要がある
  'n4m-g-3c8852': [
    { jp: '靴が小さすぎるから新しいのを買う必要があるな。', reading: 'くつがちいさすぎるからあたらしいのをかうひつようがあるな。', en: 'My shoes are too small. I need new ones.', sourceId: '5123', source: 'tatoeba' },
    { jp: '早急にこの問題について議論する必要がある。', reading: 'そうきゅうにこのもんだいについてぎろんするひつようがある。', en: 'It\'s necessary to discuss the problem without delay.', sourceId: '140511', source: 'tatoeba' },
    { jp: '申込書は全ページにもれなく記入する必要がある。', reading: 'もうしこみしょはぜんページにもれなくきにゅうするひつようがある。', en: 'It is necessary to complete all pages of the application form.', sourceId: '145010', source: 'tatoeba' },
  ],
  // N4 もうすこし
  'n4m-g-3cbaf4': [
    { jp: 'このお肉をもうすこし焼いてくださいませんか。', reading: 'このおにくをもうすこしやいてくださいませんか。', en: 'Could you cook this meat a little more?', sourceId: '223928', source: 'tatoeba' },
    { jp: 'この料理をもうすこし温めてもらえませんか。', reading: 'このりょうりをもうすこしあたためてもらえませんか。', en: 'Could you heat this dish?', sourceId: '219187', source: 'tatoeba' },
    { jp: 'もうすこしで車にはねられるとこだった。', reading: 'もうすこしでくるまにはねられるとこだった。', en: 'I was nearly hit by a car.', sourceId: '194417', source: 'tatoeba' },
  ],
  // N4 丁寧語
  'n4m-g-3db9ae': [
    { jp: 'ある意味では、丁寧語は気さくな雰囲気を壊す。', reading: 'あるいみでは、ていねいごはきさくなふんいきをこわす。', en: 'Polite language, in a sense, spoils a casual atmosphere.', sourceId: '229907', source: 'tatoeba' },
  ],
  // N4 てみると
  'n4m-g-3e0cbf': [
    { jp: 'ここのソースは舐めてみるとちょっと塩っぱい。', reading: 'ここのソースはなめてみるとちょっとしょっぱい。', en: 'If you taste this sauce you\'ll find it a bit salty.', sourceId: '74117', source: 'tatoeba' },
    { jp: '目が覚めてみると我々は大海原を漂流していた。', reading: 'めがさめてみるとわれわれはだいうなばらをひょうりゅうしていた。', en: 'When we awoke, we were adrift on the open sea.', sourceId: '80006', source: 'tatoeba' },
    { jp: '彼は気がついてみると公園のベンチに寝ていた。', reading: 'かれはきがついてみるとこうえんのベンチにねていた。', en: 'He found himself lying on a bench in the park.', sourceId: '108578', source: 'tatoeba' },
  ],
  // N4 たいへんな...
  'n4m-g-404e58': [
    { jp: '日照り続きが収穫にたいへんな損害を与えた。', reading: 'ひでりつづきがしゅうかくにたいへんなそんがいをあたえた。', en: 'The drought did severe damage to the harvest.', sourceId: '122861', source: 'tatoeba' },
    { jp: '彼女は試験に合格するために、たいへんな努力をした。', reading: 'かのじょはしけんにごうかくするために、たいへんなどりょくをした。', en: 'She made great efforts to pass the examination.', sourceId: '89216', source: 'tatoeba' },
    { jp: 'この資料を翻訳するにはたいへんな忍耐を必要とする。', reading: 'このしりょうをほんやくするにはたいへんなにんたいをひつようとする。', en: 'Translating this material calls for a lot of patience.', sourceId: '221696', source: 'tatoeba' },
  ],
  // N4 てすみません
  'n4m-g-407d50': [
    { jp: '足手まといになる子供をお頼みしてすみません。', reading: 'あしてまといになるこどもをおたのみしてすみません。', en: 'I am sorry to encumber you with the children.', sourceId: '139838', source: 'tatoeba' },
    { jp: 'すっかり散財をおかけしてしまってすみません。', reading: 'すっかりさんざいをおかけしてしまってすみません。', en: 'I\'m sorry to put you to such great expense.', sourceId: '214669', source: 'tatoeba' },
    { jp: 'お忙しい中、お呼び立てしてすみませんでした。', reading: 'おいそがしいなか、およびたてしてすみませんでした。', en: 'I am sorry to have called you out of your busy schedule.', sourceId: '9866590', source: 'tatoeba' },
  ],
  // N4 てよかった
  'n4m-g-413775': [
    { jp: '本当にここに来てよかったなって思ってます。', reading: 'ほんとうにここにきてよかったなっておもってます。', en: 'I\'m really glad I came here.', sourceId: '3567658', source: 'tatoeba' },
    { jp: '久しぶりに話せてよかったよ。また話そうね。', reading: 'ひさしぶりにはなせてよかったよ。またはなそうね。', en: 'It was good chatting like old times. Let\'s talk again some time.', sourceId: '3740659', source: 'tatoeba' },
    { jp: 'こちらこそ、私もお会いできてよかったです。', reading: 'こちらこそ、わたしもおあいできてよかったです。', en: 'Likewise, it was nice to meet you.', sourceId: '5082156', source: 'tatoeba' },
  ],
  // N4 てちょうだい
  'n4m-g-41dbfd': [
    { jp: '新聞をやめて私の言うことを聞いてちょうだい。', reading: 'しんぶんをやめてわたしのいうことをきいてちょうだい。', en: 'Will you put down that paper and listen to me?', sourceId: '145121', source: 'tatoeba' },
    { jp: 'ことあるごとに呼び出すのはやめてちょうだい。', reading: 'ことあるごとによびだすのはやめてちょうだい。', en: 'Could you please stop calling me at every opportunity you can get?', sourceId: '10906819', source: 'tatoeba' },
    { jp: 'トム、私に手紙を読んで聞かせてちょうだい。', reading: 'トム、わたしにてがみをよんできかせてちょうだい。', en: 'I\'m going to have you read the letter to me, Tom.', sourceId: '200232', source: 'tatoeba' },
  ],
  // N4 ...もあり...もある
  'n4m-g-4249d0': [
    { jp: 'Ｄ．Ｈ．ロレンスは小説家でもあり詩人でもある。', reading: 'でぃー．えいち．ロレンスはしょうせつかでもありしじんでもある。', en: 'D.H. Lawrence is a novelist and poet.', sourceId: '234859', source: 'tatoeba' },
    { jp: 'この本はおもしろくもあり有益でもある。', reading: 'このほんはおもしろくもありゆうえきでもある。', en: 'This book is at once interesting and instructive.', sourceId: '219713', source: 'tatoeba' },
    { jp: '彼は、医者でもあり作家でもあるのです。', reading: 'かれは、いしゃでもありさっかでもあるのです。', en: 'He is both a doctor and a writer.', sourceId: '11195147', source: 'tatoeba' },
  ],
  // N4 てあげる
  'n4m-g-42ef5a': [
    { jp: '人のためにドアを開けてあげるのは礼儀正しい。', reading: 'ひとのためにドアをあけてあげるのはれいぎただしい。', en: 'It is polite to open doors for people.', sourceId: '144636', source: 'tatoeba' },
    { jp: '私なら仕事を手伝ってあげることができたのに。', reading: 'わたしならしごとをてつだってあげることができたのに。', en: 'I could have helped you with your work.', sourceId: '164851', source: 'tatoeba' },
    { jp: '外が見れるように、カーテンを開けてあげるね。', reading: 'そとがみれるように、カーテンをあけてあげるね。', en: 'I\'ll open the curtain for you to look out.', sourceId: '179047', source: 'tatoeba' },
  ],
  // N4 てみたら
  'n4m-g-4372b4': [
    { jp: 'その問題はやってみたら易しいことが分かった。', reading: 'そのもんだいはやってみたらやさしいことがわかった。', en: 'I found the problem was easy.', sourceId: '206446', source: 'tatoeba' },
    { jp: '彼女は彼にそれをやってみたらどうと言った。', reading: 'かのじょはかれにそれをやってみたらどうといった。', en: 'She suggested that he try it.', sourceId: '87438', source: 'tatoeba' },
    { jp: '久しぶりに食べてみたら、全然辛くなかった！', reading: 'ひさしぶりにたべてみたら、ぜんぜんからくなかった！', en: 'When I ate it for the first time in a while, it wasn\'t spicy at all!', sourceId: '9275746', source: 'tatoeba' },
  ],
  // N4 てほしい
  'n4m-g-439fda': [
    { jp: '彼女は私にいっしょにきてほしいと思っている。', reading: 'かのじょはわたしにいっしょにきてほしいとおもっている。', en: 'She wants me to go with her.', sourceId: '89580', source: 'tatoeba' },
    { jp: '彼らは職を与えてほしいと政府に陳情している。', reading: 'かれらはしょくをあたえてほしいとせいふにちんじょうしている。', en: 'They are crying to the government to find employment for them.', sourceId: '96821', source: 'tatoeba' },
    { jp: '出かける前に明確な計画を立てておいてほしい。', reading: 'でかけるまえにめいかくなけいかくをたてておいてほしい。', en: 'I want you to have a definite plan before you leave.', sourceId: '147785', source: 'tatoeba' },
  ],
  // N4 のは…からだ
  'n4m-g-44bb8a': [
    { jp: '彼女は失敗したのは病気したからだと言った。', reading: 'かのじょはしっぱいしたのはびょうきしたからだといった。', en: 'She attributed her failure to illness.', sourceId: '88929', source: 'tatoeba' },
    { jp: '彼が赤い顔をしていたのは怒っていたからだ。', reading: 'かれがあかいかおをしていたのはおこっていたからだ。', en: 'His red face showed his anger.', sourceId: '119700', source: 'tatoeba' },
    { jp: '彼が帰国の腹を決めたのは病気だったからだ。', reading: 'かれがきこくのはらをきめたのはびょうきだったからだ。', en: 'It was because he was ill that he decided to return home.', sourceId: '120486', source: 'tatoeba' },
  ],
  // N4 くださいませんか
  'n4m-g-477fcb': [
    { jp: '私のためにどうか戸を開けてくださいませんか。', reading: 'わたしのためにどうかとをあけてくださいませんか。', en: 'Would you be so kind as to open the door for me?', sourceId: '164158', source: 'tatoeba' },
    { jp: '寒いです。どうか窓を閉めてくださいませんか。', reading: 'さむいです。どうかまどをしめてくださいませんか。', en: 'It\'s cold. Could you close the window?', sourceId: '184048', source: 'tatoeba' },
    { jp: 'もっと簡単な言葉で説明してくださいませんか。', reading: 'もっとかんたんなことばでせつめいしてくださいませんか。', en: 'Will you please put that in simpler words?', sourceId: '201666', source: 'tatoeba' },
  ],
  // N4 てくれない(か)
  'n4m-g-4a8027': [
    { jp: '母は私にテレビを見させてくれないことが多い。', reading: 'はははわたしにテレビをみさせてくれないことがおおい。', en: 'Mother often keeps me from watching TV.', sourceId: '82973', source: 'tatoeba' },
    { jp: '父は私にひとりで映画を見に行かせてくれない。', reading: 'ちちはわたしにひとりでえいがをみにいかせてくれない。', en: 'My father doesn\'t allow me to go to the movies alone.', sourceId: '84522', source: 'tatoeba' },
    { jp: '父は私がビルとデートするのを許してくれない。', reading: 'ちちはわたしがビルとデートするのをゆるしてくれない。', en: 'My father doesn\'t allow me to go out with Bill.', sourceId: '84556', source: 'tatoeba' },
  ],
  // N4 ではないだろうか
  'n4m-g-4df930': [
    { jp: 'あの人は私たちの新しい先生ではないだろうか。', reading: 'あのひとはわたしたちのあたらしいせんせいではないだろうか。', en: 'He might be our new teacher.', sourceId: '230719', source: 'tatoeba' },
    { jp: 'トムは今年卒業できないのではないだろうか。', reading: 'トムはことしそつぎょうできないのではないだろうか。', en: 'I\'ve got a feeling that Tom won\'t graduate this year.', sourceId: '1577072', source: 'tatoeba' },
    { jp: '検査に手落ちがあったのではないだろうか。', reading: 'けんさにておちがあったのではないだろうか。', en: 'I suspect that there was an oversight in the examination.', sourceId: '175383', source: 'tatoeba' },
  ],
  // N4 ではない
  'n4m-g-501a42': [
    { jp: '「ソフトウェア開発」は「モノ作り」ではない。', reading: '「ソフトウェアかいはつ」は「モノづくり」ではない。', en: '"Software development" isn\'t "manufacture".', sourceId: '74204', source: 'tatoeba' },
    { jp: '９０歳以上生きることは決してまれではない。', reading: '[９|][０|]さいいじょういきることはけっしてまれではない。', en: 'It is not rare at all to live over ninety years.', sourceId: '4957', source: 'tatoeba' },
    { jp: '世界は君を中心に回っているわけではないんだよ。', reading: 'せかいはきみをちゅうしんにまわっているわけではないんだよ。', en: 'The world doesn\'t revolve around you.', sourceId: '5287', source: 'tatoeba' },
  ],
  // N4 ままになる
  'n4m-g-5029fe': [
    { jp: '農民たちはいつも天候のなすがままになる。', reading: 'のうみんたちはいつもてんこうのなすがままになる。', en: 'Farmers are always at the mercy of the weather.', sourceId: '121679', source: 'tatoeba' },
  ],
  // N4 ようにする/ようにしている/ようにしてください
  'n4m-g-518e40': [
    { jp: '彼に酒を飲ませないようにすることはできない。', reading: 'かれにさけをのませないようにすることはできない。', en: 'You cannot prevent him from drinking.', sourceId: '118578', source: 'tatoeba' },
    { jp: 'また辞去する際に決して忘れないようにすること。', reading: 'またじきょするさいにけっしてわすれないようにすること。', en: 'It is very important to be careful not to forget them when you leave.', sourceId: '76403', source: 'tatoeba' },
    { jp: '悪い状況を最大限に生かすようにするべきだ。', reading: 'わるいじょうきょうをさいだいげんにいかすようにするべきだ。', en: 'You should make the best of a bad situation.', sourceId: '191466', source: 'tatoeba' },
  ],
  // N4 ...そうにみえる
  'n4m-g-54c84a': [
    { jp: '良さそうにみえる馬でも時には弱ることもある。', reading: 'よさそうにみえるうまでもときにはよわることもある。', en: 'A good-looking horse may sometimes break down.', sourceId: '77838', source: 'tatoeba' },
    { jp: 'ジェーンはとても幸せそうにみえる。', reading: 'ジェーンはとてもしあわせそうにみえる。', en: 'Jane looks very happy.', sourceId: '216487', source: 'tatoeba' },
    { jp: '非常に高そうにみえる価格を利用しようとする売り手の切望。', reading: 'ひじょうにこうそうにみえるかかくをりようしようとするうりてのせつぼう。', en: 'The anxiety of sellers to avail of prices which look very high.', sourceId: '85767', source: 'tatoeba' },
  ],
  // N4 させてくれる
  'n4m-g-568017': [
    { jp: '僕は彼らを和解させてくれるように彼に頼んだ。', reading: 'ぼくはかれらをわかいさせてくれるようにかれにたのんだ。', en: 'I asked him to reconcile them with each other.', sourceId: '81787', source: 'tatoeba' },
    { jp: 'こんな気持ちにさせてくれる人は初めてだよ。', reading: 'こんなきもちにさせてくれるひとははじめてだよ。', en: 'I never felt this way before I met you.', sourceId: '2281001', source: 'tatoeba' },
    { jp: '趣味は日常生活の苦労を忘れさせてくれる。', reading: 'しゅみはにちじょうせいかつのくろうをわすれさせてくれる。', en: 'Hobbies take your mind off the worries of everyday life.', sourceId: '148462', source: 'tatoeba' },
  ],
  // N4 ても～ても
  'n4m-g-5a5b8d': [
    { jp: 'もう失礼させてもらってもよろしいでしょうか。', reading: 'もうしつれいさせてもらってもよろしいでしょうか。', en: 'May I be excused?', sourceId: '194177', source: 'tatoeba' },
    { jp: 'いきなり入って来て威張ってもらってもこまる。', reading: 'いきなりはいってきていばってもらってもこまる。', en: 'You can\'t just come in here and start ordering people around.', sourceId: '229266', source: 'tatoeba' },
    { jp: 'あなたの写真を撮らせてもらってもいいですか。', reading: 'あなたのしゃしんをとらせてもらってもいいですか。', en: 'May I take a picture of you?', sourceId: '233226', source: 'tatoeba' },
  ],
  // N4 もうすぐ
  'n4m-g-61db8f': [
    { jp: '私の友人たちはもうすぐここに来るでしょう。', reading: 'わたしのゆうじんたちはもうすぐここにくるでしょう。', en: 'My friends will be here at any moment.', sourceId: '162510', source: 'tatoeba' },
    { jp: '殺人犯はもうすぐ自分の罪を白状するだろう。', reading: 'さつじんはんはもうすぐじぶんのつみをはくじょうするだろう。', en: 'The murderer will soon confess his crime.', sourceId: '169540', source: 'tatoeba' },
    { jp: 'もうすぐ君に会えるのを楽しみにしています。', reading: 'もうすぐきみにあえるのをたのしみにしています。', en: 'I am looking forward to seeing you soon.', sourceId: '194436', source: 'tatoeba' },
  ],
  // N4 ...てあげてください
  'n4m-g-628b30': [
    { jp: '彼は少し耳が不自由なので、大きめの声で話してあげてください。', reading: 'かれはすこしみみがふじゆうなので、おおきめのこえではなしてあげてください。', en: 'He\'s somewhat hard of hearing, so please speak louder.', sourceId: '9471755', source: 'tatoeba' },
    { jp: '彼女は困ったいるようです。どうしたらいいか教えてあげてください。', reading: 'かのじょはこまったいるようです。どうしたらいいかおしえてあげてください。', en: 'She seems to be in trouble. Tell her what to do.', sourceId: '89968', source: 'tatoeba' },
  ],
  // N4 ないでくれ
  'n4m-g-672722': [
    { jp: '心配しないでくれ、僕はすっかり回復したから。', reading: 'しんぱいしないでくれ、ぼくはすっかりかいふくしたから。', en: 'Don\'t worry. I have completely recovered.', sourceId: '145544', source: 'tatoeba' },
    { jp: '事故のことで私を責めないでくれてありがとう。', reading: 'じこのことでわたしをせめないでくれてありがとう。', en: 'Thank you for not blaming me for the accident.', sourceId: '150860', source: 'tatoeba' },
    { jp: '雨があと2・3時間、降らないでくれたらなあ。', reading: 'あめがあとに・さんじかん、ふらないでくれたらなあ。', en: 'I only hope that the rain holds off for a few hours more.', sourceId: '189843', source: 'tatoeba' },
  ],
  // N4 いらっしゃる
  'n4m-g-673dd8': [
    { jp: 'すべて順調にいっていらっしゃることでしょう。', reading: 'すべてじゅんちょうにいっていらっしゃることでしょう。', en: 'You must be doing wonderfully in everything.', sourceId: '214361', source: 'tatoeba' },
    { jp: 'あなたはもちろん会合にいらっしゃるでしょうね。', reading: 'あなたはもちろんかいごうにいらっしゃるでしょうね。', en: 'I take for granted that you will be coming to the meeting.', sourceId: '232362', source: 'tatoeba' },
    { jp: 'あなたがいらっしゃるので私たちはうれしい。', reading: 'あなたがいらっしゃるのでわたしたちはうれしい。', en: 'We are glad you are coming.', sourceId: '234250', source: 'tatoeba' },
  ],
  // N4 終わる
  'n4m-g-67b83f': [
    { jp: '夕食が終わると、映画のアナウンスがあります。', reading: 'ゆうしょくがおわると、えいがのアナウンスがあります。', en: 'After dinner, a movie announcement is made.', sourceId: '79114', source: 'tatoeba' },
    { jp: '彼らは第２次世界大戦が終わるまで米国にいた。', reading: 'かれらはだい[２|]じせかいたいせんがおわるまでべいこくにいた。', en: 'They had been in the States until the end of World War II.', sourceId: '96590', source: 'tatoeba' },
    { jp: '彼らの契約は今月末で終わることになっている。', reading: 'かれらのけいやくはこんげつまつでおわることになっている。', en: 'Their contract is to run out at the end of this month.', sourceId: '98527', source: 'tatoeba' },
  ],
  // N4 んじゃないだろうか
  'n4m-g-69525f': [
    { jp: 'トムは僕を殺そうとしているんじゃないだろうか。', reading: 'トムはぼくをころそうとしているんじゃないだろうか。', en: 'I wonder if Tom is trying to kill me.', sourceId: '4216177', source: 'tatoeba' },
    { jp: '間に合わないんじゃないだろうか。', reading: 'まにあわないんじゃないだろうか。', en: 'I\'m afraid not.', sourceId: '183776', source: 'tatoeba' },
  ],
  // N4 が必要
  'n4m-g-6b2532': [
    { jp: 'もし変更が必要でしたら、お知らせください。', reading: 'もしへんこうがひつようでしたら、おしらせください。', en: 'Let me know if I need to make any changes.', sourceId: '5016', source: 'tatoeba' },
    { jp: '小説だって絵と同様に練習が必要なんだから。', reading: 'しょうせつだってえとどうようにれんしゅうがひつようなんだから。', en: 'Because novels, just like paintings, need you to practice.', sourceId: '74756', source: 'tatoeba' },
    { jp: '地方の道路整備のための財源確保が必要です。', reading: 'ちほうのどうろせいびのためのざいげんかくほがひつようです。', en: 'It is necessary to secure financing for local road maintenance.', sourceId: '75879', source: 'tatoeba' },
  ],
  // N4 てはどうか
  'n4m-g-6bdf4c': [
    { jp: '彼女は私に会議を中止してはどうかと提案した。', reading: 'かのじょはわたしにかいぎをちゅうししてはどうかとていあんした。', en: 'She suggested to me that I call off the meeting.', sourceId: '89515', source: 'tatoeba' },
    { jp: '彼らは彼にひとりで行ってはどうかと提案した。', reading: 'かれらはかれにひとりでおこなってはどうかとていあんした。', en: 'They suggested to him that he go alone.', sourceId: '96366', source: 'tatoeba' },
    { jp: '彼がすぐそこへ行ってはどうかと私は提案した。', reading: 'かれがすぐそこへいってはどうかとわたしはていあんした。', en: 'I suggested that he go there at once.', sourceId: '120963', source: 'tatoeba' },
  ],
  // N4 かどうか
  'n4m-g-6ddc2a': [
    { jp: '問題は来月彼が私たちを訪ねてくるかどうかだ。', reading: 'もんだいはらいげつかれがわたしたちをたずねてくるかどうかだ。', en: 'The question is whether he will come to visit us next month.', sourceId: '79802', source: 'tatoeba' },
    { jp: '問題は彼女が手紙を読んでくれるかどうかです。', reading: 'もんだいはかのじょがてがみをよんでくれるかどうかです。', en: 'The point is whether she will read the letter or not.', sourceId: '79809', source: 'tatoeba' },
    { jp: '問題は君が彼女の英語を理解できるかどうかだ。', reading: 'もんだいはきみがかのじょのえいごをりかいできるかどうかだ。', en: 'The problem is whether you can follow her English.', sourceId: '79830', source: 'tatoeba' },
  ],
  // N4 しか～ない
  'n4m-g-6f1635': [
    { jp: 'この天気とは気長に付き合っていくしかない。', reading: 'このてんきとはきながにつきあっていくしかない。', en: 'You have to learn to put up with this weather.', sourceId: '74008', source: 'tatoeba' },
    { jp: 'でも、お箸、一膳しかないの。どうしよう・・・。', reading: 'でも、おはし、いちぜんしかないの。どうしよう・・・。', en: 'But there\'s only one pair of chopsticks. What shall we do?', sourceId: '74899', source: 'tatoeba' },
    { jp: 'だってこの世には悪者と偽善者しかいないのよ。', reading: 'だってこのよにはわるものとぎぜんしゃしかいないのよ。', en: 'You see in this world there are only scoundrels and hypocrites.', sourceId: '76575', source: 'tatoeba' },
  ],
  // N4 いただけませんか
  'n4m-g-702e5b': [
    { jp: '何と言ったらよいかおしえていただけませんか。', reading: 'なにといったらよいかおしえていただけませんか。', en: 'Let me have your suggestion as to what I am to say.', sourceId: '187752', source: 'tatoeba' },
    { jp: '明日、私の犬の世話をしていただけませんか。', reading: 'あした、わたしのいぬのせわをしていただけませんか。', en: 'Will you look after my dog tomorrow?', sourceId: '80659', source: 'tatoeba' },
    { jp: '本当のことをおっしゃっていただけませんか。', reading: 'ほんとうのことをおっしゃっていただけませんか。', en: 'Would you be kind enough to tell me the truth?', sourceId: '81507', source: 'tatoeba' },
  ],
  // N4 ようにしている
  'n4m-g-711858': [
    { jp: 'ポールは約束の時間に遅れないようにしている。', reading: 'ポールはやくそくのじかんにおくれないようにしている。', en: 'Paul makes it a rule not to be late for his appointments.', sourceId: '196460', source: 'tatoeba' },
    { jp: 'あえてあの店には行かないようにしているんだ。', reading: 'あえてあのみせにはいかないようにしているんだ。', en: 'I make a special point of avoiding that shop.', sourceId: '234531', source: 'tatoeba' },
    { jp: '彼女は最近の流行に遅れないようにしている。', reading: 'かのじょはさいきんのりゅうこうにおくれないようにしている。', en: 'She tries to keep abreast of the latest fashions.', sourceId: '89942', source: 'tatoeba' },
  ],
  // N4 全然～ない
  'n4m-g-72cfbd': [
    { jp: 'ミルクが少しほしいけど、冷蔵庫には全然ない。', reading: 'ミルクがすくなしほしいけど、れいぞうこにはぜんぜんない。', en: 'I want some milk, but there isn\'t any in the refrigerator.', sourceId: '195050', source: 'tatoeba' },
    { jp: '彼の言うことには本当のことは全然ない。', reading: 'かれのいうことにはほんとうのことはぜんぜんない。', en: 'There isn\'t a grain of truth in what he says.', sourceId: '117637', source: 'tatoeba' },
    { jp: '彼に父の持っている積極的が全然ない。', reading: 'かれにちちのもっているせっきょくてきがぜんぜんない。', en: 'He has none of his father\'s aggressiveness.', sourceId: '118488', source: 'tatoeba' },
  ],
  // N4 んじゃないか
  'n4m-g-740bb3': [
    { jp: '僕が君の重荷になるんじゃないかと心配なんだ。', reading: 'ぼくがきみのおもにになるんじゃないかとしんぱいなんだ。', en: 'I am afraid I\'ll be a burden to you.', sourceId: '1206037', source: 'tatoeba' },
    { jp: '彼は明日にもやって来るんじゃないかと思います。', reading: 'かれはあしたにもやってくるんじゃないかとおもいます。', en: 'I expect him to come along any day now.', sourceId: '99616', source: 'tatoeba' },
    { jp: 'だれか身に覚えのある人がいるんじゃないか。', reading: 'だれかみにおぼえのあるひとがいるんじゃないか。', en: 'There\'s somebody here who did it, isn\'t there?', sourceId: '203191', source: 'tatoeba' },
  ],
  // N4 のを忘れた
  'n4m-g-771037': [
    { jp: '私は、その手紙をポストに入れるのを忘れた。', reading: 'わたしは、そのてがみをポストにいれるのをわすれた。', en: 'I\'ve forgotten to post the letter.', sourceId: '162339', source: 'tatoeba' },
    { jp: 'スミス氏は定期券を持っていくのを忘れた。', reading: 'スミスしはていきけんをもっていくのをわすれた。', en: 'Mr Smith forgot to take his commuter ticket.', sourceId: '214245', source: 'tatoeba' },
    { jp: 'うっかりして本を持ってくるのを忘れた。', reading: 'うっかりしてほんをもってくるのをわすれた。', en: 'I forgot to bring the book. It just slipped my mind.', sourceId: '228138', source: 'tatoeba' },
  ],
  // N4 いくらでも
  'n4m-g-7add5b': [
    { jp: 'お金があれば、やりたいことはいくらでもあるさ。', reading: 'おかねがあれば、やりたいことはいくらでもあるさ。', en: 'There\'s a lot I would do if I had the money.', sourceId: '10798087', source: 'tatoeba' },
    { jp: 'すべきことは、まだいくらでもあるよ。', reading: 'すべきことは、まだいくらでもあるよ。', en: 'There\'s still a lot of work to do.', sourceId: '9940170', source: 'tatoeba' },
    { jp: '私でよかったらいくらでも話聞くよ。', reading: 'わたしでよかったらいくらでもはなしきくよ。', en: 'If I am okay for it I can listen to as much as you have to say.', sourceId: '3710328', source: 'tatoeba' },
  ],
  // N4 途中で/途中に
  'n4m-g-7f030d': [
    { jp: '来る途中で彼の身に何かが起こったに違いない。', reading: 'きたるとちゅうでかれのみになにかがおこったにちがいない。', en: 'Something must have happened to him on the way.', sourceId: '78703', source: 'tatoeba' },
    { jp: '途中で何かが彼の身に降りかかったに違いない。', reading: 'とちゅうでなにかがかれのみにふりかかったにちがいない。', en: 'Something must have happened to him on the way.', sourceId: '124581', source: 'tatoeba' },
    { jp: '東京の中心部に向かう途中でガス欠になった。', reading: 'とうきょうのちゅうしんぶにむかうとちゅうでガスかけになった。', en: 'We ran out of gas on the way to downtown Tokyo.', sourceId: '124224', source: 'tatoeba' },
  ],
  // N4 たらどうですか
  'n4m-g-7f5060': [
    { jp: 'よいお天気ですね。散歩でもしたらどうですか。', reading: 'よいおてんきですね。さんぽでもしたらどうですか。', en: 'It\'s a nice day, isn\'t it? Why not go out for a walk?', sourceId: '192927', source: 'tatoeba' },
    { jp: 'よい天気ですね。散歩でもしたらどうですか。', reading: 'よいてんきですね。さんぽでもしたらどうですか。', en: 'A nice day, isn\'t it? Why not go out for a walk?', sourceId: '192892', source: 'tatoeba' },
    { jp: '自分でそのことを調べてみたらどうですか。', reading: 'じぶんでそのことをしらべてみたらどうですか。', en: 'Why not look into the matter yourself?', sourceId: '149973', source: 'tatoeba' },
  ],
  // N4 てもらえるか
  'n4m-g-81167d': [
    { jp: '彼は私に願いを聞いてもらえるかどうか尋ねた。', reading: 'かれはわたしにねがいをきいてもらえるかどうかたずねた。', en: 'He asked me if I could do him a favor.', sourceId: '106098', source: 'tatoeba' },
    { jp: 'あの仕事、手伝ってもらえるかな？', reading: 'あのしごと、てつだってもらえるかな？', en: 'Are you willing to help me with that work?', sourceId: '11077888', source: 'tatoeba' },
    { jp: '別のを買わせてもらえるかなあ。', reading: 'べつのをかわせてもらえるかなあ。', en: 'Can I get you another one?', sourceId: '83428', source: 'tatoeba' },
  ],
  // N4 ていない
  'n4m-g-8139a8': [
    { jp: '問題は我々が十分なお金を持っていないことだ。', reading: 'もんだいはわれわれがじゅうぶんなおかねをもっていないことだ。', en: 'The problem is that we don\'t have enough money.', sourceId: '79834', source: 'tatoeba' },
    { jp: '父と私の葛藤に、彼は気付いていないようです。', reading: 'ちちとわたしのかっとうに、かれはきづいていないようです。', en: 'He seems not to be aware of the conflict between my father and me.', sourceId: '84834', source: 'tatoeba' },
    { jp: 'まだ解決していないのか？県と国のどちらが責任？', reading: 'まだかいけつしていないのか？けんとくにのどちらがせきにん？', en: 'Hasn\'t it been solved yet? Whose responsibility is it, the prefecture\'s or the country\'s?', sourceId: '74900', source: 'tatoeba' },
  ],
  // N4 いたします
  'n4m-g-819983': [
    { jp: '当店は追ってお知らせするまで閉店いたします。', reading: 'とうてんはおっておしらせするまでへいてんいたします。', en: 'The store is closed until further notice.', sourceId: '123964', source: 'tatoeba' },
    { jp: 'その節はよろしくご指導のほどお願いいたします。', reading: 'そのふしはよろしくごしどうのほどおねがいいたします。', en: 'I hope you will favor me with your guidance at that time.', sourceId: '76616', source: 'tatoeba' },
    { jp: '新任の取締役として江崎優を紹介いたします。', reading: 'しんにんのとりしまりやくとしてえざきゆうをしょうかいいたします。', en: 'You will be interested to know that we have just introduced our new Managing Director, Mr Masaru Ezaki.', sourceId: '145207', source: 'tatoeba' },
  ],
  // N4 だろうか
  'n4m-g-82504f': [
    { jp: '彼女は思い切ってあの森に入って行くだろうか。', reading: 'かのじょはおもいきってあのもりにはいっていくだろうか。', en: 'Does she dare to go into the forest?', sourceId: '89700', source: 'tatoeba' },
    { jp: '彼は最後の試合をエンジョイしたんだろうか。', reading: 'かれはさいごのしあいをエンジョイしたんだろうか。', en: 'I wonder if he enjoyed the last match.', sourceId: '74658', source: 'tatoeba' },
    { jp: '彼女を知っている誰が、彼女を愛さないだろうか。', reading: 'かのじょをしっているだれが、かのじょをあいさないだろうか。', en: 'Who that knows her doesn\'t love her?', sourceId: '86094', source: 'tatoeba' },
  ],
  // N4 たらいいですか
  'n4m-g-8324d3': [
    { jp: 'ビザを入手する手続きはどうしたらいいですか。', reading: 'ビザをにゅうしゅするてつづきはどうしたらいいですか。', en: 'What is the procedure for getting a visa?', sourceId: '197598', source: 'tatoeba' },
    { jp: '世界を変えるためには、どうしたらいいですか。', reading: 'せかいをかえるためには、どうしたらいいですか。', en: 'How can we make a difference in the world?', sourceId: '5961307', source: 'tatoeba' },
    { jp: '繁華街へ行くにはどのバスに乗ったらいいですか。', reading: 'はんかがいへいくにはどのバスにのったらいいですか。', en: 'Please tell me which bus to take to go downtown.', sourceId: '121194', source: 'tatoeba' },
  ],
  // N4 ばかりだ
  'n4m-g-8385bd': [
    { jp: '彼の聞く音楽といったら肩の凝るものばかりだ。', reading: 'かれのきくおんがくといったらかたのこるものばかりだ。', en: 'He always listens to serious music.', sourceId: '116190', source: 'tatoeba' },
    { jp: '彼のステージはどれも目を見張るものばかりだ。', reading: 'かれのステージはどれもめをみはるものばかりだ。', en: 'He\'s really something to see every time he gets up on stage.', sourceId: '118306', source: 'tatoeba' },
    { jp: '君は、一時間前にこの仕事をはじめたばかりだ。', reading: 'きみは、いちじかんまえにこのしごとをはじめたばかりだ。', en: 'You only started this job an hour ago.', sourceId: '177988', source: 'tatoeba' },
  ],
  // N4 くする/にする/ようにする
  'n4m-g-862814': [
    { jp: '彼女をしばらく遠くにおいておくことにするよ。', reading: 'かのじょをしばらくとおくにおいておくことにするよ。', en: 'I\'m going to keep my distance from her for a while.', sourceId: '86144', source: 'tatoeba' },
    { jp: 'ちなみに、それはこの話の後日談にする予定です。', reading: 'ちなみに、それはこのはなしのごじつだんにするよていです。', en: 'By the way, I plan to do that for this story\'s sequel.', sourceId: '74217', source: 'tatoeba' },
    { jp: '「あっそ」と流すのもよし、本気にするのもよし。', reading: '「あっそ」とながすのもよし、ほんきにするのもよし。', en: 'You can let it slide with a "oh?" or you can take it seriously.', sourceId: '74680', source: 'tatoeba' },
  ],
  // N4 ちょっと
  'n4m-g-8a3a93': [
    { jp: 'ここのソースは舐めてみるとちょっと塩っぱい。', reading: 'ここのソースはなめてみるとちょっとしょっぱい。', en: 'If you taste this sauce you\'ll find it a bit salty.', sourceId: '74117', source: 'tatoeba' },
    { jp: '郵便局はここからちょっとのところにあります。', reading: 'ゆうびんきょくはここからちょっとのところにあります。', en: 'The post office is a few minutes\' walk from here.', sourceId: '79174', source: 'tatoeba' },
    { jp: '彼女はほんのちょっとの間に食事の用意をした。', reading: 'かのじょはほんのちょっとのまにしょくじのよういをした。', en: 'She prepared the meal in a very short time.', sourceId: '91516', source: 'tatoeba' },
  ],
  // N4 もしかしたら
  'n4m-g-8ba08f': [
    { jp: 'もしかしたら彼は駅で今も待ってるかもしれない。', reading: 'もしかしたらかれはえきでいまもまってるかもしれない。', en: 'Perhaps he\'s even waiting at the station right now.', sourceId: '5067252', source: 'tatoeba' },
    { jp: 'もしかしたら彼は気が変わるかもしれない。', reading: 'もしかしたらかれはきがかわるかもしれない。', en: 'He might change his mind.', sourceId: '193883', source: 'tatoeba' },
    { jp: 'もしかしたら、トムはオーストラリアにいるのかも。', reading: 'もしかしたら、トムはオーストラリアにいるのかも。', en: 'Perhaps Tom is in Australia.', sourceId: '11488318', source: 'tatoeba' },
  ],
  // N4 かなにか
  'n4m-g-8fc93d': [
    { jp: 'それって「ダーティー・ハリー」かなにか。', reading: 'それって「ダーティー・ハリー」かなにか。', en: 'Is it like "Dirty Harry"?', sourceId: '205791', source: 'tatoeba' },
    { jp: 'あいつは詩人かなにかだ。', reading: 'あいつはしじんかなにかだ。', en: 'He is a poet or something.', sourceId: '234617', source: 'tatoeba' },
  ],
  // N4 てくれてありがとう
  'n4m-g-8fe31d': [
    { jp: '状況を改善するのを手伝ってくれてありがとう。', reading: 'じょうきょうをかいぜんするのをてつだってくれてありがとう。', en: 'Thank you for helping me correct the situation.', sourceId: '146013', source: 'tatoeba' },
    { jp: '宿題を手伝ってくれてありがとうございます。', reading: 'しゅくだいをてつだってくれてありがとうございます。', en: 'It is very nice of you to help me with my homework.', sourceId: '147853', source: 'tatoeba' },
    { jp: 'くだらない話を最後まで聞いてくれてありがとう。', reading: 'くだらないはなしをさいごまできいてくれてありがとう。', en: 'Thanks for listening to my pointless story until the end.', sourceId: '10355886', source: 'tatoeba' },
  ],
  // N4 ...にします
  'n4m-g-916b4d': [
    { jp: '私は出来るだけトンネルを避けるようにします。', reading: 'わたしはできるだけトンネルをさけるようにします。', en: 'I will try to avoid tunnels as much as possible.', sourceId: '155968', source: 'tatoeba' },
    { jp: 'ありがとう。また、次の日にくるようにします。', reading: 'ありがとう。また、つぎのひにくるようにします。', en: 'Thanks. Maybe we\'ll come back.', sourceId: '230002', source: 'tatoeba' },
    { jp: '赤ワインにしますかそれとも白ワインにしますか。', reading: 'あかワインにしますかそれともしろワインにしますか。', en: 'Would you like red wine or white wine?', sourceId: '142218', source: 'tatoeba' },
  ],
  // N4 たいへん
  'n4m-g-93acc0': [
    { jp: '夜中に雨が降ったので道がたいへん悪かった。', reading: 'やちゅうにあめがふったのでみちがたいへんわるかった。', en: 'The roads were very muddy since it had rained during the night.', sourceId: '79677', source: 'tatoeba' },
    { jp: '彼女は馬上でたいへんくつろいでいるように見えた。', reading: 'かのじょはもうえでたいへんくつろいでいるようにみえた。', en: 'She seemed so much at ease in the saddle.', sourceId: '87567', source: 'tatoeba' },
    { jp: '彼女は初めての飛行にたいへん神経質になっていた。', reading: 'かのじょははじめてのひこうにたいへんしんけいしつになっていた。', en: 'She was quite nervous about her first flight.', sourceId: '88740', source: 'tatoeba' },
  ],
  // N4 んだろう
  'n4m-g-970b25': [
    { jp: '彼はなんてたくさんの本を持っているんだろう。', reading: 'かれはなんてたくさんのほんをもっているんだろう。', en: 'What a lot of books he has!', sourceId: '111407', source: 'tatoeba' },
    { jp: '何だって私の本がこんなところにあるんだろう。', reading: 'なにだってわたしのほんがこんなところにあるんだろう。', en: 'What\'s my book doing here?', sourceId: '187856', source: 'tatoeba' },
    { jp: '彼は最後の試合をエンジョイしたんだろうか。', reading: 'かれはさいごのしあいをエンジョイしたんだろうか。', en: 'I wonder if he enjoyed the last match.', sourceId: '74658', source: 'tatoeba' },
  ],
  // N4 てもよろしい
  'n4m-g-97c541': [
    { jp: '彼女はこのタイプライターを使ってもよろしい。', reading: 'かのじょはこのタイプライターをつかってもよろしい。', en: 'She may use this typewriter.', sourceId: '92891', source: 'tatoeba' },
    { jp: '失礼ですが、お名前を伺ってもよろしいですか。', reading: 'しつれいですが、おなまえをうかがってもよろしいですか。', en: 'Excuse me, but do you mind if I ask your name?', sourceId: '149563', source: 'tatoeba' },
    { jp: 'もう失礼させてもらってもよろしいでしょうか。', reading: 'もうしつれいさせてもらってもよろしいでしょうか。', en: 'May I be excused?', sourceId: '194177', source: 'tatoeba' },
  ],
  // N4 んじゃない
  'n4m-g-994eec': [
    { jp: '彼は明日にもやって来るんじゃないかと思います。', reading: 'かれはあしたにもやってくるんじゃないかとおもいます。', en: 'I expect him to come along any day now.', sourceId: '99616', source: 'tatoeba' },
    { jp: '動き始めるまで待った方がいいんじゃないかしら。', reading: 'うごきはじめるまでまったほうがいいんじゃないかしら。', en: 'We may as well cool our jets and wait until it starts moving again.', sourceId: '123789', source: 'tatoeba' },
    { jp: 'もうそろそろ腰を落ち着けてもいいんじゃないの。', reading: 'もうそろそろこしをおちつけてもいいんじゃないの。', en: 'It\'s about time you settled down for good.', sourceId: '194402', source: 'tatoeba' },
  ],
  // N4 ...たいんですが
  'n4m-g-99e6b1': [
    { jp: 'あなたに、私の両親に会ってもらいたいんですが。', reading: 'あなたに、わたしのりょうしんにあってもらいたいんですが。', en: 'I would like you to meet my parents.', sourceId: '233814', source: 'tatoeba' },
    { jp: 'あなたがたのグループにはいりたいんですが。', reading: 'あなたがたのグループにはいりたいんですが。', en: 'I\'d like to join your group.', sourceId: '234188', source: 'tatoeba' },
    { jp: 'このはがきをオーストラリアに送りたいんですが。', reading: 'このはがきをオーストラリアにおくりたいんですが。', en: 'I\'d like to send this postcard to Australia.', sourceId: '10183656', source: 'tatoeba' },
  ],
  // N4 はずがない
  'n4m-g-9b4231': [
    { jp: '彼は紳士だ。彼がそんなこと言ったはずがない。', reading: 'かれはしんしだ。かれがそんなこといったはずがない。', en: 'He is a gentleman. He cannot have said such a thing.', sourceId: '103693', source: 'tatoeba' },
    { jp: '彼はそんな短い時間で遠くへ行ったはずがない。', reading: 'かれはそんなみじかいじかんでとおくへいったはずがない。', en: 'He cannot have gone so far in such a short time.', sourceId: '112116', source: 'tatoeba' },
    { jp: '彼が君に間違った電話番号を教えたはずがない。', reading: 'かれがきみにまちがったでんわばんごうをおしえたはずがない。', en: 'He cannot have told you a wrong number.', sourceId: '120449', source: 'tatoeba' },
  ],
  // N4 に気がつく
  'n4m-g-9d6e1c': [
    { jp: '人は知識が深まるほど、自分の無知に気がつくものである。', reading: 'ひとはちしきがふかまるほど、じぶんのむちにきがつくものである。', en: 'The more a man knows, the more he discovers his ignorance.', sourceId: '144455', source: 'tatoeba' },
  ],
  // N4 ても、~でも
  'n4m-g-a26811': [
    { jp: '最初がうまくいかなくても、何度でもやってみろよ。', reading: 'さいしょがうまくいかなくても、なんどでもやってみろよ。', en: 'If at first you don\'t succeed, try, try, try again.', sourceId: '11011106', source: 'tatoeba' },
    { jp: '彼が来ても来なくても、私はどちらでもいいよ。', reading: 'かれがきてもこなくても、わたしはどちらでもいいよ。', en: 'It makes no difference to me whether he comes or not.', sourceId: '9817435', source: 'tatoeba' },
    { jp: '匿名でも、詳細な情報を書いて頂いても、どちらでも結構です。', reading: 'とくめいでも、しょうさいなじょうほうをかいていただいても、どちらでもけっこうです。', en: 'Anonymity or detailed reference are both fine.', sourceId: '876672', source: 'tatoeba' },
  ],
  // N4 ようになっている
  'n4m-g-a40ce5': [
    { jp: 'そのドアは手前へ折りたためるようになっている。', reading: 'そのドアはてまえへおりたためるようになっている。', en: 'The doors fold back.', sourceId: '212923', source: 'tatoeba' },
    { jp: '橋でその島へ渡れるようになっている。', reading: 'はしでそのしまへわたれるようになっている。', en: 'A bridge gives access to the island.', sourceId: '180136', source: 'tatoeba' },
    { jp: 'アジア諸国などから出稼ぎにきた外国人をメイドとして使うのが常識のようになっている。', reading: 'アジアしょこくなどからでかせぎにきたがいこくじんをメイドとしてつかうのがじょうしきのようになっている。', en: 'It has become common practise to employ foreigners working abroad from Asian countries as maids.', sourceId: '74153', source: 'tatoeba' },
  ],
  // N4 …とおなじ
  'n4m-g-a4cfe0': [
    { jp: 'トムの歳はメアリーの歳とおなじ。', reading: 'トムのとしはメアリーのとしとおなじ。', en: 'Tom is the same age as Mary is.', sourceId: '2626293', source: 'tatoeba' },
  ],
  // N4 あとは～だけ
  'n4m-g-a70e21': [
    { jp: '他の役職なんて残ってないし。あとは平部員だけだよ。', reading: 'たのやくしょくなんてのこってないし。あとはひらぶいんだけだよ。', en: 'Well there aren\'t any other positions left. After that, all that is left is basic member.', sourceId: '75912', source: 'tatoeba' },
    { jp: '作り方は簡単！鍋に材料を入れ火にかけ、ひと煮立ちしたら火を止め、あとは冷ますだけです。', reading: 'つくりかたはかんたん！なべにざいりょうをいれひにかけ、ひとにたちしたらひをとめ、あとはひえますだけです。', en: 'It\'s easy to make! All you have to do is put the ingredients in a pot, heat it up, turn off the heat once it boils, and let it cool.', sourceId: '10846498', source: 'tatoeba' },
  ],
  // N4 なにかしら
  'n4m-g-a7f692': [
    { jp: '子供はいつもなにかしらいたずらをしている。', reading: 'こどもはいつもなにかしらいたずらをしている。', en: 'Children are always doing some mischief or other.', sourceId: '168591', source: 'tatoeba' },
  ],
  // N4 ままにする
  'n4m-g-a83836': [
    { jp: '絶対トイレの蓋を開けたままにするなよ。', reading: 'ぜったいトイレのぶたをあけたままにするなよ。', en: 'Whatever you do don\'t leave the lid up on the toilet!', sourceId: '75361', source: 'tatoeba' },
    { jp: '謎を未解決のままにするな。', reading: 'なぞをみかいけつのままにするな。', en: 'Don\'t leave the riddle.', sourceId: '123211', source: 'tatoeba' },
  ],
  // N4 けれども
  'n4m-g-a95f84': [
    { jp: '彼女は疲れていたけれども、歩くことに決めた。', reading: 'かのじょはつかれていたけれども、あるくことにきめた。', en: 'She was tired but decided on walking.', sourceId: '87152', source: 'tatoeba' },
    { jp: '彼は若いけれども、決して時間を無駄にしない。', reading: 'かれはわかいけれども、けっしてじかんをむだにしない。', en: 'Though he is young, he never wastes time.', sourceId: '104598', source: 'tatoeba' },
    { jp: '私は失敗したけれども、もう一度やってみます。', reading: 'わたしはしっぱいしたけれども、もういちどやってみます。', en: 'Though I failed, I will try again.', sourceId: '156172', source: 'tatoeba' },
  ],
  // N4 ようになる／なくなる
  'n4m-g-adb8e3': [
    { jp: '彼女に再会できなくなるとは全く思わなかった。', reading: 'かのじょにさいかいできなくなるとはまったくおもわなかった。', en: 'Little did I dream that I would never see her again.', sourceId: '94831', source: 'tatoeba' },
    { jp: '戦争がなくなる日がすぐに来ることを望みます。', reading: 'せんそうがなくなるひがすぐにくることをのぞみます。', en: 'I hope the time will soon come when there would be no more war.', sourceId: '141309', source: 'tatoeba' },
    { jp: '万一獲物が死に絶えれば、狩人いなくなるだろう。', reading: 'まんいちえものがしにたえれば、かりゅうどいなくなるだろう。', en: 'If the hunted should perish, the hunter would, too.', sourceId: '81165', source: 'tatoeba' },
  ],
  // N4 にかえる
  'n4m-g-adbdf2': [
    { jp: '意志の弱い人は身を滅ぼしやすい。だが、意志の強い人は失敗を成功にかえる。', reading: 'いしのよわいひとはみをほろぼしやすい。だが、いしのつよいひとはしっぱいをせいこうにかえる。', en: 'The weak-willed are prone to go to the dogs; the strong-willed turn failure into success.', sourceId: '191057', source: 'tatoeba' },
  ],
  // N4 のが好き/のが嫌い
  'n4m-g-aff765': [
    { jp: '僕は飛行機が離陸して行くのを見るのが好きだ。', reading: 'ぼくはひこうきがりりくしていくのをみるのがすきだ。', en: 'I like watching planes take off.', sourceId: '81767', source: 'tatoeba' },
    { jp: '彼は砂糖なしでコーヒーを飲むのが好きである。', reading: 'かれはさとうなしでコーヒーをのむのがすきである。', en: 'He likes drinking coffee without sugar.', sourceId: '107004', source: 'tatoeba' },
    { jp: '母はこのコートを着て出かけるのが好きです。', reading: 'はははこのコートをきてでかけるのがすきです。', en: 'Mother likes to go out in this coat.', sourceId: '83074', source: 'tatoeba' },
  ],
  // N4 のを知っていますか
  'n4m-g-b26282': [
    { jp: 'ジョンのお父さんが心臓発作で亡くなったのを知っていますか。', reading: 'ジョンのおとうさんがしんぞうほっさでなくなったのをしっていますか。', en: 'Do you know John\'s father died of a heart attack?', sourceId: '215458', source: 'tatoeba' },
  ],
  // N4 なくてはいけない
  'n4m-g-b29713': [
    { jp: '今、切符を受け取らなくてはいけないのですか。', reading: 'いま、きっぷをうけとらなくてはいけないのですか。', en: 'Should I pick up my ticket now?', sourceId: '172901', source: 'tatoeba' },
    { jp: '栗は少なくとも15分は茹でなくてはいけない。', reading: 'ぐりはすくなくともじゅうごふんはゆでなくてはいけない。', en: 'Chestnuts have to be boiled for at least fifteen minutes.', sourceId: '179221', source: 'tatoeba' },
    { jp: 'ぼくたちはいつも規則を守らなくてはいけない。', reading: 'ぼくたちはいつもきそくをまもらなくてはいけない。', en: 'We have to go by the rules.', sourceId: '196400', source: 'tatoeba' },
  ],
  // N4 てもらう
  'n4m-g-b3151b': [
    { jp: 'ちょうどいいね。新型の試乗してってもらうね。', reading: 'ちょうどいいね。しんがたのしじょうしてってもらうね。', en: 'Good timing. I\'ll get you to test drive the new model.', sourceId: '75422', source: 'tatoeba' },
    { jp: '彼女は髪を結ってもらうために美容院に行った。', reading: 'かのじょはかみをゆってもらうためにびよういんにいった。', en: 'She went to the hairdresser\'s to have her hair done.', sourceId: '87524', source: 'tatoeba' },
    { jp: '彼女は私が医者に診てもらうように強く求めた。', reading: 'かのじょはわたしがいしゃにみてもらうようにつよくもとめた。', en: 'She insisted on my seeing the doctor.', sourceId: '89671', source: 'tatoeba' },
  ],
  // N4 ないといい
  'n4m-g-b3d03a': [
    { jp: '最近彼から便りがない。病気でないといいのだが。', reading: 'さいきんかれからたよりがない。びょうきでないといいのだが。', en: 'I haven\'t heard from him of late. I hope he is not sick.', sourceId: '170605', source: 'tatoeba' },
    { jp: '「彼は来ると思いますか」「来ないといいね」', reading: '「かれはくるとおもいますか」「こないといいね」', en: '"Do you think he will come?" "I hope not."', sourceId: '236182', source: 'tatoeba' },
    { jp: '「彼の病気は重いのかな」「そうでないといいね」', reading: '「かれのびょうきはおもいのかな」「そうでないといいね」', en: '"Is he seriously ill?" "I hope not."', sourceId: '236200', source: 'tatoeba' },
  ],
  // N4 もうちょっと
  'n4m-g-b8294f': [
    { jp: 'もうちょっとゆっくり話した方がいいんじゃない？', reading: 'もうちょっとゆっくりはなしたほうがいいんじゃない？', en: 'I think you should speak a bit more slowly.', sourceId: '4751829', source: 'tatoeba' },
    { jp: 'それ、もうちょっと安かったら買ってたかも。', reading: 'それ、もうちょっとやすかったらかってたかも。', en: 'I would\'ve bought that if the price had been a little lower.', sourceId: '12143116', source: 'tatoeba' },
    { jp: '彼はもうちょっとで車にひき殺されるところだった。', reading: 'かれはもうちょっとでくるまにひきころされるところだった。', en: 'He barely escaped being hit and killed by a car.', sourceId: '110621', source: 'tatoeba' },
  ],
  // N4 なん...も...ない
  'n4m-g-b8dfaa': [
    { jp: '私の悩みに比べたら君の悩みなどなんでもない。', reading: 'わたしのなやみにくらべたらきみのなやみなどなんでもない。', en: 'As compared with my trouble, yours is nothing.', sourceId: '162947', source: 'tatoeba' },
    { jp: 'エンジンはなんともないが車が動かない。', reading: 'エンジンはなんともないがくるまがうごかない。', en: 'Nothing\'s wrong with the engine, but my car won\'t move.', sourceId: '227863', source: 'tatoeba' },
    { jp: '蓮の花はなんとも言えない芳香をはなっていた。', reading: 'はちすのはなはなんともいえないほうこうをはなっていた。', en: 'The lotus blossoms diffused an inexpressibly pleasant scent.', sourceId: '77421', source: 'tatoeba' },
  ],
  // N4 ていただく
  'n4m-g-bd330a': [
    { jp: 'わざわざ電話していただくには及びません。', reading: 'わざわざでんわしていただくにはおよびません。', en: 'Don\'t bother to call me.', sourceId: '9464113', source: 'tatoeba' },
    { jp: '会っていただく時間はおありでしょうか。', reading: 'あっていただくじかんはおありでしょうか。', en: 'I wonder if you could find some time to see me.', sourceId: '185450', source: 'tatoeba' },
    { jp: 'わざわざホテルまで車で来ていただくには及びません。', reading: 'わざわざホテルまでくるまできていただくにはおよびません。', en: 'Don\'t bother to pick me up at the hotel.', sourceId: '191992', source: 'tatoeba' },
  ],
  // N4 ...を...にする
  'n4m-g-bf554b': [
    { jp: '彼等は意見を異にするのに、相変わらず仲が良い。', reading: 'かれらはいけんをことにするのに、あいかわらずなかがよい。', en: 'While they don\'t agree, they continue to be friends.', sourceId: '86018', source: 'tatoeba' },
    { jp: '毎日学校に行く途中で、私は犬を目にする。', reading: 'まいにちがっこうにいくとちゅうで、わたしはいぬをめにする。', en: 'On my way to school each day, I see dogs.', sourceId: '81292', source: 'tatoeba' },
    { jp: '彼女は記憶を新たにするためにその写真を見た。', reading: 'かのじょはきおくをあらたにするためにそのしゃしんをみた。', en: 'She looked at the picture to refresh her memory.', sourceId: '90566', source: 'tatoeba' },
  ],
  // N4 に...ができる
  'n4m-g-c1b64d': [
    { jp: 'お祖母さんの昔話は耳にたこができるほど聞かされた。', reading: 'おばあさんのむかしばなしはみみにたこができるほどきかされた。', en: 'I\'ve heard my grandma\'s stories so often that I\'m heartily sick of them.', sourceId: '76807', source: 'tatoeba' },
    { jp: '彼は父親と同じくらい上手にスキーができる。', reading: 'かれはちちおやとおなじくらいじょうずにスキーができる。', en: 'He can ski as skillfully as his father.', sourceId: '100372', source: 'tatoeba' },
    { jp: '彼女はフランス語を流暢に話す事ができる。', reading: 'かのじょはフランスごをりゅうちょうにはなすことができる。', en: 'She can speak French fluently.', sourceId: '91590', source: 'tatoeba' },
  ],
  // N4 ～たらいい
  'n4m-g-c20722': [
    { jp: '彼らは最初に何をしたらいいかわからなかった。', reading: 'かれらはさいしょになにをしたらいいかわからなかった。', en: 'They did not know what to do first.', sourceId: '97113', source: 'tatoeba' },
    { jp: '彼が私たちのチームの選手だったらいいのにな。', reading: 'かれがわたしたちのチームのせんしゅだったらいいのにな。', en: 'I wish he were on our team.', sourceId: '120294', source: 'tatoeba' },
    { jp: '私も彼のように遠く泳ぐ事が出来たらいいのに。', reading: 'わたしもかれのようにとおくおよぐことができたらいいのに。', en: 'I wish I could swim as far as he can.', sourceId: '152184', source: 'tatoeba' },
  ],
  // N4 だから…のだ
  'n4m-g-c54654': [
    { jp: '彼女は腹を立てていた。だから黙ったままだったのだ。', reading: 'かのじょははらをたてていた。だからだまったままだったのだ。', en: 'She was angry. That is why she remained silent.', sourceId: '9932155', source: 'tatoeba' },
    { jp: '彼は正直だ。だから私は彼のことが好きなのだ。', reading: 'かれはしょうじきだ。だからわたしはかれのことがすきなのだ。', en: 'He is honest. That\'s why I like him.', sourceId: '103300', source: 'tatoeba' },
    { jp: '無口だからなおさら彼が好きなのだ。', reading: 'むくちだからなおさらかれがすきなのだ。', en: 'I like him all the more for his reticence.', sourceId: '80935', source: 'tatoeba' },
  ],
  // N4 ないかしら
  'n4m-g-c7a597': [
    { jp: '彼の手紙に返事を出さなくちゃいけないかしら。', reading: 'かれのてがみにへんじをださなくちゃいけないかしら。', en: 'Should I reply to his letter?', sourceId: '117035', source: 'tatoeba' },
    { jp: 'このシチューを作るの手伝ってくれないかしら。', reading: 'このシチューをつくるのてつだってくれないかしら。', en: 'Could you give me a hand with this stew?', sourceId: '223712', source: 'tatoeba' },
    { jp: '動き始めるまで待った方がいいんじゃないかしら。', reading: 'うごきはじめるまでまったほうがいいんじゃないかしら。', en: 'We may as well cool our jets and wait until it starts moving again.', sourceId: '123789', source: 'tatoeba' },
  ],
  // N4 と言っていました
  'n4m-g-cbc6ee': [
    { jp: '警察はトムを釈放すると言っていました。', reading: 'けいさつはトムをしゃくほうするといっていました。', en: 'The police said they were going to release Tom.', sourceId: '3521180', source: 'tatoeba' },
    { jp: 'トムさんは私に家にいたほうがいいと言っていました。', reading: 'トムさんはわたしにいえにいたほうがいいといっていました。', en: 'Tom told me I should stay home.', sourceId: '4250931', source: 'tatoeba' },
    { jp: '父はいつも「天は自ら助くる者を助く」と言っていました。', reading: 'ちちはいつも「てんはみずからたすくるものをたすく」といっていました。', en: 'My father always said that heaven helps those who help themselves.', sourceId: '84749', source: 'tatoeba' },
  ],
  // N4 と思っている
  'n4m-g-d48d92': [
    { jp: '彼女は私にいっしょにきてほしいと思っている。', reading: 'かのじょはわたしにいっしょにきてほしいとおもっている。', en: 'She wants me to go with her.', sourceId: '89580', source: 'tatoeba' },
    { jp: '彼らはオリンピックに参加したいと思っている。', reading: 'かれらはオリンピックにさんかしたいとおもっている。', en: 'They want to participate in the Olympic Games.', sourceId: '98155', source: 'tatoeba' },
    { jp: '彼は正しいと思っていることをする自由がある。', reading: 'かれはただしいとおもっていることをするじゆうがある。', en: 'He has the freedom to do what he thinks is right.', sourceId: '103319', source: 'tatoeba' },
  ],
  // N4 がっている
  'n4m-g-d6b231': [
    { jp: '彼女は新しいドレスをひどく欲しがっている。', reading: 'かのじょはあたらしいドレスをひどくほしがっている。', en: 'She wants a new dress badly.', sourceId: '88575', source: 'tatoeba' },
    { jp: '彼女はとてもヨーロッパへ行きたがっている。', reading: 'かのじょはとてもヨーロッパへいきたがっている。', en: 'She is anxious to visit Europe.', sourceId: '91959', source: 'tatoeba' },
    { jp: '彼女はいつも人に誉めてもらいたがっている。', reading: 'かのじょはいつもひとにほめてもらいたがっている。', en: 'She is always fishing for compliments.', sourceId: '93251', source: 'tatoeba' },
  ],
  // N4 て/なくて
  'n4m-g-d6fe4f': [
    { jp: '乱暴なことをしなくてもその問題は解決できる。', reading: 'らんぼうなことをしなくてもそのもんだいはかいけつできる。', en: 'You can solve the problem in nonviolent ways.', sourceId: '78509', source: 'tatoeba' },
    { jp: '友人と約束があるので行かなくてはなりません。', reading: 'ゆうじんとやくそくがあるのでいかなくてはなりません。', en: 'I have to go off because I have an appointment with a friend.', sourceId: '79377', source: 'tatoeba' },
    { jp: 'ブレーさんは寝なくても立派な演説をしましたよ。', reading: 'ブレーさんはねなくてもりっぱなえんぜつをしましたよ。', en: 'Even though he didn\'t sleep, Mr. Blay gave a great speech.', sourceId: '78269', source: 'tatoeba' },
  ],
  // N4 あるいは～かもしれない
  'n4m-g-d8cef4': [
    { jp: '明日あるいは晴れるかもしれない。', reading: 'あしたあるいははれるかもしれない。', en: 'It may possibly be fine tomorrow.', sourceId: '80630', source: 'tatoeba' },
    { jp: 'あるいはそれは本当かもしれない。', reading: 'あるいはそれはほんとうかもしれない。', en: 'Perhaps that\'s true.', sourceId: '229955', source: 'tatoeba' },
  ],
  // N4 もういい
  'n4m-g-daf726': [
    { jp: '「もういいかい？」「まあだだよ」「もういいかい？」', reading: '「もういいかい？」「まあだだよ」「もういいかい？」', en: '"Now?" "No, not yet." "How about now?"', sourceId: '10672048', source: 'tatoeba' },
    { jp: '何その顔！もういい加減にしてよ！何か文句でもあるの？', reading: 'なにそのかお！もういいかげんにしてよ！なにかもんくでもあるの？', en: 'Why are you making that face? That\'s enough already! What\'s your problem?', sourceId: '187860', source: 'tatoeba' },
    { jp: 'もういい大人なんだから、しっかりしなきゃ駄目でしょ。', reading: 'もういいおとななんだから、しっかりしなきゃだめでしょ。', en: 'You should know better now you\'re an adult.', sourceId: '9664994', source: 'tatoeba' },
  ],
  // N4 …以外（いがい）に…ない
  'n4m-g-dc5a56': [
    { jp: 'そうする以外にないよ。', reading: 'そうするいがいにないよ。', en: 'We have no choice but to do so.', sourceId: '213864', source: 'tatoeba' },
    { jp: 'プロレタリアートには、鉄鎖以外に失うものはない。', reading: 'プロレタリアートには、てっさいがいにうしなうものはない。', en: 'The proletarians have nothing to lose but their chains.', sourceId: '2961985', source: 'tatoeba' },
    { jp: '彼は仕事以外に興味がない。', reading: 'かれはしごといがいにきょうみがない。', en: 'He has no interests, apart from his work.', sourceId: '106606', source: 'tatoeba' },
  ],
  // N4 ことがある
  'n4m-g-dc869c': [
    { jp: '貧困のために人々は時に犯罪を犯すことがある。', reading: 'ひんこんのためにひとびとはときにはんざいをおかすことがある。', en: 'Poverty sometimes drives people to commit crimes.', sourceId: '85174', source: 'tatoeba' },
    { jp: '彼女はときに空想と現実を混同することがある。', reading: 'かのじょはときにくうそうとげんじつをこんどうすることがある。', en: 'She sometimes mixes up fancies with realities.', sourceId: '91999', source: 'tatoeba' },
    { jp: '或る夕暮私はこの丘の上に立ったことがある。', reading: 'あるるゆうぐれわたしはこのおかのじょうにたったことがある。', en: 'There was a time, one evening, when I stood on top of that hill.', sourceId: '74955', source: 'tatoeba' },
  ],
  // N4 じゃないか
  'n4m-g-dea877': [
    { jp: '彼は明日にもやって来るんじゃないかと思います。', reading: 'かれはあしたにもやってくるんじゃないかとおもいます。', en: 'I expect him to come along any day now.', sourceId: '99616', source: 'tatoeba' },
    { jp: '盗まれた金に手をつけたのは彼じゃないかと思う。', reading: 'ぬすまれたきんにてをつけたのはかれじゃないかとおもう。', en: 'I think he could be the one who took the stolen money.', sourceId: '124145', source: 'tatoeba' },
    { jp: '一致団結して何か新しいことをやろうじゃないか。', reading: 'いっちだんけつしてなにかあたらしいことをやろうじゃないか。', en: 'Let\'s close ranks and do something new.', sourceId: '190336', source: 'tatoeba' },
  ],
  // N4 でしょう/だろう
  'n4m-g-dfe0cc': [
    { jp: '女性がいなければ世界はどうなっていただろう。', reading: 'じょせいがいなければせかいはどうなっていただろう。', en: 'What would the world be without women?', sourceId: '5101', source: 'tatoeba' },
    { jp: '10ヶ国語を話せたらどんなにかっこいいだろう！', reading: '[1|][0|]かこくごをはなせたらどんなにかっこいいだろう！', en: 'It would be so cool if I could speak ten languages!', sourceId: '5126', source: 'tatoeba' },
    { jp: '窓から日が沈むのを見ることができるだろう。', reading: 'まどからひがしずむのをみることができるだろう。', en: 'We could see the sunset from the window.', sourceId: '5262', source: 'tatoeba' },
  ],
  // N4 ないといけない / だめだ
  'n4m-g-e0ea88': [
    { jp: '彼女はいつもうそをつくので、信じてはだめだ。', reading: 'かのじょはいつもうそをつくので、しんじてはだめだ。', en: 'Don\'t believe her because she always lies.', sourceId: '93325', source: 'tatoeba' },
    { jp: '独りで外国に行ったらだめだ、と父に言われた。', reading: 'ひとりでがいこくにいったらだめだ、とちちにいわれた。', en: 'My father told me I couldn\'t go abroad alone.', sourceId: '123431', source: 'tatoeba' },
    { jp: '私は英語が話せない、ましてドイツ語はだめだ。', reading: 'わたしはえいごがはなせない、ましてドイツごはだめだ。', en: 'I can\'t speak English, much less German.', sourceId: '158344', source: 'tatoeba' },
  ],
  // N4 たいへんだ
  'n4m-g-e1039f': [
    { jp: 'その車はあまりに大きいので駐車するのがたいへんだ。', reading: 'そのくるまはあまりにおおきいのでちゅうしゃするのがたいへんだ。', en: 'That car\'s so big that parking it is difficult.', sourceId: '209585', source: 'tatoeba' },
    { jp: 'この魚は骨が多くてとるのがたいへんだ。', reading: 'このさかなはほねがおおくてとるのがたいへんだ。', en: 'This fish is bony and it is not easy to bone it.', sourceId: '222366', source: 'tatoeba' },
    { jp: 'フランス語で書かれてあるので、この本は読むのがたいへんだ。', reading: 'フランスごでかかれてあるので、このほんはよむのがたいへんだ。', en: 'Written in French, this book is not easy to read.', sourceId: '196983', source: 'tatoeba' },
  ],
  // N4 ...もらおうか
  'n4m-g-e59595': [
    { jp: '私はそれを英語に翻訳してもらおうかなと思っている。', reading: 'わたしはそれをえいごにほんやくしてもらおうかなとおもっている。', en: 'I am thinking of getting it translated into English.', sourceId: '159720', source: 'tatoeba' },
    { jp: '「安いんだね。10ヤードもらおうかな」と、その女の子は答えた。', reading: '「やすいんだね。じゅうヤードもらおうかな」と、そのおんなのこはこたえた。', en: '"That\'s cheap. I\'ll take ten yards," the girl answered.', sourceId: '1203512', source: 'tatoeba' },
  ],
  // N4 ほど~ない
  'n4m-g-e61c66': [
    { jp: '彼らはこのものを理解できるほど賢くない。', reading: 'かれらはこのものをりかいできるほどかしこくない。', en: 'They aren\'t smart enough to understand this stuff.', sourceId: '98085', source: 'tatoeba' },
    { jp: '友達というほどではないが知り合いだ。', reading: 'ともだちというほどではないがしりあいだ。', en: 'He is not a friend, but an acquaintance.', sourceId: '79321', source: 'tatoeba' },
    { jp: '氷は私たちを支えるほど厚くない。', reading: 'こおりはわたしたちをささえるほどあつくない。', en: 'The ice is not thick enough to hold our weight.', sourceId: '85386', source: 'tatoeba' },
  ],
  // N4 なければ～た
  'n4m-g-ef2736': [
    { jp: '彼女はそんな事をしなければよかったのに。', reading: 'かのじょはそんなことをしなければよかったのに。', en: 'She should not have done such a thing.', sourceId: '92213', source: 'tatoeba' },
    { jp: 'こんな恥をかくのならいっそ生まれなければよかった。', reading: 'こんなはじをかくのならいっそうまれなければよかった。', en: 'I had rather never have been born than have seen this day of shame.', sourceId: '76708', source: 'tatoeba' },
    { jp: '旅行者は夜明け前に離れなければならなかった。', reading: 'りょこうしゃはよあけまえにはなれなければならなかった。', en: 'The tourists had to leave the town before dawn.', sourceId: '78136', source: 'tatoeba' },
  ],
  // N4 急に
  'n4m-g-f01527': [
    { jp: '彼女は彼が急に考えを変えたのを知って驚いた。', reading: 'かのじょはかれがきゅうにかんがえをかえたのをしっておどろいた。', en: 'She wondered at the sudden change of his mind.', sourceId: '87499', source: 'tatoeba' },
    { jp: '彼女はそのニュースを聞いて、急に泣きだした。', reading: 'かのじょはそのニュースをきいて、きゅうになきだした。', en: 'She burst into tears when she heard the news.', sourceId: '92581', source: 'tatoeba' },
    { jp: '彼は急に小説を書きたいという衝動にかられた。', reading: 'かれはきゅうにしょうせつをかきたいというしょうどうにかられた。', en: 'He felt a sudden urge to write a novel.', sourceId: '108462', source: 'tatoeba' },
  ],
  // N4 とか～とか
  'n4m-g-f03b64': [
    { jp: '最近のメンバーとか曲とかぜんぜん知らないな。', reading: 'さいきんのメンバーとかきょくとかぜんぜんしらないな。', en: 'Among other things, I don\'t know the recent members, nor their new songs at all.', sourceId: '995495', source: 'tatoeba' },
    { jp: '損とか得とか考えてるうちは恋愛じゃないと思う。', reading: 'そんとかとくとかかんがえてるうちはれんあいじゃないとおもう。', en: 'I think that as long as you worry about profit and loss, it can\'t be called love.', sourceId: '3224401', source: 'tatoeba' },
    { jp: '包丁とか鍋とか、台所用品を持参すること。', reading: 'ほうちょうとかなべとか、だいどころようひんをじさんすること。', en: 'Don\'t forget to bring kitchen utensils such as knives and cooking pots.', sourceId: '82758', source: 'tatoeba' },
  ],
  // N4 ...が...を...みせる
  'n4m-g-f0c0d0': [
    { jp: '彼女は彼が土曜の午後姿をみせるのを期待している。', reading: 'かのじょはかれがどようのごごすがたをみせるのをきたいしている。', en: 'She expects him to show up on Saturday afternoon.', sourceId: '87482', source: 'tatoeba' },
  ],
  // N4 でござる／でございます
  'n4m-g-f16dd1': [
    { jp: '俺様は世にも美しいユニコーン様でござるぞ。', reading: 'おれさまはよにもうつくしいユニコーンさまでござるぞ。', en: 'I am the most beautiful unicorn in the world.', sourceId: '10075647', source: 'tatoeba' },
    { jp: '大変申し訳ございませんが、もう品切れでございます。', reading: 'たいへんもうしわけございませんが、もうしなぎれでございます。', en: 'I\'m sorry, but we\'re out of stock.', sourceId: '1486968', source: 'tatoeba' },
    { jp: 'キッチン用品は、地下一階でございます。', reading: 'キッチンようひんは、ちかいっかいでございます。', en: 'Kitchenware is in the floor below ground level.', sourceId: '11561274', source: 'tatoeba' },
  ],
  // N4 なにも～ない
  'n4m-g-f600c2': [
    { jp: '労働者たちにはもっと働こうとする刺激がなにもない。', reading: 'ろうどうしゃたちにはもっとはたらこうとするしげきがなにもない。', en: 'The workers have no incentive to work harder.', sourceId: '77381', source: 'tatoeba' },
    { jp: '彼はなにもしないで手をこまねいているだけだった。', reading: 'かれはなにもしないでてをこまねいているだけだった。', en: 'He did nothing but fold his arms.', sourceId: '111414', source: 'tatoeba' },
    { jp: '事の次第がわかるまでは、君はなにもいえない。', reading: 'ことのしだいがわかるまでは、きみはなにもいえない。', en: 'You can\'t say anything till you know the circumstances.', sourceId: '150909', source: 'tatoeba' },
  ],
  // N4 なにかと
  'n4m-g-f90c7c': [
    { jp: '彼女にはなにかとりえがありますか。', reading: 'かのじょにはなにかとりえがありますか。', en: 'Does she have any merit?', sourceId: '94996', source: 'tatoeba' },
  ],
  // N4 それでは
  'n4m-g-ff7ff6': [
    { jp: 'それではテキストの１０ページを開いて下さい。', reading: 'それではテキストの[１|][０|]ページをひらいてください。', en: 'And open your textbook at page ten.', sourceId: '205766', source: 'tatoeba' },
    { jp: '彼女の行儀作法は良家の子女のそれではない。', reading: 'かのじょのぎょうぎさほうはりょうけのしじょのそれではない。', en: 'Her manners are not those of a lady.', sourceId: '94419', source: 'tatoeba' },
    { jp: 'それでは今日の午後２時にお待ちしています。', reading: 'それではきょうのごご[２|]じにおまちしています。', en: 'See you at two this afternoon.', sourceId: '205756', source: 'tatoeba' },
  ],
};

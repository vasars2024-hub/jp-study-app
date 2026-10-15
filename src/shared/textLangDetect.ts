/**
 * Which study language a piece of OCR'd text is in — the detection half of
 * `shared/studyLang.ts`, kept in its own module so the startup bundle (which
 * needs `studyLang.ts` everywhere) does not carry the character tables.
 */

import { DEFAULT_STUDY_LANG, type StudyLang } from './studyLang';

// ---------------------------------------------------------------------------
// Which language a piece of OCR'd text is in
//
// `studyLangOfText` answers "which language is this word in" for a learner who
// studies one language. A snip can be in any language the learner studies, so
// its OCR text is judged on more evidence: kana is Japanese and Cyrillic is
// Russian, as before; Han-only text is told apart by the characters only one
// of the two writing systems uses — Simplified-only forms (过 这 们 说 时 …) say
// Chinese, Japanese-only forms (込 働 駅 図 気 竜 …: kokuji and shinjitai) say
// Japanese. Characters both write (学 会 国 的 …) say nothing, and then the
// learner's own language decides.

/** Characters both write in the same form, kept out of the two lists below. */
const SHARED_WITH_JAPANESE = '黄静国条医机杆楼欧残没浅湾湿滞潜炉点状独狭猪献画礼窃筑脚脱芦范茎装誉践踊郁里首麦灯庄声姐娘宝当恋数断旧写';
const SHARED_WITH_CHINESE = '国学宝团围黄条猫為籠腺弁灯勤即叙参将忍恋惨慎数断旧昼楼概浅漢潜炉煙状狭疎痴盗真碑祈祉禅禍秘窃繍罰臭芸茎装褒贈躍輪辞遥鎮靖頻麦証';

/**
 * Simplified Chinese forms Japanese never writes (its form differs: 這 → 这,
 * 過 → 过, 説 → 说). Only characters that are not also Japanese shinjitai.
 */
export const SIMPLIFIED_ONLY_HAN = new Set([...(
  '过这们说话时对为发经见长开门问间题么还现动东车书习爱让认识语读写听汉电买卖钱样头脑农业实际产华兴边进远运连选该谁谈请课调贵质费资军转较轻办务劳'
  + '单历厅压厂县变吗员阅队阳阴阶陆陈险随难须顺顾颜额风飞饭馆验鱼鸟鸡齐龙拜无气乐亚关观欢网级结给组织线练终红约纪纸节种应报场张岁师帮带广庆总战'
  + '记设许论证词译试诗谢贝赛软迟钟铁银错闻页顶项预领饿驱马鲜齿个这们复杂医药处术图条视读纳际极检据损换样桥梦齐丰录缘环决况热烧灯灵营庄刘杨罗'
  + '赵孙吴郑冯韩萧蒋邓谭陆园团围国际块坏垃圾声壳处备够头夹奋妈姐娘孙宁宝实宽对寻导层岛岭峡币师帐帮庙废开异弃张弯归当录彻忆忧怀态恋恶悬惊惯戏'
  + '户扑执扩扫扬挂挡挤挥损捡换据掷搅摄摆摇敌数断时旧显晒晓暂术机杀杂权杆极构枪柜标栏树样桥梦检楼欧歼残毁毕气汇汤沟没泪泼泽洁浅测济浓涛涨润渐渔'
  + '湾湿满滚滞滤滥潜灭灿炉点炼烂烛烟烦烧热焕爷牵状独狭猎猪献环现玛琐琼电画畅疗疮疯痒瘫癣皱盏盐监盖盘眯睁矿码砖础确碍礼祷祸离秃积称秽稳穷窃窍'
  + '窝竞笔笼筑筹签简粮紧纠红纤约级纪纫纬纯纱纲纳纵纷纸纹纺线练组细织终绊绍经绑绒结绕绘给络绝绞统继绩绪续绳维绵绸综绽绿缀缆缓编缘缚缝缠缩缴罚罢'
  + '罗羡习翘耸聂职聋联肃肠肤肿胀胁胜脉脏脑脚脱脸腊腻膑舆舰艰艳艺节芜芦苇苍苏范茎茧荐荡荣药莱获莹萝营萧萨蓝蔷虏虑虽虾蚀蚁蚂蛮蜡蝇衅补衬袄袜装裤见规'
  + '觅视览觉誉计订认讥讨让训议讯记讲讳讶许论讽设访诀证评识诈诉诊词译试诗诚话诞询该详诧诫诬语误诱说请诸诺读课谁调谅谈谊谋谍谎谐谓谜谢谣谦谨谱谴'
  + '贞负贡财责贤败账货质贩贪贫购贮贯贴贷贸费贺贼贾资赋赌赎赏赐赔赖赚赛赞赠赶趋跃践踊踪蹿躯车轨轩转轮软轰轴轻载轿较辅辆辈辉辐辑输辖辩辫边辽达迁'
  + '过迈运还这进远违连迟迹适选逊递逻遗邓邮邻郁郑酱释里鉴针钉钓钙钝钞钟钢钥钦钩钮钱钳钻铁铃铅铜铭铲银铺链销锁锄锅锈锋锐错锡锣锤锦键锯锻镇镜'
  + '长门闪闭问闯闲间闷闸闹闻阀阁阅阐阔队阳阴阵阶际陆陈陕险随隐隶难雏雾霉静靥韦韧页顶项顺须顽顾顿颁颂预领颇颈频颓颖颗题颜额颠颤风飘飞饥饭饮饰'
  + '饱饲饵饶饺饼馁馅馆馈馋首驯驰驱驳驴驶驹驻驼驾骂骄骆验骏骑骗骚骡鱼鲁鲜鲸鳄鸟鸡鸣鸥鸦鸭鸽鸿鹅鹊鹏鹤鹰麦黄齐齿龄龙龟'
)].filter((ch) => !SHARED_WITH_JAPANESE.includes(ch)));

/**
 * Japanese-only forms: kokuji (characters made in Japan) and shinjitai that are
 * neither the Simplified nor the Traditional Chinese form.
 */
export const JAPANESE_ONLY_HAN = new Set([...(
  '込働畑峠枠匂搾栃凪榊躾辻笹雫鰯腺麿噺匁枡籾鱈鰹鯵椛樫俣颪喰糀籠'
  + '図広駅気楽売読帰戦歳桜沢渋鉄薬険験恵拝圧円塩浜辺発弁仏斎営労単対応様関済経総権歴黒駆処剤雑価両県庁伝転軽鉱粋涙実戻隣歩毎縄継続絵姫蔵臓灯焼'
  + '竜従挙乗仮値児剣剰勧勲勤即叙参収営囲団国圏壊壌壱奨嬢学宝寛寝専将尋巣巻帯庁廃弐弾徳徴忍恋悩悪惨慎懐戯払抜択拠拡挿捜掲揺摂撃数斉断旧昼晩暦'
  + '暁権桟検楼様概槙歓殴殻毎氷汚浄浅涙渇渓渋滝漢潜瀬炉為焼煙犠状狭猟獣献猫畳疎痴発盗県真砕碑祈祉禅禍秘稲穏穂穣窃竜粋粛絵継続総緑縁縄縦繊繍罰'
  + '聴脳臭舗芸茎荘薫蔵蛍衛衝装褒覇覚観訳証読謡譲豊賛贈践躍転軽輪辞逓遅遥郷酔醸釈鉄鉱鋳錬録鎮関閲陥険隠隣隷雑霊靖頻顕騒験髄髪闘鶏麦黙齢'
)].filter((ch) => !SIMPLIFIED_ONLY_HAN.has(ch) && !SHARED_WITH_CHINESE.includes(ch)));

/**
 * Chinese grammar words that Japanese does not write on their own: in kana-less
 * text they mean a Chinese sentence (这种等待，本质上是一种拖延 read by a Japanese
 * recogniser as 滋神等待·本上是一釉把延 still carries 是 and 把). Words Japanese
 * uses inside common compounds (了 in 完了, 就 in 就職, 都, 在, 被, 着, 他) are left out.
 */
const CHINESE_FUNCTION_HAN = new Set([...'是很把呢吧啊哪您她它咱嘛啦呀怎什哦']);
/** Punctuation only Chinese writes: the full-width comma and semicolon, and curly quotes. */
const CHINESE_PUNCTUATION = new Set([...'，；“”']);
/** Punctuation only Japanese writes: corner brackets. */
const JAPANESE_PUNCTUATION = new Set([...'「」『』']);
/**
 * A Japanese sentence this long almost always carries kana (particles, okurigana);
 * kana-less Han text of this length is a Chinese sentence or a long proper name.
 */
const KANALESS_SENTENCE_HAN = 8;

export type TextLangEvidence =
  | 'kana'
  | 'cyrillic'
  | 'simplified'
  | 'japanese'
  | 'chinese-grammar'
  | 'no-kana'
  | 'han'
  | 'latin'
  | 'none';

export interface TextLangGuess {
  lang: StudyLang;
  evidence: TextLangEvidence;
}

/**
 * The language OCR'd text is in, judged by script (see above). `active` is the
 * learner's own language; `candidates` the languages they study or can read
 * (the order breaks ties). Han text with no telling character follows the
 * active language when it reads Han, otherwise the first candidate that does.
 */
export function detectStudyLangOfText(
  text: string,
  active: StudyLang = DEFAULT_STUDY_LANG,
  candidates: readonly StudyLang[] = [active],
): TextLangGuess {
  let kana = 0;
  let cyrillic = 0;
  let han = 0;
  let simplified = 0;
  let japanese = 0;
  let latin = 0;
  let chineseWords = 0;
  let chinesePunct = 0;
  let japanesePunct = 0;
  for (const ch of String(text ?? '')) {
    if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch) && ch !== 'ー') kana += 1;
    else if (/\p{Script=Cyrillic}/u.test(ch)) cyrillic += 1;
    else if (/\p{Script=Han}/u.test(ch)) {
      han += 1;
      if (SIMPLIFIED_ONLY_HAN.has(ch)) simplified += 1;
      else if (JAPANESE_ONLY_HAN.has(ch)) japanese += 1;
      if (CHINESE_FUNCTION_HAN.has(ch)) chineseWords += 1;
    } else if (/\p{Script=Latin}/u.test(ch)) latin += 1;
    else if (CHINESE_PUNCTUATION.has(ch)) chinesePunct += 1;
    else if (JAPANESE_PUNCTUATION.has(ch)) japanesePunct += 1;
  }
  const cjk = kana + han;
  if (cyrillic > cjk && cyrillic > 0) return { lang: 'ru', evidence: 'cyrillic' };
  // A stray kana in Chinese text is an OCR slip; a run of them is Japanese.
  if (kana > 0 && (kana >= 2 || kana * 4 >= cjk) && kana >= simplified) return { lang: 'ja', evidence: 'kana' };
  if (han > 0) {
    if (simplified > japanese) return { lang: 'zh', evidence: 'simplified' };
    if (japanese > simplified) return { lang: 'ja', evidence: 'japanese' };
    // Nothing in the characters' forms: weigh grammar words and punctuation only
    // one of the two writes, then a sentence-length run with no kana at all.
    const zhGrammar = chineseWords + chinesePunct;
    if (zhGrammar > japanesePunct) return { lang: 'zh', evidence: 'chinese-grammar' };
    if (japanesePunct > zhGrammar) return { lang: 'ja', evidence: 'japanese' };
    if (kana === 0 && han >= KANALESS_SENTENCE_HAN) return { lang: 'zh', evidence: 'no-kana' };
    const readsHan = (lang: StudyLang): boolean => lang === 'ja' || lang === 'zh';
    const lang = readsHan(active) ? active : candidates.find(readsHan) ?? 'ja';
    return { lang, evidence: 'han' };
  }
  if (kana > 0) return { lang: 'ja', evidence: 'kana' };
  if (cyrillic > 0) return { lang: 'ru', evidence: 'cyrillic' };
  return { lang: active, evidence: latin > 0 ? 'latin' : 'none' };
}

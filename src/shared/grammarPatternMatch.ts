/**
 * Literal grammar-pattern matching for Chinese and Russian subtitle lines.
 *
 * Japanese uses `grammarSurfaceCore` (one contiguous core per title). That rule does not
 * carry over:
 * - Chinese patterns are often discontinuous frames — 虽然…但是…, 如果…就…, 一边…一边… —
 *   and collapsing 虽然…但是… to 虽然但是 matched nothing. A Traditional line (雖然…但是…)
 *   matched nothing either, because the library is written in Simplified.
 * - Russian titles are words separated by spaces, with the grammar named in English around
 *   them (нет + genitive, чтобы + infinitive (purpose)). Removing the spaces left
 *   "Уменяесть", which no sentence contains.
 *
 * So a title becomes one or more ALTERNATIVES (split on "/"), each an ordered list of
 * literal PARTS (split on … 〜 +), and a line matches an alternative when every part occurs
 * in order. Same spirit as the Japanese rule — under-report rather than point at the wrong
 * words: a lone hanzi (的, 了) and a short Russian function word (в, на, и, это) never count
 * on their own, and Russian parts match whole words only.
 */

export type MatchLang = 'zh' | 'ru';

export interface PatternSpan {
  start: number;
  end: number;
}

const HAN = /[㐀-鿿]/;
const HAN_ONLY = /^[㐀-鿿]+$/;
const CYRILLIC_WORD = /^[Ѐ-ӿ]+(?:-[Ѐ-ӿ]+)*$/;
const PART_SPLIT = /\s*(?:…|\.\.\.|〜|～|~|\+)\s*/;

/** Letters in the parts, the measure of how specific an alternative is. */
function letterCount(parts: readonly string[]): number {
  return parts.reduce((n, p) => n + p.replace(/[\s-]/g, '').length, 0);
}

function chineseAlternatives(title: string): string[][] {
  const out: string[][] = [];
  for (const alt of title.replace(/[（(][^）)]*[）)]/g, '').split(/[/／]/)) {
    const parts = alt
      .split(PART_SPLIT)
      .map((p) => p.replace(/[A-Za-z0-9\s,，。.?？!！:：]/g, ''))
      .filter(Boolean);
    if (!parts.length || !parts.every((p) => HAN_ONLY.test(p))) continue;
    // One contiguous part needs two hanzi; a frame needs three between its parts
    // (如果…就… yes, 是…的 no — 是 and a later 的 co-occur in far too many lines).
    const enough = parts.length === 1 ? parts[0].length >= 2 : letterCount(parts) >= 3;
    if (enough) out.push(parts);
  }
  return out;
}

function russianAlternatives(title: string): string[][] {
  let text = title.replace(/[（(][^）)]*[）)]/g, ' ');
  // "Reported speech: сказал, что …" — the English name goes, the pattern stays.
  const colon = text.indexOf(':');
  if (colon >= 0) {
    const head = text.slice(0, colon);
    text = /[A-Za-z]/.test(head) ? text.slice(colon + 1) : head;
  }
  // " — noun gender" and "+ genitive" / "+ infinitive / noun" name grammar in English.
  text = text.split(/\s[—–]\s/)[0];
  text = text.replace(/\+\s*[A-Za-z][A-Za-z\s-]*/g, ' ');
  const out: string[][] = [];
  for (const alt of text.split('/')) {
    if (/[A-Za-z0-9]/.test(alt)) continue;
    const parts = alt
      .split(PART_SPLIT)
      .map((p) =>
        p
          .split(/[\s,?!.]+/)
          // Suffixes and prefixes (-ся, при-) are not words to find.
          .filter((w) => w && CYRILLIC_WORD.test(w))
          .join(' '),
      )
      .filter(Boolean);
    if (!parts.length) continue;
    const words = parts.join(' ').split(' ');
    const enough = parts.length > 1 || words.length > 1 ? letterCount(parts) >= 4 : words[0].length >= 4;
    if (enough) out.push(parts);
  }
  return out;
}

/** The ordered literal parts a title can be found by, one list per alternative. */
export function patternAlternatives(title: string, lang: MatchLang): string[][] {
  const t = String(title || '');
  return lang === 'zh' ? chineseAlternatives(t) : russianAlternatives(t);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ruPartCache = new Map<string, RegExp>();
function russianPartRe(part: string): RegExp {
  let re = ruPartCache.get(part);
  if (!re) {
    const body = part.split(' ').map(escapeRe).join('[\\s,]+');
    re = new RegExp(`(?<![\\p{L}\\p{M}-])${body}(?![\\p{L}\\p{M}-])`, 'giu');
    ruPartCache.set(part, re);
  }
  return re;
}

/**
 * Where the parts occur, in order, or null. `sentence` for Chinese should already be
 * `toSimplifiedForMatch`-normalized; offsets index the sentence as given.
 */
export function findPatternSpans(sentence: string, parts: readonly string[], lang: MatchLang): PatternSpan[] | null {
  const spans: PatternSpan[] = [];
  let from = 0;
  for (const part of parts) {
    if (lang === 'zh') {
      const at = sentence.indexOf(part, from);
      if (at < 0) return null;
      spans.push({ start: at, end: at + part.length });
      from = at + part.length;
    } else {
      const re = russianPartRe(part);
      re.lastIndex = from;
      const m = re.exec(sentence);
      if (!m) return null;
      spans.push({ start: m.index, end: m.index + m[0].length });
      from = m.index + m[0].length;
    }
  }
  return spans;
}

/**
 * Traditional → Simplified for the characters the grammar library's Chinese patterns are
 * written with, one code point for one code point, so offsets found in the normalized line
 * are offsets in the line as shown. Only characters that differ are listed; anything else
 * passes through.
 */
const HANT_TO_HANS: Record<string, string> = {
  雖: '虽', 經: '经', 過: '过', 還: '还', 時: '时', 邊: '边', 從: '从', 這: '这', 麼: '么', 樣: '样',
  後: '后', 為: '为', 對: '对', 給: '给', 讓: '让', 說: '说', 會: '会', 沒: '没', 兒: '儿', 點: '点',
  裡: '里', 裏: '里', 與: '与', 於: '于', 無: '无', 論: '论', 儘: '尽', 盡: '尽', 並: '并', 連: '连',
  著: '着', 們: '们', 實: '实', 際: '际', 應: '应', 該: '该', 許: '许', 聽: '听', 見: '见', 覺: '觉',
  將: '将', 專: '专', 門: '门', 間: '间', 關: '关', 係: '系', 爾: '尔', 豈: '岂', 異: '异', 難: '难',
  總: '总', 結: '结', 終: '终', 剛: '刚', 萬: '万', 辭: '辞', 別: '别', 離: '离', 開: '开', 動: '动',
  東: '东', 幾: '几', 個: '个', 兩: '两', 發: '发', 簡: '简', 謂: '谓', 蓋: '盖', 寧: '宁', 嘗: '尝',
  據: '据', 夠: '够', 來: '来', 誰: '谁', 請: '请', 條: '条', 麵: '面', 嗎: '吗', 聲: '声', 氣: '气',
  歡: '欢', 愛: '爱', 學: '学', 習: '习', 話: '话', 語: '语', 認: '认', 識: '识', 讀: '读', 寫: '写',
  買: '买', 賣: '卖', 錢: '钱', 車: '车', 飯: '饭', 電: '电', 視: '视', 腦: '脑', 題: '题', 問: '问',
  長: '长', 張: '张', 現: '现', 場: '场', 帶: '带', 幫: '帮', 準: '准', 備: '备', 須: '须', 變: '变',
  極: '极', 壞: '坏', 雙: '双', 隨: '随', 隻: '只', 祇: '只', 僅: '仅', 漸: '渐', 罷: '罢', 決: '决',
  況: '况', 較: '较', 屬: '属', 歸: '归', 務: '务', 絕: '绝', 厲: '厉', 滿: '满',
};

export function toSimplifiedForMatch(text: string): string {
  let out = '';
  for (const ch of text) out += HAN.test(ch) ? HANT_TO_HANS[ch] ?? ch : ch;
  return out;
}

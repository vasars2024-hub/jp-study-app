// Japanese numerals, counters, dates, and clock times → kana readings.
//
// Study-native track item 5. The app already ships a Counter Quiz, but that is a
// static prompt game (COUNTER_PROMPTS) — it cannot read an arbitrary number, and
// nothing else in the codebase converts numerals to kana. This is the reference
// reader the quiz is not.
//
// Pure and dependency-free so it tests as a table, the same way deinflect.ts
// does. Counters are where the sound changes live (rendaku and gemination:
// 一本 いっぽん, 三本 さんぼん, 六本 ろっぽん), so the readings for 1–10 are
// tabulated per counter rather than derived — the derivation rules have more
// exceptions than members, and a table is both shorter and auditable.

/** 1–9. Index 0 is empty so a zero digit contributes nothing to a group. */
const ONES = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];

/** Reading of a 0–9999 group. */
function readGroup(n: number, beforeMyriad: boolean): string {
  if (n === 0) return '';
  const sen = Math.floor(n / 1000);
  const hyaku = Math.floor((n % 1000) / 100);
  const juu = Math.floor((n % 100) / 10);
  const ichi = n % 10;
  let out = '';
  // 1000 is bare せん on its own, but いっせん before 万/億 (一千万).
  if (sen === 1) out += beforeMyriad ? 'いっせん' : 'せん';
  else if (sen === 3) out += 'さんぜん';
  else if (sen === 8) out += 'はっせん';
  else if (sen) out += `${ONES[sen]}せん`;
  // 100 is bare ひゃく; 300/600/800 change sound.
  if (hyaku === 1) out += 'ひゃく';
  else if (hyaku === 3) out += 'さんびゃく';
  else if (hyaku === 6) out += 'ろっぴゃく';
  else if (hyaku === 8) out += 'はっぴゃく';
  else if (hyaku) out += `${ONES[hyaku]}ひゃく`;
  // 10 is bare じゅう.
  if (juu === 1) out += 'じゅう';
  else if (juu) out += `${ONES[juu]}じゅう`;
  out += ONES[ichi];
  return out;
}

const MYRIADS: { value: number; kana: string }[] = [
  { value: 1e12, kana: 'ちょう' },
  { value: 1e8, kana: 'おく' },
  { value: 1e4, kana: 'まん' },
];

/**
 * Reading of a non-negative integer. Supports up to 9,999,999,999,999 (兆);
 * beyond that the myriad chain would need 京 and the readings get contested.
 */
export function numberToKana(n: number): string {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return '';
  if (n === 0) return 'ゼロ';
  let rest = n;
  let out = '';
  for (const { value, kana } of MYRIADS) {
    const count = Math.floor(rest / value);
    if (count > 0) {
      out += readGroup(count, true) + kana;
      rest -= count * value;
    }
  }
  return out + readGroup(rest, false);
}

/** Readings for counts 1–10; index 0 unused. Composition handles 11+. */
interface CounterSpec {
  /** The counter as written, e.g. 本. */
  kanji: string;
  /** What it counts, for the UI. */
  label: string;
  /** Full readings (number + counter) for 1–10. */
  table: string[];
  /** Whole-number overrides that ignore composition, e.g. 20歳 → はたち. */
  exact?: Record<number, string>;
  /** True when the counter does not compose past 10 (the native つ series). */
  stopsAtTen?: boolean;
}

/**
 * Counters that geminate against an exact multiple of 100 — 100本 is ひゃっぽん,
 * not ひゃく + ほん. Those forms are not tabulated here, so `readCounter` returns
 * '' for a round hundred of these rather than emitting a confidently wrong
 * reading. Counters outside this set take the plain number + counter at round
 * hundreds (100枚 → ひゃくまい, 100人 → ひゃくにん).
 */
const GEMINATES_AT_HUNDRED = new Set(['本', '個', '匹', '杯', '階', '分', '回']);

/**
 * The counter's plain reading, used at round hundreds (100枚 → ひゃく + まい).
 * Stated rather than derived from `table[2]`: that shortcut assumes the form at
 * 2 is 'に' + plain, which is false for 人 (ふたり) and would yield ひゃくたり.
 */
const PLAIN_FORMS: Record<string, string> = {
  本: 'ほん', 枚: 'まい', 個: 'こ', 匹: 'ひき', 杯: 'はい', 人: 'にん',
  歳: 'さい', 階: 'かい', 分: 'ふん', 冊: 'さつ', 台: 'だい', 回: 'かい',
};

const _ = '';

export const COUNTERS: CounterSpec[] = [
  {
    kanji: '本', label: 'long thin things',
    table: [_, 'いっぽん', 'にほん', 'さんぼん', 'よんほん', 'ごほん', 'ろっぽん', 'ななほん', 'はっぽん', 'きゅうほん', 'じゅっぽん'],
  },
  {
    kanji: '枚', label: 'flat things',
    table: [_, 'いちまい', 'にまい', 'さんまい', 'よんまい', 'ごまい', 'ろくまい', 'ななまい', 'はちまい', 'きゅうまい', 'じゅうまい'],
  },
  {
    kanji: '個', label: 'small objects',
    table: [_, 'いっこ', 'にこ', 'さんこ', 'よんこ', 'ごこ', 'ろっこ', 'ななこ', 'はっこ', 'きゅうこ', 'じゅっこ'],
  },
  {
    kanji: '匹', label: 'small animals',
    table: [_, 'いっぴき', 'にひき', 'さんびき', 'よんひき', 'ごひき', 'ろっぴき', 'ななひき', 'はっぴき', 'きゅうひき', 'じゅっぴき'],
  },
  {
    kanji: '杯', label: 'cupfuls',
    table: [_, 'いっぱい', 'にはい', 'さんばい', 'よんはい', 'ごはい', 'ろっぱい', 'ななはい', 'はっぱい', 'きゅうはい', 'じゅっぱい'],
  },
  {
    kanji: '人', label: 'people',
    table: [_, 'ひとり', 'ふたり', 'さんにん', 'よにん', 'ごにん', 'ろくにん', 'ななにん', 'はちにん', 'きゅうにん', 'じゅうにん'],
  },
  {
    kanji: '歳', label: 'years of age',
    table: [_, 'いっさい', 'にさい', 'さんさい', 'よんさい', 'ごさい', 'ろくさい', 'ななさい', 'はっさい', 'きゅうさい', 'じゅっさい'],
    exact: { 20: 'はたち' },
  },
  {
    kanji: '階', label: 'floors',
    table: [_, 'いっかい', 'にかい', 'さんがい', 'よんかい', 'ごかい', 'ろっかい', 'ななかい', 'はっかい', 'きゅうかい', 'じゅっかい'],
  },
  {
    kanji: '分', label: 'minutes',
    table: [_, 'いっぷん', 'にふん', 'さんぷん', 'よんぷん', 'ごふん', 'ろっぷん', 'ななふん', 'はっぷん', 'きゅうふん', 'じゅっぷん'],
  },
  {
    kanji: '冊', label: 'bound volumes',
    table: [_, 'いっさつ', 'にさつ', 'さんさつ', 'よんさつ', 'ごさつ', 'ろくさつ', 'ななさつ', 'はっさつ', 'きゅうさつ', 'じゅっさつ'],
  },
  {
    kanji: '台', label: 'machines/vehicles',
    table: [_, 'いちだい', 'にだい', 'さんだい', 'よんだい', 'ごだい', 'ろくだい', 'ななだい', 'はちだい', 'きゅうだい', 'じゅうだい'],
  },
  {
    kanji: '回', label: 'times/occurrences',
    table: [_, 'いっかい', 'にかい', 'さんかい', 'よんかい', 'ごかい', 'ろっかい', 'ななかい', 'はっかい', 'きゅうかい', 'じゅっかい'],
  },
  {
    kanji: 'つ', label: 'general (native series)',
    table: [_, 'ひとつ', 'ふたつ', 'みっつ', 'よっつ', 'いつつ', 'むっつ', 'ななつ', 'やっつ', 'ここのつ', 'とお'],
    stopsAtTen: true,
  },
];

const COUNTER_BY_KANJI = new Map(COUNTERS.map((c) => [c.kanji, c]));
// 才 is the everyday simplification of 歳 and reads identically. Aliased rather
// than duplicated so the two can never drift apart.
const SAI = COUNTER_BY_KANJI.get('歳');
if (SAI) COUNTER_BY_KANJI.set('才', SAI);

/**
 * Reading for `n` of `counter`.
 *
 * Composition rule: the sound change lives on the final digit, so 21本 is
 * にじゅう + いっぽん and 20本 is に + じゅっぽん. Returns '' when the counter is
 * unknown or the count is out of range.
 */
export function readCounter(n: number, counterKanji: string): string {
  const spec = COUNTER_BY_KANJI.get(counterKanji);
  if (!spec || !Number.isInteger(n) || n < 1) return '';
  if (spec.exact?.[n]) return spec.exact[n];
  if (n <= 10) return spec.table[n];
  if (spec.stopsAtTen) return '';

  if (n < 100) {
    const last = n % 10;
    // An exact multiple of ten takes the 10-form: 20 → に + じゅっぽん.
    if (last === 0) {
      const tens = Math.floor(n / 10);
      return (tens === 1 ? '' : numberToKanaBare(tens)) + spec.table[10];
    }
    // Otherwise the change is on the final digit: 21 → にじゅう + いっぽん.
    return numberToKanaBare(n - last) + spec.table[last];
  }

  // Past 100 the change still lives in the last two digits, so peel those off
  // and read the rest as a plain number: 123本 → ひゃく + にじゅうさんぼん.
  const rem = n % 100;
  if (rem !== 0) return numberToKanaBare(n - rem) + readCounter(rem, counterKanji);

  // An exact multiple of 100. Geminating counters have their own forms here
  // (ひゃっぽん) which this table does not carry — say nothing rather than guess.
  if (GEMINATES_AT_HUNDRED.has(spec.kanji)) return '';
  // Otherwise the counter attaches to the plain number: 100枚 → ひゃくまい.
  const plain = PLAIN_FORMS[spec.kanji];
  return plain ? numberToKanaBare(n) + plain : '';
}

/** numberToKana without the ゼロ special case — '' for 0, for composition. */
function numberToKanaBare(n: number): string {
  return n === 0 ? '' : numberToKana(n);
}

const DAYS: Record<number, string> = {
  1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか',
  6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか',
  14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか',
};

/** Day of the month (1–31). The first ten days plus 14/20/24 are irregular. */
export function readDayOfMonth(d: number): string {
  if (!Number.isInteger(d) || d < 1 || d > 31) return '';
  return DAYS[d] ?? `${numberToKana(d)}にち`;
}

const MONTHS: Record<number, string> = { 4: 'しがつ', 7: 'しちがつ', 9: 'くがつ' };

/** Month (1–12). 4/7/9 use the irregular readings. */
export function readMonth(m: number): string {
  if (!Number.isInteger(m) || m < 1 || m > 12) return '';
  return MONTHS[m] ?? `${numberToKana(m)}がつ`;
}

const HOURS: Record<number, string> = { 4: 'よじ', 7: 'しちじ', 9: 'くじ' };

/** Hour (0–23). 4/7/9 are irregular; 0 is れいじ. */
export function readHour(h: number): string {
  if (!Number.isInteger(h) || h < 0 || h > 23) return '';
  if (h === 0) return 'れいじ';
  return HOURS[h] ?? `${numberToKana(h)}じ`;
}

/** Clock time. Minute 0 reads as the bare hour (3:00 → さんじ). */
export function readTime(h: number, m: number): string {
  const hour = readHour(h);
  if (!hour) return '';
  if (!Number.isInteger(m) || m < 0 || m > 59) return '';
  if (m === 0) return hour;
  return hour + readCounter(m, '分');
}

/** One way of reading the input. */
export interface NumberReading {
  /** What this interpretation is, e.g. 'Number' or '本 — long thin things'. */
  label: string;
  /** The input as it would be written. */
  surface: string;
  /** The kana reading. */
  reading: string;
}

/**
 * Interpret a free-text input and return every reading that applies.
 *
 * Deliberately returns *all* matches rather than picking one: 3分 is a duration
 * and 3時5分 is a clock time, and a reference tool should show what it knows
 * instead of guessing which the user meant.
 */
export function readInput(input: string): NumberReading[] {
  const s = input.trim();
  if (!s) return [];
  const out: NumberReading[] = [];

  // Clock time: 3:45, 3時45分, 15時
  const time = s.match(/^(\d{1,2})\s*[:時]\s*(\d{1,2})?\s*分?$/);
  if (time) {
    const h = Number(time[1]);
    const m = time[2] ? Number(time[2]) : 0;
    const reading = readTime(h, m);
    if (reading) out.push({ label: 'Clock time', surface: `${h}時${m ? `${m}分` : ''}`, reading });
  }

  // Date: 5月5日, or a bare 5日
  const date = s.match(/^(?:(\d{1,2})\s*月)?\s*(\d{1,2})\s*日$/);
  if (date) {
    const mo = date[1] ? Number(date[1]) : null;
    const d = Number(date[2]);
    const day = readDayOfMonth(d);
    if (day) {
      const month = mo ? readMonth(mo) : '';
      if (!mo || month) {
        out.push({ label: 'Date', surface: `${mo ? `${mo}月` : ''}${d}日`, reading: month + day });
      }
    }
  }

  // Number + counter: 3本, 20歳, 5つ
  const counted = s.match(/^(\d+)\s*(.+)$/);
  if (counted) {
    const n = Number(counted[1]);
    const spec = COUNTER_BY_KANJI.get(counted[2].trim());
    if (spec) {
      const reading = readCounter(n, counted[2].trim());
      if (reading) {
        out.push({ label: `${counted[2].trim()} — ${spec.label}`, surface: s, reading });
      }
    }
  }

  // Bare number
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isSafeInteger(n)) {
      const reading = numberToKana(n);
      if (reading) out.push({ label: 'Number', surface: n.toLocaleString(), reading });
    }
  }

  return out;
}

/** Every counter reading for a given count — what the panel lists. */
export function allCounterReadings(n: number): NumberReading[] {
  return COUNTERS.map((c) => ({
    label: `${c.kanji} — ${c.label}`,
    surface: `${n}${c.kanji}`,
    reading: readCounter(n, c.kanji),
  })).filter((r) => r.reading);
}

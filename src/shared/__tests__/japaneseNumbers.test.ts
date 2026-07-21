import { describe, expect, it } from 'vitest';
import {
  allCounterReadings,
  numberToKana,
  readCounter,
  readDayOfMonth,
  readHour,
  readInput,
  readMonth,
  readTime,
} from '../japaneseNumbers';

describe('numberToKana', () => {
  it('reads single digits', () => {
    expect(numberToKana(0)).toBe('ゼロ');
    expect(numberToKana(1)).toBe('いち');
    expect(numberToKana(4)).toBe('よん');
    expect(numberToKana(7)).toBe('なな');
    expect(numberToKana(9)).toBe('きゅう');
  });

  it('reads tens with a bare じゅう at 10', () => {
    expect(numberToKana(10)).toBe('じゅう');
    expect(numberToKana(11)).toBe('じゅういち');
    expect(numberToKana(20)).toBe('にじゅう');
    expect(numberToKana(99)).toBe('きゅうじゅうきゅう');
  });

  it('applies the hundreds sound changes', () => {
    expect(numberToKana(100)).toBe('ひゃく');
    expect(numberToKana(200)).toBe('にひゃく');
    expect(numberToKana(300)).toBe('さんびゃく');
    expect(numberToKana(600)).toBe('ろっぴゃく');
    expect(numberToKana(800)).toBe('はっぴゃく');
  });

  it('applies the thousands sound changes', () => {
    expect(numberToKana(1000)).toBe('せん');
    expect(numberToKana(3000)).toBe('さんぜん');
    expect(numberToKana(8000)).toBe('はっせん');
  });

  it('reads the plan\'s worked example', () => {
    expect(numberToKana(1234)).toBe('せんにひゃくさんじゅうよん');
  });

  it('reads myriads', () => {
    expect(numberToKana(10000)).toBe('いちまん');
    expect(numberToKana(1000000)).toBe('ひゃくまん');
    expect(numberToKana(100000000)).toBe('いちおく');
  });

  it('uses いっせん before a myriad unit but せん alone', () => {
    // 一千万 is いっせんまん, while a bare 1000 is just せん.
    expect(numberToKana(10000000)).toBe('いっせんまん');
    expect(numberToKana(1000)).toBe('せん');
  });

  it('rejects non-integers and negatives', () => {
    expect(numberToKana(-1)).toBe('');
    expect(numberToKana(1.5)).toBe('');
    expect(numberToKana(NaN)).toBe('');
  });
});

describe('readCounter — sound changes', () => {
  it('reads 本 with its gemination and rendaku', () => {
    expect(readCounter(1, '本')).toBe('いっぽん');
    expect(readCounter(3, '本')).toBe('さんぼん');
    expect(readCounter(6, '本')).toBe('ろっぽん');
    expect(readCounter(10, '本')).toBe('じゅっぽん');
  });

  it('reads 匹 and 杯', () => {
    expect(readCounter(1, '匹')).toBe('いっぴき');
    expect(readCounter(3, '匹')).toBe('さんびき');
    expect(readCounter(3, '杯')).toBe('さんばい');
  });

  it('reads 人 with its native forms for 1, 2, and 4', () => {
    expect(readCounter(1, '人')).toBe('ひとり');
    expect(readCounter(2, '人')).toBe('ふたり');
    expect(readCounter(4, '人')).toBe('よにん');
    expect(readCounter(5, '人')).toBe('ごにん');
  });

  it('reads 階 with rendaku only at 3', () => {
    expect(readCounter(3, '階')).toBe('さんがい');
    expect(readCounter(4, '階')).toBe('よんかい');
  });

  it('reads 分 for minutes', () => {
    expect(readCounter(1, '分')).toBe('いっぷん');
    expect(readCounter(4, '分')).toBe('よんぷん');
    expect(readCounter(30, '分')).toBe('さんじゅっぷん');
  });

  it('keeps regular counters regular', () => {
    expect(readCounter(1, '枚')).toBe('いちまい');
    expect(readCounter(8, '枚')).toBe('はちまい');
    expect(readCounter(1, '台')).toBe('いちだい');
  });
});

describe('readCounter — composition past ten', () => {
  it('puts the sound change on the final digit', () => {
    expect(readCounter(11, '本')).toBe('じゅういっぽん');
    expect(readCounter(21, '本')).toBe('にじゅういっぽん');
    expect(readCounter(23, '本')).toBe('にじゅうさんぼん');
  });

  it('uses the ten-form for exact multiples of ten', () => {
    expect(readCounter(20, '本')).toBe('にじゅっぽん');
    expect(readCounter(30, '本')).toBe('さんじゅっぽん');
  });

  it('reads past a hundred by peeling the last two digits', () => {
    expect(readCounter(123, '本')).toBe('ひゃくにじゅうさんぼん');
    expect(readCounter(120, '本')).toBe('ひゃくにじゅっぽん');
    expect(readCounter(101, '本')).toBe('ひゃくいっぽん');
  });

  it('reads round hundreds for counters that do not geminate', () => {
    expect(readCounter(100, '枚')).toBe('ひゃくまい');
    expect(readCounter(100, '人')).toBe('ひゃくにん');
    expect(readCounter(200, '台')).toBe('にひゃくだい');
  });

  it('stays silent on round hundreds of geminating counters', () => {
    // 100本 is ひゃっぽん and 100回 is ひゃっかい; those forms are not tabulated,
    // so the reader says nothing rather than emitting ひゃくほん.
    expect(readCounter(100, '本')).toBe('');
    expect(readCounter(100, '回')).toBe('');
    expect(readCounter(300, '匹')).toBe('');
  });

  it('honours whole-number overrides', () => {
    expect(readCounter(20, '歳')).toBe('はたち');
    expect(readCounter(21, '歳')).toBe('にじゅういっさい');
  });

  it('treats 才 as 歳', () => {
    expect(readCounter(1, '才')).toBe('いっさい');
    expect(readCounter(20, '才')).toBe('はたち');
  });

  it('stops the native つ series at ten', () => {
    expect(readCounter(9, 'つ')).toBe('ここのつ');
    expect(readCounter(10, 'つ')).toBe('とお');
    expect(readCounter(11, 'つ')).toBe('');
  });

  it('returns empty for unknown counters and bad counts', () => {
    expect(readCounter(3, '匙')).toBe('');
    expect(readCounter(0, '本')).toBe('');
    expect(readCounter(-2, '本')).toBe('');
  });
});

describe('dates and times', () => {
  it('reads the irregular first ten days', () => {
    expect(readDayOfMonth(1)).toBe('ついたち');
    expect(readDayOfMonth(4)).toBe('よっか');
    expect(readDayOfMonth(8)).toBe('ようか');
    expect(readDayOfMonth(10)).toBe('とおか');
  });

  it('reads the later irregular days', () => {
    expect(readDayOfMonth(14)).toBe('じゅうよっか');
    expect(readDayOfMonth(20)).toBe('はつか');
    expect(readDayOfMonth(24)).toBe('にじゅうよっか');
  });

  it('reads regular days with にち', () => {
    expect(readDayOfMonth(11)).toBe('じゅういちにち');
    expect(readDayOfMonth(31)).toBe('さんじゅういちにち');
    expect(readDayOfMonth(32)).toBe('');
  });

  it('reads months, with 4/7/9 irregular', () => {
    expect(readMonth(1)).toBe('いちがつ');
    expect(readMonth(4)).toBe('しがつ');
    expect(readMonth(7)).toBe('しちがつ');
    expect(readMonth(9)).toBe('くがつ');
    expect(readMonth(13)).toBe('');
  });

  it('reads hours, with 4/7/9 irregular', () => {
    expect(readHour(3)).toBe('さんじ');
    expect(readHour(4)).toBe('よじ');
    expect(readHour(9)).toBe('くじ');
    expect(readHour(0)).toBe('れいじ');
  });

  it('reads clock times, with a bare hour at :00', () => {
    expect(readTime(3, 0)).toBe('さんじ');
    expect(readTime(3, 45)).toBe('さんじよんじゅうごふん');
    expect(readTime(4, 1)).toBe('よじいっぷん');
    expect(readTime(3, 60)).toBe('');
  });
});

describe('readInput', () => {
  it('reads a bare number', () => {
    expect(readInput('1234')).toEqual([
      { label: 'Number', surface: '1,234', reading: 'せんにひゃくさんじゅうよん' },
    ]);
  });

  it('reads a counted phrase', () => {
    const out = readInput('3本');
    expect(out).toHaveLength(1);
    expect(out[0].reading).toBe('さんぼん');
    expect(out[0].label).toContain('本');
  });

  it('reads a clock time in both notations', () => {
    expect(readInput('3:45')[0].reading).toBe('さんじよんじゅうごふん');
    expect(readInput('3時45分')[0].reading).toBe('さんじよんじゅうごふん');
  });

  it('reads a date with and without the month', () => {
    expect(readInput('5月5日')[0].reading).toBe('ごがついつか');
    expect(readInput('20日')[0].reading).toBe('はつか');
  });

  it('returns every applicable interpretation rather than guessing', () => {
    // 5分 is both a duration (counter) and readable as a bare time component.
    const out = readInput('5分');
    expect(out.some((r) => r.reading === 'ごふん')).toBe(true);
  });

  it('returns nothing for input it cannot read', () => {
    expect(readInput('')).toEqual([]);
    expect(readInput('hello')).toEqual([]);
    expect(readInput('3匙')).toEqual([]);
  });
});

describe('allCounterReadings', () => {
  it('lists every counter that applies to the count', () => {
    const three = allCounterReadings(3);
    expect(three.find((r) => r.surface === '3本')?.reading).toBe('さんぼん');
    expect(three.find((r) => r.surface === '3つ')?.reading).toBe('みっつ');
  });

  it('drops counters that do not reach the count', () => {
    const twelve = allCounterReadings(12);
    // The native つ series stops at とお, so it must not appear for 12.
    expect(twelve.find((r) => r.surface === '12つ')).toBeUndefined();
    expect(twelve.find((r) => r.surface === '12本')?.reading).toBe('じゅうにほん');
  });
});

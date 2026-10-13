/**
 * A number in a Russian string must not be followed by a noun that has to agree with it.
 *
 * Russian puts the counted noun in one of three forms depending on the number (1 / 2–4 / 5+,
 * with 11–14 behaving like 5 and 21 like 1). A plain string can hold only one of them, so
 * `'Показать ещё {count} глав'` read "Показать ещё 3 глав", `'{count} строк'` read "1 строк",
 * and `'Ошибки в {count} плейлисте(ах)'` hand-rolled both forms into one. The scorecard counted
 * 185 such keys; nothing failed for any of them because every other gate asks whether a key
 * EXISTS, not whether its sentence agrees.
 *
 * `translate()` (../i18n/core.ts) picks a CLDR plural arm from `vars.count`, so the fix has
 * two shapes and this test accepts both:
 *
 *   - `{count}` + noun → a `{ one, few, many, other }` object, which is the only way the noun
 *     can agree;
 *   - any OTHER numeric slot (`{total}`, `{cards}`, `{max}`, …) cannot select an arm, so the
 *     sentence is rephrased to let the number stand alone: «Карточек: {cards}», «из {total}»
 *     at the end, or a unit abbreviation («{days} дн.»).
 *
 * The scan looks at plain-string ru entries only (a plural object is already plural-aware) and
 * flags a numeric slot followed directly by a Cyrillic word that inflects. Prepositions,
 * conjunctions and unit abbreviations are invariant, so they are allowed after a number.
 */
import { describe, expect, it } from 'vitest';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { translate, type CatalogEntry } from '../i18n/core';

/**
 * Slots whose value is a count. `{count}` is the one `translate()` selects on; the rest are the
 * counters this catalog actually uses. Deliberately excluded: `{rate}`, `{ratio}`, `{pct}`,
 * `{percent}` (decimals — "в 1,6 раза" is the fractional form and is correct), byte/size slots
 * that arrive pre-formatted (`{bytes}`, `{required}`), and identifiers (`{index}`, `{episode}`,
 * `{year}`, `{level}`), which are ordinals or labels rather than counts.
 */
const NUMERIC_SLOTS = new Set(
  (
    'count n total shown max min lines pages files points scanned cards notes words days reviews ' +
    'rejected added updated unchanged derivatives attempted applied planned attached covered ' +
    'requested delivered remaining before ok fail limit read used agree missing entries answered ' +
    'unscheduled terms glossCount incomplete lookups rewinds candidates from to recurring distinct ' +
    'ranked gathered sources matched loaded groups sampled delta proposed offset ops tagged tokens ' +
    'chars placed ambiguous unplaced skipped succeeded overCap books due pace average parts known ' +
    'band have done rows changed found seen minutes hours seconds sessions'
  ).split(' '),
);

/** Words that never change with the number in front of them. */
const INVARIANT = new Set(
  'из с со в во на и или не нет уже ещё по до для за при без после перед как все раз от к ко о об из-за'.split(' '),
);

/** Unit abbreviations: «5 мин», «3 дн.», «2 МБ». An abbreviation does not inflect. */
const UNIT = /^(мин|с|ч|мс|мб|кб|гб|б|пкс|кбит|мбит|д|сек|мес|г|тыс|млн|пт|зн|симв|стр|п|повт|дн|пикс|кадр)\.?$/i;

/** «плейлисте(ах)», «файла(ов)», «вспомнил(а)» — two forms glued into one string. */
const HAND_ROLLED = /[а-яё]\((?:а|ах|и|ов|ей|ы|ам|ями|ь)\)/i;

/** Every agreement defect in one plain Russian string; empty when the string is fine. */
export function russianAgreementDefects(value: string): string[] {
  const found: string[] = [];
  for (const m of value.matchAll(/\{(\w+)\}\s+([А-Яа-яЁё][А-Яа-яЁё-]*)(\.?)/g)) {
    const [, slot, word, dot] = m;
    if (!NUMERIC_SLOTS.has(slot)) continue;
    if (INVARIANT.has(word.toLowerCase()) || UNIT.test(word + dot)) continue;
    found.push(`{${slot}} ${word}`);
  }
  if (HAND_ROLLED.test(value)) found.push(`hand-rolled ${HAND_ROLLED.exec(value)?.[0]}`);
  return found;
}

const ru = (key: string, count: number): string =>
  translate(key, { count, first: 'X', episode: 2, title: 'T', styles: 'S', detail: 'D' }, {
    lang: 'ru',
    catalog: CATALOGS.ru,
    fallback: en,
  });

describe('Russian count agreement', () => {
  it('has no plain ru string whose number is followed by a noun that must agree with it', () => {
    const offenders: string[] = [];
    for (const [key, entry] of Object.entries(CATALOGS.ru) as [string, CatalogEntry][]) {
      if (typeof entry !== 'string') continue;
      const defects = russianAgreementDefects(entry);
      if (defects.length) offenders.push(`${key}: ${defects.join(', ')} — «${entry}»`);
    }
    expect(
      offenders,
      'make a {count} string a { one, few, many, other } object; for any other numeric slot, ' +
        'rephrase so the number stands alone («Карточек: {cards}»)',
    ).toEqual([]);
  });

  it('has no hand-rolled "(а)/(ов)" forms inside a plural arm either', () => {
    const offenders: string[] = [];
    for (const [key, entry] of Object.entries(CATALOGS.ru) as [string, CatalogEntry][]) {
      if (typeof entry === 'string') continue;
      for (const [arm, form] of Object.entries(entry)) {
        if (HAND_ROLLED.test(form)) offenders.push(`${key}.${arm}: «${form}»`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is not vacuous: it catches the shipped defects and passes the safe shapes', () => {
    expect(russianAgreementDefects('Показать ещё {count} глав')).toEqual(['{count} глав']);
    expect(russianAgreementDefects('{count} строк')).toEqual(['{count} строк']);
    expect(russianAgreementDefects('Ошибки в {count} плейлисте(ах) — {first}')).toHaveLength(2);
    expect(russianAgreementDefects('{done} из {total} страниц')).toEqual(['{total} страниц']);
    // Safe: the number stands alone, is followed by a preposition, or by a unit abbreviation.
    expect(russianAgreementDefects('Карточек: {count}')).toEqual([]);
    expect(russianAgreementDefects('{count} из {total}')).toEqual([]);
    expect(russianAgreementDefects('{minutes} мин чтения')).toEqual([]);
    expect(russianAgreementDefects('Через {day} дн.')).toEqual([]);
    // A name slot is not a count: «{name} удалена» agrees with the name, not a number.
    expect(russianAgreementDefects('{name} удалена.')).toEqual([]);
  });

  it('renders the keys the scorecard named with the right form at 1, 3, 5, 11 and 21', () => {
    expect([1, 3, 5, 11, 21].map((n) => ru('reading.sources.showMore', n))).toEqual([
      'Показать ещё 1 главу',
      'Показать ещё 3 главы',
      'Показать ещё 5 глав',
      'Показать ещё 11 глав',
      'Показать ещё 21 главу',
    ]);
    expect([1, 3, 5].map((n) => ru('subHarvest.segment', n))).toEqual([
      'Эпизод 2 — 1 строка',
      'Эпизод 2 — 3 строки',
      'Эпизод 2 — 5 строк',
    ]);
    expect([1, 4].map((n) => ru('yt.news.partialErrors', n))).toEqual([
      'Ошибка в 1 плейлисте — X',
      'Ошибки в 4 плейлистах — X',
    ]);
  });
});

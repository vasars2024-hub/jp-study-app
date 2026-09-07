/**
 * A plural arm that hides a slot — the class, given a gate.
 *
 * `translate()` picks ONE arm by CLDR category and interpolates that arm alone.
 * ja and zh have a single category, `other`, so **every ja/zh render of a plural
 * key uses the `other` arm and nothing else**. If a slot appears in `one` (or
 * `few`, or `many`) and is missing from `other`, the sentence the Japanese and
 * Chinese user reads is missing that noun entirely — and en reads correctly for
 * count 1, which is exactly the case a developer checks.
 *
 * `tools/i18n-check.cjs` cannot see it: the key exists in all four locales, so
 * the locales are consistent with each other and it reports green. Nothing else
 * looks inside an arm.
 *
 * The rule is deliberately one-directional. `other` may carry slots the `one`
 * arm does not — 8 entries do, and they are correct: English spells the number
 * in words at count 1 ("the file did not classify") and drops `{count}`. That
 * is idiom, not drift. The failure is only ever the reverse.
 *
 * Not covered, so exit 0 is not over-read: an arm whose slot is spelled
 * differently but present (`{name}` vs `{title}`) reads as two distinct slots
 * and is reported; an arm that omits a slot ALL arms omit is invisible, because
 * this compares the arms with each other, not with the call site's vars.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const I18N = path.join(__dirname, '..', 'i18n');
const LOCALES = ['en', 'ja', 'ru', 'zh'] as const;
const CATEGORIES = 'zero|one|two|few|many|other';

interface Drift {
  key: string;
  arm: string;
  missing: string[];
}

/** Every `.ts` under the i18n tree, tests excluded. */
function catalogFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) catalogFiles(full, out);
    else if (/\.ts$/.test(entry.name)) out.push(full);
  }
  return out;
}

const slotsIn = (arm: string): Set<string> =>
  new Set([...arm.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

/**
 * Plural entries in one catalog's source, and the arms whose slots `other` does
 * not carry.
 *
 * The arm matcher is deliberately NOT line-anchored. `catalogs/ru.ts` packs two
 * arms onto one line (`one: '…', few: '…',`), and a line-anchored version of
 * this reported 27 entries as having "no `other` arm" — every one of them a
 * false alarm from the instrument, and every one in the locale with the most
 * arms to get wrong. The `'…'` body allows escaped quotes so an apostrophe
 * inside a translation cannot truncate an arm and fabricate a missing slot.
 */
export function pluralSlotDrift(source: string): { entries: number; arms: number; drift: Drift[] } {
  const drift: Drift[] = [];
  let entries = 0;
  let arms = 0;
  // `-` last in the class, unescaped: `\-` is `no-useless-escape` under this
  // config, and the `.cjs` scans this was lifted from are not linted as TS.
  for (const entry of source.matchAll(/^\s*'([A-Za-z0-9_][A-Za-z0-9_.-]*)'\s*:\s*\{([\s\S]*?)\},?\s*$/gm)) {
    const found = [
      ...entry[2].matchAll(new RegExp(`\\b(${CATEGORIES})\\s*:\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g')),
    ];
    if (found.length < 2) continue; // not a plural table
    entries += 1;
    arms += found.length;
    const other = found.find((a) => a[1] === 'other');
    if (!other) {
      drift.push({ key: entry[1], arm: '(none)', missing: ['other'] });
      continue;
    }
    const carried = slotsIn(other[2]);
    for (const arm of found) {
      if (arm[1] === 'other') continue;
      const missing = [...slotsIn(arm[2])].filter((slot) => !carried.has(slot));
      if (missing.length) drift.push({ key: entry[1], arm: arm[1], missing });
    }
  }
  return { entries, arms, drift };
}

describe('a plural arm cannot carry a slot `other` lacks — ja and zh only ever read `other`', () => {
  const scanned = LOCALES.map((locale) => ({ locale, files: [] as string[] }));
  for (const file of catalogFiles(I18N)) {
    const hit = scanned.find((s) => path.basename(file) === `${s.locale}.ts`);
    if (hit) hit.files.push(file);
  }

  const scan = (files: string[]) => {
    let entries = 0;
    let arms = 0;
    const drift: string[] = [];
    for (const file of files) {
      const report = pluralSlotDrift(fs.readFileSync(file, 'utf8'));
      entries += report.entries;
      arms += report.arms;
      for (const d of report.drift) {
        drift.push(`${path.basename(path.dirname(file))}/${path.basename(file)} ${d.key}: \`${d.arm}\` uses {${d.missing.join('} {')}} and \`other\` does not`);
      }
    }
    return { entries, arms, drift };
  };

  it.each(scanned)('$locale', ({ locale, files }) => {
    expect(files.length, `no ${locale}.ts found under src/shared/i18n`).toBeGreaterThan(0);
    expect(scan(files).drift).toEqual([]);
  });

  it('is not vacuous — the four locales together hold real plural tables', () => {
    // Deliberately a WHOLE-TREE floor rather than a per-locale one. ja and zh
    // have a single CLDR category, so they hold **zero** multi-arm entries by
    // construction — a per-locale floor demands drift the language cannot have
    // and goes red on a correct catalog. Measured when this landed: 519 entries
    // and 1,384 arms, all of them en and ru. The floor is far below that, so it
    // catches a matcher that stops recognising the catalog shape without going
    // red on ordinary churn.
    const total = scan(scanned.flatMap((s) => s.files));
    expect(total.entries).toBeGreaterThan(300);
    expect(total.arms).toBeGreaterThan(800);
  });

  it('MUTATION CONTROL: catches the exact shape, and only that direction', () => {
    // `one` names the book, `other` does not — so every ja/zh render loses it.
    const broken = `
  'reader.finished': {
    one: 'You finished {title}.',
    other: 'You finished {count} books.',
  },
`;
    expect(pluralSlotDrift(broken).drift).toEqual([
      { key: 'reader.finished', arm: 'one', missing: ['title'] },
    ]);

    // The reverse is idiom, not drift: English spells 1 in words and drops
    // `{count}`. 8 real entries do this and none may go red.
    const idiomatic = `
  'files.dropped': {
    one: 'One file did not classify.',
    other: '{count} files did not classify.',
  },
`;
    expect(pluralSlotDrift(idiomatic).drift).toEqual([]);
  });

  it('reads an arm packed onto a shared line, and one holding an apostrophe', () => {
    // Both were instrument bugs before they were tests. A line-anchored arm
    // matcher called `ru`'s two-arms-per-line entries "no `other` arm" 27 times;
    // an arm body that stops at the first quote truncates at an apostrophe and
    // loses every slot after it.
    const packed = `
  'mal.listed': {
    one: '{count} in the list', few: '{count} in the list',
    many: '{count} in the list', other: '{count} in the list',
  },
`;
    const report = pluralSlotDrift(packed);
    expect(report.arms).toBe(4);
    expect(report.drift).toEqual([]);

    const apostrophe = `
  'deck.owned': {
    one: 'It\\'s {name}\\'s only deck, holding {count} card.',
    other: 'It\\'s {name}\\'s deck, holding {count} cards.',
  },
`;
    expect(pluralSlotDrift(apostrophe).drift).toEqual([]);
  });

  it('a single-arm object is not a plural table and is left alone', () => {
    // ja/zh legitimately write `{ other: '…' }`, and plenty of non-plural
    // objects exist in these files. Scoring either would be noise.
    expect(pluralSlotDrift(`  'x.y': { other: '{count} 件' },\n`).entries).toBe(0);
  });
});

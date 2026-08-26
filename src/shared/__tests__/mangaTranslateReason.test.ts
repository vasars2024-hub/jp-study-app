/**
 * Rubric category 8 on the manga reader: the translate panel's greyed-out controls.
 *
 * The sweep on `@.reader` scored SEVEN mute pairs and all seven were in this one
 * panel — the `Translate to` select and the two range rows, six controls at once,
 * every one `title: null`. Six of the seven shared a single cause the panel never
 * mentioned: the manga OCR engine is not installed.
 *
 * The priority block is the point of the module. `!engineReady` is structural and
 * `volumeBusy`/`translating` are transient, so a row that leads with the run in
 * progress sends the user away to wait and back to a row that is still dead.
 *
 * The weighted-length block is not decoration: correction 12 of the category-8
 * harness exists because a complete Japanese sentence runs 10–12 characters, so an
 * honest ja/zh reason scores as MUTE against a Latin-shaped constant.
 */
import { describe, expect, it } from 'vitest';
import {
  MANGA_TRANSLATE_REASON_KEYS,
  mangaTranslateAheadReason,
  mangaTranslatePageReason,
  mangaTranslateRangeReason,
  mangaTranslateTargetReason,
  type MangaTranslateState,
} from '../mangaTranslateReason';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

const READY: MangaTranslateState = {
  volumeBusy: false,
  translating: false,
  engineReady: true,
  ocrScanning: false,
  hasOcrPage: true,
  atLastPage: false,
};

const ALL = [
  mangaTranslateRangeReason,
  mangaTranslateAheadReason,
  mangaTranslateTargetReason,
  mangaTranslatePageReason,
];

const CATALOGS = { en, ja, zh, ru } as const;
const UI_LANGS = ['en', 'ja', 'zh', 'ru'] as const;

const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x3000, 0x303f], [0x3040, 0x30ff], [0x3400, 0x4dbf],
  [0x4e00, 0x9fff], [0xf900, 0xfaff], [0xff00, 0xffef],
];
const isCjk = (c: string) => {
  const point = c.codePointAt(0) ?? 0;
  return CJK_RANGES.some(([lo, hi]) => point >= lo && point <= hi);
};
const weigh = (s: string) => [...s].reduce((n, c) => n + (isCjk(c) ? 2 : 1), 0);

describe('nothing is greyed out when nothing is wrong', () => {
  it('gives no reason for any of the four on a ready page', () => {
    expect(ALL.map((rule) => rule(READY))).toEqual([undefined, undefined, undefined, undefined]);
  });
});

describe('every disabled state names itself', () => {
  it('names the missing engine on the three rules that need it', () => {
    const noEngine = { ...READY, engineReady: false };
    expect(mangaTranslateRangeReason(noEngine)).toBe('manga.translate.reason.noEngine');
    expect(mangaTranslateAheadReason(noEngine)).toBe('manga.translate.reason.noEngine');
  });

  it('leaves the target language usable while the engine is missing', () => {
    // Deliberate: picking what to translate INTO is a setting, and keeping it live
    // means the choice is already made by the time the engine lands.
    expect(mangaTranslateTargetReason({ ...READY, engineReady: false })).toBeUndefined();
  });

  it('names the run in progress, and distinguishes the two runs', () => {
    expect(mangaTranslateRangeReason({ ...READY, volumeBusy: true }))
      .toBe('manga.translate.reason.busyVolume');
    expect(mangaTranslateRangeReason({ ...READY, translating: true }))
      .toBe('manga.translate.reason.busyTranslating');
  });

  it('names the last page on the only rule that has that condition', () => {
    expect(mangaTranslateAheadReason({ ...READY, atLastPage: true }))
      .toBe('manga.translate.reason.atLastPage');
    expect(mangaTranslateRangeReason({ ...READY, atLastPage: true })).toBeUndefined();
  });

  it('names the page conditions on the single-page button', () => {
    expect(mangaTranslatePageReason({ ...READY, hasOcrPage: false }))
      .toBe('manga.translate.reason.noOcrPage');
    expect(mangaTranslatePageReason({ ...READY, ocrScanning: true }))
      .toBe('manga.translate.reason.scanning');
  });

  it('does not grey the single-page button merely because the engine asset is absent', () => {
    // Its structural condition is THIS page's text, not the installer. A page that
    // already carries OCR text stays translatable.
    expect(mangaTranslatePageReason({ ...READY, engineReady: false })).toBeUndefined();
  });
});

describe('the priority, which is the whole reason this is a module', () => {
  it('names the missing engine rather than the run, when both hold', () => {
    // Waiting out a volume analysis does not install an engine. Leading with the run
    // sends the user away and back to a row that is still dead.
    expect(mangaTranslateRangeReason({ ...READY, engineReady: false, volumeBusy: true }))
      .toBe('manga.translate.reason.noEngine');
    expect(mangaTranslateAheadReason({
      ...READY, engineReady: false, translating: true, atLastPage: true,
    })).toBe('manga.translate.reason.noEngine');
  });

  it('names the last page ahead of a run, because a run does not add pages', () => {
    expect(mangaTranslateAheadReason({ ...READY, atLastPage: true, volumeBusy: true }))
      .toBe('manga.translate.reason.atLastPage');
  });

  it('names the page with no text ahead of the scan that is under way elsewhere', () => {
    expect(mangaTranslatePageReason({ ...READY, hasOcrPage: false, volumeBusy: true }))
      .toBe('manga.translate.reason.noOcrPage');
  });
});

describe('the reasons are sayable in every language', () => {
  it('has each key in all four catalogs', () => {
    for (const key of MANGA_TRANSLATE_REASON_KEYS) {
      for (const lang of UI_LANGS) {
        expect(
          (CATALOGS[lang] as Record<string, string>)[key],
          `${key} missing from ${lang}`,
        ).toBeTruthy();
      }
    }
  });

  it('renders a sentence long enough to count as an explanation', () => {
    for (const key of MANGA_TRANSLATE_REASON_KEYS) {
      for (const lang of UI_LANGS) {
        const text = (CATALOGS[lang] as Record<string, string>)[key];
        expect(weigh(text), `${lang} ${key} is too short to be an explanation`)
          .toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('has no key the rules cannot return, and no rule returning a key not listed', () => {
    const returned = new Set<string>();
    const states: MangaTranslateState[] = [
      { ...READY, engineReady: false },
      { ...READY, volumeBusy: true },
      { ...READY, translating: true },
      { ...READY, atLastPage: true },
      { ...READY, hasOcrPage: false },
      { ...READY, ocrScanning: true },
    ];
    for (const state of states) {
      for (const rule of ALL) {
        const key = rule(state);
        if (key) returned.add(key);
      }
    }
    expect([...returned].sort()).toEqual([...MANGA_TRANSLATE_REASON_KEYS].sort());
  });
});

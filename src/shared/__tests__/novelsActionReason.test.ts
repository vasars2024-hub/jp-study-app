/**
 * Rubric category 8 on the Novels workbench: the six inspector actions.
 *
 * The sweep found two of them grey with `aria-label: null` and `title: null` —
 * `Download/import EPUB` and `Jiten vocab mine`. All six are guarded here rather
 * than those two, because the other four are disabled by `busy`, and scoring the
 * row while nothing is running would be measuring the easy moment.
 *
 * The two priority cases are the point of the module and the last block below is
 * the guard on them: a structural condition the user can act on beats the
 * transient one they can only wait out.
 */
import { describe, expect, it } from 'vitest';
import {
  NOVELS_ACTION_REASON_KEYS,
  novelsAnalyzeEpubReason,
  novelsDownloadEpubReason,
  novelsImportFileReason,
  novelsJitenMineReason,
  novelsOpenSourceReason,
  novelsPlanReason,
  type NovelsActionState,
} from '../novelsActionReason';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

const READY: NovelsActionState = {
  busy: false,
  hasSelectedLink: true,
  hasDirectEpubUrl: true,
  hasJitenDeck: true,
  isPlanned: false,
};

const ALL = [
  novelsPlanReason,
  novelsOpenSourceReason,
  novelsImportFileReason,
  novelsDownloadEpubReason,
  novelsAnalyzeEpubReason,
  novelsJitenMineReason,
];

describe('nothing is greyed out when nothing is wrong', () => {
  it('gives no reason for any of the six on a fully ready selection', () => {
    expect(ALL.map((rule) => rule(READY))).toEqual([
      undefined, undefined, undefined, undefined, undefined, undefined,
    ]);
  });
});

describe('every disabled state names itself', () => {
  it('reports the running action on the four that only wait for it', () => {
    const busy = { ...READY, busy: true };
    expect(novelsPlanReason(busy)).toBe('novels.reason.busy');
    expect(novelsImportFileReason(busy)).toBe('novels.reason.busy');
    expect(novelsAnalyzeEpubReason(busy)).toBe('novels.reason.busy');
    expect(novelsDownloadEpubReason(busy)).toBe('novels.reason.busy');
  });

  it('reports a missing source selection on Open source', () => {
    expect(novelsOpenSourceReason({ ...READY, hasSelectedLink: false }))
      .toBe('novels.reason.noSourceLink');
  });

  it('reports a source with no direct EPUB', () => {
    expect(novelsDownloadEpubReason({ ...READY, hasDirectEpubUrl: false }))
      .toBe('novels.reason.noDirectEpub');
  });

  it('reports a title with no Jiten deck', () => {
    expect(novelsJitenMineReason({ ...READY, hasJitenDeck: false }))
      .toBe('novels.reason.noJitenDeck');
  });

  it('leaves the other rules alone when only a structural condition is missing', () => {
    // A missing deck must not silence Open source, and a missing source link must not
    // silence the miner: one dead button explaining another one's problem is the same
    // mis-report the mute-pair detector had to be repaired for.
    expect(novelsOpenSourceReason({ ...READY, hasJitenDeck: false })).toBeUndefined();
    expect(novelsJitenMineReason({ ...READY, hasSelectedLink: false })).toBeUndefined();
  });
});

describe('the priority, which is the whole reason this is a module', () => {
  it('names the missing EPUB source rather than the run, when both hold', () => {
    // Leading with `busy` would send the user to wait out a run and come back to a
    // button that is still dead. Waiting cannot supply a direct EPUB; changing the
    // selected source can.
    expect(novelsDownloadEpubReason({ ...READY, busy: true, hasDirectEpubUrl: false }))
      .toBe('novels.reason.noDirectEpub');
  });

  it('names the missing Jiten deck rather than the run, when both hold', () => {
    expect(novelsJitenMineReason({ ...READY, busy: true, hasJitenDeck: false }))
      .toBe('novels.reason.noJitenDeck');
  });
});

describe('the reasons are sayable in every language', () => {
  it('has each key in all four catalogs', () => {
    for (const key of NOVELS_ACTION_REASON_KEYS) {
      for (const [name, cat] of [['en', en], ['ja', ja], ['zh', zh], ['ru', ru]] as const) {
        expect((cat as Record<string, string>)[key], `${key} missing from ${name}`).toBeTruthy();
      }
    }
  });

  it('has no key the rules cannot return, and no rule returning a key not listed', () => {
    const returned = new Set<string>();
    const states: NovelsActionState[] = [
      { ...READY, busy: true },
      { ...READY, hasSelectedLink: false },
      { ...READY, hasDirectEpubUrl: false },
      { ...READY, hasJitenDeck: false },
    ];
    for (const state of states) {
      for (const rule of ALL) {
        const key = rule(state);
        if (key) returned.add(key);
      }
    }
    expect([...returned].sort()).toEqual([...NOVELS_ACTION_REASON_KEYS].sort());
  });
});

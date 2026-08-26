/**
 * Rubric category 8 on the visual-novel workspace: the nine greyed-out actions.
 *
 * The sweep on a POPULATED `@.visual-novel-panel` found five of them grey with
 * `aria-label: null` and `title: null` — `Launch`, `Add route`, `Add captured
 * line`, `Analyze …` and `Create study deck cards`. All nine are guarded here
 * rather than those five, because the other four only render once a route, a
 * scene list or the community section is on screen, and scoring the surface in
 * the one arrangement where they are absent would be measuring the easy moment.
 *
 * The two priority cases are the point of the module and the third block below
 * is the guard on them: a structural condition the user can act on beats the
 * transient one they can only wait out.
 *
 * The weighted-length block is not decoration. Correction 12 of the category-8
 * harness exists because a complete Japanese sentence runs 10–12 characters, so
 * an honest ja/zh reason scored as MUTE against a Latin-shaped constant. A
 * reason that would still be read as a mute pair is a failure here.
 */
import { describe, expect, it } from 'vitest';
import {
  VN_ACTION_REASON_KEYS,
  VN_ACTION_STATE_EMPTY,
  vnAddCapturedLineReason,
  vnAddEndingReason,
  vnAddRouteReason,
  vnAnalyzeReason,
  vnBundleReason,
  vnClearScenesReason,
  vnCreateCardsReason,
  vnCurrentSceneReason,
  vnLaunchReason,
  vnSaveReportReason,
  type VnActionState,
} from '../vnActionReason';
import { en } from '../i18n/catalogs/en';
import { ja } from '../i18n/catalogs/ja';
import { zh } from '../i18n/catalogs/zh';
import { ru } from '../i18n/catalogs/ru';

const READY: VnActionState = {
  busy: false,
  hasExecutablePath: true,
  hasRouteName: true,
  hasEndingName: true,
  hasCaptureText: true,
  scopedCaptureCount: 4,
  hasAnalysis: true,
  hasCurrentScene: true,
  selectedSceneCount: 2,
  hasReportDraft: true,
};

const ALL = [
  vnLaunchReason,
  vnAddRouteReason,
  vnAddEndingReason,
  vnAddCapturedLineReason,
  vnAnalyzeReason,
  vnCreateCardsReason,
  vnCurrentSceneReason,
  vnClearScenesReason,
  vnSaveReportReason,
  vnBundleReason,
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
  it('gives no reason for any of the ten on a fully ready workspace', () => {
    expect(ALL.map((rule) => rule(READY))).toEqual(ALL.map(() => undefined));
  });
});

describe('every disabled state names itself', () => {
  it('reports the missing executable on Launch', () => {
    expect(vnLaunchReason({ ...READY, hasExecutablePath: false }))
      .toBe('vnPanel.reason.noExecutable');
  });

  it('reports the empty draft field on each of the three add buttons', () => {
    expect(vnAddRouteReason({ ...READY, hasRouteName: false }))
      .toBe('vnPanel.reason.noRouteName');
    expect(vnAddEndingReason({ ...READY, hasEndingName: false }))
      .toBe('vnPanel.reason.noEndingName');
    expect(vnAddCapturedLineReason({ ...READY, hasCaptureText: false }))
      .toBe('vnPanel.reason.noCaptureText');
  });

  it('reports an empty mining scope, and separately an analysis that has not run', () => {
    expect(vnAnalyzeReason({ ...READY, scopedCaptureCount: 0 }))
      .toBe('vnPanel.reason.noScopedCaptures');
    expect(vnCreateCardsReason({ ...READY, hasAnalysis: false }))
      .toBe('vnPanel.reason.noAnalysis');
  });

  it('reports the scene conditions on the two scene buttons', () => {
    expect(vnCurrentSceneReason({ ...READY, hasCurrentScene: false }))
      .toBe('vnPanel.reason.noCurrentScene');
    expect(vnClearScenesReason({ ...READY, selectedSceneCount: 0 }))
      .toBe('vnPanel.reason.noSelectedScenes');
  });

  it('reports the running transfer on the bundle buttons', () => {
    expect(vnBundleReason({ ...READY, busy: true })).toBe('vnCommunity.reason.busy');
  });

  it('reports an empty report rather than nothing', () => {
    expect(vnSaveReportReason({ ...READY, hasReportDraft: false }))
      .toBe('vnCommunity.reason.emptyDraft');
  });

  it('leaves the other rules alone when only one structural condition is missing', () => {
    // One dead button explaining another one's problem is the same mis-report the
    // mute-pair detector had to be repaired for (harness correction 11).
    expect(vnLaunchReason({ ...READY, hasAnalysis: false })).toBeUndefined();
    expect(vnCreateCardsReason({ ...READY, hasExecutablePath: false })).toBeUndefined();
    expect(vnAddRouteReason({ ...READY, hasCaptureText: false })).toBeUndefined();
  });

  it('does not grey Launch, Add route or the scene buttons merely because a run is going', () => {
    // Only the two rules that read `busy` may react to it. A blanket `busy` guard here
    // would tell the user to wait for something that has no bearing on their button.
    const busy = { ...READY, busy: true };
    expect(vnLaunchReason(busy)).toBeUndefined();
    expect(vnAddRouteReason(busy)).toBeUndefined();
    expect(vnCurrentSceneReason(busy)).toBeUndefined();
    expect(vnClearScenesReason(busy)).toBeUndefined();
  });
});

describe('the priority, which is the whole reason this is a module', () => {
  it('names the empty scope rather than the run, when both hold', () => {
    // Leading with `busy` would send the user to wait out an analysis and come back
    // to a button that is still dead. Waiting cannot put captures in the scope.
    expect(vnAnalyzeReason({ ...READY, busy: true, scopedCaptureCount: 0 }))
      .toBe('vnPanel.reason.noScopedCaptures');
  });

  it('names the empty report rather than the run, when both hold', () => {
    expect(vnSaveReportReason({ ...READY, busy: true, hasReportDraft: false }))
      .toBe('vnCommunity.reason.emptyDraft');
  });
});

describe('the neutral base state claims nothing it cannot see', () => {
  it('blocks every rule that reads a capability, so a partial call site cannot enable one', () => {
    for (const rule of ALL) {
      // `vnBundleReason` is the one honest exception and is asserted separately below:
      // its only condition is `busy`, and "no run in progress" is the ENABLED state.
      if (rule === vnBundleReason) continue;
      expect(rule(VN_ACTION_STATE_EMPTY), `${rule.name} did not block on the empty state`)
        .toBeTruthy();
    }
  });

  it('leaves the bundle buttons enabled on it, because idle is not a missing capability', () => {
    expect(vnBundleReason(VN_ACTION_STATE_EMPTY)).toBeUndefined();
    expect(vnBundleReason({ ...VN_ACTION_STATE_EMPTY, busy: true }))
      .toBe('vnCommunity.reason.busy');
  });

  it('has exactly the keys of the state interface, so a new flag cannot be forgotten', () => {
    expect(Object.keys(VN_ACTION_STATE_EMPTY).sort()).toEqual(Object.keys(READY).sort());
  });
});

describe('the reasons are sayable in every language', () => {
  it('has each key in all four catalogs', () => {
    for (const key of VN_ACTION_REASON_KEYS) {
      for (const lang of UI_LANGS) {
        expect(
          (CATALOGS[lang] as Record<string, string>)[key],
          `${key} missing from ${lang}`,
        ).toBeTruthy();
      }
    }
  });

  it('renders a sentence long enough to count as an explanation', () => {
    for (const key of VN_ACTION_REASON_KEYS) {
      for (const lang of UI_LANGS) {
        const text = (CATALOGS[lang] as Record<string, string>)[key];
        expect(weigh(text), `${lang} ${key} is too short to be an explanation`)
          .toBeGreaterThanOrEqual(12);
      }
    }
  });

  it('has no key the rules cannot return, and no rule returning a key not listed', () => {
    const returned = new Set<string>();
    const states: VnActionState[] = [
      { ...READY, busy: true },
      { ...READY, hasExecutablePath: false },
      { ...READY, hasRouteName: false },
      { ...READY, hasEndingName: false },
      { ...READY, hasCaptureText: false },
      { ...READY, scopedCaptureCount: 0 },
      { ...READY, hasAnalysis: false },
      { ...READY, hasCurrentScene: false },
      { ...READY, selectedSceneCount: 0 },
      { ...READY, hasReportDraft: false },
    ];
    for (const state of states) {
      for (const rule of ALL) {
        const key = rule(state);
        if (key) returned.add(key);
      }
    }
    expect([...returned].sort()).toEqual([...VN_ACTION_REASON_KEYS].sort());
  });
});

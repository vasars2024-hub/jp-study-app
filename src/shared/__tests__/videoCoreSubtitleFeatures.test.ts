/**
 * The subtitle features added after the 2026-09-23 subtitle audit: position, colours,
 * second-line size, appearance reset, per-file delay, and which track is the study line.
 * Every rule here is the one the overlay and the bar call — none is re-derived in a component.
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeSubtitleColor,
  normalizeVideoCoreStudyPreferences,
  normalizeVideoCoreSubtitleDelays,
  normalizeVideoCoreTrackChoices,
  nudgeSubtitlePosition,
  pickStudyPrimaryTrack,
  resetSubtitleAppearance,
  resolveSecondaryLine,
  resolveVideoCoreSubtitleDelay,
  resolveVideoCoreTrackChoice,
  SECONDARY_SUB_SCALE_DEFAULT,
  secondaryLineUnavailable,
  seedPreferredSubtitleLanguage,
  studyTrackLanguage,
  SUBTITLE_APPEARANCE_KEYS,
  SUBTITLE_POSITION_MAX,
  subtitleAppearanceIsDefault,
  subtitleOutlineShadow,
  subtitlePlacementStyle,
  upsertVideoCoreSubtitleDelay,
  upsertVideoCoreTrackChoice,
  VIDEO_CORE_SUB_DELAY_LIMIT,
  videoCoreResumeKey,
  videoCoreTrackChoiceKeys,
} from '../videoCoreStudy';

describe('new subtitle preferences — defaults and normalisation', () => {
  it('defaults keep the look every existing user already has', () => {
    const prefs = normalizeVideoCoreStudyPreferences(null);
    expect(prefs.subtitlePosition).toBe(0);
    expect(prefs.subtitleAtTop).toBe(false);
    expect(prefs.subtitleColor).toBe('');
    expect(prefs.subtitleOutlineColor).toBe('');
    expect(prefs.secondarySubScale).toBe(SECONDARY_SUB_SCALE_DEFAULT);
    expect(prefs.secondarySubScale).toBe(80);
    expect(prefs.secondarySubColor).toBe('');
  });

  it('clamps and rounds the position and second-line size', () => {
    const prefs = normalizeVideoCoreStudyPreferences({
      subtitlePosition: 99,
      secondarySubScale: 3,
    });
    expect(prefs.subtitlePosition).toBe(SUBTITLE_POSITION_MAX);
    expect(prefs.secondarySubScale).toBe(50);
    expect(normalizeVideoCoreStudyPreferences({ subtitlePosition: -4 }).subtitlePosition).toBe(0);
    expect(normalizeVideoCoreStudyPreferences({ subtitlePosition: 12.6 }).subtitlePosition).toBe(13);
    expect(normalizeVideoCoreStudyPreferences({ secondarySubScale: 500 }).secondarySubScale).toBe(120);
    expect(normalizeVideoCoreStudyPreferences({ secondarySubScale: Number.NaN }).secondarySubScale).toBe(80);
    expect(normalizeVideoCoreStudyPreferences({ subtitleAtTop: 'yes' }).subtitleAtTop).toBe(false);
  });

  it('accepts only #rrggbb colours, lower-cased; anything else is the default', () => {
    expect(normalizeSubtitleColor('#FFE45C')).toBe('#ffe45c');
    expect(normalizeSubtitleColor(' #9fd8ff ')).toBe('#9fd8ff');
    for (const bad of ['red', 'rgb(1,2,3)', '#fff', '#12345g', 42, null, undefined, 'url(x)']) {
      expect(normalizeSubtitleColor(bad)).toBe('');
    }
    const prefs = normalizeVideoCoreStudyPreferences({
      subtitleColor: 'javascript:alert(1)',
      subtitleOutlineColor: '#1C2A4A',
      secondarySubColor: '#FFFFFF',
    });
    expect(prefs.subtitleColor).toBe('');
    expect(prefs.subtitleOutlineColor).toBe('#1c2a4a');
    expect(prefs.secondarySubColor).toBe('#ffffff');
  });
});

describe('Reset subtitle appearance', () => {
  it('restores every appearance key and keeps every study setting', () => {
    const changed = normalizeVideoCoreStudyPreferences({
      subtitleFontSize: 40,
      subtitleBgOpacity: 90,
      subtitleFontFamily: 'mincho',
      subtitleFontWeight: 800,
      subtitleOutline: false,
      subtitlePosition: 25,
      subtitleAtTop: true,
      subtitleColor: '#ffe45c',
      subtitleOutlineColor: '#1c2a4a',
      secondarySubScale: 110,
      secondarySubColor: '#9fd8ff',
      furigana: true,
      dualSubs: false,
      secondarySubLang: 'ru',
      cueTimingReadout: true,
      playbackRate: 0.75,
    });
    expect(subtitleAppearanceIsDefault(changed)).toBe(false);
    const reset = resetSubtitleAppearance(changed);
    const defaults = normalizeVideoCoreStudyPreferences(null);
    for (const key of SUBTITLE_APPEARANCE_KEYS) expect(reset[key]).toEqual(defaults[key]);
    expect(subtitleAppearanceIsDefault(reset)).toBe(true);
    // Not appearance: what the line says and what the study tools do stay as the user left them.
    expect(reset.furigana).toBe(true);
    expect(reset.dualSubs).toBe(false);
    expect(reset.secondarySubLang).toBe('ru');
    expect(reset.cueTimingReadout).toBe(true);
    expect(reset.playbackRate).toBe(0.75);
  });
});

describe('Subtitle position', () => {
  it('moves in steps and turns the top of the ladder into "Top of screen"', () => {
    let at = { subtitlePosition: 0, subtitleAtTop: false };
    at = nudgeSubtitlePosition(at, -1);
    expect(at).toEqual({ subtitlePosition: 0, subtitleAtTop: false });
    const seen: string[] = [];
    for (let i = 0; i < 12; i += 1) {
      at = nudgeSubtitlePosition(at, 1);
      seen.push(at.subtitleAtTop ? 'top' : String(at.subtitlePosition));
    }
    expect(seen.slice(0, 9)).toEqual(['5', '10', '15', '20', '25', '30', '35', '40', 'top']);
    expect(seen.slice(9)).toEqual(['top', 'top', 'top']);
    at = nudgeSubtitlePosition(at, -1);
    expect(at).toEqual({ subtitlePosition: SUBTITLE_POSITION_MAX, subtitleAtTop: false });
  });

  it('only ever ADDS a lift fraction; the CSS floor is not part of the value', () => {
    expect(subtitlePlacementStyle({ subtitlePosition: 0, subtitleAtTop: false }))
      .toEqual({ '--study-cue-lift': '0' });
    expect(subtitlePlacementStyle({ subtitlePosition: 20, subtitleAtTop: false }))
      .toEqual({ '--study-cue-lift': '0.2' });
    // A hand-edited value can never drive the line below its floor or past the maximum.
    expect(subtitlePlacementStyle({ subtitlePosition: -30, subtitleAtTop: false }))
      .toEqual({ '--study-cue-lift': '0' });
    expect(subtitlePlacementStyle({ subtitlePosition: 500, subtitleAtTop: false }))
      .toEqual({ '--study-cue-lift': String(SUBTITLE_POSITION_MAX / 100) });
  });
});

describe('Outline colour', () => {
  it('keeps the stylesheet outline geometry and only changes the hue', () => {
    const shadow = subtitleOutlineShadow('#1c2a4a');
    expect(shadow.split(', ')).toHaveLength(5);
    expect(shadow).toContain('rgb(28 42 74 / 0.95)');
    expect(shadow).toContain('-2px -2px 2px');
    expect(subtitleOutlineShadow('#1c2a4a', true)).toContain('-1px -1px 2px');
    expect(subtitleOutlineShadow('not-a-colour')).toContain('rgb(0 0 0 / 0.95)');
  });
});

describe('Per-file subtitle delay', () => {
  const fileA = videoCoreResumeKey({ localFilePath: 'D:\\Anime\\Show - 01.mkv' });
  const fileB = videoCoreResumeKey({ localFilePath: 'D:\\Anime\\Show - 02.mkv' });

  it('stores, reads back and replaces a file\'s delay without touching another file', () => {
    let store = upsertVideoCoreSubtitleDelay([], fileA, 0.2, 1);
    store = upsertVideoCoreSubtitleDelay(store, fileB, -1.5, 2);
    store = upsertVideoCoreSubtitleDelay(store, fileA, 0.4, 3);
    expect(resolveVideoCoreSubtitleDelay(store, fileA)).toBe(0.4);
    expect(resolveVideoCoreSubtitleDelay(store, fileB)).toBe(-1.5);
    expect(resolveVideoCoreSubtitleDelay(store, 'file:elsewhere')).toBe(0);
    expect(resolveVideoCoreSubtitleDelay(store, '')).toBe(0);
    expect(store).toHaveLength(2);
  });

  it('a reset (0 s) removes the entry instead of storing a zero', () => {
    let store = upsertVideoCoreSubtitleDelay([], fileA, 0.2, 1);
    store = upsertVideoCoreSubtitleDelay(store, fileA, 0, 2);
    expect(store).toEqual([]);
  });

  it('normalises hostile storage and caps the list', () => {
    expect(normalizeVideoCoreSubtitleDelays('nope')).toEqual([]);
    expect(normalizeVideoCoreSubtitleDelays([
      { key: fileA, delaySec: 99, updatedAt: 1 },
      { key: '', delaySec: 1, updatedAt: 1 },
      { key: fileB, delaySec: 'x', updatedAt: 1 },
    ])).toEqual([{ key: fileA, delaySec: 10, updatedAt: 1 }]);
    let store: ReturnType<typeof upsertVideoCoreSubtitleDelay> = [];
    for (let i = 0; i < VIDEO_CORE_SUB_DELAY_LIMIT + 20; i += 1) {
      store = upsertVideoCoreSubtitleDelay(store, `file:${i}`, 0.1, i);
    }
    expect(store).toHaveLength(VIDEO_CORE_SUB_DELAY_LIMIT);
    expect(resolveVideoCoreSubtitleDelay(store, 'file:0')).toBe(0);
    expect(resolveVideoCoreSubtitleDelay(store, `file:${VIDEO_CORE_SUB_DELAY_LIMIT + 19}`)).toBe(0.1);
  });
});

describe('Which track is the study line', () => {
  // The audit's two failing shapes: sidecars (labels only) and a muxed MKV (language fields).
  const SIDECARS = [
    { number: 0, label: '[Test] Yuru Camp - 04.en', default: false },
    { number: 1, label: '[Test] Yuru Camp - 04.ja', default: false },
  ];
  const MUXED = [
    { number: 3, language: 'jpn', label: 'Japanese', default: true },
    { number: 4, language: 'eng', label: 'English', default: true },
  ];

  it('reads a track\'s language from its field, or from a sidecar file name', () => {
    expect(studyTrackLanguage({ number: 1, label: '[Test] Yuru Camp - 04.ja' })).toBe('ja');
    expect(studyTrackLanguage({ number: 1, label: 'Dual Test - 01.en.srt' })).toBe('en');
    expect(studyTrackLanguage({ number: 1, label: 'Show.S01E02.jpn.ass' })).toBe('ja');
    expect(studyTrackLanguage({ number: 1, label: '日本語' })).toBe('ja');
    expect(studyTrackLanguage({ number: 1, language: 'jpn' })).toBe('ja');
    expect(studyTrackLanguage({ number: 1, language: 'ja-JP' })).toBe('ja');
    expect(studyTrackLanguage({ number: 1, language: 'und', label: 'Japanese' })).toBe('ja');
    expect(studyTrackLanguage({ number: 1, label: 'Yuru Camp - 04' })).toBe('');
    // A word inside a title is not a language tag.
    expect(studyTrackLanguage({ number: 1, label: 'Enjoy Camp.en' })).toBe('en');
  });

  it('picks the Japanese track when Japanese and English both exist (audit 6a, 6g)', () => {
    expect(pickStudyPrimaryTrack(SIDECARS, 'ja', null)).toBe(1);
    expect(pickStudyPrimaryTrack(MUXED, 'ja', null)).toBe(3);
    expect(pickStudyPrimaryTrack(MUXED, 'zh', null)).toBeUndefined();
    expect(pickStudyPrimaryTrack([], 'ja', null)).toBeUndefined();
  });

  it('prefers a full track over a forced (signs) one, and the default among equals', () => {
    const tracks = [
      { number: 1, language: 'jpn', label: 'Signs', forced: true },
      { number: 2, language: 'jpn', label: 'Full' },
      { number: 3, language: 'jpn', label: 'Full (CC)', default: true },
    ];
    expect(pickStudyPrimaryTrack(tracks, 'ja', null)).toBe(3);
  });

  it('keeps a study-language track the user is already on (a Whisper track, a download)', () => {
    const tracks = [...MUXED, { number: 5, language: 'ja', label: 'Whisper' }];
    expect(pickStudyPrimaryTrack(tracks, 'ja', null, 5)).toBeUndefined();
    expect(pickStudyPrimaryTrack(tracks, 'ja', null, 4)).toBe(3);
  });

  it('a remembered choice wins — by label, then by language — and Off means off', () => {
    expect(pickStudyPrimaryTrack(MUXED, 'ja', { lang: 'en', label: 'English', off: false })).toBe(4);
    // Next episode: labels differ but the language is known.
    expect(pickStudyPrimaryTrack(SIDECARS, 'ja', { lang: 'en', label: 'Other - 03.en', off: false })).toBe(0);
    expect(pickStudyPrimaryTrack(MUXED, 'ja', { lang: '', label: '', off: true })).toBeNull();
    // A remembered language this file does not have falls back to the study language.
    expect(pickStudyPrimaryTrack(MUXED, 'ja', { lang: 'ru', label: 'Russian', off: false })).toBe(3);
  });

  it('remembers per file and per series, the file winning', () => {
    const ep3 = { localFilePath: 'D:\\Anime\\Yuru Camp\\03.mkv', mediaId: 7, episodeNumber: 3 };
    const ep4 = { localFilePath: 'D:\\Anime\\Yuru Camp\\04.mkv', mediaId: 7, episodeNumber: 4 };
    expect(videoCoreTrackChoiceKeys(ep3)).toEqual(['file:d:/anime/yuru camp/03.mkv', 'series:media:7']);
    expect(videoCoreTrackChoiceKeys({ localFilePath: 'E:\\Drama\\Kitchen - 01.mkv' }))
      .toEqual(['file:e:/drama/kitchen - 01.mkv', 'series:dir:e:/drama']);
    let store = upsertVideoCoreTrackChoice([], videoCoreTrackChoiceKeys(ep3), { lang: 'en', label: 'English', off: false }, 1);
    expect(resolveVideoCoreTrackChoice(store, videoCoreTrackChoiceKeys(ep4))?.lang).toBe('en');
    store = upsertVideoCoreTrackChoice(store, [videoCoreTrackChoiceKeys(ep4)[0]], { lang: 'ja', label: 'Japanese', off: false }, 2);
    expect(resolveVideoCoreTrackChoice(store, videoCoreTrackChoiceKeys(ep4))?.lang).toBe('ja');
    expect(resolveVideoCoreTrackChoice(store, videoCoreTrackChoiceKeys(ep3))?.lang).toBe('en');
    expect(normalizeVideoCoreTrackChoices([{ key: 'x', lang: 'jpn', label: 7, updatedAt: 1 }]))
      .toEqual([{ key: 'x', lang: 'ja', label: '', off: false, updatedAt: 1 }]);
  });

  it('seeds VideoCore\'s preferred language with the study language, once', () => {
    expect(seedPreferredSubtitleLanguage(undefined, 'ja', null)).toBe('ja,jpn,japanese,en,eng,english');
    expect(seedPreferredSubtitleLanguage('en,eng,english', 'ja', null)).toBe('ja,jpn,japanese,en,eng,english');
    expect(seedPreferredSubtitleLanguage('jpn,en', 'ja', null)).toBe('ja,jpn,japanese,en');
    expect(seedPreferredSubtitleLanguage('none', 'ja', null)).toBe('ja,jpn,japanese');
    expect(seedPreferredSubtitleLanguage('en', 'zh', null)).toBe('zh,chi,zho,chinese,en');
    // Already seeded for this language: the user's later edit is left alone.
    expect(seedPreferredSubtitleLanguage('en', 'ja', 'ja')).toBeNull();
    expect(seedPreferredSubtitleLanguage('en', 'ja', 'zh')).toBe('ja,jpn,japanese,en');
  });
});

describe('The "no second line" hint', () => {
  const base = {
    dualSubs: true,
    hasCues: true,
    hasSecondaryTrack: false,
    secondaryText: '',
    translatorFailed: true,
    secondaryLang: 'en',
    studyLang: 'ja',
  };

  it('shows only when dual is on, the file has lines, and nothing can supply a second one', () => {
    expect(secondaryLineUnavailable(base)).toBe(true);
    expect(secondaryLineUnavailable({ ...base, dualSubs: false })).toBe(false);
    expect(secondaryLineUnavailable({ ...base, hasCues: false })).toBe(false);
    expect(secondaryLineUnavailable({ ...base, hasSecondaryTrack: true })).toBe(false);
    expect(secondaryLineUnavailable({ ...base, secondaryText: 'Good morning.' })).toBe(false);
    expect(secondaryLineUnavailable({ ...base, translatorFailed: false })).toBe(false);
    // Second language = study language: the translator is never asked, nothing can come.
    expect(secondaryLineUnavailable({ ...base, translatorFailed: false, secondaryLang: 'ja' })).toBe(true);
  });
});

describe('What the second line shows when a track can supply it', () => {
  const base = {
    hasSecondaryTrack: true,
    trackLang: 'en',
    trackText: 'Good morning.',
    translation: '',
    translatorFailed: false,
    secondaryLang: 'en',
  };

  it('shows the track when it is in the chosen language, without asking the translator', () => {
    expect(resolveSecondaryLine(base)).toEqual({ text: 'Good morning.', translate: false, fallback: false });
    // A label the detector cannot read is still the track the user was offered.
    expect(resolveSecondaryLine({ ...base, trackLang: '', secondaryLang: 'ru' }))
      .toEqual({ text: 'Good morning.', translate: false, fallback: false });
  });

  it('with no track at all, the translation is the only source', () => {
    expect(resolveSecondaryLine({ ...base, hasSecondaryTrack: false, trackLang: '', trackText: '', translation: 'Доброе утро.' }))
      .toEqual({ text: 'Доброе утро.', translate: true, fallback: false });
  });

  it('Russian chosen on an English-only release: translated, not the English line as if ignored', () => {
    const ru = { ...base, secondaryLang: 'ru' };
    // While the translator works: nothing, rather than English that turns Russian later.
    expect(resolveSecondaryLine(ru)).toEqual({ text: '', translate: true, fallback: false });
    expect(resolveSecondaryLine({ ...ru, translation: 'Доброе утро.' }))
      .toEqual({ text: 'Доброе утро.', translate: true, fallback: false });
  });

  it('Russian chosen, translator unavailable: the English line after all, flagged as a stand-in', () => {
    expect(resolveSecondaryLine({ ...base, secondaryLang: 'ru', translatorFailed: true }))
      .toEqual({ text: 'Good morning.', translate: true, fallback: true });
  });
});

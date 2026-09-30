export interface VideoCoreStudyCue {
  index: number;
  trackNumber: number;
  text: string;
  startMs: number;
  endMs: number;
}

export interface VideoCoreStudyLoopState {
  lineLoop: boolean;
  abLoop: boolean;
  abStartSec: number | null;
  abEndSec: number | null;
}

/**
 * Typeface choices for the cue line, as CSS stacks rather than one family each.
 *
 * Every stack ends in a generic so a missing font degrades to something readable instead
 * of to the browser default, and each names a Japanese-capable face first: a stack that
 * falls through to a Latin-only font renders study content as tofu, which is worse than
 * ignoring the setting. `default` is the empty string on purpose — it means "inherit the
 * stylesheet" (`--subtitle-font-stack`, a Yu Gothic UI stack) rather than "impose a family".
 *
 * `default` is offered as "Gothic", and the separate `gothic` choice is gone: it named the
 * same Yu Gothic UI face, so the two options painted identical lines (subtitle audit 2).
 * An "app font" that followed Settings > Appearance would not have differed either — every
 * font offered there (Segoe, System, JP first) draws kana and kanji from Yu Gothic UI, and
 * the cue deliberately does not inherit the theme's `--font-body`, which in the Aero themes
 * is a Tahoma stack with no Japanese face at all. A stored `gothic` normalizes to `default`,
 * the same face, so nobody's choice changes on screen.
 */
export const SUBTITLE_FONT_STACKS = {
  default: '',
  mincho: '"Yu Mincho", "MS Mincho", "Noto Serif JP", serif',
  universal: '"BIZ UDPGothic", "BIZ UDGothic", "Noto Sans JP", sans-serif',
} as const;

export type SubtitleFontChoice = keyof typeof SUBTITLE_FONT_STACKS;

/**
 * The same three choices for the other study languages. Han characters are
 * shared by Japanese and Chinese but drawn differently, so a Chinese line in
 * Yu Mincho gets Japanese glyph shapes: Chinese takes Song/Ming and YaHei /
 * JhengHei by script. Russian takes Cyrillic serif and sans faces.
 */
const SUBTITLE_FONT_STACKS_BY_LANG: Readonly<Record<string, Readonly<Record<SubtitleFontChoice, string>>>> = {
  'zh-Hans': {
    default: '',
    mincho: '"SimSun", "Songti SC", "Noto Serif SC", "Source Han Serif SC", serif',
    universal: '"Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans SC", "PingFang SC", sans-serif',
  },
  'zh-Hant': {
    default: '',
    mincho: '"PMingLiU", "MingLiU", "Songti TC", "Noto Serif TC", "Source Han Serif TC", serif',
    universal: '"Microsoft JhengHei UI", "Microsoft JhengHei", "Noto Sans TC", "PingFang TC", sans-serif',
  },
  ru: {
    default: '',
    mincho: '"Georgia", "Times New Roman", "Noto Serif", serif',
    universal: '"Verdana", "Segoe UI", "Noto Sans", sans-serif',
  },
};

/** The user's subtitle typeface for a line in `langTag` (`ja`, `zh-Hans`, `zh-Hant`, `ru`). '' = the stylesheet's. */
export function subtitleFontStackFor(choice: SubtitleFontChoice, langTag = 'ja'): string {
  const byLang = SUBTITLE_FONT_STACKS_BY_LANG[langTag]
    ?? (langTag.startsWith('zh') ? SUBTITLE_FONT_STACKS_BY_LANG['zh-Hans'] : undefined);
  return byLang?.[choice] ?? SUBTITLE_FONT_STACKS[choice] ?? '';
}

/**
 * Offered languages for the second subtitle line.
 *
 * A closed list rather than free text because this code is also what the mined card's
 * translation is generated in — a typo would silently produce a card in no language at
 * all. The translator itself handles arbitrary pairs, so extending this is a one-line
 * change when a language is actually wanted.
 */
export const SECONDARY_SUB_LANGS = ['en', 'ru', 'zh', 'ja', 'ko', 'es', 'fr', 'de'] as const;

/**
 * Each offered language written in itself.
 *
 * Deliberately not routed through the i18n catalogs, following what
 * `settings.analysis.explainIn.*` already does: a language's own name does not change
 * with the app's UI language, so four catalog copies of `Русский` would be four chances
 * for one of them to drift or go missing and fail the catalog hygiene gate for nothing.
 */
export const SECONDARY_SUB_LANG_LABELS: Readonly<Record<string, string>> = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

export const SUBTITLE_FONT_CHOICES = Object.keys(
  SUBTITLE_FONT_STACKS,
) as SubtitleFontChoice[];

/**
 * The cue colours offered as one-click swatches. The picker beside them takes any other
 * `#rrggbb`; the empty string means "the stylesheet's own off-white", which is what
 * every user who never touches the control keeps.
 *
 * White, a subtitle yellow and a light blue are the three a subtitle user actually asks
 * for: yellow survives a bright snow frame that white vanishes into, and light blue is
 * the usual way to tell a second speaker or a second language apart.
 */
export const SUBTITLE_COLOR_PRESETS = ['#ffffff', '#ffe45c', '#9fd8ff'] as const;

/** Outline colours that read as an outline, not as a second text colour. */
export const SUBTITLE_OUTLINE_COLOR_PRESETS = ['#000000', '#1c2a4a', '#3a2a00'] as const;

/**
 * How far above its floor the subtitle band can be lifted, as a percentage of the picture
 * that is still free above that floor. Past 40 % the line sits in the middle of the frame,
 * where "Top of screen" is the better answer anyway.
 */
export const SUBTITLE_POSITION_MAX = 40;
/** One press of the position shortcut. */
export const SUBTITLE_POSITION_STEP = 5;

/** Second-line size as a percentage of the primary line, and its bounds. */
export const SECONDARY_SUB_SCALE_DEFAULT = 80;
export const SECONDARY_SUB_SCALE_MIN = 50;
export const SECONDARY_SUB_SCALE_MAX = 120;

/**
 * A stored colour, or `''` for "use the stylesheet".
 *
 * Only `#rrggbb` is accepted, lower-cased. `<input type="color">` produces exactly that, so
 * the one real writer can never be refused, and a hand-edited `red` or `rgb(…)` in the stored
 * JSON falls back to the default instead of reaching an inline style unchecked.
 */
export function normalizeSubtitleColor(value: unknown): string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
    ? value.trim().toLowerCase()
    : '';
}

/**
 * Narrow a raw `<select>` value to a font choice, falling back the same way the
 * preference normalizer does.
 *
 * A cast at the call site would be the shorter route and would also be a lie: the value
 * arrives as `string` from the DOM, and the one place that is allowed to decide what an
 * unrecognized string means is this rule, not each caller's assumption that the option
 * list can never drift from the type.
 */
export function toSubtitleFontChoice(value: string): SubtitleFontChoice {
  return (value in SUBTITLE_FONT_STACKS ? value : 'default') as SubtitleFontChoice;
}

export type VideoFitMode = 'contain' | 'cover' | 'fill';
export const VIDEO_FIT_MODES: readonly VideoFitMode[] = ['contain', 'cover', 'fill'];

/** The next mode for the cycle key: Fit → Fill → Stretch → Fit. */
export function nextVideoFit(current: VideoFitMode): VideoFitMode {
  const at = VIDEO_FIT_MODES.indexOf(current);
  return VIDEO_FIT_MODES[(at + 1) % VIDEO_FIT_MODES.length] ?? 'contain';
}

export interface VideoCoreStudyPreferences {
  playbackRate: number;
  autoPause: boolean;
  loopLine: boolean;
  furigana: boolean;
  primarySubs: boolean;
  dualSubs: boolean;
  /** Every subtitle line hidden at once (the V key). Separate from `primarySubs`, so
   *  showing them again restores exactly the lines that were on before. */
  subtitlesHidden: boolean;
  /** How the picture fills the player: the whole frame with bars (`contain`), the whole
   *  player with the edges trimmed (`cover`), or stretched to the player (`fill`). */
  videoFit: VideoFitMode;
  dictationMode: boolean;
  shadowingMode: boolean;
  /**
   * Even out loudness with a compressor on the video's audio
   * (`media/volumeNormalization.ts`). Set from the Media Center's toggle, which
   * shares this key.
   */
  volumeNormalization: boolean;
  subtitleFontSize: number;
  /** Cue background opacity, 0 (fully transparent) to 90. */
  subtitleBgOpacity: number;
  /** Typeface for the cue line — a key into `SUBTITLE_FONT_STACKS`. */
  subtitleFontFamily: SubtitleFontChoice;
  /** Cue weight, 400–800. Heavier reads better over a bright frame than a bigger box. */
  subtitleFontWeight: number;
  /** Paint the dark outline behind the cue. Off suits a release that is already letterboxed. */
  subtitleOutline: boolean;
  /**
   * Show the `cue N · track N · start–end ms` readout under the line.
   *
   * Off by default. It is diagnostic text sitting in the middle of the picture, and the
   * reason to keep it at all is that it is the only on-screen evidence of which cue the
   * mining panel is about to capture when a timing question comes up.
   */
  cueTimingReadout: boolean;
  /**
   * Language for the second subtitle line, as a BCP-47-ish code.
   *
   * Read by two surfaces on purpose. It picks the secondary track when the release ships
   * one in that language, falls back to translating the primary cue when it does not, and
   * is the language the mined card's sentence translation is written in — so the line the
   * user chose to read along with is the line that ends up on the card.
   */
  secondarySubLang: string;
  /** Colour-code the active cue by grammar/vocab/particle and allow click-to-explain. */
  grammarHighlight: boolean;
  /** Mark words the learner does not know yet on the subtitle line. On by default. */
  knownHighlight: boolean;
  /** Tag each subtitle line with its level (JLPT / HSK / CEFR). On by default. */
  lineLevel: boolean;
  /** Show the whole subtitle track as a seekable transcript rail. */
  transcriptPanel: boolean;
  /** Seconds the rewind / fast-forward shortcuts move, 1–60. */
  seekStepSec: number;
  /**
   * Lift of the subtitle band above its floor, 0–`SUBTITLE_POSITION_MAX` percent of the
   * picture still free above that floor. The floor itself (study bar, transport, bottom
   * dock — `--study-cue-bottom`) is never negotiable: 0 means "as low as it may go".
   */
  subtitlePosition: number;
  /** Put the subtitle band at the top of the picture instead. Overrides the lift. */
  subtitleAtTop: boolean;
  /** Cue text colour, `#rrggbb`, or `''` for the stylesheet's off-white. */
  subtitleColor: string;
  /** Outline colour, `#rrggbb`, or `''` for black. Ignored while the outline is off. */
  subtitleOutlineColor: string;
  /** Second line size as a percentage of the primary line, 50–120. */
  secondarySubScale: number;
  /** Second line colour, `#rrggbb`, or `''` for the stylesheet's pale blue-white. */
  secondarySubColor: string;
  [key: string]: unknown;
}

export interface VideoCoreDictationEvaluation {
  exact: boolean;
  score: number;
  answer: string;
  expected: string;
}

export interface VideoCoreWhisperCue {
  start: number;
  end: number;
  text: string;
}

export interface VideoCoreWhisperEvent {
  trackNumber: number;
  text: string;
  startTime: number;
  duration: number;
  codecID: 'S_TEXT/ASS';
  extraData: Record<string, string>;
}

export interface VideoCoreResumeSource {
  playbackId?: string;
  localFilePath?: string;
  streamPath?: string;
  mediaId?: number;
  episodeNumber?: number;
}

export interface VideoCoreResumePosition {
  key: string;
  positionSec: number;
  updatedAt: number;
}

export interface VideoCoreCueReplaySignal {
  cueKey: string;
  replayCount: number;
  firstReplayAt: number;
  lastReplayAt: number;
  dismissed: boolean;
}

export type VideoCoreComprehensionEvent = 'lookup' | 'rewind' | 'pause';

export interface VideoCoreComprehensionSignal {
  trackNumber: number;
  anchorCueIndex: number;
  anchorCueKey: string;
  lookupCount: number;
  rewindCount: number;
  pauseCount: number;
  firstEventAt: number;
  lastEventAt: number;
  dismissed: boolean;
}

export interface VideoCoreRescueScene {
  startSec: number;
  endSec: number;
  cueCount: number;
  firstCueIndex: number;
  lastCueIndex: number;
}

/** One explicit ±0.1s activation: where playback was, and what the delay became. */
export interface VideoCoreTimingSample {
  positionSec: number;
  delaySec: number;
  at: number;
}

export interface VideoCoreTimingSignal {
  trackNumber: number;
  changeCount: number;
  firstChangeAt: number;
  lastChangeAt: number;
  samples: VideoCoreTimingSample[];
  dismissed: boolean;
}

export interface VideoCoreTimingDrift {
  /** Signed subtitle-delay change, in milliseconds, per minute of playback. */
  msPerMinute: number;
  /** The user's newest manual correction — the point the projection trusts. */
  anchorPositionSec: number;
  anchorDelaySec: number;
  spanSec: number;
  sampleCount: number;
  netDelaySec: number;
}

export const PLAYER_PREFERENCES_STORAGE_KEY = 'jp-media-player-preferences-v1';
export const VIDEO_CORE_RESUME_STORAGE_KEY = 'jp-video-core-resume-v1';
export const VIDEO_CORE_RESUME_LIMIT = 100;
export const VIDEO_CORE_SHADOWING_REPLAY_THRESHOLD = 3;
export const VIDEO_CORE_SHADOWING_REPLAY_WINDOW_MS = 10 * 60_000;
export const VIDEO_CORE_COMPREHENSION_WINDOW_MS = 2 * 60_000;
export const VIDEO_CORE_COMPREHENSION_SCENE_RADIUS = 2;
export const VIDEO_CORE_COMPREHENSION_LOOKUP_THRESHOLD = 2;
export const VIDEO_CORE_COMPREHENSION_REWIND_THRESHOLD = 2;
export const VIDEO_CORE_TIMING_WINDOW_MS = 15 * 60_000;
export const VIDEO_CORE_TIMING_SAMPLE_LIMIT = 16;
export const VIDEO_CORE_TIMING_CHANGE_THRESHOLD = 4;
/** Corrections spread over less playback than this describe one moment, not drift. */
export const VIDEO_CORE_TIMING_MIN_SPAN_SEC = 120;
/** Below this rate a constant offset still explains the fault. */
export const VIDEO_CORE_TIMING_MIN_DRIFT_MS_PER_MIN = 100;
/** How far off the drift line one manual correction may sit — 1.5 control steps. */
export const VIDEO_CORE_TIMING_MAX_RESIDUAL_SEC = 0.15;
/** The manual control's own range; the tracker never exceeds it. */
export const VIDEO_CORE_TIMING_MAX_DELAY_SEC = 10;
/** The tracker only rewrites the delay once its projection has moved this far. */
export const VIDEO_CORE_TIMING_APPLY_STEP_SEC = 0.05;

export function normalizeVideoCoreStudyPreferences(value: unknown): VideoCoreStudyPreferences {
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<VideoCoreStudyPreferences>
    : {};
  const fontSize = typeof raw.subtitleFontSize === 'number'
    && Number.isFinite(raw.subtitleFontSize)
    ? Math.round(Math.max(16, Math.min(48, raw.subtitleFontSize)))
    : 26;
  return {
    ...raw,
    playbackRate: clampStudyPlaybackRate(
      typeof raw.playbackRate === 'number' ? raw.playbackRate : 1,
    ),
    autoPause: raw.autoPause === true,
    loopLine: raw.loopLine === true,
    furigana: raw.furigana === true,
    primarySubs: raw.primarySubs !== false,
    dualSubs: raw.dualSubs !== false,
    subtitlesHidden: raw.subtitlesHidden === true,
    videoFit: VIDEO_FIT_MODES.includes(raw.videoFit as VideoFitMode) ? raw.videoFit as VideoFitMode : 'contain',
    dictationMode: raw.dictationMode === true,
    shadowingMode: raw.shadowingMode === true,
    volumeNormalization: raw.volumeNormalization === true,
    subtitleFontSize: fontSize,
    subtitleBgOpacity: typeof raw.subtitleBgOpacity === 'number'
      && Number.isFinite(raw.subtitleBgOpacity)
      ? Math.round(Math.max(0, Math.min(90, raw.subtitleBgOpacity)))
      : 35,
    subtitleFontFamily: typeof raw.subtitleFontFamily === 'string'
      && raw.subtitleFontFamily in SUBTITLE_FONT_STACKS
      ? raw.subtitleFontFamily as SubtitleFontChoice
      : 'default',
    subtitleFontWeight: typeof raw.subtitleFontWeight === 'number'
      && Number.isFinite(raw.subtitleFontWeight)
      // Snapped to the 100s CSS actually interpolates, so a hand-edited 637 in the stored
      // JSON becomes a weight a font can select rather than one it rounds unpredictably.
      ? Math.round(Math.max(400, Math.min(800, raw.subtitleFontWeight)) / 100) * 100
      : 600,
    subtitleOutline: raw.subtitleOutline !== false,
    cueTimingReadout: raw.cueTimingReadout === true,
    secondarySubLang: typeof raw.secondarySubLang === 'string'
      && (SECONDARY_SUB_LANGS as readonly string[]).includes(raw.secondarySubLang)
      ? raw.secondarySubLang
      : 'en',
    grammarHighlight: raw.grammarHighlight === true,
    knownHighlight: raw.knownHighlight !== false,
    lineLevel: raw.lineLevel !== false,
    transcriptPanel: raw.transcriptPanel === true,
    seekStepSec: typeof raw.seekStepSec === 'number' && Number.isFinite(raw.seekStepSec)
      ? Math.round(Math.max(1, Math.min(60, raw.seekStepSec)))
      : 5,
    subtitlePosition: typeof raw.subtitlePosition === 'number'
      && Number.isFinite(raw.subtitlePosition)
      ? Math.round(Math.max(0, Math.min(SUBTITLE_POSITION_MAX, raw.subtitlePosition)))
      : 0,
    subtitleAtTop: raw.subtitleAtTop === true,
    subtitleColor: normalizeSubtitleColor(raw.subtitleColor),
    subtitleOutlineColor: normalizeSubtitleColor(raw.subtitleOutlineColor),
    secondarySubScale: typeof raw.secondarySubScale === 'number'
      && Number.isFinite(raw.secondarySubScale)
      ? Math.round(Math.max(
        SECONDARY_SUB_SCALE_MIN,
        Math.min(SECONDARY_SUB_SCALE_MAX, raw.secondarySubScale),
      ))
      : SECONDARY_SUB_SCALE_DEFAULT,
    secondarySubColor: normalizeSubtitleColor(raw.secondarySubColor),
  };
}

/**
 * Every preference that changes how the subtitle LOOKS or where it sits, and nothing that
 * changes what it says or what the study tools do. This is exactly what "Reset subtitle
 * appearance" puts back: a reset that also switched furigana off or cleared the second-line
 * language would be a reset of the user's study setup, which nobody asked for.
 */
export const SUBTITLE_APPEARANCE_KEYS = [
  'subtitleFontSize',
  'subtitleBgOpacity',
  'subtitleFontFamily',
  'subtitleFontWeight',
  'subtitleOutline',
  'subtitlePosition',
  'subtitleAtTop',
  'subtitleColor',
  'subtitleOutlineColor',
  'secondarySubScale',
  'secondarySubColor',
] as const satisfies readonly (keyof VideoCoreStudyPreferences)[];

/** The preferences with every appearance key back at its default and everything else kept. */
export function resetSubtitleAppearance(
  preferences: VideoCoreStudyPreferences,
): VideoCoreStudyPreferences {
  const defaults = normalizeVideoCoreStudyPreferences(null);
  const next: VideoCoreStudyPreferences = { ...preferences };
  for (const key of SUBTITLE_APPEARANCE_KEYS) {
    (next as Record<string, unknown>)[key] = defaults[key];
  }
  return normalizeVideoCoreStudyPreferences(next);
}

/** True when any appearance key differs from its default — what enables the reset button. */
export function subtitleAppearanceIsDefault(preferences: VideoCoreStudyPreferences): boolean {
  const defaults = normalizeVideoCoreStudyPreferences(null);
  return SUBTITLE_APPEARANCE_KEYS.every((key) => preferences[key] === defaults[key]);
}

/**
 * One press of "subtitles up" (+1) or "down" (−1).
 *
 * The lift and the top placement read as one ladder: up past the highest lift goes to the
 * top of the picture, and down from the top comes back to the highest lift, so the two
 * shortcuts can reach every placement the sheet can and never strand the line at the top.
 */
export function nudgeSubtitlePosition(
  preferences: Pick<VideoCoreStudyPreferences, 'subtitlePosition' | 'subtitleAtTop'>,
  direction: 1 | -1,
): { subtitlePosition: number; subtitleAtTop: boolean } {
  if (preferences.subtitleAtTop) {
    return direction > 0
      ? { subtitlePosition: preferences.subtitlePosition, subtitleAtTop: true }
      : { subtitlePosition: SUBTITLE_POSITION_MAX, subtitleAtTop: false };
  }
  if (direction > 0 && preferences.subtitlePosition >= SUBTITLE_POSITION_MAX) {
    return { subtitlePosition: SUBTITLE_POSITION_MAX, subtitleAtTop: true };
  }
  const next = preferences.subtitlePosition + direction * SUBTITLE_POSITION_STEP;
  return {
    subtitlePosition: Math.max(0, Math.min(SUBTITLE_POSITION_MAX, next)),
    subtitleAtTop: false,
  };
}

/**
 * The CSS custom properties the cue overlay is positioned with. See `mediaWorkspace.css`
 * (`.study-cue-overlay`): the band's `bottom` is its floor plus this fraction of the free
 * height above the floor, so no value here can put the line under the bar, the transport
 * or a bottom panel — the floor is added, never replaced.
 */
export function subtitlePlacementStyle(
  preferences: Pick<VideoCoreStudyPreferences, 'subtitlePosition' | 'subtitleAtTop'>,
): Record<string, string> {
  return {
    '--study-cue-lift': String(
      Math.max(0, Math.min(SUBTITLE_POSITION_MAX, preferences.subtitlePosition)) / 100,
    ),
  };
}

/**
 * `text-shadow` for a subtitle line in a given outline colour: the four-corner outline plus
 * the soft drop the stylesheet uses, so a coloured outline keeps the same weight and only
 * changes hue. `thin` is the second line's lighter 1px outline.
 */
export function subtitleOutlineShadow(color: string, thin = false): string {
  const hex = normalizeSubtitleColor(color) || '#000000';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const c = `rgb(${r} ${g} ${b} / 0.95)`;
  const d = thin ? 1 : 2;
  return [
    `-${d}px -${d}px 2px ${c}`,
    `${d}px -${d}px 2px ${c}`,
    `-${d}px ${d}px 2px ${c}`,
    `${d}px ${d}px 2px ${c}`,
    `0 ${thin ? 2 : 3}px ${thin ? 5 : 6}px ${c}`,
  ].join(', ');
}

/**
 * Whether dual subtitles are on but no second line CAN appear, so the overlay should say so
 * once instead of leaving a blank where the user expects a translation.
 *
 * "Can": no other track to show, and the translator either failed (no local model, no key)
 * or has nothing to do because the chosen second language IS the study language. A second
 * line that is merely between two cues is not this — `hasCues` is about the track, not the
 * moment, so the notice is mounted once per file and its CSS fade runs once.
 */
export function secondaryLineUnavailable(input: {
  dualSubs: boolean;
  hasCues: boolean;
  hasSecondaryTrack: boolean;
  secondaryText: string;
  translatorFailed: boolean;
  secondaryLang: string;
  studyLang: string;
}): boolean {
  if (!input.dualSubs || !input.hasCues || input.hasSecondaryTrack || input.secondaryText) {
    return false;
  }
  return input.translatorFailed
    || shortLangTag(input.secondaryLang) === shortLangTag(input.studyLang);
}

/**
 * What the second line shows when a track is available for it.
 *
 * The track wins when it is in the chosen language, or when its language is unknown (a
 * label the detector cannot read is still the track the user was offered). A track in
 * ANOTHER language is only a stand-in: choosing Russian on a release that ships English
 * used to show the English line as if the choice had been ignored, or, when the English
 * track was still loading, nothing at all. The translator is asked first; while it works
 * nothing is shown rather than an English line that turns Russian a moment later, and when
 * it fails the English line is shown after all, with `fallback` set so the overlay can say
 * once why the line is not in the chosen language.
 */
export function resolveSecondaryLine(input: {
  hasSecondaryTrack: boolean;
  /** `studyTrackLanguage` of the second-line track, `''` when unknown. */
  trackLang: string;
  trackText: string;
  translation: string;
  translatorFailed: boolean;
  secondaryLang: string;
}): { text: string; translate: boolean; fallback: boolean } {
  const chosen = shortLangTag(input.secondaryLang);
  const trackLang = shortLangTag(input.trackLang);
  if (!input.hasSecondaryTrack || !trackLang || trackLang === chosen) {
    // No track (translation is the only source), or the track IS the chosen language.
    return { text: input.trackText || input.translation, translate: !input.trackText, fallback: false };
  }
  if (input.translation) return { text: input.translation, translate: true, fallback: false };
  return {
    text: input.translatorFailed ? input.trackText : '',
    translate: true,
    fallback: input.translatorFailed,
  };
}

/* ------------------------------------------------------------------------------ *
 * Per-file subtitle delay
 * ------------------------------------------------------------------------------ */

/**
 * A subtitle delay belongs to a FILE, not to the player: the release that is 0.4 s late is
 * late every time it is opened and no other file is. Keyed exactly like the resume position
 * (`videoCoreResumeKey`), so the two can never disagree about which file this is.
 */
export const VIDEO_CORE_SUB_DELAY_STORAGE_KEY = 'jp-video-core-sub-delay-v1';
export const VIDEO_CORE_SUB_DELAY_LIMIT = 200;

export interface VideoCoreSubtitleDelayEntry {
  key: string;
  delaySec: number;
  updatedAt: number;
}

export function normalizeVideoCoreSubtitleDelays(value: unknown): VideoCoreSubtitleDelayEntry[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-VIDEO_CORE_SUB_DELAY_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Partial<VideoCoreSubtitleDelayEntry>;
    const key = resumeText(raw.key);
    if (
      !key
      || typeof raw.delaySec !== 'number'
      || !Number.isFinite(raw.delaySec)
      || typeof raw.updatedAt !== 'number'
      || !Number.isFinite(raw.updatedAt)
    ) return [];
    const delaySec = Math.round(
      Math.max(-VIDEO_CORE_TIMING_MAX_DELAY_SEC, Math.min(VIDEO_CORE_TIMING_MAX_DELAY_SEC, raw.delaySec)) * 1000,
    ) / 1000;
    return [{ key, delaySec, updatedAt: Math.max(0, Math.round(raw.updatedAt)) }];
  });
}

/**
 * Store one file's delay. A delay of zero REMOVES the entry rather than storing a zero: a
 * reset is the file going back to having no correction, and a list that filled with zeros
 * would evict real corrections at the limit.
 */
export function upsertVideoCoreSubtitleDelay(
  entries: readonly VideoCoreSubtitleDelayEntry[],
  key: string,
  delaySec: number,
  now = Date.now(),
): VideoCoreSubtitleDelayEntry[] {
  const kept = normalizeVideoCoreSubtitleDelays(entries).filter((entry) => entry.key !== key);
  const next = normalizeVideoCoreSubtitleDelays([{ key, delaySec, updatedAt: now }])[0];
  if (!next || next.delaySec === 0) return kept;
  return [...kept, next].slice(-VIDEO_CORE_SUB_DELAY_LIMIT);
}

export function resolveVideoCoreSubtitleDelay(
  entries: readonly VideoCoreSubtitleDelayEntry[],
  key: string,
): number {
  if (!key) return 0;
  return normalizeVideoCoreSubtitleDelays(entries).find((entry) => entry.key === key)?.delaySec ?? 0;
}

/* ------------------------------------------------------------------------------ *
 * Which track is the study line
 * ------------------------------------------------------------------------------ */

/** What a track looks like to the choice below — `NormalizedTrackInfo`, minus the vendor import. */
export interface StudyTrackCandidate {
  number: number;
  language?: string;
  languageIETF?: string;
  label?: string;
  default?: boolean;
  forced?: boolean;
}

/**
 * Language words that may appear in a track LABEL, per two-letter code. A sidecar track has
 * no language field at all — its label is the file name (`… - 04.ja`, `… 01.en.srt`) — so
 * the tag has to be read out of the name, the way every player reads `.ja.srt`.
 */
const LABEL_LANG_WORDS: Readonly<Record<string, readonly string[]>> = {
  ja: ['ja', 'jp', 'jpn', 'japanese', 'jap'],
  en: ['en', 'eng', 'english'],
  zh: ['zh', 'chi', 'zho', 'chs', 'cht', 'chinese', 'sc', 'tc'],
  ko: ['ko', 'kor', 'korean'],
  ru: ['ru', 'rus', 'russian'],
  es: ['es', 'spa', 'spanish'],
  fr: ['fr', 'fre', 'fra', 'french'],
  de: ['de', 'ger', 'deu', 'german'],
};

const LABEL_SCRIPT_LANGS: readonly [RegExp, string][] = [
  [/日本語|にほんご|[぀-ヿ]/u, 'ja'],
  [/中文|简体|繁體|繁体|简中|繁中/u, 'zh'],
  [/한국어|[가-힯]/u, 'ko'],
  [/русск/iu, 'ru'],
];

/**
 * A track's language as a two-letter code, from its language field when it has one and from
 * its label otherwise. `''` when neither says.
 *
 * The label is split on the punctuation file names use (`.`, `_`, `-`, spaces, brackets) and
 * each piece compared whole, so `Camp` never reads as anything and `.ja` at the end of
 * `[Test] Yuru Camp - 04.ja` does.
 */
export function studyTrackLanguage(track: StudyTrackCandidate): string {
  const rawField = shortLangTag(track.language || track.languageIETF);
  const fromField = rawField === 'jp' ? 'ja' : rawField;
  // Only a code this list knows is trusted over the label: `und` (undetermined) is what an
  // untagged Matroska stream carries, and it must not hide `Japanese` in the track's name.
  if (fromField && fromField in LABEL_LANG_WORDS) return fromField;
  const label = track.label ?? '';
  for (const [pattern, code] of LABEL_SCRIPT_LANGS) {
    if (pattern.test(label)) return code;
  }
  const pieces = label.toLowerCase().split(/[\s._\-[\]()]+/).filter(Boolean);
  // From the END: a file name's language tag is its last word before the extension, and a
  // series title earlier in the name (`Tokyo Sonata`) must not outvote it.
  for (let i = pieces.length - 1; i >= 0; i -= 1) {
    const piece = pieces[i];
    if (piece === 'srt' || piece === 'ass' || piece === 'ssa' || piece === 'vtt') continue;
    for (const [code, words] of Object.entries(LABEL_LANG_WORDS)) {
      if (words.includes(piece)) return code;
    }
  }
  return fromField === 'un' ? '' : fromField;
}

/** A user's explicit primary-track choice, remembered for a file or a series. */
export interface VideoCoreTrackChoice {
  key: string;
  /** Two-letter language of the chosen track, `''` when it had none. */
  lang: string;
  /** The chosen track's label — the tiebreak between two tracks in one language. */
  label: string;
  /** The user switched subtitles OFF. */
  off: boolean;
  updatedAt: number;
}

export const VIDEO_CORE_TRACK_CHOICE_STORAGE_KEY = 'jp-video-core-sub-track-v1';
export const VIDEO_CORE_TRACK_CHOICE_LIMIT = 200;

export function normalizeVideoCoreTrackChoices(value: unknown): VideoCoreTrackChoice[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-VIDEO_CORE_TRACK_CHOICE_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Partial<VideoCoreTrackChoice>;
    const key = resumeText(raw.key);
    if (!key || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) return [];
    return [{
      key,
      lang: typeof raw.lang === 'string' ? shortLangTag(raw.lang) : '',
      label: resumeText(raw.label, 240),
      off: raw.off === true,
      updatedAt: Math.max(0, Math.round(raw.updatedAt)),
    }];
  });
}

/**
 * The keys a choice is remembered under: the file, and the series it belongs to. A choice made
 * on episode 3 then carries to episode 4 (same series), while a choice made for one file of a
 * folder of unrelated videos still carries to its neighbours — which is what "series" means for
 * a file the library has not matched to anything.
 */
export function videoCoreTrackChoiceKeys(source: VideoCoreResumeSource): string[] {
  const fileKey = videoCoreResumeKey(source);
  const keys = fileKey ? [fileKey] : [];
  if (Number.isFinite(source.mediaId)) {
    keys.push(`series:media:${Math.round(source.mediaId as number)}`);
  } else {
    const local = resumeText(source.localFilePath).replace(/\\/g, '/').toLocaleLowerCase('en-US');
    const cut = local.lastIndexOf('/');
    if (cut > 0) keys.push(`series:dir:${local.slice(0, cut)}`);
  }
  return keys;
}

export function upsertVideoCoreTrackChoice(
  choices: readonly VideoCoreTrackChoice[],
  keys: readonly string[],
  choice: { lang: string; label: string; off: boolean },
  now = Date.now(),
): VideoCoreTrackChoice[] {
  const wanted = new Set(keys.filter(Boolean));
  const kept = normalizeVideoCoreTrackChoices(choices).filter((entry) => !wanted.has(entry.key));
  const added = normalizeVideoCoreTrackChoices([...wanted].map((key) => ({ key, ...choice, updatedAt: now })));
  return [...kept, ...added].slice(-VIDEO_CORE_TRACK_CHOICE_LIMIT);
}

/** The most specific remembered choice: the file's own, else its series'. */
export function resolveVideoCoreTrackChoice(
  choices: readonly VideoCoreTrackChoice[],
  keys: readonly string[],
): VideoCoreTrackChoice | null {
  const normalized = normalizeVideoCoreTrackChoices(choices);
  for (const key of keys) {
    const hit = normalized.find((entry) => entry.key === key);
    if (hit) return hit;
  }
  return null;
}

/**
 * Which track should be the STUDY line: `null` for "subtitles off", a track number, or
 * `undefined` for "no opinion — leave the player's pick alone".
 *
 * 1. The user's remembered choice for this file or series wins, matched by label first (the
 *    same release names its tracks the same way episode to episode) and by language second.
 * 2. Otherwise a track in the study language, preferring a full track over a forced
 *    (signs-only) one and the muxer's default among equals.
 * 3. Otherwise no opinion. A file with no study-language track keeps whatever VideoCore
 *    chose, because a second guess among non-study tracks has nothing better to go on.
 *
 * With no remembered choice, a `current` track that is ALREADY in the study language is kept:
 * a Whisper transcription or a downloaded Japanese track the user just switched to is as
 * much the study line as the muxer's default, and swapping it back would undo their work.
 */
export function pickStudyPrimaryTrack(
  tracks: readonly StudyTrackCandidate[],
  studyLang: string,
  remembered: Pick<VideoCoreTrackChoice, 'lang' | 'label' | 'off'> | null,
  current: number | null = null,
): number | null | undefined {
  if (!tracks.length) return undefined;
  if (remembered) {
    if (remembered.off) return null;
    const byLabel = remembered.label
      ? tracks.find((track) => (track.label ?? '') === remembered.label)
      : undefined;
    if (byLabel) return byLabel.number;
    const byLang = remembered.lang
      ? tracks.find((track) => studyTrackLanguage(track) === remembered.lang && !track.forced)
        ?? tracks.find((track) => studyTrackLanguage(track) === remembered.lang)
      : undefined;
    if (byLang) return byLang.number;
  }
  const study = shortLangTag(studyLang);
  const inStudyLang = tracks.filter((track) => studyTrackLanguage(track) === study);
  if (!inStudyLang.length) return undefined;
  if (!remembered && current != null && inStudyLang.some((track) => track.number === current)) {
    return undefined;
  }
  const full = inStudyLang.filter((track) => !track.forced);
  const pool = full.length ? full : inStudyLang;
  return (pool.find((track) => track.default) ?? pool[0]).number;
}

/**
 * VideoCore's preferred-subtitle-language setting, led by the study language.
 *
 * Upstream ships `en,eng,english`, which is why a release carrying both a Japanese and an
 * English track opened on the English one: exactly backwards for a study player. The study
 * language goes first and whatever the setting already held stays behind it as the fallback,
 * so a file with no study-language track still opens on the user's second choice rather than
 * on nothing.
 *
 * Seeded ONCE per study language (`seededFor`): a user who then edits the setting in
 * VideoCore's own preferences keeps their edit.
 */
const STUDY_LANG_SUBTITLE_PREFS: Readonly<Record<string, string>> = {
  ja: 'ja,jpn,japanese',
  zh: 'zh,chi,zho,chinese',
};

export const VIDEO_CORE_SUB_LANG_SEED_STORAGE_KEY = 'jp-video-core-sub-lang-seed-v1';

export function seedPreferredSubtitleLanguage(
  current: string | undefined,
  studyLang: string,
  seededFor: string | null,
): string | null {
  const study = shortLangTag(studyLang);
  const lead = STUDY_LANG_SUBTITLE_PREFS[study];
  if (!lead || seededFor === study) return null;
  const existing = (current ?? 'en,eng,english')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const leadParts = lead.split(',');
  const rest = existing.filter((part) => (
    !leadParts.includes(part.toLowerCase()) && part.toLowerCase() !== 'none'
  ));
  return [...leadParts, ...rest].join(',');
}

/**
 * ISO 639-2 codes for the offered languages, mapped to their two-letter form.
 *
 * Only these need mapping: truncating a three-letter tag to its first two characters
 * turns `jpn` into `jp`, which is not a language code and matches nothing.
 */
const THREE_LETTER_LANGS: Readonly<Record<string, string>> = {
  jpn: 'ja',
  eng: 'en',
  rus: 'ru',
  zho: 'zh',
  chi: 'zh',
  kor: 'ko',
  spa: 'es',
  fra: 'fr',
  fre: 'fr',
  deu: 'de',
  ger: 'de',
};

/**
 * The two-letter form of a subtitle track's language tag.
 *
 * Track metadata is inconsistent here — the same language arrives as `ja`, `jpn` or
 * `ja-JP` depending on who muxed the file — so any comparison against a stored preference
 * has to be made on a normalized first subtag rather than on the raw string.
 */
export function shortLangTag(value: string | null | undefined): string {
  if (!value) return '';
  const base = value.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  return THREE_LETTER_LANGS[base] ?? base.slice(0, 2);
}

/**
 * A cue's readable text — what the transcript shows, what a lookup is run on, and what
 * a mined card carries. Never what the renderer draws; JASSUB gets the raw line.
 *
 * ## The brace is the block, not `{\`
 *
 * This used to require a backslash immediately after the opening brace. Karaoke
 * templating writes `{*\fs30.235\fax-0.575}` — libass ignores the whole braced block
 * either way, and the `*` is just a template marker — so a whole class of release went
 * through unstripped. Measured live 2026-09-03 on the `FFF (default)` track of one OVA:
 * **633 of 2,650 cues (24 %)** reached the transcript still carrying override blocks,
 * the worst of them one block *between every letter*, so a line reading `Tanabata`
 * arrived as `T{*\fs30.235\fax-0.575}a{*\fs30.471\fax-0.571}n…`. That text is what the
 * tokenizer, the search box and the mining panel all see.
 *
 * So the match is any braced block **containing a backslash**, which is what an ASS
 * override or transform block always has. Deliberately not "any `{…}`": an SRT line can
 * carry `{laughs}` as real content, and silently deleting a stage direction from a study
 * card is a worse failure than leaving one in.
 *
 * `\h` is ASS's non-breaking space and joins `\N` / `\n` here — 376 of those same 2,650
 * cues contained one, and it was reaching the reader as a literal backslash-h.
 */
export function stripAssCueText(text: string): string {
  return text
    .replace(/\{[^}]*\\[^}]*\}/g, '')
    .replace(/\\[Nnh]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Positioning, drawing and transform overrides — what a typesetter writes over on-screen
 * text, and what a translator of speech does not.
 *
 * DEFECT S6: the transcript rail renders every ASS `Dialogue:` line, signs included, so a
 * 30-minute OVA whose script is 430 spoken lines presents as thousands of rows. The obvious
 * filter is the ASS `Style` field, but `VideoCoreActiveCue` is `{index, trackNumber, text,
 * startMs, endMs}` — no style — so using it means plumbing a new field through the seanime
 * vendor boundary. The raw text carries the same signal, which is measurable rather than
 * arguable because the Style field IS available offline and makes a ground truth this
 * classifier never sees.
 *
 * Measured 2026-09-03 with `debug/_pri-s6-census.cjs` against the app's own live clip
 * (`[project-gxs] Date a Live II - Kurumi Star Festival OVA`, one `ass` stream): 3,056
 * `Dialogue:` lines, ground truth 2,510 `Sign*` / 546 other. This flags **2,626 at 100.0 %
 * recall — zero signs survive** — and leaves the rail at **430 rows**, which is precisely
 * the `Default` set. The 116 nominal false positives are NOT lost sentences: they are
 * exactly the OP/ED karaoke and Title styles (22 + 22 + 2 + 70 = 116, arithmetic that
 * closes), so no `Default` line is flagged.
 *
 * Runs on the RAW cue text, before `stripAssCueText` — which deletes the brace groups this
 * reads. An SRT track carries no override tags at all, so nothing is flagged and such a rail
 * is unchanged; that is the correct safe default rather than an oversight.
 *
 * **`\an` was REMOVED after an ablation, and the removal is the interesting part.** Dropping
 * each term in turn against the same ground truth: without the positioning group recall falls
 * to **92.1 %** and 199 signs survive, so it carries the whole signal — but dropping `\p`,
 * `\fr` OR `\an` changes **nothing at all** (recall stays 100.0 %, rail stays 430), because
 * each of those three flags **zero** lines that the positioning group does not already catch.
 * `\an` is alignment, and `\an8` is align-top, which fansubbers use for ordinary dialogue
 * moved to the top of frame when signs occupy the bottom — so it was pure precision risk
 * earning nothing. This repo's own `videoGrammarHighlightRender` suite had used `{\an8}
 * こんにちは` as its example of an override on plain speech since long before S6, which is
 * exactly the case it would have hidden.
 *
 * `\p` and `\fr` stay despite also scoring zero here, because unlike alignment they are
 * format-level facts rather than track habits: a `\p1` line is a vector DRAWING, not text at
 * all, and would otherwise leak path coordinates into the rail as if they were a sentence.
 */
const ASS_TYPESETTING_OVERRIDE =
  /\\(?:pos|move|clip|iclip|org|fad|fade|t)\s*\(|\\p[1-9]|\\fr[xyz]?-?\d/i;

export function isTypesettingCueText(text: string): boolean {
  return ASS_TYPESETTING_OVERRIDE.test(text);
}

export function cuePlaybackStartSec(
  cue: Pick<VideoCoreStudyCue, 'startMs'>,
  subtitleDelaySec: number,
): number {
  return Math.max(0, cue.startMs / 1000 + subtitleDelaySec);
}

/**
 * Where playback lands when a transcript line is clicked: the cue's start, less
 * a run-up, never before the file.
 *
 * Kept here rather than inline in the overlay because the clamp is the whole
 * content of it — a lead-in applied to a cue in the first second of an episode
 * produces a negative `currentTime`, which Chromium silently coerces to 0 on
 * some paths and rejects on others.
 */
export function transcriptSeekSec(
  cue: Pick<VideoCoreStudyCue, 'startMs'>,
  subtitleDelaySec: number,
  leadInSec: number,
): number {
  return Math.max(0, cuePlaybackStartSec(cue, subtitleDelaySec) - leadInSec);
}

export function cuePlaybackEndSec(
  cue: Pick<VideoCoreStudyCue, 'endMs'>,
  subtitleDelaySec: number,
): number {
  return Math.max(0, cue.endMs / 1000 + subtitleDelaySec);
}

export function videoCoreStudyCueKey(
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'>,
): string {
  return `${cue.trackNumber}:${cue.index}:${cue.startMs}:${cue.endMs}`;
}

/**
 * Records only an explicit replay-control activation. Automatic line/A-B loops
 * do not pass through this helper, so they cannot manufacture a recommendation.
 * The state holds one cue and one ten-minute window, keeping the signal bounded
 * to the active player session.
 */
export function recordVideoCoreCueReplay(
  current: VideoCoreCueReplaySignal | null,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'>,
  now = Date.now(),
): VideoCoreCueReplaySignal {
  const cueKey = videoCoreStudyCueKey(cue);
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  if (
    !current
    || current.cueKey !== cueKey
    || timestamp - current.firstReplayAt > VIDEO_CORE_SHADOWING_REPLAY_WINDOW_MS
  ) {
    return {
      cueKey,
      replayCount: 1,
      firstReplayAt: timestamp,
      lastReplayAt: timestamp,
      dismissed: false,
    };
  }
  return {
    ...current,
    replayCount: Math.min(99, current.replayCount + 1),
    lastReplayAt: timestamp,
  };
}

export function dismissVideoCoreShadowingSuggestion(
  current: VideoCoreCueReplaySignal | null,
): VideoCoreCueReplaySignal | null {
  return current ? { ...current, dismissed: true } : null;
}

export function shouldSuggestVideoCoreShadowing(
  signal: VideoCoreCueReplaySignal | null,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'> | null,
  shadowingMode: boolean,
): boolean {
  return Boolean(
    signal
    && cue
    && !shadowingMode
    && !signal.dismissed
    && signal.cueKey === videoCoreStudyCueKey(cue)
    && signal.replayCount >= VIDEO_CORE_SHADOWING_REPLAY_THRESHOLD,
  );
}

/**
 * Keeps only one short, nearby-cue evidence window in the active player.
 * Callers deliberately route explicit lookup/rewind/pause actions here; automatic
 * playback loops never call this helper and therefore cannot create a rescue.
 */
export function recordVideoCoreComprehensionEvent(
  current: VideoCoreComprehensionSignal | null,
  event: VideoCoreComprehensionEvent,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber' | 'startMs' | 'endMs'>,
  now = Date.now(),
): VideoCoreComprehensionSignal {
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  const nearby = Boolean(
    current
    && current.trackNumber === cue.trackNumber
    && Math.abs(current.anchorCueIndex - cue.index) <= VIDEO_CORE_COMPREHENSION_SCENE_RADIUS
    && timestamp - current.firstEventAt <= VIDEO_CORE_COMPREHENSION_WINDOW_MS,
  );
  const base: VideoCoreComprehensionSignal = nearby && current
    ? current
    : {
      trackNumber: cue.trackNumber,
      anchorCueIndex: cue.index,
      anchorCueKey: videoCoreStudyCueKey(cue),
      lookupCount: 0,
      rewindCount: 0,
      pauseCount: 0,
      firstEventAt: timestamp,
      lastEventAt: timestamp,
      dismissed: false,
    };
  const anchor = event === 'lookup'
    ? {
      trackNumber: cue.trackNumber,
      anchorCueIndex: cue.index,
      anchorCueKey: videoCoreStudyCueKey(cue),
    }
    : {};
  return {
    ...base,
    ...anchor,
    lookupCount: Math.min(99, base.lookupCount + (event === 'lookup' ? 1 : 0)),
    rewindCount: Math.min(99, base.rewindCount + (event === 'rewind' ? 1 : 0)),
    pauseCount: Math.min(99, base.pauseCount + (event === 'pause' ? 1 : 0)),
    lastEventAt: timestamp,
  };
}

export function dismissVideoCoreComprehensionSuggestion(
  current: VideoCoreComprehensionSignal | null,
): VideoCoreComprehensionSignal | null {
  return current ? { ...current, dismissed: true } : null;
}

export function shouldSuggestVideoCoreComprehensionRescue(
  signal: VideoCoreComprehensionSignal | null,
  cue: Pick<VideoCoreStudyCue, 'index' | 'trackNumber'> | null,
  paused: boolean,
  now = Date.now(),
): boolean {
  return Boolean(
    signal
    && cue
    && paused
    && !signal.dismissed
    && signal.trackNumber === cue.trackNumber
    && Math.abs(signal.anchorCueIndex - cue.index) <= VIDEO_CORE_COMPREHENSION_SCENE_RADIUS
    && now - signal.firstEventAt <= VIDEO_CORE_COMPREHENSION_WINDOW_MS
    && signal.lookupCount >= VIDEO_CORE_COMPREHENSION_LOOKUP_THRESHOLD
    && signal.rewindCount >= VIDEO_CORE_COMPREHENSION_REWIND_THRESHOLD
    && signal.pauseCount >= 1,
  );
}

export function videoCoreRescueScene(
  cues: readonly VideoCoreStudyCue[],
  anchor: Pick<VideoCoreStudyCue, 'index' | 'trackNumber'>,
  subtitleDelaySec: number,
): VideoCoreRescueScene | null {
  const trackCues = cues.filter((cue) => cue.trackNumber === anchor.trackNumber);
  const position = trackCues.findIndex((cue) => cue.index === anchor.index);
  if (position < 0) return null;
  const first = trackCues[Math.max(0, position - 1)];
  const last = trackCues[Math.min(trackCues.length - 1, position + 1)];
  if (!first || !last) return null;
  const startSec = cuePlaybackStartSec(first, subtitleDelaySec);
  const endSec = cuePlaybackEndSec(last, subtitleDelaySec);
  if (!(endSec > startSec)) return null;
  return {
    startSec,
    endSec,
    cueCount: Math.min(trackCues.length - 1, position + 1) - Math.max(0, position - 1) + 1,
    firstCueIndex: first.index,
    lastCueIndex: last.index,
  };
}

/**
 * Records one *explicit* subtitle-delay activation — the ±0.1s controls only.
 * Programmatic writes (loading a track, the drift tracker below) never reach
 * this helper, so a correction the app applied itself can never be mistaken for
 * the user fighting the timing.
 *
 * The state holds one track and one bounded window of samples, so the evidence
 * lives and dies with the active player session.
 */
export function recordVideoCoreTimingAdjustment(
  current: VideoCoreTimingSignal | null,
  trackNumber: number,
  positionSec: number,
  delaySec: number,
  now = Date.now(),
): VideoCoreTimingSignal | null {
  if (!Number.isFinite(positionSec) || !Number.isFinite(delaySec) || !Number.isFinite(trackNumber)) {
    return current;
  }
  const timestamp = Number.isFinite(now) ? Math.max(0, Math.round(now)) : Date.now();
  const sample: VideoCoreTimingSample = {
    positionSec: Math.max(0, Math.round(positionSec * 1000) / 1000),
    delaySec: Math.round(delaySec * 1000) / 1000,
    at: timestamp,
  };
  const continues = Boolean(
    current
    && current.trackNumber === trackNumber
    && timestamp - current.firstChangeAt <= VIDEO_CORE_TIMING_WINDOW_MS,
  );
  if (!continues || !current) {
    return {
      trackNumber,
      changeCount: 1,
      firstChangeAt: timestamp,
      lastChangeAt: timestamp,
      samples: [sample],
      dismissed: false,
    };
  }
  const samples = [...current.samples, sample].slice(-VIDEO_CORE_TIMING_SAMPLE_LIMIT);
  return {
    ...current,
    changeCount: Math.min(99, current.changeCount + 1),
    lastChangeAt: timestamp,
    samples,
  };
}

export function dismissVideoCoreTimingRepair(
  current: VideoCoreTimingSignal | null,
): VideoCoreTimingSignal | null {
  return current ? { ...current, dismissed: true } : null;
}

/**
 * Reads progressive drift out of the recorded samples, or returns null.
 *
 * Drift is the one timing fault a constant delay cannot fix, so the bar is
 * deliberately high: enough explicit corrections, all in one direction, made at
 * strictly advancing playback positions across a real span, implying a rate far
 * above ordinary fiddling — and every intermediate sample must sit on the same
 * line. A user hunting back and forth around one value produces no drift here,
 * because that is a constant offset they have already solved by hand.
 */
export function videoCoreTimingDrift(
  signal: VideoCoreTimingSignal | null,
  now = Date.now(),
): VideoCoreTimingDrift | null {
  if (!signal || signal.samples.length < VIDEO_CORE_TIMING_CHANGE_THRESHOLD) return null;
  if (now - signal.firstChangeAt > VIDEO_CORE_TIMING_WINDOW_MS) return null;
  const samples = signal.samples;
  const first = samples[0];
  const last = samples[samples.length - 1];
  const spanSec = last.positionSec - first.positionSec;
  if (spanSec < VIDEO_CORE_TIMING_MIN_SPAN_SEC) return null;

  const direction = Math.sign(last.delaySec - first.delaySec);
  if (direction === 0) return null;
  for (let index = 1; index < samples.length; index += 1) {
    const step = samples[index];
    const previous = samples[index - 1];
    // Playback must advance and the correction must keep pushing the same way.
    if (step.positionSec < previous.positionSec) return null;
    if (Math.sign(step.delaySec - previous.delaySec) !== direction) return null;
  }

  const secPerSec = (last.delaySec - first.delaySec) / spanSec;
  const msPerMinute = secPerSec * 60_000;
  if (Math.abs(msPerMinute) < VIDEO_CORE_TIMING_MIN_DRIFT_MS_PER_MIN) return null;

  // Every correction must lie on the same line; a random walk is not drift.
  for (const step of samples) {
    const expected = first.delaySec + secPerSec * (step.positionSec - first.positionSec);
    if (Math.abs(step.delaySec - expected) > VIDEO_CORE_TIMING_MAX_RESIDUAL_SEC) return null;
  }

  return {
    msPerMinute: Math.round(msPerMinute),
    anchorPositionSec: last.positionSec,
    anchorDelaySec: last.delaySec,
    spanSec: Math.round(spanSec),
    sampleCount: samples.length,
    netDelaySec: Math.round((last.delaySec - first.delaySec) * 1000) / 1000,
  };
}

export function shouldSuggestVideoCoreTimingRepair(
  signal: VideoCoreTimingSignal | null,
  drift: VideoCoreTimingDrift | null,
  tracking: boolean,
): boolean {
  return Boolean(signal && drift && !signal.dismissed && !tracking);
}

/**
 * The delay the measured drift implies at `positionSec`, anchored on the user's
 * most recent manual correction — their most trusted point. Clamped to the same
 * ±10s range the manual control uses, so the tracker can never leave the player
 * somewhere the user could not have reached by hand.
 */
export function videoCoreDriftDelaySec(
  drift: VideoCoreTimingDrift,
  positionSec: number,
): number {
  if (!Number.isFinite(positionSec)) return drift.anchorDelaySec;
  const projected = drift.anchorDelaySec
    + ((positionSec - drift.anchorPositionSec) * drift.msPerMinute) / 60_000;
  const bounded = Math.max(
    -VIDEO_CORE_TIMING_MAX_DELAY_SEC,
    Math.min(VIDEO_CORE_TIMING_MAX_DELAY_SEC, projected),
  );
  return Math.round(bounded * 1000) / 1000;
}

export function activeStudyCuesAtTime(
  cues: readonly VideoCoreStudyCue[],
  playbackTimeSec: number,
  subtitleDelaySec: number,
): VideoCoreStudyCue[] {
  const sourceTimeMs = (playbackTimeSec - subtitleDelaySec) * 1000;
  const active: VideoCoreStudyCue[] = [];
  for (const cue of cues) {
    if (cue.startMs > sourceTimeMs) break;
    if (sourceTimeMs < cue.endMs) active.push(cue);
  }
  return active;
}

/**
 * The longest silence the second line is allowed to sit across, in milliseconds.
 *
 * Measured on this repo's own harvest track (36,435 ASS dialogue lines, merged to 286
 * covered spans): the median gap between spans is **650 ms** and 82 of the 285 gaps are
 * under 400 ms. Every one of those blanked the translation line for a fraction of a
 * second and brought it straight back — DEFECT S3, reported by the user as the second
 * line "disappearing and reappearing during playback".
 *
 * 1,200 ms covers the median gap and every sub-second one without touching the p90 gap
 * (3,050 ms), where a silence is long enough that a stale translation would be a lie
 * rather than a bridge.
 */
export const SECONDARY_CUE_BRIDGE_MS = 1_200;

/**
 * The second line to show at `playbackTimeSec` — the active cues, or the previous ones
 * held across a SHORT gap.
 *
 * Only the secondary line uses this, and the asymmetry is deliberate. The primary line is
 * what the study tools read, mine and grade, so it must mean exactly what the track says
 * at this instant; when it has nothing, the overlay says `Waiting for subtitle` and the
 * box stays put. The second line is a reading aid with no such box: it is rendered
 * conditionally, so it *unmounts* on every gap and the overlay reflows around it.
 *
 * The bridge is bounded by the gap, not by elapsed time. Holding "1.2 s into any gap"
 * would blank a 3-second silence part-way through, which is a second flicker rather than
 * a fix; here the previous cue either covers the whole gap or is never shown past its own
 * end. A cue with no successor is never bridged, so the last line of a file does not stick
 * to the screen for the rest of the runtime.
 *
 * `cues` must be sorted by `startMs`, exactly as {@link activeStudyCuesAtTime} requires —
 * both of this function's producers guarantee it (`parseSubtitles` sorts, and the
 * manager's `getCuesForTrack` sorts before it indexes).
 */
export function bridgedSecondaryCuesAtTime(
  cues: readonly VideoCoreStudyCue[],
  playbackTimeSec: number,
  subtitleDelaySec: number,
  bridgeMs: number = SECONDARY_CUE_BRIDGE_MS,
): VideoCoreStudyCue[] {
  const active = activeStudyCuesAtTime(cues, playbackTimeSec, subtitleDelaySec);
  if (active.length) return active;
  const sourceTimeMs = (playbackTimeSec - subtitleDelaySec) * 1000;
  let previousEndMs = Number.NEGATIVE_INFINITY;
  let previous: VideoCoreStudyCue[] = [];
  let nextStartMs = Number.POSITIVE_INFINITY;
  for (const cue of cues) {
    if (cue.startMs > sourceTimeMs) {
      nextStartMs = cue.startMs;
      break;
    }
    // Simultaneous lines end together and belong on screen together, so the whole
    // set at the latest end is carried, not just whichever one the scan saw last.
    if (cue.endMs > previousEndMs) {
      previousEndMs = cue.endMs;
      previous = [cue];
    } else if (cue.endMs === previousEndMs) {
      previous.push(cue);
    }
  }
  if (!previous.length) return [];
  if (nextStartMs - previousEndMs > bridgeMs) return [];
  return previous;
}

export function clampStudyPlaybackRate(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0.25, Math.min(3, value));
}

function normalizeJapaneseDictation(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja')
    // Keep ー: vowel length changes the word (ビル versus ビール).
    .replace(/[\s、。！？!?・「」『』“”‘’〝〞〟（）()[\]【】〈〉《》…‥.,'":;：；]/gu, '');
}

function editDistance(left: string[], right: string[]): number {
  if (!left.length) return right.length;
  if (!right.length) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 0; row < left.length; row += 1) {
    const current = [row + 1];
    for (let column = 0; column < right.length; column += 1) {
      current[column + 1] = Math.min(
        current[column] + 1,
        previous[column + 1] + 1,
        previous[column] + (left[row] === right[column] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

export function evaluateVideoCoreDictation(
  answerValue: string,
  expectedValue: string,
): VideoCoreDictationEvaluation {
  const answer = normalizeJapaneseDictation(answerValue).slice(0, 500);
  const expected = normalizeJapaneseDictation(expectedValue).slice(0, 500);
  const longest = Math.max(answer.length, expected.length);
  const distance = editDistance([...answer], [...expected]);
  return {
    exact: !!expected && answer === expected,
    score: longest ? Math.max(0, Math.round((1 - distance / longest) * 100)) : 0,
    answer,
    expected,
  };
}

export function nextVideoCoreWhisperTrackNumber(
  trackNumbers: readonly number[],
): number {
  return Math.max(0, ...trackNumbers.filter(Number.isFinite)) + 1;
}

export function whisperCuesToVideoCoreEvents(
  cues: readonly VideoCoreWhisperCue[],
  trackNumber: number,
): VideoCoreWhisperEvent[] {
  return cues.flatMap((cue) => {
    const text = cue.text.trim();
    if (
      !text
      || !Number.isFinite(cue.start)
      || !Number.isFinite(cue.end)
      || cue.end <= cue.start
    ) {
      return [];
    }
    const startTime = Math.round(Math.max(0, cue.start) * 1000);
    const endTime = Math.round(Math.max(0, cue.end) * 1000);
    const duration = Math.max(1, endTime - startTime);
    return [{
      trackNumber,
      text,
      startTime,
      duration,
      codecID: 'S_TEXT/ASS' as const,
      extraData: {
        readorder: '0',
        layer: '0',
        style: 'Default',
        name: '',
        marginl: '0',
        marginr: '0',
        marginv: '0',
        effect: '',
      },
    }];
  });
}

function resumeText(value: unknown, max = 1200): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function videoCoreResumeKey(source: VideoCoreResumeSource): string {
  const localFilePath = resumeText(source.localFilePath)
    .replace(/\\/g, '/')
    .toLocaleLowerCase('en-US');
  if (localFilePath) return `file:${localFilePath}`;
  if (Number.isFinite(source.mediaId)) {
    const episode = Number.isFinite(source.episodeNumber)
      ? `:episode:${Math.round(source.episodeNumber as number)}`
      : '';
    return `media:${Math.round(source.mediaId as number)}${episode}`;
  }
  const streamPath = resumeText(source.streamPath);
  if (streamPath) return `stream:${streamPath}`;
  const playbackId = resumeText(source.playbackId, 240);
  return playbackId ? `playback:${playbackId}` : '';
}

export function normalizeVideoCoreResumePositions(
  value: unknown,
): VideoCoreResumePosition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-VIDEO_CORE_RESUME_LIMIT).flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const raw = item as Partial<VideoCoreResumePosition>;
    const key = resumeText(raw.key);
    if (
      !key
      || typeof raw.positionSec !== 'number'
      || !Number.isFinite(raw.positionSec)
      || typeof raw.updatedAt !== 'number'
      || !Number.isFinite(raw.updatedAt)
    ) return [];
    return [{
      key,
      positionSec: Math.max(0, Math.min(86_400, raw.positionSec)),
      updatedAt: Math.max(0, Math.round(raw.updatedAt)),
    }];
  });
}

export function upsertVideoCoreResumePosition(
  positions: readonly VideoCoreResumePosition[],
  entry: VideoCoreResumePosition,
): VideoCoreResumePosition[] {
  const normalized = normalizeVideoCoreResumePositions([entry])[0];
  if (!normalized) return normalizeVideoCoreResumePositions(positions);
  return [
    ...normalizeVideoCoreResumePositions(positions)
      .filter((position) => position.key !== normalized.key),
    normalized,
  ].slice(-VIDEO_CORE_RESUME_LIMIT);
}

export function resolveVideoCoreResumePosition(
  positions: readonly VideoCoreResumePosition[],
  key: string,
  durationSec?: number,
): number {
  const entry = normalizeVideoCoreResumePositions(positions)
    .find((position) => position.key === key);
  if (!entry || entry.positionSec < 1) return 0;
  if (
    typeof durationSec === 'number'
    && Number.isFinite(durationSec)
    && durationSec > 0
    && entry.positionSec >= durationSec - 5
  ) return 0;
  return entry.positionSec;
}

export function adjacentStudyCue(
  cues: readonly VideoCoreStudyCue[],
  currentSourceTimeMs: number,
  direction: -1 | 1,
): VideoCoreStudyCue | null {
  if (!cues.length) return null;
  let currentIndex = -1;
  for (let index = 0; index < cues.length; index += 1) {
    if (cues[index].startMs <= currentSourceTimeMs + 50) currentIndex = index;
    else break;
  }
  const target = Math.min(
    Math.max(currentIndex + direction, 0),
    cues.length - 1,
  );
  return cues[target] ?? null;
}

export function resolveStudyLoopSeekSec(
  currentTimeSec: number,
  activeCue: VideoCoreStudyCue | null,
  subtitleDelaySec: number,
  loop: VideoCoreStudyLoopState,
): number | null {
  if (
    loop.abLoop
    && loop.abStartSec != null
    && loop.abEndSec != null
    && loop.abEndSec > loop.abStartSec
    && currentTimeSec >= loop.abEndSec - 0.04
  ) {
    return loop.abStartSec;
  }
  if (
    loop.lineLoop
    && activeCue
    && currentTimeSec >= cuePlaybackEndSec(activeCue, subtitleDelaySec) - 0.04
  ) {
    return cuePlaybackStartSec(activeCue, subtitleDelaySec);
  }
  return null;
}

export function isCueEndTransition(
  currentTimeSec: number,
  cue: VideoCoreStudyCue,
  subtitleDelaySec: number,
  toleranceSec = 0.5,
): boolean {
  const end = cuePlaybackEndSec(cue, subtitleDelaySec);
  return currentTimeSec >= end - 0.3 && currentTimeSec <= end + toleranceSec;
}

/**
 * Study cues for a track the player renders but never *indexes*.
 *
 * `VideoCoreSubtitleManager` keeps two kinds of subtitle track and only one of them
 * reaches the study layer. An **event track** (the container's own muxed streams, and
 * anything mounted through `addEventTrack`/`onSubtitleEvents`) lands in the manager's
 * event cache, which is the only thing its cue index is built from. A **file track** —
 * every `playbackInfo.subtitleTracks` entry with `useLibassRenderer`, numbered from 1000
 * up — is handed to libass as ASS *text* and cached on the track, never as events. So
 * `getCues()` and `getActiveCues()` both return `[]` for it forever, and every study
 * surface downstream reads that as "this file has no subtitles": the cue line stays on
 * `Waiting for subtitle` while the very same lines are painted on the video by libass.
 *
 * The manager exposes the cached ASS through `getTrackContent(n)`, so the missing half is
 * a parse, not a fetch. `parseStudySubtitles` rather than `parseSubtitles` for the same
 * reason the external-mount path uses it: this is the PRIMARY study track, the one the
 * transcript, the analyser and every mined card read, so a dual-script `.ass` must not
 * feed its non-Japanese half into mining. That split is inert on `.srt`/`.vtt` and on any
 * single-script `.ass`, which is the common case here.
 *
 * Timing is normalised to the same `startMs`/`endMs` the event path produces, so
 * `activeStudyCuesAtTime` and every consumer of `VideoCoreStudyCue` work unchanged.
 */
export function studyCuesFromParsedCues(
  cues: readonly VideoCoreWhisperCue[],
  trackNumber: number,
): VideoCoreStudyCue[] {
  const usable: VideoCoreStudyCue[] = [];
  for (const cue of cues) {
    const text = cue.text.trim();
    if (
      !text
      || !Number.isFinite(cue.start)
      || !Number.isFinite(cue.end)
      || cue.end <= cue.start
    ) {
      continue;
    }
    usable.push({
      index: 0,
      trackNumber,
      text,
      startMs: Math.round(Math.max(0, cue.start) * 1000),
      endMs: Math.round(Math.max(0, cue.end) * 1000),
    });
  }
  usable.sort((left, right) => left.startMs - right.startMs);
  usable.forEach((cue, index) => { cue.index = index; });
  return usable;
}

/**
 * Whether two cue lists describe the same timeline.
 *
 * The subtitle manager hands back a freshly built array from every `getCues()`, and the
 * overlay calls it on `cuechange` — i.e. once per spoken line. So the whole-track list
 * arrives with a new identity, and new element identities, several times a minute while
 * nothing about it has changed. Everything downstream is memoized on that identity, so
 * every consumer redoes its full-track work at each cue boundary. Content equality is
 * what those consumers actually mean, and this is the only place that can say it.
 *
 * All five fields are compared rather than a cheap length-and-endpoints probe, because
 * the same setter also carries a genuine track SWAP: two tracks for one release have the
 * same cue count and near-identical timings, and a guard that missed that would leave the
 * transcript showing the previous language with no way to notice.
 *
 * O(n) over a few thousand numeric/string comparisons, against the tokenizer pass and the
 * full-list reconciliation it replaces.
 */
export function sameVideoCoreCueList(
  left: readonly VideoCoreStudyCue[],
  right: readonly VideoCoreStudyCue[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (
      a.index !== b.index
      || a.trackNumber !== b.trackNumber
      || a.startMs !== b.startMs
      || a.endMs !== b.endMs
      || a.text !== b.text
    ) {
      return false;
    }
  }
  return true;
}

/**
 * A `setState` updater that keeps the previous cue array when the new one says the same
 * thing. See `sameVideoCoreCueList`.
 *
 * An updater rather than a hook so the call sites stay plain `setState` calls with no new
 * dependency to thread through the effects that own the subtitle listeners.
 */
export function stableCueList<T extends VideoCoreStudyCue>(
  next: readonly T[],
): (current: readonly T[]) => T[] {
  return (current) => (sameVideoCoreCueList(current, next) ? (current as T[]) : (next as T[]));
}

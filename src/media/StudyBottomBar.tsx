/**
 * The adaptive bottom bar — what replaced `.study-control-dock`'s four flat rows.
 *
 * ## What was wrong with the dock
 *
 * It was one scroller holding ~35 controls in a box capped at `min(60%, 22rem)`, which
 * measured 644×69px of the subtitle line covered when expanded
 * (`videoStudyLayout.test.ts` records the collision). Worse than the geometry: a
 * checkbox labelled "Furigana" and a Whisper transcription pipeline sat in the same
 * visual row with the same weight.
 *
 * ## What this is
 *
 * Five task categories and a cue-loop cluster. Nothing else is on screen by default.
 * Each category opens ONE temporary `StudyToolSheet`, which closes on Escape or an
 * outside click and gives focus back.
 *
 * The cue cluster stays in the bar rather than moving into the Playback sheet, and that
 * is a deliberate exception to "five high-level controls": previous / replay / next
 * **line** is the study loop itself, pressed continuously, and burying the loop behind
 * a menu would be the one change that made the player worse to use. It is three buttons
 * rendered as one segmented control, not a row.
 *
 * ## Nothing was dropped
 *
 * Every control from the old dock is here, moved not retyped, with its handler and its
 * `data-study-action` / `data-study-pref` hook intact — those attributes are what the
 * dev harnesses and `videoMineShortcut.test.tsx` select on, and what proves the four
 * unbound toggle shortcuts do anything.
 */
import React from 'react';
import type { NormalizedTrackInfo } from '@/app/(main)/_features/video-core/video-core-subtitles';
import type { MKVParser_TrackInfo } from '../../vendor/seanime/generated/types';
import { WHISPER_MODEL_SPECS, type WhisperModelTier } from '../shared/whisperModels';
import type { WhisperDevice } from '../renderer/whisperSettings';
import {
  clampStudyPlaybackRate,
  nudgeSubtitlePosition,
  SECONDARY_SUB_LANG_LABELS,
  SECONDARY_SUB_LANGS,
  SECONDARY_SUB_SCALE_MAX,
  SECONDARY_SUB_SCALE_MIN,
  SUBTITLE_COLOR_PRESETS,
  SUBTITLE_FONT_CHOICES,
  SUBTITLE_OUTLINE_COLOR_PRESETS,
  SUBTITLE_POSITION_MAX,
  subtitleAppearanceIsDefault,
  toSubtitleFontChoice,
  VIDEO_FIT_MODES,
  type VideoCoreStudyPreferences,
  type VideoFitMode,
} from '../shared/videoCoreStudy';
import { useT } from '../renderer/i18n';
import { useStudyLanguage } from '../renderer/useStudyLanguage';
import {
  STUDY_LANG_NAME_KEY,
  STUDY_LANG_READING_AID_KEY,
  STUDY_LANG_SUBTITLES_KEY,
  STUDY_LANGS,
} from '../shared/studyLang';
import { useStudyWorkspace } from './StudyWorkspaceProvider';
import StudyToolSheet, { StudyToolGroup } from './StudyToolSheet';

const RATE_PRESETS = [0.5, 0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5] as const;

/** One enum over the two mutually exclusive stored booleans. */
export type PracticeMode = 'off' | 'dictation' | 'shadowing';

type Category = 'playback' | 'study' | 'practice' | 'more';

export interface StudyBottomBarProps {
  /**
   * Measured by the overlay and republished as `--study-dock-height`, exactly as the
   * retired dock was: the subtitle band is positioned against it, and CSS cannot ask an
   * element how tall it is.
   */
  barRef?: React.RefObject<HTMLDivElement | null>;

  /* cue loop */
  hasCues: boolean;
  hasActiveCue: boolean;
  /**
   * A sidecar subtitle mount is still in flight, so `hasCues: false` is not yet a verdict.
   * Optional so an existing caller keeps its behaviour; only the video overlay knows this.
   */
  subtitleLoading?: boolean;
  /** Save the current delay as the default for every episode of this series. */
  onApplyDelayToSeries?: () => void;
  /** Load a subtitle file from disk as the study track, from inside the player. */
  onImportSubtitleFile?: (file: File) => void;
  onPrevCue: () => void;
  onReplayCue: () => void;
  onNextCue: () => void;

  /* playback */
  video: HTMLVideoElement | null;
  preferences: VideoCoreStudyPreferences;
  updatePreference: <K extends keyof VideoCoreStudyPreferences>(
    key: K, value: VideoCoreStudyPreferences[K],
  ) => void;
  subtitleDelaySec: number;
  onChangeSubtitleDelay: (delta: number) => void;
  /** Back to 0 s, and forget this file's stored delay. Optional for older callers. */
  onResetSubtitleDelay?: () => void;
  /** Every subtitle-appearance preference back to its default (`resetSubtitleAppearance`). */
  onResetSubtitleAppearance?: () => void;
  /** Save the loaded subtitle track as a file. Absent while no track is loaded. */
  onExportSubtitles?: (format: 'srt' | 'vtt') => void;
  /**
   * The key a command is bound to right now (`''` when unbound), for tooltips. Passed in
   * rather than imported: the shortcut store pulls the music bus, which talks to the main
   * process at import, and this bar is imported by node-env tests for its pure helpers.
   */
  shortcutKeysFor?: (commandId: string) => string;

  /* study */
  pauseOnLookup: boolean;
  setPauseOnLookup: (value: boolean) => void;
  onTranslateLine: () => void;
  translationBusy: boolean;
  onMineCurrentLine: () => void;
  /**
   * "Make a sentence deck from this video". Absent where the playback has no
   * local file to cut audio from (a stream), so the button is not offered there.
   */
  onMakeSentenceDeck?: () => void;

  /* practice */
  practiceMode: PracticeMode;
  setPracticeMode: (mode: PracticeMode) => void;
  abStartSec: number | null;
  abEndSec: number | null;
  abLoop: boolean;
  onSetA: () => void;
  onSetB: () => void;
  onToggleAbLoop: (value: boolean) => void;
  onClearAb: () => void;

  /* tracks */
  tracks: readonly NormalizedTrackInfo[];
  selectedTrack: number | null;
  onSelectTrack: (trackNumber: number | null) => void;
  secondaryTrack: number | null;
  onSelectSecondaryTrack: (trackNumber: number | null) => void;
  secondaryTrackCandidates: readonly NormalizedTrackInfo[];
  trackLabelOf: (track: NormalizedTrackInfo) => string;
  audioTracks: readonly MKVParser_TrackInfo[];
  selectedAudioTrack: number | null;
  onSelectAudioTrack: (trackNumber: number) => void;

  /* generation */
  whisperDevice: WhisperDevice;
  onWhisperDeviceChange: (device: WhisperDevice) => void;
  whisperModel: WhisperModelTier;
  onWhisperModelChange: (tier: WhisperModelTier) => void;
  whisperLanguage: 'ja' | 'zh' | 'ru';
  onWhisperLanguageChange: (language: 'ja' | 'zh' | 'ru') => void;
  whisperBusy: boolean;
  whisperCanGenerate: boolean;
  whisperState: string;
  whisperMessage: string;
  whisperError: string;
  whisperProgress: number;
  onGenerateSubtitles: () => void;
  onStopGeneration: () => void;
}

/** What a study control needs before the user can act on it. */
export type CueRequirement = 'cues' | 'active-cue';

/**
 * The i18n key explaining why a cue-dependent control is disabled, or `null` when it is not.
 *
 * Exported and pure so the decision can be tested without mounting the bar, which needs the
 * whole study-workspace context. The three strings already exist and already say the right
 * thing in all four languages, so this invents no copy.
 *
 * `loading` is the third state and it exists because the other two were a lie for 39
 * seconds. Measured live 2026-09-07 on `The Big O - 13`, whose Jimaku sidecar holds 261
 * cues: from clicking the episode to these controls becoming usable was **38,839 ms**
 * (the element alone needed 32,742 ms to reach `readyState >= 3`), and for that whole
 * window `hasCues` was false, so every one of them said "No subtitle track is loaded."
 * about a track that was on disk, advertised by the library card, and arriving. A wait
 * the app is honest about costs the user nothing; an assertion that their file has no
 * subtitles sends them off to generate one they already have.
 */
export function cueControlTitleKey(
  needs: CueRequirement,
  hasCues: boolean,
  hasActiveCue: boolean,
  loading = false,
):
  | 'mediaWorkspace.study.transcriptEmpty'
  | 'mediaWorkspace.study.waitingSubtitle'
  | 'common.loading'
  | null {
  const blocked = needs === 'cues' ? !hasCues : !hasActiveCue;
  if (!blocked) return null;
  // Order matters: "still arriving" outranks both verdicts below, because neither of them
  // is knowable yet. Only once the mount has resolved is "no track" a fact.
  if (!hasCues && loading) return 'common.loading';
  // "No track" is something the user must act on; "between lines" resolves on its own.
  return hasCues
    ? 'mediaWorkspace.study.waitingSubtitle'
    : 'mediaWorkspace.study.transcriptEmpty';
}

/**
 * One colour setting: "Default", the preset swatches, and a picker for any other colour.
 *
 * Buttons rather than a `<select>`: a colour is chosen by looking at it. `aria-pressed`
 * marks the current swatch; the picker shows the current colour even when it is a preset.
 */
export function SubtitleColorChoice({
  pref,
  labelKey,
  value,
  presets,
  fallback,
  onChange,
}: {
  pref: string;
  labelKey: string;
  value: string;
  presets: readonly string[];
  /** What `''` looks like, so the picker opens on the colour actually on screen. */
  fallback: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  const { t } = useT();
  const label = t(labelKey);
  return (
    <div
      className="study-tool-colors"
      role="group"
      aria-label={label}
      data-study-pref={pref}
      data-study-value={value || 'default'}
    >
      <span className="study-tool-colors-label">{label}</span>
      <button
        type="button"
        className="study-tool-swatch-default"
        aria-pressed={!value}
        onClick={() => onChange('')}
      >
        {t('mediaWorkspace.study.colorDefault')}
      </button>
      {presets.map((color) => (
        <button
          key={color}
          type="button"
          className="study-tool-swatch"
          data-color={color}
          aria-pressed={value === color}
          aria-label={label + ' ' + color}
          title={color}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
      <input
        type="color"
        className="study-tool-swatch-custom"
        aria-label={t('mediaWorkspace.study.colorCustomFor', { name: label })}
        title={t('mediaWorkspace.study.colorCustom')}
        value={value || fallback}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </div>
  );
}

export default function StudyBottomBar(props: StudyBottomBarProps): React.ReactElement {
  const { t } = useT();
  // The study line and its reading aid are named for the language studied:
  // "Chinese subtitles" and "Pinyin", not "Japanese subtitles" and "Furigana".
  const studyLang = useStudyLanguage().lang;
  const { doc, layout, idle, dispatch, trigger, isVisible, customizing } = useStudyWorkspace();
  const [open, setOpen] = React.useState<Category | null>(null);

  const {
    preferences, updatePreference, video, subtitleDelaySec, onChangeSubtitleDelay,
  } = props;

  /**
   * "Shortcut: X" for a bound command, nothing for an unbound one — read from the live
   * shortcut store, so a user who rebinds a key sees their key.
   */
  const { shortcutKeysFor } = props;
  const shortcutTitle = React.useCallback((commandId: string): string | undefined => {
    const keys = shortcutKeysFor?.(commandId) ?? '';
    return keys ? t('mediaWorkspace.study.shortcutHint', { key: keys }) : undefined;
  }, [shortcutKeysFor, t]);

  const movePosition = React.useCallback((direction: 1 | -1) => {
    const next = nudgeSubtitlePosition(preferences, direction);
    updatePreference('subtitlePosition', next.subtitlePosition);
    updatePreference('subtitleAtTop', next.subtitleAtTop);
  }, [preferences, updatePreference]);

  const toggle = React.useCallback((category: Category) => {
    setOpen((current) => (current === category ? null : category));
  }, []);
  const close = React.useCallback(() => setOpen(null), []);

  /*
    The title a cue-dependent control carries, and why a shortcut hint is the wrong thing
    to say while it is disabled.

    Measured 2026-09-03 on a real clip with no subtitle track: category 8's harness counted
    THREE mute pairs on this bar -- `Previous line`, `Replay line` and `Next line`, all
    disabled, all explaining only `Shortcut: W/R/S`. A key that also does nothing is not a
    reason, so the user is told which button is dead and nothing about why. `Translate line`
    and `Mine` are the same defect one layer worse: disabled on the same condition with no
    title at all.

    Both reasons already exist as translated strings and say exactly the right thing, so
    nothing new is invented here: `transcriptEmpty` ("No subtitle track is loaded.") for a
    file with no cues, and `waitingSubtitle` -- the words the overlay itself shows in that
    state -- for a file that HAS cues while playback sits between two of them. Keeping the
    two apart matters: "no track" is something the user must act on, "between lines" resolves
    on its own in a second.
  */
  const cueTitle = React.useCallback((
    needs: CueRequirement,
    shortcutKey?: string,
  ): string | undefined => {
    const key = cueControlTitleKey(
      needs,
      props.hasCues,
      props.hasActiveCue,
      props.subtitleLoading,
    );
    if (key) return t(key);
    return shortcutKey
      ? t('mediaWorkspace.study.shortcutHint', { key: shortcutKey })
      : undefined;
  }, [props.hasCues, props.hasActiveCue, props.subtitleLoading, t]);

  /*
    Immersion shows the bar only while the pointer is awake, and never a sheet.
    "All study features remain one action away" is satisfied by the command palette and
    the shortcuts, which is what makes it safe to take the chrome away entirely here.
  */
  const immersion = layout.mode === 'immersion';
  const hidden = immersion && idle && !open && !customizing;

  /** The AI category is not a sheet: it opens a real block. */
  const openAi = React.useCallback(() => {
    close();
    if (isVisible('aiWorkspace')) {
      dispatch({ type: 'close-block', blockId: 'aiWorkspace' });
      return;
    }
    trigger('sentence-select');
    dispatch({ type: 'open-block', blockId: 'aiWorkspace' });
  }, [close, dispatch, isVisible, trigger]);

  const sheetId = open ? `study-sheet-${open}` : undefined;

  return (
    <div
      ref={props.barRef}
      className="study-bar-layer"
      data-study-bar-hidden={hidden ? 'true' : 'false'}
      data-study-sheet-open={open ?? 'none'}
    >
      {open === 'playback' && (
        <StudyToolSheet id="study-sheet-playback" titleKey="studyWorkspace.bar.playback" onClose={close}>
          <StudyToolGroup labelKey="studyWorkspace.group.transport">
            <label title={shortcutTitle('video.cycleVideoFit')}>
              {t('mediaWorkspace.study.videoFit')}
              <select
                value={preferences.videoFit}
                data-study-pref="videoFit"
                aria-label={t('mediaWorkspace.study.videoFit')}
                onChange={(event) => updatePreference('videoFit', event.currentTarget.value as VideoFitMode)}
              >
                {VIDEO_FIT_MODES.map((mode) => (
                  <option key={mode} value={mode}>{t(`mediaWorkspace.study.videoFit.${mode}`)}</option>
                ))}
              </select>
            </label>
            <label>
              {t('mediaWorkspace.study.playbackSpeed')}
              <select
                value={preferences.playbackRate}
                aria-label={t('mediaWorkspace.study.playbackSpeed')}
                onChange={(event) => updatePreference(
                  'playbackRate',
                  clampStudyPlaybackRate(Number(event.currentTarget.value)),
                )}
              >
                {RATE_PRESETS.map((rate) => (
                  <option key={rate} value={rate}>{rate.toFixed(2)}x</option>
                ))}
              </select>
            </label>
            <div className="study-tool-cluster" role="group" aria-label={t('mediaWorkspace.study.frameStep')}>
              <button
                type="button"
                disabled={!video}
                onClick={() => {
                  if (!video) return;
                  video.pause();
                  video.currentTime = Math.max(0, video.currentTime - 1 / 30);
                }}
              >
                {t('mediaWorkspace.study.frameBack')}
              </button>
              <button
                type="button"
                disabled={!video}
                onClick={() => {
                  if (!video) return;
                  video.pause();
                  video.currentTime = Math.min(
                    Number.isFinite(video.duration) ? video.duration : Number.MAX_SAFE_INTEGER,
                    video.currentTime + 1 / 30,
                  );
                }}
              >
                {t('mediaWorkspace.study.frameForward')}
              </button>
            </div>
            <label className="study-tool-slider">
              {t('mediaWorkspace.study.seekStep')}
              <input
                type="range"
                min={1}
                max={60}
                value={preferences.seekStepSec}
                onChange={(event) => updatePreference('seekStepSec', Number(event.currentTarget.value))}
                aria-label={t('mediaWorkspace.study.seekStep')}
              />
              <span>{t('mediaWorkspace.study.seekStepValue', { seconds: preferences.seekStepSec })}</span>
            </label>
          </StudyToolGroup>

          <StudyToolGroup labelKey="studyWorkspace.group.timing">
            <div className="study-tool-cluster" role="group" aria-label={t('mediaWorkspace.study.subtitleOffset')}>
              <button
                type="button"
                title={shortcutTitle('video.subEarlier')}
                onClick={() => onChangeSubtitleDelay(-0.1)}
              >
                {t('mediaWorkspace.study.subsOffsetStep', { amount: '−0.1' })}
              </button>
              <output aria-label={t('mediaWorkspace.study.subtitleOffset')} aria-live="polite">
                {subtitleDelaySec >= 0 ? '+' : ''}{subtitleDelaySec.toFixed(1)}s
              </output>
              <button
                type="button"
                title={shortcutTitle('video.subLater')}
                onClick={() => onChangeSubtitleDelay(0.1)}
              >
                {t('mediaWorkspace.study.subsOffsetStep', { amount: '+0.1' })}
              </button>
            </div>
            {props.onResetSubtitleDelay && (
              <button
                type="button"
                data-study-action="reset-subtitle-delay"
                disabled={subtitleDelaySec === 0}
                title={shortcutTitle('video.subDelayReset')}
                onClick={props.onResetSubtitleDelay}
              >
                {t('mediaWorkspace.study.resetSubtitleDelay')}
              </button>
            )}
            {props.onApplyDelayToSeries && (
              <button
                type="button"
                data-study-action="apply-delay-to-series"
                onClick={props.onApplyDelayToSeries}
              >
                {t('mediaWorkspace.study.applyDelayToSeries')}
              </button>
            )}
            <span className="study-tool-note">{t('mediaWorkspace.study.subtitleDelayPerFile')}</span>
          </StudyToolGroup>
        </StudyToolSheet>
      )}

      {open === 'study' && (
        <StudyToolSheet id="study-sheet-study" titleKey="studyWorkspace.bar.study" onClose={close}>
          <StudyToolGroup labelKey="studyWorkspace.group.reading">
            <label>
              <input
                type="checkbox"
                checked={preferences.primarySubs}
                onChange={(event) => updatePreference('primarySubs', event.currentTarget.checked)}
              /> {t(STUDY_LANG_SUBTITLES_KEY, { lang: t(STUDY_LANG_NAME_KEY[studyLang]) })}
            </label>
            <label title={shortcutTitle('video.toggleSubtitles')}>
              <input
                type="checkbox"
                data-study-pref="subtitlesHidden"
                checked={preferences.subtitlesHidden}
                onChange={(event) => updatePreference('subtitlesHidden', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.hideAllSubs')}
            </label>
            <label title={shortcutTitle('video.toggleDualSubs')}>
              <input
                type="checkbox"
                data-study-pref="dualSubs"
                checked={preferences.dualSubs}
                onChange={(event) => updatePreference('dualSubs', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.dualSubs')}
            </label>
            <label title={shortcutTitle('video.toggleFurigana')}>
              <input
                type="checkbox"
                data-study-pref="furigana"
                checked={preferences.furigana}
                onChange={(event) => updatePreference('furigana', event.currentTarget.checked)}
              /> {t(STUDY_LANG_READING_AID_KEY[studyLang])}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="grammarHighlight"
                checked={preferences.grammarHighlight}
                onChange={(event) => updatePreference('grammarHighlight', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.grammarHighlight')}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="knownHighlight"
                checked={preferences.knownHighlight}
                onChange={(event) => updatePreference('knownHighlight', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.knownHighlight')}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="lineLevel"
                checked={preferences.lineLevel}
                onChange={(event) => updatePreference('lineLevel', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.lineLevel')}
            </label>
          </StudyToolGroup>

          {props.onImportSubtitleFile && (
            <StudyToolGroup labelKey="mediaWorkspace.study.subtitleFileGroup">
              <label className="study-subtitle-import">
                {t('mediaWorkspace.study.importSubtitle')}
                <input
                  type="file"
                  accept=".srt,.ass,.ssa,.vtt,.sub,text/vtt"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = '';
                    if (file) props.onImportSubtitleFile?.(file);
                  }}
                />
              </label>
            </StudyToolGroup>
          )}

          <StudyToolGroup labelKey="studyWorkspace.group.lookup">
            <label>
              <input
                type="checkbox"
                checked={props.pauseOnLookup}
                onChange={(event) => props.setPauseOnLookup(event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.pauseOnLookup')}
            </label>
            <button
              type="button"
              disabled={!props.hasActiveCue || props.translationBusy}
              title={props.translationBusy
                ? t('mediaWorkspace.study.translating')
                : cueTitle('active-cue')}
              onClick={() => { props.onTranslateLine(); }}
            >
              {t(props.translationBusy
                ? 'mediaWorkspace.study.translating'
                : 'mediaWorkspace.study.translateLine')}
            </button>
          </StudyToolGroup>

          <StudyToolGroup labelKey="studyWorkspace.group.surfaces">
            {/* The transcript preference is still the source of truth for the block's
                presence, so the shortcut, the block menu and this box agree. */}
            <label>
              <input
                type="checkbox"
                data-study-pref="transcriptPanel"
                // What is on screen: the Transcript layout shows the rail with the
                // preference off, and an unticked box beside a visible rail is a lie.
                checked={preferences.transcriptPanel || isVisible('transcript')}
                onChange={(event) => {
                  updatePreference('transcriptPanel', event.currentTarget.checked);
                  if (event.currentTarget.checked) trigger('transcript-open');
                  else dispatch({ type: 'close-block', blockId: 'transcript' });
                }}
              /> {t('mediaWorkspace.study.transcript')}
            </label>
            <button
              type="button"
              data-study-action="mine-current-line"
              disabled={!props.hasActiveCue}
              title={cueTitle('active-cue')}
              onClick={() => {
                close();
                props.onMineCurrentLine();
              }}
            >
              {t('mediaWorkspace.mining.mine')}
            </button>
            {props.onMakeSentenceDeck && (
              <button
                type="button"
                data-study-action="sentence-deck"
                title={t('sentenceDeck.open.hint')}
                onClick={() => {
                  close();
                  props.onMakeSentenceDeck?.();
                }}
              >
                {t('sentenceDeck.open')}
              </button>
            )}
          </StudyToolGroup>
        </StudyToolSheet>
      )}

      {open === 'practice' && (
        <StudyToolSheet id="study-sheet-practice" titleKey="studyWorkspace.bar.practice" onClose={close}>
          <div className="study-tool-group" role="radiogroup" aria-label={t('mediaWorkspace.study.practiceMode')}>
            <span className="study-tool-group-legend">{t('mediaWorkspace.study.practiceMode')}</span>
            <div className="study-tool-group-body">
              {(['off', 'dictation', 'shadowing'] as const).map((mode) => (
                <label key={mode} className="study-control-mode">
                  <input
                    type="radio"
                    name="study-practice-mode"
                    value={mode}
                    checked={props.practiceMode === mode}
                    onChange={() => props.setPracticeMode(mode)}
                  />
                  {t(mode === 'off'
                    ? 'common.off'
                    : mode === 'dictation'
                      ? 'mediaWorkspace.study.dictation'
                      : 'mediaWorkspace.study.shadowing')}
                </label>
              ))}
            </div>
          </div>

          <StudyToolGroup labelKey="studyWorkspace.group.repetition">
            <label>
              <input
                type="checkbox"
                data-study-pref="autoPause"
                checked={preferences.autoPause}
                onChange={(event) => updatePreference('autoPause', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.autoPause')}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="loopLine"
                checked={preferences.loopLine}
                onChange={(event) => {
                  updatePreference('loopLine', event.currentTarget.checked);
                  if (event.currentTarget.checked) props.onToggleAbLoop(false);
                }}
              /> {t('mediaWorkspace.study.loopLine')}
            </label>
          </StudyToolGroup>

          <StudyToolGroup labelKey="mediaWorkspace.study.loopGroup">
            <button type="button" disabled={!video} onClick={props.onSetA}>
              A {props.abStartSec == null ? t('mediaWorkspace.study.set') : `${props.abStartSec.toFixed(2)}s`}
            </button>
            <button
              type="button"
              disabled={!video || props.abStartSec == null}
              onClick={props.onSetB}
            >
              B {props.abEndSec == null ? t('mediaWorkspace.study.set') : `${props.abEndSec.toFixed(2)}s`}
            </button>
            <label>
              <input
                type="checkbox"
                checked={props.abLoop}
                disabled={
                  props.abStartSec == null
                  || props.abEndSec == null
                  || props.abEndSec <= props.abStartSec
                }
                onChange={(event) => {
                  props.onToggleAbLoop(event.currentTarget.checked);
                  if (event.currentTarget.checked) updatePreference('loopLine', false);
                }}
              />
              {t('mediaWorkspace.study.abLoop')}
            </label>
            {(props.abStartSec != null || props.abEndSec != null) && (
              <button type="button" onClick={props.onClearAb}>
                {t('mediaWorkspace.study.clearAb')}
              </button>
            )}
          </StudyToolGroup>
        </StudyToolSheet>
      )}

      {open === 'more' && (
        <StudyToolSheet id="study-sheet-more" titleKey="studyWorkspace.bar.more" onClose={close}>
          <StudyToolGroup labelKey="mediaWorkspace.study.trackGroup">
            <label>
              {t('mediaWorkspace.study.subtitleTrack')}
              <select
                value={props.selectedTrack ?? ''}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  props.onSelectTrack(value ? Number(value) : null);
                }}
              >
                <option value="">{t('common.off')}</option>
                {props.tracks.map((track) => (
                  <option key={track.number} value={track.number}>
                    {props.trackLabelOf(track)}
                  </option>
                ))}
              </select>
            </label>

            <label
              title={preferences.dualSubs ? undefined : t('mediaWorkspace.study.secondaryNeedsDual')}
            >
              {t('mediaWorkspace.study.secondarySubs')}
              <select
                value={props.secondaryTrack ?? ''}
                disabled={!preferences.dualSubs}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  props.onSelectSecondaryTrack(value ? Number(value) : null);
                }}
              >
                <option value="">{t('common.off')}</option>
                {props.secondaryTrackCandidates.map((track) => (
                  <option key={track.number} value={track.number}>
                    {props.trackLabelOf(track)}
                  </option>
                ))}
              </select>
            </label>

            <label
              title={preferences.dualSubs ? undefined : t('mediaWorkspace.study.secondaryNeedsDual')}
            >
              {t('mediaWorkspace.study.secondaryLang')}
              <select
                data-study-pref="secondarySubLang"
                value={preferences.secondarySubLang}
                disabled={!preferences.dualSubs}
                onChange={(event) => updatePreference('secondarySubLang', event.currentTarget.value)}
              >
                {SECONDARY_SUB_LANGS.map((code) => (
                  <option key={code} value={code}>{SECONDARY_SUB_LANG_LABELS[code]}</option>
                ))}
              </select>
            </label>

            {!!props.audioTracks.length && (
              <label>
                {t('mediaWorkspace.study.audioTrack')}
                <select
                  value={props.selectedAudioTrack ?? ''}
                  onChange={(event) => props.onSelectAudioTrack(Number(event.currentTarget.value))}
                >
                  {props.audioTracks.map((track) => (
                    <option key={track.number} value={track.number}>
                      {track.name
                        || track.language
                        || t('mediaWorkspace.study.track', { number: track.number })}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </StudyToolGroup>

          <StudyToolGroup labelKey="mediaWorkspace.study.subtitleAppearanceGroup">
            <label className="study-tool-slider">
              {t('mediaWorkspace.study.subtitleFontSize')}
              <input
                type="range"
                min={16}
                max={48}
                value={preferences.subtitleFontSize}
                onChange={(event) => updatePreference('subtitleFontSize', Number(event.currentTarget.value))}
                aria-label={t('mediaWorkspace.study.subtitleFontSize')}
              />
              <span>
                {t('mediaWorkspace.study.subtitleFontSizeValue', { size: preferences.subtitleFontSize })}
              </span>
            </label>
            <label className="study-tool-slider">
              {t('mediaWorkspace.study.subtitleBgOpacity')}
              <input
                type="range"
                min={0}
                max={90}
                value={preferences.subtitleBgOpacity}
                onChange={(event) => updatePreference('subtitleBgOpacity', Number(event.currentTarget.value))}
                aria-label={t('mediaWorkspace.study.subtitleBgOpacity')}
              />
              <span>{preferences.subtitleBgOpacity}%</span>
            </label>
            <label>
              {t('mediaWorkspace.study.subtitleFont')}
              <select
                data-study-pref="subtitleFontFamily"
                value={preferences.subtitleFontFamily}
                onChange={(event) => updatePreference(
                  'subtitleFontFamily',
                  toSubtitleFontChoice(event.currentTarget.value),
                )}
                aria-label={t('mediaWorkspace.study.subtitleFont')}
              >
                {SUBTITLE_FONT_CHOICES.map((choice) => (
                  <option key={choice} value={choice}>
                    {t(`mediaWorkspace.study.subtitleFont.${choice}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="study-tool-slider">
              {t('mediaWorkspace.study.subtitleWeight')}
              <input
                type="range"
                min={400}
                max={800}
                step={100}
                value={preferences.subtitleFontWeight}
                onChange={(event) => updatePreference('subtitleFontWeight', Number(event.currentTarget.value))}
                aria-label={t('mediaWorkspace.study.subtitleWeight')}
              />
              <span>{preferences.subtitleFontWeight}</span>
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="subtitleOutline"
                checked={preferences.subtitleOutline}
                onChange={(event) => updatePreference('subtitleOutline', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.subtitleOutline')}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="cueTimingReadout"
                checked={preferences.cueTimingReadout}
                onChange={(event) => updatePreference('cueTimingReadout', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.cueTimingReadout')}
            </label>
            <SubtitleColorChoice
              pref="subtitleColor"
              labelKey="mediaWorkspace.study.subtitleColor"
              value={preferences.subtitleColor}
              presets={SUBTITLE_COLOR_PRESETS}
              fallback="#f5f4f7"
              onChange={(value) => updatePreference('subtitleColor', value)}
            />
            <SubtitleColorChoice
              pref="subtitleOutlineColor"
              labelKey="mediaWorkspace.study.subtitleOutlineColor"
              value={preferences.subtitleOutlineColor}
              presets={SUBTITLE_OUTLINE_COLOR_PRESETS}
              fallback="#000000"
              onChange={(value) => updatePreference('subtitleOutlineColor', value)}
            />
          </StudyToolGroup>

          <StudyToolGroup labelKey="mediaWorkspace.study.subtitlePlacementGroup">
            <label
              className="study-tool-slider"
              title={[shortcutTitle('video.subPositionUp'), shortcutTitle('video.subPositionDown')]
                .filter(Boolean).join(' / ') || undefined}
            >
              {t('mediaWorkspace.study.subtitlePosition')}
              <input
                type="range"
                min={0}
                max={SUBTITLE_POSITION_MAX}
                data-study-pref="subtitlePosition"
                value={preferences.subtitlePosition}
                disabled={preferences.subtitleAtTop}
                onChange={(event) => updatePreference('subtitlePosition', Number(event.currentTarget.value))}
                aria-label={t('mediaWorkspace.study.subtitlePosition')}
              />
              <span>{preferences.subtitlePosition}%</span>
            </label>
            <div className="study-tool-cluster" role="group" aria-label={t('mediaWorkspace.study.subtitlePosition')}>
              <button
                type="button"
                data-study-action="subtitle-position-down"
                title={shortcutTitle('video.subPositionDown')}
                disabled={!preferences.subtitleAtTop && preferences.subtitlePosition === 0}
                onClick={() => movePosition(-1)}
              >
                {t('mediaWorkspace.study.subtitleLower')}
              </button>
              <button
                type="button"
                data-study-action="subtitle-position-up"
                title={shortcutTitle('video.subPositionUp')}
                disabled={preferences.subtitleAtTop}
                onClick={() => movePosition(1)}
              >
                {t('mediaWorkspace.study.subtitleHigher')}
              </button>
            </div>
            <label>
              <input
                type="checkbox"
                data-study-pref="subtitleAtTop"
                checked={preferences.subtitleAtTop}
                onChange={(event) => updatePreference('subtitleAtTop', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.subtitleAtTop')}
            </label>
          </StudyToolGroup>

          <StudyToolGroup labelKey="mediaWorkspace.study.secondLineGroup">
            <label className="study-tool-slider">
              {t('mediaWorkspace.study.secondarySubScale')}
              <input
                type="range"
                min={SECONDARY_SUB_SCALE_MIN}
                max={SECONDARY_SUB_SCALE_MAX}
                step={5}
                data-study-pref="secondarySubScale"
                value={preferences.secondarySubScale}
                onChange={(event) => updatePreference('secondarySubScale', Number(event.currentTarget.value))}
                aria-label={t('mediaWorkspace.study.secondarySubScale')}
              />
              <span>{preferences.secondarySubScale}%</span>
            </label>
            <SubtitleColorChoice
              pref="secondarySubColor"
              labelKey="mediaWorkspace.study.secondarySubColor"
              value={preferences.secondarySubColor}
              presets={SUBTITLE_COLOR_PRESETS}
              fallback="#e1e7ff"
              onChange={(value) => updatePreference('secondarySubColor', value)}
            />
            {props.onResetSubtitleAppearance && (
              <button
                type="button"
                data-study-action="reset-subtitle-appearance"
                disabled={subtitleAppearanceIsDefault(preferences)}
                onClick={props.onResetSubtitleAppearance}
              >
                {t('mediaWorkspace.study.resetSubtitleAppearance')}
              </button>
            )}
            {props.onExportSubtitles && (
              <span className="study-subtitle-export">
                <button type="button" data-study-action="export-subtitles-srt" onClick={() => props.onExportSubtitles?.('srt')}>
                  {t('mediaWorkspace.study.exportSubtitlesSrt')}
                </button>
                <button type="button" data-study-action="export-subtitles-vtt" onClick={() => props.onExportSubtitles?.('vtt')}>
                  {t('mediaWorkspace.study.exportSubtitlesVtt')}
                </button>
              </span>
            )}
          </StudyToolGroup>

          <div
            className="study-tool-group study-whisper-controls"
            role="group"
            aria-label={t('mediaWorkspace.study.whisperGroup')}
          >
            <span className="study-tool-group-legend">{t('mediaWorkspace.study.whisperGroup')}</span>
            <div className="study-tool-group-body">
              <label>
                {t('mediaWorkspace.study.whisperDevice')}
                <select
                  aria-label={t('mediaWorkspace.study.whisperDevice')}
                  value={props.whisperDevice}
                  disabled={props.whisperBusy}
                  onChange={(event) => props.onWhisperDeviceChange(
                    event.currentTarget.value as WhisperDevice,
                  )}
                >
                  <option value="auto">{t('mediaWorkspace.study.autoGpuCpu')}</option>
                  <option value="cpu">{t('mediaWorkspace.study.cpu')}</option>
                </select>
              </label>
              <label>
                {t('mediaWorkspace.study.whisperModel')}
                <select
                  aria-label={t('mediaWorkspace.study.whisperModel')}
                  value={props.whisperModel}
                  disabled={props.whisperBusy}
                  onChange={(event) => props.onWhisperModelChange(
                    event.currentTarget.value as WhisperModelTier,
                  )}
                >
                  {WHISPER_MODEL_SPECS.map((model) => (
                    <option key={model.id} value={model.id}>{model.id}</option>
                  ))}
                </select>
              </label>
              <label>
                {t('mediaWorkspace.study.transcriptionLanguage')}
                <select
                  aria-label={t('mediaWorkspace.study.transcriptionLanguage')}
                  value={props.whisperLanguage}
                  disabled={props.whisperBusy}
                  onChange={(event) => props.onWhisperLanguageChange(
                    event.currentTarget.value as 'ja' | 'zh' | 'ru',
                  )}
                >
                  {STUDY_LANGS.map((code) => (
                    <option key={code} value={code}>{t(STUDY_LANG_NAME_KEY[code])}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={props.whisperBusy || !props.whisperCanGenerate}
                onClick={props.onGenerateSubtitles}
              >
                {t('mediaWorkspace.study.generateSubs')}
              </button>
              {props.whisperBusy && (
                <button type="button" onClick={props.onStopGeneration}>
                  {t('mediaWorkspace.study.stopGeneration')}
                </button>
              )}
              <output
                className={props.whisperState === 'error' ? 'study-whisper-error' : ''}
                aria-label={t('mediaWorkspace.study.whisperStatus')}
                aria-live="polite"
              >
                {props.whisperError
                  || props.whisperMessage
                  || t('mediaWorkspace.study.deviceStatus', { device: props.whisperDevice })}
              </output>
              {props.whisperBusy && (
                <progress
                  aria-label={t('mediaWorkspace.study.whisperProgress')}
                  max={1}
                  value={props.whisperProgress}
                />
              )}
            </div>
          </div>

          <StudyToolGroup labelKey="studyWorkspace.group.workspace">
            <button
              type="button"
              data-study-action="customize-workspace"
              onClick={() => {
                close();
                dispatch({ type: 'set-customizing', customizing: true });
              }}
            >
              {t('studyWorkspace.customize')}
            </button>
            <button
              type="button"
              data-study-action="reset-workspace"
              onClick={() => dispatch({ type: 'reset-workspace', workspaceId: layout.workspaceId })}
            >
              {t('studyWorkspace.resetLayout')}
            </button>
          </StudyToolGroup>
        </StudyToolSheet>
      )}

      <nav
        className="study-bar"
        aria-label={t('mediaWorkspace.study.controls')}
        data-study-controls={open ? 'expanded' : 'collapsed'}
      >
        {/* The study loop. See the header for why these three stay in the bar. */}
        {!immersion && (
          <div
            className="study-bar-cluster study-bar-loop"
            role="group"
            aria-label={t('mediaWorkspace.study.cueNavigation')}
          >
            <button
              type="button"
              data-study-action="previous-cue"
              disabled={!props.hasCues}
              title={cueTitle('cues', 'W')}
              onClick={props.onPrevCue}
            >
              {t('mediaWorkspace.study.previousLine')}
            </button>
            <button
              type="button"
              data-study-action="replay-cue"
              disabled={!props.hasActiveCue}
              title={cueTitle('active-cue', 'R')}
              onClick={props.onReplayCue}
            >
              {t('mediaWorkspace.study.replayLine')}
            </button>
            <button
              type="button"
              data-study-action="next-cue"
              disabled={!props.hasCues}
              title={cueTitle('cues', 'S')}
              onClick={props.onNextCue}
            >
              {t('mediaWorkspace.study.nextLine')}
            </button>
          </div>
        )}

        <div className="study-bar-categories">
          {/*
            The compact workspace switcher — one of the five things Watch Mode shows by
            default. A native select rather than a custom menu: it is the smallest
            control that is keyboard-operable, screen-reader-labelled and does not need
            its own popover lifecycle beside four that already exist.
          */}
          {/* Named on screen: "Watch ▾" alone read as a fifth category beside Playback,
              Study, Practice and AI, not as the choice of layout it is (audit 2026-09-23). */}
          <span className="study-bar-workspace-label" aria-hidden="true">
            {t('studyWorkspace.layoutLabel')}
          </span>
          <select
            className="study-bar-workspace"
            data-study-action="switch-workspace"
            aria-label={t('studyWorkspace.layoutLabel')}
            value={doc.activeWorkspaceId}
            onChange={(event) => {
              close();
              dispatch({ type: 'switch-workspace', workspaceId: event.currentTarget.value });
            }}
          >
            {/* The built-in Review layout drew the same screen as Watch minus the card and
                shared its name with the host's Review tab, so it is not offered — only kept
                reachable for a document that already has it active. */}
            {doc.workspaces.filter((entry) => (
              entry.id !== 'review' || doc.activeWorkspaceId === 'review'
            )).map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name ?? (entry.nameKey ? t(entry.nameKey) : entry.id)}
              </option>
            ))}
          </select>
          {(['playback', 'study', 'practice'] as const).map((category) => (
            <button
              key={category}
              type="button"
              className="study-bar-category"
              data-study-sheet-toggle={category}
              data-study-category={category}
              aria-expanded={open === category}
              aria-controls={open === category ? sheetId : undefined}
              onClick={() => toggle(category)}
            >
              {t(`studyWorkspace.bar.${category}`)}
            </button>
          ))}
          <button
            type="button"
            className="study-bar-category"
            data-study-category="ai"
            aria-pressed={isVisible('aiWorkspace')}
            onClick={openAi}
          >
            {t('studyWorkspace.bar.ai')}
          </button>
          <button
            type="button"
            className="study-bar-category"
            /* Kept from the retired dock so the harnesses' selector still resolves. */
            data-study-action="toggle-study-controls"
            data-study-sheet-toggle="more"
            data-study-category="more"
            aria-expanded={open === 'more'}
            aria-controls={open === 'more' ? sheetId : undefined}
            onClick={() => toggle('more')}
          >
            {t('studyWorkspace.bar.more')}
          </button>
        </div>
      </nav>
    </div>
  );
}

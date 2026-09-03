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
  SECONDARY_SUB_LANG_LABELS,
  SECONDARY_SUB_LANGS,
  SUBTITLE_FONT_CHOICES,
  toSubtitleFontChoice,
  type VideoCoreStudyPreferences,
} from '../shared/videoCoreStudy';
import { useT } from '../renderer/i18n';
import { useStudyWorkspace } from './StudyWorkspaceProvider';
import StudyToolSheet, { StudyToolGroup } from './StudyToolSheet';

const RATE_PRESETS = [0.7, 0.75, 0.85, 0.9, 1, 1.25, 1.5] as const;

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

  /* study */
  pauseOnLookup: boolean;
  setPauseOnLookup: (value: boolean) => void;
  onTranslateLine: () => void;
  translationBusy: boolean;
  onMineCurrentLine: () => void;

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
  whisperLanguage: 'ja' | 'zh';
  onWhisperLanguageChange: (language: 'ja' | 'zh') => void;
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
 * whole study-workspace context. The two strings already exist and already say the right
 * thing in all four languages, so this invents no copy.
 */
export function cueControlTitleKey(
  needs: CueRequirement,
  hasCues: boolean,
  hasActiveCue: boolean,
): 'mediaWorkspace.study.transcriptEmpty' | 'mediaWorkspace.study.waitingSubtitle' | null {
  const blocked = needs === 'cues' ? !hasCues : !hasActiveCue;
  if (!blocked) return null;
  // "No track" is something the user must act on; "between lines" resolves on its own.
  return hasCues
    ? 'mediaWorkspace.study.waitingSubtitle'
    : 'mediaWorkspace.study.transcriptEmpty';
}

export default function StudyBottomBar(props: StudyBottomBarProps): React.ReactElement {
  const { t } = useT();
  const { doc, layout, idle, dispatch, trigger, isVisible, customizing } = useStudyWorkspace();
  const [open, setOpen] = React.useState<Category | null>(null);

  const {
    preferences, updatePreference, video, subtitleDelaySec, onChangeSubtitleDelay,
  } = props;

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
    const key = cueControlTitleKey(needs, props.hasCues, props.hasActiveCue);
    if (key) return t(key);
    return shortcutKey
      ? t('mediaWorkspace.study.shortcutHint', { key: shortcutKey })
      : undefined;
  }, [props.hasCues, props.hasActiveCue, t]);

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
                title={t('mediaWorkspace.study.shortcutHint', { key: ';' })}
                onClick={() => onChangeSubtitleDelay(-0.1)}
              >
                {t('mediaWorkspace.study.subsOffsetStep', { amount: '−0.1' })}
              </button>
              <output aria-label={t('mediaWorkspace.study.subtitleOffset')} aria-live="polite">
                {subtitleDelaySec >= 0 ? '+' : ''}{subtitleDelaySec.toFixed(1)}s
              </output>
              <button
                type="button"
                title={t('mediaWorkspace.study.shortcutHint', { key: "'" })}
                onClick={() => onChangeSubtitleDelay(0.1)}
              >
                {t('mediaWorkspace.study.subsOffsetStep', { amount: '+0.1' })}
              </button>
            </div>
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
              /> {t('mediaWorkspace.study.japaneseSubs')}
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.dualSubs}
                onChange={(event) => updatePreference('dualSubs', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.dualSubs')}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="furigana"
                checked={preferences.furigana}
                onChange={(event) => updatePreference('furigana', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.furigana')}
            </label>
            <label>
              <input
                type="checkbox"
                data-study-pref="grammarHighlight"
                checked={preferences.grammarHighlight}
                onChange={(event) => updatePreference('grammarHighlight', event.currentTarget.checked)}
              /> {t('mediaWorkspace.study.grammarHighlight')}
            </label>
          </StudyToolGroup>

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
                checked={preferences.transcriptPanel}
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
                    event.currentTarget.value as 'ja' | 'zh',
                  )}
                >
                  <option value="ja">{t('mediaCenter.settings.japanese')}</option>
                  <option value="zh">{t('mediaCenter.settings.chinese')}</option>
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
          <select
            className="study-bar-workspace"
            data-study-action="switch-workspace"
            aria-label={t('studyWorkspace.workspaces')}
            value={doc.activeWorkspaceId}
            onChange={(event) => {
              close();
              dispatch({ type: 'switch-workspace', workspaceId: event.currentTarget.value });
            }}
          >
            {doc.workspaces.map((entry) => (
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

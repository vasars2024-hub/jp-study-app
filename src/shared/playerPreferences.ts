export type SubtitleVerticalPosition = 'top' | 'center' | 'bottom';

export interface PlayerPreferences {
  playbackRate: number;
  autoPause: boolean;
  loopLine: boolean;
  furigana: boolean;
  primarySubs: boolean;
  dualSubs: boolean;
  dictationMode: boolean;
  shadowingMode: boolean;
  volumeNormalization: boolean;
  preferredAudioLanguage: string;
  subtitleFontSize: number;
  subtitlePosition: SubtitleVerticalPosition;
  /** Render cues as an overlay on top of the video instead of only in the bar below. */
  subtitleOverlay: boolean;
  /** Opacity (0–80 %) of the dark backing behind overlay cues. */
  subtitleOverlayBackground: number;
}

export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  playbackRate: 1,
  autoPause: false,
  loopLine: false,
  furigana: false,
  primarySubs: true,
  dualSubs: true,
  dictationMode: false,
  shadowingMode: false,
  volumeNormalization: false,
  preferredAudioLanguage: '',
  subtitleFontSize: 26,
  subtitlePosition: 'center',
  subtitleOverlay: true,
  subtitleOverlayBackground: 35,
};

/**
 * What to persist for a key that has a second owner with a wider schema. Audit item 6.2.
 *
 * `jp-media-player-preferences-v1` is written by this player *and* by the VideoCore study
 * overlay, which declares the same literal under its own constant in `shared/videoCoreStudy.ts`.
 * The schemas overlap but are not equal: nine fields — `subtitleBgOpacity`,
 * `subtitleFontFamily`, `subtitleFontWeight`, `subtitleOutline`, `cueTimingReadout`,
 * `secondarySubLang`, `grammarHighlight`, `seekStepSec`, `transcriptPanel` — exist only on the
 * overlay's type.
 *
 * `normalizeVideoCoreStudyPreferences` returns `{ ...raw, ...normalized }`, so the overlay
 * already preserves this player's fields. `normalizePlayerPreferences` returns a fixed
 * 14-field object, so this player erased all nine of the overlay's. The asymmetry is the whole
 * defect; this restores it. Both readers normalize on load, so carrying the other owner's
 * fields through is inert for this player and load-bearing for the other.
 */
export function mergeStoredPlayerPreferences(
  stored: unknown,
  next: PlayerPreferences,
): Record<string, unknown> {
  const base = stored && typeof stored === 'object' && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {};
  return { ...base, ...next };
}

export function normalizePlayerPreferences(value: unknown): PlayerPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_PLAYER_PREFERENCES };
  }
  const raw = value as Partial<PlayerPreferences>;
  const rate = typeof raw.playbackRate === 'number' && Number.isFinite(raw.playbackRate)
    ? Math.max(0.25, Math.min(3, raw.playbackRate))
    : DEFAULT_PLAYER_PREFERENCES.playbackRate;
  const fontSize = typeof raw.subtitleFontSize === 'number' && Number.isFinite(raw.subtitleFontSize)
    ? Math.round(Math.max(16, Math.min(48, raw.subtitleFontSize)))
    : DEFAULT_PLAYER_PREFERENCES.subtitleFontSize;
  const subtitlePosition = (
    raw.subtitlePosition === 'top'
    || raw.subtitlePosition === 'center'
    || raw.subtitlePosition === 'bottom'
  ) ? raw.subtitlePosition : DEFAULT_PLAYER_PREFERENCES.subtitlePosition;
  const overlayBackground = typeof raw.subtitleOverlayBackground === 'number'
    && Number.isFinite(raw.subtitleOverlayBackground)
    ? Math.round(Math.max(0, Math.min(80, raw.subtitleOverlayBackground)))
    : DEFAULT_PLAYER_PREFERENCES.subtitleOverlayBackground;
  const dictationMode = raw.dictationMode === true;
  return {
    playbackRate: rate,
    autoPause: raw.autoPause === true,
    loopLine: raw.loopLine === true,
    furigana: raw.furigana === true,
    primarySubs: raw.primarySubs !== false,
    dualSubs: raw.dualSubs !== false,
    dictationMode,
    shadowingMode: !dictationMode && raw.shadowingMode === true,
    volumeNormalization: raw.volumeNormalization === true,
    preferredAudioLanguage: typeof raw.preferredAudioLanguage === 'string'
      ? raw.preferredAudioLanguage.trim().toLowerCase().slice(0, 16)
      : '',
    subtitleFontSize: fontSize,
    subtitlePosition,
    subtitleOverlay: raw.subtitleOverlay !== false,
    subtitleOverlayBackground: overlayBackground,
  };
}

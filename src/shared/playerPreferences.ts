import { SUBTITLE_POSITION_MAX } from './videoCoreStudy';

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
  // The player's own default is the lowest lift (`subtitlePosition: 0`), which is
  // `bottom` in this vocabulary. `center` here made the Media Center claim a
  // position the player never used.
  subtitlePosition: 'bottom',
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
/**
 * The lift the Media Center's `center` choice writes into the player's numeric
 * `subtitlePosition` (0..SUBTITLE_POSITION_MAX): half way up the free band.
 */
export const CENTER_SUBTITLE_LIFT = Math.round(SUBTITLE_POSITION_MAX / 2);

/**
 * What the Media Center writes when the user changes some of its controls —
 * ONLY those keys, in the player's own vocabulary (round-2 audit B).
 *
 * The two surfaces share `jp-media-player-preferences-v1` and each used to
 * write its whole copy on every change, so each reset the other's fields. And
 * two keys collided outright: the Media Center stored `subtitlePosition` as
 * `'top' | 'center' | 'bottom'` where the player stores a number, and its
 * "overlay background" toggle had no effect on the player at all. Here the
 * vertical position becomes the player's `subtitleAtTop` + numeric lift, and
 * the background toggle becomes the player's `subtitleBgOpacity`.
 */
export function playerPreferencesPatch(
  changed: Partial<PlayerPreferences>,
  stored: unknown,
): Record<string, unknown> {
  const base = stored && typeof stored === 'object' && !Array.isArray(stored)
    ? (stored as Record<string, unknown>)
    : {};
  const patch: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changed)) {
    if (key === 'subtitlePosition') {
      if (value === 'top') patch.subtitleAtTop = true;
      else {
        patch.subtitleAtTop = false;
        patch.subtitlePosition = value === 'center' ? CENTER_SUBTITLE_LIFT : 0;
      }
    } else if (key === 'subtitleOverlay') {
      const current = typeof base.subtitleBgOpacity === 'number' ? base.subtitleBgOpacity : 0;
      const wanted = typeof changed.subtitleOverlayBackground === 'number'
        ? changed.subtitleOverlayBackground
        : DEFAULT_PLAYER_PREFERENCES.subtitleOverlayBackground;
      patch.subtitleBgOpacity = value ? (current > 0 ? current : wanted) : 0;
    } else {
      patch[key] = value;
    }
  }
  return patch;
}

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
  // The player's fields first — it owns them — then the legacy string this
  // surface used to store, then the default.
  const stored = value as Record<string, unknown>;
  const subtitlePosition: SubtitleVerticalPosition = stored.subtitleAtTop === true
    ? 'top'
    : typeof stored.subtitlePosition === 'number' && Number.isFinite(stored.subtitlePosition)
      ? (stored.subtitlePosition >= CENTER_SUBTITLE_LIFT / 2 ? 'center' : 'bottom')
      : (
        raw.subtitlePosition === 'top'
        || raw.subtitlePosition === 'center'
        || raw.subtitlePosition === 'bottom'
      ) ? raw.subtitlePosition : DEFAULT_PLAYER_PREFERENCES.subtitlePosition;
  const subtitleOverlay = typeof stored.subtitleBgOpacity === 'number'
    && Number.isFinite(stored.subtitleBgOpacity)
    ? stored.subtitleBgOpacity > 0
    : raw.subtitleOverlay !== false;
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
    subtitleOverlay,
    subtitleOverlayBackground: overlayBackground,
  };
}

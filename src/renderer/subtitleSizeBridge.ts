/**
 * The player's subtitle size, read and written from outside the player.
 *
 * Settings' Theme Studio understands "make the subtitles bigger". That request used
 * to land on a CSS variable nothing read; it now changes the one real setting — the
 * player's `subtitleFontSize` in `jp-media-player-preferences-v1` — through the
 * player's own normalizer, so the stored value is always one the player accepts.
 * An open player takes the change live through `SUBTITLE_FONT_SIZE_EVENT`.
 */
import {
  PLAYER_PREFERENCES_STORAGE_KEY,
  normalizeVideoCoreStudyPreferences,
} from '../shared/videoCoreStudy';

export const SUBTITLE_FONT_SIZE_EVENT = 'jp-subtitle-font-size-changed';

function readPreferences() {
  try {
    return normalizeVideoCoreStudyPreferences(
      JSON.parse(localStorage.getItem(PLAYER_PREFERENCES_STORAGE_KEY) ?? 'null'),
    );
  } catch {
    return normalizeVideoCoreStudyPreferences(null);
  }
}

export function readPlayerSubtitleFontSize(): number {
  return readPreferences().subtitleFontSize;
}

/** Writes the size (clamped by the player's normalizer) and returns what was stored. */
export function writePlayerSubtitleFontSize(size: number): number {
  const next = normalizeVideoCoreStudyPreferences({ ...readPreferences(), subtitleFontSize: size });
  try {
    localStorage.setItem(PLAYER_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Storage full: the open player still takes it from the event below. */
  }
  window.dispatchEvent(
    new CustomEvent<{ subtitleFontSize: number }>(SUBTITLE_FONT_SIZE_EVENT, {
      detail: { subtitleFontSize: next.subtitleFontSize },
    }),
  );
  return next.subtitleFontSize;
}
